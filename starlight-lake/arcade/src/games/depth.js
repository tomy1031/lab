import * as THREE from 'three';
import { ArcadeGame } from './base.js';
import { FlatBall } from '../visuals.js';
import { Staircase } from '../../../src/staircase.js';
import { levelFrom } from '../progress.js';
import { rand } from '../../../src/util.js';

// Depth Order (stereo): balls hang at slightly different depths. Touch them nearest first.
// Every ball has the same visual size and a flat colour, so only binocular disparity tells
// the order. The depth step is a disparity staircase in arc seconds (Vedamurthy et al. 2016
// trained stereo with a VR game in the same spirit).

const COLORS = [0xff6fa8, 0x3fb8ff, 0xffb52e, 0x4fcf6f, 0x9a7bff];
const BASE = 1.6, SIZE_DEG = 3.2;

export class DepthOrder extends ArcadeGame {
  constructor(app) { super(app, 'depth'); }

  start() {
    super.start();
    this.st = new Staircase({ start: 700, min: 15, max: 3000, easier: 1, steps: [0.18, 0.1, 0.05] }, this.app.progress.stair('eg-depth'));
    this.balls = [];
    this.newSet();
  }

  level() { return levelFrom(this.st.threshold(), 1500, 15); }

  newSet() {
    for (const b of this.balls) { b.f.mesh.removeFromParent(); b.f.mesh.material.dispose(); }
    const lv = this.level();
    const K = 3 + (lv >= 10 ? 1 : 0) + (lv >= 22 ? 1 : 0);
    const eta = this.st.value / 206265, ipd = this.app.view.ipd || 0.063;
    const base = BASE + rand(-0.1, 0.1);
    const slots = Array.from({ length: K }, (_, i) => (i - (K - 1) / 2) * 5.2);
    slots.sort(() => Math.random() - 0.5);
    const cols = [...COLORS].sort(() => Math.random() - 0.5);
    this.balls = [];
    for (let i = 0; i < K; i++) {
      // depth rank i: 0 = farthest ... K-1 = nearest, each one disparity step closer
      const d = 1 / (1 / base + (i * eta) / ipd);
      const f = new FlatBall(cols[i % cols.length]);
      this.root.add(f.mesh);
      this.balls.push({ f, rank: i, d, az: slots[i] + rand(-0.4, 0.4), el: rand(-1.2, 2.2), done: false, pos: new THREE.Vector3(), hover: 0, pop: 0 });
    }
    this.next = K - 1;               // the nearest first
    this.setTime = 0;
    this.phase = 'play';
    this.app.sound.cue(this.at(0, 0, 2), 4);
  }

  update(dt) {
    super.update(dt);
    this.setTime += dt;
    for (const p of this.app.input.pointers) p._ball = this.pick(p.ray);
    for (const b of this.balls) {
      this.at(b.az, b.el, b.d, b.pos);
      b.f.mesh.position.copy(b.pos);
      b.f.mesh.scale.setScalar(2 * b.d * Math.tan(THREE.MathUtils.degToRad(SIZE_DEG / 2)) / 0.84);
      this.face(b.f.mesh);
      const hov = this.app.input.pointers.some((p) => p._ball === b) ? 1 : 0;
      b.hover += (hov - b.hover) * Math.min(1, dt * 12);
      b.f.uniforms.uHover.value = b.hover;
      if (b.done) { b.pop += dt; b.f.uniforms.uOpacity.value = Math.max(0, 1 - b.pop / 0.25); }
      b.f.uniforms.uFlash.value = Math.max(0, b.f.uniforms.uFlash.value - dt * 2);
    }
    if (this.phase === 'play' && this.setTime > 9) this.lose(null, 'TIME UP');
    if (this.phase === 'show') { this.pt += dt; if (this.pt > 1.4) this.newSet(); }
  }

  pick(ray) {
    if (this.phase !== 'play') return null;
    let best = null, ba = Infinity;
    for (const b of this.balls) {
      if (b.done) continue;
      const a = ArcadeGame.rayAngle(ray, b.pos);
      if (a < SIZE_DEG * 0.75 && a < ba) { ba = a; best = b; }
    }
    return best;
  }
  pointerTarget(p) { const b = this.pick(p.ray); return b ? { point: b.pos, distance: b.pos.distanceTo(p.ray.origin) } : null; }
  onSelectStart(p) { const b = this.pick(p.ray); if (b) this.tap(b, p); }

  tap(b, p) {
    const app = this.app;
    if (b.rank === this.next) {
      b.done = true; b.f.uniforms.uFlash.value = 1;
      app.sound.pop(b.pos, this.balls.length - 1 - this.next);
      app.fx.burst(b.pos, { count: 18, color: [1, 1, 1], speed: 0.4, size: 0.012 });
      if (p) app.input.pulse(p, 0.4, 20);
      this.next--;
      if (this.next < 0) {
        this.st.update(true);
        const quick = Math.max(0, (6 - this.setTime) / 6);
        this.reward(this.at(0, 4, 1.8), { mult: (1 + quick * 0.6) * (this.balls.length / 3) });
        app.sound.good(b.pos, this.combo);
        this.phase = 'show'; this.pt = 0.6;
      }
    } else this.lose(b, 'ちがう！');
  }

  lose(b, word) {
    this.st.update(false);
    this.fail(b ? b.pos : this.at(0, 4, 1.8), { word });
    // show the right order: number the balls nearest first
    const order = [...this.balls].sort((x, y) => y.rank - x.rank);
    order.forEach((x, i) => setTimeout(() => { if (!x.done) { x.f.uniforms.uFlash.value = 1; this.app.sound.pop(x.pos, i); } }, 120 + i * 180));
    this.phase = 'show'; this.pt = 0;
  }

  stop() { this.app.progress.setStair('eg-depth', this.st.toJSON()); this.app.progress.save(); return super.stop(); }
}
