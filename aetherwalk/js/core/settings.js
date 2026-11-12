// js/core/settings.js — player settings (§10.12, OPUS-A). Saved as aetherwalk.settings.v1 unless ?fresh.
// set() validates against the defaults' type / allowed values and emits 'settings:change' { key, value }.

export const SETTINGS_KEY = 'aetherwalk.settings.v1';

export const SETTING_DEFS = {
  turnMode: { def: 'snap', options: ['snap', 'smooth'], label: '向きを変える', en: 'TURN' },
  snapAngle: { def: 30, options: [30, 45], label: 'スナップ角度', en: 'SNAP °' },
  smoothTurnSpeed: { def: 90, min: 30, max: 240, label: 'スムーズターン', en: 'SMOOTH °/s' },
  vignette: { def: 1, options: [1, 0, 2], label: 'ビネット', en: 'VIGNETTE', names: { 0: 'なし', 1: '弱', 2: '強' } },
  moveDirection: { def: 'head', options: ['head', 'hands'], label: '進む向き', en: 'DIRECTION', names: { head: '頭', hands: '手' } },
  stepSensitivity: { def: 'mid', options: ['mid', 'low', 'high'], label: '足踏みの感度', en: 'STEP SENS.', names: { low: '低', mid: '中', high: '高' } },
  strideScale: { def: 1.0, min: 0.7, max: 1.5, step: 0.05, label: '速さの倍率', en: 'STRIDE' },
  armAssist: { def: true, label: '腕ふりアシスト', en: 'ARM ASSIST' },
  armOnlyWalk: { def: false, label: '腕ふりだけで歩く', en: 'ARM-ONLY WALK' },
  stickMove: { def: false, label: 'スティックで歩く', en: 'STICK MOVE' },
  seated: { def: false, label: '座って遊ぶ', en: 'SEATED' },
  duckDepth: { def: 'normal', options: ['normal', 'shallow'], label: 'しゃがみの深さ', en: 'DUCK DEPTH', names: { normal: 'ふつう', shallow: '浅い' } },
  edgeGuard: { def: true, label: '崖の縁で止まる', en: 'EDGE GUARD' },
  knockback: { def: true, label: 'ノックバック', en: 'KNOCKBACK' },
  gripToggle: { def: false, label: 'グリップ切り替え式', en: 'GRIP TOGGLE' },
  dominantHand: { def: 'right', options: ['right', 'left'], label: '利き手', en: 'HAND', names: { right: '右', left: '左' } },
  hudMode: { def: 'float', options: ['float', 'wrist'], label: 'HUD', en: 'HUD' },
  quality: { def: 'auto', options: ['auto', 'low', 'mid', 'high'], label: '画質', en: 'QUALITY' },
  weightKg: { def: 60, min: 25, max: 200, step: 1, label: '体重 kg', en: 'WEIGHT' },
  volMaster: { def: 0.8, min: 0, max: 1, step: 0.05, label: '音量', en: 'VOLUME' },
  volSfx: { def: 1.0, min: 0, max: 1, step: 0.05, label: '効果音', en: 'SFX' },
  volMusic: { def: 0.7, min: 0, max: 1, step: 0.05, label: '音楽', en: 'MUSIC' },
  runBeat: { def: true, label: '走りの拍', en: 'RUN BEAT' },
  haptics: { def: 1.0, min: 0, max: 1, step: 0.1, label: '振動', en: 'HAPTICS' },
};

export function createSettings({ events = null, fresh = false } = {}) {
  const values = {};
  for (const k of Object.keys(SETTING_DEFS)) values[k] = SETTING_DEFS[k].def;
  const overrides = {};            // session-only values (e.g. ?quality=)

  if (!fresh) {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const k of Object.keys(saved || {})) if (k in SETTING_DEFS) { const v = coerce(k, saved[k]); if (v !== undefined) values[k] = v; }
      }
    } catch { /* storage blocked */ }
  }

  function coerce(key, value) {
    const d = SETTING_DEFS[key];
    if (!d) return value;
    const t = typeof d.def;
    if (t === 'boolean') {
      if (typeof value === 'string') return value === 'true' || value === '1' || value === 'on';
      return !!value;
    }
    if (t === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) return undefined;
      if (d.options) return d.options.includes(n) ? n : undefined;
      return Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, n));
    }
    const s = String(value);
    if (d.options && !d.options.includes(s)) return undefined;
    return s;
  }
  function persist() {
    if (fresh) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(values)); } catch { /* full / blocked */ }
  }

  const settings = {
    defs: SETTING_DEFS,
    get(key) { return key in overrides ? overrides[key] : values[key]; },
    set(key, value) {
      const v = coerce(key, value);
      if (v === undefined) return false;
      delete overrides[key];
      if (values[key] === v) return true;
      values[key] = v;
      persist();
      events?.emit('settings:change', { key, value: v });
      return true;
    },
    /** session-only value (not saved), e.g. URL parameters */
    override(key, value) {
      const v = coerce(key, value);
      if (v === undefined) return false;
      overrides[key] = v;
      events?.emit('settings:change', { key, value: v });
      return true;
    },
    all() { return { ...values, ...overrides }; },
    reset() {
      for (const k of Object.keys(SETTING_DEFS)) settings.set(k, SETTING_DEFS[k].def);
    },
  };
  return settings;
}
