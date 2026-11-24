// sw.js — keeps SKY ATLAS itself (the page, the code, three.js) available with no network (PWA).
// This file in the repository is a template: tools/bundle.mjs fills in BUILD (a content hash) and PRECACHE
// (every file of that build) when publishing, and the page registers it only in such a build.
//
// The map data is NOT handled here: the game keeps downloaded areas in its own store ("sky-atlas-tiles-v1",
// see js/tiles.js) and reads it directly, so updating the game never deletes your downloads.
const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const CACHE = `sky-atlas-app-${BUILD}`;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting(); // first install: nothing to replace
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('sky-atlas-app-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = req.mode === 'navigate'
      ? (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./'))
      : await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      return (req.mode === 'navigate' && (await cache.match('./'))) || Response.error();
    }
  })());
});
