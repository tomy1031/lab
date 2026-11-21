// town_small.js — the SMALL things of Yokohama (≈5 cm … 2.5 m): litter, street food, souvenirs,
// animals, people and street furniture. These are the first things the ball rolls up.
// Units: metres. Base on y = 0, centred on x/z, front faces +Z.
import { box, cyl, cone, sphere, torus, ico, dodeca, capsule, plane, lathe, extrude, beam, group, repeat, merge, shade, mix, rng } from '../geo.js';

const P = Math.PI;
const L3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- palette ----------
const WHITE = 0xf7f5ef, BLACK = 0x1f1f24, SILVER = 0xc4cad2, GOLD = 0xf2c033, RED = 0xd8262a;
const SKIN = 0xf1c6a0, HAIR = 0x2b1e19, EYE = 0x1d1513;
const WOOD = 0xc98d4f, GREEN = 0x3f9a44, LEAF = 0x4fb34a, SOIL = 0x5b3b25;
const FLOWERS = [0xe8344a, 0xf6c431, 0xf27ab0, 0x9a5fd0, 0xffffff, 0xff8a2a];

// ---------- shared builders ----------

// one shumai dumpling (≈5 cm): yellow wrapper cup, pinkish meat top, pleats, green pea
function shumaiParts(simple) {
  const Y = 0xf3d36a, MEAT = 0xe09c7a;
  if (simple) return [
    cyl(0.022, 0.018, 0.032, 6, Y, { y: 0.016 }),
    sphere(0.019, 6, 3, MEAT, { y: 0.032, sy: 0.5 }),
    ico(0.0075, 0, 0x58b83a, { y: 0.042 }),
  ];
  return [
    cyl(0.022, 0.018, 0.03, 8, Y, { y: 0.015 }),
    cyl(0.0245, 0.0215, 0.008, 8, mix(Y, 0xffffff, 0.3), { y: 0.032 }),
    repeat(8, (i) => {
      const a = ((i + 0.5) / 8) * P * 2;
      return beam([Math.sin(a) * 0.0185, 0.002, Math.cos(a) * 0.0185], [Math.sin(a) * 0.0225, 0.034, Math.cos(a) * 0.0225], 0.004, shade(Y, 0.85));
    }),
    sphere(0.0195, 8, 4, MEAT, { y: 0.034, sy: 0.5 }),
    sphere(0.0068, 6, 4, 0x58b83a, { y: 0.0435 }),
  ];
}

// stylised human. Returns { parts, headY, headR, sh (shoulder y), td }
function human(o) {
  const k = o.k ?? 1;
  const headR = o.headR ?? 0.125 * k;
  const legH = o.legH ?? 0.8 * k;
  const torsoH = o.torsoH ?? 0.56 * k;
  const tw = o.torsoW ?? 0.4 * k, td = o.torsoD ?? 0.23 * k;
  const shirt = o.shirt, pants = o.pants ?? 0x33405c, skin = o.skin ?? SKIN, hair = o.hair ?? HAIR, shoe = o.shoe ?? 0x2b2b2b;
  const stride = o.stride ?? 0.12 * k;
  const p = [];
  const hip = legH, sh = hip + torsoH;
  const lw = tw * 0.4;
  for (const s of [-1, 1]) {
    const x = s * tw * 0.24;
    const fz = s * stride;
    const ankle = [x, 0.07 * k, fz];
    const hipP = [x, hip + 0.02 * k, 0];
    if (o.shorts) {
      const knee = L3(hipP, ankle, 0.42);
      p.push(beam(hipP, knee, lw * 1.12, o.shorts));
      p.push(beam(knee, ankle, lw * 0.75, skin));
    } else if (o.skirt) {
      p.push(beam(hipP, ankle, lw * 0.7, o.legs ?? skin));
    } else p.push(beam(hipP, ankle, lw, pants));
    p.push(box(lw * 1.05, 0.07 * k, lw * 1.9, shoe, { x, y: 0.035 * k, z: fz + 0.04 * k }));
  }
  if (o.skirt) p.push(cyl(tw * 0.52, tw * 0.72, legH * 0.42, 6, o.skirt, { y: hip - legH * 0.17, ry: P / 6 }));
  // torso
  p.push(box(tw, torsoH, td, shirt, { y: hip + torsoH / 2 }));
  // arms swing opposite to the legs
  for (const s of [-1, 1]) {
    const x = s * (tw / 2 + 0.045 * k);
    const shP = [x, sh - 0.04 * k, 0];
    const hand = [s * (tw / 2 + 0.085 * k), hip - 0.02 * k, -s * stride * 0.9];
    const elbow = L3(shP, hand, 0.45);
    if (o.shortSleeve) {
      p.push(beam(shP, elbow, 0.1 * k, shirt));
      p.push(beam(elbow, hand, 0.072 * k, skin));
    } else p.push(beam(shP, hand, 0.09 * k, o.sleeve ?? shirt));
    p.push(box(0.075 * k, 0.09 * k, 0.075 * k, skin, { x: hand[0], y: hand[1] - 0.035 * k, z: hand[2] }));
  }
  // neck + head + hair + eyes
  const headY = sh + 0.06 * k + headR * 0.9;
  p.push(cyl(0.05 * k, 0.055 * k, 0.12 * k, 6, skin, { y: sh + 0.04 * k }));
  p.push(sphere(headR, 8, 4, skin, { y: headY, sy: 1.12 }));
  if (!o.noHair) p.push(sphere(headR * 1.05, 8, 6, hair, { y: headY + headR * 0.38, z: -headR * 0.24 }));
  if (o.longHair) p.push(box(headR * 1.7, headR * 1.9, headR * 0.6, hair, { y: headY - headR * 0.55, z: -headR * 0.62 }));
  for (const s of [-1, 1]) {
    p.push(box(headR * 0.18, headR * 0.24, headR * 0.1, EYE, { x: s * headR * 0.38, y: headY - headR * 0.04, z: headR * 0.95 }));
  }
  if (o.cheeks) for (const s of [-1, 1]) p.push(box(headR * 0.2, headR * 0.12, headR * 0.08, 0xf08a8a, { x: s * headR * 0.55, y: headY - headR * 0.32, z: headR * 0.84 }));
  return { parts: p, headY, headR, sh, td, tw, hip };
}

// simple bird body helpers are inline below

// ---------- models ----------
export default {
  // ================= TINY (≤ 0.5 m) =================
  can: {
    name: '空き缶', kind: 'thing',
    variants: [0xd8382c, 0x2c7fd8, 0x3cae4c],
    where: ['plaza', 'street', 'park'], weight: 4,
    // lying on its side like litter, slightly turned
    build: (v) => merge(group([
      cyl(0.033, 0.033, 0.098, 10, v, { y: 0.06 }),
      cyl(0.0336, 0.0336, 0.03, 10, WHITE, { y: 0.07 }),
      cyl(0.028, 0.033, 0.011, 10, SILVER, { y: 0.0055 }),
      cyl(0.027, 0.033, 0.011, 10, SILVER, { y: 0.1145 }),
      box(0.012, 0.003, 0.02, 0x9aa2ac, { y: 0.121, z: 0.008 }),
    ], { rz: P / 2, x: 0.06, y: 0.033, ry: 0.4 })),
  },

  bottle: {
    name: 'ペットボトル', kind: 'thing',
    where: ['plaza', 'street', 'park'], weight: 3,
    build: () => merge(
      lathe([[0, 0], [0.028, 0], [0.033, 0.01], [0.033, 0.13], [0.03, 0.15], [0.017, 0.182], [0.012, 0.192], [0.012, 0.2]], 8, 0xbfe6f2),
      cyl(0.0335, 0.0335, 0.06, 8, 0x37a852, { y: 0.085 }),
      cyl(0.0336, 0.0336, 0.012, 8, WHITE, { y: 0.085 }),
      cyl(0.0135, 0.0135, 0.02, 8, 0x2e8f46, { y: 0.209 }),
    ),
  },

  shumai: {
    name: 'シウマイ', kind: 'food',
    where: ['chinatown', 'plaza'], weight: 4,
    build: () => merge(shumaiParts()),
  },

  shumai_box: {
    name: 'シウマイ弁当', kind: 'food',
    where: ['plaza', 'waterfront'], weight: 2,
    build: () => {
      const W = 0xe2c48e, LID = 0xd9b77c, LBL = 0xf6d23a;
      return merge(
        // wooden box
        box(0.2, 0.04, 0.13, W, { y: 0.02 }),
        box(0.2, 0.004, 0.004, shade(W, 0.8), { y: 0.04, z: 0.064 }),
        // lid slid back, wrapped with a yellow label + red band
        box(0.2, 0.006, 0.09, LID, { y: 0.043, z: -0.05 }),
        box(0.07, 0.003, 0.09, LBL, { x: -0.02, y: 0.0475, z: -0.05 }),
        box(0.018, 0.0035, 0.09, 0xd8262a, { x: -0.02, y: 0.048, z: -0.05 }),
        box(0.2, 0.0035, 0.012, 0xd8262a, { y: 0.0475, z: -0.025 }),
        // exposed front: rice with an umeboshi, and shumai
        box(0.08, 0.006, 0.05, 0xfbf8f0, { x: -0.055, y: 0.041, z: 0.035 }),
        ico(0.008, 0, 0xc8243a, { x: -0.055, y: 0.045, z: 0.035 }),
        repeat(3, (i) => group(shumaiParts(true), { s: 0.75, x: 0.012 + i * 0.03, y: 0.04, z: 0.035 })),
      );
    },
  },

  nikuman: {
    name: '肉まん', kind: 'food',
    where: ['chinatown'], weight: 4,
    build: () => {
      const B = 0xfbf3e2, PL = 0xe9d9b8;
      return merge(
        lathe([[0, 0], [0.042, 0], [0.05, 0.012], [0.049, 0.03], [0.04, 0.048], [0.024, 0.061], [0.008, 0.067], [0, 0.068]], 10, B),
        repeat(7, (i) => {
          const a = (i / 7) * P * 2, b = a + 0.6;
          return beam([Math.sin(b) * 0.006, 0.069, Math.cos(b) * 0.006], [Math.sin(a) * 0.026, 0.058, Math.cos(a) * 0.026], 0.006, PL);
        }),
        cone(0.009, 0.012, 5, PL, { y: 0.074 }),
      );
    },
  },

  seiro: {
    name: 'せいろの小籠包', kind: 'food',
    where: ['chinatown'], weight: 2,
    build: () => {
      const BAM = 0xd8b26a, BD = 0xa9813f, XLB = 0xf6efe0;
      const lid = [
        cyl(0.112, 0.112, 0.03, 8, BAM, { y: 0.015, z: 0.11 }),
      ];
      return merge(
        lathe([[0.11, 0], [0.11, 0.07], [0.1, 0.07], [0.1, 0.014], [0, 0.014]], 8, BAM),
        cyl(0.1125, 0.1125, 0.014, 8, BD, { y: 0.009 }),
        // four soup dumplings with twisted tops
        repeat(4, (i) => {
          const a = (i / 4) * P * 2 + P / 4;
          return lathe([[0, 0], [0.027, 0.003], [0.028, 0.014], [0.012, 0.03], [0, 0.04]], 6, XLB, { x: Math.sin(a) * 0.046, z: Math.cos(a) * 0.046, y: 0.014 });
        }),
        // lid propped open on the back rim
        group(lid, { rx: -0.85, y: 0.07, z: -0.11 }),
      );
    },
  },

  amaguri: {
    name: '甘栗の袋', kind: 'food',
    where: ['chinatown'], weight: 2,
    build: () => {
      const R = 0xd52a26, NUT = 0x6a3518;
      const r = rng(7);
      return merge(
        extrude([[-0.045, 0], [0.045, 0], [0.05, 0.125], [-0.05, 0.125]], 0.065, R),
        box(0.102, 0.022, 0.068, GOLD, { y: 0.115 }),
        cyl(0.022, 0.022, 0.006, 8, GOLD, { rx: P / 2, y: 0.06, z: 0.033 }),
        cyl(0.012, 0.012, 0.007, 8, R, { rx: P / 2, y: 0.06, z: 0.034 }),
        repeat(7, (i) => {
          const a = i * 2.4, rr = i === 0 ? 0 : 0.026;
          return ico(0.015, 0, i % 2 ? NUT : 0x7d4220, { x: Math.sin(a) * rr, y: 0.13 + (i === 0 ? 0.008 : r() * 0.006), z: Math.cos(a) * rr * 0.55, sy: 0.75, ry: r() * 3 });
        }),
      );
    },
  },

  panda_plush: {
    name: 'パンダのぬいぐるみ', kind: 'thing',
    where: ['chinatown', 'plaza'], weight: 2,
    build: () => {
      const W = 0xfbfaf6, K = 0x26262b;
      return merge(
        sphere(0.088, 7, 5, W, { y: 0.088 }),
        // legs stretched forward (sitting)
        ico(0.042, 0, K, { x: -0.052, y: 0.038, z: 0.06, sz: 1.25 }),
        ico(0.042, 0, K, { x: 0.052, y: 0.038, z: 0.06, sz: 1.25 }),
        cyl(0.02, 0.02, 0.006, 6, 0xf0b5b0, { rx: P / 2, x: -0.052, y: 0.04, z: 0.112 }),
        cyl(0.02, 0.02, 0.006, 6, 0xf0b5b0, { rx: P / 2, x: 0.052, y: 0.04, z: 0.112 }),
        // arms
        ico(0.036, 0, K, { x: -0.078, y: 0.115, z: 0.025, sy: 1.5, rz: -0.5 }),
        ico(0.036, 0, K, { x: 0.078, y: 0.115, z: 0.025, sy: 1.5, rz: 0.5 }),
        // head
        sphere(0.074, 7, 5, W, { y: 0.215 }),
        ico(0.027, 0, K, { x: -0.056, y: 0.275, z: -0.005, sz: 0.65 }),
        ico(0.027, 0, K, { x: 0.056, y: 0.275, z: -0.005, sz: 0.65 }),
        ico(0.022, 0, K, { x: -0.03, y: 0.222, z: 0.06, sx: 0.85, sy: 1.15, sz: 0.55, rz: -0.5 }),
        ico(0.022, 0, K, { x: 0.03, y: 0.222, z: 0.06, sx: 0.85, sy: 1.15, sz: 0.55, rz: 0.5 }),
        box(0.008, 0.008, 0.004, W, { x: -0.028, y: 0.226, z: 0.074 }),
        box(0.008, 0.008, 0.004, W, { x: 0.028, y: 0.226, z: 0.074 }),
        ico(0.011, 0, K, { y: 0.198, z: 0.072, sy: 0.7 }),
        // red bow at the neck
        box(0.03, 0.024, 0.012, RED, { x: -0.017, y: 0.152, z: 0.078, rz: 0.35 }),
        box(0.03, 0.024, 0.012, RED, { x: 0.017, y: 0.152, z: 0.078, rz: -0.35 }),
      );
    },
  },

  soft_cream: {
    name: 'ソフトクリーム', kind: 'food',
    where: ['plaza', 'waterfront', 'park'], weight: 2,
    build: () => {
      const pts = [[0, 0.1], [0.034, 0.1], [0.037, 0.112], [0.031, 0.124], [0.032, 0.13], [0.027, 0.143], [0.021, 0.15], [0.022, 0.156], [0.016, 0.168], [0.01, 0.176], [0.008, 0.184], [0, 0.2]];
      return merge(
        cone(0.029, 0.1, 8, 0xd9a35a, { y: 0.05, rx: P }),
        cyl(0.032, 0.03, 0.012, 8, 0xc08540, { y: 0.1 }),
        lathe(pts, 8, 0xfffbf0),
      );
    },
  },

  mikan: {
    name: 'みかん', kind: 'food',
    where: ['park', 'street'], weight: 2,
    build: () => merge(
      sphere(0.035, 8, 6, 0xff9418, { y: 0.03, sy: 0.85 }),
      cyl(0.008, 0.008, 0.003, 5, 0x3c7a2a, { y: 0.06 }),
      cyl(0.0025, 0.0025, 0.008, 4, 0x6b4a2a, { y: 0.064 }),
      box(0.024, 0.003, 0.011, 0x3e9a3a, { x: 0.012, y: 0.064, rz: 0.3, ry: 0.5 }),
    ),
  },

  ball: {
    name: 'サッカーボール', kind: 'thing',
    where: ['park'], weight: 1,
    // white round ball + black icosahedron poking through at the 12 pentagon spots
    build: () => merge(
      ico(0.11, 1, WHITE, { y: 0.11 }),
      ico(0.12, 0, BLACK, { y: 0.11 }),
    ),
  },

  cup_noodle: {
    name: 'カップめん', kind: 'food',
    where: ['plaza', 'street'], weight: 2,
    build: () => merge(
      cyl(0.048, 0.037, 0.105, 10, WHITE, { y: 0.0525 }),
      cyl(0.0461, 0.0418, 0.04, 10, 0xe03a2f, { y: 0.06 }),
      cyl(0.0412, 0.0406, 0.006, 10, GOLD, { y: 0.034 }),
      cyl(0.05, 0.05, 0.005, 10, 0xf2e6c4, { y: 0.1075 }),
      box(0.022, 0.003, 0.018, 0xf2e6c4, { y: 0.108, z: 0.056 }),
    ),
  },

  red_shoes: {
    name: '赤い靴', kind: 'thing',
    where: ['park', 'waterfront'], weight: 1,
    build: () => {
      const R = 0xd4182c, RD = 0xa50f20, SOLE = 0x4a2416;
      const shoe = (s) => group([
        box(0.058, 0.012, 0.17, SOLE, { y: 0.006 }),
        box(0.056, 0.02, 0.035, SOLE, { y: 0.012, z: -0.066 }),
        extrude([[-0.085, 0.01], [0.07, 0.01], [0.085, 0.022], [0.078, 0.036], [0.045, 0.044], [0.0, 0.047], [-0.085, 0.05]], 0.054, R, { ry: -P / 2 }),
        box(0.038, 0.004, 0.075, 0x3a0c10, { y: 0.049, z: -0.038 }),
        box(0.058, 0.007, 0.012, RD, { y: 0.051, z: 0.005 }),
        box(0.006, 0.01, 0.01, GOLD, { x: s * 0.029, y: 0.047, z: 0.005 }),
      ], { x: s * 0.037, z: s * 0.012, ry: -s * 0.08 });
      return merge(shoe(-1), shoe(1));
    },
  },

  smartphone: {
    name: 'スマホ', kind: 'thing',
    where: ['plaza', 'street'], weight: 1,
    build: () => {
      const r = rng(11);
      const ICON = [0x5ad46a, 0xff6b5a, 0xffd23a, 0x4a8cff, 0xff8ad8, 0xffffff, 0x9a6bff, 0x2cd0c8];
      return merge(
        box(0.072, 0.008, 0.15, 0x24262c, { y: 0.004 }),
        box(0.074, 0.006, 0.152, 0x8a5cd8, { y: 0.004 }),
        plane(0.064, 0.136, 0x3b6fd8, { rx: -P / 2, y: 0.0082, glow: 0.6 }),
        repeat(20, (i) => {
          const c = i % 4, rw = Math.floor(i / 4);
          const z = rw === 4 ? 0.054 : -0.05 + rw * 0.02;
          return plane(0.011, 0.011, ICON[Math.floor(r() * ICON.length)], { rx: -P / 2, x: -0.0225 + c * 0.015, y: 0.0089, z, glow: 0.6 });
        }),
        plane(0.016, 0.004, 0x111111, { rx: -P / 2, y: 0.0089, z: -0.064 }),
      );
    },
  },

  guidebook: {
    name: 'ガイドブック', kind: 'thing',
    where: ['plaza', 'chinatown'], weight: 1,
    build: () => {
      const C = 0x1f9e8f, PG = 0xf6f0dc;
      return merge(
        box(0.14, 0.003, 0.2, C, { y: 0.0015 }),
        box(0.14, 0.003, 0.2, C, { y: 0.0225 }),
        box(0.006, 0.024, 0.2, shade(C, 0.8), { x: -0.067, y: 0.012 }),
        box(0.132, 0.018, 0.192, PG, { x: 0.002, y: 0.012 }),
        // cover: yellow title band, photo of the harbour, white text marks
        box(0.13, 0.001, 0.045, 0xf6c431, { y: 0.0245, z: -0.06 }),
        box(0.06, 0.0012, 0.012, 0xffffff, { x: -0.02, y: 0.0252, z: -0.065 }),
        box(0.11, 0.001, 0.09, 0x6cc4ef, { y: 0.0245, z: 0.035 }),
        box(0.11, 0.0012, 0.03, 0x2a6fb8, { y: 0.0252, z: 0.065 }),
        box(0.02, 0.0012, 0.04, 0xc8503a, { x: 0.025, y: 0.0254, z: 0.04 }),
        // sticky tabs on the fore-edge
        box(0.02, 0.0012, 0.012, 0xff5a7a, { x: 0.074, y: 0.016, z: -0.05 }),
        box(0.02, 0.0012, 0.012, 0xffd23a, { x: 0.074, y: 0.012, z: 0.0 }),
        box(0.02, 0.0012, 0.012, 0x5ad46a, { x: 0.074, y: 0.008, z: 0.055 }),
      );
    },
  },

  shoe: {
    name: 'スニーカー', kind: 'thing',
    where: ['street', 'park'], weight: 1,
    build: () => {
      const U = 0x2f6fd6, S = 0xf4f4f2, ACC = 0xe8483c;
      // built in a side-profile frame (x = length, toe at +x), then turned so the toe faces +Z
      return merge(group([
        extrude([[-0.14, 0], [0.13, 0], [0.142, 0.012], [0.137, 0.03], [-0.14, 0.03]], 0.1, S),
        extrude([[-0.135, 0.028], [0.13, 0.028], [0.134, 0.042], [0.1, 0.062], [0.04, 0.075], [-0.03, 0.096], [-0.08, 0.112], [-0.132, 0.112], [-0.142, 0.07]], 0.092, U),
        box(0.06, 0.004, 0.07, 0x1b2233, { x: -0.105, y: 0.112 }),
        box(0.03, 0.06, 0.094, ACC, { x: -0.128, y: 0.085 }),
        beam([-0.1, 0.04, 0.047], [0.03, 0.07, 0.047], 0.012, S),
        beam([-0.1, 0.04, -0.047], [0.03, 0.07, -0.047], 0.012, S),
        repeat(4, (i) => box(0.012, 0.006, 0.06, S, { x: 0.03 - i * 0.022, y: 0.078 + i * 0.0075, rz: 0.33 })),
      ], { ry: -P / 2 }));
    },
  },

  flower_pot: {
    name: '植木鉢', kind: 'plant',
    where: ['street', 'chinatown'], weight: 2,
    build: () => {
      const T = 0xc8693a;
      return merge(
        cyl(0.098, 0.075, 0.15, 8, T, { y: 0.075 }),
        cyl(0.11, 0.105, 0.03, 8, shade(T, 1.12), { y: 0.152 }),
        cyl(0.096, 0.096, 0.01, 8, SOIL, { y: 0.163 }),
        dodeca(0.075, GREEN, { y: 0.2, sy: 0.75 }),
        dodeca(0.05, LEAF, { x: 0.06, y: 0.2, z: 0.03 }),
        dodeca(0.05, LEAF, { x: -0.055, y: 0.205, z: -0.03 }),
        ico(0.024, 0, 0xe8344a, { x: 0.0, y: 0.268, z: 0.0 }),
        ico(0.022, 0, 0xe8344a, { x: 0.05, y: 0.25, z: 0.04 }),
        ico(0.022, 0, 0xff5a7a, { x: -0.048, y: 0.252, z: 0.03 }),
        ico(0.022, 0, 0xe8344a, { x: 0.01, y: 0.248, z: -0.055 }),
        ico(0.02, 0, 0xff5a7a, { x: -0.03, y: 0.24, z: 0.07 }),
      );
    },
  },

  pigeon: {
    name: 'ハト', kind: 'animal',
    where: ['plaza', 'park'], weight: 2,
    move: 'hop', speed: 0.6,
    build: () => {
      const G = 0x9098a8, GD = 0x6f7787, NECK = 0x4f8f82, FEET = 0xd8555a, WG = 0xa7afbd, BAR = 0x3a3e48;
      return merge(group([
        sphere(0.07, 7, 5, G, { y: 0.1, sz: 1.4, sy: 0.95 }),
        box(0.06, 0.012, 0.09, GD, { y: 0.1, z: -0.13, rx: -0.12 }),
        box(0.062, 0.013, 0.022, BAR, { y: 0.104, z: -0.168, rx: -0.12 }),
        // folded wings, each with a dark bar
        [-1, 1].map((s) => [
          sphere(0.05, 6, 4, WG, { x: s * 0.056, y: 0.115, z: -0.035, sx: 0.4, sy: 0.75, sz: 1.9, rx: 0.12 }),
          box(0.012, 0.012, 0.05, BAR, { x: s * 0.072, y: 0.108, z: -0.05, rx: 0.12 }),
        ]),
        // iridescent neck, head, beak, orange eyes
        sphere(0.046, 6, 4, NECK, { y: 0.145, z: 0.07 }),
        sphere(0.036, 6, 5, GD, { y: 0.19, z: 0.1 }),
        cone(0.009, 0.028, 4, 0x3a3a3a, { y: 0.186, z: 0.145, rx: P / 2 }),
        box(0.008, 0.01, 0.01, 0xff7a1a, { x: -0.032, y: 0.197, z: 0.11 }),
        box(0.008, 0.01, 0.01, 0xff7a1a, { x: 0.032, y: 0.197, z: 0.11 }),
        // legs + toes
        beam([-0.022, 0.06, 0.01], [-0.022, 0.0, 0.015], 0.01, FEET),
        beam([0.022, 0.06, 0.01], [0.022, 0.0, 0.015], 0.01, FEET),
        box(0.02, 0.006, 0.035, FEET, { x: -0.022, y: 0.003, z: 0.025 }),
        box(0.02, 0.006, 0.035, FEET, { x: 0.022, y: 0.003, z: 0.025 }),
      ], { s: 0.9 }));
    },
  },

  lantern: {
    name: '赤ちょうちん', kind: 'thing',
    where: ['chinatown'], weight: 3,
    build: () => {
      // ribbed paper body
      const pts = [];
      const N = 6;
      for (let i = 0; i <= N; i++) {
        const t = i / N, y = 0.04 + t * 0.42;
        pts.push([0.1 + 0.075 * Math.sin(P * t), y]);
        if (i < N) {
          const t2 = (i + 0.5) / N;
          pts.push([(0.1 + 0.075 * Math.sin(P * t2)) * 0.955, 0.04 + t2 * 0.42]);
        }
      }
      return merge(
        lathe(pts, 8, 0xe0262a, { glow: 1 }),
        cyl(0.108, 0.112, 0.045, 8, BLACK, { y: 0.0225 }),
        cyl(0.112, 0.108, 0.045, 8, BLACK, { y: 0.4775 }),
        beam([-0.03, 0.5, 0], [0, 0.535, 0], 0.012, GOLD),
        beam([0.03, 0.5, 0], [0, 0.535, 0], 0.012, GOLD),
      );
    },
  },

  mooncake: {
    name: '月餅', kind: 'food',
    where: ['chinatown'], weight: 2,
    build: () => {
      const C = 0xcf8f3e, D = 0xa5642a;
      return merge(
        lathe([[0, 0], [0.037, 0], [0.04, 0.004], [0.04, 0.024], [0.036, 0.03], [0.027, 0.03], [0.025, 0.033], [0, 0.034]], 12, C),
        repeat(4, (i) => box(0.034, 0.003, 0.007, D, { y: 0.0345, ry: (i * P) / 4 })),
        cyl(0.007, 0.007, 0.004, 6, D, { y: 0.035 }),
      );
    },
  },

  // ================= SMALL (0.5 – 2.5 m) =================
  cone: {
    name: 'カラーコーン', kind: 'thing',
    where: ['street', 'plaza'], weight: 2,
    build: () => {
      const O = 0xff6a1a;
      const r = (h) => 0.13 - 0.105 * (h / 0.64);
      const band = (h0, h1) => cyl(r(h1) + 0.003, r(h0) + 0.003, h1 - h0, 10, WHITE, { y: 0.035 + (h0 + h1) / 2 });
      return merge(
        box(0.38, 0.035, 0.38, 0x2b2b2e, { y: 0.0175 }),
        cyl(0.025, 0.13, 0.64, 10, O, { y: 0.035 + 0.32 }),
        band(0.18, 0.27),
        band(0.4, 0.47),
        cyl(0.02, 0.026, 0.025, 10, O, { y: 0.6875 }),
      );
    },
  },

  gull: {
    name: 'カモメ', kind: 'animal',
    where: ['waterfront'], weight: 3,
    move: 'hop', speed: 1,
    build: () => {
      const W = 0xfbfbf8, G = 0xa9b4c2, K = 0x26262b, Y = 0xf6c431, LEG = 0xf0b04a;
      return merge(
        // legs + webbed feet
        beam([-0.035, 0.16, 0.0], [-0.035, 0.0, 0.02], 0.016, LEG),
        beam([0.035, 0.16, 0.0], [0.035, 0.0, 0.02], 0.016, LEG),
        box(0.04, 0.008, 0.05, LEG, { x: -0.035, y: 0.004, z: 0.035 }),
        box(0.04, 0.008, 0.05, LEG, { x: 0.035, y: 0.004, z: 0.035 }),
        // body
        sphere(0.1, 8, 5, W, { y: 0.25, sz: 1.6, sy: 0.95, rx: -0.25 }),
        // folded grey wings with black tips
        sphere(0.08, 6, 4, G, { x: -0.07, y: 0.285, z: -0.04, sx: 0.4, sy: 0.7, sz: 2.0, rx: -0.2 }),
        sphere(0.08, 6, 4, G, { x: 0.07, y: 0.285, z: -0.04, sx: 0.4, sy: 0.7, sz: 2.0, rx: -0.2 }),
        box(0.035, 0.035, 0.1, K, { x: -0.035, y: 0.255, z: -0.215, rx: -0.3 }),
        box(0.035, 0.035, 0.1, K, { x: 0.035, y: 0.255, z: -0.215, rx: -0.3 }),
        box(0.06, 0.03, 0.08, W, { y: 0.22, z: -0.18, rx: -0.3 }),
        // neck, head, yellow beak with red spot, eyes
        sphere(0.062, 6, 4, W, { y: 0.35, z: 0.1 }),
        sphere(0.06, 8, 5, W, { y: 0.42, z: 0.12 }),
        box(0.024, 0.026, 0.075, Y, { y: 0.41, z: 0.205 }),
        box(0.025, 0.012, 0.014, 0xe0302a, { y: 0.398, z: 0.232 }),
        box(0.012, 0.016, 0.012, K, { x: -0.052, y: 0.435, z: 0.14 }),
        box(0.012, 0.016, 0.012, K, { x: 0.052, y: 0.435, z: 0.14 }),
      );
    },
  },

  trash_bin: {
    name: 'ゴミ箱', kind: 'thing',
    where: ['plaza', 'street', 'park'], weight: 1,
    build: () => {
      const BODY = 0xd5d9dd, B = 0x2f74d0, G = 0x3aa655, H = 0x1a1a1e;
      return merge(
        box(0.8, 0.06, 0.46, 0x5a5f66, { y: 0.03 }),
        box(0.78, 0.84, 0.44, BODY, { y: 0.48 }),
        box(0.4, 0.1, 0.46, B, { x: -0.2, y: 0.95 }),
        box(0.4, 0.1, 0.46, G, { x: 0.2, y: 0.95 }),
        box(0.012, 0.86, 0.45, 0x8a9098, { y: 0.48 }),
        // labels + openings on the front
        box(0.3, 0.3, 0.01, B, { x: -0.2, y: 0.68, z: 0.222 }),
        box(0.3, 0.3, 0.01, G, { x: 0.2, y: 0.68, z: 0.222 }),
        cyl(0.07, 0.07, 0.012, 10, H, { rx: P / 2, x: -0.2, y: 0.7, z: 0.226 }),
        box(0.2, 0.04, 0.012, H, { x: 0.2, y: 0.72, z: 0.226 }),
        box(0.16, 0.025, 0.012, WHITE, { x: -0.2, y: 0.58, z: 0.226 }),
        box(0.16, 0.025, 0.012, WHITE, { x: 0.2, y: 0.58, z: 0.226 }),
      );
    },
  },

  bench: {
    name: 'ベンチ', kind: 'thing',
    where: ['park', 'waterfront', 'plaza'], weight: 2,
    build: () => {
      const W = 0xb7773d, I = 0x2d3f36;
      const side = (x) => [
        beam([x, 0, 0.21], [x, 0.44, 0.19], 0.05, I),
        beam([x, 0, -0.2], [x, 0.44, -0.2], 0.05, I),
        beam([x, 0.44, -0.2], [x, 0.86, -0.29], 0.05, I),
        beam([x, 0.43, 0.23], [x, 0.43, -0.22], 0.05, I),
        beam([x, 0.62, 0.22], [x, 0.62, -0.24], 0.05, I),
        beam([x, 0.44, 0.19], [x, 0.62, 0.21], 0.045, I),
      ];
      return merge(
        side(-0.78), side(0.78),
        repeat(3, (i) => box(1.8, 0.035, 0.12, i === 1 ? shade(W, 0.92) : W, { y: 0.465, z: 0.15 - i * 0.145 })),
        box(1.8, 0.11, 0.035, W, { y: 0.62, z: -0.245, rx: -0.2 }),
        box(1.8, 0.11, 0.035, shade(W, 0.92), { y: 0.77, z: -0.275, rx: -0.2 }),
      );
    },
  },

  bicycle: {
    name: '自転車', kind: 'vehicle',
    variants: [0xd8382c, 0x2c7fd8, 0xf2c230],
    where: ['street'], weight: 1,
    build: (v) => {
      const T = 0x232327, S = SILVER, wr = 0.31, wy = 0.326, fz = 0.52, rz = -0.52;
      const wheel = (z) => [
        torus(wr, 0.032, 4, 10, T, { ry: P / 2, y: wy, z }),
        repeat(3, (i) => {
          const a = (i * P) / 3, d = wr - 0.03;
          return beam([0, wy + Math.cos(a) * d, z + Math.sin(a) * d], [0, wy - Math.cos(a) * d, z - Math.sin(a) * d], 0.012, S);
        }),
      ];
      const H1 = [0, 0.86, 0.34], H0 = [0, 0.66, 0.4], BB = [0, 0.3, -0.06], ST = [0, 0.8, -0.2];
      const arc = (cz, a0, a1, n) => repeat(n, (i) => {
        const a = a0 + ((a1 - a0) * i) / n, b = a0 + ((a1 - a0) * (i + 1)) / n, R = wr + 0.045;
        return beam([0, wy + Math.cos(a) * R, cz + Math.sin(a) * R], [0, wy + Math.cos(b) * R, cz + Math.sin(b) * R], 0.05, v);
      });
      const BK = 0x9aa4ae;
      return merge(
        wheel(fz), wheel(rz),
        beam(H0, [0, wy, fz], 0.04, v),
        beam(H0, H1, 0.05, v),
        beam(H0, [0, 0.36, 0.05], 0.05, v),
        beam([0, 0.36, 0.05], BB, 0.05, v),
        beam(BB, ST, 0.045, v),
        beam(BB, [0, wy, rz], 0.035, v),
        beam([0, 0.72, -0.18], [0, wy, rz], 0.03, v),
        beam(ST, [0, 0.9, -0.24], 0.03, S),
        box(0.16, 0.06, 0.24, 0x3a2a22, { y: 0.93, z: -0.26 }),
        arc(fz, -0.5, 0.9, 2), arc(rz, -1.4, 0.4, 2),
        // stem + swept handlebars
        beam(H1, [0, 0.98, 0.3], 0.035, S),
        beam([-0.08, 0.98, 0.3], [0.08, 0.98, 0.3], 0.03, S),
        beam([0.07, 0.98, 0.3], [0.26, 1.0, 0.17], 0.03, S),
        beam([-0.07, 0.98, 0.3], [-0.26, 1.0, 0.17], 0.03, S),
        box(0.08, 0.045, 0.045, T, { x: 0.29, y: 1.0, z: 0.15 }),
        box(0.08, 0.045, 0.045, T, { x: -0.29, y: 1.0, z: 0.15 }),
        // front basket
        box(0.36, 0.015, 0.3, BK, { y: 0.7, z: 0.6 }),
        box(0.36, 0.22, 0.015, BK, { y: 0.81, z: 0.75 }),
        box(0.36, 0.22, 0.015, BK, { y: 0.81, z: 0.45 }),
        box(0.015, 0.22, 0.3, BK, { x: 0.18, y: 0.81, z: 0.6 }),
        box(0.015, 0.22, 0.3, BK, { x: -0.18, y: 0.81, z: 0.6 }),
        box(0.06, 0.06, 0.04, 0xfff3c0, { y: 0.63, z: 0.47, glow: 0.7 }),
        // chain guard + rear carrier
        box(0.03, 0.09, 0.5, v, { x: 0.06, y: 0.32, z: -0.3 }),
        box(0.16, 0.02, 0.34, S, { y: 0.72, z: -0.5 }),
        beam([0, wy, rz], [0, 0.72, -0.64], 0.02, S),
        box(0.06, 0.03, 0.02, 0xe0302a, { y: 0.7, z: -0.675, glow: 0.4 }),
      );
    },
  },

  vending: {
    name: '自動販売機', kind: 'thing',
    variants: [0xd8312c, 0x2a62c9, 0xeef0f2],
    where: ['street', 'chinatown'], weight: 1,
    build: (v) => {
      const r = rng(5);
      const DR = [0xe8483c, 0x3a7bd5, 0xf2c230, 0x43a86b, 0xffffff, 0x8a4a2a, 0xff8a2a, 0x2a2a2a, 0x7fd0f0];
      const accent = v === 0xeef0f2 ? 0x2a62c9 : shade(v, 0.75);
      return merge(
        box(1.0, 1.8, 0.72, v, { y: 0.9 }),
        box(1.02, 0.06, 0.74, accent, { y: 1.8 }),
        // lit display window with rows of drinks
        box(0.84, 0.86, 0.02, 0xeef7ff, { y: 1.3, z: 0.36, glow: 0.9 }),
        repeat(18, (i) => {
          const c = i % 6, rw = Math.floor(i / 6);
          return box(0.09, 0.17, 0.03, DR[Math.floor(r() * DR.length)], { x: -0.325 + c * 0.13, y: 1.56 - rw * 0.27, z: 0.38, glow: 0.9 });
        }),
        repeat(3, (rw) => box(0.8, 0.025, 0.02, 0x3b4048, { y: 1.455 - rw * 0.27, z: 0.38, glow: 0.3 })),
        // payment panel, dispenser, top header
        box(0.18, 0.3, 0.04, 0x40464f, { x: 0.3, y: 0.7, z: 0.37 }),
        box(0.08, 0.06, 0.02, 0x7fe07a, { x: 0.3, y: 0.78, z: 0.395, glow: 0.8 }),
        box(0.62, 0.2, 0.04, 0x16161a, { x: -0.1, y: 0.3, z: 0.37 }),
        box(0.84, 0.12, 0.02, WHITE, { y: 1.68, z: 0.365, glow: 0.9 }),
      );
    },
  },

  postbox: {
    name: '郵便ポスト', kind: 'thing',
    where: ['street'], weight: 1,
    build: () => {
      const R = 0xd5221e, RD = shade(0xd5221e, 0.8), ry = P / 12;
      return merge(
        box(0.44, 0.06, 0.44, 0x8a8a86, { y: 0.03 }),
        cyl(0.225, 0.235, 0.08, 12, RD, { y: 0.1, ry }),
        cyl(0.2, 0.2, 0.95, 12, R, { y: 0.06 + 0.475, ry }),
        cyl(0.24, 0.24, 0.05, 12, R, { y: 1.035, ry }),
        cyl(0.12, 0.22, 0.13, 12, R, { y: 1.125, ry }),
        cyl(0.06, 0.12, 0.06, 12, R, { y: 1.22, ry }),
        sphere(0.05, 8, 4, R, { y: 1.26 }),
        // slot with lip, collection door, 〒 mark
        box(0.2, 0.035, 0.03, 0x161616, { y: 0.9, z: 0.19 }),
        box(0.24, 0.025, 0.05, RD, { y: 0.93, z: 0.195 }),
        box(0.22, 0.32, 0.02, RD, { y: 0.42, z: 0.193 }),
        box(0.02, 0.03, 0.01, 0x222222, { x: 0.07, y: 0.48, z: 0.205 }),
        box(0.1, 0.016, 0.01, WHITE, { y: 0.78, z: 0.198 }),
        box(0.1, 0.016, 0.01, WHITE, { y: 0.75, z: 0.198 }),
        box(0.016, 0.07, 0.01, WHITE, { y: 0.715, z: 0.198 }),
      );
    },
  },

  dog: {
    name: '犬', kind: 'animal',
    variants: [0xd9863a, 0x3a2a24],
    where: ['park', 'street'], weight: 1,
    move: 'walk', speed: 1.2,
    build: (v) => {
      const C = 0xf6ead6;
      const legs = [[-0.065, 0.15], [0.065, 0.15], [-0.065, -0.14], [0.065, -0.14]];
      return merge(
        capsule(0.1, 0.24, v, { rx: P / 2, y: 0.32 }),
        ico(0.085, 0, C, { y: 0.29, z: 0.15, sy: 1.15 }),
        legs.map(([x, z]) => [
          box(0.065, 0.24, 0.07, v, { x, y: 0.14, z }),
          box(0.07, 0.05, 0.085, C, { x, y: 0.025, z: z + 0.008 }),
        ]),
        // head
        sphere(0.095, 8, 6, v, { y: 0.5, z: 0.25 }),
        box(0.1, 0.075, 0.11, C, { y: 0.465, z: 0.35 }),
        box(0.04, 0.032, 0.03, BLACK, { y: 0.49, z: 0.405 }),
        cone(0.04, 0.085, 4, v, { x: -0.055, y: 0.61, z: 0.23, sz: 0.55, rz: 0.2 }),
        cone(0.04, 0.085, 4, v, { x: 0.055, y: 0.61, z: 0.23, sz: 0.55, rz: -0.2 }),
        box(0.022, 0.026, 0.012, EYE, { x: -0.04, y: 0.53, z: 0.335 }),
        box(0.022, 0.026, 0.012, EYE, { x: 0.04, y: 0.53, z: 0.335 }),
        cyl(0.078, 0.078, 0.028, 8, 0xe03a3a, { y: 0.43, z: 0.2, rx: 0.6 }),
        // curly tail over the back
        torus(0.05, 0.024, 4, 8, v, { ry: P / 2, y: 0.46, z: -0.2 }),
      );
    },
  },

  cat: {
    name: 'ねこ', kind: 'animal',
    where: ['chinatown', 'park'], weight: 1,
    move: 'walk', speed: 0.8,
    build: () => {
      const O = 0xe8913a, S = 0xbd621c, W = 0xfbf3e6;
      const legs = [[-0.04, 0.09], [0.04, 0.09], [-0.04, -0.1], [0.04, -0.1]];
      return merge(
        capsule(0.065, 0.17, O, { rx: P / 2, y: 0.18 }),
        repeat(3, (i) => cyl(0.068, 0.068, 0.022, 8, S, { rx: P / 2, y: 0.18, z: -0.09 + i * 0.065 })),
        legs.map(([x, z]) => [
          box(0.038, 0.14, 0.04, O, { x, y: 0.075, z }),
          box(0.042, 0.025, 0.05, W, { x, y: 0.0125, z: z + 0.006 }),
        ]),
        ico(0.05, 0, W, { y: 0.17, z: 0.12, sy: 1.1 }),
        // head
        sphere(0.07, 7, 5, O, { y: 0.27, z: 0.17 }),
        ico(0.036, 0, W, { y: 0.252, z: 0.222, sx: 1.25, sy: 0.8 }),
        cone(0.03, 0.06, 4, O, { x: -0.04, y: 0.335, z: 0.16, sz: 0.5, rz: 0.25 }),
        cone(0.03, 0.06, 4, O, { x: 0.04, y: 0.335, z: 0.16, sz: 0.5, rz: -0.25 }),
        box(0.016, 0.022, 0.01, 0x5ab33a, { x: -0.03, y: 0.285, z: 0.233 }),
        box(0.016, 0.022, 0.01, 0x5ab33a, { x: 0.03, y: 0.285, z: 0.233 }),
        box(0.014, 0.01, 0.01, 0xf08a9a, { y: 0.262, z: 0.252 }),
        // tail curving up
        beam([0, 0.2, -0.14], [0, 0.28, -0.2], 0.032, O),
        beam([0, 0.28, -0.2], [0, 0.37, -0.2], 0.03, O),
        beam([0, 0.37, -0.2], [0, 0.42, -0.165], 0.03, S),
      );
    },
  },

  person: {
    name: '人', kind: 'person',
    variants: [0xe8483c, 0x3a7bd5, 0xf2c230, 0x43a86b],
    where: ['plaza', 'street', 'park', 'waterfront', 'chinatown'], weight: 4,
    move: 'walk', speed: 1.3,
    build: (v) => {
      const i = [0xe8483c, 0x3a7bd5, 0xf2c230, 0x43a86b].indexOf(v);
      const styles = [
        { pants: 0x3b5c8c, hair: HAIR },
        { pants: 0xc8b48a, hair: 0x5a3825, shoe: 0x7a4a2a },
        { skirt: 0x2c3550, hair: HAIR, longHair: true, shoe: 0xc8303a },
        { pants: 0x555a60, hair: 0xa8a8a8, sleeve: 0x2f7a50 },
      ];
      const h = human({ shirt: v, ...styles[Math.max(0, i)] });
      return merge(h.parts);
    },
  },

  child: {
    name: '子ども', kind: 'person',
    variants: [0xff7a3c, 0x52c0e8, 0xf06aa8],
    where: ['park', 'plaza'], weight: 2,
    move: 'walk', speed: 1.5,
    build: (v) => {
      const i = [0xff7a3c, 0x52c0e8, 0xf06aa8].indexOf(v);
      const h = human({
        k: 0.7, headR: 0.118, legH: 0.48, torsoH: 0.37, torsoW: 0.3, torsoD: 0.18, stride: 0.08,
        shirt: v, shortSleeve: true, shorts: i === 2 ? null : 0x2c3e70, skirt: i === 2 ? 0x6a4fc0 : null, cheeks: true,
        hair: i === 1 ? 0x5a3825 : HAIR, shoe: [0x3a7bd5, 0xe8483c, 0xffffff][Math.max(0, i)], longHair: i === 2,
      });
      const p = h.parts;
      if (i === 0) {
        // yellow school cap
        p.push(cyl(0.13, 0.13, 0.02, 10, 0xffd21a, { y: h.headY + h.headR * 0.45 }));
        p.push(sphere(0.122, 8, 4, 0xffd21a, { y: h.headY + h.headR * 0.5, sy: 0.75 }));
      }
      if (i === 1) {
        // red randoseru backpack
        p.push(box(0.26, 0.28, 0.13, 0xc8202a, { y: h.sh - 0.17, z: -h.td / 2 - 0.065 }));
        p.push(box(0.265, 0.12, 0.135, shade(0xc8202a, 0.8), { y: h.sh - 0.09, z: -h.td / 2 - 0.066 }));
      }
      return merge(p);
    },
  },

  tourist: {
    name: '観光客', kind: 'person',
    where: ['plaza', 'chinatown', 'waterfront'], weight: 2,
    move: 'walk', speed: 1.0,
    build: () => {
      const STRAW = 0xead08a;
      const h = human({ shirt: 0x2bb3a3, shortSleeve: true, shorts: 0xd9c49a, shoe: 0xf2f2f2, hair: 0x8a5a30 });
      const p = h.parts, top = h.headY + h.headR * 0.55;
      return merge(
        p,
        // sun hat
        cyl(0.26, 0.26, 0.02, 10, STRAW, { y: top }),
        cyl(0.13, 0.145, 0.1, 10, STRAW, { y: top + 0.055 }),
        cyl(0.147, 0.147, 0.025, 10, 0xe0402a, { y: top + 0.025 }),
        // backpack
        box(0.3, 0.38, 0.14, 0xe8742a, { y: h.sh - 0.24, z: -h.td / 2 - 0.07 }),
        box(0.2, 0.14, 0.04, shade(0xe8742a, 0.8), { y: h.sh - 0.33, z: -h.td / 2 - 0.155 }),
        // camera on the chest + strap
        box(0.11, 0.075, 0.05, BLACK, { y: h.sh - 0.2, z: h.td / 2 + 0.03 }),
        cyl(0.026, 0.026, 0.045, 8, 0x4a4a52, { rx: P / 2, y: h.sh - 0.205, z: h.td / 2 + 0.075 }),
        beam([-0.05, h.sh - 0.17, h.td / 2 + 0.01], [-0.12, h.sh, 0.06], 0.015, BLACK),
        beam([0.05, h.sh - 0.17, h.td / 2 + 0.01], [0.12, h.sh, 0.06], 0.015, BLACK),
      );
    },
  },

  chef: {
    name: 'コックさん', kind: 'person',
    where: ['chinatown'], weight: 2,
    move: 'walk', speed: 1.0,
    build: () => {
      const h = human({ k: 0.9, shirt: 0xf7f7f2, pants: 0x3a3a40, shoe: 0x1a1a1a });
      const p = h.parts, top = h.headY + h.headR * 0.5;
      return merge(
        p,
        // red neckerchief + double-breasted buttons
        box(0.16, 0.05, 0.08, 0xd8322a, { y: h.sh - 0.01, z: h.td / 2 - 0.02 }),
        box(0.05, 0.08, 0.02, 0xd8322a, { y: h.sh - 0.06, z: h.td / 2 + 0.01, rz: 0.3 }),
        repeat(6, (j) => box(0.022, 0.022, 0.01, 0x9a9aa2, { x: (j % 2 ? 1 : -1) * 0.06, y: h.sh - 0.15 - Math.floor(j / 2) * 0.1, z: h.td / 2 + 0.005 })),
        // tall white toque
        cyl(0.115, 0.115, 0.05, 8, 0xe6e6e0, { y: top + 0.02 }),
        cyl(0.12, 0.112, 0.2, 8, WHITE, { y: top + 0.14 }),
        sphere(0.145, 8, 4, WHITE, { y: top + 0.24, sy: 0.55 }),
      );
    },
  },

  lion_dancer: {
    name: '獅子舞', kind: 'person',
    where: ['chinatown'], weight: 1,
    move: 'walk', speed: 1.5,
    build: () => {
      const R = 0xd8282a, RD = 0x9a1418, Y = 0xf2c230, G = 0x2fae5a, B = 0x2f74d0, W = 0xfffaf0, K = 0x1a1a1a;
      const legs = (z, ph) => [-1, 1].map((s) => [
        beam([s * 0.13, 0.78, z], [s * 0.13, 0.08, z + s * ph], 0.13, Y),
        box(0.17, 0.08, 0.15, 0xe83a5a, { x: s * 0.13, y: 0.17, z: z + s * ph * 0.8 }),
        box(0.14, 0.08, 0.22, K, { x: s * 0.13, y: 0.04, z: z + s * ph + 0.03 }),
      ]);
      // body profile in (length, height); turned so the length runs along Z
      const body = extrude([[-1.0, 0.72], [0.6, 0.72], [0.6, 1.32], [0.15, 1.42], [-0.45, 1.3], [-0.92, 1.08], [-1.05, 0.86]], 0.76, R, { ry: -P / 2 });
      const spine = [[0.5, 1.4], [0.15, 1.46], [-0.45, 1.34], [-0.92, 1.12]];
      return merge(group([
        legs(0.42, 0.12), legs(-0.6, -0.1),
        body,
        repeat(3, (i) => beam([0, spine[i][1], spine[i][0]], [0, spine[i + 1][1], spine[i + 1][0]], 0.1, Y)),
        [-1, 1].map((s) => box(0.02, 0.08, 1.25, B, { x: s * 0.385, y: 1.05, z: -0.25 })),
        [-1, 1].map((s) => box(0.02, 0.05, 1.25, G, { x: s * 0.385, y: 1.14, z: -0.25 })),
        [-1, 1].map((s) => box(0.05, 0.06, 1.62, W, { x: s * 0.385, y: 0.73, z: -0.2 })),
        dodeca(0.16, Y, { y: 1.0, z: -1.02 }),
        // big head
        dodeca(0.33, R, { y: 1.28, z: 0.78, sx: 1.15, sy: 0.92 }),
        box(0.62, 0.1, 0.42, Y, { y: 1.47, z: 0.8 }),
        [-1, 1].map((s) => [
          sphere(0.09, 6, 4, W, { x: s * 0.16, y: 1.5, z: 1.0 }),
          box(0.07, 0.07, 0.03, K, { x: s * 0.16, y: 1.5, z: 1.09 }),
          box(0.18, 0.04, 0.16, G, { x: s * 0.16, y: 1.585, z: 0.98 }),
          cone(0.06, 0.14, 4, Y, { x: s * 0.35, y: 1.52, z: 0.68, rz: -s * 0.6 }),
          ico(0.06, 0, 0xf06aa8, { x: s * 0.33, y: 1.2, z: 1.0 }),
        ]),
        cone(0.05, 0.16, 5, Y, { y: 1.66, z: 0.86, rx: 0.3 }),
        // open mouth: gold lip, teeth, red interior, lower jaw, white beard
        box(0.42, 0.08, 0.1, Y, { y: 1.25, z: 1.1 }),
        box(0.46, 0.035, 0.04, W, { y: 1.19, z: 1.12 }),
        box(0.44, 0.08, 0.12, 0x5a0a10, { y: 1.13, z: 1.06 }),
        box(0.56, 0.1, 0.36, RD, { y: 1.04, z: 0.92 }),
        box(0.5, 0.04, 0.05, Y, { y: 1.09, z: 1.11 }),
        dodeca(0.12, W, { y: 0.95, z: 1.0, sx: 1.7, sy: 0.8 }),
      ], { sz: 0.94 }));
    },
  },

  streetlamp: {
    name: '街灯', kind: 'thing',
    where: ['street', 'waterfront'], weight: 2,
    build: () => {
      const G = 0x7a8590, GD = 0x4c545c;
      return merge(
        cyl(0.12, 0.15, 0.3, 8, GD, { y: 0.15 }),
        cyl(0.05, 0.065, 4.1, 8, G, { y: 0.3 + 2.05 }),
        beam([0, 4.3, 0], [0, 4.42, 0.25], 0.07, G),
        beam([0, 4.42, 0.25], [0, 4.45, 0.62], 0.06, G),
        box(0.22, 0.08, 0.5, GD, { y: 4.45, z: 0.85 }),
        box(0.18, 0.02, 0.42, 0xfff3c4, { y: 4.405, z: 0.85, glow: 1 }),
        // harbour-town banner
        box(0.01, 0.75, 0.3, 0x2c7fd8, { y: 2.9, z: 0.2 }),
        box(0.012, 0.12, 0.3, WHITE, { y: 3.0, z: 0.2 }),
        beam([0, 3.28, 0], [0, 3.28, 0.36], 0.025, GD),
      );
    },
  },

  gaslamp: {
    name: 'ガス灯', kind: 'thing',
    where: ['street', 'plaza'], weight: 1,
    build: () => {
      const G = 0x234a3a, GL = 0xffe39a, q = P / 4;
      const corner = (rb, rt, y0, y1) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) =>
        beam([(a * rb) / Math.SQRT2, y0, (b * rb) / Math.SQRT2], [(a * rt) / Math.SQRT2, y1, (b * rt) / Math.SQRT2], 0.025, G));
      return merge(
        box(0.42, 0.25, 0.42, G, { y: 0.125 }),
        cyl(0.13, 0.19, 0.45, 8, G, { y: 0.475 }),
        cyl(0.065, 0.085, 2.1, 8, G, { y: 0.7 + 1.05 }),
        cyl(0.1, 0.1, 0.06, 8, G, { y: 1.5 }),
        cyl(0.09, 0.07, 0.12, 8, G, { y: 2.74 }),
        box(0.62, 0.04, 0.04, G, { y: 2.6 }),
        sphere(0.035, 6, 4, G, { x: 0.31, y: 2.6 }),
        sphere(0.035, 6, 4, G, { x: -0.31, y: 2.6 }),
        cyl(0.16, 0.08, 0.1, 4, G, { y: 2.85, ry: q }),
        cyl(0.21, 0.15, 0.38, 4, GL, { y: 3.09, ry: q, glow: 1 }),
        corner(0.155, 0.215, 2.9, 3.28),
        cone(0.28, 0.16, 4, G, { y: 3.36, ry: q }),
        cone(0.035, 0.08, 6, G, { y: 3.47 }),
      );
    },
  },

  hydrant: {
    name: '消火栓', kind: 'thing',
    where: ['street'], weight: 1,
    build: () => {
      const R = 0xd82a20, RD = shade(0xd82a20, 0.8), S = 0xc9ced4;
      return merge(
        cyl(0.16, 0.18, 0.06, 10, RD, { y: 0.03 }),
        cyl(0.12, 0.13, 0.55, 10, R, { y: 0.335 }),
        cyl(0.15, 0.15, 0.05, 10, RD, { y: 0.62 }),
        cyl(0.05, 0.14, 0.12, 10, R, { y: 0.705 }),
        cyl(0.03, 0.03, 0.04, 6, S, { y: 0.785 }),
        cyl(0.045, 0.045, 0.14, 8, R, { rz: P / 2, x: 0.17, y: 0.48 }),
        cyl(0.045, 0.045, 0.14, 8, R, { rz: P / 2, x: -0.17, y: 0.48 }),
        cyl(0.052, 0.052, 0.035, 8, S, { rz: P / 2, x: 0.25, y: 0.48 }),
        cyl(0.052, 0.052, 0.035, 8, S, { rz: P / 2, x: -0.25, y: 0.48 }),
        box(0.12, 0.08, 0.02, WHITE, { y: 0.32, z: 0.125 }),
      );
    },
  },

  planter: {
    name: '花壇', kind: 'plant',
    where: ['plaza', 'street', 'park'], weight: 1,
    build: () => {
      const r = rng(3);
      return merge(
        box(2.0, 0.45, 0.6, 0xb55a3c, { y: 0.225 }),
        box(2.04, 0.05, 0.64, 0xd8c8b0, { y: 0.47 }),
        box(1.9, 0.02, 0.5, SOIL, { y: 0.5 }),
        repeat(4, (i) => dodeca(0.27, i % 2 ? GREEN : LEAF, { x: -0.72 + i * 0.48, y: 0.56, sy: 0.55, sz: 0.85 })),
        repeat(20, (i) => {
          const x = -0.85 + (i % 10) * 0.19 + (r() - 0.5) * 0.06;
          const z = (Math.floor(i / 10) ? 0.11 : -0.11) + (r() - 0.5) * 0.06;
          return ico(0.055, 0, FLOWERS[i % FLOWERS.length], { x, y: 0.68 + r() * 0.04, z, sy: 0.7 });
        }),
      );
    },
  },

  shrub: {
    name: '植え込み', kind: 'plant',
    where: ['park', 'street'], weight: 2,
    build: () => {
      const r = rng(9);
      return merge(
        ico(0.66, 1, 0x3c8a3e, { y: 0.54, sy: 0.82 }),
        dodeca(0.36, 0x4fa64a, { x: 0.41, y: 0.5, z: 0.22 }),
        dodeca(0.34, 0x469c44, { x: -0.41, y: 0.52, z: -0.18 }),
        dodeca(0.34, 0x58b052, { x: -0.1, y: 0.9, z: 0.24 }),
        repeat(7, (i) => {
          const a = i * 0.9 + r(), e = 0.3 + r() * 0.8, R = 0.66;
          return ico(0.06, 0, i % 3 ? 0xf27ab0 : 0xffffff, { x: Math.sin(a) * Math.cos(e) * R, y: 0.56 + Math.sin(e) * R * 0.82, z: Math.cos(a) * Math.cos(e) * R });
        }),
      );
    },
  },

  signboard: {
    name: '看板', kind: 'thing',
    where: ['chinatown'], weight: 2,
    build: () => {
      const R = 0xc8201e, K = 0x3a2420, GT = 0x2f8a5a, r = rng(21);
      const glyph = (cy) => repeat(3, () => {
        const horiz = r() > 0.4;
        return horiz
          ? box(0.18 + r() * 0.12, 0.035, 0.02, GOLD, { x: (r() - 0.5) * 0.08, y: cy + (r() - 0.5) * 0.18, z: 0.05, glow: 0.8 })
          : box(0.035, 0.12 + r() * 0.1, 0.02, GOLD, { x: (r() - 0.5) * 0.22, y: cy + (r() - 0.5) * 0.06, z: 0.05, glow: 0.8 });
      });
      return merge(
        box(0.74, 0.1, 0.46, K, { y: 0.05 }),
        box(0.06, 0.2, 0.06, K, { x: -0.25, y: 0.2 }),
        box(0.06, 0.2, 0.06, K, { x: 0.25, y: 0.2 }),
        box(0.6, 1.42, 0.08, R, { y: 1.0, glow: 0.8 }),
        box(0.68, 0.05, 0.1, GOLD, { y: 1.73, glow: 0.5 }),
        box(0.68, 0.05, 0.1, GOLD, { y: 0.27, glow: 0.5 }),
        box(0.05, 1.5, 0.1, GOLD, { x: -0.315, y: 1.0, glow: 0.5 }),
        box(0.05, 1.5, 0.1, GOLD, { x: 0.315, y: 1.0, glow: 0.5 }),
        glyph(1.47), glyph(1.15), glyph(0.83), glyph(0.51),
        // little tiled roof with upturned eaves
        extrude([[-0.46, 0], [0.46, 0], [0.54, 0.1], [0.32, 0.07], [0.12, 0.17], [-0.12, 0.17], [-0.32, 0.07], [-0.54, 0.1]], 0.3, GT, { y: 1.755 }),
        box(0.3, 0.03, 0.31, GOLD, { y: 1.93 }),
        sphere(0.04, 6, 4, GOLD, { y: 1.97 }),
      );
    },
  },

  stroller: {
    name: 'ベビーカー', kind: 'thing',
    where: ['park', 'plaza'], weight: 1,
    build: () => {
      const F = 0x2aa7a0, C = 0xf2786a, S = SILVER, K = 0x26262b;
      const wheels = [[-0.22, 0.28], [0.22, 0.28], [-0.22, -0.3], [0.22, -0.3]];
      const hc = [0, 0.62, -0.14], hr = 0.24;
      return merge(
        wheels.map(([x, z]) => [
          cyl(0.08, 0.08, 0.04, 8, K, { rz: P / 2, x, y: 0.08, z }),
          cyl(0.03, 0.03, 0.045, 6, S, { rz: P / 2, x, y: 0.08, z }),
        ]),
        [-1, 1].map((s) => [
          beam([s * 0.2, 0.08, -0.3], [s * 0.2, 0.96, -0.44], 0.03, S),
          beam([s * 0.2, 0.08, 0.28], [s * 0.2, 0.46, 0.04], 0.03, S),
        ]),
        beam([-0.21, 0.96, -0.44], [0.21, 0.96, -0.44], 0.04, K),
        box(0.32, 0.07, 0.34, 0x3a3a40, { y: 0.24, z: -0.02 }),
        // seat bucket + back
        box(0.38, 0.17, 0.48, F, { y: 0.48, z: 0.0 }),
        box(0.38, 0.32, 0.06, F, { y: 0.62, z: -0.22, rx: 0.2 }),
        box(0.4, 0.04, 0.06, shade(F, 0.8), { y: 0.58, z: 0.25 }),
        // folding canopy
        repeat(4, (i) => {
          const a = -1.25 + i * 0.68;
          return box(0.42, 0.03, 0.18, i % 2 ? shade(C, 0.85) : C, { x: 0, y: hc[1] + Math.cos(a) * hr, z: hc[2] + Math.sin(a) * hr, rx: a });
        }),
      );
    },
  },

  scooter: {
    name: 'スクーター', kind: 'vehicle',
    where: ['street'], weight: 1,
    build: () => {
      const B = 0x49bfa6, CR = 0xf6efdc, K = 0x26262b, S = SILVER;
      return merge(
        [0.58, -0.6].map((z) => [
          cyl(0.21, 0.21, 0.11, 10, K, { rz: P / 2, y: 0.2, z }),
          cyl(0.1, 0.1, 0.115, 8, S, { rz: P / 2, y: 0.2, z }),
        ]),
        // floor, leg shield, front fender
        box(0.34, 0.08, 0.55, CR, { y: 0.33, z: 0.05 }),
        box(0.44, 0.58, 0.08, B, { y: 0.62, z: 0.36, rx: -0.2 }),
        box(0.2, 0.1, 0.36, B, { y: 0.47, z: 0.6 }),
        beam([0, 0.2, 0.58], [0, 0.48, 0.56], 0.05, K),
        box(0.12, 0.14, 0.1, B, { y: 0.92, z: 0.38 }),
        // handlebar cover with headlight + mirrors
        box(0.56, 0.12, 0.17, B, { y: 1.0, z: 0.43 }),
        box(0.16, 0.09, 0.03, 0xfff6c8, { y: 1.0, z: 0.52, glow: 0.8 }),
        beam([0.22, 1.05, 0.42], [0.27, 1.22, 0.4], 0.02, S),
        beam([-0.22, 1.05, 0.42], [-0.27, 1.22, 0.4], 0.02, S),
        box(0.09, 0.06, 0.02, K, { x: 0.28, y: 1.24, z: 0.4 }),
        box(0.09, 0.06, 0.02, K, { x: -0.28, y: 1.24, z: 0.4 }),
        box(0.1, 0.035, 0.035, K, { x: 0.33, y: 1.02, z: 0.4 }),
        box(0.1, 0.035, 0.035, K, { x: -0.33, y: 1.02, z: 0.4 }),
        // rear body, seat, rack, tail light, muffler
        extrude([[-0.9, 0.45], [-0.9, 0.62], [-0.78, 0.74], [-0.2, 0.74], [-0.18, 0.36], [-0.55, 0.32]], 0.36, B, { ry: -P / 2 }),
        box(0.3, 0.1, 0.6, 0x3a2a26, { y: 0.79, z: -0.46 }),
        box(0.3, 0.03, 0.22, S, { y: 0.78, z: -0.86 }),
        box(0.16, 0.06, 0.03, 0xe0302a, { y: 0.66, z: -0.905, glow: 0.6 }),
        cyl(0.045, 0.045, 0.36, 6, S, { rx: P / 2, x: 0.16, y: 0.27, z: -0.62 }),
      );
    },
  },

  shishi_statue: {
    name: '石の獅子', kind: 'thing',
    where: ['chinatown'], weight: 1,
    build: () => {
      const ST = 0xb6b3aa, SD = 0x8f8c84, SL = 0xcac7bd, DK = 0x55524c;
      return merge(
        // plinth
        box(1.1, 0.1, 1.0, SD, { y: 0.05 }),
        box(0.96, 0.52, 0.86, shade(SD, 1.08), { y: 0.36 }),
        box(1.04, 0.08, 0.94, SL, { y: 0.66 }),
        // sitting lion
        dodeca(0.36, ST, { y: 0.95, z: -0.12, sx: 0.85, sz: 0.95 }),
        dodeca(0.29, ST, { y: 1.22, z: 0.06, sy: 1.15 }),
        [-1, 1].map((s) => [
          box(0.13, 0.52, 0.15, ST, { x: s * 0.17, y: 0.95, z: 0.24 }),
          box(0.17, 0.08, 0.2, SL, { x: s * 0.17, y: 0.74, z: 0.29 }),
          dodeca(0.13, ST, { x: s * 0.27, y: 0.82, z: -0.06 }),
        ]),
        sphere(0.11, 8, 5, SL, { x: 0.33, y: 0.81, z: 0.32 }),
        // curly mane + head
        repeat(9, (i) => {
          const a = -1.9 + (i / 8) * 3.8;
          return ico(0.13, 0, SD, { x: Math.sin(a) * 0.27, y: 1.6 + Math.cos(a) * 0.24, z: 0.05 });
        }),
        dodeca(0.27, ST, { y: 1.58, z: 0.16, sy: 0.92 }),
        box(0.38, 0.08, 0.1, SD, { y: 1.72, z: 0.35 }),
        [-1, 1].map((s) => [
          ico(0.055, 0, SL, { x: s * 0.11, y: 1.65, z: 0.37 }),
          box(0.03, 0.03, 0.02, DK, { x: s * 0.11, y: 1.65, z: 0.425 }),
          box(0.08, 0.1, 0.06, ST, { x: s * 0.27, y: 1.72, z: 0.12 }),
        ]),
        box(0.22, 0.11, 0.14, SL, { y: 1.55, z: 0.4 }),
        box(0.08, 0.05, 0.04, DK, { y: 1.58, z: 0.47 }),
        box(0.24, 0.07, 0.06, DK, { y: 1.45, z: 0.38 }),
        box(0.26, 0.05, 0.12, ST, { y: 1.39, z: 0.34 }),
        // flame-like tail
        dodeca(0.13, SD, { y: 1.1, z: -0.48 }),
        dodeca(0.1, SD, { y: 1.3, z: -0.46 }),
      );
    },
  },

  umbrella: {
    name: 'かさ', kind: 'thing',
    variants: [0xe8eef2, 0x24365e, 0xe0475a],
    where: ['street', 'plaza'], weight: 1,
    build: (v) => {
      const hc = v === 0xe8eef2 ? 0xf4f4f4 : 0x7a4a2a;
      const hook = [[0, 0.76, 0], [0, 0.85, 0], [0, 0.885, 0.03], [0, 0.88, 0.075], [0, 0.85, 0.095], [0, 0.82, 0.088]];
      return merge(
        cyl(0.004, 0.007, 0.07, 6, SILVER, { y: 0.035 }),
        lathe([[0.007, 0.06], [0.03, 0.15], [0.042, 0.33], [0.036, 0.55], [0.012, 0.66], [0.007, 0.665]], 8, v),
        cyl(0.044, 0.044, 0.025, 8, shade(v, 0.75), { y: 0.42 }),
        box(0.02, 0.04, 0.012, shade(v, 0.75), { y: 0.42, z: 0.045 }),
        cyl(0.007, 0.007, 0.12, 6, SILVER, { y: 0.72 }),
        repeat(hook.length - 1, (i) => beam(hook[i], hook[i + 1], 0.024, hc)),
      );
    },
  },
};
