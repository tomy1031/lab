// tools/shots.mjs — screenshots against the REAL tile servers (needs the network): the menu, then a few
// places seen from chosen spots. Used for the README / the lab page preview.
//   node tools/shots.mjs [outDir=docs/shots] [only=name,name]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, serveApp } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'docs', 'shots'));
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(out, { recursive: true });

// preset index, camera (local metres from the area centre), look direction (heading ° from north, pitch °)
const SHOTS = [
  // the lab page preview (docs/preview.jpg, 1200×675, no HUD)
  { name: 'preview', preset: 0, pos: [7600, 4100, 6200], heading: 305, pitch: -11, preview: true },
  { name: 'fuji', preset: 0, pos: [9000, 4300, 7000], heading: 305, pitch: -14 },
  { name: 'fuji-low', preset: 0, pos: [2500, 2300, 4200], heading: 330, pitch: -8 },
  { name: 'tokyo', preset: 1, pos: [600, 420, 2200], heading: 340, pitch: -16 },
  { name: 'canyon', preset: 3, pos: [-1500, 2600, 2500], heading: 20, pitch: -12 },
  { name: 'matterhorn', preset: 7, pos: [-3500, 3900, 2500], heading: 120, pitch: -6 },
  { name: 'newyork', preset: 4, pos: [-1500, 600, 3800], heading: 25, pitch: -10 },
];

const { srv, base } = await serveApp(root);
const b = await browser([], { real: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(base + '?nosw', { waitUntil: 'load' });
await page.waitForFunction(() => window.__app && window.__app.firstFrame, null, { timeout: 30000 });
if (!only || only.includes('menu')) {
  await page.evaluate(() => window.__app.loadArea(window.__app.ui.entry('preset', 0)));
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(out, 'menu.png') });
  console.log('menu.png');
}
for (const s of SHOTS) {
  if (only && !only.includes(s.name)) continue;
  await page.setViewportSize(s.preview ? { width: 1200, height: 675 } : { width: 1280, height: 720 });
  await page.evaluate((s) => {
    const app = window.__app;
    app.startScreen(app.ui.entry('preset', s.preset));
    document.getElementById('hud').style.visibility = s.preview ? 'hidden' : '';
  }, s);
  const t0 = Date.now();
  let st;
  for (;;) {
    await page.evaluate((s) => {
      const app = window.__app;
      app.rig.position.set(...s.pos);
      app.flight.vel.set(0, 0, 0);
      app.sin.yaw = (-s.heading * Math.PI) / 180;
      app.sin.pitch = (s.pitch * Math.PI) / 180;
    }, s);
    await page.waitForTimeout(1500);
    st = await page.evaluate(() => {
      const a = window.__app, w = a.world;
      return { loading: w.terrain.stats.loading, queue: w.terrain.queue.length, vis: w.terrain.stats.visible, maxZ: w.terrain.stats.maxZ, bld: w.buildings ? w.buildings.stats : null, wantB: !!w.plan.buildings };
    });
    const bldReady = !st.wantB || (st.bld && st.bld.chunks > 0);
    if ((st.loading === 0 && st.queue === 0 && bldReady && Date.now() - t0 > 6000) || Date.now() - t0 > 90000) break;
  }
  await page.waitForTimeout(800);
  if (s.preview) await page.screenshot({ path: path.join(root, 'docs', 'preview.jpg'), type: 'jpeg', quality: 86 });
  else await page.screenshot({ path: path.join(out, s.name + '.png') });
  console.log(s.preview ? 'docs/preview.jpg' : s.name + '.png', JSON.stringify(st));
}
await b.close();
srv.close();
