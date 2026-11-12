// js/items/bow.js — the two-handed bow (§4.1), OPUS-A.
// One hand holds the bow (limbs along the grip's Z, arrow flies along the grip's -Y); the other takes an arrow
// over the shoulder (grab.js), brings its nock to the string (≤ 12 cm) and pulls straight back. The string
// follows the drawing hand; draw = (pull − 0.15) / (0.6 − 0.15). Opening the drawing hand looses the arrow at
// 18 + 30·draw m/s for 4 + 6·draw damage (fire arrows +3). Haptic ticks while drawing.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
const HANDS = ['left', 'right'];

const _n = new THREE.Vector3(), _dir = new THREE.Vector3(), _rest = new THREE.Vector3(), _pull = new THREE.Vector3();
const _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _mid = new THREE.Vector3();
const NEG_Z = new THREE.Vector3(0, 0, -1);

export function createBow(ctx, I) {
  const input = ctx.input;
  const st = {
    left: { nocked: false, draw: 0, tick: 0, nock: new THREE.Vector3(), dir: new THREE.Vector3(), info: null },
    right: { nocked: false, draw: 0, tick: 0, nock: new THREE.Vector3(), dir: new THREE.Vector3(), info: null },
  };
  const lineMat = new THREE.LineBasicMaterial({ color: 0xfffbe8, fog: false });

  function ensureString(inst) {
    if (inst.fx.string) return inst.fx.string;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3).setUsage(THREE.DynamicDrawUsage));
    const line = new THREE.Line(g, lineMat);
    line.frustumCulled = false;
    line.name = 'bowstring';
    inst.object3D.add(line);
    inst.fx.string = line;
    setString(inst, null);
    return line;
  }
  /** string through the tips and a middle point (world, or null = at rest) — written in item space */
  function setString(inst, midWorld) {
    const b = inst.def.bow;
    const p = inst.fx.string.geometry.attributes.position;
    const arr = p.array;
    arr[0] = 0; arr[1] = b.nockY; arr[2] = -b.limb;
    arr[6] = 0; arr[7] = b.nockY; arr[8] = b.limb;
    if (midWorld) {
      // world → item space (the string group is a direct child of the item's object3D)
      _m.compose(inst.pos, inst.quat, _a.set(1, 1, 1));
      _inv.copy(_m).invert();
      _mid.copy(midWorld).applyMatrix4(_inv);
      arr[3] = _mid.x; arr[4] = _mid.y; arr[5] = _mid.z;
    } else { arr[3] = 0; arr[4] = b.nockY; arr[5] = 0; }
    p.needsUpdate = true;
  }

  function update(dt) {
    for (const bowHand of HANDS) {
      const S = st[bowHand];
      const inst = I.held[bowHand];
      if (!inst || inst.id !== 'bow') { S.nocked = false; S.draw = 0; S.info = null; continue; }
      ensureString(inst);
      const b = inst.def.bow;
      const drawHand = I.otherHand(bowHand);
      I.toWorld(inst, 0, b.nockY, 0, S.nock);                   // string at rest
      S.dir.set(0, -1, 0).applyQuaternion(inst.quat);           // where arrows fly
      I.toWorld(inst, 0, -0.06, 0, _rest);                      // arrow rest on the grip
      S.info = S.info || { nock: S.nock, dir: S.dir, draw: 0, nocked: false };
      const arrow = I.held[drawHand];
      const isArrow = !!arrow && arrow.id === 'arrow';
      if (!isArrow) S.nocked = false;
      else if (!S.nocked && arrow.pos.distanceTo(S.nock) <= 0.12) {
        S.nocked = true; S.tick = 0;
        input.haptic(drawHand, 0.35, 20); input.haptic(bowHand, 0.25, 20);
        ctx.events.emit('item:use', { itemId: 'bow', action: 'nock', hand: drawHand });
      }
      if (S.nocked) {
        const hp = input.hands[drawHand].pos;
        _pull.copy(hp).sub(S.nock);
        const back = -_pull.dot(S.dir);
        _a.copy(_pull).addScaledVector(S.dir, back);            // off-axis part
        if (_a.length() > 0.3 || back < -0.15) { S.nocked = false; S.draw = 0; }
        else {
          const d = clamp(back, 0, 0.75);
          S.draw = clamp((d - b.minDraw) / (b.maxDraw - b.minDraw), 0, 1);
          // arrow lies from the hand through the rest
          _n.copy(_rest).sub(hp);
          if (_n.lengthSq() > 1e-6) {
            _n.normalize();
            _q.setFromUnitVectors(NEG_Z, _n);
            _q2.copy(input.hands[drawHand].quat).invert().multiply(_q);
            arrow.holdQuat.copy(_q2); arrow.holdPos.set(0, 0, 0);
            arrow.object3D.quaternion.copy(_q2); arrow.object3D.position.set(0, 0, 0);
            arrow.quat.copy(_q);
          }
          setString(inst, d > 0.02 ? hp : null);
          // ticks as the string comes back
          const k = Math.floor(S.draw * 8);
          if (k > S.tick) { S.tick = k; input.haptic(drawHand, 0.06 + S.draw * 0.12, 12); input.haptic(bowHand, 0.04 + S.draw * 0.08, 12); }
          else if (k < S.tick) S.tick = k;
        }
      }
      if (!S.nocked) {
        setString(inst, null);
        if (isArrow && arrow.holdQuat.w !== 1) { arrow.holdQuat.identity(); arrow.object3D.quaternion.identity(); }
      }
      inst.state.draw = S.draw;
      if (isArrow) arrow.state.draw = S.draw;
      S.info.draw = S.draw; S.info.nocked = S.nocked;
    }
  }

  /** the drawing hand opened: loose the arrow (true = handled) */
  function onRelease(hand) {
    const bowHand = I.otherHand(hand);
    const S = st[bowHand];
    const bowInst = I.held[bowHand];
    const arrow = I.held[hand];
    if (!bowInst || bowInst.id !== 'bow' || !arrow || arrow.id !== 'arrow' || !S.nocked) return false;
    const b = bowInst.def.bow;
    const hp = input.hands[hand].pos;
    const back = -_pull.copy(hp).sub(S.nock).dot(S.dir);
    S.nocked = false;
    if (back < b.minDraw * 0.6) return false;                  // barely drawn: just let go
    const draw = S.draw;
    const speed = b.speedBase + b.speedDraw * draw;
    _dir.copy(_rest).sub(hp).normalize();
    const ad = arrow.def.arrow;
    const damage = (ad.damage + ad.damageDraw * draw) * I.damageMul();
    I.proj.launchArrow(arrow, _dir, speed, damage, hand);
    setString(bowInst, null);
    bowInst.state.draw = 0;
    S.draw = 0;
    input.haptic(hand, 0.5 + draw * 0.4, 40);
    input.haptic(bowHand, 0.4 + draw * 0.4, 60);
    return true;
  }

  return {
    update, onRelease,
    info(hand) { const s = st[hand]; return s && I.held[hand]?.id === 'bow' ? s.info : null; },
    drawCalls() { let n = 0; for (const h of HANDS) if (I.held[h]?.id === 'bow') n++; return n; },
  };
}
