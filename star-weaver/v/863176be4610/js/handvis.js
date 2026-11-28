// handvis.js — how your hands look: an energy orb with a gyro ring and a light trail for controllers,
// a hologram skeleton (25 joints) when hand tracking is on.
import * as THREE from 'three';
import { energyMaterial, rimMaterial, Trail } from './gfx.js';
import { HAND_COLORS } from './palette.js';
import { assets } from './entities.js';

const JOINTS = ['wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'];
const BONES = [];
for (let f = 0; f < 5; f++) {
  const b = 1 + f * 5 - (f > 0 ? 1 : 0); // thumb has 4 joints, others 5
  const chain = f === 0 ? [0, 1, 2, 3, 4] : [0, b, b + 1, b + 2, b + 3, b + 4];
  for (let i = 0; i < chain.length - 1; i++) BONES.push([chain[i], chain[i + 1]]);
}

const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);

export class HandVisual {
  constructor(parent, side) {
    this.side = side;
    const col = HAND_COLORS[side];
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    this.g = new THREE.Group();
    this.core = new THREE.Mesh(sphere, energyMaterial(col)); this.core.scale.setScalar(0.026);
    this.shell = new THREE.Mesh(sphere, rimMaterial(col, 1.6)); this.shell.scale.setScalar(0.048);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.0025, 6, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo = new THREE.Sprite(assets().glowMat[side]); this.halo.scale.setScalar(0.16);
    this.g.add(this.halo, this.shell, this.core, this.ring);
    parent.add(this.g);
    this.trail = new Trail(parent, { length: 14, width: 0.016, color: col, opacity: 0.6 });
    // hand-tracking skeleton
    this.jointMesh = new THREE.InstancedMesh(sphere, energyMaterial(col), JOINTS.length);
    this.jointMesh.frustumCulled = false;
    const bonePos = new Float32Array(BONES.length * 6);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(bonePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.bones = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bones.frustumCulled = false;
    parent.add(this.jointMesh, this.bones);
    this.local = JOINTS.map(() => new THREE.Vector3());
    this.t = 0;
  }

  update(dt, h, eye, toLocal, active) {
    this.t += dt;
    const on = active && h.tracked;
    const skeleton = on && h.isHand && h.joints;
    this.g.visible = on;
    this.trail.visible = on && !skeleton;
    this.jointMesh.visible = this.bones.visible = !!skeleton;
    if (!on) { this.trail.ready = false; return; }
    this.g.position.copy(h.local);
    this.ring.rotation.set(this.t * 2.1, this.t * 1.3, 0);
    const s = skeleton ? 0.55 : 1;
    this.g.scale.setScalar(s * (1 + Math.min(0.4, h.speed * 0.1)));
    if (!skeleton) { this.trail.push(h.local, eye); return; }
    // joints → stage space
    const pos = this.bones.geometry.attributes.position.array;
    let seen = 0;
    JOINTS.forEach((name, i) => {
      const j = h.joints[name];
      if (j && j.visible) { toLocal(j.position, this.local[i]); seen++; }
      const r = name.endsWith('tip') ? 0.007 : 0.009;
      m4.compose(this.local[i], q, v.copy(one).multiplyScalar(r));
      this.jointMesh.setMatrixAt(i, m4);
    });
    this.jointMesh.instanceMatrix.needsUpdate = true;
    BONES.forEach(([a, b], i) => {
      const A = this.local[a], B = this.local[b], k = i * 6;
      pos[k] = A.x; pos[k + 1] = A.y; pos[k + 2] = A.z; pos[k + 3] = B.x; pos[k + 4] = B.y; pos[k + 5] = B.z;
    });
    this.bones.geometry.attributes.position.needsUpdate = true;
    if (!seen) this.jointMesh.visible = this.bones.visible = false;
  }
}
