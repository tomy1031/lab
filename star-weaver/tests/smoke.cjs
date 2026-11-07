// tests/smoke.cjs — loads the landing page, then lets the autoplay bot play a whole session.
//   node tests/smoke.cjs [mode] [speed] [outDir]
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');

(async () => {
  const mode = process.argv[2] || 'quick', speed = Number(process.argv[3] || 4), out = process.argv[4] || path.join(__dirname, 'out');
  require('fs').mkdirSync(out, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'landing.png') });

  await page.goto(`${base}?autoplay&nosound&seed=42&mode=${mode}&speed=${speed}`, { waitUntil: 'networkidle' });
  const t0 = Date.now();
  let shots = 0, lastLog = 0;
  while (Date.now() - t0 < 15 * 60 * 1000) {
    const s = await page.evaluate(() => { const g = window.__game; return { state: g.state, t: g.t, score: Math.round(g.score || 0), combo: g.combo, stats: g.stats, seg: g.curSeg && g.curSeg.key, ents: g.entities.length, err: window.__lastError || null, assist: g.assist }; });
    if (s.err) { errors.push('loop: ' + s.err); break; }
    if (Date.now() - lastLog > 8000) { lastLog = Date.now(); console.log(`t=${s.t.toFixed(1)} seg=${s.seg} score=${s.score} combo=${s.combo} hit=${s.stats && s.stats.hit}/${s.stats && s.stats.total} ents=${s.ents} assist=${s.assist}`); }
    if (s.state === 'play' && s.t > 6 + shots * 40 && shots < 6) { await page.screenshot({ path: path.join(out, `play-${shots}.png`) }); shots++; }
    if (s.state === 'results') break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'results.png') });
  const res = await page.evaluate(() => window.__game.lastResult || null);
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
  console.log('result', JSON.stringify(res));
  console.log('fps≈', fps);
  console.log('errors', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  srv.close();
  process.exit(res && !errors.some((e) => /error/i.test(e)) ? 0 : 1);
})();
