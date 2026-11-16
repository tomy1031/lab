// Audio: NPC voices placed in 3D (pre-generated mp3 and streamed Gemini Live PCM), lip-sync levels,
// UI sounds and the scene ambience bus.
import * as THREE from 'three';
import { pcm16Base64ToFloat } from '../talk/live.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.speakers = new Map(); // id → Speaker
    this.cache = new Map();
    this.rate = 1;
  }

  /** Must be called from a user gesture. */
  async unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.voiceBus = this.ctx.createGain();
      this.voiceBus.connect(this.master);
      this.ambBus = this.ctx.createGain();
      this.ambBus.gain.value = 0.55;
      this.ambBus.connect(this.master);
      this.uiBus = this.ctx.createGain();
      this.uiBus.gain.value = 0.5;
      this.uiBus.connect(this.master);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  /** Keep the Web Audio listener on the learner's head. */
  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
    camera.matrixWorld.decompose(p, q, s);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02); l.upY.setTargetAtTime(u.y, t, 0.02); l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  /** A voice source attached to an Object3D (an NPC's head, or the phone in the learner's hand). */
  speaker(id, object3d, { phone = false } = {}) {
    let s = this.speakers.get(id);
    if (!s) { s = new Speaker(this, object3d, phone); this.speakers.set(id, s); }
    s.object = object3d;
    s.setPhone(phone);
    return s;
  }

  clearSpeakers() {
    for (const s of this.speakers.values()) s.stop();
    this.speakers.clear();
  }

  update() { for (const s of this.speakers.values()) s.update(); }

  async load(url) {
    if (this.cache.has(url)) return this.cache.get(url);
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.blob(); }).then((b) => URL.createObjectURL(b));
    this.cache.set(url, p);
    p.catch(() => this.cache.delete(url));
    return p;
  }

  // ------------------------------------------------------------------ UI sfx
  blip(kind = 'pop') {
    if (!this.ctx) return;
    const c = this.ctx; const t = c.currentTime;
    const o = c.createOscillator(); const g = c.createGain();
    const spec = {
      pop: [660, 990, 0.09, 'sine'], open: [520, 880, 0.16, 'triangle'], close: [700, 420, 0.14, 'triangle'],
      good: [784, 1175, 0.22, 'sine'], soft: [440, 520, 0.12, 'sine'], hint: [880, 660, 0.14, 'sine'], listen: [990, 1320, 0.08, 'sine'],
    }[kind] || [660, 990, 0.09, 'sine'];
    o.type = spec[3];
    o.frequency.setValueAtTime(spec[0], t);
    o.frequency.exponentialRampToValueAtTime(spec[1], t + spec[2] * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec[2]);
    o.connect(g).connect(this.uiBus);
    o.start(t); o.stop(t + spec[2] + 0.02);
  }

  /** Little three-note fanfare for stars on the report. */
  fanfare(stars = 3) {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047].slice(0, stars + 1);
    notes.forEach((f, i) => setTimeout(() => {
      const c = this.ctx; const t = c.currentTime;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(this.uiBus); o.start(t); o.stop(t + 0.55);
    }, i * 140));
  }
}

/** One talking person: positional output, analyser for lip-sync, mp3 lines and Live PCM streaming. */
class Speaker {
  constructor(sound, object, phone) {
    this.sound = sound;
    this.object = object;
    const c = sound.ctx;
    this.panner = c.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1;
    this.panner.rolloffFactor = 0.6;
    this.out = c.createGain();
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 512;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.input = c.createGain();
    this.phoneFilter = c.createBiquadFilter();
    this.phoneFilter.type = 'bandpass';
    this.phoneFilter.frequency.value = 1700;
    this.phoneFilter.Q.value = 0.7;
    this.input.connect(this.analyser);
    this.level = 0;
    this.streamEnd = 0;
    this.streamSources = new Set();
    this.media = null;
    this.setPhone(phone);
  }

  setPhone(phone) {
    if (this.phone === phone) return;
    this.phone = phone;
    try { this.input.disconnect(); } catch { /* */ }
    try { this.phoneFilter.disconnect(); } catch { /* */ }
    try { this.panner.disconnect(); } catch { /* */ }
    this.input.connect(this.analyser);
    if (phone) { this.input.connect(this.phoneFilter); this.phoneFilter.connect(this.panner); }
    else this.input.connect(this.panner);
    this.panner.connect(this.sound.voiceBus);
  }

  update() {
    if (this.object) {
      const p = new THREE.Vector3();
      this.object.getWorldPosition(p);
      const t = this.sound.ctx.currentTime;
      if (this.panner.positionX) {
        this.panner.positionX.setTargetAtTime(p.x, t, 0.02);
        this.panner.positionY.setTargetAtTime(p.y, t, 0.02);
        this.panner.positionZ.setTargetAtTime(p.z, t, 0.02);
      } else this.panner.setPosition(p.x, p.y, p.z);
    }
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    const target = Math.min(1, rms * 7);
    this.level += (target - this.level) * (target > this.level ? 0.6 : 0.25);
  }

  get speaking() { return this.level > 0.04 || !!this.media || this.sound.ctx.currentTime < this.streamEnd; }

  /** Play a pre-generated line. Resolves when it ends (or is stopped). */
  async playUrl(url, rate = 1) {
    this.stop();
    const src = await this.sound.load(url);
    return new Promise((resolve, reject) => {
      const a = new Audio();
      a.src = src;
      a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true;
      a.playbackRate = rate;
      const node = this.sound.ctx.createMediaElementSource(a);
      node.connect(this.input);
      this.media = a;
      const done = () => { if (this.media === a) this.media = null; try { node.disconnect(); } catch { /* */ } resolve(); };
      a.onended = done;
      a.onerror = () => { if (this.media === a) this.media = null; reject(new Error('audio error')); };
      a._stop = done;
      a.play().catch((e) => { this.media = null; reject(e); });
    });
  }

  /** Queue a Gemini Live audio chunk (base64 PCM16 @24 kHz). */
  pushPcm(b64) {
    const c = this.sound.ctx;
    const f32 = pcm16Base64ToFloat(b64);
    if (!f32.length) return;
    const buffer = c.createBuffer(1, f32.length, 24000);
    buffer.copyToChannel(f32, 0);
    const s = c.createBufferSource();
    s.buffer = buffer;
    s.connect(this.input);
    const start = Math.max(c.currentTime + 0.05, this.streamEnd);
    s.start(start);
    this.streamEnd = start + buffer.duration;
    this.streamSources.add(s);
    s.onended = () => this.streamSources.delete(s);
  }

  /** Resolves when queued Live audio has finished playing. */
  streamDone() {
    const c = this.sound.ctx;
    return new Promise((resolve) => {
      const tick = () => (c.currentTime >= this.streamEnd ? resolve() : setTimeout(tick, 60));
      tick();
    });
  }

  stop() {
    if (this.media) { const a = this.media; this.media = null; try { a.pause(); } catch { /* */ } a._stop?.(); }
    for (const s of this.streamSources) { try { s.stop(); } catch { /* */ } }
    this.streamSources.clear();
    this.streamEnd = 0;
  }
}
