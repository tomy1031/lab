// js/predict.js — look-ahead of the ball's path (the same fixed-step physics as the live ball, so a plan made
// now is exact until somebody hits the ball) and the choice of where to stand to hit it.
import { step, H, copyBall, makeBall, COURT } from './physics.js';

const _sim = makeBall();

/**
 * Simulate ball b (not modified) up to tMax seconds or until it stops / bounces `maxBounces` times.
 * Returns { n, x, y, z, vx, vy, vz (Float64Array, index i = i·H seconds from now), ev: [{...event, i}] }.
 */
export function predict(b, surf, tMax = 4, maxBounces = 3) {
  const sim = copyBall(b, _sim);
  const N = Math.ceil(tMax / H);
  const P = {
    n: 0, x: new Float64Array(N + 1), y: new Float64Array(N + 1), z: new Float64Array(N + 1),
    vx: new Float64Array(N + 1), vy: new Float64Array(N + 1), vz: new Float64Array(N + 1), ev: [],
  };
  const rec = (i) => {
    P.x[i] = sim.p.x; P.y[i] = sim.p.y; P.z[i] = sim.p.z;
    P.vx[i] = sim.v.x; P.vy[i] = sim.v.y; P.vz[i] = sim.v.z;
  };
  rec(0);
  let bounces = 0;
  const ev = [];
  for (let i = 1; i <= N; i++) {
    ev.length = 0;
    step(sim, H, surf, ev);
    rec(i);
    P.n = i;
    for (const e of ev) { P.ev.push({ ...e, i }); if (e.type === 'bounce') bounces++; }
    if (sim.stopped || bounces >= maxBounces) break;
  }
  return P;
}

/** first event of a type (optionally on one half: side +1 player / −1 CPU) after index i0 */
export function findEvent(P, type, side = 0, i0 = 0) {
  for (const e of P.ev) {
    if (e.i < i0 || e.type !== type) continue;
    if (side && Math.sign(e.z) !== side) continue;
    return e;
  }
  return null;
}

/**
 * Time to cover `dist` from rest with acceleration a, braking d and top speed vmax, arriving at speed vEnd
 * (0 = stopped; a player can still hit while moving at ~1.5 m/s, "on the run").
 */
export function travelTime(dist, vmax, a, d, vEnd = 0) {
  if (dist <= 0) return 0;
  const ve = Math.min(vEnd, vmax);
  if (ve > 0 && dist <= ve * ve / (2 * a)) return Math.sqrt(2 * dist / a);   // still accelerating at arrival
  const vp2 = (2 * dist + ve * ve / d) / (1 / a + 1 / d);
  const vPeak = Math.sqrt(vp2);
  if (vPeak <= vmax) return vPeak / a + (vPeak - ve) / d;
  const accD = vmax * vmax / (2 * a), decD = (vmax * vmax - ve * ve) / (2 * d);
  return vmax / a + (vmax - ve) / d + (dist - accD - decD) / vmax;
}

/** distance that can be covered within time t (arriving at speed vEnd) */
export function reachIn(t, vmax, a, d, vEnd = 0) {
  if (t <= 0) return 0;
  let lo = 0, hi = vmax * t;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (travelTime(m, vmax, a, d, vEnd) <= t) lo = m; else hi = m; }
  return lo;
}

export const ON_THE_RUN = 1.5;   // m/s: arriving this fast still allows a full stroke

/**
 * Where to stand to hit the ball on `side` (+1 player half, −1 CPU half).
 * o: { from:{x,z}, vmax, accel, decel, react (s before moving), contactH (preferred contact height),
 *      reach (sideways distance body→contact), front (contact in front of the body), handSign (+1 right-handed),
 *      volley (allow hitting before the bounce), bounced (it already bounced on our half), prefer ('fh'|'bh'),
 *      minY, maxY }
 * Returns null if the ball never comes to that half, else
 * { i, t, c:{x,y,z}, stance:{x,z}, wing:'fh'|'bh', volley, reachable, short (m still to go when the ball
 *   arrives; up to ~0.35 m can be made up by stretching), bounce }
 */
export function planIntercept(P, side, o) {
  const minY = o.minY ?? 0.25, maxY = o.maxY ?? 2.4;
  // where the ball is on our half and still in play
  let i0 = -1;
  for (let i = 0; i <= P.n; i++) if (P.z[i] * side > 0.3) { i0 = i; break; }
  if (i0 < 0) return null;
  // the first bounce on our half (o.bounced: it has bounced already — the next bounce is the second)
  let b1 = o.bounced ? { i: 0, x: P.x[0], z: P.z[0], type: 'bounce' } : findEvent(P, 'bounce', side, i0);
  let b2 = null;
  if (b1) for (const e of P.ev) if (e.type === 'bounce' && e.i > b1.i) { b2 = e; break; }
  const iEnd = b2 ? b2.i - 1 : P.n;
  const right = side > 0 ? 1 : -1;               // world x of the hitter's right hand side
  const fh = right * (o.handSign ?? 1);          // world x direction of the forehand side
  const front = o.front ?? 0.4;
  const reach = o.reach ?? 0.85;
  const cH = o.contactH ?? 0.95;
  const from = o.from;
  const vmax = o.vmax, a = o.accel, d = o.decel ?? o.accel * 1.4;
  const react = o.react ?? 0;
  // the ball's peak after the bounce: the comfortable ball is taken on the way down at the preferred height
  let iPeak = -1;
  if (b1) { let ymax = -1; for (let i = b1.i; i <= iEnd; i++) if (P.y[i] > ymax) { ymax = P.y[i]; iPeak = i; } }
  let best = null;
  const consider = (i, volley) => {
    const x = P.x[i], y = P.y[i], z = P.z[i];
    if (y < minY || y > maxY) return;
    if (Math.abs(x) > COURT.fenceX - 0.6 || Math.abs(z) > COURT.fenceZ - 0.6) return;
    if (z * side < 0.5) return;
    // forehand or backhand: the closer stance, with a small preference for the forehand
    const sxF = x - fh * reach, sxB = x + fh * reach;
    const sz = z + side * front;
    const dF = Math.hypot(sxF - from.x, sz - from.z), dB = Math.hypot(sxB - from.x, sz - from.z);
    // keep the wing chosen before (prefer) unless the other is clearly closer
    const bias = o.prefer === 'bh' ? -0.5 : o.prefer === 'fh' ? 0.85 : 0.35;
    const wing = dF <= dB + bias ? 'fh' : 'bh';
    const sx = wing === 'fh' ? sxF : sxB;
    const dist = wing === 'fh' ? dF : dB;
    const tAvail = i * H - react;
    const tNeed = travelTime(dist, vmax, a, d, ON_THE_RUN);
    const late = Math.max(0, tNeed - tAvail);
    let cost;
    if (volley) cost = 0.25 + Math.abs(y - 1.15) * 0.6;
    else {
      // preferred: at the contact height after the peak; a high ball can be met on the rise or let to drop
      cost = Math.abs(y - cH) * 1.6;
      if (i < iPeak) cost += 0.25 + Math.abs(y - cH) * 0.6;   // on the rise is harder
      if (y > 1.6) cost += (y - 1.6) * 2;
    }
    cost += late * 12;                                         // can't get there in time
    cost += Math.max(0, z * side - COURT.halfLen - 1.2) * 0.25; // far behind the baseline
    if (!best || cost < best.cost) {
      best = { i, t: i * H, cost, c: { x, y, z }, stance: { x: sx, z: sz }, wing, volley, reachable: late <= 0.001,
        short: late > 0 ? dist - reachIn(tAvail, vmax, a, d, ON_THE_RUN) : 0, dist, bounce: b1 ? { x: b1.x, z: b1.z, i: b1.i } : null };
    }
  };
  const stride = 3;
  if (o.volley) for (let i = i0; i < (b1 ? b1.i : iEnd); i += stride) consider(i, true);
  if (b1) for (let i = b1.i + 2; i <= iEnd; i += stride) consider(i, false);
  // no bounce on our half in the look-ahead (very deep ball): take it in the air
  if (!best && !b1) for (let i = i0; i <= iEnd; i += stride) consider(i, true);
  return best;
}
