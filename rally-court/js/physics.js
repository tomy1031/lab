// js/physics.js — tennis ball flight, bounce, net and contact impulses. Pure (no three.js), so the live
// simulation, the trajectory prediction, the CPU's shot solver and the node tests all run the same code.
//
// Coordinates: metres, y up, the net in the plane z = 0. The player's half is z > 0 (baseline z = +11.885),
// the CPU's half is z < 0. The player faces −z.
//
// Flight: gravity + quadratic drag + Magnus lift (C_L = 1 / (2 + v / rω)) + slow spin decay, RK2 at 240 Hz.
// Contacts (court, net cord, strings) use one impulse model for a thin-walled sphere (I = 2/3·m·r²):
// normal restitution e, Coulomb friction μ capped at the rolling condition, the friction impulse also
// changes the spin. Racket hits use the apparent coefficient of restitution of a hand-held racket, so a
// still racket returns a 20 m/s ball at ~8 m/s and a 25 m/s swing sends it out at 40+ m/s, as measured.

export const BALL_R = 0.0335;            // m (ITF: 6.54–6.86 cm diameter)
export const BALL_M = 0.057;             // kg (56.0–59.4 g)
export const SHELL = 2 / 3;              // moment of inertia factor of a hollow ball
export const G = 9.81;
export const H = 1 / 240;                // fixed physics step (s)
const RHO = 1.21;                        // air density (kg/m³, 20 °C)
const CD = 0.55;                         // drag coefficient of a fuzzy tennis ball
const AREA = Math.PI * BALL_R * BALL_R;
const KD = 0.5 * RHO * CD * AREA / BALL_M;
const KL = 0.5 * RHO * AREA / BALL_M;
const SPIN_TAU = 8;                      // s, spin decay time constant in flight
const SPIN_DECAY = Math.exp(-H / SPIN_TAU);

// ITF court (singles play on a doubles court with singles sticks)
export const COURT = {
  halfLen: 11.885,       // net to baseline
  singlesHalfW: 4.115,
  doublesHalfW: 5.485,
  serviceZ: 6.40,        // net to service line
  netCenterH: 0.914,
  netPostH: 1.07,
  stickX: 5.029,         // singles sticks, 0.914 m outside the singles lines
  netEndX: 6.399,        // the net reaches the doubles posts
  fenceX: 10.4,          // side fences
  fenceZ: 18.2,          // back fences
  line: 0.05,            // line width (baseline 0.10)
};

// Court surfaces. μ: sliding friction ball–court; e: vertical coefficient of restitution.
// Court Pace Rating = 100(1 − μ) + 150(0.81 − e): clay ≈ 24 (slow), hard ≈ 37 (medium), grass ≈ 52 (fast).
// A ball dropped from 2.54 m rebounds to ~1.45 m on the hard court (ITF ball test: 1.35–1.47 m).
export const SURFACES = {
  hard: { mu: 0.70, e: 0.76 },
  clay: { mu: 0.80, e: 0.78 },
  grass: { mu: 0.62, e: 0.72 },
};
export const STRING_MU = 0.45;           // ball–string friction
const CORD_R = 0.006;                    // net tape cord radius

export function netHeight(x) {
  const ax = Math.abs(x);
  if (ax >= COURT.stickX) return COURT.netPostH;
  const k = ax / COURT.stickX;
  return COURT.netCenterH + (COURT.netPostH - COURT.netCenterH) * k * k;
}

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export function makeBall(p = v3(), v = v3(), w = v3()) {
  return { p: { ...p }, v: { ...v }, w: { ...w }, rolling: false, stopped: false };
}
export function copyBall(b, out = makeBall()) {
  out.p.x = b.p.x; out.p.y = b.p.y; out.p.z = b.p.z;
  out.v.x = b.v.x; out.v.y = b.v.y; out.v.z = b.v.z;
  out.w.x = b.w.x; out.w.y = b.w.y; out.w.z = b.w.z;
  out.rolling = b.rolling; out.stopped = b.stopped;
  return out;
}
export const speed = (v) => Math.hypot(v.x, v.y, v.z);
export const rpm = (w) => Math.hypot(w.x, w.y, w.z) * 60 / (2 * Math.PI);

// aerodynamic + gravity acceleration for velocity (vx,vy,vz) and spin w → out
function accel(vx, vy, vz, w, out) {
  const s = Math.hypot(vx, vy, vz);
  out.x = 0; out.y = -G; out.z = 0;
  if (s < 1e-6) return out;
  out.x -= KD * s * vx; out.y -= KD * s * vy; out.z -= KD * s * vz;
  const wm = Math.hypot(w.x, w.y, w.z);
  if (wm > 1e-3) {
    const S = BALL_R * wm / s;                      // spin parameter
    const cl = 1 / (2 + 1 / S);
    const k = KL * cl * s / wm;                     // a = KL·C_L·s·(ŵ × v)
    out.x += k * (w.y * vz - w.z * vy);
    out.y += k * (w.z * vx - w.x * vz);
    out.z += k * (w.x * vy - w.y * vx);
  }
  return out;
}

const _a1 = v3(), _a2 = v3();

/**
 * Contact impulse between the ball and a surface with normal n (unit, pointing from the surface toward the
 * ball centre) moving with velocity vs at the contact point. e: normal restitution, mu: friction.
 * Returns the normal speed change (m/s, ≥ 0), or 0 when the ball is already separating.
 */
export function contact(b, n, vs, e, mu) {
  const r = BALL_R;
  const cx = -n.x * r, cy = -n.y * r, cz = -n.z * r;              // contact point from the ball centre
  const w = b.w, v = b.v;
  // velocity of the ball's contact point relative to the surface
  const ux = v.x + (w.y * cz - w.z * cy) - vs.x;
  const uy = v.y + (w.z * cx - w.x * cz) - vs.y;
  const uz = v.z + (w.x * cy - w.y * cx) - vs.z;
  const un = ux * n.x + uy * n.y + uz * n.z;
  if (un >= 0) return 0;
  const jn = -(1 + e) * un;
  let tx = ux - un * n.x, ty = uy - un * n.y, tz = uz - un * n.z;
  const ut = Math.hypot(tx, ty, tz);
  let dvt = 0;
  if (ut > 1e-6) {
    dvt = Math.min(ut * SHELL / (1 + SHELL), mu * jn);           // grip (rolling) or slide
    tx *= -dvt / ut; ty *= -dvt / ut; tz *= -dvt / ut;            // tangential Δv
  } else { tx = ty = tz = 0; }
  v.x += n.x * jn + tx; v.y += n.y * jn + ty; v.z += n.z * jn + tz;
  // the friction impulse spins the ball: Δω = (c × Δv_t) / (k r²)
  const kk = 1 / (SHELL * r * r);
  w.x += (cy * tz - cz * ty) * kk;
  w.y += (cz * tx - cx * tz) * kk;
  w.z += (cx * ty - cy * tx) * kk;
  return jn;
}

const UP = v3(0, 1, 0), ZERO = v3();

/**
 * Advance the ball by one fixed step h. Bounces, net and fence contacts are appended to `ev` (if given) as
 * { type: 'bounce' | 'net' | 'wall' | 'stop', x, y, z, frac, ...extra } where frac is the fraction of the step.
 * surf: { mu, e } of the court.
 */
export function step(b, h, surf, ev) {
  if (b.stopped) return;
  const p = b.p, v = b.v, w = b.w;
  const x0 = p.x, y0 = p.y, z0 = p.z;
  if (b.rolling) {
    // rolling on the court: rolling resistance, spin follows the motion
    const s = Math.hypot(v.x, v.z);
    const dec = 0.5 * h;
    if (s <= dec) {
      v.x = v.z = 0; b.stopped = true;
      if (ev) ev.push({ type: 'stop', x: p.x, y: p.y, z: p.z, frac: 1 });
    } else { v.x *= 1 - dec / s; v.z *= 1 - dec / s; }
    v.y = 0; p.y = BALL_R;
    p.x += v.x * h; p.z += v.z * h;
    w.x = -v.z / BALL_R; w.y = 0; w.z = v.x / BALL_R;
  } else {
    // RK2 (midpoint)
    accel(v.x, v.y, v.z, w, _a1);
    const mx = v.x + _a1.x * h * 0.5, my = v.y + _a1.y * h * 0.5, mz = v.z + _a1.z * h * 0.5;
    accel(mx, my, mz, w, _a2);
    p.x += mx * h; p.y += my * h; p.z += mz * h;
    v.x += _a2.x * h; v.y += _a2.y * h; v.z += _a2.z * h;
    w.x *= SPIN_DECAY; w.y *= SPIN_DECAY; w.z *= SPIN_DECAY;
    netContact(b, x0, y0, z0, ev);
    // court
    if (p.y < BALL_R && v.y < 0) {
      const f = y0 > BALL_R ? (y0 - BALL_R) / Math.max(1e-9, y0 - p.y) : 0;
      const cx = x0 + (p.x - x0) * f, cz = z0 + (p.z - z0) * f;
      const vyIn = v.y;
      contact(b, UP, ZERO, surf.e, surf.mu);
      // continue from the contact point with the new velocity for the rest of the step
      p.x = cx + v.x * h * (1 - f); p.z = cz + v.z * h * (1 - f);
      p.y = BALL_R + Math.max(0, v.y * h * (1 - f));
      if (v.y < 0.35) { v.y = 0; p.y = BALL_R; b.rolling = true; }
      if (ev) ev.push({ type: 'bounce', x: cx, y: BALL_R, z: cz, frac: f, vy: vyIn });
    }
  }
  // fences: a soft bounce keeps the ball in the stadium
  const fx = COURT.fenceX - BALL_R, fz = COURT.fenceZ - BALL_R;
  if (Math.abs(p.x) > fx && p.x * v.x > 0) {
    p.x = Math.sign(p.x) * fx; v.x *= -0.3; v.y *= 0.6; v.z *= 0.6;
    if (ev) ev.push({ type: 'wall', x: p.x, y: p.y, z: p.z, frac: 1 });
  }
  if (Math.abs(p.z) > fz && p.z * v.z > 0) {
    p.z = Math.sign(p.z) * fz; v.z *= -0.3; v.y *= 0.6; v.x *= 0.6;
    if (ev) ev.push({ type: 'wall', x: p.x, y: p.y, z: p.z, frac: 1 });
  }
}

// distance (in the y–z plane) from the ball centre to the net: the mesh {z = 0, y ≤ top} plus the cord at the top
function netDist(y, z, top) {
  if (y <= top) return Math.abs(z);
  return Math.hypot(y - top, z);
}

const _n = v3();
function netContact(b, x0, y0, z0, ev) {
  const p = b.p;
  if (Math.abs(z0) > 0.45 && Math.abs(p.z) > 0.45 && Math.sign(z0) === Math.sign(p.z)) return;
  const lim = BALL_R + CORD_R;
  // earliest point of the step's segment that touches the net
  let hit = -1;
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const x = x0 + (p.x - x0) * s;
    if (Math.abs(x) > COURT.netEndX + BALL_R) continue;
    const top = netHeight(x) - CORD_R;
    if (netDist(y0 + (p.y - y0) * s, z0 + (p.z - z0) * s, top) < lim) { hit = s; break; }
  }
  if (hit < 0) return;
  let lo = Math.max(0, hit - 1 / N), hi = hit;
  if (hit > 0) {
    for (let k = 0; k < 10; k++) {
      const s = (lo + hi) / 2;
      const x = x0 + (p.x - x0) * s;
      const top = netHeight(x) - CORD_R;
      if (netDist(y0 + (p.y - y0) * s, z0 + (p.z - z0) * s, top) < lim) hi = s; else lo = s;
    }
  }
  const s = lo;
  const cx = x0 + (p.x - x0) * s, cy = y0 + (p.y - y0) * s, cz = z0 + (p.z - z0) * s;
  const top = netHeight(cx) - CORD_R;
  let cord = false;
  if (cy > top) {
    const d = Math.hypot(cy - top, cz) || 1;
    _n.x = 0; _n.y = (cy - top) / d; _n.z = cz / d;
    cord = true;
  } else {
    _n.x = 0; _n.y = 0; _n.z = Math.sign(z0) || 1;
  }
  const v = b.v;
  const vn = v.x * _n.x + v.y * _n.y + v.z * _n.z;
  if (vn >= 0) return;                        // moving away already
  p.x = cx; p.y = cy; p.z = cz;
  if (cord) {
    // the tape: a firm, rounded edge — the ball pops up, dribbles over or falls back
    contact(b, _n, ZERO, 0.35, 0.25);
  } else {
    // the mesh swallows the ball: it drops down on the hitter's side
    v.z = -v.z * 0.08; v.x *= 0.35; v.y *= 0.35;
    b.w.x *= 0.2; b.w.y *= 0.2; b.w.z *= 0.2;
    p.z = (Math.sign(z0) || 1) * lim;
  }
  if (ev) ev.push({ type: 'net', x: cx, y: cy, z: cz, frac: s, cord });
}

/**
 * Apparent coefficient of restitution of a hand-held racket by impact location on the string bed.
 * s: along the long axis (−1 throat … +1 tip), t: across (−1 … +1). About 0.46 near the throat, 0.42 at the
 * centre, 0.26 near the tip; off-axis impacts twist the racket and lose more.
 */
export function racketACOR(s, t) {
  const e = Math.min(0.5, Math.max(0.15, 0.42 - 0.12 * s - 0.10 * s * s));
  return e * (1 - 0.35 * t * t);
}

/** court-area tests (singles) */
export function inSingles(x, z, side, tol = 0.015) {
  if (Math.abs(x) > COURT.singlesHalfW + tol) return false;
  if (side > 0) return z > 0 && z <= COURT.halfLen + tol;
  return z < 0 && z >= -COURT.halfLen - tol;
}
/**
 * Service box. side: +1 player half (z > 0), −1 CPU half. court: 'deuce' | 'ad' seen by the receiver.
 * The receiver on +z faces −z (their right is +x); the receiver on −z faces +z (their right is −x).
 * The deuce court is the receiver's right.
 */
export function inServiceBox(x, z, side, court, tol = 0.015) {
  const right = side > 0 ? 1 : -1;               // sign of x on the receiver's right
  const wantSign = court === 'deuce' ? right : -right;
  if (x * wantSign < -tol) return false;
  if (Math.abs(x) > COURT.singlesHalfW + tol) return false;
  if (side > 0) return z > 0 && z <= COURT.serviceZ + tol;
  return z < 0 && z >= -COURT.serviceZ - tol;
}
