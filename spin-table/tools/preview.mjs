#!/usr/bin/env node
// tools/preview.mjs — docs/preview.jpg for the lab page: the demo, mid-rally, with the ball over the table.
//   node tools/preview.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tests/serve.mjs';
import { launch } from '../tests/browser.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${srv.address().port}/?demo&cam=tv&seed=${process.argv[2] || 11}&set=level:4`);
await page.waitForFunction(() => window.ST && ST.ready && ST.frames > 20, null, { timeout: 60000 });
// a moment when a drive is crossing the net and the read-out is up
await page.waitForFunction(() => {
  const g = ST.game, s = g.sim, b = s.ball;
  const last = g.log.filter((e) => e.type === 'hit').slice(-1)[0];
  return s.phase === 'play' && s.live && last && !last.serve && Math.abs(b.p.z) < 0.6 && b.p.y > 0.95 && g.hud.info.mesh.visible && g.log.filter((e) => e.type === 'hit').length > 6;
}, null, { timeout: 240000, polling: 10 });
const out = path.join(root, 'docs', 'preview.jpg');
await page.evaluate(() => { document.querySelector('#pc-hud').style.display = 'none'; });
await page.screenshot({ path: out, type: 'jpeg', quality: 86 });
console.log('wrote', out);
await browser.close();
srv.close();
