// world/flora.js — procedural plants and rocks, drawn with InstancedMesh. Each harvestable instance is also a
// "node" in the resource registry (world/nodes.js) so it can be gathered, chopped and later regrow.
//
// Kinds (node.kind): palm, tree, bush_berry, bush, fern, rock, boulder, bamboo, grass_tuft, herb, driftwood …
// The meshes are low-poly but shaded with vertex colours + wind sway in the vertex shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, clamp } from '../core/rng.js';

// -------------------------------------------------------------- geometry builders (vertex-coloured)
function paint(geo, color, jitter = 0.06, seed = 1) {
  const r = new RNG(seed);
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = c.clone().offsetHSL((r.next() - 0.5) * jitter * 0.3, 0, (r.next() - 0.5) * jitter);
    col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// all merged geometries need the same attribute set
function clean(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
const merge = (list) => mergeGeometries(list.map(clean), false);

/** a bent palm: trunk of stacked rings following a curve + drooping fronds + coconuts */
function palmGeometry(seed) {
  const r = new RNG(seed);
  const parts = [];
  const H = r.float(6.5, 9.5), bend = r.float(0.8, 2.4);
  const segs = 9;
  let prev = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(bend * t * t, H * t, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 12, 0.2, 7, false);
  // taper: scale radius by height
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / H;
    const c = curve.getPointAt(clamp(t, 0, 1));
    const k = 1.35 - 0.55 * t;
    p.setX(i, c.x + (p.getX(i) - c.x) * k);
    p.setZ(i, c.z + (p.getZ(i) - c.z) * k);
  }
  trunk.computeVertexNormals();
  // ring bands
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color('#8a6a45'), b = new THREE.Color('#5e4630');
  for (let i = 0; i < p.count; i++) {
    const band = (Math.sin(p.getY(i) * 7) * 0.5 + 0.5);
    const c = a.clone().lerp(b, band * 0.7);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.push(trunk);
  const top = curve.getPointAt(1);
  prev = top;
  // fronds: a strip of leaflets drooping out
  const nF = r.int(7, 10);
  for (let f = 0; f < nF; f++) {
    const ang = (f / nF) * Math.PI * 2 + r.float(-0.2, 0.2);
    const len = r.float(3.2, 4.6);
    const droop = r.float(0.5, 1.1);
    const verts = [], cols = [];
    const green = new THREE.Color().setHSL(r.float(0.24, 0.29), r.float(0.45, 0.6), r.float(0.26, 0.34));
    const n = 10;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const P = (t) => new THREE.Vector3(Math.cos(ang) * len * t, Math.sin(t * Math.PI * 0.55) * 0.9 - droop * t * t * 2.2, Math.sin(ang) * len * t);
      const p0 = P(t0), p1 = P(t1);
      const w0 = Math.sin((1 - t0) * Math.PI * 0.5 + 0.2) * 0.75, w1 = Math.sin((1 - t1) * Math.PI * 0.5 + 0.2) * 0.75;
      const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
      // leaflets angle down a little at the sides (V shape)
      const l0 = p0.clone().addScaledVector(side, w0).add(new THREE.Vector3(0, -0.18 * w0, 0)), r0 = p0.clone().addScaledVector(side, -w0).add(new THREE.Vector3(0, -0.18 * w0, 0));
      const l1 = p1.clone().addScaledVector(side, w1).add(new THREE.Vector3(0, -0.18 * w1, 0)), r1 = p1.clone().addScaledVector(side, -w1).add(new THREE.Vector3(0, -0.18 * w1, 0));
      for (const q of [p0, l0, p1, p1, l0, l1, p0, p1, r0, r0, p1, r1]) verts.push(q.x + top.x, q.y + top.y, q.z + top.z);
      for (let m = 0; m < 12; m++) { const c = green.clone().offsetHSL(0, 0, (t0 - 0.5) * 0.08); cols.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  // coconuts cluster
  const nC = r.int(2, 4);
  for (let c = 0; c < nC; c++) {
    const s = new THREE.SphereGeometry(0.17, 7, 6);
    s.translate(top.x + Math.cos(c * 2.1) * 0.25, top.y - 0.3, top.z + Math.sin(c * 2.1) * 0.25);
    parts.push(paint(s, '#5b4a24', 0.1, seed + c));
  }
  const geo = merge(parts);
  geo.userData = { height: H, top };
  return geo;
}

function broadTreeGeometry(seed) {
  const r = new RNG(seed);
  const parts = [];
  const H = r.float(5, 8);
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, H, 7, 3);
  trunk.translate(0, H / 2, 0);
  parts.push(paint(trunk, '#5b4632', 0.12, seed));
  const nB = r.int(5, 8);
  for (let i = 0; i < nB; i++) {
    const s = new THREE.IcosahedronGeometry(r.float(1.3, 2.2), 0);
    const p = s.attributes.position;
    for (let k = 0; k < p.count; k++) { const f = 1 + (r.next() - 0.5) * 0.3; p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.8, p.getZ(k) * f); }
    s.translate(r.float(-1.3, 1.3), H + r.float(-0.8, 1.2), r.float(-1.3, 1.3));
    parts.push(paint(s, new THREE.Color().setHSL(r.float(0.22, 0.3), 0.5, r.float(0.2, 0.28)), 0.12, seed + i * 7));
  }
  const geo = merge(parts);
  geo.computeVertexNormals();
  return geo;
}

function bushGeometry(seed, berries = false) {
  const r = new RNG(seed);
  const parts = [];
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const s = new THREE.IcosahedronGeometry(r.float(0.45, 0.8), 0);
    s.scale(1, 0.75, 1);
    s.translate(r.float(-0.5, 0.5), r.float(0.35, 0.7), r.float(-0.5, 0.5));
    parts.push(paint(s, new THREE.Color().setHSL(r.float(0.24, 0.32), 0.5, r.float(0.2, 0.3)), 0.15, seed + i));
  }
  if (berries) {
    for (let i = 0; i < 14; i++) {
      const b = new THREE.SphereGeometry(0.07, 5, 4);
      const a = r.float(0, Math.PI * 2), rr = r.float(0.45, 0.8);
      b.translate(Math.cos(a) * rr, r.float(0.4, 0.95), Math.sin(a) * rr);
      parts.push(paint(b, '#c3263f', 0.1, seed + 50 + i));
    }
  }
  return merge(parts);
}

function fernGeometry(seed) {
  const r = new RNG(seed);
  const verts = [], cols = [];
  const n = r.int(6, 9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.float(-0.3, 0.3), len = r.float(0.7, 1.2);
    const c = new THREE.Color().setHSL(r.float(0.25, 0.32), 0.55, r.float(0.22, 0.32));
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz * 0.18, sz = dx * 0.18;
    const tip = [dx * len, 0.25, dz * len], mid = [dx * len * 0.5, 0.55, dz * len * 0.5];
    const tri = [[0, 0.05, 0], [mid[0] + sx, mid[1], mid[2] + sz], tip, [0, 0.05, 0], tip, [mid[0] - sx, mid[1], mid[2] - sz]];
    for (const v of tri) { verts.push(...v); cols.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function rockGeometry(seed, size = 1) {
  const r = new RNG(seed);
  const g = new THREE.DodecahedronGeometry(size, 1);
  const p = g.attributes.position;
  const sx = r.float(0.8, 1.4), sy = r.float(0.5, 0.9), sz = r.float(0.8, 1.3);
  for (let i = 0; i < p.count; i++) {
    const f = 1 + (r.next() - 0.5) * 0.25;
    p.setXYZ(i, p.getX(i) * sx * f, Math.max(-0.2 * size, p.getY(i) * sy * f), p.getZ(i) * sz * f);
  }
  g.computeVertexNormals();
  return paint(g, r.pick(['#8a8275', '#7a7368', '#958c7c']), 0.1, seed);
}

function bambooGeometry(seed) {
  const r = new RNG(seed);
  const parts = [];
  const n = r.int(5, 9);
  for (let i = 0; i < n; i++) {
    const h = r.float(4, 7);
    const c = new THREE.CylinderGeometry(0.06, 0.07, h, 6, 6);
    c.translate(r.float(-0.6, 0.6), h / 2, r.float(-0.6, 0.6));
    parts.push(paint(c, r.pick(['#8fae4a', '#a3b956', '#7b9a3c']), 0.08, seed + i));
  }
  return merge(parts);
}

function grassGeometry(seed) {
  const r = new RNG(seed);
  const verts = [], cols = [];
  for (let i = 0; i < 9; i++) {
    const a = r.float(0, Math.PI * 2), h = r.float(0.35, 0.75), x = r.float(-0.3, 0.3), z = r.float(-0.3, 0.3);
    const c = new THREE.Color().setHSL(r.float(0.2, 0.28), 0.5, r.float(0.3, 0.42));
    const dx = Math.cos(a) * 0.05, dz = Math.sin(a) * 0.05, lean = r.float(-0.15, 0.15);
    for (const v of [[x - dx, 0, z - dz], [x + dx, 0, z + dz], [x + lean, h, z + lean * 0.5]]) { verts.push(...v); cols.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function herbGeometry(seed) {
  const r = new RNG(seed);
  const parts = [fernGeometry(seed)];
  parts[0].scale(0.45, 0.6, 0.45);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.SphereGeometry(0.05, 5, 4);
    f.translate(r.float(-0.2, 0.2), r.float(0.3, 0.42), r.float(-0.2, 0.2));
    parts.push(paint(f, '#f2e35a', 0.1, seed + i));
  }
  return merge(parts);
}

function driftwoodGeometry(seed) {
  const r = new RNG(seed);
  const len = r.float(1.4, 2.6);
  const c = new THREE.CylinderGeometry(0.09, 0.13, len, 6, 2);
  c.rotateZ(Math.PI / 2);
  c.rotateY(r.float(0, Math.PI));
  c.translate(0, 0.1, 0);
  return paint(c, '#a89478', 0.12, seed);
}

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
  transformed.x += sin(uTime * (1.2 + uWind) + ip.x * 0.3 + ip.z * 0.2) * sway * 0.06;
  transformed.z += cos(uTime * (1.0 + uWind) + ip.z * 0.3) * sway * 0.04;`);
  };
  return m;
}

// -------------------------------------------------------------- placement
/**
 * Flora places instanced plants on the terrain. `nodes` is the NodeRegistry: every harvestable instance is
 * registered there ({ kind, x, y, z, mesh, index, ... }); hiding an instance (gathered) scales it to 0.
 */
export class Flora {
  constructor(scene, terrain, nodes, seed = 7, quality = 'high') {
    this.scene = scene; this.terrain = terrain; this.nodes = nodes;
    this.rng = new RNG(seed * 13 + 5);
    this.materials = { tree: swayMaterial(0.35), low: swayMaterial(1.2), rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }) };
    this.meshes = {};
    const dens = quality === 'low' ? 0.55 : quality === 'mid' ? 0.8 : 1;
    this.plan = [
      // kind, variants, count, zones, material, builder, options
      { kind: 'palm', variants: 4, count: 230 * dens, zones: ['beach', 'grass'], minH: 0.8, maxH: 9, mat: 'tree', build: palmGeometry, cast: true, radius: 0.6 },
      { kind: 'tree', variants: 5, count: 620 * dens, zones: ['jungle', 'hill'], minH: 3, maxH: 60, mat: 'tree', build: broadTreeGeometry, cast: true, radius: 0.7 },
      { kind: 'bamboo', variants: 3, count: 55 * dens, zones: ['jungle'], minH: 3, maxH: 30, mat: 'tree', build: bambooGeometry, cast: true, radius: 0.8, near: 'stream' },
      { kind: 'bush_berry', variants: 3, count: 70 * dens, zones: ['jungle', 'grass'], minH: 2, maxH: 40, mat: 'low', build: (s) => bushGeometry(s, true), cast: true, radius: 0.9 },
      { kind: 'bush', variants: 3, count: 420 * dens, zones: ['jungle', 'grass', 'hill'], minH: 2, maxH: 60, mat: 'low', build: (s) => bushGeometry(s, false), radius: 0.9 },
      { kind: 'fern', variants: 3, count: 900 * dens, zones: ['jungle'], minH: 2, maxH: 50, mat: 'low', build: fernGeometry, radius: 0.6 },
      { kind: 'grass_tuft', variants: 3, count: 1100 * dens, zones: ['grass', 'hill', 'jungle'], minH: 1.5, maxH: 60, mat: 'low', build: grassGeometry, radius: 0.4 },
      { kind: 'herb', variants: 2, count: 45 * dens, zones: ['jungle', 'grass', 'hill'], minH: 2, maxH: 60, mat: 'low', build: herbGeometry, radius: 0.3 },
      { kind: 'rock', variants: 4, count: 200 * dens, zones: ['rocks', 'hill', 'cliff', 'stream', 'beach'], minH: -0.3, maxH: 60, mat: 'rock', build: (s) => rockGeometry(s, 0.35), radius: 0.4 },
      { kind: 'boulder', variants: 3, count: 60 * dens, zones: ['rocks', 'hill', 'cliff'], minH: 0, maxH: 60, mat: 'rock', build: (s) => rockGeometry(s, 1.6), cast: true, radius: 1.8 },
      { kind: 'driftwood', variants: 3, count: 45 * dens, zones: ['beach'], minH: 0.3, maxH: 2.2, mat: 'rock', build: driftwoodGeometry, radius: 0.8 },
    ];
  }

  build() {
    const t = this.terrain;
    const dummy = new THREE.Object3D();
    for (const spec of this.plan) {
      const count = Math.round(spec.count);
      const geos = [];
      for (let v = 0; v < spec.variants; v++) geos.push(spec.build(this.rng.int(1, 1e6)));
      // positions first, then split by variant
      const per = geos.map(() => []);
      let tries = 0;
      while (per.reduce((s, a) => s + a.length, 0) < count && tries < count * 40) {
        tries++;
        const a = this.rng.float(0, Math.PI * 2), r = Math.sqrt(this.rng.next()) * 300;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const zone = t.zoneAt(x, z);
        if (!spec.zones.includes(zone)) continue;
        const y = t.heightAt(x, z);
        if (y < spec.minH || y > spec.maxH) continue;
        if (spec.near === 'stream' && t.streamInfo(x, z).d > 22) continue;
        if (t.slopeAt(x, z) > (spec.kind === 'boulder' || spec.kind === 'rock' ? 2 : 0.8)) continue;
        if (t.streamInfo(x, z).d < 3.5 && spec.kind !== 'rock') continue;
        // keep the start beach clear-ish
        per[this.rng.int(0, geos.length - 1)].push({ x, y, z, rot: this.rng.float(0, Math.PI * 2), s: this.rng.float(0.8, 1.25) });
      }
      geos.forEach((geo, v) => {
        const list = per[v];
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(geo, this.materials[spec.mat], list.length);
        mesh.castShadow = !!spec.cast;
        mesh.receiveShadow = true;
        mesh.name = `${spec.kind}#${v}`;
        list.forEach((p, i) => {
          dummy.position.set(p.x, p.y - 0.05, p.z);
          dummy.rotation.set(0, p.rot, 0);
          dummy.scale.setScalar(p.s);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          const solidR = { palm: 0.3, tree: 0.42, bamboo: 0.75, boulder: 1.7 }[spec.kind];
          this.nodes.add({ kind: spec.kind, x: p.x, y: p.y, z: p.z, r: spec.radius * p.s, mesh, index: i, matrix: dummy.matrix.clone(), scale: p.s, height: geo.userData?.height, solid: !!solidR, cr: (solidR || 0) * p.s, variant: v });
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        (this.meshes[spec.kind] ||= []).push(mesh);
      });
    }
  }

  update(time, wind) {
    for (const m of [this.materials.tree, this.materials.low]) {
      m.userData.uniforms.uTime.value = time;
      m.userData.uniforms.uWind.value = wind;
    }
  }
}
