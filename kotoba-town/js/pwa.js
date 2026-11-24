// js/pwa.js — offline use (PWA). In a published build (window.KT_BUILD, set by tools/bundle.mjs) it registers the
// service worker, shows 「オフラインでも れんしゅう できます」 on the start page once the town is stored, offers
// 「新しい バージョンに 更新」 when a new build is waiting, and stores every recorded voice (~37 MB) from the settings
// (lines are also stored one by one as they are played). On a VR-capable browser it asks the worker for the Quest
// controller models too. On a dev server (no build id) it does nothing, so the code is always fresh there.
const build = window.KT_BUILD || null;
const $ = (id) => document.getElementById(id);
const VOICE_CACHE = 'kotoba-town-voice';

const pwa = (window.KT_PWA = {
  build, supported: 'serviceWorker' in navigator && !!build, ready: false, waiting: null,
  /** { stored, total } recorded lines in the worker's cache */
  async voices() {
    try {
      const index = await (await fetch(new URL('audio/voice/index.json', location.href))).json();
      const want = new Set(Object.entries(index).map(([id, v]) => new URL(`audio/voice/${id}.mp3?v=${v.h}`, location.href).href));
      const keys = await (await caches.open(VOICE_CACHE)).keys();
      return { stored: keys.filter((r) => want.has(r.url)).length, total: want.size };
    } catch { return { stored: 0, total: 0 }; }
  },
  /** ask the worker to store every recorded voice (progress comes back as CACHE_PROGRESS messages) */
  async cacheVoices() {
    const reg = await navigator.serviceWorker.ready;
    reg.active.postMessage({ type: 'CACHE_VOICES' });
  },
});

function landing(text, ok = false) {
  const el = $('offline-state');
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.toggle('ok', ok);
  el.classList.toggle('off', !ok);
  el.textContent = text;
}

function status() {
  if (navigator.onLine === false) landing(pwa.ready ? 'いまは オフライン：例文を 読んで すすむ れんしゅう が できます · Offline: practice by reading the model answers' : 'いまは オフライン · Offline', !!pwa.ready);
  else if (pwa.ready) landing(`✓ オフラインでも れんしゅう できます · Works offline (版 ${build.slice(0, 7)})`, true);
  else landing('オフライン用に ほぞん中… · Saving for offline use…');
}

async function refreshVoices(progress) {
  const box = $('offline-set'), txt = $('voice-offline-text'), btn = $('voice-save');
  if (!box) return;
  box.classList.remove('hidden');
  if (progress && !progress.finished) {
    txt.textContent = `こえを ほぞん中… ${progress.total ? `${progress.done} / ${progress.total} ` : ''}· Saving voices…`;
    btn.classList.add('hidden');
    return;
  }
  const { stored, total } = await pwa.voices();
  const all = total > 0 && stored >= total;
  txt.textContent = all ? `✓ まちの 人の こえも ぜんぶ オフラインで 聞けます（${total}） · All voices are saved for offline use`
    : `オフラインで 聞ける こえ：${stored} / ${total}（聞いた こえは じどうで ほぞん されます） · Voices saved for offline use: ${stored} / ${total}` +
      (progress ? ' — いくつか ほぞん できませんでした。ネットに つながって いる ときに もう一度 どうぞ' : '');
  btn.classList.toggle('hidden', all);
  btn.disabled = navigator.onLine === false;
}

if (pwa.supported) {
  status();
  let updating = false;
  const offerUpdate = (w) => {
    pwa.waiting = w;
    const b = $('update-btn');
    b.classList.remove('hidden');
    b.onclick = () => { updating = true; b.disabled = true; b.textContent = 'こうしん中… · Updating…'; w.postMessage('SKIP_WAITING'); };
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
  }).catch((e) => landing(`オフライン用の ほぞんに しっぱい しました · Could not save for offline use (${e.message})`));
  navigator.serviceWorker.ready.then((reg) => {
    pwa.ready = true;
    status();
    refreshVoices();
    navigator.xr?.isSessionSupported?.('immersive-vr').then((vr) => { if (vr) reg.active?.postMessage({ type: 'CACHE_VR' }); }).catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'CACHE_PROGRESS' && e.data.pack === 'voices') refreshVoices(e.data); });
  $('voice-save')?.addEventListener('click', (e) => { e.preventDefault(); pwa.cacheVoices(); refreshVoices({ done: 0, total: 0, finished: false }); });
  // the settings dialog: show the latest count each time it opens
  $('open-settings')?.addEventListener('click', () => { if (pwa.ready) refreshVoices(); });
  $('hud-settings')?.addEventListener('click', () => { if (pwa.ready) refreshVoices(); });
  addEventListener('online', () => { status(); refreshVoices(); });
  addEventListener('offline', () => { status(); refreshVoices(); });
}
