// engine/gesture-math.js — turns MediaPipe hand landmarks into driving controls. Pure functions (no DOM),
// so tests can feed synthetic hands. Landmarks are in camera-image space (x right, y down, 0…1),
// NOT mirrored: the player's right hand appears on the image's left side.
//
//   two hands  → an imaginary steering wheel: the tilt of the line between the palms steers
//   one hand   → tilt the hand like a wheel (roll of wrist → middle-finger knuckle)
//   ✌ peace    → use item
//   hands seen → accelerate; no hands → ease off and brake

export const LM = { WRIST: 0, THUMB_TIP: 4, THUMB_IP: 3, INDEX_MCP: 5, INDEX_PIP: 6, INDEX_TIP: 8, MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_TIP: 12, RING_PIP: 14, RING_TIP: 16, PINKY_MCP: 17, PINKY_PIP: 18, PINKY_TIP: 20 };

const dist = (a, b, ax = 1) => Math.hypot((a.x - b.x) * ax, a.y - b.y);

// which fingers are stretched out. aspect = image width / height (to measure in square units)
export function fingers(lm, aspect = 4 / 3) {
  const w = lm[LM.WRIST];
  const ext = (tip, pip) => dist(lm[tip], w, aspect) > dist(lm[pip], w, aspect) * 1.12;
  const palm = dist(lm[LM.INDEX_MCP], lm[LM.PINKY_MCP], aspect);
  return {
    thumb: dist(lm[LM.THUMB_TIP], lm[LM.PINKY_MCP], aspect) > Math.max(palm * 1.25, dist(lm[LM.THUMB_IP], lm[LM.PINKY_MCP], aspect) * 1.05),
    index: ext(LM.INDEX_TIP, LM.INDEX_PIP),
    middle: ext(LM.MIDDLE_TIP, LM.MIDDLE_PIP),
    ring: ext(LM.RING_TIP, LM.RING_PIP),
    pinky: ext(LM.PINKY_TIP, LM.PINKY_PIP),
  };
}

export function classify(lm, aspect = 4 / 3) {
  const f = fingers(lm, aspect);
  const n = (f.index ? 1 : 0) + (f.middle ? 1 : 0) + (f.ring ? 1 : 0) + (f.pinky ? 1 : 0);
  if (f.index && f.middle && !f.ring && !f.pinky) return 'peace';
  if (n >= 4) return 'open';
  if (n === 0) return 'fist';
  if (f.index && n === 1) return 'point';
  return 'other';
}

export function palmCenter(lm) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0, y = 0;
  for (const i of ids) { x += lm[i].x; y += lm[i].y; }
  return { x: x / ids.length, y: y / ids.length };
}

// signed steering angle in radians, positive = turn right (clockwise as the player sees it)
export function wheelAngle(hands, aspect = 4 / 3) {
  if (hands.length >= 2) {
    const c = hands.slice(0, 2).map(palmCenter).sort((a, b) => a.x - b.x);
    const A = c[0], B = c[1]; // A = image-left = player's right hand
    // turning right: player's left hand (B) rises, right hand (A) drops
    return Math.atan2(-(B.y - A.y), (B.x - A.x) * aspect);
  }
  if (hands.length === 1) {
    const lm = hands[0];
    const w = lm[LM.WRIST], m = lm[LM.MIDDLE_MCP];
    // upright hand = 0; fingers leaning to the player's right (image left, -x) = turn right
    return -Math.atan2((m.x - w.x) * aspect, -(m.y - w.y));
  }
  return 0;
}

// map an angle to −1…1 with a dead zone and a soft curve
export function steerFromAngle(a, { dead = 0.07, full = 0.6, curve = 1.35 } = {}) {
  const s = Math.sign(a), m = Math.abs(a);
  if (m < dead) return 0;
  const t = Math.min(1, (m - dead) / (full - dead));
  return s * Math.pow(t, curve);
}

// stateful interpreter: smoothing, the item gesture held for a few frames, auto-drift for big turns
export class GestureInterpreter {
  constructor(opts = {}) {
    this.opts = { sensitivity: 1, ...opts };
    this.steer = 0;
    this.peaceFrames = 0;
    this.itemCooldown = 0;
    this.seenT = 0; this.lostT = 1;
    this.hardT = 0;
    this.out = { steer: 0, throttle: 0, brake: 0, drift: false, item: false, hands: 0, poses: [], angle: 0, active: false };
  }

  // hands: array of landmark arrays; dt in seconds
  update(hands, dt, aspect = 4 / 3) {
    const o = this.out;
    o.hands = hands.length;
    o.poses = hands.map((h) => classify(h, aspect));
    o.item = false;
    this.itemCooldown = Math.max(0, this.itemCooldown - dt);
    if (hands.length) { this.seenT += dt; this.lostT = 0; } else { this.lostT += dt; this.seenT = 0; }
    const a = wheelAngle(hands, aspect);
    o.angle = a;
    const full = 0.62 / this.opts.sensitivity;
    const target = hands.length ? steerFromAngle(a, { full, dead: hands.length === 1 ? 0.12 : 0.07 }) : this.steer * 0.9;
    const k = 1 - Math.exp(-14 * dt);
    this.steer += (target - this.steer) * k;
    o.steer = Math.max(-1, Math.min(1, this.steer));
    // throttle while at least one hand is visible (a short grace period hides tracking dropouts)
    o.active = hands.length > 0 || this.lostT < 0.35;
    o.throttle = o.active ? 1 : 0;
    o.brake = this.lostT > 1.0 ? 0.6 : 0;
    // item: peace sign on any hand for ~4 frames
    if (o.poses.includes('peace')) this.peaceFrames++; else this.peaceFrames = 0;
    if (this.peaceFrames >= 4 && this.itemCooldown <= 0) { o.item = true; this.itemCooldown = 0.9; this.peaceFrames = -20; }
    // auto drift: hold a big turn → drift (and a mini-turbo when you straighten out)
    if (Math.abs(o.steer) > 0.62) this.hardT += dt; else this.hardT = Math.max(0, this.hardT - dt * 3);
    if (!o.drift && this.hardT > 0.3) o.drift = true;
    if (o.drift && Math.abs(o.steer) < 0.22) o.drift = false;
    return o;
  }
}
