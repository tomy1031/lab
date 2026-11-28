// kanto.js — builds the Kanto stage: painted ground, sea, landmarks, scattered blocks, trains, ships, planes.
import * as THREE from 'three';
import { ObjectSet } from './objects.js';
import * as K from '../kanto_map.js';

const UP = new THREE.Vector3(0, 1, 0);

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildKanto(scene, reg, material, opts = {}) {
  const rnd = mulberry(20261105);
  const group = new THREE.Group();
  scene.add(group);
  const B = K.BOUNDS;
  const W = B.x1 - B.x0, H = B.z1 - B.z0;

  // ---------- ground (painted texture, sea cut out) ----------
  const texSize = opts.texSize || 4096;
  const canvas = document.createElement('canvas');
  canvas.width = texSize; canvas.height = Math.round(texSize * (H / W));
  K.drawGround(canvas.getContext('2d'), canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const groundMat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);
  ground.receiveShadow = true;
  group.add(ground);
  // land beyond the map to the west and north so the horizon isn't empty
  const farMat = new THREE.MeshLambertMaterial({ color: 0x8db866 });
  const addFar = (x0, z0, x1, z1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), farMat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, -2, (z0 + z1) / 2);
    group.add(m);
  };
  addFar(B.x0 - 300000, B.z0 - 300000, B.x0, B.z1 - 30000);
  addFar(B.x0, B.z0 - 300000, B.x1 + 300000, B.z0);
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x2f7fbf, shininess: 60, specular: 0x6699bb });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900000, 900000), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, K.SEA_Y, 0);
  group.add(water);

  // Mt Fuji on the western horizon (scenery, can't be picked here — it's waiting on the planet)
  if (opts.fujiGeom) {
    const g = opts.fujiGeom; g.computeBoundingBox();
    const bb = g.boundingBox; const s = 46000 / Math.max(bb.max.x - bb.min.x, 1);
    const fuji = new THREE.Mesh(g, material);
    fuji.scale.setScalar(s);
    const [fx, fz] = K.ll(35.36, 138.73);
    fuji.position.set(fx, -40, fz);
    group.add(fuji);
  }

  // ---------- objects ----------
  const objs = new ObjectSet(scene, material);
  const occGrid = new Map();
  const CELL = 1500;
  const occAdd = (x, z, r) => {
    const o = { x, z, r };
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const k = i + ',' + j; let l = occGrid.get(k); if (!l) occGrid.set(k, (l = [])); l.push(o);
      }
  };
  const occHit = (x, z, r) => {
    const l = occGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    if (!l) return false;
    for (const o of l) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return true;
    return false;
  };
  const place = (p, x, y, z, yaw, scale = 1, extra = {}) => {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    return objs.add(p, new THREE.Vector3(x, y, z), q, scale, extra);
  };
  const landAround = (x, z, r) => K.isLand(x, z) && K.isLand(x + r, z) && K.isLand(x - r, z) && K.isLand(x, z + r) && K.isLand(x, z - r);

  // landmarks
  for (const L of K.LANDMARKS) {
    const p = reg.get(L.id);
    if (!p) continue;
    const y = K.isSea(L.x, L.z) ? K.SEA_Y + 6 : 0;
    place(p, L.x, y, L.z, L.rot, 1, { landmark: true });
    occAdd(L.x, L.z, Math.max(p.w, p.d) * 0.55);
  }

  // scattered blocks: denser near Yokohama, bigger the farther you go
  const S = K.START;
  const sizeAt = (d) => Math.min(14, 1 + Math.pow(d / 11000, 1.4));
  const kantoProtos = reg.all.filter((p) => p.tag === 'kanto' && p.where.length && !p.move);
  const byId = new Map();
  for (const p of kantoProtos) { let e = byId.get(p.id); if (!e) byId.set(p.id, (e = { weight: p.weight, where: p.where, list: [] })); e.list.push(p); }
  const entries = [...byId.values()];
  const N = Math.round((opts.count || 7500) * (opts.density || 1));
  let placed = 0;
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, d = 112000 * Math.pow(rnd(), 1.85) + 900;
    const x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
    if (!K.isLand(x, z)) continue;
    const reg0 = K.regionAt(x, z);
    const cands = entries.filter((e) => e.where.some((w) => reg0.tags.includes(w)));
    if (!cands.length) continue;
    const tw = cands.reduce((s, e) => s + e.weight, 0);
    let r = rnd() * tw, e = cands[0];
    for (const c of cands) { r -= c.weight; if (r <= 0) { e = c; break; } }
    const p = e.list[(rnd() * e.list.length) | 0];
    const m = sizeAt(d) * (0.85 + rnd() * 0.3);
    const fr = Math.max(p.w, p.d) * 0.5 * m;
    if (!landAround(x, z, fr * 0.8) || occHit(x, z, fr * 0.85)) continue;
    if (Math.hypot(x - S.x, z - S.z) < 700) continue;
    const o = place(p, x, 0, z, Math.round(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.3, m);
    if (o) o.dw = 1 / (opts.density || 1); // fewer blocks on slower devices, each counting for more
    occAdd(x, z, fr * 0.85);
    placed++;
  }

  // trains on the rails
  const railLens = K.RAILS.map((r) => { let L = 0; for (let i = 0; i < r.pts.length - 1; i++) L += Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]); return L; });
  K.RAILS.forEach((rail, ri) => {
    const list = reg.variants(rail.kind === 'shinkansen' ? 'shinkansen' : 'train');
    if (!list.length) return;
    const n = Math.max(2, Math.round(railLens[ri] / (rail.kind === 'shinkansen' ? 14000 : 7000)));
    for (let i = 0; i < n; i++) {
      const p = list[(rnd() * list.length) | 0];
      const o = place(p, rail.pts[0][0], 0, rail.pts[0][1], 0);
      objs.addMover(o, { type: 'rail', ri, s: rnd() * railLens[ri], dir: rnd() < 0.5 ? 1 : -1, len: railLens[ri], speed: rail.kind === 'shinkansen' ? 75 : 30 });
    }
  });

  // ships in the bays
  const sailors = reg.all.filter((p) => p.tag === 'kanto' && p.move === 'sail');
  for (let i = 0; i < 190 && sailors.length; i++) {
    const p = sailors[(rnd() * sailors.length) | 0];
    for (let t = 0; t < 30; t++) {
      const a = rnd() * Math.PI * 2, d = 4000 + 80000 * Math.pow(rnd(), 1.4);
      const x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
      const m = Math.min(4, sizeAt(d) * 0.7 + 0.3);
      const rr = p.maxDim * m * 0.6 + 200;
      if (!K.isSea(x, z) || !K.isSea(x + rr, z) || !K.isSea(x - rr, z) || !K.isSea(x, z + rr) || !K.isSea(x, z - rr)) continue;
      const baseY = K.SEA_Y - p.h * m * 0.1;
      const o = place(p, x, baseY, z, rnd() * 6.28, m);
      objs.addMover(o, { type: 'sail', yaw: rnd() * 6.28, speed: (p.speed || 8) * 1.5, turn: 0, t: rnd() * 10, baseY });
      break;
    }
  }

  // planes circling the airports and the bay
  const planes = reg.variants('airplane');
  if (planes.length) {
    const hubs = [[35.5494, 139.7798], [35.772, 140.3929], [35.45, 139.85], [35.7, 139.6]].map(([a, b]) => K.ll(a, b));
    for (let i = 0; i < 44; i++) {
      const [cx, cz] = hubs[i % hubs.length];
      const p = planes[i % planes.length];
      const o = place(p, cx, 800, cz, 0);
      objs.addMover(o, { type: 'fly', cx: cx + (rnd() - 0.5) * 8000, cz: cz + (rnd() - 0.5) * 8000, cy: 250 + rnd() * 1500, R: 2500 + rnd() * 9000, ang: rnd() * 6.28, w: (0.02 + rnd() * 0.03) * (rnd() < 0.5 ? -1 : 1), bank: 0.25 });
    }
  }

  objs.finalize({ castShadow: true, receiveShadow: false });
  if (opts.log) console.log('kanto objects', objs.objs.length, 'scattered', placed, 'movers', objs.movers.length);

  // ---------- movers ----------
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function railPoint(ri, s) {
    const pts = K.RAILS[ri].pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (s <= L || i === pts.length - 2) {
        const t = Math.min(Math.max(s / L, 0), 1);
        return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / L, dz: (bz - az) / L };
      }
      s -= L;
    }
  }
  function updateMovers(dt) {
    for (const o of objs.movers) {
      if (o.picked) continue;
      const m = o.mover;
      if (m.type === 'rail') {
        m.s += m.dir * m.speed * dt;
        if (m.s > m.len) { m.s = m.len; m.dir = -1; }
        if (m.s < 0) { m.s = 0; m.dir = 1; }
        const rp = railPoint(m.ri, m.s);
        _p.set(rp.x, 0, rp.z);
        _q.setFromAxisAngle(UP, Math.atan2(rp.dx * m.dir, rp.dz * m.dir));
        objs.setTransform(o, _p, _q);
      } else if (m.type === 'sail') {
        m.t += dt;
        m.turn += (rnd() - 0.5) * dt * 0.3; m.turn *= 0.99; m.yaw += m.turn * dt;
        const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
        const look = o.size * 0.8 + 600;
        if (!K.isSea(o.pos.x + fx * look, o.pos.z + fz * look)) m.yaw += dt * 0.8;
        else { o.pos.x += fx * m.speed * dt; o.pos.z += fz * m.speed * dt; }
        _p.set(o.pos.x, m.baseY + Math.sin(m.t) * 0.6, o.pos.z);
        _q.setFromAxisAngle(UP, m.yaw);
        objs.setTransform(o, _p, _q);
      } else if (m.type === 'fly') {
        m.ang += m.w * dt;
        _p.set(m.cx + Math.cos(m.ang) * m.R, m.cy, m.cz + Math.sin(m.ang) * m.R);
        const sg = Math.sign(m.w);
        _e.set(0, Math.atan2(-Math.sin(m.ang) * sg, Math.cos(m.ang) * sg), -m.bank * sg, 'YXZ');
        _q.setFromEuler(_e);
        objs.setTransform(o, _p, _q);
      }
    }
  }

  const groundY = (x, z) => (K.isSea(x, z) ? K.SEABED_Y : 0);
  return { group, objs, ground, water, waterMat, groundMat, canvas, updateMovers, groundY };
}
