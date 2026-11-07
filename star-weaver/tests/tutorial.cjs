// tests/tutorial.cjs — the autoplay bot goes through every tutorial lesson and reaches "ALL SET!".
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
(async () => {
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/?tutorial&autoplay&nosound`);
  const seen = [];
  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < 180000) {
    const s = await page.evaluate(() => { const g = window.__game; return g && g.tutorialInfo ? { en: g.tutorialInfo.en, step: g.tutorialInfo.step, state: g.state, err: window.__lastError } : null; });
    if (s && s.err) { errors.push(s.err); break; }
    if (s && seen[seen.length - 1] !== s.en) { seen.push(s.en); console.log(`step ${s.step}: ${s.en}`); }
    if (s && s.en === 'ALL SET!') { done = true; break; }
    await page.waitForTimeout(300);
  }
  const flag = await page.evaluate(() => window.__game.store.data.tutorialDone);
  console.log(done ? 'ok   tutorial finished' : 'FAIL tutorial did not finish', '· saved as done:', flag);
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close(); srv.close();
  process.exit(done && flag && !errors.length ? 0 : 1);
})();
