// js/world/landmarks/common.js — FABLE
// 建造物・しかけ用のマテリアル（頂点色＋頂点ライティング＋共通の霧。uv.x = 風のゆれ、uv.y = 発光の重み）と炎。
import * as THREE from 'three';
import { AW_PARS, AwMaterial, sharedUniforms, FOG_LIGHT_UNIFORMS } from '../art.js';
import { part, merge, G } from '../geo.js';

const VERT = /* glsl */`
${AW_PARS}
uniform vec4 uWind;
uniform vec3 uGlowCol;
uniform float uGlowAmt, uGlowNight, uFogMul, uRim;
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

// glow: 発光色、amt: いつもの発光、night: 夜に足す発光
export function structMaterial({ glow = 0x7fe9ff, amt = 0, night = 0, fogMul = 1, rim = 0.15, side = THREE.FrontSide } = {}) {
  const m = new AwMaterial({
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uWind'], {
      uGlowCol: { value: new THREE.Color(glow) }, uGlowAmt: { value: amt }, uGlowNight: { value: night },
      uFogMul: { value: fogMul }, uRim: { value: rim }, uOpacity: { value: 1 },
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
