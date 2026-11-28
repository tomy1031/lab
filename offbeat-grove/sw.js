// sw.js — keeps OFFBEAT GROVE playable with no network once it has been opened (PWA).
// This file in the repository is a template: tools/bundle.mjs fills in BUILD (a content hash) and PRECACHE
// (every file of that build) when publishing, and the page registers it only in such a build.
//
// - Install: every file of the game is downloaded into a cache named after the build (three.js included,
//   the music is generated, so nothing else is ever needed).
// - Fetch: answer from that cache first — instant start, also in a headset with no Wi-Fi.
// - Update: a new build installs in the background; the page offers "新しいバージョンに更新" and then tells
//   this worker to take over (SKIP_WAITING). Old caches are deleted when the new one activates.
const BUILD = 'e876c74285f6';
const PRECACHE = ["./","img/apple-touch-icon.png","img/icon-192.png","img/icon-512.png","img/icon-maskable-512.png","index.html","js/audio.js","js/autosync.js","js/beat.js","js/chart.js","js/dom.js","js/fx.js","js/game.js","js/gloves.js","js/lane.js","js/main.js","js/player.js","js/sky.js","js/songs.js","js/store.js","js/synth.js","js/targets.js","js/util.js","js/vendor/three.module.min.js","js/vrui.js","js/world.js","js/youtube.js","manifest.webmanifest"];
const CACHE = `offbeat-grove-${BUILD}`;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting(); // first install: nothing to replace
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('offbeat-grove-') && k !== CACHE) await caches.delete(k);
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
