// vr/vrinput.js — driving in VR.
//   Touch controllers: squeeze both grips and turn them like a steering wheel (or one grip and roll it,
//     or the left thumbstick); right trigger = accelerate, left trigger = brake / reverse,
//     A / X = drift (hold), B / Y = item, left stick press = pause, right stick press = re-centre the view.
//   Hand tracking: the same imaginary wheel as the camera gestures — hands seen = accelerate,
//     both hands tilted = steer, ✌ = item, a long hard turn drifts; pinch selects on the menus.
import * as THREE from 'three';
import { GestureInterpreter, steerFromAngle } from '../engine/gesture-math.js';
import { clamp } from '../engine/util.js';

const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class VRInput {
  constructor(renderer) {
    this.r = renderer.r;
    this.out = { steer: 0, throttle: 0, brake: 0, drift: false, item: false, source: 'vr' };
    this.pauseEdge = false; this.recenterEdge = false;
    this.prev = {};
    this.mode = 'controllers';
    this.sens = 1;
    this.interp = new GestureInterpreter();
    this.wheel = { engaged: false, angle: 0, hands: 0 };
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
  attach(space) { for (const o of [...this.ctrl, ...this.grips, ...this.hands]) space.add(o); }

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
    // wheel: the angle of the line between the two grips (in the seat's frame: x right, y up)
    let steer = 0, engaged = false;
    const lg = this.gripOf('left'), rg = this.gripOf('right');
    if (gl && gr && lg && rg) {
      _a.copy(lg.position); _b.copy(rg.position);
      const ang = Math.atan2(_a.y - _b.y, _b.x - _a.x); // right hand lower = turn right (positive)
      steer = steerFromAngle(ang, { full: 0.62 / this.sens, dead: 0.06 });
      engaged = true;
      this.wheel.angle = ang;
    } else if ((gl && lg) || (gr && rg)) {
      // one hand: roll the controller like a wheel
      const g = gl && lg ? lg : rg;
      _v.set(0, 1, 0).applyQuaternion(g.quaternion);
      const ang = Math.atan2(_v.x, _v.y);
      steer = steerFromAngle(ang, { full: 0.75 / this.sens, dead: 0.12 });
      engaged = true;
      this.wheel.angle = ang;
    }
    const stick = L && L.axes.length > 2 ? L.axes[2] : 0;
    if (Math.abs(stick) > 0.15 && Math.abs(stick) > Math.abs(steer)) steer = stick;
    this.wheel.engaged = engaged;
    this.wheel.hands = (lg ? 1 : 0) + (rg ? 1 : 0);
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
    this.wheel.engaged = tracked.length > 0; this.wheel.angle = angle; this.wheel.hands = tracked.length;
    Object.assign(this.out, { steer: c.steer, throttle: c.throttle, brake: c.brake, drift: c.drift, item: c.item, source: 'vr-hands' });
    return this.out;
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

