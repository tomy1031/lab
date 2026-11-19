// js/arm.js — arms and hands: shaped upper arm and forearm (deltoid, biceps, forearm taper), elbow, short sleeve,
// wristband, and a hand with a palm, three-jointed fingers and a thumb in a few poses (gripping the racket,
// holding a ball, open after the toss, relaxed, cradling the throat). Two-bone IK from the shoulder to the wrist.
//
// The hand's frame is the WebXR grip space (so the VR hand sits exactly on the controller): the origin is the
// centre of the curled fingers, a rod held in the fist runs along −Z toward the thumb, +Y points up the forearm
// toward the elbow, and the back of the right hand faces +X (the back of the left hand faces −X; the left hand
// is the mirror image).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** wrist point in the right hand's frame (the forearm ends here) */
export const WRIST = new THREE.Vector3(0.03, 0.088, -0.006);
/** where a held ball sits in the right hand's frame */
export const BALL_IN_HAND = new THREE.Vector3(-0.022, -0.03, 0.002);
/** the angle between the racket and the forearm line for a tennis grip (the handle lies diagonally in the palm) */
export const GRIP_ANGLE = 55;

const D2R = Math.PI / 180;

// finger table (right hand): MCP knuckle position, phalanx lengths, radius
const FINGERS = [
  { name: 'index', base: [0.024, -0.031, -0.029], len: [0.041, 0.024, 0.02], r: 0.0092, splay: -6 },
  { name: 'middle', base: [0.026, -0.034, -0.009], len: [0.045, 0.027, 0.021], r: 0.0095, splay: -1 },
  { name: 'ring', base: [0.025, -0.032, 0.01], len: [0.042, 0.026, 0.02], r: 0.009, splay: 4 },
  { name: 'pinky', base: [0.022, -0.026, 0.027], len: [0.033, 0.02, 0.018], r: 0.0078, splay: 9 },
];
// curl angles (MCP, PIP, DIP in degrees, toward the palm) per pose, and the thumb's joints (explicit points)
const POSES = {
  grip: {
    curl: [[72, 88, 48], [74, 90, 48], [76, 90, 48], [80, 92, 50]],
    thumb: [[0.022, 0.032, -0.03], [0.004, 0.006, -0.046], [-0.018, -0.006, -0.042], [-0.032, -0.012, -0.03]],
  },
  ball: {
    curl: [[30, 42, 26], [28, 40, 24], [30, 42, 26], [34, 44, 28]],
    thumb: [[0.022, 0.032, -0.03], [0.002, 0.004, -0.05], [-0.024, -0.012, -0.048], [-0.042, -0.026, -0.036]],
  },
  open: {
    curl: [[6, 10, 6], [4, 8, 5], [6, 10, 6], [8, 12, 8]],
    thumb: [[0.022, 0.032, -0.03], [0.01, 0.0, -0.058], [0.0, -0.022, -0.078], [-0.006, -0.04, -0.092]],
  },
  relaxed: {
    curl: [[24, 34, 20], [26, 36, 22], [30, 40, 24], [34, 44, 26]],
    thumb: [[0.022, 0.032, -0.03], [0.004, 0.0, -0.052], [-0.012, -0.018, -0.058], [-0.022, -0.032, -0.056]],
  },
  throat: {
    curl: [[40, 55, 30], [42, 56, 30], [46, 58, 32], [50, 60, 34]],
    thumb: [[0.022, 0.032, -0.03], [0.002, 0.002, -0.05], [-0.02, -0.014, -0.05], [-0.034, -0.024, -0.04]],
  },
};

function capsuleBetween(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(1e-4, d.length());
  const g = new THREE.CapsuleGeometry(r, len, 3, 8);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

const geoCache = new Map();
/** merged geometry of a hand in a pose ('grip' | 'ball' | 'open' | 'relaxed' | 'throat'); side 'R' or 'L' */
export function handGeometry(pose = 'relaxed', side = 'R') {
  const key = pose + side;
  if (geoCache.has(key)) return geoCache.get(key);
  const P = POSES[pose] || POSES.relaxed;
  const parts = [];
  // palm: a rounded block between the knuckles and the wrist, a little thicker on the little-finger side
  const palm = new RoundedBoxGeometry(0.028, 0.092, 0.082, 3, 0.011);
  palm.translate(0.031, 0.01, -0.001);
  parts.push(palm);
  const heel = new THREE.SphereGeometry(0.02, 10, 8);       // the thenar pad at the base of the thumb
  heel.scale(0.9, 1.3, 1);
  heel.translate(0.02, 0.035, -0.024);
  parts.push(heel);
  // fingers
  FINGERS.forEach((f, i) => {
    const [m, p, d] = P.curl[i];
    let pos = new THREE.Vector3(...f.base);
    // extended fingers point along −Y; splay turns them toward ±Z; curling turns them toward −X (the palm side)
    const splay = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), f.splay * D2R * (pose === 'open' ? 1.6 : 1));
    let ang = 0;
    const radii = [f.r, f.r * 0.92, f.r * 0.84];
    [m, p, d].forEach((a, k) => {
      ang += a;
      const dir = new THREE.Vector3(-Math.sin(ang * D2R), -Math.cos(ang * D2R), 0).applyQuaternion(splay);
      const next = pos.clone().addScaledVector(dir, f.len[k]);
      parts.push(capsuleBetween(pos, next, radii[k]));
      pos = next;
    });
    // knuckle
    const kn = new THREE.SphereGeometry(f.r * 1.08, 8, 6);
    kn.translate(...f.base);
    parts.push(kn);
  });
  // thumb
  const T = P.thumb.map((p) => new THREE.Vector3(...p));
  const tr = [0.0125, 0.0105, 0.0095];
  for (let k = 0; k < 3; k++) parts.push(capsuleBetween(T[k], T[k + 1], tr[k]));
  let g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
  if (side === 'L') {
    // mirror: x → −x and flip the triangles' winding
    g.scale(-1, 1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      for (const attr of [g.attributes.position, g.attributes.normal]) {
        const ax = attr.getX(i + 1), ay = attr.getY(i + 1), az = attr.getZ(i + 1);
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, ax, ay, az);
      }
    }
    // normals: scale(-1) already flipped the x component of the normals
  }
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

/** a profile turned around +Y from 0 (proximal) to 1 (distal); radii in metres */
function limb(profile, segs = 14) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs);
  return g;
}
const UPPER = [[-0.03, 0.0], [-0.022, 0.03], [0.0, 0.05], [0.12, 0.054], [0.3, 0.049], [0.55, 0.046], [0.8, 0.04], [0.96, 0.035], [1.02, 0.02], [1.04, 0.0]];
const FORE = [[-0.04, 0.0], [-0.03, 0.026], [0.0, 0.037], [0.12, 0.041], [0.35, 0.037], [0.62, 0.03], [0.88, 0.025], [1.0, 0.024], [1.03, 0.0]];
const SLEEVE = [[-0.04, 0.0], [-0.03, 0.04], [0.0, 0.06], [0.2, 0.062], [0.45, 0.058], [0.5, 0.058]];

const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3();

/** place a unit-length (+Y) limb geometry from a to b */
function placeLimb(mesh, a, b, scaleR = 1) {
  _d.subVectors(b, a);
  const len = _d.length();
  mesh.position.copy(a);
  mesh.scale.set(scaleR, len, scaleR);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
}

/**
 * Two-bone IK. s: shoulder, t: wrist target, l1/l2: upper arm / forearm, pole: direction the elbow should point.
 * If the target is out of reach the shoulder is drawn toward it (up to `give` metres) and then the arm is straight.
 * Writes outShoulder, outElbow, outWrist.
 */
export function solveArm(s, t, l1, l2, pole, outS, outE, outW, give = 0.1) {
  outS.copy(s);
  _d.subVectors(t, s);
  let dist = _d.length();
  const maxR = (l1 + l2) * 0.998;
  if (dist > maxR) {
    const shift = Math.min(give, dist - maxR);
    outS.addScaledVector(_d, shift / dist);
    _d.subVectors(t, outS); dist = _d.length();
    if (dist > maxR) { _d.multiplyScalar(maxR / dist); dist = maxR; }
  }
  const minR = Math.abs(l1 - l2) + 0.02;
  if (dist < minR) { _d.multiplyScalar(minR / Math.max(dist, 1e-6)); dist = minR; }
  outW.copy(outS).add(_d);
  const dir = _e.copy(_d).normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = _s.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, -1, 0).addScaledVector(dir, dir.y);
  p.normalize();
  outE.copy(outS).addScaledVector(dir, a).addScaledVector(p, h);
}

export class Arm {
  /** side 'R' | 'L'; opt: { skin, sleeve, band, scale, shadows } */
  constructor(side = 'R', opt = {}) {
    this.side = side;
    this.k = opt.scale || 1;
    const skin = opt.skinMat || new THREE.MeshStandardMaterial({ color: opt.skin ?? 0xd59f7c, roughness: 0.55 });
    const sleeve = opt.sleeveMat || new THREE.MeshStandardMaterial({ color: opt.sleeve ?? 0xf4f4f4, roughness: 0.82 });
    const band = new THREE.MeshStandardMaterial({ color: opt.band ?? 0xffffff, roughness: 0.9 });
    this.group = new THREE.Group();
    this.upper = new THREE.Mesh(limb(UPPER), skin);
    this.sleeve = new THREE.Mesh(limb(SLEEVE), sleeve);
    this.shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 10), sleeve);
    this.fore = new THREE.Mesh(limb(FORE), skin);
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), skin);
    const bg = new THREE.CylinderGeometry(0.029, 0.031, 0.05, 16, 1, true);
    this.band = new THREE.Mesh(bg, band);
    this.band.material.side = THREE.DoubleSide;
    this.hand = new THREE.Mesh(handGeometry('relaxed', side), skin);
    this.pose = 'relaxed';
    for (const m of [this.upper, this.sleeve, this.shoulderCap, this.fore, this.elbow, this.band, this.hand]) {
      m.castShadow = opt.shadows !== false;
      this.group.add(m);
    }
    this.sleeve.visible = opt.sleeveOn !== false;
    this.shoulderCap.visible = opt.shoulderCap !== false;
    this.S = new THREE.Vector3(); this.E = new THREE.Vector3(); this.W = new THREE.Vector3();
    this.wristLocal = WRIST.clone(); if (side === 'L') this.wristLocal.x *= -1;
    this.ballLocal = BALL_IN_HAND.clone(); if (side === 'L') this.ballLocal.x *= -1;
  }
  get l1() { return 0.3 * this.k; }
  get l2() { return 0.265 * this.k; }
  setHandPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.hand.geometry = handGeometry(pose, this.side);
  }
  /** where a ball held in this hand is (world), for the current hand transform */
  ballPoint(out) { return out.copy(this.ballLocal).applyQuaternion(this.hand.quaternion).add(this.hand.position); }

  /**
   * Pose the arm: the hand's grip frame at (handPos, handQuat), the shoulder at `shoulder`, the elbow toward `pole`.
   * All in the arm group's parent space.
   */
  setPose(shoulder, handPos, handQuat, pole, handPose) {
    if (handPose) this.setHandPose(handPose);
    this.hand.position.copy(handPos);
    this.hand.quaternion.copy(handQuat);
    _w.copy(this.wristLocal).applyQuaternion(handQuat).add(handPos);
    solveArm(shoulder, _w, this.l1, this.l2, pole, this.S, this.E, this.W, 0.14);
    // if the arm could not reach, the hand stays on its grip (the racket matters more); the forearm ends at W
    placeLimb(this.upper, this.S, this.E, this.k);
    placeLimb(this.sleeve, this.S, this.E, this.k);
    placeLimb(this.fore, this.E, _w, this.k);
    this.elbow.position.copy(this.E); this.elbow.scale.setScalar(this.k);
    this.shoulderCap.position.copy(this.S); this.shoulderCap.scale.setScalar(this.k);
    // wristband just above the wrist, along the forearm
    _d.subVectors(_w, this.E);
    const len = _d.length();
    this.band.position.copy(this.E).addScaledVector(_d, (len - 0.04) / len);
    this.band.quaternion.setFromUnitVectors(UP, _d.normalize());
    this.band.scale.setScalar(this.k);
  }
}

/**
 * The racket's rotation in a hand's grip frame: the shaft at `angle` degrees from the forearm line toward the
 * fist's rod (90° = held like a hammer), the strings' +Z normal on the palm side, turned by `roll` about the shaft
 * (+ opens the palm-side face). side 'R' | 'L'.
 */
export function racketMount(side = 'R', angle = GRIP_ANGLE, roll = 0) {
  const A = angle * D2R;
  const y = new THREE.Vector3(0, -Math.cos(A), -Math.sin(A));
  const z = new THREE.Vector3(side === 'L' ? 1 : -1, 0, 0);       // the palm side
  const x = new THREE.Vector3().crossVectors(y, z);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const r = new THREE.Quaternion().setFromAxisAngle(y, (side === 'L' ? -roll : roll) * D2R);
  return r.multiply(q);
}
