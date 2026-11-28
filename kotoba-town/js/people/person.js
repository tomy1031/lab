// Procedural townspeople built from a `look` card (content/cast.js).
// The body is modelled from smooth parametric surfaces — a superellipse trunk and pelvis, lathed arms
// and legs, skirts and coat tails — on a bone hierarchy, then baked into ONE indexed GPU-skinned mesh
// (vertex colours; the surface kind rides along per vertex). With the head (which paints its own face)
// and, for some, a few printed details, a person costs 2–3 draw calls and about 8–11k triangles on Quest.
// The look is a soft toy figure: a big head, a short neck, narrow sloped shoulders, rounded limbs.
// Limbs, waist, skirts and coat tails use blended skin weights, so elbows, knees, bows and sitting bend
// without seams. Clothing details (collars, lapels, plackets, pockets, ribbing, prints) are thin layers
// laid on the same surfaces, so they follow the body exactly. Hands are soft mittens with a thumb.
// Animation: breathing, idle sway, posture, blinking, look-at, lip-sync, hand poses and gestures.
// Root at the feet, facing +z (the person's left is +x).
import * as THREE from 'three';
import { makeFace, headPoint, FACE, SKIN_GLOW, SKIN_ROUGH, toyShade } from './face.js';
import { buildHair } from './hair.js';
import { CAST } from '../content/cast.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const env = (p, a = 0.25, r = 0.3) => (p < a ? smooth(0, a, p) : p > 1 - r ? 1 - smooth(1 - r, 1, p) : 1);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = THREE.MathUtils.clamp;
const spow = (x, p) => Math.sign(x) * Math.abs(x) ** p;

/** Lightweight "material" descriptor: colour + surface kind (matte | gloss | skin | hair, or print for the atlas). */
const C = (color, bucket = 'matte') => ({ color: new THREE.Color(color), bucket });
const shade = (c, k, bucket) => ({ color: c.color.clone().multiplyScalar(k), bucket: bucket || c.bucket });
const blend = (c, hex, t, bucket) => ({ color: c.color.clone().lerp(new THREE.Color(hex), t), bucket: bucket || c.bucket });
/** Perceived brightness 0..1 (to pick light or dark details on a garment). */
const luma = (c) => 0.3 * c.color.r + 0.59 * c.color.g + 0.11 * c.color.b;

const SKIRT_TYPES = new Set(['blouse', 'store_uniform', 'teacher', 'museum_uniform']);
const SHORT_SLEEVES = new Set(['polo', 'konbini']);
const JACKETS = new Set(['suit', 'station_uniform', 'museum_uniform', 'store_uniform']);
const TUCKED = new Set(['shirt', 'blouse', 'apron']);

// ------------------------------------------------------------------ shared materials
// Everything except the printed details shares ONE material: the surface kind of each vertex (how rough,
// how much it glows from within) rides along as a vertex attribute, so a person is one skinned draw call.
const KIND = { matte: [0.82, 0.07], gloss: [0.3, 0.05], skin: [SKIN_ROUGH, SKIN_GLOW], hair: [0.46, 0.09] };
const BUCKET_MATS = {};
function bucketMaterial(b) {
  if (!BUCKET_MATS[b]) {
    let m;
    if (b === 'print') {
      m = new THREE.MeshStandardMaterial({ map: Prints.texture(), roughness: 0.8, metalness: 0, alphaTest: 0.5 });
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive + diffuseColor.rgb * 0.06;');
      };
      m.customProgramCacheKey = () => 'kotoba-print-v1';
    } else {
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 aMat;\nvarying vec2 vMat;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vMat;')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vMat.x;')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${toyShade('vMat.y', 0.25)}`);
      };
      m.customProgramCacheKey = () => 'kotoba-body-v3';
    }
    BUCKET_MATS[b] = m;
  }
  return BUCKET_MATS[b];
}
// ------------------------------------------------------------------ print atlas
// Small printed details (name badges, the konbini logo, happi lettering) share one canvas texture, so all
// people together add a single material. Regions are packed on demand and repainted once the font loads.
const PRINT_FONT = '"M PLUS Rounded 1c", "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
const Prints = {
  S: 1024, canvas: null, ctx: null, tex: null, slots: new Map(), x: 0, y: 0, row: 0,
  init() {
    if (this.canvas) return true;
    if (typeof document === 'undefined') return false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.S;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    document.fonts?.load(`800 40px ${PRINT_FONT}`).then(() => this.repaint()).catch(() => {});
    return true;
  },
  texture() { this.init(); return this.tex; },
  /** UV rect {u0,v0,u1,v1} of a (cached) region, or null when printing is unavailable. */
  region(key, w, h, draw, bg = null) {
    if (!this.init()) return null;
    let s = this.slots.get(key);
    if (!s) {
      const pad = 6;
      if (this.x + w + 2 * pad > this.S) { this.x = 0; this.y += this.row; this.row = 0; }
      if (this.y + h + 2 * pad > this.S) return null;
      s = { x: this.x + pad, y: this.y + pad, w, h, draw, bg };
      this.x += w + 2 * pad; this.row = Math.max(this.row, h + 2 * pad);
      this.slots.set(key, s);
      this.paint(s);
      this.tex.needsUpdate = true;
    }
    const S = this.S;
    return { u0: (s.x + 0.5) / S, u1: (s.x + s.w - 0.5) / S, v0: 1 - (s.y + s.h - 0.5) / S, v1: 1 - (s.y + 0.5) / S };
  },
  paint(s) {
    const c = this.ctx;
    c.save();
    c.clearRect(s.x - 6, s.y - 6, s.w + 12, s.h + 12);
    if (s.bg) { c.fillStyle = s.bg; c.fillRect(s.x - 5, s.y - 5, s.w + 10, s.h + 10); }
    c.translate(s.x, s.y);
    s.draw(c, s.w, s.h);
    c.restore();
  },
  repaint() { for (const s of this.slots.values()) this.paint(s); if (this.tex) this.tex.needsUpdate = true; },
};
const hex = (c) => `#${c.color.getHexString()}`;

// ------------------------------------------------------------------ curves and surfaces
/** Smooth curve through [x, value] keys (cubic Hermite, clamped at the ends). */
function curve(keys) {
  const n = keys.length;
  const tan = keys.map((k, i) => {
    const a = keys[Math.max(0, i - 1)]; const b = keys[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0] || 1);
  });
  const f = (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (x > keys[i + 1][0]) i++;
    const [x0, p0] = keys[i]; const [x1, p1] = keys[i + 1];
    const h = x1 - x0; const t = (x - x0) / h; const t2 = t * t; const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * h * tan[i] + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * h * tan[i + 1];
  };
  return f;
}

const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3(); const _d = new THREE.Vector3();
const _n = new THREE.Vector3(); const _p = new THREE.Vector3();

/**
 * A body surface around a vertical axis. sec(y) → [a, b, cz, n, cx]: half width, half depth, centre z,
 * superellipse exponent and centre x of the horizontal section at height y. th = 0 is the front (+z),
 * increasing toward +x. Optional bump(x, y, cosTh) pushes the surface forward (bust, belly, seat).
 * w(p) gives the skin weights of a point on it (root space) — layers laid on it reuse them.
 */
class Surf {
  constructor(sec, y0, y1, { bump = null, w = null } = {}) { this.sec = sec; this.y0 = y0; this.y1 = y1; this.bump = bump; this.w = w; this._arc = null; }
  raw(th, y, out) {
    const [a, b, cz = 0, n = 2.5, cx = 0] = this.sec(y);
    const co = Math.cos(th);
    out.set(cx + a * spow(Math.sin(th), 2 / n), y, cz + b * spow(co, 2 / n));
    if (this.bump) out.z += this.bump(out.x, y, co);
    return out;
  }
  normal(th, y, out) {
    this.raw(th + 2e-3, y, _a); this.raw(th - 2e-3, y, _b); _a.sub(_b);
    this.raw(th, y + 2e-4, _c); this.raw(th, y - 2e-4, _d); _c.sub(_d);
    out.crossVectors(_a, _c);
    if (out.lengthSq() < 1e-24) out.set(0, Math.sign(_c.y) || 1, 0);
    return out.normalize();
  }
  at(th, y, off = 0, out = new THREE.Vector3()) {
    this.raw(th, y, out);
    if (off) out.addScaledVector(this.normal(th, y, _n), off);
    return out;
  }
  /** Angle of the point at x on the front (side 1) or back (side -1). */
  th(x, y, side = 1) {
    const [a, , , n = 2.5, cx = 0] = this.sec(y);
    const t = Math.asin(spow(clamp((x - cx) / a, -0.999, 0.999), n / 2));
    return side > 0 ? t : Math.PI - t;
  }
  /** v (0..1) → y, spaced by arc length so domes and shoulders get enough rings. */
  yOf(v) {
    if (!this._arc) {
      const N = 80; const ys = []; const acc = [0];
      const pS = new THREE.Vector3(); const pF = new THREE.Vector3(); const qS = new THREE.Vector3(); const qF = new THREE.Vector3();
      for (let i = 0; i <= N; i++) {
        const y = lerp(this.y0, this.y1, i / N);
        this.raw(Math.PI / 2, y, qS); this.raw(0, y, qF);
        if (i) acc.push(acc[i - 1] + Math.max(qS.distanceTo(pS), qF.distanceTo(pF)));
        pS.copy(qS); pF.copy(qF); ys.push(y);
      }
      this._arc = { ys, acc, total: acc[N] };
    }
    const { ys, acc, total } = this._arc;
    const s = clamp(v, 0, 1) * total;
    let i = 0;
    while (i < acc.length - 2 && acc[i + 1] < s) i++;
    return lerp(ys[i], ys[i + 1], (s - acc[i]) / (acc[i + 1] - acc[i] || 1));
  }
  /** Indexed mesh of (part of) the surface, smooth normals. */
  mesh({ th0 = -Math.PI, th1 = Math.PI, nu = 24, nv = 12, off = 0, y0 = null, y1 = null, flip = false } = {}) {
    const arc = y0 === null && y1 === null;
    const ya = y0 ?? this.y0; const yb = y1 ?? this.y1;
    const pos = []; const nor = []; const idx = [];
    for (let j = 0; j <= nv; j++) {
      const y = arc ? this.yOf(j / nv) : lerp(ya, yb, j / nv);
      for (let i = 0; i <= nu; i++) {
        const th = lerp(th0, th1, i / nu);
        this.raw(th, y, _p);
        this.normal(th, y, _n);
        if (off) _p.addScaledVector(_n, off);
        if (flip) _n.negate();
        pos.push(_p.x, _p.y, _p.z); nor.push(_n.x, _n.y, _n.z);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const A = j * (nu + 1) + i; const B = A + 1; const D = A + nu + 1; const E = D + 1;
        if (flip) idx.push(A, E, B, A, D, E); else idx.push(A, B, E, A, E, D);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
}

/** A lathed limb: profile [[y, r], …] (bottom → top) around (cx, cz), depth scaled by zs. */
function latheSurf(profile, { cx = 0, cz = 0, zs = 1, w = null } = {}) {
  const r = curve(profile);
  return new Surf((y) => { const rr = Math.max(1e-4, r(y)); return [rr, rr * zs, cz, 2, cx]; }, profile[0][0], profile[profile.length - 1][0], { w });
}

/** Triangles + boundary loop of a polygon [[x, y], …], subdivided so no edge is longer than maxLen. */
function polyShape(poly, maxLen) {
  const tri = THREE.ShapeUtils.triangulateShape(poly.map(([x, y]) => new THREE.Vector2(x, y)), []);
  let tris = tri.map(([a, b, c]) => [poly[a], poly[b], poly[c]]);
  let maxE = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i]; const q = poly[(i + 1) % poly.length]; maxE = Math.max(maxE, Math.hypot(p[0] - q[0], p[1] - q[1])); }
  for (const [a, b, c] of tris) for (const [p, q] of [[a, b], [b, c], [c, a]]) maxE = Math.max(maxE, Math.hypot(p[0] - q[0], p[1] - q[1]));
  const L = clamp(Math.ceil(Math.log2(maxE / maxLen)), 0, 4);
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  for (let l = 0; l < L; l++) {
    tris = tris.flatMap(([a, b, c]) => { const ab = mid(a, b); const bc = mid(b, c); const ca = mid(c, a); return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]; });
  }
  const k = 2 ** L; const loop = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]; const q = poly[(i + 1) % poly.length];
    for (let j = 0; j < k; j++) loop.push([lerp(p[0], q[0], j / k), lerp(p[1], q[1], j / k)]);
  }
  return { tris, loop };
}

/** Grid panel between xl(y) and xr(y) for y0..y1. */
function panelShape(xl, xr, y0, y1, nx, ny) {
  const P = (i, j) => { const y = lerp(y0, y1, j / ny); return [lerp(xl(y), xr(y), i / nx), y]; };
  const tris = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = P(i, j); const b = P(i + 1, j); const c = P(i + 1, j + 1); const d = P(i, j + 1); tris.push([a, b, c], [a, c, d]); }
  const loop = [];
  for (let i = 0; i < nx; i++) loop.push(P(i, 0));
  for (let j = 0; j < ny; j++) loop.push(P(nx, j));
  for (let i = nx; i > 0; i--) loop.push(P(i, ny));
  for (let j = ny; j > 0; j--) loop.push(P(0, j));
  return { tris, loop };
}

/**
 * A layer laid on a surface: shape {tris, loop} in (x, y) of its front (side 1) or back (side -1),
 * lifted by off, with side walls when thick > 0. uv(x, y) → [u, v] for printed layers.
 */
function layerGeo(surf, { tris, loop }, { off = 0.002, thick = 0, side = 1, uv = null } = {}) {
  const pos = []; const nor = []; const uvs = [];
  const P = new THREE.Vector3(); const N = new THREE.Vector3();
  const pt = (x, y, o, outP, outN) => { const th = surf.th(x, y, side); surf.raw(th, y, outP); surf.normal(th, y, outN); outP.addScaledVector(outN, o); };
  const A = new THREE.Vector3(); const B = new THREE.Vector3(); const Cc = new THREE.Vector3(); const F = new THREE.Vector3();
  const top = off + thick;
  for (const t of tris) {
    const vs = t.map(([x, y]) => { pt(x, y, top, P, N); return { p: P.clone(), n: N.clone(), uv: uv ? uv(x, y) : null }; });
    A.subVectors(vs[1].p, vs[0].p); B.subVectors(vs[2].p, vs[0].p); F.crossVectors(A, B);
    if (F.dot(vs[0].n) < 0) [vs[1], vs[2]] = [vs[2], vs[1]];
    for (const v of vs) { pos.push(v.p.x, v.p.y, v.p.z); nor.push(v.n.x, v.n.y, v.n.z); if (uv) uvs.push(v.uv[0], v.uv[1]); }
  }
  if (thick > 0) {
    let area = 0;
    for (let i = 0; i < loop.length; i++) { const p = loop[i]; const q = loop[(i + 1) % loop.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const sgn = area > 0 ? 1 : -1;
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i]; const q = loop[(i + 1) % loop.length];
      const dx = q[0] - p[0]; const dy = q[1] - p[1]; const len = Math.hypot(dx, dy) || 1;
      const ox = (sgn * dy) / len; const oy = (-sgn * dx) / len;
      const mx = (p[0] + q[0]) / 2; const my = (p[1] + q[1]) / 2;
      pt(mx, my, off, A, N); pt(mx + ox * 1e-3, my + oy * 1e-3, off, B, N);
      const out = B.sub(A).normalize();
      const quad = [[p, off], [q, off], [q, top], [p, top]].map(([[x, y], o]) => { pt(x, y, o, P, N); return P.clone(); });
      A.subVectors(quad[1], quad[0]); Cc.subVectors(quad[2], quad[0]); F.crossVectors(A, Cc);
      const order = F.dot(out) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of order) { pos.push(quad[k].x, quad[k].y, quad[k].z); nor.push(out.x, out.y, out.z); if (uv) uvs.push(...uv(...(k === 1 || k === 2 ? q : p))); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** A band around a surface between y0 and y1 (optionally ribbed: alternate columns slightly darker). */
function bandGeo(surf, y0, y1, { off = 0.002, thick = 0.002, nu = 40, rib = 0 } = {}) {
  const pos = []; const nor = []; const col = [];
  const P = new THREE.Vector3(); const N = new THREE.Vector3();
  const vert = (th, y, o, n = null) => { surf.raw(th, y, P); surf.normal(th, y, N); P.addScaledVector(N, o); pos.push(P.x, P.y, P.z); const m = n || N; nor.push(m.x, m.y, m.z); };
  const top = off + thick;
  const up = new THREE.Vector3(0, 1, 0); const dn = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < nu; i++) {
    const t0 = -Math.PI + (2 * Math.PI * i) / nu; const t1 = -Math.PI + (2 * Math.PI * (i + 1)) / nu;
    const k = rib && i % 2 ? 1 - rib : 1;
    // outer face (outward normals, CCW seen from outside: th grows toward +x at the front)
    vert(t0, y0, top); vert(t1, y0, top); vert(t1, y1, top);
    vert(t0, y0, top); vert(t1, y1, top); vert(t0, y1, top);
    // top and bottom lips
    vert(t0, y1, top, up); vert(t1, y1, top, up); vert(t1, y1, off, up);
    vert(t0, y1, top, up); vert(t1, y1, off, up); vert(t0, y1, off, up);
    vert(t0, y0, top, dn); vert(t1, y0, off, dn); vert(t1, y0, top, dn);
    vert(t0, y0, top, dn); vert(t0, y0, off, dn); vert(t1, y0, off, dn);
    for (let j = 0; j < 18; j++) col.push(k, k, k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** A soft flattened bead lying on a surface (buttons, rivets, studs). */
function beadGeo(surf, x, y, r, { off = 0.002, side = 1, flat = 0.45, seg = 8 } = {}) {
  const th = surf.th(x, y, side);
  const p = surf.at(th, y, off);
  const n = surf.normal(th, y, new THREE.Vector3());
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 3));
  g.scale(1, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n));
  g.translate(p.x, p.y, p.z);
  return g;
}

/** A tube along points (root space). */
function tubeGeo(points, r, segs = 24, radial = 6) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => V(...p))), segs, r, radial, false);
}

// body sections, in units of the height (y from the floor); widths are scaled by build
const TORSO = {
  m: {
    a: [[0.40, 0.106], [0.47, 0.106], [0.53, 0.099], [0.58, 0.094], [0.64, 0.097], [0.70, 0.102], [0.75, 0.105], [0.78, 0.103], [0.8, 0.097], [0.815, 0.085], [0.828, 0.067], [0.84, 0.047], [0.848, 0.033], [0.853, 0.029]],
    b: [[0.40, 0.076], [0.47, 0.075], [0.53, 0.067], [0.58, 0.062], [0.64, 0.064], [0.70, 0.067], [0.75, 0.068], [0.78, 0.066], [0.8, 0.061], [0.815, 0.055], [0.828, 0.047], [0.84, 0.037], [0.848, 0.03], [0.853, 0.027]],
  },
  f: {
    a: [[0.40, 0.111], [0.47, 0.11], [0.52, 0.097], [0.57, 0.084], [0.63, 0.087], [0.69, 0.092], [0.75, 0.093], [0.78, 0.091], [0.8, 0.086], [0.815, 0.076], [0.828, 0.06], [0.84, 0.042], [0.848, 0.03], [0.853, 0.026]],
    b: [[0.40, 0.078], [0.47, 0.077], [0.52, 0.067], [0.57, 0.059], [0.63, 0.062], [0.69, 0.065], [0.75, 0.064], [0.78, 0.061], [0.8, 0.057], [0.815, 0.051], [0.828, 0.043], [0.84, 0.034], [0.848, 0.027], [0.853, 0.024]],
  },
};
const PELVIS = {
  m: {
    a: [[0.436, 0.03], [0.445, 0.072], [0.458, 0.091], [0.48, 0.096], [0.51, 0.097], [0.55, 0.096], [0.6, 0.097]],
    b: [[0.436, 0.03], [0.445, 0.042], [0.458, 0.05], [0.48, 0.058], [0.51, 0.063], [0.55, 0.064], [0.6, 0.065]],
  },
  f: {
    a: [[0.436, 0.03], [0.445, 0.076], [0.458, 0.095], [0.48, 0.1], [0.51, 0.099], [0.55, 0.091], [0.6, 0.088]],
    b: [[0.436, 0.03], [0.445, 0.044], [0.458, 0.052], [0.48, 0.06], [0.51, 0.064], [0.55, 0.062], [0.6, 0.062]],
  },
};

export class Person {
  constructor(look, { name = '' } = {}) {
    this.look = look;
    this.name = name;
    this.root = new THREE.Group();
    this.root.name = `person:${name}`;
    this.gestures = [];
    this.mouth = 0;
    this.level = 0;
    this.lookTarget = null;
    this.blinkT = 1 + Math.random() * 3;
    this.blink = 0;
    this.t = Math.random() * 10;
    this.sitting = false;
    this.headYaw = 0; this.headPitch = 0; this.bodyYaw = 0;
    this.parts = []; // { geo, mat:C, bone, m, w? } collected while building
    this._build();
    this._bake();
  }

  // -------------------------------------------------------------- building
  bone(parent, pos = [0, 0, 0], name = '') {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    (parent || this.root).add(b);
    return b;
  }

  /** Add a shape to a bone (local transform pos/rot/scale). */
  add(geo, mat, bone, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...scale));
    this.parts.push({ geo, mat, bone, m });
  }

  /** Add a shape given in root (bind-pose) space, skinned by w(p) → [[bone, weight], …] or rigid to a bone. */
  addW(geo, mat, w) {
    const fn = w instanceof THREE.Bone ? null : w;
    this.parts.push({ geo, mat, bone: fn ? this.rootBone : this.rootBone, m: new THREE.Matrix4(), w: fn || (() => [[w, 1]]) });
  }

  /** A shape on its own small bone (so it can be scaled/moved by animation). */
  animPart(geo, mat, parent, pos, rot = [0, 0, 0], scale = [1, 1, 1], name = '') {
    const b = this.bone(parent, pos, name);
    this.add(geo, mat, b, [0, 0, 0], rot, scale);
    return b;
  }

  _build() {
    const L = this.look;
    const H = L.height ?? 1.65;
    const f = L.sex === 'f';
    const b = L.build ?? 1;
    const age = L.age ?? 30;
    const old = age >= 60;
    const type = L.outfit?.type || 'shirt';
    const extras = new Set(L.extras || []);
    const skin = C(L.skin || '#e8bfa0', 'skin');
    const top = C(L.outfit?.top || '#6d8fb3');
    const bottom = C(L.outfit?.bottom || '#3b3f4a');
    const accent = C(L.outfit?.accent || '#ffffff');
    const shirtW = C('#f4f2ec');
    const hair = C(L.hair?.color || '#2b1d14', 'hair');
    const skirt = f && (SKIRT_TYPES.has(type) || (type === 'cardigan' && old));
    const jacket = JACKETS.has(type);
    const tucked = TUCKED.has(type);
    const short = SHORT_SLEEVES.has(type);
    this.dims = { H };
    this.H = H;
    this.old = old;
    const h = (v) => v * H;
    const bw = 1 + (b - 1) * 0.9;                    // width from build
    const lw = 1.06 + (b - 1) * 0.6;                 // limb thickness from build
    const sex = f ? 'f' : 'm';

    // ---- skeleton (same proportions as before: seats, eye heights and props still fit)
    const hipY = h(0.505);
    const torsoLen = h(0.3);
    const thighL = h(0.2475); const shinL = h(0.205);
    this.thighLen = thighL; this.shinLen = shinL; this.ankleH = hipY - h(0.02) - thighL - shinL;
    const legX = h(f ? 0.05 : 0.048) * bw;
    const shX = h(f ? 0.103 : 0.113) * bw;      // narrow, sloped shoulders
    const shY = hipY + h(0.035) + torsoLen * 0.825;
    const ra = h(f ? 0.0295 : 0.0325) * lw;        // upper-arm radius (soft, rounded limbs)
    const upperArm = h(0.17); const foreArm = h(0.148);
    const headR = H * 0.112; // a big head (about 1 : 4.8 of the height): friendlier, and the face reads from further away

    this.rootBone = this.bone(this.root, [0, 0, 0], 'root');
    this.hips = this.bone(this.rootBone, [0, hipY, 0], 'hips');
    this.spine = this.bone(this.hips, [0, h(0.035), 0], 'spine');
    this.chest = this.bone(this.spine, [0, 0, 0], 'chest');
    this.seat = this.bone(this.hips, [0, -h(0.02), 0], 'seat');
    this.legs = [];
    for (const s of [-1, 1]) {
      const th = this.bone(this.hips, [s * legX, -h(0.02), 0], 'thigh');
      const kn = this.bone(th, [0, -thighL, 0], 'knee');
      const km = this.bone(th, [0, -thighL, 0], 'kneeMid');
      const ft = this.bone(kn, [0, -shinL, 0], 'foot');
      this.legs.push({ s, th, kn, km, ft });
    }
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = this.bone(this.chest, [s * shX, torsoLen * 0.825, -h(0.004)], 'shoulder');
      const ua = this.bone(sh, [0, 0, 0], 'upperArm');
      const el = this.bone(ua, [0, -upperArm, 0], 'elbow');
      const em = this.bone(ua, [0, -upperArm, 0], 'elbowMid');
      const hd = this.bone(el, [0, -foreArm, 0], 'hand');
      this.arms.push({ s, sh, ua, el, em, hd, pose: { curl: 0.5, index: 0.4, thumb: 0.1 } });
    }
    this.neck = this.bone(this.chest, [0, torsoLen * 0.97, -h(0.004)], 'neck');
    this.head = this.bone(this.neck, [0, h(0.032), 0], 'head');
    this.root.updateMatrixWorld(true);
    const LEG = Object.fromEntries(this.legs.map((l) => [l.s, l]));

    // ---- skin weights
    const yWaist = hipY + h(0.035);
    const wTrunk = (p) => { const t = smooth(yWaist - h(0.045), yWaist + h(0.075), p.y); return [[this.hips, 1 - t], [this.chest, t]]; };
    const kneeY = hipY - h(0.02) - thighL;
    // across a joint: upper bone → half-angle mid bone → lower bone (keeps the joint round when bent)
    const joint = (a, m, b, t) => [[a, (1 - t) * (1 - t)], [m, 2 * t * (1 - t)], [b, t * t]];
    const wLeg = (l) => (p) => joint(l.th, l.km, l.kn, smooth(kneeY + h(0.04), kneeY - h(0.04), p.y));
    const elbowY = shY - upperArm;
    const wArm = (a) => (p) => joint(a.ua, a.em, a.el, smooth(elbowY + h(0.03), elbowY - h(0.03), p.y));
    // below the seat, the front of skirts and coat tails follows the thighs and, past the knee, the shins
    // (so sitting lays them over the lap and lets them fall at the knee); the back mostly stays with the hips
    // (the seat bone folds the back under the thighs: it is sat on)
    const wSkirt = (yTop, yFull) => (p) => {
      const t = smooth(yTop, yFull, p.y);
      const fr = smooth(-h(0.035), h(0.025), p.z);
      const k = t * fr;
      const tk = smooth(kneeY + h(0.035), kneeY - h(0.005), p.y);
      const sl = smooth(-h(0.03), h(0.03), p.x);
      return [[this.hips, 1 - t], [this.seat, t * (1 - fr)], [LEG[1].th, k * sl * (1 - tk)], [LEG[-1].th, k * (1 - sl) * (1 - tk)], [LEG[1].kn, k * sl * tk], [LEG[-1].kn, k * (1 - sl) * tk]];
    };
    // pelvis: mostly the hips; the lap and seat lean toward the thighs a little
    const wPelvis = (p) => {
      const t = smooth(hipY - h(0.03), hipY - h(0.09), p.y) * 0.55 * smooth(0, h(0.03), Math.abs(p.x));
      const side = p.x > 0 ? LEG[1].th : LEG[-1].th;
      return [[this.hips, 1 - t], [side, t]];
    };

    // ---- trunk (top garment) and pelvis (bottoms)
    const T = TORSO[sex]; const PV = PELVIS[sex];
    const sc = (keys, k = bw) => curve(keys.map(([y, v]) => [h(y), h(v) * k]));
    let pa = sc(PV.a); let pb = sc(PV.b);
    const smax = (x, y, k) => { const d = Math.max(k - Math.abs(x - y), 0) / k; return Math.max(x, y) + d * d * k * 0.25; };
    const ta1 = sc(T.a); const tb0 = sc(T.b);
    const ta0 = (y) => ta1(y) * (1 - 0.085 * smooth(h(0.62), h(0.76), y));
    const clear = (y) => (tucked ? 0 : smooth(h(0.625), h(0.565), y));
    let ta = tucked ? ta0 : (y) => smax(ta0(y), pa(y) + h(0.011) * clear(y), h(0.012));
    let tb = tucked ? tb0 : (y) => smax(tb0(y), pb(y) + h(0.012) * clear(y), h(0.012));
    if (tucked) { const p0 = pa; const q0 = pb; const k = (y) => smooth(h(0.55), h(0.585), y); pa = (y) => Math.max(p0(y), ta0(y) + h(0.005) * k(y)); pb = (y) => Math.max(q0(y), tb0(y) + h(0.005) * k(y)); }
    if (type === 'happi') { const a0 = ta; const b0 = tb; ta = (y) => a0(y) + h(0.006) * smooth(h(0.6), h(0.45), y); tb = (y) => b0(y) + h(0.005) * smooth(h(0.6), h(0.45), y); }
    const tcz = curve([[h(0.8), 0], [h(0.853), -h(0.004)]]);
    const tn = curve([[h(0.4), 2.45], [h(0.78), 2.5], [h(0.835), 2.2], [h(0.853), 2.0]]);
    const bust = f ? h(old ? 0.005 : 0.009) : 0;
    const belly = !f && b > 1.04 ? h((b - 1) * 0.11) : 0;
    const trunkBump = (x, y, co) => {
      if (co <= 0) return 0;
      let z = 0;
      if (bust) z += bust * Math.exp(-((x / h(0.055)) ** 2) - (((y - h(0.705)) / h(0.04)) ** 2));
      if (belly) z += belly * Math.exp(-((x / h(0.075)) ** 2) - (((y - h(0.565)) / h(0.065)) ** 2));
      return z * co ** 1.5;
    };
    const trunk = new Surf((y) => [ta(y), tb(y), tcz(y), tn(y)], h(0.4), h(0.853), { bump: trunkBump, w: wTrunk });
    const pelvisS = new Surf((y) => [pa(y), pb(y), 0, 2.4], h(0.436), h(0.6), {
      bump: (x, y, co) => (co < 0 ? -h(0.004) * Math.exp(-(((y - h(0.47)) / h(0.04)) ** 2)) * (-co) ** 1.5 : trunkBump(x, y, co)),
      w: wPelvis,
    });
    const hemY = tucked ? h(0.565) : jacket ? h(0.443) : type === 'happi' ? h(0.448) : h(0.468);
    trunk.y0 = hemY;
    this.addW(trunk.mesh({ nu: 28, nv: 18 }), top, wTrunk);
    // the inside of the hem (seen from below when sitting or bowing)
    if (!tucked) this.addW(trunk.mesh({ nu: 28, nv: 1, y0: hemY, y1: hemY + h(0.012), off: -h(0.0015), flip: true }), shade(top, 0.55), wTrunk);
    this.addW(pelvisS.mesh({ nu: 24, nv: 7 }), bottom, wPelvis);

    // neck
    const neckR = h(f ? 0.0245 : 0.027);
    this.add(new THREE.CylinderGeometry(neckR * 0.95, neckR, h(0.075), 12, 1, true), shade(skin, 0.9), this.neck, [0, h(0.022), 0]);

    // helpers for layers on the trunk
    const ML = h(0.035);
    const onT = (poly, mat, o = {}) => this.addW(layerGeo(o.surf || trunk, polyShape(poly.map(([x, y]) => [h(x), h(y)]), ML), { off: h(o.off ?? 0.0015), thick: h(o.thick ?? 0), side: o.side ?? 1, uv: o.uv }), mat, (o.surf || trunk).w);
    const strip = (x, y0, y1, w, mat, off = 0.0006) => this.addW(layerGeo(trunk, panelShape(() => h(x - w / 2), () => h(x + w / 2), h(y0), h(y1), 1, 10), { off: h(off) }), mat, trunk.w);
    const mirror = (poly) => poly.map(([x, y]) => [-x, y]).reverse();
    const both = (poly, mat, o) => { onT(poly, mat, o); onT(mirror(poly), mat, o); };
    const bead = (x, y, r, mat, o = {}) => { const S = o.surf || trunk; this.addW(beadGeo(S, h(x), h(y), h(r), { off: h(o.off ?? 0.002), side: o.side ?? 1, flat: o.flat ?? 0.45 }), mat, S.w); };
    const band = (y0, y1, mat, o = {}) => { const S = o.surf || trunk; this.addW(bandGeo(S, h(y0), h(y1), { off: h(o.off ?? 0.0015), thick: h(o.thick ?? 0.002), nu: o.nu ?? 36, rib: o.rib ?? 0 }), mat, S.w); };
    const print = (key, x0, y0, x1, y1, pw, ph, draw, o = {}) => {
      const r = Prints.region(key, pw, ph, draw, o.bg);
      if (!r) return;
      const S = o.surf || trunk; const side = o.side ?? 1;
      const X0 = h(x0); const X1 = h(x1); const Y0 = h(y0); const Y1 = h(y1);
      const uv = (x, y) => [lerp(r.u0, r.u1, side > 0 ? (x - X0) / (X1 - X0) : (X1 - x) / (X1 - X0)), lerp(r.v0, r.v1, (y - Y0) / (Y1 - Y0))];
      this.addW(layerGeo(S, panelShape(() => X0, () => X1, Y0, Y1, 3, 4), { off: h(o.off ?? 0.003), side, uv }), { color: new THREE.Color(1, 1, 1), bucket: 'print' }, S.w);
    };
    const collarBand = (mat, { r = neckR + h(0.004), hgt = h(0.02), y = h(0.84) } = {}) => {
      const g = new THREE.CylinderGeometry(r * 0.97, r * 1.06, hgt, 18, 1, true);
      const gi = new THREE.CylinderGeometry(r * 0.93, r * 1.02, hgt, 18, 1, true); gi.scale(-1, 1, 1);
      for (const geo of [g, gi]) { geo.scale(1, 1, 0.95); this.add(geo, geo === g ? mat : shade(mat, 0.8), this.chest, [0, y + hgt / 2 - yWaist, -h(0.004)]); }
    };
    const vNeck = (yV, w, mat, yTop = 0.836) => onT([[-w, yTop], [0, yV], [w, yTop]], mat, { off: 0.0008 });
    const shirtCollar = (mat, spread = 1) => {
      collarBand(mat);
      both([[0.004, 0.833], [0.03, 0.838], [0.04 * spread, 0.818], [0.012, 0.802]], mat, { off: 0.0025, thick: 0.002 });
    };
    const roundCollar = (mat) => {
      collarBand(mat, { hgt: h(0.012) });
      both([[0.003, 0.835], [0.03, 0.839], [0.043, 0.826], [0.04, 0.812], [0.026, 0.806], [0.01, 0.81]], mat, { off: 0.0025, thick: 0.002 });
    };
    const crewNeck = (mat) => band(0.842, 0.852, mat, { off: 0.001, thick: 0.0028, rib: 0.06, nu: 30 });
    const lapels = (yV, mat, { w = 0.06, notch = true, yTop = 0.836 } = {}) => {
      const k = f ? 0.88 : 1;
      both(notch
        ? [[0.003, yV + 0.004], [0.034 * k, yTop], [0.05 * k, yTop - 0.002], [0.056 * k, 0.806], [0.047 * k, 0.8], [w * k, 0.78], [0.026, yV - 0.004]]
        : [[0.003, yV + 0.004], [0.034 * k, yTop], [0.05 * k, yTop - 0.002], [w * k, 0.79], [0.024, yV - 0.006]], mat, { off: 0.002, thick: 0.003 });
    };
    const placket = (y0, y1, mat, n, btn, x = 0) => {
      this.addW(layerGeo(trunk, panelShape(() => h(x - 0.007), () => h(x + 0.007), h(y1), h(y0), 1, 8), { off: h(0.0012), thick: h(0.001) }), mat, trunk.w);
      for (let i = 0; i < n; i++) bead(x, lerp(y1 - 0.012, y0 + 0.012, n === 1 ? 0 : i / (n - 1)), 0.0042, btn, { off: 0.0028 });
    };
    const pocket = (x0, x1, y0, y1, mat, { flap = null, off = 0.0016, surf = null, side = 1 } = {}) => {
      onT([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], mat, { off, thick: 0.0018, surf, side });
      if (flap) onT([[x0 - 0.002, y1 - 0.012], [x1 + 0.002, y1 - 0.012], [x1 + 0.002, y1 + 0.002], [x0 - 0.002, y1 + 0.002]], flap, { off: off + 0.002, thick: 0.002, surf, side });
    };
    const badge = (x, y, stripe, o0 = 0.003) => {
      const fam = (CAST[this.name]?.nameJa || '').split(/[\s・]/)[0];
      onT([[x - 0.019, y - 0.008], [x + 0.019, y - 0.008], [x + 0.019, y + 0.008], [x - 0.019, y + 0.008]], C('#fbfaf6', 'gloss'), { off: o0, thick: 0.002 });
      print(`badge:${fam}:${hex(stripe)}`, x - 0.0175, y - 0.0068, x + 0.0175, y + 0.0068, 160, 62, (c, w, hh) => {
        c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, w, hh);
        c.fillStyle = hex(stripe); c.fillRect(0, 0, w, hh * 0.2);
        c.fillStyle = '#2a2a2e'; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (fam) { c.font = `800 ${hh * 0.56}px ${PRINT_FONT}`; c.fillText(fam, w / 2, hh * 0.62, w * 0.9); } else { c.fillRect(w * 0.2, hh * 0.5, w * 0.6, hh * 0.1); c.fillRect(w * 0.2, hh * 0.72, w * 0.4, hh * 0.08); }
      }, { off: o0 + 0.0021, bg: '#fbfaf6' });
    };
    const gold = C('#d8b25a', 'gloss');
    const pearl = C('#efe9dc', 'gloss');
    const darkBtn = C('#262321', 'gloss');
    let sleeve = { mat: top, cuff: null, cuffRib: 0, stripe: null, len: 'long' };
    if (short) sleeve.len = 'short';
    if (type === 'happi') sleeve.len = 'wide';

    // ---- outfits
    let inner = shirtW;
    switch (type) {
      case 'suit': {
        const yV = f ? 0.715 : 0.7;
        vNeck(yV - 0.004, 0.034, shirtW);
        if (f) roundCollar(shirtW); else shirtCollar(shirtW);
        if (extras.has('tie')) {
          onT([[-0.009, 0.83], [0.009, 0.83], [0.006, 0.814], [-0.006, 0.814]], accent, { off: 0.003, thick: 0.004 });
          onT([[-0.0065, 0.815], [0.0065, 0.815], [0.014, yV + 0.012], [0.0, yV - 0.002], [-0.014, yV + 0.012]], accent, { off: 0.0028, thick: 0.002 });
        }
        lapels(yV, shade(top, luma(top) < 0.12 ? 1.35 : 0.88));
        strip(0, 0.445, yV, 0.003, shade(top, 0.6));
        for (const y of f ? [yV - 0.035] : [yV - 0.04, yV - 0.1]) bead(0.0, y, 0.0055, darkBtn, { off: 0.0025 });
        for (const s of [-1, 1]) onT([[s * 0.04, 0.53], [s * 0.085, 0.53], [s * 0.085, 0.543], [s * 0.04, 0.543]], shade(top, 0.9), { off: 0.0018, thick: 0.002 });
        onT([[0.045, 0.743], [0.078, 0.743], [0.078, 0.75], [0.045, 0.75]], shade(top, 0.82), { off: 0.0012, thick: 0.001 });
        sleeve.cuff = shirtW;
        break;
      }
      case 'station_uniform':
      case 'museum_uniform':
      case 'store_uniform': {
        const station = type === 'station_uniform';
        const yV = station ? 0.776 : 0.765;
        vNeck(yV - 0.004, 0.032, shirtW);
        if (f && !station) roundCollar(shirtW); else shirtCollar(shirtW, 0.95);
        if (station) {
          const tie = shade(top, 0.62);
          onT([[-0.008, 0.83], [0.008, 0.83], [0.0055, 0.816], [-0.0055, 0.816]], tie, { off: 0.003, thick: 0.004 });
          onT([[-0.006, 0.817], [0.006, 0.817], [0.011, yV + 0.008], [0, yV], [-0.011, yV + 0.008]], tie, { off: 0.0028, thick: 0.002 });
        }
        lapels(yV, shade(top, 0.86), { w: 0.05, notch: station });
        strip(0, 0.445, yV, 0.003, shade(top, 0.6));
        const n = station ? 4 : 3;
        for (let i = 0; i < n; i++) bead(0.012, lerp(yV - 0.025, 0.565, i / (n - 1)), 0.0058, gold, { off: 0.0025 });
        if (station) {
          for (const s of [-1, 1]) pocket(s > 0 ? 0.035 : -0.078, s > 0 ? 0.078 : -0.035, 0.705, 0.742, shade(top, 0.97), { flap: shade(top, 0.88) });
          sleeve.stripe = shade(accent, 1, 'gloss');
        } else {
          for (const s of [-1, 1]) onT([[s * 0.035, 0.528], [s * 0.078, 0.528], [s * 0.078, 0.54], [s * 0.035, 0.54]], shade(top, 0.86), { off: 0.0018, thick: 0.002 });
        }
        sleeve.cuff = station ? null : shade(top, 0.82);
        break;
      }
      case 'cardigan':
      case 'teacher': {
        const yV = type === 'teacher' ? 0.7 : 0.69;
        inner = accent;
        vNeck(yV - 0.004, 0.036, inner);
        if (type === 'teacher') roundCollar(shade(accent, 1.02));
        else band(0.836, 0.849, inner, { off: 0.0006, thick: 0.0015, rib: 0.08 });
        const edge = shade(top, 0.9);
        both([[0.004, yV - 0.006], [0.036, 0.836], [0.045, 0.834], [0.013, yV - 0.012], [0.013, 0.468], [0.004, 0.468]], edge, { off: 0.001, thick: 0.0018 });
        strip(0, 0.468, yV - 0.006, 0.0024, shade(top, 0.62), 0.0024);
        const nb = 5;
        for (let i = 0; i < nb; i++) bead(0.0, lerp(yV - 0.02, 0.495, i / (nb - 1)), 0.0045, pearl, { off: 0.0032 });
        band(0.468, 0.492, shade(top, 0.97), { off: 0.0012, thick: 0.0022, rib: 0.14 });
        for (const s of [-1, 1]) pocket(s > 0 ? 0.034 : -0.074, s > 0 ? 0.074 : -0.034, 0.5, 0.538, shade(top, 0.97), {});
        sleeve.cuff = shade(top, 0.97); sleeve.cuffRib = 0.14;
        break;
      }
      case 'shirt':
      case 'apron': {
        const col = shade(top, 1.02);
        shirtCollar(col);
        placket(0.802, 0.57, shade(top, 0.97), 5, pearl);
        if (type === 'shirt') pocket(0.03, 0.068, 0.712, 0.752, shade(top, 0.98), { flap: null });
        sleeve.cuff = shade(top, 0.95);
        break;
      }
      case 'blouse': {
        roundCollar(luma(top) > 0.8 ? shade(top, 1.0) : blend(top, hex(accent), 0.35));
        placket(0.8, 0.6, shade(top, 0.98), 3, pearl);
        sleeve.cuff = shade(top, 0.96);
        break;
      }
      case 'polo':
      case 'konbini': {
        const col = type === 'polo' ? accent : shade(top, 0.9);
        collarBand(col, { hgt: h(0.014) });
        both([[0.005, 0.837], [0.034, 0.843], [0.052, 0.816], [0.018, 0.799]], col, { off: 0.0025, thick: 0.0022 });
        placket(0.808, 0.765, shade(top, 0.95), 2, type === 'polo' ? pearl : C('#ffffff', 'gloss'));
        if (type === 'konbini') {
          band(0.612, 0.632, C('#ffffff'), { off: 0.0012, thick: 0.0008 });
          band(0.598, 0.61, C('#f2c230'), { off: 0.0012, thick: 0.0008 });
          band(0.59, 0.597, C('#ef8a2e'), { off: 0.0012, thick: 0.0008 });
          // store logo patch (ことばマート) on the right chest
          onT([[-0.079, 0.72], [-0.031, 0.72], [-0.031, 0.75], [-0.079, 0.75]], C('#ffffff'), { off: 0.0024, thick: 0.0014 });
          print('logo:kotobamart', -0.0775, 0.7212, -0.0325, 0.7488, 180, 112, (c, w, hh) => {
            c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, hh);
            c.fillStyle = '#2f8a62'; c.fillRect(0, 0, w, hh * 0.3);
            c.fillStyle = '#f2c230'; c.fillRect(0, hh * 0.3, w, hh * 0.09);
            c.fillStyle = '#ef8a2e'; c.fillRect(0, hh * 0.39, w, hh * 0.06);
            c.fillStyle = '#2f8a62'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.font = `800 ${hh * 0.3}px ${PRINT_FONT}`; c.fillText('ことばマート', w / 2, hh * 0.64, w * 0.92);
            c.font = `700 ${hh * 0.14}px ${PRINT_FONT}`; c.fillText('KOTOBA MART', w / 2, hh * 0.87, w * 0.8);
          }, { off: 0.0042, bg: '#ffffff' });
        }
        band(0.468, 0.482, shade(top, 0.92), { off: 0.001, thick: 0.0015 });
        sleeve.cuff = type === 'polo' ? accent : shade(top, 0.9); sleeve.cuffRib = type === 'polo' ? 0.1 : 0;
        break;
      }
      case 'hoodie': {
        // hood resting on the back, the hood opening around the neck, drawstrings, kangaroo pocket, ribbing
        const hood = new THREE.SphereGeometry(1, 16, 10);
        hood.scale(h(0.068) * bw, h(0.048), h(0.04)); hood.rotateX(-0.45);
        this.add(hood, shade(top, 0.95), this.chest, [0, h(0.83) - yWaist, -h(0.07)]);
        const rim = new THREE.TorusGeometry(h(0.044), h(0.013), 7, 22);
        rim.scale(1.05 * bw, 1, 0.92);
        this.add(rim, top, this.chest, [0, h(0.84) - yWaist, -h(0.012)], [Math.PI / 2 - 0.32, 0, 0]);
        for (const s of [-1, 1]) {
          const x = s * h(0.018);
          const zTop = trunk.at(trunk.th(x, h(0.83)), h(0.83), h(0.006));
          const zBot = trunk.at(trunk.th(x + s * h(0.004), h(0.745)), h(0.745), h(0.004));
          this.addW(tubeGeo([[zTop.x, zTop.y, zTop.z], [x * 1.1, h(0.79), zBot.z + h(0.006)], [zBot.x, zBot.y, zBot.z]], h(0.0022), 10, 5), accent, wTrunk);
          const ag = new THREE.CylinderGeometry(h(0.0032), h(0.0032), h(0.012), 6); ag.translate(zBot.x, zBot.y - h(0.005), zBot.z);
          this.addW(ag, shade(accent, 0.8), wTrunk);
        }
        const pk = shade(top, 0.94);
        onT([[-0.066, 0.495], [0.066, 0.495], [0.05, 0.585], [-0.05, 0.585]], pk, { off: 0.0015, thick: 0.0025 });
        for (const s of [-1, 1]) onT(s > 0 ? [[0.05, 0.583], [0.054, 0.583], [0.069, 0.5], [0.065, 0.5]] : [[-0.054, 0.583], [-0.05, 0.583], [-0.065, 0.5], [-0.069, 0.5]], shade(top, 0.7), { off: 0.0042 });
        band(0.468, 0.49, shade(top, 0.92), { off: 0.0012, thick: 0.0022, rib: 0.14 });
        sleeve.cuff = shade(top, 0.92); sleeve.cuffRib = 0.14;
        break;
      }
      case 'casual': {
        crewNeck(shade(top, 0.9));
        sleeve.cuff = null;
        break;
      }
      case 'labcoat': {
        inner = accent;
        const yV = 0.655;
        vNeck(yV - 0.004, 0.036, inner);
        shirtCollar(shade(accent, 1.06));
        lapels(yV, shade(top, 0.95), { w: 0.062 });
        strip(0, 0.468, yV, 0.003, shade(top, 0.78));
        for (const y of [yV - 0.03, 0.575]) bead(0.0, y, 0.005, C('#e9e7e0', 'gloss'), { off: 0.0025 });
        pocket(0.034, 0.072, 0.705, 0.745, shade(top, 0.98));
        // a pen clipped in the breast pocket
        const pp = trunk.at(trunk.th(h(0.062), h(0.748)), h(0.748), h(0.006));
        const pen = new THREE.CylinderGeometry(h(0.003), h(0.003), h(0.036), 8); pen.translate(pp.x, pp.y + h(0.002), pp.z);
        this.addW(pen, C('#2c4f8f', 'gloss'), wTrunk);
        const clip = new THREE.BoxGeometry(h(0.0018), h(0.016), h(0.002)); clip.translate(pp.x, pp.y + h(0.002), pp.z + h(0.0035));
        this.addW(clip, C('#c9ccd2', 'gloss'), wTrunk);
        sleeve.cuff = null;
        if (L.outfit?.stethoscope !== false) this._stethoscope(trunk, h, wTrunk);
        break;
      }
      case 'happi': {
        // happi coat: navy body, a contrasting collar band (eri) crossing at the chest and running down the front,
        // the shop name on the band and 祭 on the back
        inner = C('#f2f0ea');
        const yX = 0.665; // where the bands cross
        onT([[-0.04, 0.836], [0, yX - 0.01], [0.04, 0.836]], inner, { off: 0.0008 });
        collarBand(accent, { hgt: h(0.016), r: neckR + h(0.007) });
        const eri = shade(accent, 1, 'matte');
        // band from the person's right shoulder, crossing over, then down the front edge to the hem
        onT([[-0.046, 0.834], [-0.028, 0.838], [0.022, yX], [0.022, 0.452], [0.0, 0.452], [0.0, yX + 0.004]], eri, { off: 0.0024, thick: 0.0028 });
        onT([[0.028, 0.838], [0.046, 0.834], [0.006, yX + 0.04], [-0.004, yX + 0.03]], eri, { off: 0.0012, thick: 0.0024 });
        print('happi:daichi', 0.0018, 0.592, 0.0202, 0.66, 64, 236, (c, w, hh) => {
          c.fillStyle = hex(accent); c.fillRect(0, 0, w, hh);
          c.fillStyle = hex(shade(top, 0.9)); c.textAlign = 'center'; c.textBaseline = 'middle';
          c.font = `800 ${w * 0.78}px ${PRINT_FONT}`;
          ['だ', 'い', 'ち'].forEach((ch, i) => c.fillText(ch, w / 2, hh * (0.18 + i * 0.32)));
        }, { off: 0.0056, bg: hex(accent) });
        print(`happi:matsuri:${hex(accent)}`, -0.075, 0.6, 0.075, 0.75, 256, 256, (c, w, hh) => {
          c.fillStyle = hex(accent);
          c.beginPath(); c.arc(w / 2, hh / 2, w * 0.47, 0, Math.PI * 2); c.lineWidth = w * 0.05; c.strokeStyle = hex(accent); c.stroke();
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${w * 0.62}px ${PRINT_FONT}`;
          c.fillText('祭', w / 2, hh * 0.54);
        }, { side: -1, off: 0.0012 });
        sleeve.cuff = accent;
        break;
      }
      default:
        crewNeck(shade(top, 0.9));
    }

    // ---- extras on the body
    if (type === 'apron' || extras.has('apron')) this._apron(type, { trunk, top, accent, h, onT, band, print, ta: (y) => Math.max(ta(y), pa(y)), tb: (y) => Math.max(tb(y), pb(y)), wSkirt, bump: trunkBump });
    if (extras.has('badge')) {
      const by = type === 'labcoat' ? 0.73 : type === 'station_uniform' ? 0.755 : 0.735;
      badge(type === 'labcoat' ? -0.058 : 0.054, by, type === 'konbini' ? C('#2f8a62') : type === 'labcoat' ? accent : jacket ? shade(top, 1.2) : top, type === 'labcoat' ? 0.0062 : 0.003);
    }
    if (extras.has('lanyard')) {
      const strap = C('#2c5aa0');
      both([[0.024, 0.838], [0.031, 0.835], [0.009, 0.712], [0.004, 0.714]], strap, { off: 0.0035, thick: 0.0012 });
      onT([[-0.017, 0.665], [0.017, 0.665], [0.017, 0.712], [-0.017, 0.712]], C('#ffffff', 'gloss'), { off: 0.0045, thick: 0.0018 });
      const fam = (CAST[this.name]?.nameJa || '').split(/[\s・]/)[0];
      print(`card:${fam}`, -0.0155, 0.667, 0.0155, 0.71, 96, 136, (c, w, hh) => {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, hh);
        c.fillStyle = '#2f8a62'; c.fillRect(0, 0, w, hh * 0.16);
        c.fillStyle = '#c9d6e3'; c.fillRect(w * 0.28, hh * 0.24, w * 0.44, hh * 0.36);
        c.fillStyle = '#2a2a2e'; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (fam) { c.font = `800 ${hh * 0.17}px ${PRINT_FONT}`; c.fillText(fam, w / 2, hh * 0.76, w * 0.9); }
      }, { off: 0.0066, bg: '#ffffff' });
    }
    if (extras.has('scarf')) this._scarf(type, accent, { trunk, h, onT, neckR, yWaist });

    // ---- bottoms: belt, skirt or trousers
    const belt = C(type === 'casual' ? '#5a3d2b' : '#2a2220', 'gloss');
    if (tucked && !skirt) {
      band(0.567, 0.589, belt, { surf: pelvisS, off: 0.0012, thick: 0.0022 });
      onT([[-0.011, 0.565], [0.011, 0.565], [0.011, 0.591], [-0.011, 0.591]], C('#c8c4bb', 'gloss'), { surf: pelvisS, off: 0.0036, thick: 0.002 });
    }
    let skirtS = null;
    if (skirt) {
      const long = type === 'cardigan';
      const yHem = h(long ? 0.18 : 0.285);
      const sa = curve([[yHem, h(long ? 0.125 : 0.128) * bw], [h(0.36), h(0.12) * bw], [h(0.45), h(0.109) * bw], [h(0.52), h(0.098) * bw], [h(0.6), pa(h(0.6)) + h(0.003)]]);
      const sb = curve([[yHem, h(long ? 0.09 : 0.092) * bw], [h(0.45), h(0.077) * bw], [h(0.52), h(0.07) * bw], [h(0.6), pb(h(0.6)) + h(0.003)]]);
      skirtS = new Surf((y) => [Math.max(sa(y), pa(y) + h(0.0045)), Math.max(sb(y), pb(y) + h(0.0045)), 0, 2.4], yHem, h(0.6), { w: wSkirt(h(0.54), h(0.43)) });
      this.addW(skirtS.mesh({ nu: 28, nv: 8 }), bottom, skirtS.w);
      this.addW(skirtS.mesh({ nu: 28, nv: 2, y0: yHem, y1: yHem + h(0.05), off: -h(0.0018), flip: true }), shade(bottom, 0.5), skirtS.w);
      if (tucked) band(0.575, 0.598, shade(bottom, 1.04), { surf: skirtS, off: 0.0008, thick: 0.002 });
      if (!long) onT([[-0.0012, 0.29], [0.0012, 0.29], [0.0012, 0.57], [-0.0012, 0.57]], shade(bottom, 0.75), { surf: skirtS, off: 0.0008 });
    }
    if (type === 'labcoat') {
      // coat tails to the knees, open at the front
      const ya = h(0.535); const yb = h(0.265);
      const ca = curve([[yb, ta(h(0.47)) + h(0.02)], [h(0.47), ta(h(0.47)) + h(0.006)], [ya, ta(ya) + h(0.006)]]);
      const cb = curve([[yb, tb(h(0.47)) + h(0.016)], [h(0.47), tb(h(0.47)) + h(0.006)], [ya, tb(ya) + h(0.006)]]);
      const coat = new Surf((y) => [ca(y), cb(y), 0, 2.4], yb, ya, { bump: trunkBump, w: wSkirt(h(0.5), h(0.4)) });
      const gap = (y) => 0.025 + 0.16 * smooth(h(0.5), h(0.3), y);
      this.addW(gridOpen(coat, gap, 30, 9, false, 0), top, coat.w);
      this.addW(gridOpen(coat, gap, 30, 9, true, -h(0.002)), shade(top, 0.86), coat.w);
      for (const s of [-1, 1]) pocket(s > 0 ? 0.035 : -0.085, s > 0 ? 0.085 : -0.035, 0.37, 0.43, shade(top, 0.98), { surf: coat });
    }

    // ---- legs
    const tightC = old ? C('#6b5f58') : C('#38302f');
    for (const l of this.legs) {
      const p0 = l.th.getWorldPosition(new THREE.Vector3());
      const y = (v) => p0.y + h(v);
      const wl = wLeg(l);
      if (skirt) {
        const prof = [[-0.468, 0.02], [-0.445, 0.021], [-0.4, 0.0245], [-0.33, 0.029], [-0.275, 0.0275], [-0.2475, 0.028], [-0.18, 0.032], [-0.08, 0.037], [0, 0.04], [0.025, 0.034], [0.038, 0.018], [0.042, 0.002]].map(([yy, r]) => [y(yy), h(r) * lw]);
        this.addW(latheSurf(prof, { cx: p0.x, cz: 0, zs: 0.98 }).mesh({ nu: 10, nv: 14 }), tightC, wl);
      } else {
        const r0 = (f ? 0.047 : 0.049) * bw;
        const prof = [[-0.467, 0.038], [-0.44, 0.0376], [-0.36, 0.0385], [-0.25, 0.0395], [-0.15, 0.0435], [-0.06, r0 - 0.0015], [0, r0], [0.03, r0 * 0.82], [0.045, r0 * 0.42], [0.05, 0.002]].map(([yy, r]) => [y(yy), h(r) * (yy > -0.25 ? 1 : lw)]);
        const leg = latheSurf(prof, { cx: p0.x, zs: 1.0, w: wl });
        this.addW(leg.mesh({ nu: 10, nv: 13 }), bottom, wl);
        // inside of the hem
        this.addW(leg.mesh({ nu: 10, nv: 1, y0: y(-0.467), y1: y(-0.455), off: -h(0.0012), flip: true }), shade(bottom, 0.5), wl);
        // front crease (dressy trousers) or an outer seam (jeans, casual)
        const crease = jacket || type === 'shirt' || type === 'labcoat' || (type === 'cardigan' && f) || type === 'polo';
        if (crease) this.addW(layerGeo(leg, panelShape(() => p0.x - h(0.0012), () => p0.x + h(0.0012), y(-0.462), y(-0.06), 1, 8), { off: h(0.0006) }), shade(bottom, luma(bottom) < 0.2 ? 1.28 : 0.9), wl);
        if (type === 'casual') this.addW(bandGeo(leg, y(-0.464), y(-0.442), { off: h(0.0015), thick: h(0.002), nu: 16 }), shade(bottom, 1.18), wl);
      }
    }
    this._shoes(type, f, old, { h, skirt, tightC, skin, bottom, top });

    // ---- arms and hands
    this.restArm = 0;
    {
      const hipHalf = Math.max(pa(h(0.47)), tucked ? 0 : ta(h(0.47)), skirtS ? skirtS.sec(h(0.44))[0] : 0, type === 'labcoat' ? ta(h(0.47)) + h(0.02) : 0);
      this.restArm = clamp(Math.asin((hipHalf + ra * 0.9 + h(0.006) - shX) / h(0.3)), 0.05, 0.2);
    }
    for (const a of this.arms) this._arm(a, { h, ra, skin, sleeve, upperArm, foreArm, wArm, type, f, b });

    // ---- neck & head
    // the head is one smooth mesh that paints its own face (face.js); ears are part of the body mesh
    const hcy = headR * 0.95;
    this.headCentre = V(0, hcy, 0);
    this.face = makeFace(headR, L, { browWeight: old ? 0.9 : 1 });
    this.face.mesh.position.set(0, hcy, 0);
    this.head.add(this.face.mesh);
    for (const s of [-1, 1]) this.add(new THREE.SphereGeometry(headR * 0.2, 10, 6), skin, this.head, [s * headR * 0.975, hcy + headR * (FACE.eye[1] - 0.04), -headR * 0.02], [0, s * 0.25, 0], [0.42, 1, 0.74]);
    this.headR = headR;
    this.headTop = hcy + headR * 1.12;

    const hairStyle = L.hair?.style || 'short';
    const atHead = new THREE.Matrix4().makeTranslation(0, hcy, 0);
    buildHair({ add: (geo, mat) => this.parts.push({ geo, mat: { ...mat, color: mat.color instanceof THREE.Color ? mat.color : new THREE.Color(mat.color) }, bone: this.head, m: atHead }), R: headR, style: hairStyle, color: L.hair?.color || '#2b1d14', sex: L.sex, extras, name: this.name });
    if (hairStyle === 'ponytail') this._ponytail(hair, headR, hcy);
    this._extras(extras, headR, hcy, hair, L);
  }

  /** Sleeve, elbow, wrist and a soft mitten hand. */
  _arm(a, { h, ra, skin, sleeve, upperArm, foreArm, wArm, type, f, b }) {
    const { s, ua, el, hd } = a;
    const p0 = ua.getWorldPosition(new THREE.Vector3());
    const y = (v) => p0.y + h(v);
    const w = wArm(a);
    const R = (k) => ra * k;
    const wrist = -(upperArm + foreArm) / this.H;
    const cuffY = wrist + 0.004;
    let sleeveEnd;
    if (sleeve.len === 'short') sleeveEnd = -0.088;
    else if (sleeve.len === 'wide') sleeveEnd = -0.24;
    else sleeveEnd = cuffY;
    // sleeve profile (bottom → top), the shoulder is a dome around the joint
    const prof = [];
    if (sleeve.len === 'wide') prof.push([sleeveEnd, R(1.32)], [sleeveEnd + 0.03, R(1.3)], [-0.17, R(1.24)], [-0.08, R(1.15)], [-0.02, R(1.06)]);
    else if (sleeve.len === 'short') prof.push([sleeveEnd, R(1.04)], [sleeveEnd + 0.02, R(1.02)], [-0.04, R(1.0)]);
    else prof.push([sleeveEnd, R(0.8)], [sleeveEnd + 0.016, R(0.79)], [-0.27, R(0.8)], [-0.17, R(0.87)], [-0.09, R(0.94)], [-0.03, R(0.99)]);
    prof.push([0.0, R(0.98)], [0.36 * ra / this.H, R(0.9)], [0.66 * ra / this.H, R(0.7)], [0.86 * ra / this.H, R(0.4)], [0.94 * ra / this.H, R(0.02)]);
    const sl = latheSurf(prof.map(([yy, r]) => [y(yy), r]), { cx: p0.x, cz: p0.z, zs: 0.94, w });
    this.addW(sl.mesh({ nu: 10, nv: sleeve.len === 'long' ? 15 : 10 }), sleeve.mat, w);
    if (sleeve.len !== 'long') this.addW(sl.mesh({ nu: 10, nv: 1, y0: y(sleeveEnd), y1: y(sleeveEnd + 0.012), off: -h(0.0012), flip: true }), shade(sleeve.mat, 0.5), w);
    if (sleeve.cuff) {
      const yc = sleeve.len === 'long' ? [cuffY, cuffY + 0.02] : [sleeveEnd, sleeveEnd + 0.013];
      this.addW(bandGeo(sl, y(yc[0]), y(yc[1]), { off: h(0.0012), thick: h(0.0018), nu: 14, rib: sleeve.cuffRib }), sleeve.cuff, w);
    }
    if (sleeve.stripe) this.addW(bandGeo(sl, y(cuffY + 0.028), y(cuffY + 0.034), { off: h(0.0008), thick: h(0.001), nu: 14 }), sleeve.stripe, w);
    // bare forearm (short and wide sleeves) and the wrist
    const skinTop = sleeve.len === 'long' ? cuffY + 0.015 : sleeve.len === 'wide' ? sleeveEnd + 0.04 : -0.05;
    const sk = [[wrist - 0.008, R(0.62)], [wrist + 0.006, R(0.64)], [wrist + 0.05, R(0.68)], [-0.2, R(0.74)], [-0.17, R(0.77)], [-0.1, R(0.84)], [-0.05, R(0.88)]].filter(([yy]) => yy <= skinTop + 1e-6);
    if (sk.length < 3) sk.push([skinTop, R(0.6)]);
    const skS = latheSurf(sk.map(([yy, r]) => [y(yy), r]), { cx: p0.x, cz: p0.z, zs: 0.92, w });
    this.addW(skS.mesh({ nu: 8, nv: Math.max(2, Math.round(sk.length * 1.3)) }), skin, w);

    // hand: a soft mitten (the palm faces the thigh: -s·x; the thumb is in front: +z). The three outer
    // fingers are one rounded block that curls on two joints, the index finger lies beside it so the hand
    // can still point, and the thumb is a short round stub. Tidy at a distance, no spiky fingers.
    const k = this.H * (f ? 1.08 : 1.14) * (1 + (b - 1) * 0.35);
    const kY = -0.04 * k;
    a.i1 = this.bone(hd, [0, kY, 0], 'index1');
    a.i2 = this.bone(a.i1, [0, -0.0145 * k, 0], 'index2');
    a.f1 = this.bone(hd, [0, kY, 0], 'fingers1');
    a.f2 = this.bone(a.f1, [0, -0.016 * k, 0], 'fingers2');
    const hw = hd.getWorldPosition(new THREE.Vector3());
    const blob = (c, r, n = 2.5) => {
      const g = new THREE.SphereGeometry(1, 10, 7);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, hw.x + (c[0] + spow(p.getX(i), 2 / n) * r[0]) * k, hw.y + (c[1] + spow(p.getY(i), 2 / n) * r[1]) * k, hw.z + (c[2] + spow(p.getZ(i), 2 / n) * r[2]) * k);
      g.computeVertexNormals();
      return g;
    };
    const curlW = (b1, b2, yJ) => (p) => {
      const yy = (p.y - hw.y) / k;
      const t1 = smooth(-0.036, -0.044, yy); const t2 = smooth(yJ + 0.004, yJ - 0.004, yy);
      return [[hd, 1 - t1], [b1, t1 * (1 - t2)], [b2, t1 * t2]];
    };
    this.addW(blob([-s * 0.001, -0.0235, 0.0004], [0.0118, 0.025, 0.0218], 2.3), skin, hd);
    this.addW(blob([-s * 0.0006, -0.052, -0.0052], [0.0102, 0.0205, 0.0152], 2.7), skin, curlW(a.f1, a.f2, -0.056));
    this.addW(blob([-s * 0.0006, -0.0505, 0.0128], [0.0092, 0.019, 0.0078], 2.4), skin, curlW(a.i1, a.i2, -0.0545));
    a.tb = this.bone(hd, [-s * 0.003 * k, -0.012 * k, 0.0135 * k], 'thumb');
    const tdir = V(-s * 0.3, -0.86, 0.42).normalize();
    const tq = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), tdir);
    const tg = new THREE.CapsuleGeometry(0.0074 * k, 0.012 * k, 3, 8);
    tg.applyQuaternion(tq);
    this.add(tg, skin, a.tb, [tdir.x * 0.011 * k, tdir.y * 0.011 * k, tdir.z * 0.011 * k]);
    a.k = k;
  }

  /** Shoes with a sole: sneakers, leather shoes, pumps, flats, comfort shoes or sandals. */
  _shoes(type, f, old, { h, skirt, tightC, skin }) {
    let style; let upper; let sole; let lace = null;
    if (type === 'casual') style = 'sandal';
    else if (['hoodie', 'polo', 'konbini', 'labcoat', 'happi'].includes(type)) style = 'sneaker';
    else if (f && old) style = 'comfort';
    else if (f && type === 'cardigan') style = 'flat';
    else if (f) style = 'pump';
    else style = 'leather';
    switch (style) {
      case 'sneaker': {
        const pal = { hoodie: ['#eeece6', '#ffffff', '#2b2f36'], polo: ['#2f3d5c', '#f4f2ec', '#f4f2ec'], konbini: ['#2a2b2f', '#f2f0ea', '#f2f0ea'], labcoat: ['#f0efea', '#e7e5df', '#d9d6cf'], happi: ['#25262b', '#e9e5da', '#e9e5da'] }[type] || ['#eeece6', '#ffffff', '#555'];
        upper = C(pal[0]); sole = C(pal[1]); lace = C(pal[2]);
        break;
      }
      case 'leather': upper = C(old || type === 'apron' || type === 'shirt' ? '#5a3a28' : '#1e1b1a', 'gloss'); sole = C('#141211'); break;
      case 'pump': upper = C('#1d1a1e', 'gloss'); sole = C('#141214'); break;
      case 'flat': upper = C('#b48d6c'); sole = C('#5a4636'); break;
      case 'comfort': upper = C('#8a7e72'); sole = C('#ece7dc'); break;
      default: upper = C('#6b4a32'); sole = C('#c9a27a');
    }
    const fs = h(1) * (f ? 0.94 : 1);
    const A = this.ankleH;
    const zh = -0.036 * fs; const zt = (style === 'leather' || style === 'pump' ? 0.094 : 0.088) * fs;
    const zc = (zh + zt) / 2; const hl = (zt - zh) / 2;
    const heelW = 0.0205 * fs; const ballW = (style === 'pump' || style === 'flat' ? 0.025 : 0.0285) * fs;
    const soleH = { sneaker: 0.014, comfort: 0.014, leather: 0.008, pump: 0.006, flat: 0.006, sandal: 0.012 }[style] * fs;
    const outline = [];
    for (let i = 0; i < 22; i++) {
      const phi = (i / 22) * Math.PI * 2;
      const z = zc + hl * Math.cos(phi);
      const wdt = lerp(heelW, ballW, smooth(zh, zc + 0.35 * hl, z)) * (1 - 0.25 * smooth(zc + 0.6 * hl, zt, z));
      outline.push(new THREE.Vector2(wdt * Math.sin(phi), z));
    }
    const shape = new THREE.Shape(outline);
    const bev = Math.min(soleH * 0.35, 0.003 * fs);
    for (const l of this.legs) {
      const ft = l.ft;
      const soleG = new THREE.ExtrudeGeometry(shape, { depth: soleH - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, steps: 1, curveSegments: 4 });
      soleG.rotateX(Math.PI / 2);
      soleG.translate(0, -A + soleH - bev, 0);
      this.add(soleG, sole, ft);
      const sTop = -A + soleH;
      if (style === 'sneaker' || style === 'leather' || style === 'comfort') {
        const uh = (style === 'leather' ? 0.036 : 0.043) * fs;
        const up = new THREE.SphereGeometry(1, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2);
        this.add(up, upper, ft, [0, sTop - 0.002 * fs, zc + 0.004 * fs], [0, 0, 0], [ballW * 0.97, uh, hl * 0.97]);
        // heel counter and collar around the ankle
        const col = new THREE.CylinderGeometry(0.0215 * fs, 0.0235 * fs, uh * 0.95, 14, 1, false);
        this.add(col, upper, ft, [0, sTop + uh * 0.45, zh + 0.026 * fs], [0, 0, 0], [1, 1, 1.12]);
        if (style === 'sneaker') {
          for (let i = 0; i < 3; i++) {
            const z = zc + (0.005 + i * 0.012) * fs - 0.004 * fs;
            const yy = sTop + uh * Math.sqrt(Math.max(0, 1 - ((z - zc - 0.004 * fs) / (hl * 0.97)) ** 2)) - 0.0015 * fs;
            this.add(new THREE.BoxGeometry(0.02 * fs, 0.0024 * fs, 0.004 * fs), lace, ft, [0, yy, z], [-0.35 + i * 0.12, 0, 0]);
          }
          this.add(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), sole, ft, [0, sTop - 0.004 * fs, zt - 0.03 * fs], [0, 0, 0], [ballW * 0.9, 0.013 * fs, 0.03 * fs]);
        }
        if (style === 'comfort') this.add(new THREE.BoxGeometry(ballW * 2.02, 0.008 * fs, 0.016 * fs), shade(upper, 0.8), ft, [0, sTop + uh * 0.72, zc - 0.004 * fs], [-0.3, 0, 0]);
        if (style === 'leather') this.add(new THREE.BoxGeometry(heelW * 1.7, 0.008 * fs, 0.026 * fs), sole, ft, [0, -A + 0.004 * fs, zh + 0.016 * fs]);
      } else {
        // the foot (tights or skin) shows on top of low shoes and sandals
        const footC = style === 'sandal' || !skirt ? skin : tightC;
        this.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), footC, ft, [0, sTop - 0.001 * fs, zc - 0.004 * fs], [0, 0, 0], [ballW * 0.86, 0.036 * fs, hl * 0.88]);
        this.add(new THREE.CylinderGeometry(0.018 * fs, 0.02 * fs, 0.03 * fs, 10), footC, ft, [0, sTop + 0.012 * fs, zh + 0.022 * fs]);
        if (style === 'sandal') {
          for (let i = 0; i < 5; i++) this.add(new THREE.SphereGeometry(0.0052 * fs, 5, 3), skin, ft, [(i - 2) * 0.0085 * fs, sTop + 0.004 * fs, zt - (0.012 + Math.abs(i - 1.2) * 0.003) * fs]);
          for (const [z, r] of [[zc + 0.02 * fs, 0.026], [zc - 0.024 * fs, 0.024]]) {
            const st = new THREE.TorusGeometry(r * fs, 0.004 * fs, 5, 12, Math.PI);
            this.add(st, upper, ft, [0, sTop, z], [0, Math.PI / 2, 0], [1, 1, 1.5]);
          }
        } else {
          // toe box and a low heel cup
          this.add(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), upper, ft, [0, sTop - 0.001 * fs, zc + 0.3 * hl], [0, 0, 0], [ballW * 0.99, 0.026 * fs, hl * 0.74]);
          const cup = new THREE.CylinderGeometry(heelW * 1.05, heelW * 1.08, 0.016 * fs, 14, 1, true, Math.PI / 2, Math.PI);
          cup.scale(1, 1, 1.25);
          this.add(cup, upper, ft, [0, sTop + 0.008 * fs, zh + heelW * 1.2]);
          const cupIn = cup.clone(); cupIn.scale(-0.96, 1, 0.96);
          this.add(cupIn, shade(upper, 0.6), ft, [0, sTop + 0.008 * fs, zh + heelW * 1.2]);
          if (style === 'pump') this.add(new THREE.BoxGeometry(0.016 * fs, 0.018 * fs, 0.014 * fs), sole, ft, [0, -A + 0.009 * fs, zh + 0.006 * fs]);
        }
      }
    }
  }

  /** Apron: a bib apron for the café owner, a waist apron (maekake) with the shop name over a happi. */
  _apron(type, { trunk, top, accent, h, onT, band, print, ta, tb, wSkirt, bump }) {
    const happi = type === 'happi';
    const ap = happi ? shade(top, 0.82) : C(this.look.outfit?.accent || '#6b4a32');
    const tie = happi ? accent : shade(ap, 0.9);
    const yTop = h(0.585); const yBot = h(happi ? 0.3 : 0.27);
    const aa = curve([[yBot, ta(h(0.47)) + h(0.022)], [h(0.47), ta(h(0.47)) + h(0.012)], [yTop, ta(yTop) + h(0.008)]]);
    const ab = curve([[yBot, tb(h(0.47)) + h(0.03)], [h(0.47), tb(h(0.47)) + h(0.014)], [yTop, tb(yTop) + h(0.008)]]);
    const S = new Surf((y) => [aa(y), ab(y), 0, 2.4], yBot, yTop, { bump, w: wSkirt(h(0.5), h(0.4)) });
    const wid = happi ? 1.25 : 1.05;
    this.addW(S.mesh({ nu: 18, nv: 10, th0: -wid, th1: wid }), ap, S.w);
    this.addW(S.mesh({ nu: 18, nv: 10, th0: -wid, th1: wid, off: -h(0.0015), flip: true }), shade(ap, 0.6), S.w);
    band(0.566, 0.584, tie, { surf: S, off: 0.0012, thick: 0.002 });
    if (!happi) {
      // bib with neck straps, and a big front pocket
      onT([[-0.052, 0.585], [0.052, 0.585], [0.046, 0.77], [-0.046, 0.77]], ap, { off: 0.003, thick: 0.002 });
      for (const s of [-1, 1]) onT(s > 0 ? [[0.036, 0.768], [0.046, 0.768], [0.031, 0.836], [0.024, 0.834]] : [[-0.046, 0.768], [-0.036, 0.768], [-0.024, 0.834], [-0.031, 0.836]], shade(ap, 0.92), { off: 0.0032, thick: 0.0018 });
      onT([[-0.045, 0.43], [0.045, 0.43], [0.045, 0.495], [-0.045, 0.495]], shade(ap, 0.94), { surf: S, off: 0.0012, thick: 0.002 });
      onT([[-0.0008, 0.432], [0.0008, 0.432], [0.0008, 0.494], [-0.0008, 0.494]], shade(ap, 0.7), { surf: S, off: 0.0035 });
    } else {
      print('maekake:daichi', -0.05, 0.4, 0.05, 0.46, 256, 154, (c, w, hh) => {
        c.fillStyle = hex(accent); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `800 ${hh * 0.62}px ${PRINT_FONT}`; c.fillText('だいち', w / 2, hh * 0.54, w * 0.96);
      }, { surf: S, off: 0.0012 });
    }
    // a bow at the back
    const bk = trunk.at(Math.PI, h(0.577), h(0.009));
    for (const s of [-1, 1]) {
      const loop = new THREE.TorusGeometry(h(0.012), h(0.0035), 5, 10);
      loop.scale(1, 0.6, 0.5); loop.rotateZ(s * 0.35); loop.translate(bk.x + s * h(0.013), bk.y, bk.z - h(0.002));
      this.addW(loop, tie, trunk.w);
      const tail = new THREE.BoxGeometry(h(0.008), h(0.05), h(0.002)); tail.rotateZ(s * 0.18); tail.translate(bk.x + s * h(0.008), bk.y - h(0.027), bk.z);
      this.addW(tail, tie, trunk.w);
    }
  }

  _scarf(type, accent, { trunk, h, onT, neckR, yWaist }) {
    const thick = type === 'cardigan';
    const r = neckR + h(thick ? 0.011 : 0.007);
    const ring = new THREE.TorusGeometry(r, h(thick ? 0.011 : 0.0075), 8, 20);
    ring.scale(1.05, 1, 0.95);
    this.add(ring, accent, this.chest, [0, h(0.84) - yWaist, -h(0.004)], [Math.PI / 2 - 0.12, 0, 0]);
    if (thick) {
      onT([[0.006, 0.834], [0.026, 0.832], [0.03, 0.72], [0.012, 0.722]], shade(accent, 0.97), { off: 0.004, thick: 0.006 });
      onT([[-0.024, 0.832], [-0.006, 0.834], [-0.004, 0.745], [-0.022, 0.743]], shade(accent, 0.9), { off: 0.004, thick: 0.005 });
    } else {
      const k = trunk.at(trunk.th(h(0.022), h(0.825)), h(0.825), h(0.008));
      const knot = new THREE.SphereGeometry(h(0.0105), 8, 6); knot.scale(1.1, 0.9, 0.7); knot.translate(k.x, k.y, k.z);
      this.addW(knot, accent, trunk.w);
      for (const s of [-1, 1]) {
        const tail = new THREE.ConeGeometry(h(0.012), h(0.034), 4, 1);
        tail.rotateZ(Math.PI + s * 0.45); tail.scale(1, 1, 0.3); tail.translate(k.x + s * h(0.01), k.y - h(0.017), k.z + h(0.002));
        this.addW(tail, shade(accent, s > 0 ? 1 : 0.9), trunk.w);
      }
    }
  }

  _stethoscope(trunk, h, w) {
    const pt = (x, y, off) => { const p = trunk.at(trunk.th(h(x), h(y)), h(y), h(off)); return [p.x, p.y, p.z]; };
    const back = trunk.at(Math.PI, h(0.838), h(0.006));
    const path = [pt(0.036, 0.69, 0.006), pt(0.04, 0.75, 0.007), pt(0.036, 0.81, 0.007), pt(0.03, 0.838, 0.007), [h(0.034), h(0.846), -h(0.012)], [back.x, back.y + h(0.002), back.z], [-h(0.034), h(0.846), -h(0.012)], pt(-0.03, 0.838, 0.007), pt(-0.036, 0.81, 0.007), pt(-0.038, 0.77, 0.007)];
    this.addW(tubeGeo(path, h(0.0032), 40, 6), C('#2b2d31', 'gloss'), w);
    const end = path[0];
    const disc = new THREE.CylinderGeometry(h(0.009), h(0.009), h(0.004), 14);
    disc.rotateX(Math.PI / 2); disc.translate(end[0], end[1] - h(0.006), end[2] + h(0.002));
    this.addW(disc, C('#c9ccd2', 'gloss'), w);
    const e = path[path.length - 1];
    for (const s of [-1, 1]) {
      const tip = new THREE.CylinderGeometry(h(0.0018), h(0.0018), h(0.022), 6); tip.rotateZ(s * 0.25); tip.translate(e[0] + s * h(0.004), e[1] - h(0.012), e[2] + h(0.001));
      this.addW(tip, C('#c9ccd2', 'gloss'), w);
    }
  }

  _ponytail(m, R, hcy) {
    const tail = this.bone(this.head, [0, hcy + R * 0.42, -R * 1.0], 'tail');
    this.add(new THREE.TorusGeometry(R * 0.13, R * 0.055, 6, 12), C('#c8474f'), tail, [0, 0, 0], [0.5, 0, 0]);
    // one smooth lock, full in the middle and soft at the tip
    const prof = [[0, -1.5], [0.1, -1.44], [0.22, -1.2], [0.3, -0.8], [0.27, -0.4], [0.17, -0.1], [0.1, 0.02]].map(([r, y]) => new THREE.Vector2(r * R, y * R));
    const g = new THREE.LatheGeometry(prof, 10);
    g.deleteAttribute('uv');
    this.add(g, m, tail, [0, 0, -R * 0.04], [0.32, 0, 0], [1.15, 1, 0.85]);
    this.tail = tail;
  }

  _extras(ex, R, hcy, hairC, L) {
    const h = this.head;
    if (ex.has('glasses')) {
      // round frames (no lens: the painted eyes stay clear), a bridge and temples to the ears
      const gm = C('#3a2f2c', 'gloss');
      const [ex0, ey] = FACE.eye;
      for (const s of [-1, 1]) this.add(new THREE.TorusGeometry(R * 0.255, R * 0.017, 6, 20), gm, h, [s * R * ex0, hcy + R * (ey + 0.01), R * 0.985], [0, s * 0.3, 0], [1, 0.92, 1]);
      this.add(new THREE.BoxGeometry(R * 0.26, R * 0.026, R * 0.026), gm, h, [0, hcy + R * (ey + 0.07), R * 1.045]);
      for (const s of [-1, 1]) this.add(new THREE.BoxGeometry(R * 0.028, R * 0.03, R * 0.98), gm, h, [s * R * 0.845, hcy + R * (ey + 0.05), R * 0.47], [0, -s * 0.42, 0]);
    }
    if (ex.has('cap')) {
      // uniform cap: a crown that widens to the top, a darker band with a gold cord, a glossy peak and a badge
      const cm = C(L.outfit?.top || '#1f2a44');
      const gold = C(L.outfit?.accent || '#c9a54a', 'gloss');
      this.add(new THREE.CylinderGeometry(R * 1.13, R * 1.04, R * 0.5, 24), cm, h, [0, hcy + R * 0.66, -R * 0.04], [-0.1, 0, 0], [1, 1, 1.02]);
      this.add(new THREE.CylinderGeometry(R * 1.055, R * 1.05, R * 0.2, 24, 1, true), shade(cm, 0.6), h, [0, hcy + R * 0.5, -R * 0.02], [-0.1, 0, 0]);
      this.add(new THREE.CylinderGeometry(R * 1.065, R * 1.065, R * 0.045, 24, 1, true), gold, h, [0, hcy + R * 0.58, -R * 0.03], [-0.1, 0, 0]);
      this.add(new THREE.CylinderGeometry(R * 0.98, R * 1.0, R * 0.05, 20, 1, false, -Math.PI / 2, Math.PI), C('#121315', 'gloss'), h, [0, hcy + R * 0.4, R * 0.2], [-0.32, 0, 0], [1, 1, 1.25]);
      const emb = new THREE.SphereGeometry(R * 0.11, 10, 6); emb.scale(1, 1.15, 0.4);
      this.add(emb, gold, h, [0, hcy + R * 0.7, R * 1.04], [-0.1, 0, 0]);
    }
    if (ex.has('headband')) this._headband(R, hcy, L);
    // beard and moustache are painted on the face patch (face.js)
    if (ex.has('earrings')) for (const s of [-1, 1]) this.add(new THREE.SphereGeometry(R * 0.05, 8, 6), C('#e8c45a', 'gloss'), h, [s * R * 0.985, hcy - R * 0.37, -R * 0.02]);
  }

  /** Hachimaki: a tenugui band tied around the head over the hair, knotted at the back with two tails. */
  _headband(R, hcy, L) {
    const cloth = C(L.outfit?.accent || '#f4f1ea');
    const line = C(L.outfit?.top || '#2f4a7a');
    const pos = []; const nor = [];
    const N = 44; const el = (az) => lerp(0.44, 0.24, (1 - Math.cos(az)) / 2);
    const w = 0.1;
    const P = (az, d, r) => headPoint(az, el(az) + d, R * r, R);
    const _e1 = new THREE.Vector3(); const _e2 = new THREE.Vector3();
    const quad = (a, b, c, d, n) => {
      _e1.subVectors(b, a); _e2.subVectors(c, a);
      const vs = _e1.cross(_e2).dot(n[0]) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
      for (const v of vs) pos.push(v.x, v.y + hcy, v.z);
      for (let i = 0; i < 6; i++) nor.push(n[i % n.length].x, n[i % n.length].y, n[i % n.length].z);
    };
    const ro = 1.125; const ri = 1.075;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2; const a1 = ((i + 1) / N) * Math.PI * 2;
      const o00 = P(a0, -w, ro); const o01 = P(a0, w, ro); const o10 = P(a1, -w, ro); const o11 = P(a1, w, ro);
      quad(o00.p, o10.p, o11.p, o01.p, [o00.n, o10.n, o11.n, o00.n, o11.n, o01.n]);
      const i00 = P(a0, -w, ri); const i01 = P(a0, w, ri); const i10 = P(a1, -w, ri); const i11 = P(a1, w, ri);
      const up = V(0, 1, 0); const dn = V(0, -1, 0);
      quad(o01.p, o11.p, i11.p, i01.p, [up]);
      quad(o00.p, i00.p, i10.p, o10.p, [dn]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.add(g, cloth, this.head);
    // two thin stripes in the coat colour
    for (const d of [-w * 0.55, w * 0.55]) {
      const sp = []; const sn = [];
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2; const a1 = ((i + 1) / N) * Math.PI * 2;
        const q = [P(a0, d - 0.012, ro + 0.004), P(a1, d - 0.012, ro + 0.004), P(a1, d + 0.012, ro + 0.004), P(a0, d + 0.012, ro + 0.004)];
        for (const k of [0, 1, 2, 0, 2, 3]) { sp.push(q[k].p.x, q[k].p.y + hcy, q[k].p.z); sn.push(q[k].n.x, q[k].n.y, q[k].n.z); }
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      sg.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
      this.add(sg, line, this.head);
    }
    // knot and tails at the back, a little to the side
    const az = Math.PI * 0.86;
    const k = headPoint(az, el(az), R * 1.17, R);
    const knot = new THREE.SphereGeometry(R * 0.13, 10, 7); knot.scale(1, 0.8, 0.75);
    this.add(knot, cloth, this.head, [k.p.x, k.p.y + hcy, k.p.z]);
    for (const s of [-1, 1]) {
      const tail = new THREE.BoxGeometry(R * 0.2, R * 0.62, R * 0.03, 1, 3, 1);
      const tp = tail.attributes.position;
      for (let i = 0; i < tp.count; i++) { const yy = tp.getY(i); tp.setX(i, tp.getX(i) * (1 + (0.31 - yy / R) * 0.5)); tp.setZ(i, tp.getZ(i) - (yy / R - 0.31) ** 2 * R * 0.25); }
      tail.computeVertexNormals();
      tail.translate(0, -R * 0.31, 0);
      tail.rotateZ(s * 0.38);
      tail.rotateY(az);
      tail.translate(k.p.x, k.p.y + hcy - R * 0.02, k.p.z - R * 0.02);
      this.add(tail, shade(cloth, s > 0 ? 1 : 0.94), this.head);
    }
  }

  /** Merge every shape into one indexed skinned mesh (plus one for the printed details, when there are any). */
  _bake() {
    this.root.updateMatrixWorld(true);
    const bones = [];
    this.rootBone.traverse((o) => { if (o.isBone) { o.userData.index = bones.length; bones.push(o); } });
    const buckets = new Map();
    const P = new THREE.Vector3();
    for (const p of this.parts) {
      const key = p.mat.bucket === 'print' ? 'print' : 'body';
      if (!buckets.has(key)) buckets.set(key, []);
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      const keep = key === 'print' ? ['position', 'normal', 'uv'] : ['position', 'normal', 'color'];
      for (const n of Object.keys(g.attributes)) if (!keep.includes(n)) g.deleteAttribute(n);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(p.bone.matrixWorld, p.m));
      const n = g.attributes.position.count;
      if (key !== 'print') {
        const shadeA = g.attributes.color;
        const col = new Float32Array(n * 3); const kind = new Float32Array(n * 2);
        const [rough, glow] = KIND[p.mat.bucket] || KIND.matte;
        for (let i = 0; i < n; i++) {
          const k = shadeA ? shadeA.getX(i) : 1;
          col[i * 3] = p.mat.color.r * k; col[i * 3 + 1] = p.mat.color.g * k; col[i * 3 + 2] = p.mat.color.b * k;
          kind[i * 2] = rough; kind[i * 2 + 1] = glow;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setAttribute('aMat', new THREE.BufferAttribute(kind, 2));
      }
      const si = new Uint16Array(n * 4); const sw = new Float32Array(n * 4);
      if (p.w) {
        for (let i = 0; i < n; i++) {
          P.fromBufferAttribute(g.attributes.position, i);
          const ws = p.w(P).filter(([, wt]) => wt > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
          let sum = 0;
          for (const [, wt] of ws) sum += wt;
          ws.forEach(([bn, wt], j) => { si[i * 4 + j] = bn.userData.index; sw[i * 4 + j] = wt / sum; });
        }
      } else {
        for (let i = 0; i < n; i++) { si[i * 4] = p.bone.userData.index; sw[i * 4] = 1; }
      }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      buckets.get(key).push(g);
      p.geo.dispose?.();
    }
    const skeleton = new THREE.Skeleton(bones);
    this.meshes = [];
    for (const [key, list] of buckets) {
      const geo = weld(mergeNonIndexed(list));
      const mesh = new THREE.SkinnedMesh(geo, bucketMaterial(key));
      mesh.castShadow = key !== 'print';
      mesh.frustumCulled = false;
      mesh.bind(skeleton, new THREE.Matrix4());
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
    this.parts = null;
    // a phone for calls/gestures (kept separate so it can be shown/hidden); held against the palm
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.01), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.3 }));
    const a = this.arms[1];
    phone.position.set(-a.s * 0.019 * a.k, -0.034 * a.k, 0.004 * a.k);
    phone.rotation.set(0, Math.PI / 2, 0);
    phone.visible = false;
    a.hd.add(phone);
    this.phone = phone;
  }

  // ------------------------------------------------------------------ control
  gesture(name, opts = {}) {
    const dur = { bow_light: 1.3, bow: 2.0, nod: 0.9, wave: 1.8, point: 2.4, offer: 2.4, receive: 2.0, think: 2.4, laugh: 1.6, surprised: 1.4, shake_head: 1.2, beckon: 1.8, phone: 0 }[name];
    if (dur === undefined) return;
    if (name === 'phone') { this.phoneMode = true; this.phone.visible = true; return; }
    this.gestures = this.gestures.filter((g) => g.name !== name);
    this.gestures.push({ name, t: 0, dur, target: opts.target?.clone?.() });
  }

  clearGestures() { this.gestures = []; this.phoneMode = false; if (this.phone) this.phone.visible = false; }
  setSitting(on, seatH = 0.45) { this.sitting = on; this.seatH = seatH; }
  setLookTarget(v) { this.lookTarget = v; }

  update(dt, level = 0) {
    this.t += dt;
    const t = this.t;
    const H = this.H;
    const ex = this.face.expression;
    const R = (o, x = 0, y = 0, z = 0) => o.rotation.set(x, y, z);
    R(this.hips); R(this.spine); R(this.chest); R(this.neck); R(this.head);
    this.hips.position.y = H * 0.505;
    this.chest.position.y = 0;
    for (const l of this.legs) { R(l.th); R(l.kn); R(l.ft); }
    R(this.seat); this.seat.scale.set(1, 1, 1);
    for (const a of this.arms) {
      R(a.sh); a.ua.quaternion.identity(); a.ua.rotation.set(0.06, 0, a.s * this.restArm); R(a.el, -0.14); R(a.hd);
      a.pose.curl = 0.34; a.pose.index = 0.32; a.pose.thumb = 0.3;
    }

    const breath = Math.sin(t * 1.6);
    this.chest.scale.set(1 + breath * 0.006, 1 + breath * 0.008, 1 + breath * 0.01);
    this.spine.rotation.z = Math.sin(t * 0.37) * 0.012;
    this.hips.rotation.z = Math.sin(t * 0.37 + 1) * 0.01;
    this.hips.position.x = Math.sin(t * 0.37) * 0.005;
    for (const a of this.arms) a.ua.rotation.z += a.s * breath * 0.008;
    // posture: older people stoop a little (rounded back, head forward, soft knees)
    if (this.old) {
      this.spine.rotation.x += 0.07; this.chest.rotation.x += 0.06;
      this.neck.rotation.x -= 0.06; this.head.rotation.x -= 0.05;
      for (const a of this.arms) a.ua.rotation.x += 0.07;
      if (!this.sitting) for (const l of this.legs) { l.th.rotation.x = -0.05; l.kn.rotation.x = 0.1; l.ft.rotation.x = -0.05; }
    }
    // the resting expression carries a little head pose (a shy tilt, a stern lifted chin …)
    this.head.rotation.x += ex.headX;
    this.head.rotation.z += ex.headZ;

    if (this.sitting) {
      this.hips.position.y = this.seatH + H * 0.045;
      // thighs slope down just enough for the feet to reach the floor
      const hipJ = this.seatH + H * 0.025;
      const drop = clamp(Math.asin(clamp((hipJ - this.shinLen - this.ankleH) / this.thighLen, -1, 1)), -0.08, 0.5);
      for (const l of this.legs) { l.th.rotation.x = -Math.PI / 2 + drop; l.th.rotation.z = l.s * 0.03; l.kn.rotation.x = Math.PI / 2 - drop; }
      this.seat.rotation.x = -Math.PI / 2 + drop; this.seat.scale.set(1, 0.3, 0.8);
      for (const a of this.arms) { a.ua.rotation.x = -0.4; a.el.rotation.x = -0.85; a.ua.rotation.z = a.s * 0.12; a.hd.rotation.y = -a.s * 0.25; a.pose.curl = 0.35; a.pose.index = 0.3; }
    }

    let tgtYaw = 0; let tgtPitch = 0;
    if (this.lookTarget) {
      const headW = new THREE.Vector3();
      this.head.getWorldPosition(headW);
      const d = this.lookTarget.clone().sub(headW);
      const inv = new THREE.Quaternion();
      this.root.getWorldQuaternion(inv).invert();
      d.applyQuaternion(inv);
      tgtYaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.3, 1.3);
      tgtPitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.45, 0.4);
    }
    const k = 1 - Math.exp(-dt * 5);
    this.headYaw += (tgtYaw - this.headYaw) * k;
    this.headPitch += (tgtPitch - this.headPitch) * k;
    const bodyShare = Math.max(0, Math.abs(this.headYaw) - 0.5) * Math.sign(this.headYaw);
    this.bodyYaw += (bodyShare * 0.6 - this.bodyYaw) * k * 0.5;
    this.spine.rotation.y += this.bodyYaw * 0.6;
    this.neck.rotation.y += (this.headYaw - this.bodyYaw * 0.6) * 0.45;
    this.head.rotation.y += (this.headYaw - this.bodyYaw * 0.6) * 0.55;
    this.head.rotation.x += this.headPitch * 0.75;
    this.neck.rotation.x += this.headPitch * 0.25;
    // eyes lead the head a little, plus small glances now and then
    this.saccT -= dt;
    if (!(this.saccT > 0)) { this.saccT = 0.8 + Math.random() * 2.2; this.sacc = [(Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08]; }
    const gazeX = THREE.MathUtils.clamp((tgtYaw - this.headYaw) * 0.9 + this.sacc[0], -0.32, 0.32);
    const gazeY = THREE.MathUtils.clamp(-(tgtPitch - this.headPitch) * 0.7 + this.sacc[1], -0.16, 0.12);

    this.level += (level - this.level) * (level > this.level ? 0.7 : 0.3);
    const talking = this.level > 0.05;
    const open = talking ? Math.min(1, this.level * 1.3) * (0.65 + 0.35 * Math.abs(Math.sin(t * 17))) : 0;
    this.mouth += (open - this.mouth) * 0.5;
    const browUp = talking ? this.level * 0.003 : 0;
    if (talking) {
      this.head.rotation.x += Math.sin(t * 3.1) * 0.025 * this.level;
      this.head.rotation.z += Math.sin(t * 1.7) * 0.02;
      const right = this.arms[1];
      right.ua.rotation.x -= 0.18 + Math.sin(t * 2.3) * 0.08;
      right.el.rotation.x -= 0.5 + Math.sin(t * 2.3 + 0.6) * 0.15;
      right.hd.rotation.y += right.s * 0.5;
      right.pose.curl = 0.3 + 0.1 * Math.sin(t * 2.3); right.pose.index = 0.2; right.pose.thumb = -0.1;
    }
    let browExtra = 0;

    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.16; this.blinkT = 2 + Math.random() * 4; }
    const closed = this.blink > 0 ? Math.sin(Math.PI * (1 - this.blink / 0.16)) : 0;
    this.blink = Math.max(0, this.blink - dt);
    let squint = 0;

    if (this.tail) this.tail.rotation.x = Math.sin(t * 2) * 0.05 - this.head.rotation.x * 0.5;
    if (this.phoneMode) this._phonePose();
    for (const g of this.gestures) {
      g.t += dt;
      const r = this._apply(g);
      if (r?.squint) squint = Math.max(squint, r.squint);
      if (r?.brow) browExtra = Math.max(browExtra, r.brow);
    }
    this.gestures = this.gestures.filter((g) => g.t < g.dur);
    for (const a of this.arms) a.em.quaternion.identity().slerp(a.el.quaternion, 0.5);
    for (const l of this.legs) l.km.quaternion.identity().slerp(l.kn.quaternion, 0.5);
    this._fingers();
    this.face.set({ blink: closed, squint, mouth: this.mouth, brow: (browUp + browExtra) / this.headR, gazeX, gazeY });
  }

  /** Blend a hand toward a pose ({curl, index, thumb}: 0 straight … 1.5 fist; thumb -1 spread … 1 tucked). */
  _hand(a, pose, e) {
    for (const key of ['curl', 'index', 'thumb']) if (pose[key] !== undefined) a.pose[key] += (pose[key] - a.pose[key]) * e;
  }

  _fingers() {
    for (const a of this.arms) {
      const { curl, index, thumb } = a.pose; const s = a.s;
      a.f1.rotation.set(0, 0, -s * curl * 1.05); a.f2.rotation.set(0, 0, -s * curl * 1.2);
      a.i1.rotation.set(0, 0, -s * index * 1.05); a.i2.rotation.set(0, 0, -s * index * 1.15);
      a.tb.rotation.set(0.35 * thumb, -s * 0.5 * thumb, -s * 0.55 * thumb);
    }
  }

  _phonePose() {
    const a = this.arms[1];
    a.ua.rotation.set(-0.35, 0, a.s * 0.55);
    a.el.rotation.set(-2.35, 0, 0);
    a.hd.rotation.set(0, 0.4, 0);
    this._hand(a, { curl: 1.0, index: 0.85, thumb: 0.55 }, 1);
  }

  _apply(g) {
    const p = g.t / g.dur;
    const e = env(p);
    const [Lf, Rt] = this.arms;
    switch (g.name) {
      case 'bow_light':
      case 'bow': {
        const deg = g.name === 'bow' ? 0.55 : 0.28;
        const ee = env(p, 0.3, 0.38);
        this.spine.rotation.x += deg * ee;
        this.head.rotation.x += 0.15 * ee;
        for (const a of this.arms) { a.ua.rotation.x += 0.05 * ee; a.ua.rotation.z -= a.s * 0.05 * ee; this._hand(a, { curl: 0.12, index: 0.08, thumb: 0.2 }, ee); }
        return null;
      }
      case 'nod': this.head.rotation.x += Math.sin(p * Math.PI * 4) * 0.18 * env(p, 0.1, 0.2); return null;
      case 'shake_head': this.head.rotation.y += Math.sin(p * Math.PI * 6) * 0.3 * env(p, 0.1, 0.2); return null;
      case 'wave': {
        // upper arm out to the side, forearm up, open palm toward the listener, waving from the elbow
        const s = Rt.s;
        Rt.ua.rotation.z += s * 1.2 * e; Rt.ua.rotation.x += -0.3 * e;
        Rt.el.rotation.z += s * (1.5 + Math.sin(p * Math.PI * 8) * 0.28) * e;
        Rt.el.rotation.x += 0.1 * e;
        Rt.hd.rotation.y += s * 1.45 * e;
        this._hand(Rt, { curl: 0.04, index: 0.02, thumb: -0.6 }, e);
        return null;
      }
      case 'beckon':
        Rt.ua.rotation.x += -0.9 * e; Rt.ua.rotation.z += -0.2 * e;
        Rt.el.rotation.x += -0.6 * e;
        Rt.hd.rotation.y += 1.4 * e;
        this._hand(Rt, { curl: 0.15 + Math.max(0, Math.sin(p * Math.PI * 6)) * 1.2, index: 0.1 + Math.max(0, Math.sin(p * Math.PI * 6)) * 1.2, thumb: 0.1 }, e);
        return null;
      case 'offer':
      case 'receive':
        for (const a of this.arms) { a.ua.rotation.x += -0.75 * e; a.ua.rotation.z += -a.s * 0.15 * e; a.el.rotation.x += -0.55 * e; a.hd.rotation.y += a.s * 1.2 * e; this._hand(a, { curl: g.name === 'offer' ? 0.35 : 0.12, index: g.name === 'offer' ? 0.3 : 0.08, thumb: g.name === 'offer' ? 0.5 : -0.2 }, e); }
        this.spine.rotation.x += 0.18 * e;
        return null;
      case 'think':
        // hand to the chin, the other arm across the waist
        Rt.ua.rotation.x += -1.02 * e; Rt.ua.rotation.z += -Rt.s * 0.42 * e;
        Rt.el.rotation.x += -2.15 * e;
        Rt.hd.rotation.y += Rt.s * 0.5 * e; Rt.hd.rotation.x += 0.3 * e;
        this.head.rotation.z += 0.14 * e; this.head.rotation.x += -0.06 * e;
        Lf.ua.rotation.x += -0.3 * e; Lf.el.rotation.x += -1.1 * e; Lf.ua.rotation.z += 0.35 * e;
        this._hand(Rt, { curl: 1.2, index: 0.7, thumb: -0.2 }, e);
        this._hand(Lf, { curl: 0.6, index: 0.5, thumb: 0.2 }, e);
        return null;
      case 'laugh':
        this.head.rotation.x += -0.12 * e + Math.sin(p * Math.PI * 10) * 0.04 * e;
        this.chest.position.y = Math.abs(Math.sin(p * Math.PI * 10)) * 0.008 * e;
        Rt.ua.rotation.x += -0.4 * e; Rt.el.rotation.x += -1.6 * e;
        this._hand(Rt, { curl: 0.55, index: 0.45, thumb: 0.2 }, e);
        return { squint: e };
      case 'surprised':
        this.head.rotation.x += -0.12 * e;
        for (const a of this.arms) { a.ua.rotation.x += -0.5 * e; a.el.rotation.x += -1.0 * e; this._hand(a, { curl: 0.0, index: 0.0, thumb: -0.5 }, e); }
        return { brow: 0.012 * e };
      case 'point': {
        const ee = env(p, 0.2, 0.25);
        const tgt = g.target || this.root.localToWorld(V(0.6, 1.2, 1.5));
        const sh = new THREE.Vector3();
        Rt.sh.getWorldPosition(sh);
        const dirW = tgt.clone().sub(sh).normalize();
        const q = new THREE.Quaternion();
        Rt.sh.getWorldQuaternion(q);
        const dirL = dirW.applyQuaternion(q.invert());
        const aim = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dirL);
        Rt.ua.quaternion.slerp(aim, ee);
        Rt.el.rotation.x *= 1 - ee;
        this._hand(Rt, { curl: 1.45, index: 0.0, thumb: 0.9 }, ee);
        return null;
      }
      default: return null;
    }
  }

  get voiceAnchor() { return this.head; }

  topWorld(target = new THREE.Vector3()) {
    return this.head.localToWorld(target.set(0, this.headTop + this.headR * 0.15, 0));
  }

  dispose() {
    for (const m of this.meshes || []) m.geometry.dispose();
    this.face?.mesh.geometry.dispose();
    this.face?.mesh.material.dispose();
  }
}

/** A surface strip around th ∈ [gap(y), 2π − gap(y)]: open at the front, wider toward the hem (coat tails). */
function gridOpen(surf, gap, nu, nv, flip, off) {
  const pos = []; const nor = []; const idx = [];
  const P = new THREE.Vector3(); const N = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const y = lerp(surf.y0, surf.y1, j / nv);
    const g = gap(y);
    for (let i = 0; i <= nu; i++) {
      const th = lerp(g, Math.PI * 2 - g, i / nu);
      surf.raw(th, y, P); surf.normal(th, y, N);
      if (off) P.addScaledVector(N, off);
      if (flip) N.negate();
      pos.push(P.x, P.y, P.z); nor.push(N.x, N.y, N.z);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const A = j * (nu + 1) + i; const B = A + 1; const D = A + nu + 1; const E = D + 1;
      if (flip) idx.push(A, E, B, A, D, E); else idx.push(A, B, E, A, E, D);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

function mergeNonIndexed(list) {
  const out = new THREE.BufferGeometry();
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const attrs = [['position', 3, Float32Array], ['normal', 3, Float32Array], ['color', 3, Float32Array], ['aMat', 2, Float32Array], ['uv', 2, Float32Array], ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array]]
    .filter(([name]) => list.every((g) => g.attributes[name]));
  for (const [name, size, Arr] of attrs) {
    const arr = new Arr(n * size);
    let off = 0;
    for (const g of list) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/** Index a merged geometry: vertices that agree in every attribute are shared (about a quarter as many to skin). */
function weld(geo) {
  const names = Object.keys(geo.attributes);
  const q = { position: 2e4, normal: 24, color: 96, aMat: 100, uv: 2048, skinIndex: 1, skinWeight: 48 };
  const n = geo.attributes.position.count;
  const map = new Map(); const remap = new Uint32Array(n); const keepIdx = [];
  for (let i = 0; i < n; i++) {
    let key = '';
    for (const name of names) {
      const a = geo.attributes[name]; const k = q[name] || 100;
      for (let c = 0; c < a.itemSize; c++) key += Math.round(a.array[i * a.itemSize + c] * k) + ',';
    }
    let j = map.get(key);
    if (j === undefined) { j = keepIdx.length; map.set(key, j); keepIdx.push(i); }
    remap[i] = j;
  }
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const a = geo.attributes[name];
    const arr = new a.array.constructor(keepIdx.length * a.itemSize);
    keepIdx.forEach((src, dst) => { for (let c = 0; c < a.itemSize; c++) arr[dst * a.itemSize + c] = a.array[src * a.itemSize + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  const idx = [];
  for (let i = 0; i < n; i += 3) { const a = remap[i]; const b = remap[i + 1]; const c = remap[i + 2]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  out.setIndex(idx);
  geo.dispose();
  return out;
}
