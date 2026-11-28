// js/geo.js — small geometry helpers and the low-poly models (trees, rocks, ice, the board, canvas textures).
import * as THREE from 'three';

// merge geometries (each with an optional flat colour) into one non-indexed BufferGeometry with vertex colours
export function merge(parts) {
  const geos = parts.map(([g, color, m]) => {
    let x = g.index ? g.toNonIndexed() : g.clone();
    if (m) x.applyMatrix4(m);
    if (!x.attributes.normal) x.computeVertexNormals();
    if (color !== undefined && color !== null) {
      const c = new THREE.Color(color);
      const n = x.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      x.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return x;
  });
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
export { M };

// a snowy fir: trunk, three tiers, snow on each tier
export function treeGeometry(tint = '#2f6a4a') {
  const green = new THREE.Color(tint), dark = green.clone().multiplyScalar(0.7);
  const parts = [[new THREE.CylinderGeometry(0.1, 0.16, 1.3, 5), '#5a3c28', M(0, 0.65, 0)]];
  for (let i = 0; i < 3; i++) {
    const r = 1.5 - i * 0.42, h = 1.9 - i * 0.25, y = 1.05 + i * 1.05 + h / 2;
    parts.push([new THREE.ConeGeometry(r, h, 7), i % 2 ? dark : green, M(0, y, 0, 0, i * 0.4)]);
    parts.push([new THREE.ConeGeometry(r * 0.62, h * 0.42, 7), '#f2f6ff', M(0, y + h * 0.31, 0, 0, i * 0.4)]);
  }
  return merge(parts);
}

export function rockGeometry(seed = 1) {
  let g = new THREE.IcosahedronGeometry(1, 1);
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position;
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const jit = new Map();
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    if (!jit.has(k)) jit.set(k, 0.8 + r() * 0.4);
    const f = jit.get(k);
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.72 + 0.25, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, col = new Float32Array(p.count * 3);
  const rock = new THREE.Color('#6d717d'), snow = new THREE.Color('#eef4ff');
  for (let i = 0; i < p.count; i++) {
    const c = n.getY(i) > 0.55 ? snow : rock;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function iceGeometry() {
  return merge([
    [new THREE.CylinderGeometry(0.45, 1, 1, 6), '#bdefff', M(0, 0.5, 0)],
    [new THREE.ConeGeometry(0.45, 0.5, 6), '#e6fbff', M(0, 1.25, 0)],
  ]);
}

export function logGeometry(len) {
  return merge([
    [new THREE.CylinderGeometry(0.2, 0.22, len, 8), '#6b4a32', M(0, 0.2, 0, 0, 0, Math.PI / 2)],
    [new THREE.BoxGeometry(len * 0.98, 0.06, 0.26), '#f4f8ff', M(0, 0.4, 0)],
  ]);
}

// the snowboard: a twin tip with turned-up ends, bindings angled for a duck stance (+15° / −15°)
export function boardGeometry(top = '#ff6a3d', base = '#1d2a4a') {
  const L = 1.56, W = 0.29, r = W / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -L / 2 + r);
  shape.lineTo(-W / 2, L / 2 - r);
  shape.absarc(0, L / 2 - r, r, Math.PI, 0, true);
  shape.lineTo(W / 2, -L / 2 + r);
  shape.absarc(0, -L / 2 + r, r, 0, Math.PI, true);
  const deck = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: false, curveSegments: 10 });
  // lay it flat: shape's y → board's -z (nose toward -z), extrusion → up
  deck.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  const p = deck.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), a = Math.abs(z) - 0.56;
    if (a > 0) p.setY(i, p.getY(i) + a * a * 1.4);
  }
  deck.computeVertexNormals();
  // colour the top by height: the top face gets the graphic colour, edges dark
  const ne = deck.index ? deck.toNonIndexed() : deck;
  const n = ne.attributes.normal, col = new Float32Array(ne.attributes.position.count * 3);
  const ct = new THREE.Color(top), cb = new THREE.Color(base), stripe = new THREE.Color('#ffffff');
  const pp = ne.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const up = n.getY(i) > 0.5;
    const z = pp.getZ(i);
    let c = up ? (Math.abs(z) < 0.08 || Math.abs(Math.abs(z) - 0.45) < 0.035 ? stripe : ct) : cb;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  ne.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const parts = [[ne, null]];
  for (const [z, a] of [[-0.27, 0.26], [0.27, -0.26]]) {
    parts.push([new THREE.BoxGeometry(0.24, 0.03, 0.13), '#20242e', M(0, 0.036, z, 0, a)]);
    parts.push([new THREE.BoxGeometry(0.03, 0.12, 0.14), '#2b303c', M(-0.12, 0.09, z, 0, a)]);
    parts.push([new THREE.BoxGeometry(0.2, 0.02, 0.05), '#ffd166', M(0.01, 0.08, z, 0, a)]);
  }
  return merge(parts);
}

// a soft round dot (glow, snowflake, shadow)
export function dotTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// the snow's surface grain: speckles and faint grooming lines, so speed shows in the optic flow
export function snowTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, S, S);
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(190,205,235,${0.06 + r() * 0.05})`; x.fillRect(0, i * (S / 26), S, 2); }
  for (let i = 0; i < 2200; i++) {
    const v = 222 + Math.floor(r() * 33);
    x.fillStyle = `rgba(${v - 22},${v - 10},${v},${0.25 + r() * 0.35})`;
    const w = 1 + r() * 2.2;
    x.fillRect(r() * S, r() * S, w, w);
  }
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.7 + r() * 0.3})`; x.fillRect(r() * S, r() * S, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// text on a canvas → a texture (signs, banners, HUD)
export function textCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas: c, ctx, tex };
}
export const FONT = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif';

// wrap Japanese / mixed text to a width
export function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    const toks = para.match(/[A-Za-z0-9.,:;%/+\-−×=°()'’!?]+|\s|./gu) || [];
    for (const t of toks) {
      if (ctx.measureText(line + t).width > maxW && line) {
        if (/^[、。）」！？・ー…]/.test(t)) { lines.push(line + t); line = ''; continue; }
        lines.push(line); line = t.trimStart();
      } else line += t;
    }
    lines.push(line);
  }
  return lines;
}
