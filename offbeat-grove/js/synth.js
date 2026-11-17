// js/synth.js — the instruments of the generated songs. Every call schedules one note or chord at an exact
// AudioContext time into a playback segment ({ dry, music, wet } from AudioEngine.segment()).
// A time of null means "skip" (the note lies before the resume point).
import { mtof } from './util.js';

export class Synth {
  constructor(audio) {
    this.a = audio;
    this.ctx = audio.ctx;
  }

  drum(seg, name, t, vel = 1, o = {}) {
    if (t == null) return;
    const ctx = this.ctx, b = this.a.buf[name];
    const src = ctx.createBufferSource();
    src.buffer = b;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    g.gain.value = vel;
    src.connect(g);
    let out = g;
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    out.connect(seg.dry);
    if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; out.connect(w); w.connect(seg.wet); }
    src.start(t);
  }

  // shared filter + amp for a chord; returns the node the oscillators connect to
  _voice(seg, t, end, { type = 'lowpass', cut = 2000, q = 0.7, a = 0.005, peak = 0.5, dec = 0.3, sus = 0.4, rel = 0.08, fEnv = 0, fDec = 0.15, wet = 0.2, pan = 0 }) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    if (fEnv) { f.frequency.setValueAtTime(cut + fEnv, t); f.frequency.setTargetAtTime(cut, t + 0.002, fDec); }
    else f.frequency.value = cut;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, dec);
    g.gain.setTargetAtTime(0, end, rel);
    f.connect(g);
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(seg.music);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; out.connect(w); w.connect(seg.wet); }
    return f;
  }

  _osc(dest, type, freq, t, stop, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  bass(seg, t, midi, dur, o = {}) {
    if (t == null) return;
    const ctx = this.ctx, f = mtof(midi), end = t + dur, vel = o.vel ?? 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = o.q ?? 5;
    const cut = o.cut ?? 380;
    lp.frequency.setValueAtTime(cut + (o.env ?? 1200), t);
    lp.frequency.setTargetAtTime(cut, t + 0.002, o.fDec ?? 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.setTargetAtTime(vel * (o.sus ?? 0.75), t + 0.02, 0.12);
    g.gain.setTargetAtTime(0, end, 0.025);
    lp.connect(g);
    g.connect(o.dry ? seg.dry : seg.music);
    const osc = this._osc(lp, o.wave || 'sawtooth', f, t, end + 0.25);
    if (o.slide) { osc.frequency.setValueAtTime(mtof(midi + o.slide), t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.07); }
    if (o.sub !== 0) {
      const sg = ctx.createGain();
      sg.gain.value = o.sub ?? 0.55;
      sg.connect(g);
      this._osc(sg, 'sine', f, t, end + 0.25);
    }
  }

  // electric piano: two-operator FM per note
  keys(seg, t, midis, dur, o = {}) {
    if (t == null) return;
    const ctx = this.ctx, end = t + dur;
    const dest = this._voice(seg, t, end, { cut: o.cut ?? 3200, peak: (o.vel ?? 0.45) / Math.sqrt(midis.length), a: 0.004, dec: 0.5, sus: 0.3, rel: 0.15, wet: o.wet ?? 0.25, pan: o.pan || 0 });
    for (const m of midis) {
      const f = mtof(m);
      const car = this._osc(dest, 'sine', f, t, end + 0.6);
      const mod = ctx.createOscillator();
      mod.frequency.value = f;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 1.4, t);
      mg.gain.setTargetAtTime(f * 0.12, t, 0.22);
      mod.connect(mg);
      mg.connect(car.frequency);
      mod.start(t);
      mod.stop(end + 0.6);
    }
  }

  pad(seg, t, midis, dur, o = {}) {
    if (t == null) return;
    const end = t + dur;
    const dest = this._voice(seg, t, end, { cut: o.cut ?? 1300, q: 0.6, peak: (o.vel ?? 0.22) / Math.sqrt(midis.length), a: o.a ?? 0.6, dec: 2, sus: 0.9, rel: o.rel ?? 0.9, wet: o.wet ?? 0.5 });
    for (const m of midis) {
      this._osc(dest, 'sawtooth', mtof(m), t, end + 3, -7);
      this._osc(dest, 'sawtooth', mtof(m), t, end + 3, 7);
    }
  }

  // short filtered chord, deep-house style
  stab(seg, t, midis, o = {}) {
    if (t == null) return;
    const dur = o.dur ?? 0.16, end = t + dur;
    const dest = this._voice(seg, t, end, { cut: o.cut ?? 650, q: 3, fEnv: o.fEnv ?? 2600, fDec: 0.06, peak: (o.vel ?? 0.4) / Math.sqrt(midis.length), a: 0.003, dec: 0.12, sus: 0.3, rel: 0.06, wet: o.wet ?? 0.45 });
    for (const m of midis) {
      this._osc(dest, 'sawtooth', mtof(m), t, end + 0.4, -9);
      this._osc(dest, 'sawtooth', mtof(m), t, end + 0.4, 9);
    }
  }

  // reggae / ska guitar chop on the offbeat
  skank(seg, t, midis, o = {}) {
    if (t == null) return;
    const end = t + (o.dur ?? 0.09);
    const ctx = this.ctx;
    const dest = this._voice(seg, t, end, { type: 'bandpass', cut: 1700, q: 0.9, peak: (o.vel ?? 0.5) / Math.sqrt(midis.length), a: 0.002, dec: 0.04, sus: 0.5, rel: 0.03, wet: o.wet ?? 0.3, pan: o.pan ?? 0.25 });
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 380;
    hp.connect(dest);
    for (const m of midis) {
      this._osc(hp, 'square', mtof(m), t, end + 0.2);
      this._osc(hp, 'sawtooth', mtof(m), t, end + 0.2, 6);
    }
  }

  organ(seg, t, midis, dur, o = {}) {
    if (t == null) return;
    const end = t + dur;
    const dest = this._voice(seg, t, end, { cut: 2600, peak: (o.vel ?? 0.28) / Math.sqrt(midis.length), a: 0.008, dec: 1, sus: 0.9, rel: 0.04, wet: o.wet ?? 0.3, pan: o.pan ?? -0.25 });
    for (const m of midis) {
      this._osc(dest, 'sine', mtof(m), t, end + 0.2);
      this._osc(dest, 'sine', mtof(m + 12), t, end + 0.2);
      this._osc(dest, 'triangle', mtof(m + 19), t, end + 0.2);
    }
  }

  clav(seg, t, midis, dur, o = {}) {
    if (t == null) return;
    const end = t + dur;
    const dest = this._voice(seg, t, end, { type: 'bandpass', cut: 1000, q: 2.2, fEnv: 1800, fDec: 0.05, peak: (o.vel ?? 0.42) / Math.sqrt(midis.length), a: 0.002, dec: 0.06, sus: 0.35, rel: 0.03, wet: 0.12, pan: o.pan ?? 0.2 });
    for (const m of midis) this._osc(dest, 'square', mtof(m), t, end + 0.15);
  }

  // marimba-ish lead
  pluck(seg, t, midi, dur, o = {}) {
    if (t == null) return;
    const end = t + Math.min(dur, 0.5);
    const dest = this._voice(seg, t, end, { cut: o.cut ?? 3800, peak: o.vel ?? 0.32, a: 0.003, dec: o.dec ?? 0.16, sus: 0.15, rel: 0.12, wet: o.wet ?? 0.35, pan: o.pan || 0 });
    const f = mtof(midi);
    this._osc(dest, 'triangle', f, t, end + 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.setTargetAtTime(0, t, 0.03);
    g.connect(dest);
    this._osc(g, 'sine', f * 4, t, t + 0.2);
  }

  brass(seg, t, midis, dur, o = {}) {
    if (t == null) return;
    const ctx = this.ctx, end = t + dur;
    const dest = this._voice(seg, t, end, { cut: 900, q: 1.2, peak: (o.vel ?? 0.38) / Math.sqrt(midis.length), a: 0.025, dec: 0.2, sus: 0.75, rel: 0.07, wet: o.wet ?? 0.35, pan: o.pan || 0 });
    dest.frequency.setValueAtTime(700, t);
    dest.frequency.linearRampToValueAtTime(2600, t + 0.05);
    dest.frequency.setTargetAtTime(1500, t + 0.06, 0.1);
    for (const m of midis) {
      this._osc(dest, 'sawtooth', mtof(m), t, end + 0.3, -8);
      this._osc(dest, 'sawtooth', mtof(m), t, end + 0.3, 8);
    }
    void ctx;
  }

  arp(seg, t, midi, dur, o = {}) {
    if (t == null) return;
    const end = t + dur;
    const dest = this._voice(seg, t, end, { cut: o.cut ?? 1500, q: 2, fEnv: 2400, fDec: 0.05, peak: o.vel ?? 0.18, a: 0.002, dec: 0.08, sus: 0.2, rel: 0.05, wet: o.wet ?? 0.4, pan: o.pan || 0 });
    this._osc(dest, 'square', mtof(midi), t, end + 0.2);
  }

  saws(seg, t, midis, dur, o = {}) {
    if (t == null) return;
    const end = t + dur;
    const dest = this._voice(seg, t, end, { cut: o.cut ?? 2400, q: 0.8, peak: (o.vel ?? 0.3) / Math.sqrt(midis.length), a: o.a ?? 0.01, dec: 0.4, sus: 0.65, rel: o.rel ?? 0.2, wet: o.wet ?? 0.45 });
    for (const m of midis) for (const d of [-14, 0, 14]) this._osc(dest, 'sawtooth', mtof(m), t, end + 1, d);
  }

  reese(seg, t, midi, dur, o = {}) {
    if (t == null) return;
    const ctx = this.ctx, end = t + dur, vel = o.vel ?? 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(o.cut ?? 520, t);
    lp.frequency.linearRampToValueAtTime((o.cut ?? 520) * 1.6, end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.01);
    g.gain.setTargetAtTime(0, end, 0.04);
    lp.connect(g);
    g.connect(seg.music);
    const f = mtof(midi);
    this._osc(lp, 'sawtooth', f, t, end + 0.3, -16);
    this._osc(lp, 'sawtooth', f, t, end + 0.3, 16);
    const sg = ctx.createGain();
    sg.gain.value = 0.7;
    sg.connect(g);
    this._osc(sg, 'sine', f, t, end + 0.3);
  }
}
