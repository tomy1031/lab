// ui/hud.js — in-game HUD (DESIGN §16.2) + touch controls. new Hud(game); hud.update(dt) every frame.
import { h, clear, svg } from './dom.js';
import { defOf, nameOf, iconOf, freshStage } from './common.js';
import { loadSettings } from '../core/save.js';

const $id = (id) => document.getElementById(id);
const RING_C = 2 * Math.PI * 18;
const RINGS = [['hp', '体力', '♥', '#e5484d'], ['food', '満腹', '🍖', '#f08a24'], ['water', '水分', '💧', '#3b9be6'], ['rest', '睡眠', '🌙', '#8c6cd9'], ['morale', '気力', '✦', '#e8b929']];
const WEATHER_ICON = { clear: '☀️', cloudy: '☁️', drizzle: '🌦️', rain: '🌧️', storm: '⛈️', fog: '🌫️', heat: '🥵', typhoon: '🌀' };
const SPEAKER = { nagi: 'ナギ', touko: 'トウコ', gen: 'ゲン', player: 'あなた', you: 'あなた' };
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
const TOUCH_MAIN = [['primary', '使う', '✊', 'big'], ['interact', '拾う', '✋', 'mid'], ['secondary', '構える', '🎯', 'mid'], ['jump', 'ジャンプ', '⤒', 'sm'], ['crouch', 'しゃがむ', '⤓', 'sm']];
const TOUCH_MENU = [['inventory', '持ち物', '🎒'], ['craft', '錬成', '🔧'], ['build', '建築', '🏠'], ['sleep', '寝る', '🌙'], ['talk', '話す', '💬'], ['menu', 'メニュー', '☰']];

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['hud', 'hud-stats', 'hud-clock', 'hud-status', 'hud-hotbar', 'hud-prompt', 'hud-action', 'hud-toasts', 'hud-subtitle', 'crosshair', 'cam-preview', 'hud-companion', 'touch-ui']) this.el[id] = $id(id);
    const hud = this.el.hud;
    // containers added by this module
    this.goalsEl = this.ensure('hud-goals'); this.vig = this.ensure('hud-vignette', true); this.heldEl = this.ensure('hud-held');
    this.cache = {};
    this.trend = {};
    this.toasts = [];
    this.subs = new Map();
    this.tideT = 0;
    this.buildStats(); this.buildClock(); this.buildCrosshair(); this.buildTouch();
    const bus = game.bus;
    bus?.on('toast', (t) => this.toast(t));
    bus?.on('subtitle', (s) => this.subtitle(s));
    bus?.on('choice:show', (c) => this.showChoice(c));
    bus?.on('choice:hide', () => this.hideChoice());
    bus?.on('companion:say', (s) => { if (s && !s.__shown) this.subtitle({ who: s.who, text: s.text, final: true }); });
    if (game.input?.touch || matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  }
  ensure(id, first = false) {
    let e = $id(id);
    if (!e) { e = document.createElement('div'); e.id = id; const p = this.el.hud; if (first) p.insertBefore(e, p.firstChild); else p.appendChild(e); }
    return e;
  }

  // ------------------------------------------------------------------ stats (rings, temperature, wetness)
  buildStats() {
    const box = this.el['hud-stats']; clear(box);
    this.rings = {};
    const rings = h('div', { class: 'rings' });
    for (const [k, label, icon, col] of RINGS) {
      const fg = svg('circle', { cx: 22, cy: 22, r: 18, class: 'ring-fg', 'stroke-dasharray': `${RING_C} ${RING_C}` });
      const s = svg('svg', { viewBox: '0 0 44 44', class: 'ring-svg' }, svg('circle', { cx: 22, cy: 22, r: 18, class: 'ring-bg' }), fg);
      const arrow = h('span', { class: 'ring-arrow' });
      const r = h('div', { class: 'ring', title: label, style: { '--c': col } }, s, h('span', { class: 'ring-icon' }, icon), arrow);
      rings.append(r); this.rings[k] = { r, fg, arrow };
    }
    this.tempEl = h('span', { class: 'temp' }, '36.8℃');
    this.dropsEl = h('span', { class: 'drops', title: '濡れ' }, [0, 1, 2, 3, 4].map(() => h('i', { class: 'drop' })));
    this.feelEl = h('span', { class: 'feel' });
    box.append(rings, h('div', { class: 'vitals' }, h('span', { class: 'temp-wrap' }, h('span', { class: 'temp-l' }, '体温'), this.tempEl), this.dropsEl, this.feelEl));
  }
  updateStats(dt, body) {
    const s = body?.s; if (!s) return;
    this.trendT = (this.trendT || 0) + dt;
    const doTrend = this.trendT > 4;
    for (const [k] of RINGS) {
      const v = Math.max(0, Math.min(100, s[k] ?? 0)); const o = this.rings[k];
      if (this.cache[k] !== Math.round(v * 2)) { this.cache[k] = Math.round(v * 2); o.fg.setAttribute('stroke-dasharray', `${(v / 100) * RING_C} ${RING_C}`); o.r.classList.toggle('low', v < 30); o.r.classList.toggle('crit', v < 12); }
      if (doTrend) { const p = this.trend[k]; o.arrow.textContent = p != null && v < p - 0.3 ? '▼' : p != null && v > p + 0.3 ? '▲' : ''; o.arrow.classList.toggle('up', p != null && v > p + 0.3); this.trend[k] = v; }
    }
    if (doTrend) this.trendT = 0;
    const bt = s.bodyTemp ?? 36.8;
    const tt = `${bt.toFixed(1)}℃`;
    if (this.cache.temp !== tt) { this.cache.temp = tt; this.tempEl.textContent = tt; this.tempEl.className = `temp ${bt < 35 ? 'cold' : bt > 38.5 ? 'hot' : bt < 36 ? 'cool' : 'ok'}`; }
    const wet = Math.round((s.wet ?? 0) / 20);
    if (this.cache.wet !== wet) { this.cache.wet = wet; [...this.dropsEl.children].forEach((d, i) => d.classList.toggle('on', i < wet)); this.dropsEl.classList.toggle('dry', wet === 0); }
    // stamina arc around the crosshair
    const st = (s.stamina ?? 100) / (s.staminaMax || 100);
    const sv = Math.round(st * 100);
    if (this.cache.sta !== sv) {
      this.cache.sta = sv;
      this.staArc.setAttribute('stroke-dasharray', `${st * 88} 88`);
      this.el.crosshair.classList.toggle('sta-show', st < 0.985);
      this.el.crosshair.classList.toggle('sta-low', st < 0.25);
    }
    // vignette: low HP (red) / thirst (white) / cold (blue) / hot (orange)
    const hpv = Math.max(0, Math.min(1, (35 - s.hp) / 35)), thirst = Math.max(0, Math.min(1, (20 - s.water) / 20));
    const cold = Math.max(0, Math.min(1, (35.5 - bt) / 2.5)), hot = Math.max(0, Math.min(1, (bt - 38) / 2));
    const key = `${hpv.toFixed(2)}${thirst.toFixed(2)}${cold.toFixed(2)}${hot.toFixed(2)}`;
    if (this.cache.vig !== key) {
      this.cache.vig = key;
      const st2 = this.vig.style; st2.setProperty('--v-hp', hpv.toFixed(2)); st2.setProperty('--v-thirst', thirst.toFixed(2)); st2.setProperty('--v-cold', cold.toFixed(2)); st2.setProperty('--v-hot', hot.toFixed(2));
      this.vig.classList.toggle('pulse', hpv > 0.5);
    }
  }
  buildCrosshair() {
    const c = this.el.crosshair; clear(c);
    this.staArc = svg('circle', { cx: 20, cy: 20, r: 14, class: 'sta-arc', 'stroke-dasharray': '88 88', transform: 'rotate(-90 20 20)' });
    c.append(svg('svg', { viewBox: '0 0 40 40', class: 'sta-svg' }, svg('circle', { cx: 20, cy: 20, r: 14, class: 'sta-bg' }), this.staArc), h('i', { class: 'dot' }));
  }

  // ------------------------------------------------------------------ watch: clock, weather, wind, tide
  buildClock() {
    const box = this.el['hud-clock']; clear(box);
    this.dayEl = h('div', { class: 'w-day' }); this.timeEl = h('div', { class: 'w-time' });
    this.wxEl = h('div', { class: 'w-wx' }); this.tempsEl = h('div', { class: 'w-temps' });
    this.windArrow = h('span', { class: 'wind-arrow' }, svg('svg', { viewBox: '0 0 24 24', width: 22, height: 22 }, svg('path', { d: 'M12 2 L18 20 L12 15 L6 20 Z', fill: 'currentColor' })));
    this.windTxt = h('span', { class: 'wind-txt' }); this.headEl = h('span', { class: 'w-head' });
    this.tideCv = h('canvas', { class: 'tide', width: 240, height: 56, title: '潮の 高さ（いま ＋ 12 時間）' });
    box.append(h('div', { class: 'w-top' }, h('div', null, this.dayEl, this.timeEl), h('div', { class: 'w-right' }, this.wxEl, this.tempsEl)),
      h('div', { class: 'w-mid' }, this.windArrow, this.windTxt, h('span', { class: 'grow' }), this.headEl), this.tideCv);
  }
  updateClock(dt) {
    const g = this.game, ck = g.clock; if (!ck) return;
    const label = ck.label?.() || '';
    if (this.cache.clock !== label) {
      this.cache.clock = label;
      const m = /(\d+)日目\s*(.*)/.exec(label);
      const total = g.setup?.days;
      this.dayEl.textContent = m ? `${m[1]}${total ? ` / ${total}` : ''} 日目` : label;
      this.timeEl.textContent = m ? m[2] : '';
    }
    const wx = g.sys?.weather, pl = g.sys?.player;
    const wname = wx?.name || '';
    let air = null; try { air = wx?.airTemp?.(ck.hour, { y: g.player?.pos?.y ?? 0, zone: pl?.zone, day: ck.day }); } catch { /* ignore */ }
    const feel = pl?.body?.feel;
    const tt = `${wx?.type}|${wname}|${air != null ? Math.round(air) : ''}|${feel != null ? Math.round(feel) : ''}`;
    if (this.cache.wx !== tt) {
      this.cache.wx = tt;
      this.wxEl.textContent = `${WEATHER_ICON[wx?.type] || ''} ${wname}`;
      this.tempsEl.textContent = '';
      this.tempsEl.append(air != null ? `${Math.round(air)}℃` : '', feel != null ? h('span', { class: 'felt' }, ` 体感 ${Math.round(feel)}℃`) : '');
    }
    // wind arrow relative to the camera yaw, heading
    const yaw = g.player?.yaw ?? 0;
    if (wx && wx.windDir != null) {
      const rot = Math.PI - (wx.windDir - yaw);
      const deg = Math.round((rot * 180) / Math.PI / 3);
      if (this.cache.wdeg !== deg) { this.cache.wdeg = deg; this.windArrow.style.transform = `rotate(${deg * 3}deg)`; }
      const sp = (wx.windSpeed ?? 0).toFixed(0);
      if (this.cache.wsp !== sp) { this.cache.wsp = sp; this.windTxt.textContent = `風 ${sp} m/s`; this.windArrow.classList.toggle('strong', wx.windSpeed > 10); }
    }
    const bearing = ((-yaw * 180) / Math.PI % 360 + 360) % 360;
    const hd = DIRS[Math.round(bearing / 45) % 8];
    if (this.cache.hd !== hd) { this.cache.hd = hd; this.headEl.textContent = `🧭 ${hd}`; }
    this.tideT -= dt;
    if (this.tideT <= 0) { this.tideT = 1.5; this.drawTide(); }
  }
  drawTide() {
    const ck = this.game.clock; const cv = this.tideCv; if (!ck?.tide || !cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const t0 = ck.total / 60, N = 48; const pts = [];
    let mn = -1, mx = 1;
    for (let i = 0; i <= N; i++) { const v = ck.tide(t0 + (i / N) * 12); pts.push(v); }
    const y = (v) => H - 8 - ((v - mn) / (mx - mn)) * (H - 16);
    const sea0 = y(0);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(0, sea0); g.lineTo(W, sea0); g.stroke(); g.setLineDash([]);
    g.beginPath(); pts.forEach((v, i) => { const px = (i / N) * W; i ? g.lineTo(px, y(v)) : g.moveTo(px, y(v)); });
    g.lineTo(W, H); g.lineTo(0, H); g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(90,200,215,.75)'); gr.addColorStop(1, 'rgba(40,120,150,.25)');
    g.fillStyle = gr; g.fill();
    g.beginPath(); pts.forEach((v, i) => { const px = (i / N) * W; i ? g.lineTo(px, y(v)) : g.moveTo(px, y(v)); });
    g.strokeStyle = '#d8f6fa'; g.lineWidth = 2.2; g.stroke();
    g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(4, y(pts[0]), 4.5, 0, 7); g.fill();
    g.font = '700 15px system-ui'; g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'left'; g.fillText(pts[0] > pts[2] ? '潮: 引き' : '潮: 満ち', 12, 16);
  }

  // ------------------------------------------------------------------ hotbar, held item, prompt, activity
  updateHotbar() {
    const pl = this.game.sys?.player; if (!pl) return;
    const hot = pl.hotbar || [];
    const inv = pl.inv;
    const sig = [0, 1, 2, 3, 4, 5].map((i) => { const u = hot[i]; const s = u != null ? inv?.get?.(u) : null; return `${u}:${s ? s.n : 0}:${Math.round(s?.dur ?? -1)}`; }).join('|') + `#${pl.held}`;
    if (this.cache.hot === sig) return;
    this.cache.hot = sig;
    const box = this.el['hud-hotbar']; clear(box);
    for (let i = 0; i < 6; i++) {
      const u = hot[i]; const s = u != null ? inv?.get?.(u) : null;
      const slot = h('button', { type: 'button', class: `hslot${s && pl.held === u ? ' held' : ''}${s ? '' : ' empty'}`, 'aria-label': `スロット ${i + 1}`, onclick: () => this.game.input?.emit?.(`slot${i + 1}`) },
        h('span', { class: 'hk' }, i + 1), s ? h('span', { class: 'hicon' }, iconOf(s)) : null, s && s.n > 1 ? h('span', { class: 'hn' }, s.n) : null,
        s && s.dur != null ? h('span', { class: 'hdur' }, h('i', { style: { width: `${Math.max(4, Math.min(100, s.dur / 4))}%` } })) : null);
      box.append(slot);
    }
    const hs = pl.heldStack?.();
    this.heldEl.textContent = hs ? `${nameOf(this.game, hs)}${hs.dur != null ? `　残り ${Math.round(hs.dur)}` : ''}` : '';
    this.heldEl.classList.toggle('hidden', !hs);
  }
  updatePrompt() {
    const p = this.game.prompt; const box = this.el['hud-prompt'];
    const key = p ? `${p.key}|${p.text}|${p.sub || ''}` : '';
    if (this.cache.prompt === key) return; this.cache.prompt = key;
    clear(box); box.classList.toggle('on', !!p);
    if (!p) return;
    box.append(h('div', { class: 'pr-main' }, p.key ? h('kbd', null, p.key) : null, h('span', { class: 'pr-text' }, p.text)), p.sub ? h('div', { class: 'pr-sub' }, p.sub) : null);
  }
  updateAction() {
    const a = this.game.activity; const box = this.el['hud-action'];
    if (!a) { if (this.cache.act !== null) { this.cache.act = null; clear(box); box.classList.remove('on'); this.actBars = null; } return; }
    const key = `${a.label}|${a.hint || ''}|${a.phase || ''}|${a.bar2 != null}`;
    if (this.cache.act !== key || !this.actBars) {
      this.cache.act = key; clear(box); box.classList.add('on');
      const b1 = h('div', { class: 'bar big act-bar' }, h('i')); const b2 = a.bar2 != null ? h('div', { class: 'bar act-bar2' }, h('i')) : null;
      box.append(h('div', { class: 'act-label' }, a.label, a.phase ? h('span', { class: 'act-phase' }, a.phase) : null), b1, b2, a.hint ? h('div', { class: 'act-hint' }, a.hint) : null);
      this.actBars = [b1, b2];
    }
    this.actBars[0].firstChild.style.width = `${Math.round(Math.max(0, Math.min(1, a.progress ?? 0)) * 100)}%`;
    if (this.actBars[1]) this.actBars[1].firstChild.style.width = `${Math.round(Math.max(0, Math.min(1, a.bar2 ?? 0)) * 100)}%`;
  }

  // ------------------------------------------------------------------ status icons, companion, goals
  updateStatus(body) {
    const list = body?.visible?.() || [];
    const key = list.map((c) => `${c.id}${c.sev}`).join(',');
    if (this.cache.cond === key) return; this.cache.cond = key;
    const box = this.el['hud-status']; clear(box);
    for (const c of list) box.append(h('span', { class: `cond-ic sev${c.sev}${c.bleeding ? ' bleed' : ''}`, title: `${c.name}${c.treat ? `：${c.treat}` : ''}`, tabindex: '0' }, c.icon, h('span', { class: 'cond-tip' }, `${c.name}${c.treat ? ` — ${c.treat}` : ''}`)));
  }
  updateCompanion() {
    let info = null; try { info = this.game.sys?.companion?.hudInfo?.(); } catch { /* ignore */ }
    const key = info ? `${info.name}|${info.mood}|${Math.round(info.hp)}|${info.near}` : '';
    if (this.cache.comp === key) return; this.cache.comp = key;
    const box = this.el['hud-companion']; clear(box); box.classList.toggle('on', !!info);
    if (!info) return;
    const MOOD = { happy: '😊', normal: '🙂', tired: '😪', scared: '😨', angry: '😠', sad: '😢', sick: '🤒' };
    box.append(h('span', { class: 'cm-face' }, MOOD[info.mood] || '🙂'), h('div', { class: 'cm-main' }, h('b', null, info.name), h('div', { class: 'bar mini', style: { '--c': '#e5484d' } }, h('i', { style: { width: `${Math.max(0, Math.min(100, info.hp ?? 100))}%` } }))), info.near === false ? h('span', { class: 'cm-far' }, 'はなれている') : null);
  }
  updateGoals() {
    const goals = this.game.goals;
    const key = goals ? goals.map((x) => `${x.text}${x.done ? 1 : 0}`).join('|') : '';
    if (this.cache.goals === key) return; this.cache.goals = key;
    const box = this.goalsEl; clear(box); box.classList.toggle('on', !!goals?.length);
    if (!goals?.length) return;
    const firstOpen = goals.findIndex((x) => !x.done);
    box.append(h('div', { class: 'goal-h' }, '📝 目標メモ'), goals.map((x, i) => h('div', { class: `goal${x.done ? ' done' : ''}${i === firstOpen ? ' now' : ''}` }, h('span', { class: 'gb' }, x.done ? '☑' : '☐'), h('span', null, x.text))));
  }

  // ------------------------------------------------------------------ toasts, subtitles
  toast(t) {
    if (!t) return;
    const box = this.el['hud-toasts'];
    const e = h('div', { class: `toast ${t.kind || 'info'}` }, t.text);
    box.append(e);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => e.classList.add('out'), 2600);
    setTimeout(() => e.remove(), 3100);
  }
  subtitle(s) {
    if (!s || !s.text || this.game.settings?.subtitles === false || this.game.setup?.subtitles === false) return;
    const box = this.el['hud-subtitle']; const who = s.who || '';
    let rec = this.subs.get(who);
    if (!rec || rec.final) {
      const e = h('div', { class: 'sub' }, h('b', { class: 'sub-who' }, SPEAKER[who] || who), h('span', { class: 'sub-t' }));
      box.append(e); rec = { e, timer: 0, final: false }; this.subs.set(who, rec);
      while (box.children.length > 3) box.firstChild.remove();
    }
    rec.e.querySelector('.sub-t').textContent = s.text;
    rec.final = !!s.final;
    clearTimeout(rec.timer);
    rec.timer = setTimeout(() => { rec.e.classList.add('out'); setTimeout(() => { rec.e.remove(); if (this.subs.get(who) === rec) this.subs.delete(who); }, 500); }, s.final ? 3000 + s.text.length * 90 : 7000);
  }

  // ------------------------------------------------------------------ a companion's proposal: answer with a button or Y / U / N (§24.8)
  showChoice(c) {
    const box = this.ensure('hud-choice');
    box.textContent = '';
    box.className = 'on';
    const pick = (id) => this.game.bus.emit('choice:pick', { id });
    box.append(
      h('div', { class: 'choice-text' }, h('b', { class: 'sub-who' }, SPEAKER[c.who] || c.who || ''), c.text || ''),
      h('div', { class: 'choice-btns' }, (c.choices || []).map((o) => h('button', { class: `btn small ${o.id === 'ok' ? 'primary' : ''}`, onclick: () => pick(o.id) }, o.key ? h('kbd', null, o.key) : null, ` ${o.label}`))));
    this.choiceOpen = true;
    clearTimeout(this.choiceTimer);
    this.choiceTimer = setTimeout(() => { if (this.choiceOpen) pick('timeout'); }, 30000);
  }
  hideChoice() { const box = document.getElementById('hud-choice'); if (box) { box.className = ''; box.textContent = ''; } this.choiceOpen = false; clearTimeout(this.choiceTimer); }

  // ------------------------------------------------------------------ touch controls
  buildTouch() {
    const box = $id('touch-buttons'); if (!box) return; clear(box);
    const mk = (name, label, icon, cls, hold) => {
      const b = h('button', { type: 'button', class: `tbtn ${cls}`, 'aria-label': label, 'data-a': name }, h('span', { class: 'ti' }, icon), h('span', { class: 'tl' }, label));
      const inp = () => this.game.input;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('down'); inp()?.emit?.(name, e); });
      const up = (e) => { if (!b.classList.contains('down')) return; b.classList.remove('down'); if (hold) inp()?.emit?.(`${name}Up`, e); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    const main = h('div', { class: 'tb-main' }, TOUCH_MAIN.map(([n, l, i, c]) => mk(n, l, i, c, n === 'primary' || n === 'secondary')));
    const menu = h('div', { class: 'tb-menu' }, TOUCH_MENU.map(([n, l, i]) => mk(n, l, i, 'menu')));
    box.append(main, menu);
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    const body = g.sys?.player?.body;
    this.updateStats(dt, body);
    this.updateClock(dt);
    this.updateHotbar();
    this.updatePrompt();
    this.updateAction();
    this.updateStatus(body);
    this.updateCompanion();
    this.updateGoals();
    const cp = this.el['cam-preview'];
    if (cp && !cp.classList.contains('big')) {
      const on = (g.hands?.ready || g.setup?.control === 'gesture') && (g.settings?.camPreview ?? loadSettingsCached()) !== false;
      cp.classList.toggle('hidden', !on);
    }
  }
}
let _s = null, _t = 0;
function loadSettingsCached() { const n = performance.now(); if (!_s || n - _t > 3000) { _s = loadSettings(); _t = n; } return _s.camPreview; }
