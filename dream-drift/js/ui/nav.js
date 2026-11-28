// ui/nav.js — menu focus that works with arrows / d-pad, mouse / touch and the hand cursor
// (point with the index finger; pinch, or hold still for a moment, to press).
const DWELL = 1.3;

export class Nav {
  constructor({ audio }) {
    this.audio = audio;
    this.root = null;
    this.focus = null;
    this.cursorEl = document.getElementById('cursor');
    this.ring = document.getElementById('cursor-ring');
    this.hoverEl = null; this.dwell = 0;
    this.memory = new Map();
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest && e.target.closest('[data-nav]');
      if (el && this.root && this.root.contains(el) && e.pointerType === 'mouse') this.setFocus(el, false);
    });
  }

  items() {
    if (!this.root) return [];
    return [...this.root.querySelectorAll('[data-nav]')].filter((el) => el.offsetParent !== null && !el.disabled);
  }

  setRoot(root) {
    if (this.root && this.focus) this.memory.set(this.root.id, this.focus);
    this.root = root;
    this.focus = null;
    const remembered = root && this.memory.get(root.id);
    const list = this.items();
    const pre = root && root.querySelector('[data-nav].on, [data-nav][data-default]');
    this.setFocus(remembered && list.includes(remembered) ? remembered : pre || list[0] || null, false);
  }

  setFocus(el, sound = true, pick = sound) {
    if (el === this.focus) return;
    if (this.focus) this.focus.classList.remove('focus');
    this.focus = el;
    if (el) {
      el.classList.add('focus');
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      if (sound) this.audio.play('select');
      if (pick) this.onFocus?.(el); // moved there with arrows / d-pad (not a pointer passing over)
    }
  }

  move(dir) {
    const list = this.items();
    if (!list.length) return;
    if (!this.focus || !list.includes(this.focus)) { this.setFocus(list[0]); return; }
    const r0 = this.focus.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bs = Infinity;
    for (const el of list) {
      if (el === this.focus) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dx * v[0] + dy * v[1];
      if (along <= 4) continue;
      const across = Math.abs(dx * v[1] - dy * v[0]);
      const score = along + across * 2.2;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) this.setFocus(best);
  }

  press() { if (this.focus) this.focus.click(); }

  // hand cursor (called every frame while a menu is open)
  updateHand(dt, hands) {
    const c = hands && hands.ready ? hands.cursor : null;
    const el = this.cursorEl;
    if (!c || !c.visible || !this.root) { el.classList.remove('on'); this.hoverEl = null; this.dwell = 0; return; }
    const x = c.x * innerWidth, y = c.y * innerHeight;
    el.classList.add('on');
    el.style.transform = `translate(${x}px, ${y}px) scale(${c.pinch ? 0.8 : 1})`;
    el.classList.toggle('pinch', c.pinch);
    const under = document.elementFromPoint(x, y);
    const target = under && under.closest ? under.closest('[data-nav]') : null;
    const valid = target && this.root.contains(target) ? target : null;
    if (valid !== this.hoverEl) {
      this.hoverEl?.classList.remove('hover');
      this.hoverEl = valid; this.dwell = 0;
      if (valid) { valid.classList.add('hover'); this.setFocus(valid, true, false); }
    }
    if (valid) {
      this.dwell += dt;
      if (c.clicked || this.dwell >= DWELL) { this.dwell = -0.8; valid.click(); }
    }
    const p = Math.max(0, Math.min(1, this.dwell / DWELL));
    this.ring.style.strokeDashoffset = String(151 * (1 - p));
  }
}
