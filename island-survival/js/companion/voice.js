// companion/voice.js — plays the companion's Gemini Live audio (PCM16 24 kHz chunks) positioned at the
// avatar's head, and measures the level for lip sync. Also a fallback "mumble" voice for offline lines
// (short synthesized syllables so text bubbles still feel spoken).
import * as THREE from 'three';
import { pcm16Base64ToFloat } from './live.js';

export class Voice {
  constructor(audio) {
    this.audio = audio;
    this.level = 0;
    this.streamEnd = 0;
    this.sources = new Set();
    this.ready = false;
  }

  init() {
    const c = this.audio.ctx;
    if (!c || this.ready) return;
    this.panner = c.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1.5;
    this.panner.rolloffFactor = 0.5;
    this.input = c.createGain();
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 512;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.input.connect(this.analyser);
    this.input.connect(this.panner);
    this.panner.connect(this.audio.voice);
    this.ready = true;
  }

  /** where the voice comes from (avatar head) and where the listener is (camera) */
  update(headPos, camera) {
    if (!this.ready) return;
    const c = this.audio.ctx, t = c.currentTime;
    if (headPos) {
      if (this.panner.positionX) {
        this.panner.positionX.setTargetAtTime(headPos.x, t, 0.03); this.panner.positionY.setTargetAtTime(headPos.y, t, 0.03); this.panner.positionZ.setTargetAtTime(headPos.z, t, 0.03);
      } else this.panner.setPosition(headPos.x, headPos.y, headPos.z);
    }
    if (camera) {
      const l = c.listener, p = camera.position;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      if (l.positionX) {
        l.positionX.setTargetAtTime(p.x, t, 0.03); l.positionY.setTargetAtTime(p.y, t, 0.03); l.positionZ.setTargetAtTime(p.z, t, 0.03);
        l.forwardX.setTargetAtTime(f.x, t, 0.03); l.forwardY.setTargetAtTime(f.y, t, 0.03); l.forwardZ.setTargetAtTime(f.z, t, 0.03);
        l.upX.setTargetAtTime(u.x, t, 0.03); l.upY.setTargetAtTime(u.y, t, 0.03); l.upZ.setTargetAtTime(u.z, t, 0.03);
      } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    }
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const target = Math.min(1, Math.sqrt(sum / this.buf.length) * 7);
    this.level += (target - this.level) * (target > this.level ? 0.6 : 0.25);
  }

  get speaking() { return this.ready && (this.level > 0.04 || this.audio.ctx.currentTime < this.streamEnd); }

  /** queue a Live audio chunk (base64 PCM16 @ 24 kHz) */
  pushPcm(b64) {
    this.init();
    if (!this.ready) return;
    const c = this.audio.ctx;
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
    this.sources.add(s);
    s.onended = () => this.sources.delete(s);
  }

  /** stop what is playing (the player interrupted) */
  stop() {
    for (const s of this.sources) { try { s.stop(); } catch { /* ignore */ } }
    this.sources.clear();
    this.streamEnd = 0;
  }

  /** offline: little synthesized syllables for a line of text (pitch = character's voice) */
  mumble(text, pitch = 1) {
    this.init();
    if (!this.ready) return 0;
    const c = this.audio.ctx;
    const chars = [...text.replace(/[\s、。！？!?…「」]/g, '')];
    const n = Math.min(26, Math.ceil(chars.length / 1.6));
    let t = Math.max(c.currentTime + 0.03, this.streamEnd);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'triangle';
      const base = 210 * pitch * (1 + ((chars[i * 1.6 | 0]?.charCodeAt(0) || 0) % 7) * 0.035);
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 0.92, t + 0.09);
      f.type = 'bandpass'; f.frequency.value = 1200 * pitch; f.Q.value = 1.2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(f).connect(g).connect(this.input);
      o.start(t); o.stop(t + 0.12);
      t += 0.085 + (i % 3 === 2 ? 0.04 : 0);
    }
    this.streamEnd = t;
    return t - c.currentTime;
  }
}
