// js/chapters/tesseract.js — 6章 テサラクト：時間を歩く. In Interstellar's tesseract, the time of a room
// became a direction you could move along. Here an original small room plays thirty seconds of its life:
// a ball bounces, a pendulum swings, a pinwheel turns, a clock ticks. Then its moments are laid side by
// side, one room every 0.5 s, and you walk along time like along a corridor. Threads join each object
// through its moments: its world line (a wave for the ball and the pendulum, a helix for the pinwheel).
// Finally you can push the ball or the pendulum at one moment: only the moments after it change.
//
// All rooms are instanced (one draw call per part for the 61 moments). The room's physics is simulated once
// for the whole history and re-simulated after a push.
import * as THREE from 'three';
import { Chapter, clamp, smooth } from './base.js';
import { Tubes } from '../tubes.js';
import { textPlane } from '../widgets.js';
import { FONT } from '../tubes.js';

const T = 30; // seconds of history
const DT = 0.5; // one room per half second
const N = Math.round(T / DT) + 1; // 61 moments
const S = 2.7; // metres between moments along the time direction
const HZ = 60; // simulation samples per second
const ROOM_Z = -1.9; // the room's centre, in front of you
const G = 9.81;
const BALL_R = 0.11;
const PIVOT = new THREE.Vector3(0.45, 1.95, -0.4);
const PEND_L = 0.9;
const PIN = new THREE.Vector3(-0.82, 1.32, 0.35);
const PIN_W = Math.PI; // rad/s: a turn every 2 s
const PIN_R = 0.17;
const CLOCK = new THREE.Vector3(-0.42, 1.55, -0.975);

// ---- the room's history ----
export function simulate(nudges = []) {
  const n = T * HZ + 1;
  const ball = new Float32Array(n * 3);
  const pend = new Float32Array(n);
  const sub = 10, h = 1 / (HZ * sub);
  const p = new THREE.Vector3(-0.6, 1.5, 0.25), v = new THREE.Vector3(1.7, 2.0, -0.9);
  let th = 0.42, om = 0;
  const lim = { x: 0.93 - BALL_R, z0: -0.95 + BALL_R, z1: 0.9 - BALL_R, y0: BALL_R, y1: 2.18 - BALL_R };
  const queue = [...nudges].sort((a, b) => a.t - b.t);
  let qi = 0;
  for (let k = 0; k < n; k++) {
    const t = k / HZ;
    ball[k * 3] = p.x; ball[k * 3 + 1] = p.y; ball[k * 3 + 2] = p.z;
    pend[k] = th;
    while (qi < queue.length && queue[qi].t <= t + 1e-9) {
      const q = queue[qi++];
      if (q.kind === 'ball') v.add(new THREE.Vector3(...q.dv));
      else om += q.dw;
    }
    for (let s = 0; s < sub; s++) {
      // ball: gravity, a little air drag, bounces, rolling friction on the floor
      const rolling = p.y <= lim.y0 + 1e-4 && Math.abs(v.y) < 0.35;
      if (rolling) {
        v.y = 0; p.y = lim.y0;
        const hs = Math.hypot(v.x, v.z);
        if (hs > 0) { const dec = Math.min(hs, 0.45 * h); v.x -= (v.x / hs) * dec; v.z -= (v.z / hs) * dec; }
      } else v.y -= G * h;
      v.multiplyScalar(1 - 0.02 * h);
      p.addScaledVector(v, h);
      if (p.y < lim.y0) { p.y = lim.y0; if (v.y < 0) { v.y = -v.y * 0.74; v.x *= 0.97; v.z *= 0.97; } }
      if (p.y > lim.y1) { p.y = lim.y1; if (v.y > 0) v.y = -v.y * 0.7; }
      if (p.x < -lim.x) { p.x = -lim.x; if (v.x < 0) v.x = -v.x * 0.8; }
      if (p.x > lim.x) { p.x = lim.x; if (v.x > 0) v.x = -v.x * 0.8; }
      if (p.z < lim.z0) { p.z = lim.z0; if (v.z < 0) v.z = -v.z * 0.8; }
      if (p.z > lim.z1) { p.z = lim.z1; if (v.z > 0) v.z = -v.z * 0.8; }
      // pendulum: θ'' = −(g/L) sin θ − γ θ'
      const a = -(G / PEND_L) * Math.sin(th) - 0.04 * om;
      om += a * h;
      th += om * h;
    }
  }
  return { ball, pend };
}

function sampleBall(sim, t, out) {
  const f = clamp(t, 0, T) * HZ, k = Math.min(Math.floor(f), T * HZ - 1), u = f - k;
  const b = sim.ball;
  return out.set(b[k * 3] + (b[k * 3 + 3] - b[k * 3]) * u, b[k * 3 + 1] + (b[k * 3 + 4] - b[k * 3 + 1]) * u, b[k * 3 + 2] + (b[k * 3 + 5] - b[k * 3 + 2]) * u);
}
function samplePend(sim, t) {
  const f = clamp(t, 0, T) * HZ, k = Math.min(Math.floor(f), T * HZ - 1), u = f - k;
  return sim.pend[k] + (sim.pend[k + 1] - sim.pend[k]) * u;
}
const bobPos = (th, out) => out.set(PIVOT.x, PIVOT.y - Math.cos(th) * PEND_L, PIVOT.z + Math.sin(th) * PEND_L);
const pinTip = (t, out) => { const a = PIN_W * t; return out.set(PIN.x + 0.03, PIN.y + Math.cos(a) * PIN_R, PIN.z + Math.sin(a) * PIN_R); };

// ---- textures drawn once ----
function wallTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 560;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 560);
  g.addColorStop(0, '#5d4a6e'); g.addColorStop(1, '#3b2f48');
  x.fillStyle = g; x.fillRect(0, 0, 512, 560);
  x.strokeStyle = 'rgba(255,230,200,0.06)';
  for (let i = 0; i < 512; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 560); x.stroke(); }
  // window with the night sky
  const wx = 300, wy = 120, ww = 150, wh = 190;
  const sky = x.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, '#0a1440'); sky.addColorStop(1, '#3a2a6a');
  x.fillStyle = sky; x.fillRect(wx, wy, ww, wh);
  x.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) { x.globalAlpha = 0.4 + Math.random() * 0.6; x.fillRect(wx + Math.random() * ww, wy + Math.random() * wh * 0.8, 2, 2); }
  x.globalAlpha = 1;
  x.strokeStyle = '#c9a77a'; x.lineWidth = 8; x.strokeRect(wx, wy, ww, wh);
  x.lineWidth = 4; x.beginPath(); x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh); x.moveTo(wx, wy + wh / 2); x.lineTo(wx + ww, wy + wh / 2); x.stroke();
  // skirting
  x.fillStyle = '#2a2030'; x.fillRect(0, 530, 512, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function clockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4ecd8'; x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#3a2a1a'; x.lineWidth = 8; x.stroke();
  x.fillStyle = '#3a2a1a';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, r0 = i % 5 ? 108 : 96;
    x.lineWidth = i % 5 ? 2 : 5;
    x.beginPath(); x.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); x.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); x.stroke();
  }
  x.font = `800 26px ${FONT}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; x.fillText(String(i * 5), 128 + Math.sin(a) * 76, 128 - Math.cos(a) * 76); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function merge(geos) {
  // a tiny merge (position + normal + uv) so a part made of boxes is one instanced mesh
  const out = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  for (const g of geos) {
    const gi = g.index ? g : g;
    const p = gi.getAttribute('position'), n = gi.getAttribute('normal'), u = gi.getAttribute('uv');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
    const ix = gi.index;
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export class Tesseract extends Chapter {
  constructor(app) {
    super(app, {
      id: 'tesseract', title: 'テサラクト：時間を歩く', tag: 'spec', sub: '時間が 方向に なった 部屋',
      desc: '部屋の 30 秒を 0.5 秒ごとに 並べ、時間の 中を 歩く。世界線を 見て、過去の 一瞬に ふれる。',
    });
    this.envMode = 'tesseract';
    this.ownsMove = true;
    this.view = { pos: [0, 1.5, 1.9], yaw: 0, pitch: -0.06 };
    this.keyHelp = 'A/D・ホイール：時間の 方向へ　W/S：前後　Q/E：上下　クリック：ボール・振り子を 押す（5ステップ目）';
    this.world = new THREE.Group();
    this.root.add(this.world);
    this.travel = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.sim = simulate([]);
    this.nudges = [];
    this.front = null;
    this.mode = 'play';
    this.u = 0;
    this.tPlay = 0;
    this.playing = true;
    this.i0 = 0;
    this.strandsOn = false;
    this.buildRoom();
    this.buildStrands();
    this.buildBulk();
    this.ripples = [];
    // a faint ring where you float, so there is always something under your feet
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.34, 64), new THREE.MeshBasicMaterial({ color: '#8ea2ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.root.add(ring);
    this.items = [this.pushItem()];
    this.iNow = -1;

    this.steps = [
      { title: 'ふつうの 部屋', tag: 'fact', text: '最後の 章は **時間**。まず ふつうの 部屋を 見よう。ボールが はね、振り子が ゆれ、かざぐるまが 回り、時計の 秒針が 進む。私たちは いつも「**今**」の 1枚しか 見られない。時間は 流れて 消えていく ように 感じる。', enter: () => this.toPlay(), actions: () => [{ id: 'playpause', label: this.playing ? '一時停止' : '再生', primary: true }, { id: 'restart', label: 'はじめから' }] },
      { title: '時間を 並べる', tag: 'fact', text: 'ボタンを 押すと、部屋の 時間を 横の 方向に 並べる。**0.5 秒ごとの 部屋** が 並んだ、パラパラ漫画を 空間に 置いた ような もの。右へ 行くほど 未来、左へ 行くほど 過去。並べる 途中は、何枚もの 時刻が 重なった 写真（ストロボ写真）に なる。', actions: () => [{ id: 'unfold', label: this.mode === 'corridor' ? 'もう一度 並べる' : '時間を 並べる ▶', primary: true }] },
      { title: '時間を 歩く', tag: 'fact', text: () => `スティック（PC は A・D キーか ホイール）で 時間の 方向に 進もう。あなたは いま 時間の 外に いて、過去と 未来を 場所の ように 行き来できる。相対性理論の「**ブロック宇宙**」の 見方（ミンコフスキー 1908）。\n目の前の 部屋は **t = ${this.tNow().toFixed(1)} 秒**。`, enter: () => this.toCorridor(), actions: () => [{ id: 'back1', label: '◀ 1 秒 過去へ' }, { id: 'fwd1', label: '1 秒 未来へ ▶', primary: true }, { id: 'home', label: '最初の 位置へ' }] },
      { title: '世界線', tag: 'fact', text: '同じ 物を 時間ごとに つなぐと **ひも** に なる。これが **世界線**。ボールは はずむ 波、振り子は ゆれる 波（上から 見ると よく わかる）、かざぐるまの 羽根の 先は **らせん**。物理学では、物体を この ひもとして 扱う。映画の テサラクトの「糸」も この 考え。', enter: () => { this.toCorridor(); this.strandsOn = true; }, actions: () => [{ id: 'strands', label: this.strandsOn ? 'ひも ON' : 'ひも OFF', on: this.strandsOn }, { id: 'up', label: '上から 見る' }, { id: 'home', label: '最初の 位置へ' }] },
      { title: '過去に ふれる', tag: 'spec', text: () => `レーザー（PC は クリック）で、ある 時刻の **ボール** か **振り子の おもり** を ねらって 押す。重力の 波が 届き、その 時刻から 先の **未来だけ** が 書きかわる。過去の 部屋は 変わらない（**因果律**）。${this.nudges.length ? `\nこれまでに ${this.nudges.length} 回 ふれた。` : ''}`, enter: () => { this.toCorridor(); this.strandsOn = true; }, actions: () => [{ id: 'reset', label: '歴史を もとに もどす' }, { id: 'strands', label: this.strandsOn ? 'ひも ON' : 'ひも OFF', on: this.strandsOn }] },
      { title: 'どこまで 科学か', tag: 'spec', text: '時間を 空間の ように 並べて 見るのは、相対性理論の 正しい 見方（**時空図**・世界線）。でも その 外から 過去の 物を 押すのは **推測（SF）**。ソーン『インターステラーの 科学』でも 推測に 分類され、映画では 過去への 働きかけが 歴史と 矛盾 しない ループとして 描かれた。ここで 見た「書きかわる 未来」が 本当に 起こるかは、誰にも わからない。', enter: () => this.toCorridor() },
    ];
  }

  // ---------- building ----------
  buildRoom() {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05, ...o });
    const parts = {
      floor: [merge([box(2, 0.04, 2, 0, -0.02, 0)]), std({ color: '#6e4b36' })],
      rug: [new THREE.CircleGeometry(0.62, 40).rotateX(-Math.PI / 2).translate(-0.1, 0.003, 0.1), std({ color: '#2f5a7a', roughness: 0.95 })],
      wall: [new THREE.PlaneGeometry(2, 2.2).translate(0, 1.1, -1), std({ map: wallTexture(), roughness: 0.9 })],
      frame: [merge([
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => box(0.035, 2.2, 0.035, x, 1.1, z)),
        ...[0, 2.2].flatMap((y) => [box(2.035, 0.035, 0.035, 0, y, -1), box(2.035, 0.035, 0.035, 0, y, 1), box(0.035, 0.035, 2.035, -1, y, 0), box(0.035, 0.035, 2.035, 1, y, 0)]),
      ]), std({ color: '#ffffff', emissive: '#b98a3a', emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 })],
      stand: [merge([box(0.03, 1.98, 0.03, 0.22, 0.99, PIVOT.z), box(0.03, 1.98, 0.03, 0.68, 0.99, PIVOT.z), box(0.5, 0.03, 0.03, 0.45, 1.97, PIVOT.z), box(0.12, 0.02, 0.3, 0.22, 0.01, PIVOT.z), box(0.12, 0.02, 0.3, 0.68, 0.01, PIVOT.z)]), std({ color: '#c9b48a', metalness: 0.4, roughness: 0.4 })],
      clockFace: [new THREE.CircleGeometry(0.2, 48).translate(CLOCK.x, CLOCK.y, CLOCK.z), std({ map: clockTexture(), roughness: 0.6 })],
      pinPost: [merge([box(0.025, PIN.y, 0.025, PIN.x, PIN.y / 2, PIN.z), box(0.16, 0.02, 0.16, PIN.x, 0.01, PIN.z)]), std({ color: '#8a6a4a' })],
      ball: [new THREE.SphereGeometry(BALL_R, 24, 16), std({ color: '#ff5a3c', roughness: 0.4, emissive: '#5a1000', emissiveIntensity: 0.4 })],
      rod: [new THREE.CylinderGeometry(0.006, 0.006, PEND_L, 6).translate(0, -PEND_L / 2, 0), std({ color: '#ddd', metalness: 0.8, roughness: 0.2 })],
      bob: [new THREE.SphereGeometry(0.065, 20, 14), std({ color: '#e8b84a', metalness: 0.7, roughness: 0.25, emissive: '#4a3000', emissiveIntensity: 0.4 })],
      hand: [box(0.01, 0.17, 0.006, 0, 0.07, 0.004), std({ color: '#c03020' })],
      blades: [this.bladeGeo(), std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, emissive: '#202040', emissiveIntensity: 0.3 })],
    };
    this.parts = {};
    for (const [k, [geo, mat]] of Object.entries(parts)) {
      const m = new THREE.InstancedMesh(geo, mat, N);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.world.add(m);
      this.parts[k] = m;
    }
    // per-moment frame colour: the moment in front of you glows
    for (let i = 0; i < N; i++) this.parts.frame.setColorAt(i, new THREE.Color('#ffffff'));
    // time labels above each room
    this.labels = [];
    for (let i = 0; i < N; i++) {
      const l = textPlane(`t = ${(i * DT).toFixed(1)} s`, { h: 0.13, color: '#ffe3a8', weight: 800 });
      this.world.add(l);
      this.labels.push(l);
    }
  }

  bladeGeo() {
    const pos = [], col = [];
    const cols = [[1, 0.35, 0.35], [1, 0.85, 0.3], [0.35, 0.8, 1], [0.5, 1, 0.5]];
    for (let b = 0; b < 4; b++) {
      const a0 = (b / 4) * Math.PI * 2, a1 = a0 + 0.9;
      const p = (a, r) => [0, Math.cos(a) * r, Math.sin(a) * r];
      for (const v of [[0, 0, 0], p(a0, PIN_R), p(a1, PIN_R * 0.6)]) { pos.push(...v); col.push(...cols[b]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  buildStrands() {
    this.strands = new Tubes(T * 30 * 3 + 10, { glow: 0.55, fog: true });
    this.world.add(this.strands.mesh);
    this.front3 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.MeshBasicMaterial({ color: '#c08cff', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    this.front3.rotation.y = Math.PI / 2;
    this.front3.visible = false;
    this.world.add(this.front3);
  }

  // empty frames above and below every moment: the lattice of the tesseract
  buildBulk() {
    const g = merge([
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => box(0.02, 2.2, 0.02, x, 1.1, z)),
      ...[0, 2.2].flatMap((y) => [box(2.02, 0.02, 0.02, 0, y, -1), box(2.02, 0.02, 0.02, 0, y, 1), box(0.02, 0.02, 2.02, -1, y, 0), box(0.02, 0.02, 2.02, 1, y, 0)]),
    ]);
    const m = new THREE.MeshBasicMaterial({ color: '#8f7cff', transparent: true, opacity: 0.35, depthWrite: false });
    this.bulk = new THREE.InstancedMesh(g, m, N * 4);
    this.bulk.frustumCulled = false;
    this.world.add(this.bulk);
  }

  // ---------- modes ----------
  enter(step) {
    super.enter(step);
    this.app.scene.fog = new THREE.FogExp2('#0a0c1e', 0.028);
  }

  exit() {
    super.exit();
    this.app.scene.fog = null;
  }

  toPlay() {
    if (this.mode === 'play') return;
    this.anim = { from: this.u, to: 0, t: 0, dur: 1.6, then: () => { this.mode = 'play'; this.tPlay = this.i0 * DT; } };
    this.glide = { from: this.travel.clone(), to: new THREE.Vector3(), t: 0, dur: 0.8 };
  }

  toCorridor(instant = false) {
    if (this.mode === 'corridor' && this.u >= 1 && !this.anim) return;
    if (this.mode === 'play') {
      this.i0 = clamp(Math.round(this.tPlay / DT), 0, N - 1);
      this.mode = 'corridor';
      this.u = 0;
      this.travel.set(0, 0, 0);
    }
    if (instant) { this.u = 1; this.anim = null; return; }
    this.anim = { from: this.u, to: 1, t: 0, dur: 3 };
    this.app.sound.whoosh();
  }

  travelTo(x, dur = 0.6) {
    this.glide = { from: this.travel.clone(), to: new THREE.Vector3(x, this.travel.y, this.travel.z), t: 0, dur };
  }

  tNow() {
    if (this.mode === 'play') return this.tPlay;
    return clamp(Math.round(this.travel.x / S) + this.i0, 0, N - 1) * DT;
  }

  onAction(id) {
    if (id === 'playpause') { this.playing = !this.playing; this.app.refreshPanel(); }
    else if (id === 'restart') { this.tPlay = 0; this.playing = true; this.app.refreshPanel(); }
    else if (id === 'unfold') { if (this.mode === 'corridor') { this.u = 0; } this.toCorridor(); this.app.refreshPanel(); }
    else if (id === 'back1') this.travelTo(Math.round(this.travel.x / S - 2) * S);
    else if (id === 'fwd1') this.travelTo(Math.round(this.travel.x / S + 2) * S);
    else if (id === 'home') { this.travelTo(0); this.glide.to.set(0, 0, 0); }
    else if (id === 'up') this.glide = { from: this.travel.clone(), to: new THREE.Vector3(this.travel.x, 2.4, ROOM_Z + 1.4), t: 0, dur: 1.4 };
    else if (id === 'strands') { this.strandsOn = !this.strandsOn; this.app.refreshPanel(); }
    else if (id === 'reset') { this.nudges = []; this.sim = simulate([]); this.front = null; this.app.refreshPanel(); }
  }

  // ---------- pushing the past ----------
  pushItem() {
    const item = {
      enabled: () => this.root.visible && this.step >= 4 && this.mode === 'corridor' && this.u >= 1,
      rayHit: (ray) => {
        const h = this.pick(ray);
        item.cand = h;
        return h ? { d: h.d, point: h.point } : null;
      },
      press: (p) => {
        const h = item.cand;
        if (!h) return false;
        this.push(h, p.ray.direction);
        return false;
      },
    };
    return item;
  }

  pick(ray) {
    this.world.updateMatrixWorld(true);
    const inv = this.world.matrixWorld.clone().invert();
    const o = ray.origin.clone().applyMatrix4(inv), d = ray.direction.clone().transformDirection(inv);
    const r = new THREE.Ray(o, d);
    let best = null;
    const tmp = new THREE.Vector3(), c = new THREE.Vector3();
    // only the moments near you can be touched
    for (let i = 0; i < N; i++) {
      const t = i * DT, X = this.copyX(i);
      if (Math.abs(X - this.travel.x) > 14) continue;
      const sim = this.simAt(t);
      for (const kind of ['ball', 'bob']) {
        if (kind === 'ball') sampleBall(sim, t, c); else bobPos(samplePend(sim, t), c);
        c.x += X; c.z += ROOM_Z;
        const pt = r.intersectSphere(new THREE.Sphere(c, kind === 'ball' ? BALL_R * 1.3 : 0.09), tmp);
        if (pt) {
          const dist = pt.distanceTo(o);
          if (!best || dist < best.d) best = { d: dist, point: pt.clone().applyMatrix4(this.world.matrixWorld), kind, i, local: pt.clone() };
        }
      }
    }
    return best;
  }

  push(h, dirWorld) {
    const inv = this.world.matrixWorld.clone().invert();
    const d = dirWorld.clone().transformDirection(inv);
    const t = h.i * DT;
    if (h.kind === 'ball') {
      const hz = new THREE.Vector3(d.x, 0, d.z).normalize().multiplyScalar(2.2);
      this.nudges.push({ t, kind: 'ball', dv: [hz.x, 2.4, hz.z] });
    } else {
      this.nudges.push({ t, kind: 'pend', dw: d.z < 0 ? -1.8 : 1.8 });
    }
    this.newSim = simulate(this.nudges);
    this.front = { tau: t, t0: t };
    this.ripples.push({ p: h.local.clone(), t: 0 });
    this.app.sound.ripple();
    this.app.refreshPanel();
  }

  // which history a moment shows: after a push the change sweeps forward in time
  simAt(t) {
    if (this.front && t >= this.front.tau) return this.sim;
    return this.front ? this.newSim : this.sim;
  }

  copyX(i) {
    if (this.mode === 'play') return 0;
    return (i - this.i0) * S * this.u;
  }

  keys(k, dt) {
    const want = new THREE.Vector3();
    if (k.has('KeyA') || k.has('ArrowLeft')) want.x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) want.x += 1;
    if (k.has('KeyW')) want.z -= 1;
    if (k.has('KeyS')) want.z += 1;
    if (k.has('KeyQ')) want.y -= 1;
    if (k.has('KeyE')) want.y += 1;
    const inp = this.app.input;
    if (inp.wheel) { this.travel.x += inp.wheel * S * 0.25; inp.wheel = 0; }
    this.drive(want, dt);
  }

  drive(want, dt) {
    if (this.mode !== 'corridor') { this.vel.set(0, 0, 0); return; }
    const target = want.multiplyScalar(4.5);
    this.vel.lerp(target, 1 - Math.exp(-dt * 5));
    if (this.vel.lengthSq() > 1e-6) { this.glide = null; this.travel.addScaledVector(this.vel, dt); }
  }

  sticksAndGrab(dt) {
    if (!this.app.xrActive) return;
    const L = this.app.input.xr.L, R = this.app.input.xr.R;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const want = new THREE.Vector3(dz(L.axes[0]) + dz(R.axes[0]), -dz(R.axes[1]), dz(L.axes[1]));
    // turn the stick direction into the stage's axes (the stage may be rotated)
    this.drive(want, dt);
    // grab the air and pull: the world moves with your hand
    for (const p of [L, R]) {
      if (p.airGrab && p.pressed && !p.active) {
        const q = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
        const d = p.pos.clone().sub(p.airGrab).applyQuaternion(q);
        if (this.mode === 'corridor') this.travel.sub(d.multiplyScalar(2.2));
        p.airGrab.copy(p.pos);
        this.glide = null;
      } else if (!p.pressed) p.airGrab = null;
    }
  }

  onFree(p) {
    if (p.kind === 'xr') p.airGrab = p.pos.clone();
  }

  // ---------- frame ----------
  update(dt, t) {
    this.sticksAndGrab(dt);
    if (this.anim) {
      const a = this.anim;
      a.t += dt / a.dur;
      this.u = a.from + (a.to - a.from) * smooth(Math.min(1, a.t));
      if (a.t >= 1) { this.anim = null; a.then?.(); }
    }
    if (this.glide) {
      const g = this.glide;
      g.t += dt / g.dur;
      this.travel.lerpVectors(g.from, g.to, smooth(Math.min(1, g.t)));
      if (g.t >= 1) this.glide = null;
    }
    if (this.mode === 'corridor') {
      this.travel.x = clamp(this.travel.x, -this.i0 * S - 3, (N - 1 - this.i0) * S + 3);
      this.travel.y = clamp(this.travel.y, -2.5, 4);
      this.travel.z = clamp(this.travel.z, ROOM_Z - 1.5, 6);
    }
    this.world.position.set(-this.travel.x, -this.travel.y, -this.travel.z);
    if (this.front) {
      this.front.tau += dt * 9;
      if (this.front.tau >= T) { this.sim = this.newSim; this.front = null; }
    }
    if (this.mode === 'play' && this.playing) {
      const before = Math.floor(this.tPlay);
      this.tPlay = (this.tPlay + dt) % T;
      if (Math.floor(this.tPlay) !== before) this.app.sound.tick();
    }
    const iNow = Math.round(this.tNow() / DT);
    if (iNow !== this.iNow) {
      if (this.iNow >= 0 && this.mode === 'corridor') this.app.sound.tick();
      this.iNow = iNow;
      if (this.step === 2) this.app.refreshPanel();
    }
    this.drawRooms();
    this.drawStrands();
    this.drawRipples(dt);
    void t;
  }

  drawRooms() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3(), b = new THREE.Vector3();
    const P = this.parts;
    const count = this.mode === 'play' ? 1 : N;
    const X0 = new THREE.Vector3();
    const now = new THREE.Color('#ffe9b0'), dim = new THREE.Color('#6a5a8a');
    for (let k = 0; k < count; k++) {
      const i = this.mode === 'play' ? 0 : k;
      const t = this.mode === 'play' ? this.tPlay : i * DT;
      const X = this.mode === 'play' ? 0 : this.copyX(i);
      X0.set(X, 0, ROOM_Z);
      const sim = this.simAt(t);
      m.makeTranslation(X0.x, X0.y, X0.z);
      for (const key of ['floor', 'rug', 'wall', 'frame', 'stand', 'clockFace', 'pinPost']) P[key].setMatrixAt(k, m);
      P.frame.setColorAt(k, this.mode === 'play' || i === this.iNow ? now : dim);
      sampleBall(sim, t, p);
      m.makeTranslation(X0.x + p.x, X0.y + p.y, X0.z + p.z);
      P.ball.setMatrixAt(k, m);
      const th = samplePend(sim, t);
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -th); // the rod hangs down and swings towards +z with θ
      m.compose(b.copy(PIVOT).add(X0), q, one);
      P.rod.setMatrixAt(k, m);
      bobPos(th, b).add(X0);
      m.makeTranslation(b.x, b.y, b.z);
      P.bob.setMatrixAt(k, m);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -((t + 10) / 60) * Math.PI * 2);
      m.compose(b.copy(CLOCK).add(X0).add(new THREE.Vector3(0, 0, 0.004)), q, one);
      P.hand.setMatrixAt(k, m);
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), PIN_W * t);
      m.compose(b.copy(PIN).add(X0).add(new THREE.Vector3(0.03, 0, 0)), q, one);
      P.blades.setMatrixAt(k, m);
      const l = this.labels[i];
      l.visible = this.mode === 'corridor' && this.u > 0.6;
      l.position.set(X, 2.48, ROOM_Z + 1.0);
    }
    for (let i = count; i < N; i++) this.labels[i].visible = false;
    if (this.mode === 'play') for (let i = 1; i < N; i++) this.labels[i].visible = false;
    for (const mesh of Object.values(P)) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // the lattice above and below
    const show = this.mode === 'corridor' ? N : 0;
    let c = 0;
    for (let i = 0; i < show; i++) {
      for (const [dy, dz] of [[2.7, 0], [-2.7, 0], [0, -2.7], [2.7, -2.7]]) {
        m.makeTranslation(this.copyX(i), dy * this.u, ROOM_Z + dz * this.u);
        this.bulk.setMatrixAt(c++, m);
      }
    }
    this.bulk.count = c;
    this.bulk.instanceMatrix.needsUpdate = true;
    this.bulk.material.opacity = 0.3 * this.u;
  }

  drawStrands() {
    const tb = this.strands.begin();
    const on = this.strandsOn && this.mode === 'corridor' && this.u > 0.95;
    this.front3.visible = !!this.front && on;
    if (on) {
      const step = 1 / 30;
      const a = new THREE.Vector3(), bb = new THREE.Vector3();
      const colAt = (base, t) => { const k = t / T; return [base[0] * (0.55 + 0.45 * k), base[1] * (0.55 + 0.45 * k), base[2] * (0.55 + 0.45 * k)]; };
      const Xof = (t) => (t / DT - this.i0) * S;
      const strand = (fn, base, r) => {
        let prev = null, pc = null;
        for (let t = 0; t <= T + 1e-6; t += step) {
          fn(this.simAt(t), t, a);
          a.x += Xof(t); a.z += ROOM_Z;
          const col = colAt(base, t);
          if (prev) tb.push(prev, a.clone(), pc, col, r);
          prev = a.clone(); pc = col;
        }
      };
      strand((s, t, o) => sampleBall(s, t, o), [1, 0.45, 0.3], 0.012);
      strand((s, t, o) => bobPos(samplePend(s, t), o), [1, 0.82, 0.35], 0.01);
      strand((s, t, o) => pinTip(t, o), [0.4, 0.85, 1], 0.008);
      void bb;
      if (this.front) this.front3.position.set(Xof(this.front.tau), 1.2, ROOM_Z);
    }
    tb.end();
  }

  drawRipples(dt) {
    for (const r of this.ripples) {
      if (!r.mesh) {
        r.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: '#c08cff', wireframe: true, transparent: true, depthWrite: false }));
        this.world.add(r.mesh);
      }
      r.t += dt;
      const k = r.t / 1.6;
      r.mesh.position.copy(r.p);
      r.mesh.scale.setScalar(0.05 + k * 1.2);
      r.mesh.material.opacity = Math.max(0, 0.6 * (1 - k));
      if (k >= 1) { this.world.remove(r.mesh); r.mesh.geometry.dispose(); r.done = true; }
    }
    this.ripples = this.ripples.filter((r) => !r.done);
  }

  setupGuides() {
    this.stickHelp = { L: '左右で 時間の 方向・上下で 前後', R: '上下で 上・下へ' };
    const ball = { at: () => this.ballWorld(), vr: 'レーザーで 指して トリガー', pc: 'クリックで 押す', r: 0.15, when: () => this.mode === 'corridor' && this.u >= 1 };
    this.guides = [
      { vr: '見るだけ。秒針・ボール・振り子を 目で 追う。', pc: '見るだけ。ドラッグで 見回せる。' },
      { vr: '案内板の「**時間を 並べる**」を レーザーで 指して **トリガー**。', hand: '「時間を 並べる」を 指して **つまむ**。', pc: '「時間を 並べる」を クリック。' },
      { vr: '**左スティックを 左右** に たおすと 時間の 方向へ 進む。何もない 所で **グリップを にぎって 引く** と 空間ごと 動かせる。', hand: '何もない 所で **つまんで 引く** と 進む。「1 秒 未来へ」ボタンでも。', pc: '**A・D キー** か **ホイール** で 時間の 方向へ。W/S 前後、Q/E 上下。' },
      { vr: '**右スティックを 上** に たおして 浮き上がり、上から ひもを 見る（「上から 見る」ボタンでも）。', hand: '「上から 見る」ボタンを つまむ。', pc: '**E キー** で 上がるか「上から 見る」。' },
      { vr: '目の前の 部屋の **ボール** か **振り子の おもり** を レーザーで 指して **トリガー**。', hand: 'ボールか おもりを 指先で 指して **つまむ**。', pc: 'ボールか 振り子の おもりを **クリック**。', targets: [ball] },
      { vr: '「目次へ」で 好きな 章に もどれる。', pc: '「目次へ」で 好きな 章に もどれる。' },
    ];
  }

  // the ball of the moment in front of you, in world space (for the guide's marker)
  ballWorld() {
    const i = clamp(this.iNow, 0, N - 1);
    const p = sampleBall(this.simAt(i * DT), i * DT, new THREE.Vector3());
    p.x += this.copyX(i); p.z += ROOM_Z;
    this.world.updateMatrixWorld(true);
    return this.world.localToWorld(p);
  }

}
