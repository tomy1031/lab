import * as THREE from 'three';
import { FONT } from './config.js';

// Feedback effects: sparkle bursts, floating score text and a shooting light that carries
// earned stars up into the sky. All pooled, so nothing is allocated during play.

export class Effects {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    const N = 1200;
    this.N = N;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.col = new Float32Array(N * 3);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.size = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uPpd: { value: 14 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aSize; uniform float uPpd; varying vec3 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize / max(0.05, -mv.z) * 57.3 * uPpd, 0.0, 48.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; gl_FragColor = vec4(vC * exp(-r * r * 5.0), 1.0); }`,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 40;
    this.group.add(this.points);
    this.cursor = 0;

    this.texts = [];
    for (let i = 0; i < 10; i++) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
      m.renderOrder = 60; m.visible = false;
      this.group.add(m);
      this.texts.push({ m, c, tex, life: 0, max: 1, vel: new THREE.Vector3() });
    }
    this.textCursor = 0;
    this.flyers = [];
    this.arcs = [];
    // expanding rings of light (hit shockwaves)
    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 64), new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Vector3(0.7, 0.95, 1) }, uA: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uA; varying vec2 vP; void main(){ float r = length(vP); float a = smoothstep(0.8, 0.92, r) * smoothstep(1.0, 0.94, r); gl_FragColor = vec4(uColor * a * uA, 1.0); }',
      }));
      m.visible = false; m.renderOrder = 45; m.frustumCulled = false;
      this.group.add(m);
      this.rings.push({ m, t: 1, life: 0.6, size: 0.3 });
    }
    this.ringCursor = 0;
  }

  burst(p, { count = 40, color = [0.7, 0.95, 1.0], speed = 0.8, size = 0.03, life = 0.9, spread = 1 } = {}) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
      this.pos.set([p.x, p.y, p.z], i * 3);
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      const r = Math.sqrt(1 - u * u);
      this.vel.set([r * Math.cos(a) * s * spread, u * s, r * Math.sin(a) * s * spread], i * 3);
      const tint = 0.75 + Math.random() * 0.25;
      this.col.set([color[0] * tint, color[1] * tint, color[2] * tint], i * 3);
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
    }
  }

  text(str, p, { color = '#e8f6ff', size = 0.16, life = 1.3, rise = 0.25, font = FONT, glow = 'rgba(120,200,255,0.9)', weight = 700 } = {}) {
    const t = this.texts[this.textCursor]; this.textCursor = (this.textCursor + 1) % this.texts.length;
    const g = t.c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = `${weight} 76px ${font}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = glow; g.shadowBlur = 18;
    if (str.length > 10) g.font = `${weight} ${Math.round(76 * 10 / str.length)}px ${font}`;
    g.fillStyle = color; g.fillText(str, 256, 66);
    t.tex.needsUpdate = true;
    t.m.position.copy(p);
    t.m.scale.setScalar(size / 0.25);
    t.m.visible = true;
    t.life = t.max = life;
    t.vel.set(0, rise, 0);
  }

  /** A glowing mote that flies from `from` along `dir` (unit, world) to the sky. */
  /** Shockwave ring at p, facing the viewer. */
  ring(p, { color = [0.7, 0.95, 1.0], size = 0.35, life = 0.6 } = {}) {
    const r = this.rings[this.ringCursor]; this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.m.position.copy(p); r.m.visible = true; r.t = 0; r.life = life; r.size = size;
    r.m.material.uniforms.uColor.value.set(...color);
  }

  /**
   * A mote of light flying in an arc from `from` to a world point `to` (e.g. the next lantern of
   * the path, far out on the lake). The eyes follow it out to the distance.
   */
  flyTo(from, to, onArrive, { color = [1.0, 0.85, 0.55], lift = 0.25 } = {}) {
    const d = from.distanceTo(to);
    const ctrl = from.clone().lerp(to, 0.45);
    ctrl.y += Math.max(1.5, d * lift);
    this.arcs.push({ a: from.clone(), b: to.clone(), c: ctrl, t: 0, dur: 0.9 + Math.min(1.6, d / 90), color, onArrive, p: new THREE.Vector3() });
  }

  fly(from, dir, onArrive) {
    this.flyers.push({ p: from.clone(), dir: dir.clone(), t: 0, onArrive });
  }

  update(dt, head, ppd) {
    this.points.material.uniforms.uPpd.value = ppd;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= dt * 0.25;
      for (let j = 0; j < 3; j++) { this.vel[i * 3 + j] *= 1 - dt * 1.8; this.pos[i * 3 + j] += this.vel[i * 3 + j] * dt; }
      if (this.life[i] <= 0) this.size[i] = 0;
      if (k < 0.3) { const f = k / 0.3; this.col[i * 3] *= 0.92 + 0.08 * f; this.col[i * 3 + 1] *= 0.92 + 0.08 * f; this.col[i * 3 + 2] *= 0.92 + 0.08 * f; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;

    for (const t of this.texts) {
      if (!t.m.visible) continue;
      t.life -= dt;
      if (t.life <= 0) { t.m.visible = false; continue; }
      t.m.position.addScaledVector(t.vel, dt);
      t.m.material.opacity = Math.min(1, t.life / (t.max * 0.4));
      t.m.lookAt(head);
    }

    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) { r.m.visible = false; continue; }
      r.m.scale.setScalar(r.size * (0.4 + 1.6 * (1 - Math.pow(1 - k, 3))));
      r.m.material.uniforms.uA.value = (1 - k) * 0.9;
      r.m.lookAt(head);
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const f = this.arcs[i];
      f.t += dt / f.dur;
      const t = Math.min(1, f.t), u = 1 - t;
      f.p.set(0, 0, 0).addScaledVector(f.a, u * u).addScaledVector(f.c, 2 * u * t).addScaledVector(f.b, t * t);
      const dist = f.p.distanceTo(head);
      this.burst(f.p, { count: 2, color: f.color, speed: 0.02 * dist, size: 0.012 * dist + 0.02, life: 0.45 });
      if (f.t >= 1) {
        this.arcs.splice(i, 1);
        this.burst(f.b, { count: 18, color: f.color, speed: 0.03 * dist + 0.3, size: 0.01 * dist + 0.03, life: 0.8 });
        f.onArrive?.();
      }
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      const target = head.clone().addScaledVector(f.dir, 40);
      f.p.lerp(target, Math.min(1, dt * 2.2));
      this.burst(f.p, { count: 2, color: [0.8, 0.9, 1.0], speed: 0.05, size: 0.06 + f.t * 0.15, life: 0.5 });
      if (f.t > 1.4) { this.flyers.splice(i, 1); f.onArrive?.(); }
    }
  }
}
