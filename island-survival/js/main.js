// main.js — boot: renderer, the title / setup screens, then the game. URL options for testing:
//   ?quick            skip the menus and start a default game at once
//   ?quality=low|mid|high   ?nosound   ?seed=N   ?starter=<item id>   ?companion=hana|seed|none
import { Renderer } from './engine/renderer.js';
import { Game } from './core/game.js';
import { Screens } from './ui/screens.js';
import { loadSettings } from './core/save.js';
import { pwa } from './pwa.js';

const params = new URLSearchParams(location.search);
const ISLE = window.ISLE;

async function boot() {
  const canvas = document.getElementById('gl');
  const settings = loadSettings();
  // Meta Quest and phones start light (the island is heavy for them); the settings can raise it
  const light = matchMedia('(pointer: coarse)').matches || /OculusBrowser|Quest|Pico|Android|iPhone|iPad/i.test(navigator.userAgent);
  const quality = params.get('quality') || settings.quality || (light ? 'low' : 'mid');
  const renderer = new Renderer(canvas, quality);
  const game = new Game(renderer, { params });
  ISLE.game = game;
  const screens = new Screens(game);
  game.screens = screens;
  ISLE.debug.state = () => game.debugState();
  // VR (WebXR, e.g. a Quest browser): 「🥽 VR」 on the HUD and in the pause menu once a game runs
  game.enterVR = async () => {
    if (!game.xr?.supported) return false;
    try { await game.xr.enter(); return true; } catch (e) { console.warn('xr', e); game.bus.emit('toast', { text: `VR に 入れなかった：${e.message || e}`, kind: 'warn' }); return false; }
  };
  if (navigator.xr) {
    import('./vr/xr.js').then(({ IslandXR }) => { game.xr = new IslandXR(game); ISLE.xr = game.xr; return game.xr.ready; }).then((ok) => {
      if (!ok) return;
      document.body.classList.add('xr-ok');
      const b = document.createElement('button');
      b.id = 'vr-enter'; b.type = 'button'; b.className = 'btn teal small'; b.textContent = '🥽 VR'; b.title = 'VR で 遊ぶ（ヘッドセット）';
      b.onclick = () => game.enterVR();
      document.getElementById('hud')?.appendChild(b);
      // on the title: how to get into the headset
      const foot = document.querySelector('.title-foot');
      if (foot && !foot.querySelector('.vr-how')) { const s = document.createElement('div'); s.className = 'vr-how'; s.textContent = '🥽 VR：「はじめる」→ ゲームが 始まったら 右下の「🥽 VR」を 押す'; foot.appendChild(s); }
      game.ctlGuide?.render?.();
    }).catch((e) => console.warn('xr', e));
  }
  let restart = null;
  try { restart = JSON.parse(sessionStorage.getItem('isle.restart') || 'null'); sessionStorage.removeItem('isle.restart'); } catch { /* ignore */ }
  if (restart) {
    await game.newGame(restart);
  } else if (params.has('quick')) {
    await game.newGame(game.quickSetup(params));
  } else {
    screens.show('title');
    game.startAmbientPreview();
  }
  ISLE.ready = true;
  // offline play (published builds only): cache everything, tell when it is ready, offer updates
  ISLE.pwa = pwa;
  pwa.on((type) => {
    if (type === 'ready' && !localStorage.getItem('isle.offlineToast')) { try { localStorage.setItem('isle.offlineToast', '1'); } catch { /* ignore */ } game.bus?.emit('toast', { text: 'この 島は オフラインでも 遊べます（ホーム画面に 追加できます）', kind: 'good' }); }
    if (type === 'update') screens.updateBanner?.(() => pwa.update());
  });
  pwa.register();
  addEventListener('offline', () => game.bus?.emit('toast', { text: 'オフライン：仲間との 声の 会話（Gemini）は 使えません。ほかは そのまま 遊べます', kind: 'info' }));
}

boot().catch((e) => {
  console.error(e);
  ISLE.errors.push(`boot: ${e.message}`);
  const p = document.createElement('pre');
  p.style.cssText = 'position:fixed;inset:16px;color:#fff;background:#300;padding:16px;white-space:pre-wrap;z-index:99';
  p.textContent = `起動に失敗しました\n${e.stack || e}`;
  document.body.appendChild(p);
});
