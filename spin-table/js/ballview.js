// js/ballview.js — the ball as you see it. Its printed logo turns with the ball's true spin; when the spin is too
// fast for the eye (more than ~40° a frame) the logo smears into a band around the spin axis, as on a real
// spinning ball, so you can read the axis. A soft shadow straight below (the hall's lights are overhead), an
// optional trail and bounce marks, and a flash where the paddle met the ball.
import * as THREE from 'three';
import { BALL_R, TABLE } from './physics.js';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** equirectangular ball skin: plain plastic with a printed logo (★★★ 40+) */
function ballSkin(color, twoTone) {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 512, 256);
  if (twoTone) { g.fillStyle = twoTone; g.fillRect(0, 0, 256, 256); }
  // the seam
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 126, 512, 4);
  // the logo, printed twice (both sides of the ball), squeezed for the projection
  for (const cx of [128, 384]) {
    g.save(); g.translate(cx, 80); g.scale(1, 1.05);
    g.fillStyle = twoTone && cx < 256 ? '#fff' : '#1b2a6b';
    g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★★★', 0, -4);
    g.font = 'bold 15px Arial, sans-serif';
    g.fillText('SPIN 40+', 0, 18);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** the smeared logo: a band at the logo's latitude around the pole (the spin axis = texture's y) */
function blurSkin() {
  const c = canvas(64, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 64, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.0, 'rgba(27,42,107,0)');
  gr.addColorStop(0.22, 'rgba(27,42,107,0.0)');
  gr.addColorStop(0.30, 'rgba(27,42,107,0.55)');
  gr.addColorStop(0.38, 'rgba(27,42,107,0.0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function ringTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export const BALL_COLORS = { white: ['#f7f7f2', null], orange: ['#ff8a1c', null], training: ['#f7f7f2', '#ff7a12'] };

export class BallView {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const geo = new THREE.SphereGeometry(BALL_R, 32, 20);
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0 });
    this.ball = new THREE.Mesh(geo, this.mat);
    this.ball.castShadow = false;
    this.group.add(this.ball);
    this.setColor(opts.color || 'white');
    this.blur = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.004, 32, 20), new THREE.MeshBasicMaterial({ map: blurSkin(), transparent: true, depthWrite: false }));
    this.blur.visible = false;
    this.group.add(this.blur);
    this.q = new THREE.Quaternion();
    // the shadow on the table or the floor
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.6 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);
    // trail
    this.trailN = 28;
    this.trailPts = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.trailN * 3), 3));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.trailN * 3), 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.trailOn = opts.trail ?? true;
    // bounce marks and hit flashes
    this.marks = [];
    this.flashes = [];
    this.ringTex = ringTexture();
    this.markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: this.ringTex, transparent: true, depthWrite: false, opacity: 0.8 });
    this.marksOn = opts.marks ?? true;
    this.squash = 0;
    this.squashN = new THREE.Vector3(0, 1, 0);
  }
  setColor(key) {
    const [c, two] = BALL_COLORS[key] || BALL_COLORS.white;
    if (this.mat.map) this.mat.map.dispose();
    this.mat.map = ballSkin(c, two);
    this.mat.needsUpdate = true;
  }
  /** b: the physics ball; dt: frame time; visible */
  update(b, dt, visible = true) {
    this.group.visible = visible;
    this.shadow.visible = visible && b.p.y > -0.5;
    if (!visible) { this.trail.visible = false; this.tickFx(dt); return; }
    this.group.position.set(b.p.x, b.p.y, b.p.z);
    // spin: integrate the true angular velocity
    const w = b.w, wm = Math.hypot(w.x, w.y, w.z);
    const ang = wm * dt;
    if (wm > 1e-3) {
      const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(w.x / wm, w.y / wm, w.z / wm), ang);
      this.q.premultiply(dq);
    }
    // too fast to see: the logo becomes a band around the axis
    const smear = Math.min(1, Math.max(0, (ang - 0.7) / 1.2));
    this.ball.quaternion.copy(this.q);
    this.blur.visible = smear > 0.02;
    if (this.blur.visible) {
      this.blur.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(w.x / wm, w.y / wm, w.z / wm));
      this.blur.material.opacity = smear;
    }
    // squash on impact (a couple of frames)
    if (this.squash > 0) {
      const s = 1 - 0.25 * this.squash;
      this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.squashN);
      this.group.scale.set(1 + 0.1 * this.squash, s, 1 + 0.1 * this.squash);
      this.ball.quaternion.premultiply(this.group.quaternion.clone().invert());
      this.squash = Math.max(0, this.squash - dt / 0.03);
    } else { this.group.scale.set(1, 1, 1); this.group.quaternion.identity(); }
    // shadow below: on the table when over it, else on the floor
    const over = Math.abs(b.p.x) < TABLE.halfW && Math.abs(b.p.z) < TABLE.halfL && b.p.y > TABLE.h;
    const y0 = over ? TABLE.h + 0.0015 : 0.002;
    const hgt = Math.max(0, b.p.y - BALL_R - y0);
    const sz = BALL_R * 2.4 * (1 + hgt * 1.4);
    this.shadow.position.set(b.p.x, y0, b.p.z);
    this.shadow.scale.set(sz, sz, 1);
    this.shadow.material.opacity = Math.max(0.08, 0.75 / (1 + hgt * 3.5)) * (over ? 1 : 0.7);
    // trail
    this.trail.visible = this.trailOn;
    if (this.trailOn) {
      this.trailPts.unshift([b.p.x, b.p.y, b.p.z]);
      if (this.trailPts.length > this.trailN) this.trailPts.length = this.trailN;
      const pa = this.trail.geometry.attributes.position, ca = this.trail.geometry.attributes.color;
      for (let i = 0; i < this.trailN; i++) {
        const q = this.trailPts[Math.min(i, this.trailPts.length - 1)];
        pa.setXYZ(i, q[0], q[1], q[2]);
        const k = Math.max(0, 1 - i / this.trailN);
        ca.setXYZ(i, 0.55 * k, 0.8 * k, 1.0 * k);
      }
      pa.needsUpdate = true; ca.needsUpdate = true;
      this.trail.geometry.computeBoundingSphere();
    }
    this.tickFx(dt);
  }
  resetTrail() { this.trailPts.length = 0; }
  /** a bounce mark on the table */
  mark(x, z, color = 0xffffff) {
    if (!this.marksOn) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), this.markMat.clone());
    m.material.color.set(color);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, TABLE.h + 0.0012, z);
    m.renderOrder = 3;
    this.scene.add(m);
    this.marks.push({ m, t: 0 });
    if (this.marks.length > 6) { const o = this.marks.shift(); this.scene.remove(o.m); o.m.material.dispose(); }
  }
  /** a flash where the paddle met the ball; n: the paddle normal; strength 0…1; clean: sweet spot */
  flash(p, n, strength, clean) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({
      map: this.ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: clean ? 0xfff2b0 : 0xff9a6a, opacity: 0.9,
    }));
    m.position.copy(p);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    this.scene.add(m);
    this.flashes.push({ m, t: 0, s: 0.6 + strength });
    this.squash = Math.min(1, 0.4 + strength);
    this.squashN.copy(n);
  }
  tickFx(dt) {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const k = this.marks[i];
      k.t += dt;
      k.m.material.opacity = Math.max(0, 0.8 * (1 - k.t / 3.5));
      if (k.t > 3.5) { this.scene.remove(k.m); k.m.material.dispose(); this.marks.splice(i, 1); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / 0.16;
      f.m.scale.setScalar(1 + k * 2.5 * f.s);
      f.m.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { this.scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); this.flashes.splice(i, 1); }
    }
  }
}
