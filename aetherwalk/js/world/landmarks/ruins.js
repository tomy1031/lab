// js/world/landmarks/ruins.js — FABLE
// 遺跡と自然の見どころ：目覚めの石舞台、祈りの桟橋、落ちた橋、岬の灯台跡、風穴のアーチ、大樹ヨルハ。
import * as THREE from 'three';
import { part, merge, G, tubeGeo } from '../geo.js';
import { structMaterial, strataColor, toWorld } from './common.js';

const stone = 0xb5b0a2, stoneD = 0x858072, stoneL = 0xd2cdbd;

function pillar(P, x, z, h, r = 0.48, broken = false) {
  P.push(part(G.box(r * 2.9, 0.45, r * 2.9), { pos: [x, 0.5, z], color: stoneD }));
  P.push(part(G.cyl(r * 0.86, r, h, 8, 3), { pos: [x, 0.7 + h / 2, z], bottom: stoneD, top: stone, jitter: 0.025, jitterY: 0, vary: 0.1 }));
  if (!broken) P.push(part(G.box(r * 2.6, 0.4, r * 2.6), { pos: [x, 0.9 + h, z], color: stoneL }));
  else P.push(part(G.cone(r * 0.86, r * 1.1, 5), { pos: [x + 0.08, 0.7 + h + r * 0.45, z], rot: [0.25, 0.4, 0.2], color: stone, jitter: 0.06 }));
}

// 目覚めの石舞台：円い舞台と、北（眺め）を縁どる門
export function buildStart(env, def) {
  const P = [];
  P.push(part(G.cyl(8.4, 8.9, 0.5, 24, 1, true), { pos: [0, 0.05, 0], bottom: stoneD, top: stone, vary: 0.08 }));
  // 舞台の敷石：同心の輪に石を 1 枚ずつ敷く。古びた暖かい灰色、ところどころ苔。目地は細く淡く（床が壁のように見えないように）
  P.push(part(G.disc(8.4, 24), { pos: [0, 0.27, 0], color: 0x8a8474 }));
  const rr = [0, 1.9, 2.25, 3.9, 4.2, 6.1, 6.45, 8.38];
  const tones = [[0xc4bca5, 0xbab29a], [0xf2c66b, 0xf2c66b], [0xb4ac95, 0xaba38c], [0xc2b9a1, 0xc2b9a1], [0xb0a891, 0xa59d86], [0xbcb39b, 0xbcb39b], [0xa79f88, 0x9d957e]];
  const moss = [0x8d9672, 0x7f8a66];
  for (let i = 0; i < rr.length - 1; i++) {
    const seg = i === 0 ? 6 : i % 2 ? 1 : 6 + i * 3, gap = i % 2 ? 0 : 0.022 / Math.max(1, rr[i + 1]);
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * Math.PI * 2 + i * 0.41, al = (Math.PI * 2) / seg;
      const mossy = i >= 4 && i % 2 === 0 && (j * 7 + i) % 5 === 2;
      P.push(part(new THREE.RingGeometry(Math.max(0.12, rr[i] + 0.02), rr[i + 1] - 0.02, seg === 1 ? 28 : 3, 1, a0 + gap, al - gap * 2).rotateX(-Math.PI / 2), { pos: [0, 0.3, 0], color: mossy ? moss[j % 2] : tones[i][j % 2], vary: 0.05, glow: i === 1 ? 0.8 : 0 }));
    }
  }
  // 風の羅針：金の輪から 8 方へ細い筋。北の筋は長く、先に矢じり（出発の向き）
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, L = k === 0 ? 3.6 : k % 2 ? 1.1 : 1.7, r0 = 2.35;
    const cx = Math.sin(a) * (r0 + L / 2), cz = -Math.cos(a) * (r0 + L / 2);
    P.push(part(G.box(k === 0 ? 0.14 : 0.08, 0.02, L), { pos: [cx, 0.315, cz], rot: [0, -a, 0], color: 0xf2c66b, glow: 0.7 }));
  }
  P.push(part(G.cone(0.34, 0.7, 3), { pos: [0, 0.32, -(2.35 + 3.6 + 0.3)], rot: [-Math.PI / 2, 0, 0], scale: [1, 1, 0.08], color: 0xf2c66b, glow: 0.8 }));
  P.push(part(G.cyl(9.6, 10.2, 0.25, 20), { pos: [0, -0.1, 0], color: stoneD, vary: 0.1 }));
  // 北へ降りる石段と、段の下の小さな灯籠（巡礼路のはじまり）
  const hl = (lx, lz) => env.hf.heightAt(def.x + lx, def.z + lz) - def.y;
  for (let k = 0; k < 3; k++) {
    const z = -(10.6 + k * 0.8), top = -0.2 - k * 0.25, bot = Math.min(hl(0, z), top) - 0.5;
    P.push(part(G.box(4.6 - k * 0.3, top - bot, 0.86), { pos: [0, (top + bot) / 2, z], bottom: stoneD, top: k % 2 ? stone : 0xbdb6a3, jitter: 0.02, vary: 0.08 }));
  }
  for (const sx of [-3.3, 3.3]) {
    const z = -14.6, g = hl(sx, z);
    P.push(part(G.box(0.62, 0.3, 0.62), { pos: [sx, g + 0.1, z], color: stoneD }));
    P.push(part(G.cyl(0.13, 0.17, 0.95, 6), { pos: [sx, g + 0.72, z], bottom: stone, top: stoneL }));
    P.push(part(G.box(0.4, 0.3, 0.4), { pos: [sx, g + 1.34, z], color: stoneL }));
    P.push(part(G.octa(0.12), { pos: [sx, g + 1.34, z], scale: [1, 1.3, 1], color: 0xfff0c0, glow: 1 }));
    P.push(part(G.cone(0.34, 0.34, 4), { pos: [sx, g + 1.66, z], rot: [0, Math.PI / 4, 0], color: 0x4f79b8 }));
    const wp = toWorld(def, sx, g + 1.34, z);
    env.fx.glows.add({ x: wp.x, y: wp.y, z: wp.z, size: 1.1, color: 0xffc46a, mode: 1, intensity: 0.8, flicker: 0.1 });
    const cp = toWorld(def, sx, 0, z);
    env.col.addCollider({ x: cp.x, z: cp.z, r: 0.3, y0: def.y + g - 0.5, y1: def.y + g + 2.0, kind: 'structure' });
  }
  for (let k = 0; k < 3; k++) {
    const z = -(10.6 + k * 0.8), a = toWorld(def, -2.2, 0, z - 0.4), b = toWorld(def, 2.2, 0, z + 0.4);
    env.col.addPlatform({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), y: def.y - 0.2 - k * 0.25, surface: 'stone' });
  }
  // 北の門（-z が北＝正面）
  pillar(P, -5.2, -7.0, 5.6, 0.4); pillar(P, 5.2, -7.0, 5.6, 0.4);
  P.push(part(G.box(2.4, 0.55, 0.9), { pos: [-4.5, 6.75, -7.0], rot: [0, 0, 0.1], color: stoneL, jitter: 0.04 }));
  P.push(part(G.box(1.9, 0.55, 0.9), { pos: [4.7, 6.7, -7.0], rot: [0, 0, -0.12], color: stoneL, jitter: 0.04 }));
  P.push(part(G.octa(0.16), { pos: [-5.2, 3.6, -6.56], scale: [1, 1.6, 0.4], color: 0xbfe9ff, glow: 1 }));
  P.push(part(G.octa(0.16), { pos: [5.2, 3.6, -6.56], scale: [1, 1.6, 0.4], color: 0xbfe9ff, glow: 1 }));
  // まわりの折れた柱
  const ring = [[-7.2, -2.6, 3.4, true], [7.2, -2.6, 4.4, false], [-7.4, 2.4, 2.0, true], [7.5, 2.6, 5.4, true], [-5.2, 5.9, 4.8, false], [5.4, 5.8, 1.6, true], [0.4, 7.9, 3.0, true]];
  for (const [x, z, h, b] of ring) pillar(P, x, z, h, 0.46, b);
  P.push(part(G.box(4.6, 0.6, 1.0), { pos: [6.3, 6.25, 4.2], rot: [0, 1.1, 0.05], color: stoneL, jitter: 0.04 }));   // のこった梁
  // 倒れた柱
  P.push(part(G.cyl(0.42, 0.46, 3.6, 8), { pos: [-9.6, 0.36, 6.4], rot: [Math.PI / 2, 0, 0.7], color: stone, vary: 0.1 }));
  P.push(part(G.cyl(0.42, 0.46, 1.4, 8), { pos: [-11.6, 0.3, 3.0], rot: [Math.PI / 2, 0, 1.9], color: stone, vary: 0.1 }));
  const mesh = new THREE.Mesh(merge(P), structMaterial({ glow: 0x7fe9ff, amt: 0.5, night: 0.6 }));
  env.col.addPlatform({ x: def.x, z: def.z, r: 8.4, y: def.y + 0.28, surface: 'stone' });
  for (const [x, z] of [[-5.2, -7.0], [5.2, -7.0], ...ring.map((r) => [r[0], r[1]])]) {
    const p = toWorld(def, x, 0, z);
    env.col.addCollider({ x: p.x, z: p.z, r: 0.62, y0: def.y - 1, y1: def.y + 7, kind: 'structure' });
  }
  return mesh;
}

// 祈りの桟橋：湖へのびる木の桟橋と、先の祈り台
export function buildPier(env, def, lakeLevel) {
  const P = [];
  const wood = 0x8a6a4a, woodD = 0x5e4632, woodL = 0xa98862;
  const y = lakeLevel + 1.15 - def.y;       // ローカルの床の高さ
  const L = 28;
  for (let i = 0; i < 14; i++) {
    P.push(part(G.box(3.0, 0.12, 1.92), { pos: [0, y - 0.06, -1 - i * 2], color: i % 2 ? wood : woodL, vary: 0.12 }));
  }
  for (let i = 0; i <= 4; i++) for (const sx of [-1.45, 1.45]) {
    P.push(part(G.cyl(0.13, 0.15, 3.6, 5), { pos: [sx, y - 1.5, -1 - i * 6.6], color: woodD }));
  }
  P.push(part(G.box(0.14, 0.14, L), { pos: [-1.45, y + 0.02, -L / 2 - 0.2], color: woodD }));
  P.push(part(G.box(0.14, 0.14, L), { pos: [1.45, y + 0.02, -L / 2 - 0.2], color: woodD }));
  // 祈り台
  P.push(part(G.box(6.4, 0.14, 5.0), { pos: [0, y - 0.07, -L - 2.4], color: woodL, vary: 0.1 }));
  for (const sx of [-3.0, 3.0]) for (const sz of [-0.3, -4.5]) P.push(part(G.cyl(0.14, 0.16, 3.6, 5), { pos: [sx, y - 1.5, -L + sz], color: woodD }));
  // 二本の柱と、渡した綱の小旗、灯
  for (const sx of [-2.6, 2.6]) {
    P.push(part(G.cyl(0.11, 0.15, 4.4, 6), { pos: [sx, y + 2.2, -L - 4.6], bottom: woodD, top: wood }));
    P.push(part(G.octa(0.2), { pos: [sx, y + 4.65, -L - 4.6], scale: [1, 1.3, 1], color: 0xfff0c0, glow: 1 }));
    P.push(part(G.cone(0.34, 0.24, 4), { pos: [sx, y + 5.0, -L - 4.6], rot: [0, Math.PI / 4, 0], color: 0x4f79b8 }));
  }
  P.push(part(G.box(5.2, 0.04, 0.04), { pos: [0, y + 3.9, -L - 4.6], color: woodD }));
  const flags = [0x7fe9ff, 0xffd76a, 0xfffbe8, 0x7fe9ff, 0xffd76a];
  for (let i = 0; i < 5; i++) {
    const tri = new THREE.BufferGeometry();
    const x = -2 + i;
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x - 0.22, 0, 0, x + 0.22, 0, 0, x, -0.5, 0, x + 0.22, 0, 0, x - 0.22, 0, 0, x, -0.5, 0]), 3));
    tri.computeVertexNormals();
    P.push(part(tri, { pos: [0, y + 3.88, -L - 4.6], color: flags[i], sway: (p) => Math.max(0, (y + 3.88 - p.y)) * 0.6 }));
  }
  const mesh = new THREE.Mesh(merge(P), structMaterial({ glow: 0xffc46a, amt: 0.05, night: 1.0 }));
  // 足場
  const a = toWorld(def, -1.5, 0, 0), b = toWorld(def, 1.5, 0, -L);
  env.col.addPlatform({ x0: a.x, x1: b.x, z0: a.z, z1: b.z, y: lakeLevel + 1.15, surface: 'wood' });
  const c = toWorld(def, -3.2, 0, -L), d = toWorld(def, 3.2, 0, -L - 4.9);
  env.col.addPlatform({ x0: c.x, x1: d.x, z0: c.z, z1: d.z, y: lakeLevel + 1.15, surface: 'wood' });
  for (const sx of [-2.6, 2.6]) {
    const p = toWorld(def, sx, y + 4.65, -L - 4.6);
    env.col.addCollider({ x: p.x, z: p.z, r: 0.2, y0: lakeLevel, y1: lakeLevel + 6, kind: 'structure' });
    env.fx.glows.add({ x: p.x, y: p.y, z: p.z, size: 1.15, color: 0xffc46a, mode: 1, intensity: 0.6, flicker: 0.1 });
  }
  return { mesh, end: toWorld(def, 0, y, -L - 4.9), floorY: lakeLevel + 1.15 };
}

// 落ちた橋：両岸の橋脚と、流れに落ちた桁
export function buildFallenBridge(env, def) {
  const P = [];
  for (const s of [-1, 1]) {
    const x = s * 9.5;
    P.push(part(G.box(3.4, 5.2, 4.6), { pos: [x, 1.8, 0], bottom: stoneD, top: stone, jitter: 0.08, vary: 0.1 }));
    P.push(part(G.box(4.0, 0.5, 5.2), { pos: [x, 4.6, 0], color: stoneL, jitter: 0.05 }));
    P.push(part(G.box(3.2, 0.9, 4.4), { pos: [x - s * 2.6, 4.2, 0], rot: [0, 0, s * 0.42], color: stone, jitter: 0.08 }));   // のこった迫り出し
    P.push(part(G.box(0.4, 1.0, 0.4), { pos: [x + s * 1.4, 5.3, 2.2], color: stoneL }));
    P.push(part(G.box(0.4, 0.6, 0.4), { pos: [x + s * 1.4, 5.1, -2.2], color: stoneL }));
  }
  P.push(part(G.box(4.2, 1.0, 4.0), { pos: [1.2, -0.1, 3.4], rot: [0.3, 0.5, 0.25], color: stone, jitter: 0.1 }));
  P.push(part(G.box(2.4, 0.9, 2.2), { pos: [-2.6, -0.2, -3.6], rot: [-0.2, 1.1, -0.3], color: stoneD, jitter: 0.1 }));
  const mesh = new THREE.Mesh(merge(P), structMaterial({}));
  for (const s of [-1, 1]) {
    const p = toWorld(def, s * 9.5, 0, 0);
    env.col.addCollider({ x: p.x, z: p.z, r: 2.6, y0: def.y - 2, y1: def.y + 5, kind: 'structure' });
  }
  return mesh;
}

// 岬の灯台跡：折れた白い円塔
export function buildLighthouse(env, def) {
  const P = [];
  const chalk = 0xf3efe4, chalkD = 0xcfc8b6, chalkS = 0xb3ab98;
  P.push(part(G.cyl(3.5, 3.9, 0.7, 12), { pos: [0, 0.2, 0], bottom: chalkS, top: chalkD, vary: 0.08 }));
  P.push(part(G.cyl(2.75, 3.2, 5.6, 12, 3, true), { pos: [0, 3.3, 0], bottom: chalkD, top: chalk, jitter: 0.06, jitterY: 0.1, vary: 0.07 }));
  // 欠けた上の壁（片側だけ高く残る）
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, k = Math.max(0, Math.sin(a * 0.5 + 0.4));
    const h = 0.3 + 5.2 * k * k + (i % 3) * 0.35;
    if (h < 0.5) continue;
    P.push(part(G.box(1.5, h, 0.42), { pos: [Math.sin(a) * 2.62, 6.1 + h / 2, Math.cos(a) * 2.62], rot: [0, a, 0], bottom: chalk, top: chalk, jitter: 0.05, jitterY: 0.25, vary: 0.08 }));
  }
  P.push(part(G.torus(2.95, 0.16, 4, 12), { pos: [0, 6.1, 0], rot: [Math.PI / 2, 0, 0], color: chalkD }));
  P.push(part(G.torus(3.2, 0.14, 4, 12), { pos: [0, 2.4, 0], rot: [Math.PI / 2, 0, 0], color: 0x4f79b8 }));
  // 入口と窓（暗い面）
  P.push(part(G.box(1.1, 2.1, 0.2), { pos: [Math.sin(5.2) * 3.02, 1.6, Math.cos(5.2) * 3.02], rot: [0, 5.2, 0], color: 0x3a3a44 }));
  P.push(part(G.box(0.5, 0.9, 0.2), { pos: [Math.sin(0.9) * 2.86, 4.4, Math.cos(0.9) * 2.86], rot: [0, 0.9, 0], color: 0x3a3a44 }));
  // 落ちた石
  P.push(part(G.box(1.6, 0.7, 0.9), { pos: [4.9, 0.3, 1.2], rot: [0, 0.6, 0.1], color: chalk, jitter: 0.08 }));
  P.push(part(G.box(1.1, 0.6, 0.8), { pos: [4.0, 0.3, -3.0], rot: [0.1, 1.6, 0], color: chalkD, jitter: 0.08 }));
  P.push(part(G.box(0.8, 0.5, 0.7), { pos: [-4.4, 0.25, 1.8], rot: [0, 2.2, 0.2], color: chalk, jitter: 0.08 }));
  const mesh = new THREE.Mesh(merge(P), structMaterial({ rim: 0.3 }));
  env.col.addCollider({ x: def.x, z: def.z, r: 3.5, y0: def.y - 1, y1: def.y + 11, kind: 'structure' });
  return mesh;
}

// 風穴のアーチ：幅 30 m・高さ 22 m の天然の石橋。ローカル x が橋の向き、z がくぐる向き
export function buildArch(env, def) {
  const P = [];
  const col = strataColor(def.y);
  const N = 22, path = [], ra = [], rb = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = Math.PI * (t * 1.08 - 0.04);
    const leg = Math.abs(Math.cos(a));
    path.push(new THREE.Vector3(-Math.cos(a) * 19.8, Math.sin(a) * 26.2 - 3.0, Math.sin(i * 1.7) * 0.5));
    ra.push(3.3 + 2.0 * leg + 0.45 * Math.sin(i * 2.3));                      // くぐる向きの厚み
    rb.push(2.1 + 3.4 * leg * leg + 0.4 * Math.sin(i * 1.9 + 1));              // 面内の太さ
  }
  P.push(part(tubeGeo(path, ra, rb, 9, new THREE.Vector3(0, 0, 1)), { color: col, jitter: 0.55 }));
  // 張り出した岩の層
  P.push(part(G.cyl(0.5, 0.5, 1, 7), { pos: [-14.5, 16.5, 0.6], scale: [7.5, 2.4, 8.5], rot: [0, 0.4, 0.5], color: col, jitter: 0.4 }));
  P.push(part(G.cyl(0.5, 0.5, 1, 7), { pos: [12.5, 20.0, -0.5], scale: [8, 2.0, 7.8], rot: [0, 1.1, -0.42], color: col, jitter: 0.4 }));
  P.push(part(G.cyl(0.5, 0.5, 1, 7), { pos: [0.5, 25.2, 0.2], scale: [11, 1.7, 7.2], rot: [0, 0.2, 0.02], color: col, jitter: 0.4 }));
  // 脚もとの岩と、上の草
  P.push(part(G.dodeca(5.5), { pos: [-22, 1.5, 2.5], scale: [1.2, 0.9, 1.2], color: col, jitter: 0.5 }));
  P.push(part(G.dodeca(4.6), { pos: [23, 1.0, -2.0], scale: [1.2, 0.8, 1.3], color: col, jitter: 0.5 }));
  P.push(part(G.dodeca(3.2), { pos: [-17, 9.5, -3.6], scale: [1, 1.3, 1], color: col, jitter: 0.4 }));
  for (const [x, y] of [[-6, 26.0], [2, 26.8], [8, 25.7]]) P.push(part(G.ico(1.5, 0), { pos: [x, y, 0.4], scale: [1.8, 0.5, 1.6], bottom: 0x587f5a, top: 0xa8c896, sway: 0.4 }));
  const mesh = new THREE.Mesh(merge(P), structMaterial({ rim: 0.25, sunRim: 1.6, fogMul: 0.9 }));
  for (const [x, z, r] of [[-19.5, 0, 5.2], [19.5, 0, 5.2], [-23, 2.5, 5], [23.5, -2, 4.4], [-16.5, -3, 3]]) {
    const p = toWorld(def, x, 0, z);
    env.col.addCollider({ x: p.x, z: p.z, r, y0: def.y - 2, y1: def.y + 16, kind: 'rock' });
  }
  return mesh;
}

// 大樹ヨルハ：幹の半径 9 m、高さ 70 m。葉は夜に青緑に光る
export function buildElder(env, def) {
  const rng = env.fork('elder');
  const P = [];
  const bark = 0x5a4636, barkD = 0x35291f, barkL = 0x75604c;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // 樹皮：上ほど明るく、上を向いた面と根もとに苔
  const barkC = (p, n) => {
    const t = Math.min(1, p.y / 40), k = 0.66 + 0.34 * Math.max(0, n.y * 0.5 + 0.5) + 0.1 * Math.sin(p.y * 0.9 + p.x * 0.5);
    const c = [(0.08 + 0.12 * t) * k, (0.056 + 0.085 * t) * k, (0.04 + 0.055 * t) * k];
    const m = Math.min(1, Math.max(0, n.y * 1.6 - 0.15)) * (p.y < 12 ? 0.85 : 0.45) * (0.6 + 0.4 * Math.sin(p.x * 0.7 + p.z * 0.5));
    return [c[0] + (0.07 - c[0]) * m, c[1] + (0.16 - c[1]) * m, c[2] + (0.08 - c[2]) * m];
  };
  // 幹をのぼる光の筋（昼はかすか、夜は青緑に光る）
  const vein = (p) => { const a = Math.atan2(p.x, p.z); return Math.pow(Math.max(0, Math.sin(a * 5 + p.y * 0.09)), 18) * (p.y > 2 && p.y < 44 ? 0.9 : 0); };
  // 幹：根もとで広がり、上で分かれる
  P.push(part(tubeGeo([V(0, -1, 0), V(0, 3, 0), V(0.3, 9, 0), V(0.6, 20, -0.2), V(0.2, 32, 0.3), V(-0.4, 42, 0)], [14, 10.6, 9, 7.6, 6.6, 5.2], [14, 10.6, 9, 7.6, 6.6, 5.2], 16, V(0, 0, 1), false), { color: barkC, jitter: 0.5, glow: vein }));
  // 根：幹から下り、地面にもぐる
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2), len = rng.range(14, 26), sx = Math.sin(a), cz = Math.cos(a), bend = rng.range(-0.25, 0.25);
    const pts = [], r1 = [], r2 = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, d = 7.5 + len * t, sway = Math.sin(t * 2.6) * len * bend;
      pts.push(V(sx * d + cz * sway, 7.5 * Math.pow(1 - t, 2.2) - 0.9 * t - 0.2, cz * d - sx * sway));
      r1.push(3.1 * (1 - t) + 0.45); r2.push(2.4 * (1 - t) + 0.4);
    }
    P.push(part(tubeGeo(pts, r1, r2, 7), { color: barkC, jitter: 0.25 }));
  }
  // 大枝と葉のかさ（傘のように広がり、縁は垂れる）
  const leaf = (r, pos, sc) => P.push(part(G.ico(r, 1), { pos, scale: sc, bottom: 0x1c6a52, top: 0x8fe8b4, smooth: V(pos[0] * 0.8, pos[1] - r * 0.7, pos[2] * 0.8), sway: 1, glow: (p) => 0.25 + 0.75 * Math.max(0, Math.sin(p.x * 0.4 + p.z * 0.33 + p.y * 0.2)), jitter: r * 0.07, topLight: 0.8 }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, len = rng.range(27, 35), y0 = 30 + (i % 3) * 4, sx = Math.sin(a), cz = Math.cos(a);
    const pts = [V(sx * 4, y0, cz * 4), V(sx * len * 0.4, y0 + 7, cz * len * 0.4), V(sx * len * 0.75, y0 + 10, cz * len * 0.75), V(sx * len, y0 + 8, cz * len)];
    P.push(part(tubeGeo(pts, [3.0, 2.0, 1.3, 0.6], [3.0, 2.0, 1.3, 0.6], 6), { color: barkC, jitter: 0.2 }));
    leaf(rng.range(13, 15.5), [sx * len * 0.95, y0 + 11.5, cz * len * 0.95], [1.3, 0.48, 1.3]);
    if (i % 2 === 0) leaf(rng.range(9, 11), [sx * (len + 11), y0 + 5.5, cz * (len + 11)], [1.25, 0.5, 1.25]);
  }
  leaf(18, [0, 58, 0], [1.45, 0.5, 1.45]);
  leaf(13, [7, 67, -5], [1.3, 0.55, 1.3]);
  leaf(11, [-10, 64, 7], [1.3, 0.55, 1.3]);
  const mesh = new THREE.Mesh(merge(P), structMaterial({ glow: 0x7ff5e1, amt: 0.06, night: 1.25, rim: 0.3, fogMul: 0.75 }));
  env.col.addCollider({ x: def.x, z: def.z, r: 10.5, y0: def.y - 2, y1: def.y + 60, kind: 'tree' });
  // 木漏れ日
  const fx = env.fx;
  for (let i = 0; i < 15; i++) {
    const a = rng.range(0, 6.28), d = rng.range(16, 46);
    const x = def.x + Math.sin(a) * d, z = def.z + Math.cos(a) * d;
    fx.shafts.add({ from: V(x, env.hf.heightAt(x, z) - 1, z), sun: true, len: rng.range(50, 66), width: rng.range(3.5, 7), color: 0xffeeb0, intensity: rng.range(0.1, 0.17) });
  }
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, 6.28), d = rng.range(12, 30);
    fx.glows.add({ x: def.x + Math.sin(a) * d, y: def.y + rng.range(36, 50), z: def.z + Math.cos(a) * d, size: rng.range(12, 20), color: 0x7ff5e1, mode: 1, intensity: 0.3 });
  }
  return mesh;
}

// 凪の小島：湖のまん中の闘技場。立石の輪と、欠けた中央の円
export function buildIsle(env, def) {
  const P = [];
  const st = 0x8f8d96, stD = 0x5f5d68;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2, r = 31, h = 4.5 + ((i * 7) % 5) * 0.9;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (i === 4) continue;                                    // 橋の着くところ（南）はあける
    P.push(part(G.cyl(0.55, 0.95, h, 5, 2), { pos: [x, env.hf.heightAt(def.x + x, def.z + z) - def.y + h / 2 - 0.3, z], rot: [0.06 * Math.cos(i), a, 0.07 * Math.sin(i * 2)], scale: [1.5, 1, 0.75], bottom: stD, top: st, jitter: 0.08, jitterY: 0.1, vary: 0.1 }));
    P.push(part(G.octa(0.2), { pos: [x * 0.96, env.hf.heightAt(def.x + x, def.z + z) - def.y + h * 0.7, z * 0.96], scale: [1, 1.6, 0.5], rot: [0, a, 0], color: 0xc9a6ff, glow: 1 }));
  }
  P.push(part(G.ring(8.6, 9.3, 28), { pos: [0, 0.1, 0], color: stD }));
  P.push(part(G.ring(3.0, 3.4, 18), { pos: [0, 0.1, 0], color: 0xc9a6ff, glow: 0.7 }));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.push(part(G.box(0.4, 0.05, 5.0), { pos: [Math.sin(a) * 6, 0.1, Math.cos(a) * 6], rot: [0, a, 0], color: stD })); }
  const mesh = new THREE.Mesh(merge(P), structMaterial({ glow: 0xc23bff, amt: 0.35, night: 0.5 }));
  for (let i = 0; i < 9; i++) {
    if (i === 4) continue;
    const a = (i / 9) * Math.PI * 2 + 0.2;
    env.col.addCollider({ x: def.x + Math.sin(a) * 31, z: def.z + Math.cos(a) * 31, r: 0.9, y0: def.y - 2, y1: def.y + 8, kind: 'structure' });
  }
  return mesh;
}
