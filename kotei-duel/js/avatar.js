// js/avatar.js — who you duel, standing across the table: President Kami of God Mart (a cheerful client with a
// halo and little wings — not a villain, he just does not know IT), or a spirit of a common failure:
// the Death March (a flame), the Bug King (a giant beetle with a crown) and Shougai (a ghost in a server rack).
// Built from primitives; the face is a canvas that changes with the mood. act() plays a short reaction.
import * as THREE from 'three';
import { canvasTex } from './board.js';
import { TABLE_H } from './room.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

function faceCanvas() {
  const f = canvasTex(256, 256);
  f.draw = (mood = 'normal') => {
    const c = f.ctx;
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = '#ffd9b8'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(255,120,120,0.35)';
    c.beginPath(); c.arc(70, 160, 22, 0, Math.PI * 2); c.arc(186, 160, 22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2a1a10'; c.fillStyle = '#2a1a10'; c.lineWidth = 9; c.lineCap = 'round';
    // brows
    const browTilt = mood === 'angry' ? 14 : mood === 'worried' ? -10 : 0;
    c.beginPath(); c.moveTo(62, 92 - browTilt); c.lineTo(104, 92 + browTilt * 0.4); c.moveTo(194, 92 - browTilt); c.lineTo(152, 92 + browTilt * 0.4); c.stroke();
    // eyes
    if (mood === 'happy') { c.beginPath(); c.arc(84, 124, 14, Math.PI * 1.1, Math.PI * 1.9); c.arc(172, 124, 14, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    else if (mood === 'surprised') { c.beginPath(); c.arc(84, 122, 13, 0, Math.PI * 2); c.arc(172, 122, 13, 0, Math.PI * 2); c.fill(); }
    else { c.beginPath(); c.ellipse(84, 122, 9, 13, 0, 0, Math.PI * 2); c.ellipse(172, 122, 9, 13, 0, 0, Math.PI * 2); c.fill(); }
    // mustache
    c.fillStyle = '#6b6b6b';
    c.beginPath(); c.ellipse(104, 176, 30, 12, 0.2, 0, Math.PI * 2); c.ellipse(152, 176, 30, 12, -0.2, 0, Math.PI * 2); c.fill();
    // mouth
    c.strokeStyle = '#7a1f1f'; c.lineWidth = 8;
    c.beginPath();
    if (mood === 'happy') c.arc(128, 196, 26, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mood === 'angry' || mood === 'worried') c.arc(128, 224, 22, 1.2 * Math.PI, 1.8 * Math.PI);
    else if (mood === 'surprised') c.ellipse(128, 206, 12, 16, 0, 0, Math.PI * 2);
    else { c.moveTo(108, 206); c.lineTo(148, 206); }
    c.stroke();
    f.tex.needsUpdate = true;
  };
  return f;
}

function president() {
  const g = new THREE.Group();
  const suit = std('#1d2b5a');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 16), suit);
  body.position.y = 0.75; body.scale.set(1.15, 1, 0.85);
  const shirt = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.34), std('#ffffff'));
  shirt.position.set(0, 0.98, 0.215);
  const tie = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.26), std('#d4262f'));
  tie.position.set(0, 0.96, 0.218);
  // "神" on the chest badge
  const b = canvasTex(64, 64);
  b.ctx.fillStyle = '#ffcf3f'; b.ctx.beginPath(); b.ctx.arc(32, 32, 30, 0, Math.PI * 2); b.ctx.fill();
  b.ctx.fillStyle = '#5a3a00'; b.ctx.font = '900 40px sans-serif'; b.ctx.textAlign = 'center'; b.ctx.textBaseline = 'middle'; b.ctx.fillText('神', 32, 35); b.tex.needsUpdate = true;
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), new THREE.MeshBasicMaterial({ map: b.tex }));
  badge.position.set(-0.13, 1.05, 0.2); badge.rotation.y = -0.35;
  const face = faceCanvas(); face.draw('normal');
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), [std('#ffd9b8')]);
  head.position.y = 1.36;
  const faceM = new THREE.Mesh(new THREE.SphereGeometry(0.201, 24, 18, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.18, Math.PI * 0.64), new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.8 }));
  faceM.position.copy(head.position);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.35), std('#9a9a9a'));
  hair.position.y = 1.37;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 10, 40), new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffb000', emissiveIntensity: 1.2 }));
  halo.rotation.x = Math.PI / 2; halo.position.y = 1.66;
  const wingMat = std('#ffffff', { side: THREE.DoubleSide, emissive: '#cfe0ff', emissiveIntensity: 0.25 });
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.2, 0.2, 0.42, 0.28, 0.5, 0.1); wingShape.bezierCurveTo(0.4, 0.06, 0.38, -0.05, 0.3, -0.12); wingShape.bezierCurveTo(0.2, -0.1, 0.1, -0.12, 0, 0);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ShapeGeometry(wingShape, 12), wingMat);
    w.scale.set(s, 1, 1);
    w.position.set(s * 0.12, 1.02, -0.18);
    w.rotation.y = s * 0.5;
    g.add(w); wings.push(w);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.36, 4, 10), suit);
    a.position.set(s * 0.36, 0.86, 0.02); a.rotation.z = s * 0.25;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), std('#ffd9b8'));
    hand.position.set(0, -0.25, 0); a.add(hand);
    g.add(a); arms.push(a);
  }
  g.add(body, shirt, tie, badge, head, faceM, hair, halo);
  g.userData = { face, halo, wings, arms, head: [head, faceM, hair] };
  return g;
}

function flameSpirit() {
  const g = new THREE.Group();
  const flames = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.12 + Math.random() * 0.12, 0.5 + Math.random() * 0.5, 10, 1, true), new THREE.MeshBasicMaterial({ color: i % 3 ? '#ff6a1f' : '#ffcf3f', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set((Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.25);
    m.userData.ph = Math.random() * 6;
    g.add(m); flames.push(m);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), new THREE.MeshBasicMaterial({ color: '#ff3d00' }));
  core.position.y = 1.0;
  g.add(core);
  const eyes = eyePair('#fff6c9');
  eyes.position.set(0, 1.08, 0.24);
  g.add(eyes);
  g.userData = { flames, core };
  return g;
}

function bugKing() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), std('#d4202a', { roughness: 0.3, metalness: 0.2 }));
  shell.scale.set(1, 0.75, 1.1); shell.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), std('#2a0a0c'));
  head.position.set(0, 1.05, 0.38);
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.8), std('#2a0a0c'));
  line.position.set(0, 1.25, 0);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.14, 8, 1, true), std('#ffcf3f', { metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide }));
  crown.position.set(0, 1.27, 0.38);
  const legs = [];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), std('#2a0a0c'));
    l.position.set(s * 0.42, 0.75, -0.2 + i * 0.22); l.rotation.z = s * 0.9;
    g.add(l); legs.push(l);
  }
  const eyes = eyePair('#ffffff');
  eyes.position.set(0, 1.1, 0.56); eyes.scale.setScalar(0.8);
  g.add(shell, head, line, crown, eyes);
  g.userData = { legs, shell };
  return g;
}

function serverGhost() {
  const g = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: '#b9c6ff', transparent: true, opacity: 0.45, emissive: '#5a6aff', emissiveIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  sheet.position.y = 1.0; sheet.scale.set(1, 1.6, 1);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.3), std('#1a1f33', { metalness: 0.5, roughness: 0.4 }));
  rack.position.y = 0.7;
  const leds = [];
  for (let i = 0; i < 8; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.01), new THREE.MeshBasicMaterial({ color: i % 3 ? '#2fd08f' : '#ff4d4d' }));
    l.position.set(-0.12 + (i % 2) * 0.05, 0.4 + Math.floor(i / 2) * 0.16, 0.156);
    g.add(l); leds.push(l);
  }
  const eyes = eyePair('#ff4d4d');
  eyes.position.set(0, 1.3, 0.36);
  g.add(rack, sheet, eyes);
  g.userData = { leds, sheet };
  return g;
}

function eyePair(color) {
  const e = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color }));
    m.scale.set(1, 1.3, 0.5); m.position.x = s * 0.09;
    e.add(m);
  }
  return e;
}

export class Avatar {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, -1.2);
    scene.add(this.group);
    this.kind = null;
    this.t = 0;
    this.anim = null;
    this.mood = 'normal';
  }
  set(art) {
    const icon = art?.icon || 'boss';
    const kind = icon === 'boss' ? 'president' : icon === 'fire' ? 'flame' : icon === 'bug' ? 'bug' : 'ghost';
    if (kind === this.kind) return;
    this.kind = kind;
    this.group.clear();
    this.fig = kind === 'president' ? president() : kind === 'flame' ? flameSpirit() : kind === 'bug' ? bugKing() : serverGhost();
    this.group.add(this.fig);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: kind === 'president' ? '#ffcf3f' : '#ff4d4d', transparent: true, opacity: 0.25, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01;
    this.group.add(glow);
  }
  setMood(m) {
    this.mood = m;
    if (this.fig?.userData.face) this.fig.userData.face.draw(m);
  }
  // 'play' (shows a card), 'attack', 'hit', 'happy', 'lose', 'win'
  act(type) {
    this.anim = { type, t: 0 };
    if (type === 'attack') this.setMood('angry');
    else if (type === 'hit') this.setMood('surprised');
    else if (type === 'happy' || type === 'lose') this.setMood('happy');
    else if (type === 'win') this.setMood('worried');
    else if (type === 'play') this.setMood('normal');
  }
  tick(dt) {
    this.t += dt;
    const f = this.fig;
    if (!f) return;
    f.position.y = Math.sin(this.t * 1.6) * 0.015;
    f.rotation.set(0, Math.sin(this.t * 0.5) * 0.08, 0);
    const u = f.userData;
    if (u.halo) u.halo.rotation.z += dt * 0.8;
    if (u.wings) u.wings.forEach((w, i) => { w.rotation.y = (i ? 1 : -1) * (0.5 + Math.sin(this.t * 3) * 0.15); });
    if (u.flames) u.flames.forEach((m) => { m.scale.y = 0.8 + Math.sin(this.t * 6 + m.userData.ph) * 0.25; m.position.y += Math.sin(this.t * 5 + m.userData.ph) * 0.0015; });
    if (u.leds) u.leds.forEach((l, i) => { l.visible = Math.sin(this.t * 7 + i * 1.7) > -0.3; });
    if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.t * 6 + i) * 0.2; });
    const a = this.anim;
    if (a) {
      a.t += dt;
      const k = a.t;
      if (a.type === 'attack') { f.position.z = Math.sin(Math.min(1, k / 0.35) * Math.PI) * 0.35; if (u.arms) u.arms[1].rotation.x = -Math.sin(Math.min(1, k / 0.35) * Math.PI) * 1.4; }
      else if (a.type === 'hit') { f.position.x = Math.sin(k * 40) * 0.03 * Math.max(0, 1 - k * 2); f.rotation.x = -0.15 * Math.max(0, 1 - k * 2); }
      else if (a.type === 'play') { if (u.arms) u.arms[0].rotation.x = -Math.sin(Math.min(1, k / 0.5) * Math.PI) * 1.2; }
      else if (a.type === 'happy' || a.type === 'lose') { f.position.y += Math.abs(Math.sin(k * 8)) * 0.06 * Math.max(0, 1 - k / 1.5); }
      else if (a.type === 'win') { f.position.y += Math.sin(k * 3) * 0.02; }
      if (k > 1.6) { this.anim = null; f.position.set(0, f.position.y, 0); if (u.arms) u.arms.forEach((x) => (x.rotation.x = 0)); if (this.mood !== 'happy' && this.mood !== 'worried') this.setMood('normal'); }
    }
  }
  // where to put a speech bubble
  top() { return new THREE.Vector3(0, TABLE_H + 1.15, -1.2); }
}
