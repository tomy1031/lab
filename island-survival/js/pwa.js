// pwa.js — offline play (DESIGN: PWA). Registers the service worker in a published build (window.ISLE_BUILD set
// by tools/bundle.mjs), shows 「オフラインで 遊べます」 once the files are cached, offers 「新しい バージョンに
// 更新」 when a new build is waiting, and can store the hand-gesture pack for offline use.
const EXTRA = ['vendor/mediapipe/vision_bundle.mjs', 'vendor/mediapipe/wasm/vision_wasm_internal.js', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm', 'vendor/mediapipe/hand_landmarker.task'];

export const pwa = {
  supported: 'serviceWorker' in navigator && !!window.ISLE_BUILD,
  build: window.ISLE_BUILD || null,
  ready: false, waiting: null, reg: null, extraDone: 0,
  listeners: new Set(),
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(type, data) { for (const fn of this.listeners) { try { fn(type, data); } catch (e) { /* ignore */ } } },
  get online() { return navigator.onLine !== false; },

  async register() {
    if (!this.supported) return null;
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      this.reg = reg;
      const watch = (w) => w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { this.waiting = w; this.emit('update', {}); }
        if (w.state === 'activated') this.markReady();
      });
      if (reg.waiting && navigator.serviceWorker.controller) { this.waiting = reg.waiting; this.emit('update', {}); }
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      navigator.serviceWorker.ready.then(() => this.markReady());
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (this.updating && !reloading) { reloading = true; location.reload(); } });
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'CACHE_EXTRA_PROGRESS') { this.extraDone = e.data.done; this.emit('extra', e.data); } });
      // look for a new build now and then (a headset can stay open for days)
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      return reg;
    } catch (e) { console.warn('service worker', e); return null; }
  },
  markReady() { if (!this.ready) { this.ready = true; this.emit('ready', {}); } },
  /** take the waiting build now (the page reloads) */
  update() { if (!this.waiting) return; this.updating = true; this.waiting.postMessage('SKIP_WAITING'); },
  /** keep the hand-gesture pack (~19 MB) for offline use */
  async cacheHands() {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.active) return false;
    const urls = EXTRA.map((u) => new URL(u, location.href).href);
    reg.active.postMessage({ type: 'CACHE_EXTRA', urls });
    return true;
  },
  async handsCached() {
    try { const c = await caches.open('hitotsu-island-extra'); const hits = await Promise.all(EXTRA.map((u) => c.match(new URL(u, location.href).href))); return hits.every(Boolean); } catch { return false; }
  },
};
