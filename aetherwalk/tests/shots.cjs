// tests/shots.cjs — screenshots of the viewpoints in tests/viewpoints.json, for visual review (desktop view,
// HUD hidden). Writes docs/shots/<name>.jpg and docs/shots/stats.json.
//   node tests/shots.cjs            every viewpoint
//   node tests/shots.cjs meadow     only names containing "meadow"
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'shots');
const filter = process.argv[2] || '';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'viewpoints.json'), 'utf8'))
    .filter((v) => v.name.includes(filter));
  if (!views.length) { console.log('no viewpoint matches', JSON.stringify(filter)); process.exit(1); }
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const stats = [];
  let failed = 0;
  for (const v of views) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(`${base}?desktop&nosound&seed=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.AW && window.AW.ready, null, { timeout: 60000 });
      await page.evaluate((v) => {
        AW.debug.hud(false);
        AW.debug.teleport(v.x, v.z, v.yaw);
        AW.debug.setTime(v.t);
      }, v);
      await page.waitForTimeout(2500); // let the world stream in around the new spot
      const st = await page.evaluate(() => AW.debug.state());
      await page.screenshot({ path: path.join(outDir, `${v.name}.jpg`), type: 'jpeg', quality: 85 });
      const row = { name: v.name, x: v.x, z: v.z, yaw: v.yaw, t: v.t, fps: st.fps, drawCalls: st.drawCalls, triangles: st.triangles };
      stats.push(row);
      console.log(`${v.name.padEnd(28)} fps=${String(st.fps).padStart(4)} drawCalls=${String(st.drawCalls).padStart(5)} triangles=${st.triangles}`);
      const allErrors = [...errors, ...(await page.evaluate(() => AW.errors || []))];
      if (allErrors.length) { failed++; console.log('  errors:', allErrors.join(' | ')); }
    } catch (e) {
      failed++;
      console.log(`${v.name}: FAILED ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }
  // stats.json covers the shots of this run; a filtered run keeps the other entries
  const statsPath = path.join(outDir, 'stats.json');
  let keep = [];
  if (filter && fs.existsSync(statsPath)) keep = JSON.parse(fs.readFileSync(statsPath, 'utf8')).filter((r) => !stats.some((s) => s.name === r.name));
  fs.writeFileSync(statsPath, JSON.stringify([...keep, ...stats], null, 2) + '\n');
  await browser.close();
  srv.close();
  console.log(`wrote ${stats.length} shots to ${outDir}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
