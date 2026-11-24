// tools/icons.mjs — draws the app icons (img/icon-*.png): a night-blue tile, a white peak, and the carved
// S-line of a snowboard's track in orange and gold sweeping down it.
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
    g.addColorStop(0, '#1d4fa3');
    g.addColorStop(1, '#0b1a3a');
    x.fillStyle = g;
    if (full) x.fillRect(0, 0, size, size);
    else { x.beginPath(); x.roundRect(8 * s, 8 * s, 496 * s, 496 * s, 110 * s); x.fill(); }
    const k = full ? 0.8 : 1;
    const P = (px, py) => [256 * s + (px - 256) * s * k, 256 * s + (py - 256) * s * k];
    // the peak
    x.fillStyle = '#eef5ff';
    x.beginPath(); x.moveTo(...P(70, 430)); x.lineTo(...P(250, 120)); x.lineTo(...P(300, 190)); x.lineTo(...P(330, 160)); x.lineTo(...P(450, 430)); x.closePath(); x.fill();
    x.fillStyle = '#b9cdf0';
    x.beginPath(); x.moveTo(...P(250, 120)); x.lineTo(...P(300, 190)); x.lineTo(...P(270, 430)); x.lineTo(...P(200, 430)); x.closePath(); x.fill();
    // the carved line
    x.lineCap = 'round';
    for (const [w, col] of [[34, '#ff6a3d'], [14, '#ffd23f']]) {
      x.strokeStyle = col; x.lineWidth = w * s * k;
      x.beginPath(); x.moveTo(...P(250, 150)); x.bezierCurveTo(...P(390, 230), ...P(120, 300), ...P(260, 360)); x.bezierCurveTo(...P(330, 390), ...P(360, 420), ...P(330, 470)); x.stroke();
    }
    return c.toDataURL('image/png');
  }, [size, full]);
  fs.writeFileSync(path.join(root, 'img', name), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote img/' + name);
}
await b.close();
