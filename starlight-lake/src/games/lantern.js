import * as THREE from 'three';
import { Module } from './base.js';
import { LandoltLantern, Glow } from '../stimuli.js';
import { WATER_Y } from '../config.js';
import { easeOutCubic, rand, clamp } from '../util.js';
import { noteOf } from '../audio.js';

// Lantern Drift — near/far focus work modelled on the Kwansei Gakuin VR game (Kawamori & Imura,
// Interaction 2025): targets approach from ~30 m and the player pushes them back by reading a
// Landolt C. Every lantern sent back makes the eyes jump from near to far again (the
// "遠近体操法" near-far exercise), and the far beacons ask for sustained far fixation
// ("遠方凝視法"). The headset's optics have a fixed focal distance, so what really changes
// here is vergence, plus whatever accommodation follows it; docs/research.md covers this.

const LANES = [-13, 0, 13];
const FAR = 32;

export class LanternModule extends Module {
  start() {
    super.start();
    const app = this.app;
    const s = app.store.data;
    this.near = app.settings.age >= 40 ? 0.9 : 0.7;
    this.size = s.lanternSize ?? 0.32;            // lantern face quad size in metres (adaptive)
    this.approach = s.lanternApproach ?? 11;       // seconds from far to near
    this.lanterns = LANES.map((az, i) => this.makeLantern(az, i));
    this.streak = 0;
    this.distances = [];
    this.beacon = null;
    this.nextBeacon = rand(22, 30);
    this.held = new Map();
    this.stats.metrics.distances = this.distances;
    this.hint = 0;
  }

  makeLantern(az, lane) {
    const l = new LandoltLantern();
    // its reflection on the lake: just warm light (a mirrored ring would flip the gap)
    const refl = new Glow(0xffb070, { core: 5, halo: 0.5 });
    this.root.add(l.mesh, refl.mesh);
    this.app.eye(l.mesh, 'weak');
    const obj = { l, refl, az, lane, d: FAR, state: 'wait', timer: 1.2 + lane * 2.6, from: FAR, gap: 0, pos: new THREE.Vector3(), flash: 0, hover: 0, lift: 0, golden: false };
    l.mesh.visible = false; refl.mesh.visible = false;
    return obj;
  }

  launch(o) {
    o.state = 'approach'; o.d = FAR + rand(-1, 2);
    o.gap = Math.floor(Math.random() * 4);
    o.l.gap = o.gap;
    o.l.mesh.visible = true; o.refl.mesh.visible = true;
    o.l.uniforms.uOpacity.value = 0;
    o.golden = Math.random() < 0.1;
    o.l.uniforms.uGold.value = o.golden ? 1 : 0;
    o.wrongs = 0;
    this.app.audio.cue(this.at(o.az, -2, 12), -12);
  }

  place(o) {
    // A slight downward angle feels natural, like lanterns floating on the water surface.
    const el = -2.5 - 1.5 * (1 - o.d / FAR);
    this.at(o.az, el, o.d, o.pos);
    o.pos.y += o.lift;
    o.l.mesh.position.copy(o.pos);
    o.l.mesh.scale.setScalar(this.size);
    this.face(o.l.mesh);
    o.refl.mesh.position.set(o.pos.x, 2 * WATER_Y - o.pos.y, o.pos.z);
    o.refl.mesh.scale.set(this.size * 0.7, this.size * 2.2, 1);
    o.refl.mesh.lookAt(this.app.head.x, o.refl.mesh.position.y, this.app.head.z);
    o.refl.opacity = 0.35 * o.l.uniforms.uOpacity.value * (o.golden ? 1.4 : 1);
  }

  update(dt) {
    super.update(dt);
    const app = this.app;
    for (const o of this.lanterns) {
      o.flash = Math.max(0, o.flash - dt * 2.5);
      o.l.uniforms.uFlash.value = o.flash;
      o.l.uniforms.uTime.value = this.t;
      o.l.uniforms.uHover.value += ((o.hover ? 1 : 0) - o.l.uniforms.uHover.value) * Math.min(1, dt * 10);
      if (o.state === 'wait') {
        o.timer -= dt;
        if (o.timer <= 0) this.launch(o);
        continue;
      }
      if (o.state === 'approach') {
        o.d -= (FAR - this.near) / this.approach * dt * (app.finale ? 1.25 : 1);
        o.l.uniforms.uOpacity.value = Math.min(1, o.l.uniforms.uOpacity.value + dt * 1.5);
        if (o.d <= this.near) this.miss(o);
      } else if (o.state === 'return') {
        o.rt += dt;
        const k = easeOutCubic(Math.min(1, o.rt / 1.1));
        o.d = o.from + (FAR - o.from) * k;
        o.lift = Math.sin(Math.PI * k) * (0.6 + o.from * 0.12);      // sent back in a high arc
        if (k >= 1) {
          o.state = 'approach'; o.lift = 0;
          o.gap = (o.gap + 1 + Math.floor(Math.random() * 3)) % 4; o.l.gap = o.gap;
          o.golden = Math.random() < 0.1; o.l.uniforms.uGold.value = o.golden ? 1 : 0;
        }
      } else if (o.state === 'sink') {
        o.rt += dt;
        o.l.uniforms.uOpacity.value = Math.max(0, 1 - o.rt / 0.8);
        o.pos.y -= dt * 0.4;
        o.l.mesh.position.copy(o.pos);
        o.refl.opacity = Math.max(0, 0.3 - o.rt * 0.4);
        if (o.rt > 0.8) { o.state = 'wait'; o.timer = 1.0; o.l.mesh.visible = false; o.refl.mesh.visible = false; }
        continue;
      }
      this.place(o);
    }
    this.updateBeacon(dt);
    for (const o of this.lanterns) o.hover = false;
    for (const p of app.input.pointers) {
      const o = this.pick(p.ray);
      if (o) o.hover = true;
    }
  }

  updateBeacon(dt) {
    const app = this.app;
    this.nextBeacon -= dt;
    if (!this.beacon && this.nextBeacon <= 0) {
      const g = new Glow(0xfff0b0, { core: 14, halo: 0.6, star: 0.9 });
      const az = rand(-38, 38), el = rand(1.0, 2.6), d = 140;
      g.mesh.position.copy(this.at(az, el, d));
      g.mesh.scale.setScalar(d * Math.tan(THREE.MathUtils.degToRad(1.4)));
      this.root.add(g.mesh);
      this.beacon = { g, life: 9, az, el, d, t: 0 };
      app.audio.bell(g.mesh.position, { midi: noteOf(12), vel: 0.35, dur: 3 });
      app.caption('遠くの山すそに灯りがともりました。見つけて、つまもう', 4);
    }
    if (this.beacon) {
      const b = this.beacon;
      b.t += dt; b.life -= dt;
      b.g.opacity = (0.55 + 0.45 * Math.sin(b.t * 6)) * Math.min(1, b.life, b.t * 2);
      this.face(b.g.mesh);
      if (b.life <= 0) { b.g.mesh.removeFromParent(); this.beacon = null; this.nextBeacon = rand(26, 36); }
    }
  }

  pick(ray) {
    let best = null, bd = Infinity;
    for (const o of this.lanterns) {
      if (o.state !== 'approach') continue;
      const r = this.hitRadius(o.pos, this.size * 0.36, 1.8);
      const d = Module.raySphere(ray, o.pos, r);
      if (d >= 0 && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  pointerTarget(p) {
    const o = this.pick(p.ray);
    if (o) return { point: o.pos, distance: o.pos.distanceTo(p.ray.origin) };
    if (this.beacon && Module.rayAngle(p.ray, this.beacon.g.mesh.position) < 3) return { point: this.beacon.g.mesh.position, distance: this.beacon.d };
    return null;
  }

  onSelectStart(p) {
    if (this.beacon && Module.rayAngle(p.ray, this.beacon.g.mesh.position) < 3.2) { this.catchBeacon(); return; }
    const o = this.pick(p.ray);
    if (o) this.held.set(p, o);
  }

  onSelectEnd(p) {
    const o = this.held.get(p);
    this.held.delete(p);
    if (!o || o.state !== 'approach') return;
    const dir = this.app.input.flickDirection(p);
    if (dir < 0) {
      if (this.hint++ % 3 === 0) this.app.caption('輪の切れ目の方向へ、つまんだまま「はじく」ように動かしてね', 3.5);
      return;
    }
    this.answer(o, dir);
  }

  /** Thumbstick on a controller pointing at a lantern, or the arrow keys (nearest lantern). */
  onDirection(dir, p) {
    let o = p ? this.pick(p.ray) : null;
    if (!o) {
      const m = this.app.input.mouse;
      o = this.pick(m.ray);
    }
    if (!o) {
      let bd = Infinity;
      for (const x of this.lanterns) if (x.state === 'approach' && x.d < bd) { bd = x.d; o = x; }
    }
    if (o) this.answer(o, dir);
  }

  answer(o, dir) {
    const app = this.app;
    this.stats.trials++;
    if (dir === o.gap) {
      this.stats.correct++;
      this.streak++;
      const d = o.d;
      this.distances.push(+d.toFixed(1));
      const pts = app.score.reward(100 + Math.round(d * 8), o.pos, { golden: o.golden });
      this.stats.score += pts;
      o.flash = 1;
      o.state = 'return'; o.rt = 0; o.from = d;
      const col = o.golden ? [1.0, 0.88, 0.45] : [1.0, 0.8, 0.5];
      app.fx.burst(o.pos, { count: o.golden ? 60 : 32, color: col, speed: 0.4 + d * 0.03, size: 0.02 + d * 0.004 });
      const labelPos = this.at(o.az * 0.6, 3, Math.min(d, 3.2));
      app.fx.text(`${o.golden ? 'GOLD  ' : ''}${d.toFixed(1)} m`, labelPos, { color: o.golden ? '#ffe29a' : '#ffe6b8', size: 0.12 });
      // keep identifications happening at mid distances so the eyes keep travelling near <-> far
      if (d > 15) this.size *= 0.92; else if (d < 6) this.size *= 1.07;
      if (this.streak % 6 === 0) this.approach = Math.max(6, this.approach * 0.94);
    } else {
      o.wrongs++;
      this.streak = 0;
      app.score.miss(o.pos, true);
      o.l.uniforms.uFlashColor.value.set(1.0, 0.55, 0.55);
      o.flash = 0.8;
      setTimeout(() => o.l.uniforms.uFlashColor.value.set(0.62, 1.0, 0.82), 400);
    }
    this.size = clamp(this.size, 0.08, 0.9);
  }

  miss(o) {
    this.stats.trials++;
    this.streak = 0;
    this.app.score.miss(o.pos, false);
    this.size = clamp(this.size * 1.1, 0.08, 0.9);
    this.approach = Math.min(13, this.approach * 1.04);
    o.state = 'sink'; o.rt = 0;
  }

  catchBeacon() {
    const app = this.app, b = this.beacon;
    const pos = b.g.mesh.position.clone();
    const pts = app.score.reward(300, null);
    this.stats.score += pts;
    this.stats.metrics.beacons = (this.stats.metrics.beacons || 0) + 1;
    app.audio.fanfare(pos);
    app.fx.text('遠くの灯り +' + pts, this.at(b.az * 0.5, 4, 3), { color: '#fff3c0', size: 0.13 });
    b.g.mesh.removeFromParent();
    this.beacon = null;
    this.nextBeacon = rand(26, 36);
  }

  stop() {
    const s = this.app.store.data;
    s.lanternSize = +this.size.toFixed(3);
    s.lanternApproach = +this.approach.toFixed(2);
    const ds = this.distances;
    this.stats.metrics.meanDistance = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
    this.stats.metrics.size = this.size;
    this.app.store.data.totals.lanterns += this.stats.correct;
    return super.stop();
  }
}
