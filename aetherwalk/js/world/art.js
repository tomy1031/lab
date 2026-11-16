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
  // 太陽の方角は光が散って早く霞む（空気遠近）
  float g = max(dot(dir, uGlowDir), 0.0);
  a = min(1.0, a + g * g * g * g * (1.0 - exp(-d * 0.0035)) * 0.22 * min(hf, 1.0) * (1.0 - uFogP.z));
  return vec4(awFogColorDir(dir), a);
}
// 光のモデル：巻きこみ拡散＋半球の環境光＋頂点 AO＋逆光の透け＋安い鏡面（Blinn）と空の照り返し＋縁の光
vec3 awShade(vec3 n, vec3 albedo, vec3 vd, float rim, float ao, float trans, float spec, float gloss) {
  float nl = dot(n, uSunDir);
  float ndl = clamp((nl + 0.3) / 1.3, 0.0, 1.0);
  ndl *= ndl * (1.6 - 0.6 * ndl);
  vec3 hemi = mix(uGndCol, uSkyCol, n.y * 0.5 + 0.5) * (0.35 + 0.65 * ao);
  float f = 1.0 - max(dot(n, vd), 0.0);
  float f2 = f * f;
  vec3 l = hemi + uSunCol * (ndl * (0.55 + 0.45 * ao)) + uSkyCol * (rim * f2 * f * (0.5 + 0.5 * n.y));
  vec3 c = albedo * l;
  if (trans > 0.0) {
    float back = max(dot(vd, -uSunDir), 0.0);
    float t = (back * back * back * 0.9 + max(-nl, 0.0) * 0.35) * trans * (0.4 + 0.6 * ao);
    c += albedo * vec3(1.15, 1.1, 0.55) * uSunCol * t;
  }
  if (spec > 0.0) {
    vec3 h = normalize(uSunDir + vd);
    float s = pow(max(dot(n, h), 0.0), gloss) * (gloss + 8.0) * 0.04;
    c += (uSunCol * s * step(0.0, nl) + uSkyCol * (f2 * f2 * 0.6)) * (spec * ao);
  }
  return c;
}
vec3 awLight(vec3 n, vec3 albedo, vec3 viewDir, float rim) {
  return awShade(n, albedo, viewDir, rim, 1.0, 0.0, 0.0, 16.0);
}
`;

// 仕上げ：フィルム調のトーンカーブ（明部をやわらかく丸める）＋わずかな S 字＋彩度。AwMaterial が colorspace の直前に自動で入れる
export const AW_GRADE = /* glsl */`
vec3 awGrade(vec3 c) {
  c *= 1.1;
  vec3 x = max(c - 0.5, 0.0);
  c = min(c, 0.5) + x / (1.0 + x * 1.35);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(vec3(l), c, 1.07);
  return max(c, 0.0);
}
`;

const LIT_VERT = /* glsl */`
${AW_PARS}
uniform vec3 uColor;
uniform float uFogMul;
varying vec4 vCol;      // rgb: 色 a: AO（頂点色の 4 成分目。なければ 1）
varying vec4 vFog;
varying vec3 vWp;
varying vec3 vN;
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
  vec4 alb = vec4(uColor, 1.0);
  #ifdef USE_COLOR_ALPHA
    alb *= color;
  #elif defined(USE_COLOR)
    alb.rgb *= color.rgb;
  #endif
  #ifdef USE_INSTANCING_COLOR
    alb.rgb *= instanceColor.rgb;
  #endif
  vCol = alb; vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
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
uniform float uRim, uOpacity, uSpec, uGloss, uTrans;
varying vec4 vCol;
varying vec4 vFog;
varying vec3 vWp;
varying vec3 vN;
#ifdef AW_MAP
uniform sampler2D uMap;
varying vec2 vUv;
#endif
void main() {
  vec3 c = vCol.rgb;
  #ifdef AW_MAP
    vec4 tx = texture2D(uMap, vUv);
    c *= tx.rgb;
  #endif
  vec3 vd = cameraPosition - vWp;
  #ifdef AW_FLAT
    vec3 n = normalize(cross(dFdx(vWp), dFdy(vWp)));
    if (dot(n, vd) < 0.0) n = -n;
  #else
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
  #endif
  c = awShade(n, c, normalize(vd), uRim, vCol.a, uTrans, uSpec, uGloss);
  c += uEmissive;
  c = mix(c, vFog.rgb, vFog.a);
  gl_FragColor = vec4(c, uOpacity);
  #include <colorspace_fragment>
}`;

// 共有 uniform を参照のまま持つマテリアル（clone しても時刻の光に従う）
export class AwMaterial extends THREE.ShaderMaterial {
  constructor(params) {
    // 仕上げ（awGrade）を colorspace の直前に入れる。加算など重ねる描画には入れない
    if (params && params.fragmentShader && !params.noGrade && (params.blending === undefined || params.blending === THREE.NormalBlending) && !params.fragmentShader.includes('awGrade(')) {
      params = Object.assign({}, params, { fragmentShader: AW_GRADE + params.fragmentShader.replace('#include <colorspace_fragment>', 'gl_FragColor.rgb = awGrade(gl_FragColor.rgb);\n#include <colorspace_fragment>') });
    }
    if (params && 'noGrade' in params) { params = Object.assign({}, params); delete params.noGrade; }
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

  // flat: 面で陰影（既定はなめらか）  spec/gloss: 鏡面の強さ 0..1 と鋭さ  translucency: 逆光で透ける量 0..1
  // 頂点色が 4 成分（RGBA）なら a を AO（1 = 明るい）として使う
  function material({ color = 0xffffff, vertexColors = false, flat = false, emissive = 0x000000, rim = 0.25, map = null, side = THREE.FrontSide, fogMul = 1,
    spec = 0, gloss = 24, translucency = 0 } = {}) {
    const key = `m|${hex(color)}|${vertexColors}|${flat}|${hex(emissive)}|${rim}|${map ? map.uuid : 0}|${side}|${fogMul}|${spec}|${gloss}|${translucency}`;
    let m = cache.get(key);
    if (m) return m;
    const defines = {};
    if (flat) defines.AW_FLAT = 1;
    if (map) defines.AW_MAP = 1;
    m = new AwMaterial({
      uniforms: sharedUniforms(FOG_LIGHT_UNIFORMS, {
        uColor: { value: new THREE.Color(color) }, uEmissive: { value: new THREE.Color(emissive) },
        uRim: { value: rim }, uOpacity: { value: 1 }, uFogMul: { value: fogMul }, uMap: { value: map },
        uSpec: { value: spec }, uGloss: { value: gloss }, uTrans: { value: translucency },
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
        .replace('#include <common>', '#include <common>\nvarying vec4 vAwFog;' + (additive ? '' : AW_GRADE))
        .replace('#include <colorspace_fragment>', (useFog
          ? (additive ? 'gl_FragColor.rgb *= (1.0 - vAwFog.a);' : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vAwFog.rgb, vAwFog.a);')
          : '') + (additive ? '' : '\ngl_FragColor.rgb = awGrade(gl_FragColor.rgb);') + '\n#include <colorspace_fragment>');
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
      // 板をカメラの方へ寄せる（地面や壁に切られない）。見かけの大きさは保つ
      float dist = length(mv.xyz);
      float sc = (dist - min(s * 0.85, dist * 0.6)) / max(dist, 1e-3);
      mv.xyz *= sc;
      mv.xy += position.xy * s * sc;
      vF = (1.0 - awFog(c).a * 0.85) * smoothstep(s * 0.45, s * 1.4, dist);   // にじみの中に入ったら消す
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

  return { palette, material, basic, glow, blobShadow, canvasTexture, uniforms: U, glsl: AW_PARS, grade: AW_GRADE };
}
