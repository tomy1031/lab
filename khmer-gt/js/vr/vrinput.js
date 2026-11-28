// js/vr/vrinput.js — Full controller-free WebXR Hand Tracking (25-joint wheel steering, palm brake, peace/thumbup boost, pinch UI)
// Also seamlessly supports VR Touch Controllers when held.
import * as THREE from 'three';
import { clamp, steerFromAngle } from '../engine/gesture-math.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();

const WHEEL_TILT = 0.28;
const WHEEL_X = new THREE.Vector3(1, 0, 0);
const WHEEL_Y = new THREE.Vector3(0, Math.cos(WHEEL_TILT), -Math.sin(WHEEL_TILT));

const FINGER_TIPS = [
  ['index-finger-tip', 'index-finger-phalanx-proximal', 'index-finger-metacarpal'],
  ['middle-finger-tip', 'middle-finger-phalanx-proximal', 'middle-finger-metacarpal'],
  ['ring-finger-tip', 'ring-finger-phalanx-proximal', 'ring-finger-metacarpal'],
  ['pinky-finger-tip', 'pinky-finger-phalanx-proximal', 'pinky-finger-metacarpal'],
];

export class VRInput {
  constructor(renderer) {
    this.r = renderer.r;
    this.space = null;
    this.mode = 'hands';
    this.sens = 1.0;

    this.out = {
      steer: 0,
      throttle: 0,
      brake: 0,
      boost: false,
      drift: false,
      source: 'vr-hands',
    };

    this.pauseEdge = false;
    this.recenterEdge = false;
    this.selectEdge = false;
    this.pointerRay = { active: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };

    this.wheelAngle = 0;
    this.steerSm = 0;
    this.throttleSm = 0;
    this.brakeSm = 0;
    this.pinchHoldPause = 0;
    this._prevPinch = false;
    this._prevTrigger = false;
    this._prevMenuBtn = false;

    this.ctrl = [];
    this.grips = [];
    this.hands = [];
    for (let i = 0; i < 2; i++) {
      const c = this.r.xr.getController(i);
      const g = this.r.xr.getControllerGrip(i);
      const h = this.r.xr.getHand(i);
      for (const o of [c, g, h]) {
        o.addEventListener('connected', (e) => { o.userData.source = e.data; });
        o.addEventListener('disconnected', () => { o.userData.source = null; });
      }
      this.ctrl.push(c);
      this.grips.push(g);
      this.hands.push(h);
    }
  }

  attach(space) {
    this.space = space;
    for (const o of [...this.ctrl, ...this.grips, ...this.hands]) {
      space.add(o);
    }
  }

  seatPos(obj, out) {
    out.copy(obj.position);
    return out;
  }

  getSources(session) {
    const list = { left: null, right: null, hands: [] };
    if (!session) return list;
    for (const s of session.inputSources) {
      if (s.hand) list.hands.push(s);
      else if (s.gamepad && (s.handedness === 'left' || s.handedness === 'right')) list[s.handedness] = s;
    }
    return list;
  }

  analyzeXRHand(handObj) {
    const j = handObj.joints;
    if (!j || !j['wrist'] || !j['middle-finger-metacarpal']) return null;
    const wrist = j['wrist'].position;
    const midMcp = j['middle-finger-metacarpal'].position;
    const palmLen = Math.max(0.04, wrist.distanceTo(midMcp));

    const ext = FINGER_TIPS.map(([tip, prox, mcp]) => {
      if (!j[tip] || !j[prox] || !j[mcp]) return false;
      const dt = wrist.distanceTo(j[tip].position);
      const dp = wrist.distanceTo(j[prox].position);
      const dm = wrist.distanceTo(j[mcp].position);
      return dt > dp * 1.1 && dt > dm * 1.25;
    });

    const [idx, mid, rng, pnk] = ext;
    const extCount = ext.filter(Boolean).length;

    const thumbTip = j['thumb-tip']?.position;
    const indexTip = j['index-finger-tip']?.position;
    const indexMcp = j['index-finger-metacarpal']?.position;
    const pinchDist = thumbTip && indexTip ? thumbTip.distanceTo(indexTip) / palmLen : 99;
    const pinch = pinchDist < 0.36;

    const thumbUp = !!(thumbTip && indexMcp && thumbTip.y > indexMcp.y + palmLen * 0.42 && extCount === 0);
    const peace = idx && mid && !rng && !pnk;
    const open = extCount >= 4;

    const center = new THREE.Vector3().addVectors(wrist, midMcp).multiplyScalar(0.5);
    const pointDir = new THREE.Vector3();
    if (indexTip && indexMcp) pointDir.subVectors(indexTip, indexMcp).normalize();
    else pointDir.set(0, 0, -1);

    return {
      handObj,
      handedness: handObj.userData.source?.handedness || 'right',
      center,
      wrist: wrist.clone(),
      indexTip: indexTip ? indexTip.clone() : center.clone(),
      pointDir,
      open,
      peace,
      thumbUp,
      pinch,
    };
  }

  poll(dt, session) {
    const o = this.out;
    this.pauseEdge = false;
    this.recenterEdge = false;
    this.selectEdge = false;
    this.pointerRay.active = false;

    const src = this.getSources(session);
    // Prioritize Hand Tracking whenever hands are active
    if (src.hands.length > 0 && !src.left && !src.right) {
      return this.pollHands(dt);
    }
    return this.pollControllers(dt, src);
  }

  pollHands(dt) {
    const o = this.out;
    this.mode = 'hands';
    o.source = 'vr-hands';

    const tracked = [];
    for (const h of this.hands) {
      if (!h.userData.source?.hand) continue;
      const info = this.analyzeXRHand(h);
      if (info) tracked.push(info);
    }

    if (tracked.length === 0) {
      const decay = 1 - Math.exp(-8 * dt);
      this.steerSm += (0 - this.steerSm) * decay;
      this.throttleSm += (0 - this.throttleSm) * decay;
      this.brakeSm += (0 - this.brakeSm) * decay;
      o.steer = this.steerSm;
      o.throttle = this.throttleSm;
      o.brake = this.brakeSm;
      o.boost = false;
      o.drift = false;
      return o;
    }

    // Update menu pointer ray from right hand (or first available hand)
    const ptrHand = tracked.find((t) => t.handedness === 'right') || tracked[0];
    this.pointerRay.active = true;
    this.pointerRay.origin.copy(ptrHand.indexTip);
    this.pointerRay.dir.copy(ptrHand.pointDir);
    if (this.space) {
      this.space.updateMatrixWorld();
      this.pointerRay.origin.applyMatrix4(this.space.matrixWorld);
      this.pointerRay.dir.transformDirection(this.space.matrixWorld).normalize();
    }

    const anyPinch = tracked.some((t) => t.pinch);
    if (anyPinch && !this._prevPinch) this.selectEdge = true;
    this._prevPinch = anyPinch;

    // Long left-hand pinch (> 1.1s) toggles Pause menu during race without controllers
    const leftHand = tracked.find((t) => t.handedness === 'left');
    if (leftHand && leftHand.pinch && tracked.length === 1) {
      this.pinchHoldPause += dt;
      if (this.pinchHoldPause > 1.1) {
        this.pauseEdge = true;
        this.pinchHoldPause = -1.0;
      }
    } else {
      this.pinchHoldPause = Math.max(0, this.pinchHoldPause - dt * 2);
    }

    // Steering wheel calculation in 3D seated space
    let rawSteer = 0;
    if (tracked.length >= 2) {
      tracked.sort((a, b) => a.center.x - b.center.x);
      const L = tracked[0];
      const R = tracked[tracked.length - 1];
      _v.subVectors(R.center, L.center);
      const ang = -Math.atan2(_v.dot(WHEEL_Y), Math.max(0.05, _v.dot(WHEEL_X)));
      this.wheelAngle = ang;
      rawSteer = steerFromAngle(ang, { full: 0.60 / this.sens, dead: 0.055, curve: 1.28 });
    } else {
      const H = tracked[0];
      const ang = clamp((H.center.x) * 2.2, -0.9, 0.9);
      this.wheelAngle = ang;
      rawSteer = steerFromAngle(ang, { full: 0.65 / this.sens, dead: 0.08, curve: 1.3 });
    }

    const openCount = tracked.filter((t) => t.open).length;
    const boost = tracked.some((t) => t.peace || t.thumbUp);
    const braking = openCount >= 1 && !boost;

    const sk = 1 - Math.exp(-16 * dt);
    const pk = 1 - Math.exp(-14 * dt);
    this.steerSm += (rawSteer - this.steerSm) * sk;
    this.throttleSm += ((braking ? 0 : 1) - this.throttleSm) * pk;
    this.brakeSm += ((braking ? (openCount >= 2 ? 1 : 0.8) : 0) - this.brakeSm) * pk;

    o.steer = clamp(this.steerSm, -1, 1);
    o.throttle = clamp(this.throttleSm, 0, 1);
    o.brake = clamp(this.brakeSm, 0, 1);
    o.boost = boost;
    o.drift = Math.abs(o.steer) > 0.78 && o.throttle > 0.5;
    return o;
  }

  pollControllers(dt, src) {
    const o = this.out;
    this.mode = 'controllers';
    o.source = 'vr-controllers';
    const L = src.left?.gamepad;
    const R = src.right?.gamepad;
    const btn = (g, i) => (g && g.buttons[i] ? g.buttons[i].value || (g.buttons[i].pressed ? 1 : 0) : 0);

    // Controller laser ray for VR menu
    const rc = this.ctrl.find((c) => c.userData.source?.handedness === 'right') || this.ctrl[0];
    if (rc && rc.userData.source) {
      this.pointerRay.active = true;
      rc.getWorldPosition(this.pointerRay.origin);
      rc.getWorldQuaternion(_q);
      this.pointerRay.dir.set(0, 0, -1).applyQuaternion(_q).normalize();
    }

    const trigR = btn(R, 0);
    if (trigR > 0.65 && !this._prevTrigger) this.selectEdge = true;
    this._prevTrigger = trigR > 0.65;

    const menuBtn = btn(L, 3) > 0.5 || btn(L, 4) > 0.5;
    if (menuBtn && !this._prevMenuBtn) this.pauseEdge = true;
    this._prevMenuBtn = menuBtn;

    // Two-hand grip virtual wheel or thumbstick
    const gl = btn(L, 1) > 0.5;
    const gr = btn(R, 1) > 0.5;
    const lg = this.grips.find((g) => g.userData.source?.handedness === 'left');
    const rg = this.grips.find((g) => g.userData.source?.handedness === 'right');

    let steer = 0;
    if (gl && gr && lg && rg) {
      this.seatPos(lg, _a);
      this.seatPos(rg, _b);
      _v.subVectors(_b, _a);
      const ang = -Math.atan2(_v.dot(WHEEL_Y), Math.max(0.05, _v.dot(WHEEL_X)));
      this.wheelAngle = ang;
      steer = steerFromAngle(ang, { full: 0.60 / this.sens, dead: 0.055, curve: 1.3 });
    }
    const stick = L && L.axes.length > 2 ? L.axes[2] : 0;
    if (Math.abs(stick) > 0.14 && Math.abs(stick) > Math.abs(steer)) {
      steer = stick;
      this.wheelAngle = stick * 0.65;
    }

    this.steerSm += (steer - this.steerSm) * (1 - Math.exp(-16 * dt));
    o.steer = clamp(this.steerSm, -1, 1);
    o.throttle = trigR;
    o.brake = btn(L, 0);
    o.boost = btn(R, 4) > 0.5 || btn(R, 5) > 0.5;
    o.drift = btn(L, 5) > 0.5 || Math.abs(o.steer) > 0.8;
    return o;
  }
}
