// tests/modes.cjs — endless mode → "クールダウンへ" from the pause menu, and seated + 腰いたわり settings.
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const errors = [];
  let ok = true;
  const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) ok = false; };

  // 1) endless: play two stages, then pause → cool-down → results
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}?autoplay&nosound&seed=3&mode=endless&speed=6`);
    await page.waitForFunction(() => window.__game.curSeg && window.__game.curSeg.key === 'river', null, { timeout: 240000, polling: 500 });
    const segs = await page.evaluate(() => window.__game.tl.segs.map((s) => s.key + '@' + s.bpm).join(' '));
    check(/warm.*lake.*river/.test(segs), `endless timeline grows: ${segs}`);
    await page.evaluate(() => { window.__game.pause(); window.__game.toCooldown(); });
    await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 10000 });
    await page.waitForFunction(() => window.__game.curSeg && window.__game.curSeg.key === 'cool', null, { timeout: 60000, polling: 300 });
    check(true, 'reached cool-down after the request');
    await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 120000, polling: 500 });
    const r = await page.evaluate(() => window.__game.lastResult);
    check(r && r.mode === 'endless' && r.counts.stretch > 0, `endless results: score ${r && r.score}, stretch ${r && r.counts.stretch}`);
    await page.close();
  }
  // 2) seated + back care: no walls, no bars, no side bends
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('star-weaver-v1', JSON.stringify({ settings: { stance: 'sit', backCare: true, squat: 'normal' } })));
    await page.goto(`${base}?autoplay&nosound&seed=5&mode=journey&speed=8`);
    await page.waitForFunction(() => window.__game.state === 'play');
    const types = await page.evaluate(async () => {
      const { generateStage } = await import('/js/chart.js');
      const g = window.__game;
      const seen = {};
      for (const seg of g.tl.segs) {
        const evs = generateStage({ ...seg, generated: false }, { ...g.chartCtx, seen: new Set(), lane: 0 });
        for (const e of evs) seen[e.type + (e.pose ? ':' + e.pose : '')] = (seen[e.type + (e.pose ? ':' + e.pose : '')] || 0) + 1;
      }
      return seen;
    });
    check(!types.wall && !types.bar, `seated: no walls / bars (${JSON.stringify(types)})`);
    check(!types['gate:bendL'] && !types['gate:bendR'], 'back care: no side bends in the cool-down');
    // standing, squat normal, no back care: walls and bars do appear
    const types2 = await page.evaluate(async () => {
      const { generateStage } = await import('/js/chart.js');
      const g = window.__game;
      const seen = {};
      const ctx = { ...g.chartCtx, seated: false, squatDepth: 0.17, backCare: false, seen: new Set(), lane: 0 };
      for (const seg of g.tl.segs) for (const e of generateStage({ ...seg }, ctx)) seen[e.type + (e.pose ? ':' + e.pose : '')] = (seen[e.type + (e.pose ? ':' + e.pose : '')] || 0) + 1;
      return { seen, lane: ctx.lane };
    });
    check(types2.seen.wall > 0 && types2.seen.bar > 0 && types2.seen['gate:bendL'] > 0, `standing: walls ${types2.seen.wall}, bars ${types2.seen.bar}, side bends ${types2.seen['gate:bendL']}`);
    check(types2.lane === 0, 'lane returns to centre at the end');
    await page.close();
  }
  console.log('page errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close(); srv.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
