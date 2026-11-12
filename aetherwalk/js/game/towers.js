// js/game/towers.js — 鐘塔: the step-powered lift (1 step = 0.2 m), the bell, awakening (§8.2) (OPUS-B)
import * as THREE from 'three';
import { heightAt, fx, flash, emit, toast, spawnList, findProp, setPropState, anchorOf, playerPos, yawTo } from './util.js';

const STEP_RISE = 0.2, SINK = 0.5, LIFT_R = 1.7;
export const TOWER_NAMES = {
  meadow: { name: '風見の鐘塔', en: 'Windwatch Bell Tower' }, forest: { name: '森の鐘塔', en: 'Forest Bell Tower' },
  canyon: { name: '茜の鐘塔', en: 'Madder Bell Tower' }, peaks: { name: '霜の鐘塔', en: 'Frost Bell Tower' },
};

export function createTowers(ctx, G) {
  const towers = [];
  const _p = new THREE.Vector3(), _a = new THREE.Vector3();
  let onLift = null;
  let liftLock = false;

  const T = {
    towers,
    get onLift() { return onLift; },
    /** true while a lift is between bottom and top with you on it: steps lift instead of moving you */
    get liftLock() { return liftLock; },
    load() {
      for (const t of towers) cleanup(t);
      towers.length = 0;
      for (const s of spawnList(ctx, 'towers')) {
        const prop = findProp(ctx, 'tower', s.id, s.x, s.z, 15);
        const region = s.region || (ctx.world && ctx.world.regionAt ? ctx.world.regionAt(s.x, s.z) : 'meadow');
        const t = {
          id: s.id, x: s.x, z: s.z, region, prop, height: s.liftHeight || 24,
          name: (TOWER_NAMES[region] || TOWER_NAMES.meadow).name, en: (TOWER_NAMES[region] || TOWER_NAMES.meadow).en,
          awake: false, lift: 0, baseY: 0, base: new THREE.Vector3(), chime: new THREE.Vector3(), platform: null, target: null,
          idleT: 9, topToast: false, lastSent: -1, doorYaw: 0,
        };
        anchorOf(prop, 'liftBase', t.base);
        if (!prop || !prop.anchors || !prop.anchors.liftBase) t.base.set(s.x, heightAt(ctx, s.x, s.z), s.z);
        t.baseY = t.base.y;
        anchorOf(prop, 'chime', t.chime);
        if (!prop || !prop.anchors || !prop.anchors.chime) t.chime.set(s.x, t.baseY + t.height + 2.2, s.z);
        // respawn on the side that faces the island center
        t.doorYaw = yawTo(0 - s.x, -40 - s.z);
        const W = ctx.world;
        if (W && typeof W.addPlatform === 'function') {
          try { t.platform = W.addPlatform({ x: t.base.x, z: t.base.z, r: LIFT_R, y: t.baseY }); } catch (e) { t.platform = null; }
        }
        const TG = ctx.targets;
        if (TG && typeof TG.add === 'function') {
          try {
            t.target = TG.add({ id: 'bell:' + t.id, kind: 'prop', spheres: [{ c: t.chime, r: 0.7, part: 'body' }], owner: t,
              onHit: (h) => { ringBell(t, h); return { applied: 0, killed: false }; } });
          } catch (e) { t.target = null; }
        }
        towers.push(t);
      }
    },
    byId(id) { return towers.find((t) => t.id === id || t.region === id) || null; },
    awaken(id, silent = false) {
      const t = T.byId(id);
      if (!t) {
        // no world tower: still record the progress (debug/awakenTower with a stub world)
        if (G.quest && ['meadow', 'forest', 'canyon', 'peaks'].includes(id)) { G.quest.towers[id] = true; G.quest.afterTower(id, silent); }
        return !!t;
      }
      if (t.awake) return true;
      t.awake = true;
      setPropState(t.prop, 'awake', true);
      G.quest.towers[t.region] = true;
      G.quest.props[t.id] = { ...(G.quest.props[t.id] || {}), awake: true };
      const count = Object.values(G.quest.towers).filter(Boolean).length;
      if (!silent) {
        flash(ctx, t.chime, { color: 0xffd76a, size: 12, life: 1.2 });
        fx(ctx, 'shard', t.chime, { count: 40, color: 0xffd76a, speed: 4 });
        fx(ctx, 'gust', t.chime, { count: 20, speed: 5 });
        emit(ctx, 'tower:awake', { id: t.id, count });
        emit(ctx, 'ui:title', { text: `${t.name} — 目覚め`, sub: `${t.en.toUpperCase()} AWAKENED · ${count}/4` });
        G.checkpoints && G.checkpoints.setCheckpoint(t.id);
      }
      G.quest.afterTower(t.region, silent);
      return true;
    },
    update,
  };

  function ringBell(t, h) {
    if (!h) return;
    const strong = h.speed == null || h.speed >= 2.5 || h.type === 'arrow' || h.type === 'thrown' || h.type === 'gust' || h.type === 'blast';
    emit(ctx, 'bell:ring', { id: t.id, strong, pos: t.chime });
    if (!strong) { fx(ctx, 'spark', t.chime, { count: 4, color: 0xffd76a }); return; }
    if (!t.awake) T.awaken(t.id);
    else flash(ctx, t.chime, { color: 0xffd76a, size: 4, life: 0.5 });
  }

  function cleanup(t) {
    if (t.platform && ctx.world && ctx.world.removePlatform) { try { ctx.world.removePlatform(t.platform); } catch (e) { /* ignore */ } }
    if (t.target && ctx.targets) { try { ctx.targets.remove(t.target); } catch (e) { /* ignore */ } }
  }

  // each real step on the lift raises it 0.2 m
  ctx.events?.on?.('step', () => {
    const t = onLift;
    if (!t) return;
    t.idleT = 0;
    if (t.lift < t.height) {
      t.lift = Math.min(t.height, t.lift + STEP_RISE);
      if (t.lift >= t.height && !t.topToast) {
        t.topToast = true;
        toast(ctx, t.awake ? '頂上 — 両腕を広げて飛び立とう' : '頂上 — 鐘を強く打とう', t.awake ? 'SPREAD YOUR ARMS TO GLIDE' : 'STRIKE THE BELL', 'quest', 4000);
      }
    }
  });

  function update(dt) {
    if (dt <= 0) return;
    playerPos(ctx, _p);
    onLift = null;
    liftLock = false;
    for (const t of towers) {
      const py = t.baseY + t.lift;
      const dx = _p.x - t.base.x, dz = _p.z - t.base.z;
      const on = Math.hypot(dx, dz) < LIFT_R - 0.15 && Math.abs(_p.y - py) < 0.9;
      if (on) onLift = t;
      t.idleT += dt;
      if (on) liftLock = t.lift > 0.01 && t.lift < t.height;
      // standing still: sink slowly (stops at the top and at the bottom)
      if (t.lift > 0 && t.lift < t.height && t.idleT > 1.0) t.lift = Math.max(0, t.lift - SINK * dt);
      if (!on && t.lift >= t.height && Math.hypot(dx, dz) > 6) {
        // left the top (glided away or walked off): the lift comes back down for the next visit
        t.lift = Math.max(0, t.lift - SINK * 2 * dt);
        if (t.lift < t.height) t.topToast = false;
      }
      if (t.platform) t.platform.y = t.baseY + t.lift;
      if (Math.abs(t.lift - t.lastSent) > 0.05 || (t.lift === 0 && t.lastSent !== 0)) {
        t.lastSent = t.lift;
        setPropState(t.prop, 'lift', Math.round(t.lift * 100) / 100);
        if (on || t.lift > 0) emit(ctx, 'tower:lift', { id: t.id, y: t.lift, ratio: t.lift / t.height });
      }
    }
  }
  return T;
}
