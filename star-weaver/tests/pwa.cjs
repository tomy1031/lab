// tests/pwa.cjs — the published build works offline and updates itself.
//   1. build (tools/build.mjs) and open it once online: the service worker stores everything → OFFLINE READY
//   2. stop the server and cut the internet (dead proxy): reopen, three.js / fonts / code come from the
//      cache, the autoplay demo runs
//   3. publish a new build while the page is open: the update banner appears; UPDATE switches to it
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-dist-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-profile-'));
const build = (...extra) => execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build.mjs'), dist, ...extra], { encoding: 'utf8' }).trim();
let ok = true;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) ok = false; };
const ARGS = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

(async () => {
  console.log(build());
  const url = `http://127.0.0.1:${PORT}/`;
  // 1. online
  let srv = await serve(PORT, dist);
  let ctx = await chromium.launchPersistentContext(profile, { args: ARGS, viewport: { width: 1000, height: 700 } });
  let page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#offline').classList.contains('ready'), null, { timeout: 90000 });
  check(true, `online visit stored everything: ${await page.textContent('#offline-text')}`);
  await ctx.close();
  srv.close();

  // 2. offline: no local server, no internet
  ctx = await chromium.launchPersistentContext(profile, { args: ARGS, viewport: { width: 1000, height: 700 }, proxy: { server: 'http://127.0.0.1:9' } });
  page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdnDown = await page.evaluate(() => fetch('https://example.com/', { mode: 'no-cors' }).then(() => false, () => true)).catch(() => true);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  const info = await page.evaluate(() => ({ build: window.STARWEAVER_BUILD, outfit: document.fonts.check('700 20px "Outfit"'), zen: document.fonts.check('700 20px "Zen Kaku Gothic New"', '肩') }));
  check(!!info.build, `offline page loaded build ${info.build} (internet cut: ${cdnDown})`);
  check(info.outfit && info.zen, `fonts from the cache (Outfit ${info.outfit}, Zen Kaku ${info.zen})`);
  await page.click('#demo');
  await page.waitForFunction(() => window.__game.t > 5, null, { timeout: 30000 });
  check(true, `offline autoplay running (three.js from the cache), t=${(await page.evaluate(() => window.__game.t)).toFixed(1)}`);
  check(!errors.length, `no page errors offline ${errors.join(' | ')}`);
  await ctx.close();

  // 3. update: open the current build, then publish a new one
  srv = await serve(PORT, dist);
  ctx = await chromium.launchPersistentContext(profile, { args: ARGS, viewport: { width: 1000, height: 700 } });
  page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url, { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => window.STARWEAVER_BUILD);
  console.log(build('--build', 'update-test'));
  await page.evaluate(() => window.__pwa.check());
  await page.waitForSelector('#update:not([hidden])', { timeout: 30000 });
  check(true, 'update banner shown for the new build');
  await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click('#btn-update')]);
  await page.waitForFunction(() => window.STARWEAVER_BUILD, null, { timeout: 30000 });
  const after = await page.evaluate(() => window.STARWEAVER_BUILD);
  check(after === 'update-test' && before !== after, `UPDATE switched ${before} → ${after}`);
  await ctx.close();
  srv.close();
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
