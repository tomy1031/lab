// js/engine/particles.js — Tire smoke, drift sparks, ERS exhaust flame, cyber rain streaks
import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, maxCount = 340) {
    this.scene = scene;
    this.max = maxCount;
    this.items = [];
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxCount * 3);
    this.col = new Float32Array(maxCount * 3);
    this.size = new Float32Array(maxCount);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));

    for (let i = 0; i < maxCount; i++) {
      this.items.push({
        alive: false,
        life: 0,
        maxLife: 1,
        vx: 0, vy: 0, vz: 0,
        r: 1, g: 1, b: 1,
      });
      this.pos[i * 3 + 1] = -9999;
    }

    const mat = new THREE.PointsMaterial({
      size: 1.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Optional cyber rain group
    this.rain = null;
    this.rainPos = null;
  }

  setCyberRain(enabled) {
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      this.rain.material.dispose();
      this.rain = null;
    }
    if (!enabled) return;
    const count = 420;
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 140;
      const y = Math.random() * 55;
      const z = (Math.random() - 0.5) * 140;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - 1.9; pos[i * 6 + 5] = z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineBasicMaterial({ color: 0x62e8ff, transparent: true, opacity: 0.35 });
    this.rain = new THREE.LineSegments(g, m);
    this.rain.frustumCulled = false;
    this.rainPos = pos;
    this.scene.add(this.rain);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, life = 0.5) {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const it = this.items[idx];
    it.alive = true;
    it.life = life;
    it.maxLife = life;
    it.vx = vx; it.vy = vy; it.vz = vz;
    it.r = r; it.g = g; it.b = b;
    this.pos[idx * 3] = x;
    this.pos[idx * 3 + 1] = y;
    this.pos[idx * 3 + 2] = z;
    this.col[idx * 3] = r;
    this.col[idx * 3 + 1] = g;
    this.col[idx * 3 + 2] = b;
  }

  emitSmoke(pos, vel, color = [0.75, 0.78, 0.82]) {
    this.spawn(
      pos.x + (Math.random() - 0.5) * 0.4,
      pos.y + 0.15,
      pos.z + (Math.random() - 0.5) * 0.4,
      vel.x * 0.15 + (Math.random() - 0.5) * 1.4,
      1.1 + Math.random() * 1.2,
      vel.z * 0.15 + (Math.random() - 0.5) * 1.4,
      color[0], color[1], color[2],
      0.55 + Math.random() * 0.3
    );
  }

  emitSpark(pos, dir, cyber = false) {
    const c = cyber ? [0.0, 0.95, 1.0] : [1.0, 0.65, 0.18];
    this.spawn(
      pos.x, pos.y + 0.2, pos.z,
      dir.x * 4 + (Math.random() - 0.5) * 5,
      2.2 + Math.random() * 3.2,
      dir.z * 4 + (Math.random() - 0.5) * 5,
      c[0], c[1], c[2],
      0.28 + Math.random() * 0.18
    );
  }

  emitBoostFlame(pos, backDir, cyber = false) {
    const c = cyber ? [0.0, 0.96, 1.0] : [0.32, 0.72, 1.0];
    this.spawn(
      pos.x + (Math.random() - 0.5) * 0.25,
      pos.y,
      pos.z + (Math.random() - 0.5) * 0.25,
      backDir.x * 9 + (Math.random() - 0.5) * 1.2,
      0.3 + Math.random() * 0.6,
      backDir.z * 9 + (Math.random() - 0.5) * 1.2,
      c[0], c[1], c[2],
      0.16 + Math.random() * 0.08
    );
  }

  update(dt, anchorPos = null) {
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (!it.alive) continue;
      it.life -= dt;
      if (it.life <= 0) {
        it.alive = false;
        this.pos[i * 3 + 1] = -9999;
        continue;
      }
      const f = it.life / it.maxLife;
      this.pos[i * 3] += it.vx * dt;
      this.pos[i * 3 + 1] += it.vy * dt;
      this.pos[i * 3 + 2] += it.vz * dt;
      it.vy -= 2.2 * dt;
      this.col[i * 3] = it.r * f;
      this.col[i * 3 + 1] = it.g * f;
      this.col[i * 3 + 2] = it.b * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    if (this.rain && anchorPos) {
      this.rain.position.set(anchorPos.x, anchorPos.y, anchorPos.z);
      const p = this.rainPos;
      const count = p.length / 6;
      const drop = 44 * dt;
      for (let i = 0; i < count; i++) {
        p[i * 6 + 1] -= drop;
        p[i * 6 + 4] -= drop;
        if (p[i * 6 + 1] < -4) {
          const ny = 48 + Math.random() * 12;
          p[i * 6 + 1] = ny;
          p[i * 6 + 4] = ny - 1.9;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
