// engine/input.js — keyboard, gamepads (standard mapping) and touch buttons, merged with the hand tracker.
// Race controls come from poll(); menu actions ('up','down','left','right','ok','back','pause') are sent
// to onMenu as edges from any source.
import { clamp } from './util.js';

const KEY = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyK'], item: ['KeyE', 'KeyX', 'KeyJ', 'KeyL'], pause: ['Escape', 'KeyP'],
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.onMenu = null;
    this.padPrev = new Map();
    this.padName = '';
    this.lastSource = 'keyboard';
    this.touch = { left: false, right: false, drift: false, item: false, brake: false, active: false, steer: 0, steering: false };
    this.steerSm = 0;
    this.hands = null; // HandTracker, when gesture mode is on
    this.handMode = false;
    this.out = { steer: 0, throttle: 0, brake: 0, drift: false, item: false, source: 'keyboard' };
    this.axisLatch = { x: 0, y: 0 };
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!e.repeat) this.keys.add(e.code);
      this.lastSource = 'keyboard';
      const a = menuActionForKey(e.code);
      if (a) { if (a !== 'ok' || !e.repeat) this.menu(a); if (['up', 'down', 'left', 'right', 'ok'].includes(a) || e.code === 'Space') e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('gamepadconnected', (e) => { this.padName = e.gamepad.id; this.onPad?.(this.padName); });
    addEventListener('gamepaddisconnected', () => { this.padName = this.firstPad()?.id || ''; this.onPad?.(this.padName); });
  }

  menu(a) { this.onMenu?.(a); }
  any(list) { return list.some((k) => this.keys.has(k)); }

  firstPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // touch buttons: elements with data-touch="left|right|drift|item|brake"; [data-steerpad] is a steering slider:
  // the further from its centre you touch (or slide), the more you steer
  bindTouch(root) {
    const set = (el, v) => { this.touch[el.dataset.touch] = v; el.classList.toggle('on', v); };
    for (const el of root.querySelectorAll('[data-touch]')) {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); set(el, true); this.touch.active = true; this.lastSource = 'touch'; });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => set(el, false));
    }
    const pad = root.querySelector('[data-steerpad]');
    if (pad) {
      this.knob = pad.querySelector('.knob');
      const move = (e) => {
        const r = pad.getBoundingClientRect();
        const v = clamp((e.clientX - (r.left + r.width / 2)) / (r.width * 0.38), -1, 1);
        this.touch.steer = Math.abs(v) < 0.08 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.08) / 0.92, 1.3);
      };
      pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture?.(e.pointerId); this.touch.steering = true; this.touch.active = true; this.lastSource = 'touch'; pad.classList.add('on'); move(e); });
      pad.addEventListener('pointermove', (e) => { if (this.touch.steering) move(e); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, () => { this.touch.steering = false; this.touch.steer = 0; pad.classList.remove('on'); });
    }
  }

  // on/off steering (arrow keys, d-pad, ◀▶ buttons) turns the wheel quickly but not instantly, so a tap gives a
  // small correction and a drift doesn't lurch
  shapeDigital(target, dt) {
    const s = this.steerSm;
    const rate = target === 0 || Math.sign(target) !== Math.sign(s) ? 10 : 5.5;
    this.steerSm = s + clamp(target - s, -rate * dt, rate * dt);
    return this.steerSm;
  }

  // read everything; call once per frame
  poll(dt = 1 / 60) {
    const o = this.out;
    let steer = 0, thr = 0, brk = 0, drift = false, item = false;
    let digital = false;
    // keyboard
    if (this.any(KEY.left)) steer -= 1;
    if (this.any(KEY.right)) steer += 1;
    if (steer !== 0) digital = true;
    if (this.any(KEY.up)) thr = 1;
    if (this.any(KEY.down)) brk = 1;
    if (this.any(KEY.drift)) drift = true;
    if (this.any(KEY.item)) item = true;
    // gamepads
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
      const ax = Math.abs(p.axes[0] || 0) > 0.15 ? p.axes[0] : 0;
      const ay = Math.abs(p.axes[1] || 0) > 0.5 ? p.axes[1] : 0;
      let ps = ax, pdig = false;
      if (b(14) > 0.5) { ps = -1; pdig = true; }
      if (b(15) > 0.5) { ps = 1; pdig = true; }
      const pt = Math.max(b(0), b(7));
      const pb = Math.max(b(1), b(6));
      const pd = b(5) > 0.5 || b(4) > 0.5;
      const pi = b(2) > 0.5 || b(3) > 0.5;
      const used = Math.abs(ps) > 0.2 || pt > 0.1 || pb > 0.1 || pd || pi;
      if (used) { this.lastSource = 'gamepad'; this.padName = p.id; }
      if (Math.abs(ps) > Math.abs(steer)) { steer = ps; digital = pdig; }
      thr = Math.max(thr, pt); brk = Math.max(brk, pb);
      drift = drift || pd; item = item || pi;
      // menu edges
      const prev = this.padPrev.get(p.index) || {};
      const now = {
        up: b(12) > 0.5 || ay < -0.5, down: b(13) > 0.5 || ay > 0.5,
        left: b(14) > 0.5 || (p.axes[0] || 0) < -0.5, right: b(15) > 0.5 || (p.axes[0] || 0) > 0.5,
        ok: b(0) > 0.5, back: b(1) > 0.5, pause: b(9) > 0.5 || b(8) > 0.5,
      };
      for (const k of Object.keys(now)) if (now[k] && !prev[k]) this.menu(k);
      this.padPrev.set(p.index, now);
    }
    // touch
    const t = this.touch;
    if (t.active) {
      if (t.left || t.right) { steer = (t.right ? 1 : 0) - (t.left ? 1 : 0); digital = true; }
      if (t.steering) { steer = t.steer; digital = false; }
      if (this.knob) this.knob.style.transform = `translateX(${(t.steering ? t.steer : 0) * 70}px)`;
      thr = Math.max(thr, t.brake ? 0 : 1);
      if (t.brake) brk = 1;
      drift = drift || t.drift; item = item || t.item;
    }
    let source = this.lastSource;
    // hands
    if (this.handMode && this.hands && this.hands.ready) {
      const h = this.hands.ctl;
      const others = Math.abs(steer) > 0.1 || thr > 0 || brk > 0;
      if (!others && h) {
        steer = h.steer; thr = h.throttle; brk = h.brake; drift = drift || h.drift; item = item || h.item;
        source = 'hands';
      }
    }
    if (source !== 'hands') steer = digital || steer === 0 ? this.shapeDigital(steer, dt) : (this.steerSm = steer);
    o.steer = clamp(steer, -1, 1); o.throttle = clamp(thr, 0, 1); o.brake = clamp(brk, 0, 1);
    o.drift = drift; o.item = item; o.source = source;
    return o;
  }
}

function menuActionForKey(code) {
  if (KEY.up.includes(code)) return 'up';
  if (KEY.down.includes(code)) return 'down';
  if (KEY.left.includes(code)) return 'left';
  if (KEY.right.includes(code)) return 'right';
  if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') return 'ok';
  if (code === 'Backspace') return 'back';
  if (KEY.pause.includes(code)) return 'pause';
  return null;
}
