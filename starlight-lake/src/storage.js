// Persistent progress in localStorage. Every access is guarded: private windows and blocked
// storage must not break the game, they only lose progress.

const KEY = 'starlight-lake.v1';

const DEFAULTS = () => ({
  settings: {
    minutes: 15,
    course: 'full',         // 'full' (the research-ordered night) | 'custom' (chosen chapters)
    chapters: ['lantern', 'spirits', 'gates', 'depth', 'comets'],
    age: 42,
    quality: 'auto',        // 'auto' | 'standard' | 'high'  (WebXR framebuffer scale)
    volume: 0.8,
    music: 0.55,
    dichoptic: 'off',       // 'off' | 'left' | 'right'  (the WEAKER eye)
    fellow: 0.4,            // fellow-eye contrast in dichoptic mode
    screen: { pxPerMm: 0, distance: 3.0 },
  },
  stairs: {},               // staircase states by key
  history: [],              // one entry per finished night
  acuity: [],               // screen-mode Landolt C results
  totals: { nights: 0, spirits: 0, lanterns: 0, stars: 0, minutes: 0, constellations: [] },
  orientation: {},          // per-orientation summary for the "vision map"
});

function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = merge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

export class Store {
  constructor() {
    this.data = DEFAULTS();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = merge(DEFAULTS(), JSON.parse(raw));
    } catch (e) { /* storage unavailable: run without persistence */ }
  }
  get settings() { return this.data.settings; }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  }
  stair(key) { return this.data.stairs[key]; }
  setStair(key, state) { this.data.stairs[key] = state; }
  reset() { this.data = DEFAULTS(); this.save(); }
  export() { return JSON.stringify(this.data, null, 2); }
}
