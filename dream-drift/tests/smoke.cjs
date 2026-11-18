// tests/smoke.cjs — end-to-end checks in headless Chromium (SwiftShader):
//   1. title → menus → Grand Prix race with the keyboard; the kart drives; pause / resume
//   2. every course: a full 8-kart race fast-forwarded to the finish (all finish, no respawns, no errors)
//   3. results screen
//   node tests/smoke.cjs [outDir]
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');

const out = process.argv[2] || path.join(os.tmpdir(), 'dream-drift-smoke');
fs.mkdirSync(out, { recursive: true });
const fail = [];
const log = (...a) => console.log('[smoke]', ...a);
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

async function open(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 90000 });
  return { page, errors };
}
const ddErrors = (page) => page.evaluate(() => window.DD.errors.slice());
const screen = (page) => page.evaluate(() => window.DD.debug.state().screen);
const waitScreen = (page, id) => page.waitForFunction((s) => window.DD.debug.state().screen === s, id, { timeout: 60000 });

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // 1. menus and a real race with the keyboard
  {
    const { page, errors } = await open(browser, `${base}?nosound&quality=low`);
    await page.setViewportSize({ width: 800, height: 450 });
    check((await screen(page)) === 's-title', 'title screen is up');
    await page.keyboard.press('Enter');
    await waitScreen(page, 's-control');
    check(true, 'Enter → control choice');
    await page.keyboard.press('Enter'); // controller / keyboard card has focus
    await waitScreen(page, 's-setup');
    check(true, 'controller chosen → race setup');
    await page.click('[data-group="mode"] [data-val="gp"]');
    await page.click('[data-act="setup-ok"]');
    await waitScreen(page, 's-char');
    await page.click('[data-char="momo"]');
    await page.click('[data-act="char-ok"]');
    await waitScreen(page, 'race');
    check(true, 'Grand Prix race 1 started');
    await page.evaluate(() => window.DD.debug.skipIntro());
    await page.waitForFunction(() => window.DD.debug.state().phase === 'race', null, { timeout: 60000 });
    const d0 = await page.evaluate(() => window.DD.debug.state().me.raceDist);
    await page.keyboard.down('ArrowUp');
    // software rendering is slow: wait for 2 s of game time rather than wall time
    await page.waitForFunction(() => window.DD.debug.state().raceTime > 2, null, { timeout: 180000 });
    const s1 = await page.evaluate(() => window.DD.debug.state());
    await page.keyboard.up('ArrowUp');
    check(s1.me.raceDist - d0 > 3, `kart drives forward with ↑ (moved ${(s1.me.raceDist - d0).toFixed(1)} samples, speed ${s1.me.speed.toFixed(1)})`);
    await page.screenshot({ path: path.join(out, 'race-keyboard.png') });
    await page.keyboard.press('Escape');
    await waitScreen(page, 's-pause');
    check(true, 'Esc → pause');
    await page.keyboard.press('Enter');
    await waitScreen(page, 'race');
    check(true, 'Enter → resume');
    const errs = [...errors, ...(await ddErrors(page))];
    check(errs.length === 0, `no errors in the menu + race flow ${errs.join(' | ')}`);
    log('perf', JSON.stringify(await page.evaluate(() => { const s = window.DD.debug.state(); return { fps: s.fps, drawCalls: s.drawCalls, triangles: s.triangles }; })));
    await page.close();
  }

  // 2. every course: full race, fast-forwarded
  for (let c = 1; c <= 4; c++) {
    const { page, errors } = await open(browser, `${base}?course=${c}&autoplay&nosound&quality=low&seed=${c * 7}`);
    await page.waitForFunction(() => window.DD.debug.state().screen === 'race', null, { timeout: 90000 });
    const s = await page.evaluate(() => window.DD.debug.simulate(420));
    const resp = s.karts.reduce((a, k) => a + k.respawns, 0);
    const times = s.karts.map((k) => k.time).sort((a, b) => a - b);
    check(s.phase === 'done' && s.karts.every((k) => k.finished), `course ${c}: all ${s.karts.length} karts finish (${times[0].toFixed(1)}–${times[times.length - 1].toFixed(1)} s)`);
    check(resp === 0, `course ${c}: no respawns (${resp})`);
    log(`course ${c}: me ${s.me.place}位, drawCalls ${s.drawCalls}, triangles ${s.triangles}`);
    if (c === 4) {
      await page.evaluate(() => window.DD.debug.showResults());
      await waitScreen(page, 's-results');
      const rows = await page.$$eval('#res-table .rrow', (r) => r.length);
      check(rows === 8, `results table lists 8 karts (${rows})`);
      await page.screenshot({ path: path.join(out, 'results.png') });
    }
    const errs = [...errors, ...(await ddErrors(page))];
    check(errs.length === 0, `course ${c}: no errors ${errs.join(' | ')}`);
    await page.close();
  }

  await browser.close();
  srv.close();
  if (fail.length) { console.error(`\n${fail.length} check(s) failed`); process.exit(1); }
  console.log('\nall smoke checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
