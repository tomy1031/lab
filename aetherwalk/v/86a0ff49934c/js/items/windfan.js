// js/items/windfan.js — the gale fan (§4.1, §4.2), OPUS-A.
// Fanning: the fan face (normal ±X of the grip) moving along its normal at ≥ 2.5 m/s makes a gust in the
// direction of motion: 'wind' zones along a 6 m, 30° half-angle cone for 0.3 s (fires go out, pinwheels
// turn, campfires flare — whoever owns them reads the zones), a 'gust' hit (no damage, push) on every target
// in the cone, and 'gust' / 'item:use' { action:'fan' } events.
import * as THREE from 'three';
const HANDS = ['left', 'right'];

const _n = new THREE.Vector3(), _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _to = new THREE.Vector3();
const _hits = [];

export function createWindfan(ctx, I) {
  const input = ctx.input;
  const st = { left: { t: -10 }, right: { t: -10 } };
  const live = [];          // { zones: [], t }
  const seen = new Set();

  function gust(inst, hand, dir, strength) {
    const F = inst.def.fan;
    I.toWorld(inst, 0, 0, -0.13, _o);
    const zones = [];
    for (let k = 1; k <= 4; k++) {
      const d = (F.range * k) / 4.5;
      const r = 0.3 + d * Math.tan((F.halfAngle * Math.PI) / 180);
      zones.push(ctx.zones.add({ kind: 'wind', pos: _o.clone().addScaledVector(dir, d), r, owner: inst, data: { dir: dir.clone(), strength, itemId: 'windfan' } }));
    }
    live.push({ zones, t: F.life });
    // push everything in the cone
    const hits = ctx.targets.overlap(_o, F.range, _hits);
    seen.clear();
    const cosA = Math.cos((F.halfAngle * Math.PI) / 180);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (seen.has(h.target) || h.target.owner === 'player') continue;
      _to.copy(h.sphere.c).sub(_o);
      const L = _to.length();
      if (L > 1e-3 && _to.dot(dir) / L < cosA && L > h.sphere.r) continue;
      seen.add(h.target);
      I.hitTarget(h.target, { source: 'player', itemId: 'windfan', type: 'gust', damage: 0, element: 'wind', point: h.sphere.c, dir, speed: strength * 6, hand, part: h.sphere.part || 'body' });
    }
    ctx.events.emit('gust', { pos: _o, dir, radius: F.range, strength, itemId: 'windfan', hand });
    ctx.events.emit('item:use', { itemId: 'windfan', action: 'fan', hand });
    I.fx('gust', _o, { count: 14, dir, speed: 6, spread: 0.5 });
    input.haptic(hand, 0.35, 45);
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      live[i].t -= dt;
      if (live[i].t <= 0) { for (const z of live[i].zones) ctx.zones.remove(z); live.splice(i, 1); }
    }
    const now = ctx.clock.time;
    for (const hand of HANDS) {
      const inst = I.held[hand];
      if (!inst || inst.id !== 'windfan') continue;
      const F = inst.def.fan;
      _n.set(1, 0, 0).applyQuaternion(inst.quat);
      const v = input.hands[hand].vel;
      const vn = v.dot(_n);
      if (Math.abs(vn) >= F.minSpeed && now - st[hand].t > F.cooldown) {
        st[hand].t = now;
        _dir.copy(_n).multiplyScalar(Math.sign(vn));
        gust(inst, hand, _dir, Math.min(1, Math.abs(vn) / 5));
      }
    }
  }
  return { update, gust };
}
