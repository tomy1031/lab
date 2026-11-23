// js/audio.js — every sound is synthesised (no files): the "pock" of the strings (brighter and louder for a
// clean hit, dull for a frame shot), bounces that depend on the surface, the net, the crowd's murmur and
// applause, and the umpire's calls through the browser's speech synthesis. Sounds come from where the ball is.
import * as THREE from 'three';

export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.listener = null;
  }
  /** must be called from a user gesture */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.settings.get('volume');
    this.master.connect(c.destination);
    this.settings.onChange((k, v) => { if (k === 'volume' && this.master) this.master.gain.value = v; if (k === 'crowd') this.crowdOn(v); });
    // noise buffer
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // crowd murmur: band-passed noise, slowly modulated
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0;
    src.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master);
    src.start();
    this.crowdOn(this.settings.get('crowd'));
  }
  crowdOn(on) { if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.5); }

  /** keep the listener on the head */
  setListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    camera.getWorldPosition(p); camera.getWorldQuaternion(q);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q), u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(u.x, t); l.upY.setValueAtTime(u.y, t); l.upZ.setValueAtTime(u.z, t);
    } else if (l.setPosition) { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }

  panner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 0.9;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    p.connect(this.master);
    return p;
  }

  /** the strings: k = 0…1 strength, clean = 0…1 sweet spot, frame = a frame shot */
  hit(x, y, z, k, clean = 1, frame = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const out = this.panner(x, y, z);
    const g = c.createGain();
    const vol = Math.min(1.4, 0.35 + k * 1.0);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + (frame ? 0.09 : 0.06));
    g.connect(out);
    // the tonal "pock"
    const o = c.createOscillator();
    o.type = 'sine';
    const f0 = frame ? 520 : 820 + 520 * clean;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.05);
    o.connect(g); o.start(t); o.stop(t + 0.1);
    // the crack
    const n = c.createBufferSource(); n.buffer = this.noise;
    const hp = c.createBiquadFilter(); hp.type = frame ? 'lowpass' : 'bandpass'; hp.frequency.value = frame ? 900 : 2600; hp.Q.value = 0.9;
    const ng = c.createGain(); ng.gain.setValueAtTime(vol * 0.8, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    n.connect(hp); hp.connect(ng); ng.connect(out);
    n.start(t, Math.random()); n.stop(t + 0.05);
    if (frame) {
      const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 190;
      const g2 = c.createGain(); g2.gain.setValueAtTime(0.4, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o2.connect(g2); g2.connect(out); o2.start(t); o2.stop(t + 0.13);
    }
  }
  bounce(x, z, vy, surface) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const k = Math.min(1, Math.abs(vy || 4) / 12);
    if (k < 0.04) return;
    const out = this.panner(x, 0.05, z);
    const g = c.createGain();
    const soft = surface === 'clay' ? 0.6 : surface === 'grass' ? 0.45 : 1;
    g.gain.setValueAtTime(0.15 + 0.7 * k * soft, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    g.connect(out);
    const o = c.createOscillator(); o.type = 'sine';
    const f = surface === 'hard' ? 420 : surface === 'clay' ? 300 : 260;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.04);
    o.connect(g); o.start(t); o.stop(t + 0.06);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = surface === 'hard' ? 1800 : 900;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.3 * k * soft, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    n.connect(lp); lp.connect(ng); ng.connect(out); n.start(t, Math.random()); n.stop(t + 0.05);
  }
  net(x, y, cord) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const out = this.panner(x, y, 0);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cord ? 1400 : 500;
    const g = c.createGain(); g.gain.setValueAtTime(cord ? 0.6 : 0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + (cord ? 0.08 : 0.25));
    n.connect(lp); lp.connect(g); g.connect(out); n.start(t, Math.random()); n.stop(t + 0.3);
  }
  /** applause: a burst of many claps, k = 0…1 */
  applause(k = 0.6) {
    if (!this.ctx || !this.settings.get('crowd')) return;
    const c = this.ctx, t0 = c.currentTime;
    const dur = 1.2 + k * 2.2;
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.22 * k, t0 + 0.15);
    g.gain.setValueAtTime(0.22 * k, t0 + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    // clap texture: amplitude modulation
    const am = c.createGain(); am.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 23;
    const lg = c.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain);
    n.connect(bp); bp.connect(am); am.connect(g); g.connect(this.master);
    n.start(t0); n.stop(t0 + dur + 0.1); lfo.start(t0); lfo.stop(t0 + dur + 0.1);
  }
  /** a short "oh" from the crowd (a close call, a net cord) */
  ooh() {
    if (!this.ctx || !this.settings.get('crowd')) return;
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(380, t); bp.frequency.linearRampToValueAtTime(300, t + 0.8); bp.Q.value = 3;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    n.connect(bp); bp.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 1);
  }
  /** umpire's call (English), if the browser can speak */
  say(text) {
    if (!text || !this.settings.get('umpire') || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB'; u.rate = 0.95; u.pitch = 0.95; u.volume = Math.min(1, this.settings.get('volume') + 0.1);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* no voices */ }
  }
}
