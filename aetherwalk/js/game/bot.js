// js/game/bot.js — ?autoplay: plays through input.virtual like a person would (§10.10): walks/jogs toward
// the objective, fights the nearest Nagi with real swings, ducks / side-steps / guards on telegraphs. (OPUS-B)
import { yawTo, angDiff, DEG, clamp } from './util.js';

const KINDS = ['slashH', 'slashV', 'thrust'];

export function createBot(ctx, G) {
  let swingT = 0, kindI = 0, equipT = 0, stuckT = 0, lastX = NaN, lastZ = NaN, checkT = 0;
  let reactT = 0, reactKind = null, teleCount = 0, turnBias = 0, turnT = 0, wander = null, lookYaw = 0, guardT = 0;
  let simT = 0;
  const B = {
    enabled: false,
    mode: 'idle',
    target: null,
    start() {
      B.enabled = true;
      // the demo skips the lesson so it reaches the open road and the Nagi quickly
      try { if (G.quest && G.quest.stage < 2) G.quest.setStage(2, { silent: true }); } catch (e) { /* ignore */ }
      if (G.inventory && !G.inventory.has('shield')) G.inventory.add('shield', 1, { silent: true });
      const pl = ctx.player;
      lookYaw = pl && Number.isFinite(pl.yaw) ? pl.yaw : 0;
      equipT = 0;
    },
    stop() {
      B.enabled = false;
      const v = ctx.input && ctx.input.virtual;
      if (v) { try { v.setCadence(0); v.setDuck(false); v.setLean(0); v.setGuard && v.setGuard('left', false); } catch (e) { /* ignore */ } }
    },
    update,
  };

  ctx.events?.on?.('enemy:telegraph', (e) => {
    if (!B.enabled || !e) return;
    const pl = ctx.player;
    if (!pl || !pl.pos) return;
    if (e.pos && Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) > 16) return;
    teleCount++;
    // mostly dodge with the body; every third blow, raise the shield instead
    const useGuard = teleCount % 3 === 0 && ctx.items && ctx.items.held && ctx.items.held.left && ctx.items.held.left.id === 'shield';
    reactKind = useGuard ? 'guard' : e.kind === 'high' ? 'duck' : 'side';
    reactT = (e.duration || 1) + 0.45;
  });

  function update(dt) {
    if (!B.enabled || dt <= 0) return;
    const v = ctx.input && ctx.input.virtual;
    const pl = ctx.player;
    if (!pl || !pl.pos) return;
    if (!v) {
      // no virtual input: at least walk with synthetic steps
      simT -= dt;
      if (simT <= 0 && typeof pl.simulateSteps === 'function') { simT = 1; pl.simulateSteps(130, 1.2); }
      return;
    }
    if (G.vitals && G.vitals.dead) { v.setCadence(0); v.setDuck(false); v.setLean(0); return; }

    // keep a sword in the right hand and the shield in the left
    equipT -= dt;
    if (equipT <= 0) {
      equipT = 2;
      const items = ctx.items;
      if (items && typeof items.equip === 'function' && items.held) {
        try {
          if (!items.held.right && G.inventory.has('sword')) items.equip('sword', 'right');
          if (!items.held.left && G.inventory.has('shield')) items.equip('shield', 'left');
        } catch (e) { /* items stub */ }
      }
    }

    // a bite to eat when low
    if (G.vitals && G.vitals.hp <= 4 && G.inventory.has('apple') && Math.random() < dt * 0.2) {
      G.inventory.remove('apple', 1);
      G.eat('apple', 'eat');
    }

    // react to telegraphs first
    if (reactT > 0) {
      reactT -= dt;
      v.setCadence(0);
      if (reactKind === 'duck') v.setDuck(true);
      else if (reactKind === 'side') v.setLean(turnBias >= 0 ? 1 : -1);
      else if (reactKind === 'guard' && v.setGuard) v.setGuard('left', true);
      if (reactT <= 0) { v.setDuck(false); v.setLean(0); if (v.setGuard) v.setGuard('left', false); reactKind = null; turnBias = -turnBias || 1; }
      faceTarget(dt, v, pl);
      return;
    }

    const E = G.enemies;
    let foe = null, fd = 24;
    if (E) for (const e of E.list) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
      if (d < fd) { fd = d; foe = e; }
    }
    B.target = foe;
    if (foe) {
      B.mode = 'fight';
      const tx = foe.pos.x - pl.pos.x, tz = foe.pos.z - pl.pos.z;
      lookYaw = steer(lookYaw, yawTo(tx, tz), dt, 4);
      const pitch = foe.type === 'thornling' || foe.type === 'lurker' ? -22 : foe.type === 'wisp' ? 5 : -6;
      v.setLook(lookYaw / DEG, pitch);
      const reach = foe.type === 'rimeguard' || foe.type === 'stillheart' ? 2.6 : foe.type === 'lurker' ? 2.1 : 1.7;
      v.setCadence(fd > reach ? (fd > 8 ? 140 : 110) : 0);
      swingT -= dt;
      if (fd < reach + 0.7 && swingT <= 0) {
        v.swing('right', KINDS[kindI++ % KINDS.length]);
        swingT = 0.6 + Math.random() * 0.25;
      }
    } else if (towerTick(dt, v, pl)) {
      B.mode = 'tower';
    } else {
      B.mode = 'travel';
      const o = G.quest && G.quest.objective;
      let gx, gz;
      if (o && Math.hypot(o.x - pl.pos.x, o.z - pl.pos.z) > 8) { gx = o.x; gz = o.z; wander = null; }
      else {
        if (!wander || Math.hypot(wander.x - pl.pos.x, wander.z - pl.pos.z) < 5) {
          const a = Math.random() * Math.PI * 2;
          wander = { x: pl.pos.x + Math.cos(a) * 60, z: pl.pos.z + Math.sin(a) * 60 };
        }
        gx = wander.x; gz = wander.z;
      }
      let want = yawTo(gx - pl.pos.x, gz - pl.pos.z);
      if (turnT > 0) { turnT -= dt; want += turnBias * 70 * DEG; }
      lookYaw = steer(lookYaw, want, dt, 1.6);
      v.setLook(lookYaw / DEG, -4);
      // high up (a tower top) and not on a lift: spread the arms and glide down
      const h = ctx.world && ctx.world.heightAt ? ctx.world.heightAt(pl.pos.x, pl.pos.z) : pl.pos.y;
      const high = pl.pos.y - h > 5 && !(G.towers && G.towers.onLift);
      if (v.spreadArms) v.spreadArms(high || !!pl.gliding);
      v.setCadence(140);
    }

    // stuck → swing the heading aside for a while
    checkT -= dt;
    if (checkT <= 0) {
      checkT = 2;
      if (Number.isFinite(lastX) && (v.cadence || 0) > 0 && !(G.towers && G.towers.onLift)) {
        const moved = Math.hypot(pl.pos.x - lastX, pl.pos.z - lastZ);
        if (moved < 0.5) { stuckT += 2; turnBias = Math.random() < 0.5 ? -1 : 1; turnT = 2.5; }
        else stuckT = 0;
      }
      lastX = pl.pos.x; lastZ = pl.pos.z;
    }
  }

  /** the objective is a sleeping bell tower: ride the lift with real steps, then strike the bell */
  function towerTick(dt, v, pl) {
    const o = G.quest && G.quest.objective;
    const T = G.towers;
    const tw = o && T && T.byId ? T.byId(o.id) : null;
    if (!tw || tw.awake) return false;
    const dBase = Math.hypot(tw.base.x - pl.pos.x, tw.base.z - pl.pos.z);
    if (dBase > 25) return false;
    if (v.spreadArms) v.spreadArms(false);
    const atTop = tw.lift >= tw.height - 0.05 && pl.pos.y > tw.baseY + tw.height - 1.0;
    if (atTop) {
      const ch = tw.chime, h = ctx.input.head.pos;
      const dh = Math.hypot(ch.x - h.x, ch.z - h.z);
      lookYaw = steer(lookYaw, yawTo(ch.x - h.x, ch.z - h.z), dt, 4);
      v.setLook(lookYaw / DEG, Math.atan2(ch.y - h.y, Math.max(0.3, dh)) / DEG);
      v.setCadence(dh > 1.6 ? 90 : 0);
      swingT -= dt;
      if (dh <= 2.0 && swingT <= 0) { v.swing('right', KINDS[kindI++ % KINDS.length]); swingT = 0.8; }
      return true;
    }
    if (T.onLift === tw && dBase < 1.2) {
      v.setCadence(150);                       // every step lifts the platform 0.2 m
      return true;
    }
    lookYaw = steer(lookYaw, yawTo(tw.base.x - pl.pos.x, tw.base.z - pl.pos.z), dt, 3);
    v.setLook(lookYaw / DEG, -6);
    v.setCadence(dBase > 3 ? 120 : 70);
    return true;
  }

  function faceTarget(dt, v, pl) {
    const foe = B.target;
    if (!foe || foe.state === 'dead') return;
    lookYaw = steer(lookYaw, yawTo(foe.pos.x - pl.pos.x, foe.pos.z - pl.pos.z), dt, 3);
    v.setLook(lookYaw / DEG, -6);
  }
  function steer(cur, want, dt, rate) {
    const d = angDiff(cur, want);
    return cur + clamp(d, -rate * dt, rate * dt);
  }
  return B;
}
