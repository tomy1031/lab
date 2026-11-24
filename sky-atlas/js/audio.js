// js/audio.js — sound made on the spot (no files): wind that rises with your speed, the balloon's burner
// and the jet's roar (filtered noise), and the glider's variometer (beeps that quicken and rise as you climb).
export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.t = 0;
  }
  // call from a click / tap (browsers only let a page start sound after one)
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15; }
      const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);
      // wind
      this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 400; this.windF.Q.value = 0.7;
      this.windG = ctx.createGain(); this.windG.gain.value = 0;
      noise().connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
      // burner / jet
      this.fireF = ctx.createBiquadFilter(); this.fireF.type = 'lowpass'; this.fireF.frequency.value = 700;
      this.fireG = ctx.createGain(); this.fireG.gain.value = 0;
      noise().connect(this.fireF); this.fireF.connect(this.fireG); this.fireG.connect(this.master);
      // variometer
      this.vario = ctx.createOscillator(); this.vario.type = 'triangle'; this.vario.frequency.value = 600;
      this.varioG = ctx.createGain(); this.varioG.gain.value = 0;
      this.vario.connect(this.varioG); this.varioG.connect(this.master); this.vario.start();
    } catch { this.ctx = null; }
  }
  // s = { speed (m/s), fire (0..1), fireTone ('burner' | 'jet'), vario (bool), climb (m/s) }
  update(dt, s) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, on = this.on ? 1 : 0;
    const k = 0.08;
    this.windG.gain.setTargetAtTime(on * Math.min(0.28, (s.speed / 260) * 0.28), now, k);
    this.windF.frequency.setTargetAtTime(280 + Math.min(s.speed, 300) * 3.2, now, k);
    this.fireG.gain.setTargetAtTime(on * (s.fire || 0) * (s.fireTone === 'jet' ? 0.32 : 0.4), now, 0.05);
    this.fireF.frequency.setTargetAtTime(s.fireTone === 'jet' ? 1600 : 650, now, 0.1);
    // vario: beeps while climbing (faster and higher the faster you climb), a low tone in strong sink
    let g = 0, fq = 600;
    if (s.vario) {
      this.t += dt;
      const c = s.climb || 0;
      if (c > 0.15) {
        fq = 560 + Math.min(c, 6) * 110;
        const period = Math.max(0.16, 0.55 - c * 0.07);
        g = (this.t % period) / period < 0.55 ? 0.09 : 0;
      } else if (c < -2.5) { fq = 230; g = 0.035; }
    }
    this.vario.frequency.setTargetAtTime(fq, now, 0.02);
    this.varioG.gain.setTargetAtTime(on * g, now, 0.012);
  }
}
