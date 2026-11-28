// js/planner.js — what a player (the CPU, the ball machine, your PC strokes) decides to do with a ball, as pure
// functions of a "job" (the ball now, the player's level, pre-drawn random numbers). Runs in a Web Worker in the
// browser (planworker.js) so the solvers never hold up a VR frame, and synchronously in the node tests.
//
// A rally plan: predict the ball → pick where to meet it after it bounces on our side → read its spin (with the
// level's misreading) → choose the stroke and where to send it → solve the outgoing ball → solve the paddle
// (face normal and swing velocity) for the ball as *perceived* → add the level's execution error.
import { step, H, makeBall, copyBall, TABLE, RPS, spinParts, spinVector, BALL_R } from './physics.js';
import { solveSafe, solveShot, solveServe, solvePaddle, flyFirst } from './shot.js';

// level 1 … 5: how players differ
export const LEVELS = [
  null,
  { name: '初心者', vmax: 2.2, acc: 5, react: 0.34, spinRead: 0.22, aim: 0.18, face: 2.0, swing: 0.045, pace: 0.62, attack: 0.15 },
  { name: '初級', vmax: 2.6, acc: 6, react: 0.29, spinRead: 0.13, aim: 0.14, face: 1.4, swing: 0.032, pace: 0.76, attack: 0.3 },
  { name: '中級', vmax: 3.0, acc: 7, react: 0.25, spinRead: 0.075, aim: 0.10, face: 0.95, swing: 0.024, pace: 0.9, attack: 0.5 },
  { name: '上級', vmax: 3.4, acc: 8, react: 0.21, spinRead: 0.05, aim: 0.075, face: 0.85, swing: 0.018, pace: 1.06, attack: 0.75 },
  { name: 'トップ', vmax: 3.8, acc: 9.5, react: 0.17, spinRead: 0.04, aim: 0.055, face: 0.75, swing: 0.014, pace: 1.22, attack: 0.95 },
];

// a normal deviate from two uniforms
const gauss = (u1, u2) => Math.sqrt(-2 * Math.log(Math.max(1e-9, u1))) * Math.cos(2 * Math.PI * u2);
class Rnd { constructor(a) { this.a = a || []; this.i = 0; } u() { const v = this.a[this.i % Math.max(1, this.a.length)]; this.i++; return v === undefined ? 0.5 : v; } n() { return gauss(this.u(), this.u()); } }

/**
 * Predict the ball: states every step until it is dead or tMax. Returns { states: [{t,p,v,w}], bounceIdx (index
 * just after it first bounces on half `side`), legal (it reached our half after crossing the net) }.
 */
export function predict(ball, side, tMax = 2.2, bounced = false) {
  const b = copyBall(ball, makeBall());
  const states = [];
  const ev = [];
  let bounceIdx = bounced ? 0 : -1, dead = false, bounces = 0;
  const N = Math.ceil(tMax / H);
  for (let i = 1; i <= N && !dead; i++) {
    ev.length = 0;
    step(b, H, ev);
    states.push({ t: i * H, p: { ...b.p }, v: { ...b.v }, w: { ...b.w } });
    for (const e of ev) {
      if (e.type === 'table') {
        bounces++;
        if (e.side === side && bounceIdx < 0) bounceIdx = states.length - 1;
        else if (bounceIdx >= 0) { dead = true; }       // a second bounce (on our side): too late after this
      }
      if (e.type === 'floor' || e.type === 'barrier' || e.type === 'stop' || e.type === 'side') dead = true;
    }
  }
  return { states, bounceIdx, legal: bounceIdx >= 0 };
}

/** time for a person to cover d metres from standing (accelerate, cruise at vmax) */
export function runTime(d, vmax, acc) {
  const dAcc = vmax * vmax / acc;
  return d < dAcc ? 2 * Math.sqrt(d / acc) * 0.75 : (d / vmax + vmax / acc) * 0.85;
}
/** how long a player at `body` needs to get to a spot to meet a ball at contact point c */
function moveNeed(c, side, body, L) {
  if (!body || !L) return 0;
  let best = Infinity;
  for (const off of [HAND_OFFSET.fh, HAND_OFFSET.bh]) {
    const bx = c.x - side * off, bz = side * Math.max(TABLE.halfL + 0.12, Math.abs(c.z) + 0.40);
    const d = Math.max(0, Math.hypot(bx - body.x, bz - body.z) - 0.25);   // a lunge covers the last 25 cm
    best = Math.min(best, runTime(d, L.vmax, L.acc));
  }
  return best;
}

/** choose where to meet the ball after its bounce on our half (side). style: 'early' | 'top' | 'late' */
export function chooseContact(pred, side, style, reachZ = 0.48, body = null, L = null, delay = 0) {
  const S = pred.states, i0 = pred.bounceIdx;
  if (i0 < 0) return null;
  const zMin = TABLE.halfL - reachZ, zMax = TABLE.halfL + 2.6;
  const ok = (s) => s.p.y >= 0.80 && s.p.y <= 1.75 && Math.abs(s.p.x) <= 1.7 && s.p.z * side >= zMin && s.p.z * side <= zMax;
  let apex = i0, last = i0;
  for (let i = i0; i < S.length; i++) { if (S[i].p.y > S[apex].p.y) apex = i; last = i; }
  const yA = S[apex].p.y;
  let want = apex;
  if (style === 'early') {
    const target = TABLE.h + Math.max(0.06, (yA - TABLE.h) * 0.75);
    for (let i = i0; i <= apex; i++) if (S[i].p.y >= target) { want = i; break; }
  } else if (style === 'late') {
    const target = Math.max(TABLE.h + 0.12, yA - 0.16);
    for (let i = apex; i <= last; i++) { want = i; if (S[i].p.y <= target) break; }
  }
  // nearest reachable index that we can also run to in time; failing that, the one we come closest to
  let fallback = null, short = Infinity;
  for (let d = 0; d < S.length; d++) {
    for (const i of [want + d, want - d]) {
      if (i < i0 + 8 || i > last || !ok(S[i])) continue;
      const lack = moveNeed(S[i].p, side, body, L) - (S[i].t - delay);
      if (lack <= 0) return { i, s: S[i], apex: S[apex] };
      if (lack < short) { short = lack; fallback = { i, s: S[i], apex: S[apex], late: lack }; }
    }
  }
  return fallback;
}

const right = (side) => side;          // the x of a player's right hand side: +1 at z > 0 (facing −z), −1 at z < 0

/** the paddle-side wing for a contact at x, given where the body can be */
export function wingFor(cx, bodyX, side, rnd = 0.5) {
  const rel = (cx - bodyX) * right(side);    // > 0: to the player's right
  if (rel > 0.18) return 'fh';
  if (rel < -0.12) return 'bh';
  return rnd < 0.55 ? 'bh' : 'fh';
}
export const HAND_OFFSET = { fh: 0.46, bh: -0.04 };   // contact point from the body centre, to the right

/**
 * The rally plan. job = { ball (state now), side, level (1–5), rnd: [uniforms], mode: 'match' | 'rally' | 'easy',
 *   bodyX, forced: { shot, target } (PC strokes), rubber, opp: {x} (the opponent's position) }
 */
export function planRally(job) {
  const L = LEVELS[job.level] || LEVELS[3];
  const R = new Rnd(job.rnd);
  const side = job.side;
  const pred = predict(job.ball, side, 2.2, !!job.bounced);
  if (!pred.legal) return { ok: false, why: 'out' };
  // the style of contact is decided by the incoming ball's height and speed at its apex
  const delay = job.delay ?? 0.03;
  const firstPick = chooseContact(pred, side, 'top', 0.48, job.body, L, delay);
  if (!firstPick) return { ok: false, why: 'unreachable' };
  const apexY = firstPick.apex.p.y;
  const vIn = Math.hypot(firstPick.s.v.x, firstPick.s.v.y, firstPick.s.v.z);
  const spinTrue = spinParts(firstPick.s.v, firstPick.s.w).top;
  // perceived spin: the level misjudges the amount (and a little the kind)
  const readScale = Math.max(0.2, 1 + L.spinRead * R.n());
  const readAdd = L.spinRead * 600 * R.n();
  const perceive = (top) => top * readScale + readAdd;
  const topSeen = perceive(spinTrue);
  const forced = job.forced || null;
  let shot;
  const zc = Math.abs(firstPick.s.p.z);
  const u = R.u();
  if (forced && forced.shot) shot = forced.shot;
  else if (job.mode === 'rally' || job.mode === 'easy') shot = topSeen < -900 && zc < TABLE.halfL ? 'push' : 'drive';
  else if (apexY > TABLE.h + 0.40 && zc < TABLE.halfL + 0.9 && u < 0.4 + L.attack * 0.6) shot = 'smash';
  else if (topSeen < -700) {
    const short = pred.states[firstPick.i] && zc < TABLE.halfL - 0.05 && apexY < TABLE.h + 0.26;
    if (short) shot = u < L.attack * 0.45 ? 'flick' : 'push';
    else shot = u < 0.25 + L.attack * 0.75 ? 'loop' : 'push';
  } else if (vIn > 12.5 && u > L.attack) shot = 'block';
  else shot = 'drive';
  const style = { smash: 'top', push: 'early', flick: 'top', loop: 'late', block: 'early', drive: 'top' }[shot];
  const pick = chooseContact(pred, side, style, 0.48, job.body, L, delay) || firstPick;
  const s = pick.s;
  const ballAt = makeBall(s.p, s.v, s.w);
  // the ball as perceived (true position and velocity; spin misjudged)
  const sp = spinParts(s.v, s.w);
  const seenBall = makeBall(s.p, s.v, s.w);
  const k = sp.top !== 0 ? perceive(sp.top) / sp.top : 1;
  seenBall.w.x *= k; seenBall.w.z *= k;
  seenBall.w.y *= Math.max(0.3, 1 + L.spinRead * R.n());
  // what to send back
  const opp = -side;
  const pace = L.pace * (job.mode === 'easy' ? 0.75 : 1);
  const S = {
    drive: { v: 9 + 9 * pace, top: 38 + 28 * pace, depth: 0.82 + 0.25 * L.attack },
    loop: { v: 9 + 5 * pace, top: 60 + 35 * pace, depth: 0.85 + 0.2 * L.attack },
    block: { v: Math.min(13, vIn * 0.75), top: 18, depth: 1.0 },
    push: { v: 5.2 + 1.2 * pace, top: -(30 + 15 * pace), depth: R.u() < 0.6 ? 1.05 : 0.45 },
    flick: { v: 9.5 + 1.5 * pace, top: 30, depth: 1.0 },
    smash: { v: 17 + 10 * pace, top: 20, depth: 1.0 },
  }[shot];
  let tx, tz;
  if (forced && forced.target) { tx = forced.target.x; tz = forced.target.z; }
  else {
    // where: corners and the opponent's crossover point; easier players aim nearer the middle
    const corner = (R.u() < 0.5 ? -1 : 1);
    const wide = job.mode === 'rally' || job.mode === 'easy' ? 0.35 : 0.25 + 0.35 * L.attack;
    tx = corner * wide * TABLE.halfW + (job.opp ? 0.15 * job.opp.x : 0);
    if (job.mode === 'rally' && job.rallyTarget) tx = job.rallyTarget;
    tz = opp * S.depth;
    const aimErr = forced ? 0.03 : L.aim;
    tx += aimErr * R.n(); tz += opp * aimErr * 0.8 * R.n();
    tx = Math.max(-TABLE.halfW + 0.04, Math.min(TABLE.halfW - 0.04, tx));
    tz = opp * Math.max(0.25, Math.min(TABLE.halfL - 0.04, Math.abs(tz)));
  }
  const speed = S.v * (1 + 0.06 * R.n());
  let sol = solveSafe(s.p, { x: tx, z: tz }, speed, S.top * RPS, 0, shot === 'push' ? 0.04 : 0.05);
  if (!sol.ok) sol = solveShot(s.p, { x: tx * 0.5, z: opp * 0.9 }, 7, 10 * RPS, 0, 'high', opp);
  if (!sol.ok) return { ok: false, why: 'nosolution', shot };
  const pad = solvePaddle(seenBall, sol.v, sol.w, job.rubber || 'inverted');
  if (!pad) return { ok: false, why: 'nopaddle', shot };
  // execution error: grows with the incoming pace and spin
  const hard = 1 + Math.max(0, vIn - 8) / 10 + Math.abs(spinTrue) / 5000;
  const fa = (forced ? 0.3 : L.face) * hard * Math.PI / 180;
  const n = tilt(pad.n, fa * R.n(), fa * R.n());
  const sw = 1 + (forced ? 0.01 : L.swing) * hard * R.n();
  const vp = { x: pad.vp.x * sw, y: pad.vp.y * sw, z: pad.vp.z * sw };
  return {
    ok: true, shot, tc: s.t, P: { ...s.p }, ballAt, n, vp, wing: null,
    target: { x: tx, z: tz }, vOut: sol.v, wOut: sol.w, seenTop: topSeen, trueTop: spinTrue, padErr: pad.err,
  };
}

// tilt a unit normal by two small angles about two axes perpendicular to it
function tilt(n, a, b) {
  let ux = -n.z, uz = n.x; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;   // horizontal, ⊥ n
  const vx = n.y * uz, vy = n.z * ux - n.x * uz, vz = -n.y * ux;                      // n × u
  const x = n.x + a * ux + b * vx, y = n.y + b * vy, z = n.z + a * uz + b * vz;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}

/**
 * A serve. job = { side, level, rnd, kind?: 'short-back' | 'long-top' | 'side' | 'no-spin' | 'long-back', x (where
 * the server stands), tossH }. The toss leaves the hand at P0 straight up; the strike is on the way down.
 */
export function planServe(job) {
  const L = LEVELS[job.level] || LEVELS[3];
  const R = new Rnd(job.rnd);
  const side = job.side, opp = -side;
  const kinds = ['short-back', 'short-back', 'long-top', 'side', 'long-back', 'no-spin'];
  const kind = job.kind || kinds[Math.floor(R.u() * kinds.length) % kinds.length];
  const x0 = job.x !== undefined ? job.x : side * 0.25;
  const P0 = { x: x0, y: TABLE.h + 0.10, z: side * (TABLE.halfL + 0.22) };
  const tossH = job.tossH || 0.30 + 0.12 * R.u();
  const vy0 = Math.sqrt(2 * 9.81 * tossH) * 1.03;
  // the toss in flight, struck when it falls back through the strike height
  const b = makeBall(P0, { x: 0, y: vy0, z: 0 }, { x: 0, y: 0, z: 0 });
  const yStrike = TABLE.h + 0.16 + 0.08 * R.u();
  let t = 0;
  for (let i = 0; i < 2000; i++) { step(b, H); t += H; if (b.v.y < 0 && b.p.y <= yStrike) break; }
  const P = { ...b.p };
  const spec = {
    'short-back': { top: -(35 + 15 * L.pace), side: 6 * R.n(), T: { x: (R.u() - 0.5) * 0.9, z: opp * (0.38 + 0.1 * R.u()) }, D1: 0.33 },
    'long-back': { top: -(30 + 10 * L.pace), side: 0, T: { x: (R.u() < 0.5 ? -1 : 1) * 0.55, z: opp * 1.2 }, D1: 0.4 },
    'long-top': { top: 25 + 15 * L.pace, side: 0, T: { x: (R.u() < 0.5 ? -1 : 1) * 0.55, z: opp * 1.2 }, D1: 0.42 },
    'side': { top: 8, side: (R.u() < 0.5 ? -1 : 1) * (25 + 10 * L.pace), T: { x: (R.u() - 0.5) * 0.8, z: opp * 0.95 }, D1: 0.38 },
    'no-spin': { top: 3, side: 0, T: { x: (R.u() - 0.5) * 0.9, z: opp * (0.45 + 0.6 * R.u()) }, D1: 0.33 },
  }[kind];
  let sv = solveServe(P, spec.T, spec.top * RPS, spec.side * RPS, spec.D1);
  if (!sv || !sv.ok) sv = solveServe(P, { x: 0, z: opp * 0.9 }, 10 * RPS, 0, 0.35);
  if (!sv || !sv.ok) return { ok: false, why: 'serve' };
  const ballAt = makeBall(P, b.v, b.w);
  const pad = solvePaddle(ballAt, sv.v, sv.w, job.rubber || 'inverted');
  if (!pad) return { ok: false, why: 'serve-paddle' };
  const fa = L.face * 0.5 * Math.PI / 180;
  return {
    ok: true, kind, P0, vy0, tc: t, P, n: tilt(pad.n, fa * R.n(), fa * R.n()), vp: pad.vp, vOut: sv.v, wOut: sv.w,
    b1: sv.b1, b2: sv.b2, tossH,
  };
}

/** the ball machine: launch from P to land on target with speed and spin (rad/s). */
export function planMachine(job) {
  const sol = solveSafe(job.P, job.target, job.speed, job.top, job.sideSpin || 0, 0.04);
  if (!sol.ok) {
    const s2 = solveShot(job.P, job.target, Math.max(5, job.speed * 0.6), job.top * 0.5, 0, 'high');
    if (!s2.ok) return { ok: false };
    return { ok: true, v: s2.v, w: s2.w };
  }
  return { ok: true, v: sol.v, w: sol.w };
}

export function runJob(job) {
  try {
    if (job.type === 'rally') return planRally(job);
    if (job.type === 'serve') return planServe(job);
    if (job.type === 'machine') return planMachine(job);
  } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
  return { ok: false, why: 'unknown job' };
}

export { flyFirst, spinVector, BALL_R };
