// Headless play-test: node tools/play.mjs "<query>" <outPrefix> [script.js]
// Serves the project, maps the three.js CDN to node_modules, opens index.html?<query>,
// then runs an optional script (async (page) => {...}) and screenshots.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [query = 'autostart', out = 'shot', scriptPath] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const [VW, VH] = (process.env.VIEW || '1280x760').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + e.stack));
await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => {
  const rel = route.request().url().split('three@0.170.0/')[1];
  route.fulfill({ path: path.join(root, 'node_modules/three', rel), contentType: 'text/javascript' });
});
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/index.html?${query}`);
await page.waitForFunction(() => window.__game, null, { timeout: 180000 }).catch((e) => logs.push('timeout waiting for __game'));
logs.push(`ready after ${Date.now() - t0}ms`);
if (scriptPath) {
  const mod = await import(pathToFileURL(path.resolve(scriptPath)).href);
  await mod.default(page, out, logs);
} else {
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out + '.png' });
}
console.log(logs.filter((l) => !l.includes('GPU stall') && !l.includes('Automatic fallback')).join('\n'));
await browser.close();
server.close();
