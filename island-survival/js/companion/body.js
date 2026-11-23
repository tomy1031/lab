// companion/body.js — moves the companion's avatar around the island: follow the player, wait, walk to a
// place, walk to a resource and work there, sit by the fire, sleep, swim through deep water.
// Pure movement + pose choice; what the companion *wants* is decided by companion/brain.js.
import * as THREE from 'three';

export class CompanionBody {
  constructor(game, avatar) {
    this.game = game;
    this.avatar = avatar;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.target = null;        // {x, z, run?, stopAt?}
    this.mode = 'follow';      // follow | wait | goto | work | sit | sleep
    this.workPose = 'gather';
    this.onArrive = null;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.override = null;      // a pose forced for a moment (wave, cheer, point …) {pose, t}
    this.condition = 'ok';     // ok | cold | sick | tired (picks idle variants)
  }

  place(x, z) {
    const t = this.game.world.terrain;
    this.pos.set(x, t.heightAt(x, z), z);
    this.avatar.root.position.copy(this.pos);
  }

  goTo(x, z, { run = false, stopAt = 1.2, then = null } = {}) {
    this.mode = 'goto';
    this.target = { x, z, run, stopAt };
    this.onArrive = then;
    this.stuckT = 0;
  }
  follow() { this.mode = 'follow'; this.target = null; this.onArrive = null; }
  wait() { this.mode = 'wait'; this.target = null; this.onArrive = null; }
  work(pose = 'gather') { this.mode = 'work'; this.workPose = pose; }
  sit() { this.mode = 'sit'; }
  sleep() { this.mode = 'sleep'; }
  gesture(pose, seconds = 2.5) { this.override = { pose, t: seconds }; }

  update(dt) {
    const g = this.game, t = g.world.terrain, p = g.player.pos;
    let want = null, run = false, stopAt = 1.2;
    if (this.mode === 'follow') {
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d > 3.2) {
        // aim for a point a bit behind-left of the player
        const back = new THREE.Vector3(Math.sin(g.player.yaw), 0, Math.cos(g.player.yaw)).multiplyScalar(2.2);
        const side = new THREE.Vector3(-Math.cos(g.player.yaw), 0, Math.sin(g.player.yaw)).multiplyScalar(1.2);
        want = { x: p.x + back.x + side.x, z: p.z + back.z + side.z };
        run = d > 9;
        stopAt = 0.6;
      }
    } else if (this.mode === 'goto' && this.target) {
      want = this.target; run = this.target.run; stopAt = this.target.stopAt;
    }

    let speed = 0;
    if (want) {
      const dx = want.x - this.pos.x, dz = want.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > stopAt) {
        let dirx = dx / d, dirz = dz / d;
        // steer around trunks / boulders / walls
        for (const s of g.world.nodes.solids(this.pos.x, this.pos.z, 3)) {
          const ox = this.pos.x - s.x, oz = this.pos.z - s.z;
          const od = Math.hypot(ox, oz);
          const r = (s.cr ?? 0.4) + 0.9;
          if (od < r && od > 1e-3) { const k = (r - od) / r; dirx += (ox / od) * k * 1.6; dirz += (oz / od) * k * 1.6; }
        }
        const L = Math.hypot(dirx, dirz) || 1; dirx /= L; dirz /= L;
        const water = t.waterAt(this.pos.x, this.pos.z, g.player.seaLevel);
        const swimming = water.type && water.depth > 1.2;
        speed = swimming ? 1.5 : run ? 5.2 : Math.min(3.0, 1.2 + d * 0.5);
        if (this.condition === 'sick' || this.condition === 'tired') speed *= 0.7;
        const nx = this.pos.x + dirx * speed * dt, nz = this.pos.z + dirz * speed * dt;
        // do not walk up cliffs
        const gh = t.heightAt(nx, nz) - t.heightAt(this.pos.x, this.pos.z);
        if (gh / Math.max(1e-3, speed * dt) < 1.4) { this.pos.x = nx; this.pos.z = nz; }
        const targetYaw = Math.atan2(dirx, dirz);
        let dy = targetYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * (1 - Math.exp(-8 * dt));
        // stuck? teleport-free nudge: try sidestep
        if (this.lastPos.distanceTo(this.pos) < speed * dt * 0.2) this.stuckT += dt; else this.stuckT = 0;
        if (this.stuckT > 2.5) { this.pos.x += -dirz * 0.8; this.pos.z += dirx * 0.8; this.stuckT = 0; }
        this.swimming = swimming;
      } else if (this.mode === 'goto') {
        const cb = this.onArrive; this.onArrive = null; this.target = null;
        this.mode = 'wait';
        cb?.();
      }
    } else if (this.mode !== 'sleep') {
      // idle: turn to face the player when close
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < 8) {
        const targetYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
        let dy = targetYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * (1 - Math.exp(-3 * dt));
      }
    }
    this.lastPos.copy(this.pos);
    this.speed += (speed - this.speed) * (1 - Math.exp(-8 * dt));
    const water = t.waterAt(this.pos.x, this.pos.z, g.player.seaLevel);
    const ground = t.heightAt(this.pos.x, this.pos.z);
    this.pos.y = water.type && water.depth > 1.2 ? water.level - 1.15 : ground;

    // pose
    let pose = 'idle';
    if (this.override) { pose = this.override.pose; this.override.t -= dt; if (this.override.t <= 0) this.override = null; }
    else if (water.type && water.depth > 1.2) pose = 'swim';
    else if (this.speed > 3.6) pose = 'run';
    else if (this.speed > 0.25) pose = 'walk';
    else if (this.mode === 'work') pose = this.workPose;
    else if (this.mode === 'sit') pose = 'sit';
    else if (this.mode === 'sleep') pose = 'sleep';
    else if (this.condition === 'cold') pose = 'shiver';
    else if (this.condition === 'sick') pose = 'sick';
    this.avatar.setPose(pose);
    this.avatar.root.position.copy(this.pos);
    this.avatar.root.rotation.y = this.yaw;
  }
}
