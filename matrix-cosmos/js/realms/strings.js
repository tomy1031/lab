// js/realms/strings.js — Realm 05: Superstring Theory (Pluckable 1D Open & Closed Strings, D-Branes, Harmonic Particle Modes, 2D Worldsheet Merge/Split)
import * as THREE from 'three';
import { makeHoloLabel } from '../hud3d.js';

const PARTICLE_MODES = [
  {
    n: 1,
    name: 'GRAVITON (重力子)',
    spin: 'Spin 2 / 閉じた弦',
    closed: true,
    color: '#00f0ff',
    desc: '閉じた輪っかの弦。Dブレーンから離れて高次元バルクへ飛び出す＝重力が弱い理由の仮説！',
  },
  {
    n: 2,
    name: 'PHOTON (光子)',
    spin: 'Spin 1 / 開いた弦',
    closed: false,
    color: '#00ff55',
    desc: '両端が私たちの3次元Dブレーンに固定された開いた弦。光の速さで振動する。',
  },
  {
    n: 3,
    name: 'ELECTRON (電子)',
    spin: 'Spin 1/2 / 物質の弦',
    closed: false,
    color: '#77ffbb',
    desc: '3次倍音の定常波。弦の「音色（振動パターン）」の違いが素粒子の質量や電荷を決める。',
  },
  {
    n: 4,
    name: 'QUARK (クォーク)',
    spin: 'Color Charge / 高張力弦',
    closed: false,
    color: '#ff2a4b',
    desc: '4次倍音の高エネルギー振動。強い力で結びつき陽子や中性子をつくる。',
  },
  {
    n: 5,
    name: 'EXOTIC RESONANCE (超対称モード)',
    spin: 'n = 5 / プランク共鳴',
    closed: true,
    color: '#ffbb33',
    desc: '高次の多重共鳴ループ。1種類の弦が宇宙のすべての粒子を奏でる。',
  },
];

export class StringsRealm {
  constructor(app) {
    this.app = app;
    this.id = 'strings';
    this.shortLabel = '05 超弦理論';
    this.title = 'SUPERSTRINGS // 宇宙を奏でる1次元の弦';
    this.group = new THREE.Group();

    this.modeIdx = 1; // start on Photon / harmonic harp, easy to switch to Graviton/Quark
    this.tensionParam = 0.25; // maps to mode 1..5
    this.worldsheetTimer = 0;

    this._buildBranes();
    this._buildHarpStrings();
    this._buildClosedGravitonLoop();
    this._buildWorldsheetInteraction();
  }

  _buildBranes() {
    // Two glowing translucent D-Brane membranes (upper & lower 3D universe sheets)
    const braneGeo = new THREE.PlaneGeometry(5.2, 3.2, 24, 16);
    braneGeo.rotateX(-Math.PI / 2);

    const makeBrane = (y, col) => {
      const g = new THREE.Group();
      g.position.set(0, y, -2.15);
      const wire = new THREE.Mesh(
        braneGeo,
        new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.28 })
      );
      const skin = new THREE.Mesh(
        braneGeo,
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      g.add(wire, skin);
      return g;
    };

    this.lowerBrane = makeBrane(0.68, '#00ff55');
    this.upperBrane = makeBrane(2.45, '#00f0ff');
    this.group.add(this.lowerBrane, this.upperBrane);

    const bLab = makeHoloLabel('D-BRANE (私たちの3次元宇宙膜) — 開いた弦は膜に縛られ、重力子(輪)は飛び出す', {
      w: 1.9, h: 0.14, color: '#00ff88', fontSize: 22,
    });
    bLab.position.set(0, 0.78, -0.75);
    this.group.add(bLab);
  }

  // 5 Giant Pluckable Open Strings arranged like a cosmic Matrix harp right in front of the user!
  _buildHarpStrings() {
    this.strings = [];
    const SEGS = 64;
    const xs = [-1.2, -0.6, 0.0, 0.6, 1.2];

    xs.forEach((x, idx) => {
      const modeNum = idx + 1;
      const pts = new Float32Array((SEGS + 1) * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));

      // Core bright line + thicker translucent glow ribbon (tube via triangle strip or parallel offset lines)
      const col = new THREE.Color(PARTICLE_MODES[idx].color);
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.98 })
      );

      // Add glowing halo mesh using dynamic Tube-like ribbon (2nd & 3rd offset lines for crisp thickness in VR!)
      const haloL = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending })
      );
      haloL.position.x = 0.012;
      const haloR = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending })
      );
      haloR.position.x = -0.012;

      // Glowing D-brane anchor beads at top & bottom
      const anchorGeo = new THREE.SphereGeometry(0.045, 12, 10);
      const anchorMat = new THREE.MeshBasicMaterial({ color: col });
      const topBead = new THREE.Mesh(anchorGeo, anchorMat);
      topBead.position.set(x, 2.45, -1.95);
      const botBead = new THREE.Mesh(anchorGeo, anchorMat);
      botBead.position.set(x, 0.68, -1.95);

      const tag = makeHoloLabel(`n=${modeNum}\n${PARTICLE_MODES[idx].name.split(' ')[0]}`, {
        w: 0.44, h: 0.14, color: PARTICLE_MODES[idx].color, fontSize: 22,
      });
      tag.position.set(x, 2.66, -1.95);

      this.group.add(line, haloL, haloR, topBead, botBead, tag);

      this.strings.push({
        idx,
        modeNum,
        x,
        z: -1.95,
        yBot: 0.68,
        yTop: 2.45,
        SEGS,
        geom: g,
        line,
        haloL,
        haloR,
        topBead,
        botBead,
        energy: 0.32, // ambient Planck zero-point oscillation!
        phase: idx * 1.1,
        cooldown: 0,
      });
    });
  }

  // Hero Closed String (Graviton Loop) floating freely and detaching from the D-Brane!
  _buildClosedGravitonLoop() {
    this.loopGroup = new THREE.Group();
    this.loopGroup.position.set(0, 1.56, -1.35);
    this.group.add(this.loopGroup);

    const N = 96;
    const pts = new Float32Array((N + 1) * 3);
    this.loopGeom = new THREE.BufferGeometry();
    this.loopGeom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.loopLine = new THREE.Line(
      this.loopGeom,
      new THREE.LineBasicMaterial({ color: '#00f0ff', transparent: true, opacity: 0.98 })
    );
    this.loopGlow = new THREE.Line(
      this.loopGeom,
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending })
    );
    this.loopGlow.scale.setScalar(1.03);
    this.loopGroup.add(this.loopLine, this.loopGlow);
    this.loopEnergy = 0.45;
    this.loopN = N;

    this.heroLabel = makeHoloLabel('閉じた弦：GRAVITON (重力子)\n手やトリガーで弾いて共鳴させよう！', {
      w: 1.05, h: 0.18, color: '#00f0ff', fontSize: 24,
    });
    this.heroLabel.position.set(0, 0.56, 0);
    this.loopGroup.add(this.heroLabel);
  }

  // 2D Worldsheet Interaction ("Pants Diagram" — two closed strings merging smoothly into one!)
  _buildWorldsheetInteraction() {
    this.wsGroup = new THREE.Group();
    this.wsGroup.position.set(0, 1.55, -2.75);
    this.wsGroup.visible = false;
    this.group.add(this.wsGroup);

    // Build two merging glowing rings + connecting translucent worldsheet cylinder ribs
    const ringGeo = new THREE.TorusGeometry(0.28, 0.014, 10, 48);
    this.wsRingA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#00ff55' }));
    this.wsRingB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#00f0ff' }));
    this.wsRingMerged = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.02, 12, 64),
      new THREE.MeshBasicMaterial({ color: '#ffbb33', transparent: true, opacity: 0.9 })
    );
    this.wsGroup.add(this.wsRingA, this.wsRingB, this.wsRingMerged);

    // Translucent 2D worldsheet ribbon rings left as time-trail
    this.wsTrail = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.008, 8, 36),
        new THREE.MeshBasicMaterial({ color: '#00ff88', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending })
      );
      this.wsTrail.push(m);
      this.wsGroup.add(m);
    }
  }

  pluck(idx, strength = 1.0) {
    const s = this.strings[idx];
    if (!s) return;
    s.energy = Math.min(1.6, s.energy + 0.9 * strength);
    this.modeIdx = idx;
    this.tensionParam = idx / 4;
    this.loopEnergy = Math.min(1.5, this.loopEnergy + 0.8 * strength);
    this._syncHeroIdentity();
    this.app.audio.pluckString(s.modeNum, strength);
  }

  _syncHeroIdentity() {
    const m = PARTICLE_MODES[this.modeIdx];
    this.loopLine.material.color.set(m.color);
    this.heroLabel.userData.updateText(`${m.name}\n${m.spin}`, m.color);
  }

  triggerWorldsheet() {
    this.worldsheetTimer = 5.5;
    this.wsGroup.visible = true;
    this.app.audio.pluckString(1, 1.0);
    setTimeout(() => this.app.audio.pluckString(3, 0.85), 140);
    setTimeout(() => this.app.audio.pluckString(5, 0.9), 280);
  }

  enter() {
    this.app.env.resetPhysics();
    this.app.env.state.rainOpacity = 0.5;
    this.app.audio.setAtmosphere({ baseFreq: 65.4, cutoff: 230, shimmer: 0.3, shimmerFreq: 523.25 });
    this._syncHeroIdentity();
    // Gentle welcoming cosmic chord
    this.pluck(1, 0.7);
  }

  exit() {}

  setSlider(v) {
    this.tensionParam = THREE.MathUtils.clamp(v, 0, 1);
    const nextIdx = Math.min(4, Math.floor(this.tensionParam * 4.99));
    if (nextIdx !== this.modeIdx) {
      this.pluck(nextIdx, 0.95);
    }
  }

  onAction(id) {
    if (id === 'act:strum') {
      // Strum all 5 superstrings in an ascending cosmic arpeggio!
      this.strings.forEach((_, i) => setTimeout(() => this.pluck(i, 0.85), i * 95));
    } else if (id === 'act:worldsheet') {
      this.triggerWorldsheet();
    } else if (id === 'act:nextmode') {
      this.pluck((this.modeIdx + 1) % 5, 1.0);
    }
  }

  getUIState() {
    const m = PARTICLE_MODES[this.modeIdx];
    return {
      telemetry: `振動モード n = ${m.n}  |  創発粒子: ${m.name}  |  ${m.spin}  |  次元 D = 10`,
      insight: m.desc,
      slider: {
        label: '共鳴モード (n = 1〜5)',
        value: this.tensionParam,
        readout: `n=${m.n} ${m.name.split(' ')[0]}`,
      },
      actions: [
        { id: 'act:strum', label: '🎵 宇宙の弦を弾く', hot: true },
        { id: 'act:nextmode', label: '粒子モード切替', active: true },
        { id: 'act:worldsheet', label: '∞ 弦の融合(世界面)', active: this.worldsheetTimer > 0 },
      ],
    };
  }

  update(dt, t, input) {
    // Thumbstick shifts harmonic mode
    const stickY = (input.R.valid ? -input.R.axes[1] : 0) + (input.L.valid ? -input.L.axes[1] : 0);
    if (Math.abs(stickY) > 0.35 && !this._stickLatch) {
      this._stickLatch = true;
      const next = THREE.MathUtils.clamp(this.modeIdx + (stickY > 0 ? 1 : -1), 0, 4);
      this.pluck(next, 1.0);
    } else if (Math.abs(stickY) < 0.15) {
      this._stickLatch = false;
    }

    // PHYSICAL VR HAND STRUMMING! Swipe your hand right through any of the 5 hanging superstrings!
    for (const h of [input.L, input.R]) {
      if (!h.valid) continue;
      for (const s of this.strings) {
        s.cooldown = Math.max(0, s.cooldown - dt);
        const dx = Math.abs(h.pos.x - s.x);
        const dz = Math.abs(h.pos.z - s.z);
        if (dx < 0.16 && dz < 0.22 && h.pos.y > s.yBot && h.pos.y < s.yTop && s.cooldown <= 0) {
          const spd = Math.min(1.4, Math.max(0.5, h.vel.length() * 0.7));
          this.pluck(s.idx, spd);
          s.cooldown = 0.26;
          h.haptic(0.65, 45);
        }
      }
      // Or trigger near hero loop to strum
      if (h.triggerDown && !this.app.lastHudHit) {
        this.pluck((this.modeIdx + 1) % 5, 1.0);
        h.haptic(0.45, 35);
      }
    }

    // Update all 5 standing-wave Open Superstrings
    for (const s of this.strings) {
      s.energy = Math.max(0.18, s.energy * Math.exp(-dt * 1.15));
      const arr = s.geom.attributes.position.array;
      const activeBoost = s.idx === this.modeIdx ? 1.45 : 0.85;
      const amp = (0.04 + s.energy * 0.16) * activeBoost;
      const omega = 5.5 + s.modeNum * 3.8;

      for (let i = 0; i <= s.SEGS; i++) {
        const u = i / s.SEGS; // 0..1
        const y = THREE.MathUtils.lerp(s.yBot, s.yTop, u);
        // Exact standing-wave eigenmode sin(n * pi * u) * cos(omega * t)
        const envelope = Math.sin(u * Math.PI * s.modeNum);
        const dx = envelope * Math.cos(t * omega + s.phase) * amp;
        const dz = envelope * Math.sin(t * omega * 0.92 + s.phase) * amp * 0.65;
        arr[i * 3] = s.x + dx;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = s.z + dz;
      }
      s.geom.attributes.position.needsUpdate = true;
      s.topBead.scale.setScalar(s.idx === this.modeIdx ? 1.45 : 0.9);
      s.botBead.scale.setScalar(s.idx === this.modeIdx ? 1.45 : 0.9);
    }

    // Update Hero Closed/Vibrating String Loop floating in front
    const curMode = PARTICLE_MODES[this.modeIdx];
    this.loopEnergy = Math.max(0.28, this.loopEnergy * Math.exp(-dt * 0.9));
    const lArr = this.loopGeom.attributes.position.array;
    const nWave = curMode.n + 2;
    const baseR = 0.32;
    for (let i = 0; i <= this.loopN; i++) {
      const a = (i / this.loopN) * Math.PI * 2;
      const vib = Math.sin(a * nWave - t * (5 + curMode.n * 2.5)) * 0.085 * this.loopEnergy;
      const r = baseR + vib;
      const zVib = Math.cos(a * (nWave - 1) + t * 4.2) * 0.075 * this.loopEnergy;
      lArr[i * 3] = Math.cos(a) * r;
      lArr[i * 3 + 1] = Math.sin(a) * r;
      lArr[i * 3 + 2] = zVib;
    }
    this.loopGeom.attributes.position.needsUpdate = true;
    // Closed Graviton visibly floats upward detaching from the D-Brane into the higher-dimensional Bulk!
    const targetY = curMode.closed ? 1.72 + Math.sin(t * 1.4) * 0.12 : 1.48 + Math.sin(t * 2.0) * 0.05;
    this.loopGroup.position.y = THREE.MathUtils.lerp(this.loopGroup.position.y, targetY, dt * 4);
    this.loopLine.rotation.y = t * 0.45;
    this.loopGlow.rotation.y = t * 0.45;

    // 2D Worldsheet Merge/Split animation
    if (this.worldsheetTimer > 0) {
      this.worldsheetTimer -= dt;
      const p = 1 - Math.max(0, this.worldsheetTimer / 5.5); // 0..1
      // 0..0.45: two strings approach & merge; 0.45..0.6: single merged loop; 0.6..1: split back apart!
      const sep = p < 0.45 ? (1 - p / 0.45) * 0.85 : p < 0.6 ? 0 : ((p - 0.6) / 0.4) * 0.85;
      const merged = sep < 0.08;
      this.wsRingA.visible = this.wsRingB.visible = !merged;
      this.wsRingMerged.visible = merged;
      this.wsRingA.position.set(-sep, 0, 0);
      this.wsRingB.position.set(sep, 0, 0);
      this.wsRingA.rotation.y = t * 2.5;
      this.wsRingB.rotation.y = -t * 2.5;
      this.wsRingMerged.rotation.x = t * 3.0;

      // Render translucent pants-diagram worldsheet time slices behind the collision
      this.wsTrail.forEach((m, i) => {
        const f = i / 16;
        const zOff = -f * 1.8;
        const tSep = Math.abs(f - 0.5) * 1.5;
        m.position.set(i % 2 === 0 ? -tSep * 0.6 : tSep * 0.6, 0, zOff);
        m.scale.setScalar(0.75 + (1 - Math.abs(f - 0.5) * 2) * 0.55);
      });
      if (this.worldsheetTimer <= 0) this.wsGroup.visible = false;
    }

    this.app.env.state.tint.set(curMode.color);
  }
}
