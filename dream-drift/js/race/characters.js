// race/characters.js — the eight original drivers and their karts, built from simple shapes
// (vertex-coloured parts merged into a few meshes per kart). Kart local frame: +z forward, +y up, +x left.
import * as THREE from 'three';
import { part, merge, toyMaterial, paint } from '../engine/util.js';

export const CHARACTERS = [
  { id: 'luna', name: 'ルナ', species: 'うさぎ', body: '#ffd6e8', belly: '#ffffff', head: '#fff2f7', accent: '#ff5fa2',
    kart: '#ff5fa2', kart2: '#ffffff', speed: 3, accel: 4, handling: 4, weight: 0.9, voice: 1.25,
    line: 'ふわふわ耳の 星空ライダー' },
  { id: 'bolt', name: 'ボルト', species: 'ロボット', body: '#5d8cff', belly: '#c9d6ff', head: '#7aa2ff', accent: '#30e8ff',
    kart: '#2f6bff', kart2: '#d7e3ff', speed: 5, accel: 2, handling: 3, weight: 1.25, voice: 0.85,
    line: '計算どおりの 最高速' },
  { id: 'momo', name: 'モモ', species: 'ねこ', body: '#ffa24a', belly: '#fff3e0', head: '#ffad5c', accent: '#ff7a1f',
    kart: '#ff8a1f', kart2: '#ffe36e', speed: 3, accel: 4, handling: 5, weight: 0.95, voice: 1.2,
    line: 'しっぽで バランス、コーナーの 名人' },
  { id: 'garu', name: 'ガルー', species: 'こどもドラゴン', body: '#4fcf6a', belly: '#f5f0a8', head: '#5ddb76', accent: '#ffd23f',
    kart: '#2fb257', kart2: '#ffd23f', speed: 5, accel: 3, handling: 2, weight: 1.3, voice: 0.8,
    line: 'ちいさな つばさの パワー派' },
  { id: 'penta', name: 'ペンタ', species: 'ペンギン', body: '#2b3a67', belly: '#ffffff', head: '#2b3a67', accent: '#ff4d4d',
    kart: '#8a5cff', kart2: '#c7f0ff', speed: 4, accel: 3, handling: 4, weight: 1.05, voice: 1.0,
    line: 'こおりの 上でも すべらない' },
  { id: 'kero', name: 'ケロ', species: 'カエル', body: '#7fdc3a', belly: '#f2ffd0', head: '#86e544', accent: '#ff9ec7',
    kart: '#18c4b4', kart2: '#eaffd0', speed: 3, accel: 5, handling: 3, weight: 0.9, voice: 1.15,
    line: 'ぴょんと 飛びだす スタートダッシュ' },
  { id: 'piyo', name: 'ピヨ', species: 'ひよこ', body: '#ffe14d', belly: '#fff6b8', head: '#ffe14d', accent: '#ff9a1f',
    kart: '#ffd400', kart2: '#47b8ff', speed: 2, accel: 5, handling: 5, weight: 0.8, voice: 1.4,
    line: 'かるさは いちばん、小回り じまん' },
  { id: 'kuma', name: 'クマジロウ', species: 'くま', body: '#9b6a43', belly: '#f1d3a8', head: '#a8744a', accent: '#ffcf4a',
    kart: '#e8343b', kart2: '#ffffff', speed: 4, accel: 2, handling: 3, weight: 1.4, voice: 0.75,
    line: 'どっしり 重くて ぶつかり 強い' },
];

export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// physics multipliers from the 1–5 stats
export function statMultipliers(c) {
  return {
    speed: 0.97 + (c.speed - 1) * 0.015,      // 0.97 … 1.03
    accel: 0.86 + (c.accel - 1) * 0.07,       // 0.86 … 1.14
    handling: 0.88 + (c.handling - 1) * 0.06, // 0.88 … 1.12
    weight: c.weight,
  };
}

const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cone: new THREE.ConeGeometry(1, 1, 14),
  torus: new THREE.TorusGeometry(1, 0.18, 8, 24),
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
// a capsule limb from a to b
function limb(a, b, r, color) {
  _a.set(...a); _b.set(...b);
  const len = _a.distanceTo(_b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 8);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _b.clone().sub(_a).normalize());
  _m.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return paint(g, color);
}
const glowCol = (hex, k = 3) => new THREE.Color(hex).multiplyScalar(k);

// ---------------------------------------------------------------------------------------------
// driver
const HEAD = [0, 1.78, -0.22];
function eyes(parts, { y = 1.82, x = 0.16, z = 0.17, s = 1, iris = '#1a1a2e' } = {}) {
  for (const sx of [-1, 1]) {
    parts.push(part(G.sphere, '#ffffff', [sx * x, y, z], [0, 0, 0], [0.11 * s, 0.14 * s, 0.07 * s]));
    parts.push(part(G.sphere, iris, [sx * (x - 0.008), y - 0.01, z + 0.05 * s], [0, 0, 0], [0.068 * s, 0.092 * s, 0.04 * s]));
    parts.push(part(G.sphereLo, '#ffffff', [sx * (x - 0.03) , y + 0.03, z + 0.08 * s], [0, 0, 0], 0.024 * s));
  }
}
function cheeks(parts, color = '#ff8fb1', y = 1.66, x = 0.28, z = 0.1) {
  for (const sx of [-1, 1]) parts.push(part(G.sphereLo, color, [sx * x, y, z], [0, sx * 0.5, 0], [0.08, 0.05, 0.03]));
}
function armsAndBody(parts, c, { hands = c.body } = {}) {
  parts.push(part(G.sphere, c.body, [0, 1.06, -0.32], [0, 0, 0], [0.42, 0.44, 0.36]));
  parts.push(part(G.sphere, c.belly, [0, 1.02, -0.14], [0, 0, 0], [0.3, 0.32, 0.2]));
  for (const sx of [-1, 1]) {
    parts.push(limb([sx * 0.36, 1.22, -0.26], [sx * 0.22, 1.12, 0.32], 0.09, c.body));
    parts.push(part(G.sphere, hands, [sx * 0.21, 1.12, 0.36], [0, 0, 0], 0.11));
  }
}

const SPECIES = {
  luna(c, parts, glow) {
    armsAndBody(parts, c, { hands: '#ffffff' });
    parts.push(part(G.sphere, c.head, HEAD, [0, 0, 0], [0.46, 0.43, 0.42]));
    parts.push(part(G.sphere, '#ffffff', [0, 1.66, 0.12], [0, 0, 0], [0.2, 0.13, 0.12]));
    parts.push(part(G.sphereLo, '#ff6f9f', [0, 1.71, 0.22], [0, 0, 0], [0.05, 0.035, 0.03]));
    eyes(parts, { iris: '#7a2b8f' });
    cheeks(parts);
    for (const sx of [-1, 1]) {
      parts.push(limb([sx * 0.14, 2.1, -0.28], [sx * 0.3, 2.78, -0.42], 0.11, c.head));
      parts.push(limb([sx * 0.145, 2.16, -0.2], [sx * 0.29, 2.7, -0.33], 0.055, '#ffadc9'));
    }
    // star hairpin
    glow.push(part(G.sphereLo, glowCol('#ffe066', 2.5), [0.24, 2.08, -0.05], [0, 0, 0], 0.07));
  },
  bolt(c, parts, glow) {
    armsAndBody(parts, c, { hands: '#c9d6ff' });
    parts.push(part(G.box, c.head, [0, 1.8, -0.22], [0, 0, 0], [0.84, 0.66, 0.72]));
    parts.push(part(G.box, '#1b2140', [0, 1.82, 0.15], [0, 0, 0], [0.68, 0.32, 0.04]));
    parts.push(part(G.cyl, '#c9d6ff', [0.45, 1.8, -0.22], [0, 0, Math.PI / 2], [0.16, 0.08, 0.16]));
    parts.push(part(G.cyl, '#c9d6ff', [-0.45, 1.8, -0.22], [0, 0, Math.PI / 2], [0.16, 0.08, 0.16]));
    parts.push(part(G.cyl, '#9aa8c8', [0, 2.3, -0.22], [0, 0, 0], [0.025, 0.36, 0.025]));
    for (const sx of [-1, 1]) glow.push(part(G.sphereLo, glowCol(c.accent, 3), [sx * 0.15, 1.83, 0.18], [0, 0, 0], [0.09, 0.07, 0.03]));
    glow.push(part(G.sphereLo, glowCol('#ff4fd8', 3), [0, 2.5, -0.22], [0, 0, 0], 0.07));
    glow.push(part(G.box, glowCol(c.accent, 2), [0, 1.66, 0.165], [0, 0, 0], [0.22, 0.03, 0.02]));
  },
  momo(c, parts) {
    armsAndBody(parts, c, { hands: '#fff3e0' });
    parts.push(part(G.sphere, c.head, HEAD, [0, 0, 0], [0.48, 0.42, 0.42]));
    parts.push(part(G.sphere, '#fff3e0', [0, 1.65, 0.12], [0, 0, 0], [0.22, 0.13, 0.12]));
    parts.push(part(G.sphereLo, '#ff6f9f', [0, 1.72, 0.22], [0, 0, 0], [0.045, 0.03, 0.03]));
    eyes(parts, { iris: '#2f7a2b' });
    cheeks(parts);
    for (const sx of [-1, 1]) {
      parts.push(part(G.cone, c.head, [sx * 0.27, 2.15, -0.25], [0, 0, -sx * 0.35], [0.16, 0.3, 0.12]));
      parts.push(part(G.cone, '#ffb3c8', [sx * 0.265, 2.13, -0.2], [0, 0, -sx * 0.35], [0.09, 0.2, 0.05]));
      for (const dy of [-0.03, 0.04]) parts.push(part(G.cyl, '#5a3a22', [sx * 0.32, 1.66 + dy, 0.12], [0, 0, Math.PI / 2 + sx * dy * 3], [0.008, 0.28, 0.008]));
      // stripes
      parts.push(part(G.sphereLo, '#e8761a', [sx * 0.12, 2.12, -0.2], [0, 0, 0], [0.05, 0.04, 0.2]));
    }
    // tail
    parts.push(limb([0, 0.95, -0.62], [0.05, 1.45, -0.95], 0.07, c.body));
    parts.push(limb([0.05, 1.45, -0.95], [0.2, 1.75, -0.85], 0.07, '#e8761a'));
  },
  garu(c, parts) {
    armsAndBody(parts, c, { hands: c.body });
    parts.push(part(G.sphere, c.head, HEAD, [0, 0, 0], [0.45, 0.42, 0.44]));
    parts.push(part(G.sphere, c.head, [0, 1.68, 0.14], [0, 0, 0], [0.28, 0.2, 0.24]));
    parts.push(part(G.sphere, c.belly, [0, 1.6, 0.16], [0, 0, 0], [0.22, 0.1, 0.2]));
    for (const sx of [-1, 1]) parts.push(part(G.sphereLo, '#1d5e2c', [sx * 0.08, 1.74, 0.36], [0, 0, 0], 0.025));
    eyes(parts, { y: 1.92, x: 0.17, z: 0.12, iris: '#b5491a' });
    for (const sx of [-1, 1]) {
      parts.push(part(G.cone, '#fff4c8', [sx * 0.22, 2.2, -0.32], [-0.5, 0, -sx * 0.3], [0.07, 0.3, 0.07]));
      // little wings
      parts.push(part(G.sphere, c.accent, [sx * 0.45, 1.3, -0.55], [0.3, sx * 0.6, sx * 0.4], [0.32, 0.2, 0.05]));
    }
    for (let i = 0; i < 3; i++) parts.push(part(G.cone, c.accent, [0, 2.2 - i * 0.18, -0.5 - i * 0.08], [-0.9, 0, 0], [0.07, 0.18, 0.07]));
    cheeks(parts, '#ff9a7a', 1.7, 0.3, 0.06);
  },
  penta(c, parts) {
    armsAndBody(parts, c, { hands: c.body });
    parts.push(part(G.sphere, c.head, HEAD, [0, 0, 0], [0.46, 0.44, 0.42]));
    parts.push(part(G.sphere, '#ffffff', [0, 1.72, -0.06], [0, 0, 0], [0.36, 0.33, 0.33]));
    parts.push(part(G.cone, '#ffb020', [0, 1.7, 0.33], [Math.PI / 2, 0, 0], [0.09, 0.22, 0.06]));
    eyes(parts, { y: 1.85, x: 0.15, z: 0.21, s: 0.9 });
    cheeks(parts, '#ff9ab8', 1.68, 0.24, 0.18);
    // scarf
    parts.push(part(G.torus, c.accent, [0, 1.4, -0.25], [Math.PI / 2, 0, 0], [0.36, 0.36, 0.7]));
    parts.push(part(G.box, c.accent, [0.25, 1.25, -0.62], [0.3, 0, 0.2], [0.14, 0.35, 0.05]));
    // beanie
    parts.push(part(G.sphere, '#ff4d4d', [0, 2.06, -0.24], [0, 0, 0], [0.38, 0.22, 0.36]));
    parts.push(part(G.sphereLo, '#ffffff', [0, 2.3, -0.26], [0, 0, 0], 0.1));
  },
  kero(c, parts) {
    armsAndBody(parts, c, { hands: c.body });
    parts.push(part(G.sphere, c.head, [0, 1.7, -0.2], [0, 0, 0], [0.55, 0.38, 0.44]));
    for (const sx of [-1, 1]) {
      parts.push(part(G.sphere, c.head, [sx * 0.25, 2.0, -0.12], [0, 0, 0], [0.19, 0.19, 0.19]));
      parts.push(part(G.sphere, '#ffffff', [sx * 0.25, 2.03, -0.02], [0, 0, 0], [0.14, 0.15, 0.1]));
      parts.push(part(G.sphere, '#1a1a2e', [sx * 0.24, 2.03, 0.06], [0, 0, 0], [0.08, 0.1, 0.04]));
      parts.push(part(G.sphereLo, '#ffffff', [sx * 0.22, 2.07, 0.095], [0, 0, 0], 0.025));
    }
    parts.push(part(G.torus, '#2f5a1a', [0, 1.66, 0.15], [0.2, 0, Math.PI], [0.26, 0.12, 0.2]));
    cheeks(parts, c.accent, 1.68, 0.36, 0.08);
    // little crown leaf
    parts.push(part(G.sphere, '#3fae2a', [0.05, 2.14, -0.3], [0.3, 0, 0.5], [0.16, 0.04, 0.1]));
  },
  piyo(c, parts) {
    armsAndBody(parts, c, { hands: c.body });
    parts.push(part(G.sphere, c.head, [0, 1.7, -0.22], [0, 0, 0], [0.5, 0.48, 0.46]));
    parts.push(part(G.cone, '#ff9a1f', [0, 1.66, 0.3], [Math.PI / 2, 0, 0], [0.1, 0.18, 0.07]));
    eyes(parts, { y: 1.8, x: 0.17, z: 0.2, s: 0.85 });
    cheeks(parts, '#ffa0a0', 1.64, 0.3, 0.12);
    for (let i = -1; i <= 1; i++) parts.push(part(G.sphere, c.head, [i * 0.06, 2.22, -0.25], [0, 0, i * 0.5], [0.05, 0.16, 0.05]));
    // egg-shell helmet
    parts.push(part(G.sphere, '#fffaf0', [0, 1.98, -0.25], [0, 0, 0], [0.47, 0.18, 0.45]));
    for (const sx of [-1, 1]) parts.push(part(G.sphere, c.body, [sx * 0.48, 1.05, -0.35], [0, 0, sx * 0.6], [0.08, 0.2, 0.14]));
  },
  kuma(c, parts) {
    armsAndBody(parts, c, { hands: c.body });
    parts.push(part(G.sphere, c.head, HEAD, [0, 0, 0], [0.5, 0.45, 0.44]));
    parts.push(part(G.sphere, c.belly, [0, 1.66, 0.13], [0, 0, 0], [0.22, 0.15, 0.13]));
    parts.push(part(G.sphere, '#2a1a12', [0, 1.73, 0.25], [0, 0, 0], [0.07, 0.05, 0.04]));
    eyes(parts, { y: 1.86, x: 0.17, z: 0.17, s: 0.8 });
    cheeks(parts);
    for (const sx of [-1, 1]) {
      parts.push(part(G.sphere, c.head, [sx * 0.34, 2.12, -0.24], [0, 0, 0], [0.15, 0.15, 0.1]));
      parts.push(part(G.sphere, c.belly, [sx * 0.34, 2.12, -0.2], [0, 0, 0], [0.09, 0.09, 0.07]));
    }
    // cap
    parts.push(part(G.sphere, c.kart, [0, 2.08, -0.24], [0, 0, 0], [0.42, 0.18, 0.4]));
    parts.push(part(G.cyl, c.kart, [0, 2.02, 0.12], [0.15, 0, 0], [0.3, 0.03, 0.22]));
  },
};

// ---------------------------------------------------------------------------------------------
// kart
const WHEEL_R = 0.4;
function wheelGeometry(c, rear) {
  const r = rear ? WHEEL_R * 1.08 : WHEEL_R, w = rear ? 0.42 : 0.34;
  return merge([
    part(G.cyl, '#24242c', [0, 0, 0], [0, 0, Math.PI / 2], [r, w, r]),
    part(G.torus, '#3a3a46', [0, 0, 0], [0, Math.PI / 2, 0], [r * 0.93, r * 0.93, w * 2.2]),
    part(G.cyl, c.kart2, [0, 0, 0], [0, 0, Math.PI / 2], [r * 0.55, w + 0.02, r * 0.55]),
    part(G.cyl, '#d8dbe6', [0, 0, 0], [0, 0, Math.PI / 2], [r * 0.2, w + 0.06, r * 0.2]),
  ]);
}

function chassisParts(c) {
  const k = c.kart, k2 = c.kart2, dark = '#2a2d3a', metal = '#b8bfcf';
  return [
    part(G.box, dark, [0, 0.42, 0.05], [0, 0, 0], [1.25, 0.16, 2.3]),
    part(G.sphere, k, [0, 0.6, 0.0], [0, 0, 0], [0.82, 0.38, 1.28]),
    part(G.sphere, k, [0, 0.58, 0.95], [0.12, 0, 0], [0.62, 0.3, 0.62]),
    part(G.cyl, k2, [0, 0.42, 1.38], [0, 0, Math.PI / 2], [0.17, 1.5, 0.17]),
    part(G.sphereLo, k2, [0.75, 0.42, 1.38], [0, 0, 0], 0.17),
    part(G.sphereLo, k2, [-0.75, 0.42, 1.38], [0, 0, 0], 0.17),
    part(G.sphere, k2, [0.78, 0.5, 0.05], [0, 0, 0], [0.3, 0.24, 0.85]),
    part(G.sphere, k2, [-0.78, 0.5, 0.05], [0, 0, 0], [0.3, 0.24, 0.85]),
    // seat
    part(G.box, dark, [0, 0.95, -0.62], [-0.22, 0, 0], [0.9, 0.75, 0.16]),
    part(G.box, dark, [0, 0.72, -0.35], [0, 0, 0], [0.8, 0.12, 0.6]),
    // steering wheel
    part(G.torus, '#1d1f29', [0, 1.1, 0.44], [-1.0, 0, 0], [0.24, 0.24, 0.24]),
    part(G.cyl, '#1d1f29', [0, 0.9, 0.55], [-1.0, 0, 0], [0.04, 0.45, 0.04]),
    // engine + exhausts
    part(G.box, metal, [0, 0.72, -1.02], [0, 0, 0], [0.82, 0.42, 0.42]),
    part(G.box, dark, [0, 0.98, -1.02], [0, 0, 0], [0.6, 0.12, 0.3]),
    part(G.cyl, '#d8dbe6', [0.24, 0.75, -1.3], [Math.PI / 2 - 0.35, 0, 0], [0.09, 0.42, 0.09]),
    part(G.cyl, '#d8dbe6', [-0.24, 0.75, -1.3], [Math.PI / 2 - 0.35, 0, 0], [0.09, 0.42, 0.09]),
    // spoiler
    part(G.box, k2, [0, 1.28, -1.22], [0.08, 0, 0], [1.45, 0.07, 0.38]),
    part(G.box, k, [0.62, 1.28, -1.22], [0, 0, 0], [0.06, 0.22, 0.42]),
    part(G.box, k, [-0.62, 1.28, -1.22], [0, 0, 0], [0.06, 0.22, 0.42]),
    part(G.box, dark, [0.3, 1.08, -1.2], [0, 0, 0], [0.06, 0.32, 0.12]),
    part(G.box, dark, [-0.3, 1.08, -1.2], [0, 0, 0], [0.06, 0.32, 0.12]),
    // number disc
    part(G.cyl, '#ffffff', [0, 0.72, 1.36], [Math.PI / 2 - 0.4, 0, 0], [0.2, 0.02, 0.2]),
    // fenders
    part(G.sphere, k, [0.72, 0.72, 0.82], [0, 0, 0], [0.26, 0.12, 0.42]),
    part(G.sphere, k, [-0.72, 0.72, 0.82], [0, 0, 0], [0.26, 0.12, 0.42]),
  ];
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(cv);
  return blobTex;
}

// build the whole kart rig for character c
export function buildKart(c) {
  const root = new THREE.Group(); root.name = 'kart-' + c.id;
  const visual = new THREE.Group(); root.add(visual);
  const chassis = new THREE.Mesh(merge(chassisParts(c)), toyMaterial({ roughness: 0.28, metalness: 0.15 }));
  chassis.castShadow = true;
  visual.add(chassis);

  const driver = new THREE.Group();
  const parts = [], glow = [];
  (SPECIES[c.id] || SPECIES.luna)(c, parts, glow);
  const dm = new THREE.Mesh(merge(parts), toyMaterial({ roughness: 0.5 }));
  dm.castShadow = true;
  driver.add(dm);
  if (glow.length) driver.add(new THREE.Mesh(merge(glow), glowMaterial()));
  visual.add(driver);

  const wheels = [];
  const front = wheelGeometry(c, false), rear = wheelGeometry(c, true);
  const wmat = toyMaterial({ roughness: 0.7 });
  const pivots = [];
  for (const [x, z, isRear] of [[0.86, 0.85, false], [-0.86, 0.85, false], [0.9, -0.82, true], [-0.9, -0.82, true]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, isRear ? WHEEL_R * 1.08 : WHEEL_R, z);
    const w = new THREE.Mesh(isRear ? rear : front, wmat);
    w.castShadow = true;
    pivot.add(w);
    visual.add(pivot);
    wheels.push(w);
    if (!isRear) pivots.push(pivot);
  }

  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
  blob.geometry.rotateX(-Math.PI / 2);
  blob.position.y = 0.05;
  blob.renderOrder = 1;
  root.add(blob);

  return {
    root, visual, chassis, driver, wheels, pivots, blob,
    exhausts: [new THREE.Vector3(0.24, 0.82, -1.5), new THREE.Vector3(-0.24, 0.82, -1.5)],
    rearWheels: [new THREE.Vector3(0.9, 0.1, -0.82), new THREE.Vector3(-0.9, 0.1, -0.82)],
  };
}

let glowMat = null;
function glowMaterial() {
  if (!glowMat) { glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); glowMat.userData.shared = true; }
  return glowMat;
}

// render a portrait of each character (for the select screen); returns a Map id → dataURL
export function renderPortraits(size = 256) {
  const out = new Map();
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { return out; }
  r.setSize(size, size, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7ab8', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(3, 5, 6); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(3.3, 2.7, 6.0); cam.lookAt(0, 1.05, 0);
  for (const c of CHARACTERS) {
    const k = buildKart(c);
    k.root.rotation.y = 0.45;
    k.blob.visible = false;
    scene.add(k.root);
    r.render(scene, cam);
    out.set(c.id, r.domElement.toDataURL('image/png'));
    scene.remove(k.root);
    k.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  r.dispose();
  r.forceContextLoss?.();
  return out;
}
