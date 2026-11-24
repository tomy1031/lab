// js/flight.js — how you fly. The rig (your play area) moves through the world; you stand or sit in it.
//
//   VR · スーパーマン  pull a trigger and fly where that hand points (both triggers: faster)
//   VR · つばさ        spread your arms: tilt them like wings to turn, lower them to dive (gaining speed),
//                      raise them to climb; triggers add thrust
//   VR · sticks       left stick: move where you look, right stick: up/down and snap turns (both modes)
//   screen            W/S forward/back, A/D sideways, Space/E up, C/Q down, mouse drag to look, Shift faster
//
// Top speed grows with your height above the ground (like a map zoom): slow and precise near the ground,
// fast enough to cross a mountain range when high up.
import * as THREE from 'three';
import { clamp } from './geo.js';

export const SPEEDS = {
  slow: { name: 'ゆっくり', cap: 140 },
  normal: { name: 'ふつう', cap: 700 },
  fast: { name: 'ジェット', cap: 3000 },
};
export const MODES = {
  point: { name: 'スーパーマン', sub: '手を向けてトリガー' },
  wings: { name: 'つばさ', sub: '腕を広げて傾ける' },
};

const UP = new THREE.Vector3(0, 1, 0);
const MIN_CLEAR = 2.0; // m between the ground and your feet
const CEILING = 30000;

export class Flight {
  constructor(rig) {
    this.rig = rig; // THREE.Group: position = your play area's floor in the world, rotation.y = its heading
    this.vel = new THREE.Vector3();
    this.speedSetting = 'normal';
    this.mode = 'point';
    this.agl = 0;
    this.ground = 0;
    this.yawRate = 0; // rad/s this frame (for the comfort vignette)
    this.accel = 0;
    this.wingsOpen = false;
    this.edge = false;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  vmax(boost = 1) {
    const cap = SPEEDS[this.speedSetting].cap;
    return clamp(12 + Math.max(0, this.agl) * 0.9, 12, cap) * boost;
  }

  // yaw the rig about a point (your head), so turning never slides you sideways
  turn(angle, pivot) {
    if (!angle) return;
    const r = this.rig;
    this._v.copy(r.position).sub(pivot).applyAxisAngle(UP, angle);
    r.position.copy(pivot).add(this._v);
    r.rotation.y += angle;
  }

  // approach a desired velocity (world m/s)
  steer(desired, dt, rate = 1.8) {
    const k = 1 - Math.exp(-dt * rate);
    this.vel.lerp(desired, k);
  }

  coast(dt, rate = 0.9) {
    this.vel.multiplyScalar(Math.exp(-dt * rate));
  }

  // VR: inp = XRInput (poses in rig space). headWorld = head position in the world.
  updateXR(dt, inp, headWorld) {
    const rig = this.rig;
    const q = rig.quaternion;
    const L = inp.hands.L, R = inp.hands.R;
    const before = this.vel.length();
    const desired = this._w.set(0, 0, 0);
    let thrusting = false;
    // sticks (both modes): left = move along the view, right = up/down
    const hq = new THREE.Quaternion().copy(q).multiply(inp.headQuat);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hq);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(hq);
    const sx = L.stick[0], sy = -L.stick[1], cy = -R.stick[1];
    if (Math.abs(sx) + Math.abs(sy) + Math.abs(cy) > 0) {
      desired.addScaledVector(fwd, sy).addScaledVector(right, sx).addScaledVector(UP, cy);
      thrusting = true;
    }
    this.wingsOpen = false;
    if (this.mode === 'wings' && L.on && R.on) {
      const lw = L.pos.clone(), rw = R.pos.clone();
      const span = new THREE.Vector3(rw.x - lw.x, 0, rw.z - lw.z);
      const spread = span.length();
      if (spread > 0.75) {
        this.wingsOpen = true;
        // forward = perpendicular to the line between the hands; bank = their height difference
        const heading = new THREE.Vector3().crossVectors(UP, span).normalize().applyQuaternion(q);
        const bank = Math.atan2(lw.y - rw.y, spread); // left hand higher → turn right
        const handsY = (lw.y + rw.y) / 2;
        const pitch = clamp((handsY - (inp.head.y - 0.32)) * 1.8, -1.0, 0.55);
        const dir = heading.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch)).normalize();
        const base = this.vmax(1) * 0.45;
        const trig = (L.trigger + R.trigger) / 2;
        let target = base * (1 + Math.max(0, -pitch) * 2.2) * (1 - Math.max(0, pitch) * 0.7) * (1 + trig * 1.5);
        target = Math.max(target, 6);
        const cur = Math.max(this.vel.length(), 6);
        const sp = cur + (target - cur) * (1 - Math.exp(-dt * (pitch < 0 ? 0.9 : 0.6)));
        desired.copy(dir).multiplyScalar(sp);
        this.vel.copy(desired);
        // turning: banked wings yaw the rig around your head
        const rate = -bank * 1.1 * clamp(sp / 25, 0.35, 1);
        this.turn(rate * dt, headWorld);
        this.yawRate = rate;
      }
    }
    if (!this.wingsOpen) {
      this.yawRate = 0;
      // スーパーマン: each trigger pushes along its hand's ray
      let pulls = 0;
      for (const h of [L, R]) {
        if (!h.on || h.trigger < 0.06) continue;
        const d = h.ray.d.clone().applyQuaternion(q);
        desired.addScaledVector(d, h.trigger);
        pulls++;
      }
      if (pulls) thrusting = true;
      const boost = pulls === 2 ? 2.5 : 1;
      if (desired.lengthSq() > 1) desired.normalize();
      desired.multiplyScalar(this.vmax(boost));
      if (thrusting) this.steer(desired, dt);
      else this.coast(dt);
    }
    // A / X: brake
    if (L.buttons[4] || R.buttons[4]) this.vel.multiplyScalar(Math.exp(-dt * 5));
    this.accel = Math.abs(this.vel.length() - before) / Math.max(dt, 1e-3);
    this.move(dt);
  }

  // screen: inp = ScreenInput; camera yaw/pitch come from it
  updateScreen(dt, inp) {
    const it = inp.intent(dt);
    const before = this.vel.length();
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, inp.yaw);
    const look = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(1, 0, 0), inp.pitch).applyQuaternion(yawQ);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQ);
    const desired = this._w.set(0, 0, 0).addScaledVector(look, it.fwd).addScaledVector(right, it.strafe).addScaledVector(UP, it.climb);
    if (desired.lengthSq() > 1) desired.normalize();
    const active = desired.lengthSq() > 0.0001;
    desired.multiplyScalar(this.vmax(it.boost ? 3 : 1));
    if (active) this.steer(desired, dt, 2.2);
    else this.coast(dt, 1.4);
    if (it.brake) this.vel.multiplyScalar(Math.exp(-dt * 5));
    this.accel = Math.abs(this.vel.length() - before) / Math.max(dt, 1e-3);
    this.yawRate = 0;
    this.move(dt);
  }

  move(dt) {
    const p = this.rig.position;
    p.addScaledVector(this.vel, dt);
    // the ground: never below it (slide along instead)
    const g = this.groundAt ? this.groundAt(p.x, p.z) : 0;
    this.ground = g;
    if (p.y < g + MIN_CLEAR) {
      p.y = g + MIN_CLEAR;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    if (p.y > CEILING) { p.y = CEILING; if (this.vel.y > 0) this.vel.y = 0; }
    this.agl = p.y - g;
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
