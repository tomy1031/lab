// js/audio.js — the Web Audio side: buses, drum samples synthesised at start-up, reverb, nature ambience,
// guide clicks, hit sounds, and the game clock.
//
// The clock: every judgement and every moving target is placed on "song time", which is derived from the
// audio clock at the moment the sound actually reaches the ear (AudioContext.getOutputTimestamp, which
// includes the output latency), not from the time the sound was scheduled. So what you see matches what
// you hear, also with Bluetooth or the Quest speakers.
import { Synth } from './synth.js';
import { mtof } from './util.js';

const TAU = Math.PI * 2;
const rnd = () => Math.random() * 2 - 1;

// RBJ biquad, used only while building the sample buffers
class Biquad {
  constructor(type, f, q, sr) { this.set(type, f, q, sr); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q, sr) {
    const w = (TAU * f) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; } // bandpass (0 dB peak)
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function makeBuf(ctx, dur, fill, channels = 1) {
  const sr = ctx.sampleRate;
  const b = ctx.createBuffer(channels, Math.ceil(dur * sr), sr);
  for (let c = 0; c < channels; c++) fill(b.getChannelData(c), sr, c);
  return b;
}

const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];

function makeSamples(ctx) {
  const B = {};
  B.kick = makeBuf(ctx, 0.55, (d, sr) => {
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (TAU * (46 + 115 * Math.exp(-t * 32))) / sr;
      const env = Math.exp(-t * 7) * Math.min(1, t * 3000);
      d[i] = Math.tanh(Math.sin(ph) * env * 1.7) * 0.9 + rnd() * Math.exp(-t * 320) * 0.18;
    }
  });
  B.kickSoft = makeBuf(ctx, 0.5, (d, sr) => {
    let ph = 0;
    const lp = new Biquad('lowpass', 900, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (TAU * (52 + 70 * Math.exp(-t * 26))) / sr;
      d[i] = lp.run(Math.tanh(Math.sin(ph) * Math.exp(-t * 8) * 1.4) + rnd() * Math.exp(-t * 200) * 0.1) * 0.95;
    }
  });
  B.snare = makeBuf(ctx, 0.35, (d, sr) => {
    const hp = new Biquad('highpass', 1100, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const tone = (Math.sin(TAU * 185 * t) * 0.55 + Math.sin(TAU * 330 * t) * 0.25) * Math.exp(-t * 30);
      d[i] = (hp.run(rnd()) * Math.exp(-t * 17) * 0.75 + tone) * 0.8;
    }
  });
  B.clap = makeBuf(ctx, 0.4, (d, sr) => {
    const bp = new Biquad('bandpass', 1250, 1.1, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let env = 0;
      for (let k = 0; k < 4; k++) { const tk = k * 0.0105; if (t >= tk) env += Math.exp(-(t - tk) * 230) * (k === 3 ? 0.4 : 1); }
      if (t >= 0.032) env += Math.exp(-(t - 0.032) * 13) * 0.75;
      d[i] = bp.run(rnd()) * env * 1.6;
    }
  });
  const hat = (dur, decay) => (d, sr) => {
    const hp = new Biquad('highpass', 7200, 0.8, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let m = 0;
      for (const f of METAL) m += Math.sin(TAU * f * 2.4 * t) > 0 ? 1 : -1;
      d[i] = hp.run(m / 6 * 0.55 + rnd() * 0.6) * Math.exp(-t * decay) * Math.min(1, t * 4000) * 0.75;
    }
  };
  B.hat = makeBuf(ctx, 0.12, hat(0.12, 75));
  B.hatO = makeBuf(ctx, 0.5, hat(0.5, 8));
  B.rim = makeBuf(ctx, 0.09, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.sin(TAU * 1750 * t) * 0.55 + Math.sin(TAU * 520 * t) * 0.45) * Math.exp(-t * 85) + rnd() * Math.exp(-t * 500) * 0.35;
    }
  });
  B.shaker = makeBuf(ctx, 0.13, (d, sr) => {
    const hp = new Biquad('highpass', 5200, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = t < 0.014 ? t / 0.014 : Math.exp(-(t - 0.014) * 45);
      d[i] = hp.run(rnd()) * env * 0.7;
    }
  });
  B.tom = makeBuf(ctx, 0.5, (d, sr) => {
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (TAU * (96 + 70 * Math.exp(-t * 14))) / sr;
      d[i] = Math.sin(ph) * Math.exp(-t * 8) * 0.85 + rnd() * Math.exp(-t * 300) * 0.1;
    }
  });
  B.crash = makeBuf(ctx, 1.8, (d, sr, c) => {
    const hp = new Biquad('highpass', 4200, 0.6, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let m = 0;
      for (const f of METAL) m += Math.sin(TAU * f * (3.1 + c * 0.07) * t) > 0 ? 1 : -1;
      d[i] = hp.run(rnd() * 0.8 + m / 6 * 0.3) * Math.exp(-t * 2.4) * Math.min(1, t * 2000) * 0.5;
    }
  }, 2);
  // guide clicks: a wooden "tock"; pitch tells the subdivision (beat high, & middle, 16ths low)
  const block = (f) => (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.sin(TAU * f * t) * Math.exp(-t * 60) + 0.35 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 110)) * Math.min(1, t * 6000) * 0.9;
    }
  };
  B.blockAccent = makeBuf(ctx, 0.09, block(2000));
  B.blockOn = makeBuf(ctx, 0.09, block(1480));
  B.blockAnd = makeBuf(ctx, 0.09, block(1080));
  B.blockSix = makeBuf(ctx, 0.09, block(820));
  // sound effects
  B.punch = makeBuf(ctx, 0.25, (d, sr) => {
    const lp = new Biquad('lowpass', 1400, 0.8, sr);
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      ph += (TAU * (68 + 140 * Math.exp(-t * 45))) / sr;
      d[i] = Math.sin(ph) * Math.exp(-t * 20) * 0.8 + lp.run(rnd()) * Math.exp(-t * 40) * 0.7;
    }
  });
  B.whiff = makeBuf(ctx, 0.28, (d, sr) => {
    const bp = new Biquad('bandpass', 600, 1.5, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      if (i % 64 === 0) bp.set('bandpass', 700 - t * 1600, 1.5, sr);
      d[i] = bp.run(rnd()) * Math.sin(Math.PI * Math.min(1, t / 0.28)) * 0.5;
    }
  });
  B.whoosh = makeBuf(ctx, 0.4, (d, sr) => {
    const bp = new Biquad('bandpass', 400, 1.2, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      if (i % 64 === 0) bp.set('bandpass', 380 + t * 4200, 1.2, sr);
      d[i] = bp.run(rnd()) * Math.sin(Math.PI * Math.min(1, t / 0.4)) * 0.7;
    }
  });
  B.thunk = makeBuf(ctx, 0.3, (d, sr) => {
    const lp = new Biquad('lowpass', 600, 0.8, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = Math.sin(TAU * 140 * t) * Math.exp(-t * 24) * 0.7 + lp.run(rnd()) * Math.exp(-t * 50) * 0.6;
    }
  });
  // nature: wind (looped) and three bird calls
  B.wind = makeBuf(ctx, 6, (d, sr, c) => {
    const lp = new Biquad('lowpass', 420, 0.5, sr);
    const n = d.length;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const gust = 0.55 + 0.3 * Math.sin(TAU * t / 6 + c) + 0.15 * Math.sin(TAU * t / 2 + c * 2);
      d[i] = lp.run(rnd()) * gust * 1.4;
    }
    const f = Math.floor(sr * 0.2); // crossfade the loop point
    for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); }
  }, 2);
  B.birds = [0, 1, 2].map((k) => makeBuf(ctx, 0.9, (d, sr) => {
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let f, env;
      if (k === 0) { const s = t % 0.18; f = 3200 + 1400 * (1 - s / 0.18); env = t < 0.72 ? Math.sin(Math.PI * s / 0.18) ** 2 : 0; }
      else if (k === 1) { f = 2400 + 900 * Math.sin(TAU * 18 * t) + 900 * t; env = Math.sin(Math.PI * Math.min(1, t / 0.6)) * (t < 0.6 ? 1 : 0); }
      else { const s = t < 0.25 ? t : t - 0.38; f = s < 0 ? 0 : 4100 - 2600 * s / 0.25; env = (t < 0.25 || (t > 0.38 && t < 0.63)) ? Math.sin(Math.PI * ((t < 0.25 ? t : t - 0.38) / 0.25)) : 0; }
      ph += (TAU * f) / sr;
      d[i] = Math.sin(ph) * env * 0.25;
    }
  }));
  return B;
}

function makeIR(ctx, dur = 2.2) {
  return makeBuf(ctx, dur, (d, sr, c) => {
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const k = 0.08 + 0.9 * Math.exp(-t * 2.5); // darker as it decays
      lp += (rnd() - lp) * k;
      d[i] = lp * Math.exp(-t * 3.1) * (t < 0.012 ? t / 0.012 : 1);
    }
    for (const [tt, g] of [[0.013, 0.6], [0.021, 0.45], [0.034, 0.35], [0.047, 0.28]]) {
      const i = Math.floor((tt + c * 0.003) * sr);
      if (i < d.length) d[i] += g;
    }
  }, 2);
}

export class AudioEngine {
  constructor(store) {
    this.store = store;
    this.ctx = null;
    this.ambOn = false;
    this._birdTimer = 0;
  }

  get ready() { return !!this.ctx; }

  // create (first call) and resume the AudioContext; call from a click or the Enter VR button
  ensure() {
    if (!this.ctx) this._init();
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // ctx: optional, e.g. an OfflineAudioContext for rendering tests
  _init(ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = this.ctx = ctx || new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    // gentle glue only: a slow attack lets every kick's transient through, so the beat stays easy to feel
    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 2.2; comp.attack.value = 0.025; comp.release.value = 0.15;
    const limit = ctx.createDynamicsCompressor(); // last safety net against clipping
    limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.08;
    const out = ctx.createGain();
    out.gain.value = 0.72;
    this.master = ctx.createGain(); // music and ambience, glued by the compressor
    this.master.gain.value = 0.5;
    this.master.connect(comp);
    comp.connect(limit);
    limit.connect(out);
    out.connect(ctx.destination);
    const bus = (to) => { const g = ctx.createGain(); g.connect(to); return g; };
    this.musicBus = bus(this.master);
    this.ambBus = bus(this.master);
    // guide clicks and hit sounds skip the compressor so loud music never pushes them down
    this.guideBus = bus(limit);
    this.sfxBus = bus(limit);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeIR(ctx);
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(this.reverb);
    const ret = ctx.createGain();
    ret.gain.value = 0.55;
    this.reverb.connect(ret);
    ret.connect(this.musicBus);
    this.buf = makeSamples(ctx);
    this.synth = new Synth(this);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const v = this.store.data.vol;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(v.music, t, 0.05);
    this.guideBus.gain.setTargetAtTime(v.guide * 1.1, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(0.5 + v.music * 0.5, t, 0.05);
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // AudioContext time of the sound reaching the ear at performance-clock time perfMs
  heard(perfMs, smooth = true) {
    const ctx = this.ctx;
    if (!ctx) return 0;
    let t;
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) t = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
    if (t === undefined) t = ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0) + (perfMs - performance.now()) / 1000;
    if (!smooth) return t;
    // the raw value moves in audio-block steps: slew a smooth clock toward it
    const s = this._smooth;
    if (!s || Math.abs(t - (s.t + (perfMs - s.p) / 1000)) > 0.06 || perfMs < s.p) {
      this._smooth = { t, p: perfMs };
      return t;
    }
    const pred = s.t + (perfMs - s.p) / 1000;
    const out = pred + (t - pred) * 0.08;
    this._smooth = { t: out, p: perfMs };
    return out;
  }

  // a "segment" is one stretch of playback: cutting it silences everything already scheduled into it
  segment() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.connect(this.musicBus);
    const dry = ctx.createGain();
    dry.connect(out);
    const music = ctx.createGain(); // tonal parts, pumped by the kick in the dance styles
    music.connect(out);
    const wet = ctx.createGain();
    wet.connect(this.reverbIn);
    const guide = ctx.createGain();
    guide.connect(this.guideBus);
    return {
      out, dry, music, wet, guide,
      pump(t, depth = 0.45, len = 0.22) {
        if (t == null) return;
        music.gain.setValueAtTime(1 - depth, t);
        music.gain.linearRampToValueAtTime(1, t + len);
      },
      stop(fade = 0.06) {
        const n = ctx.currentTime;
        for (const g of [out, wet, guide]) { g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + fade); }
        setTimeout(() => { for (const g of [out, wet, guide, dry, music]) g.disconnect(); }, (fade + 0.1) * 1000);
      },
    };
  }

  // play a sample buffer into a destination node at AudioContext time t
  play(name, t, gain = 1, dest = this.sfxBus, rate = 1, pan = 0) {
    const ctx = this.ctx;
    const b = typeof name === 'string' ? this.buf[name] : name;
    if (!ctx || !b) return null;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); }
    else g.connect(dest);
    src.start(Math.max(t, ctx.currentTime));
    return src;
  }

  // guide click for one note (sub: 'on' | 'and' | 'six' | 'accent')
  guideClick(seg, t, sub, level = 1) {
    if (level <= 0.01) return;
    const name = sub === 'accent' ? 'blockAccent' : sub === 'on' ? 'blockOn' : sub === 'and' ? 'blockAnd' : 'blockSix';
    this.play(name, t, 0.55 * level, seg ? seg.guide : this.guideBus);
  }

  countIn(seg, t0, beats, spb) {
    for (let i = 0; i < beats; i++) this.play(i % 4 === 0 ? 'blockAccent' : 'blockOn', t0 + i * spb, 0.6, seg ? seg.guide : this.guideBus);
  }

  // hit feedback: a body thump plus a short pitched "pop" tuned to the current chord
  hitSound(grade, midi = 72, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.play('punch', t, grade === 'weak' ? 0.4 : 0.75, this.sfxBus, 1, pan * 0.4);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const f = mtof(midi);
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const g = ctx.createGain();
    const lv = grade === 'perfect' ? 0.32 : grade === 'great' ? 0.24 : 0.14;
    g.gain.setValueAtTime(lv, t);
    g.gain.setTargetAtTime(0, t + 0.01, 0.07);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.5);
    if (grade === 'perfect') {
      const o2 = ctx.createOscillator();
      o2.frequency.value = f * 4;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.06, t + 0.015);
      g2.gain.setTargetAtTime(0, t + 0.02, 0.05);
      o2.connect(g2);
      g2.connect(this.sfxBus);
      o2.start(t);
      o2.stop(t + 0.4);
    }
  }

  chime(midi = 79) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [0, 4, 7, 12].forEach((iv, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(midi + iv);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.06);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.06 + 0.005);
      g.gain.setTargetAtTime(0, t + i * 0.06 + 0.02, 0.18);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 1.2);
    });
  }

  ui() { if (this.ctx) this.play('blockOn', this.ctx.currentTime, 0.25, this.sfxBus, 1.3); }

  // wind always (quieter while playing); birds only in the menus
  ambience(mode) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.windSrc) {
      const src = ctx.createBufferSource();
      src.buffer = this.buf.wind;
      src.loop = true;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      src.connect(this.windGain);
      this.windGain.connect(this.ambBus);
      src.start();
      this.windSrc = src;
    }
    const lv = mode === 'menu' ? 0.16 : mode === 'play' ? 0.05 : 0;
    this.windGain.gain.setTargetAtTime(lv, ctx.currentTime, 0.6);
    this.ambOn = mode === 'menu';
  }

  tick(dt) {
    if (!this.ctx || !this.ambOn) return;
    this._birdTimer -= dt;
    if (this._birdTimer <= 0) {
      this._birdTimer = 2 + Math.random() * 5;
      const b = this.buf.birds[Math.floor(Math.random() * 3)];
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) this.play(b, this.ctx.currentTime + i * 0.95, 0.25 + Math.random() * 0.25, this.ambBus, 0.85 + Math.random() * 0.3, rnd() * 0.9);
    }
  }
}
