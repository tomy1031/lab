// js/board.js — a panel you read and point at in VR (and that the PC view can show in 3D too): a canvas
// texture on a plane, with a title, text with furigana, an optional English line, and buttons. The buttons are
// found from the laser's uv on the plane.
import * as THREE from 'three';
import { FONT, layout, drawLines, fit } from './text.js';

export function canvasTex(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { canvas, ctx, tex };
}

export const ACCENT = '#ffcf3f';

export class Board {
  // w, h: canvas pixels; wm: width in metres
  constructor(id, w = 1024, h = 768, wm = 1.0, opts = {}) {
    const { canvas, ctx, tex } = canvasTex(w, h);
    Object.assign(this, { id, canvas, ctx, tex, w, h, wm, hm: (wm * h) / w });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.wm, this.hm), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: opts.depthTest ?? true, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = opts.renderOrder ?? 20;
    this.mesh.userData.hit = { kind: 'board', board: this };
    this.buttons = [];
    this.hover = null;
    this.spec = null;
    this.ruby = true;
  }
  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
  hitButton(uv) {
    if (!uv) return null;
    const x = uv.x * this.w, y = (1 - uv.y) * this.h;
    return this.buttons.find((b) => !b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }
  // spec: { title, sub, body, en, accent, buttons: [{ id, label, primary, disabled, wide }], footer, draw(ctx, y) }
  draw(spec = this.spec) {
    this.spec = spec;
    if (!spec) return;
    const c = this.ctx, W = this.w, H = this.h;
    const pad = Math.round(W * 0.05);
    c.clearRect(0, 0, W, H);
    // panel
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, spec.bg0 || 'rgba(16,26,58,0.96)');
    g.addColorStop(1, spec.bg1 || 'rgba(8,14,34,0.96)');
    c.fillStyle = g;
    c.beginPath(); c.roundRect(4, 4, W - 8, H - 8, 36); c.fill();
    c.strokeStyle = spec.accent || 'rgba(140,190,255,0.5)'; c.lineWidth = 5; c.stroke();
    let y = pad * 0.8;
    if (spec.tag) {
      c.font = `800 ${Math.round(W * 0.026)}px ${FONT}`;
      const tw = c.measureText(spec.tag).width + 28;
      c.fillStyle = spec.accent || ACCENT;
      c.beginPath(); c.roundRect(pad, y, tw, W * 0.045, 18); c.fill();
      c.fillStyle = '#0b1230'; c.textBaseline = 'middle';
      c.fillText(spec.tag, pad + 14, y + W * 0.0235);
      c.textBaseline = 'alphabetic';
      y += W * 0.06;
    }
    if (spec.title) {
      const L = fit(c, spec.title, W - pad * 2, W * 0.16, Math.round(W * 0.056), { ruby: this.ruby, weight: 900 });
      y = drawLines(c, L, pad, y, { color: spec.titleColor || ACCENT, rubyColor: '#ffe9a6' });
    }
    if (spec.sub) {
      const L = layout(c, spec.sub, W - pad * 2, Math.round(W * 0.03), { ruby: this.ruby, weight: 700 });
      y = drawLines(c, L, pad, y + 4, { color: '#9fc0ff' });
    }
    y += Math.round(W * 0.015);
    // buttons area height
    const btns = spec.buttons || [];
    const bh = Math.round(W * 0.085);
    const rows = layoutButtons(btns);
    const btnTop = H - pad * 0.8 - rows * (bh + 14) + 14;
    if (spec.body) {
      const maxH = btnTop - y - (spec.en ? W * 0.09 : 0) - 10;
      const L = fit(c, spec.body, W - pad * 2, maxH, Math.round(W * (spec.bodySize || 0.038)), { ruby: this.ruby, minSize: Math.round(W * 0.024) });
      y = drawLines(c, L, pad, y, { color: '#eef3ff', rubyColor: '#c9d8ff', bold: ACCENT });
    }
    if (spec.draw) y = spec.draw(c, y, W, H, pad) ?? y;
    if (spec.en) {
      c.font = `italic 500 ${Math.round(W * 0.027)}px ${FONT}`;
      const L = layout(c, spec.en, W - pad * 2, Math.round(W * 0.027), { weight: 500 });
      y = drawLines(c, L, pad, y + 8, { color: '#9fb1d8' });
    }
    // buttons
    this.buttons = [];
    let by = btnTop, col = 0;
    const bw2 = (W - pad * 2 - 20) / 2;
    for (const b of btns) {
      const wide = b.wide || btns.length === 1;
      if (wide && col === 1) { col = 0; by += bh + 14; }
      const x = pad + (wide ? 0 : col * (bw2 + 20));
      const w = wide ? W - pad * 2 : bw2;
      this.buttons.push({ ...b, x, y: by, w, h: bh });
      if (wide || col === 1) { col = 0; by += bh + 14; } else col = 1;
    }
    this.paintButtons();
  }
  paintButtons() {
    const c = this.ctx;
    for (const b of this.buttons) {
      const hov = this.hover === b.id;
      c.fillStyle = b.disabled ? 'rgba(255,255,255,0.05)' : b.primary ? (hov ? '#ffe680' : ACCENT) : hov ? 'rgba(130,190,255,0.45)' : 'rgba(255,255,255,0.12)';
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 22); c.fill();
      if (hov && !b.disabled) { c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.stroke(); }
      c.fillStyle = b.disabled ? '#6b7896' : b.primary ? '#0b1230' : '#ffffff';
      const size = Math.round(this.w * 0.034);
      const L = fit(c, b.label, b.w - 24, b.h - 6, size, { ruby: false, weight: 800, minSize: Math.round(size * 0.6) });
      const th = L.length * L.lineH;
      drawLines(c, L, b.x + 12, b.y + (b.h - th) / 2, { color: c.fillStyle, align: 'center', w: b.w - 24 });
    }
    this.tex.needsUpdate = true;
  }
  setHover(id) {
    if (id === this.hover) return false;
    this.hover = id;
    if (this.spec) this.draw();
    return true;
  }
}

function layoutButtons(btns) {
  let rows = 0, col = 0;
  for (const b of btns) {
    const wide = b.wide || btns.length === 1;
    if (wide) { if (col === 1) rows++; rows++; col = 0; } else if (col === 1) { rows++; col = 0; } else col = 1;
  }
  if (col === 1) rows++;
  return rows;
}
