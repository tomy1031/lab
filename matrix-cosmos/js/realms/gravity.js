// js/realms/gravity.js — Realm 03: General Relativity (Curved 3D Matrix Spacetime, Black Hole Singularity, Gravitational Lensing, Schwarzschild Time Dilation)
import * as THREE from 'three';
import { makeHoloLabel } from '../hud3d.js';

const WELL_VERT = /* glsl */ `
uniform float uMass;
uniform float uTime;
varying float vDepth;
varying vec2 vUv;
varying float vR;

void main() {
  vUv = uv;
  vec3 p = position;
  float r = length(p.xz);
  // Flamm's paraboloid-inspired smooth gravity funnel
  float rs = 0.35 + uMass * 0.55;
  float depth = -(uMass * 2.2) / sqrt(r * r + rs * rs * 0.55);
  p.y += max(depth, -3.2);
  vDepth = depth;
  vR = r;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const WELL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uMass;
varying float vDepth;
varying vec2 vUv;
varying float vR;

void main() {
  // Crisp Matrix coordinate mesh lines
  vec2 g = abs(fract(vUv * 26.0 - 0.5) - 0.5);
  float line = smoothstep(0.42, 0.48, max(g.x, g.y));

  // Concentric gravitational potential contour rings falling inward
  float ring = smoothstep(0.08, 0.0, abs(fract(vR * 1.1 + uTime * (0.25 + uMass * 0.35)) - 0.5));

  float wellGlow = smoothstep(-0.3, -2.5, vDepth);
  vec3 baseCol = mix(vec3(0.0, 1.0, 0.38), vec3(0.0, 0.94, 1.0), wellGlow * 0.6);
  baseCol = mix(baseCol, vec3(1.0, 0.16, 0.3), smoothstep(-1.4, -2.6, vDepth));

  float edgeFade = smoothstep(4.6, 1.6, vR);
  float alpha = (line * 0.68 + ring * 0.25 + wellGlow * 0.2) * edgeFade;
  gl_FragColor = vec4(baseCol * 1.3, clamp(alpha, 0.0, 0.92));
}
`;

function makeMiniClock(label, accent = '#00ff55') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const draw = (sec, rate, col = accent) => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(1, 10, 5, 0.8)';
    ctx.beginPath();
    ctx.arc(128, 128, 114, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 5;
    ctx.stroke();

    const ang = ((sec % 10) / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.cos(ang) * 86, 128 + Math.sin(ang) * 86);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.font = '800 22px "JetBrains Mono", "Noto Sans JP", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 128, 72);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px "JetBrains Mono", monospace';
    ctx.fillText(`${(rate * 100).toFixed(0)}%`, 128, 184);
    tex.needsUpdate = true;
  };

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.userData.draw = draw;
  draw(0, 1);
  return mesh;
}

export class GravityRealm {
  constructor(app) {
    this.app = app;
    this.id = 'gravity';
    this.shortLabel = '03 重力と時空';
    this.title = 'GRAVITY // 曲がる時空とブラックホール';
    this.group = new THREE.Group();

    this.center = new THREE.Vector3(0, 1.45, -3.1);
    this.massParam = 0.62; // 0.1 .. 1.0
    this.autoLensing = true;
    this._launchTimer = 0;

    this._buildSpacetimeFabric();
    this._buildBlackHole();
    this._buildGravityClocks();
    this._buildPhotonPool();
  }

  _buildSpacetimeFabric() {
    // Suspended translucent Matrix coordinate sheet bent by gravity
    const g = new THREE.PlaneGeometry(9.0, 9.0, 84, 84);
    g.rotateX(-Math.PI / 2);
    this.wellUniforms = {
      uMass: { value: this.massParam },
      uTime: { value: 0 },
    };
    this.wellMesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        vertexShader: WELL_VERT,
        fragmentShader: WELL_FRAG,
        uniforms: this.wellUniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.wellMesh.position.set(this.center.x, this.center.y - 0.15, this.center.z);
    this.group.add(this.wellMesh);
  }

  _buildBlackHole() {
    this.bhGroup = new THREE.Group();
    this.bhGroup.position.copy(this.center);
    this.group.add(this.bhGroup);

    // Pitch-black Event Horizon sphere
    this.horizon = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 32, 24),
      new THREE.MeshBasicMaterial({ color: '#000000' })
    );
    this.bhGroup.add(this.horizon);

    // Blazing Photon Sphere / Einstein Lensing Ring (billboarded halo + equatorial accretion disk)
    this.einsteinRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.026, 12, 64),
      new THREE.MeshBasicMaterial({ color: '#00ffd5', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
    );
    this.bhGroup.add(this.einsteinRing);

    this.horizonRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.018, 12, 64),
      new THREE.MeshBasicMaterial({ color: '#ff1e42', transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending })
    );
    this.bhGroup.add(this.horizonRim);

    // Swirling Matrix accretion particles
    const N = 420;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    this._accData = [];
    for (let i = 0; i < N; i++) {
      const r = 0.56 + Math.pow(Math.random(), 1.6) * 1.45;
      const a = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 0.12 * (r / 1.2);
      this._accData.push({ r, a, y, spd: 1.8 / Math.pow(r, 1.35) });
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const hot = Math.max(0, 1 - (r - 0.55) / 1.1);
      const c = new THREE.Color('#00ff55').lerp(new THREE.Color('#ff3355'), hot * 0.85);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ag.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.accretion = new THREE.Points(
      ag,
      new THREE.PointsMaterial({
        size: 0.045,
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.accretion.rotation.x = 0.28;
    this.accretion.rotation.z = -0.14;
    this.bhGroup.add(this.accretion);

    this.bhLabel = makeHoloLabel('事象の地平線 r_s\n光すら脱出できず、時間は止まる', {
      w: 1.0, h: 0.18, color: '#ff2a4b', fontSize: 24,
    });
    this.bhLabel.position.set(0, 1.12, 0);
    this.bhGroup.add(this.bhLabel);
  }

  _buildGravityClocks() {
    // Three clocks at different radii showing real Schwarzschild time dilation sqrt(1 - rs/r)
    this.gClocks = [
      { label: '遠方 (5 r_s)', offset: new THREE.Vector3(-2.15, 0.35, 0.55), t: 0 },
      { label: '光子球 (1.5 r_s)', offset: new THREE.Vector3(-1.22, 0.15, 0.45), t: 0 },
      { label: '地平線付近', offset: new THREE.Vector3(-0.76, -0.05, 0.35), t: 0 },
    ].map((item) => {
      const mesh = makeMiniClock(item.label, '#00ff55');
      mesh.position.copy(this.center).add(item.offset);
      this.group.add(mesh);
      return { ...item, mesh };
    });
  }

  _buildPhotonPool() {
    // Up to 18 live curved geodesic light beams with glowing trails
    this.photons = [];
    const TRAIL = 36;
    for (let i = 0; i < 18; i++) {
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.036, 10, 8),
        new THREE.MeshBasicMaterial({ color: '#ffffff' })
      );
      const pts = new Float32Array(TRAIL * 3);
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const trail = new THREE.Line(
        tg,
        new THREE.LineBasicMaterial({ color: '#00ffd5', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
      );
      head.visible = trail.visible = false;
      this.group.add(head, trail);
      this.photons.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        history: [],
        age: 0,
        captured: false,
        head,
        trail,
        TRAIL,
      });
    }
  }

  launchPhoton(origin, dir, impactHint = null) {
    const p = this.photons.find((x) => !x.active) || this.photons[0];
    p.active = true;
    p.age = 0;
    p.captured = false;
    p.history.length = 0;
    if (origin && dir) {
      p.pos.copy(origin);
      p.vel.copy(dir).normalize().multiplyScalar(5.2);
    } else {
      // Launch a dramatic grazing lensing ray from the right side toward the black hole
      const b = impactHint ?? (0.72 + Math.random() * 1.15);
      const sign = Math.random() < 0.5 ? 1 : -1;
      const yOff = (Math.random() - 0.5) * 0.8;
      p.pos.set(this.center.x + 3.2, this.center.y + yOff, this.center.z + b * sign);
      p.vel.set(-5.2, -yOff * 0.18, 0);
    }
    p.head.visible = p.trail.visible = true;
    p.trail.material.color.set('#00ffd5');
    this.app.audio.photonLaunch(0.85 + Math.random() * 0.4);
  }

  launchLensingBurst() {
    // Launch a symmetric fan of 7 light rays to vividly showcase Gravitational Lensing!
    const impacts = [-1.55, -1.15, -0.82, -0.58, 0.82, 1.15, 1.55];
    impacts.forEach((b) => {
      const p = this.photons.find((x) => !x.active) || this.photons[Math.floor(Math.random() * this.photons.length)];
      p.active = true;
      p.age = 0;
      p.captured = false;
      p.history.length = 0;
      p.pos.set(this.center.x + 3.1, this.center.y + b * 0.45, this.center.z + b * 0.85);
      p.vel.set(-5.2, 0, 0);
      p.head.visible = p.trail.visible = true;
      p.trail.material.color.set('#00ff88');
    });
    this.app.audio.photonLaunch(1.1);
  }

  enter() {
    this.app.env.resetPhysics();
    this.app.env.state.gravityCenter.copy(this.center);
    this.app.env.state.rainOpacity = 0.72;
    this.app.audio.setAtmosphere({ baseFreq: 42, cutoff: 145, shimmer: 0.12, shimmerFreq: 330 });
    this.launchLensingBurst();
  }

  exit() {
    this.app.env.state.gravityStrength = 0;
  }

  setSlider(v) {
    this.massParam = THREE.MathUtils.clamp(v, 0.1, 1.0);
  }

  onAction(id) {
    if (id === 'act:burst') this.launchLensingBurst();
    else if (id === 'act:auto') {
      this.autoLensing = !this.autoLensing;
      this.app.audio.click(660);
    } else if (id === 'act:maxmass') {
      this.massParam = this.massParam > 0.9 ? 0.45 : 1.0;
      this.app.audio.click(320);
    }
  }

  getUIState() {
    const rs = 0.24 + this.massParam * 0.42;
    const nearRate = Math.sqrt(Math.max(0.01, 1 - rs / Math.max(rs * 1.04, 0.78)));
    return {
      telemetry: `質量 M = ${(this.massParam * 10).toFixed(1)} M☉  |  シュヴァルツシルト半径 r_s = ${rs.toFixed(2)}m  |  地平線付近の時間 = ${(nearRate * 100).toFixed(1)}%`,
      insight: '重い質量は時空そのものを凹ませる。光は真っ直ぐ進もうとして曲がり、重力井戸の底ほど時間は遅れる。',
      slider: {
        label: 'ブラックホール質量 M',
        value: this.massParam,
        readout: `${(this.massParam * 10).toFixed(1)} M☉`,
      },
      actions: [
        { id: 'act:burst', label: '✨ 光線バースト (重力レンズ)', hot: true },
        { id: 'act:auto', label: this.autoLensing ? '自動照射 ON' : '自動照射 OFF', active: this.autoLensing },
        { id: 'act:maxmass', label: this.massParam > 0.9 ? '質量 標準' : '超大質量化' },
      ],
    };
  }

  update(dt, t, input) {
    // Thumbstick adjusts Black Hole mass
    const stickY = (input.R.valid ? -input.R.axes[1] : 0) + (input.L.valid ? -input.L.axes[1] : 0);
    if (Math.abs(stickY) > 0.12) {
      this.massParam = THREE.MathUtils.clamp(this.massParam + stickY * dt * 0.5, 0.1, 1.0);
    }

    // VR Trigger fires a photon right along your hand's aim ray!
    for (const h of [input.L, input.R]) {
      if (h.valid && h.triggerDown && !this.app.lastHudHit) {
        this.launchPhoton(h.ray.origin, h.ray.direction);
        h.haptic(0.4, 30);
      }
    }

    const M = this.massParam;
    const rs = 0.24 + M * 0.42;

    // Bend the 3D Matrix Digital Rain and Floor into the singularity!
    this.app.env.state.gravityCenter.copy(this.center);
    this.app.env.state.gravityStrength = M * 1.25;
    this.wellUniforms.uMass.value = M;
    this.wellUniforms.uTime.value = t;

    // Scale Black Hole Event Horizon & Einstein Lensing Ring
    this.horizon.scale.setScalar(rs / 0.42);
    this.horizonRim.scale.setScalar((rs * 1.1) / 0.46);
    this.einsteinRing.scale.setScalar((rs * 1.55) / 0.62);
    this.einsteinRing.lookAt(input.head);
    this.horizonRim.lookAt(input.head);

    // Swirl accretion disk faster near event horizon
    const accArr = this.accretion.geometry.attributes.position.array;
    for (let i = 0; i < this._accData.length; i++) {
      const d = this._accData[i];
      d.a += d.spd * dt * (0.6 + M * 1.4);
      const rad = d.r * (0.65 + M * 0.55);
      accArr[i * 3] = Math.cos(d.a) * rad;
      accArr[i * 3 + 1] = d.y;
      accArr[i * 3 + 2] = Math.sin(d.a) * rad;
    }
    this.accretion.geometry.attributes.position.needsUpdate = true;

    // Periodic automatic gravitational lensing rays
    if (this.autoLensing) {
      this._launchTimer += dt;
      if (this._launchTimer > 1.15) {
        this._launchTimer = 0;
        this.launchPhoton(null, null);
      }
    }

    // Integrate photon geodesics (effective Schwarzschild GR deflection: a ~ -GM/r² * (1 + 3 L²/(r²c²)))
    const GM = 1.65 + M * 4.4;
    const subSteps = 4;
    const hdt = dt / subSteps;
    for (const p of this.photons) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age > 5.5) {
        p.active = false;
        p.head.visible = p.trail.visible = false;
        continue;
      }

      if (!p.captured) {
        for (let s = 0; s < subSteps; s++) {
          const rel = p.pos.clone().sub(this.center);
          const r = rel.length();
          if (r < rs * 1.02) {
            p.captured = true;
            p.trail.material.color.set('#ff1e42');
            break;
          }
          // Relativistic light bending acceleration stronger near photon sphere
          const invR = 1 / Math.max(0.2, r);
          const grBoost = 1.0 + (2.4 * rs) * invR;
          const acc = rel.multiplyScalar(-GM * grBoost * invR * invR * invR);
          p.vel.addScaledVector(acc, hdt);
          // Photons keep local speed constant (direction bends!)
          p.vel.normalize().multiplyScalar(5.2);
          p.pos.addScaledVector(p.vel, hdt);
        }
      }

      p.head.position.copy(p.pos);
      p.head.visible = !p.captured;
      p.history.push(p.pos.clone());
      if (p.history.length > p.TRAIL) p.history.shift();
      const arr = p.trail.geometry.attributes.position.array;
      for (let i = 0; i < p.TRAIL; i++) {
        const pt = p.history[Math.min(i, p.history.length - 1)] || p.pos;
        arr[i * 3] = pt.x; arr[i * 3 + 1] = pt.y; arr[i * 3 + 2] = pt.z;
      }
      p.trail.geometry.attributes.position.needsUpdate = true;
    }

    // Update gravitational time-dilation clocks using exact Schwarzschild factor sqrt(1 - rs/r)
    this._clkAcc = (this._clkAcc || 0) + dt;
    const redraw = this._clkAcc > 0.06;
    if (redraw) this._clkAcc = 0;

    for (const c of this.gClocks) {
      const r = Math.max(rs * 1.03, c.mesh.position.distanceTo(this.center));
      const rate = Math.sqrt(Math.max(0.005, 1 - rs / r));
      c.t += dt * rate;
      if (redraw) {
        const col = rate < 0.45 ? '#ff2a4b' : rate < 0.78 ? '#00f0ff' : '#00ff55';
        c.mesh.userData.draw(c.t, rate, col);
      }
    }
  }
}
