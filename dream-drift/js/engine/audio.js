// engine/audio.js — everything you hear is synthesized with Web Audio: engine hum, effects and a small
// sequencer that plays each course's own tune (drums, bass, chords, arpeggio and a seeded melody).
import { makeRng } from './util.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicVol = 0.5; this.sfxVol = 0.8;
    this.music = null;
    this.tempoMul = 1;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol * 0.55; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // a soft echo for the music
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const dl = ctx.createGain(); dl.gain.value = 0.22;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(dl); dl.connect(this.musicBus);
    if (this.pendingMusic) { const m = this.pendingMusic; this.pendingMusic = null; this.playMusic(m); }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (this.ctx) { this.musicBus.gain.value = music * 0.55; this.sfxBus.gain.value = sfx; }
  }

  // ---- low-level voices
  tone(freq, dur, { type = 'square', vol = 0.2, attack = 0.005, release = 0.08, slide = 0, at = 0, bus = this.sfxBus, filter = 0, send = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = (at || ctx.currentTime);
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(bus);
    if (send && this.delay) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(this.delay); }
    o.start(t); o.stop(t + dur + 0.02);
  }
  noiseHit(dur, { vol = 0.3, type = 'bandpass', freq = 1000, q = 1, at = 0, sweep = 0, bus = this.sfxBus } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = at || ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  // ---- effects
  play(name, arg = 0) {
    if (!this.ctx || this.muted) return;
    const T = this.ctx.currentTime;
    const seq = (notes, step, opts) => notes.forEach((n, i) => this.tone(n, step * 1.6, { ...opts, at: T + i * step }));
    switch (name) {
      case 'count': this.tone(660, 0.22, { type: 'square', vol: 0.18 }); break;
      case 'go': this.tone(1320, 0.6, { type: 'square', vol: 0.2 }); this.tone(990, 0.6, { type: 'triangle', vol: 0.2 }); break;
      case 'select': this.tone(880, 0.06, { type: 'triangle', vol: 0.15 }); break;
      case 'confirm': seq([784, 1175], 0.06, { type: 'triangle', vol: 0.18 }); break;
      case 'back': seq([660, 440], 0.06, { type: 'triangle', vol: 0.15 }); break;
      case 'tick': this.tone(1400 + Math.random() * 600, 0.03, { type: 'square', vol: 0.06 }); break;
      case 'itemget': seq([988, 1319, 1568, 1976], 0.04, { type: 'triangle', vol: 0.12 }); this.noiseHit(0.2, { vol: 0.12, freq: 4000 }); break;
      case 'itemready': seq([1568, 2093], 0.07, { type: 'sine', vol: 0.2 }); break;
      case 'boost': this.noiseHit(0.7, { vol: 0.35, freq: 500, sweep: 6, q: 0.8 }); this.tone(110, 0.6, { type: 'sawtooth', vol: 0.12, slide: 2.5, filter: 1200 }); break;
      case 'pad': this.noiseHit(0.5, { vol: 0.3, freq: 700, sweep: 5 }); this.tone(220, 0.4, { type: 'sawtooth', vol: 0.1, slide: 2, filter: 1500 }); break;
      case 'miniturbo': this.noiseHit(0.35 + arg * 0.1, { vol: 0.25 + arg * 0.05, freq: 600, sweep: 4 }); break;
      case 'driftlevel': this.tone([0, 1047, 1319, 1760][arg] || 1047, 0.12, { type: 'triangle', vol: 0.12 }); break;
      case 'hop': this.tone(300, 0.12, { type: 'sine', vol: 0.12, slide: 2 }); break;
      case 'wall': this.noiseHit(0.18, { vol: 0.35, type: 'lowpass', freq: 600 }); this.tone(90, 0.15, { type: 'sine', vol: 0.3, slide: 0.6 }); break;
      case 'bump': // arg 0…1: how hard
        this.noiseHit(0.14 + 0.1 * arg, { vol: 0.28 + 0.17 * arg, type: 'lowpass', freq: 900 + 500 * arg });
        this.tone(130, 0.14, { type: 'sine', vol: 0.24 + 0.14 * arg, slide: 0.55 });
        if (arg > 0.5) this.noiseHit(0.08, { vol: 0.12 * arg, type: 'highpass', freq: 3500 }); // a metallic scrape for big knocks
        break;
      case 'hit': this.noiseHit(0.4, { vol: 0.4, type: 'lowpass', freq: 1500 }); this.tone(880, 0.9, { type: 'square', vol: 0.1, slide: 0.25, filter: 2500 }); break;
      case 'shieldpop': seq([2093, 1568, 2637], 0.05, { type: 'sine', vol: 0.18 }); break;
      case 'use_bubble': this.tone(300, 0.2, { type: 'sine', vol: 0.3, slide: 3 }); break;
      case 'use_pudding': this.tone(500, 0.18, { type: 'sine', vol: 0.25, slide: 0.4 }); this.tone(700, 0.15, { type: 'sine', vol: 0.15, slide: 0.6, at: T + 0.08 }); break;
      case 'use_homing': this.tone(700, 0.5, { type: 'sawtooth', vol: 0.06, slide: 1.5, filter: 2000 }); break;
      case 'use_shield': seq([1047, 1319, 1568, 2093], 0.05, { type: 'sine', vol: 0.15 }); break;
      case 'use_comet': seq([1047, 1319, 1568, 2093, 2637, 3136], 0.045, { type: 'square', vol: 0.08 }); break;
      case 'jump': this.noiseHit(0.4, { vol: 0.2, freq: 900, sweep: 3 }); this.tone(400, 0.3, { type: 'sine', vol: 0.15, slide: 2 }); break;
      case 'trick': seq([1319, 1760, 2349], 0.05, { type: 'triangle', vol: 0.15 }); break;
      case 'respawn': seq([523, 659, 784], 0.08, { type: 'sine', vol: 0.15 }); break;
      case 'lap': seq([1047, 1568], 0.12, { type: 'square', vol: 0.12 }); break;
      case 'finallap': seq([784, 988, 1175, 1568], 0.1, { type: 'square', vol: 0.13 }); break;
      case 'finish': {
        const base = arg <= 3 ? [523, 659, 784, 1047, 1319, 1568] : [392, 466, 523, 622];
        seq(base, 0.1, { type: 'square', vol: 0.12, send: 0.3 });
        break;
      }
      case 'wrong': this.tone(220, 0.25, { type: 'square', vol: 0.08 }); break;
      default: break;
    }
  }

  // ---- engine hum (player only)
  engine(on, speed01 = 0, boost = false, drift = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.eng) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square';
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2;
      const g = ctx.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxBus);
      o1.start(); o2.start();
      this.eng = { o1, o2, f, g };
    }
    if (!this.eng) return;
    const t = ctx.currentTime, e = this.eng;
    if (!on) { e.g.gain.setTargetAtTime(0, t, 0.05); return; }
    const fr = 48 + speed01 * 95 + (boost ? 25 : 0) + (drift ? 8 : 0);
    e.o1.frequency.setTargetAtTime(fr, t, 0.06);
    e.o2.frequency.setTargetAtTime(fr * 0.502, t, 0.06);
    e.f.frequency.setTargetAtTime(300 + speed01 * 1300 + (boost ? 900 : 0), t, 0.08);
    e.g.gain.setTargetAtTime(this.muted ? 0 : 0.045 + speed01 * 0.03, t, 0.08);
  }

  // ---- music
  playMusic(def) {
    this.stopMusic();
    if (!def) return;
    if (!this.ctx) { this.pendingMusic = def; return; }
    const song = composeSong(def);
    this.tempoMul = 1;
    const m = this.music = { song, step: 0, next: this.ctx.currentTime + 0.1, timer: 0 };
    m.timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    if (this.music) { clearInterval(this.music.timer); this.music = null; }
    this.pendingMusic = null;
  }
  setTempo(mul) { this.tempoMul = mul; }

  schedule() {
    const m = this.music; if (!m || !this.ctx) return;
    const ctx = this.ctx, s = m.song;
    while (m.next < ctx.currentTime + 0.15) {
      const sixteenth = 60 / (s.bpm * this.tempoMul) / 4;
      const i = m.step % s.length;
      const t = m.next + (s.swing && i % 2 ? sixteenth * s.swing : 0);
      for (const ev of s.events[i]) this.voice(ev, t, sixteenth);
      m.step++; m.next += sixteenth;
    }
  }

  voice(ev, t, six) {
    const B = this.musicBus;
    switch (ev.v) {
      case 'kick': this.tone(150, 0.18, { type: 'sine', vol: 0.5, slide: 0.3, at: t, bus: B }); break;
      case 'snare': this.noiseHit(0.14, { vol: 0.2, freq: 1800, q: 0.7, at: t, bus: B }); this.tone(220, 0.08, { type: 'triangle', vol: 0.08, at: t, bus: B }); break;
      case 'hat': this.noiseHit(0.04, { vol: ev.vol || 0.06, type: 'highpass', freq: 7000, at: t, bus: B }); break;
      case 'shaker': this.noiseHit(0.06, { vol: 0.04, type: 'bandpass', freq: 5000, q: 2, at: t, bus: B }); break;
      case 'bass': this.tone(mtof(ev.n), six * ev.len * 0.9, { type: ev.type || 'triangle', vol: 0.22, release: 0.04, at: t, bus: B, filter: 900 }); break;
      case 'pad': for (const n of ev.ns) this.tone(mtof(n), six * ev.len, { type: 'sawtooth', vol: 0.025, attack: 0.15, release: 0.3, at: t, bus: B, filter: 1100 }); break;
      case 'arp': this.tone(mtof(ev.n), six * 0.9, { type: ev.type || 'triangle', vol: 0.05, release: 0.03, at: t, bus: B, send: 0.25 }); break;
      case 'lead': this.tone(mtof(ev.n), six * ev.len * 0.92, { type: ev.type || 'square', vol: 0.07, attack: 0.01, release: 0.05, at: t, bus: B, filter: 3200, send: 0.35 }); break;
      case 'bell': this.tone(mtof(ev.n), six * 6, { type: 'sine', vol: 0.06, attack: 0.002, release: six * 5, at: t, bus: B, send: 0.5 }); break;
      default: break;
    }
  }
}

// build a looping 8-bar pattern of 16th-note steps from a course's music description
export function composeSong(def) {
  const rng = makeRng(def.seed || 7);
  const scale = SCALES[def.scale || 'major'];
  const root = def.root ?? 60;
  const prog = def.progression || [0, 5, 3, 4];
  const bars = prog.length * 2, steps = bars * 16;
  const events = Array.from({ length: steps }, () => []);
  const deg = (d, oct = 0) => root + scale[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
  const chordOf = (d) => [deg(d), deg(d + 2), deg(d + 4)];
  const style = def.style || {};
  const leadType = style.lead || 'square';
  // melody motif (2 bars), reused with variation
  const rhythm = style.rhythm || [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1];
  const motif = [];
  let cur = 4;
  for (let s = 0; s < 32; s++) {
    if (!rhythm[s % 16]) { motif.push(null); continue; }
    cur += rng.pick([-2, -1, -1, 0, 1, 1, 2, 3, -3]);
    cur = Math.max(0, Math.min(11, cur));
    motif.push(cur);
  }
  for (let bar = 0; bar < bars; bar++) {
    const cd = prog[Math.floor(bar / 2)];
    const ch = chordOf(cd);
    for (let b = 0; b < 16; b++) {
      const i = bar * 16 + b, ev = events[i];
      // drums
      const dr = style.drums || 'pop';
      if (dr !== 'none') {
        if (dr === 'pop' && (b === 0 || b === 8 || (b === 10 && bar % 2))) ev.push({ v: 'kick' });
        if (dr === 'soft' && (b === 0 || b === 8)) ev.push({ v: 'kick' });
        if (dr === 'drive' && b % 4 === 0) ev.push({ v: 'kick' });
        if ((b === 4 || b === 12) && dr !== 'soft') ev.push({ v: 'snare' });
        if (b % 2 === 0) ev.push({ v: 'hat', vol: b % 4 === 2 ? 0.07 : 0.04 });
        if (dr === 'soft' && b % 2 === 1) ev.push({ v: 'shaker' });
      }
      // bass
      const bp = style.bass || 'octave';
      if (bp === 'octave' && b % 2 === 0) ev.push({ v: 'bass', n: ch[0] - 24 + (b % 4 === 2 ? 12 : 0), len: 2, type: style.bassType });
      if (bp === 'walk' && b % 4 === 0) ev.push({ v: 'bass', n: [ch[0], ch[1], ch[2], ch[1]][b / 4] - 24, len: 4, type: style.bassType });
      if (bp === 'pulse' && b % 2 === 0) ev.push({ v: 'bass', n: ch[0] - 24, len: 1.5, type: style.bassType });
      // pad
      if (b === 0 && bar % 2 === 0 && style.pad !== false) ev.push({ v: 'pad', ns: ch.map((n) => n - 12), len: 32 });
      // arpeggio
      if (style.arp !== false && b % (style.arpRate || 2) === 0) {
        const pat = [0, 1, 2, 1, 2, 0, 1, 2];
        ev.push({ v: 'arp', n: ch[pat[(b / (style.arpRate || 2)) % pat.length]] + 12, type: style.arpType });
      }
      // lead: motif on bars 0-3, variation on 4-7, rests in the last bar of each half
      const half = Math.floor(bar / 4), inHalf = bar % 4;
      if (inHalf < 3 || style.leadFull) {
        const mi = (inHalf % 2) * 16 + b;
        const m = motif[mi];
        if (m !== null && m !== undefined) {
          let d = m + (half ? (inHalf === 2 ? 2 : 0) : 0);
          // snap strong beats to chord tones
          if (b % 4 === 0) { const ct = [cd, cd + 2, cd + 4, cd + 7]; d = ct.reduce((a, c) => (Math.abs(c - d) < Math.abs(a - d) ? c : a), ct[0]); }
          let len = 1; for (let k = mi + 1; k < Math.min(mi + 4, 32) && (motif[k] === null || motif[k] === undefined); k++) len++;
          ev.push({ v: style.leadVoice || 'lead', n: deg(d, 1), len, type: leadType });
        }
      }
    }
  }
  return { bpm: def.bpm || 140, length: steps, events, swing: style.swing || 0 };
}
