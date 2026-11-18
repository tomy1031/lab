// tests/xr.mjs — the real WebXR path with Meta's emulator (IWER, Quest 3 profile):
//   enter VR → frames render → the racket follows the right controller along its ray →
//   bobbing the head (stepping in place) moves you toward the landing point → B opens the VR menu,
//   the laser + trigger switch a tab → the left trigger tosses the ball for a serve.
//   node tests/xr.mjs
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
import { launch, routeThree } from './browser.mjs';
const require = createRequire(import.meta.url);
const IWER = require.resolve('iwer/build/iwer.min.js');

const log = (...a) => console.log('[xr]', ...a);
const fail = [];
const check = (c, m) => { log(c ? 'ok  ' : 'FAIL', m); if (!c) fail.push(m); };

async function openInVr(browser, url) {
  const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await routeThree(page);
  await page.addInitScript({ path: IWER });
  await page.addInitScript(() => {
    const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
    d.installRuntime({ forceInstall: true });
    d.position.set(0, 1.62, 0);
    window.__xrd = d;
    const xr = navigator.xr, rs = xr.requestSession.bind(xr);
    window.__xrFrames = 0;
    xr.requestSession = async (...a) => {
      const s = await rs(...a);
      window.__xrSession = s;
      const tick = () => { if (window.__xrSession !== s) return; window.__xrFrames++; s.requestAnimationFrame(tick); };
      s.requestAnimationFrame(tick);
      return s;
    };
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.RC && window.RC.ready, null, { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#enter-vr').disabled, null, { timeout: 20000 });
  await page.click('#enter-vr');
  await page.waitForFunction(() => !!window.__xrSession, null, { timeout: 20000 });
  return { page, errors };
}
const frames = (page) => page.evaluate(() => window.__xrFrames);
const gameErrors = (page) => page.evaluate(() => [...(RC.errors || []), ...(RC.game.errors || [])]);
/** run fn(t) on the emulated device every 16 ms for `secs` seconds */
const animate = (page, secs, body) => page.evaluate(([secs, body]) => new Promise((res) => {
  const fn = new Function('d', 't', body);
  const d = window.__xrd, t0 = performance.now();
  const iv = setInterval(() => { const t = (performance.now() - t0) / 1000; fn(d, t); if (t >= secs) { clearInterval(iv); res(); } }, 16);
}), [secs, body]);

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await launch();

  // 1 — rally practice with the stepping mode
  {
    const { page, errors } = await openInVr(browser, `${base}?lite&seed=7&set=mode:rally,moveMode:step,level:1`);
    check(true, 'XR session started');
    const f0 = await frames(page);
    await page.waitForTimeout(3000);
    const nf = (await frames(page)) - f0;
    check(nf >= 15, `XR frames in 3 s: ${nf}`);
    // racket on the right controller, along its pointing ray
    await page.evaluate(() => { const c = window.__xrd.controllers.right; c.position.set(0.25, 1.1, -0.3); });
    await page.waitForTimeout(600);
    const rk = await page.evaluate(() => {
      const g = RC.game, T = RC.THREE, h = g.input.hands.right;
      const shaft = new T.Vector3(0, 1, 0).applyQuaternion(g.racketMesh.quaternion);
      const fwd = new T.Vector3(0, 0, -1).applyQuaternion(h.ray.quaternion);
      return { vis: g.racketMesh.visible, d: g.racketMesh.position.distanceTo(h.grip.position), dot: shaft.dot(fwd), tracked: h.tracked };
    });
    check(rk.tracked && rk.vis && rk.d < 0.001, `racket in the right hand (offset ${rk.d.toFixed(4)} m)`);
    check(rk.dot > 0.9, `racket points along the controller ray (cos ${rk.dot.toFixed(2)})`);
    // stepping: wait for a fed ball with a plan, then bob the head (3 cm at 2.5 Hz → 150 steps/min)
    await page.waitForFunction(() => RC.game.sim.playerPlan && RC.game.sim.phase === 'play', null, { timeout: 60000 });
    await page.evaluate(() => { const g = RC.game; window.__t0 = { ...g.sim.playerPlan.stance }; window.__d0 = Math.hypot(window.__t0.x - g.player.body.x, window.__t0.z - g.player.body.z); window.__best = window.__d0; window.__cad = 0;
      window.__iv = setInterval(() => { const t = window.__t0; window.__best = Math.min(window.__best, Math.hypot(t.x - g.player.body.x, t.z - g.player.body.z)); window.__cad = Math.max(window.__cad, g.player.steps.cadence); }, 20); });
    await animate(page, 3, 'd.position.y = 1.62 - 0.03 * Math.abs(Math.sin(Math.PI * 2.5 * t));');
    const st = await page.evaluate(() => { clearInterval(window.__iv); return { d0: window.__d0, best: window.__best, cad: window.__cad, steps: RC.game.player.steps.steps }; });
    check(st.steps >= 4 && st.cad > 90, `head bob counted as steps: ${st.steps} steps, ${Math.round(st.cad)}/min`);
    check(st.best < st.d0 - 0.4 || st.best < 0.2, `stepping moved you toward the landing point (${st.d0.toFixed(2)} → ${st.best.toFixed(2)} m)`);
    // B opens the menu; the laser + trigger switch tabs; B closes it
    await page.evaluate(() => { const c = window.__xrd.controllers.right; c.updateButtonValue('b-button', 1); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const c = window.__xrd.controllers.right; c.updateButtonValue('b-button', 0); });
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => RC.game.menu.open);
    check(open, 'B opens the VR menu');
    // aim the right controller at the "ラケット" tab and pull the trigger
    const tabHit = await page.evaluate(async () => {
      const g = RC.game, T = RC.THREE, m = g.menu.panel.mesh;
      const w = g.menu.widgets.find((o) => o.kind === 'tab' && o.value === 'swing');
      const local = new T.Vector3((w.x + w.w / 2) / 1024 * 0.8 - 0.4, 0.5 - (w.y + w.h / 2) / 1280 * 1.0, 0);
      const target = m.localToWorld(local);
      const c = window.__xrd.controllers.right;
      // the controller sits 30 cm in front of the panel; its ray (−z) points at the tab. IWER poses are in the
      // room (rig) space: convert from the world
      const rig = g.rig; rig.updateMatrixWorld(true);
      const normal = new T.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new T.Quaternion()));
      const from = target.clone().addScaledVector(normal, 0.3);
      const fromLocal = rig.worldToLocal(from.clone());
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), normal.clone().negate().transformDirection(new T.Matrix4().copy(rig.matrixWorld).invert()));
      c.position.set(fromLocal.x, fromLocal.y, fromLocal.z);
      c.quaternion.set(q.x, q.y, q.z, q.w);
      await new Promise((r) => setTimeout(r, 500));
      c.updateButtonValue('trigger', 1);
      await new Promise((r) => setTimeout(r, 400));
      c.updateButtonValue('trigger', 0);
      await new Promise((r) => setTimeout(r, 300));
      return g.menu.tab;
    });
    check(tabHit === 'swing', `the laser + trigger switch the menu tab (${tabHit})`);
    await page.evaluate(() => { const c = window.__xrd.controllers.right; c.updateButtonValue('b-button', 1); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const c = window.__xrd.controllers.right; c.updateButtonValue('b-button', 0); });
    await page.waitForTimeout(400);
    check(!(await page.evaluate(() => RC.game.menu.open)), 'B closes it');
    const ge = await gameErrors(page);
    check(errors.length === 0 && ge.length === 0, `no errors ${[...errors, ...ge].join(' | ')}`);
    await page.close();
  }

  // 2 — serve: the left trigger tosses the ball
  {
    const { page, errors } = await openInVr(browser, `${base}?lite&seed=8&set=mode:serve,moveMode:auto`);
    await page.waitForFunction(() => RC.game.sim.holder === 'p', null, { timeout: 30000 });
    await page.evaluate(() => { const c = window.__xrd.controllers.left; c.position.set(-0.1, 1.2, -0.25); });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__xrd.controllers.left.updateButtonValue('trigger', 1));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__xrd.controllers.left.updateButtonValue('trigger', 0));
    await page.waitForFunction(() => RC.game.sim.live && RC.game.sim.holder === null, null, { timeout: 5000 }).catch(() => {});
    const toss = await page.evaluate(() => ({ live: RC.game.sim.live, vy: RC.game.sim.ball.v.y, y: RC.game.sim.ball.p.y }));
    check(toss.live, `left trigger released → ball tossed (y ${toss.y.toFixed(2)} m, vy ${toss.vy.toFixed(2)} m/s)`);
    const ge = await gameErrors(page);
    check(errors.length === 0 && ge.length === 0, `serve: no errors ${[...errors, ...ge].join(' | ')}`);
    await page.close();
  }

  await browser.close();
  srv.close();
  if (fail.length) { log(`FAILED (${fail.length})`); process.exit(1); }
  log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
