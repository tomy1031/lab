// tests/offline.mjs — the published build must work with no network at all (PWA):
// bundle → serve → open once (the service worker caches every file) → go offline and stop the server →
// reload → the menu appears and a demo (CPU vs CPU) plays points, everything from the cache.
//   node tests/offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '../tools/bundle.mjs';
import { serve } from './serve.mjs';
import { launch } from './browser.mjs';

const log = (...a) => console.log('[offline]', ...a);
const fail = [];
const check = (c, m) => { log(c ? 'ok  ' : 'FAIL', m); if (!c) fail.push(m); };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'rally-court-'));
const { build, files, mb } = bundle(root, dist);
log(`build ${build}: ${files} files, ${mb} MB to cache`);
const srv = await serve(0, dist);
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const page = await ctx.newPage();
const errors = [];
const outside = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url()); });

await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => window.RC && window.RC.ready, null, { timeout: 60000 });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForFunction(() => window.RC_PWA && window.RC_PWA.ready, null, { timeout: 60000 });
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const k = keys.find((x) => x.startsWith('rally-court-'));
  return { keys, n: k ? (await (await caches.open(k)).keys()).length : 0 };
});
check(cached.n === files, `the install cached every file (${cached.n} of ${files}; ${cached.keys.join(', ')})`);
check(/オフラインでも遊べます/.test(await page.textContent('#offline-note')), `status: ${await page.textContent('#offline-note')}`);
check(outside.length === 0, `nothing is loaded from other sites (${outside.slice(0, 3).join(', ')})`);

// no network, no server
await ctx.setOffline(true);
await new Promise((r) => srv.close(r));
await page.goto(base + '?demo&seed=3&fast=4', { waitUntil: 'load' }).catch((e) => errors.push('goto ' + e.message));
await page.waitForFunction(() => window.RC && window.RC.ready, null, { timeout: 60000 }).catch(() => {});
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'offline: the page is served by the service worker');
check(await page.evaluate(() => !!(window.RC && window.RC.ready)), 'offline: the game starts (three.js from the cache)');
await page.waitForFunction(() => RC.game.events.filter((e) => e.type === 'point').length >= 1, null, { timeout: 90000 }).catch(() => {});
const pts = await page.evaluate(() => (window.RC && RC.game ? RC.game.events.filter((e) => e.type === 'point').length : 0));
check(pts >= 1, `offline: the demo plays points (${pts})`);
const ge = await page.evaluate(() => [...(window.RC?.errors || []), ...(window.RC?.game?.errors || [])]);
check(errors.length === 0 && ge.length === 0, `no page errors ${[...errors, ...ge].slice(0, 3).join(' | ')}`);
await browser.close();
fs.rmSync(dist, { recursive: true, force: true });
if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
console.log('\nall offline checks passed');
