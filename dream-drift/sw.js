// sw.js — keeps DREAM DRIFT playable with no network once it has been opened (PWA, also in a Quest headset).
// This file in the repository is a template: tools/bundle.mjs fills in BUILD (a content hash of the build),
// HANDS (a content hash of the hand-gesture pack) and PRECACHE (every file of the build except that pack) when
// publishing, and the page registers it only in such a build (window.DD_BUILD).
//
// - Install: every file of the game is downloaded into a cache named after the build (three.js is bundled in
//   vendor/three, the music and sounds are generated).
// - Fetch: the game's own files come from that cache first.
//   The hand-gesture pack (vendor/mediapipe, ~19 MB) is cached the first time it is used, or with
//   「ハンドジェスチャーも オフライン用に 保存」 in the settings; it is kept across builds while it is unchanged.
//   The web font (Google Fonts) and the VR controller models (jsDelivr) are cached as they are used; on a
//   VR-capable browser the page asks for the Quest controller models right away. Without the font the system's
//   round font is used.
// - Update: a new build installs in the background; the title screen offers 「新しい バージョンに 更新」 and then
//   tells this worker to take over (SKIP_WAITING). Old caches are deleted when the new one activates.
const BUILD = '__BUILD__';
const HANDS = '__HANDS__';
const PRECACHE = __PRECACHE__;
const CACHE = `dream-drift-${BUILD}`;
const HANDS_CACHE = `dream-drift-hands-${HANDS}`;
const CDN_CACHE = 'dream-drift-cdn';
const CDN_HOSTS = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/;
const PROFILES = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/';
// the controller models XRControllerModelFactory loads on Quest 3 (Touch Plus), Quest 2 (Touch v3) and Quest Pro
const VR_FILES = [PROFILES + 'profilesList.json',
  ...['meta-quest-touch-plus', 'oculus-touch-v3', 'meta-quest-touch-pro'].flatMap((id) => ['profile.json', 'left.glb', 'right.glb'].map((f) => `${PROFILES}${id}/${f}`))];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting(); // first install: nothing to replace
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE, HANDS_CACHE, CDN_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith('dream-drift-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  else if (e.data?.type === 'CACHE_HANDS') e.waitUntil(store(HANDS_CACHE, (e.data.urls || []).map((u) => new URL(u, self.registration.scope).href), e.source, 'hands'));
  else if (e.data?.type === 'CACHE_VR') e.waitUntil(store(CDN_CACHE, VR_FILES, e.source, 'vr'));
});

// fetch and keep the files that are not stored yet, telling the page how far it got
async function store(name, urls, client, pack) {
  const cache = await caches.open(name);
  let done = 0, tried = 0;
  for (const u of urls) {
    tried++;
    try {
      if (!(await cache.match(u))) {
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if (!res.ok) throw new Error(`${res.status}`);
        await cache.put(u, res);
      }
      done++;
    } catch (err) { /* offline or failed: try again another time */ }
    client?.postMessage({ type: 'CACHE_PROGRESS', pack, done, total: urls.length, finished: tried === urls.length });
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (CDN_HOSTS.test(url.hostname)) e.respondWith(cacheFirst(req, CDN_CACHE).catch(() => Response.error()));
    return; // anything else: straight to the network
  }
  if (url.pathname.includes('/vendor/mediapipe/')) {
    e.respondWith(cacheFirst(new Request(url.origin + url.pathname), HANDS_CACHE).catch(() => Response.error()));
    return;
  }
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
