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
  // ghost: the world's additive basic (fogged), cloned so its opacity can pulse
  const ghostMat = ctx.art.basic({ color: 0xffd76a, additive: true }).clone();
  ghostMat.opacity = 0.45;
  const ghostGeo = new Map();
  let ghostT = 0;

  // ── A-P2-2 marks: looking ≥ 35° down shows what each slot holds (rings + small shapes, 2 draw calls) ──
  const marks = new THREE.Group();
  marks.name = 'holster-marks';
  marks.visible = false;
  ctx.rig.add(marks);
  const ringMat = ctx.art.basic({ color: 0xffd76a, transparent: true }).clone();
  ringMat.opacity = 0;
  const shapeMat = ctx.art.material({ color: 0xffffff, vertexColors: true, flat: true }).clone();
  shapeMat.transparent = true;
  shapeMat.opacity = 0;
  const ringMesh = new THREE.Mesh(new THREE.BufferGeometry(), ringMat);
  const shapeMesh = new THREE.Mesh(new THREE.BufferGeometry(), shapeMat);
  ringMesh.name = 'holster-rings'; shapeMesh.name = 'holster-shapes';
  ringMesh.frustumCulled = shapeMesh.frustumCulled = false;
  marks.add(ringMesh, shapeMesh);
  let markK = 0;
  // where a mark sits in the body frame (x right, z back): hips a little out and forward so they can be seen
  const MARK_AT = {
    hipR: (H) => [0.30, H * 0.56, -0.06], hipL: (H) => [-0.30, H * 0.56, -0.06],
    chest: (H) => [0, H * 0.74, -0.24], belt: (H) => [0.12, H * 0.56, -0.24],
    backR: (H) => [0.18, H - 0.08 + 0.12, 0.2], backL: (H) => [-0.18, H - 0.08 + 0.12, 0.2],
  };
  const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _bp = new THREE.Vector3();
  const X_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  function mergeInto(target, parts) {
    let n = 0;
    for (const p of parts) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const p of parts) {
      pos.set(p.attributes.position.array, o * 3);
      if (p.attributes.color) col.set(p.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + p.attributes.position.count) * 3);
      o += p.attributes.position.count;
      p.dispose();
    }
    target.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    target.geometry = g;
  }
  function rebuildMarks(list, H) {
    const rings = [], shapes = [];
    for (const [slot, id] of list) {
      const at = MARK_AT[slot](H);
      if (slot === 'backR' || slot === 'backL') {
        // over the shoulder only a small pommel
        const g = new THREE.OctahedronGeometry(0.018, 0);                 // already non-indexed
        g.translate(at[0], at[1], at[2]);
        g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(0).map((_, i) => [1, 0.84, 0.42][i % 3]), 3));
        shapes.push(g);
        continue;
      }
      const ring = new THREE.TorusGeometry(0.035, 0.004, 3, 14).toNonIndexed();
      ring.rotateX(Math.PI / 2);
      ring.translate(at[0], at[1], at[2]);
      rings.push(ring);
      const src = ctx.items?.models?.geometry?.(id);
      if (!src) continue;
      if (!src.boundingBox) src.computeBoundingBox();
      const bb = src.boundingBox;
      const dim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 0.1;
      const k = Math.min(0.35, 0.085 / dim);
      const g = src.clone();
      g.deleteAttribute('normal');
      _bp.set(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, -(bb.max.z + bb.min.z) / 2);
      g.translate(_bp.x, _bp.y, _bp.z);
      _bm.compose(_bp.set(at[0], at[1] + 0.012, at[2]), _bq.copy(X_UP), _bs.setScalar(k));
      g.applyMatrix4(_bm);
      shapes.push(g);
    }
    mergeInto(ringMesh, rings);
    mergeInto(shapeMesh, shapes);
  }
  function slotItem(slot) {
    const inv = ctx.game && !ctx.game.isStub ? ctx.game.inventory : null;
    if (!inv) return SLOT_FALLBACK[slot] || null;
    const id = inv.slots?.[slot];
    if (!id || !(inv.has?.(id))) return null;
    if (inv.out?.has?.(id)) return null;
    return id;
  }
  const lastIds = new Array(SLOT_IDS.length).fill(undefined);
  let lastH = -1, lastModels = false, filled = 0;
  function updateMarks(dt) {
    // which slots are filled — compared without allocating; the meshes are rebuilt only when that changes
    let changed = false;
    filled = 0;
    for (let i = 0; i < SLOT_IDS.length; i++) {
      const id = slotItem(SLOT_IDS[i]);
      if (id) filled++;
      if (id !== lastIds[i]) { lastIds[i] = id; changed = true; }
    }
    const H = Math.round(P.standHeight * 50) / 50;
    const hasModels = !!ctx.items?.models;
    if (H !== lastH || hasModels !== lastModels) { lastH = H; lastModels = hasModels; changed = true; }
    if (changed) rebuildMarks(SLOT_IDS.map((s, i) => [s, lastIds[i]]).filter((e) => e[1]), H);
    const down = -input.head.pitch > 35 * Math.PI / 180 || -pitchLocal() > 35 * Math.PI / 180;
    const want = down && filled > 0 && P.enabled ? 1 : 0;
    markK += (want - markK) * Math.min(1, (dt || 0.016) / 0.25 * 3);
    if (want === 0 && markK < 0.02) markK = 0;
    marks.visible = markK > 0.01;
    if (!marks.visible) return;
    ringMat.opacity = 0.55 * markK;
    shapeMat.opacity = markK;
    const yaw = bodyYaw ?? 0;
    marks.position.set(input.head.localPos.x, 0, input.head.localPos.z);
    marks.rotation.set(0, -yaw, 0);
    marks.scale.set(0.85 + 0.15 * markK, Math.min(1, P.headHeight / Math.max(0.5, P.standHeight)), 0.85 + 0.15 * markK);
  }
  const _pv = new THREE.Vector3();
  function pitchLocal() { _pv.set(0, 0, -1).applyQuaternion(input.head.localQuat); return Math.asin(Math.max(-1, Math.min(1, _pv.y))); }

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
    updateMarks(dt);
  }

  return {
    slotPos, slotLocal, handIn, contentOf, update, inZone,
    get bodyYaw() { return bodyYaw ?? 0; },
    marks,
    /** world yaw of the body frame */
    get bodyYawWorld() { return wrapPi((bodyYaw ?? 0) + P.turnYaw); },
  };
}
