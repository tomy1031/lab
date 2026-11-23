// core/systems.js — creates every game system for a new game and wires them together:
// the starting kit (take-along items by the count mode §21.1), day-1 guarantees for the 0-item mode, the player,
// weather, fires, wildlife, crafting, building, field guide, events, companion, HUD, gestures, save,
// and `game.actions` (the verbs the menus call: eat / drink / equip / wear / drop / use / sleep …).
import * as THREE from 'three';
import { Weather } from '../sim/weather.js';
import { PlayerState } from '../sim/player.js';
import { Fires } from '../sim/fires.js';
import { Fauna } from '../world/fauna.js';
import { Combat } from '../player/combat.js';
import { Interact, cookStageName } from '../player/interact.js';
import { ViewModel } from '../player/viewmodel.js';
import { Placement } from '../world/placement.js';
import { RainFX } from '../world/rainfx.js';
import { FishingMemory } from '../sim/fishing.js';
import { DIFFICULTY } from '../data/conditions.js';
import { itemDef } from '../data/items.js';
import { WATERS, TREATMENTS } from '../data/water.js';
import { riskBand, RISK_LABEL, eatRisk, freshStage } from '../sim/body.js';
import { saveGame, loadGame, getApiKey } from './save.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const optional = async (path) => { try { return await import(path); } catch (e) { console.warn('optional module missing', path, e.message); window.ISLE?.errors?.push?.(`module ${path}: ${e.message}`); return null; } };

export async function installSystems(game, setup) {
  game.sys = {}; game.order = [];
  game.diff = DIFFICULTY[setup.difficulty] || DIFFICULTY.normal;
  game.stats = { startCount: setup.count, difficulty: setup.difficulty };
  game.goals = [];
  const w = game.world;
  w.scene.add(game.renderer.camera);

  // ---------------- core systems (order = update order)
  const weather = new Weather(game.rng, { startSeason: setup.season === 'wet' ? 'wet' : 'dry' });
  game.add('weather', weather);
  const player = new PlayerState(game);
  game.add('player', player);
  game.sys.player = player;
  const sfxMod = await optional('../audio/sfx.js');
  if (sfxMod?.Sfx) { const sfx = new sfxMod.Sfx(game.audio); game.sys.sfx = sfx; }
  game.add('fires', new Fires(game));
  game.add('fishing', new FishingMemory());
  game.add('fauna', new Fauna(game));
  game.add('combat', new Combat(game));
  const lm = await optional('../world/landmarks.js');
  if (lm?.Landmarks) game.add('landmarks', new lm.Landmarks(game));
  game.placement = new Placement(game);
  game.viewmodel = new ViewModel(game.renderer.camera);
  game.rain = new RainFX(w.scene, game.renderer.q.flora === 'low' ? 1500 : 3500);
  game.spawnDrop = (id, n, x, z, extra) => game.sys.combat.spawnDrop(id, n, x, z, extra);

  // knowledge (field guide)
  const kn = await optional('../sim/knowledge.js');
  if (kn?.Knowledge) {
    const k = new kn.Knowledge(game);
    game.add('knowledge', k);
    const base = k.nameOf.bind(k);
    k.nameOf = (itemId) => { const d = itemDef(itemId); const gid = d?.guide || itemId; const n = base(gid); return !n || n === gid ? d?.name || itemId : n; };
  }
  // crafting
  const cr = await optional('../sim/crafting.js');
  if (cr?.Crafting) {
    const items = await import('../data/items.js');
    const c = new cr.Crafting({ itemDef: items.itemDef, attrsOf: items.attrsOf, inventory: player.inv, rng: game.rng, getContext: () => craftContext(game) });
    game.add('crafting', c);
    // crafting takes game time and is news for the rest of the game (goals, stats, the companion)
    const craft = c.craft.bind(c);
    const after = (r) => {
      if (!r) return r;
      if (r.ok) {
        game.bus.emit('craft:done', { stack: r.stack, recipe: r.recipe, first: !!r.first, kind: r.kind });
        game.sys.sfx?.play(r.first ? 'craft_new' : 'craft_ok');
        game.passTime(Math.max(1, r.minutes || r.recipe?.minutes || 5), { heavy: false });
      } else game.sys.sfx?.play('craft_fail');
      player.validate();
      return r;
    };
    c.craft = (method, uids, o = {}) => { const r = craft(method, uids, { score: 0.55, ...o }); return r && typeof r.then === 'function' ? r.then(after) : after(r); };
  }
  // building
  const bd = await optional('../sim/building.js');
  if (bd?.Building) { game.add('building', new bd.Building(game)); buildingAdapter(game); }
  // events, rescue, endings
  const ev = await optional('../sim/events.js');
  if (ev?.Events) game.add('events', new ev.Events(game));
  // interaction last among the sims (uses everything above)
  game.add('interact', new Interact(game));

  // companion
  if (setup.companion && setup.companion !== 'none') {
    const cm = await optional('../companion/companion.js');
    if (cm?.Companion) { const comp = new cm.Companion(game, setup.companion); game.add('companion', comp); await comp.load?.(); }
  }
  // HUD
  const hudMod = await optional('../ui/hud.js');
  if (hudMod?.Hud) game.hud = new hudMod.Hud(game);

  // journal
  game.sys.journal = { days: [] };
  game.bus.on('log', (e) => addJournal(game, e.text, e.kind));

  // ---------------- starting kit
  if (!setup.restoring) { giveStartingKit(game, setup); dayOneGuarantees(game, setup); }
  firstGoals(game, setup);

  // ---------------- game-level helpers
  game.actions = makeActions(game);
  game.passTime = (minutes, o = {}) => passTime(game, minutes, o);
  game.end = (info) => endGame(game, info);
  game.save = () => saveGame(serializeGame(game));
  game.hasSave = () => !!loadGame();
  game.rec = (k) => { game.stats[k] = (game.stats[k] || 0) + 1; };
  setupEvents(game);
  setupHands(game, setup);
  uiAdapters(game, setup);
  game.bus.emit('log', { text: '浜で 目を 覚ました。持ってきた 物を 確かめよう', kind: 'info' });
  return game;
}

/** E on a building site: deliver materials, build, repair, pack the tent, take rain water, sleep (§12.1) */
function buildingAdapter(game) {
  const B = game.sys.building;
  const P = () => game.sys.player;
  B.optionsFor = (site) => {
    if (!site) return [];
    const ops = [];
    const name = site.def?.name || '建物';
    if (site.stage === 'frame') {
      const miss = B.missing?.(site) || [];
      if (miss.length) ops.push({ id: 'deliver', label: `${name}に 材料を 納める`, sub: miss.map((m) => m.text || `${m.label} ×${m.n}`).join('・') });
      if (B.isReady?.(site)) ops.push({ id: 'work', label: `${name}を 建てる` });
      ops.push({ id: 'cancel', label: `${name}の 骨組みを 片づける` });
    } else if (site.stage === 'ruin') {
      ops.push({ id: 'repair', label: `${name}を 直す（材料を 1 つ 足す）` });
    } else {
      if (site.id === 'tent') ops.push({ id: 'pack', label: 'テントを たたむ（5 分）' });
      if ((site.water ?? 0) >= 0.25) ops.push({ id: 'water', label: `ためた 雨水を くむ（${site.water.toFixed(1)} L）` });
      if (B.bedAt?.(site.x, site.z)) ops.push({ id: 'sleep', label: 'ここで 寝る' });
      if (site.hp !== undefined && site.def?.hp && site.hp < site.def.hp * 0.8) ops.push({ id: 'repair', label: `${name}を 直す` });
      if (game.sys.weather.type !== 'storm') ops.push({ id: 'reinforce', label: `${name}を 補強する（嵐に そなえる）` });
    }
    return ops;
  };
  B.act = (node, opt, interact) => {
    const site = node.site || node.data?.site;
    if (!site) return;
    const inv = P().inv;
    if (opt.id === 'deliver') {
      const r = B.deliver(site, inv.stacks.map((s) => s.uid));
      P().validate();
      const n = (r.delivered || []).length;
      game.bus.emit('toast', { text: n ? `材料を 納めた（${n}）` : '合う 材料を 持っていない', kind: n ? 'info' : 'warn' });
      return;
    }
    if (opt.id === 'work') {
      const helpers = { axe: !!inv.find('axe'), hammer: !!inv.stacks.find((s) => /hammer/.test(s.id)), companion: game.sys.companion?.helping?.(site) ? (game.setup.companion === 'gen' ? 'gen' : true) : false };
      const total = Math.max(1, (site.def.minutes || 10) - (site.workDone || 0));
      interact.startActivity({ kind: 'hit', title: `${site.def.name}を 建てる`, params: { hits: Math.min(10, Math.max(2, Math.round(total / 15))), interval: 0.5, anyStroke: true } }, () => {
        const r = B.work(site, total, helpers);
        game.passTime(r?.minutes ?? total, { heavy: true });
        P().body.s.stamina = Math.max(0, P().body.s.stamina - (r?.stamina ?? 10));
      });
      interact.activity && (interact.activity.sound = 'hammer');
      return;
    }
    if (opt.id === 'cancel') { B.removeSite?.(site, { refund: true }); return; }
    if (opt.id === 'repair') { const st = inv.stacks.find((s) => B.repair?.(site, s.uid, { dry: true })); if (st) { B.repair(site, st.uid); P().validate(); game.passTime(10); } else game.bus.emit('toast', { text: '直す 材料が ない', kind: 'warn' }); return; }
    if (opt.id === 'reinforce') { const r = B.reinforce?.(site); if (r !== false) game.passTime(20); return; }
    if (opt.id === 'pack') { B.pack?.(site); game.passTime(5); return; }
    if (opt.id === 'water') {
      const held = P().heldStack();
      if (!held || !(itemDef(held.id)?.container || held.stats?.liters)) { game.bus.emit('toast', { text: '容器を 手に 持って くむ', kind: 'warn' }); return; }
      const lit = Math.min(site.water, held.stats?.liters ?? itemDef(held.id)?.container?.liters ?? 0.5);
      B.takeWater?.(site, lit);
      held.water = { src: 'rain_fresh', cups: Math.max(1, Math.round(lit / 0.25)), treat: 'none' };
      game.bus.emit('toast', { text: `雨水を くんだ（${held.water.cups} 杯）`, kind: 'good' });
      return;
    }
    if (opt.id === 'sleep') { game.screens?.show('sleep'); }
  };
}

/** small shape adapters between the systems and the UI screens (js/ui/*) */
function uiAdapters(game, setup) {
  const B = game.sys.building;
  if (B?.defs && !B._uiWrapped) {
    const orig = B.defs.bind(B);
    B.defs = () => orig().map((d) => ({ ...d, effect: d.effect ?? d.effectText, materials: d.materials ?? d.slotsText, locked: d.available === false }));
    B._uiWrapped = true;
  }
  const P = game.sys.player;
  P.setHotbar = (i, uid) => { P.hotbar = P.hotbar.map((u) => (u === uid ? null : u)); P.hotbar[i] = uid; };
  game.sys.journal.stats = () => ({ '歩いた 距離': `${Math.round(P.stats.distance)} m`, '作った 物': P.stats.crafted, '釣った 魚': P.stats.fishCaught, 'しとめた 動物': P.stats.animalsHunted, '火を おこした': P.stats.firesLit, '病気・ケガ': P.stats.illnesses, '飲んだ 水': `${P.stats.waterCups} 杯` });
  game.stopGestures = () => { game.hands?.stop(); document.getElementById('cam-preview')?.classList.add('hidden'); };
  if (setup.apiKey) game.apiKey = setup.apiKey;
  game.applySettings = (st) => {
    if (st.sens) game.input.sensitivity = st.sens;
    if (st.quality && st.quality !== game.renderer.qname) game.renderer.setQuality(st.quality);
    if (st.camPreview !== undefined) document.getElementById('cam-preview')?.classList.toggle('hidden', !st.camPreview || !game.hands?.ready);
    game.reduceShake = !!st.reduceShake;
  };
}

/** turn an object with methods into a system record without losing `this` */
function wrap(o) { return { init: o.init?.bind(o), serialize: o.serialize?.bind(o), deserialize: o.deserialize?.bind(o), debug: o.debug?.bind(o) }; }

function craftContext(game) {
  const P = game.sys.player;
  const near = game.sys.building?.sites?.some?.((s) => s.def?.id === 'workbench' && s.stage === 'done' && Math.hypot(s.x - game.player.pos.x, s.z - game.player.pos.z) < 4);
  return {
    day: game.clock.day, held: P.heldStack(), nearWorkbench: !!near, hasGuide: !!P.inv.find('guide'), morale: P.body.s.morale,
    night: game.world.env?.night > 0.6, lit: !!(P.nearFire !== null && P.nearFire < 6) || !!P.torchLit, handInjured: !!P.body.has('cut') || !!P.body.has('burn'),
    skillCraft: 0, difficulty: game.setup.difficulty, knowledge: game.sys.knowledge, nearFire: P.nearFire !== null && P.nearFire < 3,
  };
}

// ---------------------------------------------------------------- starting kit (§3, §21)
function giveStartingKit(game, setup) {
  const inv = game.sys.player.inv;
  inv.add('clothes_base', 1, { q: 70 });
  inv.add('watch', 1); inv.add('diary', 1);
  const list = setup.count === 'all' ? ['knife', 'axe', 'bow', 'rifle', 'rod', 'net', 'firesteel', 'pot', 'rope', 'bottle', 'tent', 'sleeping_bag', 'goggles', 'medkit', 'guide'] : (setup.starters || []).slice(0, setup.count || 0);
  for (const id of list) {
    const d = itemDef(id);
    if (!d) continue;
    inv.add(id, 1, { q: 95 });
    for (const [kid, n] of Object.entries(d.kit || {})) {
      if (kid === 'ammo') { if (setup.ammo !== 'inf') inv.add('ammo', setup.ammo === 30 || setup.ammo === '30' ? 30 : 12, { q: 95 }); else inv.add('ammo', 1, { q: 95, name: '弾（無限）' }); }
      else inv.add(kid, n, { q: 95 });
    }
    if (id === 'guide') game.sys.knowledge?.grantStarterGuide?.();
  }
  // hotbar: the take-along items first
  const P = game.sys.player;
  const tools = inv.stacks.filter((s) => itemDef(s.id)?.tool && !['watch', 'diary'].includes(s.id));
  tools.slice(0, 6).forEach((s, i) => { P.hotbar[i] = s.uid; });
  if (tools[0]) P.equip(tools[0].uid);
  const bag = inv.find('sleeping_bag');
  if (bag) P.wear.bed = bag.uid;
}

// ---------------------------------------------------------------- day-1 guarantees (§21.1)
function dayOneGuarantees(game, setup) {
  const t = game.world.terrain, L = game.world.layout;
  const s = t.shorePoint(Math.atan2(L.start.z, L.start.x), 1.5);
  const ang = Math.atan2(L.start.z, L.start.x);
  // chert ×2 + a round stone at the east end of the start beach
  for (let i = 0; i < 3; i++) {
    const a = ang + 0.05 + i * 0.012;
    const p = t.shorePoint(a, 1.6) || s;
    game.spawnDrop(i < 2 ? 'flint' : 'stone', 1, p.x - Math.cos(a) * 2, p.z - Math.sin(a) * 2, { q: 55 });
  }
  // 3 fallen coconuts under the nearest palms
  const palms = [...game.world.nodes.all.values()].filter((n) => n.kind === 'palm').sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z)).slice(0, 3);
  for (const p of palms) game.spawnDrop('coconut', 1, p.x + 1.2, p.z + 0.8, { q: 55, stage: 'brown', fresh: 80 });
  // a few branches and twigs nearby so a fire is possible on day 1
  for (let i = 0; i < 4; i++) game.spawnDrop(i % 2 ? 'branch' : 'twig', i % 2 ? 1 : 3, s.x - Math.cos(ang) * (6 + i * 2) + i, s.z - Math.sin(ang) * (6 + i * 2) - i, { q: 50 });
}

function firstGoals(game, setup) {
  const zero = (setup.count || 0) === 0;
  game.goals = zero
    ? [{ id: 'flake', text: '石を 打ち欠いて 石刃を 作る（C で 錬成：割る）', done: false }, { id: 'cord', text: 'つるで 縄を なう', done: false }, { id: 'kit', text: '槍 か 弓ぎりセットを 作る', done: false }, { id: 'fire', text: '火を おこす', done: false }, { id: 'roof', text: '屋根（差しかけ小屋）を 作る', done: false }]
    : [{ id: 'water', text: '水を 確保する（ヤシの実・川）', done: false }, { id: 'fire', text: 'たき火を 組んで 火を おこす（B で 建築）', done: false }, { id: 'food', text: '食べ物を 手に 入れて 焼いて 食べる', done: false }, { id: 'roof', text: '日が 暮れる 前に 屋根の 下で 寝る', done: false }];
  const mark = (id) => { const g = game.goals.find((x) => x.id === id && !x.done); if (g) { g.done = true; game.bus.emit('toast', { text: `目標 達成：${g.text}`, kind: 'good' }); } };
  game.bus.on('fire:lit', () => mark('fire'));
  game.bus.on('drink', (e) => { if (e.isPlayer) mark('water'); });
  game.bus.on('eat', (e) => { if (e.isPlayer) mark('food'); });
  game.bus.on('craft:done', (e) => { const id = e.recipe?.id || e.stack?.id; if (id === 'flake') mark('flake'); if (id === 'cord') mark('cord'); if (/spear|bow_drill_kit|hand_drill_kit/.test(id || '')) mark('kit'); });
  game.bus.on('build:done', (e) => { if (/lean_to|a_frame|tent|bamboo_hut|log_cabin/.test(e.id || '')) mark('roof'); });
  game.bus.on('sleep:start', () => { if ((game.sys.player.shelter?.rain ?? 0) >= 0.5) mark('roof'); });
}

// ---------------------------------------------------------------- time passing (actions that take game time, sleep)
function passTime(game, minutes, { heavy = false, sleeping = false } = {}) {
  if (minutes <= 0) return;
  const P = game.sys.player;
  let left = minutes;
  const wasSleeping = P.sleeping;
  P.sleeping = sleeping || wasSleeping;
  while (left > 0) {
    const gm = Math.min(5, left);
    left -= gm;
    game.clock.total += gm;
    if (heavy) P.heavyT = 1;
    game.sys.weather.update(0, gm, game.clock);
    P.update(0, gm);
    game.sys.fires.update(0, gm);
    game.sys.companion?.passTime?.(gm);
    if (P.body.deathCause) break;
  }
  P.sleeping = wasSleeping;
  game.sys.interact?.regrow();
}

// ---------------------------------------------------------------- the verbs the UI calls
function makeActions(game) {
  const P = () => game.sys.player;
  const toast = (text, kind = 'info') => game.bus.emit('toast', { text, kind });
  const actions = {
    /** what eating this would do (the confirmation card, §7.4 + §20.3) */
    eatCard(uid) {
      const s = P().inv.get(uid);
      const d = s && itemDef(s.id, s);
      if (!d?.food && !s?.stew) return null;
      const f = foodOf(s, d);
      const risk = eatRisk(f, { hygiene: P().body.s.hygiene, D: game.diff.illness });
      const k = game.sys.knowledge, lv = k ? Math.max(k.level(d.guide || s.id), 0) : 3;
      const showMode = P().inv.find('guide') ? 'percent' : game.diff.showRisk === 'percent' ? 'percent' : game.diff.showRisk === 'none' ? 'none' : 'band';
      let shown = lv <= 1 && d.guide && k?.level ? 'unknown' : showMode;
      const warnings = [];
      if (lv >= 3 && d.food.poison && !d.food.poison.heatKills) warnings.push('毒が ある！');
      if (lv >= 2 && d.food.mustCook && (s.done || 0) < 65) warnings.push('よく 加熱した ほうが よさそう');
      if (freshStage(s.fresh ?? 100) >= 2) warnings.push(freshStage(s.fresh) === 3 ? '腐っている（ハエが たかる）' : 'においが 気になる');
      if ((s.done || 0) < 30 && d.food.rawPenalty) warnings.push('生のまま');
      if (s.mix?.p > 0 && lv <= 1) warnings.push('似た 物が 混ざって いるかも');
      const fMul = [1.0, 1.1, 1.25, 0.7, 0][Math.min(4, Math.floor(((s.done || 0) < 30 ? 0 : (s.done || 0) < 65 ? 1 : (s.done || 0) <= 100 ? 2 : (s.done || 0) <= 130 ? 3 : 4)))] * (freshStage(s.fresh ?? 100) === 3 ? 0.5 : 1);
      return { name: k?.nameOf?.(s.id) || d.name, foodGain: Math.round((f.food || 0) * fMul), waterGain: Math.round(f.water || 0), cook: cookStageName(s.done || 0), fresh: s.fresh,
        risk: { p: risk.p, band: riskBand(risk.p), label: RISK_LABEL[riskBand(risk.p)], shown }, warnings };
    },
    eat(uid, { nibble = false } = {}) {
      const p = P(), s = p.inv.get(uid);
      const d = s && itemDef(s.id, s);
      if (!s || !(d?.food || s.stew)) return false;
      let f = foodOf(s, d);
      // a toxic look-alike mixed into an unsorted bundle (§20.3)
      if (s.mix?.p > 0 && game.rng.next() < s.mix.p) { const td = itemDef(s.mix.toxic); f = foodOf({ ...s, id: s.mix.toxic }, td); }
      if (nibble) { f = { ...f, food: f.food * 0.2, water: f.water * 0.2 }; }
      const r = p.body.eat(f, { nibble, day: game.clock.day });
      if (r.refused) { toast(r.refused, 'warn'); return false; }
      p.inv.take(uid, 1);
      p.validate();
      game.sys.sfx?.play('eat');
      game.viewmodel?.play('eat');
      if ((s.done || 0) >= 65 || s.stew) p.stats.mealsCooked++; else p.stats.mealsRaw++;
      game.stats.lastMeal = { name: d.name, raw: (s.done || 0) < 30, p: r.p };
      const fd = new Set(game.stats.foodTypes || []); fd.add(s.id); game.stats.foodTypes = [...fd];
      // knowledge: eating reveals the truth after a while (§20.2 K3)
      if (d.guide) setTimeout(() => game.sys.knowledge?.learn?.(d.guide, 3, nibble ? 'nibbled' : 'eaten'), 1500);
      if (d.food.moraleBonus) p.body.addMorale(d.food.moraleBonus, 'treat');
      if (d.med && d.med.use === 'eat') this.treatWith(d.med);
      game.passTime(nibble ? 1 : 3);
      return true;
    },
    drink(uid) {
      const p = P(), s = uid ? p.inv.get(uid) : null;
      if (!s) return false;
      const d = itemDef(s.id, s);
      if (s.id === 'coconut' || s.id === 'coconut_open') {
        const st = d.food?.stage?.[s.stage || 'brown'];
        p.body.drink({ name: 'ヤシの 水', water: st?.water ?? 20, W: 0.005, coconut: true }, { day: game.clock.day });
        p.inv.take(s.uid, 1); p.inv.add('coconut_shell', 2); p.inv.add('coconut_meat', 1, { fresh: 100 });
        p.validate(); game.sys.sfx?.play('drink'); p.stats.waterCups++; return true;
      }
      if (!s.water?.cups) { toast('中に 水が ない', 'warn'); return false; }
      const W = WATERS[s.water.src] || WATERS.river_low;
      const treat = s.water.treat === 'filter' ? TREATMENTS.filter(s.stats?.filterQ ?? 50) : TREATMENTS[s.water.treat] ?? 1;
      p.body.drink({ name: W.name, water: W.water, W: W.W, salty: !!W.salty, parasite: s.water.treat === 'none' ? W.parasite : 0, treat, warm: s.water.warm }, { day: game.clock.day });
      s.water.cups--; if (s.water.cups <= 0) delete s.water;
      p.stats.waterCups++;
      game.sys.sfx?.play('drink'); game.viewmodel?.play('drink');
      return true;
    },
    equip(uid) { const ok = P().equip(P().held === uid ? null : uid); return ok; },
    wear(uid) { return P().wearStack(uid); },
    drop(uid, n = 1) {
      const p = P(), s = p.inv.get(uid);
      if (!s) return false;
      const part = p.inv.take(uid, n)[0];
      const pos = game.player.pos, f = game.player.forward;
      game.spawnDrop(part.id, part.n, pos.x + f.x * 1.2, pos.z + f.z * 1.2, { ...part, uid: undefined });
      p.validate();
      return true;
    },
    hotbar(slot, uid) { P().hotbar[slot] = uid; },
    use(uid) {
      const s = P().inv.get(uid), d = s && itemDef(s.id, s);
      if (!d) return false;
      if (s.id === 'tent' || d.tool?.kind === 'tent') { game.screens?.hide?.(); game.sys.building?.startPlacing?.('tent', { fromItem: uid }); return true; }
      if (d.med) return this.treatWith(d.med, s);
      if (d.food || s.stew) return this.eat(uid);
      if (s.water?.cups || s.id === 'coconut') return this.drink(uid);
      return this.equip(uid);
    },
    treatWith(med, stack) {
      const b = P().body;
      const map = { burn: 'aloe', bleed: 'herb_stop_bleed', infection: 'poultice', cold: 'ginger', diarrhea: 'guava', poison: 'charcoal', insect: 'aloe', fever: 'fever', venom: 'suction', wound: 'bandage', antibiotic: 'antibiotic', stomach: 'charcoal' };
      const kind = map[med.type] || med.type;
      const ok = b.treat(kind, med.power ?? 1);
      if (stack && !med.reusable) { P().inv.take(stack.uid, 1); P().validate(); }
      toast(ok ? '手当てを した' : 'いまは 効く ところが ない', ok ? 'good' : 'info');
      return ok;
    },
    treat(uid) { const s = P().inv.get(uid); const d = s && itemDef(s.id, s); return d?.med ? this.treatWith(d.med, s) : false; },
    inspect(uid) {
      const s = P().inv.get(uid), d = s && itemDef(s.id, s);
      if (!d) return null;
      const light = game.world.env?.night > 0.6 && !P().torchLit ? 0.4 : 1;
      if (light < 0.5) { toast('暗くて よく 見えない', 'warn'); return null; }
      game.passTime(5);
      const r = game.sys.knowledge?.observe?.(d.guide || s.id, light);
      if (r) game.sys.knowledge.learn(d.guide || s.id, 2, 'observed');
      // sorting a mixed bundle once the plant is known (§20.2 K2)
      if (s.mix && (game.sys.knowledge?.level(d.guide || s.id) ?? 0) >= 2) {
        const bad = s.mix.p >= 1 ? s.n : Math.round(s.n * s.mix.p);
        const tox = s.mix.toxic; delete s.mix;
        if (bad > 0) { P().inv.take(s.uid, bad); P().inv.add(tox, bad, { q: s.q }); toast(`${bad} 個 ${itemDef(tox).name}が 混ざっていた！ 仕分けた`, 'warn'); }
      }
      return r;
    },
    giveToCompanion(uid, n = 1) { return game.sys.companion?.receive?.(uid, n) ?? false; },
    sleepCheck() {
      const p = P(), reasons = [];
      if (p.body.s.rest >= 85) reasons.push('まだ 眠くない');
      if (p.body.s.bodyTemp < 34.5) reasons.push('寒くて 眠れない');
      if (game.sys.weather.type === 'storm' && (p.shelter?.rain ?? 0) < 0.5) reasons.push('嵐で 屋根が ない');
      if (game.sys.fauna?.animals?.some((a) => a.alive && a.sp.charger && a.pos.distanceTo(game.player.pos) < 20)) reasons.push('近くに 動物が いる');
      return { ok: reasons.length === 0, reasons };
    },
    sleep(arg = 'morning') {
      game.screens?.hide?.();
      if (arg && typeof arg === 'object') arg = arg.hours ? Number(arg.hours) : 'morning';
      startSleep(game, arg);
    },
    fillContainer(uid) { const t = game.sys.interact.target; if (t?.type === 'water') { const prev = P().held; P().equip(uid); game.sys.interact.run(t, { id: 'fill' }); P().equip(prev); return true; } toast('水辺で くむ', 'info'); return false; },
    addToPot(potUid, uid) {
      const pot = P().inv.get(potUid), s = P().inv.get(uid);
      if (!pot || !s) return false;
      const one = P().inv.take(uid, 1)[0];
      pot.contents = [...(pot.contents || []), one];
      return true;
    },
    retire() { game.sys.events?.retire?.(); },
  };
  return actions;
}

/** the food numbers of a stack (stage of coconuts / bananas, stew) */
function foodOf(s, d) {
  if (s.stew) return { name: s.stew.name, food: s.stew.food / s.stew.portions, water: s.stew.water / s.stew.portions, B: s.stew.B, parasite: 0, fresh: s.fresh ?? s.stew.fresh, done: 100, stew: true, kinds: s.stew.kinds, poison: s.stew.poison };
  const f = d.food;
  const st = s.stage && f.stage?.[s.stage];
  return {
    name: d.name, food: st?.food ?? f.food, water: st?.water ?? f.water, B: f.B, parasite: f.parasite, fresh: s.fresh ?? 100, done: s.done || 0, proc: s.proc,
    poison: f.poison ? { ...f.poison, cookable: !!f.poison.heatKills } : null, rawPenalty: f.rawPenalty,
  };
}

// ---------------------------------------------------------------- sleeping (§4.6)
function startSleep(game, until) {
  const P = game.sys.player;
  const chk = game.actions.sleepCheck();
  if (!chk.ok && !(P.body.s.rest <= 0)) { game.bus.emit('toast', { text: chk.reasons.join('・'), kind: 'warn' }); return; }
  const hour = game.clock.hour;
  const hours = until === 'morning' ? ((6 - hour + 24) % 24 || 8) : Number(until) || 8;
  // sleep quality = bed × roof × temperature × insects × morale × fire (§4.6)
  const sh = P.shelter || {};
  let bed = game.sys.building?.bedAt?.(game.player.pos.x, game.player.pos.z) ?? (P.zone === 'beach' ? 0.65 : 0.55);
  if (P.inv.find('sleeping_bag')) bed = Math.max(bed, 0.9);
  let q = bed;
  if (game.sys.weather.rain > 0.2 && (sh.rain ?? 0) < 0.5) q *= 0.5;
  if (P.body.feel < 16 && !P.inv.find('sleeping_bag')) q *= 0.7;
  if ((P.zone === 'jungle' || P.zone === 'stream') && !sh.bugproof) q *= 0.8;
  if (P.body.s.morale < 10) q *= 0.7;
  if (P.nearFire !== null && P.nearFire < 6) q *= 1.1;
  P.sleepQuality = clamp(q, 0.3, 1.4);
  P.sleeping = true;
  P.sleepUntil = game.clock.total + hours * 60;
  game.clock.scale = 30;
  game.player.frozen = true;
  game.bus.emit('sleep:start', { hours });
  game.sys.sfx?.play('sleep_in');
  document.getElementById('fade')?.classList.add('sleep');
  if (game.sys.weather.rain > 0.2 && (sh.rain ?? 0) >= 0.9) P.body.addMorale(P.inv.find('tent') ? 2 : 0, 'rain_sound');
  game.save?.();
}

export function updateSleep(game) {
  const P = game.sys.player;
  if (!P?.sleeping) return;
  let wake = null;
  if (game.clock.total >= P.sleepUntil) wake = 'よく 眠った';
  else if (P.body.s.rest >= 100) wake = '目が さめた';
  else if (P.body.s.water < 10) wake = 'のどが かわいて 目が さめた';
  else if (P.body.feel < 12 && !P.inv.find('sleeping_bag')) wake = '寒くて 目が さめた';
  else if (game.sys.fauna?.animals?.some((a) => a.alive && a.state === 'charge')) wake = '物音で 飛び起きた！';
  if (wake) {
    P.sleeping = false; P.sleepUntil = null;
    game.clock.scale = 1;
    game.player.frozen = false;
    document.getElementById('fade')?.classList.remove('sleep');
    game.sys.sfx?.play('wake');
    game.bus.emit('toast', { text: wake, kind: 'info' });
    game.bus.emit('sleep:end', {});
    if ((P.shelter?.rain ?? 0) >= 0.5 || (P.nearFire !== null && P.nearFire < 6)) { P.stats.nightsSheltered++; game.sys.companion?.nightTogether?.(); }
  }
}

// ---------------------------------------------------------------- events between systems
function setupEvents(game) {
  const bus = game.bus, P = game.sys.player;
  let lastHour = Math.floor(game.clock.total / 60), lastDay = game.clock.day;
  game.onTick = () => {
    const h = Math.floor(game.clock.total / 60);
    if (h !== lastHour) {
      lastHour = h;
      bus.emit('hour', { day: game.clock.day, hour: game.clock.hour });
      game.sys.interact?.regrow();
      game.sys.fauna?.washBlood?.();
      if (h % 1 === 0 && !P.sleeping) game.save?.();
    }
    if (game.clock.day !== lastDay) {
      lastDay = game.clock.day;
      bus.emit('day', { day: game.clock.day });
      bus.emit('log', { text: `${game.clock.day}日目の 朝`, kind: 'day' });
      game.sys.fauna?.onNewDay?.();
      game.sys.fishing?.onNewDay?.();
      game.sys.sfx?.play('day_start');
    }
    // death
    if (P.body.deathCause && !game.ended) game.end({ result: 'dead', cause: P.body.deathCause });
    if (P.body.zeroMoraleH >= 12 && !game.ended && !game.sys.events) game.end({ result: 'broken' });
    // forced sleep at rest 0 (§4.5)
    if (P.body.s.rest <= 0 && !P.sleeping) { game.bus.emit('toast', { text: '限界…その場で 眠りこんだ', kind: 'bad' }); P.body.s.rest = 0.1; startSleep(game, 4); }
    updateSleep(game);
  };
  bus.on('animal:attack', (a) => {
    const b = P.body;
    b.injure(a.how === 'charge' ? (a.fracture ? 'bruise' : 'bruise') : 'bite', a.damage > 25 ? 2 : 1, a.damage, a.name);
    if (a.bite && game.rng.next() < a.bite) b.addCondition('bite', 1, a.name, { incubation: 0 });
    if (a.venom) b.addCondition('snake_venom', game.rng.next() < 0.6 ? 1 : 2, a.name);
    game.sys.sfx?.play('hurt');
    bus.emit('toast', { text: `${a.name}に ${a.how === 'charge' ? '突き飛ばされた' : '咬まれた'}！`, kind: 'bad' });
  });
  bus.on('animal:killed', (e) => { if (e.how !== 'bleed' || true) { P.stats.animalsHunted++; game.stats.huntedBig = game.stats.huntedBig || {}; game.stats.huntedBig[e.kind] = (game.stats.huntedBig[e.kind] || 0) + 1; } if (['goat', 'boar'].includes(e.kind)) P.body.addMorale(6, 'big_game'); bus.emit('log', { text: `${e.name}を しとめた`, kind: 'good' }); });
  bus.on('hit', (e) => { if (!e.killed && e.part) bus.emit('toast', { text: { head: '頭に 命中', heart: '心臓・肺に 命中！ 5 分 待ってから 追おう', liver: '肝臓に 命中。30 分 待とう', belly: '腹に 当たった… 血痕を たどろう', muscle: '肩・ももに 当たった', leg: '脚に 当たった', body: '命中' }[e.part] || '命中', kind: 'info' }); game.stats.maxArrowDist = Math.max(game.stats.maxArrowDist || 0, e.dist || 0); });
  bus.on('craft:done', (e) => { P.stats.crafted++; P.stats.bestQ = Math.max(P.stats.bestQ, e.stack?.q || 0); if (e.first) P.body.addMorale(3, 'new_design'); bus.emit('log', { text: `${e.stack?.name || itemDef(e.stack?.id)?.name || '物'}を 作った`, kind: 'craft' }); });
  bus.on('build:done', (e) => { P.stats.built++; P.body.addMorale(e.morale ?? 6, 'built'); bus.emit('log', { text: `${e.name || e.id}が 完成した`, kind: 'good' }); });
  bus.on('weather', (e) => { if (['rain', 'storm', 'typhoon'].includes(e.type)) bus.emit('log', { text: `${e.name}に なった`, kind: 'weather' }); });
  bus.on('thunder', (e) => game.sys.sfx?.play('thunder', { distance: e.distance }));
  bus.on('vomit', (e) => { if (e.isPlayer) game.sys.sfx?.play('vomit'); });
  game.sys.weather.onChange = (type) => bus.emit('weather', { type, name: game.sys.weather.W(type).name });
}

// ---------------------------------------------------------------- hand gestures
function setupHands(game, setup) {
  game.startGestures = async () => {
    const { HandTracker } = await import('../gesture/hands.js');
    game.hands = game.hands || new HandTracker();
    await game.hands.start((st, err) => { if (st === 'error') game.bus.emit('toast', { text: `カメラ：${err}`, kind: 'bad' }); if (st === 'ready') game.bus.emit('toast', { text: '手の 認識を 開始した', kind: 'good' }); });
    const cv = document.getElementById('cam-preview');
    cv?.classList.toggle('hidden', !game.hands.ready);
    return game.hands.ready;
  };
  if (setup.control === 'gesture') game.startGestures();
}

function addJournal(game, text, kind) {
  const J = game.sys.journal, day = game.clock.day;
  let d = J.days[J.days.length - 1];
  if (!d || d.day !== day) { d = { day, lines: [] }; J.days.push(d); }
  d.lines.push({ hour: Math.floor(game.clock.hour), text, kind });
}

// ---------------------------------------------------------------- end & save
function endGame(game, info) {
  if (game.ended) return;
  game.ended = true;
  const P = game.sys.player;
  const st = { ...P.stats, ...game.stats, result: info.result, daysSurvived: game.clock.day - 1 + game.clock.hour / 24, hp: P.body.s.hp, food: P.body.s.food, water: P.body.s.water, morale: P.body.s.morale, guideK3: game.sys.knowledge?.entries?.().filter((e) => e.level >= 3).length || 0 };
  Promise.all([import('../sim/score.js'), import('../data/achievements.js').catch(() => null)]).then(([S, A]) => {
    const score = S.computeScore ? S.computeScore(st, game.setup, game.diff) : { total: 0, rank: '-', parts: [] };
    const review = info.result === 'dead' && S.deathReview ? S.deathReview(info.cause, st) : [];
    const ach = A?.newlyUnlocked ? A.newlyUnlocked(st, game, []) : [];
    const type = info.result === 'dead' ? 'died' : ['rescued', 'raft', 'drift', 'stay'].includes(info.result) ? 'rescued' : 'retired';
    const head = { rescued: info.how === 'promised' ? '迎えの 船が 来た！' : '救助された！', raft: 'いかだで 島を 出た', drift: '漂流の 末に 助かった', stay: '島で 暮らす ことに した', retired: 'リタイアした', broken: '心が 折れた', dead: '力尽きた…' }[info.result] || '終わり';
    const days = Math.floor(st.daysSurvived * 10) / 10;
    game.pause(true);
    game.screens?.show('result', {
      type, result: info.result, headline: head, sub: info.result === 'dead' ? `死因：${S.DEATH_NAMES?.[info.cause] || info.cause}` : `${days} 日間 生きのびた`, days, seed: game.setup.seed,
      review, score, achievements: (ach || []).map((x) => ({ name: x.name, desc: x.desc, icon: x.icon })), stats: st, canRetry: info.result === 'dead' && (game.diff.retries ?? 0) > 0,
      records: [{ label: '釣った 魚', value: P.stats.fishCaught }, { label: 'しとめた 動物', value: P.stats.animalsHunted }, { label: '作った 物', value: P.stats.crafted }, { label: '火を おこした', value: P.stats.firesLit }, { label: '歩いた 距離', value: `${Math.round(P.stats.distance)} m` }],
    });
    S.saveRecord?.({ ...info, score: score.total, rank: score.rank, days: st.daysSurvived, setup: game.setup });
  }).catch((e) => { console.error(e); game.screens?.show('result', { type: 'retired', headline: '終わり', review: [], score: { total: 0, rank: '-', parts: [] }, achievements: [], records: [] }); });
  game.bus.emit('game:end', info);
}

export function serializeGame(game) {
  const out = { v: 1, setup: game.setup, clock: { total: game.clock.total }, player: { x: game.player.pos.x, z: game.player.pos.z, yaw: game.player.yaw }, stats: game.stats, goals: game.goals, sys: {} };
  for (const name of game.order) { try { const s = game.sys[name]; if (s?.serialize) out.sys[name] = s.serialize(); } catch (e) { console.warn('save', name, e); } }
  out.sys.weather = game.sys.weather.serialize();
  return out;
}

export { THREE };
