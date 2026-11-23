// core/input.js — keyboard, mouse (pointer lock) and touch (left stick + right drag look + action buttons).
// Other modules read `input.keys`, `input.look` (accumulated mouse delta, consumed each frame) and listen to
// `input.on(name, fn)` for one-shot actions ('interact', 'use', 'inventory', 'craft', 'build', 'menu' …).

const ACTION_KEYS = {
  KeyE: 'interact', KeyF: 'use', Tab: 'inventory', KeyI: 'inventory', KeyC: 'craft', KeyB: 'build', Escape: 'menu', KeyM: 'map',
  KeyT: 'talk', KeyQ: 'drop', KeyR: 'reload', KeyZ: 'sleep', KeyJ: 'journal', KeyH: 'help', KeyG: 'gesture', KeyV: 'companion',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5', Digit6: 'slot6', Digit7: 'slot7', Digit8: 'slot8',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.look = { x: 0, y: 0 };
    this.mouse = { left: false, right: false, clicked: false };
    this.stick = { x: 0, y: 0 }; // touch move stick −1…1
    this.handlers = new Map();
    this.enabled = true;   // false while a menu has focus
    this.locked = false;
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.sensitivity = 1;

    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat && ACTION_KEYS[e.code]) this.emit(ACTION_KEYS[e.code], e);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.touch) { this.requestLock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.emit('primary', e); }
      if (e.button === 2) { this.mouse.right = true; this.emit('secondary', e); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) { if (this.mouse.left) this.emit('primaryUp', e); this.mouse.left = false; }
      if (e.button === 2) { if (this.mouse.right) this.emit('secondaryUp', e); this.mouse.right = false; }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.look.x += e.movementX * this.sensitivity;
      this.look.y += e.movementY * this.sensitivity;
    });
    canvas.addEventListener('wheel', (e) => { if (this.enabled) this.emit('wheel', e); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.emit('lock', this.locked);
    });
    this.initTouch();
  }

  requestLock() {
    if (this.touch) return;
    try { const p = this.canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* ignore */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
    return () => this.handlers.get(name).delete(fn);
  }
  emit(name, arg) {
    const hs = this.handlers.get(name);
    if (hs) for (const fn of hs) fn(arg);
  }

  /** −1…1 move axes from keys or the touch stick */
  axes() {
    if (!this.enabled) return { x: 0, y: 0, run: false };
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (Math.abs(this.stick.x) + Math.abs(this.stick.y) > 0.05) { x = this.stick.x; y = -this.stick.y; }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.stick.x, this.stick.y) > 0.92;
    return { x, y, run, jump: k.has('Space'), crouch: k.has('ControlLeft') };
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0; this.look.y = 0;
    return l;
  }

  // ---------------------------------------------------------------- touch: left half = stick, right half = look
  initTouch() {
    const c = this.canvas;
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0, lookStart = 0, lookMoved = 0;
    const base = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    c.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      this.touch = true;
      document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.42 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          if (base) { base.style.left = `${sx}px`; base.style.top = `${sy}px`; base.classList.add('on'); }
        } else if (lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY; lookStart = performance.now(); lookMoved = 0;
        }
      }
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          const dx = t.clientX - sx, dy = t.clientY - sy, R = 56;
          const L = Math.hypot(dx, dy), k = L > R ? R / L : 1;
          this.stick.x = (dx * k) / R; this.stick.y = (dy * k) / R;
          if (knob) knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        } else if (t.identifier === lookId) {
          const dx = t.clientX - lx, dy = t.clientY - ly;
          lookMoved += Math.abs(dx) + Math.abs(dy);
          this.look.x += dx * 2.2 * this.sensitivity; this.look.y += dy * 2.2 * this.sensitivity;
          lx = t.clientX; ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null; this.stick.x = 0; this.stick.y = 0;
          if (knob) knob.style.transform = '';
          base?.classList.remove('on');
        } else if (t.identifier === lookId) {
          lookId = null;
          // a short tap on the right side = primary action
          if (performance.now() - lookStart < 260 && lookMoved < 14) { this.emit('primary', e); this.emit('primaryUp', e); }
        }
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }
}
