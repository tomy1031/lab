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
const BUILD = '51d6e6ba8e14';
const PRECACHE = ["./","img/apple-touch-icon.png","img/icon-192.png","img/icon-512.png","img/icon-maskable-512.png","manifest.webmanifest","v/51d6e6ba8e14/js/audio/ambience.js","v/51d6e6ba8e14/js/audio/index.js","v/51d6e6ba8e14/js/audio/sfx.js","v/51d6e6ba8e14/js/audio/stingers.js","v/51d6e6ba8e14/js/audio/synth.js","v/51d6e6ba8e14/js/core/config.js","v/51d6e6ba8e14/js/core/debug.js","v/51d6e6ba8e14/js/core/events.js","v/51d6e6ba8e14/js/core/gems.js","v/51d6e6ba8e14/js/core/geo.js","v/51d6e6ba8e14/js/core/grips.js","v/51d6e6ba8e14/js/core/input.js","v/51d6e6ba8e14/js/core/landing.js","v/51d6e6ba8e14/js/core/loop.js","v/51d6e6ba8e14/js/core/registry.js","v/51d6e6ba8e14/js/core/renderer.js","v/51d6e6ba8e14/js/core/rng.js","v/51d6e6ba8e14/js/core/settings.js","v/51d6e6ba8e14/js/core/stubs.js","v/51d6e6ba8e14/js/core/util.js","v/51d6e6ba8e14/js/core/warm.js","v/51d6e6ba8e14/js/core/xr.js","v/51d6e6ba8e14/js/game/boss.js","v/51d6e6ba8e14/js/game/bot.js","v/51d6e6ba8e14/js/game/checkpoints.js","v/51d6e6ba8e14/js/game/drill.js","v/51d6e6ba8e14/js/game/encounters.js","v/51d6e6ba8e14/js/game/enemies.data.js","v/51d6e6ba8e14/js/game/enemies.js","v/51d6e6ba8e14/js/game/enemyModels.js","v/51d6e6ba8e14/js/game/index.js","v/51d6e6ba8e14/js/game/inventory.js","v/51d6e6ba8e14/js/game/itemInfo.js","v/51d6e6ba8e14/js/game/npcs.data.js","v/51d6e6ba8e14/js/game/npcs.js","v/51d6e6ba8e14/js/game/pickups.js","v/51d6e6ba8e14/js/game/props.js","v/51d6e6ba8e14/js/game/quest.js","v/51d6e6ba8e14/js/game/safezones.js","v/51d6e6ba8e14/js/game/save.js","v/51d6e6ba8e14/js/game/seeds.js","v/51d6e6ba8e14/js/game/shrines.js","v/51d6e6ba8e14/js/game/stats.js","v/51d6e6ba8e14/js/game/telegraph.js","v/51d6e6ba8e14/js/game/towers.js","v/51d6e6ba8e14/js/game/util.js","v/51d6e6ba8e14/js/game/vitals.js","v/51d6e6ba8e14/js/items/bomb.js","v/51d6e6ba8e14/js/items/bow.js","v/51d6e6ba8e14/js/items/defs.js","v/51d6e6ba8e14/js/items/flask.js","v/51d6e6ba8e14/js/items/food.js","v/51d6e6ba8e14/js/items/index.js","v/51d6e6ba8e14/js/items/melee.js","v/51d6e6ba8e14/js/items/models.js","v/51d6e6ba8e14/js/items/projectiles.js","v/51d6e6ba8e14/js/items/radiance.js","v/51d6e6ba8e14/js/items/shield.js","v/51d6e6ba8e14/js/items/torch.js","v/51d6e6ba8e14/js/items/waybell.js","v/51d6e6ba8e14/js/items/windfan.js","v/51d6e6ba8e14/js/main.js","v/51d6e6ba8e14/js/player/body.js","v/51d6e6ba8e14/js/player/climb.js","v/51d6e6ba8e14/js/player/comfort.js","v/51d6e6ba8e14/js/player/desktop.js","v/51d6e6ba8e14/js/player/gestures.js","v/51d6e6ba8e14/js/player/glide.js","v/51d6e6ba8e14/js/player/grab.js","v/51d6e6ba8e14/js/player/handrig.js","v/51d6e6ba8e14/js/player/hands.js","v/51d6e6ba8e14/js/player/holsters.js","v/51d6e6ba8e14/js/player/index.js","v/51d6e6ba8e14/js/player/locomotion.js","v/51d6e6ba8e14/js/player/steps.js","v/51d6e6ba8e14/js/pwa.js","v/51d6e6ba8e14/js/ui/combat.js","v/51d6e6ba8e14/js/ui/hud.js","v/51d6e6ba8e14/js/ui/icons.js","v/51d6e6ba8e14/js/ui/index.js","v/51d6e6ba8e14/js/ui/labels.js","v/51d6e6ba8e14/js/ui/map.js","v/51d6e6ba8e14/js/ui/overlay.js","v/51d6e6ba8e14/js/ui/talk.js","v/51d6e6ba8e14/js/ui/text.js","v/51d6e6ba8e14/js/ui/tutorial.js","v/51d6e6ba8e14/js/ui/wrist.js","v/51d6e6ba8e14/js/world/art.js","v/51d6e6ba8e14/js/world/biomes.js","v/51d6e6ba8e14/js/world/climb.js","v/51d6e6ba8e14/js/world/collide.js","v/51d6e6ba8e14/js/world/flora.js","v/51d6e6ba8e14/js/world/folk.js","v/51d6e6ba8e14/js/world/fx.js","v/51d6e6ba8e14/js/world/geo.js","v/51d6e6ba8e14/js/world/grass.js","v/51d6e6ba8e14/js/world/heightfield.js","v/51d6e6ba8e14/js/world/index.js","v/51d6e6ba8e14/js/world/landmarks/camps.js","v/51d6e6ba8e14/js/world/landmarks/common.js","v/51d6e6ba8e14/js/world/landmarks/index.js","v/51d6e6ba8e14/js/world/landmarks/ruins.js","v/51d6e6ba8e14/js/world/landmarks/shrines.js","v/51d6e6ba8e14/js/world/landmarks/skyanchor.js","v/51d6e6ba8e14/js/world/landmarks/towers.js","v/51d6e6ba8e14/js/world/layout.js","v/51d6e6ba8e14/js/world/life.js","v/51d6e6ba8e14/js/world/map.js","v/51d6e6ba8e14/js/world/noise.js","v/51d6e6ba8e14/js/world/palette.js","v/51d6e6ba8e14/js/world/props.js","v/51d6e6ba8e14/js/world/sky.js","v/51d6e6ba8e14/js/world/spawns.js","v/51d6e6ba8e14/js/world/terrain.js","v/51d6e6ba8e14/js/world/water.js","https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js","https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.core.js","https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/left.glb","https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/right.glb"];
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
