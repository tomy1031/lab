// js/pwa.js — the page side of offline play: registers the service worker (only in a published build),
// reports when everything needed offline is stored, and offers an update when a new build is out.
// Dependency-free. The build id comes from the inline script tools/build.mjs writes (window.AW_BUILD).
//
// Usage from the game:  const pwa = initPWA({ onStatus, onUpdate, onInstallable });
// The returned api is also exposed as window.__pwa (the offline test drives the update through it).

export function initPWA({ onStatus = () => {}, onUpdate = () => {}, onInstallable = () => {} } = {}) {
  const build = window.AW_BUILD || null;
  const api = { build, supported: false, check: async () => false, apply: () => location.reload(), install: null };
  window.__pwa = api;

  // "Install app" button support (Chromium browsers only)
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    api.install = async () => {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      api.install = null;
      onInstallable(false);
    };
    onInstallable(true);
  });

  // dev server (no build) → no service worker: a cached copy would hide edits
  if (!build || !('serviceWorker' in navigator)) return api;
  fetch('version.json', { cache: 'no-store' }).then((r) => {
    if (!r.ok) return;
    api.supported = true;
    register();
  }).catch(() => {});

  let reg = null, applying = false;
  function register() {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (applying) location.reload(); });
    navigator.serviceWorker.register('sw.js').then((r) => {
      reg = r;
      status();
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdate(true); });
      });
    }).catch(() => onStatus({ state: 'error' }));
  }

  // how much of this build is stored: the worker counts its precache list
  async function status() {
    try {
      const r = await navigator.serviceWorker.ready;
      const w = r.active;
      if (!w) return;
      const res = await new Promise((resolve, reject) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data);
        w.postMessage('STATUS', [ch.port2]);
        setTimeout(() => reject(new Error('timeout')), 4000);
      });
      const ready = res.build === build && res.cached >= res.total;
      onStatus({ state: ready ? 'ready' : 'caching', ...res });
      if (!ready) setTimeout(status, 1500);
    } catch { setTimeout(status, 3000); }
  }

  // is a newer build published? (version.json is always fetched from the network)
  api.check = async () => {
    if (!navigator.onLine) return false;
    try {
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      const v = await res.json();
      if (v.build && v.build !== build) {
        if (reg) reg.update().catch(() => {});
        onUpdate(true);
        return true;
      }
    } catch { /* offline or not published */ }
    return false;
  };
  // switch to the new build: let a waiting worker take over, then reload
  api.apply = () => {
    applying = true;
    const w = reg && reg.waiting;
    if (w) { w.postMessage('SKIP_WAITING'); setTimeout(() => location.reload(), 3000); }
    else location.reload();
  };
  api.check();
  setInterval(api.check, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') api.check(); });
  window.addEventListener('online', () => { api.check(); status(); });
  return api;
}
