// js/player/holsters.js — body holsters (§4.3), OPUS-A.
// Body frame: origin = floor under the head, +X right, +Z back, yaw = head yaw smoothed τ=0.4 s (looking
// around doesn't swing the holsters), heights scale down with the head when ducking.
// A hand entering a zone: the slot's content glows (ghost of its model) + a light tick of haptics.
import * as THREE from 'three';
import { HOLSTERS, SLOT_IDS, SLOT_FALLBACK, HAPTIC } from '../core/config.js';
import { ema, wrapPi, yawOfQuat } from '../core/util.js';
const HANDS = ['left', 'right'];

const _p = new THREE.Vector3();

export function createHolsters(ctx, P) {
  const input = ctx.input;
  let bodyYaw = null;                  // rig-local yaw
  const inZone = { left: null, right: null };
  const ghost = { left: null, right: null };
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.45, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false });
  const ghostGeo = new Map();
  let ghostT = 0;

  /** slot centre in rig-local space */
  function slotLocal(slot, out) {
    const h = HOLSTERS[slot];
    if (!h) return out.copy(input.head.localPos);
    const H = P.standHeight;
    const k = P.headHeight / Math.max(0.5, H);          // ducking lowers everything with the head
    const y = h.y(H) * Math.min(1, k);
    const yaw = bodyYaw ?? 0;
    const rx = Math.cos(yaw), rz = Math.sin(yaw);        // right
    const bx = -Math.sin(yaw), bz = Math.cos(yaw);       // back
    return out.set(input.head.localPos.x + rx * h.x + bx * h.z, y, input.head.localPos.z + rz * h.x + bz * h.z);
  }
  function slotPos(slot, out = new THREE.Vector3()) {
    slotLocal(slot, out);
    return out.applyMatrix4(ctx.rig.matrixWorld);
  }
  /** nearest holster zone that contains the hand's grip point (rig-local), or null */
  function handIn(hand) {
    const hd = input.hands[hand];
    if (!hd || !hd.tracked) return null;
    let best = null, bestD = Infinity;
    for (const slot of SLOT_IDS) {
      slotLocal(slot, _p);
      const d = _p.distanceTo(hd.localPos);
      const r = HOLSTERS[slot].r * (ctx.flags.xr ? 1 : 1.35);
      if (d <= r && d < bestD) { best = slot; bestD = d; }
    }
    return best;
  }
  /** what a slot would hand out right now (for the glow), null if nothing */
  function contentOf(slot, hand) {
    const other = hand === 'left' ? 'right' : 'left';
    const otherItem = ctx.items?.held?.[other];
    if ((slot === 'backR' || slot === 'backL') && otherItem && otherItem.id === 'bow') {
      const inv = ctx.game?.inventory;
      if (!inv || ctx.game.isStub || inv.has?.('arrow')) return 'arrow';
    }
    const inv = ctx.game?.inventory;
    if (!inv || ctx.game.isStub) return SLOT_FALLBACK[slot] || null;
    const id = inv.slots?.[slot] || null;
    if (!id) return null;
    if (inv.out && inv.out.has && inv.out.has(id)) return null;
    return inv.has?.(id) ? id : null;
  }

  function showGhost(hand, slot) {
    let g = ghost[hand];
    const id = slot ? contentOf(slot, hand) : null;
    if (!id || ctx.items?.held?.[hand]) { if (g) g.visible = false; return; }
    if (!g) {
      g = new THREE.Mesh(undefined, ghostMat);
      g.name = 'holster-ghost-' + hand;
      g.renderOrder = 5;
      ctx.rig.add(g);
      ghost[hand] = g;
    }
    if (g.userData.id !== id) {
      let geo = ghostGeo.get(id);
      if (!geo) {
        const model = ctx.items?.makeModel?.(id);
        model?.traverse?.((o) => { if (!geo && o.isMesh && o.geometry) geo = o.geometry; });
        if (geo) ghostGeo.set(id, geo);
      }
      if (!geo) { g.visible = false; return; }
      g.geometry = geo;
      g.userData.id = id;
    }
    slotLocal(slot, g.position);
    const yaw = bodyYaw ?? 0;
    g.rotation.set(0, -yaw, 0);
    // stand long things upright over the shoulders, food / throwables just float
    if (slot === 'backR' || slot === 'backL') g.rotation.x = -0.25;
    else if (slot === 'hipR' || slot === 'hipL') g.rotation.x = 0.35;
    g.scale.setScalar(1.06);
    g.visible = true;
  }

  function update(dt) {
    const want = yawOfQuat(input.head.localQuat);
    if (bodyYaw == null) bodyYaw = want;
    if (dt > 0) bodyYaw = wrapPi(bodyYaw + wrapPi(want - bodyYaw) * ema(0.4, dt));
    P.bodyYawLocal = bodyYaw;
    ghostT += dt || 0;
    ghostMat.opacity = 0.35 + 0.15 * Math.sin(ghostT * 6);
    for (const hand of HANDS) {
      const slot = P.enabled ? handIn(hand) : null;
      if (slot !== inZone[hand]) {
        if (slot) input.haptic(hand, HAPTIC.zone[0], HAPTIC.zone[1]);
        inZone[hand] = slot;
      }
      showGhost(hand, slot);
    }
  }

  return {
    slotPos, slotLocal, handIn, contentOf, update, inZone,
    get bodyYaw() { return bodyYaw ?? 0; },
    /** world yaw of the body frame */
    get bodyYawWorld() { return wrapPi((bodyYaw ?? 0) + P.turnYaw); },
  };
}
