// js/items/flask.js — the breath flask (§4.1), OPUS-A.
// Drink: neck within 0.12 m of the mouth and tipped ≥ 60° from upright → one gulp per 0.5 s
//        → 'item:consume' { itemId:'flask', hand, how:'drink' } per gulp (defs.flask.food is per gulp).
// Fill:  the flask under a water surface → gulps back to 3 → 'item:use' action 'fill'.
// Pour:  upside down (≥ 120°) away from the mouth → a short 'water' zone under the neck (puts out fires)
//        → 'item:use' action 'pour' (one gulp's worth).
import * as THREE from 'three';
import { mouthPoint } from './food.js';
const HANDS = ['left', 'right'];

const _m = new THREE.Vector3(), _neck = new THREE.Vector3(), _ax = new THREE.Vector3(), _zp = new THREE.Vector3();

export function createFlask(ctx, I) {
  const input = ctx.input;
  const st = { left: { gulpT: 0, pourT: 0, wet: false }, right: { gulpT: 0, pourT: 0, wet: false } };
  let zone = null, zoneT = 0;

  function update(dt) {
    if (zone) { zoneT -= dt; if (zoneT <= 0) { ctx.zones.remove(zone); zone = null; } }
    mouthPoint(ctx, _m);
    for (const hand of HANDS) {
      const s = st[hand];
      const inst = I.held[hand];
      if (!inst || inst.id !== 'flask') { s.gulpT = 0; s.pourT = 0; continue; }
      const F = inst.def.flask;
      I.toWorld(inst, 0, 0, F.neck, _neck);
      _ax.set(0, 0, -1).applyQuaternion(inst.quat);             // neck direction
      const tilt = Math.acos(Math.max(-1, Math.min(1, _ax.y))) * 180 / Math.PI;   // 0 = upright
      // fill
      let wl = -Infinity;
      try { wl = ctx.world.waterLevelAt(inst.pos.x, inst.pos.z); } catch { /* stub */ }
      const under = inst.pos.y < wl - 0.03;
      if (under && !s.wet) {
        s.wet = true;
        if (inst.state.gulps < F.gulps) {
          inst.state.gulps = F.gulps;
          ctx.events.emit('item:use', { itemId: 'flask', action: 'fill', hand });
          input.haptic(hand, 0.3, 40);
          I.fx('splash', inst.pos, { count: 6 });
        }
      } else if (!under) s.wet = false;
      // drink
      const atMouth = _neck.distanceTo(_m) <= 0.12;
      if (atMouth && tilt >= F.tilt && inst.state.gulps > 0) {
        s.gulpT += dt;
        if (s.gulpT >= F.gulpTime) {
          s.gulpT = 0;
          inst.state.gulps--;
          input.haptic(hand, 0.2, 35);
          ctx.events.emit('item:consume', { itemId: 'flask', hand, how: 'drink', gulpsLeft: inst.state.gulps });
        }
      } else s.gulpT = 0;
      // pour
      if (!atMouth && tilt >= F.pourTilt && inst.state.gulps > 0) {
        s.pourT += dt;
        if (Math.random() < dt * 20) I.fx('splash', _neck, { count: 1, size: 0.03 });
        if (s.pourT >= 0.6) {
          s.pourT = 0;
          inst.state.gulps--;
          _zp.copy(_neck).y -= 0.35;
          if (zone) ctx.zones.remove(zone);
          zone = ctx.zones.add({ kind: 'water', pos: _zp.clone(), r: 0.55, owner: inst, data: { itemId: 'flask' } });
          zoneT = 0.4;
          ctx.events.emit('item:use', { itemId: 'flask', action: 'pour', hand, pos: _zp });
          input.haptic(hand, 0.15, 30);
        }
      } else s.pourT = 0;
    }
  }
  return { update };
}
