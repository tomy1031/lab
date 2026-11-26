// js/player/grab.js — what a hand takes when it closes, and where things go when it opens (§3.1, §4.3), OPUS-A.
// Close (grip / pinch): quiver arrow (other hand holds the bow) > holster slot > waybell on the left wrist >
// world item within 0.25 m > pull a world item within 2.5 m along the aim ray.
// Open: in a holster zone → stow (slot or bag), else drop / throw with the release velocity
// (mean hand velocity of the last 80 ms × 1.3 + the player's own velocity, §10.9).
import * as THREE from 'three';
import { SLOT_FALLBACK, HAPTIC, THROW_WINDOW, THROW_MUL } from '../core/config.js';
const HANDS = ['left', 'right'];

const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3();

export function createGrab(ctx, P, holsters, climb = null) {
  const input = ctx.input;
  const toggled = { left: false, right: false };

  const inv = () => (ctx.game && !ctx.game.isStub ? ctx.game.inventory : null);
  const other = (h) => (h === 'left' ? 'right' : 'left');

  /** the inside of the left wrist (where the waybell hangs) */
  function wristPoint(out) {
    const l = input.hands.left;
    return out.set(0, 0.075, 0.01).applyQuaternion(l.quat).add(l.pos);
  }
  /** near either shoulder, behind the head (quiver), even outside the exact holster sphere */
  function nearShoulder(hand) {
    const s = holsters.handIn(hand);
    if (s === 'backR' || s === 'backL') return true;
    const hd = input.hands[hand];
    holsters.slotLocal(hand === 'left' ? 'backL' : 'backR', _v);
    return _v.distanceTo(hd.localPos) < 0.24 || hd.localPos.y > input.head.localPos.y - 0.02 && behindHead(hd);
  }
  function behindHead(hd) {
    const yaw = holsters.bodyYaw;
    const bx = -Math.sin(yaw), bz = Math.cos(yaw);
    return (hd.localPos.x - input.head.localPos.x) * bx + (hd.localPos.z - input.head.localPos.z) * bz > 0.02;
  }

  function tryGrab(hand) {
    const items = ctx.items;
    if (!items || items.isStub || items.held[hand]) return false;
    const hd = input.hands[hand];
    const oh = items.held[other(hand)];
    const I = inv();
    // 1. arrow from the quiver while the other hand holds the bow
    if (oh && oh.id === 'bow' && nearShoulder(hand)) {
      const id = I ? I.take('quiver') : 'arrow';
      if (id) { items.createInHand(id, hand, 'holster', 'quiver'); input.haptic(hand, HAPTIC.grab[0], HAPTIC.grab[1]); return true; }
      input.haptic(hand, 0.1, 10);
      ctx.events.emit('ui:toast', { text: '矢がない', sub: 'NO ARROWS', kind: 'warn', ms: 1500 });
      return false;
    }
    // 2. a holster
    const slot = holsters.handIn(hand);
    if (slot) {
      let id = null;
      if (I) id = I.take(slot);
      else id = SLOT_FALLBACK[slot] || null;
      if (id && items.defs[id]) {
        items.createInHand(id, hand, 'holster', slot);
        input.haptic(hand, HAPTIC.grab[0], HAPTIC.grab[1]);
        return true;
      }
      if (id && I) I.stow?.(slot, id, {});   // unknown item: give it back
    }
    // 3. the waybell hanging over the left wrist
    if (hand === 'right' && input.hands.left.tracked && hd.pos.distanceTo(wristPoint(_w)) < 0.13) {
      const owns = I ? I.has('waybell') : true;
      if (owns && !items.isHeld('waybell')) {
        items.createInHand('waybell', hand, 'holster', 'wrist');
        input.haptic(hand, HAPTIC.grab[0], HAPTIC.grab[1]);
        return true;
      }
    }
    // 4. a climbing surface (DESIGN_V2 §2): the hand locks to the wall
    if (climb && climb.tryGrip(hand)) return true;
    // 5. something within reach
    const near = items.nearestGrabbable(hd.pos, 0.25);
    if (near) { items.grabWorld(near, hand); input.haptic(hand, HAPTIC.grab[0], HAPTIC.grab[1]); return true; }
    // 6. pull something the hand points at (desktop: what the reticle looks at)
    if (ctx.flags.xr) {
      _o.copy(hd.aimPos);
      _d.set(0, 0, -1).applyQuaternion(hd.aimQuat);
    } else {
      _o.copy(input.head.pos);
      _d.set(0, 0, -1).applyQuaternion(input.head.quat);
    }
    const far = items.rayGrabbable(_o, _d, 2.5, 14);
    if (far) { items.pull(far, hand); input.haptic(hand, 0.25, 20); return true; }
    return false;
  }

  function release(hand) {
    if (climb && climb.release(hand)) return;          // let go of the wall
    const items = ctx.items;
    if (!items || items.isStub) return;
    const inst = items.held[hand];
    if (!inst) { items.cancelPull?.(hand); return; }
    if (items.onRelease?.(hand)) return;           // the item used the release itself (bow string)
    const slot = holsters.handIn(hand);
    if (inst.id === 'arrow' && nearShoulder(hand)) {
      if (items.stow(hand, 'quiver')) return;
    } else if (slot) {
      if (items.stow(hand, slot)) { input.haptic(hand, 0.2, 15); return; }
    }
    input.handVelocityAvg(hand, THROW_WINDOW, _v).multiplyScalar(THROW_MUL);
    _v.x += P.vel.x; _v.z += P.vel.z;
    if (!P.grounded) _v.y += P.vel.y;
    items.drop(hand, _v);
  }

  // Gear stays in the hand (playtest: 「剣が拾っても手に入らないし、落ちたら消えてしまいます」): weapons and tools
  // that live in a holster are not dropped when the grip is let go. Letting go at a holster stows them; anywhere
  // else they stick. To drop or throw stuck gear, squeeze the grip again and let go (the release carries the
  // hand's swing, so a throw still works). Food, stones, bombs and arrows keep plain hold-to-hold.
  const stuck = { left: false, right: false }, armed = { left: false, right: false };
  const isGear = (inst) => !!(inst && inst.def && inst.def.stack === 1 && Array.isArray(inst.def.slots) && inst.def.slots.length > 0);

  function update(dt) {
    if (dt <= 0 || !P.enabled) return;
    const toggle = ctx.settings.get('gripToggle');
    const sticky = ctx.settings.get('stickyGear') !== false;
    for (const hand of HANDS) {
      const g = hand === 'left' ? 'gripL' : 'gripR';
      const held = ctx.items?.held?.[hand];
      if (!held) { stuck[hand] = false; armed[hand] = false; }
      if (toggle) {
        if (input.justPressed(g)) {
          if (held || climb?.isHolding(hand)) release(hand); else toggled[hand] = tryGrab(hand);
        }
      } else if (input.justPressed(g)) {
        if (!held) tryGrab(hand);
        else if (stuck[hand]) armed[hand] = true;       // the next let-go drops, throws or stows it
      } else if (input.justReleased(g)) {
        if (held && sticky && isGear(held) && !armed[hand] && !holsters.handIn(hand)) {
          if (!stuck[hand]) { stuck[hand] = true; ctx.events.emit('item:stick', { hand, itemId: held.id }); }
        } else {
          stuck[hand] = false; armed[hand] = false;
          release(hand);
        }
      }
    }
  }

  // ── affordances: the waybell hanging at the left wrist, and a glow on what a VR hand would pull ──
  let bell = null;
  const aimGlow = { left: null, right: null };
  let aimT = 0;
  function updateAffordances(dt) {
    const items = ctx.items;
    if (!items || items.isStub) return;
    // waybell at the wrist (owned and not in a hand)
    const I = inv();
    const owns = I ? I.has?.('waybell') : true;
    const show = owns && !items.isHeld('waybell') && input.hands.left.tracked;
    if (show && !bell) {
      bell = items.makeModel('waybell');
      bell.name = 'wrist-waybell';
      bell.scale.setScalar(0.42);
      bell.userData.onAnchor = false;
      input.hands.left.object3D.add(bell);
    }
    if (bell) {
      bell.visible = !!show;
      // small, on the palm side of the left cuff (follows the wrist of the skinned hand once it is there)
      const anchor = input.hands.left.object3D.getObjectByName('wrist-anchor');
      if (anchor && !bell.userData.onAnchor) {
        anchor.add(bell);
        bell.userData.onAnchor = true;
        bell.position.set(0.0, -0.036, 0.028);
        bell.rotation.set(-0.5, 0, Math.PI);
      } else if (!anchor && !bell.userData.placed) {
        bell.userData.placed = true;
        bell.position.set(-0.035, 0.085, 0.01);
        bell.rotation.set(Math.PI / 2, 0, 0);
      }
    }
    // distance-grab highlight (VR only; the PC preview uses the reticle)
    aimT -= dt;
    if (aimT > 0) return;
    aimT = 0.1;
    for (const hand of HANDS) {
      let target = null;
      const hd = input.hands[hand];
      if (ctx.flags.xr && hd.tracked && !items.held[hand] && !items.pulling?.[hand] && !holsters.handIn(hand) && !items.nearestGrabbable(hd.pos, 0.25)) {
        _d.set(0, 0, -1).applyQuaternion(hd.aimQuat);
        target = items.rayGrabbable(hd.aimPos, _d, 2.5, 14);
      }
      let g = aimGlow[hand];
      if (target && !g) {
        g = aimGlow[hand] = ctx.art.glow({ color: 0xffd76a, size: 0.16, opacity: 0.8 });
        g.name = 'grab-aim-' + hand;
        ctx.scene.add(g);
      }
      if (g) {
        g.visible = !!target;
        if (target) g.position.copy(target.pos);
      }
    }
  }

  // ── item:hover — what a hand would take if it closed now (name labels, §10.6), debounced ──
  // VR: the same order as tryGrab (quiver arrow > holster slot > waybell at the wrist > world item in reach,
  // 0.25 m to enter, 0.32 m to stay). PC: the right hand reports what E would take (near the feet, else what
  // the reticle looks at). A new target must hold for 0.12 s, a leave for 0.22 s (0 when the hand took it).
  const mkHover = () => ({ id: null, uid: 0, source: null, slot: null, pid: null, puid: 0, psrc: null, pslot: null, pt: 0 });
  const hov = { left: mkHover(), right: mkHover() };
  const cand = { id: null, uid: 0, source: null, slot: null };
  function setCand(id, uid, source, slot) { cand.id = id; cand.uid = uid; cand.source = source; cand.slot = slot; }
  function hoverCandidate(hand) {
    setCand(null, 0, null, null);
    const items = ctx.items;
    if (!items || items.isStub || items.held[hand] || items.pulling?.[hand]) return;
    const hd = input.hands[hand];
    const H = hov[hand];
    if (!ctx.flags.xr) {
      if (hand !== 'right') return;
      let t = items.nearestGrabbable(input.head.pos, 1.5, true);
      if (!t) {
        _d.set(0, 0, -1).applyQuaternion(input.head.quat);
        t = items.rayGrabbable(input.head.pos, _d, 2.5, 14);
      }
      if (t) setCand(t.id, t.uid, 'world', null);
      return;
    }
    if (!hd.tracked) return;
    const I = inv();
    const oh = items.held[other(hand)];
    if (oh && oh.id === 'bow' && nearShoulder(hand)) {
      if (!I || I.has?.('arrow')) setCand('arrow', 0, 'holster', 'quiver');
      return;
    }
    const slot = holsters.handIn(hand);
    if (slot) {
      const id = holsters.contentOf(slot, hand);
      if (id) { setCand(id, 0, 'holster', slot); return; }
    }
    if (hand === 'right' && input.hands.left.tracked && hd.pos.distanceTo(wristPoint(_w)) < 0.13 && !items.isHeld('waybell') && (!I || I.has?.('waybell'))) {
      setCand('waybell', 0, 'holster', 'wrist');
      return;
    }
    let t = items.nearestGrabbable(hd.pos, 0.25);
    if (!t && H.source === 'world') {                      // hysteresis: keep the current one a little longer
      const t2 = items.nearestGrabbable(hd.pos, 0.32);
      if (t2 && t2.uid === H.uid) t = t2;
    }
    if (t) setCand(t.id, t.uid, 'world', null);
  }
  function updateHover(dt) {
    for (const hand of HANDS) {
      const H = hov[hand];
      hoverCandidate(hand);
      if (cand.id === H.id && cand.uid === H.uid && cand.source === H.source && cand.slot === H.slot) { H.pt = 0; H.pid = H.id; H.puid = H.uid; H.psrc = H.source; H.pslot = H.slot; continue; }
      if (cand.id !== H.pid || cand.uid !== H.puid || cand.source !== H.psrc || cand.slot !== H.pslot) {
        H.pid = cand.id; H.puid = cand.uid; H.psrc = cand.source; H.pslot = cand.slot; H.pt = 0;
      }
      H.pt += dt;
      const took = !!ctx.items?.held?.[hand];
      if (!took && H.pt < (cand.id ? 0.12 : 0.22)) continue;
      // a change of target is a leave of the old one (if any) and an enter of the new one
      const leave = H.id ? { hand, itemId: null, source: H.source, uid: H.uid || null, slot: H.slot } : null;
      H.id = cand.id; H.uid = cand.uid; H.source = cand.source; H.slot = cand.slot; H.pt = 0;
      if (leave) ctx.events.emit('item:hover', leave);
      if (cand.id) ctx.events.emit('item:hover', { hand, itemId: cand.id, source: cand.source, uid: cand.uid || null, slot: cand.slot });
    }
  }

  return { update(dt) { update(dt); updateAffordances(dt); if (dt > 0 && P.enabled) updateHover(dt); }, tryGrab, release, wristPoint, hover: hov };
}
