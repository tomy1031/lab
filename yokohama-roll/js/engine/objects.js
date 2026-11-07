// objects.js — proto registry + an ObjectSet that draws placed things with InstancedMesh,
// culls them by distance every frame, and answers "what is the ball touching?".
import * as THREE from 'three';

const FILL = 0.45; // bbox volume → "solid" volume

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

export class ObjectSet {
  constructor(scene, material) {
    this.scene = scene;
    this.material = material;
    this.objs = [];
    this.movers = [];
    this.byProto = new Map(); // key → { proto, objs[], mesh }
    this.frame = 0;
    this.time = 0; // advanced by the game every step; movers get a velocity from it
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
    if (!g) { g = { proto, objs: [], mesh: null }; this.byProto.set(proto.key, g); }
    g.objs.push(o);
    return o;
  }

  updateCenter(o) {
    o.center.copy(o.proto.center).multiplyScalar(o.scale).applyQuaternion(o.quat).add(o.pos);
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
  }

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
    for (const g of this.byProto.values()) {
      const mesh = new THREE.InstancedMesh(g.proto.geom, this.material, g.objs.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.count = 0;
      g.mesh = mesh;
      this.scene.add(mesh);
    }
  }

  dispose() {
    for (const g of this.byProto.values()) if (g.mesh) { this.scene.remove(g.mesh); g.mesh.dispose(); }
    this.byProto.clear();
    this.objs = []; this.movers = [];
  }

  // Rebuild per-proto instance lists with what is near enough to be worth drawing.
  updateVisibility(camPos, ballR, viewScale = 1) {
    for (const g of this.byProto.values()) {
      const mesh = g.mesh;
      if (!mesh) continue;
      const arr = mesh.instanceMatrix.array;
      let n = 0;
      for (const o of g.objs) {
        if (o.picked) continue;
        const vd = Math.min(Math.max(o.size * 160, 50), 2e6) * viewScale;
        const dx = o.center.x - camPos.x, dy = o.center.y - camPos.y, dz = o.center.z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > vd * vd) continue;
        if (o.size < ballR * 0.012 && d2 > ballR * ballR * 36) continue; // dust next to a giant ball
        _s.setScalar(o.scale);
        _m.compose(o.pos, o.quat, _s);
        _m.toArray(arr, n * 16);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Contacts between a sphere (centre c, radius r) and objects.
  // Calls cb(o, dist, normal) for each touching object. normal points from object to ball.
  contacts(c, r, cb) {
    for (const o of this.objs) {
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
