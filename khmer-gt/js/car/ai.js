// js/car/ai.js — Smart GT racing AI with corner lookahead braking, racing line apexing, overtaking & rubber-band balance
import { clamp } from '../engine/gesture-math.js';

const DIFFICULTY_MUL = {
  rookie: 0.84,
  pro: 0.95,
  master: 1.03,
};

export class RacingAI {
  constructor(car, skill = 0.92, difficulty = 'pro') {
    this.car = car;
    this.skill = skill;
    this.difficulty = difficulty;
    this.preferredLane = (Math.random() - 0.5) * 4.5;
    this.laneTimer = 1 + Math.random() * 3;
    this.targetD = this.preferredLane;
  }

  computeInput(dt, spline, allCars, playerCar) {
    const c = this.car;
    const diffMul = DIFFICULTY_MUL[this.difficulty] || 0.95;

    // Look ahead at 3 distances to judge upcoming corner sharpness
    const fNear = spline.sampleAt(c.s + 22);
    const fMid = spline.sampleAt(c.s + 52);
    const fFar = spline.sampleAt(c.s + 92);

    const maxCurv = Math.max(Math.abs(fNear.curvature), Math.abs(fMid.curvature) * 1.05, Math.abs(fFar.curvature) * 0.9);
    const cornerSpeed = maxCurv > 0.0025
      ? clamp(Math.sqrt(0.42 / maxCurv), 28, c.spec.topSpeed)
      : c.spec.topSpeed;

    // Subtle GT competitive pack pacing so races stay wheel-to-wheel exciting without feeling unfair
    let packMul = 1.0;
    if (playerCar) {
      const gap = c.totalDist - playerCar.totalDist;
      if (gap > 110) packMul = 0.92;
      else if (gap < -120) packMul = 1.05;
    }

    const desiredSpeed = Math.min(c.spec.topSpeed * 1.02, cornerSpeed) * this.skill * diffMul * packMul;

    // Racing line: hug inside apex of upcoming corner, or overtake cars ahead
    const halfW = fNear.width * 0.42;
    let apexD = clamp(fMid.curvature * 180, -halfW * 0.72, halfW * 0.72);

    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2.2 + Math.random() * 2.8;
      this.preferredLane = (Math.random() - 0.5) * 3.8;
    }
    let goalD = apexD * 0.7 + this.preferredLane * 0.3;

    // Overtake / collision avoidance with nearby cars ahead
    for (const other of allCars) {
      if (other === c) continue;
      let ds = other.s - c.s;
      if (ds < -spline.length * 0.5) ds += spline.length;
      if (ds > spline.length * 0.5) ds -= spline.length;
      if (ds > 1.5 && ds < 26 && Math.abs(other.d - c.d) < 3.6) {
        const passSide = other.d > 0 ? -1 : 1;
        goalD = clamp(other.d + passSide * 4.4, -halfW, halfW);
        break;
      }
    }

    this.targetD += (clamp(goalD, -halfW, halfW) - this.targetD) * (1 - Math.exp(-3.5 * dt));

    // Steering controller toward targetD and aligned with track tangent
    const errD = this.targetD - c.d;
    const targetHeading = clamp(errD * 0.085, -0.45, 0.45);
    const headingErr = targetHeading - c.heading;
    const steer = clamp(headingErr * 2.8 + fNear.curvature * 14, -1, 1);

    // Throttle / brake control
    let throttle = 0;
    let brake = 0;
    if (c.speed < desiredSpeed - 1.5) {
      throttle = 1.0;
    } else if (c.speed > desiredSpeed + 4.0) {
      brake = clamp((c.speed - desiredSpeed) / 18, 0.15, 0.92);
    } else {
      throttle = 0.55;
    }

    // Use ERS boost on long straights when behind
    const boost = maxCurv < 0.003 && c.ers > 0.65 && c.speed > 42 && playerCar && c.totalDist < playerCar.totalDist + 20;

    return {
      steer,
      throttle,
      brake,
      boost,
      drift: Math.abs(steer) > 0.72 && c.speed > 36,
    };
  }
}
