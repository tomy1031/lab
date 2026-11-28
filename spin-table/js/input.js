// js/input.js — WebXR controllers (pose, velocity, buttons, sticks, haptics) and the keyboard / mouse on PC,
// read once per frame into one plain structure.
import * as THREE from 'three';

const mkHand = () => ({
  tracked: false, source: null,
  grip: new THREE.Object3D(), ray: new THREE.Object3D(),     // world poses (filled each frame)
  vel: new THREE.Vector3(), acc: new THREE.Vector3(),         // smoothed velocity / acceleration of the grip
  hist: [],
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
    this.mouse = { x: 0, y: 0, down: [false, false, false], clicked: [false, false, false], wheel: 0 };
    this.ctrl = [];
    this.time = 0;
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
  update(dt) {
    this.time += dt;
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
        // velocity over the last ~45 ms (tracking is noisy frame to frame)
        h.hist.push({ t: this.time, p: h.grip.position.clone() });
        while (h.hist.length > 2 && this.time - h.hist[0].t > 0.06) h.hist.shift();
        const a = h.hist[0], z = h.hist[h.hist.length - 1];
        if (z.t - a.t > 1e-3) {
          const v = z.p.clone().sub(a.p).divideScalar(z.t - a.t);
          h.acc.copy(v).sub(h.vel).divideScalar(Math.max(dt, 1e-3));
          h.vel.copy(v);
        }
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
      if (!h.tracked) { h.trigger = h.squeeze = 0; h.stick.x = h.stick.y = 0; h.hist.length = 0; }
    }
  }
  endFrame() {
    this.keyPressed.clear();
    this.mouse.clicked = [false, false, false];
    this.mouse.wheel = 0;
  }
  key(code) { return this.keys.has(code); }
  keyHit(code) { return this.keyPressed.has(code); }

  /** one vibration pulse */
  pulse(side, intensity, ms) {
    this.pulses = (this.pulses || 0) + 1;
    this.lastPulse = { side, intensity, ms };
    const h = this.hands[side];
    const gp = h && h.source && h.source.gamepad;
    if (!gp || intensity <= 0) return;
    const act = gp.hapticActuators && gp.hapticActuators[0];
    try {
      if (act && act.pulse) act.pulse(Math.min(1, intensity), ms);
      else if (gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, intensity), weakMagnitude: Math.min(1, intensity) });
    } catch { /* not supported */ }
  }
  /** a pattern: [[intensity, ms], …] played back to back */
  pattern(side, steps, scale = 1) {
    let t = 0;
    for (const [i, ms] of steps) {
      if (t === 0) this.pulse(side, i * scale, ms);
      else setTimeout(() => this.pulse(side, i * scale, ms), t);
      t += ms;
    }
  }
}

/**
 * The feel of a hit as a vibration pattern. info: the paddle impact (un, sweet, face). A clean hit is one short,
 * firm knock that grows with the impact; off the sweet spot the blade rings (longer, a second softer wave);
 * the edge is a hard, sharp crack and a buzz.
 */
export function hitPattern(info) {
  const k = Math.min(1, 0.22 + info.un / 16);
  if (info.face === 'edge') return [[1, 22], [0.45, 55]];
  const off = 1 - info.sweet;
  if (off < 0.35) return [[k, 14 + Math.round(10 * k)]];
  return [[Math.min(1, k * 1.1), 18], [0.25 + 0.45 * off, Math.round(30 + 60 * off)]];
}
