// js/car/physics.js — Gran Turismo inspired vehicle physics: 6-speed gearbox, RPM, tire slip, slipstream, ERS boost, banking
import * as THREE from 'three';
import { clamp } from '../engine/gesture-math.js';

const GEAR_RATIOS = [0, 0.24, 0.40, 0.56, 0.72, 0.87, 1.04];

export class RaceCar {
  constructor({ id, name, team, carSpec, isPlayer = false, visual }) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.spec = carSpec;
    this.isPlayer = isPlayer;
    this.visual = visual;

    // Track-space state (guarantees rock-solid ground/banking adherence at 320 km/h)
    this.s = 0;            // arc length along spline (0..trackLen)
    this.d = 0;            // lateral offset from centerline (m)
    this.heading = 0;      // angle relative to track tangent (rad, + = right)
    this.speed = 0;        // forward speed (m/s)
    this.latVel = 0;       // lateral slip velocity (m/s)
    this.steerAngle = 0;
    this.wheelSpin = 0;

    // GT Telemetry
    this.gear = 1;
    this.rpm = 1400;
    this.rpmNorm = 0.18;
    this.ers = 1.0;        // 0..1 rechargeable overtake battery
    this.boosting = false;
    this.slipstream = 0;   // 0..1 draft bonus behind rival
    this.slip = 0;         // tire slip intensity (0..1)
    this.roll = 0;
    this.pitch = 0;
    this.offTrack = false;
    this.braking = 0;

    // Race Progress
    this.lap = 1;
    this.totalDist = 0;
    this.lapStartTime = 0;
    this.bestLap = Infinity;
    this.lastLap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.position = 1;

    // World transform cache
    this.worldPos = new THREE.Vector3();
    this.worldQuat = new THREE.Quaternion();
    this.forwardDir = new THREE.Vector3(0, 0, -1);
    this.rightDir = new THREE.Vector3(1, 0, 0);
    this.upDir = new THREE.Vector3(0, 1, 0);
  }

  placeOnGrid(spline, startS, lateralD) {
    this.s = spline.wrapS(startS);
    this.d = lateralD;
    this.heading = 0;
    this.speed = 0;
    this.latVel = 0;
    this.steerAngle = 0;
    this.gear = 1;
    this.rpm = 1600;
    this.rpmNorm = 0.2;
    this.ers = 1.0;
    this.boosting = false;
    this.slipstream = 0;
    this.slip = 0;
    this.roll = 0;
    this.pitch = 0;
    this.lap = 1;
    this.totalDist = startS - spline.length; // negative before crossing line initially
    if (this.totalDist > 0) this.totalDist -= spline.length;
    this.bestLap = Infinity;
    this.lastLap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.syncTransform(spline);
  }

  step(dt, input, spline, course, { canMove = true, raceTime = 0, totalLaps = 3, particles = null, onLap = null, onCollision = null } = {}) {
    const sp = this.spec;
    const frame = spline.sampleAt(this.s);

    // Pre-start revving on the grid
    if (!canMove) {
      const targetRpm = 0.2 + clamp(input.throttle, 0, 1) * 0.65;
      this.rpmNorm += (targetRpm - this.rpmNorm) * (1 - Math.exp(-8 * dt));
      this.rpm = Math.round(1100 + this.rpmNorm * (sp.audio.redline - 1100));
      this.braking = input.brake;
      this.visual.setVisualState({ steer: input.steer, wheelSpin: 0, brake: input.brake, roll: 0, pitch: 0, boost: false });
      return;
    }

    const throttle = clamp(input.throttle || 0, 0, 1);
    const brake = clamp(input.brake || 0, 0, 1);
    const steerIn = clamp(input.steer || 0, -1, 1);
    const driftHeld = !!input.drift;
    this.braking = brake;

    // ERS Overtake Boost management
    const wantBoost = !!input.boost && this.ers > 0.08 && throttle > 0.2;
    if (wantBoost) {
      this.boosting = true;
      this.ers = Math.max(0, this.ers - dt * 0.26);
    } else {
      this.boosting = false;
      // Harvest energy under braking + gentle passive regeneration
      const regen = brake > 0.2 && this.speed > 10 ? 0.18 * brake : 0.045;
      this.ers = Math.min(1, this.ers + dt * regen);
    }

    // Track surface detection
    const halfW = frame.width * 0.5;
    const maxWall = halfW + 2.3;
    this.offTrack = Math.abs(this.d) > halfW + 0.6;
    const surfGrip = course.gripMul * (this.offTrack ? 0.66 : 1.0);

    // Top speed & aerodynamic drag + slipstream + ERS
    const boostMul = this.boosting ? sp.ersPower : 1.0;
    const draftMul = 1.0 + this.slipstream * 0.11;
    const offRoadMul = this.offTrack ? 0.78 : 1.0;
    const maxV = sp.topSpeed * boostMul * draftMul * offRoadMul;

    // Forward acceleration & braking
    const speedRatio = clamp(this.speed / sp.topSpeed, 0, 1.35);
    const accelCurve = 1.08 - 0.55 * clamp(speedRatio, 0, 1);
    let forwardAccel = throttle * sp.accel * accelCurve * boostMul * draftMul;

    // Slope gravity effect (climb Bokor Mountain feels weighty, downhill flies!)
    const slope = frame.tangent.y;
    forwardAccel -= slope * 13.5;

    // Aerodynamic drag & rolling resistance
    const drag = 0.0028 * this.speed * Math.abs(this.speed) + 0.08 * this.speed;
    forwardAccel -= drag;

    // Braking & reverse
    if (brake > 0.05) {
      if (this.speed > 1.2) {
        forwardAccel -= brake * sp.brakeForce * surfGrip;
      } else {
        forwardAccel -= brake * 16;
      }
    }

    // Cornering scrubbing drag when sliding hard
    forwardAccel -= Math.abs(this.latVel) * 0.32;

    this.speed = clamp(this.speed + forwardAccel * dt, -14, maxV);

    // Steering & Realistic GT Grip / Slip Angle
    const steerSensitivity = 1.0 / (1.0 + Math.pow(Math.max(0, this.speed) / 48, 1.45));
    const targetSteer = steerIn * sp.steerRate * (0.48 + 0.52 * steerSensitivity);
    this.steerAngle += (targetSteer - this.steerAngle) * (1 - Math.exp(-12 * dt));

    // Yaw rate from steering + cornering grip
    const speedFactor = clamp(Math.abs(this.speed) / 14, 0, 1);
    const yawRate = this.steerAngle * speedFactor * (this.speed >= 0 ? 1 : -1) * (driftHeld ? 1.28 : 1.0);

    // Track curvature induces apparent heading change relative to spline tangent
    const ds = this.speed * Math.cos(this.heading) * dt;
    this.heading += yawRate * dt - frame.curvature * ds;

    // Lateral grip pulls slip back into line; hard turns + drift build thrilling controlled slip
    const downforceGrip = 1.0 + sp.downforce * speedRatio * 0.45;
    const effectiveGrip = (driftHeld ? sp.driftGrip : sp.grip) * surfGrip * downforceGrip;
    const lateralPull = this.speed * Math.sin(this.heading);
    this.latVel += (lateralPull - this.latVel) * clamp(effectiveGrip * 5.2 * dt, 0, 1);

    // Gentle self-aligning torque so driving with hands feels super natural and never spins out uncontrollably
    this.heading = clamp(this.heading, -0.82, 0.82);
    if (Math.abs(steerIn) < 0.08 && Math.abs(this.speed) > 4) {
      this.heading *= Math.exp(-2.8 * dt);
    }

    // Advance along track spline
    const prevS = this.s;
    this.s = spline.wrapS(this.s + ds);
    this.d += (this.latVel * 0.72 + Math.sin(this.heading) * this.speed * 0.38) * dt;
    this.totalDist += ds;

    // Guardrail collision with bounce & sparks
    if (Math.abs(this.d) > maxWall) {
      const side = Math.sign(this.d);
      this.d = side * maxWall;
      this.heading *= -0.25;
      this.latVel *= -0.3;
      this.speed *= 0.86;
      if (this.isPlayer && onCollision && Math.abs(this.speed) > 12) {
        onCollision(clamp(Math.abs(this.speed) / 60, 0.2, 0.9));
      }
      if (particles && Math.abs(this.speed) > 15) {
        particles.emitSpark(this.worldPos, this.rightDir.clone().multiplyScalar(-side), course.isCyber);
      }
    }

    // Lap crossing detection (wrapped from near track.length to near 0)
    if (ds > 0 && prevS > spline.length * 0.78 && this.s < spline.length * 0.22 && this.totalDist > spline.length * 0.4) {
      const lapTime = raceTime - this.lapStartTime;
      if (this.lapStartTime > 0 && lapTime > 10) {
        this.lastLap = lapTime;
        if (lapTime < this.bestLap) this.bestLap = lapTime;
      }
      this.lapStartTime = raceTime;
      if (this.lap >= totalLaps) {
        if (!this.finished) {
          this.finished = true;
          this.finishTime = raceTime;
          onLap?.(this, true);
        }
      } else {
        this.lap += 1;
        onLap?.(this, false);
      }
    }

    // 6-Speed Sequential Gearbox & Realistic RPM
    const absV = Math.max(0, this.speed);
    const vNorm = clamp(absV / sp.topSpeed, 0, 1.25);
    let gear = 1;
    for (let g = 1; g <= 6; g++) {
      if (vNorm >= GEAR_RATIOS[g - 1] * 0.92) gear = g;
    }
    this.gear = this.speed < -0.5 ? 0 : gear; // 0 = Reverse
    const gMin = GEAR_RATIOS[Math.max(0, gear - 1)];
    const gMax = GEAR_RATIOS[Math.min(6, gear)];
    const inGear = clamp((vNorm - gMin * 0.72) / Math.max(0.08, gMax - gMin * 0.72), 0.12, 1.03);
    this.rpmNorm += (inGear - this.rpmNorm) * (1 - Math.exp(-14 * dt));
    this.rpm = Math.round(1200 + this.rpmNorm * (sp.audio.redline - 1200));

    // Tire slip & body suspension roll/pitch
    const latG = clamp((steerIn * absV) / 42, -1.3, 1.3);
    this.slip = clamp(Math.abs(this.heading) * 1.4 + (driftHeld ? 0.35 : 0) + (this.offTrack ? 0.3 : 0), 0, 1);
    const targetRoll = -latG * 0.052;
    const targetPitch = clamp((brake * 0.042) - (throttle * 0.025 * (this.boosting ? 1.5 : 1)), -0.05, 0.055);
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-10 * dt));
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-10 * dt));

    // Sync 3D transform & emit tire smoke / boost flames
    this.syncTransform(spline);
    this.wheelSpin = (this.speed * dt) / 0.36;
    this.visual.setVisualState({
      steer: steerIn,
      wheelSpin: this.wheelSpin,
      brake,
      roll: this.roll,
      pitch: this.pitch,
      boost: this.boosting,
    });

    if (particles && absV > 18) {
      if (this.slip > 0.36 && Math.random() < 0.45) {
        const rearPos = this.worldPos.clone().addScaledVector(this.forwardDir, -1.5);
        particles.emitSmoke(rearPos, this.forwardDir.clone().multiplyScalar(this.speed * 0.3), course.isCyber ? [0.15, 0.8, 0.95] : [0.8, 0.82, 0.85]);
      }
      if (this.boosting && Math.random() < 0.65) {
        const exPos = this.worldPos.clone().addScaledVector(this.forwardDir, -2.35).addScaledVector(this.upDir, 0.32);
        particles.emitBoostFlame(exPos, this.forwardDir.clone().negate(), course.isCyber || sp.bodyStyle === 'cyber');
      }
    }
  }

  syncTransform(spline) {
    const f = spline.sampleAt(this.s);
    this.worldPos.copy(f.pos).addScaledVector(f.right, this.d).addScaledVector(f.normal, 0.04);

    // Orient car with road banking & slope, then rotate by local heading
    const baseMat = new THREE.Matrix4().makeBasis(f.right, f.normal, f.tangent.clone().negate());
    this.worldQuat.setFromRotationMatrix(baseMat);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading);
    this.worldQuat.multiply(yawQ);

    this.forwardDir.set(0, 0, -1).applyQuaternion(this.worldQuat).normalize();
    this.rightDir.set(1, 0, 0).applyQuaternion(this.worldQuat).normalize();
    this.upDir.set(0, 1, 0).applyQuaternion(this.worldQuat).normalize();

    this.visual.root.position.copy(this.worldPos);
    this.visual.root.quaternion.copy(this.worldQuat);
  }

  // Realistic displayed km/h (with subtle GT motorsport speed sensation factor)
  get kmh() {
    return Math.round(Math.abs(this.speed) * 3.85);
  }
}
