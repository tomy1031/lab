import * as THREE from 'three';
import { ArcadeGame } from './base.js';
import { Star, Buddy } from '../visuals.js';
import { Staircase } from '../../../src/staircase.js';
import { levelFrom } from '../progress.js';
import { rand, pick } from '../../../src/util.js';

// Side Catch (peripheral vision, divided attention): keep your eyes on the buddy in the
// middle while stars pop up around it, 15-34 degrees out. Point and pinch (or click) to catch
// them before they vanish, but not while the buddy is red. How long a star stays follows a
// 3-down-1-up staircase. Fast peripheral events and divided attention are the ingredients
// of action games, which improved contrast sensitivity in Li et al. 2009.

const COLORS = [0xffd45e, 0xff9d2e, 0x4fcf6f, 0x3fb8ff, 0xff6fa8];
const DIST = 1.8;

export class SideCatch extends ArcadeGame {
  constructor(app) { super(app, 'catch'); }

  start() {
    super.start();
    this.st = new Staircase({ start: 1.6, min: 0.3, max: 3, easier: 1, steps: [0.12, 0.07, 0.04] }, this.app.progress.stair('eg-catch'));
    this.buddy = new Buddy();
    this.root.add(this.buddy.mesh);
    this.stars = [];
    this.spawnIn = 1.0;
    this.angry = 0; this.angryLeft = 0; this.nextAngry = rand(5, 9);
    this.blink = 0; this.nextBlink = rand(2, 4);
  }

  level() { return levelFrom(this.st.threshold(), 2.0, 0.3); }

  spawn() {
    const s = new Star(pick(COLORS));
    this.root.add(s.mesh);
    const ang = rand(0, Math.PI * 2), ecc = rand(15, 34);
    const o = { s, az: Math.cos(ang) * ecc, el: Math.sin(ang) * ecc * 0.62, age: 0, life: this.st.value, pos: new THREE.Vector3(), state: 'live', red: this.angry > 0.5, hover: 0, spin: rand(0, 6) };
    this.place(o);
    this.stars.push(o);
    this.app.sound.cue(o.pos, 7);
  }

  place(o) {
    this.at(o.az, o.el, DIST, o.pos);
    o.s.mesh.position.copy(o.pos);
    const grow = o.state === 'live' ? Math.min(1, o.age / 0.12) : 1 + o.pt * 4;
    o.s.mesh.scale.setScalar(2 * DIST * Math.tan(THREE.MathUtils.degToRad(3.2 / 2)) * grow);
    this.face(o.s.mesh);
  }

  update(dt) {
    super.update(dt);
    const app = this.app;
    // the buddy: blinks, glances, and sometimes turns red
    this.buddy.mesh.position.copy(this.at(0, 0, DIST));
    this.buddy.mesh.scale.setScalar(2 * DIST * Math.tan(THREE.MathUtils.degToRad(3.6)));
    this.face(this.buddy.mesh);
    const bu = this.buddy.uniforms;
    bu.uTime.value = this.t;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 0.15; this.nextBlink = rand(2.5, 5); }
    this.blink = Math.max(0, this.blink - dt);
    bu.uBlink.value = this.blink > 0 ? Math.sin((this.blink / 0.15) * Math.PI) : 0;
    this.nextAngry -= dt;
    if (this.nextAngry <= 0 && this.angryLeft <= 0) { this.angryLeft = rand(1.6, 2.4); this.nextAngry = rand(6, 11); app.sound.bad(this.buddy.mesh.position); }
    this.angryLeft -= dt;
    const target = this.angryLeft > 0 ? 1 : 0;
    this.angry += (target - this.angry) * Math.min(1, dt * 10);
    bu.uAngry.value = this.angry;
    bu.uLook.value.set(Math.sin(this.t * 0.7) * 0.2, Math.cos(this.t * 0.9) * 0.1);

    const maxN = this.level() >= 15 ? 2 : 1;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.stars.filter((o) => o.state === 'live').length < maxN) { this.spawn(); this.spawnIn = rand(0.45, 1.1) * (1 - 0.25 * Math.min(1, this.t / 60)); }
    for (const p of app.input.pointers) p._star = this.pick(p.ray);
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const o = this.stars[i];
      o.age += dt;
      o.s.uniforms.uSpin.value = o.spin + this.t * 2;
      if (o.state === 'live') {
        const hov = app.input.pointers.some((p) => p._star === o) ? 1 : 0;
        o.s.uniforms.uOpacity.value = Math.min(1, (o.life - o.age) / 0.15) * (0.85 + 0.15 * hov);
        if (o.age >= o.life) this.expire(o);
      } else {
        o.pt += dt;
        o.s.uniforms.uOpacity.value = Math.max(0, 1 - o.pt / 0.2);
        if (o.pt > 0.2) { o.s.mesh.removeFromParent(); o.s.mesh.material.dispose(); this.stars.splice(i, 1); continue; }
      }
      this.place(o);
    }
  }

  expire(o) {
    o.state = 'gone'; o.pt = 0;
    if (this.angry > 0.5) return;                  // letting stars go while red is right
    this.st.update(false);
    this.fail(null, { sound: false });
  }

  pick(ray) {
    let best = null, ba = Infinity;
    for (const o of this.stars) {
      if (o.state !== 'live') continue;
      const a = ArcadeGame.rayAngle(ray, o.pos);
      if (a < 4.5 && a < ba) { ba = a; best = o; }
    }
    return best;
  }
  pointerTarget(p) { const o = this.pick(p.ray); return o ? { point: o.pos, distance: o.pos.distanceTo(p.ray.origin) } : null; }

  onSelectStart(p) {
    const o = this.pick(p.ray);
    if (!o) return;
    const app = this.app;
    o.state = 'gone'; o.pt = 0;
    if (this.angry > 0.5) { this.fail(o.pos, { word: 'ストップ中！' }); return; }
    this.st.update(true);
    this.reward(o.pos, { mult: 1 + (1 - o.age / o.life) * 0.5 });
    app.sound.pop(o.pos, this.combo);
    app.fx.burst(o.pos, { count: 24, color: [1, 0.9, 0.5], speed: 0.5, size: 0.015 });
    if (p) app.input.pulse(p, 0.5, 25);
  }

  stop() { this.app.progress.setStair('eg-catch', this.st.toJSON()); this.app.progress.save(); return super.stop(); }
}
