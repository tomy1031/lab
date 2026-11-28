// js/track/spline.js — Closed 3D Catmull-Rom racing spline with arc-length lookup, banking, width & curvature
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class TrackSpline {
  constructor(course, sampleCount = 600) {
    this.course = course;
    this.N = sampleCount;
    const pts = course.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.45);

    const banks = course.points.map((p) => p[3] || 0);
    const wScales = course.points.map((p) => p[4] || 1.0);
    const M = course.points.length;

    // Sample evenly in arc length
    const rawPts = this.curve.getSpacedPoints(this.N);
    this.samples = [];
    let totalLen = 0;

    for (let i = 0; i < this.N; i++) {
      const p = rawPts[i].clone();
      const prev = rawPts[(i - 1 + this.N) % this.N];
      const next = rawPts[(i + 1) % this.N];
      if (i > 0) totalLen += p.distanceTo(prev);

      const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
      const flatRight = new THREE.Vector3().crossVectors(tangent, UP).normalize();
      if (flatRight.lengthSq() < 0.001) flatRight.set(1, 0, 0);

      // Interpolate banking & width smoothly around the closed loop
      const u = (i / this.N) * M;
      const idx0 = Math.floor(u) % M;
      const idx1 = (idx0 + 1) % M;
      const frac = u - Math.floor(u);
      const smooth = frac * frac * (3 - 2 * frac);
      const bank = banks[idx0] * (1 - smooth) + banks[idx1] * smooth;
      const width = course.roadWidth * (wScales[idx0] * (1 - smooth) + wScales[idx1] * smooth);

      // Apply banking around tangent
      const right = flatRight.clone().applyAxisAngle(tangent, bank).normalize();
      const normal = new THREE.Vector3().crossVectors(right, tangent).normalize();

      this.samples.push({
        index: i,
        s: totalLen,
        pos: p,
        tangent,
        right,
        normal,
        bank,
        width,
        curvature: 0,
      });
    }

    this.length = totalLen + rawPts[this.N - 1].distanceTo(rawPts[0]);

    // Compute signed horizontal curvature (rad/m) for AI corner braking & corner signage
    for (let i = 0; i < this.N; i++) {
      const prev = this.samples[(i - 3 + this.N) % this.N];
      const curr = this.samples[i];
      const next = this.samples[(i + 3) % this.N];
      const t1 = prev.tangent;
      const t2 = next.tangent;
      const ds = Math.max(1, (this.length / this.N) * 6);
      const crossY = t1.z * t2.x - t1.x * t2.z; // + when turning right
      curr.curvature = crossY / ds;
    }

    // Bounding box for minimap
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const smp of this.samples) {
      if (smp.pos.x < minX) minX = smp.pos.x;
      if (smp.pos.x > maxX) maxX = smp.pos.x;
      if (smp.pos.z < minZ) minZ = smp.pos.z;
      if (smp.pos.z > maxZ) maxZ = smp.pos.z;
    }
    this.bounds = { minX, maxX, minZ, maxZ, w: maxX - minX, h: maxZ - minZ };
  }

  wrapS(s) {
    let r = s % this.length;
    if (r < 0) r += this.length;
    return r;
  }

  // Sample interpolated frame at arc-length distance s
  sampleAt(s, out = null) {
    const ws = this.wrapS(s);
    const fIdx = (ws / this.length) * this.N;
    const i0 = Math.floor(fIdx) % this.N;
    const i1 = (i0 + 1) % this.N;
    const t = fIdx - Math.floor(fIdx);
    const a = this.samples[i0];
    const b = this.samples[i1];

    const res = out || {
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      right: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      width: 16,
      bank: 0,
      curvature: 0,
      s: ws,
    };
    res.pos.lerpVectors(a.pos, b.pos, t);
    res.tangent.lerpVectors(a.tangent, b.tangent, t).normalize();
    res.right.lerpVectors(a.right, b.right, t).normalize();
    res.normal.lerpVectors(a.normal, b.normal, t).normalize();
    res.width = a.width + (b.width - a.width) * t;
    res.bank = a.bank + (b.bank - a.bank) * t;
    res.curvature = a.curvature + (b.curvature - a.curvature) * t;
    res.s = ws;
    return res;
  }

  // World position at (s, lateralOffset d, heightOffset h)
  worldPos(s, d = 0, h = 0, out = new THREE.Vector3()) {
    const f = this.sampleAt(s);
    out.copy(f.pos).addScaledVector(f.right, d).addScaledVector(f.normal, h);
    return out;
  }

  // Project arbitrary 3D point onto closest spline sample (uses optional hintS for O(1) tracking)
  project(pos, hintS = null) {
    let bestI = 0;
    let bestD2 = Infinity;

    if (hintS !== null) {
      const center = Math.floor((this.wrapS(hintS) / this.length) * this.N);
      const windowSize = 26;
      for (let k = -windowSize; k <= windowSize; k++) {
        const i = (center + k + this.N) % this.N;
        const p = this.samples[i].pos;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const dy = (pos.y - p.y) * 0.4;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestI = i;
        }
      }
    }

    // Fallback global search if far from hint
    if (bestD2 > 1400) {
      for (let i = 0; i < this.N; i++) {
        const p = this.samples[i].pos;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestI = i;
        }
      }
    }

    const smp = this.samples[bestI];
    const diff = new THREE.Vector3().subVectors(pos, smp.pos);
    const along = diff.dot(smp.tangent);
    const s = this.wrapS(smp.s + along);
    const frame = this.sampleAt(s);
    const rel = new THREE.Vector3().subVectors(pos, frame.pos);
    const lateral = rel.dot(frame.right);
    const height = rel.dot(frame.normal);

    return { s, lateral, height, frame };
  }
}
