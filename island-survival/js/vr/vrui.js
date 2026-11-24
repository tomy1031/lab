// vr/vrui.js — in-headset UI for 「ひとつだけ島」. HTML can't be seen inside the headset, so every panel is a canvas
// drawn into a CanvasTexture on a plane. Panels redraw only when their data (a cheap signature) changed.
//
//   VRWrist  (0.16 × 0.11 m, 400×275 px)  – left-controller "watch": vitals, temperature, day/time, held item, conditions
//   VRPrompt (0.50 × 0.24 m, 700×336 px)  – floats near the aimed target: name + option list
//   VRToasts (0.70 × 0.32 m, 700×320 px)  – head-locked notification feed + companion subtitles
//   VRMenu   (0.90 × 0.62 m, 900×620 px)  – B/Y menu with tabs, scrollable rows, footer buttons; hit()/setHover(uv)
//   VRLaser                               – thin ray + dot
//
// Every class has .mesh (THREE.Object3D), update(data) and dispose().
import * as THREE from 'three';

const FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const C = {
  paper: '#f7f0dd', paper2: '#efe5c9', paper3: '#e6d9b5', ink: '#2a2923', inkSoft: '#5d5849', inkFaint: '#8c8570',
  teal: '#1f7f86', orange: '#e8743b', sun: '#f2b84b', red: '#c9473d', green: '#4a9a52', blue: '#2f78c4',
  purple: '#8c6cd9', gold: '#f2b84b', glass: 'rgba(14, 38, 42, 0.82)', glassSolid: 'rgb(14, 38, 42)', glassText: '#fdf8ea',
};
const RENDER_ORDER = 1000;

/** Unlit transparent material for a panel canvas; never occluded by the world. */
export function makePanelMaterial(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  return mat;
}

// ---------- drawing helpers ----------
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function setFont(c, size, weight = 700, emoji = false) { c.font = `${weight} ${size}px ${emoji ? EMOJI : FONT}`; }
function measure(c, s, size, weight = 700) { setFont(c, size, weight); return c.measureText(s).width; }
/** s shortened with … so that it fits maxW at the current font. */
function fitText(c, s, maxW) {
  s = String(s ?? '');
  if (c.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1; }
  return s.slice(0, lo) + '…';
}
/** Draw text with vertical centring at y. align: left|center|right. maxW → ellipsize. Returns the drawn width. */
function txt(c, s, x, y, size, color, weight = 700, align = 'left', maxW = 0) {
  setFont(c, size, weight);
  c.textAlign = align; c.textBaseline = 'middle';
  s = String(s ?? '');
  if (maxW) s = fitText(c, s, maxW);
  c.fillStyle = color; c.fillText(s, x, y + size * 0.04);
  return c.measureText(s).width;
}
function emoji(c, s, x, y, size, align = 'center') {
  setFont(c, size, 400, true);
  c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = '#000';
  c.fillText(s, x, y + size * 0.06);
}
/** Wrap into at most maxLines lines (ellipsis on the last). */
function wrap(c, s, maxW, maxLines) {
  s = String(s ?? '');
  const lines = []; let cur = '';
  for (const ch of s) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    if (c.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = fitText(c, lines[maxLines - 1] + '…', maxW); }
  return lines;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ---------- common base ----------
class Panel {
  constructor(w, h, px) {
    this.w = w; this.h = h; this.px = px;
    this.cv = document.createElement('canvas');
    this.cv.width = Math.round(w * px); this.cv.height = Math.round(h * px);
    this.ctx = this.cv.getContext('2d');
    this.mat = makePanelMaterial(this.cv);
    this.tex = this.mat.map;
    this.geo = new THREE.PlaneGeometry(w, h);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.renderOrder = RENDER_ORDER;
    this.mesh.frustumCulled = false;
    this.sig = null;
    this.draws = 0; // number of canvas redraws so far (handy for tests)
  }
  /** true → new content was drawn */
  _commit(sig, drawFn) {
    if (sig === this.sig) return false;
    this.sig = sig;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    drawFn(c, this.cv.width, this.cv.height);
    this.tex.needsUpdate = true;
    this.draws++;
    return true;
  }
  dispose() {
    this.geo.dispose(); this.tex.dispose(); this.mat.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}
function glassBg(c, W, H, r = 28, fill = C.glass) {
  rr(c, 3, 3, W - 6, H - 6, r); c.fillStyle = fill; c.fill();
  c.lineWidth = 3; c.strokeStyle = 'rgba(253, 248, 234, 0.3)'; c.stroke();
}

// ================= VRWrist =================
const BARS = [
  { key: 'hp', icon: '❤️', color: C.red },
  { key: 'food', icon: '🍖', color: C.orange },
  { key: 'water', icon: '💧', color: C.blue },
  { key: 'rest', icon: '🌙', color: C.purple },
  { key: 'morale', icon: '😊', color: C.gold },
];
function tempInfo(t) {
  if (t < 34.5) return { color: '#6db7ff', word: '低体温' };
  if (t < 35.8) return { color: '#8fd0ff', word: '寒い' };
  if (t <= 37.4) return { color: '#7fd98a', word: '' };
  if (t <= 38.6) return { color: '#ffb066', word: '熱っぽい' };
  return { color: '#ff7a6e', word: '高熱' };
}

export class VRWrist extends Panel {
  constructor() { super(0.16, 0.11, 2500); this.update({}); }
  update(d = {}) {
    const bars = BARS.map(b => Math.round(clamp(num(d[b.key], 100), 0, 100)));
    const stamina = Math.round(clamp(num(d.stamina, 100), 0, 100));
    const temp = Number.isFinite(d.bodyTemp) ? Math.round(d.bodyTemp * 10) / 10 : null;
    const wet = Math.round(clamp(num(d.wet, 0), 0, 100));
    const conds = (d.conditions || []).slice(0, 6);
    const sig = JSON.stringify([bars, stamina, temp, wet, d.day, d.days, d.time, d.weather, d.held || '', conds]);
    return this._commit(sig, (c, W, H) => {
      glassBg(c, W, H, 30);
      // top line: day / time / weather
      const dayTxt = d.day != null ? (d.days ? `${d.day}/${d.days}日目` : `${d.day}日目`) : '';
      txt(c, dayTxt, 22, 26, 32, C.sun, 900, 'left');
      txt(c, d.time || '', 200, 26, 34, C.glassText, 900, 'center');
      txt(c, d.weather || '', W - 22, 26, 32, C.glassText, 700, 'right', 110);
      // rings
      const cy = 86, r = 29, lw = 9;
      BARS.forEach((b, i) => {
        const cx = 42 + i * 79, v = bars[i] / 100, low = bars[i] <= 20;
        c.lineWidth = lw; c.lineCap = 'round';
        c.strokeStyle = 'rgba(253, 248, 234, 0.2)';
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
        if (v > 0.01) {
          c.strokeStyle = low ? '#ff6a5c' : b.color;
          c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v); c.stroke();
        }
        emoji(c, b.icon, cx, cy, 26);
        if (low) { c.fillStyle = '#ff6a5c'; c.beginPath(); c.arc(cx + 22, cy - 24, 8, 0, Math.PI * 2); c.fill(); }
      });
      // stamina bar
      rr(c, 22, 130, W - 44, 10, 5); c.fillStyle = 'rgba(253, 248, 234, 0.2)'; c.fill();
      if (stamina > 0) { rr(c, 22, 130, Math.max(10, (W - 44) * stamina / 100), 10, 5); c.fillStyle = C.green; c.fill(); }
      // temperature + wet
      if (temp !== null) {
        const ti = tempInfo(temp);
        const label = `${temp.toFixed(1)}℃${ti.word ? ' ' + ti.word : ''}`;
        const w = 40 + measure(c, label, 30, 900) + 14;
        rr(c, 14, 150, w, 40, 20); c.fillStyle = 'rgba(0, 0, 0, 0.32)'; c.fill();
        c.lineWidth = 3; c.strokeStyle = ti.color; c.stroke();
        emoji(c, '🌡️', 36, 170, 24);
        txt(c, label, 54, 170, 30, ti.color, 900, 'left');
      }
      const wetCol = wet >= 30 ? '#6db7ff' : 'rgba(253, 248, 234, 0.6)';
      emoji(c, '💦', W - 128, 170, 24);
      txt(c, `${wet}%`, W - 22, 170, 30, wetCol, 900, 'right');
      // held item
      emoji(c, '✋', 36, 208, 24);
      txt(c, d.held || 'なし', 58, 208, 30, d.held ? C.glassText : 'rgba(253, 248, 234, 0.5)', 700, 'left', W - 80);
      // conditions
      let x = 16; const y = 243;
      setFont(c, 28, 700);
      conds.forEach((s, i) => {
        const w = measure(c, s, 28, 900) + 24;
        if (x + w > W - 14) { if (i < conds.length) { txt(c, `+${conds.length - i}`, x + 4, y, 28, C.glassText, 900, 'left'); } x = Infinity; return; }
        if (x === Infinity) return;
        rr(c, x, y - 17, w, 34, 17); c.fillStyle = C.orange; c.fill();
        txt(c, s, x + w / 2, y, 28, C.ink, 900, 'center');
        x += w + 8;
      });
    });
  }
}

// ================= VRPrompt =================
export class VRPrompt extends Panel {
  constructor() { super(0.5, 0.24, 1400); this.mesh.visible = false; }
  update(d) {
    if (!d) { this.mesh.visible = false; return false; }
    this.mesh.visible = true;
    const opts = d.options || [];
    const idx = clamp(d.index | 0, 0, Math.max(0, opts.length - 1));
    const sig = JSON.stringify([d.label, opts.map(o => [o.label, !!o.ok, o.reason || '']), idx]);
    return this._commit(sig, (c, W, H) => {
      glassBg(c, W, H, 34);
      txt(c, d.label || '', 28, 40, 44, C.glassText, 900, 'left', W - 56);
      const ROWS = 4, rowH = 52;
      let start = 0;
      if (opts.length > ROWS) start = clamp(idx - 1, 0, opts.length - ROWS);
      const top = 72;
      for (let k = 0; k < Math.min(ROWS, opts.length); k++) {
        const o = opts[start + k], sel = start + k === idx, y = top + k * rowH + rowH / 2;
        if (sel) { rr(c, 14, y - rowH / 2 + 3, W - 28, rowH - 6, 18); c.fillStyle = C.teal; c.fill(); c.lineWidth = 3; c.strokeStyle = '#8ee0e6'; c.stroke(); }
        const ok = o.ok !== false;
        const col = ok ? (sel ? '#ffffff' : C.glassText) : (sel ? '#c9d3cf' : 'rgba(253, 248, 234, 0.45)');
        txt(c, sel ? '▶' : '', 32, y, 30, col, 900, 'center');
        let reasonW = 0;
        if (!ok && o.reason) reasonW = Math.min(300, measure(c, o.reason, 28, 700)) + 14;
        txt(c, o.label, 56, y, 38, col, 900, 'left', W - 56 - 28 - reasonW);
        if (!ok && o.reason) txt(c, o.reason, W - 28, y, 28, sel ? '#ffd9a8' : '#e0a077', 700, 'right', 300);
      }
      if (start > 0) txt(c, '▲', W - 28, 56, 24, 'rgba(253,248,234,.7)', 900, 'right');
      if (start + ROWS < opts.length) txt(c, '▼', W - 28, H - 70, 24, 'rgba(253,248,234,.7)', 900, 'right');
      txt(c, 'トリガー：決定　スティック ↑↓：えらぶ', W / 2, H - 28, 28, 'rgba(253, 248, 234, 0.72)', 700, 'center', W - 28);
    });
  }
}

// ================= VRToasts =================
const KIND_COLOR = { info: '#6fb5d6', good: '#6cc276', warn: C.sun, bad: '#e8645a' };
const TOAST_LIFE = 4.0, FADE_OUT = 0.7, FADE_IN = 0.15;

export class VRToasts extends Panel {
  constructor() {
    super(0.7, 0.32, 1000);
    this.toasts = []; this.subs = []; this._id = 1;
    this.mesh.visible = false;
    this._draw();
  }
  push(text, kind = 'info') {
    this.toasts.push({ id: this._id++, text: String(text), kind: KIND_COLOR[kind] ? kind : 'info', age: 0, life: TOAST_LIFE });
    if (this.toasts.length > 3) this.toasts.splice(0, this.toasts.length - 3);
    this._draw();
  }
  subtitle(who, text) {
    const life = 3 + 0.09 * String(text).length;
    const e = { id: this._id++, who: String(who), text: String(text), age: 0, life };
    const i = this.subs.findIndex(s => s.who === e.who);
    if (i >= 0) this.subs[i] = e; else this.subs.push(e);
    if (this.subs.length > 2) this.subs.splice(0, this.subs.length - 2);
    this._draw();
  }
  update(dt = 0) {
    for (const t of this.toasts) t.age += dt;
    for (const s of this.subs) s.age += dt;
    this.toasts = this.toasts.filter(t => t.age < t.life);
    this.subs = this.subs.filter(s => s.age < s.life);
    return this._draw();
  }
  _alpha(e) { return clamp(Math.min(e.age / FADE_IN, (e.life - e.age) / FADE_OUT), 0, 1); }
  _draw() {
    const q = a => Math.round(a * 12);
    const sig = JSON.stringify([this.toasts.map(t => [t.id, q(this._alpha(t))]), this.subs.map(s => [s.id, q(this._alpha(s))])]);
    const any = this.toasts.length + this.subs.length > 0;
    this.mesh.visible = any;
    if (!any && this.sig === sig) return false;
    return this._commit(sig, (c, W, H) => {
      let y = H - 6; // stack upwards from the bottom: subtitles first (nearest the bottom), toasts above
      const subs = this.subs, toasts = this.toasts.slice().reverse();
      for (const s of subs.slice().reverse()) {
        const a = this._alpha(s), pad = 16, nameW = measure(c, s.who + '：', 30, 900);
        setFont(c, 32, 700);
        const lines = wrap(c, s.text, W - 60 - pad * 2 - (nameW > 0 ? 0 : 0), 2);
        const h = 18 + lines.length * 40 + 34;
        y -= h;
        c.globalAlpha = a;
        rr(c, 10, y, W - 20, h, 24); c.fillStyle = 'rgba(14, 38, 42, 0.86)'; c.fill();
        txt(c, s.who, 30, y + 26, 30, C.gold, 900, 'left', W - 60);
        setFont(c, 32, 700);
        lines.forEach((ln, i) => txt(c, ln, 30, y + 26 + 34 + i * 40, 32, C.glassText, 700, 'left'));
        y -= 8;
        c.globalAlpha = 1;
      }
      for (const t of toasts) {
        const a = this._alpha(t), h = 52;
        y -= h;
        c.globalAlpha = a;
        rr(c, 40, y, W - 80, h, 22); c.fillStyle = 'rgba(14, 38, 42, 0.86)'; c.fill();
        c.save(); rr(c, 40, y, W - 80, h, 22); c.clip(); c.fillStyle = KIND_COLOR[t.kind]; c.fillRect(40, y, 12, h); c.restore();
        txt(c, t.text, 70, y + h / 2, 32, C.glassText, 700, 'left', W - 80 - 48);
        y -= 6;
        c.globalAlpha = 1;
      }
    });
  }
}

// ================= VRMenu =================
const MENU = {
  px: 1000, W: 900, H: 620,
  titleH: 64, tabY: 72, tabH: 52,
  rowsY: 134, rowH: 64, visible: 6,
  rowX: 20, rowW: 800, scrollX: 836, scrollW: 48,
  footY: 536, footH: 64,
};

export class VRMenu extends Panel {
  constructor() {
    super(0.9, 0.62, MENU.px);
    this.visibleRows = MENU.visible;
    this.scroll = 0; this.maxScroll = 0;
    this.regions = [];
    this.hoverKey = null;
    this.data = {};
    this.update({});
  }
  update(d = {}) {
    this.data = d;
    const rows = d.rows || [];
    this.maxScroll = Math.max(0, rows.length - MENU.visible);
    this.scroll = clamp(Math.round(num(d.scroll, 0)), 0, this.maxScroll);
    return this._render();
  }
  _render() {
    const d = this.data, rows = d.rows || [], hk = this.hoverKey, sc = this.scroll;
    const sig = JSON.stringify([d.title, d.tabs, d.tab, rows, d.footer, d.note, sc, hk]);
    return this._commit(sig, (c, W, H) => this._draw(c, W, H, d, rows, sc, hk));
  }
  _btn(c, key, id, row, x, y, w, h, label, o = {}) {
    const hov = this.hoverKey === key && !o.disabled;
    const size = o.size || 28;
    let fill, stroke, col;
    if (o.disabled) { fill = '#dcd5bf'; stroke = '#b9b098'; col = C.inkFaint; }
    else if (o.active) { fill = hov ? '#26939b' : C.teal; stroke = C.ink; col = '#ffffff'; }
    else if (o.primary) { fill = hov ? '#f59a66' : C.orange; stroke = C.ink; col = C.ink; }
    else { fill = hov ? C.sun : '#fffaf0'; stroke = C.ink; col = C.ink; }
    rr(c, x, y, w, h, h / 2); c.fillStyle = fill; c.fill();
    c.lineWidth = hov ? 6 : 3; c.strokeStyle = hov ? C.teal : stroke; c.stroke();
    if (hov) { rr(c, x - 4, y - 4, w + 8, h + 8, (h + 8) / 2); c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.stroke(); }
    txt(c, label, x + w / 2, y + h / 2, size, col, 900, 'center', w - 20);
    if (!o.disabled) this.regions.push({ key, id, row, x, y, w, h });
  }
  _draw(c, W, H, d, rows, sc, hk) {
    const M = MENU;
    this.regions = [];
    // paper sheet
    rr(c, 3, 3, W - 6, H - 6, 34); c.fillStyle = C.paper; c.fill();
    c.save(); rr(c, 3, 3, W - 6, H - 6, 34); c.clip();
    c.fillStyle = C.teal; c.fillRect(0, 0, W, M.titleH);
    c.restore();
    rr(c, 3, 3, W - 6, H - 6, 34); c.lineWidth = 6; c.strokeStyle = C.ink; c.stroke();
    // title + note
    const noteW = d.note ? Math.min(380, measure(c, d.note, 28, 700) + 4) : 0;
    txt(c, d.title || '', 34, M.titleH / 2 + 2, 40, '#ffffff', 900, 'left', W - 68 - noteW - 20);
    if (d.note) txt(c, d.note, W - 34, M.titleH / 2 + 2, 28, '#e6f6f4', 700, 'right', 380);
    // tabs
    const tabs = d.tabs || [];
    if (tabs.length) {
      const gap = 10, tw = Math.min(210, (W - 40 - gap * (tabs.length - 1)) / tabs.length);
      let x = 20;
      for (const t of tabs) {
        this._btn(c, 'tab:' + t.id, 'tab:' + t.id, null, x, M.tabY, tw, M.tabH, t.label, { active: t.id === d.tab, size: 30 });
        x += tw + gap;
      }
    }
    // rows
    const vis = rows.slice(sc, sc + M.visible);
    if (!rows.length) txt(c, 'なにも ありません', M.rowX + M.rowW / 2, M.rowsY + 90, 34, C.inkFaint, 700, 'center');
    vis.forEach((r, i) => {
      const y = M.rowsY + i * M.rowH;
      rr(c, M.rowX, y + 3, M.rowW, M.rowH - 6, 20);
      c.fillStyle = i % 2 ? 'rgba(255, 250, 240, 0.55)' : 'rgba(255, 250, 240, 0.9)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(90, 70, 30, 0.25)'; c.stroke();
      const cy = y + M.rowH / 2;
      let textX = M.rowX + 18;
      if (r.icon) { emoji(c, r.icon, M.rowX + 38, cy, 36); textX = M.rowX + 78; }
      // buttons (right-aligned)
      let bx = M.rowX + M.rowW - 12;
      const btns = (r.buttons || []).slice().reverse();
      for (const b of btns) {
        const bw = Math.max(96, measure(c, b.label, 28, 900) + 36), bh = 44;
        bx -= bw;
        this._btn(c, `row:${r.id}:${b.id}`, `row:${r.id}:${b.id}`, r.id, bx, cy - bh / 2, bw, bh, b.label, { primary: b.primary, disabled: b.disabled });
        bx -= 8;
      }
      let rightW = 0;
      if (r.right) { rightW = Math.min(220, measure(c, r.right, 30, 900)); txt(c, r.right, bx - 6, cy, 30, C.teal, 900, 'right', 220); bx -= rightW + 18; }
      const maxW = bx - 10 - textX;
      if (r.sub) { // name, then the detail in a softer colour on the same line (6 rows at ≥28 px need one line each)
        const nameMax = Math.min(measure(c, r.text, 32, 900), maxW * 0.62);
        const used = txt(c, r.text, textX, cy, 32, C.ink, 900, 'left', nameMax);
        const subX = textX + used + 16;
        if (maxW - (subX - textX) > 80) txt(c, r.sub, subX, cy, 28, C.inkSoft, 500, 'left', maxW - (subX - textX));
      } else txt(c, r.text, textX, cy, 32, C.ink, 900, 'left', maxW);
    });
    // scroll column
    const sx = M.scrollX, sw = M.scrollW, ay = M.rowsY, areaH = M.visible * M.rowH;
    const canUp = sc > 0, canDn = sc < this.maxScroll;
    this._btn(c, 'scroll:up', 'scroll:up', null, sx, ay, sw, 44, '▲', { disabled: !canUp, size: 26 });
    this._btn(c, 'scroll:down', 'scroll:down', null, sx, ay + areaH - 44, sw, 44, '▼', { disabled: !canDn, size: 26 });
    const ty = ay + 54, th = areaH - 108;
    rr(c, sx + sw / 2 - 8, ty, 16, th, 8); c.fillStyle = 'rgba(90, 70, 30, 0.2)'; c.fill();
    if (rows.length) {
      const frac = Math.min(1, M.visible / rows.length);
      const hh = Math.max(36, th * frac);
      const hy = ty + (this.maxScroll ? (th - hh) * sc / this.maxScroll : 0);
      rr(c, sx + sw / 2 - 8, hy, 16, hh, 8); c.fillStyle = this.maxScroll ? C.teal : C.inkFaint; c.fill();
    }
    // footer
    const foot = d.footer || [];
    if (foot.length) {
      const gap = 20;
      const ws = foot.map(f => Math.max(180, measure(c, f.label, 32, 900) + 56));
      const total = ws.reduce((a, b) => a + b, 0) + gap * (foot.length - 1);
      let x = (W - total) / 2;
      foot.forEach((f, i) => { this._btn(c, f.id, f.id, null, x, M.footY, ws[i], M.footH, f.label, { primary: f.primary, size: 32 }); x += ws[i] + gap; });
    }
  }
  _find(uv) {
    if (!uv) return null;
    const x = uv.x * this.cv.width, y = (1 - uv.y) * this.cv.height;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }
  /** uv in [0,1]² (origin bottom-left, as three's intersection.uv) → { id, row } | null. Disabled buttons are not hit. */
  hit(uv) { const r = this._find(uv); return r ? { id: r.id, row: r.row } : null; }
  /** Highlight whatever is under uv (null/undefined clears). Redraws only if the hovered thing changed. Returns the hit. */
  setHover(uv) {
    const r = this._find(uv), key = r ? r.key : null;
    if (key !== this.hoverKey) { this.hoverKey = key; this._render(); }
    return r ? { id: r.id, row: r.row } : null;
  }
}

// ================= VRLaser =================
export class VRLaser {
  constructor() {
    this.mesh = new THREE.Group();
    this.mesh.renderOrder = RENDER_ORDER + 5;
    const mk = (opacity) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    this.beamGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 1, 8, 1, true);
    this.beamGeo.rotateX(-Math.PI / 2); this.beamGeo.translate(0, 0, -0.5); // from origin along −Z, length 1
    this.beamMat = mk(0.75);
    this.beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    this.beam.renderOrder = RENDER_ORDER + 5; this.beam.frustumCulled = false;
    this.dotGeo = new THREE.CircleGeometry(0.012, 24);
    this.dotMat = mk(0.95);
    this.dot = new THREE.Mesh(this.dotGeo, this.dotMat);
    this.dot.renderOrder = RENDER_ORDER + 6; this.dot.frustumCulled = false; this.dot.visible = false;
    this.ringGeo = new THREE.RingGeometry(0.014, 0.019, 24);
    this.ringMat = mk(0.6);
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ring.renderOrder = RENDER_ORDER + 6; this.ring.frustumCulled = false;
    this.dot.add(this.ring);
    this.mesh.add(this.beam, this.dot);
    this._col = new THREE.Color();
  }
  /** length: metres from the controller (aim along its −Z); hit: ray hits a UI panel; color: any THREE.Color input */
  update({ length = 1, hit = false, color = 0xffffff } = {}) {
    length = Math.max(0.01, length);
    this._col.set(color);
    this.beam.scale.z = length;
    this.beamMat.color.copy(this._col); this.beamMat.opacity = hit ? 0.9 : 0.45;
    this.dot.visible = !!hit;
    this.dot.position.set(0, 0, -length + 0.002);
    const s = clamp(length / 0.8, 0.6, 2.5); this.dot.scale.setScalar(s);
    this.dotMat.color.copy(this._col); this.ringMat.color.copy(this._col);
  }
  dispose() {
    this.beamGeo.dispose(); this.dotGeo.dispose(); this.ringGeo.dispose();
    this.beamMat.dispose(); this.dotMat.dispose(); this.ringMat.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}
