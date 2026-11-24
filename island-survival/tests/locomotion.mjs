// tests/locomotion.mjs — walking by the body (DESIGN §27.5): the step and arm-swing detectors with synthetic motion,
// and the controls guide rows (§27.6).   node tests/locomotion.mjs
import { StepDetector, ArmSwingDetector, swingAxis, CameraArmWalk } from '../js/vr/locomotion.js';
import { guideRows } from '../js/vr/guiderows.js';

let fails = 0;
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = (a) => (rnd() - 0.5) * 2 * a;

/** run a head-height signal y(t) for `secs` at `fps` → the last result and the fraction of time walking */
function steps(y, secs = 6, fps = 72, pitch = () => 0, det = new StepDetector()) {
  let r = null, walk = 0, n = 0, runN = 0;
  for (let i = 0; i < secs * fps; i++) { const t = i / fps; r = det.update(1 / fps, y(t), pitch(t)); if (t > 1.5) { n++; if (r.walking) walk++; if (r.run) runN++; } }
  return { r, walk: walk / Math.max(1, n), run: runN / Math.max(1, n), det };
}

// ---- 足踏み
const march = steps((t) => 1.62 + 0.025 * Math.sin(2 * Math.PI * 1.8 * t) + noise(0.002));
check(march.walk > 0.9 && march.r.speed > 0.9 && march.run < 0.1, `marching in place (1.8 steps/s, ±2.5 cm) walks at full speed (walking ${(march.walk * 100).toFixed(0)}%, speed ${march.r.speed.toFixed(2)}, cadence ${march.r.cadence.toFixed(2)})`);
const slow = steps((t) => 1.62 + 0.02 * Math.sin(2 * Math.PI * 1.1 * t) + noise(0.002));
check(slow.walk > 0.8 && slow.r.speed < 0.75 && slow.r.speed >= 0.45, `slow steps walk slower (speed ${slow.r.speed.toFixed(2)})`);
const jog = steps((t) => 1.6 + 0.035 * Math.sin(2 * Math.PI * 3 * t) + noise(0.002));
check(jog.walk > 0.9 && jog.run > 0.8, `jogging in place (3 steps/s) runs (${(jog.run * 100).toFixed(0)}%)`);
const still = steps((t) => 1.62 + noise(0.003) + 0.004 * Math.sin(t * 0.7));
check(still.walk === 0, 'standing still (head sway ±3 mm) does not walk');
const nod = steps((t) => 1.62 + 0.03 * Math.sin(2 * Math.PI * 1.5 * t), 6, 72, (t) => 0.35 * Math.sin(2 * Math.PI * 1.5 * t));
check(nod.walk < 0.05, `nodding (the head tilts with the bob) does not walk (${(nod.walk * 100).toFixed(0)}%)`);
const crouch = steps((t) => (t < 2 ? 1.62 : t < 4 ? 1.62 - Math.min(0.5, (t - 2) * 1.5) : 1.12 + Math.min(0.5, (t - 4) * 1.5)) + noise(0.002));
check(crouch.walk < 0.05, `crouching down and up does not walk (${(crouch.walk * 100).toFixed(0)}%)`);
const one = steps((t) => 1.62 + (t > 2 && t < 2.3 ? 0.03 * Math.sin((t - 2) / 0.3 * Math.PI) : 0));
check(one.walk === 0, 'a single bob (one step to the side) does not walk');
{ // stopping: walking ends within ~1.2 s
  const det = new StepDetector(); let stopAt = null;
  for (let i = 0; i < 72 * 8; i++) { const t = i / 72; const y = 1.62 + (t < 4 ? 0.025 * Math.sin(2 * Math.PI * 1.8 * t) : 0); const r = det.update(1 / 72, y); if (t >= 4 && !r.walking && stopAt == null) stopAt = t; }
  check(stopAt != null && stopAt - 4 < 1.3, `stopping the steps stops walking (${stopAt != null ? (stopAt - 4).toFixed(2) : 'never'} s)`);
}
{ // a slow headset (36 fps) still works
  const r = steps((t) => 1.62 + 0.025 * Math.sin(2 * Math.PI * 1.8 * t), 6, 36);
  check(r.walk > 0.85, `works at 36 fps too (${(r.walk * 100).toFixed(0)}%)`);
}
{ // sensitivity: very small steps (±0.65 cm) need ×1.6
  const small = (t) => 1.62 + 0.0065 * Math.sin(2 * Math.PI * 1.8 * t);
  const d1 = new StepDetector(), d2 = new StepDetector(); let w1 = 0, w2 = 0;
  for (let i = 0; i < 72 * 6; i++) { const t = i / 72; if (d1.update(1 / 72, small(t), 0, 1).walking) w1++; if (d2.update(1 / 72, small(t), 0, 1.6).walking) w2++; }
  check(w1 === 0 && w2 > 72 * 3, `tiny steps walk only with a higher sensitivity (×1: ${w1}, ×1.6: ${w2} frames)`);
}

// ---- 腕振り
function arms(sL, sR, secs = 5, fps = 72, det = new ArmSwingDetector()) {
  let r = null, act = 0, n = 0, runN = 0;
  for (let i = 0; i < secs * fps; i++) { const t = i / fps; r = det.update(1 / fps, sL(t), sR(t)); if (t > 1) { n++; if (r.active) act++; if (r.run) runN++; } }
  return { r, act: act / n, run: runN / n };
}
const w = 2 * Math.PI * 1.4;
const swing = arms((t) => 1.3 * Math.sin(w * t), (t) => -1.3 * Math.sin(w * t));
check(swing.act > 0.85 && swing.r.speed > 0.5 && swing.run < 0.1, `swinging the arms in turn walks (active ${(swing.act * 100).toFixed(0)}%, speed ${swing.r.speed.toFixed(2)})`);
const big = arms((t) => 3.2 * Math.sin(w * t), (t) => -3.2 * Math.sin(w * t));
check(big.run > 0.6, `big fast swings run (${(big.run * 100).toFixed(0)}%)`);
const same = arms((t) => 1.5 * Math.sin(w * t), (t) => 1.5 * Math.sin(w * t));
check(same.act === 0, 'both hands moving together (a two-handed chop, rowing) does not walk');
const oneArm = arms((t) => 2 * Math.sin(w * t), () => 0.05);
check(oneArm.act === 0, 'one arm alone (chopping, waving) does not walk');
const tiny = arms((t) => 0.25 * Math.sin(w * t), (t) => -0.25 * Math.sin(w * t));
check(tiny.act === 0, 'hands trembling a little do not walk');
{ // stop
  const det = new ArmSwingDetector(); let stopAt = null;
  for (let i = 0; i < 72 * 6; i++) { const t = i / 72; const s = t < 3 ? 1.3 * Math.sin(w * t) : 0; const r = det.update(1 / 72, s, -s); if (t >= 3 && !r.active && stopAt == null) stopAt = t; }
  check(stopAt != null && stopAt - 3 < 1, `stopping the arms stops walking (${stopAt != null ? (stopAt - 3).toFixed(2) : 'never'} s)`);
}
check(Math.abs(swingAxis({ x: 0, y: 0, z: -1 }, 0) - 1) < 1e-9 && Math.abs(swingAxis({ x: 0, y: 1, z: 0 }, 0) - 1) < 1e-9 && Math.abs(swingAxis({ x: -1, y: 0, z: 0 }, Math.PI / 2) - 1) < 1e-9, 'swingAxis: forward and up count, in the frame of the head\'s yaw');

// ---- camera hands
{
  const cw = new CameraArmWalk(); let act = 0;
  for (let i = 0; i < 30 * 4; i++) { const t = i / 30, v = 5 * Math.sin(w * t); cw.update(1 / 30, [{ x: 0.3, vy: v }, { x: 0.7, vy: -v }]); if (t > 1 && cw.active) act++; }
  const ax = cw.merge({ x: 0, y: 0, run: false });
  check(act > 60 && ax.y > 0.4, `camera: two hands swung up and down in turn walk (axes y ${ax.y.toFixed(2)})`);
  const keys = cw.merge({ x: 0, y: -1, run: false });
  check(keys.y === -1, 'camera: the keys win while they are used');
  for (let i = 0; i < 60; i++) cw.update(1 / 30, [{ x: 0.5, vy: 0 }]);
  check(!cw.active, 'camera: one hand (or none) stops the walking');
}

// ---- the controls guide rows
const world = guideRows({ mode: 'world', move: 'arms', target: true });
check(world.right.rows.some((r) => r.key === 'trigger') && world.right.rows.some((r) => r.key === 'b' && /メニュー/.test(r.text)) && world.left.rows.some((r) => r.key === 'x') && /腕/.test(world.left.rows[0].text), 'guide (world): trigger / A / grip / stick / B on the right, stick / X / Y on the left, and the walking mode');
check(guideRows({ mode: 'world', held: 'bow' }).right.rows[0].text.includes('矢') && guideRows({ mode: 'world', held: 'bow' }).right.rows.find((r) => r.key === 'grip').text.includes('弓'), 'guide: with a bow the trigger shoots and the grip draws');
for (const m of ['menu', 'work', 'place', 'activity']) { const g = guideRows({ mode: m }); check(g.left.rows.length >= 1 && g.right.rows.length >= 2 && g.right.rows.length <= 5, `guide (${m}): rows for both hands`); }

console.log(fails ? `${fails} FAILED` : 'all locomotion checks passed');
process.exit(fails ? 1 : 0);
