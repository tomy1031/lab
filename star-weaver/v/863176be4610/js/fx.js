// fx.js — pooled particles, judgement popups and shockwave rings. All in stage-local space.
import * as THREE from 'three';
import { textTexture, glowTexture } from './text.js';
import { clamp } from './util.js';

const JUDGE_STYLE = {
  perfect: ['PERFECT', '#ffe27a'], great: ['GREAT', '#7af0ff'], good: ['GOOD', '#c7b8ff'], miss: ['MISS', '#8a86a8'],
  step: ['NICE STEP', '#7affc8'], squat: ['NICE SQUAT', '#7affc8'], keep: ['KEEP!', '#ffd166'], clear: ['CLEAR', '#ffe27a'],
  weave: ['WOVEN!', '#ffe27a'], fever: ['FEVER!', '#ff7ad9'], bump: ['WATCH OUT', '#ff9a7a'], nice: ['NICE!', '#7affc8'],
};

export class FX {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this._particles();
    this.glow = glowTexture(128);
    this._popups();
    this._rings();
    this._flashes();
  }

  _particles() {
    const N = this.N = 1800;
    this.pPos = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pCol = new Float32Array(N * 3);
    this.pSize = new Float32Array(N);
    this.pLife = new Float32Array(N);
    this.pMax = new Float32Array(N);
    this.pAlpha = new Float32Array(N);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.pU = { px: { value: 1000 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.pU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float px; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vC = aColor; vA = aAlpha;
          gl_PointSize = clamp(aSize * px / max(-mv.z, 0.05), 0.0, 96.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p);
        float star = exp(-abs(p.x) * 14.0) * exp(-abs(p.y) * 2.6) + exp(-abs(p.y) * 14.0) * exp(-abs(p.x) * 2.6);
        float a = (exp(-d * 7.0) + 0.55 * star) * vA; gl_FragColor = vec4(vC * a, a);
#include <colorspace_fragment>
}`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.group.add(this.points);
  }

  // burst of sparks at p (THREE.Vector3), color THREE.Color
  burst(p, color, n = 30, speed = 1.6, size = 0.03, life = 0.7) {
    for (let i = 0; i < n; i++) {
      const k = this.cursor; this.cursor = (this.cursor + 1) % this.N;
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const s = speed * (0.35 + Math.random() * 0.65);
      this.pPos[k * 3] = p.x; this.pPos[k * 3 + 1] = p.y; this.pPos[k * 3 + 2] = p.z;
      this.pVel[k * 3] = r * Math.cos(th) * s; this.pVel[k * 3 + 1] = u * s + 0.3; this.pVel[k * 3 + 2] = r * Math.sin(th) * s;
      const w = Math.random() * 0.4;
      this.pCol[k * 3] = color.r + (1 - color.r) * w; this.pCol[k * 3 + 1] = color.g + (1 - color.g) * w; this.pCol[k * 3 + 2] = color.b + (1 - color.b) * w;
      this.pSize[k] = size * (0.5 + Math.random());
      this.pMax[k] = this.pLife[k] = life * (0.6 + Math.random() * 0.6);
    }
  }
  // a single slow sparkle (trails, weaving)
  spark(p, color, size = 0.02, life = 0.5, drift = 0.15) {
    const k = this.cursor; this.cursor = (this.cursor + 1) % this.N;
    this.pPos[k * 3] = p.x; this.pPos[k * 3 + 1] = p.y; this.pPos[k * 3 + 2] = p.z;
    this.pVel[k * 3] = (Math.random() - 0.5) * drift; this.pVel[k * 3 + 1] = (Math.random() - 0.3) * drift; this.pVel[k * 3 + 2] = (Math.random() - 0.5) * drift;
    this.pCol[k * 3] = color.r; this.pCol[k * 3 + 1] = color.g; this.pCol[k * 3 + 2] = color.b;
    this.pSize[k] = size;
    this.pMax[k] = this.pLife[k] = life;
  }

  _popups() {
    this.tex = {};
    for (const k in JUDGE_STYLE) this.tex[k] = textTexture(JUDGE_STYLE[k][0], JUDGE_STYLE[k][1], { px: 92 });
    this.pops = [];
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.perfect, transparent: true, depthWrite: false, depthTest: false }));
      s.visible = false;
      s.renderOrder = 30;
      this.group.add(s);
      this.pops.push({ s, life: 0, vy: 0 });
    }
    this.popCursor = 0;
  }
  // free text (combo milestones), textures cached by text
  popupText(text, color, p, scale = 1) {
    const key = 'txt:' + text;
    if (!this.tex[key]) this.tex[key] = textTexture(text, color, { px: 88 });
    this.popup(key, p, scale);
  }
  popup(kind, p, scale = 1) {
    const o = this.pops[this.popCursor]; this.popCursor = (this.popCursor + 1) % this.pops.length;
    o.s.material.map = this.tex[kind] || this.tex.good;
    o.s.material.needsUpdate = true;
    o.s.position.copy(p);
    o.base = 0.34 * scale;
    o.s.scale.set(o.base, o.base * 0.28125, 1);
    o.s.visible = true;
    o.life = 0.75; o.vy = 0.35;
  }

  _flashes() {
    this.flashPool = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false; s.renderOrder = 6;
      this.group.add(s);
      this.flashPool.push({ s, life: 0, size: 0.3 });
    }
    this.flashCursor = 0;
  }
  // a quick bright bloom where something was hit
  flash(p, color, size = 0.35) {
    const f = this.flashPool[this.flashCursor]; this.flashCursor = (this.flashCursor + 1) % this.flashPool.length;
    f.s.position.copy(p); f.s.material.color.copy(color).lerp(new THREE.Color(1, 1, 1), 0.4);
    f.life = 0.22; f.size = size; f.s.visible = true;
  }

  _rings() {
    this.ringPool = [];
    const g = new THREE.RingGeometry(0.93, 1, 64);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false;
      this.group.add(m);
      this.ringPool.push({ m, life: 0, size: 0.3 });
    }
    this.ringCursor = 0;
  }
  ring(p, color, size = 0.35, faceZ = true) {
    const r = this.ringPool[this.ringCursor]; this.ringCursor = (this.ringCursor + 1) % this.ringPool.length;
    r.m.position.copy(p);
    r.m.material.color.copy(color);
    r.m.rotation.set(faceZ ? 0 : -Math.PI / 2, 0, 0);
    r.life = 0.45; r.size = size;
    r.m.visible = true;
  }

  update(dt, px) {
    this.pU.px.value = px;
    const P = this.pPos, V = this.pVel, drag = Math.exp(-dt * 2.4);
    for (let k = 0; k < this.N; k++) {
      if (this.pLife[k] <= 0) { this.pAlpha[k] = 0; continue; }
      this.pLife[k] -= dt;
      const i = k * 3;
      V[i] *= drag; V[i + 1] = V[i + 1] * drag - 0.6 * dt; V[i + 2] *= drag;
      P[i] += V[i] * dt; P[i + 1] += V[i + 1] * dt; P[i + 2] += V[i + 2] * dt;
      const f = clamp(this.pLife[k] / this.pMax[k], 0, 1);
      this.pAlpha[k] = f * f;
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = g.aAlpha.needsUpdate = g.aColor.needsUpdate = g.aSize.needsUpdate = true;
    for (const o of this.pops) {
      if (o.life <= 0) continue;
      o.life -= dt;
      o.s.position.y += o.vy * dt; o.vy *= Math.exp(-dt * 4);
      const k = 1 + (0.75 - o.life) * 0.5;
      o.s.scale.set(o.base * k, o.base * k * 0.28125, 1);
      o.s.material.opacity = clamp(o.life / 0.35, 0, 1);
      if (o.life <= 0) o.s.visible = false;
    }
    for (const f of this.flashPool) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = 1 - f.life / 0.22;
      f.s.scale.setScalar(f.size * (0.6 + k * 0.8));
      f.s.material.opacity = Math.max(0, 1 - k) * 0.9;
      if (f.life <= 0) f.s.visible = false;
    }
    for (const r of this.ringPool) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const f = 1 - r.life / 0.45;
      r.m.scale.setScalar(r.size * (0.3 + f * 1.2));
      r.m.material.opacity = (1 - f) * 0.9;
      if (r.life <= 0) r.m.visible = false;
    }
  }
}

export { glowTexture };
