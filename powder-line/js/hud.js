// js/hud.js — what you read while riding. In VR nothing is stuck to your face: the menu is a board you
// point at, the clock is on your left wrist, trick names float up ahead on the slope, and a ring at your feet
// shows where your weight is (lean, crouch, the centre). A comfort vignette narrows the view while you turn hard.
import * as THREE from 'three';
import { textCanvas, FONT, wrap } from './geo.js';

const ACC = '#ffd23f';

// a canvas board with buttons, used in VR (pointed at with the laser)
export class Board3D {
  constructor(w = 1024, h = 1024, wm = 1.25) {
    const { canvas, ctx, tex } = textCanvas(w, h);
    Object.assign(this, { canvas, ctx, tex, w, h, wm, hm: (wm * h) / w });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.wm, this.hm), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: true }));
    this.mesh.renderOrder = 20;
    this.buttons = [];
    this.hover = null;
  }
  hitButton(uv) {
    const x = uv.x * this.w, y = (1 - uv.y) * this.h;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }
  // spec: { title, sub, lines: [text], stats: [[label, value]], buttons: [{ id, label, on, wide, primary }] }
  draw(spec) {
    this.spec = spec;
    const c = this.ctx, W = this.w, H = this.h;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,18,40,0.93)';
    c.beginPath(); c.roundRect(4, 4, W - 8, H - 8, 40); c.fill();
    c.strokeStyle = 'rgba(160,200,255,0.35)'; c.lineWidth = 4; c.stroke();
    let y = 74;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    if (spec.title) { c.fillStyle = ACC; c.font = `900 60px ${FONT}`; c.fillText(spec.title, 48, y); y += 22; }
    if (spec.sub) { c.fillStyle = '#a9c4ff'; c.font = `700 30px ${FONT}`; y += 26; c.fillText(spec.sub, 50, y); y += 10; }
    c.fillStyle = '#eef3ff'; c.font = `500 32px ${FONT}`;
    for (const t of spec.lines || []) for (const l of wrap(c, t, W - 100)) { y += 44; c.fillText(l, 50, y); }
    if (spec.stats) {
      y += 20;
      c.font = `700 34px ${FONT}`;
      for (const [k, v] of spec.stats) { y += 48; c.fillStyle = '#a9c4ff'; c.fillText(k, 60, y); c.fillStyle = '#ffffff'; c.textAlign = 'right'; c.fillText(v, W - 60, y); c.textAlign = 'left'; }
    }
    if (spec.big) { y += 120; c.fillStyle = ACC; c.font = `900 120px ${FONT}`; c.textAlign = 'center'; c.fillText(spec.big, W / 2, y); c.textAlign = 'left'; }
    // buttons in a two-column grid from wherever the text ended
    this.buttons = [];
    y = Math.max(y + 30, spec.buttonsTop || 0);
    const bw = (W - 120) / 2, bh = 84;
    let col = 0;
    for (const b of spec.buttons || []) {
      const wide = b.wide;
      if (wide && col === 1) { col = 0; y += bh + 16; }
      const x = 48 + (wide ? 0 : col * (bw + 24));
      const w = wide ? W - 96 : bw;
      this.buttons.push({ ...b, x, y, w, h: bh });
      if (wide || col === 1) { col = 0; y += bh + 16; } else col = 1;
    }
    this.paintButtons();
  }
  paintButtons() {
    const c = this.ctx;
    for (const b of this.buttons) {
      const hov = this.hover === b.id;
      c.fillStyle = b.primary ? (hov ? '#ffe680' : ACC) : b.on ? (hov ? '#8ff0e4' : '#5fd8c8') : hov ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)';
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 22); c.fill();
      c.fillStyle = b.primary || b.on ? '#0b1230' : '#ffffff';
      c.font = `800 ${b.label.length > 14 ? 28 : 34}px ${FONT}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 2);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }
    this.tex.needsUpdate = true;
  }
  setHover(id) { if (id !== this.hover) { this.hover = id; this.draw(this.spec); } }
}

export class VRHud {
  constructor(app) {
    this.app = app;
    this.panel = new Board3D(1024, 1100, 1.15);
    this.panel.mesh.visible = false;
    app.dolly.add(this.panel.mesh);
    // wrist display on the left controller
    const w = textCanvas(512, 200);
    this.wrist = { ...w, mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.066), new THREE.MeshBasicMaterial({ map: w.tex, transparent: true })) };
    this.wrist.mesh.position.set(0, 0.045, 0.06);
    this.wrist.mesh.rotation.x = -1.0;
    this.wristT = 0;
    // floating messages in front (they ride with you, but are not stuck to your head)
    this.pops = [];
    for (let i = 0; i < 5; i++) {
      const t = textCanvas(1024, 200);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.51), new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthTest: false }));
      m.renderOrder = 30; m.visible = false;
      app.dolly.add(m);
      this.pops.push({ ...t, mesh: m, life: 0 });
    }
    const b = textCanvas(1024, 300);
    this.big = { ...b, mesh: new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7), new THREE.MeshBasicMaterial({ map: b.tex, transparent: true, depthTest: false })) };
    this.big.mesh.renderOrder = 31; this.big.mesh.visible = false;
    app.dolly.add(this.big.mesh);
    // the ring at your feet
    const f = textCanvas(512, 512);
    this.feet = { ...f, mesh: new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: f.tex, transparent: true, depthWrite: false })) };
    this.feet.mesh.rotation.x = -Math.PI / 2;
    this.feet.mesh.renderOrder = 5;
    this.feet.mesh.visible = false;
    app.dolly.add(this.feet.mesh);
    this.feetT = 0;
    // comfort vignette (head-locked on purpose: it only darkens the edges)
    this.vig = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { k: { value: 0 }, col: { value: new THREE.Color('#000000') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float k; uniform vec3 col; varying vec2 vUv; void main(){ float r = length(vUv) * 2.4; float inner = mix(1.6, 0.55, k); float a = smoothstep(inner, inner + 0.45, r) * min(1.0, k * 3.0); gl_FragColor = vec4(col, a); }',
    }));
    this.vig.position.z = -0.4;
    this.vig.renderOrder = 100;
    this.vig.frustumCulled = false;
    this.vig.visible = false;
    // a white fade for falls (never tumble the camera)
    this.fade = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.fade.renderOrder = 101;
    this.fade.visible = false;
    app.camera.add(this.vig, this.fade);
    this.vigK = 0;
  }

  attachWrist(grip) { grip.add(this.wrist.mesh); }

  // put the panel in front of where the head looks (play space), at a comfortable height
  placePanel(head, yaw, dist = 1.25, side = 0) {
    const p = this.panel.mesh;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    p.position.set(head.x + fx * dist + rx * side, Math.max(1.0, head.y - 0.1), head.z + fz * dist + rz * side);
    p.rotation.set(0, yaw, 0);
    p.rotateX(-0.08);
  }
  showPanel(spec) { this.panel.draw(spec); this.panel.mesh.visible = true; }
  hidePanel() { this.panel.mesh.visible = false; }

  // floating message ahead of you in the calibrated frame
  pop(text, color = ACC, sub = '') {
    const p = this.pops.find((x) => x.life <= 0) || this.pops.reduce((a, b) => (a.life < b.life ? a : b));
    const c = p.ctx;
    c.clearRect(0, 0, 1024, 200);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 14; c.strokeStyle = 'rgba(8,14,34,0.85)'; c.lineJoin = 'round';
    c.font = `900 ${text.length > 12 ? 70 : 92}px ${FONT}`;
    c.strokeText(text, 512, sub ? 80 : 100); c.fillStyle = color; c.fillText(text, 512, sub ? 80 : 100);
    if (sub) { c.font = `800 52px ${FONT}`; c.strokeText(sub, 512, 160); c.fillStyle = '#ffffff'; c.fillText(sub, 512, 160); }
    p.tex.needsUpdate = true;
    p.life = 1.6;
    p.mesh.visible = true;
    p.rise = this.pops.filter((x) => x !== p && x.life > 1.0).length * 0.42;
  }
  bigText(text, sub = '', color = ACC) {
    const b = this.big, c = b.ctx;
    c.clearRect(0, 0, 1024, 300);
    if (!text) { b.mesh.visible = false; return; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 18; c.strokeStyle = 'rgba(8,14,34,0.85)'; c.lineJoin = 'round';
    c.font = `900 ${text.length > 8 ? 96 : 150}px ${FONT}`;
    c.strokeText(text, 512, sub ? 115 : 150); c.fillStyle = color; c.fillText(text, 512, sub ? 115 : 150);
    if (sub) { c.font = `800 50px ${FONT}`; for (const [i, l] of wrap(c, sub, 960).slice(0, 2).entries()) { c.strokeText(l, 512, 222 + i * 58); c.fillStyle = '#fff'; c.fillText(l, 512, 222 + i * 58); } }
    b.tex.needsUpdate = true;
    b.mesh.visible = true;
  }

  // anchor: the calibrated frame (feet centre and downhill yaw, in play space)
  update(dt, anchor, body, rider, run, settings) {
    const fx = -Math.sin(anchor.yaw), fz = -Math.cos(anchor.yaw);
    for (const p of this.pops) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = 1.6 - p.life;
      p.mesh.position.set(anchor.x + fx * 3.8, 2.05 + p.rise * 1.2 + k * 0.35, anchor.z + fz * 3.8);
      p.mesh.rotation.set(0, anchor.yaw, 0);
      p.mesh.material.opacity = Math.min(1, p.life * 2.5);
      if (p.life <= 0) p.mesh.visible = false;
    }
    this.big.mesh.position.set(anchor.x + fx * 4.5, 2.0, anchor.z + fz * 4.5);
    this.big.mesh.rotation.set(0, anchor.yaw, 0);
    // the wrist clock, 8 times a second
    this.wristT -= dt;
    if (this.wristT <= 0 && run) {
      this.wristT = 0.125;
      const c = this.wrist.ctx;
      c.clearRect(0, 0, 512, 200);
      c.fillStyle = 'rgba(10,18,40,0.88)'; c.beginPath(); c.roundRect(2, 2, 508, 196, 30); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.font = `900 64px ${FONT}`; c.fillText(fmtTime(run.time), 26, 62);
      c.textAlign = 'right'; c.fillStyle = ACC; c.fillText(String(run.score), 486, 62);
      c.font = `800 46px ${FONT}`; c.fillStyle = '#9fe6ff'; c.textAlign = 'left';
      c.fillText(`${Math.round(rider.speed * 3.6)} km/h`, 26, 150);
      c.textAlign = 'right'; c.fillStyle = '#cfe0ff';
      c.fillText(`◆ ${run.stats.crystals}/${run.crystals.length}`, 486, 150);
      this.wrist.tex.needsUpdate = true;
    }
    // the ring at your feet: centre, your head over it (lean / brake), crouch depth
    this.feet.mesh.visible = !!(body && body.cal) && settings.feetRing;
    if (this.feet.mesh.visible) {
      this.feet.mesh.position.set(anchor.x, 0.012, anchor.z);
      this.feet.mesh.rotation.set(-Math.PI / 2, 0, anchor.yaw);
      this.feetT -= dt;
      if (this.feetT <= 0) { this.feetT = 1 / 30; this.drawFeet(body); }
    }
    // vignette: turning hard, big g-forces, high speed
    const want = settings.vignette === 0 || !rider ? 0 : Math.min(1, (Math.abs(rider.edge) * 0.9 + Math.max(0, rider.speed - 16) * 0.03 + (this.yawRate || 0) * 0.5) * (settings.vignette === 2 ? 1.4 : 0.8));
    this.vigK += (want - this.vigK) * Math.min(1, dt * 6);
    this.vig.material.uniforms.k.value = this.vigK;
    this.vig.visible = this.vigK > 0.02;
  }

  drawFeet(body) {
    const c = this.feet.ctx, S = 512, m = S / 1.5; // px per metre
    c.clearRect(0, 0, S, S);
    const o = body.out;
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.arc(S / 2, S / 2, 0.3 * m, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.beginPath(); c.moveTo(S / 2 - 0.55 * m, S / 2); c.lineTo(S / 2 + 0.55 * m, S / 2); c.moveTo(S / 2, S / 2 - 0.3 * m); c.lineTo(S / 2, S / 2 + 0.3 * m); c.stroke();
    // downhill arrow
    c.fillStyle = 'rgba(159,230,255,0.6)';
    c.beginPath(); c.moveTo(S / 2, S / 2 - 0.62 * m); c.lineTo(S / 2 - 0.07 * m, S / 2 - 0.5 * m); c.lineTo(S / 2 + 0.07 * m, S / 2 - 0.5 * m); c.fill();
    // crouch: a filled ring
    if (o.crouch > 0.02) { c.strokeStyle = 'rgba(95,216,200,0.85)'; c.lineWidth = 14; c.beginPath(); c.arc(S / 2, S / 2, 0.38 * m, -Math.PI / 2, -Math.PI / 2 + o.crouch * Math.PI * 2); c.stroke(); }
    // your head, seen from above (×2 so small leans show)
    const hx = S / 2 + o.across * m * 2, hy = S / 2 - o.along * m * 2;
    c.fillStyle = o.brake > 0.1 ? '#ff6a6a' : Math.abs(o.lean) > 0.02 ? ACC : '#ffffff';
    c.beginPath(); c.arc(hx, hy, 0.06 * m, 0, Math.PI * 2); c.fill();
    this.feet.tex.needsUpdate = true;
  }
}

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
