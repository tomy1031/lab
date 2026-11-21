// audio.js — a small procedural music engine (drums, bass, pads, arps, lead) plus game sound effects.
// The music follows the Timeline's tempo map; layers are added as the player's combo grows.
import { midiHz, makeRng, clamp } from './util.js';

const VOLUMES = { low: 0.42, mid: 0.72, high: 1.0 };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.level = 0;
    this.tl = null;
    this.ptr = null;
    this.scale = [72, 74, 76, 79, 81, 84, 86, 88];
    this._off = undefined;
  }

  get ok() { return !!this.ctx && this.ctx.state !== 'closed'; }

  init(volume = 'mid') {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!this.ctx) {
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { this.ctx = null; return false; }
      this._build();
    }
    this.setVolume(volume);
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  _build() {
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp).connect(c.destination);

    this.music = c.createGain(); this.music.gain.value = 0.62; this.music.connect(this.master);
    this.pump = c.createGain(); this.pump.connect(this.music);
    this.drums = c.createGain(); this.drums.gain.value = 0.9; this.drums.connect(this.music);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.85; this.sfx.connect(this.master);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(2.6);
    const rg = c.createGain(); rg.gain.value = 0.42;
    this.reverb.connect(rg).connect(this.master);

    this.delay = c.createDelay(1.5); this.delay.delayTime.value = 0.33;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const dOut = c.createGain(); dOut.gain.value = 0.32;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(dOut); dOut.connect(this.pump); dOut.connect(this.reverb);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // continuous "weaving" tone, faded in while a hand rides a comet
    this.weaveGain = c.createGain(); this.weaveGain.gain.value = 0;
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 1800;
    this.weaveOsc = c.createOscillator(); this.weaveOsc.type = 'triangle'; this.weaveOsc.frequency.value = 440;
    this.weaveOsc2 = c.createOscillator(); this.weaveOsc2.type = 'sine'; this.weaveOsc2.frequency.value = 660;
    const lfo = c.createOscillator(); lfo.frequency.value = 5.5;
    const lfoG = c.createGain(); lfoG.gain.value = 6;
    lfo.connect(lfoG); lfoG.connect(this.weaveOsc.frequency); lfoG.connect(this.weaveOsc2.frequency);
    this.weaveOsc.connect(wf); this.weaveOsc2.connect(wf); wf.connect(this.weaveGain);
    this.weaveGain.connect(this.sfx);
    const ws = c.createGain(); ws.gain.value = 0.5; this.weaveGain.connect(ws).connect(this.reverb);
    this.weaveOsc.start(); this.weaveOsc2.start(); lfo.start();
  }

  _impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return b;
  }

  setVolume(v) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(VOLUMES[v] ?? 0.72, this.ctx.currentTime, 0.05);
  }
  suspend() { if (this.ok && this.ctx.state === 'running') return this.ctx.suspend().catch(() => {}); return Promise.resolve(); }
  resume() { if (this.ok && this.ctx.state === 'suspended') return this.ctx.resume().catch(() => {}); return Promise.resolve(); }

  // context time of the sample that is reaching the ears right now, smoothed onto the performance clock
  heardTime() {
    const c = this.ctx;
    let t;
    if (c.getOutputTimestamp) {
      const ts = c.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
        t = ts.contextTime + (c.state === 'running' ? (performance.now() - ts.performanceTime) / 1000 : 0);
      }
    }
    if (t === undefined) t = c.currentTime - (c.outputLatency || c.baseLatency || 0);
    const p = performance.now() / 1000, off = t - p;
    if (this._off === undefined || c.state !== 'running' || Math.abs(off - this._off) > 0.06) this._off = off;
    else this._off += (off - this._off) * 0.04;
    return c.state === 'running' ? p + this._off : t;
  }

  // ---------------- music ----------------
  startMusic(timeline, songStartCtx) {
    this.tl = timeline;
    this.songStart = songStartCtx;
    this.ptr = null;
  }
  stopMusic() { this.tl = null; this.ptr = null; this.weave(false); }

  update() {
    if (!this.ok || !this.tl || this.ctx.state !== 'running') return;
    const c = this.ctx, horizon = c.currentTime + 0.16;
    if (!this.ptr) {
      const st = Math.max(0, c.currentTime - this.songStart + 0.02);
      const seg = this.tl.at(st);
      const step = Math.max(0, Math.ceil((st - seg.t0) / (seg.beatSec / 4)));
      this.ptr = { seg: seg.index, step };
    }
    for (let guard = 0; guard < 64; guard++) {
      const seg = this.tl.segs[this.ptr.seg];
      if (!seg) return;
      if (this.ptr.step >= seg.bars * 16) {
        if (!this.tl.segs[this.ptr.seg + 1]) return; // wait for the game to append (endless) or stop
        this.ptr = { seg: this.ptr.seg + 1, step: 0 };
        continue;
      }
      const when = this.songStart + seg.t0 + this.ptr.step * seg.beatSec / 4;
      if (when > horizon) return;
      if (when > c.currentTime - 0.02) this._step(seg, this.ptr.step, when);
      this.ptr.step++;
    }
  }

  _motif(seg) {
    if (seg._motif) return seg._motif;
    const rng = makeRng(1234 + seg.index * 77);
    const sc = seg.stage.scale, m = [];
    let idx = rng.int(2, 5);
    for (let i = 0; i < 32; i++) {
      const strong = i % 4 === 0, play = strong ? rng.chance(0.8) : rng.chance(i % 2 === 0 ? 0.35 : 0.12);
      if (play) { idx = clamp(idx + rng.pick([-2, -1, -1, 0, 1, 1, 2]), 0, sc.length - 3); m.push(sc[idx] - 12); } else m.push(0);
    }
    return (seg._motif = m);
  }

  _step(seg, step, when) {
    const st = seg.stage, s16 = step % 16, bar = Math.floor(step / 16), sixteenth = seg.beatSec / 4;
    const [root, tones] = st.chords[bar % st.chords.length];
    const L = st.level < 0 ? -1 : clamp(this.level, st.level, st.cap);
    this.scale = st.scale;
    if (s16 === 0) this.delay.delayTime.setValueAtTime(sixteenth * 3, when);

    if (bar === 0 && s16 === 0 && seg.index > 0) this.crash(when, st.level < 0 ? 0.12 : 0.22);
    const isLast = bar === seg.bars - 1 && this.tl.segs[seg.index + 1];
    if (isLast && s16 === 0 && st.level >= 0) this.riser(when, seg.barSec);

    if (L < 0) { // ambient: pad and sparse chimes
      if (s16 === 0) this.pad(when, tones, seg.barSec * 1.02, 0.085, false);
      if (s16 === 0 || s16 === 6 || s16 === 10) this.pluck(when, tones[(bar + s16) % tones.length] + 12, 0.045, 'sine');
      if (s16 === 0 && bar % 2 === 0) this.bass(when, root, seg.barSec * 0.9, 0.18, 300);
      return;
    }
    // drums
    if (L >= 1 ? s16 % 4 === 0 : (s16 === 0 || s16 === 8)) this.kick(when, L >= 1 ? 0.95 : 0.6, L >= 1);
    if (L >= 2 && (s16 === 4 || s16 === 12)) this.clap(when, 0.42);
    if (L === 0) { if (s16 % 4 === 2) this.hat(when, 0.1, false); }
    else {
      if (s16 % 2 === 0) this.hat(when, s16 % 4 === 2 ? 0.2 : 0.09, L >= 3 && s16 % 4 === 2);
      else if (L >= 3) this.hat(when, 0.05, false);
    }
    if (isLast && L >= 1 && s16 >= 12) this.snare(when, 0.15 + (s16 - 12) * 0.08);
    // bass
    if (L >= 1) {
      if (s16 % 2 === 0) this.bass(when, root + (s16 % 4 === 2 ? 12 : 0), sixteenth * 1.7, 0.42, L >= 3 ? 1400 : 900);
      if (L >= 3 && s16 % 4 === 3) this.bass(when, root + 7, sixteenth * 0.9, 0.22, 1200);
    } else if (s16 === 0) this.bass(when, root, seg.barSec * 0.8, 0.2, 400);
    // pads
    if (s16 === 0) this.pad(when, tones, seg.barSec * 0.98, L >= 2 ? 0.06 : 0.08, L >= 3);
    // arp
    const up = [0, 1, 2, 3, 2, 1];
    if (L === 0) { if (s16 % 4 === 2) this.pluck(when, tones[(s16 >> 2) % tones.length] + 12, 0.05, 'triangle'); }
    else if (L === 1) { if (s16 % 2 === 0) this.pluck(when, tones[(s16 >> 1) % tones.length] + 12, 0.055, 'triangle'); }
    else {
      const i = up[step % up.length] + (s16 >= 8 ? 1 : 0);
      this.pluck(when, tones[i % tones.length] + (i >= tones.length ? 24 : 12), s16 % 4 === 0 ? 0.07 : 0.045, L >= 3 ? 'square' : 'triangle');
    }
    // lead (fever)
    if (L >= 4) {
      const m = this._motif(seg)[step % 32];
      if (m) this.lead(when, m, sixteenth * 1.8, 0.09);
    }
  }

  // ---------------- instruments ----------------
  _env(g, when, vel, a, d) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + a + d);
  }
  _noise(when, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(when, Math.random() * 0.3, Math.min(1.69, dur + 0.05));
    return s;
  }
  kick(when, vel = 0.9, pump = true) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(155, when);
    o.frequency.exponentialRampToValueAtTime(44, when + 0.13);
    this._env(g, when, vel, 0.002, 0.38);
    o.connect(g).connect(this.drums);
    o.start(when); o.stop(when + 0.45);
    if (pump) {
      this.pump.gain.setValueAtTime(0.45, when);
      this.pump.gain.linearRampToValueAtTime(1, when + 0.24);
    }
  }
  snare(when, vel = 0.3) {
    const c = this.ctx, s = this._noise(when, 0.2), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.7;
    this._env(g, when, vel, 0.001, 0.16);
    s.connect(f).connect(g).connect(this.drums);
  }
  clap(when, vel = 0.4) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.1;
    g.gain.setValueAtTime(0.0001, when);
    for (let i = 0; i < 3; i++) {
      g.gain.linearRampToValueAtTime(vel, when + i * 0.011 + 0.001);
      g.gain.exponentialRampToValueAtTime(vel * 0.3, when + i * 0.011 + 0.009);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
    const s = this._noise(when, 0.3);
    s.connect(f).connect(g); g.connect(this.drums);
    const send = c.createGain(); send.gain.value = 0.3; g.connect(send).connect(this.reverb);
  }
  hat(when, vel = 0.12, open = false) {
    const c = this.ctx, s = this._noise(when, open ? 0.3 : 0.06), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 7200;
    this._env(g, when, vel, 0.001, open ? 0.24 : 0.04);
    s.connect(f).connect(g).connect(this.drums);
  }
  bass(when, midi, dur, vel = 0.4, cutoff = 900) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = midiHz(midi);
    o2.type = 'sine'; o2.frequency.value = midiHz(midi - 12);
    f.type = 'lowpass'; f.Q.value = 5;
    f.frequency.setValueAtTime(cutoff * 0.3, when);
    f.frequency.exponentialRampToValueAtTime(cutoff, when + 0.02);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.25, when + Math.max(0.05, dur));
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.006);
    g.gain.setValueAtTime(vel, when + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.05);
    const g2 = c.createGain(); g2.gain.value = 0.6;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(this.pump);
    o.start(when); o2.start(when); o.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
  }
  pad(when, notes, dur, vel = 0.08, bright = false) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = bright ? 2600 : 1300; f.Q.value = 0.4;
    const a = Math.min(0.5, dur * 0.3);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel, when + a);
    g.gain.setValueAtTime(vel, when + dur - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, when + dur + 0.5);
    f.connect(g); g.connect(this.pump);
    const send = c.createGain(); send.gain.value = 0.7; g.connect(send).connect(this.reverb);
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = midiHz(n); o.detune.value = det;
        o.connect(f); o.start(when); o.stop(when + dur + 0.6);
      }
    }
  }
  pluck(when, midi, vel = 0.06, type = 'triangle') {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = midiHz(midi);
    f.type = 'lowpass'; f.frequency.value = type === 'square' ? 2400 : 3600;
    this._env(g, when, type === 'square' ? vel * 0.6 : vel, 0.003, 0.22);
    o.connect(f).connect(g); g.connect(this.pump);
    const send = c.createGain(); send.gain.value = 0.5; g.connect(send).connect(this.delay);
    o.start(when); o.stop(when + 0.3);
  }
  lead(when, midi, dur, vel = 0.09) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = midiHz(midi);
    o2.type = 'square'; o2.frequency.value = midiHz(midi); o2.detune.value = 9;
    f.type = 'lowpass'; f.frequency.value = 2800; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.01);
    g.gain.exponentialRampToValueAtTime(vel * 0.5, when + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.12);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g); g.connect(this.music);
    const send = c.createGain(); send.gain.value = 0.45;
    g.connect(send); send.connect(this.delay); send.connect(this.reverb);
    o.start(when); o2.start(when); o.stop(when + dur + 0.2); o2.stop(when + dur + 0.2);
  }
  bell(when, midi, vel = 0.3, out = this.sfx) {
    const c = this.ctx, g = c.createGain();
    this._env(g, when, vel, 0.002, 1.1);
    g.connect(out);
    const send = c.createGain(); send.gain.value = 0.45; g.connect(send).connect(this.reverb);
    [[1, 1], [2, 0.32], [3.01, 0.14], [4.2, 0.06]].forEach(([m, v]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = midiHz(midi) * m; og.gain.value = v;
      o.connect(og).connect(g); o.start(when); o.stop(when + 1.2);
    });
  }
  riser(when, dur) {
    const c = this.ctx, s = this._noise(when, dur), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(300, when); f.frequency.exponentialRampToValueAtTime(7000, when + dur);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.16, when + dur * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, when + dur + 0.02);
    s.connect(f).connect(g).connect(this.music);
  }
  crash(when, vel = 0.2) {
    const c = this.ctx, s = this._noise(when, 1.6), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 3500;
    this._env(g, when, vel, 0.002, 1.5);
    s.connect(f).connect(g); g.connect(this.music);
    const send = c.createGain(); send.gain.value = 0.6; g.connect(send).connect(this.reverb);
  }

  // four soft sticks before the downbeat
  countIn(songStart, beatSec, n = 4) {
    if (!this.ok) return;
    for (let i = n; i >= 1; i--) {
      const when = songStart - i * beatSec;
      if (when < this.ctx.currentTime) continue;
      this.hat(when, i === n ? 0.22 : 0.14, false);
      this.pluck(when, i === 1 ? 84 : 79, 0.05, 'sine');
    }
  }

  // ---------------- sound effects ----------------
  get now() { return this.ctx.currentTime; }
  hit(judge, combo) {
    if (!this.ok) return;
    const sc = this.scale, n = sc[combo % sc.length], t = this.now;
    this.bell(t, n, judge === 'perfect' ? 0.34 : 0.26);
    if (judge === 'perfect') this.bell(t + 0.035, n + 12, 0.09);
  }
  chord(notesUp = 3, vel = 0.22) {
    if (!this.ok) return;
    const sc = this.scale, t = this.now;
    for (let i = 0; i < notesUp; i++) this.bell(t + i * 0.07, sc[(i * 2) % sc.length], vel);
  }
  miss() {
    if (!this.ok) return;
    const c = this.ctx, t = this.now, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    this._env(g, t, 0.16, 0.004, 0.22);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.3);
  }
  whoosh(vel = 0.22) {
    if (!this.ok) return;
    const c = this.ctx, t = this.now, s = this._noise(t, 0.5), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(350, t + 0.45);
    this._env(g, t, vel, 0.04, 0.42);
    s.connect(f).connect(g).connect(this.sfx);
  }
  click() {
    if (!this.ok) return;
    const c = this.ctx, t = this.now, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    this._env(g, t, 0.18, 0.002, 0.07);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.1);
  }
  weave(on, root = 69) {
    if (!this.ok) return;
    const t = this.now;
    this.weaveGain.gain.setTargetAtTime(on ? 0.075 : 0, t, on ? 0.04 : 0.12);
    if (on) {
      this.weaveOsc.frequency.setTargetAtTime(midiHz(root), t, 0.08);
      this.weaveOsc2.frequency.setTargetAtTime(midiHz(root + 7), t, 0.08);
    }
  }
  fanfare() {
    if (!this.ok) return;
    const t = this.now + 0.05;
    [72, 76, 79, 84, 88].forEach((n, i) => this.bell(t + i * 0.12, n, 0.26));
    this.pad(t, [60, 64, 67, 72], 3, 0.07, true);
  }
}
