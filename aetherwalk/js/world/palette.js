// js/world/palette.js — FABLE
// 時間帯の色（§7.2 のキーフレーム）と地域の空気（§7.3）。値はすべてリニア色空間で補間する。
import * as THREE from 'three';
import { U } from './art.js';

const C = (hex) => new THREE.Color(hex);
// t(時), 天頂, 地平, 光, 霧, 半球(空), 半球(地), 強さ, 帯の量, 霧の見通し D(m), 雲の明部, 雲の陰
const K = [
  [4.4, 0x070b24, 0x1b2a55, 0xa9c4ff, 0x16234a, 0x3a4c8f, 0x141a33, 0.35, 0.0, 520, 0x3a4a7a, 0x10162e],
  [5.5, 0x3b4a8c, 0xffb38a, 0xffc9a0, 0xe8b7a8, 0x9aa6d8, 0x6b5a66, 0.9, 0.55, 440, 0xffc4b0, 0x6f6a9a],
  [8.0, 0x3f8fe0, 0xcfeaf5, 0xfff1d6, 0xcfe6ee, 0xbfe0ff, 0x7d8a5c, 1.1, 0.0, 520, 0xffffff, 0xa9c0dc],
  [12.0, 0x2f7fe6, 0xbfe3f7, 0xfffaf0, 0xc5e2f2, 0xcfe8ff, 0x8a9466, 1.2, 0.0, 580, 0xffffff, 0xa6c2e2],
  [17.0, 0x4a79c9, 0xffd9a0, 0xffc56e, 0xf3cfa0, 0xc9c4e6, 0x8f7a55, 1.1, 0.15, 500, 0xffe9c0, 0x9d93b8],
  [18.75, 0x2b2f73, 0xff8e6b, 0xff7648, 0xb9788f, 0x7f78c2, 0x4a3b5c, 0.8, 1.0, 450, 0xff9a78, 0x4d3f78],
  [20.2, 0x070b24, 0x1b2a55, 0xa9c4ff, 0x16234a, 0x3a4c8f, 0x141a33, 0.35, 0.0, 520, 0x3a4a7a, 0x10162e],
].map((k) => ({
  t: k[0], zenith: C(k[1]), horizon: C(k[2]), sun: C(k[3]), fog: C(k[4]), sky: C(k[5]), gnd: C(k[6]),
  power: k[7], band: k[8], fogD: k[9], cloudLit: C(k[10]), cloudShade: C(k[11]),
}));
const BAND = C(0xc85a8f);

// 地域の空気：霧の色み（掛ける）と濃さ。順番は meadow, forest, canyon, peaks, lake, coast
export const REGION_AIR = {
  meadow: { tint: C(0xffffff), mul: 1.0 },
  forest: { tint: C(0xa8e0c8), mul: 1.8 },
  canyon: { tint: C(0xffe4cc), mul: 1.05 },
  peaks: { tint: C(0xdce9ff), mul: 1.3 },
  lake: { tint: C(0xffffff), mul: 0.8 },
  coast: { tint: C(0xffffff), mul: 0.9 },
  sea: { tint: C(0xffffff), mul: 0.9 },
};

export function sunDirectionAt(h, out) {
  // 日の出 5:15・日の入り 18:45。東から昇り、北の空を通り、西北西に沈む
  const a = ((h - 5.25) / 13.5) * Math.PI;
  const c = Math.cos(a), s = Math.sin(a);
  return out.set(c, 0.82 * s, -0.57 * s - 0.3 * c * c).normalize();
}

export function createPalette() {
  const st = {
    zenith: C(0), horizon: C(0), sun: C(0), fog: C(0), sky: C(0), gnd: C(0), cloudLit: C(0), cloudShade: C(0),
    power: 1, band: 0, fogD: 500, night: 0, sunVis: 1,
    sunTrue: new THREE.Vector3(), lightDir: new THREE.Vector3(), glowDir: new THREE.Vector3(),
    airTint: C(0xffffff), airMul: 1,
  };
  const tmp = C(0), tmpV = new THREE.Vector3();

  function apply(time, air) {
    let h = ((time % 24) + 24) % 24;
    let hh = h < K[0].t ? h + 24 : h;
    let i = 0;
    while (i < K.length - 1 && K[i + 1].t <= hh) i++;
    const a = K[i], b = i === K.length - 1 ? K[0] : K[i + 1];
    const tb = i === K.length - 1 ? K[0].t + 24 : b.t;
    const f = Math.min(1, Math.max(0, (hh - a.t) / (tb - a.t)));
    for (const k of ['zenith', 'horizon', 'sun', 'fog', 'sky', 'gnd', 'cloudLit', 'cloudShade']) st[k].copy(a[k]).lerp(b[k], f);
    st.power = a.power + (b.power - a.power) * f;
    st.band = a.band + (b.band - a.band) * f;
    st.fogD = a.fogD + (b.fogD - a.fogD) * f;

    sunDirectionAt(h, st.sunTrue);
    const e = st.sunTrue.y;
    const sm = (x0, x1, x) => { const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0))); return t * t * (3 - 2 * t); };
    st.night = 1 - sm(-0.22, 0.02, e);
    let vis;
    if (e > -0.05) {
      st.lightDir.copy(st.sunTrue); if (st.lightDir.y < 0.06) st.lightDir.y = 0.06; st.lightDir.normalize();
      vis = sm(-0.05, 0.1, e);
    } else {
      st.lightDir.copy(st.sunTrue).multiplyScalar(-1); if (st.lightDir.y < 0.1) st.lightDir.y = 0.1; st.lightDir.normalize();
      vis = sm(0.05, 0.22, -e);
    }
    st.sunVis = vis;
    const moon = e <= -0.13;
    if (moon) st.glowDir.copy(st.sunTrue).multiplyScalar(-1); else st.glowDir.copy(st.sunTrue);
    const glowAmt = moon ? sm(0.13, 0.3, -e) * 0.55 : sm(-0.13, -0.02, e);

    // 地域の空気
    st.airTint.copy(air.tint); st.airMul = air.mul;

    // ── uniform へ ──
    U.uSunDir.value.copy(st.lightDir);
    U.uGlowDir.value.copy(st.glowDir);
    const p = st.power;
    const nightLift = 1 + st.night * 1.6;                    // 夜でも地面が読めるように持ち上げる
    U.uSunCol.value.copy(st.sun).multiplyScalar(p * 0.66 * (0.12 + 0.88 * vis) * (1 + st.night * 0.9));
    U.uSkyCol.value.copy(st.sky).multiplyScalar(p * 0.5 * nightLift);
    U.uGndCol.value.copy(st.gnd).multiplyScalar(p * 0.8 * nightLift); tmp.copy(st.sun).multiplyScalar(0.1 * p * vis); U.uGndCol.value.add(tmp);
    U.uFogCol.value.copy(st.fog).multiply(st.airTint);
    tmp.copy(st.sun).lerp(st.horizon, 0.35);
    U.uFogSunCol.value.copy(U.uFogCol.value).lerp(tmp, 0.75 * glowAmt);
    const D = st.fogD;
    U.uFogP.value.set(st.airMul / (D * D), 1 / 85, st.night, 0);
    U.uZenith.value.copy(st.zenith);
    U.uHorizon.value.copy(st.horizon);
    U.uBand.value.set(BAND.r, BAND.g, BAND.b, st.band * 0.75);
    U.uSunDiscCol.value.copy(st.sun);
    U.uSkyP.value.x = moon ? 1 : 0;
    U.uSkyP.value.y = st.night;
    U.uSkyP.value.w = glowAmt;
    // 天環：昼は淡い白、夜は月の色で光る
    U.uRingCol.value.copy(st.sun).lerp(tmp.set(0xbfe9ff), 0.5).multiplyScalar(0.22 + st.night * 0.5);
    U.uCloud.value.w = 0.42 * (1 - st.night * 0.7);
    return st;
  }
  return { state: st, apply };
}

export function phaseOf(h) {
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19.5) return 'dusk';
  return 'night';
}
