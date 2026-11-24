// tests/offline.cjs — the published build must work with no network at all (PWA):
// bundle → serve → open once (the service worker caches every file) → store the hand-gesture pack from the
// settings → go offline and stop the server → reload → the title appears, a race runs (three.js from the cache),
// and the hand landmarker starts from the cached MediaPipe pack.
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
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-drift-offline-'));
  const { build, files, mb } = bundle(root, dist);
  log(`build ${build}: ${files} files, ${mb} MB to cache`);
  const srv = await serve(0, dist);
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  const errors = [];
  const outside = new Set();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !r.url().startsWith(base)) outside.add(u.hostname); });

  await page.goto(base + '?nosound&quality=low', { waitUntil: 'load' });
  await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 90000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => window.DD_PWA && window.DD_PWA.ready, null, { timeout: 60000 });
  const cached = await page.evaluate(async () => {
    const k = (await caches.keys()).find((x) => /^dream-drift-[0-9a-f]{12}$/.test(x));
    return { k, n: k ? (await (await caches.open(k)).keys()).length : 0 };
  });
  check(cached.n === files, `the install cached every file (${cached.n} of ${files}; ${cached.k})`);
  check(/オフラインでも あそべます/.test(await page.textContent('#offline-text')), `title: ${await page.textContent('#offline-text')}`);
  check([...outside].every((h) => /^fonts\.(googleapis|gstatic)\.com$/.test(h)), `only the web font comes from another site (${[...outside].join(', ') || 'none'})`);

  // the settings: store the hand-gesture pack for offline use
  await page.click('[data-act="settings"]').catch(() => {});
  await page.waitForFunction(() => document.getElementById('s-settings').classList.contains('show'), null, { timeout: 10000 }).catch(() => {});
  const before = await page.textContent('#hands-offline-text');
  check(await page.isVisible('#hands-save'), `settings: the hand-gesture pack can be stored (${before})`);
  await page.click('#hands-save');
  await page.waitForFunction(() => /オフラインで 使えます/.test(document.getElementById('hands-offline-text').textContent), null, { timeout: 120000 }).catch(() => {});
  check(await page.evaluate(() => window.DD_PWA.handsCached()), `settings: ${await page.textContent('#hands-offline-text')}`);

  // no network, no server
  await ctx.setOffline(true);
  await new Promise((r) => srv.close(r));
  await page.goto(base + '?nosound&quality=low', { waitUntil: 'load' }).catch((e) => errors.push('goto ' + e.message));
  await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 90000 }).catch(() => {});
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'offline: the page is served by the service worker');
  check(await page.evaluate(() => window.DD?.ready && window.DD.debug.state().screen === 's-title'), 'offline: the title appears');

  await page.goto(base + '?nosound&quality=low&course=1&autoplay&skipintro&cpu=3&laps=1', { waitUntil: 'load' }).catch((e) => errors.push('goto ' + e.message));
  await page.waitForFunction(() => window.DD?.ready && window.DD.debug.state().phase === 'race', null, { timeout: 90000 }).catch(() => {});
  const d0 = await page.evaluate(() => window.DD?.debug?.state()?.me?.raceDist || 0);
  // software rendering is slow: step the race (autoplay drives your kart) like tests/smoke.cjs does
  await page.evaluate(() => window.DD?.debug?.simulate(20)).catch((e) => errors.push('simulate ' + e.message));
  const d1 = await page.evaluate(() => window.DD?.debug?.state()?.me?.raceDist || 0);
  check(d1 > d0 + 5, `offline: a race runs (${d0.toFixed(1)} → ${d1.toFixed(1)} m)`);

  // the hand landmarker from the cached pack (CPU, no camera needed to create it)
  const hands = await page.evaluate(async () => {
    try {
      const mp = new URL('vendor/mediapipe', location.href).href;
      const vision = await import(mp + '/vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(mp + '/wasm');
      const lm = await vision.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: mp + '/hand_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2 });
      lm.close();
      return 'ok';
    } catch (e) { return String(e && e.message || e); }
  });
  check(hands === 'ok', `offline: the hand landmarker starts from the cache (${hands})`);
  const dd = await page.evaluate(() => (window.DD?.errors || []).slice(0, 3));
  check(!errors.length && !dd.length, `no page errors (${[...errors, ...dd].slice(0, 3).join(' | ')})`);
  await browser.close();
  fs.rmSync(dist, { recursive: true, force: true });
  if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
  console.log('\nall offline checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
