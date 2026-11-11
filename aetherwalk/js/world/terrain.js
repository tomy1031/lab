// js/world/terrain.js — FABLE
// 地形のメッシュ：近く＝64 m チャンク 5×5（2 m 格子、歩くと入れ替わる）、遠く＝島全体を 16 m 格子（4 枚）。
// 共有テクスチャ（高さ・地面の色・ノイズ）もここで作る。
import * as THREE from 'three';
import { U, AW_PARS, AwMaterial, sharedUniforms, FOG_LIGHT_UNIFORMS } from './art.js';
import { makeNoise } from './noise.js';
import { GRID_N, HALF } from './layout.js';

const CH = 64, CN = 32, CV = CN + 1, NCH = 25, RAD = 2;

export function createTextures(hf, biomes) {
  // 高さ（half float、頂点と 1:1）
  const N = GRID_N;
  const hdata = new Uint16Array(N * N);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < N * N; i++) hdata[i] = toHalf(hf.H[i]);
  const heightTex = new THREE.DataTexture(hdata, N, N, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.minFilter = heightTex.magFilter = THREE.LinearFilter;
  heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
  heightTex.needsUpdate = true;

  // 地面の色＋草の密度（4 m / texel）
  const CS = 400;
  const cdata = new Uint8Array(CS * CS * 4);
  const out = [0, 0, 0, 0];
  const enc = (v) => { v = v < 0 ? 0 : v > 1 ? 1 : v; return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255); };
  for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) {
    const x = -HALF + (i + 0.5) * (1600 / CS), z = -HALF + (j + 0.5) * (1600 / CS);
    const k = (j * CS + i) * 4;
    if (hf.H[Math.min(N - 1, (j * 2 + 1)) * N + Math.min(N - 1, i * 2 + 1)] < -6) { cdata[k] = 30; cdata[k + 1] = 60; cdata[k + 2] = 80; cdata[k + 3] = 0; continue; }
    const d = biomes.colorAt(x, z, out, false);
    cdata[k] = enc(out[0]); cdata[k + 1] = enc(out[1]); cdata[k + 2] = enc(out[2]); cdata[k + 3] = Math.round(d * 255);
  }
  const colorTex = new THREE.DataTexture(cdata, CS, CS, THREE.RGBAFormat);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.minFilter = colorTex.magFilter = THREE.LinearFilter;
  colorTex.needsUpdate = true;

  // ノイズ（タイル可能）：R 雲 G 粒 B/A さざ波
  const NS = 256, nd = new Uint8Array(NS * NS * 4);
  const nz = makeNoise(4242);
  const pf = (x, y, base, oct) => {
    let s = 0, a = 0.5, nrm = 0, p = base;
    for (let o = 0; o < oct; o++) { s += nz.n2p(x * p + o * 13.7, y * p + o * 7.3, p) * a; nrm += a; a *= 0.5; p *= 2; }
    return s / nrm;
  };
  for (let j = 0; j < NS; j++) for (let i = 0; i < NS; i++) {
    const u = i / NS, v = j / NS, k = (j * NS + i) * 4;
    nd[k] = Math.round(pf(u, v, 3, 4) * 255);
    nd[k + 1] = Math.round(pf(u + 0.31, v + 0.17, 24, 3) * 255);
    nd[k + 2] = Math.round(pf(u + 0.53, v + 0.71, 7, 3) * 255);
    nd[k + 3] = Math.round(pf(u + 0.11, v + 0.43, 9, 3) * 255);
  }
  const noiseTex = new THREE.DataTexture(nd, NS, NS, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter; noiseTex.magFilter = THREE.LinearFilter; noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;

  // 地域の重み（meadow, forest, canyon, peaks）
  const RS = 128, rd = new Uint8Array(RS * RS * 4), w4 = [0, 0, 0, 0];
  for (let j = 0; j < RS; j++) for (let i = 0; i < RS; i++) {
    hf.weightsAt(-HALF + (i + 0.5) * (1600 / RS), -HALF + (j + 0.5) * (1600 / RS), w4);
    const k = (j * RS + i) * 4;
    rd[k] = w4[0] * 255; rd[k + 1] = w4[1] * 255; rd[k + 2] = w4[2] * 255; rd[k + 3] = w4[3] * 255;
  }
  const regionTex = new THREE.DataTexture(rd, RS, RS, THREE.RGBAFormat);
  regionTex.minFilter = regionTex.magFilter = THREE.LinearFilter;
  regionTex.needsUpdate = true;

  const pathTex = new THREE.DataTexture(hf.pathDist, N, N, THREE.RedFormat);
  pathTex.minFilter = pathTex.magFilter = THREE.LinearFilter;
  pathTex.needsUpdate = true;
  U.uPathTex.value = pathTex;
  U.uHeightTex.value = heightTex; U.uColorTex.value = colorTex; U.uNoiseTex.value = noiseTex;
  return { heightTex, colorTex, noiseTex, regionTex, colorData: cdata, colorSize: CS, regionData: rd, regionSize: RS };
}

const VERT = /* glsl */`
${AW_PARS}
uniform vec4 uCloud;
#ifdef AW_FAR
uniform sampler2D uMask;
#endif
varying vec3 vCol; varying vec4 vFog; varying vec4 vUv; varying vec3 vLit; varying vec2 vSt;
void main() {
  vec3 p = position;
  #ifdef AW_FAR
    vec2 m = (p.xz + 800.0) / 2048.0; float e = 1.0 / 2048.0;
    float s = texture2D(uMask, m + vec2(e, e)).r * texture2D(uMask, m + vec2(-e, e)).r * texture2D(uMask, m + vec2(e, -e)).r * texture2D(uMask, m + vec2(-e, -e)).r;
    p.y -= s * 14.0;
  #endif
  vLit = awLight(normal, vec3(1.0), normalize(cameraPosition - position), 0.1);
  vCol = color.rgb;
  vSt = vec2(color.a, position.y);
  vUv = vec4(position.xz * 0.131, position.xz * uCloud.x + uCloud.yz);
  vFog = awFog(position);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uNoiseTex; uniform vec4 uCloud; uniform vec3 uStrata[6];
varying vec3 vCol; varying vec4 vFog; varying vec4 vUv; varying vec3 vLit; varying vec2 vSt;
void main() {
  vec4 nz = texture2D(uNoiseTex, vUv.xy);
  float d = nz.g;
  float cl = texture2D(uNoiseTex, vUv.zw).r;
  vec3 alb = vCol;
  if (vSt.x > 0.01) {
    // 地層：高さで色の帯を決める（ノイズで縁をゆらす）
    float hh = (vSt.y + nz.b * 2.4) / 2.7;
    vec3 band = uStrata[int(mod(floor(hh), 6.0))];
    float e = fract(hh);
    band *= 0.86 + 0.14 * smoothstep(0.0, 0.12, e);
    alb = mix(alb, band, vSt.x);
  }
  float dap = 1.0;
  if (vSt.x < -0.01) {
    // 森の床：落ち葉と苔のまだら、木漏れ日
    float fw = -vSt.x;
    float lit = smoothstep(0.55, 0.72, nz.b * 0.55 + nz.g * 0.45);
    alb = mix(alb, vec3(0.2, 0.12, 0.045), lit * 0.55 * fw);
    alb = mix(alb, vec3(0.1, 0.24, 0.06), smoothstep(0.6, 0.75, nz.a) * 0.4 * fw);
    dap = mix(1.0, mix(0.6, 1.42, smoothstep(0.42, 0.6, nz.a * 0.6 + nz.b * 0.4)), fw * uCloud.w * 2.2);
  }
  // 粒の模様：雪や白い砂のような明るい地面では弱く（汚れて見えないように）
  float lum = dot(alb, vec3(0.3, 0.55, 0.15));
  vec3 c = alb * vLit * (1.0 + (d - 0.5) * mix(0.4, 0.14, smoothstep(0.45, 0.8, lum)));
  c *= 1.0 - smoothstep(0.42, 0.6, cl) * uCloud.w;
  c *= dap;
  c = mix(c, vFog.rgb, vFog.a);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function createTerrain(ctx, hf, biomes) {
  const group = new THREE.Group();
  group.name = 'aw-terrain';
  const maskData = new Uint8Array(32 * 32);
  const maskTex = new THREE.DataTexture(maskData, 32, 32, THREE.RedFormat);
  maskTex.minFilter = maskTex.magFilter = THREE.NearestFilter;
  maskTex.needsUpdate = true;

  const uStrata = { value: [0x8f3a34, 0xc8553a, 0xe07a45, 0xf0b070, 0xc8553a, 0xa8443a].map((h) => new THREE.Color(h)) };
  const mk = (far) => new AwMaterial({
    uniforms: sharedUniforms([...FOG_LIGHT_UNIFORMS, 'uNoiseTex', 'uCloud'], Object.assign({ uStrata }, far ? { uMask: { value: maskTex } } : {})),
    defines: far ? { AW_FAR: 1 } : {}, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true,
  });
  const nearMat = mk(false), farMat = mk(true);

  const out = [0, 0, 0, 0];
  // 頂点を格子からほんの少しずらす：カメラが格子点の真上で水平を向くと頂点の w がちょうど 0 になり、
  // ソフトウェア GPU（SwiftShader）で三角形が乱れて描かれるため。高さはずらした位置で読むので面は変わらない
  const EX = 0.0131, EZ = 0.0077;
  function fill(pos, nor, col, vi, x, z, far) {
    x += EX; z += EZ;
    const h = hf.heightAt(x, z);
    const e = far ? 5 : 1.5;
    const gx = hf.heightAt(x + e, z) - hf.heightAt(x - e, z), gz = hf.heightAt(x, z + e) - hf.heightAt(x, z - e);
    const il = 1 / Math.sqrt(gx * gx + gz * gz + 4 * e * e);
    pos[vi] = x; pos[vi + 1] = h; pos[vi + 2] = z;
    nor[vi] = -gx * il; nor[vi + 1] = 2 * e * il; nor[vi + 2] = -gz * il;
    biomes.colorAt(x, z, out, far, true);
    const ci = (vi / 3) * 4;
    col[ci] = out[0]; col[ci + 1] = out[1]; col[ci + 2] = out[2]; col[ci + 3] = out[3];
    return h;
  }
  function gridIndex(n) {
    const idx = new Uint16Array(n * n * 6);
    let q = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      if ((i + j) & 1) { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
      else { idx[q++] = a; idx[q++] = c; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = b; }
    }
    return new THREE.BufferAttribute(idx, 1);
  }

  // ── 遠景（16 m 格子、4 枚）──
  const FN = 50, FS = 16;
  const farIndex = gridIndex(FN);
  for (let q = 0; q < 4; q++) {
    const x0 = -HALF + (q % 2) * 800, z0 = -HALF + (q >> 1) * 800;
    const pos = new Float32Array((FN + 1) * (FN + 1) * 3), nor = new Float32Array(pos.length), col = new Float32Array((FN + 1) * (FN + 1) * 4);
    let vi = 0;
    for (let j = 0; j <= FN; j++) for (let i = 0; i <= FN; i++) { fill(pos, nor, col, vi, x0 + i * FS, z0 + j * FS, true); vi += 3; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    // 深い海の底は描かない（水面が不透明なので見えない）
    const src = farIndex.array, keep = [];
    for (let t3 = 0; t3 < src.length; t3 += 3) {
      const a = src[t3], b = src[t3 + 1], c = src[t3 + 2];
      if (pos[a * 3 + 1] < -7 && pos[b * 3 + 1] < -7 && pos[c * 3 + 1] < -7) continue;
      keep.push(a, b, c);
    }
    g.setIndex(keep);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, farMat);
    m.matrixAutoUpdate = false;
    group.add(m);
  }

  // ── 近景チャンク ──
  const nearIndex = gridIndex(CN);
  const chunks = [];
  for (let i = 0; i < NCH; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CV * CV * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(CV * CV * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CV * CV * 4), 4));
    g.setIndex(nearIndex);
    g.boundingSphere = new THREE.Sphere();
    const m = new THREE.Mesh(g, nearMat);
    m.matrixAutoUpdate = false; m.visible = false;
    group.add(m);
    chunks.push({ mesh: m, geo: g, cx: -999, cz: -999, ready: false, want: false });
  }
  function buildChunk(c) {
    const pos = c.geo.attributes.position.array, nor = c.geo.attributes.normal.array, col = c.geo.attributes.color.array;
    const x0 = -HALF + c.cx * CH, z0 = -HALF + c.cz * CH;
    let vi = 0, mn = 1e9, mx = -1e9;
    for (let j = 0; j <= CN; j++) for (let i = 0; i <= CN; i++) {
      const h = fill(pos, nor, col, vi, x0 + i * 2, z0 + j * 2, false);
      if (h < mn) mn = h; if (h > mx) mx = h;
      vi += 3;
    }
    c.geo.attributes.position.needsUpdate = true; c.geo.attributes.normal.needsUpdate = true; c.geo.attributes.color.needsUpdate = true;
    c.geo.boundingSphere.center.set(x0 + CH / 2, (mn + mx) / 2, z0 + CH / 2);
    c.geo.boundingSphere.radius = Math.hypot(CH * 0.7072, (mx - mn) / 2);
    c.mesh.visible = true; c.ready = true;
    maskData[c.cz * 32 + c.cx] = 255; maskTex.needsUpdate = true;
  }
  let lastCx = -999, lastCz = -999;
  const queue = [];
  function update(px, pz, all) {
    const ccx = Math.floor((px + HALF) / CH), ccz = Math.floor((pz + HALF) / CH);
    if (ccx !== lastCx || ccz !== lastCz) {
      lastCx = ccx; lastCz = ccz;
      const free = [];
      for (const c of chunks) {
        c.want = Math.abs(c.cx - ccx) <= RAD && Math.abs(c.cz - ccz) <= RAD && c.cx >= 0;
        if (!c.want) {
          if (c.ready) { maskData[c.cz * 32 + c.cx] = 0; maskTex.needsUpdate = true; }
          c.ready = false; c.mesh.visible = false; c.cx = -999; free.push(c);
        }
      }
      queue.length = 0;
      for (let dz = -RAD; dz <= RAD; dz++) for (let dx = -RAD; dx <= RAD; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < 0 || cz < 0 || cx > 24 || cz > 24) continue;
        let found = false;
        for (const c of chunks) if (c.cx === cx && c.cz === cz) { found = true; if (!c.ready) queue.push(c); break; }
        if (found) continue;
        const c = free.pop();
        if (!c) continue;
        c.cx = cx; c.cz = cz; queue.push(c);
      }
      const cxw = px, czw = pz;
      queue.sort((a, b) => Math.hypot(-HALF + (b.cx + 0.5) * CH - cxw, -HALF + (b.cz + 0.5) * CH - czw) - Math.hypot(-HALF + (a.cx + 0.5) * CH - cxw, -HALF + (a.cz + 0.5) * CH - czw));
    }
    let n = all ? 99 : 1;
    while (queue.length && n-- > 0) buildChunk(queue.pop());
  }
  return { group, update, nearMat, farMat };
}
