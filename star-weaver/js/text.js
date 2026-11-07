// text.js — canvas-texture panels and poke-able buttons in the shared theme, plus glow textures.
import * as THREE from 'three';
import { C, font, roundRect, linear, glass, fitText, icon, spaced } from './theme.js';

export { FONT, font, C as COLORS, roundRect, fitText } from './theme.js';

let softRect = null;
function softRectTexture() {
  if (softRect) return softRect;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.shadowColor = '#fff'; c.shadowBlur = 40;
  c.fillStyle = '#fff';
  roundRect(c, 48, 48, 160, 160, 30); c.fill();
  softRect = new THREE.CanvasTexture(cv);
  softRect.colorSpace = THREE.SRGBColorSpace;
  return softRect;
}

export class Panel {
  constructor({ w, h, px = 1024, interactive = false, order = 20, glow = null }) {
    this.w = w; this.h = h; this.interactive = interactive;
    this.canvas = document.createElement('canvas');
    this.canvas.width = px;
    this.canvas.height = Math.round((px * h) / w);
    this.ppm = px / w;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.mesh.renderOrder = order;
    this.mesh.userData.panel = this;
    if (glow) {
      // soft coloured light behind the panel
      this.halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, h * 1.6), new THREE.MeshBasicMaterial({ map: softRectTexture(), color: new THREE.Color(glow), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.halo.position.z = -0.004;
      this.halo.renderOrder = order - 1;
      this.mesh.add(this.halo);
    }
    this.buttons = [];
    this.drawFn = null;
    this.hover = null;
    this.t0 = 0;
  }
  get visible() { return this.mesh.visible; }
  set visible(v) {
    if (v && !this.mesh.visible) this.t0 = performance.now();
    this.mesh.visible = v;
  }
  // entrance animation: a quick fade and settle
  tick(now) {
    if (!this.mesh.visible) return;
    const k = Math.min(1, (now - this.t0) / 240), e = 1 - Math.pow(1 - k, 3);
    this.mesh.material.opacity = e;
    const s = 0.94 + 0.06 * e;
    this.mesh.scale.set(s, s, 1);
    if (this.halo) this.halo.material.opacity = 0.32 * e;
  }

  set(drawFn, buttons = []) {
    this.drawFn = drawFn;
    this.buttons = buttons;
    this.hover = null;
    this.redraw();
  }
  redraw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    if (this.drawFn) this.drawFn(c, this);
    c.restore();
    for (const b of this.buttons) { c.save(); this.drawButton(c, b); c.restore(); }
    this.tex.needsUpdate = true;
  }

  drawButton(c, b) {
    const val = (v) => (typeof v === 'function' ? v() : v);
    const sel = val(b.selected), hov = this.hover === b && !b.disabled;
    const flash = b._flash && performance.now() - b._flash < 200;
    const label = val(b.label), sub = val(b.sub), ic = val(b.icon), chip = val(b.chip);
    const st = b.style || 'seg';
    const grow = hov ? 4 : 0;
    const x = b.x - grow, y = b.y - grow, w = b.w + grow * 2, h = b.h + grow * 2;
    const r = b.r ?? (st === 'card' ? 30 : Math.min(26, h / 2.6));
    if (b.disabled) c.globalAlpha = 0.32;

    if (st === 'primary') {
      c.shadowColor = 'rgba(255, 95, 183, 0.75)'; c.shadowBlur = hov || flash ? 46 : 26;
      roundRect(c, x, y, w, h, r);
      c.fillStyle = linear(c, x, y, x + w, y + h, [[0, '#ff4fa3'], [0.55, '#ff6f87'], [1, '#ff9a5c']]);
      c.fill();
      c.shadowBlur = 0;
      roundRect(c, x + 3, y + 3, w - 6, h * 0.45, r - 3);
      c.fillStyle = 'rgba(255,255,255,0.16)'; c.fill();
      if (hov || flash) { roundRect(c, x, y, w, h, r); c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke(); }
    } else if (st === 'card') {
      glass(c, x, y, w, h, r, { glow: sel ? 'rgba(120, 140, 255, 0.55)' : hov ? 'rgba(120, 140, 255, 0.35)' : null, tint: sel ? 'rgba(110, 120, 255, 0.16)' : hov ? 'rgba(255,255,255,0.05)' : null });
      if (sel) {
        roundRect(c, x + 1, y + 1, w - 2, h - 2, r);
        c.lineWidth = 4; c.strokeStyle = linear(c, x, y, x + w, y + h, [[0, C.L], [0.5, C.V], [1, C.R]]); c.stroke();
      }
    } else {
      // seg / ghost
      roundRect(c, x, y, w, h, r);
      if (sel) {
        c.shadowColor = 'rgba(110, 140, 255, 0.7)'; c.shadowBlur = 22;
        c.fillStyle = linear(c, x, y, x + w, y + h, [[0, '#3fb6ff'], [1, '#7a5cff']]);
        c.fill(); c.shadowBlur = 0;
        roundRect(c, x + 2, y + 2, w - 4, h * 0.45, r - 2); c.fillStyle = 'rgba(255,255,255,0.14)'; c.fill();
      } else {
        c.fillStyle = hov || flash ? 'rgba(255,255,255,0.14)' : st === 'ghost' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.045)';
        c.fill();
        c.lineWidth = hov ? 3 : 2; c.strokeStyle = hov ? 'rgba(255,255,255,0.85)' : C.glassLine; c.stroke();
      }
    }

    // contents
    c.textBaseline = 'middle';
    const ink = st === 'primary' || sel ? '#ffffff' : C.ink;
    if (st === 'card') {
      const cx = x + 30, cy = y + 42;
      c.beginPath(); c.arc(cx + 14, cy, 26, 0, Math.PI * 2);
      c.fillStyle = sel ? linear(c, cx - 12, cy - 26, cx + 40, cy + 26, [[0, C.L], [1, C.V]]) : 'rgba(255,255,255,0.08)';
      c.fill();
      if (ic) icon(c, ic, cx + 14, cy, 28, '#ffffff', 2.4);
      if (chip) {
        c.font = font(20, 700); spaced(c, 2);
        const cw = c.measureText(chip).width + 26;
        roundRect(c, x + w - cw - 20, cy - 17, cw, 34, 17);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
        c.fillStyle = C.ink; c.textAlign = 'center'; c.fillText(chip, x + w - cw / 2 - 20, cy + 1);
        spaced(c, 0);
      }
      c.fillStyle = '#ffffff';
      c.textBaseline = 'alphabetic';
      c.save(); spaced(c, 1.5); fitText(c, label, x + 30, y + h * 0.64, w - 60, b.font || 44, 800, 'left'); c.restore();
      if (sub) { c.fillStyle = C.muted; fitText(c, sub, x + 30, y + h * 0.86, w - 60, 23, 500, 'left'); }
      return;
    }
    const big = b.font || Math.min(st === 'primary' ? 56 : 40, h * 0.4);
    c.fillStyle = ink;
    const hasSub = !!sub;
    let tx = x + w / 2;
    if (ic) {
      c.font = font(big, 800);
      spaced(c, st === 'primary' ? 3 : 1);
      const tw = Math.min(c.measureText(label).width, w - 40 - big);
      const isz = big * (st === 'primary' ? 0.95 : 0.85);
      const total = isz + 14 + tw;
      const ix = x + w / 2 - total / 2 + isz / 2;
      icon(c, ic, ix, y + (hasSub ? h * 0.4 : h / 2), isz, ink, 2.4);
      tx = ix + isz / 2 + 14 + tw / 2;
      c.textBaseline = 'middle';
      fitText(c, label, tx, y + (hasSub ? h * 0.4 : h / 2) + 2, w - 40 - isz, big, 800);
      spaced(c, 0);
    } else {
      c.save(); spaced(c, 1); fitText(c, label, tx, y + (hasSub ? h * 0.4 : h / 2) + 2, w - 24, big, st === 'primary' ? 800 : 700); c.restore();
    }
    if (hasSub) {
      c.globalAlpha *= 0.82;
      c.fillStyle = sel || st === 'primary' ? '#ffffff' : C.muted;
      fitText(c, sub, x + w / 2, y + h * 0.76, w - 20, Math.round(big * 0.52), 500);
    }
  }

  // local point in metres (panel centre origin) → canvas pixels
  toPx(local) { return { x: (local.x + this.w / 2) * this.ppm, y: (this.h / 2 - local.y) * this.ppm }; }
  buttonAtPx(p) {
    for (const b of this.buttons) {
      if (b.disabled) continue;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }
  setHover(b) { if (b !== this.hover) { this.hover = b; this.redraw(); } }
  press(b) {
    b._flash = performance.now();
    this.redraw();
    setTimeout(() => this.redraw(), 220);
    b.onPress && b.onPress(b);
  }
}

// judgement words: italic display type, gradient fill, dark outline, coloured glow
export function textTexture(text, color, { px = 96, w = 640, h = 180, weight = 800 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = font(px, weight, true);
  spaced(c, px * 0.06);
  let size = px;
  while (c.measureText(text).width > w - 40 && size > 30) { size -= 4; c.font = font(size, weight, true); }
  c.shadowColor = color; c.shadowBlur = 28;
  c.lineJoin = 'round';
  c.lineWidth = size * 0.12;
  c.strokeStyle = 'rgba(12, 8, 40, 0.85)';
  c.strokeText(text, w / 2, h / 2);
  c.shadowBlur = 0;
  c.fillStyle = linear(c, 0, h / 2 - size * 0.5, 0, h / 2 + size * 0.45, [[0, '#ffffff'], [0.5, color], [1, color]]);
  c.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// radial glow used for every soft light in the scene
export function glowTexture(size = 128, stops = [[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// four-point sparkle
export function sparkleTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d'), m = size / 2;
  const g = c.createRadialGradient(m, m, 0, m, m, m * 0.3);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[size * 0.05, size], [size, size * 0.05], [size * 0.03, size * 0.6], [size * 0.6, size * 0.03]]) {
    const gg = c.createRadialGradient(m, m, 0, m, m, Math.max(w, h) / 2);
    gg.addColorStop(0, 'rgba(255,255,255,0.95)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gg;
    c.save(); c.translate(m, m); if (w < size * 0.04 || h < size * 0.04) c.rotate(Math.PI / 4);
    c.beginPath(); c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
