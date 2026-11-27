// js/engine/input.js — Unified input manager combining VR Hands, VR Controllers, Webcam Hand Gestures, Keyboard, Gamepad, and Touch
import { clamp } from './gesture-math.js';

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.touch = { steer: 0, throttle: 0, brake: 0, boost: false, active: false };
    this.out = {
      steer: 0,
      throttle: 0,
      brake: 0,
      boost: false,
      drift: false,
      source: 'keyboard',
    };
    this.cameraEdge = false;
    this.pauseEdge = false;
    this.recenterEdge = false;
    this._prevCam = false;
    this._prevPause = false;
    this._steerSm = 0;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.cameraEdge = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseEdge = true;
      if (e.code === 'KeyR') this.recenterEdge = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  consumeEdges() {
    const e = {
      camera: this.cameraEdge,
      pause: this.pauseEdge,
      recenter: this.recenterEdge,
    };
    this.cameraEdge = false;
    this.pauseEdge = false;
    this.recenterEdge = false;
    return e;
  }

  poll(dt, { vrInput = null, xrSession = null, handTracker = null } = {}) {
    const o = this.out;

    // 1. VR Input (WebXR Hand Tracking or Touch Controllers) has top priority when presenting
    if (xrSession && vrInput) {
      const v = vrInput.poll(dt, xrSession);
      o.steer = v.steer;
      o.throttle = v.throttle;
      o.brake = v.brake;
      o.boost = v.boost;
      o.drift = v.drift;
      o.source = v.source;
      if (vrInput.pauseEdge) this.pauseEdge = true;
      if (vrInput.recenterEdge) this.recenterEdge = true;
      return o;
    }

    // 2. Keyboard baseline
    const k = this.keys;
    const kSteer = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const kThrottle = k.has('ArrowUp') || k.has('KeyW') ? 1 : 0;
    const kBrake = k.has('ArrowDown') || k.has('KeyS') ? 1 : 0;
    const kBoost = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyN');
    const kDrift = k.has('Space');
    const kActive = kSteer !== 0 || kThrottle !== 0 || kBrake !== 0 || kBoost || kDrift;

    // 3. Gamepad
    let gpSteer = 0, gpThrottle = 0, gpBrake = 0, gpBoost = false, gpDrift = false, gpActive = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const sx = Math.abs(p.axes[0] || 0) > 0.12 ? p.axes[0] : 0;
      const rt = p.buttons[7]?.value || 0;
      const lt = p.buttons[6]?.value || 0;
      const a = p.buttons[0]?.pressed || false;
      const b = p.buttons[1]?.pressed || false;
      const y = p.buttons[3]?.pressed || false;
      const start = p.buttons[9]?.pressed || false;
      if (y && !this._prevCam) this.cameraEdge = true;
      if (start && !this._prevPause) this.pauseEdge = true;
      this._prevCam = y;
      this._prevPause = start;
      if (Math.abs(sx) > 0.12 || rt > 0.08 || lt > 0.08 || a || b) {
        gpSteer = sx;
        gpThrottle = Math.max(rt, a ? 1 : 0);
        gpBrake = lt;
        gpBoost = b;
        gpDrift = p.buttons[2]?.pressed || false;
        gpActive = true;
        break;
      }
    }

    // 4. Webcam Hand Tracking
    const hCtl = handTracker && handTracker.ready ? handTracker.poll() : null;
    const hActive = !!(hCtl && hCtl.handsCount > 0);

    // Priority arbitration: manual keyboard/gamepad overrides hands momentarily if pressed, otherwise hands drive seamlessly
    if (kActive) {
      const rate = 1 - Math.exp(-11 * dt);
      this._steerSm += (kSteer - this._steerSm) * rate;
      o.steer = clamp(this._steerSm, -1, 1);
      o.throttle = kThrottle;
      o.brake = kBrake;
      o.boost = kBoost;
      o.drift = kDrift;
      o.source = 'keyboard';
    } else if (gpActive) {
      this._steerSm = gpSteer;
      o.steer = clamp(gpSteer, -1, 1);
      o.throttle = gpThrottle;
      o.brake = gpBrake;
      o.boost = gpBoost;
      o.drift = gpDrift;
      o.source = 'gamepad';
    } else if (this.touch.active) {
      this._steerSm = this.touch.steer;
      o.steer = clamp(this.touch.steer, -1, 1);
      o.throttle = this.touch.throttle;
      o.brake = this.touch.brake;
      o.boost = this.touch.boost;
      o.drift = Math.abs(o.steer) > 0.75;
      o.source = 'touch';
    } else if (hActive) {
      this._steerSm = hCtl.steer;
      o.steer = hCtl.steer;
      o.throttle = hCtl.throttle;
      o.brake = hCtl.brake;
      o.boost = hCtl.boost;
      o.drift = hCtl.drift;
      o.source = 'hand-camera';
    } else {
      const rate = 1 - Math.exp(-10 * dt);
      this._steerSm += (0 - this._steerSm) * rate;
      o.steer = clamp(this._steerSm, -1, 1);
      o.throttle = 0;
      o.brake = 0;
      o.boost = false;
      o.drift = false;
      o.source = handTracker?.ready ? 'hand-camera' : 'keyboard';
    }

    return o;
  }
}
