// js/audio.js — Procedural Matrix Sci-Fi Spatial Synth (100% Web Audio, offline)
export class MatrixAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneFilter = null;
    this.droneGain = null;
    this.shimmerGain = null;
    this.shimmerOsc = null;
    this.tickTimer = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(ctx.destination);

      // Deep Matrix sub-drone
      this.droneFilter = ctx.createBiquadFilter();
      this.droneFilter.type = 'lowpass';
      this.droneFilter.frequency.value = 180;
      this.droneFilter.Q.value = 3.5;

      this.droneGain = ctx.createGain();
      this.droneGain.gain.value = 0.22;

      this.droneOsc1 = ctx.createOscillator();
      this.droneOsc1.type = 'sawtooth';
      this.droneOsc1.frequency.value = 55; // A1

      this.droneOsc2 = ctx.createOscillator();
      this.droneOsc2.type = 'triangle';
      this.droneOsc2.frequency.value = 82.41; // E2 fifth

      this.droneOsc1.connect(this.droneFilter);
      this.droneOsc2.connect(this.droneFilter);
      this.droneFilter.connect(this.droneGain);
      this.droneGain.connect(this.master);
      this.droneOsc1.start();
      this.droneOsc2.start();

      // Ethereal crystalline harmonic for photon-freeze / higher dimensions
      this.shimmerOsc = ctx.createOscillator();
      this.shimmerOsc.type = 'sine';
      this.shimmerOsc.frequency.value = 528;
      this.shimmerGain = ctx.createGain();
      this.shimmerGain.gain.value = 0.0;
      this.shimmerOsc.connect(this.shimmerGain);
      this.shimmerGain.connect(this.master);
      this.shimmerOsc.start();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.32, this.ctx.currentTime, 0.06);
    }
  }

  setAtmosphere({ baseFreq = 55, cutoff = 180, shimmer = 0, shimmerFreq = 528 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneOsc1.frequency.setTargetAtTime(baseFreq, t, 0.25);
    this.droneOsc2.frequency.setTargetAtTime(baseFreq * 1.498, t, 0.25);
    this.droneFilter.frequency.setTargetAtTime(cutoff, t, 0.2);
    this.shimmerGain.gain.setTargetAtTime(shimmer * 0.14, t, 0.25);
    this.shimmerOsc.frequency.setTargetAtTime(shimmerFreq, t, 0.25);
  }

  click(freq = 880) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.045);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Relativistic external clock tick — pitch and sharpness scale with time rate (1/gamma)
  clockTick(rate = 1, isProper = false) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const base = isProper ? 1320 : Math.max(110, 760 * Math.pow(Math.max(0.05, rate), 0.65));
    osc.type = isProper ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.08);
    const vol = isProper ? 0.06 : 0.13 * Math.min(1, 0.25 + rate * 0.85);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // Matrix realm transition digital sweep
  realmShift() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const freqs = [220, 330, 440, 660, 880];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const st = t + i * 0.025;
      osc.frequency.setValueAtTime(f, st);
      osc.frequency.exponentialRampToValueAtTime(f * 1.8, st + 0.16);
      g.gain.setValueAtTime(0.06, st);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.22);
      osc.connect(g);
      g.connect(this.master);
      osc.start(st);
      osc.stop(st + 0.24);
    });
  }

  // Quantum collapse sharp digital snap
  quantumCollapse(observed = true) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = observed ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(observed ? 1480 : 320, t);
    osc.frequency.exponentialRampToValueAtTime(observed ? 140 : 960, t + 0.18);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  // Photon launch / geodesic pulse
  photonLaunch(pitch = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(160 * pitch, t + 0.26);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Superstring harmonic pluck (rich additive resonance tuned to mode n)
  pluckString(mode = 1, intensity = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    // Pentatonic-physics harmonic scale: C3, G3, C4, E4, G4, B4...
    const roots = [130.81, 196.0, 261.63, 329.63, 392.0, 493.88];
    const base = roots[Math.max(0, Math.min(roots.length - 1, mode - 1))];
    const partials = [1, 2, 3, 4.02];
    partials.forEach((mult, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(base * mult, t);
      const amp = (0.16 * intensity) / (idx + 1);
      const dur = 1.6 / (idx * 0.7 + 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  }
}
