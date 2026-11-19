// js/avatar.js — a tennis player's figure (the CPU, and you on PC): 1.83 m, posed every frame from the stroke
// keyframes (js/stroke.js): the trunk turns and leans with the stroke, the arms are shaped limbs with hands
// (js/arm.js) solved by IK to the racket's grip — the free hand holds the throat, the second grip of a two-handed
// backhand, or the toss — knees bend for low balls, a split step when the opponent hits, the head follows the ball.
//
// Local frame: feet at the origin, facing +z, the figure's right hand side is −x.
import * as THREE from 'three';
import { buildRacketMesh } from './racket.js';
import { Arm, racketMount, GRIP_ANGLE } from './arm.js';
import { strokePose } from './stroke.js';

export { strokePose } from './stroke.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const MOUNT_R = racketMount('R', GRIP_ANGLE, 0);
const MOUNT_R_INV = MOUNT_R.clone().invert();
const MOUNT_L_INV = racketMount('L', GRIP_ANGLE, 180).invert();   // the left palm on the other face (two-handed)

function seg(r0, r1, mat, len = 1) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 12), mat);
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

export class Avatar {
  constructor(colors = {}) {
    const C = { shirt: 0xc0392b, shorts: 0xf4f4f4, skin: 0xc68b62, shoe: 0xf2f2f2, cap: 0xf4f4f4, racket: 0x8e1b1b, band: 0xffffff, ...colors };
    this.root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: C.skin, roughness: 0.55 });
    const shirt = new THREE.MeshStandardMaterial({ color: C.shirt, roughness: 0.8 });
    const shorts = new THREE.MeshStandardMaterial({ color: C.shorts, roughness: 0.85 });
    const shoe = new THREE.MeshStandardMaterial({ color: C.shoe, roughness: 0.6 });
    const sock = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const g = this.root;
    // trunk: a shirt turned from a profile (waist → chest → rounded shoulders → neck) and the shorts
    const prof = [[-0.06, 0.168], [0.0, 0.166], [0.12, 0.16], [0.26, 0.178], [0.38, 0.195], [0.44, 0.19], [0.49, 0.16], [0.525, 0.11], [0.545, 0.06], [0.55, 0.0]];
    this.torso = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(r, y)), 20), shirt);
    this.torsoScaleZ = 0.62;
    this.pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.168, 0.2, 16), shorts);
    this.pelvis.scale.z = 0.6;
    this.neck = seg(0.05, 0.055, skin);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), skin);
    this.head.scale.set(0.92, 1.1, 1);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.cap, roughness: 0.7 }));
    cap.position.y = 0.03;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), cap.material);
    brim.position.set(0, 0.035, 0.07); brim.scale.z = 1.3;
    this.head.add(cap, brim);
    this.thigh = [seg(0.075, 0.06, shorts), seg(0.075, 0.06, shorts)];
    this.shin = [seg(0.055, 0.042, skin), seg(0.055, 0.042, skin)];
    this.sock = [seg(0.045, 0.045, sock), seg(0.045, 0.045, sock)];
    this.foot = [new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), shoe), new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), shoe)];
    for (const m of [this.torso, this.pelvis, this.neck, this.head, ...this.thigh, ...this.shin, ...this.sock, ...this.foot]) { m.castShadow = true; g.add(m); }
    // arms with hands
    this.armR = new Arm('R', { skinMat: skin, sleeveMat: shirt, band: C.band });
    this.armL = new Arm('L', { skinMat: skin, sleeveMat: shirt, band: C.band });
    g.add(this.armR.group, this.armL.group);
    this.racket = buildRacketMesh(C.racket, 0xffffff);
    g.add(this.racket);
    this.runPhase = 0;
    this.handSign = 1;            // right-handed
    this.headYaw = 0; this.headPitch = 0;
  }

  /**
   * pose for this frame.
   * s: { x, z, yaw, vx, vz (world), swing: { kind, u, cH, reach, front, slice, volley, prep, toss, split }, look: world point }
   */
  update(dt, s) {
    this.root.position.set(s.x, 0, s.z);
    this.root.rotation.y = s.yaw;
    // velocity in the local frame (forward +z, right −x)
    const cy = Math.cos(-s.yaw), sy = Math.sin(-s.yaw);
    const lvx = s.vx * cy - s.vz * sy, lvz = s.vx * sy + s.vz * cy;
    const sp = Math.hypot(lvx, lvz);
    this.runPhase += dt * (sp > 0.15 ? 2 * Math.PI * (1.2 + sp * 0.55) : 0);
    const run = Math.min(1, sp / 3.5);
    const sw = s.swing || { kind: 'ready', u: 0 };
    const P = strokePose(sw);
    // split step: a small hop when the opponent hits, landing wide and low
    const sp01 = sw.split != null && sw.split >= 0 && sw.split <= 1 ? sw.split : -1;
    const hop = sp01 >= 0 ? Math.sin(Math.PI * Math.min(1, sp01 / 0.6)) * 0.06 : 0;
    const land = sp01 >= 0.6 ? Math.sin(Math.PI * (sp01 - 0.6) / 0.4) * 0.12 : 0;
    const crouch = Math.max(0, 0.32 + run * 0.12 + P.crouch + land);
    const lift = P.jump + hop;
    this.root.position.y = lift;
    // legs (feet apart: wider on the split step)
    const legAng = (k) => {
      const ph = this.runPhase + (k ? Math.PI : 0);
      const fw = run * (lvz / (sp || 1)), lat = run * (lvx / (sp || 1));
      return { pitch: Math.sin(ph) * 0.55 * fw, roll: Math.sin(ph) * 0.35 * lat, knee: crouch + Math.max(0, -Math.cos(ph)) * 0.9 * run };
    };
    const L = [legAng(0), legAng(1)];
    const th = 0.46, sh = 0.46, ankleH = 0.075;
    const splay0 = 0.13 + 0.06 * Math.min(1, crouch);
    const vert = (a) => (th * Math.cos(Math.hypot(a.pitch, a.roll) + crouch * 0.5) + sh * Math.cos(Math.hypot(a.pitch, a.roll) - a.knee + crouch * 0.5)) * Math.cos(splay0 * 0.8);
    const hipY = Math.max(vert(L[0]), vert(L[1])) + ankleH;
    // feet about shoulder width apart, wider when low and on landing from the split step
    const splay = 0.13 + 0.06 * Math.min(1, crouch) + (sp01 >= 0.5 ? 0.05 : 0);
    // the trunk: turn (coil) and lean, as a rotation about the hips
    const lean = P.lean + run * 0.1;
    const qChest = new THREE.Quaternion().setFromAxisAngle(UP, -P.T).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean));
    const hip = new THREE.Vector3(P.sway, hipY, 0);
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(qChest).add(hip);
    this.pelvis.position.set(P.sway * 0.4, hipY - 0.04, 0);   // feet stay planted: the trunk carries the weight shift
    this.pelvis.rotation.set(0, -P.T * 0.45, 0);
    this.torso.position.copy(at(0, 0.02, 0));
    this.torso.quaternion.copy(qChest);
    this.torso.scale.set(1, 1, this.torsoScaleZ);
    const neckBase = at(0, 0.5, 0), neckTop = at(0, 0.6, 0.01);
    place(this.neck, neckBase, neckTop);
    this.head.position.copy(at(0, 0.73, 0.02));
    // the head turns toward the ball (within what a neck can do)
    let hy = -P.T * 0.6, hp = 0.1;
    if (s.look) {
      const lp = this.root.worldToLocal(new THREE.Vector3(s.look.x, s.look.y, s.look.z)).sub(this.head.position);
      hy = Math.atan2(lp.x, lp.z); hp = -Math.atan2(lp.y, Math.hypot(lp.x, lp.z));
      const lim = 1.3;
      hy = Math.max(-P.T - lim, Math.min(-P.T + lim, hy)); hp = Math.max(-0.6, Math.min(0.7, hp));
    }
    const kh = 1 - Math.exp(-dt / 0.08);
    this.headYaw += (hy - this.headYaw) * (dt > 0 ? kh : 1);
    this.headPitch += (hp - this.headPitch) * (dt > 0 ? kh : 1);
    this.head.rotation.set(this.headPitch, this.headYaw, 0, 'YXZ');
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1;  // k = 0 right leg (−x)
      const hpnt = new THREE.Vector3(side * 0.1, hipY - 0.05, 0);
      const a = L[k];
      const dirT = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(-a.pitch - crouch * 0.5, 0, a.roll + side * splay));
      const kn = hpnt.clone().addScaledVector(dirT, th);
      const dirS = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(-a.pitch - crouch * 0.5 + a.knee, 0, a.roll + side * splay * 0.6));
      const an = kn.clone().addScaledVector(dirS, sh);
      place(this.thigh[k], hpnt, kn);
      place(this.shin[k], kn, _b.copy(an).addScaledVector(dirS, -0.1));
      place(this.sock[k], _a.copy(an).addScaledVector(dirS, -0.1), an);
      this.foot[k].position.set(an.x, Math.max(0.035 - lift, an.y - 0.04), an.z + 0.06);
      this.foot[k].rotation.set(Math.max(-0.4, Math.min(0.4, -a.pitch * 0.5)), 0, 0);
    }
    // racket: from the stroke (local), +Y the shaft, +Z the palm-side face
    const yAx = P.shaft, zAx = P.face, xAx = new THREE.Vector3().crossVectors(yAx, zAx);
    const qR = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, zAx));
    const handPos = P.hand.clone().add(new THREE.Vector3(0, -lift, 0)).add(new THREE.Vector3(0, 0, 0));
    this.racket.position.copy(handPos);
    this.racket.quaternion.copy(qR);
    // arms: the racket hand's grip frame follows the racket; shoulders from the trunk
    const shR = at(-0.185, 0.47, 0), shL = at(0.185, 0.47, 0);
    // the shoulder blade lifts the shoulder when the arm reaches up (serve, smash)
    shR.y += 0.06 * Math.min(1, Math.max(0, (handPos.y - shR.y) / 0.6));
    const qGripR = qR.clone().multiply(MOUNT_R_INV);
    const poleR = P.poleR.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, -P.T * 0.5));
    this.armR.setPose(shR, handPos, qGripR, poleR, 'grip');
    // the free hand: on the racket (handle or throat), the toss, or out for balance
    const poleL = P.poleL.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, -P.T * 0.5));
    if (P.offAttach != null) {
      const p = handPos.clone().addScaledVector(yAx, P.offAttach);
      this.armL.setPose(shL, p, qR.clone().multiply(MOUNT_L_INV), poleL, P.offAttach > 0.15 ? 'throat' : 'grip');
    } else {
      const p = P.off.clone().add(new THREE.Vector3(0, -lift, 0));
      // fingers along the arm, palm turned down and in
      const along = p.clone().sub(shL).normalize();
      const yH = along.clone().negate();
      const palm = new THREE.Vector3(-0.3, -1, 0.2).addScaledVector(yH, -new THREE.Vector3(-0.3, -1, 0.2).dot(yH)).normalize();
      const zH = new THREE.Vector3().crossVectors(palm, yH);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(palm, yH, zH));
      // the left hand's grip frame: +X is the palm side, so the palm (−y-ish) is +X
      this.armL.setPose(shL, p, q, poleL, P.offPose === 'ball' ? 'ball' : P.offPose);
    }
  }

  strokePose(sw) { return strokePose(sw); }
}
