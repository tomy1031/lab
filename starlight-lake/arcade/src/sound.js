import { AudioEngine } from '../../src/audio.js';

// Upbeat, light arcade sound: a 112 bpm loop (kick, hat, bass, chord stabs, a plucked melody)
// and short, bright effects. Everything is synthesised; there are no audio files.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PROG = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];   // C Am F G
const SCALE = [0, 2, 4, 7, 9];

export class ArcadeSound extends AudioEngine {
  startAmbience() {
    this.mode = 'hub';
    this.seq = { next: this.ctx.currentTime + 0.15, step: 0 };
    this.bus = {};
    for (const k of ['drums', 'bass', 'chords', 'lead']) {
      const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.bed); this.bus[k] = g;
    }
    this.setMode('hub');
  }

  /** 'hub': soft chords and melody; 'play': the full band; 'quiet': almost nothing (countdowns, results). */
  setMode(mode) {
    this.mode = mode;
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    const lv = { hub: { drums: 0, bass: 0.25, chords: 0.5, lead: 0.35 }, play: { drums: 0.7, bass: 0.55, chords: 0.45, lead: 0.3 }, quiet: { drums: 0, bass: 0, chords: 0.25, lead: 0 } }[mode];
    for (const k in lv) this.bus[k].gain.setTargetAtTime(lv[k], t, 0.4);
  }

  update() {
    if (!this.enabled || !this.seq) return;
    const now = this.ctx.currentTime;
    const s16 = 60 / 112 / 4;
    while (this.seq.next < now + 0.2) {
      const t = this.seq.next, k = this.seq.step;
      const bar = Math.floor(k / 16) % PROG.length, pos = k % 16;
      const ch = PROG[bar];
      if (pos % 4 === 0) this.kick(t);
      if (pos % 4 === 2) this.hat(t, 0.06);
      if (pos % 2 === 1) this.hat(t, 0.025);
      if (pos === 0 || pos === 6 || pos === 10) this.tone(t, ch[0] - 24, 0.35, 'triangle', 0.22, this.bus.bass, 600);
      if (pos === 0 || pos === 8) for (const m of ch) this.tone(t, m, 0.9, 'sawtooth', 0.025, this.bus.chords, 1400);
      if (pos % 2 === 0 && ((k * 7) % 5) < 3) {
        const deg = SCALE[(k * 3 + bar) % 5] + 72 + (pos % 8 === 0 ? 0 : 12 * ((k >> 3) % 2));
        this.tone(t, deg, 0.25, 'triangle', 0.06, this.bus.lead, 3000);
      }
      this.seq.step++; this.seq.next += s16;
    }
  }

  tone(t, midi, dur, type, vel, dest, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  kick(t, dest = this.bus.drums) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.3);
  }

  hat(t, vel) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.hatBuf || (this.hatBuf = this.noiseBuffer(0.2));
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(this.bus.drums); s.start(t); s.stop(t + 0.06);
  }

  // ---------- effects ----------
  pop(pos, combo = 0) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.003, out = this.spatial(pos);
    const s = ctx.createBufferSource(); s.buffer = this.hatBuf || (this.hatBuf = this.noiseBuffer(0.2));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.07);
    const m = 72 + SCALE[combo % 5] + 12 * Math.min(2, Math.floor(combo / 5));
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(mtof(m) * 0.7, t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.05);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.28, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.4);
  }

  good(pos, combo = 0) {
    if (!this.enabled) return;
    const base = 72 + SCALE[combo % 5] + 12 * Math.min(1, Math.floor(combo / 5));
    this.bell(pos, { midi: base, vel: 0.4, dur: 0.9, bright: 1.6 });
    this.bell(pos, { midi: base + 7, vel: 0.2, dur: 0.7, bright: 1.2 });
  }

  bad(pos) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.003;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.18);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(f).connect(g).connect(this.spatial(pos)); o.start(t); o.stop(t + 0.25);
  }

  beep(high = false) {
    if (!this.enabled) return;
    this.tone(this.ctx.currentTime + 0.01, high ? 84 : 72, high ? 0.5 : 0.18, 'square', 0.08, this.sfx, 2500);
  }

  whistle() {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2100;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28; const lg = ctx.createGain(); lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.03); g.gain.setValueAtTime(0.12, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(this.sfx); o.start(t); lfo.start(t); o.stop(t + 0.65); lfo.stop(t + 0.65);
  }

  levelUp() {
    if (!this.enabled) return;
    [0, 4, 7, 12, 16].forEach((d, i) => this.tone(this.ctx.currentTime + 0.02 + i * 0.07, 72 + d, 0.5, 'triangle', 0.12, this.sfx, 4000));
  }

  stamp() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime + 0.01;
    this.kick(t, this.sfx); this.tone(t, 48, 0.4, 'sine', 0.3, this.sfx, 800);
    setTimeout(() => this.fanfare(null), 150);
  }
}
