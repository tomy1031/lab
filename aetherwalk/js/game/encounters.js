// js/game/encounters.js — fights after the sword (OPUS-B; playtest: 「剣を取ってからはモンスターとの戦いも楽しみたい。
// 火の周り以外なら」).
// · The first fight: the first time you leave the camp's safe zone with the sword, two thornlings wait ahead toward
//   the objective; when they are down, a husk a little further on teaches the two dodges. Saved in quest.flags.
// · The encounter director: outside every fire's safe zone, with a melee weapon and no Nagi about, a small pack
//   turns up ahead after ~80–120 m on foot or ~60–90 s (setting 戦いの頻度). Not saved; they leave at 80 m (enemies).
// · The first victory title, and a small combo count (hits within 2 s; the ui shows it).
import * as THREE from 'three';
import { fx, flash, emit, toast, playerPos, isNight, setting } from './util.js';

const FREQ = { low: 0, normal: 1, high: 0.6 };           // interval multiplier; 0 = no ambient encounters
const COMBO_T = 2.0;
const T_FIGHT = ['凪の気配 — 剣を振って倒そう！', 'THE NAGI ARE NEAR · SWING THE SWORD'];
const T_STRONG = ['大きく速く振ると強打 — いばら玉は一撃で散る', 'SWING FAST AND WIDE FOR A STRONG HIT'];
const T_HUSK = ['頭の高さの赤い線はしゃがんでよける・足もとの赤い帯は横へ1歩', 'RED LINE AT HEAD HEIGHT: DUCK · RED BAND ON THE GROUND: ONE STEP ASIDE'];

export function createEncounters(ctx, G) {
  const _p = new THREE.Vector3();
  const rng = (ctx.rng && typeof ctx.rng.fork === 'function') ? ctx.rng.fork('encounters') : null;
  const rnd = () => (rng && typeof rng.next === 'function' ? rng.next() : Math.random());
  const live = { first: [], husk: [] };        // this session's first-fight Nagi
  let lastX = NaN, lastZ = NaN, headX = 0, headZ = -1, hx0 = NaN, hz0 = NaN;
  let travel = 0, idleT = 0, needD = 100, needT = 75, retryT = 0;
  let huskFromX = NaN, huskFromZ = NaN, huskWaitD = 0, huskWaitT = 0, huskHintShown = false;
  let hintT = -1, combo = 0, comboT = 0, tick = 0;

  const flags = () => (G.quest ? G.quest.flags : {});
  const reroll = () => { needD = 80 + rnd() * 40; needT = 60 + rnd() * 30; };
  reroll();

  // ── where to put them ──
  function okSpot(x, z, py) {
    const w = ctx.world;
    if (G.safe && G.safe.at(x, z, 6)) return false;
    try {
      if (w.waterDepthAt && w.waterDepthAt(x, z) > 0.05) return false;
      if (w.isBlocked && w.isBlocked(x, z, 0.6)) return false;
      const h = w.groundAt ? w.groundAt(x, z, py + 6) : w.heightAt(x, z);
      if (!Number.isFinite(h) || Math.abs(h - py) > 5) return false;
      if (w.regionAt) { const r = w.regionAt(x, z); if (r === 'sea' || r === 'lake') return false; }
    } catch (e) { return true; }               // stub world: anywhere
    return true;
  }
  /** a pack centre `dist` m along (dx, dz) and `side` m to one side, off the path; null if none fits */
  function findSpot(px, pz, py, dx, dz, dMin, dMax, sMin, sMax, offPath) {
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L, rx = -uz, rz = ux;
    for (let i = 0; i < 14; i++) {
      const d = dMin + rnd() * (dMax - dMin);
      const s = (sMin + rnd() * (sMax - sMin)) * (rnd() < 0.5 ? -1 : 1);
      const x = px + ux * d + rx * s, z = pz + uz * d + rz * s;
      if (!okSpot(x, z, py)) continue;
      if (offPath && ctx.world && ctx.world.pathAt) { try { if (ctx.world.pathAt(x, z) > 0.05) continue; } catch (e) { /* stub */ } }
      return { x, z };
    }
    return null;
  }
  function spawnPack(types, c, enc, py) {
    const E = G.enemies, out = [];
    if (!E) return out;
    const room = (E.MAX_ACTIVE || 6) - (E.alive || 0);
    playerPos(ctx, _p);
    for (let i = 0; i < types.length && out.length < room; i++) {
      let x = c.x, z = c.z;
      for (let k = 0; k < 6; k++) {
        const a = rnd() * Math.PI * 2, r = i === 0 ? 0 : 1.6 + rnd() * 1.6;
        x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
        if (okSpot(x, z, py)) break;
      }
      const e = E.spawn(types[i], x, z, { enc, home: { x: c.x, z: c.z, radius: 5 }, yaw: Math.atan2(_p.x - x, -(_p.z - z)) });
      if (e) out.push(e);
    }
    if (out.length) fx(ctx, 'dust', new THREE.Vector3(c.x, out[0].pos.y + 0.2, c.z), { count: 10, speed: 1 });
    return out;
  }
  /** where the player is heading: toward the objective if there is one, else the way they walk */
  function aheadDir(px, pz, preferObjective) {
    const o = G.quest && G.quest.objective;
    if (preferObjective && o && Number.isFinite(o.x) && Math.hypot(o.x - px, o.z - pz) > 25) return [o.x - px, o.z - pz];
    return [headX, headZ];
  }
  /** a living Nagi (not the boss) within r m */
  function nagiNear(px, pz, r) {
    for (const e of G.enemies.list) if (e.state !== 'dead' && !e.ctrl && Math.hypot(e.pos.x - px, e.pos.z - pz) < r) return true;
    return false;
  }
  const aliveOf = (arr) => arr.filter((e) => e.state !== 'dead' && G.enemies.list.includes(e));

  // ── the first fight ──
  function firstFightTick(dt, px, pz, py) {
    const F = flags();
    const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
    if (!F.firstFight && G.quest && G.quest.stage >= 3) { F.firstFight = 'done'; return; }   // an older save: long past it
    // a save made mid-fight comes back without those Nagi
    if (F.firstFight === 'thorn' && !live.first.length) F.firstFight = undefined;
    if (F.firstFight === 'husk' && !live.husk.length) F.firstFight = 'huskWait';
    const zone = G.safe ? G.safe.playerZone : null;
    if (!F.firstFight) {
      if (!camp || !camp.lit || !G.inventory.has('sword') || zone || nagiNear(px, pz, 40)) return;
      if (G.vitals && G.vitals.dead) return;
      const [dx, dz] = aheadDir(px, pz, true);
      const c = findSpot(px, pz, py, dx, dz, 15, 22, 3.5, 6, true) || findSpot(px, pz, py, dx, dz, 15, 22, 1, 7, false);
      if (!c) return;
      live.first = spawnPack(['thornling', 'thornling'], c, 'first', py);
      if (!live.first.length) return;
      F.firstFight = 'thorn';
      toast(ctx, T_FIGHT[0], T_FIGHT[1], 'quest', 4500, 'fight');
      hintT = 4.6;
      emit(ctx, 'encounter:start', { kind: 'first', count: live.first.length });
      return;
    }
    if (F.firstFight === 'thorn') {
      const alive = aliveOf(live.first);
      if (alive.length) return;
      // all gone: killed (on to the husk) or wandered off far (try again later)
      const killed = live.first.some((e) => e.killedByPlayer);
      live.first = [];
      if (!killed) { F.firstFight = undefined; return; }
      F.firstFight = 'huskWait';
      huskFromX = px; huskFromZ = pz; huskWaitD = 0; huskWaitT = 0;
      G.requestSave && G.requestSave(true);
      return;
    }
    if (F.firstFight === 'huskWait') {
      if (zone || nagiNear(px, pz, 40)) return;
      if (!Number.isFinite(huskFromX)) { huskFromX = px; huskFromZ = pz; }
      huskWaitT += dt;
      huskWaitD = Math.hypot(px - huskFromX, pz - huskFromZ);
      if (huskWaitD < 25 && huskWaitT < 20) return;
      const [dx, dz] = aheadDir(px, pz, true);
      const c = findSpot(px, pz, py, dx, dz, 18, 24, 3.5, 6, true) || findSpot(px, pz, py, dx, dz, 18, 24, 1, 7, false);
      if (!c) return;
      live.husk = spawnPack(['husk'], c, 'first', py);
      if (!live.husk.length) return;
      F.firstFight = 'husk'; huskHintShown = false; hintT = -1;      // (the swing hint, if still pending, makes way)
      toast(ctx, '凪の殻が来る — 赤い予告を見てよけよう', 'A HOLLOW HUSK · WATCH THE RED WARNINGS', 'quest', 4000, 'fight');
      emit(ctx, 'encounter:start', { kind: 'husk', count: 1 });
      return;
    }
    if (F.firstFight === 'husk') {
      const alive = aliveOf(live.husk);
      // the dodge lesson, while it closes in (before its first blow)
      if (!huskHintShown && alive[0] && Math.hypot(alive[0].pos.x - px, alive[0].pos.z - pz) < 13) {
        huskHintShown = true;
        toast(ctx, T_HUSK[0], T_HUSK[1], 'quest', 7000, 'fight');
      }
      if (alive.length) return;
      const killed = live.husk.some((e) => e.killedByPlayer);
      live.husk = [];
      if (!killed) { F.firstFight = 'huskWait'; huskFromX = px; huskFromZ = pz; huskWaitT = 0; return; }
      F.firstFight = 'done';
      toast(ctx, 'よけて、斬る — その調子！', 'DODGE, THEN STRIKE · WELL DONE', 'quest', 3500, 'fight');
      G.requestSave && G.requestSave(true);
      reroll(); travel = 0; idleT = 0;
    }
  }

  // ── the encounter director ──
  function packFor(px, pz, night, stage) {
    let region = 'meadow';
    try { region = ctx.world.regionAt ? ctx.world.regionAt(px, pz) : 'meadow'; } catch (e) { /* stub */ }
    const r = rnd();
    let pack;
    switch (region) {
      case 'canyon': pack = stage >= 3 && r < 0.3 ? ['lurker'] : r < 0.65 ? ['thornling', 'thornling', 'thornling'] : ['husk', 'thornling']; break;
      case 'forest': pack = r < 0.5 ? ['thornling', 'thornling', 'thornling'] : ['husk', 'thornling']; break;
      case 'peaks': pack = r < 0.45 ? ['husk'] : ['husk', 'thornling']; break;
      default: pack = r < 0.55 ? ['thornling', 'thornling'] : ['husk'];
    }
    // gently more with the story
    if (stage >= 3 && pack.length < 3 && pack[0] !== 'lurker' && rnd() < 0.5) pack.push('thornling');
    if (stage >= 4 && rnd() < 0.35) pack.push('husk');
    if (night) pack.push('wisp');
    if (night && stage >= 4 && rnd() < 0.4) pack.push('wisp');
    return pack.slice(0, 4);
  }
  function directorTick(dt, px, pz, py, moved) {
    const F = flags();
    const mult = FREQ[setting(ctx, 'combatFreq', 'normal')] ?? 1;
    const zone = G.safe ? G.safe.playerZone : null;
    if (!mult || F.firstFight !== 'done' || zone) return;
    if (!(G.inventory.has('sword') || G.inventory.has('spear'))) return;
    if ((G.boss && G.boss.active) || (G.shrines && G.shrines.active) || (G.vitals && G.vitals.dead)) return;
    if (nagiNear(px, pz, 45)) { travel = 0; idleT = 0; return; }        // a fight (or a fixed group close by) is on
    travel += moved; idleT += dt;
    if (retryT > 0) { retryT -= dt; return; }
    if (travel < needD * mult && idleT < needT * mult) return;
    const night = isNight(ctx);
    const stage = G.quest ? G.quest.stage : 2;
    const [dx, dz] = aheadDir(px, pz, false);
    const c = findSpot(px, pz, py, dx, dz, 20, 28, 5, 9, false);
    if (!c) { retryT = 4; return; }
    const got = spawnPack(packFor(px, pz, night, stage), c, 'amb', py);
    if (!got.length) { retryT = 4; return; }
    travel = 0; idleT = 0; reroll();
    emit(ctx, 'encounter:start', { kind: 'ambient', count: got.length, types: got.map((e) => e.type) });
  }

  const N = {
    get live() { return live; },
    get progress() { return { travel, idleT, needD, needT }; },
    /** tests / debug: start the director's next encounter now */
    force() { travel = 1e9; retryT = 0; },
    update(dt) {
      if (dt <= 0 || !G.enemies || !G.inventory) return;
      if (comboT > 0) { comboT -= dt; if (comboT <= 0 && combo) { combo = 0; emit(ctx, 'combat:combo', { n: 0 }); } }
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) toast(ctx, T_STRONG[0], T_STRONG[1], 'quest', 4500, 'fight'); }
      playerPos(ctx, _p);
      const px = _p.x, pz = _p.z, py = _p.y;
      // distance on foot (a teleport or a respawn does not count) and the way you are heading
      if (Number.isFinite(lastX)) { const m = Math.hypot(px - lastX, pz - lastZ); if (m < 4) walked += m; }
      lastX = px; lastZ = pz;
      if (!Number.isFinite(hx0)) { hx0 = px; hz0 = pz; }
      const hd = Math.hypot(px - hx0, pz - hz0);
      if (hd > 3) { if (hd < 12) { headX = (px - hx0) / hd; headZ = (pz - hz0) / hd; } hx0 = px; hz0 = pz; }
      tick -= dt; tickDt += dt;
      if (tick > 0) return;
      tick = 0.25;
      try { firstFightTick(tickDt, px, pz, py); } catch (e) { ctx.report?.(`encounters.first: ${e.message}`); }
      try { directorTick(tickDt, px, pz, py, walked); } catch (e) { ctx.report?.(`encounters.director: ${e.message}`); }
      walked = 0; tickDt = 0;
    },
  };
  let walked = 0, tickDt = 0;

  // ── events ──
  const on = (n, f) => ctx.events?.on?.(n, (p) => { try { f(p || {}); } catch (e) { /* never break the emitter */ } });
  on('enemy:death', (p) => {
    // (a Nagi that only wandered off is removed without this event)
    const e = G.enemies && G.enemies.list.find((x) => x.id === p.id);
    if (e) e.killedByPlayer = true;
    const F = flags();
    if (!F.firstKill && G.inventory.has('sword')) {
      F.firstKill = true;
      emit(ctx, 'ui:title', { text: 'はじめての勝利', sub: 'FIRST VICTORY' });
      const pos = p.pos || _p;
      fx(ctx, 'shard', pos, { count: 40, color: 0xffd76a, speed: 3 });
      flash(ctx, pos, { color: 0xffd76a, size: 3, life: 0.5 });
      G.requestSave && G.requestSave(true);
    }
  });
  on('hit', (p) => {
    if (p.targetKind !== 'enemy' || !(p.applied > 0)) return;
    combo = comboT > 0 ? combo + 1 : 1;
    comboT = COMBO_T;
    if (combo >= 2) emit(ctx, 'combat:combo', { n: combo });
  });
  return N;
}
