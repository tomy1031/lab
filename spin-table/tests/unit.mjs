// tests/unit.mjs — physics, contact, solvers and rules without a browser.
//   node tests/unit.mjs
import { makeBall, step, H, TABLE, NET, BALL_R, contact, spinParts, spinVector, RUBBERS, rubberCOR, RPS } from '../js/physics.js';
import { solveShot, solveSafe, solveServe, solvePaddle, paddleOut, flyFirst } from '../js/shot.js';
import { Rally, Score, serveFault } from '../js/rules.js';
import { headDistance, headRho, BLADE, HALF_T } from '../js/paddle.js';
import { planRally, planServe, predict } from '../js/planner.js';
import { sanitize, SETTINGS, defaults } from '../js/config.js';

let n = 0;
const fail = [];
const check = (c, m) => { n++; if (!c) { fail.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const fly = (b, t, ev = []) => { for (let i = 0; i < Math.round(t / H); i++) step(b, H, ev); return ev; };
/** height of the first bounce's apex after dropping from h above the table */
function dropBounce(h) {
  const b = makeBall({ x: 0.2, y: TABLE.h + BALL_R + h, z: 0.6 });
  let bounced = false, top = 0;
  for (let i = 0; i < 3000; i++) {
    const ev = [];
    step(b, H, ev);
    if (ev.some((e) => e.type === 'table')) { if (bounced) break; bounced = true; }
    if (bounced) top = Math.max(top, b.p.y - BALL_R - TABLE.h);
  }
  return top;
}

// ── the ball in the air ──
{
  const b = makeBall({ x: 0, y: 400, z: 0 });
  fly(b, 25);
  check(b.v.y < -8.2 && b.v.y > -9.2, `terminal speed ${(-b.v.y).toFixed(2)} m/s (measured 8–9 m/s for a 40 mm ball)`);
}
{
  // topspin dips, backspin floats (same launch)
  const launch = (w) => { const b = makeBall({ x: 0, y: 0.95, z: 1.6 }, { x: 0, y: 1.5, z: -12 }, w); const r = flyFirst(b); return r; };
  const none = launch({ x: 0, y: 0, z: 0 }), top = launch(spinVector(0, -1, 80 * RPS)), back = launch(spinVector(0, -1, -50 * RPS));
  check(top.z > none.z + 0.3, `topspin lands shorter (${top.z.toFixed(2)} vs ${none.z.toFixed(2)})`);
  check(back.kind !== 'table' || back.z < none.z - 0.2, `backspin floats longer (${back.kind} ${back.z.toFixed(2)})`);
  const side = launch(spinVector(0, -1, 0, 40 * RPS));
  check(side.x > 0.08, `right sidespin curves the ball right (${side.x.toFixed(2)} m)`);
}
{
  // drag: a 25 m/s smash loses a good part of its speed over the table
  const b = makeBall({ x: 0, y: 1.2, z: 1.5 }, { x: 0, y: -2, z: -25 }, { x: 0, y: 0, z: 0 });
  fly(b, 0.12);
  const s = Math.hypot(b.v.x, b.v.y, b.v.z);
  check(s > 17 && s < 22, `25 m/s slows to ${s.toFixed(1)} m/s in 0.12 s (drag ∝ v²)`);
}

// ── the table ──
{
  const h = dropBounce(0.30);
  check(near(h, 0.23, 0.01), `30 cm drop bounces ${(h * 100).toFixed(1)} cm (ITTF: about 23 cm)`);
  const h2 = dropBounce(1.0);
  check(h2 / 1.0 < h / 0.30, `harder impacts bounce relatively lower (${(h2 * 100).toFixed(0)} cm from 1 m)`);
}
{
  // topspin kicks forward off the table, backspin checks
  const bounce = (w) => {
    const b = makeBall({ x: 0, y: TABLE.h + 0.25, z: -0.2 }, { x: 0, y: -2.5, z: -5 }, w);
    const ev = [];
    for (let i = 0; i < 1000 && !ev.some((e) => e.type === 'table'); i++) step(b, H, ev);
    return b.v.z;
  };
  const vz0 = bounce({ x: 0, y: 0, z: 0 }), vzT = bounce(spinVector(0, -1, 60 * RPS)), vzB = bounce(spinVector(0, -1, -60 * RPS));
  check(vzT < vz0 - 0.3, `topspin kicks forward off the table (${(-vzT).toFixed(2)} vs ${(-vz0).toFixed(2)} m/s)`);
  check(vzB > vzT + 0.6, `backspin leaves the table slower than topspin (${(-vzB).toFixed(2)} vs ${(-vzT).toFixed(2)} m/s)`);
}
{
  // the edge: a ball clipping the top edge from above counts; one hitting the side does not
  const ev1 = fly(makeBall({ x: 0, y: TABLE.h + 0.05, z: -TABLE.halfL + 0.01 }, { x: 0, y: -3, z: -2 }), 0.2);
  const t1 = ev1.find((e) => e.type === 'table' || e.type === 'side');
  check(t1 && t1.type === 'table' && t1.edge, `edge ball counts (${t1 && t1.type}${t1 && t1.edge ? ' edge' : ''})`);
  const ev2 = fly(makeBall({ x: 0, y: TABLE.h - 0.012, z: -TABLE.halfL + 0.3 }, { x: 0, y: 0, z: -6 }), 0.2);
  const t2 = ev2.find((e) => e.type === 'table' || e.type === 'side');
  check(t2 && t2.type === 'side', `a ball into the side of the table is not good (${t2 && t2.type})`);
}

// ── the net ──
{
  const ev = fly(makeBall({ x: 0, y: TABLE.h + 0.09, z: 0.6 }, { x: 0, y: 0, z: -8 }), 0.3);
  const n1 = ev.find((e) => e.type === 'net');
  const t = ev.find((e) => e.type === 'table');
  check(n1 && !n1.cord && t && t.side === 1, 'a ball into the mesh drops on the hitter\'s side');
  // a ball just clipping the cord: it may go over, slowed
  const b = makeBall({ x: 0.1, y: TABLE.h + NET.h + BALL_R - 0.004, z: 0.5 }, { x: 0, y: 0.2, z: -6 }, { x: 0, y: 0, z: 0 });
  const ev2 = fly(b, 0.25);
  const c = ev2.find((e) => e.type === 'net');
  check(c && c.cord, 'the cord deflects a ball that clips the top of the net');
}

// ── rubber ──
{
  const rub = RUBBERS.inverted;
  const b = makeBall({ x: 0, y: 1, z: 1.6 }, { x: 0, y: 0, z: 15 }, { x: 0, y: 0, z: 0 });
  contact(b, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, rubberCOR(rub, 15), rub.mu, rub.et, 0.03);
  check(b.v.z < -9 && b.v.z > -12.5, `a still paddle returns a 15 m/s ball at ${(-b.v.z).toFixed(1)} m/s`);
  // a brushing loop against backspin: 5000–9000 rpm
  const lp = makeBall({ x: 0, y: 0.9, z: 1.6 }, { x: 0, y: -1, z: 8 }, { x: -30 * RPS, y: 0, z: 0 });
  const t = 25 * Math.PI / 180, u = 35 * Math.PI / 180;
  const nrm = { x: 0, y: -Math.sin(t), z: -Math.cos(t) }, vp = { x: 0, y: 16 * Math.sin(u), z: -16 * Math.cos(u) };
  const un = (lp.v.y - vp.y) * nrm.y + (lp.v.z - vp.z) * nrm.z;
  contact(lp, nrm, vp, rubberCOR(rub, un), rub.mu, rub.et, 0.03);
  const sp = spinParts(lp.v, lp.w);
  check(sp.top > 5000 && sp.top < 10000, `a 16 m/s brushing stroke gives ${sp.top.toFixed(0)} rpm topspin`);
  // long pips: the incoming backspin comes back as topspin; inverted reverses more of it
  const passive = (key) => {
    const r = RUBBERS[key];
    const bb = makeBall({ x: 0, y: 0.9, z: 1.6 }, { x: 0, y: 0, z: 6 }, { x: -40 * RPS, y: 0, z: 0 });
    contact(bb, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -1 }, rubberCOR(r, 7), r.mu, r.et, 0.03);
    return spinParts(bb.v, bb.w).top;
  };
  const lpTop = passive('long'), invTop = passive('inverted');
  check(lpTop > 1200 && lpTop > invTop + 600, `long pips return backspin as topspin (${lpTop.toFixed(0)} rpm vs inverted ${invTop.toFixed(0)})`);
}

// ── the paddle's shape ──
{
  const o = {};
  headDistance(0, BLADE.yc, 0.05, o);
  check(near(o.d, 0.05 - HALF_T, 1e-9) && o.nz === 1 && !o.edge, 'the face: distance along the normal, the forehand side +Z');
  headDistance(0, BLADE.yc, -0.03, o);
  check(o.nz === -1, 'the backhand side −Z');
  headDistance(BLADE.b + 0.01, BLADE.yc, 0, o);
  check(o.edge && near(o.d, 0.01, 0.003), `the rim: an edge contact (${o.d.toFixed(4)} m)`);
  check(near(headRho(BLADE.b, BLADE.yc), 1, 0.01) && near(headRho(0, BLADE.yc + BLADE.a), 1, 0.01), 'the head outline: 150 × 157 mm');
  check(near(2 * HALF_T, 0.0138, 1e-4), 'the paddle is 13.8 mm thick (5.8 mm blade + 2 × 4 mm rubber)');
}

// ── solvers ──
{
  const P = { x: 0.2, y: 0.95, z: 1.7 };
  const r = solveShot(P, { x: -0.3, z: -1.0 }, 15, 60 * RPS);
  check(r.ok && near(r.x, -0.3, 0.06) && near(r.z, -1.0, 0.06) && r.clear > 0, `solveShot lands on target (${r.ok && r.x.toFixed(2)}, ${r.ok && r.z.toFixed(2)}), clears the net`);
  const sv = solveServe({ x: 0.3, y: 0.98, z: 1.55 }, { x: -0.2, z: -0.45 }, -40 * RPS, 0, 0.3);
  check(sv.ok && sv.b1.z > 0 && sv.b2.z < 0 && near(sv.b2.z, -0.45, 0.06), `a short backspin serve bounces on both halves (${sv.ok && sv.b1.z.toFixed(2)} → ${sv.ok && sv.b2.z.toFixed(2)})`);
  const ball = makeBall({ x: 0.2, y: 0.95, z: 1.7 }, { x: 0, y: 1.0, z: 9 }, { x: 40 * RPS, y: 0, z: 0 });
  const want = solveSafe(ball.p, { x: -0.3, z: -1.0 }, 15, 60 * RPS);
  const pad = solvePaddle(ball, want.v, want.w);
  check(pad && pad.err < 0.05, `solvePaddle finds a face and a swing (error ${pad && pad.err.toFixed(3)} m/s)`);
  const fl = flyFirst(pad.out);
  check(fl.kind === 'table' && fl.side === -1, 'that swing puts the ball on the far half');
  const ball2 = makeBall(ball.p, ball.v, { x: 75 * RPS, y: 0, z: 0 });
  const f2 = flyFirst(paddleOut(ball2, pad.n, pad.vp, RUBBERS.inverted));
  check(!(f2.kind === 'table' && f2.side === -1 && Math.abs(f2.z) < 1.2), `misreading the spin (75 rps read as 40) costs the shot (${f2.kind} ${f2.z.toFixed(2)})`);
}
{
  const sv = planServe({ side: -1, level: 3, rnd: [0.1, 0.4, 0.6, 0.3, 0.2, 0.7, 0.5, 0.5], kind: 'short-back' });
  check(sv.ok && sv.P.z < -TABLE.halfL && sv.P.y > TABLE.h && sv.tossH >= 0.16, 'the CPU serves from behind its end line, above the table, with a toss of 16 cm or more');
  const b = makeBall({ x: 0.1, y: 1.0, z: 1.5 }, { x: 0, y: 1.2, z: -9 }, spinVector(0, -1, 40 * RPS));
  const pr = predict(b, -1);
  check(pr.legal, 'prediction finds the bounce on the CPU\'s half');
  const pl = planRally({ ball: b, side: -1, level: 5, rnd: Array.from({ length: 24 }, (_, i) => (i * 0.37) % 1), mode: 'match' });
  check(pl.ok && pl.P.z < -TABLE.halfL + 0.5, `the CPU plans a return (${pl.shot}, contact z ${pl.ok && pl.P.z.toFixed(2)})`);
}

// ── rules ──
{
  const r = new Rally('p');
  r.strike('p', { x: 0, y: 1, z: 1.5 }, { x: 0, y: -1, z: 0 });
  r.net(); r.table(1); r.table(-1);
  check(r.result && r.result.let, 'a serve touching the net and landing well is a let');
  const r2 = new Rally('p');
  r2.strike('p', { x: 0, y: 1, z: 1.5 }, { x: 0, y: -1, z: 0 }); r2.table(-1);
  check(r2.result && r2.result.winner === 'c', 'a serve straight onto the receiver\'s half is a fault');
  const r3 = new Rally('c');
  r3.strike('c', { x: 0, y: 1, z: -1.5 }, { x: 0, y: -1, z: 0 }); r3.table(-1); r3.table(1);
  r3.strike('p', { x: 0, y: 1, z: 1.5 }, { x: 0, y: 1, z: -5 }); r3.table(-1); r3.table(-1);
  check(r3.result && r3.result.winner === 'p', 'a double bounce on the receiver\'s half: the hitter wins');
  const r4 = new Rally('c');
  r4.strike('c', { x: 0, y: 1, z: -1.5 }, { x: 0, y: -1, z: 0 }); r4.table(-1); r4.table(1);
  r4.strike('p', { x: 0, y: 1, z: 1.5 }, { x: 0, y: 1, z: -5 });
  r4.strike('c', { x: 0, y: 1, z: -0.8 }, { x: 0, y: 0, z: 5 });
  check(r4.result && r4.result.winner === 'p', 'volleying over the table is an obstruction');
  const r5 = new Rally('c');
  r5.strike('c', { x: 0, y: 1, z: -1.5 }, { x: 0, y: -1, z: 0 }); r5.table(-1); r5.table(1);
  r5.strike('p', { x: 0, y: 1, z: 1.5 }, { x: 0, y: 1, z: -9 });
  r5.strike('c', { x: 0, y: 1.2, z: -2.4 }, { x: 0, y: 0, z: -9 });
  check(r5.result && r5.result.winner === 'c', 'touching a ball already past the end line: it was going out');
  const r6 = new Rally('c');
  r6.strike('c', { x: 0, y: 1, z: -1.5 }, { x: 0, y: -1, z: 0 }); r6.table(-1); r6.table(1);
  r6.strike('p', { x: 0, y: 1, z: 1.5 }, { x: 0, y: 1, z: -5 }); r6.dead('floor');
  check(r6.result && r6.result.winner === 'c', 'a return that misses the table loses the point');
  check(serveFault({ height: 0.1, lateral: 0 }, { x: 0, y: 0.9, z: 1.5 }, { x: 0, y: -1, z: 0 }, 'p'), 'a 10 cm toss is a fault');
  check(serveFault({ height: 0.3, lateral: 0 }, { x: 0, y: 0.9, z: 1.5 }, { x: 0, y: 1, z: 0 }, 'p'), 'striking the toss on the way up is a fault');
  check(serveFault({ height: 0.3, lateral: 0 }, { x: 0, y: 0.9, z: 1.2 }, { x: 0, y: -1, z: 0 }, 'p'), 'striking in front of the end line is a fault');
  check(!serveFault({ height: 0.3, lateral: 0.02 }, { x: 0, y: 0.9, z: 1.5 }, { x: 0, y: -1.5, z: 0 }, 'p'), 'a good service action passes');
}
{
  const s = new Score(5, 'p');
  const seq = [];
  for (let i = 0; i < 6; i++) { seq.push(s.server); s.point(i % 2 ? 'p' : 'c'); }
  check(seq.join('') === 'ppccpp', `service changes every 2 points (${seq.join('')})`);
  const d = new Score(5, 'p');
  for (let i = 0; i < 10; i++) { d.point('p'); d.point('c'); }
  const ds = [];
  for (let i = 0; i < 4; i++) { ds.push(d.server); d.point(i % 2 ? 'c' : 'p'); }
  check(ds.join('') === 'pcpc' && d.points.p === 12 && d.points.c === 12, `from 10-all the service changes every point (${ds.join('')})`);
  d.point('p'); const g = d.point('p');
  check(g.game === 'p' && d.games.p === 1 && d.points.p === 0, 'a game is won by 2 points after 10-all (14-12)');
  check(d.server === 'c', 'the other player serves first in the next game');
  const m = new Score(3, 'c');
  for (let k = 0; k < 2; k++) for (let i = 0; i < 11; i++) m.point('c');
  check(m.over && m.winner === 'c', 'best of 3: two games win the match');
  const c = new Score(5, 'p'); c.point('p'); c.point('p'); c.point('c');
  check(c.call() === '1–2', `the umpire calls the server's score first (${c.call()})`);
}

// ── settings ──
{
  check(sanitize('level', 9) === 5 && sanitize('level', 'x') === 3, 'settings: ranges are clamped, junk falls back to the default');
  check(sanitize('mode', 'nope') === 'match' && sanitize('tossAssist', 'false') === false, 'settings: choices and toggles');
  const d = defaults();
  check(SETTINGS.every((s) => sanitize(s.key, d[s.key]) === d[s.key]), 'settings: every default is valid');
}

console.log(`\n${n - fail.length}/${n} ok`);
if (fail.length) process.exit(1);
