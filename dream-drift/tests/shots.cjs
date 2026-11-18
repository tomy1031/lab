// tests/shots.cjs — the pictures used by the page and the docs:
//   img/course-<id>.jpg  (course select cards, 640×360) and docs/preview.jpg (lab site card, 1280×720)
//   node tests/shots.cjs [courseNumbers...]     e.g. node tests/shots.cjs 2 3
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const IDS = ['candy', 'forest', 'coral', 'galaxy'];
// lap seconds to fast-forward before the shot, per course (karts spread out, scenery in view)
const AT = { 1: 7, 2: 9, 3: 10, 4: 7 };

(async () => {
  const which = process.argv.slice(2).map(Number).filter(Boolean);
  const list = which.length ? which : [1, 2, 3, 4];
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  for (const c of list) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${base}?course=${c}&autoplay&nosound&quality=high&seed=5&skipintro`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.DD && window.DD.ready && window.DD.debug.state().phase === 'countdown', null, { timeout: 120000 });
    await page.evaluate((t) => { window.DD.debug.simulate(3.2 + t); window.DD.debug.hud(false); }, AT[c]);
    await page.waitForTimeout(6000);
    const file = path.join(root, 'img', `course-${IDS[c - 1]}.jpg`);
    const buf = await page.screenshot({ type: 'jpeg', quality: 88, timeout: 120000 });
    if (c === 1) fs.writeFileSync(path.join(root, 'docs', 'preview.jpg'), buf);
    // smaller copy for the course cards
    await page.setViewportSize({ width: 640, height: 360 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85, timeout: 120000 });
    console.log('wrote', path.relative(root, file));
    await page.close();
  }
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
