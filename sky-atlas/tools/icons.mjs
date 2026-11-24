// tools/icons.mjs — draws the app icons (img/icon-*.png) on a canvas in Chromium: a sky tile with a curved
// horizon of the Earth, a snowy peak and a white glider wing crossing it.
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
    g.addColorStop(0, '#0b2a52');
    g.addColorStop(0.55, '#3d86d6');
    g.addColorStop(1, '#bfe0f7');
    x.fillStyle = g;
    if (full) x.fillRect(0, 0, size, size);
    else { x.beginPath(); x.roundRect(8 * s, 8 * s, 496 * s, 496 * s, 110 * s); x.fill(); }
    x.save();
    if (!full) { x.beginPath(); x.roundRect(8 * s, 8 * s, 496 * s, 496 * s, 110 * s); x.clip(); }
    const k = full ? 0.8 : 1;
    x.translate(256 * s, 256 * s); x.scale(k, k); x.translate(-256 * s, -256 * s);
    // the Earth's curve
    const eg = x.createLinearGradient(0, 330 * s, 0, 512 * s);
    eg.addColorStop(0, '#2f7d5a'); eg.addColorStop(1, '#174a3a');
    x.fillStyle = eg;
    x.beginPath(); x.arc(256 * s, 1150 * s, 830 * s, 0, Math.PI * 2); x.fill();
    // a peak
    x.fillStyle = '#5b6f86';
    x.beginPath(); x.moveTo(120 * s, 360 * s); x.lineTo(250 * s, 215 * s); x.lineTo(390 * s, 352 * s); x.closePath(); x.fill();
    x.fillStyle = '#f4f8fc';
    x.beginPath(); x.moveTo(214 * s, 255 * s); x.lineTo(250 * s, 215 * s); x.lineTo(290 * s, 256 * s); x.lineTo(268 * s, 248 * s); x.lineTo(250 * s, 262 * s); x.lineTo(232 * s, 250 * s); x.closePath(); x.fill();
    // a glider wing
    x.fillStyle = '#ffffff';
    x.beginPath(); x.moveTo(70 * s, 170 * s); x.quadraticCurveTo(256 * s, 120 * s, 442 * s, 150 * s); x.lineTo(300 * s, 178 * s); x.lineTo(256 * s, 200 * s); x.lineTo(215 * s, 180 * s); x.closePath(); x.fill();
    x.fillStyle = '#ffd166';
    x.beginPath(); x.arc(256 * s, 176 * s, 14 * s, 0, Math.PI * 2); x.fill();
    x.restore();
    return c.toDataURL('image/png').split(',')[1];
  }, [size, full]);
  fs.writeFileSync(path.join(root, 'img', name), Buffer.from(data, 'base64'));
  console.log('img/' + name);
}
await b.close();
