#!/usr/bin/env node
// Offline test (PWA): the published build must work with no network once it has been opened.
//   bundle → serve → open once (the service worker stores the town) → store every recorded voice from the settings
//   → a new build: 「新しい バージョンに 更新」 → the page reloads on it, the voices are kept, a stale one is dropped
//   → go offline and stop the server → reload → play a scene to the report in offline practice, the NPC voices
//   coming from the cache.
//   node tests/offline.mjs [variantId=l01a]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { bundle } from '../tools/bundle.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const variant = process.argv[2] || 'l01a';
const fail = [];
const log = (...a) => console.log('[offline]', ...a);
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'kotoba-town-offline-'));
const first = bundle(root, dist);
log(`build ${first.build}: ${first.files} files, ${first.mb} MB to cache; ${first.voices} voices (${first.voiceMb} MB) on use`);
const srv = await serve(0, dist);
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
const outside = new Set();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !r.url().startsWith(base)) outside.add(u.hostname); });

await page.goto(base);
await page.waitForFunction('window.KT && window.KT.ready', null, { timeout: 90000 });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForFunction(() => window.KT_PWA && window.KT_PWA.ready, null, { timeout: 60000 });
const cached = await page.evaluate(async () => {
  const k = (await caches.keys()).find((x) => /^kotoba-town-[0-9a-f]{12}$/.test(x));
  return { k, n: k ? (await (await caches.open(k)).keys()).length : 0 };
});
check(cached.n === first.files, `the install stored every file (${cached.n} of ${first.files}; ${cached.k})`);
check(/オフラインでも/.test(await page.textContent('#offline-state')), `start page: ${await page.textContent('#offline-state')}`);
check([...outside].every((h) => /^fonts\.(googleapis|gstatic)\.com$/.test(h)), `only the web font comes from another site (${[...outside].join(', ') || 'none'})`);

// the settings: store every recorded voice
await page.click('#open-settings');
await page.waitForSelector('#voice-save', { state: 'visible', timeout: 10000 });
check(true, `settings: ${await page.textContent('#voice-offline-text')}`);
await page.click('#voice-save');
await page.waitForFunction(() => /ぜんぶ オフラインで/.test(document.getElementById('voice-offline-text').textContent), null, { timeout: 300000 }).catch(() => {});
const v1 = await page.evaluate(() => window.KT_PWA.voices());
check(v1.total === first.voices && v1.stored === v1.total, `settings: every voice is stored (${v1.stored} of ${v1.total}) — ${await page.textContent('#voice-offline-text')}`);
await page.click('#set-cancel');

// a new build: the update button, then the page runs on it; the voices stay, a stale recording is dropped
const stale = base + 'audio/voice/l01a/n1_0.mp3?v=0000000000';
await page.evaluate((u) => caches.open('kotoba-town-voice').then((c) => c.put(u, new Response('old'))), stale);
const second = bundle(root, dist, 'feedfacecafe');
await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
await page.waitForSelector('#update-btn', { state: 'visible', timeout: 60000 }).catch(() => {});
check(await page.isVisible('#update-btn'), 'a new build offers 「新しい バージョンに 更新」');
await Promise.all([page.waitForEvent('load', { timeout: 60000 }).catch(() => {}), page.click('#update-btn').catch(() => {})]);
await page.waitForFunction('window.KT && window.KT.ready && window.KT_PWA && window.KT_PWA.ready', null, { timeout: 90000 }).catch(() => {});
const after = await page.evaluate(async (u) => ({ build: window.KT_BUILD, keys: await caches.keys(), stale: !!(await (await caches.open('kotoba-town-voice')).match(u)), voices: await window.KT_PWA.voices() }), stale);
check(after.build === second.build && after.keys.includes('kotoba-town-feedfacecafe') && !after.keys.includes(`kotoba-town-${first.build}`), `the page reloaded on the new build (${after.build}; ${after.keys.join(', ')})`);
check(!after.stale && after.voices.stored === after.voices.total, `voices kept across builds (${after.voices.stored} of ${after.voices.total}), the stale recording dropped`);

// no network, no server
await ctx.setOffline(true);
await new Promise((r) => srv.close(r));
await page.goto(base).catch((e) => errors.push('goto ' + e.message));
await page.waitForFunction('window.KT && window.KT.ready', null, { timeout: 90000 }).catch(() => {});
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'offline: the page is served by the service worker');
check(/オフライン/.test(await page.textContent('#offline-state')), `offline: start page says ${await page.textContent('#offline-state')}`);
const voiceHits = [];
page.on('response', (r) => { if (/\/audio\/voice\/.+\.mp3\?v=/.test(r.url())) voiceHits.push({ ok: r.ok(), sw: r.fromServiceWorker() }); });
await page.evaluate(() => { window.KT.store.settings.noSynth = true; window.KT.store.settings.rate = 1; });
await page.click('#play-pc');
await page.waitForFunction('window.KT.state.where === "town"', null, { timeout: 60000 }).catch(() => {});
check(await page.evaluate(() => window.KT.state.where === 'town'), 'offline: the town opens');
let turns = 0;
try {
  await page.evaluate((v) => window.KT.open(v), variant);
  await page.waitForFunction('window.KT.state.where === "brief"', null, { timeout: 60000 });
  await page.evaluate(() => { window.KT.start(); });
  for (let i = 0; i < 1600; i++) {
    const st = await page.evaluate(() => ({ where: window.KT.state.where, cur: !!(window.KT.runner && window.KT.runner.cur), busy: window.KT.runner?.npcBusy }));
    if (st.where === 'report') break;
    if (st.cur && !st.busy) {
      await page.evaluate(() => { const r = window.KT.runner; const c = r.cur; if (!c || c.free) { r.endFree?.(); return; } r.choose(c.li.branches[0].exampleJa); });
      turns++;
    }
    await page.waitForTimeout(250);
  }
  await page.waitForFunction('window.KT.state.where === "report"', null, { timeout: 90000 });
} catch (e) { errors.push(String(e).split('\n')[0]); }
check(await page.evaluate(() => window.KT.state.where === 'report'), `offline: scene ${variant} runs to the report (${turns} answers, offline practice)`);
check(voiceHits.length > 0 && voiceHits.every((h) => h.ok && h.sw), `offline: the NPC voices come from the cache (${voiceHits.length} lines)`);
const kt = await page.evaluate(() => window.KT.errors.slice(0, 5));
check(!errors.length && !kt.length, `no page errors (${[...errors, ...kt].slice(0, 3).join(' | ')})`);
await browser.close();
fs.rmSync(dist, { recursive: true, force: true });
if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
console.log('\nall offline checks passed');
