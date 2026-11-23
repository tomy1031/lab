// js/world/folk.js — 世界担当（FABLE の代行）
// 島の人びと（コードで作るオリジナルの人形）と荷運びの獣「綿角」。DESIGN_V2 §5.1・§5.3。
// 部位の種類ごとに 1 つの InstancedMesh を全員で共有する：胴・頭（顔つき）・かぶりもの・持ちもの・手足（腕と脚は同じ形）
// ＋丸い影＋綿角 ＝ 何人いても 7 ドローコール。色は instanceColor（主）と iCol2（差し色）、形の違いは頂点シェーダーで選ぶ。
// 動きは手続き式：ポーズ＝時刻の関数で関節角を返し、2 つのポーズをなめらかにまぜる。描くのは半径 45 m の近い 8 人と 4 頭だけ。
import * as THREE from 'three';
import { AW_PARS, AwMaterial, sharedUniforms, FOG_LIGHT_UNIFORMS } from './art.js';

const MAXP = 8, MAXB = 4, VIEW_R = 45, LOD_R = 24;
export const FOLK_POSES = ['idle', 'walk', 'run', 'sit', 'talk', 'wave', 'nod', 'cheer', 'cower', 'climb', 'work', 'sleep', 'dance'];
const HATS = { none: -1, hair: 0, hood: 1, brim: 2, beard: 3, fur: 4 };
const PROPS = { none: -1, staff: 0, hammer: 1, rod: 2, basket: 3, lantern: 4 };
const OVER = { none: -1, cape: 0, apron: 1, scarf: 2, sash: 3 };

// ── 見た目のひな形（§1.2・§1.3）。色は §7.1 の「良いもの」の金・水色・生成りを差し色に、凪の灰と紫・予告の赤紫は使わない ──
// coat: 胴の色 trim: 差し色（外套・前掛け・帯） skin hair hat: かぶりものの色 hatKind prop over(lay) legs boots
// hem: すその長さ（0.3 短い上着 … 1.7 くるぶしまで） flare: すその広がり scale: 背丈の倍率
export const FOLK_LOOKS = {
  towa: { coat: 0x5fc3d8, trim: 0xf4ecd8, skin: 0xf2c9a6, hair: 0x3b2a22, hatKind: 'hair', hat: 0x3b2a22, prop: 'staff', propOpt: 1, over: 'scarf', legs: 0x3f4d6b, boots: 0x6b4a2e, hem: 0.55, flare: 1.15, scale: 0.9 },
  gando: { coat: 0xb9aa8a, trim: 0x7a5232, skin: 0xe6b08c, hair: 0xf2f0ea, hatKind: 'beard', hat: 0xf2f0ea, prop: 'hammer', over: 'apron', legs: 0x5a4a3a, boots: 0x4a3426, hem: 0.45, flare: 1.0 },
  mio: { ears: 1, coat: 0xffc8d6, trim: 0xf4ecd8, skin: 0xf6d2b4, hair: 0x5a3a2a, hatKind: 'hood', hat: 0xff8fb3, prop: 'none', over: 'none', legs: 0xf4ecd8, boots: 0x8a5a3e, hem: 0.7, flare: 1.35 },
  sora: { ears: 1, coat: 0xffe49a, trim: 0xf4ecd8, skin: 0xf6d2b4, hair: 0x5a3a2a, hatKind: 'hood', hat: 0xffcf45, prop: 'none', over: 'none', legs: 0x6f8fb8, boots: 0x8a5a3e, hem: 0.55, flare: 1.2 },
  ruka: { coat: 0xc9a86a, trim: 0x8a3f35, skin: 0xd9a07c, hair: 0x2a1d18, hatKind: 'brim', hat: 0x7a5a3a, prop: 'basket', over: 'sash', legs: 0x5e4a36, boots: 0x4a3426, hem: 1.5, flare: 1.15, brim: 2.1, crown: 0.75 },
  zaji: { coat: 0x7a4a32, trim: 0xf4ecd8, skin: 0xc98a62, hair: 0x1f1714, hatKind: 'hair', hat: 0x1f1714, prop: 'none', over: 'sash', legs: 0x4f4636, boots: 0x3a2a20, hem: 0.35, flare: 1.0, sleeves: 'skin', armTrim: 0xf4ecd8 },
  yukime: { coat: 0x4f6fa8, trim: 0xf4f8ff, skin: 0xf2d6c2, hair: 0x2a2a3a, hatKind: 'fur', hat: 0xf4f8ff, prop: 'staff', propOpt: 2, over: 'cape', legs: 0x3a4a6a, boots: 0xe8e8f0, hem: 1.55, flare: 1.2 },
  toto: { coat: 0x7fa3c2, trim: 0xf4ecd8, skin: 0xe0aa84, hair: 0x6a5a4a, hatKind: 'brim', hat: 0xe8d08a, prop: 'rod', over: 'none', legs: 0x5a5a48, boots: 0x6b4a2e, hem: 0.4, flare: 1.0, brim: 1.75, crown: 0.45 },
  en: { coat: 0xb8a0c8, trim: 0xffd76a, skin: 0xf0c8a8, hair: 0x8a4a2a, hatKind: 'hair', hat: 0x8a4a2a, prop: 'none', over: 'scarf', legs: 0x4a4a5a, boots: 0x6b4a2e, hem: 0.8, flare: 1.1 },
  keeper: { coat: 0xeef2ee, trim: 0x7fe9ff, skin: 0xe8bc98, hair: 0x4a3a30, hatKind: 'hood', hat: 0xf4ecd8, prop: 'staff', propOpt: 2, over: 'sash', legs: 0xc9c0a8, boots: 0x8a6a4a, hem: 1.55, flare: 1.2 },
  pilgrim: { coat: 0x9a8a6a, trim: 0xd9c9a0, skin: 0xe0b090, hair: 0x4a3a2a, hatKind: 'brim', hat: 0xc8b078, prop: 'staff', propOpt: 0, over: 'cape', legs: 0x5a5040, boots: 0x4a3426, hem: 1.4, flare: 1.15, brim: 1.8, crown: 0.6 },
  pilgrim2: { coat: 0x6f8a78, trim: 0xe2d6b8, skin: 0xc8946e, hair: 0x2a1d18, hatKind: 'hood', hat: 0x8aa08a, prop: 'staff', propOpt: 0, over: 'sash', legs: 0x4a4a3a, boots: 0x4a3426, hem: 1.5, flare: 1.15 },
  pilgrim3: { coat: 0xa87a6a, trim: 0xf2c66b, skin: 0xf0c8a8, hair: 0x7a4a2a, hatKind: 'hair', hat: 0x7a4a2a, prop: 'basket', over: 'cape', legs: 0x5e4e44, boots: 0x6b4a2e, hem: 1.3, flare: 1.1 },
  wataduno: { coat: 0xf4efe2, trim: 0xb0453a, skin: 0xc9a27a, hair: 0xa8845a, hatKind: 'none', hat: 0x9a7a52, prop: 'none', over: 'none', pack: 0 },
  caravan: { coat: 0xf0e8d6, trim: 0x8a3f35, skin: 0xc9a27a, hair: 0xa8845a, hatKind: 'none', hat: 0x9a7a52, prop: 'none', over: 'none', pack: 1 },
};
// 体つき（m）。腰の高さ、胴の倍率、頭の半径、腕と脚の長さ、肩・股の幅、背の丸み
const BODY = {
  adult: { hip: 0.84, torso: [1, 1, 1], head: 0.145, arm: 0.6, leg: 0.84, sh: 0.2, hp: 0.095, hunch: 0, armT: 0.11, legT: 0.092 },
  child: { hip: 0.5, torso: [0.74, 0.62, 0.74], head: 0.152, arm: 0.38, leg: 0.5, sh: 0.145, hp: 0.07, hunch: 0, armT: 0.14, legT: 0.13 },
  elder: { hip: 0.78, torso: [1.08, 0.94, 1.08], head: 0.142, arm: 0.57, leg: 0.78, sh: 0.2, hp: 0.1, hunch: 0.32, armT: 0.12, legT: 0.1 },
};

// ── 形づくり（頂点：position normal color aF。aF = 色の種類 0 主 1 差し 2 そのまま／曲げ 0 1／形の番号 -1 共通／しるし）──
const _c = new THREE.Color();
const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
function bake(geo, { m = [0, 0, 0], mat = 0, color = 0xffffff, bend = 0, v = -1, tag = 0, ao = null, smooth = true } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const mx = new THREE.Matrix4().compose(new THREE.Vector3(m[0], m[1], m[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(m[3] || 0, m[4] || 0, m[5] || 0)), new THREE.Vector3(m[6] ?? 1, m[7] ?? m[6] ?? 1, m[8] ?? m[6] ?? 1));
  g.applyMatrix4(mx);
  if (!smooth) g.computeVertexNormals();
  const n = g.getAttribute('position').count, pa = g.getAttribute('position');
  const col = new Float32Array(n * 3), af = new Float32Array(n * 4);
  const base = typeof color === 'number' ? lin(color) : color;
  for (let i = 0; i < n; i++) {
    const k = ao ? ao(pa.getX(i), pa.getY(i), pa.getZ(i)) : 1;
    col[i * 3] = base[0] * k; col[i * 3 + 1] = base[1] * k; col[i * 3 + 2] = base[2] * k;
    af[i * 4] = mat; af[i * 4 + 1] = typeof bend === 'function' ? bend(pa.getY(i)) : bend; af[i * 4 + 2] = v; af[i * 4 + 3] = tag;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', pa); out.setAttribute('normal', g.getAttribute('normal'));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('aF', new THREE.BufferAttribute(af, 4));
  return out;
}
function join(parts) {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const A = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3), color: new Float32Array(n * 3), aF: new Float32Array(n * 4) };
  let o = 0;
  for (const p of parts) {
    const c = p.getAttribute('position').count;
    for (const k of ['position', 'normal', 'color']) A[k].set(p.getAttribute(k).array.subarray(0, c * 3), o * 3);
    A.aF.set(p.getAttribute('aF').array.subarray(0, c * 4), o * 4);
    o += c;
  }
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) g.setAttribute(k, new THREE.BufferAttribute(A[k], 3));
  g.setAttribute('aF', new THREE.BufferAttribute(A.aF, 4));
  g.computeBoundingSphere();
  return g;
}
const lathe = (prof, seg) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);
const V3 = THREE.Vector3;

// 胴：腰（原点）から首まで。すそ（y < 0）は外套のすそで、長さと広がりはシェーダーで変える。前は −Z
function torsoGeo() {
  const P = [];
  const body = lathe([[0.001, 0.64], [0.06, 0.63], [0.07, 0.58], [0.16, 0.53], [0.2, 0.42], [0.185, 0.3], [0.155, 0.18], [0.165, 0.06], [0.185, -0.05], [0.215, -0.22], [0.25, -0.45]], 12);
  // 前後に平たく、背中は少し丸く
  P.push(bake(body, { m: [0, 0, 0, 0, 0, 0, 1, 1, 0.78], tag: 0, ao: (x, y) => (y < -0.05 ? 0.92 : y > 0.55 ? 0.95 : 1) }));
  // 帯（革）と金の留め具
  P.push(bake(new THREE.CylinderGeometry(0.168, 0.172, 0.06, 12, 1, true), { m: [0, 0.1, 0, 0, 0, 0, 1, 1, 0.8], mat: 2, color: 0x5a3c26 }));
  P.push(bake(new THREE.BoxGeometry(0.05, 0.045, 0.02), { m: [0, 0.1, -0.138], mat: 2, color: 0xffd76a }));
  // 重ね着（差し色）：0 肩の外套 1 前掛け 2 えり巻き 3 たすき
  P.push(bake(lathe([[0.075, 0.6], [0.16, 0.56], [0.235, 0.42], [0.27, 0.24]], 12), { m: [0, 0, 0.012, 0, 0, 0, 1.04, 1, 0.86], mat: 1, v: 0 }));
  P.push(bake(new THREE.PlaneGeometry(0.3, 0.72, 1, 3), { m: [0, 0.03, -0.17, -0.06, 0, 0, 1, 1, 1], mat: 1, v: 1, ao: (x, y) => 0.92 + 0.08 * (y + 0.36) }));
  P.push(bake(new THREE.BoxGeometry(0.045, 0.3, 0.02), { m: [0.11, 0.45, -0.115, 0, 0, 0.05], mat: 1, v: 1 }));
  P.push(bake(new THREE.BoxGeometry(0.045, 0.3, 0.02), { m: [-0.11, 0.45, -0.115, 0, 0, -0.05], mat: 1, v: 1 }));
  P.push(bake(new THREE.TorusGeometry(0.095, 0.04, 5, 12), { m: [0, 0.57, 0, Math.PI / 2, 0, 0, 1, 1, 0.9], mat: 1, v: 2 }));
  P.push(bake(new THREE.BoxGeometry(0.07, 0.34, 0.03), { m: [0.06, 0.38, -0.13, 0.12, 0, 0.15], mat: 1, v: 2 }));
  P.push(bake(new THREE.BoxGeometry(0.06, 0.62, 0.02), { m: [0.01, 0.3, -0.142, 0, 0, -0.62], mat: 1, v: 3 }));
  P.push(bake(new THREE.BoxGeometry(0.06, 0.62, 0.02), { m: [0.01, 0.3, 0.126, 0, 0, 0.62], mat: 1, v: 3 }));
  return join(P);
}
// 頭：半径 1（行列で頭の大きさにする）。顔は目の点 2 つ（白い光つき）、ほほの色、小さな鼻、まゆ（髪の色）。口は描かない
function headGeo() {
  const P = [];
  P.push(bake(new THREE.SphereGeometry(1, 12, 9), { m: [0, 0, 0, 0, 0, 0, 0.96, 1.04, 0.98], ao: (x, y, z) => (y < -0.6 ? 0.82 : 1) }));
  const onFace = (x, y, sx, sy, mat, color, d = 1.0, seg = 8) => {
    const z = -Math.sqrt(Math.max(0, 1 - x * x - y * y)) * 0.99 - 0.005 * d;
    const nrm = new V3(x, y, z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, -1), nrm);
    const e = new THREE.Euler().setFromQuaternion(q);
    const disc = new THREE.CircleGeometry(1, seg); disc.rotateY(Math.PI);
    return bake(disc, { m: [x * d, y * d, z, e.x, e.y, e.z, sx, sy, 1], mat, color, smooth: true });
  };
  for (const s of [-1, 1]) {
    P.push(onFace(0.33 * s, 0.04, 0.135, 0.19, 2, 0x231815, 1.02));        // 目
    P.push(onFace(0.33 * s + 0.045, 0.1, 0.045, 0.045, 2, 0xfff6ea, 1.045, 5));  // 目の光
    P.push(onFace(0.5 * s, -0.2, 0.15, 0.1, 2, 0xf09a96, 1.015));            // ほほ
    P.push(bake(new THREE.BoxGeometry(0.22, 0.045, 0.06), { m: [0.33 * s, 0.3, -0.92, 0, 0, -0.12 * s], mat: 1 }));   // まゆ
  }
  P.push(bake(new THREE.SphereGeometry(0.13, 6, 4), { m: [0, -0.1, -0.98, 0, 0, 0, 1, 0.9, 0.9], ao: () => 0.97 }));   // 鼻
  for (const s of [-1, 1]) P.push(bake(new THREE.SphereGeometry(0.17, 6, 4), { m: [0.97 * s, -0.05, 0.02, 0, 0, 0, 0.5, 1, 0.8] }));   // 耳
  return join(P);
}
// かぶりもの（頭と同じ行列、頭の半径 = 1）：0 髪 1 頭巾 2 つばのある帽子 3 白いひげ（はげ頭のまわりの髪つき）4 毛皮の襟と編み髪
function hatGeo() {
  const P = [];
  const shell = (r, cutFront, cutLow, back) => {
    const g = new THREE.SphereGeometry(r, 12, 8).toNonIndexed();
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // 顔の前は額のところまで、うしろと横は下まで
      const lim = z < 0 ? cutFront + (cutLow - cutFront) * Math.min(1, Math.abs(x) / r * 1.3) * (1 + z / r * 0.2) : cutLow - back * (z / r);
      if (y < lim * r) p.setXYZ(i, x * 0.8, Math.max(lim * r, y) * 0.8, z * 0.8);
    }
    g.computeVertexNormals();
    return g;
  };
  // 髪：短い髪の帽子（前髪は眉の上）
  P.push(bake(shell(1.07, 0.42, -0.45, 0.35), { mat: 1, v: 0, ao: (x, y) => 0.8 + 0.2 * Math.min(1, Math.max(0, y)) }));
  P.push(bake(new THREE.ConeGeometry(0.16, 0.42, 5), { m: [0.25, 0.98, -0.2, -0.5, 0, -0.5], mat: 1, v: 0 }));
  // 頭巾：大きくやわらかい頭巾。うしろへ垂れる先と、先の房（差し色）
  P.push(bake(shell(1.28, 0.55, -1.0, 0.8), { mat: 0, v: 1, ao: (x, y, z) => (z < -0.6 && y < 0.6 ? 0.7 : 0.88 + 0.12 * Math.max(0, y)) }));
  P.push(bake(new THREE.ConeGeometry(0.55, 1.15, 8), { m: [0, 0.2, 1.3, -1.95, 0, 0], mat: 0, v: 1, tag: 1 }));
  P.push(bake(new THREE.SphereGeometry(0.26, 7, 5), { m: [0, -0.32, 1.78], mat: 1, v: 1, tag: 1 }));
  // 子どもの頭巾の耳（しるし 4、iA.z = 1 のときだけ）
  for (const sx of [-1, 1]) P.push(bake(new THREE.SphereGeometry(0.34, 7, 5), { m: [0.68 * sx, 1.02, 0.05, 0, 0, -0.5 * sx, 0.75, 1, 0.5], mat: 0, v: 1, tag: 4 }));
  P.push(bake(new THREE.TorusGeometry(1.08, 0.14, 5, 16, Math.PI * 1.15), { m: [0, 0.02, -0.32, -0.3, 0, Math.PI * 0.925 / 2 + Math.PI / 2, 1, 1, 0.78], mat: 1, v: 1 }));
  // つばのある帽子：山（主）、帯（差し色）、つば（主）。つばの半径と山の高さはシェーダー
  P.push(bake(lathe([[0.001, 1.55], [0.55, 1.5], [0.82, 1.3], [0.92, 0.75], [1.0, 0.55]], 12), { mat: 0, v: 2, tag: 2, ao: (x, y) => (y < 0.8 ? 0.85 : 1) }));
  P.push(bake(new THREE.CylinderGeometry(0.95, 0.99, 0.2, 12, 1, true), { m: [0, 0.7, 0], mat: 1, v: 2, tag: 2 }));
  P.push(bake(lathe([[0.98, 0.58], [1.5, 0.5], [2.0, 0.38], [2.0, 0.34], [1.5, 0.45], [0.98, 0.52]], 14), { mat: 0, v: 2, tag: 3 }));
  // ひげ：あごから胸へ。口ひげ、耳のまわりの髪
  P.push(bake(new THREE.ConeGeometry(0.62, 1.25, 8), { m: [0, -0.85, -0.55, Math.PI + 0.35, 0, 0, 1, 1, 0.75], mat: 1, v: 3, ao: (x, y) => 0.85 + 0.15 * Math.max(0, Math.min(1, y + 1)) }));
  P.push(bake(new THREE.CapsuleGeometry(0.12, 0.5, 2, 6), { m: [0, -0.33, -0.9, 0, 0, Math.PI / 2, 1, 1, 0.8], mat: 1, v: 3 }));
  P.push(bake(new THREE.TorusGeometry(0.98, 0.2, 5, 14, Math.PI * 1.25), { m: [0, -0.05, 0.05, Math.PI / 2, 0, Math.PI * 1.375 + Math.PI / 2, 1, 1, 1], mat: 1, v: 3 }));
  // 毛皮の襟（主）と長い編み髪（差し色）
  P.push(bake(new THREE.TorusGeometry(0.95, 0.38, 6, 12), { m: [0, -1.15, 0.05, Math.PI / 2, 0, 0, 1.1, 1, 0.9], mat: 0, v: 4, ao: (x, y) => 0.9 + 0.1 * Math.max(0, y + 1.2) }));
  P.push(bake(shell(1.06, 0.5, -0.4, 0.3), { mat: 1, v: 4 }));
  for (let i = 0; i < 6; i++) P.push(bake(new THREE.SphereGeometry(0.2 - i * 0.015, 6, 4), { m: [0.05 * Math.sin(i), -0.35 - i * 0.36, 1.02 + i * 0.03, 0, 0, 0, 1, 1.25, 1], mat: 1, v: 4 }));
  return join(P);
}
// 持ちもの（手の中：原点 = にぎり、−Y = 前腕の先）：0 杖（先に風車 1／鈴 2）1 小さな金槌 2 釣りざお 3 背負い籠（背中） 4 手提げの灯籠
function propGeo() {
  const P = [];
  P.push(bake(new THREE.CylinderGeometry(0.017, 0.02, 1.95, 6), { m: [0, 0.12, 0], mat: 2, color: 0x8a6a45, v: 0 }));
  P.push(bake(new THREE.SphereGeometry(0.03, 6, 4), { m: [0, 1.1, 0], mat: 2, color: 0xffd76a, v: 0 }));
  // 風車（しるし 1：回る）
  const cols = [0x7fe9ff, 0xfffbe8, 0xffd76a, 0x7fe9ff, 0xfffbe8, 0xffd76a];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.02, Math.cos(a + 0.7) * 0.12, Math.sin(a + 0.7) * 0.12, -0.02]), 3));
    tri.computeVertexNormals();
    P.push(bake(tri, { m: [0, 1.13, -0.04], mat: 2, color: cols[i], v: 0, tag: 1 }));
  }
  // 鈴（しるし 2）
  P.push(bake(lathe([[0.001, 0.0], [0.045, 0.005], [0.04, 0.05], [0.025, 0.09], [0.001, 0.1]], 8), { m: [0.05, 0.92, 0], mat: 2, color: 0xffd76a, v: 0, tag: 2 }));
  P.push(bake(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 3), { m: [0.03, 1.0, 0, 0, 0, 0.6], mat: 2, color: 0x7fe9ff, v: 0, tag: 2 }));
  // 金槌
  P.push(bake(new THREE.CylinderGeometry(0.014, 0.016, 0.32, 5), { m: [0, -0.04, -0.06, Math.PI / 2, 0, 0], mat: 2, color: 0x7a5a3a, v: 1 }));
  P.push(bake(new THREE.BoxGeometry(0.06, 0.06, 0.13), { m: [0, -0.04, -0.21, 0, 0, 0], mat: 2, color: 0x8a8a92, v: 1, ao: (x, y, z) => (z > -0.2 ? 0.85 : 1) }));
  // 釣りざお（前へ斜め上）と糸
  P.push(bake(new THREE.CylinderGeometry(0.006, 0.014, 2.3, 5), { m: [0, 0.6, -0.95, -1.15, 0, 0], mat: 2, color: 0x9a7a4a, v: 2 }));
  P.push(bake(new THREE.CylinderGeometry(0.002, 0.002, 1.3, 3), { m: [0, 0.82, -2.0, 0, 0, 0], mat: 2, color: 0xfffbe8, v: 2 }));
  P.push(bake(new THREE.SphereGeometry(0.025, 5, 4), { m: [0, 0.17, -2.0], mat: 2, color: 0xff6a2b, v: 2 }));
  // 背負い籠（胴の行列に付ける）
  P.push(bake(lathe([[0.001, 0.0], [0.17, 0.02], [0.2, 0.3], [0.22, 0.56], [0.2, 0.6], [0.001, 0.58]], 10), { m: [0, 0.08, 0.27, 0, 0, 0, 1, 1, 0.85], mat: 2, color: 0xb08a52, v: 3, ao: (x, y) => 0.85 + 0.15 * Math.sin(y * 40) }));
  P.push(bake(new THREE.TorusGeometry(0.2, 0.018, 4, 10), { m: [0, 0.4, 0.27, Math.PI / 2, 0, 0, 1, 1, 0.85], mat: 2, color: 0x7a5a32, v: 3 }));
  P.push(bake(new THREE.SphereGeometry(0.13, 6, 4), { m: [0.05, 0.68, 0.28], mat: 2, color: 0x6aa04a, v: 3 }));
  for (const s of [-1, 1]) P.push(bake(new THREE.BoxGeometry(0.03, 0.42, 0.02), { m: [0.1 * s, 0.38, -0.12, 0.1, 0, 0], mat: 2, color: 0x6b4a2e, v: 3 }));
  // 手提げの灯籠
  P.push(bake(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 3), { m: [0, -0.09, 0], mat: 2, color: 0x3f3a33, v: 4 }));
  P.push(bake(new THREE.BoxGeometry(0.1, 0.13, 0.1), { m: [0, -0.23, 0], mat: 2, color: 0xfff0c0, v: 4, tag: 3 }));
  P.push(bake(new THREE.ConeGeometry(0.09, 0.07, 4), { m: [0, -0.14, 0, 0, Math.PI / 4, 0], mat: 2, color: 0x3a4456, v: 4 }));
  return join(P);
}
// 腕と脚（同じ形、長さ 1・半径 1 を行列とシェーダーで細くする）：上の節（主）、下の節（曲がる、主）、先（手＝差し色の肌 / 足＝長ぐつ）
function limbGeo() {
  // 太さ 0.1（長さ 1 に対して）で作り、人ごとの太さはシェーダーで横方向だけ変える
  const T = 0.1, P = [];
  P.push(bake(new THREE.CylinderGeometry(T, T * 0.86, 0.5, 8, 1, true), { m: [0, -0.25, 0], bend: 0 }));
  P.push(bake(new THREE.SphereGeometry(T * 0.98, 8, 5), { m: [0, -0.01, 0, 0, 0, 0, 1, 0.8, 1], bend: 0 }));
  P.push(bake(new THREE.SphereGeometry(T * 0.87, 8, 5), { m: [0, -0.5, 0], bend: 1 }));
  P.push(bake(new THREE.CylinderGeometry(T * 0.86, T * 0.72, 0.42, 8, 1, true), { m: [0, -0.71, 0], bend: 1 }));
  P.push(bake(new THREE.CylinderGeometry(T * 0.8, T * 0.8, 0.07, 8, 1, true), { m: [0, -0.905, 0], mat: 1, bend: 1 }));     // 袖口・長ぐつの口
  P.push(bake(new THREE.SphereGeometry(T * 0.86, 8, 6), { m: [0, -0.985, 0, 0, 0, 0, 0.92, 1.1, 1], mat: 1, bend: 1, tag: 5 }));
  return join(P);
}
// 綿角：綿のかたまりの胴、短い脚 4 本（しるし 10〜13 がふる）、首から先（しるし 6 がうなずく）、小さな巻き角、荷鞍（差し色、しるし 7）
function beastGeo() {
  const P = [];
  const wool = 0xffffff;
  P.push(bake(new THREE.SphereGeometry(0.5, 10, 7), { m: [0, 0.82, 0.05, 0, 0, 0, 0.92, 0.82, 1.35], color: wool, ao: (x, y) => (y < 0.6 ? 0.82 : 1) }));
  const puffs = [[0.32, 0.98, -0.3, 0.3], [-0.3, 0.98, -0.25, 0.3], [0.28, 1.04, 0.32, 0.3], [-0.3, 1.0, 0.36, 0.31], [0, 1.15, 0.05, 0.34], [0, 0.9, 0.62, 0.3], [0.36, 0.78, 0.05, 0.27], [-0.36, 0.78, 0.05, 0.27]];
  for (const [x, y, z, r] of puffs) P.push(bake(new THREE.SphereGeometry(r, 7, 5), { m: [x, y, z], color: wool, ao: (px, py) => (py < 0.75 ? 0.85 : 1) }));
  // 脚
  [[0.22, -0.4], [-0.22, -0.4], [0.22, 0.45], [-0.22, 0.45]].forEach(([x, z], i) => {
    P.push(bake(new THREE.CylinderGeometry(0.07, 0.06, 0.62, 6), { m: [x, 0.33, z], mat: 2, color: 0x6b5038, tag: 10 + i }));
    P.push(bake(new THREE.CylinderGeometry(0.075, 0.08, 0.06, 6), { m: [x, 0.03, z], mat: 2, color: 0x3a2a20, tag: 10 + i }));
  });
  // 首と頭（原点の前にある首の付け根でうなずく）
  P.push(bake(new THREE.SphereGeometry(0.26, 8, 6), { m: [0, 1.06, -0.62, 0, 0, 0, 0.9, 1, 1.05], color: wool, tag: 6 }));
  P.push(bake(new THREE.SphereGeometry(0.2, 8, 6), { m: [0, 1.04, -0.84, 0.25, 0, 0, 0.82, 0.86, 1.25], mat: 1, color: 0xffffff, tag: 6 }));
  P.push(bake(new THREE.SphereGeometry(0.11, 6, 4), { m: [0, 0.96, -1.04, 0, 0, 0, 1.1, 0.8, 0.8], mat: 2, color: 0x8a6a52, tag: 6 }));
  for (const s of [-1, 1]) {
    P.push(bake(new THREE.SphereGeometry(0.035, 5, 4), { m: [0.13 * s, 1.1, -0.95], mat: 2, color: 0x1f1714, tag: 6 }));
    P.push(bake(new THREE.TorusGeometry(0.07, 0.025, 4, 8, Math.PI * 1.3), { m: [0.14 * s, 1.24, -0.74, 0, Math.PI / 2, 0.4 * s], mat: 2, color: 0xc8a25a, tag: 6 }));
    P.push(bake(new THREE.SphereGeometry(0.08, 5, 4), { m: [0.24 * s, 1.14, -0.68, 0, 0, 0.6 * s, 1.4, 0.5, 0.8], mat: 1, color: 0xffffff, tag: 6 }));
  }
  P.push(bake(new THREE.SphereGeometry(0.12, 6, 4), { m: [0, 0.95, 0.78], color: wool }));
  // 荷鞍（隊商だけ）：鞍、両脇の荷、赤い布
  P.push(bake(new THREE.BoxGeometry(0.7, 0.12, 0.5), { m: [0, 1.28, 0.05], mat: 2, color: 0x8a3f35, tag: 7 }));
  for (const s of [-1, 1]) P.push(bake(new THREE.BoxGeometry(0.22, 0.34, 0.42), { m: [0.46 * s, 1.0, 0.05], mat: 2, color: 0xb08a52, tag: 7, ao: (x, y) => (y < 0.9 ? 0.8 : 1) }));
  return join(P);
}

// ── シェーダー ──
const VERT = /* glsl */`
${AW_PARS}
attribute vec4 aF;           // x: 色 0 主 1 差し 2 そのまま  y: 曲がる節  z: 形の番号（-1 共通）  w: しるし
attribute vec4 iA;           // x: 曲げ（ひじ・ひざ、rad）または首 y: 形の番号 z, w: 部位ごとの値
attribute vec3 iCol2;
uniform float uPivot, uKind; // uKind: 0 胴 1 頭 2 かぶりもの 3 持ちもの 4 手足 5 綿角
uniform vec4 uFire;          // 近くの焚き火（xyz、強さ）
varying vec3 vCol; varying vec3 vN; varying vec3 vWp; varying vec4 vFog;
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
void main() {
  vec3 p = position, n = normal;
  float keep = (aF.z < -0.5 || abs(aF.z - iA.y) < 0.5) ? 1.0 : 0.0;
  if (uKind < 0.5) {
    // 胴：すそ（y < 0）の長さと広がり
    if (p.y < 0.0) { p.y *= iA.z; p.xz *= mix(1.0, iA.w, clamp(-p.y / 0.45, 0.0, 1.0)); }
  } else if (uKind < 2.5 && uKind > 1.5) {
    // 帽子のつば（しるし 3）と山（しるし 2）
    if (aF.w > 2.5 && aF.w < 3.5) p.xz *= mix(1.0, iA.z * 0.5, smoothstep(1.0, 2.0, length(p.xz)));
    if (aF.w > 1.5 && aF.w < 2.5 && p.y > 0.75) p.y = 0.75 + (p.y - 0.75) * iA.w;
    if (aF.w > 3.5 && aF.w < 4.5) keep *= step(0.5, iA.z);
  } else if (uKind > 2.5 && uKind < 3.5) {
    // 杖の飾り：iA.z = 1 風車 2 鈴。風車は回る
    if (aF.w > 0.5 && aF.w < 1.5) { keep *= step(0.5, iA.z) * step(iA.z, 1.5); float a = uTime * 3.0; vec3 q = p - vec3(0.0, 1.13, -0.04); p = vec3(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a), q.z) + vec3(0.0, 1.13, -0.04); }
    if (aF.w > 1.5 && aF.w < 2.5) keep *= step(1.5, iA.z);
  } else if (uKind > 3.5 && uKind < 4.5) {
    // 手足：細さ（iA.z）。先が足なら前へのばした長ぐつ（iA.w = 1）
    p.xz *= iA.z / 0.1;
    // 足：先を前（−Z）へのばして長ぐつに、底は平らに
    if (aF.w > 4.5 && iA.w > 0.5) { p.z = p.z * 2.1 - 0.07; p.y = max(p.y, -1.03); }
  } else if (uKind > 4.5) {
    // 綿角：脚（しるし 10〜13）は付け根でふる、首（しるし 6）は付け根でうなずく、荷鞍（しるし 7）は iA.w = 1 のときだけ
    if (aF.w > 9.5) {
      float leg = aF.w - 10.0, side = mod(leg, 2.0), front = step(leg, 1.5);
      float sw = sin(iA.z + (side > 0.5 ? 3.1416 : 0.0) + (front > 0.5 ? 0.0 : 3.1416)) * iA.w * 0.55;
      vec3 q = p - vec3(0.0, 0.64, 0.0); q = rotX(q, sw); p = q + vec3(0.0, 0.64, 0.0);
      if (iA.x < -0.5) p.y = max(p.y * 0.3, 0.02);
    }
    if (aF.w > 5.5 && aF.w < 6.5) { vec3 q = p - vec3(0.0, 1.0, -0.5); q = rotX(q, iA.x * step(-0.5, iA.x)); p = q + vec3(0.0, 1.0, -0.5); n = rotX(n, iA.x * step(-0.5, iA.x)); }
    if (aF.w > 6.5 && aF.w < 7.5) keep *= step(0.5, iA.y);
  }
  if (aF.y > 0.5) { vec3 q = p - vec3(0.0, uPivot, 0.0); p = rotX(q, iA.x) + vec3(0.0, uPivot, 0.0); n = rotX(n, iA.x); }
  vec4 wp = modelMatrix * instanceMatrix * vec4(p * keep, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  vec3 base = aF.x < 0.5 ? instanceColor : (aF.x < 1.5 ? iCol2 : vec3(1.0));
  vCol = base * color;
  // 焚き火のそばは暖かく照らされる
  vec3 fl = uFire.xyz - wp.xyz; float fd = length(fl);
  vCol += vCol * vec3(1.0, 0.55, 0.22) * (uFire.w * max(dot(vN, fl / max(fd, 0.01)), 0.0) * 0.6 + uFire.w * 0.12) / (1.0 + fd * fd * 0.09) * step(0.5, keep);
  vWp = wp.xyz;
  vFog = awFog(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */`
${AW_PARS}
uniform float uRim, uTrans;
varying vec3 vCol; varying vec3 vN; varying vec3 vWp; varying vec4 vFog;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 vd = normalize(cameraPosition - vWp);
  vec3 c = awShade(n, vCol, vd, uRim, 1.0, uTrans, 0.08, 18.0);
  gl_FragColor = vec4(mix(c, vFog.rgb, vFog.a), 1.0);
  #include <colorspace_fragment>
}`;

// ── ポーズ：関節角（rad）を返す。t = 時刻、g = 歩きの位相、r = その人の乱数 ──
const J0 = () => ({ hipY: 0, bob: 0, lean: 0, roll: 0, twist: 0, sp: 0, sy: 0, sr: 0, hp: 0, hy: 0, hr: 0,
  aL: [0, 0.08, 0, 0.12], aR: [0, 0.08, 0, 0.12], lL: [0, 0.02, 0], lR: [0, 0.02, 0] });
// 毎フレーム作り直さない：既定の値に戻す（ポーズの関数は配列を差し替えることがあるので、差し替えた配列もここで戻す）
function resetJ(j) {
  j.hipY = j.bob = j.lean = j.roll = j.twist = j.sp = j.sy = j.sr = j.hp = j.hy = j.hr = 0;
  j.aL = j._aL || (j._aL = [0, 0, 0, 0]); j.aR = j._aR || (j._aR = [0, 0, 0, 0]); j.lL = j._lL || (j._lL = [0, 0, 0]); j.lR = j._lR || (j._lR = [0, 0, 0]);
  j.aL[0] = 0; j.aL[1] = 0.08; j.aL[2] = 0; j.aL[3] = 0.12; j.aR[0] = 0; j.aR[1] = 0.08; j.aR[2] = 0; j.aR[3] = 0.12;
  j.lL[0] = 0; j.lL[1] = 0.02; j.lL[2] = 0; j.lR[0] = 0; j.lR[1] = 0.02; j.lR[2] = 0;
  return j;
}
const setA = (a, x, y, z, w) => { a[0] = x; a[1] = y; a[2] = z; if (w !== undefined) a[3] = w; };
const S = Math.sin;
const POSE = {
  idle(j, t, g, r) { j.sp = 0.02 * S(t * 1.5 + r); j.hy = 0.22 * S(t * 0.27 + r * 7) * S(t * 0.11 + r); j.hp = 0.04 * S(t * 0.4 + r); j.aL[0] = j.aR[0] = 0.04 * S(t * 1.5 + r); },
  walk(j, t, g) {
    const s = S(g), c = Math.cos(g);
    j.lL[0] = 0.45 * s; j.lR[0] = -0.45 * s; j.lL[2] = -Math.max(0, -c) * 0.75 - 0.08; j.lR[2] = -Math.max(0, c) * 0.75 - 0.08;
    j.aL[0] = -0.38 * s; j.aR[0] = 0.38 * s; j.aL[3] = j.aR[3] = 0.32; j.bob = Math.abs(c) * 0.028; j.lean = 0.05; j.twist = 0.06 * s;
  },
  run(j, t, g) {
    const s = S(g), c = Math.cos(g);
    j.lL[0] = 0.8 * s; j.lR[0] = -0.8 * s; j.lL[2] = -Math.max(0, -c) * 1.4 - 0.2; j.lR[2] = -Math.max(0, c) * 1.4 - 0.2;
    j.aL[0] = -0.75 * s; j.aR[0] = 0.75 * s; j.aL[3] = j.aR[3] = 1.3; j.bob = Math.abs(c) * 0.07; j.lean = 0.2; j.twist = 0.1 * s; j.hp = -0.12;
  },
  sit(j, t) { j.hipY = -1; setA(j.lL, 1.5, 0.12, -1.45); setA(j.lR, 1.45, 0.08, -1.5); j.sp = 0.12 + 0.015 * S(t * 1.4); setA(j.aL, 0.75, 0.12, 0, 0.55); setA(j.aR, 0.7, 0.12, 0, 0.6); j.hp = 0.05; },
  talk(j, t, g, r, k) {
    POSE.idle(j, t, g, r);
    setA(j.aR, 0.45 + 0.22 * S(t * 2.1 + r), 0.18, 0.2, 1.25 + 0.3 * S(t * 2.7)); setA(j.aL, 0.15 + 0.1 * S(t * 1.7), 0.12, 0, 0.5 + 0.2 * S(t * 2.3 + 1));
    j.hp = 0.06 * S(t * 4.6) * k; j.hr = 0.06 * S(t * 1.3 + r);
  },
  wave(j, t, g, r) { POSE.idle(j, t, g, r); setA(j.aR, 0.25, 2.45 + 0.32 * S(t * 8.5), 0, 0.55); j.hr = 0.1; j.sr = -0.05; },
  nod(j, t, g, r) { POSE.idle(j, t, g, r); j.hp = 0.18 + 0.2 * S(t * 6); j.sp = 0.08 + 0.05 * S(t * 6); },
  cheer(j, t) { const b = Math.abs(S(t * 6.5)); j.bob = b * 0.09; setA(j.aL, 2.3 + 0.2 * S(t * 6.5), 0.75, 0, 0.25); setA(j.aR, 2.3 + 0.2 * S(t * 6.5 + 1), 0.75, 0, 0.25); j.hp = -0.2; j.lL[2] = j.lR[2] = -0.3 * b; },
  cower(j, t) { j.hipY = -0.42; setA(j.lL, 0.95, 0.15, -1.6); setA(j.lR, 0.95, 0.15, -1.6); j.sp = 0.55; j.lean = 0.2; setA(j.aL, 2.2, 0.3, 0, 1.9); setA(j.aR, 2.2, 0.3, 0, 1.9); j.hp = 0.35; j.twist = 0.03 * S(t * 23); },
  climb(j, t) {
    const a = S(t * 2.2), b = S(t * 2.2 + Math.PI);
    setA(j.aL, 2.75 + 0.25 * a, 0.25, 0, 0.35 + 0.6 * (0.5 - 0.5 * a)); setA(j.aR, 2.75 + 0.25 * b, 0.25, 0, 0.35 + 0.6 * (0.5 - 0.5 * b));
    setA(j.lL, 0.5 + 0.45 * (0.5 + 0.5 * a), 0.1, -1.0 * (0.5 + 0.5 * a)); setA(j.lR, 0.5 + 0.45 * (0.5 + 0.5 * b), 0.1, -1.0 * (0.5 + 0.5 * b));
    j.hp = -0.35; j.lean = -0.05; j.bob = 0.04 * a;
  },
  work(j, t, g, r) {
    const ph = (t * 1.1) % 1, up = ph < 0.65 ? ph / 0.65 : 1 - (ph - 0.65) / 0.35, hit = up * up;
    j.lean = 0.2; j.sp = 0.18; j.hp = 0.3;
    setA(j.aR, 0.7 + 1.5 * hit, 0.15, 0, 1.6 - 0.9 * hit); setA(j.aL, 0.75, 0.1, 0.25, 1.15);
    setA(j.lL, 0.12, 0.05, -0.12); setA(j.lR, -0.1, 0.05, 0);
  },
  sleep(j, t) { POSE.sit(j, t); j.hp = 0.55 + 0.03 * S(t * 0.9); j.sp = 0.22 + 0.02 * S(t * 0.9); setA(j.aL, 0.6, -0.1, 0.4, 1.9); setA(j.aR, 0.6, -0.1, -0.4, 1.9); },
  dance(j, t) {
    const s = S(t * 3.6), c = Math.cos(t * 3.6);
    j.roll = 0.1 * s; j.twist = 0.35 * S(t * 1.8); j.bob = Math.abs(c) * 0.05;
    setA(j.aL, 1.3 + 1.2 * (0.5 + 0.5 * s), 0.55, 0, 0.6); setA(j.aR, 1.3 + 1.2 * (0.5 - 0.5 * s), 0.55, 0, 0.6);
    setA(j.lL, 0.35 * Math.max(0, s), 0.08, -0.5 * Math.max(0, s)); setA(j.lR, 0.35 * Math.max(0, -s), 0.08, -0.5 * Math.max(0, -s)); j.hr = 0.12 * s;
  },
};
function mixJ(o, a, b, k) {
  for (const key in a) {
    if (key.charCodeAt(0) === 95) continue;          // _aL など（resetJ の控え）
    const va = a[key], vb = b[key];
    if (Array.isArray(va)) { for (let i = 0; i < va.length; i++) o[key][i] = va[i] + (vb[i] - va[i]) * k; } else o[key] = va + (vb - va) * k;
  }
  return o;
}

export function createFolk(env) {
  const group = new THREE.Group();
  group.name = 'aw-folk';
  const rng = env.fork('folk');
  const mkMat = (kind, pivot = 0, trans = 0.12, side = THREE.FrontSide) => new AwMaterial({
    uniforms: sharedUniforms(FOG_LIGHT_UNIFORMS, { uPivot: { value: pivot }, uKind: { value: kind }, uFire: { value: FIRE }, uRim: { value: 0.42 }, uTrans: { value: trans } }),
    vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, side,
  });
  const FIRE = new THREE.Vector4(0, -1000, 0, 0);
  const mk = (geo, mat, cap, name) => {
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    geo.setAttribute('iCol2', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.count = 0; m.name = name;
    group.add(m);
    return m;
  };
  const M = {
    torso: mk(torsoGeo(), mkMat(0, 0, 0.15, THREE.DoubleSide), MAXP, 'folk-torso'),
    head: mk(headGeo(), mkMat(1), MAXP, 'folk-head'),
    hat: mk(hatGeo(), mkMat(2, 0, 0.1, THREE.DoubleSide), MAXP, 'folk-hat'),
    prop: mk(propGeo(), mkMat(3, 0, 0, THREE.DoubleSide), MAXP, 'folk-prop'),
    limb: mk(limbGeo(), mkMat(4, -0.5), MAXP * 4, 'folk-limb'),
    beast: mk(beastGeo(), mkMat(5, 0, 0.25), MAXB, 'folk-beast'),
  };
  // 丸い影（全員で 1 枚のインスタンス）
  const shGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const shadow = new THREE.InstancedMesh(shGeo, new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vP; void main(){ float r = dot(vP, vP); float a = max(1.0 - r, 0.0); gl_FragColor = vec4(0.02, 0.03, 0.08, 0.4 * a * a); }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), MAXP + MAXB);
  shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadow.frustumCulled = false; shadow.count = 0; shadow.renderOrder = 2; shadow.name = 'folk-shadow';
  group.add(shadow);

  const list = [];
  let nextId = 1;
  const col = new THREE.Color(), col2 = new THREE.Color();
  const toLook = (look, id, kind) => {
    const preset = typeof look === 'string' ? FOLK_LOOKS[look] : (FOLK_LOOKS[id] || (kind === 'wataduno' ? FOLK_LOOKS.wataduno : FOLK_LOOKS.pilgrim));
    return Object.assign({}, FOLK_LOOKS.pilgrim, preset || {}, typeof look === 'object' && look ? look : {});
  };
  const resolve = (L) => {
    // §5.3 の look { coat, hood, skin, hat, prop } も受け付ける：hood（色）があれば頭巾、hat が文字列なら形の名前
    if (L.hood !== undefined && L.hood !== null) { L.hatKind = 'hood'; L.hat = L.hood; }
    if (typeof L.hat === 'string') { L.hatKind = L.hat; L.hat = L.hair ?? 0x4a3a2a; }
    return L;
  };

  function spawn({ id, kind = 'adult', look, x = 0, z = 0, yaw = 0, y } = {}) {
    const beast = kind === 'wataduno';
    const body = BODY[kind] || BODY.adult;
    const L = resolve(toLook(look, id, kind));
    const pos = new THREE.Vector3(x, y ?? env.world.groundAt(x, z, env.hf.heightAt(x, z) + 0.5), z);
    const f = {
      id: id ?? `folk-${nextId}`, kind, look: L, pos, yaw, visible: true,
      headPos: new THREE.Vector3(x, pos.y + 1.6, z), handPos: new THREE.Vector3(x, pos.y + 0.9, z),
      pose: 'idle',
      setPose(name, t = 0.25) {
        if (!POSE[name] && !beast) name = 'idle';
        if (name === S2.to) return f;
        S2.from = S2.to; S2.k0 = S2.k < 1 ? S2.k : 1; S2.to = name; S2.k = 0; S2.dur = Math.max(0.01, t); f.pose = name;
        return f;
      },
      lookAt(v) { S2.look = v ? (S2.look || new THREE.Vector3()).copy(v) : null; S2.lookOn = !!v; return f; },
      setTalk(level) { S2.talk = Math.max(0, Math.min(1, +level || 0)); return f; },
    };
    const S2 = { body, beast, from: 'idle', to: 'idle', k: 1, k0: 1, dur: 0.25, look: null, lookOn: false, talk: 0, talkS: 0, gait: rng.next() * 6.28, r: rng.next() * 10,
      hy: 0, hp: 0, lastX: x, lastZ: z, speed: 0, appear: 0, ja: J0(), jb: J0(), j: J0(), frame: 0 };
    f._s = S2; nextId++;
    list.push(f);
    return f;
  }
  function remove(f) { const i = list.indexOf(f); if (i >= 0) list.splice(i, 1); }

  // ── 毎フレーム ──
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mT = new THREE.Matrix4(), mR = new THREE.Matrix4(), mS = new THREE.Matrix4(), mH = new THREE.Matrix4(), hand = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), v2 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3();
  const rot = (m, x, y, z, order = 'YZX') => { e.set(x, y, z, order); return m.makeRotationFromEuler(e); };
  const drawP = [], drawB = [];
  let tNow = 0;
  const setIA = (mesh, i, a, b, c, d) => { const A = mesh.geometry.attributes.iA.array; A[i * 4] = a; A[i * 4 + 1] = b; A[i * 4 + 2] = c; A[i * 4 + 3] = d; };
  const setC2 = (mesh, i, hex) => { col2.set(hex); const A = mesh.geometry.attributes.iCol2.array; A[i * 3] = col2.r; A[i * 3 + 1] = col2.g; A[i * 3 + 2] = col2.b; };

  function poseOf(f, dt, far) {
    const S2 = f._s;
    // 歩幅に合わせて足を運ぶ：持ち主が動かした速さから位相を進める
    const dx = f.pos.x - S2.lastX, dz = f.pos.z - S2.lastZ; S2.lastX = f.pos.x; S2.lastZ = f.pos.z;
    const sp = dt > 0 ? Math.min(12, Math.hypot(dx, dz) / dt) : 0;
    S2.speed += (sp - S2.speed) * Math.min(1, dt * 8);
    const stride = S2.body.leg * (S2.to === 'run' ? 2.6 : 1.55);
    S2.gait += dt * (S2.speed > 0.2 ? S2.speed / stride * Math.PI : (S2.to === 'run' ? 9 : S2.to === 'walk' ? 5.2 : 0));
    S2.k = Math.min(1, S2.k + dt / S2.dur);
    S2.talkS += (S2.talk - S2.talkS) * Math.min(1, dt * 6);
    S2.appear = Math.min(1, S2.appear + dt * 2.6);
    const t = tNow * (f.kind === 'elder' ? 0.8 : f.kind === 'child' ? 1.15 : 1) + S2.r;
    // 遠い人（24 m より先）は関節の計算を 2 フレームに 1 回にする
    S2.frame++;
    if (far && (S2.frame & 1) && S2.k >= 1) return S2.j;
    const ja = resetJ(S2.ja), jb = resetJ(S2.jb);
    (POSE[S2.from] || POSE.idle)(ja, t, S2.gait, S2.r, S2.talkS);
    (POSE[S2.to] || POSE.idle)(jb, t, S2.gait, S2.r, S2.talkS);
    const k = S2.k * S2.k * (3 - 2 * S2.k);
    const j = mixJ(S2.j, ja, jb, k);
    // 話す：頭が小さく上下する
    j.hp += S2.talkS * 0.07 * Math.sin(tNow * 11 + S2.r) * Math.sin(tNow * 3.7);
    // 見る：頭が向き、大きいときは胸も少し回る
    let ty = 0, tp = 0;
    if (S2.lookOn && S2.look) {
      v.set(S2.look.x - f.headPos.x, S2.look.y - f.headPos.y, S2.look.z - f.headPos.z);
      const yawW = Math.atan2(v.x, -v.z), yr = f.yaw * Math.PI / 180;
      let d = yawW - yr; d = Math.atan2(Math.sin(d), Math.cos(d));
      ty = Math.max(-1.25, Math.min(1.25, d)); tp = Math.max(-0.45, Math.min(0.5, -Math.atan2(v.y, Math.hypot(v.x, v.z))));
      if (Math.abs(d) > 1.6) { ty = 0; tp = 0; }
    }
    S2.hy += (ty - S2.hy) * Math.min(1, dt * 5); S2.hp += (tp - S2.hp) * Math.min(1, dt * 5);
    // 時計回り（右）が正の向きの差 → Y 軸の回転は反時計回りが正なので符号を返す
    j.hy -= S2.hy * 0.75; j.sy -= S2.hy * 0.25; j.hp += S2.hp;
    return j;
  }

  function writePerson(f, j, ip) {
    const B = f._s.body, L = f.look;
    const s = (L.scale || 1) * (0.4 + 0.6 * f._s.appear) * (f.kind === 'adult' ? 1 : 1);
    const hipH = B.hip * s, yr = -f.yaw * Math.PI / 180;
    // 根もと：腰（座る・しゃがむと下がる）
    // 座る：腰かけの高さ f.seat（既定 0.42 m＝丸太・桟橋の縁）。0.25 m より低ければ地面に座り、ひざを立てる
    const seatH = f.seat ?? 0.42;
    if (j.hipY <= -1 && seatH < 0.25) { setA(j.lL, 1.15, 0.3, -2.2); setA(j.lR, 1.05, 0.22, -2.1); }
    const seat = j.hipY < 0 ? hipH + j.hipY * (hipH - (j.hipY <= -1 ? Math.max(0.1, seatH) : 0.42) * s) : hipH;
    mA.makeTranslation(f.pos.x, f.pos.y + seat + j.bob * s, f.pos.z);
    // 前かがみ（lean・sp）は正の値で前へ、頭の hp は正の値で下を向く（X 軸の回転は正で後ろへ倒れるので符号を返す）
    mA.multiply(rot(mR, -(B.hunch * 0.2 + j.lean), yr + j.twist, j.roll));
    // 脚
    for (let side = 0; side < 2; side++) {
      const lg = side ? j.lR : j.lL, sg = side ? 1 : -1;
      mB.copy(mA).multiply(mT.makeTranslation(sg * B.hp * s, 0, 0)).multiply(rot(mR, lg[0] + (B.hunch * 0.2 + j.lean), 0, sg * lg[1])).multiply(mS.makeScale(B.leg * s, B.leg * s, B.leg * s));
      const li = ip * 4 + side;
      M.limb.setMatrixAt(li, mB); col.set(L.legs); M.limb.setColorAt(li, col); setC2(M.limb, li, L.boots); setIA(M.limb, li, lg[2], 0, B.legT, 1);
    }
    // 胴（背の丸みは胸から先を前へ）
    mB.copy(mA).multiply(rot(mR, -(j.sp + B.hunch * 0.55), j.sy, j.sr));
    mH.copy(mB).multiply(mS.makeScale(B.torso[0] * s, B.torso[1] * s, B.torso[2] * s));
    M.torso.setMatrixAt(ip, mH); col.set(L.coat); M.torso.setColorAt(ip, col); setC2(M.torso, ip, L.trim);
    setIA(M.torso, ip, 0, OVER[L.over] ?? -1, L.hem ?? 1, L.flare ?? 1.1);
    const tH = 0.58 * B.torso[1] * s, shY = 0.47 * B.torso[1] * s, shX = B.sh * s;
    // 頭とかぶりもの
    const hr = B.head * s * (f.kind === 'child' ? 1 : 1);
    mH.copy(mB).multiply(mT.makeTranslation(0, tH, 0)).multiply(rot(mR, -(j.hp - B.hunch * 0.55), j.hy, j.hr)).multiply(mT.makeTranslation(0, hr * 0.92, -hr * 0.08)).multiply(mS.makeScale(hr, hr, hr));
    M.head.setMatrixAt(ip, mH); col.set(L.skin); M.head.setColorAt(ip, col); setC2(M.head, ip, L.hair); setIA(M.head, ip, 0, -2, 0, 0);
    M.hat.setMatrixAt(ip, mH); col.set(L.hat); M.hat.setColorAt(ip, col); setC2(M.hat, ip, L.hatKind === 'hood' ? (L.trim ?? 0xf4ecd8) : (L.hatKind === 'brim' ? L.trim : L.hair));
    setIA(M.hat, ip, 0, HATS[L.hatKind] ?? -1, L.hatKind === 'hood' ? (L.ears ? 1 : 0) : (L.brim ?? 2.0), L.crown ?? 0.6);
    v.set(0, 0, 0).applyMatrix4(mH); f.headPos.copy(v);
    // 腕
    const pv = PROPS[L.prop] ?? -1, upright = pv === 0 || pv === 4, propSide = upright ? 0 : 1;
    for (let side = 0; side < 2; side++) {
      const ar = side ? j.aR : j.aL, sg = side ? 1 : -1;
      mH.copy(mB).multiply(mT.makeTranslation(sg * shX, shY, 0)).multiply(rot(mR, ar[0], sg * ar[2], sg * ar[1], 'YZX'));
      const li = ip * 4 + 2 + side;
      if (side === propSide || side) {
        mT.copy(mH).multiply(mS.makeTranslation(0, -0.5 * B.arm * s, 0)).multiply(rot(mR, ar[3], 0, 0)).multiply(mS.makeTranslation(0, -0.47 * B.arm * s, 0));
        if (side) { v2.set(0, 0, 0).applyMatrix4(mT); f.handPos.copy(v2); }
        if (side === propSide) hand.copy(mT);
      }
      mH.multiply(mS.makeScale(B.arm * s, B.arm * s, B.arm * s));
      M.limb.setMatrixAt(li, mH); col.set(L.sleeves === 'skin' ? L.skin : L.coat); M.limb.setColorAt(li, col); setC2(M.limb, li, L.sleeves === 'skin' ? (L.armTrim ?? L.skin) : L.skin); setIA(M.limb, li, ar[3], 0, B.armT, 0);
    }
    // 持ちもの
    if (pv === 3) mH.copy(mB).multiply(mS.makeScale(s, s, s));
    else if (upright) {
      // 杖と灯籠は手の位置に、まっすぐ立てて持つ（体の向きだけ回す。歩くと少し前後にゆれる）
      v2.set(0, 0, 0).applyMatrix4(hand);
      mH.makeTranslation(v2.x, v2.y, v2.z).multiply(rot(mR, 0.08 * Math.sin(f._s.gait) * Math.min(1, f._s.speed), yr, -0.06)).multiply(mS.makeScale(s, s, s));
    } else mH.copy(hand).multiply(mS.makeScale(s, s, s));
    M.prop.setMatrixAt(ip, mH); col.set(0xffffff); M.prop.setColorAt(ip, col); setIA(M.prop, ip, 0, pv, L.propOpt ?? 0, 0);
    // 影
    mH.makeTranslation(f.pos.x, f.pos.y + 0.03, f.pos.z).multiply(mS.makeScale(0.42 * s, 1, 0.42 * s));
    return mH;
  }
  function writeBeast(f, j, ib) {
    const S2 = f._s, L = f.look, s = (L.scale || 1) * (0.4 + 0.6 * S2.appear), yr = -f.yaw * Math.PI / 180;
    const run = f.pose === 'run', walk = f.pose === 'walk' || run, sit = f.pose === 'sit' || f.pose === 'sleep', graze = f.pose === 'work' || f.pose === 'idle';
    const t = tNow + S2.r;
    const bob = walk ? Math.abs(Math.cos(S2.gait)) * (run ? 0.08 : 0.03) : 0.012 * Math.sin(t * 1.4);
    mA.makeTranslation(f.pos.x, f.pos.y + bob * s - (sit ? 0.42 * s : 0), f.pos.z).multiply(rot(mR, run ? 0.06 : 0, yr, 0)).multiply(mS.makeScale(s, s, s));
    M.beast.setMatrixAt(ib, mA); col.set(L.coat); M.beast.setColorAt(ib, col); setC2(M.beast, ib, L.skin);
    // 首：草を食むと下がる（ときどき顔を上げる）。見る相手があれば上げる
    let neck = graze ? 0.75 * (0.5 + 0.5 * Math.sin(t * 0.35)) : 0.1 * Math.sin(t * 2);
    if (S2.lookOn) neck = -0.1;
    setIA(M.beast, ib, sit ? -1 : neck, L.pack ? 1 : 0, S2.gait, walk ? (run ? 1.0 : 0.55) : 0);
    f.headPos.set(0, 1.1, -0.9).applyMatrix4(mA); f.handPos.copy(f.headPos);
    return mH.makeTranslation(f.pos.x, f.pos.y + 0.03, f.pos.z).multiply(mS.makeScale(0.75 * s, 1, 1.0 * s));
  }

  let quality = 0;
  function update(view) {
    const dt = Math.min(0.1, view.dt || 0);
    tNow += dt;
    const cam = view.cam, fwd = view.fwd;
    let fl = Math.hypot(fwd.x, fwd.z); const fx = fl > 1e-3 ? fwd.x / fl : 0, fz = fl > 1e-3 ? fwd.z / fl : -1;
    const wide = fl < 0.45;
    drawP.length = 0; drawB.length = 0;
    const R = quality > 1 ? VIEW_R * 0.7 : VIEW_R;
    for (const f of list) {
      if (!f.visible) { f._s.appear = 0; continue; }
      const dx = f.pos.x - cam.x, dz = f.pos.z - cam.z, d = Math.hypot(dx, dz);
      f._d = d;
      if (d > R) { f._s.appear = 0; continue; }
      // 見えない向き（背中側）は描かない。足もとと近くは残す
      if (!wide && d > 5 && (dx * fx + dz * fz) < -0.25 * d) continue;
      (f.kind === 'wataduno' ? drawB : drawP).push(f);
    }
    drawP.sort((a, b) => a._d - b._d); drawB.sort((a, b) => a._d - b._d);
    if (drawP.length > MAXP) drawP.length = MAXP;
    if (drawB.length > MAXB) drawB.length = MAXB;
    // 近くの焚き火（灯った風見の灯）で人を照らす
    FIRE.set(0, -1000, 0, 0);
    try {
      let best = 30;
      for (const p of env.props.api.ofKind('waylight')) {
        if (!p.state.lit) continue;
        const a = p.anchors.fire, d = Math.hypot(a.x - cam.x, a.z - cam.z);
        if (d < best) { best = d; FIRE.set(a.x, a.y + 0.4, a.z, 0.25 + 1.2 * view.st.night); }
      }
    } catch (err) { /* noop */ }
    let ns = 0;
    drawP.forEach((f, i) => {
      const far = f._d > LOD_R;
      const j = poseOf(f, dt, far);
      shadow.setMatrixAt(ns++, writePerson(f, j, i));
    });
    drawB.forEach((f, i) => {
      const S2 = f._s;
      const dx = f.pos.x - S2.lastX, dz = f.pos.z - S2.lastZ; S2.lastX = f.pos.x; S2.lastZ = f.pos.z;
      const sp = dt > 0 ? Math.min(12, Math.hypot(dx, dz) / dt) : 0;
      S2.speed += (sp - S2.speed) * Math.min(1, dt * 8);
      S2.gait += dt * (S2.speed > 0.2 ? S2.speed / 1.2 * Math.PI : (f.pose === 'run' ? 10 : f.pose === 'walk' ? 5 : 0));
      S2.appear = Math.min(1, S2.appear + dt * 2.6);
      shadow.setMatrixAt(ns++, writeBeast(f, null, i));
    });
    const nP = drawP.length;
    for (const k of ['torso', 'head', 'hat', 'prop']) M[k].count = nP;
    M.limb.count = nP * 4; M.beast.count = drawB.length; shadow.count = ns;
    for (const k in M) {
      const m = M[k];
      m.visible = m.count > 0;
      if (!m.count) continue;
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
      m.geometry.attributes.iA.needsUpdate = true; m.geometry.attributes.iCol2.needsUpdate = true;
    }
    shadow.visible = ns > 0; shadow.instanceMatrix.needsUpdate = true;
    let hats = 0, props = 0;
    for (let i = 0; i < nP; i++) { if ((HATS[drawP[i].look.hatKind] ?? -1) >= 0) hats++; if ((PROPS[drawP[i].look.prop] ?? -1) >= 0) props++; }
    M.hat.visible = M.hat.visible && hats > 0; M.prop.visible = M.prop.visible && props > 0;
  }

  const api = { spawn, remove, list, looks: FOLK_LOOKS, poses: FOLK_POSES };
  return { group, update, api, setQuality(l) { quality = l | 0; } };
}
