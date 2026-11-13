// js/core/landing.js — the landing page behaviour (OPUS-A): loading bar, ENTER VR, PC PREVIEW,
// the settings form (built from SETTING_DEFS), PWA status, and the attract view behind the panel.
import { SETTING_DEFS } from './settings.js';
import { errMsg } from './util.js';

const SHOWN = ['stepSensitivity', 'strideScale', 'moveDirection', 'turnMode', 'snapAngle', 'vignette', 'seated',
  'duckDepth', 'armAssist', 'armOnlyWalk', 'stickMove', 'edgeGuard', 'knockback', 'gripToggle', 'dominantHand',
  'quality', 'weightKg', 'haptics', 'volMaster'];

export function setupLanding(ctx) {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const bar = $('aw-progress-bar'), label = $('aw-progress-label');
  const vrBtn = $('enter-vr'), pcBtn = $('pc-preview'), vrNote = $('aw-vr-note');
  let ready = false, xrOk = false, mode = 'landing';
  body.classList.add('landing');

  function progress(text, ratio) {
    if (bar && ratio != null) bar.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
    if (label && text) label.textContent = text;
  }

  function refreshVR() {
    if (!vrBtn) return;
    vrBtn.disabled = !(ready && xrOk);
    if (vrNote) vrNote.textContent = !xrOk ? 'この端末では VR を使えません（Quest のブラウザで開いてください） VR not available here' : ready ? '' : '読み込み中… loading';
  }

  ctx.xr.supportedPromise.then((ok) => { xrOk = ok; refreshVR(); });
  refreshVR();

  vrBtn?.addEventListener('click', async () => {
    if (vrBtn.disabled) return;
    vrBtn.disabled = true;
    try {
      ctx.audio?.resume?.();
      await ctx.xr.enter();
      mode = 'xr';
      body.classList.remove('landing', 'desktop');
      body.classList.add('xr');
      ctx.input.enabled = true;
      ctx.player?.setEnabled?.(true);
      ctx.player?.desktop?.enable?.(false);
    } catch (e) {
      ctx.report(`enter VR: ${errMsg(e)}`);
      if (vrNote) vrNote.textContent = 'VR を開始できませんでした: ' + (e && e.message);
    } finally { refreshVR(); }
  });
  ctx.events.on('xr:end', () => {
    body.classList.remove('xr');
    if (mode === 'xr') { mode = ctx.flags.desktop ? 'desktop' : 'landing'; }
    if (mode === 'landing') body.classList.add('landing'); else body.classList.add('desktop');
    ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    window.dispatchEvent(new Event('resize'));
    refreshVR();
  });

  function startDesktop() {
    mode = 'desktop';
    ctx.flags.desktop = true;
    body.classList.remove('landing');
    body.classList.add('desktop');
    ctx.input.enabled = true;
    ctx.player?.setEnabled?.(true);
    ctx.player?.desktop?.enable?.(true);
    ctx.audio?.resume?.();
  }
  pcBtn?.addEventListener('click', startDesktop);
  $('aw-back')?.addEventListener('click', () => {
    mode = 'landing';
    ctx.player?.desktop?.enable?.(false);
    body.classList.remove('desktop');
    body.classList.add('landing');
    if (document.pointerLockElement) document.exitPointerLock();
  });

  // settings form
  const form = $('aw-settings');
  if (form) {
    form.innerHTML = '';
    for (const key of SHOWN) {
      const d = SETTING_DEFS[key];
      if (!d) continue;
      const row = document.createElement('label');
      row.className = 'aw-set';
      const name = document.createElement('span');
      name.innerHTML = `${d.label}<small>${d.en}</small>`;
      row.appendChild(name);
      let input;
      const v = ctx.settings.get(key);
      if (typeof d.def === 'boolean') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!v;
        input.addEventListener('change', () => ctx.settings.set(key, input.checked));
      } else if (d.options) {
        input = document.createElement('select');
        for (const o of d.options) {
          const opt = document.createElement('option');
          opt.value = String(o);
          opt.textContent = d.names && d.names[o] != null ? `${d.names[o]}` : String(o);
          input.appendChild(opt);
        }
        input.value = String(v);
        input.addEventListener('change', () => ctx.settings.set(key, typeof d.def === 'number' ? Number(input.value) : input.value));
      } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = d.min; input.max = d.max; input.step = d.step || 1;
        input.value = v;
        const out = document.createElement('output');
        out.textContent = String(v);
        input.addEventListener('input', () => { out.textContent = input.value; ctx.settings.set(key, Number(input.value)); });
        row.appendChild(input);
        row.appendChild(out);
        form.appendChild(row);
        continue;
      }
      input.dataset.setting = key;
      row.appendChild(input);
      form.appendChild(row);
    }
    $('aw-settings-reset')?.addEventListener('click', () => { ctx.settings.reset(); location.reload(); });
  }

  // PWA hooks
  const pwaEl = $('aw-pwa'), pwaUpd = $('aw-pwa-update'), pwaInst = $('aw-pwa-install');
  function pwaStatus(s) {
    if (!pwaEl || !s) return;
    if (s.state === 'ready') pwaEl.textContent = 'オフラインで遊べます OFFLINE READY';
    else if (s.state === 'caching') pwaEl.textContent = `オフライン用に保存中 ${s.cached || 0}/${s.total || '?'} CACHING`;
    else if (s.state === 'error') pwaEl.textContent = 'オフライン保存に失敗 OFFLINE ERROR';
  }
  function pwaUpdate(avail) {
    if (!pwaUpd) return;
    pwaUpd.hidden = !avail;
    pwaUpd.onclick = () => window.__pwa && window.__pwa.apply();
  }
  function pwaInstallable(avail) {
    if (!pwaInst) return;
    pwaInst.hidden = !avail;
    pwaInst.onclick = () => window.__pwa && window.__pwa.install && window.__pwa.install();
  }

  // attract view behind the landing panel: a slow look around the spawn direction
  let t = 0, baseYaw = 0;
  function attract(dt) {
    if (mode !== 'landing' || ctx.flags.xr) return;
    t += dt;
    ctx.input.virtual.setLook(baseYaw + Math.sin(t * 0.08) * 25, 4 + Math.sin(t * 0.05) * 3);
  }

  return {
    progress,
    onReady() {
      ready = true; refreshVR(); progress('準備完了 READY', 1); body.classList.add('ready');
      baseYaw = ((ctx.player?.yaw || 0) * 180) / Math.PI;
      ctx.loop?.addHook?.('landing', attract, 'pre');
    },
    startDesktop,
    pwaStatus, pwaUpdate, pwaInstallable,
    get mode() { return mode; },
  };
}
