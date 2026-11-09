// js/world.js — the place: you stand on a small grassy rise with a wooden deck, a beat lane runs ahead
// through the meadow, the valley drops to a lake, and four ranges of mountains stand behind each other
// all the way round, each one paler and bluer than the last (aerial perspective), so the eye reads
// distance at every scale: grass and flowers at your feet (stereo depth), the forest on both hillsides,
// the lake, then the ridges fading into the haze.
//
// Budget for Quest 3 at 90 Hz: ~30 draw calls, ~250k triangles, no shadows, no post-processing.
// Lambert lighting on trees and rocks, everything else has its light baked into vertex colours.
import * as THREE from 'three';
import { bakeSky, skyDome, SKY_UV } from './sky.js';
import { fbm2, ridged2, noise2, smoothstep, lerp, clamp, rng, colored, mergeGeos, canvasTexture } from './util.js';

export const LAKE_Y = -4.2;
const az0 = THREE.MathUtils.degToRad(64), el0 = THREE.MathUtils.degToRad(31);
export const SUN = new THREE.Vector3(Math.sin(az0) * Math.cos(el0), Math.sin(el0), -Math.cos(az0) * Math.cos(el0));
const HAZE = new THREE.Color('#bfd2e2');

// ground height in metres at (x, z); the player stands at the origin, looking down -z
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const ax = Math.abs(x);
  let h = (fbm2(x * 0.02 + 3.1, z * 0.02 - 7.7, 4) - 0.5) * lerp(1.8, 6, smoothstep(14, 70, ax));
  h -= smoothstep(6, 55, r) * 3.2; // the rise you stand on
  h += smoothstep(34, 120, ax) * (8 + fbm2(x * 0.011, z * 0.011, 3) * 26); // forested flanks, well to the sides
  h += smoothstep(14, 80, z) * (10 + fbm2(x * 0.012 + 5, z * 0.012, 3) * 16); // the hill behind
  const fwd = smoothstep(-8, -60, z);
  const vw = 26 + -Math.min(0, z) * 0.5;
  h -= fwd * Math.exp(-(x * x) / (vw * vw)) * 8.5; // the valley ahead, down to the lake
  h += smoothstep(165, 240, r) * 30; // the rim, rising toward the first ridge
  // a level clearing and a level lane
  const flat = Math.max(1 - smoothstep(4.5, 10, r), (1 - smoothstep(2.2, 6, ax)) * (1 - smoothstep(-15, -24, z)) * (z < 2 ? 1 : 0));
  return lerp(h, 0, flat);
}

function forestAt(x, z) {
  const r = Math.hypot(x, z);
  if (r < 12 || r > 232) return 0;
  const h = heightAt(x, z);
  if (h < LAKE_Y + 1.0) return 0;
  let d = smoothstep(16, 48, Math.abs(x)) * 0.95 + smoothstep(12, 40, z) * 0.9;
  d *= 0.45 + 1.0 * fbm2(x * 0.028 + 11, z * 0.028 - 4, 3);
  if (z < -16 && Math.abs(x) < 26 + -z * 0.3) d *= 0.1; // keep the valley and the lake open
  if (Math.abs(x) < 6 && z < 0 && z > -40) d = 0;
  return clamp(d, 0, 1);
}

export class World {
  constructor(renderer, scene, quality = 'high') {
    this.scene = scene;
    this.q = quality;
    this.u = { time: { value: 0 }, pulse: { value: 0 } };
    const hi = quality !== 'low';
    this.skyRT = bakeSky(renderer, SUN, hi ? 4096 : 2048);
    this.sky = skyDome(this.skyRT.texture);
    scene.add(this.sky);
    scene.fog = new THREE.Fog(HAZE, 45, 900);
    scene.background = HAZE.clone();
    const hemi = new THREE.HemisphereLight('#d8ecff', '#62743c', 1.35);
    const sun = new THREE.DirectionalLight('#fff1d9', 2.3);
    sun.position.copy(SUN).multiplyScalar(100);
    scene.add(hemi, sun);
    this.R = rng(20261109);
    this.addTerrain();
    this.addMountains();
    this.addLake();
    this.addTrees(hi ? 1 : 0.55);
    this.addGrass(hi ? 13000 : 6500);
    this.addFlowers(hi ? 2400 : 1200);
    this.addRocks();
    this.addDeck();
    this.addBirds();
    this.addPollen(hi ? 260 : 160);
  }

  addTerrain() {
    const radii = [0];
    let r = 0;
    while (r < 252) { r += Math.max(0.45, r * 0.052); radii.push(Math.min(r, 252)); }
    const SEG = 200;
    const pos = [0, heightAt(0, 0), 0];
    for (let i = 1; i < radii.length; i++) {
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        const x = Math.sin(a) * radii[i], z = -Math.cos(a) * radii[i];
        pos.push(x, heightAt(x, z), z);
      }
    }
    const idx = [];
    for (let s = 0; s < SEG; s++) idx.push(0, 1 + ((s + 1) % SEG), 1 + s);
    for (let i = 1; i < radii.length - 1; i++) {
      const a0 = 1 + (i - 1) * SEG, a1 = 1 + i * SEG;
      for (let s = 0; s < SEG; s++) {
        const s1 = (s + 1) % SEG;
        idx.push(a0 + s, a0 + s1, a1 + s, a0 + s1, a1 + s1, a1 + s);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal;
    const col = new Float32Array(P.count * 3);
    const cA = new THREE.Color('#5f8f32'), cB = new THREE.Color('#9bb64c'), cF = new THREE.Color('#3b6229'), cS = new THREE.Color('#cdbf92'),
      cR = new THREE.Color('#8a8676'), cU = new THREE.Color('#3f5f55'), cY = new THREE.Color('#b9b55a');
    const c = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      c.copy(cA).lerp(cB, fbm2(x * 0.05, z * 0.05, 3));
      c.lerp(cY, smoothstep(0.62, 0.8, noise2(x * 0.09 + 40, z * 0.09)) * 0.5);
      c.lerp(cF, forestAt(x, z) * 0.8);
      const slope = 1 - N.getY(i);
      c.lerp(cR, smoothstep(0.25, 0.5, slope) * 0.75);
      c.lerp(cS, 1 - smoothstep(LAKE_Y + 0.15, LAKE_Y + 0.9, y));
      if (y < LAKE_Y - 0.2) c.lerp(cU, 0.8);
      c.toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.name = 'terrain';
    this.scene.add(m);
  }

  addMountains() {
    const layers = [
      { R: 262, hMin: 26, hMax: 62, freq: 2.2, seed: 1, valley: 0.62, base: '#2c5530', top: '#3f6d3a', snow: 9, haze: 0.1, segs: 400, rows: 14 },
      { R: 440, hMin: 48, hMax: 118, freq: 2.8, seed: 2, valley: 0.55, base: '#2f5548', top: '#4a6b5c', snow: 9, haze: 0.24, segs: 400, rows: 12 },
      { R: 780, hMin: 110, hMax: 250, freq: 3.4, seed: 3, valley: 0.25, base: '#3d5066', top: '#5a6b80', snow: 0.84, haze: 0.38, segs: 480, rows: 12 },
      { R: 1320, hMin: 230, hMax: 470, freq: 3.1, seed: 4, valley: 0.0, base: '#5c6d88', top: '#7f8ca3', snow: 0.74, haze: 0.52, segs: 480, rows: 10 },
    ];
    const c = new THREE.Color(), cb = new THREE.Color(), ct = new THREE.Color(), snow = new THREE.Color('#f4f6fa');
    for (const L of layers) {
      cb.set(L.base); ct.set(L.top);
      const H = (a) => {
        const ca = Math.cos(a), sa = Math.sin(a);
        let n = ridged2(ca * L.freq + L.seed * 13, sa * L.freq - L.seed * 7, 5);
        n = n * 0.8 + fbm2(ca * L.freq * 3 + L.seed, sa * L.freq * 3, 3) * 0.2;
        let h = L.hMin + (L.hMax - L.hMin) * n;
        const w = Math.atan2(Math.sin(a), Math.cos(a)); // 0 = straight ahead
        h *= 1 - L.valley * Math.exp(-((w / 0.42) ** 2));
        return h;
      };
      const pos = [], col = [], idx = [];
      const S = L.segs, Rn = L.rows;
      for (let s = 0; s <= S; s++) {
        const a = (s / S) * Math.PI * 2;
        const top = H(a);
        for (let k = 0; k <= Rn; k++) {
          const f = k / Rn;
          const gully = (noise2(a * 60 + L.seed, f * 5) - 0.5) * 0.12 * (1 - f);
          const y = lerp(-L.R * 0.09, top, Math.pow(f, 1.35)) * (1 + gully);
          const rr = L.R * (1 - 0.14 * (1 - f)) + (noise2(a * 30, f * 3 + L.seed) - 0.5) * L.R * 0.03;
          pos.push(Math.sin(a) * rr, y, -Math.cos(a) * rr);
        }
      }
      for (let s = 0; s < S; s++) for (let k = 0; k < Rn; k++) {
        const i = s * (Rn + 1) + k, j = (s + 1) * (Rn + 1) + k;
        idx.push(i, j, i + 1, i + 1, j, j + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const P = g.attributes.position, N = g.attributes.normal;
      const n3 = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        const y = P.getY(i);
        const s = Math.floor(i / (Rn + 1)), k = i % (Rn + 1);
        const f = k / Rn;
        const a = (s / S) * Math.PI * 2;
        const top = H(a);
        n3.set(N.getX(i), N.getY(i), N.getZ(i));
        const light = 0.5 + 0.75 * Math.max(0, n3.dot(SUN));
        c.copy(cb).lerp(ct, f * 0.8 + (noise2(a * 80, y * 0.05) - 0.5) * 0.3);
        if (L.snow < 1) {
          const sl = L.snow * (L.hMax) + (noise2(a * 40, L.seed) - 0.5) * L.hMax * 0.25;
          c.lerp(snow, smoothstep(sl, sl + L.hMax * 0.08, y) * (0.55 + 0.45 * Math.max(0, n3.dot(SUN))));
        }
        c.multiplyScalar(light);
        const mist = (1 - f) * 0.4 * (L.haze + 0.2);
        c.lerp(HAZE, clamp(L.haze + mist, 0, 0.95));
        void top;
        c.toArray(col, i * 3);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
      m.renderOrder = -5;
      m.frustumCulled = false;
      this.scene.add(m);
    }
  }

  addLake() {
    const g = new THREE.PlaneGeometry(300, 232, 1, 1);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tSky: { value: this.skyRT.texture }, uSun: { value: SUN }, uTime: this.u.time,
        uDeep: { value: new THREE.Color('#2c5a5e') }, uFog: { value: HAZE }, uFogNear: { value: 45 }, uFogFar: { value: 900 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSky; uniform vec3 uSun, uDeep, uFog; uniform float uTime, uFogNear, uFogFar;
        varying vec3 vW;
        ${SKY_UV}
        void main() {
          vec3 v = normalize(vW - cameraPosition);
          float dist = length(vW - cameraPosition);
          vec2 p = vW.xz; float t = uTime;
          vec2 g = vec2(sin(p.x * 0.31 + t * 0.9) + 0.5 * sin(p.x * 0.83 + p.y * 0.57 + t * 1.3) + 0.25 * sin(p.y * 1.7 - t * 1.1),
                        cos(p.y * 0.37 - t * 0.8) + 0.5 * cos(p.y * 1.07 + p.x * 0.49 + t * 1.2) + 0.25 * cos(p.x * 1.9 + t));
          vec3 n = normalize(vec3(g.x * 0.022, 1.0, g.y * 0.022));
          vec3 r = reflect(v, n); r.y = abs(r.y) + 0.002;
          vec3 sky = texture2D(tSky, skyUv(normalize(r))).rgb;
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
          vec3 col = mix(uDeep, sky * 0.92, clamp(fres * 1.15 + 0.12, 0.0, 1.0));
          col += vec3(1.0, 0.95, 0.85) * pow(max(dot(r, uSun), 0.0), 600.0) * 5.0;
          col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.position.set(0, LAKE_Y, -138);
    m.name = 'lake';
    this.scene.add(m);
  }

  // pick points on the ground where `density(x, z)` allows; denser near the player when `near`
  scatter(n, rMin, rMax, density, pow = 1.3) {
    const R = this.R, out = [];
    let tries = 0;
    while (out.length < n && tries < n * 40) {
      tries++;
      const r = rMin + (rMax - rMin) * Math.pow(R(), pow);
      const a = R() * Math.PI * 2;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (R() > density(x, z)) continue;
      out.push([x, heightAt(x, z), z]);
    }
    return out;
  }

  addTrees(k) {
    const R = this.R;
    // conifer: trunk + four cones, faceted
    const con = mergeGeos([
      colored(new THREE.CylinderGeometry(0.1, 0.16, 1.6, 6).translate(0, 0.8, 0), '#5a3d28'),
      colored(new THREE.ConeGeometry(1.5, 2.4, 7).translate(0, 2.0, 0), '#2f5a32'),
      colored(new THREE.ConeGeometry(1.22, 2.1, 7).translate(0, 3.1, 0), '#356637'),
      colored(new THREE.ConeGeometry(0.92, 1.8, 7).translate(0, 4.1, 0), '#3b7039'),
      colored(new THREE.ConeGeometry(0.55, 1.3, 7).translate(0, 5.0, 0), '#43793d'),
    ]);
    // broadleaf: trunk + clustered blobs
    const leaf = (r, x, y, z, c) => colored(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), c);
    const brd = mergeGeos([
      colored(new THREE.CylinderGeometry(0.14, 0.24, 2.6, 6).translate(0, 1.3, 0), '#634330'),
      leaf(1.6, 0, 3.4, 0, '#5d8f37'), leaf(1.2, 0.9, 3.0, 0.4, '#679a3c'), leaf(1.15, -0.8, 3.1, -0.3, '#548532'), leaf(1.0, 0.1, 4.3, 0.2, '#74a643'),
    ]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const place = (geo, pts, sMin, sMax, tint) => {
      const im = new THREE.InstancedMesh(geo, mat, pts.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
      const c = new THREE.Color();
      pts.forEach((pt, i) => {
        const sc = lerp(sMin, sMax, R());
        e.set((R() - 0.5) * 0.08, R() * Math.PI * 2, (R() - 0.5) * 0.08);
        q.setFromEuler(e);
        s.set(sc * (0.85 + R() * 0.3), sc, sc * (0.85 + R() * 0.3));
        p.set(pt[0], pt[1] - 0.2, pt[2]);
        im.setMatrixAt(i, m4.compose(p, q, s));
        c.setHSL(tint[0] + (R() - 0.5) * tint[1], 0.9, 0.5 + (R() - 0.5) * 0.12);
        c.lerp(new THREE.Color(1, 1, 1), 0.55);
        im.setColorAt(i, c);
      });
      im.computeBoundingSphere();
      this.scene.add(im);
      return im;
    };
    const conPts = this.scatter(Math.round(1500 * k), 14, 236, (x, z) => forestAt(x, z) * (0.45 + 0.55 * smoothstep(20, 60, Math.abs(x) + Math.max(0, z))), 1.1);
    place(con, conPts, 1.0, 2.6, [0.3, 0.06]);
    const brdPts = this.scatter(Math.round(320 * k), 12, 150, (x, z) => forestAt(x, z) * (1 - smoothstep(40, 120, Math.hypot(x, z)) * 0.7), 1.6);
    // trees that frame the view near the clearing
    brdPts.push([-11, heightAt(-11, -12), -12], [12, heightAt(12, -8.5), -8.5], [-11, heightAt(-11, 4), 4], [10, heightAt(10, 7), 7], [-5.8, heightAt(-5.8, 9), 9]);
    place(brd, brdPts, 0.9, 1.7, [0.26, 0.05]);
    // bushes
    const bush = mergeGeos([leaf(0.6, 0, 0.35, 0, '#4f8030'), leaf(0.45, 0.45, 0.3, 0.1, '#5e9139'), leaf(0.42, -0.4, 0.28, -0.1, '#4a782d')]);
    const bushPts = this.scatter(Math.round(160 * k), 6, 60, (x, z) => (Math.abs(x) < 3 && z < 2 && z > -22 ? 0 : 0.25 + forestAt(x, z) * 0.6), 1.2);
    place(bush, bushPts, 0.7, 1.6, [0.27, 0.06]);
  }

  addGrass(n) {
    const w = 0.035;
    const v = [[-w, 0], [w, 0], [-0.7 * w, 0.42], [0.7 * w, 0.42], [-0.32 * w, 0.76], [0.32 * w, 0.76], [0, 1]];
    const pos = [], col = [];
    const base = new THREE.Color('#2e521c'), tip = new THREE.Color('#a8c858'), c = new THREE.Color();
    const tri = [[0, 1, 2], [1, 3, 2], [2, 3, 4], [3, 5, 4], [4, 5, 6]];
    for (const t of tri) for (const i of t) {
      const [x, y] = v[i];
      pos.push(x, y, 0.18 * y * y);
      c.copy(base).lerp(tip, Math.pow(y, 0.8));
      col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const U = this.u;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
        vec3 transformed = vec3(position);
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float hh = position.y * position.y;
        float sw = sin(uTime * 1.5 + ip.x * 0.31 + ip.z * 0.23) * 0.6 + sin(uTime * 2.6 + ip.x * 1.3 - ip.z * 0.7) * 0.3;
        transformed.x += sw * hh * 0.2;
        transformed.z += (sw * 0.35) * hh * 0.16;
      `);
    };
    const pts = this.scatter(n, 1.35, 34, (x, z) => (Math.abs(x) < 0.95 && z < 0.4 && z > -17.5 ? 0.04 : heightAt(x, z) < LAKE_Y + 0.5 ? 0 : 1), 1.7);
    const im = new THREE.InstancedMesh(g, mat, pts.length);
    const R = this.R, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    pts.forEach((pt, i) => {
      const d = Math.hypot(pt[0], pt[2]);
      const hgt = lerp(0.16, 0.5, R()) * (0.75 + smoothstep(3, 25, d) * 0.6);
      q.setFromAxisAngle(up, R() * Math.PI * 2);
      s.set(1 + R() * 0.6, hgt, 1);
      p.set(pt[0], pt[1] - 0.02, pt[2]);
      im.setMatrixAt(i, m4.compose(p, q, s));
      tint.setRGB(0.85 + R() * 0.3, 0.9 + R() * 0.2, 0.75 + R() * 0.3);
      im.setColorAt(i, tint);
    });
    im.frustumCulled = false;
    this.scene.add(im);
  }

  addFlowers(n) {
    // a five-petal star facing up, coloured per flower
    const pos = [];
    const r = 0.035;
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * Math.PI * 2, a1 = a0 + 0.55, a2 = a0 - 0.55;
      pos.push(0, 0, 0, Math.sin(a2) * r * 0.6, 0.004, Math.cos(a2) * r * 0.6, Math.sin(a0) * r, 0.006, Math.cos(a0) * r);
      pos.push(0, 0, 0, Math.sin(a0) * r, 0.006, Math.cos(a0) * r, Math.sin(a1) * r * 0.6, 0.004, Math.cos(a1) * r * 0.6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const U = this.u;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.time; sh.uniforms.uPulse = U.pulse;
      sh.vertexShader = 'uniform float uTime;\nuniform float uPulse;\n' + sh.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
        vec3 transformed = vec3(position);
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        transformed.y += uPulse * 0.012 + sin(uTime * 1.5 + ip.x * 0.3) * 0.004;
        transformed.xz *= 1.0 + uPulse * 0.18;
      `);
    };
    const pts = this.scatter(n, 1.6, 40, (x, z) => (Math.abs(x) < 1.1 && z < 0.4 && z > -17.5 ? 0 : heightAt(x, z) < LAKE_Y + 0.6 ? 0 : smoothstep(0.35, 0.7, noise2(x * 0.12 + 5, z * 0.12))), 1.4);
    const im = new THREE.InstancedMesh(g, mat, pts.length);
    const palette = ['#ffffff', '#fff2a8', '#ffd84a', '#c9a0ff', '#ff9fc6', '#8fd0ff', '#ffffff'].map((h) => new THREE.Color(h));
    const R = this.R, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    pts.forEach((pt, i) => {
      e.set((R() - 0.5) * 0.5, R() * 6.3, (R() - 0.5) * 0.5);
      q.setFromEuler(e);
      const sc = 0.7 + R() * 0.8;
      s.set(sc, sc, sc);
      p.set(pt[0], pt[1] + 0.18 + R() * 0.22, pt[2]);
      im.setMatrixAt(i, m4.compose(p, q, s));
      im.setColorAt(i, palette[Math.floor(noise2(pt[0] * 0.07, pt[2] * 0.07) * palette.length * 0.999)]);
    });
    im.frustumCulled = false;
    this.scene.add(im);
  }

  addRocks() {
    const R = this.R;
    const g = colored(new THREE.DodecahedronGeometry(1, 0), '#9a9789');
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const pts = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + 0.2; if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) > 0) continue; pts.push([Math.sin(a) * 1.75, 0, -Math.cos(a) * 1.75, 0.09 + R() * 0.07]); }
    for (const p of this.scatter(60, 8, 120, (x, z) => (Math.abs(x) < 3 && z < 1 && z > -24 ? 0 : 0.5 + (heightAt(x, z) < LAKE_Y + 1.5 ? 0.5 : 0)), 1.2)) pts.push([...p, 0.3 + R() * 1.2]);
    const im = new THREE.InstancedMesh(g, mat, pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    pts.forEach((pt, i) => {
      e.set(R() * 3, R() * 3, R() * 3);
      q.setFromEuler(e);
      s.set(pt[3] * (1 + R() * 0.5), pt[3] * (0.55 + R() * 0.3), pt[3] * (1 + R() * 0.5));
      p.set(pt[0], pt[1] + pt[3] * 0.15, pt[2]);
      im.setMatrixAt(i, m4.compose(p, q, s));
      c.setHSL(0.15 + R() * 0.1, 0.12, 0.75 + R() * 0.2);
      im.setColorAt(i, c);
    });
    this.scene.add(im);
  }

  addDeck() {
    const { canvas, ctx, tex } = canvasTexture(512, 512);
    ctx.fillStyle = '#9c7449';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) {
      const y = i * 64;
      ctx.fillStyle = `hsl(30, ${30 + (i % 3) * 6}%, ${38 + ((i * 37) % 9)}%)`;
      ctx.fillRect(0, y + 2, 512, 60);
      ctx.strokeStyle = 'rgba(60,35,15,0.35)';
      for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(0, y + 10 + k * 7 + Math.sin(i + k) * 2); ctx.bezierCurveTo(170, y + 6 + k * 7, 340, y + 14 + k * 7, 512, y + 9 + k * 7); ctx.stroke(); }
      ctx.fillStyle = 'rgba(40,25,10,0.6)';
      ctx.fillRect(0, y, 512, 3);
    }
    void canvas;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.06, 48), [
      new THREE.MeshLambertMaterial({ color: '#6b4a2c' }),
      new THREE.MeshLambertMaterial({ map: tex }),
      new THREE.MeshLambertMaterial({ color: '#6b4a2c' }),
    ]);
    top.position.y = -0.028;
    this.scene.add(top);
  }

  addBirds() {
    const pos = [0, 0, -0.12, -0.05, 0, 0.1, 0.05, 0, 0.1, 0, 0, -0.06, -0.55, 0.0, 0.05, 0, 0, 0.12, 0, 0, -0.06, 0, 0, 0.12, 0.55, 0.0, 0.05];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({ color: '#2b3038', side: THREE.DoubleSide });
    const U = this.u;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
        vec3 transformed = vec3(position);
        transformed.y += abs(position.x) * sin(uTime * 9.0 + float(gl_InstanceID) * 1.7) * 0.9;
      `);
    };
    this.birds = new THREE.InstancedMesh(g, mat, 9);
    this.birdData = Array.from({ length: 9 }, (_, i) => ({ r: 50 + (i % 3) * 25, h: 26 + (i % 4) * 7, cx: (i % 2 ? -30 : 25), cz: -90 - (i % 3) * 30, w: 0.05 + (i % 3) * 0.015, ph: i * 0.8, s: 3 + (i % 3) }));
    this.birds.frustumCulled = false;
    this.scene.add(this.birds);
  }

  addPollen(n) {
    const R = this.R;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let x = (R() - 0.5) * 26, z = -16 + R() * 24;
      if (Math.abs(x) < 2.2 && z > -4 && z < 2) x += Math.sign(x || 1) * 2.2; // not in your face
      pos[i * 3] = x; pos[i * 3 + 1] = 0.3 + R() * 3.5; pos[i * 3 + 2] = z;
      seed[i] = R() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.u.time, uPulse: this.u.pulse, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float seed; uniform float uTime, uPulse, uScale; varying float vA;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.21 + seed) * 0.9, sin(uTime * 0.33 + seed * 2.0) * 0.4, cos(uTime * 0.17 + seed) * 0.9);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.55 + 0.45 * sin(uTime * 2.0 + seed * 3.0);
          vA = tw * (0.55 + uPulse * 0.6);
          gl_PointSize = uScale * 0.5 * projectionMatrix[1][1] * (0.022 + 0.014 * uPulse) / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vec3(1.0, 0.95, 0.75) * a * vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.pollen = new THREE.Points(g, mat);
    this.pollen.frustumCulled = false;
    this.scene.add(this.pollen);
  }

  // per frame: time, the beat pulse (1 on a beat, decaying), the head position
  update(t, pulse, headPos, viewportH = 1000) {
    this.u.time.value = t;
    this.u.pulse.value = pulse;
    this.sky.position.copy(headPos);
    this.pollen.material.uniforms.uScale.value = viewportH;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1).multiplyScalar(3.2), up = new THREE.Vector3(0, 1, 0);
    this.birdData.forEach((b, i) => {
      const a = t * b.w + b.ph;
      p.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.3 + i) * 2, b.cz + Math.sin(a) * b.r * 0.6);
      q.setFromAxisAngle(up, -a + (b.w > 0 ? Math.PI : 0));
      s.setScalar(b.s);
      this.birds.setMatrixAt(i, m4.compose(p, q, s));
    });
    this.birds.instanceMatrix.needsUpdate = true;
  }
}
