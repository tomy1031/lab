// js/engine/audio.js — Procedural Gran Turismo style engine synthesizer, turbo whistle, tire squeal, wind & cyber synth
import { clamp } from './gesture-math.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this.master = null;
    this.engineGain = null;
    this.oscs = [];
    this.engineFilter = null;
    this.turboOsc = null;
    this.turboGain = null;
    this.squealGain = null;
    this.squealFilter = null;
    this.windGain = null;
    this.windFilter = null;
    this.carAudio = null;
    this.lastGear = 1;
  }

  unlock() {
    if (this.ready) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(this.ctx.destination);

      // Engine harmonic bank
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 320;
      this.engineFilter.Q.value = 2.6;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0001;
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);

      this.oscs = [];
      for (let i = 0; i < 4; i++) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i === 0 ? 'sawtooth' : i === 1 ? 'triangle' : 'sawtooth';
        osc.frequency.value = 55 * (i + 1);
        g.gain.value = i === 0 ? 0.48 : i === 1 ? 0.30 : i === 2 ? 0.16 : 0.08;
        osc.connect(g);
        g.connect(this.engineFilter);
        osc.start();
        this.oscs.push({ osc, gain: g });
      }

      // Turbo / Plasma whine
      this.turboOsc = this.ctx.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.value = 1100;
      this.turboGain = this.ctx.createGain();
      this.turboGain.gain.value = 0.0001;
      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.master);
      this.turboOsc.start();

      // Noise buffer for tire squeal & wind rush
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      const squealSrc = this.ctx.createBufferSource();
      squealSrc.buffer = buf;
      squealSrc.loop = true;
      this.squealFilter = this.ctx.createBiquadFilter();
      this.squealFilter.type = 'bandpass';
      this.squealFilter.frequency.value = 1450;
      this.squealFilter.Q.value = 6.5;
      this.squealGain = this.ctx.createGain();
      this.squealGain.gain.value = 0.0001;
      squealSrc.connect(this.squealFilter);
      this.squealFilter.connect(this.squealGain);
      this.squealGain.connect(this.master);
      squealSrc.start();

      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 420;
      this.windFilter.Q.value = 1.2;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0001;
      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      windSrc.start();

      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
  }

  setCarProfile(car) {
    this.carAudio = car.audio;
    if (!this.ready) return;
    for (let i = 0; i < this.oscs.length; i++) {
      this.oscs[i].osc.type = i === 0 ? car.audio.type : i === 1 ? 'triangle' : 'sawtooth';
    }
  }

  updateDriving({ active, rpmNorm, throttle, speedRatio, slip, gear, boosting }) {
    if (!this.ready || !this.ctx || !this.carAudio) return;
    const now = this.ctx.currentTime;
    if (!active) {
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
      this.turboGain.gain.setTargetAtTime(0.0001, now, 0.08);
      this.squealGain.gain.setTargetAtTime(0.0001, now, 0.05);
      this.windGain.gain.setTargetAtTime(0.0001, now, 0.08);
      return;
    }

    const a = this.carAudio;
    const r = clamp(rpmNorm, 0.08, 1.08);
    const fundamental = a.baseFreq + (a.maxFreq - a.baseFreq) * Math.pow(r, 1.12);
    const harms = a.harmonics || [1, 1.5, 2, 3];

    for (let i = 0; i < this.oscs.length; i++) {
      const mult = harms[i] || (i + 1);
      this.oscs[i].osc.frequency.setTargetAtTime(fundamental * mult, now, 0.025);
    }

    const load = 0.24 + throttle * 0.56 + (boosting ? 0.18 : 0);
    this.engineFilter.frequency.setTargetAtTime(240 + r * 1450 + throttle * 900 + (boosting ? 650 : 0), now, 0.03);
    this.engineGain.gain.setTargetAtTime(0.22 * load, now, 0.03);

    // Turbo spool / plasma whine
    const turboLevel = (a.turbo || 0) * clamp(r * throttle + (boosting ? 0.55 : 0), 0, 1.2);
    this.turboOsc.frequency.setTargetAtTime(950 + r * 2600 + (boosting ? 900 : 0), now, 0.04);
    this.turboGain.gain.setTargetAtTime(turboLevel * 0.055, now, 0.04);

    // Gear shift pop / backfire
    if (gear !== this.lastGear && gear > this.lastGear && speedRatio > 0.22) {
      this.playShiftPop();
    }
    this.lastGear = gear;

    // Tire squeal
    const sq = clamp((slip - 0.22) * 1.4, 0, 1) * clamp(speedRatio * 2.2, 0, 1);
    this.squealFilter.frequency.setTargetAtTime(1250 + sq * 520, now, 0.04);
    this.squealGain.gain.setTargetAtTime(sq * 0.14, now, 0.04);

    // Aerodynamic wind rush
    const w = Math.pow(clamp(speedRatio, 0, 1.2), 1.8);
    this.windFilter.frequency.setTargetAtTime(280 + w * 950, now, 0.06);
    this.windGain.gain.setTargetAtTime(w * 0.11, now, 0.06);
  }

  playShiftPop() {
    if (!this.ready || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playBeep(freq = 520, dur = 0.14, vol = 0.2) {
    if (!this.ready || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playClick() {
    this.playBeep(760, 0.055, 0.12);
  }

  playCollision(intensity = 0.6) {
    if (!this.ready || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.18);
    g.gain.setValueAtTime(clamp(intensity, 0.15, 1) * 0.26, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  playLapFanfare(isFinal = false) {
    if (!this.ready || !this.ctx || this.muted) return;
    const notes = isFinal ? [523.25, 659.25, 783.99, 1046.5] : [587.33, 880];
    notes.forEach((f, i) => {
      setTimeout(() => this.playBeep(f, isFinal ? 0.26 : 0.16, 0.18), i * 110);
    });
  }
}
