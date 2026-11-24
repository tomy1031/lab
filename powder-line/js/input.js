// js/input.js — keys, gamepads and touch on a PC or phone, and the Quest controllers in VR (poses,
// buttons, thumbsticks, the laser for menus, vibration).
import * as THREE from 'three';
import { clamp } from './course.js';

export class Keys {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.lean = 0;
    this.spin = 0;
    this.charge = 0;
    this.jumpHeld = false;
    this.wasAir = false;
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  has(...codes) { return codes.some((c) => this.down.has(c)); }
  took(code) { const h = this.pressed.has(code); this.pressed.delete(code); return h; }
  endFrame() { this.pressed.clear(); }

  // the same intent the body gives, from keys / a gamepad / touch buttons
  intent(dt, air) {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.connected);
    const ax = gp ? (Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0) : 0;
    const ay = gp ? (Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0) : 0;
    const b = (i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
    const L = this.has('ArrowLeft', 'KeyA') ? 1 : 0, R = this.has('ArrowRight', 'KeyD') ? 1 : 0;
    const U = this.has('ArrowUp', 'KeyW') || ay < -0.5 || b(7) ? 1 : 0, D = this.has('ArrowDown', 'KeyS') || ay > 0.5 || b(1) ? 1 : 0;
    const J = this.has('Space') || b(0);
    const big = this.has('ShiftLeft', 'ShiftRight');
    if (air && !this.wasAir) this.spin = 0;
    this.wasAir = air;
    const steer = clamp(R - L + ax, -1, 1);
    let lean = 0;
    if (air) this.spin -= steer * 7.5 * dt + (this.has('KeyE') || b(5) ? 7.5 * dt : 0) - (this.has('KeyQ') || b(4) ? 7.5 * dt : 0);
    else lean = steer * (big ? 0.36 : 0.26);
    this.lean += (lean - this.lean) * Math.min(1, dt * 9);
    let pop = 0;
    if (J) { this.jumpHeld = true; this.charge = Math.min(1, this.charge + dt / 0.35); }
    else if (this.jumpHeld) { this.jumpHeld = false; if (!air) pop = 0.35 + 0.65 * this.charge; this.charge = 0; }
    // soft landing: Space or ↑ pressed just now (within 0.3 s), not simply held all the way down
    const press = J || U;
    if (press && !this.wasPress) this.absorbT = 0.3;
    this.wasPress = press;
    this.absorbT = Math.max(0, (this.absorbT || 0) - dt);
    const gL = this.has('KeyZ', 'KeyJ') || b(2), gR = this.has('KeyX', 'KeyK') || b(3);
    const grab = air ? (gL && gR ? 'ダブルグラブ' : gL ? 'ミュート' : gR ? 'インディ' : null) : null;
    return {
      lean: this.lean,
      crouch: Math.max(U ? 0.9 : 0, this.jumpHeld ? 0.4 + this.charge * 0.6 : 0),
      brake: D && !air ? 1 : 0,
      pop, spin: this.spin, grab,
      absorb: this.absorbT > 0 ? 1 : 0,
    };
  }
}

// one Quest controller (or a tracked hand)
class Hand {
  constructor(app, i) {
    const xr = app.renderer.xr;
    this.i = i;
    this.ray = xr.getController(i);
    this.grip = xr.getControllerGrip(i);
    this.source = null;
    this.side = i === 0 ? 'L' : 'R';
    this.btn = { trigger: 0, grip: 0, a: 0, b: 0, stick: 0 };
    this.prev = { ...this.btn };
    this.axes = [0, 0];
    this.connected = false;
    const onC = (e) => { this.source = e.data; this.connected = true; this.side = e.data.handedness === 'left' ? 'L' : 'R'; };
    const onD = () => { this.source = null; this.connected = false; };
    this.ray.addEventListener('connected', onC);
    this.ray.addEventListener('disconnected', onD);
    // laser
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.laser = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.85 }));
    this.laser.visible = false;
    this.ray.add(this.laser);
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    this.dot.visible = false;
    app.dolly.add(this.ray, this.grip);
    app.scene.add(this.dot);
    // a mitten on the controller, so you see your hands
    const mitten = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshLambertMaterial({ color: '#1f2533' }));
    mitten.scale.set(1, 0.8, 1.35);
    mitten.position.set(0, -0.01, 0.03);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 10), new THREE.MeshLambertMaterial({ color: '#ff6a3d' }));
    cuff.rotation.x = Math.PI / 2; cuff.position.set(0, -0.01, 0.1);
    this.grip.add(mitten, cuff);
    this.mitten = mitten;
    this.wp = new THREE.Vector3();
  }

  read() {
    this.prev = { ...this.btn };
    const gp = this.source && this.source.gamepad;
    const hand = this.source && this.source.hand;
    this.isHand = !!hand;
    this.mitten.visible = !hand;
    if (!gp) { this.btn = { trigger: 0, grip: 0, a: 0, b: 0, stick: 0 }; this.axes = [0, 0]; return; }
    const v = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    this.btn = { trigger: v(0), grip: v(1), a: v(4), b: v(5), stick: v(3) };
    this.axes = [gp.axes[2] || 0, gp.axes[3] || 0];
  }
  pressedNow(k) { return this.btn[k] > 0.5 && !(this.prev[k] > 0.5); }
  pulse(intensity, ms) {
    const gp = this.source && this.source.gamepad;
    const h = gp && gp.hapticActuators && gp.hapticActuators[0];
    if (h && h.pulse) try { h.pulse(clamp(intensity, 0, 1), ms); } catch { /* not supported */ }
  }
  // world position of the hand
  world() { this.grip.getWorldPosition(this.wp); return this.wp; }
}

export class XRInput {
  constructor(app) {
    this.app = app;
    this.hands = [new Hand(app, 0), new Hand(app, 1)];
    this.raycaster = new THREE.Raycaster();
  }
  get L() { return this.hands.find((h) => h.side === 'L') || this.hands[0]; }
  get R() { return this.hands.find((h) => h.side === 'R') || this.hands[1]; }
  read() { for (const h of this.hands) h.read(); }
  pulse(side, intensity, ms) { for (const h of this.hands) if (!side || h.side === side) h.pulse(intensity, ms); }
  // point the lasers at a list of meshes; returns hits per hand
  point(targets, show) {
    const out = [];
    for (const h of this.hands) {
      h.laser.visible = show && h.connected;
      h.dot.visible = false;
      if (!show || !h.connected) continue;
      const m = h.ray.matrixWorld;
      const o = new THREE.Vector3().setFromMatrixPosition(m);
      const d = new THREE.Vector3(0, 0, -1).transformDirection(m);
      this.raycaster.set(o, d);
      const hit = this.raycaster.intersectObjects(targets, false)[0];
      h.laser.scale.z = hit ? hit.distance : 2;
      if (hit) { h.dot.visible = true; h.dot.position.copy(hit.point); out.push({ hand: h, hit }); }
    }
    return out;
  }
}
