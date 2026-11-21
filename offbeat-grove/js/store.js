// js/store.js — settings, best scores and the timing history, kept in this browser's localStorage only.
const KEY = 'offbeat-grove/v1';

const DEFAULTS = {
  song: 'skank',
  mode: 'off', // on | off | mix | sync
  diff: 'normal', // easy | normal | hard
  guide: 'fade', // on | fade | off
  length: 'full', // full | short
  drillBpm: 100,
  offsetMs: 0, // timing calibration: + means you hit late on purpose (audio reaches you late)
  vol: { music: 0.85, guide: 0.7, sfx: 0.7 },
  seated: false,
  labels: true, // count labels on the beat lane
  quality: 'high',
  records: {}, // `${song}|${mode}|${diff}|${length}` -> { score, rank, acc, date }
  history: [], // last sessions: { date, song, mode, diff, acc, on: {mean, sd, n}, and: {...}, six: {...} }
  plays: 0,
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...structuredClone(DEFAULTS), ...raw, vol: { ...DEFAULTS.vol, ...(raw.vol || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const store = {
  data: load(),
  listeners: new Set(),
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode: keep it in memory */ }
  },
  set(patch) {
    Object.assign(this.data, patch);
    this.save();
    for (const f of this.listeners) f(patch);
  },
  onChange(f) { this.listeners.add(f); },
  recordKey(o) { return `${o.song}|${o.mode}|${o.diff}|${o.length}`; },
  best(o) { return this.data.records[this.recordKey(o)] || null; },
  addResult(o, res) {
    const k = this.recordKey(o);
    const prev = this.data.records[k];
    const isBest = !prev || res.score > prev.score;
    if (isBest) this.data.records[k] = { score: res.score, rank: res.rank, acc: res.acc, date: Date.now() };
    const h = this.data.history;
    h.push({ date: Date.now(), song: o.song, mode: o.mode, diff: o.diff, acc: res.acc, on: res.cat.on, and: res.cat.and, six: res.cat.six });
    while (h.length > 40) h.shift();
    this.data.plays++;
    this.save();
    return isBest;
  },
};
