// js/avatar.js — the CPU player you see: a body in an athletic stance (knees bent, leaning in), arms and legs
// solved with two-bone IK, the head following the ball, side steps when moving, and the paddle stroke. The
// stroke is built backwards from the plan: at the contact moment the paddle is exactly where the ball is, with the
// planned face (normal) and moving at the planned swing velocity — a backswing before it and a follow-through after.
import * as THREE from 'three';
import { BLADE, HALF_T } from './paddle.js';
import { BALL_R, TABLE } from './physics.js';
import { buildPaddle } from './paddlemesh.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** two-bone IK: joint position for root → target with segment lengths a, b, bending toward pole */
function solve2(root, target, a, b, pole, out) {
  const d = target.clone().sub(root);
  let L = d.length();
  const maxL = (a + b) * 0.999;
  if (L > maxL) { d.multiplyScalar(maxL / L); L = maxL; }
  const dir = d.clone().divideScalar(L || 1);
  const x = (a * a - b * b + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const pp = pole.clone().sub(root);
  const perp = pp.sub(dir.clone().multiplyScalar(pp.dot(dir))).normalize();
  out.copy(root).addScaledVector(dir, x).addScaledVector(perp, h);
  return root.clone().add(d);
}

/** a capsule from p to q */
function limb(mesh, p, q) {
  const d = q.clone().sub(p), L = d.length();
  mesh.position.copy(p).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(L || 1));
  mesh.scale.set(1, L / mesh.userData.len, 1);
}
/** a body block from p (bottom) to q (top) whose front faces f; sx / sz: its width / depth scale */
function block(mesh, p, q, f, sx, sz) {
  const y = q.clone().sub(p), L = y.length();
  y.divideScalar(L || 1);
  const z = f.clone().addScaledVector(y, -f.dot(y)).normalize();
  const x = y.clone().cross(z).normalize();
  mesh.position.copy(p).addScaledVector(y, L / 2);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  mesh.scale.set(sx, L / mesh.userData.len, sz);
}

const hermite = (p0, m0, p1, m1, s) => {
  const s2 = s * s, s3 = s2 * s;
  return p0.clone().multiplyScalar(2 * s3 - 3 * s2 + 1).addScaledVector(m0, s3 - 2 * s2 + s)
    .addScaledVector(p1, -2 * s3 + 3 * s2).addScaledVector(m1, s3 - s2);
};
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** paddle rotation whose face (FH: +Z, BH: −Z) has normal n and whose handle→tip points as near to d0 as it can */
export function paddleBasis(n, d0, wing) {
  const z = n.clone().multiplyScalar(wing === 'bh' ? -1 : 1);
  const y = d0.clone().addScaledVector(n, -d0.dot(n));
  if (y.lengthSq() < 1e-6) y.set(0, 1, 0).addScaledVector(n, -n.y);
  y.normalize();
  const x = y.clone().cross(z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
/** the hand (paddle origin) that puts the face's contact point under the ball at P */
export function handFor(P, n, q, wing) {
  const s = wing === 'bh' ? -1 : 1;
  const contact = P.clone().addScaledVector(n, -BALL_R);
  return contact.sub(V(0, BLADE.yc + BLADE.sweetY, s * HALF_T).applyQuaternion(q));
}

export class Avatar {
  constructor(scene, opts = {}) {
    this.side = opts.side ?? -1;               // the half it plays on
    this.root = new THREE.Group();
    scene.add(this.root);
    const skin = new THREE.MeshStandardMaterial({ color: opts.skin ?? 0xd9a882, roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: opts.shirt ?? 0xc8323c, roughness: 0.75 });
    const shorts = new THREE.MeshStandardMaterial({ color: opts.shorts ?? 0x14161c, roughness: 0.8 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    const hair = new THREE.MeshStandardMaterial({ color: opts.hair ?? 0x17110d, roughness: 0.9 });
    const cap = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.userData.len = len + 2 * r; m.castShadow = true; this.root.add(m); return m; };
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.26, 4, 12), shirt);
    this.torso.userData.len = 0.58; this.torso.castShadow = true;
    this.root.add(this.torso);
    this.pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.06, 4, 12), shorts);
    this.pelvis.scale.set(1.1, 1, 0.75); this.pelvis.castShadow = true;
    this.root.add(this.pelvis);
    this.head = new THREE.Group();
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), skin); face.scale.set(0.92, 1.08, 0.98); face.castShadow = true;
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairM.position.set(0, 0.012, -0.008); hairM.rotation.x = -0.25;
    this.head.add(face, hairM);
    this.root.add(this.head);
    this.neck = cap(0.045, 0.06, skin);
    this.upper = { r: cap(0.052, 0.2, shirt), l: cap(0.052, 0.2, shirt) };
    this.fore = { r: cap(0.042, 0.2, skin), l: cap(0.042, 0.2, skin) };
    this.hand = { r: new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin), l: new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin) };
    this.root.add(this.hand.r, this.hand.l);
    this.thigh = { r: cap(0.075, 0.3, shorts), l: cap(0.075, 0.3, shorts) };
    this.shin = { r: cap(0.055, 0.32, skin), l: cap(0.055, 0.32, skin) };
    this.foot = { r: new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), shoe), l: new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), shoe) };
    this.root.add(this.foot.r, this.foot.l);
    this.paddle = buildPaddle({ fhColor: opts.fhColor || 'red', bhColor: opts.bhColor || 'black', lite: opts.lite });
    scene.add(this.paddle);
    this.anim = null;
    this.stepPh = 0;
    this.feet = null;
    this.padPos = V(); this.padQ = new THREE.Quaternion();
    this.visible = true;
  }
  setVisible(v) { this.visible = v; this.root.visible = v; this.paddle.visible = v; }

  // basis vectors of the player: forward (toward the net), right
  basis() { const f = V(0, 0, -this.side); const r = V(this.side, 0, 0); return { f, r }; }

  readyPose(body) {
    const { f, r } = this.basis();
    const p = V(body.x, 1.0, body.z).addScaledVector(f, 0.36).addScaledVector(r, 0.1);
    const n = f.clone().multiplyScalar(0.6).addScaledVector(r, 0.75).normalize();
    const q = paddleBasis(n, f.clone().multiplyScalar(0.7).addScaledVector(UP, 0.5).addScaledVector(r, -0.4), 'fh');
    return { p, q };
  }

  /** set up the stroke for a new plan (from now until the contact) */
  plan(pl, now) {
    const { f, r } = this.basis();
    const n = V(pl.n.x, pl.n.y, pl.n.z);
    const vp = V(pl.vp.x, pl.vp.y, pl.vp.z);
    const sp = vp.length();
    const P = V(pl.P.x, pl.P.y, pl.P.z);
    const wing = pl.wing || 'fh';
    // where the tip points at contact
    let d0;
    if (pl.shot === 'push') d0 = f.clone().multiplyScalar(0.8).addScaledVector(r, wing === 'fh' ? 0.6 : -0.6);
    else if (wing === 'fh') d0 = r.clone().multiplyScalar(0.85).addScaledVector(f, 0.35).addScaledVector(UP, pl.shot === 'serve' ? -0.4 : -0.15);
    else d0 = r.clone().multiplyScalar(-0.85).addScaledVector(f, 0.25).addScaledVector(UP, 0.3);
    const qc = paddleBasis(n, d0, wing);
    const hc = handFor(P, n, qc, wing);
    const tc = pl.tAbs;
    const Tb = Math.min(0.45, Math.max(0.16, 0.14 + 0.014 * sp));
    const dir = sp > 0.01 ? vp.clone().divideScalar(sp) : f.clone();
    const back = 0.08 + 0.024 * sp;
    const hb = hc.clone().addScaledVector(dir, -back);
    if (pl.shot === 'loop') hb.y -= 0.12;
    const yaw = (wing === 'fh' ? 1 : -1) * (0.5 + 0.02 * sp) * -this.side;
    const qb = new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(qc);
    const hf = hc.clone().addScaledVector(dir, 0.08 + 0.02 * sp).add(V(0, 0.06 + 0.006 * sp, 0));
    const qf = new THREE.Quaternion().setFromAxisAngle(UP, -yaw * 0.8).multiply(qc);
    this.anim = { t0: now, tb: Math.max(now + 0.05, tc - Tb), tc, tf: tc + 0.16 + 0.006 * sp, p0: this.padPos.clone(), q0: this.padQ.clone(), hb, qb, hc, qc, vp, hf, qf, wing, done: false, src: pl };
  }

  /** where the paddle is at time t */
  pose(t, body) {
    const A = this.anim, R = this.readyPose(body);
    if (!A) return R;
    if (t < A.tb) {
      const s = smooth((t - A.t0) / Math.max(0.05, A.tb - A.t0));
      return { p: A.p0.clone().lerp(A.hb, s), q: A.q0.clone().slerp(A.qb, s) };
    }
    if (t < A.tc) {
      const T = A.tc - A.tb, s = (t - A.tb) / T;
      const p = hermite(A.hb, V(), A.hc, A.vp.clone().multiplyScalar(T), s);
      return { p, q: A.qb.clone().slerp(A.qc, smooth(s * 1.15)) };
    }
    if (t < A.tf) {
      const T = A.tf - A.tc, s = (t - A.tc) / T;
      const p = hermite(A.hc, A.vp.clone().multiplyScalar(T), A.hf, V(), s);
      return { p, q: A.qc.clone().slerp(A.qf, smooth(s)) };
    }
    const s = smooth((t - A.tf) / 0.45);
    if (s >= 1) { this.anim = null; return R; }
    return { p: A.hf.clone().lerp(R.p, s), q: A.qf.clone().slerp(R.q, s) };
  }

  /**
   * bot: its body {x,z,vx,vz} and plans; t: sim time; ball: the ball position (look at it); hold: a position for
   * the free hand (the ball before a toss) or null.
   */
  update(bot, t, dt, ball, hold = null) {
    const body = bot.body;
    const pl = bot.plan || (bot.lastPlan && bot.lastPlan.tAbs > t - 0.5 ? bot.lastPlan : null);
    if (pl && (!this.anim || this.anim.src !== pl) && pl.tAbs > t - 0.01) this.plan(pl, t);
    const ps = this.pose(t, body);
    this.padPos.copy(ps.p); this.padQ.copy(ps.q);
    this.paddle.position.copy(ps.p); this.paddle.quaternion.copy(ps.q);
    if (this.paddle.userData.tick) this.paddle.userData.tick(dt);
    if (!this.visible) return;
    const { f, r } = this.basis();
    // stance: lower and wider when moving; the torso turns with the stroke
    const speed = Math.hypot(body.vx, body.vz);
    const hipY = 0.86 - Math.min(0.06, speed * 0.02);
    const hips = V(body.x, hipY, body.z);
    const toPad = ps.p.clone().sub(hips); toPad.y = 0;
    const turn = Math.max(-0.7, Math.min(0.7, Math.atan2(toPad.dot(r), Math.max(0.1, toPad.dot(f))) * 0.55));
    const fT = f.clone().applyAxisAngle(UP, turn * this.side);
    const rT = fT.clone().cross(UP).multiplyScalar(-1);
    const chest = hips.clone().add(V(0, 0.46, 0)).addScaledVector(fT, 0.13);
    this.pelvis.position.copy(hips).add(V(0, 0.02, 0));
    this.pelvis.quaternion.setFromUnitVectors(V(0, 0, 1), f);
    block(this.torso, hips.clone().add(V(0, 0.06, 0)), chest.clone().add(V(0, 0.1, 0)), fT, 1.12, 0.72);
    const neckB = chest.clone().add(V(0, 0.14, 0)).addScaledVector(fT, 0.02);
    limb(this.neck, chest.clone().add(V(0, 0.08, 0)), neckB);
    this.head.position.copy(neckB).add(V(0, 0.1, 0.0)).addScaledVector(fT, 0.02);
    if (ball) {
      const look = V(ball.x, ball.y, ball.z).sub(this.head.position);
      this.head.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(V(), look.multiplyScalar(-1), UP));
    }
    // arms: the paddle hand reaches the paddle's handle, the other balances or holds the ball
    const sR = chest.clone().add(V(0, 0.08, 0)).addScaledVector(rT, 0.2);
    const sL = chest.clone().add(V(0, 0.08, 0)).addScaledVector(rT, -0.2);
    const elbow = V();
    const handR = ps.p.clone();
    const hr = solve2(sR, handR, 0.3, 0.29, sR.clone().addScaledVector(rT, 0.4).add(V(0, -0.5, 0)).addScaledVector(fT, -0.2), elbow);
    limb(this.upper.r, sR, elbow); limb(this.fore.r, elbow, hr); this.hand.r.position.copy(hr);
    const free = hold ? V(hold.x, hold.y - 0.04, hold.z) : chest.clone().addScaledVector(fT, 0.3).addScaledVector(rT, -0.28).add(V(0, -0.18, 0));
    const el2 = V();
    const hl = solve2(sL, free, 0.3, 0.29, sL.clone().addScaledVector(rT, -0.4).add(V(0, -0.5, 0)), el2);
    limb(this.upper.l, sL, el2); limb(this.fore.l, el2, hl); this.hand.l.position.copy(hl);
    // legs: feet planted apart, stepping when moving
    if (!this.feet) this.feet = { r: V(body.x, 0, body.z).addScaledVector(r, 0.33), l: V(body.x, 0, body.z).addScaledVector(r, -0.33) };
    this.stepPh += dt * (3 + speed * 6);
    for (const k of ['r', 'l']) {
      const want = V(body.x, 0, body.z).addScaledVector(r, (k === 'r' ? 1 : -1) * 0.34).addScaledVector(f, k === 'r' ? -0.06 : 0.06);
      const ft = this.feet[k];
      const lift = speed > 0.2 ? Math.max(0, Math.sin(this.stepPh + (k === 'r' ? 0 : Math.PI))) * 0.06 : 0;
      ft.lerp(want, Math.min(1, dt * (speed > 0.2 ? 14 : 6)));
      const hip = hips.clone().addScaledVector(r, (k === 'r' ? 1 : -1) * 0.1);
      const ankle = V(ft.x, 0.08 + lift, ft.z);
      const knee = V();
      const a = solve2(hip, ankle, 0.44, 0.43, hip.clone().addScaledVector(f, 0.6).add(V(0, -0.3, 0)).addScaledVector(r, (k === 'r' ? 1 : -1) * 0.15), knee);
      limb(this.thigh[k], hip, knee); limb(this.shin[k], knee, a);
      this.foot[k].position.set(a.x, 0.035 + lift, a.z).addScaledVector(f, 0.06);
      this.foot[k].quaternion.setFromUnitVectors(V(0, 0, 1), f);
    }
  }
}

export { TABLE };
