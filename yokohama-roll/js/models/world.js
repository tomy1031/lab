// world.js — the final "world" stage: a toy planet Earth (sphere radius 1000 world units).
//
// UNITS HERE ARE WORLD UNITS, NOT METRES. Sizes are whimsical: the ball enters this stage at
// radius ≈ 6 near Yokohama and leaves at radius ≈ 300 when it swallows the planet, so things get
// bigger the further they are from Japan (small 3–10 near Japan, 10–40 across Asia/Oceania,
// 40–150 on other continents, the very biggest — mountain ranges, ice sheets, giant clouds — far away).
//
// Exports
//   default      protos { id: { name, kind, variants?, move?, speed?, build } }  (base y=0 = planet surface, up +Y, front +Z)
//   PLACEMENTS   [{ id, lat, lon, count, spread (deg), scale, move?, on }]
//                on: 'land' | 'sea' | 'air' — where a scattered copy should end up (use isLand to re-roll)
//   drawEarth(ctx, w, h)  paints an equirectangular map (x: lon −180→180, y: lat 90→−90)
//   isLand(lat, lon)      true when the point is on one of the map's land polygons (lakes excluded)
//   LAND, LAKES   the raw [lon, lat, lon, lat, …] outlines used by drawEarth / isLand

import { box, cyl, cone, sphere, torus, ico, dodeca, capsule, lathe, extrude, beam, group, repeat, merge, shade, rng } from '../geo.js';

const PI = Math.PI, TAU = PI * 2, SQ2 = Math.SQRT2;
// square frustum with half-widths aTop/aBot (axis aligned)
const sq = (aTop, aBot, h, col, o = {}) => cyl(aTop * SQ2, aBot * SQ2, h, 4, col, { ...o, ry: PI / 4 + (o.ry || 0) });
// extrude a top-view outline [[x, z], …] upward by h; base at o.y (no ry here — wrap in group())
const slab = (pts, h, col, o = {}) => extrude(pts.map(([x, z]) => [x, -z]), h, col, { ...o, rx: -PI / 2, y: (o.y || 0) + h / 2 });

const WHITE = 0xffffff, SNOW = 0xf6fafe, WIN = 0xffe7a3, GOLD = 0xf2c13a, WOOD = 0x7a5232;

// ---------- shared little builders ----------
const conifer = (x, z, s, col = 0x2e7d4a) => [
  cyl(0.12 * s, 0.16 * s, 0.6 * s, 5, WOOD, { x, z, y: 0.3 * s }),
  cone(0.75 * s, 1.4 * s, 6, col, { x, z, y: 1.15 * s }),
  cone(0.52 * s, 1.0 * s, 6, shade(col, 1.12), { x, z, y: 1.85 * s }),
];
const roundTree = (x, z, s, col = 0x4caf50) => [
  cyl(0.12 * s, 0.17 * s, 0.9 * s, 5, WOOD, { x, z, y: 0.45 * s }),
  ico(0.72 * s, 0, col, { x, z, y: 1.45 * s }),
];
const palm = (x, z, s, rot = 0, lean = 0.35) => {
  const tx = x + Math.sin(rot) * lean * 3 * s, tz = z + Math.cos(rot) * lean * 3 * s, ty = 3.2 * s;
  const mx = x + Math.sin(rot) * lean * 1.1 * s, mz = z + Math.cos(rot) * lean * 1.1 * s;
  const parts = [
    beam([x, 0, z], [mx, 1.7 * s, mz], 0.32 * s, 0x9a7048),
    beam([mx, 1.7 * s, mz], [tx, ty, tz], 0.27 * s, 0xa87c52),
    sphere(0.22 * s, 6, 4, 0x6b4a2a, { x: tx + 0.2 * s, y: ty - 0.2 * s, z: tz }),
    sphere(0.22 * s, 6, 4, 0x6b4a2a, { x: tx - 0.15 * s, y: ty - 0.25 * s, z: tz + 0.15 * s }),
  ];
  for (let i = 0; i < 6; i++) {
    parts.push(group([box(0.42 * s, 0.07 * s, 1.9 * s, i % 2 ? 0x3fae49 : 0x2f9a3f, { z: 0.9 * s, rx: 0.42 })],
      { ry: (i / 6) * TAU + rot, x: tx, y: ty, z: tz }));
  }
  return parts;
};
// cone + snow cap
function snowPeak(r, h, seg, rock, snow, frac, o = {}) {
  const y0 = o.y || 0, ry = o.ry || 0;
  return [
    cone(r, h, seg, rock, { x: o.x, z: o.z, y: y0 + h / 2, ry }),
    cone(r * frac * 1.07, h * frac * 1.03, seg, snow, { x: o.x, z: o.z, y: y0 + h - (h * frac * 1.03) / 2 + h * 0.012, ry }),
  ];
}
// a mountain range along X: len × dep footprint, tallest peak ≈ hMax in the middle
function range(seed, len, dep, hMax, rock, snow, frac, grass, nPeaks) {
  const r = rng(seed), parts = [];
  const n = nPeaks || Math.max(3, Math.round(len / (hMax * 0.32)));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const bell = 1 - Math.pow(2 * t - 1, 2) * 0.55;
    const h = hMax * bell * (i === (n >> 1) ? 1 : 0.55 + 0.4 * r());
    const rad = h * (0.8 + 0.35 * r());
    const x = (t - 0.5) * (len - rad * 1.6);
    const z = (r() - 0.5) * (dep - rad * 1.4);
    parts.push(snowPeak(rad, h, 5 + ((r() * 3) | 0), shade(rock, 0.9 + r() * 0.2), snow, frac, { x, z, ry: r() * TAU }));
  }
  if (grass) {
    for (let i = 0; i < n; i++) {
      const h = hMax * (0.12 + 0.12 * r());
      parts.push(cone(h * 2.4, h, 6, shade(grass, 0.9 + r() * 0.2), { x: (r() - 0.5) * len * 0.85, z: (r() - 0.5) * dep * 0.75, y: h / 2, ry: r() * TAU }));
    }
  }
  return parts;
}
// onion dome profile (sits on y=0, radius r at the bulge)
const onionPts = (r, h) => [[r * 0.82, 0], [r * 1.0, h * 0.14], [r * 1.06, h * 0.3], [r * 0.95, h * 0.48], [r * 0.66, h * 0.64], [r * 0.36, h * 0.78], [r * 0.15, h * 0.9], [0.001, h]];
const domePts = (r, n = 5) => { const a = []; for (let i = 0; i <= n; i++) { const t = (i / n) * PI / 2; a.push([Math.max(0.001, Math.cos(t) * r), Math.sin(t) * r]); } return a; };
// window stripes around a box-shaped tower
const winBands = (w, d, y0, y1, step, o = {}) => {
  const out = [];
  for (let y = y0 + step * 0.6; y < y1 - step * 0.3; y += step) out.push(box(w + 0.06, step * 0.32, d + 0.06, o.col || WIN, { x: o.x, z: o.z, y, glow: o.glow ?? 0.9 }));
  return out;
};

const P = {};

// =====================================================================  JAPAN
P.mt_fuji = {
  name: '富士山', kind: 'nature',
  build: () => {
    const R = 13, H = 13, top = 1.6;
    const rad = (t) => top + (R - top) * Math.pow(1 - t, 1.6);
    const prof = (t0, t1, n, k = 1) => { const a = []; for (let i = 0; i <= n; i++) { const t = t0 + ((t1 - t0) * i) / n; a.push([rad(t) * k, H * t]); } return a; };
    const parts = [
      lathe(prof(0, 0.12, 2), 18, 0x58a64e),
      lathe(prof(0.12, 0.6, 5), 18, 0x4d6fc4),
      lathe([...prof(0.6, 1, 4, 1.01), [top * 0.75, H - 0.3], [0.001, H - 0.35]], 18, SNOW),
    ];
    // snow fingers running down the slope
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13, t = 0.52 - (i % 2) * 0.05, rr = rad(t) * 1.015;
      const phi = Math.atan2((R - top) * 1.6 * Math.pow(1 - t, 0.6), H); // slope angle from vertical
      parts.push(group([cone(0.75, 2.8, 4, SNOW, { rx: PI - phi, sz: 0.3 })], { x: Math.sin(a) * rr, z: Math.cos(a) * rr, y: H * t, ry: a }));
    }
    return merge(parts);
  },
};

P.tokyo_tower = {
  name: '東京タワー', kind: 'landmark',
  build: () => {
    const R = 0xf05a28, Wt = 0xffffff, parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(beam([sx * 2.5, 0, sz * 2.5], [sx * 1.05, 3.3, sz * 1.05], 0.5, R));
    for (let k = 0; k < 4; k++) {
      parts.push(group([beam([-2.0, 1.1, 1.95], [0, 2.4, 1.6], 0.24, R), beam([2.0, 1.1, 1.95], [0, 2.4, 1.6], 0.24, R)], { ry: (k * PI) / 2 }));
    }
    parts.push(box(2.5, 0.75, 2.5, Wt, { y: 3.55 }), box(2.56, 0.28, 2.56, WIN, { y: 3.62, glow: 1 }));
    const a1 = (y) => 1.05 + ((0.45 - 1.05) * (y - 3.9)) / 3.1;
    for (let i = 0; i < 4; i++) { const y0 = 3.9 + i * 0.775, y1 = y0 + 0.775; parts.push(sq(a1(y1), a1(y0), 0.775, i % 2 ? Wt : R, { y: (y0 + y1) / 2 })); }
    parts.push(box(1.05, 0.5, 1.05, Wt, { y: 7.25 }), box(1.1, 0.18, 1.1, WIN, { y: 7.3, glow: 1 }));
    const a2 = (y) => 0.42 + ((0.13 - 0.42) * (y - 7.5)) / 1.8;
    for (let i = 0; i < 3; i++) { const y0 = 7.5 + i * 0.6, y1 = y0 + 0.6; parts.push(sq(a2(y1), a2(y0), 0.6, i % 2 ? Wt : R, { y: (y0 + y1) / 2 })); }
    parts.push(cyl(0.05, 0.09, 1.3, 6, R, { y: 9.95 }), sphere(0.12, 6, 4, 0xff4040, { y: 10.65, glow: 1 }));
    return merge(parts);
  },
};

P.skytree = {
  name: 'スカイツリー', kind: 'landmark',
  build: () => {
    const C = 0xe6eef6, S = 0xb9cde0, parts = [];
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; parts.push(beam([Math.sin(a) * 1.9, 0, Math.cos(a) * 1.9], [Math.sin(a) * 0.55, 4.2, Math.cos(a) * 0.55], 0.45, S)); }
    parts.push(
      cyl(0.5, 0.8, 7.0, 10, C, { y: 3.5 }),
      cyl(1.05, 0.9, 0.75, 14, 0xd8e3ee, { y: 7.3 }),
      cyl(1.08, 1.08, 0.28, 14, 0xa8dcff, { y: 7.3, glow: 1 }),
      cyl(0.38, 0.5, 3.2, 10, C, { y: 9.25 }),
      cyl(0.66, 0.6, 0.5, 12, 0xd8e3ee, { y: 11.05 }),
      cyl(0.68, 0.68, 0.18, 12, 0xa8dcff, { y: 11.05, glow: 1 }),
      cyl(0.13, 0.32, 2.7, 8, C, { y: 12.65 }),
      cyl(0.04, 0.08, 1.3, 6, 0xd04040, { y: 14.6 }),
      sphere(0.1, 6, 4, 0xff5050, { y: 15.3, glow: 1 }),
    );
    return merge(parts);
  },
};

P.torii = {
  name: '鳥居', kind: 'landmark',
  build: () => {
    const R = 0xe2382a, K = 0x2a2420;
    return merge(
      ...[-1.5, 1.5].map((x) => [cyl(0.22, 0.27, 4.4, 10, R, { x, y: 2.2 }), cyl(0.33, 0.33, 0.4, 10, K, { x, y: 0.2 })]),
      box(4.2, 0.28, 0.3, R, { y: 3.5 }),
      box(0.32, 0.7, 0.26, R, { y: 3.95 }),
      box(4.8, 0.3, 0.45, R, { y: 4.45 }),
      box(5.0, 0.3, 0.58, K, { y: 4.74 }),
      box(0.9, 0.3, 0.58, K, { x: 2.85, y: 4.86, rz: 0.24 }),
      box(0.9, 0.3, 0.58, K, { x: -2.85, y: 4.86, rz: -0.24 }),
    );
  },
};

P.osaka_castle = {
  name: '大阪城', kind: 'landmark',
  build: () => {
    const St = 0x8e8a80, Wl = 0xf6f2e8, Rf = 0x3f9a80, G = 0xf2c13a, parts = [sq(2.0, 2.5, 2.0, St, { y: 1.0 })];
    let y = 2.0;
    const ws = [3.4, 2.85, 2.35, 1.9, 1.45];
    ws.forEach((w, i) => {
      const h = 0.95;
      parts.push(box(w, h, w * 0.86, Wl, { y: y + h / 2 }));
      parts.push(box(w + 0.04, 0.16, w * 0.86 + 0.04, 0x2a2a30, { y: y + h * 0.55, glow: 0.7 }));
      const last = i === ws.length - 1;
      parts.push(sq(last ? 0.12 : w * 0.34, w * 0.68, last ? 0.9 : 0.42, Rf, { y: y + h + (last ? 0.45 : 0.21), sz: 0.9 }));
      parts.push(box(w * 1.36, 0.08, 0.12, G, { y: y + h + 0.02, z: w * 0.6 }));
      y += h + 0.42;
    });
    parts.push(box(0.16, 0.35, 0.3, G, { x: 0.35, y: y + 0.55 }), box(0.16, 0.35, 0.3, G, { x: -0.35, y: y + 0.55 }));
    return merge(parts);
  },
};

P.kinkakuji = {
  name: '金閣寺', kind: 'landmark',
  build: () => {
    const Gd = 0xf5c430, Rf = 0x4a3a2c, parts = [cyl(4.2, 4.4, 0.16, 14, 0x3b8fd4, { y: 0.08 })];
    parts.push(box(3.2, 0.25, 2.5, 0x8a7a68, { y: 0.28 }));
    parts.push(box(3.0, 0.95, 2.3, 0xf2e8d2, { y: 0.88 }), box(3.04, 0.3, 2.34, 0x5a4636, { y: 0.88, glow: 0.4 }));
    parts.push(sq(1.25, 1.95, 0.35, Rf, { y: 1.53, sz: 0.82 }));
    parts.push(box(2.6, 0.85, 2.0, Gd, { y: 2.13 }), box(2.64, 0.22, 2.04, 0xd09a20, { y: 2.13, glow: 0.5 }));
    parts.push(sq(1.15, 1.8, 0.35, Rf, { y: 2.73, sz: 0.82 }));
    parts.push(box(1.5, 0.75, 1.5, Gd, { y: 3.28 }));
    parts.push(sq(0.12, 1.25, 0.85, Rf, { y: 4.08 }));
    parts.push(box(0.22, 0.4, 0.5, Gd, { y: 4.65 }));
    parts.push(...conifer(-3.0, -1.6, 1.1, 0x2f7a3a), ...conifer(2.9, -2.0, 1.0, 0x2f7a3a), ...conifer(3.2, 1.8, 0.8, 0x3a8a40));
    parts.push(dodeca(0.5, 0x8a8a84, { x: -2.2, z: 2.6, y: 0.2, sy: 0.6 }));
    return merge(parts);
  },
};

P.shinkansen = {
  name: '新幹線', kind: 'vehicle',
  build: () => {
    const Wt = 0xf8f8f6, B = 0x1f5fc2, parts = [];
    parts.push(box(0.78, 0.6, 8.0, Wt, { y: 0.55 }), cyl(0.39, 0.39, 8.0, 10, Wt, { rx: PI / 2, y: 0.82 }));
    parts.push(box(0.6, 0.25, 9.0, 0x5a5e66, { y: 0.14 }));
    for (const s of [-1, 1]) {
      parts.push(sphere(0.39, 10, 7, Wt, { z: s * 4.0, y: 0.6, sz: 3.0, sy: 1.25 }));
      parts.push(sphere(0.25, 8, 5, 0x1c2a44, { z: s * 4.55, y: 0.92, sz: 1.6, sy: 0.6, glow: 0.4 }));
      parts.push(sphere(0.4, 10, 5, B, { z: s * 4.0, y: 0.46, sz: 3.0, sy: 0.32 }));
    }
    parts.push(box(0.8, 0.1, 8.0, B, { y: 0.44 }));
    parts.push(box(0.8, 0.15, 7.4, 0x2a3550, { y: 0.8, glow: 0.8 }));
    for (const z of [-1.4, 1.4]) parts.push(box(0.82, 0.9, 0.06, 0x8a8e96, { y: 0.62, z }));
    return merge(parts);
  },
};

P.pagoda = {
  name: '五重塔', kind: 'landmark',
  build: () => {
    const Wd = 0xc0392b, Rf = 0x3b3540, parts = [box(2.6, 0.4, 2.6, 0x9a948a, { y: 0.2 })];
    let y = 0.4;
    for (let i = 0; i < 5; i++) {
      const w = 1.9 - i * 0.2, h = 0.85;
      parts.push(box(w, h, w, Wd, { y: y + h / 2 }), box(w * 0.5, h * 0.55, w + 0.04, 0xffd48a, { y: y + h * 0.45, glow: 0.6 }));
      parts.push(sq(w * 0.42, w * 0.98, 0.3, Rf, { y: y + h + 0.15 }));
      y += h + 0.3;
    }
    parts.push(cyl(0.05, 0.08, 1.9, 6, GOLD, { y: y + 0.95 }));
    for (let k = 0; k < 5; k++) parts.push(cyl(0.18, 0.18, 0.06, 8, GOLD, { y: y + 0.4 + k * 0.25 }));
    return merge(parts);
  },
};

P.deer = {
  name: '奈良のシカ', kind: 'animal',
  build: () => {
    const F = 0xb67b45, Sp = 0xf3e3c8, K = 0x3a2a1c, A = 0xe6d2a8, parts = [];
    parts.push(capsule(0.45, 1.1, F, { rx: PI / 2, y: 1.4 }));
    for (const x of [-0.24, 0.24]) for (const z of [-0.55, 0.55]) parts.push(cyl(0.09, 0.07, 1.1, 6, F, { x, z, y: 0.55 }), box(0.14, 0.1, 0.16, K, { x, z, y: 0.05 }));
    parts.push(cyl(0.16, 0.22, 0.85, 6, F, { y: 1.95, z: 0.78, rx: 0.5 }));
    parts.push(box(0.36, 0.34, 0.55, F, { y: 2.35, z: 1.02 }), box(0.18, 0.13, 0.1, K, { y: 2.3, z: 1.31 }));
    for (const s of [-1, 1]) {
      parts.push(box(0.3, 0.1, 0.08, F, { x: s * 0.27, y: 2.5, z: 0.92, rz: s * 0.4 }));
      parts.push(sphere(0.05, 5, 4, K, { x: s * 0.17, y: 2.42, z: 1.22 }));
      parts.push(beam([s * 0.1, 2.5, 0.95], [s * 0.38, 3.05, 0.85], 0.07, A), beam([s * 0.26, 2.8, 0.9], [s * 0.45, 2.95, 1.05], 0.06, A));
    }
    for (let i = 0; i < 6; i++) parts.push(sphere(0.07, 5, 4, Sp, { x: (i % 2 ? 0.3 : -0.3), y: 1.62, z: -0.6 + i * 0.24 }));
    parts.push(box(0.2, 0.25, 0.12, Sp, { y: 1.55, z: -1.0 }));
    return merge(parts);
  },
};

P.sushi_giant = {
  name: '巨大おすし', kind: 'food', variants: [0xff8a5c, 0xd8344a, 0xffd447],
  build: (v = 0xff8a5c) => {
    const parts = [capsule(0.45, 2.0, 0xfbfaf4, { rx: PI / 2, y: 0.45, sx: 1.55 })];
    const r = rng(5);
    for (let i = 0; i < 14; i++) parts.push(ico(0.12, 0, 0xffffff, { x: (r() - 0.5) * 1.3, y: 0.15 + r() * 0.5, z: (r() - 0.5) * 2.6 }));
    parts.push(box(1.6, 0.3, 3.0, v, { y: 0.98, rx: 0.04 }));
    if (v === 0xffd447) parts.push(box(1.7, 1.22, 0.5, 0x1e2a1e, { y: 0.6 }));
    else for (let i = 0; i < 5; i++) parts.push(box(1.62, 0.04, 0.12, v === 0xff8a5c ? 0xffd2b8 : 0xf08a98, { y: 1.14, z: -1.1 + i * 0.55, ry: 0.5 }));
    return merge(parts);
  },
};

P.sakura = {
  name: '桜の木', kind: 'plant',
  build: () => {
    const r = rng(9), parts = [cyl(0.22, 0.32, 2.0, 7, 0x6b4630, { y: 1.0 }), beam([0, 1.7, 0], [0.9, 2.6, 0.3], 0.2, 0x6b4630), beam([0, 1.8, 0], [-0.8, 2.7, -0.3], 0.2, 0x6b4630)];
    for (let i = 0; i < 8; i++) parts.push(ico(0.75 + r() * 0.4, 0, [0xffb7d0, 0xff9fc3, 0xffd0e0][i % 3], { x: (r() - 0.5) * 2.4, y: 2.8 + r() * 1.0, z: (r() - 0.5) * 2.2 }));
    return merge(parts);
  },
};

P.daruma = {
  name: 'だるま', kind: 'thing',
  build: () => merge(
    sphere(1.0, 12, 9, 0xd8282c, { y: 1.05, sy: 1.08 }),
    sphere(0.6, 10, 7, 0xfff4e8, { y: 1.3, z: 0.74, sz: 0.5 }),
    sphere(0.14, 6, 4, 0x1a1a1a, { x: -0.22, y: 1.4, z: 1.02 }),
    sphere(0.15, 6, 4, 0xffffff, { x: 0.22, y: 1.4, z: 1.0 }),
    box(0.2, 0.07, 0.1, 0x1a1a1a, { x: -0.25, y: 1.65, z: 0.98, rz: 0.3 }), box(0.2, 0.07, 0.1, 0x1a1a1a, { x: 0.25, y: 1.65, z: 0.98, rz: -0.3 }),
    box(0.36, 0.07, 0.1, 0x1a1a1a, { y: 1.08, z: 1.0 }),
    torus(0.6, 0.06, 4, 14, GOLD, { y: 1.3, z: 0.78, sz: 0.5 }),
    box(0.55, 0.35, 0.1, GOLD, { y: 0.6, z: 0.92, rx: -0.4 }),
  ),
};

P.maneki = {
  name: '招き猫', kind: 'thing',
  build: () => {
    const Wt = 0xfdfbf6, parts = [];
    parts.push(sphere(0.8, 10, 7, Wt, { y: 0.85, sy: 1.1 }));
    parts.push(sphere(0.65, 10, 7, Wt, { y: 2.0 }));
    for (const s of [-1, 1]) {
      parts.push(cone(0.22, 0.4, 4, Wt, { x: s * 0.38, y: 2.6, rz: -s * 0.3 }), cone(0.12, 0.25, 4, 0xff9fb0, { x: s * 0.38, y: 2.58, z: 0.08, rz: -s * 0.3 }));
      parts.push(box(0.15, 0.05, 0.05, 0x1a1a1a, { x: s * 0.24, y: 2.08, z: 0.6 }));
      parts.push(box(0.3, 0.03, 0.03, 0x555555, { x: s * 0.5, y: 1.9, z: 0.55, rz: s * 0.15 }));
    }
    parts.push(sphere(0.07, 5, 4, 0xff7090, { y: 1.95, z: 0.65 }));
    parts.push(capsule(0.17, 0.5, Wt, { x: 0.6, y: 2.25, z: 0.2, rz: -0.2 }), sphere(0.2, 6, 4, Wt, { x: 0.68, y: 2.65, z: 0.25 }));
    parts.push(capsule(0.17, 0.3, Wt, { x: -0.38, y: 1.15, z: 0.6, rx: 0.8 }));
    parts.push(cyl(0.38, 0.38, 0.08, 10, GOLD, { x: -0.25, y: 1.25, z: 0.75, rx: PI / 2 - 0.3 }));
    parts.push(torus(0.52, 0.07, 4, 12, 0xd8282c, { y: 1.55, rx: PI / 2 }), sphere(0.14, 6, 4, GOLD, { y: 1.42, z: 0.55 }));
    parts.push(sphere(0.3, 6, 5, 0xf2a03a, { x: -0.3, y: 1.0, z: -0.65 }), sphere(0.25, 6, 5, 0x333333, { x: 0.35, y: 1.3, z: -0.6 }));
    return merge(parts);
  },
};

P.minka = {
  name: '古民家', kind: 'building', variants: [0x3a4050, 0x9a7a4a],
  build: (v = 0x3a4050) => {
    const thatch = v === 0x9a7a4a;
    const roofPts = [[-2.6, 0], [2.6, 0], [0, thatch ? 2.3 : 1.6]];
    return merge(
      box(4.2, 0.3, 3.2, 0x8a8478, { y: 0.15 }),
      box(4.0, 1.8, 3.0, 0xf4ecd8, { y: 1.2 }),
      ...[-1.7, -0.6, 0.6, 1.7].map((x) => box(0.14, 1.8, 0.1, 0x5a3a26, { x, y: 1.2, z: 1.52 })),
      box(1.0, 0.7, 0.08, WIN, { x: -1.15, y: 1.4, z: 1.53, glow: 0.9 }),
      box(0.9, 1.3, 0.08, 0x6a4a30, { x: 0.6, y: 0.95, z: 1.53 }),
      extrude(roofPts, 3.8, v, { y: 2.1 }),
      box(0.5, 0.25, 4.0, shade(v, 0.75), { y: thatch ? 4.4 : 3.7 }),
    );
  },
};

P.ramen = {
  name: 'ラーメン', kind: 'food',
  build: () => {
    const parts = [lathe([[0.7, 0], [1.25, 0.25], [1.6, 0.9], [1.7, 1.35], [1.58, 1.35], [1.45, 0.9], [0.001, 0.9]], 14, 0xd8382c)];
    parts.push(torus(1.48, 0.06, 4, 16, 0xffffff, { y: 1.05, rx: PI / 2 }));
    parts.push(cyl(1.5, 1.5, 0.06, 14, 0xe8a850, { y: 1.18 }));
    for (let i = 0; i < 6; i++) parts.push(torus(0.4 + i * 0.12, 0.05, 3, 10, 0xffe08a, { y: 1.23, rx: PI / 2, x: -0.2, z: 0.1 }));
    parts.push(sphere(0.32, 8, 5, 0xffffff, { x: 0.55, y: 1.25, z: 0.45, sy: 0.6 }), cyl(0.15, 0.15, 0.05, 8, 0xffb020, { x: 0.55, y: 1.45, z: 0.45 }));
    parts.push(cyl(0.3, 0.3, 0.08, 10, 0xffffff, { x: -0.6, y: 1.25, z: -0.5 }), torus(0.15, 0.04, 3, 8, 0xff6a9a, { x: -0.6, y: 1.3, z: -0.5, rx: PI / 2 }));
    parts.push(box(0.75, 0.9, 0.05, 0x1e2a1e, { x: 0.1, y: 1.6, z: -1.1, rx: -0.3 }));
    parts.push(box(0.4, 0.05, 0.6, 0xc87a3a, { x: 0.4, y: 1.24, z: -0.3 }));
    parts.push(beam([0.6, 1.25, 0.9], [-0.9, 2.1, -0.6], 0.07, 0xc8a070), beam([0.8, 1.25, 0.8], [-0.7, 2.2, -0.75], 0.07, 0xc8a070));
    return merge(parts);
  },
};

// =====================================================================  JAPAN — regional things (PLACEMENTS sets their size via scale)
const VERM = 0xe2382a, INK = 0x2a2420, SKIN = 0xf4d2b0;
// paper lantern with black caps
const chochin = (r, col, o = {}) => [
  sphere(r, 8, 6, col, { x: o.x, y: o.y, z: o.z, sy: 1.25, glow: o.glow ?? 1 }),
  cyl(r * 0.55, r * 0.55, r * 0.3, 8, INK, { x: o.x, z: o.z, y: (o.y || 0) + r * 1.2 }),
  cyl(r * 0.55, r * 0.55, r * 0.3, 8, INK, { x: o.x, z: o.z, y: (o.y || 0) - r * 1.2 }),
];
// little vermilion torii, w wide / h tall, base on y=0
const miniTorii = (w, h, o = {}) => { const t = w * 0.09; return group([
  box(t, h, t, VERM, { x: -w * 0.36, y: h / 2 }), box(t, h, t, VERM, { x: w * 0.36, y: h / 2 }),
  box(w * 0.84, t * 0.8, t * 0.8, VERM, { y: h * 0.76 }),
  box(w, t * 1.1, t * 1.6, INK, { y: h + t * 0.3 }),
], o); };
// a front-facing curved gable (karahafu): half-disc extruded along z
const karahafu = (w, h, d, col, o = {}) => { const pts = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * PI; pts.push([-Math.cos(a) * w / 2, Math.sin(a) * h]); } return extrude(pts, d, col, o); };
// Japanese castle keep: stone base, stacked storeys, flared hip roofs, chidori gables, golden shachi
function jcastle({ wall, band, bandH = 0.5, roof, tiers, w0, step, stone = 0x9a948a, base = 1.8, flare = 0.64 }) {
  const parts = [sq(w0 * 0.56, w0 * 0.68, base * 0.55, stone, { y: base * 0.275 }), sq(w0 * 0.52, w0 * 0.56, base * 0.45, shade(stone, 1.08), { y: base * 0.775 })];
  let y = base;
  for (let i = 0; i < tiers; i++) {
    const w = w0 - i * step, d = w * 0.82, h = i === 0 ? 1.15 : 0.82, last = i === tiers - 1;
    parts.push(box(w, h, d, wall, { y: y + h / 2 }));
    if (band) parts.push(box(w + 0.04, h * bandH, d + 0.04, band, { y: y + (h * bandH) / 2 }));
    parts.push(box(w + 0.06, 0.15, d + 0.06, 0x2a2a30, { y: y + h * 0.7, glow: 0.75 }));
    const rh = last ? 0.95 : 0.42, top = last ? 0.08 : (w - step) * 0.5;
    parts.push(group([sq(top, w * flare, rh, roof, { y: rh / 2 })], { y: y + h, sz: d / w }));
    if (!last && i % 2 === 0) for (const s of [-1, 1]) parts.push(extrude([[-w * 0.24, 0], [w * 0.24, 0], [0, 0.55]], 0.25, roof, { y: y + h + 0.1, z: s * d * 0.5 }));
    if (!last && i % 2 === 1) parts.push(karahafu(w * 0.4, 0.38, 0.3, roof, { y: y + h + 0.05, z: d * 0.52 }));
    y += h + (last ? rh : rh * 0.85);
  }
  for (const s of [-1, 1]) parts.push(box(0.14, 0.36, 0.26, GOLD, { x: s * 0.3, y: y - 0.02, rz: s * 0.25, glow: 0.3 }));
  return parts;
}

// ---- Tokyo / Yokohama
P.landmark_tower = {
  name: 'ランドマークタワー', kind: 'landmark',
  build: () => {
    const C = 0xdcd8d0, parts = [box(5.4, 1.2, 4.2, 0xc9b8a0, { y: 0.6 }), box(5.44, 0.3, 4.24, WIN, { y: 0.75, glow: 0.8 })];
    const a = (y) => 1.45 - (y - 1.2) * 0.04;
    for (let i = 0; i < 4; i++) { const y0 = 1.2 + i * 2.6, y1 = y0 + 2.6; parts.push(sq(a(y1), a(y0), 2.6, C, { y: (y0 + y1) / 2 })); }
    for (let y = 1.6; y < 11.2; y += 0.6) parts.push(sq(a(y) + 0.03, a(y) + 0.03, 0.2, WIN, { y, glow: 0.9 }));
    parts.push(sq(a(11.6) + 0.15, a(11.6) + 0.15, 0.8, 0xeeeae2, { y: 12.0 }), sq(a(11.6) + 0.17, a(11.6) + 0.17, 0.2, 0x8fd0ff, { y: 12.1, glow: 1 }));
    parts.push(sphere(0.12, 5, 4, 0xff4040, { y: 12.55, x: 0.6, glow: 1 }), sphere(0.12, 5, 4, 0xff4040, { y: 12.55, x: -0.6, glow: 1 }));
    return merge(parts);
  },
};

P.cosmo_clock = {
  name: '観覧車', kind: 'landmark',
  build: () => {
    const R = 5, cy = 6.2, parts = [box(7, 0.9, 3.2, 0xe8e0d0, { y: 0.45 }), box(7.04, 0.3, 3.24, WIN, { y: 0.5, glow: 0.8 })];
    parts.push(torus(R, 0.18, 4, 32, 0xf0f4f8, { y: cy, glow: 0.5 }), torus(R * 0.93, 0.08, 4, 32, 0x7ad0ff, { y: cy, glow: 1 }));
    const cols = [0xff5a6a, 0xffd23a, 0x4ac86a, 0x3a9ae8, 0xb07ae0, 0xff9a3a];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, x = Math.sin(a) * R, y = cy + Math.cos(a) * R;
      parts.push(beam([0, cy, 0], [x * 0.97, y - Math.cos(a) * 0.15, 0], 0.07, 0xdfe6ee));
      parts.push(box(0.5, 0.55, 0.45, cols[i % cols.length], { x: x * 1.06, y: cy + Math.cos(a) * R * 1.06 - 0.3, glow: 0.8 }));
    }
    parts.push(cyl(0.45, 0.45, 0.9, 10, 0xc8ccd4, { y: cy, rx: PI / 2 }), cyl(1.3, 1.3, 0.1, 16, 0xfafafa, { y: cy, z: 0.5, rx: PI / 2, glow: 0.9 }));
    parts.push(box(0.08, 0.95, 0.05, INK, { y: cy + 0.4, z: 0.57 }), box(0.7, 0.08, 0.05, INK, { x: 0.3, y: cy, z: 0.57 }));
    for (const s of [-1, 1]) for (const z of [-0.6, 0.6]) parts.push(beam([s * 2.6, 0.9, z * 2], [0, cy, z * 0.6], 0.22, 0xc8ccd4));
    return merge(parts);
  },
};

P.rainbow_bridge = {
  name: 'レインボーブリッジ', kind: 'landmark',
  build: () => {
    const W = 0xf2f4f6, parts = [box(17, 0.45, 1.4, 0xdfe2e6, { y: 1.9 }), box(17, 0.25, 1.2, 0x8a9098, { y: 1.3 })];
    for (const x of [-3.6, 3.6]) {
      for (const z of [-0.6, 0.6]) parts.push(box(0.35, 5.6, 0.35, W, { x, z, y: 2.8 }));
      parts.push(box(0.4, 0.35, 1.6, W, { x, y: 5.2 }), box(0.4, 0.3, 1.6, W, { x, y: 3.3 }));
      parts.push(sphere(0.12, 5, 4, 0xff4040, { x, y: 5.75, glow: 1 }));
    }
    for (const x of [-8.2, 8.2]) parts.push(box(1.0, 2.4, 1.8, 0xc8ccd2, { x, y: 1.2 }));
    const cols = [0xff4a4a, 0xff9a2a, 0xffe03a, 0x4ad86a, 0x3aa0ff, 0x8a5ae8];
    const cab = (x) => { const ax = Math.abs(x); return ax < 3.6 ? 2.4 + ((ax / 3.6) ** 2) * 3.0 : 5.4 - ((ax - 3.6) / 4.6) * 3.2; };
    for (const z of [-0.65, 0.65]) {
      for (let i = 0; i < 16; i++) { const x0 = -8.2 + i * 1.025, x1 = x0 + 1.025; parts.push(beam([x0, cab(x0), z], [x1, cab(x1), z], 0.1, W)); }
      for (let i = 1; i < 16; i++) { const x = -8.2 + i * 1.025; parts.push(sphere(0.1, 4, 3, cols[i % 6], { x, y: cab(x) + 0.05, z, glow: 1 })); }
    }
    return merge(parts);
  },
};

P.kaminarimon = {
  name: '雷門', kind: 'landmark',
  build: () => {
    const parts = [box(6, 0.3, 3, 0xa8a49a, { y: 0.15 })];
    for (const x of [-2.4, -0.9, 0.9, 2.4]) for (const z of [-1, 1]) parts.push(box(0.3, 2.9, 0.3, VERM, { x, z, y: 1.75 }));
    for (const x of [-1.95, 1.95]) parts.push(box(1.0, 2.9, 1.9, 0xd8442e, { x, y: 1.75 }));
    parts.push(box(5.6, 0.35, 2.4, VERM, { y: 3.25 }));
    parts.push(group([sq(1.6, 3.4, 0.9, 0x2e3036, { y: 0.45 })], { y: 3.4, sz: 0.6 }), box(3.4, 0.25, 0.3, 0x2e3036, { y: 4.4 }));
    parts.push(...chochin(0.75, 0xd8282c, { y: 1.9, glow: 0.9 }));
    parts.push(box(0.9, 0.18, 0.1, INK, { y: 2.2, z: 0.72 }), box(0.18, 0.7, 0.1, INK, { y: 1.75, z: 0.74 }), box(0.7, 0.14, 0.1, INK, { y: 1.5, z: 0.72 }));
    return merge(parts);
  },
};

P.kamakura_buddha = {
  name: '鎌倉の大仏', kind: 'landmark',
  build: () => {
    const B = 0x5f8f80, D = 0x4a7466, parts = [cyl(2.4, 2.6, 0.5, 12, 0x9a948a, { y: 0.25 }), cyl(2.1, 1.9, 0.4, 14, D, { y: 0.7 })];
    parts.push(sphere(1.9, 12, 7, B, { y: 1.25, sy: 0.42, sz: 0.85 }));
    parts.push(sphere(1.2, 10, 8, B, { y: 2.45, sy: 1.15, sz: 0.75 }));
    parts.push(sphere(0.5, 8, 6, D, { y: 1.65, z: 0.85, sy: 0.5, sx: 1.3 }));
    parts.push(cyl(0.42, 0.5, 0.5, 8, B, { y: 3.55 }));
    parts.push(sphere(0.78, 10, 8, B, { y: 4.15, sy: 1.08 }), sphere(0.42, 8, 6, D, { y: 4.85 }));
    for (const s of [-1, 1]) {
      parts.push(box(0.16, 0.85, 0.3, B, { x: s * 0.78, y: 3.95 }));
      parts.push(box(0.28, 0.05, 0.05, INK, { x: s * 0.27, y: 4.15, z: 0.74 }));
    }
    parts.push(sphere(0.06, 4, 3, D, { y: 4.4, z: 0.78 }));
    return merge(parts);
  },
};

P.onigiri = {
  name: 'おにぎり', kind: 'food',
  build: () => {
    const pts = [], Rc = 0.75, rc = 0.38;
    for (let k = 0; k < 3; k++) {
      const th = PI / 2 + (k * TAU) / 3, cx = Math.cos(th) * Rc, cy = Math.sin(th) * Rc;
      for (let j = 0; j <= 4; j++) { const ph = th - PI / 3 + (j / 4) * (TAU / 3); pts.push([cx + Math.cos(ph) * rc, cy + Math.sin(ph) * rc]); }
    }
    const y0 = Rc * 0.5 + rc;
    const r = rng(12), parts = [extrude(pts, 0.9, 0xfbfaf4, { y: y0 }), box(0.95, 0.8, 0.96, 0x1e2a1e, { y: 0.4 })];
    for (let i = 0; i < 6; i++) parts.push(box(0.05, 0.03, 0.03, 0x2a2a2a, { x: (r() - 0.5) * 0.9, y: 1.0 + r() * 0.5, z: 0.46 }));
    parts.push(sphere(0.14, 6, 4, 0xd8283c, { y: 1.65, z: 0.4 }));
    return merge(parts);
  },
};

P.dango = {
  name: 'おだんご', kind: 'food',
  build: () => {
    const parts = [cyl(1.5, 1.3, 0.14, 14, 0xb8282c, { y: 0.07 })];
    for (const [z, cols] of [[-0.38, [0xffa8c0, 0xfaf6ee, 0x8cc860]], [0.38, [0xb8702e, 0xb8702e, 0xb8702e]]]) {
      parts.push(beam([-1.45, 0.42, z], [1.35, 0.42, z], 0.06, 0xd8b880));
      cols.forEach((c, i) => parts.push(sphere(0.33, 8, 6, c, { x: -0.6 + i * 0.62, y: 0.46, z })));
      if (cols[0] === 0xb8702e) for (let i = 0; i < 3; i++) parts.push(sphere(0.3, 8, 3, 0x8a4a1a, { x: -0.6 + i * 0.62, y: 0.6, z, sy: 0.5 }));
    }
    return merge(parts);
  },
};

P.jihanki = {
  name: '自動販売機', kind: 'thing', variants: [0xd8282c, 0x2a6fd0, 0xf2f2ee],
  build: (v = 0xd8282c) => {
    const parts = [box(1.2, 2.0, 0.8, v, { y: 1.0 }), box(1.22, 0.18, 0.82, shade(v, 0.75), { y: 1.95 })];
    parts.push(box(1.0, 1.0, 0.06, 0xeef6ff, { y: 1.35, z: 0.4, glow: 1 }));
    const cc = [0xd8282c, 0x2a8ad8, 0xffd23a, 0x3ab86a, 0xff8a2a, 0x8a5ad8];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) parts.push(cyl(0.065, 0.065, 0.22, 6, cc[(row * 2 + i) % 6], { x: -0.36 + i * 0.18, y: 1.05 + row * 0.3, z: 0.45, glow: 0.5 }));
    parts.push(box(0.9, 0.06, 0.05, 0x40e060, { y: 0.78, z: 0.43, glow: 1 }), box(0.7, 0.25, 0.06, 0x1a1a1a, { y: 0.3, z: 0.4 }), box(0.12, 0.2, 0.06, 0xc8c8c8, { x: 0.4, y: 0.62, z: 0.41 }));
    return merge(parts);
  },
};

// ---- Hokkaido
P.clock_tower = {
  name: '札幌時計台', kind: 'landmark',
  build: () => {
    const W = 0xf6f4ee, Rr = 0xc8423a, parts = [box(5.2, 0.3, 3.8, 0x8a8a84, { y: 0.15 }), box(4.6, 2.6, 3.2, W, { y: 1.6 })];
    for (const y of [1.0, 2.25]) {
      for (let i = 0; i < 5; i++) parts.push(box(0.4, 0.6, 0.06, WIN, { x: -1.8 + i * 0.9, y, z: 1.62, glow: 0.8 }));
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(box(0.06, 0.6, 0.4, WIN, { x: s * 2.32, y, z: -1 + i, glow: 0.8 }));
    }
    parts.push(extrude([[-2.3, 0], [2.3, 0], [0, 1.22]], 3.25, W, { y: 2.9 }));
    for (const s of [-1, 1]) parts.push(box(2.85, 0.14, 3.7, Rr, { x: s * 1.15, y: 3.58, rz: -s * 0.487 }));
    parts.push(box(1.5, 2.1, 1.5, W, { y: 4.0, z: 0.9 }));
    for (const [x, z, ry] of [[0, 1.66, 0], [0.76, 0.9, PI / 2], [-0.76, 0.9, -PI / 2]]) {
      parts.push(group([cyl(0.55, 0.55, 0.08, 14, 0xfafafa, { rx: PI / 2, glow: 0.6 }), box(0.06, 0.42, 0.04, INK, { y: 0.17, z: 0.05 }), box(0.32, 0.06, 0.04, INK, { x: 0.13, z: 0.05 })], { x, y: 4.35, z, ry }));
    }
    parts.push(sq(0.62, 0.95, 0.25, Rr, { y: 5.15, z: 0.9 }), box(1.1, 0.9, 1.1, W, { y: 5.7, z: 0.9 }), box(1.14, 0.45, 0.5, 0x4a3a2a, { y: 5.75, z: 0.9 }), box(0.5, 0.45, 1.14, 0x4a3a2a, { y: 5.75, z: 0.9 }));
    parts.push(sq(0.08, 0.85, 1.0, Rr, { y: 6.65, z: 0.9 }), cyl(0.03, 0.05, 0.7, 4, INK, { y: 7.45, z: 0.9 }));
    parts.push(...roundTree(-3.0, 1.4, 0.9, 0x4caf50), ...roundTree(3.0, -1.2, 1.0, 0x66bb46));
    return merge(parts);
  },
};

P.cow = {
  name: '北海道の牛', kind: 'animal',
  build: () => {
    const W = 0xfafaf6, K = 0x1e1e22, Pk = 0xf0a8b0, parts = [box(1.1, 0.95, 2.1, W, { y: 1.35 })];
    parts.push(box(1.14, 0.55, 0.6, K, { y: 1.45, z: 0.35 }), box(1.14, 0.45, 0.5, K, { y: 1.25, z: -0.62 }), box(0.6, 0.06, 0.7, K, { x: 0.2, y: 1.84, z: -0.15 }));
    for (const x of [-0.35, 0.35]) for (const z of [-0.78, 0.78]) parts.push(box(0.24, 0.85, 0.24, W, { x, z, y: 0.45 }), box(0.26, 0.14, 0.26, K, { x, z, y: 0.07 }));
    parts.push(box(0.62, 0.62, 0.72, W, { y: 1.72, z: 1.3 }), box(0.66, 0.3, 0.44, K, { y: 1.9, z: 1.22 }), box(0.52, 0.34, 0.26, Pk, { y: 1.5, z: 1.72 }));
    for (const s of [-1, 1]) {
      parts.push(sphere(0.06, 4, 3, K, { x: s * 0.32, y: 1.8, z: 1.5 }), box(0.32, 0.12, 0.16, K, { x: s * 0.46, y: 1.88, z: 1.2 }));
      parts.push(cone(0.06, 0.25, 4, 0xf2e6c8, { x: s * 0.2, y: 2.12, z: 1.28, rz: -s * 0.6 }));
      parts.push(sphere(0.05, 4, 3, 0x5a3a3a, { x: s * 0.12, y: 1.5, z: 1.86 }));
    }
    parts.push(sphere(0.25, 6, 5, Pk, { y: 0.85, z: -0.55 }), beam([0, 1.75, -1.05], [0, 0.95, -1.18], 0.07, W), sphere(0.1, 5, 4, K, { y: 0.9, z: -1.2 }));
    parts.push(cyl(0.12, 0.12, 0.18, 6, GOLD, { y: 1.22, z: 1.05 }));
    return merge(parts);
  },
};

P.lavender = {
  name: 'ラベンダー畑', kind: 'plant',
  build: () => {
    const parts = [box(10.4, 0.3, 8.4, 0x6aa84f, { y: 0.15 })];
    const rows = [0x8a5ad0, 0x9a6ae0, 0x8a5ad0, 0xf6f2fa, 0xff8ab8, 0xffd23a, 0xff5a3a, 0x8a5ad0, 0xa070e0];
    rows.forEach((c, i) => parts.push(cyl(0.36, 0.36, 8.6, 6, c, { rz: PI / 2, y: 0.6, x: -0.6, z: -3.4 + i * 0.85, sx: 0.8 })));
    parts.push(box(1.4, 1.0, 1.2, 0xf6f2e8, { x: 4.3, y: 0.8, z: -2.9 }), extrude([[-0.85, 0], [0.85, 0], [0, 0.7]], 1.3, 0xc8423a, { x: 4.3, y: 1.3, z: -2.9 }));
    parts.push(cone(0.45, 2.4, 6, 0x2e7d4a, { x: 4.4, y: 1.5, z: 1.0 }), cone(0.45, 2.2, 6, 0x3a8f55, { x: 4.4, y: 1.4, z: 2.4 }), cyl(0.1, 0.1, 0.4, 4, WOOD, { x: 4.4, y: 0.4, z: 1.0 }));
    return merge(parts);
  },
};

P.higuma = {
  name: 'ヒグマ', kind: 'animal',
  build: () => {
    const B = 0x6a4428, D = 0x4a2e1a, parts = [sphere(1.0, 10, 7, B, { y: 1.45, sx: 0.85, sz: 1.35 }), sphere(0.6, 8, 6, B, { y: 2.0, z: 0.1, sx: 0.85 })];
    for (const x of [-0.45, 0.45]) for (const z of [-0.75, 0.75]) parts.push(cyl(0.26, 0.28, 1.0, 7, D, { x, z, y: 0.5 }));
    parts.push(sphere(0.55, 10, 7, B, { y: 1.78, z: 1.35 }), sphere(0.28, 8, 6, 0x9a7050, { y: 1.62, z: 1.82, sz: 1.2 }), sphere(0.1, 6, 4, INK, { y: 1.72, z: 2.14 }));
    for (const s of [-1, 1]) parts.push(sphere(0.17, 6, 4, B, { x: s * 0.36, y: 2.22, z: 1.22 }), sphere(0.06, 4, 3, INK, { x: s * 0.2, y: 1.92, z: 1.8 }));
    parts.push(sphere(0.2, 8, 5, 0xd89a9a, { y: 1.48, z: 2.02, sx: 4.2 }), sphere(0.16, 8, 4, 0x9aa8b8, { y: 1.58, z: 2.02, sx: 4.0, sy: 0.5 }), cone(0.2, 0.35, 4, 0x9aa8b8, { x: 1.0, y: 1.48, z: 2.02, rz: PI / 2 }));
    return merge(parts);
  },
};

// ---- Tohoku
P.nebuta = {
  name: 'ねぶた', kind: 'thing',
  build: () => {
    const parts = [box(6, 0.7, 3.4, 0x5a3a26, { y: 0.65 }), box(6.2, 0.2, 3.6, 0xd8282c, { y: 1.05 })];
    for (const x of [-2.3, 2.3]) for (const z of [-1.6, 1.6]) parts.push(cyl(0.35, 0.35, 0.2, 10, INK, { x, z, y: 0.35, rx: PI / 2 }));
    parts.push(box(3.2, 2.0, 1.6, 0xd83a2a, { y: 2.2, glow: 0.8 }), box(3.24, 0.5, 1.64, 0x2a6ad8, { y: 1.55, glow: 0.8 }), box(1.0, 1.4, 1.66, 0xffd23a, { y: 2.4, glow: 0.8 }));
    parts.push(sphere(1.0, 10, 8, 0xfff2e0, { y: 3.9, z: 0.35, sz: 0.8, glow: 0.9 }), sphere(1.06, 10, 5, 0x1a3a8a, { y: 4.2, z: 0.2, sy: 0.6, glow: 0.6 }));
    for (const s of [-1, 1]) {
      parts.push(box(0.6, 0.15, 0.1, INK, { x: s * 0.32, y: 4.25, z: 1.12, rz: s * 0.35 }), sphere(0.17, 6, 4, WHITE, { x: s * 0.3, y: 4.0, z: 1.05, glow: 1 }), sphere(0.08, 4, 3, INK, { x: s * 0.3, y: 4.0, z: 1.2 }));
      parts.push(box(0.5, 0.09, 0.06, 0xd82020, { x: s * 0.32, y: 3.85, z: 1.1, rz: -s * 0.3, glow: 0.8 }));
      parts.push(box(0.2, 0.9, 0.2, GOLD, { x: s * 0.75, y: 5.0, z: 0.55, rz: -s * 0.55, glow: 0.8 }));
    }
    parts.push(box(0.7, 0.25, 0.1, 0x9a1a1a, { y: 3.55, z: 1.12, glow: 0.6 }), box(0.5, 0.08, 0.06, WHITE, { y: 3.62, z: 1.16 }), cone(0.35, 0.7, 5, INK, { y: 3.05, z: 0.85, rx: PI }));
    parts.push(cone(0.3, 1.1, 4, GOLD, { y: 5.15, z: 0.55, rx: 0.3, glow: 0.8 }));
    parts.push(beam([1.4, 2.8, 0.3], [2.4, 4.1, 0.8], 0.6, 0xd83a2a, { glow: 0.8 }), sphere(0.32, 6, 5, 0xffe2c8, { x: 2.45, y: 4.2, z: 0.85, glow: 0.8 }));
    parts.push(beam([2.45, 4.2, 0.85], [1.1, 6.4, 1.2], 0.2, 0xdfe8f0, { glow: 0.9 }), box(0.8, 0.12, 0.3, GOLD, { x: 2.35, y: 4.4, z: 0.9, rz: 0.5 }));
    parts.push(beam([-1.4, 2.8, 0.3], [-2.4, 2.3, 1.2], 0.6, 0x2a8a4a, { glow: 0.8 }), sphere(0.32, 6, 5, 0xffe2c8, { x: -2.45, y: 2.25, z: 1.25, glow: 0.8 }));
    for (let i = 0; i < 5; i++) parts.push(cone(0.35, 1.2, 4, i % 2 ? 0xff8a2a : 0xffd23a, { x: -2.6 + i * 1.3, y: 1.6, z: -1.2, glow: 0.9 }));
    return merge(parts);
  },
};

P.kanto_lantern = {
  name: '竿燈', kind: 'thing',
  build: () => {
    const Bm = 0xd8c890, parts = [cyl(0.07, 0.09, 7.6, 6, Bm, { y: 3.8 })];
    for (let row = 0; row < 9; row++) {
      const y = 2.5 + row * 0.55, n = row % 2 ? 4 : 5, half = ((n - 1) * 0.46) / 2;
      parts.push(box(half * 2 + 0.3, 0.04, 0.04, Bm, { y: y + 0.27 }));
      for (let i = 0; i < n; i++) parts.push(cyl(0.17, 0.17, 0.42, 6, i % 2 ? 0xfff0c8 : 0xffcf6a, { x: -half + i * 0.46, y, glow: 1 }));
    }
    parts.push(box(0.5, 0.35, 0.04, WHITE, { y: 7.55, rz: 0.3 }), box(0.04, 0.5, 0.3, 0xd8282c, { y: 7.25 }));
    parts.push(capsule(0.26, 0.6, 0x2a4a8a, { y: 0.75 }), sphere(0.22, 8, 6, SKIN, { y: 1.5 }), box(0.48, 0.08, 0.48, WHITE, { y: 1.62 }));
    return merge(parts);
  },
};

P.tanabata = {
  name: '仙台七夕', kind: 'thing',
  build: () => {
    const G = 0x6a9a3a, parts = [cyl(0.09, 0.12, 6.6, 6, G, { y: 3.3 }), box(5, 0.08, 0.08, G, { y: 5.7 }), box(1.2, 0.2, 1.2, 0x8a8478, { y: 0.1 })];
    for (let i = 0; i < 4; i++) parts.push(cone(0.3, 1.0, 4, 0x4a9a3a, { x: Math.sin(i * 1.7) * 0.4, y: 6.6 + i * 0.1, z: Math.cos(i * 1.7) * 0.4, rz: Math.sin(i * 1.7) * 0.6, rx: Math.cos(i * 1.7) * 0.6 }));
    for (const [x, c1, c2] of [[-1.9, 0xff5a8a, 0xffd23a], [0, 0x3a8ae8, 0xff8a2a], [1.9, 0x9a5ad8, 0x4ac86a]]) {
      parts.push(sphere(0.5, 10, 7, c1, { x, y: 5.2, glow: 0.4 }), cyl(0.5, 0.75, 3.0, 10, c2, { x, y: 3.45, glow: 0.3 }));
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; parts.push(box(0.14, 3.0, 0.05, k % 2 ? WHITE : c1, { x: x + Math.sin(a) * 0.64, z: Math.cos(a) * 0.64, y: 3.45, ry: a, glow: 0.3 })); }
    }
    return merge(parts);
  },
};

P.apple = {
  name: 'りんご', kind: 'food', variants: [0xd8282c, 0xe8c040],
  build: (v = 0xd8282c) => merge(
    lathe([[0.001, 0.05], [0.5, 0], [0.9, 0.25], [1.05, 0.7], [0.95, 1.2], [0.6, 1.45], [0.25, 1.38], [0.001, 1.25]], 12, v),
    beam([0, 1.2, 0], [0.1, 1.75, 0.05], 0.08, 0x6a4a2a),
    box(0.55, 0.05, 0.28, 0x4caf50, { x: 0.32, y: 1.62, rz: 0.4 }),
  ),
};

P.tanbo = {
  name: '田んぼ', kind: 'plant', variants: [0x6cc048, 0xe2c04a],
  build: (v = 0x6cc048) => {
    const gold = v === 0xe2c04a, parts = [box(8, 0.3, 8, 0x8a6a40, { y: 0.15 })];
    for (const x of [-2, 2]) for (const z of [-2, 2]) {
      parts.push(box(3.6, 0.06, 3.6, gold ? 0xb8a060 : 0x7ac8d8, { x, z, y: 0.32 }));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) parts.push(cone(0.28, gold ? 0.9 : 0.7, 5, i % 2 ? v : shade(v, 0.9), { x: x - 1.35 + i * 0.9, z: z - 1.35 + j * 0.9, y: gold ? 0.75 : 0.65 }));
    }
    parts.push(cyl(0.05, 0.05, 2.2, 4, WOOD, { x: 0, z: 0, y: 1.4 }), box(1.4, 0.08, 0.08, WOOD, { y: 1.9 }), sphere(0.25, 6, 4, 0xf2e6c8, { y: 2.55 }), cone(0.5, 0.35, 8, 0xd8b860, { y: 2.85 }), box(0.7, 0.6, 0.15, 0x3a6ad8, { y: 1.65 }));
    return merge(parts);
  },
};

P.nikko_gate = {
  name: '日光東照宮', kind: 'landmark',
  build: () => {
    const W = 0xf6f2e8, Gr = 0x2a8a6a, Bl = 0x2a5ab0, K = 0x24242a, parts = [box(6.5, 0.4, 4.2, 0xa8a49a, { y: 0.2 }), box(5.6, 0.3, 3.6, 0xc8c4b8, { y: 0.55 })];
    parts.push(box(4.8, 2.2, 2.8, W, { y: 1.8 }), box(1.6, 1.8, 2.9, 0x3a2416, { y: 1.6 }), box(4.84, 0.14, 2.84, GOLD, { y: 2.85 }), box(4.84, 0.12, 2.84, GOLD, { y: 0.8 }));
    parts.push(box(5.2, 0.5, 3.2, Gr, { y: 3.15 }), box(5.24, 0.16, 3.24, VERM, { y: 2.98 }), box(5.28, 0.12, 3.28, Bl, { y: 3.36, glow: 0.2 }));
    parts.push(group([sq(2.0, 3.0, 0.45, K, { y: 0.225 })], { y: 3.42, sz: 0.72 }));
    parts.push(box(4.4, 0.25, 2.8, VERM, { y: 3.98 }), box(3.8, 1.2, 2.2, W, { y: 4.65 }), box(3.84, 0.3, 2.24, 0xffd890, { y: 4.65, glow: 0.7 }));
    parts.push(box(4.2, 0.4, 2.6, Gr, { y: 5.45 }), box(4.24, 0.12, 2.64, GOLD, { y: 5.25 }));
    parts.push(group([sq(0.7, 2.7, 0.85, K, { y: 0.425 })], { y: 5.65, sz: 0.74 }), karahafu(2.0, 0.55, 0.5, K, { y: 5.62, z: 1.95 }), box(1.5, 0.18, 0.22, GOLD, { y: 6.55 }));
    for (const s of [-1, 1]) parts.push(box(0.22, 0.4, 0.22, GOLD, { x: s * 0.8, y: 6.75 }), box(0.5, 0.12, 0.12, GOLD, { x: s * 2.75, y: 3.55, z: 2.1, rz: s * 0.4 }));
    parts.push(...conifer(-3.8, -1.0, 1.7, 0x24693c), ...conifer(3.8, -1.2, 1.9, 0x24693c), ...conifer(-3.4, 1.4, 1.3, 0x2e7d4a));
    return merge(parts);
  },
};

// ---- Chubu / Kansai / Chugoku
P.gassho = {
  name: '合掌造り', kind: 'building', variants: [0, 1],
  build: (v = 0) => {
    const Th = 0x8a6a3a, parts = [box(4.2, 0.25, 5.4, v ? SNOW : 0x8a8478, { y: 0.12 }), box(3.4, 1.1, 4.6, 0x5a3a26, { y: 0.8 })];
    parts.push(box(2.6, 0.45, 4.64, WIN, { y: 0.85, glow: 0.8 }), box(3.44, 0.45, 2.6, WIN, { y: 0.85, glow: 0.8 }));
    parts.push(extrude([[-2.1, 0], [2.1, 0], [0, 3.85]], 4.7, 0xe2d6b8, { y: 1.35 }));
    for (const s of [-1, 1]) parts.push(box(5.0, 0.5, 5.5, Th, { x: s * 1.15, y: 3.45, rz: -s * 1.07 }));
    for (const z of [-2.37, 2.37]) for (const [y, n] of [[2.0, 3], [2.85, 2], [3.7, 1]]) for (let i = 0; i < n; i++) parts.push(box(0.45, 0.4, 0.06, WIN, { x: (i - (n - 1) / 2) * 0.8, y, z, glow: 0.9 }));
    parts.push(box(0.5, 0.35, 5.6, shade(Th, 0.7), { y: 5.6 }));
    if (v) for (const s of [-1, 1]) parts.push(box(4.9, 0.2, 5.5, SNOW, { x: s * 1.42, y: 3.6, rz: -s * 1.07 }));
    return merge(parts);
  },
};

P.matsumoto_castle = {
  name: '松本城', kind: 'landmark',
  build: () => {
    const main = jcastle({ wall: 0xf2eee6, band: 0x26262c, bandH: 0.74, roof: 0x3a3c44, tiers: 5, w0: 4.0, step: 0.55 });
    const small = group(jcastle({ wall: 0xf2eee6, band: 0x26262c, bandH: 0.74, roof: 0x3a3c44, tiers: 3, w0: 2.6, step: 0.45, base: 1.4 }), { x: -3.6, z: -0.6 });
    return merge(main, small, box(11, 0.08, 3.4, 0x3b8fd4, { y: 0.04, z: 4.4 }), box(0.7, 0.3, 3.6, VERM, { x: 2.2, y: 0.3, z: 4.4 }));
  },
};

P.himeji_castle = {
  name: '姫路城', kind: 'landmark',
  build: () => {
    const opt = { wall: 0xfbfaf6, roof: 0x9aa6b0, stone: 0xa8a294 };
    const main = jcastle({ ...opt, tiers: 5, w0: 4.4, step: 0.6, base: 2.4 });
    const a = group(jcastle({ ...opt, tiers: 3, w0: 2.4, step: 0.45, base: 1.8 }), { x: -3.8, z: -1.6 });
    const b = group(jcastle({ ...opt, tiers: 3, w0: 2.2, step: 0.4, base: 1.8 }), { x: 3.6, z: -1.8 });
    return merge(main, a, b, box(8.6, 1.0, 0.7, 0xfbfaf6, { y: 2.0, z: -1.7 }), box(8.8, 0.3, 1.0, 0x9aa6b0, { y: 2.6, z: -1.7 }), box(12, 0.3, 8, 0x6aa84f, { y: 0.15 }));
  },
};

P.kumamoto_castle = {
  name: '熊本城', kind: 'landmark',
  build: () => {
    const opt = { wall: 0xf2eee6, band: 0x24242a, bandH: 0.55, roof: 0x34363e, stone: 0x8a847a, flare: 0.66 };
    const main = jcastle({ ...opt, tiers: 4, w0: 4.4, step: 0.7, base: 2.4 });
    const small = group(jcastle({ ...opt, tiers: 3, w0: 3.0, step: 0.55, base: 2.0 }), { x: 4.2, z: -0.8 });
    return merge(main, small, box(10, 0.3, 7, 0x5cb85c, { y: 0.15 }), ...roundTree(-3.8, 2.2, 1.1, 0x4caf50), ...roundTree(-4.2, -1.8, 1.0, 0x66bb46));
  },
};

P.senbon_torii = {
  name: '千本鳥居', kind: 'landmark',
  build: () => {
    const parts = [box(3.4, 0.3, 11.4, 0x5a9a4a, { y: 0.75, rx: 0.12 }), box(1.5, 0.08, 11.2, 0xd8c8a0, { y: 0.92, rx: 0.12 })];
    for (let i = 0; i < 11; i++) { const z = 5 - i, x = Math.sin(i * 0.4) * 0.15; parts.push(miniTorii(1.6, 2.0, { x, z, y: 0.92 - z * 0.12 })); }
    for (const s of [-1, 1]) {
      parts.push(box(0.4, 0.5, 0.4, 0x9a948a, { x: s * 1.2, y: 0.25, z: 5.7 }), sphere(0.22, 6, 5, WHITE, { x: s * 1.2, y: 0.75, z: 5.7, sy: 1.3 }), sphere(0.16, 6, 4, WHITE, { x: s * 1.2, y: 1.12, z: 5.8 }));
      parts.push(cone(0.06, 0.18, 4, WHITE, { x: s * 1.2 + 0.08, y: 1.32, z: 5.78 }), cone(0.06, 0.18, 4, WHITE, { x: s * 1.2 - 0.08, y: 1.32, z: 5.78 }), box(0.25, 0.08, 0.05, VERM, { x: s * 1.2, y: 0.95, z: 5.92 }));
      for (let k = 0; k < 3; k++) parts.push(...conifer(s * 2.4, 3.5 - k * 3.6, 1.0 + (k % 2) * 0.3, 0x2e7d4a).map((g) => group([g], { y: 0.75 - (3.5 - k * 3.6) * 0.12 })).flat());
    }
    return merge(parts);
  },
};

P.daibutsu_hall = {
  name: '大仏殿', kind: 'landmark',
  build: () => {
    const Wd = 0x7a4a2e, Pl = 0xf2e6cc, Rf = 0x3a3a40, parts = [box(11, 0.5, 8.5, 0xb8b0a0, { y: 0.25 }), box(9, 2.2, 6.4, Pl, { y: 1.6 })];
    for (let i = 0; i <= 8; i++) parts.push(box(0.24, 2.2, 0.24, Wd, { x: -4.4 + i * 1.1, y: 1.6, z: 3.22 }));
    parts.push(box(9.04, 0.25, 6.44, Wd, { y: 2.6 }), box(2.4, 1.4, 0.1, 0x3a2416, { y: 1.2, z: 3.25 }), box(9.08, 0.3, 6.48, 0xffd890, { y: 2.0, glow: 0.5 }));
    parts.push(group([sq(3.6, 5.7, 0.9, Rf, { y: 0.45 })], { y: 2.72, sz: 0.78 }), karahafu(2.8, 0.7, 1.0, Rf, { y: 3.0, z: 3.4 }));
    parts.push(box(6.6, 1.6, 4.8, Pl, { y: 4.4 }), box(6.64, 0.35, 4.84, Wd, { y: 3.8 }), box(1.7, 1.0, 0.06, 0x2a1a10, { y: 4.45, z: 2.42 }), sphere(0.42, 8, 6, GOLD, { y: 4.45, z: 2.46, sz: 0.3, glow: 0.8 }));
    parts.push(group([sq(2.0, 4.4, 0.75, Rf, { y: 0.375 })], { y: 5.2, sz: 0.76 }), extrude([[-2.1, 0], [2.1, 0], [0, 1.35]], 5.4, Rf, { y: 5.9, ry: PI / 2 }));
    parts.push(box(5.8, 0.26, 0.3, 0x24242a, { y: 7.28 }));
    for (const s of [-1, 1]) parts.push(box(0.32, 0.65, 0.38, GOLD, { x: s * 2.85, y: 7.6, rz: s * 0.2, glow: 0.3 }));
    parts.push(cyl(0.18, 0.25, 0.9, 8, 0x6a7a6a, { y: 0.95, z: 3.9 }), cyl(0.38, 0.32, 0.5, 8, 0x6a7a6a, { y: 1.65, z: 3.9 }), cyl(0.33, 0.33, 0.3, 8, WIN, { y: 1.65, z: 3.9, glow: 1 }), cone(0.5, 0.4, 8, 0x5a6a5a, { y: 2.1, z: 3.9 }));
    return merge(parts);
  },
};

P.takoyaki = {
  name: 'たこ焼き', kind: 'food',
  build: () => {
    const r = rng(33), parts = [box(3.2, 0.22, 2.3, 0xe8d2a8, { y: 0.11 })];
    for (const s of [-1, 1]) parts.push(box(3.2, 0.32, 0.08, 0xd8c098, { y: 0.3, z: s * 1.15 }), box(0.08, 0.32, 2.3, 0xd8c098, { x: s * 1.6, y: 0.3 }));
    for (let i = 0; i < 3; i++) for (const z of [-0.5, 0.5]) {
      const x = -1.0 + i * 1.0;
      parts.push(sphere(0.48, 8, 6, 0xc88a3a, { x, y: 0.62, z }), sphere(0.46, 8, 4, 0x5a2a14, { x, y: 0.82, z, sy: 0.55 }));
      parts.push(box(0.08, 0.04, 0.08, 0x3a8a2a, { x: x + (r() - 0.5) * 0.4, y: 1.1, z: z + (r() - 0.5) * 0.4 }), box(0.18, 0.03, 0.12, 0xf0c8a0, { x: x - 0.1, y: 1.1, z: z + 0.1, ry: r() * 3 }));
    }
    for (let i = 0; i < 4; i++) parts.push(beam([-1.4 + i * 0.75, 1.08, -0.9], [-1.0 + i * 0.75, 1.08, 0.9], 0.06, 0xfff8e8));
    parts.push(beam([0.6, 0.95, 0.2], [1.6, 1.9, -0.4], 0.04, 0xd8b880));
    return merge(parts);
  },
};

P.yatai = {
  name: '屋台', kind: 'building', variants: [0xd8282c, 0x2a5a9a],
  build: (v = 0xd8282c) => {
    const parts = [box(3.2, 1.2, 1.6, WOOD, { y: 0.95 }), box(3.4, 0.12, 0.6, 0xc8a070, { y: 1.6, z: 0.95 })];
    for (const x of [-1.0, 1.0]) for (const z of [-0.86, 0.86]) parts.push(cyl(0.42, 0.42, 0.12, 10, 0x3a2a1c, { x, z, y: 0.42, rx: PI / 2 }));
    for (const x of [-1.5, 1.5]) for (const z of [-0.7, 0.7]) parts.push(box(0.1, 1.6, 0.1, WOOD, { x, z, y: 2.3 }));
    parts.push(box(3.8, 0.15, 2.6, v, { y: 3.15 }), box(3.8, 0.35, 0.08, WHITE, { y: 2.95, z: 1.3 }));
    for (let i = 0; i < 4; i++) parts.push(box(0.75, 0.75, 0.04, 0x24345a, { x: -1.2 + i * 0.8, y: 2.62, z: 1.25 }));
    parts.push(...chochin(0.28, 0xff4a2a, { x: 1.75, y: 2.45, z: 1.25 }));
    parts.push(cyl(0.35, 0.35, 0.4, 8, 0xc8ccd4, { x: -0.8, y: 1.8, z: 0.3 }), ico(0.3, 0, 0xf4f8fb, { x: -0.8, y: 2.35, z: 0.3 }), box(1.4, 0.3, 0.6, 0xffd890, { x: 0.6, y: 1.75, z: 0.3, glow: 0.8 }));
    for (let i = 0; i < 3; i++) parts.push(cyl(0.2, 0.2, 0.6, 8, 0xb8282c, { x: -1 + i, y: 0.3, z: 1.7 }));
    return merge(parts);
  },
};

P.kobe_tower = {
  name: '神戸ポートタワー', kind: 'landmark',
  build: () => {
    const R = 0xd8282c, H = 8, parts = [cyl(1.9, 2.1, 0.6, 12, 0xe8e4dc, { y: 0.3 })];
    for (let i = 0; i < 14; i++) for (const s of [-1, 1]) {
      const a = (i / 14) * TAU;
      parts.push(beam([Math.sin(a) * 1.45, 0.6, Math.cos(a) * 1.45], [Math.sin(a + s * PI * 0.7) * 1.05, H, Math.cos(a + s * PI * 0.7) * 1.05], 0.12, R, { glow: 0.45 }));
    }
    parts.push(cyl(0.3, 0.42, H - 0.6, 8, R, { y: (H + 0.6) / 2 }));
    parts.push(cyl(1.35, 1.05, 0.5, 12, 0xf2f2f2, { y: H + 0.25 }), cyl(1.36, 1.36, 0.22, 12, WIN, { y: H + 0.22, glow: 1 }), cyl(0.9, 1.25, 0.35, 12, R, { y: H + 0.67 }));
    parts.push(cyl(0.3, 0.5, 0.6, 8, 0xf2f2f2, { y: H + 1.15 }), cyl(0.05, 0.08, 0.9, 5, R, { y: H + 1.9 }), sphere(0.12, 5, 4, 0xff4040, { y: H + 2.4, glow: 1 }));
    return merge(parts);
  },
};

P.floating_torii = {
  name: '厳島の大鳥居', kind: 'landmark',
  build: () => {
    const R = 0xe0402a, parts = [cyl(5.6, 5.9, 0.2, 18, 0x4aa8d8, { y: 0.1 }), torus(1.0, 0.06, 3, 14, 0xe8f8ff, { y: 0.22, rx: PI / 2, x: 1.8 }), torus(1.0, 0.06, 3, 14, 0xe8f8ff, { y: 0.22, rx: PI / 2, x: -1.8 })];
    for (const x of [-1.8, 1.8]) {
      parts.push(cyl(0.3, 0.36, 5.0, 10, R, { x, y: 2.5 }));
      for (const z of [-0.95, 0.95]) parts.push(cyl(0.15, 0.18, 2.6, 8, R, { x, z, y: 1.3 }));
      parts.push(box(0.14, 0.14, 2.0, R, { x, y: 2.3 }), box(0.14, 0.14, 2.0, R, { x, y: 1.2 }));
    }
    parts.push(box(5.4, 0.3, 0.32, R, { y: 3.9 }), box(0.45, 0.8, 0.32, R, { y: 4.45 }), box(0.32, 0.5, 0.36, 0x1e2430, { y: 4.45, glow: 0.3 }), box(5.6, 0.3, 0.5, R, { y: 4.95 }));
    parts.push(box(6.6, 0.32, 0.7, INK, { y: 5.25 }));
    for (const s of [-1, 1]) parts.push(box(1.1, 0.3, 0.7, INK, { x: s * 3.4, y: 5.38, rz: s * 0.22 }));
    parts.push(box(8, 0.15, 0.9, R, { z: -4.2, y: 0.6 }), box(2.6, 1.1, 1.6, 0xf2e6cc, { z: -4.4, y: 1.2 }), group([sq(0.8, 1.8, 0.6, 0x5a7a6a, { y: 0.3 })], { z: -4.4, y: 1.75, sz: 0.7 }));
    for (let i = 0; i < 6; i++) parts.push(box(0.12, 0.6, 0.12, R, { x: -3.6 + i * 1.44, y: 0.3, z: -3.8 }), sphere(0.12, 5, 4, 0xffd27a, { x: -3.6 + i * 1.44, y: 0.85, z: -3.8, glow: 1 }));
    return merge(parts);
  },
};

// ---- Shikoku
P.uzushio = {
  name: '鳴門のうず潮', kind: 'nature',
  build: () => {
    const bowl = (r) => 0.06 + 0.75 * Math.pow(r / 6, 1.6);
    const parts = [lathe([[0.001, 0.04], [1.5, bowl(1.5)], [3.2, bowl(3.2)], [4.8, bowl(4.8)], [6, bowl(6)], [6.3, 0]], 18, 0x2a7ac0)];
    for (let i = 0; i < 6; i++) { const r = 5.6 - i * 0.9; parts.push(torus(r, 0.2 - i * 0.015, 3, 20, i % 2 ? 0x8fdcf2 : 0xf0faff, { rx: PI / 2, y: bowl(r) + 0.06 })); }
    for (let arm = 0; arm < 3; arm++) {
      let prev = null;
      for (let k = 0; k <= 9; k++) {
        const t = k / 9, r = 0.4 + t * 5.4, a = (arm * TAU) / 3 + t * 3.2, p = [Math.sin(a) * r, bowl(r) + 0.12, Math.cos(a) * r];
        if (prev) parts.push(beam(prev, p, 0.28, 0xffffff));
        prev = p;
      }
    }
    return merge(parts);
  },
};

P.udon = {
  name: 'さぬきうどん', kind: 'food',
  build: () => {
    const parts = [lathe([[0.7, 0], [1.25, 0.25], [1.6, 0.9], [1.7, 1.3], [1.58, 1.3], [1.45, 0.9], [0.001, 0.9]], 14, 0x2a3a6a)];
    parts.push(torus(1.6, 0.06, 4, 16, 0xf2f2f2, { y: 1.0, rx: PI / 2 }), cyl(1.5, 1.5, 0.06, 14, 0xd8b070, { y: 1.15 }));
    for (let i = 0; i < 5; i++) parts.push(torus(0.35 + i * 0.2, 0.09, 4, 12, 0xfaf6e8, { y: 1.2, rx: PI / 2, x: 0.1 - i * 0.05, z: -0.05 }));
    parts.push(capsule(0.2, 1.2, 0xe8a840, { y: 1.35, x: 0.2, z: 0.45, rz: PI / 2 + 0.2 }), cone(0.18, 0.3, 4, 0xe83a2a, { x: 1.1, y: 1.52, z: 0.45, rz: -PI / 2 }));
    parts.push(box(0.5, 0.18, 0.35, WHITE, { x: -0.6, y: 1.3, z: -0.5 }), box(0.5, 0.06, 0.35, 0xff8aa8, { x: -0.6, y: 1.42, z: -0.5 }));
    for (let i = 0; i < 6; i++) parts.push(cyl(0.08, 0.08, 0.04, 6, 0x6ac83a, { x: 0.5 + (i % 3) * 0.2, y: 1.25, z: -0.6 + ((i / 3) | 0) * 0.2 }));
    parts.push(beam([0.8, 1.32, 1.1], [-1.2, 1.4, -0.9], 0.06, 0xc8a070), beam([1.0, 1.32, 1.0], [-1.0, 1.42, -1.05], 0.06, 0xc8a070));
    return merge(parts);
  },
};

// ---- Kyushu / Okinawa
P.sakurajima = { name: '桜島', kind: 'nature', build: () => P.volcano.build() };

P.shurijo = {
  name: '首里城', kind: 'landmark',
  build: () => {
    const Rd = 0xc8202a, Tl = 0xd0503a, St = 0xdcc8a0, parts = [box(11, 0.8, 8, St, { y: 0.4 }), box(11.1, 0.12, 8.1, shade(St, 0.85), { y: 0.82 })];
    parts.push(box(8.5, 2.0, 5, Rd, { y: 1.8 }), box(8.54, 0.5, 5.04, 0xffd070, { y: 1.9, glow: 0.8 }));
    parts.push(group([sq(3.6, 4.9, 0.7, Tl, { y: 0.35 })], { y: 2.8, sz: 0.64 }), karahafu(3.6, 1.0, 1.6, Tl, { y: 2.85, z: 2.4 }), karahafu(3.0, 0.75, 1.64, GOLD, { y: 2.85, z: 2.42 }));
    parts.push(box(6.4, 1.3, 3.8, Rd, { y: 4.1 }), box(6.44, 0.35, 3.84, 0xffd070, { y: 4.1, glow: 0.8 }));
    parts.push(group([sq(1.5, 3.9, 0.8, Tl, { y: 0.4 })], { y: 4.75, sz: 0.62 }), extrude([[-1.3, 0], [1.3, 0], [0, 0.9]], 4.2, Tl, { y: 5.45, ry: PI / 2 }), box(4.6, 0.2, 0.25, 0xf2e6cc, { y: 6.4 }));
    for (const s of [-1, 1]) parts.push(box(0.3, 0.55, 0.3, GOLD, { x: s * 2.35, y: 6.65, glow: 0.4 }), cyl(0.16, 0.16, 2.0, 8, GOLD, { x: s * 0.9, y: 1.8, z: 2.62 }));
    for (let i = 0; i < 4; i++) parts.push(box(0.12, 0.12, 8.2, Rd, { x: -5.4 + i * 0.12, y: 1.0 }));
    return merge(parts);
  },
};

P.shisa = {
  name: 'シーサー', kind: 'thing', variants: [0xd8783a, 0xe0b048],
  build: (v = 0xd8783a) => {
    const M = shade(v, 0.75), parts = [box(1.6, 0.4, 1.6, 0xc84a30, { y: 0.2 }), sphere(0.6, 8, 6, v, { y: 1.0, sy: 1.1, sz: 0.9 })];
    for (const s of [-1, 1]) parts.push(cyl(0.15, 0.17, 0.7, 6, v, { x: s * 0.28, y: 0.75, z: 0.42 }), sphere(0.18, 6, 4, v, { x: s * 0.28, y: 0.45, z: 0.5 }));
    parts.push(box(0.95, 0.85, 0.8, v, { y: 1.85, z: 0.25 }));
    for (let i = 0; i < 9; i++) { const a = -PI * 0.55 + (i / 8) * PI * 1.1; parts.push(ico(0.24, 0, M, { x: Math.sin(a) * 0.6, y: 1.85 + Math.cos(a) * 0.55, z: 0.05 })); }
    parts.push(box(0.72, 0.28, 0.1, 0x7a1a14, { y: 1.62, z: 0.66 }));
    for (let i = 0; i < 4; i++) parts.push(box(0.1, 0.1, 0.06, WHITE, { x: -0.24 + i * 0.16, y: 1.72, z: 0.7 }));
    for (const s of [-1, 1]) parts.push(sphere(0.13, 6, 4, WHITE, { x: s * 0.22, y: 2.02, z: 0.64 }), sphere(0.07, 4, 3, INK, { x: s * 0.22, y: 2.02, z: 0.75 }), box(0.3, 0.1, 0.1, M, { x: s * 0.24, y: 2.2, z: 0.66, rz: s * 0.3 }));
    parts.push(sphere(0.13, 6, 4, M, { y: 1.85, z: 0.7 }), torus(0.22, 0.08, 4, 10, M, { y: 1.3, z: -0.6, ry: PI / 2 }));
    return merge(parts);
  },
};

P.ferry = {
  name: 'フェリー', kind: 'vehicle', move: 'sail', speed: 2,
  build: () => {
    const hull = (k) => [[-1.4 * k, -5 * k], [1.4 * k, -5 * k], [1.4 * k, 3.4 * k], [0, 5.2 * k], [-1.4 * k, 3.4 * k]];
    const parts = [slab(hull(1), 1.3, WHITE), slab(hull(1.015), 0.3, 0x1f5fc2, { y: 0.75 }), slab(hull(1.01), 0.35, 0xc83a2a)];
    parts.push(box(2.6, 0.9, 6.5, WHITE, { y: 1.75, z: -0.6 }), box(2.64, 0.3, 6.54, 0x2a3a5a, { y: 1.8, z: -0.6, glow: 0.9 }));
    parts.push(box(2.3, 0.8, 4.6, WHITE, { y: 2.6, z: -0.3 }), box(2.34, 0.25, 4.64, 0x2a3a5a, { y: 2.65, z: -0.3, glow: 0.9 }));
    parts.push(box(2.4, 0.6, 1.2, WHITE, { y: 3.3, z: 1.4 }), box(2.44, 0.22, 1.24, 0x2a3a5a, { y: 3.35, z: 1.4, glow: 0.9 }));
    parts.push(box(0.8, 1.3, 1.0, 0x1f5fc2, { y: 3.6, z: -2.4 }), box(0.84, 0.3, 1.04, 0xd8282c, { y: 4.15, z: -2.4 }));
    for (const s of [-1, 1]) for (const z of [-2, 0.6]) parts.push(capsule(0.16, 0.6, 0xff8a2a, { x: s * 1.35, y: 2.35, z, rx: PI / 2 }));
    return merge(parts);
  },
};

P.onsen = {
  name: '温泉ザル', kind: 'animal',
  build: () => {
    const r = rng(77), parts = [cyl(2.4, 2.4, 0.3, 14, 0x8fd8e0, { y: 0.25, sz: 0.85, glow: 0.3 })];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; parts.push(dodeca(0.5 + r() * 0.3, shade(0x8a8a84, 0.85 + r() * 0.3), { x: Math.cos(a) * 2.6, z: Math.sin(a) * 2.2, y: 0.3, sy: 0.7 })); }
    for (let i = 0; i < 4; i++) parts.push(sphere(0.3, 6, 4, SNOW, { x: Math.cos(i * 1.7) * 2.6, z: Math.sin(i * 1.7) * 2.2, y: 0.7, sy: 0.5 }));
    for (let i = 0; i < 5; i++) parts.push(ico(0.4 + i * 0.12, 0, 0xf4f8fb, { x: -1.2 + Math.sin(i * 1.3) * 0.5, y: 1.2 + i * 0.55, z: -0.6 }));
    parts.push(sphere(0.5, 8, 6, 0x9a7a5a, { y: 0.55 }), sphere(0.36, 8, 6, 0xa08060, { y: 1.15, z: 0.08 }), sphere(0.24, 8, 5, 0xf09a8a, { y: 1.12, z: 0.32, sz: 0.5 }));
    for (const s of [-1, 1]) parts.push(sphere(0.04, 4, 3, INK, { x: s * 0.09, y: 1.18, z: 0.44 }), sphere(0.09, 5, 4, 0xf09a8a, { x: s * 0.34, y: 1.18, z: 0.05 }));
    parts.push(box(0.5, 0.1, 0.35, WHITE, { y: 1.5, z: 0.05 }));
    return merge(parts);
  },
};

P.jp_alps = { name: '日本アルプス', kind: 'nature', build: () => merge(range(29, 60, 22, 18, 0x7a8a78, SNOW, 0.34, 0x5a9a4a, 9)) };

P.ryuhyo = {
  name: '流氷', kind: 'nature',
  build: () => {
    const r = rng(91), parts = [cyl(2.6, 3.0, 0.5, 7, 0xf4f8fb, { y: 0.25 })];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + r(); parts.push(dodeca(1.0 + r() * 1.0, i % 2 ? 0xf4f8fb : 0xdcecf6, { x: Math.cos(a) * (4 + r()), z: Math.sin(a) * (3.4 + r()), y: 0.15, sy: 0.25, ry: r() * TAU })); }
    parts.push(capsule(0.35, 0.9, 0xc8d0d8, { rx: PI / 2, y: 0.85, z: -0.2 }), sphere(0.32, 8, 6, 0xc8d0d8, { y: 1.05, z: 0.75 }), sphere(0.06, 4, 3, INK, { x: 0.13, y: 1.12, z: 1.02 }), sphere(0.06, 4, 3, INK, { x: -0.13, y: 1.12, z: 1.02 }), sphere(0.05, 4, 3, INK, { y: 1.0, z: 1.08 }));
    for (const s of [-1, 1]) parts.push(box(0.4, 0.06, 0.2, 0xb0b8c0, { x: s * 0.4, y: 0.6, z: 0.2, ry: s * 0.4 }));
    return merge(parts);
  },
};

// =====================================================================  generic fillers
P.city = {
  name: '街', kind: 'building', variants: [0, 1, 2],
  build: (v = 0) => {
    const r = rng(101 + v * 37), parts = [box(14, 0.3, 14, 0x9aa0a8, { y: 0.15 })];
    const cols = [0xf4f1ea, 0xe8d8c0, 0xbcd4e6, 0xf2c9a0, 0xd0d8e0, 0xf7e3a1, 0xc9e0c4, 0xf2b8b0];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = -5.25 + i * 3.5, z = -5.25 + j * 3.5;
      if (r() < 0.12) { parts.push(...roundTree(x, z, 1.1, 0x5cb85c)); continue; }
      const inner = (i === 1 || i === 2) && (j === 1 || j === 2);
      const w = 1.8 + r() * 1.1, d = 1.8 + r() * 1.1;
      const h = 1.5 + Math.pow(r(), 2) * (v === 2 ? 10 : 7) + (inner ? 3 : 0);
      const c = cols[(r() * cols.length) | 0];
      parts.push(box(w, h, d, c, { x, z, y: 0.3 + h / 2 }));
      parts.push(...winBands(w, d, 0.3, 0.3 + h, 1.4, { x, z }));
      if (h > 7 && r() < 0.6) parts.push(cyl(0.05, 0.08, 1.6, 4, 0xd04040, { x, z, y: 0.3 + h + 0.8 }), sphere(0.12, 5, 4, 0xff4040, { x, z, y: 0.3 + h + 1.65, glow: 1 }));
      else parts.push(box(w * 0.5, 0.5, d * 0.5, shade(c, 0.8), { x, z, y: 0.3 + h + 0.25 }));
    }
    return merge(parts);
  },
};

P.forest = {
  name: '森', kind: 'plant', variants: [0, 1],
  build: (v = 0) => {
    const r = rng(7 + v * 13), parts = [cyl(6.5, 6.9, 0.3, 9, v ? 0x6aa84f : 0x4f8a4a, { y: 0.15 })];
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 5.4, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 1.6 + r() * 1.4;
      parts.push(...(v === 0 ? conifer(x, z, s, [0x2e7d4a, 0x3a8f55, 0x24693c][i % 3]) : roundTree(x, z, s, [0x4caf50, 0x66bb46, 0x3f9a40, 0x8bc34a][i % 4])));
    }
    return merge(parts);
  },
};

P.jungle = {
  name: 'ジャングル', kind: 'plant',
  build: () => {
    const r = rng(31), parts = [cyl(7, 7.3, 0.3, 9, 0x2f7a32, { y: 0.15 })];
    for (let i = 0; i < 12; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 5.6, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 2.2 + r() * 1.6;
      parts.push(cyl(0.14 * s, 0.22 * s, 2.2 * s, 5, 0x6b4a2a, { x, z, y: 1.1 * s }));
      parts.push(ico(0.9 * s, 0, [0x1f8a3a, 0x2fa04a, 0x178032][i % 3], { x, z, y: 2.4 * s, sy: 0.7 }));
    }
    for (let i = 0; i < 4; i++) parts.push(...palm((r() - 0.5) * 9, (r() - 0.5) * 9, 1.4 + r() * 0.5, r() * TAU));
    for (let i = 0; i < 6; i++) parts.push(ico(0.35, 0, [0xff3a7a, 0xffd23a, 0xff7a1a][i % 3], { x: (r() - 0.5) * 11, z: (r() - 0.5) * 11, y: 0.5 }));
    parts.push(box(0.5, 0.7, 0.6, 0xe8302a, { x: 1.2, y: 7.0, z: 2.0 }), cone(0.18, 0.4, 4, 0xffd23a, { x: 1.2, y: 7.2, z: 2.45, rx: PI / 2 }), box(0.12, 0.9, 0.3, 0x2a6ae8, { x: 1.2, y: 6.3, z: 1.8 }));
    return merge(parts);
  },
};

P.fishing_boat = {
  name: '漁船', kind: 'vehicle', move: 'sail', speed: 1.5,
  build: () => merge(
    slab([[-0.9, -2.0], [0.9, -2.0], [0.9, 1.2], [0, 2.3], [-0.9, 1.2]], 0.8, 0x2a6fd0),
    slab([[-0.95, -2.05], [0.95, -2.05], [0.95, 1.2], [0, 2.35], [-0.95, 1.2]], 0.15, 0xffffff, { y: 0.8 }),
    box(1.2, 0.9, 1.1, 0xffffff, { y: 1.4, z: -0.9 }),
    box(1.24, 0.3, 1.14, 0x2a3a5a, { y: 1.55, z: -0.9, glow: 0.6 }),
    cyl(0.05, 0.05, 2.0, 4, 0xdddddd, { y: 1.9, z: 0.4 }),
    ...[0xff3a3a, 0xffd23a, 0x3aa0ff, 0x3ad06a].map((c, i) => sphere(0.14, 5, 4, c, { y: 2.7 - i * 0.12, z: 0.4 - 0.5 * i, glow: 0.8 })),
    box(0.6, 0.35, 0.3, 0xff6a2a, { x: 0.3, y: 1.0, z: 0.9 }),
  ),
};

P.sailboat = {
  name: 'ヨット', kind: 'vehicle', move: 'sail', speed: 2,
  build: () => merge(
    slab([[-0.7, -1.9], [0.7, -1.9], [0.75, 0.6], [0, 2.2], [-0.75, 0.6]], 0.6, 0xffffff),
    box(1.4, 0.12, 3.6, 0xd8382c, { y: 0.2 }),
    cyl(0.05, 0.06, 4.6, 5, 0xdddddd, { y: 2.9 }),
    extrude([[0, 0], [1.8, 0], [0, 4.0]], 0.05, 0xfffcf0, { y: 0.9, z: 0.05, ry: -PI / 2, x: 0.05 }),
    extrude([[0, 0], [1.2, 0], [0, 3.2]], 0.05, 0x2a8ad8, { y: 1.0, z: 0.35, ry: PI / 2 + 0.1, x: 0 }),
  ),
};

P.dolphin = {
  name: 'イルカ', kind: 'animal', move: 'sail', speed: 3,
  build: () => {
    const G = 0x6a9ccf, parts = [];
    parts.push(sphere(0.6, 10, 7, G, { y: 1.2, sz: 2.4, rx: -0.35 }));
    parts.push(sphere(0.48, 8, 6, 0xe8f2fa, { y: 1.0, z: 0.25, sz: 2.0, rx: -0.35 }));
    parts.push(cone(0.18, 0.6, 5, G, { y: 1.75, z: 1.65, rx: PI / 2 - 0.35 }));
    parts.push(box(0.12, 0.6, 0.5, G, { y: 1.85, z: -0.1, rx: -0.4 }));
    parts.push(box(1.2, 0.08, 0.4, G, { y: 0.55, z: -1.45, rx: 0.5 }));
    parts.push(sphere(0.06, 4, 3, 0x111111, { x: 0.32, y: 1.55, z: 1.0 }), sphere(0.06, 4, 3, 0x111111, { x: -0.32, y: 1.55, z: 1.0 }));
    parts.push(cyl(0.6, 0.9, 0.12, 10, 0xd8f4ff, { y: 0.06 }));
    return merge(parts);
  },
};

P.sea_turtle = {
  name: 'ウミガメ', kind: 'animal', move: 'sail', speed: 0.8,
  build: () => {
    const G = 0x4a9a5a, S = 0x8a6a3a, parts = [sphere(1.2, 10, 6, S, { y: 0.45, sy: 0.38, sz: 1.2 })];
    parts.push(sphere(1.0, 8, 5, 0x6a5030, { y: 0.55, sy: 0.32, sz: 1.15 }));
    parts.push(sphere(0.38, 8, 6, G, { y: 0.45, z: 1.55 }), sphere(0.05, 4, 3, 0x111111, { x: 0.22, y: 0.58, z: 1.8 }), sphere(0.05, 4, 3, 0x111111, { x: -0.22, y: 0.58, z: 1.8 }));
    for (const s of [-1, 1]) {
      parts.push(box(1.3, 0.1, 0.5, G, { x: s * 1.3, y: 0.35, z: 0.6, ry: s * 0.5 }));
      parts.push(box(0.6, 0.1, 0.35, G, { x: s * 0.85, y: 0.3, z: -1.1, ry: -s * 0.5 }));
    }
    return merge(parts);
  },
};

// =====================================================================  ASIA
P.great_wall = {
  name: '万里の長城', kind: 'landmark',
  build: () => {
    const St = 0xbba57c, Tp = 0xa08a64, parts = [box(1.6, 1.8, 20, St, { y: 0.9 }), box(1.66, 0.1, 20, Tp, { y: 1.85 })];
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) parts.push(box(0.25, 0.4, 0.6, St, { x: s * 0.72, y: 2.05, z: -9.4 + i * 1.7 }));
    for (const z of [-7, 7]) {
      parts.push(box(2.6, 3.4, 2.6, shade(St, 0.95), { y: 1.7, z }));
      for (let k = 0; k < 4; k++) parts.push(group([box(0.5, 0.45, 0.25, St, { x: -0.9, y: 3.6, z: 1.2 }), box(0.5, 0.45, 0.25, St, { x: 0, y: 3.6, z: 1.2 }), box(0.5, 0.45, 0.25, St, { x: 0.9, y: 3.6, z: 1.2 })], { ry: (k * PI) / 2, z }));
      parts.push(box(2.64, 0.5, 0.5, 0x3a3028, { y: 2.4, z, glow: 0.3 }), box(0.5, 0.5, 2.64, 0x3a3028, { y: 2.4, z, glow: 0.3 }));
      parts.push(sq(0.6, 1.0, 0.7, 0xb03a2a, { y: 4.2, z }));
    }
    parts.push(box(4, 0.4, 20, 0x7aa850, { y: 0.0 }));
    return merge(parts);
  },
};

P.taj_mahal = {
  name: 'タージ・マハル', kind: 'landmark',
  build: () => {
    const W = 0xf8f6f0, Sh = 0xe8e2d6, Rc = 0xcfc4b2, parts = [];
    parts.push(box(15, 0.6, 22, 0x6cbf4a, { y: 0.3, z: 3.5 }));
    parts.push(box(1.6, 0.12, 8.5, 0x55b0e8, { y: 0.66, z: 10 }));
    parts.push(box(13, 0.8, 13, Sh, { y: 1.0 }));
    parts.push(cyl(4.0, 4.0, 4.6, 8, W, { y: 3.7, ry: PI / 8 }));
    for (let k = 0; k < 4; k++) {
      parts.push(group([box(2.4, 3.6, 0.2, Rc, { y: 3.4, z: 3.72 }), cone(1.2, 0.8, 4, Rc, { y: 5.6, z: 3.62, sz: 0.15, ry: PI / 4 }), box(1.4, 2.2, 0.1, 0x9a8a78, { y: 2.9, z: 3.8, glow: 0.35 })], { ry: (k * PI) / 2 }));
      const a = (k / 4) * TAU + PI / 4;
      parts.push(cyl(0.65, 0.65, 0.7, 8, W, { x: Math.sin(a) * 3.1, z: Math.cos(a) * 3.1, y: 6.35 }), lathe(onionPts(0.6, 1.2), 10, W, { x: Math.sin(a) * 3.1, z: Math.cos(a) * 3.1, y: 6.7 }));
      const mx = Math.sin(a) * 8.4, mz = Math.cos(a) * 8.4;
      parts.push(cyl(0.32, 0.42, 8.4, 8, W, { x: mx, z: mz, y: 0.6 + 4.2 }));
      for (const hy of [3.4, 6.0, 8.6]) parts.push(cyl(0.55, 0.55, 0.15, 8, Sh, { x: mx, z: mz, y: hy }));
      parts.push(lathe(onionPts(0.48, 1.0), 8, W, { x: mx, z: mz, y: 9.0 }));
    }
    parts.push(cyl(2.0, 2.0, 1.1, 12, W, { y: 6.55 }));
    parts.push(lathe(onionPts(2.15, 4.4), 14, W, { y: 7.1 }));
    parts.push(cyl(0.05, 0.1, 1.2, 6, GOLD, { y: 12.0 }));
    return merge(parts);
  },
};

P.petronas = {
  name: 'ツインタワー', kind: 'landmark',
  build: () => {
    const S = 0xc9d3dc, parts = [];
    for (const x of [-2.8, 2.8]) {
      let y = 0;
      [[2.0, 6], [1.8, 4], [1.55, 3], [1.3, 2.5], [1.05, 2], [0.8, 1.5], [0.55, 1.2]].forEach(([r, h]) => {
        parts.push(cyl(r * 0.94, r, h, 16, S, { x, y: y + h / 2 }));
        for (let k = 0; k < Math.floor(h / 1.0); k++) parts.push(cyl(r * 1.01, r * 1.01, 0.3, 16, 0x9fd0ff, { x, y: y + 0.55 + k * 1.0, glow: 0.7 }));
        y += h;
      });
      parts.push(cyl(0.06, 0.3, 4.2, 6, S, { x, y: y + 2.1 }), sphere(0.22, 6, 4, S, { x, y: y + 0.9 }));
    }
    parts.push(box(3.2, 0.55, 0.7, 0x9aa8b4, { y: 9.5 }), box(3.22, 0.2, 0.72, 0x9fd0ff, { y: 9.55, glow: 0.8 }));
    for (const s of [-1, 1]) parts.push(beam([s * 0.9, 9.3, 0], [s * 1.6, 6.2, 0], 0.18, 0x9aa8b4));
    return merge(parts);
  },
};

P.temple_thai = {
  name: '黄金の寺院', kind: 'landmark',
  build: () => {
    const G = 0xf5c43a, G2 = 0xe0a226, Wt = 0xf7f3ea, parts = [];
    const chedi = (x, z, s) => [
      sq(2.6 * s, 2.8 * s, 0.7 * s, Wt, { x, z, y: 0.35 * s }),
      sq(2.0 * s, 2.2 * s, 0.6 * s, Wt, { x, z, y: 1.0 * s }),
      sq(1.6 * s, 1.75 * s, 0.5 * s, G2, { x, z, y: 1.55 * s }),
      lathe([[1.5 * s, 1.8 * s], [1.75 * s, 2.3 * s], [1.75 * s, 3.2 * s], [1.5 * s, 4.2 * s], [1.05 * s, 5.0 * s], [0.6 * s, 5.4 * s], [0.4 * s, 5.55 * s]], 12, G, { x, z }),
      sq(0.42 * s, 0.42 * s, 0.6 * s, G2, { x, z, y: 5.85 * s }),
      cone(0.42 * s, 4.2 * s, 10, G, { x, z, y: 6.15 * s + 2.1 * s }),
      ...[0, 1, 2, 3].map((k) => torus((0.36 - k * 0.07) * s, 0.06 * s, 4, 10, G2, { x, z, y: (6.5 + k * 0.55) * s, rx: PI / 2 })),
    ];
    parts.push(...chedi(0, 0, 1.4));
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) parts.push(...chedi(x, z, 0.38));
    parts.push(box(15, 0.2, 15, 0xe8dcc0, { y: 0.1 }));
    return merge(parts);
  },
};

P.panda = {
  name: 'パンダ', kind: 'animal',
  build: () => {
    const W = 0xf8f8f4, B = 0x24242a, parts = [];
    parts.push(sphere(1.3, 10, 8, W, { y: 1.4, sy: 1.1 }));
    parts.push(sphere(1.32, 10, 4, B, { y: 2.0, sy: 0.35 }));
    for (const s of [-1, 1]) {
      parts.push(capsule(0.38, 0.8, B, { x: s * 1.05, y: 1.6, z: 0.55, rx: -0.8, rz: s * 0.3 }));
      parts.push(capsule(0.42, 0.55, B, { x: s * 0.7, y: 0.45, z: 0.85, rx: PI / 2 }));
      parts.push(sphere(0.32, 8, 6, B, { x: s * 0.65, y: 3.95, z: 0.1 }));
      parts.push(sphere(0.25, 8, 6, B, { x: s * 0.35, y: 3.3, z: 0.98, sy: 1.3, rz: s * 0.5 }));
      parts.push(sphere(0.08, 5, 4, WHITE, { x: s * 0.33, y: 3.36, z: 1.18 }));
    }
    parts.push(sphere(0.95, 10, 8, W, { y: 3.2, z: 0.2 }));
    parts.push(sphere(0.13, 6, 4, B, { y: 3.05, z: 1.13 }));
    parts.push(cyl(0.12, 0.12, 3.2, 6, 0x6cbf3a, { x: 1.1, y: 2.0, z: 1.1, rz: -0.25 }));
    for (let i = 0; i < 3; i++) parts.push(box(0.6, 0.05, 0.22, 0x4caf3a, { x: 1.5 + i * 0.1, y: 2.8 + i * 0.4, z: 1.1, rz: 0.5 }));
    return merge(parts);
  },
};

P.elephant = {
  name: 'ゾウ', kind: 'animal',
  build: () => {
    const G = 0x9a9aa8, Gd = 0x80808e, T = 0xfffbe8, parts = [];
    parts.push(sphere(2.0, 10, 8, G, { y: 3.5, sz: 1.35, sy: 0.95 }));
    for (const x of [-0.95, 0.95]) for (const z of [-1.5, 1.5]) parts.push(cyl(0.55, 0.62, 2.4, 8, G, { x, z, y: 1.2 }));
    parts.push(sphere(1.3, 10, 8, G, { y: 4.4, z: 2.8 }));
    for (const s of [-1, 1]) {
      parts.push(sphere(1.1, 8, 6, Gd, { x: s * 1.3, y: 4.4, z: 2.3, sx: 0.2, sy: 1.1, ry: s * 0.4 }));
      parts.push(beam([s * 0.45, 3.7, 3.7], [s * 0.6, 3.0, 4.6], 0.2, T));
      parts.push(sphere(0.12, 5, 4, 0x1a1a1a, { x: s * 0.7, y: 4.8, z: 3.85 }));
    }
    const tr = [[0, 4.1, 3.9], [0, 3.1, 4.45], [0, 2.0, 4.6], [0, 1.2, 4.5], [0, 0.9, 4.15]];
    for (let i = 0; i < tr.length - 1; i++) parts.push(beam(tr[i], tr[i + 1], 0.6 - i * 0.08, G));
    parts.push(beam([0, 3.8, -2.6], [0, 2.4, -3.0], 0.15, G));
    parts.push(box(2.8, 0.18, 2.6, 0xd8382c, { y: 5.35, z: -0.2 }), box(2.9, 0.1, 2.7, GOLD, { y: 5.25, z: -0.2 }));
    return merge(parts);
  },
};

P.burj = {
  name: 'ブルジュ・ハリファ', kind: 'landmark',
  build: () => {
    const G = 0xb4c8d8, parts = [];
    const tierH = 2.4, N = 12;
    for (let k = 0; k < N; k++) {
      const y = k * tierH + tierH / 2, rc = 1.7 - k * 0.1;
      parts.push(cyl(rc, rc, tierH, 6, G, { y }));
      parts.push(cyl(rc * 1.02, rc * 1.02, 0.25, 6, 0xbfe4ff, { y: y + 0.6, glow: 0.8 }));
      for (let j = 0; j < 3; j++) {
        const L = 4.6 - k * 0.38 - j * 0.55;
        if (L < 0.6) continue;
        const a = (j / 3) * TAU;
        parts.push(box(1.4, tierH, L, shade(G, 0.95 + j * 0.03), { x: Math.sin(a) * (L / 2 + rc * 0.5), z: Math.cos(a) * (L / 2 + rc * 0.5), y, ry: a }));
        parts.push(box(1.44, 0.25, L, 0xbfe4ff, { x: Math.sin(a) * (L / 2 + rc * 0.5), z: Math.cos(a) * (L / 2 + rc * 0.5), y: y + 0.6, ry: a, glow: 0.8 }));
      }
    }
    parts.push(cyl(0.08, 0.5, 7.5, 6, G, { y: N * tierH + 3.75 }), sphere(0.15, 5, 4, 0xff5050, { y: N * tierH + 7.5, glow: 1 }));
    return merge(parts);
  },
};

P.camel = {
  name: 'ラクダ', kind: 'animal',
  build: () => {
    const C = 0xdcae66, Cd = 0xb88a48, parts = [];
    parts.push(sphere(1.3, 10, 7, C, { y: 3.6, sz: 1.5, sy: 0.75 }));
    parts.push(sphere(0.9, 8, 6, C, { y: 4.35, sz: 1.1 }));
    for (const x of [-0.45, 0.45]) for (const z of [-1.2, 1.2]) parts.push(cyl(0.2, 0.15, 3.1, 6, C, { x, z, y: 1.55 }), box(0.32, 0.12, 0.4, Cd, { x, z, y: 0.06 }));
    parts.push(beam([0, 3.8, 1.5], [0, 4.6, 2.5], 0.55, C), beam([0, 4.6, 2.5], [0, 5.4, 2.8], 0.45, C));
    parts.push(box(0.5, 0.5, 1.1, C, { y: 5.55, z: 3.2 }), box(0.42, 0.3, 0.3, Cd, { y: 5.4, z: 3.75 }));
    for (const s of [-1, 1]) parts.push(box(0.1, 0.25, 0.12, C, { x: s * 0.22, y: 5.9, z: 2.9 }), sphere(0.06, 4, 3, 0x111111, { x: s * 0.26, y: 5.7, z: 3.4 }));
    parts.push(beam([0, 3.7, -1.85], [0, 2.7, -2.1], 0.12, Cd));
    parts.push(box(1.9, 0.5, 1.0, 0xd8382c, { y: 3.95, z: -0.9 }), box(1.95, 0.12, 1.05, GOLD, { y: 3.7, z: -0.9 }));
    return merge(parts);
  },
};

P.himalaya = { name: 'ヒマラヤ山脈', kind: 'nature', build: () => merge(range(17, 120, 44, 40, 0x8a7f78, SNOW, 0.5, 0x8a9a6a, 18)) };

P.temple_heaven = {
  name: '天壇', kind: 'landmark',
  build: () => {
    const Wt = 0xf4f1ea, Rd = 0xc0392b, Bl = 0x2a5ab8, parts = [];
    [[7, 0.6], [6, 0.6], [5, 0.6]].forEach(([r, h], i) => parts.push(cyl(r, r, h, 16, Wt, { y: 0.3 + i * 0.6 }), torus(r, 0.08, 3, 16, 0xdedad0, { y: 0.6 + i * 0.6, rx: PI / 2 })));
    parts.push(cyl(3.0, 3.0, 2.2, 14, Rd, { y: 2.9 }), cyl(3.03, 3.03, 0.6, 14, WIN, { y: 2.6, glow: 0.7 }));
    parts.push(cyl(1.6, 4.0, 0.8, 16, Bl, { y: 4.4 }));
    parts.push(cyl(2.4, 2.4, 1.2, 14, Rd, { y: 5.4 }));
    parts.push(cyl(1.3, 3.2, 0.8, 16, Bl, { y: 6.4 }));
    parts.push(cyl(1.7, 1.7, 1.0, 14, Rd, { y: 7.3 }));
    parts.push(cone(2.4, 2.0, 16, Bl, { y: 8.8 }));
    parts.push(sphere(0.35, 8, 6, GOLD, { y: 10.0 }), cyl(0.08, 0.15, 0.6, 6, GOLD, { y: 10.5 }));
    return merge(parts);
  },
};

P.merlion = {
  name: 'マーライオン', kind: 'landmark',
  build: () => {
    const W = 0xf2f0ea, parts = [cyl(2.2, 2.4, 1.0, 10, 0xb8b0a0, { y: 0.5 })];
    parts.push(capsule(1.0, 2.8, W, { y: 2.8, rz: 0.12 }));
    for (let i = 0; i < 6; i++) parts.push(cyl(1.05 - i * 0.04, 1.05 - i * 0.04, 0.12, 10, 0xe0dcd2, { y: 1.6 + i * 0.4, x: 0.05 * i }));
    parts.push(sphere(1.2, 10, 8, W, { y: 5.3, z: 0.4 }));
    parts.push(ico(1.35, 0, 0xe8e0cc, { y: 5.4, z: -0.1 }));
    parts.push(box(0.9, 0.5, 0.9, W, { y: 5.0, z: 1.4 }));
    for (const s of [-1, 1]) parts.push(sphere(0.12, 5, 4, 0x222222, { x: s * 0.4, y: 5.6, z: 1.45 }));
    const sp = [[0, 5.0, 1.9], [0, 5.3, 3.4], [0, 4.6, 5.0], [0, 3.0, 6.2], [0, 1.0, 6.8]];
    for (let i = 0; i < sp.length - 1; i++) parts.push(beam(sp[i], sp[i + 1], 0.32, 0x9fdcff, { glow: 0.3 }));
    parts.push(cyl(1.4, 1.4, 0.15, 10, 0xbfe8ff, { y: 0.1, z: 6.8 }));
    parts.push(capsule(0.5, 1.6, W, { x: 0, y: 1.6, z: -1.6, rx: -0.8 }), box(1.6, 0.15, 0.7, W, { y: 2.6, z: -2.4, rx: 0.4 }));
    return merge(parts);
  },
};

P.taipei101 = {
  name: '台北101', kind: 'landmark',
  build: () => {
    const G = 0x5aa88a, parts = [sq(2.4, 2.8, 3.0, 0x7ab8a0, { y: 1.5 }), sphere(0.9, 8, 6, GOLD, { y: 3.4, z: 2.0, sz: 0.3 })];
    let y = 3.0;
    for (let i = 0; i < 8; i++) {
      parts.push(sq(1.9, 1.35, 2.0, G, { y: y + 1.0 }), sq(1.92, 1.92, 0.2, 0xbfffe8, { y: y + 1.85, glow: 0.8 }));
      y += 2.0;
    }
    parts.push(sq(0.9, 1.1, 1.6, G, { y: y + 0.8 }), sq(0.5, 0.7, 0.8, G, { y: y + 2.0 }), cyl(0.06, 0.2, 3.0, 6, 0xc8d0d8, { y: y + 3.9 }));
    return merge(parts);
  },
};

P.ger = {
  name: 'ゲル', kind: 'building',
  build: () => merge(
    cyl(2.4, 2.4, 1.8, 14, 0xfaf6ee, { y: 0.9 }),
    cyl(0.6, 2.55, 1.2, 14, 0xf0e8da, { y: 2.4 }),
    torus(2.42, 0.08, 3, 14, 0x2a6ae8, { y: 1.5, rx: PI / 2 }),
    torus(2.42, 0.08, 3, 14, 0xd8382c, { y: 0.4, rx: PI / 2 }),
    cyl(0.55, 0.55, 0.2, 10, 0xd8382c, { y: 3.05 }),
    box(0.9, 1.3, 0.15, 0xe8442c, { y: 0.65, z: 2.35 }),
    box(0.5, 0.3, 0.16, GOLD, { y: 1.0, z: 2.4 }),
    cyl(0.08, 0.08, 1.0, 4, 0x777777, { x: 0.8, y: 3.0, z: -0.6 }),
  ),
};

// =====================================================================  EUROPE
P.eiffel = {
  name: 'エッフェル塔', kind: 'landmark',
  build: () => {
    const C = 0x8c6a4e, C2 = 0x6e5440, parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(beam([sx * 7.0, 0, sz * 7.0], [sx * 4.6, 4.0, sz * 4.6], 1.9, C));
      parts.push(beam([sx * 4.6, 4.0, sz * 4.6], [sx * 3.7, 7.5, sz * 3.7], 1.6, C));
    }
    for (let k = 0; k < 4; k++) {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * PI; pts.push([Math.cos(a) * 4.9, 3.0 + Math.sin(a) * 3.4, 5.3]); }
      const seg = [];
      for (let i = 0; i < 6; i++) seg.push(beam(pts[i], pts[i + 1], 0.45, C2));
      parts.push(group(seg, { ry: (k * PI) / 2 }));
    }
    parts.push(box(10, 0.9, 10, C2, { y: 7.9 }), box(10.1, 0.3, 10.1, WIN, { y: 7.95, glow: 0.9 }));
    parts.push(sq(2.4, 3.7, 6.2, C, { y: 8.35 + 3.1 }));
    for (let k = 0; k < 4; k++) parts.push(group([beam([-3.3, 9, 3.35], [2.6, 13.9, 2.65], 0.25, C2), beam([3.3, 9, 3.35], [-2.6, 13.9, 2.65], 0.25, C2)], { ry: (k * PI) / 2 }));
    parts.push(box(5.6, 0.6, 5.6, C2, { y: 14.75 }), box(5.66, 0.22, 5.66, WIN, { y: 14.8, glow: 0.9 }));
    parts.push(sq(0.45, 1.9, 12.4, C, { y: 15.05 + 6.2 }));
    parts.push(box(1.2, 0.9, 1.2, C2, { y: 27.6 }), box(1.25, 0.3, 1.25, WIN, { y: 27.6, glow: 1 }));
    parts.push(cyl(0.06, 0.15, 2.4, 6, C, { y: 29.2 }));
    return merge(parts);
  },
};

P.big_ben = {
  name: 'ビッグ・ベン', kind: 'landmark',
  build: () => {
    const S = 0xd9c28e, S2 = 0xb9a06e, D = 0x3d4a5c, parts = [];
    parts.push(box(4, 16, 4, S, { y: 8 }));
    for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) parts.push(group([box(0.22, 15, 0.2, S2, { x: -1.2 + i * 0.8, y: 8.5, z: 2.05 })], { ry: (k * PI) / 2 }));
    parts.push(...winBands(4, 4, 0, 16, 2.6, { col: 0x5a4a30, glow: 0.4 }));
    parts.push(box(4.6, 4.2, 4.6, S, { y: 18.1 }));
    for (let k = 0; k < 4; k++) {
      parts.push(group([
        cyl(1.7, 1.7, 0.2, 16, 0xfff8e0, { rx: PI / 2, z: 2.32, y: 18.1, glow: 0.9 }),
        torus(1.7, 0.12, 3, 16, GOLD, { z: 2.4, y: 18.1 }),
        box(0.12, 1.2, 0.08, 0x1a1a1a, { z: 2.46, y: 18.6 }),
        box(0.9, 0.12, 0.08, 0x1a1a1a, { z: 2.46, y: 18.1, x: 0.4 }),
      ], { ry: (k * PI) / 2 }));
    }
    parts.push(box(3.6, 2.2, 3.6, S2, { y: 21.3 }), box(3.66, 1.1, 1.2, 0x2a2a30, { y: 21.4, glow: 0.4 }), box(1.2, 1.1, 3.66, 0x2a2a30, { y: 21.4, glow: 0.4 }));
    parts.push(sq(0.12, 2.0, 4.6, D, { y: 22.4 + 2.3 }));
    for (const sx of [-2.1, 2.1]) for (const sz of [-2.1, 2.1]) parts.push(cone(0.35, 1.6, 4, S2, { x: sx, z: sz, y: 21.0 }));
    parts.push(cyl(0.05, 0.08, 1.2, 4, GOLD, { y: 27.3 }));
    return merge(parts);
  },
};

P.pisa = {
  name: 'ピサの斜塔', kind: 'landmark',
  build: () => {
    const W = 0xf4efe2, Sh = 0xdcd3bf, parts = [cyl(2.2, 2.3, 2.6, 14, W, { y: 1.3 })];
    let y = 2.6;
    for (let t = 0; t < 6; t++) {
      const h = 1.9;
      parts.push(cyl(2.35, 2.35, 0.2, 14, Sh, { y: y + 0.1 }));
      parts.push(cyl(1.75, 1.75, h, 14, 0xb8ae98, { y: y + h / 2 }));
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; parts.push(cyl(0.12, 0.12, h - 0.2, 5, W, { x: Math.sin(a) * 2.1, z: Math.cos(a) * 2.1, y: y + h / 2 })); }
      parts.push(cyl(1.8, 1.8, 0.4, 14, WIN, { y: y + h / 2, glow: 0.5 }));
      y += h;
    }
    parts.push(cyl(2.35, 2.35, 0.25, 14, Sh, { y: y + 0.12 }));
    parts.push(cyl(1.5, 1.5, 1.7, 12, W, { y: y + 1.0 }), cyl(1.55, 1.55, 0.18, 12, Sh, { y: y + 1.9 }));
    parts.push(cyl(1.0, 1.4, 0.4, 12, Sh, { y: y + 2.15 }));
    return merge(group(parts, { rz: -0.13 }));
  },
};

P.colosseum = {
  name: 'コロッセオ', kind: 'landmark',
  build: () => {
    const St = 0xd8b98a, Dk = 0x7a5e40, In = 0xc7a477, parts = [];
    const a = 12.5, b = 10, N = 32, th = 2.5;
    parts.push(cyl(1, 1, 0.3, 20, 0xead6a8, { sx: a - 1.6, sz: b - 1.6, y: 0.15 }));
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * TAU, t1 = ((i + 1) / N) * TAU, tm = (t0 + t1) / 2;
      const x0 = Math.cos(t0) * a, z0 = Math.sin(t0) * b, x1 = Math.cos(t1) * a, z1 = Math.sin(t1) * b;
      const x = Math.cos(tm) * a, z = Math.sin(tm) * b, len = Math.hypot(x1 - x0, z1 - z0) * 1.04;
      const ang = Math.atan2(z1 - z0, x1 - x0);
      let nx = Math.cos(tm) / a, nz = Math.sin(tm) / b; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
      const tiers = (i > 4 && i < 20) ? 4 : (i === 4 || i === 20 ? 3 : 3);
      for (let k = 0; k < tiers; k++) {
        parts.push(box(len, th, 1.4, St, { x, z, y: k * th + th / 2, ry: -ang }));
        if (k < 3) parts.push(box(len * 0.55, th * 0.62, 0.2, Dk, { x: x + nx * 0.68, z: z + nz * 0.68, y: k * th + th * 0.42, ry: -ang, glow: 0.35 }));
      }
      parts.push(box(len * 0.85, 3.4, 2.6, In, { x: x * 0.82, z: z * 0.82, y: 1.7, ry: -ang }));
      parts.push(box(len * 0.75, 1.6, 2.2, shade(In, 0.92), { x: x * 0.68, z: z * 0.68, y: 0.8, ry: -ang }));
    }
    return merge(parts);
  },
};

P.windmill = {
  name: '風車', kind: 'building',
  build: () => {
    const Bd = 0x5d4a3a, Br = 0xa8442e, parts = [];
    parts.push(cyl(3.0, 3.4, 3.0, 8, Br, { y: 1.5 }), cyl(3.8, 3.8, 0.25, 8, 0xf4f0e6, { y: 3.1 }));
    parts.push(cyl(1.8, 2.8, 7.5, 8, Bd, { y: 3.2 + 3.75 }));
    parts.push(cyl(2.0, 2.0, 0.6, 8, 0xf4f0e6, { y: 11.0 }), sphere(2.0, 8, 5, 0x3a3a3a, { y: 11.3, sy: 0.9 }));
    parts.push(box(1.0, 1.7, 0.1, 0x3a7a3a, { y: 0.85, z: 3.25 }), box(0.7, 0.7, 0.1, WIN, { y: 5.5, z: 2.6, glow: 1 }), box(0.6, 0.6, 0.1, WIN, { y: 8.5, z: 2.15, glow: 1 }));
    parts.push(cyl(0.25, 0.25, 1.6, 6, 0x333333, { rx: PI / 2, y: 11.4, z: 2.0 }));
    const sails = [];
    for (let k = 0; k < 4; k++) sails.push(group([box(0.32, 7.2, 0.15, 0xf4f4f4, { y: 3.6 }), box(1.5, 5.6, 0.08, k % 2 ? 0xd8382c : 0xffffff, { x: 0.85, y: 4.2 }), ...repeat(5, (i) => box(1.5, 0.08, 0.12, 0x8a6a4a, { x: 0.85, y: 1.8 + i * 1.2 }))], { rz: (k * PI) / 2 + PI / 4 }));
    parts.push(group(sails, { y: 11.4, z: 2.8 }));
    return merge(parts);
  },
};

P.tulips = {
  name: 'チューリップ畑', kind: 'plant',
  build: () => {
    const parts = [box(10, 0.3, 8, 0x5aa83a, { y: 0.15 })];
    const cols = [0xe8302a, 0xffd23a, 0xff7ab0, 0x9a4ad8, 0xffffff, 0xff8a1a];
    for (let row = 0; row < 6; row++) for (let i = 0; i < 8; i++) {
      const x = -4.3 + i * 1.23, z = -3.3 + row * 1.32;
      parts.push(cyl(0.05, 0.05, 0.9, 3, 0x3a8a2a, { x, z, y: 0.75 }), cyl(0.28, 0.16, 0.5, 5, cols[row], { x, z, y: 1.35 }));
    }
    return merge(parts);
  },
};

P.onion_dome = {
  name: '玉ねぎ屋根の宮殿', kind: 'landmark',
  build: () => {
    const Bk = 0xc0452f, Wt = 0xf3ede0, parts = [box(14, 3, 14, Bk, { y: 1.5 }), box(14.1, 0.4, 14.1, Wt, { y: 3.0 })];
    parts.push(...winBands(14, 14, 0, 3, 1.4, { glow: 0.8 }));
    parts.push(cyl(2.0, 2.4, 8, 8, Bk, { y: 7 }), cyl(2.05, 2.05, 0.4, 8, Wt, { y: 9 }), cone(2.0, 6.5, 8, 0x3aa86a, { y: 11 + 3.25 }));
    parts.push(lathe(onionPts(0.7, 1.6), 10, GOLD, { y: 17.3 }), cyl(0.05, 0.05, 1.2, 4, GOLD, { y: 19.4 }));
    const domes = [[0x2e9b57, 0xf2c13a], [0x2f6fd8, 0xffffff], [0xf2c13a, 0xd8382c], [0xd8382c, 0x2e9b57], [0x1fa3a3, 0xf2c13a], [0xf08a24, 0x2f6fd8], [0x8e44ad, 0xf2c13a], [0x27ae60, 0xd8382c]];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU, R = k % 2 ? 5.3 : 4.6, x = Math.sin(a) * R, z = Math.cos(a) * R, h = k % 2 ? 4.5 : 6;
      parts.push(cyl(1.1, 1.25, h, 8, k % 2 ? 0xd8a040 : Bk, { x, z, y: 3 + h / 2 }), cyl(1.15, 1.15, 0.3, 8, Wt, { x, z, y: 3 + h - 0.3 }));
      const [c1, c2] = domes[k], op = onionPts(1.45, 3.0);
      parts.push(lathe(op.slice(0, 4), 10, c1, { x, z, y: 3 + h }), lathe(op.slice(3), 10, c2, { x, z, y: 3 + h }));
      parts.push(torus(1.5, 0.12, 3, 12, c2, { x, z, y: 3 + h + 0.9, rx: PI / 2 }));
      parts.push(cyl(0.05, 0.05, 1.0, 4, GOLD, { x, z, y: 3 + h + 3.4 }));
    }
    return merge(parts);
  },
};

P.castle = {
  name: 'お城', kind: 'landmark',
  build: () => {
    const W = 0xf4f1ea, Bl = 0x3a6fc4, Gr = 0x6a9a4a, parts = [];
    parts.push(cyl(10, 12, 3, 9, Gr, { y: 1.5 }), cyl(10.05, 10.05, 0.3, 9, 0x8a8478, { y: 3.0 }));
    parts.push(box(11, 7, 4.5, W, { y: 3 + 3.5, z: 0.5 }), extrude([[-5.5, 0], [5.5, 0], [0, 3]], 4.4, Bl, { y: 10, z: 0.5 }));
    parts.push(...winBands(11, 4.5, 3, 10, 1.7, { z: 0.5 }));
    const tower = (x, z, r, h) => [
      cyl(r, r, h, 10, W, { x, z, y: 3 + h / 2 }),
      cone(r * 1.3, r * 3.0, 10, Bl, { x, z, y: 3 + h + r * 1.5 }),
      ...repeat(Math.floor(h / 2.2), (i) => box(r * 0.5, 0.7, 0.1, WIN, { x, z: z + r, y: 4.5 + i * 2.2, glow: 1 })),
    ];
    parts.push(...tower(4.0, -2.2, 1.7, 15), ...tower(-5.6, 2.0, 1.4, 10), ...tower(5.8, 2.6, 1.0, 9), ...tower(-2.0, -2.6, 1.1, 12), ...tower(0, 3.2, 0.7, 9));
    parts.push(box(0.06, 1.2, 1.6, 0xd8382c, { x: 4.0, y: 3 + 15 + 1.7 * 3 + 0.8, z: 0.8 }), cyl(0.05, 0.05, 2.0, 4, 0x555555, { x: 4.0, y: 3 + 15 + 1.7 * 3 + 0.6 }));
    parts.push(box(2.0, 2.4, 0.2, 0x6a4a30, { y: 4.2, z: 2.8 }));
    return merge(parts);
  },
};

P.alps = { name: 'アルプスの山', kind: 'nature', build: () => {
  const parts = range(23, 100, 40, 32, 0x7a7f8a, SNOW, 0.45, 0x5aa84a, 15);
  parts.push(...snowPeak(7, 38, 4, 0x6e6a70, SNOW, 0.4, { x: 30, z: 6, ry: 0.4 }));
  return merge(parts);
} };

P.parthenon = {
  name: 'パルテノン神殿', kind: 'landmark',
  build: () => {
    const M = 0xf1ead8, M2 = 0xe2d8c0, parts = [];
    for (let i = 0; i < 3; i++) parts.push(box(22 - i * 1.2, 0.6, 12 - i * 1.2, i % 2 ? M2 : M, { y: 0.3 + i * 0.6 }));
    const y0 = 1.8, ch = 6.5;
    const col = (x, z) => [cyl(0.42, 0.5, ch, 8, M, { x, z, y: y0 + ch / 2 }), box(1.1, 0.25, 1.1, M2, { x, z, y: y0 + ch + 0.1 })];
    for (let i = 0; i < 8; i++) { const x = -8.4 + i * 2.4; parts.push(...col(x, 4.2), ...col(x, -4.2)); }
    for (let i = 1; i < 7; i++) { const x = -8.4 + i * 2.4; if (i % 2) parts.push(...col(x, 0)); }
    for (const z of [-1.4, 1.4]) { parts.push(...col(-8.4, z * 2), ...col(8.4, z * 2)); }
    parts.push(box(19.4, 0.9, 9.6, M2, { y: y0 + ch + 0.65 }), box(19.6, 0.4, 9.8, M, { y: y0 + ch + 1.3 }));
    parts.push(group([extrude([[-4.9, 0], [4.9, 0], [0, 2.2]], 19.4, M, {})], { ry: PI / 2, y: y0 + ch + 1.5 }));
    parts.push(box(6, 5, 4, 0xd8c8a0, { y: y0 + 2.5, glow: 0.3 }));
    return merge(parts);
  },
};

P.stonehenge = {
  name: 'ストーンヘンジ', kind: 'landmark',
  build: () => {
    const S = 0x9a9a94, parts = [cyl(9, 9.3, 0.3, 16, 0x7ab84a, { y: 0.15 })];
    const r = rng(77), N = 15;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, x = Math.sin(a) * 6.5, z = Math.cos(a) * 6.5;
      if (i === 11) { parts.push(box(1.4, 0.9, 3.6, shade(S, 0.9), { x, z, y: 0.6, ry: a })); continue; }
      parts.push(box(1.5, 4.2, 0.9, shade(S, 0.9 + r() * 0.2), { x, z, y: 2.4, ry: a, rz: (r() - 0.5) * 0.08 }));
      if (i % 2 === 0 && i < 10) { const a2 = ((i + 0.5) / N) * TAU; parts.push(box(3.2, 0.7, 0.9, S, { x: Math.sin(a2) * 6.5, z: Math.cos(a2) * 6.5, y: 4.85, ry: a2 })); }
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI + PI * 0.75;
      parts.push(box(1.4, 5.5, 0.9, shade(S, 0.85), { x: Math.sin(a) * 3.2 - 0.4, z: Math.cos(a) * 3.2, y: 3.0, ry: a }));
    }
    return merge(parts);
  },
};

// =====================================================================  AFRICA
P.pyramid = {
  name: 'ピラミッド', kind: 'landmark',
  build: () => {
    const parts = [], N = 8, H = 19, A = 15;
    for (let i = 0; i < N; i++) {
      const y0 = (i / N) * H, y1 = ((i + 1) / N) * H;
      parts.push(sq(A * (1 - y1 / H) + 0.001, A * (1 - y0 / H), y1 - y0, i % 2 ? 0xd9b061 : 0xe6c172, { y: (y0 + y1) / 2 }));
    }
    parts.push(sq(0.001, A / N + 0.15, H / N + 0.2, 0xffd84a, { y: H - H / N / 2 + 0.05 }));
    parts.push(box(1.6, 1.4, 0.4, 0x5a4020, { y: 2.6, z: A * (1 - 2.6 / H) + 0.05, rx: 0.67, glow: 0.3 }));
    return merge(parts);
  },
};

P.sphinx = {
  name: 'スフィンクス', kind: 'landmark',
  build: () => {
    const S = 0xdcb37a, Sd = 0xc29a62, Bl = 0x2f5fa8, parts = [];
    parts.push(box(5.5, 4.2, 12, S, { y: 2.6, z: -3.5 }), sphere(3.0, 8, 6, S, { y: 2.6, z: -9, sx: 0.95, sy: 0.9 }));
    for (const s of [-1, 1]) parts.push(box(1.5, 1.4, 6.5, S, { x: s * 1.6, y: 0.7, z: 5.5 }), box(1.5, 0.3, 0.6, Sd, { x: s * 1.6, y: 0.5, z: 8.8 }));
    parts.push(box(4.6, 5.8, 3.4, S, { y: 3.8, z: 3.0 }));
    parts.push(box(4.3, 4.2, 2.6, GOLD, { y: 8.5, z: 3.0 }));
    for (let i = 0; i < 6; i++) parts.push(box(4.35, 0.25, 2.65, Bl, { y: 6.8 + i * 0.6, z: 3.0 }));
    for (const s of [-1, 1]) { parts.push(box(0.9, 3.8, 1.4, GOLD, { x: s * 1.9, y: 5.9, z: 4.4 })); for (let i = 0; i < 4; i++) parts.push(box(0.95, 0.22, 1.45, Bl, { x: s * 1.9, y: 4.6 + i * 0.75, z: 4.4 })); }
    parts.push(box(2.8, 3.0, 1.0, S, { y: 8.0, z: 4.6 }));
    for (const s of [-1, 1]) parts.push(box(0.6, 0.25, 0.1, 0x2a2018, { x: s * 0.65, y: 8.6, z: 5.12 }));
    parts.push(box(0.5, 0.9, 0.4, Sd, { y: 7.9, z: 5.2 }), box(0.9, 1.4, 0.4, 0x8a6a3a, { y: 6.0, z: 4.8 }));
    parts.push(beam([2.7, 0.6, -9], [3.2, 0.4, -1], 0.4, S));
    return merge(parts);
  },
};

P.giraffe = {
  name: 'キリン', kind: 'animal',
  build: () => {
    const Y = 0xf2c04a, Pt = 0xa85a24, parts = [];
    parts.push(box(2.4, 2.2, 4.6, Y, { y: 7.0 }));
    for (const x of [-0.8, 0.8]) for (const z of [-1.6, 1.6]) parts.push(cyl(0.25, 0.2, 6, 6, Y, { x, z, y: 3 }), box(0.45, 0.3, 0.45, 0x4a3020, { x, z, y: 0.15 }));
    parts.push(beam([0, 7.6, 1.6], [0, 13.2, 3.2], 0.9, Y));
    parts.push(box(0.95, 0.95, 2.0, Y, { y: 13.6, z: 3.9 }), box(0.7, 0.6, 0.4, 0xe0a840, { y: 13.4, z: 4.95 }));
    for (const s of [-1, 1]) {
      parts.push(cyl(0.08, 0.08, 0.7, 4, Pt, { x: s * 0.25, y: 14.4, z: 3.4 }), sphere(0.14, 5, 4, 0x4a3020, { x: s * 0.25, y: 14.8, z: 3.4 }));
      parts.push(box(0.5, 0.15, 0.2, Y, { x: s * 0.65, y: 14.0, z: 3.3, rz: s * 0.3 }));
      parts.push(sphere(0.1, 4, 3, 0x111111, { x: s * 0.48, y: 13.85, z: 4.3 }));
    }
    const r = rng(41);
    for (let i = 0; i < 14; i++) {
      const s = i % 2 ? 1 : -1;
      parts.push(box(0.05, 0.55 + r() * 0.3, 0.6 + r() * 0.4, Pt, { x: s * 1.22, y: 6.3 + r() * 1.4, z: -2 + r() * 4 }));
    }
    for (let i = 0; i < 7; i++) { const t = i / 7; parts.push(box(0.95, 0.4, 0.5, Pt, { y: 8.3 + t * 4.6, z: 1.85 + t * 1.25, rx: -0.28, sx: 1.0 })); }
    parts.push(beam([0, 8.2, 1.2], [0, 13.0, 2.6], 0.25, 0x8a4a1a));
    parts.push(beam([0, 7.5, -2.3], [0, 5.5, -2.6], 0.12, Y));
    return merge(parts);
  },
};

P.baobab = {
  name: 'バオバブ', kind: 'plant',
  build: () => {
    const T = 0x9a7a62, parts = [lathe([[2.2, 0], [2.8, 1], [3.0, 3], [2.7, 6], [2.0, 8.5], [1.2, 10], [0.9, 10.3]], 10, T)];
    const r = rng(12);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, L = 2.5 + r() * 1.5, ex = Math.sin(a) * L, ez = Math.cos(a) * L, ey = 11.3 + r() * 1.2;
      parts.push(beam([Math.sin(a) * 0.5, 10.1, Math.cos(a) * 0.5], [ex, ey, ez], 0.45, T));
      parts.push(ico(1.1 + r() * 0.5, 0, [0x6aa84f, 0x7ab84a][i % 2], { x: ex, y: ey + 0.4, z: ez, sy: 0.6 }));
    }
    return merge(parts);
  },
};

P.kilimanjaro = {
  name: 'キリマンジャロ', kind: 'nature',
  build: () => merge(
    lathe([[36, 0], [28, 4], [21, 9]], 14, 0x7aa84a),
    lathe([[21, 9], [14, 17], [9, 23]], 14, 0x8a6e52),
    lathe([[9.1, 23], [7, 25], [5.5, 25.6], [4.2, 25], [0.001, 24.8]], 14, SNOW),
    ...[0, 1, 2, 3, 4, 5].map((i) => ico(3.5 + (i % 2), 1, 0xffffff, { x: Math.sin(i * 1.1) * 23, z: Math.cos(i * 1.1) * 23, y: 11 + (i % 3), sy: 0.45 })),
  ),
};

P.zebra = {
  name: 'シマウマ', kind: 'animal',
  build: () => {
    const W = 0xfafafa, K = 0x1a1a1a, parts = [box(1.3, 1.4, 3.0, W, { y: 2.3 })];
    for (const x of [-0.42, 0.42]) for (const z of [-1.15, 1.15]) parts.push(cyl(0.16, 0.13, 1.7, 6, W, { x, z, y: 0.85 }), box(0.25, 0.2, 0.3, K, { x, z, y: 0.1 }), box(0.34, 0.12, 0.34, K, { x, z, y: 1.0 }));
    for (let i = 0; i < 7; i++) parts.push(box(1.34, 1.44, 0.16, K, { y: 2.3, z: -1.3 + i * 0.42, rx: 0.25 }));
    parts.push(beam([0, 2.6, 1.3], [0, 3.6, 2.0], 0.6, W), box(0.55, 0.6, 1.2, W, { y: 3.65, z: 2.4, rx: 0.4 }), box(0.5, 0.4, 0.3, K, { y: 3.35, z: 2.95 }));
    parts.push(beam([0, 3.0, 1.3], [0, 4.1, 2.0], 0.2, K));
    for (let i = 0; i < 3; i++) parts.push(box(0.62, 0.12, 0.62, K, { y: 2.9 + i * 0.25, z: 1.5 + i * 0.18, rx: 0.6 }));
    for (const s of [-1, 1]) parts.push(box(0.12, 0.4, 0.15, W, { x: s * 0.2, y: 4.1, z: 2.0 }));
    parts.push(beam([0, 2.8, -1.5], [0, 1.6, -1.8], 0.12, K));
    return merge(parts);
  },
};

P.lion = {
  name: 'ライオン', kind: 'animal',
  build: () => {
    const T = 0xe0a85a, M = 0xa85a24, parts = [sphere(1.0, 10, 7, T, { y: 1.9, sz: 1.8, sy: 0.85 })];
    for (const x of [-0.45, 0.45]) for (const z of [-1.2, 1.1]) parts.push(cyl(0.22, 0.2, 1.4, 6, T, { x, z, y: 0.7 }));
    parts.push(dodeca(1.15, M, { y: 2.7, z: 1.4 }), sphere(0.7, 8, 6, T, { y: 2.6, z: 2.05 }), box(0.45, 0.35, 0.3, 0xf2c890, { y: 2.35, z: 2.65 }), box(0.18, 0.12, 0.08, 0x3a2018, { y: 2.5, z: 2.82 }));
    for (const s of [-1, 1]) parts.push(sphere(0.08, 4, 3, 0x111111, { x: s * 0.28, y: 2.85, z: 2.6 }), sphere(0.2, 5, 4, T, { x: s * 0.5, y: 3.25, z: 1.95 }));
    parts.push(beam([0, 2.1, -1.7], [0, 1.0, -2.9], 0.12, T), sphere(0.22, 5, 4, M, { y: 0.9, z: -3.0 }));
    return merge(parts);
  },
};

P.acacia = {
  name: 'アカシアの木', kind: 'plant',
  build: () => {
    const T = 0x6b4a32, parts = [beam([0, 0, 0], [0.4, 4, 0.2], 0.5, T), beam([0.4, 4, 0.2], [2.4, 6.2, 0.8], 0.32, T), beam([0.4, 4, 0.2], [-2.0, 6.4, -0.6], 0.32, T), beam([0.4, 4, 0.2], [0.5, 6.6, -1.8], 0.28, T)];
    parts.push(cyl(5.0, 4.0, 0.9, 7, 0x6a9a3a, { y: 6.9, x: 0.2 }), cyl(3.6, 4.4, 0.6, 7, 0x7aaa44, { y: 7.55, x: 0.3, ry: 0.4 }));
    return merge(parts);
  },
};

// =====================================================================  AMERICAS
P.liberty = {
  name: '自由の女神', kind: 'landmark',
  build: () => {
    const Cu = 0x5fc0a0, Cd = 0x48a888, St = 0xc9b89a, St2 = 0xa89a80, parts = [];
    const star = []; for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU, r = i % 2 ? 4.0 : 6.0; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
    parts.push(slab(star, 1.5, 0xa59a86));
    parts.push(sq(2.9, 3.2, 6.5, St, { y: 1.5 + 3.25 }), box(6.8, 0.6, 6.8, St2, { y: 7.9 }), sq(2.3, 2.9, 1.6, St, { y: 9.0 }));
    parts.push(...winBands(5.6, 5.6, 2, 7, 1.6, { glow: 0.6 }));
    const y0 = 9.8;
    parts.push(lathe([[1.9, 0], [1.75, 2], [1.45, 5], [1.2, 7.5], [1.0, 9.2], [0.55, 10.2]].map(([r, y]) => [r, y + y0]), 12, Cu));
    parts.push(box(0.7, 2.2, 0.5, Cd, { x: -0.6, y: y0 + 3, z: 1.6, rz: 0.1 }));
    parts.push(sphere(0.75, 10, 7, Cu, { y: y0 + 10.9 }));
    parts.push(torus(0.68, 0.14, 3, 12, Cd, { y: y0 + 11.35, rx: PI / 2 }));
    for (let i = 0; i < 7; i++) { const a = -PI / 2 + ((i - 3) / 3) * 1.2; parts.push(group([cone(0.13, 1.1, 4, Cu, { y: 0.55 })], { y: y0 + 11.4, rx: Math.cos(a) * 0.9 * 0 + 0.0, rz: Math.sin(a + PI / 2) * 1.2, z: 0.1 })); }
    parts.push(beam([0.9, y0 + 9.6, 0], [1.4, y0 + 14.4, 0.3], 0.6, Cu));
    parts.push(cyl(0.3, 0.2, 1.1, 8, GOLD, { x: 1.45, y: y0 + 14.9, z: 0.3 }), cone(0.45, 1.3, 7, 0xffb020, { x: 1.45, y: y0 + 16.0, z: 0.3, glow: 1 }));
    parts.push(box(1.0, 1.9, 0.35, Cd, { x: -1.35, y: y0 + 7.3, z: 0.4, rz: 0.25 }));
    parts.push(beam([-0.9, y0 + 9.4, 0], [-1.3, y0 + 7.6, 0.3], 0.5, Cu));
    return merge(parts);
  },
};

P.golden_gate = {
  name: 'ゴールデンゲートブリッジ', kind: 'landmark',
  build: () => {
    const O = 0xd8492a, parts = [];
    parts.push(box(60, 0.8, 2.6, O, { y: 6 }), box(60, 0.1, 2.2, 0x5a5a60, { y: 6.45 }), box(60, 0.6, 2.4, 0x9a3420, { y: 5.4 }));
    for (const x of [-15, 15]) {
      for (const z of [-1.3, 1.3]) parts.push(box(0.9, 20, 0.9, O, { x, z, y: 10 }));
      for (const y of [8, 12, 15.5, 19.4]) parts.push(box(0.7, 0.8, 3.4, O, { x, y }));
      parts.push(box(3, 6, 4.5, 0xb0aaa0, { x, y: 2.5 }));
      parts.push(sphere(0.25, 5, 4, 0xff3030, { x, y: 20.3, glow: 1 }));
    }
    for (const x of [-30, 30]) parts.push(box(3, 6.5, 4, 0xb0aaa0, { x: x * 0.98, y: 3.25 }));
    const cable = (x) => Math.abs(x) <= 15 ? 7.0 + 12.4 * Math.pow(x / 15, 2) : 19.4 - 12.0 * ((Math.abs(x) - 15) / 15) ** 1.2;
    for (const z of [-1.3, 1.3]) {
      for (let i = 0; i < 24; i++) {
        const xa = -30 + (i * 60) / 24, xb = -30 + ((i + 1) * 60) / 24;
        parts.push(beam([xa, cable(xa) + 0.01, z], [xb, cable(xb) + 0.01, z], 0.28, O));
      }
      for (let x = -27.5; x < 28; x += 2.5) { if (Math.abs(Math.abs(x) - 15) < 0.5) continue; const top = cable(x); if (top > 6.9) parts.push(box(0.08, top - 6.4, 0.08, O, { x, z, y: (top + 6.4) / 2 })); }
    }
    return merge(parts);
  },
};

P.skyscraper_ny = {
  name: '摩天楼', kind: 'building', variants: [0, 1, 2],
  build: (v = 0) => {
    const parts = [];
    if (v === 0) { // Empire State style
      const C = 0xd8cfb8;
      parts.push(box(8, 6, 8, C, { y: 3 }), box(6, 18, 6, C, { y: 6 + 9 }), box(5, 4, 5, C, { y: 26 }), box(4, 3, 4, C, { y: 29.5 }), box(3, 2, 3, C, { y: 32 }));
      parts.push(...winBands(8, 8, 0, 6, 1.2), ...winBands(6, 6, 6, 24, 1.2), ...winBands(5, 5, 24, 28, 1.2));
      parts.push(cyl(0.6, 0.9, 3, 8, 0xc8d0d8, { y: 34.5 }), cyl(0.06, 0.2, 4, 6, 0xc8d0d8, { y: 38 }), sphere(0.2, 5, 4, 0xff4040, { y: 40, glow: 1 }));
    } else if (v === 1) { // Chrysler style
      const S = 0xd8dde2;
      parts.push(box(7, 6, 7, 0xc8c0b0, { y: 3 }), box(5.6, 20, 5.6, S, { y: 6 + 10 }));
      parts.push(...winBands(7, 7, 0, 6, 1.2), ...winBands(5.6, 5.6, 6, 26, 1.2));
      for (let i = 0; i < 6; i++) {
        const r = 2.9 - i * 0.42;
        parts.push(cyl(r * 0.88, r, 1.4, 8, i % 2 ? 0x8a949e : 0xeef2f5, { y: 26.7 + i * 1.4, ry: PI / 8 }));
        parts.push(cyl(r * 0.9, r * 0.98, 0.35, 8, WIN, { y: 26.5 + i * 1.4, ry: PI / 8, glow: 1 }));
      }
      parts.push(cyl(0.04, 0.35, 5, 6, 0xeef2f5, { y: 37 }));
    } else { // modern glass tower
      const G = 0x7fb2d8;
      parts.push(box(9, 4, 9, 0x9aa8b4, { y: 2 }), sq(2.4, 4.0, 30, G, { y: 4 + 15 }));
      for (let y = 5; y < 33; y += 1.5) { const a = 4.0 + ((2.4 - 4.0) * (y - 4)) / 30; parts.push(sq(a + 0.03, a + 0.03, 0.3, 0xcfe8ff, { y, glow: 0.8 })); }
      parts.push(cyl(0.08, 0.3, 6, 6, 0xe0e4e8, { y: 37 }));
    }
    return merge(parts);
  },
};

P.redeemer = {
  name: '救世主キリスト像', kind: 'landmark',
  build: () => {
    const Wt = 0xf0ede6, parts = [];
    parts.push(cone(14, 22, 7, 0x4f9a45, { y: 11 }), cone(5.2, 8.2, 7, 0x8a8478, { y: 22 - 4.1 + 4.1, ry: 0 }));
    for (let i = 0; i < 6; i++) parts.push(ico(2.2, 0, 0x3f8a3a, { x: Math.sin(i * 1.1) * 9, z: Math.cos(i * 1.1) * 9, y: 6.5 }));
    const st = [box(2.2, 1.2, 2.2, 0xd8d4cc, { y: 0.4 })];
    st.push(lathe([[0.9, 0], [0.75, 2.5], [0.62, 4.2], [0.55, 5.2]].map(([r, y]) => [r, y + 1.0]), 10, Wt, { glow: 0.3 }));
    st.push(box(8, 0.65, 0.6, Wt, { y: 5.8, glow: 0.3 }), box(1.4, 1.2, 0.8, Wt, { y: 5.6, glow: 0.3 }));
    st.push(sphere(0.5, 8, 6, Wt, { y: 6.8, glow: 0.3 }));
    parts.push(group(st, { y: 25.2, s: 1.6 }));
    return merge(parts);
  },
};

P.moai = {
  name: 'モアイ', kind: 'landmark',
  build: () => {
    const St = 0x857b6e, St2 = 0x6e655a, parts = [];
    parts.push(box(3.4, 0.8, 2.8, 0x8a8a80, { y: 0.4 }));
    parts.push(box(2.6, 3.0, 1.8, St, { y: 0.8 + 1.5 }));
    parts.push(box(2.4, 4.6, 2.0, St, { y: 3.8 + 2.3, z: 0.1 }));
    parts.push(box(2.5, 0.55, 0.7, St2, { y: 7.0, z: 0.95 }));
    parts.push(box(0.65, 2.1, 0.8, St, { y: 5.6, z: 1.25, rx: 0.12 }));
    parts.push(box(1.8, 0.6, 0.5, St2, { y: 4.4, z: 1.05 }), box(1.4, 0.15, 0.1, 0x4a4238, { y: 4.85, z: 1.3 }));
    for (const s of [-1, 1]) parts.push(box(0.3, 2.4, 0.7, St2, { x: s * 1.3, y: 6.0 }), box(0.6, 0.35, 0.12, 0x3a342c, { x: s * 0.62, y: 6.55, z: 1.11 }));
    parts.push(box(0.5, 2.0, 0.3, St2, { x: 1.35, y: 2.3, z: 0.4 }), box(0.5, 2.0, 0.3, St2, { x: -1.35, y: 2.3, z: 0.4 }));
    parts.push(cyl(1.0, 1.1, 1.1, 8, 0xa8503a, { y: 8.95 }));
    return merge(parts);
  },
};

P.cactus = {
  name: 'サボテン', kind: 'plant',
  build: () => {
    const G = 0x3fa04a, parts = [capsule(0.9, 8, G, { y: 4.9 })];
    parts.push(capsule(0.55, 1.6, G, { x: 1.3, y: 4.0, rz: PI / 2 }), capsule(0.55, 2.4, G, { x: 2.1, y: 5.4 }));
    parts.push(capsule(0.5, 1.4, G, { x: -1.2, y: 5.6, rz: PI / 2 }), capsule(0.5, 2.0, G, { x: -1.9, y: 6.8 }));
    for (let i = 0; i < 6; i++) parts.push(box(0.08, 7.5, 0.08, 0x2f8a3a, { x: Math.sin(i) * 0.9, z: Math.cos(i) * 0.9, y: 4.8 }));
    parts.push(ico(0.35, 0, 0xff6aa0, { y: 9.9 }), ico(0.25, 0, 0xffd23a, { x: 2.1, y: 7.25 }));
    parts.push(dodeca(0.7, 0xc8a070, { x: 1.8, y: 0.2, z: 1.2, sy: 0.5 }));
    return merge(parts);
  },
};

P.chichen_itza = {
  name: 'ピラミッド神殿', kind: 'landmark',
  build: () => {
    const St = 0xc8b58a, St2 = 0xb09d72, parts = [];
    const N = 9, h = 1.6;
    for (let i = 0; i < N; i++) { const a = 15 - i * 1.15; parts.push(sq(a - 0.35, a, h, i % 2 ? St2 : St, { y: i * h + h / 2 })); }
    const top = N * h, aTop = 15 - (N - 1) * 1.15 - 0.35;
    const L = Math.hypot(top, 15 - aTop), ang = Math.atan2(top, 15 - aTop);
    for (let k = 0; k < 4; k++) {
      parts.push(group([
        box(4, 0.7, L, 0xdccb9e, { y: top / 2, z: (15 + aTop) / 2, rx: ang }),
        box(0.5, 1.2, L, St2, { x: 2.2, y: top / 2 + 0.2, z: (15 + aTop) / 2, rx: ang }),
        box(0.5, 1.2, L, St2, { x: -2.2, y: top / 2 + 0.2, z: (15 + aTop) / 2, rx: ang }),
        box(1.0, 1.0, 1.4, 0x6a9a5a, { x: 2.2, y: 0.5, z: 15.4 }), box(1.0, 1.0, 1.4, 0x6a9a5a, { x: -2.2, y: 0.5, z: 15.4 }),
      ], { ry: (k * PI) / 2 }));
    }
    parts.push(box(8, 4, 8, St, { y: top + 2 }), box(8.4, 0.8, 8.4, St2, { y: top + 4.2 }));
    for (let k = 0; k < 4; k++) parts.push(group([box(2.4, 2.6, 0.2, 0x3a2e20, { y: top + 1.4, z: 4.02, glow: 0.4 })], { ry: (k * PI) / 2 }));
    return merge(parts);
  },
};

P.grand_canyon = {
  name: 'グランドキャニオン', kind: 'nature',
  build: () => {
    const cols = [0xb5442a, 0xd9643a, 0xf2a65a, 0xe07b39, 0xc8552a, 0xf0c27b];
    const parts = [box(12, 0.4, 60, 0x3aa0d8, { y: 0.2 })];
    const r = rng(55);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        for (let c = 0; c < 6; c++) {
          const inset = i * 1.3 + r() * 1.6;
          const w = 54 - inset;
          parts.push(box(w, 3.3, 10.2, cols[i], { x: side * (6 + inset + w / 2), y: i * 3.3 + 1.65, z: -25 + c * 10 }));
        }
      }
      parts.push(box(40, 0.4, 60, 0x9aa860, { x: side * 40, y: 20 }));
      for (let i = 0; i < 6; i++) parts.push(cone(0.8, 1.6, 5, 0x5a8a3a, { x: side * (28 + r() * 22), y: 21, z: (r() - 0.5) * 50 }));
    }
    for (const [x, z, h] of [[-2, -14, 4], [3, 8, 3]]) for (let i = 0; i < h; i++) parts.push(box(4.5 - i * 0.7, 3.3, 5 - i * 0.6, cols[i], { x, z, y: i * 3.3 + 1.65 }));
    return merge(parts);
  },
};

P.rockies = { name: 'ロッキー山脈', kind: 'nature', build: () => {
  const parts = range(41, 130, 45, 36, 0x7a6e66, SNOW, 0.35, 0x3f7a4a, 12);
  const r = rng(3); for (let i = 0; i < 16; i++) parts.push(...conifer((r() - 0.5) * 120, (r() - 0.5) * 40, 2.5 + r() * 2, 0x2e6b3e));
  return merge(parts);
} };

P.andes = { name: 'アンデス山脈', kind: 'nature', build: () => merge(range(61, 140, 34, 42, 0x8a6e58, SNOW, 0.4, 0x9aa060, 13)) };

P.totem = {
  name: 'トーテムポール', kind: 'thing',
  build: () => {
    const cols = [0xd8382c, 0x2a6ae8, 0x2fa05a, 0xf2c13a], parts = [];
    for (let i = 0; i < 4; i++) {
      const y = i * 2.0 + 1.0;
      parts.push(cyl(0.9, 0.95, 2.0, 8, 0x8a5a3a, { y }), box(1.0, 0.4, 0.3, cols[i], { y: y + 0.4, z: 0.8 }), box(0.4, 0.5, 0.4, cols[(i + 1) % 4], { y: y - 0.2, z: 0.9 }));
      for (const s of [-1, 1]) parts.push(sphere(0.2, 5, 4, WHITE, { x: s * 0.35, y: y + 0.4, z: 0.95 }));
    }
    parts.push(box(5.0, 0.4, 1.2, cols[1], { y: 8.5, z: 0.2 }), box(1.0, 1.0, 1.2, cols[0], { y: 8.8, z: 0.6 }), cone(0.4, 1.0, 4, GOLD, { y: 8.8, z: 1.5, rx: PI / 2 }));
    return merge(parts);
  },
};

P.llama = {
  name: 'リャマ', kind: 'animal',
  build: () => {
    const W = 0xf4ecdc, parts = [ico(1.0, 1, W, { y: 2.0, sz: 1.5, sy: 0.85 })];
    for (const x of [-0.4, 0.4]) for (const z of [-0.9, 0.9]) parts.push(cyl(0.14, 0.12, 1.5, 5, W, { x, z, y: 0.75 }));
    parts.push(cyl(0.3, 0.38, 1.8, 6, W, { y: 3.2, z: 1.2 }), box(0.5, 0.55, 0.9, W, { y: 4.2, z: 1.45 }), box(0.3, 0.25, 0.2, 0x8a6a5a, { y: 4.1, z: 1.95 }));
    for (const s of [-1, 1]) parts.push(box(0.1, 0.45, 0.12, W, { x: s * 0.2, y: 4.65, z: 1.3, rz: s * 0.2 }), sphere(0.06, 4, 3, 0x111111, { x: s * 0.26, y: 4.3, z: 1.75 }));
    parts.push(box(1.6, 0.5, 1.2, 0xd8382c, { y: 2.75 }), box(1.65, 0.12, 1.25, 0x2a6ae8, { y: 2.6 }), box(1.65, 0.12, 1.25, GOLD, { y: 2.9 }));
    return merge(parts);
  },
};

// =====================================================================  OCEANIA
P.opera_house = {
  name: 'オペラハウス', kind: 'landmark',
  build: () => {
    const Wt = 0xf8f6f0, Ln = 0xe2ddd2, parts = [box(24, 2.4, 14, 0xd8b090, { y: 1.2 }), box(10, 1.2, 4, 0xc8a080, { y: 0.6, z: 8.5 })];
    // a shell: a tall thin cone leaning forward (+z), half sunk into the podium
    const shell = (x, z, W, H, D, lean) => [
      cone(1, 1, 10, Wt, { x, z, y: 2.4 + H * 0.38, sx: W / 2, sz: D / 2, sy: H, rx: lean }),
      cone(1, 1, 10, Ln, { x, z: z + 0.05, y: 2.4 + H * 0.38 - 0.05, sx: W / 2 * 1.01, sz: D / 2 * 0.25, sy: H * 1.005, rx: lean }),
    ];
    const hall = (x, z0, list) => list.forEach(([W, H, D, lean], i) => {
      parts.push(...shell(x, z0 - i * 2.7, W, H, D, lean));
      if (lean > 0) parts.push(box(W * 0.55, H * 0.28, 0.2, 0xffc870, { x, z: z0 - i * 2.7 + D * 0.42, y: 2.4 + H * 0.14, glow: 0.8 }));
    });
    hall(-4.2, 3.5, [[6.4, 11, 6.0, 0.42], [5.6, 9.2, 5.2, 0.42], [4.6, 7.0, 4.2, 0.42], [3.6, 5.0, 3.2, -0.5]]);
    hall(4.6, 2.8, [[5.4, 9.0, 5.0, 0.42], [4.8, 7.6, 4.4, 0.42], [4.0, 5.8, 3.6, 0.42], [3.0, 4.0, 2.6, -0.5]]);
    parts.push(...shell(9.5, 6.0, 2.8, 4.0, 2.6, 0.42));
    return merge(parts);
  },
};

P.uluru = {
  name: 'ウルル', kind: 'nature',
  build: () => {
    const cols = [0xd2602a, 0xc4522a, 0xd86a34, 0xbf4e26], parts = [];
    const q = domePts(1, 8);
    for (let i = 0; i < 4; i++) parts.push(lathe(q.slice(i * 2, i * 2 + 3), 16, cols[i], { sx: 20, sy: 8, sz: 9 }));
    parts.push(cyl(23, 24, 0.3, 16, 0xe8a060, { sz: 0.5, y: 0.15 }));
    return merge(parts);
  },
};

P.kangaroo = {
  name: 'カンガルー', kind: 'animal',
  build: () => {
    const K = 0xc8814a, Kl = 0xe8c39a, parts = [];
    parts.push(sphere(1.1, 10, 8, K, { y: 2.4, sy: 1.4, rx: -0.3 }), sphere(0.85, 8, 6, Kl, { y: 2.2, z: 0.4, sy: 1.3, rx: -0.3 }));
    for (const s of [-1, 1]) {
      parts.push(sphere(0.6, 8, 6, K, { x: s * 0.6, y: 1.2, z: -0.1, sz: 1.4 }), box(0.32, 0.25, 1.7, K, { x: s * 0.55, y: 0.12, z: 0.4 }));
      parts.push(beam([s * 0.45, 3.0, 0.75], [s * 0.4, 2.4, 1.2], 0.18, K));
      parts.push(box(0.2, 0.85, 0.12, K, { x: s * 0.26, y: 4.7, z: 0.15, rz: s * 0.25 }));
      parts.push(sphere(0.07, 4, 3, 0x111111, { x: s * 0.24, y: 4.15, z: 0.85 }));
    }
    parts.push(beam([0, 1.6, -0.8], [0, 0.25, -3.0], 0.45, K));
    parts.push(sphere(0.55, 8, 6, K, { y: 4.0, z: 0.45, sz: 1.4 }), sphere(0.1, 4, 3, 0x2a1a10, { y: 3.95, z: 1.2 }));
    parts.push(sphere(0.3, 6, 5, K, { y: 2.45, z: 1.0 }), box(0.08, 0.3, 0.08, K, { x: 0.12, y: 2.8, z: 0.95 }));
    return merge(parts);
  },
};

P.koala = {
  name: 'コアラ', kind: 'animal',
  build: () => {
    const G = 0x9a9aa4, Gl = 0xdcdce2, K = 0x2a2a30, parts = [cyl(0.45, 0.55, 6.5, 8, 0xc8b8a0, { y: 3.25 })];
    for (let i = 0; i < 5; i++) parts.push(ico(0.9, 0, [0x6aa86a, 0x5a9a6a][i % 2], { x: Math.sin(i * 1.3) * 1.0, y: 6.4 + (i % 2) * 0.5, z: Math.cos(i * 1.3) * 1.0 }));
    parts.push(sphere(0.9, 10, 8, G, { y: 2.6, z: 0.85, sy: 1.2 }), sphere(0.6, 8, 6, Gl, { y: 2.4, z: 1.35, sy: 1.1 }));
    parts.push(sphere(0.75, 10, 8, G, { y: 3.85, z: 1.05 }));
    for (const s of [-1, 1]) {
      parts.push(sphere(0.45, 8, 6, G, { x: s * 0.72, y: 4.3, z: 0.9, sz: 0.6 }), sphere(0.3, 6, 5, Gl, { x: s * 0.74, y: 4.3, z: 1.05, sz: 0.4 }));
      parts.push(sphere(0.08, 4, 3, 0x111111, { x: s * 0.3, y: 4.0, z: 1.72 }));
      parts.push(capsule(0.2, 0.7, G, { x: s * 0.55, y: 3.2, z: 0.45, rx: PI / 2 - 0.3 }), capsule(0.22, 0.6, G, { x: s * 0.55, y: 1.9, z: 0.5, rx: PI / 2 }));
    }
    parts.push(sphere(0.22, 6, 5, K, { y: 3.7, z: 1.78, sy: 1.3 }));
    return merge(parts);
  },
};

P.coral = {
  name: 'サンゴ礁', kind: 'nature',
  build: () => {
    const r = rng(19), parts = [cyl(7, 7.5, 0.4, 12, 0x5fd8d0, { y: 0.2 }), cyl(5.5, 6, 0.3, 10, 0xf2e2a8, { y: 0.5 })];
    const cols = [0xff6a8a, 0xffa03a, 0xb06ae8, 0xffe03a, 0xff4a4a, 0x4ae8c8];
    for (let i = 0; i < 18; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 5, x = Math.cos(a) * d, z = Math.sin(a) * d, c = cols[i % cols.length];
      if (i % 3 === 0) parts.push(ico(0.6 + r() * 0.5, 0, c, { x, z, y: 0.9, sy: 0.7 }));
      else if (i % 3 === 1) { for (let k = 0; k < 3; k++) parts.push(beam([x, 0.6, z], [x + (r() - 0.5) * 1.6, 2.0 + r() * 1.4, z + (r() - 0.5) * 1.6], 0.25, c)); }
      else parts.push(cyl(0.3, 0.5, 1.6 + r(), 6, c, { x, z, y: 1.3 }));
    }
    parts.push(box(0.9, 0.5, 0.15, 0xff8a1a, { x: 2, y: 2.5, z: 1 }), box(0.9, 0.12, 0.17, WHITE, { x: 2, y: 2.5, z: 1 }), cone(0.3, 0.4, 3, 0xff8a1a, { x: 2.6, y: 2.5, z: 1, rz: PI / 2 }));
    return merge(parts);
  },
};

P.sheep = {
  name: 'ヒツジ', kind: 'animal',
  build: () => {
    const W = 0xfaf8f2, K = 0x2a2a2a, r = rng(3), parts = [];
    for (let i = 0; i < 7; i++) parts.push(ico(0.6, 1, W, { x: (r() - 0.5) * 0.9, y: 1.3 + (r() - 0.5) * 0.4, z: -0.7 + i * 0.25 }));
    for (const x of [-0.35, 0.35]) for (const z of [-0.55, 0.55]) parts.push(cyl(0.1, 0.09, 0.8, 5, K, { x, z, y: 0.4 }));
    parts.push(box(0.45, 0.5, 0.65, K, { y: 1.55, z: 1.05 }));
    for (const s of [-1, 1]) parts.push(box(0.3, 0.12, 0.15, K, { x: s * 0.33, y: 1.7, z: 0.95 }), sphere(0.05, 4, 3, WHITE, { x: s * 0.15, y: 1.65, z: 1.38 }));
    return merge(parts);
  },
};

// =====================================================================  SEA / AIR / POLES
P.whale = {
  name: 'クジラ', kind: 'animal', move: 'sail', speed: 1.5,
  build: () => {
    const B = 0x3a6fb0, Bl = 0xdfe8f0, parts = [];
    parts.push(sphere(2.5, 12, 8, B, { y: 2.3, sz: 2.6, sy: 0.85 }), sphere(2.3, 12, 8, Bl, { y: 1.8, z: 0.6, sz: 2.3, sy: 0.6 }));
    parts.push(cyl(0.6, 1.6, 2.6, 8, B, { rx: -PI / 2 + 0.15, y: 2.6, z: -6.6 }));
    for (const s of [-1, 1]) {
      parts.push(box(2.6, 0.3, 1.5, B, { x: s * 1.4, y: 2.9, z: -8.2, ry: s * 0.35, rx: 0.15 }));
      parts.push(box(2.2, 0.2, 1.0, B, { x: s * 2.6, y: 1.6, z: 2.4, rz: s * 0.45, ry: s * 0.3 }));
      parts.push(sphere(0.18, 5, 4, 0x111a28, { x: s * 2.05, y: 2.6, z: 4.4 }));
    }
    for (let i = 0; i < 5; i++) parts.push(box(0.2, 0.05, 4, 0xa8bccc, { x: -0.8 + i * 0.4, y: 1.25, z: 2.6 }));
    parts.push(cyl(0.15, 0.3, 2.2, 6, 0xbfe8ff, { y: 5.0, z: 2.5 }), ico(0.7, 0, 0xe8f8ff, { y: 6.4, z: 2.5 }));
    for (let i = 0; i < 4; i++) parts.push(ico(0.35, 0, 0xd8f4ff, { x: Math.sin(i * 1.6) * 1.0, y: 6.0, z: 2.5 + Math.cos(i * 1.6) * 1.0 }));
    return merge(parts);
  },
};

P.cruise_liner = {
  name: '客船', kind: 'vehicle', move: 'sail', speed: 2,
  build: () => {
    const hull = [[-1.8, -10], [1.8, -10], [1.8, 6], [0, 10.5], [-1.8, 6]], parts = [];
    parts.push(slab(hull, 1.2, 0x24406e), slab(hull, 1.0, 0xffffff, { y: 1.2 }), box(3.62, 0.15, 16, 0xd8382c, { y: 1.2, z: -2 }));
    [[3.3, 14, -1.5], [2.9, 11, -2.0], [2.4, 7.5, -2.5]].forEach(([w, l, z], i) => {
      const y = 2.2 + i * 0.95;
      parts.push(box(w, 0.95, l, 0xffffff, { y: y + 0.475, z }), box(w + 0.04, 0.3, l - 0.4, WIN, { y: y + 0.5, z, glow: 1 }));
    });
    parts.push(box(2.6, 0.9, 1.6, 0xffffff, { y: 5.5, z: 3.5 }), box(2.64, 0.3, 1.64, 0x2a4a7a, { y: 5.6, z: 3.5, glow: 0.8 }));
    parts.push(cyl(0.7, 0.9, 2.2, 8, 0xd8382c, { y: 6.4, z: -4, sz: 1.4 }), cyl(0.72, 0.72, 0.4, 8, 0x222222, { y: 7.4, z: -4, sz: 1.4 }));
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) parts.push(box(0.4, 0.4, 1.2, 0xff8a1a, { x: s * 1.75, y: 2.4, z: -7 + i * 2.6 }));
    parts.push(box(1.5, 0.08, 2.5, 0x4ab8e8, { y: 5.12, z: -1.5 }));
    return merge(parts);
  },
};

P.cargo_ship = {
  name: '貨物船', kind: 'vehicle', move: 'sail', speed: 1.8,
  build: () => {
    const hull = [[-2.2, -9], [2.2, -9], [2.2, 5.5], [0, 9], [-2.2, 5.5]], parts = [];
    parts.push(slab(hull, 1.3, 0xb83a2a), slab(hull, 1.1, 0x23365a, { y: 1.3 }));
    const cols = [0xe8442c, 0x2a8ad8, 0xf2c13a, 0x3ab85a, 0xff8a1a, 0x8a5ad8, 0x2ac8c8];
    const r = rng(8);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) {
      if (k === 1 && r() < 0.3) continue;
      parts.push(box(1.3, 1.0, 2.3, cols[(r() * cols.length) | 0], { x: -1.4 + j * 1.4, y: 2.9 + k * 1.02, z: -3.6 + i * 2.45 }));
    }
    parts.push(box(3.6, 2.6, 2.0, 0xffffff, { y: 3.7, z: -7.2 }), box(3.64, 0.4, 2.04, 0x2a4a7a, { y: 4.6, z: -7.2, glow: 0.8 }), box(4.4, 0.25, 1.2, 0xffffff, { y: 5.1, z: -6.8 }));
    parts.push(cyl(0.5, 0.6, 1.4, 8, 0xf2c13a, { y: 5.7, z: -8.2 }));
    return merge(parts);
  },
};

P.airplane = {
  name: '飛行機', kind: 'vehicle', move: 'fly', speed: 8,
  build: () => {
    const Wt = 0xf8f8fa, Bl = 0x2f6fd8, parts = [];
    parts.push(capsule(0.8, 9, Wt, { rx: PI / 2, y: 1.6 }));
    parts.push(box(1.64, 0.22, 8, Bl, { y: 1.35 }), box(1.62, 0.16, 7.6, 0x2a3a5a, { y: 1.95, glow: 0.8 }));
    parts.push(sphere(0.55, 8, 5, 0x1c2a44, { y: 2.0, z: 5.0, sz: 0.9, sy: 0.6, glow: 0.4 }));
    parts.push(slab([[-0.6, 1.5], [-6.5, -1.8], [-6.5, -2.8], [-0.6, -1.2], [0.6, -1.2], [6.5, -2.8], [6.5, -1.8], [0.6, 1.5]], 0.22, Wt, { y: 1.15 }));
    parts.push(slab([[-0.3, -3.8], [-2.6, -5.4], [-2.6, -6.0], [-0.3, -5.4], [0.3, -5.4], [2.6, -6.0], [2.6, -5.4], [0.3, -3.8]], 0.16, Wt, { y: 1.8 }));
    parts.push(group([extrude([[3.6, 2.0], [5.6, 2.0], [5.9, 4.6], [5.1, 4.6]], 0.2, Bl)], { ry: PI / 2 }));
    for (const s of [-1, 1]) parts.push(cyl(0.42, 0.42, 1.6, 8, 0xd0d4da, { rx: PI / 2, x: s * 2.6, y: 0.7, z: 0.4 }), cyl(0.3, 0.3, 0.05, 8, 0x333333, { rx: PI / 2, x: s * 2.6, y: 0.7, z: 1.22 }));
    for (const s of [-1, 1]) parts.push(sphere(0.12, 4, 3, s > 0 ? 0x30ff60 : 0xff3030, { x: s * 6.5, y: 1.25, z: -2.3, glow: 1 }));
    return merge(parts);
  },
};

P.iceberg = {
  name: '氷山', kind: 'nature',
  build: () => {
    const r = rng(29), parts = [cyl(11, 12, 0.8, 8, 0xd8f0ff, { y: 0.4 })];
    for (let i = 0; i < 9; i++) {
      const s = 2.5 + r() * 4, x = (r() - 0.5) * 14, z = (r() - 0.5) * 10;
      parts.push(dodeca(s, i % 3 ? 0xeef8ff : 0xc4e8fa, { x, z, y: s * 0.55 + (i === 0 ? 3 : 0), sy: 1.0 + r() * 0.8, ry: r() * TAU }));
    }
    parts.push(cone(4, 13, 5, 0xf4fbff, { y: 6.5, x: 2, ry: 0.3 }));
    return merge(parts);
  },
};

P.penguin = {
  name: 'ペンギン', kind: 'animal',
  build: () => {
    const K = 0x22252e, O = 0xffa020, parts = [];
    parts.push(capsule(0.9, 1.2, K, { y: 1.55 }), sphere(0.8, 10, 8, WHITE, { y: 1.45, z: 0.32, sy: 1.5, sx: 0.95 }));
    parts.push(sphere(0.62, 10, 8, K, { y: 3.0 }));
    for (const s of [-1, 1]) {
      parts.push(sphere(0.2, 6, 4, 0xffd040, { x: s * 0.45, y: 2.85, z: 0.25, sz: 0.5 }));
      parts.push(sphere(0.09, 5, 4, WHITE, { x: s * 0.25, y: 3.15, z: 0.52 }), sphere(0.05, 4, 3, 0x111111, { x: s * 0.25, y: 3.16, z: 0.6 }));
      parts.push(box(0.12, 1.3, 0.5, K, { x: s * 0.95, y: 1.7, z: 0, rz: s * 0.25 }));
      parts.push(box(0.35, 0.12, 0.55, O, { x: s * 0.32, y: 0.06, z: 0.3 }));
    }
    parts.push(cone(0.14, 0.55, 5, O, { y: 2.95, z: 0.78, rx: PI / 2 }));
    return merge(parts);
  },
};

P.polar_bear = {
  name: 'シロクマ', kind: 'animal',
  build: () => {
    const W = 0xf6f4ec, parts = [sphere(1.6, 10, 8, W, { y: 2.3, sz: 1.7, sy: 0.9 })];
    for (const x of [-0.75, 0.75]) for (const z of [-1.6, 1.5]) parts.push(cyl(0.5, 0.55, 1.6, 7, W, { x, z, y: 0.8 }));
    parts.push(sphere(0.95, 10, 8, W, { y: 2.9, z: 2.8 }), box(0.7, 0.55, 0.9, W, { y: 2.65, z: 3.6 }), sphere(0.16, 5, 4, 0x111111, { y: 2.8, z: 4.06 }));
    for (const s of [-1, 1]) parts.push(sphere(0.25, 6, 4, W, { x: s * 0.6, y: 3.7, z: 2.6 }), sphere(0.09, 4, 3, 0x111111, { x: s * 0.35, y: 3.15, z: 3.55 }));
    return merge(parts);
  },
};

P.island = {
  name: '南の島', kind: 'nature',
  build: () => {
    const parts = [cyl(8, 8.4, 0.3, 14, 0x6fe0d8, { y: 0.15 }), cyl(5.5, 6.8, 1.0, 12, 0xf3dd9a, { y: 0.7 }), sphere(3.6, 10, 5, 0x5cb85c, { y: 0.9, sy: 0.45, x: -0.8 })];
    parts.push(...palm(-1.0, -0.5, 1.4, 0.5), ...palm(1.5, 0.8, 1.2, 2.2), ...palm(0.2, 2.0, 1.0, 4.0));
    parts.push(box(1.0, 0.1, 0.5, 0xff6a3a, { x: 3.4, y: 1.25, z: 2.6, ry: 0.4 }), cone(0.7, 0.9, 6, 0xff5a8a, { x: 3.6, y: 2.6, z: 2.2 }), cyl(0.04, 0.04, 1.4, 3, 0xdddddd, { x: 3.6, y: 1.9, z: 2.2 }));
    return merge(parts);
  },
};

P.cloud = {
  name: '雲', kind: 'nature', move: 'fly', speed: 1,
  build: () => {
    const r = rng(61), parts = [];
    for (let i = 0; i < 13; i++) {
      const t = i / 12, x = (t - 0.5) * 30 + (r() - 0.5) * 3, s = 3 + Math.sin(t * PI) * 4.5 + r() * 1.5;
      parts.push(ico(s, 1, i % 3 ? WHITE : 0xf2f6fb, { x, z: (r() - 0.5) * 10, y: 1.2 + s * 0.55, sy: 0.85 }));
    }
    parts.push(cyl(16, 16, 1.4, 12, 0xe2eaf4, { y: 0.9, sz: 0.45 }));
    return merge(parts);
  },
};

P.volcano = {
  name: '火山', kind: 'nature',
  build: () => {
    const parts = [
      lathe([[20, 0], [16, 3]], 12, 0x5aa84a),
      lathe([[16, 3], [10, 9], [6, 14], [5, 14.6]], 12, 0x6e4a3a),
      lathe([[5, 14.6], [3.6, 13.2], [0.001, 13.0]], 12, 0x3a2a24),
      cyl(3.7, 3.7, 0.3, 12, 0xff5a1a, { y: 13.4, glow: 1 }),
    ];
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.1, p = [];
      for (let k = 0; k <= 4; k++) { const t = k / 4, rr = 5 + t * 12, y = 14.6 - t * 12.5; p.push([Math.sin(a + t * 0.3) * rr * 1.02, y + 0.25, Math.cos(a + t * 0.3) * rr * 1.02]); }
      for (let k = 0; k < 4; k++) parts.push(beam(p[k], p[k + 1], 0.9, k % 2 ? 0xff7a1a : 0xff4a1a, { glow: 1 }));
    }
    for (let i = 0; i < 5; i++) parts.push(ico(2 + i * 0.5, 0, i % 2 ? 0x8a8a90 : 0xa8a8b0, { x: i * 0.8, y: 16 + i * 1.8, z: -i * 0.5 }));
    return merge(parts);
  },
};

P.rocket = {
  name: 'ロケット', kind: 'vehicle',
  build: () => {
    const Wt = 0xf6f6f6, R = 0xd8382c, parts = [];
    parts.push(cyl(1.5, 1.5, 18, 12, Wt, { y: 3 + 9 }), cone(1.5, 5, 12, R, { y: 21 + 2.5 }));
    for (const y of [8, 16]) parts.push(cyl(1.52, 1.52, 0.6, 12, 0x222222, { y }));
    for (const s of [-1, 1]) parts.push(cyl(0.7, 0.7, 12, 10, Wt, { x: s * 2.2, y: 2.5 + 6 }), cone(0.7, 2.4, 10, R, { x: s * 2.2, y: 14.5 + 1.2 }), cyl(0.5, 0.75, 1.2, 8, 0x444444, { x: s * 2.2, y: 1.9 }));
    for (let k = 0; k < 4; k++) parts.push(group([box(0.2, 3, 1.8, R, { z: 1.9, y: 4.5 })], { ry: (k * PI) / 2 + PI / 4 }));
    parts.push(cyl(0.9, 1.3, 1.6, 10, 0x444444, { y: 2.2 }));
    parts.push(box(1.6, 26, 1.6, 0xd8442a, { x: -5.5, y: 13 }));
    for (let y = 2; y < 26; y += 3) parts.push(beam([-6.3, y, 0.8], [-4.7, y + 3, 0.8], 0.15, 0xffffff), beam([-6.3, y, -0.8], [-4.7, y + 3, -0.8], 0.15, 0xffffff));
    for (const y of [10, 18]) parts.push(box(3.6, 0.4, 0.6, 0x999999, { x: -3.2, y }));
    parts.push(box(16, 0.8, 16, 0x8a8a8a, { y: 0.4 }));
    parts.push(box(0.3, 1.2, 1.2, 0x2a5ad8, { x: 1.52, y: 11, glow: 0.2 }));
    return merge(parts);
  },
};

P.ice_sheet = {
  name: '氷床', kind: 'nature',
  build: () => {
    const r = rng(91), outline = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, rr = 0.8 + r() * 0.25; outline.push([Math.cos(a) * 75 * rr, Math.sin(a) * 50 * rr]); }
    const parts = [slab(outline, 5, 0xeaf6ff), slab(outline.map(([x, z]) => [x * 0.75, z * 0.75]), 3, 0xf8fcff, { y: 5 })];
    for (let i = 0; i < 6; i++) parts.push(box(0.8, 0.3, 30 + r() * 20, 0x9fd4f0, { x: (r() - 0.5) * 80, y: 8.05, z: (r() - 0.5) * 30, ry: r() * PI }));
    for (let i = 0; i < 7; i++) parts.push(dodeca(4 + r() * 5, 0xf4faff, { x: (r() - 0.5) * 90, z: (r() - 0.5) * 50, y: 7, sy: 0.6 }));
    parts.push(cone(7, 18, 5, 0xe8f4fc, { x: -30, y: 8 + 9, z: 10 }), cone(5, 12, 5, 0xe8f4fc, { x: -18, y: 8 + 6, z: 16 }));
    return merge(parts);
  },
};

P.balloon = {
  name: '気球', kind: 'vehicle', move: 'fly', speed: 1,
  build: () => {
    const cols = [0xe8302a, 0xffd23a, 0x2a8ad8, 0x3ab85a, 0xff8a1a, 0xffffff], parts = [];
    const prof = [[0.6, 3.0], [1.8, 3.6], [2.8, 4.8], [3.1, 6.2], [2.8, 7.6], [1.8, 8.6], [0.001, 9.0]];
    for (let k = 0; k < 6; k++) parts.push(group([lathe(prof, 2, cols[k])], { ry: (k / 6) * TAU }));
    for (let k = 0; k < 6; k++) parts.push(group([lathe(prof.map(([r, y]) => [r * 1.001, y]), 2, cols[(k + 3) % 6])], { ry: (k / 6) * TAU + TAU / 12 }));
    parts.push(box(1.0, 0.8, 1.0, 0x9a6a3a, { y: 0.4 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(beam([sx * 0.45, 0.8, sz * 0.45], [sx * 0.55, 3.1, sz * 0.55], 0.05, 0x5a4a3a));
    parts.push(cone(0.25, 0.6, 5, 0xffa020, { y: 1.6, glow: 1 }));
    return merge(parts);
  },
};

P.birds = {
  name: '渡り鳥', kind: 'animal', move: 'fly', speed: 4,
  build: () => {
    const parts = [];
    [[0, 0, 0], [-1.6, -0.2, -1.4], [1.6, -0.2, -1.4], [-3.2, -0.4, -2.8], [3.2, -0.4, -2.8], [-4.8, -0.6, -4.2], [4.8, -0.6, -4.2]].forEach(([x, y, z]) => {
      parts.push(cone(0.2, 1.1, 5, 0xffffff, { x, y: y + 2, z, rx: -PI / 2 }), cone(0.08, 0.3, 4, 0xffa020, { x, y: y + 2, z: z + 0.65, rx: PI / 2 }));
      for (const s of [-1, 1]) parts.push(box(0.9, 0.05, 0.35, 0xf0f0f0, { x: x + s * 0.5, y: y + 2.15, z, rz: s * 0.35 }), box(0.3, 0.05, 0.3, 0x333333, { x: x + s * 0.98, y: y + 2.32, z, rz: s * 0.35 }));
    });
    return merge(parts);
  },
};

P.lighthouse = {
  name: '灯台', kind: 'building',
  build: () => {
    const parts = [dodeca(2.2, 0x8a8478, { y: 0.6, sy: 0.5 })];
    for (let i = 0; i < 4; i++) parts.push(cyl(0.95 - (i + 1) * 0.08, 0.95 - i * 0.08, 1.4, 10, i % 2 ? 0xd8382c : 0xffffff, { y: 1.0 + i * 1.4 + 0.7 }));
    parts.push(cyl(0.75, 0.75, 0.15, 10, 0x333333, { y: 6.7 }), cyl(0.5, 0.5, 0.9, 8, 0xfff2a0, { y: 7.25, glow: 1 }), cone(0.6, 0.7, 8, 0xd8382c, { y: 8.05 }));
    parts.push(box(1.2, 1.0, 1.4, 0xffffff, { x: 1.4, y: 1.4 }), box(1.4, 0.2, 1.6, 0xd8382c, { x: 1.4, y: 2.0 }));
    return merge(parts);
  },
};

export default P;

// =====================================================================  MAP DATA  [lon, lat, …]
// ---- Japan & neighbours in detail (used by drawEarth, isLand and the hi-res drawRegion)
const HONSHU = [130.92, 33.95, 130.88, 34.12, 130.95, 34.32, 131.12, 34.42, 131.4, 34.43, 131.62, 34.6, 131.85, 34.7, 132.08, 34.9, 132.45, 35.1, 132.62, 35.3, 132.63, 35.43,
  132.85, 35.55, 133.08, 35.58, 133.32, 35.57, 133.24, 35.5, 133.4, 35.47, 133.85, 35.51, 134.23, 35.53, 134.55, 35.62, 134.85, 35.65, 135.08, 35.7, 135.22, 35.77, 135.32, 35.62,
  135.38, 35.5, 135.55, 35.55, 135.72, 35.52, 135.95, 35.6, 136.06, 35.66, 136.0, 35.95, 136.12, 36.22, 136.35, 36.36, 136.6, 36.6, 136.75, 36.88, 136.75, 37.1, 136.85, 37.3,
  137.05, 37.41, 137.35, 37.53, 137.27, 37.32, 137.05, 37.17, 136.96, 37.05, 137.02, 36.87, 137.2, 36.76, 137.42, 36.81, 137.6, 36.93, 137.86, 37.04, 138.15, 37.15, 138.5, 37.38,
  138.8, 37.7, 139.05, 37.95, 139.3, 38.1, 139.45, 38.3, 139.56, 38.56, 139.78, 38.92, 139.93, 39.2, 140.04, 39.5, 140.07, 39.74, 139.86, 39.84, 139.7, 39.95, 139.86, 40.0,
  140.0, 40.05, 140.0, 40.25, 139.93, 40.55, 139.85, 40.62, 140.05, 40.8, 140.25, 41.05, 140.35, 41.25, 140.58, 41.15, 140.66, 40.92, 140.76, 40.83, 140.9, 40.9, 141.12, 40.88,
  141.2, 41.08, 141.18, 41.28, 141.0, 41.17, 140.8, 41.13, 140.83, 41.42, 140.93, 41.54, 141.2, 41.47, 141.46, 41.43, 141.4, 41.0, 141.38, 40.68, 141.53, 40.53, 141.78, 40.2,
  141.95, 39.9, 142.07, 39.55, 141.88, 39.27, 141.7, 39.0, 141.57, 38.85, 141.55, 38.6, 141.5, 38.28, 141.3, 38.43, 141.0, 38.25, 140.95, 37.9, 141.05, 37.5, 140.9, 37.05,
  140.7, 36.65, 140.58, 36.3, 140.72, 35.95, 140.87, 35.72, 140.45, 35.45, 140.38, 35.15, 140.15, 35.02, 139.88, 34.9, 139.78, 35.0, 139.83, 35.18, 139.85, 35.35, 139.95, 35.48,
  140.1, 35.6, 139.95, 35.69, 139.8, 35.66, 139.76, 35.55, 139.68, 35.48, 139.65, 35.35, 139.74, 35.25, 139.63, 35.13, 139.58, 35.26, 139.47, 35.3, 139.2, 35.26, 139.13, 35.1,
  139.12, 34.9, 139.0, 34.68, 138.86, 34.6, 138.76, 34.72, 138.75, 34.95, 138.86, 35.1, 138.65, 35.11, 138.5, 35.02, 138.35, 34.85, 138.22, 34.6, 137.75, 34.65, 137.3, 34.63,
  137.02, 34.58, 137.15, 34.68, 137.33, 34.76, 137.2, 34.82, 137.05, 34.83, 136.98, 34.7, 136.85, 34.85, 136.83, 34.98, 136.88, 35.06, 136.65, 34.98, 136.52, 34.72, 136.72, 34.52,
  136.87, 34.47, 136.88, 34.29, 136.5, 34.2, 136.22, 34.07, 136.1, 33.88, 135.98, 33.68, 135.77, 33.44, 135.37, 33.68, 135.15, 33.88, 135.15, 34.22, 135.07, 34.28, 135.35, 34.45,
  135.45, 34.58, 135.42, 34.67, 135.2, 34.68, 135.0, 34.65, 134.7, 34.77, 134.4, 34.74, 134.0, 34.6, 133.8, 34.47, 133.6, 34.5, 133.4, 34.43, 133.18, 34.4, 132.9, 34.32,
  132.55, 34.22, 132.45, 34.35, 132.3, 34.28, 132.22, 34.17, 132.1, 33.95, 131.9, 33.95, 131.78, 34.04, 131.57, 34.02, 131.25, 33.95, 131.1, 33.98];
const KYUSHU = [130.95, 33.92, 131.0, 33.72, 131.2, 33.62, 131.52, 33.67, 131.7, 33.55, 131.6, 33.4, 131.5, 33.3, 131.63, 33.27, 131.9, 33.25, 131.9, 32.95, 131.7, 32.6,
  131.65, 32.4, 131.45, 31.92, 131.38, 31.6, 131.33, 31.37, 131.1, 31.46, 130.95, 31.3, 130.68, 31.0, 130.78, 31.35, 130.75, 31.7, 130.6, 31.62, 130.63, 31.25, 130.52, 31.17,
  130.3, 31.27, 130.27, 31.72, 130.2, 32.02, 130.4, 32.2, 130.6, 32.5, 130.62, 32.72, 130.45, 32.95, 130.4, 33.15, 130.25, 33.2, 130.1, 33.1, 130.05, 32.88, 130.25, 32.86,
  130.38, 32.75, 130.3, 32.6, 130.18, 32.6, 130.2, 32.75, 129.87, 32.75, 129.75, 32.58, 129.68, 32.85, 129.65, 33.0, 129.72, 33.17, 129.55, 33.35, 129.72, 33.38, 129.97, 33.47,
  130.2, 33.58, 130.4, 33.6, 130.55, 33.85, 130.7, 33.92];
const SHIKOKU = [134.05, 34.35, 134.3, 34.32, 134.6, 34.22, 134.6, 34.07, 134.75, 33.85, 134.42, 33.67, 134.17, 33.25, 133.9, 33.5, 133.55, 33.5, 133.28, 33.38, 133.05, 33.15,
  133.0, 32.72, 132.7, 32.92, 132.55, 33.22, 132.35, 33.32, 132.02, 33.34, 132.05, 33.38, 132.42, 33.47, 132.65, 33.75, 132.72, 33.87, 132.8, 34.02, 133.0, 34.08, 133.2, 33.93,
  133.32, 33.98, 133.55, 34.02, 133.65, 34.13, 133.8, 34.3, 133.88, 34.33];
const HOKKAIDO = [140.1, 41.42, 140.13, 41.87, 139.85, 42.45, 140.05, 42.7, 140.25, 42.8, 140.5, 42.98, 140.35, 43.37, 140.78, 43.2, 141.0, 43.2, 141.3, 43.25, 141.45, 43.4,
  141.45, 43.85, 141.63, 43.94, 141.7, 44.36, 141.75, 44.88, 141.67, 45.4, 141.94, 45.52, 142.58, 44.94, 142.98, 44.58, 143.35, 44.36, 143.8, 44.15, 144.27, 44.02, 144.67, 43.92,
  145.0, 44.12, 145.33, 44.35, 145.18, 44.02, 145.15, 43.66, 145.3, 43.56, 145.22, 43.42, 145.55, 43.34, 145.82, 43.38, 145.5, 43.2, 145.1, 43.07, 144.85, 43.03, 144.38, 42.98,
  144.07, 42.95, 143.65, 42.65, 143.33, 42.28, 143.25, 41.93, 142.77, 42.17, 142.37, 42.33, 141.95, 42.55, 141.6, 42.63, 141.35, 42.55, 140.97, 42.32, 140.85, 42.47, 140.7, 42.58,
  140.37, 42.52, 140.45, 42.3, 140.58, 42.1, 140.82, 42.05, 141.15, 41.8, 140.95, 41.73, 140.73, 41.77, 140.43, 41.68, 140.2, 41.4];
const OKINAWA = [127.66, 26.08, 127.8, 26.13, 127.86, 26.25, 127.97, 26.35, 127.86, 26.45, 128.03, 26.55, 128.25, 26.65, 128.33, 26.82, 128.26, 26.88, 128.1, 26.75,
  127.98, 26.72, 127.88, 26.7, 127.85, 26.6, 127.8, 26.45, 127.74, 26.4, 127.7, 26.3, 127.65, 26.2];
const SADO = [138.22, 38.32, 138.5, 38.33, 138.56, 38.1, 138.45, 37.98, 138.52, 37.84, 138.3, 37.8, 138.22, 37.85, 138.36, 37.96, 138.25, 38.05];
const AWAJI = [135.02, 34.6, 134.97, 34.45, 134.9, 34.33, 134.95, 34.27, 134.82, 34.2, 134.68, 34.22, 134.75, 34.35, 134.88, 34.5];
const TSUSHIMA = [129.3, 34.68, 129.48, 34.7, 129.4, 34.4, 129.3, 34.15, 129.2, 34.2, 129.3, 34.4];
const AMAKUSA = [130.0, 32.5, 130.25, 32.56, 130.45, 32.5, 130.3, 32.3, 130.12, 32.22, 129.98, 32.38];
const TANEGASHIMA = [130.95, 30.85, 131.08, 30.75, 130.98, 30.35, 130.86, 30.42];
const AMAMI = [129.3, 28.48, 129.72, 28.52, 129.42, 28.15, 129.15, 28.22];
const KUNASHIRI = [145.45, 43.78, 145.9, 44.15, 146.6, 44.48, 146.5, 44.3, 145.95, 43.92, 145.6, 43.7];
const ETOROFU = [146.85, 44.55, 147.6, 45.05, 148.4, 45.4, 148.9, 45.5, 148.7, 45.25, 147.95, 44.85, 147.2, 44.45];
const JEJU = [126.15, 33.3, 126.5, 33.55, 126.95, 33.5, 126.85, 33.27, 126.5, 33.2];
const SAKHALIN = [141.93, 45.92, 142.4, 46.55, 142.75, 46.65, 143.0, 46.3, 143.45, 46.05, 143.4, 46.55, 142.95, 47.1, 143.1, 47.7, 143.5, 49, 143, 52.5, 142.7, 54.3, 142.2, 54.3,
  142, 51, 141.8, 48, 142.05, 47.0, 141.85, 46.6];
const TAIWAN = [121.55, 25.3, 121.95, 25.0, 121.85, 24.5, 121.6, 24.0, 121.45, 23.3, 121.0, 22.5, 120.85, 21.9, 120.65, 22.3, 120.3, 22.55, 120.1, 23.0, 120.15, 23.6, 120.5, 24.3,
  120.95, 24.85, 121.15, 25.1];
// Tatar strait → Primorye → Korea → Liaodong → Bohai → Shandong → Yangtze → Fujian (spliced into ASIA)
const KOREA_CHINA = [140.5, 48.5, 139.3, 47.3, 138.5, 46.5, 137.7, 45.8, 136.8, 45.1, 135.8, 44.4, 135.0, 43.8, 134.0, 43.3, 133.15, 42.75, 132.85, 42.8, 132.35, 43.25, 132.0, 43.0,
  131.8, 43.32, 131.45, 43.0, 131.2, 42.6, 130.8, 42.6, 130.7, 42.3, 130.4, 42.25, 129.8, 41.9, 129.7, 41.4, 129.35, 40.9, 128.6, 40.3, 128.2, 40.0, 127.5, 39.75, 127.4, 39.25,
  127.6, 39.0, 128.35, 38.6, 128.6, 38.2, 128.95, 37.75, 129.2, 37.45, 129.42, 36.95, 129.45, 36.4, 129.55, 36.05, 129.45, 35.7, 129.35, 35.45, 129.1, 35.1, 128.6, 34.85,
  128.1, 34.85, 127.75, 34.72, 127.4, 34.5, 126.95, 34.4, 126.55, 34.3, 126.3, 34.6, 126.45, 35.05, 126.5, 35.5, 126.6, 35.95, 126.5, 36.35, 126.15, 36.75, 126.55, 37.05,
  126.6, 37.45, 126.15, 37.75, 125.6, 37.8, 125.15, 37.9, 124.75, 38.1, 125.1, 38.6, 125.35, 38.75, 125.1, 39.1, 125.25, 39.5, 124.7, 39.6, 124.3, 39.95, 123.5, 39.75,
  122.5, 39.35, 121.65, 38.85, 121.2, 38.75, 121.45, 39.2, 121.6, 39.5, 122.25, 40.5, 121.9, 40.9, 121.0, 40.85, 120.4, 40.2, 119.5, 39.8, 119.0, 39.2, 118.2, 39.1, 117.7, 38.9,
  117.6, 38.4, 118.5, 38.05, 119.0, 37.75, 118.95, 37.2, 119.6, 37.1, 120.3, 37.65, 120.75, 37.8, 121.4, 37.55, 122.0, 37.5, 122.6, 37.4, 122.45, 36.9, 121.6, 36.75, 120.75, 36.4,
  120.25, 36.0, 119.6, 35.55, 119.25, 34.9, 120.25, 34.3, 120.6, 33.4, 120.95, 32.6, 121.9, 31.75, 121.75, 31.45, 121.95, 31.05, 121.75, 30.85, 121.0, 30.65, 120.6, 30.4,
  121.25, 30.2, 121.85, 29.95, 121.95, 29.5, 121.5, 29.0, 121.6, 28.6, 121.1, 28.1, 120.65, 27.6, 120.25, 27.1, 119.65, 26.55, 119.65, 26.0, 119.4, 25.45, 118.9, 24.95,
  118.1, 24.5, 117.5, 23.9, 116.7, 23.25];
// lakes inside the detailed region
const BIWA = [136.02, 35.5, 136.2, 35.45, 136.25, 35.25, 136.1, 35.1, 135.92, 35.0, 135.88, 35.08, 136.0, 35.22, 135.95, 35.35];
const JP_LAKES = [BIWA, [140.25, 36.12, 140.48, 36.0, 140.42, 35.95, 140.2, 36.02], [140.0, 37.52, 140.12, 37.5, 140.1, 37.42, 139.98, 37.44],
  [141.27, 42.8, 141.4, 42.78, 141.37, 42.72, 141.28, 42.73], [140.8, 42.62, 140.9, 42.62, 140.88, 42.56, 140.8, 42.56]];
// small islands near Japan / Korea: [lon, lat, radius°]
const JP_ISLETS = [[129.72, 33.79, 0.08], [128.8, 32.7, 0.14], [129.05, 33.0, 0.11], [128.95, 32.85, 0.06], [130.53, 30.35, 0.17], [128.95, 27.8, 0.09], [128.6, 27.37, 0.06], [128.4, 27.04, 0.03],
  [125.3, 24.78, 0.09], [124.18, 24.42, 0.11], [123.82, 24.33, 0.14], [126.78, 26.35, 0.05], [127.3, 26.2, 0.04], [139.38, 34.73, 0.07], [139.27, 34.37, 0.04], [139.52, 34.08, 0.06],
  [139.78, 33.1, 0.07], [133.27, 36.25, 0.11], [133.05, 36.1, 0.08], [141.24, 45.18, 0.1], [141.03, 45.4, 0.05], [139.45, 42.15, 0.08], [146.75, 43.8, 0.08], [134.25, 34.5, 0.08],
  [133.0, 34.25, 0.05], [132.85, 34.18, 0.04], [133.15, 34.25, 0.04], [130.88, 37.5, 0.04], [142.2, 27.1, 0.06], [124.6, 37.9, 0.05], [127.8, 34.0, 0.05], [130.27, 31.6, 0.05],
  [129.48, 28.35, 0.04], [130.66, 31.58, 0.07], [140.0, 34.47, 0.025], [141.55, 38.33, 0.025]];
const NA = [-168, 65.6, -166, 68.5, -162, 70.2, -156.5, 71.3, -150, 70.5, -141, 69.7, -135, 69.2, -128, 70, -121, 69.5, -114, 68.3, -108, 68, -102, 67.8, -96, 68.3, -90, 68.6, -85, 69.5, -82, 68.3, -86.5, 66.5, -88.5, 64.5, -91, 62.6, -94.2, 60.5, -94.6, 58.8, -92.5, 57.1, -88.5, 56.4, -85, 55.3, -82.3, 55.1, -82, 53, -80.5, 51.3, -79, 52.2, -78.6, 54.5, -76.8, 56.3, -77.5, 58.5, -77.6, 60.5, -78.1, 62.3, -73.5, 62.4, -70, 61, -69.3, 59, -66.5, 58.5, -64.5, 60.3, -61.9, 57.5, -60.2, 55.2, -57.2, 52.5, -55.8, 51.6, -59.8, 50.2, -66, 50.2, -70, 47.5, -64.5, 48.8, -65, 47, -64, 46.1, -61, 45.4, -60.3, 46, -63.5, 44.5, -66, 43.8, -67.2, 44.7, -70, 43.7, -70.6, 42, -70, 41.7, -72, 41.1, -74, 40.6, -74.2, 39.5, -75.5, 38.5, -76.1, 37, -75.6, 35.3, -77.9, 33.9, -80.9, 32, -81.4, 30.5, -80.5, 28.5, -80.1, 26, -80.4, 25.2, -81.8, 26, -82.7, 28, -83, 29.5, -84.5, 30, -86, 30.4, -88, 30.4, -89.5, 29.2, -90.6, 29.2, -94, 29.6, -97.2, 27.7, -97.5, 25.8, -97.8, 22.5, -96.5, 19.5, -94.5, 18.2, -92, 18.6, -90.6, 19.5, -90.3, 21, -87, 21.5, -87.5, 19.5, -88.2, 16, -86, 15.9, -83.4, 15.2, -83.6, 11.5, -82, 9.2, -79.5, 9.6, -77.4, 8.6, -77.2, 7.6, -78.2, 7.3, -80, 7.3, -80.4, 8.3, -83, 8.3, -85.8, 10, -86, 11.5, -87.5, 13, -91, 14, -94, 16, -96.5, 15.7, -99.5, 16.8, -103.5, 18.5, -105.5, 20.5, -105.2, 22.5, -108, 25.5, -109.5, 26.5, -112.5, 29.5, -114.7, 31.7, -113.2, 29, -112, 27, -110.3, 24.2, -109.5, 23.1, -112, 24.8, -114.5, 27.8, -116, 30.5, -117.1, 32.5, -118.5, 34, -120.6, 34.6, -122.5, 37.5, -124, 40.4, -124.5, 43, -124, 46.3, -124.7, 48.4, -123, 49, -127.5, 50.7, -130, 54.5, -133, 57, -136, 58.5, -140, 59.8, -146, 60.8, -150, 59.4, -152, 60.5, -154, 58.8, -156.5, 57.4, -162, 55.4, -164.6, 54.5, -160, 56.6, -158, 58.7, -162, 59, -164.5, 60.5, -165.5, 62.5, -161, 64.3, -166.3, 64.5];
const GREENLAND = [-73, 78.2, -66, 81, -55, 82.5, -40, 83.5, -25, 83.2, -18, 81.6, -12, 81.5, -18, 77, -19, 74, -22, 71, -25, 69.5, -32, 68, -37, 65.6, -40.5, 64, -42.5, 61.5, -44, 60, -46, 60.8, -48.5, 61.5, -50.5, 64, -52, 66, -53.5, 68.5, -51, 69.5, -54.5, 70.5, -55, 72.5, -57, 74.5, -62, 76, -68, 76.5, -72, 77.5];
const BAFFIN = [-64.5, 62.5, -61.8, 66.6, -65.5, 68.3, -68, 70.2, -72, 71.5, -77, 72.8, -81, 73.7, -88, 73.4, -85.5, 71.5, -82, 70, -79, 68.3, -73.5, 67.6, -73, 66, -76.5, 64.5, -72, 63.3, -68.5, 62.7];
const VICTORIA = [-119, 71.5, -117, 73, -112, 73.3, -106, 73.2, -102, 72.5, -101, 70, -105, 68.9, -112, 69, -117.5, 69.3];
const BANKS = [-125.5, 72, -123, 74.4, -117.5, 74.2, -119.5, 71.8];
const ELLESMERE = [-90, 77, -80, 76.2, -74, 78.3, -62, 82, -70, 83, -85, 82.5, -92, 81, -90, 79];
const DEVON = [-92, 75, -80, 74.5, -80, 76.5, -91, 76.8];
const QE = [-118, 75.5, -104, 75.5, -98, 78, -107, 79, -116, 77.5];
const SOUTHAMPTON = [-87, 63.7, -80, 64, -81.5, 65.8, -86.5, 66];
const NEWFOUNDLAND = [-59.4, 47.6, -56, 47.6, -53, 46.6, -52.7, 48.4, -55, 49.9, -55.8, 51.6, -57.5, 50.7, -59, 48.6];
const VANCOUVER_I = [-128.5, 50.8, -125, 50, -123.3, 48.3, -125, 48.8];
const CUBA = [-85, 21.9, -82, 23.2, -77.5, 22.3, -74.1, 20.2, -77.5, 19.9, -81, 21.6, -84, 21.5];
const HISPANIOLA = [-74.5, 18.4, -72.8, 19.9, -68.4, 19, -68.4, 18.2, -71.5, 17.6];
const JAMAICA = [-78.4, 18.4, -76.2, 18.4, -76.2, 17.9, -77.5, 17.8];
const SA = [-77.4, 8.6, -76, 9.5, -75.5, 10.5, -74.2, 11.2, -72, 12.4, -71.3, 11, -70, 12.2, -68, 10.6, -64, 10.6, -62, 10.7, -61, 10, -60, 8.5, -57.5, 6.2, -54, 5.7, -51.5, 4.2, -50, 1.8, -50, 0, -48.5, -1, -44.5, -2.5, -41, -2.9, -38.5, -3.7, -35.3, -5.2, -34.8, -7.5, -35.3, -9.5, -37.5, -12, -39, -13.5, -39, -17.5, -40, -20.5, -41, -22, -43.2, -23, -45, -23.7, -48.5, -26.5, -48.7, -28.5, -50.5, -30.5, -53, -33.7, -54.5, -34.8, -56.5, -34.9, -58.4, -34.6, -57.3, -36, -56.8, -37, -58, -38.5, -62, -39, -62.3, -40.5, -65, -41, -64.5, -42.5, -65, -45, -67.5, -46.5, -65.8, -47.8, -68, -50.5, -69, -51.6, -68.4, -52.4, -66, -55, -68, -55.5, -71, -54.5, -74, -52.5, -75.5, -49, -74.5, -45, -73.7, -43, -73.8, -41, -73.6, -37.5, -72.5, -35, -71.6, -32, -71.5, -28, -70.6, -23.5, -70.3, -18.4, -72.5, -17, -76, -14, -77.3, -11.8, -78.9, -8.5, -81.2, -6, -81.3, -4.3, -80, -2.3, -80.9, -1, -80, 1, -78.8, 1.8, -77.5, 4, -77.4, 6.5, -77.9, 7.2];
const FALKLANDS = [-61.3, -51.3, -57.8, -51.4, -58.5, -52.3, -60.5, -52.2];
const EUROPE = [-5.6, 36, -2, 36.7, 0, 38.7, -0.3, 39.5, 0.9, 41, 3.2, 42, 3, 43.3, 4.8, 43.4, 7, 43.6, 8.8, 44.4, 10.3, 43, 12, 41.7, 14, 40.8, 15.7, 40, 16, 38, 16.6, 38.6, 17, 39, 18.5, 40.1, 17, 41, 16, 41.9, 14, 42.5, 12.4, 44.2, 12.3, 45.4, 13.7, 45.7, 14.5, 45.2, 16, 43.5, 18.5, 42.4, 19.5, 41.8, 19.4, 40.3, 20.2, 39.6, 21.1, 37.8, 21.7, 36.8, 22.6, 36.4, 23.2, 37.4, 24, 37.8, 22.9, 38.9, 23, 40.3, 24.5, 40.9, 26, 40.8, 26.4, 40.2, 27.5, 40.9, 29, 41.1, 28, 41.6, 28, 43.3, 28.6, 44, 29.7, 45.2, 30.7, 46.5, 32.5, 46.1, 33, 45.3, 33.5, 44.5, 35, 45, 36.5, 45.3, 38, 44.5, 39.7, 43.6, 42, 43.5, 46.5, 44, 50, 48, 55, 58, 53, 68.6, 44, 68.4, 43, 66.3, 40, 64.6, 37, 64.4, 35, 66, 41, 66.3, 41, 67.8, 33, 69.4, 28, 71, 24, 71.1, 19, 70, 15, 68.5, 12.5, 66, 8.5, 63.5, 5, 62, 5, 60, 5.5, 58.8, 7, 58, 8.5, 58.2, 10.5, 59.3, 11.2, 58.7, 11.8, 57.7, 12.8, 56, 14, 55.4, 16, 56.2, 16.6, 57.5, 18.5, 59.3, 17.5, 61, 17.4, 62.5, 21, 64.5, 22.5, 65.8, 25.4, 65, 21.5, 63, 21.4, 61, 22.8, 59.9, 25, 60.2, 28, 60.5, 30, 59.9, 28, 59.4, 24, 59.4, 23.4, 58.5, 24.4, 57.3, 21.6, 57.4, 21, 56, 21.2, 55.2, 19.6, 54.4, 18.5, 54.7, 16, 54.3, 14.2, 53.9, 12, 54.2, 10.9, 54.2, 10, 55, 10.5, 57.6, 8.2, 56.8, 8.6, 55.5, 8.8, 54, 7, 53.4, 5, 53.2, 4.5, 52, 3.5, 51.4, 2, 51, 1.6, 50.2, 0, 49.6, -1.3, 49.6, -1.9, 48.7, -4.7, 48.4, -2.3, 47.3, -1.2, 46, -1.4, 44, -1.8, 43.4, -4, 43.4, -8, 43.7, -9.3, 43, -8.8, 41.5, -9.5, 38.8, -8.9, 37.9, -8.9, 37, -7.5, 37.2, -6.4, 36.8];
const GB = [-5.7, 50.1, -3.5, 50.4, -1, 50.7, 1.4, 51.2, 1.7, 52.6, 0.3, 53.5, -0.3, 54.2, -1.4, 55, -2, 55.9, -3, 56.1, -1.8, 57.5, -3.6, 57.7, -3, 58.6, -5, 58.6, -5.6, 57.2, -5.8, 56, -4.9, 55.1, -3.2, 54.9, -3.4, 53.5, -4.6, 53.3, -4.4, 52.8, -4.1, 52, -5.2, 51.7, -3.2, 51.4, -4.2, 51.1];
const IRELAND = [-6, 52.2, -6, 53.3, -5.6, 54.5, -6.2, 55.3, -7.5, 55.3, -8.6, 54.7, -10, 54.2, -9.9, 53.4, -9.5, 52.5, -10.4, 51.8, -9.5, 51.5, -8, 51.7, -6.4, 52.2];
const ICELAND = [-24, 65.5, -22, 66.4, -18, 66.2, -14.5, 66.2, -13.5, 65.2, -15, 64.3, -18.7, 63.4, -22.7, 63.8, -22, 64.6];
const SICILY = [12.4, 38.1, 15.6, 38.3, 15.1, 36.7, 12.5, 37.6];
const SARDINIA = [8.4, 41.2, 9.8, 41, 9.6, 39.1, 8.4, 39];
const CORSICA = [9.4, 43, 9.5, 41.4, 8.6, 41.9];
const CRETE = [23.5, 35.3, 26.3, 35.2, 24.5, 34.9];
const CYPRUS = [32.3, 35, 34.6, 35.7, 33.9, 34.9];
const SVALBARD = [11, 78.5, 16, 80, 27, 80, 22, 78, 17, 76.5];
const NOVAYA = [52, 71, 56, 73.5, 60, 75.8, 68, 77, 62, 74.5, 55, 71.5];
const SEVERNAYA = [95, 79, 100, 81, 105, 78.5];
const NSIB = [137, 74.5, 142, 75.8, 150, 75, 142, 73.5];
const AFRICA = [-5.9, 35.8, -2, 35.1, 1, 36.5, 5, 36.8, 10, 37.3, 11, 36.8, 10.2, 34.2, 11, 33.2, 15.2, 32.3, 19, 30.3, 20, 31, 20, 32.2, 23, 32.6, 25, 31.6, 29.9, 31.2, 32.3, 31.2, 32.6, 29.9, 33.7, 27.5, 35.5, 24, 37.2, 21, 38.5, 18, 39.7, 15.5, 41.7, 13.5, 43.3, 11.8, 44.5, 10.4, 47, 11, 51.2, 11.8, 51, 10.4, 49.5, 6, 48, 4.5, 46, 2, 43, -0.5, 41.5, -1.8, 40, -3.5, 39.3, -6.8, 39.8, -10, 40.5, -15, 36.8, -18, 35, -20, 35.5, -24, 32.6, -26, 32.4, -28.5, 30.5, -31, 27.5, -33.5, 25, -34, 20, -34.8, 18.4, -34.3, 18.2, -32, 16.5, -28.6, 15, -26.5, 14.4, -22.5, 11.8, -17.2, 12.5, -13.5, 13.3, -9, 12.3, -6, 11.8, -4, 9.3, -1, 9.6, 1, 9.6, 3.5, 8.5, 4.5, 6, 4.3, 4.5, 6.3, 2, 6.3, -1, 5.1, -3, 5, -7.5, 4.4, -10, 6, -13, 8.2, -15, 10.8, -16.8, 12.5, -17.5, 14.7, -16.5, 16.5, -16.2, 20, -17, 21, -15, 24, -13, 27.5, -10, 29.5, -9.7, 31, -8.5, 33.3, -6.8, 34];
const MADAGASCAR = [49.3, -12, 50.5, -15.5, 49.5, -17.5, 48, -22, 47.1, -25, 45, -25.5, 43.5, -23, 44.2, -20, 44.4, -16.5, 46.5, -15.5, 48, -13.5];
const ASIA = [29.2, 41.2, 31.5, 41.3, 35, 42, 38, 41, 41.6, 41.6, 41, 43, 39.7, 43.6, 42, 45, 45, 52, 48, 60, 44, 68.4, 53, 68.6, 60, 69.6, 68, 69, 70, 73, 72.5, 72.8, 75, 72, 80, 73.5, 87, 74.8, 100, 77.5, 104, 77.7, 113, 73.7, 120, 73, 128, 72.5, 131, 71, 140, 72.5, 150, 71.5, 160, 69.5, 170, 70, 178, 69.5, 180, 68.8, 180, 65, 177, 62.5, 173, 61.5, 170, 60, 164, 59.8, 163, 57.5, 162, 56, 160, 53, 156.7, 51, 156, 53, 155.5, 57, 157, 58, 160, 61, 163, 62.5, 160, 61.8, 155, 59.5, 150, 59.5, 143, 59.3, 140, 57, 137, 54, 141, 53, ...KOREA_CHINA, 117, 23.5, 114.3, 22.3, 111, 21.4, 110.3, 20.3, 109.7, 21.6, 108, 21.5, 106.5, 20.2, 105.8, 19, 106.7, 17.5, 108.8, 15.3, 109.3, 12.5, 107.5, 10.5, 105.2, 8.7, 104.8, 10.4, 103, 11.5, 100.5, 13.4, 99.2, 10.5, 100.3, 8.3, 101.5, 6.5, 103.4, 4, 104.2, 1.4, 103.3, 1.3, 101.3, 2.8, 100.3, 5, 98.3, 8, 98.6, 10.5, 97.8, 15.5, 97, 16.5, 94.5, 16, 94.2, 18.5, 92.5, 20.8, 91.8, 22.4, 90.5, 22, 88, 21.6, 86.8, 21, 85.5, 19.8, 82.5, 16.8, 80.3, 15.4, 80.2, 13, 79.8, 10.3, 77.5, 8.1, 76.3, 9.8, 74.8, 12.8, 73.3, 16.5, 72.8, 19, 72.6, 21, 70, 20.8, 68.9, 22.4, 70, 22.8, 68.5, 23.5, 67, 24.8, 64, 25.3, 61.5, 25.1, 57.5, 25.7, 56.3, 27, 54.5, 26.6, 51.5, 27.8, 50.2, 29.9, 48, 30, 48.5, 28.4, 50, 26.3, 51.5, 25.5, 51.6, 24.5, 54, 24.1, 56, 26, 56.3, 26.2, 56.4, 24.8, 57, 23.8, 58.8, 22.5, 59.8, 22.5, 58.5, 20.5, 57, 18.8, 55, 17, 52, 15.7, 48.5, 14, 45, 12.8, 43.4, 12.6, 42.7, 15.5, 40.8, 19.5, 39, 22, 37, 25, 35, 28, 34.9, 29.5, 34.2, 27.8, 32.6, 29.9, 32.3, 31.2, 34.5, 31.5, 35, 33, 35.9, 35.5, 36, 36.6, 34, 36.3, 32, 36.5, 30.5, 36.3, 28, 36.7, 27.3, 37.5, 26.5, 38.4, 26.9, 39.5, 26.2, 40, 27.5, 40.4, 29, 40.8];
const CHUKOTKA = [-180, 68.8, -175, 69.8, -171, 68.8, -170, 66.2, -172, 64.5, -175, 65, -178.5, 64.5, -180, 65];
const SRI_LANKA = [79.9, 9.7, 81.9, 7.5, 81.5, 6.1, 80, 6, 79.7, 8];
const HAINAN = [108.6, 19.2, 110.5, 20.1, 111, 19.6, 110, 18.2, 108.7, 18.5];
const LUZON = [120.6, 18.5, 122.3, 18.4, 122.2, 17, 121.6, 15.7, 121.7, 14.2, 124.2, 13.8, 124.1, 12.6, 123, 13, 121.8, 13.9, 120.6, 13.9, 120.6, 14.8, 119.8, 16.3, 120.4, 17];
const MINDANAO = [122, 7, 123.8, 8.5, 125.5, 9.8, 126.6, 7.2, 126, 6, 125.3, 5.6, 124, 6.4, 122.2, 6.9];
const VISAYAS = [122, 10.5, 123.5, 11.5, 125, 12.5, 125.5, 11, 124, 9.8, 122.5, 9.3];
const BORNEO = [109, 1.8, 109.6, -1, 110.2, -3, 114.5, -4, 116.5, -2.5, 117.5, 0.5, 118.5, 4.5, 119.2, 5.3, 117.2, 7, 115.5, 5.2, 113.5, 3.8, 111, 1.8, 109.6, 2];
const SUMATRA = [95.3, 5.6, 97.5, 5.2, 100.4, 2.2, 103.8, -1, 106, -3, 105.8, -5.8, 104.5, -5.9, 102, -4, 100.3, -1, 98.7, 1.7, 95.7, 4.5];
const JAVA = [105.2, -6.8, 106.4, -6, 108.5, -6.6, 111, -6.4, 112.7, -6.9, 114.5, -7.8, 114.4, -8.7, 110.5, -8.2, 108, -7.8, 105.5, -7];
const SULAWESI = [119.4, -5.5, 120.4, -5.6, 120.4, -3, 121, -2.5, 122.5, -4.8, 123.2, -4.3, 121.8, -1.8, 123.3, -1, 121, -1, 120.8, 0.5, 124.9, 1.5, 124.5, 0.4, 120.3, 0.3, 119.7, -0.8, 118.8, -2.8];
const SUNDA = [114.5, -8.2, 119, -8.2, 123, -8.3, 123, -8.8, 116, -9];
const TIMOR = [124, -10.3, 125.2, -9, 127.2, -8.4, 126.5, -9, 124.3, -10.2];
const NEW_GUINEA = [131, -1.4, 134.2, -0.9, 136, -1.7, 138, -1.7, 141, -2.6, 144.5, -3.9, 146, -5.5, 147.6, -6.2, 148, -8.2, 150.2, -10.5, 148.5, -10.2, 146.5, -8.8, 144, -7.8, 142.5, -9.3, 141, -9.1, 139, -8.1, 138, -7.5, 137.7, -5.2, 135, -4.4, 133, -4, 132, -2.9, 131.5, -2.2];
const AUSTRALIA = [114.1, -21.8, 116.8, -20.6, 121, -19.5, 122.2, -17.5, 123.6, -16.2, 125.5, -14.5, 127.6, -14.2, 129.4, -14.9, 130.2, -12.6, 130.8, -12.4, 132.5, -11.6, 135.9, -12.2, 136.8, -12.2, 136.5, -13.6, 135.5, -14.8, 137.8, -16.5, 140.8, -17.4, 141.6, -15, 141.6, -12.5, 142.5, -10.7, 143.6, -14, 145.3, -15, 146.3, -18.9, 148.8, -20.5, 150.8, -22.6, 153.1, -25, 153.6, -28.6, 153, -31.5, 151.2, -33.9, 150, -37.5, 147.8, -37.9, 146.3, -39.1, 144.9, -37.9, 143.5, -38.8, 140.5, -38, 139.5, -37.2, 138.1, -35.6, 138.5, -34.8, 137.8, -32.8, 137, -34.2, 136, -34.9, 135.5, -33.2, 134, -32.5, 131.5, -31.5, 128.5, -31.7, 125, -32.5, 123.6, -33.9, 120, -34, 118, -35, 115, -34.3, 115.7, -32, 115, -29.5, 114, -26.5, 113.5, -24.5];
const TASMANIA = [144.6, -40.7, 148.3, -40.9, 148.3, -42.2, 147, -43.6, 145.2, -42.2];
const NZ_N = [172.7, -34.4, 174.5, -35.5, 175.8, -36.8, 178.5, -37.7, 177.9, -39.2, 176.9, -39.6, 176, -41.3, 174.8, -41.3, 175, -40, 173.8, -39.3, 174.6, -38, 173.5, -35.6];
const NZ_S = [172.7, -40.5, 174.3, -41.3, 173.9, -42.2, 172.8, -43.7, 171.3, -44.4, 170.8, -45.9, 169, -46.6, 166.5, -46, 167, -45, 168.5, -44, 170.5, -43, 171.5, -41.8, 172.2, -40.6];
const ANTARCTICA = [-180, -78, -160, -77.5, -150, -76.5, -140, -75, -120, -73.5, -100, -72.5, -90, -72.8, -80, -73, -75, -71, -68, -67, -62, -64.5, -57, -63.3, -58, -65, -62, -68, -61, -72, -60, -75, -50, -78, -40, -78, -30, -76, -20, -73.5, -10, -71, 0, -70, 15, -70, 30, -69.5, 40, -69, 55, -66.5, 70, -68, 72, -70, 80, -67, 95, -66, 110, -66, 120, -66.5, 135, -66, 150, -68.5, 160, -70.5, 170, -72, 167, -77, 165, -78, 180, -78, 180, -90, -180, -90];

export const LAND = [NA, GREENLAND, BAFFIN, VICTORIA, BANKS, ELLESMERE, DEVON, QE, SOUTHAMPTON, NEWFOUNDLAND, VANCOUVER_I, CUBA, HISPANIOLA, JAMAICA,
  SA, FALKLANDS, EUROPE, GB, IRELAND, ICELAND, SICILY, SARDINIA, CORSICA, CRETE, CYPRUS, SVALBARD, NOVAYA, SEVERNAYA, NSIB,
  AFRICA, MADAGASCAR, ASIA, CHUKOTKA, SRI_LANKA, HONSHU, SHIKOKU, KYUSHU, HOKKAIDO, OKINAWA, SAKHALIN, TAIWAN, HAINAN,
  SADO, AWAJI, TSUSHIMA, AMAKUSA, TANEGASHIMA, AMAMI, KUNASHIRI, ETOROFU, JEJU,
  LUZON, MINDANAO, VISAYAS, BORNEO, SUMATRA, JAVA, SULAWESI, SUNDA, TIMOR, NEW_GUINEA, AUSTRALIA, TASMANIA, NZ_N, NZ_S, ANTARCTICA];
// small round islands: [lon, lat, radius°]
const ISLETS = [[-155.5, 19.6, 0.9], [-156.4, 20.8, 0.45], [-157.9, 21.45, 0.35], [-159.5, 22.05, 0.3], [178.1, -17.8, 0.6], [179.3, -16.6, 0.45], [-149.4, -17.65, 0.3],
  [-172.3, -13.7, 0.35], [-175.2, -21.2, 0.3], [167.5, -16, 0.5], [165.5, -21.4, 1.0], [160, -9.5, 0.7], [144.8, 13.45, 0.25], [134.6, 7.4, 0.25], [-109.37, -27.12, 0.22],
  [-90.5, -0.6, 0.5], [-17, 28.3, 0.3], [-15.6, 27.9, 0.3], [-25.5, 37.8, 0.3], [-16.9, 32.7, 0.25], [-23.6, 15.1, 0.3], [3, 39.6, 0.35], [-61.0, 14.6, 0.25], [-61.4, 15.4, 0.2],
  [-66.4, 18.2, 0.45], [-77.4, 24.6, 0.4], [-76.2, 25.4, 0.3], [55.5, -21.1, 0.3], [57.6, -20.3, 0.3], [73.5, 4.2, 0.25], [92.7, 11.7, 0.4], [151, -5, 0.8], [152, -4.2, 0.5], [158.2, 6.9, 0.25],
  [171.2, 7.1, 0.2], [-157.4, 1.9, 0.2], [-140, -9, 0.3], [-144, -17, 0.3], [-159.8, -21.2, 0.2], 
  [113.9, 22.25, 0.12], [127, -3.3, 0.6], [129.5, -3.2, 0.5], [128, 1.0, 0.6], [117.5, 9.5, 0.6], [119, 10.4, 0.5], [-63.5, 18.1, 0.12], [-8, 71, 0.2], [-18, 79.7, 0.3],
  [56, 80.5, 1.0], [58, 81, 0.8], [178.5, 71.2, 0.8], [-178, 71.3, 0.6], [150.5, 46.2, 0.25], [-170, 63.4, 0.5], [-176, 51.9, 0.3], [-170, 52.6, 0.25], ...JP_ISLETS];
export const LAKES = [
  [-92, 46.7, -89, 48.5, -86, 48.8, -84.6, 46.5, -87.5, 46.5],
  [-87.8, 42, -87, 46, -85, 46, -86.3, 43],
  [-84, 46, -80.5, 45, -82, 43, -83.5, 44],
  [-83.4, 41.7, -79, 42.8, -81, 42.2],
  [-79.8, 43.3, -76.2, 44.2, -76.5, 43.3],
  [-123, 65.5, -118, 66.8, -117, 65.5, -121, 64.8],
  [-114, 61.5, -109, 62.8, -112, 62],
  [-99, 50.5, -96.5, 50.5, -97, 53.8, -99, 53],
  [47, 44.5, 49.5, 46.5, 53, 46.8, 53, 45, 51, 43.5, 52.8, 41.5, 53.7, 40, 53, 37.4, 50.5, 37, 49, 38.5, 49.5, 40.3, 48, 42],
  [58.5, 46.5, 61.5, 46.6, 61.2, 44.5, 59, 44.2],
  [103.8, 51.6, 106, 52.3, 109.5, 55.7, 108.5, 55.9, 105, 52.8],
  [74, 46.8, 79, 46.5, 79, 46.0, 74.5, 46.2],
  [32, 0.3, 34, 0.3, 34, -2.6, 31.7, -2],
  [29.2, -3.4, 29.8, -3.4, 31.2, -8.6, 30.5, -8.6],
  [34.3, -9.6, 34.9, -9.6, 35.3, -14.3, 34.5, -14.3],
  [-70, -15.3, -68.6, -15.6, -69.3, -16.3],
  ...JP_LAKES,
];

function pip(lon, lat, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function isLand(lat, lon) {
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  for (const l of LAKES) if (pip(lon, lat, l)) return false;
  for (const p of LAND) if (pip(lon, lat, p)) return true;
  for (const [x, y, r] of ISLETS) if ((lon - x) ** 2 + (lat - y) ** 2 < r * r) return true;
  return false;
}

// biome overlays (drawn clipped to land, softened)
const BIOMES = [
  // savanna / steppe
  ['#b9c450', [-17, 12, -10, 15.5, 0, 15.5, 15, 14.5, 25, 15, 35, 15.5, 40, 11, 35, 8.5, 25, 9, 15, 9.5, 5, 10, -5, 10, -12, 9]],
  ['#b3c24e', [28, 4, 35, 5, 40, 8, 45, 8, 42, 0, 40, -5, 39, -12, 36, -17, 33, -24, 30, -27, 27, -25, 24, -19, 18, -15, 14, -13, 18, -10, 25, -8, 29, -4, 27, 0]],
  ['#a9c04e', [-55, -8, -45, -7, -40, -10, -42, -17, -46, -21, -52, -20, -57, -17, -60, -14]],
  ['#b5c055', [122, -16, 128, -13.5, 133, -12, 137, -13, 141, -12, 144, -15, 146, -19, 147, -23, 143, -23, 138, -20, 130, -18, 124, -19]],
  ['#a8c45a', [-110, 52, -97, 52, -97, 33, -103, 31, -106, 37, -110, 43]],
  ['#bcc172', [48, 46, 55, 51, 65, 54, 75, 53, 82, 50, 80, 46, 70, 44, 60, 44, 52, 44]],
  ['#a8bf55', [74, 22, 80, 23, 82, 20, 79, 15, 76, 15, 74, 18]],
  ['#cfc382', [-71, -38, -66, -38, -63, -41, -65, -47, -68, -50, -71, -50, -71.5, -44]],
  // deserts
  ['#e8c46e', [-17, 21, -14, 27, -9, 30, -2, 32, 5, 32, 10, 31, 15, 31, 20, 30.5, 25, 30.5, 30, 30.5, 33, 27, 35, 22, 37, 18, 33, 15.5, 25, 15, 15, 14.5, 5, 15.5, -5, 15.5, -12, 16, -17, 17]],
  ['#e8b060', [-8, 25, 0, 29, 10, 28, 20, 27, 28, 25, 30, 20, 22, 18, 12, 19, 2, 20, -6, 21]],
  ['#e6c06a', [35, 30, 39, 32, 46, 31, 48, 29.5, 51, 25, 56, 23, 58, 20, 52, 16.5, 45, 14, 42, 16, 39, 21, 35, 27]],
  ['#e4b464', [44, 23, 50, 22, 55, 20, 52, 18, 46, 18]],
  ['#dcc07a', [48, 33, 55, 36, 61, 35, 66, 30, 68, 25.5, 62, 25, 57, 26.5, 52, 28, 49, 31]],
  ['#dfc070', [69, 24, 70, 28.5, 73, 30, 75, 27.5, 73, 24.5]],
  ['#dcc478', [52, 38, 56, 45, 62, 46, 66, 43, 64, 38, 58, 37]],
  ['#e2c274', [75, 37, 78, 41, 84, 42, 90, 42, 95, 43, 100, 44, 105, 45.5, 111, 45, 114, 43, 110, 41, 104, 39, 98, 39.5, 92, 38, 86, 37, 80, 36.5]],
  ['#e6b866', [116, -21, 121, -19, 128, -18.5, 134, -19, 139, -21, 142, -24, 141, -29, 136, -31, 130, -30.5, 124, -30, 119, -28.5, 115, -25.5]],
  ['#e29a52', [122, -22, 130, -21, 136, -23, 135, -27, 128, -28, 122, -26]],
  ['#e0bc6c', [12, -17, 16, -18, 22, -19, 26, -22, 25, -27, 20, -30, 17, -30, 15, -26, 13, -21]],
  ['#dcb878', [-71.5, -17, -69, -18, -68.5, -27, -70.5, -29, -71.2, -24]],
  ['#e0b46a', [-121, 36, -115, 40, -110, 41, -106, 36, -104, 31, -103, 28, -107, 25, -110, 26.5, -113, 30, -116, 32, -118, 34]],
  // rainforest
  ['#2a8f3a', [-78, -2, -75, 2, -70, 4, -63, 5, -58, 4, -52, 3, -50, 0, -48, -2, -52, -6, -58, -9, -64, -11, -70, -11, -74, -8, -77, -5]],
  ['#2a8f3a', [9, 3, 12, 4, 18, 4, 25, 4, 30, 2, 30, -3, 27, -6, 20, -6, 14, -5, 10, -2]],
  ['#2c923c', [92, 22, 100, 22, 108, 20, 110, 18, 110, 10, 120, 8, 127, 8, 130, 0, 141, -2, 150, -6, 150, -11, 141, -9, 130, -9, 115, -9, 105, -7, 100, -4, 95, 2]],
  ['#2f9a3e', [-92, 17, -88, 18, -83, 15, -80, 9, -77, 8, -82, 8, -86, 11, -90, 14]],
  ['#309a40', [-13, 9, -8, 8, -2, 7, 6, 6.5, 9, 5, 6, 4, -3, 4.5, -8, 4.5]],
  // highlands
  ['#b39b77', [73, 36, 80, 36, 88, 36.5, 97, 35, 103, 33, 102, 28, 97, 27.5, 92, 27.5, 88, 27, 84, 28, 80, 29.5, 76, 32.5]],
  ['#a89878', [6, 45, 7, 46.5, 10, 46.8, 13, 47.3, 15, 46.5, 12, 45.8, 9, 45.6]],
  // ice
  ['#f4f8fb', GREENLAND], ['#f4f8fb', ELLESMERE], ['#f4f8fb', SVALBARD], ['#f2f7fa', SEVERNAYA], ['#eef4f6', [-19.5, 64.2, -15.5, 64.1, -16, 64.8, -18.5, 64.9]],
];
const RIDGES = [ // [colour, width (px @4096), snow?, polyline]
  ['#9a7c5a', 30, true, [-75, 10, -77, 4, -78, -1, -77, -8, -73, -14, -69, -18, -68.5, -24, -69.5, -30, -70, -35, -71, -40, -72, -46, -73, -51]],
  ['#9a8a6a', 30, true, [-150, 62, -140, 60.5, -130, 58, -123, 54, -117, 50, -113, 46, -110, 43, -107, 39, -106, 35, -107, 31]],
  ['#a08a6a', 18, false, [-105, 28, -102, 23, -99, 19]],
  ['#9a8a70', 16, false, [42, 43.5, 46, 42]],
  ['#9a8a70', 16, false, [45, 36, 50, 33, 55, 30, 58, 27.5]],
  ['#8a9a70', 14, false, [59.5, 50, 60, 56, 59.5, 62, 64, 67]],
  ['#a09070', 12, false, [36.5, -3, 37.5, -0.5, 38.5, 7, 39.5, 11]],
  ['#8aa070', 12, false, [7, 62, 12, 64.5, 16, 67.5, 20, 69]],
  ['#9a9070', 12, true, [168, -44.5, 171, -42.5]],
];

export function drawEarth(ctx, w, h) {
  const X = (lon) => ((lon + 180) / 360) * w, Y = (lat) => ((90 - lat) / 180) * h;
  const S = w / 4096;
  const r = rng(2024);
  const poly = (path, p) => { path.moveTo(X(p[0]), Y(p[1])); for (let i = 2; i < p.length; i += 2) path.lineTo(X(p[i]), Y(p[i + 1])); path.closePath(); };
  const line = (p) => { ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[1])); for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1])); };
  const hasFilter = typeof ctx.filter === 'string';
  const blur = (px) => { if (hasFilter) ctx.filter = px > 0 ? `blur(${px * S}px)` : 'none'; };

  // ---- ocean
  const og = ctx.createLinearGradient(0, 0, 0, h);
  og.addColorStop(0, '#5aa6dc'); og.addColorStop(0.12, '#2f7fc8'); og.addColorStop(0.32, '#1d63b3'); og.addColorStop(0.5, '#1a5cae');
  og.addColorStop(0.68, '#1d63b3'); og.addColorStop(0.86, '#2f7fc8'); og.addColorStop(1, '#6cb0e0');
  ctx.fillStyle = og; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { // deep-water blotches
    const x = r() * w, y = r() * h, s = (20 + r() * 60) * S;
    ctx.fillStyle = r() < 0.5 ? 'rgba(10,40,110,0.07)' : 'rgba(120,190,255,0.05)';
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 1.2, y + s * 0.6); ctx.lineTo(x - s * 1.1, y + s * 0.7); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2.2 * S; ctx.lineCap = 'round';
  for (let i = 0; i < 2600; i++) { // little wave marks
    const x = r() * w, y = r() * h, s = (6 + r() * 8) * S;
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s / 2, y - s * 0.6, x, y); ctx.quadraticCurveTo(x + s / 2, y - s * 0.6, x + s, y); ctx.stroke();
  }

  const land = new Path2D();
  for (const p of LAND) poly(land, p);
  for (const [lx, ly, rr] of ISLETS) { land.moveTo(X(lx + rr), Y(ly)); land.ellipse(X(lx), Y(ly), (rr / 360) * w, (rr / 180) * h, 0, 0, TAU); land.closePath(); }
  const lakes = new Path2D();
  for (const p of LAKES) poly(lakes, p);

  // ---- shallows around coasts
  ctx.save(); ctx.lineJoin = 'round';
  blur(10); ctx.strokeStyle = 'rgba(90,180,230,0.45)'; ctx.lineWidth = 70 * S; ctx.stroke(land);
  blur(5); ctx.strokeStyle = 'rgba(130,215,240,0.55)'; ctx.lineWidth = 30 * S; ctx.stroke(land);
  blur(0); ctx.strokeStyle = 'rgba(170,235,245,0.7)'; ctx.lineWidth = 11 * S; ctx.stroke(land);
  ctx.restore();

  // ---- land base: latitude climate gradient
  const lg = ctx.createLinearGradient(0, 0, 0, h);
  const stops = [[90, '#f4f8fb'], [77, '#eef3f4'], [72, '#b8c49a'], [66, '#7fa86a'], [58, '#4a8f52'], [50, '#56a04a'], [42, '#6cbf4a'], [32, '#86c44e'], [20, '#5cb244'],
    [8, '#33993c'], [0, '#2f963a'], [-10, '#3aa040'], [-22, '#6cb84a'], [-35, '#7cc24e'], [-45, '#6cb04e'], [-54, '#86a868'], [-60, '#dfe8ea'], [-64, '#f4f8fb'], [-90, '#f7fafc']];
  for (const [lat, c] of stops) lg.addColorStop((90 - lat) / 180, c);
  ctx.fillStyle = lg; ctx.fill(land);

  ctx.save(); ctx.clip(land);
  blur(14);
  for (const [c, p] of BIOMES) { const pth = new Path2D(); poly(pth, p); ctx.fillStyle = c; ctx.fill(pth); }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [c, lw, snow, p] of RIDGES) {
    line(p); ctx.strokeStyle = c; ctx.lineWidth = lw * S; ctx.stroke();
    if (snow) { blur(4); line(p); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = lw * 0.3 * S; ctx.stroke(); blur(14); }
  }
  blur(5); // Himalaya / Alps snow
  line([74, 35.5, 77, 34, 80, 31.5, 84, 29.2, 88, 28, 92, 28, 95, 29]); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 16 * S; ctx.stroke();
  line([6.5, 45.8, 8, 46.3, 10.5, 46.6, 13, 47]); ctx.lineWidth = 9 * S; ctx.stroke();
  blur(0);
  paintJapan(ctx, X, Y, w / 360, r, false); // Japan / Korea relief (same data as drawRegion)
  blur(0);
  // texture: low-poly speckle
  for (let i = 0; i < 26000; i++) {
    const x = r() * w, y = r() * h, s = (3 + r() * 9) * S;
    ctx.fillStyle = r() < 0.55 ? 'rgba(0,40,0,0.07)' : 'rgba(255,255,220,0.08)';
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.7); ctx.lineTo(x - s, y + s * 0.7); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // ---- lakes
  ctx.fillStyle = '#3b8fd4'; ctx.fill(lakes);
  ctx.strokeStyle = 'rgba(170,235,245,0.6)'; ctx.lineWidth = 3 * S; ctx.stroke(lakes);
  // ---- crisp toy coastline
  ctx.save(); ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3 * S; ctx.stroke(land);
  ctx.restore();

  // ---- grid
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1.6 * S;
  for (let lon = -165; lon < 180; lon += 15) { ctx.beginPath(); ctx.moveTo(X(lon), 0); ctx.lineTo(X(lon), h); ctx.stroke(); }
  for (let lat = -75; lat < 90; lat += 15) { ctx.beginPath(); ctx.moveTo(0, Y(lat)); ctx.lineTo(w, Y(lat)); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,240,170,0.22)'; ctx.lineWidth = 2.6 * S;
  ctx.setLineDash([18 * S, 14 * S]);
  for (const lat of [0, 23.44, -23.44]) { ctx.beginPath(); ctx.moveTo(0, Y(lat)); ctx.lineTo(w, Y(lat)); ctx.stroke(); }
  ctx.setLineDash([]);
}

// ---- Japan / Korea relief, plains, cities, rail and labels (widths in degrees so both maps can scale them)
const JP_RIDGES = [ // [colour, width°, snow?, polyline]
  ['#3f8a44', 0.45, false, [142.0, 44.8, 142.3, 44.2, 142.6, 43.75]], ['#4a7f46', 0.5, true, [142.6, 43.75, 142.9, 43.6, 143.1, 43.45]],
  ['#467f44', 0.45, true, [142.6, 43.1, 142.85, 42.6, 143.2, 42.1]], ['#3f8a44', 0.3, false, [144.9, 43.95, 145.2, 44.2]], ['#3f8a44', 0.3, false, [142.1, 43.25, 142.3, 42.9]],
  ['#3f8a44', 0.5, false, [140.95, 41.0, 140.95, 40.3, 140.85, 39.6, 140.8, 39.0, 140.55, 38.4, 140.2, 37.7, 140.0, 37.2, 139.7, 36.9]],
  ['#438c46', 0.35, false, [141.5, 40.1, 141.45, 39.3, 141.4, 38.9]], ['#438c46', 0.35, false, [139.95, 39.3, 139.95, 38.8, 139.8, 38.2, 139.7, 37.85]],
  ['#4f7a4a', 0.5, true, [137.8, 36.9, 137.65, 36.4, 137.55, 36.05]], ['#4f7a4a', 0.35, true, [137.85, 35.95, 137.85, 35.6]], ['#4f7a4a', 0.4, true, [138.25, 35.75, 138.15, 35.4, 138.0, 35.1]],
  ['#3f8a44', 0.45, false, [139.4, 37.1, 139.0, 36.8, 138.6, 36.6]], ['#3f8a44', 0.35, false, [138.85, 36.05, 139.1, 35.85]], ['#3f8a44', 0.3, false, [136.75, 36.3, 136.6, 35.9]],
  ['#3f8a44', 0.25, false, [139.15, 35.5, 139.05, 35.25]], ['#3f8a44', 0.3, false, [139.35, 36.9, 139.55, 36.75]], ['#3f8a44', 0.45, false, [135.8, 34.4, 135.85, 34.05, 135.75, 33.8]],
  ['#3f8a44', 0.4, false, [132.0, 34.65, 132.7, 34.95, 133.5, 35.2, 134.3, 35.25, 135.0, 35.25]], ['#3f8a44', 0.45, false, [132.8, 33.6, 133.3, 33.75, 133.9, 33.85, 134.3, 33.85]],
  ['#3f8a44', 0.45, false, [131.1, 32.9, 131.15, 32.5, 131.0, 32.1, 130.85, 31.85]], ['#3f8a44', 0.25, false, [130.5, 30.3, 130.6, 30.4]],
  ['#5a8a4a', 0.5, false, [127.9, 39.0, 128.4, 38.3, 128.8, 37.6, 129.0, 37.0, 128.8, 36.3, 128.6, 35.6]], ['#5a8a4a', 0.4, false, [128.4, 36.6, 127.8, 35.9, 127.6, 35.4]],
  ['#577f48', 0.6, false, [126.6, 41.2, 127.3, 40.5, 128.0, 41.0, 128.6, 41.6, 129.3, 41.9, 129.8, 42.4]], ['#6a7a52', 0.5, true, [127.9, 41.9, 128.1, 42.0, 128.5, 42.2]],
  ['#4f7f4a', 0.6, false, [137.5, 46.5, 136.0, 45.0, 134.5, 43.8, 133.5, 43.3]], ['#4f7f4a', 0.3, false, [142.5, 46.8, 142.7, 48.0]],
  ['#5a8a4a', 0.5, false, [119.0, 26.5, 119.6, 27.5, 120.2, 28.5, 120.6, 29.3]], ['#4f7f4a', 0.45, true, [121.5, 24.8, 121.2, 23.5, 120.9, 22.5]],
];
const JP_PLAINS = [ // farmland / rice plains (lighter, warmer green)
  [139.2, 36.3, 139.9, 36.4, 140.4, 36.2, 140.5, 35.75, 140.1, 35.62, 139.7, 35.58, 139.4, 35.7], [138.6, 37.5, 139.1, 37.95, 139.3, 37.8, 138.9, 37.35],
  [140.85, 38.45, 141.15, 38.45, 141.0, 37.9, 140.85, 38.0], [136.5, 35.4, 136.95, 35.35, 136.95, 35.0, 136.6, 35.05], [135.4, 34.85, 135.75, 34.85, 135.7, 34.45, 135.4, 34.5],
  [141.2, 43.4, 141.8, 43.3, 141.8, 42.9, 141.4, 43.0], [142.9, 43.1, 143.6, 43.0, 143.6, 42.6, 143.0, 42.6], [130.2, 33.35, 130.6, 33.35, 130.6, 33.15, 130.25, 33.15],
  [144.6, 43.5, 145.2, 43.5, 145.2, 43.15, 144.6, 43.15], [139.75, 39.0, 139.95, 39.0, 139.95, 38.7, 139.75, 38.7], [140.1, 40.2, 140.6, 40.25, 140.5, 39.9, 140.1, 39.9],
  [126.6, 37.2, 127.3, 37.2, 127.2, 36.2, 126.8, 35.5, 126.6, 35.8], [122, 46, 126, 46, 126.5, 44, 125, 42.5, 123, 41.5, 122, 42],
];
const JP_URBAN = [[139.68, 35.7, 0.3], [139.6, 35.47, 0.16], [135.5, 34.68, 0.2], [135.76, 35.0, 0.09], [135.18, 34.7, 0.08], [136.9, 35.17, 0.16], [141.35, 43.06, 0.12],
  [140.87, 38.27, 0.1], [132.46, 34.4, 0.1], [130.4, 33.59, 0.12], [130.85, 33.88, 0.08], [126.98, 37.56, 0.22], [129.05, 35.15, 0.1], [125.75, 39.03, 0.1], [131.9, 43.12, 0.06],
  [127.68, 26.21, 0.05], [130.55, 31.6, 0.06], [130.7, 32.8, 0.07], [139.03, 37.9, 0.08], [138.38, 34.97, 0.07], [137.73, 34.7, 0.06], [133.92, 34.66, 0.07], [132.77, 33.84, 0.05],
  [134.05, 34.34, 0.05], [136.65, 36.56, 0.06], [138.19, 36.65, 0.05], [139.88, 36.56, 0.05], [140.47, 36.37, 0.05], [140.11, 35.6, 0.08], [139.65, 35.86, 0.1]];
const JP_RIVERS = [[138.95, 36.85, 139.1, 36.4, 139.6, 36.15, 140.1, 35.95, 140.85, 35.73], [138.2, 36.5, 138.5, 36.85, 138.8, 37.3, 139.05, 37.92],
  [142.6, 43.65, 142.0, 43.6, 141.6, 43.35, 141.35, 43.25], [137.6, 35.9, 137.2, 35.5, 136.9, 35.35, 136.7, 35.05], [141.2, 39.9, 141.1, 39.2, 141.25, 38.6, 141.3, 38.43],
  [128.0, 37.4, 127.5, 37.55, 126.9, 37.55, 126.6, 37.7], [128.6, 36.6, 128.5, 35.8, 128.95, 35.1], [127.0, 41.5, 125.5, 40.8, 124.35, 40.0], [135.9, 34.9, 135.6, 34.75, 135.45, 34.68]];
// shinkansen main lines (Tokaido–Sanyo–Kyushu, Tohoku–Hokkaido, Joetsu, Hokuriku)
const JP_RAIL = [
  [139.77, 35.68, 139.62, 35.51, 139.15, 35.26, 138.39, 34.97, 137.73, 34.7, 136.88, 35.17, 136.69, 35.32, 136.29, 35.31, 135.76, 34.99, 135.5, 34.73, 135.2, 34.71, 134.69, 34.83,
    133.92, 34.67, 133.36, 34.49, 132.48, 34.4, 131.81, 34.05, 131.4, 34.09, 130.88, 33.89, 130.42, 33.59, 130.69, 32.79, 130.54, 31.58],
  [139.77, 35.68, 139.62, 35.91, 139.9, 36.56, 140.39, 37.4, 140.46, 37.75, 140.88, 38.26, 141.13, 38.93, 141.15, 39.7, 141.47, 40.51, 140.69, 40.83, 140.43, 41.68, 140.65, 41.9],
  [139.62, 35.91, 139.01, 36.32, 138.81, 36.94, 139.06, 37.91], [139.01, 36.32, 138.19, 36.64, 137.21, 36.7, 136.65, 36.58, 136.07, 35.65]];
const JP_LABELS = [ // [text, lon, lat, size (px @2048), kind, side?]  kind: c city, s sea, r region, m mountain; side: b below, l left, r right (default above)
  ['東京', 139.69, 35.69, 17, 'c'], ['横浜', 139.64, 35.45, 15, 'c', 'b'], ['大阪', 135.5, 34.69, 16, 'c', 'b'], ['京都', 135.77, 35.01, 14, 'c'], ['名古屋', 136.91, 35.18, 15, 'c'],
  ['札幌', 141.35, 43.06, 16, 'c'], ['仙台', 140.87, 38.27, 15, 'c'], ['広島', 132.46, 34.39, 15, 'c'], ['福岡', 130.4, 33.59, 15, 'c'], ['那覇', 127.68, 26.21, 14, 'c'],
  ['神戸', 135.19, 34.69, 12, 'c', 'l'], ['奈良', 135.83, 34.68, 12, 'c', 'r'], ['金沢', 136.66, 36.56, 13, 'c'], ['新潟', 139.02, 37.9, 13, 'c'], ['長野', 138.19, 36.65, 12, 'c'],
  ['静岡', 138.38, 34.98, 12, 'c', 'b'], ['函館', 140.73, 41.77, 13, 'c'], ['青森', 140.74, 40.82, 13, 'c'], ['秋田', 140.1, 39.72, 12, 'c'], ['盛岡', 141.15, 39.7, 12, 'c'],
  ['鹿児島', 130.56, 31.6, 13, 'c'], ['熊本', 130.71, 32.8, 12, 'c'], ['長崎', 129.87, 32.75, 12, 'c'], ['高松', 134.05, 34.34, 12, 'c'], ['松山', 132.77, 33.84, 12, 'c'],
  ['高知', 133.53, 33.56, 12, 'c'], ['岡山', 133.92, 34.66, 12, 'c'], ['松江', 133.05, 35.47, 12, 'c'], ['旭川', 142.36, 43.77, 12, 'c'], ['釧路', 144.38, 42.98, 12, 'c'],
  ['日光', 139.6, 36.75, 11, 'c'], ['ソウル', 126.98, 37.57, 15, 'c'], ['釜山', 129.08, 35.18, 13, 'c'], ['平壌', 125.75, 39.03, 13, 'c'], ['ウラジオストク', 131.9, 43.12, 12, 'c'],
  ['富士山', 138.73, 35.36, 13, 'm'], ['桜島', 130.66, 31.58, 11, 'm'], ['阿蘇山', 131.1, 32.88, 11, 'm'], ['琵琶湖', 136.2, 35.3, 10, 'm', 'r'],
  ['日本海', 134.6, 39.6, 30, 's'], ['太平洋', 145.0, 32.6, 34, 's'], ['東シナ海', 125.6, 29.6, 28, 's'], ['オホーツク海', 146.6, 45.4, 24, 's'], ['瀬戸内海', 133.25, 34.08, 12, 's'],
  ['黄海', 123.6, 35.8, 26, 's'], ['東京湾', 139.82, 35.42, 9, 's'], ['北海道', 142.9, 43.5, 26, 'r'], ['本州', 138.2, 36.0, 24, 'r'], ['四国', 133.05, 33.3, 18, 'r'],
  ['九州', 131.35, 32.25, 20, 'r'], ['沖縄', 128.45, 26.35, 18, 'r'], ['朝鮮半島', 127.4, 38.6, 18, 'r'], ['中国', 124.4, 42.4, 22, 'r']];
const JP_VOLCANOES = [[138.73, 35.36, 0.2, true], [130.66, 31.58, 0.06, false], [131.1, 32.88, 0.1, false], [138.52, 36.4, 0.07, false], [140.68, 42.83, 0.06, false], [142.86, 43.66, 0.07, true]];
const ROUND_FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Maru Gothic Pro", sans-serif';

// shared painter for the Japan detail (used at low detail by drawEarth and in full by drawRegion)
function paintJapan(ctx, X, Y, k, r, full) {
  const line = (p) => { ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[1])); for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1])); };
  const poly = (p) => { line(p); ctx.closePath(); };
  const hasFilter = typeof ctx.filter === 'string';
  // (no blur on the small whole-earth texture: filters on a 4096² canvas are very slow without a GPU)
  const blur = (px) => { if (hasFilter && full) ctx.filter = px > 0 ? `blur(${px}px)` : 'none'; };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  blur(k * 0.12);
  ctx.globalAlpha = 0.75; ctx.fillStyle = '#a9cf5c';
  for (const p of JP_PLAINS) { poly(p); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.globalAlpha = full ? 1 : 0.45;
  for (const [c, wd, , p] of JP_RIDGES) { line(p); ctx.strokeStyle = c; ctx.lineWidth = wd * k * (full ? 1.6 : 1.0); ctx.stroke(); }
  ctx.globalAlpha = 1;
  blur(k * 0.05);
  for (const [, wd, snow, p] of JP_RIDGES) {
    if (full) { line(p); ctx.strokeStyle = 'rgba(120,110,80,0.35)'; ctx.lineWidth = wd * k * 0.45; ctx.stroke(); }
    if (snow) { line(p); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = wd * k * 0.25; ctx.stroke(); }
  }
  blur(0);
  if (!full) return;
  // forest: little tree marks scattered along the mountain spines
  for (const [c, wd, , p] of JP_RIDGES) {
    for (let i = 0; i + 3 < p.length; i += 2) {
      const len = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]), n = Math.ceil(len * 26);
      for (let j = 0; j < n; j++) {
        const t = r(), a = r() * TAU, d = Math.sqrt(r()) * wd * 1.1;
        const x = X(p[i] + (p[i + 2] - p[i]) * t + Math.cos(a) * d), y = Y(p[i + 1] + (p[i + 3] - p[i + 1]) * t + Math.sin(a) * d), s = k * (0.035 + r() * 0.03);
        ctx.fillStyle = r() < 0.5 ? '#2f6f3a' : shadeCss(c, 0.8);
        ctx.beginPath(); ctx.moveTo(x, y - s * 1.4); ctx.lineTo(x + s, y + s * 0.6); ctx.lineTo(x - s, y + s * 0.6); ctx.closePath(); ctx.fill();
      }
    }
  }
  // towns
  for (const [lx, ly, rr] of JP_URBAN) {
    ctx.fillStyle = 'rgba(232,222,196,0.55)'; ctx.beginPath(); ctx.ellipse(X(lx), Y(ly), rr * k, rr * k * 0.85, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 18 * rr * 10; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * rr * k, s = k * 0.025 * (0.6 + r());
      ctx.fillStyle = r() < 0.5 ? 'rgba(250,246,236,0.9)' : 'rgba(205,190,170,0.9)';
      ctx.fillRect(X(lx) + Math.cos(a) * d - s / 2, Y(ly) + Math.sin(a) * d * 0.85 - s / 2, s, s);
    }
  }
  // rivers
  ctx.strokeStyle = 'rgba(80,160,220,0.85)'; ctx.lineWidth = Math.max(1.2, k * 0.035);
  for (const p of JP_RIVERS) { line(p); ctx.stroke(); }
  // volcano / Fuji icons
  for (const [lx, ly, rr, big] of JP_VOLCANOES) {
    const x = X(lx), y = Y(ly), R = rr * k;
    ctx.fillStyle = 'rgba(40,60,30,0.25)'; ctx.beginPath(); ctx.arc(x + R * 0.15, y + R * 0.2, R * 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = big ? '#7f8fae' : '#7a5a46'; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.fillStyle = big ? '#f6fafe' : '#5a3a2e'; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, q = big ? (i % 2 ? 0.32 : 0.62) : 0.45; ctx.lineTo(x + Math.cos(a) * R * q, y + Math.sin(a) * R * q); }
    ctx.closePath(); ctx.fill();
    if (!big) { ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(x, y, R * 0.2, 0, TAU); ctx.fill(); }
  }
}
const shadeCss = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; };

// Hi-res map of one lon/lat window, painted at the full canvas size in the same style as drawEarth.
// The game drapes it on a patch of the sphere (e.g. lon 122–150, lat 46–24 on a 2048×1640 canvas).
export function drawRegion(ctx, w, h, lonW, latN, lonE, latS) {
  const kx = w / (lonE - lonW), ky = h / (latN - latS), k = (kx + ky) / 2, S = w / 2048;
  const X = (lon) => (lon - lonW) * kx, Y = (lat) => (latN - lat) * ky;
  const r = rng(4242 + Math.round(lonW * 7 + latN * 13));
  const hasFilter = typeof ctx.filter === 'string';
  const blur = (px) => { if (hasFilter) ctx.filter = px > 0 ? `blur(${px}px)` : 'none'; };
  const inView = (p) => { for (let i = 0; i < p.length; i += 2) if (p[i] > lonW - 3 && p[i] < lonE + 3 && p[i + 1] < latN + 3 && p[i + 1] > latS - 3) return true; return false; };
  const polyTo = (path, p) => { path.moveTo(X(p[0]), Y(p[1])); for (let i = 2; i < p.length; i += 2) path.lineTo(X(p[i]), Y(p[i + 1])); path.closePath(); };
  ctx.save();
  // ---- ocean: same latitude gradient as drawEarth so the patch blends into the globe
  const og = ctx.createLinearGradient(0, Y(90), 0, Y(-90));
  og.addColorStop(0, '#5aa6dc'); og.addColorStop(0.12, '#2f7fc8'); og.addColorStop(0.32, '#1d63b3'); og.addColorStop(0.5, '#1a5cae');
  og.addColorStop(0.68, '#1d63b3'); og.addColorStop(0.86, '#2f7fc8'); og.addColorStop(1, '#6cb0e0');
  ctx.fillStyle = og; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    const x = r() * w, y = r() * h, s = k * (0.4 + r() * 1.4);
    ctx.fillStyle = r() < 0.5 ? 'rgba(10,40,110,0.06)' : 'rgba(120,190,255,0.05)';
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 1.2, y + s * 0.6); ctx.lineTo(x - s * 1.1, y + s * 0.7); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2 * S; ctx.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * h, s = (6 + r() * 8) * S;
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s / 2, y - s * 0.6, x, y); ctx.quadraticCurveTo(x + s / 2, y - s * 0.6, x + s, y); ctx.stroke();
  }
  // ---- land paths (only outlines near the window)
  const land = new Path2D(), lakes = new Path2D();
  for (const p of LAND) if (inView(p)) polyTo(land, p);
  for (const [lx, ly, rr] of ISLETS) if (lx > lonW - 2 && lx < lonE + 2 && ly < latN + 2 && ly > latS - 2) {
    land.moveTo(X(lx + rr), Y(ly)); land.ellipse(X(lx), Y(ly), rr * kx, rr * ky, 0, 0, TAU); land.closePath();
  }
  for (const p of LAKES) if (inView(p)) polyTo(lakes, p);
  // shallows
  ctx.lineJoin = 'round';
  blur(14 * S); ctx.strokeStyle = 'rgba(90,180,230,0.45)'; ctx.lineWidth = k * 0.9; ctx.stroke(land);
  blur(6 * S); ctx.strokeStyle = 'rgba(130,215,240,0.55)'; ctx.lineWidth = k * 0.38; ctx.stroke(land);
  blur(0); ctx.strokeStyle = 'rgba(170,235,245,0.75)'; ctx.lineWidth = k * 0.12; ctx.stroke(land);
  // ---- land base gradient (same stops as drawEarth)
  const lg = ctx.createLinearGradient(0, Y(90), 0, Y(-90));
  for (const [lat, c] of [[90, '#f4f8fb'], [77, '#eef3f4'], [72, '#b8c49a'], [66, '#7fa86a'], [58, '#4a8f52'], [50, '#56a04a'], [42, '#6cbf4a'], [32, '#86c44e'], [20, '#5cb244'],
    [8, '#33993c'], [0, '#2f963a'], [-10, '#3aa040'], [-22, '#6cb84a'], [-35, '#7cc24e'], [-45, '#6cb04e'], [-54, '#86a868'], [-60, '#dfe8ea'], [-64, '#f4f8fb'], [-90, '#f7fafc']]) lg.addColorStop((90 - lat) / 180, c);
  ctx.fillStyle = lg; ctx.fill(land);
  ctx.save(); ctx.clip(land);
  paintJapan(ctx, X, Y, k, r, true);
  for (let i = 0; i < 9000; i++) { // low-poly speckle
    const x = r() * w, y = r() * h, s = (3 + r() * 7) * S;
    ctx.fillStyle = r() < 0.55 ? 'rgba(0,40,0,0.06)' : 'rgba(255,255,220,0.07)';
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.7); ctx.lineTo(x - s, y + s * 0.7); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // ---- lakes + crisp toy coastline
  ctx.fillStyle = '#3b8fd4'; ctx.fill(lakes);
  ctx.strokeStyle = 'rgba(170,235,245,0.7)'; ctx.lineWidth = 2 * S; ctx.stroke(lakes);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.6 * S; ctx.stroke(land);
  // ---- grid, matching drawEarth's 15° lines
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1.4 * S;
  for (let lon = Math.ceil(lonW / 15) * 15; lon <= lonE; lon += 15) { ctx.beginPath(); ctx.moveTo(X(lon), 0); ctx.lineTo(X(lon), h); ctx.stroke(); }
  for (let lat = Math.ceil(latS / 15) * 15; lat <= latN; lat += 15) { ctx.beginPath(); ctx.moveTo(0, Y(lat)); ctx.lineTo(w, Y(lat)); ctx.stroke(); }
  // ---- shinkansen lines
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of JP_RAIL) {
    ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[1])); for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3.2 * S; ctx.setLineDash([]); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,90,190,0.85)'; ctx.lineWidth = 1.6 * S; ctx.setLineDash([7 * S, 6 * S]); ctx.stroke();
  }
  ctx.setLineDash([]);
  // ---- labels
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const [t, lx, ly, sz, kind, side] of JP_LABELS) {
    if (lx < lonW || lx > lonE || ly > latN || ly < latS) continue;
    const x = X(lx), y = Y(ly), fs = sz * S;
    if (kind === 's') {
      ctx.font = `800 ${fs}px ${ROUND_FONT}`; ctx.fillStyle = 'rgba(210,235,255,0.6)'; ctx.fillText(t, x, y);
      continue;
    }
    if (kind === 'r') {
      ctx.font = `800 ${fs}px ${ROUND_FONT}`; ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(40,90,40,0.35)'; ctx.strokeText(t, x, y);
      ctx.fillStyle = 'rgba(255,255,240,0.7)'; ctx.fillText(t, x, y);
      continue;
    }
    if (kind === 'c') {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, fs * 0.32, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8463a'; ctx.beginPath(); ctx.arc(x, y, fs * 0.2, 0, TAU); ctx.fill();
    }
    const sd = side || (kind === 'm' ? 'b' : 'a');
    const tx = sd === 'l' ? x - fs * 0.45 : sd === 'r' ? x + fs * 0.45 : x, ty = sd === 'b' ? y + fs * 0.95 : sd === 'a' ? y - fs * 0.95 : y;
    ctx.textAlign = sd === 'l' ? 'right' : sd === 'r' ? 'left' : 'center';
    ctx.font = `800 ${fs}px ${ROUND_FONT}`; ctx.lineWidth = fs * 0.28; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.strokeText(t, tx, ty);
    ctx.fillStyle = kind === 'm' ? '#5a3a2a' : '#2a3242'; ctx.fillText(t, tx, ty);
    ctx.textAlign = 'center';
  }
  ctx.restore();
}

// =====================================================================  PLACEMENTS
// Sizes are in world units (1 = 6.371 km) and are the item's max dimension × scale, i.e. what the game compares
// with the ball (pick-up when size < 1.45 × ball radius). The ball enters at radius 2 (Ø4) in Yokohama; goals by
// diameter: 16 → 47 (日本), 157 (アジア), 470 (世界), 940 (地球). So: Tokyo/Yokohama 0.5–2.5, Honshu 1.5–6,
// outer Japan & its seas 4–12, Fuji ≈18 and the Japan Alps ≈26 as late Japan targets; East Asia 8–40,
// the rest of Asia/Oceania 20–80, other continents 40–200, and 150–450 giants towards the far side.
// Every entry is resolved here to an exact spot (deterministic jitter, re-rolled onto land or sea with isLand),
// so `count` is 1 and `spread` 0. Shinkansen also carry `toward: [lat, lon]` — the next station on their line —
// for an engine that wants to run them along the track instead of a random great circle.
const YOKO = [35.45, 139.64];
const D2R = PI / 180;
const angDist = (la1, lo1, la2, lo2) => {
  const a = Math.sin(((la2 - la1) * D2R) / 2) ** 2 + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.sin(((lo2 - lo1) * D2R) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / D2R;
};
const dYoko = (lat, lon) => angDist(lat, lon, YOKO[0], YOKO[1]);
// proto max dimension at scale 1 (largest variant) — keep in sync when a proto changes size
const DIM = { mt_fuji: 26, tokyo_tower: 10.96, skytree: 15.49, torii: 6.65, osaka_castle: 9.57, kinkakuji: 8.8, shinkansen: 10.17, pagoda: 8.05, deer: 3.07, sushi_giant: 3.08, sakura: 4.64, daruma: 2.16, maneki: 2.88, minka: 5.2, ramen: 3.4, landmark_tower: 12.67, cosmo_clock: 11.48, rainbow_bridge: 17.4, kaminarimon: 6.8, kamakura_buddha: 5.27, onigiri: 2.06, dango: 3, jihanki: 2.04, clock_tower: 7.8, cow: 3.2, lavender: 10.4, higuma: 3.48, nebuta: 6.47, kanto_lantern: 7.79, tanabata: 7.31, apple: 2.1, tanbo: 8, nikko_gate: 9.94, gassho: 5.8, matsumoto_castle: 11, himeji_castle: 12, kumamoto_castle: 11.24, senbon_torii: 11.62, daibutsu_hall: 11.4, takoyaki: 3.28, yatai: 3.93, kobe_tower: 10.52, floating_torii: 11.8, uzushio: 12.6, udon: 3.4, sakurajima: 40, shurijo: 11.1, shisa: 2.6, ferry: 10.35, onsen: 6.21, jp_alps: 66.85, ryuhyo: 12.32, city: 14, forest: 13.59, jungle: 15.18, fishing_boat: 4.4, sailboat: 5.2, dolphin: 3.58, sea_turtle: 3.98, great_wall: 20, taj_mahal: 22, petronas: 24.4, temple_thai: 15, panda: 4.3, elephant: 7.93, burj: 36.45, camel: 6.06, himalaya: 126.72, temple_heaven: 14.16, merlion: 10.95, taipei101: 24.4, ger: 5.1, eiffel: 31.27, big_ben: 27.9, pisa: 16.63, colosseum: 26.57, windmill: 17.48, tulips: 10, onion_dome: 20, castle: 24.7, alps: 107.77, parthenon: 22, stonehenge: 18.6, pyramid: 30, sphinx: 21.1, giraffe: 14.94, baobab: 13.51, kilimanjaro: 72, zebra: 4.96, lion: 6.07, acacia: 9.75, liberty: 26.45, golden_gate: 61.8, skyscraper_ny: 40.2, redeemer: 36.88, moai: 9.5, cactus: 10.32, chichen_itza: 32.2, grand_canyon: 120, rockies: 135.36, andes: 144.48, totem: 9.3, llama: 4.88, opera_house: 24, uluru: 48, kangaroo: 5.14, koala: 7.67, coral: 15, sheep: 2.72, whale: 15.86, cruise_liner: 20.5, cargo_ship: 18, airplane: 13.21, iceberg: 24, penguin: 3.62, polar_bear: 6.8, island: 16.8, cloud: 37.97, volcano: 40, rocket: 26.04, ice_sheet: 139.87, balloon: 9, birds: 11.86, lighthouse: 8.83 };
const SURFACE = { whale: 'sea', cruise_liner: 'sea', cargo_ship: 'sea', fishing_boat: 'sea', sailboat: 'sea', dolphin: 'sea', sea_turtle: 'sea', iceberg: 'sea', island: 'sea', coral: 'sea',
  ferry: 'sea', uzushio: 'sea', ryuhyo: 'sea', airplane: 'air', cloud: 'air', balloon: 'air', birds: 'air' };
const MOVE = { whale: 'sail', cruise_liner: 'sail', cargo_ship: 'sail', fishing_boat: 'sail', sailboat: 'sail', dolphin: 'sail', sea_turtle: 'sail', ferry: 'sail', shinkansen: 'sail',
  airplane: 'fly', cloud: 'fly', balloon: 'fly', birds: 'fly' };
const PL = [];
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
const JR = rng(20240611);
// put n copies of `id` within `sp`° of (lat, lon), each sized lo..hi world units. sp = 0 → exactly there, no surface check.
function put(id, lat, lon, n, sp, lo, hi = lo, extra) {
  const on = SURFACE[id] || 'land', dim = DIM[id] || 10;
  for (let i = 0; i < n; i++) {
    let la = lat, ln = lon;
    if (sp > 0) {
      for (let t = 0; t < 16; t++) {
        const a = JR() * TAU, d = Math.sqrt(JR()) * sp;
        la = Math.max(-88, Math.min(88, lat + Math.sin(a) * d)); ln = lon + (Math.cos(a) * d) / Math.max(0.2, Math.cos(la * D2R));
        if (on === 'air' || (on === 'sea') !== isLand(la, ln)) break;
        if (t === 15) { la = lat; ln = lon; }
      }
    }
    const e = { id, lat: r3(la), lon: r3(((ln + 540) % 360) - 180), count: 1, spread: 0, scale: r3((lo + (hi - lo) * JR()) / dim), on };
    if (MOVE[id]) e.move = MOVE[id];
    if (extra) Object.assign(e, extra);
    PL.push(e);
  }
}
// Japan size curve: grows from ≈1 around Yokohama to ≈9.5 at Okinawa / eastern Hokkaido
const J = (lat, lon) => { const d = dYoko(lat, lon); return Math.min(9.5, 1 + 0.42 * d + 0.035 * d * d); };
const jp = (id, lat, lon, n, sp, k) => { const s = J(lat, lon) * k; put(id, lat, lon, n, sp, Math.max(0.5, s * 0.8), Math.max(0.65, s * 1.2)); };
const FOODS = ['sushi_giant', 'ramen', 'onigiri', 'dango', 'daruma', 'maneki', 'jihanki'];

// ---------------- JAPAN · Tokyo / Yokohama — the ball can start eating right away (0.5–2.6)
for (const [la, lo] of [[35.45, 139.64], [35.68, 139.75], [35.6, 139.6], [35.75, 139.85], [35.55, 139.45], [35.35, 139.55], [35.85, 139.6], [35.65, 140.05], [35.3, 139.65], [35.9, 139.95], [35.52, 139.72]]) {
  put('sushi_giant', la, lo, 3, 0.16, 0.55, 0.95); put('onigiri', la, lo, 3, 0.16, 0.5, 0.8); put('dango', la, lo, 2, 0.16, 0.5, 0.8); put('ramen', la, lo, 2, 0.16, 0.7, 1.0);
  put('daruma', la, lo, 2, 0.16, 0.6, 0.95); put('maneki', la, lo, 2, 0.16, 0.6, 0.95); put('jihanki', la, lo, 3, 0.16, 0.5, 0.8); put('sakura', la, lo, 3, 0.18, 1.0, 1.6);
  put('minka', la, lo, 2, 0.18, 1.0, 1.6); put('city', la, lo, 3, 0.15, 1.6, 2.5); put('torii', la, lo, 1, 0.16, 1.0, 1.4);
}
put('tokyo_tower', 35.659, 139.745, 1, 0, 2.6); put('skytree', 35.71, 139.811, 1, 0, 3.2); put('landmark_tower', 35.455, 139.632, 1, 0, 2.0); put('cosmo_clock', 35.456, 139.638, 1, 0, 1.3);
put('rainbow_bridge', 35.636, 139.763, 1, 0, 2.2); put('kaminarimon', 35.711, 139.796, 1, 0, 1.0); put('kamakura_buddha', 35.317, 139.536, 1, 0, 1.4); put('pagoda', 35.714, 139.795, 1, 0, 1.5);
put('torii', 35.676, 139.699, 1, 0, 1.4); put('city', 35.69, 139.72, 6, 0.12, 2.2, 2.6); put('city', 35.46, 139.62, 3, 0.08, 2.0, 2.5);
put('fishing_boat', 35.45, 139.82, 8, 0.12, 0.6, 1.0); put('sailboat', 35.22, 139.45, 5, 0.18, 0.6, 0.9); put('ferry', 35.38, 139.78, 3, 0.1, 1.5, 2.2); put('dolphin', 35.05, 139.6, 3, 0.25, 0.8, 1.2);
// ---------------- JAPAN · Kanto ring and the rest of the islands (generic mix, size follows J())
const JPC = [[35.6, 140.12], [36.08, 140.1], [36.37, 140.47], [36.56, 139.88], [36.35, 139.05], [35.99, 139.08], [35.23, 139.1], [35.1, 140.0], [35.5, 140.4], [35.95, 139.4],
  [34.85, 139.0], [35.66, 138.57], [36.3, 139.8], [34.97, 138.38], [34.71, 137.73], [35.18, 136.91], [35.42, 136.76], [36.65, 138.19], [36.24, 137.97], [36.7, 137.21],
  [36.56, 136.65], [36.06, 136.22], [37.9, 139.02], [37.4, 138.85], [35.5, 137.5], [35.01, 135.77], [34.69, 135.5], [34.69, 135.19], [34.68, 135.83], [34.23, 135.17],
  [34.73, 136.51], [34.48, 136.72], [35.0, 135.9], [34.82, 134.69], [34.66, 133.92], [34.39, 132.46], [35.47, 133.05], [35.5, 134.23], [34.18, 131.47], [34.48, 133.36],
  [35.36, 132.75], [34.34, 134.05], [33.84, 132.77], [33.56, 133.53], [34.07, 134.55], [33.22, 132.56], [33.59, 130.4], [33.88, 130.88], [32.8, 130.71], [32.75, 129.87],
  [33.24, 131.61], [31.91, 131.42], [31.6, 130.56], [33.25, 130.3], [37.75, 140.47], [37.4, 140.39], [38.27, 140.87], [38.25, 140.34], [39.7, 141.15], [39.72, 140.1],
  [40.82, 140.74], [40.51, 141.49], [38.9, 139.84], [37.49, 139.93], [43.06, 141.35], [43.77, 142.36], [41.77, 140.73], [42.92, 143.2], [42.98, 144.38], [44.02, 144.27],
  [45.3, 141.8], [42.63, 141.6], [43.33, 145.4], [26.3, 127.8], [26.6, 127.98], [24.36, 124.18], [28.35, 129.45]];
for (const [la, lo] of JPC) {
  const sp = la > 41.5 ? 0.5 : la < 29 ? 0.12 : 0.32;
  jp('sakura', la, lo, 2, sp, 0.6); jp('minka', la, lo, 1, sp, 0.6); jp('tanbo', la, lo, 1, sp, 0.9); jp('city', la, lo, 2, sp * 0.6, 1.2);
  jp('forest', la, lo, 1, sp * 1.4, 1.4); jp('torii', la, lo, 1, sp, 0.5);
  jp(FOODS[(JR() * FOODS.length) | 0], la, lo, 1, sp, 0.3);
}
// Fuji (a mid-phase target: pick-up at Ø≈25) and the Japan Alps (Ø≈36)
put('mt_fuji', 35.36, 138.73, 1, 0, 18); put('jp_alps', 36.3, 137.65, 1, 0, 26);
put('forest', 35.45, 138.95, 3, 0.25, 2.6, 3.4); put('onsen', 35.23, 139.03, 2, 0.06, 1.8, 2.2); put('torii', 35.205, 139.025, 1, 0, 1.2);
put('nikko_gate', 36.758, 139.599, 1, 0, 2.4); put('forest', 36.8, 139.5, 3, 0.25, 2.6, 3.4); put('onsen', 36.62, 138.6, 2, 0.08, 1.8, 2.2);
put('daruma', 36.32, 139.0, 6, 0.18, 0.8, 1.4); put('tanbo', 36.1, 139.7, 6, 0.4, 1.8, 2.6);
// Chubu
put('matsumoto_castle', 36.239, 137.969, 1, 0, 3.0); put('gassho', 36.257, 136.906, 7, 0.12, 1.8, 2.4); put('onsen', 36.73, 138.46, 3, 0.1, 2.0, 2.5);
put('tanbo', 37.8, 139.1, 6, 0.35, 2.5, 3.5); put('forest', 36.0, 137.8, 4, 0.5, 3.5, 4.5); put('forest', 35.3, 136.3, 3, 0.4, 3.2, 4.2);
// Kansai
put('kinkakuji', 35.039, 135.729, 1, 0, 3.0); put('senbon_torii', 34.967, 135.773, 2, 0.04, 2.4, 2.8); put('torii', 35.0, 135.77, 4, 0.15, 1.3, 1.6); put('pagoda', 34.98, 135.747, 1, 0, 2.4);
put('daibutsu_hall', 34.689, 135.84, 1, 0, 3.6); put('pagoda', 34.68, 135.835, 1, 0, 2.3); put('deer', 34.685, 135.84, 24, 0.12, 0.8, 1.2);
put('osaka_castle', 34.687, 135.526, 1, 0, 3.8); put('takoyaki', 34.67, 135.5, 14, 0.15, 1.0, 1.6); put('yatai', 34.67, 135.5, 8, 0.15, 1.4, 2.0);
put('kobe_tower', 34.683, 135.186, 1, 0, 2.6); put('himeji_castle', 34.839, 134.694, 1, 0, 4.2); put('sailboat', 35.25, 136.1, 3, 0.08, 1.0, 1.3);
put('forest', 34.1, 135.8, 4, 0.35, 3.8, 5.0);
// Chugoku
put('floating_torii', 34.296, 132.318, 1, 0, 3.4); put('pagoda', 34.298, 132.325, 1, 0, 2.2); put('deer', 34.29, 132.31, 6, 0.06, 1.0, 1.3);
put('camel', 35.54, 134.23, 3, 0.05, 1.6, 2.0); put('torii', 35.402, 132.685, 1, 0, 2.2); put('forest', 35.0, 133.0, 5, 0.5, 4.0, 5.5);
// Shikoku
put('uzushio', 34.24, 134.66, 3, 0.08, 5, 7); put('udon', 34.25, 133.9, 10, 0.25, 3.5, 4.5); put('onsen', 33.85, 132.79, 1, 0, 4);
put('fishing_boat', 33.25, 133.6, 6, 0.45, 3, 4); put('whale', 32.85, 133.6, 4, 0.6, 10, 13); put('forest', 33.7, 133.3, 4, 0.5, 6, 8);
// Kyushu
put('kumamoto_castle', 32.806, 130.706, 1, 0, 7); put('sakurajima', 31.58, 130.66, 1, 0, 11.5); put('volcano', 32.88, 131.1, 1, 0, 9);
put('onsen', 33.28, 131.5, 4, 0.12, 4, 5); put('yatai', 33.59, 130.4, 8, 0.12, 3.5, 4.5); put('ramen', 33.59, 130.42, 6, 0.15, 2.5, 3.5);
put('rocket', 30.4, 130.97, 1, 0, 9); put('forest', 30.35, 130.53, 3, 0.1, 7, 9); put('sea_turtle', 30.45, 130.35, 4, 0.2, 4, 5); put('balloon', 33.25, 130.3, 4, 0.3, 4, 5);
put('forest', 32.4, 131.1, 4, 0.5, 6.5, 8.5); put('tanbo', 33.0, 130.6, 4, 0.3, 4.5, 6);
// Okinawa & the southern islands
put('shurijo', 26.217, 127.719, 1, 0, 7); put('shisa', 26.4, 127.8, 9, 0.25, 3.5, 4.5); put('shisa', 24.36, 124.18, 3, 0.08, 3.5, 4.5);
put('sea_turtle', 26.3, 127.5, 10, 0.6, 4, 6); put('coral', 26.2, 127.3, 8, 0.5, 6, 9); put('island', 26.2, 127.3, 3, 0.3, 7, 9); put('island', 24.4, 124.0, 3, 0.5, 7, 10);
put('island', 24.75, 125.2, 2, 0.3, 7, 10); put('whale', 26.0, 127.0, 4, 0.8, 11, 14); put('dolphin', 26.6, 127.6, 4, 0.5, 4, 5); put('sailboat', 26.1, 127.6, 3, 0.4, 4, 5);
put('ferry', 26.8, 128.4, 2, 0.6, 5, 6); put('coral', 24.3, 124.5, 4, 0.5, 6, 9);
// Tohoku
put('nebuta', 40.82, 140.74, 5, 0.22, 3.5, 4.5); put('apple', 40.6, 140.45, 10, 0.3, 1.5, 2.2); put('kanto_lantern', 39.72, 140.1, 5, 0.2, 3.5, 4.5);
put('tanabata', 38.27, 140.87, 6, 0.18, 3, 4); put('tanbo', 39.3, 140.3, 8, 0.6, 3.5, 5); put('forest', 39.6, 140.9, 6, 0.8, 5, 7); put('onsen', 38.14, 140.45, 3, 0.15, 3, 3.5);
put('island', 38.35, 141.1, 4, 0.12, 2, 3);
// Hokkaido
put('clock_tower', 43.0625, 141.3536, 1, 0, 4.5); put('ramen', 43.06, 141.35, 4, 0.2, 2.5, 3); put('sushi_giant', 43.19, 141.0, 4, 0.12, 2, 2.5);
put('cow', 42.9, 143.2, 10, 0.4, 4, 5); put('cow', 43.35, 144.9, 8, 0.35, 4, 5); put('cow', 43.4, 142.0, 6, 0.4, 4, 5);
put('lavender', 43.4, 142.4, 8, 0.3, 5, 7); put('higuma', 44.05, 145.0, 4, 0.25, 4, 6); put('higuma', 43.65, 142.85, 4, 0.3, 4, 6); put('higuma', 42.6, 142.9, 2, 0.3, 4, 6);
put('forest', 43.6, 142.9, 3, 0.4, 8, 11); put('forest', 42.8, 142.7, 2, 0.4, 8, 11); put('forest', 44.4, 142.3, 3, 0.5, 8, 11); put('tanbo', 43.3, 141.6, 4, 0.3, 5, 6);
put('ryuhyo', 44.4, 144.2, 8, 0.6, 7, 10); put('lighthouse', 45.52, 141.93, 1, 0, 4); put('lighthouse', 41.8, 140.7, 1, 0, 3.5);
// shinkansen along the main lines (move: sail; `toward` = next station)
for (const line of JP_RAIL) {
  for (let i = 0; i + 3 < line.length; i += 2) {
    if (i % 4 && line.length > 12) continue; // every other leg on the long lines
    const t = 0.3 + JR() * 0.4, lo = line[i] + (line[i + 2] - line[i]) * t, la = line[i + 1] + (line[i + 3] - line[i + 1]) * t;
    const s = Math.max(1.6, Math.min(5, J(la, lo) * 0.6));
    put('shinkansen', r3(la), r3(lo), 1, 0, s * 0.9, s * 1.1, { toward: [line[i + 3], line[i + 2]] });
  }
}
// seas around Japan
const SEAJP = [[34.6, 139.6], [34.9, 140.6], [35.9, 141.2], [37.2, 141.4], [38.6, 142.2], [40.5, 142.2], [41.6, 141.0], [43.5, 140.6], [42.0, 143.6], [39.5, 139.5],
  [37.8, 137.5], [36.0, 135.5], [34.3, 134.0], [33.3, 135.2], [33.2, 132.5], [34.3, 130.4], [31.4, 131.5], [33.7, 136.6], [32.5, 129.3], [37.5, 135.0], [41.0, 139.5], [34.0, 133.3]];
for (const [la, lo] of SEAJP) {
  const s = J(la, lo);
  put('fishing_boat', la, lo, 2, 0.6, s * 0.4, s * 0.55); put('sailboat', la, lo, 1, 0.6, s * 0.45, s * 0.6); put('dolphin', la, lo, 1, 0.6, s * 0.45, s * 0.6);
}
put('ferry', 34.2, 133.0, 4, 0.5, 4, 5.5); put('ferry', 41.4, 140.8, 2, 0.2, 4, 5); put('ferry', 38.5, 138.6, 3, 0.8, 4.5, 6); put('ferry', 33.6, 132.5, 3, 0.5, 4.5, 6);
put('whale', 39.0, 143.5, 4, 1.2, 12, 15); put('whale', 42.0, 145.5, 3, 1.0, 12, 15); put('whale', 27.1, 142.4, 4, 0.8, 11, 14); put('whale', 37.5, 133.5, 2, 1.0, 12, 15);
put('island', 27.1, 142.2, 3, 0.4, 5, 7); put('island', 33.1, 139.8, 2, 0.3, 4, 5); put('island', 34.5, 139.4, 2, 0.3, 3, 4);
put('cargo_ship', 34.2, 138.5, 4, 1.0, 7, 10); put('cargo_ship', 33.5, 135.5, 2, 0.6, 7, 10); put('cruise_liner', 34.3, 139.9, 2, 0.6, 8, 11); put('cruise_liner', 33.8, 130.0, 1, 0.4, 8, 11);
put('airplane', 35.55, 139.78, 2, 0.6, 5, 7); put('airplane', 34.79, 135.44, 2, 0.6, 5, 7); put('airplane', 42.78, 141.69, 1, 0.5, 6, 8); put('airplane', 33.59, 130.45, 1, 0.5, 6, 8);
put('birds', 36, 139, 3, 1.5, 3, 4); put('birds', 43.2, 144.5, 2, 0.8, 4, 6); put('birds', 33, 131, 2, 1.0, 4, 6);
{ const rc = rng(777); for (let i = 0; i < 18; i++) { const la = 31 + rc() * 13, lo = 129 + rc() * 15, s = J(la, lo); put('cloud', r2(la), r2(lo), 1, 0, s * 1.5 + rc() * 4, s * 1.5 + 4); } }
put('cloud', 36.2, 138.2, 1, 0, 28); put('cloud', 39.5, 141.5, 1, 0, 30); put('cloud', 33.2, 132.5, 1, 0, 31);
const JAPAN_END = PL.length;

// ---------------- REST OF THE WORLD — size grows with distance from Yokohama
// base size (world units) by angular distance from Yokohama (degrees)
const BASE = [[0, 1.2], [3, 3], [8, 6], [15, 12], [25, 22], [40, 40], [70, 70], [110, 110], [150, 165], [180, 210]];
const baseSize = (lat, lon) => {
  const d = dYoko(lat, lon);
  for (let i = 1; i < BASE.length; i++) if (d <= BASE[i][0]) { const [d0, b0] = BASE[i - 1], [d1, b1] = BASE[i]; return b0 * Math.pow(b1 / b0, (d - d0) / (d1 - d0)); }
  return BASE[BASE.length - 1][1];
};
// how big each kind of thing is relative to the base size
const CLS = { city: 1, forest: 1.1, jungle: 1.1, island: 0.9, coral: 0.8, lighthouse: 0.5, pagoda: 0.6, sakura: 0.5, airplane: 0.9, birds: 0.5, balloon: 0.5, cloud: 2.0,
  whale: 1.0, cruise_liner: 0.9, cargo_ship: 0.85, dolphin: 0.4, sea_turtle: 0.4, iceberg: 1.6, penguin: 0.4, polar_bear: 0.55, panda: 0.45, elephant: 0.6, camel: 0.5,
  kangaroo: 0.45, koala: 0.4, sheep: 0.4, llama: 0.45, zebra: 0.5, lion: 0.5, giraffe: 0.7, acacia: 0.8, baobab: 0.9, cactus: 0.6, totem: 0.6, ger: 0.5, moai: 0.6,
  tulips: 0.8, windmill: 0.8, temple_heaven: 1.4, great_wall: 1.2, taipei101: 1.3, temple_thai: 1.2, petronas: 1.4, merlion: 1.0, taj_mahal: 1.5, burj: 1.6,
  onion_dome: 1.3, castle: 1.2, eiffel: 1.5, big_ben: 1.4, pisa: 1.2, colosseum: 1.4, parthenon: 1.3, stonehenge: 1.1, pyramid: 1.5, sphinx: 1.2, liberty: 1.5,
  golden_gate: 1.6, skyscraper_ny: 1.1, redeemer: 1.5, chichen_itza: 1.4, opera_house: 1.4, rocket: 1.2, himalaya: 2.6, alps: 2.2, kilimanjaro: 2.2,
  grand_canyon: 2.2, rockies: 2.4, andes: 2.5, uluru: 1.8, volcano: 1.6, ice_sheet: 2.4 };
const world = (id, lat, lon, n, sp, k = 1) => { const s = Math.min(390, baseSize(lat, lon) * (CLS[id] || 1) * k); put(id, lat, lon, n, sp, s * 0.85, s * 1.15); }; // ≤ 450
// legacy helpers used below: addR(…, k) scales relative to the class size; add(…, s) keeps the old per-id relative scale
const REF = { acacia: 1.6, alps: 1, andes: 1, balloon: 2.2, baobab: 1.6, big_ben: 1.5, burj: 1.1, cactus: 1.7, camel: 2.6, castle: 1.4, chichen_itza: 1, colosseum: 1.5, coral: 1.4, eiffel: 1.5, elephant: 2.4, ger: 2.2, giraffe: 1.3, golden_gate: 1.3, grand_canyon: 1, himalaya: 1, kangaroo: 2.4, kilimanjaro: 1, koala: 2.2, liberty: 1.6, lion: 2.6, llama: 3.2, merlion: 1, moai: 2.4, onion_dome: 1.4, opera_house: 1.3, panda: 1.4, parthenon: 1.4, penguin: 3.4, petronas: 1, pisa: 1.6, polar_bear: 2.6, pyramid: 1, redeemer: 1.6, rocket: 1.4, rockies: 1, sheep: 4.4, skyscraper_ny: 1, sphinx: 1, stonehenge: 1.6, taipei101: 1, taj_mahal: 1.2, temple_heaven: 1, temple_thai: 1, totem: 3, tulips: 2.2, uluru: 1.2, volcano: 1.2, windmill: 1.3, zebra: 2.6 };
const addR = (id, lat, lon, count = 1, spread = 0, k = 1) => world(id, lat, lon, count, spread, k);
const add = (id, lat, lon, count = 1, spread = 0, s = 1) => world(id, lat, lon, count, spread, s / (REF[id] || 1));

// ---------------- EAST & SOUTH ASIA, MIDDLE EAST ----------------
addR('city', 37.57, 126.98, 3, 0.3); addR('pagoda', 37.6, 127.5, 2, 0.8); addR('sakura', 37.2, 127.2, 4, 1.0); addR('city', 35.18, 129.07);
add('temple_heaven', 39.88, 116.41); addR('city', 39.95, 116.5, 4, 0.5);
{ const wall = [[39.8, 98.2], [38.9, 101.5], [38.3, 104.5], [38.6, 106.5], [39.5, 109.8], [40.3, 112.6], [40.4, 115.0], [40.43, 116.57], [40.2, 118.3], [40.0, 119.8]];
  for (let i = 0; i < wall.length - 1; i++) for (let t = 0; t < 2; t++) { const f = t / 2; add('great_wall', wall[i][0] + (wall[i + 1][0] - wall[i][0]) * f, wall[i][1] + (wall[i + 1][1] - wall[i][1]) * f); } }
addR('city', 31.23, 121.47, 5, 0.4); addR('city', 22.3, 114.17, 3, 0.3); addR('city', 23.13, 113.26, 2, 0.4);
add('panda', 30.66, 104.06, 10, 1.5, 1.4); add('panda', 31.5, 103.5, 4, 1.0, 1.4); addR('forest', 30.5, 103.5, 4, 1.5, 1.0);
addR('pagoda', 34.3, 108.9, 2, 0.6, 1.2); addR('pagoda', 30.25, 120.15, 1, 0.3, 1.2);
for (const [la, lo] of [[36, 114], [32, 112], [28, 113], [25, 105], [30, 115], [34, 118], [45.75, 126.6], [41.8, 123.4], [29.5, 106.5], [25.27, 110.29]]) { addR('city', la, lo, 1, 0.5); addR('forest', la, lo, 1, 1.5, 1.0); addR('pagoda', la, lo, 1, 1.0, 1.0); }
add('taipei101', 25.03, 121.56); addR('city', 24.5, 120.9, 1, 0.3); addR('forest', 23.5, 121, 2, 0.5);
add('ger', 47.9, 106.9, 6, 1.5, 1.5); add('ger', 44, 104, 4, 3, 1.6); add('camel', 43.5, 104, 8, 3, 1.5); add('camel', 40, 90, 4, 3, 1.6);
addR('city', 21.03, 105.85); addR('jungle', 16, 107, 3, 2); addR('city', 10.8, 106.7);
add('temple_thai', 13.75, 100.5); add('temple_thai', 18.8, 99.0, 2, 1.0, 0.7); add('temple_thai', 13.41, 103.87, 1, 0, 0.9); add('temple_thai', 21.17, 94.86, 3, 0.8, 0.6);
addR('city', 13.75, 100.6, 2, 0.4); add('elephant', 17, 99.5, 6, 2.5, 1.6); add('elephant', 21.5, 96, 2, 1.5, 1.6);
add('petronas', 3.16, 101.71); addR('city', 3.1, 101.6, 2, 0.3); addR('jungle', 4.5, 102, 4, 1.5);
add('merlion', 1.29, 103.85); addR('city', 1.35, 103.82);
addR('city', -6.2, 106.8, 2, 0.3); addR('jungle', 0.5, 114, 8, 3); addR('jungle', 0, 101.5, 5, 3); addR('jungle', -4.5, 138, 6, 3); addR('jungle', -2, 121, 2, 1.5);
add('volcano', -7.54, 110.44, 1, 0, 0.7); add('volcano', -6.1, 105.42, 1, 0, 0.6); add('volcano', -8.34, 115.5, 1, 0, 0.6); add('temple_thai', -7.6, 110.2, 1, 0, 0.8); add('elephant', 1, 101.5, 2, 1, 1.6);
addR('city', 14.6, 121.0); add('volcano', 13.26, 123.69, 1, 0, 0.6);
for (const [la, lo] of [[12, 121.5], [10, 123.6], [13, 124.6], [9.5, 118.5], [-8.6, 117], [5, 120], [-3.6, 128.5], [-6, 120.5]]) addR('island', la, lo, 2, 1.0, 0.8);
add('taj_mahal', 27.17, 78.04, 1, 0, 1.2); addR('city', 28.6, 77.2, 3, 0.5); addR('city', 19.07, 72.88, 3, 0.4); addR('city', 22.57, 88.36, 2, 0.4); addR('city', 12.97, 77.59, 2, 0.4); addR('city', 13.08, 80.27);
add('elephant', 11, 76.5, 4, 2, 1.8); add('elephant', 26.3, 92.5, 4, 1.5, 1.8); add('elephant', 7.8, 80.7, 2, 0.5, 1.8);
addR('forest', 22, 80, 4, 4, 1.0); addR('jungle', 11, 76, 2, 1.5); add('camel', 27, 71, 5, 2, 1.8); add('temple_thai', 22.5, 80.5, 1, 4, 0.8);
add('himalaya', 28.0, 86.9); add('himalaya', 30.5, 81, 1, 0, 0.8); add('himalaya', 28.2, 93.5, 1, 0, 0.7); add('himalaya', 35.8, 76.5, 1, 0, 0.75); add('himalaya', 33, 95, 1, 0, 0.55);
add('burj', 25.2, 55.27, 1, 0, 1.1); addR('city', 25.1, 55.2, 2, 0.3); add('camel', 23.5, 46, 12, 5, 1.9); addR('city', 24.7, 46.7); add('camel', 20, 52, 4, 3, 2);
addR('city', 35.7, 51.4, 2, 0.4); addR('city', 41.0, 29.0, 2, 0.3); add('balloon', 38.65, 34.85, 6, 1.5, 1.6); add('camel', 40, 62, 4, 3, 2); add('ger', 48, 70, 4, 4, 2.2);
addR('city', 33.3, 44.4); addR('city', 39.65, 66.96); addR('city', 43.24, 76.9); addR('city', 31.5, 74.3, 2, 0.4); addR('city', 24.86, 67.0);
for (const [la, lo] of [[60, 60], [58, 75], [60, 90], [62, 105], [60, 120], [62, 135], [55, 100], [53, 85], [56, 130], [64, 150], [58, 160], [66, 120], [52, 115]]) addR('forest', la, lo, 3, 4, 1.0);
add('polar_bear', 72, 128, 3, 3, 2.4); add('polar_bear', 75, 100, 3, 3, 2.4); add('polar_bear', 69.5, 170, 2, 2, 2.4);
add('volcano', 56.06, 160.64, 1, 0, 1.0); add('volcano', 53.3, 158.7, 1, 0, 0.7);
add('onion_dome', 55.75, 37.62, 1, 0, 1.4); add('onion_dome', 59.94, 30.31, 1, 0, 1.0); addR('city', 55.6, 37.8, 3, 0.5); addR('city', 59.9, 30.5); addR('city', 56.84, 60.6); addR('city', 55.0, 82.9);

// ---------------- OCEANIA & PACIFIC ----------------
add('opera_house', -33.857, 151.215, 1, 0, 1.3); addR('city', -33.8, 151.0, 3, 0.4); add('uluru', -25.34, 131.04, 1, 0, 1.2);
add('kangaroo', -27, 135, 20, 8, 2.4); add('kangaroo', -32, 146, 10, 4, 2.4); add('kangaroo', -22, 120, 6, 4, 2.4);
add('koala', -30, 152.5, 6, 2.5, 2.2); add('koala', -37.5, 145.5, 4, 1.5, 2.2);
addR('city', -37.81, 144.96, 2, 0.4); addR('city', -27.47, 153.03); addR('city', -31.95, 115.86); addR('city', -34.93, 138.6); addR('city', -12.46, 130.84);
add('coral', -17, 147.5, 8, 3, 1.4); add('coral', -21, 151.5, 4, 2, 1.4); addR('forest', -35, 149, 3, 2, 1.0); addR('jungle', -16, 145.3, 2, 1.0);
add('camel', -25, 128, 4, 6, 2.6); addR('lighthouse', -28.64, 153.64);
add('sheep', -43.5, 171.5, 12, 1.8, 3.2); add('sheep', -38.5, 176, 8, 1.5, 3.2); add('volcano', -39.16, 175.63, 1, 0, 0.6); add('alps', -43.6, 170.2, 1, 0, 0.5); addR('city', -36.85, 174.76);
for (const [la, lo] of [[-17.7, 178.2], [-13.8, -172], [-17.6, -149.5], [-21.2, -159.8], [-21.1, -175.2], [-16, 167], [-21.5, 165.5], [-9, 160], [7, 171], [1.9, -157.4],
  [7, 158], [7.4, 134.5], [13.4, 144.8], [-9, -140], [-17, -144], [-8, 179], [3, 173], [-14, -170], [10, 166], [-20, -155]]) addR('island', la, lo, 2, 2, 1.0);
add('volcano', 19.4, -155.3, 1, 0, 1.2); addR('island', 21, -157.5, 2, 1, 1.0); addR('dolphin', 20.5, -157, 3, 2); addR('sea_turtle', 21, -157.8, 3, 1.5, 1.2);
add('moai', -27.12, -109.37, 7, 0.15, 2.4); addR('island', -0.6, -90.5, 2, 0.8); addR('sea_turtle', -0.5, -91, 4, 1.2, 1.5);

// ---------------- EUROPE ----------------
add('eiffel', 48.858, 2.294, 1, 0, 1.5); addR('city', 48.86, 2.4, 3, 0.4); add('castle', 47.4, 1.0, 1, 0, 1.0);
add('big_ben', 51.5, -0.12, 1, 0, 1.5); addR('city', 51.5, -0.3, 3, 0.4); add('stonehenge', 51.18, -1.83, 1, 0, 1.6); add('castle', 55.95, -3.2, 1, 0, 1.0);
add('sheep', 53, -2.5, 6, 1.5, 4); add('sheep', 53.2, -8, 4, 1.2, 4); add('castle', 53, -8.5, 1, 0, 0.8);
add('pisa', 43.72, 10.4, 1, 0, 1.6); add('colosseum', 41.89, 12.49, 1, 0, 1.5); addR('city', 41.9, 12.6, 2, 0.3); addR('city', 45.46, 9.19, 2, 0.3); addR('city', 45.44, 12.33);
add('volcano', 40.82, 14.43, 1, 0, 0.6); add('volcano', 37.75, 15.0, 1, 0, 0.75);
add('windmill', 52.3, 4.9, 6, 1.0, 1.3); add('tulips', 52.4, 4.7, 6, 1.0, 2.2); addR('city', 52.37, 4.9); add('windmill', 39.4, -3.2, 4, 1.5, 1.2);
add('castle', 47.56, 10.75, 1, 0, 1.4); add('castle', 50.09, 14.4, 1, 0, 1.0); add('castle', 40.95, -4.12, 1, 0, 1.0); add('castle', 47.5, 19.04, 1, 0, 0.9);
add('alps', 46.5, 8.5); add('alps', 47, 12.5, 1, 0, 0.8); add('alps', 45.9, 6.9, 1, 0, 0.7); add('alps', 42.7, 0.5, 1, 0, 0.5); add('alps', 47, 25, 1, 0, 0.45); add('alps', 43, 43, 1, 0, 0.7);
add('alps', 64, 14, 1, 0, 0.6); add('alps', 60, 59.5, 1, 0, 0.5);
add('parthenon', 37.97, 23.73, 1, 0, 1.4); addR('city', 38.0, 23.8);
addR('city', 40.42, -3.7, 2, 0.4); addR('city', 41.39, 2.17); addR('city', 52.52, 13.4, 2, 0.4); addR('city', 48.14, 11.58); addR('city', 48.2, 16.37); addR('city', 52.23, 21.0);
addR('city', 59.33, 18.07); addR('city', 38.72, -9.14); addR('city', 50.45, 30.52); addR('city', 53.48, -2.24); addR('city', 50.85, 4.35); addR('city', 55.68, 12.57); addR('city', 59.91, 10.75); addR('city', 60.17, 24.94);
for (const [la, lo] of [[50, 10], [48, 20], [55, 25], [62, 16], [62, 27], [60, 10], [47, 2], [57, 40], [53, 50], [44, 22]]) addR('forest', la, lo, 3, 3, 1.0);
add('volcano', 63.63, -19.6, 1, 0, 1.0); addR('sheep', 64.5, -18, 3, 1.5, 1.4); add('polar_bear', 78.5, 17, 3, 2, 2.6);
for (const [la, lo] of [[43.4, -8.4], [48.4, -4.9], [57.6, -6.2], [58.0, 6.8], [36.0, -5.6], [54.5, 13.6]]) addR('lighthouse', la, lo);

// ---------------- AFRICA ----------------
add('pyramid', 29.98, 31.13, 1, 0, 1.0); add('pyramid', 29.4, 30.4, 1, 0, 0.85); add('pyramid', 28.8, 29.7, 1, 0, 0.7); add('sphinx', 30.55, 31.75, 1, 0, 1.0);
add('pyramid', 16.9, 33.7, 3, 1.5, 0.45); addR('city', 30.8, 31.0, 2, 0.3);
add('camel', 24, 10, 14, 8, 2.4); add('camel', 28, 0, 6, 5, 2.4); add('camel', 27, 28.5, 4, 2, 2.3); add('camel', 18, -10, 4, 3, 2.5); add('camel', 30.5, -6, 3, 1.5, 2.4);
addR('city', 31.63, -8.0); addR('city', 33.57, -7.6); addR('city', 36.75, 3.05); addR('city', 36.8, 10.18);
add('giraffe', -2.3, 34.8, 8, 3, 1.3); add('zebra', -2.3, 34.8, 14, 3, 2.6); add('lion', -2.3, 34.8, 6, 3, 2.6); add('acacia', -2.3, 34.8, 10, 4, 1.6); add('elephant', -2.5, 35.5, 6, 3, 2.4);
add('giraffe', 0.5, 37.5, 4, 2, 1.3); add('zebra', 0.5, 37.5, 6, 2, 2.6); add('acacia', 0.5, 37.5, 6, 2.5, 1.6); add('lion', 1, 36, 3, 2, 2.6);
add('giraffe', -20, 24, 3, 3, 1.3); add('acacia', -20, 24, 4, 3, 1.6); add('elephant', -19, 23, 3, 2, 2.4); add('zebra', -24, 31.5, 4, 1.5, 2.6); add('lion', -24, 31.5, 2, 1.5, 2.6);
add('acacia', 12, 20, 5, 6, 1.6); add('giraffe', 10, 15, 2, 4, 1.3);
add('kilimanjaro', -3.07, 37.35, 1, 0, 1.0);
add('baobab', -20.25, 44.42, 6, 1.5, 1.6); add('baobab', -5, 35, 4, 3, 1.6); add('baobab', 14.5, -16, 3, 1.5, 1.6); add('baobab', -20, 25, 3, 2, 1.6);
addR('jungle', -1, 22, 10, 5); add('elephant', 0, 18, 2, 3, 2.4); addR('jungle', 6, -6, 4, 3); addR('jungle', -18.9, 48, 2, 1.5);
addR('city', 6.5, 3.4, 2, 0.3); addR('city', 5.6, -0.2); addR('city', 14.7, -17.45); addR('city', 9.03, 38.74); addR('city', -1.29, 36.82); addR('city', -4.32, 15.3); addR('city', 15.5, 32.5); addR('city', -18.9, 47.5);
addR('city', -33.92, 18.42, 2, 0.3); addR('city', -26.2, 28.05, 2, 0.3); addR('city', -6.8, 39.28); add('penguin', -34.2, 18.5, 5, 0.5, 2.5); addR('lighthouse', -34.36, 18.47); addR('lighthouse', 31.2, 29.9);

// ---------------- AMERICAS ----------------
add('liberty', 40.69, -74.04, 1, 0, 1.6); add('skyscraper_ny', 40.75, -73.98, 10, 1.2, 1.0); add('skyscraper_ny', 41.88, -87.63, 4, 1.0, 0.8); addR('city', 40.7, -74.3, 2, 0.4);
add('golden_gate', 37.82, -122.48, 1, 0, 1.3); addR('city', 37.6, -122.2, 2, 0.4);
addR('city', 34.05, -118.24, 3, 0.4); addR('city', 47.6, -122.33); addR('city', 43.65, -79.38, 2, 0.3); addR('city', 45.5, -73.57); addR('city', 49.28, -123.12); addR('city', 29.76, -95.37);
addR('city', 25.76, -80.19); addR('city', 38.9, -77.04); addR('city', 42.36, -71.06); addR('city', 39.74, -104.99); addR('city', 33.75, -84.39); addR('city', 36.17, -115.14); addR('city', 32.78, -96.8);
addR('city', 19.43, -99.13, 3, 0.4); addR('city', 23.13, -82.38); addR('city', 20.97, -89.62); addR('city', 51.05, -114.07); addR('city', 61.2, -149.9);
add('grand_canyon', 36.1, -112.1); add('rockies', 40, -106); add('rockies', 47, -113, 1, 0, 0.9); add('rockies', 53, -118, 1, 0, 0.85); add('rockies', 63, -150, 1, 0, 0.8); add('rockies', 59, -135, 1, 0, 0.7);
add('cactus', 32, -111, 10, 3, 1.6); add('cactus', 27, -106, 8, 3, 1.7); add('cactus', 24, -102, 4, 3, 1.7); add('cactus', 35, -116, 4, 1.5, 1.6);
add('rocket', 28.57, -80.65, 1, 0, 1.4); add('rocket', 34.63, -120.6, 1, 0, 1.0); add('rocket', 45.96, 63.3, 1, 0, 1.0); add('rocket', 5.2, -52.8, 1, 0, 1.2);
add('chichen_itza', 20.68, -88.57); add('chichen_itza', 19.69, -98.84, 1, 0, 0.8); add('chichen_itza', 17.22, -89.62, 1, 0, 0.7);
for (const [la, lo] of [[55, -100], [52, -80], [58, -120], [50, -70], [62, -110], [48, -90], [60, -75], [65, -140], [54, -125], [45, -70], [35, -83], [45, -122]]) addR('forest', la, lo, 3, 4, 1.0);
add('totem', 54, -130, 4, 3, 3.0); add('totem', 58.3, -134.4, 2, 1, 3.0);
add('polar_bear', 58.77, -94.17, 4, 1.5, 2.6); add('polar_bear', 71, -105, 3, 3, 2.6); add('polar_bear', 70, -152, 2, 2, 2.6); add('polar_bear', 72, -25, 3, 2, 2.6); add('polar_bear', 75, -75, 2, 3, 2.6);
add('volcano', 46.2, -122.2, 1, 0, 0.7); add('volcano', 19.02, -98.62, 1, 0, 0.7); add('volcano', -0.68, -78.44, 1, 0, 0.8); add('volcano', -39.42, -71.94, 1, 0, 0.7);
add('balloon', 35.08, -106.65, 4, 1.0, 2.2);
add('redeemer', -22.95, -43.21, 1, 0, 1.6); addR('city', -22.9, -43.4, 2, 0.3); addR('city', -23.55, -46.63, 4, 0.8); addR('city', -34.6, -58.38, 3, 0.4); addR('city', -12.05, -77.04, 2, 0.3);
addR('city', 4.71, -74.07, 2, 0.3); addR('city', -33.45, -70.67, 2, 0.3); addR('city', 10.49, -66.88); addR('city', -15.8, -47.9); addR('city', -3.1, -60.02); addR('city', -12.97, -38.5); addR('city', -0.18, -78.47);
addR('jungle', -3, -60, 12, 7); addR('jungle', -8, -70, 6, 4); addR('jungle', 2, -55, 4, 3); addR('jungle', 9, -80, 2, 1.5); addR('jungle', 15, -88, 2, 1.5);
add('andes', -13, -72); add('andes', -20, -68); add('andes', -30, -69.5); add('andes', -40, -71.5, 1, 0, 0.8); add('andes', -48, -73, 1, 0, 0.8); add('andes', 2, -77, 1, 0, 0.8); add('andes', 8, -72, 1, 0, 0.7);
add('llama', -15, -70.5, 10, 3, 3.2); add('llama', -23, -66.5, 4, 2, 3.2); add('penguin', -52, -69, 5, 2, 3.4); add('sheep', -50, -70, 4, 2, 4.4); addR('forest', -42, -72.5, 2, 1.5);
for (const [la, lo] of [[17, -70], [24, -77], [13, -61.5], [18.3, -64.8], [12.2, -69]]) addR('island', la, lo, 2, 2, 1.0);
addR('lighthouse', 44.6, -63.5); addR('lighthouse', 41.0, -71.9); addR('lighthouse', 46.3, -124.0); addR('lighthouse', -34.9, -54.95);

// ---------------- OCEANS, SKY & POLES ----------------
for (const [la, lo, n, sp] of [[40, -150, 3, 15], [20, -120, 2, 10], [-40, -120, 3, 15], [50, -35, 3, 12], [-40, -20, 3, 12], [-30, 75, 3, 12], [-60, 30, 3, 15], [-60, 150, 3, 15],
  [38, 150, 2, 5], [55, -150, 2, 6], [22, -158, 2, 3], [-65, -60, 2, 6], [-20, 40, 2, 4], [60, 0, 2, 5], [10, 140, 2, 8]]) addR('whale', la, lo, n, sp);
for (const [la, lo, n, sp] of [[18, -75, 6, 5], [38, 5, 3, 3], [36, 22, 2, 2], [57, -137, 2, 2], [2, 106, 2, 2], [65, 5, 2, 3], [-20, -160, 2, 8], [24, 54, 1, 1.5], [-35, 155, 1, 3]]) addR('cruise_liner', la, lo, n, sp);
for (const [la, lo, n, sp] of [[35, 170, 3, 10], [30, -140, 3, 10], [4, 99, 3, 2], [5, 75, 4, 6], [20, 38.5, 2, 1.5], [35, 20, 3, 3], [40, -40, 4, 10], [8, -80, 2, 2],
  [15, 115, 4, 4], [30, 125, 3, 2.5], [-36, 20, 2, 3], [50, -5, 2, 2], [25, -90, 2, 3], [-25, -40, 2, 6], [-10, 100, 2, 6]]) addR('cargo_ship', la, lo, n, sp);
for (const [la, lo, n, sp] of [[30, 125, 2, 3], [37, 127, 2, 2], [22, 114, 2, 2], [1.3, 104, 2, 2], [25, 55, 2, 2], [28, 77, 2, 2], [51, 0, 3, 3], [48, 2, 2, 2], [40, -74, 3, 3],
  [34, -118, 2, 2], [41, -88, 2, 2], [-33.9, 151, 2, 2], [-23, -46, 2, 2], [-26, 28, 1, 2], [30, 31, 1, 2], [55, 37, 1, 2], [19, -99, 1, 2], [50, -30, 3, 15], [40, -170, 3, 15], [10, 90, 2, 10],
  [-10, -30, 2, 10], [60, 100, 2, 15], [-30, 120, 2, 10]]) addR('airplane', la, lo, n, sp);
for (const [la, lo, n, sp] of [[45, 10, 2, 8], [10, 20, 2, 10], [40, -95, 2, 10], [-10, -55, 2, 10], [55, 80, 2, 10], [-25, 135, 1, 8], [25, 80, 2, 8], [60, -110, 2, 10]]) addR('birds', la, lo, n, sp);
for (const [la, lo, n, sp] of [[75, -60, 4, 4], [78, 0, 3, 5], [82, -150, 3, 8], [85, 60, 3, 8], [-62, -50, 5, 6], [-65, 90, 4, 10], [-68, -150, 4, 10], [-62, 30, 3, 10], [55, -48, 2, 3], [-64, 160, 3, 8], [70, -165, 2, 4]]) addR('iceberg', la, lo, n, sp);
for (const [la, lo] of [[-72, -60], [-70, 10], [-68, 70], [-67, 140], [-76, 170], [-74, -120], [-71, -10], [-67, 100]]) addR('penguin', la, lo, 5, 4);
for (const [la, lo, s] of [[-80, 0, 1.3], [-82, 60, 1.4], [-80, 120, 1.3], [-84, 180, 1.5], [-80, -60, 1.3], [-80, -120, 1.4], [-88, 0, 1.5], [-75, 40, 1.0], [-72, -100, 1.0], [74, -40, 1.2], [68, -45, 1.0], [79, -50, 0.9]]) addR('ice_sheet', la, lo, 1, 0, s / 1.3);
{ const rc = rng(404); // clouds everywhere, growing with distance (Japan has its own above)
  for (let la = -55; la <= 65; la += 20) for (let lo = -180; lo < 180; lo += 24) {
    const lat = la + (rc() - 0.5) * 10, lon = lo + (rc() - 0.5) * 16, k = 0.8 + rc() * 0.4;
    if (dYoko(lat, lon) > 16) world('cloud', r2(lat), r2(lon), 1, 5, k);
  } }

export const PLACEMENTS = PL;
