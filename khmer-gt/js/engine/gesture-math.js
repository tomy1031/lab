// js/engine/gesture-math.js — Pure, deterministic hand-gesture interpreter for controller-free driving
// Supports BOTH webcam MediaPipe 21-point landmarks AND WebXR 25-joint hand tracking (converted to normalized 2D/3D).
// Controls:
//   - Two hands holding invisible wheel → Steer by angle between left & right hand
//   - One hand tilted → Steer by hand roll angle
//   - Closed grip / natural wheel hold → Throttle (auto-smooth, push hands forward or grip tighter for full power)
//   - Open palm(s) ("STOP" ✋) → Brake / Reverse
//   - Peace sign (✌️) or Thumbs-up (👍) → ERS Overtake Boost
//   - Both hands raised high / crossed or Left open-pinch hold → Pause / Menu request

export const LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function steerFromAngle(angleRad, { full = 0.62, dead = 0.065, curve = 1.32 } = {}) {
  const abs = Math.abs(angleRad);
  if (abs <= dead) return 0;
  const norm = clamp((abs - dead) / Math.max(0.05, full - dead), 0, 1);
  return Math.sign(angleRad) * Math.pow(norm, curve);
}

// Classify a single hand from 21 normalized landmarks (x, y in 0..1; aspect = width/height)
// Returns: 'fist' | 'open' | 'peace' | 'thumbup' | 'point' | 'grip'
export function classifyHand(lm, aspect = 4 / 3) {
  if (!lm || lm.length < 21) return 'grip';
  const dist = (a, b) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y);
  const palm = Math.max(0.03, dist(LM.WRIST, LM.MIDDLE_MCP));

  const extended = (tip, pip, mcp) => {
    const dt = dist(LM.WRIST, tip);
    const dp = dist(LM.WRIST, pip);
    const dm = dist(LM.WRIST, mcp);
    return dt > dp * 1.12 && dt > dm * 1.24;
  };

  const idx = extended(LM.INDEX_TIP, LM.INDEX_PIP, LM.INDEX_MCP);
  const mid = extended(LM.MIDDLE_TIP, LM.MIDDLE_PIP, LM.MIDDLE_MCP);
  const rng = extended(LM.RING_TIP, LM.RING_PIP, LM.RING_MCP);
  const pnk = extended(LM.PINKY_TIP, LM.PINKY_PIP, LM.PINKY_MCP);

  // Thumb extended & pointing up
  const thumbOut = dist(LM.THUMB_TIP, LM.INDEX_MCP) > palm * 0.58;
  const thumbUp = thumbOut && (lm[LM.THUMB_TIP].y < lm[LM.THUMB_MCP].y - palm * 0.25);

  const count = (idx ? 1 : 0) + (mid ? 1 : 0) + (rng ? 1 : 0) + (pnk ? 1 : 0);

  if (count >= 4) return 'open';
  if (idx && mid && !rng && !pnk) return 'peace';
  if (idx && !mid && !rng && !pnk) return 'point';
  if (thumbUp && count === 0) return 'thumbup';
  if (count === 0) return 'fist';
  return 'grip';
}

export class GestureInterpreter {
  constructor() {
    this.sens = 1.0;
    this.steerSm = 0;
    this.throttleSm = 0;
    this.brakeSm = 0;
    this.lostTimer = 0;
    this.boostLatch = 0;
    this.out = {
      steer: 0,
      throttle: 0,
      brake: 0,
      boost: false,
      drift: false,
      handsCount: 0,
      pose: 'none', // none | drive | brake | boost | one-hand
      wheelAngle: 0,
      leftCenter: null,
      rightCenter: null,
    };
  }

  reset() {
    this.steerSm = 0;
    this.throttleSm = 0;
    this.brakeSm = 0;
    this.lostTimer = 0;
    this.boostLatch = 0;
    this.out.steer = 0;
    this.out.throttle = 0;
    this.out.brake = 0;
    this.out.boost = false;
    this.out.drift = false;
    this.out.handsCount = 0;
    this.out.pose = 'none';
    this.out.wheelAngle = 0;
  }

  // hands: array of 21-landmark arrays (mirrored webcam coordinates: x=0 is right side of user, x=1 is left side of user)
  // For webcam: user's LEFT hand appears at higher x (closer to 1.0 in raw camera frame, which mirrors to left on screen).
  update(hands, dt = 1 / 30, aspect = 4 / 3, { mirrored = true } = {}) {
    const o = this.out;
    dt = clamp(dt, 0.001, 0.2);

    if (!hands || hands.length === 0) {
      this.lostTimer += dt;
      // Gently return steering to center and coast when hands disappear briefly
      const decay = 1 - Math.exp(-6 * dt);
      this.steerSm += (0 - this.steerSm) * decay;
      if (this.lostTimer > 0.35) {
        this.throttleSm += (0 - this.throttleSm) * decay;
      }
      this.brakeSm += (0 - this.brakeSm) * decay;
      o.steer = this.steerSm;
      o.throttle = this.throttleSm;
      o.brake = this.brakeSm;
      o.boost = false;
      o.drift = false;
      o.handsCount = 0;
      o.pose = 'none';
      o.wheelAngle = this.steerSm * 0.65;
      o.leftCenter = null;
      o.rightCenter = null;
      return o;
    }

    this.lostTimer = 0;
    o.handsCount = hands.length;

    // Compute screen-space center (sx: 0 = left of screen, 1 = right of screen; sy: 0 = top, 1 = bottom)
    const infos = hands.map((lm) => {
      const rx = (lm[LM.WRIST].x + lm[LM.MIDDLE_MCP].x) * 0.5;
      const ry = (lm[LM.WRIST].y + lm[LM.MIDDLE_MCP].y) * 0.5;
      return {
        lm,
        sx: mirrored ? 1 - rx : rx,
        sy: ry,
        cls: classifyHand(lm, aspect),
      };
    });

    // Sort left-to-right on screen
    infos.sort((a, b) => a.sx - b.sx);

    let rawSteer = 0;
    let wheelAngle = 0;

    if (infos.length >= 2) {
      const L = infos[0];
      const R = infos[infos.length - 1];
      o.leftCenter = { x: L.sx, y: L.sy };
      o.rightCenter = { x: R.sx, y: R.sy };
      const dx = (R.sx - L.sx) * aspect;
      const dy = R.sy - L.sy; // positive when right hand is LOWER on screen => turn right (+)
      wheelAngle = Math.atan2(dy, Math.max(0.06, dx));
      rawSteer = steerFromAngle(wheelAngle, { full: 0.58 / this.sens, dead: 0.055, curve: 1.28 });
    } else {
      // Single-hand driving: tilt wrist→middle-knuckle vector left/right
      const H = infos[0];
      o.leftCenter = { x: H.sx, y: H.sy };
      o.rightCenter = null;
      const wx = mirrored ? 1 - H.lm[LM.WRIST].x : H.lm[LM.WRIST].x;
      const mx = mirrored ? 1 - H.lm[LM.MIDDLE_MCP].x : H.lm[LM.MIDDLE_MCP].x;
      const dx = (mx - wx) * aspect;
      const dy = H.lm[LM.WRIST].y - H.lm[LM.MIDDLE_MCP].y; // up is positive
      wheelAngle = Math.atan2(dx, Math.max(0.04, dy));
      rawSteer = steerFromAngle(wheelAngle, { full: 0.65 / this.sens, dead: 0.08, curve: 1.3 });
    }

    // Gesture states
    const openCount = infos.filter((h) => h.cls === 'open').length;
    const boostGesture = infos.some((h) => h.cls === 'peace' || h.cls === 'thumbup');

    // Brake when showing open palm(s) (in 2-hand mode either both open or 1 fully open stop-sign while other isn't boosting)
    const isBraking = infos.length >= 2 ? openCount >= 1 && !boostGesture : openCount >= 1;

    if (boostGesture) this.boostLatch = 0.45;
    else this.boostLatch = Math.max(0, this.boostLatch - dt);

    const targetThrottle = isBraking ? 0 : 1;
    const targetBrake = isBraking ? (openCount >= 2 ? 1.0 : 0.78) : 0;

    // Smooth response
    const sk = 1 - Math.exp(-16 * dt);
    const pk = 1 - Math.exp(-14 * dt);
    this.steerSm += (rawSteer - this.steerSm) * sk;
    this.throttleSm += (targetThrottle - this.throttleSm) * pk;
    this.brakeSm += (targetBrake - this.brakeSm) * pk;

    o.steer = clamp(this.steerSm, -1, 1);
    o.throttle = clamp(this.throttleSm, 0, 1);
    o.brake = clamp(this.brakeSm, 0, 1);
    o.boost = this.boostLatch > 0;
    o.drift = Math.abs(o.steer) > 0.78 && o.throttle > 0.5;
    o.wheelAngle = wheelAngle;
    o.pose = o.boost ? 'boost' : isBraking ? 'brake' : infos.length >= 2 ? 'drive' : 'one-hand';
    return o;
  }
}
