// Microphone: opened once when the learner presses Start and kept open for the whole session.
// An AudioWorklet downsamples to 16 kHz PCM16 (what Gemini Live expects) in ~100 ms chunks.
// The game gates sending: while an NPC talks, chunks are dropped (no echo into the judge).
import { bytesToBase64 } from '../talk/live.js';

const WORKLET = `
class Down16k extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.acc = 0; this.out = new Int16Array(1600); this.n = 0; this.sum = 0; this.cnt = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      this.sum += v * v; this.cnt++;
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const s = Math.max(-1, Math.min(1, v));
        this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.n === this.out.length) {
          this.port.postMessage({ pcm: this.out.buffer.slice(0), rms: Math.sqrt(this.sum / this.cnt) });
          this.n = 0; this.sum = 0; this.cnt = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('down16k', Down16k);
`;

export class Mic {
  constructor(sound) {
    this.sound = sound;
    this.stream = null;
    this.sending = false;
    this.level = 0;
    this.onChunk = null; // (base64) => void
    this.state = 'off'; // off | on | denied | unsupported
  }

  async start() {
    if (this.stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) { this.state = 'unsupported'; return false; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      this.state = e?.name === 'NotAllowedError' ? 'denied' : 'unsupported';
      return false;
    }
    const ctx = await this.sound.unlock();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    const src = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'down16k');
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(this.node).connect(mute).connect(ctx.destination); // keep the graph pulling
    this.node.port.onmessage = (e) => {
      const { pcm, rms } = e.data;
      this.level += (Math.min(1, rms * 9) - this.level) * 0.5;
      if (this.sending && this.onChunk) this.onChunk(bytesToBase64(new Uint8Array(pcm)));
    };
    this.state = 'on';
    return true;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.state = 'off';
    this.sending = false;
  }
}

/** Browser speech recognition (Chrome desktop) for practice without an API key. Optional. */
export function makeRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'ja-JP';
  r.interimResults = true;
  r.continuous = false;
  return r;
}
