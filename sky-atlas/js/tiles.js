// js/tiles.js — getting tiles: from this browser's tile store (Cache Storage) first, from the network
// otherwise. Downloaded areas live in the store, so the game flies with no network at all.
//
// A tile the server does not have (404 — e.g. sea outside an aerial survey) is remembered as "missing"
// (a tiny marker in the store), so offline we know to use the next source instead of waiting.
export const TILE_CACHE = 'sky-atlas-tiles-v1';
const MISSING = 'x-sky-missing';

let cachePromise = null;
export function tileCache() {
  if (!cachePromise) {
    cachePromise = (async () => {
      try { return 'caches' in self ? await caches.open(TILE_CACHE) : null; } catch { return null; }
    })();
  }
  return cachePromise;
}

export class Missing extends Error {}

// → Blob (the tile), or throws Missing (the server has no such tile) / Error (network, offline)
export async function getTile(url, { store = false, signal } = {}) {
  const c = await tileCache();
  if (c) {
    let hit = null;
    try { hit = await c.match(url); } catch { /* ignore */ }
    if (hit) {
      if (hit.headers.get(MISSING)) throw new Missing(url);
      return hit.blob();
    }
  }
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
  if (res.status === 404 || res.status === 204 || res.status === 400) {
    if (store && c) await c.put(url, new Response('', { headers: { [MISSING]: '1' } })).catch(() => {});
    throw new Missing(url);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  // some servers answer a missing tile with an empty body
  if (blob.size === 0) {
    if (store && c) await c.put(url, new Response('', { headers: { [MISSING]: '1' } })).catch(() => {});
    throw new Missing(url);
  }
  if (store && c) await c.put(url, new Response(blob, { headers: { 'content-type': blob.type || 'application/octet-stream' } }));
  return blob;
}

export async function hasTile(url) {
  const c = await tileCache();
  if (!c) return false;
  try { return !!(await c.match(url)); } catch { return false; }
}

// a small priority queue so the renderer's nearest tiles load first, a few at a time
export class Loader {
  constructor(concurrency = 6) {
    this.conc = concurrency;
    this.active = 0;
    this.waiting = [];
    this.online = true;
  }
  // fn: () => Promise; prio: lower first. Returns fn's promise.
  add(fn, prio = 0) {
    return new Promise((resolve, reject) => {
      this.waiting.push({ fn, prio, resolve, reject });
      this.pump();
    });
  }
  setPriority(pred, prioOf) {
    for (const w of this.waiting) if (pred(w)) w.prio = prioOf(w);
  }
  pump() {
    while (this.active < this.conc && this.waiting.length) {
      let bi = 0;
      for (let i = 1; i < this.waiting.length; i++) if (this.waiting[i].prio < this.waiting[bi].prio) bi = i;
      const job = this.waiting.splice(bi, 1)[0];
      this.active++;
      job.fn().then(job.resolve, job.reject).finally(() => { this.active--; this.pump(); });
    }
  }
  clear() {
    for (const w of this.waiting) w.reject(new Error('cancelled'));
    this.waiting = [];
  }
}

// decode an image blob → ImageBitmap (no colour management: elevation PNGs must keep their exact bytes)
export function bitmap(blob, raw = false) {
  return createImageBitmap(blob, raw ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : { imageOrientation: 'none' });
}

let scratch = null;
export function pixels(bmp) {
  const w = bmp.width, h = bmp.height;
  if (!scratch || scratch.width !== w || scratch.height !== h) {
    scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

// a bitmap shrunk to n×n pixels (RGBA bytes) — for average colours
export function shrink(bmp, n) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, n, n);
  return ctx.getImageData(0, 0, n, n).data;
}
