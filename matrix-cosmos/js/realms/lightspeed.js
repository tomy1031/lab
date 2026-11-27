// js/realms/lightspeed.js — Realm 01: Special Relativity (v -> c, Time Dilation, Light Clock, Length Contraction, Doppler Shift)
import * as THREE from 'three';
import { makeHoloLabel } from '../hud3d.js';

// Build a glowing Matrix analog + digital clock face
function createMatrixClock(title, accent = '#00ff55') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const draw = (sec, rate, labelColor = accent) => {
    ctx.clearRect(0, 0, 512, 512);
    // Outer ring
    ctx.fillStyle = 'rgba(1, 10, 5, 0.78)';
    ctx.beginPath();
    ctx.arc(256, 256, 236, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = labelColor;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Ticks
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      const r1 = major ? 196 : 212;
      const r2 = 226;
      ctx.beginPath();
      ctx.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
      ctx.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2);
      ctx.strokeStyle = major ? labelColor : 'rgba(0,255,85,0.35)';
      ctx.lineWidth = major ? 5 : 2;
      ctx.stroke();
    }

    // Sweeping second hand
    const ang = ((sec % 60) / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.lineTo(256 + Math.cos(ang) * 185, 256 + Math.sin(ang) * 185);
    ctx.strokeStyle = '#e8fff0';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Sub-second fast spinner
    const msAng = (sec % 1) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(256, 256, 152, -Math.PI / 2, msAng);
    ctx.strokeStyle = labelColor;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Title & Digital readout
    ctx.fillStyle = labelColor;
    ctx.font = '800 32px "JetBrains Mono", "Noto Sans JP", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 132);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 58px "JetBrains Mono", monospace';
    ctx.fillText(`${sec.toFixed(2)}s`, 256, 344);

    ctx.fillStyle = rate < 0.02 ? '#ff2a4b' : '#99ffc2';
    ctx.font = '700 28px "JetBrains Mono", monospace';
    ctx.fillText(rate < 0.005 ? 'FROZEN (0.00x)' : `RATE ${(rate * 100).toFixed(1)}%`, 256, 396);

    tex.needsUpdate = true;
  };

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.92),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.userData.draw = draw;
  draw(0, 1);
  return mesh;
}

export class LightspeedRealm {
  constructor(app) {
    this.app = app;
    this.id = 'lightspeed';
    this.shortLabel = '01 光速と時間';
    this.title = 'RELATIVITY // 光速と止まる時間';
    this.group = new THREE.Group();

    // Slider u in [0, 1] maps non-linearly to beta = v/c so high-gamma (0.9..0.9999..1.0) is luxurious to feel!
    this.u = 0.0;
    this.targetU = 0.0;
    this.photonFreeze = false;
    this.properTime = 0;
    this.externalTime = 0;
    this._lastProperTick = 0;
    this._lastExtTick = 0;

    this._buildCorridor();
    this._buildLightClock();
    this._buildClocks();
    this._buildReferencePhoton();
    this._buildVelocityCore();
  }

  // Non-linear velocity curve:
  // u = 0 -> 0c, u = 0.5 -> 0.866c (gamma=2), u = 0.85 -> 0.99c (gamma=7), u = 0.97 -> 0.9998c, u = 1.0 -> 1.0c
  getBeta() {
    if (this.photonFreeze || this.u >= 0.995) return 1.0;
    const x = THREE.MathUtils.clamp(this.u, 0, 0.994);
    // Smooth tanh-like curve into relativistic regime
    const beta = Math.tanh(x * 3.15);
    return Math.min(0.9999, beta);
  }

  getGamma(beta) {
    if (beta >= 0.99995) return Infinity;
    return 1 / Math.sqrt(Math.max(1e-9, 1 - beta * beta));
  }

  _buildCorridor() {
    this.gates = [];
    const ringGeo = new THREE.TorusGeometry(3.8, 0.028, 8, 48);
    const pillarGeo = new THREE.BoxGeometry(0.06, 5.2, 0.06);

    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        color: '#00ff55',
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.y = 2.0;
      g.add(ring);

      const pL = new THREE.Mesh(pillarGeo, mat);
      pL.position.set(-3.4, 2.6, 0);
      const pR = new THREE.Mesh(pillarGeo, mat);
      pR.position.set(3.4, 2.6, 0);
      g.add(pL, pR);

      const baseZ = -2 - i * 3.2;
      g.userData = { baseZ, mat };
      g.position.z = baseZ;
      this.gates.push(g);
      this.group.add(g);
    }

    // Relativistic tunnel warp lines (speed streaks ahead)
    const streakCount = 140;
    const pos = new Float32Array(streakCount * 6);
    for (let i = 0; i < streakCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 6.5;
      const z = -2 - Math.random() * 40;
      const x = Math.cos(a) * r;
      const y = 1.6 + Math.sin(a) * r * 0.7;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z + 2.4;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.streaksMat = new THREE.LineBasicMaterial({
      color: '#55ffff',
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    this.streaks = new THREE.LineSegments(sg, this.streaksMat);
    this.group.add(this.streaks);
  }

  // Iconic Einstein Light Clock: shows WHY time slows down as photon traces a longer diagonal path at constant c!
  _buildLightClock() {
    this.lcGroup = new THREE.Group();
    this.lcGroup.position.set(1.38, 1.52, -2.15);
    this.lcGroup.rotation.y = -0.45;
    this.group.add(this.lcGroup);

    const mirrorGeo = new THREE.BoxGeometry(0.9, 0.03, 0.28);
    const mirrorMat = new THREE.MeshBasicMaterial({ color: '#00f0ff', transparent: true, opacity: 0.85 });
    const topM = new THREE.Mesh(mirrorGeo, mirrorMat);
    topM.position.y = 0.52;
    const botM = new THREE.Mesh(mirrorGeo, mirrorMat);
    botM.position.y = -0.52;
    this.lcGroup.add(topM, botM);

    // Glowing vertical frame rails
    const frameGeo = new THREE.CylinderGeometry(0.008, 0.008, 1.04, 8);
    const frameMat = new THREE.MeshBasicMaterial({ color: '#00ff55', transparent: true, opacity: 0.35 });
    for (const sx of [-0.42, 0.42]) {
      const f = new THREE.Mesh(frameGeo, frameMat);
      f.position.x = sx;
      this.lcGroup.add(f);
    }

    // Bouncing photon sphere
    this.lcPhoton = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#00ff88', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending })
    );
    this.lcPhoton.add(halo);
    this.lcGroup.add(this.lcPhoton);

    // Dynamic diagonal zigzag light path trail
    const trailPts = new Float32Array(60 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(trailPts, 3));
    this.lcTrail = new THREE.Line(
      tg,
      new THREE.LineBasicMaterial({ color: '#00ffd5', transparent: true, opacity: 0.9 })
    );
    this.lcGroup.add(this.lcTrail);
    this.lcHistory = [];

    this.lcLabel = makeHoloLabel('光時計 LIGHT CLOCK\n光速 c は不変 → 斜め経路で時間が延びる', {
      w: 0.96, h: 0.22, color: '#00f0ff', fontSize: 28,
    });
    this.lcLabel.position.set(0, 0.72, 0);
    this.lcGroup.add(this.lcLabel);
  }

  _buildClocks() {
    // Left clock: YOUR PROPER TIME (always ticks at 1.00x — or stops external distance at c)
    this.properClock = createMatrixClock('自分の時計 (固有時 τ)', '#00f0ff');
    this.properClock.position.set(-1.35, 1.56, -2.05);
    this.properClock.rotation.y = 0.48;
    this.group.add(this.properClock);

    // Right/corridor external clocks: EXTERNAL UNIVERSE TIME (slows & freezes at v -> c!)
    this.extClock = createMatrixClock('外の世界の時計 (外部時間 t)', '#00ff55');
    this.extClock.position.set(0, 2.38, -3.4);
    this.group.add(this.extClock);
  }

  // Reference photon beam streaking past at ALWAYS speed c regardless of your velocity
  _buildReferencePhoton() {
    this.refPhoton = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.04, 1.5, 10),
      new THREE.MeshBasicMaterial({ color: '#ffbb33', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.z = 0.75;
    this.refPhoton.add(tail);
    this.refPhoton.position.set(0, 3.05, -2);
    this.group.add(this.refPhoton);
    this._refZ = 6;
  }

  // Tactile glowing Velocity Accelerator Core floating directly in front of the user
  _buildVelocityCore() {
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.set(0, 1.32, -1.55);
    this.group.add(this.coreGroup);

    this.coreOuter = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshBasicMaterial({ color: '#00ff55', wireframe: true, transparent: true, opacity: 0.65 })
    );
    this.coreInner = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshBasicMaterial({ color: '#ccffdd', transparent: true, opacity: 0.9 })
    );
    this.coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.008, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#00f0ff', transparent: true, opacity: 0.55 })
    );
    this.coreGroup.add(this.coreOuter, this.coreInner, this.coreRing);

    this.speedBanner = makeHoloLabel('v = 0.000 c\nγ = 1.00', {
      w: 0.68, h: 0.2, color: '#d8ffe6', fontSize: 38,
    });
    this.speedBanner.position.set(0, -0.34, 0);
    this.coreGroup.add(this.speedBanner);
  }

  enter() {
    this.app.env.resetPhysics();
    this.app.audio.setAtmosphere({ baseFreq: 55, cutoff: 200, shimmer: 0 });
  }

  exit() {}

  setSlider(v) {
    this.photonFreeze = v >= 0.995;
    this.targetU = THREE.MathUtils.clamp(v, 0, 1);
  }

  onAction(id) {
    if (id === 'act:photon') {
      this.photonFreeze = !this.photonFreeze;
      this.targetU = this.photonFreeze ? 1.0 : 0.0;
      this.app.audio.click(this.photonFreeze ? 1320 : 440);
    } else if (id === 'act:866') {
      this.photonFreeze = false;
      this.targetU = 0.42; // ~0.866c -> gamma = 2.0
      this.app.audio.click(660);
    } else if (id === 'act:99') {
      this.photonFreeze = false;
      this.targetU = 0.84; // ~0.99c -> gamma = 7+
      this.app.audio.click(990);
    }
  }

  getUIState() {
    const beta = this.getBeta();
    const gamma = this.getGamma(beta);
    const extRate = isFinite(gamma) ? 1 / gamma : 0;
    const isFrozen = beta >= 0.99995;

    const telemetry = isFrozen
      ? `v = 1.0000 c  |  γ = ∞  |  外部時間 = 0.0% (完全停止)  |  進行距離 L → 0`
      : `v = ${beta.toFixed(4)} c  |  γ = ${gamma.toFixed(2)}  |  外部時間の進み = ${(extRate * 100).toFixed(1)}%  |  長さ収縮 = ${(extRate * 100).toFixed(1)}%`;

    let insight = '速度を上げて光速 c へ近づけてみよう。雨と時計の流れが激変する。';
    if (isFrozen) {
      insight = '【光子の視点】光速 c では外の雨も時計も完全に静止し、宇宙の距離は 0 に縮む。';
    } else if (beta > 0.95) {
      insight = `ローレンツ因子 γ=${gamma.toFixed(1)}：前方へ青方偏移し、外の時間は ${(extRate * 100).toFixed(1)}% までスロー化する！`;
    } else if (beta > 0.6) {
      insight = '右の光時計に注目：光速 c は不変なので、斜めに進む光は往復に γ 倍の時間がかかる。';
    }

    return {
      telemetry,
      insight,
      slider: {
        label: '速度 (v / c)',
        value: this.targetU,
        readout: isFrozen ? '1.000 c' : `${beta.toFixed(3)} c`,
      },
      actions: [
        { id: 'act:866', label: '0.87c (時間1/2)', active: !isFrozen && Math.abs(beta - 0.866) < 0.05 },
        { id: 'act:99', label: '0.99c (超光速域)', active: !isFrozen && beta > 0.97 },
        { id: 'act:photon', label: isFrozen ? '⚡ 通常速度へ' : '⚡ 光速 1.0c 停止', hot: true, active: isFrozen },
      ],
    };
  }

  update(dt, t, input) {
    // VR thumbstick & desktop keyboard control of velocity
    const stickY = (input.R.valid ? -input.R.axes[1] : 0) + (input.L.valid ? -input.L.axes[1] : 0);
    if (Math.abs(stickY) > 0.12) {
      this.photonFreeze = false;
      this.targetU = THREE.MathUtils.clamp(this.targetU + stickY * dt * 0.45, 0, 1);
      if (this.targetU >= 0.995) this.photonFreeze = true;
    }
    if (!this.app.xrActive) {
      if (input.keys.has('ArrowUp')) { this.photonFreeze = false; this.targetU = Math.min(1, this.targetU + dt * 0.4); }
      if (input.keys.has('ArrowDown')) { this.photonFreeze = false; this.targetU = Math.max(0, this.targetU - dt * 0.4); }
    }
    // VR A/X or direct core pinch toggles photon freeze
    if (input.R.valid && input.R.triggerDown && !this.app.lastHudHit) {
      const d = input.R.pos.distanceTo(this.coreGroup.position);
      if (d < 0.45) this.onAction('act:photon');
    }

    this.u = THREE.MathUtils.lerp(this.u, this.targetU, Math.min(1, dt * 6));
    const beta = this.getBeta();
    const gamma = this.getGamma(beta);
    const extRate = isFinite(gamma) ? 1 / gamma : 0;

    // Drive the ENTIRE 3D Matrix Digital Rain & Floor with exact special relativity!
    const env = this.app.env.state;
    env.timeScale = extRate;
    env.doppler = Math.pow(beta, 1.6);
    env.contract = Math.max(0.11, extRate);
    env.aberration = Math.pow(beta, 2.0);
    env.rainOpacity = 0.85 + beta * 0.15;

    // Clocks update
    this.properTime += dt;
    this.externalTime += dt * extRate;

    if (Math.floor(this.properTime) !== this._lastProperTick) {
      this._lastProperTick = Math.floor(this.properTime);
      if (beta > 0.25) this.app.audio.clockTick(1, true);
    }
    if (extRate > 0.01 && Math.floor(this.externalTime) !== this._lastExtTick) {
      this._lastExtTick = Math.floor(this.externalTime);
      this.app.audio.clockTick(extRate, false);
    }

    // Audio atmosphere morphs into crystalline stillness at lightspeed
    this.app.audio.setAtmosphere({
      baseFreq: 55 + beta * 22,
      cutoff: 190 + beta * 420,
      shimmer: Math.pow(beta, 3),
      shimmerFreq: 528 + beta * 264,
    });

    // Redraw Matrix clocks ~20Hz for smooth perf
    this._clockAcc = (this._clockAcc || 0) + dt;
    if (this._clockAcc > 0.05) {
      this._clockAcc = 0;
      this.properClock.userData.draw(this.properTime, 1.0, '#00f0ff');
      const extCol = extRate < 0.02 ? '#ff2a4b' : beta > 0.7 ? '#88ffcc' : '#00ff55';
      this.extClock.userData.draw(this.externalTime, extRate, extCol);
      this.speedBanner.userData.updateText(
        beta >= 0.99995 ? 'v = 1.000 c\nTIME STOPPED' : `v = ${beta.toFixed(3)} c\nγ = ${gamma.toFixed(2)}`,
        beta >= 0.99995 ? '#ff2a4b' : '#d8ffe6'
      );
    }

    // Move & Lorentz-contract corridor gates
    const flowSpeed = beta * 14.0;
    const contractZ = Math.max(0.12, extRate);
    const gateColor = new THREE.Color('#00ff55').lerp(new THREE.Color('#66ffff'), Math.pow(beta, 1.5));
    for (const g of this.gates) {
      g.userData.baseZ += flowSpeed * dt;
      if (g.userData.baseZ > 4) g.userData.baseZ -= 16 * 3.2;
      g.position.z = g.userData.baseZ * contractZ - 1.2 * (1 - contractZ);
      g.userData.mat.color.copy(gateColor);
      g.userData.mat.opacity = 0.25 + beta * 0.45;
    }

    // Relativistic forward warp streaks
    this.streaksMat.opacity = Math.pow(beta, 2.2) * 0.72;
    this.streaks.position.z = ((t * (12 + beta * 35)) % 10);

    // Light Clock animation: vertical oscillation slows by extRate, horizontal sweep shows v*dt
    const lcCycle = (this.externalTime * 1.15) % 2.0;
    const tri = lcCycle < 1 ? lcCycle : 2 - lcCycle; // 0..1..0
    const py = -0.48 + tri * 0.96;
    const px = Math.sin(this.properTime * 1.4) * 0.34 * beta;
    this.lcPhoton.position.set(px, py, 0);

    this.lcHistory.push(new THREE.Vector3(px, py, 0));
    if (this.lcHistory.length > 60) this.lcHistory.shift();
    const arr = this.lcTrail.geometry.attributes.position.array;
    for (let i = 0; i < 60; i++) {
      const p = this.lcHistory[Math.min(i, this.lcHistory.length - 1)] || new THREE.Vector3();
      // Drift older trail points slightly back in X to draw classic diagonal sawtooth
      const age = (this.lcHistory.length - 1 - i) * 0.012 * beta;
      arr[i * 3] = THREE.MathUtils.clamp(p.x - age, -0.42, 0.42);
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = 0.01;
    }
    this.lcTrail.geometry.attributes.position.needsUpdate = true;

    // Invariant reference photon ALWAYS moves at constant speed c
    this._refZ -= dt * 11.0;
    if (this._refZ < -26) this._refZ = 6;
    this.refPhoton.position.z = this._refZ;

    // Velocity Core visual feedback
    this.coreOuter.rotation.y = t * (0.4 + beta * 4.5);
    this.coreOuter.rotation.x = t * (0.25 + beta * 2.5);
    this.coreInner.rotation.z = -t * (0.8 + beta * 6.0);
    this.coreRing.rotation.x = Math.PI / 2 + Math.sin(t) * 0.25;
    this.coreRing.scale.setScalar(1 + beta * 0.35);
    this.coreOuter.material.color.set(beta >= 0.99995 ? '#ff2a4b' : beta > 0.7 ? '#00f0ff' : '#00ff55');
  }
}
