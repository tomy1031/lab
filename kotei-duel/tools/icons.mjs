// tools/icons.mjs — draws the app icons (img/icon-*.png): a navy tile with a fanned hand of three cards,
// the front one showing the V of the V-model in cyan and gold.
//   node tools/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, 'img'), { recursive: true });
const b = await browser();
const page = await b.newPage();
const sizes = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
for (const [name, size, full] of sizes) {
  const data = await page.evaluate(([size, full]) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const s = size / 512;
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#1b3a8f'); g.addColorStop(1, '#070d26');
    x.fillStyle = g;
    if (full) x.fillRect(0, 0, size, size);
    else { x.beginPath(); x.roundRect(8 * s, 8 * s, 496 * s, 496 * s, 110 * s); x.fill(); }
    const k = full ? 0.78 : 0.95;
    x.save();
    x.translate(256 * s, 280 * s); x.scale(s * k, s * k);
    const card = (rot, col, col2) => {
      x.save(); x.rotate(rot);
      x.fillStyle = col; x.beginPath(); x.roundRect(-110, -165, 220, 300, 22); x.fill();
      x.strokeStyle = col2; x.lineWidth = 10; x.beginPath(); x.roundRect(-96, -151, 192, 272, 16); x.stroke();
      x.restore();
    };
    card(-0.38, '#7a3fd0', '#c9a6ff');
    card(0.38, '#18a77a', '#9ff0d0');
    card(0, '#13265c', '#ffcf3f');
    x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = 34;
    const v = x.createLinearGradient(0, -90, 0, 90);
    v.addColorStop(0, '#7fe3ff'); v.addColorStop(1, '#ffcf3f');
    x.strokeStyle = v;
    x.beginPath(); x.moveTo(-62, -80); x.lineTo(0, 70); x.lineTo(62, -80); x.stroke();
    x.restore();
    return c.toDataURL('image/png');
  }, [size, full]);
  fs.writeFileSync(path.join(root, 'img', name), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote img/' + name);
}
await b.close();
