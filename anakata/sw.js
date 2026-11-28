// sw.js — keeps ANAKATA playable with no network once it has been opened (PWA).
// This file in the repository is a template: tools/bundle.mjs fills in BUILD (a content hash) and PRECACHE
// (every file of that build) when publishing, and the page registers it only in such a build.
//
// - Install: every file of the game is downloaded into a cache named after the build (three.js included,
//   every sound is generated, so nothing else is ever needed).
// - Fetch: answer from that cache first — instant start, also in a headset with no Wi-Fi.
// - Update: a new build installs in the background; the page offers 「更新する」 and then tells
//   this worker to take over (SKIP_WAITING). Old caches are deleted when the new one activates.
const BUILD = '84a29673f9d6';
const PRECACHE = ["./","img/apple-touch-icon.png","img/icon-192.png","img/icon-512.png","img/icon-maskable-512.png","index.html","js/audio.js","js/chapters/base.js","js/chapters/draw4.js","js/chapters/flatland.js","js/chapters/gravity.js","js/chapters/hub.js","js/chapters/ladder.js","js/chapters/rig4.js","js/chapters/shadows.js","js/chapters/slices.js","js/chapters/tesseract.js","js/env.js","js/guide.js","js/input.js","js/main.js","js/math4.js","js/tubes.js","js/ui.js","js/vendor/three.module.min.js","js/widgets.js","manifest.webmanifest"];
const CACHE = `anakata-${BUILD}`;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting(); // first install: nothing to replace
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('anakata-') && k !== CACHE) await caches.delete(k);
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
