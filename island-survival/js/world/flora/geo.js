// world/flora/geo.js — tiny low-poly geometry kit: a Build collects vertex-coloured triangles (blobs, tubes,
// ribbons, blades, pinnate fronds, heart leaves) and turns them into one BufferGeometry.
import * as THREE from 'three';
import { RNG } from '../../core/rng.js';

export const HSL = (h, s, l) => new THREE.Color().setHSL(h, s, l);
export function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const unitIco = {};
function ico(detail) {
  if (!unitIco[detail]) { const g = new THREE.IcosahedronGeometry(1, detail); unitIco[detail] = g.index ? g.toNonIndexed().attributes.position.array : g.attributes.position.array; }
  return unitIco[detail];
}

export class Build {
  constructor(seed = 1) { this.P = []; this.C = []; this.rng = new RNG(seed); this.seed = seed; }

  tri(a, b, c, ca, cb = ca, cc = ca) {
    this.P.push(a.x ?? a[0], a.y ?? a[1], a.z ?? a[2], b.x ?? b[0], b.y ?? b[1], b.z ?? b[2], c.x ?? c[0], c.y ?? c[1], c.z ?? c[2]);
    this.C.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }
  quad(a, b, c, d, ca, cb = ca, cc = ca, cd = cc) { this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd); }

  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeVertexNormals();
    return g;
  }

  /** warped, vertically shaded icosphere (foliage clump / rock / fruit). opts: amp, lo, hi, facet, sd */
  blob(cx, cy, cz, rx, ry, rz, detail, color, o = {}) {
    const { amp = 0.2, lo = 0.7, hi = 1.12, facet = 0.07, sd = this.rng.int(1, 999), yaw = 0, ground = false } = o;
    const src = ico(detail);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const out = [];
    for (let i = 0; i < src.length; i += 3) {
      const ux = src[i], uy = src[i + 1], uz = src[i + 2];
      const k = 1 + amp * (hash3(Math.round(ux * 50) + sd, Math.round(uy * 50), Math.round(uz * 50)) - 0.5) * 2;
      let x = ux * k * rx, y = uy * k * ry, z = uz * k * rz;
      if (ground && y < -ry * 0.2) y = -ry * 0.2;
      out.push([cx + x * cs - z * sn, cy + y, cz + x * sn + z * cs, uy]);
    }
    for (let i = 0; i < out.length; i += 3) {
      const f = 1 + (this.rng.next() - 0.5) * facet * 2;
      const cc = [0, 1, 2].map((j) => { const t = (out[i + j][3] + 1) / 2; const c = color.clone().multiplyScalar((lo + (hi - lo) * t) * f); return c; });
      this.tri(out[i], out[i + 1], out[i + 2], cc[0], cc[1], cc[2]);
    }
  }

  /** tapered tube along points. rad(t) -> radius, colFn(t) -> Color */
  tube(pts, rad, radial, colFn, cap = false) {
    const n = pts.length;
    const rings = [];
    for (let i = 0; i < n; i++) {
      const T = (i === 0 ? pts[1].clone().sub(pts[0]) : i === n - 1 ? pts[i].clone().sub(pts[i - 1]) : pts[i + 1].clone().sub(pts[i - 1])).normalize();
      const ref = Math.abs(T.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0);
      const N = new THREE.Vector3().crossVectors(ref, T).normalize();
      const B = new THREE.Vector3().crossVectors(T, N);
      const t = i / (n - 1), r = typeof rad === 'function' ? rad(t) : rad;
      const ring = [];
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        ring.push(V(pts[i].x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, pts[i].y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, pts[i].z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r));
      }
      rings.push({ ring, c: colFn(t, i) });
    }
    for (let i = 0; i < n - 1; i++) {
      const A = rings[i], B2 = rings[i + 1];
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial;
        const shade = 0.88 + 0.24 * Math.abs(Math.sin((j + 0.5) / radial * Math.PI * 2 + 0.7));
        const ca = A.c.clone().multiplyScalar(shade), cb = B2.c.clone().multiplyScalar(shade);
        this.quad(A.ring[j], A.ring[j2], B2.ring[j2], B2.ring[j], ca, ca, cb, cb);
      }
    }
    if (cap) { const e = rings[n - 1]; const c = pts[n - 1]; for (let j = 0; j < radial; j++) this.tri(e.ring[j], e.ring[(j + 1) % radial], c, e.c); }
  }

  /** ribbon (leaf blade) along a curve: pts, side (unit vec), widths(t), fold (centre rise), colFn(t, v) v in -1..1 */
  ribbon(pts, side, wf, fold, colFn) {
    const n = pts.length;
    const rows = pts.map((p, i) => {
      const t = i / (n - 1), w = wf(t);
      return [p.clone().addScaledVector(side, w).add(V(0, -fold * w, 0)), p.clone(), p.clone().addScaledVector(side, -w).add(V(0, -fold * w, 0)), t];
    });
    for (let i = 0; i < n - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      const c = (r, v) => colFn(r[3], v);
      this.quad(a[0], a[1], b[1], b[0], c(a, 1), c(a, 0), c(b, 0), c(b, 1));
      this.quad(a[1], a[2], b[2], b[1], c(a, 0), c(a, -1), c(b, -1), c(b, 0));
    }
  }

  /** grass blade: 3 tris. base (x,y,z), yaw, height, width, bend (horizontal tip offset) */
  blade(x, y, z, yaw, h, w, bend, c0, c1) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw), bx = -dz, bz = dx;
    const m = [x + dx * bend * 0.35, y + h * 0.58, z + dz * bend * 0.35];
    const tip = [x + dx * bend, y + h, z + dz * bend];
    const cm = c0.clone().lerp(c1, 0.55);
    this.quad([x - bx * w, y, z - bz * w], [x + bx * w, y, z + bz * w], [m[0] + bx * w * 0.6, m[1], m[2] + bz * w * 0.6], [m[0] - bx * w * 0.6, m[1], m[2] - bz * w * 0.6], c0, c0, cm, cm);
    this.tri([m[0] - bx * w * 0.6, m[1], m[2] - bz * w * 0.6], [m[0] + bx * w * 0.6, m[1], m[2] + bz * w * 0.6], tip, cm, cm, c1);
  }

  /** pinnate frond (palm / fern): arcs out from base along yaw. */
  frond(bx, by, bz, yaw, len, rise, droop, pairs, leafLen, cA, cB, o = {}) {
    const { spread = 0.55, leafDrop = 0.65, thick = 0.0 } = o;
    const dx = Math.cos(yaw), dz = Math.sin(yaw), sx = -dz, sz = dx;
    const P = (t) => V(bx + dx * len * t, by + rise * Math.sin(t * Math.PI * 0.5) - droop * t * t, bz + dz * len * t);
    const seg = 1 / (pairs + 1);
    for (let k = 1; k <= pairs; k++) {
      const t = k * seg;
      const p = P(t), p2 = P(Math.min(1, t + seg * 0.9));
      const ll = leafLen * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.05 + 0.08) * Math.PI)) * (t > 0.92 ? 0.5 : 1);
      const col = cA.clone().lerp(cB, t);
      const colTip = col.clone().multiplyScalar(1.12);
      for (const sd of [1, -1]) {
        const tip = V(p.x + sx * sd * ll * spread + dx * ll * 0.5, p.y - ll * leafDrop, p.z + sz * sd * ll * spread + dz * ll * 0.5);
        this.tri(p, p2, tip, col, col, colTip);
      }
    }
    // rachis
    const e = P(1), tipLeaf = V(e.x + dx * leafLen * 0.3, e.y - leafLen * 0.15, e.z + dz * leafLen * 0.3);
    const a = P(0.85);
    this.tri(a, e, tipLeaf, cB, cB, cB);
  }

  /** heart-shaped broad leaf. attach point, yaw (outward), pitch (up), size, cuts (monstera slits), droop */
  heartLeaf(ax, ay, az, yaw, pitch, size, c0, c1, o = {}) {
    const { cuts = 0, droop = 0.5, n = 18, width = 0.62 } = o;
    const f = V(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    const s = V(-Math.sin(yaw), 0, Math.cos(yaw));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      let hx = 16 * Math.sin(t) ** 3, hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      let u = (5 - hy) / 22, v = (hx / 17) * width;
      if (cuts && u > 0.2 && u < 0.85 && Math.abs(v) > 0.18 * width && i % 2 === 1) { v *= 0.5; u *= 0.9; }
      pts.push([u, v]);
    }
    const at = (u, v) => V(ax + (f.x * u + s.x * v) * size, ay + (f.y * u * size) - droop * u * u * size * 0.6, az + (f.z * u + s.z * v) * size);
    const o0 = at(0, 0);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ca = c0.clone().lerp(c1, Math.min(1, a[0] * 0.9)), cb = c0.clone().lerp(c1, Math.min(1, b[0] * 0.9));
      this.tri(o0, at(a[0], a[1]), at(b[0], b[1]), c0, ca, cb);
    }
  }

  /** a thin stalk from a to b */
  stalk(a, b, r0, r1, col, col2 = col, radial = 4) {
    this.tube([a, b], (t) => r0 + (r1 - r0) * t, radial, (t) => col.clone().lerp(col2, t));
  }
}

/** displace a non-indexed geometry's vertices coherently (same position → same offset) and paint by normal */
export function lowPolyRock(seed, size, o = {}) {
  const { moss = 0, base = ['#8a8275', '#7a7368', '#958c7c'], detail = 1, flat = 1 } = o;
  const r = new RNG(seed);
  let g = new THREE.DodecahedronGeometry(size, detail);
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position;
  const sx = r.float(0.85, 1.45), sy = r.float(0.5, 0.95) * flat, sz = r.float(0.8, 1.3), sd = r.int(1, 999);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / size, y = p.getY(i) / size, z = p.getZ(i) / size;
    const f = 1 + (hash3(Math.round(x * 40) + sd, Math.round(y * 40), Math.round(z * 40)) - 0.5) * 0.45;
    p.setXYZ(i, x * size * sx * f, Math.max(-0.25 * size, y * size * sy * f), z * size * sz * f);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const b = new THREE.Color(r.pick(base)), mossC = new THREE.Color('#4d7a2c');
  for (let i = 0; i < p.count; i += 3) {
    const ny = n.getY(i);
    const c = b.clone().multiplyScalar(0.82 + r.next() * 0.3);
    if (moss && ny > 0.35) c.lerp(mossC.clone().offsetHSL((r.next() - 0.5) * 0.05, 0, (r.next() - 0.5) * 0.1), Math.min(1, moss * (ny - 0.2) * 1.5));
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export { V };
