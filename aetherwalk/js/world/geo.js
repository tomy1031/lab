// js/world/geo.js — FABLE
// 低ポリゴンの形を組み立てる小道具。部品 → 頂点色つきの非インデックス・ジオメトリ → 1 つにまとめる。
// 属性：position, normal, color（リニア）, uv（x: 風のゆれ y: 夜の発光）
import * as THREE from 'three';

const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3();
export const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
const hash3 = (x, y, z) => {
  let h = Math.imul(Math.round(x * 53.1), 0x27d4eb2d) ^ Math.imul(Math.round(y * 53.1), 0x165667b1) ^ Math.imul(Math.round(z * 53.1), 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13;
  return ((h >>> 0) / 4294967296);
};

/**
 * part(geometry, opts)
 *  pos [x,y,z] / rot [x,y,z] / scale number|[x,y,z] / matrix
 *  color: hex | [r,g,b] | (p, n) => [r,g,b]    bottom/top: 高さでグラデーション（color の代わり）
 *  jitter: 頂点をゆらす量（共有頂点は一緒に動く）
 *  smooth: true = なめらかな法線のまま / Vector3 = その点から外向きの法線（葉のかたまり用）
 *  ao: [y0, y1, min] 高さ y0 で min 倍、y1 で 1 倍   sway / glow: 数値 | (p) => 数値
 */
export function part(geometry, o = {}) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (o.matrix) g.applyMatrix4(o.matrix);
  else {
    const sc = o.scale === undefined ? [1, 1, 1] : (typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale);
    const r = o.rot || [0, 0, 0], p = o.pos || [0, 0, 0];
    _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(sc[0], sc[1], sc[2]));
    g.applyMatrix4(_m);
  }
  const pa = g.getAttribute('position'), n = pa.count;
  if (o.jitter) {
    for (let i = 0; i < n; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const j = o.jitter;
      pa.setXYZ(i, x + (hash3(x, y, z) - 0.5) * 2 * j, y + (hash3(y, z, x) - 0.5) * 2 * j * (o.jitterY ?? 1), z + (hash3(z, x, y) - 0.5) * 2 * j);
    }
  }
  if (o.smooth && o.smooth.isVector3) {
    const na = g.getAttribute('normal');
    for (let i = 0; i < n; i++) { _n.set(pa.getX(i), pa.getY(i), pa.getZ(i)).sub(o.smooth).normalize(); na.setXYZ(i, _n.x, _n.y, _n.z); }
  } else if (!o.smooth) g.computeVertexNormals();
  const na = g.getAttribute('normal');
  const col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const base = Array.isArray(o.color) ? o.color : (typeof o.color === 'number' ? lin(o.color) : null);
  const bot = o.bottom !== undefined ? (Array.isArray(o.bottom) ? o.bottom : lin(o.bottom)) : null;
  const top = o.top !== undefined ? (Array.isArray(o.top) ? o.top : lin(o.top)) : null;
  let y0 = 1e9, y1 = -1e9;
  if (bot) for (let i = 0; i < n; i++) { const y = pa.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  for (let i = 0; i < n; i++) {
    _v.set(pa.getX(i), pa.getY(i), pa.getZ(i)); _n.set(na.getX(i), na.getY(i), na.getZ(i));
    let c;
    if (typeof o.color === 'function') c = o.color(_v, _n);
    else if (bot) { let t = (_v.y - y0) / Math.max(1e-5, y1 - y0); t = t * 0.75 + 0.25 * Math.max(0, _n.y) * (o.topLight ?? 1); t = Math.min(1, Math.max(0, t)); c = [bot[0] + (top[0] - bot[0]) * t, bot[1] + (top[1] - bot[1]) * t, bot[2] + (top[2] - bot[2]) * t]; }
    else c = base || [1, 1, 1];
    let k = 1;
    if (o.ao) { const t = Math.min(1, Math.max(0, (_v.y - o.ao[0]) / (o.ao[1] - o.ao[0]))); k = o.ao[2] + (1 - o.ao[2]) * t; }
    if (o.vary) k *= 1 - o.vary * hash3(Math.floor(i / 3) * 0.37, 1.7, 2.9);
    col[i * 3] = c[0] * k; col[i * 3 + 1] = c[1] * k; col[i * 3 + 2] = c[2] * k;
    uv[i * 2] = typeof o.sway === 'function' ? o.sway(_v) : (o.sway || 0);
    uv[i * 2 + 1] = typeof o.glow === 'function' ? o.glow(_v) : (o.glow || 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pa.array, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(na.array, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of parts) {
    const c = p.getAttribute('position').count;
    pos.set(p.getAttribute('position').array.subarray(0, c * 3), o * 3);
    nor.set(p.getAttribute('normal').array.subarray(0, c * 3), o * 3);
    col.set(p.getAttribute('color').array.subarray(0, c * 3), o * 3);
    uv.set(p.getAttribute('uv').array.subarray(0, c * 2), o * 2);
    o += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

// ふた（中心に頂点を置かない多角形）。プレイヤーが中心の真上に立って水平を見ると、中心頂点の w が 0 になり、
// ソフトウェア GPU（SwiftShader）では扇形の三角形が乱れて描かれるため。
function capPositions(r, seg, y, up, out) {
  if (r <= 1e-6) return;
  const pt = (i) => { const a = (i / seg) * Math.PI * 2; return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  for (let i = 1; i < seg - 1; i++) {
    const a = pt(0), b = pt(i), c = pt(i + 1);
    if (up) out.push(...a, ...b, ...c); else out.push(...a, ...c, ...b);
  }
}
function cylGeo(rt, rb, h, seg = 6, hs = 1, open = false) {
  const side = new THREE.CylinderGeometry(rt, rb, h, seg, hs, true).toNonIndexed();
  const pos = Array.from(side.getAttribute('position').array);
  if (!open) { capPositions(rt, seg, h / 2, true, pos); capPositions(rb, seg, -h / 2, false, pos); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}
function discGeo(r, seg = 12) {
  const pos = [];
  capPositions(r, seg, 0, true, pos);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

// よく使う形
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: cylGeo,
  cone: (r, h, seg = 6, open = false) => cylGeo(0, r, h, seg, 1, open),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  octa: (r) => new THREE.OctahedronGeometry(r, 0),
  dodeca: (r) => new THREE.DodecahedronGeometry(r, 0),
  sphere: (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h),
  torus: (r, t, rs = 5, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  disc: discGeo,
  ring: (r0, r1, seg = 16) => new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2),
  plane: (w, h) => new THREE.PlaneGeometry(w, h),
};
export const triCount = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

// 曲線に沿った管（断面はだ円）。path: Vector3[]、ra / rb: 各点の半径（面内の法線方向／わき方向）、ref: わき方向を決める基準ベクトル
export function tubeGeo(path, ra, rb, sides = 7, ref = new THREE.Vector3(0, 1, 0), caps = true) {
  const n = path.length, pos = [], idx = [];
  const T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    T.subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize();
    B.crossVectors(T, ref);
    if (B.lengthSq() < 1e-4) B.set(1, 0, 0);
    B.normalize(); N.crossVectors(B, T).normalize();
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + i * 0.35, c = Math.cos(a) * ra[i], d = Math.sin(a) * rb[i];
      pos.push(path[i].x + N.x * c + B.x * d, path[i].y + N.y * c + B.y * d, path[i].z + N.z * c + B.z * d);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
    const a = i * sides + s, b = i * sides + (s + 1) % sides, c = a + sides, d = b + sides;
    idx.push(a, b, c, b, d, c);
  }
  if (caps) {
    for (const e of [0, n - 1]) {
      const ci = pos.length / 3;
      pos.push(path[e].x, path[e].y, path[e].z);
      for (let s = 0; s < sides; s++) { const a = e * sides + s, b = e * sides + (s + 1) % sides; if (e === 0) idx.push(ci, b, a); else idx.push(ci, a, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
