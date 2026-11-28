// quality.js — graphics presets, picked automatically per device (or by the player), plus a frame-rate
// watchdog that lowers the resolution when a phone can't keep up.
export const PRESETS = {
  high: { label: '高', pixelRatio: 1.75, shadows: true, shadowMap: 2048, antialias: true, density: 1, view: 1, lodK: 32, cardEvery: 1, minimapEvery: 3, visEvery: 1, kantoTex: 4096, globeTex: 4096, patch: 2048 },
  mid: { label: '中', pixelRatio: 1.25, shadows: true, shadowMap: 1024, antialias: true, density: 0.8, view: 0.8, lodK: 22, cardEvery: 2, minimapEvery: 4, visEvery: 1, kantoTex: 2048, globeTex: 2048, patch: 1536 },
  low: { label: '低', pixelRatio: 0.85, shadows: false, shadowMap: 512, antialias: false, density: 0.6, view: 0.6, lodK: 14, cardEvery: 3, minimapEvery: 6, visEvery: 1, kantoTex: 2048, globeTex: 2048, patch: 1024 },
};
const KEY = 'hamakoro.quality';

export function savedChoice() {
  try { const v = localStorage.getItem(KEY); return v && (v === 'auto' || PRESETS[v]) ? v : 'auto'; } catch (e) { return 'auto'; }
}
export function saveChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } }

// A rough guess from what the browser tells us; the watchdog corrects it while playing.
export function autoLevel() {
  const mem = navigator.deviceMemory || 8;          // GB (Chrome/Android only)
  const cores = navigator.hardwareConcurrency || 8;
  const touch = matchMedia('(pointer: coarse)').matches;
  const px = Math.max(screen.width, screen.height) * Math.min(devicePixelRatio || 1, 3);
  if (mem <= 3 || cores <= 4) return 'low';
  if (touch) return mem <= 4 || px > 2600 ? 'low' : 'mid';
  return 'high';
}

export function resolveQuality(choice = savedChoice()) {
  const level = choice === 'auto' ? autoLevel() : choice;
  return { choice, level, ...PRESETS[level] };
}

// Frame-rate watchdog: averages over a few seconds while playing; if the game runs below ~28 fps it
// lowers the render resolution step by step (down to 0.55), and gives some back when it runs smoothly.
export class FpsGuard {
  constructor(renderer, base) {
    this.r = renderer; this.base = base; this.ratio = base;
    this.t = 0; this.frames = 0; this.good = 0; this.dropped = false;
  }
  tick(dt, active) {
    if (!active) { this.t = 0; this.frames = 0; return null; }
    this.t += dt; this.frames++;
    if (this.t < 3) return null;
    const fps = this.frames / this.t;
    this.t = 0; this.frames = 0;
    if (fps < 28 && this.ratio > 0.56) {
      this.ratio = Math.max(0.55, this.ratio * 0.82);
      this.r.setPixelRatio(this.ratio);
      this.good = 0;
      const first = !this.dropped; this.dropped = true;
      return first ? 'lowered' : null;
    }
    if (fps > 55) {
      if (++this.good >= 3 && this.ratio < this.base) { this.ratio = Math.min(this.base, this.ratio * 1.12); this.r.setPixelRatio(this.ratio); this.good = 0; }
    } else this.good = 0;
    return null;
  }
}
