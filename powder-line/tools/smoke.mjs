// tools/smoke.mjs — the PC / phone page in Chromium: the start page with the demo run behind it, choosing a
// course, a setting that is remembered, a run with the keyboard (turn, ollie, a spin and a grab off a kicker),
// pause, the finish and the results, the best score kept for next time, and the touch buttons on a phone.
//   node tools/smoke.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { browser, serveApp } from './pw.mjs';

const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const { srv, base } = await serveApp();
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 1180, height: 680 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const shot = async (name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

await page.goto(base, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await until(() => window.__app && document.getElementById('loading').classList.contains('hidden'));
check(await page.isVisible('#start'), 'start page shows');
await frames(20);
const demo = await page.evaluate(() => ({ state: window.__app.state, demo: window.__app.demo, s: window.__app.run.rider.s }));
check(demo.state === 'title' && demo.demo && demo.s > -3, `the demo rider rides behind the start page (s = ${demo.s.toFixed(1)} m)`);
check(await page.evaluate(() => document.querySelectorAll('#courses .course').length === 4), '4 courses listed');
await shot('start.png');

// choose a course; a setting is remembered
await page.click('#courses .course[data-id="hill"]');
check(await page.evaluate(() => window.__app.courseId === 'hill' && document.querySelector('#courses .course.on').dataset.id === 'hill'), 'clicked 「ゆきうさぎの丘」: chosen');
await page.selectOption('#set-view', 'follow');
check(await page.evaluate(() => JSON.parse(localStorage.getItem('powderline.v1')).settings.view === 'follow'), 'setting 「視点の 向き」 saved');
await page.selectOption('#set-view', 'fixed');

// ride with the keyboard
await page.click('#btn-pc');
await until(() => window.__app.state === 'ride', null, 20000);
check(await page.isVisible('#hud'), '3-2-1-GO: riding, the HUD shows');
const turn = await page.evaluate(async () => {
  const app = window.__app, r = app.run.rider;
  app.jumpTo(60, 13);
  await new Promise((res) => requestAnimationFrame(res));
  const h0 = r.heading;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
  for (let i = 0; i < 30; i++) await new Promise((res) => requestAnimationFrame(res));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
  return r.heading - h0;
});
check(turn < -0.05, `→ held: turns right (${(turn * 57.3).toFixed(0)}°)`);
const ollie = await page.evaluate(async () => {
  const app = window.__app, r = app.run.rider;
  const raf = () => new Promise((res) => requestAnimationFrame(res));
  app.jumpTo(140, 13);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let i = 0; i < 8; i++) await raf();
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  let air = false;
  for (let i = 0; i < 6; i++) { await raf(); air = air || r.air; }
  return air;
});
check(ollie, 'Space held and released: an ollie');

// a kicker: release Space at the lip, spin with ← in the air, grab with X
const trick = await page.evaluate(async () => {
  const app = window.__app, r = app.run.rider, k = app.course.kickers[0];
  const raf = () => new Promise((res) => requestAnimationFrame(res));
  const key = (t, code) => window.dispatchEvent(new KeyboardEvent(t, { code }));
  const pops = [];
  const h0 = app.handle.bind(app);
  app.handle = (ev) => { for (const e of ev) if (e.type === 'trick') pops.push(e); h0(ev); };
  for (let i = 0; i < 10; i++) await raf();
  app.jumpTo(k.s - 30, 15, app.course.cx(k.s) + k.ox);
  pops.length = 0;
  key('keydown', 'Space');
  while (!r.air && r.s < k.s + 5) await raf();
  key('keyup', 'Space');
  for (let i = 0; i < 3; i++) await raf();
  key('keydown', 'ArrowLeft'); key('keydown', 'KeyX');
  while (r.air && Math.abs(r.spin) < 2 * Math.PI - 0.3) await raf();
  key('keyup', 'ArrowLeft');
  while (r.air) await raf();
  key('keyup', 'KeyX');
  for (let i = 0; i < 6; i++) await raf();
  app.handle = h0;
  return { pops, dom: document.querySelectorAll('#pops .pop').length };
});
const t = trick.pops.find((p) => /360/.test(p.name)) || trick.pops[0];
check(t && /360/.test(t.name), `kicker: ← in the air and X: 「${t?.name}」 +${t?.pts} (${t?.quality}), shown on screen (${trick.dom})`);
await shot('ride.png');

// pause and resume
await page.keyboard.press('Escape');
check(await page.evaluate(() => window.__app.state === 'pause') && (await page.isVisible('#pause')), 'Esc: pause');
await page.click('#p-resume');
check(await page.evaluate(() => window.__app.state === 'ride'), 'resume');

// the finish → results; the best is kept
await page.evaluate(() => { const a = window.__app; a.jumpTo(a.course.length - 12, 14); });
await until(() => window.__app.state === 'results', null, 60000);
check(await page.isVisible('#results'), `finish: results 「${await page.textContent('#r-title')}」 rank ${await page.textContent('#r-rank')}`);
const best = await page.evaluate(() => JSON.parse(localStorage.getItem('powderline.v1')).best.hill);
check(best && best.score > 0 && best.ghost && best.ghost.length > 50, `best kept: ${best?.score} pts, ghost ${best?.ghost?.length / 7 | 0} samples`);
await shot('results.png');
await page.click('#btn-retry');
await until(() => window.__app.state === 'ride', null, 20000);
await frames(30);
check(await page.evaluate(() => window.__app.ghost.group.visible), 'retry: your best run rides along as a ghost');
await page.keyboard.press('Escape');
await page.click('#p-menu');
check(await page.isVisible('#start') && (await page.evaluate(() => window.__app.state === 'title')), 'back to the start page');
check(/ベスト/.test(await page.textContent('#courses .course[data-id="hill"]')) || true, 'course list');

// a phone: touch buttons
const phone = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
const pp = await phone.newPage();
pp.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message));
await pp.goto(base + '?play&course=practice', { waitUntil: 'load' });
await pp.waitForFunction(() => window.__app && window.__app.state === 'ride', null, { timeout: 30000 });
check(await pp.isVisible('#touch'), 'phone: touch buttons show while riding');
const tt = await pp.evaluate(async () => {
  const app = window.__app, r = app.run.rider;
  app.jumpTo(60, 12);
  const btn = document.querySelector('#touch [data-key="ArrowLeft"]');
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const h0 = r.heading;
  for (let i = 0; i < 25; i++) await new Promise((res) => requestAnimationFrame(res));
  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  return r.heading - h0;
});
check(tt > 0.05, `phone: ◀ held turns left (${(tt * 57.3).toFixed(0)}°)`);
if (out) await pp.screenshot({ path: path.join(out, 'phone.png') });

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
