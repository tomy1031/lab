// js/realms/dimensions.js — Realm 04: 4D Minkowski Spacetime Light Cones, 4D/5D Hypercube Rotation, and 10D Planck-Scale Calabi-Yau Extra Dimensions
import * as THREE from 'three';
import { makeHoloLabel } from '../hud3d.js';

// Generate n-dimensional hypercube vertices and edges (n=4 -> 16v/32e, n=5 -> 32v/80e)
function buildHypercubeData(dim) {
  const nVerts = 1 << dim;
  const verts = [];
  for (let i = 0; i < nVerts; i++) {
    const v = [];
    for (let d = 0; d < dim; d++) v.push((i & (1 << d)) ? 1 : -1);
    verts.push(v);
  }
  const edges = [];
  for (let i = 0; i < nVerts; i++) {
    for (let d = 0; d < dim; d++) {
      const j = i ^ (1 << d);
      if (j > i) edges.push([i, j, d]);
    }
  }
  return { verts, edges };
}

// Rotate an nD vector in plane (a, b) by angle theta
function rotPlane(v, a, b, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const va = v[a];
  const vb = v[b];
  v[a] = va * c - vb * s;
  v[b] = va * s + vb * c;
}

// Create a Calabi-Yau quintic surface cross-section mesh: z1^n + z2^n = 1 projected from C² (4D real) to 3D
function buildCalabiYauGeometry(n = 5) {
  const segU = 16;
  const segV = 12;
  const positions = [];
  const colors = [];
  const indices = [];
  let vertOffset = 0;

  const colA = new THREE.Color('#00ff55');
  const colB = new THREE.Color('#00f0ff');
  const colC = new THREE.Color('#ff2a4b');

  // Complex k1, k2 sheets for quintic (n=5 has n² = 25 patches; use 10 representative symmetric sheets for ultra-smooth VR perf)
  const sheets = 8;
  for (let k1 = 0; k1 < n; k1++) {
    for (let k2 = 0; k2 < 2; k2++) {
      if (k1 * 2 + k2 >= sheets) continue;
      const baseOff = vertOffset;
      for (let iu = 0; iu <= segU; iu++) {
        const u = (iu / segU) * 1.4 - 0.7; // real part
        for (let iv = 0; iv <= segV; iv++) {
          const v = (iv / segV) * (Math.PI / 2); // imag part
          // cos(u + i v) and sin(u + i v)
          const cosR = Math.cos(u) * Math.cosh(v);
          const cosI = -Math.sin(u) * Math.sinh(v);
          const sinR = Math.sin(u) * Math.cosh(v);
          const sinI = Math.cos(u) * Math.sinh(v);

          const r1 = Math.pow(Math.hypot(cosR, cosI) + 1e-4, 2 / n);
          const a1 = (Math.atan2(cosI, cosR) * 2 + 2 * Math.PI * k1) / n;
          const r2 = Math.pow(Math.hypot(sinR, sinI) + 1e-4, 2 / n);
          const a2 = (Math.atan2(sinI, sinR) * 2 + 2 * Math.PI * k2) / n;

          const x1 = r1 * Math.cos(a1);
          const y1 = r1 * Math.sin(a1);
          const x2 = r2 * Math.cos(a2);
          const y2 = r2 * Math.sin(a2);

          // Project 4D real (x1, y1, x2, y2) into 3D with harmonic alpha twist
          const alpha = 0.65;
          const px = x1;
          const py = x2;
          const pz = y1 * Math.cos(alpha) + y2 * Math.sin(alpha);
          const w = -y1 * Math.sin(alpha) + y2 * Math.cos(alpha);

          positions.push(px * 0.24, py * 0.24, pz * 0.24);
          const c = colA.clone().lerp(w >= 0 ? colB : colC, Math.min(1, Math.abs(w) * 0.9));
          colors.push(c.r, c.g, c.b);
          vertOffset++;
        }
      }
      for (let iu = 0; iu < segU; iu++) {
        for (let iv = 0; iv < segV; iv++) {
          const a = baseOff + iu * (segV + 1) + iv;
          const b = a + (segV + 1);
          const c = a + 1;
          const d = b + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export class DimensionsRealm {
  constructor(app) {
    this.app = app;
    this.id = 'dimensions';
    this.shortLabel = '04 高次元時空';
    this.title = 'DIMENSIONS // 四次元時空と10次元余剰空間';
    this.group = new THREE.Group();

    // 3 seamless modes: 'minkowski' (4D Light Cone & Simultaneity), 'hypercube' (4D/5D Hyper-rotation), 'calabi' (10D Planck Zoom)
    this.mode = 'minkowski';
    this.sliderVal = 0.35; // Boost in minkowski, W-rotation speed in hypercube, Zoom scale in calabi
    this.dimN = 4; // 4D Tesseract or 5D Penteract
    this.angle4 = { xw: 0, yw: 0, zw: 0, xv: 0 };

    this._buildMinkowski();
    this._buildHypercube();
    this._buildCalabiYauField();
    this.setMode('minkowski');
  }

  // ---- Mode A: 4D Minkowski Spacetime Light Cone & Tilting Simultaneity ----
  _buildMinkowski() {
    this.minkGroup = new THREE.Group();
    this.minkGroup.position.set(0, 1.45, -2.5);
    this.group.add(this.minkGroup);

    // Future & Past 45-degree Light Cones (invariant under Lorentz boost!)
    const coneMat = new THREE.MeshBasicMaterial({
      color: '#00ff55',
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    const futureCone = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.45, 32, 8, true), coneMat);
    futureCone.position.y = 0.725;
    futureCone.rotation.x = Math.PI; // apex at origin
    const pastCone = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.45, 32, 8, true), coneMat);
    pastCone.position.y = -0.725;
    this.minkGroup.add(futureCone, pastCone);

    // Glowing translucent inner cone skin
    const skinMat = new THREE.MeshBasicMaterial({
      color: '#00ffd5',
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const fSkin = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.45, 32, 1, true), skinMat);
    fSkin.position.y = 0.725; fSkin.rotation.x = Math.PI;
    const pSkin = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.45, 32, 1, true), skinMat);
    pSkin.position.y = -0.725;
    this.minkGroup.add(fSkin, pSkin);

    // Origin "HERE & NOW" sphere
    const nowOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    this.minkGroup.add(nowOrb);

    // Tilting Simultaneity Plane ("NOW" slice — tilts toward 45° light cone as v/c increases!)
    const simGeo = new THREE.PlaneGeometry(3.2, 3.2, 14, 14);
    simGeo.rotateX(-Math.PI / 2);
    this.simPlane = new THREE.Mesh(
      simGeo,
      new THREE.MeshBasicMaterial({
        color: '#00f0ff',
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      })
    );
    this.simFill = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#00f0ff',
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.simPlane.add(this.simFill);
    this.minkGroup.add(this.simPlane);

    // Worldline axis ct' (also tilts toward 45° light cone!)
    const wlGeo = new THREE.CylinderGeometry(0.016, 0.016, 2.9, 10);
    this.worldline = new THREE.Mesh(
      wlGeo,
      new THREE.MeshBasicMaterial({ color: '#ff2a4b' })
    );
    this.minkGroup.add(this.worldline);

    // Spacetime Event Nodes (some inside light cone = causal; some outside = spacelike whose past/future flips!)
    this.events = [];
    const evPositions = [
      { p: [0.25, 0.75, 0.1], type: 'causal' },
      { p: [-0.2, -0.8, 0.15], type: 'causal' },
      { p: [1.15, 0.35, 0], type: 'spacelike' },
      { p: [-1.15, -0.35, 0], type: 'spacelike' },
      { p: [1.25, -0.25, 0.2], type: 'spacelike' },
      { p: [-1.25, 0.25, -0.2], type: 'spacelike' },
    ];
    for (const e of evPositions) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.075, 0),
        new THREE.MeshBasicMaterial({ color: e.type === 'causal' ? '#00ff55' : '#ffbb33' })
      );
      m.position.set(...e.p);
      m.userData = { base: new THREE.Vector3(...e.p), type: e.type };
      this.events.push(m);
      this.minkGroup.add(m);
    }

    const labF = makeHoloLabel('未来光円錐 FUTURE (因果の届く領域)', { w: 1.15, h: 0.14, color: '#00ff55', fontSize: 24 });
    labF.position.set(0, 1.56, 0);
    const labSim = makeHoloLabel('現在の面 (同時刻面 x\') — 速度で傾く！', { w: 1.15, h: 0.14, color: '#00f0ff', fontSize: 24 });
    labSim.position.set(1.5, 0.15, 0);
    this.simPlane.add(labSim);
    this.minkGroup.add(labF);
  }

  // ---- Mode B: 4D Tesseract & 5D Penteract Hyper-Rotation ----
  _buildHypercube() {
    this.hyperGroup = new THREE.Group();
    this.hyperGroup.position.set(0, 1.55, -2.35);
    this.group.add(this.hyperGroup);

    this.cube4 = buildHypercubeData(4);
    this.cube5 = buildHypercubeData(5);

    const maxEdges = this.cube5.edges.length; // 80
    const pos = new Float32Array(maxEdges * 6);
    const col = new Float32Array(maxEdges * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.hyperLines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 })
    );
    this.hyperGroup.add(this.hyperLines);

    // Glowing vertex orbs
    this.hyperDots = [];
    const dg = new THREE.SphereGeometry(0.036, 10, 8);
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: '#d8ffe6' }));
      this.hyperDots.push(m);
      this.hyperGroup.add(m);
    }

    this.hyperLabel = makeHoloLabel('4次元超立方体 (TESSERACT)\nW軸回転で内側と外側が裏返る', {
      w: 1.2, h: 0.18, color: '#00f0ff', fontSize: 24,
    });
    this.hyperLabel.position.set(0, 1.35, 0);
    this.hyperGroup.add(this.hyperLabel);
  }

  // ---- Mode C: 10D Planck-Scale Zoom into 6D Calabi-Yau Manifolds ----
  _buildCalabiYauField() {
    this.calabiGroup = new THREE.Group();
    this.calabiGroup.position.set(0, 1.5, -2.4);
    this.group.add(this.calabiGroup);

    // 3x3x3 Matrix spatial lattice of nodes; at macroscopic scale they look like plain 3D grid dots,
    // but zooming to 10^-35m blooms EVERY node into a glowing 6D Calabi-Yau manifold!
    const cyGeo = buildCalabiYauGeometry(5);
    const cyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    });
    const cySkinMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.cyNodes = [];
    const latticePts = [];
    const spacing = 1.05;
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        for (let iz = -1; iz <= 1; iz++) {
          const p = new THREE.Vector3(ix * spacing, iy * spacing * 0.8, iz * spacing);
          const node = new THREE.Group();
          node.position.copy(p);
          const wire = new THREE.Mesh(cyGeo, cyMat);
          const skin = new THREE.Mesh(cyGeo, cySkinMat);
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.035, 8, 8),
            new THREE.MeshBasicMaterial({ color: '#00ff55' })
          );
          node.add(wire, skin, dot);
          node.userData = { wire, skin, dot, base: p.clone(), phase: (ix * 3 + iy * 5 + iz * 7) * 0.4 };
          this.cyNodes.push(node);
          this.calabiGroup.add(node);

          // Connect neighboring 3D grid edges
          if (ix < 1) latticePts.push(p, new THREE.Vector3((ix + 1) * spacing, p.y, p.z));
          if (iy < 1) latticePts.push(p, new THREE.Vector3(p.x, (iy + 1) * spacing * 0.8, p.z));
          if (iz < 1) latticePts.push(p, new THREE.Vector3(p.x, p.y, (iz + 1) * spacing));
        }
      }
    }

    const lg = new THREE.BufferGeometry().setFromPoints(latticePts);
    this.latticeLines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ color: '#00ff55', transparent: true, opacity: 0.4 })
    );
    this.calabiGroup.add(this.latticeLines);

    // Center hero magnified Calabi-Yau label
    this.cyLabel = makeHoloLabel('空間の1点をプランク長 (10⁻³⁵m) へ拡大\n隠れた6次元「カラビ・ヤウ多様体」が出現', {
      w: 1.45, h: 0.2, color: '#00ffd5', fontSize: 24,
    });
    this.cyLabel.position.set(0, 1.35, 0);
    this.calabiGroup.add(this.cyLabel);
  }

  setMode(m) {
    this.mode = m;
    this.minkGroup.visible = m === 'minkowski';
    this.hyperGroup.visible = m === 'hypercube';
    this.calabiGroup.visible = m === 'calabi';
    if (m === 'minkowski') this.sliderVal = 0.5; // neutral boost (0.5 -> v=0)
    else if (m === 'hypercube') this.sliderVal = 0.45;
    else if (m === 'calabi') this.sliderVal = 0.78; // already zoomed into mesmerizing Calabi-Yau bloom!
    this.app.audio.click(m === 'calabi' ? 990 : m === 'hypercube' ? 740 : 520);
  }

  enter() {
    this.app.env.resetPhysics();
    this.app.env.state.rainOpacity = 0.45;
    this.app.audio.setAtmosphere({ baseFreq: 61.7, cutoff: 240, shimmer: 0.35, shimmerFreq: 587 });
  }

  exit() {}

  setSlider(v) {
    this.sliderVal = THREE.MathUtils.clamp(v, 0, 1);
  }

  onAction(id) {
    if (id === 'act:mink') this.setMode('minkowski');
    else if (id === 'act:hyper') {
      if (this.mode === 'hypercube') {
        this.dimN = this.dimN === 4 ? 5 : 4;
        this.hyperLabel.userData.updateText(
          this.dimN === 5
            ? '5次元超立方体 (PENTERACT / 32頂点・80辺)\n4Dと5Dの同時回転投影'
            : '4次元超立方体 (TESSERACT / 16頂点・32辺)\nW軸回転で内側と外側が裏返る',
          '#00f0ff'
        );
        this.app.audio.click(880);
      } else {
        this.setMode('hypercube');
      }
    } else if (id === 'act:calabi') this.setMode('calabi');
  }

  getUIState() {
    if (this.mode === 'minkowski') {
      const beta = (this.sliderVal - 0.5) * 1.68; // -0.84c .. +0.84c
      return {
        telemetry: `4Dミンコフスキー時空  |  ローレンツブースト v = ${beta >= 0 ? '+' : ''}${beta.toFixed(2)} c  |  光円錐角 = 45°(不変)`,
        insight: '速度を変えると青い「現在(同時刻面)」と赤い「世界線」がハサミのように傾く。同時は絶対ではない！',
        slider: {
          label: 'ローレンツ変換 (v/c)',
          value: this.sliderVal,
          readout: `${beta >= 0 ? '+' : ''}${beta.toFixed(2)} c`,
        },
        actions: [
          { id: 'act:mink', label: '⏳ 光円錐 (4D時空)', active: true },
          { id: 'act:hyper', label: `🧊 ${this.dimN}D超立方体` },
          { id: 'act:calabi', label: '🌀 10D余剰次元ズーム', hot: true },
        ],
      };
    }
    if (this.mode === 'hypercube') {
      return {
        telemetry: `${this.dimN}次元超立方体投影  |  頂点: ${1 << this.dimN}  |  辺: ${this.dimN === 4 ? 32 : 80}  |  高次元回転速度 ${(this.sliderVal * 2).toFixed(1)}x`,
        insight: '影を見ている3次元人の目には、4次元回転する超立方体の「内と外」が絶えず入れ替わって見える。',
        slider: {
          label: 'W軸 回転速度',
          value: this.sliderVal,
          readout: `${(this.sliderVal * 2).toFixed(1)}x`,
        },
        actions: [
          { id: 'act:mink', label: '⏳ 光円錐 (4D時空)' },
          { id: 'act:hyper', label: this.dimN === 4 ? '🧊 5Dへ切替' : '🧊 4Dへ切替', active: true, hot: true },
          { id: 'act:calabi', label: '🌀 10D余剰次元ズーム' },
        ],
      };
    }
    // Calabi-Yau 10D scale zoom
    const exp = Math.round(-this.sliderVal * 35);
    return {
      telemetry: `10次元時空 (空間3 + 時間1 + 余剰6次元)  |  空間スケール: 10^(${exp}) m`,
      insight: exp < -20
        ? '【プランク長】私たちの空間のあらゆる点に、6次元のカラビ・ヤウ多様体が極小に丸まって潜んでいる！'
        : 'ズームを進めよう：日常では点に見える3次元格子の交点が、極小世界で複雑な6次元空間へ開く。',
      slider: {
        label: '空間スケール拡大',
        value: this.sliderVal,
        readout: `10^(${exp}) m`,
      },
      actions: [
        { id: 'act:mink', label: '⏳ 光円錐 (4D時空)' },
        { id: 'act:hyper', label: `🧊 ${this.dimN}D超立方体` },
        { id: 'act:calabi', label: '🌀 10D余剰次元', active: true, hot: true },
      ],
    };
  }

  update(dt, t, input) {
    const stickY = (input.R.valid ? -input.R.axes[1] : 0) + (input.L.valid ? -input.L.axes[1] : 0);
    if (Math.abs(stickY) > 0.12) {
      this.sliderVal = THREE.MathUtils.clamp(this.sliderVal + stickY * dt * 0.45, 0, 1);
    }

    // Trigger cycles modes seamlessly in VR when not pointing at HUD
    for (const h of [input.L, input.R]) {
      if (h.valid && h.triggerDown && !this.app.lastHudHit) {
        const next = this.mode === 'minkowski' ? 'hypercube' : this.mode === 'hypercube' ? 'calabi' : 'minkowski';
        this.setMode(next);
        h.haptic(0.4, 30);
      }
    }

    if (this.mode === 'minkowski') {
      const beta = (this.sliderVal - 0.5) * 1.68; // -0.84 .. +0.84
      const tilt = Math.atan(beta); // exact Minkowski axis tilt angle!
      this.simPlane.rotation.z = tilt;
      this.worldline.rotation.z = -tilt;

      // Color spacelike events dynamically by whether they are NOW in your boosted future (cyan) or past (red)!
      for (const ev of this.events) {
        ev.rotation.y = t * 1.8;
        if (ev.userData.type === 'spacelike') {
          const p = ev.userData.base;
          // Boosted time t' = gamma * (t - beta * x)
          const tPrime = p.y - beta * p.x;
          ev.material.color.set(tPrime > 0.04 ? '#00f0ff' : tPrime < -0.04 ? '#ff2a4b' : '#ffffff');
          ev.scale.setScalar(Math.abs(tPrime) < 0.08 ? 1.45 : 1.0);
        }
      }
      this.app.env.state.tint.set('#00ff55');
    } else if (this.mode === 'hypercube') {
      const speed = 0.15 + this.sliderVal * 1.4;
      this.angle4.xw += dt * speed * 0.72;
      this.angle4.yw += dt * speed * 0.41;
      this.angle4.zw += dt * speed * 0.29;
      this.angle4.xv += dt * speed * 0.53;

      const data = this.dimN === 5 ? this.cube5 : this.cube4;
      const proj = [];
      const wVals = [];

      for (let i = 0; i < data.verts.length; i++) {
        const v = data.verts[i].slice();
        rotPlane(v, 0, 3, this.angle4.xw);
        rotPlane(v, 1, 3, this.angle4.yw);
        rotPlane(v, 2, 3, this.angle4.zw);
        if (this.dimN === 5) {
          rotPlane(v, 0, 4, this.angle4.xv);
          rotPlane(v, 3, 4, this.angle4.yw * 0.7);
        }
        // Perspective projection nD -> 3D
        let scale = 1.0;
        if (this.dimN === 5) scale *= 2.4 / (3.4 - v[4]);
        const w = v[3];
        scale *= 2.15 / (3.1 - w);
        const p3 = new THREE.Vector3(v[0] * scale * 0.62, v[1] * scale * 0.62, v[2] * scale * 0.62);
        proj.push(p3);
        wVals.push(w);
      }

      const posArr = this.hyperLines.geometry.attributes.position.array;
      const colArr = this.hyperLines.geometry.attributes.color.array;
      const cGreen = new THREE.Color('#00ff55');
      const cCyan = new THREE.Color('#00f0ff');
      const cRed = new THREE.Color('#ff2a4b');

      for (let i = 0; i < 80; i++) {
        if (i < data.edges.length) {
          const [a, b, axis] = data.edges[i];
          const pa = proj[a];
          const pb = proj[b];
          posArr[i * 6] = pa.x; posArr[i * 6 + 1] = pa.y; posArr[i * 6 + 2] = pa.z;
          posArr[i * 6 + 3] = pb.x; posArr[i * 6 + 4] = pb.y; posArr[i * 6 + 5] = pb.z;
          const ca = axis === 4 ? cRed : cGreen.clone().lerp(cCyan, THREE.MathUtils.clamp((wVals[a] + 1.2) / 2.4, 0, 1));
          const cb = axis === 4 ? cRed : cGreen.clone().lerp(cCyan, THREE.MathUtils.clamp((wVals[b] + 1.2) / 2.4, 0, 1));
          colArr[i * 6] = ca.r; colArr[i * 6 + 1] = ca.g; colArr[i * 6 + 2] = ca.b;
          colArr[i * 6 + 3] = cb.r; colArr[i * 6 + 4] = cb.g; colArr[i * 6 + 5] = cb.b;
        } else {
          posArr[i * 6] = posArr[i * 6 + 1] = posArr[i * 6 + 2] = 0;
          posArr[i * 6 + 3] = posArr[i * 6 + 4] = posArr[i * 6 + 5] = 0;
        }
      }
      this.hyperLines.geometry.attributes.position.needsUpdate = true;
      this.hyperLines.geometry.attributes.color.needsUpdate = true;

      for (let i = 0; i < 32; i++) {
        const dot = this.hyperDots[i];
        dot.visible = i < proj.length;
        if (dot.visible) {
          dot.position.copy(proj[i]);
          dot.scale.setScalar(0.7 + THREE.MathUtils.clamp((wVals[i] + 1.2) / 2.4, 0, 1) * 0.7);
        }
      }
      this.app.env.state.tint.set('#00f0ff');
    } else {
      // Calabi-Yau 10D Planck-scale bloom!
      const zoom = this.sliderVal; // 0 = macroscopic grid, 1 = Planck scale Calabi-Yau manifolds
      const bloom = THREE.MathUtils.smoothstep(zoom, 0.15, 0.95);
      this.latticeLines.material.opacity = 0.55 - bloom * 0.3;
      this.calabiGroup.rotation.y = Math.sin(t * 0.22) * 0.28;

      for (const node of this.cyNodes) {
        const isCenter = node.userData.base.lengthSq() < 0.01;
        const sc = isCenter ? (0.02 + bloom * 1.75) : (0.02 + bloom * 0.46);
        node.userData.wire.visible = bloom > 0.02;
        node.userData.skin.visible = bloom > 0.02;
        node.userData.wire.scale.setScalar(sc);
        node.userData.skin.scale.setScalar(sc);
        node.userData.dot.scale.setScalar(Math.max(0.2, 1.0 - bloom * 0.7));
        const ph = node.userData.phase;
        node.userData.wire.rotation.set(t * 0.45 + ph, t * 0.65 + ph, t * 0.3);
        node.userData.skin.rotation.copy(node.userData.wire.rotation);
      }
      this.app.env.state.tint.set('#00ff88');
    }
  }
}
