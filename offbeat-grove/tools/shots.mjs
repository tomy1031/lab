// tools/shots.mjs — pictures for the README and the lab link page: docs/preview.jpg (a view from just behind
// the player during autoplay) and docs/firstperson.jpg (what you see in the headset).
//   node tools/shots.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, serveApp } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { srv, base } = await serveApp();
const b = await browser();
for (const [name, view, at] of [['preview.jpg', '&view=wide', 21.5], ['firstperson.jpg', '', 30.2]]) {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${base}?autoplay&quality=high&song=canopy&mode=mix&diff=normal&length=full&seed=8${view}`, { waitUntil: 'load' });
  await page.waitForFunction((at) => window.__app && window.__app.state === 'play' && window.__app.songT > at, at, { timeout: 120000, polling: 50 });
  await page.evaluate(() => { document.getElementById('pausebtn').classList.add('hidden'); document.getElementById('playbar').classList.add('hidden'); });
  await page.screenshot({ path: path.join(root, 'docs', name), type: 'jpeg', quality: 86 });
  console.log('wrote docs/' + name);
  await page.close();
}
await b.close();
srv.close();
