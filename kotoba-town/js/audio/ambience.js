// Procedural ambience for each place (no audio files): room tone, crowd murmur, rain, birds,
// station chimes, café clinks, a soft original tune in the town square …
const LAYERS = {
  hub: ['birds', 'breeze', 'tune'],
  office: ['room', 'hvac', 'keys'],
  classroom: ['room', 'clock'],
  apartment: ['traffic', 'breeze', 'birds'],
  depato: ['murmur', 'pad', 'room'],
  museum: ['room', 'steps'],
  station: ['murmur', 'trains', 'chime'],
  cafe: ['murmur', 'cups', 'pad'],
  park: ['birds', 'breeze', 'murmurFar'],
  home: ['room', 'clock'],
  konbini: ['hum', 'fridge', 'door'],
};

export class Ambience {
  constructor(sound) { this.sound = sound; this.nodes = []; this.timers = []; }

  noise(kind = 'pink', seconds = 4) {
    const c = this.sound.ctx;
    const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0; let b1 = 0; let b2 = 0; let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.6; }
    }
    return b;
  }

  loop(buffer, gain, filters = []) {
    const c = this.sound.ctx;
    const s = c.createBufferSource(); s.buffer = buffer; s.loop = true;
    const g = c.createGain(); g.gain.value = gain;
    let n = s;
    for (const f of filters) { n.connect(f); n = f; }
    n.connect(g).connect(this.sound.ambBus);
    s.start();
    this.nodes.push(s, g, ...filters);
    return g;
  }

  filter(type, freq, q = 0.7) { const f = this.sound.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }

  every(minS, maxS, fn) {
    const go = () => { this.timers.push(setTimeout(() => { if (this.on) { fn(); go(); } }, (minS + Math.random() * (maxS - minS)) * 1000)); };
    go();
  }

  tone(freq, dur, gain = 0.05, type = 'sine', when = 0, glide = 0) {
    const c = this.sound.ctx; const t = c.currentTime + when;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sound.ambBus); o.start(t); o.stop(t + dur + 0.05);
  }

  clickNoise(gain = 0.05, freq = 3000, dur = 0.03) {
    const c = this.sound.ctx; const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.white || (this.white = this.noise('white', 1));
    const f = this.filter('bandpass', freq, 2); const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sound.ambBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  start(scene, { weather = 'clear', time = 'noon', music = true } = {}) {
    this.stop();
    if (!this.sound.ctx) return;
    this.on = true;
    const L = new Set(LAYERS[scene] || ['room']);
    if (!music) L.delete('tune');
    if (weather === 'rain') L.add('rain');
    const pink = this.noise('pink'); const brown = this.noise('brown');
    if (L.has('room')) this.loop(brown, 0.05, [this.filter('lowpass', 260)]);
    if (L.has('hvac')) this.loop(pink, 0.025, [this.filter('lowpass', 500)]);
    if (L.has('hum')) this.loop(brown, 0.05, [this.filter('lowpass', 200)]);
    if (L.has('fridge')) this.loop(pink, 0.03, [this.filter('bandpass', 120, 3)]);
    if (L.has('traffic')) this.loop(brown, 0.12, [this.filter('lowpass', 380)]);
    if (L.has('breeze')) { const g = this.loop(pink, 0.03, [this.filter('bandpass', 700, 0.5)]); this.every(3, 7, () => { const t = this.sound.ctx.currentTime; g.gain.setTargetAtTime(0.015 + Math.random() * 0.05, t, 1.5); }); }
    if (L.has('murmur') || L.has('murmurFar')) {
      const far = !L.has('murmur');
      const g = this.loop(pink, far ? 0.02 : 0.06, [this.filter('bandpass', 520, 0.9), this.filter('lowpass', 1400)]);
      this.every(0.6, 1.8, () => { const t = this.sound.ctx.currentTime; g.gain.setTargetAtTime((far ? 0.012 : 0.04) + Math.random() * (far ? 0.02 : 0.05), t, 0.3); });
    }
    if (L.has('rain')) {
      this.loop(this.noise('white', 3), 0.07, [this.filter('highpass', 900), this.filter('lowpass', 7000)]);
      this.every(0.05, 0.25, () => this.clickNoise(0.02 + Math.random() * 0.03, 2500 + Math.random() * 3000, 0.02));
    }
    if (L.has('birds')) {
      const night = time === 'night';
      if (!night) this.every(1.5, 5, () => {
        const f = 2400 + Math.random() * 1800; const n = 1 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone(f * (1 + Math.random() * 0.1), 0.09, 0.025, 'sine', i * 0.13, 1.25);
      });
      else this.every(2, 4, () => { for (let i = 0; i < 6; i++) this.tone(4200, 0.03, 0.01, 'sine', i * 0.05); }); // crickets
    }
    if (L.has('clock')) this.every(1, 1, () => this.clickNoise(0.012, 2200, 0.02));
    if (L.has('keys')) this.every(2, 9, () => { const n = 3 + Math.floor(Math.random() * 10); for (let i = 0; i < n; i++) setTimeout(() => this.clickNoise(0.012, 1800 + Math.random() * 800, 0.025), i * (70 + Math.random() * 80)); });
    if (L.has('cups')) this.every(4, 12, () => { this.tone(2600 + Math.random() * 600, 0.25, 0.02, 'sine'); this.tone(3900, 0.18, 0.01, 'sine', 0.02); });
    if (L.has('steps')) this.every(5, 14, () => { for (let i = 0; i < 4; i++) setTimeout(() => this.clickNoise(0.015, 900, 0.06), i * 520); });
    if (L.has('door')) this.every(18, 40, () => { this.tone(880, 0.6, 0.03, 'sine'); this.tone(698, 0.9, 0.03, 'sine', 0.35); });
    if (L.has('chime')) this.every(14, 30, () => { [784, 659, 523, 659].forEach((f, i) => this.tone(f, 0.7, 0.03, 'sine', i * 0.32)); });
    if (L.has('trains')) this.every(20, 45, () => {
      const c = this.sound.ctx; const t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = brown; const f = this.filter('lowpass', 220); const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 4); g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
      s.connect(f).connect(g).connect(this.sound.ambBus); s.start(t); s.stop(t + 9.2);
    });
    if (L.has('pad')) this.pad([[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]], 0.012, 4.2);
    if (L.has('tune')) this.tune();
  }

  /** Soft chord pad (shop/café background music feel). */
  pad(chords, gain, beat) {
    let i = 0;
    const play = () => { for (const f of chords[i % chords.length]) this.tone(f, beat * 1.1, gain, 'triangle'); i++; };
    play();
    this.every(beat, beat, play);
  }

  /** Original little town-square tune: plucky pentatonic melody over a gentle bass. */
  tune() {
    const mel = [0, 2, 4, 7, 9, 7, 4, 2, 4, 7, 9, 12, 9, 7, 4, 2];
    const root = [261.6, 220, 174.6, 196];
    let step = 0;
    const tick = () => {
      if (!this.on) return;
      const bar = Math.floor(step / 8) % 4;
      if (step % 8 === 0) this.tone(root[bar] / 2, 1.6, 0.025, 'triangle');
      if (Math.random() > 0.25) { const n = mel[(step + bar * 3) % mel.length]; this.tone(523.25 * 2 ** (n / 12), 0.35, 0.018, 'sine'); }
      step++;
      this.timers.push(setTimeout(tick, 300));
    };
    tick();
  }

  stop() {
    this.on = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const n of this.nodes) { try { n.stop?.(); } catch { /* */ } try { n.disconnect(); } catch { /* */ } }
    this.nodes = [];
  }
}
