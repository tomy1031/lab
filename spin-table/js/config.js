// js/config.js — every setting with its default and why. The start page's menu and the in-VR menu are both
// built from this list. Saved in localStorage ('spin-table:settings').
// type 'choice': options [[value, label]]; 'range': min/max/step/unit; 'toggle': true/false.

export const GROUPS = [
  ['play', 'あそぶ'],
  ['paddle', 'ラケット'],
  ['assist', 'サーブ・アシスト'],
  ['machine', '球出しマシン'],
  ['view', '表示・音・振動'],
];

const RUBBER_OPTS = [['inverted', '裏ソフト'], ['tacky', '粘着'], ['short', '表ソフト'], ['long', '粒高'], ['anti', 'アンチ']];
const COLOR_OPTS = [['red', '赤'], ['black', '黒'], ['blue', '青'], ['green', '緑'], ['pink', 'ピンク']];

export const SETTINGS = [
  // ── あそぶ ──
  { key: 'mode', group: 'play', type: 'choice', label: 'モード', def: 'match',
    options: [['match', '試合'], ['rally', 'ラリー練習'], ['machine', '球出しマシン'], ['serve', 'サーブ練習']],
    help: '試合：CPU と 11 点制のゲーム。ラリー練習：CPU が打ちやすい球をフォアとバックへ交互に返します（点数なし）。球出しマシン：同じ球を出し続けます。サーブ練習：反則の判定と、サーブの速さ・回転・落ちた所を表示します。' },
  { key: 'level', group: 'play', type: 'range', label: '相手の強さ', def: 3, min: 1, max: 5, step: 1, unit: '',
    help: '1 初心者 … 3 中級 … 5 トップ。反応・足の速さ・回転の読み違い・ラケット角度のぶれ・球の速さが変わります。' },
  { key: 'bestOf', group: 'play', type: 'choice', label: '試合の長さ', def: 3,
    options: [[1, '1 ゲーム'], [3, '3 ゲームマッチ'], [5, '5 ゲームマッチ'], [7, '7 ゲームマッチ']],
    help: '1 ゲームは 11 点先取（10-10 からは 2 点差）。サーブは 2 本ずつ交代、10-10 からは 1 本ずつ。' },
  { key: 'firstServe', group: 'play', type: 'choice', label: '最初のサーブ', def: 'random',
    options: [['random', 'ランダム'], ['p', '自分'], ['c', '相手']], help: '第1ゲームで最初にサーブする人。ゲームごとに交代します。' },
  { key: 'hand', group: 'play', type: 'choice', label: '利き手', def: 'right', options: [['right', '右'], ['left', '左']],
    help: 'ラケットを持つ手。反対の手にボールを持ってトスします。' },

  // ── ラケット ──
  { key: 'fhRubber', group: 'paddle', type: 'choice', label: 'フォア面のラバー', def: 'inverted', options: RUBBER_OPTS,
    help: '裏ソフト：よく引っかかり回転がかかる（摩擦 1.0）。粘着：さらに回転、少し遅い。表ソフト：回転は少なめで速い。粒高：ほとんど引っかからず、相手の回転が残る（下回転が上回転になって返る）。アンチ：さらに滑る。' },
  { key: 'bhRubber', group: 'paddle', type: 'choice', label: 'バック面のラバー', def: 'inverted', options: RUBBER_OPTS,
    help: 'フォア面と同じ。バック面にだけ粒高や表ソフトを貼る選手もいます。' },
  { key: 'fhColor', group: 'paddle', type: 'choice', label: 'フォア面の色', def: 'red', options: COLOR_OPTS,
    help: 'ルールでは片面が黒、もう片面は黒とはっきり違う明るい色。' },
  { key: 'bhColor', group: 'paddle', type: 'choice', label: 'バック面の色', def: 'black', options: COLOR_OPTS, help: '' },
  { key: 'blade', group: 'paddle', type: 'choice', label: 'ラケット（板）', def: 'off',
    options: [['all', 'ALL（遅い）'], ['offm', 'OFF−'], ['off', 'OFF'], ['offp', 'OFF+（速い）']],
    help: '板の弾み。反発係数が ALL −0.045、OFF− −0.02、OFF+ +0.018 変わります。' },
  { key: 'gripTilt', group: 'paddle', type: 'range', label: 'ラケットの角度（上下）', def: 30, min: -30, max: 80, step: 1, unit: '°',
    help: 'コントローラーを前に向けたとき（人さし指の向き）、ラケットの先がどれだけ上を向くか。握った感じと合わないときに。VR の中では、ラケットを持つ手のスティック上下でも変えられます。' },
  { key: 'gripYaw', group: 'paddle', type: 'range', label: 'ラケットの角度（左右）', def: 0, min: -40, max: 40, step: 1, unit: '°',
    help: 'ラケットの先を、親指の側（＋）か小指の側（−）へ向けます。' },
  { key: 'gripRoll', group: 'paddle', type: 'range', label: '面の向き（ひねり）', def: 0, min: -45, max: 45, step: 1, unit: '°',
    help: 'フォア面を手のひらの向きからどれだけひねるか。VR の中では、ラケットを持つ手のスティック左右でも変えられます。' },
  { key: 'gripOffset', group: 'paddle', type: 'range', label: '握る位置（前後）', def: 0.0, min: -0.04, max: 0.06, step: 0.005, unit: 'm',
    help: 'ラケットを手の中で前（＋）や後ろへずらします。' },

  // ── サーブ・アシスト ──
  { key: 'serveRule', group: 'assist', type: 'choice', label: 'サーブの反則', def: 'strict',
    options: [['strict', '判定する'], ['warn', '表示だけ'], ['off', 'なし']],
    help: 'トスは手のひらからほぼ真上に 16 cm 以上、落ちてくるところを、エンドラインの後ろ・台より高い所で打つ（ITTF ルール 2.6）。判定する：反則は相手の得点。表示だけ：反則を知らせるだけ。' },
  { key: 'tossAssist', group: 'assist', type: 'toggle', label: 'トスのアシスト', def: true,
    help: 'オン：トリガーを離すと、手のひらからまっすぐ真上に「トスの高さ」まで上がります。オフ：手の動きのまま投げ上げます（本物と同じ）。' },
  { key: 'tossHeight', group: 'assist', type: 'range', label: 'トスの高さ', def: 0.30, min: 0.16, max: 0.8, step: 0.02, unit: 'm',
    help: 'トスのアシストがオンのときの高さ。ルールの下限は 16 cm。' },
  { key: 'assist', group: 'assist', type: 'range', label: '打球アシスト', def: 0, min: 0, max: 1, step: 0.05, unit: '',
    help: '0：物理のまま（本物と同じ）。0 より大きいと、ネットやアウトになる打球だけを、速さと回転はそのままで、入る方向へその割合だけ寄せます。' },
  { key: 'moveStick', group: 'assist', type: 'toggle', label: 'スティックで移動', def: true,
    help: 'トスする手のスティックで、台に沿って前後左右に動けます（部屋が狭いとき）。' },
  { key: 'floorAdjust', group: 'assist', type: 'range', label: '床の高さの補正', def: 0, min: -0.2, max: 0.2, step: 0.01, unit: 'm',
    help: '台（76 cm）が実際の腰の高さと合わないとき。＋で台が高くなります（ガーディアンの床の設定がずれている場合など）。' },

  // ── 球出しマシン ──
  { key: 'machSpin', group: 'machine', type: 'choice', label: '回転', def: 'top',
    options: [['top', '上回転'], ['back', '下回転'], ['side', '横回転'], ['none', 'ナックル'], ['mix', 'ミックス']],
    help: '上回転 40 回転/秒（2400 rpm）、下回転 35 回転/秒、横回転 30 回転/秒。' },
  { key: 'machSpeed', group: 'machine', type: 'choice', label: '速さ', def: 'mid',
    options: [['slow', 'ゆっくり'], ['mid', 'ふつう'], ['fast', '速い']], help: '出る速さ 23 / 34 / 47 km/h。' },
  { key: 'machPlace', group: 'machine', type: 'choice', label: 'コース', def: 'alt',
    options: [['alt', 'フォア・バック交互'], ['fh', 'フォア'], ['bh', 'バック'], ['random', 'ランダム']], help: '' },
  { key: 'machInterval', group: 'machine', type: 'range', label: '間隔', def: 1.8, min: 0.8, max: 4, step: 0.1, unit: '秒', help: '球を出す間隔。' },

  // ── 表示・音・振動 ──
  { key: 'hitInfo', group: 'view', type: 'toggle', label: '打球の速さ・回転の表示', def: true,
    help: '打つたびに、球の速さ（km/h）・回転数（rpm）・回転の種類・打ち方・芯からのずれを、相手コートの上に出します。' },
  { key: 'trail', group: 'view', type: 'toggle', label: 'ボールの軌跡', def: false, help: 'ボールの通った跡を短く表示します。' },
  { key: 'marks', group: 'view', type: 'toggle', label: 'バウンドの跡', def: true, help: '台に落ちた所に数秒間、印を出します。' },
  { key: 'ballColor', group: 'view', type: 'choice', label: 'ボールの色', def: 'white',
    options: [['white', '白'], ['orange', 'オレンジ'], ['training', '2 色（回転が見やすい）']], help: '' },
  { key: 'haptics', group: 'view', type: 'range', label: '振動の強さ', def: 1.0, min: 0, max: 1.5, step: 0.1, unit: '×',
    help: '打った瞬間のコントローラーの振動。強く打つほど強く、芯を外すと長く「ビーン」と、ふち（エッジ）は鋭く響きます。' },
  { key: 'volume', group: 'view', type: 'range', label: '音量', def: 0.8, min: 0, max: 1, step: 0.05, unit: '', help: '' },
  { key: 'voice', group: 'view', type: 'toggle', label: '審判の声', def: true, help: 'スコアを英語で読み上げます（ブラウザの音声合成）。' },
  { key: 'crowd', group: 'view', type: 'toggle', label: '観客', def: true, help: '会場のざわめきと拍手。' },
  { key: 'shadows', group: 'view', type: 'toggle', label: '影（高画質）', def: true, help: 'オフで軽くなります（ボールの影は残ります）。' },
];

const byKey = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));
export const settingOf = (k) => byKey[k];
export function defaults() { return Object.fromEntries(SETTINGS.map((s) => [s.key, s.def])); }

/** a valid value for setting k from v (or undefined) */
export function sanitize(k, v) {
  const s = byKey[k];
  if (!s) return undefined;
  if (s.type === 'toggle') return v === true || v === 'true' ? true : v === false || v === 'false' ? false : s.def;
  if (s.type === 'range') {
    const n = Number(v);
    if (!Number.isFinite(n)) return s.def;
    const c = Math.min(s.max, Math.max(s.min, n));
    return Number((s.min + Math.round((c - s.min) / s.step) * s.step).toFixed(6));
  }
  const opt = s.options.find(([o]) => String(o) === String(v));
  return opt ? opt[0] : s.def;
}

export function formatValue(s, v) {
  if (s.type === 'toggle') return v ? 'オン' : 'オフ';
  if (s.type === 'choice') { const o = s.options.find(([k]) => k === v); return o ? o[1] : String(v); }
  if (s.key === 'level') return `${v}（${['', '初心者', '初級', '中級', '上級', 'トップ'][v]}）`;
  const dec = s.step < 0.01 ? 3 : s.step < 0.1 ? 2 : s.step < 1 ? 1 : 0;
  return `${Number(v).toFixed(dec)}${s.unit ? ' ' + s.unit : ''}`;
}
