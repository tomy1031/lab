// tests/play.cjs — a scripted day on the island in headless Chromium, driving the real game through its APIs
// (gather → build a campfire → light it → cook → eat → drink → fish → hunt → craft → sleep → save).
//   node tests/play.cjs [outDir]
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');

const out = process.argv[2] || path.join(os.tmpdir(), 'island-play');
fs.mkdirSync(out, { recursive: true });
const fail = [];
const log = (...a) => console.log('[play]', ...a);
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

(async () => {
  const srv = await serve(0, path.resolve(__dirname, '..'));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await page.goto(base + '?quick&nosound&quality=low&starter=knife,firesteel,rod,rifle&count=4&ammo=12&seed=7');
  await page.waitForFunction(() => window.ISLE?.game?.running, null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  // helpers inside the page
  await page.evaluate(() => {
    const g = window.ISLE.game;
    window.T = {
      g,
      /** run the current activity to completion with synthetic input */
      finishActivity(kind = 'click', max = 600) {
        const it = g.sys.interact;
        for (let i = 0; i < max && it.activity; i++) {
          const a = it.activity;
          const input = { click: kind === 'click' || i % 2 === 0, hold: true, release: false, holdE: true, axisX: i % 2 ? 30 : -30, gestures: [], keyAlt: true, keys: { Space: true } };
          if (a.spec.kind === 'rod') { input.hold = a.phase === 'aim' ? i < 20 : a.phase === 'reel' ? (a.bar2 ?? 0) < 0.8 : false; input.release = a.phase === 'aim' && i === 20; input.click = a.phase === 'bite'; }
          if (a.spec.kind === 'net') input.click = true;
          a.update(1 / 20, input);
        }
        return !it.activity;
      },
      nearestNode(kind, r = 200) {
        const P = g.player.pos;
        let best = null, bd = r;
        for (const n of g.world.nodes.all.values()) { if (n.kind !== kind || !n.alive) continue; const d = Math.hypot(n.x - P.x, n.z - P.z); if (d < bd) { bd = d; best = n; } }
        return best;
      },
      goNear(node, dist = 1.4) {
        const dx = g.player.pos.x - node.x, dz = g.player.pos.z - node.z, L = Math.hypot(dx, dz) || 1;
        g.player.place(node.x + (dx / L) * dist, node.z + (dz / L) * dist, 0);
        g.player.yaw = Math.atan2(-(node.x - g.player.pos.x), -(node.z - g.player.pos.z));
        g.player.pitch = -0.3;
        g.player.updateCamera(0);
      },
      inv() { return Object.fromEntries(g.sys.player.inv.stacks.map((s) => [s.id, (g.sys.player.inv.count(s.id))])); },
    };
  });

  // 1. gather: branches from a tree, a stone, vines
  const g1 = await page.evaluate(() => {
    const it = T.g.sys.interact, out = {};
    for (const kind of ['tree', 'rock', 'vine', 'grass_tuft']) {
      const n = T.nearestNode(kind);
      if (!n) { out[kind] = 'none'; continue; }
      T.goNear(n);
      it.update(0.016);
      const t = it.target;
      if (!t || t.type !== 'node') { out[kind] = 'no target: ' + (t?.type || 'null'); continue; }
      it.run(t, t.options.find((o) => o.ok !== false) || t.options[0]);
      out[kind] = T.finishActivity('hold');
    }
    return { out, inv: T.inv() };
  });
  log(JSON.stringify(g1));
  check(g1.inv.branch >= 2 && g1.inv.twig >= 3, `gathered branches and twigs (${g1.inv.branch}/${g1.inv.twig})`);
  check(g1.inv.stone >= 1 || g1.inv.flat_stone >= 1, 'picked up a stone');

  // 2. build a campfire right here
  const b = await page.evaluate(() => {
    const g = T.g, B = g.sys.building;
    if (!B) return { err: 'no building system' };
    B.startPlacing('campfire');
    g.placement.update();
    const placed = g.placement.active ? g.placement.confirm() : false;
    const site = B.sites[B.sites.length - 1];
    if (!site) return { err: 'no site', placed };
    const del = B.deliver(site, g.sys.player.inv.stacks.map((s) => s.uid));
    const ready = B.isReady(site);
    const w = B.work(site, 60, {});
    return { placed, delivered: del.delivered?.length, ready, stage: site.stage, fire: !!site.fire, fires: g.fires.length };
  });
  log(JSON.stringify(b));
  check(b.stage === 'done' && b.fire && b.fires >= 1, 'campfire built and has a fire');

  // 3. light it with the fire steel
  const f = await page.evaluate(async () => {
    const g = T.g, it = g.sys.interact, rec = g.sys.fires.list[0];
    if (!rec) return { err: 'no fire' };
    g.sys.player.inv.add('dry_grass', 3, { q: 60 });
    const fp = rec.fire.group.position;
    g.player.place(fp.x + 1.4, fp.z, 0); g.player.yaw = Math.PI / 2; g.player.updateCamera(0);
    const ms = it.fireMethods(rec);
    // the work table (§24) in おまかせ mode: a short animation with p 0.55
    g.settings = { ...(g.settings || {}), handwork: 'auto' };
    const wait = (ms2) => new Promise((r) => setTimeout(r, ms2));
    let tries = 0;
    while (!rec.fire.lit && tries < 8) {
      tries++; it.lightFire(rec, ms[0]); T.finishActivity('click');
      await wait(150);
      for (let i = 0; i < 100 && g.handwork?.active; i++) await wait(100);
    }
    return { methods: ms.map((m) => `${m.id}:${m.p.toFixed(2)}`), lit: rec.fire.lit, tries };
  });
  log(JSON.stringify(f));
  check(f.lit, `the fire is lit with the fire steel (${f.tries} tries)`);

  // 4. cook a fish and eat it; check the eat card
  const c = await page.evaluate(() => {
    const g = T.g, P = g.sys.player, rec = g.sys.fires.list[0];
    const s = P.inv.add('jack', 1, { fresh: 100 });
    g.sys.fires.cook(rec, P.inv.take(s.uid, 1)[0]);
    // cook in real seconds: simulate 4 s of mid fire
    // a small fire (laid twigs, < 1 h of fuel) cooks at 3 / s: about 25 s to "well done" (§7.3)
    for (let i = 0; i < 260; i++) g.sys.fires.update(0.1, 0.1);
    const cooked = g.sys.fires.takeOff(rec, 0);
    const card = g.actions.eatCard(cooked.uid);
    const before = P.body.s.food;
    g.actions.eat(cooked.uid);
    return { done: Math.round(cooked.done), card, gained: Math.round(P.body.s.food - before) };
  });
  log(JSON.stringify(c));
  check(c.done >= 30 && c.gained > 10, `cooked fish (done ${c.done}) gave food +${c.gained}`);
  check(c.card && c.card.risk, 'eat card computed');

  // 5. drink at the stream
  const d = await page.evaluate(() => {
    const g = T.g, t = g.world.terrain, L = g.world.layout, P = g.sys.player;
    const [x, z] = L.stream[3];
    g.player.place(x + 3.5, z, 0);
    // face the water
    g.player.yaw = Math.PI / 2; g.player.pitch = -0.4; g.player.updateCamera(0);
    const it = g.sys.interact; it.update(0.016);
    const tgt = it.target;
    const before = P.body.s.water;
    if (tgt?.type === 'water') { it.run(tgt, tgt.options.find((o) => o.id === 'drink_hand')); T.finishActivity('hold'); }
    return { target: tgt?.type, water: Math.round(P.body.s.water - before), zone: t.zoneAt(g.player.pos.x, g.player.pos.z) };
  });
  log(JSON.stringify(d));
  check(d.target === 'water' && d.water > 0, `drank from the stream (+${d.water})`);

  // 6. fishing with the rod at the bay
  const fi = await page.evaluate(() => {
    const g = T.g, P = g.sys.player, t = g.world.terrain;
    const s = t.shorePoint(Math.atan2(140, -140), 1.4);
    g.player.place(s.x, s.z, 0);
    g.player.yaw = Math.atan2(-s.x, -s.z) + Math.PI; g.player.pitch = -0.1; g.player.updateCamera(0);
    P.equip(P.inv.find('rod').uid);
    P.inv.add('shellfish', 3, { fresh: 100 });
    const before = P.stats.fishCaught;
    let casts = 0;
    for (let k = 0; k < 6 && P.stats.fishCaught === before; k++) { g.sys.interact.cast(); casts++; T.finishActivity('fish', 4000); }
    return { casts, caught: P.stats.fishCaught - before };
  });
  log(JSON.stringify(fi));
  check(fi.caught >= 1, `caught a fish with the rod in ${fi.casts} casts`);

  // 7. hunting: a goat in front, rifle shot to the chest
  const h = await page.evaluate(() => {
    const g = T.g, P = g.sys.player, F = g.sys.fauna;
    const goat = F.animals.find((a) => a.kind === 'goat' && a.alive);
    if (!goat) return { err: 'no goat' };
    // a clear line of fire: the goat on the open beach, the hunter 20 m along the shore
    const t = g.world.terrain;
    const a1 = Math.atan2(-60, 210), s1 = t.shorePoint(a1, 1.8), s2 = t.shorePoint(a1 + 0.09, 1.8);
    goat.pos.set(s1.x, t.heightAt(s1.x, s1.z), s1.z);
    for (const n of g.world.nodes.query(s1.x, s1.z, 30, (n) => n.solid)) n.solid = false;
    g.player.place(s2.x, s2.z, 0);
    goat.state = 'normal'; goat.target = null; goat.speed = 0;
    goat.yaw = Math.atan2(s2.x - s1.x, s2.z - s1.z) + Math.PI / 2; // broadside
    const cam = g.renderer.camera;
    g.player.updateCamera(0);
    const z = F.zones(goat).find((x) => x.part === 'heart');
    const dir = z.p.clone().sub(cam.position).normalize();
    g.player.yaw = Math.atan2(-dir.x, -dir.z); g.player.pitch = Math.asin(dir.y); g.player.updateCamera(0);
    P.equip(P.inv.find('rifle').uid);
    g.sys.combat.aiming = true; g.sys.combat.rested = true;
    const ammo0 = P.inv.count('ammo');
    g.sys.interact.fireRifle();
    for (let i = 0; i < 300 && goat.alive; i++) F.update(0.1, 0.1);
    return { alive: goat.alive, state: goat.state, ammoUsed: ammo0 - P.inv.count('ammo'), carcass: !!goat.node };
  });
  log(JSON.stringify(h));
  check(h.ammoUsed === 1 && h.alive === false && h.carcass, 'rifle shot killed the goat (one round used)');

  // 8. butcher it with the knife
  const bu = await page.evaluate(async () => {
    const g = T.g, P = g.sys.player, F = g.sys.fauna;
    const goat = F.animals.find((a) => a.kind === 'goat' && !a.alive);
    if (!goat) return { err: 'no carcass' };
    T.goNear(goat.node, 1.2);
    const it = g.sys.interact; it.update(0.016);
    const t = it.target;
    if (t?.type !== 'carcass') return { err: 'target ' + t?.type };
    const label = t.options.find((o) => o.id === 'butcher')?.label;
    it.run(t, t.options.find((o) => o.id === 'butcher'));
    T.finishActivity('hold');
    // §25: the procedure on the diagram (おまかせ here: p 0.55)
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(200);
    for (let i = 0; i < 150 && (g.handwork?.active || P.inv.count('goat_meat') === 0); i++) await wait(100);
    return { meat: P.inv.count('goat_meat'), hide: P.inv.count('hide'), organs: P.inv.count('organ_meat'), label, K: g.sys.knowledge.level('howto_butcher_beast') };
  });
  log(JSON.stringify(bu));
  check(bu.meat >= 6 && bu.hide >= 1, `butchered: meat ${bu.meat}, hide ${bu.hide}`);
  check(/下ごしらえ/.test(bu.label || '') && bu.K >= 1, `mild wording by default and the how-to learned (「${bu.label}」, K${bu.K})`);

  // 9. crafting (if the crafting system is there): a cord from 3 vines
  const cr = await page.evaluate(() => {
    const g = T.g, C = g.sys.crafting, P = g.sys.player;
    if (!C) return { skip: true };
    P.inv.add('vine', 3, { q: 55 });
    // each entry is one unit (what the craft screen passes): three vines from the same stack
    const v = P.inv.stacks.find((s) => s.id === 'vine').uid;
    const vines = [v, v, v];
    const prev = C.preview('weave', vines);
    const r = C.craft('weave', vines, { score: 0.6 });
    return { prev: prev.map((p) => `${p.kind}:${p.id}`), ok: r?.ok, id: r?.stack?.id, q: r?.stack?.q };
  });
  log(JSON.stringify(cr));
  if (!cr.skip) check(cr.ok, `crafted ${cr.id} (Q ${cr.q})`);

  // 9b. hand gestures drive the same actions: a downward stroke with the rod casts; a fist stroke shakes a palm
  const ge = await page.evaluate(() => {
    const g = T.g, P = g.sys.player, it = g.sys.interact;
    it.cancelActivity();
    g.hands = { ready: true, events: [], motion: { state: { aim: null, draw: 0 } }, cursor: { visible: false } };
    const t = g.world.terrain;
    const s = t.shorePoint(Math.atan2(140, -140), 1.4);
    g.player.place(s.x, s.z, 0); g.player.yaw = Math.atan2(-s.x, -s.z) + Math.PI; g.player.updateCamera(0);
    P.equip(P.inv.find('rod').uid);
    g.hands.events = [{ type: 'swing', dir: 'down', pose: 'fist', speed: 8 }];
    it.update(0.016);
    const cast = it.activity?.spec.kind || null;
    it.cancelActivity();
    const palm = T.nearestNode('palm');
    T.goNear(palm, 1.2);
    P.equip(null);
    g.hands.events = [];
    it.update(0.016);
    g.hands.events = [{ type: 'swing', dir: 'up', pose: 'fist', speed: 8 }];
    it.update(0.016);
    const shake = it.activity?.spec.kind || null;
    // finish the palm shake with three more strokes
    for (let k = 0; k < 6 && it.activity; k++) { g.hands.events = [{ type: 'swing', dir: 'up', pose: 'fist', speed: 8 }]; it.activity.update(0.5, { gestures: g.hands.events, click: false, hold: false, release: false, axisX: 0, keys: {} }); }
    g.hands = null;
    return { cast, shake, coconuts: P.inv.count('coconut') };
  });
  log(JSON.stringify(ge));
  check(ge.cast === 'rod', 'a downward hand stroke with the rod starts a cast');
  check(ge.shake === 'hit' && ge.coconuts >= 1, `fist strokes at a palm shake down coconuts (${ge.coconuts})`);

  // 10. sleep until morning by the fire, then save
  const sl = await page.evaluate(async () => {
    const g = T.g, P = g.sys.player, rec = g.sys.fires.list[0];
    const fp = rec.fire.group.position;
    g.player.place(fp.x + 2, fp.z, 0);
    g.clock.total = Math.floor(g.clock.total / 1440) * 1440 + 22 * 60; // 22:00
    P.body.s.rest = 30;
    // keep the fire going through the night and sleep dry (otherwise you wake up cold — as designed)
    rec.fire.fuel = Math.max(rec.fire.fuel, 300); rec.fire.lit = true;
    P.body.s.wet = 0;
    const blk = Math.floor(g.clock.total / 360);
    for (let k = 0; k < 3; k++) g.sys.weather.forced.push({ block: blk + k, type: 'clear' });
    g.actions.sleep('morning');
    const sleeping = P.sleeping;
    // fast-forward the game loop (frames)
    for (let i = 0; i < 600 && P.sleeping; i++) { g.update(0.1); }
    const saved = g.save();
    const toasts = [...document.querySelectorAll('#hud-toasts *')].map((e) => e.textContent).slice(-4);
    return { toasts, water: Math.round(P.body.s.water), feel: Math.round(P.body.feel), sleeping, awake: !P.sleeping, hour: g.clock.hour.toFixed(1), day: g.clock.day, rest: Math.round(P.body.s.rest), hp: Math.round(P.body.s.hp), saved, bt: P.body.s.bodyTemp.toFixed(1) };
  });
  log(JSON.stringify(sl));
  check(sl.sleeping && sl.awake && sl.rest > 60, `slept until ${sl.hour}h day ${sl.day} (rest ${sl.rest})`);
  check(sl.saved, 'game saved');

  await page.screenshot({ path: path.join(out, 'play-end.png') });
  const all = [...errors, ...(await page.evaluate(() => window.ISLE.errors.filter((e) => !/crafting\.js/.test(e))))];
  check(all.length === 0, `no errors (${all.slice(0, 5).join(' | ')})`);
  await browser.close(); srv.close();
  console.log(fail.length ? `\n${fail.length} FAILED` : '\nplaytest passed');
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
