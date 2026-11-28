// js/audio.js — every sound is made here with Web Audio (no files, so it works offline):
// card swishes, summons, traps, hits, bugs, the lesson chime, fanfares and a quiet looping BGM.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = true;
    this.musicT = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.bgm = this.ctx.createGain();
    this.bgm.gain.value = 0.16;
    this.bgm.connect(this.master);
    const n = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, n, n);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  get ok() { return this.ctx && !this.muted; }

  tone(freq, t0, dur, { type = 'sine', vol = 0.3, to = null, attack = 0.005, out = this.sfx } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noise(t0, dur, { vol = 0.2, f = 2000, q = 1, type = 'bandpass', to = null } = {}) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  play(name) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'draw': this.noise(t, 0.16, { vol: 0.25, f: 1800, to: 5000, q: 0.8 }); break;
      case 'hover': this.tone(1400, t, 0.04, { vol: 0.04, type: 'triangle' }); break;
      case 'click': this.tone(880, t, 0.07, { vol: 0.12, type: 'triangle' }); break;
      case 'place':
        this.tone(140, t, 0.18, { vol: 0.35, to: 70 });
        this.noise(t, 0.08, { vol: 0.2, f: 900 });
        break;
      case 'summon':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.06, 0.5, { type: 'triangle', vol: 0.16 }));
        this.noise(t, 0.6, { vol: 0.12, f: 600, to: 6000, q: 0.6 });
        break;
      case 'spell':
        [660, 880, 1320].forEach((f, i) => this.tone(f, t + i * 0.05, 0.35, { type: 'sine', vol: 0.14 }));
        break;
      case 'trap':
        this.tone(220, t, 0.25, { type: 'square', vol: 0.12 });
        this.tone(233, t + 0.12, 0.3, { type: 'square', vol: 0.12 });
        this.noise(t, 0.3, { vol: 0.2, f: 3000, q: 3 });
        break;
      case 'hit':
        this.tone(110, t, 0.3, { vol: 0.45, to: 45 });
        this.noise(t, 0.25, { vol: 0.35, f: 600, type: 'lowpass' });
        break;
      case 'guard': this.tone(520, t, 0.18, { type: 'square', vol: 0.08, to: 300 }); this.noise(t, 0.1, { vol: 0.15, f: 4000, q: 2 }); break;
      case 'bug':
        for (let i = 0; i < 5; i++) this.tone(200 + Math.random() * 900, t + i * 0.04, 0.05, { type: 'sawtooth', vol: 0.07 });
        break;
      case 'catch':
        this.tone(988, t, 0.12, { type: 'square', vol: 0.07 });
        this.tone(1319, t + 0.08, 0.2, { type: 'square', vol: 0.07 });
        break;
      case 'lesson':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.09, 0.9, { type: 'sine', vol: 0.09 }));
        break;
      case 'phase':
        this.tone(523, t, 0.15, { type: 'triangle', vol: 0.12 });
        this.tone(784, t + 0.1, 0.25, { type: 'triangle', vol: 0.12 });
        break;
      case 'warn': this.tone(330, t, 0.3, { type: 'sawtooth', vol: 0.08, to: 220 }); break;
      case 'good': [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.07, 0.3, { type: 'triangle', vol: 0.12 })); break;
      case 'bad': [392, 311].forEach((f, i) => this.tone(f, t + i * 0.16, 0.35, { type: 'triangle', vol: 0.12 })); break;
      case 'win':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.12, 0.5, { type: 'triangle', vol: 0.14 }));
        break;
      case 'lose':
        [392, 370, 349, 330].forEach((f, i) => this.tone(f, t + i * 0.25, 0.5, { type: 'sawtooth', vol: 0.06 }));
        break;
      default: this.tone(660, t, 0.1, { vol: 0.08 });
    }
  }

  // a calm looping pattern (pentatonic arpeggio over a soft pad); tense = faster, minor
  music(on, tense = false) {
    clearInterval(this.musicT);
    this.musicT = null;
    if (!on || !this.ctx || !this.musicOn) return;
    const major = [0, 2, 4, 7, 9, 12, 14, 16];
    const minor = [0, 3, 5, 7, 10, 12, 15, 17];
    const scale = tense ? minor : major;
    const roots = tense ? [220, 196, 174.6, 196] : [261.6, 220, 174.6, 196];
    let step = 0;
    const beat = tense ? 0.2 : 0.26;
    const tick = () => {
      if (this.muted || !this.musicOn) return;
      const t = this.ctx.currentTime + 0.05;
      const bar = Math.floor(step / 16) % roots.length;
      const root = roots[bar];
      if (step % 16 === 0) {
        for (const k of [0, 4, 7]) this.tone(root * Math.pow(2, (tense && k === 4 ? 3 : k) / 12) / 2, t, beat * 16, { type: 'sine', vol: 0.18, attack: 0.4, out: this.bgm });
      }
      if (step % 2 === 0) {
        const n = scale[(step * 3 + bar) % scale.length];
        this.tone(root * Math.pow(2, n / 12), t, beat * 1.6, { type: 'triangle', vol: 0.16, out: this.bgm });
      }
      if (step % 4 === 0) this.noise(t, 0.05, { vol: 0.04, f: 7000, q: 1 });
      step++;
    };
    this.musicT = setInterval(tick, beat * 1000);
  }
}
