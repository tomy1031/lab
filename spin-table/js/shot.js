// js/shot.js — inverse ballistics and the inverse of the paddle contact, on the same physics as the live ball.
//   solveShot   the launch velocity that lands a ball with a given speed and spin on a target point
//   solveServe  the launch that bounces first on the server's half, then on a target on the receiver's half
//   solvePaddle the paddle face and swing velocity that turn an incoming ball into a wanted outgoing ball
// The CPU, the ball machine and the PC strokes use them. The CPU solves the paddle with the spin it *thinks*
// the ball has; the real contact then uses the true spin — misreading spin sends the ball into the net or long,
// as it does for people.
import { step, H, makeBall, copyBall, BALL_R, BALL_M, TABLE, NET, contact, spinVector, RUBBERS, rubberCOR } from './physics.js';

const _b = makeBall();
const _ev = [];

/**
 * Fly a ball from its state until it first touches something. Returns { kind: 'table' | 'net' | 'out', x, z,
 * side, t, clear (lowest height of the ball's bottom over the net's top while crossing; 9 if it did not cross),
 * edge }.
 */
export function flyFirst(b0, tMax = 2.5, h = H, skipSide = 0) {
  const b = copyBall(b0, _b);
  let clear = 9, prevZ = b.p.z, prevY = b.p.y;
  const N = Math.ceil(tMax / h);
  for (let i = 1; i <= N; i++) {
    _ev.length = 0;
    step(b, h, _ev);
    if (Math.sign(b.p.z) !== Math.sign(prevZ) && prevZ !== 0) {
      const f = prevZ / (prevZ - b.p.z);
      const yc = prevY + (b.p.y - prevY) * f;
      clear = Math.min(clear, yc - BALL_R - (TABLE.h + NET.h));
    }
    prevZ = b.p.z; prevY = b.p.y;
    for (const e of _ev) {
      if (e.type === 'table') {
        if (skipSide && e.side === skipSide) { skipSide = 0; continue; }
        return { kind: 'table', x: e.x, z: e.z, side: e.side, t: i * h, clear, edge: e.edge, ball: b };
      }
      if (e.type === 'net') return { kind: 'net', x: e.x, z: e.z, side: 0, t: i * h, clear: -1, ball: b };
      if (e.type === 'floor' || e.type === 'side' || e.type === 'barrier') return { kind: 'out', x: b.p.x, z: b.p.z, side: 0, t: i * h, clear, ball: b };
    }
  }
  return { kind: 'out', x: b.p.x, z: b.p.z, side: 0, t: tMax, clear, ball: b };
}

const _l = makeBall();
function launch(P, s, th, ux, uz, w) {
  _l.p.x = P.x; _l.p.y = P.y; _l.p.z = P.z;
  const c = Math.cos(th);
  _l.v.x = s * c * ux; _l.v.y = s * Math.sin(th); _l.v.z = s * c * uz;
  _l.w.x = w.x; _l.w.y = w.y; _l.w.z = w.z;
  _l.rolling = -1; _l.stopped = false;
  return _l;
}

// signed miss along the azimuth for elevation th: < 0 short (or net), > 0 long
function rangeErr(P, D, s, th, ux, uz, w, h, wantSide) {
  const r = flyFirst(launch(P, s, th, ux, uz, w), 2.5, h);
  if (r.kind === 'net') return { e: -50 + th, r };
  if (r.kind === 'table' && r.side !== wantSide) return { e: -20 + th, r };   // short: on the hitter's own half
  const along = (r.x - P.x) * ux + (r.z - P.z) * uz;
  return { e: along - D, r };
}

/**
 * Launch from P (contact point) landing at T {x,z} on the half `wantSide` with speed s, topspin `top` and
 * sidespin `side` (rad/s). kind: 'low' (the flatter solution) or 'high' (the lob).
 * Returns { ok, v, w, th, clear, t, x, z } or { ok: false }.
 */
export function solveShot(P, T, s, top, side = 0, kind = 'low', wantSide = Math.sign(T.z) || -1) {
  let aimX = T.x, aimZ = T.z, res = null, ux = 0, uz = -1, w = null;
  for (let pass = 0; pass < (side ? 3 : 2); pass++) {
    const dx = aimX - P.x, dz = aimZ - P.z, D = Math.hypot(dx, dz);
    ux = dx / D; uz = dz / D;
    w = spinVector(ux, uz, top, side);
    res = solveElevation(P, D, s, ux, uz, w, kind, wantSide);
    if (!res) return { ok: false };
    const ex = T.x - res.x, ez = T.z - res.z;
    if (Math.hypot(ex, ez) < 0.02) break;
    aimX += ex; aimZ += ez;
  }
  const c = Math.cos(res.th);
  return { ok: true, th: res.th, clear: res.clear, t: res.t, x: res.x, z: res.z, v: { x: s * c * ux, y: s * Math.sin(res.th), z: s * c * uz }, w };
}

function solveElevation(P, D, s, ux, uz, w, kind, wantSide) {
  const d2r = Math.PI / 180;
  const lo = -35 * d2r, hi = (kind === 'high' ? 75 : 50) * d2r, stp = 2.5 * d2r;
  let prev = null, br = null;
  for (let th = lo; th <= hi + 1e-9; th += stp) {
    const v = rangeErr(P, D, s, th, ux, uz, w, H * 2, wantSide).e;
    if (prev && prev.v < 0 && v >= 0) { br = [prev.th, th]; if (kind !== 'high') break; }
    if (prev && kind === 'high' && prev.v >= 0 && v < 0 && br) { /* keep the last rising bracket */ }
    prev = { th, v };
  }
  if (!br) return null;
  let [a, b] = br;
  a -= stp * 0.3; b += stp * 0.3;
  let fa = rangeErr(P, D, s, a, ux, uz, w, H, wantSide).e;
  if (fa >= 0) { a -= stp; fa = rangeErr(P, D, s, a, ux, uz, w, H, wantSide).e; if (fa >= 0) return null; }
  for (let k = 0; k < 14; k++) {
    const m = (a + b) / 2;
    if (rangeErr(P, D, s, m, ux, uz, w, H, wantSide).e < 0) a = m; else b = m;
  }
  const th = b;
  const { e, r } = rangeErr(P, D, s, th, ux, uz, w, H, wantSide);
  if (r.kind !== 'table' || r.side !== wantSide || Math.abs(e) > 0.06) return null;
  return { th, clear: r.clear, t: r.t, x: r.x, z: r.z };
}

/**
 * Like solveShot, but slows the ball down (and finally lifts it) until it clears the net by `minClear`.
 */
export function solveSafe(P, T, s, top, side = 0, minClear = 0.03) {
  for (const k of [0, 1, 2, 3, 5, 7]) {
    const sk = s * (1 - 0.07 * k);
    const r = solveShot(P, T, sk, top, side, 'low');
    if (r.ok && r.clear >= minClear) return { ...r, speed: sk };
  }
  const sk = Math.max(6, s * 0.55);
  const r = solveShot(P, T, sk, top * 0.6, side, 'high');
  if (r.ok && r.clear >= 0) return { ...r, speed: sk };
  return { ok: false };
}

/**
 * A serve from P: the first bounce at distance D1 along the line to the target (on the server's own half), the
 * second bounce on the receiver's half at T. Finds speed and elevation. Returns { ok, v, w, clear, b1, b2 }.
 */
export function solveServe(P, T, top, side, D1) {
  const serverSide = Math.sign(P.z);
  let aimX = T.x, best = null;
  for (let pass = 0; pass < (side ? 3 : 2); pass++) {
    const dx = aimX - P.x, dz = T.z - P.z, D = Math.hypot(dx, dz);
    const ux = dx / D, uz = dz / D;
    const w = spinVector(ux, uz, top, side);
    const along = (r) => (r.x - P.x) * ux + (r.z - P.z) * uz;
    // elevation that puts the first bounce at D1 on the server's half (null if this speed cannot)
    const firstErr = (s, th, h) => {
      const r = flyFirst(launch(P, s, th, ux, uz, w), 1.5, h);
      if (r.kind === 'table' && r.side === serverSide) return along(r) - D1;
      if (r.kind === 'out' && along(r) < D1) return -1;
      return 1;
    };
    const second = (s) => {
      let a = -75 * Math.PI / 180, b = 25 * Math.PI / 180;
      if (firstErr(s, a, H * 2) > 0 || firstErr(s, b, H * 2) < 0) return null;
      for (let k = 0; k < 16; k++) { const m = (a + b) / 2; if (firstErr(s, m, H) < 0) a = m; else b = m; }
      const th = b;
      const r1 = flyFirst(launch(P, s, th, ux, uz, w), 1.5, H);
      if (r1.kind !== 'table' || r1.side !== serverSide) return null;
      const b1 = { x: r1.x, z: r1.z };
      const r2 = flyFirst(r1.ball, 2, H);
      const a2 = r2.kind === 'table' && r2.side === -serverSide ? along(r2) : (r2.kind === 'net' || (r2.kind === 'table' && r2.side === serverSide) ? -9 : 99);
      return { th, b1, r2, along: a2 };
    };
    // scan speeds for the first that is long enough, then bisect
    let lo = null, hi = null, rl = null;
    for (let s = 1.5; s <= 16; s += 0.75) {
      const r = second(s);
      if (!r) continue;
      if (r.along <= D) { lo = s; rl = r; } else if (lo !== null) { hi = s; break; }
    }
    if (lo === null || hi === null) return best || { ok: false };
    for (let k = 0; k < 12; k++) {
      const m = (lo + hi) / 2;
      const r = second(m);
      if (!r || r.along > D) hi = m; else { lo = m; rl = r; }
    }
    const s = lo, r = rl;
    if (!r || r.r2.kind !== 'table' || r.r2.side !== -serverSide) return best || { ok: false };
    const c = Math.cos(r.th);
    best = { ok: true, v: { x: s * c * ux, y: s * Math.sin(r.th), z: s * c * uz }, w, clear: r.r2.clear, b1: r.b1, b2: { x: r.r2.x, z: r.r2.z }, speed: s };
    const ex = T.x - r.r2.x;
    if (Math.abs(ex) < 0.03) break;
    aimX += ex;
  }
  return best;
}

// ── the paddle contact, inverted ──

const _c = makeBall();
/** forward model: the ball after a paddle with face normal n moving at vp (rubber, blade) */
export function paddleOut(ball, n, vp, rub, blade = 'off', mr = 0.026, out = _c) {
  copyBall(ball, out);
  const un = (ball.v.x - vp.x) * n.x + (ball.v.y - vp.y) * n.y + (ball.v.z - vp.z) * n.z;
  if (un >= 0) return null;
  contact(out, n, vp, rubberCOR(rub, un, blade), rub.mu, rub.et, mr);
  return out;
}

const nrm = (th, ph) => ({ x: Math.cos(th) * Math.sin(ph), y: Math.sin(th), z: Math.cos(th) * Math.cos(ph) });

/**
 * The paddle (face normal n, velocity vp at the contact point) that sends `ball` out with velocity vT and spin
 * wT (only the spin across the flight direction matters). Levenberg–Marquardt on 5 unknowns.
 * Returns { n, vp, err (m/s), out } — err is the miss of the outgoing velocity.
 */
export function solvePaddle(ball, vT, wT, rubKey = 'inverted', blade = 'off') {
  const rub = RUBBERS[rubKey] || RUBBERS.inverted;
  const sT = Math.hypot(vT.x, vT.y, vT.z) || 1;
  const dx = vT.x / sT, dy = vT.y / sT, dz = vT.z / sT;
  const wPerp = (w) => { const k = w.x * dx + w.y * dy + w.z * dz; return [w.x - k * dx, w.y - k * dy, w.z - k * dz]; };
  const wt = wPerp(wT);
  const WS = BALL_R * 0.35;                       // spin weight: 100 rad/s ≈ 0.7 m/s
  const resid = (p) => {
    const n = nrm(p[0], p[1]);
    const o = paddleOut(ball, n, { x: p[2], y: p[3], z: p[4] }, rub, blade);
    if (!o) return null;
    const w = wPerp(o.w);
    return [o.v.x - vT.x, o.v.y - vT.y, o.v.z - vT.z, (w[0] - wt[0]) * WS, (w[1] - wt[1]) * WS, (w[2] - wt[2]) * WS];
  };
  // first guess: the impulse direction, and the normal speed that gives the outgoing normal speed
  let gx = vT.x - ball.v.x, gy = vT.y - ball.v.y, gz = vT.z - ball.v.z;
  const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
  const e0 = 0.8;
  const vtn = vT.x * gx + vT.y * gy + vT.z * gz, vin = ball.v.x * gx + ball.v.y * gy + ball.v.z * gz;
  const vpn = (vtn + e0 * vin) / (1 + e0);
  let p = [Math.asin(Math.max(-1, Math.min(1, gy))), Math.atan2(gx, gz),
    gx * vpn + (vT.x - vtn * gx) * 0.6, gy * vpn + (vT.y - vtn * gy) * 0.6, gz * vpn + (vT.z - vtn * gz) * 0.6];
  let r = resid(p);
  if (!r) { p[2] += gx * 3; p[3] += gy * 3; p[4] += gz * 3; r = resid(p); }
  if (!r) return null;
  const cost = (v) => v.reduce((a, x) => a + x * x, 0);
  let c0 = cost(r), lam = 1e-2;
  for (let it = 0; it < 40 && c0 > 1e-6; it++) {
    // numeric Jacobian (6 × 5)
    const J = [];
    for (let j = 0; j < 5; j++) {
      const eps = j < 2 ? 1e-4 : 1e-3;
      const q = p.slice(); q[j] += eps;
      const rq = resid(q) || r;
      J.push(rq.map((x, i) => (x - r[i]) / eps));
    }
    // (JᵀJ + λ·diag) δ = −Jᵀr
    const A = [], g = [];
    for (let a = 0; a < 5; a++) {
      A.push([]);
      for (let b = 0; b < 5; b++) { let s = 0; for (let i = 0; i < 6; i++) s += J[a][i] * J[b][i]; A[a].push(s); }
      let s = 0; for (let i = 0; i < 6; i++) s += J[a][i] * r[i]; g.push(-s);
    }
    let improved = false;
    for (let tries = 0; tries < 6; tries++) {
      const M = A.map((row, i) => row.map((x, j) => x + (i === j ? lam * (1 + A[i][i]) : 0)));
      const d = solve5(M, g);
      if (!d) { lam *= 10; continue; }
      const q = p.map((x, i) => x + d[i]);
      const rq = resid(q);
      if (rq && cost(rq) < c0) { p = q; r = rq; c0 = cost(rq); lam = Math.max(1e-6, lam * 0.3); improved = true; break; }
      lam *= 10;
    }
    if (!improved) break;
  }
  const n = nrm(p[0], p[1]), vp = { x: p[2], y: p[3], z: p[4] };
  const out = paddleOut(ball, n, vp, rub, blade, 0.026, makeBall());
  const err = Math.hypot(r[0], r[1], r[2]);
  return { n, vp, err, spinErr: Math.hypot(r[3], r[4], r[5]) / WS, out };
}

function solve5(A, b) {
  const n = 5, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** stroke name from the outgoing ball (for the hit read-out) */
export function strokeName(speedMs, topRpm, height) {
  const kmh = speedMs * 3.6;
  if (kmh > 75 && Math.abs(topRpm) < 3500 && height > 1.0) return 'スマッシュ';
  if (topRpm < -900 && kmh < 45) return 'ツッツキ';
  if (topRpm < -600) return 'カット';
  if (topRpm > 3800) return kmh > 70 ? 'パワードライブ' : 'ループドライブ';
  if (topRpm > 1800) return 'ドライブ';
  if (kmh < 30) return 'ストップ';
  if (kmh < 55) return 'ブロック';
  return 'ミート打ち';
}
