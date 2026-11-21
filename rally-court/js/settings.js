// js/settings.js — the player's settings, saved in localStorage. Values are always valid for the schema.
import { SETTINGS, defaults, sanitize } from './config.js';

const KEY = 'rally-court:settings';

export class Settings {
  constructor() {
    this.v = defaults();
    this.listeners = new Set();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const s of SETTINGS) if (raw[s.key] !== undefined) this.v[s.key] = sanitize(s.key, raw[s.key]);
    } catch { /* private mode or broken data: defaults */ }
    // URL overrides for testing: ?set=moveMode:auto,level:5
    try {
      const q = new URLSearchParams(location.search).get('set');
      if (q) for (const kv of q.split(',')) { const [k, val] = kv.split(':'); if (k in this.v) this.v[k] = sanitize(k, val === 'true' ? true : val === 'false' ? false : val); }
    } catch { /* node */ }
  }
  get(k) { return this.v[k]; }
  set(k, val) {
    const nv = sanitize(k, val);
    if (nv === undefined || nv === this.v[k]) return;
    this.v[k] = nv;
    this.save();
    for (const fn of this.listeners) fn(k, nv);
  }
  reset(group = null) {
    const d = defaults();
    for (const s of SETTINGS) if (!group || s.group === group) this.set(s.key, d[s.key]);
  }
  isDefault(k) { return this.v[k] === defaults()[k]; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* ignore */ } }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
