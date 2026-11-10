// js/world/grass.js — FABLE
// 草と花。インスタンスをカメラのまわりにシェーダー内で巻き戻して置く（CPU の更新なし）。
// 高さは高さテクスチャ、色と密度は地面の色テクスチャから頂点シェーダーで読む。
import * as THREE from 'three';
import { U, AW_PARS, AwMaterial, sharedUniforms, FOG_LIGHT_UNIFORMS } from './art.js';

const COMMON = /* glsl */`
${AW_PARS}
uniform sampler2D uHeightTex, uColorTex, uNoiseTex, uPathTex;
uniform vec4 uWind, uCloud;
attribute vec4 aOff;     // xy: タイル内の位置 z, w: 乱数
attribute vec2 aTile;    // x: タイルの大きさ y: 太さの倍率
varying vec3 vCol; varying vec4 vFog;
vec2 awWrap(out float dist, out float fade) {
  float S = aTile.x;
  vec2 w = mod(aOff.xy - cameraPosition.xz + S * 0.5, S) - S * 0.5 + cameraPosition.xz;
  dist = length(w - cameraPosition.xz);
  fade = smoothstep(S * 0.5, S * 0.34, dist);
  return w;
}
vec2 awBend(vec2 w, float r) {
  float t = uWind.w;
  float ph = dot(w, uWind.xy) * 0.09 + sin(dot(w, vec2(-uWind.y, uWind.x)) * 0.05) * 1.5;
  float gust = sin(ph - t * 1.1) * 0.5 + 0.5; gust *= gust;
  vec2 fl = vec2(sin(t * 3.1 + r * 37.0 + w.x), cos(t * 2.7 + r * 23.0 + w.y)) * 0.05;
  return uWind.xy * (0.1 + gust * (0.25 + 0.5 * uWind.z)) + fl;
}
`;

export function createGrass(env) {
  const group = new THREE.Group();
  group.name = 'aw-grass';
  const rng = env.fork('grass');
  const isQ3 = env.ctx.flags && env.ctx.flags.device === 'quest3';

  // ── 草 ──
  const tiers = [[16, 3600, 1.0], [32, 2500, 1.6], [60, 1400, 2.6]];
  const total = Math.round(tiers.reduce((s, t) => s + t[1], 0) * (isQ3 ? 1.3 : 1));
  const bg = new THREE.InstancedBufferGeometry();
  //   4
  //  2 3
  //  0 1
  bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.36, 0.5, 0, 0.36, 0.5, 0, 0, 1, 0]), 3));
  bg.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4]);
  const off = new Float32Array(total * 4), tile = new Float32Array(total * 2);
  // 段ごとにまぜて並べる（品質を落とすとき、先頭から数を切っても全段が均等に減る）
  let n = 0;
  const counts = tiers.map((t) => Math.round(t[1] * (isQ3 ? 1.3 : 1)));
  const left = counts.slice();
  while (n < total) {
    for (let k = 0; k < tiers.length && n < total; k++) {
      const share = Math.max(1, Math.round(counts[k] / counts[2]));
      for (let q = 0; q < share && left[k] > 0 && n < total; q++) {
        const S = tiers[k][0];
        off[n * 4] = rng.next() * S; off[n * 4 + 1] = rng.next() * S; off[n * 4 + 2] = rng.next(); off[n * 4 + 3] = rng.next();
        tile[n * 2] = S; tile[n * 2 + 1] = tiers[k][2];
        left[k]--; n++;
      }
    }
    if (left.every((v) => v <= 0)) break;
  }
  bg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  bg.setAttribute('aTile', new THREE.InstancedBufferAttribute(tile, 2));
  bg.instanceCount = n;
  const grassMat = new AwMaterial({
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uHeightTex', 'uColorTex', 'uNoiseTex', 'uPathTex', 'uWind', 'uCloud']),
    vertexShader: /* glsl */`
      ${COMMON}
      void main() {
        float dist, fade;
        vec2 w = awWrap(dist, fade);
        float hgt = texture2D(uHeightTex, (w + 801.0) / 1602.0).r;
        vec4 gc = texture2D(uColorTex, (w + 800.0) / 1600.0);
        float pd = texture2D(uPathTex, (w + 801.0) / 1602.0).r * 16.0;
        float keep = step(aOff.z, gc.a * 1.05 - 0.04) * smoothstep(2.0, 3.6, pd + aOff.w * 0.8);
        float hs = (0.2 + 0.3 * aOff.w) * (0.55 + 0.6 * gc.a) * (0.9 + 0.1 * aTile.y) * keep * fade;
        float wd = 0.06 * aTile.y * (0.7 + 0.6 * aOff.z);
        float ang = aOff.w * 31.4;
        // 見る向きにやや正対させる（細い線にならないように）
        vec2 tc = normalize(cameraPosition.xz - w + vec2(1e-3));
        vec2 side = normalize(vec2(-tc.y, tc.x) + vec2(cos(ang), sin(ang)) * 0.7);
        vec2 bend = awBend(w, aOff.w);
        float y = position.y;
        vec3 p;
        p.xz = w + side * (position.x * wd) + bend * (y * y * hs * 1.1);
        p.y = hgt - 0.04 + y * hs * (1.0 - 0.25 * dot(bend, bend) * y);
        vec3 root = gc.rgb * 0.9;
        float gness = clamp((gc.g - gc.r) * 6.0, 0.0, 1.0);
        vec3 tip = mix(gc.rgb * 1.3 + 0.015, gc.rgb * vec3(2.0, 1.5, 1.25) + vec3(0.02, 0.02, 0.0), gness);
        vec3 alb = mix(root, tip, y * (0.7 + 0.3 * aOff.z));
        vec3 vd = normalize(cameraPosition - p);
        vec3 nn = normalize(vec3(-bend.x * 0.6, 1.0, -bend.y * 0.6));
        vec3 c = awLight(nn, alb, vd, 0.0);
        // 逆光で透ける
        float back = max(dot(vd, -uSunDir), 0.0);
        c += alb * uSunCol * (back * back * y * 0.55);
        float cl = texture2D(uNoiseTex, w * uCloud.x + uCloud.yz).r;
        c *= 1.0 - smoothstep(0.45, 0.57, cl) * uCloud.w;
        vCol = c;
        vFog = awFog(p);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying vec4 vFog;
      void main() {
        gl_FragColor = vec4(mix(vCol, vFog.rgb, vFog.a), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
  const grass = new THREE.Mesh(bg, grassMat);
  grass.frustumCulled = false; grass.matrixAutoUpdate = false;
  group.add(grass);

  // ── 花（茎 2 + 花びら 4 三角形）──
  const NF = Math.round(1250 * (isQ3 ? 1.3 : 1));
  const fg = new THREE.InstancedBufferGeometry();
  // 0-2: 茎、3-7: 花（中心 3、まわり 4-7）
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.06, 0, 0, 0.06, 0, 0, 0, 1, 0,
    0, 1, 0, -1, 1, -1, 1, 1, -1, 1, 1, 1, -1, 1, 1,
  ]), 3));
  fg.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 2, 1, 1, 1, 1]), 1));
  fg.setIndex([0, 1, 2, 3, 5, 4, 3, 6, 5, 3, 7, 6, 3, 4, 7]);
  const fo = new Float32Array(NF * 4), ft = new Float32Array(NF * 2);
  for (let i = 0; i < NF; i++) {
    const S = i % 3 === 0 ? 60 : 30;
    fo[i * 4] = rng.next() * S; fo[i * 4 + 1] = rng.next() * S; fo[i * 4 + 2] = rng.next(); fo[i * 4 + 3] = rng.next();
    ft[i * 2] = S; ft[i * 2 + 1] = S === 60 ? 1.8 : 1.0;
  }
  fg.setAttribute('aOff', new THREE.InstancedBufferAttribute(fo, 4));
  fg.setAttribute('aTile', new THREE.InstancedBufferAttribute(ft, 2));
  fg.instanceCount = NF;
  const C = (h) => new THREE.Color(h);
  const flowerMat = new AwMaterial({
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uHeightTex', 'uColorTex', 'uNoiseTex', 'uWind', 'uCloud'], {
      uRegionTex: { value: env.regionTex || null },
      uPalM: { value: [C(0xffffff), C(0xffd84d), C(0xff8fb3), C(0x9ad0ff)] },
      uPalF: { value: [C(0x62e6ff), C(0xff9be0), C(0x7ff5e1), C(0xc9f7ff)] },
      uPalC: { value: [C(0xffb347), C(0xfff0c0), C(0xff8f6a), C(0xd9b85a)] },
      uPalP: { value: [C(0xcfe6ff), C(0xffffff), C(0x9fb8ff), C(0xd8c8ff)] },
    }),
    vertexShader: /* glsl */`
      ${COMMON}
      uniform sampler2D uRegionTex;
      uniform vec3 uPalM[4], uPalF[4], uPalC[4], uPalP[4];
      attribute float aPart;
      void main() {
        float dist, fade;
        vec2 w = awWrap(dist, fade);
        float hgt = texture2D(uHeightTex, (w + 801.0) / 1602.0).r;
        vec4 gc = texture2D(uColorTex, (w + 800.0) / 1600.0);
        vec4 rg = texture2D(uRegionTex, (w + 800.0) / 1600.0);
        float ptc = texture2D(uNoiseTex, w * 0.011).r;
        float pm = smoothstep(0.42, 0.62, ptc + (rg.g - 0.3) * 0.25 - rg.b * 0.2);
        float keep = step(aOff.z, gc.a * pm * 1.3) * step(0.25, gc.a);
        float hs = (0.2 + 0.22 * aOff.w) * (0.7 + 0.3 * aTile.y) * keep * fade;
        float sz = (0.03 + 0.03 * aOff.z) * (0.6 + 0.4 * aTile.y) * keep * fade;
        vec2 bend = awBend(w, aOff.w) * 0.6;
        int idx = int(mod(aOff.w * 97.0, 4.0));
        vec3 pal = uPalM[idx] * rg.r + uPalF[idx] * rg.g + uPalC[idx] * rg.b + uPalP[idx] * rg.a;
        pal /= max(rg.r + rg.g + rg.b + rg.a, 0.01);
        vec3 p; vec3 alb;
        vec2 tc = normalize(cameraPosition.xz - w + vec2(1e-3));
        if (aPart < 0.5) {
          p.xz = w + vec2(-tc.y, tc.x) * position.x * 0.5 * aTile.y + bend * (position.y * position.y * hs);
          p.y = hgt - 0.03 + position.y * hs;
          alb = gc.rgb * 1.1;
        } else {
          // 花は上向きの小さな皿。見る側へ少し傾ける
          vec3 top = vec3(w.x + bend.x * hs, hgt - 0.03 + hs, w.y + bend.y * hs);
          float a = aOff.z * 6.28; float ca = cos(a), sa = sin(a);
          vec2 q = vec2(position.x * ca - position.z * sa, position.x * sa + position.z * ca) * (aPart > 1.5 ? 0.0 : 1.0);
          p = top + vec3(q.x, 0.0, q.y) * sz;
          p.y += dot(q, tc) * sz * 0.55 + (aPart > 1.5 ? -sz * 0.35 : 0.0);
          alb = aPart > 1.5 ? mix(pal, vec3(1.0, 0.8, 0.25), 0.7) : pal;
        }
        vec3 c = awLight(vec3(0.0, 1.0, 0.0), alb, vec3(0.0, 1.0, 0.0), 0.0);
        if (aPart > 0.5) c += pal * (0.1 + 0.55 * rg.g * uFogP.z);      // 森の花は夜に光る
        float cl = texture2D(uNoiseTex, w * uCloud.x + uCloud.yz).r;
        c *= 1.0 - smoothstep(0.45, 0.57, cl) * uCloud.w * 0.8;
        vCol = c;
        vFog = awFog(p);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying vec4 vFog;
      void main() {
        gl_FragColor = vec4(mix(vCol, vFog.rgb, vFog.a), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
  const flowers = new THREE.Mesh(fg, flowerMat);
  flowers.frustumCulled = false; flowers.matrixAutoUpdate = false;
  group.add(flowers);

  const full = n;
  function setQuality(level) {
    bg.instanceCount = Math.round(full * (level === 0 ? 1 : level === 1 ? 0.6 : 0.3));
    flowers.visible = level < 2;
  }
  return { group, update() {}, setQuality, grass, flowers };
}
