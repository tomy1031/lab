// js/fx.js — hit feedback: a burst of petals and sparks, a shock ring, and a floating word (PERFECT, はやい…).
import * as THREE from 'three';
import { canvasTexture, FONT } from './util.js';

export const WORDS = [
  ['PERFECT', '#fff3a6'], ['GREAT', '#9ff5c8'], ['GOOD', '#bfe0ff'], ['ずれ', '#ffb38a'], ['MISS', '#ff8080'],
  ['よわい', '#ffd0a0'], ['DODGE!', '#a8ffcf'], ['OUCH', '#ff8a7a'], ['はやい', '#9fd6ff'], ['おそい', '#ffc58a'],
  ['ジャスト', '#fff3a6'], ['', '#fff'],
];

function wordAtlas() {
  const { ctx, tex } = canvasTexture(1024, 512);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  WORDS.forEach(([w, c], i) => {
    const x = (i % 2) * 512 + 256, y = Math.floor(i / 2) * 85 + 42;
    ctx.font = `900 ${w.length > 4 && /[A-Z]/.test(w) ? 60 : 64}px ${FONT}`;
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(8,20,16,0.85)';
    ctx.strokeText(w, x, y);
    ctx.fillStyle = c;
    ctx.fillText(w, x, y);
  });
  return tex;
}

export class FX {
  constructor(parent) {
    this.parent = parent;
    const N = (this.N = 700);
    this.p = new Float32Array(N * 3);
    this.v = new Float32Array(N * 3);
    this.c = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.size = new Float32Array(N);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo = g;
    this.uScale = { value: 1000 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: /* glsl */ `
        attribute float size; attribute vec3 color; varying vec3 vC;
        uniform float uScale;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * 0.5 * projectionMatrix[1][1] * size / -mv.z; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(d)); gl_FragColor = vec4(vC * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    parent.add(this.points);

    this.rings = [];
    const rg = new THREE.RingGeometry(0.12, 0.135, 40);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false;
      m.renderOrder = 5;
      parent.add(m);
      this.rings.push({ m, t: 1 });
    }
    this.atlas = wordAtlas();
    this.pops = [];
    const pg = new THREE.PlaneGeometry(0.3, 0.05);
    for (let i = 0; i < 12; i++) {
      const tex = this.atlas.clone();
      tex.repeat.set(1 / 2, 1 / 6);
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
      m.visible = false;
      m.renderOrder = 10;
      parent.add(m);
      this.pops.push({ m, tex, t: 1, vy: 0 });
    }
  }

  burst(pos, color, n = 40, speed = 2.2, dir = null) {
    const col = new THREE.Color(color);
    const white = new THREE.Color('#fffbe8');
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.N;
      this.p[k * 3] = pos.x; this.p[k * 3 + 1] = pos.y; this.p[k * 3 + 2] = pos.z;
      let vx = Math.random() * 2 - 1, vy = Math.random() * 2 - 1, vz = Math.random() * 2 - 1;
      const l = Math.hypot(vx, vy, vz) || 1;
      const s = speed * (0.4 + Math.random() * 0.8);
      vx = (vx / l) * s; vy = (vy / l) * s + 0.6; vz = (vz / l) * s;
      if (dir) { vx += dir[0] * speed * 0.8; vy += dir[1] * speed * 0.8; vz += dir[2] * speed * 0.8; }
      this.v[k * 3] = vx; this.v[k * 3 + 1] = vy; this.v[k * 3 + 2] = vz;
      const c = i % 3 === 0 ? white : col;
      this.c[k * 3] = c.r; this.c[k * 3 + 1] = c.g; this.c[k * 3 + 2] = c.b;
      this.life[k] = 0.3 + Math.random() * 0.35;
      this.size[k] = 0.01 + Math.random() * 0.018;
    }
  }

  ring(pos, color, quat) {
    const r = this.rings.find((x) => x.t >= 1) || this.rings[0];
    r.m.position.copy(pos);
    if (quat) r.m.quaternion.copy(quat);
    r.m.material.color.set(color);
    r.t = 0;
    r.m.visible = true;
  }

  // word index into WORDS; sub = an optional second word below (はやい / おそい)
  pop(pos, word, sub = -1) {
    // a new word replaces the words still floating at the same spot
    for (const q of this.pops) if (q.t < 1 && Math.abs(q.m.position.x - pos.x) < 0.22 && Math.abs(q.m.position.z - pos.z) < 0.6) { q.t = 1; q.m.visible = false; }
    const use = (w, dy) => {
      const p = this.pops.find((x) => x.t >= 1) || this.pops[0];
      p.tex.offset.set((w % 2) / 2, 1 - (Math.floor(w / 2) + 1) / 6);
      p.m.position.copy(pos);
      p.m.position.y += dy;
      p.t = 0;
      p.m.visible = true;
      p.m.scale.setScalar(dy < 0 ? 0.7 : 1);
    };
    use(word, 0.17);
    if (sub >= 0) use(sub, 0.1);
  }

  update(dt, camQuat) {
    const g = 3.2, drag = Math.exp(-dt * 2.2);
    for (let k = 0; k < this.N; k++) {
      if (this.life[k] <= 0) { if (this.size[k] !== 0) this.size[k] = 0; continue; }
      this.life[k] -= dt;
      this.v[k * 3 + 1] -= g * dt;
      for (let j = 0; j < 3; j++) { this.v[k * 3 + j] *= drag; this.p[k * 3 + j] += this.v[k * 3 + j] * dt; }
      const f = Math.max(0, this.life[k]);
      this.c[k * 3] *= 0.97; this.c[k * 3 + 1] *= 0.97; this.c[k * 3 + 2] *= 0.97;
      if (f <= 0) this.size[k] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt * 5);
      r.m.scale.setScalar(0.9 + r.t * 0.7);
      r.m.material.opacity = (1 - r.t) * 0.6;
      if (r.t >= 1) r.m.visible = false;
    }
    for (const p of this.pops) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt * 2.2);
      p.m.position.y += dt * 0.2;
      p.m.quaternion.copy(camQuat);
      p.m.material.opacity = p.t < 0.7 ? 1 : 1 - (p.t - 0.7) / 0.3;
      if (p.t >= 1) p.m.visible = false;
    }
  }
}
