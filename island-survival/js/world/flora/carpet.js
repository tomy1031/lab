// world/flora/carpet.js — near-player ground cover: grass tufts, leafy rosettes and wild flowers scattered on a
// deterministic per-cell grid around the camera, re-scattered as the player moves (no shimmer, nothing registered).
import * as THREE from 'three';
import { smoothstep } from '../../core/rng.js';
import { Build, HSL, V } from './geo.js';

const CELL = 2.0, RADIUS = 34;
function h01(ix, iz, k) { const s = Math.sin(ix * 127.1 + iz * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); }

function tuftGeo(seed) {
  const b = new Build(seed), r = b.rng;
  for (let i = 0; i < 7; i++) {
    const a = r.float(0, 6.28), d = Math.sqrt(r.next()) * 0.14, h = r.float(0.3, 0.7);
    b.blade(Math.cos(a) * d, -0.02, Math.sin(a) * d, r.float(0, 6.28), h, 0.04, h * r.float(0.15, 0.55), HSL(0.29, 0.6, r.float(0.15, 0.2)), HSL(0.26, 0.65, r.float(0.3, 0.4)));
  }
  return b.geo();
}
function coverGeo(seed) {
  const b = new Build(seed), r = b.rng;
  for (let i = 0; i < 5; i++) b.heartLeaf(0, 0.02 + r.float(0, 0.06), 0, i * 2.4 + r.float(-0.3, 0.3), r.float(0.15, 0.5), r.float(0.22, 0.34), HSL(0.3, 0.6, 0.16), HSL(0.27, 0.6, 0.32), { n: 8, droop: 0.4 });
  return b.geo();
}
function flowerGeo(seed) {
  const b = new Build(seed), r = b.rng;
  for (let k = 0; k < 2; k++) {
    const ox = r.float(-0.08, 0.08), oz = r.float(-0.08, 0.08), h = r.float(0.22, 0.36);
    b.tube([V(ox, 0, oz), V(ox, h, oz)], 0.008, 3, () => HSL(0.28, 0.5, 0.26));
    const pc = new THREE.Color(1, 1, 1), ctr = new THREE.Color('#f5c400');
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * 6.28, a2 = ((p + 1) / 5) * 6.28;
      b.tri(V(ox, h, oz), V(ox + Math.cos(a) * 0.07, h + 0.015, oz + Math.sin(a) * 0.07), V(ox + Math.cos(a2) * 0.07, h + 0.015, oz + Math.sin(a2) * 0.07), ctr, pc, pc);
    }
  }
  return b.geo();
}

export class GrassCarpet {
  constructor(scene, terrain, material, dens = 1) {
    this.t = terrain; this.dens = dens;
    this.cx = 1e9; this.cz = 1e9;
    const mk = (geo, max) => {
      const m = new THREE.InstancedMesh(geo, material, max);
      m.frustumCulled = false; m.receiveShadow = true; m.count = 0; m.name = 'carpet';
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      scene.add(m);
      return m;
    };
    this.grass = mk(tuftGeo(11), Math.round(4800 * dens));
    this.cover = mk(coverGeo(12), Math.round(2800 * dens));
    this.flowers = mk(flowerGeo(13), Math.round(900 * dens));
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    this.palette = ['#ffffff', '#ffe14a', '#ff8fb0', '#ffa24a', '#c8a2ff'].map((c) => new THREE.Color(c));
  }

  update(cam) {
    if (!cam) return;
    if (Math.hypot(cam.x - this.cx, cam.z - this.cz) < 1.6) return;
    this.cx = cam.x; this.cz = cam.z;
    const t = this.t, d = this.dummy, col = this.col;
    const i0 = Math.floor((cam.x - RADIUS) / CELL), i1 = Math.floor((cam.x + RADIUS) / CELL);
    const j0 = Math.floor((cam.z - RADIUS) / CELL), j1 = Math.floor((cam.z + RADIUS) / CELL);
    let ng = 0, nc = 0, nf = 0;
    const G = this.grass, Cv = this.cover, F = this.flowers;
    const maxG = G.instanceMatrix.count, maxC = Cv.instanceMatrix.count, maxF = F.instanceMatrix.count;
    const place = (mesh, idx, x, y, z, s, tint, sy = 1) => {
      d.position.set(x, y, z); d.rotation.set(0, h01(x, z, 9) * 6.28, 0); d.scale.set(s, s * sy, s); d.updateMatrix();
      mesh.setMatrixAt(idx, d.matrix); mesh.setColorAt(idx, tint);
    };
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cxm = (i + 0.5) * CELL, czm = (j + 0.5) * CELL;
        const dist0 = Math.hypot(cxm - cam.x, czm - cam.z);
        if (dist0 > RADIUS + 1) continue;
        // candidates: 6 grass, 4 cover, 1 flower per cell
        for (let k = 0; k < 11; k++) {
          const x = (i + h01(i, j, k * 3 + 1)) * CELL, z = (j + h01(i, j, k * 3 + 2)) * CELL;
          const zone = t.zoneAt(x, z);
          let pg = 0, pc = 0, pf = 0;
          switch (zone) {
            case 'jungle': pg = 0.55; pc = 1; break;
            case 'grass': pg = 1; pc = 0.35; pf = 1; break;
            case 'hill': pg = 0.45; pc = 0.15; break;
            case 'beach': break;
            default: continue;
          }
          const y = t.heightAt(x, z);
          if (y < 2.9) continue;
          if (zone === 'beach' || zone === 'rocks') continue;
          const s0 = 1 - smoothstep(RADIUS * 0.65, RADIUS, Math.hypot(x - cam.x, z - cam.z));
          if (s0 <= 0.02) continue;
          const r1 = h01(i, j, k * 3 + 3), r2 = h01(j, i, k + 40);
          const dark = zone === 'jungle' ? 0.75 : 1;
          if (k < 6) {
            if (r1 > pg * this.dens || ng >= maxG) continue;
            col.setRGB((0.8 + 0.5 * r2) * dark, (0.9 + 0.3 * r1 * 1.0) * dark, (0.65 + 0.4 * h01(i, j, k + 7)) * dark);
            place(G, ng++, x, y, z, (0.85 + 0.9 * r2) * s0, col, 1 + r1 * 0.6);
          } else if (k < 10) {
            if (r1 > pc * this.dens || nc >= maxC) continue;
            col.setRGB((0.75 + 0.45 * r2) * dark, (0.85 + 0.3 * r1) * dark, (0.65 + 0.5 * h01(i, j, k + 5)) * dark);
            place(Cv, nc++, x, y, z, (0.9 + 0.9 * r2) * s0, col);
          } else {
            if (r1 > 0.35 * pf * this.dens || nf >= maxF) continue;
            col.copy(this.palette[Math.floor(r2 * this.palette.length) % this.palette.length]);
            place(F, nf++, x, y, z, (0.9 + 0.5 * r2) * s0, col);
          }
        }
      }
    }
    G.count = ng; Cv.count = nc; F.count = nf;
    for (const m of [G, Cv, F]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
