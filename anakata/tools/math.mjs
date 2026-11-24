// tools/math.mjs — checks the geometry and physics that the experience claims, in plain Node:
// - the n-cube face counts 2^(n-k)·C(n,k) (the table in chapter 1)
// - the regular 4D polytopes have the right numbers of vertices, edges and cells
// - slicing: a tesseract passing "cell first" always shows a cube of volume 8; passing "vertex first" it shows
//   a point → tetrahedron → … → an octahedron in the middle (6 vertices, 8 faces) (chapter 3)
// - rotations stay orthonormal; a double rotation (XY and ZW) leaves only the centre fixed (chapter 4)
// - orbits: 1/r² keeps a disturbed circular orbit bounded; 1/r³ makes the same throw fall in (chapter 5)
// - the room's history: a push at time t changes nothing before t and something after (chapter 6)
//   node tools/math.mjs
import { register } from 'node:module';
import * as M from '../js/math4.js';

register('./three-hook.mjs', import.meta.url);

let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// 1. n-cube counts
const expect = { 0: [1], 1: [2, 1], 2: [4, 4, 1], 3: [8, 12, 6, 1], 4: [16, 32, 24, 8, 1], 5: [32, 80, 80, 40, 10, 1] };
for (const [n, row] of Object.entries(expect)) check(row.every((v, k) => M.cubeFaces(+n, k) === v), `${n}-cube faces: ${row.join(', ')}`);
for (let n = 1; n <= 5; n++) {
  const c = M.hypercube(n);
  check(c.verts.length === 2 ** n && c.edges.length === n * 2 ** (n - 1), `${n}-cube built with ${c.verts.length} vertices and ${c.edges.length} edges`);
}

// 2. polytopes
const want = { tesseract: [16, 32, 8, 8], '5cell': [5, 10, 5, 4], '16cell': [8, 24, 16, 4], '24cell': [24, 96, 24, 6] };
for (const [k, [v, e, c, cv]] of Object.entries(want)) {
  const P = M.polytope(k);
  check(P.verts.length === v && P.edges.length === e && P.cells.length === c && P.cells.every((x) => x.verts.length === cv),
    `${P.name}: ${v} vertices, ${e} edges, ${c} cells of ${cv} vertices`);
  check(P.verts.every((p) => near(Math.hypot(...p), 2)), `${P.name}: every vertex 2 from the centre`);
}

// 3. slicing
const slice = (key, R, w) => {
  const P = M.polytope(key);
  const rv = P.verts.map((v) => M.apply(R, 4, v));
  const rn = P.cells.map((c) => M.apply(R, 4, c.n));
  return M.slice4(P, rv, rn, w);
};
const I = M.identity(4);
check([-0.95, -0.5, 0, 0.3, 0.9].every((w) => near(M.polyhedronVolume(slice('tesseract', I, w)), 8)), 'tesseract cell-first: every slice is a cube of volume 8');
check(slice('tesseract', I, 1.2).length === 0, 'tesseract cell-first: nothing outside |w| ≤ 1');
const V = M.alignRotation(4, [0.5, 0.5, 0.5, 0.5], [0, 0, 0, 1]);
const vertsOf = (polys) => new Set(polys.flatMap((p) => p.pts.map((q) => q.map((x) => x.toFixed(5)).join())));
const mid = slice('tesseract', V, 0);
check(mid.length === 8 && vertsOf(mid).size === 6, `tesseract vertex-first, middle: octahedron (${mid.length} faces, ${vertsOf(mid).size} vertices)`);
const early = slice('tesseract', V, -1.5);
check(early.length === 4 && vertsOf(early).size === 4, `tesseract vertex-first, early: tetrahedron (${early.length} faces)`);
const trunc = slice('tesseract', V, -0.5);
check(vertsOf(trunc).size === 12, `tesseract vertex-first, between: truncated tetrahedron (${vertsOf(trunc).size} vertices)`);
check(slice('24cell', I, 0).every((p) => p.pts.length >= 3) && M.polyhedronVolume(slice('24cell', I, 0)) > 0, '24-cell: a closed solid slice through the middle');

// 4. rotations
const R = M.identity(4);
for (let i = 0; i < 2000; i++) { M.rotate(R, 4, i % 4, (i + 1) % 4, 0.01); M.rotate(R, 4, 0, 3, 0.013); }
M.orthonormalize(R, 4);
let orth = true;
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
  let d = 0;
  for (let k = 0; k < 4; k++) d += R[i * 4 + k] * R[j * 4 + k];
  if (!near(d, i === j ? 1 : 0, 1e-9)) orth = false;
}
check(orth, 'a long chain of rotations stays orthonormal');
const D = M.rotate(M.rotate(M.identity(4), 4, 0, 1, 0.7), 4, 2, 3, 0.7);
const moved = [[1, 0, 0, 0], [0, 0, 1, 0], [0.3, 0.2, 0.5, 0.1]].every((v) => Math.hypot(...M.apply(D, 4, v).map((x, k) => x - v[k])) > 1e-3);
check(moved, 'double rotation XY + ZW moves every point but the centre');
const p4 = M.project([0, 0, 0, 1], 4, 3), p4b = M.project([0, 0, 0, -1], 4, 3);
check(near(p4[3], 1.5) && near(p4b[3], 0.75), 'perspective from W: ana (+W) is drawn bigger than kata (−W)');

// 5. orbits under 1/r^(n-1)
function orbit(n, k) {
  const R0 = 0.3, V0 = 0.62, GM = V0 * V0 * Math.pow(R0, n - 2);
  let x = R0, y = 0, vx = 0, vy = V0 * k;
  let rmin = R0, rmax = R0;
  const h = 1 / 2400;
  for (let i = 0; i < 2400 * 20; i++) {
    const r = Math.hypot(x, y);
    const a = -GM / Math.pow(r, n);
    vx += a * x * h; vy += a * y * h;
    x += vx * h; y += vy * h;
    const r2 = Math.hypot(x, y);
    rmin = Math.min(rmin, r2); rmax = Math.max(rmax, r2);
    if (r2 < 0.067 || r2 > 3) return { rmin, rmax, fate: r2 < 0.067 ? 'fell' : 'escaped' };
  }
  return { rmin, rmax, fate: 'bound' };
}
const o3 = orbit(3, 0.985), o4 = orbit(4, 0.985), o4f = orbit(4, 1.015), o2 = orbit(2, 0.82);
check(o3.fate === 'bound' && o3.rmax - o3.rmin < 0.02, `1/r²: 1.5% slow stays bound, r in [${o3.rmin.toFixed(3)}, ${o3.rmax.toFixed(3)}] for 20 s`);
check(o4.fate === 'fell', `1/r³: 1.5% slow falls in (${o4.fate})`);
check(o4f.fate === 'escaped' || o4f.rmax > 0.9, `1/r³: 1.5% fast runs away (${o4f.fate}, r up to ${o4f.rmax.toFixed(2)})`);
check(o2.fate === 'bound', `1/r: always bound (${o2.fate})`);

// 6. the room's history (needs three.js only for Vector3)
try {
  const { simulate } = await import('../js/chapters/tesseract.js');
  const a = simulate([]);
  const b = simulate([{ t: 10, kind: 'ball', dv: [1.5, 2.4, 0] }]);
  let pastSame = true, futureDiff = 0;
  for (let k = 0; k < a.ball.length / 3; k++) {
    const d = Math.hypot(a.ball[k * 3] - b.ball[k * 3], a.ball[k * 3 + 1] - b.ball[k * 3 + 1], a.ball[k * 3 + 2] - b.ball[k * 3 + 2]);
    if (k / 60 < 10 && d > 1e-9) pastSame = false;
    if (k / 60 > 10.5) futureDiff = Math.max(futureDiff, d);
  }
  check(pastSame && futureDiff > 0.3, `a push at t = 10 s: the past is identical, the future differs by up to ${futureDiff.toFixed(2)} m`);
  const T = 2 * Math.PI * Math.sqrt(0.9 / 9.81);
  const pend = a.pend;
  let crossings = [];
  for (let k = 1; k < pend.length; k++) if (pend[k - 1] < 0 && pend[k] >= 0) crossings.push(k / 60);
  const measured = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
  check(Math.abs(measured - T) / T < 0.02, `the 0.9 m pendulum swings with period ${measured.toFixed(3)} s (2π√(L/g) = ${T.toFixed(3)} s; a bit longer at 24°)`);
} catch (e) {
  check(false, 'room simulation: ' + e.message);
}

process.exit(ok ? 0 : 1);
