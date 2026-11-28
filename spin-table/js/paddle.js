// js/paddle.js — the paddle (racket) as a physical body: the blade's real outline, the swept test of the ball
// against the moving paddle between two tracked frames, and the impact (rubber, sweet spot, edge, twist).
// Uses three.js maths only (no rendering), so the node tests run it too. The mesh is in paddlemesh.js.
//
// Paddle frame (local): origin = the middle of the hand on the handle, +Y along the handle toward the head,
// +Z = the forehand face's normal, +X across the face (X = Y × Z).
// A typical shakehand blade: head 150 mm wide × 157 mm long, 257 mm overall, 5.8 mm thick; the rubbers
// (sponge 2.1 mm + top sheet) are 4.0 mm each (the ITTF maximum), so the face is 13.8 mm thick in all.
import * as THREE from 'three';
import { BALL_R, BALL_M, contact, rubberCOR, RUBBERS, EDGE_HIT } from './physics.js';

export const BLADE = {
  b: 0.075,             // head half-width
  a: 0.0785,            // head half-length
  yc: 0.118,            // head centre above the hand
  n: 2.45,              // superellipse exponent (a rounded square-ish head)
  egg: 0.035,           // the head is a little wider toward the tip
  bladeT: 0.0058,
  rubberT: 0.0040,
  shoulderY: 0.045,     // where the handle meets the blade
  butt: -0.062,         // end of the handle
  sweetY: -0.012,       // the sweet spot sits a little toward the handle from the head centre
};
export const HALF_T = BLADE.bladeT / 2 + BLADE.rubberT;

/** point on the head outline at angle t (0 = tip, π/2 = +x side), inflated by `grow` (m) */
export function headPoint(t, grow = 0, out = { x: 0, y: 0 }) {
  const B = BLADE, e = 2 / B.n;
  const c = Math.cos(t), s = Math.sin(t);
  const ya = Math.sign(c) * Math.pow(Math.abs(c), e);
  const xa = Math.sign(s) * Math.pow(Math.abs(s), e);
  const egg = 1 + B.egg * ya;
  out.x = xa * (B.b + grow) * egg;
  out.y = B.yc + ya * (B.a + grow);
  return out;
}

/** normalised "radius" of an in-plane point against the head outline shrunk by `shrink` (1 = on it) */
export function headRho(x, y, shrink = 0) {
  const B = BLADE;
  const dy = y - B.yc;
  const egg = 1 + B.egg * Math.max(-1, Math.min(1, dy / B.a));
  const rx = Math.abs(x) / ((B.b - shrink) * egg), ry = Math.abs(dy) / (B.a - shrink);
  return Math.pow(Math.pow(rx, B.n) + Math.pow(ry, B.n), 1 / B.n);
}

/**
 * Distance from a local point to the paddle head (a slab with a fully rounded edge), and the surface normal.
 * Returns out = { d (surface distance, < 0 inside), nx, ny, nz, rho (in-plane), edge (true on the rim) }.
 */
export function headDistance(x, y, z, out) {
  const rho = headRho(x, y, HALF_T);
  if (rho <= 1) {
    out.d = Math.abs(z) - HALF_T;
    out.nx = 0; out.ny = 0; out.nz = z >= 0 ? 1 : -1;
    out.edge = false;
  } else {
    const px = x / rho, py = BLADE.yc + (y - BLADE.yc) / rho;
    const ex = x - px, ey = y - py;
    const dist = Math.hypot(ex, ey, z) || 1e-9;
    out.d = dist - HALF_T;
    out.nx = ex / dist; out.ny = ey / dist; out.nz = z / dist;
    out.edge = Math.abs(out.nz) < 0.72;
  }
  out.rho = headRho(x, y, 0);
  return out;
}

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _qi = new THREE.Quaternion();
const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const _w0 = new THREE.Vector3(), _w1 = new THREE.Vector3(), _loc = new THREE.Vector3(), _bp = new THREE.Vector3();
const _hd = { d: 0, nx: 0, ny: 0, nz: 1, rho: 0, edge: false };
const _hc = new THREE.Vector3();

/**
 * A paddle in the world whose pose is given once per rendered frame. Between the previous and the current
 * frame its pose is interpolated (position lerp, rotation slerp) for the swept test, and its velocity at any
 * point of the face is that point's motion over the frame (rotation included).
 */
export class PaddleBody {
  constructor(opts = {}) {
    this.p0 = new THREE.Vector3(); this.q0 = new THREE.Quaternion();
    this.p1 = new THREE.Vector3(); this.q1 = new THREE.Quaternion();
    this.dt = 1 / 72;
    this.valid = false;
    this.enabled = true;
    this.cooldown = 0;
    this.fh = opts.fh || 'inverted';
    this.bh = opts.bh || 'inverted';
    this.blade = opts.blade || 'off';
  }
  setPose(p, q, dt) {
    if (!this.valid) { this.p0.copy(p); this.q0.copy(q); this.valid = true; }
    else { this.p0.copy(this.p1); this.q0.copy(this.q1); }
    this.p1.copy(p); this.q1.copy(q);
    this.dt = Math.max(1 / 500, dt);
  }
  teleport(p, q) { this.p0.copy(p); this.q0.copy(q); this.p1.copy(p); this.q1.copy(q); this.valid = true; }
  poseAt(a, outP, outQ) {
    outP.lerpVectors(this.p0, this.p1, a);
    outQ.slerpQuaternions(this.q0, this.q1, a);
  }
  /** world velocity of a local point over the last frame */
  pointVelocity(local, out) {
    _m0.compose(this.p0, this.q0, _one); _m1.compose(this.p1, this.q1, _one);
    _w0.copy(local).applyMatrix4(_m0); _w1.copy(local).applyMatrix4(_m1);
    return out.subVectors(_w1, _w0).divideScalar(this.dt);
  }
  /** head speed (m/s) at the sweet spot */
  headSpeed() {
    return this.pointVelocity(_hc.set(0, BLADE.yc + BLADE.sweetY, 0), _w0.clone()).length();
  }
  // ball position bp (world) in the paddle frame at frame fraction a → surface distance minus the ball radius
  gap(a, bp, out) {
    this.poseAt(a, _p, _q);
    _qi.copy(_q).invert();
    _loc.copy(bp).sub(_p).applyQuaternion(_qi);
    headDistance(_loc.x, _loc.y, _loc.z, out);
    out.lx = _loc.x; out.ly = _loc.y; out.lz = _loc.z;
    return out.d - BALL_R;
  }

  /**
   * Swept test of the ball moving b0 → b1 (world, over one physics step) while the paddle moves from frame
   * fraction a0 to a1. Returns null or { s (fraction of the step), a (frame fraction), lx, ly, lz, nx, ny, nz
   * (local normal), edge, rho }.
   */
  sweep(b0, b1, a0, a1) {
    if (!this.valid || !this.enabled || this.cooldown > 0) return null;
    // quick reject: the ball far from the head at both ends
    this.poseAt(a0, _p, _q);
    _hc.set(0, BLADE.yc, 0).applyQuaternion(_q).add(_p);
    const reach = 0.12 + BALL_R + this.p0.distanceTo(this.p1) * Math.abs(a1 - a0) + b0.distanceTo(b1) + 0.05;
    if (b0.distanceTo(_hc) > reach && b1.distanceTo(_hc) > reach) return null;
    // relative motion over the step decides how finely to sample (contact zone is 2·(r + h) ≈ 54 mm thick)
    this.poseAt(a1, _w1, _qi);
    const move = b0.distanceTo(b1) + _hc.distanceTo(_w0.set(0, BLADE.yc, 0).applyQuaternion(_qi).add(_w1)) + 0.25 * _q.angleTo(_qi);
    const K = Math.min(24, Math.max(2, Math.ceil(move / 0.008)));
    const at = (s) => _bp.lerpVectors(b0, b1, s);
    let g0 = this.gap(a0, at(0), _hd);
    if (g0 <= 0) {
      // already touching at the start: only if they are closing
      return { s: 0, a: a0, lx: _hd.lx, ly: _hd.ly, lz: _hd.lz, nx: _hd.nx, ny: _hd.ny, nz: _hd.nz, edge: _hd.edge, rho: _hd.rho, start: true };
    }
    let sPrev = 0;
    for (let k = 1; k <= K; k++) {
      const s = k / K;
      const g = this.gap(a0 + (a1 - a0) * s, at(s), _hd);
      if (g <= 0) {
        let lo = sPrev, hi = s;
        for (let i = 0; i < 16; i++) {
          const m = (lo + hi) / 2;
          if (this.gap(a0 + (a1 - a0) * m, at(m), _hd) > 0) lo = m; else hi = m;
        }
        this.gap(a0 + (a1 - a0) * hi, at(hi), _hd);
        return { s: hi, a: a0 + (a1 - a0) * hi, lx: _hd.lx, ly: _hd.ly, lz: _hd.lz, nx: _hd.nx, ny: _hd.ny, nz: _hd.nz, edge: _hd.edge, rho: _hd.rho };
      }
      sPrev = s;
    }
    return null;
  }

  /**
   * Apply the impact found by sweep() to `ball` (its position already at the contact). Returns what the
   * player feels and hears: { un (normal impact speed), speedIn, speedOut, paddleSpeed, face ('fh' | 'bh' |
   * 'edge'), sweet (0…1), offX, offY, rubber } or null if the ball and the paddle were separating.
   */
  impact(ball, hit) {
    this.poseAt(hit.a, _p, _q);
    const local = new THREE.Vector3(hit.lx, hit.ly, Math.sign(hit.lz || 1) * HALF_T);
    if (hit.edge) local.set(hit.lx - hit.nx * BALL_R, hit.ly - hit.ny * BALL_R, hit.lz - hit.nz * BALL_R);
    const vp = this.pointVelocity(local, new THREE.Vector3());
    const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz).applyQuaternion(_q).normalize();
    const vin = Math.hypot(ball.v.x, ball.v.y, ball.v.z);
    const un = (ball.v.x - vp.x) * n.x + (ball.v.y - vp.y) * n.y + (ball.v.z - vp.z) * n.z;
    if (un >= 0) return null;
    // where on the face, relative to the sweet spot
    const sx = hit.lx / BLADE.b, sy = (hit.ly - BLADE.yc - BLADE.sweetY) / BLADE.a;
    let e, mu, et, mr, rubKey = null, face;
    if (hit.edge) {
      ({ e, mu, et } = EDGE_HIT);
      mr = BALL_M / 0.05;
      face = 'edge';
    } else {
      face = hit.nz > 0 ? 'fh' : 'bh';
      rubKey = face === 'fh' ? this.fh : this.bh;
      const rub = RUBBERS[rubKey] || RUBBERS.inverted;
      const loc = Math.max(0.55, 1 - 0.16 * sx * sx - 0.22 * Math.max(0, sy) ** 2 - 0.12 * Math.min(0, sy) ** 2);
      e = rubberCOR(rub, un, this.blade) * loc;
      mu = rub.mu; et = rub.et;
      // effective mass of a hand-held paddle at the impact point (it turns about the handle and the wrist)
      const xh = hit.lx, yh = hit.ly;
      const meff = 1 / (1 / 0.30 + (xh * xh) / 3.0e-4 + (yh * yh) / 2.2e-3);
      mr = BALL_M / meff;
      // an off-centre hit twists the paddle in the hand: the face turns toward the side that was hit
      const tw = 0.0045 * Math.abs(un) * sx;
      const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
      n.addScaledVector(ax, tw).normalize();
    }
    contact(ball, n, vp, e, mu, et, mr);
    this.cooldown = 0.07;
    const sweet = hit.edge ? 0 : Math.max(0, 1 - Math.hypot(sx * 1.1, sy));
    return {
      un: -un, speedIn: vin, speedOut: Math.hypot(ball.v.x, ball.v.y, ball.v.z), paddleSpeed: vp.length(),
      face, sweet, offX: sx, offY: sy, rubber: rubKey, normal: n,
    };
  }
}
