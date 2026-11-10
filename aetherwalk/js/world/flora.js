// js/world/flora.js — FABLE
// 木（4 種 × 近・遠）、岩・石柱・海の岩、光るきのこ、道灯。すべてインスタンス。
// 毎フレーム（動いたときだけ）CPU で「見える範囲・距離」に絞って近景／遠景の 2 つのメッシュへ振り分ける。
import * as THREE from 'three';
import { AW_PARS, AwMaterial, sharedUniforms, FOG_LIGHT_UNIFORMS } from './art.js';
import { part, merge, G, lin, tubeGeo } from './geo.js';
import { LANDMARKS, LM, LAKE_C, GATHER } from './layout.js';
import { makeRng, smoothstep } from './noise.js';

const VERT = /* glsl */`
${AW_PARS}
uniform sampler2D uNoiseTex;
uniform vec4 uWind, uCloud;
uniform vec3 uStrata[4];
uniform vec3 uGlowCol;
attribute vec4 aInst;     // x, y, z, 大きさ
attribute vec4 aInst2;    // cos, sin, 色のゆらぎ, フラグ（1 = 地層の色 2 = 雪）
varying vec3 vCol; varying vec4 vFog;
void main() {
  vec3 p = position * aInst.w;
  p.y *= 1.0 + aInst2.z * 0.12;
  p = vec3(p.x * aInst2.x - p.z * aInst2.y, p.y, p.x * aInst2.y + p.z * aInst2.x);
  vec3 n = vec3(normal.x * aInst2.x - normal.z * aInst2.y, normal.y, normal.x * aInst2.y + normal.z * aInst2.x);
  float sw = uv.x;
  if (sw > 0.0) {
    float t = uWind.w;
    float g = sin(t * 0.8 + aInst.x * 0.05 + aInst.z * 0.04) * 0.5 + 0.6;
    vec2 b = uWind.xy * (g * (0.2 + 0.8 * uWind.z) * 0.03 * p.y);
    b += vec2(sin(t * 2.1 + p.x * 0.8 + p.y * 1.1 + aInst.x), cos(t * 1.7 + p.z * 0.9 + p.y * 0.7 + aInst.z)) * (0.05 + 0.08 * uWind.z);
    p.xz += b * sw;
  }
  vec3 wp = p + aInst.xyz;
  vec3 alb = color.rgb;
  #ifdef AW_ROCK
    wp.y += position.y * aInst.w * aInst2.z * 0.3;
    wp.xz += vec2(aInst2.x, aInst2.y) * (position.y * position.y * aInst.w * aInst2.z * 0.18);
    // 岩の地色：0 草原 1 地層 2 峰 3 森（苔）4 白い崖
    if (aInst2.w < 0.5) alb *= vec3(0.33, 0.3, 0.23);
    else if (aInst2.w > 3.5) alb *= vec3(0.9, 0.86, 0.77);
    else if (aInst2.w > 2.5) alb = mix(alb * vec3(0.11, 0.115, 0.09), vec3(0.05, 0.2, 0.08), smoothstep(0.2, 0.75, n.y) * 0.8);
    else if (aInst2.w > 1.5) alb *= vec3(0.11, 0.145, 0.22);
  #endif
  if (aInst2.w > 0.5 && aInst2.w < 1.5) {
    float bi = floor((wp.y + sin(wp.x * 0.11 + wp.z * 0.07) * 1.5) / 3.3);
    vec3 st = uStrata[int(mod(bi, 4.0))];
    alb = st * (0.55 + 0.9 * color.g);
  }
  alb *= vec3(1.0 + aInst2.z * 0.16, 1.0 + aInst2.z * 0.05, 1.0 - aInst2.z * 0.12);
  if (aInst2.w > 1.5) alb = mix(alb, vec3(0.92, 0.95, 1.0), smoothstep(0.35, 0.8, n.y) * 0.85);
  vec3 vd = normalize(cameraPosition - wp);
  vec3 c = awLight(n, alb, vd, 0.3 * sw + 0.12);
  float back = max(dot(vd, -uSunDir), 0.0);
  c += alb * uSunCol * (back * back * sw * 0.6);
  float cl = texture2D(uNoiseTex, wp.xz * uCloud.x + uCloud.yz).r;
  c *= 1.0 - smoothstep(0.45, 0.57, cl) * uCloud.w;
  c += uGlowCol * color.rgb * (uv.y * (0.15 + 2.2 * uFogP.z));
  vCol = c;
  vFog = awFog(wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FRAG = /* glsl */`
varying vec3 vCol; varying vec4 vFog;
void main() {
  gl_FragColor = vec4(mix(vCol, vFog.rgb, vFog.a), 1.0);
  #include <colorspace_fragment>
}`;

export function floraMaterial(glowHex = 0x7ff5e1, rock = false) {
  const C = (h) => new THREE.Color(h);
  return new AwMaterial({
    defines: rock ? { AW_ROCK: 1 } : {},
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uNoiseTex', 'uWind', 'uCloud'], {
      uStrata: { value: [C(0x8f3a34), C(0xc8553a), C(0xe07a45), C(0xf0b070)] }, uGlowCol: { value: C(glowHex) },
    }),
    vertexShader: VERT, fragmentShader: FRAG, vertexColors: true,
  });
}

// 近・遠の 2 段のインスタンス群
export class Scatter {
  constructor(nearGeo, farGeo, material, opts = {}) {
    this.items = [];
    this.nearDist = opts.nearDist ?? 100; this.farDist = opts.farDist ?? 900; this.always = opts.always ?? 26;
    this.nearGeo = nearGeo; this.farGeo = farGeo; this.material = material;
    this.name = opts.name || 'scatter';
    this.baseNear = this.nearDist;
  }
  add(x, y, z, s, yaw, tint = 0, flag = 0) { this.items.push(x, y, z, s, Math.cos(yaw), Math.sin(yaw), tint, flag); }
  build(group) {
    const n = this.items.length / 8;
    this.n = n;
    this.data = new Float32Array(this.items);
    this.items = null;
    const mk = (geo, cap) => {
      if (!geo) return null;
      const g = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'normal', 'color', 'uv']) g.setAttribute(k, geo.getAttribute(k));
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), b = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage); b.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aInst', a); g.setAttribute('aInst2', b);
      g.instanceCount = 0;
      const m = new THREE.Mesh(g, this.material);
      m.frustumCulled = false; m.matrixAutoUpdate = false; m.visible = false; m.name = this.name;
      group.add(m);
      return { g, a, b, m, cap };
    };
    this.near = mk(this.nearGeo, Math.max(1, Math.min(n, 400)));
    this.far = mk(this.farGeo, Math.max(1, n));
  }
  refresh(cx, cz, fx, fz, wide) {
    const d = this.data, n = this.n;
    const nd2 = this.nearDist * this.nearDist, fd2 = this.farDist * this.farDist, al2 = this.always * this.always;
    const N = this.near, F = this.far;
    let nn = 0, nf = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 8, dx = d[o] - cx, dz = d[o + 2] - cz, d2 = dx * dx + dz * dz;
      if (d2 > fd2) continue;
      if (d2 > al2 && !wide) { const dot = dx * fx + dz * fz; if (dot <= 0 || dot * dot < d2 * 0.03) continue; }
      let T;
      if (d2 < nd2 && N && nn < N.cap) { T = N; const q = nn++ * 4; T.a.array[q] = d[o]; T.a.array[q + 1] = d[o + 1]; T.a.array[q + 2] = d[o + 2]; T.a.array[q + 3] = d[o + 3]; T.b.array[q] = d[o + 4]; T.b.array[q + 1] = d[o + 5]; T.b.array[q + 2] = d[o + 6]; T.b.array[q + 3] = d[o + 7]; }
      else if (F && nf < F.cap) { T = F; const q = nf++ * 4; T.a.array[q] = d[o]; T.a.array[q + 1] = d[o + 1]; T.a.array[q + 2] = d[o + 2]; T.a.array[q + 3] = d[o + 3]; T.b.array[q] = d[o + 4]; T.b.array[q + 1] = d[o + 5]; T.b.array[q + 2] = d[o + 6]; T.b.array[q + 3] = d[o + 7]; }
    }
    if (N) { N.g.instanceCount = nn; N.m.visible = nn > 0; if (nn) { N.a.clearUpdateRanges(); N.b.clearUpdateRanges(); N.a.addUpdateRange(0, nn * 4); N.b.addUpdateRange(0, nn * 4); N.a.needsUpdate = true; N.b.needsUpdate = true; } }
    if (F) { F.g.instanceCount = nf; F.m.visible = nf > 0; if (nf) { F.a.clearUpdateRanges(); F.b.clearUpdateRanges(); F.a.addUpdateRange(0, nf * 4); F.b.addUpdateRange(0, nf * 4); F.a.needsUpdate = true; F.b.needsUpdate = true; } }
  }
}

// ── 形 ──
function treeGeos() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const bark = 0x5a4636, barkD = 0x3d2f26;
  const leafBlob = (r, pos, sc, bot, top, d = 1, c = null) => part(G.ico(r, d), { pos, scale: sc, bottom: bot, top, smooth: c || V(pos[0], pos[1] - r * 0.5, pos[2]), sway: 1, jitter: r * 0.07, topLight: 0.8 });
  // 1 広葉樹（草原・岸）
  const broadNear = merge([
    part(G.cyl(0.2, 0.42, 4.2, 6, 2), { pos: [0, 2.1, 0], bottom: barkD, top: bark, jitter: 0.05 }),
    part(G.cyl(0.1, 0.16, 2.2, 4), { pos: [0.7, 4.3, 0.2], rot: [0, 0, -0.75], color: bark }),
    leafBlob(2.7, [0, 6.3, 0], [1.15, 0.82, 1.15], 0x3f8f3c, 0xa9da66),
    leafBlob(1.9, [1.7, 5.3, 0.6], [1.1, 0.8, 1.1], 0x3a8538, 0x93cf5c),
    leafBlob(1.9, [-1.4, 5.6, -0.9], [1.1, 0.8, 1.1], 0x3a8538, 0x9cd460),
  ]);
  const broadFar = merge([
    part(G.cyl(0.25, 0.42, 4.2, 3), { pos: [0, 2.1, 0], color: 0x4a3a2e }),
    part(G.ico(3.1, 0), { pos: [0.1, 6.0, 0], scale: [1.25, 0.82, 1.25], bottom: 0x3f8f3c, top: 0xa3d663, smooth: V(0, 5, 0), sway: 1 }),
  ]);
  // 2 森の巨木
  const giantNear = merge([
    part(G.cyl(1.0, 1.75, 21, 8, 3), { pos: [0, 10.5, 0], bottom: barkD, top: bark, jitter: 0.16, jitterY: 0.2, vary: 0.12 }),
    part(G.cyl(1.7, 3.0, 3.2, 8, 1, true), { pos: [0, 1.4, 0], bottom: 0x2c2420, top: barkD, jitter: 0.3, jitterY: 0.1 }),
    part(G.cyl(0.3, 0.55, 7, 5), { pos: [2.6, 19.5, 0.8], rot: [0, 0, -0.95], color: bark }),
    part(G.cyl(0.3, 0.55, 7, 5), { pos: [-2.2, 20.5, -1.6], rot: [0.5, 0, 0.9], color: bark }),
    leafBlob(6.4, [0, 25.5, 0], [1.35, 0.55, 1.35], 0x1f5f48, 0x6fcf96),
    leafBlob(5.2, [5.6, 22.6, 1.8], [1.25, 0.5, 1.25], 0x1c5743, 0x62c48c),
    leafBlob(5.0, [-4.8, 23.4, -3.2], [1.25, 0.5, 1.25], 0x1c5743, 0x66c990),
    leafBlob(4.2, [0.8, 29.2, -0.6], [1.2, 0.6, 1.2], 0x2a7355, 0x86dfa6),
  ]);
  const giantFar = merge([
    part(G.cyl(1.1, 1.9, 22, 3, 1, true), { pos: [0, 11, 0], bottom: 0x2c2420, top: 0x4a3a2e }),
    part(G.ico(8.2, 0), { pos: [0.6, 24.4, 0], scale: [1.45, 0.55, 1.45], bottom: 0x1f5f48, top: 0x6fcf96, smooth: V(0, 21, 0), sway: 1 }),
    part(G.octa(4.6), { pos: [0.4, 28.8, -0.4], scale: [1.2, 0.62, 1.2], bottom: 0x2a7355, top: 0x86dfa6, smooth: V(0, 26, 0), sway: 1 }),
  ]);
  // 3 針葉樹（峰）
  const tier = (r, y, h, seg, bot, top, open = true) => part(G.cone(r, h, seg, open), { pos: [0, y + h / 2, 0], bottom: bot, top, sway: 0.6, topLight: 0.4 });
  const pineNear = merge([
    part(G.cyl(0.16, 0.3, 3, 5), { pos: [0, 1.5, 0], color: 0x4a3a30 }),
    tier(2.5, 1.6, 3.4, 8, 0x1e4442, 0x2f5a57, false), tier(2.0, 3.6, 3.2, 8, 0x234b48, 0x38665f),
    tier(1.5, 5.6, 3.0, 7, 0x275250, 0x427268), tier(1.0, 7.6, 2.8, 6, 0x2b5855, 0x4c7e72), tier(0.55, 9.4, 2.2, 5, 0x30605c, 0x5a8c7e),
  ]);
  const pineFar = merge([
    part(G.cone(2.4, 6.2, 5, false), { pos: [0, 4.6, 0], bottom: 0x1e4442, top: 0x38665f, sway: 0.6 }),
    part(G.cone(1.3, 5.2, 4, true), { pos: [0, 9.0, 0], bottom: 0x275250, top: 0x52857a, sway: 0.6 }),
  ]);
  // 4 峡谷の灌木
  const shrubNear = merge([
    part(G.cyl(0.07, 0.16, 1.5, 5, 2), { pos: [0, 0.75, 0], rot: [0.15, 0, 0.2], color: 0x6b4f3a, jitter: 0.04 }),
    part(G.cyl(0.05, 0.09, 1.2, 4), { pos: [-0.4, 1.2, 0.1], rot: [0, 0, 0.9], color: 0x6b4f3a }),
    leafBlob(0.95, [0.2, 1.85, 0], [1.3, 0.6, 1.2], 0x587f5a, 0x9fbf8c, 0),
    leafBlob(0.7, [-0.8, 1.6, 0.2], [1.2, 0.6, 1.2], 0x587f5a, 0x94b684, 0),
    leafBlob(0.6, [0.5, 2.4, -0.3], [1.2, 0.65, 1.2], 0x628a62, 0xa8c896, 0),
  ]);
  const shrubFar = merge([part(G.octa(1.2), { pos: [0, 1.7, 0], scale: [1.4, 0.7, 1.3], bottom: 0x587f5a, top: 0x9fbf8c, smooth: V(0, 1, 0) })]);
  return { broad: [broadNear, broadFar], giant: [giantNear, giantFar], pine: [pineNear, pineFar], shrub: [shrubNear, shrubFar] };
}
function rockGeos() {
  const grey = (p, n) => { const k = 0.55 + 0.45 * Math.max(0, n.y) + 0.12 * Math.sin(p.y * 2.1); return [k, k, k]; };
  const boulderNear = merge([part(G.ico(1, 1), { scale: [1.2, 0.8, 1], pos: [0, 0.35, 0], jitter: 0.16, color: grey })]);
  const boulderFar = merge([part(G.ico(1.05, 0), { scale: [1.2, 0.8, 1], pos: [0, 0.35, 0], color: grey })]);
  // 石柱：ふくらみとくびれ、上に帽子岩
  const prof = [[1.0, 0], [0.8, 0.14], [0.92, 0.3], [0.62, 0.5], [0.74, 0.68], [0.5, 0.84]];
  const pillarParts = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const h = (prof[i + 1][1] - prof[i][1]);
    pillarParts.push(part(G.cyl(prof[i + 1][0] * 0.5, prof[i][0] * 0.5, h, 6, 1, true), { pos: [0, prof[i][1] + h / 2, 0], jitter: 0.035, jitterY: 0, color: grey }));
  }
  pillarParts.push(part(G.cyl(0.42, 0.36, 0.16, 6), { pos: [0.02, 0.92, 0], jitter: 0.03, color: grey }));
  const pillarNear = merge(pillarParts);
  const pillarFar = merge([part(G.cyl(0.28, 0.5, 0.86, 4, 1, true), { pos: [0, 0.43, 0], color: grey }), part(G.cyl(0.4, 0.36, 0.16, 4), { pos: [0, 0.93, 0], color: grey })]);
  // 岩塔（海の岩・氷のとげ・板岩）
  // 岩塔（海の岩・氷のとげ）：くびれた柱と、寄りそう小さな柱
  const VV = (x, y, z) => new THREE.Vector3(x, y, z);
  const spire = (sides, k) => tubeGeo([VV(0, -0.05, 0), VV(0.03, 0.25, 0.02), VV(-0.02, 0.55, 0), VV(0.05, 0.85, -0.03), VV(0.02, 1.15, 0.02), VV(0.08, 1.42, 0)],
    [0.6 * k, 0.5 * k, 0.36 * k, 0.4 * k, 0.27 * k, 0.1 * k], [0.52 * k, 0.44 * k, 0.4 * k, 0.33 * k, 0.24 * k, 0.09 * k], sides, VV(0, 0, 1));
  const stackNear = merge([
    part(spire(7, 1), { jitter: 0.045, color: grey }),
    part(spire(5, 0.5), { pos: [0.62, 0, 0.2], scale: [1, 0.62, 1], rot: [0, 1.3, -0.08], jitter: 0.03, color: grey }),
    part(G.dodeca(0.3), { pos: [-0.5, 0.12, -0.35], scale: [1.2, 0.7, 1], jitter: 0.04, color: grey }),
  ]);
  const stackFar = merge([part(spire(5, 1), { color: grey }), part(spire(4, 0.5), { pos: [0.62, 0, 0.2], scale: [1, 0.62, 1], color: grey })]);
  return { boulder: [boulderNear, boulderFar], pillar: [pillarNear, pillarFar], stack: [stackNear, stackFar] };
}
function mushroomGeo() {
  const parts = [];
  const one = (x, z, h, r, cap) => {
    parts.push(part(G.cyl(r * 0.22, r * 0.3, h, 4, 1, true), { pos: [x, h / 2, z], color: 0xe8f2ea, glow: 0.25 }));
    parts.push(part(G.cone(r, r * 0.8, 6, true), { pos: [x, h + r * 0.3, z], bottom: cap, top: 0xffffff, glow: 1 }));
  };
  one(0, 0, 0.42, 0.26, 0x62e6ff); one(0.3, 0.15, 0.26, 0.17, 0x8ff0ff); one(-0.22, 0.24, 0.2, 0.13, 0xff9be0);
  return merge(parts);
}
function lampGeo() {
  return merge([
    part(G.cyl(0.07, 0.11, 1.9, 5), { pos: [0, 0.95, 0], bottom: 0x6f6a60, top: 0x9a9484 }),
    part(G.cyl(0.2, 0.26, 0.14, 6), { pos: [0, 0.07, 0], color: 0x8a8476 }),
    part(G.box(0.34, 0.06, 0.34), { pos: [0, 1.9, 0], color: 0x7a7468 }),
    part(G.octa(0.2), { pos: [0, 2.16, 0], scale: [1, 1.25, 1], color: 0xfff0c0, glow: 1 }),
    part(G.cone(0.3, 0.2, 4), { pos: [0, 2.48, 0], rot: [0, Math.PI / 4, 0], color: 0x5f6a82 }),
  ]);
}

export function createFlora(env) {
  const { hf, col } = env;
  const group = new THREE.Group();
  group.name = 'aw-flora';
  const rng = env.fork('flora');
  const mat = floraMaterial(0x7ff5e1), matLamp = floraMaterial(0xffc46a), matRock = floraMaterial(0x7ff5e1, true);
  const tg = treeGeos(), rg = rockGeos();
  const S = {
    broad: new Scatter(tg.broad[0], tg.broad[1], mat, { nearDist: 105, farDist: 760, name: 'tree-broad' }),
    giant: new Scatter(tg.giant[0], tg.giant[1], mat, { nearDist: 100, farDist: 820, name: 'tree-giant', always: 40 }),
    pine: new Scatter(tg.pine[0], tg.pine[1], mat, { nearDist: 100, farDist: 760, name: 'tree-pine' }),
    shrub: new Scatter(tg.shrub[0], tg.shrub[1], mat, { nearDist: 70, farDist: 420, name: 'tree-shrub' }),
    boulder: new Scatter(rg.boulder[0], rg.boulder[1], matRock, { nearDist: 70, farDist: 520, name: 'rock-boulder' }),
    pillar: new Scatter(rg.pillar[0], rg.pillar[1], matRock, { nearDist: 130, farDist: 900, name: 'rock-pillar', always: 40 }),
    stack: new Scatter(rg.stack[0], rg.stack[1], matRock, { nearDist: 260, farDist: 900, name: 'rock-stack' }),
    mushroom: new Scatter(mushroomGeo(), null, mat, { nearDist: 75, farDist: 75, name: 'mushroom' }),
    lamp: new Scatter(lampGeo(), null, matLamp, { nearDist: 150, farDist: 150, name: 'lamp' }),
  };
  const w = [0, 0, 0, 0];
  const nearLandmark = (x, z, pad) => {
    for (const l of LANDMARKS) { if (!l.r) continue; const d = Math.hypot(x - l.x, z - l.z); if (d < l.r + pad) return true; }
    return false;
  };
  const taken = [];
  const farFrom = (x, z, r) => { for (let i = 0; i < taken.length; i += 3) { const dx = taken[i] - x, dz = taken[i + 1] - z, rr = r + taken[i + 2]; if (dx * dx + dz * dz < rr * rr) return false; } return true; };
  const keepClear = [[LM.start.x, LM.start.z, 26], [0, 440, 0], [-420, 220, 5], [LM.elder_tree.x, LM.elder_tree.z, 30], [LM.great_arch.x, LM.great_arch.z, 24]];
  const clearOf = (x, z) => { for (const k of keepClear) if (Math.hypot(x - k[0], z - k[1]) < k[2]) return false; return true; };
  // 出発点からの眺めの軸（塔・湖・天の錨・峰）は木を置かない
  const inSightline = (x, z) => z > 150 && z < 540 && Math.abs(x - (z - 150) / 390 * 0) < 26 + (540 - z) * 0.09;
  const lamps = [];

  // ── 木 ──
  const CELLS = 9;
  for (let gz = -780; gz < 780; gz += CELLS) for (let gx = -780; gx < 780; gx += CELLS) {
    const x = gx + rng.next() * CELLS, z = gz + rng.next() * CELLS;
    const h = hf.heightAt(x, z);
    if (h < 1.6) continue;
    const ny = hf.normalY(x, z);
    if (ny < 0.84) continue;
    if (hf.pathDistAt(x, z) < 5.5 || hf.waterDepthAt(x, z) > 0 || nearLandmark(x, z, 5) || !clearOf(x, z)) continue;
    hf.weightsAt(x, z, w);
    const dC = Math.hypot(x - LAKE_C.x, z - LAKE_C.z);
    if (dC < 196) continue;
    const cl = hf.nm.fbm(x / 130 + 40.1, z / 130 + 12.7, 3);            // 木立のかたまり
    const cd = hf.coastDAt(x, z);
    const r = rng.next();
    const lakeRim = smoothstep(250, 215, dC);
    let kind = null, s = 1, cr = 0.4;
    const pM = w[0] * (smoothstep(0.52, 0.66, cl) * 0.2 + 0.006) * (inSightline(x, z) ? 0 : 1) * (1 - lakeRim * 0.6);
    const pF = w[1] * (0.26 + 0.2 * smoothstep(0.35, 0.6, cl)) * (cd < 60 ? 0.4 : 1);
    const pC = w[2] * (0.045 + 0.09 * smoothstep(0.5, 0.65, cl));
    const pP = w[3] * (smoothstep(0.42, 0.6, cl) * 0.34 + 0.02) * smoothstep(84, 66, h);
    if (r < pM) { kind = 'broad'; s = rng.range(0.8, 1.35); cr = 0.42 * s; }
    else if (r < pM + pF) {
      if (rng.next() < 0.42 && h > 20) { kind = 'giant'; s = rng.range(0.75, 1.3); cr = 1.7 * s; }
      else { kind = 'broad'; s = rng.range(0.9, 1.7); cr = 0.42 * s; }
    } else if (r < pM + pF + pC) { kind = 'shrub'; s = rng.range(0.8, 1.7); cr = 0; }
    else if (r < pM + pF + pC + pP) { kind = 'pine'; s = rng.range(0.8, 1.6); cr = 0.3 * s; }
    if (!kind) continue;
    if (kind === 'giant' && !farFrom(x, z, 7)) continue;
    const tint = rng.range(-1, 1);
    const forestBroad = kind === 'broad' && w[1] > 0.5;
    S[kind].add(x, h - 0.15 * s, z, s, rng.range(0, 6.28), forestBroad ? -0.9 + tint * 0.4 : tint, kind === 'pine' && h > 52 ? 2 : 0);
    if (cr > 0) { col.addCollider({ x, z, r: cr, y0: h - 1, y1: h + (kind === 'giant' ? 22 : 5) * s, kind: 'tree' }); taken.push(x, z, cr + 1); }
  }

  // ── 岩 ──
  const addRock = (kind, x, z, s, flag, tint, sink = 0.2, collide = true) => {
    const h = hf.heightAt(x, z);
    S[kind].add(x, h - sink * s, z, s, rng.range(0, 6.28), tint ?? rng.range(-1, 1), flag);
    const cr = kind === 'boulder' ? 0.95 * s : kind === 'pillar' ? 0.42 * s : 0.5 * s;
    if (collide && cr > 0.5) { col.addCollider({ x, z, r: cr, y0: h - 1, y1: h + (kind === 'boulder' ? 0.9 : 1) * s, kind: 'rock' }); taken.push(x, z, cr + 0.5); }
  };
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(-760, 760), z = rng.range(-760, 760);
    const h = hf.heightAt(x, z);
    if (h < 0.5 || hf.pathDistAt(x, z) < 4.5 || hf.waterDepthAt(x, z) > 0 || nearLandmark(x, z, 4) || !farFrom(x, z, 1.5)) continue;
    const dC = Math.hypot(x - LAKE_C.x, z - LAKE_C.z);
    if (dC < 190) continue;
    hf.weightsAt(x, z, w);
    const ny = hf.normalY(x, z), r = rng.next();
    if (ny < 0.72) continue;
    const p = w[0] * 0.07 + w[1] * 0.13 + w[2] * 0.26 + w[3] * 0.3 + (hf.coastDAt(x, z) < 60 ? 0.2 : 0);
    if (r > p || !clearOf(x, z)) continue;
    const big = rng.next();
    const s = big > 0.93 ? rng.range(2.2, 3.6) : rng.range(0.5, 1.6);
    if (w[2] > 0.5 && rng.next() < 0.3) addRock('pillar', x, z, rng.range(3, 9), 1);
    else if (w[3] > 0.5 && rng.next() < 0.35) addRock('stack', x, z, rng.range(1.5, 4), 2, 0.3);
    else addRock('boulder', x, z, s, w[2] > 0.5 ? 1 : w[3] > 0.5 ? 2 : w[1] > 0.5 ? 3 : (hf.coastDAt(x, z) < 90 ? 4 : 0));
  }
  // 千本石柱
  for (let i = 0; i < 150; i++) {
    const a = rng.range(0, 6.28), d = 8 + Math.pow(rng.next(), 0.7) * 72;
    const x = LM.hoodoos.x + Math.sin(a) * d * 1.15, z = LM.hoodoos.z + Math.cos(a) * d * 0.85;
    if (hf.pathDistAt(x, z) < 4 || !farFrom(x, z, 2.2) || hf.normalY(x, z) < 0.8) continue;
    addRock('pillar', x, z, rng.range(6, 19) * (1 - d / 160), 1);
  }
  // 海の岩（夕凪の浜・岬・射手の祠の入江）
  const seaRocks = [[-540, 420, 60, 14], [-500, 470, 50, 8], [540, 520, 60, 12], [500, 410, 30, 0], [-40, 690, 40, 5], [300, -640, 60, 8], [-660, -200, 60, 8], [660, 200, 50, 6]];
  for (const [cx, cz, rad, cnt] of seaRocks) for (let i = 0; i < cnt; i++) {
    const a = rng.range(0, 6.28), d = rng.range(0.2, 1) * rad;
    const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d, h = hf.heightAt(x, z);
    if (h > -0.4 || h < -9 || !farFrom(x, z, 4)) continue;
    const s = rng.range(3, 9);
    S.stack.add(x, h - 0.5, z, s, rng.range(0, 6.28), rng.range(-0.5, 0.5), cx > 300 && cz > 300 ? 4 : 0);
    col.addCollider({ x, z, r: 0.5 * s, y0: h - 1, y1: h + s * 1.3, kind: 'rock' }); taken.push(x, z, s * 0.5);
  }
  // 白波の岬の沖に立つ大きな岩（朝焼けの影絵）
  for (const [x, z, s] of [[590, 474, 30], [640, 532, 46], [570, 552, 20], [700, 462, 34], [612, 606, 24], [548, 592, 13]]) {
    const h = Math.min(hf.heightAt(x, z), -1);
    S.stack.add(x, h - 1, z, s, x * 0.37, 0.1, 4);
    col.addCollider({ x, z, r: 0.45 * s, y0: h - 2, y1: h + s * 1.4, kind: 'rock' }); taken.push(x, z, s * 0.5);
  }
  // 射手の祠の的をのせる岩（入江の中）
  env.archery = [];
  {
    const sx = LM.shrine_coast.x, sz = LM.shrine_coast.z;
    const base = Math.atan2(512 - sx, -(404 - sz));
    const fan = [[-0.5, 26], [-0.28, 34], [-0.1, 24], [0.05, 42], [0.22, 30], [0.4, 38], [0.58, 27], [-0.4, 44]];
    fan.forEach(([da, dist], i) => {
      let d = dist, x = 0, z = 0, h = 0;
      for (let k = 0; k < 30; k++) { x = sx + Math.sin(base + da) * d; z = sz - Math.cos(base + da) * d; h = hf.heightAt(x, z); if (h < -0.3) break; d += 2; }
      const top = 2.4 + (i % 3) * 1.3;
      const s = (top - h + 0.5) / 1.42;
      S.stack.add(x, h - 0.5, z, s, i * 1.7, 0.2, 4);
      col.addCollider({ x, z, r: 0.45 * s, y0: h - 1, y1: top, kind: 'rock' }); taken.push(x, z, s * 0.5);
      const moving = i === 3 || i === 6;
      env.archery.push({ x, y: top + 1.0, z, moving, range: moving ? 3 : 0 });
    });
  }
  // 氷鏡のまわりの氷のとげ
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, 6.28), d = rng.range(36, 52);
    const x = LM.ice_mirror.x + Math.sin(a) * d, z = LM.ice_mirror.z + Math.cos(a) * d;
    if (hf.pathDistAt(x, z) < 5 || !farFrom(x, z, 1.5)) continue;
    // 眺め（北西）の正面は低く
    addRock('stack', x, z, rng.range(1.2, 3.2), 2, 0.4);
  }

  // ── 光るきのこ（森・くぼ地・採集点）──
  for (let i = 0; i < 130; i++) {
    const a = rng.range(0, 6.28), d = Math.sqrt(rng.next()) * 34;
    const x = LM.hollow.x + Math.sin(a) * d, z = LM.hollow.z + Math.cos(a) * d;
    S.mushroom.add(x, hf.heightAt(x, z) - 0.02, z, rng.range(0.8, 3.4) * (1 - d / 60), rng.range(0, 6.28), rng.range(-1, 1), 0);
  }
  for (const g of GATHER) if (g.itemId === 'mushroom') for (let i = 0; i < 4; i++) {
    const x = g.x + rng.range(-1.6, 1.6), z = g.z + rng.range(-1.6, 1.6);
    S.mushroom.add(x, hf.heightAt(x, z) - 0.02, z, rng.range(0.8, 1.6), rng.range(0, 6.28), rng.range(-1, 1), 0);
  }
  for (let i = 0; i < 900; i++) {
    const x = rng.range(-700, -200), z = rng.range(-320, 420);
    hf.weightsAt(x, z, w);
    if (w[1] < 0.7 || hf.heightAt(x, z) < 3 || hf.pathDistAt(x, z) < 2.5 || hf.normalY(x, z) < 0.85) continue;
    if (hf.nm.n2(x / 30 + 5, z / 30 + 9) < 0.52) continue;
    S.mushroom.add(x, hf.heightAt(x, z) - 0.02, z, rng.range(0.7, 1.9), rng.range(0, 6.28), rng.range(-1, 1), 0);
  }

  // ── 道灯（25 m おき）──
  for (const p of hf.pathLines) {
    let acc = 12, side = 1;
    for (let i = 1; i < p.samples.length; i++) {
      const a = p.samples[i - 1], b = p.samples[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      acc += l;
      if (acc < 25) continue;
      acc = 0; side = -side;
      const tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
      const x = b[0] - tz * 2.9 * side, z = b[1] + tx * 2.9 * side;
      if (hf.waterDepthAt(x, z) > 0 || nearLandmark(x, z, 1) || !farFrom(x, z, 1)) continue;
      const h = hf.heightAt(x, z);
      S.lamp.add(x, h - 0.05, z, 1, rng.range(0, 6.28), 0, 0);
      col.addCollider({ x, z, r: 0.16, y0: h, y1: h + 2.4, kind: 'structure' });
      lamps.push([x, h + 2.16, z]);
    }
  }

  for (const k in S) S[k].build(group);
  const counts = {}; for (const k in S) counts[k] = S[k].n;

  let lx = 1e9, lz = 1e9, lfx = 0, lfz = 0, timer = 0;
  function update(view) {
    const { cam, fwd } = view;
    let fx = fwd.x, fz = fwd.z;
    const fl = Math.hypot(fx, fz);
    const wide = fl < 0.45;           // ほぼ真上・真下を見ている：全方位
    if (fl > 1e-3) { fx /= fl; fz /= fl; }
    timer += view.dt;
    const moved = Math.hypot(cam.x - lx, cam.z - lz) > 2.5, turned = fx * lfx + fz * lfz < 0.996;
    if (!moved && !turned && timer < 1.5 && !view.jump) return;
    lx = cam.x; lz = cam.z; lfx = fx; lfz = fz; timer = 0;
    for (const k in S) S[k].refresh(cam.x, cam.z, fx, fz, wide);
  }
  function setQuality(level) {
    for (const k in S) S[k].nearDist = S[k].baseNear * (level === 0 ? 1 : level === 1 ? 0.76 : 0.55);
    lx = 1e9;
  }
  return { group, update, setQuality, counts, lamps, scatters: S, mat };
}
