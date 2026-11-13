// store.js — settings, calibration, best scores and play history in localStorage.
// Every access is guarded: private windows or blocked storage just fall back to defaults.
import { todayKey } from './util.js';

const KEY = 'star-weaver-v1';

export const DEFAULT_SETTINGS = {
  mode: 'journey',      // journey | quick | endless
  stance: 'stand',      // stand | sit
  step: 'mid',          // small | mid | large  (sidestep width)
  squat: 'shallow',     // off | shallow | normal
  backCare: false,      // 腰いたわりモード: gentler twists, no side bends
  weight: 65,           // kg, for the calorie estimate
  volume: 'mid',        // low | mid | high
  coach: true,          // hologram coach demonstrates moves
};

function blank() {
  return { settings: { ...DEFAULT_SETTINGS }, calib: null, best: {}, history: [], days: [], tutorialDone: false };
}

export const store = {
  data: blank(),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = { ...blank(), ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } };
      }
    } catch { this.data = blank(); }
    return this.data;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  },
  get settings() { return this.data.settings; },
  setSetting(k, v) { this.data.settings[k] = v; this.save(); },
  setCalib(c) { this.data.calib = c; this.save(); },
  setTutorialDone() { this.data.tutorialDone = true; this.save(); },
  // returns { newBest } after storing one finished session
  record(result) {
    const d = this.data;
    const prev = d.best[result.mode] || 0;
    const newBest = result.score > prev;
    if (newBest) d.best[result.mode] = result.score;
    d.history.unshift(result);
    d.history = d.history.slice(0, 60);
    const day = todayKey();
    if (!d.days.includes(day)) d.days.push(day);
    d.days = d.days.slice(-400);
    this.save();
    return { newBest, prevBest: prev };
  },
  // consecutive days ending today (or yesterday, so the streak is not "lost" before you play today)
  streak() {
    const set = new Set(this.data.days);
    const d = new Date();
    if (!set.has(todayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (set.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },
  totals() {
    const h = this.data.history;
    return {
      sessions: h.length,
      minutes: Math.round(h.reduce((a, r) => a + (r.sec || 0), 0) / 60),
      kcal: Math.round(h.reduce((a, r) => a + (r.kcal || 0), 0)),
    };
  },
};
