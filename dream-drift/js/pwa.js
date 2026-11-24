// js/pwa.js — offline play (PWA). In a published build (window.DD_BUILD, set by tools/bundle.mjs) it registers the
// service worker, shows 「オフラインでも あそべます」 on the title once every file is stored, offers 「新しい バージョンに
// 更新」 when a new build is waiting, and stores the hand-gesture pack (~19 MB) for offline use from the settings
// (it is also stored by itself the first time the camera is used). On a VR-capable browser it asks the worker for
// the Quest controller models too. On a dev server (no build id) it does nothing, so the code is always fresh there.
const HAND_FILES = ['vendor/mediapipe/vision_bundle.mjs', 'vendor/mediapipe/wasm/vision_wasm_internal.js', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm', 'vendor/mediapipe/hand_landmarker.task'];
const build = window.DD_BUILD || null;
const $ = (id) => document.getElementById(id);

const pwa = (window.DD_PWA = {
  build, supported: 'serviceWorker' in navigator && !!build, ready: false, waiting: null,
  /** are all the hand-gesture files in the worker's cache? */
  async handsCached() {
    try {
      const k = (await caches.keys()).find((x) => x.startsWith('dream-drift-hands-'));
      if (!k) return false;
      const c = await caches.open(k);
      const hits = await Promise.all(HAND_FILES.map((f) => c.match(new URL(f, location.href).href)));
      return hits.every(Boolean);
    } catch { return false; }
  },
  /** ask the worker to store the hand-gesture pack (progress comes back as CACHE_PROGRESS messages) */
  async cacheHands() {
    const reg = await navigator.serviceWorker.ready;
    reg.active.postMessage({ type: 'CACHE_HANDS', urls: HAND_FILES });
  },
});

function title(text, ok = false) {
  $('offline').classList.remove('hidden');
  $('offline-text').textContent = (ok ? '✓ ' : '') + text;
}

async function refreshHands(progress) {
  const box = $('offline-set'), txt = $('hands-offline-text'), btn = $('hands-save');
  if (!box) return;
  box.classList.remove('hidden');
  if (progress && !progress.finished) {
    txt.textContent = `ハンドジェスチャーを 保存中… ${progress.done} / ${progress.total}`;
    btn.classList.add('hidden');
    return;
  }
  const ok = await pwa.handsCached();
  txt.textContent = ok ? '✓ ハンドジェスチャーも オフラインで 使えます'
    : progress ? 'ハンドジェスチャーを 保存できませんでした。ネットに つながって いる ときに もう一度 どうぞ'
      : 'ハンドジェスチャー（カメラ）は まだ 保存されて いません。一度 使うと 自動で 保存されます';
  btn.classList.toggle('hidden', ok);
  btn.disabled = navigator.onLine === false;
}

if (pwa.supported) {
  title('オフライン用に 保存中…');
  let updating = false;
  const offerUpdate = (w) => {
    pwa.waiting = w;
    const b = $('update-btn');
    b.classList.remove('hidden');
    b.onclick = () => { updating = true; b.disabled = true; b.textContent = '更新中…'; w.postMessage('SKIP_WAITING'); };
  };
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const watch = (w) => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
    });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // a headset can stay open for days: look for a new build now and then
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => title(`オフライン用の 保存に 失敗しました（${e.message}）`));
  navigator.serviceWorker.ready.then((reg) => {
    pwa.ready = true;
    title(`オフラインでも あそべます（版 ${build.slice(0, 7)}）`, true);
    refreshHands();
    navigator.xr?.isSessionSupported?.('immersive-vr').then((vr) => { if (vr) reg.active?.postMessage({ type: 'CACHE_VR' }); }).catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'CACHE_PROGRESS' && e.data.pack === 'hands') refreshHands(e.data); });
  $('hands-save')?.addEventListener('click', () => { pwa.cacheHands(); refreshHands({ done: 0, total: HAND_FILES.length, finished: false }); });
  addEventListener('online', () => refreshHands());
  addEventListener('offline', () => refreshHands());
}
