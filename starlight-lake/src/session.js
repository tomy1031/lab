import * as THREE from 'three';
import { Panel, wrapText, roundRect } from './ui.js';
import { FONT, MODULE_INFO, PLAN_VR, PLAN_SCREEN } from './config.js';
import { noteOf } from './audio.js';
import { LanternModule } from './games/lantern.js';
import { SpiritsModule } from './games/spirits.js';
import { GatesModule } from './games/gates.js';
import { DepthModule } from './games/depth.js';
import { CometsModule } from './games/comets.js';
import { RestModule } from './games/rest.js';

const MODULES = { lantern: LanternModule, spirits: SpiritsModule, gates: GatesModule, depth: DepthModule, comets: CometsModule, rest: RestModule };

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const ORI_LABEL = { 0: '縦', 45: '斜／', 90: '横', 135: '斜＼' };

/** Score and combo. Rising pentatonic bells reward streaks: the sound of flow. */
export class Score {
  constructor(app) { this.app = app; this.reset(); }
  reset() { this.points = 0; this.combo = 0; this.best = 0; this.dirty = true; }
  reward(base, pos) {
    const app = this.app;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    const mult = 1 + Math.min(this.combo, 30) * 0.04;
    const pts = Math.round(base * mult);
    this.points += pts;
    const step = this.combo <= 15 ? this.combo : 10 + (this.combo % 6);
    app.audio.bell(pos, { midi: noteOf(step), vel: 0.42, dur: 1.6 });
    app.env.platform.pulse(0.25);
    if (this.combo % 10 === 0) {
      app.audio.fanfare(pos);
      const u = app.uiPlacement(1.8, 9, 0.5, 0.13, 0.3);
      app.fx.text(`${this.combo} コンボ!`, app.stagePoint(0, u.el, u.dist), { color: '#c8f0ff', size: 0.13 * u.dist / 1.8, life: 1.6 });
    }
    this.dirty = true;
    return pts;
  }
  miss(pos, wrong) {
    if (wrong) this.app.audio.soft(pos);
    this.combo = 0;
    this.dirty = true;
  }
  add(n) { this.points += n; this.dirty = true; }
}

export class Hud {
  constructor(app) {
    this.app = app;
    this.state = { title: '', points: 0, combo: 0, left: '' };
    this.panel = new Panel({
      w: 0.66, h: 0.075, px: 1024, glass: false,
      draw: (g, W, H) => {
        const d = this.state;
        g.fillStyle = 'rgba(8,14,34,0.55)';
        roundRect(g, 4, 4, W - 8, H - 8, (H - 8) / 2); g.fill();
        g.font = `500 44px ${FONT}`; g.textBaseline = 'middle';
        g.fillStyle = '#bcd8ff'; g.textAlign = 'left';
        g.fillText(d.title || '', 38, H / 2 + 2);
        g.textAlign = 'center'; g.fillStyle = '#f2f8ff'; g.font = `700 50px ${FONT}`;
        g.fillText(`✦ ${d.points.toLocaleString()}`, W * 0.52, H / 2 + 2);
        g.font = `500 42px ${FONT}`; g.textAlign = 'right';
        g.fillStyle = d.combo >= 5 ? '#9fe8ff' : '#9fb4d8';
        g.fillText(`${d.combo > 1 ? '×' + d.combo + '  ' : ''}${d.left}`, W - 38, H / 2 + 2);
      },
    });
    app.ui.add(this.panel);
    this.panel.visible = false;
    this.acc = 0;
  }
  update(dt, title, leftSec) {
    const s = this.app.score;
    this.acc += dt;
    const left = leftSec != null ? fmtTime(Math.max(0, leftSec)) : '';
    if (s.dirty || this.acc > 0.5 || title !== this.state.title) {
      if (s.dirty || left !== this.state.left || title !== this.state.title) {
        this.state = { title, points: s.points, combo: s.combo, left };
        this.panel.redraw();
      }
      s.dirty = false; this.acc = 0;
    }
    const u = this.app.uiPlacement(1.45, -21, this.panel.w, this.panel.h, 0.5);
    const p = this.app.stagePoint(0, u.el, u.dist);
    this.panel.mesh.position.copy(p);
    this.panel.mesh.lookAt(this.app.head);
  }
}

export class Caption {
  constructor(app) {
    this.app = app;
    this.text = '';
    this.panel = new Panel({
      w: 1.1, h: 0.16, px: 1400, glass: false,
      draw: (g, W, H) => {
        if (!this.text) return;
        g.font = `500 54px ${FONT}`; g.textBaseline = 'middle';
        g.shadowColor = 'rgba(0,10,30,0.95)'; g.shadowBlur = 16;
        g.fillStyle = '#eef6ff';
        wrapText(g, this.text, W / 2, H / 2 - (g.measureText(this.text).width > W - 80 ? 32 : 0), W - 80, 64, { align: 'center' });
      },
    });
    this.panel.mesh.renderOrder = 55;
    app.ui.add(this.panel);
    this.life = 0;
  }
  show(text, sec = 3) { this.text = text; this.life = sec; this.max = sec; this.panel.redraw(); }
  update(dt) {
    this.life -= dt;
    const a = this.life > 0 ? Math.min(1, this.life / 0.5, (this.max - this.life) / 0.3 + 0.01) : 0;
    this.panel.mesh.material.opacity = a;
    this.panel.visible = a > 0.01;
    // below the stimuli in a headset; at the top edge of a small screen, clear of the gates
    const u = this.app.uiPlacement(1.6, this.app.view.kind === 'screen' ? 19.5 : -13.5, this.panel.w, this.panel.h, 0.8);
    this.panel.mesh.position.copy(this.app.stagePoint(0, u.el, u.dist));
    this.panel.mesh.lookAt(this.app.head);
  }
}

export class Director {
  constructor(app) {
    this.app = app;
    this.running = false;
    this.module = null;
    this.panel = null;
  }

  plan() {
    const kind = this.app.view.kind;
    const base = kind === 'screen' ? PLAN_SCREEN : PLAN_VR;
    const k = this.app.settings.minutes / 15;
    return base.map((s) => ({ ...s, dur: s.id === 'rest' ? s.dur : Math.round(s.dur * k) }))
      .filter((s) => this.app.view.stereo || s.id !== 'depth');
  }

  begin() {
    const app = this.app;
    this.closePanel();
    app.closeMenu();
    app.recenter();
    app.score.reset();
    this.steps = this.plan();
    this.total = this.steps.reduce((a, s) => a + s.dur + 5, 0);
    this.elapsed = 0;
    this.idx = -1;
    this.results = [];
    this.running = true;
    this.phaseFrom = app.env.phase;
    app.hud.panel.visible = true;
    this.nextStep();
  }

  nextStep() {
    const app = this.app;
    if (this.module) { this.results.push({ id: this.step.id, ...this.module.stop() }); this.module = null; }
    this.idx++;
    if (this.idx >= this.steps.length) { this.finish(); return; }
    this.step = this.steps[this.idx];
    this.stepTime = 0;
    this.card(this.step);
  }

  card(step) {
    const app = this.app;
    const info = MODULE_INFO[step.id];
    const seen = app.store.data.seen || (app.store.data.seen = {});
    const first = !seen[step.id];
    seen[step.id] = true;
    this.cardLeft = step.id === 'rest' ? 2.5 : first ? 9 : 5;
    const n = this.idx + 1, N = this.steps.length;
    this.showPanel(new Panel({
      w: 1.0, h: 0.56, px: 1100,
      draw: (g, W, H, panel) => {
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillStyle = '#8fb4e8'; g.font = `500 34px ${FONT}`;
        g.fillText(`第${n}章 / ${N}`, W / 2, 80);
        g.fillStyle = '#f4f9ff'; g.font = `700 84px ${FONT}`;
        g.fillText(info.title, W / 2, 180);
        g.fillStyle = '#a9c8f0'; g.font = `500 36px ${FONT}`;
        g.fillText(info.sub, W / 2, 236);
        g.fillStyle = '#e2ecff'; g.font = `400 36px ${FONT}`;
        wrapText(g, info.how, W / 2, 310, W - 140, 50, { align: 'center' });
        panel.button('go', W / 2 - 170, H - 120, 340, 84, 'はじめる', { primary: true, onClick: () => this.startStep() });
      },
    }), 1.8, 3);
    app.audio.bell(null, { midi: noteOf(7), vel: 0.25, dur: 2.5 });
  }

  startStep() {
    const app = this.app;
    if (this.module || !this.running) return;
    this.closePanel();
    app.captionBox.show('', 0);
    app.recenter(true);
    const M = MODULES[this.step.id];
    this.module = new M(app, this.step);
    this.module.start();
    this.stepTime = 0;
  }

  showPanel(panel, dist = 1.7, el = 0) {
    this.closePanel();
    this.panel = this.app.ui.add(panel);
    this.app.ui.placeInFront(panel, dist, el);
  }
  closePanel() { if (this.panel) { this.app.ui.remove(this.panel); this.panel = null; } }

  update(dt) {
    const app = this.app;
    if (!this.running) return;
    this.elapsed += dt;
    const target = Math.min(1, this.elapsed / this.total);
    app.env.setPhase(this.phaseFrom + (target - this.phaseFrom) * Math.min(1, this.elapsed / 8) * 1);
    if (!this.module) {
      this.cardLeft -= dt;
      if (this.cardLeft <= 0) this.startStep();
    } else {
      this.stepTime += dt;
      this.module.update(dt);
      if (this.stepTime >= this.step.dur || this.module.done) this.nextStep();
    }
    const left = this.total - this.elapsed;
    app.hud.update(dt, MODULE_INFO[this.step?.id]?.title ?? '', left);
  }

  /** End early (from the pause menu): the sky still turns to dawn. */
  endNow() {
    if (!this.running) return;
    if (this.module) { this.results.push({ id: this.step.id, ...this.module.stop() }); this.module = null; }
    this.finish();
  }

  finish() {
    const app = this.app;
    this.running = false;
    this.closePanel();
    app.hud.panel.visible = false;
    const summary = this.summarize();
    app.afterNight?.(this.results);
    this.dawn = { from: app.env.phase, t: 0 };
    const store = app.store.data;
    const prevLotus = app.lotusCount();
    if (summary.minutes >= 3) {
      store.history.push(summary);
      if (store.history.length > 400) store.history.shift();
      store.totals.nights++;
    }
    store.totals.minutes += summary.minutes;
    app.store.save();
    app.env.lotus.setCount(app.lotusCount(), prevLotus);
    if (app.lotusCount() > prevLotus) setTimeout(() => app.caption('新しい蓮の花が咲きました', 4), 2500);
    app.audio.fanfare(app.stagePoint(0, 10, 3));
    this.showSummary(summary);
  }

  summarize() {
    const by = (id) => this.results.filter((r) => r.id === id);
    const sum = (arr, f) => arr.reduce((a, r) => a + (f(r) || 0), 0);
    const spirits = by('spirits'), gates = by('gates'), lantern = by('lantern'), depth = by('depth'), comets = by('comets');
    const last = (arr) => arr[arr.length - 1];
    const lanternDists = lantern.flatMap((r) => r.metrics.distances || []);
    return {
      date: new Date().toISOString(),
      mode: this.app.view.kind,
      minutes: +(this.elapsed / 60).toFixed(1),
      score: this.app.score.points,
      bestCombo: this.app.score.best,
      lanterns: sum(lantern, (r) => r.correct),
      lanternDist: lanternDists.length ? +(lanternDists.reduce((a, b) => a + b, 0) / lanternDists.length).toFixed(1) : null,
      spirits: sum(spirits, (r) => r.metrics.hits),
      cs: last(spirits)?.metrics.sensitivity?.map((x) => ({ sf: x.sf, cs: Math.round(x.cs) })) ?? null,
      orientation: last(spirits)?.metrics.orientation ?? null,
      gatesAcc: gates.length ? Math.round(100 * sum(gates, (r) => r.correct) / Math.max(1, sum(gates, (r) => r.trials))) : null,
      gatesMs: last(gates) ? Math.round(last(gates).metrics.duration * 1000) : null,
      stereo: last(depth) ? Math.round(last(depth).metrics.stereoArcsec) : null,
      comet: last(comets) ? Math.round(last(comets).metrics.speed) : null,
    };
  }

  showSummary(s) {
    const app = this.app;
    const hist = app.store.data.history.filter((h) => h.mode === s.mode);
    const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
    const week = app.store.data.history.filter((h) => Date.now() - new Date(h.date).getTime() < 7 * 864e5).length;
    this.showPanel(new Panel({
      w: 1.3, h: 0.92, px: 1300,
      draw: (g, W, H, panel) => {
        g.textAlign = 'center'; g.fillStyle = '#ffe9cf'; g.font = `700 64px ${FONT}`;
        g.fillText('夜が明けました', W / 2, 92);
        g.fillStyle = '#cfe0ff'; g.font = `500 32px ${FONT}`;
        g.fillText(`${fmtTime(s.minutes * 60)} の旅  ・  ✦ ${s.score.toLocaleString()}  ・  最大コンボ ${s.bestCombo}`, W / 2, 146);
        const rows = [];
        if (s.lanternDist != null) rows.push(['灯籠ながし', `${s.lanterns} 個を返した ・ 平均 ${s.lanternDist} m で見抜いた`, prev?.lanternDist != null ? delta(s.lanternDist, prev.lanternDist, 'm', true) : '']);
        if (s.cs) rows.push(['光の精', `${s.spirits} 体 ・ コントラスト感度 ${s.cs.map((x) => `${x.sf}cpd:${x.cs}`).join('  ')}`, prev?.cs ? delta(avgCs(s.cs), avgCs(prev.cs), '', true) : '']);
        if (s.gatesAcc != null) rows.push(['星の門', `正答 ${s.gatesAcc}% ・ 提示 ${s.gatesMs} ms`, prev?.gatesMs ? delta(s.gatesMs, prev.gatesMs, 'ms', false) : '']);
        if (s.stereo != null) rows.push(['浮かぶ星珠', `立体視 ${s.stereo} 秒角`, prev?.stereo ? delta(s.stereo, prev.stereo, '″', false) : '']);
        if (s.comet != null) rows.push(['流れ星', `${s.comet} °/秒 の星をキャッチ`, prev?.comet ? delta(s.comet, prev.comet, '°/s', true) : '']);
        let y = 230;
        g.textAlign = 'left';
        for (const [a, b, c] of rows) {
          g.fillStyle = '#9fc2f0'; g.font = `700 34px ${FONT}`; g.fillText(a, 80, y);
          g.fillStyle = '#eef4ff'; g.font = `400 31px ${FONT}`; g.fillText(b, 300, y);
          if (c) { g.textAlign = 'right'; g.fillStyle = c.startsWith('▲') ? '#9ff0c0' : '#c0c8d8'; g.fillText(c, W - 80, y); g.textAlign = 'left'; }
          y += 58;
        }
        if (s.orientation) drawOrientation(g, W - 230, y + 70, 80, s.orientation);
        g.fillStyle = '#cfe0ff'; g.font = `400 30px ${FONT}`;
        const nights = app.store.data.totals.nights;
        const msg = `これまで ${nights} 夜 ・ この7日で ${week} 回\n目安は 1回15〜25分、週3〜5回、6週間以上。続けた夜の数だけ、湖に蓮が咲きます。`;
        const yEnd = wrapText(g, msg, 80, y + 40, W - 420, 44);
        if (s.orientation) {
          const weak = [...s.orientation].sort((a, b) => a.rel - b.rel)[0];
          g.fillStyle = '#a9c4e8'; g.font = `400 26px ${FONT}`;
          wrapText(g, `いちばん見えにくい縞の向き：${ORI_LABEL[weak.ori]}（重点的に出題中）`, 80, yEnd + 8, W - 420, 36);
        }
        panel.button('again', W / 2 - 330, H - 112, 300, 80, 'もう一夜', { onClick: () => this.begin() });
        panel.button('end', W / 2 + 30, H - 112, 300, 80, 'おわる', { primary: true, onClick: () => app.exit() });
      },
    }), 1.9, 2);
  }

  updateIdle(dt) {
    if (this.dawn) {
      this.dawn.t += dt;
      const k = Math.min(1, this.dawn.t / 6);
      this.app.env.setPhase(this.dawn.from + (1 - this.dawn.from) * k);
      if (k >= 1) this.dawn = null;
    }
  }
}

function avgCs(arr) { return arr.reduce((a, x) => a + Math.log10(x.cs), 0) / arr.length; }
function delta(now, before, unit, higherBetter) {
  if (before == null || now == null) return '';
  const better = higherBetter ? now > before : now < before;
  if (Math.abs(now - before) < 1e-6) return '＝ 前回と同じ';
  if (unit === '') return better ? '▲ 前回より向上' : '▽ 前回より低め';
  const d = Math.abs(now - before);
  return `${better ? '▲' : '▽'} ${d >= 10 ? Math.round(d) : d.toFixed(1)}${unit}`;
}

function drawOrientation(g, cx, cy, R, prof) {
  g.save();
  g.strokeStyle = 'rgba(160,200,255,0.25)'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.5, 0, Math.PI * 2); g.stroke();
  for (const o of prof) {
    // stripe orientation 0 = vertical stripes; draw the spoke along the stripe direction, both ways
    const a = THREE.MathUtils.degToRad(90 - o.ori);
    const r = R * Math.min(1.2, Math.max(0.2, 0.5 + (o.rel - 1) * 2.5));
    g.strokeStyle = o.rel < 0.95 ? '#ffb4a0' : '#9fe0ff'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r, cy - Math.sin(a) * r); g.stroke();
  }
  g.fillStyle = '#9fb8dc'; g.font = `400 22px ${FONT}`; g.textAlign = 'center';
  g.fillText('縞の向き別の見え方', cx, cy + R + 36);
  g.restore();
}
