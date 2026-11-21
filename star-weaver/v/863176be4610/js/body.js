// body.js — the player's measured proportions and where comfortable reach targets are.
// Stage-local frame: x right, y up from the floor, -z forward; the player stands at x = lane, z = 0.
import * as THREE from 'three';
import { DEG, clamp } from './util.js';

export const STEP_WIDTH = { small: 0.32, mid: 0.45, large: 0.6 };
export const SQUAT_DEPTH = { off: 0, shallow: 0.1, normal: 0.17 };

export class Body {
  constructor() {
    this.eyeY = 1.58;     // eye height in the current stance
    this.standEyeY = 1.58;
    this.stature = 1.7;
    this.gripSpan = 0;    // distance between both grips in a T pose (0 = not measured)
    this.seated = false;
    this.backCare = false;
    this.recompute();
  }

  // stance: 'stand' | 'sit'
  configure({ eyeY, stature, gripSpan, seated, backCare }) {
    if (eyeY) this.eyeY = eyeY;
    if (stature) this.stature = stature;
    if (gripSpan !== undefined) this.gripSpan = gripSpan;
    if (seated !== undefined) this.seated = seated;
    if (backCare !== undefined) this.backCare = backCare;
    if (!this.seated) this.standEyeY = this.eyeY;
    this.recompute();
  }

  recompute() {
    const H = clamp(this.stature, 1.3, 2.1);
    this.shoulderHalf = 0.1 * H;                       // shoulder joint distance from the body midline
    this.shoulderY = this.eyeY - 0.118 * H;
    const measured = this.gripSpan > 0.9 ? this.gripSpan / 2 - this.shoulderHalf : 0;
    this.reach = clamp(measured || 0.33 * H, 0.42, 0.78); // shoulder joint → grip centre
  }

  shoulder(side, out = new THREE.Vector3()) {
    return out.set(side * this.shoulderHalf, this.shoulderY, 0.02);
  }

  // a point at `frac` of arm reach from a shoulder. az: degrees outward from forward (negative = across the body),
  // el: degrees up from horizontal. side: -1 left, +1 right
  reachPoint(side, az, el, frac, out = new THREE.Vector3()) {
    const r = this.reach * frac;
    const a = az * DEG, e = el * DEG;
    this.shoulder(side, out);
    out.x += side * Math.sin(a) * Math.cos(e) * r;
    out.y += Math.sin(e) * r;
    out.z += -Math.cos(a) * Math.cos(e) * r;
    return out;
  }

  // named target positions used by the chart. Kept above the waist and in front of the body:
  // no deep forward bends (back-friendly) and no reaching behind you where you cannot see.
  target(name, side, out = new THREE.Vector3()) {
    const bc = this.backCare;
    switch (name) {
      case 'front': return this.reachPoint(side, -8, 2, 0.84, out);
      case 'high': return this.reachPoint(side, 8, 68, 0.88, out);
      case 'y': return this.reachPoint(side, 38, 44, 0.9, out);
      case 'wide': return this.reachPoint(side, 50, 6, 0.88, out);
      case 'low': return this.reachPoint(side, 32, bc ? -22 : -30, 0.82, out);
      case 'cross': return this.reachPoint(side, bc ? -32 : -44, 4, 0.8, out);
      case 'top': return out.set(0, this.shoulderY + this.reach * 0.86, -this.reach * 0.32);
      default: return this.reachPoint(side, 0, 0, 0.8, out);
    }
  }

  // hand positions for the held poses (both hands unless noted)
  pose(name, side, out = new THREE.Vector3()) {
    switch (name) {
      case 'wing': return this.reachPoint(side, 84, 4, 0.92, out);            // arms open wide: chest opener
      case 'sky': return this.reachPoint(side, 30, 58, 0.92, out);            // Y raise
      case 'crown': return out.set(side * 0.09, this.shoulderY + this.reach * 0.92, -0.12); // overhead stretch
      case 'cross': return out.set(-side * (this.shoulderHalf + 0.12), this.shoulderY - 0.02, -0.22); // cross-body stretch
      case 'bend': return out.set(-0.26 + side * 0.07, this.shoulderY + this.reach * 0.82, -0.12);  // lean left (mirrored by caller)
      default: return this.reachPoint(side, 0, 0, 0.8, out);
    }
  }
}
