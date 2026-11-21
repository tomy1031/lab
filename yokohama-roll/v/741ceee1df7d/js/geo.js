// geo.js — tiny low-poly modelling kit shared by every model module.
//
// Every primitive returns a NON-INDEXED BufferGeometry carrying four attributes:
//   position, normal, color (vertex colour, linear-ish 0..1), glow (0..1, lights up at night)
// Primitives are centred on the origin exactly like the THREE equivalents, then moved by `opts`.
//
// opts (all optional):
//   x, y, z        translation (metres)
//   rx, ry, rz     rotation in radians (Euler order XYZ, applied before translation)
//   sx, sy, sz     scale (applied before rotation)
//   s              uniform scale shortcut
//   glow           0..1 — how much this part shines when the town lights up at night (windows, lanterns, neon)
//   flat           true → recompute faceted normals (default true for low-poly look on curved parts)
//
// Build a model by listing parts and merging them:
//   const g = merge(
//     box(1, 2, 1, 0xff0000, { y: 1 }),          // sits on the ground: y = h / 2
//     cyl(0.3, 0.3, 1, 8, 0xffffff, { y: 2.5 }),
//   );
// Convention for finished models: base on y = 0, centred on x/z, front facing +Z.

import * as THREE from 'three';

const _c = new THREE.Color();

function finish(geom, color, opts = {}) {
  let g = geom.index ? geom.toNonIndexed() : geom;
  if (g !== geom) geom.dispose();
  // drop uv attributes etc. so merge() stays uniform
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  }
  const m = new THREE.Matrix4();
  const s = opts.s ?? 1;
  const scale = new THREE.Vector3((opts.sx ?? 1) * s, (opts.sy ?? 1) * s, (opts.sz ?? 1) * s);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx || 0, opts.ry || 0, opts.rz || 0));
  m.compose(new THREE.Vector3(opts.x || 0, opts.y || 0, opts.z || 0), q, scale);
  g.applyMatrix4(m);
  if (opts.flat !== false) g.computeVertexNormals(); // non-indexed → faceted normals
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color ?? 0xffffff);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const gl = new Float32Array(n).fill(opts.glow || 0);
  g.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  return g;
}

// ---------- primitives ----------
export const box = (w, h, d, color, opts) => finish(new THREE.BoxGeometry(w, h, d), color, opts);
export const cyl = (rTop, rBot, h, seg, color, opts) =>
  finish(new THREE.CylinderGeometry(rTop, rBot, h, seg || 8, 1, false), color, opts);
export const cone = (r, h, seg, color, opts) => finish(new THREE.ConeGeometry(r, h, seg || 8), color, opts);
export const sphere = (r, wSeg, hSeg, color, opts) =>
  finish(new THREE.SphereGeometry(r, wSeg || 10, hSeg || 7), color, opts);
export const torus = (R, tube, radialSeg, tubularSeg, color, opts) =>
  finish(new THREE.TorusGeometry(R, tube, radialSeg || 6, tubularSeg || 16), color, opts);
export const ico = (r, detail, color, opts) => finish(new THREE.IcosahedronGeometry(r, detail || 0), color, opts);
export const dodeca = (r, color, opts) => finish(new THREE.DodecahedronGeometry(r, 0), color, opts);
export const capsule = (r, len, color, opts) => finish(new THREE.CapsuleGeometry(r, len, 3, 8), color, opts);
// flat quad in the XY plane facing +Z (use rx/ry to orient). Double-sided not supported → use thin box if seen from both sides.
export const plane = (w, h, color, opts) => finish(new THREE.PlaneGeometry(w, h), color, opts);
// lathe: pts = [[radius, y], ...] revolved around Y
export const lathe = (pts, seg, color, opts) =>
  finish(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg || 12), color, opts);
// extrude a 2D outline (in XY, metres) along +Z by `depth`; result is centred on z (so it spans -depth/2..depth/2)
export const extrude = (pts, depth, color, opts = {}) => {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return finish(g, color, opts);
};
// a straight beam between two points a=[x,y,z] b=[x,y,z] with square cross-section t
export const beam = (a, b, t, color, opts = {}) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  const mid = A.add(B).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return finish(g, color, opts);
};

// ---------- composition ----------
// group(parts, opts): transform an already-built list of parts together (e.g. rotate a whole wing).
export function group(parts, opts = {}) {
  const list = flatten(parts);
  const m = new THREE.Matrix4();
  const s = opts.s ?? 1;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx || 0, opts.ry || 0, opts.rz || 0));
  m.compose(new THREE.Vector3(opts.x || 0, opts.y || 0, opts.z || 0), q,
    new THREE.Vector3((opts.sx ?? 1) * s, (opts.sy ?? 1) * s, (opts.sz ?? 1) * s));
  return list.map((g) => {
    const c = g.clone();
    c.applyMatrix4(m);
    return c;
  });
}

// repeat(n, fn): fn(i) returns a part or list of parts; results are concatenated.
export function repeat(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(i));
  return flatten(out);
}

function flatten(a, out = []) {
  if (!a) return out;
  if (Array.isArray(a)) { for (const x of a) flatten(x, out); } else out.push(a);
  return out;
}

// merge(...parts) → one BufferGeometry (position, normal, color, glow) with bounding box/sphere computed.
export function merge(...parts) {
  const list = flatten(parts);
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), glo = new Float32Array(n);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    glo.set(g.attributes.glow.array, o);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('glow', new THREE.BufferAttribute(glo, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// handy colour helpers
export const shade = (hex, k) => { _c.set(hex); return _c.clone().multiplyScalar(k).getHex(); };
export const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

// Deterministic PRNG so models with random detail look the same every load.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
