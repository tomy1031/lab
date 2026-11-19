// js/config.js — every adjustable number, with the default that plays best and why. The PC menu and the
// in-VR menu are both built from this list. Saved in localStorage ('rally-court:settings').
//
// type 'choice': options [[value, label]]; type 'range': min/max/step/unit; type 'toggle': true/false.
// group: play | move | swing | game | view (the menu tabs). modes: the move modes the item applies to.

export const GROUPS = [
  ['play', 'あそぶ'],
  ['move', '移動'],
  ['swing', 'ラケット'],
  ['game', '相手・コート'],
  ['view', '表示・音'],
];

export const SETTINGS = [
  // ── あそぶ ───────────────────────────────────────────────────────────
  { key: 'mode', group: 'play', type: 'choice', label: 'モード', def: 'match',
    options: [['match', '試合'], ['rally', 'ラリー練習'], ['machine', '球出し'], ['serve', 'サーブ練習']],
    help: '試合は CPU と1セット（設定で3セット）。ラリー練習は点数なしで打ち合い、球出しはマシンが同じ球を出し続けます。' },
  { key: 'moveMode', group: 'play', type: 'choice', label: '移動方法', def: 'step',
    options: [['step', '足踏み・腕振り'], ['auto', '自動'], ['dpad', '十字キー']],
    help: '足踏み・腕振り：その場で足踏み（腕振り）すると、落下地点（打てる立ち位置）へまっすぐ進みます。テンポが速いほど速く、着いたら止まります。\n自動：落下地点へ自動で動きます。速さは「自分の最高速度」まで。\n十字キー：スティック（PC は矢印キー）で自由に動きます。' },
  { key: 'hand', group: 'play', type: 'choice', label: '利き手', def: 'right', options: [['right', '右'], ['left', '左']],
    help: 'ラケットを持つ手。反対の手でトスします。' },
  { key: 'level', group: 'play', type: 'range', label: '相手の強さ', def: 3, min: 1, max: 5, step: 1, unit: '',
    help: '1 初心者 … 3 中級（草トーナメント） … 5 上級。速さ・正確さ・足の速さ・反応が変わります。' },

  // ── 移動 ─────────────────────────────────────────────────────────────
  { key: 'maxSpeed', group: 'move', type: 'range', label: '自分の最高速度', def: 4.5, min: 2, max: 7, step: 0.1, unit: 'm/s',
    help: 'すべての移動方法の上限。一般の上級者のコート内のダッシュは 4〜5 m/s、トップ選手で 5〜6 m/s。' },
  { key: 'accel', group: 'move', type: 'range', label: '加速', def: 7, min: 2, max: 12, step: 0.5, unit: 'm/s²',
    help: '動き出しの鋭さ。7 m/s² で 0.64 秒で 4.5 m/s に達します（一般の上級者。トップ選手は 8〜9）。大きいほど酔いやすくなります。' },
  { key: 'decel', group: 'move', type: 'range', label: '減速（止まる強さ）', def: 10, min: 3, max: 16, step: 0.5, unit: 'm/s²',
    help: '止まるときの強さ。テニスの切り返しは加速より速く止まれます。' },
  { key: 'stepTopCadence', group: 'move', type: 'range', label: '最高速になる足踏みテンポ', def: 170, min: 110, max: 230, step: 5, unit: '歩/分',
    modes: ['step'],
    help: 'このテンポで足踏みすると最高速度。100 歩/分（ゆっくり）で約 2 m/s、140 で約 3.4 m/s（初期値の場合）。' },
  { key: 'stepSensitivity', group: 'move', type: 'choice', label: '足踏みの感度', def: 'mid',
    options: [['low', '低（大きく踏む）'], ['mid', '中'], ['high', '高（小さな足踏みでも）']], modes: ['step'],
    help: '頭の上下の揺れで足踏みを数えます。誤って動くなら低、反応しないなら高に。' },
  { key: 'armWeight', group: 'move', type: 'range', label: '腕振りの効き', def: 1.0, min: 0, max: 1.5, step: 0.1, unit: '×',
    modes: ['step'],
    help: '走るように両腕を前後に振っても進みます（足踏みと両方なら少し速く）。0 で腕振りを使いません。ラケットのスイングは数えません。' },
  { key: 'reaction', group: 'move', type: 'range', label: '反応時間', def: 0.2, min: 0, max: 0.6, step: 0.05, unit: '秒',
    modes: ['auto'],
    help: '自動移動が相手の打球に反応して動き出すまでの時間。人の反応はおよそ 0.2 秒。' },
  { key: 'autoRecover', group: 'move', type: 'toggle', label: '打ったあと定位置へ戻る', def: true, modes: ['auto', 'step'],
    help: '打ったあと、次の球に備える位置（ベースラインの後ろ、相手のコースの中央）を目標にします。足踏みモードでは、足踏みすると戻ります。' },
  { key: 'stickDigital', group: 'move', type: 'toggle', label: '十字キー（8方向・一定速度）', def: true, modes: ['dpad'],
    help: 'オン：スティックを十字キーのように 8 方向・最高速度で使います。オフ：倒した量で速さが変わるアナログ操作。' },
  { key: 'stickSpeed', group: 'move', type: 'range', label: '十字キーの速さ', def: 1.0, min: 0.3, max: 1.0, step: 0.05, unit: '× 最高速度',
    modes: ['dpad'], help: '十字キーで動くときの速さ（最高速度に対する割合）。' },
  { key: 'stickFrame', group: 'move', type: 'choice', label: '十字キーの上方向', def: 'court',
    options: [['court', 'ネットの方向'], ['head', '顔の向き']], modes: ['dpad'],
    help: 'ネットの方向：上でネットへ、左右でサイドラインへ（体をひねっても方向が変わらない）。' },
  { key: 'deadzone', group: 'move', type: 'range', label: 'スティックの遊び', def: 0.25, min: 0.05, max: 0.6, step: 0.05, unit: '',
    modes: ['dpad'], help: 'この量より小さく倒しても動きません。' },
  { key: 'contactH', group: 'move', type: 'range', label: '打点の高さ', def: 0.95, min: 0.6, max: 1.4, step: 0.05, unit: 'm',
    modes: ['step', 'auto'], help: '落下地点を、ボールがこの高さに来る場所で計算します（腰の高さが基本）。' },
  { key: 'reach', group: 'move', type: 'range', label: 'ボールとの横の間合い', def: 0.85, min: 0.5, max: 1.2, step: 0.05, unit: 'm',
    modes: ['step', 'auto'], help: '体の中心から打点までの横の距離。腕＋ラケットの長さ。ボールが体に近すぎる・遠すぎるときに調整。' },
  { key: 'front', group: 'move', type: 'range', label: '打点の前後', def: 0.4, min: 0, max: 0.9, step: 0.05, unit: 'm 前',
    modes: ['step', 'auto'], help: '打点が体のどれだけ前に来るように立つか。' },
  { key: 'showTarget', group: 'move', type: 'toggle', label: '落下地点（目標）を表示', def: true,
    help: 'コートに、向かう立ち位置の輪を表示します。' },
  { key: 'showBounce', group: 'move', type: 'toggle', label: 'バウンド予測を表示', def: false,
    help: 'ボールが弾む位置に印を出します（練習用。本物の試合にはありません）。' },

  // ── ラケット ─────────────────────────────────────────────────────────
  { key: 'racketAngle', group: 'swing', type: 'range', label: 'ラケットの角度（前腕との角度）', def: 55, min: 20, max: 100, step: 1, unit: '°',
    help: '手首をまっすぐにしたときの、前腕とラケットのなす角。90° はハンマーのように握った向き、小さいほど前腕の延長に近づく。テニスのグリップは手のひらに斜めに握るので約 55°。' },
  { key: 'racketRoll', group: 'swing', type: 'range', label: '面の向き（開き・閉じ）', def: 0, min: -30, max: 30, step: 1, unit: '°',
    help: '＋で面が上向き（開く）、−で下向き（かぶせる）。グリップの握り（イースタン・ウエスタン）の違いに。' },
  { key: 'swingPower', group: 'swing', type: 'range', label: 'スイングの強さ', def: 1.0, min: 0.6, max: 1.6, step: 0.05, unit: '×',
    help: '1.0 で振った速さのまま（物理のとおり）。本物のラケットの重さがないぶん振りが小さくなる人は上げます。' },
  { key: 'assist', group: 'swing', type: 'range', label: 'ショットアシスト', def: 0.2, min: 0, max: 1, step: 0.05, unit: '',
    help: 'アウトやネットになる打球を、同じ速さと回転のまま入る方向へ寄せる割合。0 で完全に物理のまま。' },
  { key: 'haptics', group: 'swing', type: 'range', label: '振動', def: 0.8, min: 0, max: 1, step: 0.1, unit: '',
    help: '打った瞬間の振動の強さ。芯を外すと強く・長く震えます。' },
  { key: 'tossAssist', group: 'swing', type: 'toggle', label: 'トスアシスト', def: true,
    help: 'オン：トリガーを離すと、手の上へまっすぐ一定の高さにトス。オフ：手の動きのまま投げ上げます。' },
  { key: 'tossHeight', group: 'swing', type: 'range', label: 'トスの高さ', def: 1.3, min: 0.6, max: 2.2, step: 0.05, unit: 'm',
    help: 'トスアシストで、離した手の高さから頂点までの高さ。' },

  // ── 相手・コート ─────────────────────────────────────────────────────
  { key: 'surface', group: 'game', type: 'choice', label: 'コート', def: 'hard',
    options: [['hard', 'ハード'], ['clay', 'クレー'], ['grass', '芝']],
    help: 'ハード：中くらいの速さ。クレー：球が遅く高く弾む。芝：速く低く滑る（摩擦と反発の実測値に基づく）。' },
  { key: 'sets', group: 'game', type: 'choice', label: 'セット数', def: 1, options: [[1, '1セット'], [3, '3セット']] },
  { key: 'games', group: 'game', type: 'choice', label: '1セットのゲーム数', def: 6, options: [[4, '4ゲーム（ショート）'], [6, '6ゲーム']],
    help: '同点（6-6 / 4-4）ではタイブレーク（7点先取）。' },
  { key: 'noAd', group: 'game', type: 'toggle', label: 'ノーアドバンテージ', def: false, help: 'デュースで次の1点を取った方がゲーム。' },
  { key: 'firstServe', group: 'game', type: 'choice', label: '最初のサーブ', def: 'p', options: [['p', '自分'], ['c', 'CPU']] },
  { key: 'machineSpeed', group: 'game', type: 'range', label: '球出しの速さ', def: 85, min: 40, max: 150, step: 5, unit: 'km/h' },
  { key: 'machineSpin', group: 'game', type: 'choice', label: '球出しの回転', def: 'top',
    options: [['flat', 'フラット'], ['top', 'トップスピン'], ['slice', 'スライス'], ['mix', 'まぜる']] },
  { key: 'machineCourse', group: 'game', type: 'choice', label: '球出しのコース', def: 'alt',
    options: [['fh', 'フォア'], ['bh', 'バック'], ['alt', '交互'], ['random', 'ランダム']] },
  { key: 'machineInterval', group: 'game', type: 'range', label: '球出しの間隔', def: 3.5, min: 1.8, max: 8, step: 0.1, unit: '秒' },

  // ── 表示・音 ─────────────────────────────────────────────────────────
  { key: 'vignette', group: 'view', type: 'range', label: '酔い止め（視界のふち）', def: 0.45, min: 0, max: 1, step: 0.05, unit: '',
    help: '自動で動いている間だけ視界のふちを暗くして酔いを防ぎます。0 でなし。' },
  { key: 'trail', group: 'view', type: 'toggle', label: 'ボールの軌跡', def: true },
  { key: 'volume', group: 'view', type: 'range', label: '音量', def: 0.8, min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'umpire', group: 'view', type: 'toggle', label: '審判のコール（音声）', def: true, help: 'ブラウザの音声合成で英語のコール（Fifteen love など）。' },
  { key: 'crowd', group: 'view', type: 'toggle', label: '観客の声', def: true },
];

export const SETTING = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));
export const defaults = () => Object.fromEntries(SETTINGS.map((s) => [s.key, s.def]));

/** keep a stored value only if it is still valid for the schema */
export function sanitize(key, v) {
  const s = SETTING[key];
  if (!s) return undefined;
  if (s.type === 'range') { const n = Number(v); if (!Number.isFinite(n)) return s.def; return Math.min(s.max, Math.max(s.min, n)); }
  if (s.type === 'toggle') return typeof v === 'boolean' ? v : s.def;
  if (s.type === 'choice') { const o = s.options.find(([x]) => String(x) === String(v)); return o ? o[0] : s.def; }
  return s.def;
}

export function formatValue(s, v) {
  if (s.type === 'toggle') return v ? 'オン' : 'オフ';
  if (s.type === 'choice') return (s.options.find(([x]) => x === v) || [, String(v)])[1];
  const digits = s.step >= 1 ? 0 : s.step >= 0.1 ? 1 : 2;
  return `${Number(v).toFixed(digits)}${s.unit ? ' ' + s.unit : ''}`;
}

// CPU strength by level (1…5)
export const LEVELS = [
  null,
  // vmax/accel: running; react: s; speed: groundstroke m/s; spin: rad/s; angErr: execution error (deg);
  // margin: m inside the lines it aims; serve1/2: km/h; faults: share of first serves missed; stretch: m of lunge
  { vmax: 3.7, accel: 4.8, react: 0.34, speed: 21, spin: 110, angErr: 2.4, margin: 1.5, aim: 0.35, serve1: 112, serve2: 88, faults: 0.4, stretch: 0.3 },
  { vmax: 4.2, accel: 5.5, react: 0.29, speed: 24.5, spin: 150, angErr: 1.9, margin: 1.25, aim: 0.45, serve1: 132, serve2: 102, faults: 0.35, stretch: 0.38 },
  { vmax: 4.6, accel: 6.3, react: 0.24, speed: 28, spin: 190, angErr: 1.5, margin: 1.0, aim: 0.55, serve1: 150, serve2: 116, faults: 0.32, stretch: 0.46 },
  { vmax: 5.1, accel: 7.0, react: 0.2, speed: 32, spin: 230, angErr: 1.15, margin: 0.8, aim: 0.65, serve1: 172, serve2: 132, faults: 0.3, stretch: 0.55 },
  { vmax: 5.6, accel: 8.0, react: 0.16, speed: 36, spin: 270, angErr: 0.85, margin: 0.62, aim: 0.75, serve1: 192, serve2: 148, faults: 0.28, stretch: 0.65 },
];
