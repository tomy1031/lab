// courses/coral.js — COURSE 3 「さんご礁の 海底神殿」
// A sandstone road on the sea floor: light rippling down from the surface (caustics), coral gardens and
// swaying kelp, glowing jellyfish, circling fish schools, light shafts, rising bubbles, a sunken temple
// whose arches span the trench, and a great whale gliding overhead.
import * as THREE from 'three';
import { part, merge, toyMaterial, canvasTexture, hsl } from '../engine/util.js';

const S = new THREE.SphereGeometry(1, 12, 9);
const SLO = new THREE.SphereGeometry(1, 8, 6);
const BOX = new THREE.BoxGeometry(1, 1, 1);

// ---------------------------------------------------------------------------------------------
// shader helpers (kept local to this course)
const CAUSTIC_GLSL = /* glsl */`
float caustic(vec2 pw, float t) {
  vec2 p = pw * 0.085 - 250.0;
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.6);
}`;

// light ripples projected from above onto up-facing surfaces (added before fog and tone mapping)
function caustify(mat, shared) {
  if (mat.userData.caustic) return;
  mat.userData.caustic = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.cTime = shared.time;
    sh.uniforms.cStrength = shared.strength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCW;\nvarying float vCUp;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vCW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vCUp = normalize(mat3(modelMatrix) * objectNormal).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCW; varying float vCUp; uniform float cTime; uniform float cStrength;
        ${CAUSTIC_GLSL}`)
      .replace('#include <opaque_fragment>', `
        outgoingLight += (diffuseColor.rgb * 0.8 + 0.2) * vec3(0.75, 1.0, 1.0) * caustic(vCW.xz, cTime) * cStrength * smoothstep(0.3, 0.9, vCUp);
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'coral-caustic';
  mat.needsUpdate = true;
}

// sway the upper part of instanced plants (kelp, anemones); amplitude grows with local height
function swayMaterial(params, amp, time) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSway = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float swPh = 0.0;
        #ifdef USE_INSTANCING
          swPh = instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.11;
        #endif
        float swH = max(0.0, transformed.y);
        transformed.x += sin(uSway * 1.1 + swPh + swH * 0.35) * swH * ${amp.toFixed(3)};
        transformed.z += cos(uSway * 0.8 + swPh * 1.3 + swH * 0.3) * swH * ${(amp * 0.6).toFixed(3)};`);
  };
  m.customProgramCacheKey = () => 'coral-sway-' + amp;
  return m;
}

// ---------------------------------------------------------------------------------------------
// geometry builders
function fluted(radial = 24) {
  const g = new THREE.CylinderGeometry(1, 1, 1, radial, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r < 0.01) continue;
    const a = Math.atan2(z, x), k = 1 - 0.08 * (0.5 + 0.5 * Math.cos(a * 12));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}
const FLUTE = fluted();

function columnGeometry() {
  return merge([
    part(BOX, '#b8ab8a', [0, -0.8, 0], [0, 0, 0], [2.6, 2.4, 2.6]),
    part(FLUTE, '#ddd2b4', [0, 5.2, 0], [0, 0, 0], [0.95, 10, 0.95]),
    part(BOX, '#cfc3a2', [0, 10.55, 0], [0, 0, 0], [2.5, 0.7, 2.5]),
    part(SLO, '#4f8a5a', [0, 0.5, 0], [0, 0, 0], [1.5, 0.5, 1.5]),
  ]);
}

function branchCoral(rng) {
  const parts = [];
  const cyl = new THREE.CylinderGeometry(0.75, 1, 1, 6, 1, true);
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4();
  const grow = (base, dir, len, rad, d) => {
    const end = base.clone().addScaledVector(dir, len);
    const g = cyl.clone();
    q.setFromUnitVectors(up, dir);
    m.compose(base.clone().add(end).multiplyScalar(0.5), q, new THREE.Vector3(rad, len, rad));
    g.applyMatrix4(m);
    parts.push(g);
    if (d === 0) { parts.push(part(SLO, '#ffffff', end.toArray(), [0, 0, 0], rad * 1.25)); return; }
    const n = rng.next() < 0.3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const nd = dir.clone().add(new THREE.Vector3((rng.next() - 0.5) * 1.5, 0.35 + rng.next() * 0.4, (rng.next() - 0.5) * 1.5)).normalize();
      grow(end, nd, len * (0.72 + rng.next() * 0.15), rad * 0.72, d - 1);
    }
  };
  grow(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, 1, 0), 1.3, 0.2, 3);
  return merge(parts.map((g) => (g.attributes.color ? g : paintWhite(g))));
}
// transformed copy that keeps its own vertex colours
const _xm = new THREE.Matrix4(), _xq = new THREE.Quaternion(), _xe = new THREE.Euler(), _xs = new THREE.Vector3(), _xp = new THREE.Vector3();
function xf(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const sc = Array.isArray(scale) ? scale : [scale, scale, scale];
  _xm.compose(_xp.set(...pos), _xq.setFromEuler(_xe.set(...rot)), _xs.set(...sc));
  return geo.clone().applyMatrix4(_xm);
}
function paintWhite(g) {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

function brainCoral() {
  const g = new THREE.SphereGeometry(1, 30, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const groove = Math.sin(n.x * 22 + Math.sin(n.z * 13) * 2.4) * Math.sin(n.z * 19 + Math.sin(n.y * 15) * 2.1);
    v.multiplyScalar(1 + 0.055 * groove);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function tubeCoral(rng) {
  const parts = [];
  const n = 5 + Math.floor(rng.next() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng.next() * Math.PI * 2, r = i === 0 ? 0 : 0.35 + rng.next() * 0.35, h = 0.8 + rng.next() * 1.4, rad = 0.13 + rng.next() * 0.1;
    parts.push(part(new THREE.CylinderGeometry(rad * 1.15, rad, h, 10, 1, true), '#ffffff', [Math.cos(a) * r, h / 2, Math.sin(a) * r], [(rng.next() - 0.5) * 0.3, 0, (rng.next() - 0.5) * 0.3]));
  }
  return merge(parts);
}

function anemone(rng) {
  const parts = [part(new THREE.CylinderGeometry(0.45, 0.55, 0.45, 12), '#c96a9a', [0, 0.22, 0])];
  const t = new THREE.CylinderGeometry(0.025, 0.07, 1, 4, 3);
  t.translate(0, 0.5, 0);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng.next() * 0.2, r = 0.15 + (i % 3) * 0.12;
    const tilt = 0.25 + (i % 3) * 0.28;
    const g = t.clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, 0, tilt)));
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
    g.translate(Math.cos(a) * r, 0.42, -Math.sin(a) * r);
    // lighter tips
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) { const y = Math.min(1, Math.max(0, (pos.getY(k) - 0.42) / 0.9)); col.set([1, 0.75 + 0.25 * y, 0.85 + 0.15 * y], k * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  return merge(parts);
}

function starShape(r1, r2, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? r2 : r1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.22 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3 - v.y) + 0.1 * Math.sin(v.x * 7 + v.z * 5);
    p.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

function clamGeometry() {
  const ridges = (g, a, b) => {
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), ca = new THREE.Color(a), cb = new THREE.Color(b);
    for (let i = 0; i < pos.count; i++) { const ang = Math.atan2(pos.getZ(i), pos.getX(i)); const t = 0.5 + 0.5 * Math.cos(ang * 9); const c = ca.clone().lerp(cb, t); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const bottom = ridges(new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#a9d8e8', '#6fa8c8');
  bottom.scale(1.4, 0.45, 1.2);
  const top = ridges(new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#b9e6f0', '#7ab4d0');
  top.scale(1.4, 0.4, 1.2);
  top.translate(0, 0, 1.2); top.rotateX(-0.75); top.translate(0, 0, -1.2);
  const inner = part(new THREE.CircleGeometry(1, 20), '#ffd6ec', [0, 0.02, 0], [-Math.PI / 2, 0, 0], [1.3, 1.1, 1]);
  return merge([bottom, top, inner]);
}

function fishGeometry() {
  return merge([
    part(S, '#ffffff', [0, 0, 0], [0, 0, 0], [0.2, 0.36, 0.62]),
    part(S, '#26314f', [0, 0, 0.08], [0, 0, 0], [0.21, 0.34, 0.1]),
    part(S, '#26314f', [0, 0, -0.32], [0, 0, 0], [0.2, 0.26, 0.08]),
    part(new THREE.ConeGeometry(1, 1, 4), '#ffffff', [0, 0, -0.72], [Math.PI / 2, 0, 0], [0.04, 0.38, 0.34]),
    part(new THREE.ConeGeometry(1, 1, 4), '#ffffff', [0, 0.36, -0.05], [-0.4, 0, 0], [0.03, 0.25, 0.2]),
    part(SLO, '#111111', [0.13, 0.07, 0.38], [0, 0, 0], 0.05),
    part(SLO, '#111111', [-0.13, 0.07, 0.38], [0, 0, 0], 0.05),
  ]);
}

function whaleGeometry() {
  const top = '#2c4f72', belly = '#a9c9d6', mid = '#3d6688';
  const body = merge([
    part(S, top, [0, 0, 0], [0, 0, 0], [6, 5, 20]),
    part(S, mid, [0, 0.4, 13], [0, 0, 0], [5.4, 4.2, 8.5]),
    part(S, belly, [0, -2.4, 4], [0, 0, 0], [5.2, 2.8, 17]),
    part(S, top, [0, 4.6, -6], [0.4, 0, 0], [0.6, 1.4, 2.4]),
    part(S, mid, [6.5, -2.6, 7], [0.1, -0.5, -0.5], [7, 0.55, 2.4]),
    part(S, mid, [-6.5, -2.6, 7], [0.1, 0.5, 0.5], [7, 0.55, 2.4]),
    part(SLO, '#0c1a2a', [4.4, 0.2, 15], [0, 0, 0], 0.5),
    part(SLO, '#0c1a2a', [-4.4, 0.2, 15], [0, 0, 0], 0.5),
  ]);
  const tail = merge([
    part(S, top, [0, 0, -7], [0, 0, 0], [2.6, 2.6, 9]),
    part(S, mid, [5.5, 0, -15], [0, -0.45, 0], [6.5, 0.45, 2.6]),
    part(S, mid, [-5.5, 0, -15], [0, 0.45, 0], [6.5, 0.45, 2.6]),
  ]);
  return { body, tail };
}

// ---------------------------------------------------------------------------------------------
export default {
  id: 'coral',
  name: 'さんご礁の 海底神殿',
  nameEn: 'Coral Abyss Temple',
  tagline: 'ゆらめく 光の 海の底。さんごの 森と 神殿の アーチを ぬけて、クジラの 下を 走ろう',
  seed: 33,
  points: [[0, 0, 50], [0, 0, -40], [0, -4, -110], [-40, -12, -170], [-110, -18, -180], [-170, -16, -140], [-180, -10, -70], [-140, -6, -20], [-120, -8, 40], [-160, -14, 90], [-150, -16, 160], [-90, -12, 200], [-30, -8, 190], [20, -4, 140]],
  itemRows: [0.13, 0.45, 0.8],
  boosts: [{ at: 0.19, d: 0.3 }, { at: 0.56, d: -0.35 }, { at: 0.88, d: 0 }],
  jumps: [{ at: 0.49 }],
  theme: {
    sky: { top: '#a6f6ff', horizon: '#0f6b8f', bottom: '#03263d', sunDir: [0.15, 0.96, -0.2], sunColor: '#e8fdff', sunSize: 0.03, sunGlow: 1.4, horizonSharp: 0.85,
      nebula: 0.35, nebA: '#7ff0ff', nebB: '#d8fbff' },
    fog: { color: '#0f6b8f', near: 14, far: 280 },
    hemi: { sky: '#6fdcf0', ground: '#123f52', intensity: 1.2 },
    sun: { color: '#b4f0ff', intensity: 1.5, dir: [0.25, 0.95, -0.15] },
    envIntensity: 0.45,
    bloom: { strength: 0.55, radius: 0.5, threshold: 1.8 },
    dust: '#e0d2a8', mapColor: '#22c7c0',
  },
  road: {
    width: 17, curb: 0.9, shoulder: 5, bank: 4,
    paintRoad(ctx, s) {
      ctx.fillStyle = '#9c8a66'; ctx.fillRect(0, 0, s, s);
      // sandstone tiles, 4 across and 4 along, each a little different
      const n = 4, w = s / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const l = 66 + Math.random() * 8, h = 36 + Math.random() * 8;
        ctx.fillStyle = `hsl(${h}, ${34 + Math.random() * 10}%, ${l}%)`;
        const ox = (y % 2) * w / 2;
        ctx.fillRect(((x * w + ox) % s) + 3, y * w + 3, w - 6, w - 6);
        if (ox) ctx.fillRect(0, y * w + 3, w / 2 - 3, w - 6);
      }
      for (let i = 0; i < 2200; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(110,90,50,0.10)'; ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
      // worn blue-green patina in the grout
      ctx.fillStyle = 'rgba(40, 150, 150, 0.22)';
      for (let y = 0; y <= n; y++) ctx.fillRect(0, y * w - 3, s, 6);
      // turquoise edge lines and a dotted centre
      ctx.fillStyle = '#2fd6c8';
      ctx.fillRect(s * 0.022, 0, s * 0.022, s);
      ctx.fillRect(s * 0.956, 0, s * 0.022, s);
      ctx.fillStyle = 'rgba(47, 214, 200, 0.75)';
      for (let y = 0; y < s; y += s / 4) { ctx.beginPath(); ctx.arc(s / 2, y + s / 8, s * 0.014, 0, Math.PI * 2); ctx.fill(); }
    },
    roadRoughness: 0.8,
    curbColors: ['#1fb8b8', '#f2ecd8'],
    curbLength: 3,
    paintShoulder(ctx, s) {
      ctx.fillStyle = '#d3bf8e'; ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(255, 245, 210, 0.35)'; ctx.lineWidth = 3;
      for (let y = 0; y < s; y += 14) {
        ctx.beginPath();
        for (let x = 0; x <= s; x += 8) { const yy = y + Math.sin(x * 0.05 + y) * 4; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
        ctx.stroke();
      }
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = ['#f6e7d0', '#c9a27a', '#ffd0dc', '#9fc8c8'][i % 4];
        ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 1.5 + Math.random() * 2.5, 0, Math.PI * 2); ctx.fill();
      }
    },
    shoulderRoughness: 0.95,
    wall: {
      color: '#b9b2d6', height: 1.25, thickness: 0.9, roughness: 0.85, glow: '#46f0ff', glowIntensity: 2.4,
      map(ctx, s) {
        ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#9a94b0';
        ctx.fillRect(s / 2 - 2, 0, 4, s);
        for (let y = 0; y < s; y += s / 4) { ctx.fillRect(0, y, s / 2, 3); ctx.fillRect(s / 2, y + s / 8, s / 2, 3); }
        ctx.fillStyle = 'rgba(70, 140, 90, 0.45)';
        for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * s * 0.35, Math.random() * s, 4 + Math.random() * 6, 3);
      },
    },
  },
  music: {
    bpm: 112, root: 65, scale: 'lydian', progression: [0, 1, 4, 3], seed: 9,
    style: { leadVoice: 'bell', lead: 'triangle', drums: 'soft', arpType: 'sine', bass: 'pulse', rhythm: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0] },
  },

  build({ scene, track, props, rng, add, onUpdate }) {
    const N = track.N;
    const caus = { time: { value: 0 }, strength: { value: 0.55 } };
    const sway = { value: 0 };
    onUpdate((dt, t) => { caus.time.value = t * 0.55; sway.value = t; });
    const b = track.bounds(), c = b.getCenter(new THREE.Vector3());

    // ---- sea floor
    const TS = 1100, TR = 150;
    const ter = props.terrain(track, {
      size: TS, res: TR, below: 0.4, hills: 30, flat: 3, rise: 45, base: b.min.y - 10, noiseScale: 0.011,
      color: (x, y, z, dist, n) => {
        const sand = new THREE.Color('#d6c391');
        if (n > 0.58) sand.lerp(new THREE.Color('#5f9a6a'), Math.min(1, (n - 0.58) * 4));
        else if (n < 0.36) sand.lerp(new THREE.Color('#b9a6c9'), Math.min(1, (0.36 - n) * 3));
        return sand.lerp(new THREE.Color('#8a8a78'), Math.min(0.5, Math.max(0, dist - 120) / 400));
      },
    });
    caustify(ter.material, caus);
    add(ter);
    const tpos = ter.geometry.attributes.position, tn = TR + 1;
    const heightAt = (x, z) => {
      const fx = Math.min(TR - 1e-4, Math.max(0, ((x - c.x + TS / 2) / TS) * TR));
      const fz = Math.min(TR - 1e-4, Math.max(0, ((z - c.z + TS / 2) / TS) * TR));
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const y00 = tpos.getY(j * tn + i), y10 = tpos.getY(j * tn + i + 1), y01 = tpos.getY((j + 1) * tn + i), y11 = tpos.getY((j + 1) * tn + i + 1);
      return (y00 * (1 - u) + y10 * u) * (1 - v) + (y01 * (1 - u) + y11 * u) * v;
    };
    // caustics on the road, curbs, shoulders and wall tops
    const trackGroup = scene.getObjectByName('track');
    trackGroup?.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) caustify(o.material, caus); });

    const v = new THREE.Vector3();
    // points on the sand just outside the walls (between f0 and f1 of the lap)
    const sandSpots = (n, { min = 0.5, max = 14, f0 = 0, f1 = 1, margin = 0.5 } = {}) => {
      const out = [];
      for (let i = 0; i < n * 6 && out.length < n; i++) {
        const p = (f0 + rng.next() * (f1 - f0)) * N, s = rng.sign();
        const k = Math.round(p) % N;
        track.pointAt(p, s * (track.wallD(k) + min + rng.next() * (max - min)), v);
        if (!track.clearOfRoad(v.x, v.z, margin)) continue;
        out.push({ x: v.x, z: v.z, y: heightAt(v.x, v.z), p, side: s });
      }
      return out;
    };

    // ---- kelp forests
    const kelpGeo = new THREE.PlaneGeometry(1.3, 16, 1, 12);
    kelpGeo.translate(0, 8, 0);
    const kelpMat = swayMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide, emissive: '#0c3a1a', emissiveIntensity: 0.4 }, 0.055, sway);
    const kelp = [];
    for (const cl of sandSpots(16, { min: 2, max: 40 })) {
      const n = 14 + Math.floor(rng.next() * 18);
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * 11;
        const x = cl.x + Math.cos(a) * r, z = cl.z + Math.sin(a) * r;
        if (!track.clearOfRoad(x, z, 0.3)) continue;
        kelp.push({ x, y: heightAt(x, z) - 0.4, z, ry: rng.next() * Math.PI, s: [0.7 + rng.next() * 0.7, 0.5 + rng.next() * 0.9, 1], c: hsl(0.27 + rng.next() * 0.08, 0.55, 0.32 + rng.next() * 0.15) });
      }
    }
    add(props.inst(kelpGeo, kelpMat, kelp));

    // ---- corals
    const coralCols = ['#ff5f9e', '#ff8a3d', '#b06bff', '#ffd23f', '#ff4f6a', '#4fd6ff', '#ff9ad0'];
    const coralMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, emissive: '#1a0a1a', emissiveIntensity: 0.6 });
    for (let vIdx = 0; vIdx < 3; vIdx++) {
      const geo = branchCoral(rng);
      const list = sandSpots(42, { min: 0.4, max: 16 }).map((p) => ({ x: p.x, y: p.y - 0.2, z: p.z, ry: rng.next() * 6, s: 1.2 + rng.next() * 1.8, c: coralCols[Math.floor(rng.next() * coralCols.length)] }));
      add(props.inst(geo, coralMat, list, { cast: true }));
    }
    const brainMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    add(props.inst(brainCoral(), brainMat, sandSpots(60, { min: 0.3, max: 18 }).map((p) => {
      const s = 0.9 + rng.next() * 1.8;
      return { x: p.x, y: p.y - 0.25, z: p.z, ry: rng.next() * 6, s: [s, s * 0.85, s], c: ['#8fd36b', '#ffb36b', '#c08aff', '#f2e07a'][Math.floor(rng.next() * 4)] };
    })));
    const tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: '#200a10', emissiveIntensity: 0.6 });
    for (let vIdx = 0; vIdx < 2; vIdx++) {
      add(props.inst(tubeCoral(rng), tubeMat, sandSpots(34, { min: 0.3, max: 12 }).map((p) => ({ x: p.x, y: p.y - 0.15, z: p.z, ry: rng.next() * 6, s: 0.9 + rng.next() * 1.3, c: ['#ff9a3d', '#ffe14d', '#b06bff', '#ff5f9e'][Math.floor(rng.next() * 4)] }))));
    }
    const anemoneMat = swayMaterial({ vertexColors: true, roughness: 0.5, emissive: '#3a0a2a', emissiveIntensity: 0.5 }, 0.18, sway);
    add(props.inst(anemone(rng), anemoneMat, sandSpots(70, { min: 0.3, max: 10 }).map((p) => ({ x: p.x, y: p.y - 0.1, z: p.z, ry: rng.next() * 6, s: 0.8 + rng.next() * 1.0, c: ['#ff7ab8', '#c79bff', '#7ff0d8', '#ffb07a'][Math.floor(rng.next() * 4)] }))));
    // sea fans
    const fanTex = canvasTexture(256, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
      const br = (x, y, a, len, w, d) => {
        const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len;
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
        if (d > 0) { br(x2, y2, a + 0.35, len * 0.78, w * 0.75, d - 1); br(x2, y2, a - 0.35, len * 0.78, w * 0.75, d - 1); }
      };
      for (let i = 0; i < 5; i++) br(s / 2, s, Math.PI / 2 + (i - 2) * 0.32, s * 0.2, 7, 5);
      ctx.lineWidth = 1.5;
      for (let r = 30; r < s; r += 18) { ctx.beginPath(); ctx.arc(s / 2, s, r, Math.PI, 0); ctx.stroke(); }
    }, { repeat: false });
    const fanGeo = new THREE.PlaneGeometry(2.4, 1.2);
    fanGeo.translate(0, 0.6, 0);
    const fanMat = new THREE.MeshStandardMaterial({ map: fanTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.7, emissive: '#200818', emissiveIntensity: 0.5 });
    add(props.inst(fanGeo, fanMat, sandSpots(55, { min: 0.6, max: 14 }).map((p) => ({ x: p.x, y: p.y - 0.15, z: p.z, ry: rng.next() * 6, s: 1.4 + rng.next() * 1.8, c: ['#c050ff', '#ff4f6a', '#ff9a3d', '#ff6fd0'][Math.floor(rng.next() * 4)] }))));
    // starfish on the sand and the shoulders
    const starGeo = new THREE.ExtrudeGeometry(starShape(0.55, 0.22), { depth: 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 });
    starGeo.rotateX(-Math.PI / 2);
    const stars = sandSpots(40, { min: 0.3, max: 10 }).map((p) => ({ x: p.x, y: p.y + 0.02, z: p.z, ry: rng.next() * 6, s: 0.7 + rng.next() * 0.6, c: ['#ff7a3d', '#ff4f6a', '#ffd23f', '#b06bff'][Math.floor(rng.next() * 4)] }));
    for (let i = 0; i < 26; i++) {
      const p = rng.next() * N, k = Math.round(p) % N, s = rng.sign();
      track.pointAt(p, s * (track.HW[k] + track.curb + 0.8 + rng.next() * (track.shoulder - 1.6)), v);
      stars.push({ x: v.x, y: v.y + 0.04, z: v.z, ry: rng.next() * 6, s: 0.6 + rng.next() * 0.4, c: ['#ff7a3d', '#ff4f6a', '#ffd23f'][i % 3] });
    }
    add(props.inst(starGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), stars));

    // ---- rocks, and tall cliffs along the trench
    const rockGeo = rockGeometry();
    const rockMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
    const rocks = sandSpots(40, { min: 4, max: 40, margin: 2 }).map((p) => { const s = 2 + rng.next() * 5; return { x: p.x, y: p.y - s * 0.3, z: p.z, rx: rng.next(), ry: rng.next() * 6, s: [s, s * (0.6 + rng.next() * 0.6), s], c: ['#7d7896', '#6f8a8c', '#8a7f74'][Math.floor(rng.next() * 3)] }; });
    for (const [f0, f1] of [[0.2, 0.4], [0.6, 0.74]]) {
      for (let i = 0; i < 30; i++) {
        const sx = 6 + rng.next() * 8, sy = 12 + rng.next() * 16;
        const p = (f0 + rng.next() * (f1 - f0)) * N, s = rng.sign(), k = Math.round(p) % N;
        track.pointAt(p, s * (track.wallD(k) + 5 + sx * 0.8 + rng.next() * 10), v);
        if (!track.clearOfRoad(v.x, v.z, sx * 0.9)) continue;
        rocks.push({ x: v.x, y: heightAt(v.x, v.z) - 3, z: v.z, ry: rng.next() * 6, rz: (rng.next() - 0.5) * 0.2, s: [sx, sy, sx * (0.8 + rng.next() * 0.4)], c: ['#6a6688', '#5d7a80', '#7a6f8a'][Math.floor(rng.next() * 3)] });
      }
    }
    add(props.inst(rockGeo, rockMat, rocks, { cast: true, receive: true }));

    // ---- giant clams with glowing pearls
    const clams = sandSpots(14, { min: 1, max: 10 });
    const clamList = clams.map((p) => ({ x: p.x, y: p.y + 0.2, z: p.z, ry: Math.atan2(c.x - p.x, c.z - p.z) + (rng.next() - 0.5), s: 1.4 + rng.next() * 1.2 }));
    add(props.inst(clamGeometry(), toyMaterial({ roughness: 0.4 }), clamList, { cast: true }));
    add(props.inst(SLO, props.glow('#f2ffff', 2.4), clamList.map((q) => ({ x: q.x + Math.sin(q.ry) * 0.25 * q.s, y: q.y + 0.35 * q.s, z: q.z + Math.cos(q.ry) * 0.25 * q.s, s: 0.38 * q.s }))));

    // ---- sunken temple: arches over the trench, rows of (some broken) columns, a ruined shrine
    const colGeo = columnGeometry();
    const stoneMat = toyMaterial({ roughness: 0.85 });
    const runeMat = props.glow('#46f0ff', 2.6);
    const gateAt = [0.255, 0.3, 0.345, 0.64, 0.685];
    for (const f of gateAt) {
      const p = f * N, k = Math.round(p) % N;
      const W = track.wallD(k) + 2.2;
      const geo = merge([
        xf(colGeo, [W, 0, 0]), xf(colGeo, [-W, 0, 0]),
        part(BOX, '#d4c8a8', [0, 11.7, 0], [0, 0, 0], [2 * W + 3.4, 1.6, 2.6]),
        part(BOX, '#c4b896', [0, 12.85, 0], [0, 0, 0], [2 * W + 1.2, 0.7, 2.0]),
        part(new THREE.CylinderGeometry(1, 1, 1, 3), '#cfc3a2', [0, 13.9, 0], [Math.PI / 2, 0, 0], [3.2, 1.6, 1.4]),
      ]);
      const runes = [];
      for (let i = -3; i <= 3; i++) for (const zz of [1.32, -1.32]) runes.push(part(BOX, '#ffffff', [i * (W / 3.6), 11.7, zz], [0, 0, 0], [i % 2 ? 0.5 : 0.9, i % 2 ? 0.9 : 0.35, 0.05]));
      runes.push(part(new THREE.OctahedronGeometry(1, 0), '#ffffff', [0, 15.6, 0], [0, 0, 0], [0.7, 1.1, 0.7]));
      const gate = new THREE.Group();
      const gm = new THREE.Mesh(geo, stoneMat); gm.castShadow = true; gm.receiveShadow = true;
      const rm = new THREE.Mesh(merge(runes), runeMat);
      gate.add(gm, rm);
      track.placeOn(gate, p, 0, 0);
      add(gate);
    }
    const cols = [], fallen = [];
    for (const [f0, f1] of [[0.235, 0.37], [0.62, 0.71]]) {
      for (let f = f0; f < f1; f += 13 / track.length) {
        if (gateAt.some((g) => Math.abs(g - f) * track.length < 5)) continue;
        const p = f * N, k = Math.round(p) % N;
        for (const s of [-1, 1]) {
          if (rng.next() < 0.18) continue;
          track.pointAt(p, s * (track.wallD(k) + 3), v);
          const broken = rng.next() < 0.35;
          cols.push({ x: v.x, y: heightAt(v.x, v.z) + 0.2, z: v.z, ry: rng.next() * 6, rx: broken ? (rng.next() - 0.5) * 0.25 : 0, rz: broken ? (rng.next() - 0.5) * 0.25 : 0, s: [1, broken ? 0.35 + rng.next() * 0.35 : 1, 1] });
          if (broken && rng.next() < 0.7) {
            track.pointAt(p + (rng.next() - 0.5) * 4, s * (track.wallD(k) + 6 + rng.next() * 5), v);
            fallen.push({ x: v.x, y: heightAt(v.x, v.z) + 0.6, z: v.z, rz: Math.PI / 2, ry: rng.next() * 6, s: [0.9, 3 + rng.next() * 3, 0.9] });
          }
        }
      }
    }
    add(props.inst(colGeo, stoneMat, cols, { cast: true, receive: true }));
    add(props.inst(FLUTE, stoneMat, fallen, { cast: true }));
    // ruined shrine inside the loop
    let shrine = new THREE.Vector3(-75, 0, -80);
    for (let i = 0; i < 40 && !track.clearOfRoad(shrine.x, shrine.z, 26); i++) shrine.set(-75 + (rng.next() - 0.5) * 60, 0, -80 + (rng.next() - 0.5) * 60);
    shrine.y = heightAt(shrine.x, shrine.z) - 0.5;
    {
      const parts = [
        part(BOX, '#b8ab8a', [0, 1.5, 0], [0, 0, 0], [40, 3, 40]),
        part(BOX, '#c6b994', [0, 4.2, 0], [0, 0, 0], [31, 2.6, 31]),
        part(BOX, '#d2c6a2', [0, 6.6, 0], [0, 0, 0], [23, 2.4, 23]),
      ];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const h = i === 3 ? 0.45 : i === 6 ? 0.7 : 1;
        parts.push(xf(colGeo, [Math.cos(a) * 8.5, 9.6, Math.sin(a) * 8.5], [0, 0, 0], [0.9, h, 0.9]));
      }
      parts.push(part(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 1.55, 0, Math.PI / 2), '#d9cfb3', [0, 19, 0], [0, 0.6, 0], [10, 7, 10]));
      parts.push(part(new THREE.TorusGeometry(10, 0.7, 8, 40), '#c4b896', [0, 19, 0], [Math.PI / 2, 0, 0]));
      const sm = new THREE.Mesh(merge(parts), stoneMat);
      sm.position.copy(shrine); sm.castShadow = true; sm.receiveShadow = true;
      add(sm);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), props.glow('#5ff6ff', 3));
      crystal.position.set(shrine.x, shrine.y + 14, shrine.z);
      add(crystal);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.12, 6, 40), props.glow('#a8fbff', 2.4));
      halo.position.copy(crystal.position);
      add(halo);
      onUpdate((dt, t) => { crystal.rotation.y += dt * 0.8; crystal.position.y = shrine.y + 14 + Math.sin(t * 1.2) * 0.8; halo.position.y = crystal.position.y; halo.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.4; halo.rotation.y += dt * 0.5; });
    }

    // ---- light shafts from the surface
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: { t: sway, color: { value: new THREE.Color('#bff8ff') } },
      vertexShader: `varying float vH; varying float vF; varying float vE; varying float vPh;
        void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal); vE = pow(abs(dot(n, normalize(-mv.xyz))), 2.0);
          vF = smoothstep(320.0, 70.0, -mv.z) * smoothstep(4.0, 30.0, -mv.z); vPh = modelMatrix[3].x * 0.05 + modelMatrix[3].z * 0.03;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float t; uniform vec3 color; varying float vH; varying float vF; varying float vE; varying float vPh;
        void main(){ float a = vE * smoothstep(0.0, 0.35, vH) * (0.35 + 0.65 * vH) * vF * (0.55 + 0.45 * sin(t * 0.6 + vPh)) * 0.32;
          gl_FragColor = vec4(color * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    for (const p of [...sandSpots(8, { min: -4, max: 30, margin: -20 }), ...props.around(track, rng, 6, { rMin: 20, rMax: 160, margin: 0 })]) {
      const r = 4 + rng.next() * 5;
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, 170, 20, 1, true), shaftMat);
      sh.position.set(p.x, heightAt(p.x, p.z) + 70, p.z);
      sh.rotation.z = (rng.next() - 0.5) * 0.35; sh.rotation.x = (rng.next() - 0.5) * 0.2;
      sh.renderOrder = 3;
      add(sh);
    }

    // ---- jellyfish (instanced dome + tentacles)
    const jellyN = 18;
    const domeGeo = new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const jellyMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vF;
        void main(){ vec4 p = vec4(position, 1.0); vec3 nn = normal;
          #ifdef USE_INSTANCING
            p = instanceMatrix * p; nn = mat3(instanceMatrix) * nn;
          #endif
          #ifdef USE_INSTANCING_COLOR
            vC = instanceColor;
          #else
            vC = vec3(1.0);
          #endif
          vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * nn); vV = normalize(-mv.xyz);
          vF = smoothstep(260.0, 60.0, -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vF;
        void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          float a = (0.16 + f * 0.75) * vF; gl_FragColor = vec4(vC * (0.7 + f * 1.6) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const tent = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, L = 2.4 + (k % 3) * 0.9;
      const g = new THREE.CylinderGeometry(0.05, 0.015, L, 4, 8, true);
      g.translate(0, -L / 2, 0);
      const pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); pp.setX(i, pp.getX(i) + Math.sin(y * 2.2 + k) * 0.18 * (-y / L)); }
      g.translate(Math.cos(a) * 0.7, 0.05, Math.sin(a) * 0.7);
      tent.push(paintWhite(g));
    }
    for (let k = 0; k < 4; k++) {
      const g = new THREE.CylinderGeometry(0.16, 0.05, 3.4, 5, 6, true);
      g.translate(0, -1.7, 0);
      const pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); pp.setZ(i, pp.getZ(i) + Math.sin(y * 3 + k * 2) * 0.12); }
      g.translate(Math.cos(k * 1.6) * 0.2, 0, Math.sin(k * 1.6) * 0.2);
      tent.push(paintWhite(g));
    }
    const tentGeo = merge(tent);
    const tentMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const domes = new THREE.InstancedMesh(domeGeo, jellyMat, jellyN);
    const tents = new THREE.InstancedMesh(tentGeo, tentMat, jellyN);
    const jellyCols = ['#ff6fd8', '#a07bff', '#5ff0ff', '#ffb36b', '#ff8fb0'];
    const jellies = [];
    const jSpots = [...sandSpots(12, { min: -12, max: 26, margin: -30 }), ...sandSpots(6, { min: 10, max: 50 })];
    jSpots.slice(0, jellyN).forEach((p, i) => {
      const col = new THREE.Color(jellyCols[i % jellyCols.length]);
      domes.setColorAt(i, col.clone().multiplyScalar(1.1));
      tents.setColorAt(i, col.clone().multiplyScalar(1.6));
      jellies.push({ x: p.x, z: p.z, y: Math.max(p.y, track.P[Math.round(p.p) % N].y) + 9 + rng.next() * 14, s: 1.6 + rng.next() * 2.2, ph: rng.next() * 6 });
    });
    domes.count = tents.count = jellies.length;
    domes.frustumCulled = tents.frustumCulled = false;
    domes.renderOrder = tents.renderOrder = 4;
    add(domes); add(tents);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), SC = new THREE.Vector3(), PV = new THREE.Vector3();
    onUpdate((dt, t) => {
      jellies.forEach((j, i) => {
        const pulse = Math.sin(t * 2.0 + j.ph);
        PV.set(j.x + Math.sin(t * 0.13 + j.ph) * 4, j.y + Math.sin(t * 0.5 + j.ph) * 2 + Math.max(0, -pulse) * 0.4, j.z + Math.cos(t * 0.11 + j.ph) * 4);
        Q.setFromEuler(E.set(Math.sin(t * 0.3 + j.ph) * 0.15, t * 0.1 + j.ph, Math.cos(t * 0.27 + j.ph) * 0.15));
        M.compose(PV, Q, SC.set(j.s * (1 + 0.1 * pulse), j.s * (0.85 - 0.12 * pulse), j.s * (1 + 0.1 * pulse)));
        domes.setMatrixAt(i, M);
        M.compose(PV, Q, SC.set(j.s * (1 - 0.06 * pulse), j.s * (1 + 0.1 * pulse), j.s * (1 - 0.06 * pulse)));
        tents.setMatrixAt(i, M);
      });
      domes.instanceMatrix.needsUpdate = true; tents.instanceMatrix.needsUpdate = true;
    });

    // ---- fish schools circling over and beside the road
    const fishGeo = fishGeometry();
    const schools = [];
    const fishCols = ['#ffd23f', '#4fc3ff', '#ff8a3d', '#ff6fb0', '#9dff7a', '#b48bff'];
    for (const p of sandSpots(7, { min: -14, max: 20, margin: -40 })) {
      schools.push({ cx: p.x, cz: p.z, y: track.P[Math.round(p.p) % N].y + 4 + rng.next() * 7, R: 14 + rng.next() * 22, w: (0.18 + rng.next() * 0.15) * rng.sign(), n: 26 + Math.floor(rng.next() * 14), col: fishCols[schools.length % fishCols.length], s: 0.9 + rng.next() * 0.9 });
    }
    const fishList = [];
    for (const sc of schools) for (let i = 0; i < sc.n; i++) fishList.push({ sc, arc: (rng.next() - 0.5) * 0.9, dr: (rng.next() - 0.5) * 5, dy: (rng.next() - 0.5) * 4, ph: rng.next() * 6, s: sc.s * (0.8 + rng.next() * 0.4) });
    const fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: '#102030', emissiveIntensity: 0.6 }), fishList.length);
    fishList.forEach((f, i) => fish.setColorAt(i, new THREE.Color(f.sc.col).lerp(new THREE.Color('#ffffff'), rng.next() * 0.3)));
    fish.frustumCulled = false;
    add(fish);
    onUpdate((dt, t) => {
      fishList.forEach((f, i) => {
        const sc = f.sc, a = t * sc.w + f.arc, r = sc.R + f.dr + Math.sin(t * 0.7 + f.ph) * 0.8;
        PV.set(sc.cx + Math.cos(a) * r, sc.y + f.dy + Math.sin(t * 1.3 + f.ph) * 0.4, sc.cz + Math.sin(a) * r);
        const dir = Math.sign(sc.w);
        const tx = -Math.sin(a) * dir, tz = Math.cos(a) * dir;
        Q.setFromEuler(E.set(0, Math.atan2(tx, tz) + Math.sin(t * 11 + f.ph) * 0.18, 0));
        M.compose(PV, Q, SC.set(f.s, f.s, f.s));
        fish.setMatrixAt(i, M);
      });
      fish.instanceMatrix.needsUpdate = true;
    });

    // ---- bubbles: everywhere, and in columns from vents
    const bub = props.motes(520, { center: c, spread: [640, 80, 640], yBase: b.min.y - 8, size: 0.42, colors: ['#e8fdff', '#bdf4ff'], speed: 0.5, blink: 0, rise: 2.5 }, rng);
    add(bub); onUpdate((dt, t) => bub.userData.update(dt, t));
    const ventMat = new THREE.MeshStandardMaterial({ color: '#4a4a5a', roughness: 0.95, flatShading: true });
    for (const p of sandSpots(7, { min: 1.5, max: 9 })) {
      const col = props.motes(70, { center: new THREE.Vector3(p.x, 0, p.z), spread: [1.6, 50, 1.6], yBase: p.y, size: 0.8, colors: ['#f4feff'], speed: 1.5, blink: 0, rise: 6 }, rng);
      add(col); onUpdate((dt, t) => col.userData.update(dt, t));
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 2.2, 7), ventMat);
      chimney.position.set(p.x, p.y + 0.8, p.z); add(chimney);
      const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 6, 16), props.glow('#7ff6ff', 2.5));
      glowRing.rotation.x = Math.PI / 2; glowRing.position.set(p.x, p.y + 1.92, p.z); add(glowRing);
    }

    // ---- the great whale circling overhead
    const wg = whaleGeometry();
    const whaleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, fog: false });
    const whale = new THREE.Group();
    const wb = new THREE.Mesh(wg.body, whaleMat);
    const tailPivot = new THREE.Group(); tailPivot.position.z = -16;
    tailPivot.add(new THREE.Mesh(wg.tail, whaleMat));
    wb.add(tailPivot);
    whale.add(wb);
    whale.scale.setScalar(1.5);
    add(whale);
    const wy = b.max.y + 62, wR = 190;
    onUpdate((dt, t) => {
      const a = t * 0.025 + 1.2;
      whale.position.set(c.x + Math.cos(a) * wR, wy + Math.sin(t * 0.2) * 4, c.z + Math.sin(a) * wR);
      whale.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
      wb.rotation.x = Math.sin(t * 0.5) * 0.05;
      tailPivot.rotation.x = Math.sin(t * 0.9) * 0.28;
    });

    // ---- start gate in temple colours
    add(props.startGate(track, { pillar: '#e8dcc0', accent: '#2fd6c8', banner: '#0b4f73', lights: '#7ff6ff' }));
  },
};
