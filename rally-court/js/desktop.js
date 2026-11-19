// js/desktop.js — playing on a PC (and the demo bot's visible racket): the racket follows a real stroke path
// around your body and collides with the ball through the same swept physics as in VR.
//   left click: topspin drive · right click: slice · Space: toss (serve) then click to serve
//   mouse: aim (where in the opposite court you want the ball to go) · the camera follows your body.
import * as THREE from 'three';
import { strokePose, contactSpeedPerU } from './stroke.js';
import { COURT } from './physics.js';

// the forward swing's duration (s) is set so the racket head meets the ball at a realistic speed:
// drive 17 m/s, slice 12.5 m/s, serve 40 m/s (u accelerates as (t/back)^pow, so du/dt at the contact = pow/back)
const swing = (pow, speed, kind, slice) => ({ pow, back: (pow * contactSpeedPerU(kind, slice)) / speed });
const SWING = { drive: swing(2.0, 17, 'fh'), slice: swing(1.6, 12.5, 'fh', true), serve: swing(2.0, 40, 'serve') };

export class DesktopSwing {
  constructor() {
    this.state = null;       // { kind, wing, slice, t, cH }
    this.time = 0;
    this.pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.aim = { x: 0, z: -9 };
  }
  /** start a stroke; contactIn: seconds until the planned contact (auto swing), else the stroke's own timing */
  start(kind, wing, cH, serve = false, contactIn = null, volley = false) {
    const cfg = SWING[serve ? 'serve' : kind];
    const t0 = contactIn == null ? this.time : this.time - (cfg.back - Math.max(0, Math.min(cfg.back, contactIn)));
    this.state = { kind: serve ? 'serve' : wing, slice: kind === 'slice', volley, t0, cfg, cH };
  }
  backswing(kind) { return SWING[kind].back; }
  /**
   * stroke phase now: −1 (racket back) → 0 (contact) → 1 (finish). The head accelerates into the contact
   * (fastest there) and slows down through the follow-through with the same speed at the contact.
   */
  u() {
    const st = this.state;
    if (!st) return 0;
    const t = this.time - st.t0, back = st.cfg.back, pw = st.cfg.pow;
    if (t < back) return Math.pow(Math.max(0, t) / back, pw) - 1;
    const T2 = (2 * back) / pw;                       // follow-through with a matching speed at the contact
    const s = Math.min(1, (t - back) / T2);
    return 1 - (1 - s) * (1 - s);
  }
  get busy() { return this.state && this.time - this.state.t0 < 0.7; }

  /**
   * body: {x, z} (world), facing −z. plan: the next ball (for the backswing and the contact height).
   * hand: +1 right-handed. Returns the racket pose (world) for this frame.
   */
  update(dt, body, plan, hand, serving, prep = 1) {
    this.time += dt;
    let sw;
    const st = this.state;
    if (st) {
      const t = this.time - st.t0;
      const u = this.u();
      if (t > st.cfg.back + 0.45) this.state = null;
      sw = { kind: st.kind, u, cH: st.cH, slice: st.slice, volley: st.volley, reach: 0.85, front: 0.4 };
      if (st.kind === 'serve') sw = { kind: 'serve', u };
    } else if (serving) {
      sw = { kind: 'serve', u: -0.35 };
    } else if (plan) {
      // unit turn: take the racket back as the ball comes
      sw = { kind: plan.wing, u: -1, cH: plan.c.y, reach: 0.85, front: 0.4, volley: plan.volley, prep };
    } else sw = { kind: 'ready', u: 0 };
    // mirror for the left hand: local x flips
    const pose = strokePose(sw);
    const mirror = hand < 0;
    // local (facing +z, right −x) → world (facing −z): rotate 180° about y; a left-hander mirrors x
    const toWorld = (v) => new THREE.Vector3(mirror ? v.x : -v.x, v.y, -v.z);
    const hp = toWorld(pose.hand).add(new THREE.Vector3(body.x, 0, body.z));
    const yAx = toWorld(pose.shaft).normalize();
    const zAx = toWorld(pose.face);
    zAx.sub(yAx.clone().multiplyScalar(zAx.dot(yAx))).normalize();
    const xAx = new THREE.Vector3().crossVectors(yAx, zAx);
    this.pose.p.copy(hp);
    this.pose.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, zAx));
    return this.pose;
  }

  /** where the mouse aims, in the CPU's half (or service box when serving) */
  aimFrom(mx, my, serveCourt) {
    if (serveCourt) {
      const sign = serveCourt === 'deuce' ? -1 : 1;     // the CPU's deuce box is on −x
      this.aim = { x: sign * (2.1 + mx * 1.6), z: -(COURT.serviceZ - 1.1 - my * 0.6) };
    } else {
      this.aim = { x: Math.max(-3.4, Math.min(3.4, mx * 3.6)), z: -(COURT.halfLen - 2.4 - my * 1.6) };
    }
    return this.aim;
  }
}
