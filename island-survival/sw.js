// sw.js — keeps ひとつだけ島 playable with no network once it has been opened (PWA, also in a VR headset).
// This file in the repository is a template: tools/bundle.mjs fills in BUILD (a content hash) and PRECACHE
// (every file of that build except the optional hand-gesture pack) when publishing, and the page registers it
// only in such a build (window.ISLE_BUILD).
//
// - Install: every file of the game is downloaded into a cache named after the build (three.js, three-vrm and
//   the companions' VRM models included).
// - Fetch: the game's own files come from that cache first. The hand-gesture pack (vendor/mediapipe, ~19 MB)
//   is cached the first time it is used (or with 「手の 認識も オフライン用に 保存」 in the settings).
//   Web fonts are cached after the first online visit (the system round fonts are the offline fallback).
//   Gemini Live (the voice talk) needs the network and is never cached.
// - Update: a new build installs in the background; the page offers 「新しい バージョンに 更新」 and then tells
//   this worker to take over (SKIP_WAITING). Old caches are deleted when the new one activates.
const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const CACHE = `hitotsu-island-${BUILD}`;
const EXTRA = 'hitotsu-island-extra';   // the hand-gesture pack and web fonts: kept across builds

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting(); // first install: nothing to replace
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('hitotsu-island-') && k !== CACHE && k !== EXTRA) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CACHE_EXTRA') e.waitUntil(cacheExtra(e.data.urls || [], e.source));
});

async function cacheExtra(urls, client) {
  const cache = await caches.open(EXTRA);
  let done = 0;
  for (const u of urls) {
    try { if (!(await cache.match(u))) await cache.add(new Request(u, { cache: 'reload' })); done++; } catch (err) { /* offline: try again later */ }
    client?.postMessage({ type: 'CACHE_EXTRA_PROGRESS', done, total: urls.length });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return; // Gemini Live and anything else: straight to the network
  const extra = fonts || url.pathname.includes('/vendor/mediapipe/');
  e.respondWith((async () => {
    if (extra) {
      const cache = await caches.open(EXTRA);
      const hit = await cache.match(req, { ignoreSearch: !fonts });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) { return Response.error(); }
    }
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
