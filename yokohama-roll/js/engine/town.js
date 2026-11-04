// town.js — builds the Yokohama stage (ground, water, roads, all placed objects, movers).
import * as THREE from 'three';
import { merge } from '../geo.js';
import { ObjectSet } from './objects.js';
import * as M from '../map.js';

const UP = new THREE.Vector3(0, 1, 0);

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colorize(g, color, glow = 0, wallColor = null) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color), w = new THREE.Color(wallColor ?? color);
  const nor = g.attributes.normal.array;
  for (let i = 0; i < n; i++) {
    const cc = nor[i * 3 + 1] > 0.5 ? c : w;
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  return g;
}

// flat polygon on the ground at height y. poly in [x,z]
function flatPoly(poly, y, color, glow = 0) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return colorize(g, color, glow);
}

function quadStrip(ax, az, bx, bz, width, y, color, glow = 0) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  const nx = -dz / L * width / 2, nz = dx / L * width / 2;
  return flatPoly([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], y, color, glow);
}

export function buildTown(scene, reg, material, opts = {}) {
  const rnd = mulberry(20261103);
  const group = new THREE.Group();
  scene.add(group);

  // ---------- ground ----------
  const groundParts = [];
  for (const poly of M.LAND) {
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -9, 0);
    groundParts.push(colorize(g, 0xd9d4c7, 0, 0x8d8a83));
  }
  const PATCH_COL = { park: 0x8fcf6a, plaza: 0xe8d2b0, china: 0xd9a08a };
  for (const p of M.PATCHES) groundParts.push(flatPoly(p.poly, p.kind === 'china' ? 0.03 : 0.02, PATCH_COL[p.kind]));
  // roads + centre dashes + crossings
  for (const pts of M.ROADS) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      groundParts.push(quadStrip(ax, az, bx, bz, M.ROAD_W, 0.05, 0x5b5f66));
      const L = Math.hypot(bx - ax, bz - az);
      for (let s = 6; s < L - 6; s += 14) {
        const t0 = s / L, t1 = (s + 6) / L;
        groundParts.push(quadStrip(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, 0.35, 0.07, 0xf2f2e6));
      }
    }
  }
  // Chinatown streets: warm stone with a red centre line
  const C = M.CHINA_STREETS;
  for (const z of C.ew) groundParts.push(quadStrip(C.x0, z, C.x1, z, 14, 0.06, 0xc98c74), quadStrip(C.x0, z, C.x1, z, 1.2, 0.075, 0xb8322a));
  for (const x of C.ns) groundParts.push(quadStrip(x, C.z0, x, C.z1, 10, 0.065, 0xc98c74));
  // waterfront promenade edge stripes
  const ground = new THREE.Mesh(merge(groundParts), material);
  ground.receiveShadow = true;
  group.add(ground);

  // ---------- water ----------
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x3a8cc4, shininess: 80, specular: 0x88bbdd });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(100, M.SEA_Y, 100);
  water.receiveShadow = true;
  group.add(water);

  // ---------- objects ----------
  const objs = new ObjectSet(scene, material);
  const occ = []; // big footprints {x,z,r}
  const occGrid = new Map();
  const CELL = 40;
  const occAdd = (x, z, r) => {
    const o = { x, z, r };
    occ.push(o);
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL);
    const r0 = Math.floor((z - r) / CELL), r1 = Math.floor((z + r) / CELL);
    for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) {
      const k = i + ',' + j; let l = occGrid.get(k); if (!l) occGrid.set(k, (l = [])); l.push(o);
    }
  };
  const occHit = (x, z, r) => {
    const l = occGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    // check 3x3 cells for safety
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const ll = occGrid.get((Math.floor(x / CELL) + i) + ',' + (Math.floor(z / CELL) + j));
      if (!ll) continue;
      for (const o of ll) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return true;
    }
    return !!(l && false);
  };
  // landmark rectangles (precise) for filler rejection
  const rects = [];
  const rectHit = (x, z, r) => {
    for (const R of rects) {
      const dx = x - R.x, dz = z - R.z;
      const lx = dx * R.c - dz * R.s, lz = dx * R.s + dz * R.c;
      const qx = Math.max(Math.abs(lx) - R.hx, 0), qz = Math.max(Math.abs(lz) - R.hz, 0);
      if (Math.hypot(qx, qz) < r) return true;
    }
    return false;
  };

  const place = (proto, x, y, z, yaw, extra = {}) => {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    return objs.add(proto, new THREE.Vector3(x, y, z), q, extra.scale || 1, extra);
  };

  const landRadius = (x, z, r) => M.isLand(x, z) && M.isLand(x + r, z) && M.isLand(x - r, z) && M.isLand(x, z + r) && M.isLand(x, z - r);
  const inPatch = (x, z, kinds) => M.PATCHES.some((p) => kinds.includes(p.kind) && M.pointInPoly(x, z, p.poly));
  const nearStart = (x, z, d) => Math.hypot(x - M.START.x, z - M.START.z) < d;

  // landmarks
  const landmarkObjs = [];
  for (const [id, x, z, yaw, extra = {}] of M.LANDMARKS) {
    const p = reg.get(id, extra.variant || 0);
    if (!p) continue;
    const y = extra.y ?? (extra.float ? M.SEA_Y - (extra.sink ?? p.h * 0.07) : 0);
    const o = place(p, x, y, z, yaw, { landmark: true });
    landmarkObjs.push(o);
    // footprint rect (bbox centre offset rotated)
    const c = new THREE.Vector3(p.center.x, 0, p.center.z).applyAxisAngle(UP, yaw);
    rects.push({ x: x + c.x, z: z + c.z, hx: p.w / 2 + 4, hz: p.d / 2 + 4, c: Math.cos(yaw), s: Math.sin(yaw) });
    // Bridges: collide only with towers + deck so small things can pass under
    if (id === 'bay_bridge') {
      // towers at x = ±160, road decks between y ≈ 36 and 52: small things can pass underneath
      const bb = p.bbMin, BB = p.bbMax;
      o.colliders = [
        { min: new THREE.Vector3(bb.x, 36, bb.z), max: new THREE.Vector3(BB.x, 53, BB.z) },
        { min: new THREE.Vector3(-172, 0, bb.z), max: new THREE.Vector3(-148, BB.y, BB.z) },
        { min: new THREE.Vector3(148, 0, bb.z), max: new THREE.Vector3(172, BB.y, BB.z) },
      ];
      o.size = 280;
    }
  }

  // ropeway cabins (move along the cable)
  const ropeCabin = reg.get('ropeway_cabin');
  if (ropeCabin) {
    const R = M.ROPEWAY;
    for (let i = 0; i < R.cabins; i++) {
      const o = place(ropeCabin, R.a[0], R.y - ropeCabin.h, R.a[1], 0);
      objs.addMover(o, { type: 'cable', t: i / R.cabins, dir: i % 2 ? 1 : -1, speed: 0.025 });
    }
  }
  // the cable itself (visual only)
  {
    const R = M.ROPEWAY;
    const dx = R.b[0] - R.a[0], dz = R.b[1] - R.a[1], L = Math.hypot(dx, dz);
    const px = (-dz / L) * R.gap, pz = (dx / L) * R.gap;
    const pts = [];
    for (const sgn of [1, -1]) pts.push(new THREE.Vector3(R.a[0] + px * sgn, R.y, R.a[1] + pz * sgn), new THREE.Vector3(R.b[0] + px * sgn, R.y, R.b[1] + pz * sgn));
    const cableGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const cable = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x333333 }));
    group.add(cable);
  }

  // Chinatown: buildings lining both sides of each street
  const chinaIds = ['china_building', 'restaurant_small', 'shop_small', 'china_building'];
  const chinaProtos = chinaIds.flatMap((id) => reg.variants(id)).filter(Boolean);
  if (chinaProtos.length) {
    const tryLine = (horizontal, fixed, from, to, side) => {
      let s = from + 4;
      while (s < to - 4) {
        const p = chinaProtos[(rnd() * chinaProtos.length) | 0];
        const half = horizontal ? p.w / 2 : p.w / 2; // width along the street is the model's X
        const depth = p.d;
        const along = s + half;
        const off = (horizontal ? 7.5 : 5.5) + depth / 2 + 0.5;
        let x, z, yaw;
        if (horizontal) { x = along; z = fixed + side * off; yaw = side < 0 ? 0 : Math.PI; }
        else { z = along; x = fixed + side * off; yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2; }
        const r = Math.max(p.w, p.d) * 0.42;
        if (along + half < to && !M.inChinaStreet(x, z, -1) && !occHit(x, z, r * 0.8) && !rectHit(x, z, r * 0.8)) {
          place(p, x, 0, z, yaw);
          occAdd(x, z, r);
        }
        s += p.w + 1 + rnd() * 2;
      }
    };
    for (const z of C.ew) for (const side of [-1, 1]) tryLine(true, z, C.x0, C.x1, side);
    for (const x of C.ns) for (const side of [-1, 1]) tryLine(false, x, C.z0, C.z1, side);
  }

  // filler buildings in blocks
  for (const [x0, z0, x1, z1, ids, spacing] of M.BUILD_BLOCKS) {
    const protos = ids.map((id) => reg.variants(id)).filter((l) => l.length);
    if (!protos.length) continue;
    for (let z = z0 + spacing / 2; z < z1; z += spacing) {
      for (let x = x0 + spacing / 2; x < x1; x += spacing) {
        const list = protos[(rnd() * protos.length) | 0];
        const p = list[(rnd() * list.length) | 0];
        const jx = (rnd() - 0.5) * spacing * 0.25, jz = (rnd() - 0.5) * spacing * 0.25;
        const px = x + jx, pz = z + jz;
        const fr = Math.max(p.w, p.d) / 2;
        if (fr * 2 > spacing * 1.15) continue;
        if (!landRadius(px, pz, fr)) continue;
        if (M.nearestRoad(px, pz).d < M.ROAD_W / 2 + fr + 2) continue;
        if (inPatch(px, pz, ['park', 'plaza', 'china'])) continue;
        if (rectHit(px, pz, fr * 0.9) || occHit(px, pz, fr * 0.9)) continue;
        if (nearStart(px, pz, 120)) continue;
        // face the nearest road
        const nr = M.nearestRoad(px, pz);
        const rp = M.ROADS[nr.road];
        const [ax, az] = rp[nr.seg], [bx, bz] = rp[nr.seg + 1];
        const qx = ax + (bx - ax) * nr.t, qz = az + (bz - az) * nr.t;
        const yaw = Math.round(Math.atan2(qx - px, qz - pz) / (Math.PI / 2)) * (Math.PI / 2);
        place(p, px, 0, pz, yaw);
        occAdd(px, pz, fr);
      }
    }
  }

  // scattered small/mid things by district tags
  const TIER = (p) => (p.maxDim < 0.6 ? 0 : p.maxDim < 2.6 ? 1 : p.maxDim < 14 ? 2 : 3);
  const BASE = [0.011, 0.0028, 0.00045];
  const tierMul = {
    '横浜のまち': [0.0, 0.05, 0.35], '本牧': [0.05, 0.25, 0.8], '大黒ふ頭': [0.0, 0.1, 0.5],
    '関内': [0.25, 0.5, 1], '元町': [0.25, 0.5, 1], 'みなとみらい': [0.4, 0.7, 1], '横浜スタジアム': [0.6, 0.8, 1],
  };
  const ids = new Map(); // id → {weight, where, list}
  for (const p of reg.all) {
    if (p.tag !== 'town') continue;
    if (!p.where.length || p.move === 'drive' || p.move === 'sail' || p.move === 'fly') continue;
    if (p.where.includes('road') || p.where.includes('sea')) continue;
    let e = ids.get(p.id);
    if (!e) ids.set(p.id, (e = { id: p.id, weight: p.weight, where: p.where, list: [], tier: TIER(p) }));
    e.list.push(p);
  }
  for (const [k, e] of ids) if (e.tier > 2) ids.delete(k);
  const counted = { 0: 0, 1: 0, 2: 0 };
  let scatterTotal = 0;
  const districtsDone = [];
  for (const d of M.DISTRICTS) {
    const xs = d.poly.map((p) => p[0]), zs = d.poly.map((p) => p[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), bz0 = Math.min(...zs), bz1 = Math.max(...zs);
    const area = (bx1 - bx0) * (bz1 - bz0);
    const mul = tierMul[d.name] || [1, 1, 1];
    for (let tier = 0; tier < 3; tier++) {
      const cands = [...ids.values()].filter((e) => e.tier === tier && e.where.some((w) => d.tags.includes(w)));
      if (!cands.length) continue;
      const totalW = cands.reduce((a, e) => a + e.weight, 0);
      const n = Math.round(area * BASE[tier] * d.dens * mul[tier] * (opts.density || 1));
      for (let i = 0; i < n; i++) {
        let r = rnd() * totalW, e = cands[0];
        for (const c of cands) { r -= c.weight; if (r <= 0) { e = c; break; } }
        const p = e.list[(rnd() * e.list.length) | 0];
        for (let tries = 0; tries < 6; tries++) {
          const x = bx0 + rnd() * (bx1 - bx0), z = bz0 + rnd() * (bz1 - bz0);
          if (!M.pointInPoly(x, z, d.poly)) continue;
          if (districtsDone.some((dd) => M.pointInPoly(x, z, dd.poly))) continue; // earlier district owns this spot
          const fr = Math.max(p.w, p.d) / 2;
          if (!landRadius(x, z, Math.max(fr, 0.5))) continue;
          if (M.onRoad(x, z, fr + 0.5)) continue;
          if (rectHit(x, z, fr) || occHit(x, z, fr)) continue;
          if (p.maxDim > 2 && nearStart(x, z, 6)) continue;
          const o = place(p, x, 0, z, rnd() * Math.PI * 2);
          if (p.maxDim >= 0.9) occAdd(x, z, fr * 0.9);
          if (p.move === 'walk' || p.move === 'hop') {
            objs.addMover(o, { type: p.move, hx: x, hz: z, tx: x, tz: z, wait: rnd() * 3, speed: p.speed, yaw: rnd() * 6.28, phase: rnd() * 6 });
          }
          counted[tier]++; scatterTotal++;
          break;
        }
      }
    }
    districtsDone.push(d);
  }

  // extra carpets of little things: thick around the start, food all along Chinatown's streets
  const pickWeighted = (cands) => {
    const totalW = cands.reduce((a, e) => a + e.weight, 0);
    let r = rnd() * totalW;
    for (const c of cands) { r -= c.weight; if (r <= 0) return c; }
    return cands[0];
  };
  const carpet = (cands, n, sample) => {
    if (!cands.length) return;
    for (let i = 0; i < n; i++) {
      const e = pickWeighted(cands);
      const p = e.list[(rnd() * e.list.length) | 0];
      for (let tries = 0; tries < 5; tries++) {
        const pt = sample();
        if (!pt) continue;
        const [x, z] = pt;
        const fr = Math.max(p.w, p.d) / 2;
        if (!landRadius(x, z, Math.max(fr, 0.4))) continue;
        if (M.onRoad(x, z, fr + 0.3)) continue;
        if (rectHit(x, z, fr) || occHit(x, z, fr)) continue;
        const o = place(p, x, 0, z, rnd() * Math.PI * 2);
        if (p.maxDim >= 0.9) occAdd(x, z, fr * 0.9);
        if (p.move === 'walk' || p.move === 'hop') {
          objs.addMover(o, { type: p.move, hx: x, hz: z, tx: x, tz: z, wait: rnd() * 3, speed: p.speed, yaw: rnd() * 6.28, phase: rnd() * 6 });
        }
        scatterTotal++;
        break;
      }
    }
  };
  const outdoor = ['park', 'plaza', 'waterfront', 'street'];
  const tiny = [...ids.values()].filter((e) => e.tier === 0 && e.where.some((w) => outdoor.includes(w)));
  const smallish = [...ids.values()].filter((e) => e.tier === 1 && e.list[0].maxDim < 1.3 && e.where.some((w) => outdoor.includes(w)));
  const around = (R, pow) => () => {
    const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), pow) * R;
    return [M.START.x + Math.cos(a) * d, M.START.z + Math.sin(a) * d];
  };
  carpet(tiny, Math.round(1800 * (opts.density || 1)), around(110, 0.9));
  carpet(smallish, Math.round(260 * (opts.density || 1)), around(140, 0.7));
  const chinaTiny = [...ids.values()].filter((e) => e.tier <= 1 && e.where.includes('chinatown'));
  const chinaStreetPt = () => {
    const horizontal = rnd() < 0.6;
    if (horizontal) return [C.x0 + rnd() * (C.x1 - C.x0), C.ew[(rnd() * C.ew.length) | 0] + (rnd() - 0.5) * 12];
    return [C.ns[(rnd() * C.ns.length) | 0] + (rnd() - 0.5) * 8, C.z0 + rnd() * (C.z1 - C.z0)];
  };
  carpet(chinaTiny, Math.round(1600 * (opts.density || 1)), chinaStreetPt);

  // traffic
  const roadLens = M.ROADS.map((pts) => { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L; });
  const drivers = [];
  for (const p of reg.all) if (p.tag === 'town' && p.move === 'drive') drivers.push(p);
  if (drivers.length) {
    const totalW = drivers.reduce((a, p) => a + p.weight / reg.variants(p.id).length, 0);
    M.ROADS.forEach((pts, ri) => {
      const n = Math.floor(roadLens[ri] / 45);
      for (let i = 0; i < n; i++) {
        let r = rnd() * totalW, p = drivers[0];
        for (const c of drivers) { r -= c.weight / reg.variants(c.id).length; if (r <= 0) { p = c; break; } }
        const s = rnd() * roadLens[ri];
        const dir = rnd() < 0.5 ? 1 : -1;
        const o = place(p, pts[0][0], 0, pts[0][1], 0);
        objs.addMover(o, { type: 'drive', road: ri, s, dir, len: roadLens[ri], speed: p.speed * (0.8 + rnd() * 0.4) });
      }
    });
  }

  // boats
  const sailors = reg.all.filter((p) => p.tag === 'town' && p.move === 'sail');
  for (const p of sailors) {
    const n = Math.round((p.weight || 1) * (p.maxDim < 15 ? 9 : 3) / reg.variants(p.id).length);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const A = M.SEA_AREAS[0];
        const x = A[0][0] + rnd() * (A[1][0] - A[0][0]), z = A[0][1] + rnd() * (A[2][1] - A[0][1]);
        const rr = p.maxDim * 0.8 + 6;
        if (M.isLand(x, z) || M.isLand(x + rr, z) || M.isLand(x - rr, z) || M.isLand(x, z + rr) || M.isLand(x, z - rr)) continue;
        if (rectHit(x, z, rr)) continue;
        const o = place(p, x, M.SEA_Y - p.h * 0.12, z, rnd() * 6.28);
        objs.addMover(o, { type: 'sail', yaw: rnd() * 6.28, speed: p.speed, turn: 0, t: rnd() * 10, baseY: M.SEA_Y - p.h * 0.12 });
        break;
      }
    }
  }

  // flying gulls
  const flyer = reg.get('gull_flying');
  if (flyer) {
    const spots = [[-60, -150], [150, -420], [340, -200], [700, 120], [-500, -700], [-150, -40], [500, 60], [900, 60], [-300, -760]];
    for (const [cx, cz] of spots) {
      for (let i = 0; i < 5; i++) {
        const o = place(flyer, cx, 10, cz, 0);
        objs.addMover(o, { type: 'fly', cx: cx + (rnd() - 0.5) * 30, cz: cz + (rnd() - 0.5) * 30, cy: 5 + rnd() * 22, R: 12 + rnd() * 30, ang: rnd() * 6.28, w: (0.25 + rnd() * 0.3) * (rnd() < 0.5 ? -1 : 1) });
      }
    }
  }

  objs.finalize();
  if (opts.log) console.log('town objects', objs.objs.length, 'scatter', scatterTotal, counted, 'movers', objs.movers.length);

  // ---------- movers ----------
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  function roadPoint(ri, s) {
    const pts = M.ROADS[ri];
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

  let time = 0;
  function updateMovers(dt, ball, pickK) {
    time += dt;
    const bx = ball.pos.x, bz = ball.pos.z, br = ball.r;
    const range = 260 + br * 30;
    for (const o of objs.movers) {
      if (o.picked) continue;
      const m = o.mover;
      const dxB = o.pos.x - bx, dzB = o.pos.z - bz;
      if (m.type !== 'drive' && m.type !== 'cable' && (dxB > range || dxB < -range || dzB > range || dzB < -range)) continue;
      if (m.type === 'walk' || m.type === 'hop') {
        const d = Math.hypot(dxB, dzB);
        let vx = 0, vz = 0, sp = m.speed;
        const scared = o.size < br * pickK && d < br * 7 + 3;
        if (scared) {
          vx = dxB / (d || 1); vz = dzB / (d || 1); sp *= 2.3;
          m.tx = o.pos.x + vx * 10; m.tz = o.pos.z + vz * 10;
        } else if (m.wait > 0) {
          m.wait -= dt;
        } else {
          const tx = m.tx - o.pos.x, tz = m.tz - o.pos.z, td = Math.hypot(tx, tz);
          if (td < 0.3) {
            m.wait = 0.5 + rnd() * 3;
            const a = rnd() * 6.28, rr = 2 + rnd() * (m.type === 'hop' ? 4 : 14);
            m.tx = m.hx + Math.cos(a) * rr; m.tz = m.hz + Math.sin(a) * rr;
          } else { vx = tx / td; vz = tz / td; }
        }
        if (vx || vz) {
          const nx = o.pos.x + vx * sp * dt, nz = o.pos.z + vz * sp * dt;
          if (M.isLand(nx, nz) && !M.onRoad(nx, nz, -1)) { o.pos.x = nx; o.pos.z = nz; }
          else { m.tx = m.hx; m.tz = m.hz; }
          const want = Math.atan2(vx, vz);
          let dy = want - m.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          m.yaw += dy * Math.min(1, dt * 8);
          m.phase += dt * sp * 5;
        }
        const y = m.type === 'hop' ? Math.abs(Math.sin(m.phase * 1.5)) * 0.12 : Math.abs(Math.sin(m.phase)) * 0.03;
        _p.set(o.pos.x, y, o.pos.z);
        _q.setFromAxisAngle(UP, m.yaw);
        objs.setTransform(o, _p, _q);
      } else if (m.type === 'drive') {
        m.s += m.dir * m.speed * dt;
        if (m.s > m.len) { m.s = m.len; m.dir = -1; }
        if (m.s < 0) { m.s = 0; m.dir = 1; }
        const rp = roadPoint(m.road, m.s);
        const lane = 3.4 * m.dir;
        _p.set(rp.x - rp.dz * lane, 0, rp.z + rp.dx * lane);
        _q.setFromAxisAngle(UP, Math.atan2(rp.dx * m.dir, rp.dz * m.dir));
        objs.setTransform(o, _p, _q);
      } else if (m.type === 'sail') {
        m.t += dt;
        m.turn += (rnd() - 0.5) * dt * 0.6;
        m.turn *= 0.98;
        m.yaw += m.turn * dt;
        const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
        const look = o.size * 0.7 + 10;
        if (M.isLand(o.pos.x + fx * look, o.pos.z + fz * look) || Math.abs(o.pos.x) > 1700 || o.pos.z < -1100) {
          m.yaw += dt * 1.5; // steer away from the quay
        } else {
          o.pos.x += fx * m.speed * dt; o.pos.z += fz * m.speed * dt;
        }
        _p.set(o.pos.x, m.baseY + Math.sin(m.t * 1.3) * 0.15, o.pos.z);
        _q.setFromEuler(new THREE.Euler(Math.sin(m.t * 0.9) * 0.02, m.yaw, Math.sin(m.t * 1.1) * 0.03, 'YXZ'));
        objs.setTransform(o, _p, _q);
      } else if (m.type === 'fly') {
        m.ang += m.w * dt;
        _p.set(m.cx + Math.cos(m.ang) * m.R, m.cy + Math.sin(m.ang * 3) * 1.5, m.cz + Math.sin(m.ang) * m.R);
        const yaw = Math.atan2(-Math.sin(m.ang) * Math.sign(m.w), Math.cos(m.ang) * Math.sign(m.w));
        _q.setFromEuler(new THREE.Euler(0, yaw, -0.3 * Math.sign(m.w), 'YXZ'));
        objs.setTransform(o, _p, _q);
      } else if (m.type === 'cable') {
        m.t += m.speed * dt;
        if (m.t > 1) m.t -= 1;
        const R = M.ROPEWAY;
        // two lanes: outbound on one cable, return on the other (offset)
        const t = m.t < 0.5 ? m.t * 2 : 2 - m.t * 2;
        const sgn = m.t < 0.5 ? 1 : -1;
        const dx = R.b[0] - R.a[0], dz = R.b[1] - R.a[1], L = Math.hypot(dx, dz);
        const x = R.a[0] + dx * t + (-dz / L) * R.gap * sgn, z = R.a[1] + dz * t + (dx / L) * R.gap * sgn;
        _p.set(x, R.y - o.proto.h, z);
        _q.setFromAxisAngle(UP, Math.atan2(dx, dz) + (sgn < 0 ? Math.PI : 0));
        objs.setTransform(o, _p, _q);
      }
    }
  }

  function groundY(x, z) {
    return M.isLand(x, z) ? 0 : M.SEABED_Y;
  }

  return { group, objs, water, waterMat, ground, updateMovers, groundY, landmarkObjs };
}
