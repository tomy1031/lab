// race/race.js — one race: the grid, intro / countdown / race / finish phases, laps and standings,
// kart-to-kart bumps, boost and jump pads, items, rubber-banding and the events the HUD and sound follow.
import * as THREE from 'three';
import { clamp, mod, makeRng, canvasTexture, hsl, disposeTree } from '../engine/util.js';
import { Particles } from '../engine/particles.js';
import { Kart, SPEED_CLASSES } from './kart.js';
import { AIDriver } from './ai.js';
import { ItemSystem } from './items.js';

export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
export const INTRO_TIME = 3.6, COUNT_TIME = 3.0;
const IDLE = { steer: 0, throttle: 0, brake: 0, drift: false, item: false };

export class Race {
  // entrants: [{ char, human }] in grid order (index 0 starts at the front)
  constructor({ scene, course, track, entrants, cls = SPEED_CLASSES.normal, laps = 3, seed = 1, attract = false, autoplay = false }) {
    this.scene = scene; this.course = course; this.track = track; this.cls = cls;
    this.laps = laps; this.attract = attract; this.autoplay = autoplay;
    this.rng = makeRng(seed);
    this.rnd = () => this.rng.next();
    this.listeners = [];
    this.phase = attract ? 'race' : 'intro';
    this.t = 0; this.raceTime = 0; this.phaseT = 0;
    this.finishCount = 0;
    this.doneT = 0;
    this.group = new THREE.Group(); this.group.name = 'race';
    scene.add(this.group);
    this.parts = { add: new Particles(2600, { additive: true }), soft: new Particles(1400, { additive: false }) };
    this.group.add(this.parts.add.points, this.parts.soft.points);
    this.dust = new THREE.Color(course.theme.dust || '#d8c8a8');

    this.karts = []; this.ais = new Map();
    const N = track.N;
    entrants.forEach((e, i) => {
      const k = new Kart(e.char, { index: i, isHuman: !!e.human, cls, vrSeat: !!e.vrSeat });
      const back = 3.5 + i * 3.3;
      const side = (i % 2 === 0 ? -1 : 1) * track.HW[0] * 0.38;
      k.placeOnTrack(track, mod(-back / track.step, N), side);
      k.gridSlot = i;
      this.karts.push(k);
      this.group.add(k.rig.root);
      if (!e.human || autoplay) {
        const [a, b] = cls.ai;
        const skill = e.human ? 1 : a + (b - a) * this.rng.next();
        this.ais.set(k, new AIDriver(k, { skill, aggr: cls.aggr, seed: seed * 31 + i * 7 }));
      }
      k.lapTimes = []; k.lapStart = 0; k.lapMax = 1; k.lap = 1; k.rocket = false;
    });
    this.humans = this.karts.filter((k) => k.isHuman);
    this.items = new ItemSystem(this);
    this.group.add(this.items.group);
    this.buildPads();
    this.ctlRiseT = -1;
    this.updateStandings();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }

  buildPads() {
    const tr = this.track, N = tr.N;
    this.pads = [];
    const arrow = canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#ff9d1c'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#fff36b';
      for (let y = -1; y < 2; y++) {
        const o = y * s / 2;
        ctx.beginPath(); ctx.moveTo(s * 0.15, o + s * 0.7); ctx.lineTo(s * 0.5, o + s * 0.35); ctx.lineTo(s * 0.85, o + s * 0.7);
        ctx.lineTo(s * 0.85, o + s * 0.9); ctx.lineTo(s * 0.5, o + s * 0.55); ctx.lineTo(s * 0.15, o + s * 0.9); ctx.fill();
      }
    });
    arrow.repeat.set(1, 1.5);
    const padMat = new THREE.MeshBasicMaterial({ map: arrow, color: new THREE.Color(1.6, 1.4, 1.2), toneMapped: false });
    for (const b of this.course.boosts || []) {
      const prog = mod(b.at * N, N), d = (b.d || 0) * tr.HW[Math.floor(prog)];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 6), padMat);
      m.geometry.rotateX(-Math.PI / 2);
      tr.placeOn(m, prog, d, 0.07);
      this.group.add(m);
      this.pads.push({ kind: 'boost', prog, d, mesh: m });
    }
    const chev = canvasTexture(128, (ctx, s) => {
      for (let i = 0; i < 8; i++) { ctx.fillStyle = hsl(i / 8, 0.9, 0.6).getStyle(); ctx.fillRect(0, (i * s) / 8, s, s / 8); }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.moveTo(s * 0.1, s * 0.75); ctx.lineTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.9, s * 0.75); ctx.lineTo(s * 0.9, s * 0.92); ctx.lineTo(s * 0.5, s * 0.47); ctx.lineTo(s * 0.1, s * 0.92); ctx.fill();
    });
    const jumpMat = new THREE.MeshBasicMaterial({ map: chev, color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: false });
    for (const j of this.course.jumps || []) {
      const prog = mod(j.at * N, N);
      const w = tr.HW[Math.floor(prog)] * 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.2), jumpMat);
      m.geometry.rotateX(-Math.PI / 2);
      tr.placeOn(m, prog, 0, 0.08);
      this.group.add(m);
      // little lit posts on both sides
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff36b').multiplyScalar(2), toneMapped: false }));
        tr.placeOn(post, prog, s * (w / 2 + 0.6), 1.1);
        this.group.add(post);
      }
      this.pads.push({ kind: 'jump', prog, d: 0, mesh: m });
    }
    this.arrowTex = arrow; this.chevTex = chev;
  }

  standings() { return this.order; }
  updateStandings() {
    this.order = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceDist - a.raceDist;
    });
    this.order.forEach((k, i) => { k.place = i + 1; });
  }

  get started() { return this.phase === 'race' || this.phase === 'finish' || this.phase === 'done'; }

  skipIntro() { if (this.phase === 'intro') { this.phase = 'countdown'; this.phaseT = 0; this.emit('count', { n: 3 }); } }

  // fixed physics step. humanCtl: Map kart → controls
  step(dt, humanCtl) {
    this.t += dt; this.phaseT += dt;
    const tr = this.track, N = tr.N;
    if (this.phase === 'intro') {
      if (this.phaseT >= INTRO_TIME) { this.phase = 'countdown'; this.phaseT = 0; this.emit('count', { n: 3 }); }
      for (const k of this.karts) k.step(0, IDLE, this);
      return;
    }
    if (this.phase === 'countdown') {
      const before = Math.floor(this.phaseT - dt), now = Math.floor(this.phaseT);
      if (now > before && now < 3 && now >= 1) this.emit('count', { n: 3 - now });
      for (const k of this.karts) {
        const c = humanCtl.get(k);
        const thr = c ? c.throttle > 0.5 : false;
        if (k.isHuman && c && !this.ais.has(k)) {
          if (thr && !k.thrPrev) k.thrStart = this.phaseT;
          if (!thr) k.thrStart = -1;
          k.thrPrev = thr;
        }
        k.step(dt, IDLE, this);
      }
      if (this.phaseT >= COUNT_TIME) {
        this.phase = 'race'; this.phaseT = 0; this.raceTime = 0;
        for (const k of this.karts) {
          const ai = this.ais.get(k);
          const rocket = ai ? this.rng.next() < 0.25 + ai.skill * 0.3 : (k.thrStart >= 1.9 && k.thrPrev);
          if (rocket) { k.giveBoost(1.1); k.rocket = true; }
        }
        this.emit('go');
      }
      return;
    }

    this.raceTime += dt;
    // rubber band: CPUs ease toward the lead human
    const lead = this.humans.length ? this.humans.reduce((a, b) => (a.raceDist > b.raceDist ? a : b)) : null;
    for (const k of this.karts) {
      const ai = this.ais.get(k);
      if (!ai || k.isHuman) { k.rubber = 1; continue; }
      let rb = 1;
      if (lead && !lead.finished && !this.attract) {
        const diffM = (lead.raceDist - k.raceDist) * tr.step;
        rb = diffM > 0 ? 1 + clamp(diffM / 260, 0, 1) * 0.1 : 1 - clamp(-diffM / 320, 0, 1) * 0.07;
      }
      k.rubber = ai.skill * rb;
    }

    for (const k of this.karts) {
      let c;
      if (k.isHuman && !this.autoplay && !k.finished) c = humanCtl.get(k) || IDLE;
      else c = (this.ais.get(k) || this.finishAI(k)).update(dt, this);
      k.step(dt, c, this);
      if (c.item && !k.itemLatch) this.items.use(k);
      k.itemLatch = !!c.item && k.isHuman;
      this.checkPads(k);
      this.checkLap(k);
      // stuck → respawn
      if (!k.finished || this.attract) {
        k.stuckT += dt;
        if (k.stuckT > 1) {
          const moved = k.raceDist - k.stuckRef;
          k.stuckRef = k.raceDist; k.stuckT = 0;
          const driver = !k.isHuman || this.ais.has(k);
          // CPUs: back on the road after 3 s without progress. You: only when the kart has really stopped for 4 s
          const stuck = driver ? moved < 1.2 : moved < 0.6 && Math.abs(k.speed) < 3 && k.throttle > 0.5;
          k.stuckCount = stuck && k.spin <= 0 ? (k.stuckCount || 0) + 1 : 0;
          if (k.stuckCount >= (driver ? 3 : 4)) { k.stuckCount = 0; k.respawn(tr); }
        }
      }
    }
    this.collide(dt);
    this.items.step(dt);
    this.updateStandings();

    if (this.phase === 'finish') {
      this.doneT += dt;
      const allDone = this.karts.every((k) => k.finished);
      if (allDone || this.doneT > 14) this.finishRace();
    }
  }

  finishAI(k) {
    if (!this.ais.has(k)) this.ais.set(k, new AIDriver(k, { skill: 0.9, aggr: 0, seed: 99 }));
    return this.ais.get(k);
  }

  checkPads(k) {
    if (k.air) return;
    const N = this.track.N;
    for (const p of this.pads) {
      let ds = Math.abs(k.prog - p.prog); if (ds > N / 2) ds = N - ds;
      if (p.kind === 'boost') {
        if (ds < 1.5 && Math.abs(k.loc.d - p.d) < 2.4) {
          if (k.lastPad !== p || this.t - k.lastPadT > 1) { k.giveBoost(1.25); k.lastPad = p; k.lastPadT = this.t; if (k.isHuman) this.emit('pad', { kart: k }); }
        }
      } else if (ds < 0.9 && k.speed > 8 && (k.lastPad !== p || this.t - k.lastPadT > 1)) {
        k.vy = 9 + k.speed * 0.14; k.air = true; k.padJump = true; k.lastPad = p; k.lastPadT = this.t;
        if (k.isHuman) this.emit('jump', { kart: k });
      }
    }
  }

  checkLap(k) {
    const N = this.track.N;
    const lap = Math.max(1, Math.floor(k.raceDist / N) + 1);
    if (lap > k.lapMax) {
      k.lapMax = lap;
      k.lapTimes.push(this.raceTime - k.lapStart);
      k.lapStart = this.raceTime;
      if (lap > this.laps && !k.finished && !this.attract) {
        k.finished = true;
        k.finishTime = this.raceTime;
        this.finishCount++;
        k.finishPlace = this.finishCount;
        this.emit('kartfinish', { kart: k, place: this.finishCount });
        if (k.isHuman) {
          this.emit('finish', { kart: k, place: this.finishCount });
          if (this.humans.every((h) => h.finished) && this.phase === 'race') { this.phase = 'finish'; this.doneT = 0; }
        }
      } else if (k.isHuman && !k.finished) {
        this.emit('lap', { kart: k, lap, final: lap === this.laps });
      }
    }
    k.lap = Math.min(this.laps, lap);
  }

  collide() {
    const ks = this.karts, R = 1.9;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i];
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R || Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d, over = R - d;
        const wa = a.weight, wb = b.weight, ws = wa + wb;
        a.pos.x -= nx * over * (wb / ws); a.pos.z -= nz * over * (wb / ws);
        b.pos.x += nx * over * (wa / ws); b.pos.z += nz * over * (wa / ws);
        const vrel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (vrel < 0) {
          const jimp = (-1.6 * vrel) / (1 / wa + 1 / wb);
          a.vel.x -= (nx * jimp) / wa; a.vel.z -= (nz * jimp) / wa;
          b.vel.x += (nx * jimp) / wb; b.vel.z += (nz * jimp) / wb;
          if ((a.isHuman || b.isHuman) && -vrel > 3) this.emit('bump', { a, b, power: -vrel });
        }
        if (a.comet > 0 && b.comet <= 0 && b.hit('spin')) this.emit('shothit', { kart: b, hurt: true, by: a, kind: 'comet' });
        if (b.comet > 0 && a.comet <= 0 && a.hit('spin')) this.emit('shothit', { kart: a, hurt: true, by: b, kind: 'comet' });
      }
    }
  }

  finishRace() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    // karts still racing are ranked by how far they got
    const rest = this.karts.filter((k) => !k.finished).sort((a, b) => b.raceDist - a.raceDist);
    for (const k of rest) {
      k.finished = true;
      const remaining = Math.max(0, (this.laps + 1) * this.track.N - k.raceDist) * this.track.step;
      k.finishTime = this.raceTime + remaining / Math.max(10, k.maxSpeed * 0.85);
      k.estimated = true;
    }
    this.updateStandings();
    this.emit('done', { order: this.order });
  }

  // particle bursts
  burst(pos, kind) {
    const P = this.parts.add;
    const n = kind === 'box' ? 18 : 14;
    for (let i = 0; i < n; i++) {
      const c = kind === 'box' ? hsl(Math.random(), 0.9, 0.7) : kind === 'pudding' ? new THREE.Color('#ffd36b') : kind === 'homing' ? new THREE.Color(2, 2, 0.6) : new THREE.Color(0.6, 1.4, 2);
      P.emit(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 10, Math.random() * 7, (Math.random() - 0.5) * 10, c, 0.5, 0.6, { gravity: 12, drag: 1 });
    }
  }

  // after the camera has moved: a kart the camera is passing through is hidden for that moment instead of
  // filling the screen with its insides (hysteresis so it can't blink at the threshold)
  cameraCull(cam) {
    for (const k of this.karts) {
      if (k.isHuman) { k.camHide = false; continue; }
      const d = Math.hypot(k.pos.x - cam.x, k.pos.y + 0.9 - cam.y, k.pos.z - cam.z);
      k.camHide = k.camHide ? d < 1.8 : d < 1.3;
      k.rig.visual.visible = (k.blinkOn ?? true) && !k.camHide;
    }
  }

  // per render frame
  frame(dt) {
    for (const k of this.karts) {
      k.syncVisual(dt, this.track);
      k.fx(dt, this.parts, this.dust);
      // kart events → sound / HUD
      if (k.events.length) {
        for (const e of k.events) this.emit('kart:' + e, { kart: k });
        k.events.length = 0;
      }
    }
    this.items.frame(dt, this.parts);
    this.parts.add.update(dt);
    this.parts.soft.update(dt);
    if (this.arrowTex) this.arrowTex.offset.y -= dt * 1.6;
    if (this.chevTex) this.chevTex.offset.y -= dt * 1.2;
  }

  dispose() { this.scene.remove(this.group); disposeTree(this.group); }
}
