// sw.js — makes STAR WEAVER playable offline and keeps it up to date (installable PWA).
// tools/build.mjs fills in BUILD (a content hash) and PRECACHE (every file of that build, plus three.js
// from the CDN) when publishing; the copy in the repository is only a template and is never registered
// from a dev server.
//
// - The page itself (index.html, version.json) is fetched from the network first, so a reload always
//   gets the newest build; the cached copy is used offline.
// - Code and fonts live under v/<BUILD>/…, a new folder per build, so they are cached forever and never
//   stale. three.js comes from a versioned CDN URL and is cached the same way.
// - Everything is downloaded when the worker installs, so after one online visit the app works offline.
// - A new build installs in the background; the page offers an update and then tells this worker to
//   take over (SKIP_WAITING).
const BUILD = '863176be4610';
const PRECACHE = ["./","img/apple-touch-icon.png","img/icon-192.png","img/icon-512.png","img/icon-maskable-512.png","manifest.webmanifest","v/863176be4610/fonts/fonts.css","v/863176be4610/fonts/Outfit.woff2","v/863176be4610/fonts/ZenKakuGothicNew-400.woff2","v/863176be4610/fonts/ZenKakuGothicNew-500.woff2","v/863176be4610/fonts/ZenKakuGothicNew-700.woff2","v/863176be4610/fonts/ZenKakuGothicNew-900.woff2","v/863176be4610/js/audio.js","v/863176be4610/js/body.js","v/863176be4610/js/chart.js","v/863176be4610/js/coach.js","v/863176be4610/js/desktop.js","v/863176be4610/js/entities.js","v/863176be4610/js/fx.js","v/863176be4610/js/game.js","v/863176be4610/js/gfx.js","v/863176be4610/js/glyphs.js","v/863176be4610/js/handvis.js","v/863176be4610/js/input.js","v/863176be4610/js/main.js","v/863176be4610/js/palette.js","v/863176be4610/js/pwa.js","v/863176be4610/js/screens.js","v/863176be4610/js/store.js","v/863176be4610/js/text.js","v/863176be4610/js/theme.js","v/863176be4610/js/timeline.js","v/863176be4610/js/tutorial.js","v/863176be4610/js/ui.js","v/863176be4610/js/util.js","v/863176be4610/js/world.js","https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js","https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.core.js"];
const CACHE = `starweaver-${BUILD}`;
const RUNTIME = 'starweaver-runtime';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE, RUNTIME]);
    for (const k of await caches.keys()) if (k.startsWith('starweaver-') && !keep.has(k)) await caches.delete(k);
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
