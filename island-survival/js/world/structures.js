// world/structures.js — procedural low-poly meshes for every building (DESIGN.md §12, §21.2).
//
//   buildMesh(id, { stage: 'frame' | 'done' | 'ruin', progress: 0–1, materials: { roof: 'palm'|'mat'|'tarp'|'bark',
//                   tent: 'orange'|'green' }, seed }) → THREE.Group   (one merged vertex-coloured mesh, y = 0 is the ground,
//                   the front / opening is +z, the footprint is centred on the origin, see BUILDINGS[id].size)
//
// 'frame' shows the skeleton (poles) that fills in with `progress`: poles first, then the roof / walls row by row.
// 'done' is always the finished building. The flames of campfire / fire_ring / signal_fire come from world/fire.js.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { BUILDINGS } from '../data/buildings.js';
import { hash3 } from './flora/geo.js';

const C = (h) => new THREE.Color(h);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const V3 = THREE.Vector3, UP = new V3(0, 1, 0);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cnt = (n, frac) => Math.ceil(n * frac - 1e-6);

const COL = {
  wood: C('#8b6b43'), woodD: C('#5f4630'), woodL: C('#a98a5c'), bamboo: C('#c2bc60'), bambooD: C('#98a24a'),
  stone: C('#8e8a80'), stoneL: C('#aaa598'), stoneW: C('#d9d3c0'), rope: C('#dccb9c'), ash: C('#38332e'),
  straw: C('#d9bc5e'), straw2: C('#c29c3f'), clay: C('#b9805a'), dark: C('#241c14'), soil: C('#5a3f2a'), leaf: C('#4f8f35'),
};
const ROOF = { // [colour A, colour B, teeth, columns]
  palm: [C('#5a983a'), C('#86b34a'), true, 5],
  mat: [C('#cfab6a'), C('#b58d4e'), false, 8],
  tarp: [C('#3f80c0'), C('#3774b0'), false, 1],
  bark: [C('#7d5c3c'), C('#6a4c31'), true, 3],
};
export function roofKindOf(itemId = '') {
  const s = String(itemId).toLowerCase();
  if (/tarp|canvas|sheet|sail|cloth/.test(s)) return 'tarp';
  if (/mat|woven/.test(s)) return 'mat';
  if (/bark/.test(s)) return 'bark';
  return 'palm';
}

class Parts {
  constructor(seed = 1) { this.pos = []; this.col = []; this.nor = []; this.rng = new RNG(seed); this.tris = 0; }

  tri(a, b, c, ca, cb = ca, cc = ca) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-10) return; // degenerate
    nx /= l; ny /= l; nz /= l;
    this.pos.push(...a, ...b, ...c);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    for (let i = 0; i < 3; i++) this.nor.push(nx, ny, nz);
    this.tris++;
  }
  quad(a, b, c, d, ca, cb = ca, cc = ca, cd = cc) { this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd); }
  jit(col, amt = 0.08) { return col.clone().multiplyScalar(1 + (this.rng.next() - 0.5) * 2 * amt); }

  /** merge a three geometry: matrix m, colour col (or fn(vx, vy, vz local) → Color), per-triangle shade variation */
  geo(g, m, col, { vary = 0.07, warp = 0, grad = 0 } = {}) {
    const gg = g.index ? g.toNonIndexed() : g;
    const p = gg.attributes.position;
    gg.computeBoundingBox();
    const bb = gg.boundingBox, h = Math.max(1e-4, bb.max.y - bb.min.y);
    const loc = [new V3(), new V3(), new V3()];
    for (let i = 0; i < p.count; i += 3) {
      const w = [], cs = [];
      const base = typeof col === 'function' ? null : this.jit(col, vary);
      for (let j = 0; j < 3; j++) {
        loc[j].fromBufferAttribute(p, i + j);
        const lx = loc[j].x, ly = loc[j].y, lz = loc[j].z;
        if (warp) {
          const k = (n) => (hash3(Math.round(lx * 40) + n, Math.round(ly * 40), Math.round(lz * 40)) - 0.5) * warp;
          loc[j].x += k(1); loc[j].y += k(7); loc[j].z += k(13);
        }
        const q = loc[j].clone().applyMatrix4(m);
        w.push([q.x, q.y, q.z]);
        let c = base ? base.clone() : this.jit(col(lx, ly, lz), vary);
        if (grad) c.multiplyScalar(1 - grad / 2 + grad * ((ly - bb.min.y) / h));
        cs.push(c);
      }
      this.tri(w[0], w[1], w[2], cs[0], cs[1], cs[2]);
    }
    g.dispose(); if (gg !== g) gg.dispose();
  }

  /** a stick from a to b (radius r0 at a, r1 at b) */
  pole(a, b, r0, r1, col, radial = 5, cap = true) {
    const A = new V3(...a), B = new V3(...b), len = A.distanceTo(B);
    if (len < 1e-4) return;
    const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, !cap);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize());
    this.geo(g, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new V3(1, 1, 1)), col);
  }
  /** axis-aligned (then yawed) box centred at (x, y, z) */
  box(x, y, z, w, h, d, col, yaw = 0, vary = 0.06) {
    this.geo(new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new V3(1, 1, 1)), col, { vary });
  }
  /** low-poly stone */
  rock(x, y, z, rx, ry, rz, col, yaw = null, warp = 0.35) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw ?? this.rng.float(0, 6.28));
    this.geo(g, new THREE.Matrix4().compose(new V3(x, y, z), q, new V3(rx, ry, rz)), col, { vary: 0.1, warp, grad: 0.35 });
  }
  disc(x, y, z, rx, rz, h, col, seg = 10) {
    this.geo(new THREE.CylinderGeometry(1, 1, h, seg), new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion(), new V3(rx, 1, rz)), col, { vary: 0.03 });
  }
  /** rope lashing */
  knot(x, y, z, s = 0.07) { this.box(x, y, z, s, s, s, COL.rope, this.rng.float(0, 3), 0.1); }

  /** thatch / mat / tarp panel. p0 p1 = top edge (left,right), p2 p3 = bottom edge (right,left). rows revealed from the bottom. */
  roof(p0, p1, p2, p3, kind, frac = 1, rows = 6) {
    const n = cnt(rows, frac);
    if (n <= 0) return;
    const [ca, cb, teeth, K] = ROOF[kind] || ROOF.palm;
    const Lf = (t) => lerp3(p3, p0, t), Rf = (t) => lerp3(p2, p1, t);
    const down = new V3(...p3).sub(new V3(...p0)).normalize();
    const rh = new V3(...p0).distanceTo(new V3(...p3)) / rows;
    for (let r = 0; r < n; r++) {
      const s0 = r / rows, s1 = Math.min(1, (r + 1) / rows + 0.05);
      for (let k = 0; k < K; k++) {
        const u0 = k / K, u1 = (k + 1) / K;
        const a = lerp3(Lf(s0), Rf(s0), u0), b = lerp3(Lf(s0), Rf(s0), u1), c = lerp3(Lf(s1), Rf(s1), u1), d = lerp3(Lf(s1), Rf(s1), u0);
        const sh = 0.82 + 0.26 * ((r + 0.5) / rows);
        let col = ((r + k) % 2 ? ca : cb).clone().multiplyScalar(sh);
        col = this.jit(col, kind === 'tarp' ? 0.02 : 0.07);
        this.quad(a, b, c, d, col);
        if (teeth) {
          const tip = [(a[0] + b[0]) / 2 + down.x * rh * 0.5, (a[1] + b[1]) / 2 + down.y * rh * 0.5, (a[2] + b[2]) / 2 + down.z * rh * 0.5];
          this.tri(a, b, tip, col.clone().multiplyScalar(0.88), col.clone().multiplyScalar(0.88), col.clone().multiplyScalar(0.72));
        }
      }
    }
  }

  /** a grass blade (two triangles) */
  blade(x, y, z, yaw, h, w, bend, c0, c1) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw), bx = -dz, bz = dx;
    this.tri([x - bx * w, y, z - bz * w], [x + bx * w, y, z + bz * w], [x + dx * bend, y + h, z + dz * bend], c0, c0, c1);
  }

  group(extra = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, MAT());
    mesh.castShadow = mesh.receiveShadow = true;
    const grp = new THREE.Group();
    grp.add(mesh);
    grp.userData = { tris: this.tris, ...extra };
    return grp;
  }
}
let _mat = null;
const MAT = () => (_mat ||= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));

// ----------------------------------------------------------------------------------------------- helpers
const fr = (p, a, b) => clamp((p - a) / (b - a));

function stoneRing(P, r, n, size, frac, layers = 1) {
  const k = cnt(n * layers, frac);
  let i = 0;
  for (let L = 0; L < layers; L++) {
    for (let j = 0; j < n; j++, i++) {
      if (i >= k) return;
      const a = ((j + (L % 2) * 0.5) / n) * Math.PI * 2 + P.rng.float(-0.05, 0.05);
      const s = size * P.rng.float(0.85, 1.2);
      P.rock(Math.cos(a) * r, s * 0.55 + L * size * 0.9, Math.sin(a) * r, s * 1.15, s * 0.8, s, P.jit(P.rng.chance(0.5) ? COL.stone : COL.stoneL, 0.1), a);
    }
  }
}
function logsCrossed(P, n, r, len, frac, y0 = 0.1) {
  const k = cnt(n, frac);
  for (let i = 0; i < k; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    P.pole([dx * len * 0.5, y0 + 0.28, dz * len * 0.5], [-dx * len * 0.4, y0 + 0.02, -dz * len * 0.4], r, r * 0.9, COL.woodD, 6);
  }
}
function bundle(P, x, z, h, w, col, n = 14, o = {}) { // tuft of grass / leaves
  for (let i = 0; i < n; i++) {
    const a = P.rng.float(0, 6.28), d = P.rng.float(0, w);
    P.blade(x + Math.cos(a) * d, o.y ?? 0, z + Math.sin(a) * d, P.rng.float(0, 6.28), h * P.rng.float(0.6, 1.1), 0.035, P.rng.float(0.05, 0.25), P.jit(col, 0.12), P.jit(col, 0.2).multiplyScalar(1.15));
  }
}

// ----------------------------------------------------------------------------------------------- builders
const B = {};

B.campfire = (P, o) => {
  const p = o.p;
  P.disc(0, 0.01, 0, 0.42, 0.42, 0.02, COL.ash, 9);
  stoneRing(P, 0.55, 9, 0.14, fr(p, 0, 0.6));
  logsCrossed(P, 4, 0.055, 0.8, fr(p, 0.5, 1));
};

B.fire_ring = (P, o) => {
  const p = o.p;
  P.disc(0, 0.01, 0, 0.62, 0.62, 0.02, COL.ash, 10);
  stoneRing(P, 0.78, 11, 0.2, fr(p, 0, 0.8), 2);
  logsCrossed(P, 4, 0.06, 0.95, fr(p, 0.8, 1), 0.08);
};

B.clay_oven = (P, o) => {
  const p = o.p;
  stoneRing(P, 0.62, 9, 0.2, fr(p, 0, 0.3), 1);
  if (p > 0.3) {
    const k = fr(p, 0.3, 1);
    const g = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    P.geo(g, new THREE.Matrix4().compose(new V3(0, 0.22, 0), new THREE.Quaternion(), new V3(0.72, 0.7 * (0.35 + 0.65 * k), 0.72)), COL.clay, { vary: 0.05, warp: 0.06, grad: 0.3 });
    if (k > 0.8) {
      P.box(0, 0.52, 0.66, 0.34, 0.3, 0.1, COL.dark);          // mouth
      P.pole([0.18, 0.93, -0.05], [0.18, 1.12, -0.05], 0.12, 0.09, COL.clay, 6); // chimney
    }
  }
};

B.signal_fire = (P, o) => {
  const p = o.p, L = 9, step = 0.2;
  P.disc(0, 0.01, 0, 1.0, 1.0, 0.02, COL.ash, 12);
  stoneRing(P, 1.05, 10, 0.26, fr(p, 0, 0.25), 1);
  const nl = cnt(L, fr(p, 0.2, 0.85));
  for (let i = 0; i < nl; i++) {
    const y = 0.14 + i * step, w = 0.62 - i * 0.025, long = 1.2 - i * 0.04;
    const alongX = i % 2 === 0;
    for (const s of [-1, 1]) {
      if (alongX) P.pole([-long / 2, y, s * w * 0.5], [long / 2, y, s * w * 0.5], 0.075, 0.07, COL.woodD, 6);
      else P.pole([s * w * 0.5, y, -long / 2], [s * w * 0.5, y, long / 2], 0.075, 0.07, COL.wood, 6);
    }
  }
  if (fr(p, 0.7, 1) > 0) { // central pole + leafy smoke bundle on top
    P.pole([0, 0.1, 0], [0, 2.35, 0], 0.07, 0.05, COL.wood, 5);
    const k = fr(p, 0.85, 1);
    for (let i = 0; i < cnt(8, k); i++) {
      const a = (i / 8) * 6.28;
      P.pole([0, 2.0, 0], [Math.cos(a) * 0.6, 2.55 + (i % 2) * 0.15, Math.sin(a) * 0.6], 0.05, 0.02, COL.leaf, 4);
      P.rock(Math.cos(a) * 0.42, 2.35, Math.sin(a) * 0.42, 0.22, 0.12, 0.22, P.jit(COL.leaf, 0.2), a, 0.3);
    }
  }
};

const FONT = {
  S: ['.XXX.', 'X...X', 'X....', '.XXX.', '....X', 'X...X', '.XXX.'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
};
B.sos_sign = (P, o) => {
  const cells = [];
  const cx = 0.34, cz = 0.36, gap = 0.45, lw = cx * 5;
  const total = lw * 3 + gap * 2;
  'SOS'.split('').forEach((ch, li) => {
    const x0 = -total / 2 + li * (lw + gap) + cx / 2, z0 = -cz * 3;
    FONT[ch].forEach((row, r) => [...row].forEach((c, k) => { if (c === 'X') cells.push([x0 + k * cx, z0 + r * cz]); }));
  });
  const order = cells.map((c, i) => [hash3(i, 3, 9), c]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  const k = cnt(order.length, o.p);
  for (let i = 0; i < k; i++) {
    const [x, z] = order[i];
    P.rock(x + P.rng.float(-0.03, 0.03), 0.07, z + P.rng.float(-0.03, 0.03), 0.23, 0.11, 0.21, P.jit(COL.stoneW, 0.1), P.rng.float(0, 3), 0.25);
  }
};

B.windbreak = (P, o) => {
  const p = o.p;
  const xs = [-1.5, -0.5, 0.5, 1.5];
  const np = cnt(4, fr(p, 0, 0.35));
  const hs = [1.55, 1.45, 1.6, 1.5];
  for (let i = 0; i < np; i++) P.pole([xs[i], 0, 0], [xs[i] + 0.02, hs[i], 0], 0.055, 0.04, COL.wood, 5);
  if (fr(p, 0.2, 0.5) > 0) for (const y of [0.3, 1.3]) {
    const n2 = Math.max(0, np - 1);
    for (let i = 0; i < n2; i++) P.pole([xs[i], y, 0.03], [xs[i + 1], y + 0.02, 0.03], 0.035, 0.035, COL.woodD, 4);
  }
  for (let i = 0; i < 3; i++) {
    const f = fr(p, 0.4 + i * 0.15, 0.55 + i * 0.15);
    if (f > 0) P.roof([xs[i] + 0.04, 1.4, 0.02], [xs[i + 1] - 0.04, 1.4, 0.02], [xs[i + 1] - 0.04, 0.12, 0.02], [xs[i] + 0.04, 0.12, 0.02], o.kind, f, 6);
  }
};

B.lean_to = (P, o) => {
  const p = o.p, fx = [-1.1, 1.1];
  const fp = fr(p, 0, 0.3);
  if (fp > 0) for (const x of fx) P.pole([x, 0, 0.9], [x, 1.7, 0.9], 0.06, 0.05, COL.wood, 5);
  const fr2 = fr(p, 0.15, 0.55);
  if (fr2 > 0) {
    P.pole([-1.25, 1.7, 0.9], [1.25, 1.72, 0.9], 0.05, 0.05, COL.woodD, 5);
    const nr = cnt(5, fr2);
    for (let i = 0; i < nr; i++) {
      const x = -1.1 + i * 0.55;
      P.pole([x, 1.7, 0.9], [x, 0.05, -1.15], 0.045, 0.04, COL.wood, 5);
    }
    if (fr2 > 0.5) P.pole([-1.15, 0.85, -0.1], [1.15, 0.85, -0.1], 0.035, 0.035, COL.woodD, 4);
    for (const x of fx) P.knot(x, 1.7, 0.9);
  }
  P.roof([-1.3, 1.78, 1.0], [1.3, 1.78, 1.0], [1.3, 0.1, -1.2], [-1.3, 0.1, -1.2], o.kind, fr(p, 0.55, 1), 8);
  if (p > 0.9) bundle(P, 0, 0.1, 0.12, 0.8, COL.straw, 10);
};

B.a_frame = (P, o) => {
  const p = o.p;
  const zs = [-1.45, -0.87, -0.29, 0.29, 0.87, 1.45];
  const nr = cnt(zs.length, fr(p, 0, 0.45));
  for (let i = 0; i < nr; i++) {
    const z = zs[i];
    P.pole([-1.25, 0, z], [0.02, 1.85, z], 0.05, 0.04, COL.wood, 5);
    P.pole([1.25, 0, z], [-0.02, 1.85, z], 0.05, 0.04, COL.wood, 5);
  }
  if (fr(p, 0.15, 0.5) > 0) P.pole([0, 1.8, -1.7], [0, 1.8, 1.7], 0.06, 0.06, COL.woodD, 6);
  const rf = fr(p, 0.45, 0.95);
  P.roof([0, 1.86, -1.7], [0, 1.86, 1.7], [-1.45, 0.0, 1.7], [-1.45, 0.0, -1.7], o.kind, rf, 9);
  P.roof([0, 1.86, 1.7], [0, 1.86, -1.7], [1.45, 0.0, -1.7], [1.45, 0.0, 1.7], o.kind, rf, 9);
  if (fr(p, 0.8, 1) > 0) P.roof([0, 1.8, -1.72], [0, 1.8, -1.72], [1.2, 0.02, -1.72], [-1.2, 0.02, -1.72], o.kind, fr(p, 0.8, 1), 7);
  if (p > 0.9) { P.rock(0, 0.1, -0.2, 0.7, 0.12, 1.1, COL.straw, 0, 0.15); bundle(P, 0, 0.1, 0.22, 0.8, COL.straw2, 22); }
};

B.tent = (P, o) => {
  const p = o.p, rx = 1.25, ry = 1.2, rz = 1.05;
  const fab = C(o.materials.tent === 'green' ? '#4d8a3c' : '#e46a1a');
  P.disc(0, 0.01, 0, rx * 1.02, rz * 1.02, 0.02, C('#3a3a34'), 12);
  const pc = fr(p, 0, 0.5);
  const arc = (fn, n = 12) => {
    const k = cnt(n, pc);
    for (let i = 0; i < k; i++) { const a = fn(i / n), b = fn((i + 1) / n); P.pole(a, b, 0.024, 0.024, C('#2d2d2d'), 4, false); }
  };
  arc((t) => [-rx * 1.03 * Math.cos(t * Math.PI), ry * 1.04 * Math.sin(t * Math.PI), 0]);
  arc((t) => [0, ry * 1.04 * Math.sin(t * Math.PI), -rz * 1.03 * Math.cos(t * Math.PI)]);
  const ff = fr(p, 0.35, 1);
  if (ff > 0) {
    const g = new THREE.SphereGeometry(1, 12, 5, -Math.PI / 2, Math.PI * 2 * ff, 0, Math.PI / 2);
    P.geo(g, new THREE.Matrix4().compose(new V3(0, 0, 0), new THREE.Quaternion(), new V3(rx, ry, rz)), fab, { vary: 0.08, grad: 0.35 });
  }
  if (ff >= 0.99) {
    // door arch on the front (+z)
    const zAt = (x, y) => rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2)) + 0.025;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const x = -0.44 + (0.88 * i) / 8; pts.push([x, 0.03 + 0.55 + 0.3 * (1 - (x / 0.44) ** 2)]); }
    pts.unshift([-0.44, 0.03]); pts.push([0.44, 0.03]);
    const ctr = [0, 0.4, zAt(0, 0.4)];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      P.tri(ctr, [a[0], a[1], zAt(a[0], a[1])], [b[0], b[1], zAt(b[0], b[1])], C('#2a2217'), C('#3b3326'), C('#3b3326'));
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const peg = [sx * 1.95, 0, sz * 1.6];
      P.pole([sx * 0.95, 0.55, sz * 0.8], [peg[0], 0.04, peg[2]], 0.008, 0.008, COL.rope, 3, false);
      P.pole([peg[0], 0.0, peg[2]], [peg[0] + sx * 0.06, 0.2, peg[2] + sz * 0.06], 0.02, 0.016, COL.woodL, 4);
    }
  }
};

B.grass_bed = (P, o) => {
  const p = o.p;
  const k = fr(p, 0, 0.5);
  if (k > 0) P.geo(new THREE.IcosahedronGeometry(1, 1), new THREE.Matrix4().compose(new V3(0, 0.06, 0), new THREE.Quaternion(), new V3(0.58, 0.1 * (0.4 + 0.6 * k), 1.0)), COL.straw2, { warp: 0.12, vary: 0.06 });
  const n = cnt(70, fr(p, 0.15, 1));
  for (let i = 0; i < n; i++) {
    const x = P.rng.float(-0.55, 0.55), z = P.rng.float(-0.95, 0.95);
    if ((x / 0.58) ** 2 + (z / 1.0) ** 2 > 1) continue;
    P.blade(x, 0.08, z, P.rng.float(0, 6.28), P.rng.float(0.14, 0.3), 0.03, P.rng.float(0.05, 0.22), P.jit(COL.straw2, 0.1), P.jit(COL.straw, 0.14));
  }
  if (p > 0.85) P.geo(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 6), new THREE.Matrix4().compose(new V3(0, 0.2, -0.78), new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), Math.PI / 2), new V3(1, 1, 1)), COL.straw, { vary: 0.05 });
};

B.drying_rack = (P, o) => {
  const p = o.p;
  const nl = cnt(2, fr(p, 0, 0.4));
  for (let i = 0; i < nl; i++) {
    const x = i ? 1.0 : -1.0;
    P.pole([x, 0, 0.4], [x, 1.5, 0.02], 0.05, 0.04, COL.wood, 5);
    P.pole([x, 0, -0.4], [x, 1.5, -0.02], 0.05, 0.04, COL.wood, 5);
    P.knot(x, 1.48, 0);
  }
  if (fr(p, 0.35, 0.7) > 0) {
    P.pole([-1.15, 1.5, 0], [1.15, 1.5, 0], 0.04, 0.04, COL.woodD, 5);
    P.pole([-1.05, 0.9, 0.15], [1.05, 0.9, 0.15], 0.03, 0.03, COL.woodD, 4);
    P.pole([-1.05, 0.9, -0.15], [1.05, 0.9, -0.15], 0.03, 0.03, COL.woodD, 4);
  }
  const nf = cnt(7, fr(p, 0.65, 1));
  for (let i = 0; i < nf; i++) { // hanging fish / strips
    const x = -0.85 + i * 0.28;
    P.pole([x, 1.5, 0], [x, 1.2, 0], 0.008, 0.008, COL.rope, 3, false);
    P.geo(new THREE.IcosahedronGeometry(1, 0), new THREE.Matrix4().compose(new V3(x, 1.0, 0), new THREE.Quaternion().setFromAxisAngle(UP, i), new V3(0.03, 0.2, 0.09)), i % 3 === 0 ? C('#9c6a46') : C('#c98a5a'), { vary: 0.08 });
  }
};

function sheetFunnel(P, corners, ctr, kind, frac) {
  const [ca, cb] = ROOF[kind] || ROOF.palm;
  const n = cnt(4, frac);
  for (let i = 0; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    P.tri(a, b, ctr, P.jit(i % 2 ? ca : cb, 0.05), P.jit(ca, 0.05), cb.clone().multiplyScalar(0.8));
  }
}
B.rain_catcher = (P, o) => {
  const p = o.p, h = 1.25, s = 0.65;
  const cs = [[-s, h, -s], [s, h, -s], [s, h, s], [-s, h, s]];
  const np = cnt(4, fr(p, 0, 0.4));
  for (let i = 0; i < np; i++) { const c = cs[i]; P.pole([c[0] * 1.05, 0, c[2] * 1.05], [c[0], h + 0.08, c[2]], 0.045, 0.035, COL.wood, 5); }
  if (fr(p, 0.35, 0.6) > 0) for (let i = 0; i < np; i++) { const a = cs[i], b = cs[(i + 1) % 4]; if (i < np - 1 || np === 4) P.pole([a[0], h, a[2]], [b[0], h, b[2]], 0.03, 0.03, COL.woodD, 4); }
  // pot
  if (fr(p, 0.5, 0.75) > 0) {
    P.geo(new THREE.CylinderGeometry(0.2, 0.13, 0.34, 8, 1, true), new THREE.Matrix4().makeTranslation(0, 0.17, 0), COL.clay, { vary: 0.05 });
    P.disc(0, 0.01, 0, 0.13, 0.13, 0.02, COL.clay, 8);
    P.disc(0, 0.28, 0, 0.17, 0.17, 0.02, C('#3b6fa0'), 8);
  }
  sheetFunnel(P, cs, [0, 0.55, 0], o.kind === 'palm' ? 'tarp' : o.kind, fr(p, 0.7, 1));
};
B.rain_tank = (P, o) => {
  const p = o.p, h = 1.65, s = 1.0;
  const cs = [[-s, h, -s], [s, h, -s], [s, h, s], [-s, h, s]];
  const np = cnt(4, fr(p, 0, 0.35));
  for (let i = 0; i < np; i++) { const c = cs[i]; P.pole([c[0] * 1.05, 0, c[2] * 1.05], [c[0], h + 0.1, c[2]], 0.06, 0.045, COL.wood, 5); }
  if (fr(p, 0.3, 0.55) > 0) for (let i = 0; i < 4; i++) { const a = cs[i], b = cs[(i + 1) % 4]; P.pole([a[0], h, a[2]], [b[0], h, b[2]], 0.04, 0.04, COL.woodD, 4); }
  if (fr(p, 0.45, 0.7) > 0) {
    P.geo(new THREE.CylinderGeometry(0.46, 0.5, 1.0, 10, 1, true), new THREE.Matrix4().makeTranslation(0, 0.5, 0), COL.wood, { vary: 0.07, grad: 0.2 });
    for (const y of [0.15, 0.5, 0.88]) P.geo(new THREE.CylinderGeometry(0.505, 0.505, 0.04, 10, 1, true), new THREE.Matrix4().makeTranslation(0, y, 0), COL.stone.clone().multiplyScalar(0.5), { vary: 0.02 });
    P.disc(0, 0.9, 0, 0.42, 0.42, 0.03, C('#3b6fa0'), 10);
  }
  sheetFunnel(P, cs, [0, 1.05, 0], o.kind === 'palm' ? 'tarp' : o.kind, fr(p, 0.7, 1));
};

B.bamboo_hut = (P, o) => {
  const p = o.p, dh = 0.42;
  const stilts = [[-1.35, -1.5], [1.35, -1.5], [-1.35, 0], [1.35, 0], [-1.35, 1.5], [1.35, 1.5]];
  const ns = cnt(6, fr(p, 0, 0.2));
  for (let i = 0; i < ns; i++) bambooPole(P, [stilts[i][0], 0, stilts[i][1]], [stilts[i][0], dh + 0.02, stilts[i][1]], 0.06);
  const nd = cnt(15, fr(p, 0.15, 0.4));
  for (let i = 0; i < nd; i++) P.box(0, dh + 0.03, -1.65 + i * 0.235, 2.95, 0.06, 0.2, i % 2 ? COL.bamboo : COL.bambooD, 0, 0.05);
  const posts = [[-1.4, -1.65], [1.4, -1.65], [-1.4, 1.65], [1.4, 1.65]];
  const np = cnt(4, fr(p, 0.35, 0.55));
  for (let i = 0; i < np; i++) bambooPole(P, [posts[i][0], dh, posts[i][1]], [posts[i][0], 1.8, posts[i][1]], 0.055);
  const wall = (a, b, f) => P.roof([a[0], 1.55, a[1]], [b[0], 1.55, b[1]], [b[0], dh + 0.05, b[1]], [a[0], dh + 0.05, a[1]], 'mat', f, 5);
  const wf = fr(p, 0.5, 0.7);
  wall([-1.4, -1.65], [1.4, -1.65], wf); wall([-1.4, -1.65], [-1.4, 1.65], wf); wall([1.4, 1.65], [1.4, -1.65], wf);
  wall([-1.4, 1.65], [-0.5, 1.65], wf); wall([0.5, 1.65], [1.4, 1.65], wf);
  if (fr(p, 0.6, 0.75) > 0) P.pole([0, 2.5, -1.9], [0, 2.5, 1.9], 0.06, 0.06, COL.bambooD, 5);
  const rf = fr(p, 0.7, 1);
  P.roof([0, 2.55, -1.9], [0, 2.55, 1.9], [-1.85, 1.45, 1.9], [-1.85, 1.45, -1.9], o.kind, rf, 7);
  P.roof([0, 2.55, 1.9], [0, 2.55, -1.9], [1.85, 1.45, -1.9], [1.85, 1.45, 1.9], o.kind, rf, 7);
  if (rf > 0.9) { // gables
    P.roof([0, 2.45, -1.66], [0, 2.45, -1.66], [1.4, 1.55, -1.66], [-1.4, 1.55, -1.66], 'mat', 1, 3);
    P.roof([0, 2.45, 1.66], [0, 2.45, 1.66], [1.4, 1.55, 1.66], [-1.4, 1.55, 1.66], 'mat', 1, 3);
    P.box(0, 0.8, 1.55, 0.8, 1.0, 0.02, COL.dark);
    // ladder
    for (const x of [-0.3, 0.3]) bambooPole(P, [x, dh + 0.1, 1.8], [x, 0.0, 2.25], 0.035);
    for (let i = 0; i < 3; i++) P.box(0, 0.12 + i * 0.1, 2.0 + (2 - i) * 0.12 + 0.06, 0.62, 0.035, 0.04, COL.bambooD);
  }
};
function bambooPole(P, a, b, r) {
  const A = new V3(...a), Bv = new V3(...b), len = A.distanceTo(Bv), n = Math.max(1, Math.round(len / 0.5));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    P.pole(lerp3(a, b, t0), lerp3(a, b, t1 - 0.01), r, r, i % 2 ? COL.bamboo : COL.bambooD, 5, i === n - 1);
    if (i > 0) { const q = lerp3(a, b, t0); P.disc(q[0], q[1], q[2], r * 1.25, r * 1.25, 0.03, COL.bambooD, 5); }
  }
}

B.log_cabin = (P, o) => {
  const p = o.p, layers = 7, r = 0.125, dy = 0.235;
  const nl = cnt(layers, fr(p, 0, 0.6));
  for (let i = 0; i < nl; i++) {
    const y = r + i * dy, e = 0.17;
    const col = (j) => (((i + j) % 2) ? COL.wood : COL.woodL);
    const doorLayer = y < 1.4;
    // sides (along z) and back/front (along x), ends project past the corners
    P.pole([-1.72, y, -1.62 - e], [-1.72, y, 1.62 + e], r, r, col(0), 6);
    P.pole([1.72, y, -1.62 - e], [1.72, y, 1.62 + e], r, r, col(1), 6);
    P.pole([-1.8 - e, y + dy / 2, -1.55], [1.8 + e, y + dy / 2, -1.55], r, r, col(1), 6);
    if (doorLayer) {
      P.pole([-1.8 - e, y + dy / 2, 1.55], [-0.5, y + dy / 2, 1.55], r, r, col(0), 6);
      P.pole([0.5, y + dy / 2, 1.55], [1.8 + e, y + dy / 2, 1.55], r, r, col(0), 6);
    } else P.pole([-1.8 - e, y + dy / 2, 1.55], [1.8 + e, y + dy / 2, 1.55], r, r, col(0), 6);
  }
  const wallTop = r + layers * dy;
  if (nl >= 3) { // door frame + dark interior
    P.pole([-0.5, 0, 1.55], [-0.5, 1.45, 1.55], 0.06, 0.06, COL.woodD, 5);
    P.pole([0.5, 0, 1.55], [0.5, 1.45, 1.55], 0.06, 0.06, COL.woodD, 5);
    P.box(0, 1.46, 1.55, 1.1, 0.09, 0.14, COL.woodD);
    P.box(0, 0.7, 1.45, 0.96, 1.4, 0.02, COL.dark);
  }
  const rf = fr(p, 0.6, 0.95);
  if (rf > 0) P.pole([0, 2.85, -1.95], [0, 2.85, 1.95], 0.07, 0.07, COL.woodD, 6);
  P.roof([0, 2.9, -2.0], [0, 2.9, 2.0], [-2.05, wallTop - 0.05, 2.0], [-2.05, wallTop - 0.05, -2.0], o.kind, rf, 8);
  P.roof([0, 2.9, 2.0], [0, 2.9, -2.0], [2.05, wallTop - 0.05, -2.0], [2.05, wallTop - 0.05, 2.0], o.kind, rf, 8);
  if (rf > 0.8) {
    P.roof([0, 2.85, -1.6], [0, 2.85, -1.6], [1.8, wallTop, -1.6], [-1.8, wallTop, -1.6], 'bark', 1, 3);
    P.roof([0, 2.85, 1.6], [0, 2.85, 1.6], [1.8, wallTop, 1.6], [-1.8, wallTop, 1.6], 'bark', 1, 3);
  }
  const nc = cnt(11, fr(p, 0.88, 1)); // stone chimney at the back right
  for (let i = 0; i < nc; i++) P.rock(1.25 + (i % 2) * 0.08, 0.18 + i * 0.27, -1.05 - (i % 3) * 0.04, 0.34, 0.17, 0.3, P.jit(i % 2 ? COL.stone : COL.stoneL, 0.1), i);
};

B.workbench = (P, o) => {
  const p = o.p;
  const legs = [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]];
  const nl = cnt(4, fr(p, 0, 0.35));
  for (let i = 0; i < nl; i++) P.pole([legs[i][0], 0, legs[i][1]], [legs[i][0], 0.82, legs[i][1]], 0.06, 0.05, COL.wood, 5);
  const bk = fr(p, 0.25, 0.5);
  if (bk > 0) {
    for (const x of [-0.8, 0.8]) P.pole([x, 0.28, -0.3], [x, 0.28, 0.3], 0.035, 0.035, COL.woodD, 4);
    P.pole([-0.8, 0.28, -0.3], [0.8, 0.28, -0.3], 0.035, 0.035, COL.woodD, 4);
    P.pole([-0.8, 0.28, 0.3], [0.8, 0.28, 0.3], 0.035, 0.035, COL.woodD, 4);
  }
  const nb = cnt(3, fr(p, 0.45, 0.75));
  for (let i = 0; i < nb; i++) P.box(0, 0.86, -0.27 + i * 0.27, 1.8, 0.07, 0.25, i % 2 ? COL.woodL : COL.wood, 0, 0.05);
  if (fr(p, 0.7, 1) > 0) {
    for (const x of [-0.8, 0.8]) P.pole([x, 0.8, -0.3], [x, 1.55, -0.3], 0.05, 0.04, COL.wood, 5);
    P.pole([-0.9, 1.45, -0.3], [0.9, 1.45, -0.3], 0.03, 0.03, COL.woodD, 4);
    P.rock(-0.35, 0.93, 0.05, 0.33, 0.06, 0.25, COL.stoneL, 0.3, 0.1);                   // flat stone
    P.box(0.55, 0.92, 0.1, 0.22, 0.1, 0.12, COL.woodD);                                      // vise block
    // hanging tools
    P.pole([-0.5, 1.45, -0.3], [-0.5, 1.05, -0.3], 0.02, 0.02, COL.wood, 4, false); P.box(-0.5, 1.0, -0.3, 0.2, 0.09, 0.04, COL.stone);
    P.pole([0.1, 1.45, -0.3], [0.1, 1.0, -0.3], 0.018, 0.018, COL.woodD, 4, false); P.box(0.1, 0.97, -0.3, 0.05, 0.1, 0.02, C('#b7b7b0'));
    P.pole([0.55, 1.45, -0.3], [0.55, 1.05, -0.3], 0.02, 0.02, COL.wood, 4, false); P.box(0.55, 1.0, -0.3, 0.14, 0.12, 0.05, COL.stoneL);
  }
};

B.smoker = (P, o) => {
  const p = o.p;
  stoneRing(P, 0.55, 8, 0.14, fr(p, 0, 0.2));
  if (fr(p, 0, 0.2) > 0.5) P.disc(0, 0.02, 0, 0.4, 0.4, 0.03, COL.ash, 8);
  const cs = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
  const np = cnt(4, fr(p, 0.15, 0.45));
  for (let i = 0; i < np; i++) P.pole([cs[i][0], 0, cs[i][1]], [cs[i][0] * 0.45, 1.9, cs[i][1] * 0.45], 0.05, 0.04, COL.wood, 5);
  if (fr(p, 0.4, 0.65) > 0) for (const y of [0.9, 1.35, 1.75]) {
    const s = 1 - y / 1.9 * 0.55;
    P.pole([-0.7 * s, y, -0.64 * s], [0.7 * s, y, -0.64 * s], 0.025, 0.025, COL.woodD, 4);
    P.pole([-0.7 * s, y, 0.7 * s], [0.7 * s, y, 0.7 * s], 0.025, 0.025, COL.woodD, 4);
  }
  const wf = fr(p, 0.6, 1);
  const k = 0.45;
  P.roof([-0.7 * k, 1.85, -0.7 * k], [0.7 * k, 1.85, -0.7 * k], [0.7, 0.45, -0.7], [-0.7, 0.45, -0.7], 'bark', wf, 5);
  P.roof([-0.7 * k, 1.85, -0.7 * k], [-0.7 * k, 1.85, 0.7 * k], [-0.7, 0.45, 0.7], [-0.7, 0.45, -0.7], 'bark', wf, 5);
  P.roof([0.7 * k, 1.85, 0.7 * k], [0.7 * k, 1.85, -0.7 * k], [0.7, 0.45, -0.7], [0.7, 0.45, 0.7], 'bark', wf, 5);
  if (wf > 0.8) {
    P.roof([-0.7 * k, 1.9, 0.7 * k], [0.7 * k, 1.9, 0.7 * k], [0.7 * k, 1.9, -0.7 * k], [-0.7 * k, 1.9, -0.7 * k], 'bark', 1, 1);
    for (let i = 0; i < 4; i++) P.geo(new THREE.IcosahedronGeometry(1, 0), new THREE.Matrix4().compose(new V3(-0.3 + i * 0.2, 1.2, 0.5), new THREE.Quaternion(), new V3(0.035, 0.17, 0.08)), C('#8a5a3a'), { vary: 0.1 });
  }
};

B.larder = (P, o) => {
  const p = o.p;
  const cs = [[-0.7, -0.6, 1.7], [0.7, -0.6, 1.7], [-0.7, 0.6, 1.95], [0.7, 0.6, 1.95]];
  const np = cnt(4, fr(p, 0, 0.35));
  for (let i = 0; i < np; i++) P.pole([cs[i][0], 0, cs[i][1]], [cs[i][0], cs[i][2], cs[i][1]], 0.055, 0.045, COL.wood, 5);
  if (fr(p, 0.3, 0.55) > 0) {
    P.box(0, 0.62, 0, 1.5, 0.06, 1.3, COL.woodL);
    P.box(0, 1.08, 0, 1.45, 0.05, 1.25, COL.woodL);
    P.box(0, 1.5, -0.55, 1.5, 0.05, 0.1, COL.woodL);
  }
  const wf = fr(p, 0.5, 0.75);
  if (wf > 0) {
    for (let i = 0; i < cnt(8, wf); i++) P.box(-0.72 + i * 0.205, 1.0, -0.62, 0.17, 0.82, 0.04, i % 2 ? COL.wood : COL.woodL, 0, 0.06);
    for (const s of [-1, 1]) for (let i = 0; i < cnt(5, wf); i++) P.box(s * 0.72, 0.95, -0.4 + i * 0.28, 0.04, 0.7, 0.24, i % 2 ? COL.wood : COL.woodL, 0, 0.06);
  }
  P.roof([-0.9, 2.05, 0.75], [0.9, 2.05, 0.75], [0.9, 1.65, -0.8], [-0.9, 1.65, -0.8], o.kind, fr(p, 0.75, 1), 5);
  if (p > 0.9) {
    for (const [x, y] of [[-0.35, 0.65], [0.3, 0.65], [-0.2, 1.1], [0.4, 1.1]]) P.geo(new THREE.CylinderGeometry(0.16, 0.12, 0.2, 7), new THREE.Matrix4().makeTranslation(x, y + 0.1, 0.1), y > 1 ? COL.clay : C('#a58c5e'), { vary: 0.08 });
    P.geo(new THREE.IcosahedronGeometry(1, 0), new THREE.Matrix4().compose(new V3(0.1, 1.2, 0.2), new THREE.Quaternion(), new V3(0.22, 0.08, 0.1)), C('#c98a5a'), { vary: 0.1 });
  }
};

B.wood_shed = (P, o) => {
  const p = o.p;
  const cs = [[-0.85, -0.4, 1.15], [0.85, -0.4, 1.15], [-0.85, 0.4, 1.45], [0.85, 0.4, 1.45]];
  const np = cnt(4, fr(p, 0, 0.3));
  for (let i = 0; i < np; i++) P.pole([cs[i][0], 0, cs[i][1]], [cs[i][0], cs[i][2], cs[i][1]], 0.055, 0.045, COL.wood, 5);
  if (fr(p, 0.25, 0.5) > 0) {
    P.pole([-0.9, 1.15, -0.4], [0.9, 1.15, -0.4], 0.04, 0.04, COL.woodD, 4);
    P.pole([-0.9, 1.45, 0.4], [0.9, 1.45, 0.4], 0.04, 0.04, COL.woodD, 4);
    P.pole([-0.85, 0.3, -0.4], [0.85, 0.3, -0.4], 0.035, 0.035, COL.woodD, 4);
  }
  const nlg = cnt(16, fr(p, 0.5, 0.85));
  const rows = [6, 5, 5];
  let k = 0;
  for (let r = 0; r < 3 && k < nlg; r++) for (let i = 0; i < rows[r] && k < nlg; i++, k++) {
    P.pole([-0.72 + i * 0.28 + (r % 2) * 0.12, 0.12 + r * 0.19, -0.1], [-0.72 + i * 0.28 + (r % 2) * 0.12, 0.12 + r * 0.19, 0.28 + P.rng.float(-0.04, 0.04)], 0.1, 0.1, k % 2 ? COL.woodL : COL.wood, 6);
  }
  P.roof([-1.0, 1.55, 0.6], [1.0, 1.55, 0.6], [1.0, 1.1, -0.55], [-1.0, 1.1, -0.55], o.kind, fr(p, 0.75, 1), 5);
};

B.fence = (P, o) => {
  const p = o.p;
  const xs = [-1.5, -0.75, 0, 0.75, 1.5];
  const np = cnt(5, fr(p, 0, 0.6));
  for (let i = 0; i < np; i++) { const h = 1.2 + P.rng.float(-0.08, 0.08); P.pole([xs[i], 0, 0], [xs[i], h, 0], 0.06, 0.012, COL.wood, 5); }
  const rails = cnt(2, fr(p, 0.5, 1));
  for (let k = 0; k < rails; k++) for (let i = 0; i < np - 1; i++) {
    const y = 0.4 + k * 0.45;
    P.pole([xs[i], y, 0.07], [xs[i + 1], y + 0.02, 0.07], 0.035, 0.035, COL.woodD, 4);
    P.knot(xs[i], y, 0.07, 0.06);
  }
};

B.hammock = (P, o) => {
  const p = o.p;
  const pc = cnt(2, fr(p, 0, 0.3));
  for (let i = 0; i < pc; i++) P.pole([i ? 1.55 : -1.55, 0, 0], [i ? 1.5 : -1.5, 1.7, 0], 0.08, 0.06, COL.wood, 6);
  const f = fr(p, 0.3, 1);
  if (f > 0) {
    const N = 12, sag = 0.5;
    const pt = (t, side) => { // t -1..1 along, side -1..1 across
      const x = t * 1.35, y = 1.15 - sag * (1 - t * t), w = (0.1 + 0.38 * (1 - t * t) ** 0.6) * side;
      return [x, y - 0.1 * (1 - Math.abs(side)) * (1 - t * t), w];
    };
    const n = cnt(N, f);
    for (let i = 0; i < n; i++) {
      const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
      const col = C(i % 2 ? '#c9a063' : '#a98250');
      P.quad(pt(t0, -1), pt(t1, -1), pt(t1, 0), pt(t0, 0), P.jit(col, 0.04));
      P.quad(pt(t0, 0), pt(t1, 0), pt(t1, 1), pt(t0, 1), P.jit(col, 0.04));
    }
    if (f > 0.9) for (const s of [-1, 1]) {
      for (const sd of [-0.1, 0.1]) P.pole([s * 1.5, 1.55, 0], [s * 1.38, 1.13, sd], 0.012, 0.012, COL.rope, 3, false);
      P.knot(s * 1.5, 1.58, 0, 0.1);
    }
  }
};

B.raised_bed = (P, o) => {
  const p = o.p;
  const cs = [[-0.5, -0.9], [0.5, -0.9], [-0.5, 0.9], [0.5, 0.9]];
  const np = cnt(4, fr(p, 0, 0.35));
  for (let i = 0; i < np; i++) P.pole([cs[i][0], 0, cs[i][1]], [cs[i][0], 0.55, cs[i][1]], 0.05, 0.045, COL.wood, 5);
  if (fr(p, 0.3, 0.55) > 0) {
    for (const x of [-0.5, 0.5]) P.pole([x, 0.5, -0.95], [x, 0.5, 0.95], 0.04, 0.04, COL.woodD, 4);
    for (const z of [-0.9, 0.9]) P.pole([-0.55, 0.5, z], [0.55, 0.5, z], 0.04, 0.04, COL.woodD, 4);
  }
  const ns = cnt(8, fr(p, 0.5, 0.8));
  for (let i = 0; i < ns; i++) P.pole([-0.52, 0.56, -0.84 + i * 0.24], [0.52, 0.56, -0.84 + i * 0.24], 0.035, 0.035, i % 2 ? COL.wood : COL.woodL, 4);
  const bf = fr(p, 0.8, 1);
  if (bf > 0) {
    P.geo(new THREE.IcosahedronGeometry(1, 1), new THREE.Matrix4().compose(new V3(0, 0.66, 0.05), new THREE.Quaternion(), new V3(0.48, 0.1, 0.9)), COL.straw2, { warp: 0.12 });
    for (let i = 0; i < cnt(30, bf); i++) P.blade(P.rng.float(-0.4, 0.4), 0.7, P.rng.float(-0.75, 0.8), P.rng.float(0, 6.28), 0.18, 0.03, 0.15, COL.straw2, COL.straw);
  }
};

B.cave_home = (P, o) => {
  const p = o.p;
  const rows = 5, ph = 0.34;
  const nr = cnt(rows, fr(p, 0, 0.7));
  for (let r = 0; r < nr; r++) {
    const y = 0.17 + r * ph;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = -1.7 + (i + 0.5) * (3.4 / n) + (r % 2 ? 0.2 : 0);
      if (Math.abs(x) < 0.58 && y < 1.7) continue; // doorway
      if (x > 1.75) continue;
      P.rock(x, y, P.rng.float(-0.05, 0.05), 0.27, 0.19, 0.32, P.jit(r % 2 ? COL.stone : COL.stoneL, 0.1), P.rng.float(0, 3), 0.28);
    }
  }
  const df = fr(p, 0.65, 1);
  if (df > 0) {
    P.pole([-0.55, 0, 0.05], [-0.55, 1.75, 0.05], 0.07, 0.06, COL.wood, 5);
    P.pole([0.55, 0, 0.05], [0.55, 1.75, 0.05], 0.07, 0.06, COL.wood, 5);
    P.pole([-0.6, 1.72, 0.05], [0.6, 1.72, 0.05], 0.06, 0.06, COL.woodD, 5);
    for (let i = 0; i < cnt(8, df); i++) P.pole([-0.45 + i * 0.13, 0.05, 0.1], [-0.45 + i * 0.13, 1.65, 0.1], 0.04, 0.04, i % 2 ? COL.wood : COL.woodL, 5);
    if (df > 0.6) { P.pole([-0.5, 0.5, 0.14], [0.5, 0.5, 0.14], 0.02, 0.02, COL.rope, 3, false); P.pole([-0.5, 1.2, 0.14], [0.5, 1.2, 0.14], 0.02, 0.02, COL.rope, 3, false); }
  }
};

B.raft = (P, o) => {
  const p = o.p;
  const nl = cnt(8, fr(p, 0, 0.6));
  for (let i = 0; i < nl; i++) {
    const x = -1.05 + i * 0.3, len = 1.6 + P.rng.float(-0.05, 0.08) - Math.abs(i - 3.5) * 0.0;
    P.pole([x, 0.17, -len], [x, 0.17, len], 0.15, 0.14, i % 2 ? COL.wood : COL.woodL, 7);
  }
  const nb = cnt(2, fr(p, 0.55, 0.85));
  for (let i = 0; i < nb; i++) {
    const z = i ? 0.95 : -0.95;
    P.pole([-1.3, 0.36, z], [1.3, 0.36, z], 0.06, 0.06, COL.woodD, 5);
    if (fr(p, 0.8, 1) > 0) for (let k = 0; k < 8; k++) P.knot(-1.05 + k * 0.3, 0.37, z, 0.09);
  }
  if (fr(p, 0.9, 1) > 0) P.pole([0, 0.3, 1.2], [0, 0.35, -1.4], 0.03, 0.03, COL.woodL, 4); // paddle shaft laid on top
};

B.calendar_post = (P, o) => {
  const p = o.p;
  stoneRing(P, 0.28, 6, 0.1, fr(p, 0, 0.3));
  P.pole([0, 0, 0], [0, 1.8 * Math.min(1, fr(p, 0, 0.4) + 0.001), 0], 0.08, 0.065, COL.wood, 6);
  if (fr(p, 0.4, 1) > 0) {
    P.geo(new THREE.IcosahedronGeometry(1, 0), new THREE.Matrix4().compose(new V3(0, 1.88, 0), new THREE.Quaternion(), new V3(0.1, 0.13, 0.1)), COL.woodL, { warp: 0.2 });
    const n = cnt(12, fr(p, 0.4, 1));
    for (let i = 0; i < n; i++) { // tally notches: groups of 4 + a slash
      const g = Math.floor(i / 5), k = i % 5;
      if (k < 4) P.box(-0.05 + k * 0.035, 1.55 - g * 0.12, 0.07, 0.014, 0.08, 0.02, COL.dark);
      else P.box(0, 1.55 - g * 0.12, 0.075, 0.16, 0.014, 0.02, COL.dark, 0.0);
    }
    P.pole([0.0, 1.35, 0.0], [0.28, 1.3, 0.05], 0.012, 0.012, COL.rope, 3, false);
  }
};

B.memorial = (P, o) => {
  const p = o.p;
  const sizes = [[0.5, 0.0, 5], [0.38, 0.2, 4], [0.26, 0.4, 3]];
  let n = cnt(12, p);
  for (const [r, y, c] of sizes) for (let i = 0; i < c && n > 0; i++, n--) {
    const a = (i / c) * 6.28 + y * 5;
    P.rock(Math.cos(a) * r * (c > 3 ? 0.8 : 0.4), y + 0.12, Math.sin(a) * r * (c > 3 ? 0.8 : 0.4), 0.22, 0.16, 0.22, P.jit(i % 2 ? COL.stone : COL.stoneL, 0.1), a);
  }
  if (p > 0.9) {
    P.pole([0, 0.3, 0], [0, 1.0, 0], 0.035, 0.03, COL.wood, 5); P.pole([-0.15, 0.82, 0], [0.15, 0.84, 0], 0.025, 0.025, COL.wood, 4);
    for (const [x, z, c] of [[0.35, 0.3, '#e8587a'], [-0.3, 0.35, '#f5d04c'], [0.1, 0.45, '#ffffff']]) P.rock(x, 0.05, z, 0.05, 0.04, 0.05, C(c), 0, 0.1);
  }
};

B.garden = (P, o) => {
  const p = o.p;
  const sf = fr(p, 0, 0.4);
  if (sf > 0) P.box(0, 0.05, 0, 1.9 * sf + 0.1, 0.1, 1.9 * sf + 0.1, COL.soil, 0, 0.03);
  const rg = cnt(3, fr(p, 0.3, 0.6));
  for (let i = 0; i < rg; i++) P.box(-0.55 + i * 0.55, 0.13, 0, 0.3, 0.07, 1.7, COL.soil.clone().multiplyScalar(1.15), 0, 0.04);
  const np = cnt(4, fr(p, 0.6, 1));
  for (let i = 0; i < np; i++) {
    const x = i % 2 ? 0.55 : -0.55, z = i < 2 ? -0.5 : 0.5;
    for (let l = 0; l < 3; l++) {
      const a = l * 2.1 + i;
      P.tri([x, 0.15, z], [x + Math.cos(a) * 0.42 - 0.06, 0.38, z + Math.sin(a) * 0.42], [x + Math.cos(a) * 0.42 + 0.06, 0.34, z + Math.sin(a) * 0.42 + 0.06], P.jit(COL.leaf, 0.1), P.jit(COL.leaf, 0.15).multiplyScalar(1.2), P.jit(COL.leaf, 0.1));
    }
  }
  if (sf > 0.9) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.pole([x * 0.98, 0, z * 0.98], [x * 0.98, 0.35, z * 0.98], 0.03, 0.025, COL.wood, 4);
};

B.lookout = (P, o) => {
  const p = o.p, H = 2.6;
  const cs = [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]];
  const np = cnt(4, fr(p, 0, 0.35));
  for (let i = 0; i < np; i++) P.pole([cs[i][0] * 1.2, 0, cs[i][1] * 1.2], [cs[i][0] * 0.85, H + 0.1, cs[i][1] * 0.85], 0.09, 0.07, COL.wood, 6);
  const nb = cnt(3, fr(p, 0.3, 0.55));
  for (let i = 0; i < nb; i++) { const y = 0.7 + i * 0.7, s = 1.2 - (y / H) * 0.35; P.pole([-0.85 * s, y, -0.85 * s], [0.85 * s, y + 0.3, -0.85 * s], 0.035, 0.035, COL.woodD, 4); P.pole([-0.85 * s, y + 0.3, 0.85 * s], [0.85 * s, y, 0.85 * s], 0.035, 0.035, COL.woodD, 4); }
  for (let i = 0; i < cnt(8, fr(p, 0.5, 0.8)); i++) P.box(0, H, -0.84 + i * 0.24, 1.9, 0.06, 0.21, i % 2 ? COL.wood : COL.woodL, 0, 0.05);
  const rp = fr(p, 0.75, 1);
  if (rp > 0) for (let i = 0; i < cnt(4, rp); i++) {
    const c = cs[i], s = 0.88;
    P.pole([c[0] * s, H, c[1] * s], [c[0] * s, H + 0.95, c[1] * s], 0.03, 0.03, COL.wood, 4);
    const d = cs[(i + 1) % 4];
    if (i < 3 || rp > 0.9) P.pole([c[0] * s, H + 0.9, c[1] * s], [d[0] * s, H + 0.9, d[1] * s], 0.03, 0.03, COL.woodD, 4);
  }
  if (rp > 0.5) { for (const x of [-0.18, 0.18]) P.pole([x, 0, 1.55], [x, H, 1.0], 0.035, 0.035, COL.woodL, 4); for (let i = 0; i < 6; i++) P.box(0, 0.35 + i * 0.35, 1.5 - i * 0.09, 0.38, 0.035, 0.04, COL.wood); }
};

B.fish_weir = (P, o) => {
  const p = o.p;
  const n = cnt(8, fr(p, 0, 0.7));
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
    const x = s * (0.4 + (7 - i) * 0.22), z = -1.4 + (7 - i) * 0.3;
    const zz = -z;
    P.pole([x, 0, zz], [x + P.rng.float(-0.03, 0.03), 0.8, zz], 0.04, 0.03, COL.wood, 4);
  }
  const rk = cnt(14, fr(p, 0.3, 0.9));
  for (let i = 0; i < rk; i++) { const s = i % 2 ? -1 : 1, j = Math.floor(i / 2); P.rock(s * (0.4 + (7 - j) * 0.22), 0.1, 1.4 - (7 - j) * 0.3 - 0.0 - 0.15, 0.2, 0.12, 0.18, P.jit(COL.stone, 0.1)); }
  if (fr(p, 0.8, 1) > 0) P.geo(new THREE.CylinderGeometry(0.3, 0.22, 0.6, 8, 1, true), new THREE.Matrix4().makeTranslation(0, 0.3, -1.4), C('#b99a5a'), { vary: 0.08 });
};

B.pit_trap = (P, o) => {
  P.disc(0, 0.01, 0, 0.6, 0.6, 0.02, COL.dark, 10);
  const n = cnt(6, o.p);
  for (let i = 0; i < n; i++) P.pole([-0.55, 0.06, -0.4 + i * 0.16], [0.55, 0.06, -0.4 + i * 0.16], 0.03, 0.03, COL.wood, 4);
  if (o.p > 0.85) { bundle(P, 0, 0, 0.06, 0.5, COL.leaf, 10, { y: 0.08 }); P.pole([0.75, 0, 0.7], [0.75, 0.9, 0.7], 0.025, 0.02, COL.wood, 4); P.roof([0.75, 0.9, 0.7], [0.97, 0.9, 0.7], [0.97, 0.7, 0.7], [0.75, 0.7, 0.7], 'tarp', 1, 1); }
};
B.latrine = (P, o) => {
  P.disc(0, 0.01, 0, 0.3, 0.3, 0.02, COL.dark, 8);
  const n = cnt(4, o.p);
  for (let i = 0; i < n; i++) { const a = i * 1.57 + 0.78; P.pole([Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], [Math.cos(a) * 0.6, 1.2, Math.sin(a) * 0.6], 0.035, 0.03, COL.wood, 4); }
  if (o.p > 0.7) P.roof([-0.42, 1.1, -0.42], [0.42, 1.1, -0.42], [0.42, 0.1, -0.42], [-0.42, 0.1, -0.42], o.kind, 1, 4);
};
B.cool_pit = (P, o) => {
  P.disc(0, 0.01, 0, 0.55, 0.55, 0.02, COL.dark, 10);
  stoneRing(P, 0.7, 9, 0.17, fr(o.p, 0, 0.7));
  if (o.p > 0.8) P.disc(0, 0.2, 0, 0.5, 0.5, 0.04, COL.leaf, 8);
};
B.tree_house = (P, o) => {
  const p = o.p, H = 2.2;
  const cs = [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]];
  for (let i = 0; i < cnt(4, fr(p, 0, 0.3)); i++) P.pole([cs[i][0], 0, cs[i][1]], [cs[i][0], H + 1.4, cs[i][1]], 0.12, 0.1, COL.woodD, 6);
  for (let i = 0; i < cnt(10, fr(p, 0.25, 0.55)); i++) P.box(0, H, -1.2 + i * 0.27, 2.5, 0.07, 0.24, i % 2 ? COL.wood : COL.woodL, 0, 0.05);
  P.roof([0, H + 1.7, -1.5], [0, H + 1.7, 1.5], [-1.5, H + 0.9, 1.5], [-1.5, H + 0.9, -1.5], o.kind, fr(p, 0.55, 1), 6);
  P.roof([0, H + 1.7, 1.5], [0, H + 1.7, -1.5], [1.5, H + 0.9, -1.5], [1.5, H + 0.9, 1.5], o.kind, fr(p, 0.55, 1), 6);
};

// ----------------------------------------------------------------------------------------------- ruins + entry
function ruin(P, id) {
  const [w, d] = BUILDINGS[id]?.size || [2, 2];
  const n = Math.round(4 + (w * d));
  for (let i = 0; i < Math.min(n, 14); i++) {
    const x = P.rng.float(-w / 2, w / 2), z = P.rng.float(-d / 2, d / 2), a = P.rng.float(0, 6.28), l = P.rng.float(0.5, 1.2);
    P.pole([x, 0.06, z], [x + Math.cos(a) * l, 0.12 + (i % 3 === 0 ? 0.15 : 0), z + Math.sin(a) * l], 0.04, 0.035, i % 2 ? COL.woodD : COL.wood, 4);
  }
  for (let i = 0; i < 5; i++) { const x = P.rng.float(-w / 2, w / 2), z = P.rng.float(-d / 2, d / 2); P.rock(x, 0.05, z, 0.3, 0.05, 0.25, P.jit(C('#6f6a3a'), 0.2), P.rng.float(0, 3), 0.1); }
  if (BUILDINGS[id]?.fire || ['fire_ring', 'cave_home'].includes(id)) for (let i = 0; i < 4; i++) P.rock(P.rng.float(-0.6, 0.6), 0.1, P.rng.float(-0.6, 0.6), 0.16, 0.11, 0.15, COL.stone);
}

export const MESH_IDS = Object.keys(B);

/** the sprite-free mesh for a building */
export function buildMesh(id, { stage = 'done', progress = 1, materials = {}, seed } = {}) {
  const P = new Parts(seed ?? (id.length * 977 + 13));
  const p = stage === 'done' ? 1 : stage === 'ruin' ? 1 : clamp(progress, 0, 0.985);
  const o = { p, stage, kind: materials.roof && ROOF[materials.roof] ? materials.roof : 'palm', materials };
  if (stage === 'ruin') ruin(P, id);
  else if (B[id]) B[id](P, o);
  else { const [w, d] = BUILDINGS[id]?.size || [1, 1]; P.box(0, 0.4, 0, w * 0.6, 0.8, d * 0.6, COL.wood); }
  const g = P.group({ id, stage, progress: p });
  g.name = `structure:${id}`;
  return g;
}
