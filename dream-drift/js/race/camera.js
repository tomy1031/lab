// race/camera.js — chase camera (with speed FOV and shake), the course intro flyover, the finish orbit
// and the title-screen "TV" director that cuts between karts.
import * as THREE from 'three';
import { clamp, damp, dampAngle, mod, lerp, smoothstep } from '../engine/util.js';
import { INTRO_TIME } from './race.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class RaceCamera {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.fov = 68;
    this.shake = 0;
    this.t = 0;
    this.cut = { kart: 0, style: 0, t: 0, anchor: new THREE.Vector3() };
    this.lookBack = false;
  }

  chaseTarget(k, out, outLook, dist = 6.6, height = 2.75) {
    const back = this.lookBack ? -1 : 1;
    const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
    out.set(k.pos.x - sx * dist * back, k.pos.y + height, k.pos.z - sz * dist * back);
    outLook.set(k.pos.x + sx * 4 * back, k.pos.y + 1.25, k.pos.z + sz * 4 * back);
  }

  snap(k) {
    this.yaw = k.heading;
    this.chaseTarget(k, this.pos, this.look);
    this.apply();
  }

  addShake(a) { this.shake = Math.min(1, this.shake + a); }

  update(dt, race, k, mode) {
    this.t += dt;
    const tr = race.track;
    let fovT = 68;
    if (mode === 'intro') {
      const u = clamp(race.phaseT / INTRO_TIME, 0, 1);
      const c = tr.P[0];
      const a = -1.2 + u * 2.4 + tr.headingAt(0);
      const orbit = _v.set(c.x + Math.sin(a) * 34, c.y + lerp(16, 7, u), c.z + Math.cos(a) * 34);
      const lookAt = _w.set(c.x, c.y + 1, c.z);
      tr.pointAt(mod(-8, tr.N), 0, lookAt); lookAt.y += 1;
      this.yaw = k.heading;
      const chasePos = new THREE.Vector3(), chaseLook = new THREE.Vector3();
      this.chaseTarget(k, chasePos, chaseLook);
      const b = smoothstep(0.62, 1, u);
      this.pos.copy(orbit).lerp(chasePos, b);
      this.look.copy(lookAt).lerp(chaseLook, b);
      fovT = 60;
    } else if (mode === 'finish') {
      const a = this.t * 0.4;
      this.pos.set(k.pos.x + Math.sin(a) * 8, k.pos.y + 3.2, k.pos.z + Math.cos(a) * 8);
      this.look.set(k.pos.x, k.pos.y + 1.2, k.pos.z);
      fovT = 55;
    } else if (mode === 'attract') {
      this.director(dt, race);
      return;
    } else {
      // chase
      let target = k.heading;
      const vs = Math.hypot(k.vel.x, k.vel.z);
      if (vs > 4 && k.speed > 0) target = k.heading + 0.35 * angleDiff(Math.atan2(k.vel.x, k.vel.z), k.heading);
      this.yaw = dampAngle(this.yaw, target, k.spin > 0 ? 1.5 : 5.5, dt);
      const dist = 6.6 + (k.boost > 0 ? 0.9 : 0) + clamp(k.speed / k.maxSpeed, 0, 1.3) * 0.5;
      this.chaseTarget(k, _v, _w, dist, 2.75);
      const kxz = 1 - Math.exp(-16 * dt), ky = 1 - Math.exp(-6 * dt);
      this.pos.x += (_v.x - this.pos.x) * kxz; this.pos.z += (_v.z - this.pos.z) * kxz;
      this.pos.y += (_v.y - this.pos.y) * ky;
      this.look.lerp(_w, 1 - Math.exp(-20 * dt));
      fovT = 68 + clamp((k.speed - 14) / 14, 0, 1) * 6 + (k.boost > 0 ? 9 : 0);
    }
    this.fov = damp(this.fov, fovT, 4, dt);
    this.apply();
  }

  apply() {
    const c = this.cam;
    c.position.copy(this.pos);
    if (this.shake > 0.001) {
      c.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      c.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake *= 0.9;
    }
    c.lookAt(this.look);
    if (Math.abs(c.fov - this.fov) > 0.05) { c.fov = this.fov; c.updateProjectionMatrix(); }
  }

  // title screen: cut between karts and angles like a TV broadcast
  director(dt, race) {
    const cut = this.cut;
    cut.t -= dt;
    const ks = race.karts;
    if (cut.t <= 0) {
      cut.t = 5 + Math.random() * 3;
      cut.kart = (cut.kart + 1 + Math.floor(Math.random() * (ks.length - 1))) % ks.length;
      cut.style = (cut.style + 1) % 4;
      const k = ks[cut.kart];
      // trackside camera somewhere ahead of the kart
      const p = k.prog + 30 + Math.random() * 20;
      const side = (Math.random() < 0.5 ? -1 : 1) * (race.track.wallD(mod(Math.round(p), race.track.N)) + 4);
      race.track.pointAt(p, side, cut.anchor);
      cut.anchor.y += 3 + Math.random() * 5;
      this.yaw = k.heading;
      cut.fresh = true;
    }
    const k = ks[cut.kart];
    if (cut.style === 0 || cut.style === 2) {
      this.yaw = dampAngle(this.yaw, k.heading, 4, dt);
      const dist = cut.style === 0 ? 7 : 5.2, h = cut.style === 0 ? 3 : 1.6;
      this.chaseTarget(k, _v, _w, dist, h);
      if (cut.fresh) { this.pos.copy(_v); this.look.copy(_w); }
      this.pos.lerp(_v, 1 - Math.exp(-8 * dt)); this.look.lerp(_w, 1 - Math.exp(-12 * dt));
      this.fov = cut.style === 0 ? 66 : 74;
    } else if (cut.style === 1) {
      this.pos.copy(cut.anchor);
      this.look.set(k.pos.x, k.pos.y + 1, k.pos.z);
      this.fov = clamp(30 + this.pos.distanceTo(this.look) * 0.5, 30, 70);
    } else {
      // side tracking
      const a = k.heading + Math.PI / 2 + Math.sin(this.t * 0.3) * 0.5;
      _v.set(k.pos.x + Math.sin(a) * 9, k.pos.y + 2.2, k.pos.z + Math.cos(a) * 9);
      if (cut.fresh) this.pos.copy(_v);
      this.pos.lerp(_v, 1 - Math.exp(-6 * dt));
      this.look.set(k.pos.x, k.pos.y + 1, k.pos.z);
      this.fov = 58;
    }
    cut.fresh = false;
    this.apply();
  }
}

function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
