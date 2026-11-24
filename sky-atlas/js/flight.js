// js/flight.js — the flying body: your rig (the play area you stand or sit in) moving through the world,
// with the ground below it and the edge of the area around it. How you steer it — the nine ways to fly —
// lives in js/modes.js; this file holds what they share.
import * as THREE from 'three';
import { clamp } from './geo.js';
import { MODES } from './modes.js';

export const SPEEDS = {
  slow: { name: 'ゆっくり', cap: 140, k: 0.55 },
  normal: { name: 'ふつう', cap: 700, k: 1 },
  fast: { name: 'ジェット', cap: 3000, k: 2.5 },
};

const UP = new THREE.Vector3(0, 1, 0);
const MIN_CLEAR = 1.0; // m between the ground and your feet
const CEILING = 30000;

export class Flight {
  constructor(rig) {
    this.rig = rig; // THREE.Group: position = your play area's floor in the world, rotation.y = its heading
    this.vel = new THREE.Vector3();
    this.speedSetting = 'normal';
    this.mode = 'point';
    this.st = {}; // the mode's own state
    this.heading = 0; // world yaw of travel for the modes that have one (on a screen: where the camera faces)
    this.agl = 0;
    this.ground = 0;
    this.onGround = false;
    this.yawRate = 0; // rad/s this frame (for the comfort vignette)
    this.accel = 0;
    this.edge = false;
    this.info = ''; // a line for the HUD (the mode's own numbers)
    this.msg = ''; // a short message for the HUD
    this.climb = 0; // vertical speed (m/s), for the glider's variometer
    this.air = null;
    this.groundAt = null;
    this._v = new THREE.Vector3();
  }

  get k() { return SPEEDS[this.speedSetting].k; }
  get M() { return MODES[this.mode] || MODES.point; }

  vmax(boost = 1) {
    const cap = SPEEDS[this.speedSetting].cap;
    return clamp(12 + Math.max(0, this.agl) * 0.9, 12, cap) * boost;
  }

  // switch the way of flying; c: the same context as update() (may be partial)
  setMode(mode, c = {}) {
    if (!MODES[mode]) mode = 'point';
    const was = this.M;
    this.mode = mode;
    this.st = {};
    this.info = '';
    this.msg = '';
    MODES[mode].enter?.(this, c, was);
  }

  // yaw the rig about a point (your head), so turning never slides you sideways
  turn(angle, pivot) {
    if (!angle) return;
    const r = this.rig;
    if (pivot) {
      this._v.copy(r.position).sub(pivot).applyAxisAngle(UP, angle);
      r.position.copy(pivot).add(this._v);
    }
    r.rotation.y += angle;
  }

  steer(desired, dt, rate = 1.8) { this.vel.lerp(desired, 1 - Math.exp(-dt * rate)); }
  coast(dt, rate = 0.9) { this.vel.multiplyScalar(Math.exp(-dt * rate)); }

  // c = { xr, inp (XRInput), sin (ScreenInput), headLocal, headWorld }
  update(dt, c) {
    const before = this.vel.length();
    this.yawRate = 0;
    const M = this.M;
    if (c.xr) M.xr(this, dt, c);
    else M.screen(this, dt, c);
    // brake (A / X, or X on a keyboard) for the modes that can stop in the air
    if (M.brake !== false) {
      const b = c.xr ? (c.inp.hands.L.buttons[4] || c.inp.hands.R.buttons[4]) : c.sin.keys.has('KeyX');
      if (b) this.vel.multiplyScalar(Math.exp(-dt * 5));
    }
    this.accel = Math.abs(this.vel.length() - before) / Math.max(dt, 1e-3);
    this.move(dt);
  }

  move(dt) {
    const p = this.rig.position;
    p.addScaledVector(this.vel, dt);
    const g = this.groundAt ? this.groundAt(p.x, p.z) : 0;
    this.ground = g;
    this.onGround = p.y <= g + MIN_CLEAR + 0.05;
    if (p.y < g + MIN_CLEAR) {
      p.y = g + MIN_CLEAR;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    // the modes that land (balloon, glider, wingsuit…) slide to a stop on the ground
    if (this.onGround && this.M.land) {
      const k = Math.exp(-dt * 2.5);
      this.vel.x *= k; this.vel.z *= k;
    }
    if (p.y > CEILING) { p.y = CEILING; if (this.vel.y > 0) this.vel.y = 0; }
    this.agl = p.y - g;
    this.climb = this.vel.y;
    // the edge of the area's map: turned back gently
    const lim = this.limit || Infinity, d = Math.hypot(p.x, p.z);
    this.edge = d > lim * 0.92;
    if (d > lim) {
      const k = lim / d;
      p.x *= k; p.z *= k;
      const nx = p.x / lim, nz = p.z / lim, out = this.vel.x * nx + this.vel.z * nz;
      if (out > 0) { this.vel.x -= out * nx; this.vel.z -= out * nz; }
    }
  }

  get speed() { return this.vel.length(); }
}

export { MODES };
