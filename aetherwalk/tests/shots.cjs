// tests/shots.cjs — screenshots for visual review (desktop view, HUD hidden). Writes docs/shots/<name>.jpg for
// every entry of tests/viewpoints.json, and — by default — docs/shots/vista_<id>.jpg for every vista the game
// reports (AW.debug.vistas(); AW.debug.vista(id) teleports, sets time and look). Also docs/shots/stats.json.
//   node tests/shots.cjs                 every viewpoint and every vista
//   node tests/shots.cjs meadow          only names containing "meadow" (vistas match "vista_<id>" or their name)
//   node tests/shots.cjs vista           only the vistas
//   node tests/shots.cjs --no-vistas     viewpoints only
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'shots');
const args = process.argv.slice(2);
const withVistas = !args.includes('--no-vistas');
const filter = args.find((a) => !a.startsWith('--')) || '';
const query = '?desktop&nosound&fresh&seed=1';
const viewport = { width: 1600, height: 900 };
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'viewpoints.json'), 'utf8'))
    .filter((v) => v.name.includes(filter));
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const stats = [];
  let failed = 0;
  let shots = 0;

  const row = (name, x, z, yaw, t, st) => ({ name, x, z, yaw, t, fps: st.fps, drawCalls: st.drawCalls, triangles: st.triangles });
  const logRow = (r, errs) => {
    console.log(`${r.name.padEnd(30)} fps=${String(r.fps).padStart(4)} drawCalls=${String(r.drawCalls).padStart(5)} triangles=${r.triangles}`);
    if (errs.length) { failed++; console.log('  errors:', errs.join(' | ')); }
  };

  // 1. the hand-picked viewpoints, one fresh page each
  for (const v of views) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(base + query, { waitUntil: 'load' });
      await page.waitForFunction(() => window.AW && window.AW.ready, null, { timeout: 60000 });
      await page.evaluate((v) => {
        AW.debug.hud(false);
        AW.debug.teleport(v.x, v.z, v.yaw);
        AW.debug.setTime(v.t);
      }, v);
      await page.waitForTimeout(2500); // let the world stream in around the new spot
      const st = await page.evaluate(() => AW.debug.state());
      await page.screenshot({ path: path.join(outDir, `${v.name}.jpg`), type: 'jpeg', quality: 85 });
      const r = row(v.name, v.x, v.z, v.yaw, v.t, st);
      stats.push(r); shots++;
      logRow(r, [...errors, ...(await page.evaluate(() => AW.errors || []))]);
    } catch (e) {
      failed++;
      console.log(`${v.name}: FAILED ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }

  // 2. every vista the game reports, one shared page (AW.debug.vista teleports between them)
  if (withVistas) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(base + query, { waitUntil: 'load' });
      await page.waitForFunction(() => window.AW && window.AW.ready, null, { timeout: 60000 });
      const list = await page.evaluate(() => AW.debug.vistas());
      const picked = list.filter((v) => `vista_${v.id}`.includes(filter) || String(v.name || '').includes(filter));
      let awSeen = 0;
      for (const v of picked) {
        const name = `vista_${v.id}`;
        try {
          const ok = await page.evaluate((id) => { AW.debug.hud(false); return AW.debug.vista(id); }, v.id);
          if (!ok) throw new Error(`AW.debug.vista(${v.id}) returned false`);
          await page.waitForTimeout(3000); // the world streams in around the new spot; time and look are already set
          const st = await page.evaluate(() => AW.debug.state());
          await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 85 });
          const r = row(name, v.x, v.z, v.yaw, v.time, st);
          stats.push(r); shots++;
          const aw = await page.evaluate(() => AW.errors || []);
          const newAw = aw.slice(awSeen); awSeen = aw.length;
          logRow(r, [...errors.splice(0), ...newAw]);
        } catch (e) {
          failed++;
          console.log(`${name}: FAILED ${e.message.split('\n')[0]}`);
        }
      }
      if (!picked.length) console.log('no vistas match', JSON.stringify(filter));
    } catch (e) {
      failed++;
      console.log(`vistas: FAILED ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }

  if (!shots && !failed) { console.log('no viewpoint or vista matches', JSON.stringify(filter)); await browser.close(); srv.close(); process.exit(1); }

  // stats.json covers the shots of this run; a partial run (filtered or --no-vistas) keeps the other entries
  const statsPath = path.join(outDir, 'stats.json');
  const partial = !!filter || !withVistas;
  let keep = [];
  if (partial && fs.existsSync(statsPath)) keep = JSON.parse(fs.readFileSync(statsPath, 'utf8')).filter((r) => !stats.some((s) => s.name === r.name));
  fs.writeFileSync(statsPath, JSON.stringify([...keep, ...stats], null, 2) + '\n');
  await browser.close();
  srv.close();
  console.log(`wrote ${shots} shots to ${outDir}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
