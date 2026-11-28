// core/save.js — localStorage persistence: settings (incl. the Gemini key, kept only in this browser),
// one autosave slot for the running game, and best records.
const K = { settings: 'isle.settings', save: 'isle.save', records: 'isle.records', key: 'isle.geminiKey' };

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export function loadSettings() {
  return safe(() => JSON.parse(localStorage.getItem(K.settings) || '{}'), {});
}
export function saveSettings(s) { safe(() => localStorage.setItem(K.settings, JSON.stringify(s))); }

/** The Gemini API key is stored only in this browser and only sent to generativelanguage.googleapis.com */
export function getApiKey() { return safe(() => localStorage.getItem(K.key) || '', ''); }
export function setApiKey(k) { safe(() => (k ? localStorage.setItem(K.key, k.trim()) : localStorage.removeItem(K.key))); }

export function loadGame() { return safe(() => JSON.parse(localStorage.getItem(K.save) || 'null'), null); }
export function saveGame(data) { return safe(() => { localStorage.setItem(K.save, JSON.stringify(data)); return true; }, false); }
export function clearGame() { safe(() => localStorage.removeItem(K.save)); }

export function loadRecords() { return safe(() => JSON.parse(localStorage.getItem(K.records) || '[]'), []); }
export function addRecord(r) {
  const list = loadRecords();
  list.push(r);
  list.sort((a, b) => (b.score || 0) - (a.score || 0));
  safe(() => localStorage.setItem(K.records, JSON.stringify(list.slice(0, 20))));
  return list;
}
