// js/player/hands.js — the player's hands: one low-poly glove per hand (one draw call each), fingers curled on
// the CPU from the grip value (closed around whatever is held). Grip space (WebXR): -Z along a held rod
// (thumb side), +X back of the right hand (-X for the left), +Y toward the elbow.
import * as THREE from 'three';
import { GeoBuilder, flatNormals } from '../core/geo.js';
import { ema } from '../core/util.js';
const HANDS = ['left', 'right'];

const CREAM = 0xf4ecd8, CREAM2 = 0xe2d6b8, GOLD = 0xffd76a, CYAN = 0x7fe9ff;

function gloveGeometry(s) {
  const b = new GeoBuilder();
  b.tag = 0;
  b.box(0.03, 0.095, 0.085, CREAM, [s * 0.04, 0.012, 0]);                       // back of the hand
  b.cyl(0.036, 0.032, 0.05, 8, GOLD, [s * 0.034, 0.083, 0]);                     // cuff
  b.oct(0.012, CYAN, [s * 0.058, 0.02, 0], [0, 0, 0], [0.6, 1, 1]);             // gem on the back
  b.box(0.02, 0.05, 0.022, CREAM2, [s * 0.016, -0.004, -0.054], [0.35, 0, s * 0.2]); // thumb
  b.tag = 1;
  b.box(0.024, 0.046, 0.08, CREAM, [s * 0.04, -0.058, 0]);                      // fingers, first segment
  b.tag = 2;
  b.box(0.021, 0.04, 0.074, CREAM2, [s * 0.04, -0.1, 0.002]);                    // fingers, tips
  return b.build({ tags: true });
}

export function createHands(ctx, P) {
  const input = ctx.input;
  const mat = ctx.art.material({ color: 0xffffff, vertexColors: true, flat: true });
  const H = {};
  for (const side of HANDS) {
    const s = side === 'left' ? -1 : 1;
    const geo = gloveGeometry(s);
    const rest = Float32Array.from(geo.attributes.position.array);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'glove-' + side;
    input.hands[side].object3D.add(mesh);
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
    }
  }
  pose(H.left, 0.15); pose(H.right, 0.15);
  return { update, H };
}
