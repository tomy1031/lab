// tests/offline.cjs — the published build must work with no network at all (PWA):
// bundle → serve → open once (the service worker caches every file) → go offline and stop the server →
// reload → the title appears; a quick game starts with the companion's VRM from the cache; the hand-gesture
// pack can be stored for offline too.
//   node tests/offline.cjs
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');

const fail = [];
const log = (...a) => console.log('[offline]', ...a);
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

(async () => {
  const root = path.resolve(__dirname, '..');
  const { bundle } = await import(path.join(root, 'tools', 'bundle.mjs'));
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'island-offline-'));
  const { build, files, mb } = bundle(root, dist);
  log(`build ${build}: ${files} files, ${mb} MB to cache`);
  const srv = await serve(0, dist);
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?nosound&quality=low', { waitUntil: 'load' });
  await page.waitForFunction(() => window.ISLE?.ready, null, { timeout: 120000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => window.ISLE.pwa?.ready, null, { timeout: 120000 });
  const cached = await page.evaluate(async () => { const k = (await caches.keys()).find((x) => /^hitotsu-island-[0-9a-f]/.test(x)); const c = await caches.open(k); return { key: k, n: (await c.keys()).length }; });
  check(cached.key && cached.n >= files, `the install cached every file (${cached.n} of ${files})`);
  // store the hand-gesture pack too, while still online
  await page.evaluate(() => window.ISLE.pwa.cacheHands());
  await page.waitForFunction(() => window.ISLE.pwa.handsCached(), null, { timeout: 120000, polling: 500 }).catch(() => {});
  check(await page.evaluate(() => window.ISLE.pwa.handsCached()), 'the hand-gesture pack is stored for offline');

  // cut the network and stop the server
  await ctx.setOffline(true);
  await new Promise((r) => srv.close(r));
  await page.goto(base + '?nosound&quality=low', { waitUntil: 'load' }).catch((e) => errors.push('goto ' + e.message));
  await page.waitForFunction(() => window.ISLE?.ready, null, { timeout: 120000 }).catch(() => {});
  const title = await page.evaluate(() => ({ ready: !!window.ISLE?.ready, screen: window.ISLE?.game?.screens?.current, buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 6) }));
  check(title.ready && title.screen === 'title', `offline: the title appears (${title.buttons.join(' / ')})`);
  await page.goto(base + '?quick&nosound&quality=low&companion=nagi&seed=4', { waitUntil: 'load' }).catch((e) => errors.push('goto ' + e.message));
  const ok = await page.waitForFunction(() => window.ISLE?.game?.running && window.ISLE.game.sys.companion?.ready, null, { timeout: 120000 }).then(() => true).catch(() => false);
  const st = await page.evaluate(() => ({ running: !!window.ISLE?.game?.running, comp: !!window.ISLE?.game?.sys?.companion?.ready, errs: window.ISLE?.errors?.slice(0, 3) }));
  check(ok && st.running && st.comp, `offline: a game starts and the companion (VRM) loads from the cache (${JSON.stringify(st)})`);
  const mp = await page.evaluate(async () => { try { const r = await fetch('vendor/mediapipe/hand_landmarker.task'); return r.ok ? (await r.arrayBuffer()).byteLength : 0; } catch { return -1; } });
  check(mp > 1e6, `offline: the hand model comes from the cache (${mp} bytes)`);
  check(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`);
  await browser.close();
  fs.rmSync(dist, { recursive: true, force: true });
  if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
  console.log('\nall offline checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
