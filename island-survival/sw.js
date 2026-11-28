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
const BUILD = '36fd588b907e';
const PRECACHE = ["./","assets/companions/hana.vrm","assets/companions/seed-san.vrm","css/style.css","img/apple-touch-icon.png","img/icon-192.png","img/icon-512.png","img/icon-maskable-512.png","img/icon.svg","index.html","js/audio/engine.js","js/audio/sfx.js","js/companion/avatar.js","js/companion/body.js","js/companion/companion.js","js/companion/live.js","js/companion/memory.js","js/companion/mic.js","js/companion/plans.js","js/companion/talk.js","js/companion/voice.js","js/core/clock.js","js/core/events.js","js/core/game.js","js/core/input.js","js/core/rng.js","js/core/save.js","js/core/systems.js","js/data/achievements.js","js/data/buildings.js","js/data/climate.js","js/data/conditions.js","js/data/consult.js","js/data/crafted.js","js/data/events.js","js/data/fauna.js","js/data/fieldcraft.js","js/data/guide.js","js/data/handwork.js","js/data/items.js","js/data/lines.js","js/data/personas.js","js/data/professions.js","js/data/recipes.js","js/data/water.js","js/engine/renderer.js","js/gesture/hands.js","js/gesture/motion.js","js/gesture/pose.js","js/main.js","js/player/activity.js","js/player/butcher.js","js/player/combat.js","js/player/controller.js","js/player/fieldflows.js","js/player/handwork.js","js/player/interact.js","js/player/trapwork.js","js/player/viewmodel.js","js/pwa.js","js/sim/body.js","js/sim/building.js","js/sim/companion-sheet.js","js/sim/crafting.js","js/sim/events.js","js/sim/fires.js","js/sim/fishing.js","js/sim/inventory.js","js/sim/knowledge.js","js/sim/player.js","js/sim/resources.js","js/sim/score.js","js/sim/traps.js","js/sim/weather.js","js/ui/butcher-art.js","js/ui/common.js","js/ui/ctlguide.js","js/ui/dom.js","js/ui/handwork-art.js","js/ui/hud.js","js/ui/s-build.js","js/ui/s-companion.js","js/ui/s-craft.js","js/ui/s-gesture.js","js/ui/s-guide.js","js/ui/s-inventory.js","js/ui/s-journal.js","js/ui/s-loading.js","js/ui/s-map.js","js/ui/s-pause.js","js/ui/s-result.js","js/ui/s-setup.js","js/ui/s-sleep.js","js/ui/s-title.js","js/ui/screens.js","js/ui/trap-art.js","js/vr/guide.js","js/vr/guiderows.js","js/vr/locomotion.js","js/vr/vrui.js","js/vr/xr.js","js/world/fauna.js","js/world/fire.js","js/world/flora/builders.js","js/world/flora/carpet.js","js/world/flora/geo.js","js/world/flora.js","js/world/landmarks.js","js/world/nodes.js","js/world/ocean.js","js/world/placement.js","js/world/rainfx.js","js/world/sky.js","js/world/structures.js","js/world/terrain.js","js/world/world.js","manifest.webmanifest","vendor/three/build/three.core.js","vendor/three/build/three.module.js","vendor/three/examples/jsm/loaders/GLTFLoader.js","vendor/three/examples/jsm/objects/Sky.js","vendor/three/examples/jsm/utils/BufferGeometryUtils.js","vendor/three/examples/jsm/utils/SkeletonUtils.js","vendor/three-vrm/three-vrm.module.js"];
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
