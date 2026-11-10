// js/world/art.js — FABLE
// 見た目をそろえる道具：共有 uniform、共通の GLSL（光・霧）、art.material / basic / glow / blobShadow / canvasTexture。
import * as THREE from 'three';

// ── すべての世界のマテリアルが共有する uniform（値は world.update が毎フレーム書く）──
export const U = {
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, -0.5).normalize() },   // 影つけの光（昼は太陽、夜は月）
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uSkyCol: { value: new THREE.Color(0.5, 0.6, 0.8) },
  uGndCol: { value: new THREE.Color(0.3, 0.3, 0.2) },
  uFogCol: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uFogSunCol: { value: new THREE.Color(1, 0.9, 0.8) },
  uGlowDir: { value: new THREE.Vector3(0.3, 0.8, -0.5).normalize() },  // 空でいちばん明るい天体の向き
  uFogP: { value: new THREE.Vector4(1 / (520 * 520), 1 / 90, 0, 0) },  // x: 濃さ(1/D²) y: 高さの減衰 z: 夜 w: 予備
  uTime: { value: 0 },
  uVH: { value: 900 },                                                 // 描画バッファの高さ（px）。点の大きさ用
  uWind: { value: new THREE.Vector4(0.8, 0.6, 0.5, 0) },               // xy: 向き z: 強さ w: 位相
  uNoiseTex: { value: null },                                          // R 雲 G 粒 B/A さざ波
  uHeightTex: { value: null },                                         // 高さ（m、half float、801²）
  uColorTex: { value: null },
  uPathTex: { value: null },                                           // 道からの距離（R8、0..1 = 0..16 m）                                          // 地面の色（rgb）＋草の密度（a）
  uCloud: { value: new THREE.Vector4(1 / 420, 0, 0, 0.3) },            // 雲の影：scale, offset, 強さ
  // 空
  uZenith: { value: new THREE.Color(0.1, 0.3, 0.8) },
  uHorizon: { value: new THREE.Color(0.7, 0.85, 0.95) },
  uBand: { value: new THREE.Vector4(0.8, 0.3, 0.5, 0) },
  uSunDiscCol: { value: new THREE.Color(1, 0.95, 0.8) },
  uSkyP: { value: new THREE.Vector4(0, 0, 0, 1) },                     // x: 月か y: 夜 z: オーロラ w: にじみの強さ
  uRingN: { value: new THREE.Vector3(0.25, 0.82, 0.5).normalize() },
  uRingU: { value: new THREE.Vector3(1, 0, 0) },
  uRingCol: { value: new THREE.Color(1, 1, 1) },
};

// ── 共通 GLSL：霧と光（頂点・フラグメントのどちらでも使える）──
export const AW_PARS = /* glsl */`
uniform vec3 uSunDir, uSunCol, uSkyCol, uGndCol, uFogCol, uFogSunCol, uGlowDir;
uniform vec4 uFogP;
uniform float uTime;
vec3 awFogColorDir(vec3 dir) {
  float g = max(dot(dir, uGlowDir), 0.0);
  float g3 = g * g * g;
  return mix(uFogCol, uFogSunCol, g3 * (0.3 + 0.7 * g3));
}
vec4 awFog(vec3 wp) {
  vec3 v = wp - cameraPosition;
  float d = length(v);
  vec3 dir = v / max(d, 1e-3);
  float y0 = max(cameraPosition.y, -2.0) * uFogP.y, y1 = max(wp.y, -2.0) * uFogP.y;
  float dy = y1 - y0;
  float hf = exp(-y0) * (abs(dy) < 0.02 ? 1.0 - dy * 0.5 : (1.0 - exp(-dy)) / dy);
  float a = 1.0 - exp(-d * d * uFogP.x * min(hf, 1.5));
  return vec4(awFogColorDir(dir), a);
}
vec3 awLight(vec3 n, vec3 albedo, vec3 viewDir, float rim) {
  float ndl = max((dot(n, uSunDir) + 0.22) / 1.22, 0.0);
  vec3 hemi = mix(uGndCol, uSkyCol, n.y * 0.5 + 0.5);
  float f = 1.0 - max(dot(n, viewDir), 0.0);
  vec3 l = hemi + uSunCol * ndl + uSkyCol * (rim * f * f * f * (0.5 + 0.5 * n.y));
  return albedo * l;
}
`;

const LIT_VERT = /* glsl */`
${AW_PARS}
uniform vec3 uColor;
uniform float uRim, uFogMul;
varying vec3 vCol;
varying vec4 vFog;
#ifdef AW_FLAT
varying vec3 vWp;
#endif
#ifdef AW_MAP
varying vec2 vUv;
#endif
void main() {
  vec4 lp = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * lp;
  vec3 alb = uColor;
  #ifdef USE_COLOR
    alb *= color.rgb;
  #endif
  #ifdef USE_INSTANCING_COLOR
    alb *= instanceColor.rgb;
  #endif
  #ifdef AW_FLAT
    vCol = alb; vWp = wp.xyz;
  #else
    n = normalize(mat3(modelMatrix) * n);
    vCol = awLight(n, alb, normalize(cameraPosition - wp.xyz), uRim);
  #endif
  #ifdef AW_MAP
    vUv = uv;
  #endif
  vFog = awFog(wp.xyz);
  vFog.a *= uFogMul;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const LIT_FRAG = /* glsl */`
${AW_PARS}
uniform vec3 uEmissive;
uniform float uRim, uOpacity;
varying vec3 vCol;
varying vec4 vFog;
#ifdef AW_FLAT
varying vec3 vWp;
#endif
#ifdef AW_MAP
uniform sampler2D uMap;
varying vec2 vUv;
#endif
void main() {
  vec3 c = vCol;
  #ifdef AW_MAP
    vec4 tx = texture2D(uMap, vUv);
    c *= tx.rgb;
  #endif
  #ifdef AW_FLAT
    vec3 vd = cameraPosition - vWp;
    vec3 n = normalize(cross(dFdx(vWp), dFdy(vWp)));
    if (dot(n, vd) < 0.0) n = -n;
    c = awLight(n, c, normalize(vd), uRim);
  #endif
  c += uEmissive;
  c = mix(c, vFog.rgb, vFog.a);
  gl_FragColor = vec4(c, uOpacity);
  #include <colorspace_fragment>
}`;

// 共有 uniform を参照のまま持つマテリアル（clone しても時刻の光に従う）
export class AwMaterial extends THREE.ShaderMaterial {
  constructor(params) {
    super(params);
    this._relink();
  }
  _relink() {
    for (const k in this.uniforms) if (U[k]) this.uniforms[k] = U[k];
    const u = this.uniforms;
    if (u.uColor && !Object.getOwnPropertyDescriptor(this, 'color')) {
      Object.defineProperty(this, 'color', { get: () => this.uniforms.uColor.value, set: (v) => { this.uniforms.uColor.value.copy(v); }, enumerable: false, configurable: true });
    }
    if (u.uEmissive && !Object.getOwnPropertyDescriptor(this, 'emissive')) {
      Object.defineProperty(this, 'emissive', { get: () => this.uniforms.uEmissive.value, set: (v) => { this.uniforms.uEmissive.value.copy(v); }, enumerable: false, configurable: true });
    }
  }
  onBeforeRender() {
    const u = this.uniforms.uOpacity;
    if (u) u.value = this.opacity;
  }
  copy(source) {
    super.copy(source);
    this._relink();
    return this;
  }
}
export function sharedUniforms(names, extra = {}) {
  const o = {};
  for (const n of names) o[n] = U[n];
  return Object.assign(o, extra);
}
export const FOG_LIGHT_UNIFORMS = ['uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uFogCol', 'uFogSunCol', 'uGlowDir', 'uFogP', 'uTime'];

export function createArt() {
  const palette = {
    gold: 0xffd76a, cyan: 0x7fe9ff, white: 0xfffbe8, danger: 0xff3b5c, ash: 0x6b6770, core: 0xc23bff,
    fireA: 0xffb347, fireB: 0xff6a2b, uiBg: 0x1b2440, uiInk: 0xf4ecd8,
  };
  const cache = new Map();
  const hex = (c) => (c && c.isColor ? c.getHex() : (c | 0));

  function material({ color = 0xffffff, vertexColors = false, flat = true, emissive = 0x000000, rim = 0.25, map = null, side = THREE.FrontSide, fogMul = 1 } = {}) {
    const key = `m|${hex(color)}|${vertexColors}|${flat}|${hex(emissive)}|${rim}|${map ? map.uuid : 0}|${side}|${fogMul}`;
    let m = cache.get(key);
    if (m) return m;
    const defines = {};
    if (flat) defines.AW_FLAT = 1;
    if (map) defines.AW_MAP = 1;
    m = new AwMaterial({
      uniforms: sharedUniforms(FOG_LIGHT_UNIFORMS, {
        uColor: { value: new THREE.Color(color) }, uEmissive: { value: new THREE.Color(emissive) },
        uRim: { value: rim }, uOpacity: { value: 1 }, uFogMul: { value: fogMul }, uMap: { value: map },
      }),
      defines, vertexShader: LIT_VERT, fragmentShader: LIT_FRAG, vertexColors, side,
    });
    cache.set(key, m);
    return m;
  }

  // MeshBasicMaterial に共通の霧を入れる
  function patchBasic(m, additive, useFog) {
    m.onBeforeCompile = (shader) => {
      for (const n of ['uFogCol', 'uFogSunCol', 'uGlowDir', 'uFogP', 'uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uTime']) shader.uniforms[n] = U[n];
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${AW_PARS}\nvarying vec4 vAwFog;`)
        .replace('#include <fog_vertex>', `
          vec4 awWp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            awWp = instanceMatrix * awWp;
          #endif
          awWp = modelMatrix * awWp;
          vAwFog = awFog(awWp.xyz);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vAwFog;')
        .replace('#include <colorspace_fragment>', (useFog
          ? (additive ? 'gl_FragColor.rgb *= (1.0 - vAwFog.a);' : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vAwFog.rgb, vAwFog.a);')
          : '') + '\n#include <colorspace_fragment>');
    };
    m.customProgramCacheKey = () => `awbasic${additive ? 1 : 0}${useFog ? 1 : 0}`;
    const baseClone = m.clone.bind(m);
    m.clone = () => patchBasic(baseClone(), additive, useFog);
    return m;
  }
  function basic({ color = 0xffffff, map = null, transparent = false, additive = false, fog = true, depthWrite, side = THREE.FrontSide, vertexColors = false, opacity = 1 } = {}) {
    if (depthWrite === undefined) depthWrite = !transparent && !additive;
    const key = `b|${hex(color)}|${map ? map.uuid : 0}|${transparent}|${additive}|${fog}|${depthWrite}|${side}|${vertexColors}|${opacity}`;
    let m = cache.get(key);
    if (m) return m;
    m = new THREE.MeshBasicMaterial({
      color, map, transparent: transparent || additive, depthWrite, side, vertexColors, opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
    });
    patchBasic(m, additive, fog);
    cache.set(key, m);
    return m;
  }

  // 加算のにじみ板（いつもカメラを向く）
  const glowGeo = new THREE.PlaneGeometry(2, 2);
  const GLOW_VERT = /* glsl */`
    ${AW_PARS}
    varying vec2 vP; varying float vF;
    void main() {
      vP = position.xy;
      vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float s = length(modelMatrix[0].xyz);
      vec4 mv = viewMatrix * vec4(c, 1.0);
      mv.xy += position.xy * s;
      vF = 1.0 - awFog(c).a * 0.85;
      gl_Position = projectionMatrix * mv;
    }`;
  const GLOW_FRAG = /* glsl */`
    uniform vec3 uColor; uniform float uOpacity;
    varying vec2 vP; varying float vF;
    void main() {
      float r = length(vP);
      float a = max(1.0 - r, 0.0);
      a = a * a * (0.6 + 0.9 * a * a);
      gl_FragColor = vec4(uColor * (a * uOpacity * vF), 1.0);
      #include <colorspace_fragment>
    }`;
  function glow({ color = 0xffd76a, size = 0.3, opacity = 1 } = {}) {
    const m = new AwMaterial({
      uniforms: sharedUniforms(['uFogCol', 'uFogSunCol', 'uGlowDir', 'uFogP', 'uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uTime'], { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } }),
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    m.opacity = opacity;
    const mesh = new THREE.Mesh(glowGeo, m);
    mesh.scale.setScalar(size);
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    return mesh;
  }

  // 丸い影
  const blobGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
  const blobMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vP; void main(){ float r = length(vP); float a = (1.0 - r * r); gl_FragColor = vec4(0.02, 0.03, 0.08, 0.42 * a * a); }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  function blobShadow(radius = 0.4) {
    const mesh = new THREE.Mesh(blobGeo, blobMat);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 2;
    return mesh;
  }

  function canvasTexture(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c2 = cv.getContext('2d');
    if (draw) draw(c2);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  }

  return { palette, material, basic, glow, blobShadow, canvasTexture, uniforms: U, glsl: AW_PARS };
}
