// tests/smoke.cjs — the basics: the world loads, steps move the player, the autoplay runs for 30 s without errors.
//   node tests/smoke.cjs [outDir]
// Talks to the game only through the window.AW contract (see README): ready, errors, debug.*.
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');

const out = process.argv[2] || path.join(os.tmpdir(), 'aetherwalk-smoke');
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log('[smoke]', ...a);
const fail = [];
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

// open a page, collect uncaught errors (pageerror + AW.errors) and console errors (informational)
async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AW && window.AW.ready, null, { timeout: 60000 });
  return { page, pageErrors, consoleErrors };
}
const awErrors = (page) => page.evaluate(() => (window.AW && window.AW.errors) || []);

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // 1. walking: simulated steps move the player forward
  const a = await openPage(browser, `${base}?desktop&nosound&seed=1`);
  const s0 = await a.page.evaluate(() => AW.debug.state());
  await a.page.evaluate(() => AW.debug.simulateSteps(140, 5));
  await a.page.waitForTimeout(6000);
  const s1 = await a.page.evaluate(() => AW.debug.state());
  const dist = Math.hypot(s1.x - s0.x, s1.z - s0.z);
  check(s1.steps > 5, `steps counted: ${s1.steps}`);
  check(dist > 3, `player moved ${dist.toFixed(1)} m`);
  log(`fps=${s1.fps} drawCalls=${s1.drawCalls} triangles=${s1.triangles} region=${s1.region}`);
  await a.page.screenshot({ path: path.join(out, 'smoke-walk.png') });
  const errA = [...a.pageErrors, ...(await awErrors(a.page))];
  check(errA.length === 0, `no errors while walking ${errA.join(' | ')}`);
  if (a.consoleErrors.length) log('console errors (info):', a.consoleErrors.slice(0, 5).join(' | '));
  await a.page.close();

  // 2. autoplay: the bot plays for 30 s
  const b = await openPage(browser, `${base}?autoplay&nosound&seed=1`);
  await b.page.waitForTimeout(30000);
  const s2 = await b.page.evaluate(() => AW.debug.state());
  await b.page.screenshot({ path: path.join(out, 'smoke-autoplay.png') });
  const errB = [...b.pageErrors, ...(await awErrors(b.page))];
  check(errB.length === 0, `autoplay 30 s without errors ${errB.join(' | ')}`);
  log(`autoplay end: fps=${s2.fps} drawCalls=${s2.drawCalls} triangles=${s2.triangles} hp=${s2.hp}`);
  if (b.consoleErrors.length) log('console errors (info):', b.consoleErrors.slice(0, 5).join(' | '));
  await b.page.close();

  await browser.close();
  srv.close();
  if (fail.length) { log(`FAILED (${fail.length})`); process.exit(1); }
  log('all passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
