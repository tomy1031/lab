// js/game.js — one play of one song: targets come in, gloves hit them, every hit is timed against the
// music, and at the end the timing is analysed separately for on-beats, "&" offbeats and sixteenths.
//
// Motion: a target slows down as it comes (distance d(τ) = v0·τ + k·τ² for τ seconds before its beat), so
// it is fast and readable far away and slow (v0) in the zone you hit it. That keeps early and late hits
// physically reachable (±0.15 s is ±0.4 m), so the timing you see in the results is really yours.
import * as THREE from 'three';
import { HAND_COLOR } from './targets.js';
import { subOf } from './chart.js';
import { songById } from './songs.js';
import { MODES } from './chart.js';

export const WIN = { easy: { p: 60, g: 110, ok: 170 }, normal: { p: 45, g: 90, ok: 150 }, hard: { p: 35, g: 75, ok: 130 } };
const MIN_SPEED = { easy: 0.45, normal: 0.75, hard: 1.0 };
const DIP = { easy: 0.12, normal: 0.17, hard: 0.21 };
const POINTS = { perfect: 100, great: 70, good: 40, weak: 25, bad: 10 };
const ACC = { perfect: 1, great: 0.75, good: 0.45, weak: 0.3, bad: 0.15, miss: 0 };
const WORD = { perfect: 0, great: 1, good: 2, bad: 3, miss: 4, weak: 5, dodge: 6, ouch: 7 };
const RT = 0.13, RG = 0.075;

export function speedOf(diff) {
  const v0 = { easy: 2.2, normal: 2.6, hard: 3.0 }[diff];
  const lead = { easy: 2.2, normal: 1.9, hard: 1.6 }[diff];
  const D = 12;
  return { v0, lead, k: (D - v0 * lead) / (lead * lead) };
}

const v3 = () => new THREE.Vector3();

export class PlaySession {
  constructor(app, { notes, player, opts, title, eyeY, auto = false, keys = false }) {
    this.app = app;
    this.notes = notes;
    this.player = player;
    this.opts = opts;
    this.title = title;
    this.eyeY = eyeY;
    this.auto = auto;
    this.keys = keys;
    this.win = WIN[opts.diff];
    this.speed = speedOf(opts.diff);
    this.active = [];
    this.next = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastTiming = '';
    this.resumeFrom = -Infinity;
    this.prevT = null;
    this.done = false;
    this.judged = [];
    this.lastT = notes.length ? notes[notes.length - 1].t : 0;
    this.endT = Math.min(player.duration - 0.5, this.lastT + player.grid.spb * 6);
    this.cat = {};
    for (const k of ['on', 'and', 'six']) this.cat[k] = { n: 0, hit: 0, d: [] };
    for (const n of notes) if (n.kind !== 'duck') this.cat[n.sub].n++;
    this.ducks = notes.filter((n) => n.kind === 'duck').length;
    this.dodged = 0;
    this.punches = notes.length - this.ducks;
    this.hits = 0;
    this.accSum = 0;
    this.botted = new Set();
  }

  dist(tau) { const { v0, k } = this.speed; return tau >= 0 ? v0 * tau + k * tau * tau : v0 * tau; }

  // after a pause the song restarts at fromT (after a count-in): targets come in again from far away
  rewind(fromT) {
    for (const n of this.active) if (n.obj) { this.app.targets.release(n.obj); n.obj = null; }
    this.active = [];
    for (const n of this.notes) {
      if (n.state === 'wait' && n.t < fromT + 0.05) {
        n.state = 'skip';
        if (n.kind === 'duck') this.ducks--; else { this.cat[n.sub].n--; this.punches--; }
      }
    }
    this.next = this.notes.findIndex((n) => n.state === 'wait');
    if (this.next < 0) this.next = this.notes.length;
    this.gNext = this.next;
    this.resumeFrom = fromT;
    this.prevT = null;
    this.botted.clear();
  }

  // target centre in playRoot coordinates at song time t
  posAt(n, t, out = v3()) {
    const tau = n.t - t;
    if (n.kind === 'duck') return out.set(0, this.eyeY - 0.08, -this.dist(tau));
    return out.set(n.x, this.eyeY + n.y, n.z - this.dist(tau));
  }

  guideLevel(n) {
    const g = this.opts.guide;
    if (g === 'off') return 0;
    if (g === 'on') return 1;
    const f = n.t / Math.max(1, this.lastT);
    return f < 0.3 ? 1 : f > 0.75 ? 0 : 1 - (f - 0.3) / 0.45;
  }

  update(songT, dt) {
    const app = this.app;
    const prevT = this.prevT === null ? songT : this.prevT;
    this.prevT = songT;
    // guide clicks, scheduled a little ahead on the audio clock
    if (this.player.seg) {
      this.gNext = this.gNext || 0;
      while (this.gNext < this.notes.length && this.notes[this.gNext].t - songT <= 1.0) {
        const n = this.notes[this.gNext++];
        if (n.kind === 'duck' || n.t < this.resumeFrom || n.t <= songT) continue;
        app.audio.guideClick(this.player.seg, this.player.ctxTime(n.t), n.sub, this.guideLevel(n));
      }
    }
    // spawn
    while (this.next < this.notes.length && this.notes[this.next].t - songT <= this.speed.lead) {
      const n = this.notes[this.next++];
      if (n.state !== 'wait') continue;
      app.targets.spawn(n);
      n.spawnT = songT;
      this.active.push(n);
    }
    // autoplay: move the gloves (PC) so they really hit, through the same collision code
    if (this.auto) this.bot(songT);
    // hits
    if (!this.keys) this.collide(prevT, songT);
    // move, judge misses and ducks
    const p = v3();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const n = this.active[i];
      const o = n.obj;
      const tau = n.t - songT;
      if (!o) { this.active.splice(i, 1); continue; }
      this.posAt(n, songT, p);
      o.g.position.copy(p);
      o.shadow.position.set(p.x, 0.013, p.z);
      if (n.kind === 'duck') {
        if (n.state === 'wait' && tau <= 0) this.judgeDuck(n);
        if (tau < -0.7) { app.targets.release(o); this.active.splice(i, 1); }
        continue;
      }
      const age = songT - n.spawnT;
      if (n.state === 'wait') {
        o.g.scale.setScalar(Math.min(1, 0.05 + age * 4));
        const near = 1 - Math.min(1, Math.max(0, tau) / 0.5);
        o.pad.material.emissive.set(HAND_COLOR[n.hand]).multiplyScalar(0.4 + near * 0.5);
        o.ring.visible = tau > -0.03 && tau < 0.6;
        o.ring.scale.setScalar(1 + Math.max(0, tau) * 2.6);
        o.g.rotation.z = Math.sin(songT * 2 + n.id) * 0.08;
        if (tau < -this.win.ok / 1000 - 0.05) this.miss(n);
      } else if (n.state === 'miss') {
        o.g.scale.multiplyScalar(Math.exp(-dt * 4));
        o.g.position.y -= (songT - n.missT) * 0.5;
        if (songT - n.missT > 0.45) { app.targets.release(o); this.active.splice(i, 1); }
      }
    }
    if (songT > this.endT && !this.done) { this.done = true; app.finish(this.results()); }
  }

  // sweep each glove from its last position to its current one against each target's motion
  collide(t0, t1) {
    if (t1 <= t0) return;
    const root = this.app.playRoot;
    for (const side of ['L', 'R']) {
      const g = this.app.input.gloves[side];
      if (!g.tracked) continue;
      const a = root.worldToLocal(g.prev.clone()), b = root.worldToLocal(g.pos.clone());
      for (const n of this.active) {
        if (n.state !== 'wait' || n.kind === 'duck') continue;
        if (n.hand !== side && this.opts.diff !== 'easy') continue;
        const tau = n.t - t1;
        if (tau > 0.5 || tau < -0.3) continue;
        const c0 = this.posAt(n, t0), c1 = this.posAt(n, t1);
        const r0 = a.clone().sub(c0), r1 = b.clone().sub(c1);
        const D = r1.clone().sub(r0);
        const rs = RT + RG;
        const A = D.lengthSq(), B = 2 * r0.dot(D), Cc = r0.lengthSq() - rs * rs;
        let u = null;
        if (Cc <= 0) u = 0;
        else if (A > 1e-9) {
          const disc = B * B - 4 * A * Cc;
          if (disc >= 0) { const s = (-B - Math.sqrt(disc)) / (2 * A); if (s >= 0 && s <= 1) u = s; }
        }
        if (u === null) continue;
        const dirW = new THREE.Vector3(...n.dir).applyQuaternion(root.quaternion);
        const vAlong = g.speedAlong(dirW);
        const hitT = t0 + u * (t1 - t0);
        const comp = Math.min(0.06, (rs * 0.92) / (this.speed.v0 + Math.max(0, vAlong))); // contact starts before the centres meet
        this.judgeHit(n, hitT + comp, side, vAlong, c1);
      }
    }
  }

  // PC keys: the nearest waiting target of that hand inside the window
  press(side, songT) {
    let best = null, bd = Infinity;
    for (const n of this.active) {
      if (n.state !== 'wait' || n.kind === 'duck') continue;
      if (n.hand !== side && this.opts.diff !== 'easy') continue;
      const d = Math.abs(songT - n.t);
      if (d < bd && d <= this.win.ok / 1000) { bd = d; best = n; }
    }
    const root = this.app.playRoot;
    if (best) {
      const to = root.localToWorld(this.posAt(best, best.t));
      this.app.desk.punch(side, to, new THREE.Vector3(...best.dir).applyQuaternion(root.quaternion).toArray(), 0.05);
      this.judgeHit(best, songT, side, 9, this.posAt(best, songT));
    } else {
      const cam = this.app.deskHead || this.app.camera;
      const to = new THREE.Vector3(side === 'L' ? -0.17 : 0.17, -0.12, -0.55).applyQuaternion(cam.quaternion).add(cam.position);
      this.app.desk.punch(side, to, new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).toArray(), 0.06);
    }
  }

  bot(songT) {
    const root = this.app.playRoot;
    for (const n of this.active) {
      if (n.state !== 'wait' || this.botted.has(n.id)) continue;
      const lead = n.t - songT;
      if (n.kind === 'duck') { if (lead < 0.35) { this.botted.add(n.id); this.app.duck(0.7); } continue; }
      if (lead > 0.1 || lead < 0) continue;
      const side = n.hand;
      if (this.app.desk.busy(side)) continue;
      this.botted.add(n.id);
      const to = root.localToWorld(this.posAt(n, n.t));
      this.app.desk.punch(side, to, new THREE.Vector3(...n.dir).applyQuaternion(root.quaternion).toArray(), lead);
    }
  }

  grade(ms, weak) {
    const a = Math.abs(ms), w = this.win;
    let g = a <= w.p ? 'perfect' : a <= w.g ? 'great' : a <= w.ok ? 'good' : 'bad';
    if (weak && (g === 'perfect' || g === 'great')) g = 'weak';
    return g;
  }

  judgeHit(n, hitT, side, vAlong, cLocal) {
    const app = this.app;
    const ms = Math.round((hitT - n.t) * 1000 - app.store.data.offsetMs);
    const weak = vAlong < MIN_SPEED[this.opts.diff];
    const g = this.grade(ms, weak);
    n.state = 'hit';
    n.ms = ms;
    n.grade = g;
    this.hits++;
    const c = this.cat[n.sub];
    c.hit++;
    c.d.push(ms);
    this.accSum += ACC[g];
    if (g === 'bad') this.combo = 0;
    else { this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); }
    const mult = this.mult();
    this.score += Math.round(POINTS[g] * mult * (n.sub === 'on' ? 1 : 1.2));
    const early = ms < -this.win.p ? 8 : ms > this.win.p ? 9 : -1;
    this.lastTiming = `${ms > 0 ? '+' : ''}${ms}ms ${ms < -this.win.p ? 'はやい' : ms > this.win.p ? 'おそい' : 'ジャスト'}`;
    // feedback
    const col = HAND_COLOR[n.hand];
    app.fx.burst(cLocal, col, g === 'perfect' ? 30 : 20, g === 'perfect' ? 2.2 : 1.7, [n.dir[0] * 0.6, n.dir[1] * 0.6, n.dir[2] * 0.6]);
    app.fx.ring(cLocal, g === 'perfect' ? '#fff6c8' : col);
    app.fx.pop(cLocal, WORD[g], early);
    app.targets.release(n.obj);
    n.obj = null;
    const glove = app.input.gloves[side];
    glove.glow = 1;
    glove.haptic(g === 'perfect' ? 1 : g === 'weak' ? 0.35 : 0.7, g === 'perfect' ? 45 : 30);
    const ch = this.player.chordAt(n.t);
    const midi = ch ? 72 + ((ch.root % 12) + (n.sub === 'on' ? 0 : n.sub === 'and' ? 7 : 4)) % 12 : 76;
    app.audio.hitSound(g, midi, n.hand === 'L' ? -1 : 1);
    if (this.combo > 0 && this.combo % 25 === 0) app.audio.chime();
    this.judged.push(n);
  }

  miss(n) {
    n.state = 'miss';
    n.missT = this.prevT;
    n.grade = 'miss';
    this.combo = 0;
    n.obj.pad.material.color.set('#7a807c');
    n.obj.pad.material.emissive.set('#000');
    n.obj.ring.visible = false;
    this.app.fx.pop(n.obj.g.position, WORD.miss);
    this.app.audio.play('whiff', this.app.audio.now(), 0.35);
    this.judged.push(n);
  }

  judgeDuck(n) {
    const app = this.app;
    const head = app.playRoot.worldToLocal(app.input.head.clone());
    const ok = head.y < this.eyeY - DIP[this.opts.diff] || this.opts.seated;
    n.state = ok ? 'dodge' : 'ouch';
    n.grade = ok ? 'dodge' : 'ouch';
    const at = new THREE.Vector3(0, this.eyeY + 0.25, -0.6);
    if (ok) {
      this.dodged++;
      this.accSum += 1;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += Math.round(60 * this.mult());
      app.fx.pop(at, WORD.dodge);
      app.audio.play('whoosh', app.audio.now(), 0.5);
    } else {
      this.combo = 0;
      app.fx.pop(at, WORD.ouch);
      app.audio.play('thunk', app.audio.now(), 0.6);
      for (const s of ['L', 'R']) app.input.gloves[s].haptic(0.8, 120);
    }
    this.judged.push(n);
  }

  mult() { return this.combo >= 50 ? 4 : this.combo >= 25 ? 3 : this.combo >= 10 ? 2 : 1; }

  // HUD: score, combo, count position in the bar and which eighths of this bar have punches
  hud(songT) {
    const grid = this.player.grid;
    const beat = (songT - grid.t0) / grid.spb;
    const barI = Math.floor(beat / 4);
    const pos = beat < 0 ? -1 : Math.floor((beat - barI * 4) * 2 + 0.25) % 8;
    const marks = {};
    for (const n of this.notes) {
      if (n.bar < barI) continue;
      if (n.bar > barI) break;
      if (n.kind !== 'duck' && n.step % 2 === 0) marks[n.step / 2] = n.hand;
    }
    let count = '';
    if (songT < this.resumeFrom) count = `${Math.ceil((this.resumeFrom - songT) / grid.spb)}`;
    return { score: this.score, combo: this.combo, mult: this.mult(), pos, marks, timing: this.lastTiming, progress: Math.max(0, Math.min(1, songT / this.endT)), count };
  }

  results() {
    const cat = {};
    for (const [k, c] of Object.entries(this.cat)) {
      const n = c.d.length;
      const mean = n ? c.d.reduce((a, b) => a + b, 0) / n : 0;
      const sd = n > 1 ? Math.sqrt(c.d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
      const hist = new Array(13).fill(0);
      for (const d of c.d) hist[Math.max(0, Math.min(12, Math.round(d / 25) + 6))]++;
      cat[k] = { n: c.n, hit: c.hit, mean: Math.round(mean), sd: Math.round(sd), hist };
    }
    const total = this.punches + this.ducks;
    const acc = total ? Math.round((this.accSum / total) * 100) : 0;
    const rank = acc >= 92 ? 'S' : acc >= 80 ? 'A' : acc >= 65 ? 'B' : acc >= 45 ? 'C' : 'D';
    const dur = Math.max(1, this.endT);
    const res = {
      title: this.title, mode: this.opts.mode, diff: this.opts.diff, score: this.score, acc, rank, maxCombo: this.maxCombo,
      hits: this.hits, punches: this.punches, ducks: this.ducks, dodged: this.dodged, duration: dur,
      kcal: Math.round(7 * 60 * (dur / 3600)), cat,
    };
    res.advice = advise(res, this.opts, this.app.store.data.history);
    return res;
  }
}

function advise(r, o, history) {
  const L = { on: '表拍', and: '裏拍', six: '16分の裏' };
  const main = o.mode === 'on' ? 'on' : o.mode === 'sync' ? (r.cat.six.n > r.cat.and.n ? 'six' : r.cat.and.n ? 'and' : 'on') : r.cat.and.n ? 'and' : 'on';
  const c = r.cat[main];
  const out = [];
  if (!c.n) return 'おつかれさまでした！';
  const rate = c.hit / c.n;
  if (rate < 0.6) out.push(`${L[main]}は ${c.n} 回中 ${c.hit} 回。まずは「やさしい」と「ガイド音あり」で、同じパターンを体に入れましょう。`);
  else if (c.mean < -25) out.push(`${L[main]}が平均 ${-c.mean}ms 早めです。${main === 'on' ? '拍を待ってから打つつもりで。' : 'キック（表拍）でひざを軽く曲げ、ひざが伸びるところでパンチすると、拍と拍のまん中に入ります。'}`);
  else if (c.mean > 25) out.push(`${L[main]}が平均 ${c.mean}ms 遅れぎみ。${main === 'on' ? 'キックの「ドン」と同時に拳が届くように。' : 'ひとつ前の拍で構えて、ハイハットの「チッ」と同時に拳が届くように。'}`);
  else if (c.sd > 45) out.push(`${L[main]}の平均はほぼぴったり。ばらつきが ±${c.sd}ms あるので、同じパターンが続く4小節の2小節目から、体で覚えるつもりで。`);
  else out.push(`${L[main]}がしっかり取れています（平均 ${c.mean > 0 ? '+' : ''}${c.mean}ms、ばらつき ±${c.sd}ms）。${o.guide !== 'off' ? 'ガイド音を「なし」にして' : o.diff !== 'hard' ? 'むずかしさを上げて' : '別のリズムで'}挑戦してみましょう。`);
  if (r.cat.on.hit >= 4 && r.cat.and.hit >= 4 && Math.abs(r.cat.and.mean - r.cat.on.mean) > 30) {
    out.push(`表拍と裏拍の平均に ${Math.abs(r.cat.and.mean - r.cat.on.mean)}ms の差。裏拍だけ${r.cat.and.mean < r.cat.on.mean ? '急いで' : 'ためて'}しまうクセがあるようです。`);
  }
  const prev = [...history].reverse().find((h) => h.mode === o.mode && h[main] && h[main].hit >= 4);
  if (prev && c.hit >= 4) {
    const dv = prev[main].sd - c.sd;
    if (dv >= 5) out.push(`前回より ばらつきが ${dv}ms 小さくなりました。`);
  }
  void subOf; void songById; void MODES;
  return out.join(' ');
}
