// js/items/models.js — every item's look, built in code (§7.4 style: low-poly, flat, vertex colours,
// one geometry per item, ≤ 400 triangles). Grip space: origin at the fist, -Z along the held rod
// (blade / shaft / neck), +X back of the right hand, +Y toward the elbow.
import * as THREE from 'three';
import { GeoBuilder, triCount } from '../core/geo.js';

const C = {
  steel: 0xdfe8f0, steel2: 0xb9c6d2, gold: 0xffd76a, cyan: 0x7fe9ff, white: 0xfffbe8, leather: 0x6b4a2e,
  wood: 0x8a6a45, wood2: 0xa8794a, dark: 0x4a3a2a, cloth: 0xc9a86a, red: 0xd9473a, apple: 0xe8553a,
  baked: 0xa8582e, glow: 0x62e6ff, pink: 0xff9be0, cream: 0xf4ecd8, ice: 0x9fe3f5, honey: 0xf2c66b, rock: 0x8d8a85,
  bomb: 0x7a2a2a, bombDot: 0xffb347, green: 0x5fae4a,
};
const R90 = Math.PI / 2;

const BUILD = {
  sword(b) {
    // grip: leather with six slanted wraps (A-P3-2)
    b.cyl(0.017, 0.017, 0.13, 6, C.leather, [0, 0, 0.015], [R90, 0, 0]);
    for (let i = 0; i < 6; i++) b.box(0.038, 0.005, 0.007, 0x4a3220, [0, 0, 0.068 - i * 0.021], [0, 0, 0.55], [1, 1, 1]);
    b.oct(0.024, C.gold, [0, 0, 0.095]);                                            // pommel
    // guard in three pieces, the ends swept 15° toward the blade
    const a = 15 * Math.PI / 180, L = 0.055;
    b.box(0.03, 0.06, 0.028, C.gold, [0, 0, -0.06]);
    b.box(0.028, L, 0.024, C.gold, [0, 0.03 + (L / 2) * Math.cos(a), -0.06 - (L / 2) * Math.sin(a)], [-a, 0, 0]);
    b.box(0.028, L, 0.024, C.gold, [0, -0.03 - (L / 2) * Math.cos(a), -0.06 - (L / 2) * Math.sin(a)], [a, 0, 0]);
    b.cyl(0.004, 0.026, 0.68, 4, C.steel, [0, 0, -0.415], [-R90, 0, 0], [0.32, 1, 1]); // blade (diamond section)
    b.cone(0.006, 0.07, 4, C.steel2, [0, 0, -0.79], [-R90, 0, 0], [0.32, 1, 1]);
    b.box(0.006, 0.012, 0.5, C.cyan, [0, 0, -0.36]);                                // wind inlay
    b.gem(0.017, 0.0, -0.06, 0.011);
  },
  spear(b) {
    b.cyl(0.016, 0.018, 1.95, 6, C.wood, [0, 0, -0.425], [R90, 0, 0]);
    b.box(0.03, 0.03, 0.05, C.gold, [0, 0, -1.4]);
    b.cone(0.035, 0.2, 4, C.steel, [0, 0, -1.5], [-R90, 0, 0], [1, 1, 0.45]);
    b.box(0.006, 0.016, 0.12, C.cyan, [0, 0, -1.47]);
    b.cyl(0.02, 0.02, 0.04, 6, C.gold, [0, 0, 0.53], [R90, 0, 0]);
    b.box(0.004, 0.08, 0.1, C.cyan, [0, 0.04, -1.32]);                              // ribbon
  },
  torch(b) {
    b.cyl(0.018, 0.022, 0.56, 6, C.wood, [0, 0, -0.15], [R90, 0, 0]);
    b.cyl(0.04, 0.032, 0.12, 7, C.dark, [0, 0, -0.47], [R90, 0, 0]);               // wrapped head
    b.cyl(0.042, 0.042, 0.025, 7, C.cloth, [0, 0, -0.44], [R90, 0, 0]);
    b.oct(0.012, C.leather, [0, 0, 0.12]);
  },
  shield(b) {
    // A-P1-2: Ø0.48 decagon, 0.03 thick; face +X = five planks (6 mm grooves) + gold boss + cyan gem,
    // a gold torus rim, back −X = dark wood with two leather straps and the grip. ≤ 260 triangles.
    const cx = 0.065, cy = 0.02, R = 0.24, Rp = 0.222, T = 0.026;
    b.cyl(R, R, T, 10, 0x5a4029, [cx, cy, 0], [0, 0, R90]);                        // core (edge, groove colour)
    const x0 = cx + T / 2, x1 = x0 + 0.006, xb1 = cx - T / 2, xb0 = xb1 - 0.004;
    const BACK = [0x6e5034, 0x8f6e48, 0x553b26, 0x8a6a44, 0x664a30];              // back planks alternate light/dark: no big single-colour face
    const c = (y) => Math.sqrt(Math.max(0, Rp * Rp - y * y));
    for (let i = 0; i < 5; i++) {
      const ya = -0.225 + i * 0.09 + 0.003, yb = ya + 0.084;
      const pts = [[ya, -c(ya)], [ya, c(ya)], [yb, c(yb)], [yb, -c(yb)]];
      const P = pts.map(([y, z]) => [y + cy, z]);
      b.prismYZ(P, x0, x1, i % 2 ? 0x946640 : 0xa8794a);                             // face
      b.prismYZ(P, xb0, xb1, BACK[i]);                                                // back
    }
    b.torus(0.235, 0.016, 3, 10, Math.PI * 2, C.gold, [cx, cy, 0], [0, R90, 0]);     // rim (10 sides like the board)
    b.cone(0.06, 0.035, 8, C.gold, [x1 + 0.0175, cy, 0], [0, 0, -R90]);             // boss
    b.box(0.006, 0.03, 0.4, C.leather, [xb0 - 0.003, cy - 0.03, 0]);                // straps on the back, crossed:
    b.box(0.006, 0.4, 0.03, C.leather, [xb0 - 0.003, cy, -0.07]);                   // every plank is split (upper half)
    b.gem(x1 + 0.03, cy, 0, 0.025);
  },
  bow(b) {
    // limbs in the Y-Z plane, belly toward -Y (forward), tips curving back toward the archer (+Y)
    const R = 0.75, cy = R - 0.04, n = 8, a0 = -0.87, a1 = 0.87;
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      const y0 = cy - R * Math.cos(t0), z0 = R * Math.sin(t0), y1 = cy - R * Math.cos(t1), z1 = R * Math.sin(t1);
      const mid = [0, (y0 + y1) / 2, (z0 + z1) / 2];
      const len = Math.hypot(y1 - y0, z1 - z0);
      const ang = Math.atan2(y1 - y0, z1 - z0);
      const w = 0.026 - Math.abs((i + 0.5) / n - 0.5) * 0.018;
      b.box(0.022, w, len + 0.004, i === 0 || i === n - 1 ? C.gold : C.wood2, mid, [-ang, 0, 0]);
    }
    b.cyl(0.024, 0.024, 0.12, 6, C.leather, [0, -0.03, 0], [R90, 0, 0]);          // grip wrap
    b.oct(0.016, C.cyan, [0, -0.05, -0.08]);
    b.oct(0.016, C.cyan, [0, -0.05, 0.08]);
    b.box(0.006, 0.02, 0.012, C.white, [0, -0.06, 0]);                              // arrow rest
  },
  arrow(b) {
    b.cyl(0.0055, 0.0055, 0.76, 4, C.wood, [0, 0, -0.38], [R90, 0, 0]);
    b.cone(0.015, 0.06, 4, C.steel, [0, 0, -0.79], [-R90, 0, 0]);
    b.box(0.002, 0.034, 0.085, C.cyan, [0, 0, -0.06]);
    b.box(0.034, 0.002, 0.085, C.white, [0, 0, -0.06]);
    b.box(0.012, 0.012, 0.012, C.gold, [0, 0, 0.0]);
  },
  bomb(b) {
    b.ico(0.062, 1, C.bomb, [0, 0, 0]);
    b.oct(0.012, C.bombDot, [0.05, 0.03, 0.02]);
    b.oct(0.012, C.bombDot, [-0.045, -0.03, 0.03]);
    b.oct(0.012, C.bombDot, [0.0, 0.05, -0.04]);
    b.cyl(0.007, 0.009, 0.045, 5, C.dark, [0, 0, -0.08], [R90, 0, 0]);             // fuse stem
    b.box(0.03, 0.004, 0.02, C.green, [0.012, 0, -0.07], [0, 0.4, 0]);
  },
  rock(b) { b.dodeca(0.05, C.rock, [0, 0, 0], [0.3, 0.5, 0], [1, 0.8, 0.9]); },
  windfan(b) {
    b.cyl(0.012, 0.014, 0.17, 6, C.gold, [0, 0, -0.03], [R90, 0, 0]);
    // half disc, normal ±X, spanning toward -Z
    b.add(new THREE.CylinderGeometry(0.23, 0.23, 0.008, 9, 1, false, Math.PI / 2, Math.PI), C.white, [0, 0, -0.13], [0, 0, R90]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * Math.PI * 0.95;
      b.box(0.012, 0.006, 0.22, C.cyan, [0, Math.sin(a) * 0.11, -0.13 - Math.cos(a) * 0.11], [a, 0, 0]);
    }
  },
  flask(b) {
    b.cyl(0.045, 0.045, 0.12, 7, 0xc8e6f0, [0, 0, 0], [R90, 0, 0]);
    b.cone(0.045, 0.04, 7, 0xc8e6f0, [0, 0, -0.08], [-R90, 0, 0]);
    b.cyl(0.015, 0.015, 0.04, 6, 0xa9d4e4, [0, 0, -0.105], [R90, 0, 0]);
    b.cyl(0.017, 0.017, 0.02, 6, C.leather, [0, 0, -0.13], [R90, 0, 0]);
    b.cyl(0.047, 0.047, 0.02, 7, C.leather, [0, 0, 0.02], [R90, 0, 0]);
    b.cyl(0.03, 0.03, 0.01, 6, C.cyan, [0, 0, 0.065], [R90, 0, 0]);
  },
  waybell(b) {
    b.cyl(0.01, 0.01, 0.12, 5, C.gold, [0, 0, 0.0], [R90, 0, 0]);
    b.torus(0.025, 0.006, 4, 8, Math.PI * 2, C.gold, [0, 0, 0.075], [0, R90, 0]);
    b.cyl(0.022, 0.045, 0.07, 8, C.gold, [0, 0, -0.1], [-R90, 0, 0]);
    b.ico(0.014, 0, C.cyan, [0, 0, -0.145]);
    b.box(0.004, 0.03, 0.1, C.cyan, [0, 0.02, 0.03]);
  },
  apple(b) {
    b.ico(0.046, 1, C.apple, [0, 0, 0], [0, 0, 0], [1, 0.92, 1]);
    b.oct(0.02, C.gold, [0.025, 0.02, 0.02]);
    b.cyl(0.004, 0.004, 0.03, 4, C.leather, [0, 0.05, 0]);
    b.box(0.03, 0.004, 0.016, C.green, [0.015, 0.058, 0], [0, 0, 0.4]);
  },
  apple_baked(b) {
    b.ico(0.044, 1, C.baked, [0, 0, 0], [0, 0, 0], [1, 0.85, 1]);
    b.oct(0.018, C.honey, [0.02, 0.025, 0.02]);
    b.cyl(0.004, 0.004, 0.025, 4, C.dark, [0, 0.045, 0]);
  },
  mushroom(b) {
    b.cyl(0.014, 0.018, 0.06, 6, C.cream, [0, -0.01, 0]);
    b.cone(0.048, 0.04, 7, C.glow, [0, 0.035, 0]);
    b.oct(0.01, C.white, [0.025, 0.035, 0.012]);
    b.oct(0.008, C.white, [-0.02, 0.04, -0.015]);
  },
  mushroom_grilled(b) {
    b.cyl(0.013, 0.016, 0.055, 6, 0xc9a86a, [0, -0.01, 0]);
    b.cone(0.045, 0.036, 7, 0x8a5a3a, [0, 0.032, 0]);
    b.oct(0.01, C.honey, [0.02, 0.035, 0.01]);
  },
  frostberry(b) {
    b.ico(0.02, 0, C.ice, [0.015, 0, 0]);
    b.ico(0.018, 0, 0xbfeefa, [-0.014, 0.008, 0.01]);
    b.ico(0.017, 0, C.ice, [0, -0.012, -0.014]);
    b.box(0.03, 0.004, 0.018, C.green, [0, 0.022, 0], [0, 0, 0.3]);
  },
  honeycomb(b) {
    b.cyl(0.05, 0.05, 0.03, 6, C.honey, [0, 0, 0], [R90, 0, 0]);
    b.cyl(0.02, 0.02, 0.032, 6, 0xd99a2b, [0.022, 0, 0], [R90, 0, 0]);
    b.cyl(0.02, 0.02, 0.032, 6, 0xd99a2b, [-0.02, 0.018, 0], [R90, 0, 0]);
  },
  shard(b) { b.oct(0.032, C.gold, [0, 0, 0], [0, 0, 0], [0.7, 1.2, 0.7]); b.oct(0.012, C.white, [0, 0, 0]); },
  aetherseed(b) { b.ico(0.028, 0, C.cyan, [0, 0, 0], [0, 0, 0], [0.8, 1.2, 0.8]); b.cone(0.012, 0.04, 4, C.white, [0, 0.045, 0]); },
  pearl(b) { b.ico(0.03, 1, C.white, [0, 0, 0]); },
};

let _gemGeo = null;
export const gemGeo = () => _gemGeo || (_gemGeo = new THREE.OctahedronGeometry(1, 0));

export function createModels(ctx) {
  const geos = new Map();
  const mat = () => ctx.art.material({ color: 0xffffff, vertexColors: true, flat: true });

  function geometry(id) {
    let g = geos.get(id);
    if (g) return g;
    const fn = BUILD[id];
    const b = new GeoBuilder();
    const gems = [];
    b.gem = (x, y, z, size) => gems.push([x, y, z, size]);
    if (fn) fn(b); else b.ico(0.04, 0, 0xff00ff);
    g = b.build();
    g.userData.gems = gems;
    g.userData.tris = triCount(g);
    geos.set(id, g);
    return g;
  }
  function makeMesh(id) {
    const m = new THREE.Mesh(geometry(id), mat());
    m.name = 'item-' + id;
    return m;
  }
  return {
    geometry, makeMesh, material: mat,
    /** a standalone model (UI icons, chests, enemies holding things) */
    makeModel(id) {
      const g = new THREE.Group();
      g.name = 'model-' + id;
      g.add(makeMesh(id));
      // standalone models carry their gems as real meshes (UI icons, chests): art.basic cyan
      for (const [x, y, z, sz] of geometry(id).userData.gems || []) {
        const m = new THREE.Mesh(gemGeo(), ctx.art.basic({ color: 0x7fe9ff }));
        m.position.set(x, y, z); m.scale.setScalar(sz); m.name = 'gem';
        g.add(m);
      }
      return g;
    },
    gemsOf(id) { return geometry(id).userData.gems || []; },
    trianglesOf(id) { return geometry(id).userData.tris; },
  };
}
