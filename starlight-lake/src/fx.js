import * as THREE from 'three';
import { FONT } from './config.js';

// Feedback effects: sparkle bursts, floating score text and a shooting light that carries
// earned stars up into the sky. All pooled, so nothing is allocated during play.

export class Effects {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    const N = 600;
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

  text(str, p, { color = '#e8f6ff', size = 0.16, life = 1.3, rise = 0.25 } = {}) {
    const t = this.texts[this.textCursor]; this.textCursor = (this.textCursor + 1) % this.texts.length;
    const g = t.c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = `700 76px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(120,200,255,0.9)'; g.shadowBlur = 18;
    g.fillStyle = color; g.fillText(str, 256, 66);
    t.tex.needsUpdate = true;
    t.m.position.copy(p);
    t.m.scale.setScalar(size / 0.25);
    t.m.visible = true;
    t.life = t.max = life;
    t.vel.set(0, rise, 0);
  }

  /** A glowing mote that flies from `from` along `dir` (unit, world) to the sky. */
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
