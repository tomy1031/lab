// sw.js — keeps ことばタウン usable with no network once it has been opened (PWA, also in a Quest headset).
// This file in the repository is a template: tools/bundle.mjs fills in BUILD (a content hash) and PRECACHE (every
// file of the build except the recorded voices) when publishing, and the page registers it only in such a build
// (window.KT_BUILD).
//
// - Install: the town, the scenes, the lessons and the code are downloaded into a cache named after the build
//   (three.js is bundled in js/vendor/three).
// - Fetch: those files come from that cache first.
//   The recorded NPC voices (audio/voice/*.mp3, ~37 MB in all) are stored as they are played, or all at once with
//   「こえも ぜんぶ ほぞん」 in the settings. The page asks for them as audio/voice/<line>.mp3?v=<hash of the
//   recording>, so a re-recorded line gets a new address; they are kept across builds, and recordings that are no
//   longer in the build's audio/voice/index.json are deleted when a new build activates.
//   The web font (Google Fonts) and the VR controller models (jsDelivr) are cached as they are used; on a
//   VR-capable browser the page asks for the Quest controller models right away.
//   Gemini Live (the conversation partner and the judge) needs the network and is never cached: offline, the
//   scenes run as the offline practice (read a model answer aloud and tap it).
// - Update: a new build installs in the background; the start page offers 「新しい バージョンに 更新」 and then tells
//   this worker to take over (SKIP_WAITING). Old caches are deleted when the new one activates.
const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const CACHE = `kotoba-town-${BUILD}`;
const VOICE_CACHE = 'kotoba-town-voice';
const CDN_CACHE = 'kotoba-town-cdn';
const CDN_HOSTS = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/;
const PROFILES = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/';
// the controller models XRControllerModelFactory loads on Quest 3 (Touch Plus), Quest 2 (Touch v3) and Quest Pro
const VR_FILES = [PROFILES + 'profilesList.json',
  ...['meta-quest-touch-plus', 'oculus-touch-v3', 'meta-quest-touch-pro'].flatMap((id) => ['profile.json', 'left.glb', 'right.glb'].map((f) => `${PROFILES}${id}/${f}`))];

const scoped = (u) => new URL(u, self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting(); // first install: nothing to replace
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE, VOICE_CACHE, CDN_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith('kotoba-town-') && !keep.has(k)) await caches.delete(k);
    // drop recordings this build no longer uses (re-recorded or removed lines)
    const wanted = new Set(await voiceUrls());
    if (wanted.size) { // (an unreadable index keeps everything)
      const voices = await caches.open(VOICE_CACHE);
      for (const req of await voices.keys()) if (!wanted.has(req.url)) await voices.delete(req);
    }
    await self.clients.claim();
  })());
});

/** every recorded line of this build, as the page asks for it: audio/voice/<id>.mp3?v=<hash> */
async function voiceUrls() {
  try {
    const res = await (await caches.open(CACHE)).match(scoped('audio/voice/index.json'));
    const index = res ? await res.json() : {};
    return Object.entries(index).map(([id, v]) => scoped(`audio/voice/${id}.mp3?v=${v.h}`));
  } catch { return []; }
}

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  else if (e.data?.type === 'CACHE_VOICES') e.waitUntil(voiceUrls().then((urls) => store(VOICE_CACHE, urls, e.source, 'voices', 6)));
  else if (e.data?.type === 'CACHE_VR') e.waitUntil(store(CDN_CACHE, VR_FILES, e.source, 'vr', 2));
});

// fetch and keep the files that are not stored yet (a few at a time), telling the page how far it got
async function store(name, urls, client, pack, parallel) {
  const cache = await caches.open(name);
  let done = 0, tried = 0, next = 0, last = 0;
  const report = (force) => {
    if (!force && Date.now() - last < 250) return;
    last = Date.now();
    client?.postMessage({ type: 'CACHE_PROGRESS', pack, done, total: urls.length, finished: tried === urls.length });
  };
  const worker = async () => {
    while (next < urls.length) {
      const u = urls[next++];
      try {
        if (!(await cache.match(u))) {
          const res = await fetch(new Request(u, { cache: 'reload' }));
          if (!res.ok) throw new Error(`${res.status}`);
          await cache.put(u, res);
        }
        done++;
      } catch (err) { /* offline or failed: try again another time */ }
      tried++;
      report(tried === urls.length);
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  if (!urls.length) report(true);
}

async function cacheFirst(req, name, key = req) {
  const cache = await caches.open(name);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(key, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (CDN_HOSTS.test(url.hostname)) e.respondWith(cacheFirst(req, CDN_CACHE).catch(() => Response.error()));
    return; // Gemini Live and anything else: straight to the network
  }
  if (/\/audio\/voice\/.+\.mp3$/.test(url.pathname)) {
    // a recording: stored under its full address (the ?v= hash names the recording)
    e.respondWith(cacheFirst(new Request(url.href), VOICE_CACHE, url.href).catch(() => Response.error()));
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
