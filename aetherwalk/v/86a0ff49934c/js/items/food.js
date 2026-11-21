// js/items/food.js — eating and cooking (§2.5, §4.1, §4.2), OPUS-A.
// Eat: hold food within 0.12 m of the mouth (10 cm below / 7 cm in front of the eyes); every 0.4 s there is a
// bite (haptic + crumbs), after `bites` (2) it is gone → 'item:consume' { itemId, hand, how:'eat' } (OPUS-B
// applies defs.food). Cook: food with cookTo inside a 'cook' or 'fire' zone for cookTime (3 s), held or on
// the ground, turns into the cooked item in place → 'item:cook' { from, to }.
import * as THREE from 'three';
const HANDS = ['left', 'right'];

const _mouth = new THREE.Vector3();

export function mouthPoint(ctx, out) {
  const h = ctx.input.head;
  return out.set(0, -0.075, -0.07).applyQuaternion(h.quat).add(h.pos);
}

export function createFood(ctx, I) {
  const input = ctx.input;
  const st = { left: { t: 0, inst: null }, right: { t: 0, inst: null } };

  function update(dt) {
    mouthPoint(ctx, _mouth);
    for (const hand of HANDS) {
      const s = st[hand];
      const inst = I.held[hand];
      if (!inst || inst.def.cat !== 'food') { s.t = 0; s.inst = null; continue; }
      if (s.inst !== inst) { s.inst = inst; s.t = 0; }
      const d = inst.pos.distanceTo(_mouth);
      if (d <= 0.12) {
        s.t += dt;
        if (s.t >= 0.4) {
          s.t = 0;
          inst.state.bites = (inst.state.bites || 0) + 1;
          input.haptic(hand, 0.25, 30);
          I.fx('leaf', inst.pos, { count: 5, color: 0xffe9b0, size: 0.02, speed: 0.6 });
          ctx.events.emit('item:use', { itemId: inst.id, action: 'bite', hand });
          if (inst.state.bites >= (inst.def.food?.bites || 2)) {
            const id = inst.id;
            I.despawn(inst);
            ctx.events.emit('item:consume', { itemId: id, hand, how: 'eat' });
            I.fx('heal', _mouth, { count: 8 });
          }
        }
      } else s.t = Math.max(0, s.t - dt * 0.5);
    }
    // cooking (held or lying anywhere)
    for (const inst of I.all) {
      const f = inst.def.food;
      if (!f || !f.cookTo || inst.dead) continue;
      const hot = ctx.zones.any('cook', inst.pos, inst.radius) || ctx.zones.any('fire', inst.pos, inst.radius, inst);
      if (hot) {
        inst.state.cook = (inst.state.cook || 0) + dt;
        if (Math.random() < dt * 3) I.fx('smoke', inst.pos, { count: 1, size: 0.05 });
        if (inst.state.cook >= (f.cookTime || 3)) {
          const from = inst.id;
          I.setModel(inst, f.cookTo);
          inst.state.cook = 0;
          inst.state.bites = 0;
          ctx.events.emit('item:cook', { from, to: inst.id, uid: inst.uid });
          if (inst.heldBy) input.haptic(inst.heldBy, 0.3, 40);
          I.fx('ember', inst.pos, { count: 6 });
        }
      }
    }
  }
  return { update };
}
