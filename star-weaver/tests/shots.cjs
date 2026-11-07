// tests/shots.cjs — screenshots of each kind of object during an autoplay run (desktop spectator view).
//   node tests/shots.cjs [outDir] [mode]
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'out'), mode = process.argv[3] || 'quick';
  require('fs').mkdirSync(out, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${srv.address().port}/?autoplay&nosound&seed=7&mode=${mode}&speed=1.5`);
  const seen = new Set();
  const want = { orb: 1.1, thread: 1.2, gate: 0.9, wall: 0.5, bar: 0.35, gaze: 4 };
  const t0 = Date.now();
  while (Date.now() - t0 < 9 * 60 * 1000) {
    const s = await page.evaluate((want) => {
      const g = window.__game;
      const hit = g.entities.find((e) => !e.dead && want[e.ev.type] !== undefined && g.t > e.ev.t - want[e.ev.type] && g.t < e.ev.t - want[e.ev.type] + 0.4);
      return { state: g.state, t: g.t, type: hit && (hit.ev.type + (hit.ev.kind ? ':' + hit.ev.kind : hit.ev.pose ? ':' + hit.ev.pose : '')) };
    }, want);
    if (s.type && !seen.has(s.type)) { seen.add(s.type); await page.screenshot({ path: path.join(out, `shot-${s.type.replace(':', '-')}.png`) }); console.log('shot', s.type, s.t.toFixed(1)); }
    if (s.state === 'results') break;
    await page.waitForTimeout(120);
  }
  await browser.close(); srv.close();
})();
