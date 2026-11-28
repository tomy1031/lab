// engine/particles.js — pooled GPU point sprites (sparks, boost flames, dust, confetti, bubbles)
import * as THREE from 'three';
import { linearOut } from './util.js';

const vert = /* glsl */`
attribute float size;
attribute vec4 rgba;
varying vec4 vC;
uniform float scale, maxPx;
void main() {
  vC = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float z = -mv.z;
  float ps = size * scale / max(0.1, z);
  // sparks, flames and dust stream backwards past the chase camera: fade them out before they reach the lens
  // (up close they would cover the screen for a frame or two), and fade sprites smaller than a pixel so they don't twinkle
  vC.a *= smoothstep(1.5, 4.5, z) * clamp(ps / 1.5, 0.0, 1.0);
  gl_PointSize = min(ps, maxPx);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */`
varying vec4 vC;
uniform float soft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = mix(1.0 - step(0.85, r), 1.0 - r * r, soft);
  gl_FragColor = vec4(vC.rgb, vC.a * a);
}`;

export class Particles {
  constructor(max = 2000, { additive = true, soft = 1 } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.rgba = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.base = new Float32Array(max * 5); // r g b size0 alpha0
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.phys = new Float32Array(max * 3); // gravity, drag, grow
    this.alive = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = { scale: { value: 400 }, maxPx: { value: 90 }, soft: { value: soft } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    linearOut(this.material);
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geometry = g;
  }

  // emit one particle. c = THREE.Color or [r,g,b]
  emit(x, y, z, vx, vy, vz, c, size = 0.5, life = 0.6, { gravity = 0, drag = 0, grow = 0, alpha = 1 } = {}) {
    if (this.alive >= this.max) return;
    const i = this.alive++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const r = c.r ?? c[0], gg = c.g ?? c[1], b = c.b ?? c[2];
    this.base[i * 5] = r; this.base[i * 5 + 1] = gg; this.base[i * 5 + 2] = b; this.base[i * 5 + 3] = size; this.base[i * 5 + 4] = alpha;
    this.life[i] = life; this.age[i] = 0;
    this.phys[i * 3] = gravity; this.phys[i * 3 + 1] = drag; this.phys[i * 3 + 2] = grow;
  }

  update(dt) {
    let n = this.alive;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        n--;
        if (i !== n) this.copy(n, i);
        i--;
        continue;
      }
      const g = this.phys[i * 3], drag = this.phys[i * 3 + 1];
      const k = Math.max(0, 1 - drag * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - g * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.age[i] / this.life[i];
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.rgba[i * 4] = this.base[i * 5]; this.rgba[i * 4 + 1] = this.base[i * 5 + 1]; this.rgba[i * 4 + 2] = this.base[i * 5 + 2];
      this.rgba[i * 4 + 3] = this.base[i * 5 + 4] * fade;
      this.size[i] = this.base[i * 5 + 3] * (1 + this.phys[i * 3 + 2] * t);
    }
    this.alive = n;
    this.geometry.setDrawRange(0, n);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.rgba.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }

  copy(from, to) {
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; this.phys[to * 3 + k] = this.phys[from * 3 + k]; }
    for (let k = 0; k < 4; k++) this.rgba[to * 4 + k] = this.rgba[from * 4 + k];
    for (let k = 0; k < 5; k++) this.base[to * 5 + k] = this.base[from * 5 + k];
    this.size[to] = this.size[from]; this.life[to] = this.life[from]; this.age[to] = this.age[from];
  }

  setScale(heightPx, fovDeg) {
    this.uniforms.scale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.uniforms.maxPx.value = Math.max(24, heightPx * 0.09);
  }
  clear() { this.alive = 0; this.geometry.setDrawRange(0, 0); }
}
