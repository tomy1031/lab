// js/player.js — you: the play space (rig) on the court and the three ways to move it.
//
//   足踏み・腕振り (step): step in place / pump your arms; you travel in a straight line toward the target —
//     the place to stand to hit the coming ball (or the ready position after your shot) — as fast as the
//     cadence says (up to your top speed), and you stop on it. You can't really sprint in a room; this is the
//     stand-in for the dash.
//   自動 (auto): the same target, reached by itself after your reaction time, limited by your top speed and
//     acceleration (if the ball is too far for your speed, you don't get there).
//   十字キー (dpad): the thumbstick (PC: arrow keys / WASD / gamepad d-pad) moves you freely.
// Your real steps in the room always add on top. The body is the point under your head.
import * as THREE from 'three';
import { StepDetector } from './steps.js';
import { moveToward, moveVelocity, clampToArea } from './motion.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Player {
  constructor(rig, camera, settings) {
    this.rig = rig; this.camera = camera; this.settings = settings;
    this.steps = new StepDetector({ sensitivity: settings.get('stepSensitivity') });
    settings.onChange((k, v) => { if (k === 'stepSensitivity') this.steps.opt.sensitivity = v; });
    this.loco = { x: 0, z: 0, vx: 0, vz: 0 };     // the artificial motion state (body position & velocity)
    this.body = { x: 0, z: 12.6, vx: 0, vz: 0 };   // where you are (incl. your real steps)
    this.target = null; this.targetKind = null;
    this.reactUntil = 0; this.lastFlight = -1;
    this.effort = 0;
    this.speed = 0;            // artificial speed (m/s) for the vignette and the HUD
    this.yaw = 0;              // PC look
    this.pitch = 0;
    this.time = 0;
    this.prevBody = null;
  }
  get(k) { return this.settings.get(k); }

  /** world position of the body (under the head in VR; the rig itself on PC, where the camera follows behind) */
  bodyWorld(out = _v) {
    if (this.isXR && this.isXR()) this.camera.getWorldPosition(out);
    else out.copy(this.rig.position);
    return out;
  }
  /** head pose in the room (rig space) */
  headLocal() { return { p: this.camera.position, q: this.camera.quaternion }; }

  /** put your body at (x, z) facing the net */
  place(x, z) {
    this.rig.updateMatrixWorld(true);
    const b = this.bodyWorld(new THREE.Vector3());
    this.rig.position.x += x - b.x;
    this.rig.position.z += z - b.z;
    this.loco.vx = this.loco.vz = 0;
    this.rig.updateMatrixWorld(true);
    this.body.x = x; this.body.z = z; this.body.vx = this.body.vz = 0;
    this.prevBody = null;
  }
  /** turn the play space so that where you look now is toward the net */
  recenter() {
    _e.setFromQuaternion(this.camera.quaternion, 'YXZ');
    const b = this.bodyWorld(new THREE.Vector3());
    this.rig.rotation.y = -_e.y;
    this.rig.updateMatrixWorld(true);
    this.place(b.x, b.z);
  }

  /**
   * sim: the Sim (plan of the next ball, flight id, phase); input: Input; xr: in VR. Moves the rig.
   * Returns { target, kind, speed }.
   */
  update(dt, sim, input, xr) {
    this.time += dt;
    const mode = this.get('moveMode');
    const vmax = this.get('maxSpeed'), acc = this.get('accel'), dec = this.get('decel');
    // stepping detector (always fed so the HUD can show the cadence)
    const head = this.camera.position;
    _e.setFromQuaternion(this.camera.quaternion, 'YXZ');
    const pitch = _e.x, headYaw = _e.y;
    const hands = [input.hands.left, input.hands.right].map((h) => ({ x: h.gripLocal.x, y: h.gripLocal.y, z: h.gripLocal.z, ok: h.tracked }));
    if (xr) this.steps.update(dt, { x: head.x, y: head.y, z: head.z, pitch }, hands, headYaw);
    else {
      // PC: hold F to step in place (150 steps/min, with Shift 190)
      const want = input.key('KeyF') ? (input.key('ShiftLeft') || input.key('ShiftRight') ? 190 : 150) : 0;
      if (want !== (this.steps.sim || 0)) this.steps.simulate(want);
      this.steps.update(dt, { x: 0, y: 1.65, z: 0, pitch: 0 }, null, 0);
    }

    // the target: the stance for the coming ball, else the ready position after your shot
    const plan = sim.playerPlan;
    let target = null, kind = null;
    if (plan && sim.phase === 'play') { target = plan.stance; kind = plan.reachable ? 'ball' : 'ball-far'; }
    else if (sim.phase === 'play' && sim.lastFrom === 'p' && this.get('autoRecover')) { target = sim.ready; kind = 'ready'; }
    if (sim.flight !== this.lastFlight) { this.lastFlight = sim.flight; this.reactUntil = this.time + (sim.lastFrom === 'p' ? 0.15 : this.get('reaction')); }
    this.target = target; this.targetKind = kind;

    // current body position (with real steps) as the start of this frame's artificial motion
    this.rig.updateMatrixWorld(true);
    const bw = this.bodyWorld(new THREE.Vector3());
    const s = this.loco;
    s.x = bw.x; s.z = bw.z;
    let cap = vmax;
    this.effort = 0;
    if (mode === 'step') {
      this.effort = this.steps.effort(this.get('stepTopCadence'), this.get('armWeight'));
      cap = this.effort * vmax;
      if (cap < 0.05 || !target) moveToward(s, null, dt, vmax, acc, dec);
      else moveToward(s, target, dt, vmax, acc, dec, cap);
    } else if (mode === 'auto') {
      const go = target && this.time >= this.reactUntil && sim.phase === 'play';
      moveToward(s, go ? target : null, dt, vmax, acc, dec);
    } else {
      // d-pad: stick of either hand (whichever is pushed more), or keys / gamepad on PC
      let sx = 0, sy = 0;
      if (xr) {
        for (const h of [input.hands.left, input.hands.right]) if (Math.hypot(h.stick.x, h.stick.y) > Math.hypot(sx, sy)) { sx = h.stick.x; sy = h.stick.y; }
      } else {
        if (input.key('ArrowLeft') || input.key('KeyA')) sx -= 1;
        if (input.key('ArrowRight') || input.key('KeyD')) sx += 1;
        if (input.key('ArrowUp') || input.key('KeyW')) sy -= 1;
        if (input.key('ArrowDown') || input.key('KeyS')) sy += 1;
        const gp = input.pad;
        if (gp) {
          if (gp.buttons[14]?.pressed) sx -= 1; if (gp.buttons[15]?.pressed) sx += 1;
          if (gp.buttons[12]?.pressed) sy -= 1; if (gp.buttons[13]?.pressed) sy += 1;
          if (Math.abs(gp.axes[0]) > Math.abs(sx)) sx = gp.axes[0];
          if (Math.abs(gp.axes[1]) > Math.abs(sy)) sy = gp.axes[1];
        }
      }
      let m = Math.hypot(sx, sy);
      const dz = this.get('deadzone');
      let wx = 0, wz = 0;
      if (m > dz) {
        let ang = Math.atan2(sx, -sy);                 // 0 = up (toward the net)
        let mag = Math.min(1, (m - dz) / (1 - dz));
        if (this.get('stickDigital')) { ang = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4); mag = 1; }
        if (this.get('stickFrame') === 'head') ang += -(xr ? headYaw + this.rig.rotation.y : this.yaw);
        const sp = mag * this.get('stickSpeed') * vmax;
        wx = Math.sin(ang) * sp; wz = -Math.cos(ang) * sp;
      }
      moveVelocity(s, wx, wz, dt, vmax, acc, dec);
    }
    clampToArea(s, 1);
    this.rig.position.x += s.x - bw.x;
    this.rig.position.z += s.z - bw.z;
    this.speed = Math.hypot(s.vx, s.vz);
    // body (with the real motion) for the sim and the CPU
    this.rig.updateMatrixWorld(true);
    const nb = this.bodyWorld(new THREE.Vector3());
    if (this.prevBody && dt > 0) {
      const k = 1 - Math.exp(-dt / 0.1);
      this.body.vx += ((nb.x - this.prevBody.x) / dt - this.body.vx) * k;
      this.body.vz += ((nb.z - this.prevBody.z) / dt - this.body.vz) * k;
    }
    this.prevBody = { x: nb.x, z: nb.z };
    this.body.x = nb.x; this.body.z = nb.z;
    return { target, kind, speed: this.speed };
  }
}
