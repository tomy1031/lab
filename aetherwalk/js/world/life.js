// js/world/life.js — FABLE
// 景色の生きもの：鳥の群れ（インスタンス 30 羽、頂点シェーダーで羽ばたく）と蝶。
import * as THREE from 'three';
import { AW_PARS, AwMaterial, sharedUniforms, FOG_LIGHT_UNIFORMS } from './art.js';

export function createLife(env) {
  const group = new THREE.Group();
  group.name = 'aw-life';
  const rng = env.fork('life');

  // ── 鳥 ──
  const NB = 30;
  const bg = new THREE.InstancedBufferGeometry();
  // 体（細い三角）と左右の翼
  bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, -0.5, 0.1, 0, 0.25, -0.1, 0, 0.25,
    0, 0, -0.25, 0, 0, 0.2, 1, 0, 0.05,
    0, 0, -0.25, -1, 0, 0.05, 0, 0, 0.2,
  ]), 3));
  bg.setAttribute('aTip', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 0, 1, 0]), 1));
  const a1 = new Float32Array(NB * 4), a2 = new Float32Array(NB * 4);
  const flocks = [[560, 46, 520, 12], [0, 80, -40, 9], [-540, 34, 440, 9]];
  let n = 0;
  for (const [cx, cy, cz, cnt] of flocks) for (let i = 0; i < cnt; i++) {
    a1[n * 4] = cx + rng.range(-20, 20); a1[n * 4 + 1] = cy + rng.range(-8, 14); a1[n * 4 + 2] = cz + rng.range(-20, 20); a1[n * 4 + 3] = rng.range(40, 120);
    a2[n * 4] = rng.range(0, 6.28); a2[n * 4 + 1] = rng.range(0.05, 0.11) * (rng.next() < 0.5 ? 1 : -1); a2[n * 4 + 2] = rng.range(0, 6.28); a2[n * 4 + 3] = rng.range(0.7, 1.2);
    n++;
  }
  bg.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(a1, 4));
  bg.setAttribute('aBird', new THREE.InstancedBufferAttribute(a2, 4));
  bg.instanceCount = NB;
  const birdMat = new AwMaterial({
    uniforms: sharedUniforms(FOG_LIGHT_UNIFORMS),
    vertexShader: /* glsl */`
      ${AW_PARS}
      attribute vec4 aOrbit, aBird; attribute float aTip;
      varying vec3 vCol; varying vec4 vFog;
      void main() {
        float ang = aBird.x + uTime * aBird.y;
        float rad = aOrbit.w * (1.0 + 0.25 * sin(ang * 2.3 + aBird.z));
        vec3 c = aOrbit.xyz + vec3(cos(ang) * rad, sin(ang * 1.7 + aBird.z) * 6.0, sin(ang) * rad * 0.8);
        vec2 fw = normalize(vec2(-sin(ang), cos(ang) * 0.8)) * sign(aBird.y);
        float flap = sin(uTime * (5.0 + aBird.w * 2.0) + aBird.z);
        float glide = smoothstep(-0.2, 0.6, sin(uTime * 0.31 + aBird.z * 3.0));
        vec3 p = position * (0.9 * aBird.w);
        p.y += aTip * (flap * (1.0 - 0.75 * glide) * 0.55 + 0.12);
        vec3 wp = c + vec3(-fw.y * p.x + fw.x * -p.z, p.y, fw.x * p.x + fw.y * -p.z);
        vec3 alb = mix(vec3(0.92, 0.94, 0.96), vec3(0.3, 0.33, 0.4), aTip);
        vCol = alb * (uSkyCol * 0.9 + uSunCol * 0.7);
        vFog = awFog(wp);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying vec4 vFog;
      void main() { gl_FragColor = vec4(mix(vCol, vFog.rgb, vFog.a * 0.85), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
  const birds = new THREE.Mesh(bg, birdMat);
  birds.frustumCulled = false; birds.matrixAutoUpdate = false;
  group.add(birds);

  // ── 蝶（カメラのまわりで巻き戻す）──
  const NF = 26;
  const fg = new THREE.InstancedBufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.5, 0, 0, 0.5, 1, 0, 0.6, 0, 0, -0.5, 1, 0, 0.6, 0.9, 0, -0.7, 0, 0, -0.5, -1, 0, 0.6, 0, 0, 0.5, 0, 0, -0.5, -0.9, 0, -0.7, -1, 0, 0.6]), 3));
  const fs = new Float32Array(NF * 4);
  for (let i = 0; i < NF * 4; i++) fs[i] = rng.next();
  fg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(fs, 4));
  fg.instanceCount = NF;
  const flyU = { uAmt: { value: 0 } };
  const flyMat = new AwMaterial({
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uHeightTex'], flyU),
    vertexShader: /* glsl */`
      ${AW_PARS}
      uniform sampler2D uHeightTex; uniform float uAmt;
      attribute vec4 aSeed;
      varying vec3 vCol; varying vec4 vFog;
      void main() {
        float S = 44.0;
        float t = uTime * (0.25 + 0.2 * aSeed.w);
        vec2 q = aSeed.xy * S + vec2(sin(t + aSeed.z * 6.28) + 0.5 * sin(t * 2.3 + aSeed.w * 9.0), cos(t * 0.8 + aSeed.w * 6.28) + 0.5 * cos(t * 1.9)) * 3.5;
        vec2 w = mod(q - cameraPosition.xz + S * 0.5, S) - S * 0.5 + cameraPosition.xz;
        float dist = length(w - cameraPosition.xz);
        float hgt = texture2D(uHeightTex, (w + 801.0) / 1602.0).r;
        float y = hgt + 0.5 + aSeed.z * 1.3 + 0.3 * sin(t * 3.1 + aSeed.x * 20.0);
        float flap = sin(uTime * (14.0 + aSeed.w * 6.0) + aSeed.x * 30.0) * 0.9;
        float sc = 0.09 * (0.7 + 0.6 * aSeed.z) * uAmt * smoothstep(S * 0.5, S * 0.36, dist) * step(0.5, hgt);
        vec3 p = position;
        float ax = abs(p.x);
        p.y = ax * sin(flap + 0.3); p.x = sign(p.x) * ax * cos(flap + 0.3);
        float ha = aSeed.z * 6.28 + sin(t) * 1.5; float c = cos(ha), s = sin(ha);
        vec3 wp = vec3(w.x, y, w.y) + vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c) * sc;
        vec3 alb = aSeed.w < 0.33 ? vec3(1.0, 0.98, 0.9) : aSeed.w < 0.66 ? vec3(1.0, 0.8, 0.25) : vec3(0.45, 0.75, 1.0);
        vCol = alb * (uSkyCol * 0.9 + uSunCol * 0.6);
        vFog = awFog(wp);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: birdMat.fragmentShader, side: THREE.DoubleSide,
  });
  const flies = new THREE.Mesh(fg, flyMat);
  flies.frustumCulled = false; flies.matrixAutoUpdate = false;
  group.add(flies);

  let quality = 0, amt = 0;
  function update(view) {
    const day = 1 - view.st.night;
    birds.visible = quality < 2 && day > 0.25;
    const want = quality < 2 && day > 0.5 ? (view.airW.meadow + view.airW.lake * 0.7 + view.airW.coast * 0.6 + view.airW.forest * 0.3) : 0;
    amt += (want - amt) * Math.min(1, (view.dt || 0.016) * 1.5 + (view.jump ? 1 : 0));
    flyU.uAmt.value = amt;
    flies.visible = amt > 0.02;
  }
  return { group, update, setQuality(l) { quality = l; } };
}
