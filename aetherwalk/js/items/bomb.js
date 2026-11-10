// js/items/bomb.js — burstfruit (§4.1), OPUS-A: trigger while held (or any fire zone) lights the fuse;
// 3 s later it bursts: every target within 4 m takes 14 (centre) → 4 (edge) as a 'blast' through
// target.onHit, then 'explosion' { pos, radius, damage } is emitted (OPUS-B: player self-damage ≤ 4,
// cracked rocks, anything that isn't a target). A short fire zone lights torches/fuses nearby.
// Water puts the fuse out.
import * as THREE from 'three';
const HANDS = ['left', 'right'];

const _hits = [], _dir = new THREE.Vector3(), _fp = new THREE.Vector3();

export function createBomb(ctx, I) {
  const input = ctx.input;
  let blastZone = null, blastT = 0;
  const seen = new Set();

  function light(inst, how) {
    if (inst.state.fuse >= 0) return;
    inst.state.fuse = inst.def.bomb.fuse;
    inst.state.lit = false;                  // the fruit isn't a flame, its fuse is
    ensureSpark(inst);
    ctx.events.emit('item:ignite', { uid: inst.uid, itemId: inst.id });
    ctx.events.emit('item:use', { itemId: inst.id, action: 'fuse', hand: inst.heldBy || null, how });
    if (inst.heldBy) input.haptic(inst.heldBy, 0.3, 30);
  }
  function ensureSpark(inst) {
    if (inst.fx.spark) { inst.fx.spark.visible = true; return; }
    const g = ctx.art.glow({ color: 0xffb347, size: 0.12, opacity: 1 });
    g.position.set(0, 0, -0.105);
    inst.object3D.add(g);
    inst.fx.spark = g;
  }

  function explode(inst) {
    const b = inst.def.bomb;
    const pos = _fp.copy(inst.pos);
    const hand = inst.heldBy;
    I.despawn(inst);
    const hits = ctx.targets.overlap(pos, b.radius, _hits);
    seen.clear();
    const mul = I.damageMul();
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (seen.has(h.target) || h.target.owner === 'player') continue;     // nearest sphere of each target
      seen.add(h.target);
      const k = Math.min(1, h.dist / b.radius);
      const damage = (b.center + (b.edge - b.center) * k) * mul;
      _dir.copy(h.sphere.c).sub(pos);
      if (_dir.lengthSq() < 1e-6) _dir.set(0, 1, 0);
      _dir.normalize();
      I.hitTarget(h.target, { source: 'player', itemId: 'bomb', type: 'blast', damage, element: 'fire',
        point: h.sphere.c, dir: _dir, speed: 0, hand: null, part: h.sphere.part || 'body' });
    }
    ctx.events.emit('explosion', { pos, radius: b.radius, damage: b.center, self: b.self, itemId: 'bomb' });
    I.flash(pos, { color: 0xffb347, size: 4, life: 0.35 });
    I.fx('spark', pos, { count: 30, color: 0xffb347, speed: 7 });
    I.fx('smoke', pos, { count: 14 });
    I.fx('ring', pos, { color: 0xff6a2b, size: b.radius });
    // a moment of fire: lights torches, fuses, fire arrows in reach
    if (blastZone) ctx.zones.remove(blastZone);
    blastZone = ctx.zones.add({ kind: 'fire', pos: pos.clone(), r: 1.5, owner: 'blast' });
    blastT = 0.3;
    // the hands feel it (strongly if it was in one)
    for (const h of HANDS) {
      const d = input.hands[h].pos.distanceTo(pos);
      if (h === hand) input.haptic(h, 1, 120);
      else if (d < b.radius * 1.5) input.haptic(h, 0.6 * (1 - d / (b.radius * 1.5)), 80);
    }
  }

  function update(dt) {
    if (blastZone) { blastT -= dt; if (blastT <= 0) { ctx.zones.remove(blastZone); blastZone = null; } }
    const w = ctx.world;
    for (let i = I.all.length - 1; i >= 0; i--) {
      const inst = I.all[i];
      if (!inst || inst.id !== 'bomb' || inst.dead) continue;
      // trigger while held
      if (inst.heldBy && inst.state.fuse < 0 && input.justPressed(inst.heldBy === 'left' ? 'triggerL' : 'triggerR')) light(inst, 'trigger');
      // touching fire
      if (inst.state.fuse < 0 && ctx.zones.any('fire', inst.pos, inst.radius, inst)) light(inst, 'fire');
      if (inst.state.fuse >= 0) {
        let wl = -Infinity;
        try { wl = w.waterLevelAt(inst.pos.x, inst.pos.z); } catch { /* stub */ }
        if (inst.pos.y < wl) {
          inst.state.fuse = -1;
          if (inst.fx.spark) inst.fx.spark.visible = false;
          ctx.events.emit('item:extinguish', { uid: inst.uid, itemId: inst.id });
          continue;
        }
        inst.state.fuse -= dt;
        if (inst.fx.spark) {
          const k = inst.state.fuse < 1 ? 12 : 5;
          inst.fx.spark.scale.setScalar(0.1 + 0.05 * Math.abs(Math.sin(ctx.clock.time * k)));
        }
        if (inst.heldBy && inst.state.fuse < 1 && Math.random() < dt * 10) input.haptic(inst.heldBy, 0.12, 10);
        if (inst.state.fuse <= 0) explode(inst);
      }
    }
  }
  return { update, light, explode, drawCalls() { let n = blastZone ? 0 : 0; for (const i of I.all) if (i.id === 'bomb' && i.state.fuse >= 0) n++; return n; } };
}
