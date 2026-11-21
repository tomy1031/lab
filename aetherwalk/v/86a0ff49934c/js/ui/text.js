// js/ui/text.js — canvas-texture text for VR and the PC overlay (§10.11) (OPUS-B)
import * as THREE from 'three';

export const FONT = '"Zen Kaku Gothic New", "Noto Sans JP", "Hiragino Sans", "IPAGothic", system-ui, sans-serif';
export const C = {
  bg: 'rgba(27,36,64,0.86)', bgSolid: '#1b2440', bgDeep: '#0e1430', ink: '#f4ecd8', dim: 'rgba(244,236,216,0.62)',
  gold: '#ffd76a', cyan: '#7fe9ff', white: '#fffbe8', core: '#c23bff', line: 'rgba(255,215,106,0.32)',
  fireA: '#ffb347', fireB: '#ff6a2b', heart: '#ff8fa8', heartEmpty: 'rgba(244,236,216,0.18)', green: '#8fd98a',
};

export function font(px, weight = 600) { return `${weight} ${px}px ${FONT}`; }

/** a canvas + texture + plane mesh that faces +Z (toward the viewer) */
export function makePanel(ctx, wPx, hPx, wM, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = wPx; canvas.height = hPx;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = opts.mipmaps !== false;
  tex.minFilter = tex.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  const hM = wM * hPx / wPx;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opts.depthTest !== false, fog: false, side: THREE.FrontSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), mat);
  mesh.renderOrder = opts.renderOrder ?? 20;
  mesh.frustumCulled = false;
  return { canvas, g, tex, mat, mesh, w: wPx, h: hPx, wM, hM, dirty: true,
    flush() { tex.needsUpdate = true; this.dirty = false; } };
}

export function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
export function card(g, x, y, w, h, r = 18, fill = C.bg, stroke = C.line) {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = 2; g.strokeStyle = stroke; g.stroke(); }
}

/** text with a soft dark outline so it reads on any sky */
export function text(g, str, x, y, { size = 28, weight = 600, color = C.ink, align = 'left', base = 'alphabetic', shadow = true, maxW = 0 } = {}) {
  g.font = font(size, weight);
  g.textAlign = align;
  g.textBaseline = base;
  if (maxW > 0) {
    let s = String(str);
    while (s.length > 1 && g.measureText(s).width > maxW) s = s.slice(0, -1);
    if (s !== String(str)) s = s.slice(0, -1) + '…';
    str = s;
  }
  if (shadow) {
    g.lineJoin = 'round';
    g.lineWidth = Math.max(3, size * 0.16);
    g.strokeStyle = 'rgba(14,20,48,0.85)';
    g.strokeText(str, x, y);
  }
  g.fillStyle = color;
  g.fillText(str, x, y);
  return g.measureText(str).width;
}

/** wrap into lines (CJK-friendly: breaks anywhere) */
export function wrap(g, str, maxW, size, weight = 600) {
  g.font = font(size, weight);
  const out = [];
  let line = '';
  for (const ch of String(str)) {
    const t = line + ch;
    if (g.measureText(t).width > maxW && line) { out.push(line); line = ch.trim() ? ch : ''; }
    else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** a bar gauge */
export function gauge(g, x, y, w, h, k, color, back = 'rgba(244,236,216,0.14)', marks = null) {
  roundRect(g, x, y, w, h, h / 2);
  g.fillStyle = back; g.fill();
  const kk = Math.max(0, Math.min(1, k));
  if (kk > 0) {
    roundRect(g, x, y, Math.max(h, w * kk), h, h / 2);
    g.fillStyle = color; g.fill();
  }
  if (marks) {
    g.fillStyle = 'rgba(14,20,48,0.7)';
    for (const m of marks) g.fillRect(x + w * m - 1.5, y, 3, h);
  }
}

/** heart (1 heart = 4 HP); fill 0..1 in quarters */
export function heart(g, cx, cy, s, fill) {
  const path = () => {
    g.beginPath();
    g.moveTo(cx, cy + s * 0.38);
    g.bezierCurveTo(cx - s * 0.62, cy - s * 0.05, cx - s * 0.32, cy - s * 0.55, cx, cy - s * 0.22);
    g.bezierCurveTo(cx + s * 0.32, cy - s * 0.55, cx + s * 0.62, cy - s * 0.05, cx, cy + s * 0.38);
    g.closePath();
  };
  path();
  g.fillStyle = C.heartEmpty; g.fill();
  if (fill > 0) {
    g.save();
    path(); g.clip();
    g.fillStyle = C.heart;
    // fill quarters bottom-up so a chipped heart reads clearly
    const top = cy - s * 0.55, bot = cy + s * 0.4;
    const yy = bot - (bot - top) * Math.min(1, fill);
    g.fillRect(cx - s, yy, s * 2, bot - yy + 2);
    g.restore();
  }
  path();
  g.lineWidth = Math.max(2, s * 0.07); g.strokeStyle = 'rgba(14,20,48,0.75)'; g.stroke();
}
export function hearts(g, x, y, s, hp, maxHp, perRow = 8) {
  const n = Math.ceil(maxHp / 4);
  for (let i = 0; i < n; i++) {
    const f = Math.max(0, Math.min(4, hp - i * 4)) / 4;
    const col = i % perRow, row = Math.floor(i / perRow);
    heart(g, x + col * s * 1.08 + s / 2, y + row * s * 1.0 + s / 2, s, f);
  }
}
