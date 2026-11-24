// tools/shots.mjs — the picture for the lab page (docs/preview.jpg): the tesseract corridor with its world
// lines, seen from a little above, without the PC overlay.
//   node tools/shots.mjs [out=docs/preview.jpg]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, serveApp } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'docs', 'preview.jpg');
const { srv, base } = await serveApp();
const b = await browser();
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(base + '?shot&pc&ch=6&step=3', { waitUntil: 'load' });
await page.waitForFunction(() => window.__app && window.__app.current.u >= 1, null, { timeout: 60000 });
await page.evaluate(() => {
  document.getElementById('hud').classList.add('hidden');
  const app = window.__app;
  app.guide.on = false;
  const c = app.current;
  c.travel.set(-1.2, 0.9, 0.4);
  app.cam.pos.set(0, 1.5, 1.6);
  app.input.yaw = 0.42;
  app.input.pitch = -0.2;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: out, type: 'jpeg', quality: 86 });
console.log('wrote', out);
await b.close();
srv.close();
