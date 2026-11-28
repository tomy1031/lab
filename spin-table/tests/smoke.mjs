// tests/smoke.mjs — the game in a real browser (headless Chromium, software WebGL):
//   A the demo (CPU vs CPU) plays and scores points with no errors
//   B PC match: you aim with the mouse, pick strokes with clicks; points are played
//   C PC ball machine: your side returns the machine's balls
//   D the start menu: tabs, a choice, a slider; settings survive a reload
//   node tests/smoke.mjs
import { serve } from './serve.mjs';
import { launch } from './browser.mjs';

const log = (...a) => console.log('[smoke]', ...a);
const fail = [];
const check = (c, m) => { log(c ? 'ok  ' : 'FAIL', m); if (!c) fail.push(m); };

async function open(browser, base, q, viewport = { width: 1100, height: 640 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(base + q, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ST && window.ST.ready, null, { timeout: 60000 });
  return { page, errors };
}
const gameErrors = (page) => page.evaluate(() => [...(ST.errors || []), ...(ST.game.errors || [])]);
const glog = (page) => page.evaluate(() => ST.game.log);

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await launch();

  // A — demo
  {
    const { page, errors } = await open(browser, base, '?demo&seed=3&fast=3&lite');
    await page.waitForFunction(() => ST.game.log.filter((e) => e.type === 'score').length >= 3, null, { timeout: 150000 }).catch(() => {});
    const ev = await glog(page);
    const hits = ev.filter((e) => e.type === 'hit');
    check(hits.some((e) => e.who === 'p') && hits.some((e) => e.who === 'c'), `demo: both players hit (${hits.length} hits)`);
    check(ev.filter((e) => e.type === 'score').length >= 3, 'demo: points are scored');
    check(ev.some((e) => e.type === 'table') && ev.some((e) => e.type === 'floor'), 'demo: the ball bounces on the table and the floor');
    const fast = hits.filter((e) => !e.serve).map((e) => e.speed * 3.6);
    check(fast.length && Math.max(...fast) > 40 && Math.max(...fast) < 140, `demo: rally speeds up to ${Math.round(Math.max(...fast))} km/h`);
    const hud = await page.evaluate(() => document.querySelector('#pc-hud').textContent);
    check(/rpm/.test(hud) && /km\/h/.test(hud), 'demo: the read-out shows speed and spin');
    const info = await page.evaluate(() => ST.renderer.info.render.calls);
    check(info < 200, `draw calls per frame: ${info}`);
    check(!errors.length && !(await gameErrors(page)).length, `demo: no errors ${errors.concat(await gameErrors(page)).join(' | ')}`);
    await page.close();
  }

  // B — PC match
  {
    const { page, errors } = await open(browser, base, '?seed=5&fast=3&lite&set=mode:match,level:2,firstServe:p');
    await page.click('#play-pc');
    const cv = page.locator('canvas');
    await page.mouse.move(700, 250);
    await cv.click({ position: { x: 700, y: 250 } });
    await page.waitForFunction(() => ST.game.log.filter((e) => e.type === 'score').length >= 2, null, { timeout: 120000 }).catch(() => {});
    const ev = await glog(page);
    check(ev.filter((e) => e.type === 'hit' && e.who === 'p').length >= 2, `PC match: your side hits (${ev.filter((e) => e.type === 'hit' && e.who === 'p').length})`);
    check(ev.filter((e) => e.type === 'score').length >= 2, 'PC match: points are scored');
    const pcShot = await page.evaluate(() => ST.game.pcShot);
    check(pcShot === 'drive', 'PC match: a click chooses the drive');
    await page.keyboard.press('KeyM');
    const menuOpen = await page.evaluate(() => !document.querySelector('#menu').classList.contains('hidden') && ST.game.paused);
    check(menuOpen, 'PC match: M opens the menu and pauses');
    check(!errors.length && !(await gameErrors(page)).length, `PC match: no errors ${errors.concat(await gameErrors(page)).join(' | ')}`);
    await page.close();
  }

  // C — PC ball machine
  {
    const { page, errors } = await open(browser, base, '?seed=8&fast=3&lite&set=mode:machine,machSpin:back,machInterval:1.6');
    await page.click('#play-pc');
    await page.waitForFunction(() => ST.game.sim.stats.served >= 4, null, { timeout: 120000 }).catch(() => {});
    const st = await page.evaluate(() => ({ ...ST.game.sim.stats }));
    check(st.served >= 4, `machine: ${st.served} balls fed`);
    check(st.in >= 1, `machine: returns land (${st.in} in, ${st.faults} missed)`);
    const visible = await page.evaluate(() => ST.game.machine.visible && !ST.game.cpu.root.visible);
    check(visible, 'machine: the ball machine stands in for the opponent');
    check(!errors.length && !(await gameErrors(page)).length, `machine: no errors ${errors.concat(await gameErrors(page)).join(' | ')}`);
    await page.close();
  }

  // D — menu and saved settings
  {
    const { page, errors } = await open(browser, base, '?lite');
    const tabs = await page.$$eval('#menu .tab', (b) => b.map((x) => x.textContent));
    check(tabs.length === 5, `menu: ${tabs.length} tabs (${tabs.join(' / ')})`);
    await page.click('#menu .tab:nth-child(2)');
    await page.click('#menu .row[data-key="bhRubber"] button[data-value="long"]');
    const r = page.locator('#menu .row[data-key="gripTilt"] input');
    await r.fill('42');
    await page.reload();
    await page.waitForFunction(() => window.ST && window.ST.ready);
    const v = await page.evaluate(() => [ST.settings.get('bhRubber'), ST.settings.get('gripTilt')]);
    check(v[0] === 'long' && v[1] === 42, `menu: settings survive a reload (${v.join(', ')})`);
    check(!errors.length, `menu: no errors ${errors.join(' | ')}`);
    await page.close();
  }

  await browser.close();
  srv.close();
  if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
  console.log('\nall ok');
})();
