// tests/racket.mjs — the VR racket's swept collision in node (three.js from node_modules): a racket swung
// through the path of a ball at Quest frame rates must hit it, send it back realistically, and an edge hit
// must be weaker than a centre hit. Also checks the grip calibration (racket points along the controller).
import * as THREE from 'three';
import { RacketBody, RACKET } from '../js/racket.js';
import { makeBall, copyBall, step, H, SURFACES, speed, rpm } from '../js/physics.js';

let fails = 0, passes = 0;
const check = (cond, msg) => { if (cond) { passes++; console.log('ok  ', msg); } else { fails++; console.log('FAIL', msg); } };

/**
 * A forehand: the racket (face toward −z, the head to the right of the hand) sweeps forward at `vr` m/s through
 * z = zc while the ball comes along +z.
 * offset: where on the strings (m along the shaft from the head centre). Frame rate fps.
 */
function swing({ vr = 22, vin = 18, offset = 0, lateral = 0, fps = 90, lift = 0 }) {
  const body = new RacketBody();
  const surf = SURFACES.hard;
  const zc = 11.7;                  // contact plane
  const yc = 1.0;
  // racket frame: +Y (shaft) → world +x (head to the right of the hand), +Z (normal) → world −z, +X → world +y
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)));
  // the hand such that the strings point (offset along the shaft, lateral across) is on the ball's line x = 0, y = yc
  const hand = (z) => new THREE.Vector3(-(RACKET.headC + offset), yc - lateral, z);
  // the ball starts 0.5 m before the contact plane, level (gravity drops it ~3 mm on the way)
  const ball = makeBall({ x: 0, y: yc, z: zc - 0.5 }, { x: 0, y: 0, z: vin });
  const tContact = 0.5 / vin;
  const dtF = 1 / fps;
  let t = 0, hit = null, info = null;
  const zAt = (tt) => zc - vr * (tt - tContact);    // the racket moves toward −z, reaching zc at tContact
  const yLift = (tt) => lift * (tt - tContact);
  body.teleport(hand(zAt(0) - 0), q);
  const accSteps = Math.round(dtF / H);
  for (let f = 0; f < fps && !hit; f++) {
    t += dtF;
    body.setPose(hand(zAt(t)).add(new THREE.Vector3(0, yLift(t), 0)), q, dtF);
    for (let k = 0; k < accSteps; k++) {
      const b0 = copyBall(ball);
      step(ball, H, surf, []);
      const h = body.sweep(new THREE.Vector3(b0.p.x, b0.p.y, b0.p.z), new THREE.Vector3(ball.p.x, ball.p.y, ball.p.z), k / accSteps, (k + 1) / accSteps);
      if (h) { copyBall(b0, ball); if (h.s > 0) step(ball, h.s * H, surf, []); info = body.impact(ball, h); hit = h; break; }
    }
    // the racket moves the wrong way for a hit before reaching the ball
  }
  // velocities: the racket moves at −vr in z
  return { hit, info, ball };
}

{
  const r = swing({});
  check(r.hit && !r.hit.frame, 'a 22 m/s forehand at 90 Hz hits the strings');
  const out = r.ball.v;
  check(out.z < -30 && out.z > -48, `outgoing ${(-out.z * 3.6).toFixed(0)} km/h back over the net (expected ≈ 0.42·18 + 1.42·22 = 39 m/s)`);
  const r72 = swing({ fps: 72, vr: 28 });
  check(r72.hit, 'a 28 m/s swing at 72 Hz is not missed between frames (swept test)');
  const tip = swing({ offset: 0.12 });
  check(tip.hit && speed(tip.ball.v) < speed(r.ball.v) - 1.5, `hit near the tip is weaker (${speed(tip.ball.v).toFixed(1)} < ${speed(r.ball.v).toFixed(1)} m/s)`);
  const edge = swing({ lateral: 0.14 });
  check(edge.hit && edge.hit.frame && speed(edge.ball.v) < 25, `frame hit shanks (${edge.hit && edge.hit.frame}, ${speed(edge.ball.v).toFixed(1)} m/s)`);
  const miss = swing({ lateral: 0.3 });
  check(!miss.hit, 'a ball 30 cm beside the head is missed');
  const top = swing({ lift: 9 });
  check(top.hit && rpm(top.ball.w) > 1200 && top.ball.w.x < 0, `brushing up makes topspin (${rpm(top.ball.w).toFixed(0)} rpm)`);
}
{
  // the racket in the hand's grip frame (WebXR grip space: −Z toward the thumb, +Y up the forearm, back of the
  // right hand +X): the shaft at 55° from the forearm line, the strings' normal through the palm
  const { racketMount } = await import('../js/arm.js');
  const q = racketMount('R', 55, 0);
  const shaft = new THREE.Vector3(0, 1, 0).applyQuaternion(q), normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const ang = Math.acos(-shaft.y) * 180 / Math.PI;
  check(Math.abs(ang - 55) < 0.5 && shaft.z < 0 && Math.abs(shaft.x) < 1e-6, `shaft ${ang.toFixed(0)}° from the forearm line, toward the thumb`);
  check(normal.x < -0.99, 'right hand: the face normal through the palm (−X)');
  check(new THREE.Vector3(0, 0, 1).applyQuaternion(racketMount('L', 55, 0)).x > 0.99, 'left hand: through its palm (+X)');
  const open = new THREE.Vector3(0, 0, 1).applyQuaternion(racketMount('R', 55, 15));
  check(open.z < -0.1, `a positive roll tilts the palm-side face toward the thumb (opens it when the thumb is up): ${open.z.toFixed(2)}`);
  const hammer = new THREE.Vector3(0, 1, 0).applyQuaternion(racketMount('R', 90, 0));
  check(hammer.z < -0.999, '90° = held like a hammer, along the fist');
}
{
  // strokes: the head is exactly at the contact at u = 0, moves smoothly, and the arm reaches the grip
  const { strokePose, contactSpeedPerU } = await import('../js/stroke.js');
  const { solveArm, WRIST, racketMount: rm } = await import('../js/arm.js');
  const cases = [['fh', {}], ['bh', {}], ['fh', { slice: true }], ['bh', { slice: true }], ['fh', { volley: true }], ['bh', { volley: true }], ['serve', {}]];
  const mountInv = rm('R', 55, 0).invert();
  for (const [kind, extra] of cases) {
    for (const cH of [0.5, 0.95, 1.35]) {
      const sw = { kind, cH, reach: 0.85, front: 0.4, ...extra };
      const c = strokePose({ ...sw, u: 0 });
      const want = kind === 'serve' ? new THREE.Vector3(-0.2, 2.68, 0.3) : new THREE.Vector3(kind === 'fh' ? -0.85 : 0.85, cH, 0.4);
      if (cH === 0.95 || kind !== 'serve') check(c.head.distanceTo(want) < 1e-6, `${kind}${extra.slice ? ' slice' : extra.volley ? ' volley' : ''} at ${cH} m: the head meets the ball`);
      let prev = null, maxStep = 0;
      for (let u = -1; u <= 1.0001; u += 0.01) { const h = strokePose({ ...sw, u }).head; if (prev) maxStep = Math.max(maxStep, h.distanceTo(prev)); prev = h; }
      if (cH === 0.95) check(maxStep < 0.08, `${kind}${extra.slice ? ' slice' : extra.volley ? ' volley' : ''}: a smooth path (largest step ${maxStep.toFixed(3)} m per 0.01)`);
    }
  }
  const fh = contactSpeedPerU('fh'), sl = contactSpeedPerU('fh', true), sv = contactSpeedPerU('serve');
  check(fh > 1.5 && fh < 4 && sl > 1 && sl < 3 && sv > 2 && sv < 5, `head speed per unit of u: drive ${fh.toFixed(2)}, slice ${sl.toFixed(2)}, serve ${sv.toFixed(2)} m`);
  const e = 0.004, a = strokePose({ kind: 'fh', u: -e }).head, b = strokePose({ kind: 'fh', u: e }).head;
  const dir = b.clone().sub(a).normalize();
  check(dir.z > 0.7 && dir.y > 0.2, `forehand: forward and low to high at the contact (${dir.toArray().map((x) => x.toFixed(2)).join(', ')})`);
  // IK: the wrist of the racket hand is within reach of the shoulder at the contact (1.83 m figure)
  for (const kind of ['fh', 'bh', 'serve']) {
    const p = strokePose({ kind, u: 0, cH: 0.95, toss: 1 });
    const qR = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(p.shaft, p.face), p.shaft, p.face));
    const qG = qR.clone().multiply(mountInv);
    const wrist = WRIST.clone().applyQuaternion(qG).add(p.hand);
    // the figure's skeleton as js/avatar.js builds it (legs 0.46 + 0.46 m, hips → shoulders 0.47 m)
    const c = Math.max(0, 0.32 + p.crouch), splay = 0.13 + 0.06 * Math.min(1, c);
    const hipY = (0.46 * Math.cos(c * 0.5) + 0.46 * Math.cos(-c * 0.5)) * Math.cos(splay * 0.8) + 0.075 + p.jump;
    const qC = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.T).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.lean));
    const sh = new THREE.Vector3(-0.185, 0.47, 0).applyQuaternion(qC).add(new THREE.Vector3(p.sway, hipY, 0));
    sh.y += 0.06 * Math.min(1, Math.max(0, (p.hand.y - sh.y) / 0.6));
    const S = new THREE.Vector3(), E = new THREE.Vector3(), W = new THREE.Vector3();
    solveArm(sh, wrist, 0.3, 0.265, new THREE.Vector3(0, -1, 0), S, E, W, 0.14);
    check(W.distanceTo(wrist) < 0.02 && Math.abs(S.distanceTo(E) - 0.3) < 1e-6 && Math.abs(E.distanceTo(W) - 0.265) < 1e-6, `${kind}: the arm reaches the grip at the contact (gap ${W.distanceTo(wrist).toFixed(3)} m)`);
  }
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
