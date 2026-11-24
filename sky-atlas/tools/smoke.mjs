// tools/smoke.mjs — the whole loop on a screen, with a pretend internet (tools/mock.mjs):
// menu → search → choose a small area → download it (tiles + buildings) → cut the network → fly it on the
// screen (ground, buildings, height, the ground clamp, the edge) → no request left the browser while
// offline → delete it → its tiles are gone.
//   node tools/smoke.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { browser, serveApp } from './pw.mjs';
import { mockNet, MOUNT } from './mock.mjs';

const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };

const { srv, base } = await serveApp();
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 1100, height: 680 } });
let offline = false;
const count = await mockNet(ctx, { offline: () => offline });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

await page.goto(base + '?quality=low', { waitUntil: 'load' });
await until(() => window.__app && window.__app.firstFrame);
check(await page.isVisible('#menu'), 'menu page shows');
const nPresets = (await page.$$('#presets .place')).length;
check(nPresets >= 40, `${nPresets} famous places listed`);
await page.click('#cats [data-arg="sight"]');
const sights = await page.$$eval('#presets .place b', (els) => els.map((e) => e.textContent));
check(sights.length >= 8 && sights.includes('マチュピチュ') && sights.some((n) => n.includes('万里の長城')) && !sights.includes('富士山'), `名所・遺跡 filter: ${sights.length} places (${sights.slice(0, 4).join('・')}…)`);
await page.click('#cats [data-arg="all"]');

// settings: the smallest radius, aerial photos on, buildings on
await page.click('#radius [data-arg="10"]');
check(await page.evaluate(() => window.__app.settings.radius === 10), 'radius 10 km chosen');

// search → a result card with a download button
await page.fill('#q', 'テスト');
await page.click('#search button');
await until(() => document.querySelectorAll('#results .place').length > 0);
check(count.nominatim === 1, 'searched the place name (Nominatim)');
const est = await page.textContent('#results .place .meta');
check(/約 \d+/.test(est) && /高精細写真/.test(est) && /建物/.test(est), `card shows the estimate: ${est.trim()}`);
await shot(page, '1-menu.png');

// download it
await page.click('#results .place [data-act="dl"]');
await until(() => document.querySelector('#results .prog'), null, 10000);
check(true, 'download started (progress bar)');
await until(() => window.__app.store.list.length === 1 && window.__app.store.list[0].done && !window.__app.ui.dl, null, 120000);
const rec = await page.evaluate(() => window.__app.store.list[0]);
check(rec.done && rec.failed === 0, `saved: ${rec.tiles} items, ${Math.round(rec.bytes / 1024)} KB, ${rec.bcount} buildings`);
check(rec.bcount === 81 && rec.wcount === 2, `buildings packed from Overpass (${rec.bcount}) and a city wall (${rec.wcount} pieces)`);
const cached = await page.evaluate(async () => {
  const { Plan } = await import('./js/plan.js');
  const p = new Plan(window.__app.store.list[0]);
  const c = await caches.open('sky-atlas-tiles-v1');
  // each job: a stored tile, or every source known to have none (an aerial 404 past the satellite's zoom)
  let have = 0, none = 0, unresolved = 0, noneLowZoom = 0;
  for (const j of p.jobs()) {
    let got = false, allMissing = true;
    for (const u of j.urls) {
      const r = await c.match(u);
      if (r && !r.headers.get('x-sky-missing')) { got = true; break; }
      if (!r) allMissing = false;
    }
    if (got) have++;
    else if (allMissing) { none++; if (!/seamlessphoto\/1[5-7]\//.test(j.urls[0])) noneLowZoom++; }
    else unresolved++;
  }
  const keys = (await c.keys()).length;
  return { have, none, unresolved, noneLowZoom, jobs: p.jobs().length, keys, aerial: p.aerial && p.aerial.id };
});
check(cached.unresolved === 0 && cached.have + cached.none === cached.jobs, `every planned tile is in the store (${cached.have} stored + ${cached.none} known missing = ${cached.jobs}, aerial: ${cached.aerial})`);
check(cached.none > 0 && cached.noneLowZoom === 0, 'aerial 404s fell back to the satellite mosaic where it exists (only zoom 15–17 photos are absent)');
await shot(page, '2-saved.png');

// cut the network and fly the saved area on the screen
offline = true;
await ctx.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event('offline')));
const before = { ...count };
await page.click('#saved .place [data-act="fly"]');
await until(() => window.__app.state === 'screen' && window.__app.world.terrain.started, null, 30000);
check(await page.isVisible('#hud'), 'flying on the screen: HUD shows');
// come down to 250 m over the slope and let the ground sharpen
await page.evaluate(() => { const a = window.__app; a.rig.position.set(1500, a.world.terrain.heightAt(1500, 1500).h + 250, 1500); a.flight.vel.set(0, 0, 0); a.sin.pitch = -0.4; });
await until(() => { const a = window.__app, t = a.world.terrain; a.rig.position.y = Math.max(a.rig.position.y, t.heightAt(1500, 1500).h + 250); return t.stats.maxZ >= 15 && t.stats.loading === 0 && t.queue.length === 0; }, null, 90000);
const st = await page.evaluate(() => {
  const a = window.__app, w = a.world;
  return { maxZ: w.terrain.stats.maxZ, vis: w.terrain.stats.visible, h: w.terrain.heightAt(0, 0), b: w.buildings && w.buildings.stats, errs: [...w.terrain.res.values()].filter((r) => r.state === 'error').length };
});
check(st.maxZ >= 15, `ground sharpened offline to zoom ${st.maxZ} (${st.vis} tiles drawn)`);
check(st.errs === 0, 'no tile failed to load from the store');
check(Math.abs(st.h.h - (MOUNT.h + 50)) < 120, `height at the centre ≈ the mock mountain: ${Math.round(st.h.h)} m (from zoom ${st.h.z})`);
check(st.b && st.b.chunks > 0 && st.b.tris > 0 && st.b.walls === 2, `buildings and walls drawn offline (${st.b && st.b.chunks} chunks, ${st.b && st.b.tris} triangles, ${st.b && st.b.walls} wall pieces)`);
await shot(page, '3-fly.png');

// fly forward with W, then dive into the mountain: never below the ground
const p0 = await page.evaluate(() => window.__app.rig.position.toArray());
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');
const p1 = await page.evaluate(() => window.__app.rig.position.toArray());
check(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 20, `W flies forward (${Math.round(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]))} m)`);
await page.evaluate(() => { const a = window.__app; a.rig.position.set(200, a.world.terrain.heightAt(200, 0).h + 60, 0); a.flight.vel.set(0, -3000, 0); });
await page.waitForTimeout(600);
const g = await page.evaluate(() => { const a = window.__app; return { y: a.rig.position.y, ground: a.world.terrain.heightAt(a.rig.position.x, a.rig.position.z).h }; });
check(g.y >= g.ground + 0.9, `diving stops at the ground (${Math.round(g.y)} m over ${Math.round(g.ground)} m)`);
// the edge of the map turns you back
await page.evaluate(() => { const a = window.__app; a.rig.position.set(a.flight.limit * 1.5, 3000, 0); });
await page.waitForTimeout(400);
const edge = await page.evaluate(() => { const a = window.__app; return { d: Math.hypot(a.rig.position.x, a.rig.position.z), lim: a.flight.limit }; });
check(edge.d <= edge.lim + 1, 'the edge of the area holds you inside');
check(count.tiles === before.tiles && count.overpass === before.overpass, `no map request while offline (tiles ${count.tiles - before.tiles}, other blocked ${count.other - before.other})`);
await shot(page, '4-dive.png');

// back to the menu, back online, delete the area
await page.keyboard.press('Escape');
await until(() => window.__app.state === 'menu');
offline = false;
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await page.click('#saved .place [data-act="del"]');
await until(() => window.__app.store.list.length === 0 && /削除しました/.test(document.getElementById('toast').textContent), null, 30000).catch(async (e) => {
  console.log('delete state:', await page.evaluate(() => ({ n: window.__app.store.list.length, toast: document.getElementById('toast').textContent })));
  throw e;
});
const left = await page.evaluate(async () => (await (await caches.open('sky-atlas-tiles-v1')).keys()).length);
check(left < 40, `delete removed the area's tiles (${left} small world-map tiles stay)`);
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
