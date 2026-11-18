// js/avatar.js — the CPU player: a 1.83 m figure built from simple solids, posed procedurally every frame
// (run cycle from its velocity, split-step crouch, a coil of the torso, two-bone arm IK to a racket that follows
// the stroke's path so the strings meet the ball at the contact point).
//
// Local frame: feet at the origin, facing +z, the figure's right hand side is −x.
import * as THREE from 'three';
import { buildRacketMesh, RACKET } from './racket.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

function seg(r0, r1, mat, len = 1) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 10), mat);
  m.castShadow = true;
  return m;
}
/** put a unit-length (along y) cylinder between a and b */
function place(mesh, a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  mesh.scale.set(1, len, 1);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
}

/** two-bone IK: elbow position for shoulder s, target t, lengths l1 l2, bending toward pole */
function ik(s, t, l1, l2, pole, outElbow, outHand) {
  _d.subVectors(t, s);
  let dist = _d.length();
  const maxR = (l1 + l2) * 0.999;
  if (dist > maxR) { _d.multiplyScalar(maxR / dist); dist = maxR; }
  outHand.copy(s).add(_d);
  const dir = _d.clone().normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  outElbow.copy(s).addScaledVector(dir, a).addScaledVector(p, h);
}

export class Avatar {
  constructor(colors = {}) {
    const C = { shirt: 0xc0392b, shorts: 0xf4f4f4, skin: 0xc68b62, shoe: 0xf2f2f2, cap: 0xf4f4f4, racket: 0x8e1b1b, ...colors };
    this.root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: C.skin, roughness: 0.65 });
    const shirt = new THREE.MeshStandardMaterial({ color: C.shirt, roughness: 0.8 });
    const shorts = new THREE.MeshStandardMaterial({ color: C.shorts, roughness: 0.85 });
    const shoe = new THREE.MeshStandardMaterial({ color: C.shoe, roughness: 0.6 });
    const sock = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const g = this.root;
    this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.155, 0.52, 14), shirt);
    this.torso.scale.z = 0.62; this.torso.castShadow = true;
    this.pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.2, 14), shorts);
    this.pelvis.scale.z = 0.7; this.pelvis.castShadow = true;
    this.neck = seg(0.05, 0.05, skin);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skin);
    this.head.scale.set(0.92, 1.1, 1); this.head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.cap, roughness: 0.7 }));
    cap.position.y = 0.03;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), cap.material);
    brim.position.set(0, 0.035, 0.07); brim.scale.z = 1.3;
    this.head.add(cap, brim);
    this.uArm = [seg(0.05, 0.045, shirt), seg(0.05, 0.045, shirt)];
    this.fArm = [seg(0.042, 0.035, skin), seg(0.042, 0.035, skin)];
    this.hand = [new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin), new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin)];
    this.thigh = [seg(0.075, 0.06, shorts), seg(0.075, 0.06, shorts)];
    this.shin = [seg(0.055, 0.042, skin), seg(0.055, 0.042, skin)];
    this.sock = [seg(0.045, 0.045, sock), seg(0.045, 0.045, sock)];
    this.foot = [new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), shoe), new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), shoe)];
    for (const m of [this.torso, this.pelvis, this.neck, this.head, ...this.uArm, ...this.fArm, ...this.hand, ...this.thigh, ...this.shin, ...this.sock, ...this.foot]) { m.castShadow = true; g.add(m); }
    this.racket = buildRacketMesh(C.racket, 0xffffff);
    g.add(this.racket);
    // joints (local)
    this.J = {};
    for (const k of ['hip', 'chest', 'neck', 'headC', 'shR', 'shL', 'elR', 'elL', 'hR', 'hL', 'hipR', 'hipL', 'kR', 'kL', 'aR', 'aL']) this.J[k] = new THREE.Vector3();
    this.runPhase = 0;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.handSign = 1;            // right-handed
  }

  /**
   * pose for this frame.
   * s: { x, z, yaw, vx, vz (world), swing: { kind: 'fh'|'bh'|'serve'|'ready', u (−1 back … 0 contact … 1 finish), cH, reach, front, toss (0…1) } }
   */
  update(dt, s) {
    const J = this.J;
    this.root.position.set(s.x, 0, s.z);
    this.root.rotation.y = s.yaw;
    // velocity in the local frame (forward +z, right −x)
    const cy = Math.cos(-s.yaw), sy = Math.sin(-s.yaw);
    const lvx = s.vx * cy - s.vz * sy, lvz = s.vx * sy + s.vz * cy;
    const sp = Math.hypot(lvx, lvz);
    this.runPhase += dt * (sp > 0.15 ? 2 * Math.PI * (1.2 + sp * 0.55) : 0);
    const run = Math.min(1, sp / 3.5);
    const sw = s.swing || { kind: 'ready', u: 0 };
    // crouch: ready position, deeper when moving and on low balls
    const low = sw.kind !== 'serve' && sw.kind !== 'ready' && Math.abs(sw.u) < 0.8 ? Math.max(0, 0.95 - (sw.cH ?? 0.95)) * 0.6 : 0;
    const crouch = 0.32 + run * 0.15 + low;
    // legs
    const legAng = (k) => {
      const ph = this.runPhase + (k ? Math.PI : 0);
      const fw = run * (lvz / (sp || 1)), lat = run * (lvx / (sp || 1));
      return { pitch: Math.sin(ph) * 0.55 * fw, roll: Math.sin(ph) * 0.35 * lat, knee: crouch + Math.max(0, -Math.cos(ph)) * 0.9 * run };
    };
    const L = [legAng(0), legAng(1)];
    const th = 0.46, sh = 0.46, ankleH = 0.075;
    const vert = (a) => th * Math.cos(Math.hypot(a.pitch, a.roll) + crouch * 0.5) + sh * Math.cos(Math.hypot(a.pitch, a.roll) - a.knee + crouch * 0.5);
    const hipY = Math.max(vert(L[0]), vert(L[1])) + ankleH;
    J.hip.set(0, hipY, 0);
    // torso coil: turn the shoulders into the stroke
    let coil = 0, lean = 0.08 + run * 0.12;
    if (sw.kind === 'fh') coil = -Math.sign(1) * 0.9 * clampU(-sw.u) + 0.7 * clampU(sw.u);
    if (sw.kind === 'bh') coil = 1.0 * clampU(-sw.u) - 0.6 * clampU(sw.u);
    if (sw.kind === 'serve') { coil = 0.7 * clampU(-sw.u) - 0.5 * clampU(sw.u); lean = -0.15 * clampU(-sw.u) + 0.3 * clampU(sw.u); }
    // coil > 0 turns the chest to the figure's right (toward −x)
    const rotY = (v, a) => v.set(v.x * Math.cos(a) + v.z * Math.sin(a), v.y, -v.x * Math.sin(a) + v.z * Math.cos(a));
    J.chest.set(0, hipY + 0.5, lean * 0.4);
    J.neck.set(0, hipY + 0.6, lean * 0.5);
    J.headC.set(0, hipY + 0.73, lean * 0.55);
    J.shR.set(-0.2, hipY + 0.53, 0); rotY(J.shR, -coil); J.shR.z += lean * 0.45; J.shR.y += hipY * 0;
    J.shL.set(0.2, hipY + 0.53, 0); rotY(J.shL, -coil); J.shL.z += lean * 0.45;
    // pelvis + torso meshes
    this.pelvis.position.set(0, hipY, 0);
    this.pelvis.rotation.y = -coil * 0.4;
    place(this.torso, _a.set(0, hipY + 0.04, lean * 0.05), _b.copy(J.chest).setY(hipY + 0.56));
    this.torso.scale.set(1, 1, 0.62);
    this.torso.rotation.y += 0;
    { const q = new THREE.Quaternion().setFromAxisAngle(UP, -coil); this.torso.quaternion.premultiply(q); }
    this.torso.scale.y = 1;
    place(this.neck, _a.copy(J.chest).setY(hipY + 0.55), J.neck);
    this.head.position.copy(J.headC);
    // legs
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1;  // k = 0 right leg (−x)
      const hp = (k ? J.hipL : J.hipR).set(side * 0.1, hipY - 0.05, 0);
      const a = L[k];
      const dirT = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(-a.pitch - crouch * 0.5, 0, a.roll * side * 0 + a.roll));
      const kn = (k ? J.kL : J.kR).copy(hp).addScaledVector(dirT, th);
      const dirS = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(-a.pitch - crouch * 0.5 + a.knee, 0, a.roll));
      const an = (k ? J.aL : J.aR).copy(kn).addScaledVector(dirS, sh);
      place(this.thigh[k], hp, kn);
      place(this.shin[k], kn, _b.copy(an).addScaledVector(dirS, -0.1));
      place(this.sock[k], _a.copy(an).addScaledVector(dirS, -0.1), an);
      this.foot[k].position.set(an.x, Math.max(0.035, an.y - 0.04), an.z + 0.06);
      this.foot[k].rotation.set(Math.max(-0.4, Math.min(0.4, -a.pitch * 0.5)), 0, 0);
    }
    // racket hand target and racket orientation from the stroke
    const R = this.strokePose(sw, hipY);
    const sR = J.shR, sL = J.shL;
    ik(sR, R.hand, 0.3, 0.29, new THREE.Vector3(-0.6, -1, -0.4), J.elR, J.hR);
    place(this.uArm[0], sR, J.elR); place(this.fArm[0], J.elR, J.hR);
    this.hand[0].position.copy(J.hR);
    // racket: origin at the hand, +Y toward the head, +Z the face normal
    const yAx = R.shaft.clone().normalize();
    const zAx = R.face.clone().sub(yAx.clone().multiplyScalar(R.face.dot(yAx))).normalize();
    const xAx = new THREE.Vector3().crossVectors(yAx, zAx);
    this.racket.position.copy(J.hR);
    this.racket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, zAx));
    // free hand: balance, catches the racket throat on the backhand, tosses on the serve
    let lt;
    if (sw.kind === 'serve') {
      const toss = sw.toss ?? 0;
      lt = new THREE.Vector3(0.15, hipY + 0.2 + toss * 1.45, 0.3 + toss * 0.15);
      if (sw.u > -0.3) lt.set(0.18, hipY + 0.25 + Math.max(0, -sw.u) * 0.9, 0.35);
    } else if (sw.kind === 'bh' && sw.u < 0.1) {
      lt = J.hR.clone().addScaledVector(yAx, 0.22);
    } else if (sw.kind === 'fh') {
      lt = new THREE.Vector3(0.35 + 0.1 * clampU(-sw.u), hipY + 0.42, 0.35 - 0.3 * clampU(sw.u));
    } else {
      lt = J.hR.clone().addScaledVector(yAx, 0.24).add(new THREE.Vector3(0.03, 0, 0));
      if (run > 0.3) lt.set(0.32, hipY + 0.2 + Math.sin(this.runPhase) * 0.1 * run, 0.12 + Math.sin(this.runPhase) * 0.25 * run);
    }
    ik(sL, lt, 0.3, 0.29, new THREE.Vector3(0.6, -1, -0.4), J.elL, J.hL);
    place(this.uArm[1], sL, J.elL); place(this.fArm[1], J.elL, J.hL);
    this.hand[1].position.copy(J.hL);
  }

  strokePose(sw, hipY) { return strokePose(sw, hipY); }
}

/**
 * Racket path for a stroke, in the local frame. Returns { hand, shaft (hand→head), face (normal) }.
 * At u = 0 the head centre is at the contact point (−reach to the right, front ahead, height cH).
 */
export function strokePose(sw, hipY) {
  const reach = sw.reach ?? 0.85, front = sw.front ?? 0.4, cH = sw.cH ?? 0.95, u = sw.u ?? 0;
  const Lh = RACKET.headC;
  if (sw.kind === 'fh' || sw.kind === 'bh') {
    const s = sw.kind === 'fh' ? 1 : -1;            // fh: right side (−x)
    const R = Math.hypot(reach, front);
    const thc = Math.atan2(reach, front);
    const span = sw.volley ? 0.7 : 2.0;
    const th = thc - u * span * 0.5 * (u < 0 ? 1.15 : 1.2);
    const y = cH + (sw.volley ? 0.05 * u : u < 0 ? 0.3 * u : 0.55 * u) * (sw.slice ? -1 : 1);
    const head = new THREE.Vector3(-s * R * Math.sin(th), y, R * Math.cos(th));
    const radial = new THREE.Vector3(-s * Math.sin(th), 0, Math.cos(th));
    const tangent = new THREE.Vector3(s * Math.cos(th), 0, Math.sin(th));  // direction of travel
    // the head lags a little behind the hand on the way in, then whips through
    const shaft = radial.clone().multiplyScalar(0.9).addScaledVector(tangent, u < 0 ? -0.3 : 0.25).add(new THREE.Vector3(0, u > 0.5 ? 0.6 : -0.05, 0)).normalize();
    const hand = head.clone().addScaledVector(shaft, -Lh);
    hand.y = Math.max(0.55, hand.y);
    const face = tangent.clone().add(new THREE.Vector3(0, sw.slice ? 0.35 : -0.05, 0)).normalize();
    return { hand, shaft, face };
  }
  if (sw.kind === 'serve') {
    // in the vertical plane through the right shoulder, from the drop behind the back to over the head and through
    const sh = new THREE.Vector3(-0.2, hipY + 0.53, 0.38);   // leaning into the court
    const R = 1.22;
    const phc = -0.08;                               // just before the top of the arc: the head still rises a little
    const ph = phc + u * (u < 0 ? 2.6 : 2.6);
    const dir = new THREE.Vector3(0.08 * u, Math.cos(ph), Math.sin(ph));
    const head = sh.clone().addScaledVector(dir, R);
    const shaft = dir.clone().normalize();
    const hand = head.clone().addScaledVector(shaft, -Lh);
    const face = new THREE.Vector3(0, -Math.sin(ph), Math.cos(ph));
    return { hand, shaft, face };
  }
  // ready: racket in front, head up
  const hand = new THREE.Vector3(-0.18, hipY + 0.05, 0.38);
  const shaft = new THREE.Vector3(0.45, 0.55, 0.7).normalize();
  const face = new THREE.Vector3(-1, 0.1, 0.2).normalize();
  return { hand, shaft, face };
}

function clampU(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
