// js/math4.js — geometry in 3, 4 and 5 dimensions, with no three.js in it (the tests run it in Node).
//
// Everything here is ordinary linear algebra that works the same in any number of dimensions:
// - a rotation always happens in a PLANE (two axes), never "around an axis": 3 planes in 3D, 6 in 4D, 10 in 5D
// - the regular polytopes of 4D (5-cell, tesseract, 16-cell, 24-cell) and the n-cube for any n
// - slicing a 4D polytope with a 3D hyperplane: what a 3D being sees when it passes through our space
// - perspective projection n → 3: the "shadow" of the object, cast by a light out along the extra axes
export const AXIS_NAMES = ['X', 'Y', 'Z', 'W', 'V'];

export function identity(n) {
  const m = new Float64Array(n * n);
  for (let i = 0; i < n; i++) m[i * n + i] = 1;
  return m;
}

// m ← R · m, where R rotates by angle a in the plane of axes i and j (turning axis i towards axis j).
// Left-multiplying means the rotation is in the viewer's (world) axes, whatever m already is.
export function rotate(m, n, i, j, a) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let k = 0; k < n; k++) {
    const mi = m[i * n + k], mj = m[j * n + k];
    m[i * n + k] = c * mi - s * mj;
    m[j * n + k] = s * mi + c * mj;
  }
  return m;
}

// m ← A · m for a 3×3 rotation A (column-major, as three.js Matrix3.elements) acting on the first three axes
export function rotate3(m, n, e) {
  const r = new Float64Array(3 * n);
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < n; k++) r[i * n + k] = e[i] * m[k] + e[3 + i] * m[n + k] + e[6 + i] * m[2 * n + k];
  }
  m.set(r, 0);
  return m;
}

export function apply(m, n, v, out = new Array(n)) {
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += m[i * n + k] * v[k];
    out[i] = s;
  }
  return out;
}

// keep a long chain of small rotations exactly orthonormal (Gram–Schmidt on the rows)
export function orthonormalize(m, n) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      let d = 0;
      for (let k = 0; k < n; k++) d += m[i * n + k] * m[j * n + k];
      for (let k = 0; k < n; k++) m[i * n + k] -= d * m[j * n + k];
    }
    let l = 0;
    for (let k = 0; k < n; k++) l += m[i * n + k] ** 2;
    l = Math.sqrt(l) || 1;
    for (let k = 0; k < n; k++) m[i * n + k] /= l;
  }
  return m;
}

// a rotation that turns unit vector `from` into unit vector `to` (both length n), in the plane they span
export function alignRotation(n, from, to) {
  const m = identity(n);
  let d = 0;
  for (let k = 0; k < n; k++) d += from[k] * to[k];
  const ang = Math.acos(Math.max(-1, Math.min(1, d)));
  if (ang < 1e-12) return m;
  // orthonormal u = from, v = (to - d·from)/|…|; R = I + (cos-1)(uuᵀ+vvᵀ) + sin(vuᵀ - uvᵀ)
  const v = to.map((t, k) => t - d * from[k]);
  const vl = Math.hypot(...v);
  for (let k = 0; k < n; k++) v[k] /= vl;
  const c = Math.cos(ang) - 1, s = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      m[i * n + j] += c * (from[i] * from[j] + v[i] * v[j]) + s * (v[i] * from[j] - from[i] * v[j]);
    }
  }
  return m;
}

const dist2 = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2; return s; };
const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };

// number of k-dimensional faces of the n-cube: 2^(n-k) · C(n, k)
export function cubeFaces(n, k) {
  return k > n ? 0 : 2 ** (n - k) * binom(n, k);
}

// the n-cube with vertices (±1, …, ±1); an edge joins two vertices that differ in one coordinate
export function hypercube(n) {
  const verts = [];
  for (let b = 0; b < 1 << n; b++) verts.push(Array.from({ length: n }, (_, k) => (b >> k & 1 ? 1 : -1)));
  const edges = [];
  for (let a = 0; a < verts.length; a++) {
    for (let k = 0; k < n; k++) {
      const b = a ^ (1 << k);
      if (b > a) edges.push([a, b, k]); // k: the axis this edge runs along
    }
  }
  return { n, verts, edges };
}

function shortestEdges(verts) {
  let min = Infinity;
  for (let a = 0; a < verts.length; a++) for (let b = a + 1; b < verts.length; b++) min = Math.min(min, dist2(verts[a], verts[b]));
  const edges = [];
  for (let a = 0; a < verts.length; a++) for (let b = a + 1; b < verts.length; b++) if (Math.abs(dist2(verts[a], verts[b]) - min) < 1e-6) edges.push([a, b]);
  return edges;
}

// Regular 4D polytopes, scaled so every vertex is at distance 2 from the centre (the tesseract is then
// [-1, 1]^4). Each has its cells (3D faces), found from the cells' outward normals: a cell is the set of
// vertices that go furthest along its normal.
export const POLYTOPES = {
  tesseract: {
    name: '超立方体', en: 'tesseract', cellName: '立方体',
    verts: () => hypercube(4).verts,
    normals: () => [0, 1, 2, 3].flatMap((k) => [1, -1].map((s) => Array.from({ length: 4 }, (_, i) => (i === k ? s : 0)))),
  },
  '5cell': {
    name: '正五胞体', en: '5-cell', cellName: '正四面体',
    verts: () => {
      const a = (1 - Math.sqrt(5)) / 4; // (a,a,a,a) is √2 from each e_i, as far as the e_i are from each other
      const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [a, a, a, a]];
      const c = [0, 1, 2, 3].map((k) => v.reduce((s, p) => s + p[k], 0) / 5);
      return v.map((p) => p.map((x, k) => x - c[k]));
    },
    normals: (verts) => verts.map((p) => p.map((x) => -x)), // the cell opposite a vertex faces away from it
  },
  '16cell': {
    name: '正十六胞体', en: '16-cell', cellName: '正四面体',
    verts: () => [0, 1, 2, 3].flatMap((k) => [1, -1].map((s) => Array.from({ length: 4 }, (_, i) => (i === k ? s : 0)))),
    normals: () => hypercube(4).verts,
  },
  '24cell': {
    name: '正二十四胞体', en: '24-cell', cellName: '正八面体',
    verts: () => {
      const v = [];
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (const si of [1, -1]) for (const sj of [1, -1]) {
        const p = [0, 0, 0, 0];
        p[i] = si; p[j] = sj;
        v.push(p);
      }
      return v;
    },
    normals: () => [...POLYTOPES['16cell'].verts(), ...hypercube(4).verts.map((p) => p.map((x) => x / 2))],
  },
};
const cache = new Map();
export function polytope(key) {
  if (cache.has(key)) return cache.get(key);
  const def = POLYTOPES[key];
  let verts = def.verts();
  const r = Math.max(...verts.map((p) => Math.hypot(...p)));
  verts = verts.map((p) => p.map((x) => (x * 2) / r));
  const edges = shortestEdges(verts);
  const cells = def.normals(verts).map((nv) => {
    const l = Math.hypot(...nv);
    const n = nv.map((x) => x / l);
    const dots = verts.map((p) => p.reduce((s, x, k) => s + x * n[k], 0));
    const max = Math.max(...dots);
    const set = new Set(dots.map((d, i) => (d > max - 1e-6 ? i : -1)).filter((i) => i >= 0));
    return { n, verts: [...set], edges: edges.filter(([a, b]) => set.has(a) && set.has(b)) };
  });
  const P = { key, ...def, verts, edges, cells };
  cache.set(key, P);
  return P;
}

// Slice a 4D convex polytope (vertices already rotated, rv[i] = [x,y,z,w]; cell normals rotated, rn[c])
// with the hyperplane w = w0. Each cell that the hyperplane cuts leaves a convex polygon; together they are
// the closed surface of the 3D cross-section. Returns [{ cell, pts: [[x,y,z]…] (counter-clockwise seen
// from outside), n: outward normal }].
export function slice4(P, rv, rn, w0) {
  const polys = [];
  const e = 1e-9;
  for (let c = 0; c < P.cells.length; c++) {
    const cell = P.cells[c];
    let nx = rn[c][0], ny = rn[c][1], nz = rn[c][2];
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-7) continue; // the cell is parallel to the slice: its neighbours' polygons draw it
    nx /= nl; ny /= nl; nz /= nl;
    const pts = [];
    const add = (p) => { for (const q of pts) if (dist2(p, q) < 1e-12) return; pts.push(p); };
    for (const [a, b] of cell.edges) {
      const A = rv[a], B = rv[b];
      const da = A[3] - w0, db = B[3] - w0;
      if (Math.abs(da) <= e) add([A[0], A[1], A[2]]);
      if (Math.abs(db) <= e) add([B[0], B[1], B[2]]);
      if ((da < -e && db > e) || (da > e && db < -e)) {
        const t = da / (da - db);
        add([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
      }
    }
    if (pts.length < 3) continue;
    polys.push({ cell: c, pts: orderPolygon(pts, [nx, ny, nz]), n: [nx, ny, nz] });
  }
  return polys;
}

// sort coplanar points of a convex polygon counter-clockwise around normal n
export function orderPolygon(pts, n) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  let u = [pts[0][0] - c[0], pts[0][1] - c[1], pts[0][2] - c[2]];
  const ul = Math.hypot(...u) || 1;
  u = u.map((x) => x / ul);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return pts
    .map((p) => {
      const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      return { p, a: Math.atan2(d[0] * v[0] + d[1] * v[1] + d[2] * v[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) };
    })
    .sort((x, y) => x.a - y.a)
    .map((x) => x.p);
}

// One dimension lower, for the side-by-side analogies: slice a 3D convex polytope (rotated vertices
// [x,y,z]) with the plane z = z0 → its convex polygon (ordered), in the plane's own (x, y).
export function slice3(verts, edges, z0) {
  const pts = [];
  const e = 1e-9;
  const add = (p) => { for (const q of pts) if (dist2(p, q) < 1e-12) return; pts.push(p); };
  for (const [a, b] of edges) {
    const A = verts[a], B = verts[b];
    const da = A[2] - z0, db = B[2] - z0;
    if (Math.abs(da) <= e) add([A[0], A[1]]);
    if (Math.abs(db) <= e) add([B[0], B[1]]);
    if ((da < -e && db > e) || (da > e && db < -e)) {
      const t = da / (da - db);
      add([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
  }
  if (pts.length < 3) return pts;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
}

// Perspective projection from n dimensions down to 3: a point light (or eye) sits at distance d out along
// each extra axis in turn (V, then W). Returns [x, y, z, s] where s is the total scale factor: nearer the
// light along the extra axes means bigger (s > 1), further means smaller.
export function project(v, n, d, out = [0, 0, 0, 1]) {
  const c = v.slice(0, n);
  let s = 1;
  for (let k = n - 1; k >= 3; k--) {
    const f = d / Math.max(1e-3, d - c[k]);
    for (let i = 0; i < k; i++) c[i] *= f;
    s *= f;
  }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = s;
  return out;
}

// volume of a closed convex polyhedron given as ordered outward polygons (for the tests)
export function polyhedronVolume(polys) {
  let v = 0;
  for (const { pts } of polys) {
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[0], b = pts[i], c = pts[i + 1];
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return v;
}

// colour code for the 4th coordinate: kata (−W, away) is blue, ana (+W, towards the light) is orange
export function wColor(t) {
  // t in [-1, 1]
  const k = Math.max(-1, Math.min(1, t));
  const blue = [0.25, 0.62, 1.0], mid = [0.86, 0.88, 0.95], orange = [1.0, 0.58, 0.18];
  const [a, b, u] = k < 0 ? [mid, blue, -k] : [mid, orange, k];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
