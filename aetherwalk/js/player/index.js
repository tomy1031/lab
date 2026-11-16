// js/player/index.js — createPlayer(ctx) (§10.8), OPUS-A.
// Per frame: steps → glide (arms) → locomotion (speed, heading, turning) → body (world collision, ground,
// falling) → derived state → comfort → holsters → grab → hands.
import * as THREE from 'three';
import { DEFAULT_STAND_HEIGHT } from '../core/config.js';
import { clamp, ema, wrapPi, DEG, yawOfQuat } from '../core/util.js';
import { createSteps } from './steps.js';
import { createLocomotion } from './locomotion.js';
import { createBody } from './body.js';
import { createGlide } from './glide.js';
import { createComfort } from './comfort.js';
import { createHolsters } from './holsters.js';
import { createGrab } from './grab.js';
import { createHands } from './hands.js';
import { createDesktop } from './desktop.js';

const _hw = new THREE.Vector3(), _q = new THREE.Quaternion();

export async function createPlayer(ctx) {
  const input = ctx.input;
  const P = {
    rig: ctx.rig,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    wantVel: new THREE.Vector3(),
    yaw: 0, turnYaw: 0,
    speed: 0, cadence: 0, steps: 0, stickSpeed: 0,
    gait: 'idle',
    moving: false, grounded: true, gliding: false, glideTired: false, glideBlend: 0, ducking: false, armsSpread: false,
    lean: 0,
    headHeight: DEFAULT_STAND_HEIGHT, standHeight: DEFAULT_STAND_HEIGHT, armSpan: DEFAULT_STAND_HEIGHT, armSpanSeen: 0,
    center: new THREE.Vector3(),               // play-space centre (rig-local, floor)
    enabled: true,
    abilities: { glide: false },
    bodyYawLocal: 0,
    body: { headPos: new THREE.Vector3(), chestPos: new THREE.Vector3(), radius: 0.25, hitTest: null },
    holsters: null,
  };
  const steps = createSteps(ctx, P);
  const loco = createLocomotion(ctx, P, steps);
  const body = createBody(ctx, P);
  const glide = createGlide(ctx, P);
  const comfort = createComfort(ctx, P);
  const holsters = createHolsters(ctx, P);
  const grab = createGrab(ctx, P, holsters);
  const hands = createHands(ctx, P);
  const desktop = createDesktop(ctx, P, holsters);

  P.body.hitTest = body.hitTest;
  P.holsters = { slotPos: holsters.slotPos, handIn: holsters.handIn, slotLocal: holsters.slotLocal, contentOf: holsters.contentOf };
  P.steps_ = steps;                     // internals for debugging
  P.loco = loco; P.bodySim = body; P.grab = grab; P.desktop = desktop; P.comfort = comfort; P.hands = hands;

  P.turn = (deg) => loco.turn((deg || 0) * DEG);
  P.recenter = () => {
    P.center.set(input.head.localPos.x, 0, input.head.localPos.z);
    if (!ctx.flags.xr) input.virtual.state.center.set(0, 0, 0);
    ctx.events.emit('player:recenter', {});
  };

  P.teleport = (x, z, yawDeg = 0, y) => {
    const rig = ctx.rig;
    const w = ctx.world;
    const yaw = (Number(yawDeg) || 0) * DEG;
    let gy = y;
    if (!Number.isFinite(gy)) { try { gy = w.heightAt(x, z); } catch { gy = 0; } }
    if (!ctx.flags.xr) {
      // desktop: the body faces the new yaw and the virtual head looks straight along it
      P.turnYaw = yaw;
      input.virtual.setLook(yawDeg, input.virtual.getLook().pitchDeg);
    } else {
      P.turnYaw = wrapPi(yaw - yawOfQuat(input.head.localQuat));
    }
    rig.rotation.y = -P.turnYaw;
    rig.position.set(0, gy, 0);
    rig.updateMatrixWorld();
    _hw.set(input.head.localPos.x, 0, input.head.localPos.z).applyQuaternion(rig.quaternion);
    rig.position.set(x - _hw.x, gy, z - _hw.z);
    rig.updateMatrixWorld();
    P.pos.set(x, gy, z);
    P.vel.set(0, 0, 0); P.speed = 0;
    P.grounded = true;
    body.B.vy = 0; body.B.imp.set(0, 0, 0); body.B.lastSafe.set(x, gy, z);
    loco.L.dirYaw = yaw; loco.L.dirInit = true;
    P.yaw = yaw;
    // refresh the head's world pose right away (callers often read state() immediately)
    input.head.pos.copy(input.head.localPos).applyMatrix4(rig.matrixWorld);
    P.body.headPos.copy(input.head.pos);
    ctx.events.emit('player:teleport', { x, z, yaw: Number(yawDeg) || 0 });
  };
  P.addImpulse = (vx, vz) => body.addImpulse(vx, vz);
  P.setEnabled = (b) => { P.enabled = !!b; };
  P.simulateSteps = (spm, seconds) => steps.simulate(spm, seconds);

  let regionT = 0, lastRegion = null, prevDuck = false;
  P.update = (dt) => {
    // integrate real time (sub-stepped) so speed follows real cadence even at a low frame rate
    const edt = dt > 0 ? Math.max(dt, ctx.clock.real || dt) : 0;
    steps.update(edt);
    glide.update(edt);
    loco.update(edt);
    if (edt <= 0) body.update(0);
    else { const n = Math.ceil(edt / 0.05 - 1e-6); for (let i = 0; i < n; i++) body.update(edt / n); }
    dt = edt;

    // derived
    const head = input.head;
    P.headHeight = head.localPos.y;
    const learnt = steps.S.init ? steps.S.stand + 0.1 : DEFAULT_STAND_HEIGHT;
    P.standHeight = ctx.flags.xr ? clamp(learnt, 1.0, 2.1) : input.virtual.state.standHeight;
    P.armSpan = clamp(Math.max(P.standHeight, P.armSpanSeen * 0.98), 1.2, 2.3);
    const duckK = ctx.settings.get('duckDepth') === 'shallow' ? 0.86 : 0.78;
    P.ducking = P.headHeight < P.standHeight * duckK;
    if (P.ducking !== prevDuck) { prevDuck = P.ducking; ctx.events.emit('player:duck', { down: P.ducking }); }
    P.body.headPos.copy(head.pos);
    // chest: 0.3 m under the eyes, a little behind (scaled when ducking)
    _q.setFromAxisAngle(_hw.set(0, 1, 0), -(P.bodyYawLocal + P.turnYaw));
    P.body.chestPos.set(0, -0.32 * (P.headHeight / Math.max(1, P.standHeight)), 0.06).applyQuaternion(_q).add(head.pos);
    const yawB = P.bodyYawLocal;
    const off = (head.localPos.x - P.center.x) * Math.cos(yawB) + (head.localPos.z - P.center.z) * Math.sin(yawB);
    P.lean = clamp(off / 0.35, -1, 1);

    comfort.update(dt);
    holsters.update(dt);
    grab.update(dt);
    hands.update(dt);

    // region changes (checked 4× a second)
    regionT -= dt;
    if (regionT <= 0) {
      regionT = 0.25;
      let r = null;
      try { r = ctx.world.regionAt(P.pos.x, P.pos.z); } catch { r = null; }
      if (r && r !== lastRegion) {
        const from = lastRegion;
        lastRegion = r;
        if (from !== null) ctx.events.emit('region:enter', { region: r, from });
      }
    }
  };

  P.start = () => {
    // the first region of the session is announced once everyone listens
    try { lastRegion = ctx.world.regionAt(P.pos.x, P.pos.z); } catch { lastRegion = 'meadow'; }
  };
  // B button (VR) pauses / resumes (§3.1); runs after input even while paused
  ctx.loop?.addHook?.('pause-button', () => {
    if (ctx.flags.xr && input.justPressed('b')) ctx.setPaused(!ctx.paused, 'user');
  });
  // xr start: learn the real standing height again and recentre on the headset
  ctx.events.on('xr:start', () => { steps.reset(); P.center.set(0, 0, 0); P.turnYaw = -ctx.rig.rotation.y; });
  ctx.events.on('settings:change', ({ key, value }) => { if (key === 'seated' && value && !ctx.settings.get('armOnlyWalk')) ctx.settings.set('armOnlyWalk', true); });
  return P;
}
