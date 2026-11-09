// objects.js — proto registry + an ObjectSet that draws placed things with InstancedMesh,
// culls them by distance every frame, and answers "what is the ball touching?".
import * as THREE from 'three';

const FILL = 0.45; // bbox volume → "solid" volume

// Level of detail: an object farther than LOD.k × its size is drawn with a simplified model
// (0 = never). Set from the quality preset before the stages are built.
export const LOD = { k: 0 };

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// Simplified model by vertex clustering: snap every vertex to a coarse grid (`across` cells along the
// longest side), merge what falls in one cell and drop triangles that collapse. Colour and glow are
// averaged per cell, weighted by triangle area, so a far building full of lit windows still glows.
// Do two models cover (nearly) the same area seen from the front, the side and above?
// Each is drawn as a coarse silhouette on a res × res grid per axis; overlap / union must be ≥ minIoU.
function silhouette(geom, ax, ay, mn, mx, res) {
  const pos = geom.attributes.position, idx = geom.index ? geom.index.array : null;
  const nTri = (idx ? idx.length : pos.count) / 3;
  const ox = mn.getComponent(ax), oy = mn.getComponent(ay);
  const kx = res / Math.max(mx.getComponent(ax) - ox, 1e-6), ky = res / Math.max(mx.getComponent(ay) - oy, 1e-6);
  const mask = new Uint8Array(res * res), P = [0, 0, 0, 0, 0, 0];
  for (let t = 0; t < nTri; t++) {
    for (let j = 0; j < 3; j++) {
      const v = idx ? idx[t * 3 + j] : t * 3 + j;
      P[j * 2] = (pos.getComponent(v, ax) - ox) * kx; P[j * 2 + 1] = (pos.getComponent(v, ay) - oy) * ky;
    }
    const [x0, y0, x1, y1, x2, y2] = P;
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor(Math.min(x0, x1, x2))), i1 = Math.min(res - 1, Math.floor(Math.max(x0, x1, x2)));
    const j0 = Math.max(0, Math.floor(Math.min(y0, y1, y2))), j1 = Math.min(res - 1, Math.floor(Math.max(y0, y1, y2)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i + 0.5, py = j + 0.5;
      const a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den;
      const b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den;
      if (a >= -0.02 && b >= -0.02 && a + b <= 1.02) mask[j * res + i] = 1;
    }
  }
  return mask;
}
function sameOutline(a, b, mn, mx, res = 32, minIoU = 0.8) {
  for (const [ax, ay] of [[0, 1], [2, 1], [0, 2]]) {
    const A = silhouette(a, ax, ay, mn, mx, res), B = silhouette(b, ax, ay, mn, mx, res);
    let both = 0, any = 0;
    for (let i = 0; i < A.length; i++) { both += A[i] & B[i]; any += A[i] | B[i]; }
    if (any && both / any < minIoU) return false;
  }
  return true;
}

export function simplifyGeometry(geom, across = 7) {
  const pos = geom.attributes.position, col = geom.attributes.color, glow = geom.attributes.glow;
  if (!pos) return null;
  const idx = geom.index ? geom.index.array : null;
  const nTri = (idx ? idx.length : pos.count) / 3;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
  const cs = Math.max(sx, sy, sz, 1e-6) / across;
  const ny = Math.floor(sy / cs) + 1, nz = Math.floor(sz / cs) + 1;
  const cellOf = new Int32Array(pos.count);
  const cellIx = new Map();
  const acc = []; // per cell: x, y, z, n, r, g, b, glow, weight
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const key = (Math.floor((x - bb.min.x) / cs) * ny + Math.floor((y - bb.min.y) / cs)) * nz + Math.floor((z - bb.min.z) / cs);
    let c = cellIx.get(key);
    if (c === undefined) { c = acc.length / 9; cellIx.set(key, c); acc.push(0, 0, 0, 0, 0, 0, 0, 0, 0); }
    cellOf[v] = c;
    acc[c * 9] += x; acc[c * 9 + 1] += y; acc[c * 9 + 2] += z; acc[c * 9 + 3]++;
  }
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < nTri; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    A.fromBufferAttribute(pos, a); B.fromBufferAttribute(pos, b); C.fromBufferAttribute(pos, c);
    const area = B.sub(A).cross(C.sub(A)).length() * 0.5 + 1e-12;
    for (const v of [a, b, c]) {
      const k = cellOf[v] * 9;
      if (col) { acc[k + 4] += col.getX(v) * area; acc[k + 5] += col.getY(v) * area; acc[k + 6] += col.getZ(v) * area; }
      if (glow) acc[k + 7] += glow.getX(v) * area;
      acc[k + 8] += area;
    }
  }
  const out = [], seen = new Set();
  for (let t = 0; t < nTri; t++) {
    const c0 = cellOf[idx ? idx[t * 3] : t * 3], c1 = cellOf[idx ? idx[t * 3 + 1] : t * 3 + 1], c2 = cellOf[idx ? idx[t * 3 + 2] : t * 3 + 2];
    if (c0 === c1 || c1 === c2 || c0 === c2) continue;
    // same three cells with the same winding = the same triangle
    const key = c0 < c1 && c0 < c2 ? `${c0},${c1},${c2}` : c1 < c2 ? `${c1},${c2},${c0}` : `${c2},${c0},${c1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c0, c1, c2);
  }
  if (!out.length) return null;
  const n = out.length;
  const P = new Float32Array(n * 3), Col = col ? new Float32Array(n * 3) : null, G = glow ? new Float32Array(n) : null;
  for (let i = 0; i < n; i++) {
    const k = out[i] * 9, cnt = acc[k + 3], w = acc[k + 8];
    P[i * 3] = acc[k] / cnt; P[i * 3 + 1] = acc[k + 1] / cnt; P[i * 3 + 2] = acc[k + 2] / cnt;
    if (Col) { Col[i * 3] = acc[k + 4] / w; Col[i * 3 + 1] = acc[k + 5] / w; Col[i * 3 + 2] = acc[k + 6] / w; }
    if (G) G[i] = acc[k + 7] / w;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (Col) g.setAttribute('color', new THREE.BufferAttribute(Col, 3));
  g.computeVertexNormals(); // flat, one normal per face (the geometry is not indexed)
  if (G && Col) {
    // Lit windows are small faces that vanish in the merge, and the big walls left keep little of their
    // glow. Give the walls (side faces) an even glow that sends out as much light as the full model did.
    const lum = (r, gg, b) => 0.3 * r + 0.59 * gg + 0.11 * b;
    let E = 0, S = 0;
    for (let t = 0; t < nTri; t++) {
      const v = [0, 1, 2].map((j) => (idx ? idx[t * 3 + j] : t * 3 + j));
      A.fromBufferAttribute(pos, v[0]); B.fromBufferAttribute(pos, v[1]); C.fromBufferAttribute(pos, v[2]);
      const area = B.sub(A).cross(C.sub(A)).length() * 0.5;
      let l = 0, gl = 0;
      for (const k of v) { l += lum(col.getX(k), col.getY(k), col.getZ(k)) / 3; gl += glow.getX(k) / 3; }
      E += area * l * gl;
    }
    const nrm = g.attributes.normal, side = new Uint8Array(n / 3);
    for (let t = 0; t < n / 3; t++) {
      if (Math.abs(nrm.getY(t * 3)) > 0.5) continue;
      A.fromArray(P, t * 9); B.fromArray(P, t * 9 + 3); C.fromArray(P, t * 9 + 6);
      const area = B.sub(A).cross(C.sub(A)).length() * 0.5;
      let l = 0;
      for (let j = 0; j < 3; j++) l += lum(Col[t * 9 + j * 3], Col[t * 9 + j * 3 + 1], Col[t * 9 + j * 3 + 2]) / 3;
      S += area * l; side[t] = 1;
    }
    if (E > 0 && S > 0) {
      const even = Math.min(E / S, 3);
      for (let t = 0; t < n / 3; t++) for (let j = 0; j < 3; j++) G[t * 3 + j] = side[t] ? even : 0;
    }
  }
  if (G) g.setAttribute('glow', new THREE.BufferAttribute(G, 1));
  return g;
}

export class ProtoRegistry {
  constructor() { this.byId = new Map(); this.all = []; }

  add(mod, tag = '') {
    if (!mod) return;
    for (const [id, def] of Object.entries(mod)) {
      if (!def || typeof def.build !== 'function') continue;
      const variants = def.variants && def.variants.length ? def.variants : [undefined];
      const list = [];
      variants.forEach((v, vi) => {
        let geom;
        try { geom = def.build(v); } catch (e) { console.warn('proto build failed', id, e); return; }
        if (!geom || !geom.attributes || !geom.attributes.position) return;
        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        const bb = geom.boundingBox;
        const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, d = bb.max.z - bb.min.z;
        const p = {
          id, key: `${id}#${vi}`, vi, tag, def, geom,
          name: def.name || id, kind: def.kind || 'thing',
          where: def.where || [], weight: def.weight ?? 1, move: def.move, speed: def.speed || 1,
          bbMin: bb.min.clone(), bbMax: bb.max.clone(),
          w, h, d, maxDim: Math.max(w, h, d), vol: Math.max(w * h * d * FILL, 1e-9),
          center: bb.getCenter(new THREE.Vector3()),
        };
        list.push(p);
        this.all.push(p);
      });
      if (list.length) this.byId.set(id, list);
    }
  }

  get(id, vi = 0) {
    const l = this.byId.get(id);
    if (!l) return null;
    return l[vi % l.length];
  }
  variants(id) { return this.byId.get(id) || []; }
  has(id) { return this.byId.has(id); }
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();

// show the first n instances; upload the matrices only when they changed
function publish(mesh, n, changed) {
  mesh.visible = n > 0;
  if (n !== mesh.count) changed = true;
  if (!changed) return;
  mesh.count = n;
  const im = mesh.instanceMatrix;
  im.clearUpdateRanges();
  im.addUpdateRange(0, n * 16);
  im.needsUpdate = true;
}

export class ObjectSet {
  constructor(scene, material) {
    this.scene = scene;
    this.material = material;
    this.objs = [];
    this.movers = [];
    this.byProto = new Map(); // key → { proto, objs[], mesh }
    this.frame = 0;
    this.time = 0; // advanced by the game every step; movers get a velocity from it
    // optional uniform grid on x/z (flat stages with many objects): contacts() then only looks nearby
    this.grid = null; this.cell = 0; this.big = null;
    this.hidden = false;
  }

  add(proto, pos, quat, scale = 1, extra = {}) {
    const o = {
      proto, pos: pos.clone(), quat: quat.clone(), invQuat: quat.clone().invert(), scale,
      up: extra.up ? extra.up.clone() : new THREE.Vector3(0, 1, 0),
      size: (extra.pickSize ?? proto.maxDim) * scale,
      vol: proto.vol * scale * scale * scale,
      boundR: 0, picked: false, mover: null, visible: false, landmark: !!extra.landmark,
      name: extra.name || proto.name, colliders: extra.colliders || null,
    };
    // bounding radius around the bbox centre
    o.boundR = Math.hypot(proto.w, proto.h, proto.d) * 0.5 * scale;
    o.center = new THREE.Vector3();
    this.updateCenter(o);
    this.objs.push(o);
    let g = this.byProto.get(proto.key);
    if (!g) {
      g = { proto, objs: [], mesh: null, mats: null, order: null, dirty: true, slot: this.byProto.size };
      this.byProto.set(proto.key, g);
    }
    o.g = g; o.gi = g.objs.length; o.matDirty = true;
    g.objs.push(o);
    return o;
  }

  updateCenter(o) {
    o.center.copy(o.proto.center).multiplyScalar(o.scale).applyQuaternion(o.quat).add(o.pos);
  }

  // Build the grid once all objects are placed. Objects wider than half a cell go to a short list
  // that is always checked; everything else lives in the cell of its centre (movers change cell).
  useGrid(cell) {
    this.cell = cell;
    this.grid = new Map();
    this.big = [];
    for (const o of this.objs) this._gridAdd(o);
  }
  _key(x, z) { return Math.floor(x / this.cell) * 1048576 + Math.floor(z / this.cell); }
  _gridAdd(o) {
    if (o.boundR > this.cell * 0.5) { o.gkey = null; this.big.push(o); return; }
    o.gkey = this._key(o.center.x, o.center.z);
    let l = this.grid.get(o.gkey);
    if (!l) this.grid.set(o.gkey, (l = []));
    l.push(o);
  }
  _gridMove(o) {
    if (o.gkey === null || o.gkey === undefined) return;
    const k = this._key(o.center.x, o.center.z);
    if (k === o.gkey) return;
    const l = this.grid.get(o.gkey);
    const i = l.indexOf(o);
    if (i >= 0) { l[i] = l[l.length - 1]; l.pop(); }
    o.gkey = undefined;
    this._gridAdd(o);
  }

  setTransform(o, pos, quat) {
    // velocity of moving things (cars, boats, trains…), so a collision knows who hit whom
    if (o.tPrev !== undefined && this.time > o.tPrev) {
      const k = 1 / (this.time - o.tPrev);
      if (!o.vel) o.vel = new THREE.Vector3();
      o.vel.set((pos.x - o.pPrev.x) * k, (pos.y - o.pPrev.y) * k, (pos.z - o.pPrev.z) * k);
    }
    if (!o.pPrev) o.pPrev = new THREE.Vector3();
    o.pPrev.copy(pos); o.tPrev = this.time;
    o.pos.copy(pos);
    if (quat) { o.quat.copy(quat); o.invQuat.copy(quat).invert(); }
    this.updateCenter(o);
    if (this.grid) this._gridMove(o);
    this.touch(o);
  }

  // something about this object changed (moved, picked up, dropped): redraw its group next frame
  touch(o) { o.matDirty = true; if (o.g) o.g.dirty = true; }

  addMover(o, mover) { o.mover = mover; this.movers.push(o); }

  // a still object that was moved by hand (e.g. dropped off the ball): no velocity
  teleport(o, pos, quat) {
    this.setTransform(o, pos, quat);
    if (o.vel) o.vel.set(0, 0, 0);
    o.tPrev = undefined;
  }

  // height of the object's top above its base, along its up axis (world units)
  topHeight(o) { return o.proto.bbMax.y * o.scale; }

  // Build InstancedMeshes once all objects are placed.
  finalize({ castShadow = true, receiveShadow = true } = {}) {
    const inst = (geom, n) => {
      const mesh = new THREE.InstancedMesh(geom, this.material, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.count = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    };
    for (const g of this.byProto.values()) {
      const n = g.objs.length, p = g.proto;
      g.mesh = inst(p.geom, n);
      g.mats = new Float32Array(n * 16); // each object's matrix, composed once until it moves
      g.order = new Int32Array(n).fill(-1); // which object sits in each instance slot
      g.dirty = true;
      // detailed models get a simplified stand-in for when they are far away
      if (LOD.k > 0 && p.maxDim > 2 && triCount(p.geom) > 200) {
        if (p.lodGeom === undefined) {
          // worth it only if much lighter and the outline survives (thin cranes, wheels, lattices don't);
          // a coarse grid first, then a finer one
          p.lodGeom = null;
          for (const across of [7, 11]) {
            const lg = simplifyGeometry(p.geom, across);
            if (lg && triCount(lg) < triCount(p.geom) * 0.6 && sameOutline(p.geom, lg, p.bbMin, p.bbMax)) { p.lodGeom = lg; break; }
          }
        }
        if (p.lodGeom) { g.lod = inst(p.lodGeom, n); g.lodOrder = new Int32Array(n).fill(-1); }
      }
    }
  }

  dispose() {
    for (const g of this.byProto.values()) {
      if (g.mesh) { this.scene.remove(g.mesh); g.mesh.dispose(); }
      if (g.lod) { this.scene.remove(g.lod); g.lod.dispose(); }
    }
    this.byProto.clear();
    this.objs = []; this.movers = [];
  }

  // Rebuild per-proto instance lists with what is near enough to be worth drawing.
  // Groups where something moved or was picked are rebuilt every frame; the others (still things)
  // are re-culled in turn, a quarter of them per frame, and only sent to the GPU when what they show
  // changed. Matrices are composed once per move, not once per frame.
  // far: where the fog hides everything (0 = no fog); nothing past it is drawn.
  // cone (optional): { dir, angle, keep, keepR } — things outside the view cone (camera direction dir,
  // half-angle angle, already widened for turning) are skipped unless within keepR of keep (near the
  // ball, where their shadows can fall into view). A group is re-culled early when the camera has
  // turned more than ~10° since its last pass.
  // planetR (globe stage): things below the horizon, on the far side of a planet of that radius
  // centred at the origin, are skipped too.
  updateVisibility(camPos, ballR, viewScale = 1, far = 0, cone = null, planetR = 0) {
    if (this.hidden) { // e.g. the planet being swallowed at the end
      for (const g of this.byProto.values()) if (g.mesh) { g.mesh.visible = false; if (g.lod) g.lod.visible = false; g.dirty = true; }
      return;
    }
    const turn = this.frame++ & 3;
    const lodK2 = LOD.k * LOD.k;
    const dust = ballR * 0.012, dust2 = ballR * ballR * 36;
    const useCone = !!cone && cone.angle < 1.45;
    let fx = 0, fy = 0, fz = 0, cosA = -1, kx = 0, ky = 0, kz = 0, keep2 = 0;
    if (useCone) {
      fx = cone.dir.x; fy = cone.dir.y; fz = cone.dir.z; cosA = Math.cos(cone.angle);
      kx = cone.keep.x; ky = cone.keep.y; kz = cone.keep.z; keep2 = cone.keepR * cone.keepR;
    }
    const P2 = planetR * planetR;
    const camHor = planetR ? Math.sqrt(Math.max(camPos.lengthSq() - P2, 0)) : 0; // camera → horizon
    for (const g of this.byProto.values()) {
      const mesh = g.mesh;
      if (!mesh) continue;
      const turned = (g.coned || useCone) && (!useCone || !g.coned || fx * g.fx + fy * g.fy + fz * g.fz < 0.985);
      if (!g.dirty && !turned && (g.slot & 3) !== turn) continue;
      g.dirty = false; g.coned = useCone; g.fx = fx; g.fy = fy; g.fz = fz;
      const arr = mesh.instanceMatrix.array, mats = g.mats, order = g.order, objs = g.objs;
      const lod = g.lod, lodArr = lod ? lod.instanceMatrix.array : null, lodOrder = g.lodOrder;
      let n = 0, changed = false, nL = 0, changedL = false;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        if (o.picked) continue;
        let vd = Math.min(Math.max(o.size * 160, 50), 2e6) * viewScale;
        if (far && vd > far + o.boundR) vd = far + o.boundR;
        const dx = o.center.x - camPos.x, dy = o.center.y - camPos.y, dz = o.center.z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > vd * vd) continue;
        if (o.size < dust && d2 > dust2) continue; // dust next to a giant ball
        if (planetR) {
          // hidden if farther than (camera → horizon) + (horizon → the object's top)
          const top = o.center.length() + o.boundR;
          if (Math.sqrt(d2) - o.boundR > camHor + Math.sqrt(Math.max(top * top - P2, 0))) continue;
        }
        if (useCone) {
          const br = o.boundR;
          if (d2 > br * br && dx * fx + dy * fy + dz * fz < Math.sqrt(d2) * cosA - br * 1.6) {
            const ex = o.center.x - kx, ey = o.center.y - ky, ez = o.center.z - kz;
            if (ex * ex + ey * ey + ez * ez > keep2) continue; // behind or beside the camera
          }
        }
        const b = i * 16;
        let fresh = false;
        if (o.matDirty) {
          _s.setScalar(o.scale);
          _m.compose(o.pos, o.quat, _s);
          _m.toArray(mats, b);
          o.matDirty = false;
          fresh = true;
        }
        // once a slot changes, every later slot of that list is rewritten, so the list stays exact
        if (lod && d2 > lodK2 * o.size * o.size) {
          if (fresh || lodOrder[nL] !== i) changedL = true;
          if (changedL) {
            const a = nL * 16;
            for (let k = 0; k < 16; k++) lodArr[a + k] = mats[b + k];
            lodOrder[nL] = i;
          }
          nL++;
        } else {
          if (fresh || order[n] !== i) changed = true;
          if (changed) {
            const a = n * 16;
            for (let k = 0; k < 16; k++) arr[a + k] = mats[b + k];
            order[n] = i;
          }
          n++;
        }
      }
      publish(mesh, n, changed);
      if (lod) publish(lod, nL, changedL);
    }
  }

  // Contacts between a sphere (centre c, radius r) and objects.
  // Calls cb(o, dist, normal) for each touching object. normal points from object to ball.
  contacts(c, r, cb) {
    if (this.grid) {
      // cells that can hold an object touching the sphere (centre within r + half a cell of c)
      const reach = r + this.cell * 0.5;
      const i0 = Math.floor((c.x - reach) / this.cell), i1 = Math.floor((c.x + reach) / this.cell);
      const j0 = Math.floor((c.z - reach) / this.cell), j1 = Math.floor((c.z + reach) / this.cell);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) < this.grid.size) {
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const l = this.grid.get(i * 1048576 + j);
          if (l) this._contactList(l, c, r, cb);
        }
        this._contactList(this.big, c, r, cb);
        return;
      }
    }
    this._contactList(this.objs, c, r, cb);
  }

  _contactList(list, c, r, cb) {
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (o.picked) continue;
      const lim = r + o.boundR;
      const dx = c.x - o.center.x; if (dx > lim || dx < -lim) continue;
      const dz = c.z - o.center.z; if (dz > lim || dz < -lim) continue;
      const dy = c.y - o.center.y; if (dy > lim || dy < -lim) continue;
      if (dx * dx + dy * dy + dz * dz > lim * lim) continue;
      if (o.colliders) {
        let best = null;
        for (const b of o.colliders) {
          const res = this.boxDist(o, c, b.min, b.max);
          if (res.dist < r && (!best || res.dist < best.dist)) best = res;
        }
        if (best) cb(o, best.dist, best.normal);
        continue;
      }
      const res = this.boxDist(o, c, o.proto.bbMin, o.proto.bbMax);
      if (res.dist < r) cb(o, res.dist, res.normal);
    }
  }

  boxDist(o, c, mn, mx) {
    // ball centre into object local (unscaled) space
    _v.copy(c).sub(o.pos).applyQuaternion(o.invQuat).multiplyScalar(1 / o.scale);
    _v2.set(
      Math.min(Math.max(_v.x, mn.x), mx.x),
      Math.min(Math.max(_v.y, mn.y), mx.y),
      Math.min(Math.max(_v.z, mn.z), mx.z)
    );
    const diff = _v.clone().sub(_v2);
    let dist = diff.length() * o.scale;
    let normal;
    if (dist < 1e-6) {
      // centre inside the box: push out horizontally from the box centre
      normal = _v.clone().sub(o.proto.center);
      normal.y = 0;
      if (normal.lengthSq() < 1e-9) normal.set(1, 0, 0);
      normal.normalize().applyQuaternion(o.quat);
      dist = 0;
    } else {
      normal = diff.normalize().applyQuaternion(o.quat);
    }
    return { dist, normal };
  }
}

export function yawQuat(yaw) {
  return _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).clone();
}
