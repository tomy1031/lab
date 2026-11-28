// tests/paddle.mjs — your paddle against the ball, as in VR: the paddle pose arrives once per frame (72 / 90 /
// 120 Hz) and is interpolated inside the 1 kHz physics. A fast swing must never pass through the ball, the
// sweet spot must feel (and play) different from the tip and the edge, and swing speed / face angle must matter.
//   node tests/paddle.mjs
import * as THREE from 'three';
import { makeBall, step, H, BALL_R, spinParts, TABLE } from '../js/physics.js';
import { PaddleBody, BLADE, HALF_T } from '../js/paddle.js';
import { flyFirst } from '../js/shot.js';

let n = 0;
const fail = [];
const check = (c, m) => { n++; if (!c) { fail.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };

/**
 * Swing a forehand: the paddle's contact point moves toward −z (the net) through `meet` at speed `v` (m/s),
 * rising `lift` degrees, its face (tip to the right) tilted `close` degrees down (closed). The ball comes along +z.
 * offset: where on the face to meet the ball (local x, y from the sweet spot). Returns the ball after contact.
 */
function swing({ hz = 90, v = 12, close = 10, lift = 15, ballV = 7, ballSpin = 0, offX = 0, offY = 0, meet = new THREE.Vector3(0.3, 1.0, 1.55) }) {
  const body = new PaddleBody({});
  const d2r = Math.PI / 180;
  // paddle orientation: tip to the right (+x), forehand face toward −z, closed by `close`
  const sc = Math.sin(close * d2r), cc = Math.cos(close * d2r);
  const qBase = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, cc, -sc), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -sc, -cc)));
  const dir = new THREE.Vector3(0, Math.sin(lift * d2r), -Math.cos(lift * d2r));
  const sweetLocal = new THREE.Vector3(offX, BLADE.yc + BLADE.sweetY + offY, HALF_T);
  const handAt = (t) => {
    // the contact point on the face crosses `meet` at t = 0
    const p = meet.clone().addScaledVector(dir, v * t);
    return p.sub(sweetLocal.clone().applyQuaternion(qBase));
  };
  // the ball: its surface reaches `meet` at t = 0 (a straight line: exact geometry for the check)
  const b = makeBall({ x: meet.x, y: meet.y, z: meet.z }, { x: 0, y: 0, z: ballV }, { x: ballSpin, y: 0, z: 0 });
  const frame = 1 / hz;
  let t = -0.25;                       // start a quarter second before the meeting
  body.teleport(handAt(t), qBase);
  // run the ball back so it arrives on time
  b.p.z = meet.z - BALL_R - ballV * 0.25;
  let hit = null, steps = 0;
  const b0 = new THREE.Vector3(), b1 = new THREE.Vector3();
  while (t < 0.15 && !hit) {
    const tn = t + frame;
    body.setPose(handAt(tn), qBase, frame);
    const N = Math.round(frame / H);
    for (let k = 0; k < N && !hit; k++) {
      b0.set(b.p.x, b.p.y, b.p.z);
      // straight-line flight (no gravity / drag) keeps the geometry exact
      b.p.x += b.v.x * H; b.p.y += b.v.y * H; b.p.z += b.v.z * H;
      b1.set(b.p.x, b.p.y, b.p.z);
      const h = body.sweep(b0, b1, k / N, (k + 1) / N);
      if (h) {
        b.p.x = b0.x + (b1.x - b0.x) * h.s; b.p.y = b0.y + (b1.y - b0.y) * h.s; b.p.z = b0.z + (b1.z - b0.z) * h.s;
        hit = body.impact(b, h);
      }
      steps++;
    }
    t = tn;
  }
  return { b, hit };
}

// 1 — no tunnelling, at any frame rate, up to smash speed
for (const hz of [72, 90, 120]) {
  let missed = 0;
  for (const v of [4, 8, 14, 20, 28]) {
    const { hit } = swing({ hz, v, ballV: 12 });
    if (!hit) missed++;
  }
  check(missed === 0, `${hz} Hz: swings of 4–28 m/s against a 12 m/s ball all make contact (missed ${missed})`);
}

// 2 — faster swing, faster ball
{
  const slow = swing({ v: 6 }), fast = swing({ v: 16 });
  const s0 = Math.hypot(slow.b.v.x, slow.b.v.y, slow.b.v.z), s1 = Math.hypot(fast.b.v.x, fast.b.v.y, fast.b.v.z);
  check(s1 > s0 + 8, `a 16 m/s swing sends the ball faster than a 6 m/s swing (${(s1 * 3.6).toFixed(0)} vs ${(s0 * 3.6).toFixed(0)} km/h)`);
  check(fast.b.v.z < 0, 'the ball goes back toward the net');
}

// 3 — the face angle sets the direction; brushing up makes topspin
{
  const open = swing({ close: -15, lift: 10 }), closed = swing({ close: 25, lift: 10 });
  check(closed.b.v.y < open.b.v.y - 1, `a closed face sends the ball lower (${closed.b.v.y.toFixed(1)} vs ${open.b.v.y.toFixed(1)} m/s up)`);
  const brush = swing({ v: 14, close: 30, lift: 45 });
  const sp = spinParts(brush.b.v, brush.b.w).top;
  check(sp > 3500, `brushing upward with a closed face gives topspin (${sp.toFixed(0)} rpm)`);
  const chop = swing({ v: 6, close: -50, lift: -35 });
  const sb = spinParts(chop.b.v, chop.b.w).top;
  check(sb < -800, `cutting under the ball gives backspin (${sb.toFixed(0)} rpm)`);
}

// 4 — the sweet spot, the tip, the edge
{
  const c = swing({ v: 12 }), tip = swing({ v: 12, offY: 0.06 }), side = swing({ v: 12, offX: 0.055 });
  const sc = Math.hypot(c.b.v.x, c.b.v.y, c.b.v.z), st = Math.hypot(tip.b.v.x, tip.b.v.y, tip.b.v.z);
  check(c.hit.sweet > 0.85 && tip.hit.sweet < c.hit.sweet - 0.4, `sweet spot ${c.hit.sweet.toFixed(2)}, near the tip ${tip.hit.sweet.toFixed(2)}`);
  check(st < sc - 0.5, `the tip plays slower (${(st * 3.6).toFixed(0)} vs ${(sc * 3.6).toFixed(0)} km/h)`);
  // the paddle's local +x is up here (tip to the right): a hit above the centre turns the face up
  check(side.b.v.y > c.b.v.y + 0.3, `an off-centre hit twists the face toward the side that was hit (${(side.b.v.y - c.b.v.y).toFixed(2)} m/s off line)`);
  const edge = swing({ v: 12, offX: BLADE.b + 0.016 });
  check(edge.hit && edge.hit.face === 'edge', `the rim of the paddle is an edge hit (${edge.hit && edge.hit.face})`);
}

// 5 — a full forehand drive in the physics lands on the table
{
  const r = swing({ v: 11, close: 10, lift: 40, ballV: 7, meet: new THREE.Vector3(0.3, TABLE.h + 0.28, 1.6) });
  const f = flyFirst(r.b);
  check(f.kind === 'table' && f.side === -1, `a 11 m/s closed-face drive lands on the far half (${f.kind} z ${f.z.toFixed(2)}, ${(Math.hypot(r.b.v.x, r.b.v.y, r.b.v.z) * 3.6).toFixed(0)} km/h)`);
}

void step;
console.log(`\n${n - fail.length}/${n} ok`);
if (fail.length) process.exit(1);
