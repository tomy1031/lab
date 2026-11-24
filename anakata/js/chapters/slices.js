// js/chapters/slices.js — 3章 4次元の切り口. Now you are the flatlander: a 4D object passes through our 3D
// space along the W axis, and all you can see is its 3D cross-section. The lever is W (ana up, kata down);
// the knobs turn X, Y or Z into W. Next to it, the same event one dimension lower (a 3D solid through a
// plane) so the analogy is always in view. Faces are coloured by which cell (3D face) of the 4D object they
// are a slice of.
import * as THREE from 'three';
import { Chapter } from './base.js';
import { Rig4 } from './rig4.js';
import { Wire } from './draw4.js';
import { PolyMesh, Tubes } from '../tubes.js';
import { polytope, slice4, slice3, apply, identity, alignRotation, rotate } from '../math4.js';
import { textPlane } from '../widgets.js';

const CENTER = new THREE.Vector3(0, 1.45, -0.62);
const SCALE = 0.12; // metres per unit: the tesseract [-1,1]^4 slices to a 24 cm cube
const WMAX = 2.15;

// cell colours: for the tesseract, opposite cells share a hue (±X red, ±Y green, ±Z blue, ±W gold/teal)
const TESS_COL = [[1, 0.45, 0.42], [0.75, 0.25, 0.3], [0.45, 1, 0.55], [0.25, 0.7, 0.35], [0.45, 0.65, 1], [0.3, 0.4, 0.85], [1, 0.75, 0.3], [0.3, 0.85, 0.85]];
function cellColor(key, c) {
  if (key === 'tesseract') return TESS_COL[c];
  const h = (c * 0.618034) % 1;
  return new THREE.Color().setHSL(h, 0.7, 0.62).toArray();
}

// the 3D analogue of each 4D object (vertices, edges), sliced by a horizontal plane
const ANALOG = {
  tesseract: { name: '立方体', verts: [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]] },
  '5cell': { name: '正四面体', verts: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => p.map((x) => x * 1.15)) },
  '16cell': { name: '正八面体', verts: [[1.7, 0, 0], [-1.7, 0, 0], [0, 1.7, 0], [0, -1.7, 0], [0, 0, 1.7], [0, 0, -1.7]] },
  sphere: { name: '球' },
};
for (const a of Object.values(ANALOG)) {
  if (!a.verts) continue;
  let min = Infinity;
  const v = a.verts, d2 = (p, q) => p.reduce((s, x, k) => s + (x - q[k]) ** 2, 0);
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) min = Math.min(min, d2(v[i], v[j]));
  a.edges = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (Math.abs(d2(v[i], v[j]) - min) < 1e-6) a.edges.push([i, j]);
}

const PRESETS = {
  cell: { label: 'まっすぐ（胞から）', dir: [0, 0, 0, 1], a3: [0, 1, 0] },
  face: { label: '面から', dir: [0, 0, 1, 1], a3: [0, 1, 1] },
  edge: { label: '辺から', dir: [0, 1, 1, 1], a3: [1, 1, 0] },
  vertex: { label: '頂点から', dir: [1, 1, 1, 1], a3: [1, 1, 1] },
};
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

export class Slices extends Chapter {
  constructor(app) {
    super(app, {
      id: 'slices', title: '4次元の切り口', tag: 'math', sub: '超立方体が 通りぬける',
      desc: 'こんどは あなたが 平面人。4次元の 物体が 私たちの 空間を 通るとき、見えるのは 3次元の 切り口だけ。',
    });
    this.view = { pos: [0.02, 1.72, 0.42], yaw: 0, pitch: -0.45 };
    this.keyHelp = 'R/F：W（アナ／カタ）　J/L・I/K・U/O：XW・YW・ZW 回転';
    this.obj = 'sphere';
    this.ghost = false;
    this.rig = new Rig4(this, {
      center: CENTER,
      slider: { label: 'W', top: 'アナ +W', bottom: 'カタ −W', color: '#ffcf7a', onChange: () => { this.sweepAnim = null; } },
    });
    this.items = this.rig.items;
    this.objGroup = new THREE.Group();
    this.objGroup.position.copy(CENTER);
    this.root.add(this.objGroup);
    this.poly = new PolyMesh(800, { opacity: 0.9 });
    this.edges = new Tubes(400, { glow: 0.4 });
    this.objGroup.add(this.poly.mesh, this.edges.mesh);
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: '#ffb36b', roughness: 0.35, emissive: '#5a2a10', emissiveIntensity: 0.5 }));
    this.objGroup.add(this.sphere);
    this.ghostWire = new Wire({ maxEdges: 100, maxVerts: 30, radius: 0.0022, bead: 0.005, opacity: 0.35, glow: 0.5 });
    this.objGroup.add(this.ghostWire.group);
    // readout of W
    this.wText = null;
    // the analogue: a solid crossing a plane, one dimension lower
    this.analog = new THREE.Group();
    this.analog.position.set(0.46, 1.12, -0.6);
    this.analog.rotation.y = -0.5;
    this.root.add(this.analog);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ color: '#3a4cff', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    this.analog.add(plane);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.3, 0.3)), new THREE.LineBasicMaterial({ color: '#7f8cff' }));
    frame.rotation.x = -Math.PI / 2;
    this.analog.add(frame);
    this.aWire = new Tubes(20, { glow: 0.3, opacity: 0.6 });
    this.aCut = new PolyMesh(20, { opacity: 0.95 });
    this.aSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshStandardMaterial({ color: '#ffb36b', transparent: true, opacity: 0.3, depthWrite: false }));
    this.aDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: '#ffb040', emissive: '#ffb040', emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    this.aDisc.rotation.x = -Math.PI / 2;
    this.analog.add(this.aWire.mesh, this.aCut.mesh, this.aSphere, this.aDisc);
    this.aLabel = textPlane('3次元 → 2次元 の たとえ', { h: 0.024, color: '#b9c2f5' });
    this.aLabel.position.set(0, -0.2, 0.08);
    this.analog.add(this.aLabel);
    this.R3 = identity(3);

    const sweepBtn = { id: 'sweep', label: '自動で 通す', primary: true };
    this.steps = [
      { title: 'あなたが 平面人', text: 'こんどは あなたが 住人。4次元の 物体が 私たちの 3次元空間を 通りぬけると、見えるのは その **切り口（3次元の 立体）** だけ。左の レバーが 4番目の 座標 **W**：上が アナ（+W）、下が カタ（−W）。レバーを 上げてみよう。', enter: () => this.setObj('sphere', 'cell', 0.02), actions: () => [sweepBtn] },
      { title: '超球', text: '**超球**（4次元の 球）。W を 動かすと、何もない → **点** → ふくらむ 球 → しぼむ 球 → 消える。前の 章で 住人が 見た 円と 同じ ことが、1つ 上の 次元で 起きている。右の 小さな 図は 1つ 下の 次元での 同じ 出来事。', enter: () => this.setObj('sphere', 'cell', null, true), actions: () => [sweepBtn] },
      { title: 'まっすぐ 通す', text: '**超立方体**（テサラクト）を まっすぐ（胞から）通すと、切り口は 入ってから 出るまで ずっと 同じ **立方体**。立方体を まっすぐ 平面に 通すと、切り口が ずっと 同じ 正方形 なのと 同じ。', enter: () => this.setObj('tesseract', 'cell', null, true), actions: () => [sweepBtn] },
      { title: '頂点から 通す', text: '超立方体を **頂点から** 通す：点 → **正四面体** → 角の 欠けた 四面体 → 真ん中で **正八面体** → … → 点。立方体を 角から 平面に 通すと、三角形 → 六角形 → 三角形 に なるのと 同じ しくみ（右の 図）。', enter: () => this.setObj('tesseract', 'vertex', null, true), actions: () => [sweepBtn, { id: 'p-cell', label: '胞から' }, { id: 'p-face', label: '面から' }, { id: 'p-edge', label: '辺から' }] },
      { title: '回すと 変わる', text: 'つまみで X・Y・Z を W の 方へ 回せる（**XW・YW・ZW 回転**）。にぎって 回すと ふつうの 回転。面の 色は、超立方体の **8つの 立方体（胞）** の どれの 切り口かを 表す。向かい合う 胞は 同じ 系統の 色。', enter: () => this.setObj('tesseract', 'edge', 0.5), actions: () => [sweepBtn, { id: 'p-cell', label: '胞から' }, { id: 'p-vertex', label: '頂点から' }] },
      { title: '層の 積み重ね', text: 'W を 無視した 影（真上からの 正射影）を 重ねた。切り口は、その 影の 中の **1枚の 層**。4次元の 物体は、W の 値ごとの 3次元の 層が 積み重なった もの。ちょうど 立体が 平面の 層の 積み重ね であるように。', enter: () => { this.ghost = true; this.setObj('tesseract', 'vertex', 0.5); }, actions: () => [sweepBtn, { id: 'ghost', label: this.ghost ? '影 ON' : '影 OFF', on: this.ghost }] },
      { title: 'ほかの 正多胞体', text: '**正五胞体**（4次元の 三角すい）・**正十六胞体**・**正二十四胞体**（3次元に 仲間の いない、4次元だけの 形）も 通してみよう。正多面体は 3次元に 5種類、4次元の 正多胞体は 6種類、5次元から 先は どの 次元も 3種類だけ。', enter: () => this.setObj('24cell', 'cell', 0.5), actions: () => [sweepBtn, ...['sphere', 'tesseract', '5cell', '16cell', '24cell'].map((k) => ({ id: 'o-' + k, label: { sphere: '超球', tesseract: '超立方体', '5cell': '正五胞体', '16cell': '正十六胞体', '24cell': '正二十四胞体' }[k], on: this.obj === k })), { id: 'ghost', label: this.ghost ? '影 ON' : '影 OFF', on: this.ghost }] },
    ];
  }

  exit() {
    super.exit();
    this.ghost = false;
  }

  setObj(key, preset, w = null, sweep = false) {
    this.obj = key;
    this.preset(preset);
    if (w != null) this.rig.console.slider.set(w, false);
    if (sweep) this.startSweep();
    this.app.refreshPanel();
  }

  preset(name) {
    const p = PRESETS[name];
    const m = alignRotation(4, norm(p.dir), [0, 0, 0, 1]);
    // then turn a little in ordinary 3D so the solid shows three sides
    rotate(m, 4, 0, 2, 0.5);
    rotate(m, 4, 1, 2, -0.35);
    this.rig.set(m);
    // the analogue: hide-axis is Y; align a3 to +Y
    this.R3 = alignRotation(3, norm(p.a3), [0, 1, 0]);
    rotate(this.R3, 3, 0, 2, 0.5);
  }

  startSweep() {
    this.sweepAnim = { t: 0 };
    this.rig.console.slider.set(0, false);
  }

  onRotate(i, j, a) {
    // the analogue turns with X→W as X→Y (into its hidden axis) and Z→W as Z→Y
    if (i === 0) rotate(this.R3, 3, 0, 1, a);
    if (i === 2) rotate(this.R3, 3, 2, 1, a);
  }

  onAction(id) {
    if (id === 'sweep') this.startSweep();
    else if (id.startsWith('p-')) { this.preset(id.slice(2)); this.app.refreshPanel(); }
    else if (id.startsWith('o-')) { this.obj = id.slice(2); this.preset(this.obj === 'tesseract' ? 'vertex' : 'cell'); this.app.refreshPanel(); }
    else if (id === 'ghost') { this.ghost = !this.ghost; this.app.refreshPanel(); }
  }

  keys(k, dt) { this.rig.keys(k, dt); }

  update(dt) {
    this.rig.sticks(this.app, dt);
    const sl = this.rig.console.slider;
    if (this.sweepAnim) {
      this.sweepAnim.t += dt / 9;
      sl.set(Math.min(1, this.sweepAnim.t), false);
      if (this.sweepAnim.t >= 1) this.sweepAnim = null;
    }
    const w0 = (sl.value * 2 - 1) * WMAX;
    this.w0 = w0;
    const R = this.rig.R;
    if (this.obj === 'sphere') {
      const r2 = 4 - w0 * w0;
      this.sphere.visible = r2 > 0;
      if (r2 > 0) this.sphere.scale.setScalar(Math.max(0.004, Math.sqrt(r2) * SCALE));
      this.poly.begin().end();
      this.edges.begin().end();
      this.ghostWire.group.visible = false;
    } else {
      this.sphere.visible = false;
      const P = polytope(this.obj);
      const rv = P.verts.map((v) => apply(R, 4, v));
      const rn = P.cells.map((c) => apply(R, 4, c.n));
      const polys = slice4(P, rv, rn, w0);
      const pm = this.poly.begin(), ed = this.edges.begin();
      for (const pg of polys) {
        const col = cellColor(this.obj, pg.cell);
        const pts = pg.pts.map((p) => [p[0] * SCALE, p[1] * SCALE, p[2] * SCALE]);
        pm.polygon(pts, pg.n, col);
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          ed.push(a, b, [1, 0.95, 0.85], [1, 0.95, 0.85], 0.0018);
        }
      }
      pm.end();
      ed.end();
      this.ghostWire.group.visible = this.ghost;
      if (this.ghost) this.ghostWire.draw(rv, P.edges, { n: 4, d: 1e6, scale: SCALE, wMax: 2 });
    }
    this.updateAnalog(sl.value);
  }

  updateAnalog(v) {
    const A = ANALOG[this.obj];
    const S = 0.055;
    const y0 = (v * 2 - 1) * 2.15; // the plane is fixed; the solid moves down through it (as the 4D one does)
    const show = !!A;
    this.analog.visible = show;
    if (!show) return;
    if (this.obj === 'sphere') {
      this.aWire.begin().end();
      this.aCut.begin().end();
      this.aSphere.visible = true;
      this.aSphere.scale.setScalar(2 * S);
      this.aSphere.position.set(0, -y0 * S, 0);
      const r2 = 4 - y0 * y0;
      this.aDisc.visible = r2 > 0;
      if (r2 > 0) this.aDisc.scale.setScalar(Math.sqrt(r2) * S);
      return;
    }
    this.aSphere.visible = this.aDisc.visible = false;
    const rv = A.verts.map((p) => apply(this.R3, 3, p));
    const w = this.aWire.begin();
    for (const [a, b] of A.edges) {
      const pa = [rv[a][0] * S, (rv[a][1] - y0) * S, rv[a][2] * S], pb = [rv[b][0] * S, (rv[b][1] - y0) * S, rv[b][2] * S];
      w.push(pa, pb, [0.85, 0.88, 1], [0.85, 0.88, 1], 0.002);
    }
    w.end();
    // slice3 cuts at z = z0: feed it (x, z, y) so the hidden axis is y
    const sw = rv.map((p) => [p[0], p[2], p[1]]);
    const poly = slice3(sw, A.edges, y0);
    const c = this.aCut.begin();
    if (poly.length >= 3) c.polygon(poly.map((p) => [p[0] * S, 0.001, p[1] * S]), [0, 1, 0], [1, 0.72, 0.3]);
    c.end();
  }

  setupGuides() {
    this.stickHelp = { L: '上下で W（アナ／カタ）', R: '左右 XW・上下 YW 回転' };
    const lever = { at: () => this.rig.console.slider.knobWorld(), vr: 'W：にぎって 上下', pc: 'W：上下に ドラッグ', r: 0.04 };
    const dial = { at: () => this.rig.console.dials[0].center(), vr: 'にぎって ひねる', pc: '円を 描いて ドラッグ', r: 0.05 };
    const obj = { at: () => this.root.localToWorld(CENTER.clone()).add(new THREE.Vector3(0.2, 0.12, 0)), vr: 'にぎって 回せる', pc: 'ドラッグで 回す', r: 0.03 };
    const w = {
      vr: '左の **光る 玉（W レバー）** を **グリップ** で にぎって **上下**（左スティックの 上下でも）。「自動で 通す」は トリガーで。',
      hand: '左の 光る 玉を **つまんで 上下**。',
      pc: 'レバーの 玉を **上下に ドラッグ**（R / F キー）。「自動で 通す」も 使える。',
      targets: [lever],
    };
    const turn = {
      vr: '手前の **3つの つまみ** を にぎって **手首を ひねる**（右スティックでも）。立体を にぎると ふつうの 回転。',
      hand: 'つまみを つまんで 手首を ひねる。',
      pc: 'つまみを **円を 描くように ドラッグ**（J/L・I/K・U/O キー）。立体は ドラッグで 回る。',
      targets: [dial, obj],
    };
    const both = { vr: 'W レバーで 通し、つまみで 回す。ボタンで 形を えらぶ。', hand: 'W レバーで 通し、つまみで 回す。', pc: 'R / F で 通し、J/L・I/K・U/O で 回す。', targets: [lever, dial] };
    this.guides = [w, w, w, w, turn, both, both];
  }

}
