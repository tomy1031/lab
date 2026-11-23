// tests/gestures.mjs — the motion recogniser with synthetic MediaPipe hands (no camera, no browser).
//   node tests/gestures.mjs
import { MotionRecognizer } from '../js/gesture/motion.js';
import { classify } from '../js/gesture/pose.js';

let failed = 0;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) failed++; };

// canonical right-ish hand, fingers up, in units of hand size; image y grows downward
const OPEN = [
  [0, 0.5], [-0.25, 0.35], [-0.4, 0.2], [-0.5, 0.05], [-0.6, -0.08],
  [-0.18, -0.05], [-0.2, -0.35], [-0.21, -0.55], [-0.22, -0.75],
  [0, -0.08], [0, -0.4], [0, -0.62], [0, -0.82],
  [0.16, -0.05], [0.18, -0.35], [0.19, -0.53], [0.2, -0.7],
  [0.3, 0.02], [0.34, -0.22], [0.36, -0.36], [0.38, -0.5],
];
const FOLD = { // tips (and the joint before) curled back near the knuckles
  thumb: { 3: [-0.2, 0.2], 4: [-0.05, 0.12] },
  index: { 7: [-0.19, -0.2], 8: [-0.17, -0.02] },
  middle: { 11: [0, -0.22], 12: [0, -0.04] },
  ring: { 15: [0.18, -0.2], 16: [0.17, -0.02] },
  pinky: { 19: [0.33, -0.1], 20: [0.31, 0.04] },
};
function hand({ x = 0.5, y = 0.5, s = 0.25, pose = 'open', pinch = false } = {}) {
  const pts = OPEN.map((p) => p.slice());
  const fold = (f) => { for (const [i, v] of Object.entries(FOLD[f])) pts[i] = v.slice(); };
  if (pose === 'fist') ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach(fold);
  if (pose === 'point') ['thumb', 'middle', 'ring', 'pinky'].forEach(fold);
  if (pose === 'gun') ['middle', 'ring', 'pinky'].forEach(fold);
  if (pinch) { pts[4] = pts[8].slice(); pts[3] = [-0.32, -0.45]; }
  return pts.map(([px, py]) => ({ x: x + px * s, y: y + py * s, z: 0 }));
}
const ASPECT = 1; // synthetic hands are built in square units

check(classify(hand({ pose: 'open' }), ASPECT) === 'open', 'synthetic open hand classifies as open');
check(classify(hand({ pose: 'fist' }), ASPECT) === 'fist', 'synthetic fist classifies as fist');
check(classify(hand({ pose: 'point' }), ASPECT) === 'point', 'synthetic point classifies as point');
check(classify(hand({ pose: 'gun' }), ASPECT) === 'gun', 'synthetic gun classifies as gun');

/** run frames: fn(i, t) → hands[]; returns all events */
function run(frames, fn, rec = new MotionRecognizer(), dt = 1 / 30) {
  const ev = [];
  for (let i = 0; i < frames; i++) {
    const st = rec.update(fn(i, i * dt), dt, ASPECT);
    ev.push(...st.events);
  }
  return { ev, rec, types: ev.map((e) => e.type) };
}
const count = (r, type) => r.types.filter((t) => t === type).length;

// 1. chopping: fist strokes down and back up slowly, 3 times
{
  const r = run(90, (i) => {
    const ph = (i % 30) / 30; // 0…1 per stroke; fast down in 0.15 s, slow up
    const y = ph < 0.15 ? 0.3 + (ph / 0.15) * 0.4 : 0.7 - ((ph - 0.15) / 0.85) * 0.4;
    return [hand({ x: 0.5, y, pose: 'fist' })];
  });
  const downs = r.ev.filter((e) => e.type === 'swing' && e.dir === 'down').length;
  check(downs === 3, `3 fast down-strokes → 3 swing:down (got ${downs}; all: ${r.types.filter((t) => t === 'swing').length})`);
}
// 2. grab
{
  const r = run(30, (i) => [hand({ pose: i < 15 ? 'open' : 'fist' })]);
  check(count(r, 'grab') === 1, 'open → fist = grab');
}
// 3. pinch / pinchEnd
{
  const r = run(30, (i) => [hand({ pose: 'open', pinch: i >= 10 && i < 20 })]);
  check(count(r, 'pinch') === 1 && count(r, 'pinchEnd') === 1, `pinch then let go (${r.types.join(',')})`);
}
// 4. reel: pointing hand drawing circles (1.5 turns/s for 2 s → ≈ 3 turns ≈ 12 quarter turns)
{
  const r = run(60, (i, t) => [hand({ x: 0.5 + Math.cos(t * Math.PI * 3) * 0.09, y: 0.5 + Math.sin(t * Math.PI * 3) * 0.09, pose: 'point' })]);
  check(count(r, 'reel') >= 8, `circling hand → reel events (got ${count(r, 'reel')})`);
}
// 5. rub: two hands close together sliding up/down opposite at 2.5 Hz
{
  const r = run(60, (i, t) => {
    const o = Math.sin(t * Math.PI * 5) * 0.07;
    return [hand({ x: 0.4, y: 0.5 + o, pose: 'open' }), hand({ x: 0.6, y: 0.5 - o, pose: 'open' })];
  });
  check(count(r, 'rub') >= 6, `palms rubbing → rub strokes (got ${count(r, 'rub')})`);
}
// 6. strike: two fists knock together fast
{
  const r = run(30, (i) => {
    const k = Math.min(1, i / 6);
    return [hand({ x: 0.2 + k * 0.17, y: 0.5, pose: 'fist' }), hand({ x: 0.8 - k * 0.17, y: 0.5, pose: 'fist' })];
  });
  check(count(r, 'strike') >= 1, `fists knock → strike (got ${count(r, 'strike')})`);
}
// 7. bow: left hand holds, right hand pinches and pulls away, then lets go
{
  const r = run(60, (i) => {
    const pull = Math.min(1, i / 30);
    const pinch = i < 45;
    return [hand({ x: 0.3, y: 0.5, pose: 'fist' }), hand({ x: 0.45 + pull * 0.4, y: 0.5, pose: 'open', pinch })];
  });
  const loose = r.ev.find((e) => e.type === 'loose');
  check(!!loose && loose.power > 0.5, `bow draw + release → loose (power ${loose?.power?.toFixed(2)})`);
}
// 8. gun: thumb folds = shoot
{
  const r = run(30, (i) => [hand({ pose: i < 15 ? 'gun' : 'point' })]);
  check(count(r, 'shoot') === 1, 'finger gun, thumb drops → shoot');
}
// 9. wave
{
  const r = run(45, (i, t) => [hand({ x: 0.5 + Math.sin(t * Math.PI * 6) * 0.08, y: 0.4, pose: 'open' })]);
  check(count(r, 'wave') >= 1, `waving open hand → wave (got ${count(r, 'wave')})`);
}
// 10. push: hand comes toward the camera (grows 45 % in 0.2 s)
{
  const r = run(30, (i) => [hand({ s: 0.2 * (1 + Math.min(1, Math.max(0, (i - 10) / 6)) * 0.45), pose: 'open' })]);
  check(count(r, 'push') >= 1, `hand toward camera → push (got ${count(r, 'push')})`);
}
// 11. holding still produces nothing but pose
{
  const r = run(60, () => [hand({ pose: 'open' })]);
  check(r.types.filter((t) => t !== 'pose').length === 0, `a still hand makes no gestures (${r.types.join(',')})`);
}
// 12. throw: fist moving fast then opening
{
  const r = run(30, (i) => [hand({ x: 0.3 + Math.min(i, 12) * 0.04, y: 0.5, pose: i < 11 ? 'fist' : 'open' })]);
  check(count(r, 'throw') >= 1, `fist swung and opened → throw (got ${r.types.join(',')})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall gesture checks passed');
process.exit(failed ? 1 : 0);
