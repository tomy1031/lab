// tests/gestures.mjs — the hand-gesture rules on synthetic MediaPipe landmarks (no camera needed)
//   node tests/gestures.mjs
import assert from 'node:assert/strict';
import { classify, wheelAngle, steerFromAngle, GestureInterpreter } from '../js/engine/gesture-math.js';

// a hand in image space (x right, y down), palm facing the camera, fingers up. ext = [thumb, index, middle, ring, pinky]
function hand(ext, { cx = 0.5, cy = 0.6, rot = 0, s = 1 } = {}) {
  const pts = [[0, 0]];
  const th = ext[0] ? [[-0.04, -0.03], [-0.07, -0.06], [-0.09, -0.08], [-0.11, -0.1]] : [[-0.03, -0.03], [-0.04, -0.06], [-0.03, -0.075], [-0.02, -0.07]];
  pts.push(...th);
  const bases = [-0.025, 0, 0.022, 0.042];
  bases.forEach((bx, i) => {
    if (ext[i + 1]) pts.push([bx, -0.09], [bx * 1.05, -0.13], [bx * 1.1, -0.16], [bx * 1.15, -0.19]);
    else pts.push([bx, -0.09], [bx, -0.12], [bx * 0.9, -0.1], [bx * 0.8, -0.075]);
  });
  const c = Math.cos(rot), si = Math.sin(rot);
  // rot > 0 tilts the fingers toward image-left (= the player's right)
  return pts.map(([x, y]) => ({ x: cx + (x * c + y * si) * s, y: cy + (-x * si + y * c) * s, z: 0 }));
}

const OPEN = [1, 1, 1, 1, 1], FIST = [0, 0, 0, 0, 0], PEACE = [0, 1, 1, 0, 0], POINT = [0, 1, 0, 0, 0];
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

ok('poses', () => {
  assert.equal(classify(hand(OPEN)), 'open');
  assert.equal(classify(hand(FIST)), 'fist');
  assert.equal(classify(hand(PEACE)), 'peace');
  assert.equal(classify(hand(POINT)), 'point');
  assert.equal(classify(hand(PEACE, { rot: 0.4 })), 'peace');
});

ok('two hands level → straight', () => {
  const a = wheelAngle([hand(FIST, { cx: 0.3, cy: 0.6 }), hand(FIST, { cx: 0.7, cy: 0.6 })]);
  assert.ok(Math.abs(a) < 0.01, `angle ${a}`);
});

ok('two hands: player turns the wheel right (their left hand up) → steer right', () => {
  // the player's left hand is on the image's right side
  const a = wheelAngle([hand(FIST, { cx: 0.3, cy: 0.7 }), hand(FIST, { cx: 0.7, cy: 0.5 })]);
  assert.ok(a > 0.2, `angle ${a}`);
  assert.ok(steerFromAngle(a) > 0.2);
});

ok('two hands: turning left → steer left, regardless of hand order', () => {
  const a = wheelAngle([hand(FIST, { cx: 0.7, cy: 0.7 }), hand(FIST, { cx: 0.3, cy: 0.5 })]);
  assert.ok(a < -0.2, `angle ${a}`);
});

ok('one hand tilted toward the player\'s right → steer right', () => {
  const a = wheelAngle([hand(OPEN, { rot: 0.5 })]);
  assert.ok(a > 0.3, `angle ${a}`);
  const b = wheelAngle([hand(OPEN, { rot: -0.5 })]);
  assert.ok(b < -0.3, `angle ${b}`);
  assert.ok(Math.abs(wheelAngle([hand(OPEN)])) < 0.05);
});

ok('dead zone and full lock', () => {
  assert.equal(steerFromAngle(0.03), 0);
  assert.equal(steerFromAngle(0.9), 1);
  assert.equal(steerFromAngle(-0.9), -1);
});

ok('interpreter: hands → throttle, no hands → brake after a moment', () => {
  const g = new GestureInterpreter();
  let o;
  for (let i = 0; i < 10; i++) o = g.update([hand(FIST, { cx: 0.3 }), hand(FIST, { cx: 0.7 })], 1 / 30);
  assert.equal(o.throttle, 1);
  for (let i = 0; i < 40; i++) o = g.update([], 1 / 30);
  assert.equal(o.throttle, 0);
  assert.ok(o.brake > 0);
});

ok('interpreter: peace sign held → one item use, then cooldown', () => {
  const g = new GestureInterpreter();
  let uses = 0;
  for (let i = 0; i < 20; i++) { const o = g.update([hand(PEACE, { cx: 0.3 }), hand(FIST, { cx: 0.7 })], 1 / 30); if (o.item) uses++; }
  assert.equal(uses, 1);
});

ok('interpreter: a long hard turn starts a drift, straightening ends it', () => {
  const g = new GestureInterpreter();
  let o;
  for (let i = 0; i < 20; i++) o = g.update([hand(FIST, { cx: 0.3, cy: 0.75 }), hand(FIST, { cx: 0.7, cy: 0.42 })], 1 / 30);
  assert.ok(o.steer > 0.6, `steer ${o.steer}`);
  assert.equal(o.drift, true);
  for (let i = 0; i < 20; i++) o = g.update([hand(FIST, { cx: 0.3 }), hand(FIST, { cx: 0.7 })], 1 / 30);
  assert.equal(o.drift, false);
});

console.log(`\n${n} gesture checks passed`);
