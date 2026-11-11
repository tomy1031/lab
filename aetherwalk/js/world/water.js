// js/world/water.js — FABLE
// 水（海・湖・鏡川を 1 メッシュ）と氷鏡。空の関数をフレネルで映し、太陽のきらめき、岸の泡、浅瀬の色を出す。
import * as THREE from 'three';
import { AW_PARS, AwMaterial, sharedUniforms } from './art.js';
import { SKY_PARS, SKY_UNIFORMS } from './sky.js';
import { LAKE_C, LAKE_LEVEL, LM, ICE_LEVEL } from './layout.js';

const VERT = /* glsl */`
attribute float aKind;
varying vec3 vWp; varying float vKind;
void main() {
  vWp = (modelMatrix * vec4(position, 1.0)).xyz; vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWp, 1.0);
}`;
const FRAG = /* glsl */`
${AW_PARS}
${SKY_PARS}
uniform sampler2D uNoiseTex, uHeightTex;
uniform vec3 uShSea, uDpSea, uShLake, uDpLake;
varying vec3 vWp; varying float vKind;
// 映りこむ岸・森・峰：中心から見た地平の輪郭（方位ごとに 近い層・遠い層の 距離と高さ、色）を
// 映る点の位置で視差を補正して使う。本物の反射は描かない（予算 §7.4）。
uniform vec4 uHzG[HZN];   // 近い層 r, 高さ, 遠い層 r, 高さ
uniform vec4 uHzC[HZN];   // 色（近・遠。sqrt をかけた 8bit×3 を 1 つの float に詰めたもの）
uniform vec3 uHzO;        // 中心 x, 水面 y, 中心 z
vec3 awUnpack(float v) { vec3 c = vec3(floor(v / 65536.0), mod(floor(v / 256.0), 256.0), mod(v, 256.0)) / 255.0; return c * c; }
vec4 awHorizon(vec3 R, vec3 wp, float jit) {
  float hl = length(R.xz);
  if (hl < 1e-4) return vec4(0.0);
  vec2 hd = R.xz / hl;
  float f = fract(atan(hd.x, -hd.y) / 6.2831853 + 1.0) * float(HZN);
  int i0 = int(floor(f)); int i1 = i0 + 1; if (i1 >= HZN) i1 = 0;
  float t = fract(f);
  vec4 g = mix(uHzG[i0], uHzG[i1], t);
  float pr = dot(wp.xz - uHzO.xz, hd);
  float tanR = R.y / hl + jit;
  float dn = max(g.x - pr, 12.0), df = max(g.z - pr, 40.0);
  float eN = (g.y - uHzO.y) / dn, eF = (g.w - uHzO.y) / df;
  float cN = smoothstep(eN + 0.005, eN - 0.003, tanR);
  float cF = smoothstep(eF + 0.006, eF - 0.004, tanR);
  vec4 c0 = uHzC[i0], c1 = uHzC[i1];
  vec3 colN = mix(awUnpack(c0.x), awUnpack(c1.x), t), colF = mix(awUnpack(c0.y), awUnpack(c1.y), t);
  // 映る面は少し影がち（向こう岸の斜面はこちらを向く）
  vec3 light = uSkyCol * 1.0 + uGndCol * 0.2 + uSunCol * (0.55 * max(uSunDir.y, 0.0) + 0.15);
  vec3 fogc = awFogColorDir(normalize(vec3(hd.x, 0.04, hd.y)));
  vec3 tN = mix(colN * light, fogc, 1.0 - exp(-dn * dn * uFogP.x));
  vec3 tF = mix(colF * light, fogc, 1.0 - exp(-df * df * uFogP.x));
  return vec4(mix(tF, tN, cN), max(cN, cF));
}
void main() {
  vec3 v = cameraPosition - vWp;
  float dist = length(v);
  vec3 V = v / dist;
  #ifdef AW_ICE
    vec4 nz = texture2D(uNoiseTex, vWp.xz * 0.045);
    vec3 N = normalize(vec3((nz.b - 0.5) * 0.05, 1.0, (nz.a - 0.5) * 0.05));
    vec3 R = reflect(-V, N); R.y = abs(R.y);
    float fres = 0.3 + 0.7 * pow(1.0 - max(V.y, 0.0), 3.0);
    vec3 lightc = uSkyCol * 0.9 + uSunCol * (0.55 * max(uSunDir.y, 0.0));
    float crack = smoothstep(0.03, 0.0, abs(nz.g - 0.5)) * 0.35 + smoothstep(0.02, 0.0, abs(nz.r - 0.52)) * 0.3;
    vec3 body = mix(vec3(0.33, 0.76, 0.9), vec3(0.85, 0.95, 1.0), crack + nz.b * 0.25) * lightc;
    vec4 hz = awHorizon(R, vWp, (nz.r - 0.5) * 0.012);
    vec3 refl = mix(awSkyRefl(R) * 1.05, hz.rgb, hz.a);
    vec3 c = mix(body, refl, fres);
    float sp = max(dot(R, uGlowDir), 0.0);
    c += uSunDiscCol * pow(sp, 90.0) * 0.8 * uSkyP.w * (1.0 - hz.a);
  #else
    float t = uTime;
    vec4 nz = texture2D(uNoiseTex, vWp.xz * 0.071 + vec2(t * 0.014, t * 0.01) * (1.0 + step(1.5, vKind) * 3.0));
    vec2 sw = vec2(sin(vWp.x * 0.11 + vWp.z * 0.05 + t * 0.9), sin(vWp.z * 0.13 - vWp.x * 0.04 + t * 0.7));
    float calm = 1.0 / (1.0 + dist * 0.006);
    vec2 rip = ((nz.ba - 0.5) * 0.3 + sw * 0.03) * (0.4 + 0.6 * calm);
    vec3 N = normalize(vec3(rip.x, 1.0, rip.y));
    float hgt = texture2D(uHeightTex, (vWp.xz + 801.0) / 1602.0).r;
    float depth = max(vWp.y - hgt, 0.0);
    vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02;
    float fres = 0.08 + 0.92 * pow(1.0 - max(dot(V, N), 0.0), 4.0);
    float lake = step(0.5, vKind);
    vec3 lightc = uSkyCol * 0.85 + uSunCol * (0.6 * max(uSunDir.y, 0.0));
    vec3 body = mix(mix(uShSea, uShLake, lake), mix(uDpSea, uDpLake, lake), 1.0 - exp(-depth * mix(0.3, 0.55, lake))) * lightc;
    R = normalize(R);
    vec3 refl = awSkyRefl(R);
    float hzA = 0.0;
    if (lake > 0.5 && vKind < 1.5) {
      vec4 hz = awHorizon(R, vWp, (nz.r - 0.5) * 0.02 + rip.x * 0.04);
      refl = mix(refl, hz.rgb, hz.a); hzA = hz.a;
    }
    vec3 c = mix(body, refl, fres);
    float sp = max(dot(R, uGlowDir), 0.0) * (1.0 - hzA);
    float sp2 = sp * sp; float sp8 = sp2 * sp2; sp8 *= sp8; float sp64 = sp8 * sp8; sp64 *= sp64; sp64 *= sp64;
    float spark = smoothstep(0.52, 0.7, nz.g + (nz.b - 0.5) * 0.6);
    c += uSunDiscCol * ((sp64 * sp64 * 2.2 + sp64 * 0.5) * (0.35 + 1.4 * spark) + sp8 * sp8 * 0.12) * uSkyP.w;
    float foam = smoothstep(0.42, 0.0, depth + (nz.g - 0.5) * 0.3 + sin(t * 0.9 + vWp.x * 0.3 + vWp.z * 0.2) * 0.06);
    c = mix(c, vec3(0.95, 0.98, 1.0) * lightc, foam * 0.75);
  #endif
  vec4 fg = awFog(vWp);
  c = mix(c, fg.rgb, fg.a);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

// 地平の輪郭（中心 (cx, cz)、水面 y0 から見て）。方位 HZN 本、近い層 [r0, r1)・遠い層 [r1, r2]
const HZN = 48;
function horizonProfile(hf, biomes, cx, cz, y0, r0, r1, r2) {
  const G = [], C = [], w = [0, 0, 0, 0], out = [0, 0, 0, 0];
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const FOREST = lin(0x2a6249), PINE = lin(0x2c524f), SNOWPINE = lin(0x8fa3b4);
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const canopy = (x, z, h) => {
    hf.weightsAt(x, z, w);
    if (Math.hypot(x - LAKE_C.x, z - LAKE_C.z) < 200) return [0, null];
    const f = w[1] * 17 * (hf.coastDAt(x, z) < 60 ? 0.5 : 1), p = w[3] * 6 * sm(84, 66, h);
    return f > p ? [f, FOREST] : [p, h > 52 ? SNOWPINE : PINE];
  };
  const pack = (c) => { const q = (v) => Math.round(Math.sqrt(Math.min(1, Math.max(0, v))) * 255); return q(c[0]) * 65536 + q(c[1]) * 256 + q(c[2]); };
  for (let i = 0; i < HZN; i++) {
    const az = (i / HZN) * Math.PI * 2, dx = Math.sin(az), dz = -Math.cos(az);
    const best = [[-1e9, r1, y0 - 4, 0, 0, null], [-1e9, r2, y0 - 4, 0, 0, null]];
    for (let r = r0; r <= r2; r += r < r1 ? 3 : 7) {
      const x = cx + dx * r, z = cz + dz * r;
      if (Math.abs(x) > 795 || Math.abs(z) > 795) break;
      const h = hf.heightAt(x, z);
      const [can, col] = canopy(x, z, h);
      const t = (h + can - y0) / r, b = best[r < r1 ? 0 : 1];
      if (t > b[0]) { b[0] = t; b[1] = r; b[2] = h + can; b[3] = x; b[4] = z; b[5] = can > 3 ? col : null; }
    }
    // 色：輪郭の点と、その手前 15 m・30 m の斜面の平均（見えている面の色。峰の雪を拾う）
    const cols = best.map((b) => {
      if (b[5]) return b[5];
      if (b[0] < -1e8) return [0.1, 0.12, 0.14];
      const acc = [0, 0, 0];
      for (const back of [0, 15, 30]) {
        biomes.colorAt(b[3] - dx * back, b[4] - dz * back, out, true);
        acc[0] += out[0] / 3; acc[1] += out[1] / 3; acc[2] += out[2] / 3;
      }
      return acc;
    });
    G.push(new THREE.Vector4(best[0][1], best[0][2], best[1][1], best[1][2]));
    C.push(new THREE.Vector4(pack(cols[0]), pack(cols[1]), 0, 0));
  }
  return { uHzG: { value: G }, uHzC: { value: C }, uHzO: { value: new THREE.Vector3(cx, y0, cz) } };
}

export function createWater(ctx, hf, biomes) {
  const group = new THREE.Group();
  group.name = 'aw-water';
  const pos = [], kind = [], idx = [];
  const ring = (cx, cz, y, r0, r1, seg, k) => {
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      pos.push(cx + s * r0, y, cz + c * r0, cx + s * r1, y, cz + c * r1); kind.push(k, k);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  };
  ring(0, 0, 0, 500, 620, 72, 0);
  ring(0, 0, 0, 620, 760, 72, 0);
  ring(0, 0, 0, 760, 1100, 72, 0);
  ring(0, 0, 0, 1100, 3400, 64, 0);
  ring(LAKE_C.x, LAKE_C.z, LAKE_LEVEL, 0.01, 60, 40, 1);
  ring(LAKE_C.x, LAKE_C.z, LAKE_LEVEL, 60, 120, 40, 1);
  ring(LAKE_C.x, LAKE_C.z, LAKE_LEVEL, 120, 165, 40, 1);
  ring(LAKE_C.x, LAKE_C.z, LAKE_LEVEL, 165, 205, 40, 1);
  // 川のリボン
  {
    const S = hf.riverS, B = hf.riverBed, base = pos.length / 3;
    let n = 0;
    for (let i = 0; i < S.length; i++) {
      if (B[i] < -0.45) break;
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const y = B[i] + 0.42;
      pos.push(S[i][0] - tz * 11, y, S[i][1] + tx * 11, S[i][0] + tz * 11, y, S[i][1] - tx * 11); kind.push(2, 2);
      n++;
    }
    for (let i = 0; i < n - 1; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(kind), 1));
  g.setIndex(idx);
  const colors = {
    uShSea: { value: new THREE.Color(0x46d3c4) }, uDpSea: { value: new THREE.Color(0x1766a8) },
    uShLake: { value: new THREE.Color(0x4fc2c9) }, uDpLake: { value: new THREE.Color(0x1c4f8a) },
  };
  const lakeHz = horizonProfile(hf, biomes, LAKE_C.x, LAKE_C.z, LAKE_LEVEL, 150, 330, 1000);
  const iceHz = horizonProfile(hf, biomes, LM.ice_mirror.x, LM.ice_mirror.z, ICE_LEVEL + 0.04, 30, 130, 1000);
  const mat = new AwMaterial({
    uniforms: sharedUniforms([...SKY_UNIFORMS, 'uNoiseTex', 'uHeightTex'], Object.assign({}, colors, lakeHz)),
    defines: { HZN }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 5;
  group.add(mesh);

  // 氷鏡
  const ice = new THREE.Mesh(new THREE.RingGeometry(0.01, 34.5, 36, 5).rotateX(-Math.PI / 2), new AwMaterial({
    uniforms: sharedUniforms([...SKY_UNIFORMS, 'uNoiseTex', 'uHeightTex'], Object.assign({}, colors, iceHz)),
    defines: { AW_ICE: 1, HZN }, vertexShader: VERT.replace('attribute float aKind;', '').replace('vKind = aKind;', 'vKind = 0.0;'), fragmentShader: FRAG,
  }));
  ice.position.set(LM.ice_mirror.x, ICE_LEVEL + 0.04, LM.ice_mirror.z);
  ice.updateMatrix(); ice.matrixAutoUpdate = false;
  group.add(ice);
  return { group, mesh, ice };
}
