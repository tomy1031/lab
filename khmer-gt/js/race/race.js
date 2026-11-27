// js/race/race.js — Full 8-car Gran Turismo race manager: 5-light start sequence, slipstream, collisions, standings, lap times
import * as THREE from 'three';
import { AI_DRIVERS, getCarById } from '../data/cars.js';
import { buildCarModel } from '../car/model.js';
import { RaceCar } from '../car/physics.js';
import { RacingAI } from '../car/ai.js';
import { clamp } from '../engine/gesture-math.js';

export class RaceManager {
  constructor(scene, audio, particles) {
    this.scene = scene;
    this.audio = audio;
    this.particles = particles;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.cars = [];
    this.ais = [];
    this.player = null;
    this.spline = null;
    this.course = null;
    this.startLights = [];

    this.state = 'idle'; // idle | countdown | racing | finished
    this.countdownTimer = 0;
    this.lightsLit = 0;
    this.raceTime = 0;
    this.totalLaps = 3;
    this.difficulty = 'pro';
    this.wrongWay = false;
    this.onFinish = null;
    this.onLapBanner = null;
  }

  clear() {
    while (this.group.children.length) {
      this.group.remove(this.group.children[0]);
    }
    this.cars = [];
    this.ais = [];
    this.player = null;
    this.state = 'idle';
  }

  setup({ spline, course, playerCarId, totalLaps = 3, difficulty = 'pro', startLights = [] }) {
    this.clear();
    this.spline = spline;
    this.course = course;
    this.totalLaps = totalLaps;
    this.difficulty = difficulty;
    this.startLights = startLights;
    this.raceTime = 0;
    this.countdownTimer = 0;
    this.lightsLit = 0;
    this.state = 'countdown';

    // Build 7 AI rivals + 1 Player (starting P6 on an 8-car staggered GT grid for exciting overtakes!)
    const gridOrder = [];
    for (let i = 0; i < 7; i++) {
      const drv = AI_DRIVERS[i];
      const spec = getCarById(drv.carId);
      const visual = buildCarModel(spec, { color: drv.color, accent: drv.accent });
      this.group.add(visual.root);
      const car = new RaceCar({
        id: `ai_${i}`,
        name: drv.name,
        team: drv.team,
        carSpec: spec,
        isPlayer: false,
        visual,
      });
      this.cars.push(car);
      this.ais.push(new RacingAI(car, drv.skill, difficulty));
      gridOrder.push(car);
    }

    // Player car
    const pSpec = getCarById(playerCarId);
    const pVisual = buildCarModel(pSpec);
    this.group.add(pVisual.root);
    this.player = new RaceCar({
      id: 'player',
      name: 'YOU',
      team: 'KHMER GT WORKS',
      carSpec: pSpec,
      isPlayer: true,
      visual: pVisual,
    });
    this.cars.push(this.player);
    // Insert player at grid slot 6 (index 5) so there are 5 cars ahead and 2 behind
    gridOrder.splice(5, 0, this.player);

    // Place cars on 2x4 staggered starting grid behind start line (s = 0)
    gridOrder.forEach((car, idx) => {
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      const startS = spline.length - 12 - row * 10.5 - col * 3.5;
      const lateralD = col === 0 ? -3.4 : 3.4;
      car.placeOnGrid(spline, startS, lateralD);
      car.position = idx + 1;
    });

    this.audio?.setCarProfile(pSpec);
    this.updateStartLights(0);
  }

  updateStartLights(count, green = false) {
    for (let i = 0; i < this.startLights.length; i++) {
      const mat = this.startLights[i];
      if (!mat) continue;
      if (green) {
        mat.emissive.set('#27f56b');
        mat.emissiveIntensity = 3.2;
      } else if (i < count) {
        mat.emissive.set('#ff1e2d');
        mat.emissiveIntensity = 3.0;
      } else {
        mat.emissive.set('#ff1e2d');
        mat.emissiveIntensity = 0.0;
      }
    }
  }

  update(dt, playerInput, paused = false) {
    if (paused || !this.player || !this.spline || this.state === 'idle') return;

    // 1. GT 5-Light Start Sequence (3.2 seconds)
    if (this.state === 'countdown') {
      this.countdownTimer += dt;
      const lit = Math.min(5, Math.floor(this.countdownTimer / 0.52) + 1);
      if (lit !== this.lightsLit && this.countdownTimer < 2.85) {
        this.lightsLit = lit;
        this.updateStartLights(lit, false);
        this.audio?.playBeep(440 + lit * 22, 0.12, 0.16);
      }
      if (this.countdownTimer >= 3.05) {
        this.state = 'racing';
        this.updateStartLights(5, true);
        this.audio?.playBeep(980, 0.32, 0.24);
        for (const c of this.cars) c.lapStartTime = 0;
        setTimeout(() => this.updateStartLights(0, false), 1400);
      }
    }

    const canMove = this.state === 'racing' || this.state === 'finished';
    if (this.state === 'racing') {
      this.raceTime += dt;
    }

    // 2. Compute slipstream (drafting behind any car 5..34m ahead in same lane)
    for (const c of this.cars) {
      let bestDraft = 0;
      for (const other of this.cars) {
        if (other === c) continue;
        let ds = other.s - c.s;
        if (ds < -this.spline.length * 0.5) ds += this.spline.length;
        if (ds > this.spline.length * 0.5) ds -= this.spline.length;
        if (ds > 5 && ds < 34 && Math.abs(other.d - c.d) < 2.4 && c.speed > 30) {
          const factor = (1 - (ds - 5) / 29) * (1 - Math.abs(other.d - c.d) / 2.4);
          if (factor > bestDraft) bestDraft = factor;
        }
      }
      c.slipstream += (bestDraft - c.slipstream) * (1 - Math.exp(-6 * dt));
    }

    // 3. Step Player & AI cars
    const onLap = (car, isFinish) => {
      if (!car.isPlayer) return;
      if (isFinish) {
        this.state = 'finished';
        this.audio?.playLapFanfare(true);
        this.onFinish?.(this.getStandings());
      } else {
        this.audio?.playLapFanfare(false);
        this.onLapBanner?.(`LAP ${car.lap} / ${this.totalLaps}`, car.lastLap);
      }
    };

    const onCollision = (intensity) => {
      this.audio?.playCollision(intensity);
    };

    // Player runs on AI autopilot softly after crossing finish line for cinematic cool-down lap
    let pIn = playerInput;
    if (this.player.finished) {
      if (!this._cooldownAI) this._cooldownAI = new RacingAI(this.player, 0.72, 'rookie');
      pIn = this._cooldownAI.computeInput(dt, this.spline, this.cars, null);
    } else {
      this._cooldownAI = null;
    }

    this.player.step(dt, pIn, this.spline, this.course, {
      canMove,
      raceTime: this.raceTime,
      totalLaps: this.totalLaps,
      particles: this.particles,
      onLap,
      onCollision,
    });

    for (const ai of this.ais) {
      const inp = ai.computeInput(dt, this.spline, this.cars, this.player);
      ai.car.step(dt, inp, this.spline, this.course, {
        canMove,
        raceTime: this.raceTime,
        totalLaps: this.totalLaps,
        particles: this.particles,
        onLap: null,
        onCollision: null,
      });
    }

    // 4. Car-to-car side-by-side collision resolution
    if (canMove) {
      for (let i = 0; i < this.cars.length; i++) {
        for (let j = i + 1; j < this.cars.length; j++) {
          const a = this.cars[i];
          const b = this.cars[j];
          let ds = b.s - a.s;
          if (ds < -this.spline.length * 0.5) ds += this.spline.length;
          if (ds > this.spline.length * 0.5) ds -= this.spline.length;
          const dd = b.d - a.d;
          if (Math.abs(ds) < 4.5 && Math.abs(dd) < 2.15) {
            const pushD = (2.15 - Math.abs(dd)) * 0.52 * (dd >= 0 ? 1 : -1);
            a.d -= pushD;
            b.d += pushD;
            const avgV = (a.speed + b.speed) * 0.5;
            a.speed = a.speed * 0.75 + avgV * 0.25 - 1.2;
            b.speed = b.speed * 0.75 + avgV * 0.25 - 1.2;
            if ((a.isPlayer || b.isPlayer) && Math.abs(a.speed - b.speed) > 4) {
              this.audio?.playCollision(0.55);
              this.particles?.emitSpark(a.worldPos.clone().lerp(b.worldPos, 0.5), a.upDir, this.course.isCyber);
            }
          }
        }
      }
    }

    // 5. Update live race standings
    const sorted = this.getStandings();
    sorted.forEach((c, idx) => {
      c.position = idx + 1;
    });

    // Wrong-way check
    this.wrongWay = this.player.speed < -2.5;

    // 6. Update GT engine audio for player car
    this.audio?.updateDriving({
      active: true,
      rpmNorm: this.player.rpmNorm,
      throttle: clamp(pIn.throttle || 0, 0, 1),
      speedRatio: clamp(Math.abs(this.player.speed) / this.player.spec.topSpeed, 0, 1.3),
      slip: this.player.slip,
      gear: this.player.gear,
      boosting: this.player.boosting,
    });
  }

  getStandings() {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalDist - a.totalDist;
    });
  }
}
