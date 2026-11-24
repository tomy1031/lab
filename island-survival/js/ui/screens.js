// ui/screens.js — screen manager. Renders one screen at a time into #screens, pauses the game while a menu is open,
// routes Esc / toggle keys, focuses the panel and drives the hand-gesture cursor (#hand-cursor).
//   screens.show(name, data) · screens.hide() · screens.current (name or null) · screens.back()
import { loadItemModule } from './common.js';
import { loadSettings } from '../core/save.js';
import title, { credits, records } from './s-title.js';
import setup from './s-setup.js';
import loading from './s-loading.js';
import pause, { settings } from './s-pause.js';
import inventory, { eat } from './s-inventory.js';
import craft from './s-craft.js';
import build from './s-build.js';
import guide from './s-guide.js';
import map from './s-map.js';
import journal from './s-journal.js';
import companion from './s-companion.js';
import sleep from './s-sleep.js';
import result from './s-result.js';
import gesture from './s-gesture.js';

const REG = { title, setup, loading, pause, settings, inventory, eat, craft, build, guide, map, journal, companion, sleep, result, gesture, credits, records };
// screens that do not pause the game (the world is still a menu backdrop, or the game has not started)
const NO_PAUSE = new Set(['title', 'setup', 'loading', 'credits', 'records']);
// in-game menus that can be toggled / switched with their key
const NO_HUD = new Set(['title', 'setup', 'loading', 'credits', 'records', 'result']);
const IN_GAME = new Set(['inventory', 'craft', 'build', 'guide', 'map', 'journal', 'companion', 'sleep', 'eat']);
const TOGGLE = { KeyI: 'inventory', Tab: 'inventory', KeyC: 'craft', KeyB: 'build', KeyK: 'guide', KeyM: 'map', KeyJ: 'journal', KeyN: 'journal' };
const DEFAULT_BACK = { setup: 'title', records: 'title', credits: 'title', settings: 'pause', gesture: 'settings' };

export class Screens {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('screens');
    this.handEl = document.getElementById('hand-cursor');
    this.cur = null;
    this.paused = false;
    this._hover = null;
    this._last = performance.now();
    loadItemModule();
    this.applyPrefs();
    addEventListener('keydown', (e) => this.onKey(e), true);
    const loop = (t) => { this.frame((t - this._last) / 1000); this._last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  get current() { return this.cur ? this.cur.name : null; }

  /** apply stored settings (volumes, sensitivity …) to the game once its systems exist */
  applyPrefs() {
    const g = this.game, s = loadSettings();
    try {
      if (g.input && s.sens != null) g.input.sensitivity = s.sens;
      if (g.audio?.setVolume && s.vol) for (const [b, v] of Object.entries(s.vol)) g.audio.setVolume(b, v);
      if (s.gsens != null) g.hands?.motion?.setSensitivity?.(s.gsens);
      g.settings = { ...(g.settings || {}), ...s };
    } catch { /* ignore */ }
  }

  /** a small fixed banner: 「新しい バージョンが あります」 → update (PWA) */
  updateBanner(onUpdate) {
    if (document.getElementById('upd-banner')) return;
    const el = document.createElement('div');
    el.id = 'upd-banner';
    el.innerHTML = '<span>新しい バージョンが あります</span>';
    const b = document.createElement('button'); b.className = 'btn small primary'; b.textContent = '更新する'; b.onclick = () => { b.disabled = true; onUpdate(); };
    const x = document.createElement('button'); x.className = 'btn small ghost'; x.textContent = 'あとで'; x.onclick = () => el.remove();
    el.append(b, x);
    document.body.appendChild(el);
  }

  show(name, data = {}) {
    // in a VR session the page is not visible: the headset's own panels take these (vr/xr.js)
    if (this.game.xr?.presenting && this.game.xr.screen(name, data)) return;
    const mod = REG[name];
    if (!mod) { console.warn('unknown screen', name); return; }
    if (this.cur && this.cur.name === name && this.cur.api.onData) {
      this.cur.data = data; this.cur.api.onData(data); return;
    }
    this.applyPrefs();
    this.teardown();
    const ctx = { game: this.game, screens: this };
    const api = mod(ctx, data) || {};
    const wrap = document.createElement('div');
    wrap.className = `screen s-${name} ${api.cls || ''}`;
    wrap.tabIndex = -1;
    wrap.appendChild(api.el);
    this.root.appendChild(wrap);
    this.cur = { name, data, api, wrap };
    const needPause = !NO_PAUSE.has(name) && !(data?.from === 'title');
    if (needPause && !this.paused) { this.paused = true; this.game.pause?.(true); }
    else if (!needPause && this.paused) { this.paused = false; this.game.pause?.(false); }
    if (this.game.input) { this.game.input.enabled = false; try { this.game.input.exitLock?.(); } catch { /* ignore */ } }
    document.body.classList.add('menu-open');
    document.body.classList.toggle('no-hud', NO_HUD.has(name) || ['title', 'setup'].includes(data?.from));
    const f = wrap.querySelector('[data-autofocus]') || wrap.querySelector('.sheet') || wrap;
    if (!f.hasAttribute('tabindex')) f.tabIndex = -1;
    try { f.focus({ preventScroll: true }); } catch { /* ignore */ }
    this.game.bus?.emit('screen', { name });
  }

  teardown() {
    if (!this.cur) return;
    try { this.cur.api.close?.(); } catch (e) { console.error(e); }
    this.cur.wrap.remove();
    this.cur = null;
  }

  hide() {
    this.teardown();
    if (this.paused) { this.paused = false; this.game.pause?.(false); }
    if (this.game.input) this.game.input.enabled = true;
    document.body.classList.remove('menu-open', 'no-hud');
    this.handEl?.classList.add('hidden');
    this.game.bus?.emit('screen', { name: null });
  }

  /** Esc: let the screen handle it, else go to the parent screen, else close */
  back() {
    const c = this.cur;
    if (!c) return;
    if (c.api.back?.()) return;
    if (['title', 'loading', 'result'].includes(c.name)) return;
    const from = c.data?.from || DEFAULT_BACK[c.name];
    if (from && from !== c.name && (REG[from])) {
      const fd = { ...(c.data?.fromData || {}) };
      this.show(from, fd);
    } else this.hide();
  }

  onKey(e) {
    const c = this.cur;
    if (!c) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '') && !(e.target.type === 'range' || e.target.type === 'checkbox');
    if (e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); this.back(); return; }
    if (typing) return;
    if (IN_GAME.has(c.name) && TOGGLE[e.code]) {
      e.stopImmediatePropagation(); e.preventDefault();
      const t = TOGGLE[e.code];
      if (t === c.name) this.hide(); else this.show(t);
      return;
    }
    if (c.api.onKey?.(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }

  frame(dt) {
    dt = Math.min(dt, 0.1);
    try { this.cur?.api.update?.(dt); } catch (e) { console.error(e); this.cur && (this.cur.api.update = null); }
    this.updateHand();
  }

  // ------------------------------------------------------------------ hand cursor (pinch = click)
  updateHand() {
    const el = this.handEl, hands = this.game.hands;
    if (!el) return;
    const c = hands?.cursor;
    if (!this.cur || !hands?.ready || !c?.visible) { el.classList.add('hidden'); this.setHover(null); this._wasClicked = !!c?.clicked; return; }
    const x = c.x * innerWidth, y = c.y * innerHeight;
    el.classList.remove('hidden');
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.classList.toggle('pinch', !!c.pinch);
    const under = document.elementFromPoint(x, y);
    const target = under?.closest?.('button, a, [data-hand], .card, label, input, select, summary');
    this.setHover(target);
    if (c.pinch && target?.type === 'range') {
      const r = target.getBoundingClientRect();
      const v = Math.min(1, Math.max(0, (x - r.left) / r.width));
      const mn = +target.min || 0, mx = +target.max || 1, st = +target.step || 0.01;
      target.value = String(Math.round((mn + (mx - mn) * v) / st) * st);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const edge = !!c.clicked && !this._wasClicked; this._wasClicked = !!c.clicked;
    if (edge && target && target.type !== 'range') {
      el.classList.add('click'); setTimeout(() => el.classList.remove('click'), 220);
      target.click?.();
    }
  }
  setHover(t) {
    if (this._hover === t) return;
    this._hover?.classList.remove('hand-hover');
    this._hover = t || null;
    t?.classList.add('hand-hover');
  }
}
