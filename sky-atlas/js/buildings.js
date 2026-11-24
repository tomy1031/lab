// js/buildings.js — city blocks from OpenStreetMap. The footprints (and height / number of floors, where
// mappers entered them) come from the Overpass API once, are packed into a small binary file in the tile
// store, and are extruded into simple coloured blocks near you.
import * as THREE from 'three';
import { Frame } from './geo.js';
import { OVERPASS } from './sources.js';
import { tileCache } from './tiles.js';
import { curved } from './terrain.js';

const CHUNK = 400; // m
export const buildingsKey = (area) => `https://sky-atlas.invalid/buildings/${area.id}.bin`;

function hash(n) {
  let h = Math.imul(n | 0, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// kinds → colour family
const KIND = { generic: 0, house: 1, office: 2, industrial: 3, historic: 4, tall: 5 };
const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'residential', 'cabin', 'farm', 'hut', 'static_caravan']);
const SMALL = new Set(['garage', 'garages', 'shed', 'carport', 'roof', 'kiosk', 'toilets', 'service']);
const OFFICE = new Set(['office', 'commercial', 'retail', 'hotel', 'apartments', 'public', 'government', 'hospital', 'university', 'school', 'train_station', 'transportation']);
const INDUS = new Set(['industrial', 'warehouse', 'manufacture', 'hangar', 'storage_tank', 'greenhouse', 'barn', 'farm_auxiliary']);
const HIST = new Set(['church', 'cathedral', 'chapel', 'temple', 'shrine', 'mosque', 'synagogue', 'castle', 'palace', 'monastery']);

function meters(v) {
  if (v == null) return NaN;
  const s = String(v).trim().toLowerCase().replace(',', '.');
  const n = parseFloat(s);
  if (!(n > 0)) return NaN;
  return /ft|'/.test(s) ? n * 0.3048 : n;
}

export function heightOf(t, id) {
  const r = hash(id);
  let h = meters(t.height);
  if (!(h > 0 && h < 900)) {
    const lv = parseFloat(t['building:levels']);
    if (lv > 0 && lv < 200) h = lv * 3.2 + (parseFloat(t['roof:levels']) > 0 ? parseFloat(t['roof:levels']) * 2.2 : 1.2);
  }
  const b = t.building;
  if (!(h > 0)) {
    if (SMALL.has(b)) h = 3 + r;
    else if (HOUSE.has(b)) h = 6.5 + r * 2.5;
    else if (b === 'apartments') h = 14 + r * 12;
    else if (OFFICE.has(b)) h = 12 + r * 10;
    else if (INDUS.has(b)) h = 7 + r * 5;
    else if (HIST.has(b)) h = 14 + r * 10;
    else h = 7 + r * 5;
  }
  const minH = meters(t.min_height);
  return { h, minH: minH > 0 && minH < h ? minH : 0 };
}

export function kindOf(t, h) {
  const b = t.building;
  if (h > 70) return KIND.tall;
  if (HIST.has(b) || t.historic || t.amenity === 'place_of_worship') return KIND.historic;
  if (HOUSE.has(b) || SMALL.has(b)) return KIND.house;
  if (OFFICE.has(b)) return KIND.office;
  if (INDUS.has(b)) return KIND.industrial;
  return KIND.generic;
}

// Overpass JSON → packed binary. Layout (little endian):
//   'SKB1' | uint32 count | uint32 points | uint32 reserved
//   float32 height[count] | float32 minH[count] | uint16 npts[count] | uint8 kind[count] | pad to 4 | float32 xz[points*2]
export function pack(json, frame) {
  const items = [];
  const ring = (geom) => {
    if (!geom || geom.length < 4) return null;
    const a = geom[0], b = geom[geom.length - 1];
    if (a.lat !== b.lat || a.lon !== b.lon) return null; // not closed
    const pts = [];
    for (let i = 0; i < geom.length - 1; i++) {
      const p = frame.toLocal(geom[i].lon, geom[i].lat);
      pts.push(Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10);
    }
    return pts.length >= 6 && pts.length <= 2 * 65000 ? pts : null;
  };
  for (const el of json.elements || []) {
    const t = el.tags || {};
    if (!t.building || t.building === 'no' || t.building === 'construction' && !t.height) continue;
    const { h, minH } = heightOf(t, el.id);
    const kind = kindOf(t, h);
    if (el.type === 'way') {
      const pts = ring(el.geometry);
      if (pts) items.push({ pts, h, minH, kind });
    } else if (el.type === 'relation') {
      for (const m of el.members || []) if (m.role === 'outer') {
        const pts = ring(m.geometry);
        if (pts) items.push({ pts, h, minH, kind });
      }
    }
  }
  const count = items.length, points = items.reduce((s, it) => s + it.pts.length / 2, 0);
  const off = { h: 16, m: 16 + count * 4 };
  off.n = off.m + count * 4;
  off.k = off.n + count * 2;
  off.xz = Math.ceil((off.k + count) / 4) * 4;
  const buf = new ArrayBuffer(off.xz + points * 8);
  const dv = new DataView(buf);
  [83, 75, 66, 49].forEach((c, i) => dv.setUint8(i, c));
  dv.setUint32(4, count, true);
  dv.setUint32(8, points, true);
  const H = new Float32Array(buf, off.h, count), M = new Float32Array(buf, off.m, count);
  const NP = new Uint16Array(buf, off.n, count), K = new Uint8Array(buf, off.k, count), XZ = new Float32Array(buf, off.xz, points * 2);
  let p = 0;
  items.forEach((it, i) => {
    H[i] = it.h; M[i] = it.minH; NP[i] = it.pts.length / 2; K[i] = it.kind;
    XZ.set(it.pts, p);
    p += it.pts.length;
  });
  return buf;
}

export function unpack(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'SKB1') throw new Error('bad buildings file');
  const count = dv.getUint32(4, true), points = dv.getUint32(8, true);
  const off = { h: 16, m: 16 + count * 4 };
  off.n = off.m + count * 4;
  off.k = off.n + count * 2;
  off.xz = Math.ceil((off.k + count) / 4) * 4;
  return {
    count,
    h: new Float32Array(buf, off.h, count), minH: new Float32Array(buf, off.m, count),
    n: new Uint16Array(buf, off.n, count), kind: new Uint8Array(buf, off.k, count),
    xz: new Float32Array(buf, off.xz, points * 2),
  };
}

export function overpassQuery(area, radius) {
  const dLat = radius / 111320, dLon = radius / (111320 * Math.cos((area.lat * Math.PI) / 180));
  const bb = [area.lat - dLat, area.lon - dLon, area.lat + dLat, area.lon + dLon].map((v) => v.toFixed(5)).join(',');
  return `[out:json][timeout:180][maxsize:1073741824];(way["building"](${bb});relation["building"]["type"="multipolygon"](${bb}););out tags geom qt;`;
}

// fetch the area's buildings from Overpass (trying the mirrors in turn), pack and store them → count
export async function fetchBuildings(plan, { signal, store = true } = {}) {
  const area = plan.area;
  const q = overpassQuery(area, plan.buildings.radius);
  let last = null;
  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, { method: 'POST', body: new URLSearchParams({ data: q }), signal });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      const buf = pack(json, new Frame(area.lat, area.lon));
      if (store) {
        const c = await tileCache();
        if (c) await c.put(buildingsKey(area), new Response(buf, { headers: { 'content-type': 'application/octet-stream' } }));
      }
      return new DataView(buf).getUint32(4, true);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      last = e;
    }
  }
  throw last || new Error('Overpass unreachable');
}

export async function loadBuildings(area) {
  const c = await tileCache();
  if (!c) return null;
  const hit = await c.match(buildingsKey(area)).catch(() => null);
  if (!hit) return null;
  try { return unpack(await hit.arrayBuffer()); } catch { return null; }
}

// colours: [wall, roof] per kind
const PALETTE = [
  [[0.84, 0.81, 0.76], [0.72, 0.71, 0.69]],
  [[0.92, 0.88, 0.80], [0.62, 0.42, 0.36]],
  [[0.74, 0.79, 0.84], [0.60, 0.63, 0.66]],
  [[0.80, 0.78, 0.74], [0.66, 0.68, 0.70]],
  [[0.90, 0.83, 0.66], [0.44, 0.52, 0.50]],
  [[0.62, 0.71, 0.80], [0.55, 0.60, 0.66]],
];
const SUN = new THREE.Vector2(0.55, -0.83).normalize(); // light from the south-west-ish (x east, z south)

export class Buildings {
  constructor({ scene, data, heightAt, drawDist = 3500 }) {
    this.data = data;
    this.heightAt = heightAt;
    this.drawDist = drawDist;
    this.group = new THREE.Group();
    this.group.name = 'buildings';
    scene.add(this.group);
    this.mat = curved(new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.chunks = new Map();
    // index buildings by chunk (by their first point)
    const starts = new Uint32Array(data.count);
    let p = 0;
    for (let i = 0; i < data.count; i++) { starts[i] = p; p += data.n[i] * 2; }
    this.starts = starts;
    for (let i = 0; i < data.count; i++) {
      const s = starts[i], cx = Math.floor(data.xz[s] / CHUNK), cz = Math.floor(data.xz[s + 1] / CHUNK);
      const key = `${cx},${cz}`;
      let ch = this.chunks.get(key);
      if (!ch) { ch = { cx, cz, x: (cx + 0.5) * CHUNK, z: (cz + 0.5) * CHUNK, ids: [], mesh: null, demZ: -2, used: 0 }; this.chunks.set(key, ch); }
      ch.ids.push(i);
    }
    this.stats = { chunks: 0, tris: 0, count: data.count };
  }

  buildChunk(ch) {
    const d = this.data;
    const pos = [], col = [];
    const center = this.heightAt(ch.x, ch.z);
    const v2 = new THREE.Vector2();
    for (const i of ch.ids) {
      const s = this.starts[i], n = d.n[i];
      const xs = new Array(n), zs = new Array(n);
      let gx = 0, gz = 0, area = 0;
      for (let k = 0; k < n; k++) { xs[k] = d.xz[s + k * 2]; zs[k] = d.xz[s + k * 2 + 1]; gx += xs[k]; gz += zs[k]; }
      gx /= n; gz /= n;
      for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; area += xs[k] * zs[k2] - xs[k2] * zs[k]; }
      if (area > 0) { xs.reverse(); zs.reverse(); } // make every ring the same way round (area < 0)
      const g = this.heightAt(gx, gz).h;
      const y0 = g - 1.5 + d.minH[i], y1 = g + d.h[i];
      const [wall, roof] = PALETTE[d.kind[i]];
      const tint = 0.9 + hash(i * 7 + 3) * 0.18;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const ax = xs[k] - ch.x, az = zs[k] - ch.z, bx = xs[k2] - ch.x, bz = zs[k2] - ch.z;
        const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez) || 1;
        // outward normal (area < 0 → left of the edge)
        v2.set(-ez / len, ex / len);
        const shade = (0.66 + 0.34 * Math.max(0, v2.dot(SUN))) * tint;
        const r = wall[0] * shade, gg = wall[1] * shade, b = wall[2] * shade;
        pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
        for (let q = 0; q < 6; q++) col.push(r, gg, b);
      }
      // flat roof
      const contour = xs.map((x, k) => new THREE.Vector2(x, zs[k]));
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tris = []; }
      const rr = roof[0] * tint, rg = roof[1] * tint, rb = roof[2] * tint;
      for (const [a, b, c] of tris) {
        const A = contour[a], B = contour[b], C = contour[c];
        // facing up needs (B−A)×(C−A) in x/z to be negative
        const cr = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
        const [P, Q] = cr < 0 ? [B, C] : [C, B];
        pos.push(A.x - ch.x, y1, A.y - ch.z, P.x - ch.x, y1, P.y - ch.z, Q.x - ch.x, y1, Q.y - ch.z);
        for (let q = 0; q < 3; q++) col.push(rr, rg, rb);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); }
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.position.set(ch.x, 0, ch.z);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    ch.mesh = mesh;
    ch.tris = pos.length / 9;
    ch.demZ = center.z;
  }

  update(cam, now = performance.now(), budgetMs = 3) {
    const t0 = performance.now();
    let shown = 0, tris = 0;
    const want = [];
    const recheck = (this.frameNo = (this.frameNo || 0) + 1) % 30 === 0;
    for (const ch of this.chunks.values()) {
      const d = Math.hypot(ch.x - cam.x, ch.z - cam.z);
      const near = d < this.drawDist + CHUNK && cam.y - 0 < this.drawDist * 1.5;
      if (near) {
        ch.used = now;
        // (re)build when missing, or when finer terrain has arrived since
        if (!ch.mesh || (recheck && this.heightAt(ch.x, ch.z).z > ch.demZ)) want.push([d, ch]);
      }
      if (ch.mesh) {
        ch.mesh.visible = near;
        if (near) { shown++; tris += ch.tris; }
        else if (now - ch.used > 20000) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; ch.demZ = -2; }
      }
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, ch] of want) {
      if (performance.now() - t0 > budgetMs) break;
      this.buildChunk(ch);
    }
    this.stats.chunks = shown;
    this.stats.tris = tris;
  }

  dispose() {
    for (const ch of this.chunks.values()) if (ch.mesh) ch.mesh.geometry.dispose();
    this.group.removeFromParent();
    this.mat.dispose();
  }
}
