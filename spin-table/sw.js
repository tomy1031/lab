// sw.js — offline cache for SPIN TABLE (tools/bundle.mjs fills in the build id and the file list)
const BUILD = '__BUILD__';
const CACHE = `spin-table-${BUILD}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('spin-table-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // the page itself: network first (a new build), the cache when offline
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => { const c = res.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); }
    return res;
  })));
});
