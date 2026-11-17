// tools/icons.mjs — draws the app icons (img/icon-*.png) on a canvas in Chromium: a forest-green tile, a
// gold "&" (the offbeat) inside a target rim, and the two glove colours.
//   node tools/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
    g.addColorStop(0, '#2c6b45');
    g.addColorStop(1, '#10231b');
    x.fillStyle = g;
    if (full) x.fillRect(0, 0, size, size);
    else { x.beginPath(); x.roundRect(8 * s, 8 * s, 496 * s, 496 * s, 110 * s); x.fill(); }
    // distant ridges
    x.fillStyle = 'rgba(190,215,230,0.22)';
    x.beginPath(); x.moveTo(40 * s, 380 * s); x.lineTo(150 * s, 300 * s); x.lineTo(230 * s, 350 * s); x.lineTo(330 * s, 270 * s); x.lineTo(470 * s, 380 * s); x.lineTo(470 * s, 470 * s); x.lineTo(40 * s, 470 * s); x.fill();
    const k = full ? 0.78 : 1; // keep inside the maskable safe zone
    x.save();
    x.translate(256 * s, 250 * s);
    x.scale(k, k);
    x.lineWidth = 22 * s;
    x.strokeStyle = '#ffc94a';
    x.beginPath(); x.arc(0, 0, 150 * s, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#ffc94a';
    x.font = `900 ${250 * s}px "Noto Sans", "DejaVu Sans", sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('&', 0, 14 * s);
    x.fillStyle = '#22c9b6'; x.beginPath(); x.arc(-150 * s, 150 * s, 44 * s, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ff7552'; x.beginPath(); x.arc(150 * s, 150 * s, 44 * s, 0, Math.PI * 2); x.fill();
    x.restore();
    return c.toDataURL('image/png');
  }, [size, full]);
  fs.writeFileSync(path.join(root, 'img', name), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote img/' + name);
}
await b.close();
