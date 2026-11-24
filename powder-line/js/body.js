// js/body.js — reads your body from the headset and controllers and turns it into riding intent.
// No three.js: plain numbers in, plain numbers out (tested in Node).
//
// Calibration ("stand naturally, look down the slope") records where your feet are (under your head),
// how tall you stand and which way is downhill. From then on, in that frame:
//   lean     head displaced sideways over the feet → body lean angle φ = asin(dx / (0.92·height))
//   brake    head pulled back toward the uphill side (sit back / weight on the back foot)
//   crouch   head lower than standing (tuck)
//   pop      the head rising fast after a crouch (extension) → ollie, the moment it happens
//   absorb   the head dropping fast (knees bending) → soft landing
//   spin     how far your head has turned since take-off (unwrapped, so 720° is 720°)
//   grab     a hand below ~40% of your height with the grip held, while in the air
// Nothing here moves the camera: the headset alone does that. The game only moves the ground under you.
import { clamp } from './course.js';

export const BODY = {
  pivot: 0.92, // lean lever: ankles to head as a fraction of standing height
  dead: 0.012, // m of sway that does not steer
  crouchDead: 0.03, crouchFull: 0.22, // fractions of standing height
  popVy: 0.55, popRise: 0.04, popCool: 0.35, // m/s, m, s
  brakeStart: 0.07, brakeFull: 0.2, // m behind the centre
  grabBelow: 0.4, // a hand below 40% of standing height
  drift: 25, // s: the centre slowly follows you while you stand still in the middle (you drift in a room)
  tau: 0.03, // s: smoothing of the head position (latency stays under ~2 frames)
};

const lp = (prev, next, dt, tau) => prev + (next - prev) * (1 - Math.exp(-dt / tau));
export const GRABS = {
  regular: { front: 'L' }, goofy: { front: 'R' }, forward: { front: 'L' },
};

export class Body {
  constructor() {
    this.cal = null;
    this.reset();
  }

  reset() {
    this.f = null; // filtered head
    this.vy = 0;
    this.hist = []; // [t, y] of the filtered head height, last 0.6 s
    this.downHist = []; // [t, downward speed]
    this.t = 0;
    this.cool = 0;
    this.latched = false;
    this.yawU = 0;
    this.yawPrev = null;
    this.spinStart = 0;
    this.wasAir = false;
    this.out = { lean: 0, crouch: 0, brake: 0, pop: 0, spin: 0, grab: null, absorb: 0, across: 0, along: 0, height: 0 };
  }

  // head = { x, y, z, yaw } in the play space (metres; yaw: 0 = looking toward -z, + = turned left)
  calibrate(head) {
    this.cal = { x: head.x, z: head.z, h: Math.max(1.0, head.y), yaw: head.yaw };
    this.reset();
  }

  // position in the calibrated frame: across (+ = right of downhill), along (+ = downhill)
  frame(x, z) {
    const c = this.cal, dx = x - c.x, dz = z - c.z;
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    return { across: dx * cs - dz * sn, along: -dx * sn - dz * cs };
  }
  // the inverse: a point in the calibrated frame → play space
  toPlay(across, along) {
    const c = this.cal, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    return { x: c.x + across * cs - along * sn, z: c.z - across * sn - along * cs };
  }

  // hands: [{ side: 'L'|'R', x, y, z, grip, tracked }]; air: is the rider in the air now;
  // opts: { stance, jump: 'both'|'body'|'button' }
  update(dt, head, hands, air, opts = {}) {
    const o = this.out;
    o.pop = 0;
    if (!this.cal) return o;
    dt = Math.max(1e-4, Math.min(dt, 0.1));
    this.t += dt;
    const B = BODY, c = this.cal;
    // smoothed head
    if (!this.f) this.f = { x: head.x, y: head.y, z: head.z };
    const yPrev = this.f.y;
    this.f.x = lp(this.f.x, head.x, dt, B.tau);
    this.f.z = lp(this.f.z, head.z, dt, B.tau);
    this.f.y = lp(this.f.y, head.y, dt, B.tau);
    this.vy = lp(this.vy, (this.f.y - yPrev) / dt, dt, B.tau);
    this.hist.push([this.t, this.f.y]);
    while (this.hist.length && this.hist[0][0] < this.t - 0.6) this.hist.shift();
    this.downHist.push([this.t, -this.vy]);
    while (this.downHist.length && this.downHist[0][0] < this.t - 0.2) this.downHist.shift();

    // lean and brake
    const { across, along } = this.frame(this.f.x, this.f.z);
    o.across = across; o.along = along; o.height = this.f.y;
    const a = Math.sign(across) * Math.max(0, Math.abs(across) - B.dead);
    o.lean = Math.asin(clamp(a / (B.pivot * c.h), -0.9, 0.9));
    o.brake = clamp((-along - B.brakeStart) / (B.brakeFull - B.brakeStart), 0, 1);
    // crouch
    o.crouch = clamp((c.h - this.f.y - B.crouchDead * c.h) / (B.crouchFull * c.h), 0, 1);
    // the centre follows you very slowly while you stand still in the middle
    if (!air && Math.abs(across) < 0.04 && Math.abs(along) < 0.05 && o.crouch < 0.1) {
      const k = dt / B.drift;
      c.x += (this.f.x - c.x) * k; c.z += (this.f.z - c.z) * k;
    }

    // pop: the head rising fast after going down
    if (this.cool > 0) this.cool -= dt;
    if (this.latched && this.vy < 0.15) this.latched = false;
    if (opts.jump !== 'button' && !air && !this.latched && this.cool <= 0 && this.vy > B.popVy) {
      let minY = Infinity;
      for (const [, y] of this.hist) if (y < minY) minY = y;
      if (this.f.y - minY > B.popRise) {
        o.pop = clamp(0.25 + (this.vy - B.popVy) * 0.45 + ((c.h - minY) / c.h) * 2.0, 0.25, 1);
        this.latched = true;
        this.cool = B.popCool;
      }
    }
    // absorbing: the fastest the head went down in the last 0.2 s
    let down = 0;
    for (const [, d] of this.downHist) if (d > down) down = d;
    o.absorb = clamp((down - 0.25) / 0.35, 0, 1);

    // spin: unwrapped head yaw since take-off
    if (this.yawPrev === null) this.yawPrev = head.yaw;
    let d = head.yaw - this.yawPrev;
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    if (air && !this.wasAir) this.spinStart = this.yawU; // turning from the moment you leave the snow
    this.yawU += d;
    this.yawPrev = head.yaw;
    this.wasAir = air;
    o.spin = air ? this.yawU - this.spinStart : 0;

    // grab
    o.grab = null;
    if (air) {
      const low = [];
      for (const h of hands) {
        if (!h || !h.tracked) continue;
        if ((h.grip ?? 0) < 0.6) continue;
        if (h.y > B.grabBelow * c.h || h.y > this.f.y - 0.35) continue;
        low.push(h);
      }
      if (low.length === 2) o.grab = 'ダブルグラブ';
      else if (low.length === 1) o.grab = grabName(low[0], this, opts.stance || 'regular');
    }
    return o;
  }
}

// which grab: the front or back hand, on the toe or heel side of the board
export function grabName(hand, body, stance) {
  const front = (GRABS[stance] || GRABS.regular).front === hand.side;
  const hf = body.frame(hand.x, hand.z), bf = body.frame(body.f.x, body.f.z);
  // a regular rider faces right of the travel direction (toes on the right), goofy faces left
  const toeSide = stance === 'goofy' ? -1 : stance === 'forward' ? 0 : 1;
  const toe = toeSide === 0 ? hf.along - bf.along > -0.05 : (hf.across - bf.across) * toeSide > -0.05;
  if (front) return toe ? 'ミュート' : 'メロン';
  return toe ? 'インディ' : 'ステイル';
}

// the thumbsticks instead of the body (seated play, or if you prefer): the same intent
export class StickRider {
  constructor() { this.spin = 0; this.wasAir = false; this.charge = 0; this.held = false; }
  update(dt, pad, air) {
    // pad: { lx, ly, rx, jump (0..1 button), grabL, grabR }
    if (air && !this.wasAir) this.spin = 0;
    this.wasAir = air;
    if (air) this.spin -= (pad.rx || 0) * 7 * dt;
    let pop = 0;
    if (pad.jump > 0.5) { this.held = true; this.charge = Math.min(1, this.charge + dt * 2.5); }
    else if (this.held) { this.held = false; pop = air ? 0 : 0.35 + this.charge * 0.65; this.charge = 0; }
    const grab = air ? (pad.grabL && pad.grabR ? 'ダブルグラブ' : pad.grabL ? 'ミュート' : pad.grabR ? 'インディ' : null) : null;
    return {
      lean: (pad.lx || 0) * 0.3,
      crouch: Math.max(this.held ? this.charge : 0, clamp(-(pad.ly || 0), 0, 1)),
      brake: clamp(pad.ly || 0, 0, 1),
      pop, spin: this.spin, grab, absorb: this.held ? 1 : 0,
    };
  }
}
