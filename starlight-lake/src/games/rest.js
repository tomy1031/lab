import * as THREE from 'three';
import { Module } from './base.js';
import { Glow } from '../stimuli.js';
import { easeInOut } from '../util.js';
import { noteOf } from '../audio.js';

// Quiet interludes between the games:
//  - a breathing orb gliding far <-> near (smooth vergence, slow 4 s in / 6 s out breathing),
//  - gazing at a light on the far mountains (遠方凝視), and blinking: blink rates drop in VR,
//  - in screen mode, a real 20-20-20 break: look out of a window at something far away.

export class RestModule extends Module {
  start() {
    super.start();
    const app = this.app;
    this.variant = this.opts.variant || 'far';
    this.near = app.settings.age >= 40 ? 0.9 : 0.7;
    this.orb = new Glow(0xbfe8ff, { core: 6, halo: 0.6 });
    this.root.add(this.orb.mesh);
    this.peak = new Glow(0xffe2a8, { core: 16, halo: 0.7, star: 0.8 });
    this.root.add(this.peak.mesh);
    this.peak.opacity = 0;
    this.steps = [];
    if (this.variant === 'screen') {
      this.steps.push({ kind: 'window', dur: 22 });
    } else {
      if (this.variant === 'intro') this.steps.push({ kind: 'breath', dur: 30 });
      this.steps.push({ kind: 'far', dur: this.variant === 'intro' ? 10 : 18 });
      this.steps.push({ kind: 'blink', dur: 8 });
    }
    this.si = -1; this.st = 0;
    this.next();
  }

  next() {
    this.si++;
    this.st = 0;
    const s = this.steps[this.si];
    if (!s) { this.done = true; return; }
    const app = this.app;
    if (s.kind === 'breath') app.caption('光の玉を目で追いながら、ゆっくり呼吸しましょう', 5);
    if (s.kind === 'far') app.caption('遠くの山の灯りを、ぼんやりと眺めましょう', s.dur);
    if (s.kind === 'blink') { app.caption('ゆっくり、3回まばたき', s.dur); this.blinks = 0; }
    if (s.kind === 'window') app.caption('画面から目を離して、窓の外のいちばん遠くを20秒眺めましょう', s.dur);
    this.lastBreath = -1;
  }

  update(dt) {
    super.update(dt);
    if (this.done) return;
    const app = this.app;
    const s = this.steps[this.si];
    this.st += dt;
    if (s.kind === 'breath') {
      // 10-second cycle: 4 s inhale (orb approaches), 6 s exhale (orb recedes)
      const cyc = this.st % 10;
      const inhale = cyc < 4;
      const k = inhale ? easeInOut(cyc / 4) : 1 - easeInOut((cyc - 4) / 6);
      const d = 6 + (this.near - 6) * k;
      const pos = this.at(0, -3, d);
      this.orb.mesh.position.copy(pos);
      this.orb.mesh.scale.setScalar(0.12 + 0.02 * Math.sin(this.t * 2));
      this.orb.opacity = Math.min(1, this.st);
      this.face(this.orb.mesh);
      const phase = inhale ? 0 : 1;
      if (phase !== this.lastBreath) {
        this.lastBreath = phase;
        app.audio.breath(inhale, inhale ? 4 : 6);
        app.caption(inhale ? 'すって…' : 'はいて…', inhale ? 3.5 : 5.5);
      }
    } else {
      this.orb.opacity = Math.max(0, this.orb.uniforms.uOpacity.value - dt);
    }
    if (s.kind === 'far' || s.kind === 'blink') {
      const pos = this.at(-6, 2.2, 300);
      this.peak.mesh.position.copy(pos);
      this.peak.mesh.scale.setScalar(300 * Math.tan(THREE.MathUtils.degToRad(1.6)));
      this.face(this.peak.mesh);
      this.peak.opacity = Math.min(1, this.st * 0.7) * (0.8 + 0.2 * Math.sin(this.t * 1.5));
    } else this.peak.opacity = Math.max(0, this.peak.uniforms.uOpacity.value - dt);
    if (s.kind === 'blink') {
      const due = Math.floor(this.st / 2.4);
      if (due > this.blinks && this.blinks < 3) {
        this.blinks++;
        app.audio.bell(this.at(0, 0, 3), { midi: noteOf(5 + this.blinks), vel: 0.2, dur: 1.8 });
      }
    }
    if (s.kind === 'window' && Math.floor(this.st) !== Math.floor(this.st - dt) && Math.floor(this.st) === s.dur - 1) {
      app.audio.bell(null, { midi: noteOf(7), vel: 0.4, dur: 2 });
    }
    if (this.st >= s.dur) this.next();
  }

  onSelectStart() {
    // tapping during the far gaze gently skips ahead
    const s = this.steps[this.si];
    if (s && s.kind !== 'breath' && this.st > 4) this.next();
  }
}
