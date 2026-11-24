// vr/locomotion.js — walking by moving your body (DESIGN §27.5): pure detectors, no DOM / three.js, so tests can
// feed them synthetic motion.
//
//   StepDetector      walking in place (足踏み): the head bobs once per footfall (2–5 cm, ~1.3–3 Hz).
//                     feed the head height (m, in the room) every frame → { walking, speed 0–1, run, cadence }
//   ArmSwingDetector  arm swinging (腕振り): the two hands swing in opposite directions, like walking.
//                     feed the signed swing speed of each hand every frame (same axis, same units)
//                     → { active, speed 0–1, run, energy }
//   swingAxis(...)    the signed swing speed of a VR controller: forward + up, relative to the head's yaw (m/s)
//   CameraArmWalk     the camera hands (js/gesture/motion.js): two hands swung up and down in turn → move axes
//
// Both detectors need a rhythm, not a single movement: a nod, a crouch, a single swing of the axe do not walk.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class StepDetector {
  constructor(o = {}) {
    this.o = {
      thr: 0.006,        // m from the moving average: the head is up / down
      minP2P: 0.015,     // m: a footfall moves the head at least this much (peak to trough)
      maxP2P: 0.12,      // m: more is a crouch or a jump, not a step
      minGap: 0.22,      // s between footfalls (≈ 4.5 steps / s at most)
      maxGap: 1.1,       // s: slower than this is standing
      need: 2,           // footfalls in a rhythm before walking starts
      walkCadence: 1.8,  // steps / s for full walking speed
      runCadence: 2.7,   // steps / s and up: running (jogging in place)
      tau: 0.9,          // s: the moving average of the head height
      maxPitch: 0.2,     // rad: the head tilting more than this within one bob is a nod, not a step
      ...o,
    };
    this.reset();
  }

  reset() { this.t = 0; this.base = null; this.phase = 0; this.hi = 0; this.pMin = Infinity; this.pMax = -Infinity; this.last = -9; this.streak = 0; this.cadence = 0; this.until = 0; this.steps = 0; }

  /** y: head height (m), pitch: head pitch (rad, optional), sens: sensitivity ×(0.5–2) */
  update(dt, y, pitch = 0, sens = 1) {
    const o = this.o;
    this.t += dt;
    if (this.base == null || !Number.isFinite(this.base)) this.base = y;
    this.base += (y - this.base) * (1 - Math.exp(-dt / o.tau));
    const d = y - this.base, thr = o.thr / sens;
    this.pMin = Math.min(this.pMin, pitch); this.pMax = Math.max(this.pMax, pitch);
    if (d > thr) {
      if (this.phase !== 1) { this.phase = 1; this.hi = d; } else this.hi = Math.max(this.hi, d);
    } else if (d < -thr && this.phase === 1) {
      // falling through the middle: one footfall (the head's tilt over the whole bob tells a nod apart)
      this.phase = -1;
      const p2p = this.hi - d, gap = this.t - this.last, tilt = this.pMax - this.pMin;
      this.pMin = this.pMax = pitch;
      const ok = p2p >= o.minP2P / sens && p2p <= o.maxP2P && tilt < o.maxPitch;
      if (ok && gap >= o.minGap) {
        if (gap <= o.maxGap) { this.streak++; this.cadence = this.cadence ? this.cadence * 0.5 + (1 / gap) * 0.5 : 1 / gap; }
        else { this.streak = 1; this.cadence = 0; }
        this.last = this.t; this.steps++;
        if (this.streak >= o.need) this.until = this.t + clamp(1.5 / Math.max(this.cadence, 0.9), 0.5, 1.2);
      }
    } else if (d < -thr) this.phase = -1;
    if (this.t - this.last > o.maxGap) { this.streak = 0; }
    const walking = this.t < this.until;
    if (!walking && this.streak === 0) this.cadence = 0;
    return { walking, speed: walking ? clamp(this.cadence / o.walkCadence, 0.45, 1) : 0, run: walking && this.cadence >= o.runCadence, cadence: this.cadence, steps: this.steps };
  }
}

export class ArmSwingDetector {
  constructor(o = {}) {
    this.o = {
      minV: 0.35,   // each hand must move at least this fast (units / s)
      on: 0.55,     // energy to start walking
      full: 1.5,    // energy for full walking speed
      run: 1.8,     // energy for running
      tau: 0.3,     // s: smoothing
      ...o,
    };
    this.e = 0;
  }

  reset() { this.e = 0; }

  /** sL, sR: signed swing speeds of the left and right hand; sens: sensitivity ×(0.5–2) */
  update(dt, sL, sR, sens = 1) {
    const o = this.o;
    const alt = sL * sR < 0 && Math.min(Math.abs(sL), Math.abs(sR)) * sens > o.minV;
    const x = alt ? ((Math.abs(sL) + Math.abs(sR)) / 2) * sens : 0;
    // rises quickly, fades a little slower (the hands pass through zero speed at the end of each swing)
    const k = 1 - Math.exp(-dt / (x > this.e ? o.tau * 0.6 : o.tau * 1.3));
    this.e += (x - this.e) * k;
    const active = this.e > o.on;
    return { active, speed: active ? clamp(0.4 + ((this.e - o.on) / (o.full - o.on)) * 0.6, 0.4, 1) : 0, run: this.e > o.run, energy: this.e };
  }
}

/** a controller's signed swing speed (m/s): forward + up, in the frame of the head's yaw */
export function swingAxis(v, yaw) {
  const fwd = -(v.x * Math.sin(yaw) + v.z * Math.cos(yaw));
  return fwd + v.y;
}

/** the camera hands: two hands swung up and down in turn walk forward (merged into the keyboard / touch axes) */
export class CameraArmWalk {
  constructor() { this.det = new ArmSwingDetector({ minV: 1.2, on: 1.9, full: 4.5, run: 7.5, tau: 0.3 }); this.state = { active: false, speed: 0, run: false, energy: 0 }; }

  /** hands: game.hands.motion.state.hands ({ x, vy } in palm sizes / s) */
  update(dt, hands, sens = 1) {
    if (!hands || hands.length < 2) { this.state = this.det.update(dt, 0, 0, sens); return this.state; }
    const [a, b] = hands[0].x < hands[1].x ? [hands[0], hands[1]] : [hands[1], hands[0]];
    this.state = this.det.update(dt, -(a.vy || 0), -(b.vy || 0), sens);
    return this.state;
  }

  get active() { return this.state.active; }

  /** keyboard / touch axes + walking by the arms (the keys win when they are used) */
  merge(ax) {
    const s = this.state;
    if (!s.active || Math.hypot(ax.x || 0, ax.y || 0) > 0.2) return ax;
    return { ...ax, y: Math.max(ax.y || 0, s.speed), run: !!ax.run || s.run };
  }
}
