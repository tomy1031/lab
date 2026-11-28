// js/audio.js — every sound is synthesised (no files) and comes from where it happens (HRTF), in a hall
// (a generated reverb). The paddle: a short "pok" whose pitch, brightness and length depend on how hard and how
// cleanly the ball was hit and on the rubber (a dull "tok" for long pips; a wooden "tick" off the edge, which
// rings longer). The table: the hollow shell's click over the table top's low knock. The net, the floor's
// patter, the barriers. The umpire calls the score through the browser's speech synthesis.
import * as THREE from 'three';

export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
  }
  /** must be called from a user gesture */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.settings.get('volume');
    this.master.connect(c.destination);
    // the hall: a short synthetic reverb (1.3 s), sent from every source
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(1.3, 2.6);
    this.verbIn = c.createGain();
    this.verbIn.gain.value = 0.22;
    this.verbIn.connect(this.verb);
    this.verb.connect(this.master);
    this.dry = c.createGain();
    this.dry.connect(this.master);
    this.settings.onChange((k, v) => { if (k === 'volume' && this.master) this.master.gain.value = v; if (k === 'crowd') this.crowdOn(v); });
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the hall's air (ventilation) and a quiet crowd
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    this.room = c.createGain(); this.room.gain.value = 0.02;
    src.connect(lp); lp.connect(this.room); this.room.connect(this.master);
    const src2 = c.createBufferSource(); src2.buffer = this.noise; src2.loop = true; src2.playbackRate.value = 0.7;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
    this.crowd = c.createGain(); this.crowd.gain.value = 0;
    src2.connect(bp); bp.connect(this.crowd); this.crowd.connect(this.master);
    src.start(); src2.start();
    this.crowdOn(this.settings.get('crowd'));
  }
  impulse(secs, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * secs);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;           // darker tail
        d[i] = lp * Math.pow(1 - t, decay) * (i < 300 ? i / 300 : 1);
      }
    }
    return b;
  }
  crowdOn(on) { if (this.crowd) this.crowd.gain.setTargetAtTime(on ? 0.018 : 0, this.ctx.currentTime, 0.6); }

  setListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    camera.getWorldPosition(p); camera.getWorldQuaternion(q);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q), u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(u.x, t); l.upY.setValueAtTime(u.y, t); l.upZ.setValueAtTime(u.z, t);
    } else if (l.setPosition) { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }
  /** a source at (x,y,z): returns its input node */
  at(x, y, z, wet = 1) {
    const c = this.ctx;
    const p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 0.8; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    p.connect(this.dry);
    const s = c.createGain(); s.gain.value = wet;
    p.connect(s); s.connect(this.verbIn);
    return p;
  }
  // a decaying sine "mode"
  mode(out, t, f, amp, decay, glide = 1) {
    if (!(amp > 1e-3)) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    if (glide !== 1) o.frequency.exponentialRampToValueAtTime(f * glide, t + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + decay + 0.02);
  }
  // a filtered noise click
  click(out, t, f, q, amp, dur, type = 'bandpass') {
    if (!(amp > 1e-3)) return;
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise;
    n.playbackRate.value = 1;
    const bp = c.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(out);
    n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.01);
  }

  /**
   * The paddle. k: 0…1 strength (impact speed), clean: 0…1 sweet spot, face: 'fh' | 'bh' | 'edge', rubber key.
   */
  paddle(x, y, z, k, clean = 1, face = 'fh', rubber = 'inverted') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.002;
    const out = this.at(x, y, z, 0.9);
    const vol = Math.min(1.5, 0.25 + 1.2 * k);
    if (face === 'edge') {
      // the wooden edge: a hard, bright tick and a ringing knock
      this.click(out, t, 4200, 3, vol * 0.9, 0.025);
      this.mode(out, t, 1650, vol * 0.5, 0.09);
      this.mode(out, t, 2900, vol * 0.25, 0.06);
      return;
    }
    const pips = rubber === 'long' || rubber === 'anti';
    // the sponge softens the hit: harder hits sink deeper (a lower, fuller pok)
    const f0 = (pips ? 900 : 1350) - 260 * k + 220 * clean;
    this.mode(out, t, f0, vol * 0.8, 0.035 + 0.02 * (1 - clean), 0.82);
    this.mode(out, t, f0 * 2.3, vol * 0.25 * clean, 0.02);
    this.click(out, t, pips ? 2000 : 3300 + 900 * k, 1.4, vol * (pips ? 0.35 : 0.6), 0.012 + 0.006 * k);
    // an off-centre hit: the blade vibrates (a low hum)
    if (clean < 0.6) this.mode(out, t + 0.002, 340 + 120 * clean, vol * 0.35 * (1 - clean), 0.12);
  }
  /** the ball on the table top; vn: impact speed */
  table(x, y, z, vn) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.002;
    const out = this.at(x, y, z, 1);
    const k = Math.min(1, vn / 7);
    const vol = 0.18 + 0.9 * k;
    this.click(out, t, 5200, 2.2, vol * 0.7, 0.01);                // the celluloid/plastic shell
    this.mode(out, t, 2350 + 300 * k, vol * 0.45, 0.025, 0.9);    // the ball's "ping"
    this.mode(out, t, 210, vol * 0.5, 0.06);                      // the table top's knock
    this.mode(out, t, 470, vol * 0.2, 0.04);
  }
  net(x, y, z, strength, cord) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.002;
    const out = this.at(x, y, z, 0.8);
    const vol = 0.2 + 0.6 * Math.min(1, strength / 8);
    this.click(out, t, 900, 0.6, vol * 0.6, 0.07, 'lowpass');
    if (cord) { this.click(out, t, 3800, 3, vol * 0.5, 0.015); this.mode(out, t, 1900, vol * 0.25, 0.03); }
  }
  floor(x, y, z, vn) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.002;
    const out = this.at(x, y, z, 1);
    const k = Math.min(1, vn / 6);
    const vol = 0.08 + 0.7 * k;
    this.click(out, t, 3400, 1.8, vol * 0.6, 0.01);
    this.mode(out, t, 1500 + 400 * k, vol * 0.4, 0.03, 0.9);
    this.mode(out, t, 160, vol * 0.3, 0.05);
  }
  thud(x, y, z, vn) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.002;
    const out = this.at(x, y, z, 1);
    const vol = 0.1 + 0.4 * Math.min(1, vn / 6);
    this.mode(out, t, 140, vol, 0.08);
    this.click(out, t, 1200, 1, vol * 0.5, 0.02);
  }
  /** a few hands clapping */
  applause(n = 12) {
    if (!this.ctx || !this.settings.get('crowd')) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const out = this.at((Math.random() - 0.5) * 14, 2 + Math.random() * 3, (Math.random() - 0.5) * 16, 0.6);
      for (let j = 0; j < 6; j++) this.click(out, t0 + j * (0.11 + Math.random() * 0.05) + Math.random() * 0.1, 1800 + Math.random() * 900, 0.8, 0.12, 0.02);
    }
  }
  /** soft UI tick */
  ui() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.mode(this.dry, t, 1400, 0.12, 0.05);
  }
  say(text) {
    if (!this.settings.get('voice') || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 1.0; u.pitch = 0.95; u.volume = Math.min(1, this.settings.get('volume') * 1.2);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* no voice */ }
  }
}
