import * as THREE from 'three';
import { Module } from './base.js';
import { Triplet, Glow } from '../stimuli.js';
import { CellGrid } from '../staircase.js';
import { pick, clamp } from '../util.js';
import { STIM_DIST } from '../config.js';
import { noteOf } from '../audio.js';

// 星の門 — lateral masking with brief presentations, a spatial two-alternative forced choice.
// Two flanker triplets flash on either side of a fixation star; only one has the faint central
// target. Polat et al. trained this collinear configuration in adult amblyopia (PNAS 2004) and,
// with short and shrinking exposure times, in presbyopes aged ~51 (Sci Rep 2012). The target's
// contrast follows a per-cell staircase. Exposure time adapts separately; it is floored higher
// for players over 40, whose processing speed is the thing being trained.

export class GatesModule extends Module {
  start() {
    super.start();
    const app = this.app, v = app.view;
    const bands = v.kind === 'screen' ? v.sfBands.filter((sf) => (1 / sf) * 14 < v.field.el * 2) : v.sfBands;
    this.bands = bands.length ? bands : v.sfBands.slice(-1);
    this.grid = new CellGrid(app.store, `${v.kind === 'screen' ? 'scr' : 'vr'}-lm`, this.bands, { start: 0.3, min: 0.003, max: 1, steps: [0.2, 0.1, 0.05] });
    const s = app.store.data;
    this.minDur = app.settings.age >= 40 ? 0.1 : 0.08;
    this.dur = Math.max(this.minDur, s.gatesDuration ?? (app.settings.age >= 40 ? 0.6 : 0.5));
    if (this.opts.variant === 'brief') this.dur = Math.max(this.minDur, this.dur * 0.8);
    this.recent = [];
    this.fix = new Glow(0xdff2ff, { core: 30, halo: 0.25, star: 0.6 });
    this.fix.mesh.scale.setScalar(STIM_DIST * Math.tan(THREE.MathUtils.degToRad(0.9)));
    this.root.add(this.fix.mesh);
    this.gates = [0, 1].map(() => this.makeGate());
    this.phase = 'ready'; this.pt = 0;
    this.newTrial();
  }

  makeGate() {
    const group = new THREE.Group();
    const tri = new Triplet();
    group.add(tri.mesh);
    this.app.eye(tri.mesh, 'weak');
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    ring.renderOrder = 17;
    group.add(ring);
    this.root.add(group);
    return { group, tri, ring, pos: new THREE.Vector3(), flash: 0, az: 0, hover: 0 };
  }

  newTrial() {
    const cell = this.grid.pick();
    const sf = cell.sf, lambda = 1 / sf;
    const sigma = lambda;                      // Polat's stimuli: sigma = wavelength
    const sepL = pick(sf >= 4 ? [3, 4, 6] : [3, 4]);
    const sep = sepL * lambda;
    const target = Math.random() < 0.5 ? 0 : 1;
    this.trial = { cell, sf, sigma, sep, sepL, target, answered: false };
    const H = 2 * sep + 6 * sigma, W = 6 * sigma;
    // gates sit a few degrees either side of fixation; a small screen squeezes them inwards
    const room = this.app.view.field.az * 1.15 - H / 2 - 0.4;
    const gx = Math.max(W / 2 + 0.45, Math.min(Math.max(2.4, W / 2 + 1.6), room));
    this.gates.forEach((g, i) => {
      g.az = i === 0 ? -gx : gx;
      g.tri.set({ sf, sigma, sep, dist: STIM_DIST, cf: 0.6, ct: i === target ? cell.st.value : 0 });
      g.tri.mesh.rotation.z = THREE.MathUtils.degToRad(cell.ori);
      g.tri.uniforms.uShow.value = 0;
      const margin = Math.min(0.6, H * 0.12);
      const r = STIM_DIST * Math.tan(THREE.MathUtils.degToRad(H / 2 + margin));
      g.ring.scale.setScalar(r);
      g.radiusDeg = H / 2 + margin;
    });
    this.phase = 'ready'; this.pt = 0;
  }

  update(dt) {
    super.update(dt);
    const app = this.app;
    this.at(0, 0, STIM_DIST, this.fix.mesh.position);
    this.face(this.fix.mesh);
    for (const g of this.gates) {
      this.at(g.az, 0, STIM_DIST, g.pos);
      g.group.position.copy(g.pos);
      this.face(g.group);
      g.tri.uniforms.uTime.value = this.t;
      g.flash = Math.max(0, g.flash - dt * 2);
      const hovered = this.phase === 'respond' && app.input.pointers.some((p) => this.pickGate(p.ray) === g);
      g.hover += ((hovered ? 1 : 0) - g.hover) * Math.min(1, dt * 12);
      g.ring.material.opacity = 0.25 + 0.35 * g.hover + 0.6 * g.flash;
      g.ring.material.color.setRGB(0.62 + g.flash * (g.good ? -0.1 : 0.4), 0.85 + g.flash * (g.good ? 0.15 : -0.3), 1.0 - g.flash * (g.good ? 0.3 : 0.4));
    }
    this.pt += dt;
    if (this.phase === 'ready') {
      this.fix.opacity = 0.6 + 0.4 * Math.sin(this.pt * 9);
      if (this.pt > 0.75) {
        this.phase = 'show'; this.pt = 0;
        for (const g of this.gates) g.tri.uniforms.uShow.value = 1;
        app.audio.cue(this.at(0, 0, STIM_DIST), 5);
      }
    } else if (this.phase === 'show') {
      this.fix.opacity = 1;
      if (this.pt >= this.dur) {
        for (const g of this.gates) g.tri.uniforms.uShow.value = 0;
        this.phase = 'respond'; this.pt = 0;
      }
    } else if (this.phase === 'respond') {
      this.fix.opacity = 0.5;
      if (this.pt > 6) { this.answer(-1); }
    } else if (this.phase === 'feedback') {
      if (this.pt > 0.8) {
        for (const g of this.gates) g.tri.uniforms.uShow.value = 0;
        this.newTrial();
      }
    }
  }

  pickGate(ray) {
    let best = null, ba = Infinity;
    for (const g of this.gates) {
      const a = Module.rayAngle(ray, g.pos);
      if (a < g.radiusDeg * 1.35 + 0.3 && a < ba) { ba = a; best = g; }
    }
    return best;
  }

  pointerTarget(p) {
    if (this.phase !== 'respond') return null;
    const g = this.pickGate(p.ray);
    return g ? { point: g.pos, distance: g.pos.distanceTo(p.ray.origin) } : null;
  }

  onSelectStart(p) {
    if (this.phase !== 'respond') return;
    const g = this.pickGate(p.ray);
    if (g) this.answer(this.gates.indexOf(g), p);
  }

  onDirection(dir) {
    if (this.phase !== 'respond') return;
    if (dir === 0) this.answer(1); else if (dir === 2) this.answer(0);
  }

  answer(choice, p) {
    const app = this.app, tr = this.trial;
    const ok = choice === tr.target;
    tr.cell.st.update(ok);
    this.stats.trials++;
    this.recent.push(ok ? 1 : 0);
    if (this.recent.length > 10) this.recent.shift();
    const chosen = this.gates[choice];
    const right = this.gates[tr.target];
    if (ok) {
      this.stats.correct++;
      const pts = app.score.reward(80, chosen.pos);
      this.stats.score += pts;
      chosen.flash = 1; chosen.good = true;
      if (p) app.input.pulse(p, 0.5, 30);
      app.fx.burst(chosen.pos, { count: 22, color: [0.75, 0.9, 1.0], speed: 0.45, size: 0.02 });
      const dir = app.env.constellations.nextStarDir();
      const fly = dir || new THREE.Vector3(0, 0.7, -0.7).normalize();
      app.fx.fly(chosen.pos, fly, () => {
        const done = app.env.constellations.addStar();
        app.store.data.totals.stars++;
        if (done !== null) {
          app.store.data.totals.constellations.push({ seed: done });
          app.audio.fanfare(app.head.clone().addScaledVector(fly, 10));
          app.caption('星座がひとつ完成しました ✦', 3.5);
        } else app.audio.bell(app.head.clone().addScaledVector(fly, 10), { midi: noteOf(9), vel: 0.2, dur: 2.4 });
      });
    } else {
      app.score.miss(right.pos, choice >= 0);
      right.flash = 1; right.good = true;
      // show where it was, clearly, for a moment: feedback helps the learning stick
      right.tri.uniforms.uCT.value = Math.max(0.35, tr.cell.st.value);
      right.tri.uniforms.uShow.value = 1;
      if (choice < 0) app.caption('左右どちらかの門を選んでね（スティック・矢印キーでもOK）', 3);
    }
    // exposure time adapts on a slower loop than contrast
    if (this.recent.length >= 10) {
      const acc = this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
      if (acc >= 0.85) { this.dur = Math.max(this.minDur, this.dur * 0.85); this.recent = []; }
      else if (acc <= 0.6) { this.dur = Math.min(0.8, this.dur * 1.15); this.recent = []; }
    }
    this.phase = 'feedback'; this.pt = 0;
  }

  stop() {
    this.grid.save();
    this.app.store.data.gatesDuration = +clamp(this.dur, this.minDur, 0.8).toFixed(3);
    this.stats.metrics = { sensitivity: this.grid.sensitivityByBand(), duration: this.dur };
    return super.stop();
  }
}
