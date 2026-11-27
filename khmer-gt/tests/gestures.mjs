// tests/gestures.mjs — Unit tests for controller-free hand gesture driving interpreter
import assert from 'node:assert/strict';
import { GestureInterpreter, classifyHand, LM } from '../js/engine/gesture-math.js';

function makeHand(cx, cy, pose = 'fist') {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  lm[LM.WRIST] = { x: cx, y: cy + 0.12, z: 0 };
  lm[LM.MIDDLE_MCP] = { x: cx, y: cy, z: 0 };
  lm[LM.INDEX_MCP] = { x: cx - 0.03, y: cy + 0.01, z: 0 };
  lm[LM.RING_MCP] = { x: cx + 0.03, y: cy + 0.01, z: 0 };
  lm[LM.PINKY_MCP] = { x: cx + 0.05, y: cy + 0.03, z: 0 };
  lm[LM.THUMB_MCP] = { x: cx - 0.05, y: cy + 0.06, z: 0 };

  const setFinger = (mcp, pip, dip, tip, dx, extended) => {
    const mx = lm[mcp].x, my = lm[mcp].y;
    if (extended) {
      lm[pip] = { x: mx + dx * 0.2, y: my - 0.05, z: 0 };
      lm[dip] = { x: mx + dx * 0.3, y: my - 0.09, z: 0 };
      lm[tip] = { x: mx + dx * 0.4, y: my - 0.14, z: 0 };
    } else {
      lm[pip] = { x: mx, y: my - 0.02, z: 0 };
      lm[dip] = { x: mx, y: my + 0.02, z: 0 };
      lm[tip] = { x: mx, y: my + 0.05, z: 0 };
    }
  };

  setFinger(LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP, -0.01, pose === 'open' || pose === 'peace' || pose === 'point');
  setFinger(LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP, 0, pose === 'open' || pose === 'peace');
  setFinger(LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP, 0.01, pose === 'open');
  setFinger(LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP, 0.02, pose === 'open');

  if (pose === 'thumbup') {
    lm[LM.THUMB_TIP] = { x: cx - 0.11, y: cy - 0.08, z: 0 };
  } else {
    lm[LM.THUMB_TIP] = { x: cx - 0.04, y: cy + 0.05, z: 0 };
  }
  return lm;
}

// 1. Pose classification tests
assert.equal(classifyHand(makeHand(0.5, 0.5, 'fist')), 'fist');
assert.equal(classifyHand(makeHand(0.5, 0.5, 'open')), 'open');
assert.equal(classifyHand(makeHand(0.5, 0.5, 'peace')), 'peace');
assert.equal(classifyHand(makeHand(0.5, 0.5, 'thumbup')), 'thumbup');
assert.equal(classifyHand(makeHand(0.5, 0.5, 'point')), 'point');

// 2. Two-hand steering right (in mirrored webcam: left hand is high x, right hand is low x; right hand lower y -> turn right)
const interp = new GestureInterpreter();
for (let i = 0; i < 15; i++) {
  interp.update([makeHand(0.75, 0.42, 'fist'), makeHand(0.25, 0.62, 'fist')], 1 / 30);
}
assert.ok(interp.out.steer > 0.35, `Expected right steer > 0.35, got ${interp.out.steer}`);
assert.ok(interp.out.throttle > 0.8, `Expected throttle > 0.8, got ${interp.out.throttle}`);
assert.equal(interp.out.brake, 0);

// 3. Open palm brake
for (let i = 0; i < 15; i++) {
  interp.update([makeHand(0.75, 0.5, 'open'), makeHand(0.25, 0.5, 'open')], 1 / 30);
}
assert.ok(interp.out.brake > 0.8, `Expected brake > 0.8, got ${interp.out.brake}`);
assert.ok(interp.out.throttle < 0.1, `Expected throttle < 0.1, got ${interp.out.throttle}`);

// 4. Peace sign triggers ERS boost
interp.update([makeHand(0.75, 0.5, 'fist'), makeHand(0.25, 0.5, 'peace')], 1 / 30);
assert.equal(interp.out.boost, true);
assert.equal(interp.out.pose, 'boost');

console.log('✓ All hand-gesture unit tests passed!');
