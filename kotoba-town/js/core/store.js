// Settings and progress, kept in this browser (localStorage). The Gemini API key is stored here and
// is only ever sent to Google's Gemini Live endpoint.
const SKEY = 'kotoba.settings.v1';
const PKEY = 'kotoba.progress.v1';
const KKEY = 'kotoba.geminiKey';

const DEFAULTS = { name: '', display: 'kana', romaji: false, english: true, rate: 1, slowSpeaker: false, model: '', music: true };

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }

export const store = {
  settings: { ...DEFAULTS, ...read(SKEY, {}) },
  progress: read(PKEY, {}),
  saveSettings() { write(SKEY, this.settings); },
  get apiKey() { try { return localStorage.getItem(KKEY) || ''; } catch { return ''; } },
  set apiKey(v) { try { if (v) localStorage.setItem(KKEY, v.trim()); else localStorage.removeItem(KKEY); } catch { /* */ } },
  record(variantId, stars) {
    const p = this.progress[variantId] || { stars: 0, plays: 0 };
    p.stars = Math.max(p.stars, stars); p.plays += 1; p.at = Date.now();
    this.progress[variantId] = p;
    write(PKEY, this.progress);
  },
};
