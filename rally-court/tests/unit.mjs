// tests/unit.mjs — physics, shot solver, prediction, rules and the step detector, in node (no browser).
//   node tests/unit.mjs
import { makeBall, step, H, SURFACES, speed, rpm, contact, BALL_R, netHeight, COURT, inServiceBox, inSingles } from '../js/physics.js';
import { predict, planIntercept, travelTime, reachIn, findEvent } from '../js/predict.js';
import { solveShot, solveSafe } from '../js/solver.js';
import { Judge, Score } from '../js/rules.js';
import { StepDetector } from '../js/steps.js';
import { SETTINGS, defaults } from '../js/config.js';

let fails = 0, passes = 0;
const check = (cond, msg) => { if (cond) passes++; else { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const hard = SURFACES.hard;
const deg = (r) => r * 180 / Math.PI;

// ── physics ────────────────────────────────────────────────────────────
{
  // ITF rebound test: dropped from 2.54 m (bottom of the ball) rebounds 1.35–1.47 m
  const b = makeBall({ x: 0, y: 2.54 + BALL_R, z: 5 });
  let bounced = false, top = 0;
  for (let i = 0; i < 3000; i++) {
    const ev = []; step(b, H, hard, ev);
    if (ev.some((e) => e.type === 'bounce')) { if (bounced) break; bounced = true; }
    if (bounced) top = Math.max(top, b.p.y - BALL_R);
  }
  check(top > 1.35 && top < 1.47, `drop test rebound ${top.toFixed(3)} m in 1.35–1.47`);
  // clay bounces higher off an angled ball than grass (friction steepens it)
  const outAngle = (surf) => { const c = makeBall({ x: 0, y: BALL_R, z: 5 }, { x: 0, y: -8, z: -20 }); contact(c, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, surf.e, surf.mu); return deg(Math.atan2(c.v.y, -c.v.z)); };
  check(outAngle(SURFACES.clay) > outAngle(SURFACES.hard) && outAngle(SURFACES.hard) > outAngle(SURFACES.grass), `rebound angle clay ${outAngle(SURFACES.clay).toFixed(1)}° > hard ${outAngle(SURFACES.hard).toFixed(1)}° > grass ${outAngle(SURFACES.grass).toFixed(1)}°`);
}
{
  // racket: 20 m/s ball, 25 m/s flat swing → e·20 + (1 + e)·25 with e = 0.42 → 43.9 m/s
  const b = makeBall({ x: 0, y: 1, z: 12 }, { x: 0, y: 0, z: 20 });
  contact(b, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -25 }, 0.42, 0.45);
  check(near(speed(b.v), 43.9, 0.2), `flat hit ${speed(b.v).toFixed(1)} m/s ≈ 43.9`);
  // a still racket (block) returns ~0.42 of the speed
  const k = makeBall({ x: 0, y: 1, z: 12 }, { x: 0, y: 0, z: 20 });
  contact(k, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, 0.42, 0.45);
  check(near(speed(k.v), 8.4, 0.2), `block ${speed(k.v).toFixed(1)} m/s`);
  // low-to-high brush makes topspin (top of the ball turning toward the net: ω.x < 0)
  const t = makeBall({ x: 0, y: 1, z: 12 }, { x: 0, y: -2, z: 18 });
  const a = 30 * Math.PI / 180;
  contact(t, { x: 0, y: 0, z: -1 }, { x: 0, y: 22 * Math.sin(a), z: -22 * Math.cos(a) }, 0.42, 0.45);
  check(t.w.x < 0 && rpm(t.w) > 1500 && rpm(t.w) < 3500, `topspin brush ${rpm(t.w).toFixed(0)} rpm, ${(speed(t.v) * 3.6).toFixed(0)} km/h`);
}
{
  // topspin dips: same launch, topspin lands shorter than flat
  const land = (w) => { const p = predict(makeBall({ x: 0, y: 1, z: 11 }, { x: 0, y: 4, z: -30 }, w), hard, 3); return findEvent(p, 'bounce').z; };
  check(land({ x: -200, y: 0, z: 0 }) > land({ x: 0, y: 0, z: 0 }) && land({ x: 0, y: 0, z: 0 }) > land({ x: 120, y: 0, z: 0 }), 'topspin lands shorter, backspin floats longer');
}
{
  // net: a ball low into the net drops on the hitter's side; one over the tape crosses
  const into = predict(makeBall({ x: 0, y: 0.5, z: 6 }, { x: 0, y: 0, z: -20 }), hard, 2);
  const ne = findEvent(into, 'net'), nb = findEvent(into, 'bounce');
  check(ne && nb && nb.z > 0, `into the net falls back (bounce z=${nb && nb.z.toFixed(2)})`);
  const over = predict(makeBall({ x: 0, y: 1.6, z: 6 }, { x: 0, y: 0, z: -20 }), hard, 2);
  check(!findEvent(over, 'net') && findEvent(over, 'bounce').z < 0, 'over the net lands on the far side');
  check(near(netHeight(0), 0.914, 1e-9) && near(netHeight(COURT.stickX), 1.07, 1e-9), 'net 0.914 m in the centre, 1.07 m at the sticks');
}
{
  // court areas
  check(inSingles(4.12, -11.89, -1) && !inSingles(4.14, -5, -1) && !inSingles(0, -11.91, -1), 'singles lines (a ball touching the line is in)');
  // the player serves from the deuce court (x > 0) diagonally into the CPU's deuce box (x < 0)
  check(inServiceBox(-2, -3, -1, 'deuce') && !inServiceBox(2, -3, -1, 'deuce') && !inServiceBox(-2, -6.5, -1, 'deuce'), 'service boxes (CPU half)');
  check(inServiceBox(2, 3, 1, 'deuce') && inServiceBox(-2, 3, 1, 'ad'), 'service boxes (player half)');
}

// ── solver ─────────────────────────────────────────────────────────────
{
  const P = { x: 0.6, y: 2.75, z: 12.1 };
  const serve = solveShot(P, { x: -1.5, z: -5.6 }, 190 / 3.6, 0, hard);
  check(serve.ok && serve.clear > 0, `190 km/h flat serve into the box, clears the net by ${serve.ok && serve.clear.toFixed(2)} m`);
  if (serve.ok) {
    const p = predict(makeBall(P, serve.v, serve.w), hard, 2);
    const b = findEvent(p, 'bounce');
    check(near(b.x, -1.5, 0.05) && near(b.z, -5.6, 0.05), `serve lands on target (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
    check(b.i * H > 0.38 && b.i * H < 0.5, `serve flight to the bounce ${(b.i * H).toFixed(2)} s`);
  }
  const top = 2200 * 2 * Math.PI / 60;
  const fh = solveShot({ x: 1, y: 0.95, z: 12.3 }, { x: -2.5, z: -9.4 }, 120 / 3.6, top, hard);
  check(fh.ok && deg(fh.th) > 4 && deg(fh.th) < 16 && fh.clear > 0.4, `120 km/h 2200 rpm forehand: launch ${fh.ok && deg(fh.th).toFixed(1)}°, net clearance ${fh.ok && fh.clear.toFixed(2)} m`);
  const lob = solveShot({ x: 0, y: 0.9, z: 11 }, { x: 0, z: -10 }, 18, 100, hard, 'lob');
  check(lob.ok && deg(lob.th) > 30, `lob launch ${lob.ok && deg(lob.th).toFixed(1)}°`);
  const slice = solveShot({ x: 0, y: 0.6, z: 12 }, { x: 2, z: -9 }, 26, -120, hard);
  check(slice.ok && slice.w.x > 0, 'slice has backspin');
  const safe = solveSafe({ x: 0, y: 0.3, z: 12 }, { x: 0, z: -11 }, 45, 0, hard, 0.2);
  check(safe.ok && safe.speed < 45, `a low ball cannot be driven at 45 m/s: slows to ${safe.ok && safe.speed.toFixed(1)}`);
}

// ── prediction / moving to the ball ─────────────────────────────────────
{
  check(near(travelTime(3, 4.5, 6, 9), 1.29, 0.02), `travel 3 m and stop: ${travelTime(3, 4.5, 6, 9).toFixed(2)} s`);
  check(travelTime(3, 4.5, 6, 9, 1.5) < travelTime(3, 4.5, 6, 9), 'arriving on the run is quicker');
  check(near(travelTime(reachIn(1.2, 4.5, 6, 9, 1.5), 4.5, 6, 9, 1.5), 1.2, 0.01), 'reachIn inverts travelTime');
  const P = { x: 0.5, y: 1, z: -11.5 };
  const sh = solveShot(P, { x: 2.6, z: 9.4 }, 28, 200, hard);
  const pr = predict(makeBall(P, sh.v, sh.w), hard, 4);
  const plan = planIntercept(pr, 1, { from: { x: 0, z: 12.5 }, vmax: 4.5, accel: 7, decel: 10, react: 0.2, contactH: 0.95, reach: 0.85, front: 0.4, handSign: 1 });
  check(plan && plan.wing === 'fh' && plan.stance.x < plan.c.x, `ball to the right → forehand, stand left of the ball (${plan && plan.stance.x.toFixed(2)} < ${plan && plan.c.x.toFixed(2)})`);
  check(plan && plan.c.y > 0.6 && plan.c.y < 1.3, `contact height ${plan && plan.c.y.toFixed(2)} m`);
  check(plan && near(plan.stance.z, plan.c.z + 0.4, 1e-6), 'contact 0.4 m in front of the body');
  check(plan && (plan.reachable || plan.short < 0.35), `a rally ball 3 m to the side is reachable at 4.5 m/s (short ${plan && plan.short.toFixed(2)} m)`);
  const lefty = planIntercept(pr, 1, { from: { x: 0, z: 12.5 }, vmax: 4.5, accel: 6, decel: 9, react: 0.2, contactH: 0.95, reach: 0.85, front: 0.4, handSign: -1 });
  check(lefty && lefty.wing === 'bh', 'left-handed: the same ball is a backhand');
  const slow = planIntercept(pr, 1, { from: { x: -4, z: 12.5 }, vmax: 2.0, accel: 3, decel: 4, react: 0.3, contactH: 0.95, reach: 0.85, front: 0.4, handSign: 1 });
  check(slow && !slow.reachable && slow.short > 0, `too slow to get there: short by ${slow && slow.short.toFixed(2)} m`);
}

// ── rules ──────────────────────────────────────────────────────────────
{
  const j = new Judge();
  j.startServe('p', 'deuce', false);
  check(j.bounce(0, 11) && j.phase === 'toss', 'a dropped toss is a re-toss, not a fault');
  j.startServe('p', 'deuce', false);
  j.hit('p');
  check(j.bounce(-2, -4)?.type === 'serve-in', 'serve in the deuce box');
  check(j.bounce(-2, -11)?.reason === 'ace', 'unreturned serve → ace');
  j.startServe('p', 'deuce', false); j.hit('p');
  check(j.bounce(2, -4)?.type === 'fault', 'serve in the wrong box → fault');
  j.startServe('p', 'deuce', true); j.hit('p');
  const df = j.bounce(-2, -7);
  check(df?.type === 'point' && df.winner === 'c' && df.reason === 'double-fault', 'second serve long → double fault');
  j.startServe('p', 'ad', false); j.hit('p'); j.net();
  check(j.bounce(2, -3)?.type === 'let', 'net cord into the box → let');
  j.startServe('c', 'deuce', false); j.hit('c');
  check(j.hit('p')?.winner === 'c', 'volleying the serve loses the point');
  // rally
  j.startServe('c', 'ad', false); j.hit('c'); j.bounce(-2, 4); j.hit('p');
  check(j.bounce(1, -8)?.type === 'in', 'return in');
  j.hit('c');
  const out = j.bounce(4.3, 9);
  check(out?.winner === 'p' && out.reason === 'out', 'CPU hits wide → your point');
  j.startServe('c', 'ad', false); j.hit('c'); j.bounce(-2, 4); j.hit('p'); j.net();
  const nb = j.bounce(0, 1);
  check(nb?.winner === 'c' && nb.reason === 'net', 'into the net → their point');
  j.startServe('c', 'ad', false); j.hit('c'); j.bounce(-2, 4); j.hit('p'); j.bounce(0, -6);
  check(j.bounce(0, -12)?.winner === 'p', 'second bounce → winner');
  j.startServe('p', 'deuce', false); j.hit('p'); j.bounce(-2, -4); j.hit('c');
  check(j.hit('p') === null && j.bounce(1, -9)?.type === 'in', 'a volley is fine in a rally');
  j.startServe('p', 'deuce', false); j.hit('p'); j.bounce(-2, -4); j.hit('c');
  check(j.wall(3, 18)?.winner === 'p', 'into the back fence on the full → out');
}
{
  const s = new Score({ sets: 1, games: 6, first: 'p' });
  const pts = (w, n) => { let r; for (let i = 0; i < n; i++) r = s.point(w); return r; };
  check(s.server() === 'p' && s.court() === 'deuce', 'you serve first, from the deuce court');
  pts('p', 1); check(s.pointText() === '15-0' && s.court() === 'ad', '15-0, next from the ad court');
  pts('c', 3); check(s.pointText() === '15-40', `15-40 (${s.pointText()})`);
  pts('p', 2); check(s.pointText() === 'デュース' && s.pointCall() === 'deuce', 'deuce');
  pts('c', 1); check(s.pointText() === 'アドバンテージ CPU', 'advantage CPU (receiver)');
  const g = pts('c', 1); check(g.game && s.games.c === 1 && s.server() === 'c', 'game CPU, CPU serves next');
  // to 6-6 → tie-break
  for (let k = 0; k < 5; k++) { pts('p', 4); pts('c', 4); }
  // games: p 5, c 6 → p wins one → 6-6
  const t = pts('p', 4);
  check(s.games.p === 6 && s.games.c === 6 && s.tb && t.tbStart, `6-6 → tie-break (${s.games.p}-${s.games.c})`);
  const first = s.server();
  s.point('p'); const second = s.server(); s.point('p'); const third = s.server(); s.point('p'); const fourth = s.server();
  check(second !== first && third === second && fourth === first, 'tie-break service order A, BB, AA…');
  pts('p', 4);
  check(s.over && s.winner === 'p' && s.sets[0].p === 7 && s.sets[0].c === 6, `match 7-6 (${JSON.stringify(s.sets)})`);
  const na = new Score({ noAd: true });
  na.point('p'); na.point('p'); na.point('p'); na.point('c'); na.point('c'); na.point('c');
  check(na.point('c').game && na.games.c === 1, 'no-ad: 40-40 → one deciding point');
  const short = new Score({ games: 4, sets: 3 });
  for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) short.point('p');
  check(short.sets.length === 1 && short.setsWon.p === 1 && !short.over, 'short set to 4, best of 3');
  const mp = new Score({ games: 4 });
  for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) mp.point('p');
  for (let i = 0; i < 3; i++) mp.point('p');
  check(mp.pressure()?.kind === 'match' && mp.pressure()?.who === 'p' && mp.pointText() !== '', 'match point detected');
}

// ── step detector ───────────────────────────────────────────────────────
{
  // head bob of stepping in place: ~3 cm at the given cadence
  const run = (spm, seconds, amp = 0.03, armSpm = 0) => {
    const arms = armSpm > 0;
    const d = new StepDetector({ sensitivity: 'mid' });
    const f = 72, dt = 1 / f;
    let maxF = 0;
    for (let i = 0; i < seconds * f; i++) {
      const t = i * dt;
      const ph = 2 * Math.PI * (spm / 60 / 2) * t;   // one step per half period of |sin|
      const y = spm > 0 ? 1.6 - amp * Math.abs(Math.sin(ph)) : 1.6;
      const sw = arms ? 0.18 * Math.sin(2 * Math.PI * (armSpm / 60 / 2) * t) : 0;
      d.update(dt, { y, x: 0, z: 0, pitch: 0, yaw: 0 }, arms ? [{ x: 0.2, y: 1.1, z: -0.1 - sw, ok: true }, { x: -0.2, y: 1.1, z: -0.1 + sw, ok: true }] : null);
      maxF = Math.max(maxF, d.cadence);
    }
    return d;
  };
  const slow = run(100, 4), fast = run(170, 4), still = run(0, 3), tiny = run(160, 4, 0.004);
  check(near(slow.cadence, 100, 8) && slow.moving, `100 spm detected (${slow.cadence.toFixed(0)})`);
  check(near(fast.cadence, 170, 12), `170 spm detected (${fast.cadence.toFixed(0)})`);
  check(still.cadence === 0 && !still.moving, 'standing still: no steps');
  check(!tiny.moving, '4 mm jitter is not stepping');
  const arms = run(0, 4, 0, 140);
  check(arms.armCadence > 60, `arm swing alone counts (${arms.armCadence.toFixed(0)} per min)`);
}

// ── settings schema ─────────────────────────────────────────────────────
{
  const d = defaults();
  check(d.moveMode === 'step' && d.maxSpeed > 3 && d.maxSpeed < 6, 'defaults: stepping mode, realistic top speed');
  for (const s of SETTINGS) {
    if (s.type === 'range') check(s.def >= s.min && s.def <= s.max, `default of ${s.key} within range`);
    if (s.type === 'choice') check(s.options.some(([v]) => v === s.def), `default of ${s.key} is an option`);
  }
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
