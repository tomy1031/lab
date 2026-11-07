// text.js — canvas-texture panels (Japanese text works with any system font) and poke-able buttons.
import * as THREE from 'three';

export const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", system-ui, sans-serif';
export const font = (px, weight = 700) => `${weight} ${px}px ${FONT}`;

export const COLORS = {
  L: '#4cc9ff', R: '#ff5fb7', A: '#ffd166',
  ink: '#f4f1ff', muted: '#a9a4d6', panel: 'rgba(14, 12, 40, 0.82)', line: 'rgba(160, 150, 255, 0.35)',
  btn: 'rgba(60, 54, 140, 0.9)', btnHover: 'rgba(96, 86, 210, 0.95)', btnSel: '#ffd166', primary: '#ff5fb7',
};

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// fit text into maxW by shrinking the font
export function fitText(ctx, text, x, y, maxW, px, weight = 700, align = 'center') {
  let size = px;
  ctx.font = font(size, weight);
  while (size > 10 && ctx.measureText(text).width > maxW) { size -= 2; ctx.font = font(size, weight); }
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  return size;
}

export class Panel {
  constructor({ w, h, px = 1024, interactive = false, order = 20 }) {
    this.w = w; this.h = h; this.interactive = interactive;
    this.canvas = document.createElement('canvas');
    this.canvas.width = px;
    this.canvas.height = Math.round((px * h) / w);
    this.ppm = px / w;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.mesh.renderOrder = order;
    this.mesh.userData.panel = this;
    this.buttons = [];
    this.drawFn = null;
    this.hover = null;
  }
  get visible() { return this.mesh.visible; }
  set visible(v) { this.mesh.visible = v; }

  set(drawFn, buttons = []) {
    this.drawFn = drawFn;
    this.buttons = buttons;
    this.hover = null;
    this.redraw();
  }
  redraw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.drawFn) this.drawFn(c, this);
    for (const b of this.buttons) this.drawButton(c, b);
    this.tex.needsUpdate = true;
  }
  drawButton(c, b) {
    const sel = typeof b.selected === 'function' ? b.selected() : b.selected;
    const hov = this.hover === b;
    const flash = b._flash && performance.now() - b._flash < 180;
    c.save();
    roundRect(c, b.x, b.y, b.w, b.h, Math.min(28, b.h / 3));
    c.fillStyle = b.style === 'primary' ? (hov || flash ? '#ff86c9' : COLORS.primary) : sel ? 'rgba(255, 209, 102, 0.95)' : hov || flash ? COLORS.btnHover : COLORS.btn;
    c.fill();
    c.lineWidth = hov ? 6 : 3;
    c.strokeStyle = hov ? '#ffffff' : sel ? '#fff3c4' : 'rgba(190, 180, 255, 0.55)';
    c.stroke();
    c.fillStyle = sel && b.style !== 'primary' ? '#2a1d00' : '#ffffff';
    c.textBaseline = 'middle';
    const label = typeof b.label === 'function' ? b.label() : b.label;
    const sub = typeof b.sub === 'function' ? b.sub() : b.sub;
    const big = b.font || Math.min(56, b.h * 0.42);
    if (sub) {
      fitText(c, label, b.x + b.w / 2, b.y + b.h * 0.4, b.w - 24, big);
      c.globalAlpha = 0.85;
      fitText(c, sub, b.x + b.w / 2, b.y + b.h * 0.74, b.w - 24, Math.round(big * 0.55), 500);
    } else fitText(c, label, b.x + b.w / 2, b.y + b.h / 2 + 2, b.w - 24, big);
    c.restore();
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
    setTimeout(() => this.redraw(), 200);
    b.onPress && b.onPress(b);
  }
}

// a sprite with pre-rendered glowing text (judgements, popups)
export function textTexture(text, color, { px = 96, w = 512, h = 160, weight = 800, glow = 22 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = font(px, weight);
  c.shadowColor = color; c.shadowBlur = glow;
  c.fillStyle = color;
  c.fillText(text, w / 2, h / 2);
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.font = font(px, weight);
  c.globalAlpha = 0.55;
  c.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// radial glow used for every soft light in the scene
export function glowTexture(size = 128, stops = [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]) {
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
  const g = c.createRadialGradient(m, m, 0, m, m, m * 0.35);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[size * 0.06, size], [size, size * 0.06]]) {
    const gg = c.createRadialGradient(m, m, 0, m, m, m);
    gg.addColorStop(0, 'rgba(255,255,255,0.9)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gg;
    c.beginPath(); c.ellipse(m, m, w / 2, h / 2, 0, 0, Math.PI * 2); c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
