// tests/companion.cjs — the partner in the real game (DESIGN §23): the rolled sheet drives the body, the bag and the
// legs; requests are accepted by affinity/trust; job output follows the sheet; food is shared by affinity stage;
// stage changes are announced; the sheet survives save → load.
//   node tests/companion.cjs
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');

const fail = [];
const log = (...a) => console.log('[companion]', ...a);
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

async function boot(browser, base, q) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await page.goto(base + '?quick&nosound&quality=low&starter=knife&count=1&seed=11&' + q);
  await page.waitForFunction(() => window.ISLE?.game?.running && window.ISLE.game.sys.companion?.ready, null, { timeout: 120000 });
  await page.waitForTimeout(500);
  return { page, errors };
}

(async () => {
  const srv = await serve(0, path.resolve(__dirname, '..'));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // ---------------------------------------------------------------- 1 a cold stranger (stage 1, low trust)
  {
    const { page, errors } = await boot(browser, base, 'companion=nagi&prof=nurse&aff=5');
    const r = await page.evaluate(() => {
      const g = window.ISLE.game, C = g.sys.companion;
      const out = { prof: C.sheet.profession, stage: C.stage, carry: C.inv.capacity, drain: C.vitals.drainMul, traits: C.vitals.traits, speedMul: C.body.speedMul };
      g.sys.weather.type = 'clear'; g.sys.weather.rain = 0;
      g.clock.total = g.clock.total - (g.clock.hour - 10) * 60; // 10:00 (no night penalty)
      C.trust = 15;
      out.pLow = C.acceptChanceFor('gather_wood');
      let ok = 0, n = 0;
      for (let i = 0; i < 200; i++) { C.refused = {}; C.job = null; C.order = 'follow'; const res = C.doJob('gather_wood'); n++; if (res === 'ok') ok++; }
      out.rateLow = ok / n;
      C.trust = 70; C.affinity = 70;
      out.pHigh = C.acceptChanceFor('gather_wood');
      ok = 0;
      for (let i = 0; i < 200; i++) { C.refused = {}; C.job = null; C.order = 'follow'; if (C.doJob('gather_wood') === 'ok') ok++; }
      out.rateHigh = ok / 200;
      // refusing makes the same request pointless for a while
      C.trust = 10; C.affinity = 0; C.refused = {}; C.job = null;
      let first;
      for (let i = 0; i < 50 && (first = C.doJob('fish')) === 'ok'; i++) { C.job = null; C.order = 'follow'; }
      out.again = C.doJob('fish');
      out.listReason = C.jobs().find((j) => j.id === 'fish').reason;
      // storm: dangerous jobs are refused below trust 60
      g.sys.weather.type = 'storm'; C.trust = 50; C.affinity = 50; C.refused = {};
      out.stormP = C.acceptChanceFor('fish');
      g.sys.weather.type = 'clear';
      return out;
    });
    check(r.prof === 'nurse', `profession from the quick setup (${r.prof})`);
    check(r.stage === 1, `affinity 5 → stage 1 (${r.stage})`);
    check(r.carry > 6 && r.carry < 15 && r.carry !== 10, `carry from STR (${r.carry} kg)`);
    check(r.drain > 0.55 && r.drain < 1.0 && r.drain !== 0.8, `appetite from the sheet (${r.drain.toFixed(3)})`);
    check(r.traits.coldLow > 15 && r.traits.coldLow < 25 && typeof r.traits.illness === 'number', `body traits applied (coldLow ${r.traits.coldLow.toFixed(1)}, illness ×${r.traits.illness.toFixed(2)})`);
    check(r.speedMul > 0.8 && r.speedMul < 1.2, `legs from AGI (×${r.speedMul.toFixed(2)})`);
    check(Math.abs(r.rateLow - r.pLow) < 0.12, `stage 1 / trust 15 accepts about ${(r.pLow * 100) | 0}% (${(r.rateLow * 100) | 0}%)`);
    check(r.rateHigh > r.rateLow + 0.3 && r.pHigh > 0.9, `affinity 70 / trust 70 accepts far more (${(r.rateHigh * 100) | 0}%)`);
    check(/refused/.test(r.again) && /断られた/.test(r.listReason), `asking again right after a refusal (${r.again}; "${r.listReason}")`);
    check(r.stormP === 0, `a sea job in a storm at trust 50 is refused (${r.stormP})`);
    check(!errors.length, `no page errors (${errors.join(' | ')})`);
    await page.close();
  }

  // ---------------------------------------------------------------- 2 job output follows the sheet
  {
    const { page, errors } = await boot(browser, base, 'companion=nagi&prof=fisher&aff=45');
    const r = await page.evaluate(() => {
      const g = window.ISLE.game, C = g.sys.companion;
      const m = {};
      for (const id of ['fish', 'gather_wood', 'gather_food']) m[id] = C.jobs().find((j) => j.id === id).mult;
      // run 2 game hours of fishing directly
      C.inv.stacks.length = 0;
      C.job = { id: 'fish', acc: 0, start: g.clock.total }; C.body.mode = 'work'; C.order = 'job';
      for (let i = 0; i < 120; i++) C.workTick(1);
      const fish = C.inv.count('sardine');
      // the fisher's perk: bites ×1.2 while she stands beside you
      return import('./js/sim/fishing.js').then((F) => {
        g.sys.weather.type = 'clear';
        const o = { spot: 'shallow', bait: 'worm', hook: 's', crouch: true };
        C.body.mode = 'follow'; C.body.place(g.player.pos.x + 2, g.player.pos.z);
        const near = F.biteModel(g, o).meanSec;
        C.body.place(g.player.pos.x + 60, g.player.pos.z);
        const far = F.biteModel(g, o).meanSec;
        return { m, fish, stage: C.stage, near, far };
      });
    });
    check(r.stage === 3, `affinity 45 → stage 3 (${r.stage})`);
    check(r.m.fish > r.m.gather_wood, `a fisher fishes better than she gathers wood (×${r.m.fish.toFixed(2)} vs ×${r.m.gather_wood.toFixed(2)})`);
    check(r.fish >= Math.floor(2 * r.m.fish) - 1 && r.fish <= Math.ceil(2 * r.m.fish) + 1, `2 h of fishing → ${r.fish} sardines (≈ 2 × ${r.m.fish.toFixed(2)})`);
    check(Math.abs(r.far / r.near - 1.2) < 0.01, `a fisher partner beside you: bites ×1.2 (${r.far.toFixed(1)} s → ${r.near.toFixed(1)} s)`);
    check(!errors.length, `no page errors (${errors.join(' | ')})`);
    await page.close();
  }

  // ---------------------------------------------------------------- 3 sharing by stage, stage-up, save → load
  {
    const { page, errors } = await boot(browser, base, 'companion=nagi&prof=cook&aff=10');
    const r = await page.evaluate(() => {
      const g = window.ISLE.game, C = g.sys.companion, P = g.sys.player;
      const out = {};
      const setup = () => {
        C.inv.stacks.length = 0; C.inv.add('coconut', 3, { rng: g.rng }); C.inv.add('berry', 4, { rng: g.rng });
        C.body.place(g.player.pos.x + 1.5, g.player.pos.z); C.lastShareT = -999; C.vitals.s.food = 60;
        P.inv.stacks = P.inv.stacks.filter((s) => !['coconut', 'berry'].includes(s.id));
      };
      const playerGot = () => P.inv.count('coconut') + P.inv.count('berry');
      // stage 1: you are hungry (30) → nothing; starving (10) → a little
      setup(); P.body.s.food = 30; C.shareFood(); out.s1hungry = playerGot();
      setup(); P.body.s.food = 10; C.shareFood(); out.s1starving = playerGot();
      // stage 1: taking her food is refused unless you are starving
      setup(); P.body.s.food = 50; out.take1 = C.take(C.inv.stacks[0].uid, 1);
      // stage-up announcement
      const ev = []; g.bus.on('companion:stage', (e) => ev.push(e));
      C.adjust(0, 35);
      out.stageAfter = C.stage; out.events = ev.map((e) => `${e.stage}:${e.name}`);
      // stage 3: you are a bit hungry (35) → she hands food over unasked
      setup(); P.body.s.food = 35; C.shareFood(); out.s3 = playerGot();
      out.take3 = (setup(), C.take(C.inv.stacks[0].uid, 1));
      // stage 5: half of a stack, even when she is hungry herself
      C.adjust(0, 50);
      setup(); C.vitals.s.food = 20; P.body.s.food = 35; C.shareFood(); out.s5 = playerGot();
      // save → load keeps the sheet
      const sheetBefore = JSON.stringify(C.sheet);
      const data = C.serialize();
      C.setSheet(window.ISLE.game.sys.companion.sheet); // no-op
      const rolled = { ...C.sheet, profession: 'office', abilities: { ...C.sheet.abilities, str: 3 } };
      C.setSheet(rolled);
      C.deserialize(JSON.parse(JSON.stringify(data)));
      out.sheetKept = JSON.stringify(C.sheet) === sheetBefore;
      out.carryKept = C.inv.capacity;
      out.hud = C.hudInfo();
      return out;
    });
    check(r.s1hungry === 0, `stage 1 does not share when you are only hungry (${r.s1hungry})`);
    check(r.s1starving === 1, `stage 1 gives one when you are starving (${r.s1starving})`);
    check(r.take1 === false, 'stage 1 keeps its own food when you try to take it');
    check(r.stageAfter === 3 && r.events.join() === '3:打ち解けた', `stage-up events (${r.events.join()})`);
    check(r.s3 === 1, `stage 3 shares when you are below 40 (${r.s3})`);
    check(r.take3 === true, 'stage 3 lets you take food');
    check(r.s5 >= 2, `stage 5 gives half a stack even when hungry itself (${r.s5})`);
    check(r.sheetKept, 'the sheet survives save → load');
    check(r.hud.stage === 5 && r.hud.stageName && r.hud.profession === '料理人', `HUD info (${r.hud.stage} ${r.hud.stageName} ${r.hud.profession})`);
    check(!errors.length, `no page errors (${errors.join(' | ')})`);
    await page.close();
  }

  // ---------------------------------------------------------------- 4 相談して 頼む (§24.8): proposals, answers, triggers, Live tools
  {
    const { page, errors } = await boot(browser, base, 'companion=nagi&prof=fisher&aff=45');
    const r = await page.evaluate(() => {
      const g = window.ISLE.game, C = g.sys.companion, P = g.sys.player.body.s, out = {};
      C.body.place(g.player.pos.x + 2, g.player.pos.z);
      P.water = 20; P.food = 80;
      const c1 = C.discuss('consult');
      out.sit = c1.situation; out.choices = c1.choices.map((x) => x.id).join(); out.text = c1.text;
      C.answer('ok'); out.job = C.job?.id; out.order = C.order;
      // a trigger at dusk proposes with buttons (stage 3)
      C.follow(); C.job = null; C.trigT = {}; C.lastProposalT = -999; P.water = 80;
      g.clock.total += ((17.4 - g.clock.hour + 24) % 24) * 60;
      C.checkTriggers();
      out.trigSit = C.pendingPlan?.sit; out.hud = document.getElementById('hud-choice')?.className;
      C.answer('no'); out.afterNo = C.order;
      // Live tools: on its own at stage 3 without agreement → not allowed; asked by the player → the game rolls
      C.agreedPlan = null;
      out.selfDenied = C.askJobTool('gather_wood', 'self');
      C.trust = 90; C.affinity = 90; C.adjust(0, 0); C.refused = {};
      out.playerAsk = C.askJobTool('gather_wood', 'player');
      C.follow(); C.job = null;
      out.propose = C.proposePlanTool([{ job: 'fish', reason: '潮が いい' }]);
      out.pendingAfterPropose = !!C.pendingPlan;
      C.answer('together'); out.together = C.togetherActive();
      return out;
    });
    check(r.sit === 'water' && r.choices === 'ok,together,no' && r.text, `consult when thirsty proposes water (${r.sit}: ${r.text})`);
    check(r.job && r.order === 'job', `お願い starts the proposed job (${r.job})`);
    check(r.trigSit === 'dusk' && r.hud === 'on', `the dusk trigger shows a proposal with buttons (${r.trigSit})`);
    check(/not allowed/.test(r.selfDenied), `on its own at stage 3 the model must propose first (${r.selfDenied})`);
    check(/accepted/.test(r.playerAsk), `a close friend accepts a request (${r.playerAsk})`);
    check(r.pendingAfterPropose && r.together, 'propose_plan → 一緒に やろう');
    check(!errors.length, `no page errors (${errors.join(' | ')})`);
    await page.close();
  }

  await browser.close();
  srv.close();
  if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
  console.log('\nall companion checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
