// tests/fieldcraft.cjs — knowledge-based hands-on field craft (DESIGN §26) in headless Chromium: the snare, the deadfall,
// the fish trap, the fire lay, a coconut, the fishing knot, SOS stones and the signal fire, played with the mouse and
// keys on the trap diagrams; a hasty trigger springs, letting go of a hold drops it; then traps in the real game
// (set on a trail, 6-hour rolls, checking, the catch), track reading, opening a coconut and the signal state.
//   node tests/fieldcraft.cjs
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');

const fail = [];
const log = (...a) => console.log('[fieldcraft]', ...a);
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve(0, path.resolve(__dirname, '..'));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await page.goto(`http://127.0.0.1:${srv.address().port}/?quick&nosound&quality=low&starter=knife&seed=3`);
  await page.waitForFunction(() => window.ISLE?.game?.running, null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.ISLE.game; g.settings = { ...(g.settings || {}), handwork: 'manual', butcherView: 'mild' }; });
  const at = async () => { const b = await page.locator('.hw-cv').boundingBox(); return (x, y) => [b.x + (x / 800) * b.width, b.y + (y / 500) * b.height]; };
  const kstate = () => page.evaluate(() => { const a = window.ISLE.game.handwork.active, k = a?.kind; if (!k || k.done) return null; const s = k.step; return { idx: a.idx, kind: s.kind, hid: s.hid, line: k.line ? k.line.pts.filter((_, i) => i % 6 === 0).concat([k.line.pts[k.line.pts.length - 1]]) : null, depthStop: !!s.depthStop, tokens: k.tokens?.filter((t) => !t.placed).map((t) => ({ id: t.id, x: t.x, y: t.y })), want: k.order?.[k.count], slot: k.slots?.[k.count] ? [k.slots[k.count].x, k.slots[k.count].y] : null, rotating: !!k.rotating, target: k.target, wait: k.T != null ? k.T - k.phase : 0, opts: s.options?.map((o) => ({ ok: o.ok, spot: o.spot })), pick: !!s.pick, band: s.band, gentle: s.release === 'gentle', waitRelease: !!k.waitRelease }; });
  const play = async (prefix) => {
    const A = await at(); let lastIdx = -1;
    for (let n = 0; n < 60; n++) {
      if (!(await page.evaluate(() => !!window.ISLE.game.handwork.active))) return;
      const k = await kstate();
      if (!k) { await sleep(150); continue; }
      if (k.idx !== lastIdx) { lastIdx = k.idx; await sleep(80); }
      if (k.kind === 'choose') { const i = k.pick ? 0 : k.opts.findIndex((o) => o.ok); if (k.opts[i]?.spot) await page.mouse.click(...A(k.opts[i].spot[0], k.opts[i].spot[1])); else await page.keyboard.press(`Digit${i + 1}`); }
      else if (k.kind === 'strike' && k.target) { await sleep(Math.max(0, k.wait * 1000 - 30)); await page.mouse.click(...A(...k.target)); }
      else if (k.kind === 'trace' && k.line) { const pts = k.depthStop ? k.line.slice(0, Math.ceil(k.line.length * 0.55)) : k.line; await page.mouse.move(...A(...pts[0])); await page.mouse.down(); for (const p of pts) await page.mouse.move(...A(...p), { steps: 6 }); await sleep(100); await page.mouse.up(); }
      else if (k.kind === 'place' && k.rotating) { for (let i = 0; i < 40; i++) { const ang = await page.evaluate(() => { const R = window.ISLE.game.handwork.active.kind.rotating; return R ? Math.atan2(Math.sin(R.angle), Math.cos(R.angle)) : null; }); if (ang == null) break; if (Math.abs(ang) < 0.12) { await page.keyboard.press('Enter'); break; } await page.keyboard.down(ang > 0 ? 'KeyQ' : 'KeyE'); await sleep(Math.min(300, Math.abs(ang) / 1.6 * 1000)); await page.keyboard.up(ang > 0 ? 'KeyQ' : 'KeyE'); await sleep(60); } }
      else if (k.kind === 'place' && k.tokens?.length) { const t = k.tokens.find((x) => x.id === k.want) || k.tokens[0]; await page.mouse.move(...A(t.x, t.y)); await page.mouse.down(); await page.mouse.move(...A(...k.slot), { steps: 10 }); await page.mouse.up(); }
      else if (k.kind === 'twist') { await page.mouse.move(...A(520, 262)); await page.mouse.down(); for (let a = 0; a < Math.PI * 2 * 15; a += 0.35) { await page.mouse.move(...A(400 + Math.cos(a) * 120, 262 + Math.sin(a) * 120)); if (Math.floor(a / 3) !== Math.floor((a - 0.35) / 3)) { const st = await kstate(); if (!st || st.kind !== 'twist' || (await page.evaluate(() => window.ISLE.game.handwork.active?.kind?.phase)) === 'tighten') break; } } await page.mouse.up(); await sleep(100); if ((await page.evaluate(() => window.ISLE.game.handwork.active?.kind?.phase)) === 'tighten') { await page.mouse.move(...A(400, 300)); await page.mouse.down(); await page.mouse.move(...A(400, 400), { steps: 5 }); await page.mouse.up(); } }
      else if (k.kind === 'hold') { const c = (k.band[0] + k.band[1]) / 2; const y = 70 + (1 - c) * 360; await page.mouse.move(...A(400, y)); await page.mouse.down(); for (let i = 0; i < 100; i++) { await sleep(100); const st = await page.evaluate(() => { const kk = window.ISLE.game.handwork.active?.kind; return kk ? { done: kk.done, wr: !!kk.waitRelease, kind: kk.step.kind } : null; }); if (!st || st.kind !== 'hold' || st.done || st.wr) break; } await page.mouse.up(); }
      await sleep(200);
    }
  };
  const run = async (expr, scene, playIt = true) => {
    await page.evaluate(async ([fe, sc]) => { const FF = await import('./js/player/fieldflows.js'); window.__hw = null; const H = window.ISLE.game.handwork; H.mastery = {}; H.recent = []; H.run(new Function('FF', `return ${fe}`)(FF), { title: 'test', key: 'fc', scene: { trap: sc } }).then((r) => { window.__hw = r; }); }, [expr, scene]);
    await sleep(500);
    if (playIt) await play('x');
    await page.waitForFunction(() => window.__hw, null, { timeout: 25000 }).catch(() => {});
    return page.evaluate(() => window.__hw);
  };

  // ---------------------------------------------------------------- each procedure, played carefully
  const flows = [
    ['snare', 'FF.snareFlow({ K: 2, trailUsers: ["junglefowl", "rat"] })', { id: 'snare', K: 2 }],
    ['deadfall', 'FF.deadfallFlow({ K: 2 })', { id: 'deadfall', K: 2 }],
    ['fish trap', 'FF.basketFlow("fish_trap", { K: 2 })', { id: 'fish_trap', K: 2 }],
    ['fire lay', 'FF.fireLayFlow({ K: 2 })', { id: 'firelay', K: 2 }],
    ['coconut', 'FF.coconutFlow({ K: 1, blade: true })', { id: 'coconut', K: 1 }],
    ['knot', 'FF.knotFlow({ K: 2 })', { id: 'knot', K: 2 }],
    ['SOS', 'FF.sosFlow({ K: 2 })', { id: 'sos', K: 2 }],
    ['signal fire', 'FF.signalFireFlow({ K: 2 })', { id: 'signal', K: 2 }],
  ];
  const res = {};
  for (const [name, expr, sc] of flows) {
    const r = await run(expr, sc);
    res[name] = r;
    check(r && !r.cancelled && r.p >= 0.7, `${name}: careful hands (p ${r?.p?.toFixed(2)}; ${r?.steps?.map((s) => `${s.hid || s.kind}:${s.p.toFixed(2)}`).join(' ')})`);
  }
  check(res.snare.extra.triggerD >= 0.35 && res.snare.extra.triggerD <= 0.65 && res.snare.extra.aim, `snare: the trigger set at a good depth (d ${res.snare.extra.triggerD?.toFixed(2)}), aim ${res.snare.extra.aim}`);
  check(res['fish trap'].extra.mouthMul === 1, `fish trap: the mouth faces downstream (error ${res['fish trap'].extra.mouthErr?.toFixed(0)}°)`);
  check(res['fire lay'].extra.layType === 'teepee', 'fire lay: the type was chosen');

  // ---------------------------------------------------------------- mistakes
  // letting go of the sapling springs it
  await page.evaluate(async () => { const FF = await import('./js/player/fieldflows.js'); window.__hw = null; window.ISLE.game.handwork.recent = []; window.ISLE.game.handwork.run([FF.snareFlow({ K: 2 }).find((s) => s.hid === 'bend')], { title: 'drop', scene: { trap: { id: 'snare', K: 2 } } }).then((r) => { window.__hw = r; }); });
  await sleep(500);
  { const A = await at(); await page.mouse.move(...A(400, 220)); await page.mouse.down(); await sleep(700); await page.mouse.up(); }
  await page.waitForFunction(() => window.__hw, null, { timeout: 10000 }).catch(() => {});
  const drop = await page.evaluate(() => window.__hw);
  check(drop && drop.extra.dropped && drop.p < 0.2, `hold: letting go early drops it (p ${drop?.p?.toFixed(2)})`);
  // a hasty trigger springs under your fingers
  await page.evaluate(async () => { const FF = await import('./js/player/fieldflows.js'); window.__hw = null; window.ISLE.game.handwork.recent = []; window.ISLE.game.handwork.run([FF.snareFlow({ K: 2 }).find((s) => s.hid === 'trigger')], { title: 'snap', scene: { trap: { id: 'snare', K: 2 } } }).then((r) => { window.__hw = r; }); });
  await sleep(500);
  { const A = await at(); const k = await kstate(); await page.mouse.move(...A(...k.line[0])); await page.mouse.down(); await sleep(150); await page.mouse.move(...A(...k.line[Math.floor(k.line.length / 2)]), { steps: 1 }); await sleep(120); await page.mouse.up(); }
  await page.waitForFunction(() => window.__hw, null, { timeout: 10000 }).catch(() => {});
  const snap = await page.evaluate(() => window.__hw);
  check(snap && snap.extra.snapped, 'trigger: too fast → it springs on your hand');

  // ---------------------------------------------------------------- in the game (おまかせ): traps, tracks, coconut, signals
  await page.evaluate(() => window.ISLE.game.handwork.cancel?.());
  await sleep(300);
  const g1 = await page.evaluate(async () => {
    const g = window.ISLE.game, T = g.sys.traps, inv = g.sys.player.inv, out = {};
    g.settings.handwork = 'auto';
    const tr = T.trails.find((t) => t.zone === 'grass' && t.users.includes('junglefowl')) || T.trails.find((t) => t.zone === 'grass');
    const [x, z] = tr.pts[5], [x2, z2] = tr.pts[6];
    g.player.place(x - (x2 - x) * 0.3, z - (z2 - z) * 0.3, 0); g.player.yaw = Math.atan2(-(x2 - x), -(z2 - z)); g.player.updateCamera(0);
    inv.add('snare', 1, { q: 70 }); inv.add('berry', 3, { fresh: 90 });
    await g.actions.setTrap(inv.stacks.find((q) => q.id === 'snare').uid);
    const t = T.list[0];
    out.set = t && { onTrail: t.onTrail, aim: t.aim, bait: t.bait?.id, K: t.K, p: +t.p.toFixed(2) };
    let h = 0;
    for (; h < 96 && t.state === 'set'; h++) { g.clock.total += 60; T.hourly(); }
    out.after = { state: t.state, catch: t.catch, hours: h };
    g.player.place(t.x + 1, t.z, 0); g.player.yaw = Math.atan2(1, 0); g.player.updateCamera(0);
    const it = g.sys.interact; it.update(0.016);
    out.target = it.target?.type;
    if (it.target?.type === 'trap') { await it.trapAction(t, it.target.options[0]); for (let i = 0; i < 60 && g.handwork.active; i++) await new Promise((r) => setTimeout(r, 100)); }
    out.K = g.sys.knowledge.level('howto_trap_snare');
    // track reading on a sign
    const sg = T.signs()[0];
    g.player.place(sg.x, sg.z, 0); g.player.crouch = true;
    it.update(0.016); out.signTarget = it.target?.type;
    await it.readSign(sg);
    out.Kt = g.sys.knowledge.level('howto_read_tracks');
    g.player.crouch = false;
    // a coconut, opened by hand (おまかせ)
    inv.add('coconut', 1, { stage: 'brown' });
    const w0 = g.sys.player.body.s.water; g.sys.player.body.s.water = 40;
    await g.actions.openCoconut(inv.stacks.find((q) => q.id === 'coconut').uid);
    out.coconut = { water: Math.round(g.sys.player.body.s.water - 40), shells: inv.count('coconut_shell'), Kc: g.sys.knowledge.level('howto_coconut') };
    // signals feed the rescue rolls
    const E = await import('./js/sim/events.js');
    const a = E.noticeProbability('ship', { sos: 1 }, {}), b = E.noticeProbability('ship', { sos: 1, sosMul: 1.09 }, {});
    out.sos = { base: +a.p.toFixed(3), good: +b.p.toFixed(3) };
    out.state = typeof g.signalState === 'function';
    return out;
  });
  check(g1.set?.onTrail && g1.set.bait, `snare set on a game trail with bait (${JSON.stringify(g1.set)})`);
  check(g1.after.state === 'caught' || g1.after.state === 'sprung', `after ${g1.after.hours} h: ${g1.after.state}${g1.after.catch ? ` (${g1.after.catch})` : ''}`);
  check(g1.target === 'trap' && g1.K >= 1, `checking the trap (target ${g1.target}); how-to K${g1.K}`);
  check(g1.signTarget === 'sign' && g1.Kt >= 1, `reading tracks on a trail (K${g1.Kt})`);
  check(g1.coconut.water >= 8 && g1.coconut.shells >= 1 && g1.coconut.Kc >= 1, `coconut opened by hand: water +${g1.coconut.water}, shells ${g1.coconut.shells}, K${g1.coconut.Kc}`);
  check(g1.sos.good > g1.sos.base && g1.state, `well-made SOS stones are noticed more (${g1.sos.base} → ${g1.sos.good})`);
  check(!errs.length, `no page errors (${errs.slice(0, 3).join(' | ')})`);

  await browser.close();
  srv.close();
  if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
  console.log('\nall fieldcraft checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
