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
  // [タイルの大きさ m, 株の数, 太さ]。大きい段は近くでは消える（足もとは細い葉だけ）。4 段目は 50 m までの毛並み
  const tiers = [[12, 3000, 1.0], [26, 2300, 1.6], [52, 1400, 2.5], [100, 700, 3.8]];
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
      const share = Math.max(1, Math.round(counts[k] / counts[counts.length - 1]));
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
        // 大きい段は近くでは出さない（太い葉が足もとで槍のように見えない）
        fade *= aTile.y > 1.2 ? smoothstep(aTile.x * 0.09, aTile.x * 0.19, dist) : 1.0;
        // 丈は 3 つの群れ：低い株が多く、ときどき背の高い株
        float tall = 0.17 + 0.27 * aOff.w + 0.24 * step(0.86, aOff.w);
        // 草原では 3 枚目の葉が穂（種のついた茎）になる株がある
        float stalk = step(1.5, bid) * step(0.8, aOff.z) * step(0.35, rg.r) * step(aTile.y, 2.6);
        float hs = tall * (0.55 + 0.6 * gc.a) * (0.75 + 0.5 * patchv) * (1.0 - 0.2 * bid) * (0.9 + 0.12 * min(aTile.y, 2.6)) * (1.0 + 0.45 * stalk) * keep * fade;
        float wd = 0.05 * aTile.y * (0.75 + 0.5 * aOff.z) * (1.0 - 0.45 * stalk);
        float ang = aOff.w * 31.4 + bid * 2.2;
        vec2 fan = vec2(cos(ang), sin(ang));
        // 幅は見る向きに正対させる（線にならない）。葉先は扇に開き、風でしなる
        vec2 tc = normalize(cameraPosition.xz - w + vec2(1e-3));
        vec2 side = vec2(-tc.y, tc.x);
        vec2 bend = awBend(w, aOff.w + bid * 0.37);
        // 穂：根もとは 1 点、上の方で少しふくらんで先がとがる（細い茎＋穂の影絵）
        vec2 pv = position.xy;
        if (stalk > 0.5) pv = pv.x < -0.1 ? vec2(0.0, 0.0) : (pv.y < 0.5 ? vec2(0.6, 0.72) : vec2(0.0, 1.0));
        float y = pv.y;
        vec3 p;
        p.xz = w + fan * (0.045 * aTile.y * min(bid, 1.0)) + side * (pv.x * wd) + (bend * 1.25 + fan * (0.2 + 0.25 * aOff.z) * (1.0 - 0.7 * stalk)) * (y * hs);
        p.y = hgt - 0.03 + y * hs * (1.0 - 0.2 * dot(bend, bend));
        // 色：根もとは地面の色に沈み、葉先は明るく黄みがかる。株ごとに乾いた色・深い色へ振る
        float gness = clamp((gc.g - gc.r) * 6.0, 0.0, 1.0);
        // 地面と同じ中くらいのむら（クローバーの深い緑 ↔ 日なたの黄緑）をかけて、根もとは地面の色にそろえる
        float cv = smoothstep(0.3, 0.72, nzd.r * 0.75 + nzd.a * 0.25);
        vec3 base = gc.rgb * mix(vec3(1.0), mix(vec3(0.8, 0.96, 0.9), vec3(1.1, 1.05, 0.82), cv), rg.r);
        base *= mix(vec3(1.0), mix(vec3(0.9, 0.98, 0.92), vec3(1.08, 1.05, 0.86), patchv), 0.5 * gness);
        vec3 tip = mix(base * 1.3 + 0.012, base * vec3(1.42, 1.36, 0.96) + vec3(0.014, 0.02, 0.0), gness);
        vec3 alb = mix(base * 0.86, tip, y);
        // 穂の色：茎は緑、穂は麦わらから淡い金
        alb = mix(alb, mix(alb, vec3(0.62, 0.52, 0.27) * (0.85 + 0.3 * aOff.w), smoothstep(0.55, 0.8, y)), stalk);
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

  // ── 野の花：1 株 = 開いた花 2 つ（花びら 5 枚、1 枚 = ひし形の三角 2 つ）＋つぼみ 1 つ、それぞれ細い茎 ──
  const NF = Math.round(520 * (isQ3 ? 1.3 : 1));
  const fg = new THREE.InstancedBufferGeometry();
  {
    const pos = [], part = [], head = [], idx = [];
    // part：0 茎、1 花びらの先、2 花の中心、3 花びらの根もと
    const v = (x, y, z, pt, h) => { pos.push(x, y, z); part.push(pt); head.push(h); return pos.length / 3 - 1; };
    for (let h = 0; h < 3; h++) {
      idx.push(v(-0.5, 0, 0, 0, h), v(0.5, 0, 0, 0, h), v(0, 1, 0, 0, h));
      const c = v(0, 1, 0, 2, h), np = h < 2 ? 5 : 2;
      for (let k = 0; k < np; k++) {
        const a = (k / np) * Math.PI * 2;
        const L = v(Math.cos(a - 0.34) * 0.5, 1, Math.sin(a - 0.34) * 0.5, 3, h);
        const T = v(Math.cos(a), 1, Math.sin(a), 1, h);
        const R = v(Math.cos(a + 0.34) * 0.5, 1, Math.sin(a + 0.34) * 0.5, 3, h);
        idx.push(c, T, L, c, R, T);
      }
    }
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    fg.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(part), 1));
    fg.setAttribute('aHead', new THREE.BufferAttribute(new Float32Array(head), 1));
    fg.setIndex(idx);
  }
  const fo = new Float32Array(NF * 4), ft = new Float32Array(NF * 2);
  for (let i = 0; i < NF; i++) {
    const S = i % 3 === 0 ? 60 : 30;
    fo[i * 4] = rng.next() * S; fo[i * 4 + 1] = rng.next() * S; fo[i * 4 + 2] = rng.next(); fo[i * 4 + 3] = rng.next();
    ft[i * 2] = S; ft[i * 2 + 1] = S === 60 ? 1.6 : 1.0;
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
      attribute float aPart, aHead;
      void main() {
        float dist, fade;
        vec2 w = awWrap(dist, fade);
        float hgt = texture2D(uHeightTex, (w + 801.0) / 1602.0).r;
        vec4 gc = texture2D(uColorTex, (w + 800.0) / 1600.0);
        vec4 rg = texture2D(uRegionTex, (w + 800.0) / 1600.0);
        float ptc = texture2D(uNoiseTex, w * 0.011).r;
        float pm = smoothstep(0.34, 0.56, ptc + (rg.g - 0.3) * 0.25 + rg.r * 0.08 - rg.b * 0.2);
        float keep = step(aOff.z, gc.a * pm * 1.5 * (1.0 - 0.6 * rg.g)) * step(0.25, gc.a);
        // 株の中の花の位置・高さ・大きさ（花ごとに少しずつ違う）
        float hh = aHead, bud = step(1.5, hh);
        float r1 = fract(aOff.z * (hh + 1.0) * 7.31 + aOff.w * 3.7), r2 = fract(aOff.w * (hh + 2.0) * 3.71 + aOff.z * 1.3);
        float ha = aOff.w * 6.283 + hh * 2.1;
        vec2 wh = w + vec2(cos(ha), sin(ha)) * (0.03 + 0.12 * r1);
        float hs = (0.44 + 0.3 * aOff.w) * (0.8 + 0.35 * r2) * (1.0 - 0.18 * bud) * (0.8 + 0.2 * aTile.y) * keep * fade;
        float sz = (0.05 + 0.04 * r1) * (1.0 - 0.55 * bud) * (0.7 + 0.3 * aTile.y) * (1.0 - 0.3 * rg.g) * keep * fade;
        vec2 bend = awBend(wh, aOff.w + hh) * 0.6;
        int idx = int(mod(aOff.w * 97.0, 4.0));
        vec3 pal = uPalM[idx] * rg.r + uPalF[idx] * rg.g + uPalC[idx] * rg.b + uPalP[idx] * rg.a;
        pal /= max(rg.r + rg.g + rg.b + rg.a, 0.01);
        // 中心：白・青・桃の花は黄色、黄色の花は茶色
        vec3 eye = idx == 1 ? vec3(0.36, 0.2, 0.06) : vec3(1.0, 0.76, 0.2);
        vec3 p; vec3 alb;
        vec2 tc = normalize(cameraPosition.xz - wh + vec2(1e-3));
        if (aPart < 0.5) {
          p.xz = wh + vec2(-tc.y, tc.x) * position.x * 0.012 + bend * (position.y * position.y * hs);
          p.y = hgt - 0.03 + position.y * hs;
          alb = gc.rgb * vec3(0.95, 1.1, 0.85);
        } else {
          // 花は少し上を向いた皿。中心はくぼみ、花びらの先は見る側へ少し起きる
          vec3 top = vec3(wh.x + bend.x * hs, hgt - 0.03 + hs, wh.y + bend.y * hs);
          float a = aOff.z * 6.28 + hh * 1.3; float ca = cos(a), sa = sin(a);
          vec2 q = vec2(position.x * ca - position.z * sa, position.x * sa + position.z * ca);
          p = top + vec3(q.x, 0.0, q.y) * sz;
          p.y += dot(q, tc) * sz * 0.85 - (aPart > 1.5 ? (aPart > 2.5 ? sz * 0.12 : sz * 0.3) : 0.0) + bud * sz * 0.6 * length(q);
          alb = aPart > 2.5 ? mix(pal * 0.82, eye, 0.18) : aPart > 1.5 ? eye : pal * 1.04;
          alb = mix(alb, pal * vec3(0.55, 0.8, 0.5), bud * 0.6);
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
