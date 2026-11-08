// Procedural sound: an evolving ambient pad with water and wind, plus spatialised bell tones.
// Each visual target is announced by a short sound from the same place in space. Pairing
// sound with the visual event speeds visual learning (Seitz, Kim & Shams 2006), and
// ULTIMEyes used audio cues the same way (Deveau et al. 2014).

const PENTA = [0, 2, 4, 7, 9];        // major pentatonic degrees
const ROOT = 62;                       // D4
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const noteOf = (i) => ROOT + PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);

const CHORDS = [
  [50, 57, 62, 64, 69],   // D add9
  [47, 54, 59, 62, 66],   // Bm
  [43, 50, 57, 59, 66],   // Gmaj7
  [45, 52, 57, 61, 64],   // A sus-ish
];

export class AudioEngine {
  constructor() { this.ctx = null; this.enabled = false; this.volume = 0.8; this.music = 0.55; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 3;
    this.master.connect(this.comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.8);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.55;
    this.reverb.connect(this.revGain).connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master); this.sfx.connect(this.reverb);
    this.bed = ctx.createGain(); this.bed.gain.value = this.music;
    this.bed.connect(this.master); this.bed.connect(this.reverb);
    this.enabled = true;
    this.startAmbience();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setMusic(v) { this.music = v; if (this.bed) this.bed.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3); }

  impulse(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = lp * Math.pow(1 - t, 2.6) * (i < 200 ? i / 200 : 1);
      }
    }
    return b;
  }

  noiseBuffer(sec = 4) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;      // pinkish noise
      b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
      d[i] = (b0 + b1 + b2 + w * 0.02) * 0.6;
    }
    return b;
  }

  startAmbience() {
    const ctx = this.ctx;
    const nb = this.noiseBuffer(6);
    // lapping water
    const water = ctx.createBufferSource(); water.buffer = nb; water.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 520; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.10;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.05;
    lfo.connect(lfoG).connect(wg.gain); lfo.start();
    water.connect(wf).connect(wg).connect(this.bed); water.start();
    // soft wind
    const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true; wind.playbackRate.value = 0.5;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 260;
    const wig = ctx.createGain(); wig.gain.value = 0.10;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.045;
    const lfo2G = ctx.createGain(); lfo2G.gain.value = 140;
    lfo2.connect(lfo2G).connect(wl.frequency); lfo2.start();
    wind.connect(wl).connect(wig).connect(this.bed); wind.start();

    this.chordIdx = 0;
    this.padVoices = [];
    this.nextChord = ctx.currentTime + 0.1;
    this.nextSparkle = ctx.currentTime + 4;
  }

  playChord(notes, at, dur) {
    const ctx = this.ctx;
    const voices = [];
    for (const m of notes) {
      for (const det of [-6, 5]) {
        const o = ctx.createOscillator(); o.type = 'triangle';
        o.frequency.value = mtof(m); o.detune.value = det;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.3;
        const g = ctx.createGain(); g.gain.value = 0;
        const peak = 0.028 / Math.sqrt(notes.length);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(peak, at + 4.5);
        g.gain.setValueAtTime(peak, at + dur - 1);
        g.gain.linearRampToValueAtTime(0, at + dur + 4.5);
        o.connect(f).connect(g).connect(this.bed);
        o.start(at); o.stop(at + dur + 5);
        voices.push(o);
      }
    }
  }

  /** Bell-like FM tone at a world position. */
  bell(pos, { midi = 74, vel = 0.5, dur = 1.6, bright = 2.0 } = {}) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.005;
    const f = mtof(midi);
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * bright, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const out = this.spatial(pos);
    car.connect(g).connect(out);
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }

  /** Quick shimmer that announces a target appearing at `pos`. */
  cue(pos, pitch = 0) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.003;
    const out = this.spatial(pos);
    for (const [k, mul] of [[0, 1], [1, 1.5], [2, 2]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = mtof(86 + pitch) * mul;
      const g = ctx.createGain();
      const st = t + k * 0.035;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.05, st + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
      o.connect(g).connect(out); o.start(st); o.stop(st + 0.4);
    }
  }

  /** Gentle "not quite" tone: never harsh, a miss should not feel like punishment. */
  soft(pos) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.003;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(mtof(57), t); o.frequency.exponentialRampToValueAtTime(mtof(52), t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.spatial(pos)); o.start(t); o.stop(t + 0.55);
  }

  /** Rising arpeggio for milestones (constellation complete, new record). */
  fanfare(pos) {
    [0, 2, 4, 5, 7].forEach((k, i) => setTimeout(() => this.bell(pos, { midi: noteOf(k + 5), vel: 0.45, dur: 2.2 }), i * 110));
  }

  /** Breath guide: filtered noise swelling up (inhale) or down (exhale). */
  breath(inhale, dur) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.breathBuf || (this.breathBuf = this.noiseBuffer(2)); s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(inhale ? 300 : 900, t); f.frequency.linearRampToValueAtTime(inhale ? 900 : 300, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.bed); s.start(t); s.stop(t + dur + 0.1);
  }

  spatial(pos) {
    const ctx = this.ctx;
    if (!pos || !ctx.createPanner) return this.sfx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 0.6;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx);
    return p;
  }

  setListener(pos, fwd, up) {
    if (!this.enabled) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.02); l.positionY.setTargetAtTime(pos.y, t, 0.02); l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02); l.forwardY.setTargetAtTime(fwd.y, t, 0.02); l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02); l.upY.setTargetAtTime(up.y, t, 0.02); l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  update(sparklePos) {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    if (now > this.nextChord - 0.5) {
      const dur = 14;
      const chord = CHORDS[this.chordIdx % CHORDS.length];
      this.playChord(chord, Math.max(now, this.nextChord), dur);
      this.chordQueue = this.chordQueue || [];
      this.chordQueue.push({ at: Math.max(now, this.nextChord), chord });
      this.chordIdx++;
      this.nextChord += dur;
    }
    if (now > this.nextSparkle && sparklePos) {
      this.bell(sparklePos, { midi: noteOf(10 + Math.floor(Math.random() * 6)), vel: 0.08, dur: 2.5, bright: 1.2 });
      this.nextSparkle = now + 4 + Math.random() * 7;
    }
    this.scheduleMusic(now);
  }

  // ---------- music that grows with the combo ----------
  // level 0: pad only; 1: a soft plucked arpeggio; 2: + a low pulse; 3 (Starfall): + high twinkles.
  setIntensity(level) { this.level = level; }

  currentChord(at) {
    const q = this.chordQueue || [];
    let c = CHORDS[0];
    for (const e of q) if (e.at <= at) c = e.chord;
    while (q.length > 3 && q[1].at <= at) q.shift();
    return c;
  }

  scheduleMusic(now) {
    if (!this.music_) {
      this.music_ = { next: now + 0.1, step: 0, gains: [0, 0, 0] };
      this.layer = [0, 1, 2].map(() => { const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.bed); return g; });
    }
    const m = this.music_, lv = this.level || 0;
    const want = [lv >= 1 ? 1 : 0, lv >= 2 ? 1 : 0, lv >= 3 ? 1 : 0];
    want.forEach((w, i) => { if (m.gains[i] !== w) { m.gains[i] = w; this.layer[i].gain.setTargetAtTime(w * [0.5, 0.45, 0.4][i], now, 1.2); } });
    const beat = 60 / 84 / 2;                  // eighth notes at 84 bpm
    while (m.next < now + 0.25) {
      const t = m.next, k = m.step;
      const ch = this.currentChord(t);
      const tones = [...ch.slice(1), ch[1] + 12, ch[2] + 12, ch[3] + 12];
      const order = [0, 2, 4, 1, 3, 5, 2, 4];
      this.pluck(t, tones[order[k % 8] % tones.length] + 12, 0.11, this.layer[0]);
      if (k % 4 === 0) this.pulse(t, ch[0] - 12, this.layer[1]);
      if (Math.random() < 0.35) this.pluck(t + beat / 2, tones[Math.floor(Math.random() * tones.length)] + 24, 0.06, this.layer[2], 2.2);
      m.step++; m.next += beat;
    }
  }

  pluck(t, midi, vel, dest, decay = 1.1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + decay + 0.05);
  }

  pulse(t, midi, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 1);
  }

  /** Singing bowl: inharmonic partials with a slow beat and a long, calm decay. */
  bowl(pos, midi = 50, vel = 0.35, dur = 7) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01, f = mtof(midi);
    const out = this.spatial(pos);
    [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.9, 0.08]].forEach(([mul, amp], i) => {
      for (const det of [-1.2, 1.2]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul + det * (i + 1) * 0.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * amp * 0.5, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - i * 0.18));
        o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.1);
      }
    });
  }

  /** A breath you can hear: air rising (inhale) or falling (exhale) through a soft chord. */
  breathSwell(kind, dur) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (kind === 'hold') {
      for (const m of [86, 90.02]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.bed); o.start(t); o.stop(t + dur + 0.1);
      }
      return;
    }
    const inhale = kind === 'in';
    const s = ctx.createBufferSource(); s.buffer = this.breathBuf || (this.breathBuf = this.noiseBuffer(2)); s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(inhale ? 260 : 1300, t); f.frequency.exponentialRampToValueAtTime(inhale ? 1300 : 220, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(inhale ? 0.12 : 0.1, t + dur * (inhale ? 0.8 : 0.25)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.bed); s.start(t); s.stop(t + dur + 0.1);
    const ch = this.currentChord(t);
    (inhale ? [ch[1], ch[2] + 12] : [ch[2], ch[0] + 12]).forEach((m) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(inhale ? 400 : 1600, t); lp.frequency.exponentialRampToValueAtTime(inhale ? 1800 : 300, t + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.03, t + dur * 0.5); og.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(og).connect(this.bed); o.start(t); o.stop(t + dur + 0.1);
    });
  }
}
