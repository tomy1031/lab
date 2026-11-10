// js/items/shield.js — blocking (§5.3), OPUS-A. blockTest(shape, fromPos) is called by OPUS-B when an enemy
// attack would hit: a raised shield facing within ±60° of the attacker blocks it; pushed toward the attack
// at ≥ 1.5 m/s within the last 0.25 s it's a parry. A weapon moving ≥ 2 m/s that touches a 'sphere' shot
// knocks it back (parry). Returns { blocked, parry, itemId, hand, point } or null.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
const HANDS = ['left', 'right'];

const _n = new THREE.Vector3(), _c = new THREE.Vector3(), _to = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();

export function createShield(ctx, I, melee) {
  const input = ctx.input;
  // per hand: last time the shield face was pushed outward fast
  const push = { left: { t: -10, dir: new THREE.Vector3() }, right: { t: -10, dir: new THREE.Vector3() } };
  const results = { left: { blocked: true, parry: false, itemId: '', hand: '', point: new THREE.Vector3() }, right: { blocked: true, parry: false, itemId: '', hand: '', point: new THREE.Vector3() } };

  function shieldFrame(inst, hand, outC, outN) {
    // model: face normal +X, centre (0.065, 0.02, 0) in item space; the left hand's copy is flipped
    I.toWorld(inst, 0.065, 0.02, 0, outC);
    outN.set(1, 0, 0).applyQuaternion(inst.quat);
    return outC;
  }

  function update() {
    const now = ctx.clock.time;
    for (const hand of HANDS) {
      const inst = I.held[hand];
      if (!inst || !inst.def.block) continue;
      shieldFrame(inst, hand, _c, _n);
      const v = input.hands[hand].vel;
      const outward = v.dot(_n);
      if (outward >= inst.def.block.parrySpeed) { push[hand].t = now; push[hand].dir.copy(v).normalize(); }
    }
  }

  function blockTest(shape, fromPos) {
    if (!shape) return null;
    const now = ctx.clock.time;
    const P = ctx.player;
    const chest = P?.body?.chestPos || input.head.pos;
    let src = fromPos;
    if (!src) {
      if (shape.kind === 'sphere' && shape.center) src = shape.center;
      else if (shape.kind === 'line') src = _v.set(shape.x0, chest.y, shape.z0);
      else return null;
    }
    for (const hand of HANDS) {
      const inst = I.held[hand];
      if (!inst || !inst.def.block) continue;
      const b = inst.def.block;
      shieldFrame(inst, hand, _c, _n);
      // raised: in front of the body, roughly between hip and head
      const hy = _c.y - (P?.pos?.y ?? 0);
      if (hy < 0.55 * (P?.standHeight || 1.6) || _c.distanceTo(chest) > 0.85) continue;
      _to.copy(src).sub(_c);
      if (shape.kind !== 'sphere') _to.y *= 0.3;           // ground slams / sweeps: mostly about facing
      if (_to.lengthSq() < 1e-6) continue;
      _to.normalize();
      const cos = _n.dot(_to);
      if (cos < Math.cos((b.arc * Math.PI) / 180)) continue;
      const r = results[hand];
      r.blocked = true;
      r.parry = now - push[hand].t <= b.parryWindow && push[hand].dir.dot(_to) > 0.3;
      r.itemId = inst.id; r.hand = hand;
      r.point.copy(_c);
      input.haptic(hand, r.parry ? 1.0 : 0.7, r.parry ? 60 : 40);
      I.fx('spark', _c, { count: r.parry ? 20 : 10, color: r.parry ? 0x7fe9ff : 0xffd76a });
      return r;
    }
    // a weapon swatting a shot away
    if (shape.kind === 'sphere' && shape.center) {
      for (const hand of HANDS) {
        const bl = melee.blade(hand);
        if (!bl || bl.speed < 2) continue;
        _d.copy(bl.b).sub(bl.a);
        const L = _d.lengthSq();
        const t = L > 1e-9 ? clamp(_v.copy(shape.center).sub(bl.a).dot(_d) / L, 0, 1) : 0;
        _v.copy(bl.a).addScaledVector(_d, t);
        if (_v.distanceTo(shape.center) <= (shape.radius || 0.2) + bl.radius + 0.05) {
          const r = results[hand];
          r.blocked = true; r.parry = true; r.itemId = bl.inst.id; r.hand = hand; r.point.copy(_v);
          input.haptic(hand, 0.8, 50);
          I.fx('spark', _v, { count: 14, color: 0x7fe9ff });
          return r;
        }
      }
    }
    return null;
  }

  return { update, blockTest };
}
