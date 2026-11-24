// js/core/landing.js — the landing page behaviour (OPUS-A): loading bar, ENTER VR, PC PREVIEW,
// the settings form (built from SETTING_DEFS), PWA status, the attract view behind the panel, and — when a save
// exists — the つづきから / はじめから choice (はじめから asks once, then calls game.reset()). toTitle() brings
// the player back here from the game (leaving XR first); main.js exposes it as ctx.app.toTitle().
import { SETTING_DEFS } from './settings.js';
import { errMsg } from './util.js';

const SHOWN = ['stepSensitivity', 'strideScale', 'moveDirection', 'turnMode', 'snapAngle', 'vignette', 'seated',
  'duckDepth', 'armAssist', 'armOnlyWalk', 'stickMove', 'edgeGuard', 'knockback', 'gripToggle', 'dominantHand',
  'jumpView', 'climbAssist', 'parryWindow', 'quality', 'weightKg', 'haptics', 'volMaster'];

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

  // ── つづきから / はじめから ──
  const startBox = $('aw-start'), summaryEl = $('aw-save-summary'), noteEl = $('aw-start-note');
  const confirmBox = $('aw-confirm'), yesBtn = $('aw-confirm-yes'), noBtn = $('aw-confirm-no');
  const radios = startBox ? [...startBox.querySelectorAll('input[name="aw-start"]')] : [];
  let confirming = false;
  const game = () => (ctx.game && !ctx.game.isStub ? ctx.game : null);
  /** the save on disk (null with ?fresh, the autoplay demo, no game or no save) */
  function saveData() {
    const g = game();
    if (!g || !g.saver || !g.saver.enabled) return null;
    try { return g.saver.read(); } catch { return null; }
  }
  const pad = (n) => String(n).padStart(2, '0');
  function summaryOf(d) {
    const g = game();
    const st = d.quest && Number.isFinite(d.quest.stage) ? d.quest.stage : 0;
    const stage = g?.quest?.STAGES?.[st]?.text || '';
    const steps = Math.max(0, Math.round(d.stats?.steps || 0));
    const min = Math.round((d.stats?.activeSec || 0) / 60);
    const when = d.savedAt ? new Date(d.savedAt) : null;
    return [stage, `${steps.toLocaleString('ja-JP')} 歩`, min > 0 ? `${min} 分` : null,
      when ? `${when.getMonth() + 1}/${when.getDate()} ${pad(when.getHours())}:${pad(when.getMinutes())} に記録` : null]
      .filter(Boolean).join(' ・ ');
  }
  function markChoice() {
    for (const r of radios) r.closest('.aw-choice')?.classList.toggle('is-on', r.checked);
  }
  function choose(value) { for (const r of radios) r.checked = r.value === value; markChoice(); }
  function setStartLocked(b) {
    if (pcBtn) pcBtn.disabled = b;
    if (b && vrBtn) vrBtn.disabled = true; else refreshVR();
  }
  /** show the choice when a save exists (after the game has loaded it); hide it otherwise */
  function refreshSaves() {
    if (!startBox) return;
    const d = ready ? saveData() : null;
    startBox.hidden = !d;
    closeConfirm(false);
    if (d) { if (summaryEl) summaryEl.textContent = summaryOf(d); choose('continue'); }
  }
  function openConfirm() {
    if (!confirmBox) return;
    confirming = true;
    confirmBox.hidden = false;
    setStartLocked(true);
    noBtn?.focus();                                  // the safe answer has the focus
  }
  function closeConfirm(refocus = true) {
    if (!confirmBox || !confirming) { if (confirmBox) confirmBox.hidden = true; return; }
    confirming = false;
    confirmBox.hidden = true;
    setStartLocked(false);
    if (refocus) radios.find((r) => r.checked)?.focus();
  }
  for (const r of radios) {
    r.addEventListener('change', () => {
      markChoice();
      if (r.checked && r.value === 'new') openConfirm(); else closeConfirm(false);
    });
  }
  noBtn?.addEventListener('click', () => { choose('continue'); closeConfirm(); });
  yesBtn?.addEventListener('click', () => {
    const g = game();
    let ok = false;
    try { ok = g ? g.reset() !== false : false; } catch (e) { ctx.report(`new game: ${errMsg(e)}`); }
    confirming = false;
    if (confirmBox) confirmBox.hidden = true;
    setStartLocked(false);
    if (startBox) startBox.hidden = true;
    if (noteEl) noteEl.textContent = ok ? '記録を消しました。目覚めの石舞台から始めます — NEW GAME' : 'はじめからにできませんでした';
    baseYaw = ((ctx.player?.yaw || 0) * 180) / Math.PI;
    (vrBtn && !vrBtn.disabled ? vrBtn : pcBtn)?.focus();
    ctx.events.emit('game:new', { ok });
  });
  confirmBox?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); noBtn?.click(); }
    else if (e.key === 'Tab') {                       // keep the focus inside the question
      e.preventDefault();
      (document.activeElement === yesBtn ? noBtn : yesBtn)?.focus();
    }
  });
  markChoice();

  /** leaving the title for the game: un-freeze a world paused by toTitle() */
  function leaveTitle() {
    if (noteEl) noteEl.textContent = '';
    if (ctx.paused && ctx.pauseReason === 'title') ctx.setPaused(false, 'title');
  }

  vrBtn?.addEventListener('click', async () => {
    if (vrBtn.disabled || confirming) return;
    vrBtn.disabled = true;
    leaveTitle();
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
    if (confirming) return;
    leaveTitle();
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
    refreshSaves();
  });

  /** back to the title from the game (the wrist menu's 記録 page): save, leave XR, freeze the world, show the
   *  landing with the choice refreshed */
  async function toTitle() {
    try { ctx.ui?.closeMenu?.(); } catch { /* ui stub */ }
    try { game()?.save?.(); } catch (e) { ctx.report(`save: ${errMsg(e)}`); }
    mode = 'landing';                                // (so xr:end lands here, not in the PC view)
    if (ctx.renderer.xr.isPresenting) { try { await ctx.xr.exit(); } catch (e) { ctx.report(`exit VR: ${errMsg(e)}`); } }
    if (document.pointerLockElement) document.exitPointerLock();
    ctx.player?.desktop?.enable?.(false);
    body.classList.remove('desktop', 'xr');
    body.classList.add('landing');
    if (!ctx.paused) ctx.setPaused(true, 'title');
    baseYaw = ((ctx.player?.yaw || 0) * 180) / Math.PI;
    $('aw-landing')?.scrollTo?.(0, 0);
    refreshSaves();
    (startBox && !startBox.hidden ? radios.find((r) => r.checked) : (vrBtn && !vrBtn.disabled ? vrBtn : pcBtn))?.focus();
    refreshVR();
    return true;
  }

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
      refreshSaves();
    },
    startDesktop, toTitle, refreshSaves,
    pwaStatus, pwaUpdate, pwaInstallable,
    get mode() { return mode; },
  };
}
