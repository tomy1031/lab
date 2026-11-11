// js/player/hands.js — the player's hands: one low-poly glove per hand (one draw call each), fingers curled on
// the CPU from the grip value (closed around whatever is held). Grip space (WebXR): -Z along a held rod
// (thumb side), +X back of the right hand (-X for the left), +Y toward the elbow.
import * as THREE from 'three';
import { GeoBuilder, flatNormals } from '../core/geo.js';
import { getGems, getSprites } from '../core/gems.js';
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
    // cyan gem on the cuff (shared instanced art.basic) + a soft glint at night (shared glow sprites)
    gems.add(input.hands[side].object3D, s * 0.079, 0.088, 0, 0.011);
    H[side] = { s, mesh, geo, rest, curl: -1, shown: 0.15, k1: [s * 0.04, -0.035], k2: [s * 0.04, -0.081] };
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

  function update(dt) {
    for (const side of HANDS) {
      const h = H[side];
      const hd = input.hands[side];
      const held = ctx.items?.held?.[side];
      let want = Math.max(0.12, hd.grip, hd.pinch * 0.8);
      if (held) want = held.def?.cat === 'food' ? 0.75 : held.id === 'arrow' ? 0.7 : 1;
      if (ctx.items?.pulling?.[side]) want = 0.55;
      h.shown += (want - h.shown) * ema(0.05, dt > 0 ? dt : (ctx.clock.dt || 0.016));
      if (Math.abs(h.shown - h.curl) > 0.01) { h.curl = h.shown; pose(h, h.curl); }
      h.mesh.visible = hd.tracked;
      if (hd.tracked && (ctx.world?.nightFactor ?? 0) > 0.5) {
        _gp.set(h.s * 0.082, 0.088, 0).applyQuaternion(hd.quat).add(hd.pos);
        sprites.push(_gp, 0.1, GEM_GLOW);                // art.glow size 0.05 = radius → 0.1 across
      }
    }
  }
  pose(H.left, 0.15); pose(H.right, 0.15);
  return { update, H };
}
