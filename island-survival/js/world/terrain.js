// world/terrain.js — the island: a height grid (fast heightAt / zoneAt / waterAt queries for every system),
// the terrain mesh with vertex colours, and the fresh-water surfaces (stream ribbon + pond).
//
// Coordinates: metres, island centred on the origin, y up, sea level y = 0 (the tide moves the sea ±0.6 m).
// North is −z. The layout (peak, stream, pond, bay, cliffs, wreck …) is fixed in LAYOUT so other modules
// (flora, fauna, resources, the companion, the map screen) can refer to the same places.
import * as THREE from 'three';
import { Noise2D, clamp, lerp, smoothstep } from '../core/rng.js';

export const WORLD = {
  size: 800,          // height grid covers −400…400
  grid: 400,          // grid cells per side (2 m)
  meshSize: 640,      // terrain mesh covers −320…320 (the rest is deep sea under fog)
};

// Places on the island. Names are Japanese (shown on the map and used by the companion when talking).
export const LAYOUT = {
  peak: { x: 70, z: -85, h: 46, r: 95, name: '見張り山' },
  spring: { x: 52, z: -52, name: '湧き水' },
  stream: [[52, -52], [30, -30], [8, -6], [-18, 22], [-48, 52], [-82, 84], [-118, 112], [-150, 140]],
  pond: { x: -70, z: -48, r: 15, name: '静かな池' },
  bay: { x: -150, z: 150, name: '入り江' },
  cave: { x: 118, z: -50, name: '岩の洞窟' },
  wreck: { x: 178, z: 72, name: '難破船' },
  tidepools: { x: -40, z: -215, name: '潮だまり' },
  clearing: { x: -10, z: -15, name: '草原' },
  start: { x: 150, z: 95, name: '東の浜' },
  lookout: { x: 70, z: -85, name: '山頂' },
};

const ZONE_NAMES = {
  sea: '海', beach: '砂浜', rocks: '岩場', jungle: 'ジャングル', grass: '草原', hill: '山', stream: '小川', pond: '池', cliff: '崖',
};
export const zoneName = (z) => ZONE_NAMES[z] || z;

export class Terrain {
  constructor(seed = 7) {
    this.seed = seed;
    this.noise = new Noise2D(seed);
    this.noise2 = new Noise2D(seed * 31 + 7);
    const N = WORLD.grid + 1;
    this.N = N;
    this.cell = WORLD.size / WORLD.grid;
    this.h = new Float32Array(N * N);
    this.zone = new Uint8Array(N * N);
    this.streamBed = new Float32Array(LAYOUT.stream.length);
    this.pondLevel = 0;
    this.build();
  }

  // ------------------------------------------------------------------ generation
  coastRadius(ang) {
    const n = this.noise;
    let r = 232 + 34 * n.fbm(Math.cos(ang) * 1.3 + 5, Math.sin(ang) * 1.3 + 5, 3) + 14 * n.noise(Math.cos(ang) * 4 + 9, Math.sin(ang) * 4 + 9);
    // the bay in the south-west bites into the coast
    const bayAng = Math.atan2(LAYOUT.bay.z, LAYOUT.bay.x);
    const d = Math.abs(Math.atan2(Math.sin(ang - bayAng), Math.cos(ang - bayAng)));
    r -= 55 * Math.exp(-(d * d) / 0.035);
    return r;
  }

  /** raw height before carving (rn = distance / coast radius) */
  rawHeight(x, z) {
    const n = this.noise;
    const r = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const R = this.coastRadius(ang);
    const rn = r / R;
    // north coast (z < 0, ang ≈ −π/2) has cliffs
    const north = smoothstep(0.35, 0.85, -Math.sin(ang)) * smoothstep(-0.6, 0.2, Math.cos(ang) * -0.2 + 0.3);
    if (rn >= 1) {
      // sea floor: shelves out a little (reef in the bay / east), then drops away
      const off = (r - R);
      return -0.6 - off * (0.09 + 0.05 * north) - 6 * smoothstep(20, 120, off) + 0.8 * n.noise(x * 0.05, z * 0.05);
    }
    const inland = smoothstep(0.95, 0.7 - 0.1 * north, rn);
    let h = 0.25 + (1 - rn) * 3.2; // beach rising gently
    h += inland * (4.5 + 5.5 * (0.5 + 0.5 * n.fbm(x * 0.012, z * 0.012, 4)));
    h += north * smoothstep(1.0, 0.9, rn) * 9; // cliff band
    // the hill
    const pk = LAYOUT.peak;
    const dp = Math.hypot(x - pk.x, z - pk.z) / pk.r;
    if (dp < 1.4) {
      const cone = Math.pow(clamp(1 - dp), 1.6);
      h += pk.h * cone * (0.85 + 0.25 * n.ridge(x * 0.03, z * 0.03, 3));
    }
    // small undulation everywhere
    h += 0.8 * n.fbm(x * 0.05 + 30, z * 0.05 - 12, 3) * inland;
    return h;
  }

  build() {
    const { N } = this;
    const half = WORLD.size / 2;
    const c = this.cell;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -half + i * c, z = -half + j * c;
        this.h[j * N + i] = this.rawHeight(x, z);
      }
    }
    // stream bed heights: from the spring down to the sea, never rising
    const S = LAYOUT.stream;
    for (let k = 0; k < S.length; k++) {
      const [x, z] = S[k];
      const g = this.sample(x, z);
      this.streamBed[k] = k === 0 ? g - 0.6 : Math.min(this.streamBed[k - 1] - 0.15, g - 0.8);
    }
    this.streamBed[S.length - 1] = -1.2;
    // pond level = ground at its centre minus a bit
    const P = LAYOUT.pond;
    this.pondLevel = this.sample(P.x, P.z) - 0.4;
    // carve
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -half + i * c, z = -half + j * c;
        let h = this.h[j * N + i];
        const s = this.streamInfo(x, z);
        if (s.d < 9) {
          const bed = s.bed - 0.7;
          const k = smoothstep(1.6, 8.5, s.d);
          h = Math.min(h, lerp(bed, Math.max(bed, h), k));
        }
        const dp = Math.hypot(x - P.x, z - P.z);
        if (dp < P.r + 8) {
          const bowl = this.pondLevel - 2.2 * clamp(1 - (dp / P.r) ** 2);
          const k = smoothstep(P.r - 2, P.r + 8, dp);
          h = Math.min(h, lerp(bowl, Math.max(h, this.pondLevel + 0.3), k));
        }
        this.h[j * N + i] = h;
      }
    }
    // zones
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -half + i * c, z = -half + j * c;
        this.zone[j * N + i] = this.classify(x, z, this.h[j * N + i]);
      }
    }
  }

  /** nearest point on the stream polyline: { d, bed (water bottom height), t (0 spring … 1 sea), seg } */
  streamInfo(x, z) {
    const S = LAYOUT.stream;
    let best = { d: 1e9, bed: 0, t: 0, seg: 0 };
    for (let k = 0; k < S.length - 1; k++) {
      const [ax, az] = S[k], [bx, bz] = S[k + 1];
      const vx = bx - ax, vz = bz - az;
      const L2 = vx * vx + vz * vz;
      const u = clamp(((x - ax) * vx + (z - az) * vz) / L2);
      // wiggle the stream a little so it is not a straight polyline
      const px = ax + vx * u, pz = az + vz * u;
      const wig = this.noise2.noise(px * 0.05, pz * 0.05) * 4;
      const nx = -vz / Math.sqrt(L2), nz = vx / Math.sqrt(L2);
      const d = Math.hypot(x - (px + nx * wig), z - (pz + nz * wig));
      if (d < best.d) best = { d, bed: lerp(this.streamBed[k], this.streamBed[k + 1], u), t: (k + u) / (S.length - 1), seg: k };
    }
    return best;
  }

  classify(x, z, h) {
    if (h < -0.4) return Z.sea;
    const s = this.streamInfo(x, z);
    if (s.d < 2.2 && s.t < 0.97) return Z.stream;
    const P = LAYOUT.pond;
    if (Math.hypot(x - P.x, z - P.z) < P.r - 1) return Z.pond;
    const slope = this.slopeRaw(x, z);
    if (slope > 0.9) return Z.cliff;
    if (h < 2.0) {
      const ang = Math.atan2(z, x);
      const north = -Math.sin(ang) > 0.55;
      return north || this.noise2.noise(x * 0.04, z * 0.04) > 0.42 ? Z.rocks : Z.beach;
    }
    const pk = LAYOUT.peak;
    if (Math.hypot(x - pk.x, z - pk.z) < pk.r * 0.62 && h > 16) return Z.hill;
    const cl = LAYOUT.clearing;
    const grassy = this.noise2.fbm(x * 0.012 + 3, z * 0.012 - 7, 3) + (1 - clamp(Math.hypot(x - cl.x, z - cl.z) / 70)) * 0.6;
    if (grassy > 0.38) return Z.grass;
    return Z.jungle;
  }

  slopeRaw(x, z) {
    const e = 1.5;
    const dx = this.sample(x + e, z) - this.sample(x - e, z);
    const dz = this.sample(x, z + e) - this.sample(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // ------------------------------------------------------------------ queries
  /** bilinear height from the grid */
  sample(x, z) {
    const { N } = this;
    const half = WORLD.size / 2;
    const fx = clamp((x + half) / this.cell, 0, N - 1.001), fz = clamp((z + half) / this.cell, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const a = this.h[j * N + i], b = this.h[j * N + i + 1], cc = this.h[(j + 1) * N + i], d = this.h[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (cc * (1 - u) + d * u) * v;
  }
  heightAt(x, z) { return this.sample(x, z); }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.8;
    const dx = this.sample(x + e, z) - this.sample(x - e, z);
    const dz = this.sample(x, z + e) - this.sample(x, z - e);
    return out.set(-dx, 2 * e, -dz).normalize();
  }
  slopeAt(x, z) { return this.slopeRaw(x, z); }

  /** zone id string at (x, z) */
  zoneAt(x, z) {
    const { N } = this;
    const half = WORLD.size / 2;
    const i = clamp(Math.round((x + half) / this.cell), 0, N - 1), j = clamp(Math.round((z + half) / this.cell), 0, N - 1);
    return ZONE_IDS[this.zone[j * N + i]];
  }

  /**
   * Water at a point: { type: 'sea'|'stream'|'pond'|null, level, depth, fresh }.
   * seaLevel = current tide height.
   */
  waterAt(x, z, seaLevel = 0) {
    const g = this.sample(x, z);
    if (g < seaLevel) return { type: 'sea', level: seaLevel, depth: seaLevel - g, fresh: false };
    const P = LAYOUT.pond;
    if (Math.hypot(x - P.x, z - P.z) < P.r + 1.5 && g < this.pondLevel) return { type: 'pond', level: this.pondLevel, depth: this.pondLevel - g, fresh: true };
    const s = this.streamInfo(x, z);
    if (s.d < 3.2) {
      const lvl = s.bed - 0.15;
      if (g < lvl + 0.05) return { type: 'stream', level: lvl, depth: Math.max(0, lvl - g), fresh: true };
    }
    return { type: null, level: -Infinity, depth: 0, fresh: false };
  }

  /** a dry beach point on the line from the centre towards angle `ang` (radians), ground ≈ targetH */
  shorePoint(ang, targetH = 1.4) {
    let last = null;
    for (let r = 40; r < 330; r += 0.5) {
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const h = this.sample(x, z);
      if (h < targetH) return last || { x, z, y: h };
      last = { x, z, y: h };
    }
    return last;
  }

  /** is the point dry land you can stand / build on */
  isLand(x, z, seaLevel = 0) { return this.waterAt(x, z, seaLevel).type === null; }

  /** a random land point in a zone (rng: RNG). tries up to n times */
  randomPointIn(rng, zones, n = 200, filter = null) {
    const set = Array.isArray(zones) ? zones : [zones];
    for (let k = 0; k < n; k++) {
      const a = rng.float(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 300;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (set.includes(this.zoneAt(x, z)) && (!filter || filter(x, z))) return { x, z, y: this.sample(x, z) };
    }
    return null;
  }

  // ------------------------------------------------------------------ meshes
  buildMesh(segments = 320) {
    const S = WORLD.meshSize;
    const geo = new THREE.PlaneGeometry(S, S, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const C = {
      sand: new THREE.Color('#e6d3a3'), wet: new THREE.Color('#b9a275'), grass: new THREE.Color('#6f9a3e'), jungle: new THREE.Color('#3f6428'),
      rock: new THREE.Color('#7f776c'), dark: new THREE.Color('#5a5249'), dirt: new THREE.Color('#7a5c3a'), seabed: new THREE.Color('#c9b98a'), deep: new THREE.Color('#5f6f6a'),
      hill: new THREE.Color('#58743a'),
    };
    const tmp = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const h = this.sample(x, z);
      pos.setY(k, h);
      const zone = this.zoneAt(x, z);
      const n = this.noise.noise(x * 0.15, z * 0.15) * 0.5 + 0.5;
      const slope = this.slopeRaw(x, z);
      if (h < -0.2) tmp.copy(C.seabed).lerp(C.deep, smoothstep(-0.5, -9, h));
      else if (zone === 'beach') tmp.copy(C.wet).lerp(C.sand, smoothstep(0.1, 1.1, h));
      else if (zone === 'rocks' || zone === 'cliff') tmp.copy(C.rock).lerp(C.dark, n * 0.6);
      else if (zone === 'grass') tmp.copy(C.grass).lerp(C.jungle, n * 0.35);
      else if (zone === 'hill') tmp.copy(C.hill).lerp(C.rock, smoothstep(0.45, 0.9, slope) * 0.8 + n * 0.15);
      else if (zone === 'stream' || zone === 'pond') tmp.copy(C.dirt).lerp(C.rock, n * 0.5);
      else tmp.copy(C.jungle).lerp(C.dirt, n * 0.3);
      // sand blends into vegetation just above the beach
      if (h > 1.8 && h < 3.2 && zone !== 'rocks' && zone !== 'cliff') tmp.lerp(C.sand, 1 - smoothstep(1.8, 3.2, h));
      if (slope > 0.75 && zone !== 'beach') tmp.lerp(C.rock, smoothstep(0.75, 1.2, slope));
      tmp.offsetHSL(0, 0, (n - 0.5) * 0.06);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    // fine grain so close ground is not flat colour
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float gr = vnoise(vWPos.xz * 3.1) * 0.6 + vnoise(vWPos.xz * 11.0) * 0.4;
diffuseColor.rgb *= 0.86 + 0.26 * gr;`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.mesh = mesh;
    return mesh;
  }

  /** fresh water surfaces: stream ribbon + pond disc (animated by the ocean module's shared uniforms) */
  buildFreshWater(material) {
    const group = new THREE.Group();
    // stream ribbon: sample the polyline densely
    const S = LAYOUT.stream;
    const pts = [];
    for (let k = 0; k < S.length - 1; k++) {
      for (let u = 0; u < 1; u += 0.08) {
        const x = lerp(S[k][0], S[k + 1][0], u), z = lerp(S[k][1], S[k + 1][1], u);
        pts.push([x, z]);
      }
    }
    pts.push(S[S.length - 1]);
    const verts = [], uvs = [], idx = [];
    let along = 0;
    for (let k = 0; k < pts.length; k++) {
      const [x, z] = pts[k];
      const [px, pz] = pts[Math.max(0, k - 1)], [qx, qz] = pts[Math.min(pts.length - 1, k + 1)];
      let dx = qx - px, dz = qz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const info = this.streamInfo(x, z);
      // follow the wiggle: find the channel centre near (x, z) by probing sideways
      let cx = x, cz = z, best = 1e9;
      for (let o = -5; o <= 5; o += 0.5) {
        const tx = x - dz * o, tz = z + dx * o;
        const g = this.sample(tx, tz);
        if (g < best) { best = g; cx = tx; cz = tz; }
      }
      const y = info.bed - 0.15;
      const w = 2.6;
      verts.push(cx + dz * w, y, cz - dx * w, cx - dz * w, y, cz + dx * w);
      if (k > 0) along += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][1]);
      uvs.push(0, along / 6, 1, along / 6);
      if (k < pts.length - 1) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const stream = new THREE.Mesh(g, material);
    stream.name = 'stream';
    group.add(stream);
    const P = LAYOUT.pond;
    const pg = new THREE.CircleGeometry(P.r + 2.5, 48);
    pg.rotateX(-Math.PI / 2);
    const pond = new THREE.Mesh(pg, material);
    pond.position.set(P.x, this.pondLevel, P.z);
    pond.name = 'pond';
    group.add(pond);
    return group;
  }

  /** heights as a float texture (for the ocean shader's depth tint and shore foam) */
  heightTexture() {
    const { N } = this;
    const data = new Float32Array(N * N);
    data.set(this.h);
    const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.FloatType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }
}

const ZONE_IDS = ['sea', 'beach', 'rocks', 'jungle', 'grass', 'hill', 'stream', 'pond', 'cliff'];
const Z = Object.fromEntries(ZONE_IDS.map((n, i) => [n, i]));
