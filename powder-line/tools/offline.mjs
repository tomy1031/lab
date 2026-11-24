// tools/offline.mjs — the published build must work with no network at all:
// bundle → serve → open once (the service worker caches every file) → go offline and stop the server →
// reload → the start page appears, every course loads and a run starts (three.js and the code come from the cache).
//   node tools/offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';
import { browser, serveApp } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'powderline-'));
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
  const k = keys.find((x) => x.startsWith('powderline-'));
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
check(await page.isVisible('#start'), 'start page shows offline');
for (const id of ['practice', 'hill', 'glacier', 'aurora']) {
  await page.evaluate((id) => window.__app.loadCourse(id), id);
  await page.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k > 8 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  const info = await page.evaluate(() => ({ name: window.__app.course.name, calls: window.__app.renderer.info.render.calls }));
  check(info.calls > 10, `offline: 「${info.name}」 draws (${info.calls} draw calls)`);
}
await page.click('#btn-pc');
await page.waitForFunction(() => window.__app.state === 'ride', null, { timeout: 30000 });
check(true, 'offline: a run starts');
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await b.close();
fs.rmSync(dist, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
