// js/player/hands.js — the player's hands: one low-poly glove per hand (one draw call each), fingers curled on
// the CPU from the grip value (closed around whatever is held). Grip space (WebXR): -Z along a held rod
// (thumb side), +X back of the right hand (-X for the left), +Y toward the elbow.
import * as THREE from 'three';
import { GeoBuilder, flatNormals } from '../core/geo.js';
import { getGems, getSprites, createAttached } from '../core/gems.js';
import { loadHandData, createHandRig } from './handrig.js';
import { ema } from '../core/util.js';
const HANDS = ['left', 'right'];

const CREAM = 0xf4ecd8, PAD = 0xe2d6b8, SEAM = 0xc9b48a, GOLD = 0xffd76a;
const R4 = Math.PI / 4;
// unit square prism along Y (side 1), the far end (−Y) scaled by `tip`
const sq = (tip = 1) => new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * tip, 1, 4, 1).rotateY(R4);

/** A-P2-1: chamfered back plate, two finger segments cut by grooves (tips taper to 0.8), a tapered
 *  six-sided thumb, a flared eight-sided cuff. One geometry (≤ 320 triangles); tags 1/2 = finger joints. */
function gloveGeometry(s) {
  const b = new GeoBuilder();
  b.tag = 0;
  // back of the hand: octagon 0.085 (Z) × 0.095 (Y), 0.032 thick in two layers (back cream, palm pad)
  const h = 0.0475, w = 0.0425, c = 0.012, y0 = 0.012;
  const oct = [[h, w - c], [h, -(w - c)], [h - c, -w], [-(h - c), -w], [-h, -(w - c)], [-h, w - c], [-(h - c), w], [h - c, w]]
    .map(([y, z]) => [y + y0, z]);
  b.prismYZ(oct, s * 0.034, s * 0.056, CREAM);
  b.prismYZ(oct, s * 0.024, s * 0.034, PAD);
  b.box(0.003, 0.004, 0.074, SEAM, [s * 0.0565, -0.026, 0]);                       // seam over the knuckles
  b.box(0.003, 0.05, 0.004, SEAM, [s * 0.0565, 0.02, 0]);                           // seam down the back
  b.cyl(0.012, 0.009, 0.055, 6, PAD, [s * 0.014, -0.006, -0.052], [0.35, 0, s * 0.2]);   // thumb
  // cuff: flares toward the elbow (+Y)
  b.cyl(0.046, 0.036, 0.05, 8, GOLD, [s * 0.034, 0.083, 0], [0, R4 / 2, 0]);
  // fingers: a pad block (palm side) + four ridges on the back with 4 mm grooves between them
  const zs = [-0.0285, -0.0095, 0.0095, 0.0285];
  b.tag = 1;
  b.add(sq(), PAD, [s * 0.036, -0.058, 0], [0, 0, 0], [0.016, 0.046, 0.078]);
  for (const z of zs) b.box(0.006, 0.044, 0.016, CREAM, [s * 0.047, -0.058, z]);
  b.tag = 2;
  b.add(sq(0.8), PAD, [s * 0.036, -0.1, 0.001], [0, 0, 0], [0.015, 0.04, 0.074]);
  for (const z of zs) b.add(sq(0.8), CREAM, [s * 0.046, -0.1, z * 0.94], [0, 0, 0], [0.006, 0.038, 0.015]);
  return b.build({ tags: true });
}

// ── the gold cuff (wrist joint frame: −Z toward the fingers, +Z up the forearm, +Y back of the hand) ──
function cuffGeometry() {
  // a flared elliptical band, rolled lip at the open end, smooth; vertex colours: polished edges, softer middle
  const seg = 16, rings = [
    // z, rx, ry, colour k (1 = bright edge)
    [-0.004, 0.0335, 0.0255, 1], [0.004, 0.0348, 0.0268, 0.7], [0.024, 0.0372, 0.0288, 0.55],
    [0.04, 0.041, 0.0318, 0.95], [0.047, 0.042, 0.0325, 1], [0.047, 0.0385, 0.0295, 0.7],
  ];
  const pos = [], col = [], idx = [];
  const g0 = new THREE.Color(0xc99a3e), g1 = new THREE.Color(0xffe08a), c = new THREE.Color();
  for (let r = 0; r < rings.length; r++) {
    const [z, rx, ry, k] = rings[r];
    c.copy(g0).lerp(g1, k);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * rx, Math.sin(a) * ry, z);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < seg; i++) {
    const a = r * seg + i, b = r * seg + (i + 1) % seg, cc = (r + 1) * seg + i, d = (r + 1) * seg + (i + 1) % seg;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// how a closed hand wraps what it holds: a cylinder along the grip's Z of radius r at (cx·s, cy)
const WRAP = {
  sword: [0.017, 0, 0], spear: [0.017, 0, 0], torch: [0.021, 0, 0], bow: [0.024, 0, 0], shield: [0.013, 0.004, 0],
  windfan: [0.013, 0, 0], waybell: [0.011, 0, 0], flask: [0.045, 0, 0], arrow: [0.007, 0, 0],
  bomb: [0.058, -0.035, -0.03], rock: [0.045, -0.035, -0.03], food: [0.042, -0.04, -0.035], small: [0.026, -0.035, -0.03],
  fist: [0.004, 0.006, -0.012],
};
// where the held item's axis sits in the hand asset's space (right hand; x mirrors for the left)
const GRIP_C = [0.004, -0.046, 0.004];
// relaxed hand (rad per joint): fingers gently bent, more toward the pinky
const RELAXED = [0.12, 0.12, 0.1, 0.1, 0.14, 0.1, 0.16, 0.2, 0.12, 0.2, 0.24, 0.15, 0.25, 0.28, 0.18];

export function createHands(ctx, P) {
  const input = ctx.input;
  const mat = ctx.art.material({ color: 0xffffff, vertexColors: true, flat: true, rim: 0.35 });
  const gems = getGems(ctx);
  const sprites = getSprites(ctx);
  const GEM_GLOW = new THREE.Color(0x7fe9ff).multiplyScalar(0.6);
  const _gp = new THREE.Vector3();
  const H = {};
  for (const side of HANDS) {
    const s = side === 'left' ? -1 : 1;
    const geo = gloveGeometry(s);
    const rest = Float32Array.from(geo.attributes.position.array);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'glove-' + side;
    input.hands[side].object3D.add(mesh);
    // the fallback glove's gem (moved to the skinned hand's cuff once that loads)
    const gem = gems.add(input.hands[side].object3D, s * 0.079, 0.088, 0, 0.011);
    H[side] = { s, mesh, geo, rest, gem, curl: -1, shown: 0.15, k1: [s * 0.04, -0.035], k2: [s * 0.04, -0.081],
      rig: null, cur: Float32Array.from(RELAXED), angles: new Float32Array(15), wraps: new Map(), anchor: null, joints: new Float32Array(25 * 7) };
  }

  // ── realistic skinned hands (WebXR generic hand, MIT) — loaded in the background, fallback above ──
  let rigReady = false;
  const handMat = ctx.art.material({ color: 0xffffff, vertexColors: true, flat: false, rim: 0.35, spec: 0.12, gloss: 10 });
  const cuffs = createAttached(ctx, 'glove-cuffs', cuffGeometry(),
    ctx.art.material({ color: 0xffffff, vertexColors: true, flat: false, rim: 0.3, spec: 0.6, gloss: 40 }), 2, 1e6);
  loadHandData().then((data) => {
    for (const side of HANDS) {
      const h = H[side];
      const rig = createHandRig(data[side], side, handMat, new THREE.Vector3(h.s * GRIP_C[0], GRIP_C[1], GRIP_C[2]), ctx.art);
      h.rig = rig;
      const obj = input.hands[side].object3D;
      obj.add(rig.mesh);
      h.mesh.visible = false;
      // the cuff follows the wrist joint
      h.anchor = new THREE.Object3D();
      h.anchor.name = 'wrist-anchor';
      obj.add(h.anchor);
      cuffs.add(h.anchor, 0, 0, 0.004, 1);
      gems.remove(h.gem);
      h.gem = gems.add(h.anchor, 0, 0.0285, 0.03, 0.0085);
      h.wraps.clear();
    }
    rigReady = true;
    ctx.events.emit('hands:ready', { triangles: H.left.rig.triangles + H.right.rig.triangles });
  }).catch((e) => {
    // offline before the asset was cached, or blocked: the faceted glove stays
    console.info('[AW] hand asset unavailable, using the built-in glove:', e && e.message);
  });

  function wrapFor(h, side, held) {
    const id = !held ? 'fist' : WRAP[held.id] ? held.id : held.def?.cat === 'food' ? 'food' : (held.def?.cat === 'material' || held.def?.cat === 'key') ? 'small' : 'sword';
    let w = h.wraps.get(id);
    if (!w) {
      const [r, cx, cy] = WRAP[id];
      w = h.rig.solveWrap(r, cx * h.s, cy);
      h.wraps.set(id, w);
    }
    return w;
  }

  const _gm = new THREE.Matrix4(), _gi = new THREE.Matrix4(), _jm = new THREE.Matrix4();
  const _jp = new THREE.Vector3(), _jq = new THREE.Quaternion(), _js = new THREE.Vector3();
  const target = new Float32Array(5);
  function poseRig(h, side, hd, dt) {
    const rig = h.rig;
    // hand tracking: copy the joints (rig space → grip space)
    if (hd.joints && hd.jointsValid) {
      _gm.compose(hd.localPos, hd.localQuat, _js.set(1, 1, 1));
      _gi.copy(_gm).invert();
      const J = hd.joints, out = h.joints;
      for (let i = 0; i < 25; i++) {
        _jm.fromArray(J, i * 16).premultiply(_gi);
        _jm.decompose(_jp, _jq, _js);
        out[i * 7] = _jp.x; out[i * 7 + 1] = _jp.y; out[i * 7 + 2] = _jp.z;
        out[i * 7 + 3] = _jq.x; out[i * 7 + 4] = _jq.y; out[i * 7 + 5] = _jq.z; out[i * 7 + 6] = _jq.w;
      }
      rig.poseFromJoints(out);
    } else {
      // controllers / desktop: curls per finger, eased (≈ 60 ms)
      const held = ctx.items?.held?.[side];
      const pulling = ctx.items?.pulling?.[side];
      const g = hd.grip, t = hd.trigger;
      if (held) { target[0] = 1; target[1] = 0.85 + 0.15 * t; target[2] = target[3] = target[4] = 1; }
      else if (pulling) { target[0] = 0.35; target[1] = 0.45; target[2] = target[3] = target[4] = 0.55; }
      else {
        target[0] = g > 0.5 || hd.thumbRest ? 0.55 : 0.12;      // thumb rests on the controller or lifts
        target[1] = 0.12 + 0.8 * t;                               // trigger curls the index
        target[2] = target[3] = target[4] = 0.08 + 0.9 * g;       // grip curls middle, ring, pinky
      }
      const closed = wrapFor(h, side, held);
      const k = ema(0.06, dt > 0 ? dt : (ctx.clock.dt || 0.016));
      for (let f = 0; f < 5; f++) {
        h.cur[f] = (h.cur[f] ?? 0) + (target[f] - (h.cur[f] ?? 0)) * k;
        for (let j = 0; j < 3; j++) {
          const i = f * 3 + j;
          h.angles[i] = RELAXED[i] + (closed[i] - RELAXED[i]) * h.cur[f];
        }
      }
      rig.pose(h.angles);
    }
    rig.skin();
    // cuff + gem ride on the wrist joint
    h.anchor.position.copy(rig.P[0]);
    h.anchor.quaternion.copy(rig.Q[0]);
  }

  function update(dt) {
    for (const side of HANDS) {
      const h = H[side];
      const hd = input.hands[side];
      if (rigReady && h.rig) {
        h.rig.mesh.visible = hd.tracked;
        h.anchor.visible = hd.tracked;
        if (hd.tracked) poseRig(h, side, hd, dt);
      } else {
        const held = ctx.items?.held?.[side];
        let want = Math.max(0.12, hd.grip, hd.pinch * 0.8);
        if (held) want = held.def?.cat === 'food' ? 0.75 : held.id === 'arrow' ? 0.7 : 1;
        if (ctx.items?.pulling?.[side]) want = 0.55;
        h.shown += (want - h.shown) * ema(0.05, dt > 0 ? dt : (ctx.clock.dt || 0.016));
        if (Math.abs(h.shown - h.curl) > 0.01) { h.curl = h.shown; pose(h, h.curl); }
        h.mesh.visible = hd.tracked;
      }
      if (hd.tracked && (ctx.world?.nightFactor ?? 0) > 0.5) {
        if (h.anchor && rigReady) _gp.set(0, 0.032, 0.03).applyQuaternion(h.anchor.getWorldQuaternion(_jq)).add(h.anchor.getWorldPosition(_jp));
        else _gp.set(h.s * 0.082, 0.088, 0).applyQuaternion(hd.quat).add(hd.pos);
        sprites.push(_gp, 0.1, GEM_GLOW);                // art.glow size 0.05 = radius → 0.1 across
      }
    }
  }

  function pose(h, curl) {
    const pos = h.geo.attributes.position.array;
    const tags = h.geo.userData.tags;
    const rest = h.rest;
    const a1 = -h.s * curl * (100 * Math.PI / 180);
    const a2 = -h.s * curl * (95 * Math.PI / 180);
    const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    const [k1x, k1y] = h.k1, [k2x, k2y] = h.k2;
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      if (!t) continue;
      let x = rest[i * 3], y = rest[i * 3 + 1];
      if (t === 2) {                          // tip: bend about the middle joint first
        const dx = x - k2x, dy = y - k2y;
        x = k2x + dx * c2 - dy * s2; y = k2y + dx * s2 + dy * c2;
      }
      const dx = x - k1x, dy = y - k1y;
      pos[i * 3] = k1x + dx * c1 - dy * s1;
      pos[i * 3 + 1] = k1y + dx * s1 + dy * c1;
    }
    h.geo.attributes.position.needsUpdate = true;
    flatNormals(h.geo);
  }
  pose(H.left, 0.15); pose(H.right, 0.15);
  return { update, H, get ready() { return rigReady; } };
}
