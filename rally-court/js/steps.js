// js/steps.js — stepping in place and arm swinging, read from the headset and the two controllers.
//
// Steps: each foot strike makes the head dip. The signal is the "neck point" (10 cm below, 8 cm behind the
// eyes, so nods and look-arounds barely move it), low-passed; a valley that is deep enough (≥ 6–13 mm by
// sensitivity), fast enough on the way down and not too soon after the last one is a step. Cadence = 60 / the
// median of the last four intervals. The same tuned numbers as AETHERWALK (this repository), which was
// play-tested on Quest.
// Arms: running arms swing forward and back in anti-phase. Each turn of the leading hand at the front or the
// back (≥ 12 cm of travel) is one arm step. A racket stroke (hand faster than 4 m/s) is not an arm step.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ema = (tau, dt) => 1 - Math.exp(-dt / tau);
const median = (arr, n) => { const s = arr.slice(-n).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

export const STEP = {
  neckDown: 0.10, neckBack: 0.08,
  tauLP: 0.04, tauVy: 0.03,
  aMin: { high: 0.006, mid: 0.009, low: 0.013 },
  minDescent: 0.06, minInterval: 0.22, maxAmp: 0.12,
  nodPitchRate: 60 * Math.PI / 180,
  lateralSpeed: 0.9, lateralHold: 0.3,
  confirmWindow: 1.25,
  armAmp: 0.12, armMaxSpeed: 4.0,
};

export class StepDetector {
  constructor(opt = {}) {
    this.opt = { sensitivity: 'mid', ...opt };
    this.reset();
  }
  reset() {
    this.init = false; this.t = 0;
    this.yLP = 0; this.prevYLP = 0; this.vy = 0;
    this.dir = 1; this.maxY = -Infinity; this.minY = Infinity; this.peakY = 0; this.descPeak = 0; this.pitchMax = 0;
    this.pitch = 0; this.pitchRate = 0; this.hx = 0; this.hz = 0; this.hSpeed = 0; this.suppressUntil = -1;
    this.lastStepT = -1e9; this.firstStepT = -1e9; this.intervals = []; this.state = 'idle';
    this.cadence = 0; this.steps = 0; this.lastAmp = 0;
    this.arm = [this.armState(), this.armState()];
    this.armIntervals = []; this.lastArmStepT = -1e9; this.armCadence = 0; this.anti = 0; this.armSteps = 0;
    this.sim = 0; this.simNext = 0;
  }
  armState() { return { dir: 0, hi: 0, lo: 0, lastRev: -1e9, p: 0, px: 0, py: 0, pz: 0, v: 0, ok: false, init: false }; }
  get moving() { return this.state !== 'idle'; }
  get armMoving() { return this.armCadence > 0; }

  stopTimeout(intervals) {
    const m = intervals.length ? median(intervals, 4) : 0.6;
    return Math.max(clamp(1.6 * m, 0.45, 0.9), m + 0.25);
  }

  registerStep(t, amp) {
    const interval = t - this.lastStepT;
    const fresh = this.state === 'idle' || interval > Math.max(STEP.confirmWindow, this.stopTimeout(this.intervals) + 0.1);
    this.lastStepT = t; this.steps++; this.lastAmp = amp;
    if (fresh) { this.state = 'provisional'; this.firstStepT = t; this.intervals.length = 0; }
    else {
      if (interval >= STEP.minInterval) { this.intervals.push(interval); if (this.intervals.length > 8) this.intervals.shift(); }
      this.state = 'moving';
    }
    this.cadence = this.intervals.length ? clamp(60 / median(this.intervals, 4), 0, 260) : 100;
  }

  /**
   * dt: seconds. head: { x, y, z (room space, m), pitch (rad, + up) }.
   * hands: [{ x, y, z, ok }, …] in room space (or null), yaw: body facing (rad) for the arm-swing axis.
   */
  update(dt, head, hands, yaw = 0) {
    if (dt <= 0) return;
    const rdt = clamp(dt, 1e-3, 0.1);
    this.t += rdt;
    const now = this.t;
    if (this.sim > 0) {
      while (now >= this.simNext) { this.registerStep(this.simNext, 0.02); this.simNext += 60 / this.sim; }
    } else this.updateHead(now, rdt, head);
    if (hands) this.updateArms(now, rdt, hands, yaw);
    // stop
    if (this.state === 'provisional' && now - this.firstStepT > STEP.confirmWindow) { this.state = 'idle'; this.cadence = 0; }
    else if (this.state === 'moving' && now - this.lastStepT > this.stopTimeout(this.intervals)) { this.state = 'idle'; this.cadence = 0; }
    if (this.armCadence > 0 && now - this.lastArmStepT > this.stopTimeout(this.armIntervals)) { this.armCadence = 0; this.armIntervals.length = 0; }
  }

  updateHead(now, rdt, head) {
    const p = head.pitch || 0;
    const y = head.y - STEP.neckDown * Math.cos(p) - STEP.neckBack * Math.sin(p);
    if (!this.init) {
      this.init = true; this.yLP = this.prevYLP = this.maxY = this.minY = y; this.dir = 1;
      this.hx = head.x; this.hz = head.z; this.pitch = p;
      return;
    }
    this.yLP += (y - this.yLP) * ema(STEP.tauLP, rdt);
    const vyRaw = (this.yLP - this.prevYLP) / rdt;
    this.prevYLP = this.yLP;
    this.vy += (vyRaw - this.vy) * ema(STEP.tauVy, rdt);
    this.pitchRate += (Math.abs(p - this.pitch) / rdt - this.pitchRate) * ema(0.04, rdt);
    this.pitch = p;
    const dx = head.x - this.hx, dz = head.z - this.hz;
    this.hx = head.x; this.hz = head.z;
    this.hSpeed += (Math.hypot(dx, dz) / rdt - this.hSpeed) * ema(0.08, rdt);
    if (this.hSpeed > STEP.lateralSpeed) this.suppressUntil = now + STEP.lateralHold;  // a real side step / lunge
    const aMin = STEP.aMin[this.opt.sensitivity] || STEP.aMin.mid;
    const h = Math.max(0.0018, 0.3 * aMin);
    if (this.dir > 0) {
      if (this.yLP > this.maxY) this.maxY = this.yLP;
      if (this.yLP < this.maxY - h) { this.peakY = this.maxY; this.dir = -1; this.minY = this.yLP; this.descPeak = Math.max(0, -this.vy); this.pitchMax = this.pitchRate; }
    } else {
      if (this.yLP < this.minY) this.minY = this.yLP;
      if (-this.vy > this.descPeak) this.descPeak = -this.vy;
      if (this.pitchRate > this.pitchMax) this.pitchMax = this.pitchRate;
      if (this.yLP > this.minY + h) {
        const A = this.peakY - this.minY;
        const ok = now >= this.suppressUntil && A >= aMin && A <= STEP.maxAmp && this.descPeak >= STEP.minDescent &&
          now - this.lastStepT >= STEP.minInterval && !(this.pitchMax > STEP.nodPitchRate && A < 2 * aMin);
        if (ok) this.registerStep(now, A);
        this.dir = 1; this.maxY = this.yLP;
      }
    }
  }

  updateArms(now, rdt, hands, yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);     // forward on the floor for facing yaw (0 = −z)
    let swinging = 0;
    for (let k = 0; k < 2; k++) {
      const h = hands[k], a = this.arm[k];
      if (!h || !h.ok) { a.ok = false; a.dir = 0; a.init = false; continue; }
      const speed = a.init ? Math.hypot(h.x - a.px, h.y - a.py, h.z - a.pz) / rdt : 0;
      a.px = h.x; a.py = h.y; a.pz = h.z; a.init = true; a.ok = true;
      const p = h.x * fx + h.z * fz;
      a.v = (p - a.p) / rdt; a.p = p;
      if (speed > STEP.armMaxSpeed) { a.dir = 0; a.lastRev = -1e9; continue; }   // a racket stroke
      if (a.dir === 0) { a.dir = 1; a.hi = a.lo = p; }
      if (a.dir > 0) {
        if (p > a.hi) a.hi = p;
        if (p < a.hi - 0.03) { const amp = a.hi - a.lo; a.dir = -1; a.lo = p; if (amp >= STEP.armAmp) this.armRev(now, k); }
      } else {
        if (p < a.lo) a.lo = p;
        if (p > a.lo + 0.03) { const amp = a.hi - a.lo; a.dir = 1; a.hi = p; if (amp >= STEP.armAmp) this.armRev(now, k); }
      }
      if (now - a.lastRev < 0.9) swinging++;
    }
    const v0 = this.arm[0].v, v1 = this.arm[1].v;
    this.anti += ((v0 * v1 < -0.01 ? 1 : v0 * v1 > 0.01 ? -1 : 0) - this.anti) * ema(0.4, rdt);
    this.armSwinging = swinging === 2 && this.anti > 0.1;
  }
  armRev(now, k) {
    this.arm[k].lastRev = now;
    // count one hand (the left, or whichever is tracked) so anti-phase arms make one step per reversal
    const lead = this.arm[0].ok ? 0 : 1;
    if (k !== lead) return;
    const other = this.arm[1 - k];
    if (other.ok && now - other.lastRev > 1.0) return;             // only one arm moving: not running arms
    const interval = now - this.lastArmStepT;
    if (interval < STEP.minInterval) return;
    this.lastArmStepT = now; this.armSteps++;
    if (interval < 1.25) { this.armIntervals.push(interval); if (this.armIntervals.length > 8) this.armIntervals.shift(); }
    else this.armIntervals.length = 0;
    this.armCadence = this.armIntervals.length ? clamp(60 / median(this.armIntervals, 4), 0, 260) : 0;
  }

  /** synthetic stepping (PC keys, tests): spm > 0 to step, 0 to stop */
  simulate(spm) {
    if (spm > 0 && !(this.sim > 0)) this.simNext = this.t;
    this.sim = spm;
  }

  /**
   * 0…1 share of the top speed: from the stepping cadence (cadMax = the cadence for top speed) and the arm
   * swing (armWeight 0…1.5 scales its share; both together add a little).
   */
  effort(cadMax = 170, armWeight = 1) {
    const f = (c) => clamp((c - 40) / Math.max(20, cadMax - 40), 0.12, 1);
    const eStep = this.state === 'idle' ? 0 : f(this.cadence) * (this.state === 'provisional' ? 0.6 : 1);
    const eArm = this.armCadence > 0 ? clamp(f(this.armCadence) * armWeight, 0, 1) : 0;
    return clamp(Math.max(eStep, eArm) + 0.15 * Math.min(eStep, eArm), 0, 1);
  }
}
