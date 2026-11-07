import * as THREE from 'three';
import { Module } from './base.js';
import { DotOrb } from '../stimuli.js';
import { Staircase } from '../staircase.js';
import { rand } from '../util.js';
import { STIM_DIST } from '../config.js';

// 浮かぶ星珠 — stereoacuity training. Three random-dot orbs, one slightly nearer. Each orb is
// scaled to the same visual angle, flat-shaded and equally bright, so binocular disparity is
// the only cue. The disparity staircase is in arc seconds. Vedamurthy et al. 2016 trained
// stereo vision with a VR game and Žiak et al. 2017 measured stereoacuity gains in a headset.

const SIZE_DEG = 1.8;

export class DepthModule extends Module {
  start() {
    super.start();
    const app = this.app;
    this.st = new Staircase({ start: 500, min: 12, max: 2400, easier: 1, steps: [0.2, 0.12, 0.06] }, app.store.stair('vr-stereo'));
    this.orbs = [0, 1, 2].map((i) => {
      const o = new DotOrb(Math.random() * 100);
      this.root.add(o.mesh);
      return { o, pos: new THREE.Vector3(), az: 0, el: 0, d: STIM_DIST, flash: 0, hover: 0 };
    });
    this.markers = this.orbs.map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.renderOrder = 17;
      this.root.add(m);
      return m;
    });
    this.newTrial();
  }

  ipd() { return this.app.view.ipd || 0.063; }

  newTrial() {
    const eta = this.st.value / 206265;                // arcsec -> radians
    const base = STIM_DIST + rand(-0.15, 0.15);
    const near = 1 / (1 / base + eta / this.ipd());     // disparity = IPD * (1/near - 1/base)
    this.target = Math.floor(Math.random() * 3);
    const spacing = rand(3.6, 4.6);
    this.orbs.forEach((x, i) => {
      x.az = (i - 1) * spacing + rand(-0.3, 0.3);
      x.el = rand(-0.6, 0.6);
      x.d = i === this.target ? near : base;
      x.o.uniforms.uSeed.value = Math.random() * 100;
      x.flash = 0;
    });
    this.phase = 'show'; this.pt = 0;
    this.app.audio.cue(this.at(0, 0, STIM_DIST), 2);
  }

  update(dt) {
    super.update(dt);
    const app = this.app;
    this.pt += dt;
    const show = this.phase === 'show' ? Math.min(1, this.pt / 0.2) * Math.min(1, (2.2 - this.pt) / 0.25) : this.phase === 'feedback' ? 1 : 0;
    this.orbs.forEach((x, i) => {
      this.at(x.az, x.el, x.d, x.pos);
      x.o.mesh.position.copy(x.pos);
      x.o.mesh.scale.setScalar(2 * x.d * Math.tan(THREE.MathUtils.degToRad(SIZE_DEG / 2)) / 0.84);
      this.face(x.o.mesh);
      x.flash = Math.max(0, x.flash - dt * 2);
      x.o.uniforms.uFlash.value = x.flash;
      x.o.uniforms.uOpacity.value = Math.max(0, show);
      const m = this.markers[i];
      m.position.copy(this.at(x.az, x.el, STIM_DIST));
      m.scale.setScalar(STIM_DIST * Math.tan(THREE.MathUtils.degToRad(SIZE_DEG * 0.62)));
      this.face(m);
      const hovered = this.phase === 'respond' && app.input.pointers.some((p) => this.pickOrb(p.ray) === x);
      x.hover += ((hovered ? 1 : 0) - x.hover) * Math.min(1, dt * 12);
      m.material.opacity = this.phase === 'respond' ? 0.3 + 0.5 * x.hover : 0;
    });
    if (this.phase === 'show' && this.pt > 2.2) { this.phase = 'respond'; this.pt = 0; }
    else if (this.phase === 'respond' && this.pt > 6) this.answer(-1);
    else if (this.phase === 'feedback' && this.pt > 0.9) this.newTrial();
  }

  pickOrb(ray) {
    let best = null, ba = Infinity;
    for (const x of this.orbs) {
      const a = Module.rayAngle(ray, this.at(x.az, x.el, STIM_DIST));
      if (a < SIZE_DEG + 0.8 && a < ba) { ba = a; best = x; }
    }
    return best;
  }

  pointerTarget(p) {
    if (this.phase !== 'respond') return null;
    const x = this.pickOrb(p.ray);
    return x ? { point: this.at(x.az, x.el, STIM_DIST), distance: STIM_DIST } : null;
  }

  onSelectStart(p) {
    if (this.phase === 'show' && this.pt > 0.4) { this.phase = 'respond'; this.pt = 0; }   // allow answering early
    if (this.phase !== 'respond') return;
    const x = this.pickOrb(p.ray);
    if (x) this.answer(this.orbs.indexOf(x), p);
  }

  onDirection(dir) {
    if (this.phase === 'show') { this.phase = 'respond'; this.pt = 0; }
    if (this.phase !== 'respond') return;
    const map = { 2: 0, 1: 1, 3: 1, 0: 2 };
    this.answer(map[dir]);
  }

  answer(i, p) {
    const app = this.app;
    const ok = i === this.target;
    this.st.update(ok);
    this.stats.trials++;
    const t = this.orbs[this.target];
    if (ok) {
      this.stats.correct++;
      const pts = app.score.reward(90, t.pos);
      this.stats.score += pts;
      if (p) app.input.pulse(p, 0.5, 30);
      app.fx.burst(t.pos, { count: 28, color: [0.85, 0.8, 1.0], speed: 0.5, size: 0.02 });
    } else {
      app.score.miss(t.pos, i >= 0);
    }
    t.flash = 1;
    this.phase = 'feedback'; this.pt = 0;
  }

  stop() {
    this.app.store.setStair('vr-stereo', this.st.toJSON());
    this.stats.metrics = { stereoArcsec: this.st.threshold() };
    return super.stop();
  }
}
