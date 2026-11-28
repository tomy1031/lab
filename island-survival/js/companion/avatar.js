// companion/avatar.js — a VRM 1.0 character with procedural animation (no animation files):
// idle breathing, walk / run cycles, sit, sleep (lying), work (chop / gather / dig), wave, shiver, eat, cheer,
// sick (hunched), plus facial expressions, automatic blinking, look-at and lip sync from a voice level.
//
//   const av = await Avatar.load(url, scene)
//   av.setPose('walk' | 'run' | 'idle' | 'sit' | 'sleep' | 'work' | 'gather' | 'wave' | 'eat' | 'cheer' | 'shiver' | 'sick' | 'fish')
//   av.setMood({ happy, sad, angry, surprised, relaxed })   0…1 each (blended)
//   av.update(dt, { speed, talkLevel, lookAt: Vector3|null })
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];

const S = Math.sin, C = Math.cos;
// Each pose returns { bone: [x, y, z] } Euler angles (normalized VRM bones, model facing +Z) and an optional
// hips offset { hipY, hipZ, rootPitch }. t = seconds, p = phase for cycles.
const ARM_DOWN = 1.22;
const POSES = {
  idle: (t) => ({
    spine: [0.02 + S(t * 1.6) * 0.012, 0, 0], chest: [S(t * 1.6) * 0.015, 0, 0], neck: [0, S(t * 0.3) * 0.08, 0], head: [S(t * 0.5) * 0.03, S(t * 0.23) * 0.12, 0],
    leftUpperArm: [0.05, 0, -ARM_DOWN + S(t * 1.6) * 0.02], rightUpperArm: [0.05, 0, ARM_DOWN - S(t * 1.6) * 0.02],
    leftLowerArm: [0, 0, -0.12], rightLowerArm: [0, 0, 0.12],
  }),
  walk: (t, p) => ({
    hips: [0, S(p) * 0.06, 0], hipY: -Math.abs(S(p)) * 0.025 + 0.01,
    spine: [0.05, -S(p) * 0.05, 0], chest: [0, -S(p) * 0.05, 0], head: [-0.03, S(p) * 0.04, 0],
    leftUpperLeg: [-S(p) * 0.5, 0, 0], rightUpperLeg: [S(p) * 0.5, 0, 0],
    leftLowerLeg: [Math.max(0, S(p + 1.4)) * 0.75 + 0.05, 0, 0], rightLowerLeg: [Math.max(0, -S(p + 1.4)) * 0.75 + 0.05, 0, 0],
    leftFoot: [S(p) * 0.15, 0, 0], rightFoot: [-S(p) * 0.15, 0, 0],
    leftUpperArm: [S(p) * 0.45, 0, -ARM_DOWN + 0.06], rightUpperArm: [-S(p) * 0.45, 0, ARM_DOWN - 0.06],
    leftLowerArm: [0, -0.25, -0.15], rightLowerArm: [0, 0.25, 0.15],
  }),
  run: (t, p) => ({
    hips: [0.1, S(p) * 0.1, 0], hipY: -Math.abs(S(p)) * 0.06 + 0.03,
    spine: [0.15, -S(p) * 0.1, 0], chest: [0.05, -S(p) * 0.08, 0], head: [-0.15, S(p) * 0.05, 0],
    leftUpperLeg: [-S(p) * 0.85 - 0.15, 0, 0], rightUpperLeg: [S(p) * 0.85 - 0.15, 0, 0],
    leftLowerLeg: [Math.max(0, S(p + 1.2)) * 1.4 + 0.25, 0, 0], rightLowerLeg: [Math.max(0, -S(p + 1.2)) * 1.4 + 0.25, 0, 0],
    leftUpperArm: [S(p) * 0.8, 0, -ARM_DOWN + 0.2], rightUpperArm: [-S(p) * 0.8, 0, ARM_DOWN - 0.2],
    leftLowerArm: [0, -1.2, -0.2], rightLowerArm: [0, 1.2, 0.2],
  }),
  sit: (t) => ({ // sitting on the ground, knees up, forearms on the knees
    hipY: -0.66, spine: [0.22 + S(t * 1.5) * 0.01, 0, 0], chest: [0.06, 0, 0], head: [-0.05, S(t * 0.25) * 0.15, 0],
    leftUpperLeg: [-1.95, 0.12, 0.08], rightUpperLeg: [-1.95, -0.12, -0.08], leftLowerLeg: [2.25, 0, 0], rightLowerLeg: [2.25, 0, 0],
    leftFoot: [-0.3, 0, 0], rightFoot: [-0.3, 0, 0],
    leftUpperArm: [-0.85, 0, -ARM_DOWN + 0.2], rightUpperArm: [-0.85, 0, ARM_DOWN - 0.2], leftLowerArm: [0, -0.55, 0], rightLowerArm: [0, 0.55, 0],
  }),
  sleep: (t) => ({
    rootPitch: -Math.PI / 2, lift: 0.13,
    spine: [S(t * 0.8) * 0.02, 0, 0], head: [0, 0.4, 0],
    leftUpperArm: [0, 0, -ARM_DOWN - 0.1], rightUpperArm: [-0.5, 0, ARM_DOWN], rightLowerArm: [0, 1.4, 0],
    leftUpperLeg: [-0.15, 0, 0], rightUpperLeg: [-0.4, 0, 0], rightLowerLeg: [0.7, 0, 0],
  }),
  work: (t) => { // chopping / hammering: right arm strokes down
    const k = (t * 1.6) % 1, sw = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
    return {
      spine: [0.1 + sw * 0.3, 0.12, 0], chest: [sw * 0.12, 0, 0], head: [0.15, 0, 0],
      rightUpperArm: [-2.7 + sw * 2.0, 0, ARM_DOWN - 0.25], rightLowerArm: [0, 0.35, 0],
      leftUpperArm: [-2.5 + sw * 1.9, 0, -ARM_DOWN + 0.35], leftLowerArm: [0, -0.45, 0],
      leftUpperLeg: [-0.2, 0, 0], rightUpperLeg: [0.15, 0, 0], leftLowerLeg: [0.25, 0, 0],
    };
  },
  gather: (t) => ({ // crouched, hands reaching to the ground alternately
    hipY: -0.32, spine: [0.55, 0, 0], chest: [0.2, 0, 0], head: [0.25, 0, 0],
    leftUpperLeg: [-1.2, 0, 0.1], rightUpperLeg: [-0.8, 0, -0.1], leftLowerLeg: [1.9, 0, 0], rightLowerLeg: [1.4, 0, 0],
    leftUpperArm: [-0.75 + S(t * 3) * 0.25, 0, -ARM_DOWN + 0.05], rightUpperArm: [-0.75 - S(t * 3) * 0.25, 0, ARM_DOWN - 0.05],
    leftLowerArm: [0, -0.2, 0], rightLowerArm: [0, 0.2, 0],
  }),
  fish: (t) => ({ // holding a rod with both hands, small bobbing
    spine: [0.05, 0, 0], head: [0.15, 0, 0],
    rightUpperArm: [-0.55 + S(t * 0.7) * 0.05, 0, ARM_DOWN - 0.15], rightLowerArm: [0, 0.9, 0],
    leftUpperArm: [-0.45, 0, -ARM_DOWN + 0.2], leftLowerArm: [0, -1.1, 0],
  }),
  wave: (t) => ({
    spine: [0, 0, 0.04], head: [0, 0, -0.08],
    rightUpperArm: [0, -0.2, ARM_DOWN - 2.6], rightLowerArm: [0, 0, 0.3 + S(t * 9) * 0.45], rightHand: [0, 0, S(t * 9) * 0.2],
    leftUpperArm: [0.05, 0, -ARM_DOWN], leftLowerArm: [0, 0, -0.1],
  }),
  cheer: (t) => ({
    hipY: Math.max(0, S(t * 8)) * 0.06, spine: [-0.08, 0, 0], head: [-0.15, 0, 0],
    rightUpperArm: [0, 0, ARM_DOWN - 2.9 + S(t * 8) * 0.1], leftUpperArm: [0, 0, -ARM_DOWN + 2.9 - S(t * 8) * 0.1],
    rightLowerArm: [0, 0, 0.2], leftLowerArm: [0, 0, -0.2],
  }),
  eat: (t) => ({
    spine: [0.08, 0, 0], head: [0.12 + Math.max(0, S(t * 4)) * 0.08, 0, 0],
    rightUpperArm: [-0.35, 0, ARM_DOWN - 0.15], rightLowerArm: [0, 2.2 + S(t * 4) * 0.15, 0],
    leftUpperArm: [-0.2, 0, -ARM_DOWN + 0.1], leftLowerArm: [0, -1.3, 0],
  }),
  shiver: (t) => ({
    spine: [0.2 + S(t * 37) * 0.015, S(t * 41) * 0.02, 0], chest: [0.1, 0, 0], head: [0.2, S(t * 33) * 0.03, 0], neck: [0.1, 0, 0],
    leftUpperArm: [-0.35, 0, -ARM_DOWN + 0.15 + S(t * 39) * 0.03], rightUpperArm: [-0.35, 0, ARM_DOWN - 0.15 - S(t * 43) * 0.03],
    leftLowerArm: [0, -2.2, 0], rightLowerArm: [0, 2.2, 0], leftUpperLeg: [0, 0, 0.05], rightUpperLeg: [0, 0, -0.05],
  }),
  sick: (t) => ({
    hipY: -0.04, spine: [0.32 + S(t * 1.1) * 0.02, 0, 0], chest: [0.15, 0, 0], head: [0.3, 0, 0.08],
    leftUpperArm: [-0.25, 0, -ARM_DOWN + 0.1], rightUpperArm: [-0.25, 0, ARM_DOWN - 0.1], leftLowerArm: [0, -1.5, 0], rightLowerArm: [0, 1.5, 0],
    leftUpperLeg: [-0.12, 0, 0], rightUpperLeg: [-0.12, 0, 0], leftLowerLeg: [0.25, 0, 0], rightLowerLeg: [0.25, 0, 0],
  }),
  point: (t) => ({
    spine: [0, -0.2, 0], head: [0, -0.3, 0],
    rightUpperArm: [-1.5, -0.3, ARM_DOWN], rightLowerArm: [0, 0.05, 0], leftUpperArm: [0.05, 0, -ARM_DOWN], leftLowerArm: [0, 0, -0.12],
  }),
  swim: (t, p) => ({
    rootPitch: -1.25, lift: 0.9,
    leftUpperArm: [S(p) * 1.5 - 1.6, 0, -ARM_DOWN + 0.3], rightUpperArm: [-S(p) * 1.5 - 1.6, 0, ARM_DOWN - 0.3],
    leftUpperLeg: [S(p * 2) * 0.35, 0, 0], rightUpperLeg: [-S(p * 2) * 0.35, 0, 0], head: [-0.7, 0, 0],
  }),
};

export class Avatar {
  static async load(url, scene, onProgress) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url, onProgress);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons?.(gltf.scene);
    if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    return new Avatar(vrm, scene);
  }

  constructor(vrm, scene) {
    this.vrm = vrm;
    this.root = new THREE.Group();      // placed in the world by the companion controller
    this.inner = new THREE.Group();     // pitched when lying / swimming
    this.inner.add(vrm.scene);
    this.root.add(this.inner);
    scene.add(this.root);
    this.bones = {};
    for (const b of BONES) this.bones[b] = vrm.humanoid.getNormalizedBoneNode(b);
    this.pose = 'idle';
    this.prevPose = 'idle';
    this.blend = 1;
    this.t = 0;
    this.phase = 0;
    this.mood = { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 };
    this.moodTarget = { ...this.mood };
    this.blinkT = 2; this.blinkV = 0;
    this.mouth = 0;
    this.lookTarget = new THREE.Object3D();
    scene.add(this.lookTarget);
    if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;
    this.hipBase = this.bones.hips ? this.bones.hips.position.clone() : new THREE.Vector3();
    this.tmpE = new THREE.Euler();
    this.tmpQ = new THREE.Quaternion();
    this.height = 1.55;
  }

  setPose(p) {
    if (!POSES[p] || p === this.pose) return;
    this.prevPose = this.pose;
    this.pose = p;
    this.blend = 0;
  }

  setMood(m) { Object.assign(this.moodTarget, { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 }, m); }

  /** opts: { speed m/s, talkLevel 0…1, lookAt Vector3 | null } */
  update(dt, opts = {}) {
    const vrm = this.vrm;
    this.t += dt;
    const speed = opts.speed || 0;
    // cycle phase: one stride ≈ 1.3 m when walking
    const stride = this.pose === 'run' ? 2.2 : this.pose === 'swim' ? 1.5 : 1.3;
    this.phase += dt * (speed > 0.05 ? (speed / stride) * Math.PI * 2 * 0.5 : 0) + (this.pose === 'swim' ? dt * 3 : 0);
    this.blend = Math.min(1, this.blend + dt / 0.35);
    const a = POSES[this.prevPose](this.t, this.phase), b = POSES[this.pose](this.t, this.phase);
    const w = this.blend * this.blend * (3 - 2 * this.blend);
    for (const name of BONES) {
      const node = this.bones[name];
      if (!node) continue;
      const ea = a[name] || [0, 0, 0], eb = b[name] || [0, 0, 0];
      this.tmpE.set(ea[0] + (eb[0] - ea[0]) * w, ea[1] + (eb[1] - ea[1]) * w, ea[2] + (eb[2] - ea[2]) * w);
      node.quaternion.setFromEuler(this.tmpE);
    }
    const lerpN = (k) => (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * w;
    if (this.bones.hips) {
      this.bones.hips.position.set(this.hipBase.x, this.hipBase.y + lerpN('hipY'), this.hipBase.z + lerpN('hipZ'));
    }
    this.inner.rotation.x = lerpN('rootPitch');
    this.inner.position.y = lerpN('lift');

    // expressions
    const em = vrm.expressionManager;
    if (em) {
      for (const k of Object.keys(this.mood)) {
        this.mood[k] += (this.moodTarget[k] - this.mood[k]) * (1 - Math.exp(-3 * dt));
        em.setValue(k, this.mood[k] * (this.pose === 'sleep' ? 0 : 1));
      }
      // blink
      this.blinkT -= dt;
      if (this.blinkT <= 0) { this.blinkV = 1; this.blinkT = 2 + Math.random() * 4; }
      this.blinkV = Math.max(0, this.blinkV - dt * 8);
      const closed = this.pose === 'sleep' ? 1 : Math.min(1, (this.blinkV > 0.5 ? (1 - this.blinkV) * 2 : this.blinkV * 2) + 0) * (1 - this.mood.happy * 0.8);
      em.setValue('blink', closed);
      // lip sync: a bit of variation between vowels
      const lv = Math.min(1, (opts.talkLevel || 0) * 1.4);
      this.mouth += (lv - this.mouth) * (1 - Math.exp(-25 * dt));
      const v = (S(this.t * 13) + S(this.t * 7.3)) * 0.5;
      em.setValue('aa', this.mouth * (0.65 + 0.35 * Math.max(0, v)));
      em.setValue('ih', this.mouth * Math.max(0, -v) * 0.5);
      em.setValue('ou', this.mouth * Math.max(0, S(this.t * 5.1)) * 0.35);
    }
    if (opts.lookAt && vrm.lookAt) {
      this.lookTarget.position.copy(opts.lookAt);
      vrm.lookAt.autoUpdate = true;
    } else if (vrm.lookAt) {
      this.root.getWorldPosition(this.lookTarget.position);
      const f = new THREE.Vector3(0, 1.4, 3).applyQuaternion(this.root.quaternion);
      this.lookTarget.position.add(f);
    }
    vrm.update(dt);
  }

  /** world position of the head (for speech bubbles, look-at, audio) */
  headPosition(out = new THREE.Vector3()) {
    const h = this.bones.head;
    if (h) return h.getWorldPosition(out);
    return this.root.getWorldPosition(out).add(new THREE.Vector3(0, 1.45, 0));
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.lookTarget.parent?.remove(this.lookTarget);
    VRMUtils.deepDispose?.(this.vrm.scene);
  }
}

export const AVATAR_POSES = Object.keys(POSES);
