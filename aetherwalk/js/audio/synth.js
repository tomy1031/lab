// js/audio/synth.js — small WebAudio building blocks: noise, envelopes, tones, bells, a pooled panner (§9) (OPUS-B)
export const PENTA = [0, 2, 4, 7, 9];                 // major pentatonic steps
export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
export const pentaNote = (root, i) => root + PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);

export function createSynth(ac, out) {
  const noise = makeNoise(ac, 2, 'white');
  const pink = makeNoise(ac, 4, 'pink');
  const brown = makeNoise(ac, 4, 'brown');
  let voices = 0;
  const MAX_VOICES = 24;

  const S = {
    ac, noise, pink, brown,
    get voices() { return voices; },
    /** reserve a voice (false when 24 are already sounding) */
    take(dur) {
      if (voices >= MAX_VOICES) return false;
      voices++;
      setTimeout(() => { voices = Math.max(0, voices - 1); }, Math.max(30, dur * 1000 + 50));
      return true;
    },
    /** gain node with an attack/decay envelope starting at time t */
    env(t, attack, decay, peak, dest) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + Math.max(0.002, attack));
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + Math.max(0.01, decay));
      g.connect(dest);
      return g;
    },
    tone(freq, { type = 'sine', t = ac.currentTime, attack = 0.005, decay = 0.3, gain = 0.3, dest = out, glideTo = 0, glideTime = 0.1, detune = 0 } = {}) {
      if (!S.take(attack + decay)) return null;
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + glideTime);
      if (detune) o.detune.value = detune;
      const g = S.env(t, attack, decay, gain, dest);
      o.connect(g);
      o.start(t);
      o.stop(t + attack + decay + 0.05);
      return o;
    },
    burst({ t = ac.currentTime, dur = 0.12, type = 'bandpass', freq = 1200, q = 1, gain = 0.3, dest = out, attack = 0.003, buf = noise, sweepTo = 0, rate = 1 } = {}) {
      if (!S.take(dur + attack)) return null;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
      const g = S.env(t, attack, dur, gain, dest);
      src.connect(f); f.connect(g);
      const off = Math.random() * (buf.duration - dur - 0.1);
      src.start(t, Math.max(0, off), dur + attack + 0.05);
      return src;
    },
    /** inharmonic bell (wind chimes, tower bell, the waybell) */
    bell(freq, { t = ac.currentTime, decay = 1.6, gain = 0.2, dest = out, partials = [1, 2.0, 2.76, 5.4], amps = [1, 0.5, 0.35, 0.15] } = {}) {
      if (!S.take(decay)) return;
      const g = ac.createGain();
      g.gain.value = 1; g.connect(dest);
      for (let i = 0; i < partials.length; i++) {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * partials[i];
        const e = S.envRaw(t, 0.004, decay / (1 + i * 0.6), gain * amps[i], g);
        o.connect(e); o.start(t); o.stop(t + decay + 0.1);
      }
    },
    envRaw(t, attack, decay, peak, dest) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      g.connect(dest);
      return g;
    },
    /** harp-ish pluck */
    pluck(freq, { t = ac.currentTime, decay = 0.9, gain = 0.18, dest = out } = {}) {
      if (!S.take(decay)) return;
      const o = ac.createOscillator(), o2 = ac.createOscillator();
      o.type = 'triangle'; o2.type = 'sine';
      o.frequency.value = freq; o2.frequency.value = freq * 2.003;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 8, t); f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + decay);
      const g = S.envRaw(t, 0.003, decay, gain, dest);
      const g2 = ac.createGain(); g2.gain.value = 0.3;
      o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g);
      o.start(t); o2.start(t); o.stop(t + decay + 0.05); o2.stop(t + decay + 0.05);
    },
    /** a looping filtered-noise bed: { gain, filter, src } (always running; gain decides) */
    bed(buf, type, freq, q, dest) {
      const src = ac.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(0, Math.random() * buf.duration);
      return { src, filter: f, gain: g };
    },
  };
  return S;
}

function makeNoise(ac, seconds, kind) {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.6;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09; b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
  }
  // fade the loop seam
  const fadeN = Math.min(2000, n >> 4);
  for (let i = 0; i < fadeN; i++) { const k = i / fadeN; d[i] *= k; d[n - 1 - i] *= k; }
  return buf;
}

/** a pool of equal-power panners (HRTF is too heavy on Quest) */
export function createPannerPool(ac, dest, n = 8) {
  const pool = [];
  for (let i = 0; i < n; i++) {
    const p = ac.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 2; p.maxDistance = 80; p.rolloffFactor = 1.1;
    p.connect(dest);
    pool.push({ p, busyUntil: 0 });
  }
  let rr = 0;
  return {
    /** a panner placed at pos, free after `dur` seconds (steals the oldest when all are busy) */
    at(pos, dur) {
      const now = ac.currentTime;
      let best = null;
      for (const e of pool) if (e.busyUntil <= now) { best = e; break; }
      if (!best) { best = pool[rr]; rr = (rr + 1) % pool.length; }
      best.busyUntil = now + dur;
      setPos(best.p, pos.x, pos.y, pos.z);
      return best.p;
    },
  };
}
export function setPos(node, x, y, z) {
  if (node.positionX) { node.positionX.value = x; node.positionY.value = y; node.positionZ.value = z; }
  else if (node.setPosition) node.setPosition(x, y, z);
}
