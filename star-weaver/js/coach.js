// coach.js — a hologram trainer standing 2.4 m in front of the player, like a mirror image.
// It demonstrates what to do next: it reaches where the player should reach, traces the comet,
// holds the pose, steps toward the open lane and bends its knees under the bar.
import * as THREE from 'three';
import { hologramMaterial, rimMaterial, energyMaterial } from './gfx.js';
import { HAND_COLORS } from './palette.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

// two-bone IK: elbow/knee position for a limb from root to target with segment lengths a, b
function solve(root, target, a, b, pole, outMid, outEnd) {
  const d = tmp.subVectors(target, root);
  let L = d.length();
  const dir = L > 1e-5 ? d.multiplyScalar(1 / L) : d.set(0, -1, 0);
  L = Math.min(Math.max(L, Math.abs(a - b) + 0.01), a + b - 0.002);
  outEnd.copy(root).addScaledVector(dir, L);
  const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = tmp2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
  p.normalize();
  outMid.copy(root).addScaledVector(dir, x).addScaledVector(p, h);
}

export class Coach {
  constructor(parent) {
    this.root = new THREE.Group();
    parent.add(this.root);
    this.mat = hologramMaterial('#9be8ff');
    const sphere = new THREE.SphereGeometry(1, 20, 14), cyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    this.segs = {};
    this.joints = {};
    const seg = (name) => { const m = new THREE.Mesh(cyl, this.mat); m.renderOrder = 2; this.root.add(m); this.segs[name] = m; return m; };
    const ball = (name, r) => { const m = new THREE.Mesh(sphere, this.mat); m.scale.setScalar(r); m.renderOrder = 2; this.root.add(m); this.joints[name] = m; return m; };
    for (const n of ['neck', 'shoulders', 'hips', 'upperL', 'foreL', 'upperR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR', 'footL', 'footR']) seg(n);
    for (const [n, r] of [['elbowL', 0.032], ['elbowR', 0.032], ['kneeL', 0.045], ['kneeR', 0.045], ['shoulderL', 0.045], ['shoulderR', 0.045]]) ball(n, r);
    this.head = ball('head', 0.085);
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 6, 16), this.mat);
    this.torso.renderOrder = 2;
    this.root.add(this.torso);
    // glowing hands in the player's hand colours (mirror: the coach's +x hand matches your right hand)
    this.hands = {};
    for (const k of ['L', 'R']) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(sphere, energyMaterial(HAND_COLORS[k]));
      core.scale.setScalar(0.035);
      const shell = new THREE.Mesh(sphere, rimMaterial(HAND_COLORS[k], 1.4));
      shell.scale.setScalar(0.06);
      g.add(core, shell);
      this.root.add(g);
      this.hands[k] = { g, core, shell, cur: new THREE.Vector3(), target: new THREE.Vector3(), elbow: new THREE.Vector3() };
    }
    // projector base on the floor
    const base = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 48), new THREE.MeshBasicMaterial({ color: '#9be8ff', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.01;
    this.base = base;
    this.root.add(base);

    this.opacity = 0;
    this.show = false;
    this.distance = 2.4;
    this.laneX = 0; this.curX = 0;
    this.drop = 0; this.curDrop = 0;
    this.targets = { L: null, R: null };
    this.t = 0;
    this.root.visible = false;
  }

  setBody(b) {
    this.b = b;
    const H = b.stature;
    this.dim = {
      H, eye: b.standEyeY, sh: b.standEyeY - 0.118 * H, S: b.shoulderHalf, hip: 0.53 * H, hipHalf: 0.055 * H,
      knee: 0.285 * H, ankle: 0.045 * H, upper: b.reach * 0.47, fore: b.reach * 0.53,
    };
    this.seatedDrop = b.seated ? Math.max(0, b.standEyeY - b.eyeY) : 0;
    for (const k of ['L', 'R']) this.hands[k].cur.copy(this.rest(k === 'L' ? -1 : 1));
  }
  rest(side) {
    const d = this.dim;
    return new THREE.Vector3(side * (d.S + 0.05), d.hip - this.curDrop + 0.03, 0.08);
  }

  // player-space target (stage coordinates) → coach-local mirrored position
  mirror(p, out = new THREE.Vector3()) { return out.set(p.x - this.curX, p.y, -p.z); }

  // what to demonstrate this frame: hand targets in the player's stage space (or null to relax)
  demo({ L = null, R = null, laneX = null, drop = 0 } = {}) {
    this.targets.L = L; this.targets.R = R;
    if (laneX !== null) this.laneX = laneX;
    this.drop = drop;
  }

  update(dt, { visible }) {
    if (!this.b) return;
    this.t += dt;
    this.opacity += ((visible ? 1 : 0) - this.opacity) * Math.min(1, dt * 4);
    this.root.visible = this.opacity > 0.01;
    if (!this.root.visible) return;
    this.mat.uniforms.opacity.value = this.opacity;
    this.base.material.opacity = this.opacity * 0.5;
    for (const k of ['L', 'R']) this.hands[k].g.visible = this.opacity > 0.05;
    const d = this.dim, k = Math.min(1, dt * 9);
    this.curX += (this.laneX - this.curX) * Math.min(1, dt * 6);
    this.curDrop += (this.drop + this.seatedDrop - this.curDrop) * Math.min(1, dt * 7);
    this.root.position.set(this.curX, 0, -this.distance);
    const drop = this.curDrop, breath = Math.sin(this.t * 1.6) * 0.006;

    // legs (knees bend forward toward the player when dropping)
    const pelvisY = d.hip - drop;
    const thigh = d.hip - d.knee, shin = d.knee - d.ankle;
    const pole = new THREE.Vector3(0, 0, 1);
    for (const [side, s] of [['L', -1], ['R', 1]]) {
      const hip = new THREE.Vector3(s * d.hipHalf, pelvisY, 0);
      const ankle = new THREE.Vector3(s * (d.hipHalf + 0.02), d.ankle, 0.02);
      const knee = new THREE.Vector3(), end = new THREE.Vector3();
      solve(hip, ankle, thigh, shin, pole, knee, end);
      this.place(this.segs[`thigh${side}`], hip, knee, 0.055);
      this.place(this.segs[`shin${side}`], knee, end, 0.045);
      this.joints[`knee${side}`].position.copy(knee);
      this.place(this.segs[`foot${side}`], end, new THREE.Vector3(end.x, 0.03, end.z + 0.13), 0.035);
    }
    // torso, head
    const neckY = d.sh + 0.03 - drop + breath, chestTop = d.sh - 0.02 - drop + breath;
    const tlen = chestTop - pelvisY;
    this.torso.position.set(0, pelvisY + tlen / 2, 0);
    this.torso.scale.set(0.12, Math.max(0.05, tlen) / 3, 0.075); // capsule: length 1 + two caps of radius 1
    this.place(this.segs.hips, new THREE.Vector3(-d.hipHalf, pelvisY, 0), new THREE.Vector3(d.hipHalf, pelvisY, 0), 0.06);
    const shY = d.sh - drop + breath;
    const shL = new THREE.Vector3(-d.S, shY, 0), shR = new THREE.Vector3(d.S, shY, 0);
    this.place(this.segs.shoulders, shL, shR, 0.04);
    this.joints.shoulderL.position.copy(shL); this.joints.shoulderR.position.copy(shR);
    this.place(this.segs.neck, new THREE.Vector3(0, neckY, 0), new THREE.Vector3(0, d.eye - drop - 0.06, 0), 0.03);
    this.head.position.set(0, d.eye - drop + 0.02, 0);
    // arms
    for (const [side, s, sh] of [['L', -1, shL], ['R', 1, shR]]) {
      const h = this.hands[side];
      const tgt = this.targets[side];
      if (tgt) this.mirror(tgt, h.target); else h.target.copy(this.rest(s)).add(new THREE.Vector3(0, breath * 2, 0));
      h.cur.lerp(h.target, k);
      const armPole = new THREE.Vector3(s * 0.5, -1, -0.5);
      const end = new THREE.Vector3();
      solve(sh, h.cur, d.upper, d.fore, armPole, h.elbow, end);
      this.place(this.segs[`upper${side}`], sh, h.elbow, 0.034);
      this.place(this.segs[`fore${side}`], h.elbow, end, 0.029);
      this.joints[`elbow${side}`].position.copy(h.elbow);
      h.g.position.copy(end);
    }
  }

  place(mesh, a, b, r) {
    const len = a.distanceTo(b);
    mesh.position.addVectors(a, b).multiplyScalar(0.5);
    mesh.scale.set(r, Math.max(len, 1e-4), r);
    tmp.subVectors(b, a);
    if (tmp.lengthSq() < 1e-10) return;
    mesh.quaternion.setFromUnitVectors(up, tmp.normalize());
  }
}
