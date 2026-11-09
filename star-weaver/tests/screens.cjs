// tests/screens.cjs — screenshots of every VR panel in the desktop preview (first-person view).
//   node tests/screens.cjs [outDir]
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'out');
  require('fs').mkdirSync(out, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('star-weaver-v1', JSON.stringify({ tutorialDone: true, best: { journey: 128400 }, days: [], history: [] })));
  await page.goto(`http://127.0.0.1:${srv.address().port}/?nosound`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'page-landing.png'), fullPage: false });
  await page.click('#preview');
  await page.waitForTimeout(1500);
  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, `ui-${name}.png`) }); };
  await shot('menu');
  await page.evaluate(() => { const g = window.__game; g.xr = true; g.setState('welcome'); g.xr = false; });
  await shot('welcome');
  await page.evaluate(() => { const g = window.__game; g.tpose = { hold: 1.2, best: 1.5 }; g.setState('tpose'); });
  await page.waitForTimeout(300);
  await shot('tpose');
  await page.evaluate(() => { const g = window.__game; g.setState('menu'); g.startGame(); });
  await page.waitForTimeout(6000);
  await page.evaluate(() => { const g = window.__game; g.combo = 34; g.fever = true; g.score = 48210; g.stats.total = 60; g.stats.hit = 57; g.hudDirty = { score: true, combo: true, stage: true }; g.drawHud(true); g.pause(); });
  await shot('pause');
  await page.evaluate(() => { const g = window.__game; g.lastResult = { mode: 'journey', score: 312480, rank: 'S', acc: 94.5, maxCombo: 114, sec: 812, kcal: 61.4, counts: { reach: 219, open: 118, circles: 98, twist: 35, steps: 27, squats: 10, stretch: 7 }, travel: 473, newBest: true, prevBest: 128400, streak: 4 }; g.clearPlay(); g.state = 'results'; g.hideAllPanels(); g.showResults(); });
  await page.waitForTimeout(2200);
  await shot('results');
  console.log('errors', errors.length ? errors : 'none');
  await browser.close(); srv.close();
})();
