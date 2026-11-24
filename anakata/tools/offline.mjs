// tools/offline.mjs — the published build must work with no network at all:
// bundle → serve → open once (the service worker caches every file) → go offline and stop the server →
// reload → the start sheet appears, every chapter opens and draws (three.js and the code come from the cache).
//   node tools/offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';
import { browser, serveApp } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'anakata-'));
const { build, files } = bundle(root, dist);
console.log(`[offline] build ${build}, ${files} files to cache`);
const { srv, base } = await serveApp(dist);
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };

await page.goto(base, { waitUntil: 'load' });
await page.evaluate(() => navigator.serviceWorker.ready);
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const k = keys.find((x) => x.startsWith('anakata-'));
  return { keys, n: k ? (await (await caches.open(k)).keys()).length : 0 };
});
check(cached.n === files, `service worker cached ${cached.n}/${files} files (${cached.keys.join(', ')})`);
await page.waitForFunction(() => document.getElementById('offline').classList.contains('ok'), null, { timeout: 10000 });
check(true, `status: ${await page.textContent('#offline-text')}`);

// no network, no server
await ctx.setOffline(true);
await new Promise((r) => srv.close(r));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__app && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 60000 });
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'offline reload is served by the service worker');
check(await page.isVisible('#start'), 'start sheet shows offline');
await page.click('#btn-pc');
for (let ch = 1; ch <= 6; ch++) {
  await page.evaluate((ch) => window.__app.go(ch, ch === 6 ? 2 : 1), ch);
  await page.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k > 10 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  const info = await page.evaluate(() => ({ title: window.__app.current.title, calls: window.__app.renderer.info.render.calls }));
  check(info.calls > 3, `offline: chapter ${ch} 「${info.title}」 draws (${info.calls} draw calls)`);
}
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await b.close();
fs.rmSync(dist, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
