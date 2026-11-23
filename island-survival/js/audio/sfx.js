// audio/sfx.js — procedural sound effects + ambience (Web Audio only, no audio files).
// One-shots: Sfx.play(name, {volume, pitch, pan}). Ambience: Sfx.setAmbience(env) ~10x/s.
// Everything is silent (a no-op) until engine.ctx exists (after engine.unlock()).

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;

// Pentatonic note table (C major pentatonic, Hz)
const N = { C3: 130.8, D3: 146.8, E3: 164.8, G3: 196, A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, G4: 392, A4: 440,
  C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568 };

// ---------------------------------------------------------------- noise buffers
function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * 3), out = {};
  for (const type of ['white', 'pink', 'brown']) {
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') { // Paul Kellet's filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last; }
      peak = Math.max(peak, Math.abs(d[i]));
    }
    // loop seam: crossfade the last 2000 samples into the start so the loop does not click
    for (let i = 0; i < 2000; i++) { const k = i / 2000; d[len - 2000 + i] = d[len - 2000 + i] * (1 - k) + d[i] * k; }
    const g = 0.9 / (peak || 1);
    for (let i = 0; i < len; i++) d[i] *= g;
    out[type] = buf;
  }
  return out;
}

// ---------------------------------------------------------------- one-shot voice builder
// A Voice owns an output gain (volume/pan) and tracks its sources so everything is cleaned up afterwards.
class Voice {
  constructor(sfx, bus, opts = {}) {
    const c = this.c = sfx.ctx; this.sfx = sfx;
    this.p = (opts.pitch || 1) * rnd(0.95, 1.05);
    this.t0 = c.currentTime + 0.004 + Math.random() * 0.012;
    this.end = this.t0;
    this.nodes = [];
    this.out = c.createGain();
    this.out.gain.value = clamp(opts.volume ?? 1, 0, 2) * rnd(0.9, 1);
    this.nodes.push(this.out);
    if (opts.pan != null && c.createStereoPanner) {
      const pn = c.createStereoPanner(); pn.pan.value = clamp(opts.pan, -1, 1);
      this.out.connect(pn); pn.connect(bus); this.nodes.push(pn);
    } else this.out.connect(bus);
    this.bus = bus;
  }
  _env(g, T, d, vol, a) {
    d = Math.max(d, a + 0.012);
    g.gain.setValueAtTime(0, T);
    g.gain.linearRampToValueAtTime(vol, T + a);
    g.gain.exponentialRampToValueAtTime(0.0001, T + d);
  }
  _fin(src, T, d, extra) {
    src.start(T); src.stop(T + d + 0.05);
    this.end = Math.max(this.end, T + d + 0.05);
    src.onended = () => { try { src.disconnect(); extra.forEach((n) => n.disconnect()); } catch { /* ignore */ } };
  }
  // filtered noise burst. o: buf, type(bandpass|lowpass|highpass|none), f, f2, q, vol, a
  n(t, d, o = {}) {
    const c = this.c, T = this.t0 + t, s = c.createBufferSource(), p = this.p;
    s.buffer = this.sfx.bufs[o.buf || 'white']; s.loop = true;
    const g = c.createGain(), extra = [g];
    let node = s;
    if (o.f && o.type !== 'none') {
      const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1;
      f.frequency.setValueAtTime(o.f * p, T);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2 * p, T + d);
      node.connect(f); node = f; extra.push(f);
    }
    node.connect(g); g.connect(o.dest || this.out);
    this._env(g, T, d, o.vol ?? 0.5, o.a ?? 0.003);
    s.start(T, Math.random() * 2.5); s.stop(T + d + 0.05);
    this.end = Math.max(this.end, T + d + 0.05);
    s.onended = () => { try { s.disconnect(); extra.forEach((x) => x.disconnect()); } catch { /* ignore */ } };
  }
  // oscillator with pitch envelope. o: type, f, f2, curve[], vol, a, fl (post filter freq), ft, q, vib [hz, depthHz]
  o(t, d, o = {}) {
    const c = this.c, T = this.t0 + t, s = c.createOscillator(), p = this.p;
    s.type = o.type || 'sine';
    if (o.curve) s.frequency.setValueCurveAtTime(Float32Array.from(o.curve, (x) => x * p), T, d);
    else {
      s.frequency.setValueAtTime(o.f * p, T);
      if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2 * p, T + (o.fd || d));
    }
    if (o.det) s.detune.value = o.det;
    const g = c.createGain(), extra = [g];
    let node = s;
    if (o.fl) {
      const f = c.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.frequency.value = o.fl * p; f.Q.value = o.q ?? 1;
      node.connect(f); node = f; extra.push(f);
    }
    if (o.vib) {
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1] * p;
      l.connect(lg); lg.connect(s.frequency); l.start(T); l.stop(T + d + 0.05); extra.push(lg);
      l.onended = () => { try { l.disconnect(); } catch { /* ignore */ } };
    }
    node.connect(g); g.connect(this.out);
    this._env(g, T, d, o.vol ?? 0.4, o.a ?? 0.004);
    this._fin(s, T, d, extra);
  }
  // marimba / kalimba-like note: decaying sine partials
  mar(t, f, vol = 0.5, d = 0.9) {
    this.o(t, d, { f, vol, a: 0.004 });
    this.o(t, d * 0.3, { f: f * 4, vol: vol * 0.22 });
    this.o(t, d * 0.12, { f: f * 9.6, vol: vol * 0.07 });
    this.o(t, d * 1.1, { f: f * 1.004, type: 'triangle', vol: vol * 0.25, a: 0.006 });
    this.n(t, 0.02, { f: f * 3, q: 2, vol: vol * 0.25 });
  }
  // slow-attack soft pad note
  pad(t, f, d, vol = 0.2) {
    this.o(t, d, { f, vol, a: d * 0.25 });
    this.o(t, d, { f: f * 1.005, type: 'triangle', vol: vol * 0.5, a: d * 0.3 });
  }
  // feedback-delay echo of everything written to this voice (island outdoor tail)
  echo(time, fb, wet, lpHz) {
    const c = this.c, dl = c.createDelay(1), f = c.createGain(), lp = c.createBiquadFilter(), w = c.createGain();
    dl.delayTime.value = time; f.gain.value = fb; w.gain.value = wet; lp.type = 'lowpass'; lp.frequency.value = lpHz;
    this.out.connect(dl); dl.connect(lp); lp.connect(f); f.connect(dl); lp.connect(w); w.connect(this.bus);
    this.nodes.push(dl, f, lp, w);
    this.end += time * 6;
  }
  done() {
    const ms = Math.max(0, (this.end - this.c.currentTime) * 1000) + 250;
    setTimeout(() => { for (const n of this.nodes) { try { n.disconnect(); } catch { /* ignore */ } } }, ms);
  }
}

// ---------------------------------------------------------------- sound recipes: (v, opts) => ...
const seq = (v, notes, step, vol, d = 0.9, t = 0) => notes.forEach((f, i) => v.mar(t + i * step, f, vol, d));
const droplets = (v, t, count, span, vol) => {
  for (let i = 0; i < count; i++) v.o(t + rnd(0, span), 0.07, { f: rnd(500, 1200), f2: rnd(1300, 2400), vol: vol * rnd(0.4, 1) });
};
const stoneClack = (v, t, vol = 0.5) => {
  v.n(t, 0.03, { type: 'highpass', f: 2500, vol: vol * 0.8 });
  v.o(t, 0.09, { f: rnd(1700, 2100), vol: vol * 0.35 }); v.o(t, 0.06, { f: rnd(2700, 3300), vol: vol * 0.25 });
  v.o(t, 0.05, { f: rnd(280, 340), f2: 200, vol: vol * 0.5 });
};

const SOUNDS = {
  // ---- footsteps
  step_sand(v) {
    v.n(0, 0.15, { buf: 'brown', type: 'lowpass', f: rnd(900, 1300), f2: 300, vol: 1, a: 0.02 });
    v.n(0, 0.12, { buf: 'pink', f: 2600, q: 0.4, vol: 0.2, a: 0.015 });
  },
  step_grass(v) {
    v.n(0, 0.16, { buf: 'pink', f: rnd(2600, 3400), q: 0.6, vol: 0.4, a: 0.025 });
    v.n(0.04, 0.12, { f: 5200, q: 0.7, vol: 0.12, a: 0.02 });
    v.o(0, 0.08, { f: 90, f2: 55, vol: 0.35 });
  },
  step_rock(v) {
    v.n(0, 0.04, { f: 3500, q: 3, vol: 0.5 });
    v.o(0, 0.07, { f: 190, f2: 90, vol: 0.55 });
    v.n(0.005, 0.09, { f: 1500, q: 1, vol: 0.25 });
  },
  step_water(v) {
    v.n(0, 0.35, { buf: 'pink', f: 700, f2: 1900, q: 0.8, vol: 0.55, a: 0.03 });
    v.n(0.02, 0.22, { type: 'highpass', f: 3000, vol: 0.12, a: 0.03 });
    droplets(v, 0.05, 3, 0.25, 0.1);
  },
  step_wood(v) {
    v.o(0, 0.12, { type: 'triangle', f: 150, f2: 85, vol: 0.7 });
    v.n(0, 0.07, { f: 700, q: 2, vol: 0.4 });
    v.o(0.005, 0.06, { f: rnd(300, 360), f2: 250, vol: 0.2 });
  },
  swim(v) {
    v.n(0, 0.65, { buf: 'pink', f: 450, f2: 1500, q: 0.8, vol: 0.55, a: 0.18 });
    v.n(0.1, 0.4, { type: 'highpass', f: 2500, vol: 0.12, a: 0.15 });
    droplets(v, 0.2, 4, 0.5, 0.09);
  },
  splash(v) {
    v.n(0, 0.5, { buf: 'pink', f: 1400, f2: 300, q: 0.7, vol: 0.8, a: 0.01 });
    v.n(0, 0.3, { type: 'highpass', f: 3000, vol: 0.3 });
    v.o(0.03, 0.14, { f: 280, f2: 800, vol: 0.3 });
    droplets(v, 0.12, 4, 0.4, 0.1);
  },
  splash_big(v) {
    v.o(0, 0.4, { f: 95, f2: 38, vol: 0.9 });
    v.n(0, 1.3, { buf: 'pink', f: 1800, f2: 200, q: 0.6, vol: 1, a: 0.02 });
    v.n(0, 0.8, { type: 'highpass', f: 2500, vol: 0.4, a: 0.02 });
    v.o(0.08, 0.25, { f: 180, f2: 600, vol: 0.3 });
    droplets(v, 0.2, 8, 0.9, 0.12);
  },
  // ---- gathering / work
  chop(v) {
    v.o(0, 0.14, { f: 210, f2: 70, vol: 0.9 });
    v.o(0, 0.1, { type: 'triangle', f: 430, f2: 200, vol: 0.3 });
    v.n(0, 0.09, { f: 900, q: 1.5, vol: 0.6 });
    v.n(0, 0.02, { type: 'highpass', f: 3000, vol: 0.4 });
  },
  chop_weak(v) {
    v.o(0, 0.09, { f: 260, f2: 120, vol: 0.5 });
    v.n(0, 0.06, { f: 1200, q: 1.5, vol: 0.35 });
    v.o(0, 0.07, { type: 'triangle', f: 500, f2: 320, vol: 0.18 });
  },
  tree_fall(v) {
    const creak = Array.from({ length: 24 }, (_, i) => 130 - i * 1.5 + rnd(-12, 12));
    v.o(0, 1.3, { type: 'sawtooth', curve: creak, vol: 0.18, fl: 450, ft: 'bandpass', q: 6, a: 0.2 });
    for (let i = 0; i < 4; i++) v.n(0.5 + i * rnd(0.12, 0.25), 0.08, { type: 'highpass', f: 1800, vol: 0.5 });
    v.n(0.9, 1.8, { buf: 'pink', f: 4200, q: 0.5, vol: 0.3, a: 0.5 });          // leaves
    v.n(1.35, 1.6, { buf: 'brown', type: 'lowpass', f: 700, f2: 120, vol: 1, a: 0.01 });
    v.o(1.35, 0.7, { f: 70, f2: 28, vol: 0.9 });
    v.n(1.5, 0.5, { f: 1000, q: 0.8, vol: 0.4 });
    v.o(1.75, 0.3, { f: 55, f2: 30, vol: 0.5 });
  },
  stone_hit(v) { stoneClack(v, 0, 0.7); },
  stone_break(v) {
    stoneClack(v, 0, 0.8);
    v.n(0.02, 0.5, { f: 1300, q: 0.7, vol: 0.4, a: 0.01 });
    for (let i = 0; i < 6; i++) stoneClack(v, 0.06 + i * rnd(0.04, 0.09), rnd(0.15, 0.35));
    v.o(0, 0.25, { f: 120, f2: 50, vol: 0.6 });
  },
  dig(v) {
    v.n(0, 0.32, { buf: 'brown', type: 'lowpass', f: 1400, f2: 400, vol: 1, a: 0.05 });
    v.n(0.05, 0.25, { f: 3200, q: 0.8, vol: 0.2, a: 0.04 });
    for (let i = 0; i < 4; i++) v.n(0.1 + rnd(0, 0.25), 0.03, { type: 'highpass', f: 4000, vol: 0.15 });
    v.o(0, 0.1, { f: 100, f2: 60, vol: 0.4 });
  },
  rustle(v) {
    const k = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < k; i++) v.n(i * rnd(0.05, 0.11), rnd(0.08, 0.18), { buf: 'pink', f: rnd(3000, 5500), q: 0.7, vol: rnd(0.12, 0.3), a: 0.03 });
  },
  pick(v) {
    v.o(0, 0.07, { f: 600, f2: 1200, vol: 0.4 });
    v.n(0, 0.025, { type: 'highpass', f: 3500, vol: 0.3 });
  },
  pickup(v) {
    v.n(0, 0.2, { buf: 'pink', f: 1300, q: 0.6, vol: 0.5, a: 0.05 });
    v.n(0.05, 0.1, { buf: 'brown', type: 'lowpass', f: 600, vol: 0.6, a: 0.02 });
    v.o(0.02, 0.12, { f: 240, f2: 180, vol: 0.18 });
  },
  drop(v) {
    v.n(0, 0.1, { buf: 'brown', type: 'lowpass', f: 700, vol: 0.9 });
    v.o(0, 0.1, { f: 130, f2: 60, vol: 0.5 });
    v.n(0.03, 0.12, { buf: 'pink', f: 1600, q: 0.6, vol: 0.2, a: 0.02 });
  },
  // ---- fishing
  cast(v) {
    v.n(0, 0.55, { buf: 'pink', f: 500, f2: 2600, q: 1, vol: 0.7, a: 0.14 });
    for (let i = 0; i < 26; i++) { // line whirr: dense ticks that thin out
      v.n(0.1 + i * (0.012 + i * 0.0012), 0.012, { f: 4200, q: 4, vol: 0.12 });
    }
    v.n(0.75, 0.25, { buf: 'pink', f: 1500, f2: 400, vol: 0.25 });
  },
  reel(v) {
    v.n(0, 0.025, { f: 2400, q: 4, vol: 0.5 });
    v.o(0, 0.02, { type: 'square', f: 1100, vol: 0.12, fl: 2200 });
    v.n(0.055, 0.02, { f: 1700, q: 4, vol: 0.3 });
  },
  bite(v) {
    v.o(0, 0.09, { f: 240, f2: 720, vol: 0.55 });
    v.n(0, 0.1, { f: 800, q: 1, vol: 0.25 });
    v.o(0.13, 0.07, { f: 300, f2: 800, vol: 0.28 });
  },
  fish_catch(v) {
    v.n(0, 0.4, { buf: 'pink', f: 1500, f2: 300, vol: 0.6, a: 0.01 });
    for (let i = 0; i < 6; i++) {
      const t = 0.12 + i * rnd(0.07, 0.13);
      v.n(t, 0.08, { f: rnd(1000, 2000), q: 0.8, vol: rnd(0.25, 0.5) * (1 - i * 0.1) });
      v.n(t, 0.05, { type: 'highpass', f: 3500, vol: 0.15 });
    }
    droplets(v, 0.1, 4, 0.7, 0.1);
  },
  line_snap(v) {
    v.n(0, 0.05, { type: 'highpass', f: 4000, vol: 0.7 });
    v.o(0, 0.18, { f: 1900, f2: 600, vol: 0.3 });
    v.n(0.02, 0.25, { f: 5000, q: 2, f2: 2000, vol: 0.12 });
  },
  net_throw(v) {
    v.n(0, 0.55, { buf: 'pink', f: 400, f2: 1600, q: 0.9, vol: 0.6, a: 0.15 });
    for (let i = 0; i < 6; i++) v.n(0.15 + i * rnd(0.04, 0.07), 0.05, { f: rnd(2500, 4000), q: 1, vol: 0.12 });
    v.n(0.6, 0.35, { buf: 'pink', f: 1200, f2: 300, vol: 0.35 });
  },
  net_pull(v) {
    v.n(0, 1, { buf: 'brown', type: 'lowpass', f: 900, f2: 400, vol: 1, a: 0.3 });
    v.n(0, 0.9, { buf: 'pink', f: 1600, q: 0.6, vol: 0.2, a: 0.3 });
    droplets(v, 0.2, 6, 0.8, 0.08);
  },
  // ---- bow
  bow_draw(v) {
    const c = Array.from({ length: 20 }, (_, i) => 150 + i * 6 + rnd(-10, 10));
    v.o(0, 0.5, { type: 'sawtooth', curve: c, vol: 0.2, fl: 500, ft: 'bandpass', q: 7, a: 0.1 });
    v.n(0.05, 0.4, { buf: 'pink', f: 1400, q: 1.5, vol: 0.06, a: 0.15 });
  },
  bow_release(v) {
    v.o(0, 0.45, { type: 'triangle', f: 190, vol: 0.5 });
    v.o(0, 0.2, { f: 380, vol: 0.2, vib: [30, 8] }); v.o(0, 0.12, { f: 575, vol: 0.1 });
    v.n(0, 0.02, { type: 'highpass', f: 2500, vol: 0.5 });
    v.n(0.02, 0.2, { buf: 'pink', f: 1500, f2: 4000, q: 1, vol: 0.4, a: 0.04 });
  },
  arrow_hit(v) {
    v.o(0, 0.14, { f: 150, f2: 60, vol: 0.85 });
    v.n(0, 0.06, { f: 900, q: 1, vol: 0.5 });
    v.o(0.01, 0.35, { f: 720, vol: 0.1, vib: [40, 15] });
  },
  arrow_miss(v) {
    v.n(0, 0.16, { buf: 'brown', type: 'lowpass', f: 800, vol: 0.9 });
    v.o(0, 0.1, { f: 95, f2: 60, vol: 0.4 });
    v.n(0.02, 0.12, { buf: 'pink', f: 2400, q: 0.5, vol: 0.12 });
  },
  // ---- gun
  gunshot(v) {
    v.n(0, 0.07, { type: 'highpass', f: 1200, vol: 1 });
    v.n(0, 0.35, { type: 'lowpass', f: 4500, f2: 350, vol: 0.9, a: 0.001 });
    v.o(0, 0.4, { f: 150, f2: 32, vol: 0.9 });
    v.n(0.03, 1.3, { buf: 'brown', type: 'lowpass', f: 500, f2: 120, vol: 0.9, a: 0.05 });
    v.echo(0.21, 0.42, 0.45, 1800);
  },
  gun_empty(v) {
    v.n(0, 0.02, { f: 3000, q: 5, vol: 0.5 });
    v.o(0, 0.025, { f: 1000, f2: 600, vol: 0.2 });
    v.o(0, 0.04, { f: 220, vol: 0.15 });
  },
  gun_reload(v) {
    const clack = (t, f, vol) => {
      v.n(t, 0.03, { type: 'highpass', f: 2500, vol });
      for (const m of [1, 1.9, 2.7]) v.o(t, 0.09 / m, { f: f * m, vol: vol * 0.3 / m });
    };
    clack(0, 1100, 0.6);
    v.n(0.3, 0.18, { f: 2200, f2: 3500, q: 3, vol: 0.18, a: 0.05 });
    clack(0.55, 900, 0.7);
    clack(0.85, 1400, 0.5);
  },
  // ---- spear / combat
  spear_thrust(v) { v.n(0, 0.32, { buf: 'pink', f: 700, f2: 3200, q: 1.2, vol: 0.7, a: 0.1 }); },
  hit_flesh(v) {
    v.o(0, 0.16, { f: 120, f2: 48, vol: 0.9 });
    v.n(0, 0.12, { buf: 'brown', type: 'lowpass', f: 700, vol: 1 });
    v.n(0.01, 0.1, { f: 350, q: 1.5, vol: 0.3 });
  },
  animal_hurt(v) {
    v.o(0, 0.4, { type: 'sawtooth', curve: [600, 1000, 1500, 1750, 1300, 900, 650], vol: 0.35, fl: 2400, q: 2, vib: [25, 60], a: 0.02 });
    v.n(0, 0.35, { f: 1800, q: 2, vol: 0.12, a: 0.03 });
  },
  // ---- fire
  flint(v) {
    v.n(0, 0.02, { type: 'highpass', f: 4000, vol: 0.7 });
    v.n(0, 0.1, { f: 5200, f2: 3000, q: 3, vol: 0.3 });
    for (let i = 0; i < 4; i++) v.o(rnd(0, 0.12), 0.012, { f: rnd(5000, 8000), vol: 0.1 });
  },
  rub(v) {
    v.n(0, 0.26, { buf: 'pink', f: 1400, f2: 2600, q: 1.5, vol: 0.5, a: 0.05 });
    v.n(0.02, 0.2, { f: 4200, q: 2, vol: 0.1, a: 0.05 });
  },
  ignite(v) {
    v.n(0, 0.9, { buf: 'brown', type: 'lowpass', f: 250, f2: 1000, vol: 1, a: 0.1 });
    v.o(0, 0.5, { f: 55, f2: 95, vol: 0.5, a: 0.06 });
    v.n(0.05, 0.6, { buf: 'pink', f: 2000, f2: 900, q: 0.5, vol: 0.2, a: 0.1 });
    for (let i = 0; i < 6; i++) v.n(0.2 + rnd(0, 0.6), 0.03, { type: 'highpass', f: rnd(2000, 5000), vol: 0.25 });
  },
  fire_out(v) {
    v.n(0, 1.7, { buf: 'white', f: 5500, q: 0.5, vol: 0.5, a: 0.06 });
    v.n(0, 1.2, { type: 'highpass', f: 2500, vol: 0.2, a: 0.1 });
    for (let i = 0; i < 4; i++) v.o(rnd(0.1, 1), 0.05, { f: rnd(300, 600), f2: rnd(600, 1000), vol: 0.1 });
  },
  sizzle(v) {
    v.n(0, 1.6, { buf: 'white', type: 'highpass', f: 5000, vol: 0.25, a: 0.08 });
    v.n(0, 1.5, { buf: 'pink', f: 3000, q: 0.5, vol: 0.12, a: 0.1 });
    for (let i = 0; i < 28; i++) v.n(rnd(0, 1.4), 0.02, { type: 'highpass', f: rnd(3000, 7000), vol: rnd(0.1, 0.35) });
  },
  // ---- body
  eat(v) {
    let t = 0;
    for (let i = 0; i < 3; i++) {
      v.n(t, 0.07, { f: rnd(2000, 3000), q: 1, vol: 0.5 });
      v.n(t, 0.09, { buf: 'brown', type: 'lowpass', f: 900, vol: 0.5 });
      v.n(t + 0.03, 0.04, { type: 'highpass', f: 4000, vol: 0.2 });
      t += rnd(0.17, 0.26);
    }
  },
  drink(v) {
    let t = 0;
    for (let i = 0; i < 3; i++) {
      v.o(t, 0.14, { f: 330, f2: 140, vol: 0.35, a: 0.02 });
      v.n(t, 0.14, { buf: 'brown', type: 'lowpass', f: 600, vol: 0.5, a: 0.03 });
      v.o(t + 0.05, 0.06, { f: 500, f2: 900, vol: 0.08 });
      t += rnd(0.26, 0.34);
    }
  },
  cough(v) {
    for (let i = 0; i < 2; i++) {
      const t = i * rnd(0.17, 0.22);
      v.n(t, 0.12, { f: 900, q: 1.5, vol: 0.55 });
      v.o(t, 0.12, { type: 'sawtooth', f: 170, f2: 120, vol: 0.2, fl: 800, ft: 'bandpass', q: 2 });
    }
    v.n(0.45, 0.2, { f: 1500, q: 1, vol: 0.08, a: 0.08 });
  },
  sneeze(v) {
    v.n(0, 0.25, { buf: 'pink', f: 2300, f2: 4000, q: 1, vol: 0.2, a: 0.2 });
    v.n(0.3, 0.18, { f: 1800, q: 0.8, vol: 0.7 });
    v.o(0.3, 0.16, { type: 'sawtooth', f: 260, f2: 160, vol: 0.12, fl: 1500, ft: 'bandpass', q: 1.5 });
    v.n(0.32, 0.25, { type: 'highpass', f: 4000, vol: 0.12 });
  },
  vomit(v) {
    v.o(0, 0.5, { type: 'sawtooth', f: 85, f2: 60, vol: 0.2, fl: 400, a: 0.12 });
    v.n(0, 0.5, { buf: 'pink', f: 500, f2: 300, q: 2, vol: 0.45, a: 0.12 });
    v.n(0.4, 0.35, { buf: 'brown', type: 'lowpass', f: 900, f2: 250, vol: 0.9, a: 0.02 });
    v.n(0.4, 0.25, { f: 1800, f2: 600, q: 1, vol: 0.2 });
    for (let i = 0; i < 4; i++) v.o(0.45 + rnd(0, 0.4), 0.07, { f: rnd(200, 350), f2: rnd(400, 700), vol: 0.12 });
  },
  hurt(v) {
    v.o(0, 0.16, { f: 105, f2: 48, vol: 0.9 });
    v.n(0, 0.12, { buf: 'brown', type: 'lowpass', f: 800, vol: 0.9 });
    v.n(0.03, 0.22, { buf: 'pink', f: 1100, q: 1, vol: 0.18, a: 0.03 });
  },
  heartbeat(v) {
    v.o(0, 0.14, { f: 62, f2: 42, vol: 0.9, a: 0.01 });
    v.n(0, 0.1, { buf: 'brown', type: 'lowpass', f: 200, vol: 0.5 });
    v.o(0.17, 0.12, { f: 54, f2: 38, vol: 0.6, a: 0.01 });
  },
  shiver(v) {
    for (let i = 0; i < 9; i++) {
      const t = i * 0.045 + rnd(-0.008, 0.008);
      v.o(t, 0.02, { type: 'triangle', f: rnd(1800, 2400), vol: rnd(0.08, 0.2) });
      v.n(t, 0.015, { f: 3200, q: 3, vol: 0.15 });
    }
    v.n(0, 0.45, { buf: 'pink', f: 2500, q: 0.6, vol: 0.06, a: 0.1 });
  },
  sleep_in(v) {
    v.o(0, 1.8, { f: 440, f2: 220, vol: 0.3, a: 0.3 });
    v.o(0.1, 1.6, { type: 'triangle', f: 660, f2: 330, vol: 0.12, a: 0.3 });
  },
  wake(v) {
    v.o(0, 1.4, { f: 262, f2: 392, vol: 0.3, a: 0.4 });
    v.o(0.1, 1.3, { type: 'triangle', f: 523, f2: 784, vol: 0.1, a: 0.4 });
  },
  // ---- craft / build
  craft_ok(v) {
    v.o(0, 0.07, { type: 'triangle', f: 260, f2: 150, vol: 0.4 });
    v.n(0, 0.05, { f: 1200, q: 1.5, vol: 0.4 });
    v.o(0.12, 0.07, { type: 'triangle', f: 300, f2: 170, vol: 0.35 });
    v.n(0.12, 0.05, { f: 1500, q: 1.5, vol: 0.3 });
    v.n(0.2, 0.15, { buf: 'pink', f: 1800, q: 0.7, vol: 0.12, a: 0.03 });
    v.mar(0.3, N.G5, 0.3, 0.8); v.mar(0.4, N.C6, 0.3, 1);
  },
  craft_fail(v) {
    v.o(0, 0.22, { type: 'triangle', f: 160, f2: 65, vol: 0.7 });
    v.n(0, 0.12, { f: 450, q: 1, vol: 0.5 });
    v.o(0.12, 0.2, { type: 'triangle', f: 120, f2: 55, vol: 0.5 });
  },
  craft_new(v) {
    seq(v, [N.E5, N.G5, N.A5, N.C6, N.D6, N.G6], 0.07, 0.3, 0.9);
    v.mar(0.5, N.E6, 0.25, 1.4);
    for (let i = 0; i < 10; i++) v.o(rnd(0.05, 0.8), 0.1, { f: rnd(3000, 5500), vol: 0.05 });
    v.n(0.1, 0.8, { type: 'highpass', f: 6000, vol: 0.05, a: 0.2 });
  },
  hammer(v) {
    for (let i = 0; i < 2; i++) {
      const t = i * rnd(0.24, 0.3);
      v.o(t, 0.07, { f: 320, f2: 140, vol: 0.55 });
      v.n(t, 0.03, { f: 2000, q: 2, vol: 0.5 });
      v.n(t, 0.09, { f: 800, q: 1.5, vol: 0.3 });
      v.o(t, 0.15, { f: 1450, vol: 0.06 });
    }
  },
  build_done(v) {
    v.o(0, 0.1, { f: 200, f2: 90, vol: 0.5 }); v.n(0, 0.06, { f: 1500, q: 1.5, vol: 0.4 });
    seq(v, [N.C5, N.E5, N.G5, N.C6], 0.12, 0.35, 1.1, 0.2);
  },
  saw(v) {
    for (let i = 0; i < 2; i++) {
      const t = i * 0.38;
      v.n(t, 0.36, { buf: 'pink', f: 1800 + i * 300, f2: 2600, q: 3, vol: 0.45, a: 0.12 });
      v.o(t, 0.36, { type: 'sawtooth', f: 240 + i * 10, vol: 0.06, fl: 1800, a: 0.12, vib: [38, 6] });
    }
  },
  // ---- ui (routed to the ui bus)
  ui_click(v) { v.o(0, 0.04, { f: 1300, f2: 800, vol: 0.4 }); v.n(0, 0.015, { f: 3500, q: 2, vol: 0.2 }); },
  ui_open(v) { v.o(0, 0.12, { type: 'triangle', f: 420, f2: 780, vol: 0.28, a: 0.01 }); v.n(0, 0.1, { buf: 'pink', f: 1500, f2: 3000, vol: 0.06, a: 0.03 }); },
  ui_close(v) { v.o(0, 0.1, { type: 'triangle', f: 700, f2: 380, vol: 0.25, a: 0.01 }); v.n(0, 0.08, { buf: 'pink', f: 2500, f2: 1200, vol: 0.05, a: 0.02 }); },
  ui_error(v) { v.o(0, 0.12, { type: 'triangle', f: 230, vol: 0.35 }); v.o(0.12, 0.16, { type: 'triangle', f: 175, vol: 0.35 }); },
  ui_toast(v) { v.mar(0, N.A5, 0.22, 0.6); v.mar(0.1, N.E6, 0.18, 0.7); },
  ui_select(v) { v.o(0, 0.05, { f: 900, f2: 1100, vol: 0.25 }); },
  // ---- jingles
  day_start(v) { seq(v, [N.G4, N.A4, N.C5, N.E5], 0.22, 0.4, 1.3); v.mar(0.9, N.G5, 0.25, 1.8); },
  night_fall(v) {
    seq(v, [N.A3, N.E4, N.D4, N.A3], 0.5, 0.35, 2);
    v.pad(0, N.A3 / 2, 2.6, 0.12);
  },
  achievement(v) {
    seq(v, [N.C5, N.E5, N.G5, N.C6], 0.09, 0.35, 1.0);
    v.mar(0.4, N.E6, 0.25, 1.5); v.mar(0.4, N.G5, 0.2, 1.5);
  },
  rescue(v) {
    seq(v, [N.C4, N.E4, N.G4, N.C5], 0.2, 0.4, 1.2);
    v.mar(0.9, N.E5, 0.35, 2); v.mar(1.05, N.G5, 0.35, 2); v.mar(1.2, N.C6, 0.4, 2.2);
    v.pad(0.9, N.C4, 2.1, 0.2); v.pad(0.9, N.G4, 2.1, 0.14); v.pad(0.9, N.E5, 2.1, 0.1);
    seq(v, [N.G5, N.A5, N.C6, N.E6], 0.1, 0.2, 1.2, 1.6);
  },
  death(v) {
    seq(v, [N.A4, N.G4, N.E4, N.D4, N.C4, N.A3], 0.42, 0.35, 1.8);
    v.pad(0, 110, 3, 0.2);
    v.o(0.2, 2.8, { f: 55, f2: 40, vol: 0.25, a: 0.4 });
  },
  danger(v) {
    v.o(0, 1.2, { type: 'sawtooth', f: 110, vol: 0.18, fl: 500, a: 0.05, vib: [6, 4] });
    v.o(0, 1.2, { type: 'sawtooth', f: 155.6, det: 12, vol: 0.14, fl: 500, a: 0.05 });
    v.n(0, 1, { buf: 'pink', f: 300, f2: 2500, q: 2, vol: 0.4, a: 0.7 });
    v.o(0.7, 0.3, { f: 70, f2: 38, vol: 0.8 });
    v.n(0.7, 0.4, { buf: 'brown', type: 'lowpass', f: 400, vol: 0.8 });
  },
  discover(v) { seq(v, [N.E5, N.G5, N.A5, N.D6], 0.14, 0.32, 1.4); v.pad(0.3, N.E4, 1.5, 0.08); },
  // ---- weather
  thunder(v, o) {
    const d = clamp(o.distance ?? 0.5), delay = d * 0.5, near = d < 0.45;
    if (near) {
      v.n(delay, 0.2, { type: 'highpass', f: 800, vol: 1 - d });
      v.n(delay, 0.35, { type: 'lowpass', f: 3500, f2: 250, vol: 0.9 * (1 - d) });
      v.o(delay, 0.45, { f: 100, f2: 34, vol: 0.8 * (1 - d) });
    }
    const dur = 3 + 3 * d, base = delay + (near ? 0.12 : 0);
    for (let i = 0; i < 6; i++) {
      const len = rnd(1.3, 2.4), t = Math.min(base + i * rnd(0.3, 0.6) * (0.7 + d), dur - 1.0);
      v.n(t, len, { buf: 'brown', type: 'lowpass', f: (2000 - 1400 * d) * rnd(0.6, 1), f2: 90, vol: (1.1 - 0.4 * d) * (1 - i * 0.1), a: 0.15 + d * 0.4 });
    }
    v.o(base, dur, { f: 48, f2: 28, vol: 0.4 * (1 - 0.4 * d), a: 0.4 });
  },
  wave_crash(v) {
    v.n(0, 2.8, { buf: 'pink', type: 'lowpass', f: 1800, f2: 350, vol: 1, a: 0.5 });
    v.n(0.3, 2.3, { buf: 'white', f: 3200, f2: 1500, q: 0.5, vol: 0.3, a: 0.6 });
    v.n(0.5, 1.5, { buf: 'brown', type: 'lowpass', f: 300, vol: 0.9, a: 0.4 });
  },
  // ---- animals
  boar(v) {
    for (let i = 0; i < 2; i++) {
      const t = i * 0.26;
      v.o(t, 0.22, { type: 'sawtooth', f: 95, f2: 68, vol: 0.4, fl: 520, q: 1.5, a: 0.03, vib: [28, 6] });
      v.n(t, 0.2, { buf: 'pink', f: 450, f2: 250, q: 1.5, vol: 0.3, a: 0.03 });
    }
  },
  bird_call(v) {
    const base = rnd(1800, 3800), pat = Math.floor(Math.random() * 4);
    const note = (t, f1, f2, d, vol = 0.22) => {
      v.o(t, d, { f: f1, f2, vol, a: 0.008 }); v.o(t, d, { f: f1 * 2, f2: f2 * 2, vol: vol * 0.2, a: 0.008 });
    };
    if (pat === 0) { const k = 4 + Math.floor(Math.random() * 4); for (let i = 0; i < k; i++) note(i * 0.075, base * (1 - i * 0.03), base * (0.85 - i * 0.03), 0.06); }
    else if (pat === 1) { note(0, base * 0.7, base * 0.8, 0.18); note(0.24, base, base * 1.25, 0.22); }
    else if (pat === 2) { for (let i = 0; i < 3; i++) note(i * 0.11, base * 1.1, base * 1.5, 0.07); }
    else v.o(0, 0.5, { f: base * 0.6, f2: base * 0.9, vol: 0.2, a: 0.05, vib: [rnd(14, 24), base * 0.08] });
  },
  seagull(v) {
    const k = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < k; i++) {
      v.o(i * 0.3, 0.28, { type: 'sawtooth', curve: [850, 1450, 1900, 1650, 1150].map((x) => x * (1 - i * 0.06)), vol: 0.2, fl: 2200, ft: 'bandpass', q: 2.5, a: 0.03 });
      v.n(i * 0.3, 0.25, { f: 2200, q: 2, vol: 0.05, a: 0.04 });
    }
  },
  crab(v) {
    const k = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) {
      v.n(i * rnd(0.05, 0.09), 0.012, { f: 3600, q: 5, vol: 0.45 });
      v.o(i * 0.07, 0.015, { f: 2400, vol: 0.12 });
    }
  },
  frog(v) {
    const k = 3 + Math.floor(Math.random() * 3), f = rnd(260, 380);
    for (let i = 0; i < k; i++) v.o(i * 0.055, 0.05, { type: 'triangle', f, f2: f * 1.4, vol: 0.28, fl: 900, ft: 'bandpass', q: 3, a: 0.008 });
    v.o(k * 0.055 + 0.05, 0.12, { type: 'triangle', f: f * 0.8, f2: f * 0.55, vol: 0.2, fl: 800, ft: 'bandpass', q: 3 });
  },
  snake_hiss(v) {
    v.n(0, 1, { buf: 'white', f: 6000, q: 0.8, vol: 0.5, a: 0.18 });
    v.n(0, 0.9, { type: 'highpass', f: 3500, vol: 0.2, a: 0.2 });
  },
  fly_buzz(v) {
    const c = Array.from({ length: 24 }, () => 170 + rnd(-25, 25));
    v.o(0, 0.45, { type: 'sawtooth', curve: c, vol: 0.12, fl: 900, ft: 'bandpass', q: 2, a: 0.08, vib: [60, 6] });
  },
};

const SURFACE = { beach: 'step_sand', sand: 'step_sand', grass: 'step_grass', jungle: 'step_grass', hill: 'step_grass',
  rocks: 'step_rock', rock: 'step_rock', cliff: 'step_rock', water: 'step_water', stream: 'step_water', pond: 'step_water', wood: 'step_wood' };

// ---------------------------------------------------------------- Sfx
export class Sfx {
  constructor(engine) {
    this.engine = engine;
    this.strict = false;       // tests set this to rethrow errors instead of swallowing them
    this.bufs = null; this._bufCtx = null;
    this.A = null;             // ambience graph
    this.ambOn = true; this._lt = 0;
    this._next = { bird: 0, frog: 0, gull: 0 };
    this._lastEnv = null;
  }
  get ctx() { return this.engine.ctx; }
  static get names() { return Object.keys(SOUNDS); }

  _prep() {
    const c = this.ctx;
    if (!c) return false;
    if (this._bufCtx !== c) { this.bufs = makeNoise(c); this._bufCtx = c; this.A = null; }
    return true;
  }

  play(name, opts = {}) {
    const fn = SOUNDS[name];
    if (!fn || !this._prep()) return;
    const bus = name.startsWith('ui_') ? this.engine.ui : this.engine.sfx;
    if (!bus) return;
    try {
      const v = new Voice(this, bus, opts);
      fn(v, opts);
      v.done();
    } catch (e) { if (this.strict) throw e; }
  }

  footstep(surface, opts = {}) {
    const n = SURFACE[surface];
    if (n) this.play(n, opts);
    return n || null;
  }

  // ---- ambience ----------------------------------------------------------
  _loop(type, dest) {
    const c = this.ctx, s = c.createBufferSource();
    s.buffer = this.bufs[type]; s.loop = true; s.connect(dest); s.start(0, Math.random() * 2.5);
    return s;
  }
  _lfo(freq, depth, target) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(target); o.start();
    return o;
  }
  _filt(type, f, q = 1) {
    const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
  }
  _gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  _initAmbience() {
    const c = this.ctx, A = this.A = {};
    A.bus = this._gain(1); A.uw = this._filt('lowpass', 22000, 0.7);
    A.bus.connect(A.uw); A.uw.connect(this.engine.amb);
    // ocean surf: rumbling brown noise with slow swells + foamy hiss that lags it
    A.surfG = this._gain(0); A.surfG.connect(A.bus);
    const sw = this._gain(0.55); sw.connect(A.surfG);
    this._loop('brown', this._chain(this._filt('lowpass', 480, 0.7), sw));
    this._lfo(0.085, 0.4, sw.gain);
    A.foamG = this._gain(0); A.foamG.connect(A.bus);
    const fw = this._gain(0.5); fw.connect(A.foamG);
    const ff = this._filt('bandpass', 1500, 0.5);
    this._loop('pink', this._chain(ff, fw));
    this._lfo(0.12, 0.45, fw.gain); this._lfo(0.05, 400, ff.frequency);
    // wind: band-passed pink noise, wandering cutoff, gusts, a faint whistle
    A.windG = this._gain(0); A.windG.connect(A.bus);
    A.windLp = this._filt('lowpass', 12000);
    const gust = this._gain(0.65); gust.connect(A.windLp); A.windLp.connect(A.windG);
    const wf = this._filt('bandpass', 520, 0.9);
    this._loop('pink', this._chain(wf, gust));
    this._lfo(0.06, 260, wf.frequency); this._lfo(0.17, 120, wf.frequency);
    this._lfo(0.07, 0.3, gust.gain); this._lfo(0.21, 0.12, gust.gain);
    A.whistleG = this._gain(0); A.whistleG.connect(A.windLp);
    const wh = this._filt('bandpass', 950, 9);
    this._loop('pink', this._chain(wh, A.whistleG));
    this._lfo(0.09, 220, wh.frequency); this._lfo(0.23, 90, wh.frequency);
    // rain: bright noise through a controllable lowpass (muffled indoors)
    A.rainG = this._gain(0); A.rainG.connect(A.bus);
    A.rainLp = this._filt('lowpass', 10000); A.rainLp.connect(A.rainG);
    this._loop('white', this._chain(this._filt('highpass', 1300), A.rainLp));
    const bodyG = this._gain(0.5); bodyG.connect(A.rainLp);
    this._loop('pink', this._chain(this._filt('bandpass', 3800, 0.4), bodyG));
    // fire: soft roar + hiss (pops are scheduled in setAmbience)
    A.fireG = this._gain(0); A.fireG.connect(A.bus);
    this._loop('brown', this._chain(this._filt('lowpass', 800), A.fireG));
    A.fireHiss = this._gain(0); A.fireHiss.connect(A.bus);
    this._loop('white', this._chain(this._filt('highpass', 5500), A.fireHiss));
    // night insects: pulsed high sine "crickets" + AM-noise "cicada"
    A.insG = this._gain(0); A.insG.connect(A.bus);
    const cricket = (f, pulse, gate, level) => {
      const o = c.createOscillator(), amp = this._gain(0.5), gt = this._gain(0.5), lv = this._gain(level);
      o.frequency.value = f; o.connect(amp); amp.connect(gt); gt.connect(lv); lv.connect(A.insG);
      this._lfo(pulse, 0.5, amp.gain); this._lfo(gate, 0.5, gt.gain); o.start();
    };
    cricket(4300, 15, 1.3, 0.5); cricket(3850, 17.5, 0.9, 0.4); cricket(5100, 13, 0.6, 0.25);
    const cic = this._gain(0.5), cl = this._gain(0.25); cic.connect(cl); cl.connect(A.insG);
    this._loop('white', this._chain(this._filt('bandpass', 7200, 8), cic));
    this._lfo(48, 0.5, cic.gain); this._lfo(0.22, 0.12, cl.gain);
    // underwater low hum
    A.deepG = this._gain(0); A.deepG.connect(A.bus);
    this._loop('brown', this._chain(this._filt('lowpass', 160), A.deepG));
  }
  // connect a -> b -> ... returns the first node so it can be fed into _loop
  _chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[0]; }

  setAmbience(env = {}) {
    if (!this._prep()) return;
    try {
      if (!this.A) this._initAmbience();
      this.ambOn = true; this._lastEnv = env;
      const A = this.A, c = this.ctx, t = c.currentTime;
      const set = (p, v, tc = 0.35) => p.setTargetAtTime(v, t, tc);
      const rain = clamp(env.rain), wind = clamp(env.wind), storm = clamp(env.storm), night = clamp(env.night);
      const shore = clamp(env.shore), jungle = clamp(env.jungle), indoor = clamp(env.indoor), fire = clamp(env.fire);
      const uw = env.underwater ? 1 : 0;
      // surf
      const surf = shore * (0.3 + 0.55 * wind + 0.7 * storm) * (1 - 0.5 * indoor) * 0.8;
      set(A.surfG.gain, surf, 0.8); set(A.foamG.gain, surf * 0.35, 0.8);
      // wind (muffled indoors)
      const w = clamp(wind * 0.5 + storm * 0.5) * (1 - 0.6 * indoor);
      set(A.windG.gain, w * 0.7); set(A.windLp.frequency, lerp(12000, 500, indoor), 0.2);
      set(A.whistleG.gain, w * w * 0.1);
      // rain
      set(A.rainG.gain, clamp(rain * 0.5 + storm * 0.08) * (1 - 0.3 * indoor), 0.4);
      set(A.rainLp.frequency, lerp(10000, 1200, indoor), 0.2);
      // fire, insects, underwater
      set(A.fireG.gain, fire * 0.55); set(A.fireHiss.gain, fire * 0.04);
      set(A.insG.gain, night * (1 - 0.85 * rain) * (1 - 0.85 * indoor) * (0.4 + 0.6 * jungle) * 0.1, 0.8);
      set(A.deepG.gain, uw * 0.5, 0.2);
      set(A.uw.frequency, uw ? 380 : 22000, 0.08); set(A.bus.gain, uw ? 0.8 : 1, 0.1);
      // scheduled random events (pops, patter, chirps), rate-corrected to ~10 calls/s
      const k = clamp((t - this._lt) * 10, 0.2, 3); this._lt = t;
      const ev = (fn, vol, pan) => { const v = new Voice(this, A.bus, { volume: vol, pan }); fn(v); v.done(); };
      if (fire > 0.02 && Math.random() < fire * 0.35 * k) {
        ev((v) => {
          v.n(0, rnd(0.015, 0.05), { type: 'bandpass', f: rnd(1500, 6000), q: 2, vol: rnd(0.2, 0.8) });
          if (Math.random() < 0.3) v.o(0, 0.03, { f: rnd(900, 1800), vol: 0.1 });
        }, 0.5, rnd(-0.4, 0.4));
      }
      if (rain * indoor > 0.05 && Math.random() < rain * indoor * 1.3 * k) {
        ev((v) => { for (let i = 0; i < 3; i++) v.n(i * rnd(0.01, 0.05), 0.02, { f: rnd(1800, 4500), q: 2, vol: rnd(0.1, 0.4) }); }, 0.45, rnd(-0.6, 0.6));
      }
      const birds = (1 - night) * jungle * (1 - 0.8 * rain) * (1 - 0.6 * storm) * (1 - 0.5 * indoor);
      if (birds > 0.05 && t > this._next.bird) {
        this._next.bird = t + rnd(1.2, 4.5) / (0.35 + birds);
        ev(SOUNDS.bird_call, 0.3 + 0.4 * birds, rnd(-0.8, 0.8));
      }
      const frogs = night * jungle * (1 - 0.5 * rain) * (1 - indoor * 0.5);
      if (frogs > 0.1 && t > this._next.frog) {
        this._next.frog = t + rnd(2.5, 8) / (0.3 + frogs);
        ev(SOUNDS.frog, 0.2 + 0.3 * frogs, rnd(-0.8, 0.8));
      }
      const gulls = (1 - night) * shore * (1 - rain) * (1 - 0.5 * indoor);
      if (gulls > 0.3 && t > this._next.gull) {
        this._next.gull = t + rnd(8, 22);
        ev(SOUNDS.seagull, 0.25 + 0.2 * gulls, rnd(-0.8, 0.8));
      }
    } catch (e) { if (this.strict) throw e; }
  }

  stopAmbience() {
    if (!this.A || !this.ctx) return;
    const t = this.ctx.currentTime, A = this.A;
    for (const g of [A.surfG, A.foamG, A.windG, A.whistleG, A.rainG, A.fireG, A.fireHiss, A.insG, A.deepG]) g.gain.setTargetAtTime(0, t, 0.4);
    A.uw.frequency.setTargetAtTime(22000, t, 0.1);
    this.ambOn = false;
  }
}
