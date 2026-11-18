// js/ballview.js — what you see of the ball: the felt ball with its seam turning with the spin, the shadow
// under it (the main depth cue in tennis), a faint trail, marks where it bounced, and the target markers.
import * as THREE from 'three';
import { BALL_R } from './physics.js';

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d7ec3a';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,200,0.12)' : 'rgba(120,140,0,0.12)';
    g.fillRect(Math.random() * 256, Math.random() * 128, 2, 2);
  }
  // the seam: a curve winding around the ball (equirectangular)
  g.strokeStyle = 'rgba(250,250,240,0.95)';
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= 256; i++) {
    const u = i / 256 * Math.PI * 2;
    const v = 64 + Math.sin(u * 2) * 34;
    if (i === 0) g.moveTo(i, v); else g.lineTo(i, v);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function ringTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = color; g.lineWidth = 18;
  g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 6; g.globalAlpha = 0.6;
  g.beginPath(); g.arc(128, 128, 60, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TRAIL_N = 18;

export class BallView {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.95 }));
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    // blob shadow straight below (sharper and darker as the ball comes down)
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);
    // trail
    this.trailPos = new Float32Array(TRAIL_N * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    const alpha = new Float32Array(TRAIL_N);
    for (let i = 0; i < TRAIL_N; i++) alpha[i] = 1 - i / TRAIL_N;
    tg.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    this.trail = new THREE.Line(tg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.95, 1.0, 0.6, vA * 0.45); }',
    }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.trailInit = false;
    // bounce marks (clay keeps them; others fade)
    this.marks = [];
    this.markTex = radialTexture('rgba(255,255,255,0.0)', 'rgba(255,255,255,0)');
    // markers
    this.target = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: ringTexture('#ffffff'), transparent: true, depthWrite: false, opacity: 0.8, color: 0x7fffd4 }));
    this.target.rotation.x = -Math.PI / 2;
    this.target.position.y = 0.01;
    this.target.renderOrder = 3;
    this.target.visible = false;
    scene.add(this.target);
    this.bounceMark = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: ringTexture('#ffd23f'), transparent: true, depthWrite: false, opacity: 0.85 }));
    this.bounceMark.rotation.x = -Math.PI / 2;
    this.bounceMark.position.y = 0.012;
    this.bounceMark.renderOrder = 3;
    this.bounceMark.visible = false;
    scene.add(this.bounceMark);
    this.prevQ = new THREE.Quaternion();
    this.visible = true;
  }

  setVisible(v) {
    this.visible = v;
    this.mesh.visible = this.shadow.visible = v;
    if (!v) { this.trail.visible = false; this.trailInit = false; }
  }

  /** b: physics state; dt: frame time; trailOn */
  update(b, dt, trailOn) {
    const p = b.p;
    this.mesh.position.set(p.x, p.y, p.z);
    // spin the mesh with the ball's angular velocity
    const w = b.w, wm = Math.hypot(w.x, w.y, w.z);
    if (wm > 0.01) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(w.x / wm, w.y / wm, w.z / wm), Math.min(wm * dt, 1.2));
      this.mesh.quaternion.premultiply(q);
    }
    const h = Math.max(0, p.y - BALL_R);
    const s = 0.07 + h * 0.03;
    this.shadow.scale.set(s, s, 1);
    this.shadow.position.set(p.x, 0.004, p.z);
    this.shadow.material.opacity = Math.max(0.15, 0.9 - h * 0.18);
    // trail
    this.trail.visible = this.visible && trailOn;
    if (!this.trailInit) { for (let i = 0; i < TRAIL_N; i++) { this.trailPos[i * 3] = p.x; this.trailPos[i * 3 + 1] = p.y; this.trailPos[i * 3 + 2] = p.z; } this.trailInit = true; }
    this.trailPos.copyWithin(3, 0, (TRAIL_N - 1) * 3);
    this.trailPos[0] = p.x; this.trailPos[1] = p.y; this.trailPos[2] = p.z;
    this.trail.geometry.attributes.position.needsUpdate = true;
  }
  resetTrail() { this.trailInit = false; }

  /** a mark where the ball bounced. surface: 'clay' marks stay until the next point */
  mark(x, z, surface, out) {
    const col = surface === 'clay' ? 0x7a3418 : surface === 'grass' ? 0x3a6a2a : 0x1d3d66;
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: out ? 0xff5040 : col, transparent: true, opacity: surface === 'clay' ? 0.75 : 0.5, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.scale.set(0.035, 0.06, 1);
    m.position.set(x, 0.003, z);
    m.renderOrder = 1;
    m.userData.life = surface === 'clay' ? 30 : 4;
    this.scene.add(m);
    this.marks.push(m);
    if (this.marks.length > 12) { const o = this.marks.shift(); this.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
  }
  clearMarks() { for (const m of this.marks) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } this.marks.length = 0; }
  tickMarks(dt) {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.userData.life -= dt;
      if (m.userData.life < 1) m.material.opacity = Math.max(0, m.userData.life) * 0.5;
      if (m.userData.life <= 0) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); this.marks.splice(i, 1); }
    }
  }
  showTarget(x, z, on, t, reachable) {
    this.target.visible = on;
    if (!on) return;
    this.target.position.x = x; this.target.position.z = z;
    const pulse = 1 + Math.sin(t * 8) * 0.05;
    this.target.scale.set(pulse, pulse, 1);
    this.target.material.color.setHex(reachable ? 0x7fffd4 : 0xffa070);
  }
  showBounce(x, z, on) {
    this.bounceMark.visible = on;
    if (on) { this.bounceMark.position.x = x; this.bounceMark.position.z = z; }
  }
}
