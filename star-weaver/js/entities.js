// entities.js — everything that flies at the player: star orbs, comets to trace (threads),
// pose gates, side-step curtains, squat bars and the cool-down firefly.
import * as THREE from 'three';
import { glowTexture, sparkleTexture, font } from './text.js';
import { clamp, TAU, DEG } from './util.js';

export const HAND_COLORS = { L: new THREE.Color('#4cc9ff'), R: new THREE.Color('#ff5fb7'), A: new THREE.Color('#ffd166') };
const SPAWN_DIST = 14;
const CS = '\n#include <colorspace_fragment>\n';

let A = null; // shared assets
export function assets() {
  if (A) return A;
  const glow = glowTexture(128), sparkle = sparkleTexture(128);
  const add = (color, opacity = 1, map = glow) => new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  A = {
    glow, sparkle,
    core: new THREE.IcosahedronGeometry(0.055, 2),
    shell: new THREE.IcosahedronGeometry(0.085, 1),
    ring: new THREE.RingGeometry(0.115, 0.14, 48),
    bigRing: new THREE.RingGeometry(0.19, 0.225, 56),
    torus: new THREE.TorusGeometry(0.11, 0.008, 6, 40),
    coreMat: {}, shellMat: {}, glowMat: {}, ringMat: {}, sparkMat: add(0xffffff, 0.9, sparkle),
  };
  for (const k of ['L', 'R', 'A']) {
    const c = HAND_COLORS[k];
    A.coreMat[k] = new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.45) });
    A.shellMat[k] = new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    A.glowMat[k] = add(c, 0.9);
    A.ringMat[k] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  }
  // dots along a comet path
  A.dotMat = new THREE.ShaderMaterial({
    uniforms: { px: { value: 1000 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float px; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vC = aColor; vA = aAlpha; gl_PointSize = clamp(aSize * px / max(-mv.z, 0.05), 0.0, 64.0); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p); float a = exp(-d * 5.0) * vA; gl_FragColor = vec4(vC * a, a);${CS}}`,
  });
  A.poseTex = {};
  return A;
}

// ---- small helpers ----
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
function distToSegment(p, a, b) {
  tmpA.subVectors(b, a);
  const l2 = tmpA.lengthSq();
  if (l2 < 1e-9) return p.distanceTo(a);
  const t = clamp(tmpB.subVectors(p, a).dot(tmpA) / l2, 0, 1);
  return tmpC.copy(a).addScaledVector(tmpA, t).distanceTo(p);
}
function handsFor(game, h) {
  const out = [];
  if (h === 'L' || h === 'A') out.push(game.hands.L);
  if (h === 'R' || h === 'A') out.push(game.hands.R);
  return out.filter((x) => x.tracked);
}

class Entity {
  constructor(game, ev) { this.game = game; this.ev = ev; this.group = new THREE.Group(); game.playRoot.add(this.group); this.dead = false; this.owned = []; }
  // geometries / materials created just for this entity (shared assets are never disposed)
  own(...things) { this.owned.push(...things); return things[0]; }
  dispose() {
    if (this.dead) return;
    this.group.removeFromParent();
    this.dead = true;
    for (const x of this.owned) x.dispose();
    this.owned.length = 0;
  }
  // remove early (timeline cut); default: just vanish
  cancel() { this.dispose(); }
}

// ---------------- Orb: touch with the matching hand ----------------
export class Orb extends Entity {
  constructor(game, ev) {
    super(game, ev);
    const a = assets(), k = ev.hand;
    this.speed = SPAWN_DIST / game.approach;
    this.core = new THREE.Mesh(a.core, a.coreMat[k]);
    this.shell = new THREE.Mesh(a.shell, a.shellMat[k]);
    this.glow = new THREE.Sprite(a.glowMat[k]); this.glow.scale.setScalar(0.42);
    this.spark = new THREE.Sprite(a.sparkMat); this.spark.scale.setScalar(0.24);
    this.body = new THREE.Group();
    this.body.add(this.glow, this.shell, this.core, this.spark);
    if (k === 'A') this.body.scale.setScalar(1.25);
    if (ev.twist) {
      this.swirl = new THREE.Mesh(a.torus, a.ringMat[k]);
      this.swirl2 = new THREE.Mesh(a.torus, a.ringMat[k]); this.swirl2.scale.setScalar(1.35);
      this.body.add(this.swirl, this.swirl2);
    }
    this.group.add(this.body);
    this.target = new THREE.Mesh(a.ring, a.ringMat[k]);
    this.target.position.copy(ev.pos);
    this.target.visible = false;
    this.group.add(this.target);
    this.prev = new THREE.Vector3();
    this.cur = new THREE.Vector3();
    this.place(game.t);
    this.prev.copy(this.cur);
    this.state = 'fly';
  }
  place(t) {
    const e = this.ev, dz = (e.t - t) * this.speed;
    this.cur.set(e.pos.x, e.pos.y, e.pos.z - dz);
    this.body.position.copy(this.cur);
  }
  update(t, dt) {
    const e = this.ev, g = this.game;
    if (this.state === 'fly') {
      this.prev.copy(this.cur);
      this.place(t);
      const pulse = 1 + 0.12 * g.beatPulse;
      this.body.scale.setScalar((e.hand === 'A' ? 1.25 : 1) * pulse);
      this.shell.rotation.y += dt * 1.6; this.shell.rotation.x += dt * 0.9;
      this.spark.material.rotation += dt;
      if (this.swirl) { this.swirl.rotation.z += dt * 5; this.swirl2.rotation.z -= dt * 3; }
      // approach ring at the touch point
      const lead = e.t - t;
      if (lead < 1.0 && lead > -0.2) {
        this.target.visible = true;
        this.target.scale.setScalar(1 + Math.max(0, lead) * 1.6);
      } else this.target.visible = false;
      // contact
      const near = this.cur.z > e.pos.z - 0.75 && this.prev.z < e.pos.z + 0.4; // this frame's sweep overlaps the touch zone
      if (near) {
        const r = 0.16 + g.assist * 0.035;
        for (const h of handsFor(g, e.hand)) {
          const d = Math.min(distToSegment(h.local, this.prev, this.cur), distToSegment(this.cur, h.prevLocal, h.local));
          if (d < r) { this.hit(h, Math.abs(t - e.t), h.local.distanceTo(e.pos)); return true; }
        }
      }
      if (t > e.t + 0.32) { this.state = 'missed'; this.timer = 0.5; g.judge('orb', 'miss', this.cur, e); this.target.visible = false; }
      return true;
    }
    if (this.state === 'missed') {
      this.timer -= dt;
      this.cur.z += this.speed * dt;
      this.body.position.copy(this.cur);
      this.body.scale.multiplyScalar(Math.exp(-dt * 6));
      if (this.timer <= 0) { this.dispose(); return false; }
      return true;
    }
    return false;
  }
  hit(h, dtAbs, dist) {
    const judge = dtAbs < 0.12 && dist < 0.13 ? 'perfect' : dtAbs < 0.24 && dist < 0.19 ? 'great' : 'good';
    this.game.judge('orb', judge, this.cur.clone(), this.ev, h);
    this.dispose();
  }
}

// ---------------- Thread: ride a comet along a big arc with your hand ----------------
export class Thread extends Entity {
  constructor(game, ev) {
    super(game, ev);
    const a = assets(), k = ev.hand;
    this.color = HAND_COLORS[k];
    const n = this.n = Math.round(54 * Math.max(1, ev.loops));
    this.dotsU = new Float32Array(n);
    this.state = new Int8Array(n); // 0 pending, 1 woven, -1 missed
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      this.dotsU[i] = u;
      ev.path(u, v);
      pos.set([v.x, v.y, v.z], i * 3);
      col.set([this.color.r, this.color.g, this.color.b], i * 3);
      size[i] = 0.014; alpha[i] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    this.own(geo);
    this.dots = new THREE.Points(geo, a.dotMat);
    this.dots.frustumCulled = false;
    this.group.add(this.dots);
    this.comet = new THREE.Group();
    this.cGlow = new THREE.Sprite(a.glowMat[k]); this.cGlow.scale.setScalar(0.5);
    this.cCore = new THREE.Mesh(a.core, a.coreMat[k]); this.cCore.scale.setScalar(1.3);
    this.cRing = new THREE.Mesh(a.ring, a.ringMat[k]); this.cRing.scale.setScalar(1.5);
    this.comet.add(this.cGlow, this.cCore, this.cRing);
    this.group.add(this.comet);
    this.cpos = new THREE.Vector3();
    this.inside = false; this.insideTime = 0; this.activeTime = 0; this.hapticT = 0;
    this.loopIn = new Float32Array(Math.max(1, Math.ceil(ev.loops)));
    this.loopTot = new Float32Array(Math.max(1, Math.ceil(ev.loops)));
    this.lastIdx = 0;
    this.phase = 'lead';
  }
  update(t, dt) {
    const e = this.ev, g = this.game, attr = this.dots.geometry.attributes;
    const dur = e.t1 - e.t, u = clamp((t - e.t) / dur, 0, 1);
    if (this.phase === 'done') {
      this.fade -= dt;
      for (let i = 0; i < this.n; i++) attr.aAlpha.array[i] *= Math.exp(-dt * 5);
      attr.aAlpha.needsUpdate = true;
      this.comet.scale.multiplyScalar(Math.exp(-dt * 8));
      if (this.fade <= 0) { this.dispose(); return false; }
      return true;
    }
    e.path(u, this.cpos);
    this.comet.position.copy(this.cpos);
    const lead = clamp(1 - (e.t - t) / e.lead, 0, 1);
    const beatGlow = 1 + 0.15 * g.beatPulse;
    // hand check
    let inside = false;
    if (t >= e.t) {
      this.phase = 'run';
      const r = 0.2 + g.assist * 0.04;
      for (const h of handsFor(g, e.hand)) if (h.local.distanceTo(this.cpos) < r) { inside = true; this.hand = h; break; }
      this.activeTime += dt;
      if (inside) this.insideTime += dt;
      const li = Math.min(this.loopIn.length - 1, Math.floor(u * e.loops));
      this.loopTot[li] += dt; if (inside) this.loopIn[li] += dt;
      // mark dots the comet has passed
      while (this.lastIdx < this.n && this.dotsU[this.lastIdx] <= u) { this.state[this.lastIdx] = inside ? 1 : -1; this.lastIdx++; }
      if (inside !== this.inside) { g.weave(inside, this); this.inside = inside; }
      if (inside) {
        g.scoreTick(dt * 260, this.ev);
        this.hapticT -= dt;
        if (this.hapticT <= 0 && this.hand) { this.hapticT = 0.11; g.hands.haptic(this.hand.side, 0.18, 30); }
        if (Math.random() < dt * 40) g.fx.spark(this.cpos, this.color, 0.018, 0.6, 0.25);
      }
    }
    for (let i = 0; i < this.n; i++) {
      const s = this.state[i];
      attr.aAlpha.array[i] = s === 1 ? 1 : s === -1 ? 0.12 : (0.25 + 0.2 * g.beatPulse) * lead;
      attr.aSize.array[i] = s === 1 ? 0.026 : 0.014;
    }
    attr.aAlpha.needsUpdate = attr.aSize.needsUpdate = true;
    const sc = (inside ? 1.35 : 1) * beatGlow * (t < e.t ? 0.6 + 0.4 * lead : 1);
    this.comet.scale.setScalar(sc);
    this.cRing.visible = t < e.t || !inside;
    if (t >= e.t1) this.finish();
    return true;
  }
  finish() {
    const frac = this.activeTime > 0 ? this.insideTime / this.activeTime : 0;
    const judge = frac >= 0.8 ? 'perfect' : frac >= 0.55 ? 'great' : frac >= 0.3 ? 'good' : 'miss';
    let loops = 0;
    for (let i = 0; i < this.loopIn.length; i++) if (this.loopTot[i] > 0 && this.loopIn[i] / this.loopTot[i] >= 0.5) loops++;
    if (this.inside) { this.game.weave(false, this); this.inside = false; }
    this.game.judge('thread', judge, this.cpos.clone(), this.ev, null, { frac, loops });
    this.phase = 'done'; this.fade = 0.6;
  }
  cancel() { if (this.inside) this.game.weave(false, this); this.dispose(); }
}

// ---------------- Gate: hold a pose (wing / Y / overhead / cross-body / side bend) ----------------
const POSE_LABEL = { wing: 'つばさ', sky: 'Y', crown: 'のび', cross: 'クロス', bendL: 'よこ', bendR: 'よこ' };
function poseTexture(pose, hands) {
  const key = pose + hands;
  const a = assets();
  if (a.poseTex[key]) return a.poseTex[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = '#ffffff'; c.lineWidth = 14;
  c.shadowColor = '#ffd166'; c.shadowBlur = 18;
  const head = [128, 70], sh = [128, 104], hip = [128, 168];
  c.beginPath(); c.arc(head[0], head[1], 20, 0, TAU); c.stroke();
  c.beginPath(); c.moveTo(sh[0], sh[1]); c.lineTo(hip[0], hip[1]); c.lineTo(104, 226); c.moveTo(hip[0], hip[1]); c.lineTo(152, 226); c.stroke();
  const arms = {
    wing: [[[128, 108], [40, 104]], [[128, 108], [216, 104]]],
    sky: [[[128, 108], [64, 34]], [[128, 108], [192, 34]]],
    crown: [[[128, 108], [116, 18]], [[128, 108], [140, 18]]],
    cross: hands === 'R' ? [[[128, 108], [92, 122]], [[128, 108], [70, 112]]] : [[[128, 108], [164, 122]], [[128, 108], [186, 112]]],
    bendL: [[[128, 108], [70, 30]], [[128, 108], [92, 24]]],
    bendR: [[[128, 108], [186, 30]], [[128, 108], [164, 24]]],
  }[pose];
  c.strokeStyle = '#ffd166';
  for (const [p0, p1] of arms) { c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke(); }
  c.shadowBlur = 0;
  c.fillStyle = '#ffffff'; c.font = font(30, 800); c.textAlign = 'center';
  c.fillText(POSE_LABEL[pose] || '', 128, 250);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (a.poseTex[key] = t);
}

export class Gate extends Entity {
  constructor(game, ev) {
    super(game, ev);
    const a = assets();
    this.speed = SPAWN_DIST / game.approach;
    this.rings = [];
    for (const h of ev.hands) {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(a.bigRing, a.ringMat[h]);
      const glow = new THREE.Sprite(a.glowMat[h]); glow.scale.setScalar(0.5);
      grp.add(ring, glow);
      this.group.add(grp);
      this.rings.push({ h, grp, target: ev.targets[h] });
    }
    // pictogram + progress ring in front of the player
    this.iconU = { progress: { value: 0 }, col: { value: new THREE.Color('#ffd166') }, opacity: { value: 0 } };
    const ring = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.5, 0.5)), this.own(new THREE.ShaderMaterial({
      uniforms: this.iconU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float progress, opacity; uniform vec3 col; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p); float a = atan(p.x, p.y) / 6.2831853 + 0.5;
          float band = smoothstep(0.235, 0.245, r) * (1.0 - smoothstep(0.27, 0.28, r));
          float fill = step(a, progress);
          vec3 c = mix(vec3(0.35, 0.33, 0.6), col, fill);
          float disc = (1.0 - smoothstep(0.22, 0.235, r)) * 0.45;
          gl_FragColor = vec4(c * band + vec3(0.05, 0.04, 0.15) * disc, (band + disc) * opacity);${CS}}`,
    })));
    const icon = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: poseTexture(ev.pose, ev.hands), transparent: true, depthWrite: false })));
    icon.scale.setScalar(0.38);
    icon.position.z = 0.001;
    this.icon = new THREE.Group();
    this.icon.add(ring, icon);
    this.iconSprite = icon;
    this.iconHome = new THREE.Vector3(ev.laneX || 0, game.body.eyeY - 0.12, -1.5);
    this.group.add(this.icon);
    this.held = 0; this.dur = Math.max(0.2, ev.t1 - ev.t);
    this.keepT = 0; this.wasIn = false;
    this.place(game.t);
  }
  place(t) {
    const e = this.ev, dz = Math.max(0, e.t - t) * this.speed;
    for (const r of this.rings) r.grp.position.set(r.target.x, r.target.y, r.target.z - dz);
    this.icon.position.set(this.iconHome.x, this.iconHome.y, this.iconHome.z - dz * 0.9);
  }
  inPose(h, target) {
    const g = this.game, b = g.body, p = h.local;
    if (p.distanceTo(target) < 0.24 + g.assist * 0.05) return true;
    if (this.ev.pose === 'wing') {
      const side = h.side === 'L' ? -1 : 1, lx = this.ev.laneX || 0;
      return side * (p.x - lx) > b.shoulderHalf + b.reach * 0.6 && Math.abs(p.y - target.y) < 0.3 && p.z > target.z - 0.3;
    }
    if (this.ev.pose === 'crown' || this.ev.pose === 'sky') return p.y > b.shoulderY + b.reach * 0.6 && p.distanceTo(target) < 0.38;
    return false;
  }
  update(t, dt) {
    const e = this.ev, g = this.game;
    if (this.done) {
      this.fade -= dt;
      this.group.scale.multiplyScalar(1 + dt * 0.5);
      this.iconU.opacity.value = Math.max(0, this.fade * 2);
      this.iconSprite.material.opacity = Math.max(0, this.fade * 2);
      for (const r of this.rings) r.grp.scale.multiplyScalar(Math.exp(-dt * 6));
      if (this.fade <= 0) { this.dispose(); return false; }
      return true;
    }
    this.place(t);
    const appear = clamp(1 - (e.t - t) / g.approach, 0, 1);
    this.iconU.opacity.value = appear;
    for (const r of this.rings) r.grp.scale.setScalar(1 + 0.12 * g.beatPulse);
    if (t >= e.t - 0.15) {
      let all = true;
      for (const r of this.rings) {
        const h = g.hands[r.h];
        const ok = h.tracked && this.inPose(h, r.target);
        r.grp.children[0].scale.setScalar(ok ? 1.15 : 1);
        if (!ok) all = false;
      }
      if (all && t >= e.t - 0.05) {
        this.held += dt;
        this.keepT -= dt;
        if (this.keepT <= 0) {
          this.keepT = e.long ? 1.6 : 0.5;
          for (const r of this.rings) g.hands.haptic(r.h, 0.25, 40);
          if (e.long) g.fx.popup('keep', this.icon.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0.8);
        }
        g.scoreTick(dt * (e.long ? 120 : 300), e);
        if (Math.random() < dt * 30) for (const r of this.rings) g.fx.spark(r.grp.position, HAND_COLORS[r.h], 0.02, 0.7, 0.3);
      }
      this.iconU.progress.value = clamp(this.held / this.dur, 0, 1);
    }
    if (t >= e.t1) {
      const frac = clamp(this.held / this.dur, 0, 1);
      const judge = frac >= 0.72 ? 'perfect' : frac >= 0.45 ? 'great' : frac >= 0.2 ? 'good' : 'miss';
      g.judge('gate', judge, this.icon.position.clone(), e, null, { frac });
      this.done = true; this.fade = 0.5;
    }
    return true;
  }
}

// ---------------- Wall: a curtain of light, step aside ----------------
function chevronTexture() {
  const a = assets();
  if (a.chevron) return a.chevron;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.strokeStyle = '#ffffff'; c.lineWidth = 18; c.lineCap = 'round'; c.lineJoin = 'round';
  c.shadowColor = '#ffd166'; c.shadowBlur = 16;
  for (const x of [60, 130, 200]) { c.beginPath(); c.moveTo(x - 30, 24); c.lineTo(x + 10, 64); c.lineTo(x - 30, 104); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (a.chevron = t);
}
const wallMat = (opacity) => new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, opacity: { value: opacity }, col: { value: new THREE.Color('#ff7ad9') }, col2: { value: new THREE.Color('#ffd38a') } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float time, opacity; uniform vec3 col, col2; varying vec2 vUv;
    void main(){ float stripes = 0.55 + 0.45 * sin(vUv.x * 40.0 + sin(vUv.y * 6.0 + time * 2.0) * 2.0);
      float edge = max(smoothstep(0.06, 0.0, vUv.x), smoothstep(0.94, 1.0, vUv.x));
      float v = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
      vec3 c = mix(col, col2, vUv.y);
      float a = (stripes * 0.42 * v + edge * 0.5 * v) * opacity;
      gl_FragColor = vec4(c * a, a);${CS}}`,
});
export class Wall extends Entity {
  constructor(game, ev) {
    super(game, ev);
    this.speed = SPAWN_DIST / game.approach;
    const W = ev.laneW, half = W * 0.5;
    const spans = ev.free === 0 ? [[-3.2, -half], [half, 3.2]] : ev.free > 0 ? [[-3.2, half + (ev.free - 1) * W]] : [[-half + (ev.free + 1) * W, 3.2]];
    this.spans = spans;
    this.mat = this.own(wallMat(0));
    for (const [x0, x1] of spans) {
      const m = new THREE.Mesh(this.own(new THREE.PlaneGeometry(x1 - x0, 2.6)), this.mat);
      m.position.set((x0 + x1) / 2, 1.3, 0);
      this.group.add(m);
    }
    // chevrons in the blocked part of the curtain point to the open lane
    const tex = chevronTexture();
    const marks = ev.free === 0 ? [[-half - 0.32, 1], [half + 0.32, -1]] : [[ev.free * W - Math.sign(ev.free) * (W * 0.5 + 0.3), Math.sign(ev.free)]];
    this.chevrons = [];
    for (const [x, dir] of marks) {
      for (const y of [0.95, 1.45]) {
        const m = this.own(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color('#fff3c4'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: dir < 0 ? Math.PI : 0 }));
        const sp = new THREE.Sprite(m);
        sp.scale.set(0.42, 0.21, 1);
        sp.position.set(x, y, 0.02);
        this.group.add(sp);
        this.chevrons.push(sp);
      }
    }
    game.world.showLane(ev.free);
    this.judged = false;
    this.place(game.t);
  }
  place(t) { this.group.position.z = -(this.ev.t - t) * this.speed; }
  update(t, dt) {
    const e = this.ev, g = this.game;
    this.place(t);
    const z = this.group.position.z;
    this.mat.uniforms.time.value += dt;
    const op = clamp((z + SPAWN_DIST) / 4, 0, 1) * (z > -0.3 ? clamp(1 - (z + 0.3) / 0.8, 0, 1) : 1);
    this.mat.uniforms.opacity.value = op;
    for (const c of this.chevrons) c.material.opacity = op * (0.6 + 0.4 * g.beatPulse);
    if (!this.judged && t >= e.t) {
      this.judged = true;
      const x = g.head.x;
      const hitWall = this.spans.some(([x0, x1]) => x > x0 + 0.02 && x < x1 - 0.02);
      g.judge('wall', hitWall ? 'miss' : 'perfect', new THREE.Vector3(x, g.body.eyeY - 0.25, -0.6), e);
    }
    if (z > 1.2) { this.dispose(); return false; }
    return true;
  }
}

// ---------------- Bar: a beam of light, bend the knees a little ----------------
export class Bar extends Entity {
  constructor(game, ev) {
    super(game, ev);
    this.speed = SPAWN_DIST / game.approach;
    const b = game.body;
    this.y = b.standEyeY + 0.1 - ev.depth;
    this.need = b.standEyeY - ev.depth * 0.7;
    const beam = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.025, 0.025, 4.4, 10)), this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color('#7affc8') })));
    beam.rotation.z = Math.PI / 2;
    const glowMat = this.own(new THREE.SpriteMaterial({ map: assets().glow, color: new THREE.Color('#7affc8'), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.group.add(beam);
    for (let i = -3; i <= 3; i++) { const s = new THREE.Sprite(glowMat); s.scale.set(0.9, 0.25, 1); s.position.x = i * 0.6; this.group.add(s); }
    this.group.position.set(ev.laneX, this.y, 0);
    this.minEye = 9;
    this.place(game.t);
  }
  place(t) { this.group.position.z = -(this.ev.t - t) * this.speed; }
  update(t, dt) {
    const e = this.ev, g = this.game;
    this.place(t);
    if (t > e.t - 0.3 && t < e.t + 0.12) this.minEye = Math.min(this.minEye, g.head.y);
    if (!this.judged && t >= e.t + 0.12) {
      this.judged = true;
      g.judge('bar', this.minEye < this.need ? 'perfect' : 'miss', new THREE.Vector3(g.head.x, this.y + 0.15, -0.7), e);
    }
    if (this.group.position.z > 1.2) { this.dispose(); return false; }
    return true;
  }
}

// ---------------- Gaze: follow a firefly with your head (slow neck mobility) ----------------
export class Gaze extends Entity {
  constructor(game, ev) {
    super(game, ev);
    const a = assets();
    this.fly = new THREE.Group();
    const glow = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: a.glow, color: new THREE.Color('#c6ff6a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    glow.scale.setScalar(0.35);
    const core = new THREE.Sprite(a.sparkMat); core.scale.setScalar(0.14);
    this.fly.add(glow, core);
    this.group.add(this.fly);
    this.pos = new THREE.Vector3();
    this.on = 0; this.tot = 0; this.hapticT = 0;
  }
  update(t, dt) {
    const e = this.ev, g = this.game;
    const u = clamp((t - e.t) / (e.t1 - e.t), 0, 1);
    e.path(u, this.pos);
    this.fly.position.copy(this.pos);
    const s = clamp((t - e.t + 1) / 1, 0, 1) * clamp((e.t1 + 0.5 - t) / 0.5, 0, 1);
    this.fly.scale.setScalar(s * (1 + 0.15 * g.beatPulse));
    if (t >= e.t) {
      tmpA.subVectors(this.pos, g.head).normalize();
      const ang = Math.acos(clamp(tmpA.dot(g.headDir), -1, 1));
      this.tot += dt;
      if (ang < 13 * DEG) { this.on += dt; g.scoreTick(dt * 120, e); if (Math.random() < dt * 20) g.fx.spark(this.pos, new THREE.Color('#c6ff6a'), 0.02, 0.8, 0.2); }
    }
    if (t >= e.t1 + 0.5) {
      const frac = this.tot ? this.on / this.tot : 0;
      g.judge('gaze', frac >= 0.6 ? 'perfect' : frac >= 0.35 ? 'great' : 'good', this.pos.clone(), e, null, { frac });
      this.dispose();
      return false;
    }
    return true;
  }
}

export function spawnLead(ev, approach, barSec) {
  switch (ev.type) {
    case 'orb': case 'gate': return approach;
    case 'wall': case 'bar': return approach;
    case 'thread': return ev.lead || barSec;
    case 'gaze': return 1.2;
    default: return 0;
  }
}

export const ENTITY = { orb: Orb, thread: Thread, gate: Gate, wall: Wall, bar: Bar, gaze: Gaze };
