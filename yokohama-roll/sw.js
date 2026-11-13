// sw.js — keeps ハマころ！ up to date and playable offline once installed (PWA).
// site/build.mjs fills in BUILD (a content hash) and PRECACHE (every file of that build) when publishing;
// the copy in the repository is only a template and is never registered from a dev server.
//
// - The page itself (index.html, version.json) is always fetched from the network first, so a reload
//   always gets the newest build; the cached copy is only used offline.
// - Code and data live under v/<BUILD>/…, a new folder per build, so they can be cached forever without
//   ever being stale.
// - A new build installs in the background; the page asks the player to update (or updates on the title
//   screen) and then tells this worker to take over (SKIP_WAITING).
const BUILD = '538fc54fb0b0';
const PRECACHE = ["./","img/apple-touch-icon.png","img/ceo_face.webp","img/ceo_stand.webp","img/icon-192.png","img/icon-512.png","img/icon-maskable-512.png","manifest.webmanifest","v/538fc54fb0b0/js/audio.js","v/538fc54fb0b0/js/ceo.js","v/538fc54fb0b0/js/engine/globe.js","v/538fc54fb0b0/js/engine/itemViewer.js","v/538fc54fb0b0/js/engine/kanto.js","v/538fc54fb0b0/js/engine/minimap.js","v/538fc54fb0b0/js/engine/objects.js","v/538fc54fb0b0/js/engine/town.js","v/538fc54fb0b0/js/geo.js","v/538fc54fb0b0/js/kanto_map.js","v/538fc54fb0b0/js/main.js","v/538fc54fb0b0/js/map.js","v/538fc54fb0b0/js/material.js","v/538fc54fb0b0/js/models/kanto.js","v/538fc54fb0b0/js/models/town_big.js","v/538fc54fb0b0/js/models/town_mid.js","v/538fc54fb0b0/js/models/town_small.js","v/538fc54fb0b0/js/models/world.js","v/538fc54fb0b0/js/pusher.js","v/538fc54fb0b0/js/quality.js","v/538fc54fb0b0/js/vendor/nexmax.js","v/538fc54fb0b0/js/vr.js"];
const CACHE = `hamakoro-${BUILD}`;
const RUNTIME = 'hamakoro-runtime'; // three.js and fonts from their CDNs (versioned URLs)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE, RUNTIME]);
    for (const k of await caches.keys()) if (k.startsWith('hamakoro-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || url.pathname.endsWith('/version.json') || url.pathname.endsWith('/index.html')) {
    e.respondWith(networkFirst(req));
  } else if (url.origin === location.origin && url.pathname.includes('/v/')) {
    e.respondWith(cacheFirst(req, CACHE));
  } else if (/^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
    e.respondWith(cacheFirst(req, RUNTIME));
  } else if (url.origin === location.origin) {
    // icons, sprites, manifest: serve what we have, refresh it in the background
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
