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
  // the grip calibration used in game.js: shaft along the pointing ray tilted up by racketTilt, face normal sideways
  const tilt = 15 * Math.PI / 180;
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 + tilt);
  const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const q = q1.multiply(q2);
  const shaft = new THREE.Vector3(0, 1, 0).applyQuaternion(q), normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  check(shaft.z < -0.9 && shaft.y > 0.2 && Math.abs(shaft.x) < 1e-6, `shaft points forward and ${(Math.asin(shaft.y) * 180 / Math.PI).toFixed(0)}° up along the controller ray`);
  check(Math.abs(normal.x) > 0.99, 'face normal sideways (eastern grip: the palm faces the strings)');
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
