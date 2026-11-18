// js/solver.js — inverse ballistics: the launch velocity that lands a ball with a given speed and spin on a
// target point, clearing the net. Used by the CPU, the ball machine, the PC swing and the (optional) shot
// assist. Same physics as the live ball.
import { step, H, makeBall, netHeight, BALL_R } from './physics.js';

const _b = makeBall();
const _ev = [];

/** spin vector for a ball travelling along horizontal direction (dx, dz): + topspin, − backspin; side: + curves right */
export function spinVector(dx, dz, top, side = 0) {
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l, uz = dz / l;
  // topspin axis = up × d = (uz, 0, −ux): the top of the ball turns forward and Magnus pushes it down.
  // Side spin about −y pushes the ball to the right of its path.
  return { x: top * uz, y: -side, z: -top * ux };
}

/**
 * Fly a ball launched from P with speed s at elevation th (rad) along azimuth unit (ux, uz) with spin w.
 * Returns { range (along the azimuth to the first bounce), lat, bx, bz, clear (height over the net; −1 = net) , t }
 */
export function flyOnce(P, s, th, ux, uz, w, surf, tMax = 3) {
  const b = _b;
  b.p.x = P.x; b.p.y = P.y; b.p.z = P.z;
  const c = Math.cos(th);
  b.v.x = s * c * ux; b.v.y = s * Math.sin(th); b.v.z = s * c * uz;
  b.w.x = w.x; b.w.y = w.y; b.w.z = w.z;
  b.rolling = false; b.stopped = false;
  let clear = Infinity;
  const N = Math.ceil(tMax / H);
  let prevZ = P.z;
  for (let i = 1; i <= N; i++) {
    _ev.length = 0;
    const x0 = b.p.x, y0 = b.p.y;
    step(b, H, surf, _ev);
    for (const e of _ev) {
      if (e.type === 'net') return { range: -1, lat: 0, bx: e.x, bz: e.z, clear: -1, t: i * H };
      if (e.type === 'bounce') {
        const dx = e.x - P.x, dz = e.z - P.z;
        if (clear === Infinity) clear = 9;   // never crossed the net (short shot on own half)
        return { range: dx * ux + dz * uz, lat: dx * uz - dz * ux, bx: e.x, bz: e.z, clear, t: i * H };
      }
    }
    if (Math.sign(b.p.z) !== Math.sign(prevZ) && prevZ !== 0) {
      const f = prevZ / (prevZ - b.p.z);
      const xc = x0 + (b.p.x - x0) * f, yc = y0 + (b.p.y - y0) * f;
      clear = Math.min(clear, yc - BALL_R - netHeight(xc));
    }
    prevZ = b.p.z;
    if (b.p.y > 40) break;
  }
  return { range: 1e9, lat: 0, bx: b.p.x, bz: b.p.z, clear, t: tMax };
}

/**
 * Launch velocity from P (contact point) to land at T {x,z} with launch speed s (m/s) and spin top (rad/s,
 * + topspin) and side spin. kind: 'drive' (the low solution) or 'lob' (the high one).
 * Returns { ok, v:{x,y,z}, w:{x,y,z}, th, clear, t } or { ok:false }.
 */
export function solveShot(P, T, s, top, surf, kind = 'drive', side = 0) {
  let dx, dz, ux = 0, uz = -1;
  // sidespin curves the ball: aim off by the lateral drift (two corrections)
  let aimX = T.x, aimZ = T.z;
  let res = null;
  for (let pass = 0; pass < (side ? 3 : 1); pass++) {
    dx = aimX - P.x; dz = aimZ - P.z;
    const Dk = Math.hypot(dx, dz);
    ux = dx / Dk; uz = dz / Dk;
    const ww = spinVector(ux, uz, top, side);
    res = solveElevation(P, Dk, s, ux, uz, ww, surf, kind);
    if (!res) return { ok: false };
    if (!side) break;
    // correct for the drift seen at the landing point
    const ex = T.x - res.bx, ez = T.z - res.bz;
    aimX += ex; aimZ += ez;
  }
  const c = Math.cos(res.th);
  return {
    ok: true, th: res.th, clear: res.clear, t: res.t, bx: res.bx, bz: res.bz,
    v: { x: s * c * ux, y: s * Math.sin(res.th), z: s * c * uz }, w: spinVector(ux, uz, top, side),
  };
}

function solveElevation(P, D, s, ux, uz, w, surf, kind) {
  const lo = -14 * Math.PI / 180, hi = (kind === 'lob' ? 68 : 40) * Math.PI / 180;
  const stepA = 1.5 * Math.PI / 180;
  let prev = null;
  const brackets = [];
  for (let th = lo; th <= hi + 1e-9; th += stepA) {
    const r = flyOnce(P, s, th, ux, uz, w, surf);
    const f = r.range < 0 ? -1e3 : r.range - D;      // into the net counts as short
    if (prev && Math.sign(prev.f) !== Math.sign(f)) brackets.push([prev.th, th, prev.f, f]);
    prev = { th, f };
  }
  if (!brackets.length) return null;
  const br = kind === 'lob' ? brackets[brackets.length - 1] : brackets[0];
  let [a, b, fa] = br;
  let r = null;
  for (let k = 0; k < 16; k++) {
    const m = (a + b) / 2;
    r = flyOnce(P, s, m, ux, uz, w, surf);
    const f = r.range < 0 ? -1e3 : r.range - D;
    if (Math.sign(f) === Math.sign(fa)) { a = m; fa = f; } else b = m;
  }
  const th = (a + b) / 2;
  r = flyOnce(P, s, th, ux, uz, w, surf);
  if (r.range < 0 || r.clear < 0) return null;
  return { th, clear: r.clear, t: r.t, bx: r.bx, bz: r.bz };
}

/**
 * Like solveShot, but if the ball cannot clear the net by `minClear` at speed s, slows down (and finally lobs).
 */
export function solveSafe(P, T, s, top, surf, minClear = 0.15, side = 0) {
  for (let k = 0; k < 9; k++) {
    const sk = s * (1 - 0.07 * k);
    const r = solveShot(P, T, sk, top, surf, 'drive', side);
    if (r.ok && r.clear >= minClear) return { ...r, speed: sk };
  }
  const r = solveShot(P, T, Math.max(12, s * 0.6), top * 0.5, surf, 'lob');
  if (r.ok) return { ...r, speed: Math.max(12, s * 0.6) };
  return { ok: false };
}

/**
 * Shot assist: turn the ball's launch (keeping its speed and the topspin part of its spin) toward `target`
 * by `amount` (0 = pure physics, 1 = exactly at the target). Returns true if it could.
 */
export function assistShot(ball, target, amount, surf, allowSlow = false) {
  let s = Math.hypot(ball.v.x, ball.v.y, ball.v.z);
  if (amount <= 0 || s < 3) return false;
  const P = { x: ball.p.x, y: ball.p.y, z: ball.p.z };
  const dx = target.x - P.x, dz = target.z - P.z, dl = Math.hypot(dx, dz) || 1;
  let top = ball.w.x * (dz / dl) - ball.w.z * (dx / dl);
  let sol = solveShot(P, target, s, top, surf, 'drive');
  // PC aiming: a floating backspin ball is flattened, and one too fast to drop in over the net loses some pace
  if (allowSlow && (!sol.ok || sol.clear < 0.05) && top < 0) { top = 0; sol = solveShot(P, target, s, top, surf, 'drive'); }
  for (let k = 1; allowSlow && k <= 6 && (!sol.ok || sol.clear < 0.05); k++) sol = solveShot(P, target, s * (1 - 0.05 * k), top, surf, 'drive');
  if (sol.ok && sol.clear >= 0.05) s = Math.hypot(sol.v.x, sol.v.y, sol.v.z);
  else sol = solveShot(P, target, s, top, surf, 'lob');
  if (!sol.ok) return false;
  const th0 = Math.asin(ball.v.y / s), ph0 = Math.atan2(ball.v.x, ball.v.z);
  const th1 = sol.th, ph1 = Math.atan2(sol.v.x, sol.v.z);
  let dph = ph1 - ph0;
  while (dph > Math.PI) dph -= 2 * Math.PI;
  while (dph < -Math.PI) dph += 2 * Math.PI;
  const th = th0 + (th1 - th0) * amount, ph = ph0 + dph * amount;
  ball.v.x = s * Math.cos(th) * Math.sin(ph); ball.v.z = s * Math.cos(th) * Math.cos(ph); ball.v.y = s * Math.sin(th);
  // the spin turns with the ball: keep its topspin about the new direction
  const ux = Math.sin(ph), uz = Math.cos(ph);
  ball.w.x = top * uz; ball.w.z = -top * ux;
  return true;
}
