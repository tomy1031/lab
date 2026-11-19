// js/fparms.js — your own arms in VR. The hands sit exactly on the controllers (the WebXR grip space is the hand
// frame of js/arm.js); the shoulders are estimated from the headset (below and behind the eyes, turned with the
// body — the head's facing pulled toward where the hands are), the arm lengths from your standing height, and the
// elbows found by IK. What the hands do (grip, hold the ball, open after the toss, take the racket with both
// hands) is decided by the game.
import * as THREE from 'three';
import { Arm } from './arm.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(), _m = new THREE.Vector3();

export class FirstPersonArms {
  constructor(scene, opt = {}) {
    const o = { sleeve: opt.sleeve ?? 0xf2f4f7, band: opt.band ?? 0x1f4e8c, skin: opt.skin ?? 0xd59f7c, shadows: false };
    this.arms = { left: new Arm('L', o), right: new Arm('R', o) };
    for (const a of Object.values(this.arms)) { a.group.visible = false; scene.add(a.group); for (const m of a.group.children) m.renderOrder = 1; }
    this.yaw = null;
    this.standY = 1.6;
    this.k = 1;
    this.neck = new THREE.Vector3();
  }

  /** angle difference a − b wrapped to (−π, π] */
  static dAng(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; }

  /**
   * camera: the XR camera (world pose); hands: { left, right } each null (hidden) or
   * { pos, quat (grip frame, world), pose } ; dt for smoothing.
   */
  update(dt, camera, hands) {
    camera.getWorldPosition(_p); camera.getWorldQuaternion(_q);
    // your size from your standing eye height (crouching doesn't shrink you)
    if (_p.y > this.standY) this.standY = _p.y;
    else this.standY += (Math.max(1.2, _p.y) - this.standY) * Math.min(1, dt / 40);
    this.k = Math.max(0.86, Math.min(1.12, this.standY / 0.935 / 1.8));
    // the body's facing: the head's, pulled toward the middle of the hands
    _f.set(0, 0, -1).applyQuaternion(_q);
    const headYaw = Math.atan2(-_f.x, -_f.z);
    let want = headYaw;
    const L = hands.left, R = hands.right;
    // the neck: below and behind the eyes (follows nods), then the shoulders below it
    this.neck.set(0, -0.1, 0.085).applyQuaternion(_q).add(_p);
    if (L && R) {
      _m.copy(L.pos).add(R.pos).multiplyScalar(0.5).sub(this.neck);
      if (Math.hypot(_m.x, _m.z) > 0.12) {
        const handsYaw = Math.atan2(-_m.x, -_m.z);
        want = headYaw + Math.max(-0.9, Math.min(0.9, FirstPersonArms.dAng(handsYaw, headYaw))) * 0.5;
      }
    }
    if (this.yaw == null) this.yaw = want;
    this.yaw += FirstPersonArms.dAng(want, this.yaw) * Math.min(1, dt / 0.12);
    // never more than 70° from where the head looks
    const off = FirstPersonArms.dAng(this.yaw, headYaw);
    if (Math.abs(off) > 1.22) this.yaw = headYaw + Math.sign(off) * 1.22;
    const y = this.yaw;
    const right = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
    const back = new THREE.Vector3(Math.sin(y), 0, Math.cos(y));
    const k = this.k;
    const shoulderY = this.neck.y - 0.13 * k;
    for (const side of ['left', 'right']) {
      const arm = this.arms[side], h = hands[side];
      arm.group.visible = !!h;
      if (!h) continue;
      arm.k = k;
      const s = side === 'right' ? 1 : -1;
      const sh = new THREE.Vector3(this.neck.x, shoulderY, this.neck.z).addScaledVector(right, s * 0.18 * k).addScaledVector(back, 0.02);
      // the elbow points down, out and a little back
      const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, s * 0.55).addScaledVector(back, 0.35);
      arm.setPose(sh, h.pos, h.quat, pole, h.pose);
    }
  }
}
