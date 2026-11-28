// js/audio.js — every sound is made on the spot with Web Audio (no files): wind that rises with speed,
// the hiss of the edge (louder the harder you carve), pops, landings, crystal chimes, and a small
// original backing track per course (chords, bass, arpeggio, drums).
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = true;
    this.combo = 0;
    this.comboT = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = this.musicOn ? 0.32 : 0; this.mus.connect(this.master);
    // white noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, f, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(flt); flt.connect(g); g.connect(this.sfx); src.start();
      return { flt, g };
    };
    this.wind = loop('bandpass', 400, 0.7);
    this.carve = loop('bandpass', 1800, 1.2);
    this.nextNote = 0;
    this.step = 0;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  setMusic(on) { this.musicOn = on; if (this.mus) this.mus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1); }

  // continuous sounds from the ride
  ride(speed, edge, air, brake, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = Math.min(1, speed / 25);
    this.wind.g.gain.setTargetAtTime(active ? 0.04 + k * k * 0.5 : 0.03, t, 0.1);
    this.wind.flt.frequency.setTargetAtTime(250 + k * 1100, t, 0.1);
    const c = active && !air ? Math.min(1, speed / 12) * (0.06 + Math.min(1, Math.abs(edge) * 1.6) * 0.3 + brake * 0.45) : 0;
    this.carve.g.gain.setTargetAtTime(c, t, 0.05);
    this.carve.flt.frequency.setTargetAtTime(1300 + Math.abs(edge) * 1500 + brake * 900, t, 0.08);
  }

  tone(f, dur, { type = 'sine', vol = 0.3, at = 0, to = null, bus = null } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, f, { vol = 0.4, type = 'lowpass', at = 0, bus = null, q = 0.8 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(bus || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  pop() { this.burst(0.12, 900, { vol: 0.35, type: 'bandpass' }); this.tone(180, 0.12, { to: 90, vol: 0.2 }); }
  land(impact, quality) {
    const v = Math.min(1, 0.35 + impact / 12);
    this.tone(110, 0.22, { to: 40, vol: 0.55 * v });
    this.burst(0.35, 1600, { vol: 0.4 * v });
    if (quality === 'sketchy') this.tone(220, 0.25, { type: 'triangle', to: 160, vol: 0.12, at: 0.05 });
  }
  soft() { this.tone(660, 0.12, { type: 'triangle', vol: 0.15 }); this.tone(990, 0.16, { type: 'triangle', vol: 0.12, at: 0.06 }); }
  crystal(kind) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.combo = now - this.comboT < 1.2 ? Math.min(this.combo + 1, 9) : 0;
    this.comboT = now;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const base = kind === 'gold' ? 76 : kind === 'green' ? 72 : 69;
    const f = 440 * Math.pow(2, (base + scale[this.combo] - 69) / 12);
    this.tone(f, 0.25, { type: 'sine', vol: 0.22 });
    this.tone(f * 2, 0.18, { type: 'sine', vol: 0.08, at: 0.02 });
    if (kind === 'gold') { this.tone(f * 1.5, 0.4, { vol: 0.14, at: 0.08 }); this.tone(f * 2, 0.5, { vol: 0.1, at: 0.16 }); }
  }
  ring() { this.burst(0.5, 800, { vol: 0.3, type: 'bandpass', q: 0.6 }); [0, 4, 7, 12].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.35, { type: 'triangle', vol: 0.12, at: i * 0.04 })); }
  trick(pts) { const n = Math.min(4, 1 + Math.floor(pts / 250)); for (let i = 0; i < n; i++) this.tone(587 * Math.pow(2, [0, 4, 7, 12][i] / 12), 0.22, { type: 'square', vol: 0.06, at: i * 0.07 }); }
  crash() { this.tone(140, 0.5, { to: 35, vol: 0.6 }); this.burst(0.7, 700, { vol: 0.6 }); }
  graze() { this.burst(0.15, 500, { vol: 0.3 }); }
  count(n) { this.tone(n > 0 ? 660 : 1320, n > 0 ? 0.15 : 0.45, { type: 'square', vol: 0.12 }); }
  finish() { [0, 4, 7, 12, 16].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.5, { type: 'triangle', vol: 0.16, at: i * 0.09 })); }
  click() { this.tone(880, 0.06, { type: 'triangle', vol: 0.1 }); }

  // ---- music: a four-chord loop in the course's key ----
  startMusic(spec) {
    this.music = spec || null;
    this.step = 0;
    if (this.ctx) this.nextNote = this.ctx.currentTime + 0.1;
  }
  stopMusic() { this.music = null; }
  tick() {
    if (!this.ctx || !this.music) return;
    const m = this.music, ctx = this.ctx;
    const sp = 60 / m.tempo / 4; // a 16th
    const prog = m.mood === 'night' ? [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] : m.mood === 'cool' ? [[0, 3, 7], [-4, -1, 3], [3, 7, 10], [-2, 2, 5]] : [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
    while (this.nextNote < ctx.currentTime + 0.15) {
      const at = this.nextNote - ctx.currentTime, st = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      const ch = prog[bar];
      const f = (n) => 440 * Math.pow(2, (m.root + n - 69) / 12);
      if (st % 4 === 0) { this.tone(110, 0.16, { to: 45, vol: 0.5, at, bus: this.mus }); }
      if (st === 4 || st === 12) this.burst(0.14, 1800, { vol: 0.22, type: 'bandpass', at, bus: this.mus });
      if (st % 2 === 1) this.burst(0.04, 7000, { vol: 0.07, type: 'highpass', at, bus: this.mus });
      if (st % 4 === 0 || st === 6 || st === 14) this.tone(f(ch[0] - 24), sp * 1.8, { type: 'triangle', vol: 0.28, at, bus: this.mus });
      const arp = [0, 1, 2, 1, 0, 2, 1, 2];
      this.tone(f(ch[arp[st % 8]] + (st >= 8 ? 12 : 0)), sp * 0.9, { type: 'square', vol: 0.035, at, bus: this.mus });
      if (st === 0) for (const n of ch) this.tone(f(n), sp * 14, { type: 'sine', vol: 0.05, at, bus: this.mus });
      this.nextNote += sp;
      this.step++;
    }
  }
}
