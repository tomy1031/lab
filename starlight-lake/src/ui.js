import * as THREE from 'three';
import { FONT, TITLE_FONT } from './config.js';

// In-world UI: canvas-textured glass panels with buttons, hit-tested by pointer rays.

export class Panel {
  /**
   * @param {object} o
   * @param {number} o.w  width in metres
   * @param {number} o.h  height in metres
   * @param {number} [o.px=1024] canvas width in pixels
   * @param {(g:CanvasRenderingContext2D, W:number, H:number, panel:Panel)=>void} o.draw
   */
  constructor({ w, h, px = 1024, draw, glass = true, theme = 'night', accent = '#5ab8ff' }) {
    this.theme = theme; this.accent = accent;
    this.w = w; this.h = h;
    this.W = px; this.H = Math.round(px * h / w);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.drawFn = draw;
    this.glass = glass;
    this.buttons = [];
    this.hoverId = null;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.mesh.renderOrder = 50;
    this.mesh.userData.panel = this;
    this.opacity = 1;
    this.redraw();
  }

  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }

  redraw() {
    const g = this.g, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    if (this.glass) (this.theme === 'pop' ? popCard : glassRect)(g, 6, 6, W - 12, H - 12, 40, this.accent);
    this.buttons = [];
    this.drawFn?.(g, W, H, this);
    for (const b of this.buttons) (this.theme === 'pop' ? drawPopButton : drawButton)(g, b, b.id === this.hoverId);
    this.tex.needsUpdate = true;
  }

  /** Called from draw(): registers a button in canvas pixels. */
  button(id, x, y, w, h, label, opts = {}) { this.buttons.push({ id, x, y, w, h, label, ...opts }); }

  hitButton(uv) {
    const x = uv.x * this.W, y = (1 - uv.y) * this.H;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }

  setHover(id) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.redraw();
  }
}

export function glassRect(g, x, y, w, h, r) {
  g.save();
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, 'rgba(22,32,66,0.82)');
  grad.addColorStop(1, 'rgba(10,16,38,0.86)');
  roundRect(g, x, y, w, h, r);
  g.fillStyle = grad; g.fill();
  g.lineWidth = 3;
  const sg = g.createLinearGradient(x, y, x + w, y + h);
  sg.addColorStop(0, 'rgba(160,215,255,0.55)'); sg.addColorStop(0.5, 'rgba(160,215,255,0.12)'); sg.addColorStop(1, 'rgba(255,200,170,0.45)');
  g.strokeStyle = sg; g.stroke();
  g.restore();
}

/** Bright, friendly card for the arcade: white with a coloured top band. */
export function popCard(g, x, y, w, h, r, accent = '#5ab8ff') {
  g.save();
  roundRect(g, x + 4, y + 10, w - 8, h - 10, r);
  g.fillStyle = 'rgba(40,60,120,0.18)'; g.fill();
  roundRect(g, x, y, w, h - 8, r);
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#f1f6ff');
  g.fillStyle = grad; g.fill();
  g.save(); g.clip();
  g.fillStyle = accent; g.fillRect(x, y, w, 18);
  g.restore();
  g.lineWidth = 3; g.strokeStyle = 'rgba(90,130,200,0.25)'; g.stroke();
  g.restore();
}

function drawPopButton(g, b, hover) {
  g.save();
  const c = b.color || (b.primary ? '#ff6fa8' : '#5ab8ff');
  const y = b.y + (hover ? -3 : 0);
  roundRect(g, b.x, b.y + 7, b.w, b.h, Math.min(b.h / 2, 40));
  g.fillStyle = 'rgba(30,50,100,0.25)'; g.fill();
  roundRect(g, b.x, y, b.w, b.h, Math.min(b.h / 2, 40));
  if (b.ghost && !b.selected) { g.fillStyle = hover ? '#eef5ff' : '#ffffff'; g.fill(); g.lineWidth = 4; g.strokeStyle = c; g.stroke(); }
  else {
    const grad = g.createLinearGradient(0, y, 0, y + b.h);
    grad.addColorStop(0, shade(c, hover ? 0.28 : 0.12)); grad.addColorStop(1, c);
    g.fillStyle = grad; g.fill();
    if (b.selected || hover) { g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.stroke(); }
  }
  g.fillStyle = b.ghost && !b.selected ? shade(c, -0.35) : '#ffffff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = b.font || `800 ${Math.round(b.h * 0.4)}px ${FONT}`;
  if (b.sub) {
    g.fillText(b.label, b.x + b.w / 2, y + b.h * 0.4);
    g.font = `600 ${Math.round(b.h * 0.2)}px ${FONT}`;
    g.globalAlpha = 0.9;
    g.fillText(b.sub, b.x + b.w / 2, y + b.h * 0.75);
  } else g.fillText(b.label, b.x + b.w / 2, y + b.h / 2 + 2);
  g.restore();
}

/** Lighten (k > 0) or darken (k < 0) a #rrggbb colour. */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawButton(g, b, hover) {
  g.save();
  roundRect(g, b.x, b.y, b.w, b.h, b.h / 2);
  const primary = b.primary;
  const grad = g.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  if (primary) { grad.addColorStop(0, hover ? '#9fe6ff' : '#7cc8f0'); grad.addColorStop(1, hover ? '#6aa8f0' : '#4a7fd0'); }
  else if (b.selected) { grad.addColorStop(0, 'rgba(140,200,255,0.55)'); grad.addColorStop(1, 'rgba(90,140,230,0.55)'); }
  else { grad.addColorStop(0, hover ? 'rgba(120,170,255,0.35)' : 'rgba(255,255,255,0.08)'); grad.addColorStop(1, hover ? 'rgba(90,130,230,0.35)' : 'rgba(255,255,255,0.04)'); }
  g.fillStyle = grad; g.fill();
  g.lineWidth = hover ? 4 : 2;
  g.strokeStyle = hover ? 'rgba(220,245,255,0.95)' : 'rgba(180,220,255,0.45)';
  g.stroke();
  g.fillStyle = primary ? '#08142e' : '#eaf4ff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lamp = b.check !== undefined ? b.h * 0.5 : 0;            // room for the lamp on the left
  const cx = b.x + b.w / 2 + lamp / 2;
  let size = Math.round(b.h * (b.serif ? (b.sub ? 0.4 : 0.48) : 0.42));
  const face = (px) => (b.serif ? `600 ${px}px ${TITLE_FONT}` : `${primary ? 700 : 500} ${px}px ${FONT}`);
  g.font = face(size);
  while (size > 12 && g.measureText(b.label).width > b.w - lamp - b.h * 0.7) g.font = face(--size);
  if (b.sub) {
    g.fillText(b.label, cx, b.y + b.h * 0.4);
    g.font = `400 ${Math.round(b.h * 0.24)}px ${FONT}`;
    g.fillStyle = b.selected ? '#dcecff' : '#9fb4d8';
    g.fillText(b.sub, cx, b.y + b.h * 0.76);
  } else {
    g.fillText(b.label, cx, b.y + b.h / 2 + 2);
  }
  if (b.check !== undefined) {
    // a small lamp on the left: lit when the chapter is part of the night
    const r = b.h * 0.12, x = b.x + b.h * 0.42, y = b.y + b.h / 2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    if (b.check) { g.fillStyle = '#bff0ff'; g.shadowColor = 'rgba(150,230,255,0.9)'; g.shadowBlur = 12; g.fill(); }
    else { g.lineWidth = 2; g.strokeStyle = 'rgba(190,215,255,0.6)'; g.stroke(); }
  }
  g.restore();
}

/** Draw wrapped text (works for Japanese, which has no spaces). Returns the y after the last line. */
export function wrapText(g, text, x, y, maxW, lineH, { align = 'left' } = {}) {
  g.textAlign = align;
  const paras = String(text).split('\n');
  for (const para of paras) {
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, y); y += lineH; line = ch;
      } else line = test;
    }
    g.fillText(line, x, y); y += lineH;
  }
  return y;
}

export class UIManager {
  constructor(app) {
    this.app = app;
    this.panels = new Set();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.enableAll();
  }
  add(panel, parent) { this.panels.add(panel); (parent || this.app.scene).add(panel.mesh); return panel; }
  /** Repaint every panel, e.g. once the web fonts have arrived. */
  redrawAll() { for (const p of this.panels) p.redraw(); }
  remove(panel) { this.panels.delete(panel); panel.mesh.removeFromParent(); panel.tex.dispose(); panel.mesh.geometry.dispose(); panel.mesh.material.dispose(); }

  /** Returns {panel, button, point, distance} for the closest visible panel hit by the ray, or null. */
  hit(ray) {
    this.raycaster.ray.copy(ray);
    // only panels with buttons take the pointer; captions and the HUD let it pass to the game
    const meshes = [...this.panels].filter((p) => p.buttons.length && p.mesh.visible && isVisible(p.mesh)).map((p) => p.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    const panel = h.object.userData.panel;
    return { panel, button: panel.hitButton(h.uv), point: h.point, distance: h.distance };
  }

  /** Lazily keeps a panel in front of the viewer (yaw only), like a calm companion. */
  placeInFront(panel, dist = 1.6, el = 0, az = 0) {
    ({ dist, el } = this.app.uiPlacement(dist, el, panel.w, panel.h, 0.75));
    const head = this.app.head;
    const yaw = this.app.headYaw() + THREE.MathUtils.degToRad(-az);
    const e = THREE.MathUtils.degToRad(el);
    panel.mesh.position.set(head.x - Math.sin(yaw) * Math.cos(e) * dist, head.y + Math.sin(e) * dist, head.z - Math.cos(yaw) * Math.cos(e) * dist);
    panel.mesh.lookAt(head.x, head.y + Math.sin(e) * dist * 0.4, head.z);
  }
}

function isVisible(o) {
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}
