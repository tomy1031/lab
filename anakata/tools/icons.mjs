// tools/icons.mjs — draws the app icons (img/icon-*.png) on a canvas in Chromium: a night-blue tile with the
// tesseract's shadow (a cube inside a cube), its edges coloured from kata blue to ana orange.
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
    const g = x.createRadialGradient(256 * s, 230 * s, 20 * s, 256 * s, 256 * s, 360 * s);
    g.addColorStop(0, '#26306e');
    g.addColorStop(1, '#070917');
    x.fillStyle = g;
    if (full) x.fillRect(0, 0, size, size);
    else { x.beginPath(); x.roundRect(8 * s, 8 * s, 496 * s, 496 * s, 110 * s); x.fill(); }
    const k = full ? 0.74 : 0.92; // keep inside the maskable safe zone
    // a tesseract, slightly turned, projected with perspective from W
    const verts = [];
    for (let i = 0; i < 16; i++) verts.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
    const rot = (v, i, j, a) => { const c = Math.cos(a), sn = Math.sin(a); const vi = v[i], vj = v[j]; v[i] = c * vi - sn * vj; v[j] = sn * vi + c * vj; };
    const P = verts.map((v0) => {
      const v = v0.slice();
      rot(v, 0, 3, 0.18); rot(v, 0, 2, 0.5); rot(v, 1, 2, -0.38);
      const f = 3 / (3 - v[3]);
      const f2 = 1;
      return { x: 256 * s + v[0] * f * f2 * 88 * s * k, y: 256 * s - v[1] * f * f2 * 88 * s * k, w: v[3] };
    });
    const col = (w) => { const t = (w + 1.3) / 2.6; const r = Math.round(76 + (255 - 76) * t), gg = Math.round(176 - (176 - 154) * t), bb = Math.round(255 - (255 - 60) * t); return `rgb(${r},${gg},${bb})`; };
    x.lineCap = 'round';
    for (let a = 0; a < 16; a++) for (let d = 0; d < 4; d++) {
      const bi = a ^ (1 << d);
      if (bi < a) continue;
      const A = P[a], B = P[bi];
      const gr = x.createLinearGradient(A.x, A.y, B.x, B.y);
      gr.addColorStop(0, col(A.w)); gr.addColorStop(1, col(B.w));
      x.strokeStyle = gr;
      x.lineWidth = 13 * s * k;
      x.beginPath(); x.moveTo(A.x, A.y); x.lineTo(B.x, B.y); x.stroke();
    }
    for (const p of P) { x.fillStyle = col(p.w); x.beginPath(); x.arc(p.x, p.y, 13 * s * k, 0, Math.PI * 2); x.fill(); }
    return c.toDataURL('image/png');
  }, [size, full]);
  fs.writeFileSync(path.join(root, 'img', name), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote img/' + name);
}
await b.close();
