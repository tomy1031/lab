// gfx.js — shared shaders and effects: energy orbs (fresnel + swirling plasma), rim-only shells,
// camera-facing ribbon trails, target reticles and the hologram material used by the coach.
import * as THREE from 'three';
import { icon } from './theme.js';

const CS = '\n#include <colorspace_fragment>\n';
export const uTime = { value: 0 };   // shared clock for every animated shader
export const uBeat = { value: 0 };   // 1 on the beat, decays to 0

const cache = new Map();
const key = (n, c) => `${n}:${new THREE.Color(c).getHexString()}`;

// opaque glowing core with a hot centre and a coloured rim
export function energyMaterial(color) {
  const k = key('energy', color);
  if (cache.has(k)) return cache.get(k);
  const m = new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, time: uTime, beat: uBeat },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vO = normal; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 col; uniform float time, beat; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){
        float ndv = max(dot(normalize(vN), normalize(vV)), 0.0);
        float fres = pow(1.0 - ndv, 2.0);
        float swirl = sin(vO.x * 7.0 + time * 3.1 + sin(vO.y * 5.0 + time)) * sin(vO.y * 6.0 - time * 2.4) * sin(vO.z * 6.5 + time * 2.0);
        vec3 c = col * (0.45 + 1.5 * fres) + col * swirl * 0.22 + vec3(1.0) * pow(ndv, 4.0) * 0.9;
        c *= 1.0 + beat * 0.35;
        gl_FragColor = vec4(c, 1.0);${CS}}`,
  });
  cache.set(k, m);
  return m;
}

// additive rim glow (atmosphere around an orb, hologram shells)
export function rimMaterial(color, strength = 1, power = 2.4) {
  const k = key(`rim${strength}${power}`, color);
  if (cache.has(k)) return cache.get(k);
  const m = new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, strength: { value: strength }, beat: uBeat },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 col; uniform float strength, beat; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), ${power.toFixed(2)}); float a = f * strength * (0.8 + 0.4 * beat); gl_FragColor = vec4(col * a, a);${CS}}`,
  });
  cache.set(k, m);
  return m;
}

// a soft streak behind something that flies toward you (a cone along +z of its parent, fading out)
let streakGeo = null;
export function streakMesh(color, length = 0.7, radius = 0.032) {
  if (!streakGeo) {
    streakGeo = new THREE.CylinderGeometry(1, 0, 1, 12, 1, true);
    streakGeo.rotateX(-Math.PI / 2); // tip toward -z, wide end at the orb
    streakGeo.translate(0, 0, -0.5);
  }
  const k = key('streak', color);
  let m = cache.get(k);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color(color) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying float vZ; void main(){ vZ = -position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 col; varying float vZ; void main(){ float a = pow(1.0 - clamp(vZ, 0.0, 1.0), 2.5) * 0.45; gl_FragColor = vec4(col * a, a);${CS}}`,
    });
    cache.set(k, m);
  }
  const mesh = new THREE.Mesh(streakGeo, m);
  mesh.scale.set(radius, radius, length);
  return mesh;
}

// target reticle: thin ring, tick marks and a dotted inner ring (white, tinted by the material)
let reticleTex = null;
export function reticleTexture() {
  if (reticleTex) return reticleTex;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), m = S / 2;
  c.strokeStyle = '#fff'; c.lineCap = 'round';
  c.shadowColor = '#fff'; c.shadowBlur = 10;
  c.lineWidth = 7; c.beginPath(); c.arc(m, m, 104, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 9;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    c.beginPath(); c.moveTo(m + Math.cos(a) * 112, m + Math.sin(a) * 112); c.lineTo(m + Math.cos(a) * 126, m + Math.sin(a) * 126); c.stroke();
  }
  c.lineWidth = 4; c.setLineDash([6, 12]);
  c.beginPath(); c.arc(m, m, 80, 0, Math.PI * 2); c.stroke();
  reticleTex = new THREE.CanvasTexture(cv); reticleTex.colorSpace = THREE.SRGBColorSpace;
  return reticleTex;
}
export function reticleMaterial(color, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({ map: reticleTexture(), color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

// glyph texture (hand icon inside pose rings, etc.)
const iconTex = new Map();
export function iconTexture(name, mirror = false) {
  const k = name + (mirror ? '-m' : '');
  if (iconTex.has(k)) return iconTex.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.shadowColor = '#fff'; c.shadowBlur = 8;
  if (mirror) { c.translate(128, 0); c.scale(-1, 1); }
  icon(c, name, 64, 64, 100, '#ffffff', 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  iconTex.set(k, t);
  return t;
}

// ---------------- ribbon trail ----------------
// a camera-facing strip through the last N positions, tapering and fading toward the tail
export class Trail {
  constructor(parent, { length = 20, width = 0.03, color = '#ffffff', opacity = 0.8 } = {}) {
    this.n = length; this.width = width;
    this.pts = Array.from({ length }, () => new THREE.Vector3());
    this.pos = new Float32Array(length * 2 * 3);
    const t = new Float32Array(length * 2), idx = [];
    for (let i = 0; i < length; i++) { t[i * 2] = t[i * 2 + 1] = 1 - i / (length - 1); }
    for (let i = 0; i < length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 col; uniform float opacity; varying float vT; void main(){ float a = pow(vT, 1.6) * opacity; gl_FragColor = vec4(mix(col, vec3(1.0), vT * vT * 0.25) * a, a);${CS}}`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    parent.add(this.mesh);
    this.ready = false;
    this._side = new THREE.Vector3(1, 0, 0);
  }
  reset(p) { for (const q of this.pts) q.copy(p); this.ready = true; }
  // p: newest point; eye: camera position in the same space
  push(p, eye) {
    if (!this.ready) this.reset(p);
    const last = this.pts.pop();
    last.copy(p);
    this.pts.unshift(last);
    this._build(eye);
  }
  _build(eye) {
    const tan = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(this.n - 1, i + 1)];
      tan.subVectors(a, b);
      view.subVectors(eye, this.pts[i]);
      side.crossVectors(tan, view);
      if (side.lengthSq() < 1e-10) side.copy(this._side); else { side.normalize(); this._side.copy(side); }
      const w = this.width * (1 - i / this.n);
      const q = this.pts[i], k = i * 6;
      this.pos[k] = q.x + side.x * w; this.pos[k + 1] = q.y + side.y * w; this.pos[k + 2] = q.z + side.z * w;
      this.pos[k + 3] = q.x - side.x * w; this.pos[k + 4] = q.y - side.y * w; this.pos[k + 5] = q.z - side.z * w;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
  set visible(v) { this.mesh.visible = v; }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ---------------- hologram ----------------
export function hologramMaterial(color = '#8fe9ff') {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, time: uTime, opacity: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 col; uniform float time, opacity; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.8);
        float scan = 0.82 + 0.18 * sin(vW.y * 140.0 - time * 7.0);
        float band = 0.85 + 0.15 * smoothstep(0.96, 1.0, sin(vW.y * 3.0 - time * 1.6));
        float a = (0.2 + 0.8 * f) * scan * band * opacity;
        gl_FragColor = vec4(col * (0.85 + 0.9 * f) * a, a);${CS}}`,
  });
}
