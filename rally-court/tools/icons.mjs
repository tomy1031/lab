// tools/icons.mjs — draws the app icons (img/icon-*.png, img/apple-touch-icon.png) on a canvas in Chromium:
// a night-court tile (navy, the aqua court lines in perspective) and a tennis ball with its white seam.
//   node tools/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../tests/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = await launch();
const page = await b.newPage();
const sizes = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
fs.mkdirSync(path.join(root, 'img'), { recursive: true });
for (const [name, size, full] of sizes) {
  const data = await page.evaluate(([size, full]) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const s = size / 512;
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#2f5f9e');
    g.addColorStop(1, '#0b1220');
    x.fillStyle = g;
    if (full) x.fillRect(0, 0, size, size);
    else { x.beginPath(); x.roundRect(8 * s, 8 * s, 496 * s, 496 * s, 110 * s); x.fill(); }
    const k = full ? 0.8 : 1; // keep inside the maskable safe zone
    x.save();
    x.translate(256 * s, 256 * s);
    x.scale(k, k);
    // the court in perspective: baseline, service line, centre line, sidelines
    x.strokeStyle = '#7fffd4';
    x.lineWidth = 10 * s;
    x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(-200 * s, 200 * s); x.lineTo(-110 * s, -40 * s); x.lineTo(110 * s, -40 * s); x.lineTo(200 * s, 200 * s); x.closePath();
    x.moveTo(-160 * s, 95 * s); x.lineTo(160 * s, 95 * s);
    x.moveTo(0, 95 * s); x.lineTo(0, -40 * s);
    x.stroke();
    // the net
    x.fillStyle = 'rgba(238,244,255,0.85)';
    x.fillRect(-122 * s, -14 * s, 244 * s, 9 * s);
    // the ball, above the court
    const bx = 34 * s, by = -96 * s, r = 104 * s;
    const bg = x.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r);
    bg.addColorStop(0, '#f4ff8a');
    bg.addColorStop(1, '#b6d62c');
    x.fillStyle = bg;
    x.beginPath(); x.arc(bx, by, r, 0, Math.PI * 2); x.fill();
    x.save();
    x.beginPath(); x.arc(bx, by, r, 0, Math.PI * 2); x.clip();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 12 * s;
    x.beginPath(); x.arc(bx - r * 1.25, by, r * 0.95, -0.9, 0.9); x.stroke();
    x.beginPath(); x.arc(bx + r * 1.25, by, r * 0.95, Math.PI - 0.9, Math.PI + 0.9); x.stroke();
    x.restore();
    x.restore();
    return c.toDataURL('image/png');
  }, [size, full]);
  fs.writeFileSync(path.join(root, 'img', name), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote img/' + name);
}
await b.close();
