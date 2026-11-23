// audio/engine.js — the shared AudioContext and mixing buses (master → sfx / ambience / voice / ui).
// Created lazily; must be unlocked from a user gesture (a click or key press).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = new URLSearchParams(location.search).has('nosound');
    this.volume = { master: 0.9, sfx: 0.8, amb: 0.6, voice: 1, ui: 0.5 };
  }

  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume.master;
      this.master.connect(c.destination);
      for (const k of ['sfx', 'amb', 'voice', 'ui']) {
        this[k] = c.createGain();
        this[k].gain.value = this.volume[k];
        this[k].connect(this.master);
      }
    }
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch { /* ignore */ } }
    return this.ctx;
  }

  setVolume(bus, v) {
    this.volume[bus] = v;
    const node = bus === 'master' ? this.master : this[bus];
    if (node) node.gain.value = bus === 'master' && this.muted ? 0 : v;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
}
