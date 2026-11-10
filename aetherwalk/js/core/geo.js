// js/core/geo.js — build low-poly, vertex-coloured, flat-shaded models out of primitives and merge them
// into ONE BufferGeometry (one draw call per model). Used by hands (player) and item models (items).
// Each part can carry a numeric tag (per-vertex) so a few parts can be animated on the CPU (finger curl).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color();

export class GeoBuilder {
  constructor() { this.parts = []; this.tag = 0; }
  /** add a geometry with colour and transform: pos [x,y,z], rot [x,y,z] (radians, XYZ), scale [x,y,z] or number */
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
    _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    _q.setFromEuler(_e);
    if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
    _p.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    _m.compose(_p, _q, _s);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(_m);
    this.parts.push({ g, color: new THREE.Color(color), tag: this.tag });
    return this;
  }
  box(w, h, d, color, pos, rot, scale) { return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot, scale); }
  /** cylinder along Y by default */
  cyl(rTop, rBot, h, seg, color, pos, rot, scale) { return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), color, pos, rot, scale); }
  cone(r, h, seg, color, pos, rot, scale) { return this.add(new THREE.ConeGeometry(r, h, seg, 1), color, pos, rot, scale); }
  ico(r, detail, color, pos, rot, scale) { return this.add(new THREE.IcosahedronGeometry(r, detail), color, pos, rot, scale); }
  oct(r, color, pos, rot, scale) { return this.add(new THREE.OctahedronGeometry(r, 0), color, pos, rot, scale); }
  dodeca(r, color, pos, rot, scale) { return this.add(new THREE.DodecahedronGeometry(r, 0), color, pos, rot, scale); }
  sphere(r, ws, hs, color, pos, rot, scale) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, pos, rot, scale); }
  torus(r, tube, rs, ts, arc, color, pos, rot, scale) { return this.add(new THREE.TorusGeometry(r, tube, rs, ts, arc), color, pos, rot, scale); }
  /** a raw triangle list [x,y,z, …] */
  tris(arr, color, pos, rot, scale) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return this.add(g, color, pos, rot, scale);
  }
  /** merge → non-indexed BufferGeometry with position, normal (flat), color and an optional per-vertex tag */
  build({ tags = false } = {}) {
    let n = 0;
    for (const p of this.parts) n += p.g.attributes.position.count;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tag = tags ? new Uint8Array(n) : null;
    let o = 0;
    for (const p of this.parts) {
      const a = p.g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        pos[(o + i) * 3] = a.getX(i); pos[(o + i) * 3 + 1] = a.getY(i); pos[(o + i) * 3 + 2] = a.getZ(i);
        _c.copy(p.color);
        col[(o + i) * 3] = _c.r; col[(o + i) * 3 + 1] = _c.g; col[(o + i) * 3 + 2] = _c.b;
        if (tag) tag[o + i] = p.tag;
      }
      o += a.count;
      p.g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (tag) geo.userData.tags = tag;
    flatNormals(geo);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    this.parts = [];
    return geo;
  }
}

/** per-face normals for a non-indexed geometry (in place, no allocation) */
export function flatNormals(geo, from = 0, to = -1) {
  const p = geo.attributes.position.array;
  let nAttr = geo.attributes.normal;
  if (!nAttr) { nAttr = new THREE.BufferAttribute(new Float32Array(p.length), 3); geo.setAttribute('normal', nAttr); }
  const nr = nAttr.array;
  const end = to < 0 ? p.length / 9 : to;
  for (let t = from; t < end; t++) {
    const i = t * 9;
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    for (let k = 0; k < 3; k++) { nr[i + k * 3] = nx; nr[i + k * 3 + 1] = ny; nr[i + k * 3 + 2] = nz; }
  }
  nAttr.needsUpdate = true;
}

/** triangle count of a geometry */
export const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
