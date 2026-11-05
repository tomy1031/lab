// kanto.js — the 関東 (Kanto plain) middle stage for ハマころ！
// The ball arrives ~400 m wide from Yokohama and grows to ~25 km rolling over a stylised map of
// the Kanto plain. Everything here is BIG and seen from far above: town blocks, factories, trains,
// ships, airports, Tokyo landmarks and mountains. The ground (city grey, fields, rivers) is a painted
// texture — these models sit on top of it.
// Units: METRES. Base on y = 0, centred on x/z, front faces +Z (vehicles/ships: nose or bow toward +Z).
// Aggregates are instanced thousands of times → frugal (≤ 1200 tris); landmarks ≤ 6000; mountains ≤ 3000.
import { box, cyl, cone, sphere, torus, ico, capsule, lathe, extrude, beam, plane, group, repeat, merge, shade, mix, rng } from '../geo.js';

const PI = Math.PI, TAU = PI * 2, SQ2 = Math.SQRT2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- palette ----------
const WARM = 0xffd98a;   // warm window light
const COOL = 0xd6ecff;   // cool office light
const WHITE = 0xf5f4ef;
const RED = 0xd8331f;    // vermilion / striped-chimney red
const STEEL = 0x8a929a;
const IRON = 0x3a3f46;
const ASPH = 0x5a5f66;
const CONC = 0xbfc1bc;
const SAND = 0xead8a0;
const WATER = 0x3d8fd8;
const LAMP = 0xfff1bf;
const AVI = 0xff3a2a;    // red aviation light
const GREENS = [0x2f6b37, 0x3a7d3c, 0x2a5d33, 0x45883f];
const CEDAR = [0x24502c, 0x2b5d33, 0x1f4a2a];
const AUTUMN = [0xe2702a, 0xd9452b, 0xeaa830, 0xc9542a, 0xf0c22e];
const RAIN = [0xff4f6a, 0xff9a3c, 0xffe14a, 0x5ee07a, 0x4cc4ff, 0x7a6cff, 0xff6fd8];
const CARS = [0xf2f2ee, 0x23252b, 0xd8382c, 0x2c6fd8, 0xb8bec6, 0xf2c230, 0x2e9a5a];
const CONT = [0xd8382c, 0x2c6fd8, 0xf2c230, 0x2e9a5a, 0xf08a24, 0xeeeeee, 0x8a3fbf, 0x6b4a3a, 0x39b6c8];

// ---------- helpers ----------
// square frustum (half-widths aTop / aBot), centred like cyl
const sq = (aTop, aBot, h, col, o = {}) => cyl(aTop * SQ2, aBot * SQ2, h, 4, col, { ...o, ry: PI / 4 + (o.ry || 0) });
// hipped roof / pyramid frustum over a 2hx × 2hz footprint, top size ratio k, base at o.y
const hip = (hx, hz, h, k, col, o = {}) =>
  group(cyl(k * SQ2, SQ2, h, 4, col, { ry: PI / 4, y: h / 2, glow: o.glow }), { sx: hx, sz: hz, x: o.x, y: o.y, z: o.z, ry: o.ry });
// gable roof prism: ridge along X (length L), span D across Z, height h, base at o.y
const gable = (L, D, h, col, o = {}) => extrude([[-D / 2, 0], [D / 2, 0], [0, h]], L, col, { ...o, ry: PI / 2 + (o.ry || 0) });
// top-view outline [[x, z], …] extruded upward from y0 by h (optional ry rotates the outline)
function flat(pts, y0, h, col, o = {}) {
  let p = pts;
  if (o.ry) { const c = Math.cos(o.ry), s = Math.sin(o.ry); p = pts.map(([x, z]) => [x * c + z * s, -x * s + z * c]); }
  return extrude(p, h, col, { rx: PI / 2, x: o.x || 0, z: o.z || 0, y: y0 + h / 2, glow: o.glow });
}
// ellipse outline
const ell = (rx, rz, n = 12, rot = 0) => {
  const a = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU, x = Math.cos(t) * rx, z = Math.sin(t) * rz;
    a.push([x * Math.cos(rot) + z * Math.sin(rot), -x * Math.sin(rot) + z * Math.cos(rot)]);
  }
  return a;
};
// wobbly blob outline (deterministic)
const blob = (seed, rx, rz, n = 12, jit = 0.18) => {
  const r = rng(seed), a = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU, k = 1 - jit + r() * jit * 2;
    a.push([Math.cos(t) * rx * k, Math.sin(t) * rz * k]);
  }
  return a;
};
// trees: cedar cone / round broadleaf, sitting at height y
const ctree = (x, z, h, col, y = 0, k = 0.36) => cone(h * k, h, 5, col, { x, z, y: y + h / 2 });
const rtree = (x, z, r, col, y = 0) => ico(r, 0, col, { x, z, y: y + r * 0.78, sy: 0.85 });
// little glowing lamp cube
const lamp = (x, y, z, s = 2, col = LAMP, glow = 1) => box(s, s, s, col, { x, y, z, glow });
// a deck/beam segment from a to b: horizontal width w, thickness t (top-face up)
function seg(a, b, w, t, col, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const hl = Math.hypot(dx, dz), len = Math.hypot(hl, dy);
  return group([box(w, t, len, col, { rx: -Math.atan2(dy, hl), glow: o.glow })],
    { ry: Math.atan2(dx, dz), x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 });
}
// window planes on the four faces of a w × d box at heights ys
function bands({ w, d, cx = 0, cz = 0, ys, h = 2, col = WARM, glow = 0.8, off = 0.08, sides = 'fblr', inset = 1 }) {
  const out = [];
  for (const y of ys) for (const s of sides) {
    const len = s === 'f' || s === 'b' ? w : d;
    const o = s === 'f' ? { x: cx, z: cz + d / 2 + off } : s === 'b' ? { x: cx, z: cz - d / 2 - off, ry: PI }
      : s === 'r' ? { x: cx + w / 2 + off, z: cz, ry: PI / 2 } : { x: cx - w / 2 - off, z: cz, ry: -PI / 2 };
    out.push(plane(len - 2 * inset, h, col, { ...o, y, glow }));
  }
  return out;
}
// a tower block: glowing glass body cut by opaque floor-frame bands (reads as lit windows at night)
function litTower(x, z, w, d, H, glass, frame, o = {}) {
  const P = [], nb = o.nb ?? clamp(Math.round(H / 24), 2, 5);
  P.push(box(w, H, d, glass, { x, y: H / 2, z, glow: o.glow ?? 0.55 }));
  for (let i = 1; i <= nb; i++) P.push(box(w + 0.8, o.bt ?? 2.6, d + 0.8, frame, { x, y: (H * i) / (nb + 1), z }));
  P.push(box(w + 1, 3, d + 1, frame, { x, y: H + 1.5, z }));
  if (o.roof !== false) P.push(box(w * 0.45, 4, d * 0.45, 0xb9bdc1, { x, y: H + 5, z }));
  if (H > 90) P.push(lamp(x, H + 8, z, 2.2, AVI));
  return P;
}
// re-centre a merged geometry on x/z (for blobby, randomly filled footprints)
function centred(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
// ship plan outline (x, z) with the bow at +z
function hullPlan(L, B, bow = 0.25, stern = 0.1) {
  const h = L / 2, b = B / 2, fb = L * bow, fs = L * stern;
  return [
    [0, h], [b * 0.5, h - fb * 0.3], [b * 0.85, h - fb * 0.65], [b, h - fb],
    [b, -h + fs], [b * 0.88, -h + fs * 0.35], [b * 0.55, -h],
    [-b * 0.55, -h], [-b * 0.88, -h + fs * 0.35], [-b, -h + fs],
    [-b, h - fb], [-b * 0.85, h - fb * 0.65], [-b * 0.5, h - fb * 0.3],
  ];
}
const hull = (L, B, y0, h, col, o = {}) => flat(hullPlan(L, B, o.bow ?? 0.25, o.stern ?? 0.1), y0, h, col, { z: o.z, x: o.x, glow: o.glow });
// ship side-window strip on both sides between z0 and z1
const sideStrip = (B, y, h, z0, z1, col = WARM, glow = 0.85) => [
  plane(z1 - z0, h, col, { x: B / 2 + 0.1, y, z: (z0 + z1) / 2, ry: PI / 2, glow }),
  plane(z1 - z0, h, col, { x: -B / 2 - 0.1, y, z: (z0 + z1) / 2, ry: -PI / 2, glow }),
];
// tiny parked/taxiing airliner (for airports): length ~L, nose +Z
function miniPlane(L, tail, o = {}) {
  const r = L * 0.06, P = [];
  P.push(box(r * 2, r * 2, L, WHITE, { y: r }));
  P.push(flat([[0, L * 0.12], [L * 0.48, -L * 0.12], [L * 0.48, -L * 0.2], [0, -L * 0.04], [-L * 0.48, -L * 0.2], [-L * 0.48, -L * 0.12]], r * 0.9, r * 0.35, 0xe4e7ea));
  P.push(flat([[0, -L * 0.36], [L * 0.17, -L * 0.48], [-L * 0.17, -L * 0.48]], r * 1.6, r * 0.3, 0xe4e7ea));
  P.push(box(r * 0.5, L * 0.13, L * 0.12, tail, { y: r * 2 + L * 0.06, z: -L * 0.43 }));
  return group(P, o);
}
// striped (red/white) chimney made of n frustum bands, base at y = 0
function chimney(x, z, H, r0, r1, n, seg = 6, cols = [RED, WHITE]) {
  const P = [];
  for (let i = 0; i < n; i++) {
    const ya = (H * i) / n, yb = (H * (i + 1)) / n;
    P.push(cyl(lerp(r0, r1, yb / H), lerp(r0, r1, ya / H), yb - ya, seg, cols[(n - 1 - i) % 2], { x, z, y: (ya + yb) / 2, glow: i === n - 1 ? 0.15 : 0 }));
  }
  P.push(lamp(x, H + 1, z, r1 * 0.7, AVI));
  return P;
}

// ferris wheel in the XY plane (faces ±Z), hub at height hc, base at y = 0
function ferris(R, hc, o = {}) {
  const P = [], WH = 0xf4f4f4, t = R * 0.024, nG = o.nG ?? 32, nS = o.nS ?? 16, seg = o.seg ?? 32;
  for (const s of [-1, 1]) {
    const zb = s * R * 0.26, zt = s * R * 0.07;
    P.push(beam([-R * 0.55, t * 1.5, zb], [0, hc, zt], t * 2.4, WH), beam([R * 0.55, t * 1.5, zb], [0, hc, zt], t * 2.4, WH));
  }
  P.push(cyl(R * 0.09, R * 0.09, R * 0.18, 10, STEEL, { y: hc, rx: PI / 2 }));
  for (const z of [-R * 0.05, R * 0.05]) P.push(torus(R, t, 4, seg, WH, { y: hc, z }));
  P.push(torus(R + t * 1.7, t * 0.7, 3, seg, o.ring ?? LAMP, { y: hc, glow: 1 }));
  for (let i = 0; i < nS; i++) {
    const a = (i / nS) * TAU;
    P.push(beam([0, hc, 0], [R * Math.cos(a), hc + R * Math.sin(a), 0], t * 0.8, RAIN[i % RAIN.length], { glow: 0.75 }));
  }
  const gs = R * 0.085;
  for (let i = 0; i < nG; i++) {
    const a = ((i + 0.5) / nG) * TAU, rr = R + gs * 0.9;
    P.push(box(gs, gs * 1.1, gs, o.gcol ?? RAIN[i % RAIN.length], { x: rr * Math.cos(a), y: hc + rr * Math.sin(a) - gs * 0.4, glow: 0.45 }));
  }
  if (o.clock) {
    for (const s of [1, -1]) {
      P.push(cyl(R * 0.26, R * 0.26, 0.8, 16, 0x141c34, { y: hc, z: s * R * 0.1, rx: PI / 2 }));
      P.push(torus(R * 0.26, R * 0.02, 3, 16, 0x7fffc0, { y: hc, z: s * R * 0.11, glow: 1 }));
      P.push(box(R * 0.3, R * 0.07, 0.6, 0x9fffd0, { y: hc, z: s * R * 0.115, glow: 1 }));
    }
  }
  return P;
}
// round mountain: lathe with radius r(t) = R(1 − t)^k (t = height fraction), painted in bands [[tEnd, colour], …]
function mount(x, z, R, H, bands, o = {}) {
  const k = o.k ?? 1.3, seg = o.seg ?? 9, n = o.steps ?? 2, P = [];
  const rad = (t) => Math.max(0.01, R * Math.pow(Math.max(0, 1 - t), k));
  let t0 = 0;
  for (const [t1, col] of bands) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = lerp(t0, t1, i / n); pts.push([rad(t), t * H]); }
    if (t1 >= 1) pts[pts.length - 1] = [0.01, H];
    P.push(lathe(pts, seg, col, { x, z, sz: o.sz, ry: o.ry }));
    t0 = t1;
  }
  return P;
}
// surface height of a mount() at horizontal distance d from its axis
const mountH = (R, H, k, d) => (d >= R ? 0 : H * (1 - Math.pow(d / R, 1 / k)));
// low rounded ridge (dome) — base on y = 0
const dome = (x, z, sx, sy, sz, col, ry = 0) => lathe([[1, 0], [0.82, 0.42], [0.48, 0.8], [0.01, 1]], 8, col, { x, z, sx, sy, sz, ry });
// a capsule from a to b (radius r)
function limb(a, b, r, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz), hl = Math.hypot(dx, dz);
  return group([capsule(r, Math.max(0.01, len), col, { rx: Math.atan2(hl, dy) })],
    { ry: Math.atan2(dx, dz), x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 });
}
// torii gate of height h (front ±Z), base at y = 0
function torii(h, col = RED, o = {}) {
  const w = h * 1.25, P = [];
  for (const s of [-1, 1]) P.push(cyl(h * 0.05, h * 0.06, h, 6, col, { x: s * w * 0.32, y: h / 2 }));
  P.push(box(w, h * 0.07, h * 0.12, 0x262626, { y: h * 1.04 }), box(w * 0.92, h * 0.07, h * 0.1, col, { y: h * 0.97, glow: o.glow ?? 0.3 }));
  P.push(box(w * 0.78, h * 0.06, h * 0.07, col, { y: h * 0.78 }), box(h * 0.05, h * 0.16, h * 0.05, col, { y: h * 0.88 }));
  return group(P, o);
}
// airport runway (dark strip + centre line + threshold blocks + glowing edge lights), along Z or X
function runway(P, along, c, a0, a1, y, W = 60) {
  const L = a1 - a0, m = (a0 + a1) / 2, up = (w, h, col, o) => plane(w, h, col, { ...o, rx: -PI / 2 });
  const Z = along === 'z';
  const at = (u, v) => (Z ? { x: c + u, z: m + v } : { x: m + v, z: c + u });
  const sz = (w, l) => (Z ? [w, l] : [l, w]);
  P.push(box(...(Z ? [W, 0.4, L] : [L, 0.4, W]), 0x4a4e55, { ...at(0, 0), y: y + 0.2 }));
  P.push(up(...sz(5, L - 160), 0xffffff, { ...at(0, 0), y: y + 0.45 }));
  for (const e of [-1, 1]) {
    P.push(up(...sz(7, L), LAMP, { ...at(e * (W / 2 + 3.5), 0), y: y + 0.46, glow: 1 }));
    P.push(up(...sz(W - 14, 34), 0xf2f2f2, { ...at(0, e * (L / 2 - 26)), y: y + 0.45 }));
  }
}

// ======================================================================================
export default {
  // ===================== scattered: towns =====================
  house_block: {
    name: '住宅街', kind: 'building', where: ['city', 'suburb'], weight: 6, variants: [1, 2, 3],
    build: (v = 1) => {
      const r = rng(17 + v * 131), P = [];
      const ROOF = [0x3b5fa8, 0xb8402e, 0x5a4a42, 0x4d5560, 0x2f7a5a, 0xc8702e, 0x8a2f2f, 0x6b7f99, 0x2b3a5c, 0x9a5a34];
      const WALL = [0xf4efe4, 0xe9dcc3, 0xd9d6cf, 0xf1e3c8, 0xcfd8dc, 0xe8cfb8, 0xf7f3ea];
      const pick = (a) => a[Math.floor(r() * a.length)];
      P.push(box(150, 0.6, 150, 0xd2ccbd, { y: 0.3 }));
      P.push(box(150, 0.3, 9, 0x8e9197, { y: 0.75 }), box(9, 0.3, 150, 0x8e9197, { y: 0.75 }));
      const cs = [-56, -35, -14, 14, 35, 56];
      const skip = new Set();
      while (skip.size < 5) skip.add(Math.floor(r() * 36));
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        const x = cs[i] + (r() - 0.5) * 3, z = cs[j] + (r() - 0.5) * 3;
        if (skip.has(i * 6 + j)) {
          P.push(rtree(x - 4, z - 3, 5 + r() * 2, pick(GREENS)), rtree(x + 4, z + 4, 4 + r() * 2, r() < 0.5 ? pick(AUTUMN) : pick(GREENS)));
          continue;
        }
        const w = 10 + r() * 5, d = 9 + r() * 4, wall = pick(WALL), roof = pick(ROOF);
        const fz = j < 3 ? -1 : 1; // windows face the middle lane
        if (r() < 0.12) { // small 3-storey flat-roof apartment
          const h = 9.2;
          P.push(box(w, h, d, wall, { x, y: h / 2, z }));
          P.push(plane(w - 2, 1.4, WARM, { x, y: 4.5, z: z + fz * (d / 2 + 0.08), ry: fz > 0 ? 0 : PI, glow: 0.85 }));
          P.push(plane(w - 2, 1.4, WARM, { x, y: 7.5, z: z + fz * (d / 2 + 0.08), ry: fz > 0 ? 0 : PI, glow: 0.85 }));
          continue;
        }
        const h = 5.2 + r() * 1.3, rh = 2.4 + r() * 0.9;
        P.push(box(w, h, d, wall, { x, y: h / 2, z }));
        if (r() < 0.6) P.push(w >= d ? gable(w + 1, d + 1.4, rh, roof, { x, y: h, z }) : gable(d + 1, w + 1.4, rh, roof, { x, y: h, z, ry: PI / 2 }));
        else P.push(hip((w + 1.2) / 2, (d + 1.2) / 2, rh, 0.2, roof, { x, y: h, z }));
        P.push(plane(w * 0.55, 1.5, WARM, { x, y: h * 0.55, z: z + fz * (d / 2 + 0.08), ry: fz > 0 ? 0 : PI, glow: 0.85 }));
      }
      return merge(P);
    },
  },

  apartment_block: {
    name: '団地', kind: 'building', where: ['suburb', 'city'], weight: 3, variants: [1, 2],
    build: (v = 1) => {
      const r = rng(211 + v * 17), P = [];
      const ACC = [0x3f7fd0, 0xe0703a, 0x4caf6a, 0xd9b030];
      P.push(box(200, 0.6, 160, 0xb7c2ae, { y: 0.3 }));
      P.push(box(200, 0.3, 10, 0x8e9197, { y: 0.75 }));
      const slots = [[-52, -56], [52, -56], [-52, 0], [52, 0], [-52, 56], [52, 56]];
      const n = v === 2 ? 5 : 6;
      for (let k = 0; k < n; k++) {
        const [x0, z] = slots[k], x = x0 + (r() - 0.5) * 8, L = 78 + r() * 12, D = 12;
        const fl = 8 + Math.floor(r() * 5), H = fl * 3 + 1;
        P.push(box(L, H, D, WHITE, { x, y: H / 2, z }));
        P.push(box(L + 0.6, 1, D + 0.6, 0xd6d6d0, { x, y: H + 0.5, z }));
        for (let f = 0; f < fl; f++) {
          const y = 2.3 + f * 3;
          P.push(plane(L - 3, 1.1, 0xe9dcb8, { x, y, z: z + D / 2 + 0.08, glow: 0.85 }));
          if (f % 2) P.push(plane(L - 3, 1.2, COOL, { x, y, z: z - D / 2 - 0.08, ry: PI, glow: 0.7 }));
        }
        P.push(box(L * 0.2, 2.4, D * 0.6, 0xc9cbc6, { x: x + L * 0.25, y: H + 2.2, z }));
        const acc = ACC[k % ACC.length];
        P.push(plane(4, H - 4, acc, { x: x + L / 2 + 0.08, y: H / 2, z, ry: PI / 2 }), plane(4, H - 4, acc, { x: x - L / 2 - 0.08, y: H / 2, z, ry: -PI / 2 }));
      }
      for (let i = 0; i < 12; i++) {
        const x = -90 + i * 16.4 + (r() - 0.5) * 4, z = (i % 2 ? -28 : 28) + (r() - 0.5) * 6;
        P.push(rtree(x, z, 4.5 + r() * 2.5, r() < 0.35 ? AUTUMN[i % 5] : GREENS[i % 4]));
      }
      return merge(P);
    },
  },

  office_block: {
    name: 'ビル街', kind: 'building', where: ['city'], weight: 4, variants: [1, 2, 3],
    build: (v = 1) => {
      const r = rng(301 + v * 29), P = [];
      const GLASS = [0xc9def0, 0xb9e0dc, 0xdde6ee, 0xcbd6f2, 0xe8dcc6];
      const FRAME = [0x5d6f86, 0x8a929a, 0x3e4b5e, 0xc8c2b4, 0x2f6f78, 0x9a7d62];
      P.push(box(220, 0.8, 220, 0x9a9ea3, { y: 0.4 }));
      const H = [140, 122, 104, 88, 74, 62, 52, 46, 40];
      for (let i = H.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [H[i], H[j]] = [H[j], H[i]]; }
      const g = [-72, 0, 72];
      let k = 0;
      for (const gx of g) for (const gz of g) {
        const h = H[k++];
        if (h === 46 && v !== 1) continue; // 8 towers in some variants
        const w = 32 + r() * 22, d = 30 + r() * 22;
        const x = gx + (r() - 0.5) * (66 - w) * 0.6, z = gz + (r() - 0.5) * (66 - d) * 0.6;
        P.push(litTower(x, z, w, d, h, GLASS[Math.floor(r() * GLASS.length)], FRAME[Math.floor(r() * FRAME.length)]));
      }
      return merge(P);
    },
  },

  tower_block: {
    name: '高層ビル', kind: 'building', where: ['city'], weight: 2,
    variants: [0x4f86c6, 0x3fae9c, 0x9a8466],
    build: (v = 0x4f86c6) => {
      const idx = Math.max(0, [0x4f86c6, 0x3fae9c, 0x9a8466].indexOf(v)), P = [];
      const R = 25, y0 = 12, y1 = 160;
      P.push(box(84, 0.8, 84, 0xb7bbbe, { y: 0.4 }));
      P.push(box(66, y0, 66, 0xd9d5cc, { y: y0 / 2 }));
      P.push(bands({ w: 66, d: 66, ys: [6], h: 5, col: WARM, glow: 0.8, inset: 4 }));
      P.push(cyl(R, R, y1 - y0, 8, v, { y: (y0 + y1) / 2, ry: PI / 8 }));
      for (let y = y0 + 9; y < y1 - 4; y += 11) P.push(cyl(R + 0.5, R + 0.5, 3.2, 8, idx === 2 ? WARM : COOL, { y, ry: PI / 8, glow: 0.85 }));
      for (let i = 0; i < 8; i++) {
        const a = PI / 8 + (i * PI) / 4 + PI / 8;
        P.push(box(1.6, y1 - y0, 1.6, 0xeef1f3, { x: Math.sin(a) * (R * 0.94), z: Math.cos(a) * (R * 0.94), y: (y0 + y1) / 2 }));
      }
      if (idx === 0) P.push(cyl(3, R, 14, 8, shade(v, 0.8), { y: y1 + 7, ry: PI / 8 }));
      else if (idx === 1) P.push(cyl(R * 0.8, R, 8, 8, 0xe9edf0, { y: y1 + 4, ry: PI / 8 }), cyl(R * 0.6, R * 0.6, 0.6, 8, 0xd8a83a, { y: y1 + 8.3, ry: PI / 8, glow: 0.5 }));
      else P.push(extrude([[-R, 0], [R, 0], [R, 6], [-R, 16]], R * 1.6, shade(v, 0.75), { y: y1 }));
      P.push(cyl(0.8, 1.4, 6, 5, 0xd0d4d8, { y: y1 + 17 }), lamp(0, y1 + 20.5, 0, 2, AVI));
      return merge(P);
    },
  },

  shopping_mall: {
    name: 'ショッピングモール', kind: 'building', where: ['suburb'], weight: 2,
    build: () => {
      const r = rng(401), P = [], MZ = -52;
      P.push(box(260, 0.6, 200, 0x6c7178, { y: 0.3 }));
      P.push(box(222, 18, 90, 0xeee8dc, { y: 9, z: MZ }));
      P.push(box(224, 1.4, 92, 0xc9c3b6, { y: 18.7, z: MZ }));
      P.push(plane(206, 5.5, 0xcfe8ff, { y: 6, z: MZ + 45.1, glow: 0.8 }));
      P.push(plane(206, 3, WARM, { y: 6, z: MZ - 45.1, ry: PI, glow: 0.6 }));
      P.push(cyl(9, 9, 180, 8, 0xa8d8ef, { rz: PI / 2, y: 19, z: MZ, sz: 0.7, glow: 0.5 }));
      // entrance blocks with accent colour
      P.push(box(36, 24, 14, 0xff7a2e, { x: -60, y: 12, z: MZ + 47 }), box(36, 24, 14, 0x2f8fd8, { x: 60, y: 12, z: MZ + 47 }));
      P.push(plane(26, 14, 0xfff4cc, { x: -60, y: 12, z: MZ + 54.1, glow: 0.7 }), plane(26, 14, 0xfff4cc, { x: 60, y: 12, z: MZ + 54.1, glow: 0.7 }));
      // rooftop sign (glow) with abstract white letters
      P.push(box(70, 14, 3, 0xe8322c, { y: 27, z: MZ + 30, glow: 0.9 }));
      for (let i = 0; i < 5; i++) P.push(box(7, 8, 1, 0xffffff, { x: -26 + i * 13, y: 27, z: MZ + 31.8, glow: 1 }));
      for (let i = 0; i < 6; i++) P.push(box(10, 4, 8, 0xb4b8bc, { x: -95 + i * 38, y: 21.4, z: MZ - 25 }));
      // parking lot: white stripes, cars, lamp posts, edge trees
      for (const z of [12, 40, 68, 92]) P.push(box(232, 0.12, 1, 0xf2f2ee, { y: 0.66, z }));
      for (const z of [18, 34, 46, 62, 74, 86]) {
        for (let x = -112; x <= 112; x += 9.5) {
          if (r() < 0.75) continue;
          P.push(box(2.2, 1.7, 4.8, CARS[Math.floor(r() * CARS.length)], { x, y: 1.45, z }));
        }
      }
      for (const x of [-90, 0, 90]) for (const z of [54]) P.push(box(1.2, 12, 1.2, STEEL, { x, y: 6.6, z }), lamp(x, 12.8, z, 3, LAMP));
      for (let i = 0; i < 6; i++) P.push(rtree(-124 + (i % 2) * 248, 14 + Math.floor(i / 2) * 32, 5, GREENS[i % 4]));
      return merge(P);
    },
  },

  school: {
    name: '学校', kind: 'building', where: ['suburb', 'city'], weight: 2,
    build: () => {
      const P = [], CR = 0xf2ecdc;
      P.push(box(180, 0.6, 160, 0xd3cbb8, { y: 0.3 }));
      // main 4-storey building with clock tower + side wing
      P.push(box(120, 16, 16, CR, { x: -20, y: 8, z: -60 }), box(121, 1, 17, 0xc9c1b0, { x: -20, y: 16.5, z: -60 }));
      P.push(bands({ w: 120, d: 16, cx: -20, cz: -60, ys: [2.6, 6.6, 10.6, 14.4], h: 1.8, col: WARM, glow: 0.8, sides: 'fb', inset: 3 }));
      P.push(box(12, 22, 12, CR, { x: -20, y: 11, z: -58 }), box(13, 1.2, 13, 0x3f6fb0, { x: -20, y: 22.4, z: -58 }));
      P.push(cyl(3.6, 3.6, 0.6, 10, 0xffffff, { rx: PI / 2, x: -20, y: 18.5, z: -51.9, glow: 0.6 }));
      P.push(box(16, 12, 50, CR, { x: 48, y: 6, z: -47 }));
      P.push(bands({ w: 16, d: 50, cx: 48, cz: -47, ys: [3, 7, 10.6], h: 1.8, col: WARM, glow: 0.8, sides: 'lr', inset: 3 }));
      // gym with barrel roof, and the pool
      P.push(box(40, 9, 30, 0xdfe2e4, { x: 70, y: 4.5, z: 0 }), cyl(15.5, 15.5, 41, 8, 0x4a78b0, { rz: PI / 2, x: 70, y: 9, z: 0, sx: 0.4 }));
      P.push(box(26, 1.6, 14, 0xe4e8ea, { x: 70, y: 0.8, z: 38 }), box(24, 0.3, 12, 0x48b8ec, { x: 70, y: 1.7, z: 38, glow: 0.2 }));
      // the sports ground: brown track, sandy field, white lane line
      P.push(cyl(36, 36, 0.4, 16, 0xb5603a, { x: -28, y: 0.8, z: 22, sx: 1.55 }));
      P.push(cyl(30.5, 30.5, 0.45, 16, 0xffffff, { x: -28, y: 0.82, z: 22, sx: 1.58 }));
      P.push(cyl(29, 29, 0.5, 16, 0xcfae7e, { x: -28, y: 0.85, z: 22, sx: 1.6 }));
      P.push(box(1, 3, 6, 0xffffff, { x: -66, y: 2.6, z: 22 }), box(1, 3, 6, 0xffffff, { x: 10, y: 2.6, z: 22 }));
      for (let i = 0; i < 12; i++) {
        const x = i < 6 ? -84 : 84, z = -70 + (i % 6) * 28;
        P.push(rtree(x, z, 4.6, i % 3 ? 0xd2603a : 0xe8a530));
      }
      return merge(P);
    },
  },

  shrine_forest: {
    name: '神社の森', kind: 'building', where: ['suburb', 'mountain'], weight: 1,
    build: () => {
      const r = rng(601), P = [];
      P.push(cyl(80, 80, 0.8, 12, 0x2c5a33, { y: 0.4 }));
      P.push(cyl(40, 40, 0.9, 10, 0xdcd2b8, { y: 0.45, z: -2 }));
      P.push(box(10, 0.9, 50, 0xdcd2b8, { y: 0.45, z: 54 }));
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * TAU + r() * 0.15;
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.2) continue; // keep the approach open (+Z)
        const rr = 54 + r() * 20, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        if (i % 3) P.push(ctree(x, z, 22 + r() * 9, CEDAR[i % 3], 0.8, 0.32));
        else P.push(rtree(x, z, 9 + r() * 3, i % 2 ? 0x2f6236 : AUTUMN[i % 5], 0.8));
      }
      // torii on the approach
      const tz = 42;
      for (const s of [-1, 1]) P.push(cyl(1.6, 2, 26, 6, RED, { x: s * 10, y: 13.8, z: tz }));
      P.push(box(32, 2, 3.4, 0x262626, { y: 28, z: tz }), box(29, 2, 3, RED, { y: 26.2, z: tz, glow: 0.25 }));
      for (const s of [-1, 1]) P.push(box(4, 1.6, 3.4, 0x262626, { x: s * 16.5, y: 28.8, z: tz, rz: s * 0.25 }));
      P.push(box(25, 1.6, 1.8, RED, { y: 21, z: tz }), box(1.6, 4, 1.2, RED, { y: 23.4, z: tz }));
      // haiden + honden with copper-green roofs and chigi
      P.push(box(26, 2.4, 16, 0xd6d0c2, { y: 2, z: 6 }), box(22, 7, 12, RED, { y: 6.7, z: 6 }));
      P.push(plane(14, 3.4, WARM, { y: 6.4, z: 12.1, glow: 0.8 }));
      P.push(gable(28, 19, 7, 0x5a9a80, { y: 10.2, z: 6 }));
      P.push(box(16, 6, 12, 0xfbf8ef, { y: 4, z: -16 }), gable(20, 17, 7.5, 0x4a8070, { y: 7, z: -16 }));
      for (const s of [-1, 1]) {
        P.push(beam([s * 8.5, 13, -18.5], [s * 10.5, 17.5, -13.5], 0.8, 0xd8a83a), beam([s * 8.5, 13, -13.5], [s * 10.5, 17.5, -18.5], 0.8, 0xd8a83a));
        P.push(lamp(s * 6, 2.4, 22, 1.8, WARM));
      }
      return merge(P);
    },
  },

  park_block: {
    name: '公園', kind: 'nature', where: ['city', 'suburb'], weight: 2,
    build: () => {
      const r = rng(701), P = [], PATH = 0xe6d7ae;
      P.push(box(220, 0.6, 200, 0x6fb35a, { y: 0.3 }));
      P.push(flat(blob(702, 46, 34, 12, 0.2), 0.6, 0.4, WATER, { x: -38, z: 10 }));
      P.push(flat(blob(703, 9, 7, 8), 0.9, 0.5, 0x5fa54c, { x: -44, z: 6 }));
      // paths: perimeter loop + diagonals
      P.push(box(200, 0.3, 6, PATH, { y: 0.75, z: -86 }), box(200, 0.3, 6, PATH, { y: 0.75, z: 86 }));
      P.push(box(6, 0.3, 172, PATH, { x: -100, y: 0.75 }), box(6, 0.3, 172, PATH, { x: 100, y: 0.75 }));
      P.push(box(6, 0.3, 150, PATH, { x: 45, y: 0.78, z: 10, ry: 0.55 }));
      P.push(cyl(16, 16, 0.5, 10, PATH, { x: 60, y: 0.85, z: -48 }), cyl(5, 5, 1.4, 8, 0xc6ccd2, { x: 60, y: 1.3, z: -48 }), cyl(3.6, 3.6, 0.3, 8, 0x8fd8ff, { x: 60, y: 2.1, z: -48, glow: 0.5 }));
      P.push(box(10, 3.6, 8, 0xe4dccb, { x: 70, y: 2.4, z: 50 }), hip(7, 6, 3.4, 0.2, 0x8a3f2a, { x: 70, y: 4.2, z: 50 }));
      for (let i = 0; i < 3; i++) P.push(box(2.2, 1.4, 3, 0xffffff, { x: -50 + i * 14, y: 1.3, z: 20 - i * 6 }));
      for (let i = 0; i < 22; i++) {
        let x = (r() - 0.5) * 196, z = (r() - 0.5) * 176;
        if (Math.hypot((x + 38) / 54, (z - 10) / 42) < 1) x += x < -38 ? -40 : 50;
        const c = r(), col = c < 0.25 ? 0xf0c52e : c < 0.4 ? 0xd84a2a : c < 0.5 ? 0xe8822e : GREENS[i % 4];
        P.push(rtree(clamp(x, -104, 104), z, 6 + r() * 3.5, col, 0.6));
      }
      for (const [x, z] of [[-100, -86], [100, -86], [-100, 86], [100, 86], [45, 10]]) P.push(box(0.8, 6, 0.8, IRON, { x: x + 4, y: 3.6, z: z + 4 }), lamp(x + 4, 7, z + 4, 1.8));
      return merge(P);
    },
  },

  baseball_park: {
    name: '野球場', kind: 'building', where: ['city', 'suburb'], weight: 1,
    build: () => {
      const SZ = 0.86, SEAT = 0x2f6fd0, P = [], N = 20;
      const L = (pts, col, o = {}) => lathe(pts, N, col, { sz: SZ, ...o });
      P.push(cyl(64, 64, 0.6, N, 0x4fae4a, { y: 0.3, sz: SZ }));
      P.push(box(30, 0.2, 30, 0xc9a06a, { ry: PI / 4, y: 0.7, z: 26 }), box(21, 0.25, 21, 0x5fbf55, { ry: PI / 4, y: 0.75, z: 26 }));
      P.push(cyl(3, 3, 0.4, 6, 0xc9a06a, { y: 0.9, z: 26 }));
      P.push(L([[66, 4], [66, 0]], 0x1f3f7f));
      P.push(L([[86, 16], [66, 4]], SEAT));
      P.push(L([[88, 17], [86, 16]], 0xc9ced4));
      P.push(L([[101, 30], [88, 17]], 0xd8443a));
      P.push(L([[104, 33], [101, 30]], 0xe8eaee));
      P.push(L([[104, 0], [104, 33]], 0xd9dde2));
      P.push(L([[104.4, 9], [104.4, 13]], WARM, { glow: 0.8 }));
      P.push(box(50, 16, 3, 0x222831, { y: 40, z: -91 }), plane(46, 12, 0x9fe0ff, { y: 40.5, z: -89.4, glow: 0.9 }));
      for (const deg of [30, 90, 150, 210, 270, 330]) {
        const a = (deg * PI) / 180, x = 104 * Math.sin(a), z = 104 * SZ * Math.cos(a);
        P.push(group([
          box(2.6, 56, 2.6, 0xd8dde2, { y: 28 }),
          box(16, 9, 1.6, 0x6a7078, { y: 58, rx: -0.3 }),
          box(15, 8, 0.5, 0xfffbe0, { y: 58, z: 0.9, rx: -0.3, glow: 1 }),
        ], { x, z, ry: Math.atan2(-x, -z) }));
      }
      return merge(P);
    },
  },

  // ===================== scattered: industry =====================
  factory: {
    name: '工場', kind: 'building', where: ['industrial'], weight: 4,
    build: () => {
      const P = [];
      P.push(box(320, 0.8, 240, 0xa9aaa5, { y: 0.4 }));
      // sawtooth shed
      const saw = (W, n, h) => {
        const pts = [[-W / 2, 0], [W / 2, 0]], tw = W / n;
        for (let k = n; k >= 1; k--) { const x1 = -W / 2 + k * tw; pts.push([x1, h], [x1 - tw, 0.01]); }
        pts.pop(); pts.push([-W / 2, 0.01]);
        return pts;
      };
      P.push(box(120, 12, 90, 0x7d9cc0, { x: -90, y: 6, z: -60 }));
      P.push(extrude(saw(120, 6, 7), 90, 0xe8ecef, { x: -90, y: 12, z: -60 }));
      P.push(box(150, 14, 46, 0xf0f1ee, { x: 60, y: 7, z: -84 }), gable(150, 48, 5, 0x5a7fa8, { x: 60, y: 14, z: -84 }));
      P.push(box(64, 18, 56, 0xd0d3d6, { x: 118, y: 9, z: 70 }), box(66, 2, 58, 0x3f9a6a, { x: 118, y: 18.6, z: 70 }));
      P.push(plane(140, 2.5, WARM, { x: 60, y: 8, z: -60.9, glow: 0.9 }), plane(110, 2.5, WARM, { x: -90, y: 7, z: -14.9, glow: 0.9 }));
      // striped chimneys
      P.push(chimney(-10, 30, 130, 5.5, 3.6, 6), chimney(14, 52, 110, 5, 3.4, 6));
      // process towers, spheres, flare stack
      for (const [x, z, h] of [[-80, 40, 64], [-62, 58, 52], [-96, 66, 44]]) {
        P.push(cyl(4.5, 4.5, h, 6, 0xeeeeea, { x, z, y: h / 2 }));
        P.push(lamp(x, h * 0.55, z + 4.6, 1.8, WARM), lamp(x + 4.6, h * 0.85, z, 1.8, WARM), lamp(x, h + 1, z, 1.6, WARM));
      }
      P.push(sphere(14, 7, 5, 0xe6e6e2, { x: 60, y: 16, z: 30 }), sphere(12, 7, 5, 0xe6e6e2, { x: 92, y: 14, z: 10 }));
      P.push(cyl(1.2, 1.6, 80, 4, 0x8a929a, { x: -130, z: 0, y: 40 }), cone(3, 9, 5, 0xff8a1e, { x: -130, z: 0, y: 84, glow: 1 }));
      // pipe racks
      for (const [a, b] of [[[-140, 9, 20], [140, 9, 20]], [[-140, 11, 14], [140, 11, 14]], [[30, 10, -40], [30, 10, 110]], [[-40, 8, -10], [-40, 8, 110]]]) P.push(beam(a, b, 2.2, 0xb8bec4));
      for (const x of [-120, -60, 0, 60, 120]) P.push(lamp(x, 13, 17, 2.4, WARM));
      P.push(box(280, 0.8, 0.8, 0xfff0b0, { y: 12.6, z: 22, glow: 1 }), box(0.8, 0.8, 150, 0xfff0b0, { x: 33, y: 11.6, z: 35, glow: 1 }));
      P.push(box(0.8, 0.8, 120, 0xfff0b0, { x: -37, y: 9.6, z: 50, glow: 1 }));
      for (const [x, z, h] of [[-80, 40, 64], [-62, 58, 52], [-96, 66, 44]]) for (const f of [0.3, 0.7]) P.push(cyl(5.4, 5.4, 1, 6, 0xfff0b0, { x, z, y: h * f, glow: 1 }));
      P.push(box(62, 1, 0.8, 0xfff0b0, { x: 118, y: 18.6, z: 99, glow: 0.9 }), box(150, 1, 0.8, 0xfff0b0, { x: 60, y: 13.6, z: -61, glow: 0.9 }));
      P.push(beam([150, 0, 20], [150, 30, 20], 2, 0xf2c230), beam([150, 0, 60], [150, 30, 60], 2, 0xf2c230), beam([150, 30, 10], [150, 30, 110], 2.4, 0xf2c230));
      return merge(P);
    },
  },

  oil_tanks: {
    name: '石油タンク', kind: 'building', where: ['industrial'], weight: 3,
    build: () => {
      const r = rng(801), P = [];
      P.push(box(260, 0.6, 220, 0xb4b3ad, { y: 0.3 }));
      const dike = (cx, cz, w, d) => [
        box(w, 2, 1.5, 0x9a9a94, { x: cx, y: 1.6, z: cz - d / 2 }), box(w, 2, 1.5, 0x9a9a94, { x: cx, y: 1.6, z: cz + d / 2 }),
        box(1.5, 2, d, 0x9a9a94, { x: cx - w / 2, y: 1.6, z: cz }), box(1.5, 2, d, 0x9a9a94, { x: cx + w / 2, y: 1.6, z: cz }),
      ];
      P.push(dike(-62, 0, 124, 200), dike(64, 0, 120, 200));
      const T = [[-90, -60], [-34, -60], [-90, 2], [-34, 2], [-62, 66], [36, -62], [92, -62], [64, 4], [64, 66]];
      T.forEach(([x, z], i) => {
        const rr = 20 + r() * 6, h = 16 + r() * 6, col = i % 3 === 1 ? 0xd9dbdc : 0xf3f3ee;
        P.push(cyl(rr, rr, h, 12, col, { x, z, y: h / 2 + 0.6 }));
        P.push(cone(rr * 1.01, 3, 12, shade(col, 0.9), { x, z, y: h + 2.1 }));
        P.push(beam([x + rr * 0.7, 0.6, z + rr * 0.72], [x + rr * 0.72, h, z - rr * 0.7], 1.2, 0x4c5a6a));
        P.push(lamp(x, h + 4, z, 1.6, WARM));
      });
      P.push(beam([-128, 4, 100], [128, 4, 100], 2, 0xa8aeb4), beam([-128, 6, 104], [128, 6, 104], 2, 0xa8aeb4));
      P.push(box(18, 8, 12, 0xe6e2d6, { x: 112, y: 4, z: 96 }), plane(14, 2, WARM, { x: 112, y: 4.5, z: 102.1, glow: 0.85 }));
      return merge(P);
    },
  },

  power_plant: {
    name: '発電所', kind: 'building', where: ['industrial'], weight: 1,
    build: () => {
      const P = [];
      P.push(box(360, 0.8, 260, 0xaeb0ad, { y: 0.4 }));
      for (const x of [-110, -30, 50]) {
        P.push(box(70, 30, 50, 0xeef1f3, { x, y: 15, z: 20 }), box(71, 4, 51, 0x2f7fd0, { x, y: 24, z: 20 }));
        P.push(box(40, 64, 40, 0xd5dbe0, { x, y: 32, z: -40 }), box(41, 2, 41, 0x8a929a, { x, y: 65, z: -40 }));
        P.push(plane(60, 3, WARM, { x, y: 12, z: 45.1, glow: 0.85 }));
        P.push(lamp(x - 20, 66.5, -20, 2.2, LAMP), lamp(x + 20, 66.5, -60, 2.2, LAMP));
        P.push(beam([x, 50, -60], [x, 50, -100], 5, 0xb9c0c6));
      }
      P.push(chimney(-110, -108, 200, 9, 5.5, 7), chimney(-30, -108, 200, 9, 5.5, 7), chimney(50, -108, 200, 9, 5.5, 7));
      for (const x of [-110, -30, 50]) P.push(lamp(x, 100, -98, 2.4, AVI));
      for (const [x, z] of [[140, -70], [140, -10]]) P.push(cyl(24, 24, 26, 12, 0xf3f3ee, { x, z, y: 13.8 }), cone(24.2, 4, 12, 0xd8dadc, { x, z, y: 28.8 }));
      for (let i = 0; i < 6; i++) P.push(box(10, 7, 8, 0x6a7a8a, { x: 112 + (i % 3) * 22, y: 4.3, z: 70 + Math.floor(i / 3) * 24 }));
      P.push(box(80, 0.4, 3, 0x9aa3ab, { x: 134, y: 14, z: 82 }), box(80, 0.4, 3, 0x9aa3ab, { x: 134, y: 14, z: 94 }));
      return merge(P);
    },
  },

  logistics: {
    name: '物流倉庫', kind: 'building', where: ['industrial', 'suburb'], weight: 2,
    build: () => {
      const r = rng(1001), P = [];
      const truck = (x, z, ry = 0) => group([
        box(3, 4, 13, 0xeef0f2, { y: 2.8, z: -1.5 }),
        box(3, 3.4, 2.8, CARS[Math.floor(r() * CARS.length)], { y: 2.3, z: 6.6 }),
      ], { x, z, ry });
      P.push(box(260, 0.6, 220, 0x7f848a, { y: 0.3 }));
      P.push(box(200, 34, 80, 0xf0f0ec, { x: -20, y: 17, z: -52 }), box(202, 4, 82, 0x2a7bd4, { x: -20, y: 29, z: -52 }));
      P.push(box(202, 1, 82, 0xc9ccd0, { x: -20, y: 34.5, z: -52 }));
      P.push(bands({ w: 200, d: 80, cx: -20, cz: -52, ys: [8, 19], h: 2.4, col: COOL, glow: 0.75, sides: 'fb', inset: 6 }));
      P.push(cyl(16, 16, 34, 10, 0xd9dad6, { x: 106, y: 17, z: -52 }), cyl(16.6, 16.6, 1.6, 10, 0x2a7bd4, { x: 106, y: 34.4, z: -52 }));
      P.push(box(160, 18, 52, 0xe8e3d6, { x: -30, y: 9, z: 58 }), box(162, 3, 54, 0x2e9a5a, { x: -30, y: 15, z: 58 }));
      P.push(plane(150, 3, WARM, { x: -30, y: 5, z: 84.1, glow: 0.85 }));
      P.push(box(36, 12, 30, 0xdfe3e6, { x: 100, y: 6, z: 58 }), plane(30, 2.4, WARM, { x: 100, y: 7, z: 73.1, glow: 0.85 }));
      for (let i = 0; i < 12; i++) P.push(truck(-108 + i * 16, 4, PI));
      for (let i = 0; i < 9; i++) P.push(truck(-100 + i * 15, 98));
      return merge(P);
    },
  },

  // ===================== scattered: countryside =====================
  rice_field: {
    name: '田んぼ', kind: 'nature', where: ['farm'], weight: 6, variants: [1, 2, 3],
    build: (v = 1) => {
      const r = rng(1101 + v * 37), P = [];
      const COLS = [0xd8b24c, 0xc9a35a, 0xe3c35a, 0xa88a52, 0x8cbf4f, 0xb9c45a, 0xd0a848, 0x7aa84a];
      P.push(box(420, 0.6, 410, 0xa99a6c, { y: 0.3 }));
      P.push(box(420, 0.4, 7, 0xd8d0b8, { y: 0.8, z: 2 }));
      const xs = [-175, -105, -35, 35, 105, 175];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        if (i >= 4 && j === 0) continue; // farmstead corner
        const z = (j < 3 ? -173 : -167) + j * 68;
        P.push(box(64 + (r() - 0.5) * 2, 0.8, 62, COLS[Math.floor(r() * COLS.length)], { x: xs[i], y: 1, z }));
      }
      // farmstead: big hipped-roof farmhouse, barn, persimmon & windbreak trees
      const fx = 140, fz = -170;
      P.push(box(22, 6, 14, 0xe9dec4, { x: fx - 14, y: 3.6, z: fz + 4 }), hip(14, 10, 8, 0.28, 0x3f454d, { x: fx - 14, y: 6.6, z: fz + 4 }));
      P.push(plane(14, 2, WARM, { x: fx - 14, y: 3.6, z: fz + 11.1, glow: 0.85 }));
      P.push(box(14, 6, 10, 0x8a5a3a, { x: fx + 14, y: 3.6, z: fz + 8 }), gable(15, 12, 3.6, 0xb5452e, { x: fx + 14, y: 6.6, z: fz + 8 }));
      for (let i = 0; i < 5; i++) P.push(ctree(fx - 40 + i * 16, fz - 24, 18 + r() * 6, CEDAR[i % 3], 0.6));
      P.push(rtree(fx + 30, fz + 16, 5.5, 0xe8822e, 0.6), rtree(fx - 38, fz + 18, 6, 0x3e7a3a, 0.6), rtree(-200, 120, 6, 0x3a7d3c, 0.6));
      return merge(P);
    },
  },

  greenhouse: {
    name: 'ビニールハウス', kind: 'building', where: ['farm'], weight: 2,
    build: () => {
      const P = [], W = 10, H = 5.5, arch = [];
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * PI; arch.push([Math.cos(a) * W / 2, Math.sin(a) * H]); }
      P.push(box(220, 0.5, 200, 0x8a6e4e, { y: 0.25 }));
      for (let i = 0; i < 12; i++) {
        P.push(extrude(arch, 140, i % 4 === 1 ? 0xf6f0d0 : 0xeef4f2, { x: -97 + i * 13.5, y: 0.5, z: -24, glow: i % 4 === 1 ? 0.55 : 0.05 }));
      }
      for (let i = 0; i < 8; i++) P.push(box(200, 0.8, 2.6, i % 2 ? 0x4f9a3a : 0x6fb84a, { y: 0.9, z: 60 + i * 5 }));
      P.push(box(12, 5, 9, 0xb8bcc0, { x: 96, y: 2.9, z: 64 }), gable(13, 10, 2.2, 0x4a78b0, { x: 96, y: 5.4, z: 64 }));
      P.push(cyl(2.2, 2.2, 6, 6, 0x3f8fd0, { x: 104, y: 3.5, z: 54 }));
      return merge(P);
    },
  },

  forest_clump: {
    name: '森', kind: 'nature', where: ['mountain', 'farm'], weight: 5, variants: [1, 2, 3],
    build: (v = 1) => {
      const r = rng(1201 + v * 53), P = [], R = 195;
      P.push(flat(blob(1202 + v, R + 10, R, 12, 0.12), 0, 1.2, 0x2f5a30));
      const N = 82, GA = PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const rr = Math.sqrt((i + 0.5) / N) * R * 0.94, a = i * GA + r() * 0.4;
        const x = Math.cos(a) * rr + (r() - 0.5) * 10, z = Math.sin(a) * rr + (r() - 0.5) * 10;
        const t = r(), edge = rr / R;
        if (t < 0.7) P.push(ctree(x, z, (30 + r() * 16) * (1.1 - edge * 0.35), CEDAR[i % 3], 1, 0.42));
        else P.push(rtree(x, z, 15 + r() * 6, t < 0.86 ? AUTUMN[i % 5] : 0x3e7a3a, 1));
      }
      return centred(merge(P));
    },
  },

  golf_course: {
    name: 'ゴルフ場', kind: 'nature', where: ['farm', 'mountain'], weight: 1,
    build: () => {
      const r = rng(1301), P = [];
      P.push(flat(blob(1302, 328, 245, 14, 0.07), 0, 0.6, 0x4f8f3e));
      const holes = [[-230, -40, 0.3, 120], [-120, 60, -0.5, 140], [0, -110, 1.3, 130], [80, 70, 0.2, 150], [220, -30, -0.2, 130], [-20, 170, 1.5, 110]];
      for (const [x, z, a, len] of holes) {
        P.push(flat(ell(22, len / 2, 8, a), 0.6, 0.5, 0x86c95a, { x, z }));
        const gx = x + Math.sin(a) * len * 0.5, gz = z + Math.cos(a) * len * 0.5;
        P.push(cyl(13, 13, 0.5, 7, 0xa6e070, { x: gx, z: gz, y: 1.2 }));
        P.push(cyl(6, 6, 0.4, 6, SAND, { x: gx + 16, z: gz - 4, y: 1.2, sx: 1.6 }));
        if (a > 0) P.push(box(0.8, 8, 0.8, 0xffffff, { x: gx, y: 5.2, z: gz }), box(4, 2.6, 0.4, 0xe8322c, { x: gx + 2.2, y: 8, z: gz }));
      }
      P.push(cyl(7, 7, 0.4, 6, SAND, { x: -150, z: 10, y: 1.1, sx: 1.8 }), cyl(7, 7, 0.4, 6, SAND, { x: 40, z: 10, y: 1.1, sx: 1.4 }));
      P.push(flat(blob(1303, 50, 32, 10), 0.6, 0.6, WATER, { x: 130, z: -130 }));
      for (const [x, z, sx, sz] of [[-60, -40, 40, 30], [150, 120, 50, 34], [-250, 110, 44, 30]]) P.push(lathe([[1, 0], [0.7, 0.55], [0.001, 1]], 7, 0x5a9a46, { x, z, sx, sy: 8, sz }));
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * TAU, rr = 205 + r() * 30, x = Math.cos(a) * rr * 1.4, z = Math.sin(a) * rr * 0.98;
        P.push(ctree(x, z, 20 + r() * 10, i % 5 === 0 ? AUTUMN[i % 5] : CEDAR[i % 3], 0.6, 0.4));
      }
      P.push(box(44, 9, 22, 0xece4d2, { x: 280, y: 5.1, z: 130 }), hip(25, 13, 6, 0.3, 0x6a4a3a, { x: 280, y: 9.6, z: 130 }));
      P.push(plane(36, 3, WARM, { x: 280, y: 5, z: 141.1, glow: 0.85 }), box(40, 0.3, 30, 0x7a7f86, { x: 280, y: 0.75, z: 170 }));
      return centred(merge(P));
    },
  },

  solar_farm: {
    name: 'ソーラー発電所', kind: 'building', where: ['farm'], weight: 1,
    build: () => {
      const P = [];
      P.push(box(380, 0.4, 300, 0x9aa58a, { y: 0.2 }));
      P.push(box(14, 0.3, 300, 0xcdc6ae, { y: 0.55 }));
      for (let i = 0; i < 19; i++) {
        const z = -130 + i * 14.4, col = i % 2 ? 0x1d3570 : 0x27458a;
        for (const s of [-1, 1]) P.push(box(170, 0.5, 8, col, { x: s * 95, y: 2.2, z, rx: 0.35 }));
      }
      P.push(box(18, 6, 12, 0xd0d4d8, { x: 0, y: 3, z: 158 - 10 }), box(4, 4, 4, 0x6a7a8a, { x: -10, y: 2, z: 136 }), box(4, 4, 4, 0x6a7a8a, { x: 10, y: 2, z: 136 }));
      P.push(lamp(0, 7, 141, 1.6, LAMP));
      return merge(P);
    },
  },

  pylon: {
    name: '送電鉄塔', kind: 'thing', where: ['farm', 'suburb', 'mountain'], weight: 3,
    build: () => {
      const P = [], ys = [0.5, 10, 20, 30, 40, 48, 54], hw = (y) => lerp(6.2, 1.5, y / 54);
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i], y1 = ys[i + 1], a = hw(y0), b = hw(y1), col = (ys.length - 2 - i) % 2 ? WHITE : RED;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(beam([sx * a, y0, sz * a], [sx * b, y1, sz * b], 0.9, col));
        const f = i % 2 ? 1 : -1;
        P.push(beam([-a * f, y0, a], [b * f, y1, b], 0.5, col), beam([a * f, y0, -a], [-b * f, y1, -b], 0.5, col));
        P.push(beam([a, y0, -a * f], [b, y1, b * f], 0.5, col), beam([-a, y0, a * f], [-b, y1, -b * f], 0.5, col));
      }
      for (const [y, L] of [[32, 12], [42, 11], [51, 10]]) {
        const h = hw(y), col = y > 45 ? RED : WHITE;
        P.push(beam([-h - L, y, 0], [h + L, y, 0], 1.2, col));
        for (const s of [-1, 1]) {
          P.push(beam([s * (h + L), y, 0], [s * h, y - 4.5, 0], 0.6, col));
          P.push(box(0.8, 4, 0.8, 0x3a4048, { x: s * (h + L - 1), y: y - 2.6, z: 0 }));
        }
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        P.push(beam([sx * 1.5, 54, sz * 1.5], [0, 60, 0], 0.6, RED));
        P.push(box(2.2, 1.6, 2.2, 0x9a9a94, { x: sx * 6.2, y: 0.8, z: sz * 6.2 }));
      }
      P.push(beam([-6, 57, 0], [6, 57, 0], 0.6, RED), lamp(0, 60.2, 0, 1.2, AVI));
      return merge(P);
    },
  },

  highway_jct: {
    name: 'ジャンクション', kind: 'thing', where: ['city', 'suburb'], weight: 1,
    build: () => {
      const P = [], DECK = 0x80858d, PIER = 0xc4c6c4, YA = 14, YB = 28;
      // highway A along X (lower), highway B along Z (upper)
      P.push(box(520, 2.2, 24, DECK, { y: YA - 1.1 }), box(520, 0.4, 1.2, 0xffb347, { y: YA + 0.2, glow: 0.9 }));
      P.push(box(24, 2.2, 520, DECK, { y: YB - 1.1 }), box(1.2, 0.4, 520, 0xffb347, { y: YB + 0.2, glow: 0.9 }));
      for (let x = -234; x <= 234; x += 52) P.push(box(4, YA - 2.2, 12, PIER, { x, y: (YA - 2.2) / 2 }));
      for (let z = -234; z <= 234; z += 52) if (Math.abs(z) > 20) P.push(box(12, YB - 2.2, 4, PIER, { z, y: (YB - 2.2) / 2 }));
      const path = (pts, w = 12) => {
        for (let i = 0; i < pts.length - 1; i++) {
          P.push(seg(pts[i], pts[i + 1], w, 1.8, DECK));
          if (i % 2 === 0) P.push(box(3.5, pts[i][1] - 1.8, 3.5, PIER, { x: pts[i][0], z: pts[i][2], y: (pts[i][1] - 1.8) / 2 }));
        }
      };
      // two cloverleaf loops (A → B), 270°+ with short tangent links
      for (const s of [1, -1]) {
        const cx = s * 84, cz = s * 84, R = 58, pts = [];
        pts.push([s * 150, YA, s * 13]);
        for (let i = 0; i <= 14; i++) {
          const t = i / 14, a = -PI / 2 + t * 1.5 * PI;
          pts.push([cx + s * Math.cos(a) * R, lerp(YA, YB, t), cz + s * Math.sin(a) * R]);
        }
        pts.push([s * 13, YB, s * 150]);
        path(pts);
      }
      // two sweeping flyovers in the other quadrants
      for (const s of [1, -1]) {
        const pts = [], R = 238;
        for (let i = 0; i <= 8; i++) {
          const t = i / 8, a = t * (PI / 2);
          pts.push([s * (-250 + Math.sin(a) * R), lerp(YA, YB, t) + Math.sin(t * PI) * 10, s * (250 - Math.cos(a) * R)]);
        }
        path(pts, 11);
      }
      return merge(P);
    },
  },

  // ===================== movers =====================
  train: {
    name: '電車', kind: 'vehicle', move: 'rail', speed: 25, variants: ['green', 'orange', 'sky'],
    build: (v = 'green') => {
      const st = { green: [0x3fae49, 0xf2c230], orange: [0xf08a24, 0xf08a24], sky: [0x37a9e6, 0x37a9e6] }[v] || [0x3fae49, 0xf2c230];
      const P = [], L = 19.4, W = 3.6, N = 10;
      P.push(box(W * 0.8, 1, 198, 0x34373c, { y: 0.5 }));
      for (let i = 0; i < N; i++) {
        const z = -90 + i * 20;
        P.push(box(W, 3.1, L, 0xdadfe4, { y: 2.55, z }));
        P.push(box(W + 0.3, 0.55, L - 0.2, st[0], { y: 3.95, z }));
        P.push(box(W + 0.12, 0.95, L - 2.4, 0xbfe0f5, { y: 2.9, z, glow: 0.8 }));
        if (v === 'green') P.push(box(W + 0.14, 0.35, L - 0.4, st[1], { y: 1.75, z }));
        P.push(box(W * 0.84, 0.5, L - 0.8, 0x9aa0a6, { y: 4.45, z }));
      }
      for (const s of [1, -1]) {
        P.push(box(W * 0.84, 1.3, 0.3, 0x1e2a38, { y: 3, z: s * 99.9 }));
        P.push(box(W + 0.32, 1.2, 0.36, st[0], { y: 1.6, z: s * 99.85 }));
        P.push(lamp(-1.1, 1.6, s * 100, 0.6, s > 0 ? LAMP : AVI), lamp(1.1, 1.6, s * 100, 0.6, s > 0 ? LAMP : AVI));
      }
      return merge(P);
    },
  },

  shinkansen: {
    name: '新幹線', kind: 'vehicle', move: 'rail', speed: 70,
    build: () => {
      const P = [], W = 3.4, BL = 0x1f4fb8, N = 16, CL = 25, NOSE = 15;
      const car = (z0, z1) => {
        const z = (z0 + z1) / 2, L = z1 - z0 - 0.4;
        P.push(box(W, 3.5, L, WHITE, { y: 2.75, z }));
        P.push(box(W + 0.1, 0.32, L, BL, { y: 1.75, z }));
        P.push(box(W + 0.08, 0.7, L - 1.6, 0xc8e4f8, { y: 3.15, z, glow: 0.8 }));
      };
      for (let i = 0; i < N; i++) {
        const z0 = -200 + i * CL, z1 = z0 + CL;
        if (i === 0) car(z0 + NOSE, z1);
        else if (i === N - 1) car(z0, z1 - NOSE);
        else car(z0, z1);
      }
      P.push(box(W * 0.85, 1, 400 - 2 * NOSE, 0x5a6068, { y: 0.5 }));
      const prof = [[1.72, 0], [1.66, 3], [1.5, 6], [1.2, 9], [0.8, 11.6], [0.35, 13.8], [0.02, 15]];
      for (const s of [1, -1]) {
        const zb = s * (200 - NOSE + 0.2);
        P.push(lathe(prof, 10, WHITE, { rx: s * PI / 2, sz: 0.95, y: 2.75, z: zb }));
        P.push(lathe([[1.76, 0], [1.7, 3], [1.52, 6.2], [1.18, 9.2], [0.02, 9.5]], 10, BL, { rx: s * PI / 2, sx: 1.02, sz: 0.3, y: 1.5, z: zb }));
        P.push(box(1.6, 0.6, 3.2, 0x1e2a38, { y: 4.1, z: zb + s * 4.5, rx: s * 0.2 }));
        P.push(lamp(-0.9, 2.0, zb + s * 11.5, 0.5, s > 0 ? LAMP : AVI), lamp(0.9, 2.0, zb + s * 11.5, 0.5, s > 0 ? LAMP : AVI));
      }
      return merge(P);
    },
  },

  airplane: {
    name: '旅客機', kind: 'vehicle', where: ['bay'], weight: 1, move: 'fly', speed: 80,
    variants: [0xd8262c, 0x1f4fa8, 0x2f9a5a],
    build: (v = 0xd8262c) => {
      const P = [], R = 3, y = R + 0.9;
      P.push(cyl(R, R, 47, 10, WHITE, { rx: PI / 2, y, z: 1.5 }));
      P.push(lathe([[R, 0], [R * 0.92, 3.5], [R * 0.7, 6], [R * 0.35, 8], [0.02, 9]], 10, WHITE, { rx: PI / 2, y, z: 25 }));
      P.push(lathe([[R, 0], [R * 0.8, 5], [R * 0.5, 8.5], [0.4, 11]], 10, WHITE, { rx: -PI / 2, y: y + 0.6, z: -22, sz: 0.8 }));
      P.push(box(2.8, 0.7, 1.2, 0x223344, { y: y + 1.5, z: 30.5 }));
      P.push(sideStrip(R * 2, y + 0.9, 0.7, -20, 26, COOL, 0.85));
      P.push(box(R * 2.06, 0.5, 46, v, { y: y - 0.9, z: 2 }));
      // swept wings, engines, tailplane, coloured fin
      P.push(flat([[0, 12], [32, -6], [32, -9.5], [0, -2], [-32, -9.5], [-32, -6]], y - 1, 0.8, 0xe6e9ec));
      for (const s of [-1, 1]) {
        P.push(cyl(1.6, 1.4, 6.5, 8, 0xd8dce0, { rx: PI / 2, x: s * 10, y: y - 2.2, z: 8 }));
        P.push(cyl(1.25, 1.25, 0.3, 8, 0x2a3038, { rx: PI / 2, x: s * 10, y: y - 2.2, z: 11.3 }));
        P.push(lamp(s * 32, y - 0.6, -7.5, 0.7, s > 0 ? 0x3aff6a : AVI));
      }
      P.push(flat([[0, -23], [12, -31], [12, -33.5], [0, -29.5], [-12, -33.5], [-12, -31]], y + 1.2, 0.5, 0xe6e9ec));
      P.push(extrude([[0, 0], [7, 0], [12.5, 12], [9, 12]], 0.7, v, { ry: -PI / 2, y: y + 1.6, z: -22.5, x: 0 }));
      P.push(lamp(0, y + 13.6, -34.5, 0.7, 0xffffff));
      return merge(P);
    },
  },

  container_ship: {
    name: 'コンテナ船', kind: 'vehicle', where: ['bay'], weight: 3, move: 'sail', speed: 10,
    build: () => {
      const r = rng(1501), P = [], L = 300, B = 46;
      P.push(hull(L * 0.98, B * 0.94, 0, 8, 0xb8322a, { bow: 0.18, stern: 0.06 }));
      P.push(hull(L, B, 7.6, 12.4, 0x24324f, { bow: 0.18, stern: 0.06 }));
      P.push(hull(L * 0.99, B * 0.99, 19.8, 0.6, 0xe8e8e2, { bow: 0.18, stern: 0.06 }));
      for (let b = 0; b < 15; b++) {
        const z = -88 + b * 15;
        for (const x of [-15.3, 0, 15.3]) {
          const taper = z > 100 ? 0.6 : 1, h = (6 + Math.floor(r() * 4) * 2.6) * taper;
          P.push(box(14.6, h, 12.4, CONT[Math.floor(r() * CONT.length)], { x: x * (z > 100 ? 0.8 : 1), y: 20.4 + h / 2, z }));
        }
      }
      // superstructure aft
      P.push(box(B - 8, 28, 13, WHITE, { y: 34, z: -112 }), box(B + 2, 3, 9, WHITE, { y: 47.5, z: -110 }));
      P.push(plane(B, 1.8, 0xbfe6ff, { y: 47.5, z: -105.4, glow: 0.9 }));
      P.push(bands({ w: B - 8, d: 13, cz: -112, ys: [26, 32, 38], h: 1.4, col: WARM, glow: 0.85, sides: 'fblr', inset: 2 }));
      P.push(box(8, 16, 10, 0x24324f, { y: 36, z: -130 }), box(8.3, 3, 10.3, 0xd8382c, { y: 40, z: -130 }));
      P.push(cyl(0.5, 0.7, 10, 5, WHITE, { y: 54, z: -108 }), lamp(0, 59.6, -108, 1.4, 0xffffff));
      P.push(lamp(0, 23, 147, 1.4, 0xffffff), lamp(B / 2 + 1, 48, -108, 1.2, 0x3aff6a), lamp(-B / 2 - 1, 48, -108, 1.2, AVI));
      return merge(P);
    },
  },

  tanker: {
    name: 'タンカー', kind: 'vehicle', where: ['bay'], weight: 2, move: 'sail', speed: 7,
    build: () => {
      const P = [], L = 250, B = 44;
      P.push(hull(L * 0.98, B * 0.95, 0, 7, 0x9a2c25, { bow: 0.14, stern: 0.05 }));
      P.push(hull(L, B, 6.6, 12, 0x2a2d33, { bow: 0.14, stern: 0.05 }));
      P.push(hull(L * 0.985, B * 0.97, 18.6, 0.8, 0x8a3a2e, { bow: 0.14, stern: 0.05 }));
      for (const x of [-6, 0, 6]) P.push(beam([x, 20.6, -88], [x, 20.6, 100], 1.6, x ? 0xe2e2dc : 0xd8c040));
      P.push(beam([-18, 21, 4], [18, 21, 4], 2.2, 0xd8c040), box(6, 6, 4, 0xe2e2dc, { y: 22.4, z: 4 }));
      for (let z = -70; z <= 90; z += 32) P.push(box(3, 2.4, 3, 0xe2e2dc, { x: 12, y: 20.6, z }), box(3, 2.4, 3, 0xe2e2dc, { x: -12, y: 20.6, z }));
      P.push(box(B - 6, 22, 18, WHITE, { y: 30.4, z: -102 }), box(B + 2, 3, 9, WHITE, { y: 42.6, z: -100 }));
      P.push(plane(B, 1.8, 0xbfe6ff, { y: 42.6, z: -95.4, glow: 0.9 }));
      P.push(bands({ w: B - 6, d: 18, cz: -102, ys: [24, 30, 36], h: 1.4, col: WARM, glow: 0.85, inset: 2 }));
      P.push(box(9, 14, 10, 0x2a2d33, { y: 47, z: -112 }), box(9.3, 3, 10.3, 0x2f8fd8, { y: 50, z: -112 }));
      P.push(cyl(0.6, 0.8, 12, 5, WHITE, { y: 25, z: 112 }), lamp(0, 31.6, 112, 1.4, 0xffffff));
      return merge(P);
    },
  },

  ferry: {
    name: 'フェリー', kind: 'vehicle', where: ['bay'], weight: 2, move: 'sail', speed: 9,
    build: () => {
      const P = [], L = 180, B = 28, BL = 0x1f5fc0;
      P.push(hull(L * 0.97, B * 0.92, 0, 4, 0x1c3f86, { bow: 0.22, stern: 0.04 }));
      P.push(hull(L, B, 3.8, 11, WHITE, { bow: 0.22, stern: 0.04 }));
      P.push(hull(L + 0.6, B + 0.6, 8.2, 2.6, BL, { bow: 0.22, stern: 0.04 }));
      P.push(sideStrip(B, 12.2, 1.2, -70, 60, WARM, 0.85));
      for (let k = 0; k < 3; k++) {
        const Lk = L * 0.78 - k * 22, z = -8 - k * 6, y = 14.8 + k * 4;
        P.push(hull(Lk, B * 0.96 - k * 2, y, 4, WHITE, { z, bow: 0.18, stern: 0.03 }));
        P.push(sideStrip(B * 0.96 - k * 2, y + 2, 1.5, z - Lk * 0.4, z + Lk * 0.3, k === 2 ? COOL : WARM, 0.85));
      }
      P.push(box(B * 0.8, 2.6, 7, WHITE, { y: 28.1, z: 44 }), plane(B * 0.76, 1.6, 0xbfe6ff, { y: 28.2, z: 47.6, glow: 0.9 }));
      P.push(extrude([[-9, 0], [7, 0], [5, 13], [-6, 13]], 8, WHITE, { ry: PI / 2, y: 26.8, z: -48 }));
      P.push(extrude([[-7.5, 6], [6.3, 6], [5.7, 9.5], [-6.8, 9.5]], 8.3, BL, { ry: PI / 2, y: 26.8, z: -48 }));
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.push(box(2.4, 2.2, 7, 0xff9b1f, { x: s * (B / 2 - 2.6), y: 20, z: -50 + i * 14 }));
      P.push(cyl(0.4, 0.6, 8, 5, WHITE, { y: 33, z: 36 }), lamp(0, 37.4, 36, 1.2, 0xffffff));
      return merge(P);
    },
  },

  fishing_boat: {
    name: '漁船', kind: 'vehicle', where: ['bay'], weight: 3, move: 'sail', speed: 6,
    build: () => {
      const P = [], L = 30, B = 7;
      P.push(hull(L * 0.96, B * 0.9, 0, 1.8, 0x2c5fa8, { bow: 0.3, stern: 0.08 }));
      P.push(hull(L, B, 1.7, 1.9, WHITE, { bow: 0.3, stern: 0.08 }));
      P.push(hull(L * 0.97, B * 0.9, 3.3, 0.3, 0x3f8fa8, { bow: 0.3, stern: 0.08 }), sideStrip(B, 2.9, 0.5, -12, 8, 0xd8382c, 0));
      P.push(box(4.6, 2.6, 6, WHITE, { y: 4.9, z: -5 }), box(3.8, 1.6, 3.6, WHITE, { y: 7, z: -4.4 }));
      P.push(plane(3.4, 1, 0x9fd8ff, { y: 7.1, z: -2.55, glow: 0.8 }), plane(4, 0.9, WARM, { x: 0, y: 5, z: -1.95, glow: 0.8 }));
      P.push(cyl(0.18, 0.22, 9, 4, WHITE, { y: 8, z: 7 }), cyl(0.15, 0.18, 6, 4, WHITE, { y: 9.5, z: -6.8 }));
      // string of fishing lamps
      for (let i = 0; i < 7; i++) {
        const t = i / 6, z = lerp(7, -6.6, t), yy = lerp(10.6, 10.2, t) - Math.sin(t * PI) * 1.4;
        P.push(box(0.9, 0.9, 0.9, 0xfff6c8, { y: yy, z, glow: 1 }));
      }
      P.push(beam([0, 12, 7], [0, 12, -6.6], 0.12, IRON));
      P.push(plane(1.6, 1, 0xf2c230, { y: 12.4, z: 7.8, ry: PI / 2 }), plane(1.6, 1, 0xd8382c, { y: 11.4, z: 7.8, ry: PI / 2 }));
      return merge(P);
    },
  },
  // ===================== hand-placed landmarks: Tokyo =====================
  tokyo_tower: {
    name: '東京タワー', kind: 'landmark',
    build: () => {
      const OR = 0xf2581c, WT = 0xf7f6f0, P = [];
      const ys = [2.2, 30, 60, 90, 118, 145, 172, 198, 224, 250, 268, 286];
      const hws = [42, 31, 23, 17.2, 13.2, 10.6, 8.8, 7.3, 5.9, 4.6, 3.4, 2.4];
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i], y1 = ys[i + 1], a = hws[i], b = hws[i + 1];
        const col = i % 2 ? WT : OR, g = i % 2 ? 0.28 : 0.4, t = lerp(4.2, 1.2, i / (ys.length - 2));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(beam([sx * a, y0, sz * a], [sx * b, y1, sz * b], t, col, { glow: g }));
        for (let k = 0; k < 4; k++) {
          const rot = (u, y, rr) => { const c = Math.cos((k * PI) / 2), s = Math.sin((k * PI) / 2); return [u * c + rr * s, y, -u * s + rr * c]; };
          P.push(beam(rot(-a, y0, a), rot(b, y1, b), t * 0.45, col, { glow: g }), beam(rot(a, y0, a), rot(-b, y1, b), t * 0.45, col, { glow: g }));
          if (i > 0) P.push(beam(rot(-a, y0, a), rot(a, y0, a), t * 0.5, col, { glow: g }));
        }
      }
      // FootTown building between the legs
      P.push(box(64, 20, 64, 0xe9e6de, { y: 10 }), box(66, 1.5, 66, 0xc9c4b8, { y: 20.5 }));
      P.push(bands({ w: 64, d: 64, ys: [6, 14], h: 3, col: WARM, glow: 0.8, inset: 4 }));
      // main deck (2 storeys) and top deck
      P.push(cyl(16.5, 15, 3, 8, OR, { y: 146.5, ry: PI / 8 }));
      P.push(cyl(17.5, 16.5, 7, 8, 0xbfe3ff, { y: 152, ry: PI / 8, glow: 0.85 }), cyl(17.6, 17.6, 1.6, 8, WT, { y: 156.3, ry: PI / 8 }));
      P.push(cyl(16.5, 17.5, 5, 8, 0xbfe3ff, { y: 159.6, ry: PI / 8, glow: 0.85 }), cyl(14, 16.6, 3, 8, OR, { y: 163.6, ry: PI / 8 }));
      P.push(cyl(7.6, 6.4, 3, 8, WT, { y: 249, ry: PI / 8 }), cyl(8, 7.6, 5, 8, 0xbfe3ff, { y: 253, ry: PI / 8, glow: 0.9 }), cyl(5, 8, 2.4, 8, WT, { y: 256.7, ry: PI / 8 }));
      // antenna mast
      for (let i = 0; i < 4; i++) P.push(cyl(lerp(2, 0.9, (i + 1) / 4), lerp(2, 0.9, i / 4), 11.75, 6, i % 2 ? WT : OR, { y: 286 + 11.75 * (i + 0.5), glow: 0.3 }));
      P.push(lamp(0, 333, 0, 2, AVI), lamp(0, 250, 8.2, 1.4, AVI));
      return merge(P);
    },
  },

  skytree: {
    name: '東京スカイツリー', kind: 'landmark',
    build: () => {
      const WH = 0xe4f0ff, CORE = 0xb5c3d2, GL = 0x9fd0f0, P = [];
      // base: union of a shrinking triangular prism and a growing round core → triangle morphing to circle
      const ys = [0, 60, 125, 190, 255, 320, 340];
      const R3 = [44, 37.5, 31, 25, 19.5, 14.6, 14];
      const RC = [23, 21.5, 20, 18.5, 17, 15.2, 14.6];
      for (let i = 0; i < ys.length - 1; i++) {
        const h = ys[i + 1] - ys[i], y = (ys[i] + ys[i + 1]) / 2;
        P.push(cyl(R3[i + 1], R3[i], h, 3, CORE, { y }), cyl(RC[i + 1], RC[i], h, 12, CORE, { y }));
        // white corner legs along the triangle edges
        for (let k = 0; k < 3; k++) {
          const a = (k * TAU) / 3;
          P.push(beam([Math.sin(a) * R3[i], Math.max(ys[i], 1.8), Math.cos(a) * R3[i]], [Math.sin(a) * R3[i + 1], ys[i + 1], Math.cos(a) * R3[i + 1]], 3.4, WH, { glow: 0.45 }));
        }
        // diamond lattice on the round core
        for (let k = 0; k < 12; k++) for (const d of [-1, 1]) {
          const a0 = (k * TAU) / 12, a1 = a0 + (d * TAU) / 24, r0 = RC[i] + 0.8, r1 = RC[i + 1] + 0.8;
          P.push(beam([Math.sin(a0) * r0, Math.max(ys[i], 0.8), Math.cos(a0) * r0], [Math.sin(a1) * r1, ys[i + 1], Math.cos(a1) * r1], 1.3, WH, { glow: 0.45 }));
        }
      }
      // Tembo Deck (350 m)
      P.push(cyl(21.5, 21.5, 2, 16, WH, { y: 339 }), cyl(22, 19, 15, 16, GL, { y: 347.5, glow: 0.85 }), cyl(20, 22.4, 3, 16, WH, { y: 356.5 }));
      // upper shaft with lattice, Tembo Galleria (450 m), gain tower, antenna
      const up = [[358, 13.2], [400, 12.4], [440, 11.6]];
      for (let i = 0; i < up.length - 1; i++) {
        const [y0, r0] = up[i], [y1, r1] = up[i + 1];
        P.push(cyl(r1, r0, y1 - y0, 12, CORE, { y: (y0 + y1) / 2 }));
        for (let k = 0; k < 12; k++) for (const d of [-1, 1]) {
          const a0 = (k * TAU) / 12, a1 = a0 + (d * TAU) / 24;
          P.push(beam([Math.sin(a0) * (r0 + 0.6), y0, Math.cos(a0) * (r0 + 0.6)], [Math.sin(a1) * (r1 + 0.6), y1, Math.cos(a1) * (r1 + 0.6)], 1, WH, { glow: 0.45 }));
        }
      }
      P.push(cyl(15.5, 15.5, 1.6, 16, WH, { y: 440.8 }), cyl(16, 13, 10, 16, GL, { y: 446.6, glow: 0.85 }), cyl(11, 16.2, 3, 16, WH, { y: 453 }));
      P.push(cyl(9, 10.6, 44, 10, CORE, { y: 476.5 }), cyl(4.2, 9, 8, 10, WH, { y: 502.5 }));
      P.push(cyl(3, 4, 110, 8, WH, { y: 561.5, glow: 0.3 }));
      for (const y of [520, 560, 600]) P.push(cyl(4.4, 4.4, 4, 8, 0xb48cff, { y, glow: 1 }));
      P.push(cyl(1.2, 2.6, 18, 6, WH, { y: 625 }), lamp(0, 634, 0, 2, AVI), lamp(0, 456, 0, 2.2, AVI));
      // plaza
      P.push(cyl(60, 60, 1, 12, 0xc9c6bc, { y: 0.5 }));
      return merge(P);
    },
  },

  tokyo_station: {
    name: '東京駅', kind: 'landmark',
    build: () => {
      const BR = 0xb4472e, BRd = 0x94392a, ST = 0xf1ece0, ROOF = 0x4a4f58, P = [];
      const L = 335, D = 22, H = 22;
      P.push(box(L, 2, D + 8, 0xa9a49a, { y: 1 }));
      P.push(box(L - 8, H, D, BR, { y: H / 2 + 1 }));
      for (const y of [8, 15.5]) P.push(box(L - 7.6, 0.8, D + 0.4, ST, { y }));
      P.push(box(L - 7, 1.4, D + 1, ST, { y: H + 1.4 }));
      P.push(bands({ w: L - 8, d: D, ys: [4.8, 11.6, 18.6], h: 2.6, col: WARM, glow: 0.8, sides: 'fb', inset: 2 }));
      for (let x = -155; x <= 155; x += 10) for (const s of [1, -1]) P.push(box(2.4, H - 1, 0.9, BRd, { x, y: H / 2 + 1, z: s * (D / 2 + 0.3) }));
      P.push(hip(L / 2 - 6, D / 2 + 1, 6, 0.4, ROOF, { y: H + 2 }));
      // pavilions
      const pav = (x, w, d, h, roof) => {
        P.push(box(w, h, d, BR, { x, y: h / 2 + 1 }));
        P.push(box(w + 0.6, 1.2, d + 0.6, ST, { x, y: h + 1.2 }), box(w + 0.4, 0.8, d + 0.4, ST, { x, y: 8 }));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(box(2.2, h, 2.2, ST, { x: x + sx * (w / 2), y: h / 2 + 1, z: sz * (d / 2) }));
        P.push(bands({ w, d, cx: x, ys: [4.8, 11.6, 18.6], h: 2.6, col: WARM, glow: 0.8, sides: 'fb', inset: 3 }));
        if (roof) P.push(hip(w / 2 + 0.5, d / 2 + 0.5, roof, 0.18, ROOF, { x, y: h + 1.8 }));
      };
      pav(0, 44, D + 10, H + 6, 12);
      for (const s of [-1, 1]) {
        pav(s * 78, 24, D + 4, H + 2, 6);
        pav(s * 148, 39, D + 12, H + 5, 0);
        // the two great domes (octagonal drum + dark dome + lantern)
        const x = s * 148, y0 = H + 6;
        P.push(cyl(17, 17, 7, 8, BR, { x, y: y0 + 3.5, ry: PI / 8 }), cyl(17.6, 17.6, 1, 8, ST, { x, y: y0 + 7.2, ry: PI / 8 }));
        P.push(lathe([[18, 0], [17.2, 5], [14.6, 10], [10.4, 14.4], [5, 17], [0.01, 18]], 8, ROOF, { x, y: y0 + 7.6, ry: PI / 8 }));
        for (let k = 0; k < 8; k++) {
          const a = (k * TAU) / 8 + PI / 8;
          P.push(beam([x + Math.sin(a) * 18, y0 + 7.8, Math.cos(a) * 18], [x + Math.sin(a) * 4, y0 + 24.6, Math.cos(a) * 4], 0.9, ST));
        }
        P.push(cyl(3.2, 3.2, 4, 8, ST, { x, y: y0 + 27.4 }), cone(3.6, 4, 8, ROOF, { x, y: y0 + 31.4 }), lamp(x, y0 + 34, 0, 1.2, 0xffd36a));
        P.push(plane(10, 4, WARM, { x, y: y0 + 3.5, z: 16.3, glow: 0.8 }));
      }
      // platform canopies behind (-Z)
      for (let i = 0; i < 4; i++) {
        P.push(box(280, 1.2, 12, 0xa8b0b8, { y: 9, z: -36 - i * 18 }));
        for (const x of [-120, -40, 40, 120]) P.push(box(1.2, 8.4, 1.2, 0x8a929a, { x, y: 4.2, z: -36 - i * 18 }));
        P.push(box(280, 0.2, 4, LAMP, { y: 8.3, z: -36 - i * 18, glow: 0.6 }));
      }
      return centred(merge(P));
    },
  },

  kokkai: {
    name: '国会議事堂', kind: 'landmark',
    build: () => {
      const GR = 0xece8de, GD = 0xd4cfc2, P = [];
      P.push(box(214, 2, 104, 0xcfcac0, { y: 1 }));
      P.push(box(150, 0.6, 40, 0x6fb35a, { y: 0.3, z: 74 }), box(10, 0.7, 40, 0xe2dccb, { y: 0.35, z: 74 }));
      // central block, wings, end pavilions
      P.push(box(84, 22, 72, GR, { y: 13 }));
      for (const s of [-1, 1]) {
        P.push(box(54, 19, 86, GR, { x: s * 69, y: 11.5 }), box(55, 1.4, 87, GD, { x: s * 69, y: 21.7 }));
        P.push(box(16, 23, 96, GR, { x: s * 99, y: 13.5 }), box(17, 1.4, 97, GD, { x: s * 99, y: 25.7 }));
        P.push(hip(8.5, 10, 4, 0.3, GD, { x: s * 99, y: 26.4, z: 38 }), hip(8.5, 10, 4, 0.3, GD, { x: s * 99, y: 26.4, z: -38 }));
        P.push(bands({ w: 54, d: 86, cx: s * 69, ys: [6, 12, 17], h: 2.4, col: WARM, glow: 0.75, sides: 'fb', inset: 3 }));
        P.push(bands({ w: 16, d: 96, cx: s * 99, ys: [6, 12, 17], h: 2.4, col: WARM, glow: 0.75, sides: s > 0 ? 'r' : 'l', inset: 5 }));
      }
      P.push(box(85, 1.4, 73, GD, { y: 24.7 }));
      P.push(bands({ w: 84, d: 72, ys: [6, 12, 18], h: 2.4, col: WARM, glow: 0.75, sides: 'fb', inset: 3 }));
      // front portico
      P.push(box(36, 3, 10, GD, { y: 21, z: 41 }), extrude([[-18, 0], [18, 0], [0, 6]], 10, GR, { y: 22.5, z: 41 }));
      for (let i = 0; i < 6; i++) P.push(cyl(1.3, 1.3, 17, 6, GR, { x: -15 + i * 6, y: 10.5, z: 44 }));
      // central tower with colonnade and stepped pyramid
      P.push(box(34, 18, 34, GR, { y: 33 }), box(35, 1.2, 35, GD, { y: 42.6 }));
      P.push(box(24, 8, 24, GD, { y: 47.2 }));
      for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) {
        const u = -10.5 + i * 7, c = Math.cos((k * PI) / 2), s = Math.sin((k * PI) / 2);
        P.push(cyl(1.1, 1.1, 8, 6, GR, { x: u * c + 13.5 * s, y: 47.2, z: -u * s + 13.5 * c }));
      }
      for (let i = 0; i < 6; i++) P.push(sq(14.5 - i * 2.3, 15 - i * 2.3, 2.2, i % 2 ? GD : GR, { y: 52.3 + i * 2.2 }));
      P.push(box(4, 2.4, 4, GR, { y: 65.6 }), lamp(0, 67.2, 0, 1.2, AVI));
      P.push(plane(18, 5, WARM, { y: 32, z: 17.1, glow: 0.7 }));
      return centred(merge(P));
    },
  },

  tocho: {
    name: '東京都庁', kind: 'landmark',
    build: () => {
      const GR = 0xb4bac2, GD = 0x7d8794, GL = 0xb9d2ea, P = [];
      P.push(box(150, 1, 100, 0xc8c6c0, { y: 0.5 }));
      // lower block (to the 33rd floor) with the glowing window grid
      const W = 110, D = 48, H1 = 150;
      P.push(box(W, H1, D, GL, { y: H1 / 2 + 1, glow: 0.55 }));
      for (let y = 12; y < H1; y += 12) P.push(box(W + 0.8, 2.6, D + 0.8, GR, { y: y + 1 }));
      for (let i = 0; i <= 10; i++) {
        const x = -W / 2 + (i * W) / 10;
        P.push(box(i % 5 === 0 ? 4 : 2.2, H1, D + 1.2, i % 5 === 0 ? GD : GR, { x, y: H1 / 2 + 1 }));
      }
      for (let i = 1; i < 4; i++) P.push(box(W + 1.2, H1, 2, GR, { y: H1 / 2 + 1, z: -D / 2 + (i * D) / 4 }));
      P.push(box(W + 2, 3, D + 2, GD, { y: H1 + 2 }));
      // twin towers
      for (const s of [-1, 1]) {
        const x = s * 34, w = 38, H2 = 60, y0 = H1 + 3;
        P.push(box(w, H2, w, GL, { x, y: y0 + H2 / 2, glow: 0.55 }));
        for (let y = 10; y < H2; y += 11) P.push(box(w + 0.8, 2.4, w + 0.8, GR, { x, y: y0 + y }));
        for (const u of [-w / 2, -w / 6, w / 6, w / 2]) {
          P.push(box(2.4, H2, w + 1, GR, { x: x + u, y: y0 + H2 / 2 }), box(w + 1, H2, 2.4, GR, { x, y: y0 + H2 / 2, z: u }));
        }
        const y1 = y0 + H2;
        P.push(box(w + 2, 2.4, w + 2, GD, { x, y: y1 + 1.2 }));
        P.push(box(28, 14, 28, GR, { x, y: y1 + 9.4, ry: PI / 4 }), box(29, 1.6, 29, GD, { x, y: y1 + 17.2, ry: PI / 4 }));
        P.push(box(14, 4, 14, GL, { x, y: y1 + 20, ry: PI / 4, glow: 0.7 }));
        P.push(cyl(0.5, 0.8, 6, 5, STEEL, { x, y: y1 + 25 }), lamp(x, y1 + 28.6, 0, 1.6, AVI));
        P.push(lamp(x + 17, y1 + 2.6, 17, 1.4, AVI), lamp(x - 17, y1 + 2.6, -17, 1.4, AVI));
      }
      // podium wings
      P.push(box(140, 22, 30, GR, { y: 11, z: -38 }), plane(130, 4, WARM, { y: 12, z: -53.1, ry: PI, glow: 0.8 }));
      P.push(box(36, 40, 10, GD, { y: 20, z: 28 }), plane(30, 14, WARM, { y: 12, z: 33.1, glow: 0.8 }));
      return merge(P);
    },
  },

  shinjuku_towers: {
    name: '新宿の高層ビル群', kind: 'landmark',
    build: () => {
      const r = rng(2201), P = [];
      P.push(box(650, 0.8, 470, 0x8d9196, { y: 0.4 }));
      for (const x of [-160, 0, 160]) P.push(box(16, 0.3, 470, 0x6f747a, { x, y: 0.95 }));
      for (const z of [-80, 90]) P.push(box(650, 0.3, 16, 0x6f747a, { y: 0.95, z }));
      P.push(flat(blob(2202, 70, 60, 10, 0.1), 0.8, 0.6, 0x5fa64c, { x: -250, z: 175 }));
      for (let i = 0; i < 6; i++) P.push(rtree(-290 + (i % 3) * 38, 150 + Math.floor(i / 3) * 44, 9, i % 2 ? 0xe8a530 : GREENS[i % 4], 1.4));
      const pad = (x, z, w, d) => P.push(box(w, 2, d, 0xc9c6bf, { x, y: 1 }));
      // 1 park tower: three stepped square towers with pyramid tops
      {
        const x = -240, z = -160; pad(x, z, 100, 80);
        for (const [dx, dz, H] of [[-22, -14, 235], [8, 6, 205], [30, 22, 178]]) {
          P.push(litTower(x + dx, z + dz, 34, 34, H - 18, 0xd7dde3, 0x8a929a, { roof: false, nb: 6 }));
          P.push(sq(2, 17.5, 16, 0x9aa3ab, { x: x + dx, z: z + dz, y: H - 18 + 3 + 8 }));
        }
      }
      // 2 opera city: grey tower with slanted crown
      {
        const x = -85, z = -165; pad(x, z, 90, 80);
        P.push(litTower(x, z, 46, 40, 210, 0xc9d8e6, 0x6f7a86, { roof: false, nb: 7 }));
        P.push(extrude([[-23, 0], [23, 0], [23, 8], [-23, 24]], 40, 0x6f7a86, { x, z, y: 213 }));
      }
      // 3 cocoon tower: egg-shaped lattice
      {
        const x = 70, z = -160; pad(x, z, 70, 70);
        P.push(lathe([[18, 0], [24, 30], [27, 80], [25, 130], [19, 170], [10, 194], [0.01, 204]], 12, 0x8fb6d8, { x, z, glow: 0.45 }));
        for (let k = 0; k < 10; k++) {
          const a = (k * TAU) / 10;
          for (const [y0, y1, r0, r1] of [[0.8, 80, 18.6, 27.6], [80, 170, 27.6, 19.6], [170, 204, 19.6, 0.5]]) {
            P.push(beam([x + Math.sin(a) * r0, y0, z + Math.cos(a) * r0], [x + Math.sin(a + 0.5) * r1, y1, z + Math.cos(a + 0.5) * r1], 1.4, 0xf5f7fa));
          }
        }
      }
      // 4 mitsui: black tower with white vertical lines
      {
        const x = 230, z = -150; pad(x, z, 90, 70);
        P.push(litTower(x, z, 56, 40, 225, 0x2c323a, 0xeceef0, { glow: 0.3, nb: 8, bt: 1.6 }));
        for (const u of [-18, -6, 6, 18]) P.push(box(1.6, 225, 41, 0xeceef0, { x: x + u, y: 112.5, z }));
      }
      // 5 sumitomo: triangular-hexagonal prism
      {
        const x = -235, z = 15; pad(x, z, 90, 90);
        P.push(cyl(42, 42, 210, 3, 0xdfe3e7, { x, z, y: 105, ry: PI }), cyl(30, 30, 210, 6, 0xdfe3e7, { x, z, y: 105, ry: PI }));
        for (let y = 20; y < 205; y += 12) P.push(cyl(30.6, 30.6, 3, 6, COOL, { x, z, y, ry: PI, glow: 0.8 }));
        P.push(lamp(x, 213, z, 2, AVI));
      }
      // 6 center building: brown
      {
        const x = -80, z = 10; pad(x, z, 80, 70);
        P.push(litTower(x, z, 50, 34, 223, 0xd8c8b2, 0x7a5a44, { nb: 8 }));
      }
      // 7 sompo: flared base
      {
        const x = 75, z = 15; pad(x, z, 90, 70);
        P.push(extrude([[-40, 0], [40, 0], [26, 60], [24, 200], [-24, 200], [-26, 60]], 36, 0xb89a78, { x, z }));
        for (let y = 70; y < 196; y += 10) P.push(box(48.6, 2.4, 36.6, WARM, { x, y, z, glow: 0.8 }));
        P.push(lamp(x, 202, z, 2, AVI));
      }
      // 8 nomura: dark slab with bevelled top
      {
        const x = 235, z = 20; pad(x, z, 80, 70);
        P.push(litTower(x, z, 50, 36, 196, 0xd2c6b4, 0x3b302a, { roof: false, nb: 8 }));
        P.push(extrude([[-25, 0], [25, 0], [17, 14], [-17, 14]], 36, 0x3b302a, { x, z, y: 199 }));
      }
      // 9 keio plaza: white slab, 10 hilton-ish twin slab, 11 island tower
      P.push(litTower(-80, 170, 70, 26, 178, 0xe8edf2, 0xfafafa, { nb: 9, bt: 1.6 }));
      P.push(litTower(80, 160, 54, 30, 150, 0xd9e4ee, 0xe9e9e6, { nb: 6 }), litTower(98, 186, 40, 22, 120, 0xd9e4ee, 0xe9e9e6, { nb: 5 }));
      P.push(litTower(240, 170, 42, 42, 189, 0xc4d6e8, 0x55606c, { nb: 7 }), box(10, 22, 4, 0xd8382c, { x: 240, y: 11, z: 196, glow: 0.4 }));
      for (let i = 0; i < 6; i++) { const h = 14 + r() * 20; P.push(box(30 + r() * 20, h, 30, 0xb8b4ac, { x: -300 + i * 120, y: h / 2 + 0.8, z: -215 })); }
      return merge(P);
    },
  },

  shibuya: {
    name: '渋谷のスクランブル交差点', kind: 'landmark',
    build: () => {
      const r = rng(2301), P = [], SCR = [0xff3cac, 0x2ee6ff, 0xffe23a, 0x7aff5a, 0xff7a2a, 0xa06bff];
      P.push(box(380, 0.8, 380, 0x4c5056, { y: 0.4 }));
      const up = (w, h, col, o) => plane(w, h, col, { ...o, rx: -PI / 2 });
      // zebra crossings around the intersection + the diagonal X
      for (let k = 0; k < 4; k++) {
        const c = Math.cos((k * PI) / 2), s = Math.sin((k * PI) / 2);
        for (let i = 0; i < 9; i++) {
          const u = -24 + i * 6, v = 38;
          P.push(group([up(2.6, 12, 0xffffff, { y: 0.85 })], { x: u * c + v * s, z: -u * s + v * c, ry: (k * PI) / 2 }));
        }
      }
      for (const d of [1, -1]) for (let i = 0; i < 11; i++) {
        const t = -30 + i * 6;
        P.push(group([up(2.6, 9, 0xffffff, { y: 0.86 })], { x: t, z: d * t, ry: d > 0 ? -PI / 4 : PI / 4 }));
      }
      // the four corner blocks
      const blk = (cx, cz) => P.push(box(142, 1.2, 142, 0x9a9da2, { x: cx, y: 0.6, z: cz }));
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) blk(sx * 119, sz * 119);
      // facades facing the crossing get big glowing screens
      const bld = (x, z, w, d, h, col, scr) => {
        P.push(box(w, h, d, col, { x, y: h / 2 + 1.2, z }));
        P.push(box(w + 0.6, 1.2, d + 0.6, shade(col, 0.8), { x, y: h + 1.8, z }));
        P.push(bands({ w, d, cx: x, cz: z, ys: [h * 0.3, h * 0.6], h: 2.4, col: WARM, glow: 0.8, inset: 2 }));
        if (scr) {
          const fx = -Math.sign(x), fz = -Math.sign(z), useX = Math.abs(x) > Math.abs(z);
          const sw = Math.min(useX ? d : w, 30) * 0.85, sh = Math.min(h * 0.45, 22);
          const o = useX ? { x: x + fx * (w / 2 + 0.3), z, ry: fx > 0 ? PI / 2 : -PI / 2 } : { x, z: z + fz * (d / 2 + 0.3), ry: fz > 0 ? 0 : PI };
          P.push(plane(sw, sh, SCR[Math.floor(r() * SCR.length)], { ...o, y: h * 0.62 + 1.2, glow: 1 }));
        }
      };
      const COL = [0xe8e4dc, 0xd8d2c8, 0xb9c2cc, 0xf0d8b8, 0xc8d8e0, 0xe0c0c0, 0x9aa8b8, 0xf2efe6];
      for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1]]) {
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          if (sx < 0 && sz > 0 && i === 0 && j === 0) continue; // 109-style cylinder goes here
          const x = sx * (66 + i * 46), z = sz * (66 + j * 46), front = i === 0 || j === 0;
          bld(x, z, 38, 38, front ? 30 + r() * 30 : 18 + r() * 40, COL[Math.floor(r() * COL.length)], front);
        }
      }
      // 109-style silver cylinder tower at the fork
      P.push(cyl(17, 17, 66, 12, 0xd6dbe0, { x: -70, y: 34.2, z: 70 }), cyl(17.4, 17.4, 8, 12, 0xff3a5a, { x: -70, y: 58, z: 70, glow: 0.9 }));
      P.push(box(5, 82, 5, 0xc8cdd2, { x: -82, y: 42, z: 82 }));
      // station building + scramble-square-style tower in the remaining block, elevated green train
      P.push(box(130, 26, 46, 0xe6e8ea, { x: 120, y: 14.2, z: -50 }), plane(120, 6, COOL, { x: 120, y: 14, z: -26.8, glow: 0.8 }));
      P.push(plane(60, 18, SCR[1], { x: 110, y: 20, z: -26.6, glow: 1 }));
      P.push(litTower(130, -130, 60, 56, 200, 0xbcd6ea, 0x4f5c6a, { nb: 8 }));
      P.push(box(50, 26, 44, 0xbcd6ea, { x: 130, y: 214, z: -134, glow: 0.5 }), box(46, 3, 40, 0x4f5c6a, { x: 130, y: 228, z: -134 }));
      P.push(box(14, 1.6, 380, 0x9aa0a6, { x: 180, y: 14 }));
      for (let i = 0; i < 9; i++) P.push(box(3.6, 4, 19.4, 0x6fc04a, { x: 180, y: 16.8, z: -160 + i * 20 }));
      P.push(box(3.7, 1, 178, 0xbfe0f5, { x: 180, y: 17.6, z: -70, glow: 0.8 }));
      // rooftop billboards
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.4, x = Math.cos(a) * 100, z = Math.sin(a) * 100;
        P.push(box(22, 10, 2, SCR[i % SCR.length], { x, y: 72, z, ry: Math.atan2(x, z) + PI, glow: 1 }));
        P.push(box(1.4, 70, 1.4, STEEL, { x, y: 35, z }));
      }
      return merge(P);
    },
  },

  kaminarimon: {
    name: '浅草の雷門', kind: 'landmark',
    build: () => {
      const VR = 0xd2321e, DK = 0x35383f, P = [];
      // stone platform, Nakamise shopping street behind
      P.push(box(124, 3, 72, 0xa8a49a, { y: 1.5 }));
      P.push(box(30, 1, 60, 0xd8d0bc, { y: 0.5, z: -66 }));
      for (const s of [-1, 1]) {
        P.push(box(14, 9, 54, 0xf1e6d0, { x: s * 22, y: 4.5, z: -66 }), gable(56, 16, 5, 0xc8452e, { x: s * 22, y: 9, z: -66, ry: PI / 2 }));
        P.push(plane(52, 3, WARM, { x: s * 15, y: 4, z: -66, ry: -s * PI / 2, glow: 0.85 }));
      }
      // vermilion pillars, beams, bracket band
      for (const x of [-52, -19, 19, 52]) for (const z of [-17, 17]) P.push(cyl(3.6, 3.9, 68, 8, VR, { x, z, y: 37 }));
      for (const z of [-17, 17]) P.push(box(116, 5, 4.4, VR, { y: 69, z }), box(112, 3, 3, VR, { y: 56, z }));
      for (const x of [-52, -19, 19, 52]) P.push(box(4.4, 5, 38, VR, { x, y: 69 }));
      P.push(box(120, 6, 44, 0x6a3a2a, { y: 74.5 }), box(122, 1.6, 46, 0x2e8a5e, { y: 78 }));
      // guardian niches with lattice (wind god green, thunder god red)
      for (const s of [-1, 1]) {
        P.push(box(32, 48, 3, VR, { x: s * 35.5, y: 27, z: -10 }));
        P.push(ico(1, 1, s < 0 ? 0x3f9a6a : 0xc8402a, { x: s * 35.5, y: 22, z: 2, sx: 9, sy: 16, sz: 7 }));
        P.push(sphere(5, 7, 5, s < 0 ? 0x3f9a6a : 0xc8402a, { x: s * 35.5, y: 42, z: 2 }));
        for (let i = 0; i < 6; i++) P.push(box(1.2, 48, 1.2, 0x2a2a2a, { x: s * 35.5 - 14 + i * 5.6, y: 27, z: 12 }));
        P.push(box(32, 2, 1.6, 0x2a2a2a, { x: s * 35.5, y: 50, z: 12 }));
      }
      // big hipped-gable roof with heavy dark tiles
      P.push(hip(61, 36, 15, 0.55, DK, { y: 79 }));
      P.push(box(124, 2.6, 2, VR, { y: 80, z: 36.4, glow: 0.3 }), box(124, 2.6, 2, VR, { y: 80, z: -36.4, glow: 0.3 }), box(2, 2.6, 74.8, VR, { x: 61.4, y: 80 }), box(2, 2.6, 74.8, VR, { x: -61.4, y: 80 }));
      P.push(gable(70, 40, 16, DK, { y: 93 }));
      P.push(box(74, 3.4, 4, 0x222428, { y: 109 }));
      for (const s of [-1, 1]) {
        P.push(box(6, 9, 5, 0x222428, { x: s * 37, y: 112 }));
        P.push(extrude([[-20, 0], [20, 0], [0, 15]], 1.2, 0xeae2cc, { x: s * 35, y: 93.4, ry: PI / 2 }));
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(beam([sx * 58, 80, sz * 33], [sx * 63, 86, sz * 38], 3, DK));
      // the giant red lantern with black rims and abstract black brush strokes
      P.push(lathe([[0.01, 0], [13, 0.6], [17.6, 5], [19.4, 15], [19.4, 23], [17.6, 33], [13, 37.4], [0.01, 38]], 14, 0xe0281a, { y: 14, glow: 0.6 }));
      P.push(cyl(15, 15, 3.4, 14, 0x1e1e1e, { y: 14.6 }), cyl(15, 15, 3.4, 14, 0x1e1e1e, { y: 51.4 }));
      P.push(cyl(1.6, 1.6, 15, 6, 0x1e1e1e, { y: 60 }));
      for (const s of [1, -1]) {
        const z = s * 19.5, ry = s > 0 ? 0 : PI;
        P.push(box(9, 2.2, 1, 0x161616, { x: -1, y: 40, z, ry, rz: 0.1 }), box(2.2, 12, 1, 0x161616, { x: 0, y: 35, z, ry }));
        P.push(box(8, 2, 1, 0x161616, { x: 0, y: 29, z, ry, rz: -0.08 }), box(2, 7, 1, 0x161616, { x: -4, y: 22, z, ry, rz: 0.3 }), box(2, 7, 1, 0x161616, { x: 4, y: 22, z, ry, rz: -0.3 }));
      }
      // five-storey pagoda behind (offset to the west)
      const px = -30, pz = -118;
      P.push(box(40, 5, 40, 0xb0aca2, { x: px, y: 2.5, z: pz }));
      for (let i = 0; i < 5; i++) {
        const w = 26 - i * 2.8, y0 = 5 + i * 21;
        P.push(box(w, 12, w, VR, { x: px, y: y0 + 6, z: pz }));
        P.push(plane(w * 0.5, 5, WARM, { x: px, y: y0 + 6, z: pz + w / 2 + 0.1, glow: 0.7 }));
        P.push(box(w + 2, 3, w + 2, 0x6a3a2a, { x: px, y: y0 + 13.5, z: pz }));
        P.push(hip(w / 2 + 10, w / 2 + 10, 6, 0.5, DK, { x: px, y: y0 + 15, z: pz }));
      }
      P.push(cyl(1.4, 1.4, 34, 6, 0xd8a83a, { x: px, y: 128, z: pz, glow: 0.3 }));
      for (let i = 0; i < 9; i++) P.push(cyl(3.6 - i * 0.18, 3.6 - i * 0.18, 1, 8, 0xd8a83a, { x: px, y: 116 + i * 3, z: pz, glow: 0.3 }));
      P.push(sphere(2.4, 6, 4, 0xd8a83a, { x: px, y: 146, z: pz, glow: 0.4 }));
      return centred(merge(P));
    },
  },

  tokyo_dome: {
    name: '東京ドーム', kind: 'landmark',
    build: () => {
      const P = [], N = 20;
      P.push(cyl(125, 125, 1, N, 0xc9c6bc, { y: 0.5 }));
      P.push(lathe([[102, 1], [102, 25], [99, 30]], N, 0xdfe2e5));
      P.push(lathe([[102.4, 8], [102.4, 14]], N, WARM, { glow: 0.8 }));
      P.push(lathe([[102.3, 21], [102.3, 23]], N, 0x3f7fd0, { glow: 0.3 }));
      const dome = [[99, 30], [88, 38.5], [72, 45.5], [52, 51], [28, 54.6], [0.01, 56]];
      P.push(lathe(dome, N, 0xf6f8fa, { glow: 0.12 }));
      // cable net lines in two diagonal directions
      const hAt = (rr) => { for (let i = 0; i < dome.length - 1; i++) { const [r0, y0] = dome[i], [r1, y1] = dome[i + 1]; if (rr <= r0 && rr >= r1) return lerp(y0, y1, (r0 - rr) / (r0 - r1)); } return 56; };
      for (const d of [-1, 1]) for (let k = -3; k <= 3; k++) {
        const pts = [];
        for (let t = -1; t <= 1.0001; t += 0.25) {
          const u = k * 26, v = t * 96, x = (u + v * d) / SQ2, z = (v - u * d) / SQ2, rr = Math.hypot(x, z);
          if (rr < 97) pts.push([x, hAt(rr) + 0.6, z]);
        }
        for (let i = 0; i < pts.length - 1; i++) P.push(beam(pts[i], pts[i + 1], 1.2, 0xb8c2cc));
      }
      // entrance gates + floodlight ring
      for (let k = 0; k < 4; k++) {
        const a = (k * TAU) / 4 + PI / 4;
        P.push(group([box(28, 16, 10, 0xece8e0, { y: 8, z: 104 }), plane(22, 6, WARM, { y: 7, z: 109.1, glow: 0.85 })], { ry: a }));
      }
      for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; P.push(lamp(Math.sin(a) * 100.5, 30.5, Math.cos(a) * 100.5, 2.4, LAMP)); }
      return merge(P);
    },
  },

  rainbow_bridge: {
    name: 'レインボーブリッジ', kind: 'landmark',
    build: () => {
      const WH = 0xf6f6f2, P = [], TX = 285, TH = 126, DY = 52, CZ = 16.5;
      // double deck: upper highway (top y = 52), lower deck (top y = 42), white truss between
      P.push(box(780, 3, 30, 0xe8e8e4, { y: DY - 1.5 }), box(780, 0.4, 26, 0x6c7078, { y: DY + 0.2 }));
      P.push(box(780, 2.4, 26, 0xe8e8e4, { y: 40.8 }), box(780, 0.3, 4, 0x6c7078, { y: 42.15 }));
      for (const z of [-14.6, 14.6]) {
        P.push(box(780, 1.6, 1.6, WH, { y: 48.8, z }), box(780, 1.6, 1.6, WH, { y: 40.4, z }));
        for (let x = -390; x < 390; x += 26) {
          P.push(beam([x, 41, z], [x + 13, 48.6, z], 1.2, WH), beam([x + 13, 48.6, z], [x + 26, 41, z], 1.2, WH));
        }
        P.push(box(760, 0.6, 0.6, 0xffe7a0, { y: 50.2, z: z * 1.03, glow: 0.9 }));
      }
      // towers (two legs + ladder cross beams)
      for (const s of [-1, 1]) {
        const x = s * TX;
        P.push(box(26, 6, 50, 0xb9bcbc, { x, y: 3 }));
        for (const z of [-CZ, CZ]) P.push(box(7, TH, 7, WH, { x, y: TH / 2, z }));
        for (const y of [37, 62, 86, 108, TH - 2]) P.push(box(6, 5, 2 * CZ + 6, WH, { x, y }));
        P.push(lamp(x, TH + 1.6, -CZ, 2.4, AVI), lamp(x, TH + 1.6, CZ, 2.4, AVI));
        for (const y of [72, 97]) P.push(box(1, 9, 2 * CZ - 7, LAMP, { x: x + s * 3.6, y, glow: 0.9 }), box(1, 9, 2 * CZ - 7, LAMP, { x: x - s * 3.6, y, glow: 0.9 }));
        // anchorage blocks at the ends
        P.push(box(36, DY - 3, 46, 0xd2d2cc, { x: s * 382, y: (DY - 3) / 2 }));
      }
      // main cables (parabolic main span, straight side spans), hangers, rainbow lamps
      const cy = (x) => { const a = Math.abs(x); return a <= TX ? 57 + (TH - 57) * (a / TX) ** 2 : lerp(TH, DY + 4, (a - TX) / (370 - TX)); };
      for (const z of [-CZ, CZ]) {
        let k = 0;
        for (let x = -370; x < 370; x += 18.5) {
          const x1 = x + 18.5;
          P.push(beam([x, cy(x), z], [x1, cy(x1), z], 1.5, WH));
          P.push(box(2.4, 2.4, 2.4, RAIN[Math.floor(k++ / 3) % RAIN.length], { x: x1, y: cy(x1) + 1.4, z, glow: 1 }));
          if (Math.abs(x1) < 368 && cy(x1) - DY > 3 && Math.abs(Math.abs(x1) - TX) > 4) P.push(box(0.6, cy(x1) - DY, 0.6, 0xe0e0dc, { x: x1, y: (cy(x1) + DY) / 2, z }));
        }
      }
      return merge(P);
    },
  },

  odaiba_wheel: {
    name: '大観覧車（お台場）', kind: 'landmark',
    build: () => {
      const P = [], R = 49, HC = 65, WH = 0xf4f4f4;
      P.push(box(110, 9, 34, 0xe6eaee, { y: 4.5 }), box(112, 1, 36, 0x3f7fd0, { y: 9.4 }));
      P.push(bands({ w: 110, d: 34, ys: [4.5], h: 3, col: WARM, glow: 0.85, inset: 4 }));
      for (const s of [-1, 1]) {
        P.push(beam([-26, 9, s * 13], [0, HC, s * 4.5], 3, WH), beam([26, 9, s * 13], [0, HC, s * 4.5], 3, WH));
        P.push(beam([-15, 34, s * 9.6], [15, 34, s * 9.6], 1.6, WH));
      }
      P.push(cyl(3.2, 3.2, 12, 10, STEEL, { y: HC, rx: PI / 2 }), cyl(6, 6, 6, 12, WH, { y: HC, rx: PI / 2 }));
      for (const z of [-3, 3]) P.push(torus(R, 0.9, 4, 48, WH, { y: HC, z }));
      P.push(torus(R - 6, 0.6, 3, 40, WH, { y: HC }));
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * TAU, c = Math.cos(a), s = Math.sin(a);
        for (const z of [-3, 3]) P.push(beam([6 * c, HC + 6 * s, z * 0.6], [(R - 1) * c, HC + (R - 1) * s, z], 0.6, RAIN[i % RAIN.length], { glow: 0.75 }));
      }
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        P.push(box(2.2, 2.2, 7.6, RAIN[Math.floor(i / 2) % RAIN.length], { x: Math.cos(a) * (R + 1.2), y: HC + Math.sin(a) * (R + 1.2), glow: 1 }));
      }
      for (let i = 0; i < 64; i++) {
        const a = ((i + 0.5) / 64) * TAU, gx = (R + 3.4) * Math.cos(a), gy = HC + (R + 3.4) * Math.sin(a) - 1.6;
        P.push(box(3, 3.4, 3.6, i % 16 === 0 ? 0xd8a020 : 0x8fd0f0, { x: gx, y: gy, glow: 0.5 }));
      }
      return merge(P);
    },
  },

  imperial_palace: {
    name: '皇居', kind: 'landmark',
    build: () => {
      const r = rng(2501), P = [];
      const ISL = [[-560, -520], [-180, -610], [260, -560], [600, -470], [650, -120], [610, 280], [540, 560], [120, 610], [-320, 570], [-610, 430], [-670, 40], [-640, -300]];
      const sc = (k) => ISL.map(([x, z]) => [x * k, z * k]);
      // moat ring (water), stone walls, green top
      P.push(flat(sc(1.1), 0, 1, 0x3a86c8, { glow: 0.05 }));
      P.push(flat(ISL, 0, 12, 0xa29d90));
      P.push(flat(sc(0.985), 0, 12.6, 0x5c9e4a));
      P.push(flat(blob(2502, 210, 140, 10, 0.12), 12.6, 0.4, 0x86c060, { x: -150, z: -330 }));
      // palace: white walls, dark copper-green roofs, gravel court
      const Y = 12.6;
      P.push(box(230, 0.5, 120, 0xe0d8c2, { x: -20, y: Y + 0.25, z: 110 }));
      P.push(box(240, 13, 50, 0xf6f3ea, { x: -20, y: Y + 6.5, z: 20 }), hip(126, 31, 12, 0.35, 0x4f6b62, { x: -20, y: Y + 13, z: 20 }));
      P.push(box(50, 12, 160, 0xf6f3ea, { x: 125, y: Y + 6, z: 50 }), hip(31, 86, 11, 0.3, 0x4f6b62, { x: 125, y: Y + 12, z: 50 }));
      P.push(box(50, 12, 120, 0xf6f3ea, { x: -165, y: Y + 6, z: 40 }), hip(31, 66, 11, 0.3, 0x4f6b62, { x: -165, y: Y + 12, z: 40 }));
      P.push(plane(220, 4, WARM, { x: -20, y: Y + 6, z: 45.1, glow: 0.8 }));
      // castle keep base (stone) and the white corner turret
      P.push(box(50, 14, 44, 0xa29d90, { x: -150, y: Y + 7, z: -420 }));
      const tx = 470, tz = 440;
      P.push(box(44, 16, 36, 0xa29d90, { x: tx, y: Y + 8, z: tz }));
      for (let i = 0; i < 3; i++) {
        const w = 32 - i * 8, d = 24 - i * 6, y0 = Y + 16 + i * 11;
        P.push(box(w, 8, d, 0xfbfaf4, { x: tx, y: y0 + 4, z: tz }), hip(w / 2 + 4, d / 2 + 4, 5, 0.4, 0x4a5058, { x: tx, y: y0 + 7.5, z: tz }));
      }
      // stone double bridge over the moat (front)
      P.push(box(22, 3, 96, 0xbdb6a8, { x: 220, y: 8.5, z: 650 }));
      for (const z of [620, 650, 680]) P.push(box(18, 7, 6, 0xa8a194, { x: 220, y: 3.5, z }));
      for (const z of [606, 694]) P.push(lamp(209, 13, z, 2, WARM), lamp(231, 13, z, 2, WARM));
      // gates
      for (const [x, z, ry] of [[-640, -120, PI / 2], [400, -540, 0.2], [-300, 565, 0]]) {
        P.push(group([box(40, 14, 16, 0xfbfaf4, { y: 7 }), hip(23, 11, 6, 0.4, 0x4a5058, { y: 14 })], { x, y: Y, z, ry }));
      }
      // dense palace woods
      for (let i = 0; i < 64; i++) {
        let x = (r() - 0.5) * 1080, z = (r() - 0.5) * 1000;
        if (Math.abs(x + 20) < 190 && z > -40 && z < 190) z -= 260;
        if (Math.hypot(x / 560, z / 520) > 0.95) { x *= 0.8; z *= 0.8; }
        const c = r(), col = c < 0.18 ? AUTUMN[i % 5] : c < 0.3 ? 0x6a9a3a : CEDAR[i % 3];
        P.push(rtree(x, z, 22 + r() * 16, col, Y));
      }
      return centred(merge(P));
    },
  },
  // ===================== hand-placed landmarks: airports & bay =====================
  haneda: {
    name: '羽田空港', kind: 'landmark',
    build: () => {
      const P = [], Y = 2, AP = 0xbcbfc3, TW = 0x80858c;
      P.push(flat([[-1650, -1500], [-300, -1720], [900, -1650], [1650, -1300], [1720, -200], [1500, 700], [1640, 1500], [400, 1720], [-800, 1620], [-1600, 1100], [-1720, 0]], 0, Y, 0x93b07c));
      // aprons and taxiways first (runways paint over them)
      P.push(box(330, 0.3, 980, AP, { x: -235, y: Y + 0.15, z: 50 }), box(330, 0.3, 980, AP, { x: 345, y: Y + 0.15, z: 50 }));
      P.push(box(260, 0.3, 700, AP, { x: -1150, y: Y + 0.15, z: 100 }));
      P.push(box(30, 0.32, 2500, TW, { x: -480, y: Y + 0.16, z: -50 }), box(30, 0.32, 2500, TW, { x: 650, y: Y + 0.16, z: 100 }));
      runway(P, 'z', -650, -1450, 1350, Y);
      runway(P, 'z', 820, -1300, 1500, Y);
      runway(P, 'x', -1150, -1300, 1150, Y + 0.05);
      runway(P, 'x', 1260, -700, 1500, Y + 0.05);
      // terminals: long glass halls with low curved roofs and finger piers
      const term = (x, L, dir, piers) => {
        P.push(box(70, 24, L, 0xe9edf0, { x, y: Y + 12 }));
        P.push(cyl(37, 37, L + 4, 8, 0xc6d2dc, { rx: PI / 2, x, y: Y + 24, sz: 0.22 }));
        for (const s of [-1, 1]) P.push(plane(L - 20, 8, COOL, { x: x + s * 35.1, y: Y + 12, ry: s * PI / 2, glow: 0.85 }));
        for (const z of piers) {
          P.push(box(130, 10, 18, 0xdfe4e8, { x: x + dir * 100, y: Y + 5, z }));
          P.push(plane(120, 3, COOL, { x: x + dir * 100, y: Y + 5, z: z + 9.1, glow: 0.8 }));
          for (const s of [-1, 1]) P.push(miniPlane(64, [0xd8262c, 0x1f4fa8, 0x2f9a5a][(piers.indexOf(z) + (s > 0 ? 1 : 0)) % 3], { x: x + dir * 130, y: Y, z: z + s * 48, ry: s > 0 ? PI : 0 }));
        }
      };
      term(-235, 560, 1, [-180, 60, 270]);
      term(345, 560, -1, [-180, 60]);
      term(-1150, 460, -1, [0, 180]);
      // parking garages, hangars, control tower
      for (const z of [-150, 250]) P.push(box(110, 18, 150, 0xcfd2d4, { x: 55, y: Y + 9, z }), plane(100, 3, WARM, { x: 55, y: Y + 9, z: z + 75.1, glow: 0.7 }));
      for (let i = 0; i < 3; i++) P.push(box(120, 30, 90, 0xdfe2e4, { x: 100 + i * 150, y: Y + 15, z: -820 }), cyl(45, 45, 120, 8, 0x5a7fa8, { rz: PI / 2, x: 100 + i * 150, y: Y + 30, z: -820, sx: 0.3 }));
      P.push(cyl(7, 9, 100, 8, WHITE, { x: 55, y: Y + 50, z: 50 }));
      P.push(cyl(16, 12, 12, 8, 0x9fd8ff, { x: 55, y: Y + 106, z: 50, glow: 0.85 }), cyl(17, 17, 2.4, 8, 0xd0d4d8, { x: 55, y: Y + 113, z: 50 }));
      P.push(cyl(0.8, 1.2, 10, 5, WHITE, { x: 55, y: Y + 119, z: 50 }), lamp(55, Y + 125, 50, 3, AVI));
      for (const [x, z] of [[-60, -400], [180, -400], [-60, 500], [180, 500], [-1000, -250], [-1000, 450]]) P.push(box(3, 30, 3, STEEL, { x, y: Y + 15, z }), lamp(x, Y + 31, z, 6, LAMP));
      return merge(P);
    },
  },

  narita: {
    name: '成田空港', kind: 'landmark',
    build: () => {
      const r = rng(2701), P = [], Y = 2, AP = 0xbcbfc3, TW = 0x80858c;
      P.push(flat([[-1450, -1950], [500, -1985], [1450, -1500], [1550, 100], [1400, 1850], [300, 1990], [-1200, 1900], [-1550, 800], [-1600, -900]], 0, Y, 0x76ab58));
      P.push(box(760, 0.3, 1500, AP, { x: 30, y: Y + 0.15, z: 300 }));
      P.push(box(30, 0.32, 3500, TW, { x: -440, y: Y + 0.16, z: -50 }), box(30, 0.32, 2300, TW, { x: 490, y: Y + 0.16, z: 700 }));
      runway(P, 'z', -600, -1900, 1850, Y);
      runway(P, 'z', 650, -500, 1900, Y);
      // terminal 1: main hall + two round satellites; terminal 2: hall + long cross pier
      P.push(box(200, 28, 130, 0xe9edf0, { x: 0, y: Y + 14, z: 950 }), bands({ w: 200, d: 130, cz: 950, ys: [Y + 10, Y + 20], h: 4, col: COOL, glow: 0.85, inset: 6 }));
      for (const x of [-200, 200]) {
        P.push(box(160, 10, 20, 0xdfe4e8, { x: x * 0.55, y: Y + 5, z: 820 }));
        P.push(cyl(58, 58, 14, 14, 0xe4e8ec, { x, y: Y + 7, z: 760 }), cyl(58.4, 58.4, 4, 14, COOL, { x, y: Y + 7, z: 760, glow: 0.8 }));
      }
      P.push(box(180, 28, 240, 0xe9edf0, { x: 20, y: Y + 14, z: -60 }), bands({ w: 180, d: 240, cx: 20, cz: -60, ys: [Y + 10, Y + 20], h: 4, col: COOL, glow: 0.85, inset: 6 }));
      P.push(box(560, 12, 30, 0xdfe4e8, { x: 20, y: Y + 6, z: -240 }), plane(540, 3, COOL, { x: 20, y: Y + 6, z: -224.9, glow: 0.8 }));
      P.push(box(380, 12, 30, 0xdfe4e8, { x: 20, y: Y + 6, z: -520 }), box(26, 10, 280, 0xdfe4e8, { x: 20, y: Y + 5, z: -380 }));
      P.push(box(260, 12, 60, 0xd9dcdf, { x: 60, y: Y + 6, z: 330 }));
      const PL = [[-250, -200, 0], [-130, -200, 0], [140, -200, 0], [260, -200, 0], [-160, -480, 0], [200, -480, 0], [-160, -560, PI], [200, -560, PI], [-280, 760, PI / 2], [280, 760, -PI / 2], [0, 680, 0], [150, 380, PI]];
      PL.forEach(([x, z, ry], i) => P.push(miniPlane(66, [0xd8262c, 0x1f4fa8, 0x2f9a5a, 0xf08a24][i % 4], { x, y: Y, z, ry })));
      // control tower
      P.push(cyl(6, 8, 80, 8, WHITE, { x: 220, y: Y + 40, z: 380 }), cyl(14, 11, 11, 8, 0x9fd8ff, { x: 220, y: Y + 85, z: 380, glow: 0.85 }));
      P.push(cyl(15, 15, 2, 8, 0xd0d4d8, { x: 220, y: Y + 91.5, z: 380 }), lamp(220, Y + 96, 380, 3, AVI));
      // the green countryside around: fields and woods
      const FC = [0xd8b24c, 0x8cbf4f, 0xc9a35a, 0x6fa84a];
      for (let i = 0; i < 12; i++) {
        const x = (i % 2 ? 1 : -1) * (1050 + r() * 250), z = -1600 + i * 280;
        P.push(box(220 + r() * 120, 0.8, 180 + r() * 60, FC[i % 4], { x, y: Y + 0.4, z }));
      }
      for (let i = 0; i < 34; i++) {
        const side = i % 2 ? 1 : -1, x = side * (side > 0 ? 950 + r() * 450 : 900 + r() * 550), z = -1800 + r() * 3600;
        P.push(rtree(x, z, 40 + r() * 30, r() < 0.3 ? AUTUMN[i % 5] : CEDAR[i % 3], Y));
      }
      return merge(P);
    },
  },

  umihotaru: {
    name: '海ほたる', kind: 'landmark',
    build: () => {
      const P = [], L = 650, B = 100, o = { bow: 0.2, stern: 0.08 };
      P.push(hull(L, B, 0, 6, 0x9ea2a4, o), hull(L * 0.995, B * 0.98, 6, 1, 0xe6e6e0, o));
      P.push(box(24, 0.6, 120, 0x60656c, { y: 7.3, z: -240 }), box(1.2, 0.3, 110, 0xffb347, { y: 7.7, z: -240, glow: 0.9 }));
      // open parking decks (dark) with white slab edges
      P.push(hull(L * 0.86, B * 0.8, 7, 15, 0x5f6872, { z: 15, ...o }));
      for (const y of [7, 12, 17]) P.push(hull(L * 0.87, B * 0.81, y + 3.4, 1.4, WHITE, { z: 15, ...o }));
      P.push(hull(L * 0.87, B * 0.81, 21.6, 0.8, 0xfff0c0, { z: 15, glow: 0.5, ...o }));
      // the white "ship": rest-area decks, glowing glass band, top deck and bridge-like tower
      P.push(hull(L * 0.62, B * 0.7, 22, 10, 0xf6f6f2, { z: 45, bow: 0.26, stern: 0.04 }));
      P.push(hull(L * 0.62 + 1.2, B * 0.7 + 1.2, 25, 3.4, 0xbfe6ff, { z: 45, bow: 0.26, stern: 0.04, glow: 0.85 }));
      P.push(hull(L * 0.5, B * 0.58, 32, 3, 0xffffff, { z: 60, bow: 0.3, stern: 0.04 }));
      P.push(box(50, 16, 30, 0xf6f6f2, { y: 43, z: -60 }), box(50.6, 3, 30.6, 0xbfe6ff, { y: 46, z: -60, glow: 0.85 }));
      P.push(cyl(3, 3, 22, 8, WHITE, { y: 62, z: -60 }), lamp(0, 74, -60, 3, AVI));
      P.push(box(B * 0.5, 2, 30, 0x5aa8e0, { y: 35.5, z: 140, glow: 0.25 }));
      for (let i = 0; i < 12; i++) P.push(lamp(i % 2 ? 44 : -44, 23.5, -240 + i * 46, 2.4, LAMP));
      return merge(P);
    },
  },

  // ===================== hand-placed landmarks: Kamakura / Shonan =====================
  daibutsu: {
    name: '鎌倉の大仏', kind: 'landmark',
    build: () => {
      const BZ = 0x5f9282, BZd = 0x4c7a6c, BZl = 0x6fa492, ST = 0x9d998e, P = [];
      // stone pedestal + lotus petals
      P.push(cyl(36, 38, 4, 10, ST, { y: 2, sz: 0.82 }), cyl(31, 33, 4, 10, shade(ST, 0.88), { y: 6, sz: 0.82 }));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        P.push(ico(1, 0, BZd, { x: Math.sin(a) * 27, z: Math.cos(a) * 27 * 0.82, y: 9.5, sx: 7, sy: 2.4, sz: 5, ry: a }));
      }
      // crossed legs, knees, lap and joined hands
      P.push(ico(1, 1, BZ, { y: 15, z: 5, sx: 29, sy: 8, sz: 17 }));
      for (const s of [-1, 1]) P.push(ico(1, 1, BZ, { x: s * 19, y: 14.5, z: 9, sx: 12, sy: 7, sz: 11 }));
      // torso and robe, slightly leaning forward
      P.push(ico(1, 1, BZ, { y: 33, z: -1, sx: 19, sy: 22, sz: 13.5 }));
      P.push(ico(1, 1, BZd, { y: 41, z: -3, sx: 23, sy: 11, sz: 14 }));
      P.push(lathe([[22, 0], [20, 6], [0.01, 6.5]], 12, BZd, { y: 20.5, z: 2, sz: 0.7 }));
      // arms resting into the lap
      for (const s of [-1, 1]) {
        P.push(limb([s * 20, 42, -2], [s * 22, 27, 4], 5, BZ));
        P.push(limb([s * 22, 27, 4], [s * 7, 22, 13], 4.4, BZ));
      }
      P.push(ico(1, 1, BZl, { y: 22.5, z: 14, sx: 11, sy: 3.6, sz: 6.5 }));
      // neck, head, ushnisha, curls, long ears, serene face
      P.push(cyl(7, 8, 7, 10, BZ, { y: 50, z: -1 }));
      P.push(sphere(12, 12, 9, BZ, { y: 61, z: 1, sy: 1.08 }));
      P.push(sphere(7, 9, 6, BZd, { y: 72.6, z: 0 }));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU, rr = i % 2 ? 9.2 : 6.6, yy = i % 2 ? 67.5 : 70.5;
        P.push(ico(1.9, 0, BZd, { x: Math.sin(a) * rr, y: yy, z: 1 + Math.cos(a) * rr }));
      }
      for (const s of [-1, 1]) P.push(limb([s * 12.2, 64, 0], [s * 12.6, 52.5, 1], 2, BZ));
      for (const s of [-1, 1]) P.push(box(3.2, 0.6, 1.2, 0x3a5e52, { x: s * 3.7, y: 61.6, z: 11.9, rz: s * 0.1 }));
      P.push(box(1.8, 4.4, 2, BZ, { y: 58.8, z: 12.6 }), box(3, 0.6, 1, 0x3a5e52, { y: 54.8, z: 11.4 }));
      P.push(sphere(0.9, 6, 4, 0xd8c070, { y: 66.4, z: 12.3, glow: 0.4 }));
      return merge(P);
    },
  },

  enoshima: {
    name: '江の島', kind: 'landmark',
    build: () => {
      const r = rng(2801), P = [], SZ = 0.72;
      const prof = [[590, 0], [575, 20], [545, 40], [460, 64], [350, 90], [230, 110], [110, 124], [0.01, 130]];
      P.push(lathe(prof.slice(0, 3), 18, 0x9a8468, { sz: SZ }));
      P.push(lathe(prof.slice(2), 18, 0x4f9046, { sz: SZ }));
      const hAt = (d) => { for (let i = 0; i < prof.length - 1; i++) { const [r0, y0] = prof[i], [r1, y1] = prof[i + 1]; if (d <= r0 && d >= r1) return lerp(y0, y1, (r0 - d) / (r0 - r1)); } return 130; };
      for (let i = 0; i < 38; i++) {
        const a = r() * TAU, d = 70 + r() * 440, x = Math.cos(a) * d, z = Math.sin(a) * d * SZ;
        const c = r(), col = c < 0.22 ? AUTUMN[i % 5] : GREENS[i % 4];
        P.push(rtree(x, z, 28 + r() * 16, col, hAt(d) - 8));
      }
      // shrine buildings on the north slope + big torii at the bridge landing
      for (const [x, d] of [[-120, 420], [30, 330], [140, 250]]) {
        const z = d * SZ, y = hAt(d);
        P.push(box(40, 14, 24, RED, { x, y: y + 5, z }), gable(46, 30, 10, 0x3f6f5e, { x, y: y + 12, z }));
      }
      P.push(torii(46, RED, { x: 0, y: 30, z: 570 * SZ }));
      // the sea-candle lighthouse on the summit
      const lx = -40, lz = -20, y0 = 128;
      P.push(cyl(6, 9, 52, 8, WHITE, { x: lx, y: y0 + 26, z: lz }));
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8;
        P.push(beam([lx + Math.sin(a) * 13, y0, lz + Math.cos(a) * 13], [lx + Math.sin(a + 1.2) * 8, y0 + 50, lz + Math.cos(a + 1.2) * 8], 1.6, 0xeeeeee));
      }
      P.push(cyl(17, 12, 11, 8, 0x9fd0f0, { x: lx, y: y0 + 57, z: lz, glow: 0.85 }), cyl(18, 18, 2, 8, WHITE, { x: lx, y: y0 + 63.5, z: lz }));
      P.push(cyl(6, 6, 9, 8, 0xfff1a0, { x: lx, y: y0 + 69, z: lz, glow: 1 }), cone(7.5, 8, 8, 0xd8382c, { x: lx, y: y0 + 77.5, z: lz }));
      // Benten bridge stub toward the mainland (+Z) and the yacht harbour (east)
      P.push(box(16, 2.4, 230, 0xd0d0ca, { y: 9, z: 545 * SZ + 105 }));
      for (let i = 0; i < 6; i++) P.push(box(5, 8, 5, 0xb8b8b2, { y: 4, z: 545 * SZ + 10 + i * 40 }), lamp(9, 14, 545 * SZ + 10 + i * 40, 2.4, LAMP));
      P.push(flat([[520, -60], [640, -40], [650, 120], [560, 160], [470, 60]], 0, 4, 0xc4c2bc));
      for (let i = 0; i < 14; i++) P.push(box(5, 3, 14, 0xffffff, { x: 520 + (i % 5) * 22, y: 5.5, z: -20 + Math.floor(i / 5) * 40 }), box(0.6, 18, 0.6, 0xe0e0e0, { x: 520 + (i % 5) * 22, y: 13, z: -20 + Math.floor(i / 5) * 40 }));
      return merge(P);
    },
  },

  theme_park: {
    name: '遊園地', kind: 'landmark',
    build: () => {
      const r = rng(2901), P = [], PATH = 0xf2d8bc, Y = 1;
      P.push(flat(blob(2902, 490, 400, 16, 0.04), 0, Y, 0xc4dc98));
      P.push(flat(blob(2903, 165, 110, 12, 0.16), Y, 0.6, WATER, { x: -210, z: 70 }));
      P.push(flat(blob(2904, 40, 28, 8, 0.1), Y, 1.4, 0x6fb35a, { x: -220, z: 70 }));
      P.push(box(30, 0.4, 560, PATH, { y: Y + 0.2, z: 90 }), box(820, 0.4, 30, PATH, { y: Y + 0.2, z: -130 }), cyl(64, 64, 0.5, 12, PATH, { y: Y + 0.25, z: 230 }));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; P.push(cyl(9, 9, 0.8, 6, RAIN[i], { x: Math.sin(a) * 44, y: Y + 0.5, z: 230 + Math.cos(a) * 44 })); }
      // entrance gate (front, +Z)
      P.push(box(18, 40, 18, 0xff4f6a, { x: -48, y: Y + 20, z: 368 }), box(18, 40, 18, 0x4cc4ff, { x: 48, y: Y + 20, z: 368 }));
      P.push(box(120, 14, 18, 0xffe14a, { y: Y + 46, z: 368, glow: 0.5 }));
      for (let i = 0; i < 5; i++) P.push(sphere(7, 6, 4, RAIN[i], { x: -48 + i * 24, y: Y + 59, z: 368, glow: 0.8 }));
      // roller coaster: lift hill, airtime hills, two vertical loops
      const cx = 235, cz = -10, N = 48;
      const KH = [[0, 14], [0.7, 100], [0.95, 12], [1.5, 64], [1.95, 16], [2.6, 52], [3.15, 14], [3.4, 14], [4.2, 44], [4.75, 12], [5.25, 12], [6.2, 14], [TAU, 14]];
      const hAt = (t) => { for (let i = 0; i < KH.length - 1; i++) if (t <= KH[i + 1][0]) return lerp(KH[i][1], KH[i + 1][1], (t - KH[i][0]) / (KH[i + 1][0] - KH[i][0])); return 14; };
      const pt = (t) => [cx + Math.cos(t) * 200 + Math.sin(3 * t) * 30, Y + hAt(t), cz + Math.sin(t) * 235];
      for (let i = 0; i < N; i++) {
        const a = pt((i / N) * TAU), b = pt(((i + 1) / N) * TAU);
        P.push(seg(a, b, 9, 3, 0xe8322c, { glow: 0.35 }));
        if (i % 2 === 0) P.push(box(3, a[1] - Y - 1.5, 3, 0xf4f4f4, { x: a[0], y: (a[1] + Y) / 2, z: a[2] }));
      }
      for (const t of [3.28, 5.0]) {
        const a = pt(t - 0.02), b = pt(t + 0.02), dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
        const p = pt(t), R = 36, M = 16, lp = [];
        for (let j = 0; j <= M; j++) {
          const f = (j / M) * TAU, side = (j / M - 0.5) * 14;
          lp.push([p[0] + ux * R * Math.sin(f) - uz * side, p[1] + R * (1 - Math.cos(f)), p[2] + uz * R * Math.sin(f) + ux * side]);
        }
        for (let j = 0; j < M; j++) P.push(beam(lp[j], lp[j + 1], 6, 0xffb000, { glow: 0.4 }));
        P.push(box(3, R, 3, 0xf4f4f4, { x: p[0], y: p[1] + R / 2, z: p[2] }));
      }
      P.push(box(50, 14, 22, 0x7a6cff, { x: cx + 200, y: Y + 7, z: cz }), box(52, 2, 24, 0xffe14a, { x: cx + 200, y: Y + 15, z: cz, glow: 0.6 }));
      // big ferris wheel, drop tower, carousel, swing ride, teacups
      P.push(group(ferris(62, 72, { nG: 28, nS: 14, seg: 30 }), { x: -330, z: -230, ry: 0.5 }));
      P.push(cyl(7, 9, 150, 8, 0xf4f4f4, { x: 40, y: Y + 75, z: -300 }), cyl(20, 20, 9, 12, 0xff4f6a, { x: 40, y: Y + 60, z: -300, glow: 0.6 }));
      P.push(cone(11, 14, 8, 0x4cc4ff, { x: 40, y: Y + 157, z: -300, glow: 0.4 }), lamp(40, Y + 165, -300, 4, AVI));
      P.push(cyl(28, 28, 12, 12, 0xf0c24a, { y: Y + 6, z: 230, glow: 0.6 }), cone(34, 20, 12, 0xff4f6a, { y: Y + 22, z: 230, glow: 0.3 }), sphere(4, 6, 4, 0xffe14a, { y: Y + 33, z: 230, glow: 0.8 }));
      P.push(cyl(3, 3.6, 54, 6, 0xf4f4f4, { x: -90, y: Y + 27, z: -260 }), cone(36, 14, 12, 0x5ee07a, { x: -90, y: Y + 57, z: -260, glow: 0.3 }));
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; P.push(beam([-90 + Math.sin(a) * 30, Y + 51, -260 + Math.cos(a) * 30], [-90 + Math.sin(a) * 42, Y + 22, -260 + Math.cos(a) * 42], 1, 0x8a929a), box(5, 4, 5, RAIN[i % 7], { x: -90 + Math.sin(a) * 42, y: Y + 20, z: -260 + Math.cos(a) * 42, glow: 0.4 })); }
      P.push(cyl(36, 36, 2.4, 12, 0xffffff, { x: 130, y: Y + 1.2, z: 260 }));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; P.push(cyl(8, 6, 8, 8, RAIN[i], { x: 130 + Math.sin(a) * 22, y: Y + 6.4, z: 260 + Math.cos(a) * 22, glow: 0.3 })); }
      // striped circus tents and colourful pavilions
      const TC = [[0xd8382c, 0xffffff], [0x2c6fd8, 0xffe14a], [0x8a3fbf, 0xffffff], [0x2e9a5a, 0xffe14a], [0xf08a24, 0xffffff], [0xff6fd8, 0x4cc4ff], [0x39b6c8, 0xffffff]];
      for (let i = 0; i < 7; i++) {
        const x = -400 + i * 52, z = 300 - (i % 2) * 74, rr = 24 + (i % 3) * 6, [c1, c2] = TC[i];
        P.push(cyl(rr, rr, 12, 10, c2, { x, y: Y + 6, z }), cone(rr * 1.15, 22, 10, c1, { x, y: Y + 23, z, glow: 0.25 }));
        P.push(box(1, 10, 1, 0xffffff, { x, y: Y + 39, z }), box(6, 3.6, 0.5, c2, { x: x + 3, y: Y + 42, z, glow: 0.5 }));
      }
      for (const [x, z, w, d, col] of [[-30, -40, 90, 60, 0xff8fb0], [60, 120, 70, 50, 0x8fd0ff], [-110, -150, 70, 50, 0xffd05a]]) {
        P.push(box(w, 16, d, col, { x, y: Y + 8, z }), cyl(d * 0.42, d * 0.42, w - 6, 8, 0xf8f8f8, { rz: PI / 2, x, y: Y + 16, z, sx: 0.5 }));
        P.push(plane(w - 10, 4, WARM, { x, y: Y + 7, z: z + d / 2 + 0.1, glow: 0.85 }));
      }
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU, x = Math.cos(a) * 455, z = Math.sin(a) * 365;
        if (z > 300 && Math.abs(x) < 100) continue;
        P.push(rtree(x, z, 16 + r() * 6, r() < 0.35 ? AUTUMN[i % 5] : GREENS[i % 4], Y));
      }
      return merge(P);
    },
  },

  yokohama_mm: {
    name: 'みなとみらいのビル群', kind: 'landmark',
    build: () => {
      const P = [], LAND = 0xc8c4bb, Y = 4;
      P.push(box(900, 0.6, 520, WATER, { y: 0.3 }));
      P.push(flat([[-450, -260], [450, -260], [450, -70], [200, -70], [160, 80], [-60, 105], [-200, 150], [-450, 150]], 0.6, Y - 0.6, LAND));
      P.push(flat([[10, 115], [270, 95], [340, 160], [320, 255], [30, 255]], 0.6, Y - 0.6, LAND));
      P.push(flat(blob(3001, 110, 50, 10, 0.1), Y, 0.5, 0x6fb35a, { x: -330, z: 100 }));
      for (let i = 0; i < 12; i++) P.push(lamp(-440 + i * 40, Y + 6, 150 - (i > 6 ? (i - 6) * 8 : 0), 2.4, LAMP));
      // Landmark Tower: podium + tapering square shaft with lit bands + flared crown
      {
        const x = -270, z = -130, G = 0xd2cab7;
        P.push(box(150, 30, 100, G, { x, y: Y + 15, z }), bands({ w: 150, d: 100, cx: x, cz: z, ys: [Y + 8, Y + 18, Y + 26], h: 3, col: WARM, glow: 0.75, inset: 4 }));
        const y0 = Y + 30, y1 = Y + 262;
        P.push(sq(28.5, 34, y1 - y0, G, { x, z: z - 8, y: (y0 + y1) / 2 }));
        for (let y = y0 + 12; y < y1 - 6; y += 16) { const t = (y - y0) / (y1 - y0); P.push(sq(lerp(34, 28.5, t) + 0.5, lerp(34, 28.5, t) + 0.5, 2.6, 0xfff0c4, { x, z: z - 8, y, glow: 0.85 })); }
        P.push(sq(35, 27, 30, 0xe8e2d4, { x, z: z - 8, y: y1 + 15 }), sq(35.4, 35.4, 1.4, 0xfff0c4, { x, z: z - 8, y: y1 + 29, glow: 1 }));
        P.push(lamp(x, y1 + 31.5, z - 8, 2.6, AVI));
      }
      // Queen's Square: three glass towers with sloping tops on a mall podium
      P.push(box(210, 24, 70, 0xdcdfdf, { x: -55, y: Y + 12, z: -110 }));
      for (const [x, w, hl, hr] of [[-125, 50, 172, 140], [-55, 48, 138, 108], [15, 46, 110, 80]]) {
        P.push(extrude([[-w / 2, 0], [w / 2, 0], [w / 2, hr], [-w / 2, hl]], 40, 0x5b8fb4, { x, y: Y, z: -118 }));
        for (let y = 34; y < hr - 4; y += 12) P.push(bands({ w, d: 40, cx: x, cz: -118, ys: [Y + y], h: 2.4, col: COOL, glow: 0.8, inset: 1 }));
      }
      // other MM21 towers
      for (const [x, z, w, h, g, f] of [[-410, -210, 40, 90, 0xd8e2ea, 0x6f7a86], [-170, -225, 46, 120, 0xc4d6e8, 0x55606c], [100, -200, 44, 140, 0xe0e6ea, 0x8a929a], [210, -190, 50, 100, 0xd8d0c4, 0x7a5a44], [330, -200, 40, 150, 0xbcd6ea, 0x4f5c6a], [380, -120, 40, 70, 0xe8edf2, 0xb0b4b8], [130, -110, 60, 60, 0xd6dee6, 0x3f6fb0]]) {
        P.push(group(litTower(0, 0, w, w * 0.8, h, g, f), { x, y: Y, z }));
      }
      // Pacifico halls + the sail-shaped hotel at the water's edge
      P.push(box(150, 16, 70, 0xf3f4f1, { x: 40, y: Y + 8, z: 20 }), plane(140, 6, COOL, { x: 40, y: Y + 8, z: 55.1, glow: 0.6 }));
      P.push(group([
        extrude([[-48, 0], [48, 0], [44, 30], [34, 62], [18, 92], [4, 110], [-4, 110], [-18, 92], [-34, 62], [-44, 30]], 22, 0xf7f7f3),
        ...repeat(9, (i) => plane(80 - i * 8, 2.2, 0x9fd0f0, { y: 12 + i * 10, z: 11.1, glow: 0.75 })),
      ], { x: 150, y: Y, z: 70, ry: -0.35 }));
      // Cosmo-clock wheel (with clock hub) on Shinko
      P.push(group(ferris(50, 60, { nG: 30, nS: 16, seg: 32, clock: true }), { x: 110, y: Y, z: 180 }));
      // red brick warehouses
      for (const [x, z, L] of [[220, 225, 150], [255, 140, 76]]) {
        P.push(box(L, 18, 22, 0xb4452c, { x, y: Y + 9, z }), box(L + 1, 1, 23, 0xf4efe2, { x, y: Y + 17.5, z }));
        P.push(gable(L + 1.4, 24, 4, 0x7d8389, { x, y: Y + 18, z }));
        for (const s of [1, -1]) for (const y of [4, 9, 14]) P.push(plane(L - 8, 2.2, WARM, { x, y: Y + y, z: z + s * 11.1, ry: s > 0 ? 0 : PI, glow: 0.85 }));
      }
      return merge(P);
    },
  },

  // ===================== mountains =====================
  mt_tsukuba: {
    name: '筑波山', kind: 'nature',
    build: () => {
      const r = rng(3101), P = [], SZ = 0.66;
      const K = 1.05, R0 = 3000, H0 = 700;
      P.push(mount(0, 0, R0, H0, [[0.14, 0x8fb257], [0.6, 0x2f6a38], [1, 0x6f8a3a]], { k: K, sz: SZ, seg: 14 }));
      // twin peaks (west: male peak, east: female peak) — forest skirt, blazing autumn, rocky tips
      for (const [x, H, ry] of [[-560, 1300, 0], [560, 1260, 0.35]]) {
        const y0 = 300;
        P.push(mount(x, 0, 1150, H - y0, [[0.3, 0x2f6a38], [0.62, 0xd2602a], [0.86, 0xa8452a], [1, 0x8a8478]], { k: 1.0, seg: 10, ry, sz: 0.85 }).map((g) => g.translate(0, y0, 0)));
      }
      P.push(dome(0, 0, 700, 330, 520, 0xa8502a).translate(0, 520, 0));
      // forest & autumn-leaf clumps on the lower slopes
      for (let i = 0; i < 34; i++) {
        const a = r() * TAU, d = 1500 + r() * 1300, x = Math.cos(a) * d, z = Math.sin(a) * d * SZ;
        const col = r() < 0.45 ? AUTUMN[i % 5] : GREENS[i % 4];
        P.push(ico(1, 0, col, { x, z, y: mountH(R0, H0, K, d) + 20, sx: 150 + r() * 80, sy: 60, sz: 150 + r() * 80 }));
      }
      return merge(P);
    },
  },

  mt_takao: {
    name: '高尾山', kind: 'nature',
    build: () => {
      const r = rng(3201), P = [], K = 0.85;
      const FB = [[0.35, 0x2f6a38], [0.7, 0x3d6f34], [1, 0x8a7a3a]];
      P.push(mount(0, 0, 1500, 700, FB, { k: K, sz: 0.62, seg: 12 }));
      P.push(mount(-900, 150, 640, 420, FB, { k: K, seg: 9 }), mount(880, -80, 620, 400, FB, { k: K, seg: 9, ry: 0.4 }), mount(250, 380, 560, 300, FB, { k: K, seg: 8 }));
      for (let i = 0; i < 52; i++) {
        const a = r() * TAU, d = 100 + r() * 1250, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.62;
        const c = r(), col = c < 0.45 ? AUTUMN[i % 5] : c < 0.55 ? 0xd8b030 : CEDAR[i % 3];
        P.push(ico(1, 0, col, { x, z, y: mountH(1500, 700, K, d) + 10, sx: 85 + r() * 40, sy: 45, sz: 85 + r() * 40 }));
      }
      // summit temple and observation deck, cable-car line
      P.push(box(60, 18, 40, RED, { y: 700, z: 0 }), hip(40, 28, 16, 0.3, 0x35383f, { y: 708 }));
      P.push(torii(40, RED, { y: 640, z: 160 }));
      P.push(beam([300, 140, 760], [120, 560, 300], 6, 0x6a7078), box(26, 16, 30, 0xf2f2ee, { x: 300, y: 148, z: 760 }), box(20, 12, 16, 0x3fae49, { x: 210, y: 345, z: 530, glow: 0.4 }));
      return merge(P);
    },
  },

  tanzawa: {
    name: '丹沢の山々', kind: 'nature',
    build: () => {
      const r = rng(3301), P = [];
      const BANDS = [[0.45, 0x2d5e34], [0.82, 0xb8622e], [1, 0x8a7a68]];
      const PK = [[-6300, -300, 1200, 950], [-4500, 200, 1600, 1300], [-2600, -200, 1800, 1500], [-700, 100, 1900, 1600], [1200, -250, 1800, 1480], [3000, 150, 1600, 1250], [4700, -150, 1500, 1100], [6300, 300, 1200, 1250]];
      PK.forEach(([x, z, R, H], i) => P.push(mount(x, z, R, H, BANDS, { k: 1.1, seg: 8, ry: r() * TAU, sz: 0.95 + r() * 0.25 })));
      for (let i = 0; i < PK.length - 1; i++) {
        const [x0, z0, , h0] = PK[i], [x1, z1, , h1] = PK[i + 1];
        P.push(dome((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) * 0.6, Math.min(h0, h1) * 0.45, 800, i % 2 ? 0x335f34 : 0x3d6634));
      }
      for (let i = 0; i < 7; i++) {
        const x = -5400 + i * 1800 + (r() - 0.5) * 400, z = (i % 2 ? 1 : -1) * (1700 + r() * 500);
        P.push(mount(x, z, 900 + r() * 300, 450 + r() * 200, [[0.6, 0x2f6a38], [1, 0x9a6a34]], { k: 1.1, seg: 7, ry: r() * TAU }));
      }
      for (let i = 0; i < 18; i++) {
        const x = (r() - 0.5) * 13000, z = (i % 2 ? 1 : -1) * (1300 + r() * 1200);
        P.push(ico(1, 0, r() < 0.6 ? AUTUMN[i % 5] : GREENS[i % 4], { x, z, y: 120 + r() * 120, sx: 280, sy: 110, sz: 280 }));
      }
      return merge(P);
    },
  },

  hakone: {
    name: '箱根の山', kind: 'nature',
    build: () => {
      const r = rng(3401), P = [];
      P.push(flat(blob(3402, 4700, 4400, 16, 0.05), 0, 12, 0x6a9e52));
      // caldera rim: ring of hills (open toward the east, where the river leaves)
      for (let i = 0; i < 13; i++) {
        const a = 0.42 + (i / 12) * (TAU - 0.84), x = Math.cos(a) * 4500, z = Math.sin(a) * 4200;
        const R = 1150 + r() * 250, H = 700 + r() * 320;
        P.push(mount(x, z, R, H, [[0.45, GREENS[i % 4]], [0.8, i % 3 ? 0xb8642e : 0xc8902e], [1, 0x8a7a5a]], { k: 1.2, seg: 7, ry: r() * TAU }));
      }
      // central cones (Kamiyama, Komagatake) and Owakudani steam
      P.push(mount(700, -350, 1500, 1400, [[0.4, 0x3d6f34], [0.75, 0xa65a2e], [1, 0x7d7468]], { k: 1.15, seg: 10 }));
      P.push(mount(1500, 900, 1000, 1000, [[0.5, 0x2f6a38], [1, 0xb8742e]], { k: 1.0, seg: 9 }));
      P.push(dome(-150, -1150, 420, 80, 300, 0xd8c890).translate(0, mountH(1500, 1400, 1.15, 1130) - 60, 0));
      for (let i = 0; i < 5; i++) P.push(ico(1, 0, 0xffffff, { x: -200 + i * 70, z: -1150 - (i % 2) * 90, y: mountH(1500, 1400, 1.15, 1100) + 80 + i * 60, s: 90 + i * 20, glow: 0.2 }));
      // Lake Ashi with the lakeside torii and a pirate-ship tour boat
      P.push(flat(blob(3403, 700, 2300, 14, 0.12), 12, 6, 0x3a8fd8, { x: -2000, z: 0, glow: 0.05 }));
      P.push(torii(110, RED, { x: -1330, y: 18, z: 300, ry: PI / 2, glow: 0.6 }));
      {
        const sx = -2050, sz = -700, L = 240, B = 48, S = [];
        S.push(hull(L, B, 0, 18, 0x6a3a22, { bow: 0.3, stern: 0.08 }), hull(L * 1.01, B * 1.01, 14, 5, 0xd8a83a, { bow: 0.3, stern: 0.08 }));
        S.push(box(B * 0.9, 26, 50, 0x8a4a2a, { y: 30, z: -85 }), box(B * 0.95, 4, 52, 0xd8382c, { y: 44, z: -85, glow: 0.3 }));
        for (const [z, h] of [[60, 120], [0, 140], [-50, 110]]) {
          S.push(cyl(2.2, 3, h, 6, 0x4a2a1a, { y: 18 + h / 2, z }));
          for (const f of [0.45, 0.75]) S.push(box(B * (1.1 - f * 0.4), h * 0.22, 2, 0xf4f0e2, { y: 18 + h * f, z: z + 2 }));
          S.push(box(16, 9, 1, 0xd8382c, { y: 18 + h + 5, z, glow: 0.4 }));
        }
        for (let i = 0; i < 6; i++) S.push(lamp(0, 22, -60 + i * 30, 5, WARM));
        P.push(group(S, { x: sx, y: 18, z: sz, ry: 0.15 }));
      }
      for (let i = 0; i < 28; i++) {
        const a = r() * TAU, d = 1800 + r() * 1700, x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.hypot((x + 2000) / 900, z / 2500) < 1) continue;
        P.push(ico(1, 0, r() < 0.5 ? AUTUMN[i % 5] : GREENS[i % 4], { x, z, y: 90, sx: 230, sy: 90, sz: 230 }));
      }
      return merge(P);
    },
  },
};
