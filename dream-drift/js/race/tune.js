// race/tune.js — the handling numbers, adjustable live from the tuning panel (js/ui/tuner.js) and kept on
// this device. Kart physics, input shaping and the chase camera read them every frame.
// [group, key, label, min, max, step, default, unit, hint]
export const TUNE_DEFS = [
  ['drift', 'driftNeutral', 'ハンドルを はなした ときの 曲がり', 0.05, 1.2, 0.01, 0.28, '× 最大', 'ドリフト中に スティックを まっすぐに した ときの 曲がり。大きいほど きつい'],
  ['drift', 'driftIn', '内側に 入れた ときの 追加', 0, 1, 0.01, 0.34, '', '曲がる 方へ いっぱいに 入れた ときに 足す 分（キーを 押しっぱなし＝いっぱい）'],
  ['drift', 'driftOut', '外側に 入れた ときの 減り', 0, 0.6, 0.01, 0.18, '', '反対へ いっぱいに 入れた ときに 引く 分'],
  ['drift', 'driftEase', 'ドリフトに 入る 時間', 0.05, 1.5, 0.05, 0.4, '秒', '長いほど ゆっくり 曲がり始める'],
  ['drift', 'driftRelease', 'ドリフトが ぬける 時間', 0.05, 1, 0.05, 0.25, '秒', ''],
  ['drift', 'driftSteerLag', 'ドリフト中の ハンドルの おくれ', 0, 0.6, 0.01, 0.12, '秒', '入力の 変化を なめらかに する 時間'],
  ['drift', 'turnLag', '曲がる 速さの おくれ', 0, 0.5, 0.01, 0.1, '秒', 'ドリフトと ジャンプ中、曲がる 速さが 急に 変わらない ように'],
  ['drift', 'driftGrip', 'ドリフト中の グリップ', 2, 15, 0.5, 7.5, '', '小さいほど 外へ すべる'],
  ['drift', 'driftStart', 'ドリフト開始に いる ハンドル', 0.05, 0.9, 0.05, 0.3, '', 'ボタンを 押した とき これより 切って いれば ドリフト'],
  ['drift', 'hopTurn', 'ジャンプ中の 曲がり', 0, 1, 0.05, 0.55, '× ふつう', ''],
  ['drift', 'driftAngle', 'カートの 見た目の 角度', 0, 0.8, 0.02, 0.42, 'rad', '見た目だけ（曲がり方は 変わらない）'],
  ['steer', 'turn', 'ハンドルの 強さ', 0.8, 3, 0.05, 1.95, 'rad/秒', 'ふつうに 曲がる ときの いっぱいの 曲がり（キャラの ハンドルで 少し 変わる）'],
  ['steer', 'highSpeedLess', '高速での 弱まり', 0, 0.6, 0.01, 0.26, '', '最高速で ハンドルが この 割合 弱く なる'],
  ['steer', 'grip', 'ふつうの グリップ', 4, 20, 0.5, 11, '', ''],
  ['input', 'keyEngage', 'キー・十字キーで 切る 速さ', 1, 20, 0.5, 5.5, '/秒', '大きいほど すぐ いっぱいに なる'],
  ['input', 'keyRelease', 'キーを はなした ときの もどり', 2, 30, 0.5, 10, '/秒', ''],
  ['input', 'stickCurve', 'スティックの カーブ', 0.6, 3, 0.05, 1, '', '大きいほど 中心の 近くが おだやか'],
  ['input', 'touchCurve', 'タッチの スライダーの カーブ', 0.6, 3, 0.05, 1.3, '', '大きいほど 中心の 近くが おだやか'],
  ['camera', 'camFollowDrift', 'ドリフト中 カメラが 進む 向きを 追う 割合', 0, 1, 0.05, 0.7, '', '1 ＝ 進む 向き、0 ＝ カートの 向き'],
  ['camera', 'camTurnDrift', 'ドリフト中の カメラの 回る 速さ', 1, 12, 0.25, 4.5, '', '小さいほど ゆったり'],
  ['camera', 'camTurn', 'ふつうの カメラの 回る 速さ', 1, 12, 0.25, 5.5, '', ''],
].map(([group, key, label, min, max, step, def, unit, hint]) => ({ group, key, label, min, max, step, def, unit, hint }));

export const TUNE_GROUPS = { drift: 'ドリフト', steer: 'ふつうの ハンドル', input: '入力', camera: 'カメラ' };
export const TUNE_DEFAULTS = Object.fromEntries(TUNE_DEFS.map((d) => [d.key, d.def]));

const KEY = 'dream-drift-tune';
function load() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = {};
    for (const d of TUNE_DEFS) if (typeof o[d.key] === 'number' && Number.isFinite(o[d.key])) out[d.key] = Math.min(d.max, Math.max(d.min, o[d.key]));
    return out;
  } catch { return {}; }
}

export const TUNE = { ...TUNE_DEFAULTS, ...load() };

export function saveTune() {
  const changed = {};
  for (const d of TUNE_DEFS) if (TUNE[d.key] !== d.def) changed[d.key] = TUNE[d.key];
  try { localStorage.setItem(KEY, JSON.stringify(changed)); } catch { /* private mode */ }
}

export function setTune(key, v) {
  const d = TUNE_DEFS.find((x) => x.key === key);
  if (!d || !Number.isFinite(v)) return;
  TUNE[key] = Math.min(d.max, Math.max(d.min, +(+v).toFixed(4)));
  saveTune();
}

export function resetTune() { Object.assign(TUNE, TUNE_DEFAULTS); saveTune(); }

// the text the copy button puts on the clipboard: every value, changed ones marked, easy to paste back
export function tuneText() {
  const changed = TUNE_DEFS.filter((d) => TUNE[d.key] !== d.def).map((d) => d.key);
  return `DREAM DRIFT 調整値 (${changed.length ? '変更 ' + changed.length + ' 個: ' + changed.join(', ') : '初期値のまま'})\n` + JSON.stringify(Object.fromEntries(TUNE_DEFS.map((d) => [d.key, TUNE[d.key]])));
}

// read values back from pasted text (the JSON part of tuneText, or any JSON object of the same keys)
export function applyTuneText(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return 0;
  let o; try { o = JSON.parse(m[0]); } catch { return 0; }
  let n = 0;
  for (const d of TUNE_DEFS) if (typeof o[d.key] === 'number') { setTune(d.key, o[d.key]); n++; }
  return n;
}
