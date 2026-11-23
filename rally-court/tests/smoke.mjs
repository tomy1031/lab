// tests/smoke.mjs — the game in a real browser (headless Chromium, SwiftShader):
//   A demo (CPU vs CPU) plays points with no errors
//   B PC rally, auto movement, auto swing: your racket (the same swept physics as VR) returns the CPU's balls
//   C PC serve practice: toss + serve swing land serves in the box
//   D the menu: tabs, a choice, a slider; settings survive a reload
//   E d-pad (arrow keys) and stepping (F key) move you
//   node tests/smoke.mjs
import { serve } from './serve.mjs';
import { launch, routeThree } from './browser.mjs';

const log = (...a) => console.log('[smoke]', ...a);
const fail = [];
const check = (c, m) => { log(c ? 'ok  ' : 'FAIL', m); if (!c) fail.push(m); };

async function open(browser, base, q, viewport = { width: 1100, height: 640 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await routeThree(page);
  await page.goto(base + q, { waitUntil: 'load' });
  await page.waitForFunction(() => window.RC && window.RC.ready, null, { timeout: 60000 });
  return { page, errors };
}
const gameErrors = (page) => page.evaluate(() => [...(RC.errors || []), ...(RC.game.errors || [])]);
const events = (page) => page.evaluate(() => RC.game.events.map((e) => ({ type: e.type, who: e.who, res: e.res && e.res.type, reason: e.reason, serve: e.serve })));

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await launch();

  // A — demo
  {
    const { page, errors } = await open(browser, base, '?demo&seed=3&fast=4');
    await page.waitForFunction(() => RC.game.events.filter((e) => e.type === 'point').length >= 2, null, { timeout: 90000 }).catch(() => {});
    const ev = await events(page);
    const hits = ev.filter((e) => e.type === 'hit');
    check(hits.some((e) => e.who === 'p') && hits.some((e) => e.who === 'c'), `demo: both players hit (${hits.length} hits)`);
    check(ev.filter((e) => e.type === 'point').length >= 2, 'demo: points are played and scored');
    const ge = await gameErrors(page);
    check(errors.length === 0 && ge.length === 0, `demo: no errors ${[...errors, ...ge].join(' | ')}`);
    await page.close();
  }

  // B — PC rally with your racket
  {
    const { page, errors } = await open(browser, base, '?set=mode:rally,moveMode:auto,level:2&autoswing&seed=4&fast=2');
    await page.click('#play-pc');
    await page.waitForFunction(() => RC.game.sim.stats.shots >= 4, null, { timeout: 150000 }).catch(() => {});
    const st = await page.evaluate(() => RC.game.sim.stats);
    const ev = await events(page);
    const mine = ev.filter((e) => e.type === 'hit' && e.who === 'p').length;
    check(mine >= 4, `PC rally: your racket returned ${mine} balls (swept racket physics)`);
    check(st.returnsIn >= 2, `PC rally: ${st.returnsIn} of them landed in`);
    const ge = await gameErrors(page);
    check(errors.length === 0 && ge.length === 0, `PC rally: no errors ${[...errors, ...ge].join(' | ')}`);
    await page.close();
  }

  // C — serve practice
  {
    const { page, errors } = await open(browser, base, '?set=mode:serve,moveMode:auto&autoswing&seed=5&fast=2');
    await page.click('#play-pc');
    await page.waitForFunction(() => RC.game.sim.stats.serves >= 4, null, { timeout: 150000 }).catch(() => {});
    const st = await page.evaluate(() => RC.game.sim.stats);
    check(st.serves >= 4, `serve practice: ${st.serves} serves hit`);
    check(st.servesIn >= 1 && st.topServe > 100, `serve practice: ${st.servesIn} in, fastest ${Math.round(st.topServe)} km/h`);
    const ge = await gameErrors(page);
    check(errors.length === 0 && ge.length === 0, `serve: no errors ${[...errors, ...ge].join(' | ')}`);
    await page.close();
  }

  // D — menu and saved settings
  {
    const { page } = await open(browser, base, '');
    await page.click('.tabs .tab:has-text("あそぶ")');
    await page.click('.row[data-key="moveMode"] button:has-text("十字キー")');
    await page.click('.tabs .tab:has-text("移動")');
    const rows = await page.$$eval('.items .row', (r) => r.map((x) => x.dataset.key));
    check(rows.includes('stickDigital') && !rows.includes('stepTopCadence'), 'menu: the move tab shows the d-pad items for the d-pad mode');
    await page.$eval('.row[data-key="maxSpeed"] input', (el) => { el.value = '5.2'; el.dispatchEvent(new Event('input')); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.RC && window.RC.ready);
    const saved = await page.evaluate(() => [RC.settings.get('moveMode'), RC.settings.get('maxSpeed')]);
    check(saved[0] === 'dpad' && saved[1] === 5.2, `menu: settings saved (${saved.join(', ')})`);
    await page.evaluate(() => localStorage.clear());
    await page.close();
  }

  // E — d-pad and stepping move you
  {
    const { page } = await open(browser, base, '?set=mode:serve,moveMode:dpad&seed=6');
    await page.click('#play-pc');
    await page.waitForTimeout(1500);
    const x0 = await page.evaluate(() => RC.game.player.body.x);
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowLeft');
    const x1 = await page.evaluate(() => RC.game.player.body.x);
    check(x0 - x1 > 1.5, `d-pad: ← moved you ${(x0 - x1).toFixed(2)} m to the left`);
    await page.close();
    const p2 = await open(browser, base, '?set=mode:machine,moveMode:step,machineInterval:6&seed=6');
    await p2.page.click('#play-pc');
    // wait for a ball and its plan, then step (F) toward it
    await p2.page.waitForFunction(() => RC.game.sim.playerPlan && RC.game.sim.phase === 'play', null, { timeout: 60000 });
    const t0 = await p2.page.evaluate(() => { const g = RC.game; const t = g.sim.playerPlan.stance; window.__t0 = { ...t }; return { d: Math.hypot(t.x - g.player.body.x, t.z - g.player.body.z) }; });
    const d0 = t0.d;
    const still = await p2.page.evaluate(() => RC.game.player.speed);
    await p2.page.keyboard.down('KeyF');
    // the closest you got to that landing point while stepping
    await p2.page.evaluate(() => { window.__best = 1e9; window.__iv = setInterval(() => { const g = RC.game, t = window.__t0; window.__best = Math.min(window.__best, Math.hypot(t.x - g.player.body.x, t.z - g.player.body.z)); window.__cad = Math.max(window.__cad || 0, g.player.steps.cadence); window.__eff = Math.max(window.__eff || 0, g.player.effort); }, 20); });
    await p2.page.waitForTimeout(1300);
    const after = await p2.page.evaluate(() => { clearInterval(window.__iv); return { d: window.__best, cad: window.__cad, eff: window.__eff }; });
    await p2.page.keyboard.up('KeyF');
    check(still < 0.05, 'stepping: standing still without steps');
    check(after.cad > 100 && after.eff > 0.5, `stepping: F key = ${Math.round(after.cad)} steps/min, effort ${after.eff.toFixed(2)}`);
    check(after.d >= 0 && after.d < d0 - 0.5, `stepping: moved toward the landing point (${d0.toFixed(2)} → ${after.d.toFixed(2)} m)`);
    await p2.page.close();
  }

  await browser.close();
  srv.close();
  if (fail.length) { log(`FAILED (${fail.length})`); process.exit(1); }
  log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
