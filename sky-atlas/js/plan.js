// js/plan.js — exactly which tiles an area needs. The same plan drives the download (so the area works with
// no network) and the renderer (it never asks for a tile outside the plan, so offline it never waits for one).
//
// Each zoom level covers a square around the centre: the detailed levels just the area itself, the coarse
// levels much more (out to ~700 km), so the horizon is real land and sea, only blurrier.
import { tileRange, inRange, rangeCount, groundTile, tileKey } from './geo.js';
import { SAT, AERIAL, aerialFor, DEM, DEM_JP, demJpFor } from './sources.js';

export const ROOT_Z = 6;
const HORIZON = 700e3; // m
const HI_R = { 13: 12000, 14: 9000, 15: 6000, 16: 4000, 17: 2500 }; // aerial photo radius per zoom (m)
const DEM_FINE_R = 8000; // radius of the finest terrain zoom
// average tile sizes, for the download estimate (bytes)
const AVG = { s2: 15000, aerial: 24000, terrarium: 80000, gsidem: 45000, bldPerKm2: 160000 };

export const RADII = [10, 25, 50]; // km choices

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// normalise an area description (from a preset, a search result or storage)
export function normArea(a) {
  const area = {
    name: a.name || `${a.lat.toFixed(3)}, ${a.lon.toFixed(3)}`,
    sub: a.sub || '',
    lat: +a.lat, lon: +a.lon,
    r: RADII.includes(+a.r) ? +a.r : 25,
    year: +a.year || 2024,
    hires: a.hires !== false,
    buildings: !!a.buildings,
    bRadius: +a.bRadius || 2000,
    start: a.start || null, // { alt, heading } where the flight starts
  };
  area.id = hashStr([area.lat.toFixed(5), area.lon.toFixed(5), area.r, area.year, area.hires, area.buildings, area.bRadius].join('|'));
  return area;
}

export class Plan {
  constructor(areaIn) {
    const area = (this.area = normArea(areaIn));
    const { lat, lon } = area;
    const r = area.r * 1000;
    this.r = r;
    this.year = area.year;
    this.aerial = area.hires ? aerialFor(lat, lon) : null;
    this.demJp = demJpFor(lat, lon);
    const baseH = (z) => Math.min(HORIZON, Math.max(r, 1.6 * groundTile(z, lat)));
    this.img = {}; this.hi = {}; this.dem = {}; this.demHi = {};
    for (let z = ROOT_Z; z <= SAT.maxZ; z++) this.img[z] = tileRange(lat, lon, baseH(z), z);
    if (this.aerial) for (let z = 13; z <= this.aerial.maxZ; z++) this.hi[z] = tileRange(lat, lon, Math.min(r, HI_R[z]), z);
    for (let z = ROOT_Z; z <= 12; z++) this.dem[z] = tileRange(lat, lon, baseH(z), z);
    this.dem[13] = tileRange(lat, lon, Math.min(r, DEM_FINE_R), 13);
    if (this.demJp) for (const z of [13, 14]) this.demHi[z] = tileRange(lat, lon, Math.min(r, z === 14 ? DEM_FINE_R : r), z);
    this.maxImgZ = this.aerial ? this.aerial.maxZ : SAT.maxZ;
    this.maxDemZ = this.demJp ? 14 : 13;
    this.maxNodeZ = Math.max(this.maxImgZ, SAT.maxZ + 1);
    this.buildings = area.buildings ? { radius: Math.min(r, area.bRadius) } : null;
    // how far you may fly from the centre before being turned back (the coarse levels end at HORIZON)
    this.limit = HORIZON * 0.8;
  }

  // the image URLs for a tile, best first (an aerial photo, then the satellite mosaic)
  imageUrls(z, x, y) {
    const out = [];
    if (this.aerial && inRange(this.hi[z], x, y)) out.push(this.aerial.url(z, x, y));
    if (z <= SAT.maxZ && (inRange(this.img[z], x, y) || (out.length && z >= ROOT_Z))) out.push(SAT.url(z, x, y, this.year));
    return out;
  }
  // the elevation tiles for a tile, best first: [{ url, decode }]
  demUrls(z, x, y) {
    const out = [];
    if (this.demJp && inRange(this.demHi[z], x, y)) out.push({ url: DEM_JP.url(z, x, y), decode: 'gsi' });
    if (z <= 13 && inRange(this.dem[z], x, y)) out.push({ url: DEM.url(z, x, y), decode: 'terrarium' });
    else if (out.length && z <= 14) out.push({ url: DEM.url(z, x, y), decode: 'terrarium' });
    return out;
  }

  // does any imagery at zoom zz (or the finest one, if zz is beyond it) touch tile z/x/y?
  touches(zz, z, x, y) {
    const zi = Math.min(zz, this.maxImgZ);
    const check = (rg) => {
      if (!rg) return false;
      if (zi >= z) {
        const f = 2 ** (zi - z);
        return x * f <= rg.x1 && (x + 1) * f - 1 >= rg.x0 && y * f <= rg.y1 && (y + 1) * f - 1 >= rg.y0;
      }
      const f = 2 ** (z - zi);
      return inRange(rg, Math.floor(x / f), Math.floor(y / f));
    };
    return check(this.hi[zi]) || (zi <= SAT.maxZ && check(this.img[zi]));
  }
  canSplit(z, x, y) {
    return z < this.maxNodeZ && this.touches(z + 1, z, x, y);
  }

  roots() {
    const r = this.img[ROOT_Z], out = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push([ROOT_Z, x, y]);
    return out;
  }

  // every tile to download: { kind, urls (best first), est (bytes) }
  jobs() {
    const out = [];
    const zs = new Set([...Object.keys(this.img), ...Object.keys(this.hi)].map(Number));
    for (const z of [...zs].sort((a, b) => a - b)) {
      const rs = [this.img[z], this.hi[z]].filter(Boolean);
      const seen = new Set();
      for (const rg of rs) for (let y = rg.y0; y <= rg.y1; y++) for (let x = rg.x0; x <= rg.x1; x++) {
        const k = tileKey(z, x, y);
        if (seen.has(k)) continue;
        seen.add(k);
        const urls = this.imageUrls(z, x, y);
        if (urls.length) out.push({ kind: 'img', urls, est: urls.length > 1 || z > SAT.maxZ ? AVG.aerial : AVG.s2 });
      }
    }
    const dz = new Set([...Object.keys(this.dem), ...Object.keys(this.demHi)].map(Number));
    for (const z of [...dz].sort((a, b) => a - b)) {
      const rs = [this.dem[z], this.demHi[z]].filter(Boolean);
      const seen = new Set();
      for (const rg of rs) for (let y = rg.y0; y <= rg.y1; y++) for (let x = rg.x0; x <= rg.x1; x++) {
        const k = tileKey(z, x, y);
        if (seen.has(k)) continue;
        seen.add(k);
        const urls = this.demUrls(z, x, y).map((d) => d.url);
        if (urls.length) out.push({ kind: 'dem', urls, est: urls[0].includes('gsi') ? AVG.gsidem : AVG.terrarium });
      }
    }
    return out;
  }

  estimate() {
    const jobs = this.jobs();
    let bytes = jobs.reduce((s, j) => s + j.est, 0);
    if (this.buildings) bytes += Math.PI * (this.buildings.radius / 1000) ** 2 * AVG.bldPerKm2;
    return { tiles: jobs.length, bytes };
  }

  // every URL this plan may ever read (to tell which cached tiles other areas still need)
  allUrls() {
    const s = new Set();
    for (const j of this.jobs()) for (const u of j.urls) s.add(u);
    return s;
  }
}

export const credits = (plan) => {
  const out = [SAT.credit(plan.year)];
  if (plan.aerial) out.push(plan.aerial.credit);
  out.push(DEM.credit);
  if (plan.demJp) out.push(DEM_JP.credit);
  return out;
};

export { rangeCount, AERIAL };
