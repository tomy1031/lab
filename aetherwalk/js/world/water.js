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
    vec3 c = mix(body, awSky(R) * 1.05, fres);
    float sp = max(dot(R, uGlowDir), 0.0);
    c += uSunDiscCol * pow(sp, 90.0) * 0.8 * uSkyP.w;
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
    vec3 c = mix(body, awSky(normalize(R)), fres);
    float sp = max(dot(normalize(R), uGlowDir), 0.0);
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

export function createWater(ctx, hf) {
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
  const mat = new AwMaterial({
    uniforms: sharedUniforms([...SKY_UNIFORMS, 'uNoiseTex', 'uHeightTex'], colors),
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 5;
  group.add(mesh);

  // 氷鏡
  const ice = new THREE.Mesh(new THREE.RingGeometry(0.01, 34.5, 36, 5).rotateX(-Math.PI / 2), new AwMaterial({
    uniforms: sharedUniforms([...SKY_UNIFORMS, 'uNoiseTex', 'uHeightTex'], colors),
    defines: { AW_ICE: 1 }, vertexShader: VERT.replace('attribute float aKind;', '').replace('vKind = aKind;', 'vKind = 0.0;'), fragmentShader: FRAG,
  }));
  ice.position.set(LM.ice_mirror.x, ICE_LEVEL + 0.04, LM.ice_mirror.z);
  ice.updateMatrix(); ice.matrixAutoUpdate = false;
  group.add(ice);
  return { group, mesh, ice };
}
