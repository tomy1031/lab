// sw.js — makes AETHERWALK playable offline and keeps it up to date (installable PWA).
// tools/build.mjs fills in BUILD (a content hash) and PRECACHE (every file of that build, plus three.js
// and its addons from the CDN) when publishing; the copy in the repository is only a template and is
// never registered from a dev server (js/pwa.js checks for version.json first).
//
// - The page itself (index.html, version.json) is fetched from the network first, so a reload always
//   gets the newest build; the cached copy is used offline.
// - Code and fonts live under v/<BUILD>/…, a new folder per build, so they are cached forever and never
//   stale. three.js comes from a versioned CDN URL and is cached the same way.
// - Everything is downloaded when the worker installs, so after one online visit the app works offline.
// - A new build installs in the background; the page offers an update and then tells this worker to
//   take over (SKIP_WAITING).
const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const CACHE = `aetherwalk-${BUILD}`;
const RUNTIME = 'aetherwalk-runtime';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE, RUNTIME]);
    for (const k of await caches.keys()) if (k.startsWith('aetherwalk-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  // the page asks how much of this build is stored, to show "OFFLINE READY"
  if (e.data === 'STATUS' && e.ports[0]) {
    caches.open(CACHE).then(async (c) => {
      let cached = 0;
      for (const u of PRECACHE) if (await c.match(u)) cached++;
      e.ports[0].postMessage({ build: BUILD, cached, total: PRECACHE.length });
    });
  }
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

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || url.pathname.endsWith('/version.json') || url.pathname.endsWith('/index.html')) {
    e.respondWith(networkFirst(req));
  } else if ((url.origin === location.origin && url.pathname.includes('/v/')) || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(req));
  } else if (url.origin === location.origin) {
    // icons and the manifest: serve what we have, refresh it in the background
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
      return hit || net;
    })());
  }
});
