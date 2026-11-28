// town_mid.js — MEDIUM items of Yokohama (≈2.5 m – 20 m): trees, vehicles, stalls, boats, small buildings.
// Units: metres. Base on y = 0, centred on x/z, front faces +Z (headlights / faces / bows point +Z).
import {
  box, cyl, cone, sphere, torus, ico, dodeca, extrude, beam, group, repeat, merge, shade, mix, rng,
} from '../geo.js';

const PI = Math.PI;

// ---------- shared palette ----------
const GLASS = 0x9cc8e2;   // vehicle glass (glows softly at night)
const WARM = 0xffe2a0;    // lit interior windows
const TIRE = 0x24252a;
const HUB = 0xb9bec6;
const DARK = 0x34373d;
const HEAD = 0xfff4c8;    // headlights
const TAIL = 0xe02828;    // tail lights
const WHITE = 0xf4f4f0;
const RED = 0xc8282a;
const GOLD = 0xe8b42c;
const SKIN = 0xf0c8a0;
const WOOD = 0x8a5a34;
const BARK = 0x6e4a30;
const STONE = 0xdcd4c2;

// ---------- helpers ----------
// wheel whose axle runs along X (vehicles face +Z)
const wheel = (x, y, z, r, w, seg = 10) => (y -= r * (1 - Math.cos(PI / seg)), [
  cyl(r, r, w, seg, TIRE, { x, y, z, rz: PI / 2 }),
  cyl(r * 0.55, r * 0.55, w + 0.03, 6, HUB, { x, y, z, rz: PI / 2 }),
]);
const wheels4 = (W, zF, zR, r, w, seg) => [-1, 1].flatMap((s) => [
  wheel(s * (W / 2 - w / 2 + 0.04), r, zF, r, w, seg),
  wheel(s * (W / 2 - w / 2 + 0.04), r, zR, r, w, seg),
]);
// side profile given as [z, y] points, extruded across the width (x), centred on x
const side = (pts, width, color, opts = {}) => extrude(pts, width, color, { ...opts, ry: -PI / 2 });
// top-view outline [x, forward] extruded upward by `depth`, bottom at y0 (hulls)
const hullSlab = (pts, depth, y0, color, opts = {}) =>
  extrude(pts, depth, color, { ...opts, rx: PI / 2, y: y0 + depth / 2 });
// hip roof (square frustum) w×d at height y, rising h, top shrunk to k
const hip = (w, d, h, k, color, y, o = {}) =>
  group([cyl(Math.SQRT1_2 * k, Math.SQRT1_2, h, 4, color, { ry: PI / 4, y: h / 2 })],
    { sx: w, sz: d, y, x: o.x || 0, z: o.z || 0 });
// Chinese-style upturned eave tips at the 4 corners
const horns = (w, d, y, color, lift = 0.5, out = 0.35, t = 0.16) =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) =>
    beam([sx * (w / 2 - 0.5), y + 0.05, sz * (d / 2 - 0.5)], [sx * (w / 2 + out * 0.5), y + lift * 0.8, sz * (d / 2 + out * 0.5)], t * 1.7, color)));
// red paper lantern
const lantern = (x, y, z, r = 0.22) => [
  sphere(r, 8, 6, 0xe8302a, { x, y, z, sy: 1.2, glow: 1 }),
  cyl(r * 0.5, r * 0.5, r * 0.3, 6, GOLD, { x, y: y + r * 1.15, z }),
  cyl(r * 0.5, r * 0.5, r * 0.3, 6, GOLD, { x, y: y - r * 1.15, z }),
];
// framed window on a +Z facade at depth z
const winZ = (x, y, z, w, h, frame = 0x5a4a3a, glow = 0.7, col = WARM) => [
  box(w + 0.14, h + 0.14, 0.04, frame, { x, y, z: z + 0.01 }),
  box(w, h, 0.04, col, { x, y, z: z + 0.03, glow }),
];
// framed window on a ±X facade
const winX = (x, y, z, w, h, frame = 0x5a4a3a, glow = 0.7, col = WARM) => {
  const s = Math.sign(x);
  return [
    box(0.04, h + 0.14, w + 0.14, frame, { x: x + s * 0.01, y, z }),
    box(0.04, h, w, col, { x: x + s * 0.03, y, z, glow }),
  ];
};

// ---------- sedan body shared by car / taxi / police ----------
function sedan(c, o = {}) {
  const L = o.L || 4.3, W = o.W || 1.74, h = L / 2 - 0.08;
  const base = 0.3, belt = 0.92, top = o.top || 1.42;
  const up = o.upper ?? c;                 // roof / pillar colour
  const fz = h * 0.4, rz = -h * 0.6;       // windshield / rear window base
  const tf = h * 0.04, tr = -h * 0.42;     // roof front / back
  const px = W / 2 - 0.1;
  return [
    side([[-h, base], [h, base], [h, 0.72], [h - 0.18, 0.86], [fz, belt], [rz, belt + 0.02], [-h + 0.12, 0.92], [-h, 0.8]], W, c),
    side([[fz + 0.02, belt - 0.02], [tf, top], [tr, top], [rz - 0.02, belt - 0.02]], W - 0.16, GLASS, { glow: 0.4 }),
    box(W - 0.12, 0.07, tf - tr + 0.1, up, { y: top + 0.02, z: (tf + tr) / 2 }),
    box(W - 0.1, top - belt, 0.14, up, { y: (top + belt) / 2, z: (tf + tr) / 2 - 0.05 }),
    [-1, 1].map((s) => [
      beam([s * px, belt, fz], [s * px, top, tf], 0.09, up),
      beam([s * px, belt, rz], [s * px, top, tr], 0.09, up),
    ]),
    box(W + 0.04, 0.16, 0.14, DARK, { y: 0.4, z: h }),
    box(W + 0.04, 0.16, 0.14, DARK, { y: 0.4, z: -h }),
    box(W * 0.34, 0.13, 0.04, 0x24262a, { y: 0.62, z: h + 0.01 }),
    [-1, 1].map((s) => [
      box(0.36, 0.14, 0.05, HEAD, { x: s * (W / 2 - 0.27), y: 0.64, z: h + 0.01, glow: 1 }),
      box(0.3, 0.13, 0.05, TAIL, { x: s * (W / 2 - 0.25), y: 0.7, z: -h - 0.01, glow: 0.7 }),
      box(0.05, 0.08, 0.16, DARK, { x: s * (W / 2 + 0.06), y: belt + 0.05, z: fz - 0.12 }), // mirror
    ]),
    wheels4(W, h - 0.8, -h + 0.82, 0.32, 0.24),
  ];
}
const sedanRoof = (o = {}) => {        // where roof-top extras sit
  const L = o.L || 4.3, h = L / 2 - 0.08, top = o.top || 1.42;
  return { y: top + 0.055, z: (h * 0.04 - h * 0.42) / 2 };
};

// ---------- people (tiny helpers for rickshaw puller / coachman) ----------
function puller() {
  const PANTS = 0x1c2438, HAPPI = 0x24407a;
  return [
    beam([0.1, 0.86, 1.02], [0.1, 0.1, 1.28], 0.14, PANTS),         // front leg
    beam([-0.1, 0.86, 1.02], [-0.1, 0.1, 0.74], 0.14, PANTS),       // back leg
    box(0.14, 0.08, 0.24, 0x111111, { x: 0.1, y: 0.04, z: 1.33 }),
    box(0.14, 0.08, 0.24, 0x111111, { x: -0.1, y: 0.04, z: 0.79 }),
    box(0.38, 0.56, 0.24, HAPPI, { y: 1.14, z: 1.06, rx: 0.18 }),
    box(0.4, 0.08, 0.26, 0xf2f2f2, { y: 0.9, z: 1.03 }),            // obi
    sphere(0.12, 6, 4, SKIN, { y: 1.56, z: 1.16 }),
    sphere(0.125, 6, 3, 0x1a1410, { y: 1.6, z: 1.14, sy: 0.75 }),  // hair
    cyl(0.122, 0.122, 0.035, 6, 0xf8f8f8, { y: 1.645, z: 1.155 }),  // hachimaki
    [-1, 1].map((s) => beam([s * 0.2, 1.36, 1.1], [s * 0.26, 0.92, 1.36], 0.09, HAPPI)),
  ];
}

export default {
  // ======================= PLANTS =======================
  tree: {
    name: '木', kind: 'plant',
    variants: [0x4caf50, 0x2e8b3a, 0x7cbf3a],
    where: ['park', 'street'], weight: 3,
    build: (v) => merge(
      cyl(0.22, 0.34, 3.2, 6, BARK, { y: 1.6 }),
      beam([0, 2.4, 0], [0.9, 3.6, 0.3], 0.16, BARK),
      ico(2.3, 1, v, { y: 4.6 }),
      ico(1.6, 1, shade(v, 1.15), { x: 1.45, y: 4.0, z: 0.5 }),
      ico(1.5, 1, shade(v, 0.85), { x: -1.3, y: 4.25, z: -0.5 }),
      ico(1.25, 0, shade(v, 1.05), { x: 0.2, y: 5.7, z: 0.9 }),
    ),
  },

  ginkgo: {
    name: 'イチョウ並木の木', kind: 'plant',
    where: ['park', 'waterfront', 'street'], weight: 3,
    build: () => {
      const G = 0xf4c21c;
      return merge(
        cyl(2.2, 2.3, 0.04, 10, 0xe8b820, { y: 0.02 }),            // carpet of fallen leaves
        cyl(0.24, 0.4, 3.6, 6, 0x5e4a36, { y: 1.8 }),
        ico(2.3, 1, G, { y: 5.6, sy: 1.45 }),
        ico(1.55, 1, shade(G, 1.08), { x: 1.15, y: 4.3, z: 0.6 }),
        ico(1.45, 1, shade(G, 0.88), { x: -1.1, y: 4.6, z: -0.6 }),
        ico(1.3, 1, shade(G, 0.95), { x: -0.2, y: 4.2, z: 1.15 }),
        ico(0.95, 0, shade(G, 1.1), { y: 8.0, z: 0.1 }),
      );
    },
  },

  sakura_tree: {
    name: '桜の木', kind: 'plant', where: ['park'], weight: 1,
    build: () => merge(
      cyl(0.24, 0.34, 1.9, 6, 0x4a3428, { y: 0.95 }),
      beam([0, 1.7, 0], [-1.3, 3.1, 0.1], 0.2, 0x4a3428),
      beam([0, 1.7, 0], [1.2, 3.3, 0.3], 0.2, 0x4a3428),
      beam([0, 1.7, 0], [0.1, 3.4, -1.0], 0.18, 0x4a3428),
      ico(1.75, 1, 0xd8442a, { x: -1.25, y: 3.65, sy: 0.72 }),
      ico(1.85, 1, 0xe8742a, { x: 1.15, y: 3.85, z: 0.3, sy: 0.72 }),
      ico(1.6, 1, 0xc8302c, { z: -1.0, y: 4.2, sy: 0.75 }),
      ico(1.35, 1, 0xf09a3a, { z: 1.15, y: 3.5, x: -0.1, sy: 0.75 }),
      ico(1.1, 0, 0xe05a2a, { y: 4.7, x: 0.2, z: 0.2 }),
    ),
  },

  pine: {
    name: '松', kind: 'plant', where: ['park'],
    build: () => {
      const P = 0x2f5e3a, T = 0x5a4234;
      const pad = (x, y, z, r) => [
        dodeca(r, P, { x, y, z, sy: 0.42 }),
        dodeca(r * 0.75, shade(P, 1.25), { x, y: y + r * 0.18, z, sy: 0.35 }),
      ];
      return merge(
        cyl(0.3, 0.38, 0.3, 6, T, { y: 0.15 }),
        beam([0, 0.1, 0], [0.45, 2.0, 0.1], 0.36, T),
        beam([0.45, 2.0, 0.1], [-0.25, 3.7, 0.2], 0.3, T),
        beam([-0.25, 3.7, 0.2], [0.15, 5.1, 0], 0.24, T),
        beam([0.4, 2.1, 0.1], [1.6, 2.7, 0.3], 0.16, T),
        beam([-0.1, 3.1, 0.15], [-1.5, 3.5, -0.2], 0.15, T),
        beam([-0.15, 3.9, 0.2], [0.7, 4.4, 0.8], 0.13, T),
        pad(1.65, 2.75, 0.3, 1.25),
        pad(-1.5, 3.55, -0.2, 1.15),
        pad(0.75, 4.45, 0.8, 1.0),
        pad(0.1, 5.35, 0, 1.05),
      );
    },
  },

  christmas_tree: {
    name: 'クリスマスツリー', kind: 'plant', where: ['plaza'], weight: 0.3,
    build: () => {
      const r = rng(1225);
      const G = 0x1f7a3a;
      const tiers = [[2.4, 2.8, 1.0], [1.9, 2.5, 2.55], [1.45, 2.2, 3.95], [0.95, 1.8, 5.25]];
      const cols = [0xe82828, 0xffd040, 0x3a7ae8, 0xf4f4f4, 0xff7ad0];
      const star = [];
      for (let i = 0; i < 10; i++) {
        const a = PI / 2 + i * PI / 5, rr = i % 2 ? 0.18 : 0.44;
        star.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      return merge(
        cyl(1.1, 1.2, 0.6, 8, 0xc8202a, { y: 0.3 }),
        cyl(1.15, 1.15, 0.1, 8, GOLD, { y: 0.62 }),
        cyl(0.25, 0.3, 0.6, 6, BARK, { y: 0.95 }),
        tiers.map(([R, H, y], ti) => [
          cone(R, H, 10, ti % 2 ? shade(G, 1.1) : G, { y: y + H / 2 }),
          repeat(7, (i) => {
            const t = 0.12 + r() * 0.3, a = i * 2 * PI / 7 + ti * 0.5 + r() * 0.3;
            const rad = R * (1 - t) + 0.06;
            return ico(0.15, 0, cols[(i + ti) % cols.length], { x: Math.cos(a) * rad, y: y + t * H, z: Math.sin(a) * rad, glow: 1 });
          }),
          repeat(6, (i) => {
            const t = 0.45 + r() * 0.3, a = i * 2 * PI / 6 + ti + 0.3;
            const rad = R * (1 - t) + 0.04;
            return box(0.1, 0.1, 0.1, 0xfff2a0, { x: Math.cos(a) * rad, y: y + t * H, z: Math.sin(a) * rad, glow: 1 });
          }),
        ]),
        extrude(star, 0.12, 0xffd040, { y: 7.45, glow: 1 }),
      );
    },
  },

  // ======================= STALLS / STREET FURNITURE =======================
  food_stall: {
    name: '屋台', kind: 'thing', where: ['chinatown', 'plaza'], weight: 2,
    build: () => {
      const BAMBOO = 0xd8b67a;
      const steamer = (x, z, n) => [
        repeat(n, (i) => cyl(0.3, 0.3, 0.16, 8, i % 2 ? BAMBOO : shade(BAMBOO, 0.9), { x, y: 1.16 + i * 0.17, z })),
        cone(0.32, 0.16, 8, shade(BAMBOO, 0.8), { x, y: 1.16 + n * 0.17, z }),
        ico(0.18, 0, 0xf4f8fa, { x, y: 1.5 + n * 0.17, z, glow: 0.15 }),
        ico(0.13, 0, 0xf4f8fa, { x: x + 0.1, y: 1.78 + n * 0.17, z: z - 0.05, glow: 0.15 }),
      ];
      return merge(
        box(2.6, 1.0, 1.1, RED, { y: 0.55 }),
        box(2.0, 0.5, 0.03, GOLD, { y: 0.62, z: 0.56, glow: 0.3 }),
        box(2.8, 0.08, 1.3, WOOD, { y: 1.07 }),
        [-1, 1].map((s) => cyl(0.34, 0.34, 0.12, 8, TIRE, { x: s * 1.36, y: 0.34, rz: PI / 2 })),
        [[-1.25, -0.55], [1.25, -0.55], [-1.25, 0.6], [1.25, 0.6]].map(([x, z]) =>
          cyl(0.04, 0.04, 1.5, 5, WOOD, { x, y: 1.85, z })),
        box(3.5, 0.08, 2.0, RED, { y: 2.6, z: 0.05, rx: 0.16 }),
        repeat(7, (i) => box(0.5, 0.26, 0.04, i % 2 ? 0xf6efe0 : RED, { x: -1.5 + i * 0.5, y: 2.32, z: 1.04 })),
        box(1.5, 0.44, 0.08, 0xffd040, { y: 2.95, z: -0.1, glow: 0.9 }),
        box(1.66, 0.56, 0.06, RED, { y: 2.95, z: -0.16 }),
        steamer(-0.75, -0.05, 3),
        steamer(0.05, 0.1, 2),
        box(0.6, 0.12, 0.4, 0xf8f4ea, { x: 0.85, y: 1.17 }),                     // plate of buns
        repeat(3, (i) => sphere(0.1, 5, 3, 0xfff6e8, { x: 0.7 + i * 0.15, y: 1.28 })),
        lantern(-1.55, 1.95, 1.0, 0.2),
        lantern(1.55, 1.95, 1.0, 0.2),
      );
    },
  },

  kiosk: {
    name: '売店', kind: 'building', where: ['plaza', 'waterfront', 'park'],
    build: () => {
      const BODY = 0x2f8f7a, CREAM = 0xf3ead2;
      return merge(
        box(3.4, 2.6, 2.4, BODY, { y: 1.3 }),
        box(3.8, 0.22, 2.8, CREAM, { y: 2.71 }),
        box(2.7, 1.05, 0.05, WARM, { y: 1.62, z: 1.21, glow: 0.8 }),
        box(3.0, 0.08, 0.45, CREAM, { y: 1.06, z: 1.42 }),
        [0xe8402a, 0xffc830, 0x3a8ae8, 0x58c060, 0xff80b0].map((c, i) =>
          box(0.32, 0.3, 0.26, c, { x: -1.1 + i * 0.55, y: 1.25, z: 1.42 })),
        repeat(7, (i) => box(3.4 / 7, 0.05, 0.95, i % 2 ? 0xf8f8f4 : 0xe03a32,
          { x: -1.7 + 3.4 / 14 + i * 3.4 / 7, y: 2.3, z: 1.55, rx: 0.42 })),
        repeat(7, (i) => box(3.4 / 7, 0.18, 0.03, i % 2 ? 0xf8f8f4 : 0xe03a32,
          { x: -1.7 + 3.4 / 14 + i * 3.4 / 7, y: 2.03, z: 1.99 })),
        box(2.4, 0.62, 0.1, 0xe03a32, { y: 3.12, z: 0.5 }),
        box(2.2, 0.46, 0.06, 0xfff4d0, { y: 3.12, z: 0.57, glow: 1 }),
        box(0.04, 0.9, 0.7, 0xfffaf0, { x: 1.72, y: 1.45, glow: 0.6 }),
        box(0.04, 0.9, 0.7, 0xfffaf0, { x: -1.72, y: 1.45, glow: 0.6 }),
      );
    },
  },

  fountain: {
    name: '噴水', kind: 'thing', where: ['park', 'plaza'],
    build: () => {
      const W = 0x9adcf4;
      return merge(
        cyl(2.5, 2.5, 0.55, 16, STONE, { y: 0.275 }),
        cyl(2.55, 2.55, 0.1, 16, shade(STONE, 1.08), { y: 0.58 }),
        cyl(2.22, 2.22, 0.08, 16, W, { y: 0.62, glow: 0.3 }),
        cyl(0.3, 0.48, 1.4, 8, STONE, { y: 1.3 }),
        cyl(1.1, 0.45, 0.35, 12, STONE, { y: 2.08 }),
        cyl(1.0, 1.0, 0.05, 12, W, { y: 2.24, glow: 0.3 }),
        cyl(0.13, 0.2, 0.8, 6, STONE, { y: 2.6 }),
        cyl(0.55, 0.22, 0.22, 10, STONE, { y: 3.05 }),
        cyl(0.48, 0.48, 0.04, 10, W, { y: 3.16, glow: 0.3 }),
        cone(0.16, 1.5, 6, W, { y: 3.95, glow: 0.3 }),
        ico(0.26, 0, W, { y: 4.7, glow: 0.3 }),
        repeat(8, (i) => {                                      // curtains falling from the middle bowl
          const a = i * PI / 4, c = Math.cos(a), s = Math.sin(a);
          return beam([1.08 * c, 2.2, 1.08 * s], [1.45 * c, 0.66, 1.45 * s], 0.09, W, { glow: 0.3 });
        }),
        repeat(8, (i) => {                                      // arcs from the basin rim
          const a = i * PI / 4 + PI / 8, c = Math.cos(a), s = Math.sin(a);
          return [
            beam([2.15 * c, 0.62, 2.15 * s], [1.75 * c, 1.55, 1.75 * s], 0.07, W, { glow: 0.3 }),
            beam([1.75 * c, 1.55, 1.75 * s], [1.3 * c, 0.75, 1.3 * s], 0.07, W, { glow: 0.3 }),
          ];
        }),
      );
    },
  },

  phone_booth: {
    name: '電話ボックス', kind: 'thing', where: ['street'],
    build: () => {
      const G = 0x2f9a52, F = 0x9aa8a0;
      return merge(
        box(1.0, 0.1, 1.0, 0x8a8c8e, { y: 0.05 }),
        box(0.88, 1.9, 0.88, 0xc2e8f0, { y: 1.05, glow: 0.35 }),
        box(0.9, 0.3, 0.9, 0xe4e8e4, { y: 0.25 }),
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, z]) => box(0.07, 2.0, 0.07, F, { x: x * 0.44, y: 1.1, z: z * 0.44 })),
        box(0.92, 0.05, 0.92, F, { y: 1.3 }),
        box(0.84, 0.17, 0.84, 0xfffbe6, { y: 2.12, glow: 1 }),
        box(0.5, 0.12, 0.02, G, { y: 2.12, z: 0.43 }),
        box(1.04, 0.12, 1.04, G, { y: 2.26 }),
        box(0.7, 0.04, 0.7, shade(G, 0.8), { y: 2.33 }),
        box(0.04, 0.28, 0.05, 0xd0d4d8, { x: 0.32, y: 1.1, z: 0.46 }),
        box(0.3, 0.36, 0.08, G, { x: -0.1, y: 1.35, z: 0.42 }),    // the green phone seen through the glass
      );
    },
  },

  statue_girl: {
    name: '赤い靴の女の子の像', kind: 'thing', where: ['park', 'waterfront'],
    build: () => {
      const GR = 0x8c8e92, B = 0x8a6436, BD = shade(B, 0.8);
      const y0 = 1.55;
      return merge(
        box(1.1, 1.1, 0.9, GR, { y: 0.55 }),
        box(1.2, 0.1, 1.0, shade(GR, 1.12), { y: 1.15 }),
        box(0.5, 0.28, 0.02, 0xc8a050, { y: 0.62, z: 0.46 }),
        dodeca(0.42, 0x9a948a, { y: 1.35, sx: 1.25, sy: 0.55 }),
        box(0.34, 0.16, 0.42, B, { y: y0 + 0.08, z: 0.08 }),                // lap / skirt
        box(0.3, 0.4, 0.12, B, { y: y0 - 0.1, z: 0.3 }),                    // shins
        box(0.32, 0.09, 0.2, 0xa03a2a, { y: y0 - 0.3, z: 0.36 }),           // the red shoes
        box(0.32, 0.44, 0.22, B, { y: y0 + 0.36, z: -0.06 }),
        sphere(0.16, 8, 6, B, { y: y0 + 0.73, z: -0.02 }),
        sphere(0.17, 8, 5, BD, { y: y0 + 0.77, z: -0.06, sy: 0.85 }),
        [-1, 1].map((s) => beam([s * 0.18, y0 + 0.54, -0.04], [s * 0.12, y0 + 0.2, 0.26], 0.08, B)),
        cyl(0.05, 0.05, 0.08, 5, BD, { y: y0 + 0.62, z: -0.04 }),           // neck
      );
    },
  },

  bus_stop: {
    name: 'バス停', kind: 'thing', where: ['street'],
    build: () => {
      const M = 0x6a7480, BLUE = 0x2a63c8;
      return merge(
        box(2.8, 0.1, 1.4, M, { x: -0.2, y: 2.35 }),
        box(2.8, 0.14, 0.06, BLUE, { x: -0.2, y: 2.35, z: 0.71 }),
        [-1.5, 1.1].map((x) => box(0.08, 2.3, 0.08, M, { x, y: 1.15, z: -0.6 })),
        box(2.5, 1.7, 0.04, GLASS, { x: -0.2, y: 1.3, z: -0.6, glow: 0.2 }),
        box(0.06, 1.6, 1.1, 0xfff2d8, { x: -1.5, y: 1.2, z: -0.05, glow: 0.8 }),
        box(0.1, 1.7, 1.2, M, { x: -1.54, y: 1.2, z: -0.05 }),
        box(1.8, 0.08, 0.42, WOOD, { x: -0.25, y: 0.46, z: -0.32 }),
        [-0.95, 0.45].map((x) => box(0.06, 0.42, 0.36, M, { x, y: 0.21, z: -0.32 })),
        cyl(0.26, 0.3, 0.12, 8, 0x8a8c8e, { x: 1.35, y: 0.06, z: 0.5 }),
        cyl(0.04, 0.04, 2.5, 6, 0xb0b4b8, { x: 1.35, y: 1.25, z: 0.5 }),
        cyl(0.3, 0.3, 0.05, 12, BLUE, { x: 1.35, y: 2.6, z: 0.5, rx: PI / 2 }),
        cyl(0.22, 0.22, 0.07, 12, 0xffffff, { x: 1.35, y: 2.6, z: 0.5, rx: PI / 2 }),
        box(0.42, 0.55, 0.05, 0xffffff, { x: 1.35, y: 1.55, z: 0.53, glow: 0.8 }),
      );
    },
  },

  clock_tower_small: {
    name: '時計塔', kind: 'thing', where: ['plaza'],
    build: () => {
      const P = 0x2f4a3a;
      const face = [
        cyl(0.36, 0.36, 0.04, 10, 0xfffbe8, { rx: PI / 2, z: 0.48, glow: 0.8 }),
        cyl(0.39, 0.39, 0.03, 10, GOLD, { rx: PI / 2, z: 0.465 }),
        box(0.04, 0.2, 0.02, 0x1a1a1a, { y: 0.08, z: 0.51, rz: -0.9 }),
        box(0.03, 0.3, 0.02, 0x1a1a1a, { y: 0.13, z: 0.515, x: 0.03, rz: 0.2 }),
      ];
      return merge(
        box(0.9, 0.4, 0.9, STONE, { y: 0.2 }),
        cyl(0.13, 0.17, 4.3, 8, P, { y: 0.4 + 2.15 }),
        cyl(0.24, 0.24, 0.15, 8, GOLD, { y: 1.2 }),
        cyl(0.2, 0.2, 0.12, 8, GOLD, { y: 4.6 }),
        box(0.92, 0.92, 0.92, P, { y: 5.16 }),
        repeat(4, (i) => group(face, { ry: i * PI / 2, y: 5.16 })),
        cone(0.72, 0.34, 4, P, { y: 5.79, ry: PI / 4 }),
        sphere(0.09, 6, 4, GOLD, { y: 5.98 }),
      );
    },
  },

  // ======================= ROAD VEHICLES =======================
  car: {
    name: '車', kind: 'vehicle',
    variants: [0xd8382c, 0x2c6fd8, 0xf2f2ee, 0x23252b, 0xf2c230, 0xb8bec6],
    where: ['road'], weight: 5, move: 'drive', speed: 9,
    build: (v) => merge(sedan(v)),
  },

  taxi: {
    name: 'タクシー', kind: 'vehicle',
    variants: [0xf2c230, 0x2e9a5a, 0x1e2026],
    where: ['road'], weight: 2, move: 'drive', speed: 9,
    build: (v) => {
      const o = { L: 4.6, W: 1.72, top: 1.46 };
      const r = sedanRoof(o);
      const stripe = v === 0x1e2026 ? 0xd8c27a : v === 0x2e9a5a ? 0xf0a030 : 0xd8382c;
      return merge(
        sedan(v, o),
        box(o.W + 0.02, 0.08, 4.3, stripe, { y: 0.8 }),
        [-1, 1].map((s) => [                                                       // fender mirrors
          beam([s * 0.72, 0.86, 1.45], [s * 0.76, 1.02, 1.42], 0.03, 0x1a1a1a),
          box(0.1, 0.08, 0.05, 0x1a1a1a, { x: s * 0.78, y: 1.04, z: 1.42 }),
        ]),
        extrude([[-0.32, 0], [0.32, 0], [0.22, 0.24], [-0.22, 0.24]], 0.16, 0xfff0b0, { y: r.y, z: r.z + 0.2, glow: 1 }),
      );
    },
  },

  police: {
    name: 'パトカー', kind: 'vehicle', where: ['road'], move: 'drive', speed: 10,
    build: () => {
      const o = { L: 4.6, W: 1.76, top: 1.44, upper: 0xf6f6f2 };
      const r = sedanRoof(o);
      return merge(
        sedan(0x1c1d22, o),
        box(o.W + 0.02, 0.3, 2.3, 0xf6f6f2, { y: 0.74, z: -0.25 }),             // white doors
        box(1.3, 0.06, 0.3, DARK, { y: r.y, z: r.z }),
        box(1.24, 0.14, 0.26, 0xff2020, { y: r.y + 0.1, z: r.z, glow: 1 }),
        box(0.3, 0.15, 0.27, 0xffffff, { y: r.y + 0.1, z: r.z, glow: 0.6 }),
        box(0.5, 0.1, 0.05, 0xff2020, { y: 0.52, z: 2.31, glow: 1 }),           // front grille lamp
      );
    },
  },

  bus: {
    name: '路線バス', kind: 'vehicle', where: ['road'], weight: 1, move: 'drive', speed: 7,
    build: () => {
      const L = 11, W = 2.5, h = L / 2, B = 0x2a63c8;
      return merge(
        box(W, 2.75, L, WHITE, { y: 0.35 + 1.375 }),
        box(W + 0.02, 0.3, L + 0.02, B, { y: 0.55 }),
        box(W + 0.03, 0.16, L + 0.02, B, { y: 1.28 }),
        box(W + 0.02, 1.0, L - 1.6, GLASS, { y: 2.15, z: -0.45, glow: 0.6 }),
        repeat(7, (i) => box(W + 0.05, 1.0, 0.12, WHITE, { y: 2.15, z: -4.6 + i * 1.35 })),
        box(W - 0.16, 1.55, 0.05, GLASS, { y: 2.0, z: h + 0.01, glow: 0.6 }),
        box(W - 0.6, 0.3, 0.06, 0xffa52a, { y: 2.92, z: h + 0.03, glow: 1 }),
        box(0.04, 2.1, 1.0, GLASS, { x: W / 2 + 0.02, y: 1.45, z: h - 1.4, glow: 0.6 }),    // door (left side)
        box(W - 0.6, 0.7, 0.05, GLASS, { y: 2.3, z: -h - 0.01, glow: 0.6 }),
        box(1.6, 0.3, 3.0, 0xdcdcd8, { y: 3.25, z: -1.0 }),
        box(W + 0.04, 0.22, 0.14, DARK, { y: 0.45, z: h }),
        box(W + 0.04, 0.22, 0.14, DARK, { y: 0.45, z: -h }),
        [-1, 1].map((s) => [
          box(0.4, 0.2, 0.05, HEAD, { x: s * 0.9, y: 0.78, z: h + 0.02, glow: 1 }),
          box(0.25, 0.35, 0.05, TAIL, { x: s * 1.0, y: 0.9, z: -h - 0.02, glow: 0.7 }),
          box(0.06, 0.1, 0.35, DARK, { x: s * (W / 2 + 0.12), y: 2.4, z: h - 0.2 }),
        ]),
        wheels4(W, 3.6, -2.9, 0.5, 0.32, 10),
      );
    },
  },

  tour_bus: {
    name: '観光バス', kind: 'vehicle', where: ['road'], weight: 1, move: 'drive', speed: 6,
    build: () => {
      const L = 12, W = 2.5, h = L / 2, R = 0xd02a2a, SEAT = 0x2c5aa0;
      return merge(
        box(W, 2.4, L, R, { y: 0.35 + 1.2 }),
        box(W + 0.02, 0.9, L - 2.2, GLASS, { y: 1.95, z: -0.5, glow: 0.6 }),
        repeat(5, (i) => box(W + 0.05, 0.9, 0.12, R, { y: 1.95, z: -4.2 + i * 1.9 })),
        box(W + 0.03, 0.1, L + 0.02, 0xf0c040, { y: 1.35 }),
        box(W - 0.2, 1.15, 0.05, GLASS, { y: 1.8, z: h + 0.01, glow: 0.6 }),
        box(W - 0.7, 0.24, 0.06, 0xffa52a, { y: 2.55, z: h + 0.03, glow: 1 }),
        box(0.04, 1.9, 0.95, GLASS, { x: W / 2 + 0.02, y: 1.35, z: h - 1.3, glow: 0.6 }),
        // open upper deck
        box(W - 0.1, 0.05, L - 0.2, 0x4a4e56, { y: 2.78 }),
        [-1, 1].map((s) => box(0.1, 0.85, L, R, { x: s * (W / 2 - 0.05), y: 3.18 })),
        box(W, 0.85, 0.1, R, { y: 3.18, z: h - 0.05 }),
        box(W, 0.85, 0.1, R, { y: 3.18, z: -h + 0.05 }),
        box(W - 0.2, 0.42, 0.05, GLASS, { y: 3.82, z: h - 0.12, rx: -0.25, glow: 0.3 }),
        [-1, 1].map((s) => box(0.07, 0.07, L - 0.1, 0xf0c040, { x: s * (W / 2 - 0.05), y: 3.64 })),
        repeat(6, (i) => box(W - 0.3, 0.72, 0.36, SEAT, { y: 3.15, z: h - 1.4 - i * 1.7 })),
        box(W + 0.04, 0.22, 0.14, DARK, { y: 0.45, z: h }),
        box(W + 0.04, 0.22, 0.14, DARK, { y: 0.45, z: -h }),
        [-1, 1].map((s) => [
          box(0.4, 0.22, 0.05, HEAD, { x: s * 0.88, y: 0.8, z: h + 0.02, glow: 1 }),
          box(0.25, 0.35, 0.05, TAIL, { x: s * 1.0, y: 0.9, z: -h - 0.02, glow: 0.7 }),
        ]),
        wheels4(W, 4.0, -3.6, 0.52, 0.32, 10),
      );
    },
  },

  truck: {
    name: 'トラック', kind: 'vehicle', variants: [0x2f6fd0, 0x2e9a4c],
    where: ['road'], weight: 1, move: 'drive', speed: 7,
    build: (v) => {
      const W = 2.2, h = 3.5;
      return merge(
        box(1.4, 0.35, 6.6, DARK, { y: 0.62 }),
        box(W, 1.95, 1.75, v, { y: 1.7, z: h - 0.875 }),
        box(W - 0.24, 0.8, 0.05, GLASS, { y: 2.12, z: h + 0.01, glow: 0.4 }),
        box(W + 0.02, 0.62, 0.9, GLASS, { y: 2.15, z: h - 0.62, glow: 0.4 }),
        box(1.1, 0.32, 0.05, 0x2a2c30, { y: 1.3, z: h + 0.01 }),
        box(W + 0.04, 0.26, 0.2, 0xa8adb4, { y: 0.8, z: h - 0.04 }),
        [-1, 1].map((s) => [
          box(0.32, 0.18, 0.05, HEAD, { x: s * 0.78, y: 1.02, z: h + 0.02, glow: 1 }),
          box(0.25, 0.18, 0.05, TAIL, { x: s * 0.85, y: 0.62, z: -h - 0.02, glow: 0.7 }),
          box(0.06, 0.4, 0.06, DARK, { x: s * (W / 2 + 0.12), y: 2.2, z: h - 0.1 }),
        ]),
        box(W + 0.06, 2.45, 4.95, WHITE, { y: 0.8 + 1.225, z: -h + 2.475 }),
        box(W + 0.1, 0.34, 4.95, v, { y: 1.3, z: -h + 2.475 }),
        box(W + 0.1, 0.12, 4.95, v, { y: 3.0, z: -h + 2.475 }),
        box(0.05, 2.3, 0.03, 0xc8ccd0, { y: 2.0, z: -h - 0.01 }),
        wheels4(W, 2.6, -1.8, 0.45, 0.3, 10),
        wheel(W / 2 - 0.11, 0.45, -2.75, 0.45, 0.3, 10),
        wheel(-W / 2 + 0.11, 0.45, -2.75, 0.45, 0.3, 10),
      );
    },
  },

  rickshaw: {
    name: '人力車', kind: 'vehicle', where: ['street', 'plaza', 'chinatown'], move: 'walk', speed: 2.2,
    build: () => {
      const K = 0x1e1e22, S = 0xc8242a, zc = -0.3, R = 0.68;
      const hood = [];
      for (let a = 180; a >= 92; a -= 22) hood.push([zc - 0.15 + Math.cos(a * PI / 180) * 0.75, 1.2 + Math.sin(a * PI / 180) * 0.75]);
      for (let a = 92; a <= 180; a += 22) hood.push([zc - 0.15 + Math.cos(a * PI / 180) * 0.68, 1.2 + Math.sin(a * PI / 180) * 0.68]);
      return merge(group([
        [-1, 1].map((s) => [
          torus(R, 0.05, 3, 12, K, { x: s * 0.62, y: R + 0.05, z: zc, ry: PI / 2 }),
          beam([s * 0.62, R, zc + R], [s * 0.62, R, zc - R], 0.03, 0x8a2020),
          beam([s * 0.62, R * 2, zc], [s * 0.62, 0, zc], 0.03, 0x8a2020),
          box(0.06, 0.4, 0.62, K, { x: s * 0.5, y: 1.3, z: zc }),                       // arm rests
          beam([s * 0.42, 0.95, zc - 0.25], [s * 0.42, 0.86, 1.42], 0.06, K),            // shafts
        ]),
        box(1.24, 0.06, 0.06, K, { y: R, z: zc }),
        box(1.0, 0.28, 0.65, K, { y: 0.98, z: zc }),
        box(0.96, 0.14, 0.6, S, { y: 1.18, z: zc }),
        box(0.96, 0.6, 0.12, S, { y: 1.52, z: zc - 0.32, rx: -0.15 }),
        side(hood, 1.06, K),
        box(0.8, 0.05, 0.4, K, { y: 0.5, z: 0.22 }),
        beam([0, 0.92, 0.0], [0, 0.52, 0.2], 0.08, K),
        box(0.9, 0.06, 0.06, K, { y: 0.86, z: 1.38 }),
        box(0.12, 0.18, 0.12, 0xe8302a, { x: 0.58, y: 1.62, z: 0.0, glow: 1 }),
        puller(),
      ], { z: -0.13 }));
    },
  },

  carriage: {
    name: '馬車', kind: 'vehicle', where: ['street'], move: 'walk', speed: 2,
    build: () => {
      const HB = 0x8a5530, MANE = 0x2a1e18, C = 0x5a1a24, SEAT = 0xb8202a;
      const hood = [];
      const zc = -1.85;
      for (let a = 180; a >= 100; a -= 20) hood.push([zc + Math.cos(a * PI / 180) * 0.6 + 0.4, 1.45 + Math.sin(a * PI / 180) * 0.6]);
      for (let a = 100; a <= 180; a += 20) hood.push([zc + Math.cos(a * PI / 180) * 0.54 + 0.4, 1.45 + Math.sin(a * PI / 180) * 0.54]);
      const cw = (x, z, r) => [
        torus(r, 0.05, 3, 8, 0x1a1a1a, { x, y: r + 0.05, z, ry: PI / 2 }),
        beam([x, r, z + r], [x, r, z - r], 0.035, GOLD),
        beam([x, 2 * r, z], [x, 0, z], 0.035, GOLD),
      ];
      return merge(group([
        // --- horse ---
        box(0.55, 0.62, 1.35, HB, { y: 1.26, z: 1.45 }),
        box(0.5, 0.5, 0.3, HB, { y: 1.3, z: 2.15 }),
        beam([0, 1.45, 2.1], [0, 1.95, 2.38], 0.3, HB),
        box(0.24, 0.26, 0.55, HB, { y: 1.9, z: 2.55, rx: 0.55 }),
        beam([0, 2.02, 2.25], [0, 1.5, 2.0], 0.1, MANE),
        [-1, 1].map((s) => [
          beam([s * 0.17, 1.0, 2.0], [s * 0.17, 0.0, 2.0], 0.12, HB),
          beam([s * 0.17, 1.0, 0.9], [s * 0.17, 0.0, 0.9], 0.12, HB),
          beam([s * 0.48, 1.05, -0.4], [s * 0.34, 1.25, 1.9], 0.05, 0x3a2418),          // shafts
        ]),
        beam([0, 1.5, 0.78], [0, 0.95, 0.66], 0.1, MANE),
        box(0.22, 0.12, 0.05, HB, { y: 2.15, z: 2.4 }),                                  // ears
        box(0.6, 0.14, 0.14, 0x9a2a1a, { y: 1.5, z: 2.05 }),                            // collar
        // --- carriage ---
        box(1.3, 0.55, 1.6, C, { y: 1.15, z: -1.35 }),
        box(1.32, 0.06, 1.62, GOLD, { y: 1.32, z: -1.35 }),
        box(1.2, 0.12, 0.6, SEAT, { y: 1.47, z: -1.75 }),
        box(1.2, 0.5, 0.1, SEAT, { y: 1.7, z: -2.1 }),
        side(hood, 1.32, 0x1a1a1a),
        box(1.1, 0.42, 0.5, C, { y: 1.55, z: -0.5 }),
        box(1.0, 0.1, 0.45, SEAT, { y: 1.81, z: -0.5 }),
        [-1, 1].map((s) => box(0.12, 0.18, 0.12, 0xfff0a0, { x: s * 0.62, y: 1.8, z: -0.25, glow: 1 })),
        cw(0.72, -1.6, 0.7), cw(-0.72, -1.6, 0.7),
        cw(0.66, -0.45, 0.46), cw(-0.66, -0.45, 0.46),
        // --- coachman ---
        box(0.38, 0.5, 0.24, 0x1a1a22, { y: 2.1, z: -0.5 }),
        sphere(0.12, 6, 4, SKIN, { y: 2.48, z: -0.48 }),
        cyl(0.2, 0.2, 0.03, 6, 0x111111, { y: 2.57, z: -0.48 }),
        cyl(0.11, 0.12, 0.24, 6, 0x111111, { y: 2.7, z: -0.48 }),
        [-1, 1].map((s) => beam([s * 0.2, 2.3, -0.48], [s * 0.16, 1.95, -0.2], 0.08, 0x1a1a22)),
      ], { z: -0.25 }));
    },
  },

  // ======================= BOATS =======================
  boat: {
    name: 'ボート', kind: 'vehicle', variants: [0xd8382c, 0x2c6fd8],
    where: ['sea'], weight: 3, move: 'sail', speed: 4,
    build: (v) => {
      const o = [[0, 2.45], [0.55, 1.85], [0.9, 0.95], [1.0, -0.2], [0.95, -2.3], [-0.95, -2.3], [-1.0, -0.2], [-0.9, 0.95], [-0.55, 1.85]];
      return merge(
        hullSlab(o, 0.42, 0, v, { sx: 0.86, sy: 0.96 }),
        hullSlab(o, 0.42, 0.4, WHITE),
        hullSlab(o, 0.03, 0.82, 0xc89a62, { sx: 0.86, sy: 0.88 }),
        box(0.95, 0.62, 0.6, WHITE, { y: 1.12, z: 0.25 }),
        box(1.1, 0.42, 0.05, GLASS, { y: 1.62, z: 0.48, rx: -0.45, glow: 0.4 }),
        box(0.3, 0.1, 0.04, 0x9cf0a8, { y: 1.3, z: 0.56, glow: 0.8 }),
        box(1.4, 0.3, 0.5, v, { y: 1.0, z: -0.95 }),
        box(1.4, 0.45, 0.12, v, { y: 1.3, z: -1.2 }),
        box(0.42, 0.75, 0.45, 0x2a2c30, { y: 0.95, z: -2.45 }),
        box(0.46, 0.3, 0.55, 0xf4f4f0, { y: 1.4, z: -2.45 }),
        [-1, 1].map((s) => [
          beam([s * 0.6, 1.1, 1.6], [s * 0.18, 1.1, 2.35], 0.04, 0xd8dce0),
          beam([s * 0.6, 0.84, 1.6], [s * 0.6, 1.1, 1.6], 0.04, 0xd8dce0),
          box(0.08, 0.08, 0.12, s > 0 ? 0xff3030 : 0x30e050, { x: s * 0.62, y: 0.92, z: 1.75, glow: 1 }),
        ]),
      );
    },
  },

  yacht: {
    name: 'ヨット', kind: 'vehicle', where: ['sea'], weight: 2, move: 'sail', speed: 5,
    build: () => {
      const o = [[0, 3.3], [0.6, 2.4], [1.05, 0.8], [1.1, -1.2], [0.95, -3.0], [-0.95, -3.0], [-1.1, -1.2], [-1.05, 0.8], [-0.6, 2.4]];
      const SAIL = 0xfafaf6, M = 0xd0d4d8, mz = 1.0;
      return merge(
        hullSlab(o, 0.5, 0, 0x1f3f78, { sx: 0.84, sy: 0.96 }),
        hullSlab(o, 0.72, 0.48, WHITE),
        hullSlab(o, 0.04, 0.98, shade(WHITE, 0.6), { sx: 0.02, sy: 0.9 }),
        box(2.24, 0.08, 4.4, 0xd83a2a, { y: 0.58, z: 0.1, sx: 0.98 }),
        box(1.3, 0.45, 2.2, WHITE, { y: 1.42, z: -0.3 }),
        box(1.33, 0.16, 1.6, GLASS, { y: 1.45, z: -0.3, glow: 0.6 }),
        cyl(0.06, 0.08, 8.8, 6, M, { y: 1.2 + 4.4, z: mz }),
        cyl(0.05, 0.05, 3.6, 6, M, { rx: PI / 2, y: 2.0, z: mz - 1.8 }),
        side([[mz - 0.06, 2.08], [-2.55, 2.08], [mz - 0.06, 9.6]], 0.05, SAIL),
        side([[mz + 0.12, 1.5], [3.1, 1.3], [mz + 0.12, 8.6]], 0.05, shade(SAIL, 0.95)),
        beam([0, 9.9, mz], [0, 1.25, 3.25], 0.025, 0x8a8e92),
        beam([0, 9.9, mz], [0, 1.25, -2.95], 0.025, 0x8a8e92),
        sphere(0.08, 5, 4, 0xffffff, { y: 10.0, z: mz, glow: 1 }),
        box(0.08, 0.08, 0.1, 0xff3030, { x: 0.72, y: 1.25, z: 2.4, glow: 1 }),
        box(0.08, 0.08, 0.1, 0x30e050, { x: -0.72, y: 1.25, z: 2.4, glow: 1 }),
      );
    },
  },

  // ======================= ROPEWAY =======================
  ropeway_cabin: {
    name: 'ロープウェイのゴンドラ', kind: 'vehicle',
    build: () => {
      const A = 0x6a7078;
      return merge(
        cyl(0.95, 0.68, 0.36, 10, WHITE, { y: 0.18 }),
        cyl(0.97, 0.97, 0.08, 10, 0x8a96a4, { y: 0.4 }),
        cyl(1.0, 0.96, 1.08, 10, GLASS, { y: 0.98, glow: 0.6 }),
        repeat(5, (i) => {
          const a = (i * 2 + 0.5) * PI / 5;
          return box(0.09, 1.08, 0.09, WHITE, { x: Math.sin(a) * 0.985, z: Math.cos(a) * 0.985, y: 0.98, ry: a });
        }),
        cyl(0.74, 1.0, 0.3, 10, WHITE, { y: 1.67 }),
        cyl(0.36, 0.74, 0.14, 10, WHITE, { y: 1.89 }),
        sphere(0.07, 5, 4, 0xfff0a0, { x: 0.3, y: 1.98, glow: 1 }),
        box(0.12, 0.98, 0.12, A, { y: 1.96 + 0.45 }),
        box(0.3, 0.1, 0.2, A, { y: 1.98 }),
        box(0.55, 0.14, 0.3, A, { y: 2.93 }),
        box(0.6, 0.05, 0.12, 0x3a3e44, { y: 2.975 }),
      );
    },
  },

  // ======================= SMALL BUILDINGS =======================
  shop_small: {
    name: '土産物屋', kind: 'building', where: ['chinatown'], weight: 2,
    build: () => {
      const W = 6, D = 5, R = 0xc42a2a, RD = 0xa01e1e, ROOF = 0xe0962a;
      const W2 = W - 0.4, D2 = D - 0.4;
      return merge(
        box(W, 3.2, D, R, { y: 1.6 }),
        box(W - 1.2, 2.3, 0.08, WARM, { y: 1.2, z: D / 2 + 0.01, glow: 0.8 }),
        [-1, 1].map((s) => cyl(0.15, 0.15, 3.2, 6, RD, { x: s * (W / 2 - 0.3), y: 1.6, z: D / 2 + 0.2 })),
        box(1.4, 0.8, 0.6, WOOD, { x: -1.5, y: 0.4, z: D / 2 + 0.4 }),
        box(1.4, 0.8, 0.6, WOOD, { x: 1.3, y: 0.4, z: D / 2 + 0.4 }),
        [0xffd040, 0x3ab06a, 0xe8402a, 0x5a8ae8, 0xff90c0, 0xf8f8f8].map((c, i) =>
          box(0.34, 0.3, 0.34, c, { x: (i < 3 ? -2.0 : 0.8) + (i % 3) * 0.48, y: 0.95, z: D / 2 + 0.4 })),
        box(W - 0.9, 0.78, 0.12, 0x7a1010, { y: 2.78, z: D / 2 + 0.1 }),
        box(W - 1.3, 0.54, 0.06, 0xffd040, { y: 2.78, z: D / 2 + 0.18, glow: 1 }),
        box(W + 0.1, 0.16, D + 0.1, GOLD, { y: 3.2 }),
        hip(W + 1.0, D + 1.0, 0.45, 0.82, ROOF, 3.2),
        horns(W + 1.0, D + 1.0, 3.25, ROOF, 0.4, 0.3, 0.14),
        box(W2, 2.4, D2, R, { y: 3.6 + 1.2 }),
        [-1.7, 0, 1.7].map((x) => winZ(x, 4.75, D2 / 2, 1.0, 1.15, GOLD, 0.7)),
        [-1, 1].map((s) => winX(s * W2 / 2, 4.75, 0, 1.0, 1.1, GOLD, 0.7)),
        box(W2 + 0.1, 0.1, 0.5, GOLD, { y: 4.0, z: D2 / 2 + 0.25 }),
        box(W2 + 0.1, 0.5, 0.05, RD, { y: 4.3, z: D2 / 2 + 0.5 }),
        box(0.14, 2.1, 0.7, 0xffd84a, { x: W / 2 - 0.25, y: 4.7, z: D / 2 + 0.25, glow: 1 }),
        box(0.1, 2.3, 0.82, R, { x: W / 2 - 0.25, y: 4.7, z: D / 2 + 0.25 }),
        box(W2 + 0.1, 0.14, D2 + 0.1, GOLD, { y: 6.0 }),
        hip(W + 0.8, D + 0.8, 1.5, 0.35, ROOF, 6.0),
        horns(W + 0.8, D + 0.8, 6.05, ROOF, 0.55, 0.32, 0.16),
        box((W + 0.8) * 0.35 + 0.2, 0.18, 0.18, GOLD, { y: 7.55 }),
        sphere(0.2, 6, 4, GOLD, { y: 7.8 }),
        lantern(-W / 2 + 0.3, 2.65, D / 2 + 0.25, 0.22),
        lantern(W / 2 - 0.3, 2.65, D / 2 + 0.25, 0.22),
      );
    },
  },

  restaurant_small: {
    name: '中華料理店', kind: 'building', where: ['chinatown'], weight: 2,
    build: () => {
      const W = 7, D = 6, IV = 0xf0e2c0, R = 0xc42a2a, RD = 0xb01e1e, G = 0x2f9a6a;
      const W2 = W - 0.4, D2 = D - 0.4, W3 = W - 1.0, D3 = D - 1.0;
      return merge(
        box(W, 3.2, D, IV, { y: 1.6 }),
        box(1.6, 2.3, 0.06, WARM, { y: 1.15, z: D / 2 + 0.01, glow: 0.9 }),
        [-1, 1].map((s) => winZ(s * 2.3, 1.5, D / 2, 1.5, 1.3, RD, 0.8)),
        [-3.2, -1.15, 1.15, 3.2].map((x) => cyl(0.17, 0.17, 3.2, 6, RD, { x, y: 1.6, z: D / 2 + 0.45 })),
        box(W + 0.1, 0.2, 0.3, GOLD, { y: 3.12, z: D / 2 + 0.45 }),
        hip(W + 1.4, D + 1.4, 0.5, 0.8, G, 3.2),
        horns(W + 1.4, D + 1.4, 3.25, G, 0.45, 0.32, 0.15),
        repeat(5, (i) => lantern(-2.8 + i * 1.4, 2.75, D / 2 + 0.75, 0.24)),
        box(W2, 2.4, D2, R, { y: 3.6 + 1.2 }),
        box(W2 - 1.4, 1.1, 0.16, 0x8a1010, { y: 4.55, z: D2 / 2 + 0.1 }),
        box(W2 - 1.8, 0.8, 0.06, 0xffd040, { y: 4.55, z: D2 / 2 + 0.2, glow: 1 }),
        repeat(4, (i) => box(0.5, 0.5, 0.04, RD, { x: -1.35 + i * 0.9, y: 4.55, z: D2 / 2 + 0.24 })),
        [-1, 1].map((s) => winZ(s * 2.75, 4.6, D2 / 2, 0.7, 1.1, GOLD, 0.7)),
        [-1, 1].map((s) => [winX(s * W2 / 2, 4.7, -1.2, 1.0, 1.1, GOLD), winX(s * W2 / 2, 4.7, 1.2, 1.0, 1.1, GOLD)]),
        box(W2 + 0.1, 0.14, D2 + 0.1, GOLD, { y: 6.0 }),
        hip(W + 0.9, D + 0.9, 0.45, 0.82, G, 6.0),
        horns(W + 0.9, D + 0.9, 6.05, G, 0.42, 0.3, 0.14),
        box(W3, 1.6, D3, R, { y: 6.4 + 0.8 }),
        [-1.8, 0, 1.8].map((x) => winZ(x, 7.2, D3 / 2, 0.9, 0.9, GOLD, 0.7)),
        hip(W3 + 0.9, D3 + 0.9, 0.85, 0.35, G, 8.0),
        horns(W3 + 0.9, D3 + 0.9, 8.05, G, 0.42, 0.3, 0.14),
        box((W3 + 0.9) * 0.35 + 0.2, 0.15, 0.15, GOLD, { y: 8.88 }),
        sphere(0.16, 6, 4, GOLD, { y: 9.0 }),
        box(0.14, 2.2, 0.75, 0xffd84a, { x: -W / 2 + 0.25, y: 4.6, z: D / 2 + 0.2, glow: 1 }),
        box(0.1, 2.4, 0.87, R, { x: -W / 2 + 0.25, y: 4.6, z: D / 2 + 0.2 }),
      );
    },
  },

  house: {
    name: '家', kind: 'building',
    variants: [0x3d4a5c, 0x8a3f2a, 0x2f6b5a],
    where: ['street'],
    build: (v) => {
      const W = 7.0, D = 6.0, H = 5.4, WALL = 0xeee4d0, F = 0x6a5a48;
      return merge(
        box(W, H, D, WALL, { y: H / 2 }),
        box(W + 0.04, 0.12, D + 0.04, 0xbcae94, { y: 2.75 }),
        box(W + 0.06, 0.3, D + 0.06, 0x9a9488, { y: 0.15 }),
        side([[-D / 2 - 0.5, 0], [D / 2 + 0.5, 0], [0, 2.0]], W + 0.8, v, { y: H }),
        box(W + 0.82, 0.12, 0.2, shade(v, 0.8), { y: H + 2.0 }),
        side([[-D / 2 - 0.5, -0.12], [D / 2 + 0.5, -0.12], [D / 2 + 0.5, 0.02], [-D / 2 - 0.5, 0.02]], W + 0.8, 0xf4f0e8, { y: H }),
        winZ(-1.8, 1.35, D / 2, 2.1, 1.4, F),
        winZ(-1.9, 4.05, D / 2, 1.4, 1.1, F),
        winZ(1.9, 4.05, D / 2, 1.2, 1.1, F),
        winX(W / 2, 1.4, -1.0, 1.2, 1.0, F),
        winX(-W / 2, 1.4, 0.5, 1.0, 1.0, F),
        winX(W / 2, 4.1, 0.8, 1.0, 1.0, F),
        winX(-W / 2, 4.1, -0.8, 1.0, 1.0, F),
        box(1.0, 2.05, 0.08, 0x7a5232, { x: 2.0, y: 1.02, z: D / 2 + 0.03 }),
        box(0.06, 0.06, 0.06, GOLD, { x: 1.65, y: 1.0, z: D / 2 + 0.09 }),
        box(1.6, 0.1, 1.0, v, { x: 2.0, y: 2.35, z: D / 2 + 0.5, rx: 0.12 }),
        sphere(0.1, 6, 4, WARM, { x: 2.7, y: 2.0, z: D / 2 + 0.1, glow: 1 }),
        box(3.0, 0.12, 0.9, 0x9a9890, { x: -1.6, y: 2.95, z: D / 2 + 0.45 }),
        box(3.0, 0.85, 0.06, 0xd8d8d0, { x: -1.6, y: 3.42, z: D / 2 + 0.88 }),
        box(1.1, 0.7, 0.1, 0xe8a0b0, { x: -2.3, y: 3.55, z: D / 2 + 0.93 }),
        box(0.85, 0.6, 0.3, 0xe8e8e4, { x: W / 2 - 0.6, y: 0.6, z: D / 2 + 0.2 }),
        cyl(0.22, 0.22, 0.02, 8, 0x8a8c8e, { x: W / 2 - 0.6, y: 0.6, z: D / 2 + 0.36, rx: PI / 2 }),
      );
    },
  },

  // ======================= BIRDS =======================
  gull_flying: {
    name: '飛んでるカモメ', kind: 'animal', where: ['waterfront'], weight: 2, move: 'fly', speed: 6,
    build: () => {
      const Wt = 0xf8f8f6, GR = 0x9aa4b0, BK = 0x2a2a2e, y0 = 0.1;
      const panel = (pts, color) => extrude(pts, 0.015, color, { rx: PI / 2 });
      const wing = (s) => {
        const m = (pts) => pts.map(([x, z]) => [x * s, z]);
        return [
          group([panel(m([[0, 0.09], [0.26, 0.07], [0.26, -0.07], [0, -0.09]]), GR)], { rz: s * 0.32, x: s * 0.05, y: y0 + 0.04 }),
          group([
            panel(m([[0, 0.07], [0.2, 0.03], [0.2, -0.04], [0, -0.07]]), GR),
            panel(m([[0.2, 0.03], [0.3, -0.01], [0.28, -0.04], [0.2, -0.04]]), BK),
          ], { rz: -s * 0.14, x: s * (0.05 + 0.26 * Math.cos(0.32)), y: y0 + 0.04 + 0.26 * Math.sin(0.32) }),
        ];
      };
      return merge(
        sphere(0.08, 8, 5, Wt, { y: y0, sz: 2.6 }),
        sphere(0.06, 7, 5, Wt, { y: y0 + 0.04, z: 0.2 }),
        cone(0.018, 0.08, 4, 0xf0c020, { rx: PI / 2, y: y0 + 0.035, z: 0.29 }),
        group([panel([[-0.05, -0.16], [0.05, -0.16], [0.08, -0.3], [-0.08, -0.3]], Wt)], { y: y0 + 0.02 }),
        wing(1), wing(-1),
      );
    },
  },
};
