// tools/smoke.mjs — on a PC (no headset): the charts follow the chosen rhythm, autoplay plays a short song to
// the end with the real collision code and gets top marks, the results are analysed per subdivision, and
// keyboard play, pause and resume work.
//   node tools/smoke.mjs
import { browser, serveApp } from './pw.mjs';

const { srv, base } = await serveApp();
const b = await browser();
const page = await b.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

await page.goto(base + '?quality=low&song=skank&length=short&mode=off&diff=normal&guide=fade&seed=11', { waitUntil: 'load' });
await until(() => window.__app && document.getElementById('loading').classList.contains('hidden'));

// 1. charts: which subdivisions each rhythm mode asks for
const charts = await page.evaluate(async () => {
  const { buildChart, chartSummary } = await import('./js/chart.js');
  const { GenPlayer } = await import('./js/player.js');
  const { songById } = await import('./js/songs.js');
  const out = {};
  for (const mode of ['on', 'off', 'mix', 'sync']) {
    for (const diff of ['easy', 'normal', 'hard']) {
      const p = new GenPlayer({}, songById('canopy'), { length: 'full' });
      const notes = buildChart({ bars: p.bars, grid: p.grid, mode, diff, seed: 3 });
      const c = chartSummary(notes);
      const sameHandTooFast = notes.filter((n) => n.kind !== 'duck').some((n, i, a) => a.slice(i + 1).find((m) => m.hand === n.hand && m.t - n.t < 0.26));
      const duckSteps = [...new Set(notes.filter((n) => n.kind === 'duck').map((n) => n.step))];
      out[`${mode}/${diff}`] = { ...c, total: notes.length, sameHandTooFast: !!sameHandTooFast, duckSteps };
    }
  }
  const p = new GenPlayer({}, songById('canopy'), {});
  out.seated = chartSummary(buildChart({ bars: p.bars, grid: p.grid, mode: 'off', diff: 'hard', seated: true, seed: 3 }));
  return out;
});
const pct = (c, k) => Math.round((100 * c[k]) / (c.on + c.and + c.six));
check(charts['on/normal'].and === 0 && charts['on/normal'].six === 0, `表拍: only beats (${charts['on/normal'].on} punches)`);
check(pct(charts['off/normal'], 'and') === 100, `裏拍 normal: all on "&" (${charts['off/normal'].and} punches)`);
check(pct(charts['off/hard'], 'and') >= 85 && charts['off/hard'].on === 0, `裏拍 hard: "&" plus sixteenth pickups (${pct(charts['off/hard'], 'and')}% "&", ${charts['off/hard'].six} pickups, no beats)`);
check(charts['mix/normal'].on > 10 && charts['mix/normal'].and > 10, `表裏ミックス: both (${charts['mix/normal'].on} beats, ${charts['mix/normal'].and} "&")`);
check(charts['sync/hard'].six > 10, `シンコペーション hard: sixteenth offbeats (${charts['sync/hard'].six})`);
check(Object.values(charts).every((c) => !c.sameHandTooFast), 'no hand is asked to punch twice within 0.26 s');
check(Object.entries(charts).filter(([k]) => k.includes('/')).every(([, c]) => c.duckSteps.every((s) => s === 0)), 'branches to duck under come only on the downbeat');
check(charts.seated.duck === 0, 'seated: no ducking');
check(charts['off/hard'].hook > 0 && charts['off/hard'].upper > 0 && charts['off/easy'].hook === 0, 'hooks and uppercuts on hard, none on easy');

// 2. autoplay a short song to the end
await page.click('#btn-auto');
await until(() => window.__app.state === 'play');
await until(() => window.__app.state === 'results', null, 150000);
const r = await page.evaluate(() => window.__app.lastResults);
check(r.rank === 'S' && r.acc >= 95, `autoplay to the end: rank ${r.rank}, accuracy ${r.acc}%, score ${r.score}, max combo ${r.maxCombo}`);
check(r.cat.and.n > 0 && r.cat.and.hit === r.cat.and.n && Math.abs(r.cat.and.mean) <= 20, `offbeat timing measured: ${r.cat.and.hit}/${r.cat.and.n}, mean ${r.cat.and.mean}ms, ±${r.cat.and.sd}ms`);
check(r.ducks === 0 || r.dodged === r.ducks, `branches dodged ${r.dodged}/${r.ducks}`);
check(await page.isVisible('#results') && (await page.textContent('#res-advice')).length > 10, `results shown with advice: 「${(await page.textContent('#res-advice')).slice(0, 40)}…」`);
await page.click('#r-menu');
await until(() => window.__app.state === 'menu' && !document.getElementById('menu').classList.contains('hidden'));
check(true, 'back to the menu');

// 3. keyboard play, pause, resume
await page.click('#btn-pc');
await until(() => window.__app.state === 'play' && window.__app.songT > 5, null, 30000);
for (let i = 0; i < 6; i++) { await page.keyboard.press(i % 2 ? 'KeyJ' : 'KeyF'); await page.waitForTimeout(250); }
await page.keyboard.press('Escape');
await until(() => window.__app.state === 'paused');
check(await page.isVisible('#pause'), 'Esc pauses (pause dialog)');
const tp = await page.evaluate(() => window.__app.pausedAt);
await page.click('#p-resume');
await until(() => window.__app.state === 'play');
await page.waitForTimeout(400);
const tr = await page.evaluate(() => window.__app.songT);
await until((tp) => window.__app.songT > tp + 0.5, tp, 15000); // one bar of count-in, then onward
check(tr < tp, `resume: one bar of count-in (song time ${tp.toFixed(1)} → ${tr.toFixed(1)}), then the song continues`);
await page.keyboard.press('Escape');
await until(() => window.__app.state === 'paused');
await page.click('#p-menu');
await until(() => window.__app.state === 'menu');
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
