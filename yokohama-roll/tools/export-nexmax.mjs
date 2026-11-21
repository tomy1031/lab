// Export the game's NexMax (ネクマックス) as a standard glTF 2.0 binary file for download:
//   nexmax/nexmax.glb      the character, its outline, every expression, and the motions as animation clips
//   nexmax/preview.png     a picture of it (rendered from the exported file, loaded back with GLTFLoader)
// What the conversion does is described at the top of tools/export_nexmax.js.
//
//   npm i && node tools/export-nexmax.mjs [--sheet out.png]   (--sheet: also a contact sheet of every clip)
// Re-run it after js/vendor/nexmax.js changes (npm run build:nexmax), and commit the two files.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'nexmax');
const sheetAt = process.argv.indexOf('--sheet');
const sheetOut = sheetAt > 0 ? process.argv[sheetAt + 1] : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/tools/export_nexmax.html${sheetOut ? '?sheet' : ''}`);
await page.waitForFunction(() => window.__export, null, { timeout: 300000 });
const r = await page.evaluate(() => window.__export);
for (const l of logs) if (!/GPU stall|ReadPixels/.test(l)) console.log(l);
if (r.error) { console.error(r.error); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });
const glb = Buffer.from(r.glb, 'base64');
fs.writeFileSync(path.join(outDir, 'nexmax.glb'), glb);
fs.writeFileSync(path.join(outDir, 'preview.png'), Buffer.from(r.preview.split(',')[1], 'base64'));
console.log(`nexmax/nexmax.glb ${(glb.length / 1024).toFixed(0)} KB, ${r.triangles} triangles, ${r.stats.meshes} meshes`);
console.log(`joints: ${r.joints.join(' ')}`);
for (const c of r.info) console.log(`clip ${c.name.padEnd(8)} ${c.loop ? 'loop' : 'once'} ${c.seconds}s${c.seamError !== undefined ? `  (seam ${c.seamError})` : ''}${c.note ? '  ' + c.note : ''}`);

if (sheetOut) {
  // a contact sheet: one row per clip, three moments each
  await page.setContent('<body style="margin:0;background:#fff;font:14px sans-serif"></body>');
  await page.evaluate((sheet) => {
    const rows = {};
    for (const s of sheet) (rows[s.name] ||= []).push(s);
    for (const [name, shots] of Object.entries(rows)) {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;align-items:center;gap:4px';
      d.innerHTML = `<b style="width:80px">${name}</b>` + shots.map((s) => `<img src="${s.png}" width="200" height="200">`).join('');
      document.body.appendChild(d);
    }
  }, r.sheet);
  await page.setViewportSize({ width: 700, height: 205 * 10 });
  await page.screenshot({ path: sheetOut, fullPage: true });
  console.log('contact sheet → ' + sheetOut);
}
await browser.close();
server.close();
