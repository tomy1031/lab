// js/world/heightfield.js — FABLE
// ユラ島の高さ場（801×801、2 m 格子）と、そこから引ける O(1) の問い合わせ。three.js に依存しない。
import {
  GRID_N as N, CELL, HALF, LAKE_LEVEL, LAKE_C, LAKE_SHORE_R, LAKE_REGION_R, ICE_LEVEL,
  LANDMARKS, LM, RIVER, PATHS, HILLS, PEAKS, MESA_BIAS, COAST_R, COVES,
} from './layout.js';
import { makeNoise, smoothstep, clamp } from './noise.js';

const M = 201, MC = 8;                 // 粗い格子（8 m）
const RAD2DEG = 180 / Math.PI;
export const REGIONS = ['meadow', 'forest', 'canyon', 'peaks', 'lake', 'coast', 'sea'];
const RC = [180, 275, 85, 0], RH = [55, 40, 40, 45];   // 地域の中心方位と半幅（meadow, forest, canyon, peaks）

export function buildHeightfield(seed = 7) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const nm = makeNoise(1337);          // 大きな形（種によらない）
  const ns = makeNoise(seed * 7919 + 13);   // 細かいゆらぎ（種で変わる）

  // ── 解析的な場 ──
  function coastRadius(bDeg) {
    const f = (((bDeg % 360) + 360) % 360) / 22.5;
    const i = Math.floor(f), t = f - i;
    const a = COAST_R[i % 16], b = COAST_R[(i + 1) % 16];
    const u = t * t * (3 - 2 * t);
    return a + (b - a) * u;
  }
  function coastD(x, z) {
    const r = Math.hypot(x, z);
    const b = Math.atan2(x, -z) * RAD2DEG;
    let d = coastRadius(b) - r + (nm.fbm(x / 150 + 9.3, z / 150 + 4.1, 3) - 0.5) * 60;
    for (let i = 0; i < COVES.length; i++) {
      const c = COVES[i], dx = x - c[0], dz = z - c[1];
      d -= c[2] * Math.exp(-(dx * dx + dz * dz) / (2 * c[3] * c[3]));
    }
    return d;
  }
  const _w = [0, 0, 0, 0];
  // 地域の重み（meadow, forest, canyon, peaks）。戻り値は湖の中心からの距離
  function regionWeights(x, z, out) {
    const dx = x - LAKE_C.x, dz = z - LAKE_C.z;
    const dC = Math.hypot(dx, dz);
    let b = Math.atan2(dx, -dz) * RAD2DEG;
    const dd = Math.max(dC, 70);
    b += ((nm.n2(x / 95 + 3.7, z / 95 + 8.2) - 0.5) * 2 * 25 / dd) * RAD2DEG;
    const s = (30 / dd) * RAD2DEG;
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      let a = Math.abs(((b - RC[i] + 540) % 360 + 360) % 360 - 180);
      const w = smoothstep(RH[i] + s, RH[i] - s, a) + 1e-4;
      out[i] = w; sum += w;
    }
    for (let i = 0; i < 4; i++) out[i] /= sum;
    return dC;
  }

  // ── 粗い格子に大きな形を作る ──
  const cBase = new Float32Array(M * M), cMesa = new Float32Array(M * M), cCoast = new Float32Array(M * M),
    cCliff = new Float32Array(M * M), cRidge = new Float32Array(M * M),
    cW = [new Float32Array(M * M), new Float32Array(M * M), new Float32Array(M * M), new Float32Array(M * M)];
  for (let j = 0; j < M; j++) {
    const z = -HALF + j * MC;
    for (let i = 0; i < M; i++) {
      const x = -HALF + i * MC, k = j * M + i;
      const dC = regionWeights(x, z, _w);
      const wM = _w[0], wF = _w[1], wC = _w[2], wP = _w[3];
      cW[0][k] = wM; cW[1][k] = wF; cW[2][k] = wC; cW[3][k] = wP;
      const n1 = nm.fbm(x / 260 + 1.3, z / 260 + 5.9, 3), n2 = nm.fbm(x / 120 + 7.7, z / 120 + 3.1, 3);
      let h = wM * (21 + (n1 - 0.5) * 10 + (n2 - 0.5) * 6)
        + wF * (36 + (n1 - 0.5) * 14 + (n2 - 0.5) * 9)
        + wC * (34 + (n1 - 0.5) * 5)
        + wP * (46 + Math.max(0, dC - 230) * 0.17 + (n2 - 0.5) * 10);
      for (let q = 0; q < HILLS.length; q++) {
        const g = HILLS[q], ddx = x - g[0], ddz = z - g[1];
        const e = (ddx * ddx + ddz * ddz) / (2 * g[3] * g[3]);
        if (e < 8) h += g[2] * Math.exp(-e);
      }
      let ridge = wP * clamp((dC - 270) / 130, 0, 1) * 9;
      for (let q = 0; q < PEAKS.length; q++) {
        const p = PEAKS[q], d = Math.hypot(x - p[0], z - p[1]) / p[3];
        if (d < 1) { const c = Math.pow(1 - d, 1.55); h += p[2] * c; ridge += p[2] * 0.2 * Math.sqrt(c); }
      }
      cBase[k] = h; cRidge[k] = ridge;
      let mf = nm.fbm(x / 170 + 31.4, z / 170 + 17.2, 3);
      for (let q = 0; q < MESA_BIAS.length; q++) {
        const g = MESA_BIAS[q], ddx = x - g[0], ddz = z - g[1];
        mf += g[2] * Math.exp(-(ddx * ddx + ddz * ddz) / (2 * g[3] * g[3]));
      }
      cMesa[k] = mf;
      cCoast[k] = coastD(x, z);
      let cl = nm.fbm(x / 300 + 50.5, z / 300 + 2.2, 2) * 2.4 - 0.75 + wP * 0.7;
      cl += 1.2 * Math.exp(-((x - 480) ** 2 + (z - 500) ** 2) / (2 * 130 * 130));
      cl -= 2.0 * Math.exp(-((x + 480) ** 2 + (z - 400) ** 2) / (2 * 110 * 110));
      cl += 0.7 * Math.exp(-(x * x + (z - 650) ** 2) / (2 * 90 * 90));
      cCliff[k] = clamp(cl, 0, 1);
    }
  }
  function coarse(arr, x, z) {
    let gx = (x + HALF) / MC, gz = (z + HALF) / MC;
    gx = gx < 0 ? 0 : gx > M - 1.001 ? M - 1.001 : gx; gz = gz < 0 ? 0 : gz > M - 1.001 ? M - 1.001 : gz;
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, k = iz * M + ix;
    const a = arr[k], b = arr[k + 1], c = arr[k + M], d = arr[k + M + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  const tCoarse = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  // ── 細かい格子 ──
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * CELL;
    const gz = j / 4, iz = Math.min(gz | 0, M - 2), fz = gz - iz;
    for (let i = 0; i < N; i++) {
      const x = -HALF + i * CELL;
      const gx = i / 4, ix = Math.min(gx | 0, M - 2), fx = gx - ix, k = iz * M + ix;
      const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
      const dCo = cCoast[k] * w00 + cCoast[k + 1] * w10 + cCoast[k + M] * w01 + cCoast[k + M + 1] * w11;
      if (dCo < -260) { H[j * N + i] = -30; continue; }
      const bl = (a) => a[k] * w00 + a[k + 1] * w10 + a[k + M] * w01 + a[k + M + 1] * w11;
      let h = bl(cBase);
      const wM = bl(cW[0]), wF = bl(cW[1]), wC = bl(cW[2]), wP = bl(cW[3]);
      const fine = ns.fbm(x / 38, z / 38, 3) - 0.5;
      // 峡谷の台地
      let mesaTop = 0;
      if (wC > 0.02) {
        const mf = bl(cMesa) + fine * 0.09 + (ns.n2(x / 9, z / 9) - 0.5) * 0.02;
        const m1 = smoothstep(0.52, 0.54, mf), m2 = smoothstep(0.66, 0.68, mf);
        h += wC * (m1 * 20 + m2 * 17);
        mesaTop = wC * Math.max(m1 * (1 - m1), m2 * (1 - m2)) * 4;
      }
      h += fine * 2 * (wM * 2.2 + wF * 3.2 + wC * 1.5 + wP * 3.6);
      const rg = bl(cRidge);
      if (rg > 0.05) {
        const r1 = 1 - Math.abs(2 * ns.n2(x / 74 + 3.3, z / 74 + 1.7) - 1), r2 = 1 - Math.abs(2 * ns.n2(x / 29 + 8.1, z / 29 + 5.5) - 1);
        h += rg * (r1 * r1 * 0.75 + r2 * 0.3 - 0.4);
      }
      // 湖
      const dx = x - LAKE_C.x, dz = z - LAKE_C.z, dC = Math.hypot(dx, dz);
      if (dC < 290) {
        const dCw = dC + (ns.n2(x / 40 + 2.2, z / 40 + 6.6) - 0.5) * 16;
        const t = LAKE_SHORE_R - dCw;
        const prof = t <= 0 ? LAKE_LEVEL + 0.3 - t * 0.05 : LAKE_LEVEL + 0.3 - Math.min(10, 0.105 * t + 0.0005 * t * t);
        const wl = smoothstep(266, 214, dCw);
        h = h + (prof - h) * wl;
        if (dC < 80) h = h + (27 + fine * 0.8 - h) * smoothstep(74, 43, dC);
      }
      // 海岸
      const d = dCo > 220 ? dCo : dCo + (ns.n2(x / 26 + 1.1, z / 26 + 9.9) - 0.5) * 10;
      const cliff = bl(cCliff);
      if (d > 0) {
        const bw = 150 - 124 * cliff;
        if (d < bw) {
          const t = d / bw; let s = t * t * (3 - 2 * t); s = Math.pow(s, 1.2 + cliff * 0.6);
          const hc = d * 0.09;
          h = hc + (Math.max(h, hc) - hc) * s;
        }
      } else {
        const nd = -d;
        h = -(nd * 0.055 + smoothstep(0, 220, nd) * 16) * (1 + cliff * 0.8);
        if (h < -30) h = -30;
      }
      H[j * N + i] = h;
    }
  }

  const tFine = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  function heightAt(x, z) {
    let gx = (x + HALF) * 0.5, gz = (z + HALF) * 0.5;
    gx = gx < 0 ? 0 : gx > N - 1.0001 ? N - 1.0001 : gx; gz = gz < 0 ? 0 : gz > N - 1.0001 ? N - 1.0001 : gz;
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, k = iz * N + ix;
    const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  // ── ランドマークのまわりをならす ──
  function flatten(cx, cz, r, target, feather) {
    const R = r + feather;
    const i0 = Math.max(0, Math.floor((cx - R + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((cx + R + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((cz - R + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((cz + R + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(-HALF + i * CELL - cx, -HALF + j * CELL - cz);
      if (d >= R) continue;
      const w = smoothstep(R, r, d), k = j * N + i;
      H[k] += (target - H[k]) * w;
    }
  }
  for (const l of LANDMARKS) {
    if (!l.r || l.id === 'isle') continue;
    flatten(l.x, l.z, l.r, l.h, l.r * 1.7 + 8);
  }
  flatten(-420, 220, 4, heightAt(-420, 220), 6);

  // ── 道と川：折れ線をなぞって地形を彫る ──
  function resample(pts, step, closed) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(len / step));
      for (let q = 0; q < m; q++) out.push([a[0] + (b[0] - a[0]) * q / m, a[1] + (b[1] - a[1]) * q / m]);
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }
  // Chaikin で角を丸める
  function roundCorners(pts, closed) {
    if (closed) return pts;
    let p = pts;
    for (let it = 0; it < 2; it++) {
      const q = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        if (i > 0) q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        if (i < p.length - 2) q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      q.push(p[p.length - 1]);
      p = q;
    }
    return p;
  }
  const sd = new Float32Array(N * N).fill(99), sh = new Float32Array(N * N);
  const pathD = new Float32Array(N * N).fill(99);
  const bb = { i0: 0, i1: -1, j0: 0, j1: -1 };
  // 折れ線からの距離 sd と、いちばん近い点の高さ sh を格納する（触れた範囲 bb だけ）
  function stamp(samples, prof, reach, closed) {
    for (let j = bb.j0; j <= bb.j1; j++) sd.fill(99, j * N + bb.i0, j * N + bb.i1 + 1);
    bb.i0 = N; bb.i1 = -1; bb.j0 = N; bb.j1 = -1;
    const n = samples.length, segs = closed ? n : n - 1;
    for (let s = 0; s < segs; s++) {
      const a = samples[s], b = samples[(s + 1) % n], ha = prof[s], hb = prof[(s + 1) % n];
      const minx = Math.min(a[0], b[0]) - reach, maxx = Math.max(a[0], b[0]) + reach;
      const minz = Math.min(a[1], b[1]) - reach, maxz = Math.max(a[1], b[1]) + reach;
      const i0 = Math.max(0, Math.floor((minx + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((maxx + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((minz + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((maxz + HALF) / CELL));
      if (i0 < bb.i0) bb.i0 = i0; if (i1 > bb.i1) bb.i1 = i1; if (j0 < bb.j0) bb.j0 = j0; if (j1 > bb.j1) bb.j1 = j1;
      const ex = b[0] - a[0], ez = b[1] - a[1], el = ex * ex + ez * ez || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = -HALF + i * CELL - a[0], pz = -HALF + j * CELL - a[1];
        let t = (px * ex + pz * ez) / el; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - ex * t, dz = pz - ez * t, d2 = dx * dx + dz * dz, k = j * N + i;
        if (d2 < sd[k] * sd[k]) { sd[k] = Math.sqrt(d2); sh[k] = ha + (hb - ha) * t; }
      }
    }
  }
  const pathLines = [];
  for (const p of PATHS) {
    const samples = resample(roundCorners(p.pts, p.closed), 4, p.closed);
    const n = samples.length;
    const prof = new Float32Array(n), pin = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      prof[i] = heightAt(samples[i][0], samples[i][1]);
      for (const l of LANDMARKS) if (l.r && Math.hypot(samples[i][0] - l.x, samples[i][1] - l.z) < l.r + 1) pin[i] = 1;
    }
    if (!p.closed) { pin[0] = 1; pin[n - 1] = 1; }
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < n; i++) {
        if (pin[i]) continue;
        const a = prof[(i - 1 + n) % n], b = prof[(i + 1) % n];
        prof[i] = prof[i] * 0.4 + (a + b) * 0.3;
      }
    }
    // まだ急な区間は、両端を結ぶ直線へ寄せる（必ず歩ける坂になる）
    if (!p.closed) {
      let a = 0;
      for (let b = 1; b < n; b++) {
        if (!pin[b]) continue;
        if (b - a > 1) {
          for (let it = 0; it < 12; it++) {
            let maxG = 0;
            for (let i = a; i < b; i++) maxG = Math.max(maxG, Math.abs(prof[i + 1] - prof[i]) / 4);
            if (maxG < 0.25) break;
            for (let i = a + 1; i < b; i++) {
              const lin = prof[a] + (prof[b] - prof[a]) * (i - a) / (b - a);
              prof[i] += (lin - prof[i]) * 0.35;
            }
          }
        }
        a = b;
      }
    }
    stamp(samples, prof, 15, p.closed);
    for (let j = bb.j0; j <= bb.j1; j++) for (let i = bb.i0; i <= bb.i1; i++) {
      const k = j * N + i, d = sd[k];
      if (d >= 15) continue;
      H[k] += (sh[k] - H[k]) * smoothstep(15, 3.4, d);
      if (d < pathD[k]) pathD[k] = d;
    }
    pathLines.push({ id: p.id, closed: !!p.closed, samples, prof });
  }
  // 桟橋の道は水ぎわまで
  // 川
  const riverS = resample(roundCorners(RIVER, false), 4, false);
  const riverBed = new Float32Array(riverS.length);
  {
    const n = riverS.length;
    const terr = new Float32Array(n);
    for (let i = 0; i < n; i++) terr[i] = heightAt(riverS[i][0], riverS[i][1]);
    let prev = LAKE_LEVEL - 0.5;
    for (let i = 0; i < n; i++) {
      const lin = (LAKE_LEVEL - 0.5) + (-0.9 - (LAKE_LEVEL - 0.5)) * (i / (n - 1));
      // 地形が下がっているところは川床も早めに下げる（深い谷を掘らない）
      let b = Math.min(prev, Math.max(lin - 6, Math.min(lin + 2.5, terr[i] - 1.0)));
      if (i > n - 12) b = Math.min(b, -0.5 - (i - (n - 12)) * 0.05);
      riverBed[i] = b; prev = b - 0.012;
    }
    for (let it = 0; it < 20; it++) for (let i = 1; i < n - 1; i++) riverBed[i] = riverBed[i] * 0.5 + (riverBed[i - 1] + riverBed[i + 1]) * 0.25;
    for (let i = 1; i < n; i++) if (riverBed[i] > riverBed[i - 1] - 0.004) riverBed[i] = riverBed[i - 1] - 0.004;
  }
  const waterLvl = new Float32Array(N * N).fill(-1e9);
  stamp(riverS, riverBed, 30, false);
  for (let j = bb.j0; j <= bb.j1; j++) for (let i = bb.i0; i <= bb.i1; i++) {
    const k = j * N + i, d = sd[k];
    if (d >= 30) continue;
    const bed = sh[k] + smoothstep(0, 4.5, d) * 0.12 - 0.12;
    if (H[k] > bed) H[k] = bed + (H[k] - bed) * smoothstep(4.2, 28, d);
    if (sh[k] > -0.2) {   // 岸が水面より低いところは土手を盛る
      const lev = sh[k] + 0.52 + 0.7 * smoothstep(4.5, 8, d);
      const minH = d < 4.5 ? -1e9 : lev * 1 - smoothstep(16, 30, d) * 40;
      if (H[k] < minH) H[k] = minH;
    }
    if (d < 11 && bed > -0.4) waterLvl[k] = sh[k] + 0.42;
    if (d < 5 && pathD[k] < 4) pathD[k] = 99;   // 浅瀬では石畳が切れる
  }
  // 氷鏡はすこしへこんだ平ら
  flatten(LM.ice_mirror.x, LM.ice_mirror.z, 34, ICE_LEVEL - 0.05, 4);

  // 石舞台・鐘塔・祠の敷石：道と同じ扱い（草が生えない、足音は石）
  for (const l of LANDMARKS) {
    const r = l.id === 'start' ? 8.6 : l.kind === 'tower' ? 7.3 : l.kind === 'shrine' ? 5.1 : 0;
    if (!r) continue;
    const R = r + 12;
    const i0 = Math.max(0, Math.floor((l.x - R + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((l.x + R + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((l.z - R + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((l.z + R + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.max(0, Math.hypot(-HALF + i * CELL - l.x, -HALF + j * CELL - l.z) - r), k = j * N + i;
      if (d < pathD[k]) pathD[k] = d;
    }
  }
  const pathDist = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) pathDist[k] = Math.min(255, pathD[k] * 16);

  // ── 問い合わせ ──
  function pathDistAt(x, z) {
    let gx = (x + HALF) * 0.5, gz = (z + HALF) * 0.5;
    gx = gx < 0 ? 0 : gx > N - 1.0001 ? N - 1.0001 : gx; gz = gz < 0 ? 0 : gz > N - 1.0001 ? N - 1.0001 : gz;
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, k = iz * N + ix;
    const a = pathDist[k], b = pathDist[k + 1], c = pathDist[k + N], d = pathDist[k + N + 1];
    return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) / 16;
  }
  function pathAt(x, z) { return smoothstep(3.1, 1.9, pathDistAt(x, z)); }
  // 勾配（dh/dx, dh/dz）→ 法線の y 成分
  function normalY(x, z) {
    const hx = heightAt(x + 1, z) - heightAt(x - 1, z), hz = heightAt(x, z + 1) - heightAt(x, z - 1);
    return 2 / Math.sqrt(hx * hx + hz * hz + 4);
  }
  function slopeAt(x, z) { return Math.acos(Math.min(1, normalY(x, z))); }
  function inLake(x, z) { const dx = x - LAKE_C.x, dz = z - LAKE_C.z; return dx * dx + dz * dz < 205 * 205; }
  function waterLevelAt(x, z) {
    const h = heightAt(x, z);
    if (inLake(x, z)) { if (h < LAKE_LEVEL) return LAKE_LEVEL; }
    else if (h < 0) return 0;
    let gx = Math.round((x + HALF) * 0.5), gz = Math.round((z + HALF) * 0.5);
    if (gx < 0 || gz < 0 || gx >= N || gz >= N) return h < 0 ? 0 : -Infinity;
    const w = waterLvl[gz * N + gx];
    if (w > -1e8) return w;
    return -Infinity;
  }
  function waterDepthAt(x, z) {
    const w = waterLevelAt(x, z);
    if (w === -Infinity) return 0;
    const d = w - heightAt(x, z);
    return d > 0 ? d : 0;
  }
  function coastDAt(x, z) { return coarse(cCoast, x, z); }
  function weightsAt(x, z, out) {
    out[0] = coarse(cW[0], x, z); out[1] = coarse(cW[1], x, z); out[2] = coarse(cW[2], x, z); out[3] = coarse(cW[3], x, z);
    return out;
  }
  const _rw = [0, 0, 0, 0];
  function regionAt(x, z) {
    const h = heightAt(x, z);
    const dx = x - LAKE_C.x, dz = z - LAKE_C.z, dC = Math.hypot(dx, dz);
    if (dC < LAKE_REGION_R + (nm.n2(x / 95 + 3.7, z / 95 + 8.2) - 0.5) * 30) return 'lake';
    if (h < 0) return 'sea';
    if (x > 330 && z > 380) return 'coast';
    if (h < 7 && coastDAt(x, z) < 70) return 'coast';
    weightsAt(x, z, _rw);
    let best = 0;
    for (let i = 1; i < 4; i++) if (_rw[i] > _rw[best]) best = i;
    return REGIONS[best];
  }
  function inIce(x, z) { return Math.hypot(x - LM.ice_mirror.x, z - LM.ice_mirror.z) < 33; }
  function surfaceAt(x, z) {
    if (waterDepthAt(x, z) > 0.05) return 'water';
    if (inIce(x, z)) return 'ice';
    if (pathDistAt(x, z) < 2.4) return 'stone';
    const h = heightAt(x, z), ny = normalY(x, z);
    const dC = Math.hypot(x - LAKE_C.x, z - LAKE_C.z);
    if (dC < 206 && h < 26.2) return 'sand';
    const cd = coastDAt(x, z);
    if (cd < 45 && h < 4.2) return 'sand';
    weightsAt(x, z, _rw);
    if (ny < 0.74) return 'rock';
    if (_rw[3] > 0.5) return h > 50 ? 'snow' : 'grass';
    if (_rw[2] > 0.5) return 'sand';
    if (_rw[1] > 0.5) return 'dirt';
    return 'grass';
  }

  const buildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    N, H, pathDist, waterLvl, pathLines, riverS, riverBed, buildMs, tCoarse, tFine, nm, ns,
    heightAt, normalY, slopeAt, pathAt, pathDistAt, waterLevelAt, waterDepthAt, regionAt, surfaceAt,
    weightsAt, coastDAt, inLake, inIce, flattenLate: flatten,
  };
}
