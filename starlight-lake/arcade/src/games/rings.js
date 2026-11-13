import * as THREE from 'three';
import { ArcadeGame } from './base.js';
import { TargetDisc } from '../visuals.js';
import { levelFrom } from '../progress.js';
import { rand, clamp, easeOutCubic } from '../../../src/util.js';

// Ring Rush (near <-> far focus): target boards fly in from 30 m along three lanes. Flick
// (pinch or trigger, then swipe) toward the gap of the Landolt C, or push the thumbstick, or
// press an arrow key. The earlier (farther) you read it, the more it is worth. Board size
// adapts so most reads happen in the middle distance, keeping the eyes moving near <-> far.
// Modelled on the Kwansei Gakuin VR game (Kawamori & Imura, Interaction 2025).

const LANES = [-12, 0, 12];
const LANE_COLORS = [0xff6fa8, 0x3fb8ff, 0x4fcf6f];
const FAR = 30;

export class RingRush extends ArcadeGame {
  constructor(app) { super(app, 'rings'); }

  start() {
    super.start();
    const app = this.app, s = app.progress.data;
    this.near = app.settings.age >= 40 ? 1.0 : 0.8;
    s.rings = s.rings || { size: 0.6, approach: 9 };
    this.size = s.rings.size; this.baseApproach = s.rings.approach;
    this.items = LANES.map((az, i) => {
      const d = new TargetDisc(LANE_COLORS[i]);
      d.mesh.visible = false;
      this.root.add(d.mesh);
      return { d, az, i, state: 'wait', timer: 0.6 + i * 1.6, dist: FAR, pos: new THREE.Vector3(), gap: 0, lift: 0, flash: 0, golden: false };
    });
    // glowing lane rails on the clouds
    this.rails = LANES.map((az, i) => {
      const pts = [this.at(az, -9, 2.5), this.at(az, -1.6, FAR)];
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: LANE_COLORS[i], transparent: true, opacity: 0.6 }));
      this.root.add(l);
      return l;
    });
    this.held = new Map();
    this.streak = 0;
  }

  level() { return levelFrom(this.size, 0.7, 0.06); }
  approach() { return this.baseApproach * (1 - 0.3 * Math.min(1, this.t / 60)); }

  launch(o) {
    o.state = 'come'; o.dist = FAR + rand(-1, 2);
    o.gap = Math.floor(Math.random() * 4); o.d.uniforms.uGap.value = o.gap;
    o.golden = Math.random() < 0.1; o.d.uniforms.uGold.value = o.golden ? 1 : 0;
    o.d.mesh.visible = true; o.d.uniforms.uOpacity.value = 0;
    this.app.sound.cue(this.at(o.az, 0, 12), -5);
  }

  place(o) {
    this.at(o.az, -1.5 - 2.5 * (1 - o.dist / FAR), o.dist, o.pos);
    o.pos.y += o.lift;
    o.d.mesh.position.copy(o.pos);
    o.d.mesh.scale.setScalar(this.size);
    this.face(o.d.mesh);
  }

  update(dt) {
    super.update(dt);
    for (const o of this.items) {
      o.flash = Math.max(0, o.flash - dt * 3);
      o.d.uniforms.uFlash.value = o.flash;
      o.d.uniforms.uTime.value = this.t;
      if (o.state === 'wait') { o.timer -= dt; if (o.timer <= 0) this.launch(o); continue; }
      if (o.state === 'come') {
        o.dist -= (FAR - this.near) / this.approach() * dt;
        o.d.uniforms.uOpacity.value = Math.min(1, o.d.uniforms.uOpacity.value + dt * 2);
        if (o.dist <= this.near) this.missed(o);
      } else if (o.state === 'back') {
        o.rt += dt;
        const k = easeOutCubic(Math.min(1, o.rt / 0.9));
        o.dist = o.from + (FAR - o.from) * k;
        o.lift = Math.sin(Math.PI * k) * (0.8 + o.from * 0.1);
        o.d.mesh.rotation.z += dt * 12;
        if (k >= 1) { o.state = 'wait'; o.timer = rand(0.2, 0.9); o.lift = 0; o.d.mesh.visible = false; }
      } else if (o.state === 'drop') {
        o.rt += dt;
        o.d.uniforms.uOpacity.value = Math.max(0, 1 - o.rt / 0.5);
        o.pos.y -= dt * 1.5; o.d.mesh.position.copy(o.pos);
        if (o.rt > 0.5) { o.state = 'wait'; o.timer = 0.6; o.d.mesh.visible = false; }
        continue;
      }
      this.place(o);
    }
  }

  pick(ray) {
    let best = null, bd = Infinity;
    for (const o of this.items) {
      if (o.state !== 'come') continue;
      const d = ArcadeGame.raySphere(ray, o.pos, this.hitRadius(o.pos, this.size * 0.36, 2.2));
      if (d >= 0 && d < bd) { bd = d; best = o; }
    }
    return best;
  }
  pointerTarget(p) { const o = this.pick(p.ray); return o ? { point: o.pos, distance: o.pos.distanceTo(p.ray.origin) } : null; }
  onSelectStart(p) { const o = this.pick(p.ray); if (o) this.held.set(p, o); }
  onSelectEnd(p) {
    const o = this.held.get(p); this.held.delete(p);
    if (!o || o.state !== 'come') return;
    const dir = this.app.input.flickDirection(p);
    if (dir < 0) { if ((this.hint = (this.hint || 0) + 1) % 3 === 1) this.app.say('つまんだまま、切れ目の方向へ「はじく」！'); return; }
    this.answer(o, dir);
  }
  onDirection(dir, p) {
    let o = p ? this.pick(p.ray) : this.pick(this.app.input.mouse.ray);
    if (!o) for (const x of this.items) if (x.state === 'come' && (!o || x.dist < o.dist)) o = x;
    if (o) this.answer(o, dir);
  }

  answer(o, dir) {
    const app = this.app;
    if (dir === o.gap) {
      const d = o.dist;
      const word = d > 16 ? 'PERFECT!' : d > 8 ? 'GREAT!' : 'GOOD';
      this.reward(o.pos, { mult: (1 + d / 15) * (o.golden ? 3 : 1), word: o.golden ? 'GOLD!' : word, color: d > 16 ? '#ff4f9a' : undefined });
      app.sound.good(o.pos, this.combo);
      app.fx.burst(o.pos, { count: 30, color: o.golden ? [1, 0.85, 0.4] : [1, 1, 1], speed: 0.6 + d * 0.04, size: 0.015 + d * 0.004 });
      o.flash = 1; o.state = 'back'; o.rt = 0; o.from = d;
      if (d > 15) this.size *= 0.93; else if (d < 6) this.size *= 1.06;
      if (++this.streak % 5 === 0) this.baseApproach = Math.max(4.5, this.baseApproach * 0.95);
    } else {
      this.streak = 0;
      this.fail(o.pos, { word: 'WRONG' });
      o.flash = 1; o.d.uniforms.uFlashColor.value.setRGB(1, 0.4, 0.4);
      setTimeout(() => o.d.uniforms.uFlashColor.value.setRGB(0.49, 1, 0.69), 350);
    }
    this.size = clamp(this.size, 0.05, 0.9);
  }

  missed(o) {
    this.streak = 0;
    this.fail(o.pos, { word: 'MISS' });
    this.size = clamp(this.size * 1.08, 0.05, 0.9);
    this.baseApproach = Math.min(12, this.baseApproach * 1.03);
    o.state = 'drop'; o.rt = 0;
  }

  stop() {
    this.app.progress.data.rings = { size: +this.size.toFixed(3), approach: +this.baseApproach.toFixed(2) };
    this.app.progress.save();
    return super.stop();
  }
}
