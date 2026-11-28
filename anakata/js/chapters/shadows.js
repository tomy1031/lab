// js/chapters/shadows.js — 4章 4次元の影. A light out along W casts the tesseract's shadow into our space:
// the famous "cube inside a cube". Beside it, a real cube casts its 2D shadow on a wall ("square inside a
// square"), and the X→W knob turns the cube towards its light exactly as it turns the tesseract into W, so
// you can watch the inner square swell outward and the outer one shrink inward, then see the same thing
// happen one dimension up. Turning in all six planes of 4D, following one cell, the double rotation, and
// finally the 5-cube's shadow of a shadow.
import * as THREE from 'three';
import { Chapter } from './base.js';
import { Rig4 } from './rig4.js';
import { Wire } from './draw4.js';
import { Tubes, Beads } from '../tubes.js';
import { polytope, hypercube, apply, identity, rotate, orthonormalize, project, wColor } from '../math4.js';
import { textPlane } from '../widgets.js';

const CENTER = new THREE.Vector3(-0.05, 1.47, -0.66);
const SCALE = 0.095;
const D = 3.4; // distance of the 4D light along W

export class Shadows extends Chapter {
  constructor(app) {
    super(app, {
      id: 'shadows', title: '4次元の影', tag: 'math', sub: '超立方体を 6つの 面で 回す',
      desc: '立方体の 影は「正方形の 中の 正方形」。超立方体の 影は「立方体の 中の 立方体」。手で 回して 確かめる。',
    });
    this.view = { pos: [0.08, 1.7, 0.45], yaw: 0.03, pitch: -0.4 };
    this.keyHelp = 'J/L・I/K・U/O：XW・YW・ZW 回転（つかんで ドラッグで ふつうの 回転）';
    this.rig = new Rig4(this, { center: CENTER, radius: 0.24 });
    this.items = this.rig.items;
    this.obj = 'tesseract';
    this.auto = null;
    this.follow = -1;
    this.wire = new Wire({ maxEdges: 120, maxVerts: 40, radius: 0.0042, bead: 0.0085, glow: 0.35 });
    this.wire.group.position.copy(CENTER);
    this.root.add(this.wire.group);
    this.cellFaces = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#ffd36b', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, emissive: '#ffb020', emissiveIntensity: 0.5 }));
    this.cellFaces.frustumCulled = false;
    this.wire.group.add(this.cellFaces);
    // the cube and its shadow on a wall: the light sits in front of the cube, the wall behind it
    this.an = new THREE.Group();
    this.an.position.set(0.5, 1.3, -0.62);
    this.an.rotation.y = -0.55;
    this.root.add(this.an);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshStandardMaterial({ color: '#dfe3f5', roughness: 0.9, emissive: '#30344a', emissiveIntensity: 0.5 }));
    wall.position.z = -0.16;
    this.an.add(wall);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff6c8' }));
    this.bulb.position.z = 0.13;
    this.an.add(this.bulb);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.25, depthWrite: false }));
    this.bulb.add(glow);
    this.cubeT = new Tubes(16, { glow: 0.2 });
    this.cubeB = new Beads(10);
    this.shadowT = new Tubes(16, { glow: 0 });
    this.an.add(this.cubeT.mesh, this.cubeB.mesh, this.shadowT.mesh);
    const lab = textPlane('3次元 → 2次元 の 影', { h: 0.022, color: '#b9c2f5' });
    lab.position.set(0, -0.215, -0.15);
    this.an.add(lab);
    const lab2 = textPlane('光', { h: 0.02, color: '#fff6c8' });
    lab2.position.set(0, 0.03, 0.13);
    this.an.add(lab2);
    this.R3 = identity(3);
    this.cube3 = hypercube(3);

    const autoBtn = (k, label) => ({ id: 'auto-' + k, label, on: this.auto === k });
    this.steps = [
      { title: '影は 次元を 1つ 落とす', text: '右の 立方体に 前から 光を あてると、後ろの 壁に **2次元の 影**：**正方形の 中に 正方形**。光に 近い 面は 大きく、遠い 面は 小さく 映る。どの 辺も 本当は 同じ 長さ。', enter: () => this.set('tesseract', null), actions: () => [{ id: 'reset', label: '向きを もどす' }] },
      { title: '超立方体の 影', text: '4次元の 光を W の 方向から あてると、私たちの 空間に **3次元の 影**：**立方体の 中の 立方体**。これが 目の前の 図。色は W 座標：**橙＝アナ（光に 近い）は 大きく、青＝カタ（遠い）は 小さく**。32本の 辺は 4次元では すべて 同じ 長さ。', enter: () => this.set('tesseract', null, true) },
      { title: '光の 方へ 回す', text: 'つまみ「**X → W**」を 回してみよう。右の 立方体も、横（X）が 奥行き（光の 方向）へ 回る。影の 内側の 正方形が 広がり、外側が しぼんで **入れかわる**。超立方体でも 同じ：内側の 立方体が 外へ 出て、裏返るように 見える。形は 変わらず、回っているだけ。', enter: () => this.set('tesseract', 'xw'), actions: () => [autoBtn('xw', 'X→W を 自動で'), { id: 'stop', label: '止める' }, { id: 'reset', label: '向きを もどす' }] },
      { title: '1つの 胞を 追う', text: '超立方体の **8つの 立方体（胞）** のうち 1つに 色を つけた。回すと、ゆがんだ 台形の 箱に なったり、外側の 大きな 箱に なったりする。でも 4次元の 中では いつも 同じ **正しい 立方体**。ゆがみは 影だから。', enter: () => { this.follow = 6; this.set('tesseract', 'xw'); }, actions: () => [{ id: 'next-cell', label: '別の 胞', primary: true }, autoBtn('xw', 'X→W'), autoBtn('yw', 'Y→W'), { id: 'stop', label: '止める' }] },
      { title: '6つの 回転', text: 'にぎって 回す **XY・YZ・ZX** と、つまみの **XW・YW・ZW**。4次元の 回転は この **6つの 面** で 全部。3次元の 回転には「軸」が あるが、4次元では 回転は 面で 起こり、**XY と ZW を 同時に** 回すと（二重回転）、動かない 点は 中心の 1点だけに なる。', enter: () => { this.follow = -1; this.set('tesseract', 'double'); }, actions: () => [autoBtn('double', '二重回転'), autoBtn('xw', 'XW だけ'), { id: 'stop', label: '止める' }, { id: 'reset', label: '向きを もどす' }] },
      { title: 'ほかの 形の 影', text: '**正十六胞体**（4次元の 正八面体）・**正二十四胞体**・**正五胞体** の 影も 回してみよう。研究では、4次元の 図形を VR で 回して 慣れた 人は、4次元の 中の 距離や 角度を ある程度 正しく 見積もれた（Ambinder ほか 2009）。', enter: () => this.set('16cell', 'double'), actions: () => [...['tesseract', '16cell', '24cell', '5cell'].map((k) => ({ id: 'o-' + k, label: { tesseract: '超立方体', '16cell': '正十六胞体', '24cell': '正二十四胞体', '5cell': '正五胞体' }[k], on: this.obj === k })), autoBtn('double', '二重回転'), { id: 'stop', label: '止める' }] },
      { title: '5次元の 影の 影', text: '**5次元立方体**（頂点 32・辺 80）。5番目の 方向 V から 光を あてて 4次元の 影を つくり、その 影に W から 光を あてて 3次元へ。2回の 遠近法で、立方体が 4つ 入れ子に なって 見える。インターステラーの「バルク」より さらに 1つ 上の 次元。', enter: () => this.set('penteract', 'penta') },
    ];
  }

  set(obj, auto, reset = true) {
    this.obj = obj;
    this.auto = auto;
    if (reset) {
      const m = identity(4);
      rotate(m, 4, 0, 2, 0.42);
      rotate(m, 4, 1, 2, -0.32);
      this.rig.set(m);
      this.R3 = identity(3);
      rotate(this.R3, 3, 0, 2, 0.42);
      rotate(this.R3, 3, 1, 2, -0.32);
    }
    if (obj === 'penteract') {
      this.R5 = identity(5);
      rotate(this.R5, 5, 0, 2, 0.42);
      rotate(this.R5, 5, 1, 2, -0.32);
    }
    this.app.refreshPanel();
  }

  onRotate(i, j, a) {
    // X→W on the tesseract is X→(towards the light) on the cube; the light is at +z of the cube group
    if (i === 0) rotate(this.R3, 3, 0, 2, a);
    if (i === 1) rotate(this.R3, 3, 1, 2, a);
    orthonormalize(this.R3, 3);
  }

  onAction(id) {
    if (id.startsWith('auto-')) { this.auto = id.slice(5); this.app.refreshPanel(); }
    else if (id === 'stop') { this.auto = null; this.app.refreshPanel(); }
    else if (id === 'reset') this.set(this.obj, this.auto);
    else if (id === 'next-cell') this.follow = (this.follow + 1) % 8;
    else if (id.startsWith('o-')) this.set(id.slice(2), this.auto || 'double');
  }

  keys(k, dt) { this.rig.keys(k, dt); }

  update(dt) {
    this.rig.sticks(this.app, dt);
    const s = dt * 0.45;
    if (this.auto === 'xw') { this.rig.rot(0, 3, s); this.rig.turnDial(0, s); }
    if (this.auto === 'yw') { this.rig.rot(1, 3, s); this.rig.turnDial(1, s); }
    if (this.auto === 'double') { this.rig.rot(0, 1, s * 0.8); this.rig.rot(2, 3, s * 0.8); this.rig.turnDial(2, s * 0.8); }
    if (this.obj === 'penteract') this.drawPenteract(dt);
    else this.drawPolytope();
    this.drawCube();
  }

  drawPolytope() {
    const P = this.obj === 'tesseract' ? { verts: hypercube(4).verts, edges: hypercube(4).edges } : polytope(this.obj);
    const rv = P.verts.map((v) => apply(this.rig.R, 4, v));
    const cellSet = this.follow >= 0 && this.obj === 'tesseract' ? this.cellOf(this.follow) : null;
    this.wire.draw(rv, P.edges, {
      n: 4, d: D, scale: this.obj === 'tesseract' ? SCALE : SCALE * 0.85, wMax: this.obj === 'tesseract' ? 1.6 : 1.8,
      edgeColor: cellSet ? (e) => (cellSet.has(P.edges[e][0]) && cellSet.has(P.edges[e][1]) ? [1, 0.85, 0.3] : null) : null,
      edgeWidth: cellSet ? (e) => (cellSet.has(P.edges[e][0]) && cellSet.has(P.edges[e][1]) ? 1.8 : 0.8) : null,
    });
    this.cellFaces.visible = !!cellSet;
    if (cellSet) this.drawCell(rv, this.follow);
  }

  // the tesseract's cells: fix one coordinate to ±1 → 8 vertices
  cellOf(c) {
    const axis = c >> 1, sign = c & 1 ? -1 : 1;
    const set = new Set();
    hypercube(4).verts.forEach((v, i) => { if (v[axis] === sign) set.add(i); });
    return set;
  }

  drawCell(rv, c) {
    const axis = c >> 1, sign = c & 1 ? -1 : 1;
    const free = [0, 1, 2, 3].filter((k) => k !== axis);
    const verts = hypercube(4).verts;
    const idx = (a, b, cc) => verts.findIndex((v) => v[axis] === sign && v[free[0]] === a && v[free[1]] === b && v[free[2]] === cc);
    const pos = [];
    const P = rv.map((v) => project(v, 4, D).map((x, k) => (k < 3 ? x * SCALE : x)));
    const quad = (a, b, cc, d) => { for (const i of [a, b, cc, a, cc, d]) pos.push(P[i][0], P[i][1], P[i][2]); };
    for (let f = 0; f < 3; f++) for (const s of [-1, 1]) {
      const g = (u, v) => { const t = [0, 0, 0]; t[f] = s; t[(f + 1) % 3] = u; t[(f + 2) % 3] = v; return idx(t[0], t[1], t[2]); };
      quad(g(-1, -1), g(1, -1), g(1, 1), g(-1, 1));
    }
    const geo = this.cellFaces.geometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
  }

  drawPenteract(dt) {
    const C = hypercube(5);
    rotate(this.R5, 5, 0, 3, dt * 0.25);
    rotate(this.R5, 5, 1, 4, dt * 0.18);
    rotate(this.R5, 5, 2, 4, dt * 0.07);
    orthonormalize(this.R5, 5);
    const rv = C.verts.map((v) => apply(this.R5, 5, v));
    this.cellFaces.visible = false;
    this.wire.draw(rv, C.edges, { n: 5, d: 4, scale: SCALE * 0.95, wMax: 1.6 });
  }

  drawCube() {
    const C = this.cube3;
    const S = 0.05;
    const rv = C.verts.map((v) => apply(this.R3, 3, v));
    const light = new THREE.Vector3(0, 0, 0.13), wallZ = -0.16;
    const t = this.cubeT.begin(), b = this.cubeB.begin(), sh = this.shadowT.begin();
    const shadowOf = (p) => {
      const q = new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S);
      const k = (wallZ - light.z) / (q.z - light.z);
      return [light.x + (q.x - light.x) * k, light.y + (q.y - light.y) * k, wallZ + 0.002];
    };
    for (const [i, j] of C.edges) {
      const ci = wColor(rv[i][2]), cj = wColor(rv[j][2]);
      t.push([rv[i][0] * S, rv[i][1] * S, rv[i][2] * S], [rv[j][0] * S, rv[j][1] * S, rv[j][2] * S], ci, cj, 0.0022);
      sh.push(shadowOf(rv[i]), shadowOf(rv[j]), [0.12, 0.13, 0.2], [0.12, 0.13, 0.2], 0.0028);
    }
    rv.forEach((p) => b.push([p[0] * S, p[1] * S, p[2] * S], 0.005, wColor(p[2])));
    t.end(); b.end(); sh.end();
  }

  setupGuides() {
    this.stickHelp = { L: '（使わない）', R: '左右 XW・上下 YW 回転' };
    const dial = { at: () => this.rig.console.dials[0].center(), vr: 'X→W：にぎって ひねる', pc: 'X→W：円を 描いて ドラッグ', r: 0.05 };
    const obj = { at: () => this.root.localToWorld(CENTER.clone()).add(new THREE.Vector3(0.22, 0.14, 0)), vr: 'にぎって 回せる', pc: 'ドラッグで 回す', r: 0.03 };
    const an = { at: () => this.an.localToWorld(new THREE.Vector3(0, 0.2, -0.16)), label: '立方体の 影（2次元）', r: 0.03 };
    this.guides = [
      { vr: '右の 立方体と、後ろの 壁に 映る **影** を 見比べる。', pc: '右の 立方体と、壁に 映る **影** を 見比べる。', targets: [an] },
      { vr: '目の前の 超立方体を **グリップ** で にぎって 回してみる。', hand: '超立方体に 手を 近づけ、つまんで 回す。', pc: '超立方体を **ドラッグ** で 回す。', targets: [obj] },
      { vr: 'つまみ「**X → W**」を にぎって **手首を ひねる**（右スティック 左右でも）。右の 立方体も 一緒に 回る。', hand: 'つまみ「X → W」を つまんで ひねる。', pc: 'つまみ「X → W」を ドラッグ（**J / L キー**）。', targets: [dial, an] },
      { vr: '「**別の 胞**」を トリガーで 押すと、色を つける 立方体が 変わる。', pc: '「別の 胞」を クリック。', targets: [obj] },
      { vr: '立体を にぎって 回す（XY・YZ・ZX）と、つまみ（XW・YW・ZW）を ためす。', pc: 'ドラッグ（XY・YZ・ZX）と、J/L・I/K・U/O（XW・YW・ZW）。', targets: [obj, dial] },
      { vr: 'ボタンで 形を えらび、にぎって 回す・つまみを ひねる。', pc: 'ボタンで 形を えらび、ドラッグ・キーで 回す。', targets: [obj] },
      { vr: '眺める。5次元立方体は 自動で 回っている。', pc: '眺める。5次元立方体は 自動で 回っている。' },
    ];
  }

}
