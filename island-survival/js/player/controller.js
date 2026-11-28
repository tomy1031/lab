// player/controller.js — first-person body: walking on the height field, running (stamina), jumping,
// crouching, swimming, collisions with trunks / boulders / walls, the sea boundary, head bob.
// It only moves the body; the survival simulation reads `moveInfo` (distance, running, swimming …).
import * as THREE from 'three';
import { clamp } from '../core/rng.js';

const EYE = 1.62, CROUCH_EYE = 1.05, SWIM_EYE = 0.35;
const GRAV = 22;

export class PlayerController {
  constructor(camera, terrain, nodes) {
    this.camera = camera;
    this.terrain = terrain;
    this.nodes = nodes;
    this.pos = new THREE.Vector3(0, 0, 0);  // feet
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = true;
    this.swimming = false;
    this.crouch = false;
    this.eye = EYE;
    this.bob = 0;
    this.speedMul = 1;     // set by the survival sim (exhaustion, injuries, carrying weight)
    this.userSpeed = 1;    // 設定「歩く 速さ」: ×1 / ×1.3 / ×1.6
    this.canRun = true;    // stamina
    this.frozen = false;   // during sleep / cut-scenes
    this.seaLevel = 0;
    this.moveInfo = { dist: 0, running: false, swimming: false, inWater: false, waterDepth: 0, waterType: null, jumped: false, moving: false };
    this.forward = new THREE.Vector3();
    this.vr = false;       // in a VR session (vr/xr.js sets this and `aim` = { origin, dir } of the right controller)
    this.aim = null;
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, this.terrain.heightAt(x, z), z);
    this.yaw = yaw; this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.updateCamera(0);
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = clamp(this.pitch - dy * 0.0022, -1.45, 1.45);
  }

  /** a slow frame is cut into short steps, so walking keeps its real speed (and collisions hold) at a low frame rate */
  update(dt, ax) {
    const n = Math.max(1, Math.ceil(dt / 0.05));
    if (n === 1) return this.step(dt, ax);
    const mi = this.moveInfo;
    let dist = 0, jumped = false, running = false;
    for (let i = 0; i < n; i++) { this.step(dt / n, ax); dist += mi.dist; jumped ||= mi.jumped; running ||= mi.running; }
    mi.dist = dist; mi.jumped = jumped; mi.running = running && dist > 0.01; mi.moving = dist > dt * 0.4;
  }

  step(dt, ax) {
    const mi = this.moveInfo;
    mi.dist = 0; mi.jumped = false;
    const t = this.terrain;
    const water = t.waterAt(this.pos.x, this.pos.z, this.seaLevel);
    mi.inWater = water.type !== null && water.depth > 0.15;
    mi.waterDepth = water.depth;
    mi.waterType = water.type;
    this.swimming = water.type !== null && water.depth > 1.25;
    mi.swimming = this.swimming;

    // desired horizontal velocity
    let mx = this.frozen ? 0 : ax.x, mz = this.frozen ? 0 : ax.y;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    this.crouch = !!ax.crouch && !this.swimming;
    const running = !!ax.run && this.canRun && !this.crouch && len > 0.1 && !this.swimming;
    let speed = this.swimming ? 1.7 : (running ? 6.2 : this.crouch ? 1.6 : 3.6) * this.userSpeed;
    if (mi.inWater && !this.swimming) speed *= 1 - clamp(water.depth / 1.25) * 0.55; // wading
    speed *= this.speedMul;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = −z rotated by yaw
    const fx = -sin, fz = -cos, rx = cos, rz = -sin;
    const tx = (fx * mz + rx * mx) * speed, tz = (fz * mz + rz * mx) * speed;
    const accel = this.onGround || this.swimming ? 12 : 3;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;

    // vertical
    if (this.swimming) {
      const target = water.level - 1.25;
      this.vel.y += (target - this.pos.y) * 6 * dt - this.vel.y * 4 * dt;
      this.onGround = false;
    } else {
      this.vel.y -= GRAV * dt;
      if (this.onGround && ax.jump && !this.frozen && !this.crouch) { this.vel.y = 6.2; this.onGround = false; mi.jumped = true; }
    }

    // integrate horizontally with slope + solids checks
    const ox = this.pos.x, oz = this.pos.z;
    let nx = ox + this.vel.x * dt, nz = oz + this.vel.z * dt;
    // too steep uphill → slide back
    const gh0 = t.heightAt(ox, oz), gh1 = t.heightAt(nx, nz);
    const step = Math.hypot(nx - ox, nz - oz);
    if (!this.swimming && step > 1e-4 && (gh1 - gh0) / step > 1.35 && gh1 > this.pos.y + 0.3) { nx = ox; nz = oz; this.vel.x *= 0.2; this.vel.z *= 0.2; }
    // solid circles
    for (const s of this.nodes.solids(nx, nz, 3)) {
      const cr = (s.cr ?? 0.35) + 0.32;
      const dx = nx - s.x, dz = nz - s.z;
      const d = Math.hypot(dx, dz);
      if (d < cr && d > 1e-4 && (s.solidTop === undefined || this.pos.y < s.solidTop)) { nx = s.x + (dx / d) * cr; nz = s.z + (dz / d) * cr; }
    }
    // world boundary: the open sea is too rough
    const r = Math.hypot(nx, nz);
    if (r > 330) { nx *= 330 / r; nz *= 330 / r; }
    this.pos.x = nx; this.pos.z = nz;
    this.pos.y += this.vel.y * dt;
    const ground = t.heightAt(nx, nz);
    if (!this.swimming) {
      // standing on structures (floors, platforms)
      let floor = ground;
      for (const s of this.nodes.query(nx, nz, 3, (n) => n.floorY !== undefined)) {
        if (Math.abs(nx - s.x) < (s.fw ?? 1.5) && Math.abs(nz - s.z) < (s.fd ?? 1.5) && this.pos.y >= s.floorY - 0.45) floor = Math.max(floor, s.floorY);
      }
      if (this.pos.y <= floor) { this.pos.y = floor; this.vel.y = 0; this.onGround = true; } else if (this.pos.y > floor + 0.08) this.onGround = false;
    } else if (this.pos.y < ground) this.pos.y = ground;

    mi.dist = Math.hypot(nx - ox, nz - oz);
    mi.running = running && mi.dist > 0.01;
    mi.moving = mi.dist > dt * 0.4;
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    if (this.vr) {
      // VR (vr/xr.js): the headset places the camera; "forward" is where the right controller points
      if (this.aim) this.forward.copy(this.aim.dir);
      return;
    }
    const targetEye = this.swimming ? SWIM_EYE + 1.25 - 0.1 : this.crouch ? CROUCH_EYE : EYE;
    this.eye += (targetEye - this.eye) * (1 - Math.exp(-10 * dt || 0));
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && sp > 0.5) this.bob += dt * sp * 2.1; else this.bob *= 0.9;
    const bobY = this.onGround ? Math.sin(this.bob * 2) * 0.035 * Math.min(1, sp / 4) : 0;
    const swimY = this.swimming ? Math.sin(performance.now() / 600) * 0.08 : 0;
    const cam = this.camera;
    cam.position.set(this.pos.x, this.pos.y + this.eye + bobY + swimY, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.006 * Math.min(1, sp / 4), 'YXZ');
    this.forward.set(0, 0, -1).applyQuaternion(cam.quaternion);
  }

  /** eye position and look direction (for picking); in VR the ray starts at the right controller */
  get eyePos() { return this.vr && this.aim ? this.aim.origin : this.camera.position; }
}
