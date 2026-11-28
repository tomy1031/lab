// sw.js — offline cache for THE MATRIX: COSMOS
const BUILD = '104381827b5c';
const CACHE = `matrix-cosmos-${BUILD}`;
const PRECACHE = ["./","js/audio.js","js/hud3d.js","js/main.js","js/matrixEnv.js","js/realms/dimensions.js","js/realms/gravity.js","js/realms/lightspeed.js","js/realms/quantum.js","js/realms/strings.js","js/vendor/three.LICENSE","js/vendor/three.module.min.js","js/xrInput.js","manifest.webmanifest"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('matrix-cosmos-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
