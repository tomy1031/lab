// js/rider.js — the board under your feet, and an original low-poly rider (helmet, goggles, orange jacket)
// for the third-person view on a PC and for the ghost of your best run.
import * as THREE from 'three';
import { boardGeometry, merge, M } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);

// a cylinder "bone" between two points
function boneMesh(r0, r1, color, mat) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, 7);
  g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, mat || new THREE.MeshLambertMaterial({ color }));
  return m;
}
const _d = new THREE.Vector3();
function placeBone(m, a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, _d.normalize());
  m.scale.set(1, Math.max(0.001, len), 1);
}

export class Board {
  constructor(colors = {}) {
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(boardGeometry(colors.top, colors.base), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: !!colors.ghost, opacity: colors.ghost ? 0.4 : 1 }));
    this.group.add(this.mesh);
    this.q = new THREE.Quaternion();
    this.n = new THREE.Vector3(0, 1, 0);
  }
  // put the board on the snow at the rider: yaw, tilted with the slope, rolled onto its edge
  place(rider, edgeVisual = 1) {
    const p = rider.pos;
    this.group.position.set(p.x, p.y + 0.015, p.z);
    if (!rider.air) this.n.set(rider.normal.x, rider.normal.y, rider.normal.z);
    else this.n.lerp(UP, 0.02);
    const qn = new THREE.Quaternion().setFromUnitVectors(UP, this.n);
    const qy = new THREE.Quaternion().setFromAxisAngle(UP, rider.boardYaw);
    // roll about the board's long axis: lean right → right edge down; riding switch flips it
    const roll = -rider.edge * 0.55 * edgeVisual * (rider.switch ? -1 : 1);
    const qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
    this.group.quaternion.copy(qn).multiply(qy).multiply(qr);
  }
}

// the rider stands sideways on the board, facing its +x side (toes), feet on the bindings at z = ±0.27
export class Avatar {
  constructor({ ghost = false, jacket = '#ff6a3d', pants = '#24345e' } = {}) {
    this.group = new THREE.Group();
    const op = ghost ? { transparent: true, opacity: 0.35, depthWrite: false } : {};
    const mat = (c) => new THREE.MeshLambertMaterial({ color: ghost ? '#7fe6ff' : c, ...op });
    this.board = new Board(ghost ? { top: '#7fe6ff', base: '#7fe6ff', ghost: true } : {});
    this.group.add(this.board.group);
    this.body = new THREE.Group(); // in the board's frame
    this.board.group.add(this.body);
    this.m = {
      thighL: boneMesh(0.085, 0.075, 0, mat(pants)), shinL: boneMesh(0.07, 0.06, 0, mat(pants)),
      thighR: boneMesh(0.085, 0.075, 0, mat(pants)), shinR: boneMesh(0.07, 0.06, 0, mat(pants)),
      upperL: boneMesh(0.06, 0.055, 0, mat(jacket)), foreL: boneMesh(0.052, 0.045, 0, mat(jacket)),
      upperR: boneMesh(0.06, 0.055, 0, mat(jacket)), foreR: boneMesh(0.052, 0.045, 0, mat(jacket)),
      torso: boneMesh(0.15, 0.17, 0, mat(jacket)),
    };
    for (const k in this.m) this.body.add(this.m[k]);
    const head = new THREE.Mesh(merge([
      [new THREE.SphereGeometry(0.13, 12, 9), ghost ? '#7fe6ff' : '#f0d2b8', M(0, 0, 0)],
      [new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), ghost ? '#7fe6ff' : '#f6f7fb', M(0, 0.02, 0)],
      [new THREE.BoxGeometry(0.2, 0.07, 0.24), ghost ? '#7fe6ff' : '#2fd3c4', M(0.1, 0.0, 0)],
    ]), new THREE.MeshLambertMaterial({ vertexColors: true, ...op }));
    this.head = head;
    this.body.add(head);
    const glove = new THREE.SphereGeometry(0.065, 8, 6);
    this.handL = new THREE.Mesh(glove, mat('#1f2533'));
    this.handR = new THREE.Mesh(glove, mat('#1f2533'));
    const boot = new THREE.BoxGeometry(0.16, 0.12, 0.3);
    this.bootL = new THREE.Mesh(boot, mat('#2b2f3a'));
    this.bootR = new THREE.Mesh(boot, mat('#2b2f3a'));
    this.body.add(this.handL, this.handR, this.bootL, this.bootR);
    this.v = {};
    for (const k of ['hip', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankL', 'ankR', 'neck', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'tmp']) this.v[k] = new THREE.Vector3();
    this.crouch = 0;
    this.grab = 0;
  }

  // pose from the rider state and the intent (crouch, grab)
  pose(rider, it, dt = 1 / 60) {
    this.board.place(rider);
    const v = this.v;
    this.crouch += ((it.crouch || 0) - this.crouch) * Math.min(1, dt * 10);
    const g = rider.air && it.grab ? 1 : 0;
    this.grab += (g - this.grab) * Math.min(1, dt * 12);
    const c = Math.max(this.crouch, this.grab * 0.8);
    // the body leans into the turn with the board (it rolls with the board's group already) plus a little more
    this.body.rotation.z = -rider.edge * 0.35;
    const hipH = 0.93 - 0.3 * c;
    v.ankL.set(0, 0.11, -0.27); v.ankR.set(0, 0.11, 0.27);
    v.hip.set(-0.04 * c, hipH, 0);
    v.hipL.set(v.hip.x, hipH, -0.1); v.hipR.set(v.hip.x, hipH, 0.1);
    knee(v.hipL, v.ankL, 0.46, 0.46, v.kneeL);
    knee(v.hipR, v.ankR, 0.46, 0.46, v.kneeR);
    placeBone(this.m.thighL, v.hipL, v.kneeL); placeBone(this.m.shinL, v.kneeL, v.ankL);
    placeBone(this.m.thighR, v.hipR, v.kneeR); placeBone(this.m.shinR, v.kneeR, v.ankR);
    this.bootL.position.set(0.02, 0.09, -0.27); this.bootR.position.set(0.02, 0.09, 0.27);
    // torso bends forward (toward the toes) as you crouch
    const bend = 0.15 + c * 0.55;
    v.neck.set(v.hip.x + Math.sin(bend) * 0.55, hipH + Math.cos(bend) * 0.55, 0);
    placeBone(this.m.torso, v.hip, v.neck);
    this.head.position.set(v.neck.x + 0.03, v.neck.y + 0.16, 0);
    this.head.rotation.y = rider.switch ? -1.2 : 1.2; // looking where you go (over the front shoulder)
    this.head.rotation.order = 'YXZ';
    v.shL.set(v.neck.x - 0.02, v.neck.y - 0.05, -0.19); v.shR.set(v.neck.x - 0.02, v.neck.y - 0.05, 0.19);
    // arms out for balance; the back hand reaches down to the toe edge on a grab
    const sway = Math.sin(performance.now() / 600) * 0.03;
    v.haL.set(v.shL.x + 0.15, v.shL.y - 0.35 + sway, v.shL.z - 0.38);
    v.haR.set(v.shR.x + 0.12, v.shR.y - 0.42 - sway, v.shR.z + 0.32);
    if (this.grab > 0.01) v.haR.lerp(v.tmp.set(0.16, 0.12, 0.12), this.grab);
    elbow(v.shL, v.haL, v.elL, -1); elbow(v.shR, v.haR, v.elR, 1);
    placeBone(this.m.upperL, v.shL, v.elL); placeBone(this.m.foreL, v.elL, v.haL);
    placeBone(this.m.upperR, v.shR, v.elR); placeBone(this.m.foreR, v.elR, v.haR);
    this.handL.position.copy(v.haL); this.handR.position.copy(v.haR);
  }

  // the ghost: a recorded sample
  poseGhost(sample, course) {
    const [, x, y, z, yaw, edge, crouch] = sample;
    const n = course.normal(x, z);
    const r = { pos: { x, y, z }, normal: n, air: y - course.height(x, z) > 0.2, boardYaw: yaw, edge, switch: false };
    this.pose(r, { crouch }, 1 / 20);
  }
}

// the knee: bends forward (+x, toward the toes) between hip and ankle
function knee(hip, ank, a, b, out) {
  const d = hip.distanceTo(ank);
  const mid = out.addVectors(hip, ank).multiplyScalar(0.5);
  const h = Math.sqrt(Math.max(0, a * a - (d / 2) * (d / 2)));
  mid.x += h;
  return mid;
}
function elbow(sh, ha, out, side) {
  out.addVectors(sh, ha).multiplyScalar(0.5);
  out.x -= 0.06; out.z += side * 0.05;
  return out;
}
