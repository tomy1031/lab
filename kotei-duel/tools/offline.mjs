// tools/offline.mjs — the published build must work with no network at all:
// bundle → serve → open once (the service worker caches every file) → go offline and stop the server →
// reload → the title page and the demo duel appear (three.js, the data and the code come from the cache) →
// a chapter starts and a stage is placed. Also checks the web app manifest and the icons.
//   node tools/offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';
import { browser, serveApp } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'koteiduel-'));
const { build, files } = bundle(root, dist);
console.log(`[offline] build ${build}, ${files} files to cache`);
const { srv, base } = await serveApp(dist);
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };

// the manifest: installable
const man = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
check(man.display === 'standalone' && man.icons.some((i) => i.sizes === '512x512') && man.icons.some((i) => i.purpose === 'maskable') && man.start_url === './', 'manifest: standalone, 192/512 and maskable icons, relative start URL');
for (const i of man.icons) check(fs.existsSync(path.join(dist, i.src)), `icon ${i.src} is in the build`);

await page.goto(base, { waitUntil: 'load' });
await page.evaluate(() => navigator.serviceWorker.ready);
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const k = keys.find((x) => x.startsWith('koteiduel-'));
  return { keys, n: k ? (await (await caches.open(k)).keys()).length : 0 };
});
check(cached.n === files, `the service worker cached ${cached.n}/${files} files (${cached.keys.join(', ')})`);
await page.waitForFunction(() => document.getElementById('offline').classList.contains('ok'), null, { timeout: 15000 });
check(true, `status on the title page: ${await page.textContent('#offline-text')}`);

// no network, no server
await ctx.setOffline(true);
await new Promise((r) => srv.close(r));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__app && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 60000 });
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the offline reload is served by the service worker');
check(await page.isVisible('#start'), 'the title page shows offline');
await page.waitForFunction(() => window.__app.D && window.__app.D.turn >= 1, null, { timeout: 30000 });
check(await page.evaluate(() => window.__app.renderer.info.render.calls > 20), 'the 3D table and the demo duel draw offline');
// start chapter 1 and place the first stage
await page.click('#btn-play');
await page.waitForSelector('#modal:not(.hidden)');
await page.click('#modal .btns button.primary');
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(300);
  if (await page.isVisible('#bubble .bbtn button')) { await page.click('#bubble .bbtn button'); continue; }
  if (await page.isVisible('#modal .btns button.primary')) { await page.click('#modal .btns button.primary'); continue; }
  if (await page.evaluate(() => window.__app.tutStep()?.want.type === 'place' && window.__app.D.canAct())) break;
}
await page.evaluate(() => { const A = window.__app; A.onPick({ kind: 'plan', idx: 0 }); A.onButton('place'); });
await page.waitForFunction(() => !!window.__app.D.placed[0], null, { timeout: 20000 });
check(true, 'offline: chapter 1 starts and the first stage is placed');
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await b.close();
fs.rmSync(dist, { recursive: true, force: true });
console.log(ok ? 'offline: all ok' : 'offline: FAILED');
process.exit(ok ? 0 : 1);
