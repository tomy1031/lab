// race/characters.js — the eight original drivers and their karts.
//
// A driver is a body (vertex-coloured parts merged into one mesh) and a head that turns on its own. The face is
// painted, not modelled: a canvas atlas of eight expressions per character (normal, blink, happy, hurt, focus,
// surprised, sad, wink) is projected straight from the front onto the face surfaces (the front of the head, the
// muzzle, a frog's eye bumps, a robot's screen), so the eyes and mouth can change and blink while racing.
// Ears, antennae, tails, scarves and wings are springs that swing with the kart. Every part has a soft rim light.
// Kart local frame: +z forward, +y up, +x to the kart's left.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, merge, paint, damp, clamp } from '../engine/util.js';

export const CHARACTERS = [
  { id: 'luna', name: 'ルナ', species: 'うさぎ', type: 'バランス', body: '#fff4f8', belly: '#ffffff', head: '#fff4f8', accent: '#ff5fa2',
    kart: '#ff5fa2', kart2: '#ffffff', speed: 3, accel: 4, handling: 4, weight: 0.9, voice: 1.25,
    line: 'ふわふわ耳の 星空ライダー', bio: '流れ星を 追いかけて 走りだした 夢見る うさぎ。かた耳が いつも ぺたんと たれている。' },
  { id: 'bolt', name: 'ボルト', species: 'ロボット', type: 'スピード', body: '#5d8cff', belly: '#c9d6ff', head: '#7aa2ff', accent: '#30e8ff',
    kart: '#2f6bff', kart2: '#d7e3ff', speed: 5, accel: 2, handling: 3, weight: 1.25, voice: 0.85,
    line: '計算どおりの 最高速', bio: '顔の 画面で 気持ちが まる見え。最高速の 計算は とくいだけど、負けると すぐ 顔に 出る。' },
  { id: 'momo', name: 'モモ', species: 'ねこ', type: 'テクニック', body: '#ffad5c', belly: '#fff3e0', head: '#ffad5c', accent: '#ff7a1f',
    kart: '#ff8a1f', kart2: '#ffe36e', speed: 3, accel: 4, handling: 5, weight: 0.95, voice: 1.2,
    line: 'しっぽで バランス、コーナーの 名人', bio: '鈴の 音を 鳴らして コーナーを すりぬける きまぐれ ねこ。パーカーの フードが お気に入り。' },
  { id: 'garu', name: 'ガルー', species: 'こどもドラゴン', type: 'パワー', body: '#5ddb76', belly: '#f5f0a8', head: '#5ddb76', accent: '#ffd23f',
    kart: '#2fb257', kart2: '#ffd23f', speed: 5, accel: 3, handling: 2, weight: 1.3, voice: 0.8,
    line: 'ちいさな つばさの パワー派', bio: 'まだ 空は 飛べない けれど、つばさを パタパタ させて 全力で 走る。キバが ちょっと じまん。' },
  { id: 'penta', name: 'ペンタ', species: 'ペンギン', type: 'オールラウンド', body: '#2b3a67', belly: '#ffffff', head: '#2b3a67', accent: '#ff4d4d',
    kart: '#8a5cff', kart2: '#c7f0ff', speed: 4, accel: 3, handling: 4, weight: 1.05, voice: 1.0,
    line: 'こおりの 上でも すべらない', bio: '南の 氷の くにから やってきた。ニット帽と ゴーグルと マフラーは いつも セット。' },
  { id: 'kero', name: 'ケロ', species: 'カエル', type: 'ダッシュ', body: '#86e544', belly: '#f2ffd0', head: '#86e544', accent: '#ff9ec7',
    kart: '#18c4b4', kart2: '#eaffd0', speed: 3, accel: 5, handling: 3, weight: 0.9, voice: 1.15,
    line: 'ぴょんと 飛びだす スタートダッシュ', bio: 'はすの 葉っぱの 帽子が トレードマーク。スタートの 合図と 同時に ぴょーんと 飛びだす。' },
  { id: 'piyo', name: 'ピヨ', species: 'ひよこ', type: 'かるさ', body: '#ffe14d', belly: '#fff6b8', head: '#ffe14d', accent: '#ff9a1f',
    kart: '#ffd400', kart2: '#47b8ff', speed: 2, accel: 5, handling: 5, weight: 0.8, voice: 1.4,
    line: 'かるさは いちばん、小回り じまん', bio: 'たまごの カラの ヘルメットで 安全運転。ちいさな 体で どこでも くるっと 曲がれる。' },
  { id: 'kuma', name: 'クマジロウ', species: 'くま', type: 'ヘビー', body: '#a8744a', belly: '#f1d3a8', head: '#a8744a', accent: '#ffcf4a',
    kart: '#e8343b', kart2: '#ffffff', speed: 4, accel: 2, handling: 3, weight: 1.4, voice: 0.75,
    line: 'どっしり 重くて ぶつかり 強い', bio: 'ほっぺの ばんそうこうは 修行の あかし。おっとり して いるけど、ぶつかりあいでは 負けない。' },
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

// the eight faces in every atlas
export const EXPR = { normal: 0, blink: 1, happy: 2, hurt: 3, focus: 4, surprised: 5, sad: 6, wink: 7 };

const G = {
  hi: new THREE.SphereGeometry(1, 28, 20),
  sphere: new THREE.SphereGeometry(1, 18, 12),
  lo: new THREE.SphereGeometry(1, 10, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 22),
  cone: new THREE.ConeGeometry(1, 1, 18),
  torus: new THREE.TorusGeometry(1, 0.18, 10, 32),
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const Z = new THREE.Vector3(0, 0, 1), YUP = new THREE.Vector3(0, 1, 0);
// a capsule limb from a to b
function limb(a, b, r, color) {
  _a.set(...a); _b.set(...b);
  const len = _a.distanceTo(_b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 5, 12);
  _q.setFromUnitVectors(YUP, _b.clone().sub(_a).normalize());
  _m.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m);
  return paint(g, color);
}
const E = (color, c, r, rot = [0, 0, 0]) => part(G.hi, color, c, rot, r); // a smooth ellipsoid
const glowCol = (hex, k = 3) => new THREE.Color(hex).multiplyScalar(k);

// ---------------------------------------------------------------------------------------------
// materials: the toy look plus a soft rim light, so the characters read clearly against any course
const RIM = { color: new THREE.Color('#fff4ff'), k: 0.38 };
function addRim(m, k = RIM.k) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: RIM.color };
    sh.uniforms.rimK = { value: k };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimK;')
      .replace('#include <opaque_fragment>', `{ float rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        outgoingLight += rimColor * rimK * rimF * rimF * rimF; }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'dd-rim';
  return m;
}
const matCache = new Map();
function charMaterial(opts = {}) {
  const key = JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = addRim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, ...opts }));
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return matCache.get(key);
}
let glowMat = null;
function glowMaterial() {
  if (!glowMat) { glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); glowMat.userData.shared = true; }
  return glowMat;
}

// ---------------------------------------------------------------------------------------------
// face painting. A face spec draws in head-local units (y up); box = { cy, h } is the square the atlas cell
// covers (centre height, half size), seen straight from the front.
const COLS = 4, ROWS = 2, CELL = 256;

function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(1e-4, rx), Math.max(1e-4, ry), rot, 0, Math.PI * 2); }
function starPath(ctx, x, y, r, pts = 5, inner = 0.46, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = rot + Math.PI / 2 + (i * Math.PI) / pts, rr = i % 2 ? r * inner : r;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// one eye. side: -1 = the eye on the viewer's left, +1 = right. e: expression
function drawEye(ctx, F, side, e, em) {
  const S = F.eye, x = side * S.x, y = S.y, rx = S.rx, ry = S.ry, line = S.line || '#1d1233';
  const lw = rx * 0.3, inward = -side;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = (fn) => { if (em) return; ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.beginPath(); fn(); ctx.stroke(); };
  const lash = (ox, oy) => { if (!S.lash) return; stroke(() => { ctx.moveTo(ox, oy); ctx.lineTo(ox + side * rx * 0.5, oy + ry * 0.32); }); if (S.lash > 1) stroke(() => { ctx.moveTo(ox - side * rx * 0.12, oy + ry * 0.18); ctx.lineTo(ox + side * rx * 0.3, oy + ry * 0.62); }); };
  const mode = e === EXPR.blink ? 'closed' : e === EXPR.happy ? 'happy' : e === EXPR.hurt ? 'hurt' : e === EXPR.surprised ? 'wide'
    : e === EXPR.wink && side > 0 ? 'happy' : 'open';
  if (mode === 'closed') {
    stroke(() => { ctx.moveTo(x - rx, y - ry * 0.05); ctx.quadraticCurveTo(x, y - ry * 0.72, x + rx, y - ry * 0.05); });
    lash(x + side * rx * 0.95, y - ry * 0.05);
    return;
  }
  if (mode === 'happy') {
    stroke(() => { ctx.moveTo(x - rx * 1.02, y - ry * 0.3); ctx.quadraticCurveTo(x, y + ry * 0.95, x + rx * 1.02, y - ry * 0.3); });
    return;
  }
  if (mode === 'hurt') {
    stroke(() => { ctx.moveTo(x - inward * rx * 0.95, y + ry * 0.62); ctx.lineTo(x + inward * rx * 0.85, y); ctx.lineTo(x - inward * rx * 0.95, y - ry * 0.62); });
    return;
  }
  if (mode === 'wide') {
    if (!em) {
      ctx.fillStyle = '#ffffff'; ell(ctx, x, y, rx * 1.02, ry * 1.02); ctx.fill();
      ctx.strokeStyle = line; ctx.lineWidth = lw * 0.6; ctx.stroke();
      ctx.fillStyle = line; ell(ctx, x, y - ry * 0.05, rx * 0.36, ry * 0.4); ctx.fill();
    }
    ctx.fillStyle = '#ffffff'; ell(ctx, x - rx * 0.12, y + ry * 0.1, rx * 0.12, ry * 0.12); ctx.fill();
    return;
  }
  // open (normal, focus, sad, the open eye of a wink)
  if (!em) {
    ctx.fillStyle = line; ell(ctx, x, y, rx, ry); ctx.fill();
    const g = ctx.createLinearGradient(0, y + ry, 0, y - ry);
    g.addColorStop(0, S.irisDark || line); g.addColorStop(0.42, S.iris); g.addColorStop(1, S.iris2);
    ctx.fillStyle = g; ell(ctx, x, y - ry * 0.07, rx * 0.8, ry * 0.8); ctx.fill();
    ctx.fillStyle = line; ell(ctx, x, y + ry * 0.04, rx * 0.36, ry * 0.42); ctx.fill();
    // a lighter crescent at the bottom of the iris
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ell(ctx, x, y - ry * 0.56, rx * 0.46, ry * 0.14); ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  if (S.star) { starPath(ctx, x - rx * 0.28, y + ry * 0.36, rx * 0.36); ctx.fill(); }
  else { ell(ctx, x - rx * 0.3, y + ry * 0.38, rx * 0.34, ry * 0.25, -0.5); ctx.fill(); }
  ell(ctx, x + rx * 0.34, y - ry * 0.4, rx * 0.15, ry * 0.11); ctx.fill();
  if (e === EXPR.sad) { ell(ctx, x + rx * 0.05, y - ry * 0.05, rx * 0.12, ry * 0.09); ctx.fill(); }
  // the upper lid
  stroke(() => { ctx.ellipse(x, y, rx * 1.03, ry * 1.03, 0, Math.PI * 0.12, Math.PI * 0.88); });
  lash(x + side * rx * 0.86, y + ry * 0.5);
  // focus: lids cut flat and slanting in (determined); sad: slanting out, and a tear
  if (e === EXPR.focus || e === EXPR.sad) {
    const yi = y + ry * (e === EXPR.focus ? 0.12 : 0.62), yo = y + ry * (e === EXPR.focus ? 0.6 : 0.2);
    const xi = x + inward * rx * 1.25, xo = x - inward * rx * 1.25;
    ctx.fillStyle = em ? '#000000' : S.bg || F.skin;
    ctx.beginPath(); ctx.moveTo(xi, yi); ctx.lineTo(xo, yo); ctx.lineTo(xo, y + ry * 1.6); ctx.lineTo(xi, y + ry * 1.6); ctx.closePath(); ctx.fill();
    stroke(() => { ctx.moveTo(xi - inward * rx * 0.1, yi); ctx.lineTo(xo, yo); });
    if (e === EXPR.sad && !em) {
      ctx.fillStyle = '#8fe0ff';
      ctx.beginPath(); const tx = x - inward * rx * 0.9, ty = y - ry * 0.95;
      ctx.moveTo(tx, ty + ry * 0.35); ctx.quadraticCurveTo(tx + rx * 0.28, ty - ry * 0.05, tx, ty - ry * 0.12); ctx.quadraticCurveTo(tx - rx * 0.28, ty - ry * 0.05, tx, ty + ry * 0.35); ctx.fill();
    }
  }
}

function drawBrows(ctx, F, e) {
  const B = F.brow; if (!B) return;
  ctx.strokeStyle = B.color; ctx.lineWidth = B.w; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const x = side * F.eye.x, inward = -side;
    let y = F.eye.y + F.eye.ry + B.dy, tilt = 0; // tilt > 0: the inner end lower
    if (e === EXPR.focus || e === EXPR.hurt) tilt = 0.5;
    else if (e === EXPR.sad) tilt = -0.45;
    else if (e === EXPR.surprised) y += B.dy * 0.9;
    else if (e === EXPR.happy || e === EXPR.wink) y += B.dy * 0.4;
    const L = B.len;
    ctx.beginPath();
    ctx.moveTo(x - inward * L, y + tilt * L * 0.3);
    ctx.quadraticCurveTo(x, y + L * 0.28, x + inward * L, y - tilt * L * 0.5);
    ctx.stroke();
  }
}

function drawMouth(ctx, F, e) {
  const M = F.mouth; if (!M || M.style === 'none') return;
  const { x, y, w } = M, line = M.line || '#3a1020', inside = M.inside || '#7a1f3a', tongue = M.tongue || '#ff7d9c';
  ctx.strokeStyle = line; ctx.lineWidth = M.lw || w * 0.24; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const base = () => {
    ctx.beginPath();
    if (M.style === 'cat') { ctx.moveTo(x - w, y + w * 0.25); ctx.quadraticCurveTo(x - w * 0.5, y - w * 0.55, x, y + w * 0.12); ctx.quadraticCurveTo(x + w * 0.5, y - w * 0.55, x + w, y + w * 0.25); }
    else if (M.style === 'bunny' || M.style === 'bear') { ctx.moveTo(x, y + w * 0.55); ctx.lineTo(x, y + w * 0.05); ctx.moveTo(x - w * 0.8, y + w * 0.2); ctx.quadraticCurveTo(x - w * 0.4, y - w * 0.42, x, y + w * 0.05); ctx.quadraticCurveTo(x + w * 0.4, y - w * 0.42, x + w * 0.8, y + w * 0.2); }
    else { ctx.moveTo(x - w, y + w * 0.28); ctx.quadraticCurveTo(x, y - w * 0.62, x + w, y + w * 0.28); }
    ctx.stroke();
  };
  const fang = (fx) => { if (!M.fang) return; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(fx - w * 0.16, y + w * 0.02); ctx.lineTo(fx + w * 0.16, y + w * 0.02); ctx.lineTo(fx, y - w * 0.34); ctx.closePath(); ctx.fill(); ctx.lineWidth = w * 0.08; ctx.stroke(); ctx.lineWidth = M.lw || w * 0.24; };
  const open = (depth, wide = 1) => {
    const W = w * wide;
    ctx.beginPath(); ctx.moveTo(x - W, y + w * 0.25); ctx.quadraticCurveTo(x, y + w * 0.02, x + W, y + w * 0.25);
    ctx.bezierCurveTo(x + W * 0.95, y - w * depth, x - W * 0.95, y - w * depth, x - W, y + w * 0.25); ctx.closePath();
    ctx.fillStyle = inside; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = tongue; ell(ctx, x, y - w * depth * 0.72, W * 0.6, w * depth * 0.36); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(x - W, y + w * 0.25); ctx.quadraticCurveTo(x, y + w * 0.02, x + W, y + w * 0.25);
    ctx.bezierCurveTo(x + W * 0.95, y - w * depth, x - W * 0.95, y - w * depth, x - W, y + w * 0.25); ctx.closePath(); ctx.stroke();
  };
  if (e === EXPR.happy) { open(1.15, M.style === 'wide' ? 1 : 0.9); fang(x + w * 0.5); }
  else if (e === EXPR.hurt) {
    ctx.beginPath(); const n = 5;
    for (let i = 0; i <= n; i++) ctx[i ? 'lineTo' : 'moveTo'](x - w * 0.8 + (i * 1.6 * w) / n, y + (i % 2 ? -1 : 1) * w * 0.16);
    ctx.stroke();
  } else if (e === EXPR.surprised) { ell(ctx, x, y - w * 0.1, w * 0.3, w * 0.38); ctx.fillStyle = inside; ctx.fill(); ctx.stroke(); }
  else if (e === EXPR.sad) { ctx.beginPath(); ctx.moveTo(x - w * 0.7, y - w * 0.32); ctx.quadraticCurveTo(x, y + w * 0.35, x + w * 0.7, y - w * 0.32); ctx.stroke(); }
  else if (e === EXPR.focus) {
    ctx.beginPath(); ctx.moveTo(x - w * 0.9, y + w * 0.05); ctx.quadraticCurveTo(x + w * 0.1, y - w * 0.45, x + w, y + w * 0.38); ctx.stroke();
    fang(x + w * 0.45);
  } else if (e === EXPR.wink) {
    base();
    ctx.fillStyle = tongue; ell(ctx, x + w * 0.28, y - w * 0.38, w * 0.27, w * 0.3); ctx.fill();
    ctx.lineWidth = w * 0.14; ctx.stroke();
  } else { base(); if (M.style !== 'cat') fang(x + w * 0.45); }
}

function drawBlush(ctx, F, e) {
  const b = F.blush; if (!b) return;
  const k = e === EXPR.happy || e === EXPR.wink ? 1 : e === EXPR.hurt || e === EXPR.surprised ? 0.45 : 0.75;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * b.x, b.y); ctx.scale(1, b.ry / b.rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.rx);
    g.addColorStop(0, `rgba(${b.rgb || '255,110,150'},${0.75 * k})`); g.addColorStop(0.6, `rgba(${b.rgb || '255,110,150'},${0.4 * k})`); g.addColorStop(1, `rgba(${b.rgb || '255,110,150'},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, b.rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawCell(ctx, F, e, ox, oy, size, em) {
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, size, size); ctx.clip();
  ctx.fillStyle = em ? '#000000' : F.skin; ctx.fillRect(ox, oy, size, size);
  const S = size / (2 * F.box.h);
  ctx.setTransform(S, 0, 0, -S, ox + size / 2, oy + size / 2 + F.box.cy * S);
  if (F.custom) F.custom(ctx, e, em);
  else {
    if (!em) for (const r of F.regions || []) { ctx.fillStyle = r.color; ell(ctx, r.x, r.y, r.rx, r.ry, r.rot || 0); ctx.fill(); }
    if (!em) F.under?.(ctx, e);
    if (!em) drawBlush(ctx, F, e);
    for (const side of [-1, 1]) drawEye(ctx, F, side, e, em);
    if (!em) { drawBrows(ctx, F, e); drawMouth(ctx, F, e); }
    F.extra?.(ctx, e, em);
  }
  ctx.restore();
}

const atlasCache = new Map();
function faceAtlas(c, F) {
  if (atlasCache.has(c.id)) return atlasCache.get(c.id);
  const cv = document.createElement('canvas'); cv.width = CELL * COLS; cv.height = CELL * ROWS;
  const ev = document.createElement('canvas'); ev.width = (CELL / 2) * COLS; ev.height = (CELL / 2) * ROWS;
  const c1 = cv.getContext('2d'), c2 = ev.getContext('2d');
  for (let e = 0; e < COLS * ROWS; e++) {
    const col = e % COLS, row = Math.floor(e / COLS);
    drawCell(c1, F, e, col * CELL, row * CELL, CELL, false);
    drawCell(c2, F, e, (col * CELL) / 2, (row * CELL) / 2, CELL / 2, true);
  }
  const mk = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const out = { map: mk(cv), em: mk(ev), canvas: cv };
  atlasCache.set(c.id, out);
  return out;
}

// the face UVs: straight-on projection through the face box into atlas cell 0
function projectUV(g, box) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const u = clamp(0.5 + p.getX(i) / (2 * box.h), 0.004, 0.996);
    const v = clamp(0.5 + (p.getY(i) - box.cy) / (2 * box.h), 0.004, 0.996);
    uv[i * 2] = u / COLS; uv[i * 2 + 1] = 1 - (1 - v) / ROWS;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// half an ellipsoid: the front (+z) half carries the face, the back half is plain
function halfEll(c, r, front) {
  const g = new THREE.SphereGeometry(1, 30, 22, front ? 0 : Math.PI, Math.PI);
  g.scale(r[0], r[1], r[2]); g.translate(c[0], c[1], c[2]);
  return g;
}

// ---------------------------------------------------------------------------------------------
// builders. The driver: body in driver space; the head group sits on the neck at NECK and builds in its own
// space (origin at the neck, y up, +z forward). Springy parts are separate little groups.
const NECK = [0, 1.34, -0.3];

function newBuild() { return { body: [], head: [], face: [], hglow: [], glow: [], wob: [], box: { cy: 0.46, h: 0.64 } }; }
// a head-sized ellipsoid whose front carries the face
function faceBall(B, color, c, r) { B.head.push(paint(halfEll(c, r, false), color)); B.face.push(halfEll(c, r, true)); }
// a muzzle / cheek puff: only its front shows, painted by the face texture
function faceCap(B, c, r) { B.face.push(halfEll(c, r, true)); }
// a spring: parts built around the pivot (local space), swinging about `axis`
function wob(B, o) { B.wob.push({ parent: 'head', rot: [0, 0, 0], axis: 'x', idle: 0.05, freq: 2, phase: 0, acc: 0.25, lat: 0.15, k: 60, c: 7, glow: [], ...o }); }

function torso(B, col, { belly, w = 1, collar } = {}) {
  B.body.push(E(col, [0, 1.02, -0.32], [0.36 * w, 0.4, 0.31], [0.1, 0, 0]));
  if (belly) B.body.push(E(belly, [0, 0.98, -0.13], [0.25 * w, 0.29, 0.14], [0.1, 0, 0]));
  if (collar) B.body.push(part(G.torus, collar, [0, 1.33, -0.3], [Math.PI / 2, 0, 0], [0.19, 0.19, 0.55]));
}
function arms(B, sleeve, glove = '#ffffff', cuff = null, { mitt = false } = {}) {
  for (const sx of [-1, 1]) {
    B.body.push(limb([sx * 0.31, 1.2, -0.27], [sx * 0.23, 1.12, 0.24], 0.085, sleeve));
    if (cuff) B.body.push(limb([sx * 0.232, 1.122, 0.2], [sx * 0.226, 1.12, 0.27], 0.1, cuff));
    B.body.push(E(glove, [sx * 0.215, 1.13, 0.36], [0.11, 0.1, 0.12]));
    if (!mitt) B.body.push(part(G.lo, glove, [sx * 0.16, 1.18, 0.39], [0, 0, 0], 0.045));
  }
}

const SPECIES = {
  luna(c) {
    const B = newBuild(), fur = '#fff4f8', pink = '#ffb3cf', jacket = c.kart;
    torso(B, jacket, { belly: '#ffffff', collar: '#ffffff' });
    for (const sx of [-1, 1]) B.body.push(E('#ffffff', [sx * 0.2, 1.12, -0.06], [0.05, 0.22, 0.04], [0.1, 0, sx * 0.25]));
    arms(B, jacket, '#ffffff', '#ffffff');
    faceBall(B, fur, [0, 0.46, 0.02], [0.52, 0.48, 0.46]);
    for (const sx of [-1, 1]) faceCap(B, [sx * 0.085, 0.33, 0.36], [0.12, 0.09, 0.1]);
    // hair tuft
    B.head.push(E(fur, [0.06, 0.92, 0.12], [0.12, 0.08, 0.1], [0.4, 0, -0.5]), E(fur, [-0.07, 0.9, 0.16], [0.1, 0.07, 0.09], [0.4, 0, 0.6]));
    // long ears, one up, one flopped over
    for (const sx of [-1, 1]) {
      const flop = sx > 0;
      wob(B, {
        at: [sx * 0.17, 0.84, -0.08], rot: flop ? [-0.25, 0, -1.15] : [-0.22, 0, -sx * 0.12], axis: 'x', idle: 0.06, freq: 1.7, phase: sx, acc: 0.45, lat: 0.25,
        parts: [E(fur, [0, 0.34, 0], [0.13, 0.38, 0.075]), E(pink, [0, 0.33, 0.045], [0.075, 0.29, 0.04])],
      });
    }
    B.hglow.push(starMesh(glowCol('#ffe066', 2.4), [-0.3, 0.8, 0.18], 0.1, [0, 0, 0.3]));
    B.glow.push(starMesh(glowCol('#ffe066', 1.8), [0.13, 1.12, -0.04], 0.06, [0.1, 0, 0]));
    B.face = {
      skin: fur, box: { cy: 0.46, h: 0.64 },
      regions: [{ x: -0.085, y: 0.33, rx: 0.12, ry: 0.09, color: '#ffffff' }, { x: 0.085, y: 0.33, rx: 0.12, ry: 0.09, color: '#ffffff' }],
      eye: { x: 0.18, y: 0.5, rx: 0.088, ry: 0.112, iris: '#a35be8', iris2: '#f0c6ff', irisDark: '#3b145e', line: '#2a1240', lash: 2, star: true },
      mouth: { x: 0, y: 0.29, w: 0.055, style: 'bunny' }, blush: { x: 0.29, y: 0.36, rx: 0.085, ry: 0.05 },
      extra(ctx, e, em) { if (em) return; ctx.fillStyle = '#ff7aa8'; ell(ctx, 0, 0.375, 0.035, 0.024); ctx.fill(); },
      faces: B.face,
    };
    return B;
  },
  bolt(c) {
    const B = newBuild(), metal = '#7aa2ff', trim = '#c9d6ff', dark = '#2a3050';
    B.body.push(part(G.rbox, c.body, [0, 1.02, -0.32], [0.1, 0, 0], [0.66, 0.72, 0.56]));
    B.body.push(part(G.rbox, trim, [0, 1.04, -0.05], [0.1, 0, 0], [0.4, 0.34, 0.08]));
    B.glow.push(part(G.box, glowCol(c.accent, 2.2), [0, 1.06, -0.005], [0.1, 0, 0], [0.24, 0.05, 0.02]));
    B.glow.push(part(G.box, glowCol('#ff4fd8', 2.2), [0, 0.97, 0.005], [0.1, 0, 0], [0.12, 0.04, 0.02]));
    B.body.push(part(G.cyl, dark, [0, 1.33, -0.3], [0, 0, 0], [0.13, 0.12, 0.13]));
    for (const sx of [-1, 1]) {
      B.body.push(E(trim, [sx * 0.33, 1.24, -0.28], [0.1, 0.1, 0.1]));
      B.body.push(limb([sx * 0.33, 1.2, -0.27], [sx * 0.24, 1.14, 0.0], 0.06, dark), limb([sx * 0.24, 1.14, 0.0], [sx * 0.22, 1.12, 0.3], 0.07, trim));
      B.body.push(E(dark, [sx * 0.24, 1.14, 0.0], [0.08, 0.08, 0.08]));
      B.body.push(E('#9aa8c8', [sx * 0.215, 1.13, 0.36], [0.11, 0.1, 0.12]), part(G.lo, '#9aa8c8', [sx * 0.16, 1.18, 0.39], [0, 0, 0], 0.045));
    }
    // a rounded box head with a screen for a face
    B.head.push(part(G.rbox, metal, [0, 0.45, 0], [0, 0, 0], [0.86, 0.7, 0.72]));
    B.head.push(part(G.rbox, dark, [0, 0.45, 0.33], [0, 0, 0], [0.72, 0.54, 0.08]));
    const scr = new THREE.PlaneGeometry(0.66, 0.48); scr.translate(0, 0.45, 0.372); B.face.push(scr);
    for (const sx of [-1, 1]) {
      B.head.push(part(G.cyl, trim, [sx * 0.46, 0.45, 0], [0, 0, Math.PI / 2], [0.15, 0.09, 0.15]));
      B.hglow.push(part(G.torus, glowCol(c.accent, 2.4), [sx * 0.51, 0.45, 0], [0, Math.PI / 2, 0], [0.1, 0.1, 0.3]));
      for (let i = 0; i < 3; i++) B.head.push(part(G.box, dark, [sx * 0.16, 0.55 - i * 0.08, -0.365], [0, 0, 0], [0.18, 0.035, 0.02])); // vents on the back
    }
    wob(B, {
      at: [0, 0.8, -0.05], axis: 'x', idle: 0.1, freq: 2.6, acc: 0.5, lat: 0.3, k: 45, c: 4,
      parts: [part(G.cyl, '#9aa8c8', [0, 0.17, 0], [0, 0, 0], [0.022, 0.34, 0.022]), part(G.cyl, trim, [0, 0.0, 0], [0, 0, 0], [0.07, 0.05, 0.07])],
      glow: [part(G.sphere, glowCol('#ff4fd8', 3), [0, 0.37, 0], [0, 0, 0], 0.075)],
    });
    B.face = { skin: dark, box: { cy: 0.45, h: 0.34 }, custom: boltFace, faces: B.face };
    return B;
  },
  momo(c) {
    const B = newBuild(), fur = c.body, stripe = '#e8761a', cream = '#fff3e0', hood = c.kart2;
    torso(B, hood);
    B.body.push(E(hood, [0, 1.36, -0.5], [0.3, 0.17, 0.16], [0.4, 0, 0]));          // the hood, down
    B.body.push(part(G.torus, '#e85a5a', [0, 1.33, -0.3], [Math.PI / 2, 0, 0], [0.18, 0.18, 0.5]));
    B.body.push(part(G.sphere, '#ffd23f', [0, 1.27, -0.12], [0, 0, 0], 0.065));     // bell
    for (const sx of [-1, 1]) B.body.push(limb([sx * 0.08, 1.25, -0.1], [sx * 0.1, 1.06, -0.02], 0.014, stripe)); // drawstrings
    B.body.push(E(stripe, [0, 0.9, -0.03], [0.17, 0.08, 0.05], [0.1, 0, 0])); // pocket
    arms(B, hood, '#ffffff', stripe);
    faceBall(B, fur, [0, 0.46, 0.02], [0.53, 0.46, 0.45]);
    for (const sx of [-1, 1]) faceCap(B, [sx * 0.09, 0.32, 0.36], [0.13, 0.09, 0.1]);
    faceCap(B, [0, 0.26, 0.35], [0.08, 0.06, 0.08]);
    for (const [x, y, z, s] of [[0, 0.88, -0.05, 1], [0.12, 0.83, -0.16, 0.8], [-0.12, 0.83, -0.16, 0.8], [0, 0.72, -0.36, 1]]) B.head.push(E(stripe, [x, y, z], [0.05 * s, 0.035, 0.14 * s], [0.5, 0, 0]));
    for (const sx of [-1, 1]) {
      wob(B, {
        at: [sx * 0.28, 0.8, -0.04], rot: [-0.1, 0, -sx * 0.32], axis: 'z', idle: 0.04, freq: 0.7, phase: sx * 2, acc: 0.12, lat: 0.1, k: 90, c: 10,
        parts: [part(G.cone, fur, [0, 0.13, 0], [0, 0, 0], [0.17, 0.3, 0.12]), part(G.cone, '#ffb3c8', [0, 0.11, 0.05], [0, 0, 0], [0.1, 0.2, 0.05])],
      });
    }
    wob(B, {
      parent: 'body', at: [0.05, 0.92, -0.6], rot: [-0.5, 0, 0.2], axis: 'z', idle: 0.35, freq: 1.6, acc: 0.2, lat: 0.4, k: 30, c: 4,
      parts: [limb([0, 0, 0], [0.04, 0.42, -0.12], 0.065, fur), limb([0.04, 0.42, -0.12], [0.18, 0.66, -0.04], 0.065, stripe), part(G.sphere, stripe, [0.18, 0.66, -0.04], [0, 0, 0], 0.065)],
    });
    B.face = {
      skin: fur, box: { cy: 0.46, h: 0.64 },
      regions: [{ x: -0.09, y: 0.32, rx: 0.13, ry: 0.09, color: cream }, { x: 0.09, y: 0.32, rx: 0.13, ry: 0.09, color: cream }, { x: 0, y: 0.26, rx: 0.08, ry: 0.06, color: cream }],
      under(ctx) { ctx.fillStyle = stripe; for (const [x, r] of [[0, 0.03], [-0.07, 0.022], [0.07, 0.022]]) { ell(ctx, x, 0.8, r, 0.07); ctx.fill(); } },
      eye: { x: 0.19, y: 0.5, rx: 0.092, ry: 0.11, iris: '#43c14a', iris2: '#d8ff9a', irisDark: '#0f4a1e', line: '#2a1608', lash: 1 },
      mouth: { x: 0, y: 0.3, w: 0.06, style: 'cat' }, blush: { x: 0.31, y: 0.37, rx: 0.08, ry: 0.045 },
      extra(ctx, e, em) {
        if (em) return;
        ctx.fillStyle = '#ff6f9f'; ctx.beginPath(); ctx.moveTo(-0.035, 0.385); ctx.lineTo(0.035, 0.385); ctx.lineTo(0, 0.345); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(90,50,20,0.75)'; ctx.lineWidth = 0.009; ctx.lineCap = 'round';
        for (const side of [-1, 1]) for (const [dy, a] of [[0.03, 0.15], [0, 0], [-0.03, -0.15]]) { ctx.beginPath(); ctx.moveTo(side * 0.2, 0.33 + dy); ctx.lineTo(side * 0.36, 0.33 + dy + a * 0.16); ctx.stroke(); }
      },
      faces: B.face,
    };
    return B;
  },
  garu(c) {
    const B = newBuild(), skin = c.body, belly = c.belly, horn = '#fff4c8', gold = c.accent;
    torso(B, skin, { belly });
    for (let i = 0; i < 3; i++) B.body.push(E(belly, [0, 1.12 - i * 0.12, -0.1 + i * 0.005], [0.15 - i * 0.02, 0.012, 0.03], [0.1, 0, 0]));
    B.body.push(part(G.torus, gold, [0, 1.33, -0.3], [Math.PI / 2, 0, 0], [0.18, 0.18, 0.6])); // gold collar
    arms(B, skin, '#ffffff', gold);
    faceBall(B, skin, [0, 0.47, 0], [0.49, 0.45, 0.44]);
    faceCap(B, [0, 0.3, 0.3], [0.29, 0.19, 0.23]);
    for (const sx of [-1, 1]) {
      B.head.push(E('#1f6b32', [sx * 0.08, 0.38, 0.52], [0.03, 0.02, 0.02]));
      B.head.push(part(G.cone, horn, [sx * 0.2, 0.86, -0.14], [-0.45, 0, -sx * 0.32], [0.075, 0.28, 0.075]));
      B.head.push(E(skin, [sx * 0.42, 0.52, -0.1], [0.12, 0.08, 0.05], [0, sx * 0.4, -sx * 0.5])); // ear fins
    }
    for (let i = 0; i < 3; i++) B.head.push(part(G.cone, gold, [0, 0.86 - i * 0.17, -0.3 - i * 0.09], [-0.85 - i * 0.25, 0, 0], [0.07, 0.18, 0.07]));
    for (let i = 0; i < 3; i++) B.body.push(part(G.cone, gold, [0, 1.25 - i * 0.18, -0.6 - i * 0.02], [-1.6, 0, 0], [0.06, 0.15, 0.06]));
    for (const sx of [-1, 1]) {
      wob(B, {
        parent: 'body', at: [sx * 0.24, 1.2, -0.56], rot: [0.2, sx * 0.5, sx * 0.3], axis: 'z', idle: sx * 0.32, freq: 6, acc: 0.1, lat: 0.1, k: 120, c: 10,
        parts: [limb([0, 0, 0], [sx * 0.3, 0.16, 0], 0.03, gold), E(gold, [sx * 0.24, 0.02, 0], [0.24, 0.17, 0.035]), E('#ffe98a', [sx * 0.26, -0.01, 0.01], [0.17, 0.1, 0.03])],
      });
    }
    B.face = {
      skin, box: { cy: 0.46, h: 0.64 },
      regions: [{ x: 0, y: 0.3, rx: 0.29, ry: 0.19, color: skin }],
      under(ctx) { ctx.save(); ctx.beginPath(); ctx.rect(-0.4, 0.0, 0.8, 0.27); ctx.clip(); ctx.fillStyle = belly; ell(ctx, 0, 0.3, 0.27, 0.18); ctx.fill(); ctx.restore(); },
      eye: { x: 0.18, y: 0.55, rx: 0.09, ry: 0.105, iris: '#ff9d1f', iris2: '#fff0a0', irisDark: '#6a2a00', line: '#1e2a10' },
      brow: { dy: 0.035, len: 0.06, w: 0.022, color: '#2f8a45' },
      mouth: { x: 0, y: 0.25, w: 0.1, style: 'wide', fang: true, line: '#1e3a14' }, blush: { x: 0.3, y: 0.38, rx: 0.08, ry: 0.045, rgb: '255,150,110' },
      faces: B.face,
    };
    return B;
  },
  penta(c) {
    const B = newBuild(), navy = c.body, red = '#ff4d4d';
    torso(B, navy, { belly: '#ffffff' });
    // scarf, its tail flaps behind
    B.body.push(part(G.torus, red, [0, 1.34, -0.3], [Math.PI / 2 + 0.1, 0, 0], [0.22, 0.22, 0.9]));
    wob(B, {
      parent: 'body', at: [0.16, 1.32, -0.5], rot: [0.4, 0, 0.25], axis: 'x', idle: 0.18, freq: 5, acc: -0.5, lat: 0.2, k: 50, c: 5, speed: 0.9,
      parts: [part(G.rbox, red, [0, -0.2, 0], [0, 0, 0], [0.13, 0.42, 0.04]), part(G.box, '#ffffff', [0, -0.36, 0], [0, 0, 0], [0.135, 0.04, 0.045]), part(G.box, '#ffffff', [0, -0.3, 0], [0, 0, 0], [0.135, 0.03, 0.045])],
    });
    for (const sx of [-1, 1]) {
      B.body.push(limb([sx * 0.31, 1.18, -0.27], [sx * 0.23, 1.12, 0.26], 0.075, navy));
      B.body.push(E(navy, [sx * 0.215, 1.13, 0.35], [0.1, 0.07, 0.13], [0, 0, sx * 0.3]));
    }
    faceBall(B, navy, [0, 0.46, 0.02], [0.5, 0.47, 0.45]);
    // beak
    B.head.push(part(G.cone, '#ffb020', [0, 0.37, 0.53], [Math.PI / 2, 0, 0], [0.1, 0.2, 0.055]), E('#ff8a1f', [0, 0.33, 0.47], [0.07, 0.03, 0.06]));
    // beanie with a band, goggles and a pompom
    B.head.push(E(red, [0, 0.7, -0.03], [0.5, 0.33, 0.48]));
    B.head.push(part(G.torus, '#ffffff', [0, 0.7, -0.02], [Math.PI / 2 + 0.25, 0, 0], [0.47, 0.47, 0.9]));
    // knitted snowflake on the front of the beanie
    for (let i = 0; i < 3; i++) B.head.push(part(G.box, '#ffffff', [0, 0.86, 0.4], [-0.75, 0, (i * Math.PI) / 3], [0.2, 0.03, 0.02]));
    wob(B, { at: [0, 1.02, -0.06], axis: 'x', idle: 0.08, freq: 2.2, acc: 0.6, lat: 0.4, k: 40, c: 4, parts: [part(G.sphere, '#ffffff', [0, 0.06, 0], [0, 0, 0], 0.12)] });
    B.face = {
      skin: navy, box: { cy: 0.46, h: 0.64 },
      regions: [{ x: -0.14, y: 0.47, rx: 0.2, ry: 0.22, color: '#ffffff' }, { x: 0.14, y: 0.47, rx: 0.2, ry: 0.22, color: '#ffffff' }, { x: 0, y: 0.33, rx: 0.28, ry: 0.17, color: '#ffffff' }],
      eye: { x: 0.15, y: 0.5, rx: 0.075, ry: 0.095, iris: '#4a6cff', iris2: '#bfe0ff', irisDark: '#101a50', line: '#141a30', bg: '#ffffff', lash: 1 },
      mouth: { style: 'none' }, blush: { x: 0.25, y: 0.38, rx: 0.07, ry: 0.04 },
      faces: B.face,
    };
    return B;
  },
  kero(c) {
    const B = newBuild(), skin = c.body, belly = c.belly, pad = '#3fae2a';
    torso(B, c.kart, { belly: '#ffffff' });
    for (const sx of [-1, 1]) B.body.push(E(c.kart2, [sx * 0.17, 1.17, -0.08], [0.06, 0.05, 0.03])); // overall buttons
    B.body.push(E(skin, [0, 1.3, -0.3], [0.24, 0.08, 0.22]));
    arms(B, skin, skin, null, { mitt: true });
    for (const sx of [-1, 1]) for (const d of [-0.05, 0.05]) B.body.push(part(G.sphere, '#c8ff8a', [sx * 0.2 + d, 1.17, 0.44], [0, 0, 0], 0.035));
    faceBall(B, skin, [0, 0.38, 0.02], [0.58, 0.38, 0.46]);
    faceCap(B, [0, 0.24, 0.24], [0.4, 0.14, 0.24]);
    for (const sx of [-1, 1]) faceBall(B, skin, [sx * 0.24, 0.74, 0.14], [0.18, 0.18, 0.17]);
    // lily-pad hat with a flower that bobs
    B.head.push(part(G.cyl, pad, [0, 0.86, -0.12], [-0.25, 0, 0.12], [0.36, 0.03, 0.36]));
    wob(B, {
      at: [-0.08, 0.9, -0.16], axis: 'z', idle: 0.1, freq: 2.4, acc: 0.3, lat: 0.4, k: 45, c: 4,
      parts: [part(G.cyl, '#2f8a1f', [0, 0.06, 0], [0, 0, 0], [0.02, 0.12, 0.02]),
        ...[0, 1, 2, 3, 4].map((i) => E('#ff9ec7', [Math.cos(i * 1.257) * 0.07, 0.14, Math.sin(i * 1.257) * 0.07], [0.06, 0.03, 0.04], [0, -i * 1.257, 0.35])),
        part(G.sphere, '#ffe14d', [0, 0.16, 0], [0, 0, 0], 0.035)],
    });
    B.face = {
      skin, box: { cy: 0.5, h: 0.66 },
      regions: [],
      under(ctx) { ctx.save(); ctx.beginPath(); ctx.rect(-0.7, -0.3, 1.4, 0.48); ctx.clip(); ctx.fillStyle = belly; ell(ctx, 0, 0.22, 0.4, 0.14); ctx.fill(); ctx.restore(); },
      eye: { x: 0.24, y: 0.75, rx: 0.1, ry: 0.115, iris: '#2a2a40', iris2: '#8a8ab0', irisDark: '#0a0a18', line: '#16301a' },
      mouth: { x: 0, y: 0.32, w: 0.2, style: 'wide', lw: 0.022, line: '#2a4a14' }, blush: { x: 0.36, y: 0.38, rx: 0.09, ry: 0.05, rgb: '255,130,180' },
      extra(ctx, e, em) { if (em) return; ctx.fillStyle = '#2a5a14'; for (const s of [-1, 1]) { ell(ctx, s * 0.05, 0.46, 0.014, 0.01); ctx.fill(); } },
      faces: B.face,
    };
    return B;
  },
  piyo(c) {
    const B = newBuild(), skin = c.body, shell = '#fffaf0';
    torso(B, skin, { belly: c.belly, w: 1.05 });
    B.body.push(part(G.rbox, c.kart2, [0, 1.02, -0.6], [0.1, 0, 0], [0.42, 0.42, 0.18])); // a little backpack
    B.body.push(E('#ffffff', [0, 1.06, -0.7], [0.1, 0.1, 0.02], [0.1, 0, 0]));
    for (const sx of [-1, 1]) {
      B.body.push(limb([sx * 0.33, 1.18, -0.26], [sx * 0.23, 1.12, 0.26], 0.075, skin));
      B.body.push(E(skin, [sx * 0.215, 1.13, 0.35], [0.1, 0.07, 0.13], [0, 0, sx * 0.3]));
    }
    faceBall(B, skin, [0, 0.44, 0.02], [0.52, 0.5, 0.48]);
    B.head.push(part(G.cone, '#ff9a1f', [0, 0.36, 0.52], [Math.PI / 2, 0, 0], [0.085, 0.16, 0.06]), E('#ff7a10', [0, 0.32, 0.48], [0.06, 0.025, 0.05]));
    // egg-shell helmet with a zigzag edge
    const sg = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5); sg.scale(0.55, 0.42, 0.52); sg.translate(0, 0.6, -0.02);
    B.head.push(paint(sg, shell));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      B.head.push(part(G.cone, shell, [Math.sin(a) * 0.52, 0.56, -0.02 + Math.cos(a) * 0.49], [Math.PI, a, 0], [0.07, 0.1, 0.04]));
    }
    B.head.push(E('#ffd0a0', [0.18, 0.88, 0.2], [0.07, 0.025, 0.05], [0.5, 0, -0.4]));
    wob(B, {
      at: [0, 1.0, -0.04], axis: 'z', idle: 0.12, freq: 2.2, acc: 0.6, lat: 0.5, k: 40, c: 4,
      parts: [-1, 0, 1].map((i) => E(skin, [i * 0.05, 0.11, 0], [0.04, 0.14, 0.04], [0, 0, -i * 0.5])),
    });
    B.face = {
      skin, box: { cy: 0.44, h: 0.64 },
      eye: { x: 0.17, y: 0.47, rx: 0.08, ry: 0.1, iris: '#5a3418', iris2: '#d8a070', irisDark: '#1a0c04', line: '#2a1606' },
      mouth: { style: 'none' }, blush: { x: 0.29, y: 0.37, rx: 0.085, ry: 0.05, rgb: '255,120,120' },
      faces: B.face,
    };
    return B;
  },
  kuma(c) {
    const B = newBuild(), fur = c.body, cream = c.belly, red = c.kart;
    torso(B, red, { collar: '#ffffff', w: 1.08 });
    for (const sx of [-1, 1]) B.body.push(E('#ffffff', [sx * 0.24, 1.0, -0.12], [0.045, 0.25, 0.04], [0.1, 0, sx * 0.1]));
    B.body.push(E(c.accent, [-0.14, 1.12, -0.04], [0.06, 0.06, 0.02], [0.1, 0, 0]));
    arms(B, red, '#ffffff', '#ffffff');
    faceBall(B, fur, [0, 0.46, 0.02], [0.53, 0.48, 0.46]);
    faceCap(B, [0, 0.32, 0.33], [0.22, 0.16, 0.15]);
    B.head.push(E('#2a1a12', [0, 0.39, 0.48], [0.075, 0.05, 0.045]), part(G.lo, '#ffffff', [0.025, 0.41, 0.52], [0, 0, 0], 0.014));
    for (const sx of [-1, 1]) B.head.push(E(fur, [sx * 0.4, 0.82, -0.08], [0.15, 0.15, 0.09]), E(cream, [sx * 0.4, 0.82, -0.02], [0.09, 0.09, 0.05]));
    // cap, worn forward
    const cg = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5); cg.scale(0.5, 0.36, 0.48); cg.translate(0, 0.68, -0.04);
    B.head.push(paint(cg, red));
    B.head.push(part(G.cyl, red, [0, 0.69, 0.38], [0.18, 0, 0], [0.34, 0.025, 0.26]));
    B.head.push(E('#ffffff', [0, 0.86, 0.3], [0.13, 0.11, 0.05], [-0.7, 0, 0]));
    B.head.push(part(G.sphere, '#ffffff', [0, 1.04, -0.04], [0, 0, 0], 0.04));
    B.head.push(part(G.box, '#ffffff', [0, 0.73, -0.5], [0.3, 0, 0], [0.2, 0.05, 0.03]));
    B.face = {
      skin: fur, box: { cy: 0.46, h: 0.64 },
      regions: [{ x: 0, y: 0.32, rx: 0.22, ry: 0.16, color: cream }],
      eye: { x: 0.18, y: 0.52, rx: 0.068, ry: 0.082, iris: '#6a3a1a', iris2: '#d8a070', irisDark: '#1a0c04', line: '#1e120a' },
      brow: { dy: 0.035, len: 0.06, w: 0.026, color: '#4a2a14' },
      mouth: { x: 0, y: 0.28, w: 0.06, style: 'bear', line: '#2a1a12' }, blush: { x: 0.31, y: 0.4, rx: 0.075, ry: 0.045 },
      extra(ctx, e, em) {
        if (em) return;
        ctx.save(); ctx.translate(-0.3, 0.42); ctx.rotate(0.5);
        ctx.fillStyle = '#ffe3c0'; ctx.strokeStyle = '#d8a878'; ctx.lineWidth = 0.008;
        ctx.beginPath(); ctx.roundRect(-0.075, -0.026, 0.15, 0.052, 0.024); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f5cfa0'; ctx.fillRect(-0.025, -0.026, 0.05, 0.052);
        ctx.restore();
      },
      faces: B.face,
    };
    return B;
  },
};

// the robot's screen face: LED eyes and mouth (they glow), the screen and its bezel
function boltFace(ctx, e, em) {
  const led = '#62f2ff', pinkLed = '#ff7ad0';
  if (!em) {
    ctx.fillStyle = '#2a3050'; ctx.fillRect(-0.4, 0.05, 0.8, 0.8);
    const g = ctx.createLinearGradient(0, 0.66, 0, 0.24); g.addColorStop(0, '#1a2460'); g.addColorStop(1, '#070b24');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-0.3, 0.24, 0.6, 0.42, 0.08); ctx.fill();
    ctx.fillStyle = 'rgba(120,160,255,0.08)'; for (let y = 0.26; y < 0.66; y += 0.02) ctx.fillRect(-0.29, y, 0.58, 0.007);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(-0.3, 0.6); ctx.lineTo(-0.16, 0.66); ctx.lineTo(-0.3, 0.42); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = led; ctx.strokeStyle = led; ctx.lineWidth = 0.028; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const eye = (side) => {
    const x = side * 0.12, y = 0.5, inward = -side;
    const winkClosed = e === EXPR.wink && side > 0;
    if (e === EXPR.blink) { ctx.fillRect(x - 0.05, y - 0.012, 0.1, 0.024); }
    else if (e === EXPR.happy || winkClosed) { ctx.beginPath(); ctx.moveTo(x - 0.055, y - 0.02); ctx.lineTo(x, y + 0.04); ctx.lineTo(x + 0.055, y - 0.02); ctx.stroke(); }
    else if (e === EXPR.hurt) { ctx.beginPath(); ctx.moveTo(x - 0.045, y + 0.045); ctx.lineTo(x + 0.045, y - 0.045); ctx.moveTo(x + 0.045, y + 0.045); ctx.lineTo(x - 0.045, y - 0.045); ctx.stroke(); }
    else if (e === EXPR.surprised) { ctx.beginPath(); ctx.arc(x, y, 0.055, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 0.016, 0, Math.PI * 2); ctx.fill(); }
    else if (e === EXPR.focus) { ctx.beginPath(); ctx.moveTo(x - 0.045, y - 0.05); ctx.lineTo(x + 0.045, y - 0.05); ctx.lineTo(x + 0.045, y + 0.04 - inward * 0.025); ctx.lineTo(x - 0.045, y + 0.04 + inward * 0.025); ctx.closePath(); ctx.fill(); }
    else if (e === EXPR.sad) {
      ctx.beginPath(); ctx.moveTo(x - 0.045, y - 0.05); ctx.lineTo(x + 0.045, y - 0.05); ctx.lineTo(x + 0.045, y + 0.03 + inward * 0.025); ctx.lineTo(x - 0.045, y + 0.03 - inward * 0.025); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - inward * 0.05 - 0.008, y - 0.12, 0.016, 0.05);
    } else { ctx.beginPath(); ctx.roundRect(x - 0.042, y - 0.06, 0.084, 0.12, 0.035); ctx.fill(); }
  };
  eye(-1); eye(1);
  const my = 0.34;
  ctx.beginPath();
  if (e === EXPR.happy || e === EXPR.wink) { ctx.moveTo(-0.08, my + 0.02); ctx.lineTo(0.08, my + 0.02); ctx.quadraticCurveTo(0.07, my - 0.07, 0, my - 0.07); ctx.quadraticCurveTo(-0.07, my - 0.07, -0.08, my + 0.02); ctx.fill(); }
  else if (e === EXPR.hurt) { for (let i = 0; i <= 4; i++) ctx[i ? 'lineTo' : 'moveTo'](-0.07 + i * 0.035, my + (i % 2 ? -0.015 : 0.015)); ctx.stroke(); }
  else if (e === EXPR.surprised) { ctx.arc(0, my - 0.01, 0.03, 0, Math.PI * 2); ctx.stroke(); }
  else if (e === EXPR.sad) { ctx.moveTo(-0.055, my - 0.025); ctx.quadraticCurveTo(0, my + 0.03, 0.055, my - 0.025); ctx.stroke(); }
  else if (e === EXPR.focus) { ctx.moveTo(-0.06, my); ctx.lineTo(0.06, my + 0.012); ctx.stroke(); }
  else { ctx.moveTo(-0.06, my + 0.02); ctx.quadraticCurveTo(0, my - 0.04, 0.06, my + 0.02); ctx.stroke(); }
  if (e !== EXPR.hurt && e !== EXPR.sad) { ctx.fillStyle = pinkLed; for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * 0.22 - 0.035, 0.38, 0.07, 0.02, 0.01); ctx.fill(); } }
}

function starMesh(color, pos, r, rot = [0, 0, 0]) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.45 : 1; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 2 });
  g.deleteAttribute('uv'); g.center();
  g.scale(r, r, r);
  _m.compose(_a.set(...pos), _q.setFromEuler(new THREE.Euler(...rot)), _s.set(1, 1, 1));
  g.applyMatrix4(_m);
  return paint(g.index ? g.toNonIndexed() : g, color);
}

// ---------------------------------------------------------------------------------------------
// kart
const WHEEL_R = 0.4;
function wheelGeometry(c, rear) {
  const r = rear ? WHEEL_R * 1.08 : WHEEL_R, w = rear ? 0.42 : 0.34;
  const parts = [
    part(G.cyl, '#26262e', [0, 0, 0], [0, 0, Math.PI / 2], [r * 0.98, w, r * 0.98]),
    part(G.torus, '#33333d', [0, 0, 0], [0, Math.PI / 2, 0], [r * 0.86, r * 0.86, w * 2.5]),
    part(G.cyl, '#3a3d4c', [0, 0, 0], [0, 0, Math.PI / 2], [r * 0.6, w + 0.02, r * 0.6]),
    part(G.torus, c.kart2, [0, 0, 0], [0, Math.PI / 2, 0], [r * 0.58, r * 0.58, w * 3.2]),
    part(G.cyl, '#e8ebf5', [0, 0, 0], [0, 0, Math.PI / 2], [r * 0.18, w + 0.07, r * 0.18]),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(G.box, c.kart2, [0, Math.cos(a) * r * 0.33, Math.sin(a) * r * 0.33], [a, 0, 0], [w + 0.05, r * 0.5, r * 0.12]));
  }
  return merge(parts);
}

function chassisParts(c, noWheel = false) {
  const k = c.kart, k2 = c.kart2, dark = '#2a2d3a', metal = '#c4cad8', chrome = '#e8ecf5';
  return [
    part(G.rbox, dark, [0, 0.42, 0.05], [0, 0, 0], [1.3, 0.16, 2.35]),
    E(k, [0, 0.62, 0.0], [0.84, 0.37, 1.3]),
    E(k, [0, 0.58, 0.95], [0.62, 0.3, 0.64], [0.12, 0, 0]),
    E(k2, [0, 0.79, 0.62], [0.3, 0.1, 0.42], [0.2, 0, 0]),                 // a stripe over the nose
    limb([0.72, 0.42, 1.4], [-0.72, 0.42, 1.4], 0.17, k2),                   // front bumper
    E(k2, [0.8, 0.52, 0.05], [0.3, 0.24, 0.86]), E(k2, [-0.8, 0.52, 0.05], [0.3, 0.24, 0.86]),
    E(c.accent, [0.82, 0.7, 0.05], [0.24, 0.07, 0.66]), E(c.accent, [-0.82, 0.7, 0.05], [0.24, 0.07, 0.66]),
    // seat with a headrest
    part(G.rbox, dark, [0, 0.95, -0.62], [-0.22, 0, 0], [0.9, 0.75, 0.18]),
    part(G.rbox, dark, [0, 0.72, -0.35], [0, 0, 0], [0.8, 0.14, 0.6]),
    part(G.rbox, k2, [0, 1.36, -0.66], [-0.22, 0, 0], [0.5, 0.18, 0.14]),
    // steering wheel (left out when VR draws its own, turning wheel)
    ...(noWheel ? [] : [
      part(G.torus, '#1d1f29', [0, 1.1, 0.44], [-1.0, 0, 0], [0.24, 0.24, 0.24]),
      part(G.cyl, '#1d1f29', [0, 0.9, 0.55], [-1.0, 0, 0], [0.04, 0.45, 0.04]),
      part(G.cyl, k, [0, 1.1, 0.44], [Math.PI / 2 - 1.0, 0, 0], [0.07, 0.05, 0.07]),
    ]),
    // engine, intake and exhausts
    part(G.rbox, metal, [0, 0.74, -1.02], [0, 0, 0], [0.84, 0.44, 0.44]),
    part(G.rbox, dark, [0, 1.0, -1.02], [0, 0, 0], [0.62, 0.12, 0.32]),
    part(G.cyl, chrome, [0, 1.1, -0.98], [0, 0, 0], [0.12, 0.12, 0.12]),
    part(G.cyl, chrome, [0.24, 0.75, -1.3], [Math.PI / 2 - 0.35, 0, 0], [0.095, 0.44, 0.095]),
    part(G.cyl, chrome, [-0.24, 0.75, -1.3], [Math.PI / 2 - 0.35, 0, 0], [0.095, 0.44, 0.095]),
    part(G.cyl, '#1a1a22', [0.24, 0.82, -1.5], [Math.PI / 2 - 0.35, 0, 0], [0.07, 0.04, 0.07]),
    part(G.cyl, '#1a1a22', [-0.24, 0.82, -1.5], [Math.PI / 2 - 0.35, 0, 0], [0.07, 0.04, 0.07]),
    // spoiler
    part(G.rbox, k2, [0, 1.28, -1.22], [0.08, 0, 0], [1.5, 0.08, 0.4]),
    part(G.rbox, k, [0.66, 1.26, -1.22], [0, 0, 0], [0.07, 0.26, 0.46]),
    part(G.rbox, k, [-0.66, 1.26, -1.22], [0, 0, 0], [0.07, 0.26, 0.46]),
    part(G.box, dark, [0.3, 1.08, -1.2], [0, 0, 0], [0.06, 0.32, 0.12]),
    part(G.box, dark, [-0.3, 1.08, -1.2], [0, 0, 0], [0.06, 0.32, 0.12]),
    // fenders
    E(k, [0.72, 0.72, 0.82], [0.27, 0.12, 0.43]), E(k, [-0.72, 0.72, 0.82], [0.27, 0.12, 0.43]),
    E(k, [0.74, 0.8, -0.82], [0.28, 0.1, 0.42]), E(k, [-0.74, 0.8, -0.82], [0.28, 0.1, 0.42]),
  ];
}
function kartGlowParts() {
  return [
    E(glowCol('#fff6d0', 2.2), [0.36, 0.66, 1.32], [0.1, 0.07, 0.05], [0.3, 0, 0]),
    E(glowCol('#fff6d0', 2.2), [-0.36, 0.66, 1.32], [0.1, 0.07, 0.05], [0.3, 0, 0]),
    part(G.box, glowCol('#ff3b5c', 2.4), [0.3, 0.82, -1.245], [0, 0, 0], [0.14, 0.06, 0.02]),
    part(G.box, glowCol('#ff3b5c', 2.4), [-0.3, 0.82, -1.245], [0, 0, 0], [0.14, 0.06, 0.02]),
  ];
}

// the character's emblem: one shared atlas, placed on the nose, both sides and the top of the wing
const EMBLEM_IDS = CHARACTERS.map((c) => c.id);
let emblemMat = null;
function emblemMaterial() {
  if (emblemMat) return emblemMat;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d');
  CHARACTERS.forEach((c, i) => {
    const ox = (i % 4) * 128 + 64, oy = Math.floor(i / 4) * 128 + 64;
    ctx.save(); ctx.translate(ox, oy);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, -54, 0, 54); g.addColorStop(0, c.accent); g.addColorStop(1, c.kart);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 53, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    emblemGlyph(ctx, c.id);
    ctx.restore();
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  emblemMat = addRim(new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.2);
  emblemMat.userData.shared = true;
  return emblemMat;
}
function emblemGlyph(ctx, id) {
  ctx.beginPath();
  if (id === 'luna') { starPath(ctx, 0, 0, 36, 5, 0.45, Math.PI); ctx.fill(); }
  else if (id === 'bolt') { ctx.moveTo(8, -38); ctx.lineTo(-20, 6); ctx.lineTo(-2, 6); ctx.lineTo(-10, 38); ctx.lineTo(20, -8); ctx.lineTo(2, -8); ctx.closePath(); ctx.fill(); }
  else if (id === 'momo') { ctx.ellipse(0, 12, 20, 16, 0, 0, Math.PI * 2); ctx.fill(); for (const [x, y] of [[-24, -10], [-9, -24], [9, -24], [24, -10]]) { ctx.beginPath(); ctx.ellipse(x, y, 8, 10, 0, 0, Math.PI * 2); ctx.fill(); } }
  else if (id === 'garu') { ctx.moveTo(0, 36); ctx.bezierCurveTo(-30, 30, -28, 0, -14, -14); ctx.bezierCurveTo(-12, -2, -6, 2, -4, 4); ctx.bezierCurveTo(-8, -18, 4, -30, 6, -40); ctx.bezierCurveTo(14, -24, 32, -8, 26, 14); ctx.bezierCurveTo(22, 30, 10, 36, 0, 36); ctx.fill(); }
  else if (id === 'penta') { for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 36, Math.sin(a) * 36); ctx.moveTo(Math.cos(a) * 22 + Math.cos(a + 0.8) * 10, Math.sin(a) * 22 + Math.sin(a + 0.8) * 10); ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); ctx.lineTo(Math.cos(a) * 22 + Math.cos(a - 0.8) * 10, Math.sin(a) * 22 + Math.sin(a - 0.8) * 10); } ctx.stroke(); }
  else if (id === 'kero') { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 5; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 18, Math.sin(a) * 18, 16, 10, a, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); }
  else if (id === 'piyo') { ctx.ellipse(0, 4, 26, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ffb21f'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-26, 0); for (let i = 0; i < 6; i++) ctx.lineTo(-26 + (i + 1) * (52 / 6), i % 2 ? 0 : -10); ctx.stroke(); }
  else { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 36, Math.sin(a) * 36); } ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 20, Math.sin(a) * 20); } ctx.closePath(); ctx.fill(); }
}
function emblemGeometry(c) {
  const i = EMBLEM_IDS.indexOf(c.id), col = i % 4, row = Math.floor(i / 4);
  // [position, facing, radius, turned upside down (the wing's top is read from behind)]
  const at = [
    [[0, 0.74, 1.36], [0, 0.56, 0.83], 0.19, false],
    [[0.0, 1.335, -1.2], [0, 1, -0.08], 0.17, true],
    [[1.105, 0.52, 0.05], [1, 0, 0], 0.17, false],
    [[-1.105, 0.52, 0.05], [-1, 0, 0], 0.17, false],
  ];
  const geos = at.map(([p, n, r, flip]) => {
    const g = new THREE.CircleGeometry(r, 28);
    if (flip) g.rotateZ(Math.PI);
    _q.setFromUnitVectors(Z, _b.set(...n).normalize());
    _m.compose(_a.set(...p), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m);
    const uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, (col + uv.getX(j)) / 4, 1 - (row + 1 - uv.getY(j)) / 2);
    return g;
  });
  for (const g of geos) paint(g, '#ffffff');
  return merge(geos);
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

// a per-kart material for the face: the atlas is shared, the offset (which expression) is this kart's own
function faceMaterial(c, F) {
  const at = faceAtlas(c, F);
  const map = at.map.clone(), em = at.em.clone();
  map.needsUpdate = true; em.needsUpdate = true;
  const m = addRim(new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: '#ffffff', emissiveIntensity: c.id === 'bolt' ? 1.5 : 0.45, roughness: 0.5, metalness: 0.05 }));
  return m;
}

// build the whole kart rig for character c
export function buildKart(c, { noWheel = false } = {}) {
  const root = new THREE.Group(); root.name = 'kart-' + c.id;
  const visual = new THREE.Group(); root.add(visual);
  const chassis = new THREE.Mesh(merge(chassisParts(c, noWheel)), charMaterial({ roughness: 0.26, metalness: 0.15 }));
  chassis.castShadow = true;
  visual.add(chassis);
  visual.add(new THREE.Mesh(merge(kartGlowParts()), glowMaterial()));
  visual.add(new THREE.Mesh(emblemGeometry(c), emblemMaterial()));

  // driver
  const B = (SPECIES[c.id] || SPECIES.luna)(c);
  const F = B.face;
  const driver = new THREE.Group();
  const body = new THREE.Mesh(merge(B.body), charMaterial({ roughness: 0.55 }));
  body.castShadow = true;
  driver.add(body);
  if (B.glow.length) driver.add(new THREE.Mesh(merge(B.glow), glowMaterial()));
  const head = new THREE.Group(); head.position.set(...NECK);
  const headMesh = new THREE.Mesh(merge(B.head), charMaterial({ roughness: 0.5 }));
  headMesh.castShadow = true;
  head.add(headMesh);
  const faceGeo = merge(F.faces.map((g) => paint(projectUV(g, F.box), '#ffffff')));
  const faceMat = faceMaterial(c, F);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.castShadow = true;
  head.add(face);
  if (B.hglow.length) head.add(new THREE.Mesh(merge(B.hglow), glowMaterial()));
  driver.add(head);
  const wobblers = B.wob.map((w) => {
    const outer = new THREE.Group();
    outer.position.set(...w.at); outer.rotation.set(...w.rot);
    const inner = new THREE.Group(); outer.add(inner);
    const m = new THREE.Mesh(merge(w.parts), charMaterial({ roughness: 0.5 }));
    m.castShadow = true;
    inner.add(m);
    if (w.glow.length) inner.add(new THREE.Mesh(merge(w.glow), glowMaterial()));
    (w.parent === 'body' ? driver : head).add(outer);
    return { obj: inner, axis: w.axis, idle: w.idle, freq: w.freq, phase: w.phase, acc: w.acc, lat: w.lat, speed: w.speed || 0, k: w.k, c: w.c, a: 0, v: 0 };
  });
  visual.add(driver);

  const wheels = [];
  const front = wheelGeometry(c, false), rear = wheelGeometry(c, true);
  const wmat = charMaterial({ roughness: 0.7 });
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

  const rig = {
    root, visual, chassis, driver, head, wheels, pivots, blob, wobblers,
    exhausts: [new THREE.Vector3(0.24, 0.82, -1.5), new THREE.Vector3(-0.24, 0.82, -1.5)],
    rearWheels: [new THREE.Vector3(0.9, 0.1, -0.82), new THREE.Vector3(-0.9, 0.1, -0.82)],
    anim: { t: Math.random() * 10, expr: 0, blinkT: 1 + Math.random() * 3, blinkDur: 0, happyT: 0, prevBoost: 0, lastSpeed: 0, hold: -1, holdT: 0 },
    faceMat,
  };
  rig.setExpr = (e) => {
    if (rig.anim.expr === e) return;
    rig.anim.expr = e;
    const ox = (e % COLS) / COLS, oy = -Math.floor(e / COLS) / ROWS;
    faceMat.map.offset.set(ox, oy); faceMat.emissiveMap.offset.set(ox, oy);
  };
  return rig;
}

// a face for a while (the select screen and the podium use this): expression e for `secs` seconds
export function holdExpression(rig, e, secs = 1.5) { rig.anim.hold = e; rig.anim.holdT = secs; }

// per frame: the face (blinks, reactions), the head turning into corners, and the springs.
// k: the kart (or a stand-in with speed/steer/... for the select screen)
export function animateDriver(rig, k, dt) {
  const a = rig.anim; if (!a || dt <= 0) return;
  dt = Math.min(dt, 0.05);
  a.t += dt;
  // ---- the face
  const boost = k.boost || 0;
  if (boost > 0 && a.prevBoost <= 0) a.happyT = 0.9;
  a.prevBoost = boost; a.happyT -= dt; a.holdT -= dt;
  let want = EXPR.normal;
  if (a.holdT > 0 && a.hold >= 0) want = a.hold;
  else if (k.spin > 0) want = EXPR.hurt;
  else if (k.finished) want = k.place <= 3 ? (Math.floor(a.t / 2.2) % 3 === 2 ? EXPR.wink : EXPR.happy) : k.place >= 6 ? EXPR.sad : EXPR.normal;
  else if (a.happyT > 0) want = EXPR.happy;
  else if (k.air && k.trick) want = EXPR.wink;
  else if ((k.jolt || 0) > 0.3 && (k.joltT ?? 9) < 0.45) want = EXPR.surprised;
  else if (k.drift && k.drift.active) want = EXPR.focus;
  a.blinkT -= dt;
  if (a.blinkT <= 0) { a.blinkT = 1.8 + Math.random() * 3.6; a.blinkDur = 0.13; if (Math.random() < 0.15) a.blinkT = 0.25; }
  a.blinkDur -= dt;
  let e = want;
  if (a.blinkDur > 0 && (want === EXPR.normal || want === EXPR.focus || want === EXPR.sad)) e = EXPR.blink;
  rig.setExpr(e);
  // ---- the head looks into the turn and nods with the bumps
  const steer = clamp(k.steer || 0, -1, 1);
  const look = steer * 0.34 + (k.drift && k.drift.active ? (k.drift.dir || 0) * 0.15 : 0) + (k.lookYaw || 0);
  rig.head.rotation.y = damp(rig.head.rotation.y, look, 6, dt);
  rig.head.rotation.z = damp(rig.head.rotation.z, -steer * 0.1, 6, dt);
  rig.head.rotation.x = damp(rig.head.rotation.x, (k.boost > 0 ? -0.1 : 0) + Math.sin(a.t * 1.3) * 0.025, 5, dt);
  // ---- springs
  const sp = k.speed || 0;
  const acc = clamp((sp - a.lastSpeed) / dt / 25, -1.5, 1.5); a.lastSpeed = sp;
  const lat = steer * clamp(sp / 18, 0, 1);
  const sn = clamp(sp / 28, 0, 1);
  for (const w of rig.wobblers) {
    const tgt = w.idle * Math.sin(a.t * w.freq + w.phase) * (0.5 + 0.5 * (1 - sn * 0.5)) - w.acc * acc + w.lat * lat + w.speed * sn;
    w.v += ((tgt - w.a) * w.k - w.v * w.c) * dt;
    w.a = clamp(w.a + w.v * dt, -1.2, 1.2);
    w.obj.rotation[w.axis] = w.a;
  }
}

// ---------------------------------------------------------------------------------------------
// pictures for the menus and the HUD. One renderer renders them all.
function studio(size) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7ab8', 1.5));
  const key = new THREE.DirectionalLight('#ffffff', 2.3); key.position.set(3, 5, 6); scene.add(key);
  const back = new THREE.DirectionalLight('#bfe6ff', 2.0); back.position.set(-4, 3, -5); scene.add(back);
  return { r, scene };
}
function shoot(size, place, expr = EXPR.normal, list = CHARACTERS) {
  const out = new Map();
  let st;
  try { st = studio(size); } catch { return out; }
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  for (const c of list) {
    const k = buildKart(c);
    k.blob.visible = false;
    k.setExpr(expr);
    place(k, cam, c);
    st.scene.add(k.root);
    st.r.render(st.scene, cam);
    out.set(c.id, st.r.domElement.toDataURL('image/png'));
    st.scene.remove(k.root);
    k.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    k.faceMat.map.dispose(); k.faceMat.emissiveMap.dispose(); k.faceMat.dispose();
  }
  st.r.dispose();
  st.r.forceContextLoss?.();
  return out;
}

// face icons (head and shoulders), for the HUD, the results and the roster: Map id → dataURL
export function renderPortraits(size = 256) {
  return shoot(size, (k, cam, c) => {
    k.root.rotation.y = 0.32;
    k.head.rotation.y = -0.12;
    cam.fov = 27; cam.updateProjectionMatrix();
    const hy = c.id === 'kero' ? 1.78 : 1.84;
    cam.position.set(0.55, hy + 0.32, 2.75); cam.lookAt(0.02, hy - 0.04, -0.2);
  });
}

// the whole kart at three-quarters, smiling: Map id → dataURL. `ids` and `expr` for one racer's mood
const kartShot = (k, cam) => {
  k.root.rotation.y = 0.5;
  k.head.rotation.y = -0.3;
  cam.fov = 30; cam.updateProjectionMatrix();
  cam.position.set(2.5, 2.25, 4.6); cam.lookAt(0, 1.05, 0);
};
export function renderKartShots(size = 384, expr = EXPR.happy, ids = null) {
  return shoot(size, kartShot, expr, ids ? CHARACTERS.filter((c) => ids.includes(c.id)) : CHARACTERS);
}
