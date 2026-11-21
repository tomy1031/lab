// js/world/sky.js — FABLE
// 空のドーム（グラデーション・太陽／環月・天環・オーロラ）、星、天環の欠片、雲。
import * as THREE from 'three';
import { U, AW_PARS, AwMaterial, sharedUniforms } from './art.js';

// 空の色の関数。水面の反射でも同じものを呼ぶ
export const SKY_PARS = /* glsl */`
uniform vec3 uZenith, uHorizon, uSunDiscCol, uRingN, uRingU, uRingCol;
uniform vec4 uBand, uSkyP;
vec3 awSkyBase(vec3 d) {
  float y = max(d.y, 0.0);
  float t = 1.0 - y;
  float t3 = t * t * t;
  vec3 c = mix(uZenith, uHorizon, t3 * t * (0.55 + 0.45 * t3));
  float bb = (y - 0.15) / 0.11;
  c = mix(c, uBand.rgb, uBand.a * exp(-bb * bb));
  float g = max(dot(d, uGlowDir), 0.0);
  float g2 = g * g, g8 = g2 * g2; g8 *= g8;
  float g64 = g8 * g8; g64 *= g64; g64 *= g64;
  c += uSunDiscCol * ((g8 * 0.16 + g64 * 0.4) * uSkyP.w);
  c = mix(c, awFogColorDir(d), exp(-y * 13.0));
  return c;
}
// 天環：細く明るい帯 B（外へ向かって明るい）、切れ目、淡い帯 A（中に細い暗線）、内側のかすかな帯 C、にじみ。
// 縞は細かく弱く（線の束に見せない）。地平に近いほど大気に沈む。
float awBand(float s, float a, float b, float e) { return smoothstep(a - e, a + e, s) * smoothstep(b + e, b - e, s); }
vec3 awRing(vec3 d) {
  float s = dot(d, uRingN);
  float al = dot(d, uRingU);
  float e = 0.0011;
  float fine = 0.88 + 0.12 * sin(s * 2600.0) * sin(s * 950.0 + 1.3);
  float C = awBand(s, -0.023, -0.0135, e * 2.0) * 0.13;
  float B = awBand(s, -0.0135, 0.0, e) * (0.62 + 0.38 * clamp((s + 0.0135) / 0.0135, 0.0, 1.0)) * fine;
  float A = awBand(s, 0.0032, 0.0118, e) * 0.46 * (1.0 - 0.65 * awBand(s, 0.0083, 0.0093, 0.0003));
  float halo = exp(-abs(s + 0.004) * 55.0) * 0.1;
  float vary = 0.8 + 0.2 * sin(al * 3.1 + 0.7) * sin(al * 7.9 + 2.0);
  return uRingCol * ((B + A + C) * vary + halo) * smoothstep(0.015, 0.3, d.y);
}
// 映りこみ用：細部を落とした、ぼけた帯（さざ波でにじむ）
vec3 awRingSoft(vec3 d) {
  float s = dot(d, uRingN) + 0.004;
  return uRingCol * (smoothstep(0.03, 0.0, abs(s)) * 0.22 + exp(-abs(s) * 40.0) * 0.06) * smoothstep(0.015, 0.3, d.y);
}
vec3 awAurora(vec3 d) {
  float north = smoothstep(0.05, 0.6, -d.z);
  float az = d.x / (0.55 - d.z);
  float tt = uTime * 0.12;
  float wave = sin(az * 4.2 + tt + sin(az * 9.0 - tt * 0.7) * 0.9);
  float base = 0.2 + 0.07 * wave + 0.025 * sin(az * 21.0 + tt * 1.7);
  float h = d.y - base;
  float curtain = smoothstep(0.0, 0.02, h) * exp(-max(h, 0.0) * 5.0);
  float rays = 0.5 + 0.5 * sin(az * 70.0 + sin(az * 15.0 + tt * 2.0) * 3.0);
  rays = 0.45 + 0.55 * rays * rays;
  vec3 col = mix(vec3(0.1, 1.0, 0.42), vec3(0.15, 0.4, 1.0), smoothstep(0.0, 0.2, h));
  col = mix(col, vec3(0.55, 0.2, 1.0), smoothstep(0.14, 0.45, h));
  return col * (curtain * rays * north * uSkyP.z);
}
vec3 awSky(vec3 d) {
  vec3 c = awSkyBase(d) + awRing(d);
  if (uSkyP.z > 0.003) c += awAurora(d);
  return c;
}
// 水・氷に映す空（天環はぼかす）
vec3 awSkyRefl(vec3 d) {
  vec3 c = awSkyBase(d) + awRingSoft(d);
  if (uSkyP.z > 0.003) c += awAurora(d) * 0.85;
  return c;
}
`;
export const SKY_UNIFORMS = ['uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uFogCol', 'uFogSunCol', 'uGlowDir', 'uFogP', 'uTime',
  'uZenith', 'uHorizon', 'uSunDiscCol', 'uRingN', 'uRingU', 'uRingCol', 'uBand', 'uSkyP'];

export function createSky(ctx, rng) {
  const group = new THREE.Group();
  group.name = 'aw-sky';

  // 天環の向き
  const ringN = U.uRingN.value;
  U.uRingU.value.set(1, 0, 0).addScaledVector(ringN, -ringN.x).normalize();
  const ringV = new THREE.Vector3().crossVectors(ringN, U.uRingU.value).normalize();

  // ── ドーム ──
  const domeMat = new AwMaterial({
    uniforms: sharedUniforms(SKY_UNIFORMS, { uMoonU: { value: new THREE.Vector3() }, uMoonV: { value: new THREE.Vector3() } }),
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position * 100.0, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      ${AW_PARS}
      ${SKY_PARS}
      uniform vec3 uMoonU, uMoonV;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = awSky(d);
        float g = dot(d, uGlowDir);
        if (uSkyP.x < 0.5) {
          // 太陽
          float disc = smoothstep(0.99925, 0.99945, g);
          float halo = smoothstep(0.994, 0.9996, g);
          c += uSunDiscCol * (disc * 2.2 + halo * halo * 0.5) * uSkyP.w;
        } else {
          // 環月：円盤と、傾いた輪
          vec2 p = vec2(dot(d, uMoonU), dot(d, uMoonV)) / 0.042;
          float r = length(p);
          float disc = smoothstep(1.0, 0.94, r) * step(0.0, g);
          float shade = 0.8 + 0.2 * smoothstep(-0.6, 0.8, p.x * 0.7 + p.y * 0.5);
          vec2 q = vec2(p.x * 0.94 + p.y * 0.34, (p.y * 0.94 - p.x * 0.34) * 3.4);
          float rr = length(q);
          float ring = smoothstep(0.09, 0.03, abs(rr - 1.85)) * step(0.0, g);
          ring *= (1.0 - disc * step(q.y, 0.0));
          c = mix(c, vec3(0.86, 0.92, 1.0) * shade * 1.15, disc * uSkyP.w * 1.6);
          c += vec3(0.6, 0.78, 1.0) * ring * uSkyP.w * 1.1;
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false, side: THREE.BackSide,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), domeMat);
  dome.frustumCulled = false; dome.renderOrder = 900;
  group.add(dome);

  // ── 星 ──
  const NS = 1500;
  const spos = new Float32Array(NS * 3), scol = new Float32Array(NS * 3), ssize = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    let x, y, z, l;
    do { x = rng.range(-1, 1); y = rng.range(-0.05, 1); z = rng.range(-1, 1); l = x * x + y * y + z * z; } while (l > 1 || l < 0.05);
    l = Math.sqrt(l);
    spos[i * 3] = x / l; spos[i * 3 + 1] = y / l; spos[i * 3 + 2] = z / l;
    const m = Math.pow(rng.next(), 4.5);
    const tint = rng.next();
    scol[i * 3] = 0.75 + 0.25 * tint; scol[i * 3 + 1] = 0.82 + 0.1 * tint; scol[i * 3 + 2] = 1.0 - 0.25 * tint;
    ssize[i] = 1.3 + m * 3.4;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ssize, 1));
  const starUniforms = { uPx: { value: 1 }, uMirror: { value: new THREE.Vector4(0, 24, -40, 0) } };
  const starVert = (mirror) => /* glsl */`
    ${AW_PARS}
    uniform vec4 uSkyP; uniform float uPx; uniform vec4 uMirror; uniform sampler2D uHeightTex;
    attribute float aSize;
    varying vec3 vC;
    void main() {
      float tw = 0.75 + 0.25 * sin(uTime * (1.5 + aSize) + position.x * 40.0 + position.z * 31.0);
      float vis = uSkyP.y * uSkyP.y * smoothstep(0.03, 0.3, position.y) * tw;
      vC = color * vis;
      ${mirror ? `
      // 水面に映る星：反射した視線が水面と交わる点に置く
      vec3 d = vec3(position.x, -position.y, position.z);
      float hgt = cameraPosition.y - uMirror.y;
      float t = hgt / max(-d.y, 1e-3);
      vec3 wp = cameraPosition + d * min(t, 2600.0);
      vec2 dl = wp.xz - uMirror.xz;
      float inside = step(dot(dl, dl), uMirror.w * uMirror.w) * step(0.2, hgt);
      vC *= 0.6 * inside * smoothstep(0.02, 0.2, position.y);
      wp.y = uMirror.y;
      // 岸や小島の上には映さない。水面より少し手前に寄せて深度で負けないようにする
      inside *= step(texture2D(uHeightTex, (wp.xz + 801.0) / 1602.0).r, uMirror.y - 0.15 + uMirror.y * 0.0 + step(40.0, uMirror.y));
      vC *= inside;
      wp = cameraPosition + (wp - cameraPosition) * 0.985;
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      gl_PointSize = aSize * uPx * 0.9;
      ` : `
      vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position * 100.0, 1.0);
      gl_Position = p.xyww;
      gl_PointSize = aSize * uPx;
      `}
    }`;
  const starFrag = /* glsl */`
    varying vec3 vC;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float a = max(1.0 - dot(q, q) * 4.0, 0.0);
      gl_FragColor = vec4(vC * a * a, 1.0);
      #include <colorspace_fragment>
    }`;
  const mkStars = (mirror) => {
    const m = new AwMaterial({
      uniforms: sharedUniforms(['uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uFogCol', 'uFogSunCol', 'uGlowDir', 'uFogP', 'uTime', 'uSkyP', 'uHeightTex'], starUniforms),
      vertexShader: starVert(mirror), fragmentShader: starFrag, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(starGeo, m);
    pts.frustumCulled = false; pts.renderOrder = mirror ? 60 : 910;
    return pts;
  };
  const stars = mkStars(false), starsMirror = mkStars(true);
  group.add(stars, starsMirror);

  // ── 天環の欠片（40 個）──
  const NF = 40;
  const fragGeo = new THREE.InstancedBufferGeometry();
  const og = new THREE.OctahedronGeometry(1, 0);
  og.computeVertexNormals();
  fragGeo.setAttribute('position', og.getAttribute('position'));
  fragGeo.setAttribute('normal', og.getAttribute('normal'));
  const fa = new Float32Array(NF * 4), fb = new Float32Array(NF * 4);
  for (let i = 0; i < NF; i++) {
    const ang = rng.range(0, Math.PI * 2), off = rng.range(-0.02, 0.02) + (rng.next() < 0.3 ? rng.range(-0.05, 0.05) : 0);
    const d = new THREE.Vector3().addScaledVector(U.uRingU.value, Math.cos(ang)).addScaledVector(ringV, Math.sin(ang)).addScaledVector(ringN, off).normalize();
    fa[i * 4] = d.x; fa[i * 4 + 1] = d.y; fa[i * 4 + 2] = d.z; fa[i * 4 + 3] = rng.range(0.25, 1.0) * (rng.next() < 0.15 ? 2.2 : 1);
    fb[i * 4] = rng.range(0.5, 1.6); fb[i * 4 + 1] = rng.range(0.4, 1.2); fb[i * 4 + 2] = rng.range(0, 6.28); fb[i * 4 + 3] = rng.range(0.2, 1);
  }
  fragGeo.setAttribute('aDir', new THREE.InstancedBufferAttribute(fa, 4));
  fragGeo.setAttribute('aShape', new THREE.InstancedBufferAttribute(fb, 4));
  fragGeo.instanceCount = NF;
  const fragMat = new AwMaterial({
    uniforms: sharedUniforms(['uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uFogCol', 'uFogSunCol', 'uGlowDir', 'uFogP', 'uTime', 'uRingCol', 'uSkyP', 'uZenith']),
    vertexShader: /* glsl */`
      uniform vec3 uGlowDir, uRingCol, uZenith; uniform vec4 uSkyP; uniform float uTime;
      attribute vec4 aDir, aShape;
      varying vec3 vC;
      void main() {
        float a = aShape.z + uTime * 0.03 * aShape.w;
        float c = cos(a), s = sin(a);
        vec3 p = position * vec3(aShape.x, aShape.y, 0.7);
        p = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
        vec3 n = vec3(normal.x * c - normal.y * s, normal.x * s + normal.y * c, normal.z);
        vec3 dir = normalize(aDir.xyz);
        vec3 rx = normalize(cross(vec3(0.0, 1.0, 0.0), dir)), ry = cross(dir, rx);
        vec3 wp = dir * 100.0 + (rx * p.x + ry * p.y + dir * p.z) * aDir.w * 0.55;
        vec3 wn = rx * n.x + ry * n.y + dir * n.z;
        float l = max(dot(wn, uGlowDir), 0.0) * 0.8 + 0.25;
        vC = mix(uZenith, uRingCol * 3.2 * l, 0.5 + 0.5 * uSkyP.y) * smoothstep(-0.02, 0.1, dir.y);
        vec4 q = projectionMatrix * vec4(mat3(viewMatrix) * wp, 1.0);
        gl_Position = q.xyww;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC;
      void main() { gl_FragColor = vec4(vC, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const frags = new THREE.Mesh(fragGeo, fragMat);
  frags.frustumCulled = false; frags.renderOrder = 905;
  group.add(frags);

  // ── 雲（天球に貼った綿の板 28 枚）──
  const CS = 256, cloudData = new Uint8Array(CS * 2 * CS * 2 * 4);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * CS, oy = (v >> 1) * CS;
    const blobs = [];
    const nb = 9 + Math.floor(rng.next() * 6);
    for (let b = 0; b < nb; b++) {
      const bx = rng.range(0.2, 0.8), by = 0.34 + Math.pow(rng.next(), 1.6) * 0.28 * (1 - Math.abs(bx - 0.5) * 1.6);
      blobs.push([bx, by, rng.range(0.1, 0.19) * (1 - Math.abs(bx - 0.5) * 0.7)]);
    }
    const hgt = new Float32Array(CS * CS);
    for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
      const u = (x + 0.5) / CS, w = (y + 0.5) / CS;
      let h = 0;
      for (let b = 0; b < nb; b++) {
        const bl = blobs[b], dx = u - bl[0], dy = (w - bl[1]) * 1.25, q = 1 - (dx * dx + dy * dy) / (bl[2] * bl[2]);
        if (q > 0) h += q * q * (3 - 2 * q) * bl[2] * 5.6;
      }
      const fb = Math.min(1, Math.max(0, (w - 0.25) * 7));
      h *= fb * fb * (3 - 2 * fb);   // 平らな底
      hgt[y * CS + x] = h;
    }
    for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
      const h = hgt[y * CS + x];
      const hx = hgt[y * CS + Math.min(CS - 1, x + 1)] - hgt[y * CS + Math.max(0, x - 1)];
      const hy = hgt[Math.min(CS - 1, y + 1) * CS + x] - hgt[Math.max(0, y - 1) * CS + x];
      const k = ((oy + y) * CS * 2 + ox + x) * 4;
      let a = (h - 0.06) / 0.75; a = a < 0 ? 0 : a > 1 ? 1 : a; a = a * a * (3 - 2 * a);
      cloudData[k] = Math.max(0, Math.min(255, 128 - hx * 520));
      cloudData[k + 1] = Math.max(0, Math.min(255, 128 - hy * 520));
      cloudData[k + 2] = Math.min(255, h * 150);
      cloudData[k + 3] = a * 255;
    }
  }
  const cloudTex = new THREE.DataTexture(cloudData, CS * 2, CS * 2, THREE.RGBAFormat);
  cloudTex.minFilter = THREE.LinearMipmapLinearFilter; cloudTex.magFilter = THREE.LinearFilter; cloudTex.generateMipmaps = true;
  cloudTex.needsUpdate = true;
  const NC = 28;
  const cg = new THREE.InstancedBufferGeometry();
  const pg = new THREE.PlaneGeometry(2, 2);
  cg.setAttribute('position', pg.getAttribute('position'));
  cg.setAttribute('uv', pg.getAttribute('uv'));
  cg.setIndex(pg.getIndex());
  const ca = new Float32Array(NC * 4), cb = new Float32Array(NC * 4);
  for (let i = 0; i < NC; i++) {
    const tier = i < 12 ? 0 : i < 22 ? 1 : 2;
    ca[i * 4] = (i / NC) * Math.PI * 2 * (tier === 0 ? 2.33 : 1) + rng.range(-0.25, 0.25);        // 方位
    ca[i * 4 + 1] = tier === 0 ? rng.range(0.05, 0.12) : tier === 1 ? rng.range(0.14, 0.3) : rng.range(0.36, 0.6);   // 仰角（rad）
    const s = tier === 0 ? rng.range(10, 17) : tier === 1 ? rng.range(15, 26) : rng.range(22, 34);
    ca[i * 4 + 2] = s; ca[i * 4 + 3] = s * rng.range(0.42, 0.58);
    cb[i * 4] = i % 4; cb[i * 4 + 1] = rng.next() < 0.5 ? 1 : -1; cb[i * 4 + 2] = rng.range(0.7, 1.3); cb[i * 4 + 3] = rng.next();
  }
  cg.setAttribute('aCloud', new THREE.InstancedBufferAttribute(ca, 4));
  cg.setAttribute('aVar', new THREE.InstancedBufferAttribute(cb, 4));
  cg.instanceCount = NC;
  const cloudU = { uTex: { value: cloudTex }, uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uDrift: { value: 0 } };
  const cloudMat = new AwMaterial({
    uniforms: sharedUniforms(['uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uFogCol', 'uFogSunCol', 'uGlowDir', 'uFogP', 'uTime', 'uSkyP'], cloudU),
    vertexShader: /* glsl */`
      uniform float uDrift; uniform vec3 uGlowDir;
      attribute vec4 aCloud, aVar;
      varying vec2 vUv; varying vec3 vL; varying vec3 vDir; varying float vBack;
      void main() {
        float az = aCloud.x + uDrift * aVar.z;
        float el = aCloud.y;
        vec3 dir = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
        vec3 rx = normalize(cross(dir, vec3(0.0, 1.0, 0.0))), ry = cross(rx, dir);
        vec3 wp = dir * 100.0 + rx * position.x * aCloud.z + ry * (position.y + 0.5) * aCloud.w;
        vec2 cell = vec2(mod(aVar.x, 2.0), floor(aVar.x / 2.0));
        vec2 u = uv; if (aVar.y < 0.0) u.x = 1.0 - u.x;
        vUv = (cell + u) * 0.5;
        vL = vec3(dot(uGlowDir, rx) * aVar.y, dot(uGlowDir, ry), -dot(uGlowDir, dir));
        vDir = normalize(wp);
        vBack = max(dot(dir, uGlowDir), 0.0);
        vec4 q = projectionMatrix * vec4(mat3(viewMatrix) * wp, 1.0);
        gl_Position = vec4(q.xy, q.w * 0.99999, q.w);
      }`,
    fragmentShader: /* glsl */`
      ${AW_PARS}
      uniform sampler2D uTex; uniform vec3 uCloudLit, uCloudShade; uniform vec4 uSkyP;
      varying vec2 vUv; varying vec3 vL; varying vec3 vDir; varying float vBack;
      void main() {
        vec4 t = texture2D(uTex, vUv);
        vec3 n = normalize(vec3(t.rg * 2.0 - 1.0, 0.75));
        vec3 L = normalize(vec3(vL.xy, max(vL.z, 0.35)));
        float l = dot(n, L) * 0.5 + 0.5;
        l = 0.25 + 0.75 * l;
        float edge = 1.0 - smoothstep(0.0, 0.9, t.a);
        float back = vBack * vBack; back *= back;
        l = clamp(l + edge * back * 0.9 + t.b * 0.08, 0.0, 1.35);
        vec3 c = mix(uCloudShade, uCloudLit, l);
        c = mix(c, awFogColorDir(vDir), exp(-max(vDir.y, 0.0) * 9.0) * 0.85);
        gl_FragColor = vec4(c, t.a * (0.94 - 0.4 * uSkyP.y));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const clouds = new THREE.Mesh(cg, cloudMat);
  clouds.frustumCulled = false; clouds.renderOrder = 920;
  group.add(clouds);

  const _v = new THREE.Vector3(), _size = new THREE.Vector2();
  let drift = 0;
  function update(dt, pal, mirror) {
    // 月の基底
    const g = U.uGlowDir.value;
    const mu = domeMat.uniforms.uMoonU.value.set(0, 1, 0).cross(g).normalize();
    domeMat.uniforms.uMoonV.value.crossVectors(g, mu).normalize();
    cloudU.uCloudLit.value.copy(pal.cloudLit);
    cloudU.uCloudShade.value.copy(pal.cloudShade);
    drift += dt * 0.0022 * (0.4 + U.uWind.value.z);
    cloudU.uDrift.value = drift;
    starUniforms.uPx.value = Math.max(1, U.uVH.value / 900);
    const night = pal.night > 0.02;
    stars.visible = night;
    starsMirror.visible = night && mirror.on;
    starUniforms.uMirror.value.set(mirror.x, mirror.y, mirror.z, mirror.r);
  }
  return { group, update, stars, clouds, frags };
}
