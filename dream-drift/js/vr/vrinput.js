// vr/vrinput.js — driving in VR.
//   Touch controllers: squeeze both grips and turn them like a steering wheel — the wheel you see sits right
//     in your hands and turns exactly as far as they do (or one grip and roll it, or the left thumbstick);
//     right trigger = accelerate, left trigger = brake / reverse,
//     A / X = drift (hold), B / Y = item, left stick press = pause, right stick press = re-centre the view.
//   Hand tracking: the same imaginary wheel as the camera gestures — hands seen = accelerate,
//     both hands tilted = steer, ✌ = item, a long hard turn drifts; pinch selects on the menus.
import * as THREE from 'three';
import { GestureInterpreter, steerFromAngle } from '../engine/gesture-math.js';
import { clamp } from '../engine/util.js';

const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
// the plane the two-handed wheel turns in (seat frame: x right, y up, -z ahead): upright, top leaning
// WHEEL_TILT away from you like a real steering wheel
export const WHEEL_TILT = 0.3;
export const WHEEL_X = new THREE.Vector3(1, 0, 0);
export const WHEEL_Y = new THREE.Vector3(0, Math.cos(WHEEL_TILT), -Math.sin(WHEEL_TILT));
const DEAD2 = 0.06, DEAD1 = 0.12, CURVE = 1.35;

export class VRInput {
  constructor(renderer) {
    this.r = renderer.r;
    this.out = { steer: 0, throttle: 0, brake: 0, drift: false, item: false, source: 'vr' };
    this.pauseEdge = false; this.recenterEdge = false;
    this.prev = {};
    this.mode = 'controllers';
    this.sens = 1;
    this.interp = new GestureInterpreter();
    // the wheel as your hands hold it, in the seat frame: both controllers' grip positions, whether both are
    // squeezed (two-handed wheel), the angle you have turned it (+ = clockwise as you see it = right)
    this.wheel = { engaged: false, angle: 0, hands: 0, two: false, both: false, left: new THREE.Vector3(), right: new THREE.Vector3(), full: 0.62 };
    this.steerSm = 0;
    this.ctrl = []; this.grips = []; this.hands = [];
    for (let i = 0; i < 2; i++) {
      const c = this.r.xr.getController(i), g = this.r.xr.getControllerGrip(i), h = this.r.xr.getHand(i);
      for (const o of [c, g, h]) {
        o.addEventListener('connected', (e) => { o.userData.source = e.data; });
        o.addEventListener('disconnected', () => { o.userData.source = null; });
      }
      this.ctrl.push(c); this.grips.push(g); this.hands.push(h);
    }
  }

  // controllers and hands live in the rig's calibrated space (so their positions are relative to the seat)
  attach(space) { this.space = space; for (const o of [...this.ctrl, ...this.grips, ...this.hands]) space.add(o); }

  // a controller's position / orientation in the seat frame (x right, y up, -z ahead — whichever way the
  // headset's own tracking space happens to face)
  seatPos(o, out) { out.copy(o.position); if (this.space) { this.space.updateMatrix(); out.applyMatrix4(this.space.matrix); } return out; }
  seatQuat(o, out) { out.copy(o.quaternion); if (this.space) out.premultiply(this.space.quaternion); return out; }

  sources(session) {
    const list = { left: null, right: null, hands: [] };
    if (!session) return list;
    for (const s of session.inputSources) {
      if (s.hand) list.hands.push(s);
      else if (s.gamepad && (s.handedness === 'left' || s.handedness === 'right')) list[s.handedness] = s;
    }
    return list;
  }

  gripOf(handedness) { return this.grips.find((g) => g.userData.source && g.userData.source.handedness === handedness && !g.userData.source.hand); }
  handOf(handedness) { return this.hands.find((h) => h.userData.source && h.userData.source.handedness === handedness); }

  poll(dt, session) {
    const o = this.out, src = this.sources(session);
    this.pauseEdge = false; this.recenterEdge = false;
    o.item = false;
    if (src.hands.length && !src.left && !src.right) return this.pollHands(dt, src);
    this.mode = 'controllers';
    const L = src.left && src.left.gamepad, R = src.right && src.right.gamepad;
    const btn = (g, i) => (g && g.buttons[i] ? g.buttons[i].value || (g.buttons[i].pressed ? 1 : 0) : 0);
    const gl = btn(L, 1) > 0.5, gr = btn(R, 1) > 0.5;
    // wheel: the angle of the line from the left grip to the right one, measured in the wheel's plane
    let steer = 0, engaged = false;
    const w = this.wheel, lg = this.gripOf('left'), rg = this.gripOf('right');
    w.both = !!(lg && rg);
    if (lg) this.seatPos(lg, w.left);
    if (rg) this.seatPos(rg, w.right);
    w.two = gl && gr && w.both;
    w.full = 0.62 / this.sens;
    if (w.two) {
      _v.subVectors(w.right, w.left);
      const ang = -Math.atan2(_v.dot(WHEEL_Y), _v.dot(WHEEL_X)); // right hand lower = turn right (positive)
      steer = steerFromAngle(ang, { full: w.full, dead: DEAD2, curve: CURVE });
      engaged = true;
      w.angle = ang;
    } else if ((gl && lg) || (gr && rg)) {
      // one hand: roll the controller like a wheel
      const g = gl && lg ? lg : rg;
      _v.set(0, 1, 0).applyQuaternion(this.seatQuat(g, _q));
      const ang = Math.atan2(_v.x, _v.y);
      steer = steerFromAngle(ang, { full: 0.75 / this.sens, dead: DEAD1, curve: CURVE });
      engaged = true;
      w.angle = ang;
    }
    const stick = L && L.axes.length > 2 ? L.axes[2] : 0;
    if (Math.abs(stick) > 0.15 && Math.abs(stick) > Math.abs(steer)) steer = stick;
    w.engaged = engaged;
    w.hands = (lg ? 1 : 0) + (rg ? 1 : 0);
    this.steerSm += (steer - this.steerSm) * (1 - Math.exp(-18 * dt));
    o.steer = clamp(this.steerSm, -1, 1);
    o.throttle = btn(R, 0);
    o.brake = btn(L, 0);
    o.drift = btn(R, 4) > 0.5 || btn(L, 4) > 0.5;
    o.item = btn(R, 5) > 0.5 || btn(L, 5) > 0.5;
    const ls = btn(L, 3) > 0.5, rs = btn(R, 3) > 0.5;
    if (ls && !this.prev.ls) this.pauseEdge = true;
    if (rs && !this.prev.rs) this.recenterEdge = true;
    this.prev.ls = ls; this.prev.rs = rs;
    o.source = 'vr-controllers';
    return o;
  }

  // hand tracking: build the wheel angle and finger poses from the joints, then reuse the camera-gesture rules
  pollHands(dt, src) {
    this.mode = 'hands';
    const tracked = [];
    for (const h of this.hands) {
      const j = h.joints;
      if (!h.userData.source || !j || !j.wrist || !j.wrist.visible) continue;
      tracked.push(h);
    }
    const palms = tracked.map((h) => palmCenter(h.joints));
    let angle = 0;
    if (palms.length >= 2) {
      const [A, B] = palms[0].x < palms[1].x ? palms : [palms[1], palms[0]];
      angle = Math.atan2(A.y - B.y, B.x - A.x);
    } else if (palms.length === 1) {
      const j = tracked[0].joints, w = j.wrist.position, m = j['middle-finger-phalanx-proximal']?.position;
      if (m) angle = Math.atan2(m.x - w.x, m.y - w.y);
    }
    const poses = tracked.map((h) => classify3D(h.joints));
    const g = this.interp;
    g.opts.sensitivity = this.sens;
    const c = g.update(tracked, dt, 1, { angle, poses });
    this.wheel.engaged = tracked.length > 0; this.wheel.angle = angle; this.wheel.hands = tracked.length; this.wheel.two = false; this.wheel.both = false;
    Object.assign(this.out, { steer: c.steer, throttle: c.throttle, brake: c.brake, drift: c.drift, item: c.item, source: 'vr-hands' });
    return this.out;
  }

  // how far the wheel is turned for a steering value (the inverse of steerFromAngle for the two-handed wheel)
  wheelAngleFor(steer) {
    const m = Math.min(1, Math.abs(steer));
    return m < 1e-3 ? 0 : Math.sign(steer) * (DEAD2 + (this.wheel.full - DEAD2) * Math.pow(m, 1 / CURVE));
  }

  rumble(strength = 0.5, ms = 60, session) {
    if (!session) return;
    for (const s of session.inputSources) {
      const h = s.gamepad && s.gamepad.hapticActuators && s.gamepad.hapticActuators[0];
      if (h && h.pulse) h.pulse(clamp(strength, 0, 1), ms).catch?.(() => {});
    }
  }
}

function palmCenter(j) {
  const ids = ['wrist', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'];
  const p = { x: 0, y: 0, z: 0 }; let n = 0;
  for (const id of ids) { const o = j[id]; if (o && o.visible) { p.x += o.position.x; p.y += o.position.y; p.z += o.position.z; n++; } }
  if (n) { p.x /= n; p.y /= n; p.z /= n; }
  return p;
}

// finger poses from 3D joints (works whichever way the hand points)
export function classify3D(j) {
  const w = j.wrist && j.wrist.position;
  if (!w) return 'other';
  const ext = (f) => {
    const tip = j[f + '-tip'], pip = j[f + '-phalanx-intermediate'];
    if (!tip || !pip) return false;
    return tip.position.distanceTo(w) > pip.position.distanceTo(w) * 1.12;
  };
  const e = FINGERS.map(ext);
  const n = e.filter(Boolean).length;
  if (e[0] && e[1] && !e[2] && !e[3]) return 'peace';
  if (n >= 4) return 'open';
  if (n === 0) return 'fist';
  if (e[0] && n === 1) return 'point';
  return 'other';
}

