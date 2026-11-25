// js/chapters/gravity.js — 5章 重力と余剰次元. Throw a moon around a small sun with your hand. With gravity
// as it is (1/r², because force spreads over a sphere whose area grows as r²) the orbit is a closed, stable
// ellipse. Switch the law to what it would be in 4 spatial dimensions (1/r³) and no throw can make it stay:
// it falls in or flies away (Ehrenfest 1917). In 2D (1/r) the orbit is a rosette (Bertrand 1873). Then the
// brane and the bulk of Interstellar: light stays on the membrane, gravity spreads into the bulk; and why
// we have not found extra dimensions (torsion balances test 1/r² down to 52 µm).
import * as THREE from 'three';
import { Chapter, clamp } from './base.js';
import { Tubes } from '../tubes.js';
import { textPlane } from '../widgets.js';
import { FONT } from '../tubes.js';

const SUN = new THREE.Vector3(0, 1.36, -0.68);
const SUN_R = 0.05;
const MOON_R = 0.017;
const R0 = 0.3, V0 = 0.62; // a circular orbit of radius R0 has speed V0 in every law (GM chosen so)
const GM = (n) => V0 * V0 * Math.pow(R0, n - 2);
const HOLDER = new THREE.Vector3(0.24, 1.18, -0.42);
const TRAIL = 700;
const LAW = { 3: '重力 ∝ 1/r²（3次元の 空間）', 4: '重力 ∝ 1/r³（4次元の 空間）', 2: '重力 ∝ 1/r（2次元の 空間）' };

export class Gravity extends Chapter {
  constructor(app) {
    super(app, {
      id: 'gravity', title: '重力と余剰次元', tag: 'fact', sub: '4次元では 惑星は 回れない',
      desc: '月を 投げて 太陽を 回らせる。4次元の 重力（1/r³）だと 軌道が 保てない。重力だけが バルクへ。',
    });
    this.view = { pos: [0.05, 1.55, 0.35], yaw: 0, pitch: -0.18 };
    this.n = 3;
    // sun
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 40, 24), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
    this.sun.position.copy(SUN);
    this.root.add(this.sun);
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(SUN_R * 1.9, 32, 16), new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.18, depthWrite: false }));
    this.sun.add(this.halo);
    this.sunLight = new THREE.PointLight('#ffd9a0', 1.2, 3, 1.5);
    this.sun.add(this.sunLight);
    // moon
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 24, 16), new THREE.MeshStandardMaterial({ color: '#cfd8ff', roughness: 0.6, emissive: '#3a4a90', emissiveIntensity: 0.4 }));
    this.root.add(this.moon);
    const holder = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 32), new THREE.MeshBasicMaterial({ color: '#7f8cff', transparent: true, opacity: 0.7 }));
    holder.position.copy(HOLDER);
    holder.rotation.x = Math.PI / 2;
    this.root.add(holder);
    this.holderLabel = textPlane('月（にぎって 投げる）', { h: 0.022, color: '#b9c2f5' });
    this.holderLabel.position.copy(HOLDER).add(new THREE.Vector3(0, -0.045, 0));
    this.root.add(this.holderLabel);
    this.trail = new Tubes(TRAIL, { glow: 0.5, opacity: 0.9 });
    this.root.add(this.trail.mesh);
    this.arrow = new Tubes(2, { glow: 0.6 });
    this.root.add(this.arrow.mesh);
    this.lawLabel = textPlane(LAW[3], { h: 0.03, color: '#ffe3a8' });
    this.lawLabel.position.copy(SUN).add(new THREE.Vector3(0, 0.15, 0));
    this.root.add(this.lawLabel);
    // r(t) chart
    this.chartC = document.createElement('canvas');
    this.chartC.width = 512; this.chartC.height = 200;
    this.chartTex = new THREE.CanvasTexture(this.chartC);
    this.chartTex.colorSpace = THREE.SRGBColorSpace;
    this.chart = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.14), new THREE.MeshBasicMaterial({ map: this.chartTex, transparent: true, toneMapped: false }));
    this.chart.position.set(-0.52, 1.2, -0.62);
    this.chart.rotation.y = 0.6;
    this.root.add(this.chart);
    this.hist = [];
    this.flash = 0;
    this.state = 'held'; // held | flying | gone
    this.resetMoon();
    // brane and bulk
    this.brane = new THREE.Group();
    this.root.add(this.brane);
    const mem = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 40, 26), new THREE.MeshStandardMaterial({ color: '#5a7cff', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, emissive: '#2a3c99', emissiveIntensity: 0.5 }));
    mem.rotation.x = -Math.PI / 2;
    mem.position.set(0, 1.2, -0.75);
    this.brane.add(mem);
    const grid = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.1, 0.7, 11, 7)), new THREE.LineBasicMaterial({ color: '#8ea2ff', transparent: true, opacity: 0.35 }));
    grid.rotation.x = -Math.PI / 2;
    grid.position.copy(mem.position);
    this.brane.add(grid);
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.025, 20, 12), new THREE.MeshBasicMaterial({ color: '#fff2c0' }));
    star.position.set(-0.15, 1.2, -0.75);
    this.brane.add(star);
    this.star = star;
    this.lightRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#fff2a0', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.lightRing.rotation.x = -Math.PI / 2;
    this.lightRing.position.copy(star.position);
    this.brane.add(this.lightRing);
    this.gWave = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: '#c08cff', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, wireframe: true }));
    this.gWave.position.copy(star.position);
    this.brane.add(this.gWave);
    const l1 = textPlane('膜（ブレーン）＝ 私たちの 宇宙（1次元 へらして 描いた）', { h: 0.024, color: '#a9b8ff' });
    l1.position.set(0, 1.215, -0.4);
    l1.rotation.x = -Math.PI / 2.6;
    this.brane.add(l1);
    const l2 = textPlane('光：膜の 中だけを 広がる', { h: 0.026, color: '#fff2a0' });
    l2.position.set(0.3, 1.32, -0.75);
    this.brane.add(l2);
    const l3 = textPlane('重力：バルク（膜の 外）へも 広がる', { h: 0.026, color: '#d6b0ff' });
    l3.position.set(0.3, 1.5, -0.75);
    this.brane.add(l3);
    this.braneT = 0;
    this.brane.visible = false;

    this.items = [this.moonItem()];
    const laws = () => [3, 4, 2].map((n) => ({ id: 'law' + n, label: { 3: '3次元 1/r²', 4: '4次元 1/r³', 2: '2次元 1/r' }[n], on: this.n === n }));
    const launch = { id: 'circle', label: 'ほぼ 円の 速さで（98.5%）', primary: true };
    this.steps = [
      { title: 'なぜ 1/r² か', text: '重力の 強さが 距離の 2乗に 反比例する（**1/r²**）のは、力が **球面** に 広がって 薄まるから。球面の 面積は 4πr²：空間が 3次元 だから「2乗」。次元が 変われば、この 指数も 変わる。', enter: () => this.mode(3, true), actions: () => [launch, ...laws()] },
      { title: '月を 投げる', text: '月を にぎって、太陽の 横へ そっと 投げてみよう（レーザー・マウスは 月から ドラッグして 放す）。3次元の 重力では、軌道は 閉じた **だ円**。少し ずれても、その まわりを 回り続ける（**安定**）。左の グラフは 太陽からの 距離。', enter: () => this.mode(3, false), actions: () => [launch, { id: 'ellipse', label: 'だ円で 打ち出す' }, ...laws()] },
      { title: '4次元の 重力', text: '空間が 4次元なら、力は 超球面（面積 2π²r³）に 広がって **1/r³**。切り替えて 投げると、どんなに うまく 投げても **落ちるか 飛び去る**。円の 速さより 1.5% 遅いと 落ち、1.5% 速いと 逃げる。ちょうどの 速さは 刃の 上に 立つ ような もの。エーレンフェスト（1917）：惑星が 安定に 回れるのは、空間が **3次元** のときだけ。', enter: () => this.mode(4, true), actions: () => [launch, { id: 'fast', label: '1.5% 速く' }, ...laws()] },
      { title: '2次元の 重力', text: '2次元なら 力は 円周に 広がって **1/r**。月は 決して 逃げられないが、軌道は 閉じず **花びらの 模様** に なる。どんな 投げ方でも 閉じた 軌道に なる 力は、**1/r²** と **ばねの 力（∝ r）** だけ（ベルトランの 定理, 1873）。', enter: () => this.mode(2, false), actions: () => [{ id: 'ellipse', label: '打ち出す', primary: true }, ...laws()] },
      { title: 'ブレーンと バルク', tag: 'guess', text: 'インターステラーの 宇宙は、空間 4次元の「**バルク**」に うかぶ 膜（**ブレーン**）。光や 物質は 膜に 閉じこめられ、**重力だけが バルクへ 出られる**（ADD 1998・ランドール＝サンドラム 1999 の 考え）。だから 映画では、重力で 過去へ メッセージを 送る。', enter: () => this.braneMode(true), actions: () => [{ id: 'pulse', label: '光と 重力を 出す', primary: true }] },
      { title: 'なぜ 見つからないか', tag: 'fact', text: '大きな 余剰次元が あれば、短い 距離で 重力は 1/r³ に 強まる はず。ねじれ秤の 実験は **52 µm**（髪の毛の 太さ以下）まで 1/r² を 確かめた（Lee ほか 2020）。余剰次元は あっても それより 小さく 丸まっているか、強く 曲がっている。', enter: () => this.braneMode(true), extra: (c, r) => this.lawGraph(c, r), extraH: 230 },
    ];
  }

  mode(n, launch) {
    this.braneMode(false);
    this.setLaw(n);
    if (launch) this.launch(0.985);
    else if (this.state !== 'flying') this.resetMoon();
  }

  braneMode(on) {
    this.brane.visible = on;
    for (const o of [this.sun, this.moon, this.trail.mesh, this.lawLabel, this.chart, this.holderLabel]) o.visible = !on;
    this.items = on ? [] : [this.moonItem()];
    if (on) this.braneT = 0;
  }

  setLaw(n) {
    this.n = n;
    this.lawLabel.material.map.dispose();
    const t = textPlane(LAW[n], { h: 0.03, color: n === 3 ? '#ffe3a8' : n === 4 ? '#ff9ab5' : '#a8f0ff' });
    this.lawLabel.geometry.dispose();
    this.lawLabel.geometry = t.geometry;
    this.lawLabel.material = t.material;
    this.app.refreshPanel();
  }

  resetMoon() {
    this.state = 'held';
    this.pos = HOLDER.clone();
    this.vel = new THREE.Vector3();
    this.moon.position.copy(this.pos);
    this.trailPts = [];
    this.hist = [];
  }

  // launch tangentially from R0 at k × the circular speed, in a plane tilted a little towards you
  launch(k) {
    const r = new THREE.Vector3(R0, 0, 0);
    const v = new THREE.Vector3(0, 0.18, -1).normalize().multiplyScalar(V0 * k);
    this.fly(SUN.clone().add(r), v);
  }

  fly(p, v) {
    this.pos = p.clone();
    this.vel = v.clone();
    this.state = 'flying';
    this.trailPts = [];
    this.hist = [];
    this.t0 = 0;
  }

  onAction(id) {
    if (id === 'circle') this.launch(0.985);
    else if (id === 'fast') this.launch(1.015);
    else if (id === 'ellipse') this.launch(0.82);
    else if (id.startsWith('law')) { this.setLaw(Number(id.slice(3))); if (this.state === 'flying') this.launch(0.985); }
    else if (id === 'pulse') this.braneT = 0;
  }

  moonItem() {
    const item = {
      enabled: () => this.root.visible && !this.brane.visible,
      near: (p) => this.moon.getWorldPosition(new THREE.Vector3()).distanceTo(p) - MOON_R * 1.5,
      rayHit: (ray) => {
        const pt = ray.intersectSphere(new THREE.Sphere(this.moon.getWorldPosition(new THREE.Vector3()), 0.05), new THREE.Vector3());
        return pt ? { d: pt.distanceTo(ray.origin), point: pt } : null;
      },
      press: (p, hit, direct) => {
        this.state = 'held';
        this.trailPts = [];
        if (direct) item.g = { direct: true };
        else {
          // aim: drag from the moon (back in its holder); the arrow is the launch velocity
          this.resetMoon();
          this.moon.visible = true;
          this.root.updateMatrixWorld(true);
          const m = this.moon.getWorldPosition(new THREE.Vector3());
          const n = p.ray.direction.clone().negate();
          item.g = { direct: false, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, m), from: m, to: m.clone() };
        }
        return true;
      },
      drag: (p) => {
        const g = item.g;
        if (!g) return;
        if (g.direct) {
          this.pos = this.root.worldToLocal(p.pos.clone());
          this.moon.position.copy(this.pos);
        } else {
          const pt = p.ray.intersectPlane(g.plane, new THREE.Vector3());
          if (pt) g.to.copy(pt);
          const a = this.root.worldToLocal(g.from.clone()), b = this.root.worldToLocal(g.to.clone());
          const t = this.arrow.begin();
          t.push(a, b, [1, 0.85, 0.4], [1, 0.5, 0.2], 0.003, 0.006);
          t.end();
        }
      },
      release: (p) => {
        const g = item.g;
        item.g = null;
        this.arrow.begin().end();
        if (!g) return;
        let v;
        if (g.direct) {
          const wv = p.throwVelocity().multiplyScalar(0.45);
          const q = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
          v = wv.applyQuaternion(q);
          this.pos = this.root.worldToLocal(p.pos.clone());
        } else {
          const a = this.root.worldToLocal(g.from.clone()), b = this.root.worldToLocal(g.to.clone());
          v = b.sub(a).multiplyScalar(3.2);
          this.pos = a;
        }
        if (v.length() > 1.6) v.setLength(1.6);
        if (v.length() < 0.02) { this.resetMoon(); return; }
        this.fly(this.pos, v);
        this.app.sound.whoosh();
      },
    };
    return item;
  }

  update(dt, t) {
    if (this.brane.visible) return this.updateBrane(dt);
    if (this.state === 'flying') {
      const sub = 24, h = dt / sub, gm = GM(this.n);
      const acc = (p) => {
        const d = SUN.clone().sub(p);
        const r = Math.max(d.length(), 0.02);
        return d.multiplyScalar(gm / Math.pow(r, this.n));
      };
      for (let i = 0; i < sub; i++) {
        const a1 = acc(this.pos);
        this.pos.addScaledVector(this.vel, h).addScaledVector(a1, 0.5 * h * h);
        const a2 = acc(this.pos);
        this.vel.addScaledVector(a1.add(a2), 0.5 * h);
      }
      this.t0 += dt;
      const r = this.pos.distanceTo(SUN);
      this.hist.push([this.t0, r]);
      if (this.hist.length > 900) this.hist.shift();
      this.trailPts.push(this.pos.clone());
      if (this.trailPts.length > TRAIL) this.trailPts.shift();
      if (r < SUN_R + MOON_R) {
        this.state = 'gone';
        this.flash = 1;
        this.goneT = 1.6;
        this.app.sound.boom();
      } else if (r > 2.2) {
        this.state = 'gone';
        this.goneT = 0.4;
      }
      this.moon.position.copy(this.pos);
    } else if (this.state === 'gone') {
      this.moon.visible = false;
      this.goneT -= dt;
      if (this.goneT <= 0) { this.moon.visible = true; this.resetMoon(); }
    }
    if (this.state === 'held' && !this.items[0].g?.direct) this.moon.position.copy(HOLDER);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.halo.scale.setScalar(1 + this.flash * 3 + Math.sin(t * 2) * 0.05);
    this.halo.material.opacity = 0.18 + this.flash * 0.5;
    // trail
    const tr = this.trail.begin();
    const pts = this.trailPts;
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      const c = [0.45 + 0.55 * k, 0.6 + 0.3 * k, 1];
      tr.push(pts[i - 1], pts[i], c, c, 0.0016 * (0.4 + k), 0.0016 * (0.4 + k));
    }
    tr.end();
    this.chartT = (this.chartT || 0) + dt;
    if (this.chartT > 0.1) { this.chartT = 0; this.drawChart(); }
  }

  drawChart() {
    const c = this.chartC.getContext('2d');
    const W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(9,12,30,0.88)';
    c.beginPath(); c.roundRect(0, 0, W, H, 18); c.fill();
    c.fillStyle = '#b9c2f5';
    c.font = `700 24px ${FONT}`;
    c.fillText('太陽からの 距離 r（時間 →）', 16, 32);
    const x0 = 16, y0 = 46, w = W - 32, h = H - 60;
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.strokeRect(x0, y0, w, h);
    const rMax = 0.9;
    const yOf = (r) => y0 + h - (Math.min(r, rMax) / rMax) * h;
    c.setLineDash([6, 6]);
    c.strokeStyle = 'rgba(255,207,122,0.5)';
    c.beginPath(); c.moveTo(x0, yOf(R0)); c.lineTo(x0 + w, yOf(R0)); c.stroke();
    c.setLineDash([]);
    const H2 = this.hist;
    if (H2.length > 1) {
      const span = 14, tEnd = H2[H2.length - 1][0], tStart = Math.max(0, tEnd - span);
      c.strokeStyle = this.n === 3 ? '#ffe3a8' : this.n === 4 ? '#ff9ab5' : '#a8f0ff';
      c.lineWidth = 3;
      c.beginPath();
      let first = true;
      for (const [tt, r] of H2) {
        if (tt < tStart) continue;
        const x = x0 + ((tt - tStart) / span) * w;
        if (first) { c.moveTo(x, yOf(r)); first = false; } else c.lineTo(x, yOf(r));
      }
      c.stroke();
    }
    this.chartTex.needsUpdate = true;
  }

  updateBrane(dt) {
    this.braneT += dt;
    const k = (this.braneT % 3.2) / 3.2;
    if (this.braneT % 3.2 < dt) this.app.sound.ripple();
    const R = 0.02 + k * 0.6;
    this.lightRing.scale.set(R, R, 1);
    this.lightRing.material.opacity = (1 - k) * 0.9;
    this.gWave.scale.setScalar(R);
    this.gWave.material.opacity = (1 - k) * 0.35;
  }

  // log–log sketch: F·r² vs r — flat for 1/r², rising as 1/r for r below the size R of an extra dimension
  lawGraph(c, r) {
    c.save();
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.fillRect(r.x, r.y, r.w, r.h);
    const x0 = r.x + 70, y0 = r.y + 14, w = r.w - 90, h = r.h - 56;
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.strokeRect(x0, y0, w, h);
    // x: log10 r from -6 (1 µm) to -1 (10 cm)
    const X = (lg) => x0 + ((lg + 6) / 5) * w;
    const Y = (v) => y0 + h - clamp(v, 0, 1) * h;
    // excluded region: r > 52 µm tested
    c.fillStyle = 'rgba(126,224,138,0.16)';
    c.fillRect(X(Math.log10(52e-6)), y0, x0 + w - X(Math.log10(52e-6)), h);
    c.fillStyle = '#7ee08a';
    c.font = `800 20px ${FONT}`;
    c.fillText('実験で 1/r² を 確認ずみ', X(Math.log10(52e-6)) + 10, y0 + 26);
    // curves: newton (flat), and with an extra dimension of size R (rises below R)
    const curve = (Rlg, col, dash) => {
      c.strokeStyle = col; c.lineWidth = 3; c.setLineDash(dash);
      c.beginPath();
      for (let i = 0; i <= 100; i++) {
        const lg = -6 + (i / 100) * 5;
        const ratio = lg < Rlg ? Math.pow(10, Rlg - lg) : 1; // F·r² grows as R/r inside
        const v = 0.15 + Math.log10(ratio) * 0.28;
        if (i) c.lineTo(X(lg), Y(v)); else c.moveTo(X(lg), Y(v));
      }
      c.stroke();
      c.setLineDash([]);
    };
    curve(-6, '#ffe3a8', []);
    curve(-3, '#ff9ab5', [8, 6]);
    c.fillStyle = '#ffe3a8';
    c.font = `700 19px ${FONT}`;
    c.fillText('ニュートン（1/r²）', X(-2.4), Y(0.15) - 8);
    c.fillStyle = '#ff9ab5';
    c.fillText('もし 1 mm の 余剰次元が あったら', X(-5.95), Y(0.95) + 18);
    c.fillStyle = '#9aa3d6';
    c.font = `700 18px ${FONT}`;
    ['1µm', '10µm', '0.1mm', '1mm', '1cm', '10cm'].forEach((t, i) => c.fillText(t, X(-6 + i) - 18, y0 + h + 24));
    c.save();
    c.translate(r.x + 22, y0 + h / 2 + 40);
    c.rotate(-Math.PI / 2);
    c.fillText('重力 × r²', 0, 0);
    c.restore();
    c.restore();
  }

  setupGuides() {
    const moon = { at: () => this.moon.getWorldPosition(new THREE.Vector3()), vr: 'にぎって 投げる', pc: 'ドラッグして 放す', r: 0.035, when: () => this.state === 'held' && !this.brane.visible };
    const thr = {
      vr: '輪の 上の **月** に 手を 近づけ、**グリップ** で にぎり、太陽の 横へ **軽く 投げて 放す**。ボタンでも 打ち出せる。',
      hand: '月を **つまんで**、太陽の 横へ 軽く 投げて 放す。',
      pc: '月から **ドラッグ** して 矢印を 作り、**放す** と 打ち出す。ボタンでも。',
      targets: [moon],
    };
    this.guides = [
      { vr: '見るだけ。下の ボタン（トリガー）で 重力の 法則を 切り替えて 打ち出せる。', pc: '見るだけ。ボタンで 法則を 切り替えて 打ち出せる。' },
      thr, thr, thr,
      { vr: '「**光と 重力を 出す**」を トリガーで 押して、2つの 波を 見比べる。', pc: '「光と 重力を 出す」を クリック。' },
      { vr: '案内板の グラフを 見る。', pc: '案内板の グラフを 見る。' },
    ];
  }

}
