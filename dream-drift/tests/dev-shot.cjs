// tests/dev-shot.cjs — open a URL, wait, screenshot, dump errors + DD state (development helper)
//   node tests/dev-shot.cjs "<query>" out.png [waitMs] [evalJs]
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
(async () => {
  const [q = '', out = 'shot.png', wait = '8000', evalJs = ''] = process.argv.slice(2);
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  await page.goto(base + q, { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 60000 }); } catch (e) { logs.push('not ready'); }
  await page.waitForTimeout(Number(wait));
  if (evalJs) { const r = await page.evaluate(evalJs); console.log('eval:', JSON.stringify(r)); await page.waitForTimeout(1500); }
  const st = await page.evaluate(() => ({ errors: window.DD.errors, state: window.DD.debug.state && window.DD.debug.state() }));
  console.log(JSON.stringify(st, null, 1).slice(0, 3000));
  console.log(logs.slice(0, 20).join('\n'));
  await page.screenshot({ path: out, timeout: 90000 });
  await browser.close(); srv.close();
})();
