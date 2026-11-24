// js/input.js — reading the player: Quest controllers in VR (poses, triggers, sticks, buttons) and
// keyboard / mouse / touch on a screen. Everything is turned into one small "intent" the flight uses.
import * as THREE from 'three';

const AXIS_DEAD = 0.18;
const dz = (v) => (Math.abs(v) < AXIS_DEAD ? 0 : (v - Math.sign(v) * AXIS_DEAD) / (1 - AXIS_DEAD));

export class XRInput {
  constructor() {
    this.head = new THREE.Vector3(0, 1.6, 0); // in the rig's space (the play area)
    this.headQuat = new THREE.Quaternion();
    this.hands = {
      L: { on: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ray: { o: new THREE.Vector3(), d: new THREE.Vector3(0, 0, -1) }, trigger: 0, grip: 0, stick: [0, 0], buttons: [], prev: [] },
      R: { on: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ray: { o: new THREE.Vector3(), d: new THREE.Vector3(0, 0, -1) }, trigger: 0, grip: 0, stick: [0, 0], buttons: [], prev: [] },
    };
    this.pressed = []; // [side, index] pressed this frame
  }
  read(frame, ref) {
    this.pressed = [];
    const vp = frame.getViewerPose(ref);
    if (vp) {
      const p = vp.transform.position, o = vp.transform.orientation;
      this.head.set(p.x, p.y, p.z);
      this.headQuat.set(o.x, o.y, o.z, o.w);
    }
    const seen = { L: false, R: false };
    for (const src of frame.session.inputSources) {
      const side = src.handedness === 'left' ? 'L' : src.handedness === 'right' ? 'R' : null;
      if (!side || src.hand) continue;
      const h = this.hands[side];
      const gp = src.gripSpace && frame.getPose(src.gripSpace, ref);
      const rp = src.targetRaySpace && frame.getPose(src.targetRaySpace, ref);
      if (gp) {
        const a = gp.transform.position, o = gp.transform.orientation;
        h.pos.set(a.x, a.y, a.z);
        h.quat.set(o.x, o.y, o.z, o.w);
      }
      if (rp) {
        const a = rp.transform.position, o = rp.transform.orientation;
        h.ray.o.set(a.x, a.y, a.z);
        h.ray.d.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
        if (!gp) { h.pos.copy(h.ray.o); h.quat.set(o.x, o.y, o.z, o.w); }
      }
      h.on = !!(gp || rp);
      seen[side] = h.on;
      const g = src.gamepad;
      if (g) {
        h.trigger = g.buttons[0] ? g.buttons[0].value : 0;
        h.grip = g.buttons[1] ? g.buttons[1].value : 0;
        const ax = g.axes.length >= 4 ? [g.axes[2], g.axes[3]] : [g.axes[0] || 0, g.axes[1] || 0];
        h.stick = [dz(ax[0]), dz(ax[1])];
        h.prev = h.buttons;
        h.buttons = g.buttons.map((b) => b.pressed);
        h.buttons.forEach((b, i) => { if (b && !h.prev[i]) this.pressed.push([side, i]); });
      }
    }
    for (const s of ['L', 'R']) if (!seen[s]) { const h = this.hands[s]; h.on = false; h.trigger = 0; h.grip = 0; h.stick = [0, 0]; h.buttons = []; }
  }
  was(side, i) { return this.pressed.some(([s, b]) => (side === '*' || s === side) && b === i); }
}

// keyboard + mouse (pointer lock or drag) + touch buttons
export class ScreenInput {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = -0.15;
    this.dragging = false;
    this.touch = { fwd: 0, back: 0, up: 0, down: 0 };
    this.wheel = 0;
    this.enabled = false;
    const kd = (e) => {
      if (!this.enabled || e.target.closest?.('input, textarea, select')) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    const ku = (e) => this.keys.delete(e.code);
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    addEventListener('blur', () => this.keys.clear());
    let last = null;
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && e.button === 0 && el.requestPointerLock && !document.pointerLockElement) {
        try { el.requestPointerLock(); } catch { /* not allowed: drag instead */ }
      }
      this.dragging = true;
      last = [e.clientX, e.clientY];
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === el) this.look(e.movementX, e.movementY, 0.0022);
      else if (this.dragging && last) {
        this.look(e.clientX - last[0], e.clientY - last[1], e.pointerType === 'touch' ? 0.005 : 0.004);
        last = [e.clientX, e.clientY];
      }
    });
    const up = () => { this.dragging = false; last = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { if (this.enabled) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
  }
  look(dx, dy, k) {
    this.yaw -= dx * k;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * k));
  }
  axis(neg, pos) {
    let v = 0;
    for (const k of pos) if (this.keys.has(k)) v += 1;
    for (const k of neg) if (this.keys.has(k)) v -= 1;
    return Math.max(-1, Math.min(1, v));
  }
  // → { fwd, strafe, climb, turn, boost, brake }
  intent(dt) {
    const turn = this.axis(['ArrowRight'], ['ArrowLeft']);
    this.yaw += turn * dt * 1.2;
    const pitchKey = this.axis(['PageDown'], ['PageUp']);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + pitchKey * dt));
    const t = this.touch;
    return {
      fwd: Math.max(-1, Math.min(1, this.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']) + t.fwd - t.back)),
      strafe: this.axis(['KeyA'], ['KeyD']),
      climb: Math.max(-1, Math.min(1, this.axis(['KeyC', 'ControlLeft', 'KeyQ'], ['Space', 'KeyE']) + t.up - t.down)),
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      brake: this.keys.has('KeyX'),
    };
  }
}
