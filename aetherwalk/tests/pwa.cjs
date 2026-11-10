// tests/pwa.cjs — the published build works offline and updates itself.
//   1. build (tools/build.mjs) and open it once online: the service worker stores everything → OFFLINE READY
//   2. stop the server and cut the internet (dead proxy): reopen, three.js / code come from the cache,
//      the game starts (AW.ready)
//   3. publish a new build while the page is open: check() sees it, and apply() switches to it
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-dist-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-profile-'));
const build = (...extra) => execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build.mjs'), dist, ...extra], { encoding: 'utf8' }).trim();
let ok = true;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) ok = false; };
const ARGS = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];

// how much of this build the service worker has stored
const swStatus = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  navigator.serviceWorker.ready.then((r) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => resolve(e.data);
    r.active.postMessage('STATUS', [ch.port2]);
    setTimeout(() => reject(new Error('no SW status')), 5000);
  }, reject);
}));

(async () => {
  console.log(build());
  const url = `http://127.0.0.1:${PORT}/`;
  // 1. online
  let srv = await serve(PORT, dist);
  let ctx = await chromium.launchPersistentContext(profile, { args: ARGS, viewport: { width: 1000, height: 700 } });
  let page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.AW && window.AW.ready, null, { timeout: 90000 });
  let st = { cached: 0, total: 1 };
  for (let i = 0; i < 60; i++) {
    st = await swStatus(page);
    if (st.cached >= st.total) break;
    await page.waitForTimeout(1000);
  }
  check(st.cached >= st.total && st.total > 0, `online visit stored everything: ${st.cached}/${st.total} files`);
  await ctx.close();
  srv.close();

  // 2. offline: no local server, no internet
  ctx = await chromium.launchPersistentContext(profile, { args: ARGS, viewport: { width: 1000, height: 700 }, proxy: { server: 'http://127.0.0.1:9' } });
  page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdnDown = await page.evaluate(() => fetch('https://example.com/', { mode: 'no-cors' }).then(() => false, () => true)).catch(() => true);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AW && window.AW.ready, null, { timeout: 60000 });
  const offlineBuild = await page.evaluate(() => window.AW_BUILD);
  check(!!offlineBuild, `offline page loaded build ${offlineBuild} (internet cut: ${cdnDown})`);
  // frames keep coming (the game is actually running, not just loaded)
  const frames = await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
  check(frames > 5, `offline frames rendered (three.js from the cache): ${frames} in 1 s`);
  const errs = [...errors, ...(await page.evaluate(() => window.AW.errors || []))];
  check(!errs.length, `no page errors offline ${errs.join(' | ')}`);
  await ctx.close();

  // 3. update: open the current build, then publish a new one into the same folder
  srv = await serve(PORT, dist);
  ctx = await chromium.launchPersistentContext(profile, { args: ARGS, viewport: { width: 1000, height: 700 } });
  page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.AW && window.AW.ready, null, { timeout: 60000 });
  const before = await page.evaluate(() => window.AW_BUILD);
  build('--build', 'update-test');
  const found = await page.evaluate(() => window.__pwa.check());
  check(found, 'update detected (version.json differs)');
  // the new worker must be installed and waiting before the page can switch to it
  let waiting = false;
  for (let i = 0; i < 60 && !waiting; i++) {
    waiting = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.waiting); });
    if (!waiting) await page.waitForTimeout(1000);
  }
  check(waiting, 'new service worker installed and waiting');
  await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.evaluate(() => window.__pwa.apply())]);
  await page.waitForFunction(() => window.AW_BUILD, null, { timeout: 30000 });
  const after = await page.evaluate(() => window.AW_BUILD);
  check(after === 'update-test' && before !== after, `apply() switched ${before} → ${after}`);
  await ctx.close();
  srv.close();
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
