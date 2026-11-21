// Adaptive difficulty.
//
// A transformed up-down staircase in log units (3-down-1-up converges on 79.4 % correct,
// Levitt 1971). Training near threshold is what drives perceptual learning, and ~80 % success
// also happens to be a comfortable "flow" level: hard enough to stay interesting, easy enough
// to keep winning.

export class Staircase {
  /**
   * @param {object} o
   * @param {number} o.start   starting value (linear units)
   * @param {number} o.min     hardest/easiest bounds (linear)
   * @param {number} o.max
   * @param {number} [o.easier=1]  +1 when a larger value is easier (contrast), -1 when smaller is easier (speed)
   * @param {number[]} [o.steps]   log10 step sizes, shrinking after reversals
   * @param {number} [o.down=3]
   * @param {object} [saved]  state from a previous session
   */
  constructor(o, saved) {
    this.min = o.min; this.max = o.max;
    this.easier = o.easier ?? 1;
    this.steps = o.steps ?? [0.18, 0.1, 0.05];
    this.down = o.down ?? 3;
    this.trialsTotal = saved?.trials ?? 0;
    this.revHistory = saved?.rev ?? [];
    // Resume slightly easier than last time's threshold: a warm-up that keeps the first
    // trials of a session rewarding, then the staircase walks back down within a few trials.
    const startVal = saved?.thr ?? saved?.value ?? o.start;
    this.x = Math.log10(startVal) + (saved ? 0.12 * this.easier : 0);
    this.clamp();
    this.streak = 0;
    this.lastDir = 0;
    this.sessionRev = saved && this.trialsTotal > 15 ? 2 : 0;
    this.sessionTrials = 0;
    this.sessionCorrect = 0;
  }
  clamp() {
    const lo = Math.log10(this.min), hi = Math.log10(this.max);
    this.x = Math.min(hi, Math.max(lo, this.x));
  }
  get value() { return 10 ** this.x; }
  get step() { return this.steps[Math.min(this.steps.length - 1, Math.floor(this.sessionRev / 2))]; }

  update(correct) {
    this.trialsTotal++; this.sessionTrials++;
    let dir = 0; // +1 = make easier, -1 = make harder
    if (correct) {
      this.sessionCorrect++;
      this.streak++;
      if (this.streak >= this.down) { dir = -1; this.streak = 0; }
    } else {
      this.streak = 0;
      dir = 1;
    }
    if (dir !== 0) {
      if (this.lastDir !== 0 && dir !== this.lastDir) {
        this.sessionRev++;
        this.revHistory.push(+this.x.toFixed(4));
        if (this.revHistory.length > 10) this.revHistory.shift();
      }
      this.lastDir = dir;
      this.x += dir * this.easier * this.step;
      this.clamp();
    }
  }

  /** Threshold estimate: mean of recent reversals (log domain), else current level. */
  threshold() {
    const r = this.revHistory.slice(-6);
    if (r.length >= 2) return 10 ** (r.reduce((a, b) => a + b, 0) / r.length);
    return this.value;
  }
  accuracy() { return this.sessionTrials ? this.sessionCorrect / this.sessionTrials : 0; }
  toJSON() {
    return { value: +this.value.toPrecision(5), thr: +this.threshold().toPrecision(5), trials: this.trialsTotal, rev: this.revHistory };
  }
}

/**
 * A grid of staircases over (spatial frequency band x orientation) for Gabor tasks.
 * Trials are drawn more often from the cells where the player is weakest, so an
 * astigmatic meridian (orientation-specific blur) automatically gets extra training.
 */
export const ORIENTATIONS = [0, 45, 90, 135]; // degrees, stripe orientation (0 = vertical stripes)

export class CellGrid {
  constructor(store, prefix, sfBands, opts) {
    this.store = store; this.prefix = prefix; this.sfBands = sfBands; this.opts = opts;
    this.cells = [];
    for (let b = 0; b < sfBands.length; b++) {
      for (const ori of ORIENTATIONS) {
        const key = `${prefix}:${sfKey(sfBands[b])}:${ori}`;
        const st = new Staircase({ ...opts, start: opts.startFor ? opts.startFor(sfBands[b]) : opts.start }, store.stair(key));
        this.cells.push({ key, band: b, sf: sfBands[b], ori, st, n: 0 });
      }
    }
  }
  /** Weighted pick: weaker cells (higher threshold relative to the band median) come up more often. */
  pick(filter) {
    const cand = filter ? this.cells.filter(filter) : this.cells;
    const byBand = new Map();
    for (const c of cand) {
      if (!byBand.has(c.band)) byBand.set(c.band, []);
      byBand.get(c.band).push(Math.log10(c.st.threshold()));
    }
    const med = new Map();
    for (const [b, arr] of byBand) { arr.sort((a, z) => a - z); med.set(b, arr[Math.floor(arr.length / 2)]); }
    let total = 0;
    const w = cand.map((c) => {
      const rel = Math.log10(c.st.threshold()) - med.get(c.band); // >0 = weaker than typical
      // Higher SF bands matter most for acuity; weight them up a little.
      const sfW = 1 + 0.25 * c.band;
      let ww = sfW * (1 + Math.max(0, rel) * 6) / (1 + c.n * 0.03);
      // a cell pinned at full contrast is beyond today's resolution limit: visit it rarely
      if (c.st.value >= 0.8 && c.st.trialsTotal > 8) ww *= 0.15;
      total += ww;
      return ww;
    });
    let r = Math.random() * total;
    for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) { cand[i].n++; return cand[i]; } }
    const last = cand[cand.length - 1]; last.n++; return last;
  }
  save() { for (const c of this.cells) this.store.setStair(c.key, c.st.toJSON()); }

  /** Contrast sensitivity (1/threshold) per band, averaged over orientations. */
  sensitivityByBand() {
    return this.sfBands.map((sf, b) => {
      const cs = this.cells.filter((c) => c.band === b).map((c) => 1 / c.st.threshold());
      return { sf, cs: cs.reduce((a, z) => a + z, 0) / cs.length };
    });
  }
  /** Relative sensitivity per orientation (1 = average). Reveals the "hard" orientation. */
  orientationProfile() {
    return ORIENTATIONS.map((ori) => {
      let s = 0, n = 0;
      for (const b of new Set(this.cells.map((c) => c.band))) {
        const bandCells = this.cells.filter((c) => c.band === b);
        const mean = bandCells.reduce((a, c) => a + Math.log10(1 / c.st.threshold()), 0) / bandCells.length;
        const cell = bandCells.find((c) => c.ori === ori);
        s += Math.log10(1 / cell.st.threshold()) - mean; n++;
      }
      return { ori, rel: 10 ** (s / Math.max(1, n)) };
    });
  }
}

export function sfKey(sf) { return sf.toFixed(1); }
