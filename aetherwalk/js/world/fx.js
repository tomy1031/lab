// js/world/fx.js — FABLE
// 粒子（Points のプール 600）、地域の常駐粒子、にじみのまとめ描き（glows）、光の筋（shafts）。
// 粒子の動きはすべて頂点シェーダーで計算する（CPU は出すときに書くだけ）。
import * as THREE from 'three';
import { U, AW_PARS, AwMaterial, sharedUniforms, FOG_LIGHT_UNIFORMS } from './art.js';

const MAXP = 600, MAXG = 640, MAXS = 72, NAMB = 300;
const FOGU = [...FOG_LIGHT_UNIFORMS, 'uVH'];

// kind ごとの既定
const PRESET = {
  spark: { count: 10, color: 0xffd76a, speed: 4.5, size: 0.08, life: 0.5, spread: 1, grav: -9, drag: 1.5, add: 1, up: 0.3 },
  dust: { count: 8, color: 0xc9b89a, speed: 1.3, size: 0.36, life: 1.0, spread: 1, grav: 0.3, drag: 2.5, add: 0, up: 0.5, alpha: 0.5 },
  splash: { count: 12, color: 0xdff6ff, speed: 3.2, size: 0.1, life: 0.7, spread: 0.7, grav: -9.8, drag: 0.4, add: 0, up: 1.2, alpha: 0.9 },
  ember: { count: 6, color: 0xff9a3c, speed: 0.9, size: 0.06, life: 1.6, spread: 0.6, grav: 1.2, drag: 0.8, add: 1, up: 1 },
  smoke: { count: 5, color: 0x8a8690, speed: 0.7, size: 0.7, life: 2.4, spread: 0.6, grav: 0.9, drag: 1.1, add: 0, up: 1, alpha: 0.5 },
  leaf: { count: 8, color: 0x7fd06a, speed: 1.6, size: 0.11, life: 2.2, spread: 1, grav: -1.2, drag: 1.2, add: 0, up: 0.6, alpha: 1 },
  petal: { count: 10, color: 0xffc4dc, speed: 1.4, size: 0.09, life: 3.0, spread: 1, grav: -0.5, drag: 1.0, add: 0, up: 0.7, alpha: 1 },
  poof: { count: 22, color: 0x9a94a6, speed: 1.6, size: 0.3, life: 1.4, spread: 1, grav: 1.2, drag: 1.6, add: 0, up: 0.6, alpha: 0.8 },
  // ring：size は輪の半径（m）。粒の大きさ・数・速さは半径から決める
  ring: { count: 0, color: 0xfff1c0, speed: 0, size: 1.2, life: 0.55, spread: 0, grav: 0, drag: 3.2, add: 1, up: 0 },
  heal: { count: 12, color: 0x9dffb0, speed: 0.7, size: 0.1, life: 1.2, spread: 0.8, grav: 1.5, drag: 0.5, add: 1, up: 1 },
  shard: { count: 8, color: 0xffd76a, speed: 2.2, size: 0.09, life: 0.9, spread: 1, grav: -3, drag: 1.2, add: 1, up: 1 },
  gust: { count: 14, color: 0xd8f6ff, speed: 7, size: 0.12, life: 0.5, spread: 0.35, grav: 0, drag: 1.2, add: 1, up: 0 },
  snow: { count: 12, color: 0xffffff, speed: 1.2, size: 0.07, life: 1.6, spread: 1, grav: -2, drag: 1.5, add: 0, up: 0.8, alpha: 1 },
};

export function createFx(env) {
  const group = new THREE.Group();
  group.name = 'aw-fx';
  const tmpC = new THREE.Color(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  const CORE = new THREE.Color(0xd58bff);
  let now = 0;

  // ── 粒子のプール ──
  const pg = new THREE.BufferGeometry();
  const pPos = new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3), pVel = new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3),
    pDat = new THREE.BufferAttribute(new Float32Array(MAXP * 4), 4), pCol = new THREE.BufferAttribute(new Float32Array(MAXP * 4), 4), pPhy = new THREE.BufferAttribute(new Float32Array(MAXP * 2), 2);
  for (const a of [pPos, pVel, pDat, pCol, pPhy]) a.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < MAXP; i++) pDat.array[i * 4] = -1e6;
  pg.setAttribute('position', pPos); pg.setAttribute('aVel', pVel); pg.setAttribute('aDat', pDat); pg.setAttribute('aCol', pCol); pg.setAttribute('aPhy', pPhy);
  const pMat = new AwMaterial({
    uniforms: sharedUniforms(FOGU),
    vertexShader: /* glsl */`
      ${AW_PARS}
      uniform float uVH;
      attribute vec3 aVel; attribute vec4 aDat, aCol; attribute vec2 aPhy;
      varying vec4 vC;
      void main() {
        float age = uTime - aDat.x;
        float k = age / max(aDat.y, 1e-3);
        float dr = max(aPhy.y, 0.01);
        float tt = (1.0 - exp(-dr * age)) / dr;
        vec3 p = position + aVel * tt + vec3(0.0, 0.5 * aPhy.x * age * age, 0.0);
        float live = step(0.0, age) * step(k, 1.0);
        float fade = (1.0 - k * k) * smoothstep(0.0, 0.08, k);
        vec4 fg = awFog(p);
        float add = clamp(aCol.a, 0.0, 1.0), al = aDat.w * fade * live * (1.0 - fg.a * 0.8);
        vec3 lit = aCol.rgb * mix(uSkyCol * 0.9 + uSunCol * 0.6, vec3(1.0), add);
        vC = vec4(lit * al, al * (1.0 - add));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // 遠くても 3 px より小さくしない（そのぶん淡く）
        float ps = aDat.z * (0.6 + 0.6 * k * (1.0 - add)) * projectionMatrix[1][1] * uVH * 0.5 / max(-mv.z, 0.05);
        float pmin = 3.0 * uVH / 900.0;
        vC *= clamp(ps / pmin, 0.25, 1.0);
        gl_PointSize = clamp(max(ps, pmin), 0.0, 220.0) * live;
      }`,
    fragmentShader: /* glsl */`
      varying vec4 vC;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float a = max(1.0 - dot(q, q) * 4.0, 0.0);
        a *= a;
        gl_FragColor = vec4(vC.rgb * a, vC.a * a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(pg, pMat);
  points.frustumCulled = false; points.renderOrder = 40;
  group.add(points);
  let head = 0, dirty = false, quality = 0;
  function put(x, y, z, vx, vy, vz, t0, life, size, alpha, r, g, b, add, grav, drag) {
    const i = head; head = (head + 1) % MAXP;
    pPos.array[i * 3] = x; pPos.array[i * 3 + 1] = y; pPos.array[i * 3 + 2] = z;
    pVel.array[i * 3] = vx; pVel.array[i * 3 + 1] = vy; pVel.array[i * 3 + 2] = vz;
    pDat.array[i * 4] = t0; pDat.array[i * 4 + 1] = life; pDat.array[i * 4 + 2] = size; pDat.array[i * 4 + 3] = alpha;
    pCol.array[i * 4] = r; pCol.array[i * 4 + 1] = g; pCol.array[i * 4 + 2] = b; pCol.array[i * 4 + 3] = add;
    pPhy.array[i * 2] = grav; pPhy.array[i * 2 + 1] = drag;
    dirty = true;
  }
  function emit(kind, pos, opts = {}) {
    const P = PRESET[kind] || PRESET.spark;
    if (!pos) return;
    const isRing = kind === 'ring';
    const ringR = isRing ? Math.min(12, Math.max(0.2, opts.size ?? P.size)) : 0;
    let count = opts.count ?? (isRing ? Math.round(Math.min(48, 16 + ringR * 8)) : P.count);
    if (quality > 1) count = Math.ceil(count * 0.5);
    count = Math.min(count, 80);
    tmpC.set(opts.color ?? P.color);
    const life = opts.life ?? (isRing ? P.life + ringR * 0.05 : P.life), spread = opts.spread ?? P.spread;
    // 輪：抵抗 drag のもとで寿命のうちに半径 ringR まで広がる初速
    const speed = isRing ? ringR * P.drag / (1 - Math.exp(-P.drag * life)) : (opts.speed ?? P.speed);
    const size = isRing ? 0.06 + ringR * 0.04 : (opts.size ?? P.size);
    const dir = opts.dir;
    for (let i = 0; i < count; i++) {
      let vx, vy, vz;
      if (isRing) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
        vx = Math.cos(a) * speed; vz = Math.sin(a) * speed; vy = 0.15;
      } else {
        // 球の中の乱数方向
        let x, y, z, l;
        do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
        l = Math.sqrt(l);
        const s = speed * (0.45 + 0.55 * Math.random());
        if (dir) { vx = (dir.x + (x / l) * spread) * s; vy = (dir.y + (y / l) * spread) * s; vz = (dir.z + (z / l) * spread) * s; }
        else { vx = (x / l) * spread * s; vy = ((y / l) * spread + P.up) * s; vz = (z / l) * spread * s; }
      }
      const j = 0.82 + Math.random() * 0.36;
      if (kind === 'poof' && i % 3 === 0) {
        // 灰がほどけるとき、芯の色の小さな光がのぼる
        put(pos.x + (Math.random() - 0.5) * 0.3, pos.y + (Math.random() - 0.5) * 0.3, pos.z + (Math.random() - 0.5) * 0.3, vx * 0.4, Math.abs(vy) * 0.5 + 0.6, vz * 0.4,
          now, life * (1.0 + 0.6 * Math.random()), 0.07 * j, 1, CORE.r, CORE.g, CORE.b, 1, 0.8, 0.9);
        continue;
      }
      put(pos.x + (Math.random() - 0.5) * 0.1, pos.y + (Math.random() - 0.5) * 0.1, pos.z + (Math.random() - 0.5) * 0.1, vx, vy, vz,
        now, life * (isRing ? 0.9 + 0.2 * Math.random() : 0.7 + 0.6 * Math.random()), size * j, P.alpha ?? 1, tmpC.r * j, tmpC.g * j, tmpC.b * j, P.add, P.grav, P.drag);
    }
  }
  function ribbon(from, to, opts = {}) {
    if (!from || !to) return;
    tmpC.set(opts.color ?? 0xffd76a);
    const life = opts.life ?? 6;
    tmpV.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = Math.min(tmpV.length(), 60);
    if (len < 0.01) return;
    tmpV.normalize();
    const n = Math.min(110, Math.max(8, Math.round(len * 2.2)));
    for (let i = 0; i < n; i++) {
      const f = i / n, d = f * len;
      const t0 = now + f * Math.min(1.6, life * 0.3);                   // 手もとから伸びていく
      const wob = 0.25;
      put(from.x + tmpV.x * d + (Math.random() - 0.5) * wob, from.y + tmpV.y * d + (Math.random() - 0.5) * wob + Math.sin(f * 9) * 0.12, from.z + tmpV.z * d + (Math.random() - 0.5) * wob,
        tmpV.x * 0.5, 0.12 + Math.random() * 0.1, tmpV.z * 0.5, t0, life - (t0 - now), 0.1 + Math.random() * 0.07, 1, tmpC.r, tmpC.g, tmpC.b, 1, 0, 0.3);
    }
  }

  // ── にじみ（まとめ描き）──
  const gg = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(2, 2);
  gg.setAttribute('position', quad.getAttribute('position')); gg.setIndex(quad.getIndex());
  const gPos = new THREE.InstancedBufferAttribute(new Float32Array(MAXG * 4), 4), gCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXG * 4), 4), gFx = new THREE.InstancedBufferAttribute(new Float32Array(MAXG * 4), 4);
  for (const a of [gPos, gCol, gFx]) a.setUsage(THREE.DynamicDrawUsage);
  gg.setAttribute('aPos', gPos); gg.setAttribute('aCol', gCol); gg.setAttribute('aFx', gFx);
  gg.instanceCount = 0;
  const gMat = new AwMaterial({
    uniforms: sharedUniforms(FOGU),
    vertexShader: /* glsl */`
      ${AW_PARS}
      attribute vec4 aPos, aCol, aFx;     // aFx: 明るさ, ゆらぎ, 開始時刻, 寿命（0 = ずっと）
      varying vec2 vP; varying vec3 vC;
      void main() {
        vP = position.xy;
        vec3 c = aPos.xyz;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        float dist = -mv.z;
        float mode = aCol.a;                       // 0 いつも 1 夜だけ 2 昼だけ
        float k = aFx.x * (mode > 1.5 ? 1.0 - uFogP.z : mode > 0.5 ? smoothstep(0.25, 0.8, uFogP.z) : 1.0);
        k *= 1.0 - aFx.y * (0.5 + 0.5 * sin(uTime * (7.0 + aPos.x * 0.37) + aPos.z * 3.1)) * (0.6 + 0.4 * sin(uTime * 13.3 + aPos.x));
        float s = aPos.w;
        if (aFx.w > 0.0) { float a = (uTime - aFx.z) / aFx.w; k *= step(0.0, a) * max(1.0 - a, 0.0) * max(1.0 - a, 0.0); s *= 0.5 + 0.9 * a; }
        float smin = dist * 0.0032;
        if (s < smin) { k *= max(s / smin, 0.25); s = smin; }
        k *= smoothstep(1500.0, 900.0, dist) * (1.0 - awFog(c).a * 0.75);
        // にじみの中に入ったら消す（画面いっぱいの白飛びを防ぐ）
        k *= smoothstep(s * 0.55, s * 1.5, dist);
        vC = aCol.rgb * k;
        // 板をカメラの方へ寄せる（地面や壁に切られない）。見かけの大きさは保つ
        float pull = min(s * 0.85, dist * 0.6);
        float sc = (dist - pull) / max(dist, 1e-3);
        mv.xyz *= sc;
        mv.xy += position.xy * s * sc * step(0.002, k);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; varying vec3 vC;
      void main() {
        float a = max(1.0 - length(vP), 0.0);
        a = a * a * (0.55 + 0.95 * a * a);
        gl_FragColor = vec4(vC * a, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glowMesh = new THREE.Mesh(gg, gMat);
  glowMesh.frustumCulled = false; glowMesh.renderOrder = 30;
  group.add(glowMesh);
  let gCount = 0, gDirty = false;
  const gFree = [];
  const glows = {
    // mode: 0 いつも 1 夜だけ 2 昼だけ
    add({ x, y, z, size = 1, color = 0xffd76a, mode = 0, intensity = 1, flicker = 0 }) {
      const i = gFree.length ? gFree.pop() : (gCount < MAXG ? gCount++ : -1);
      if (i < 0) return -1;
      tmpC.set(color);
      gPos.array.set([x, y, z, size], i * 4); gCol.array.set([tmpC.r, tmpC.g, tmpC.b, mode], i * 4); gFx.array.set([intensity, flicker, 0, 0], i * 4);
      gg.instanceCount = gCount; gDirty = true;
      return i;
    },
    set(i, { x, y, z, size, intensity, color } = {}) {
      if (i < 0) return;
      if (x !== undefined) { gPos.array[i * 4] = x; gPos.array[i * 4 + 1] = y; gPos.array[i * 4 + 2] = z; }
      if (size !== undefined) gPos.array[i * 4 + 3] = size;
      if (intensity !== undefined) gFx.array[i * 4] = intensity;
      if (color !== undefined) { tmpC.set(color); gCol.array[i * 4] = tmpC.r; gCol.array[i * 4 + 1] = tmpC.g; gCol.array[i * 4 + 2] = tmpC.b; }
      gDirty = true;
    },
    remove(i) { if (i < 0) return; gFx.array[i * 4] = 0; gFree.push(i); gDirty = true; },
  };
  // 一瞬の光：専用の 8 枠を使い回す
  const flashSlots = [];
  let flashHead = 0;
  function flash(pos, opts = {}) {
    if (!pos) return;
    if (flashSlots.length < 8) flashSlots.push(glows.add({ x: 0, y: -999, z: 0, size: 0.01, intensity: 0 }));
    const i = flashSlots[flashHead++ % flashSlots.length];
    if (i < 0) return;
    tmpC.set(opts.color ?? 0xfff1c0);
    gPos.array.set([pos.x, pos.y, pos.z, opts.size ?? 2], i * 4);
    gCol.array.set([tmpC.r, tmpC.g, tmpC.b, 0], i * 4);
    gFx.array.set([opts.intensity ?? 1.6, 0, now, opts.life ?? 0.35], i * 4);
    gDirty = true;
  }

  // ── 光の筋 ──
  const sg = new THREE.InstancedBufferGeometry();
  const sq = new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);
  sg.setAttribute('position', sq.getAttribute('position')); sg.setIndex(sq.getIndex());
  const sA = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 4), 4), sB = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 4), 4), sC = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 4), 4);
  for (const a of [sA, sB, sC]) a.setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('aBase', sA); sg.setAttribute('aTop', sB); sg.setAttribute('aCol', sC);
  sg.instanceCount = 0;
  const sMat = new AwMaterial({
    uniforms: sharedUniforms(FOGU),
    vertexShader: /* glsl */`
      ${AW_PARS}
      attribute vec4 aBase, aTop, aCol;   // aBase.w: 幅 aTop.w: 明るさ aCol.a: 0 いつも 1 木漏れ日（太陽の向き・昼だけ）
      varying vec2 vP; varying vec3 vC;
      void main() {
        vec3 b = aBase.xyz, t = aTop.xyz;
        float k = aTop.w;
        if (aCol.a > 0.5) {
          vec3 sd = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.35), uSunDir.z));
          t = b + sd * aTop.x;
          k *= (1.0 - uFogP.z) * smoothstep(0.1, 0.3, uSunDir.y) * (0.75 + 0.25 * sin(uTime * 0.5 + b.x));
        }
        vec3 axis = t - b;
        vec3 mid = b + axis * 0.5;
        float dist = length(cameraPosition - mid);
        float wdt = max(aBase.w, dist * 0.0035 * step(aCol.a, 0.5));
        vec3 side = normalize(cross(axis, cameraPosition - (b + axis * position.y)));
        vec3 p = b + axis * position.y + side * (position.x * wdt * (aCol.a > 0.5 ? 0.55 + 0.9 * (1.0 - position.y) : 1.0));
        vP = vec2(position.x * 2.0, position.y);
        // 木漏れ日は太く明るいので、近くでは消す（目の前で白飛びしない）
        float nearFade = aCol.a > 0.5 ? smoothstep(6.0, 22.0, dist) : smoothstep(1.0, 6.0, dist);
        // 筋の向きに沿って見ると板が重なって白飛びするので、軸と視線が平行に近いほど消す
        float para = abs(dot(normalize(axis), (cameraPosition - mid) / max(dist, 1e-3)));
        nearFade *= smoothstep(0.93, 0.7, para);
        vC = aCol.rgb * k * nearFade * (1.0 - awFog(mix(b, mid, 0.5)).a * 0.7);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; varying vec3 vC;
      void main() {
        float a = max(1.0 - abs(vP.x), 0.0);
        a = a * a * (0.4 + 0.6 * a);
        a *= smoothstep(0.0, 0.08, vP.y) * smoothstep(1.0, 0.75, vP.y);
        gl_FragColor = vec4(vC * a, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shaftMesh = new THREE.Mesh(sg, sMat);
  shaftMesh.frustumCulled = false; shaftMesh.renderOrder = 25;
  group.add(shaftMesh);
  let sCount = 0, sDirty = false;
  const shafts = {
    // 光の柱：from → to。sun = true なら from から太陽の向きへ len m の木漏れ日
    add({ from, to, width = 1, color = 0xfff1c0, intensity = 1, sun = false, len = 20 }) {
      if (sCount >= MAXS) return -1;
      const i = sCount++;
      tmpC.set(color);
      sA.array.set([from.x, from.y, from.z, width], i * 4);
      sB.array.set(sun ? [len, 0, 0, intensity] : [to.x, to.y, to.z, intensity], i * 4);
      sC.array.set([tmpC.r, tmpC.g, tmpC.b, sun ? 1 : 0], i * 4);
      sg.instanceCount = sCount; sDirty = true;
      return i;
    },
    set(i, { intensity, color } = {}) {
      if (i < 0) return;
      if (intensity !== undefined) sB.array[i * 4 + 3] = intensity;
      if (color !== undefined) { tmpC.set(color); sC.array[i * 4] = tmpC.r; sC.array[i * 4 + 1] = tmpC.g; sC.array[i * 4 + 2] = tmpC.b; }
      sDirty = true;
    },
  };

  // ── 地域の常駐粒子（カメラのまわりで巻き戻す）──
  const ag = new THREE.BufferGeometry();
  const aSeed = new Float32Array(NAMB * 4);
  for (let i = 0; i < NAMB * 4; i++) aSeed[i] = Math.random();
  ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NAMB * 3), 3));
  ag.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4));
  const AU = {
    uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() },
    uVelA: { value: new THREE.Vector4(0, 0, 0, 1) },     // xyz: 流れ w: 風の効き
    uShape: { value: new THREE.Vector4(0.06, 0.3, 1, 0) }, // 大きさ, ゆらぎ, 加算か, またたき
    uBox: { value: new THREE.Vector4(40, 12, 3, 1) },     // 幅, 高さ, 下端（カメラから）, 密度
    uAmbA: { value: 0 },
  };
  const aMat = new AwMaterial({
    uniforms: sharedUniforms([...FOGU, 'uWind'], AU),
    vertexShader: /* glsl */`
      ${AW_PARS}
      uniform float uVH, uAmbA; uniform vec4 uWind, uVelA, uShape, uBox; uniform vec3 uColA, uColB;
      attribute vec4 aSeed;
      varying vec4 vC;
      void main() {
        vec3 box = vec3(uBox.x, uBox.y, uBox.x);
        vec3 vel = uVelA.xyz + vec3(uWind.x, 0.0, uWind.y) * (uVelA.w * (0.4 + uWind.z));
        vec3 p = aSeed.xyz * box + vel * uTime * (0.7 + 0.6 * aSeed.w);
        p += vec3(sin(uTime * 0.7 + aSeed.w * 40.0), cos(uTime * 0.53 + aSeed.x * 31.0), sin(uTime * 0.61 + aSeed.y * 27.0)) * uShape.y;
        vec3 o = cameraPosition + vec3(0.0, uBox.y * 0.5 - uBox.z, 0.0);
        p = mod(p - o + box * 0.5, box) - box * 0.5 + o;
        float dist = length(p - cameraPosition);
        float keep = step(aSeed.w, uBox.w);
        float tw = 1.0 - uShape.w * (0.5 + 0.5 * sin(uTime * (1.5 + aSeed.x * 2.5) + aSeed.y * 50.0));
        float al = uAmbA * keep * tw * smoothstep(uBox.x * 0.5, uBox.x * 0.32, dist) * smoothstep(0.8, 2.4, dist);
        vec3 col = mix(uColA, uColB, aSeed.z);
        float add = uShape.z;
        vec3 lit = col * mix(uSkyCol * 0.9 + uSunCol * 0.7, vec3(1.0), add);
        vC = vec4(lit * al, al * (1.0 - add));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float ps = uShape.x * (0.6 + 0.8 * aSeed.y) * projectionMatrix[1][1] * uVH * 0.5 / max(-mv.z, 0.05);
        vC *= clamp((ps - 1.5) / 3.0, 0.0, 1.0);
        gl_PointSize = clamp(ps, 2.0, 40.0);
      }`,
    fragmentShader: pMat.fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const ambient = new THREE.Points(ag, aMat);
  ambient.frustumCulled = false; ambient.renderOrder = 41;
  group.add(ambient);
  // style: colA, colB, vel(x,y,z,wind), size, wobble, add, twinkle, box(w,h,below), density
  const STYLES = {
    petals: [0xffffff, 0xffb6d0, [0, -0.25, 0, 1.6], 0.055, 0.5, 0, 0, [36, 9, 2.2], 0.35],
    fireflies: [0xd8ff7a, 0x9dffc0, [0, 0.02, 0, 0.1], 0.07, 1.1, 1, 0.95, [34, 6, 1.6], 0.5],
    spores: [0x7ff5e1, 0xc8ffd8, [0, 0.22, 0, 0.25], 0.05, 0.7, 1, 0.6, [30, 10, 2], 0.6],
    forestNight: [0x7ff5e1, 0xd8ff7a, [0, 0.1, 0, 0.12], 0.075, 1.0, 1, 0.9, [30, 8, 1.8], 0.9],
    sand: [0xe8c79a, 0xf6dfb8, [0, -0.05, 0, 6.5], 0.045, 0.25, 0, 0, [40, 5, 1.6], 0.7],
    snow: [0xffffff, 0xdfeaff, [0, -1.3, 0, 2.2], 0.06, 0.45, 0, 0, [34, 14, 3], 1.0],
    spray: [0xffffff, 0xcfeef5, [0, 0.35, 0, 1.2], 0.05, 0.5, 0, 0.3, [36, 7, 1.8], 0.3],
    none: [0xffffff, 0xffffff, [0, 0, 0, 0], 0.05, 0, 0, 0, [30, 8, 2], 0],
  };
  let curStyle = 'none', ambA = 0, wantStyle = 'none';
  function applyStyle(name) {
    const s = STYLES[name];
    AU.uColA.value.set(s[0]); AU.uColB.value.set(s[1]);
    AU.uVelA.value.set(s[2][0], s[2][1], s[2][2], s[2][3]);
    AU.uShape.value.set(s[3], s[4], s[5], s[6]);
    AU.uBox.value.set(s[7][0], s[7][1], s[7][2], s[8]);
    curStyle = name;
  }
  function styleFor(reg, night, y) {
    const n = night > 0.6;
    if (reg === 'peaks') return y > 46 ? 'snow' : (n ? 'fireflies' : 'petals');
    if (reg === 'forest') return n ? 'forestNight' : 'spores';
    if (reg === 'canyon') return n ? 'none' : 'sand';
    if (reg === 'coast' || reg === 'sea') return n ? 'fireflies' : 'spray';
    return n ? 'fireflies' : 'petals';
  }

  const _sz = new THREE.Vector2();
  function update(view) {
    now = U.uTime.value;
    // 点の大きさ用：描画バッファの高さ
    const r = env.ctx.renderer;
    if (r.xr && r.xr.isPresenting) {
      let h = 1900;
      try { const bl = r.xr.getSession().renderState.baseLayer; if (bl && bl.framebufferHeight) h = bl.framebufferHeight; } catch (e) { /* noop */ }
      U.uVH.value = h;
    } else { r.getDrawingBufferSize(_sz); U.uVH.value = _sz.y; }
    if (dirty) { pPos.needsUpdate = pVel.needsUpdate = pDat.needsUpdate = pCol.needsUpdate = pPhy.needsUpdate = true; dirty = false; }
    if (gDirty) { gPos.needsUpdate = gCol.needsUpdate = gFx.needsUpdate = true; gDirty = false; }
    if (sDirty) { sA.needsUpdate = sB.needsUpdate = sC.needsUpdate = true; sDirty = false; }
    // 常駐粒子の切り替え（いったん消してから替える）
    wantStyle = quality > 1 ? 'none' : styleFor(view.reg, view.st.night, view.cam.y);
    const dt = view.dt || 0.016;
    if (wantStyle !== curStyle) { ambA -= dt * 1.4; if (ambA <= 0 || view.jump) { ambA = 0; applyStyle(wantStyle); } }
    else ambA = Math.min(1, ambA + dt * 0.8);
    if (view.jump && wantStyle === curStyle) ambA = 1;
    AU.uAmbA.value = ambA;
    ambient.visible = curStyle !== 'none' && ambA > 0.001;
  }
  function setQuality(level) { quality = level; }
  return { group, update, setQuality, api: { emit, ribbon, flash }, glows, shafts, points, ambient };
}
