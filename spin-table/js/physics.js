// js/physics.js — the table tennis ball: flight, bounces on the table (and its edges), the net, the floor, the
// barriers, and the contact impulse used for every surface including the rubber of a paddle. Pure (no three.js),
// so the live game, the CPU's trajectory prediction and shot solver, and the node tests all run the same code.
//
// Coordinates: metres, y up, the floor at y = 0, the net in the plane z = 0, the table top at y = 0.76.
// Your half is z > 0 (you face −z); the opponent's half is z < 0.
//
// The ball (ITTF): 40 mm, 2.7 g, a thin shell (I = 0.66·m·r²; a 0.4 mm wall).
// Flight: gravity + quadratic drag (C_D 0.47 → terminal speed ≈ 8.6 m/s, as measured) + Magnus lift
//   C_L = S / (1 + 2S), S = rω / v (≈ 0.2 at S = 0.3, 0.28 at S = 0.65) + spin decay by air friction.
//   Integrated with RK2 at 1 kHz, split further so the ball never moves more than 8 mm in one sub-step.
// Contacts: one impulse model for a thin-walled sphere: normal restitution e, Coulomb friction μ that may
//   stop the contact point slipping (grip), and a tangential restitution e_t (the rubber springs back, so a
//   brushed ball leaves spinning faster than rolling) — the friction impulse changes the spin.

export const BALL_R = 0.020;              // m (ITTF: 40 mm)
export const BALL_M = 0.0027;             // kg (2.67–2.77 g)
export const SHELL = 0.66;                // I = SHELL · m · r² (thin shell with a 0.4 mm wall)
export const G = 9.81;
export const H = 1 / 1000;                // physics step (s)
const RHO = 1.20;                         // air (kg/m³, 20 °C)
const CD = 0.47;
const AREA = Math.PI * BALL_R * BALL_R;
const KD = 0.5 * RHO * CD * AREA / BALL_M;   // drag: a = −KD·|v|·v
const KL = 0.5 * RHO * AREA / BALL_M;        // lift: a = KL·C_L·|v|²·(ω̂ × v̂)
const MAX_SUB = 0.008;                        // longest move in one sub-step (m)

// ITTF table: 2.74 × 1.525 m, top 76 cm above the floor, 2 cm white edge lines, 3 mm centre line
export const TABLE = { halfL: 1.37, halfW: 0.7625, h: 0.76, thick: 0.025, line: 0.02, center: 0.003 };
// the net: 15.25 cm high, reaching 15.25 cm outside the side lines; the top cord with its white band
export const NET = { h: 0.1525, halfLen: 0.915, cordR: 0.004, postW: 0.022, postD: 0.024 };
// the playing space (ITTF: at least 14 m × 7 m) inside barriers 75 cm high; the hall's walls beyond
export const ROOM = { halfX: 3.5, halfZ: 7.0, barrierH: 0.75, wallX: 9, wallZ: 13, ceiling: 9 };

// Table: ITTF — a 30 cm drop bounces about 23 cm. The coefficient of restitution falls with impact speed.
export const TABLE_SURF = { mu: 0.25, e0: 0.95, ek: 0.0186, emin: 0.72 };
const FLOOR_SURF = { mu: 0.45, e0: 0.84, ek: 0.03, emin: 0.5 };
const restitution = (s, vn) => Math.max(s.emin, Math.min(s.e0, s.e0 - s.ek * Math.abs(vn)));

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export function makeBall(p = v3(), v = v3(), w = v3()) {
  return { p: { ...p }, v: { ...v }, w: { ...w }, rolling: -1, stopped: false };
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
export const RPS = 2 * Math.PI;           // rad/s per revolution per second

/**
 * Spin of a ball relative to its direction of travel, in revolutions per minute.
 * top > 0: topspin (the top of the ball turns forward), < 0: backspin. side > 0: the ball curves to the right
 * (as seen by the hitter). gyro: about the direction of travel (does not curve the ball).
 */
export function spinParts(v, w) {
  const l = Math.hypot(v.x, v.z) || 1;
  const ux = v.x / l, uz = v.z / l;
  const k = 60 / (2 * Math.PI);
  return {
    top: (w.x * uz - w.z * ux) * k,
    side: -w.y * k,
    gyro: (w.x * ux + w.z * uz) * k,
    total: Math.hypot(w.x, w.y, w.z) * k,
  };
}
/** spin vector (rad/s) for a ball travelling along (dx, dz): top/side in rad/s, signs as in spinParts */
export function spinVector(dx, dz, top, side = 0) {
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l, uz = dz / l;
  return { x: top * uz, y: -side, z: -top * ux };
}

// gravity + air on a ball with velocity (vx,vy,vz) and spin w → out
function accel(vx, vy, vz, w, out) {
  const s = Math.hypot(vx, vy, vz);
  out.x = 0; out.y = -G; out.z = 0;
  if (s < 1e-6) return out;
  out.x -= KD * s * vx; out.y -= KD * s * vy; out.z -= KD * s * vz;
  const wm = Math.hypot(w.x, w.y, w.z);
  if (wm > 1e-3) {
    const S = BALL_R * wm / s;
    const cl = S / (1 + 2 * S);
    const k = KL * cl * s / wm;                       // a = KL·C_L·s²·(ŵ × v̂) = KL·C_L·s/|ω|·(ω × v)
    out.x += k * (w.y * vz - w.z * vy);
    out.y += k * (w.z * vx - w.x * vz);
    out.z += k * (w.x * vy - w.y * vx);
  }
  return out;
}
/** air-friction spin decay rate (1/s): about 3 % of the spin is lost crossing the table at 15 m/s */
const spinDecay = (s) => 0.08 + 0.006 * s;

/**
 * Contact impulse between the ball and a surface with unit normal n (from the surface toward the ball centre),
 * the surface moving with velocity vs at the contact point.
 *   e: normal restitution · mu: friction · et: tangential restitution (0 = the contact point ends rolling,
 *   > 0 = the rubber springs back and the ball spins faster than rolling) · mr: ball mass / effective mass
 *   of the surface (a hand-held paddle recoils a little).
 * Returns { jn (normal Δv, m/s), slip (sliding speed of the contact point before), grip (true if it stopped
 * slipping) } or null when the ball is already separating.
 */
export function contact(b, n, vs, e, mu, et = 0, mr = 0) {
  const r = BALL_R;
  const cx = -n.x * r, cy = -n.y * r, cz = -n.z * r;          // contact point from the ball centre
  const w = b.w, v = b.v;
  const ux = v.x + (w.y * cz - w.z * cy) - vs.x;
  const uy = v.y + (w.z * cx - w.x * cz) - vs.y;
  const uz = v.z + (w.x * cy - w.y * cx) - vs.z;
  const un = ux * n.x + uy * n.y + uz * n.z;
  if (un >= 0) return null;
  const jn = -(1 + e) * un / (1 + mr);
  let tx = ux - un * n.x, ty = uy - un * n.y, tz = uz - un * n.z;
  const ut = Math.hypot(tx, ty, tz);
  let dvt = 0, grip = true;
  if (ut > 1e-7) {
    // Δv_t that turns the slip u_t into −e_t·u_t: (1 + e_t)·u_t · k/(1 + k) for a shell with I = k·m·r²
    const need = (1 + et) * ut * SHELL / (1 + SHELL);
    const cap = mu * jn;
    if (need > cap) { dvt = cap; grip = false; } else dvt = need;
    tx *= -dvt / ut; ty *= -dvt / ut; tz *= -dvt / ut;
  } else { tx = ty = tz = 0; }
  v.x += n.x * jn + tx; v.y += n.y * jn + ty; v.z += n.z * jn + tz;
  // the friction impulse spins the ball: Δω = (c × Δv_t) / (k·r²)
  const kk = 1 / (SHELL * r * r);
  w.x += (cy * tz - cz * ty) * kk;
  w.y += (cz * tx - cx * tz) * kk;
  w.z += (cx * ty - cy * tx) * kk;
  return { jn, slip: ut, grip };
}

const ZERO = v3();
const _a1 = v3(), _a2 = v3(), _n = v3();

/**
 * Closest point of an axis-aligned box to point p. Returns the squared distance and fills _c / the face flags.
 */
const _c = v3();
function boxClosest(p, x0, x1, y0, y1, z0, z1) {
  _c.x = Math.min(x1, Math.max(x0, p.x));
  _c.y = Math.min(y1, Math.max(y0, p.y));
  _c.z = Math.min(z1, Math.max(z0, p.z));
  const dx = p.x - _c.x, dy = p.y - _c.y, dz = p.z - _c.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Advance the ball by one step h (normally H). Contacts are appended to `ev` (if given):
 *   { type: 'table', side: ±1, x, z, edge, vn }      the playing surface (the top edge counts: an edge ball)
 *   { type: 'side', x, y, z }                         the side of the table below the edge (does not count)
 *   { type: 'net', cord, post, x, y, z }              the net assembly
 *   { type: 'floor' | 'barrier' | 'wall', x, y, z, vn }
 *   { type: 'stop' }                                  the ball came to rest
 */
export function step(b, h, ev) {
  if (b.stopped) return;
  const sp = Math.hypot(b.v.x, b.v.y, b.v.z);
  const n = Math.min(12, Math.max(1, Math.ceil(sp * h / MAX_SUB)));
  const hs = h / n;
  for (let i = 0; i < n && !b.stopped; i++) subStep(b, hs, ev);
}

function subStep(b, h, ev) {
  const p = b.p, v = b.v, w = b.w;
  if (b.rolling >= 0) { roll(b, h, ev); return; }
  accel(v.x, v.y, v.z, w, _a1);
  const mx = v.x + _a1.x * h * 0.5, my = v.y + _a1.y * h * 0.5, mz = v.z + _a1.z * h * 0.5;
  accel(mx, my, mz, w, _a2);
  const z0 = p.z;
  p.x += mx * h; p.y += my * h; p.z += mz * h;
  v.x += _a2.x * h; v.y += _a2.y * h; v.z += _a2.z * h;
  const dec = Math.exp(-spinDecay(Math.hypot(v.x, v.y, v.z)) * h);
  w.x *= dec; w.y *= dec; w.z *= dec;
  tableContact(b, ev);
  netContact(b, z0, ev);
  floorAndWalls(b, ev);
}

// the table top as a box: its top face is the playing surface; the top edge counts (edge ball) when the ball
// comes from above; the vertical sides (and the underside) do not
function tableContact(b, ev) {
  const p = b.p, T = TABLE, r = BALL_R;
  if (p.y > T.h + r + 0.01 || p.y < T.h - T.thick - r - 0.01) return;
  if (Math.abs(p.x) > T.halfW + r || Math.abs(p.z) > T.halfL + r) return;
  const d2 = boxClosest(p, -T.halfW, T.halfW, T.h - T.thick, T.h, -T.halfL, T.halfL);
  if (d2 >= r * r) return;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {           // centre inside the slab (should not happen with the sub-steps): out through the top
    _n.x = 0; _n.y = 1; _n.z = 0; d = 0;
  } else { _n.x = (p.x - _c.x) / d; _n.y = (p.y - _c.y) / d; _n.z = (p.z - _c.z) / d; }
  const vn = b.v.x * _n.x + b.v.y * _n.y + b.v.z * _n.z;
  // push out of the surface
  p.x = _c.x + _n.x * r; p.y = _c.y + _n.y * r; p.z = _c.z + _n.z * r;
  if (vn >= 0) return;
  const onTop = _c.y >= T.h - 1e-9;
  const inside = Math.abs(_c.x) < T.halfW - 1e-9 && Math.abs(_c.z) < T.halfL - 1e-9;
  const e = restitution(TABLE_SURF, vn);
  contact(b, _n, ZERO, onTop && inside ? e : e * 0.85, TABLE_SURF.mu);
  if (onTop && (inside || p.y >= T.h)) {
    if (ev) ev.push({ type: 'table', side: Math.sign(_c.z) || 1, x: _c.x, z: _c.z, edge: !inside, vn: -vn });
    if (inside && b.v.y < 0.18 && b.v.y > -0.05) startRolling(b, T.h + r);
  } else if (ev) ev.push({ type: 'side', x: _c.x, y: _c.y, z: _c.z, vn: -vn });
}

function netContact(b, z0, ev) {
  const p = b.p, r = BALL_R, N = NET, T = TABLE;
  if (Math.abs(p.z) > r + N.cordR + 0.01 && Math.abs(z0) > r + N.cordR + 0.01 && Math.sign(p.z) === Math.sign(z0)) return;
  if (p.y > T.h + N.h + r + 0.01 || p.y < T.h - 0.05) return;
  const ax = Math.abs(p.x);
  if (ax > N.halfLen + N.postW + r) return;
  const side = Math.sign(z0) || Math.sign(b.v.z) * -1 || 1;
  // the posts (with their clamps) at both ends
  if (ax > N.halfLen - r) {
    const s = Math.sign(p.x);
    const x0 = s > 0 ? N.halfLen : -N.halfLen - N.postW, x1 = x0 + N.postW;
    const d2 = boxClosest(p, x0, x1, T.h - 0.03, T.h + N.h + 0.008, -N.postD / 2, N.postD / 2);
    if (d2 < r * r && d2 > 1e-12) {
      const d = Math.sqrt(d2);
      _n.x = (p.x - _c.x) / d; _n.y = (p.y - _c.y) / d; _n.z = (p.z - _c.z) / d;
      p.x = _c.x + _n.x * r; p.y = _c.y + _n.y * r; p.z = _c.z + _n.z * r;
      if (contact(b, _n, ZERO, 0.55, 0.3) && ev) ev.push({ type: 'net', cord: false, post: true, x: p.x, y: p.y, z: p.z });
      return;
    }
  }
  if (ax > N.halfLen) return;
  const cy = T.h + N.h - N.cordR;           // the cord's axis
  const dy = p.y - cy, dz = p.z;
  // the cord (rounded top): a firm edge — the ball pops up, trickles over or falls back
  if (dy > 0 || Math.abs(dz) > r) {
    const d = Math.hypot(dy, dz);
    if (d < r + N.cordR && d > 1e-9) {
      _n.x = 0; _n.y = dy / d; _n.z = dz / d;
      p.y = cy + _n.y * (r + N.cordR); p.z = _n.z * (r + N.cordR);
      if (contact(b, _n, ZERO, 0.35, 0.3) && ev) ev.push({ type: 'net', cord: true, post: false, x: p.x, y: p.y, z: p.z });
    }
    return;
  }
  // the mesh: soft — it swallows the ball, which drops on the side it came from
  if (Math.abs(p.z) < r && p.y > T.h) {
    const vz = b.v.z;
    if (vz * side > 0) return;              // moving away from the net already
    b.v.z = -vz * 0.1; b.v.x *= 0.35; b.v.y = Math.min(b.v.y * 0.35, 0.3);
    b.w.x *= 0.3; b.w.y *= 0.3; b.w.z *= 0.3;
    p.z = side * r;
    if (ev) ev.push({ type: 'net', cord: false, post: false, x: p.x, y: p.y, z: p.z });
  }
}

function floorAndWalls(b, ev) {
  const p = b.p, v = b.v, r = BALL_R, R = ROOM;
  if (p.y < r && v.y < 0) {
    const vn = v.y;
    p.y = r;
    contact(b, { x: 0, y: 1, z: 0 }, ZERO, restitution(FLOOR_SURF, vn), FLOOR_SURF.mu);
    if (ev) ev.push({ type: 'floor', x: p.x, y: 0, z: p.z, vn: -vn });
    if (v.y < 0.25) startRolling(b, r);
  }
  // the barriers around the playing space (75 cm) and the hall's walls
  const low = p.y < R.barrierH + r;
  const lim = (pos, vel, edge) => Math.abs(pos) > edge - r && pos * vel > 0;
  if (low && lim(p.x, v.x, R.halfX) && Math.abs(p.x) < R.halfX + 0.05) {
    p.x = Math.sign(p.x) * (R.halfX - r); v.x *= -0.3; v.y *= 0.6; v.z *= 0.6;
    if (ev) ev.push({ type: 'barrier', x: p.x, y: p.y, z: p.z, vn: Math.abs(v.x) / 0.3 });
  }
  if (low && lim(p.z, v.z, R.halfZ) && Math.abs(p.z) < R.halfZ + 0.05) {
    p.z = Math.sign(p.z) * (R.halfZ - r); v.z *= -0.3; v.y *= 0.6; v.x *= 0.6;
    if (ev) ev.push({ type: 'barrier', x: p.x, y: p.y, z: p.z, vn: Math.abs(v.z) / 0.3 });
  }
  if (lim(p.x, v.x, R.wallX)) { p.x = Math.sign(p.x) * (R.wallX - r); v.x *= -0.5; if (ev) ev.push({ type: 'wall', x: p.x, y: p.y, z: p.z, vn: Math.abs(v.x) * 2 }); }
  if (lim(p.z, v.z, R.wallZ)) { p.z = Math.sign(p.z) * (R.wallZ - r); v.z *= -0.5; if (ev) ev.push({ type: 'wall', x: p.x, y: p.y, z: p.z, vn: Math.abs(v.z) * 2 }); }
  if (p.y > R.ceiling - r && v.y > 0) { p.y = R.ceiling - r; v.y *= -0.4; }
}

function startRolling(b, y) {
  b.rolling = y; b.v.y = 0; b.p.y = y;
}

// rolling on the table or the floor: rolling resistance; it falls off the table's edge
function roll(b, h, ev) {
  const p = b.p, v = b.v, w = b.w;
  const s = Math.hypot(v.x, v.z);
  const dec = (b.rolling > 0.5 ? 0.25 : 0.4) * h;
  if (s <= dec) {
    v.x = v.z = 0; b.stopped = true;
    if (ev) ev.push({ type: 'stop', x: p.x, y: p.y, z: p.z });
    return;
  }
  v.x *= 1 - dec / s; v.z *= 1 - dec / s;
  p.x += v.x * h; p.z += v.z * h;
  w.x = v.z / BALL_R; w.y = 0; w.z = -v.x / BALL_R;
  if (b.rolling > 0.5) {
    // on the table: off the edge, or into the net
    if (Math.abs(p.x) > TABLE.halfW || Math.abs(p.z) > TABLE.halfL) { b.rolling = -1; v.y = 0; }
    else if (Math.abs(p.z) < BALL_R + 0.001 && v.z * p.z < 0) { v.z = -v.z * 0.1; if (ev) ev.push({ type: 'net', cord: false, post: false, x: p.x, y: p.y, z: p.z }); }
  }
  floorAndWalls(b, ev);
}

/** where the ball is in flight over (or beside) the table: which half its centre is above */
export const halfOf = (z) => (z >= 0 ? 1 : -1);
/** is (x, z) on the playing surface (lines are part of it) */
export const onTable = (x, z) => Math.abs(x) <= TABLE.halfW && Math.abs(z) <= TABLE.halfL;

/**
 * Restitution and friction of a paddle face by rubber type. e0: apparent COR at low impact speed for an
 * offensive blade ("OFF"); it drops with impact speed as the sponge bottoms out. mu: rubber–ball friction.
 * et: tangential restitution (the top sheet springs back). Values follow lab measurements of rubbers:
 * inverted (smooth) rubbers grip (μ ≈ 1) and give the most spin; short pips less; long pips and anti
 * barely grip, so the ball keeps its own spin (and the opponent's backspin comes back as topspin).
 */
export const RUBBERS = {
  inverted: { name: '裏ソフト（テンション）', e0: 0.89, ek: 0.0075, mu: 1.0, et: 0.38 },
  tacky: { name: '裏ソフト（粘着）', e0: 0.84, ek: 0.0075, mu: 1.25, et: 0.42 },
  short: { name: '表ソフト', e0: 0.88, ek: 0.0065, mu: 0.62, et: 0.16 },
  long: { name: '粒高', e0: 0.76, ek: 0.0080, mu: 0.10, et: 0.0 },
  anti: { name: 'アンチ', e0: 0.72, ek: 0.0080, mu: 0.05, et: 0.0 },
};
export const BLADES = { all: -0.045, offm: -0.02, off: 0, offp: 0.018 };
export const EDGE_HIT = { e: 0.42, mu: 0.25, et: 0 };

/** apparent COR of a rubber at normal impact speed un (m/s) on blade class `blade` */
export function rubberCOR(rub, un, blade = 'off') {
  const e = rub.e0 + (BLADES[blade] || 0) - rub.ek * Math.max(0, Math.abs(un) - 2);
  return Math.max(0.5, Math.min(0.93, e));
}
