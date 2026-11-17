// engine/util.js — small math helpers, a seeded random generator and vertex-colour geometry merging
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;
export function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
export const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
export const mod = (i, n) => ((i % n) + n) % n;

// mulberry32: tiny deterministic generator, so a course looks the same every time it is built
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
    chance: (p) => next() < p,
  };
}

// ---- vertex-coloured parts merged into one geometry (one draw call per model) ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

export function paint(geo, color) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// part(geometry, colour, position, rotation(euler xyz), scale) → a transformed, painted copy
export function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const g = geo.clone();
  const sc = Array.isArray(scale) ? scale : [scale, scale, scale];
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(sc[0], sc[1], sc[2]));
  g.applyMatrix4(_m);
  return paint(g, color);
}

// merge painted parts; keeps position, normal, color (and uv only when every part has one)
export function merge(parts) {
  const indexed = parts.every((g) => g.index);
  const keepUv = parts.every((g) => g.attributes.uv);
  const list = parts.map((g) => {
    let x = indexed ? g : (g.index ? g.toNonIndexed() : g);
    for (const name of Object.keys(x.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color' && !(keepUv && name === 'uv')) x.deleteAttribute(name);
    }
    if (!x.attributes.normal) x.computeVertexNormals();
    return x;
  });
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return out;
}

// shared toy-like materials (vertex coloured)
const matCache = new Map();
export function toyMaterial(opts = {}) {
  const key = JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, ...opts });
    m.userData.shared = true; // kept across courses: disposeTree skips it
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// a canvas texture painted by fn(ctx, size)
export function canvasTexture(size, fn, { repeat = true, srgb = true, w = size, h = size } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  fn(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// InstancedMesh from an array of {pos:[x,y,z], rot:[x,y,z], scale:n|[x,y,z], color?}
export function instanced(geo, mat, items, { cast = false, receive = false } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  const col = new THREE.Color();
  items.forEach((it, i) => {
    const sc = Array.isArray(it.scale) ? it.scale : [it.scale ?? 1, it.scale ?? 1, it.scale ?? 1];
    _m.compose(_p.set(...it.pos), _q.setFromEuler(_e.set(...(it.rot || [0, 0, 0]))), _s.set(...sc));
    mesh.setMatrixAt(i, _m);
    if (it.color !== undefined) mesh.setColorAt(i, col.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast; mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  return mesh;
}

export function hsl(h, s, l) { return new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l); }

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.userData && m.userData.shared) continue;
        for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      }
    }
  });
}
