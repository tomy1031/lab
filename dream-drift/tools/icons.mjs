// tools/icons.mjs — draws the app icons (img/icon-*.png, img/apple-touch-icon.png) from img/icon.svg in Chromium.
// The maskable icon and the apple-touch icon fill the whole square and keep the drawing inside the safe zone.
//   node tools/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'img', 'icon.svg')).toString('base64');
const b = await chromium.launch();
const page = await b.newPage();
const sizes = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
for (const [name, size, full] of sizes) {
  const data = await page.evaluate(async ([svg, size, full]) => {
    const img = new Image();
    img.src = svg;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    if (full) { x.fillStyle = '#2a1b5e'; x.fillRect(0, 0, size, size); }
    const k = full ? 0.82 : 1;
    const d = size * k;
    x.drawImage(img, (size - d) / 2, (size - d) / 2, d, d);
    return c.toDataURL('image/png');
  }, [svg, size, full]);
  fs.writeFileSync(path.join(root, 'img', name), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote img/' + name);
}
await b.close();
