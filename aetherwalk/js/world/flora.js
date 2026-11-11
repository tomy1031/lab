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
varying vec3 vCol; varying vec4 vFog; varying vec3 vNz;
#ifdef AW_LEAF
uniform float uLeafGlow;
varying vec2 vUv;
#endif
void main() {
  vec3 p = position * aInst.w;
  p.y *= 1.0 + aInst2.z * 0.12;
  p = vec3(p.x * aInst2.x - p.z * aInst2.y, p.y, p.x * aInst2.y + p.z * aInst2.x);
  vec3 n = vec3(normal.x * aInst2.x - normal.z * aInst2.y, normal.y, normal.x * aInst2.y + normal.z * aInst2.x);
  #ifdef AW_LEAF
    float sw = 1.0, glw = uLeafGlow * (0.4 + 0.6 * color.g);
    vUv = uv;
  #else
    float sw = uv.x, glw = uv.y;
  #endif
  vNz = vec3(vec2(position.x + position.z, position.y * 0.3) * (0.16 * aInst.w), step(glw, 0.01));
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
    else if (aInst2.w > 3.5) {
      // 白い崖の岩：白亜の肌、上に海辺の草、波に洗われる根もとは濡れて暗い
      alb = mix(vec3(0.62, 0.6, 0.55), vec3(0.93, 0.91, 0.85), color.g) * (0.9 + 0.1 * sin(wp.y * 2.4));
      alb = mix(alb, vec3(0.2, 0.42, 0.13), smoothstep(0.72, 0.9, n.y) * smoothstep(1.5, 4.0, wp.y));
      alb *= mix(0.42, 1.0, smoothstep(-0.2, 1.6, wp.y));
    }
    else if (aInst2.w > 2.5) alb = mix(alb * vec3(0.11, 0.115, 0.09), vec3(0.05, 0.2, 0.08), smoothstep(0.2, 0.75, n.y) * 0.8);
    else if (aInst2.w > 1.5) alb *= vec3(0.11, 0.145, 0.22);
  #endif
  if (aInst2.w > 0.5 && aInst2.w < 1.5) {
    float bi = floor((wp.y + sin(wp.x * 0.11 + wp.z * 0.07) * 1.5) / 3.3);
    vec3 st = uStrata[int(mod(bi, 4.0))];
    alb = st * (0.55 + 0.9 * color.g);
  }
  alb *= vec3(1.0 + aInst2.z * 0.16, 1.0 + aInst2.z * 0.05, 1.0 - aInst2.z * 0.12);
  if (aInst2.w > 1.5) {
    // 雪：上を向いた面に、まだらに積もる（全体を灰色にしない）
    float patchy = 0.28 * sin(wp.x * 1.7 + wp.y * 2.3) * sin(wp.z * 1.9 - wp.y * 1.3);
    alb = mix(alb, vec3(0.93, 0.96, 1.0), smoothstep(0.5, 0.78, n.y + patchy) * 0.92);
  }
  vec3 vd = normalize(cameraPosition - wp);
  vec3 c = awShade(n, alb, vd, 0.3 * sw + 0.12, 1.0, sw * 0.85 * (1.0 - 0.75 * uFogP.z), 0.0, 16.0);
  float cl = texture2D(uNoiseTex, wp.xz * uCloud.x + uCloud.yz).r;
  c *= 1.0 - smoothstep(0.42, 0.6, cl) * uCloud.w;
  c += uGlowCol * color.rgb * (glw * (0.15 + 2.2 * uFogP.z));
  vCol = c;
  vFog = awFog(wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uNoiseTex;
varying vec3 vCol; varying vec4 vFog; varying vec3 vNz;
#ifdef AW_LEAF
uniform sampler2D uLeafTex;
varying vec2 vUv;
#endif
void main() {
  vec3 c = vCol;
  float al = 1.0;
  #ifdef AW_LEAF
    vec4 t = texture2D(uLeafTex, vUv);
    if (t.a < 0.3) discard;
    al = clamp((t.a - 0.3) / max(fwidth(t.a), 1e-3) + 0.5, 0.0, 1.0);
    c *= 0.5 + 0.78 * t.r;
  #else
    // 樹皮・岩・葉のかたまりに、筆むらのような明暗をのせる
    c *= mix(1.0, 0.74 + 0.52 * texture2D(uNoiseTex, vNz.xy).g, vNz.z);
  #endif
  gl_FragColor = vec4(mix(c, vFog.rgb, vFog.a), al);
  #include <colorspace_fragment>
}`;

// 葉むらと羊歯の絵（左：葉のかたまり、右：羊歯の葉）。r = 明るさ、a = 形
let leafTex = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d');
  const R = makeRng(4711);
  const leaf = (x, y, len, wid, ang, lum) => {
    c.save(); c.translate(x, y); c.rotate(ang);
    const g = c.createLinearGradient(0, -wid, 0, wid);
    const a = Math.round(lum * 0.72), b = Math.round(lum);
    g.addColorStop(0, `rgb(${b},${b},${b})`); g.addColorStop(0.5, `rgb(${a},${a},${a})`); g.addColorStop(1, `rgb(${b},${b},${b})`);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-len, 0); c.quadraticCurveTo(0, -wid * 1.5, len, 0); c.quadraticCurveTo(0, wid * 1.5, -len, 0); c.fill();
    c.restore();
  };
  // 葉むら：暗い葉を下に、明るい葉を上に重ねる。まん中ほど濃く、縁はまばら
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < 95; i++) {
    const a = R.range(0, 6.283), d = Math.pow(R.next(), 0.62) * (104 + pass * 8);
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d * 0.92;
    leaf(x, y, R.range(13, 21), R.range(5, 8), a + R.range(-0.9, 0.9), 95 + pass * 55 + R.range(0, 50));
  }
  // 羊歯：中肋と左右の小葉（根もと = 下、先 = 上）
  c.strokeStyle = 'rgb(150,150,150)'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(384, 252); c.lineTo(384, 8); c.stroke();
  for (let i = 0; i < 26; i++) {
    const t = i / 25, y = 246 - t * 232, len = 16 + 86 * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - t * 0.35);
    for (const sgn of [-1, 1]) leaf(384 + sgn * len * 0.5, y - 6, len * 0.5, 4.6, sgn > 0 ? -0.32 : Math.PI + 0.32, 150 + R.range(0, 100) - Math.abs(t - 0.5) * 40);
  }
  leafTex = new THREE.CanvasTexture(cv);
  leafTex.colorSpace = THREE.NoColorSpace;
  leafTex.generateMipmaps = true; leafTex.minFilter = THREE.LinearMipmapLinearFilter; leafTex.magFilter = THREE.LinearFilter;
  leafTex.anisotropy = 2;
  return leafTex;
}

// 針葉の枝の絵（256²）：下から上へのびる小枝と、斜め前へ生える細い針葉。先ほど細く、明るい
let needleTex = null;
function needleTexture() {
  if (needleTex) return needleTex;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const c = cv.getContext('2d');
  const R = makeRng(5150);
  c.lineCap = 'round';
  const twig = (x0, y0, x1, y1, w, depth) => {
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    const n = Math.round(L / 2.6);
    for (let i = 2; i < n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const nl = (14 + 10 * Math.sin(Math.PI * t)) * (1 - 0.45 * t) * (depth ? 0.7 : 1);
      for (const s of [-1, 1]) {
        const ang = Math.atan2(uy, ux) + s * R.range(0.55, 0.9);
        const lum = Math.round(110 + 120 * t + R.range(-25, 25));
        c.strokeStyle = `rgb(${lum},${lum},${lum})`; c.lineWidth = R.range(1.6, 2.4);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * nl, y + Math.sin(ang) * nl); c.stroke();
      }
    }
    c.strokeStyle = 'rgb(90,90,90)'; c.lineWidth = w;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  };
  twig(128, 252, 128, 6, 3.4, 0);
  for (let i = 0; i < 6; i++) {
    const y = 220 - i * 34, s = i % 2 ? 1 : -1, len = 70 - i * 8;
    twig(128, y, 128 + s * len, y - len * 0.75, 2, 1);
  }
  needleTex = new THREE.CanvasTexture(cv);
  needleTex.colorSpace = THREE.NoColorSpace;
  needleTex.generateMipmaps = true; needleTex.minFilter = THREE.LinearMipmapLinearFilter; needleTex.magFilter = THREE.LinearFilter;
  needleTex.anisotropy = 2;
  return needleTex;
}

// 葉むらの板：かたまり（blob）の表面に、斜めに重なる板を並べる。法線は中心から外向き（球のように陰影がつく）
// blobs: [{ c: [x, y, z], r: [rx, ry, rz], n, bot, top }]
export function leafCards(blobs, rng, size = 0.62) {
  const pos = [], nor = [], col = [], uv = [];
  const d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), nn = new THREE.Vector3(), a1 = new THREE.Vector3(), a2 = new THREE.Vector3(), v = new THREE.Vector3(), cc = new THREE.Color(), c2 = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0), corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  const ico1 = new THREE.IcosahedronGeometry(1, 1).getAttribute('position'), ico0 = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  let first = true;
  for (const b of blobs) {
    const ico = first ? ico1 : ico0; first = false;      // いちばん大きいかたまりだけ細かく
    if (b.shell !== false) {
      // 葉の殻：すき間のあいた内側の層（暗い）。向こうの空がのぞく
      cc.set(b.bot).multiplyScalar(0.5); c2.set(b.top).multiplyScalar(0.62);
      for (let t3 = 0; t3 < ico.count; t3 += 3) {
        const u0 = rng.range(0.03, 0.12), v0 = rng.range(0.06, 0.2), fl = rng.next() < 0.5;
        const tu = [[u0, v0], [u0 + 0.34, v0 + (fl ? 0.1 : 0)], [u0 + 0.17, v0 + 0.72]];
        for (let q = 0; q < 3; q++) {
          const x = ico.getX(t3 + q), y = ico.getY(t3 + q), z = ico.getZ(t3 + q);
          pos.push(b.c[0] + x * b.r[0] * 0.74, b.c[1] + y * b.r[1] * 0.72, b.c[2] + z * b.r[2] * 0.74);
          v.set(x, y + 0.5, z).normalize(); nor.push(v.x, v.y, v.z);
          const t = y * 0.5 + 0.5;
          col.push(cc.r + (c2.r - cc.r) * t, cc.g + (c2.g - cc.g) * t, cc.b + (c2.b - cc.b) * t);
          uv.push(tu[q][0], tu[q][1]);
        }
      }
    }
    for (let i = 0; i < b.n; i++) {
      do { d.set(rng.range(-1, 1), rng.range(-0.9, 0.9), rng.range(-1, 1)); } while (d.lengthSq() > 1 || d.lengthSq() < 0.1);
      d.normalize();
      const k = rng.range(0.74, 1.02);
      const cx = b.c[0] + d.x * b.r[0] * k, cy = b.c[1] + d.y * b.r[1] * k, cz = b.c[2] + d.z * b.r[2] * k;
      t1.crossVectors(d, UP); if (t1.lengthSq() < 1e-3) t1.set(1, 0, 0); t1.normalize(); t2.crossVectors(d, t1);
      nn.copy(d).addScaledVector(t1, rng.range(-0.8, 0.8)).addScaledVector(t2, rng.range(-0.8, 0.8)).normalize();
      a1.crossVectors(nn, UP); if (a1.lengthSq() < 1e-3) a1.set(1, 0, 0); a1.normalize(); a2.crossVectors(nn, a1);
      const roll = rng.range(0, 6.283), cr = Math.cos(roll), sr = Math.sin(roll);
      const s = (b.r[0] + b.r[1] + b.r[2]) / 3 * size * rng.range(0.8, 1.25);
      const t = Math.min(1, Math.max(0, (d.y + 0.9) / 1.8));
      cc.set(b.bot).lerp(c2.set(b.top), t * t * 0.4 + t * 0.6);
      const br = rng.range(0.82, 1.18), warm = rng.next() < 0.18 ? rng.range(0.08, 0.2) : 0;
      for (const q of corners) {
        const u = (q[0] * cr - q[1] * sr) * s, w = (q[0] * sr + q[1] * cr) * s;
        v.set(cx + a1.x * u + a2.x * w, cy + a1.y * u + a2.y * w, cz + a1.z * u + a2.z * w);
        pos.push(v.x, v.y, v.z);
        v.set(v.x - b.c[0], (v.y - b.c[1]) + b.r[1] * 0.7, v.z - b.c[2]).normalize();
        nor.push(v.x, v.y, v.z);
        col.push(cc.r * br * (1 + warm * 1.6), cc.g * br * (1 + warm * 0.5), cc.b * br * (1 - warm));
        uv.push((q[0] * 0.5 + 0.5) * 0.5, q[1] * 0.5 + 0.5);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}

// 針葉樹の枝の板：段ごとに放射状に垂れる板（葉の絵の右半分＝羊歯の葉を、暗い青緑の針葉の枝として使う）
export function pineCards(tiers, per, rng, far = false) {
  const pos = [], nor = [], col = [], uv = [];
  const cb = new THREE.Color(0x163a36), ct = new THREE.Color(0x3d6f5f), c = new THREE.Color();
  tiers.forEach(([r, y, h], ti) => {
    const n = per - (ti > 3 ? 3 : 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ti * 0.7 + rng.range(-0.2, 0.2), dx = Math.sin(a), dz = Math.cos(a), sx = dz, sz = -dx;
      const reach = r * rng.range(1.0, 1.15), w = r * (far ? 1.0 : 0.9) * rng.range(0.85, 1.1);
      const root = [dx * r * 0.1, y + h * 0.85, dz * r * 0.1], tip = [dx * reach, y + rng.range(-0.15, 0.15), dz * reach];
      // 板の面は枝に沿って少しねじる（真横から見ても線にならない）
      const tw = rng.range(0.25, 0.55);
      const q = [[root, -0.5, 0], [root, 0.5, 0], [tip, 0.5, 1], [root, -0.5, 0], [tip, 0.5, 1], [tip, -0.5, 1]];
      const bright = rng.range(0.85, 1.15);
      for (const [p0, sd, t] of q) {
        const ww = w * (0.45 + 0.55 * t) * sd;
        pos.push(p0[0] + sx * ww, p0[1] + ww * tw * (t - 0.3), p0[2] + sz * ww);
        nor.push(dx * 0.78, 0.45, dz * 0.78);
        c.copy(cb).lerp(ct, (0.25 + 0.75 * t) * (0.6 + 0.4 * ti / tiers.length)).multiplyScalar(bright);
        col.push(c.r, c.g, c.b);
        uv.push(0.5 + sd * 0.98, 0.02 + t * 0.96);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}

export function floraMaterial(glowHex = 0x7ff5e1, rock = false, leaf = false, leafGlow = 0) {
  const C = (h) => new THREE.Color(h);
  const m = new AwMaterial({
    defines: rock ? { AW_ROCK: 1 } : leaf ? { AW_LEAF: 1 } : {},
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uNoiseTex', 'uWind', 'uCloud'], {
      uStrata: { value: [C(0x8f3a34), C(0xc8553a), C(0xe07a45), C(0xf0b070)] }, uGlowCol: { value: C(glowHex) },
      uLeafTex: { value: leaf ? leafTexture() : null }, uLeafGlow: { value: leafGlow },
    }),
    vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, side: leaf ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (leaf) m.alphaToCoverage = true;
  return m;
}

// 近・遠の 2 段のインスタンス群
export class Scatter {
  constructor(nearGeo, farGeo, material, opts = {}) {
    this.items = [];
    this.nearDist = opts.nearDist ?? 100; this.farDist = opts.farDist ?? 900; this.always = opts.always ?? 26;
    this.nearGeo = nearGeo; this.farGeo = farGeo; this.material = material;
    this.name = opts.name || 'scatter';
    this.baseNear = this.nearDist;
    this.extraFar = opts.extraFar || null;
    this.extra = opts.extra || null;      // { geo, material }：近景に重ねるもう 1 枚（葉むらの板）。インスタンスは共有
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
    if (this.extra && this.near) {
      const g = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'normal', 'color', 'uv']) g.setAttribute(k, this.extra.geo.getAttribute(k));
      g.setAttribute('aInst', this.near.a); g.setAttribute('aInst2', this.near.b);
      g.instanceCount = 0;
      const m = new THREE.Mesh(g, this.extra.material);
      m.frustumCulled = false; m.matrixAutoUpdate = false; m.visible = false; m.name = this.name + '-leaf';
      group.add(m);
      this.ex = { g, m };
    }
    this.far = mk(this.farGeo, Math.max(1, n));
    if (this.extraFar && this.far) {
      const g = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'normal', 'color', 'uv']) g.setAttribute(k, this.extraFar.geo.getAttribute(k));
      g.setAttribute('aInst', this.far.a); g.setAttribute('aInst2', this.far.b);
      g.instanceCount = 0;
      const m = new THREE.Mesh(g, this.extraFar.material);
      m.frustumCulled = false; m.matrixAutoUpdate = false; m.visible = false; m.name = this.name + '-leaf-far';
      group.add(m);
      this.exF = { g, m };
    }
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
    if (this.ex) { this.ex.g.instanceCount = nn; this.ex.m.visible = nn > 0; }
    if (this.exF) { this.exF.g.instanceCount = nf; this.exF.m.visible = nf > 0; }
    if (N) { N.g.instanceCount = nn; N.m.visible = nn > 0; if (nn) { N.a.clearUpdateRanges(); N.b.clearUpdateRanges(); N.a.addUpdateRange(0, nn * 4); N.b.addUpdateRange(0, nn * 4); N.a.needsUpdate = true; N.b.needsUpdate = true; } }
    if (F) { F.g.instanceCount = nf; F.m.visible = nf > 0; if (nf) { F.a.clearUpdateRanges(); F.b.clearUpdateRanges(); F.a.addUpdateRange(0, nf * 4); F.b.addUpdateRange(0, nf * 4); F.a.needsUpdate = true; F.b.needsUpdate = true; } }
  }
}

// ── 形 ──
function treeGeos() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const bark = 0x5a4636, barkD = 0x3d2f26;
  const leafBlob = (r, pos, sc, bot, top, d = 1, c = null) => part(G.ico(r, d), { pos, scale: sc, bottom: bot, top, smooth: c || V(pos[0], pos[1] - r * 0.5, pos[2]), sway: 1, jitter: r * 0.07, topLight: 0.8 });
  // 樹皮：縦のすじ、根もとの陰、北側と根に苔
  const LB = lin(0x7a6450), LM = lin(0x4f7d3c);
  const barkFn = (mossH) => (p, n) => {
    const st = 0.8 + 0.2 * Math.sin(Math.atan2(p.z, p.x) * 9 + p.y * 0.7) * Math.sin(p.y * 1.9 + p.x);
    const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, p.y) / (mossH * 0.6));
    const moss = Math.min(1, Math.max(0, 1 - p.y / mossH) * (0.55 + 0.45 * Math.max(0, n.y * 1.5 - n.z * 0.6)) + Math.max(0, -n.z) * 0.18);
    return [(LB[0] * st * (1 - moss) + LM[0] * moss) * ao, (LB[1] * st * (1 - moss) + LM[1] * moss) * ao, (LB[2] * st * (1 - moss) + LM[2] * moss) * ao];
  };
  const tube = (pts, ra, sides, fn) => part(tubeGeo(pts.map((q) => V(q[0], q[1], q[2])), ra, ra, sides, V(0, 0, 1)), { color: fn, smooth: true });
  const core = (bl, bot, top) => part(G.ico(1, 1), { pos: bl.c, scale: [bl.r[0] * 0.66, bl.r[1] * 0.62, bl.r[2] * 0.66], bottom: bot, top, smooth: V(bl.c[0], bl.c[1] - bl.r[1] * 0.6, bl.c[2]), sway: 1 });
  // 1 広葉樹（草原・岸）：ゆるく曲がった幹が二またに分かれ、葉むらを 3 つのせる
  const broadBlobs = [
    { c: [0.1, 6.3, 0], r: [3.1, 2.2, 3.1], n: 24, bot: 0x4a9a3e, top: 0xb9e36e },
    { c: [1.9, 5.2, 0.6], r: [2.1, 1.5, 2.1], n: 13, bot: 0x448f3a, top: 0xa6d862 },
    { c: [-1.6, 5.5, -0.9], r: [2.1, 1.5, 2.1], n: 13, bot: 0x448f3a, top: 0xaedd66 },
  ];
  const bf = barkFn(1.6);
  const broadNear = merge([
    tube([[0, -0.3, 0], [0.04, 0.5, 0], [0.12, 2.0, 0.05], [0.05, 3.6, 0], [0.1, 5.4, 0]], [0.62, 0.4, 0.3, 0.25, 0.14], 7, bf),
    tube([[0.08, 3.3, 0], [0.9, 4.3, 0.3], [1.7, 4.9, 0.6]], [0.18, 0.13, 0.06], 4, bf),
    tube([[0.06, 3.6, 0], [-0.7, 4.6, -0.5], [-1.5, 5.2, -0.9]], [0.17, 0.12, 0.06], 4, bf),
  ]);
  // 遠景：近くの木と同じ色の葉むらの芯（3 つ）＋葉の板（extraFar）。近くと遠くの境目が見えないように
  // 遠景（安く：芯 1 つ＋大きな葉の板 3 枚＝ 34 三角形）。近くの木と同じ色と光
  const broadFar = merge([
    part(G.cyl(0.22, 0.4, 4.6, 4, 1, true), { pos: [0, 2.3, 0], bottom: 0x3a2e24, top: 0x5e4b3b }),
    part(G.ico(1, 0), { pos: [0.1, 5.9, 0], scale: [3.5, 2.4, 3.5], bottom: lin(0x4a9a3e).map((v) => v * 0.5), top: lin(0xb9e36e).map((v) => v * 0.72), smooth: V(0.1, 4.6, 0), sway: 1, topLight: 0.6 }),
  ]);
  // 2 森の巨木：根を張った太い幹、高い枝、傘のように広がる葉むら
  const giantBlobs = [
    { c: [0, 25.5, 0], r: [8.6, 3.5, 8.6], n: 30, bot: 0x2a7a55, top: 0x9be8a6 },
    { c: [5.6, 22.6, 1.8], r: [6.5, 2.6, 6.5], n: 20, bot: 0x26704e, top: 0x8ade9c },
    { c: [-4.8, 23.4, -3.2], r: [6.2, 2.5, 6.2], n: 20, bot: 0x26704e, top: 0x8fe0a0 },
    { c: [0.8, 29.2, -0.6], r: [5.0, 2.5, 5.0], n: 15, bot: 0x338a60, top: 0xa9f0b4 },
  ];
  const gf = barkFn(5.5);
  const gParts = [tube([[0, -0.6, 0], [0.05, 1.6, 0], [0.15, 4.5, 0.1], [0.3, 10, -0.1], [0.1, 16.5, 0.2], [-0.1, 23, 0]], [3.0, 1.95, 1.5, 1.3, 1.12, 0.85], 9, gf)];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.571 + 0.5, cx = Math.cos(a), sz = Math.sin(a);
    gParts.push(tube([[cx * 1.1, 2.6, sz * 1.1], [cx * 2.7, 0.6, sz * 2.7], [cx * 4.3, -0.5, sz * 4.3]], [0.7, 0.45, 0.12], 5, gf));
  }
  gParts.push(tube([[0.2, 17, 0.1], [2.8, 20, 0.9], [5.2, 21.6, 1.7]], [0.55, 0.38, 0.18], 5, gf));
  gParts.push(tube([[0, 18.5, 0], [-2.4, 21, -1.6], [-4.4, 22.4, -3.0]], [0.5, 0.36, 0.18], 5, gf));
  const giantNear = merge(gParts);
  const giantFar = merge([
    part(G.cyl(1.1, 1.9, 22, 3, 1, true), { pos: [0, 11, 0], bottom: 0x2c2420, top: 0x4a3a2e }),
    part(G.ico(7.4, 0), { pos: [0.6, 24.4, 0], scale: [1.4, 0.5, 1.4], bottom: 0x1a5540, top: 0x55b07c, smooth: V(0, 21, 0), sway: 1 }),
    part(G.octa(4.6), { pos: [0.4, 28.8, -0.4], scale: [1.2, 0.62, 1.2], bottom: 0x2a7355, top: 0x86dfa6, smooth: V(0, 26, 0), sway: 1 }),
  ]);
  // 3 針葉樹（峰）
  const tier = (r, y, h, seg, bot, top, open = true) => part(G.cone(r, h, seg, open), { pos: [0, y + h / 2, 0], bottom: bot, top, sway: 0.6, topLight: 0.4 });
  // 枝は地面近くから。段を深く重ね、下の段ほど広く垂れる（目の高さで傘に見えないように）
  // 芯の円すいは暗く細め。その外に針葉の枝の板（pineCards）を段ごとに垂らす
  const PT = [[2.35, 0.55, 2.7], [2.0, 1.95, 2.7], [1.62, 3.35, 2.6], [1.25, 4.7, 2.5], [0.88, 6.0, 2.3], [0.5, 7.2, 2.0]];
  const pineNear = merge([
    part(G.cyl(0.16, 0.3, 2.2, 5), { pos: [0, 1.1, 0], color: 0x4a3a30 }),
    ...PT.map(([r, y, h], i) => tier(r * 0.5, y + h * 0.15, h * 0.85, 6, 0x0f2725, 0x1b3c38, i > 0)),
  ]);
  const pineFar = merge([
    part(G.cone(2.0, 6.4, 5, false), { pos: [0, 3.5, 0], bottom: 0x1c4440, top: 0x356660, sway: 0.6 }),
    part(G.cone(1.1, 4.6, 4, true), { pos: [0, 6.9, 0], bottom: 0x24504c, top: 0x4e8278, sway: 0.6 }),
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
  return { broad: [broadNear, broadFar], giant: [giantNear, giantFar], pine: [pineNear, pineFar], shrub: [shrubNear, shrubFar], broadBlobs, giantBlobs, pineTiers: PT };
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
// 羊歯：弓なりの葉を放射状に（葉むらと同じ絵の右半分）
function fernGeo(rng) {
  const pos = [], nor = [], col = [], uv = [];
  const cb = new THREE.Color(0x2c6a38), ct = new THREE.Color(0x86cc6c), c = new THREE.Color();
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 6.283 + rng.range(-0.3, 0.3), dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const L = rng.range(0.8, 1.15), lift = rng.range(0.34, 0.5);
    const ring = [[0.02, 0.02, 0.05, 0], [0.5 * L, lift, 0.24, 0.5], [1.0 * L, lift * 0.35, 0.12, 1]];   // 距離, 高さ, 半幅, v
    for (let k = 0; k < 2; k++) {
      const p0 = ring[k], p1 = ring[k + 1];
      const q = [[p0, -1], [p0, 1], [p1, 1], [p0, -1], [p1, 1], [p1, -1]];
      for (const [pp, sd] of q) {
        pos.push(dx * pp[0] + sx * pp[2] * sd, pp[1], dz * pp[0] + sz * pp[2] * sd);
        nor.push(dx * 0.35, 0.9, dz * 0.35);
        c.copy(cb).lerp(ct, pp[3] * 0.8 + 0.1);
        col.push(c.r, c.g, c.b);
        uv.push(0.75 + sd * 0.25, pp[3]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}
// 倒木：苔むした幹、折れた枝、夜に光る棚きのこ
function logGeo() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const LB = lin(0x6e5a48), LMo = lin(0x4a8038), LW = lin(0xc9a877);
  const fn = (p, n) => {
    const moss = Math.min(1, Math.max(0, n.y * 2.2 - 1.0)) * (0.7 + 0.3 * Math.sin(p.x * 2.3));
    const st = 0.8 + 0.2 * Math.sin(p.x * 3.1 + p.z * 5);
    const ao = 0.55 + 0.45 * Math.min(1, Math.max(0, p.y + 0.15) / 0.5);
    return [(LB[0] * st * (1 - moss) + LMo[0] * moss) * ao, (LB[1] * st * (1 - moss) + LMo[1] * moss) * ao, (LB[2] * st * (1 - moss) + LMo[2] * moss) * ao];
  };
  const parts = [
    part(tubeGeo([V(-3.2, 0.42, 0), V(-1.2, 0.4, 0.1), V(1.0, 0.36, -0.05), V(3.1, 0.3, 0.1)], [0.52, 0.5, 0.44, 0.36], [0.52, 0.5, 0.44, 0.36], 8, V(0, 1, 0)), { color: fn, smooth: true }),
    part(G.disc(0.45, 8), { pos: [-3.21, 0.42, 0], rot: [0, 0, Math.PI / 2], color: LW }),
    part(tubeGeo([V(0.4, 0.6, 0), V(0.7, 1.1, 0.5), V(0.8, 1.5, 1.0)], [0.14, 0.1, 0.03], [0.14, 0.1, 0.03], 4, V(1, 0, 0)), { color: fn, smooth: true }),
  ];
  for (const [x, y, z, r] of [[-1.6, 0.5, 0.5, 0.2], [-1.2, 0.62, 0.48, 0.14], [1.6, 0.4, -0.42, 0.17]]) parts.push(part(G.cyl(r, r * 0.6, 0.05, 6), { pos: [x, y, z], color: 0xffd9a8, glow: 0.6 }));
  return merge(parts);
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
// 道灯：台石、細い柱、道の側へ曲がる腕木、吊るした小さな灯籠（笠・灯・底板）。腕は +x（置くときに道の方へ向ける）
const LAMP_ARM = 0.42, LAMP_Y = 1.7;
function lampGeo() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const lathe = (prof, seg = 6) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return merge([
    part(lathe([[0.001, 0], [0.17, 0], [0.17, 0.08], [0.11, 0.15], [0.001, 0.15]]), { color: 0x8a8476 }),
    part(lathe([[0.001, 0], [0.065, 0], [0.05, 1.72], [0.065, 1.76], [0.07, 1.84], [0.001, 1.86]], 6), { pos: [0, 0.12, 0], bottom: 0x5a5248, top: 0x7a7062 }),
    part(tubeGeo([V(0.02, 1.86, 0), V(0.16, 2.02, 0), V(0.32, 2.04, 0), V(LAMP_ARM, 1.95, 0)], [0.026, 0.022, 0.02, 0.016], [0.026, 0.022, 0.02, 0.016], 4, V(0, 0, 1)), { color: 0x3f3a33 }),
    part(G.cyl(0.006, 0.006, 0.1, 3), { pos: [LAMP_ARM, 1.9, 0], color: 0x3f3a33 }),
    part(lathe([[0.001, 0.13], [0.04, 0.11], [0.15, 0.03], [0.16, 0.0], [0.001, 0.0]], 4), { pos: [LAMP_ARM, LAMP_Y + 0.12, 0], rot: [0, Math.PI / 4, 0], color: 0x3a4456 }),
    part(G.box(0.15, 0.17, 0.15), { pos: [LAMP_ARM, LAMP_Y + 0.03, 0], color: 0xfff0c0, glow: 1 }),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([qx, qz]) => part(G.box(0.02, 0.19, 0.02), { pos: [LAMP_ARM + qx * 0.078, LAMP_Y + 0.03, qz * 0.078], color: 0x3f3a33 })),
    part(G.box(0.19, 0.025, 0.19), { pos: [LAMP_ARM, LAMP_Y - 0.065, 0], color: 0x3f3a33 }),
  ]);
}

function lampFarGeo() {
  return merge([
    part(G.cyl(0.05, 0.08, 1.95, 3, 1, true), { pos: [0, 0.98, 0], bottom: 0x5a5248, top: 0x7a7062 }),
    part(G.box(LAMP_ARM, 0.04, 0.04), { pos: [LAMP_ARM / 2, 1.97, 0], color: 0x3f3a33 }),
    part(G.box(0.16, 0.2, 0.16), { pos: [LAMP_ARM, LAMP_Y + 0.03, 0], color: 0xfff0c0, glow: 1 }),
    part(G.cone(0.17, 0.13, 4, true), { pos: [LAMP_ARM, LAMP_Y + 0.18, 0], rot: [0, Math.PI / 4, 0], color: 0x3a4456 }),
  ]);
}

export function createFlora(env) {
  const { hf, col } = env;
  const group = new THREE.Group();
  group.name = 'aw-flora';
  const rng = env.fork('flora');
  const mat = floraMaterial(0x7ff5e1), matLamp = floraMaterial(0xffc46a), matRock = floraMaterial(0x7ff5e1, true), matLeaf = floraMaterial(0x7ff5e1, false, true);
  // 針葉樹の枝の板：葉と同じシェーダーで、絵だけ針葉に替える
  const matNeedle = floraMaterial(0x7ff5e1, false, true);
  matNeedle.uniforms.uLeafTex = { value: needleTexture() };
  const tg = treeGeos(), rg = rockGeos();
  const S = {
    broad: new Scatter(tg.broad[0], tg.broad[1], mat, { nearDist: 78, farDist: 760, name: 'tree-broad', extra: { geo: leafCards(tg.broadBlobs, makeRng(31), 0.42), material: matLeaf }, extraFar: { geo: leafCards(tg.broadBlobs.map((b) => ({ ...b, n: 1, shell: false })), makeRng(43), 0.95), material: matLeaf } }),
    giant: new Scatter(tg.giant[0], tg.giant[1], mat, { nearDist: 88, farDist: 820, name: 'tree-giant', always: 40, extra: { geo: leafCards(tg.giantBlobs, makeRng(32), 0.36), material: matLeaf }, extraFar: { geo: leafCards(tg.giantBlobs.map((b, i) => ({ ...b, n: i ? 1 : 3, shell: false })), makeRng(42), 0.62), material: matLeaf } }),
    fern: new Scatter(fernGeo(makeRng(33)), null, matLeaf, { nearDist: 44, farDist: 44, name: 'fern', always: 6 }),
    log: new Scatter(logGeo(), null, mat, { nearDist: 80, farDist: 80, name: 'log' }),
    pine: new Scatter(tg.pine[0], tg.pine[1], mat, { nearDist: 100, farDist: 760, name: 'tree-pine', extra: { geo: pineCards(tg.pineTiers, 10, makeRng(44)), material: matNeedle }, extraFar: { geo: pineCards([[2.2, 0.8, 5.6]], 4, makeRng(45), true), material: matNeedle } }),
    shrub: new Scatter(tg.shrub[0], tg.shrub[1], mat, { nearDist: 70, farDist: 420, name: 'tree-shrub' }),
    boulder: new Scatter(rg.boulder[0], rg.boulder[1], matRock, { nearDist: 70, farDist: 520, name: 'rock-boulder' }),
    pillar: new Scatter(rg.pillar[0], rg.pillar[1], matRock, { nearDist: 130, farDist: 900, name: 'rock-pillar', always: 40 }),
    stack: new Scatter(rg.stack[0], rg.stack[1], matRock, { nearDist: 260, farDist: 900, name: 'rock-stack' }),
    mushroom: new Scatter(mushroomGeo(), null, mat, { nearDist: 75, farDist: 75, name: 'mushroom' }),
    lamp: new Scatter(lampGeo(), lampFarGeo(), matLamp, { nearDist: 45, farDist: 150, name: 'lamp' }),
  };
  const w = [0, 0, 0, 0];
  const nearLandmark = (x, z, pad) => {
    for (const l of LANDMARKS) { if (!l.r) continue; const d = Math.hypot(x - l.x, z - l.z); if (d < l.r + pad) return true; }
    return false;
  };
  const taken = [];
  const farFrom = (x, z, r) => { for (let i = 0; i < taken.length; i += 3) { const dx = taken[i] - x, dz = taken[i + 1] - z, rr = r + taken[i + 2]; if (dx * dx + dz * dz < rr * rr) return false; } return true; };
  const keepClear = [[LM.start.x, LM.start.z, 26], [0, 440, 0], [-420, 220, 5], [LM.elder_tree.x, LM.elder_tree.z, 44], [LM.great_arch.x, LM.great_arch.z, 24]];
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

  // ── 森の下草：羊歯と倒木 ──
  for (let i = 0; i < 26000 && S.fern.items.length < 5200 * 8; i++) {
    const x = rng.range(-720, -150), z = rng.range(-420, 520);
    hf.weightsAt(x, z, w);
    if (w[1] < 0.55) continue;
    const h = hf.heightAt(x, z);
    if (h < 3 || hf.pathDistAt(x, z) < 3 || hf.normalY(x, z) < 0.86 || nearLandmark(x, z, 1)) continue;
    if (hf.nm.n2(x / 17 + 3.1, z / 17 + 7.7) < 0.4) continue;                       // かたまって生える
    S.fern.add(x, h - 0.03, z, rng.range(0.7, 1.7), rng.range(0, 6.28), rng.range(-1, 1), 0);
  }
  for (let i = 0; i < 4000 && S.log.items.length < 150 * 8; i++) {
    const x = rng.range(-700, -180), z = rng.range(-400, 500);
    hf.weightsAt(x, z, w);
    if (w[1] < 0.7 || Math.hypot(x - LM.hollow.x, z - LM.hollow.z) < 50) continue;      // くぼ地はきのこの舞台。倒木で眺めをふさがない
    const h = hf.heightAt(x, z);
    if (h < 3 || hf.pathDistAt(x, z) < 6 || hf.normalY(x, z) < 0.95 || nearLandmark(x, z, 4) || !farFrom(x, z, 3.5) || !clearOf(x, z)) continue;
    const sc = rng.range(0.5, 1.0);
    S.log.add(x, h - 0.1 * sc, z, sc, rng.range(0, 6.28), rng.range(-0.6, 0.6), 0);
    col.addCollider({ x, z, r: 0.9 * sc, y0: h - 1, y1: h + sc, kind: 'tree' }); taken.push(x, z, 3.2 * sc);
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
      // 腕木を道の方へ向ける（インスタンスの回転：x' = x cos − z sin, z' = x sin + z cos）
      const dx = b[0] - x, dz = b[1] - z, yaw = Math.atan2(dz, dx);
      S.lamp.add(x, h - 0.05, z, 1, yaw, 0, 0);
      col.addCollider({ x, z, r: 0.16, y0: h, y1: h + 2.4, kind: 'structure' });
      lamps.push([x + Math.cos(yaw) * LAMP_ARM, h - 0.05 + LAMP_Y + 0.03, z + Math.sin(yaw) * LAMP_ARM]);
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
  // 1 本だけの葉むら（大樹など）。置き場所はインスタンス属性で渡す
  function leafMesh(blobs, x, y, z, yawDeg, glow = 0, size = 0.3) {
    const g = new THREE.InstancedBufferGeometry(), src = leafCards(blobs, makeRng(77), size);
    for (const k of ['position', 'normal', 'color', 'uv']) g.setAttribute(k, src.getAttribute(k));
    const a = yawDeg * Math.PI / 180;
    g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array([x, y, z, 1]), 4));
    g.setAttribute('aInst2', new THREE.InstancedBufferAttribute(new Float32Array([Math.cos(a), Math.sin(a), 0, 0]), 4));
    g.instanceCount = 1;
    const m = new THREE.Mesh(g, floraMaterial(0x7ff5e1, false, true, glow));
    m.frustumCulled = false; m.matrixAutoUpdate = false; m.name = 'leaf-single';
    group.add(m);
    return m;
  }
  return { group, update, setQuality, counts, lamps, scatters: S, mat, leafMesh };
}
