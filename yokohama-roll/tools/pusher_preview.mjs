// Screenshot tools/pusher_preview.html (NexMax pushing the ball) and print console errors + draw stats.
//   node tools/pusher_preview.mjs out.png ['[{"r":0.15,"speed":2.5,"view":"side"}, ...]'] [cols]
// Starts its own static server on a free port rooted at the project folder.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [out = 'pusher.png', tiles = '', cols = ''] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
const q = new URLSearchParams({ ...(tiles ? { tiles } : {}), ...(cols ? { cols } : {}) });
await page.goto(`http://127.0.0.1:${port}/tools/pusher_preview.html?${q}`);
await page.waitForFunction(() => window.__previewDone, null, { timeout: 180000 }).catch(() => {});
const done = await page.evaluate(() => window.__previewDone);
await page.screenshot({ path: out });
console.log(JSON.stringify(done));
for (const l of logs) if (!l.includes('GPU stall')) console.log(l);
await browser.close();
server.close();
