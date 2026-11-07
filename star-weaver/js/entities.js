// entities.js — everything that flies at the player: star orbs, comets to trace (threads),
// pose gates, side-step curtains, squat bars and the cool-down firefly.
// Every entity also has a "wait" mode (ev.wait) used by the tutorial: it stops where the player
// has to act and waits for them instead of judging on the beat.
import * as THREE from 'three';
import { glowTexture, sparkleTexture } from './text.js';
import { font, C, icon, roundRect, spaced } from './theme.js';
import { energyMaterial, rimMaterial, streakMesh, reticleMaterial, iconTexture, Trail, uTime } from './gfx.js';
import { HAND_COLORS, GREEN } from './palette.js';
import { clamp, TAU, DEG } from './util.js';

export { HAND_COLORS };
const SPAWN_DIST = 14;
const CS = '\n#include <colorspace_fragment>\n';

let A = null; // shared assets
export function assets() {
  if (A) return A;
  const glow = glowTexture(128), sparkle = sparkleTexture(128);
  const add = (color, opacity = 1, map = glow) => new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  A = {
    glow, sparkle,
    sphere: new THREE.SphereGeometry(1, 28, 18),
    gyro: new THREE.TorusGeometry(1, 0.035, 6, 64),
    plane: new THREE.PlaneGeometry(1, 1),
    glowMat: {}, gyroMat: {}, sparkMat: add(0xffffff, 0.95, sparkle),
  };
  for (const k of ['L', 'R', 'A']) {
    const c = HAND_COLORS[k];
    A.glowMat[k] = add(c, 0.55);
    A.gyroMat[k] = new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.25), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  }
  return A;
}

// ---- helpers ----
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

// an energy orb: hot core, rim atmosphere, two gyro rings, halo and a sparkle
function makeOrb(k, size = 1) {
  const a = assets(), g = new THREE.Group();
  const core = new THREE.Mesh(a.sphere, energyMaterial(HAND_COLORS[k])); core.scale.setScalar(0.048);
  const shell = new THREE.Mesh(a.sphere, rimMaterial(HAND_COLORS[k], 1.5)); shell.scale.setScalar(0.078);
  const halo = new THREE.Sprite(a.glowMat[k]); halo.scale.setScalar(0.3);
  const spark = new THREE.Sprite(a.sparkMat); spark.scale.setScalar(0.2);
  const g1 = new THREE.Mesh(a.gyro, a.gyroMat[k]); g1.scale.setScalar(0.098);
  const g2 = new THREE.Mesh(a.gyro, a.gyroMat[k]); g2.scale.setScalar(0.098);
  g.add(halo, shell, core, g1, g2, spark);
  g.scale.setScalar(size);
  g.userData = { core, shell, halo, spark, g1, g2 };
  return g;
}
function spinOrb(g, t, dt) {
  const u = g.userData;
  u.g1.rotation.set(t * 2.2, t * 1.1, 0);
  u.g2.rotation.set(-t * 1.4, 0.6, t * 2.6);
  u.spark.material.rotation = t * 0.8;
}

class Entity {
  constructor(game, ev) { this.game = game; this.ev = ev; this.group = new THREE.Group(); game.playRoot.add(this.group); this.dead = false; this.owned = []; this.age = 0; }
  // geometries / materials / trails created just for this entity (shared assets are never disposed)
  own(...things) { this.owned.push(...things); return things[0]; }
  dispose() {
    if (this.dead) return;
    this.group.removeFromParent();
    this.dead = true;
    for (const x of this.owned) x.dispose();
    this.owned.length = 0;
  }
  cancel() { this.dispose(); }
}

// ---------------- Orb: touch with the matching hand ----------------
export class Orb extends Entity {
  constructor(game, ev) {
    super(game, ev);
    const k = ev.hand;
    this.speed = SPAWN_DIST / game.approach;
    this.body = makeOrb(k, k === 'A' ? 1.25 : 1);
    this.body.add(streakMesh(HAND_COLORS[k], 0.9, 0.04));
    if (ev.twist) {
      const sw = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: iconTexture('spiral'), color: HAND_COLORS[k], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      sw.scale.setScalar(0.3);
      this.body.add(sw);
      this.swirl = sw;
    }
    this.group.add(this.body);
    // touch-point reticle
    this.target = new THREE.Mesh(assets().plane, this.own(reticleMaterial(HAND_COLORS[k], 0)));
    this.target.position.copy(ev.pos);
    this.group.add(this.target);
    this.prev = new THREE.Vector3();
    this.cur = new THREE.Vector3();
    this.place(game.t);
    this.prev.copy(this.cur);
    this.state = 'fly';
  }
  place(t) {
    const e = this.ev;
    let dz = (e.t - t) * this.speed;
    if (e.wait) dz = Math.max(0, dz);
    this.cur.set(e.pos.x, e.pos.y + (e.wait && dz === 0 ? Math.sin(t * 3) * 0.01 : 0), e.pos.z - dz);
    this.body.position.copy(this.cur);
  }
  update(t, dt) {
    const e = this.ev, g = this.game;
    this.age += dt;
    if (this.state === 'fly') {
      this.prev.copy(this.cur);
      this.place(t);
      const pulse = 1 + 0.1 * g.beatPulse;
      this.body.scale.setScalar((e.hand === 'A' ? 1.25 : 1) * pulse * Math.min(1, this.age * 3));
      spinOrb(this.body, t, dt);
      if (this.swirl) this.swirl.material.rotation = -t * 4;
      // the reticle shrinks onto the touch point as the orb arrives
      const lead = e.t - t;
      const m = this.target.material;
      if (lead < 0.9) {
        const k = clamp(1 - lead / 0.9, 0, 1);
        m.opacity = 0.2 + 0.7 * k;
        const s = 0.17 * (1 + Math.max(0, lead) * 0.9) * (e.hand === 'A' ? 1.2 : 1);
        this.target.scale.set(s, s, 1);
        this.target.rotation.z = lead * 2.2;
      } else m.opacity = 0;
      // contact
      const near = this.cur.z > e.pos.z - 0.75 && this.prev.z < e.pos.z + 0.4;
      if (near) {
        const r = 0.16 + g.assist * 0.035 + (e.wait ? 0.03 : 0);
        for (const h of handsFor(g, e.hand)) {
          const d = Math.min(distToSegment(h.local, this.prev, this.cur), distToSegment(this.cur, h.prevLocal, h.local));
          if (d < r) { this.hit(h, e.wait ? 0 : Math.abs(t - e.t), e.wait ? 0 : h.local.distanceTo(e.pos)); return true; }
        }
      }
      if (!e.wait && t > e.t + 0.32) { this.state = 'missed'; this.timer = 0.45; g.judge('orb', 'miss', this.cur.clone(), e); m.opacity = 0; }
      return true;
    }
    if (this.state === 'missed') {
      this.timer -= dt;
      this.cur.z += this.speed * dt;
      this.body.position.copy(this.cur);
      this.body.scale.multiplyScalar(Math.exp(-dt * 7));
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
const SAMPLES = 256;
export class Thread extends Entity {
  constructor(game, ev) {
    super(game, ev);
    const k = ev.hand, col = HAND_COLORS[k];
    this.color = col;
    // path as a glowing tube; its shader shows the woven part bright and the rest as flowing dashes
    const pts = [];
    const n = Math.round(90 * Math.max(1, ev.loops));
    for (let i = 0; i <= n; i++) pts.push(ev.path(i / n, new THREE.Vector3()));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = this.own(new THREE.TubeGeometry(curve, n * 2, 0.009, 6, false));
    this.woven = new Uint8Array(SAMPLES * 4);
    this.wovenTex = this.own(new THREE.DataTexture(this.woven, SAMPLES, 1, THREE.RGBAFormat));
    this.wovenTex.needsUpdate = true;
    this.pathU = { col: { value: col }, progress: { value: 0 }, appear: { value: 0 }, fade: { value: 1 }, woven: { value: this.wovenTex }, time: uTime, loops: { value: Math.max(1, ev.loops) } };
    const mat = this.own(new THREE.ShaderMaterial({
      uniforms: this.pathU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 col; uniform float progress, appear, fade, time, loops; uniform sampler2D woven; varying vec2 vUv;
        void main(){
          float s = vUv.x;
          float a;
          vec3 c = col;
          if (s <= progress) {
            float w = texture2D(woven, vec2(s, 0.5)).r;
            a = mix(0.08, 0.7, w);
            c = mix(col, vec3(1.0), 0.15 * w);
          } else {
            float dash = step(0.45, fract(s * 34.0 * loops - time * 1.6));
            float ahead = 1.0 - smoothstep(0.0, 0.5 / loops, s - progress);
            a = (0.22 + 0.5 * ahead) * dash * appear;
          }
          a *= fade;
          gl_FragColor = vec4(c * a, a);${CS}}`,
    }));
    this.path = new THREE.Mesh(tube, mat);
    this.path.frustumCulled = false;
    this.group.add(this.path);
    // comet head
    this.comet = makeOrb(k, 1.05);
    this.capture = new THREE.Mesh(assets().plane, this.own(reticleMaterial(col, 0.6)));
    this.capture.scale.set(0.42, 0.42, 1);
    this.comet.add(this.capture);
    this.group.add(this.comet);
    this.tail = this.own(new Trail(this.group, { length: 18, width: 0.026, color: col, opacity: 0.8 }));
    this.cpos = new THREE.Vector3();
    this.u = 0;
    this.inside = false; this.insideTime = 0; this.activeTime = 0; this.hapticT = 0;
    this.loopIn = new Float32Array(Math.max(1, Math.ceil(ev.loops)));
    this.loopTot = new Float32Array(Math.max(1, Math.ceil(ev.loops)));
    this.phase = 'lead';
  }
  update(t, dt) {
    const e = this.ev, g = this.game;
    this.age += dt;
    const dur = e.t1 - e.t;
    if (this.phase === 'done') {
      this.fade -= dt;
      this.pathU.fade.value = Math.max(0, this.fade / 0.6);
      this.comet.scale.multiplyScalar(Math.exp(-dt * 8));
      this.tail.visible = false;
      if (this.fade <= 0) { this.dispose(); return false; }
      return true;
    }
    // progress: on the clock, or (tutorial) only while the hand rides the comet
    if (!e.wait) this.u = clamp((t - e.t) / dur, 0, 1);
    e.path(this.u, this.cpos);
    this.comet.position.copy(this.cpos);
    spinOrb(this.comet, t, dt);
    this.pathU.appear.value = clamp(1 - (e.t - t) / (e.lead || 1), 0, 1);
    let inside = false;
    const r = 0.2 + g.assist * 0.04 + (e.wait ? 0.04 : 0);
    for (const h of handsFor(g, e.hand)) if (h.local.distanceTo(this.cpos) < r) { inside = true; this.hand = h; break; }
    if (t >= e.t) {
      this.phase = 'run';
      if (e.wait && inside) this.u = Math.min(1, this.u + dt / dur);
      if (!e.wait || inside) {
        this.activeTime += dt;
        if (inside) this.insideTime += dt;
        const li = Math.min(this.loopIn.length - 1, Math.floor(this.u * e.loops));
        this.loopTot[li] += dt; if (inside) this.loopIn[li] += dt;
      }
      // remember which stretch of the path was woven
      const i1 = Math.min(SAMPLES - 1, Math.floor(this.u * SAMPLES));
      for (let i = this.lastIdx || 0; i <= i1; i++) this.woven[i * 4] = inside ? 255 : Math.max(this.woven[i * 4], 0);
      this.lastIdx = i1;
      this.wovenTex.needsUpdate = true;
      this.pathU.progress.value = this.u;
      if (inside !== this.inside) { g.weave(inside, this); this.inside = inside; }
      if (inside) {
        g.scoreTick(dt * 260, e);
        this.hapticT -= dt;
        if (this.hapticT <= 0 && this.hand) { this.hapticT = 0.11; g.hands.haptic(this.hand.side, 0.18, 30); }
        if (Math.random() < dt * 45) g.fx.spark(this.cpos, this.color, 0.016, 0.6, 0.25);
      }
      this.tail.push(this.cpos, g.eyeLocal);
    } else this.tail.reset(this.cpos);
    const sc = (inside ? 1.35 : 1) * (1 + 0.12 * g.beatPulse) * (t < e.t ? 0.65 + 0.35 * this.pathU.appear.value : 1);
    this.comet.scale.setScalar(sc);
    this.capture.visible = !inside;
    this.capture.rotation.z = -t * 1.5;
    if (this.u >= 1 && (e.wait || t >= e.t1)) this.finish();
    return true;
  }
  finish() {
    const frac = this.activeTime > 0 ? this.insideTime / this.activeTime : 0;
    const judge = this.ev.wait ? 'perfect' : frac >= 0.8 ? 'perfect' : frac >= 0.55 ? 'great' : frac >= 0.3 ? 'good' : 'miss';
    let loops = 0;
    for (let i = 0; i < this.loopIn.length; i++) if (this.loopTot[i] > 0 && this.loopIn[i] / this.loopTot[i] >= 0.5) loops++;
    if (this.inside) { this.game.weave(false, this); this.inside = false; }
    this.game.judge('thread', judge, this.cpos.clone(), this.ev, null, { frac, loops });
    this.phase = 'done'; this.fade = 0.6;
  }
  cancel() { if (this.inside) this.game.weave(false, this); this.dispose(); }
}

// ---------------- Gate: hold a pose (wing / Y / overhead / cross-body / side bend) ----------------
const POSE_NAME = { wing: ['WING', 'wing'], sky: ['Y-RAISE', 'yraise'], crown: ['REACH UP', 'stretch'], cross: ['CROSS-BODY', 'hand'], bendL: ['SIDE STRETCH', 'stretch'], bendR: ['SIDE STRETCH', 'stretch'] };
const cardTex = new Map();
function poseCard(pose, long) {
  const k = pose + long;
  if (cardTex.has(k)) return cardTex.get(k);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 168;
  const c = cv.getContext('2d');
  roundRect(c, 4, 4, 504, 160, 40);
  c.fillStyle = 'rgba(14, 12, 44, 0.78)'; c.fill();
  c.lineWidth = 3; c.strokeStyle = 'rgba(255, 209, 102, 0.75)'; c.stroke();
  c.beginPath(); c.arc(84, 84, 52, 0, TAU); c.fillStyle = 'rgba(255, 209, 102, 0.16)'; c.fill();
  icon(c, POSE_NAME[pose][1], 84, 84, 68, C.A, 2.4);
  c.fillStyle = '#fff'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.font = font(50, 800); spaced(c, 3); c.fillText(POSE_NAME[pose][0], 156, 88);
  c.font = font(26, 600); spaced(c, 5); c.fillStyle = C.A; c.fillText(long ? 'STRETCH & BREATHE' : 'HOLD', 158, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  cardTex.set(k, t);
  return t;
}

export class Gate extends Entity {
  constructor(game, ev) {
    super(game, ev);
    const a = assets();
    this.speed = SPAWN_DIST / game.approach;
    this.rings = [];
    for (const h of ev.hands) {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(a.plane, this.own(reticleMaterial(HAND_COLORS[h], 0.9)));
      ring.scale.set(0.46, 0.46, 1);
      const hand = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: iconTexture('hand', h === 'L'), color: HAND_COLORS[h], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      hand.scale.setScalar(0.16);
      const glow = new THREE.Sprite(a.glowMat[h]); glow.scale.setScalar(0.55);
      grp.add(glow, ring, hand);
      this.group.add(grp);
      this.rings.push({ h, grp, ring, target: ev.targets[h] });
    }
    // pose card with a progress bar, in front of the player
    this.card = new THREE.Group();
    const card = new THREE.Mesh(a.plane, this.own(new THREE.MeshBasicMaterial({ map: poseCard(ev.pose, !!ev.long), transparent: true, depthWrite: false })));
    card.scale.set(0.6, 0.197, 1);
    const track = new THREE.Mesh(a.plane, this.own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false })));
    track.scale.set(0.5, 0.014, 1); track.position.set(0, -0.135, 0);
    this.bar = new THREE.Mesh(a.plane, this.own(new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, depthWrite: false })));
    this.bar.scale.set(0.0001, 0.014, 1); this.bar.position.set(-0.25, -0.135, 0.001);
    this.card.add(card, track, this.bar);
    this.cardMats = [card.material, track.material, this.bar.material];
    this.cardHome = new THREE.Vector3(ev.laneX || 0, game.body.eyeY + 0.12, -1.7);
    this.group.add(this.card);
    this.held = 0; this.dur = Math.max(0.2, ev.t1 - ev.t);
    this.keepT = 0;
    this.place(game.t);
  }
  place(t) {
    const e = this.ev, dz = Math.max(0, e.t - t) * this.speed;
    for (const r of this.rings) r.grp.position.set(r.target.x, r.target.y, r.target.z - dz);
    this.card.position.set(this.cardHome.x, this.cardHome.y, this.cardHome.z - dz * 0.5);
  }
  inPose(h, target) {
    const g = this.game, b = g.body, p = h.local;
    if (p.distanceTo(target) < 0.24 + g.assist * 0.05 + (this.ev.wait ? 0.04 : 0)) return true;
    if (this.ev.pose === 'wing') {
      const side = h.side === 'L' ? -1 : 1, lx = this.ev.laneX || 0;
      return side * (p.x - lx) > b.shoulderHalf + b.reach * 0.6 && Math.abs(p.y - target.y) < 0.3 && p.z > target.z - 0.3;
    }
    if (this.ev.pose === 'crown' || this.ev.pose === 'sky') return p.y > b.shoulderY + b.reach * 0.6 && p.distanceTo(target) < 0.38;
    return false;
  }
  update(t, dt) {
    const e = this.ev, g = this.game;
    this.age += dt;
    if (this.done) {
      this.fade -= dt;
      for (const m of this.cardMats) m.opacity = Math.max(0, this.fade * 2) * (m === this.cardMats[1] ? 0.18 : 1);
      for (const r of this.rings) r.grp.scale.multiplyScalar(Math.exp(-dt * 6));
      if (this.fade <= 0) { this.dispose(); return false; }
      return true;
    }
    this.place(t);
    const appear = clamp(1 - (e.t - t) / g.approach, 0, 1);
    this.cardMats[0].opacity = appear;
    for (const r of this.rings) { r.grp.scale.setScalar((1 + 0.1 * g.beatPulse) * Math.min(1, this.age * 3)); r.ring.rotation.z = t * 0.8; }
    let all = false;
    if (t >= e.t - 0.15) {
      all = true;
      for (const r of this.rings) {
        const h = g.hands[r.h];
        const ok = h.tracked && this.inPose(h, r.target);
        r.ring.material.opacity = ok ? 1 : 0.55;
        r.ring.scale.set(ok ? 0.4 : 0.46, ok ? 0.4 : 0.46, 1);
        if (!ok) all = false;
      }
      if (all && (t >= e.t - 0.05 || e.wait)) {
        this.held += dt;
        this.keepT -= dt;
        if (this.keepT <= 0) {
          this.keepT = e.long ? 1.6 : 0.5;
          for (const r of this.rings) g.hands.haptic(r.h, 0.25, 40);
          if (e.long) g.fx.popup('keep', this.card.position.clone().add(new THREE.Vector3(0, 0.22, 0)), 0.8);
        }
        g.scoreTick(dt * (e.long ? 120 : 300), e);
        if (Math.random() < dt * 30) for (const r of this.rings) g.fx.spark(r.grp.position, HAND_COLORS[r.h], 0.02, 0.7, 0.3);
      }
      const f = clamp(this.held / this.dur, 0, 1);
      this.bar.scale.x = Math.max(0.0001, 0.5 * f);
      this.bar.position.x = -0.25 + 0.25 * f;
    }
    this.allIn = all;
    const finished = e.wait ? this.held >= this.dur : t >= e.t1;
    if (finished) {
      const frac = clamp(this.held / this.dur, 0, 1);
      const judge = frac >= 0.72 ? 'perfect' : frac >= 0.45 ? 'great' : frac >= 0.2 ? 'good' : 'miss';
      g.judge('gate', judge, this.card.position.clone(), e, null, { frac });
      this.done = true; this.fade = 0.5;
    }
    return true;
  }
}

// ---------------- Wall: a curtain of light, step aside ----------------
let chevron = null;
function chevronTexture() {
  if (chevron) return chevron;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.strokeStyle = '#ffffff'; c.lineWidth = 16; c.lineCap = 'round'; c.lineJoin = 'round';
  c.shadowColor = '#ffd166'; c.shadowBlur = 18;
  [[60, 0.45], [130, 0.75], [200, 1]].forEach(([x, a]) => { c.globalAlpha = a; c.beginPath(); c.moveTo(x - 28, 26); c.lineTo(x + 10, 64); c.lineTo(x - 28, 102); c.stroke(); });
  chevron = new THREE.CanvasTexture(cv); chevron.colorSpace = THREE.SRGBColorSpace;
  return chevron;
}
const wallMat = () => new THREE.ShaderMaterial({
  uniforms: { time: uTime, opacity: { value: 0 }, col: { value: new THREE.Color('#ff6ad5') }, col2: { value: new THREE.Color('#ffc46b') }, width: { value: 1 } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float time, opacity, width; uniform vec3 col, col2; varying vec2 vUv;
    float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
    void main(){
      float x = vUv.x * width * 9.0;
      float rays = 0.0;
      for (int i = 0; i < 3; i++) { float f = float(i); rays += (0.5 + 0.5 * sin(x * (3.0 + f * 2.3) + time * (0.8 + f * 0.4) + sin(vUv.y * 4.0 + time + f) * 1.5)) * (0.55 - f * 0.12); }
      float flick = 0.75 + 0.25 * sin(time * 9.0 + h(floor(x * 2.0)) * 30.0);
      float v = smoothstep(0.0, 0.06, vUv.y) * pow(1.0 - vUv.y, 0.7);
      float base = exp(-vUv.y * 40.0) * 1.6;
      float edge = max(smoothstep(0.03 / width, 0.0, vUv.x), smoothstep(1.0 - 0.03 / width, 1.0, vUv.x)) * v;
      vec3 c = mix(col2, col, smoothstep(0.0, 0.7, vUv.y));
      float a = (rays * 0.28 * v * flick + edge * 0.8 + base * 0.6) * opacity;
      gl_FragColor = vec4(c * a, a);${CS}}`,
});
export class Wall extends Entity {
  constructor(game, ev) {
    super(game, ev);
    this.speed = SPAWN_DIST / game.approach;
    const W = ev.laneW, half = W * 0.5;
    const spans = ev.free === 0 ? [[-3.2, -half], [half, 3.2]] : ev.free > 0 ? [[-3.2, half + (ev.free - 1) * W]] : [[-half + (ev.free + 1) * W, 3.2]];
    this.spans = spans;
    this.mats = [];
    for (const [x0, x1] of spans) {
      const mat = this.own(wallMat());
      mat.uniforms.width.value = x1 - x0;
      this.mats.push(mat);
      const m = new THREE.Mesh(this.own(new THREE.PlaneGeometry(x1 - x0, 2.6)), mat);
      m.position.set((x0 + x1) / 2, 1.3, 0);
      this.group.add(m);
    }
    // chevrons in the blocked part point to the open lane
    const tex = chevronTexture();
    const marks = ev.free === 0 ? [[-half - 0.32, 1], [half + 0.32, -1]] : [[ev.free * W - Math.sign(ev.free) * (W * 0.5 + 0.3), Math.sign(ev.free)]];
    this.chevrons = [];
    for (const [x, dir] of marks) {
      for (const y of [0.95, 1.45]) {
        const base = { x, dir };
        const sp = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color('#fff3c4'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: dir < 0 ? Math.PI : 0 })));
        sp.scale.set(0.46, 0.23, 1);
        sp.position.set(x, y, 0.02);
        sp.userData = base;
        this.group.add(sp);
        this.chevrons.push(sp);
      }
    }
    game.world.showLane(ev.free);
    this.judged = false;
    this.released = !ev.wait;
    this.z = -SPAWN_DIST;
    this.place(game.t, 0);
  }
  get waiting() { return !this.released; }
  place(t, dt) {
    if (this.ev.wait) {
      // tutorial: glide in, stop 1.6 m away until the player has stepped aside, then sweep past
      if (!this.released) this.z = Math.min(-1.6, this.z + this.speed * 0.6 * dt);
      else this.z += this.speed * dt;
    } else this.z = -(this.ev.t - t) * this.speed;
    this.group.position.z = this.z;
  }
  blocked(x) { return this.spans.some(([x0, x1]) => x > x0 + 0.02 && x < x1 - 0.02); }
  update(t, dt) {
    const e = this.ev, g = this.game;
    this.age += dt;
    if (e.wait && !this.released && this.z >= -1.6 && !this.blocked(g.head.x)) this.released = true;
    this.place(t, dt);
    const z = this.z;
    const op = clamp((z + SPAWN_DIST) / 4, 0, 1) * (z > -0.3 ? clamp(1 - (z + 0.3) / 0.8, 0, 1) : 1);
    for (const m of this.mats) m.uniforms.opacity.value = op;
    for (const c of this.chevrons) {
      c.material.opacity = op * (0.55 + 0.45 * g.beatPulse);
      c.position.x = c.userData.x + c.userData.dir * 0.05 * Math.sin(t * 7);
    }
    if (!this.judged && (e.wait ? z >= -0.05 : t >= e.t)) {
      this.judged = true;
      g.judge('wall', this.blocked(g.head.x) ? 'miss' : 'perfect', new THREE.Vector3(g.head.x, g.body.eyeY - 0.25, -0.6), e);
    }
    if (z > 1.2) { this.dispose(); return false; }
    return true;
  }
}

// ---------------- Bar: a laser beam, bend the knees a little ----------------
export class Bar extends Entity {
  constructor(game, ev) {
    super(game, ev);
    this.speed = SPAWN_DIST / game.approach;
    const b = game.body;
    this.y = b.standEyeY + 0.1 - ev.depth;
    this.need = b.standEyeY - ev.depth * 0.7;
    const cyl = this.own(new THREE.CylinderGeometry(1, 1, 4.6, 16, 1, true));
    const core = new THREE.Mesh(cyl, this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color('#eafff6') })));
    core.scale.set(0.012, 1, 0.012);
    const glow = new THREE.Mesh(cyl, rimMaterial(GREEN, 1.2, 1.2));
    glow.scale.set(0.05, 1, 0.05);
    const beam = new THREE.Group(); beam.add(glow, core); beam.rotation.z = Math.PI / 2;
    this.group.add(beam);
    const flare = this.own(new THREE.SpriteMaterial({ map: assets().glow, color: GREEN, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (let i = -3; i <= 3; i++) { const s = new THREE.Sprite(flare); s.scale.set(0.8, 0.16, 1); s.position.x = i * 0.65; this.group.add(s); }
    // downward chevrons above the player's lane: "go under"
    const ch = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: chevronTexture(), color: GREEN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: -Math.PI / 2 })));
    ch.scale.set(0.34, 0.17, 1); ch.position.set(0, 0.22, 0);
    this.chev = ch;
    this.group.add(ch);
    this.group.position.set(ev.laneX, this.y, 0);
    this.minEye = 9;
    this.released = !ev.wait;
    this.z = -SPAWN_DIST;
    this.place(game.t, 0);
  }
  get waiting() { return !this.released; }
  place(t, dt) {
    if (this.ev.wait) {
      if (!this.released) this.z = Math.min(-1.4, this.z + this.speed * 0.6 * dt);
      else this.z += this.speed * dt;
    } else this.z = -(this.ev.t - t) * this.speed;
    this.group.position.z = this.z;
  }
  update(t, dt) {
    const e = this.ev, g = this.game;
    if (e.wait && !this.released && this.z >= -1.4 && g.head.y < this.need) { this.released = true; this.minEye = g.head.y; }
    this.place(t, dt);
    this.chev.material.opacity = 0.5 + 0.5 * g.beatPulse;
    if (!e.wait && t > e.t - 0.3 && t < e.t + 0.12) this.minEye = Math.min(this.minEye, g.head.y);
    if (e.wait && this.released) this.minEye = Math.min(this.minEye, g.head.y);
    if (!this.judged && (e.wait ? this.z >= -0.05 : t >= e.t + 0.12)) {
      this.judged = true;
      g.judge('bar', this.minEye < this.need ? 'perfect' : 'miss', new THREE.Vector3(g.head.x, this.y + 0.15, -0.7), e);
    }
    if (this.z > 1.2) { this.dispose(); return false; }
    return true;
  }
}

// ---------------- Gaze: follow a firefly with your head (slow neck mobility) ----------------
export class Gaze extends Entity {
  constructor(game, ev) {
    super(game, ev);
    this.fly = makeOrb('A', 0.8);
    this.group.add(this.fly);
    this.tail = this.own(new Trail(this.group, { length: 26, width: 0.03, color: '#c6ff6a', opacity: 0.8 }));
    this.pos = new THREE.Vector3();
    this.on = 0; this.tot = 0;
  }
  update(t, dt) {
    const e = this.ev, g = this.game;
    const u = clamp((t - e.t) / (e.t1 - e.t), 0, 1);
    e.path(u, this.pos);
    this.fly.position.copy(this.pos);
    spinOrb(this.fly, t, dt);
    const s = clamp((t - e.t + 1) / 1, 0, 1) * clamp((e.t1 + 0.5 - t) / 0.5, 0, 1);
    this.fly.scale.setScalar(0.8 * s * (1 + 0.12 * g.beatPulse));
    this.tail.push(this.pos, g.eyeLocal);
    if (t >= e.t) {
      tmpA.subVectors(this.pos, g.head).normalize();
      const ang = Math.acos(clamp(tmpA.dot(g.headDir), -1, 1));
      this.tot += dt;
      if (ang < 13 * DEG) { this.on += dt; g.scoreTick(dt * 120, e); if (Math.random() < dt * 20) g.fx.spark(this.pos, HAND_COLORS.A, 0.02, 0.8, 0.2); }
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
    case 'orb': case 'gate': case 'wall': case 'bar': return approach;
    case 'thread': return ev.lead || barSec;
    case 'gaze': return 1.2;
    default: return 0;
  }
}

export const ENTITY = { orb: Orb, thread: Thread, gate: Gate, wall: Wall, bar: Bar, gaze: Gaze };
