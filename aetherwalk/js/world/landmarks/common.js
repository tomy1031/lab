// js/world/landmarks/common.js — FABLE
// 建造物・しかけ用のマテリアル（頂点色＋頂点ライティング＋共通の霧。uv.x = 風のゆれ、uv.y = 発光の重み）と炎。
import * as THREE from 'three';
import { AW_PARS, AwMaterial, sharedUniforms, FOG_LIGHT_UNIFORMS } from '../art.js';
import { part, merge, G } from '../geo.js';

const VERT = /* glsl */`
${AW_PARS}
uniform vec4 uWind;
uniform vec3 uGlowCol;
uniform float uGlowAmt, uGlowNight, uFogMul, uRim, uSunRim;
varying vec3 vCol; varying vec4 vFog;
void main() {
  vec3 p = position;
  if (uv.x > 0.0) {
    float t = uWind.w;
    p.xz += vec2(sin(t * 1.9 + p.x * 0.21 + p.y * 0.3), cos(t * 1.6 + p.z * 0.23 + p.y * 0.25)) * (uv.x * (0.08 + 0.2 * uWind.z));
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 vd = normalize(cameraPosition - wp.xyz);
  vec3 c = awLight(n, color.rgb, vd, uRim);
  float back = max(dot(vd, -uSunDir), 0.0);
  c += color.rgb * uSunCol * (back * back * uv.x * 0.5);
  // 逆光の縁どり（夕日を背にした岩や塔の輪郭が光る）
  float fr = 1.0 - max(dot(n, vd), 0.0);
  c += color.rgb * uSunCol * (back * back * fr * fr * uSunRim);
  c += uGlowCol * (0.35 + 0.65 * color.rgb) * (uv.y * (uGlowAmt + uGlowNight * uFogP.z));
  vCol = c;
  vFog = awFog(wp.xyz);
  vFog.a *= uFogMul;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */`
uniform float uOpacity;
varying vec3 vCol; varying vec4 vFog;
void main() {
  gl_FragColor = vec4(mix(vCol, vFog.rgb, vFog.a), uOpacity);
  #include <colorspace_fragment>
}`;

// ── 石（画素ごとの光）：風化のむら、雨じみ、地衣類、上を向いた面とくぼみの苔、夜明けの濡れた照り ──
// 頂点色 = 石の地色（くぼみの陰を焼きこむ）、uv.y = 発光の重み（金の象嵌など。発光部には風化をのせない）
export const STONE_WET = { value: 0 };     // 0..1。夜明けと夜露で濡れる（landmarks/index.js が時刻から書く）
const STONE_VERT = /* glsl */`
${AW_PARS}
varying vec3 vCol; varying vec3 vWp; varying vec3 vN; varying vec4 vFog; varying float vGlow;
uniform float uFogMul;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vCol = color.rgb; vWp = wp.xyz; vGlow = uv.y;
  vN = normalize(mat3(modelMatrix) * normal);
  vFog = awFog(wp.xyz); vFog.a *= uFogMul;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const STONE_FRAG = /* glsl */`
${AW_PARS}
uniform sampler2D uNoiseTex;
uniform vec3 uGlowCol;
uniform float uGlowAmt, uGlowNight, uRim, uSunRim, uWet, uMoss, uOpacity, uSpec;
uniform vec2 uGrain;
varying vec3 vCol; varying vec3 vWp; varying vec3 vN; varying vec4 vFog; varying float vGlow;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 vd = normalize(cameraPosition - vWp);
  // 面の向きで投影面を選ぶ（テクスチャは 2 回だけ）
  vec2 pu = abs(n.y) > 0.6 ? vWp.xz : (abs(n.x) > abs(n.z) ? vWp.zy : vWp.xy);
  vec4 t1 = texture2D(uNoiseTex, pu * 0.83 * uGrain), t2 = texture2D(uNoiseTex, pu * 0.21 * uGrain + 0.37);
  vec3 alb = vCol;
  float plain = 1.0 - step(0.02, vGlow);
  float up = clamp(n.y, 0.0, 1.0), side = 1.0 - abs(n.y);
  float wea = t1.g * 0.55 + t2.r * 0.45;
  alb *= mix(1.0, 0.8 + 0.4 * wea, plain);
  alb *= 1.0 - side * smoothstep(0.5, 0.78, t2.b + t1.r * 0.25) * 0.2 * plain;                 // 雨じみ（縦の面）
  alb = mix(alb, vec3(0.5, 0.5, 0.3), smoothstep(0.7, 0.8, t1.a) * (0.35 + 0.4 * up) * 0.55 * plain);  // 地衣類
  // 苔：上を向いた面と、焼きこんだ陰（くぼみ・目地）に
  float dark = 1.0 - smoothstep(0.08, 0.3, dot(vCol, vec3(0.3, 0.55, 0.15)));
  float moss = clamp(smoothstep(0.6, 0.78, t2.g * 0.7 + t1.b * 0.3) * up * 0.7 + dark * 0.8, 0.0, 1.0) * uMoss * plain;
  alb = mix(alb, vec3(0.1, 0.17, 0.06) * (0.8 + 0.4 * t1.g), moss * 0.85);
  float wet = uWet * (1.0 - moss * 0.6);
  alb *= 1.0 - 0.15 * wet;
  float ao = mix(1.0, 0.75 + 0.25 * t1.g, plain);
  // 濡れた石は上を向いた平らな面だけが空を映す（角は光らせない）
  vec3 c = awShade(n, alb, vd, uRim, ao, 0.0, (uSpec + 0.3 * wet * up * up) * plain + 0.3 * (1.0 - plain), mix(14.0, 48.0, wet));
  float back = max(dot(vd, -uSunDir), 0.0), fr = 1.0 - max(dot(n, vd), 0.0);
  c += alb * uSunCol * (back * back * fr * fr * uSunRim);
  c += uGlowCol * (0.35 + 0.65 * vCol) * (vGlow * (uGlowAmt + uGlowNight * uFogP.z));
  c = mix(c, vFog.rgb, vFog.a);
  gl_FragColor = vec4(c, uOpacity);
  #include <colorspace_fragment>
}`;
// grain: 模様の縮尺 [横, 縦]（樹皮は [2.6, 0.3] で縦の繊維に）、spec: 乾いたときの照り
export function stoneMaterial({ glow = 0x7fe9ff, amt = 0, night = 0, fogMul = 1, rim = 0.2, sunRim = 0.35, moss = 1, grain = [1, 1], spec = 0.04 } = {}) {
  return new AwMaterial({
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uNoiseTex'], {
      uGlowCol: { value: new THREE.Color(glow) }, uGlowAmt: { value: amt }, uGlowNight: { value: night },
      uFogMul: { value: fogMul }, uRim: { value: rim }, uSunRim: { value: sunRim }, uWet: STONE_WET, uMoss: { value: moss }, uOpacity: { value: 1 },
      uSpec: { value: spec }, uGrain: { value: new THREE.Vector2(grain[0], grain[1]) },
    }),
    vertexShader: STONE_VERT, fragmentShader: STONE_FRAG, vertexColors: true, side: THREE.DoubleSide,
  });
}

// 面取りした扇形の敷石（上面・面取り・すそ）。y = 上面、bev = 面取りの幅と深さ
export function sectorStone(r0, r1, a0, a1, y, bev = 0.03, skirt = 0.04, m = 3, tilt = 0) {
  const P = [];
  const pt = (r, a, h) => [Math.sin(a) * r, h, -Math.cos(a) * r];
  const tri = (A, B, C) => P.push(...A, ...B, ...C);
  const quad = (A, B, C, D) => { tri(A, B, C); tri(A, C, D); };
  const ia0 = (r) => a0 + bev / Math.max(r, 0.2), ia1 = (r) => a1 - bev / Math.max(r, 0.2);
  const ri = r0 + (r0 > 0.05 ? bev : 0), ro = r1 - bev;
  const yt = (k) => y + tilt * Math.sin(k * 2.1 + r1);
  const top = [], bot = [], inT = [], inB = [];
  for (let k = 0; k <= m; k++) {
    const f = k / m;
    top.push(pt(ro, ia0(ro) + (ia1(ro) - ia0(ro)) * f, yt(k)));
    bot.push(pt(r1, a0 + (a1 - a0) * f, y - bev));
    inT.push(pt(ri, ia0(ri) + (ia1(ri) - ia0(ri)) * f, yt(k)));
    inB.push(pt(r0, a0 + (a1 - a0) * f, y - bev));
  }
  for (let k = 0; k < m; k++) {
    quad(inT[k], top[k], top[k + 1], inT[k + 1]);                        // 上面
    quad(top[k], bot[k], bot[k + 1], top[k + 1]);                        // 外の面取り
    const sk0 = [bot[k][0], y - bev - skirt, bot[k][2]], sk1 = [bot[k + 1][0], y - bev - skirt, bot[k + 1][2]];
    quad(bot[k], sk0, sk1, bot[k + 1]);                                 // すそ
    if (r0 > 0.05) quad(inB[k], inT[k], inT[k + 1], inB[k + 1]);         // 内の面取り
  }
  if (a1 - a0 < Math.PI * 1.99) {
    quad(inB[0], bot[0], top[0], inT[0]);
    quad(top[m], bot[m], inB[m], inT[m]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.computeVertexNormals();
  return g;
}
// 面取りした箱（石段・台石）
export function bevelBox(w, h, d, b = 0.04) {
  const sh = new THREE.Shape();
  const x = (w - 2 * b) / 2, z = (d - 2 * b) / 2;
  sh.moveTo(-x, -z); sh.lineTo(x, -z); sh.lineTo(x, z); sh.lineTo(-x, z); sh.lineTo(-x, -z);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, steps: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(h - 2 * b) / 2, 0);
  return g;
}

// glow: 発光色、amt: いつもの発光、night: 夜に足す発光
export function structMaterial({ glow = 0x7fe9ff, amt = 0, night = 0, fogMul = 1, rim = 0.15, sunRim = 0.35, side = THREE.FrontSide } = {}) {
  const m = new AwMaterial({
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uWind'], {
      uGlowCol: { value: new THREE.Color(glow) }, uGlowAmt: { value: amt }, uGlowNight: { value: night },
      uFogMul: { value: fogMul }, uRim: { value: rim }, uSunRim: { value: sunRim }, uOpacity: { value: 1 },
    }),
    vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, side,
  });
  return m;
}

// 炎（加算の円すい。頂点シェーダーでゆらめく）
let flameGeo = null, flameMat = null;
export function makeFlame(scale = 1) {
  if (!flameGeo) {
    flameGeo = merge([
      part(G.cone(0.34, 1.0, 7, true), { pos: [0, 0.5, 0], bottom: 0xff6a2b, top: 0xffd27a }),
      part(G.cone(0.2, 0.62, 5, true), { pos: [0, 0.34, 0], bottom: 0xffb347, top: 0xfff3c8 }),
    ]);
    flameMat = new AwMaterial({
      uniforms: sharedUniforms(FOG_LIGHT_UNIFORMS),
      vertexShader: /* glsl */`
        ${AW_PARS}
        varying vec3 vC;
        void main() {
          vec4 o = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 p = position;
          float t = uTime * 7.0 + o.x * 3.1 + o.z * 1.7;
          float k = p.y * p.y;
          p.x += (sin(t + p.y * 5.0) * 0.12 + sin(t * 1.7 + 1.3) * 0.06) * k;
          p.z += (cos(t * 1.3 + p.y * 4.0) * 0.12) * k;
          p.y *= 1.0 + 0.16 * sin(t * 1.9) + 0.1 * sin(t * 3.3 + 0.7);
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vC = color.rgb * (1.25 - 0.55 * position.y) * (1.0 - awFog(wp.xyz).a * 0.7);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC;
        void main() { gl_FragColor = vec4(vC, 1.0);
          #include <colorspace_fragment>
        }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }
  const m = new THREE.Mesh(flameGeo, flameMat);
  m.scale.setScalar(scale);
  m.renderOrder = 22;
  m.visible = false;
  return m;
}

// 高さで地層の色をつける（峡谷の岩）
const STRATA = [0x8f3a34, 0xc8553a, 0xe07a45, 0xf0b070, 0xc8553a, 0xa8443a].map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; });
export function strataColor(baseY) {
  return (p, n) => {
    const hh = (p.y + baseY + Math.sin(p.x * 0.3 + p.z * 0.2) * 0.8) / 2.7;
    const c = STRATA[((Math.floor(hh) % 6) + 6) % 6];
    const k = (0.82 + 0.18 * Math.min(1, (hh - Math.floor(hh)) * 8)) * (0.8 + 0.2 * Math.max(0, n.y));
    return [c[0] * k, c[1] * k, c[2] * k];
  };
}
export const yawRot = (yawDeg) => -yawDeg * Math.PI / 180;
// ローカル（x 右、-z 前）→ ワールド
export function toWorld(def, lx, ly, lz, out = new THREE.Vector3()) {
  const a = (def.yaw || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return out.set(def.x + lx * c - lz * s, def.y + ly, def.z + lx * s + lz * c);
}
