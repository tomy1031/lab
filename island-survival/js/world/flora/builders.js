// world/flora/builders.js — every plant/rock/item mesh. Each builder: (seed, opts) -> BufferGeometry (vertex-coloured).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../../core/rng.js';
import { Build, HSL, V, lowPolyRock } from './geo.js';

const C = (hex) => new THREE.Color(hex);
const TAU = Math.PI * 2;
const bark = (l = 0.28, h = 0.08) => (t) => HSL(h, 0.22, l + 0.07 * t);

export function mergeGeos(list) {
  const clean = list.map((g) => { const x = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'color'].includes(k)) x.deleteAttribute(k); return x; });
  return mergeGeometries(clean, false);
}

// ------------------------------------------------------------------ trees
/** tall emergent tree: buttress roots, long clean trunk, wide flat umbrella crown */
export function treeEmergent(seed, hue = 0.3) {
  const b = new Build(seed), r = b.rng;
  const H = r.float(13, 17.5), lx = r.float(-0.9, 0.9), lz = r.float(-0.9, 0.9);
  const pts = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(V(lx * t * t, H * t, lz * t * t + Math.sin(t * 4) * 0.12)); }
  b.tube(pts, (t) => 0.26 + 0.4 * Math.pow(1 - t, 3) + 0.04 * (1 - t), 6, (t, i) => HSL(0.09 + 0.01 * (i % 2), 0.3, 0.22 + 0.07 * t + 0.02 * (i % 2)));
  const nF = r.int(4, 6);
  for (let k = 0; k < nF; k++) {
    const a = (k / nF) * TAU + r.float(-0.3, 0.3), R = r.float(1.4, 2.2), h = r.float(3, 5.2);
    const d = V(Math.cos(a), 0, Math.sin(a)), c0 = HSL(0.07, 0.2, 0.22), c1 = HSL(0.08, 0.2, 0.32);
    const pt = (rad, y) => V(d.x * rad, y, d.z * rad);
    b.tri(pt(0.25, 0), pt(R, -0.1), pt(0.7, h * 0.22), c0, c0, c1);
    b.tri(pt(0.25, 0), pt(0.7, h * 0.22), pt(0.3, h), c0, c1, c1);
  }
  const top = pts[5];
  const R = r.float(5.5, 7.5);
  const nb = r.int(7, 9);
  for (let i = 0; i < nb; i++) {
    const a = r.float(0, TAU), d = i === 0 ? 0 : Math.pow(r.next(), 0.7) * R;
    const dome = (1 - d / R) * 1.4;
    const rx = r.float(2.8, 4.0) * (1 - 0.2 * d / R);
    const col = HSL(hue + r.float(-0.025, 0.025), r.float(0.5, 0.65), r.float(0.15, 0.25));
    b.blob(top.x + Math.cos(a) * d, top.y + dome + r.float(-0.4, 0.5), top.z + Math.sin(a) * d, rx, r.float(1.3, 1.9), rx * r.float(0.8, 1.1), i < 1 ? 1 : 0, col, { amp: 0.25, lo: 0.5, hi: 1.2 });
  }
  for (let k = 0; k < 1; k++) {
    const a = r.float(0, TAU), d = r.float(2.5, 3.8), y = H * r.float(0.62, 0.75);
    const e = V(Math.cos(a) * d, y + 0.9, Math.sin(a) * d);
    b.tube([V(pts[3].x * 0.8, y, pts[3].z * 0.8), e], (t) => 0.17 - 0.08 * t, 5, bark(0.25));
    b.blob(e.x, e.y + 0.4, e.z, 1.7, 0.9, 1.7, 0, HSL(hue + 0.02, 0.55, 0.2), { lo: 0.55 });
  }
  const g = b.geo(); g.userData = { height: H, crown: R };
  return g;
}

/** mid-height clumpy tree with leaning trunk(s). o: hue, sat, lite, flower, trunks, small */
export function treeMid(seed, o = {}) {
  const { hue = 0.28, sat = 0.55, lite = 0.24, flower = null, trunks = 1, small = 1 } = o;
  const b = new Build(seed), r = b.rng;
  const H = r.float(5.2, 8.2) * small, L = r.float(0.8, 2.6) * small * (r.chance(0.5) ? 1 : -1);
  let top = null;
  const crowns = [];
  for (let tk = 0; tk < trunks; tk++) {
    const Ht = tk === 0 ? H : H * r.float(0.65, 0.85), Lt = tk === 0 ? L : -L * r.float(0.6, 1.4) + r.float(-0.5, 0.5);
    const pts = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(V(Lt * Math.pow(t, 1.6) + Math.sin(t * 3 + tk) * 0.15, Ht * t, Math.sin(t * 2.5 + seed) * 0.3 * t)); }
    b.tube(pts, (t) => 0.13 + 0.26 * Math.pow(1 - t, 2.2), 5, (t, i) => HSL(0.09 + 0.015 * (i % 2), 0.3, 0.2 + 0.08 * t));
    crowns.push(pts[5]);
    if (tk === 0) top = pts[5];
    for (let k = 0; k < 1; k++) {
      const t0 = r.float(0.5, 0.75), p0 = pts[Math.round(t0 * 5)], a = r.float(0, TAU), d = r.float(1.0, 1.9);
      const e = V(p0.x + Math.cos(a) * d, p0.y + r.float(0.3, 0.9), p0.z + Math.sin(a) * d);
      b.tube([p0, e], (t) => 0.1 - 0.05 * t, 4, bark(0.25));
      b.blob(e.x, e.y + 0.3, e.z, r.float(0.9, 1.3), r.float(0.6, 0.9), r.float(0.9, 1.3), 0, HSL(hue + r.float(-0.02, 0.03), sat, lite + r.float(-0.04, 0.05)), { lo: 0.55 });
    }
  }
  const nb = r.int(8, 11);
  for (let i = 0; i < nb; i++) {
    const c = crowns[i % crowns.length];
    const a = r.float(0, TAU), el = r.float(-0.3, 1), d = r.float(0.3, 2.8) * (small > 0.9 ? 1 : 0.8);
    const s = r.float(1.2, 2.2);
    const col = HSL(hue + r.float(-0.03, 0.035), sat, lite + r.float(-0.05, 0.1));
    b.blob(c.x + Math.cos(a) * d, c.y + 0.3 + el * 1.5, c.z + Math.sin(a) * d, s, s * r.float(0.7, 0.95), s, 0, col, { amp: 0.28, lo: 0.5, hi: 1.25 });
  }
  if (flower) {
    for (let i = 0; i < 14; i++) {
      const a = r.float(0, TAU), el = r.float(0.2, 1), d = r.float(0.8, 2.3);
      b.blob(top.x + Math.cos(a) * d, top.y + 0.6 + el * 1.9, top.z + Math.sin(a) * d, 0.28, 0.2, 0.28, 0, C(flower).offsetHSL(r.float(-0.02, 0.02), 0, r.float(-0.05, 0.08)), { lo: 0.85, amp: 0.1 });
    }
  }
  const g = b.geo();
  g.userData = { height: H, top, crown: 2.2 };
  return g;
}

/** a liana hanging beneath a mid tree's crown (anchor from the tree geometry's top) */
export function vineGeometry(seed, treeGeo) {
  const b = new Build(seed), r = b.rng;
  const top = treeGeo.userData.top;
  const ax = top.x + 0.7, az = top.z + 0.5;
  const strands = r.int(3, 4);
  for (let k = 0; k < strands; k++) {
    const sx = ax + r.float(-0.9, 0.9), sz = az + r.float(-0.9, 0.9), y0 = top.y - r.float(0.1, 0.8), yEnd = r.float(0.7, 1.6);
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(V(sx + Math.sin(t * 3 + k) * 0.18, y0 + (yEnd - y0) * t, sz + Math.cos(t * 2.4 + k * 2) * 0.15)); }
    b.tube(pts, (t) => 0.045 - 0.015 * t, 4, (t) => HSL(0.2 + 0.05 * t, 0.3, 0.22));
    for (let i = 1; i < n; i += 2) {
      const p = pts[i];
      for (let s = 0; s < 2; s++) b.heartLeaf(p.x, p.y, p.z, r.float(0, TAU), -0.25, 0.34, HSL(0.3, 0.6, 0.2), HSL(0.27, 0.6, 0.34), { n: 10, droop: 0.5 });
    }
  }
  const g = b.geo(); g.userData = { anchor: { x: ax, z: az } };
  return g;
}

// ------------------------------------------------------------------ palms
export function palmGeometry(seed) {
  const b = new Build(seed), r = b.rng;
  const H = r.float(6.5, 10), bend = r.float(1.2, 3.2);
  const n = 9, pts = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1); pts.push(V(bend * t * t + 0.2 * Math.sin(t * 5), H * t, 0.35 * Math.sin(t * 3.3 + seed))); }
  b.tube(pts, (t) => (0.15 + 0.1 * (1 - t) + 0.09 * Math.pow(1 - t, 6)) * (1 + 0.1 * ((Math.round(t * (n - 1)) % 2) ? 1 : -1)), 6,
    (t, i) => HSL(0.085, 0.3, 0.3 + 0.1 * t - (i % 2 ? 0.07 : 0)));
  const top = pts[n - 1];
  const nF = r.int(9, 11);
  for (let f = 0; f < nF; f++) {
    const yaw = (f / nF) * TAU + r.float(-0.2, 0.2), dead = f % 7 === 3;
    const cA = dead ? C('#7a6a3a') : HSL(r.float(0.27, 0.31), r.float(0.55, 0.7), r.float(0.17, 0.22));
    const cB = dead ? C('#9a8648') : HSL(r.float(0.22, 0.27), r.float(0.6, 0.75), r.float(0.27, 0.34));
    b.frond(top.x, top.y + 0.1, top.z, yaw, r.float(3.3, 4.6), dead ? 0.1 : r.float(1.0, 1.9), dead ? 4.2 : r.float(1.8, 3.2), 9, 1.3, cA, cB, { spread: 0.5, leafDrop: 0.75, wide: 1.7 });
  }
  b.tri(V(top.x - 0.06, top.y, top.z), V(top.x + 0.06, top.y, top.z), V(top.x + 0.1, top.y + 1.5, top.z + 0.05), C('#9bc45a'));
  const nC = r.int(3, 4);
  for (let c = 0; c < nC; c++) {
    const a = c * 2.1 + r.float(0, 1);
    b.blob(top.x + Math.cos(a) * 0.28, top.y - 0.35 - r.float(0, 0.2), top.z + Math.sin(a) * 0.28, 0.2, 0.24, 0.2, 0, r.chance(0.5) ? C('#6a8a32') : C('#6b5428'), { amp: 0.08, lo: 0.8 });
  }
  const g = b.geo(); g.userData = { height: H, top };
  return g;
}

// ------------------------------------------------------------------ big-leaf understory
export function bananaGeometry(seed, ripe = false) {
  const b = new Build(seed), r = b.rng;
  const H = r.float(2.2, 3.2), lean = r.float(-0.4, 0.4);
  const stem = [V(0, 0, 0), V(lean * 0.4, H * 0.5, 0), V(lean, H, 0)];
  b.tube(stem, (t) => 0.2 - 0.07 * t, 7, (t) => HSL(0.22 - 0.03 * t, 0.35, 0.28 + 0.12 * t));
  const top = stem[2];
  const nL = r.int(7, 9);
  for (let i = 0; i < nL; i++) {
    const yaw = i * 2.4 + r.float(-0.2, 0.2), dir = V(Math.cos(yaw), 0, Math.sin(yaw));
    const young = i < 2, len = young ? r.float(1.6, 2.2) : r.float(2.4, 3.3), rise = young ? 1.5 : r.float(0.9, 1.5), droop = young ? 0.3 : r.float(1.6, 3.0);
    const base = V(top.x, top.y, top.z);
    const pts = [];
    for (let k = 0; k <= 4; k++) { const t = k / 4; pts.push(V(base.x + dir.x * len * t, base.y + rise * Math.sin(t * Math.PI * 0.6) - droop * t * t, base.z + dir.z * len * t)); }
    const W = r.float(0.45, 0.62), dead = i === nL - 1 && r.chance(0.5);
    const mid = dead ? C('#9a8a3c') : HSL(r.float(0.25, 0.3), 0.55, r.float(0.33, 0.4)), edge = dead ? C('#6d5a2a') : HSL(r.float(0.27, 0.33), 0.6, r.float(0.2, 0.26));
    b.ribbon(pts, V(-dir.z, 0, dir.x), (t) => W * Math.max(0.06, t < 0.18 ? 0.4 + 3.3 * t : 1 - (t - 0.18) * 1.15), 0.4, (t, v) => edge.clone().lerp(mid, 1 - Math.abs(v) * 0.9));
  }
  const sa = r.float(0, TAU), sdir = V(Math.cos(sa), 0, Math.sin(sa));
  const bt = V(top.x + sdir.x * 0.55, top.y - 0.55, top.z + sdir.z * 0.55);
  b.tube([V(top.x, top.y - 0.1, top.z), V(top.x + sdir.x * 0.45, top.y + 0.05, top.z + sdir.z * 0.45), bt, V(bt.x + sdir.x * 0.1, bt.y - 0.7, bt.z + sdir.z * 0.1)], 0.045, 5, () => C('#6a7a32'));
  const fruit = ripe ? C('#d8cc3e') : C('#98c040');
  const hands = r.int(3, 4);
  for (let h = 0; h < hands; h++) {
    const y = bt.y - 0.08 - h * 0.12, cx = bt.x + sdir.x * 0.1 * (h / 3), cz = bt.z + sdir.z * 0.1 * (h / 3);
    const nf = 5;
    for (let f = 0; f < nf; f++) {
      const a = (f / nf) * TAU + h * 0.5, dx = Math.cos(a), dz = Math.sin(a);
      const L = 0.3 - 0.015 * h;
      const p0 = V(cx + dx * 0.05, y, cz + dz * 0.05), p1 = V(cx + dx * 0.15, y - L * 0.5, cz + dz * 0.15), p2 = V(cx + dx * 0.17, y - L * 0.95, cz + dz * 0.17);
      b.tube([p0, p2], (t) => 0.04 - 0.02 * t, 4, (t) => fruit.clone().lerp(C('#4a5a22'), t > 0.9 ? 0.7 : 0).multiplyScalar(0.95 + 0.1 * f / nf));
    }
  }
  b.blob(bt.x + sdir.x * 0.1, bt.y - 0.95, bt.z + sdir.z * 0.1, 0.1, 0.2, 0.1, 0, C('#7a2a4e'), { amp: 0.05 });
  const g = b.geo(); g.userData = { height: H };
  return g;
}

/** monstera / elephant ear / alocasia — decoration only. kind: 0 monstera, 1 elephant ear, 2 alocasia */
export function bigLeafGeometry(seed, kind = 0) {
  const b = new Build(seed), r = b.rng;
  const n = kind === 0 ? r.int(5, 7) : kind === 1 ? r.int(3, 5) : r.int(4, 6);
  for (let i = 0; i < n; i++) {
    const yaw = i * 2.4 + r.float(-0.3, 0.3), dx = Math.cos(yaw), dz = Math.sin(yaw);
    const sl = kind === 0 ? r.float(0.5, 1.0) : r.float(0.9, 1.7);
    const reach = kind === 0 ? r.float(0.15, 0.4) : r.float(0.1, 0.35);
    const p0 = V(dx * 0.05, 0, dz * 0.05), p1 = V(dx * reach, sl, dz * reach);
    const sc = HSL(0.24, 0.4, 0.3);
    b.tube([p0, p1], 0.025, 3, () => sc);
    const size = kind === 0 ? r.float(0.55, 0.85) : kind === 1 ? r.float(0.85, 1.25) : r.float(0.6, 0.9);
    const c0 = kind === 2 ? HSL(0.42, 0.45, 0.2) : HSL(r.float(0.3, 0.35), 0.62, 0.17), c1 = kind === 2 ? HSL(0.38, 0.5, 0.36) : HSL(r.float(0.26, 0.31), 0.6, 0.33);
    b.heartLeaf(p1.x, p1.y, p1.z, yaw + r.float(-0.4, 0.4), kind === 0 ? r.float(0.1, 0.5) : kind === 1 ? r.float(0.2, 0.75) : r.float(0.55, 1.0), size, c0, c1, { cuts: kind === 0 ? 1 : 0, n: kind === 0 ? 16 : 12, droop: kind === 1 ? 0.9 : 0.5 });
  }
  return b.geo();
}

export function fernGeometry(seed, hue = 0.29) {
  const b = new Build(seed), r = b.rng;
  const nF = r.int(6, 7);
  for (let i = 0; i < nF; i++) {
    const yaw = i * 2.4 + r.float(-0.2, 0.2);
    const cA = HSL(hue + r.float(-0.02, 0.02), 0.62, r.float(0.17, 0.23)), cB = HSL(hue - 0.03, 0.65, r.float(0.28, 0.36));
    b.frond(0, 0.05, 0, yaw, r.float(1.0, 1.5), r.float(0.5, 0.85), r.float(0.5, 0.9), 5, 0.34, cA, cB, { spread: 0.7, leafDrop: 0.3 });
  }
  return b.geo();
}

/** shrubs. o: berries, flowers, hue, bent (hill), round (sea grape) */
export function bushGeometry(seed, o = {}) {
  const { berries = false, flowers = null, hue = 0.28, sat = 0.55, lite = 0.24, bent = 0, round = false } = o;
  const b = new Build(seed), r = b.rng;
  const n = r.int(4, 5), blobs = [];
  for (let i = 0; i < n; i++) {
    const rad = r.float(0.45, 0.85) * (round ? 0.9 : 1), x = r.float(-0.6, 0.6), z = r.float(-0.6, 0.6), y = r.float(0.3, 0.8);
    blobs.push([x, y, z, rad]);
    b.blob(x, y, z, rad, rad * (round ? 0.6 : 0.8), rad, 0, HSL(hue + r.float(-0.025, 0.03), sat, lite + r.float(-0.04, 0.08)), { amp: 0.28, lo: 0.5, hi: 1.25, ground: true });
  }
  if (berries) for (let i = 0; i < 12; i++) {
    const bl = blobs[i % n], a = r.float(0, TAU), e = r.float(-0.2, 0.9);
    const rr = bl[3] * 1.0;
    b.blob(bl[0] + Math.cos(a) * rr * Math.cos(e), bl[1] + Math.sin(e) * rr * 0.75, bl[2] + Math.sin(a) * rr * Math.cos(e), 0.09, 0.09, 0.09, 0, r.chance(0.8) ? C('#d6213f') : C('#7a1c6a'), { amp: 0.05, lo: 0.9, hi: 1.3 });
  }
  if (flowers) for (let i = 0; i < 12; i++) {
    const bl = blobs[i % n], a = r.float(0, TAU), e = r.float(0.1, 0.9);
    b.blob(bl[0] + Math.cos(a) * bl[3] * Math.cos(e), bl[1] + Math.sin(e) * bl[3] * 0.8, bl[2] + Math.sin(a) * bl[3] * Math.cos(e), 0.12, 0.08, 0.12, 0, C(flowers).offsetHSL(r.float(-0.02, 0.02), 0, r.float(-0.05, 0.05)), { amp: 0.1, lo: 0.9, hi: 1.2 });
  }
  const g = b.geo();
  if (bent) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + p.getY(i) * bent); g.computeVertexNormals(); }
  return g;
}

export function herbGeometry(seed) {
  const b = new Build(seed), r = b.rng;
  for (let i = 0; i < 6; i++) b.heartLeaf(0, 0.05, 0, i * 1.1 + r.float(-0.2, 0.2), r.float(0.3, 0.8), 0.34, HSL(0.28, 0.6, 0.2), HSL(0.25, 0.6, 0.34), { n: 10, droop: 0.7 });
  for (let i = 0; i < 6; i++) {
    const a = r.float(0, TAU), d = r.float(0.05, 0.22), h = r.float(0.4, 0.62);
    b.tube([V(Math.cos(a) * d * 0.5, 0.05, Math.sin(a) * d * 0.5), V(Math.cos(a) * d, h, Math.sin(a) * d)], 0.012, 3, () => C('#5a8a32'));
    b.blob(Math.cos(a) * d, h + 0.04, Math.sin(a) * d, 0.075, 0.06, 0.075, 0, C('#ffe23a'), { amp: 0.12, lo: 0.9, hi: 1.2 });
  }
  return b.geo();
}

// ------------------------------------------------------------------ grasses / reeds / canes
export function grassTuft(seed, o = {}) {
  const { n = 16, h0 = 0.6, h1 = 1.1, hue = 0.27, seedHead = false, bend = 0.4, w = 0.045, dry = 0.0 } = o;
  const b = new Build(seed), r = b.rng;
  for (let i = 0; i < n; i++) {
    const a = r.float(0, TAU), d = Math.sqrt(r.next()) * 0.28, h = r.float(h0, h1);
    const c0 = HSL(hue + 0.03 + r.float(-0.02, 0.02), 0.6, r.float(0.16, 0.22)), c1 = r.chance(dry) ? C('#b9b060') : HSL(hue + 0.01 + r.float(-0.02, 0.03), 0.65, r.float(0.3, 0.4));
    b.blade(Math.cos(a) * d, 0, Math.sin(a) * d, r.float(0, TAU), h, w * r.float(0.8, 1.3), h * r.float(0.1, bend), c0, c1);
  }
  if (seedHead) for (let i = 0; i < 4; i++) { const a = r.float(0, TAU), d = r.float(0, 0.2); b.blob(Math.cos(a) * d + 0.05, h1 * 0.95, Math.sin(a) * d, 0.04, 0.12, 0.04, 0, C('#c8b45a'), { amp: 0.05 }); }
  return b.geo();
}

export function reedGeometry(seed) {
  const b = new Build(seed), r = b.rng;
  const n = r.int(12, 16);
  for (let i = 0; i < n; i++) {
    const a = r.float(0, TAU), d = Math.sqrt(r.next()) * 0.35, h = r.float(1.3, 2.2);
    b.blade(Math.cos(a) * d, 0, Math.sin(a) * d, r.float(0, TAU), h, 0.03, h * r.float(0.1, 0.35), HSL(0.22, 0.5, 0.25), HSL(0.19, 0.55, 0.42));
  }
  for (let i = 0; i < 3; i++) { const a = r.float(0, TAU), d = r.float(0.05, 0.25), h = r.float(1.4, 1.9); b.tube([V(Math.cos(a) * d, 0, Math.sin(a) * d), V(Math.cos(a) * d, h, Math.sin(a) * d)], 0.012, 3, () => C('#7a8a3a')); b.tube([V(Math.cos(a) * d, h - 0.05, Math.sin(a) * d), V(Math.cos(a) * d, h + 0.28, Math.sin(a) * d)], 0.04, 5, () => C('#6b4423')); }
  return b.geo();
}

export function bambooGeometry(seed) {
  const b = new Build(seed), r = b.rng;
  const n = r.int(6, 8);
  const hue = r.pick([0.2, 0.22, 0.25]);
  for (let i = 0; i < n; i++) {
    const h = r.float(4.5, 8), a = r.float(0, TAU), d = Math.sqrt(r.next()) * 0.9, lean = r.float(0.08, 0.28) * h * 0.25, la = r.float(0, TAU);
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d, segs = 5, pts = [];
    for (let k = 0; k <= segs; k++) { const t = k / segs; pts.push(V(bx + Math.cos(la) * lean * t * t, h * t, bz + Math.sin(la) * lean * t * t)); }
    b.tube(pts, (t) => 0.075 - 0.03 * t, 4, (t, k) => HSL(hue + 0.01 * (k % 2), 0.5, 0.36 + 0.1 * (k % 2) + 0.05 * t));
    const top = pts[segs];
    for (let k = 0; k < 3; k++) b.frond(top.x, top.y - 0.15 * k, top.z, r.float(0, TAU), 1.3, 0.25, 0.8, 4, 0.55, HSL(hue + 0.04, 0.6, 0.22), HSL(hue + 0.03, 0.6, 0.38), { spread: 0.5 });
  }
  return b.geo();
}

export function sugarcaneGeometry(seed, purple = false) {
  const b = new Build(seed), r = b.rng;
  const n = r.int(5, 7);
  for (let i = 0; i < n; i++) {
    const h = r.float(2.3, 3.5), a = r.float(0, TAU), d = Math.sqrt(r.next()) * 0.45, lean = r.float(0.05, 0.4), la = r.float(0, TAU);
    const segs = 4, pts = [];
    for (let k = 0; k <= segs; k++) { const t = k / segs; pts.push(V(Math.cos(a) * d + Math.cos(la) * lean * t * t, h * t, Math.sin(a) * d + Math.sin(la) * lean * t * t)); }
    b.tube(pts, 0.04, 4, (t, k) => (purple ? HSL(0.85, 0.3, 0.3 + 0.08 * (k % 2)) : HSL(0.2, 0.5, 0.42 + 0.1 * (k % 2))));
    const top = pts[segs];
    for (let k = 0; k < 3; k++) {
      const yaw = r.float(0, TAU), dir = V(Math.cos(yaw), 0, Math.sin(yaw)), len = r.float(0.9, 1.4);
      const lp = []; for (let q = 0; q <= 3; q++) { const t = q / 3; lp.push(V(top.x + dir.x * len * t, top.y - 0.05 * k + 0.35 * Math.sin(t * 2) - 0.8 * t * t, top.z + dir.z * len * t)); }
      b.ribbon(lp, V(-dir.z, 0, dir.x), (t) => 0.055 * (1 - t * 0.9), 0.2, (t) => HSL(0.25, 0.55, 0.28 + 0.12 * t));
    }
  }
  return b.geo();
}

// ------------------------------------------------------------------ beach & ground items
export function driftwoodGeometry(seed) {
  const b = new Build(seed), r = b.rng;
  const len = r.float(1.6, 3.4), pts = [];
  const c0 = C('#b8a98e'), c1 = C('#8a7b66');
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(V((t - 0.5) * len, 0.12 + 0.07 * Math.sin(t * 3) + (r.next() - 0.5) * 0.03, Math.sin(t * 2.5) * 0.12)); }
  b.tube(pts, (t) => 0.13 - 0.05 * t, 6, (t) => c0.clone().lerp(c1, t * 0.6 + r.next() * 0.2));
  for (let k = 0; k < 3; k++) {
    const p = pts[r.int(1, 4)], a = r.float(0, TAU), l = r.float(0.3, 0.7);
    b.tube([p, V(p.x + Math.cos(a) * l * 0.5, p.y + 0.15, p.z + Math.sin(a) * l * 0.5), V(p.x + Math.cos(a) * l, p.y + 0.3, p.z + Math.sin(a) * l)], (t) => 0.04 - 0.02 * t, 4, () => c0);
  }
  for (let k = 0; k < 3; k++) { const a = (k - 1) * 0.7, p = pts[0]; b.tube([p, V(p.x - 0.35, p.y + 0.15, p.z + Math.sin(a) * 0.3), V(p.x - 0.55, p.y + 0.35, p.z + Math.sin(a) * 0.5)], (t) => 0.06 - 0.04 * t, 4, () => c1); }
  const g = b.geo(); g.rotateY(r.float(0, TAU)); return g;
}

export function mushroomGeometry(seed, type = 0) {
  const b = new Build(seed), r = b.rng;
  const n = r.int(2, 3);
  const capC = [C('#d12f2a'), C('#e08a32'), C('#d9c8a6')][type], stem = C('#f0e8d2');
  for (let i = 0; i < n; i++) {
    const a = r.float(0, TAU), d = i === 0 ? 0 : r.float(0.1, 0.3), sz = i === 0 ? 1 : r.float(0.6, 0.9);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = r.float(0.16, 0.3) * sz * 1.2, cr = 0.13 * sz * 1.3;
    b.tube([V(x, 0, z), V(x + r.float(-0.02, 0.02), h, z)], (t) => 0.035 * sz - 0.01 * t, 4, () => stem);
    b.blob(x, h, z, cr, cr * 0.6, cr, 0, capC, { amp: 0.06, lo: 0.75, hi: 1.15, ground: true });
    if (type === 0) for (let k = 0; k < 2; k++) { const aa = r.float(0, TAU), rr = r.float(0, cr * 0.6); b.blob(x + Math.cos(aa) * rr, h + cr * 0.55 * (1 - rr / cr * 0.6), z + Math.sin(aa) * rr, 0.025, 0.02, 0.025, 0, C('#fff6df'), { amp: 0, lo: 1, hi: 1 }); }
  }
  return b.geo();
}

export function aloeGeometry(seed, flower = false) {
  const b = new Build(seed), r = b.rng;
  const n = r.int(9, 12);
  for (let i = 0; i < n; i++) {
    const yaw = i * 2.4 + r.float(-0.2, 0.2), dir = V(Math.cos(yaw), 0, Math.sin(yaw)), t0 = i / n;
    const len = r.float(0.55, 0.85) * (1 - 0.25 * t0), up = 0.45 + 0.5 * t0, out = 0.45 * (1 - 0.5 * t0);
    const pts = []; for (let k = 0; k <= 3; k++) { const t = k / 3; pts.push(V(dir.x * len * out * 1.3 * t + dir.x * 0.04, 0.05 + len * up * Math.sin(t * 1.4) - len * 0.18 * t * t, dir.z * len * out * 1.3 * t + dir.z * 0.04)); }
    b.ribbon(pts, V(-dir.z, 0, dir.x), (t) => 0.085 * (1 - Math.pow(t, 1.6) * 0.95), 0.4, (t) => HSL(0.43 - 0.03 * t, 0.35, 0.3 + 0.07 * t).lerp(C('#9a4a3a'), t > 0.85 ? 0.5 : 0));
  }
  if (flower) {
    b.tube([V(0, 0.1, 0), V(0.05, 0.6, 0), V(0.08, 1.15, 0.02)], 0.022, 4, () => C('#b86a3a'));
    for (let k = 0; k < 7; k++) b.blob(0.08 + Math.sin(k * 2) * 0.05, 0.85 + k * 0.06, Math.cos(k * 2) * 0.05, 0.05, 0.1, 0.05, 0, C('#f0602a'), { amp: 0.1, lo: 0.9, hi: 1.2 });
  }
  return b.geo();
}

function scallop(b, x, z, size, c0, c1, yaw) {
  const nr = 9, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const P = (u, v, y) => V(x + (u * cs - v * sn), y, z + (u * sn + v * cs));
  for (let i = 0; i < nr; i++) {
    const a0 = -1.0 + (2.0 * i) / nr, a1 = -1.0 + (2.0 * (i + 1)) / nr, col = i % 2 ? c0 : c1;
    const e0 = P(Math.sin(a0) * size, Math.cos(a0) * size, 0.07 * size * (1 - Math.abs(a0))), e1 = P(Math.sin(a1) * size, Math.cos(a1) * size, 0.07 * size * (1 - Math.abs(a1)));
    const m = i % 2 ? 0.12 : 0.04;
    b.tri(P(0, 0, 0.02), e0, e1, col.clone().multiplyScalar(0.9), col, col.clone().multiplyScalar(1 + m));
  }
  b.tri(P(-size * 0.25, -0.02, 0.03), P(size * 0.25, -0.02, 0.03), P(0, -size * 0.22, 0.02), c1);
}
export function shellGeometry(seed, type = 0) {
  const b = new Build(seed);
  const pink = [C('#f6d2c6'), C('#f2e6d6'), C('#f4cfa8')], deep = [C('#e8978a'), C('#d6b898'), C('#e58f5a')];
  if (type === 0) { scallop(b, 0, 0, 0.19, pink[0], deep[0], 0.3); scallop(b, 0.28, 0.12, 0.14, pink[1], deep[1], 2.2); }
  else if (type === 1) {
    for (let i = 0; i < 5; i++) { const t = i / 4, rad = 0.12 * (1 - 0.8 * t) + 0.02; b.blob(t * 0.34, 0.1 * (1 - t * 0.4) + 0.02, 0, rad * 1.2, rad, rad, 0, i % 2 ? C('#f0e2c6') : C('#b58a5a'), { amp: 0.05, lo: 0.8 }); }
    scallop(b, -0.3, 0.2, 0.15, pink[2], deep[2], 1.0);
  } else {
    scallop(b, 0, 0, 0.17, pink[1], deep[2], -0.5); scallop(b, 0.25, -0.15, 0.15, pink[0], deep[0], 0.9);
    b.blob(-0.25, 0.05, 0.18, 0.1, 0.07, 0.07, 0, C('#fbf0e4'), { amp: 0.06 });
  }
  return b.geo();
}

export function seaweedGeometry(seed) {
  const b = new Build(seed), r = b.rng;
  const n = r.int(5, 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.float(-0.3, 0.3), L = r.float(0.45, 0.95), dir = V(Math.cos(a), 0, Math.sin(a)), pts = [];
    const wob = r.float(0.1, 0.25);
    for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(V(dir.x * L * t - dir.z * Math.sin(t * 6 + i) * wob * t, 0.03 + 0.08 * Math.sin(t * 3.14) * (0.5 + r.next() * 0.5), dir.z * L * t + dir.x * Math.sin(t * 6 + i) * wob * t)); }
    const c = r.chance(0.5) ? C('#33461c') : C('#5a4a24');
    b.ribbon(pts, V(-dir.z, 0, dir.x), (t) => 0.06 * (1 - t * 0.5) * (0.7 + 0.3 * Math.sin(t * 12)), 0.0, (t) => c.clone().multiplyScalar(0.8 + 0.4 * t));
    if (r.chance(0.5)) { const p = pts[3]; b.blob(p.x, p.y + 0.03, p.z, 0.05, 0.04, 0.05, 0, C('#8a7a30'), { amp: 0.05 }); }
  }
  b.blob(0, 0.05, 0, 0.12, 0.07, 0.12, 0, C('#2c3a18'), { amp: 0.2 });
  return b.geo();
}

export function flintGeometry(seed) {
  const r = new RNG(seed), list = [];
  const n = r.int(2, 3);
  for (let i = 0; i < n; i++) {
    const g = lowPolyRock(seed + i * 17, i === 0 ? 0.2 : 0.13, { base: ['#23272e', '#2c3138', '#1c1f25'], detail: 0, flat: 0.8 });
    g.translate(r.float(-0.2, 0.2) * (i > 0 ? 1.6 : 0), 0, r.float(-0.2, 0.2) * (i > 0 ? 1.6 : 0));
    list.push(g);
  }
  const g = lowPolyRock(seed + 99, 0.1, { base: ['#b9b4a6'], detail: 0, flat: 0.8 }); g.translate(0.3, 0, -0.1); list.push(g);
  return mergeGeos(list);
}

export function clayGeometry(seed) {
  const b = new Build(seed), r = b.rng;
  const n = 14, rad = [];
  for (let i = 0; i < n; i++) rad.push(r.float(0.7, 1.1));
  const c0 = C('#b0705a'), c1 = C('#8f6350'), c2 = C('#6e4a3c');
  const pt = (i, k) => { const a = ((i % n) / n) * TAU; return V(Math.cos(a) * rad[i % n] * k, 0.045 + 0.02 * Math.sin(a * 3 + seed) * k, Math.sin(a) * rad[i % n] * k * 0.85); };
  for (let i = 0; i < n; i++) {
    b.tri(V(0, 0.06, 0), pt(i, 0.55), pt(i + 1, 0.55), c0, c0.clone().multiplyScalar(0.95), c0.clone().multiplyScalar(1.05));
    b.quad(pt(i, 0.55), pt(i, 1), pt(i + 1, 1), pt(i + 1, 0.55), c0.clone().lerp(c1, 0.5), c1, c1, c0.clone().lerp(c1, 0.5));
    if (i % 3 === 0) b.tri(V(0, 0.07, 0), pt(i, 0.8), pt(i + 1, 0.7), c2, c2, c2);
  }
  return b.geo();
}

export function nestGeometry(seed, eggs = 3) {
  const b = new Build(seed), r = b.rng;
  const pts = []; const R = 0.24;
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU; pts.push(V(Math.cos(a) * R, 0.07 + 0.015 * Math.sin(a * 3), Math.sin(a) * R)); }
  b.tube(pts, 0.07, 5, (t, i) => HSL(0.08, 0.4, 0.25 + 0.07 * (i % 3)));
  for (let i = 0; i < 6; i++) { const a = r.float(0, TAU), l = r.float(0.18, 0.34); b.tube([V(Math.cos(a) * R * 0.8, 0.06 + r.float(0, 0.06), Math.sin(a) * R * 0.8), V(Math.cos(a + 0.4) * (R + l), 0.1 + r.float(0, 0.1), Math.sin(a + 0.4) * (R + l))], 0.016, 3, () => HSL(0.09, 0.45, 0.2 + r.next() * 0.15)); }
  b.blob(0, 0.07, 0, R * 0.9, 0.05, R * 0.9, 0, C('#6a5232'), { amp: 0.1 });
  const egg = r.pick([C('#a6dce0'), C('#f4ecd8'), C('#c8e0b0')]);
  for (let i = 0; i < eggs; i++) { const a = (i / eggs) * TAU + 0.4, d = eggs > 1 ? 0.09 : 0; b.blob(Math.cos(a) * d, 0.16, Math.sin(a) * d, 0.085, 0.11, 0.085, 0, egg, { amp: 0.04, lo: 0.9, hi: 1.15 }); }
  return b.geo();
}

/** morning-glory creeper mat: strands with small heart leaves and trumpet flowers */
export function creeperGeometry(seed) {
  const b = new Build(seed), r = b.rng;
  const ns = 3;
  for (let s = 0; s < ns; s++) {
    const a = (s / ns) * TAU + r.float(-0.4, 0.4), L = r.float(1.2, 2.2), pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6, w = Math.sin(t * 5 + s) * 0.15 * t; pts.push(V(Math.cos(a) * L * t - Math.sin(a) * w, 0.03, Math.sin(a) * L * t + Math.cos(a) * w)); }
    b.tube([pts[0], pts[3], pts[6]], 0.012, 3, () => C('#4e7a2c'));
    for (let k = 2; k <= 6; k += 2) b.heartLeaf(pts[k].x, pts[k].y, pts[k].z, r.float(0, TAU), 0.12, 0.3, HSL(0.28, 0.55, 0.22), HSL(0.26, 0.6, 0.34), { n: 10, droop: 0.2 });
    if (r.chance(0.8)) for (let k = 0; k < 2; k++) { const p = pts[r.int(2, 6)]; b.blob(p.x, 0.1, p.z, 0.07, 0.06, 0.07, 0, C('#c85ad0').offsetHSL(r.float(-0.04, 0.03), 0, 0.03), { amp: 0.1, lo: 0.9, hi: 1.25 }); }
  }
  return b.geo();
}

/** stiff pale-green beach / dune grass */
export function dunGrassGeometry(seed) { return grassTuft(seed, { n: 18, h0: 0.55, h1: 1.0, hue: 0.19, bend: 0.8, w: 0.04, dry: 0.15 }); }

/** low rosette of heart leaves: ground cover */
export function groundLeafGeometry(seed, hue = 0.3) {
  const b = new Build(seed), r = b.rng;
  const n = r.int(5, 6);
  for (let i = 0; i < n; i++) b.heartLeaf(0, 0.04 + r.float(0, 0.12), 0, i * 2.4 + r.float(-0.2, 0.2), r.float(0.12, 0.5), r.float(0.28, 0.45), HSL(hue + r.float(-0.03, 0.03), 0.6, r.float(0.15, 0.21)), HSL(hue - 0.02 + r.float(-0.03, 0.03), 0.62, r.float(0.28, 0.4)), { n: 10, droop: 0.4 });
  return b.geo();
}

export function rockGeo(seed, size, o) { return lowPolyRock(seed, size, o); }
