// js/pwa.js — offline play (PWA). In a published build (window.RC_BUILD, set by tools/bundle.mjs) it registers the
// service worker, says 「オフラインでも遊べます」 once every file is stored, and offers 「新しいバージョンに更新」 when
// a new build is waiting. On a dev server (no build id) it does nothing, so the code is always fresh there.
const note = document.getElementById('offline-note');
const btn = document.getElementById('update-btn');
const build = window.RC_BUILD || null;

const pwa = (window.RC_PWA = { build, supported: 'serviceWorker' in navigator && !!build, ready: false, waiting: null });

function say(text, ok = false) {
  if (!note) return;
  document.getElementById('offline')?.classList.remove('hidden');
  note.textContent = text;
  note.classList.toggle('ok', ok);
}

if (!build) {
  // dev server: no service worker, and nothing to say
} else if (!pwa.supported) {
  say('このブラウザはオフライン保存に対応していません');
} else {
  say('オフライン用にファイルを保存しています…');
  let updating = false;
  const offerUpdate = (w) => {
    pwa.waiting = w;
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.onclick = () => { updating = true; btn.disabled = true; btn.textContent = '更新しています…'; w.postMessage('SKIP_WAITING'); };
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
  }).catch((e) => say(`オフライン保存に失敗しました（${e.message}）`));
  navigator.serviceWorker.ready.then(() => {
    pwa.ready = true;
    say(`オフラインでも遊べます（版 ${build.slice(0, 7)}）`, true);
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
}
