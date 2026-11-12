// js/world/noise.js — FABLE
// 決定的な 2D 値ノイズ（three.js に依存しない）。

export function makeNoise(seed) {
  const s = (seed | 0) ^ 0x5bd1e995;
  function hash(ix, iy) {
    let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ s;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  // 0..1
  function n2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // 0..1（平均 0.5）
  function fbm(x, y, oct) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += n2(x, y) * amp; norm += amp;
      x = x * 2.03 + 17.1; y = y * 2.03 + 31.7; amp *= 0.5;
    }
    return sum / norm;
  }
  // 周期つき（タイル可能）ノイズ。period は整数
  function n2p(x, y, period) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % period) + period) % period, x1 = (x0 + 1) % period;
    const y0 = ((iy % period) + period) % period, y1 = (y0 + 1) % period;
    const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  return { hash, n2, fbm, n2p };
}

// 小さな乱数（ctx.rng がないときの代わり、配置用の固定乱数）
export function makeRng(seed) {
  let a = (seed | 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const api = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    fork: (label) => {
      let h = seed | 0;
      const str = String(label);
      for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
      return makeRng(h ^ 0x9e3779b9);
    },
  };
  return api;
}

export const smoothstep = (a, b, x) => {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
