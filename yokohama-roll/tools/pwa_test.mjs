// PWA / cache test for the published build:
//   SKIP_AIC=1 node site/build.mjs <site>   then   node yokohama-roll/tools/pwa_test.mjs <site>
// Serves <site> under /lab/ like GitHub Pages, then checks: the service worker installs and controls the
// page; publishing a new build (new v/<build>/ folder + version.json + index.html) makes the running game
// switch to it on its own; and a reload while offline still starts the game from the cache.
// three.js is served from the same origin here (the test can't route the CDN through a service worker).
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(process.argv[2] || '.site');
const game = path.join(site, 'yokohama-roll');
const threeDir = path.join(here, '..', 'node_modules', 'three', 'build');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

// serve three.js locally for the test
let html = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
html = html.replace('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js', '/three/three.module.js');
fs.writeFileSync(path.join(game, 'index.html'), html);

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let p = u.startsWith('/three/') ? path.join(threeDir, u.slice(7)) : u.startsWith('/lab/') ? path.join(site, u.slice(5)) : null;
  if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'max-age=600' }); // like GitHub Pages
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/lab/yokohama-roll/`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.g')) errors.push(m.text()); });
await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
let ok = 0, bad = 0;
const check = (name, cond, info = '') => { (cond ? ok++ : bad++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

await page.goto(url + '?noshadow&lowres');
await page.waitForFunction(() => window.__game, null, { timeout: 180000 });
const build1 = await page.evaluate(() => window.HAMAKORO_BUILD);
check('page runs the published build', !!build1, build1);
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true), null, { timeout: 60000 });
await page.reload();
await page.waitForFunction(() => window.__game, null, { timeout: 180000 });
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
check('service worker installed and controlling the page', controlled);
const cached = await page.evaluate(async () => (await caches.keys()).join(','));
check('build cached for offline play', cached.includes('hamakoro-' + build1), cached);

// "deploy" a new build: new code folder, new page, new version.json, new sw.js
const build2 = 'test' + Date.now().toString(36);
fs.cpSync(path.join(game, 'v', build1), path.join(game, 'v', build2), { recursive: true });
for (const f of ['index.html', 'sw.js']) {
  const p = path.join(game, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split(build1).join(build2));
}
fs.writeFileSync(path.join(game, 'version.json'), JSON.stringify({ build: build2 }));
// the game checks when you come back to it (and every 10 minutes); on the title screen it switches by itself
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForFunction((b) => window.HAMAKORO_BUILD === b, build2, { timeout: 120000 }).catch(() => {});
await page.waitForFunction(() => window.__game, null, { timeout: 180000 }).catch(() => {});
const now = await page.evaluate(() => ({ build: window.HAMAKORO_BUILD, href: location.href }));
check('a running game picks up the new build', now.build === build2, JSON.stringify(now));

// offline: the game still starts
await ctx.setOffline(true);
await page.reload().catch(() => {});
const offline = await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 180000 }).then(() => true).catch(() => false);
check('starts offline from the cache', offline);
await ctx.setOffline(false);

check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${ok}/${ok + bad} checks passed`);
await browser.close();
server.close();
process.exit(bad ? 1 : 0);
