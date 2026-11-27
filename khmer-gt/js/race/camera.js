// js/race/camera.js — Smooth Gran Turismo chase / hood / cockpit / showroom camera & VR rig comfort stabilizer
import * as THREE from 'three';
import { clamp } from '../engine/gesture-math.js';

export const CAMERA_MODES = ['chase', 'cockpit', 'hood'];

export class CameraRig {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.modeIndex = 0; // 0 = chase, 1 = cockpit, 2 = hood
    this.showroomAngle = 0.65;

    // VR seat rig: sits in the driver's cockpit and stabilizes horizon to prevent motion sickness
    this.vrRig = new THREE.Group();
    this.vrRig.name = 'VRRig';
    this.vrSpace = new THREE.Group();
    this.vrRig.add(this.vrSpace);
    this.scene.add(this.vrRig);

    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._smPos = new THREE.Vector3(0, 3, 8);
    this._smLook = new THREE.Vector3(0, 1, 0);
    this._inited = false;
  }

  get mode() {
    return CAMERA_MODES[this.modeIndex];
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    return this.mode;
  }

  setVRMode(presenting) {
    if (presenting) {
      if (this.camera.parent !== this.vrSpace) {
        this.vrSpace.add(this.camera);
        this.camera.position.set(0, 0, 0);
        this.camera.rotation.set(0, 0, 0);
      }
    } else {
      if (this.camera.parent === this.vrSpace) {
        this.vrSpace.remove(this.camera);
        this.scene.add(this.camera);
      }
    }
  }

  // Recenter VR seated head offset
  recenterVR() {
    this.vrSpace.position.set(0, 0, 0);
    this.vrSpace.rotation.set(0, 0, 0);
  }

  // Update camera in GT Showroom menu mode (orbiting gracefully around the selected car on track)
  updateShowroom(dt, targetCarPos, targetForward, presenting = false) {
    this.showroomAngle += dt * 0.24;
    if (presenting) {
      // In VR menu, place user inside the driver's seat looking at the floating GT holo-panel
      this.vrRig.position.copy(targetCarPos).add(new THREE.Vector3(0, 1.06, 0));
      const yaw = Math.atan2(-targetForward.x, -targetForward.z);
      this.vrRig.rotation.set(0, yaw, 0);
      return;
    }
    const r = 7.4;
    const cx = targetCarPos.x + Math.sin(this.showroomAngle) * r;
    const cz = targetCarPos.z + Math.cos(this.showroomAngle) * r;
    const cy = targetCarPos.y + 1.95 + Math.sin(this.showroomAngle * 0.7) * 0.25;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(targetCarPos.x, targetCarPos.y + 0.35, targetCarPos.z);
    this.camera.fov = 44;
    this.camera.updateProjectionMatrix();
    this._inited = false;
  }

  // Update camera during race (supports VR cockpit & desktop chase / cockpit / hood)
  updateRace(dt, car, presenting = false) {
    if (!car) return;

    if (presenting) {
      // VR Cockpit: sit inside car at driver eye level, horizon-leveled roll for high comfort
      this.vrRig.position.copy(car.worldPos)
        .addScaledVector(car.upDir, 1.12)
        .addScaledVector(car.forwardDir, -0.12);
      const yaw = Math.atan2(-car.forwardDir.x, -car.forwardDir.z);
      const pitch = Math.asin(clamp(car.forwardDir.y, -0.45, 0.45)) * 0.55;
      this.vrRig.rotation.set(pitch, yaw, 0, 'YXZ');
      return;
    }

    const mode = this.mode;
    const speedRatio = clamp(Math.abs(car.speed) / car.spec.topSpeed, 0, 1.3);

    if (mode === 'cockpit') {
      this._pos.copy(car.worldPos)
        .addScaledVector(car.upDir, 1.12)
        .addScaledVector(car.forwardDir, -0.10);
      this._look.copy(this._pos)
        .addScaledVector(car.forwardDir, 24)
        .addScaledVector(car.upDir, -0.8)
        .addScaledVector(car.rightDir, car.steerAngle * 1.4);
      this.camera.position.copy(this._pos);
      this.camera.up.copy(car.upDir);
      this.camera.lookAt(this._look);
      this.camera.fov = 66 + speedRatio * 10 + (car.boosting ? 7 : 0);
      this.camera.updateProjectionMatrix();
      return;
    }

    if (mode === 'hood') {
      this._pos.copy(car.worldPos)
        .addScaledVector(car.upDir, 1.24)
        .addScaledVector(car.forwardDir, 1.15);
      this._look.copy(this._pos).addScaledVector(car.forwardDir, 30);
      this.camera.position.copy(this._pos);
      this.camera.up.copy(car.upDir);
      this.camera.lookAt(this._look);
      this.camera.fov = 64 + speedRatio * 12 + (car.boosting ? 8 : 0);
      this.camera.updateProjectionMatrix();
      return;
    }

    // Classic Gran Turismo dynamic Chase Camera
    const dist = 6.2 + speedRatio * 1.05 + (car.boosting ? 0.65 : 0);
    const height = 2.28 + speedRatio * 0.16;
    this._pos.copy(car.worldPos)
      .addScaledVector(car.forwardDir, -dist)
      .addScaledVector(car.upDir, height)
      .addScaledVector(car.rightDir, -car.steerAngle * 0.55);

    this._look.copy(car.worldPos)
      .addScaledVector(car.forwardDir, 10.5)
      .addScaledVector(car.upDir, 0.92);

    if (!this._inited) {
      this._smPos.copy(this._pos);
      this._smLook.copy(this._look);
      this._inited = true;
    } else {
      const k = 1 - Math.exp(-11 * dt);
      this._smPos.lerp(this._pos, k);
      this._smLook.lerp(this._look, 1 - Math.exp(-15 * dt));
    }

    this.camera.position.copy(this._smPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._smLook);
    this.camera.fov = 60 + speedRatio * 13 + (car.boosting ? 8 : 0);
    this.camera.updateProjectionMatrix();
  }
}
