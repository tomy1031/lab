import * as THREE from 'three';
import { ArcadeGame } from './base.js';
import { Bubble, BUBBLE_COLORS } from '../visuals.js';
import { CellGrid } from '../../../src/staircase.js';
import { levelFrom } from '../progress.js';
import { rand, pick } from '../../../src/util.js';

// Bubble Pop (contrast): bubbles drift up within reach; pop the striped ones with a finger,
// a controller or a pinch, and let the plain ones float away. Stripe contrast adapts per
// spatial frequency x orientation (3-down-1-up), so the bubbles get fainter as you improve.

export class BubblePop extends ArcadeGame {
  constructor(app) { super(app, 'bubble'); }

  start() {
    super.start();
    const app = this.app, v = app.view;
    this.grid = new CellGrid(app.progress, 'eg-bubble', v.sfBands, { start: 0.6, min: 0.004, max: 1, steps: [0.2, 0.1, 0.05] });
    this.bubbles = [];
    this.spawnIn = 0.4;
    this.fa = [];
    this.dist = v.kind === 'vr' ? 0.8 : 2.0;            // within arm's reach in a headset
  }

  level() {
    const t = this.grid.cells.reduce((a, c) => a + Math.log(c.st.threshold()), 0) / this.grid.cells.length;
    return levelFrom(Math.exp(t), 0.8, 0.006);
  }

  spawn() {
    const isTarget = Math.random() > 0.32;
    const cell = this.grid.pick();
    const golden = Math.random() < 0.07;
    const b = new Bubble(pick(BUBBLE_COLORS), golden);
    b.set({ sf: cell.sf, contrast: isTarget ? cell.st.value : 0, ori: cell.ori, discDeg: 5.4, dist: this.dist });
    this.root.add(b.mesh);
    const o = {
      b, cell, isTarget, golden, state: 'live', age: 0, pos: new THREE.Vector3(), hover: 0,
      az: rand(-26, 26), el: -24, vEl: rand(5.5, 8) * (1 + this.t / 120), wob: rand(0, 6), dz: rand(-0.06, 0.06),
    };
    this.bubbles.push(o);
    this.place(o);
    this.app.sound.cue(o.pos, 2);
  }

  place(o) {
    this.at(o.az + Math.sin(o.age * 1.3 + o.wob) * 1.2, o.el, this.dist + o.dz, o.pos);
    o.b.mesh.position.copy(o.pos);
    this.face(o.b.mesh);
  }

  update(dt) {
    super.update(dt);
    this.spawnIn -= dt;
    const live = this.bubbles.filter((o) => o.state === 'live').length;
    const interval = 0.95 - 0.4 * Math.min(1, this.t / 60);
    if (this.spawnIn <= 0 && live < 7) { this.spawn(); this.spawnIn = interval * rand(0.7, 1.2); }
    for (const p of this.app.input.pointers) p._bubble = this.pick(p.ray);
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const o = this.bubbles[i];
      o.age += dt;
      const u = o.b.uniforms;
      u.uTime.value = this.t;
      if (o.state === 'live') {
        o.el += o.vEl * dt;
        u.uOpacity.value = Math.min(1, o.age * 4);
        const hov = this.app.input.pointers.some((p) => p._bubble === o) ? 1 : 0;
        o.hover += (hov - o.hover) * Math.min(1, dt * 12);
        u.uHover.value = o.hover;
        if (o.el > 26) this.escape(o);
      } else {
        o.pt += dt;
        u.uOpacity.value = Math.max(0, 1 - o.pt / 0.18);
        o.b.mesh.scale.multiplyScalar(1 + dt * 3);
        if (o.pt > 0.18) { o.b.mesh.removeFromParent(); o.b.mesh.material.dispose(); this.bubbles.splice(i, 1); continue; }
      }
      if (o.state === 'live') this.place(o);
    }
  }

  escape(o) {
    if (o.isTarget) { o.cell.st.update(false); this.fail(null, { sound: false }); }
    else this.fa.push(0);
    o.state = 'gone'; o.pt = 0;
  }

  pick(ray) {
    let best = null, bd = Infinity;
    for (const o of this.bubbles) {
      if (o.state !== 'live') continue;
      const d = ArcadeGame.raySphere(ray, o.pos, this.hitRadius(o.pos, o.b.radiusM, 2.2));
      if (d >= 0 && d < bd) { bd = d; best = o; }
    }
    return best;
  }
  pointerTarget(p) { const o = this.pick(p.ray); return o ? { point: o.pos, distance: o.pos.distanceTo(p.ray.origin) } : null; }
  onSelectStart(p) { const o = this.pick(p.ray); if (o) this.pop(o, p); }

  /** Fingertips and controllers pop bubbles they touch. */
  touch(points) {
    for (const o of this.bubbles) {
      if (o.state !== 'live') continue;
      for (const t of points) if (t.pos.distanceTo(o.pos) < o.b.radiusM * 1.15) { this.pop(o, t.pointer); break; }
    }
  }

  guessing() { const h = this.fa.slice(-10); return h.length >= 5 && h.reduce((a, b) => a + b, 0) / h.length > 0.34; }

  pop(o, p) {
    const app = this.app;
    o.state = 'gone'; o.pt = 0;
    if (o.isTarget) {
      if (!this.guessing()) o.cell.st.update(true);
      app.sound.pop(o.pos, this.combo);
      const c = o.b.uniforms.uColor.value;
      const col = [Math.min(1, c.x * 1.8), Math.min(1, c.y * 1.8), Math.min(1, c.z * 1.8)];
      app.fx.burst(o.pos, { count: o.golden ? 60 : 28, color: o.golden ? [1, 0.85, 0.4] : col, speed: 0.35, size: 0.012, life: 0.6 });
      this.reward(o.pos, { mult: o.golden ? 3 : 1, word: o.golden ? 'GOLD!' : undefined, color: o.golden ? '#ffb52e' : undefined });
      if (p) app.input.pulse(p, 0.6, 30);
    } else {
      this.fa.push(1);
      this.fail(o.pos, { word: 'しまなし!' });
      app.fx.burst(o.pos, { count: 10, color: [0.7, 0.75, 0.85], speed: 0.15, size: 0.01 });
    }
  }

  stop() { this.grid.save(); this.app.progress.save(); return super.stop(); }
}
