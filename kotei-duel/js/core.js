// js/core.js — the three.js renderer, the camera rig, the WebXR session and the offline (PWA) status:
// everything the duel needs that is not the duel itself.
//
// The table always stays at the same place in the world (its top at TABLE_H, your seat at +z).
// - PC / phone: the camera sits at your chair and looks down at the mat; it leans a little toward
//   what you point at (and you can look around with the right mouse button / two fingers).
// - VR: the "rig" carries your play space. When you enter (and whenever you press 「机を合わせる」), it is moved
//   so that the table top is about 45 cm below your eyes and the mat is in front of you — seated or standing.
import * as THREE from 'three';
import { TABLE_H } from './room.js';

const $ = (id) => document.getElementById(id);

export class Core {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.params = params;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.25;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(0.4);
    $('stage').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.02, 60);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.xrActive = false;
    // PC camera: where it sits and what it looks at (eased)
    this.pcEye = new THREE.Vector3(0, TABLE_H + 0.62, 0.78);
    this.pcLook = new THREE.Vector3(0, TABLE_H, 0.02);
    this.look = this.pcLook.clone();
    this.orbit = { yaw: 0, pitch: 0 };
    this.placePC(true);
    addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    this.onFrame = null;
    r.setAnimationLoop((t, frame) => this.frame(frame));
  }

  resize() {
    if (this.renderer.xr.isPresenting) return;
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    // portrait phones: step back so the whole mat fits
    this.camera.fov = w / h < 0.8 ? 70 : w / h < 1.2 ? 60 : 52;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // where the PC camera should be (portrait screens sit higher and further back)
  placePC(snap = false) {
    const aspect = innerWidth / innerHeight;
    const far = aspect < 0.8 ? 1.45 : aspect < 1.2 ? 1.18 : 1;
    const eye = new THREE.Vector3(0, TABLE_H + 0.62 * far, 0.78 * far);
    // look around (right drag): yaw/pitch around the look point
    const off = eye.clone().sub(this.pcLook);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbit.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbit.yaw);
    off.applyAxisAngle(right, this.orbit.pitch);
    this.pcEye.copy(this.pcLook).add(off);
    if (snap) { this.camera.position.copy(this.pcEye); this.look.copy(this.pcLook); this.camera.lookAt(this.look); }
  }

  frame(xrFrame) {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.xrActive) {
      this.placePC();
      const a = 1 - Math.exp(-6 * dt);
      this.camera.position.lerp(this.pcEye, a);
      this.look.lerp(this.pcLook, a);
      this.camera.lookAt(this.look);
    } else if (this.needCalibrate && xrFrame) {
      this.calT = (this.calT || 0) + dt;
      if (this.calT > 0.6) this.calibrate();
    }
    if (this.onFrame) this.onFrame(dt, xrFrame);
    this.renderer.render(this.scene, this.camera);
  }

  // ---- VR ----
  async vrSupported() {
    try { return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'))); } catch { return false; }
  }

  async enterVR() {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await this.renderer.xr.setSession(session);
      session.addEventListener('end', () => this.onVREnd());
      try { if (session.updateTargetFrameRate && session.supportedFrameRates?.includes(90)) await session.updateTargetFrameRate(90); } catch { /* keep default */ }
    } catch (e) {
      this.toast('VR を はじめられませんでした：' + (e.message || e));
      return false;
    }
    this.xrActive = true;
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.rig.position.set(0, 0, 0.62);
    this.rig.rotation.set(0, 0, 0);
    this.needCalibrate = true;
    this.calT = 0;
    this.onVRStart?.();
    return true;
  }

  exitVR() { const s = this.renderer.xr.getSession(); if (s) s.end(); }

  onVREnd() {
    this.xrActive = false;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.placePC(true);
    this.resize();
    this.onVRExit?.();
  }

  // move the play space so the mat is in front of the eyes and ~45 cm below them
  calibrate() {
    this.needCalibrate = false;
    const xrCam = this.renderer.xr.getCamera();
    const head = new THREE.Vector3();
    xrCam.getWorldPosition(head);
    const local = this.rig.worldToLocal(head.clone()); // head in play space
    // yaw of the head (in play space)
    const q = new THREE.Quaternion();
    xrCam.getWorldQuaternion(q);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const yawWorld = Math.atan2(-fwd.x, -fwd.z);
    const yawLocal = yawWorld - this.rig.rotation.y;
    // we want: the head at (0, TABLE_H + 0.45, 0.5) in the world, facing −z
    const want = new THREE.Vector3(0, TABLE_H + 0.45, 0.5);
    const eyeH = Math.max(0.9, local.y);
    this.rig.rotation.set(0, -yawLocal, 0);
    const rotated = new THREE.Vector3(local.x, 0, local.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yawLocal);
    this.rig.position.set(want.x - rotated.x, want.y - eyeH, want.z - rotated.z);
    this.onCalibrated?.();
  }
  recalibrate() { this.needCalibrate = true; this.calT = 0.5; }

  // ---- page helpers ----
  toast(msg, action) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.run(); t.classList.add('hidden'); }; t.appendChild(b); }
    t.classList.remove('hidden');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.add('hidden'), action ? 15000 : 4500);
  }

  // the published build registers the service worker, which keeps every file for offline use
  offline() {
    const el = $('offline'), txt = $('offline-text');
    if (!el) return;
    if (!window.KD_BUILD || !('serviceWorker' in navigator)) {
      txt.textContent = window.KD_BUILD ? 'この ブラウザは オフライン保存に 対応していません' : '開発版（オフライン保存は 公開版で 有効）';
      return;
    }
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const ready = () => { el.classList.add('ok'); txt.textContent = `オフラインでも 遊べます（版 ${window.KD_BUILD}）`; };
      if (reg.active) ready();
      navigator.serviceWorker.ready.then(ready);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) this.toast('新しい 版が あります。', { label: '更新する', run: () => w.postMessage('SKIP_WAITING') });
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController || this.xrActive) return;
        reloaded = true;
        location.reload();
      });
    }).catch(() => { txt.textContent = 'オフライン保存に 失敗しました（オンラインでは 遊べます）'; });
  }
}
