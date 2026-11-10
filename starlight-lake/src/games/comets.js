import * as THREE from 'three';
import { Module } from './base.js';
import { Glow } from '../stimuli.js';
import { Staircase } from '../staircase.js';
import { rand } from '../util.js';
import { STIM_DIST } from '../config.js';

// Shooting Stars — fast targets in the periphery. Action video games, with their fast peripheral events
// and divided attention, improved contrast sensitivity in Li et al. 2009 (Nature Neuroscience)
// and acuity in amblyopia in Li et al. 2011. Speed follows a staircase: catch three and the
// next comets fly faster.

const TRAIL = 14;

export class CometsModule extends Module {
  start() {
    super.start();
    this.st = new Staircase({ start: 10, min: 4, max: 70, easier: -1, steps: [0.12, 0.08, 0.05] }, this.app.store.stair('vr-comet'));
    this.comets = [];
    this.spawnIn = 0.8;
    const geo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(8 * TRAIL * 3);
    this.trailA = new Float32Array(8 * TRAIL);
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aA', new THREE.BufferAttribute(this.trailA, 1).setUsage(THREE.DynamicDrawUsage));
    this.trail = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uPpd: { value: this.app.view.ppd } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aA; uniform float uPpd; varying float vA; void main(){ vA = aA; gl_PointSize = max(1.0, uPpd * 0.5 * aA); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * vA * exp(-r * r * 4.0), 1.0); }',
    }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 24;
    this.root.add(this.trail);
    this.app.eye(this.trail, 'weak');
  }

  spawn() {
    const f = this.app.view.field;
    const ang = rand(0, Math.PI * 2);
    const ecc = Math.min(f.az, 32);
    const sx = Math.cos(ang) * ecc, sy = Math.sin(ang) * Math.min(ecc, f.el + 6);
    // aim across the field, passing the centre at a random offset
    const tx = rand(-ecc * 0.5, ecc * 0.5), ty = rand(-f.el * 0.5, f.el * 0.5);
    const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy);
    const golden = Math.random() < 0.12;
    const g = new Glow(golden ? 0xffe0a0 : 0xe8f4ff, { core: 18, halo: golden ? 0.8 : 0.5, star: golden ? 1.2 : 0.7 });
    this.root.add(g.mesh);
    this.app.eye(g.mesh, 'weak');
    const c = { g, golden, x: sx, y: sy, vx: dx / len, vy: dy / len, speed: this.st.value, age: 0, hist: [], pos: new THREE.Vector3(), slot: this.freeSlot() };
    this.comets.push(c);
    this.app.audio.cue(this.at(sx, sy, STIM_DIST), 9);
  }

  freeSlot() {
    for (let s = 0; s < 8; s++) if (!this.comets.some((c) => c.slot === s)) return s;
    return 0;
  }

  update(dt) {
    super.update(dt);
    const f = this.app.view.field;
    this.spawnIn -= dt;
    const maxN = (this.t > 40 ? 2 : 1) + (this.app.finale ? 1 : 0);
    if (this.spawnIn <= 0 && this.comets.length < maxN) { this.spawn(); this.spawnIn = rand(0.5, 1.4) * (this.app.finale ? 0.6 : 1); }
    this.trailA.fill(0);
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.age += dt;
      c.x += c.vx * c.speed * dt; c.y += c.vy * c.speed * dt;
      this.at(c.x, c.y, STIM_DIST, c.pos);
      c.g.mesh.position.copy(c.pos);
      c.g.mesh.scale.setScalar(STIM_DIST * Math.tan(THREE.MathUtils.degToRad(1.3)));
      c.g.opacity = Math.min(1, c.age * 4);
      this.face(c.g.mesh);
      c.hist.unshift(c.pos.clone());
      if (c.hist.length > TRAIL) c.hist.pop();
      c.hist.forEach((p, k) => { this.trailPos.set([p.x, p.y, p.z], (c.slot * TRAIL + k) * 3); this.trailA[c.slot * TRAIL + k] = (1 - k / TRAIL) * 0.8; });
      if (Math.abs(c.x) > Math.min(f.az, 32) + 4 || Math.abs(c.y) > f.el + 8 || c.age > 12) {
        this.st.update(false);
        this.stats.trials++;
        this.app.score.miss(c.pos, false);
        this.remove(i);
      }
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aA.needsUpdate = true;
    this.trail.material.uniforms.uPpd.value = this.app.view.ppd;
  }

  remove(i) {
    const c = this.comets[i];
    c.g.mesh.removeFromParent();
    c.g.mesh.geometry.dispose(); c.g.mesh.material.dispose();
    this.comets.splice(i, 1);
  }

  pick(ray) {
    let best = -1, ba = Infinity;
    this.comets.forEach((c, i) => {
      const a = Module.rayAngle(ray, c.pos);
      if (a < 3.6 && a < ba) { ba = a; best = i; }
    });
    return best;
  }

  pointerTarget(p) {
    const i = this.pick(p.ray);
    return i >= 0 ? { point: this.comets[i].pos, distance: this.comets[i].pos.distanceTo(p.ray.origin) } : null;
  }

  onSelectStart(p) {
    const i = this.pick(p.ray);
    if (i < 0) return;
    const c = this.comets[i];
    const app = this.app;
    this.st.update(true);
    this.stats.trials++; this.stats.correct++;
    const pts = app.score.reward(70 + Math.round(c.speed * 3), c.pos, { golden: c.golden });
    if (c.golden) app.fx.text(`GOLD  +${pts}`, c.pos.clone().add(new THREE.Vector3(0, 0.12, 0)), { color: '#ffe29a', size: 0.09 });
    this.stats.score += pts;
    app.fx.burst(c.pos, { count: c.golden ? 70 : 44, color: c.golden ? [1.0, 0.86, 0.5] : [0.85, 0.92, 1.0], speed: 1.0, size: 0.022 });
    app.input.pulse(p, 0.7, 35);
    this.remove(i);
  }

  stop() {
    this.app.store.setStair('vr-comet', this.st.toJSON());
    this.stats.metrics = { speed: this.st.threshold() };
    return super.stop();
  }
}
