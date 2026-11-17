#!/usr/bin/env node
// Smoke test: boot the game, play scenarios end to end in offline practice mode (fake mic, tapping
// the suggested answers), and check that every scene loads without errors and reaches the report.
//   node tests/smoke.mjs [variantIds…] [--shots <dir>] [--all]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const shotsAt = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
let ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots');
if (args.includes('--all')) {
  ids = [];
  for (const [dir, prefix] of [['lessons', 'l'], ['business', 'b']]) {
    const d = new URL(`../data/${dir}/`, import.meta.url);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => new RegExp(`^${prefix}\\d\\d\\.json$`).test(x)).sort()) {
      const l = JSON.parse(fs.readFileSync(new URL(f, d)));
      ids.push(...l.variants.map((v) => v.id));
    }
  }
}
if (!ids.length) ids = ['l01a'];
if (shotsAt) fs.mkdirSync(shotsAt, { recursive: true });

const srv = await serve(0);
const url = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push(m.text()); });

await page.goto(url);
await page.waitForFunction('window.KT && window.KT.ready', null, { timeout: 90000 });
if (shotsAt) await page.screenshot({ path: path.join(shotsAt, '00-landing.png'), timeout: 180000 });
// no speech synthesis in tests: lines play as reading time
await page.evaluate(() => { window.KT.store.settings.noSynth = true; window.KT.store.settings.rate = 1; });
await page.click('#play-pc');
await page.waitForFunction('window.KT.state.where === "town"', null, { timeout: 60000 });
await page.waitForTimeout(800);
if (shotsAt) await page.screenshot({ path: path.join(shotsAt, '01-town.png'), timeout: 180000 });

let failed = 0;
for (const id of ids) {
  const t0 = Date.now();
  try {
    await page.evaluate((v) => window.KT.open(v), id);
    await page.waitForFunction('window.KT.state.where === "brief"', null, { timeout: 60000 });
    await page.waitForTimeout(700);
    if (shotsAt) await page.screenshot({ path: path.join(shotsAt, `${id}-1-brief.png`), timeout: 180000 });
    await page.evaluate(() => { window.KT.start(); });
    let turns = 0; let shot = false;
    for (let i = 0; i < 400; i++) {
      const st = await page.evaluate(() => ({ where: window.KT.state.where, cur: !!(window.KT.runner && window.KT.runner.cur), busy: window.KT.runner?.npcBusy }));
      if (st.where === 'report') break;
      if (st.cur && !st.busy) {
        if (shotsAt && !shot) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(shotsAt, `${id}-2-turn.png`), timeout: 180000 }); shot = true; }
        await page.evaluate(() => { const r = window.KT.runner; const c = r.cur; if (!c || c.free) { r.endFree?.(); return; } const ch = c.li.branches[Math.floor(Math.random() * c.li.branches.length)]; r.choose(ch.exampleJa); });
        turns++;
      }
      await page.waitForTimeout(250);
    }
    await page.waitForFunction('window.KT.state.where === "report"', null, { timeout: 30000 });
    await page.waitForTimeout(600);
    if (shotsAt) await page.screenshot({ path: path.join(shotsAt, `${id}-3-report.png`), timeout: 180000 });
    const rep = await page.evaluate(() => window.KT.lastReport);
    console.log(`✓ ${id}: ${turns} answers, ${rep.turns.length} turns recorded, ${rep.report.stars}★, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } catch (e) {
    failed++;
    console.log(`✗ ${id}: ${String(e).split('\n')[0]}`);
    if (shotsAt) await page.screenshot({ path: path.join(shotsAt, `${id}-fail.png`) }).catch(() => {});
  }
}
const kt = await page.evaluate(() => ({ errors: window.KT.errors }));
const all = [...errors, ...kt.errors];
if (all.length) console.log('ERRORS:\n' + [...new Set(all)].slice(0, 20).join('\n'));
await browser.close();
srv.close();
process.exit(failed || all.length ? 1 : 0);
