// tools/offline.mjs — the published build must work with no network at all:
// bundle → serve → open once (the service worker caches the game) → download a small area (pretend
// internet) → go offline AND stop the server → reload → the page, the saved area and its map all come
// from this browser → fly it.
//   node tools/offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';
import { browser, serveApp } from './pw.mjs';
import { mockNet } from './mock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-atlas-'));
const { build, files } = bundle(root, dist);
console.log(`[offline] build ${build}, ${files} files to cache`);
const { srv, base } = await serveApp(dist);
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 1000, height: 600 } });
let offline = false;
const count = await mockNet(ctx, { offline: () => offline });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

await page.goto(base + '?quality=low', { waitUntil: 'load' });
await page.evaluate(() => navigator.serviceWorker.ready);
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const k = keys.find((x) => x.startsWith('sky-atlas-app-'));
  return { keys, n: k ? (await (await caches.open(k)).keys()).length : 0 };
});
check(cached.n === files, `service worker cached ${cached.n}/${files} files of the game`);
await until(() => document.getElementById('offline').classList.contains('ok'));
check(true, `status: ${await page.textContent('#offline')}`);

// download 富士山 at 10 km
await page.click('#radius [data-arg="10"]');
await page.click('#presets .place:first-child [data-act="dl"]');
await until(() => window.__app.store.list.length === 1 && window.__app.store.list[0].done && !window.__app.ui.dl, null, 120000);
const rec = await page.evaluate(() => window.__app.store.list[0]);
check(rec.done, `downloaded ${rec.name}: ${rec.tiles} tiles (${Math.round(rec.bytes / 1024)} KB, ${count.tiles} requests)`);

// no network, no server
offline = true;
await ctx.setOffline(true);
await new Promise((r) => srv.close(r));
await page.reload({ waitUntil: 'load' });
await until(() => window.__app && window.__app.firstFrame, null, 60000);
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'offline reload is served by the service worker');
check(await page.evaluate(() => !navigator.onLine), 'the page knows it is offline');
const savedText = await page.textContent('#saved');
check(/富士山/.test(savedText) && /ダウンロード済み/.test(savedText), 'the downloaded area is listed offline');
const tilesBefore = count.tiles;
await page.click('#saved .place [data-act="fly"]');
await until(() => window.__app.state === 'screen' && window.__app.world.terrain.started, null, 30000);
// come down to 250 m over the slope and let the ground sharpen
await page.evaluate(() => { const a = window.__app; a.rig.position.set(1500, a.world.terrain.heightAt(1500, 1500).h + 250, 1500); a.flight.vel.set(0, 0, 0); a.sin.pitch = -0.4; });
await until(() => { const a = window.__app, t = a.world.terrain; a.rig.position.y = Math.max(a.rig.position.y, t.heightAt(1500, 1500).h + 250); return t.stats.maxZ >= 15 && t.stats.loading === 0 && t.queue.length === 0; }, null, 90000);
const st = await page.evaluate(() => { const w = window.__app.world; return { maxZ: w.terrain.stats.maxZ, vis: w.terrain.stats.visible, h: Math.round(w.terrain.heightAt(0, 0).h), err: [...w.terrain.res.values()].filter((r) => r.state === 'error').length }; });
check(st.maxZ >= 15 && st.err === 0, `flying offline: ground to zoom ${st.maxZ}, ${st.vis} tiles, summit ${st.h} m, ${st.err} errors`);
check(count.tiles === tilesBefore, 'not a single tile request went out');
await page.keyboard.down('KeyW');
await page.waitForTimeout(800);
await page.keyboard.up('KeyW');
check(await page.evaluate(() => window.__app.flight.speed > 1), 'W flies offline');
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await b.close();
fs.rmSync(dist, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
