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
  const tiers = [[14, 3700, 1.0], [30, 2500, 1.7], [58, 1300, 2.8]];
  const total = Math.round(tiers.reduce((s, t) => s + t[1], 0) * (isQ3 ? 1.3 : 1));
  const bg = new THREE.InstancedBufferGeometry();
  // 1 株 = 細い葉 3 枚（1 枚 = 三角 1 つ）。z に葉の番号を入れ、シェーダーで扇に開く
  bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, -0.5, 0, 1, 0.5, 0, 1, 0, 1, 1, -0.5, 0, 2, 0.5, 0, 2, 0, 1, 2]), 3));
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
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uHeightTex', 'uColorTex', 'uNoiseTex', 'uPathTex', 'uWind', 'uCloud'], { uRegionTex: { value: env.regionTex || null } }),
    vertexShader: /* glsl */`
      ${COMMON}
      uniform sampler2D uRegionTex;
      void main() {
        float dist, fade;
        vec2 w = awWrap(dist, fade);
        float hgt = texture2D(uHeightTex, (w + 801.0) / 1602.0).r;
        vec4 gc = texture2D(uColorTex, (w + 800.0) / 1600.0);
        float pd = texture2D(uPathTex, (w + 801.0) / 1602.0).r * 16.0;
        float keep = step(aOff.z, gc.a * 1.05 - 0.04) * smoothstep(2.0, 3.6, pd + aOff.w * 0.8);
        vec4 nzv = texture2D(uNoiseTex, w * uCloud.x + uCloud.yz);
        vec4 nzd = texture2D(uNoiseTex, w * 0.131);
        vec4 rg = texture2D(uRegionTex, (w + 800.0) / 1600.0);
        float bid = position.z;
        float patchv = nzd.g * 0.6 + nzv.b * 0.4;                                  // 株ごとの丈と色のむら
        float hs = (0.26 + 0.36 * aOff.w) * (0.55 + 0.6 * gc.a) * (0.75 + 0.5 * patchv) * (1.0 - 0.24 * bid) * (0.9 + 0.12 * aTile.y) * keep * fade;
        float wd = 0.044 * aTile.y * (0.75 + 0.5 * aOff.z);
        float ang = aOff.w * 31.4 + bid * 2.2;
        vec2 fan = vec2(cos(ang), sin(ang));
        // 幅は見る向きに正対させる（線にならない）。葉先は扇に開き、風でしなる
        vec2 tc = normalize(cameraPosition.xz - w + vec2(1e-3));
        vec2 side = vec2(-tc.y, tc.x);
        vec2 bend = awBend(w, aOff.w + bid * 0.37);
        float y = position.y;
        vec3 p;
        p.xz = w + fan * (0.045 * aTile.y * min(bid, 1.0)) + side * (position.x * wd) + (bend * 1.25 + fan * (0.2 + 0.25 * aOff.z)) * (y * hs);
        p.y = hgt - 0.03 + y * hs * (1.0 - 0.2 * dot(bend, bend));
        // 色：根もとは地面の色に沈み、葉先は明るく黄みがかる。株ごとに乾いた色・深い色へ振る
        float gness = clamp((gc.g - gc.r) * 6.0, 0.0, 1.0);
        vec3 base = gc.rgb * mix(vec3(1.0), mix(vec3(0.82, 0.96, 0.86), vec3(1.14, 1.08, 0.8), patchv), 0.5 * gness);
        vec3 tip = mix(base * 1.35 + 0.015, base * vec3(1.55, 1.42, 0.95) + vec3(0.015, 0.025, 0.0), gness);
        vec3 alb = mix(base * 0.72, tip, y);
        vec3 vd = normalize(cameraPosition - p);
        vec3 nn = normalize(vec3(-bend.x * 0.5, 1.0, -bend.y * 0.5));
        vec3 c = awShade(nn, alb, vd, 0.0, 0.55 + 0.45 * y, y * 0.9, 0.0, 16.0);
        c *= 1.0 - smoothstep(0.42, 0.6, nzv.r) * uCloud.w;
        // 森の木漏れ日（地面と同じ模様）
        c *= mix(1.0, mix(0.6, 1.42, smoothstep(0.42, 0.6, nzd.a * 0.6 + nzd.b * 0.4)), rg.g * uCloud.w * 2.2);
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
  // 0-2: 茎、3: 花の中心、4-13: 花びら 5 枚（1 枚 = 中心から細い三角 1 つ。すき間があるので紙吹雪に見えない）
  {
    const pos = [-0.06, 0, 0, 0.06, 0, 0, 0, 1, 0, 0, 1, 0], part = [0, 0, 0, 2], idx = [0, 1, 2];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      for (const d of [-0.42, 0.42]) { pos.push(Math.cos(a + d) * 1.2, 1, Math.sin(a + d) * 1.2); part.push(1); }
      idx.push(3, 5 + k * 2, 4 + k * 2);
    }
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    fg.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(part), 1));
    fg.setIndex(idx);
  }
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
        float pm = smoothstep(0.36, 0.58, ptc + (rg.g - 0.3) * 0.25 + rg.r * 0.06 - rg.b * 0.2);
        float keep = step(aOff.z, gc.a * pm * 1.3 * (1.0 - 0.6 * rg.g)) * step(0.25, gc.a);
        float hs = (0.2 + 0.22 * aOff.w) * (0.7 + 0.3 * aTile.y) * keep * fade;
        float sz = (0.04 + 0.04 * aOff.z) * (0.6 + 0.4 * aTile.y) * (1.0 - 0.35 * rg.g) * keep * fade;
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
        if (aPart > 0.5) c += pal * (0.06 * (1.0 - uFogP.z) + 0.55 * rg.g * uFogP.z);      // 森の花は夜に光る（草原の花は夜は沈む）
        float cl = texture2D(uNoiseTex, w * uCloud.x + uCloud.yz).r;
        c *= 1.0 - smoothstep(0.42, 0.6, cl) * uCloud.w * 0.8;
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
