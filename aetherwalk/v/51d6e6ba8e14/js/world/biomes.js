// js/world/biomes.js — FABLE
// 地面の色（§7.3）。地域の重み・高さ・斜面・道・くぼみから 1 点の色（リニア RGB）と草の密度を決める。three.js に依存しない。
import { LAKE_C, LAKE_LEVEL } from './layout.js';
import { smoothstep, clamp } from './noise.js';

const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const rgb = (hex) => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const mix3 = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

const P = {
  // 草原：彩度を抑えた自然な緑。深い緑（くぼみ・クローバー）→ 日なたの黄緑 → 乾いた丘の頂（麦わら色）
  grassA: rgb(0x4c8139), grassB: rgb(0x6a8f44), grassDeep: rgb(0x3d7036), grassDry: rgb(0x9a9654), rockM: rgb(0x9a9484),
  mossA: rgb(0x2f6b3e), mossB: rgb(0x4c9048), rockF: rgb(0x55584c), litter: rgb(0x6a5230), soil: rgb(0x3a3324),
  sandC: rgb(0xe8b27a), sandC2: rgb(0xd99d68), dryC: rgb(0xd9b85a),
  strata: [rgb(0x8f3a34), rgb(0xc8553a), rgb(0xe07a45), rgb(0xf0b070), rgb(0xc8553a), rgb(0xa8443a), rgb(0xe07a45)],
  snow: rgb(0xf4f8ff), snowSh: rgb(0xb9cdea), rockP: rgb(0x5d6a82), rockP2: rgb(0x48536c), alpine: rgb(0x6c9a70),
  sandL: rgb(0xe9dcb5), sandB: rgb(0xf2e3bd), coastGrass: rgb(0x8fbf6a), chalk: rgb(0xf3efe4), chalk2: rgb(0xd9d2c0),
  flW: rgb(0xfff4e0), flY: rgb(0xffd84d), flP: rgb(0xff9fc0), flB: rgb(0xa8d4ff),
  isle: rgb(0x7f9f86), path: rgb(0xcbbb95), pathP: rgb(0xc9cedb), bedL: rgb(0x6f9c8e), bedS: rgb(0xc8d8b0), deep: rgb(0x1c4f6a),
};

export function createBiomes(hf) {
  const w = [0, 0, 0, 0];
  const cM = [0, 0, 0], cF = [0, 0, 0], cC = [0, 0, 0], cP = [0, 0, 0], t = [0, 0, 0], t2 = [0, 0, 0];
  const { nm, ns } = hf;

  // out[0..2] = rgb、out[3] = 地層(+)/森の床(-)、戻り値 = 草の密度 0..1。far = 遠景用（道を太く薄く）
  // terrain = 地形の頂点用：道の色は混ぜず（画素で縁を崩して塗る）、out[4] = 草原の細部の重み、out[5] = 道の重み、out[6] = 道の雪
  function colorAt(x, z, out, far, terrain) {
    const h = hf.heightAt(x, z);
    const e = far ? 6 : 2;
    const hE = hf.heightAt(x + e, z), hW = hf.heightAt(x - e, z), hS = hf.heightAt(x, z + e), hN = hf.heightAt(x, z - e);
    const gx = hE - hW, gz = hS - hN;
    const ny = (2 * e) / Math.sqrt(gx * gx + gz * gz + 4 * e * e);
    hf.weightsAt(x, z, w);
    const n = ns.n2(x / 13 + 4.4, z / 13 + 7.1), n2 = nm.fbm(x / 64 + 11.2, z / 64 + 3.3, 2);
    const steep = smoothstep(0.82, 0.64, ny);
    let dens = 0, strata = 0;

    // 草原：大きなむら（64 m）・中くらいのむら（18 m の深い緑）・丘の頂の乾き（凸なほど）・高いところの麦わら色
    const cavM = (hE + hW + hS + hN) * 0.25 - h;
    mix3(cM, P.grassA, P.grassB, smoothstep(0.35, 0.7, n2));
    mix3(cM, cM, P.grassDeep, smoothstep(0.45, 0.78, ns.n2(x / 18 + 1.3, z / 18 + 8.8)) * 0.4 + clamp(cavM * 0.5, 0, 0.3));
    mix3(cM, cM, P.grassDry, clamp(smoothstep(30, 46, h) * 0.38 * n + clamp(-cavM * 0.35, 0, 0.22), 0, 0.55));
    mix3(cM, cM, P.rockM, steep);
    let grassy = w[0] * (1 - steep);
    // 森
    // 苔の緑 → 落ち葉の茶 → 暗い土。大きなむら（n2）と小さなむら（n）で混ぜる
    mix3(cF, P.mossA, P.mossB, smoothstep(0.3, 0.75, n2) * 0.8);
    const litter = smoothstep(0.52, 0.74, n2 * 0.6 + n * 0.4) * w[1];
    mix3(cF, cF, P.litter, litter * 0.7);
    mix3(cF, cF, P.soil, smoothstep(0.7, 0.9, n) * 0.35);
    mix3(cF, cF, P.rockF, steep);
    // 峡谷
    let mesaTop = 0;
    if (w[2] > 0.01) {
      mix3(cC, P.sandC, P.sandC2, n2);
      mesaTop = smoothstep(48, 53, h) * (1 - steep);
      mix3(cC, cC, P.dryC, mesaTop * (0.35 + 0.4 * n));
      strata = w[2] * smoothstep(0.93, 0.78, ny);
    }
    // 峰
    let snow = 0;
    if (w[3] > 0.01) {
      const line = 49 + n2 * 9;
      snow = smoothstep(line - 3, line + 4, h) * smoothstep(0.55, 0.76, ny);
      mix3(cP, P.rockP, P.rockP2, n);
      mix3(t, P.alpine, cP, clamp(steep + smoothstep(line - 9, line + 2, h) * 0.6, 0, 1));
      mix3(cP, t, P.snow, snow);
    }
    out[0] = cM[0] * w[0] + cF[0] * w[1] + cC[0] * w[2] + cP[0] * w[3];
    out[1] = cM[1] * w[0] + cF[1] * w[1] + cC[1] * w[2] + cP[1] * w[3];
    out[2] = cM[2] * w[0] + cF[2] * w[1] + cC[2] * w[2] + cP[2] * w[3];
    // 峡谷の谷底にもまばらな枯れ草（かたまりで）
    const dry = w[2] * (mesaTop * 0.4 + (1 - mesaTop) * (0.12 + 0.26 * smoothstep(0.4, 0.6, n2)));
    dens = (w[0] + w[1] * (0.72 - 0.5 * litter) + dry + w[3] * (1 - smoothstep(0.05, 0.3, snow)) * 0.55 * smoothstep(60, 50, h)) * (1 - steep);
    const snowW = w[3] * snow;

    // 湖の岸
    const dC = Math.hypot(x - LAKE_C.x, z - LAKE_C.z);
    if (dC < 262) {
      const s = smoothstep(26.4 + n * 0.8, 25.2, h) * smoothstep(236, 214, dC);
      mix3(out, out, P.sandL, s); dens *= 1 - s; grassy *= 1 - s;
      if (h < LAKE_LEVEL && dC < 206) { mix3(out, out, P.bedL, smoothstep(0, 2.5, LAKE_LEVEL - h)); mix3(out, out, P.deep, smoothstep(2, 8, LAKE_LEVEL - h) * 0.7); dens = 0; }
    }
    // 凪の小島：灰がかった苔
    if (dC < 82 && h > LAKE_LEVEL) { mix3(out, out, P.isle, smoothstep(80, 62, dC) * (0.75 + 0.25 * n)); dens = Math.max(dens, 0.5) * (1 - smoothstep(12, 8, dC)); }
    // 浜と白い崖
    const cd = hf.coastDAt(x, z);
    if (cd < 170) {
      const cape = x > 300 && z > 350 ? 1 : 0;
      const near = smoothstep(170, 90, cd);
      mix3(out, out, P.coastGrass, near * 0.55 * (1 - steep) * (1 - snowW) * (1 - w[2] * 0.8));
      const cliffW = Math.max(near * (1 - w[2]) * (1 - w[3] * 0.6), cape);
      mix3(t, P.chalk, P.chalk2, n * 0.8 + (Math.floor(h / 2.4) % 2) * 0.2);
      mix3(out, out, t, steep * cliffW);
      const beach = smoothstep(4.6 + n * 1.2, 2.6, h) * smoothstep(150, 90, cd);
      mix3(out, out, P.sandB, beach); dens *= 1 - beach; grassy *= 1 - beach;
      if (h < 0.3) { mix3(out, out, P.bedS, smoothstep(0.3, -1.5, h) * 0.6); mix3(out, out, P.deep, smoothstep(-2, -10, h) * 0.8); dens = 0; }
    }
    // 川床
    if (hf.waterDepthAt(x, z) > 0.02 && dC > 180 && h > 0) { mix3(out, out, P.bedL, 0.55); dens = 0; grassy = 0; }
    // 道
    const pd = hf.pathDistAt(x, z);
    let pathW = 0;
    if (pd < 14) {
      pathW = far ? smoothstep(11, 2, pd) * 0.6 : smoothstep(3.4, 1.5, pd);
      if (!terrain) {
        mix3(t2, P.path, P.pathP, snowW);
        const k = 0.9 + 0.2 * ns.n2(x / 1.7, z / 1.7);
        t2[0] *= k; t2[1] *= k; t2[2] *= k;
        mix3(out, out, t2, pathW);
      }
      dens *= smoothstep(2.4, 4.6, pd);
    }
    if (terrain) {
      out[4] = clamp(grassy, 0, 1); out[5] = pathW; out[6] = snowW;
      // 近景だけ：3〜5 m の草むらのむら（明るい日なたの株 ↔ 深い株）。遠くから草の毛並みが続いて見える
      if (!far && grassy > 0.05) {
        const m = (ns.n2(x / 3.3 + 17.1, z / 3.3 + 4.9) - 0.5) * 2 * grassy, k = 1 + 0.1 * m;
        out[0] *= k * (1 + 0.06 * m); out[1] *= k; out[2] *= k * (1 - 0.1 * m);
      }
    }
    // くぼみの陰（雪は青く沈む）
    const cav = (hE + hW + hS + hN) * 0.25 - h;
    const ao = clamp(1 - cav * (far ? 0.05 : 0.28), 0.62, 1.1) * (0.94 + 0.12 * n);
    if (snowW > 0.3) { const d = clamp((1 - ao) * 2.2, 0, 1); mix3(out, out, P.snowSh, d * snowW); } else { out[0] *= ao; out[1] *= ao; out[2] *= ao; }
    out[3] = strata > 0.005 ? strata * (pd < 3 ? 0.3 : 1) : -w[1] * (1 - steep) * smoothstep(1.6, 3.6, pd);   // 正 = 地層、負 = 森の床（木漏れ日）
    return dens < 0 ? 0 : dens > 1 ? 1 : dens;
  }
  return { colorAt, P };
}
