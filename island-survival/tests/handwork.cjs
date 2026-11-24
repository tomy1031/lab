// tests/handwork.cjs — the work table (DESIGN §24) and butchering (§25) in headless Chromium, played with the mouse
// and keys: each action kind scores the performance, おまかせ gives 0.55, Esc cancels; sharpening restores
// durability; the butcher diagram in ひかえめ has no red; cutting deep spoils the meat; 省略 skips the procedure.
//   node tests/handwork.cjs
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');

const fail = [];
const log = (...a) => console.log('[handwork]', ...a);
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve(0, path.resolve(__dirname, '..'));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await page.goto(base + '?quick&nosound&quality=low&starter=knife&seed=3');
  await page.waitForFunction(() => window.ISLE?.game?.running, null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.ISLE.game; g.settings = { ...(g.settings || {}), handwork: 'manual', butcherView: 'mild', hints: true }; });

  const start = (expr, opts = {}) => page.evaluate(async ([fe, o]) => {
    const M = await import('./js/data/handwork.js');
    const BT = await import('./js/player/butcher.js');
    const flow = new Function('M', 'BT', `return ${fe}`)(M, BT);
    window.__hw = null;
    window.ISLE.game.handwork.mastery = {}; // no 手慣れ shortcuts between the checks
    window.ISLE.game.handwork.recent = [];  // nor the 4-per-hour "same rhythm" (§26.10)
    window.ISLE.game.handwork.run(flow, o).then((r) => { window.__hw = r; });
  }, [expr, opts]);
  const at = async () => { const b = await page.locator('.hw-cv').boundingBox(); return (x, y) => [b.x + (x / 800) * b.width, b.y + (y / 500) * b.height]; };
  const result = async () => { await page.waitForFunction(() => window.__hw, null, { timeout: 30000 }); return page.evaluate(() => window.__hw); };
  const kindState = () => page.evaluate(() => { const k = window.ISLE.game.handwork.active?.kind; if (!k || k.done) return null; const s = k.step; return { kind: s.kind, line: k.line ? k.line.pts.filter((_, i) => i % 6 === 0).concat([k.line.pts[k.line.pts.length - 1]]) : null, tokens: k.tokens?.filter((t) => !t.placed).map((t) => ({ kind: t.kind, x: t.x, y: t.y })), want: k.order?.[k.count], slot: k.slots?.[k.count] ? [k.slots[k.count].x, k.slots[k.count].y] : null, target: k.target, wait: k.T != null ? k.T - k.phase : 0, opts: s.options?.map((o) => o.ok) }; });
  /** play whatever the current step is, cleanly (offset: push trace strokes off the line) */
  const play = async (offset = 0, maxSteps = Infinity) => {
    const A = await at();
    const idx0 = await page.evaluate(() => window.ISLE.game.handwork.active?.idx);
    for (let n = 0; n < 40; n++) {
      if (!(await page.evaluate(() => !!window.ISLE.game.handwork.active))) return;
      if ((await page.evaluate(() => window.ISLE.game.handwork.active?.idx)) - idx0 >= maxSteps) return;
      const k = await kindState();
      if (!k) { await sleep(150); continue; }
      if (k.kind === 'choose') await page.keyboard.press(`Digit${k.opts.indexOf(true) + 1}`);
      else if (k.kind === 'strike' && k.target) { await sleep(Math.max(0, k.wait * 1000 - 30)); await page.mouse.click(...A(...k.target)); }
      else if (k.kind === 'trace' && k.line) { await page.mouse.move(...A(...k.line[0])); await page.mouse.down(); for (const p of k.line) await page.mouse.move(...A(p[0], p[1] - offset), { steps: 4 }); await page.mouse.up(); }
      else if (k.kind === 'place' && k.tokens?.length) { const t = k.tokens.find((x) => x.kind === k.want) || k.tokens[0]; await page.mouse.move(...A(t.x, t.y)); await page.mouse.down(); await page.mouse.move(...A(...k.slot), { steps: 10 }); await page.mouse.up(); }
      else if (k.kind === 'rub') { await page.mouse.move(...A(320, 280)); await page.mouse.down(); for (let i = 0; i < 26; i++) { await page.mouse.move(...A(i % 2 ? 320 : 480, 280), { steps: 5 }); await sleep(170); if (!(await kindState())) break; } await page.mouse.up(); }
      else if (k.kind === 'twist') { await page.mouse.move(...A(520, 262)); await page.mouse.down(); for (let a = 0; a < Math.PI * 2 * 16; a += 0.35) { await page.mouse.move(...A(400 + Math.cos(a) * 120, 262 + Math.sin(a) * 120)); if (a % 3 < 0.35 && !(await kindState())?.kind?.startsWith('twist')) break; } await page.mouse.up(); await sleep(120); if ((await page.evaluate(() => window.ISLE.game.handwork.active?.kind?.phase)) === 'tighten') { await page.mouse.move(...A(400, 300)); await page.mouse.down(); await page.mouse.move(...A(400, 400), { steps: 5 }); await page.mouse.up(); } }
      else if (k.kind === 'weave') { const w = await page.evaluate(() => { const k2 = window.ISLE.game.handwork.active.kind; return { t: k2.t, lead: k2.lead, beat: k2.beat, n: k2.n, c: k2.count }; }); const t0 = Date.now() - w.t * 1000; for (let i = w.c; i < w.n; i++) { const due = t0 + (w.lead + i * w.beat) * 1000; await sleep(Math.max(0, due - Date.now() - 10)); await page.keyboard.press(i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft'); } }
      await sleep(200);
    }
  };

  // ---------------------------------------------------------------- the kinds
  const kinds = {};
  for (const [name, expr] of [['strike', 'M.TEMPLATE_FLOW.flake()'], ['rub', "M.WORK_FLOW.sharpen('knife')"], ['twist', 'M.TEMPLATE_FLOW.cord()'], ['weave', 'M.TEMPLATE_FLOW.mat()'], ['place', 'M.TEMPLATE_FLOW.water_filter()'], ['knife', 'M.TEMPLATE_FLOW.knife_made()']]) {
    await start(expr, { title: name });
    await sleep(400);
    await play();
    kinds[name] = await result();
    check(kinds[name].p >= 0.7, `${name}: careful hands score well (p ${kinds[name].p.toFixed(2)}, ${kinds[name].feel.label}, +${kinds[name].feel.bonus})`);
  }
  await start('M.TEMPLATE_FLOW.basket()', { title: 'auto', mode: 'auto' });
  const auto = await result();
  check(Math.abs(auto.p - 0.55) < 1e-9 && auto.feel.bonus === 4, `おまかせ: p 0.55 → +4 (the old button)`);
  await start('M.TEMPLATE_FLOW.basket()', { title: 'esc' });
  await sleep(400); await page.keyboard.press('Escape');
  check((await result()).cancelled, 'Esc cancels and gives everything back');

  // ---------------------------------------------------------------- sharpening restores durability
  const sh = await page.evaluate(async () => {
    const g = window.ISLE.game, inv = g.sys.player.inv;
    g.settings.handwork = 'auto';
    const k = inv.find('knife'); k.dur = 100; inv.add('stone', 1, { q: 50 });
    await g.actions.sharpen(k.uid);
    g.settings.handwork = 'manual';
    return { dur: k.dur, can: g.actions.canSharpen(k.uid) };
  });
  check(sh.dur > 200 && sh.can, `研ぐ: durability 100 → ${sh.dur} of 400`);

  // ---------------------------------------------------------------- butchering: mild diagram, knowledge, deep cut, skip
  await start("BT.butcherFlow({ kind: BT.butcherKind('goat'), view: 'mild', K: 2 })", { title: 'goat', scene: { carcass: { species: 'goat', view: 'mild', knowledge: 2, done: {}, traced: {}, portions: 0 } } });
  await sleep(500);
  const red = await page.evaluate(() => { const c = document.querySelector('.hw-cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > d[i + 1] + 60 && d[i] > d[i + 2] + 60 && d[i + 1] < 100 && d[i + 3] > 200) n++; return n; });
  check(red === 0, `ひかえめ: no red on the diagram (${red} red pixels)`);
  await play();
  const goat = await result();
  check(goat.p >= 0.7 && !goat.extra.cutDeep && goat.steps.some((s) => s.bstep === 'portion'), `goat, K2, careful: p ${goat.p.toFixed(2)}, all steps (${goat.steps.map((s) => s.bstep).join(' ')})`);
  await start("BT.butcherFlow({ kind: BT.butcherKind('goat'), view: 'normal', K: 3 })", { title: 'deep', scene: { carcass: { species: 'goat', view: 'normal', knowledge: 3, showNoTouch: true, done: {}, traced: {}, portions: 0 } } });
  await sleep(400);
  await play(0, 1); // bleed
  await sleep(300);
  await play(45, 1); // open: 45 px into the body → into the no-touch zone
  await sleep(300);
  await play();
  const deep = await result();
  check(deep.extra.cutDeep === true, 'cutting deep into the 「さわらない 所」 spoils the meat (cutDeep)');
  const flow0 = await page.evaluate(async () => { const BT = await import('./js/player/butcher.js'); return BT.butcherFlow({ kind: BT.butcherKind('boar'), view: 'mild', K: 0 }).map((s) => s.kind).join(','); });
  check(/^choose,trace,choose,trace/.test(flow0), `K0 asks which step comes next (${flow0.slice(0, 40)}…)`);
  // the real carcass with 省略: no work table, a fade, the table's yields
  const sk = await page.evaluate(async () => {
    const g = window.ISLE.game, P = g.sys.player, F = g.sys.fauna;
    g.settings.butcherView = 'skip';
    const a = F.animals.find((x) => x.kind === 'goat');
    if (!a) return { err: 'no goat' };
    F.kill?.(a, 'test');
    const node = a.node || F.carcasses?.find?.((c) => c.data.animal === a);
    if (!node) return { err: 'no node' };
    const before = P.inv.count('goat_meat');
    const p = g.sys.interact.butcherCarcass(node);
    const sawTable = !!g.handwork.active;
    await p;
    g.settings.butcherView = 'mild';
    return { meat: P.inv.count('goat_meat') - before, sawTable, K: g.sys.knowledge.level('howto_butcher_beast') };
  });
  check(!sk.err && sk.meat >= 6 && !sk.sawTable && sk.K === 0, `省略: yields without the procedure (meat ${sk.meat}${sk.err ? ` ${sk.err}` : ''}); counts as half a lesson (K${sk.K})`);
  // fish prep from the bag
  const fish = await page.evaluate(async () => {
    const g = window.ISLE.game, inv = g.sys.player.inv;
    g.settings.handwork = 'auto';
    const s = inv.add('sardine', 1, { fresh: 100 });
    const uid = (s && s.uid) || inv.stacks.find((x) => x.id === 'sardine').uid;
    const can = g.actions.canPrepFish(uid);
    await g.actions.prepFish(uid);
    const f = inv.stacks.find((x) => x.id === 'sardine' && x.gutted);
    g.settings.handwork = 'manual';
    return { can, gutted: !!f, bled: !!f?.bled };
  });
  check(fish.can && fish.gutted && fish.bled, 'fish: 下ごしらえ from the bag → gutted and bled (decays slower)');
  check(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`);

  await browser.close();
  srv.close();
  if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
  console.log('\nall handwork checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
