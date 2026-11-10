import * as THREE from 'three';
import { Module } from './base.js';
import { Glow } from '../stimuli.js';
import { easeInOut, smooth } from '../util.js';
import { noteOf } from '../audio.js';
import { WATER_Y } from '../config.js';

// Still Water — the quiet chapter between the games.
//  - Breathing, 4 s in / 2 s hold / 6 s out (slow breathing with a long exhale calms the body):
//    a lotus of light opens and closes with the breath, a ring shows where you are in the
//    breath, and a stream of light runs between the lotus and the far lighthouse: in toward
//    you as you breathe in, out to the lighthouse as you breathe out. Following its leading
//    light moves the eyes near <-> far (smooth vergence), and each exhale sends a ripple out
//    across the lake.
//  - Far gaze (遠方凝視): the lighthouse pulses and a wave of light runs out along the lantern path.
//  - Blinks: blink rate drops in VR; three slow bowls, three blinks.
//  - Far Screen mode: a real 20-20-20 break, eyes off the screen to the far distance.

const IN = 4, HOLD = 2, OUT = 6, CYCLE = IN + HOLD + OUT;

function petalGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 4, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.5;
    const w = Math.sin(Math.PI * Math.pow(y, 0.75)) * 0.5 + 0.02;
    const X = x * 2 * w * 0.085;
    p.setXYZ(i, X, y * 0.26, -Math.pow(X / 0.085, 2) * 0.025 + y * y * 0.035);
  }
  g.computeVertexNormals();
  return g;
}

class BreathLotus {
  constructor() {
    this.group = new THREE.Group();
    this.N = 18;
    this.uniforms = { uGlow: { value: 0.5 }, uA: { value: 0 }, uTime: { value: 0 } };
    const geo = petalGeometry();
    geo.setAttribute('aIdx', new THREE.InstancedBufferAttribute(Float32Array.from({ length: this.N }, (_, i) => i), 1));
    this.petals = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float aIdx; varying float vV; varying float vI;
        void main(){ vV = position.y / 0.26; vI = aIdx;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uGlow, uA, uTime; varying float vV; varying float vI;
        void main(){
          // pale petals lit from the heart of the flower, the tips taking colour from the night
          vec3 heart = vec3(1.0, 0.9, 0.72), tip = mix(vec3(0.55, 0.78, 1.0), vec3(0.92, 0.58, 0.86), step(9.0, vI));
          vec3 c = mix(heart, tip, smoothstep(0.05, 0.95, vV));
          float shimmer = 0.9 + 0.1 * sin(uTime * 3.0 + vI * 1.7 + vV * 6.0);
          float edge = smoothstep(1.0, 0.85, vV);
          c *= (0.35 + 0.65 * uGlow) * shimmer * (0.6 + 0.4 * (1.0 - vV));
          gl_FragColor = vec4(c, uA * (0.55 + 0.35 * uGlow) * edge);
        }`,
    }), this.N);
    this.petals.frustumCulled = false;
    this.petals.renderOrder = 22;
    this.core = new Glow(0xfff0d0, { core: 8, halo: 0.6, star: 0.4 });
    this.core.mesh.scale.setScalar(0.3);
    this.group.add(this.petals, this.core.mesh);
    this.open = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3();
  }
  layout(t) {
    for (let i = 0; i < this.N; i++) {
      const inner = i >= 9;
      const j = inner ? i - 9 : i;
      const theta = (j / 9) * Math.PI * 2 + (inner ? Math.PI / 9 : 0) + t * 0.05;
      const tilt = inner ? 0.2 + this.open * 0.6 : 0.35 + this.open * 1.05;
      this._e.set(tilt, theta, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      const sc = (inner ? 0.78 : 1) * (0.85 + 0.25 * this.open);
      this._s.set(sc, sc, sc);
      this._m.compose(this._p.set(0, 0, 0), this._q, this._s);
      this.petals.setMatrixAt(i, this._m);
    }
    this.petals.instanceMatrix.needsUpdate = true;
  }
}

export class RestModule extends Module {
  start() {
    super.start();
    const app = this.app;
    this.variant = this.opts.variant || 'far';
    this.sc = app.env.scenery;
    this.steps = [];
    if (this.variant === 'screen') {
      this.steps.push({ kind: 'window', dur: 22 });
    } else {
      this.steps.push({ kind: 'breath', dur: CYCLE * (this.variant === 'intro' ? 3 : 2) });
      this.steps.push({ kind: 'far', dur: this.variant === 'intro' ? 9 : 12 });
      if (this.variant !== 'intro') this.steps.push({ kind: 'blink', dur: 7.5 });
    }
    this.lotus = new BreathLotus();
    this.root.add(this.lotus.group);
    // the leading light and the stream between the lotus and the lighthouse
    this.lead = new Glow(0xe8f6ff, { core: 12, halo: 0.7, star: 0.8 });
    this.root.add(this.lead.mesh);
    this.lead.opacity = 0;
    this.NS = 110;
    this.streamPos = new Float32Array(this.NS * 3);
    this.streamA = new Float32Array(this.NS);
    this.streamOff = Float32Array.from({ length: this.NS }, () => Math.random());
    this.streamJit = Float32Array.from({ length: this.NS * 2 }, () => Math.random() - 0.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.streamPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aA', new THREE.BufferAttribute(this.streamA, 1).setUsage(THREE.DynamicDrawUsage));
    this.stream = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uPpd: { value: app.view.ppd } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aA; uniform float uPpd; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(0.05 / max(0.3, -mv.z) * 57.3 * uPpd + 1.5, 1.5, 22.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; gl_FragColor = vec4(vec3(0.8, 0.92, 1.0) * exp(-r * r * 4.0) * vA, 1.0); }',
    }));
    this.stream.frustumCulled = false; this.stream.renderOrder = 21;
    this.root.add(this.stream);
    // the breath ring: where you are within this breath
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { uProg: { value: 0 }, uA: { value: 0 }, uColor: { value: new THREE.Vector3(0.6, 0.9, 1.0) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uProg, uA; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
          float ang = fract(atan(p.x, p.y) / 6.2831853 + 1.0);        // 0 at 12 o'clock, clockwise
          float band = exp(-pow((r - 0.9) / 0.018, 2.0));
          float filled = step(ang, uProg);
          float glow = exp(-pow((r - 0.9) / 0.06, 2.0)) * 0.3;
          gl_FragColor = vec4(uColor * (band * (0.18 + 0.82 * filled) + glow * filled) * uA, 1.0);
        }`,
    }));
    this.ring.renderOrder = 21;
    this.root.add(this.ring);
    // ripples sent across the lake on each exhale
    this.ripples = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uA; varying vec2 vP; void main(){ float r = length(vP); float a = exp(-pow((r - 0.92) / 0.03, 2.0)) + 0.4 * exp(-pow((r - 0.8) / 0.02, 2.0)); gl_FragColor = vec4(vec3(0.7, 0.85, 1.0) * a * uA, 1.0); }',
      }));
      m.visible = false; m.renderOrder = -30;
      this.root.add(m);
      return { m, t: 99 };
    });
    this.si = -1; this.st = 0; this.lastPhase = '';
    this.anchor = this.at(0, -2, 2.2);
    this.next();
  }

  next() {
    this.si++;
    this.st = 0;
    const s = this.steps[this.si];
    if (!s) { this.done = true; return; }
    const app = this.app;
    if (s.kind === 'breath') app.caption('光の蓮に合わせて、ゆっくり呼吸しましょう', 4);
    if (s.kind === 'far') { app.caption('遠くの灯台の光を、ぼんやりと眺めましょう', s.dur); this.sc.path.wave(); this.nextWave = 3.4; }
    if (s.kind === 'blink') { app.caption('灯台の光に合わせて、ゆっくり3回まばたき', s.dur); this.blinks = 0; }
    if (s.kind === 'window') { app.caption('画面から目を離して、窓の外のいちばん遠くを20秒眺めましょう', s.dur); app.audio.bowl(null, 50, 0.3, 6); }
  }

  /** Point on the curve between the lotus (u = 0) and the lighthouse lamp (u = 1). */
  path(u, out) {
    const a = this.anchor, b = this.sc.lighthousePos;
    const c = this._ctrl || (this._ctrl = new THREE.Vector3());
    c.copy(a).lerp(b, 0.35); c.y = Math.max(a.y, b.y) + 6;
    const v = 1 - u;
    return out.set(0, 0, 0).addScaledVector(a, v * v).addScaledVector(c, 2 * v * u).addScaledVector(b, u * u);
  }

  update(dt) {
    super.update(dt);
    if (this.done) return;
    const app = this.app;
    const s = this.steps[this.si];
    this.st += dt;
    const lot = this.lotus;
    lot.group.position.copy(this.anchor);
    lot.group.quaternion.setFromEuler(new THREE.Euler(0.25, app.stageYaw, 0, 'YXZ'));   // tipped toward you a little
    this.ring.position.copy(this.anchor);
    this.ring.scale.setScalar(0.62);
    this.face(this.ring);
    lot.uniforms.uTime.value = this.t;

    let breath = 0, stream = 0, dir = 0, lead = -1;
    if (s.kind === 'breath') {
      const c = this.st % CYCLE;
      const phase = c < IN ? 'in' : c < IN + HOLD ? 'hold' : 'out';
      if (phase !== this.lastPhase) this.onPhase(phase);
      this.lastPhase = phase;
      if (phase === 'in') { const k = easeInOut(c / IN); breath = k; dir = -1; stream = 1; lead = 1 - k; this.prog = c / IN; }
      else if (phase === 'hold') { breath = 1; stream = 0.25; this.prog = (c - IN) / HOLD; }
      else { const k = easeInOut((c - IN - HOLD) / OUT); breath = 1 - k; dir = 1; stream = 1; lead = k; this.prog = (c - IN - HOLD) / OUT; }
      lot.open += (breath - lot.open) * Math.min(1, dt * 6);
      lot.uniforms.uGlow.value = 0.35 + 0.65 * breath;
      lot.uniforms.uA.value = Math.min(1, lot.uniforms.uA.value + dt);
      const ru = this.ring.material.uniforms;
      ru.uProg.value = this.prog; ru.uA.value = Math.min(1, ru.uA.value + dt);
      ru.uColor.value.set(...(phase === 'in' ? [0.55, 0.9, 1.0] : phase === 'hold' ? [1.0, 0.95, 0.85] : [0.8, 0.65, 1.0]));
      const remain = phase === 'in' ? IN - c : phase === 'hold' ? IN + HOLD - c : CYCLE - c;
      const sec = Math.ceil(remain);
      if (sec !== this.lastSec || phase !== this.lastCapPhase) {
        this.lastSec = sec; this.lastCapPhase = phase;
        app.caption(`${phase === 'in' ? '吸って' : phase === 'hold' ? '止めて' : '吐いて'}   ${sec}`, 1.2);
      }
    } else {
      lot.open += (0 - lot.open) * Math.min(1, dt * 2);
      lot.uniforms.uA.value = Math.max(0, lot.uniforms.uA.value - dt * 0.6);
      lot.uniforms.uGlow.value = 0.3;
      this.ring.material.uniforms.uA.value = Math.max(0, this.ring.material.uniforms.uA.value - dt);
      stream = s.kind === 'far' ? 0.5 : 0.2; dir = 1;
    }
    lot.layout(this.t);
    lot.core.opacity = lot.uniforms.uA.value * (0.25 + 0.4 * lot.uniforms.uGlow.value);
    lot.core.mesh.scale.setScalar(0.16 + 0.16 * lot.open);
    this.face(lot.core.mesh);
    app.env.breath = breath;

    // light stream between the lotus and the lighthouse
    this.streamAlpha = (this.streamAlpha || 0) + (stream - (this.streamAlpha || 0)) * Math.min(1, dt * 2.5);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.NS; i++) {
      this.streamOff[i] = (this.streamOff[i] + dir * dt * (0.09 + 0.05 * ((i * 7) % 5) / 5) + 1) % 1;
      const u = this.streamOff[i];
      this.path(u, tmp);
      const spread = 0.15 + u * 9;
      tmp.x += this.streamJit[i * 2] * spread; tmp.y += this.streamJit[i * 2 + 1] * spread * 0.4;
      this.streamPos.set([tmp.x, tmp.y, tmp.z], i * 3);
      this.streamA[i] = this.streamAlpha * (0.25 + 0.75 * Math.sin(Math.PI * u)) * 0.8;
    }
    this.stream.geometry.attributes.position.needsUpdate = true;
    this.stream.geometry.attributes.aA.needsUpdate = true;
    this.stream.material.uniforms.uPpd.value = app.view.ppd;
    // the leading light rides the breath: far -> near on the in-breath, near -> far on the out-breath
    if (lead >= 0) {
      this.path(lead, this.lead.mesh.position);
      const d = this.lead.mesh.position.distanceTo(app.head);
      this.lead.mesh.scale.setScalar(Math.max(0.06, d * 0.03));
      this.lead.opacity = Math.min(1, (this.lead.uniforms.uOpacity.value || 0) + dt * 2);
    } else this.lead.opacity = Math.max(0, this.lead.uniforms.uOpacity.value - dt * 2);
    this.face(this.lead.mesh);

    for (const r of this.ripples) {
      if (r.t > 6.5) { r.m.visible = false; continue; }
      r.t += dt;
      const k = r.t / 6.5;
      r.m.visible = true;
      r.m.position.set(this.anchor.x, WATER_Y + 0.01, this.anchor.z);
      r.m.scale.setScalar(0.4 + smooth(Math.min(1, k)) * 30);
      r.m.material.uniforms.uA.value = (1 - k) * 0.55;
    }

    if (s.kind === 'far') {
      this.nextWave -= dt;
      if (this.nextWave <= 0) { this.sc.path.wave(); this.nextWave = 3.4; }
    }
    if (s.kind === 'blink') {
      const due = Math.floor(this.st / 2.4);
      if (due > this.blinks && this.blinks < 3) {
        this.blinks++;
        app.audio.bowl(this.sc.lighthousePos, 52 + this.blinks * 2, 0.25, 4);
        this.sc.path.wave();
      }
    }
    if (s.kind === 'window' && Math.floor(this.st) !== Math.floor(this.st - dt) && Math.floor(this.st) === s.dur - 1) {
      app.audio.bowl(null, 55, 0.35, 5);
    }
    if (this.st >= s.dur) this.next();
  }

  onPhase(phase) {
    const app = this.app;
    if (phase === 'in') {
      app.audio.bowl(this.anchor, 50, 0.28, 7);
      app.audio.breathSwell('in', IN);
    } else if (phase === 'hold') {
      app.audio.breathSwell('hold', HOLD);
      app.fx.burst(this.anchor, { count: 24, color: [1.0, 0.92, 0.8], speed: 0.25, size: 0.02, life: 1.4 });
    } else {
      app.audio.breathSwell('out', OUT);
      app.audio.bell(this.anchor, { midi: noteOf(0) + 12, vel: 0.12, dur: 4, bright: 0.8 });
      const r = this.ripples.find((x) => x.t > 6.5) || this.ripples[0];
      r.t = 0;
    }
  }

  onSelectStart() {
    // a tap during the far gaze skips ahead gently
    const s = this.steps[this.si];
    if (s && s.kind !== 'breath' && this.st > 4) this.next();
  }

  stop() {
    this.app.env.breath = 0;
    return super.stop();
  }
}
