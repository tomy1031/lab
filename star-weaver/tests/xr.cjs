// tests/xr.cjs — drives the real WebXR code path with Meta's emulator (IWER, Quest 3 profile):
// enter VR → poke "はじめる" → T-pose calibration → poke PLAY → hit orbs with emulated controllers →
// pause with the B button → resume → switch to hand tracking.
//   npm i iwer && node tests/xr.cjs [outDir]
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');

const IWER = process.env.IWER_PATH || require.resolve('iwer/build/iwer.min.js', { paths: [process.cwd(), __dirname] });
const out = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log('[xr]', ...a);

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript({ path: IWER });
  await page.addInitScript(() => {
    const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
    d.installRuntime({ forceInstall: true });
    d.position.set(0, 1.62, 0);
    window.__xrd = d;
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#enter-vr').disabled, null, { timeout: 15000 });
  await page.click('#enter-vr');
  await page.waitForFunction(() => window.__game.state === 'welcome' && window.__game.welcome.visible, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  log('entered VR, state', await page.evaluate(() => window.__game.state));

  // helpers in the page: move a controller so its poke point / hit point lands on a world position
  await page.evaluate(() => {
    const g = window.__game, d = window.__xrd;
    window.__moveTo = async (side, target, which = 'poke') => {
      const c = d.controllers[side === 'L' ? 'left' : 'right'];
      const h = g.hands[side];
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 60));
        const cur = which === 'poke' ? h.pokeWorld : h.world;
        c.position.set(c.position.x + target.x - cur.x, c.position.y + target.y - cur.y, c.position.z + target.z - cur.z);
      }
      await new Promise((r) => setTimeout(r, 60));
    };
    window.__buttonWorld = (panel, label, dz = 0) => {
      const b = panel.buttons.find((x) => (typeof x.label === 'function' ? x.label() : x.label).includes(label));
      const x = (b.x + b.w / 2) / panel.ppm - panel.w / 2, y = panel.h / 2 - (b.y + b.h / 2) / panel.ppm;
      const v = panel.mesh.localToWorld(new panel.mesh.position.constructor(x, y, dz));
      return { x: v.x, y: v.y, z: v.z };
    };
    window.__poke = async (panel, label, side = 'R') => {
      await window.__moveTo(side, window.__buttonWorld(panel, label, 0.06));
      await window.__moveTo(side, window.__buttonWorld(panel, label, -0.01));
      await new Promise((r) => setTimeout(r, 120));
      await window.__moveTo(side, window.__buttonWorld(panel, label, 0.08));
    };
  });

  await page.evaluate(() => window.__poke(window.__game.welcome, 'はじめる'));
  await page.waitForFunction(() => window.__game.state === 'tpose', null, { timeout: 5000 });
  log('poked はじめる → tpose; eyeY', await page.evaluate(() => window.__game.body.eyeY.toFixed(2)));
  await page.screenshot({ path: path.join(out, 'xr-tpose.png') });
  // T pose: both hits points out to the sides at shoulder height
  await page.evaluate(async () => {
    const g = window.__game, b = g.body;
    const L = g.stageRoot.localToWorld(new g.head.constructor(-0.78, b.shoulderY, -0.05));
    const R = g.stageRoot.localToWorld(new g.head.constructor(0.78, b.shoulderY, -0.05));
    await window.__moveTo('L', L, 'hit');
    await window.__moveTo('R', R, 'hit');
  });
  await page.waitForFunction(() => window.__game.state === 'menu', null, { timeout: 6000 });
  log('T-pose measured → menu; reach', await page.evaluate(() => window.__game.body.reach.toFixed(3)), 'calib', await page.evaluate(() => JSON.stringify(window.__game.store.data.calib)));
  await page.evaluate(async () => { const d = window.__xrd; d.controllers.left.position.set(-0.25, 1.0, -0.2); d.controllers.right.position.set(0.25, 1.0, -0.2); await new Promise((r) => setTimeout(r, 200)); });
  await page.screenshot({ path: path.join(out, 'xr-menu.png') });
  await page.evaluate(() => window.__poke(window.__game.menu, 'クイック'));
  await page.evaluate(() => window.__poke(window.__game.menu, 'PLAY'));
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 5000 });
  log('PLAY pressed, mode', await page.evaluate(() => window.__game.mode));

  // a minimal in-page bot that moves the emulated controllers onto the upcoming orbs / comets
  await page.evaluate(() => {
    const g = window.__game, d = window.__xrd;
    const V = g.head.constructor;
    const off = { L: null, R: null };
    const tick = () => {
      if (window.__stopBot) return;
      for (const side of ['L', 'R']) {
        const c = d.controllers[side === 'L' ? 'left' : 'right'];
        const h = g.hands[side];
        if (!h.tracked) continue;
        off[side] = new V(c.position.x - h.world.x, c.position.y - h.world.y, c.position.z - h.world.z);
        let target = null, when = Infinity;
        for (const e of g.entities) {
          const ev = e.ev;
          const mine = ev.hand === side || (ev.hand === 'A' && side === 'R');
          if (ev.type === 'orb' && mine && e.state === 'fly' && ev.t < when) { when = ev.t; target = ev.pos; }
          if (ev.type === 'thread' && mine && g.t > ev.t - 0.5 && g.t < ev.t1) { when = 0; target = e.cpos; }
          if (ev.type === 'gate' && ev.hands.includes(side) && g.t > ev.t - 0.6) { when = 0; target = ev.targets[side]; }
        }
        if (!target) continue;
        const w = g.stageRoot.localToWorld(target.clone());
        c.position.set(w.x + off[side].x, w.y + off[side].y, w.z + off[side].z);
      }
      setTimeout(tick, 16);
    };
    tick();
  });
  await page.waitForFunction(() => window.__game.t > 22, null, { timeout: 60000, polling: 500 });
  await page.screenshot({ path: path.join(out, 'xr-play.png') });
  const mid = await page.evaluate(() => ({ t: window.__game.t, score: Math.round(window.__game.score), stats: window.__game.stats, combo: window.__game.combo }));
  log('after ~22s of play:', JSON.stringify({ t: mid.t.toFixed(1), score: mid.score, hit: mid.stats.hit, total: mid.stats.total, perfect: mid.stats.perfect, combo: mid.combo }));

  // pause with B, then resume by poking 再開
  await page.evaluate(async () => {
    const c = window.__xrd.controllers.right;
    c.updateButtonValue('b-button', 1); await new Promise((r) => setTimeout(r, 120));
    c.updateButtonValue('b-button', 0); await new Promise((r) => setTimeout(r, 120));
  });
  await page.waitForFunction(() => window.__game.state === 'paused', null, { timeout: 3000 });
  const tPaused = await page.evaluate(() => window.__game.t);
  await page.waitForTimeout(1200);
  const tStill = await page.evaluate(() => window.__game.t);
  log('paused with B; clock frozen:', Math.abs(tStill - tPaused) < 0.05);
  await page.evaluate(() => { window.__stopBot = true; });
  await page.evaluate(() => window.__poke(window.__game.pausePanel, '再開'));
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 6000 });
  log('resumed after countdown');

  // hand tracking
  await page.evaluate(async () => { window.__xrd.primaryInputMode = 'hand'; await new Promise((r) => setTimeout(r, 500)); });
  const hands = await page.evaluate(() => ({ L: [window.__game.hands.L.isHand, window.__game.hands.L.tracked], R: [window.__game.hands.R.isHand, window.__game.hands.R.tracked], orb: window.__game.pauseOrb.visible }));
  log('hand tracking: isHand/tracked', JSON.stringify(hands));
  await page.screenshot({ path: path.join(out, 'xr-hands.png') });

  // end the session from the page side and make sure the landing page comes back
  await page.evaluate(() => window.__game.renderer.xr.getSession().end());
  await page.waitForFunction(() => !document.querySelector('#overlay').hidden && window.__game.state === 'idle', null, { timeout: 5000 });
  log('session ended → landing page');
  log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  srv.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
