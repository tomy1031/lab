// Offline play for Starlight Lake and EYE GYM: registers ../sw.js (one worker for both apps), tells it
// which CDN files and fonts this page loaded so they are kept too, and shows how ready the cache is
// in a small badge. ?nosw skips it all (for debugging).

const TEXT = {
  saving: 'オフライン用に保存中…',
  ready: '✓ オフライン対応：次からはネットがなくても、このページを開けば遊べます',
  offline: '✓ オフラインで起動しました（記録もこの端末に保存されます）',
  notYet: 'まだオフライン用に保存されていません。一度ネットにつないだ状態で開いてください',
  noSupport: 'このブラウザはオフライン保存に対応していません',
};

/**
 * @param {HTMLElement|null} el  badge element (hidden until there is something to say)
 * @param {object} o
 * @param {string} o.sw     URL of sw.js relative to this page
 * @param {string} o.scope  the folder sw.js lives in, relative to this page
 */
export function setupOffline(el, { sw = 'sw.js', scope = './' } = {}) {
  const show = (state, text) => { if (!el) return; el.dataset.state = state; el.textContent = text; el.hidden = false; };
  if (new URLSearchParams(location.search).has('nosw')) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { show('off', TEXT.noSupport); return; }

  show('busy', navigator.onLine ? TEXT.saving : TEXT.notYet);
  navigator.serviceWorker.register(sw, { scope }).catch(() => show('off', TEXT.noSupport));

  const ask = (worker, type) => new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 20000);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
    const urls = performance.getEntriesByType('resource').map((r) => r.name);
    worker.postMessage({ type, urls }, [ch.port2]);
  });

  navigator.serviceWorker.ready.then(async (reg) => {
    for (let tries = 0; tries < 30; tries++) {
      const worker = reg.active;
      const s = worker && await ask(worker, tries === 0 || tries % 5 === 4 ? 'keep' : 'status');
      if (s?.ready) { show('ok', navigator.onLine ? TEXT.ready : TEXT.offline); return; }
      if (!navigator.onLine) { show('off', TEXT.notYet); return; }
      show('busy', s ? `${TEXT.saving}（${s.total - s.missing}/${s.total}）` : TEXT.saving);
      await new Promise((r) => setTimeout(r, 2000));
    }
    show('off', TEXT.notYet);
  });
}
