// js/audio.js — every sound is made on the spot with Web Audio (no files, so it also works offline):
// a slow drone whose chord changes with the chapter, and small sounds for buttons, slices, ticks and waves.
const CHORDS = [
  [55, 82.41, 110, 164.81], // hub: A
  [49, 73.42, 98, 146.83], // ladder: G
  [43.65, 65.41, 87.31, 130.81], // flatland: F
  [46.25, 69.3, 92.5, 138.59], // slices: F#
  [41.2, 61.74, 82.41, 123.47], // shadows: E
  [36.71, 55, 73.42, 110], // gravity: D
  [32.7, 49, 65.41, 98], // tesseract: C
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.chord = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    // a long feedback delay as a cheap "space"
    const dl = ctx.createDelay(2);
    dl.delayTime.value = 0.43;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    dl.connect(lp).connect(fb).connect(dl);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    dl.connect(this.wet).connect(this.master);
    this.send = dl;
    // drone
    this.droneOut = ctx.createGain();
    this.droneOut.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 520;
    dlp.Q.value = 0.6;
    this.droneOut.connect(dlp).connect(this.master);
    dlp.connect(this.send);
    this.oscs = CHORDS[0].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.32, 0.22, 0.12][i];
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.031;
      const lg = ctx.createGain();
      lg.gain.value = f * 0.004;
      lfo.connect(lg).connect(o.frequency);
      lfo.start();
      o.connect(g).connect(this.droneOut);
      o.start();
      return o;
    });
    this.droneOut.gain.setTargetAtTime(0.11, ctx.currentTime, 2.5);
    this.setChord(this.chord);
  }

  setChord(i) {
    this.chord = i;
    if (!this.ctx) return;
    const ch = CHORDS[i % CHORDS.length];
    this.oscs.forEach((o, k) => o.frequency.setTargetAtTime(ch[k], this.ctx.currentTime, 1.2));
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  blip(freq, dur = 0.12, { type = 'sine', vol = 0.12, slide = 0, wet = 0.4 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.master);
    if (wet) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      g.connect(w).connect(this.send);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  click() { this.blip(880, 0.07, { type: 'triangle', vol: 0.08, wet: 0.2 }); }
  whoosh() { this.blip(180, 0.9, { type: 'sawtooth', vol: 0.05, slide: 3.5, wet: 0.8 }); this.blip(360, 0.9, { vol: 0.06, slide: 2.5 }); }
  chime(k = 0) { const f = [523.25, 659.25, 783.99, 1046.5, 1318.5][k % 5]; this.blip(f, 1.4, { vol: 0.07, wet: 0.9 }); this.blip(f * 1.5, 1.1, { vol: 0.03, wet: 0.9 }); }
  tick() { this.blip(2400, 0.03, { type: 'square', vol: 0.03, wet: 0.1 }); }
  thud(v = 1) { this.blip(90, 0.25, { vol: 0.12 * v, slide: 0.5, wet: 0.2 }); }
  ripple() { this.blip(70, 2.2, { vol: 0.16, slide: 0.6, wet: 1 }); this.blip(140, 1.6, { type: 'triangle', vol: 0.05, slide: 0.7, wet: 1 }); }
  boom() { this.blip(60, 0.8, { type: 'sawtooth', vol: 0.12, slide: 0.3, wet: 0.6 }); }
}
