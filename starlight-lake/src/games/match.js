import * as THREE from 'three';
import { Module } from './base.js';
import { GaborPatch } from '../stimuli.js';
import { CellGrid, ORIENTATIONS } from '../staircase.js';
import { rand, clamp, pick } from '../util.js';
import { STIM_DIST } from '../config.js';
import { noteOf } from '../audio.js';

// Star Match — find every star whose stripes run the same way as the sample.
// A clearly visible sample sits in the middle; around it, 6-10 faint stars of the same spatial
// frequency. Two or three share the sample's orientation, the rest carry the other three
// orientations. Touch all the matching ones before the time runs out; each found one is joined
// to the sample by a line, and a full set adds a star to the constellation in the sky.
//
// Why it trains: identifying a grating's orientation at low contrast is how contrast
// sensitivity is measured, and it is what blur from myopia and astigmatism degrades; here it is
// done near threshold, at several spatial frequencies and all four orientations, across the
// central field, with search, sound and game rewards: the recipe of the ULTIMEyes game (Deveau,
// Lovcik & Seitz 2014; Deveau & Seitz 2014), which improved acuity and contrast sensitivity.
// The field's contrast follows a staircase per (spatial frequency x orientation), as in Wisps:
// a correct touch counts as a success; a wrong touch, or a set left unfinished, as a failure.

const FIX = [1.0, 0.82, 0.45];   // gold: the sample's rim, and the found stars'
const _a = new THREE.Vector3();

export class MatchModule extends Module {
  start() {
    super.start();
    const app = this.app, v = app.view;
    // up to 6 cycles/degree: finer stripes are too hard to see a few degrees off the centre
    const bands = v.sfBands.filter((sf) => sf <= 6);
    this.bands = bands.length ? bands : v.sfBands.slice(0, 1);
    this.grid = new CellGrid(app.store, `${v.kind === 'screen' ? 'scr' : 'vr'}-match1`, this.bands, {
      start: 0.35, min: 0.003, max: 1, steps: [0.2, 0.1, 0.05],
    });
    this.items = [];
    this.lines = [];
    this.sample = new GaborPatch();
    this.sample.uniforms.uRimColor.value.set(...FIX);
    this.root.add(this.sample.mesh);
    app.eye(this.sample.mesh, 'weak');
    this.recent = [];             // 1 = wrong touch, 0 = right touch (guessing guard)
    this.rounds = 0; this.cleared = 0; this.perfect = 0;
    this.phase = 'gap'; this.pt = 0.6;
    this.firstHint = true;
  }

  newRound() {
    const app = this.app, v = app.view;
    this.clearRound();
    const cell = this.grid.pick();
    const sf = cell.sf;
    const sigma = clamp(1.0 / sf, 0.3, 0.7);
    const disc = Math.max(2.4, sigma * 6);
    const fine = sf >= 6;
    const n = fine ? 6 : rand(0, 1) < 0.5 ? 8 : 10;
    const k = n >= 10 ? 3 : pick([2, 3]);
    const others = ORIENTATIONS.filter((o) => o !== cell.ori);
    // positions on two loose rings around the sample, inside the sharp middle of the lenses
    const rings = fine ? [7.5] : [7.5, 14];
    const maxAz = Math.min(22, v.field.az), maxEl = Math.min(13, v.field.el);
    const spots = [];
    for (let tries = 0; spots.length < n && tries < 400; tries++) {
      const r = pick(rings) + rand(-1.2, 1.2);
      const ang = rand(0, Math.PI * 2);
      const az = r * Math.cos(ang) * 1.25, el = r * Math.sin(ang) * 0.85;
      if (Math.abs(az) > maxAz || Math.abs(el) > maxEl) continue;
      if (Math.hypot(az, el) < disc * 1.9) continue;
      if (spots.every((s) => Math.hypot(s.az - az, s.el - el) > disc + 3)) spots.push({ az, el });
    }
    const contrast = cell.st.value;
    const oris = spots.map((_, i) => (i < k ? cell.ori : pick(others)));
    oris.sort(() => Math.random() - 0.5);
    for (let i = 0; i < spots.length; i++) {
      const g = new GaborPatch();
      g.set({ sf, contrast, ori: oris[i], sigmaDeg: sigma, discDeg: disc, dist: STIM_DIST });
      g.opacity = 0;
      this.root.add(g.mesh);
      app.eye(g.mesh, 'weak');
      this.items.push({ g, az: spots[i].az, el: spots[i].el, disc, match: oris[i] === cell.ori, state: 'live', pos: new THREE.Vector3(), flash: 0, hover: 0 });
    }
    this.sample.set({ sf, contrast: Math.max(0.6, contrast * 4), ori: cell.ori, sigmaDeg: sigma * 1.15, discDeg: disc * 1.2, dist: STIM_DIST });
    this.sample.opacity = 0;
    this.round = { cell, k: this.items.filter((it) => it.match).length, found: 0, wrong: 0, limit: 4 + 2 * k, t: 0 };
    this.rounds++;
    this.phase = 'play'; this.pt = 0;
    app.audio.cue(this.at(0, 0, STIM_DIST), 3);
    if (this.firstHint) {
      this.firstHint = false;
      app.caption('真ん中の見本と同じ向きの縞の星を、まわりから全部見つけて触れよう', 5);
    }
  }

  clearRound() {
    for (const it of this.items) { it.g.mesh.removeFromParent(); it.g.dispose(); }
    for (const l of this.lines) { l.removeFromParent(); l.geometry.dispose(); l.material.dispose(); }
    this.items = []; this.lines = [];
  }

  update(dt) {
    super.update(dt);
    const app = this.app;
    this.pt += dt;
    if (this.phase === 'gap') {
      this.sample.opacity = Math.max(0, this.sample.uniforms.uOpacity.value - dt * 3);
      for (const it of this.items) it.g.opacity = Math.max(0, it.g.uniforms.uOpacity.value - dt * 3);
      if (this.pt > 0.9) this.newRound();
      this.place();
      return;
    }
    const r = this.round;
    r.t += dt * (app.finale ? 1.2 : 1);
    const fadeIn = Math.min(1, this.pt / 0.3);
    this.sample.opacity = fadeIn;
    this.sample.time = this.t;
    // the sample's rim runs from gold to red as the time runs out
    const left = 1 - r.t / r.limit;
    this.sample.uniforms.uRimColor.value.set(1.0, 0.45 + 0.4 * Math.max(0, left), 0.3 + 0.15 * Math.max(0, left));
    this.sample.uniforms.uRim.value = 1 + (left < 0.3 ? 0.6 * Math.sin(this.t * 14) : 0);
    for (const p of app.input.pointers) p._match = this.pick(p.ray);
    for (const it of this.items) {
      it.flash = Math.max(0, it.flash - dt * 2.5);
      it.g.time = this.t;
      const target = it.state === 'live' ? fadeIn : it.state === 'found' ? 1 : it.state === 'shown' ? 1 : 0.35;
      it.g.opacity = target;
      const hov = app.input.pointers.some((p) => p._match === it) ? 1 : 0;
      it.hover += (hov - it.hover) * Math.min(1, dt * 12);
      it.g.hover = Math.max(it.hover, it.flash);
    }
    this.place();
    if (this.phase === 'play' && r.t >= r.limit) this.timeUp();
    if (this.phase === 'reveal' && this.pt > 1.3) { this.phase = 'gap'; this.pt = 0; }
  }

  place() {
    this.at(0, 0, STIM_DIST, this.sample.mesh.position);
    this.face(this.sample.mesh);
    for (const it of this.items) {
      this.at(it.az, it.el, STIM_DIST, it.pos);
      it.g.mesh.position.copy(it.pos);
      this.face(it.g.mesh);
    }
    for (const l of this.lines) {
      const a = l.geometry.attributes.position;
      _a.copy(this.sample.mesh.position);
      a.setXYZ(0, _a.x, _a.y, _a.z);
      a.setXYZ(1, l.userData.it.pos.x, l.userData.it.pos.y, l.userData.it.pos.z);
      a.needsUpdate = true;
    }
  }

  /** The star nearest the pointer, with a generous margin: rough pointing is enough. */
  pick(ray) {
    if (this.phase !== 'play') return null;
    let best = null, ba = Infinity;
    for (const it of this.items) {
      if (it.state !== 'live') continue;
      const a = Module.rayAngle(ray, it.pos);
      if (a < Math.max(2.6, it.disc * 0.5 + 1.4) && a < ba) { ba = a; best = it; }
    }
    return best;
  }

  pointerTarget(p) {
    const it = this.pick(p.ray);
    return it ? { point: it.pos, distance: it.pos.distanceTo(p.ray.origin) } : null;
  }

  guessing() {
    const h = this.recent.slice(-10);
    return h.length >= 5 && h.reduce((a, b) => a + b, 0) / h.length > 0.4;
  }

  onSelectStart(p) {
    const it = this.pick(p.ray);
    if (!it) return;
    const app = this.app, r = this.round;
    this.stats.trials++;
    if (it.match) {
      if (!this.guessing()) r.cell.st.update(true);
      this.recent.push(0);
      this.stats.correct++;
      it.state = 'found'; it.flash = 1;
      it.g.uniforms.uRimColor.value.set(...FIX);
      r.found++;
      const pts = app.score.reward(70, it.pos);
      this.stats.score += pts;
      app.input.pulse(p, 0.5, 30);
      app.fx.burst(it.pos, { count: 26, color: [1.0, 0.88, 0.55], speed: 0.4, size: 0.018 });
      app.audio.bell(it.pos, { midi: noteOf(4 + r.found * 2), vel: 0.25, dur: 1.2 });
      this.addLine(it);
      if (r.found >= r.k) this.complete();
    } else {
      r.cell.st.update(false);
      this.recent.push(1);
      r.wrong++;
      it.state = 'wrong'; it.flash = 1;
      it.g.uniforms.uRimColor.value.set(1.0, 0.45, 0.45);
      app.score.miss(it.pos, true);
      if (r.wrong % 3 === 1 && this.rounds <= 3) app.caption('縞の向きが見本と違う星でした。同じ向きのものだけ', 3);
    }
    if (this.recent.length > 20) this.recent.shift();
  }

  addLine(it) {
    const geo = new THREE.BufferGeometry().setFromPoints([this.sample.mesh.position.clone(), it.pos.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.55, depthWrite: false }));
    line.renderOrder = 19;
    line.userData.it = it;
    this.root.add(line);
    this.app.eye(line, 'weak');
    this.lines.push(line);
  }

  complete() {
    const app = this.app, r = this.round;
    this.cleared++;
    if (!r.wrong) this.perfect++;
    const pts = app.score.reward(r.wrong ? 120 : 200, this.sample.mesh.position, { golden: !r.wrong });
    this.stats.score += pts;
    app.fx.text(r.wrong ? `COMPLETE  +${pts}` : `PERFECT  +${pts}`, this.at(0, 4.5, STIM_DIST), { color: '#ffe29a', size: 0.11 });
    const dir = app.env.constellations.nextStarDir() || new THREE.Vector3(0, 0.7, -0.7).normalize();
    app.fx.fly(this.sample.mesh.position, dir, () => {
      const done = app.env.constellations.addStar();
      app.store.data.totals.stars++;
      if (done !== null) {
        app.store.data.totals.constellations.push({ seed: done });
        app.audio.fanfare(app.head.clone().addScaledVector(dir, 10));
        app.caption('星座がひとつ完成しました ✦', 3.5);
      }
    });
    this.phase = 'reveal'; this.pt = 0.6;
  }

  timeUp() {
    const app = this.app, r = this.round;
    r.cell.st.update(false);
    this.stats.trials++;
    // show where the matching ones were, clearly, for a moment: feedback helps the learning stick
    for (const it of this.items) {
      if (it.state !== 'live' || !it.match) continue;
      it.state = 'shown'; it.flash = 1;
      it.g.uniforms.uContrast.value = Math.max(0.45, it.g.uniforms.uContrast.value);
      it.g.uniforms.uRimColor.value.set(1.0, 0.6, 0.5);
    }
    app.score.miss(this.sample.mesh.position, false);
    this.phase = 'reveal'; this.pt = 0;
  }

  stop() {
    this.clearRound();
    this.sample.dispose();
    this.grid.save();
    this.stats.metrics = { sensitivity: this.grid.sensitivityByBand(), rounds: this.rounds, cleared: this.cleared, perfect: this.perfect };
    return super.stop();
  }
}
