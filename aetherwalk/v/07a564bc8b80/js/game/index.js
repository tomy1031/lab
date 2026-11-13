// js/game/index.js — createGame(ctx) (§10.10, OPUS-B): vitals, inventory, save, stats, quest, enemies, boss,
// towers, shrines, seeds, pickups, checkpoints and the autoplay bot.
import { createVitals } from './vitals.js';
import { createInventory } from './inventory.js';
import { createSaver } from './save.js';
import { createStats } from './stats.js';
import { createQuest } from './quest.js';
import { createEnemies } from './enemies.js';
import { createBoss } from './boss.js';
import { createPickups } from './pickups.js';
import { createCheckpoints } from './checkpoints.js';
import { createTowers } from './towers.js';
import { createProps } from './props.js';
import { createShrines } from './shrines.js';
import { createSeeds } from './seeds.js';
import { createBot } from './bot.js';
import { ITEM_INFO } from './itemInfo.js';
import { emit, toast, setPropState, propsOf, playerPos, todayKey } from './util.js';
import * as THREE from 'three';

const AUTOSAVE = 30;

export async function createGame(ctx) {
  const G = { checkpoint: 'start', ready: false };
  const autoplay = !!(ctx.flags && ctx.flags.autoplay);
  G.saver = createSaver(ctx);
  if (autoplay) G.saver.enabled = false;      // the demo never touches a real save
  G.inventory = createInventory(ctx, G);
  G.quest = createQuest(ctx, G);
  G.vitals = createVitals(ctx, G);
  G.stats = createStats(ctx, G);
  G.enemies = createEnemies(ctx, G);
  G.boss = createBoss(ctx, G);
  G.pickups = createPickups(ctx, G);
  G.checkpoints = createCheckpoints(ctx, G);
  G.towers = createTowers(ctx, G);
  G.props = createProps(ctx, G);
  G.shrines = createShrines(ctx, G);
  G.seeds = createSeeds(ctx, G);
  G.bot = createBot(ctx, G);
  G.itemInfo = (id) => G.inventory.def(id) || ITEM_INFO[id] || null;

  const _p = new THREE.Vector3();
  let saveT = AUTOSAVE, saveSoon = -1, deathT = 0;
  const deaths = [];          // recent death spots (for the blessing, §5.6)
  let errOnce = new Set();

  // ── food & drink (items emits item:consume; we apply defs.food) ──
  G.eat = function (itemId, how = 'eat') {
    const def = G.itemInfo(itemId);
    const v = G.vitals;
    if (itemId === 'flask' || how === 'drink') {
      v.heal(2);
      emit(ctx, 'player:refresh', { itemId, how });
      return;
    }
    const f = def && def.food;
    if (!f) return;
    const hp = f.hp === 'full' || f.hp >= 99 ? 'full' : (+f.hp || 0);
    if (hp) v.heal(hp);
    const st = f.stamina === 'full' || f.stamina >= 999 || f.stamina === Infinity ? 'full' : (+f.stamina || 0);
    if (st) v.addStamina(st);
    const buff = f.buff;
    if (itemId === 'frostberry' || (buff && String(buff.kind || buff).includes('frost')) || (buff && String(buff).includes('noDrain'))) {
      v.frostT = Math.max(v.frostT, +(f.buffTime || (buff && buff.time) || 60));
      toast(ctx, '霜いちご — 60 秒、追い風が減らない', 'TAILWIND HOLDS', 'item', 2500);
    }
  };
  ctx.events?.on?.('item:consume', (e) => { if (e && e.itemId) G.eat(e.itemId, e.how); });

  // a burstfruit also hurts you a little when you stand in it: at most 4 (§4.1). items already hit the targets.
  const _bp = new THREE.Vector3(), _bd = new THREE.Vector3();
  ctx.events?.on?.('explosion', (e) => {
    const pl = ctx.player;
    if (!e || !e.pos || !pl || !pl.pos || G.vitals.dead) return;
    _bp.copy((pl.body && pl.body.chestPos) || pl.pos);
    const R = e.radius || 4;
    const d = _bp.distanceTo(e.pos);
    if (d >= R) return;
    const dmg = Math.max(1, Math.round(4 * (1 - d / R)));
    _bd.subVectors(_bp, e.pos).setY(0);
    if (_bd.lengthSq() < 1e-6) _bd.set(0, 0, 1);
    G.vitals.damage(dmg, { source: 'world', type: 'blast', dir: _bd.normalize(), enemyId: null, knock: 2.5 });
  });

  // ── falling back to the wind (§5.6): nothing is lost ──
  G.die = function (info) {
    const v = G.vitals;
    if (v.dead) return;
    v.dead = true;
    v.hp = 0;
    playerPos(ctx, _p);
    deaths.push({ x: _p.x, z: _p.z });
    while (deaths.length > 3) deaths.shift();
    emit(ctx, 'player:death', {});
    try { ctx.player && ctx.player.setEnabled && ctx.player.setEnabled(false); } catch (e) { /* ignore */ }
    try { ctx.input && ctx.input.virtual && ctx.input.virtual.setCadence(0); } catch (e) { /* ignore */ }
    deathT = 2.0;
  };
  function respawn() {
    const id = G.checkpoint;
    const sp = G.checkpoints.spawnFor(id);
    try { ctx.player && ctx.player.teleport && ctx.player.teleport(sp.x, sp.z, sp.yaw || 0); } catch (e) { /* ignore */ }
    G.vitals.reviveFull();
    G.enemies.resetNear();
    try { ctx.player && ctx.player.setEnabled && ctx.player.setEnabled(true); } catch (e) { /* ignore */ }
    // three falls in a row at the same place → the tailwind's blessing (half damage for 60 s)
    if (deaths.length >= 3) {
      const a = deaths[0];
      if (deaths.every((d) => Math.hypot(d.x - a.x, d.z - a.z) < 40)) {
        G.vitals.blessT = 60;
        deaths.length = 0;
        toast(ctx, '追い風の加護 — 60 秒のあいだ受けるダメージが半分', "TAILWIND'S BLESSING", 'quest', 5000);
      }
    }
    emit(ctx, 'player:respawn', { checkpoint: id, x: sp.x, z: sp.z });
  }

  // ── save / load ──
  G.serialize = function () {
    const pl = ctx.player;
    const pos = pl && pl.pos ? pl.pos : null;
    return {
      v: 1, seed: (ctx.flags && ctx.flags.seed) || 7, savedAt: Date.now(),
      time: ctx.world && Number.isFinite(ctx.world.time) ? ctx.world.time : 7,
      pos: pos ? { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), yaw: +(((pl.yaw || 0) * 180 / Math.PI + 360) % 360).toFixed(1) } : { x: 0, z: 540, yaw: 0 },
      checkpoint: G.checkpoint,
      hp: G.vitals.dead ? G.vitals.maxHp : G.vitals.hp, maxHp: G.vitals.maxHp,
      stamina: Math.round(G.vitals.stamina), maxStamina: G.vitals.maxStamina,
      abilities: { glide: !!(pl && pl.abilities && pl.abilities.glide) || !!G.quest.flags.glide },
      inventory: G.inventory.serialize(),
      quest: G.quest.serialize(),
      stats: G.stats.serialize(),
    };
  };
  G.save = function () {
    if (!G.saver.enabled || !G.ready) return false;
    const ok = G.saver.write(G.serialize());
    if (ok) emit(ctx, 'save', {});
    saveT = AUTOSAVE;
    return ok;
  };
  G.requestSave = function (soon) { if (soon) saveSoon = 0.3; };
  G.load = function () {
    const d = G.saver.read();
    if (!d) return false;
    try { apply(d); return true; } catch (e) { report('game.load', e); return false; }
  };
  function apply(d) {
    G.inventory.restore(d.inventory);
    G.quest.restore(d.quest);
    G.stats.restore(d.stats);
    G.checkpoint = d.checkpoint || 'start';
    G.checkpoints.current = G.checkpoint;
    // world state the quest remembers
    const props = G.quest.props || {};
    G.checkpoints.restoreFrom(props);
    G.props.restoreFrom(props);
    for (const r of Object.keys(G.quest.towers)) if (G.quest.towers[r]) G.towers.awaken(r, true);
    for (const t of G.towers.towers) if (props[t.id] && props[t.id].awake) G.towers.awaken(t.id, true);
    G.seeds.markFound(G.quest.seeds);
    for (const c of G.pickups.chests) if (G.quest.chests.includes(c.id)) setPropState(c.prop, c.pedestal && c.prop && c.prop.kind === 'pedestal' ? 'taken' : 'open', true);
    for (const sh of G.shrines.shrines) if (G.quest.shrines[sh.id] && G.quest.shrines[sh.id].done) setPropState(sh.prop, 'mode', 'done');
    if (G.quest.flags.gather) G.pickups.restoreGather(G.quest.flags.gather);
    if (G.quest.stage >= 4) G.props.setBridge(true);
    // vitals
    G.vitals.refreshCaps();
    G.vitals.maxHp = Math.max(G.vitals.maxHp, d.maxHp | 0);
    G.vitals.hp = Math.max(1, Math.min(G.vitals.maxHp, Number.isFinite(d.hp) ? d.hp : G.vitals.maxHp));
    G.vitals.stamina = Math.max(0, Math.min(G.vitals.maxStamina, +d.stamina || 0));
    const pl = ctx.player;
    if (pl && pl.abilities) pl.abilities.glide = !!(d.abilities && d.abilities.glide) || G.quest.stage >= 3;
    const params = ctx.params;
    if (ctx.world && typeof ctx.world.setTimeOfDay === 'function' && Number.isFinite(d.time) && !(params && params.has('t'))) ctx.world.setTimeOfDay(d.time);
    if (pl && typeof pl.teleport === 'function' && d.pos && Number.isFinite(d.pos.x) && !(params && params.has('pos'))) pl.teleport(d.pos.x, d.pos.z, d.pos.yaw || 0);
  }
  G.reset = function () {
    G.saver.clear();
    // put the world's mechanisms back the way they were
    for (const l of G.checkpoints.lights) { if (l.lit) { setPropState(l.prop, 'lit', false); try { l.zone && ctx.zones.remove(l.zone); l.cook && ctx.zones.remove(l.cook); } catch (e) { /* ignore */ } l.zone = l.cook = null; l.lit = false; } }
    for (const b of G.checkpoints.braziers) G.checkpoints.douseBrazier(b);
    G.checkpoints.lightFree();
    for (const t of G.towers.towers) { t.awake = false; t.lift = 0; setPropState(t.prop, 'awake', false); }
    for (const c of G.pickups.chests) setPropState(c.prop, c.pedestal && c.prop && c.prop.kind === 'pedestal' ? 'taken' : 'open', false);
    for (const kind of ['crackrock', 'thornvine', 'iceblock', 'sleepbell', 'pinwheel', 'lightbridge', 'pedestal', 'shrine']) {
      for (const p of propsOf(ctx, kind)) {
        const key = { crackrock: 'broken', thornvine: 'burnt', iceblock: 'melted', sleepbell: 'rung', pinwheel: 'bloomed', lightbridge: 'on', pedestal: 'taken', shrine: 'mode' }[kind];
        setPropState(p, key, kind === 'shrine' ? 'idle' : false);
      }
    }
    if (G.shrines.active) G.shrines.cancel();
    G.boss.despawn();
    G.boss.defeated = false;
    G.enemies.clear();
    G.enemies.killedForever = {};
    G.inventory.clear();
    G.quest.restore(null);
    G.quest.tut = { walk: 0, run: 0, branch: false, apple: false, dummy: false };
    G.stats.restore(null);
    for (const s of G.seeds.seeds) s.found = false;
    G.props.load();
    G.enemies.loadGroups();
    newGame();
    G.vitals.dead = false;
    G.vitals.stamina = 0;
    G.vitals.refreshCaps();
    G.vitals.hp = G.vitals.maxHp;
    G.checkpoint = 'start'; G.checkpoints.current = 'start';
    const pl = ctx.player;
    if (pl && pl.abilities) pl.abilities.glide = false;
    const sp = ctx.world && ctx.world.spawnPoints && ctx.world.spawnPoints.player;
    if (sp && pl && pl.teleport) pl.teleport(sp.x, sp.z, sp.yaw || 0);
    G.quest.setStage(0, { silent: true });
    emit(ctx, 'quest:stage', { stage: 0, text: G.quest.stageText });
    return true;
  };
  function newGame() {
    G.inventory.add('waybell', 1, { silent: true });
  }

  // ── wiring ──
  G.start = function () {
    for (const [name, fn] of [['checkpoints', () => G.checkpoints.load()], ['towers', () => G.towers.load()], ['props', () => G.props.load()],
      ['pickups', () => G.pickups.load()], ['shrines', () => G.shrines.load()], ['braziers', () => G.checkpoints.lightFree()],
      ['seeds', () => G.seeds.load()], ['enemies', () => G.enemies.loadGroups()]]) {
      try { fn(); } catch (e) { report('game.' + name + '.load', e); }
    }
    let loaded = false;
    if (!autoplay) loaded = G.load();
    if (!loaded) newGame();
    G.ready = true;
    G.vitals.refreshCaps();
    G.quest.refreshObjective();
    emit(ctx, 'quest:stage', { stage: G.quest.stage, text: G.quest.stageText });
    emit(ctx, 'vitals', { hp: G.vitals.hp, maxHp: G.vitals.maxHp, stamina: G.vitals.stamina, maxStamina: G.vitals.maxStamina, tier: G.vitals.tier });
    G.loaded = loaded;
  };

  const order = [
    ['vitals', (dt) => G.vitals.update(dt)],
    ['stats', (dt) => G.stats.update(dt)],
    ['quest', (dt) => G.quest.update(dt)],
    ['checkpoints', (dt) => G.checkpoints.update(dt)],
    ['towers', (dt) => G.towers.update(dt)],
    ['props', (dt) => G.props.update(dt)],
    ['shrines', (dt) => G.shrines.update(dt)],
    ['seeds', (dt) => G.seeds.update(dt)],
    ['enemies', (dt) => G.enemies.update(dt)],
    ['boss', (dt) => G.boss.update(dt)],
    ['pickups', (dt) => G.pickups.update(dt)],
    ['bot', (dt) => G.bot.update(dt)],
  ];
  G.update = function (dt) {
    for (const [name, fn] of order) {
      try { fn(dt); } catch (e) { report('game.' + name, e); }
    }
    if (dt > 0) {
      // the 2 s white fade follows real time (like the body), even at a low frame rate
      const real = ctx.clock && ctx.clock.real > 0 ? Math.min(ctx.clock.real, 0.25) : 0;
      if (deathT > 0) { deathT -= Math.max(dt, real); if (deathT <= 0) respawn(); }
      if (saveSoon >= 0) { saveSoon -= dt; if (saveSoon < 0) G.save(); }
      saveT -= dt;
      if (saveT <= 0) G.save();
    }
  };

  function report(where, e) {
    const msg = `${where}: ${(e && e.message) || e}`;
    if (errOnce.has(msg)) return;
    errOnce.add(msg);
    if (ctx.report) ctx.report(msg);
    else { try { window.AW && window.AW.errors && window.AW.errors.push(msg); } catch (e2) { /* ignore */ } }
  }

  // save on pause and when the page goes away
  ctx.events?.on?.('pause', (p) => { if (p && p.paused) G.save(); });
  try {
    window.addEventListener('pagehide', () => G.save());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') G.save(); });
  } catch (e) { /* no window */ }

  // contract surface (§10.10) + helpers used by core/debug.js
  G.debug = {
    setStage: (n) => { G.quest.setStage(+n); return G.quest.stage; },
    awakenTower: (id) => G.towers.awaken(id),
    god: (b = true) => { G.vitals.god = !!b; G.vitals.invulnerable = !!b; return G.vitals.god; },
    startShrine: (id) => G.shrines.start(id),
    give: (id, n = 1) => G.inventory.add(id, n),
    today: () => ({ key: todayKey(), ...G.stats.today() }),
  };
  Object.defineProperty(G, 'checkpointId', { get: () => G.checkpoint });
  return G;
}
