// js/realms/quantum.js — Realm 02: Quantum Mechanics (Double-Slit Wave-Particle Duality, Live Observer Collapse, Entanglement, Uncertainty)
import * as THREE from 'three';
import { makeHoloLabel } from '../hud3d.js';

const WAVE_VERT = /* glsl */ `
uniform float uTime;
uniform float uObserved; // 0 = coherent interference wave, 1 = collapsed particles
uniform float uSlitSep;
varying float vAmp;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 p = position;
  // Plane sits in XZ: x in [-1.8, 1.8], z in [0, 2.3] (from slit wall toward detector)
  float x = p.x;
  float z = p.z + 0.08;
  float r1 = length(vec2(x - uSlitSep, z));
  float r2 = length(vec2(x + uSlitSep, z));
  float k = 19.0;
  float w1 = sin(k * r1 - uTime * 7.5) / sqrt(r1 + 0.25);
  float w2 = sin(k * r2 - uTime * 7.5) / sqrt(r2 + 0.25);

  // Coherent sum vs collapsed classical incoherent narrow beams
  float waveSum = (w1 + w2) * 0.16;
  float beam1 = exp(-pow((x - uSlitSep) * 4.5, 2.0)) * sin(k * z - uTime * 7.5) * 0.09;
  float beam2 = exp(-pow((x + uSlitSep) * 4.5, 2.0)) * sin(k * z - uTime * 7.5) * 0.09;
  float y = mix(waveSum, beam1 + beam2, uObserved);

  p.y += y;
  vAmp = mix(abs(w1 + w2) * 0.55, abs(beam1 + beam2) * 5.0, uObserved);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const WAVE_FRAG = /* glsl */ `
uniform float uObserved;
varying float vAmp;
varying vec2 vUv;

void main() {
  vec3 waveCol = mix(vec3(0.0, 0.35, 0.18), vec3(0.0, 1.0, 0.72), clamp(vAmp, 0.0, 1.0));
  vec3 partCol = mix(vec3(0.35, 0.04, 0.08), vec3(1.0, 0.18, 0.32), clamp(vAmp, 0.0, 1.0));
  vec3 col = mix(waveCol, partCol, uObserved);

  // Crisp holographic grid lines across the wave mesh
  vec2 g = abs(fract(vUv * vec2(28.0, 20.0) - 0.5) - 0.5);
  float grid = smoothstep(0.42, 0.48, max(g.x, g.y));
  float alpha = (0.14 + clamp(vAmp, 0.0, 1.0) * 0.55 + grid * 0.22) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
  gl_FragColor = vec4(col * (1.2 + grid * 0.5), clamp(alpha, 0.0, 0.92));
}
`;

export class QuantumRealm {
  constructor(app) {
    this.app = app;
    this.id = 'quantum';
    this.shortLabel = '02 量子と観測';
    this.title = 'QUANTUM // 重ね合わせと観測崩壊';
    this.group = new THREE.Group();

    this.observed = false;
    this.obsBlend = 0; // smooth visual blend 0..1
    this.dxParam = 0.5; // Heisenberg Δx squeeze slider (0 = tight Δx -> huge Δp, 1 = wide Δx -> calm Δp)
    this.entangledState = null; // null = superposed, +1 or -1 = collapsed
    this.entangleResetTimer = 0;
    this.hitCount = 0;

    this.chamber = new THREE.Group();
    this.chamber.position.set(0.12, 0.0, -2.55);
    this.chamber.rotation.y = 0.52;
    this.group.add(this.chamber);

    this._buildDoubleSlit();
    this._buildDetectorWall();
    this._buildQuantumParticles();
    this._buildObserverEye();
    this._buildEntangledPair();
    this._buildUncertaintyWidget();
    this._seedInitialHits();
  }

  _buildDoubleSlit() {
    // Emitter cannon at local z = +1.15
    this.emitter = new THREE.Group();
    this.emitter.position.set(0, 1.22, 1.15);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.13, 0.34, 16),
      new THREE.MeshBasicMaterial({ color: '#00ff55', wireframe: true })
    );
    body.rotation.x = Math.PI / 2;
    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ccffdd' })
    );
    muzzle.position.z = -0.17;
    this.emitter.add(body, muzzle);
    this.chamber.add(this.emitter);

    // Sleek translucent holographic double-slit barrier at local z = +0.35
    const barrierZ = 0.35;
    const wallMat = new THREE.MeshBasicMaterial({
      color: '#04381e',
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#00ff55', wireframe: true, transparent: true, opacity: 0.55 });

    const panels = [
      { x: -0.92, w: 1.1 },
      { x: 0.0, w: 0.38 },
      { x: 0.92, w: 1.1 },
    ];
    for (const p of panels) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.85, 0.04), wallMat);
      m.position.set(p.x, 1.22, barrierZ);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.85, 0.044), edgeMat);
      wire.position.copy(m.position);
      this.chamber.add(m, wire);
    }

    // Glowing slit frames
    this.slitGlows = [];
    for (const sx of [-0.28, 0.28]) {
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.78, 0.06),
        new THREE.MeshBasicMaterial({ color: '#00ffd5', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending })
      );
      g.position.set(sx, 1.22, barrierZ);
      this.slitGlows.push(g);
      this.chamber.add(g);
    }

    // 3D Live Probability Wave Interference Surface from local z = +0.35 to z = -1.75 (unobstructed table height!)
    const wg = new THREE.PlaneGeometry(3.1, 2.1, 76, 52);
    wg.rotateX(-Math.PI / 2);
    wg.translate(0, 0, 1.05);
    this.waveUniforms = {
      uTime: { value: 0 },
      uObserved: { value: 0 },
      uSlitSep: { value: 0.28 },
    };
    this.waveMesh = new THREE.Mesh(
      wg,
      new THREE.ShaderMaterial({
        vertexShader: WAVE_VERT,
        fragmentShader: WAVE_FRAG,
        uniforms: this.waveUniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.waveMesh.position.set(0, 1.18, 0.35);
    this.waveMesh.scale.z = -1;
    this.chamber.add(this.waveMesh);
  }

  _buildDetectorWall() {
    this.detCanvas = document.createElement('canvas');
    this.detCanvas.width = 512;
    this.detCanvas.height = 256;
    this.detCtx = this.detCanvas.getContext('2d');
    this.detTex = new THREE.CanvasTexture(this.detCanvas);
    this.detTex.colorSpace = THREE.SRGBColorSpace;
    this.clearDetector();

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 1.48),
      new THREE.MeshBasicMaterial({ map: this.detTex, transparent: true, side: THREE.DoubleSide })
    );
    screen.position.set(0, 1.52, -1.75);
    this.chamber.add(screen);

    this.detLabel = makeHoloLabel('検出スクリーン：波の干渉縞（非観測）', {
      w: 1.55, h: 0.22, color: '#00ff55', fontSize: 34,
    });
    this.detLabel.position.set(0, 2.42, -1.72);
    this.chamber.add(this.detLabel);
  }

  _seedInitialHits() {
    for (let i = 0; i < 65; i++) {
      this._recordDetectorHit(this._sampleQuantumX(this.observed), this.observed);
    }
  }

  clearDetector() {
    const c = this.detCtx;
    c.fillStyle = 'rgba(1, 10, 5, 0.94)';
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = 'rgba(0, 255, 85, 0.45)';
    c.lineWidth = 4;
    c.strokeRect(2, 2, 508, 252);
    // Faint vertical reference lines
    c.strokeStyle = 'rgba(0, 255, 85, 0.12)';
    c.lineWidth = 1;
    for (let x = 64; x < 512; x += 64) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke();
    }
    this.hitCount = 0;
    this.detTex.needsUpdate = true;
  }

  // Sample a realistic quantum hit x in [-1, 1] using rejection sampling of |ψ|²
  _sampleQuantumX(observed) {
    for (let tries = 0; tries < 40; tries++) {
      const x = (Math.random() * 2 - 1) * 0.95;
      let prob;
      if (observed) {
        // Two classical single-slit Gaussian bands at x = ±0.19
        const g1 = Math.exp(-Math.pow((x - 0.19) / 0.12, 2));
        const g2 = Math.exp(-Math.pow((x + 0.19) / 0.12, 2));
        prob = Math.max(g1, g2);
      } else {
        // Double-slit interference: cos²(k*x) * single-slit envelope
        const env = Math.exp(-Math.pow(x / 0.62, 2));
        const fringe = Math.pow(Math.cos(x * 13.5), 2);
        prob = env * fringe;
      }
      if (Math.random() < prob) return x;
    }
    return 0;
  }

  _recordDetectorHit(xNorm, observed) {
    const c = this.detCtx;
    const px = 256 + xNorm * 235;
    const py = 128 + (Math.random() - 0.5) * 190 * (0.4 + Math.random() * 0.6);
    const col = observed ? 'rgba(255, 45, 75, 0.85)' : 'rgba(0, 255, 130, 0.85)';
    const glow = observed ? 'rgba(255, 30, 66, 0.22)' : 'rgba(0, 255, 85, 0.22)';
    c.fillStyle = glow;
    c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = col;
    c.beginPath(); c.arc(px, py, 3.2, 0, Math.PI * 2); c.fill();
    this.hitCount++;
    this.detTex.needsUpdate = true;
  }

  _buildQuantumParticles() {
    this.quanta = [];
    const geo = new THREE.SphereGeometry(0.036, 10, 8);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#00ff88',
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(geo, mat);
      m.userData = {
        phase: i / 24,
        slit: i % 2 === 0 ? -0.28 : 0.28,
        targetX: 0,
        observedAtBirth: false,
      };
      this.quanta.push(m);
      this.chamber.add(m);
    }
  }

  // Crimson Red-Pill Observer Scanner Eye hovering above the slits
  _buildObserverEye() {
    this.eyeGroup = new THREE.Group();
    this.eyeGroup.position.set(0, 2.08, 0.35);
    this.chamber.add(this.eyeGroup);

    this.eyeIris = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.022, 10, 32),
      new THREE.MeshBasicMaterial({ color: '#ff1e42' })
    );
    this.eyePupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 14, 10),
      new THREE.MeshBasicMaterial({ color: '#ff6680' })
    );
    this.eyeBeam = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 0.92, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ff1e42',
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.eyeBeam.position.set(0, -0.46, 0);
    this.eyeGroup.add(this.eyeIris, this.eyePupil, this.eyeBeam);
    this.eyeGroup.visible = false;
  }

  // Interactive Entangled Qubit Pair |Ψ⁻⟩ on Left & Right
  _buildEntangledPair() {
    this.qA = new THREE.Group();
    this.qA.position.set(-1.75, 1.35, -2.0);
    this.qB = new THREE.Group();
    this.qB.position.set(1.75, 1.35, -2.0);
    this.group.add(this.qA, this.qB);

    const makeQubit = (g) => {
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.22, 1),
        new THREE.MeshBasicMaterial({ color: '#00f0ff', wireframe: true, transparent: true, opacity: 0.7 })
      );
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 12),
        new THREE.MeshBasicMaterial({ color: '#ffffff' })
      );
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.24, 12),
        new THREE.MeshBasicMaterial({ color: '#00ff55' })
      );
      arrow.position.y = 0.16;
      g.add(shell, core, arrow);
      g.userData = { shell, core, arrow };
    };
    makeQubit(this.qA);
    makeQubit(this.qB);

    // Shimmering entanglement link filament
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push(new THREE.Vector3(-1.75 + (3.5 * i) / 40, 1.35, -2.0));
    const lg = new THREE.BufferGeometry().setFromPoints(pts);
    this.entLine = new THREE.Line(
      lg,
      new THREE.LineBasicMaterial({ color: '#00f0ff', transparent: true, opacity: 0.65 })
    );
    this.group.add(this.entLine);

    this.entLabel = makeHoloLabel('量子もつれ |Ψ⁻⟩\n片方を観測 → 瞬間的に反対スピン確定', {
      w: 1.05, h: 0.18, color: '#00f0ff', fontSize: 24,
    });
    this.entLabel.position.set(-1.75, 1.78, -2.0);
    this.group.add(this.entLabel);
  }

  // Heisenberg Uncertainty Principle Δx · Δp >= ℏ/2 floating cloud on right
  _buildUncertaintyWidget() {
    this.uncGroup = new THREE.Group();
    this.uncGroup.position.set(1.85, 1.35, -3.2);
    this.group.add(this.uncGroup);

    const N = 120;
    const pos = new Float32Array(N * 3);
    this._uncSeeds = [];
    for (let i = 0; i < N; i++) {
      const s = {
        a: Math.random() * Math.PI * 2,
        b: (Math.random() - 0.5) * Math.PI,
        r: Math.random(),
        spd: 1 + Math.random() * 2,
      };
      this._uncSeeds.push(s);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.uncCloud = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: '#00ff88', size: 0.045, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
    );
    this.uncCage = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshBasicMaterial({ color: '#00ff55', wireframe: true, transparent: true, opacity: 0.35 })
    );
    this.uncGroup.add(this.uncCloud, this.uncCage);

    this.uncLabel = makeHoloLabel('不確定性原理\nΔx を絞ると Δp が爆発する', {
      w: 0.9, h: 0.18, color: '#00ff88', fontSize: 24,
    });
    this.uncLabel.position.set(0, 0.48, 0);
    this.uncGroup.add(this.uncLabel);
  }

  enter() {
    this.app.env.resetPhysics();
    this.app.env.state.rainOpacity = 0.55;
    this.app.audio.setAtmosphere({ baseFreq: 65.4, cutoff: 260, shimmer: 0.25, shimmerFreq: 660 });
  }

  exit() {}

  toggleObserve() {
    this.observed = !this.observed;
    this.clearDetector();
    this._seedInitialHits();
    this.app.audio.quantumCollapse(this.observed);
    this.detLabel.userData.updateText(
      this.observed
        ? '検出スクリーン：2本の粒子帯（観測で波が崩壊！）'
        : '検出スクリーン：波の干渉縞（両スリットを同時通過）',
      this.observed ? '#ff2a4b' : '#00ff55'
    );
  }

  measureEntanglement() {
    this.entangledState = Math.random() < 0.5 ? 1 : -1;
    this.entangleResetTimer = 4.0;
    this.app.audio.quantumCollapse(true);
    this.entLabel.userData.updateText(
      this.entangledState > 0 ? '観測完了！ 左: ↑ SPIN UP  /  右: ↓ SPIN DOWN' : '観測完了！ 左: ↓ SPIN DOWN  /  右: ↑ SPIN UP',
      '#ff2a4b'
    );
  }

  setSlider(v) {
    this.dxParam = THREE.MathUtils.clamp(v, 0.05, 1.0);
  }

  onAction(id) {
    if (id === 'act:observe') this.toggleObserve();
    else if (id === 'act:entangle') this.measureEntanglement();
    else if (id === 'act:clear') { this.clearDetector(); this.app.audio.click(520); }
  }

  getUIState() {
    const dx = this.dxParam;
    const dp = 0.15 / Math.max(0.08, dx);
    return {
      telemetry: `状態: ${this.observed ? '粒子に収縮 (COLLAPSED)' : '波の重ね合わせ |ψ₁+ψ₂⟩'}  |  検出: ${this.hitCount}個  |  Δx=${dx.toFixed(2)} · Δp=${dp.toFixed(2)}`,
      insight: this.observed
        ? '【観測崩壊】どちらのスリットを通ったか見た瞬間、干渉縞が消え「ただの粒」になる！'
        : '【二重スリット】見ていない間、1つの電子は波として両方のスリットを通り自分と干渉する。',
      slider: {
        label: '位置の絞り (Δx ↔ Δp)',
        value: this.dxParam,
        readout: `Δp ${dp.toFixed(1)}x`,
      },
      actions: [
        { id: 'act:observe', label: this.observed ? '👁 観測 OFF (波へ)' : '👁 観測する (崩壊!)', hot: true, active: this.observed },
        { id: 'act:entangle', label: '⚡ 量子もつれ観測', active: this.entangledState !== null },
        { id: 'act:clear', label: 'スクリーン消去' },
      ],
    };
  }

  update(dt, t, input) {
    // Thumbstick adjusts Heisenberg Δx
    const stickY = (input.R.valid ? -input.R.axes[1] : 0) + (input.L.valid ? -input.L.axes[1] : 0);
    if (Math.abs(stickY) > 0.12) {
      this.dxParam = THREE.MathUtils.clamp(this.dxParam + stickY * dt * 0.5, 0.05, 1.0);
    }

    // Direct VR hand touch on entangled qubits collapses them!
    for (const h of [input.L, input.R]) {
      if (!h.valid) continue;
      if (h.pos.distanceTo(this.qA.position) < 0.32 || h.pos.distanceTo(this.qB.position) < 0.32) {
        if (this.entangledState === null) {
          this.measureEntanglement();
          h.haptic(0.65, 50);
        }
      }
      // Trigger while aiming away from HUD toggles observer eye
      if (h.triggerDown && !this.app.lastHudHit) {
        this.toggleObserve();
        h.haptic(0.5, 40);
      }
    }

    // Smooth blend
    this.obsBlend = THREE.MathUtils.lerp(this.obsBlend, this.observed ? 1 : 0, Math.min(1, dt * 8));
    this.waveUniforms.uTime.value = t;
    this.waveUniforms.uObserved.value = this.obsBlend;

    // Matrix rain reacts: ghost superposition when unobserved, crisp when observed
    this.app.env.state.quantumGhost = 1.0 - this.obsBlend;
    this.app.env.state.tint.set(this.observed ? '#ff3355' : '#00ff55');

    // Observer Eye visual
    this.eyeGroup.visible = this.observed;
    if (this.observed) {
      this.eyeIris.rotation.z = t * 2.2;
      this.eyeBeam.material.opacity = 0.22 + Math.sin(t * 14) * 0.06;
    }
    this.slitGlows.forEach((g) => {
      g.material.color.set(this.observed ? '#ff1e42' : '#00ffd5');
      g.material.opacity = this.observed ? 0.45 : 0.25 + Math.sin(t * 5) * 0.1;
    });

    // Quantum particles flying from emitter -> slits -> detector
    for (const m of this.quanta) {
      const u = m.userData;
      u.phase += dt * 0.72;
      if (u.phase >= 1.0) {
        this._recordDetectorHit(u.targetX, u.observedAtBirth);
        u.phase = 0;
        u.slit = Math.random() < 0.5 ? -0.28 : 0.28;
        u.observedAtBirth = this.observed;
        u.targetX = this._sampleQuantumX(this.observed);
      }
      const p = u.phase;
      if (p < 0.3) {
        // Emitter to slits
        const k = p / 0.3;
        m.position.set(
          THREE.MathUtils.lerp(0, u.observedAtBirth ? u.slit : 0, k),
          1.22 + Math.sin(k * Math.PI) * 0.04,
          THREE.MathUtils.lerp(1.05, 0.35, k)
        );
        m.scale.setScalar(u.observedAtBirth ? 1.0 : 1.35);
      } else {
        // Slits to detector
        const k = (p - 0.3) / 0.7;
        const startX = u.observedAtBirth ? u.slit : 0;
        const endX = u.targetX * 1.48;
        const spread = u.observedAtBirth ? 0 : Math.sin(k * Math.PI) * Math.sin(t * 12 + u.phase * 20) * 0.2;
        m.position.set(
          THREE.MathUtils.lerp(startX, endX, k) + spread,
          1.22 + (u.observedAtBirth ? 0 : Math.sin(k * Math.PI * 3) * 0.08),
          THREE.MathUtils.lerp(0.35, -1.72, k)
        );
        m.scale.setScalar(u.observedAtBirth ? 0.95 : 0.65 + Math.sin(k * Math.PI) * 0.8);
      }
      m.material.color.set(u.observedAtBirth ? '#ff2a4b' : '#00ffaa');
      m.material.opacity = u.observedAtBirth ? 0.95 : 0.5;
    }

    // Entangled Qubits animation
    if (this.entangledState !== null) {
      this.entangleResetTimer -= dt;
      if (this.entangleResetTimer <= 0) {
        this.entangledState = null;
        this.entLabel.userData.updateText('量子もつれ |Ψ⁻⟩\n片方を観測 → 瞬間的に反対スピン確定', '#00f0ff');
      }
    }
    const qSpin = this.entangledState;
    for (const [grp, sign] of [[this.qA, 1], [this.qB, -1]]) {
      const { shell, arrow } = grp.userData;
      if (qSpin === null) {
        shell.rotation.y = t * 2.5 * sign;
        shell.rotation.x = t * 1.7;
        shell.material.color.set('#00f0ff');
        arrow.rotation.z = Math.sin(t * 9) * Math.PI;
        arrow.position.y = Math.cos(t * 9) * 0.16;
        arrow.material.color.set('#00ff88');
      } else {
        const up = qSpin * sign > 0;
        shell.rotation.y = t * 0.6;
        shell.material.color.set(up ? '#00f0ff' : '#ff1e42');
        arrow.rotation.z = up ? 0 : Math.PI;
        arrow.position.y = up ? 0.16 : -0.16;
        arrow.material.color.set(up ? '#00f0ff' : '#ff1e42');
      }
    }
    const ePos = this.entLine.geometry.attributes.position.array;
    for (let i = 0; i <= 40; i++) {
      const f = i / 40;
      const amp = qSpin === null ? 0.12 : 0.02;
      ePos[i * 3 + 1] = 1.35 + Math.sin(f * Math.PI) * Math.sin(f * 18 - t * 10) * amp;
    }
    this.entLine.geometry.attributes.position.needsUpdate = true;
    this.entLine.material.color.set(qSpin === null ? '#00f0ff' : '#ff2a4b');

    // Heisenberg Uncertainty Cloud (tight Δx => violent high-speed Δp momentum scatter!)
    const dx = this.dxParam;
    const dp = 0.25 / Math.max(0.08, dx);
    this.uncCage.scale.setScalar(0.35 + dx * 1.3);
    const uArr = this.uncCloud.geometry.attributes.position.array;
    for (let i = 0; i < this._uncSeeds.length; i++) {
      const s = this._uncSeeds[i];
      const ang = s.a + t * s.spd * dp * 1.4;
      const rad = (0.06 + s.r * 0.28) * (0.35 + dx * 1.2) + Math.sin(t * dp * 4 + i) * 0.04 * dp;
      uArr[i * 3] = Math.cos(ang) * Math.cos(s.b) * rad;
      uArr[i * 3 + 1] = Math.sin(s.b) * rad + Math.sin(t * dp * 3 + i) * 0.03 * dp;
      uArr[i * 3 + 2] = Math.sin(ang) * Math.cos(s.b) * rad;
    }
    this.uncCloud.geometry.attributes.position.needsUpdate = true;
    this.uncCloud.material.color.set(dp > 1.8 ? '#ff2a4b' : '#00ff88');
  }
}
