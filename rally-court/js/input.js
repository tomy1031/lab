// js/input.js — WebXR controllers (pose, buttons, sticks, haptics) and the keyboard / mouse / gamepad on PC,
// read once per frame into one plain structure.
import * as THREE from 'three';

const mkHand = () => ({
  tracked: false, source: null,
  grip: new THREE.Object3D(), ray: new THREE.Object3D(),     // world poses (filled each frame)
  gripLocal: new THREE.Vector3(),                              // position in the room (rig space)
  trigger: 0, squeeze: 0, btnA: false, btnB: false, stickPress: false, stick: { x: 0, y: 0 },
  pressed: {}, released: {}, prev: {},
});

export class Input {
  constructor(renderer, rig) {
    this.renderer = renderer;
    this.rig = rig;
    this.hands = { left: mkHand(), right: mkHand() };
    this.keys = new Set();
    this.keyPressed = new Set();
    this.mouse = { x: 0, y: 0, down: [false, false, false], clicked: [false, false, false], wheel: 0, locked: false };
    this.pad = null;
    this.ctrl = [];
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      const g = renderer.xr.getControllerGrip(i);
      rig.add(c); rig.add(g);
      const rec = { ray: c, grip: g, source: null };
      c.addEventListener('connected', (e) => { rec.source = e.data; });
      c.addEventListener('disconnected', () => { rec.source = null; });
      this.ctrl.push(rec);
    }
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.keyPressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    const cv = renderer.domElement;
    cv.addEventListener('mousemove', (e) => {
      const r = cv.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    });
    cv.addEventListener('mousedown', (e) => { this.mouse.down[e.button] = true; this.mouse.clicked[e.button] = true; });
    addEventListener('mouseup', (e) => { this.mouse.down[e.button] = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  get xr() { return this.renderer.xr.isPresenting; }

  /** call once per frame before reading */
  update() {
    for (const side of ['left', 'right']) { const h = this.hands[side]; h.tracked = false; h.source = null; }
    if (this.xr) {
      for (const rec of this.ctrl) {
        const src = rec.source;
        if (!src || !src.handedness || src.handedness === 'none' || src.hand) continue;
        const h = this.hands[src.handedness];
        if (!h) continue;
        h.source = src;
        h.tracked = rec.grip.visible !== false && rec.ray.visible !== false;
        rec.grip.updateMatrixWorld(true);
        rec.ray.updateMatrixWorld(true);
        rec.grip.matrixWorld.decompose(h.grip.position, h.grip.quaternion, h.grip.scale);
        rec.ray.matrixWorld.decompose(h.ray.position, h.ray.quaternion, h.ray.scale);
        h.gripLocal.copy(rec.grip.position);
        const gp = src.gamepad;
        const b = gp ? gp.buttons : [];
        h.trigger = b[0] ? b[0].value : 0;
        h.squeeze = b[1] ? b[1].value : 0;
        h.stickPress = !!(b[3] && b[3].pressed);
        h.btnA = !!(b[4] && b[4].pressed);
        h.btnB = !!(b[5] && b[5].pressed);
        const ax = gp ? gp.axes : [];
        h.stick.x = ax.length >= 4 ? ax[2] : ax[0] || 0;
        h.stick.y = ax.length >= 4 ? ax[3] : ax[1] || 0;
      }
    }
    for (const side of ['left', 'right']) {
      const h = this.hands[side];
      const now = { trigger: h.trigger > 0.6, squeeze: h.squeeze > 0.6, a: h.btnA, b: h.btnB, stick: h.stickPress };
      for (const k in now) {
        h.pressed[k] = now[k] && !h.prev[k];
        h.released[k] = !now[k] && !!h.prev[k];
        h.prev[k] = now[k];
      }
      if (!h.tracked) { h.trigger = h.squeeze = 0; h.stick.x = h.stick.y = 0; }
    }
    // a gamepad on PC (standard mapping): d-pad / left stick
    this.pad = null;
    if (!this.xr && navigator.getGamepads) {
      for (const gp of navigator.getGamepads()) if (gp && gp.connected && gp.mapping === 'standard') { this.pad = gp; break; }
    }
  }
  /** call at the end of the frame */
  endFrame() {
    this.keyPressed.clear();
    this.mouse.clicked = [false, false, false];
    this.mouse.wheel = 0;
  }
  key(code) { return this.keys.has(code); }
  keyHit(code) { return this.keyPressed.has(code); }

  haptic(side, intensity, ms) {
    const h = this.hands[side];
    const gp = h && h.source && h.source.gamepad;
    if (!gp || intensity <= 0) return;
    const act = gp.hapticActuators && gp.hapticActuators[0];
    try {
      if (act && act.pulse) act.pulse(Math.min(1, intensity), ms);
      else if (gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch { /* not supported */ }
  }
}
