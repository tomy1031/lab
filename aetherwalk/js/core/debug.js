// js/core/debug.js — window.AW.debug (§10.15, OPUS-A). Names are fixed by the contract; the extras at the
// bottom are OPUS-A test helpers. Tests talk to the game only through these.
import * as THREE from 'three';
import { wrapDeg360, DEG } from './util.js';
import { createDummy } from './stubs.js';

const LOGGED = ['step', 'gait', 'hit', 'swing', 'item:grab', 'item:release', 'item:throw', 'item:consume', 'item:use',
  'item:ignite', 'item:extinguish', 'item:cook', 'item:return', 'item:pickup', 'projectile:fire', 'explosion', 'gust',
  'player:duck', 'player:glide', 'player:land', 'player:teleport', 'region:enter', 'pause', 'perf:level', 'xr:start', 'xr:end'];

function plain(v, depth = 0) {
  if (v == null || typeof v !== 'object') return v;
  if (v.isVector3) return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
  if (v.isVector2) return [v.x, v.y];
  if (depth > 2) return undefined;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => plain(x, depth + 1));
  if (v.isObject3D || v.isMaterial || v.isBufferGeometry) return undefined;
  const o = {};
  for (const k of Object.keys(v)) {
    if (k === 'def' || k === 'object3D' || k === 'target' || k === 'sphere' || k === 'owner') continue;
    const x = plain(v[k], depth + 1);
    if (x !== undefined && typeof x !== 'function') o[k] = x;
  }
  return o;
}

export function installDebug(ctx, loop) {
  const AW = window.AW;
  AW.ctx = ctx;
  const d = AW.debug = AW.debug || {};
  const log = {};
  const dummies = [];
  for (const name of LOGGED) {
    log[name] = [];
    ctx.events.on(name, (p) => {
      const arr = log[name];
      if (arr.length >= 60) arr.shift();
      arr.push({ t: +ctx.clock.time.toFixed(3), ...plain(p || {}) });
    });
  }
  const pl = () => ctx.player;

  Object.assign(d, {
    teleport(x, z, yawDeg = 0) { pl().teleport(+x, +z, +yawDeg || 0); return d.state(); },
    setTime(hours) { ctx.world?.setTimeOfDay?.(+hours); },
    hud(visible = true) {
      try { ctx.ui?.setHudVisible?.(!!visible); } catch (e) { AW.errors.push('ui.setHudVisible: ' + e.message); }
      document.body.classList.toggle('aw-nohud', !visible);
    },
    state() {
      const p = pl() || {};
      const v = ctx.game?.vitals || {};
      const pos = p.pos || ctx.rig.position;
      const held = ctx.items?.held || {};
      const en = ctx.game?.enemies;
      let enemies = 0;
      try { enemies = en ? (typeof en.count === 'number' ? en.count : (en.list || []).length) : 0; } catch { enemies = 0; }
      return {
        x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), z: +pos.z.toFixed(3),
        yaw: +wrapDeg360((p.yaw ?? 0) / DEG).toFixed(1),
        hp: v.hp ?? 0, stamina: v.stamina ?? 0,
        steps: p.steps ?? 0, cadence: Math.round(p.cadence ?? 0), speed: +(p.speed ?? 0).toFixed(3),
        region: safe(() => ctx.world.regionAt(pos.x, pos.z), 'meadow'),
        time: +(ctx.world?.time ?? 0).toFixed(3),
        fps: loop.stats.fps, drawCalls: loop.stats.drawCalls, triangles: loop.stats.triangles,
        maxHp: v.maxHp ?? 0, maxStamina: v.maxStamina ?? 0,
        gait: p.gait || 'idle', grounded: !!p.grounded, gliding: !!p.gliding, ducking: !!p.ducking,
        held: { left: held.left ? held.left.id : null, right: held.right ? held.right.id : null },
        enemies,
        stage: ctx.game?.quest?.stage ?? 0,
        checkpoint: ctx.game?.checkpoint ?? null,
        paused: !!ctx.paused,
        mode: ctx.input?.mode || 'desktop',
        perfLevel: loop.perfLevel,
        // extras (OPUS-A)
        headHeight: +(p.headHeight ?? 0).toFixed(3), standHeight: +(p.standHeight ?? 0).toFixed(3), lean: +(p.lean ?? 0).toFixed(2),
      };
    },
    simulateSteps(spm = 120, seconds = 3) { pl().simulateSteps(+spm, +seconds); },
    give(itemId, count = 1) { return ctx.game?.inventory?.add?.(itemId, count) ?? 0; },
    equip(itemId, hand = 'right') {
      const inv = ctx.game?.inventory;
      if (inv && !inv.has?.(itemId) && ctx.items?.defs?.[itemId]) inv.add(itemId, 1);
      const inst = ctx.items?.equip?.(itemId, hand);
      return inst ? inst.uid : null;
    },
    spawnEnemy(type = 'husk', dx = 0, dz = -3) {
      const p = pl().pos;
      const e = ctx.game?.enemies?.spawn?.(type, p.x + dx, p.z + dz);
      return e ? (e.id ?? true) : null;
    },
    vista(id) {
      const v = (ctx.world?.vistas || []).find((x) => x.id === id);
      if (!v) return false;
      pl().teleport(v.x, v.z, v.yaw, ctx.world.groundAt ? ctx.world.groundAt(v.x, v.z, Infinity) + (v.lift || 0) : undefined);
      if (v.time != null) ctx.world.setTimeOfDay(v.time);
      return true;
    },
    landmarks() { return (ctx.world?.landmarkList || []).map((l) => ({ id: l.id, kind: l.kind, name: l.name, x: l.x, y: l.y, z: l.z })); },
    vistas() { return (ctx.world?.vistas || []).map((v) => ({ id: v.id, name: v.name, x: v.x, z: v.z, yaw: v.yaw, time: v.time })); },
    heightAt(x, z) { return ctx.world.heightAt(+x, +z); },
    setStage(n) { return ctx.game?.debug?.setStage ? ctx.game.debug.setStage(n) : ctx.game?.quest?.setStage?.(+n); },
    awakenTower(id) {
      const g = ctx.game;
      if (g?.debug?.awakenTower) return g.debug.awakenTower(id);
      if (g?.towers?.awaken) return g.towers.awaken(id);
      if (g?.awakenTower) return g.awakenTower(id);
      const prop = ctx.world?.props?.byId?.[id];
      prop?.setState?.('awake', true);
      return !!prop;
    },
    damage(n = 1) { return ctx.game?.vitals?.damage?.(+n, { source: 'world', type: 'debug', dir: null, enemyId: null }); },
    heal(n = 99) { return ctx.game?.vitals?.heal?.(+n); },
    god(b = true) {
      const v = ctx.game?.vitals;
      if (!v) return;
      if (ctx.game?.debug?.god) return ctx.game.debug.god(b);
      try { v.invulnerable = !!b; } catch { /* read-only */ }
    },
    swing(hand = 'right', kind = 'slashH') { return ctx.input.virtual.swing(hand, kind); },
    pause(b = true) { ctx.setPaused(!!b, 'debug'); },
    save() { return ctx.game?.save?.(); },
    reset() { return ctx.game?.reset?.(); },
    quality(level) {
      if (typeof level === 'string' && !/^\d$/.test(level)) { ctx.settings.override('quality', level); return; }
      loop.setPerfLevel(+level);
    },

    // ── OPUS-A extras ──
    /** recent copies of selected events: AW.debug.events('hit') */
    events(name) { return name ? (log[name] || []).slice() : Object.fromEntries(Object.entries(log).map(([k, v]) => [k, v.length])); },
    clearEvents() { for (const k of Object.keys(log)) log[k].length = 0; },
    /** a practice dummy (never dies) at player + (dx, dz) */
    spawnDummy(dx = 0, dz = -1.3) {
      const p = pl().pos;
      const dm = createDummy(ctx, p.x + dx, p.z + dz, { hp: Infinity, kind: 'dummy' });
      dummies.push(dm);
      return dm.id;
    },
    dummyState(id) { const dm = id ? dummies.find((x) => x.id === id) : dummies[dummies.length - 1]; return dm ? plain(dm.state) : null; },
    spawnItem(itemId, dx = 0, dz = -0.6, dy = 1.0, state) {
      const p = pl().pos;
      const it = ctx.items?.spawn?.(itemId, { pos: new THREE.Vector3(p.x + dx, p.y + dy, p.z + dz), state });
      return it ? it.uid : null;
    },
    items() { return (ctx.items?.worldItems || []).map((i) => ({ uid: i.uid, id: i.id, pos: plain(i.pos), heldBy: i.heldBy, state: plain(i.state), sleeping: i.sleeping })); },
    heldItem(hand = 'right') { const i = ctx.items?.held?.[hand]; return i ? { uid: i.uid, id: i.id, state: plain(i.state) } : null; },
    addZone(kind, dx = 0, dy = 1.2, dz = -0.5, r = 0.4) {
      const p = pl().pos;
      const z = ctx.zones.add({ kind, pos: new THREE.Vector3(p.x + dx, p.y + dy, p.z + dz), r, owner: 'debug' });
      return ctx.zones.list.indexOf(z);
    },
    clearZones() { for (const z of ctx.zones.list.filter((z) => z.owner === 'debug')) ctx.zones.remove(z); },
    /** move a virtual hand to a world point relative to the player (desktop / tests) */
    handTo(hand, dx, dy, dz) { const p = pl().pos; ctx.input.virtual.setHandTarget(hand, dx == null ? null : new THREE.Vector3(p.x + dx, p.y + dy, p.z + dz)); },
    handToMouth(hand = 'right') { ctx.player?.desktop?.toMouth?.(hand); },
    press(btn, ms = 150) { ctx.input.virtual.press(btn, ms); },
    hold(btn, down = true) { ctx.input.virtual.hold(btn, down); },
    look(yawDeg, pitchDeg = 0) { ctx.input.virtual.setLook(yawDeg, pitchDeg); },
    budget() { return ctx.items?.budget?.() ?? null; },
    stats() { return { ...loop.stats }; },
  });
  function safe(fn, dflt) { try { return fn(); } catch { return dflt; } }
  return d;
}
