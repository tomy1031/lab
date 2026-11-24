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
  const quality = params.get('quality') || settings.quality || (matchMedia('(pointer: coarse)').matches ? 'low' : 'mid');
  const renderer = new Renderer(canvas, quality);
  const game = new Game(renderer, { params });
  ISLE.game = game;
  const screens = new Screens(game);
  game.screens = screens;
  ISLE.debug.state = () => game.debugState();
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
