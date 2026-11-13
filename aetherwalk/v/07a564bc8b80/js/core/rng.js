// js/core/rng.js — seeded random numbers (§10.2, OPUS-A). fork(label) gives an independent stream
// per label so modules don't disturb each other's sequences.

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function createRng(seed = 7) {
  let a = (Number(seed) >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => (arr && arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
    fork: (label) => createRng((hashString(String(label)) ^ Math.imul((Number(seed) >>> 0) || 1, 2654435761)) >>> 0),
  };
}
