// js/chapters/ladder.js — 1章 次元のはしご. A point is dragged into a line, the line into a square, the
// square into a cube — and then, by the very same move in a 4th and a 5th direction, into a tesseract and a
// penteract. You pull the lever yourself (or press the button) and watch the copy separate and the new edges
// trace the path. The count table shows the rule: the n-cube has 2^(n-k)·C(n,k) faces of dimension k.
import * as THREE from 'three';
import { Chapter, clamp, smooth } from './base.js';
import { Wire } from './draw4.js';
import { identity, rotate, rotate3, cubeFaces, orthonormalize } from '../math4.js';
import { Console, Turner } from '../widgets.js';
import { labelSprite, FONT } from '../tubes.js';

const N = 5;
const AX = ['X', 'Y', 'Z', 'W', 'V'];
const AXJ = ['横（X）', '縦（Y）', '奥行き（Z）', '4番目（W）', '5番目（V）'];
const NAMES = ['点', '線分', '正方形', '立方体', '超立方体（テサラクト）', '5次元立方体（ペンテラクト）'];

export class Ladder extends Chapter {
  constructor(app) {
    super(app, {
      id: 'ladder', title: '次元のはしご', tag: 'math', sub: '点→線→面→立体→4D→5D',
      desc: '点を 動かすと 線、線を 動かすと 面……。同じ 一歩を 4番目・5番目の 方向へ。',
    });
    this.center = new THREE.Vector3(0, 1.42, -0.62);
    this.wire = new Wire({ maxEdges: 100, maxVerts: 40, radius: 0.0055, bead: 0.012, glow: 0.3 });
    this.wire.group.position.copy(this.center);
    this.root.add(this.wire.group);
    this.R = identity(N);
    this.D = 0; // completed dimensions
    this.a = 0; // how far the copy has moved along axis D (0…1)
    this.anim = null;
    this.spin4 = false;
    this.console = new Console({
      dials: [],
      slider: { label: '押し出す', top: 'のばす', bottom: 'もどす', color: '#ffcf7a', onChange: (v) => { this.anim = null; this.setA(v); } },
    });
    this.console.slider.group.position.set(-0.32, 0.92, -0.42);
    this.root.add(this.console.slider.group);
    this.turner = new Turner({
      center: () => this.wire.group.getWorldPosition(new THREE.Vector3()),
      radius: 0.2,
      onRotate: (q) => this.rotate3(q),
    });
    this.items = [this.console.slider.item, this.turner.item];
    this.axisLabel = labelSprite('X', { size: 0.045, color: '#ffcf7a' });
    this.axisLabel.position.set(0, 0.25, 0);
    this.wire.group.add(this.axisLabel);
    this.keyHelp = 'R/F：押し出す';

    const step = (k) => ({
      title: `${k}次元：${NAMES[k]}`,
      text: () => this.text(k),
      enter: () => this.begin(k),
      extra: k >= 4 ? (c, r) => this.table(c, r, k) : null,
      extraH: 210,
      actions: () => this.acts(k),
    });
    this.steps = [0, 1, 2, 3, 4, 5].map(step);
    this.steps.push({
      title: '規則',
      text: '次元が 1つ 上がるたびに、前の 図形を **2つ** 並べ、対応する 頂点を むすぶ。だから 頂点は 2倍、辺は「2倍 ＋ 頂点の数」。n 次元立方体の k 次元の 面の 数は **2^(n−k) × nCk**。見えない 次元も、この 規則で 確実に 調べられる。',
      enter: () => { this.begin(5); this.setA(1); this.spin4 = true; },
      extra: (c, r) => this.table(c, r, 6),
      extraH: 270,
      actions: () => [{ id: 'spin', label: this.spin4 ? '4次元の 回転 ON' : '4次元の 回転 OFF', on: this.spin4 }],
    });
  }

  text(k) {
    const t = [
      '**0次元**：点。大きさも 方向も ない。どこへも 動けない。ここから はしごを 登っていく。「つぎへ」で 点を 動かそう。',
      '点を **横（X）** へ 動かすと、通った 跡が **線分**（1次元）になる。元の 点と 動いた 点、2つの 頂点を 1本の 辺が むすぶ。',
      '線分を、X と 直角な **縦（Y）** へ 動かすと **正方形**（2次元）。元の 線分・動いた 線分・頂点が 通った 2本の 辺で、頂点 4・辺 4。',
      '正方形を、X にも Y にも 直角な **奥行き（Z）** へ 動かすと **立方体**（3次元）。頂点 8・辺 12・面 6。ここまでは 手で つかんで 回して 確かめられる。',
      '立方体を、X・Y・Z の **どれとも 直角な 4番目の 方向（W）** へ 動かす。私たちの 空間に その 方向は ないので、遠近法で 描く：**カタ（−W）は 小さく 青く、アナ（+W）は 大きく 橙に**。2つの 立方体を 8本の 新しい 辺が むすび、**超立方体**ができる。',
      'もう一度、W にも 直角な **5番目の 方向（V）** へ。超立方体が 2つ（影の 影なので ゆがむ）を 16本の 辺が むすび、**5次元立方体**。インターステラーの「バルク」は 空間 4次元。ここは さらに 1つ 上。',
    ];
    return t[k];
  }

  acts(k) {
    const a = [];
    if (k > 0) a.push({ id: 'extrude', label: this.a >= 1 ? 'もう一度 押し出す' : `${AX[k - 1]} の 方向へ 押し出す ▶`, primary: this.a < 1 });
    if (k >= 4) a.push({ id: 'spin', label: this.spin4 ? '4次元の 回転 ON' : '4次元の 回転 OFF', on: this.spin4 });
    a.push({ id: 'reset', label: '向きを もどす' });
    return a;
  }

  begin(k) {
    this.D = Math.max(0, k - 1);
    this.target = k;
    this.anim = null;
    this.spin4 = k >= 4 && this.spin4;
    if (k === 0) { this.D = 0; this.setA(0, false); }
    else this.setA(0, false);
    this.console.slider.group.visible = k > 0 && k <= 5;
    this.console.slider.set(0, false);
    this.axisLabel.visible = k > 0;
    if (k > 0) {
      this.axisLabel.material.map.dispose();
      const s = labelSprite(`${AX[k - 1]} の 方向へ`, { size: 0.04, color: k >= 4 ? (k === 4 ? '#ffb070' : '#ff8fd0') : '#ffcf7a' });
      this.axisLabel.material = s.material;
      this.axisLabel.scale.copy(s.scale);
    }
    if (k <= 3 && this.step !== 6) this.resetView(k);
  }

  resetView(k = this.target) {
    this.R = identity(N);
    // a little turned, so a cube shows three faces
    if (k >= 3) { rotate(this.R, N, 0, 2, 0.55); rotate(this.R, N, 1, 2, -0.38); }
    else if (k === 2) { rotate(this.R, N, 1, 2, -0.25); }
  }

  setA(v, sound = true) {
    const was = this.a;
    this.a = clamp(v, 0, 1);
    if (this.target > 0) this.console.slider.set(this.a, false);
    if (sound && was < 1 && this.a >= 1) { this.app.sound.chime(this.target); this.app.refreshPanel(); }
    if (was >= 1 && this.a < 1) this.app.refreshPanel();
  }

  onAction(id) {
    if (id === 'extrude') {
      this.anim = { t: 0 };
      this.setA(0, false);
      this.app.sound.whoosh();
    } else if (id === 'spin') {
      this.spin4 = !this.spin4;
      this.app.refreshPanel();
    } else if (id === 'reset') {
      this.resetView();
    }
  }

  rotate3(q) {
    const m = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
    rotate3(this.R, N, m.elements);
    orthonormalize(this.R, N);
  }

  keys(k, dt) {
    if (k.has('KeyR')) { this.anim = null; this.setA(this.a + dt * 0.8); }
    if (k.has('KeyF')) { this.anim = null; this.setA(this.a - dt * 0.8); }
  }

  verts() {
    // axes 0…D-1 are ±1; the axis being extruded (D, when target > D) is ±a
    const dims = this.target > this.D ? this.D + 1 : this.D;
    const out = [];
    for (let b = 0; b < 1 << dims; b++) {
      const v = new Array(N).fill(0);
      for (let k = 0; k < dims; k++) {
        const s = b >> k & 1 ? 1 : -1;
        v[k] = k === this.D && this.target > this.D ? s * this.a : s;
      }
      out.push(v);
    }
    const edges = [];
    for (let a = 0; a < out.length; a++) for (let k = 0; k < dims; k++) { const b = a ^ (1 << k); if (b > a) edges.push([a, b, k]); }
    return { v: out, edges, dims };
  }

  update(dt, t) {
    if (this.anim) {
      this.anim.t += dt / 1.8;
      this.setA(smooth(Math.min(1, this.anim.t)));
      if (this.anim.t >= 1) this.anim = null;
    }
    if (this.spin4 && this.target >= 4) {
      rotate(this.R, N, 0, 3, dt * 0.35);
      rotate(this.R, N, 1, 4, dt * 0.22);
      orthonormalize(this.R, N);
    } else if (this.target >= 1 && this.target <= 3 && !this.turner.grab) {
      rotate(this.R, N, 0, 2, dt * 0.12);
    }
    const { v, edges } = this.verts();
    const rv = v.map((p) => {
      const o = new Array(N).fill(0);
      for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) o[i] += this.R[i * N + k] * p[k];
      return o;
    });
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    const isNew = (e) => edges[e][2] === this.D && this.target > this.D;
    this.wire.draw(rv, edges, {
      n: N, d: 4, scale: 0.13, wMax: 1.3,
      edgeColor: (e) => (isNew(e) ? [1, 0.86 * pulse, 0.45 * pulse] : null),
      edgeWidth: (e) => (isNew(e) ? 1.4 : 1),
      beadScale: this.target === 0 ? 2.2 : 1,
    });
    this.axisLabel.position.set(0, 0.27, 0);
  }

  // the count table: rows 0D…5D; columns vertices, edges, faces, cells, 4-faces
  table(c, r, upto) {
    const cols = ['', '頂点', '辺', '面', '胞', '4次元胞'];
    const cw = [r.w * 0.36, r.w * 0.128, r.w * 0.128, r.w * 0.128, r.w * 0.128, r.w * 0.128];
    const rows = Math.min(upto, 5) + 1;
    const rh = Math.min(36, (r.h - 34) / Math.max(rows, 1));
    c.save();
    c.font = `800 22px ${FONT}`;
    c.textBaseline = 'middle';
    let x = r.x;
    cols.forEach((h, i) => { c.fillStyle = '#9aa3d6'; c.textAlign = i ? 'center' : 'left'; c.fillText(h, i ? x + cw[i] / 2 : x + 4, r.y + 14); x += cw[i]; });
    for (let n = 0; n < rows; n++) {
      const y = r.y + 34 + n * rh;
      const cur = n === Math.min(upto, 5) && upto <= 5;
      if (cur) { c.fillStyle = 'rgba(255,207,122,0.16)'; c.fillRect(r.x, y, r.w, rh); }
      x = r.x;
      for (let i = 0; i < 6; i++) {
        c.fillStyle = cur ? '#ffcf7a' : '#e6e9ff';
        c.textAlign = i ? 'center' : 'left';
        const val = i === 0 ? `${n}次元 ${['点', '線分', '正方形', '立方体', '超立方体', '5次元立方体'][n]}` : cubeFaces(n, i - 1) || '';
        c.fillText(String(val), i ? x + cw[i] / 2 : x + 4, y + rh / 2);
        x += cw[i];
      }
    }
    c.restore();
  }

  // the controls guide for each step (shown when 操作ガイド is on)
  setupGuides() {
    const lever = { at: () => this.console.slider.knobWorld(), vr: 'にぎって 上へ', pc: '上へ ドラッグ', r: 0.04, when: () => this.console.slider.group.visible };
    const obj = { at: () => this.wire.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.22, 0, 0)), vr: '図形は にぎって 回せる', pc: 'ドラッグで 回す', r: 0.03 };
    const pull = {
      vr: '左の **光る 玉（レバー）** に 手を 近づけ、**グリップ** で にぎって **上へ**。下の ボタンを レーザーで 指して **トリガー** でも 動く。',
      hand: '左の 光る 玉に 手を 近づけ、**つまんで 上へ**。ボタンは 指先で 指して つまむ。',
      pc: 'レバーの 玉を **上へ ドラッグ**（R キー）、または ボタンを クリック。図形は ドラッグで 回る。',
      targets: [lever, obj],
    };
    this.guides = [
      { vr: '案内板の「**つぎへ**」を レーザーで 指して **トリガー**。点が 動き出す。', hand: '「つぎへ」を 指先で 指して **つまむ**。', pc: '「つぎへ」を クリック（Space キー）。' },
      pull, pull, pull, pull, pull,
      { vr: '図形を **グリップ** で にぎって 回す。「4次元の 回転」で W・V の 方向にも 回る。', hand: '図形に 手を 近づけ、つまんで 回す。', pc: '図形を ドラッグで 回す。', targets: [obj] },
    ];
  }

}
