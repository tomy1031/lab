// world/flora.js — procedural jungle / beach / grassland vegetation, drawn with InstancedMesh. Each harvestable
// instance is also a "node" in the resource registry (world/nodes.js) so it can be gathered, chopped and regrow.
//
// Node kinds: palm, tree, bamboo, bush_berry, bush, fern, grass_tuft, herb, rock, boulder, driftwood,
//             banana, vine, mushroom, aloe, shell, seaweed, flint, clay, sugarcane, nest.
// Pure decoration (never registered): big-leaf understory, ground leaves, extra ferns, tall grass, dune grass,
// morning-glory creepers, reeds and the near-player grass carpet.
// Meshes are built in world/flora/*.js (vertex-coloured low-poly), shaded with a wind-sway vertex shader.
import * as THREE from 'three';
import { RNG, clamp, smoothstep } from '../core/rng.js';
import { LAYOUT } from './terrain.js';
import * as B from './flora/builders.js';
import { GrassCarpet } from './flora/carpet.js';

// -------------------------------------------------------------- the wind-sway material
function swayMaterial(strength) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  m.userData.uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float sway = (${strength.toFixed(3)}) * max(0.0, transformed.y) * (0.25 + uWind * 1.3);
  float ph = ip.x * 0.3 + ip.z * 0.2;
  transformed.x += sin(uTime * (1.2 + uWind) + ph) * sway * 0.06;
  transformed.z += cos(uTime * (1.0 + uWind) + ip.z * 0.3) * sway * 0.04;
  // leaf flutter on the fine parts (tiny, scaled by height so trunks barely move)
  float fl = sin(uTime * (2.6 + uWind * 2.0) + transformed.x * 2.1 + transformed.z * 1.7 + ph) * 0.012 * (0.3 + uWind) * min(1.0, transformed.y * 0.3);
  transformed.y += fl * ${Math.min(1, strength + 0.2).toFixed(2)};
  transformed.x += fl * 0.6;`);
  };
  return m;
}

const ALL_LAND = { beach: 1, rocks: 1, jungle: 1, grass: 1, hill: 1 };
const TAU = Math.PI * 2;

/**
 * Flora places instanced plants on the terrain. `nodes` is the NodeRegistry: every harvestable instance is
 * registered there ({ kind, x, y, z, mesh, index, ... }); hiding an instance (gathered) scales it to 0.
 */
export class Flora {
  constructor(scene, terrain, nodes, seed = 7, quality = 'high') {
    this.scene = scene; this.terrain = terrain; this.nodes = nodes; this.quality = quality;
    this.rng = new RNG(seed * 13 + 5);
    this.dens = quality === 'low' ? 0.55 : quality === 'mid' ? 0.8 : 1;
    this.materials = {
      tree: swayMaterial(0.3),
      mid: swayMaterial(0.6),
      low: swayMaterial(1.2),
      rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.15, flatShading: true }),
      decal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    };
    this.meshes = {};
    this.counts = {};
    this.placed = {};
    this.carpet = null;
    const sp = terrain.shorePoint(Math.atan2(95, 150), 1.5);
    this.start = { x: sp.x, z: sp.z };
  }

  // ---------------------------------------------------------------- field helpers
  clump(x, z, f, off = 0) { return clamp(0.5 + this.terrain.noise2.fbm(x * f + off, z * f - off * 0.7, 3) * 0.9); }
  streamD(x, z) { return this.terrain.streamInfo(x, z).d; }
  pondD(x, z) { const P = LAYOUT.pond; return Math.hypot(x - P.x, z - P.z) - P.r; }

  specs() {
    const H = (h, s, l) => new THREE.Color().setHSL(h, s, l);
    const rn = (n, f) => Array.from({ length: n }, (_, i) => f(i));
    const seed = () => this.rng.int(1, 1e6);
    // ---- tree variants: 3 emergent + 6 mid
    const treeVars = [
      { b: () => B.treeEmergent(seed(), 0.31), w: 0.11, occ: 1.5, cr: 0.8, r: 1.0, s: [0.9, 1.25], emergent: true },
      { b: () => B.treeEmergent(seed(), 0.35), w: 0.10, occ: 1.5, cr: 0.8, r: 1.0, s: [0.9, 1.25], emergent: true },
      { b: () => B.treeEmergent(seed(), 0.26), w: 0.08, occ: 1.5, cr: 0.8, r: 1.0, s: [0.9, 1.2], emergent: true },
      { b: () => B.treeMid(seed(), { hue: 0.2, sat: 0.62, lite: 0.3 }), w: 0.14, occ: 0.8, cr: 0.4, r: 0.8, s: [0.85, 1.3], vine: true },
      { b: () => B.treeMid(seed(), { hue: 0.29, sat: 0.55, lite: 0.22 }), w: 0.17, occ: 0.8, cr: 0.4, r: 0.8, s: [0.85, 1.3], vine: true },
      { b: () => B.treeMid(seed(), { hue: 0.4, sat: 0.45, lite: 0.22 }), w: 0.13, occ: 0.8, cr: 0.4, r: 0.8, s: [0.85, 1.3], vine: true },
      { b: () => B.treeMid(seed(), { hue: 0.27, sat: 0.55, lite: 0.25, flower: '#e8553a' }), w: 0.05, occ: 0.8, cr: 0.4, r: 0.8, s: [0.85, 1.2] },
      { b: () => B.treeMid(seed(), { hue: 0.25, sat: 0.6, lite: 0.24, trunks: 2 }), w: 0.1, occ: 1.2, cr: 0.5, r: 0.9, s: [0.85, 1.25], vine: true },
      { b: () => B.treeMid(seed(), { hue: 0.33, sat: 0.5, lite: 0.26, small: 0.7 }), w: 0.12, occ: 0.8, cr: 0.32, r: 0.7, s: [0.8, 1.2], small: true },
    ];
    const palmVars = rn(5, () => ({ b: () => B.palmGeometry(seed()), w: 1, occ: 1.0, cr: 0.3, r: 0.6, s: [0.85, 1.25] }));
    const plain = (b, o = {}) => ({ b, w: 1, ...o });
    const out = [];

    // ================================================================ solids
    out.push({ kind: 'tree', mat: 'tree', cast: true, count: 1250, vars: treeVars, solid: true,
      zones: { jungle: 1, hill: 0.2, grass: 0.1 }, minH: 2.8, maxH: 40, openStart: true, clump: [0.03, 0.12, 0],
      pick: (z, rng, vars) => (z === 'jungle' ? rng.weighted(vars.map((v, i) => [i, v.w])) : rng.weighted(vars.map((v, i) => [i, v.small || (!v.emergent && !v.flower) ? 1 : 0.0001]))),
      scaleZone: (z) => (z === 'hill' ? 0.75 : z === 'grass' ? 0.9 : 1) });
    out.push({ kind: 'palm', mat: 'tree', cast: true, count: 300, vars: palmVars, solid: true,
      zones: { beach: 1, grass: 0.05, rocks: 0.15 }, minH: 1.3, maxH: 4.2, openStart: true, group: [1, 4, 5],
      accept: (x, z, y) => smoothstep(1.3, 1.8, y) * (1 - smoothstep(3.2, 4.2, y)),
      rot: (x, z, rng) => -(Math.atan2(z, x) + rng.float(-0.45, 0.45)) });
    out.push({ kind: 'bamboo', mat: 'mid', cast: true, count: 75, vars: rn(3, () => plain(() => B.bambooGeometry(seed()), { occ: 1.7, cr: 0.75, r: 0.8 })), solid: true,
      zones: { jungle: 1, grass: 0.3 }, minH: 2.5, maxH: 30, openStart: true, minStream: 3.5,
      accept: (x, z) => { const d = this.streamD(x, z), p = this.pondD(x, z); return d < 22 || (p > 0 && p < 14) ? 1 : 0.04; } });
    out.push({ kind: 'boulder', mat: 'rock', cast: true, count: 75, solid: true, openStart: true,
      vars: [B.rockGeo(seed(), 1.6), B.rockGeo(seed(), 1.5), B.rockGeo(seed(), 1.9, { moss: 1 }), B.rockGeo(seed(), 1.5, { moss: 1 })].map((g) => ({ g, occ: 1.6, cr: 1.7, r: 1.8, s: [0.8, 1.3] })),
      pick: (z, rng) => (z === 'jungle' || z === 'grass' ? rng.int(2, 3) : rng.int(0, 3)), tint: 0.12,
      zones: { rocks: 1, hill: 1, cliff: 0.5, jungle: 0.05, grass: 0.04 }, minH: 1.3, maxH: 60, maxSlope: 2, rockLike: true });

    // ================================================================ harvestable plants & items
    out.push({ kind: 'banana', mat: 'mid', count: 160, vars: [0, 1, 2].map((i) => plain(() => B.bananaGeometry(seed(), i === 2), { r: 0.9, s: [0.9, 1.25] })),
      zones: { jungle: 1, grass: 0.15 }, minH: 2.8, maxH: 30, clump: [0.05, 0.4, 5], group: [1, 4, 4.5], openStart: true, bananaTint: true });
    out.push({ kind: 'bush_berry', mat: 'low', cast: false, count: 85, vars: rn(3, (i) => plain(() => B.bushGeometry(seed(), { berries: true, hue: 0.26 + i * 0.03, sat: 0.55, lite: 0.22 + i * 0.01 }), { r: 0.9 })),
      zones: { jungle: 0.7, grass: 1 }, minH: 2, maxH: 40, group: [1, 3, 3.5] });
    out.push({ kind: 'bush', mat: 'low', count: 440, vars: [
      plain(() => B.bushGeometry(seed(), { hue: 0.27, sat: 0.55, lite: 0.2 }), { r: 0.9 }),
      plain(() => B.bushGeometry(seed(), { hue: 0.21, sat: 0.62, lite: 0.3 }), { r: 0.9 }),
      plain(() => B.bushGeometry(seed(), { hue: 0.38, sat: 0.45, lite: 0.22 }), { r: 0.9 }),
      plain(() => B.bushGeometry(seed(), { hue: 0.3, sat: 0.55, lite: 0.24, flowers: '#ff6f9e' }), { r: 0.9, w: 0.4 }),
      plain(() => B.bushGeometry(seed(), { hue: 0.28, sat: 0.55, lite: 0.24, flowers: '#ffb03a' }), { r: 0.9, w: 0.4 }),
      plain(() => B.bushGeometry(seed(), { hue: 0.24, sat: 0.45, lite: 0.26, bent: 0.35 }), { r: 0.9, hill: true }),
      plain(() => B.bushGeometry(seed(), { hue: 0.22, sat: 0.4, lite: 0.28, bent: 0.5 }), { r: 0.9, hill: true }),
    ], pick: (z, rng, vars) => rng.weighted(vars.map((v, i) => [i, z === 'hill' ? (v.hill ? 2 : 0.3) : v.hill ? 0 : (v.w ?? 1)])),
    zones: { jungle: 0.8, grass: 1, hill: 0.7 }, minH: 2, maxH: 60, clump: [0.05, 0.1, 9], group: [1, 3, 3] });
    out.push({ kind: 'bush', mat: 'low', count: 130, vars: rn(3, (i) => plain(() => B.bushGeometry(seed(), { round: true, hue: 0.2 + i * 0.015, sat: 0.5, lite: 0.3 }), { r: 0.9, s: [0.8, 1.1] })),
      zones: { beach: 1 }, minH: 1.6, maxH: 3.4, openStart: true, group: [1, 3, 3], clump: [0.05, 0.25, 21] });
    out.push({ kind: 'fern', mat: 'low', count: 800, vars: [0.29, 0.25, 0.33, 0.21].map((h) => plain(() => B.fernGeometry(seed(), h), { r: 0.6, s: [0.8, 1.4] })),
      zones: { jungle: 1, grass: 0.08, hill: 0.1 }, minH: 2, maxH: 50, clump: [0.07, 0.15, 3], group: [1, 4, 2.5], minStream: 2.6,
      accept: (x, z) => (this.streamD(x, z) < 18 ? 1 : 0.75) });
    out.push({ kind: 'grass_tuft', mat: 'low', count: 800, vars: [
      plain(() => B.grassTuft(seed(), { n: 16, h0: 0.6, h1: 1.1 }), { r: 0.4 }),
      plain(() => B.grassTuft(seed(), { n: 18, h0: 0.7, h1: 1.25, hue: 0.25, seedHead: true, dry: 0.1 }), { r: 0.4 }),
      plain(() => B.grassTuft(seed(), { n: 14, h0: 0.5, h1: 0.9, hue: 0.27 }), { r: 0.4 }),
    ], zones: { grass: 1, hill: 0.5, jungle: 0.12 }, minH: 1.5, maxH: 60, group: [1, 4, 2], minStream: 2.6 });
    out.push({ kind: 'herb', mat: 'low', count: 55, vars: rn(2, () => plain(() => B.herbGeometry(seed()), { r: 0.3 })), zones: { jungle: 1, grass: 1, hill: 0.8 }, minH: 2, maxH: 60 });
    out.push({ kind: 'rock', mat: 'rock', count: 240, rockLike: true, maxSlope: 2, tint: 0.12,
      vars: [B.rockGeo(seed(), 0.35), B.rockGeo(seed(), 0.4), B.rockGeo(seed(), 0.32), B.rockGeo(seed(), 0.38, { moss: 1 }), B.rockGeo(seed(), 0.36, { moss: 1 })].map((g) => ({ g, r: 0.4, s: [0.8, 1.3] })),
      pick: (z, rng) => (z === 'jungle' || z === 'grass' ? rng.int(3, 4) : rng.int(0, 2)),
      zones: { rocks: 1, hill: 0.4, cliff: 0.3, stream: 1, beach: 0.1, jungle: 0.06, grass: 0.06 }, minH: 1.3, maxH: 60, group: [1, 3, 1.5] });
    out.push({ kind: 'driftwood', mat: 'rock', count: 70, vars: rn(4, () => plain(() => B.driftwoodGeometry(seed()), { r: 0.8, s: [0.8, 1.25] })),
      zones: { beach: 1 }, minH: 1.3, maxH: 2.6, tint: 0.1, lift: 0.0 });

    // ---- new resource kinds
    out.push({ kind: 'mushroom', mat: 'low', count: 70, vars: [0, 0, 1, 2].map((t) => plain(() => B.mushroomGeometry(seed(), t), { r: 0.5, s: [1, 1.4] })), tint: 0.1,
      gen: (ctx) => ctx.nearPlaced('tree', 70, 1.2, 3.6, ['jungle']) });
    out.push({ kind: 'aloe', mat: 'low', count: 75, vars: [plain(() => B.aloeGeometry(seed(), false), { r: 0.6, s: [0.9, 1.3] }), plain(() => B.aloeGeometry(seed(), false), { r: 0.6, s: [0.9, 1.3] }), plain(() => B.aloeGeometry(seed(), true), { r: 0.6, s: [0.9, 1.2] })],
      zones: { beach: 1, grass: 0.15, rocks: 0.15 }, minH: 1.7, maxH: 30, openStart: false, group: [1, 3, 2.5],
      accept: (x, z, y, zone) => (zone === 'beach' ? smoothstep(1.7, 2.2, y) : 1) });
    out.push({ kind: 'shell', mat: 'rock', count: 75, vars: [0, 1, 2].map((t) => plain(() => B.shellGeometry(seed(), t), { r: 0.4, s: [1.0, 1.4] })), zones: { beach: 1, rocks: 0.3 }, minH: -0.6, maxH: 1.1, intertidal: true, tint: 0.08, group: [1, 3, 3] });
    out.push({ kind: 'seaweed', mat: 'rock', count: 55, vars: rn(3, () => plain(() => B.seaweedGeometry(seed()), { r: 0.5, s: [0.9, 1.4] })), zones: { beach: 1, rocks: 1 }, minH: -0.6, maxH: 1.1, intertidal: true, tint: 0.1, group: [1, 3, 2.5] });
    out.push({ kind: 'flint', mat: 'glass', count: 50, vars: rn(3, () => plain(() => B.flintGeometry(seed()), { r: 0.4, s: [1.0, 1.4] })), zones: { rocks: 1, stream: 1, hill: 0.15 }, minH: 1.3, maxH: 45, maxSlope: 0.8, rockLike: true, tint: 0.08,
      accept: (x, z, y, zone) => (zone === 'stream' ? 1 : zone === 'rocks' ? 0.5 : 0.3) });
    out.push({ kind: 'clay', mat: 'decal', count: 42, vars: rn(3, () => plain(() => B.clayGeometry(seed()), { r: 1.0, s: [0.9, 1.5] })), zones: { jungle: 1, grass: 1, beach: 1, rocks: 0.5, hill: 0.3 }, minH: 1.3, maxH: 30, maxSlope: 0.35, minStream: 3.6,
      accept: (x, z) => { const d = this.streamD(x, z), p = this.pondD(x, z); return (d < 9) || (p > 0.8 && p < 6) ? 1 : 0; }, tint: 0.1, lift: -0.02 });
    out.push({ kind: 'sugarcane', mat: 'mid', count: 45, vars: [plain(() => B.sugarcaneGeometry(seed(), false), { r: 0.7 }), plain(() => B.sugarcaneGeometry(seed(), false), { r: 0.7 }), plain(() => B.sugarcaneGeometry(seed(), true), { r: 0.7 })],
      zones: { jungle: 1, grass: 1, beach: 0.5 }, minH: 1.3, maxH: 30, minStream: 3.8, group: [1, 3, 2.2],
      accept: (x, z) => { const d = this.streamD(x, z); return d < 16 ? 1 : 0; } });
    out.push({ kind: 'nest', mat: 'rock', count: 40, vars: [2, 3, 4].map((n) => plain(() => B.nestGeometry(seed(), n), { r: 0.45, s: [1.1, 1.5] })), tint: 0.06,
      gen: (ctx) => [...ctx.pickZone(['hill'], 14, 14), ...ctx.pickZone(['rocks'], 10, 0, (x, z, y) => y > 1.2), ...ctx.nearPlaced('palm', 14, 0.5, 1.1, ['beach', 'grass'])] });

    // ================================================================ decoration (unregistered)
    out.push({ kind: 'bigleaf', reg: false, mat: 'mid', count: 700, vars: [
      plain(() => B.bigLeafGeometry(seed(), 0), { s: [0.9, 1.4] }), plain(() => B.bigLeafGeometry(seed(), 0), { s: [0.9, 1.4] }),
      plain(() => B.bigLeafGeometry(seed(), 1), { s: [0.9, 1.4] }), plain(() => B.bigLeafGeometry(seed(), 1), { s: [0.9, 1.4] }), plain(() => B.bigLeafGeometry(seed(), 2), { s: [0.9, 1.3] }),
    ], zones: { jungle: 1, grass: 0.1 }, minH: 2.8, maxH: 40, clump: [0.06, 0.1, 31], group: [1, 4, 2.5], minStream: 2.6, openStart: true });
    out.push({ kind: 'groundleaf', reg: false, mat: 'low', count: 900, vars: [0.3, 0.26, 0.35].map((h) => plain(() => B.groundLeafGeometry(seed(), h), { s: [0.9, 1.6] })),
      zones: { jungle: 1, grass: 0.2, hill: 0.2 }, minH: 2.8, maxH: 40, clump: [0.09, 0.05, 41], minStream: 2.6 });
    out.push({ kind: 'fern2', reg: false, mat: 'low', count: 420, vars: [0.29, 0.25, 0.33].map((h) => plain(() => B.fernGeometry(seed(), h), { s: [0.9, 1.5] })),
      zones: { jungle: 1 }, minH: 2.8, maxH: 40, clump: [0.08, 0.1, 51], minStream: 2.6, group: [1, 3, 2] });
    out.push({ kind: 'tallgrass', reg: false, mat: 'low', count: 480, vars: [0, 1].map(() => plain(() => B.grassTuft(seed(), { n: 14, h0: 1.0, h1: 1.7, hue: 0.25, seedHead: true, dry: 0.12, bend: 0.5, w: 0.05 }), { s: [0.9, 1.3] })),
      zones: { grass: 1, hill: 0.3, jungle: 0.06 }, minH: 1.8, maxH: 60, group: [1, 4, 2], minStream: 2.6 });
    out.push({ kind: 'dunegrass', reg: false, mat: 'low', count: 330, vars: rn(3, () => plain(() => B.dunGrassGeometry(seed()), { s: [0.9, 1.4] })),
      zones: { beach: 1 }, minH: 1.4, maxH: 3.6, group: [1, 4, 2.5], openStart: false, accept: (x, z, y) => smoothstep(1.4, 2.0, y) });
    out.push({ kind: 'creeper', reg: false, mat: 'low', count: 130, vars: rn(3, () => plain(() => B.creeperGeometry(seed()), { s: [0.9, 1.5] })),
      zones: { beach: 1 }, minH: 1.3, maxH: 3.2, group: [1, 2, 3] });
    out.push({ kind: 'reed', reg: false, mat: 'low', count: 200, vars: rn(3, () => plain(() => B.reedGeometry(seed()), { s: [0.9, 1.4] })),
      zones: { ...ALL_LAND, stream: 1 }, minH: 1.3, maxH: 30, minStream: 2.3, group: [1, 4, 2],
      accept: (x, z) => { const d = this.streamD(x, z), p = this.pondD(x, z); return (d < 9 && d > 2.3) || (p > 0.4 && p < 5) ? 1 : 0; }, maxSlope: 0.9 });
    return out;
  }

  // ---------------------------------------------------------------- build
  build() {
    const t = this.terrain, rng = this.rng;
    const dummy = new THREE.Object3D(), tint = new THREE.Color();
    // occupancy grid for solids (trunks must not overlap)
    const occ = new Map();
    const occKey = (x, z) => `${Math.floor(x / 3)},${Math.floor(z / 3)}`;
    const occFree = (x, z, r) => {
      const ix = Math.floor(x / 3), iz = Math.floor(z / 3);
      for (let i = ix - 1; i <= ix + 1; i++) for (let j = iz - 1; j <= iz + 1; j++) {
        const c = occ.get(`${i},${j}`); if (!c) continue;
        for (const o of c) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
      }
      return true;
    };
    const occAdd = (x, z, r) => { const k = occKey(x, z); (occ.get(k) || occ.set(k, []).get(k)).push({ x, z, r }); };

    const ctx = {
      nearPlaced: (kind, n, dmin, dmax, zones) => {
        const src = this.placed[kind] || [], out = [];
        for (let k = 0; k < n * 6 && out.length < n && src.length; k++) {
          const p = src[rng.int(0, src.length - 1)], a = rng.float(0, TAU), d = rng.float(dmin, dmax);
          const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
          if (!zones.includes(t.zoneAt(x, z)) || !t.isLand(x, z, 0.3) || t.slopeAt(x, z) > 0.8 || this.streamD(x, z) < 3) continue;
          out.push({ x, z });
        }
        return out;
      },
      pickZone: (zones, n, _n, filter) => {
        const out = [];
        for (let k = 0; k < n * 600 && out.length < n; k++) {
          const a = rng.float(0, TAU), r = Math.sqrt(rng.next()) * 285, x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (!zones.includes(t.zoneAt(x, z))) continue;
          const y = t.heightAt(x, z);
          if (y < 0.4 || t.slopeAt(x, z) > 1.0 || (filter && !filter(x, z, y))) continue;
          out.push({ x, z });
        }
        return out;
      },
    };

    for (const spec of this.specs()) {
      const target = Math.round(spec.count * this.dens);
      const vars = spec.vars;
      const geos = vars.map((v) => v.g || v.b());
      const items = [];
      const clumpF = spec.clump;
      const accept = (x, z) => {
        const zone = t.zoneAt(x, z);
        const zw = spec.zones[zone];
        if (!zw) return null;
        const y = t.heightAt(x, z);
        if (y < spec.minH || y > spec.maxH) return null;
        if (rng.next() > zw) return null;
        if (clumpF) { const c = this.clump(x, z, clumpF[0], clumpF[2]); if (rng.next() > smoothstep(clumpF[1], clumpF[1] + 0.3, c)) return null; }
        if (spec.accept && rng.next() > spec.accept(x, z, y, zone)) return null;
        if (t.slopeAt(x, z) > (spec.maxSlope ?? 0.8)) return null;
        if (spec.intertidal) {
          if (this.streamD(x, z) < 3.5) return null;
        } else if (!spec.rockLike) {
          if (this.streamD(x, z) < (spec.minStream ?? 3.5)) return null;
          if (!t.isLand(x, z, 0.3)) return null;
        } else if (zone !== 'stream' && !t.isLand(x, z, 0.0)) return null;
        if (spec.openStart && Math.hypot(x - this.start.x, z - this.start.z) < 14) return null;
        return { zone, y };
      };
      const push = (x, z, zone, y, forceV) => {
        const vi = forceV ?? (spec.pick ? spec.pick(zone, rng, vars) : rng.weighted(vars.map((v, i) => [i, v.w ?? 1])));
        const v = vars[vi];
        if (v.occ && !occFree(x, z, v.occ)) return false;
        const sr = v.s || [0.85, 1.25];
        const s = rng.float(sr[0], sr[1]) * (spec.scaleZone ? spec.scaleZone(zone) : 1);
        const rot = spec.rot ? spec.rot(x, z, rng) : rng.float(0, TAU);
        items.push({ x, z, y, rot, s, v: vi });
        if (v.occ) occAdd(x, z, v.occ);
        return true;
      };
      if (spec.gen) {
        for (const p of spec.gen(ctx)) { const y = t.heightAt(p.x, p.z); push(p.x, p.z, t.zoneAt(p.x, p.z), y); if (items.length >= target) break; }
      } else {
        let tries = 0;
        const grp = spec.group;
        while (items.length < target && tries < target * 90) {
          tries++;
          const a = rng.float(0, TAU), r = Math.sqrt(rng.next()) * 285;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          const ok = accept(x, z);
          if (!ok) continue;
          if (!push(x, z, ok.zone, ok.y)) continue;
          if (grp && rng.next() < 0.7) {
            const n = rng.int(grp[0], grp[1]);
            for (let g = 0; g < n; g++) {
              const ga = rng.float(0, TAU), gd = rng.float(0.6, grp[2]);
              const gx = x + Math.cos(ga) * gd, gz = z + Math.sin(ga) * gd;
              const ok2 = accept(gx, gz);
              if (ok2) push(gx, gz, ok2.zone, ok2.y);
            }
          }
        }
      }
      this.placed[spec.kind] = (this.placed[spec.kind] || []).concat(items);
      this._emit(spec, geos, items, dummy, tint);
    }

    // ---- lianas hanging from mid-height trees
    this._buildVines(dummy, tint);

    // ---- near-player grass carpet
    this.carpet = new GrassCarpet(this.scene, t, this.materials.low, this.dens);
    this.carpet.update({ x: this.start.x, z: this.start.z });
  }

  _tint(c, amp, bananaTint) {
    const r = this.rng;
    c.setRGB(1 + (r.next() - 0.5) * amp * 0.9, 1 + (r.next() - 0.5) * amp * 1.4, 1 + (r.next() - 0.5) * amp * 1.0);
    return c;
  }

  _emit(spec, geos, items, dummy, tint) {
    const per = geos.map(() => []);
    for (const it of items) per[it.v].push(it);
    const reg = spec.reg !== false;
    geos.forEach((geo, v) => {
      const list = per[v];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, this.materials[spec.mat], list.length);
      mesh.castShadow = !!spec.cast;
      mesh.receiveShadow = true;
      mesh.name = `${spec.kind}#${v}`;
      const vv = spec.vars[v];
      const amp = spec.tint ?? 0.3;
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y - (spec.lift ?? 0.05), p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, this._tint(tint, amp));
        if (reg) {
          const cr = spec.solid ? (vv.cr || 0.4) * p.s : 0;
          this.nodes.add({ kind: spec.kind, x: p.x, y: p.y, z: p.z, r: (vv.r ?? 0.6) * p.s, mesh, index: i, matrix: dummy.matrix.clone(), scale: p.s, height: geo.userData?.height, solid: !!spec.solid, cr, variant: v });
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      (this.meshes[spec.kind] ||= []).push(mesh);
      this.counts[spec.kind] = (this.counts[spec.kind] || 0) + list.length;
    });
  }

  _buildVines(dummy, tint) {
    const trees = this.placed.tree || [];
    const rng = this.rng;
    const treeSpec = this._treeVarsCache;
    // rebuild the tree geometries' info: the tree meshes' geometries carry userData.top
    const meshes = this.meshes.tree || [];
    const byVariant = new Map();
    for (const m of meshes) byVariant.set(+m.name.split('#')[1], m.geometry);
    const per = new Map();
    for (const p of trees) {
      const g = byVariant.get(p.v);
      if (!g || !g.userData.top || g.userData.crown !== 2.2 || p.s < 0.8) continue;
      if (!this._vineOK(p.v)) continue;
      if (rng.next() > 0.3) continue;
      (per.get(p.v) || per.set(p.v, []).get(p.v)).push(p);
    }
    for (const [v, list] of per) {
      const tg = byVariant.get(v);
      const geo = B.vineGeometry(rng.int(1, 1e6), tg);
      const { anchor } = geo.userData;
      const mesh = new THREE.InstancedMesh(geo, this.materials.mid, list.length);
      mesh.receiveShadow = true; mesh.name = `vine#${v}`;
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y - 0.05, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, this._tint(tint, 0.3));
        const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
        const vx = p.x + (anchor.x * cs + anchor.z * sn) * p.s, vz = p.z + (-anchor.x * sn + anchor.z * cs) * p.s;
        this.nodes.add({ kind: 'vine', x: vx, y: p.y, z: vz, r: 0.4, pickY: 1.2, mesh, index: i, matrix: dummy.matrix.clone(), scale: p.s, variant: v, solid: false, cr: 0 });
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
      this.scene.add(mesh);
      (this.meshes.vine ||= []).push(mesh);
      this.counts.vine = (this.counts.vine || 0) + list.length;
    }
  }
  _vineOK(v) { return [3, 4, 5, 7].includes(v); }

  update(time, wind, camPos) {
    for (const m of [this.materials.tree, this.materials.mid, this.materials.low]) {
      m.userData.uniforms.uTime.value = time;
      m.userData.uniforms.uWind.value = wind;
    }
    if (camPos && this.carpet) this.carpet.update(camPos);
  }
}
