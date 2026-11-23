// data/handwork.js — what the hands do for each craft method / template and for other work (DESIGN §24.2–§24.7).
// A flow is a list of steps run in order by player/handwork.js; each step is one of the 8 kinds:
//   strike · rub · twist · trace · weave · stir · tend · place
// step: { kind, n, scene, label, ...params }. `scene` picks what is drawn (handwork-art.js props).
// The flow's performance p (0–1) is the n-weighted mean of the steps (§24.4).

export const KIND_NAMES = { strike: '打つ', rub: 'こする・研ぐ', twist: 'より合わせる・巻く', trace: 'なぞって 切る・削る', weave: '交互に 通す', stir: '混ぜる', tend: '火の そばで 見る', place: 'つまんで 置く' };

export const HINTS = {
  strike: ['輪が 重なった ときに 打つ', '石の ふちを 斜めに。真上から 打つと 砕ける'],
  rub: ['同じ 速さで 行って 戻る。あわてない', '刃は ねかせて、水を つけながら'],
  twist: ['つまんだ まま 同じ 向きに 回す。最後に 引いて しめる'],
  trace: ['線に そって ゆっくり。刃は 自分の 体から 外へ'],
  weave: ['上、下、上、下。光った 側へ 通す'],
  stir: ['止めずに 同じ 調子で 回す'],
  tend: ['色を 見る。きつね色に なったら 返す', '煙が 止まったら おろす'],
  place: ['下から 順に。こぼさない ように'],
};

/** how each input works, shown under the hint (mouse·keys / touch / gesture) */
export const CONTROLS = {
  strike: { mouse: '的に 合わせて クリック（スペースでも）', touch: '的を タップ', gesture: 'グーで 振り下ろす' },
  rub: { mouse: '押したまま 左右に 往復（A・D でも）', touch: '指で 左右に こする', gesture: '両手を すり合わせる' },
  twist: { mouse: '押したまま 円を 描く（ホイールでも）→ 下へ 引く', touch: '指で 円 → 下へ スワイプ', gesture: 'つまんで 回す → 引く' },
  trace: { mouse: '線の はしから ドラッグで なぞる', touch: '指で なぞる', gesture: 'つまんで なぞる' },
  weave: { mouse: '← → （A・D）を 拍に 合わせて', touch: '左右を 交互に タップ', gesture: '左右に 交互に 振る' },
  stir: { mouse: '押したまま 円を 描く', touch: '指で 円を 描く', gesture: '人さし指で 円' },
  tend: { mouse: 'E・クリックで 返す／おろす、スペースで あおぐ', touch: 'タップで 返す、上へ スワイプで おろす', gesture: '手首を 返す／つかんで 引く' },
  place: { mouse: 'ドラッグして 枠へ', touch: 'ドラッグして 枠へ', gesture: 'つまんで 運んで はなす' },
  choose: { mouse: 'クリック（1・2・3 キーでも）', touch: 'タップ', gesture: 'つまんで 選ぶ' },
};

const S = (kind, n, scene, extra = {}) => ({ kind, n, scene, ...extra });

// ---------------------------------------------------------------- the method defaults (§24.3 手法の 既定)
export const METHOD_FLOW = {
  tie: (u) => [S('place', Math.max(1, Math.min(2, u - 1)), 'lashing', { label: '部品を 合わせる', tokens: ['stick', 'cord'] }), S('twist', 6, 'lashing', { label: '巻いて しめる', tighten: true })],
  carve: () => [S('trace', 6, 'stick', { label: '手前へ 削る', mode: 'strokes' })],
  weave: () => [S('weave', 12, 'weave', { label: '交互に 通す' })],
  mix: () => [S('stir', 8, 'bowl', { label: '混ぜる・すりつぶす' })],
  knap: () => [S('strike', 4, 'core', { label: '叩いて 割る' })],
  heat: () => [S('tend', 1, 'pot', { label: '火に かけて 見る', mode: 'smoke' })],
  pack: () => [S('place', 3, 'filter', { label: '詰める', tokens: ['leaf', 'stone', 'herb'] })],
};

// ---------------------------------------------------------------- templates with their own flow (§24.3 主な 型)
export const TEMPLATE_FLOW = {
  flake: () => [S('strike', 5, 'core', { label: 'ふちを 斜めに 打つ', knap: true })],
  shell_bowl: () => [S('strike', 3, 'core', { label: 'ふちを 整える', material: 'stone' })],
  charcoal_powder: () => [S('strike', 3, 'core', { label: '砕く', material: 'stone' }), S('stir', 4, 'bowl', { label: 'すりつぶす', colors: ['#555', '#222'], content: 'powder' })],
  cord: () => [S('twist', 10, 'cord', { label: 'よりを かける（向きを 変えない）', tighten: false })],
  line: () => [S('twist', 10, 'cord', { label: '細く よる' })],
  rope_made: () => [S('twist', 14, 'cord', { label: '太く よる' })],
  mat: () => [S('weave', 16, 'weave', { label: '編む', material: 'leaf' })],
  basket: () => [S('weave', 24, 'weave', { label: 'かごを 編む', material: 'vine' })],
  backpack: () => [S('weave', 24, 'weave', { label: '編む', material: 'vine' })],
  fish_trap: () => [S('weave', 24, 'weave', { label: '魚かごを 編む', material: 'vine' })],
  crab_pot: () => [S('weave', 20, 'weave', { label: '編む', material: 'vine' })],
  leaf_cape: () => [S('weave', 16, 'weave', { label: '葉を 編む', material: 'leaf' })],
  leaf_hat: () => [S('weave', 12, 'weave', { label: '葉を 編む', material: 'leaf' })],
  hand_net: () => [S('weave', 20, 'weave', { label: '網を 結ぶ', material: 'fiber' })],
  cast_net_made: () => [S('weave', 24, 'weave', { label: '網を 結ぶ（長い）', material: 'fiber' })],
  blanket: () => [S('weave', 20, 'weave', { label: '編む', material: 'fiber' })],
  sandals: () => [S('weave', 12, 'weave', { label: '編む', material: 'fiber' })],
  knife_made: () => [S('trace', 1, 'stick', { label: '柄に みぞを 切る', mode: 'line', path: 'groove' }), S('place', 1, 'lashing', { label: '刃を はさむ', tokens: ['blade'], variant: 'haft' }), S('twist', 8, 'lashing', { label: '巻いて しめる', tighten: true, variant: 'haft' })],
  axe_made: () => [S('trace', 1, 'stick', { label: '柄に 割れ目を 入れる', mode: 'line', path: 'groove' }), S('place', 1, 'lashing', { label: '刃を はさむ', tokens: ['stone'], variant: 'haft' }), S('twist', 8, 'lashing', { label: '巻いて しめる', tighten: true, variant: 'haft' })],
  spear_tip: () => [S('trace', 1, 'stick', { label: '先に 割れ目', mode: 'line', path: 'groove' }), S('place', 1, 'lashing', { label: '穂先を はさむ', tokens: ['blade'], variant: 'haft' }), S('twist', 8, 'lashing', { label: '巻いて しめる', tighten: true, variant: 'haft' })],
  harpoon: () => [S('trace', 1, 'stick', { label: 'みぞを 切る', mode: 'line', path: 'groove' }), S('twist', 8, 'lashing', { label: '巻いて しめる', tighten: true, variant: 'haft' })],
  hammer: () => [S('place', 1, 'lashing', { label: '石を 合わせる', tokens: ['stone'], variant: 'haft' }), S('twist', 8, 'lashing', { label: '巻いて しめる', tighten: true, variant: 'haft' })],
  spear_wood: () => [S('trace', 10, 'stick', { label: '先を とがらす', mode: 'strokes', taper: true })],
  digging_stick: () => [S('trace', 8, 'stick', { label: '先を 削る', mode: 'strokes', taper: true })],
  club: () => [S('trace', 6, 'stick', { label: '握りを 削る', mode: 'strokes' })],
  float_made: () => [S('trace', 4, 'stick', { label: '形を 削る', mode: 'strokes' })],
  bamboo_cup: () => [S('trace', 1, 'stick', { label: '節の 下で 切る', mode: 'line', path: 'cut' }), S('rub', 4, 'whetstone', { label: 'ふちを なめらかに', blade: 'stone' })],
  bow_made: () => [S('trace', 2, 'stick', { label: '弓幹の 腹を 削る（左右 同じに）', mode: 'line', path: 'belly' }), S('twist', 4, 'lashing', { label: '弦を かける', tighten: true })],
  arrow: () => [S('trace', 1, 'stick', { label: '軸を まっすぐに', mode: 'line', path: 'shaft' }), S('twist', 3, 'lashing', { label: '矢じりを 巻く', variant: 'haft' }), S('place', 3, 'lashing', { label: '羽を 付ける', tokens: ['feather', 'feather', 'feather'] })],
  hook: () => [S('trace', 2, 'stick', { label: '切り出す', mode: 'line', path: 'hook' }), S('rub', 8, 'whetstone', { label: '先を とがらす', blade: 'bone' }), S('strike', 1, 'core', { label: 'かえしを 付ける', material: 'stone' })],
  bone_needle: () => [S('trace', 2, 'stick', { label: '切り出す', mode: 'line', path: 'cut' }), S('rub', 8, 'whetstone', { label: 'とがらす', blade: 'bone' }), S('strike', 1, 'core', { label: '針穴', material: 'stone' })],
  signal_mirror: () => [S('trace', 2, 'stick', { label: '切り出す', mode: 'line', path: 'cut' }), S('rub', 8, 'whetstone', { label: 'みがく', blade: 'shell' })],
  whistle: () => [S('trace', 2, 'stick', { label: '口を 削る', mode: 'line', path: 'cut' })],
  hand_drill_kit: () => [S('trace', 1, 'stick', { label: '棒を 丸く', mode: 'line', path: 'shaft' }), S('strike', 1, 'core', { label: 'くぼみを 打つ', material: 'stone' }), S('trace', 1, 'stick', { label: 'V 字の 切り欠き', mode: 'line', path: 'notch', notch: true })],
  bow_drill_kit: () => [S('trace', 1, 'stick', { label: '棒を 丸く', mode: 'line', path: 'shaft' }), S('strike', 1, 'core', { label: 'くぼみを 打つ', material: 'stone' }), S('trace', 1, 'stick', { label: 'V 字の 切り欠き', mode: 'line', path: 'notch', notch: true }), S('twist', 3, 'lashing', { label: '弦を 張る', tighten: true })],
  torch: () => [S('twist', 8, 'lashing', { label: '巻きつける' })],
  tinder_bundle: () => [S('rub', 8, 'bowl', { label: '両手で もむ', content: 'powder', colors: ['#c9a96a', '#b08d55'] }), S('place', 1, 'bowl', { label: '鳥の 巣の 形に', tokens: ['fiber'] })],
  water_filter: () => [S('place', 4, 'filter', { label: '下から 層を 入れる', tokens: ['cloth', 'charcoal', 'sand', 'gravel'], ordered: true }), S('strike', 2, 'filter', { label: '軽く 押し固める' })],
  solar_still: () => [S('place', 3, 'filter', { label: '詰める', tokens: ['leaf', 'stone', 'cloth'] })],
  shell_lamp: () => [S('place', 2, 'bowl', { label: '詰める', tokens: ['fiber', 'herb'] })],
  poison_tip: () => [S('place', 2, 'bowl', { label: 'ぬる', tokens: ['herb', 'stick'] }), S('rub', 4, 'bowl', { label: 'すりこむ' })],
  clay_pot: () => [S('stir', 10, 'clay', { label: 'こねる（空気を ぬく）', knead: true }), S('twist', 6, 'clay', { label: 'ひもを 積む' }), S('rub', 6, 'clay', { label: 'なでて つなぎ目を 消す' })],
  poultice: () => [S('stir', 10, 'bowl', { label: 'すりつぶす', colors: ['#6aa35a', '#3f6e34'], content: 'paste', pestle: true })],
  repellent: () => [S('stir', 10, 'bowl', { label: 'すりつぶす', colors: ['#9bbf6a', '#6a8a3c'], content: 'paste', pestle: true })],
  bait_ball: () => [S('stir', 8, 'bowl', { label: 'こねる', colors: ['#c8a27a', '#8a6a4a'], content: 'paste' })],
  pitch: () => [S('tend', 1, 'pot', { label: 'とかして おろす', mode: 'smoke', content: 'pitch' }), S('stir', 4, 'bowl', { label: '混ぜる', colors: ['#3b2a1a', '#6a4a2a'], content: 'paste' })],
  soap: () => [S('tend', 1, 'pot', { label: '煮つめる', mode: 'boil', content: 'stew' })],
  herb_tea: () => [S('tend', 1, 'pot', { label: '煮出して おろす', mode: 'boil', content: 'tea' })],
  char_cloth: () => [S('tend', 1, 'pot', { label: '煙が 止まったら おろす', mode: 'smoke', content: 'water' })],
  charcoal_batch: () => [S('tend', 1, 'pot', { label: '煙が 止まったら おろす', mode: 'smoke', content: 'water' })],
  fur_vest: () => [S('strike', 6, 'core', { label: '針穴を あける', material: 'stone' }), S('weave', 12, 'weave', { label: '糸を 通す', material: 'fiber' })],
  water_skin: () => [S('strike', 6, 'core', { label: '針穴を あける', material: 'stone' }), S('weave', 12, 'weave', { label: '糸を 通す', material: 'fiber' })],
  bandage: () => [S('trace', 1, 'stick', { label: '布を 裂く', mode: 'line', path: 'cut' })],
  splint: () => [S('place', 1, 'lashing', { label: '添え木を 当てる', tokens: ['stick'] }), S('twist', 4, 'lashing', { label: '巻く', tighten: true })],
};

// ---------------------------------------------------------------- work outside crafting (§24.7)
export const WORK_FLOW = {
  sharpen: (blade = 'knife') => [S('rub', 12, 'whetstone', { label: '刃を ねかせて 研ぐ', blade })],
  stake: () => [S('strike', 4, 'stake', { label: '杭を 打つ' })],
  lash: () => [S('twist', 6, 'lashing', { label: '柱を しばる', tighten: true })],
  thatch: () => [S('place', 3, 'weave', { label: '葉を 下から 重ねる', tokens: ['leaf', 'leaf', 'leaf'] }), S('weave', 8, 'weave', { label: '押さえの 紐', material: 'leaf' })],
  skewer: (food = 'fish') => [S('tend', 1, 'skewer', { label: '火に かざして 返す', mode: 'skewer', food })],
  boil: () => [S('tend', 1, 'pot', { label: '沸いて から 少し 待って おろす', mode: 'boil', content: 'water' })],
  bandage: () => [S('twist', 5, 'arm', { label: '包帯を 巻く', tighten: true, band: true })],
  tan: () => [S('rub', 16, 'whetstone', { label: '脂を かき取る', blade: 'stone' })],
  // §10 fire by friction / sparks, done on the work table: make the ember, move it to the tinder, blow it into a flame
  friction: (bow = false) => [S('rub', bow ? 8 : 12, 'drill', { label: bow ? '弓を 引いて 棒を 回す（一定に）' : '棒を 両手で もむ（速く、一定に）', band: [0.12, 0.42] }), S('place', 1, 'drill', { label: '火種を 火口へ うつす', tokens: ['charcoal'] }), S('tend', 1, 'blow', { label: '息を 吹きかける', mode: 'blow' })],
  spark: () => [S('strike', 3, 'flint', { label: '火花を 火口に 落とす', material: 'chert' }), S('tend', 1, 'blow', { label: '息を 吹きかける', mode: 'blow' })],
};

/** the flow for a craft: the template's own, else the method default (§24.3) */
export function flowFor(method, templateId, units = 2) {
  const t = TEMPLATE_FLOW[templateId];
  if (t) return t(units);
  const m = METHOD_FLOW[method];
  return m ? m(units) : [S('place', 1, 'bowl', { label: '組み合わせる', tokens: ['stone'] })];
}

/** §24.4 手ごたえ: p → label and the quality bonus (−6…+12) */
export function feelOf(p) {
  const bonus = Math.round(-6 + 18 * p);
  const label = p >= 0.9 ? '会心の 出来！' : p >= 0.7 ? 'いい 手ごたえ' : p >= 0.4 ? 'まずまず' : p >= 0.25 ? 'ちょっと 雑に なった' : 'しくじった…';
  const timeMul = p >= 0.9 ? 0.9 : p >= 0.4 ? 1 : p >= 0.25 ? 1.1 : 1.2;
  return { bonus, label, timeMul, good: p >= 0.7, fail: p < 0.25 };
}
