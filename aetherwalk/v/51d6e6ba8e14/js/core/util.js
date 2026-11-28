// js/core/util.js — small math helpers (OPUS-A). Nothing here allocates per call unless noted.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** EMA factor for time constant tau over dt (frame-rate independent). */
export const ema = (tau, dt) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));
/** wrap an angle to (-π, π] */
export function wrapPi(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export const wrapDeg360 = (d) => ((d % 360) + 360) % 360;

/** piecewise-linear lookup in a sorted [[x, y], …] table (clamped at both ends) */
export function piecewise(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const b = table[i];
    if (x <= b[0]) {
      const a = table[i - 1];
      return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0]));
    }
  }
  return table[table.length - 1][1];
}

const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
/** yaw of a quaternion in the game convention: 0 = north (-Z), clockwise positive (radians) */
export function yawOfQuat(q) {
  _f.set(0, 0, -1).applyQuaternion(q);
  if (_f.x * _f.x + _f.z * _f.z < 0.02) {        // looking straight up/down: use the head's up vector
    _u.set(0, 1, 0).applyQuaternion(q);
    if (_f.y < 0) return Math.atan2(_u.x, -_u.z);
    return Math.atan2(-_u.x, _u.z);
  }
  return Math.atan2(_f.x, -_f.z);
}
export function pitchOfQuat(q) {
  _f.set(0, 0, -1).applyQuaternion(q);
  return Math.asin(clamp(_f.y, -1, 1));
}
/** direction vector of a yaw (game convention) */
export function yawDir(yaw, out) { return out.set(Math.sin(yaw), 0, -Math.cos(yaw)); }

/** closest point parameter t∈[0,1] on segment a→b to point p */
export function segmentClosestT(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = dx * dx + dy * dy + dz * dz;
  if (L < 1e-12) return 0;
  return clamp(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L, 0, 1);
}

/** first t∈[0,1] where a sphere of radius R around a point moving a→b touches center c (or -1) */
export function sweepSphereT(a, b, c, R) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const mx = a.x - c.x, my = a.y - c.y, mz = a.z - c.z;
  const cc = mx * mx + my * my + mz * mz - R * R;
  if (cc <= 0) return 0;                          // already inside
  const aa = dx * dx + dy * dy + dz * dz;
  if (aa < 1e-12) return -1;
  const bb = mx * dx + my * dy + mz * dz;
  if (bb > 0) return -1;                           // moving away
  const disc = bb * bb - aa * cc;
  if (disc < 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / aa;
  return t >= 0 && t <= 1 ? t : -1;
}

/** a ring buffer of samples (no allocation after construction) */
export class RingBuffer {
  constructor(n) { this.a = new Float64Array(n); this.n = n; this.i = 0; this.len = 0; }
  push(v) { this.a[this.i] = v; this.i = (this.i + 1) % this.n; if (this.len < this.n) this.len++; }
  /** k-th most recent (0 = newest) */
  get(k) { return this.a[(this.i - 1 - k + this.n * 2) % this.n]; }
  clear() { this.len = 0; this.i = 0; }
}

const _medianScratch = new Float64Array(16);
/** median of the newest k entries of a RingBuffer */
export function ringMedian(rb, k) {
  const n = Math.min(k, rb.len);
  if (!n) return 0;
  for (let i = 0; i < n; i++) _medianScratch[i] = rb.get(i);
  // insertion sort (n ≤ 16)
  for (let i = 1; i < n; i++) {
    const v = _medianScratch[i];
    let j = i - 1;
    while (j >= 0 && _medianScratch[j] > v) { _medianScratch[j + 1] = _medianScratch[j]; j--; }
    _medianScratch[j + 1] = v;
  }
  return n % 2 ? _medianScratch[(n - 1) >> 1] : 0.5 * (_medianScratch[n / 2 - 1] + _medianScratch[n / 2]);
}

export function errMsg(e) {
  if (!e) return String(e);
  if (e.stack && typeof e.stack === 'string') {
    const line = e.stack.split('\n').find((l) => /\.js/.test(l) && !/^\w*Error/.test(l));
    return `${e.message || e}${line ? ' @' + line.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '') : ''}`;
  }
  return String(e.message || e);
}
