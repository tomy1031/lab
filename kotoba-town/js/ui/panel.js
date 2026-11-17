// Canvas-texture panels for the in-world UI (works with the mouse on PC and controller rays in VR).
// Look: soft, rounded, cream & leaf-green — friendly like a cosy village life game.
import * as THREE from 'three';

export const FONT = '"M PLUS Rounded 1c", "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';
export const THEME = {
  cream: '#fffaf0', paper: '#fdf6e3', ink: '#5b4636', soft: '#8c7a68', line: '#e9dcc3',
  leaf: '#7cc5a0', leafDark: '#3f9a73', sky: '#8fd0ef', sun: '#ffd36b', pink: '#f6a6a6', red: '#e86f5c',
  blue: '#6fa8dc', night: '#3b4a6b', shadow: 'rgba(91,70,54,0.18)',
};

export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function font(px, weight = 700) { return `${weight} ${Math.round(px)}px ${FONT}`; }

/** Wrap text to a width. Japanese breaks anywhere (but keeps 、。」 off line starts); English by words. */
export function wrap(g, text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    // Latin words stay whole; Japanese characters can break anywhere (but not before 、。」 etc.)
    const tokens = para.match(/[A-Za-z0-9\u00c0-\u024f'’"“”,.!?:;()\[\]\-–—/&%+#@*·…]+|\s+|./gsu) || [];
    let line = '';
    for (const t of tokens) {
      const test = line + t;
      if (g.measureText(test).width > maxW && line.trim()) {
        if (/^[、。」』）！？ー]$/.test(t)) { line = test; continue; }
        out.push(line.trimEnd());
        line = /^\s+$/.test(t) ? '' : t;
      } else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** A flat panel in the world with an offscreen canvas, buttons and hover. size in metres (w); h from aspect. */
export class Panel {
  constructor(app, wPx, hPx, wM, { name = 'panel', depthTest = false, interactive = true } = {}) {
    this.app = app;
    this.canvas = document.createElement('canvas');
    this.canvas.width = wPx; this.canvas.height = hPx;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    const hM = wM * hPx / wPx;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthTest, depthWrite: false }));
    this.mesh.name = name;
    this.mesh.renderOrder = depthTest ? 10 : 20;
    this.wM = wM; this.hM = hM;
    this.buttons = [];
    this.hoverId = null;
    this.drawFn = null;
    if (interactive) {
      this.mesh.userData.onPointer = (hit) => this._pointer(hit);
      this.mesh.userData.onClick = (hit) => this._click(hit);
      app.addInteractive(this.mesh);
    }
  }

  /** Change the canvas height (the panel grows/shrinks in the world, width stays). Call before draw(). */
  setHeight(hPx) {
    hPx = Math.round(hPx);
    if (hPx === this.canvas.height) return;
    this.canvas.height = hPx;
    const old = this.tex;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = old.anisotropy;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mesh.material.map = this.tex;
    this.mesh.material.needsUpdate = true;
    old.dispose();
    this.hM = this.wM * hPx / this.canvas.width;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(this.wM, this.hM);
  }

  get visible() { return this.mesh.visible; }
  set visible(v) { this.mesh.visible = v; }

  /** Redraw: fn(g, w, h, panel) — call panel.button(...) inside to register clickable areas. */
  draw(fn = this.drawFn) {
    this.drawFn = fn;
    const { g, canvas } = this;
    g.clearRect(0, 0, canvas.width, canvas.height);
    this.buttons = [];
    fn?.(g, canvas.width, canvas.height, this);
    this.tex.needsUpdate = true;
  }

  /** Register + draw a pill button. opts: color, fg, size, icon, disabled. */
  button(id, x, y, w, h, label, onClick, opts = {}) {
    const g = this.g;
    const hover = this.hoverId === id && !opts.disabled;
    const c = opts.color || THEME.leaf;
    g.save();
    g.fillStyle = THEME.shadow;
    rr(g, x, y + 6, w, h, h / 2); g.fill();
    g.fillStyle = opts.disabled ? '#d9d2c3' : hover ? shade(c, 1.08) : c;
    rr(g, x, y + (hover ? -2 : 0), w, h, h / 2); g.fill();
    if (opts.outline) { g.strokeStyle = opts.outline; g.lineWidth = 4; rr(g, x + 2, y + 2 + (hover ? -2 : 0), w - 4, h - 4, h / 2); g.stroke(); }
    g.fillStyle = opts.fg || '#ffffff';
    g.font = font(opts.size || h * 0.42, 800);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (opts.lines) {
      // several lines (long answers are shown in full)
      const lh = opts.lineHeight || (opts.size || h * 0.42) * 1.3;
      const top = y + h / 2 - ((opts.lines.length - 1) * lh) / 2 + (hover ? -2 : 0) + 1;
      opts.lines.forEach((l, i) => g.fillText(l, x + w / 2, top + i * lh));
    } else {
      let label2 = label;
      while (g.measureText(label2).width > w - h * 0.5 && label2.length > 2) label2 = `${label2.slice(0, -2)}…`;
      g.fillText(label2, x + w / 2, y + h / 2 + (hover ? -2 : 0) + 1);
    }
    g.restore();
    if (!opts.disabled) this.buttons.push({ id, x, y, w, h, onClick });
  }

  _uvToPx(uv) { return { x: uv.x * this.canvas.width, y: (1 - uv.y) * this.canvas.height }; }

  _find(hit) {
    if (!hit?.uv) return null;
    const p = this._uvToPx(hit.uv);
    return this.buttons.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) || null;
  }

  _pointer(hit) {
    const b = this._find(hit);
    const id = b ? b.id : null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      if (id) this.onHoverSound?.();
      this.draw();
    }
  }

  _click(hit) {
    const b = this._find(hit);
    if (b) { this.onClickSound?.(); b.onClick?.(); }
  }

  /** Place the panel at a world position, facing a point (usually the learner's head). */
  placeFacing(pos, lookAt) {
    this.mesh.position.copy(pos);
    const t = lookAt.clone(); t.y = pos.y + (lookAt.y - pos.y) * 0.35;
    this.mesh.lookAt(t);
  }

  dispose() {
    this.app.removeInteractive(this.mesh);
    this.mesh.parent?.remove(this.mesh);
    this.tex.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; }

/** Card background: soft cream rounded rect with a subtle dotted border, like a paper note. */
export function card(g, x, y, w, h, { fill = THEME.cream, border = THEME.line, r = 36, shadow = true } = {}) {
  if (shadow) { g.fillStyle = THEME.shadow; rr(g, x + 4, y + 10, w, h, r); g.fill(); }
  g.fillStyle = fill; rr(g, x, y, w, h, r); g.fill();
  g.save();
  g.setLineDash([2, 12]); g.lineCap = 'round'; g.lineWidth = 5; g.strokeStyle = border;
  rr(g, x + 14, y + 14, w - 28, h - 28, Math.max(8, r - 12)); g.stroke();
  g.restore();
}

/** Coloured name tag (pill), slightly tilted. */
export function nameTag(g, x, y, text, color = THEME.sun, fg = THEME.ink, size = 34) {
  g.save();
  g.font = font(size, 800);
  const w = g.measureText(text).width + size * 1.4; const h = size * 1.55;
  g.translate(x, y); g.rotate(-0.04);
  g.fillStyle = THEME.shadow; rr(g, 2, 5, w, h, h / 2); g.fill();
  g.fillStyle = color; rr(g, 0, 0, w, h, h / 2); g.fill();
  g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(text, size * 0.7, h / 2 + 1);
  g.restore();
  return w;
}

export function stars(g, x, y, n, of = 3, size = 40) {
  for (let i = 0; i < of; i++) {
    star(g, x + i * size * 1.15 + size / 2, y + size / 2, size / 2, i < n ? THEME.sun : '#e6dccb');
  }
}

export function star(g, cx, cy, r, color) {
  g.save();
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 ? r * 0.46 : r;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
  g.fillStyle = color; g.fill();
  g.lineJoin = 'round'; g.lineWidth = r * 0.12; g.strokeStyle = shade(color === THEME.sun ? '#e0a62c' : '#cfc3ad', 1); g.stroke();
  g.restore();
}

/** Draw wrapped text, returns the y after the last line. */
/**
 * The largest font size (from `sizes`, biggest first) at which `str` wraps into maxW and fits in maxH.
 * Returns { px, lines, height }. Used so long sentences are shown in full instead of being cut.
 */
export function fitWrap(g, str, maxW, maxH, sizes = [40, 34, 30, 26, 22], { weight = 700, lh = 1.45 } = {}) {
  let best = null;
  for (const px of sizes) {
    g.font = font(px, weight);
    const lines = wrap(g, str, maxW);
    best = { px, lines, height: lines.length * px * lh };
    if (best.height <= maxH) return best;
  }
  return best;
}

export function text(g, str, x, y, maxW, px, { color = THEME.ink, weight = 700, lh = 1.45, align = 'left', maxLines = 99 } = {}) {
  g.font = font(px, weight);
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'top';
  const lines = wrap(g, str, maxW).slice(0, maxLines);
  lines.forEach((l, i) => g.fillText(l, align === 'center' ? x + maxW / 2 : x, y + i * px * lh));
  return y + lines.length * px * lh;
}
