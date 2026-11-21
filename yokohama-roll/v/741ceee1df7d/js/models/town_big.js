// town_big.js — the BIG things of Yokohama (≥ 12 m) for ハマころ！
// Signature landmarks of Minato Mirai, the harbour, Kannai and Chinatown, plus scattered filler buildings.
// Units: metres. Base on y = 0, centred on x/z, front faces +Z (ships: bow toward +Z).
import { box, cyl, cone, sphere, torus, lathe, extrude, beam, plane, group, repeat, merge, shade, mix, rng } from '../geo.js';

const PI = Math.PI, TAU = PI * 2, SQ2 = Math.SQRT2, C8 = Math.cos(PI / 8);

// ---------- palette ----------
const WARM = 0xffdb94;   // warm window light
const COOL = 0xd9edff;   // cool office light
const GOLD = 0xf0c02c;
const RED = 0xd42a1f;
const WHITE = 0xf4f3ee;
const STEEL = 0x8a929a;
const IRON = 0x34383e;
const ASPH = 0x4a4f56;
const RAIN = [0xff4f6a, 0xff9a3c, 0xffe14a, 0x5ee07a, 0x4cc4ff, 0x7a6cff, 0xff6fd8];

// ---------- helpers ----------
const lerp = (a, b, t) => a + (b - a) * t;

// Call fn(at, i, side) for evenly spaced slots along the chosen faces of a w × d footprint.
// at(off) gives {x, z, ry} for a part sitting `off` metres proud of that face, facing outward.
function onFaces({ w, d, cx = 0, cz = 0, sides = 'fblr', sp = 4, m = 2 }, fn) {
  const out = [];
  for (const s of sides) {
    const len = s === 'f' || s === 'b' ? w : d;
    const n = Math.max(1, Math.floor((len - 2 * m) / sp + 1e-6) + 1);
    const st = n > 1 ? (len - 2 * m) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? -len / 2 + m + i * st : 0;
      const at = (off) => (s === 'f' ? { x: cx + u, z: cz + d / 2 + off, ry: 0 }
        : s === 'b' ? { x: cx - u, z: cz - d / 2 - off, ry: PI }
          : s === 'r' ? { x: cx + w / 2 + off, z: cz - u, ry: PI / 2 }
            : { x: cx - w / 2 - off, z: cz + u, ry: -PI / 2 });
      out.push(fn(at, i, s, n));
    }
  }
  return out;
}
// rows of single window panes
function panes(cfg) {
  const { ys, pw = 1.6, ph = 1.8, col = WARM, glow = 0.85, off = 0.06 } = cfg;
  return onFaces(cfg, (at) => ys.map((y) => plane(pw, ph, col, { ...at(off), y, glow })));
}
// continuous horizontal window strips around a box
function bands({ w, d, cx = 0, cz = 0, ys, h = 1.4, col = COOL, glow = 0.8, off = 0.06, sides = 'fblr', inset = 0.6 }) {
  const out = [];
  for (const y of ys) for (const s of sides) {
    const len = s === 'f' || s === 'b' ? w : d;
    const o = s === 'f' ? { x: cx, z: cz + d / 2 + off } : s === 'b' ? { x: cx, z: cz - d / 2 - off, ry: PI }
      : s === 'r' ? { x: cx + w / 2 + off, z: cz, ry: PI / 2 } : { x: cx - w / 2 - off, z: cz, ry: -PI / 2 };
    out.push(plane(len - 2 * inset, h, col, { ...o, y, glow }));
  }
  return out;
}
// arched window outline (rectangle + round head), base at y = 0
function archPts(w, h, n = 3) {
  const r = w / 2, hr = h - r, pts = [[-r, 0], [r, 0], [r, hr]];
  for (let i = 1; i < n; i++) { const a = (i / n) * PI; pts.push([r * Math.cos(a), hr + r * Math.sin(a)]); }
  pts.push([-r, hr]);
  return pts;
}
const arch = (w, h, col, o = {}) => extrude(archPts(w, h, o.n || 3), o.t || 0.14, col, o);
// rows of arched windows (optionally on a light trim panel); ys are sill heights
function arches(cfg) {
  const { ys, aw = 1.4, ah = 2.8, col = WARM, glow = 0.85, trim = null, n = 3 } = cfg;
  return onFaces(cfg, (at) => ys.map((y) => [
    trim != null ? plane(aw + 0.7, ah + 0.5, trim, { ...at(0.03), y: y - 0.25 + (ah + 0.5) / 2 }) : null,
    arch(aw, ah, col, { ...at(0.1), y, glow, n }),
  ]));
}
// four-sided hipped roof (pyramid frustum) over a 2hx × 2hz footprint; k = top size ratio; base at o.y
function hip(hx, hz, h, k, col, o = {}) {
  return group(cyl(k * SQ2, SQ2, h, 4, col, { ry: PI / 4, y: h / 2, glow: o.glow }),
    { sx: hx, sz: hz, x: o.x, y: o.y, z: o.z, ry: o.ry });
}
// Chinese roof: concave green-tiled roof with a gold ridge, upturned ridge ends and eave corners
function cnRoof({ x = 0, y = 0, z = 0, hx, hz, h, col = 0x2e9a5e, ridge = GOLD, glow = 0.3, ry = 0 }) {
  const D = hz, H = h;
  const sec = [[-D, 0.22 * H], [-D * 0.86, 0], [D * 0.86, 0], [D, 0.22 * H], [D * 0.7, 0.26 * H], [D * 0.42, 0.47 * H],
    [D * 0.16, 0.84 * H], [0, H], [-D * 0.16, 0.84 * H], [-D * 0.42, 0.47 * H], [-D * 0.7, 0.26 * H]];
  const rt = Math.max(0.18, H * 0.14);
  const parts = [
    extrude(sec, hx * 2, col, { ry: PI / 2 }),
    box(hx * 1.7, rt * 1.2, rt, ridge, { y: H + rt * 0.3, glow }),
    box(hx * 2 + 0.05, H * 0.08, 0.12, 0xb8231a, { y: 0.06, z: D * 0.86 }),
    box(hx * 2 + 0.05, H * 0.08, 0.12, 0xb8231a, { y: 0.06, z: -D * 0.86 }),
  ];
  for (const s of [-1, 1]) {
    parts.push(beam([s * hx * 0.8, H + rt * 0.3, 0], [s * (hx * 0.85 + H * 0.35), H * 1.5, 0], rt, ridge, { glow }));
    for (const t of [-1, 1]) {
      parts.push(beam([s * (hx - 0.3), 0.2 * H, t * (D - 0.3)], [s * (hx + H * 0.3), 0.62 * H, t * (D + H * 0.2)], rt * 0.8, ridge, { glow }));
    }
  }
  return group(parts, { x, y, z, ry });
}
// abstract gold "character" built from strokes (plaques, signs) — a box set facing ±Z
function glyph(seed, s, col, glow, o = {}) {
  const r = rng(seed), t = s * 0.16, out = [];
  out.push(box(s * 0.9, t, t, col, { y: s * (0.32 - r() * 0.12), glow }));
  out.push(box(t, s * 0.95, t, col, { x: (r() - 0.5) * s * 0.3, glow }));
  out.push(box(s * 0.7, t, t, col, { y: -s * 0.3, x: (r() - 0.5) * s * 0.2, glow }));
  if (r() > 0.35) out.push(box(t, s * 0.5, t, col, { x: s * 0.33, y: -s * 0.05, rz: 0.55, glow }));
  if (r() > 0.35) out.push(box(t, s * 0.45, t, col, { x: -s * 0.33, y: s * 0.05, rz: -0.6, glow }));
  return group(out, o);
}
// seven-segment digits ("21:21") centred on the origin in the XY plane
const SEG7 = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
function digits(str, h, col, glow, o = {}) {
  const w = h * 0.55, t = h * 0.13, adv = w + h * 0.35, cw = h * 0.35, out = [];
  let width = 0;
  for (const ch of str) width += ch === ':' ? cw : adv;
  let x = -width / 2;
  for (const ch of str) {
    if (ch === ':') {
      out.push(box(t, t, t, col, { x: x + cw / 2, y: h * 0.2, glow }), box(t, t, t, col, { x: x + cw / 2, y: -h * 0.2, glow }));
      x += cw; continue;
    }
    const cx = x + adv / 2;
    const S = { a: [0, h / 2, w, t], d: [0, -h / 2, w, t], g: [0, 0, w, t], b: [w / 2, h / 4, t, h / 2],
      c: [w / 2, -h / 4, t, h / 2], e: [-w / 2, -h / 4, t, h / 2], f: [-w / 2, h / 4, t, h / 2] };
    for (const s of SEG7[+ch]) { const [sx, sy, sw, sh] = S[s]; out.push(box(sw, sh, t, col, { x: cx + sx, y: sy, glow })); }
    x += adv;
  }
  return group(out, o);
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
// a horizontal slab with a ship-plan outline, from y0 up by h
const slab = (L, B, y0, h, col, o = {}) => extrude(hullPlan(L, B, o.bow ?? 0.25, o.stern ?? 0.1), h, col,
  { rx: PI / 2, y: y0 + h / 2, z: o.z || 0, x: o.x || 0, glow: o.glow });
// a string of light bulbs (or signal flags) along a polyline
function lightString(pts, sp, size, cols, glow = 1, wire = 0x3a3a3a) {
  const out = []; let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / sp));
    out.push(beam(a, b, Math.max(0.08, size * 0.2), wire));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      out.push(box(size, size, size, cols[k++ % cols.length], { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), z: lerp(a[2], b[2], t), glow }));
    }
  }
  return out;
}
// porthole rows along both sides of a ship's parallel body
function portholes(B, ys, z0, z1, sp, col = WARM, s = 0.7, glow = 0.85) {
  const out = [];
  for (const y of ys) for (let z = z0; z <= z1 + 1e-6; z += sp) {
    out.push(plane(s, s, col, { x: B / 2 + 0.05, y, z, ry: PI / 2, glow }));
    out.push(plane(s, s, col, { x: -B / 2 - 0.05, y, z, ry: -PI / 2, glow }));
  }
  return out;
}

// red brick warehouse (赤レンガ倉庫): L long, 22 m deep, 18 m tall
function redBrick(L) {
  const BR = 0xb4452c, BRd = 0x8f3524, TR = 0xf4efe2, ROOF = 0x7d8389, D = 22, HW = 15, P = [];
  P.push(box(L, HW, D, BR, { y: HW / 2 }));
  P.push(box(L + 0.6, 1.3, D + 0.6, 0xa29e94, { y: 0.65 }));
  for (const y of [5.2, 10.1]) P.push(box(L + 0.3, 0.4, D + 0.3, TR, { y }));
  P.push(box(L + 0.9, 0.9, D + 0.9, TR, { y: HW - 0.25 }));
  P.push(box(L + 0.5, 0.8, D + 0.5, BRd, { y: HW - 1.1 }));
  // brick pilasters every few bays
  const nb = Math.round((L - 6) / 4);
  const sp = (L - 6) / nb;
  for (let i = 0; i <= nb; i += 3) {
    const x = -L / 2 + 3 + i * sp - sp / 2;
    if (x < -L / 2 + 1) continue;
    for (const s of [1, -1]) P.push(box(1.0, HW - 1.5, 0.5, BRd, { x, y: (HW - 1.5) / 2 + 0.6, z: s * (D / 2 + 0.2) }));
  }
  // grey low-pitched roof with skylight ridge and chimneys
  P.push(extrude([[-D / 2 - 0.9, 0], [D / 2 + 0.9, 0], [0, 2.75]], L + 1.4, ROOF, { ry: PI / 2, y: HW + 0.25 }));
  P.push(box(L * 0.8, 0.5, 1.2, 0x9aa1a7, { y: HW + 3.0 }));
  for (let x = -L / 2 + 10; x < L / 2 - 5; x += 22) P.push(box(1.6, 3, 1.6, BRd, { x, y: HW + 2.6, z: -4 }));
  // white-trimmed arched windows, three floors, front and back
  const ys = [1.7, 6.3, 11.1];
  const xs = []; for (let i = 0; i <= nb; i++) xs.push(-L / 2 + 3 + i * sp);
  for (const s of [1, -1]) {
    for (const x of xs) for (let f = 0; f < 3; f++) {
      const door = f === 0 && Math.round((x + L / 2) / sp) % 5 === 2;
      const aw = door ? 2.4 : 1.5, ah = door ? 3.4 : 2.9;
      P.push(plane(aw + 0.8, ah + 0.5, TR, { x, y: ys[f] - 0.25 + (ah + 0.5) / 2, z: s * (D / 2 + 0.03), ry: s > 0 ? 0 : PI }));
      P.push(arch(aw, ah, door ? 0xffc46a : WARM, { x, y: ys[f] - (door ? 1.3 : 0), z: s * (D / 2 + 0.1), ry: s > 0 ? 0 : PI, glow: 0.85 }));
    }
  }
  // gable-end windows
  P.push(arches({ w: L, d: D, sides: 'rl', sp: 4.2, m: 4, ys, aw: 1.5, ah: 2.9, trim: TR }));
  // iron balconies on the front (sea side), floors 2 and 3
  for (let i = 1; i + 1 <= nb; i += 5) {
    const x = (xs[i] + xs[i + 1]) / 2;
    for (const y of [5.6, 10.5]) {
      P.push(box(sp * 2 - 0.4, 0.25, 1.7, IRON, { x, y, z: D / 2 + 0.85 }));
      P.push(box(sp * 2 - 0.4, 0.12, 0.12, IRON, { x, y: y + 1.05, z: D / 2 + 1.65 }));
      P.push(box(sp * 2 - 0.4, 0.9, 0.05, 0x4a5058, { x, y: y + 0.55, z: D / 2 + 1.65 }));
      for (const e of [-1, 1]) P.push(box(0.12, 1.05, 1.7, IRON, { x: x + e * (sp - 0.25), y: y + 0.55, z: D / 2 + 0.85 }));
      P.push(beam([x - sp + 0.5, y - 1.4, D / 2 + 0.05], [x - sp + 0.5, y - 0.1, D / 2 + 1.5], 0.15, IRON));
      P.push(beam([x + sp - 0.5, y - 1.4, D / 2 + 0.05], [x + sp - 0.5, y - 0.1, D / 2 + 1.5], 0.15, IRON));
    }
  }
  // wall lamps
  for (let i = 0; i <= nb; i += 4) P.push(box(0.5, 0.7, 0.5, 0xfff0b0, { x: xs[i] + sp / 2, y: 4.3, z: D / 2 + 0.4, glow: 1 }));
  return merge(P);
}

// ---------- models ----------
export default {
  // ===================== Minato Mirai =====================
  landmark_tower: {
    name: 'ランドマークタワー', kind: 'landmark',
    build: () => {
      const G = 0xd2cab7, Gd = 0xb4ab97, Gl = 0xe8e2d4, GL = 0x3e5068, LIT = 0xfff0c4;
      const P = [];
      // Landmark Plaza podium (5–6 storeys)
      const PW = 150, PD = 104, PH = 30;
      P.push(box(PW, PH, PD, G, { y: PH / 2 }));
      P.push(box(PW + 3, 1.6, PD + 3, Gl, { y: PH + 0.2 }));
      P.push(box(PW + 1, 2, PD + 1, Gd, { y: 1 }));
      P.push(bands({ w: PW, d: PD, ys: [4.5, 10.5, 16.5, 22.5, 27.2], h: 2.8, col: WARM, glow: 0.7, inset: 3 }));
      P.push(onFaces({ w: PW, d: PD, sp: 10, m: 4 }, (at) => box(1.8, PH - 2, 1.2, Gl, { ...at(0.5), y: PH / 2 })));
      // glass atrium entrance + roof garden in front of the tower
      P.push(box(40, 26, 3, 0xa8cfe6, { y: 13, z: PD / 2 + 1.2, glow: 0.5 }));
      P.push(repeat(9, (i) => box(0.7, 26, 0.7, Gl, { x: -20 + i * 5, y: 13, z: PD / 2 + 2.9 })));
      P.push(box(PW - 24, 1.2, 18, 0x7fb069, { y: PH + 1.4, z: 38 }));
      // tower shaft: octagon ∪ square → square plan with stepped chamfered corners, tapering upward
      const tz = -8, y0 = PH, y1 = 250, aB = 35, aT = 28.5;
      const aAt = (y) => lerp(aB, aT, (y - y0) / (y1 - y0));
      const body = (ya, yb, a0, a1, col, glow = 0) => [
        cyl(a1 / C8, a0 / C8, yb - ya, 8, col, { y: (ya + yb) / 2, z: tz, ry: PI / 8, glow }),
        cyl(a1 * 0.86 * SQ2, a0 * 0.86 * SQ2, yb - ya, 4, col, { y: (ya + yb) / 2, z: tz, ry: PI / 4, glow }),
      ];
      P.push(body(y0, y1, aB, aT, G));
      for (let y = 37; y < y1 - 3; y += 7) P.push(body(y - 1.3, y + 1.3, aAt(y - 1.3) + 0.35, aAt(y + 1.3) + 0.35, LIT, 0.8));
      // granite pilasters running up each face
      for (let k = 0; k < 4; k++) {
        const a = (k * PI) / 2, c = Math.cos(a), s = Math.sin(a);
        const rot = (u, y, r) => [u * c + r * s, y, -u * s + r * c + tz];
        for (const u of [-10, 0, 10]) P.push(beam(rot(u, y0, aB + 0.45), rot(u * aT / aB, y1, aT + 0.45), 1.5, Gl));
      }
      // sky-garden recess: dark glass gap with a lit observation band
      P.push(body(y1, 259, aT - 3.2, aT - 3.2, GL, 0.25));
      P.push(body(252.5, 256, aT - 2.9, aT - 2.9, LIT, 0.9));
      // the flared crown (inverted trapezoid)
      const c0 = aT - 0.4, cT = aT + 7, cy0 = 259, cy1 = 291;
      P.push(body(cy0, cy1, c0, cT, Gl));
      for (const yb of [266, 274, 282]) {
        const t0 = (yb - 1 - cy0) / (cy1 - cy0), t1 = (yb + 1 - cy0) / (cy1 - cy0);
        P.push(body(yb - 1, yb + 1, lerp(c0, cT, t0) + 0.3, lerp(c0, cT, t1) + 0.3, LIT, 0.85));
      }
      const tilt = Math.atan((cT - c0) / (cy1 - cy0)), mid = (c0 + cT) / 2;
      for (let k = 0; k < 4; k++) {
        P.push(group([box(10, 32.4, 1.2, GL, { rx: tilt, y: (cy0 + cy1) / 2, z: mid + 0.5, glow: 0.2 })], { ry: (k * PI) / 2, z: tz }));
      }
      // roof slab, helipad, lights
      P.push(body(cy1, 293.5, cT, cT - 0.8, Gd));
      P.push(body(cy1 - 1, cy1, cT + 0.35, cT + 0.35, LIT, 1));
      P.push(cyl(15, 15, 0.4, 16, 0x9aa0a6, { y: 293.7, z: tz }));
      P.push(box(1.6, 0.2, 9, WHITE, { x: -3, y: 293.95, z: tz }), box(1.6, 0.2, 9, WHITE, { x: 3, y: 293.95, z: tz }), box(6, 0.2, 1.6, WHITE, { y: 293.95, z: tz }));
      const q = 0.86 * (cT - 0.8) - 1;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(box(1.4, 1.4, 1.4, 0xff3a30, { x: sx * q, y: 294.2, z: tz + sz * q, glow: 1 }));
      P.push(cyl(0.3, 0.5, 2.6, 6, STEEL, { y: 294.8, z: tz + 20 }));
      return merge(P);
    },
  },

  queens_square: {
    name: 'クイーンズスクエア', kind: 'landmark',
    build: () => {
      const GLS = 0x5b8fb4, FR = 0xe2e8ec, D = 40, P = [];
      const T = [{ x: -70, w: 50, hl: 172, hr: 140 }, { x: 0, w: 48, hl: 138, hr: 108 }, { x: 67, w: 46, hl: 110, hr: 80 }];
      // low mall joining the towers + glass barrel vault
      P.push(box(212, 24, 74, 0xdcdfdf, { y: 12, z: 2 }));
      P.push(box(214, 1.2, 76, 0xbfc5c8, { y: 24.4, z: 2 }));
      P.push(bands({ w: 212, d: 74, cz: 2, ys: [4.5, 11, 17.5], h: 3, col: WARM, glow: 0.7, inset: 3 }));
      P.push(cyl(8, 8, 186, 10, 0x9fd0e8, { rz: PI / 2, y: 24, z: 28, glow: 0.45 }));
      for (const t of T) {
        const tz = -8;
        P.push(extrude([[-t.w / 2, 0], [t.w / 2, 0], [t.w / 2, t.hr], [-t.w / 2, t.hl]], D, GLS, { x: t.x, z: tz }));
        for (let y = 30; y < t.hr - 2; y += 5) P.push(bands({ w: t.w, d: D, cx: t.x, cz: tz, ys: [y], h: 1.7, col: COOL, glow: 0.75, inset: 1 }));
        // white fins on front/back follow the roof slope → serrated diagonal crown
        const nf = 8;
        for (let i = 0; i < nf; i++) {
          const fx = -t.w / 2 + 0.6 + (i * (t.w - 1.2)) / (nf - 1);
          const top = lerp(t.hl, t.hr, (fx + t.w / 2) / t.w) + 1.5;
          for (const s of [1, -1]) P.push(box(0.9, top - 24, 1.2, FR, { x: t.x + fx, y: 24 + (top - 24) / 2, z: tz + s * (D / 2 + 0.5) }));
        }
        // lit sloped roof edges and corner fins
        for (const s of [1, -1]) {
          P.push(beam([t.x - t.w / 2, t.hl + 0.4, tz + s * (D / 2 + 0.6)], [t.x + t.w / 2, t.hr + 0.4, tz + s * (D / 2 + 0.6)], 0.9, 0xfff2c0, { glow: 1 }));
        }
        for (const s of [1, -1]) P.push(box(1.6, t.hl - 24, 1.6, FR, { x: t.x - t.w / 2, y: 24 + (t.hl - 24) / 2, z: tz + s * (D / 2) }));
        P.push(box(1.2, 1.2, 1.2, 0xff3a30, { x: t.x - t.w / 2 + 1, y: t.hl + 1.6, z: tz, glow: 1 }));
      }
      return merge(P);
    },
  },

  sail_hotel: {
    name: '帆の形のホテル', kind: 'landmark',
    build: () => {
      const W = 0xf7f7f3, BL = 0x7fb3e6, P = [];
      const Rc = 92, phiM = 0.64, N = 18, T = 20;
      const hAt = (t) => 22 + 88 * Math.sqrt(Math.max(0, 1 - t * t));
      const dphi = (2 * phiM) / N, sw = 2 * Rc * Math.sin(dphi / 2) * 1.02;
      const zc = -(Rc * (1 - Math.cos(phiM)) + T) / 2;
      const rr = Rc - T / 2;
      for (let i = 0; i < N; i++) {
        const pc = -phiM + (i + 0.5) * dphi;
        const hL = hAt((pc - dphi / 2) / phiM), hR = hAt((pc + dphi / 2) / phiM);
        const parts = [extrude([[-sw / 2, 0], [sw / 2, 0], [sw / 2, hR], [-sw / 2, hL]], T, W)];
        const hm = Math.min(hL, hR) - 3;
        for (let y = 7; y < hm; y += 3.6) {
          parts.push(plane(sw * 0.82, 1.8, BL, { y, z: T / 2 + 0.06, glow: 0.7 }));
          parts.push(plane(sw * 0.82, 1.8, WARM, { y, z: -T / 2 - 0.06, ry: PI, glow: 0.7 }));
        }
        parts.push(box(sw * 1.02, 3.4, T + 0.6, 0xd9e6ef, { y: 2.6, glow: 0.3 }));
        P.push(group(parts, { ry: pc, x: rr * Math.sin(pc), z: -Rc + rr * Math.cos(pc) - zc }));
      }
      // low lobby block on the land side
      P.push(box(60, 9, 18, W, { y: 4.5, z: -T - 6 - zc }));
      P.push(bands({ w: 60, d: 18, cz: -T - 6 - zc, ys: [4.5], h: 3, col: WARM, glow: 0.8, sides: 'blr' }));
      P.push(box(1.2, 1.2, 1.2, 0xff3a30, { y: 110.6, z: -T / 2 - zc, glow: 1 }));
      return merge(P);
    },
  },

  convention: {
    name: '国際会議場', kind: 'landmark',
    build: () => {
      const W = 0xf3f4f1, P = [];
      P.push(box(200, 14, 80, W, { y: 7 }));
      P.push(box(201, 1.2, 81, 0xcfd4d6, { y: 0.6 }));
      for (const s of [1, -1]) {
        P.push(box(192, 9.5, 0.5, 0x8fc4e4, { y: 6.4, z: s * 40.1, glow: 0.55 }));
        for (let i = 0; i <= 24; i++) P.push(box(0.7, 9.5, 0.6, W, { x: -96 + i * 8, y: 6.4, z: s * 40.5 }));
        P.push(box(196, 1, 1.4, W, { y: 11.6, z: s * 40.6 }));
      }
      P.push(bands({ w: 200, d: 80, ys: [6.4], h: 6, col: COOL, glow: 0.5, sides: 'rl', inset: 6 }));
      // wavy roof: shallow vaults across the hall, alternately stepped
      for (let i = 0; i < 8; i++) {
        P.push(cyl(12.5, 12.5, 82, 12, i % 2 ? 0xe6eaed : W, { rx: PI / 2, x: -87.5 + i * 25, y: 14 + (i % 2) * 1.5, sz: 0.5 }));
        P.push(box(1, 0.8, 82, 0xfff4cc, { x: -75 + i * 25, y: 14.4, glow: 0.8 }));
      }
      // entrance canopy
      P.push(box(44, 0.8, 10, W, { y: 9, z: 45.5 }));
      for (const x of [-20, -7, 7, 20]) P.push(cyl(0.5, 0.5, 9, 6, 0xc9ced2, { x, y: 4.5, z: 49.5 }));
      P.push(box(42, 0.3, 9, 0xfff1c4, { y: 8.5, z: 45.5, glow: 0.8 }));
      return merge(P);
    },
  },

  ferris_wheel: {
    name: '大観覧車', kind: 'landmark',
    build: () => {
      const P = [], R = 50, HC = 60, WH = 0xf4f4f4;
      // station buildings either side of the wheel
      for (const s of [-1, 1]) {
        P.push(box(64, 6, 11, 0xe9eef2, { y: 3, z: s * 10.5 }));
        P.push(box(66, 0.8, 12, 0x3d6fb8, { y: 6.4, z: s * 10.5 }));
        P.push(bands({ w: 64, d: 11, cz: s * 10.5, ys: [3], h: 2.4, col: WARM, glow: 0.85, inset: 2 }));
      }
      P.push(box(14, 1, 9, 0xd2d8dd, { y: 0.5 }));
      // A-frame legs
      for (const s of [-1, 1]) {
        const zt = s * 4.6, zb = s * 12;
        const at = (sx, y) => { const t = (y - 6.8) / (HC - 6.8); return [sx * 30 * (1 - t), y, lerp(zb, zt, t)]; };
        P.push(beam(at(-1, 6.8), at(-1, HC), 2.6, WH), beam(at(1, 6.8), at(1, HC), 2.6, WH));
        P.push(beam(at(-1, 28), at(1, 28), 1.4, WH), beam(at(-1, 28), at(1, 44), 0.9, WH), beam(at(1, 28), at(-1, 44), 0.9, WH));
        P.push(beam(at(-1, 44), at(1, 44), 1.2, WH));
      }
      // axle and hub
      P.push(cyl(2.4, 2.4, 12.6, 10, STEEL, { y: HC, rx: PI / 2 }));
      P.push(cyl(6, 6, 6.5, 16, WH, { y: HC, rx: PI / 2 }));
      // the big digital clock on both faces of the hub
      for (const s of [1, -1]) {
        P.push(cyl(13.5, 13.5, 1, 24, 0x141c34, { y: HC, z: s * 6.6, rx: PI / 2 }));
        P.push(torus(13.6, 0.55, 4, 24, WH, { y: HC, z: s * 7.1 }), torus(13.2, 0.3, 3, 24, 0x7fd8ff, { y: HC, z: s * 7.3, glow: 1 }));
        P.push(digits('21:21', 5.4, 0xd8fff0, 1, { y: HC, z: s * 7.25, ry: s > 0 ? 0 : PI }));
      }
      // rims, inner chord and light rings
      for (const z of [-2.8, 2.8]) P.push(torus(R, 0.75, 4, 60, WH, { y: HC, z }));
      P.push(torus(R - 5, 0.55, 3, 60, WH, { y: HC }));
      for (const z of [-3.7, 3.7]) P.push(torus(R + 0.15, 0.35, 3, 60, 0xfff0b0, { y: HC, z, glow: 1 }));
      // rainbow spokes (lit at night) + rim truss
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * TAU, c = Math.cos(a), s = Math.sin(a), col = RAIN[i % RAIN.length];
        for (const z of [-2.9, 2.9]) P.push(beam([6 * c, HC + 6 * s, z], [(R - 5) * c, HC + (R - 5) * s, z * 0.15], 0.6, col, { glow: 0.8 }));
        for (const z of [-2.8, 2.8]) P.push(beam([(R - 5) * c, HC + (R - 5) * s, 0], [R * c, HC + R * s, z], 0.5, WH));
      }
      // 60 colourful gondolas hanging from the rim
      for (let i = 0; i < 60; i++) {
        const a = ((i + 0.5) / 60) * TAU, c = Math.cos(a), s = Math.sin(a), col = RAIN[i % RAIN.length];
        const gx = (R + 2.6) * c, gy = HC + (R + 2.6) * s - 1.3;
        P.push(beam([R * c, HC + R * s, 0], [gx, gy + 1.4, 0], 0.3, STEEL));
        P.push(cyl(1.6, 1.6, 3.2, 6, col, { x: gx, y: gy, rx: PI / 2, glow: 0.45 }));
      }
      return merge(P);
    },
  },

  coaster: {
    name: 'ジェットコースター', kind: 'landmark',
    build: () => {
      const P = [], Rr = 8, Ls = 40, total = 2 * Ls + TAU * Rr;
      const xz = (s) => {
        s = ((s % total) + total) % total;
        if (s < Ls) return [-20 + s, -Rr];
        s -= Ls;
        if (s < PI * Rr) { const a = -PI / 2 + s / Rr; return [20 + Rr * Math.cos(a), Rr * Math.sin(a)]; }
        s -= PI * Rr;
        if (s < Ls) return [20 - s, Rr];
        s -= Ls;
        const a = PI / 2 + s / Rr; return [-20 + Rr * Math.cos(a), Rr * Math.sin(a)];
      };
      const keys = [[0, 4], [38, 31], [50, 32], [63, 29.5], [76, 0.95], [82, 0.95], [93, 13], [103, 5], [total, 4]];
      const yAt = (s) => {
        s = ((s % total) + total) % total;
        for (let i = 0; i < keys.length - 1; i++) {
          const [s0, y0] = keys[i], [s1, y1] = keys[i + 1];
          if (s <= s1) { const t = (s - s0) / (s1 - s0); return lerp(y0, y1, (1 - Math.cos(t * PI)) / 2); }
        }
        return 4;
      };
      const pos = (s) => { const [x, z] = xz(s); return [x, yAt(s), z]; };
      const N = 64, ds = total / N;
      for (let i = 0; i < N; i++) {
        const a = pos(i * ds), b = pos((i + 1) * ds);
        const dx = b[0] - a[0], dz = b[2] - a[2], hl = Math.hypot(dx, dz) || 1;
        const lx = -dz / hl * 0.75, lz = dx / hl * 0.75;
        P.push(beam([a[0] + lx, a[1], a[2] + lz], [b[0] + lx, b[1], b[2] + lz], 0.32, 0xe8343a));
        P.push(beam([a[0] - lx, a[1], a[2] - lz], [b[0] - lx, b[1], b[2] - lz], 0.32, 0xe8343a));
        P.push(beam([a[0], a[1] - 0.6, a[2]], [b[0], b[1] - 0.6, b[2]], 0.5, 0xffd23a, { glow: 0.25 }));
        if (i % 2 === 0) {
          P.push(beam([a[0] + lx, a[1] - 0.1, a[2] + lz], [a[0] - lx, a[1] - 0.1, a[2] - lz], 0.25, 0x444a52));
          P.push(box(0.35, 0.35, 0.35, RAIN[(i / 2) % RAIN.length], { x: a[0] + lx * 1.3, y: a[1] + 0.2, z: a[2] + lz * 1.3, glow: 1 }));
          if (a[1] > 2.2) {
            P.push(beam([a[0], 0, a[2]], [a[0], a[1] - 0.8, a[2]], 0.55, 0xf2f2f2));
            if (a[1] > 12 && i % 4 === 0) P.push(beam([a[0] - lx * 4, 0.3, a[2] - lz * 4], [a[0], a[1] * 0.6, a[2]], 0.4, 0xf2f2f2), beam([a[0] + lx * 4, 0.3, a[2] + lz * 4], [a[0], a[1] * 0.6, a[2]], 0.4, 0xf2f2f2));
          }
        }
      }
      // splash pool where the track dives under the water
      const pc = pos(79);
      P.push(box(16, 1.2, 9, 0xcfd3d6, { x: pc[0], y: 0.6, z: pc[2] }));
      P.push(box(15, 0.4, 8, 0x36a9e6, { x: pc[0], y: 1.15, z: pc[2], glow: 0.25 }));
      // station inside the left bend
      P.push(box(9, 4, 9, 0xf3e6c8, { x: -21, y: 2 }));
      P.push(hip(5.5, 5.5, 2, 0.3, 0x3a7bd5, { x: -21, y: 4 }));
      P.push(box(7, 1, 0.1, WARM, { x: -21, y: 2.5, z: 4.55, glow: 0.8 }));
      // two trains on the track
      const car = (s, col) => {
        const a = pos(s), b = pos(s + 1.2);
        const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
        const pitch = -Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
        return group([box(1.9, 0.9, 2.2, col, { rx: pitch, y: 0.75 }), box(1.5, 0.5, 0.5, 0x222222, { rx: pitch, y: 1.3, z: -0.4 })],
          { ry: yaw, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 });
      };
      for (let k = 0; k < 4; k++) P.push(car(18 + k * 2.6, k % 2 ? 0xffd23a : 0x2f7de1));
      for (let k = 0; k < 4; k++) P.push(car(86 + k * 2.6, k % 2 ? 0xff6fd8 : 0x5ee07a));
      return merge(P);
    },
  },

  // ===================== Red Brick / harbour =====================
  red_brick_1: { name: '赤レンガ倉庫1号館', kind: 'landmark', build: () => redBrick(76) },
  red_brick_2: { name: '赤レンガ倉庫2号館', kind: 'landmark', build: () => redBrick(150) },

  sailing_ship: {
    name: '帆船日本丸', kind: 'landmark',
    build: () => {
      const W = 0xf8f8f5, RD = 0xc8322b, WOOD = 0xc29662, MAST = 0xeadfc6, ROPE = 0x5b4a3a, SAIL = 0xfffdf4;
      const L = 80, B = 13, DK = 7.8, P = [];
      // hull: red bottom, white topsides, gold sheer line, wooden deck
      P.push(slab(L * 0.94, B * 0.84, 0, 3.6, RD, { bow: 0.28, stern: 0.12 }));
      P.push(slab(L, B, 3.4, DK - 3.4 + 0.9, W, { bow: 0.28, stern: 0.12 }));
      P.push(slab(L + 0.3, B + 0.3, 6.3, 0.35, 0xe2b648, { bow: 0.28, stern: 0.12 }));
      P.push(slab(L * 0.97, B * 0.92, DK, 0.3, WOOD, { bow: 0.28, stern: 0.12 }));
      P.push(slab(L * 0.2, B * 0.8, DK, 1.6, W, { z: L * 0.36, bow: 0.5 }));                    // forecastle
      P.push(box(B * 0.8, 1.8, 12, W, { y: DK + 0.9, z: -L / 2 + 8 }));                           // poop deck
      P.push(box(5, 2.4, 9, W, { y: DK + 1.2, z: -2 }), box(4, 2.2, 6, W, { y: DK + 1.1, z: 16 }));  // deckhouses
      P.push(bands({ w: 5, d: 9, cz: -2, ys: [DK + 1.4], h: 0.8, col: WARM, glow: 0.85, inset: 0.6 }));
      P.push(portholes(B, [5.2], -L / 2 + 12, L / 2 - 26, 3, WARM, 0.6));
      // bowsprit
      const bs = [0, DK + 3, L / 2 + 15];
      P.push(beam([0, DK + 1.2, L / 2 - 4], bs, 0.7, MAST));
      // masts: three square-rigged + a fore-and-aft jigger
      const masts = [{ z: 25, top: 47 }, { z: 9, top: 49 }, { z: -7, top: 47 }, { z: -23, top: 41 }];
      const tops = [];
      masts.forEach((m, mi) => {
        P.push(cyl(0.32, 0.6, m.top - DK, 6, MAST, { y: (m.top + DK) / 2, z: m.z }));
        tops.push([0, m.top, m.z]);
        for (const s of [-1, 1]) {
          P.push(beam([s * B * 0.48, DK + 0.5, m.z - 1.5], [s * 0.4, m.top * 0.7, m.z], 0.14, ROPE));
          P.push(beam([s * B * 0.48, DK + 0.5, m.z + 1.5], [s * 0.4, m.top * 0.82, m.z], 0.14, ROPE));
        }
        if (mi < 3) {
          // five square sails, narrowing upward, billowed slightly forward
          const levels = [[12, 18, 19], [18.6, 24, 17], [24.6, 30, 15], [30.6, 35.6, 12.6], [36.2, 40.6, 10]];
          const k = (m.top - DK) / 40;
          for (const [ya, yb, w] of levels) {
            const a = DK + (ya - 8) * k, b = DK + (yb - 8) * k;
            P.push(beam([-w / 2 - 0.4, b + 0.1, m.z + 0.2], [w / 2 + 0.4, b + 0.1, m.z + 0.2], 0.3, MAST));
            P.push(extrude([[-w / 2 * 1.04, a], [w / 2 * 1.04, a], [w / 2, b], [-w / 2, b]], 0.35, SAIL, { z: m.z + 0.9, rx: -0.05 }));
          }
        } else {
          // spanker + gaff topsail, in the ship's centre plane
          P.push(extrude([[0, DK + 3], [0, DK + 20], [-12, DK + 24], [-15, DK + 3]], 0.3, SAIL, { ry: PI / 2, z: m.z - 0.5 }));
          P.push(extrude([[0, DK + 21], [0, m.top - 2], [-9, DK + 25]], 0.3, SAIL, { ry: PI / 2, z: m.z - 0.5 }));
          P.push(beam([0, DK + 3, m.z], [0, DK + 3, m.z - 15.5], 0.35, MAST));
        }
      });
      // jibs between bowsprit and the foremast, staysails between masts
      for (let j = 0; j < 3; j++) {
        const zf = L / 2 + 13 - j * 5, yt = 30 + j * 5;
        P.push(extrude([[-(zf - 2), DK + 3.2], [-(25 + 1), yt], [-(25 + 3), DK + 4]], 0.25, SAIL, { ry: -PI / 2 }));
      }
      for (let mi = 0; mi < 3; mi++) {
        const za = masts[mi].z, zb = masts[mi + 1].z;
        P.push(extrude([[-(za - 1), masts[mi].top - 8], [-(zb + 1), DK + 22], [-(za - 2), DK + 22]], 0.2, SAIL, { ry: -PI / 2 }));
      }
      // stays
      P.push(beam(bs, tops[0], 0.14, ROPE));
      for (let i = 0; i < 3; i++) P.push(beam(tops[i], tops[i + 1], 0.14, ROPE));
      // illumination: bulbs strung bow → mast tops → stern (dressed overall)
      P.push(lightString([bs, tops[0], tops[1], tops[2], tops[3], [0, DK + 2, -L / 2 + 1]], 2.4, 0.5, [0xfff3b0, 0xff6a5a, 0xfff3b0, 0x6ac8ff, 0xfff3b0, 0x7ef08a], 1));
      // flags
      P.push(box(0.1, 1.2, 2, RD, { y: masts[1].top + 0.6, z: masts[1].z - 1 }));
      P.push(box(0.1, 1.6, 2.6, WHITE, { y: DK + 4, z: -L / 2 - 0.5 }), box(0.12, 0.9, 0.9, RD, { y: DK + 4, z: -L / 2 - 0.5 }));
      return merge(P);
    },
  },

  old_liner: {
    name: '氷川丸', kind: 'landmark',
    build: () => {
      const L = 163, B = 20, BLK = 0x23262b, RD = 0xb2342a, W = 0xf4f2ea, DK = 13.6, P = [];
      const o = { bow: 0.18, stern: 0.07 };
      P.push(slab(L * 0.96, B * 0.86, 0, 5.6, RD, o));
      P.push(slab(L, B, 5.4, DK - 5.4, BLK, o));
      P.push(slab(L + 0.3, B + 0.3, DK - 0.6, 0.35, W, o));
      P.push(slab(L * 0.98, B * 0.96, DK, 0.3, 0xa98458, o));
      P.push(slab(L * 0.18, B * 0.86, DK, 2.6, BLK, { z: L * 0.41, bow: 0.6 }));      // forecastle
      P.push(box(B * 0.8, 2.6, 18, BLK, { y: DK + 1.3, z: -L / 2 + 12 }));           // poop
      P.push(portholes(B, [8.6, 11.2], -58, 58, 3, WARM, 0.75));
      // white superstructure decks
      const decks = [[DK, 3, B * 0.88, -42, 36], [DK + 3, 3, B * 0.82, -32, 28], [DK + 6, 3, B * 0.62, 12, 27]];
      for (const [y, h, w, z0, z1] of decks) {
        P.push(box(w, h, z1 - z0, W, { y: y + h / 2, z: (z0 + z1) / 2 }));
        P.push(bands({ w, d: z1 - z0, cz: (z0 + z1) / 2, ys: [y + h * 0.55], h: 1.1, col: WARM, glow: 0.85, inset: 0.6 }));
      }
      P.push(box(B * 0.95, 0.4, 5, W, { y: DK + 9.2, z: 24 }));            // bridge wings
      P.push(box(B * 0.58, 1, 0.1, 0xbfe6ff, { y: DK + 7.5, z: 27.05, glow: 0.8 }));
      // lifeboats
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) P.push(capsuleBoat(s * (B * 0.42), DK + 6.8, -26 + i * 7));
      // funnel: black with a white band and two red stripes, black top
      const fz = -6, fb = DK + 6;
      P.push(cyl(3.4, 3.7, 12, 12, BLK, { y: fb + 6, z: fz, sz: 1.35 }));
      P.push(cyl(3.5, 3.55, 3.6, 12, W, { y: fb + 8.4, z: fz, sz: 1.35 }));
      P.push(cyl(3.55, 3.58, 0.7, 12, RD, { y: fb + 7.6, z: fz, sz: 1.36 }), cyl(3.55, 3.58, 0.7, 12, RD, { y: fb + 9.2, z: fz, sz: 1.36 }));
      // two masts with derricks
      const tops = [];
      for (const [mz, h] of [[48, 40], [-52, 37]]) {
        P.push(cyl(0.4, 0.7, h - DK, 6, 0xdcc9a0, { y: (h + DK) / 2, z: mz }));
        P.push(box(4, 0.4, 0.4, 0xdcc9a0, { y: h - 9, z: mz }));
        P.push(beam([0, DK + 2, mz], [0, DK + 12, mz + (mz > 0 ? -12 : 12)], 0.4, 0xdcc9a0));
        tops.push([0, h, mz]);
      }
      // illumination strings bow → foremast → funnel → mainmast → stern
      const bow = [0, DK + 2.5, L / 2], stern = [0, DK + 2.5, -L / 2 + 1];
      P.push(lightString([bow, tops[0], [0, fb + 12, fz], tops[1], stern], 3, 0.55, [0xfff3b0], 1));
      P.push(box(0.1, 1.6, 2.6, RD, { y: DK + 5, z: -L / 2 - 0.6 }));
      return merge(P);
    },
  },

  cruise_ship: {
    name: '豪華客船', kind: 'landmark',
    build: () => {
      const L = 290, B = 36, W = 0xf8f8f6, NAVY = 0x1d3f8a, P = [];
      const o = { bow: 0.2, stern: 0.05 };
      P.push(slab(L * 0.97, B * 0.9, 0, 7.5, NAVY, o));
      P.push(slab(L, B, 7.3, 13, W, o));
      P.push(slab(L + 0.5, B + 0.5, 7.6, 1.4, 0x2a6ad6, o));
      // hull window rows
      for (const y of [11.5, 14.5, 17.5]) P.push(portholes(B, [y], -120, 100, 3.2, WARM, 0.9, 0.8));
      // stacked decks: white balcony parapets with glowing cabins behind
      for (let k = 0; k < 11; k++) {
        const y = 20.3 + k * 3, Lk = L * 0.8 - k * 6 - (k > 7 ? (k - 7) * 14 : 0), Bk = k > 8 ? B * 0.78 : B * 0.97;
        const z = -12 - k * 2.2;
        P.push(slab(Lk - 2, Bk - 1.8, y, 3, k % 2 ? 0xcfe4f6 : 0xffeccc, { z, bow: 0.12, stern: 0.03, glow: 0.8 }));
        P.push(slab(Lk, Bk, y, 1.2, W, { z, bow: 0.12, stern: 0.03 }));
      }
      // bridge with wings at the front of the superstructure
      const fz = -12 + (L * 0.8) / 2 - 22;
      P.push(box(B + 2, 3, 8, W, { y: 41.8, z: fz }));
      P.push(box(B + 1, 1.3, 0.1, 0xbfe6ff, { y: 42, z: fz + 4.05, glow: 0.9 }));
      // lifeboats along both sides
      for (const s of [-1, 1]) for (let i = 0; i < 10; i++) P.push(box(3, 2.6, 9, 0xff9b1f, { x: s * (B / 2 - 1.2), y: 22.6, z: -90 + i * 17 }));
      // funnel (aft), blue with white & gold stripes
      P.push(extrude([[-8, 0], [12, 0], [9, 16], [-4, 16]], 12, 0x1d3f8a, { ry: PI / 2, y: 53, z: -96 }));
      P.push(extrude([[-6.5, 9], [10.4, 9], [9.9, 11], [-5.6, 11]], 12.3, 0xf0c02c, { ry: PI / 2, y: 53, z: -96, glow: 0.3 }));
      // pool deck + slide + radar mast
      P.push(box(14, 0.8, 18, 0x46c3f0, { y: 53.6, z: -40, glow: 0.4 }));
      P.push(box(8, 0.8, 10, 0x46c3f0, { y: 53.6, z: -5, glow: 0.4 }));
      for (let i = 0; i < 8; i++) {
        const a = i * 0.8;
        P.push(beam([6 * Math.cos(a), 54 + i * 0.9, -60 + 6 * Math.sin(a)], [6 * Math.cos(a + 0.8), 54 + (i + 1) * 0.9, -60 + 6 * Math.sin(a + 0.8)], 1.2, i % 2 ? 0xffd23a : 0xff4f6a));
      }
      P.push(cyl(0.6, 0.9, 10, 6, W, { y: 59, z: fz - 10 }));
      P.push(box(6, 0.5, 0.8, W, { y: 63, z: fz - 10 }));
      P.push(box(1, 1, 1, 0xff3a30, { y: 64.5, z: fz - 10, glow: 1 }));
      return merge(P);
    },
  },

  sea_bus: {
    name: 'シーバス', kind: 'vehicle', where: ['sea'], weight: 1, move: 'sail', speed: 6,
    build: () => {
      const L = 25, B = 6.6, BL = 0x1f64c4, P = [];
      P.push(slab(L * 0.95, B * 0.88, 0, 1.4, BL, { bow: 0.36, stern: 0.06 }));
      P.push(slab(L, B, 1.3, 1.6, WHITE, { bow: 0.36, stern: 0.06 }));
      P.push(slab(L + 0.2, B + 0.2, 2.15, 0.4, 0x37a0f0, { bow: 0.36, stern: 0.06 }));
      // sleek cabin with a ribbon of windows and a swept roof
      P.push(slab(L * 0.72, B * 0.86, 2.9, 1.2, WHITE, { bow: 0.42, stern: 0.05, z: -1.6 }));
      P.push(slab(L * 0.71, B * 0.85, 4.05, 1.1, 0x9ccbf0, { bow: 0.42, stern: 0.05, z: -1.6, glow: 0.7 }));
      P.push(slab(L * 0.66, B * 0.82, 5.1, 0.5, BL, { bow: 0.5, stern: 0.05, z: -2.2 }));
      P.push(slab(L * 0.3, B * 0.5, 5.55, 0.5, WHITE, { bow: 0.6, z: -1 }));
      P.push(box(B * 0.7, 0.4, 2, 0x2a2f36, { y: 5.85, z: -9 }));
      P.push(cyl(0.12, 0.12, 2, 4, STEEL, { y: 6.8, z: 1 }), box(0.4, 0.4, 0.4, 0xffffff, { y: 7.9, z: 1, glow: 1 }));
      P.push(box(0.3, 0.3, 0.3, 0xff3a30, { x: -B / 2, y: 3.2, z: 4, glow: 1 }), box(0.3, 0.3, 0.3, 0x3aff6a, { x: B / 2, y: 3.2, z: 4, glow: 1 }));
      return merge(P);
    },
  },

  sightseeing_boat: {
    name: '遊覧船', kind: 'vehicle', where: ['sea'], weight: 1, move: 'sail', speed: 5,
    build: () => {
      const L = 35, B = 8.4, NAVY = 0x1e2f5a, CREAM = 0xf6f0e0, WOOD = 0xa8774a, RD = 0xc8322b, P = [];
      const o = { bow: 0.3, stern: 0.12 };
      P.push(slab(L * 0.95, B * 0.86, 0, 1.6, RD, o));
      P.push(slab(L, B, 1.5, 1.8, NAVY, o));
      P.push(slab(L + 0.2, B + 0.2, 3.2, 0.3, GOLD, o));
      P.push(slab(L, B, 3.4, 0.9, CREAM, o));
      P.push(portholes(B, [2.4], -10, 8, 2.4, WARM, 0.5));
      // two cabin decks with warm windows and wooden rails
      P.push(box(B * 0.84, 2.6, 20, CREAM, { y: 5.6, z: -2.5 }));
      P.push(bands({ w: B * 0.84, d: 20, cz: -2.5, ys: [5.8], h: 1.3, col: WARM, glow: 0.85, inset: 0.6 }));
      P.push(box(B * 0.9, 0.3, 22, WOOD, { y: 7.05, z: -2.5 }));
      P.push(box(B * 0.66, 2.2, 12, CREAM, { y: 8.3, z: -1 }));
      P.push(bands({ w: B * 0.66, d: 12, cz: -1, ys: [8.4], h: 1.1, col: WARM, glow: 0.85, inset: 0.5 }));
      P.push(box(B * 0.72, 0.3, 13, RD, { y: 9.55, z: -1 }));
      for (const s of [-1, 1]) P.push(box(0.1, 0.8, 21, WOOD, { x: s * B * 0.44, y: 7.6, z: -2.5 }));
      // retro funnel and mast with signal flags
      P.push(cyl(0.9, 1.0, 3, 10, RD, { y: 11.2, z: -4 }), cyl(0.92, 0.92, 0.7, 10, 0x1b1b1b, { y: 12.9, z: -4 }));
      P.push(cyl(0.1, 0.14, 7, 4, CREAM, { y: 10, z: 7.5 }));
      P.push(lightString([[0, 4.4, L / 2 - 0.5], [0, 13.4, 7.5], [0, 10, -4], [0, 4.4, -L / 2 + 0.5]], 1.3, 0.35, RAIN, 0.8));
      P.push(box(0.4, 0.4, 0.4, 0xfff3b0, { y: 13.7, z: 7.5, glow: 1 }));
      return merge(P);
    },
  },

  // ===================== Yamashita / Kannai =====================
  marine_tower: {
    name: 'マリンタワー', kind: 'landmark',
    build: () => {
      const SIL = 0xdfe4ea, RD = 0xd8322b, P = [];
      // decagonal base building
      P.push(cyl(14.5, 15.5, 9, 10, 0xeef0f2, { y: 4.5, ry: PI / 10 }));
      P.push(cyl(14.9, 15.3, 2.6, 10, WARM, { y: 4.6, ry: PI / 10, glow: 0.8 }));
      P.push(cyl(15.6, 15.6, 0.8, 10, 0xc9ced4, { y: 9.2, ry: PI / 10 }));
      // decagonal lattice in a gentle hourglass
      const ys = [9, 18, 27, 36, 45, 54, 63, 72, 81, 89];
      const rAt = (y) => (y < 70 ? 4.6 + 6.6 * ((70 - y) / 61) ** 2 : 4.6 + 2.2 * ((y - 70) / 19) ** 2);
      const v = (y, k) => { const a = (k / 10) * TAU + PI / 10, r = rAt(y); return [r * Math.sin(a), y, r * Math.cos(a)]; };
      for (let i = 0; i < ys.length; i++) {
        const ring = i % 3 === 0 ? RD : SIL;
        for (let k = 0; k < 10; k++) {
          P.push(beam(v(ys[i], k), v(ys[i], k + 1), 0.55, ring, { glow: ring === RD ? 0.35 : 0.2 }));
          if (i < ys.length - 1) {
            P.push(beam(v(ys[i], k), v(ys[i + 1], k), 0.95, SIL, { glow: 0.25 }));
            P.push(beam(v(ys[i], k), v(ys[i + 1], k + 1), 0.35, SIL, { glow: 0.15 }));
            P.push(beam(v(ys[i], k + 1), v(ys[i + 1], k), 0.35, SIL, { glow: 0.15 }));
          }
        }
      }
      // central lift shaft
      P.push(cyl(1.6, 1.6, 82, 6, 0xc7ccd2, { y: 50 }));
      // observation deck
      P.push(cyl(9.6, 6.4, 3.6, 10, SIL, { y: 90.8, ry: PI / 10 }));
      P.push(cyl(9.6, 9.6, 1, 10, RD, { y: 93.1, ry: PI / 10, glow: 0.4 }));
      P.push(cyl(10, 9.6, 4.6, 10, 0x9fd3f0, { y: 95.9, ry: PI / 10, glow: 0.85 }));
      P.push(cyl(8.6, 10.4, 1.2, 10, SIL, { y: 98.8, ry: PI / 10 }));
      P.push(cyl(5.8, 5.8, 2.4, 10, 0x9fd3f0, { y: 100.6, ry: PI / 10, glow: 0.85 }));
      P.push(cyl(4, 6.4, 1, 10, SIL, { y: 102.3, ry: PI / 10 }));
      // beacon lantern + mast
      P.push(cyl(1.2, 1.2, 1.8, 8, 0x8dffb0, { y: 103.7, glow: 1 }));
      P.push(cone(1.4, 1, 8, RD, { y: 105.1 }));
      P.push(cyl(0.12, 0.12, 0.8, 4, STEEL, { y: 106 }));
      return merge(P);
    },
  },

  bay_bridge: {
    name: '横浜ベイブリッジ', kind: 'landmark',
    build: () => {
      const W = 0xf2f4f5, P = [];
      const TX = 160, ZL = 17.5, TOPY = 172, DY = 50, TG = 0.22;
      // H-shaped towers
      for (const tx of [-TX, TX]) {
        P.push(box(24, 6, 52, 0xb7b9b4, { x: tx, y: 3 }));
        for (const z of [-ZL, ZL]) {
          P.push(box(7.5, TOPY - 6, 8.5, W, { x: tx, y: 6 + (TOPY - 6) / 2, z, glow: TG }));
          P.push(box(1.2, 1.2, 1.2, 0xff3a30, { x: tx, y: TOPY + 0.6, z, glow: 1 }));
          for (const y of [70, 100, 130]) P.push(box(7.9, 1, 8.9, 0xfff4cc, { x: tx, y, z, glow: 0.9 }));
        }
        P.push(box(6, 7, ZL * 2, W, { x: tx, y: DY - 15.5, glow: TG }));
        P.push(box(6, 10, ZL * 2, W, { x: tx, y: 160, glow: TG }));
        P.push(box(6.4, 1.2, ZL * 2 - 6, 0xfff4cc, { x: tx, y: 155, glow: 0.9 }));
        // fan of stay cables
        for (const z of [-ZL, ZL]) for (const side of [-1, 1]) for (let i = 0; i < 11; i++) {
          P.push(beam([tx + side * 3, 124 + i * 4.2, z], [tx + side * (18 + i * 12.2), DY + 0.4, z], 0.65, W, { glow: 0.35 }));
        }
      }
      // double-deck truss girder
      const X0 = -300, PL = 15, NP = 40;
      P.push(box(600, 1.6, 36, W, { y: DY - 0.8 }));
      P.push(box(600, 0.3, 33, ASPH, { y: DY + 0.15 }));
      P.push(box(600, 1.2, 34, W, { y: DY - 12 }));
      P.push(box(600, 0.25, 31, ASPH, { y: DY - 11.3 }));
      P.push(box(600, 1.4, 1.2, W, { y: DY + 1, z: 16.9 }), box(600, 1.4, 1.2, W, { y: DY + 1, z: -16.9 }));
      for (const z of [-ZL, ZL]) {
        P.push(box(600, 1.3, 1.3, W, { y: DY - 1.2, z }));
        P.push(box(600, 1.3, 1.3, W, { y: DY - 12, z }));
        P.push(box(600, 0.5, 0.5, 0xffb84a, { y: DY - 9.6, z: z * 0.9, glow: 1 }));
        for (let i = 0; i <= NP; i++) {
          const x = X0 + i * PL;
          P.push(beam([x, DY - 12, z], [x, DY - 1.2, z], 0.8, W));
          if (i < NP) P.push(i % 2 ? beam([x, DY - 1.2, z], [x + PL, DY - 12, z], 0.7, W) : beam([x, DY - 12, z], [x + PL, DY - 1.2, z], 0.7, W));
        }
      }
      // street lamps on the upper deck
      for (let x = -290; x <= 290; x += 29) {
        for (const s of [-1, 1]) {
          P.push(box(0.3, 7, 0.3, 0xc9ced2, { x, y: DY + 3.5, z: s * 16.2 }));
          P.push(box(1.6, 0.5, 0.8, 0xfff6d8, { x, y: DY + 7, z: s * 15.4, glow: 1 }));
        }
      }
      // side-span piers
      for (const px of [-298, -235, 235, 298]) {
        for (const z of [-14, 14]) P.push(box(5, DY - 12.6, 5, 0xe4e6e6, { x: px, y: (DY - 12.6) / 2, z }));
        P.push(box(6, 3, 34, 0xe4e6e6, { x: px, y: DY - 14, z: 0 }));
      }
      return merge(P);
    },
  },

  // ===================== Chinatown =====================
  chinatown_gate: {
    name: '中華街の門', kind: 'landmark',
    build: () => {
      const CR = 0xd8261c, BL = 0x2d64c0, GR = 0x2e9a5e, P = [];
      const cols = [[-5.6, 8.6], [-2.4, 11.0], [2.4, 11.0], [5.6, 8.6]];
      for (const [x, h] of cols) {
        P.push(box(1.2, 1.1, 1.4, 0xdcd6c8, { x, y: 0.55 }));
        P.push(cyl(0.4, 0.42, h - 1.1, 8, CR, { x, y: 1.1 + (h - 1.1) / 2 }));
        P.push(cyl(0.5, 0.5, 0.3, 8, GOLD, { x, y: 1.25, glow: 0.2 }));
      }
      // centre bay: lintels, painted bracket bands, plaque
      P.push(box(5.8, 0.6, 0.7, CR, { y: 7.0 }), box(5.8, 0.6, 0.7, CR, { y: 9.9 }));
      P.push(box(6.4, 0.6, 1.4, BL, { y: 10.5 }), box(6.8, 0.35, 1.8, GR, { y: 10.95 }));
      P.push(box(6.6, 0.12, 1.85, GOLD, { y: 10.2, glow: 0.4 }));
      P.push(box(3.4, 2.0, 0.3, GOLD, { y: 8.45, glow: 0.3 }));
      P.push(box(3.0, 1.6, 0.42, 0x1b3a8a, { y: 8.45 }));
      for (const s of [1, -1]) {
        for (let i = 0; i < 3; i++) P.push(glyph(11 + i, 0.85, 0xffd84a, 1, { x: (i - 1) * 0.95, y: 8.45, z: s * 0.24 }));
      }
      // side bays
      for (const s of [-1, 1]) {
        P.push(box(3.4, 0.5, 0.6, CR, { x: s * 4, y: 6.4 }), box(3.4, 0.5, 0.6, CR, { x: s * 4, y: 7.9 }));
        P.push(box(3.6, 0.45, 1.2, BL, { x: s * 4, y: 8.35 }));
        P.push(box(2.4, 0.9, 0.25, GR, { x: s * 4, y: 7.15, glow: 0.2 }));
        P.push(cnRoof({ x: s * 4.1, y: 8.6, hx: 2.5, hz: 1.9, h: 1.5 }));
      }
      // stacked central roofs
      P.push(cnRoof({ y: 11.1, hx: 4.5, hz: 2.2, h: 1.6 }));
      P.push(box(5.4, 0.7, 1.6, CR, { y: 12.9 }), box(5.6, 0.25, 1.7, GOLD, { y: 13.3, glow: 0.4 }));
      P.push(cnRoof({ y: 13.4, hx: 3.7, hz: 1.9, h: 1.5 }));
      P.push(sphere(0.32, 8, 5, GOLD, { y: 15.25, glow: 0.6 }));
      // red lanterns
      for (const [x, y] of [[-1.2, 6.2], [1.2, 6.2], [-4, 5.6], [4, 5.6]]) {
        P.push(cyl(0.04, 0.04, 0.6, 4, IRON, { x, y: y + 0.75 }));
        P.push(sphere(0.48, 8, 5, 0xff3b2a, { x, y, sy: 0.85, glow: 0.95 }));
        P.push(cyl(0.22, 0.22, 0.12, 6, GOLD, { x, y: y + 0.42 }), cyl(0.22, 0.22, 0.12, 6, GOLD, { x, y: y - 0.42 }));
        P.push(box(0.08, 0.4, 0.08, GOLD, { x, y: y - 0.7 }));
      }
      return merge(P);
    },
  },

  kanteibyo: {
    name: '関帝廟', kind: 'landmark',
    build: () => {
      const CR = 0xc8261c, BL = 0x2d64c0, GR = 0x2e9a5e, ST = 0xdcd8cc, P = [];
      // stone platform with balustrade
      P.push(box(22, 3.2, 16, ST, { y: 1.6, z: -3 }));
      P.push(box(22.4, 0.3, 16.4, 0xc4bfb2, { y: 3.25, z: -3 }));
      for (const s of [-1, 1]) {
        P.push(box(0.4, 1, 16, 0xf0ece2, { x: s * 10.8, y: 3.9, z: -3 }));
        P.push(box(3.6, 1, 0.4, 0xf0ece2, { x: s * 9.2, y: 3.9, z: 4.8 }));
      }
      // wide front stairs with a carved dragon slab in the middle
      for (let i = 0; i < 8; i++) {
        const h = (3.2 * (8 - i)) / 8;
        P.push(box(14, h, 0.86, ST, { y: h / 2, z: 5 + 0.86 * (i + 0.5) }));
      }
      P.push(box(3, 0.5, 7.6, 0xbab4a6, { rx: Math.atan2(3.2, 6.9), y: 1.85, z: 8.4 }));
      P.push(beam([0, 3.1, 5.4], [0, 0.8, 11], 0.6, GR, { glow: 0.2 }), beam([0.6, 2.4, 6.6], [-0.6, 1.6, 9], 0.45, GOLD, { glow: 0.3 }));
      for (const s of [-1, 1]) P.push(box(0.6, 1.2, 7.4, 0xf0ece2, { x: s * 7.2, y: 2.2, z: 8.5, rx: Math.atan2(3.2, 6.9) }));
      // hall body, doors, front colonnade
      const y0 = 3.4;
      P.push(box(16, 6.6, 10, 0xa8231a, { y: y0 + 3.3, z: -4 }));
      for (const x of [-4.5, 0, 4.5]) P.push(box(2.6, 4.2, 0.2, GOLD, { x, y: y0 + 2.1, z: 1.1, glow: 0.5 }));
      for (let i = 0; i < 6; i++) {
        const x = -7.5 + i * 3;
        P.push(cyl(0.4, 0.42, 6.6, 8, CR, { x, y: y0 + 3.3, z: 2.8 }));
        P.push(cyl(0.52, 0.52, 0.4, 8, GOLD, { x, y: y0 + 0.2, z: 2.8 }), cyl(0.5, 0.5, 0.3, 8, GOLD, { x, y: y0 + 6.3, z: 2.8, glow: 0.3 }));
      }
      P.push(box(17.6, 0.8, 0.8, CR, { y: y0 + 7, z: 2.8 }));
      P.push(box(18.4, 0.7, 14, BL, { y: y0 + 7.6, z: -1.8 }), box(18.8, 0.2, 14.4, GOLD, { y: y0 + 8.05, z: -1.8, glow: 0.4 }));
      P.push(box(18.6, 0.5, 14.2, GR, { y: y0 + 8.4, z: -1.8 }));
      // two-tier roofs
      P.push(cnRoof({ z: -1.8, y: 12.0, hx: 11, hz: 8.4, h: 2.8 }));
      P.push(box(11.6, 2.2, 7.2, CR, { y: 15.6, z: -1.8 }));
      P.push(box(12, 0.5, 7.6, BL, { y: 16.6, z: -1.8 }), box(12.2, 0.2, 7.8, GOLD, { y: 16.95, z: -1.8, glow: 0.4 }));
      for (const x of [-3.5, 0, 3.5]) P.push(box(2, 1.1, 0.1, WARM, { x, y: 15.6, z: 1.85, glow: 0.8 }));
      P.push(cnRoof({ z: -1.8, y: 17.0, hx: 8.4, hz: 5.6, h: 2.8 }));
      // colourful ridge figurines and the central pagoda ornament
      const deco = [GR, GOLD, BL, CR, GOLD, GR, BL];
      for (let i = 0; i < 7; i++) {
        const x = -5.4 + i * 1.8;
        if (Math.abs(x) < 1) continue;
        P.push(box(0.9, 0.9, 0.5, deco[i], { x, y: 20.6, z: -1.8, glow: 0.3 }));
      }
      for (const s of [-1, 1]) {
        P.push(beam([s * 3.5, 20.3, -1.8], [s * 6, 21.6, -1.8], 0.5, GR, { glow: 0.3 }));
        P.push(beam([s * 6, 21.6, -1.8], [s * 7.2, 20.6, -1.8], 0.4, GOLD, { glow: 0.4 }));
        for (const t of [-1, 1]) P.push(box(0.7, 0.8, 0.7, deco[(s + t + 4) % 7], { x: s * 9.6, y: 14.2, z: -1.8 + t * 7.4, glow: 0.3 }));
      }
      P.push(cyl(0.7, 1.0, 0.8, 6, BL, { y: 20.6, z: -1.8 }));
      P.push(cyl(0.45, 0.65, 0.6, 6, CR, { y: 21.3, z: -1.8 }));
      P.push(sphere(0.45, 8, 5, GOLD, { y: 21.9, z: -1.8, glow: 0.7 }));
      // lanterns along the front eave
      for (let i = 0; i < 5; i++) {
        const x = -6 + i * 3;
        P.push(cyl(0.04, 0.04, 0.8, 4, IRON, { x, y: 11.1, z: 4.4 }));
        P.push(sphere(0.5, 8, 5, 0xff3b2a, { x, y: 10.3, z: 4.4, sy: 0.85, glow: 0.95 }));
        P.push(box(0.08, 0.4, 0.08, GOLD, { x, y: 9.6, z: 4.4 }));
      }
      return merge(P);
    },
  },

  // ===================== Kannai =====================
  stadium: {
    name: '横浜スタジアム', kind: 'landmark',
    build: () => {
      const SZ = 0.85, SEAT = 0x2563c9, P = [];
      const L = (pts, col, o = {}) => lathe(pts, 32, col, { sz: SZ, ...o });
      // field: grass, warning track, infield diamond
      P.push(cyl(66, 66, 0.6, 32, 0x4fae4a, { y: 0.3, sz: SZ }));
      P.push(L([[68, 0.62], [66, 0.62]], 0xc49a63));
      P.push(box(27, 0.2, 27, 0xc9a06a, { ry: PI / 4, y: 0.7, z: 28 }));
      P.push(box(19, 0.25, 19, 0x5fbf55, { ry: PI / 4, y: 0.75, z: 28 }));
      const hd = 27 / SQ2;
      for (const [x, z] of [[0, 28 + hd], [hd, 28], [0, 28 - hd], [-hd, 28]]) P.push(box(1, 0.3, 1, WHITE, { x, y: 0.85, z }));
      P.push(cyl(2, 2.4, 0.5, 8, 0xc9a06a, { y: 0.9, z: 28 }));
      // stands (inside faces) and outer wall
      P.push(L([[68, 3.2], [68, 0]], 0x1f3f7f));
      P.push(L([[82, 12], [68, 3.2]], SEAT));
      P.push(L([[84.5, 12.8], [82, 12]], 0xc9ced4));
      P.push(L([[97, 26.5], [84.5, 12.8]], SEAT));
      P.push(L([[100, 30], [97, 26.5]], 0xe2e5e9));
      P.push(L([[100, 0], [100, 30]], 0xd9dde2));
      P.push(L([[100.3, 8], [100.3, 10.5]], WARM, { glow: 0.8 }));
      P.push(L([[100.3, 25], [100.3, 27]], 0x2563c9, { glow: 0.3 }));
      for (const r of [72, 77]) P.push(L([[r + 0.7, 3.25 + ((r + 0.7 - 68) * 8.8) / 14], [r, 3.25 + ((r - 68) * 8.8) / 14]], 0x7fa8ec));
      for (const r of [89, 93]) P.push(L([[r + 0.7, 12.85 + ((r + 0.7 - 84.5) * 13.7) / 12.5], [r, 12.85 + ((r - 84.5) * 13.7) / 12.5]], 0x7fa8ec));
      // scoreboard behind the outfield
      P.push(box(52, 18, 3, 0x222831, { y: 36, z: -84 }));
      P.push(plane(48, 14, 0x9fe0ff, { y: 36.5, z: -82.4, glow: 0.85 }));
      P.push(box(52, 2, 3.4, 0x2563c9, { y: 46, z: -84 }));
      for (const x of [-24, 24]) P.push(box(2, 26, 2, 0x8a929a, { x, y: 23, z: -85 }));
      // six light towers with glowing heads
      for (const deg of [30, 90, 150, 210, 270, 330]) {
        const a = (deg * PI) / 180, x = 102 * Math.sin(a), z = 102 * SZ * Math.cos(a);
        P.push(group([
          box(2.4, 54, 2.4, 0xd8dde2, { y: 27 }),
          box(15, 9, 1.6, 0x6a7078, { y: 56, rx: -0.25 }),
          box(14, 8, 0.4, 0xfffbe0, { y: 56, z: 0.9, rx: -0.25, glow: 1 }),
        ], { x, z, ry: Math.atan2(-x, -z) }));
      }
      return merge(P);
    },
  },

  king_tower: {
    name: 'キングの塔', kind: 'landmark',
    build: () => {
      const BB = 0xc2a27a, ST = 0xe7ddca, RF = 0x506a5e, P = [];
      P.push(box(84, 21, 26, BB, { y: 10.5 }));
      P.push(box(85, 1.6, 27, ST, { y: 0.8 }), box(85.4, 1, 27.4, ST, { y: 21 }));
      P.push(box(83, 1.4, 25, ST, { y: 22.2 }));
      P.push(panes({ w: 84, d: 26, ys: [3.4, 7.4, 11.4, 15.4, 19.0], pw: 1.6, ph: 2.6, sp: 3.6, col: WARM, glow: 0.75 }));
      // central projecting entrance bay
      P.push(box(20, 23, 3.6, BB, { y: 11.5, z: 14.6 }));
      P.push(box(12, 6, 3, ST, { y: 3, z: 17.3 }));
      P.push(box(8, 4, 0.2, 0xffc46a, { y: 2.4, z: 18.9, glow: 0.8 }));
      for (const x of [-7.5, -2.5, 2.5, 7.5]) P.push(box(1.4, 15, 0.6, ST, { x, y: 13.5, z: 16.6 }));
      P.push(panes({ w: 20, d: 3.6, cz: 14.6, sides: 'f', ys: [9.4, 13.4, 17.4], pw: 1.6, ph: 2.6, sp: 5, m: 5, col: WARM, glow: 0.75 }));
      // tower with the pagoda-like crown roof
      const tz = 6;
      P.push(box(13, 15, 13, BB, { y: 22 + 7.5, z: tz }));
      P.push(panes({ w: 13, d: 13, cz: tz, ys: [26, 31], pw: 1.4, ph: 3, sp: 3.2, m: 3.2, col: WARM, glow: 0.8 }));
      P.push(box(14, 1, 14, ST, { y: 37.3, z: tz }));
      P.push(box(10.5, 3, 10.5, ST, { y: 39.2, z: tz }));
      P.push(hip(8.6, 8.6, 2.6, 0.5, RF, { y: 40.7, z: tz }));
      P.push(box(5.6, 1.6, 5.6, ST, { y: 44, z: tz }));
      P.push(hip(5, 5, 2.2, 0.35, RF, { y: 44.8, z: tz }));
      P.push(cone(1.4, 1.6, 4, RF, { y: 47.8, z: tz, ry: PI / 4 }));
      P.push(cyl(0.12, 0.2, 0.9, 6, GOLD, { y: 49.0, z: tz }));
      return merge(P);
    },
  },

  queen_tower: {
    name: 'クイーンの塔', kind: 'landmark',
    build: () => {
      const WH = 0xf4f1e8, TR = 0xd6cfbd, CU = 0x46a58c, P = [];
      P.push(box(64, 19, 30, WH, { y: 9.5 }));
      P.push(box(65, 1.2, 31, TR, { y: 19.2 }), box(64.6, 1.4, 30.6, TR, { y: 0.7 }));
      P.push(arches({ w: 64, d: 30, ys: [1.8], aw: 2, ah: 3.4, sp: 4.4, m: 3, col: WARM, glow: 0.8, trim: TR }));
      P.push(panes({ w: 64, d: 30, ys: [8.4, 12.8, 16.6], pw: 1.5, ph: 2.6, sp: 4.4, m: 3, col: WARM, glow: 0.75 }));
      // slim central tower with the copper-green onion dome
      const tz = 9;
      P.push(box(8.4, 19.4, 8.4, WH, { y: 28.7, z: tz }));
      for (const x of [-3.9, 3.9]) for (const z of [-3.9, 3.9]) P.push(box(1.1, 19.4, 1.1, TR, { x, y: 28.7, z: tz + z }));
      P.push(arches({ w: 8.4, d: 8.4, cz: tz, ys: [24, 30.5], aw: 1.4, ah: 3.8, sp: 2.6, m: 2.9, col: WARM, glow: 0.8 }));
      P.push(box(9.4, 1, 9.4, TR, { y: 38.7, z: tz }));
      P.push(cyl(3.5 / C8, 3.8 / C8, 3.6, 8, WH, { y: 41, z: tz, ry: PI / 8 }));
      P.push(arches({ w: 7.2, d: 7.2, cz: tz, ys: [39.6], aw: 1.0, ah: 2.2, sp: 3, m: 3.6, col: WARM, glow: 0.8 }));
      P.push(cyl(3.9 / C8, 3.9 / C8, 0.5, 8, TR, { y: 43, z: tz, ry: PI / 8 }));
      P.push(lathe([[0.01, 0], [3.4, 0], [3.95, 1.2], [3.85, 2.6], [3.05, 3.9], [1.7, 5.1], [0.75, 6.0], [0.25, 6.6], [0.01, 7.0]], 12, CU, { y: 43.2, z: tz }));
      P.push(cyl(0.1, 0.24, 1.6, 6, GOLD, { y: 50.9, z: tz }));
      return merge(P);
    },
  },

  jack_tower: {
    name: 'ジャックの塔', kind: 'landmark',
    build: () => {
      const BR = 0xb5492e, ST = 0xf0e8d8, CU = 0x4ea58a, P = [];
      // two-storey red brick hall with white stone bands
      P.push(box(40, 13, 28, BR, { y: 6.5 }));
      for (const y of [0.6, 6.4]) P.push(box(40.4, 0.7, 28.4, ST, { y }));
      P.push(box(40.8, 0.9, 28.8, ST, { y: 12.9 }));
      P.push(hip(20.6, 14.6, 3.8, 0.4, 0x5d6f73, { y: 13.3 }));
      P.push(arches({ w: 40, d: 28, ys: [1.6, 7.6], aw: 1.6, ah: 3.2, sp: 4, m: 3, col: WARM, glow: 0.8, trim: ST }));
      // clock tower on the front-right corner
      const tx = 14, tz = 10;
      P.push(box(8, 26, 8, BR, { x: tx, y: 13, z: tz }));
      for (let y = 3; y < 25; y += 3.2) P.push(box(8.3, 0.55, 8.3, ST, { x: tx, y, z: tz }));
      for (const x of [-3.8, 3.8]) for (const z of [-3.8, 3.8]) P.push(box(0.9, 26, 0.9, ST, { x: tx + x, y: 13, z: tz + z }));
      for (let k = 0; k < 4; k++) {
        P.push(group([
          cyl(2.3, 2.3, 0.3, 16, 0xfff8e6, { rx: PI / 2, y: 22, z: 4.15, glow: 0.8 }),
          torus(2.35, 0.2, 3, 16, GOLD, { y: 22, z: 4.3 }),
          box(0.25, 1.6, 0.1, 0x222222, { y: 22.7, z: 4.35 }),
          box(1.2, 0.25, 0.1, 0x222222, { x: 0.5, y: 22, z: 4.35 }),
        ], { ry: (k * PI) / 2, x: tx, z: tz }));
      }
      P.push(box(7.2, 2.4, 7.2, ST, { x: tx, y: 27.2, z: tz }));
      P.push(lathe([[0.01, 0], [4.1, 0], [4.0, 1.3], [3.4, 2.8], [2.3, 3.9], [1.0, 4.5], [0.01, 4.7]], 8, CU, { x: tx, y: 28.4, z: tz, ry: PI / 8 }));
      P.push(cyl(0.8, 0.9, 1.6, 8, ST, { x: tx, y: 33.8, z: tz }));
      P.push(cone(1.0, 1.6, 8, CU, { x: tx, y: 35.4, z: tz }));
      P.push(box(0.6, 0.6, 0.6, WARM, { x: tx, y: 33.8, z: tz + 0.6, glow: 1 }));
      return merge(P);
    },
  },

  classic_hotel: {
    name: 'クラシックホテル', kind: 'landmark',
    build: () => {
      const BG = 0xdcc8a0, BGd = 0xc3ad85, ST = 0xefe5cc, P = [];
      P.push(box(60, 25, 22, BG, { y: 12.5 }));
      P.push(box(60.4, 5.2, 22.4, BGd, { y: 2.6 }));
      P.push(box(61.4, 1.2, 23.4, ST, { y: 24.2 }), box(60.6, 1.6, 22.6, BG, { y: 25.6 }));
      P.push(box(60.8, 0.6, 22.8, ST, { y: 5.4 }));
      P.push(arches({ w: 60, d: 22, sides: 'fb', ys: [0.6], aw: 2.6, ah: 3.8, sp: 5, m: 4, col: WARM, glow: 0.85, trim: ST }));
      P.push(panes({ w: 60, d: 22, ys: [7.6, 11.4, 15.2, 19.0, 22.4], pw: 1.4, ph: 2.3, sp: 3.4, m: 3, col: WARM, glow: 0.8 }));
      // central bay with pilasters, canopy, balcony
      P.push(box(14, 27, 1.6, BG, { y: 13.5, z: 11.6 }));
      for (const x of [-6, -2, 2, 6]) P.push(box(1.1, 20, 0.6, ST, { x, y: 15.4, z: 12.6 }));
      P.push(arch(4, 5, 0xffc46a, { y: 0, z: 12.5, glow: 0.9 }));
      P.push(box(9, 0.5, 4.2, 0x6a2430, { y: 5.6, z: 14 }));
      P.push(box(10, 0.4, 1.4, ST, { y: 9.6, z: 13 }), box(10, 0.8, 0.1, IRON, { y: 10.2, z: 13.6 }));
      P.push(box(15, 2.4, 2, ST, { y: 26.6, z: 11.4 }));
      // rooftop flags
      for (const [x, c] of [[-20, 0xd8261c], [0, 0xffffff], [20, 0x2d64c0]]) {
        P.push(cyl(0.08, 0.1, 6, 4, WHITE, { x, y: 29.4, z: 9 }));
        P.push(box(2.2, 1.4, 0.06, c, { x: x + 1.1, y: 31.6, z: 9 }));
      }
      P.push(box(18, 1.4, 0.3, 0x6a2430, { y: 27.9, z: 12.3 }));
      P.push(box(14, 0.7, 0.2, 0xffe8b0, { y: 27.9, z: 12.5, glow: 0.9 }));
      return merge(P);
    },
  },

  sakuragicho_station: {
    name: '桜木町駅', kind: 'landmark',
    build: () => {
      const GL = 0x8fc3df, ST = 0xe8ecef, P = [];
      // two-level glass concourse with a steel frame
      P.push(box(60, 13, 16, GL, { y: 6.5, glow: 0.45 }));
      P.push(box(60.4, 0.6, 16.4, ST, { y: 6.6 }), box(60.4, 0.8, 16.4, ST, { y: 12.8 }));
      for (let i = 0; i <= 12; i++) for (const s of [1, -1]) P.push(box(0.6, 13, 0.6, ST, { x: -30 + i * 5, y: 6.5, z: s * 8.2 }));
      for (const s of [1, -1]) for (const z of [-4, 0, 4]) P.push(box(0.6, 13, 0.6, ST, { x: s * 30.2, y: 6.5, z }));
      // curved canopy roof
      P.push(cyl(10, 10, 66, 14, ST, { rz: PI / 2, y: 13, sx: 0.3 }));
      P.push(box(66, 0.4, 20.4, 0xcfd6dc, { y: 13 }));
      // entrance canopy & station sign
      P.push(box(24, 0.6, 6, ST, { y: 5, z: 11 }));
      for (const x of [-11, 11]) P.push(cyl(0.3, 0.3, 5, 6, ST, { x, y: 2.5, z: 13.6 }));
      P.push(box(18, 2.2, 0.4, 0xffffff, { y: 10.2, z: 8.7, glow: 0.8 }));
      P.push(box(18, 0.5, 0.45, 0x2d9a4a, { y: 9.2, z: 8.75, glow: 0.6 }));
      // elevated platform behind
      P.push(box(80, 1, 12, 0xc9ccce, { y: 9, z: -15 }));
      for (let x = -36; x <= 36; x += 12) P.push(box(1.2, 8.5, 1.2, 0xbfc3c6, { x, y: 4.25, z: -15 }));
      P.push(box(70, 0.4, 8, 0xe8ecef, { y: 14, z: -15 }));
      for (let x = -32; x <= 32; x += 8) P.push(box(0.4, 4.6, 0.4, STEEL, { x, y: 11.7, z: -15 }));
      P.push(box(70, 0.3, 7, 0xfff4cc, { y: 13.7, z: -15, glow: 0.7 }));
      return merge(P);
    },
  },

  ropeway_tower: {
    name: 'ロープウェイの支柱', kind: 'landmark',
    build: () => {
      const W = 0xf2f4f6, P = [];
      P.push(box(7, 1.2, 7, 0xb9bcbf, { y: 0.6 }));
      P.push(cyl(1.0, 1.8, 34, 8, W, { y: 18.2 }));
      P.push(cyl(1.85, 1.85, 1, 8, 0x2d9ad6, { y: 3 }), cyl(1.2, 1.2, 0.8, 8, 0x2d9ad6, { y: 33 }));
      // crossarm and cable sheaves (cables run along Z)
      P.push(box(13, 1.6, 2.4, W, { y: 36.2 }));
      for (const s of [-1, 1]) {
        P.push(beam([s * 0.8, 33, 0], [s * 5.6, 35.6, 0], 0.7, W));
        P.push(cyl(1.3, 1.3, 0.6, 12, STEEL, { x: s * 5.6, y: 38.2, rz: PI / 2 }));
        P.push(box(0.4, 1.6, 2.8, W, { x: s * 5.6, y: 37.4 }));
      }
      P.push(box(4, 0.2, 3, 0xcfd3d6, { y: 37.1 }));
      P.push(box(0.6, 0.6, 0.6, 0xff3a30, { y: 39.6, glow: 1 }));
      return merge(P);
    },
  },

  crane: {
    name: '港のガントリークレーン', kind: 'landmark',
    build: () => {
      const RD = 0xd8392b, W = 0xf3f3f0, P = [];
      const XL = 9, ZW = 12, ZB = -16;
      for (const x of [-XL, XL]) {
        for (const z of [ZW, ZB]) {
          P.push(box(1.8, 37, 1.8, RD, { x, y: 19.5, z }));
          for (const y of [10, 22]) P.push(box(1.9, 2, 1.9, W, { x, y, z }));
        }
        P.push(box(2, 2, ZW - ZB + 5, RD, { x, y: 2, z: (ZW + ZB) / 2 }));
        P.push(box(1.2, 1.2, ZW - ZB, RD, { x, y: 20, z: (ZW + ZB) / 2 }));
        for (const z of [ZW, ZB]) P.push(box(2.4, 1.6, 4, 0x3a3f46, { x, y: 0.8, z }));
      }
      for (const z of [ZW, ZB]) P.push(box(2 * XL + 2, 2.4, 2.2, RD, { y: 37.4, z }));
      // boom: alternating red/white segments
      for (let i = 0; i < 11; i++) {
        const z = -42 + 4 + i * 8, col = i % 2 ? W : RD;
        for (const s of [-1, 1]) P.push(box(1.4, 2.8, 8, col, { x: s * 3, y: 40, z }));
        P.push(box(7.4, 0.5, 0.6, col, { y: 41.2, z: z - 3.8 }));
      }
      // A-frame apex with stays
      const apex = [0, 60, ZB + 1];
      for (const s of [-1, 1]) {
        P.push(beam([s * 3, 41, ZB - 3], [s * 1, 60, ZB + 1], 1.2, W), beam([s * 3, 41, ZB + 8], [s * 1, 60, ZB + 1], 1.2, W));
        P.push(beam([s * 1, 60, ZB + 1], [s * 3, 41.4, 40], 0.45, W), beam([s * 1, 60, ZB + 1], [s * 3, 41.4, 14], 0.45, W));
        P.push(beam([s * 1, 60, ZB + 1], [s * 3, 41.4, -40], 0.45, W));
      }
      P.push(box(3, 1, 1.4, RD, { y: 60, z: ZB + 1 }));
      P.push(box(0.8, 0.8, 0.8, 0xff3a30, { x: apex[0], y: 61, z: apex[2], glow: 1 }));
      // machinery house, trolley, cab, spreader
      P.push(box(10, 6, 12, W, { y: 44.4, z: -34 }));
      P.push(box(10.2, 1.2, 0.1, WARM, { y: 45.4, z: -27.95, glow: 0.8 }));
      P.push(box(6, 2.6, 5, W, { y: 42.6, z: 22 }));
      P.push(box(3.4, 3, 3.6, 0x4a6a8a, { y: 37.2, z: 23.5, glow: 0.6 }));
      for (const s of [-1, 1]) P.push(box(0.15, 16, 0.15, IRON, { x: s * 1.5, y: 30, z: 21 }));
      P.push(box(5, 1, 12.5, 0xf0c02c, { y: 21.6, z: 21 }));
      // boom lights
      for (let z = -36; z <= 40; z += 12) P.push(box(0.6, 0.6, 0.6, 0xfff3b0, { x: 3.9, y: 38.4, z, glow: 1 }), box(0.6, 0.6, 0.6, 0xfff3b0, { x: -3.9, y: 38.4, z, glow: 1 }));
      return merge(P);
    },
  },

  // ===================== filler buildings =====================
  mm_tower: {
    name: 'みなとみらいのビル', kind: 'building', where: ['mm'], weight: 2,
    variants: [0x5f9cc8, 0x5fb3a0, 0x8a8ed6],
    build: (v = 0x5f9cc8) => {
      const idx = Math.max(0, [0x5f9cc8, 0x5fb3a0, 0x8a8ed6].indexOf(v));
      const lite = mix(v, 0xffffff, 0.72), FR = 0xe6ebee, P = [];
      P.push(box(48, 10, 42, 0xd7dde2, { y: 5 }));
      P.push(bands({ w: 48, d: 42, ys: [3.6, 7.6], h: 2.6, col: WARM, glow: 0.8 }));
      if (idx === 0) {
        // tall slab with a wedge-cut crown
        const w = 34, d = 28, H = 142, top = 128;
        P.push(box(w, top - 10, d, v, { y: 10 + (top - 10) / 2 }));
        P.push(extrude([[-w / 2, 0], [w / 2, 0], [w / 2, 4], [-w / 2, H - top]], d, v, { y: top }));
        P.push(bands({ w, d, ys: Array.from({ length: 28 }, (_, i) => 14 + i * 4.2), h: 1.6, col: lite, glow: 0.7 }));
        for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) P.push(box(1.4, top - 10, 1.4, FR, { x, y: 10 + (top - 10) / 2, z }));
        for (const s of [1, -1]) P.push(beam([-w / 2, H + 0.3, s * (d / 2 + 0.3)], [w / 2, top + 4.3, s * (d / 2 + 0.3)], 0.8, 0xfff2c0, { glow: 1 }));
        P.push(box(1, 1, 1, 0xff3a30, { x: -w / 2 + 1, y: H + 1, glow: 1 }));
      } else if (idx === 1) {
        // stepped setbacks with a lit crown and mast
        const steps = [[40, 30, 10, 70], [34, 26, 70, 98], [28, 22, 98, 114]];
        for (const [w, d, ya, yb] of steps) {
          P.push(box(w, yb - ya, d, v, { y: (ya + yb) / 2 }));
          const ys = []; for (let y = ya + 3; y < yb - 1; y += 4) ys.push(y);
          P.push(bands({ w, d, ys, h: 1.6, col: lite, glow: 0.7 }));
          P.push(box(w + 0.8, 0.8, d + 0.8, FR, { y: yb }));
        }
        P.push(box(18, 4, 14, FR, { y: 116 }));
        P.push(box(28.6, 1, 22.6, 0xfff2c0, { y: 112.5, glow: 1 }));
        P.push(cyl(0.3, 0.6, 6, 6, STEEL, { y: 121 }), box(0.8, 0.8, 0.8, 0xff3a30, { y: 124.2, glow: 1 }));
      } else {
        // rounded elliptical tower with crown ring
        const H = 104;
        P.push(cyl(17, 17, H - 10, 16, v, { y: 10 + (H - 10) / 2, sz: 0.8 }));
        for (let y = 15; y < H - 4; y += 5) P.push(cyl(17.3, 17.3, 1.6, 16, lite, { y, sz: 0.8, glow: 0.7 }));
        P.push(cyl(15, 17.6, 2, 16, FR, { y: H + 1, sz: 0.8 }));
        P.push(cyl(17.8, 17.8, 0.8, 16, 0xfff2c0, { y: H - 1, sz: 0.8, glow: 1 }));
        P.push(cyl(0.3, 0.5, 8, 6, STEEL, { y: H + 6 }), box(0.8, 0.8, 0.8, 0xff3a30, { y: H + 10.4, glow: 1 }));
      }
      return merge(P);
    },
  },

  office: {
    name: 'オフィスビル', kind: 'building', where: ['mm', 'kannai'], weight: 3,
    variants: [0xd9d2c3, 0x9fa9b2, 0xb9c9d6],
    build: (v = 0xd9d2c3) => {
      const idx = Math.max(0, [0xd9d2c3, 0x9fa9b2, 0xb9c9d6].indexOf(v));
      const H = [44, 52, 58][idx], w = [30, 26, 32][idx], d = [22, 22, 24][idx], P = [];
      P.push(box(w, H, d, v, { y: H / 2 }));
      const ys = []; for (let y = 6; y < H - 2; y += 3.8) ys.push(y);
      P.push(bands({ w, d, ys, h: 1.7, col: COOL, glow: 0.75, inset: 1 }));
      P.push(onFaces({ w, d, sides: 'fb', sp: 3.2, m: 1.6 }, (at) => box(0.4, H - 6, 0.5, shade(v, 0.8), { ...at(0.25), y: 3 + (H - 6) / 2 })));
      P.push(box(w + 1, 4.4, d + 1, shade(v, 0.75), { y: 2.2 }));
      P.push(box(w * 0.5, 3.6, 0.1, 0xc9ecff, { y: 1.9, z: d / 2 + 0.55, glow: 0.7 }));
      P.push(box(w * 0.6, 0.5, 4, shade(v, 0.6), { y: 4.6, z: d / 2 + 2 }));
      P.push(box(w + 0.6, 1, d + 0.6, shade(v, 0.85), { y: H + 0.5 }));
      P.push(box(w * 0.4, 3.5, d * 0.4, 0xc4c8cc, { y: H + 2.75, x: -w * 0.15 }));
      P.push(box(4, 1.6, 3, 0x9aa0a6, { x: w * 0.3, y: H + 1.8, z: d * 0.2 }));
      P.push(box(w * 0.5, 2.2, 0.3, [0x2d64c0, 0xd8261c, 0x2d9a4a][idx], { y: H - 2.5, z: d / 2 + 0.3, glow: 0.7 }));
      return merge(P);
    },
  },

  mansion: {
    name: 'マンション', kind: 'building', where: ['kannai'], weight: 2,
    variants: [0xece2cc, 0xcdb9a2],
    build: (v = 0xece2cc) => {
      const W = 36, D = 14, FH = 3, NF = 11, P = [];
      P.push(box(W, NF * FH + 1, D, v, { y: (NF * FH + 1) / 2 }));
      P.push(box(W + 0.4, 3.4, D + 0.4, shade(v, 0.8), { y: 1.7 }));
      for (let f = 1; f < NF; f++) {
        const y = 1 + f * FH;
        P.push(box(W, 0.25, 1.6, 0xf4f2ee, { y, z: D / 2 + 0.8 }));
        P.push(box(W, 1.1, 0.12, 0xa9c8d8, { y: y + 0.6, z: D / 2 + 1.55, glow: 0.1 }));
        P.push(box(W, 0.15, 0.2, 0xf4f2ee, { y: y + 1.2, z: D / 2 + 1.55 }));
        for (let u = 0; u < 6; u++) {
          const x = -W / 2 + 3 + u * 6;
          P.push(plane(3.6, 2.0, (u + f) % 3 ? WARM : 0x9fb4c4, { x, y: y + 1.2, z: D / 2 + 0.06, glow: (u + f) % 3 ? 0.85 : 0.1 }));
        }
        for (let u = 0; u <= 6; u++) P.push(box(0.2, 1.2, 1.6, 0xd8d4cc, { x: -W / 2 + u * 6, y: y + 0.6, z: D / 2 + 0.8 }));
      }
      P.push(panes({ w: W, d: D, sides: 'blr', ys: Array.from({ length: NF - 1 }, (_, i) => 2.6 + (i + 1) * FH), pw: 1.2, ph: 1.4, sp: 4, m: 2.5, col: WARM, glow: 0.7 }));
      P.push(box(8, 4, 6, shade(v, 0.9), { y: NF * FH + 3, x: 10 }));
      P.push(cyl(1.8, 1.8, 3, 8, 0xc4c8cc, { y: NF * FH + 2.5, x: -10 }));
      P.push(box(6, 3, 0.1, 0xffe0a0, { y: 1.8, z: D / 2 + 0.25, glow: 0.8 }));
      return merge(P);
    },
  },

  brick_building: {
    name: 'レンガのビル', kind: 'building', where: ['kannai'], weight: 2,
    build: () => {
      const BR = 0xa84a32, ST = 0xeee5d2, P = [];
      const W = 24, D = 18, H = 18.5;
      P.push(box(W, H, D, BR, { y: H / 2 }));
      P.push(box(W + 0.4, 1.4, D + 0.4, 0x9c968c, { y: 0.7 }));
      for (const y of [4.6, 9.1, 13.6]) P.push(box(W + 0.3, 0.4, D + 0.3, ST, { y }));
      P.push(box(W + 1.2, 1, D + 1.2, ST, { y: H }), box(W + 0.4, 1.2, D + 0.4, BR, { y: H + 1.1 }));
      for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) P.push(box(1.2, H, 1.2, ST, { x, y: H / 2, z }));
      P.push(arches({ w: W, d: D, ys: [1.6, 5.4, 9.9, 14.4], aw: 1.5, ah: 2.8, sp: 3.8, m: 2.8, col: WARM, glow: 0.85, trim: ST }));
      P.push(arch(3, 4, 0xffc46a, { y: 0, z: D / 2 + 0.25, glow: 0.9 }));
      P.push(box(4.4, 0.6, 0.8, ST, { y: 4.3, z: D / 2 + 0.3 }));
      P.push(box(5, 3.2, 0.6, BR, { y: H + 2.6, z: D / 2 - 0.3 }));
      P.push(box(5.4, 0.4, 0.8, ST, { y: H + 4.3, z: D / 2 - 0.3 }));
      return merge(P);
    },
  },

  china_building: {
    name: '中華街のビル', kind: 'building', where: ['chinatown'], weight: 4,
    variants: [0xf0e2c8, 0xe2c6a8],
    build: (v = 0xf0e2c8) => {
      const W = 14, D = 12, H = 17.6, CR = 0xd8261c, GR = 0x2e9a5e, P = [];
      const seed = v === 0xf0e2c8 ? 3 : 7;
      P.push(box(W, H, D, v, { y: H / 2 }));
      P.push(box(W + 0.4, 0.8, D + 0.4, CR, { y: H + 0.4 }));
      // shopfront: red pillars, glowing shop, green tiled eave
      P.push(plane(W - 2, 3.4, 0xffd38a, { y: 1.9, z: D / 2 + 0.06, glow: 0.9 }));
      for (const x of [-W / 2 + 0.5, W / 2 - 0.5]) P.push(box(0.9, 4, 0.9, CR, { x, y: 2, z: D / 2 + 0.2 }));
      P.push(cnRoof({ y: 3.9, z: D / 2 + 0.6, hx: W / 2 + 0.4, hz: 1.2, h: 0.9 }));
      // big horizontal sign with gold characters
      P.push(box(W - 1, 2, 0.4, GOLD, { y: 6.0, z: D / 2 + 0.35, glow: 0.3 }));
      P.push(box(W - 1.6, 1.6, 0.5, CR, { y: 6.0, z: D / 2 + 0.4, glow: 0.45 }));
      for (let i = 0; i < 4; i++) P.push(glyph(seed + i, 1.1, 0xffe04a, 1, { x: -4.2 + i * 2.8, y: 6.0, z: D / 2 + 0.7 }));
      // windows on the upper floors
      P.push(panes({ w: W, d: D, sides: 'fblr', ys: [9.0, 12.4, 15.8], pw: 1.8, ph: 1.8, sp: 3, m: 2.2, col: WARM, glow: 0.8 }));
      // vertical projecting signs
      const vs = [[-W / 2 + 1, CR, 0xffe04a], [W / 2 - 1, GR, 0xffe04a]];
      vs.forEach(([x, c, g], k) => {
        P.push(box(0.5, 7.4, 2.2, GOLD, { x, y: 12.6, z: D / 2 + 1.3, glow: 0.3 }));
        P.push(box(0.6, 7, 1.9, c, { x, y: 12.6, z: D / 2 + 1.3, glow: 0.5 }));
        for (let i = 0; i < 3; i++) P.push(glyph(seed * 5 + k * 3 + i, 1.2, g, 1, { x, y: 15 - i * 2.2, z: D / 2 + 1.3, ry: PI / 2, sz: 1.6 }));
      });
      // a string of red lanterns across the facade
      P.push(beam([-W / 2, 8.2, D / 2 + 0.6], [W / 2, 8.2, D / 2 + 0.6], 0.06, IRON));
      for (let i = 0; i < 6; i++) {
        const x = -W / 2 + 1.4 + i * ((W - 2.8) / 5);
        P.push(sphere(0.48, 8, 5, 0xff3b2a, { x, y: 7.6, z: D / 2 + 0.6, sy: 0.85, glow: 0.95 }));
        P.push(box(0.08, 0.35, 0.08, GOLD, { x, y: 7.0, z: D / 2 + 0.6 }));
      }
      // neon strip down the side and a rooftop billboard
      P.push(box(0.3, 12, 0.3, 0xff6fd8, { x: W / 2 + 0.2, y: 10.5, z: D / 2 - 1, glow: 1 }));
      P.push(box(9, 3.4, 0.4, GR, { y: H + 2.6, z: 1, glow: 0.5 }));
      P.push(box(9.4, 0.3, 0.5, GOLD, { y: H + 4.4, z: 1, glow: 0.5 }));
      for (let i = 0; i < 3; i++) P.push(glyph(seed + 20 + i, 1.4, 0xfff0a0, 1, { x: -2.8 + i * 2.8, y: H + 2.6, z: 1.3 }));
      for (const x of [-3.5, 3.5]) P.push(box(0.3, 1.6, 0.3, IRON, { x, y: H + 0.8, z: 1 }));
      return merge(P);
    },
  },

  museum: {
    name: 'ミュージアム', kind: 'building', where: ['mm'], weight: 1,
    build: () => {
      const ST = 0xe4ddd0, STd = 0xc8bfae, GL = 0x7fb3d6, P = [];
      // symmetric wings + central tower block with a glass lantern
      P.push(box(76, 14, 36, ST, { y: 7 }));
      for (let y = 9.5; y < 14; y += 1.4) P.push(box(77, 0.4, 37, STd, { y }));
      P.push(box(26, 26, 26, ST, { y: 13, z: -2 }));
      P.push(box(26.4, 1.2, 26.4, STd, { y: 26.4, z: -2 }));
      P.push(cyl(9, 9, 4, 12, GL, { y: 28.6, z: -2, glow: 0.7 }));
      P.push(box(18, 18, 0.6, GL, { y: 9, z: 18.2, glow: 0.6 }));
      for (const x of [-6, 0, 6]) P.push(box(0.5, 18, 0.5, STd, { x, y: 9, z: 18.6 }));
      P.push(box(24, 0.8, 8, ST, { y: 8.6, z: 21 }));
      P.push(bands({ w: 76, d: 36, ys: [4], h: 2, col: WARM, glow: 0.75, sides: 'blr', inset: 2 }));
      for (const [x, c] of [[-26, 0xff6fa8], [-20, 0xffd23a], [20, 0x4cc4ff], [26, 0x5ee07a]]) {
        P.push(box(3.6, 9, 0.3, c, { x, y: 7.5, z: 18.3, glow: 0.4 }));
      }
      // sculpture in the plaza
      P.push(box(1.6, 6, 1.6, 0xe8343a, { x: -12, y: 3.4, z: 26, rz: 0.4 }), box(1.6, 5, 1.6, 0xe8343a, { x: -10.5, y: 2.9, z: 26, rz: -0.5 }));
      return merge(P);
    },
  },

  warehouse: {
    name: '倉庫', kind: 'building', where: ['port'], weight: 2,
    build: () => {
      const W = 60, D = 26, H = 11, WALL = 0x9fb3c2, P = [];
      P.push(box(W, H, D, WALL, { y: H / 2 }));
      for (let x = -W / 2 + 1.5; x <= W / 2 - 1.5; x += 3) for (const s of [1, -1]) P.push(box(0.4, H, 0.3, shade(WALL, 0.88), { x, y: H / 2, z: s * (D / 2 + 0.1) }));
      P.push(extrude([[-D / 2 - 0.8, 0], [D / 2 + 0.8, 0], [0, 2.6]], W + 1.4, 0x6f7f8c, { ry: PI / 2, y: H }));
      P.push(box(W + 1, 1.2, 4, 0xbcbcb4, { y: 0.6, z: D / 2 + 2 }));
      for (let i = 0; i < 5; i++) {
        const x = -24 + i * 12;
        P.push(box(7, 6.5, 0.4, i % 2 ? 0xe8763a : 0xf0b43a, { x, y: 3.25 + 1.2, z: D / 2 + 0.35 }));
        for (let k = 0; k < 6; k++) P.push(box(7, 0.12, 0.45, 0x8a5a2a, { x, y: 1.6 + k * 1.1, z: D / 2 + 0.4 }));
        P.push(box(0.8, 0.5, 0.6, 0xfff0b0, { x, y: 8.6, z: D / 2 + 0.4, glow: 1 }));
      }
      P.push(digits('3', 5, WHITE, 0.3, { x: W / 2 + 0.3, y: 8, ry: PI / 2 }));
      P.push(digits('3', 5, WHITE, 0.3, { x: -W / 2 - 0.3, y: 8, ry: -PI / 2 }));
      return merge(P);
    },
  },

  container_stack: {
    name: 'コンテナの山', kind: 'building', where: ['port'], weight: 3,
    build: () => {
      const r = rng(2024), cols = [0xd8392b, 0x2d64c0, 0x2d9a4a, 0xf08a24, 0x8a929a, 0xf0c02c, 0x2aa6a0, 0x8a3a8a, 0xe8e8e2];
      const CL = 12.2, CW = 2.44, CH = 2.4, P = [];
      for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 5; iz++) {
        const n = 2 + Math.floor(r() * 4) + (iz === 2 ? 1 : 0);
        for (let k = 0; k < Math.min(5, n); k++) {
          const c = cols[Math.floor(r() * cols.length)];
          const x = (ix - 0.5) * (CL + 0.4), z = (iz - 2) * (CW + 0.25), y = CH / 2 + k * CH;
          P.push(box(CL, CH - 0.06, CW, c, { x, y, z }));
          P.push(box(CL + 0.06, 0.18, CW + 0.06, shade(c, 0.7), { x, y: y + CH / 2 - 0.12, z }));
          for (const s of [-1, 1]) P.push(box(0.1, CH - 0.2, CW + 0.04, shade(c, 0.8), { x: x + s * (CL / 2 - 1.6), y, z }));
        }
      }
      P.push(box(0.6, 0.6, 0.6, 0xfff0b0, { x: -CL - 0.5, y: 3, z: 6.6, glow: 1 }));
      return merge(P);
    },
  },
};

// a little lifeboat hanging in its davits (used by the liner)
function capsuleBoat(x, y, z) {
  return [
    box(2.2, 1.4, 6, 0xf4f2ea, { x, y, z }),
    box(2.3, 0.4, 6.1, 0xe8762a, { x, y: y + 0.8, z }),
    box(0.2, 2.2, 0.2, 0x8a929a, { x, y: y + 0.9, z: z - 2.5 }),
    box(0.2, 2.2, 0.2, 0x8a929a, { x, y: y + 0.9, z: z + 2.5 }),
  ];
}
