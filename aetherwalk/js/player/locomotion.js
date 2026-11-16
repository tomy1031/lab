// js/player/locomotion.js — cadence → speed (§2.2), heading, back-walk, turning, stick move (OPUS-A).
// Produces the wanted horizontal velocity (P.wantVel); body.js applies it against the world.
import * as THREE from 'three';
import { STEP } from '../core/config.js';
import { clamp, ema, piecewise, wrapPi, yawOfQuat, DEG } from '../core/util.js';

const SLOPE_UP = [[0, 1], [20, 0.8], [35, 0.4], [42, 0]];
const TURN_EV = { yaw: 0 };
const _f = new THREE.Vector3(), _f2 = new THREE.Vector3(), _hb = new THREE.Vector3(), _ha = new THREE.Vector3();

export function createLocomotion(ctx, P, steps) {
  const input = ctx.input;
  const L = {
    dirInit: false, snapArmed: true, resetHold: 0, backward: false,
    factors: { curve: 0, state: 0, vigor: 1, slope: 1, road: 1, tailwind: 1, stride: 1, water: 1, arms: 1, back: 1 },
    target: 0,
  };

  /** rotate the rig about the head (snap / smooth turn), keeping the head where it is */
  function turn(rad) {
    if (!rad) return;
    const rig = ctx.rig;
    rig.updateMatrixWorld();
    _hb.copy(input.head.localPos).applyMatrix4(rig.matrixWorld);
    P.turnYaw = wrapPi(P.turnYaw + rad);
    rig.rotation.y = -P.turnYaw;
    rig.updateMatrixWorld();
    _ha.copy(input.head.localPos).applyMatrix4(rig.matrixWorld);
    rig.position.x += _hb.x - _ha.x;
    rig.position.z += _hb.z - _ha.z;
    rig.updateMatrixWorld();
    // keep the desktop view looking the same way relative to the body
    if (!ctx.flags.xr) input.virtual.addLook(rad / DEG, 0);
    L.dirYaw = wrapPi((L.dirYaw ?? 0) + rad);
    TURN_EV.yaw = P.turnYaw;
    ctx.events.emit('player:turn', TURN_EV);
  }

  function headingYaw() {
    if (ctx.settings.get('moveDirection') === 'hands') {
      const l = input.hands.left, r = input.hands.right;
      if (l.tracked && r.tracked) {
        _f.set(0, 0, -1).applyQuaternion(l.aimQuat);
        _f2.set(0, 0, -1).applyQuaternion(r.aimQuat);
        _f.add(_f2);
        if (_f.x * _f.x + _f.z * _f.z > 0.05) return Math.atan2(_f.x, -_f.z);
      }
    }
    return input.head.yaw;
  }

  function update(dt) {
    const settings = ctx.settings;
    // ── turning (right stick) ──
    const sx = input.stick.right.x;
    if (P.enabled && dt > 0) {
      if (settings.get('turnMode') === 'smooth') {
        if (Math.abs(sx) > 0.15) turn(sx * settings.get('smoothTurnSpeed') * DEG * dt);
      } else {
        if (Math.abs(sx) > 0.7 && L.snapArmed) { turn(Math.sign(sx) * settings.get('snapAngle') * DEG); L.snapArmed = false; }
        if (Math.abs(sx) < 0.35) L.snapArmed = true;
      }
      // orientation + centre reset: right stick pressed 1 s
      if (input.pressed('stickR')) {
        L.resetHold += dt;
        if (L.resetHold >= 1 && L.resetHold - dt < 1) P.recenter();
      } else L.resetHold = 0;
    }

    // ── heading ──
    const want = headingYaw();
    if (!L.dirInit) { L.dirYaw = want; L.dirInit = true; }
    L.dirYaw = wrapPi(L.dirYaw + wrapPi(want - L.dirYaw) * ema(STEP.tauDir, dt));

    // ── speed ──
    const F = L.factors;
    const S = steps.S;
    F.state = steps.stateFactor();
    F.curve = steps.curve(S.state === 'idle' ? 0 : S.cadence);
    F.vigor = steps.vigor();
    F.stride = settings.get('strideScale');
    F.tailwind = ctx.game?.vitals?.speedMul ?? 1;
    if (!Number.isFinite(F.tailwind) || F.tailwind <= 0) F.tailwind = 1;
    F.arms = steps.armOnly() ? 0.7 : 1;
    L.backward = F.state > 0 && input.stick.left.y < -0.5;
    F.back = L.backward ? 0.5 : 1;
    const moveYaw = L.backward ? wrapPi(L.dirYaw + Math.PI) : L.dirYaw;
    const dx = Math.sin(moveYaw), dz = -Math.cos(moveYaw);
    // terrain factors at the feet
    const w = ctx.world;
    const x = P.pos.x, z = P.pos.z;
    F.road = 1; F.water = 1; F.slope = 1;
    try {
      if (w.pathAt(x, z) >= 0.5) F.road = 1.10;
      const depth = w.waterDepthAt(x, z);
      if (depth >= 0.2 && depth < 1.1) F.water = 0.7;
      const h0 = w.heightAt(x, z);
      if (P.pos.y < h0 + 0.3) {                      // on terrain (platforms are flat)
        const h1 = w.heightAt(x + dx * 0.6, z + dz * 0.6);
        const ang = Math.atan2(h1 - h0, 0.6) / DEG;
        if (ang > 0) F.slope = piecewise(SLOPE_UP, ang);
      }
    } catch { /* stub world */ }
    let target = F.curve * F.state * F.vigor * F.slope * F.road * F.tailwind * F.stride * F.water * F.arms * F.back;
    if (!P.enabled || P.gliding) target = 0;
    L.target = target;
    const tau = target > P.speed ? STEP.tauAccel : STEP.tauStop;
    P.speed += (target - P.speed) * ema(tau, dt);
    if (P.speed < 0.005 && target === 0) P.speed = 0;
    P.wantVel.set(dx * P.speed, 0, dz * P.speed);

    // ── optional stick walking (setting) ──
    if (P.enabled && settings.get('stickMove')) {
      const lx = input.stick.left.x, ly = input.stick.left.y;
      const m = Math.hypot(lx, ly);
      if (m > 0.15 && P.speed < 0.3) {
        const hy = input.head.yaw;
        const fx = Math.sin(hy), fz = -Math.cos(hy), rx = Math.cos(hy), rz = Math.sin(hy);
        const sp = 2.2 * Math.min(1, m) * F.slope * F.water * F.tailwind;
        P.wantVel.set((fx * ly + rx * lx) / m * sp, 0, (fz * ly + rz * lx) / m * sp);
        P.stickSpeed = sp;
      } else P.stickSpeed = 0;
    } else P.stickSpeed = 0;

    // ── public state ──
    P.yaw = L.dirYaw;
    P.cadence = S.state === 'idle' ? Math.max(0, S.cadenceDisp - 0.5) * (S.cadenceDisp > 1 ? 1 : 0) : S.cadenceDisp;
    P.moving = P.speed > 0.1 || P.stickSpeed > 0.1;
    const g = steps.gait();
    if (g !== P.gait) {
      const from = P.gait;
      P.gait = g;
      ctx.events.emit('gait', { from, to: g });
    }
  }

  return { L, update, turn, headingYaw };
}
