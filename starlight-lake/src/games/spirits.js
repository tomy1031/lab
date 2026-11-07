import * as THREE from 'three';
import { Module } from './base.js';
import { GaborPatch } from '../stimuli.js';
import { CellGrid } from '../staircase.js';
import { rand, clamp } from '../util.js';
import { STIM_DIST } from '../config.js';

// 光の精 — contrast-detection perceptual learning.
// Gabor "spirits" appear across the visual field, each announced by a sound from its position.
// Touch the ones that carry stripes and let the blank ones go. Every stripe target belongs to a
// (spatial frequency x orientation) cell with its own 3-down-1-up staircase, and weaker cells
// come up more often. Many studies informed this: Polat 2004 (Gabor detection), Deveau 2014
// (ULTIMEyes: many frequencies and orientations, visual field positions, sound cues, game
// rewards), Tan & Fong 2008 and Yan 2015 (contrast training in low myopia), and Sawides 2010
// (orientation-specific blur adaptation), which is why each orientation is trained separately.

export class SpiritsModule extends Module {
  start() {
    super.start();
    const app = this.app, v = app.view;
    this.grid = new CellGrid(app.store, `${v.kind === 'screen' ? 'scr' : 'vr'}-det`, v.sfBands, {
      start: 0.2, min: 0.002, max: 1, steps: [0.2, 0.1, 0.05],
    });
    this.spirits = [];
    this.spawnIn = 1.2;
    this.blankRatio = 0.3;
    this.faHistory = [];
    this.hits = 0; this.misses = 0; this.fas = 0;
    this.maxActive = v.kind === 'screen' ? 2 : 3;
    this.life = 3.0;
    this.minSigma = v.kind === 'screen' ? 0.12 : 0.28;
    this.highOnly = this.opts.variant === 'high';
  }

  spawn() {
    const app = this.app, v = app.view;
    const isTarget = Math.random() > this.blankRatio;
    const nb = v.sfBands.length;
    const cell = this.grid.pick(this.highOnly && nb > 2 ? (c) => c.band >= nb - 2 : null);
    const sf = cell.sf;
    const sigma = clamp(1.1 / sf, this.minSigma, 0.85);
    const disc = sigma * 7;
    // fine gratings stay nearer the centre of gaze, where acuity is highest
    const maxEcc = sf > 4 ? Math.min(14, v.field.az) : v.field.az;
    let az = 0, el = 0, ok = false;
    for (let k = 0; k < 20 && !ok; k++) {
      az = rand(-maxEcc, maxEcc);
      el = rand(-v.field.el, v.field.el * 0.8);
      ok = this.spirits.every((s) => Math.hypot(s.az - az, s.el - el) > Math.max(s.disc, disc) * 1.2 + 2);
    }
    if (!ok) return;
    const g = new GaborPatch();
    g.set({ sf, contrast: isTarget ? cell.st.value : 0, ori: cell.ori, sigmaDeg: sigma, discDeg: disc, dist: STIM_DIST });
    g.opacity = 0;
    this.root.add(g.mesh);
    app.eye(g.mesh, 'weak');
    const s = { g, cell, isTarget, az, el, disc, age: 0, life: this.life, pos: new THREE.Vector3(), state: 'live', hover: 0 };
    this.place(s);
    this.spirits.push(s);
    app.audio.cue(s.pos, isTarget ? 0 : 0);   // same sound for both: sound says where, not what
  }

  place(s) {
    this.at(s.az, s.el + s.age * 0.12, STIM_DIST, s.pos);
    s.g.mesh.position.copy(s.pos);
    this.face(s.g.mesh);
  }

  update(dt) {
    super.update(dt);
    this.spawnIn -= dt;
    const live = this.spirits.filter((s) => s.state === 'live').length;
    if (this.spawnIn <= 0 && live < this.maxActive) {
      this.spawn();
      this.spawnIn = rand(0.6, 1.25);
    }
    for (const p of this.app.input.pointers) p._spirit = this.pick(p.ray);
    for (let i = this.spirits.length - 1; i >= 0; i--) {
      const s = this.spirits[i];
      s.age += dt;
      s.g.time = this.t;
      if (s.state === 'live') {
        const fadeIn = Math.min(1, s.age / 0.25);
        const fadeOut = Math.min(1, (s.life - s.age) / 0.4);
        s.g.opacity = Math.max(0, Math.min(fadeIn, fadeOut));
        const hovered = this.app.input.pointers.some((p) => p._spirit === s);
        s.hover += ((hovered ? 1 : 0) - s.hover) * Math.min(1, dt * 12);
        s.g.hover = s.hover;
        if (s.age >= s.life) this.expire(s);
      } else {
        s.fade -= dt;
        s.g.opacity = Math.max(0, s.fade / 0.35);
        if (s.fade <= 0) { s.g.mesh.removeFromParent(); s.g.dispose(); this.spirits.splice(i, 1); continue; }
      }
      this.place(s);
    }
  }

  pick(ray) {
    let best = null, bd = Infinity;
    for (const s of this.spirits) {
      if (s.state !== 'live') continue;
      const d = Module.raySphere(ray, s.pos, this.hitRadius(s.pos, s.g.radiusM, 1.5));
      if (d >= 0 && d < bd) { bd = d; best = s; }
    }
    return best;
  }

  pointerTarget(p) {
    const s = this.pick(p.ray);
    return s ? { point: s.pos, distance: s.pos.distanceTo(p.ray.origin) } : null;
  }

  guessing() {
    const h = this.faHistory.slice(-10);
    return h.length >= 5 && h.reduce((a, b) => a + b, 0) / h.length > 0.34;
  }

  onSelectStart(p) {
    const s = this.pick(p.ray);
    if (!s) return;
    const app = this.app;
    this.stats.trials++;
    if (s.isTarget) {
      // While the player is tapping blanks too, hits don't make the next ones fainter.
      if (!this.guessing()) s.cell.st.update(true);
      this.stats.correct++; this.hits++;
      const pts = app.score.reward(60 + Math.round(40 * (1 - Math.log10(s.cell.st.value * 1000) / 3)), s.pos);
      this.stats.score += pts;
      app.fx.burst(s.pos, { count: 34, color: [0.7, 0.92, 1.0], speed: 0.6, size: 0.022 });
      app.input.pulse(p, 0.6, 30);
      app.store.data.totals.spirits++;
      this.vanish(s);
    } else {
      this.fas++;
      this.faHistory.push(1);
      app.score.miss(s.pos, true);
      app.fx.burst(s.pos, { count: 10, color: [0.6, 0.6, 0.75], speed: 0.2, size: 0.015 });
      if (this.fas % 3 === 1) app.caption('それは無地の精。縞が見えるものだけ触れよう', 3);
      this.vanish(s);
    }
  }

  expire(s) {
    if (s.isTarget) {
      s.cell.st.update(false);
      this.misses++;
      this.stats.trials++;
      this.app.score.miss(s.pos, false);
    } else {
      this.faHistory.push(0);
      this.app.score.add(10);
    }
    this.vanish(s);
  }

  vanish(s) { s.state = 'gone'; s.fade = 0.35; }

  stop() {
    this.grid.save();
    this.stats.metrics = {
      sensitivity: this.grid.sensitivityByBand(),
      orientation: this.grid.orientationProfile(),
      hits: this.hits, misses: this.misses, falseAlarms: this.fas,
    };
    return super.stop();
  }
}
