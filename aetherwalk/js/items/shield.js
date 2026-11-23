// js/items/shield.js — blocking (§5.3, DESIGN_V2 §4), OPUS-A. blockTest(shape, fromPos) is called by OPUS-B when
// an enemy attack would hit: a raised shield facing within ±60° of the attacker blocks it. Pushed toward the attack
// at ≥ 1.5 m/s within the last 0.25 s it's a parry; within the last 0.12 s (0.2 with parryWindow 'wide' or seated)
// it's a PERFECT parry: a gold ring and flash at the shield, 0.3 s of slow motion (ctx.slowmo), a two-beat pulse.
// A heavy attack (shape.heavy, set by the game) taken in a passive guard is a GUARD BREAK: the shield is knocked
// aside and dulled and blocks nothing for 0.8 s (the game applies half damage). A weapon moving ≥ 2 m/s that
// touches a 'sphere' shot knocks it back (parry).
// Returns { blocked, parry, perfect, guardBreak, pushAgo, itemId, hand, point } or null (a reused object).
import * as THREE from 'three';
import { clamp } from '../core/util.js';
const HANDS = ['left', 'right'];

const _n = new THREE.Vector3(), _c = new THREE.Vector3(), _to = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _kq = new THREE.Quaternion(), _kz = new THREE.Vector3(0, 0, 1);
const BREAK_TIME = 0.8;

export function createShield(ctx, I, melee) {
  const input = ctx.input;
  // per hand: last time the shield face was pushed outward fast; guard broken until; a synthetic push (tests)
  const push = { left: { t: -10, dir: new THREE.Vector3() }, right: { t: -10, dir: new THREE.Vector3() } };
  const broken = { left: { until: -10, inst: null, mats: null }, right: { until: -10, inst: null, mats: null } };
  const mk = () => ({ blocked: true, parry: false, perfect: false, guardBreak: false, pushAgo: -1, itemId: '', hand: '', point: new THREE.Vector3() });
  const results = { left: mk(), right: mk() };
  let debugKind = null;
  // the dulled look of a knocked-aside shield (same shaders as the item's own materials: no new program)
  let dimMats = null;
  const dim = () => dimMats || (dimMats = [
    ctx.art.material({ color: 0x6d6a66, vertexColors: true, flat: false, rim: 0.12, spec: 0.05, gloss: 12 }),
    ctx.art.material({ color: 0x6d6a66, vertexColors: true, flat: false, rim: 0.12, spec: 0.2, gloss: 56 }),
  ]);

  /** DESIGN_V2 §4.1: the perfect window (s) */
  function perfectWindow() {
    const s = ctx.settings;
    return s.get('parryWindow') === 'wide' || s.get('seated') ? 0.2 : 0.12;
  }

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
      const br = broken[hand];
      // a broken guard: knocked outward about the handle, then back; dull until it recovers
      if (br.inst) {
        const t = now - (br.until - BREAK_TIME);
        if (br.inst !== inst || t >= BREAK_TIME || t < 0) {
          if (br.mats) br.inst.mesh.material = br.mats;
          br.inst.object3D.quaternion.copy(br.inst.holdQuat);
          br.inst = null; br.mats = null;
        } else {
          const k = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / (BREAK_TIME - 0.1);
          _kq.setFromAxisAngle(_kz, (hand === 'left' ? -1 : 1) * 0.75 * k * k * (3 - 2 * k));
          br.inst.object3D.quaternion.copy(br.inst.holdQuat).multiply(_kq);
        }
      }
      if (!inst || !inst.def.block) continue;
      shieldFrame(inst, hand, _c, _n);
      const v = input.hands[hand].vel;
      const outward = v.dot(_n);
      if (outward >= inst.def.block.parrySpeed) { push[hand].t = now; push[hand].dir.copy(v).normalize(); }
    }
  }

  function breakGuard(hand, inst) {
    const br = broken[hand];
    br.until = ctx.clock.time + BREAK_TIME;
    if (!br.inst) { br.mats = inst.mesh.material; inst.mesh.material = dim(); }
    br.inst = inst;
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
    const synth = debugKind;
    for (const hand of HANDS) {
      const inst = I.held[hand];
      if (!inst || !inst.def.block) continue;
      if (now < broken[hand].until) continue;                 // knocked aside: no guard for 0.8 s
      const b = inst.def.block;
      shieldFrame(inst, hand, _c, _n);
      _to.copy(src).sub(_c);
      if (shape.kind !== 'sphere') _to.y *= 0.3;           // ground slams / sweeps: mostly about facing
      if (_to.lengthSq() < 1e-6) continue;
      _to.normalize();
      if (!synth) {
        // raised: in front of the body, roughly between hip and head, facing the attacker
        const hy = _c.y - (P?.pos?.y ?? 0);
        if (hy < 0.55 * (P?.standHeight || 1.6) || _c.distanceTo(chest) > 0.85) continue;
        if (_n.dot(_to) < Math.cos((b.arc * Math.PI) / 180)) continue;
      } else {
        // AW.debug.parry(kind): a push timed to this attack
        debugKind = null;
        if (synth === 'perfect') { push[hand].t = now - 0.04; push[hand].dir.copy(_to); }
        else if (synth === 'normal') { push[hand].t = now - 0.2; push[hand].dir.copy(_to); }
        else push[hand].t = -10;
      }
      const r = results[hand];
      const ago = now - push[hand].t;
      const toward = push[hand].dir.dot(_to) > 0.3;
      r.blocked = true;
      r.parry = ago <= b.parryWindow && toward;
      r.perfect = r.parry && ago <= perfectWindow();
      r.guardBreak = !r.parry && !!shape.heavy;
      r.pushAgo = r.parry ? +ago.toFixed(3) : -1;
      r.itemId = inst.id; r.hand = hand;
      r.point.copy(_c);
      if (r.perfect) {
        // ジャスト受け: gold ring + cross flash in front of the shield, sparks, slow motion, a two-beat pulse
        _v.copy(_n).multiplyScalar(0.12).add(_c);
        I.fx('ring', _v, { color: 0xffd76a, size: 0.55 });
        I.flash(_v, { color: 0xfff1c0, size: 0.7, intensity: 1.4, life: 0.22 });
        I.fx('spark', _v, { count: 22, color: 0xffd76a, speed: 4 });
        ctx.slowmo?.(0.3, 0.3);
        input.haptic(hand, 1.0, 60);
        setTimeout(() => input.haptic(hand, 0.6, 40), 100);
      } else if (r.parry) {
        input.haptic(hand, 1.0, 60);
        I.fx('spark', _c, { count: 20, color: 0x7fe9ff });
      } else if (r.guardBreak) {
        breakGuard(hand, inst);
        input.haptic(hand, 0.7, 200);
        I.fx('spark', _c, { count: 8, color: 0xb8b2a6, speed: 2 });
      } else {
        input.haptic(hand, 0.7, 40);
        I.fx('spark', _c, { count: 10, color: 0xffd76a });
      }
      return r;
    }
    if (synth) debugKind = null;
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
          r.blocked = true; r.parry = true; r.perfect = false; r.guardBreak = false; r.pushAgo = -1;
          r.itemId = bl.inst.id; r.hand = hand; r.point.copy(_v);
          input.haptic(hand, 0.8, 50);
          I.fx('spark', _v, { count: 14, color: 0x7fe9ff });
          return r;
        }
      }
    }
    return null;
  }

  return {
    update, blockTest,
    /** AW.debug.parry: the next blockTest pushes the shield 'perfect' (0.04 s before) | 'normal' (0.2 s) | 'late' (none) */
    armDebug(kind = 'perfect') { debugKind = kind; return true; },
    isBroken: (hand) => ctx.clock.time < broken[hand].until,
  };
}
