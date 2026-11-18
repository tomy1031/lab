// vr/panel.js — flat canvas panels for VR (HTML can't be seen inside the headset): a title, rows of text
// (with optional pictures) and buttons, pressed with the controller laser or a hand pinch.
import * as THREE from 'three';

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';

export class VRPanel {
  // w, h: size in metres; px: canvas pixels per metre
  constructor(w, h, px = 900) {
    this.w = w; this.h = h;
    this.cv = document.createElement('canvas');
    this.cv.width = Math.round(w * px); this.cv.height = Math.round(h * px);
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
    this.mesh.renderOrder = 20;
    this.mesh.material.depthTest = false;
    this.buttons = [];
    this.hover = null;
    this.spec = null;
  }

  // spec: { title, sub, rows: [{ text, right, color, me, img }], buttons: [{ id, label, primary }] }
  draw(spec = this.spec) {
    this.spec = spec;
    const c = this.ctx, W = this.cv.width, H = this.cv.height;
    c.clearRect(0, 0, W, H);
    roundRect(c, 4, 4, W - 8, H - 8, 46);
    c.fillStyle = 'rgba(30, 20, 72, 0.9)'; c.fill();
    c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,0.45)'; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let y = 90;
    if (spec.title) { text(c, spec.title, W / 2, y, 72, '#ffd93b'); y += 70; }
    if (spec.sub) { text(c, spec.sub, W / 2, y, 36, '#ffffff', 500); y += 56; }
    const rows = spec.rows || [];
    const btnH = spec.buttons && spec.buttons.length ? 130 : 0;
    const rh = rows.length ? Math.min(66, (H - y - btnH - 40) / rows.length) : 0;
    rows.forEach((r, i) => {
      const ry = y + i * rh + rh / 2;
      if (r.me) { roundRect(c, 60, ry - rh / 2 + 3, W - 120, rh - 6, 18); c.fillStyle = 'rgba(255, 217, 59, 0.3)'; c.fill(); }
      c.textAlign = 'left';
      let x = 90;
      if (r.color) { c.fillStyle = r.color; c.beginPath(); c.arc(x, ry, rh * 0.22, 0, Math.PI * 2); c.fill(); x += rh * 0.45; }
      if (r.img && r.img.complete && r.img.naturalWidth) { c.drawImage(r.img, x, ry - rh * 0.45, rh * 0.9, rh * 0.9); x += rh; }
      text(c, r.text, x, ry, Math.min(38, rh * 0.62), '#ffffff', 800, 'left');
      if (r.right) text(c, r.right, W - 90, ry, Math.min(34, rh * 0.55), '#ffd93b', 800, 'right');
    });
    // buttons
    this.buttons = [];
    const bs = spec.buttons || [];
    if (bs.length) {
      const gap = 30, bw = Math.min(420, (W - 120 - gap * (bs.length - 1)) / bs.length), bh = 96;
      const total = bw * bs.length + gap * (bs.length - 1);
      let bx = (W - total) / 2;
      const by = H - bh - 40;
      for (const b of bs) {
        const hov = this.hover === b.id;
        roundRect(c, bx, by, bw, bh, 48);
        c.fillStyle = b.primary ? (hov ? '#fff07a' : '#ffc93b') : (hov ? '#ffffff' : '#dcd6ff');
        c.fill();
        if (hov) { c.lineWidth = 8; c.strokeStyle = '#4fe3ff'; c.stroke(); }
        c.font = `900 40px ${FONT}`;
        const fit = Math.min(40, (40 * (bw - 36)) / Math.max(1, c.measureText(b.label).width));
        text(c, b.label, bx + bw / 2, by + bh / 2 + 2, fit, b.primary ? '#4a1d00' : '#2a1b5e', 900);
        this.buttons.push({ id: b.id, x: bx, y: by, w: bw, h: bh });
        bx += bw + gap;
      }
    }
    this.tex.needsUpdate = true;
  }

  // uv (0…1, origin bottom-left) → button id
  hit(uv) {
    const x = uv.x * this.cv.width, y = (1 - uv.y) * this.cv.height;
    for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  setHover(id) { if (id !== this.hover) { this.hover = id; if (this.spec) this.draw(); } }
}

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

export function text(c, s, x, y, size, color, weight = 900, align = 'center') {
  c.font = `${weight} ${size}px ${FONT}`;
  c.textAlign = align;
  c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(20, 8, 50, 0.85)';
  c.strokeText(s, x, y);
  c.fillStyle = color; c.fillText(s, x, y);
}
