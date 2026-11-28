// data/buildings.js — every structure of DESIGN.md §12.2 (+ the tent of §21.2).
// Slot conditions are property conditions, like recipes: a slot is filled by any stack whose effective
// attributes (attrsOf) are all >= `need`, or whose item has one of `tags`, or whose id is in `ids`.
//   slot = { key, label, need: { attr: min }, tags?: [...], ids?: [...], n, roof?: true, cord?: true }
// A slot with only `ids` accepts exactly those ids; `ids` is always an "or" (a bamboo can stand for a pole).
// Effects (the numbers of §12.3): rain / wind (0–1 blocked), insul (+°C), sleep (bed multiplier or add),
// fireInside (true | 'front' | false), people, fuelMax (h), fuelRate, storage, water …
// Times are game minutes. hp = full durability. weakness = storm weakness of §12.4.

export const ATTR_JP = {
  hard: '硬さ', sharp: '鋭さ', long: '長さ', flex: 'しなり', fiber: '繊維', burn: '燃える', tinder: '火口', waterproof: '防水',
  container: '容器', heavy: '重さ', sticky: '粘り', insul: '保温', float: '浮く',
};

// ---- reusable slot conditions (spread and override `n` / `key` / `label`) ----
const S = {
  pole: { label: '棒', need: { long: 4, hard: 3 } },
  longPole: { label: '長い棒', need: { long: 6, hard: 4 } },
  log: { label: '丸太', need: { heavy: 6, long: 5, hard: 5 }, ids: ['log'] },
  plank: { label: '板／竹', need: {}, ids: ['plank', 'board', 'bamboo', 'bamboo_pole'] },
  bamboo: { label: '竹', need: {}, ids: ['bamboo', 'bamboo_pole'] },
  stone: { label: '石', need: {}, tags: ['stone'], ids: ['stone', 'rock', 'cobble'] },
  flatStone: { label: '平たい石', need: {}, ids: ['flat_stone', 'slate'] },
  cord: { label: '紐', need: { fiber: 3, flex: 3 }, cord: true },
  rope: { label: 'ロープ', need: { fiber: 7, flex: 3 }, cord: true },
  strongRope: { label: '強いロープ', need: { fiber: 9, flex: 3 }, cord: true },
  roof: { label: '屋根材', need: { waterproof: 4 }, roof: true },
  panel: { label: '面（葉・マット）', need: { flex: 3 }, tags: ['leaf', 'cloth', 'mat'] },
  bark: { label: '面（葉・樹皮）', need: { flex: 2 }, tags: ['leaf', 'bark', 'mat'] },
  bedding: { label: '保温材', need: { insul: 3 } },
  clay: { label: '粘土', need: { sticky: 5 }, tags: ['clay'], ids: ['clay'] },
  fuel: { label: '燃料', need: { burn: 4 } },
};
const slot = (key, base, n, over = {}) => ({ key, ...base, n, ...over });

export const BUILDINGS = {
  campfire: {
    name: 'たき火', icon: '🔥', p: 'P0', minutes: 1, size: [1.4, 1.4], hp: 0, weakness: 1.0, place: 'ground', height: 0.4,
    slots: [slot('fuel', S.fuel, 3, { label: '小枝' })],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: true, fuelMax: 6, fuelRate: 1.0 },
    fire: { kind: 'campfire', maxFuelMin: 360 }, noRuin: true,
    desc: '地面の たき火。小雨で 消費 ×2、大雨 20 分で 消える。',
  },
  fire_ring: {
    name: '石囲いの 炉', icon: '🪨', p: 'P0', minutes: 10, size: [1.8, 1.8], hp: 200, weakness: 0.1, place: 'ground', height: 0.45,
    slots: [slot('stone', S.stone, 8)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: true, fuelMax: 10, fuelRate: 0.85, rainOutMin: 60 },
    fire: { kind: 'campfire', maxFuelMin: 600 },
    desc: '風に 強く 屋内にも 置ける 炉。焼き台（平たい 石）で 石板焼き。',
  },
  clay_oven: {
    name: 'かまど', icon: '🏺', p: 'P1', minutes: 90, size: [1.6, 1.6], hp: 300, weakness: 0.2, place: 'ground', height: 1.0, dry: 720,
    slots: [slot('clay', S.clay, 10), slot('stone', S.stone, 6), slot('flat', S.flatStone, 2)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: true, fuelMax: 16, fuelRate: 0.6, firing: -0.1, stewTime: 0.7 },
    fire: { kind: 'campfire', maxFuelMin: 960 }, walls: [[0, 0, 0, 0]], cr: 0.7,
    desc: '粘土の かまど。雨で 消えない。土器の 割れ率 −0.1、煮込み ×0.7。',
  },
  signal_fire: {
    name: '狼煙台', icon: '💨', p: 'P0', minutes: 40, size: [2.4, 2.4], hp: 150, weakness: 0.5, place: 'ground', height: 2.6,
    slots: [slot('log', S.log, 3), slot('stick', S.pole, 10, { label: '枝' }), slot('smoke', { label: '生木・生の 葉', need: { flex: 4, burn: 2 }, ids: ['green_branch', 'green_leaf'] }, 10), slot('stone', S.stone, 6)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, fuelMax: 8, fuelRate: 1.5, signal: true, smokeH: 3 },
    fire: { kind: 'signal', maxFuelMin: 480 },
    desc: '点火すると 煙が 3 時間。岩山の 頂上・浜で 効果 大。',
  },
  sos_sign: {
    name: 'SOS の 石文字', icon: '🆘', p: 'P0', minutes: 60, size: [6.2, 2.6], hp: 100, weakness: 0.3, place: 'flat', height: 0.2, stormDamage: 30, noRuin: false,
    slots: [slot('stone', { label: '石（流木・海藻でも）', need: {}, tags: ['stone'], ids: ['stone', 'rock', 'cobble', 'driftwood', 'seaweed'] }, 30)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, aircraft: 0.10 },
    desc: '飛行機に 気づかれる ＋0.10。浜・草原・岩山の 平地のみ。満潮線より 下は 流される。',
  },
  windbreak: {
    name: '風よけの 壁', icon: '🌴', p: 'P0', minutes: 20, size: [3.2, 0.7], hp: 60, weakness: 1.0, place: 'ground', height: 1.5, leafRoof: true,
    slots: [slot('pole', S.pole, 4), slot('panel', S.panel, 4), slot('cord', S.cord, 2)],
    effects: { rain: 0, wind: 0.6, insul: 0, fireInside: true, windOneSide: true },
    walls: [[-1.5, 0, 1.5, 0]], cr: 0.35,
    desc: '風よけ 0.6（片側）。火の 風上に 置くと 火の 消費倍率が 1.0 に 戻る。',
  },
  lean_to: {
    name: '差しかけ小屋', icon: '⛺', p: 'P0', minutes: 40, size: [2.4, 2.2], hp: 80, weakness: 1.0, place: 'ground', height: 1.7, leafRoof: true,
    slots: [slot('pole', S.longPole, 5), slot('roof', S.roof, 8), slot('cord', { ...S.cord, label: '紐（繊維 3+）' }, 4)],
    effects: { rain: 0.75, wind: 0.5, insul: 1.0, sleep: 0, fireInside: 'front', people: 2, fireWarmMul: 1.2, windFromBackOnly: true },
    desc: '雨よけ 0.75、風よけ 0.5（背の 方向）、保温 ＋1.0、1〜2 人。前に 火を 置くと 暖かさ ×1.2。',
  },
  a_frame: {
    name: '葉ぶきの 三角小屋', icon: '🛖', p: 'P0', minutes: 100, size: [2.6, 3.4], hp: 140, weakness: 0.6, place: 'ground', height: 1.8, leafRoof: true,
    slots: [slot('pole', S.longPole, 9), slot('roof', S.roof, 16), slot('cord', S.cord, 8), slot('bedding', S.bedding, 6)],
    effects: { rain: 0.9, wind: 0.8, insul: 2.5, sleep: 0, fireInside: false, people: 2 },
    desc: '雨よけ 0.9、風よけ 0.8、保温 ＋2.5、2 人。中で 火は 不可（入口の 前に）。',
  },
  bamboo_hut: {
    name: '竹の 高床小屋', icon: '🎋', p: 'P1', minutes: 300, size: [3.0, 3.4], hp: 260, weakness: 0.4, place: 'ground', height: 2.4, leafRoof: true, floorH: 0.42,
    slots: [slot('bamboo', S.bamboo, 24), slot('roof', S.roof, 20), slot('cord', S.cord, 16), slot('floor', S.plank, 8, { label: '板／竹（床）' })],
    effects: { rain: 0.97, wind: 0.85, insul: 2.0, sleep: 0.1, fireInside: false, people: 3, storage: 0.7, bugs: 0.5 },
    walls: [[-1.5, -1.7, 1.5, -1.7], [-1.5, -1.7, -1.5, 1.7], [1.5, -1.7, 1.5, 1.7], [-1.5, 1.7, -0.5, 1.7], [0.5, 1.7, 1.5, 1.7]], cr: 0.3,
    desc: '浸水・ムカデ・蚊（×0.5）を 防ぐ。床下が 貯蔵庫。睡眠の 質 ＋0.1。',
  },
  log_cabin: {
    name: '丸太小屋', icon: '🏠', p: 'P1', minutes: 720, size: [3.6, 3.2], hp: 600, weakness: 0.1, place: 'ground', height: 2.5, leafRoof: true,
    slots: [slot('log', S.log, 20), slot('roof', S.roof, 24), slot('cord', S.cord, 12), slot('clay', S.clay, 8), slot('stone', S.stone, 8)],
    effects: { rain: 1.0, wind: 0.97, insul: 4.0, sleep: 0, fireInside: true, people: 3, fireWarmMul: 1.3, boar: false },
    walls: [[-1.8, -1.6, 1.8, -1.6], [-1.8, -1.6, -1.8, 1.6], [1.8, -1.6, 1.8, 1.6], [-1.8, 1.6, -0.55, 1.6], [0.55, 1.6, 1.8, 1.6]], cr: 0.32,
    desc: '丸太と 粘土の 小屋。中に 石囲いの 炉を 置ける（暖かさ ×1.3）。嵐に 強い。',
  },
  cave_home: {
    name: '洞窟の 住まい', icon: '🕳️', p: 'P1', minutes: 180, size: [3.4, 0.9], hp: 400, weakness: 0, place: 'cave', height: 2.0,
    slots: [slot('stone', S.stone, 20), slot('pole', S.pole, 6), slot('panel', S.panel, 6), slot('cord', S.cord, 4)],
    effects: { rain: 1.0, wind: 1.0, insul: 2.0, sleep: 0, fireInside: false, people: 3, bats: false },
    walls: [[-1.7, 0, -0.5, 0], [0.5, 0, 1.7, 0]], cr: 0.35,
    desc: '入口の 壁と 扉。風よけ 1.0、保温 ＋2、コウモリが 出なく なる。火は 入口に。',
  },
  tree_house: {
    name: '樹上の 小屋', icon: '🌳', p: 'P2', minutes: 480, size: [3.0, 3.0], hp: 200, weakness: 0.5, place: 'between_trees', height: 2.4, leafRoof: true,
    slots: [slot('plank', S.plank, 12, { label: '板' }), slot('pole', S.longPole, 8), slot('rope', S.rope, 4, { need: { fiber: 9 } }), slot('roof', S.roof, 12)],
    effects: { rain: 0.9, wind: 0.6, insul: 1.5, sleep: 0, fireInside: false, people: 2, lookout: 0.05 },
    desc: '動物・浸水 無効、見晴らし ＋0.05。強風で 揺れる（嵐は 睡眠 不可）。',
  },
  grass_bed: {
    name: '草の 寝床', icon: '🌾', p: 'P0', minutes: 10, size: [1.2, 2.1], hp: 0, weakness: 0.5, place: 'ground', height: 0.25, noRuin: true,
    slots: [slot('bedding', S.bedding, 8, { label: '保温材（枯れ草・ヤシの 葉）' })],
    effects: { rain: 0, wind: 0, insul: 1.0, sleep: 0.85, sleepWorn: 0.7, wornDays: 7, fireInside: true, people: 1, bedOnly: true },
    desc: '睡眠の 質 0.85。地面の 冷えを 断つ（就寝中 ＋1.0℃）。7 日で へたる（0.7）。',
  },
  hammock: {
    name: 'ハンモック', icon: '🛏️', p: 'P1', minutes: 20, size: [3.2, 1.0], hp: 80, weakness: 0.8, place: 'between_trees', height: 1.2,
    slots: [slot('net', { label: '網・大きな 面', need: { fiber: 5 }, tags: ['net'] }, 1), slot('rope', S.rope, 2)],
    effects: { rain: 0, wind: 0, insul: -1.0, sleep: 0.95, fireInside: true, people: 1, bugs: 0, bedOnly: true },
    desc: '睡眠の 質 0.95。ムカデ・浸水 無効。下が 冷える（−1.0℃）。',
  },
  raised_bed: {
    name: '高床の 寝台', icon: '🛌', p: 'P1', minutes: 60, size: [1.3, 2.2], hp: 120, weakness: 0.7, place: 'ground', height: 0.6,
    slots: [slot('pole', S.pole, 8), slot('cord', S.cord, 6), slot('bedding', S.bedding, 8)],
    effects: { rain: 0, wind: 0, insul: 1.5, sleep: 1.1, fireInside: true, people: 1, bugs: 0, bedOnly: true },
    desc: '睡眠の 質 1.1、ムカデ 無効、＋1.5℃。',
  },
  drying_rack: {
    name: '干し台', icon: '🐟', p: 'P0', minutes: 25, size: [2.0, 0.9], hp: 60, weakness: 1.0, place: 'ground', height: 1.5,
    slots: [slot('pole', S.pole, 6), slot('cord', S.cord, 4)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: true, storage: { kind: 'dry', n: 12 }, dryRate: 60 },
    walls: [[0, 0, 0, 0]], cr: 0.6,
    desc: '12 個まで 干せる。おおいで 鳥に 取られない。服も 干せる（火の そばで 乾き 60/h）。',
  },
  smoker: {
    name: '燻製棚', icon: '🥓', p: 'P1', minutes: 60, size: [1.6, 1.6], hp: 80, weakness: 0.8, place: 'ground', height: 1.9,
    slots: [slot('pole', S.pole, 8), slot('cord', S.cord, 6), slot('cover', S.bark, 6)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, storage: { kind: 'smoke', n: 8 }, needsFire: true },
    walls: [[0, 0, 0, 0]], cr: 0.6,
    desc: '8 個まで 燻せる。下に 火（炉）が 必要。',
  },
  larder: {
    name: '貯蔵庫', icon: '🧺', p: 'P1', minutes: 80, size: [1.6, 1.4], hp: 120, weakness: 0.6, place: 'ground', height: 1.9, leafRoof: true,
    slots: [slot('pole', S.pole, 8), slot('plank', S.plank, 4), slot('cord', S.cord, 6), slot('roof', S.panel, 4, { label: '面（屋根）', roof: true, need: { flex: 3, waterproof: 3 } })],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, storage: { kind: 'larder', n: 40, mult: 0.6 } },
    walls: [[0, 0, 0, 0]], cr: 0.75,
    desc: '高床の 食料棚。置き場倍率 0.6、動物に 取られない、雨に 濡れない。40 個。',
  },
  cool_pit: {
    name: '冷やし穴', icon: '🕳️', p: 'P2', minutes: 40, size: [1.4, 1.4], hp: 50, weakness: 0.5, place: 'riverside', height: 0.2,
    slots: [slot('stone', S.stone, 6), slot('leaf', S.panel, 4, { label: '葉' })],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, storage: { kind: 'cool', n: 10, mult: 0.5 }, floods: true },
    desc: '置き場倍率 0.5、10 個。増水で 流失。',
  },
  wood_shed: {
    name: '薪棚', icon: '🪵', p: 'P1', minutes: 30, size: [1.8, 1.0], hp: 80, weakness: 0.9, place: 'ground', height: 1.4, leafRoof: true,
    slots: [slot('pole', S.pole, 6), slot('roof', S.roof, 6), slot('cord', S.cord, 4)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, storage: { kind: 'fuel', n: 40 } },
    walls: [[0, 0, 0, 0]], cr: 0.7,
    desc: '燃料 40 個を 濡らさず 置ける。仲間の「火の 番」が ここから 取る。',
  },
  rain_catcher: {
    name: '雨水受け（小）', icon: '💧', p: 'P0', minutes: 25, size: [1.5, 1.5], hp: 50, weakness: 1.0, place: 'ground', height: 1.3, leafRoof: true,
    slots: [slot('sheet', { label: '防水の 面', need: { waterproof: 5 }, roof: true }, 1), slot('pole', S.pole, 4), slot('cord', S.cord, 2), slot('pot', { label: '容器', need: { container: 3 } }, 1)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, water: { drizzle: 0.2, heavy: 0.8, cap: 4 } },
    desc: '簡易の 雨水受け。小雨 0.2 L/h、大雨 0.8 L/h、容量 4L。',
  },
  rain_tank: {
    name: '雨水タンク', icon: '🛢️', p: 'P1', minutes: 40, size: [2.2, 2.2], hp: 80, weakness: 0.8, place: 'ground', height: 1.6, leafRoof: true,
    slots: [slot('sheet', { label: '大きな 防水の 面', need: { waterproof: 6 }, roof: true }, 2), slot('pole', S.pole, 4), slot('cord', S.cord, 4), slot('vessel', { label: '大きな 容器（樽・土器 2・竹筒 6）', need: { container: 6 } }, 1)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, water: { drizzle: 0.4, heavy: 1.5, cap: 10 } },
    desc: '小雨 0.4 L/h、大雨 1.5 L/h、容量 10L。ふたで 劣化 半分。',
  },
  workbench: {
    name: '作業台', icon: '🔨', p: 'P1', minutes: 60, size: [1.8, 0.9], hp: 150, weakness: 0.3, place: 'ground', height: 1.0,
    slots: [slot('log', S.log, 2, { label: '丸太（板 4 でも）' }), slot('flat', S.flatStone, 1), slot('pole', S.pole, 4), slot('cord', S.cord, 4)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, craftQ: 10, craftTime: 0.8, hooks: 8 },
    walls: [[0, 0, 0, 0]], cr: 0.8,
    desc: 'そばで 錬成すると Q ＋10、所要 ×0.8。道具 8 個を 掛けて おける。',
  },
  fence: {
    name: '柵', icon: '🚧', p: 'P1', minutes: 20, size: [3.0, 0.4], hp: 80, weakness: 0.7, place: 'ground', height: 1.2,
    slots: [slot('pole', S.pole, 6), slot('cord', S.cord, 3)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: true, boarBlock: true },
    walls: [[-1.5, 0, 1.5, 0]], cr: 0.3,
    desc: 'イノシシ・ネズミの 侵入を 防ぐ。基地を 囲むと 食料の 盗難 0。',
  },
  pit_trap: {
    name: '落とし穴', icon: '⚠️', p: 'P1', minutes: 180, size: [1.4, 1.4], hp: 1, weakness: 0, place: 'ground', height: 0.1,
    slots: [slot('pole', S.pole, 6, { label: '棒（覆い）' }), slot('leaf', S.panel, 8, { label: '葉' })],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, trap: true },
    desc: 'しとめる 罠。覆いは 1 回 かぎり。目印を 立てる。',
  },
  fish_weir: {
    name: 'やな', icon: '🐠', p: 'P1', minutes: 120, size: [4.0, 3.0], hp: 100, weakness: 0.6, place: 'shore', height: 0.8, water: 'shore',
    slots: [slot('stone', S.stone, 20), slot('stick', S.pole, 12, { label: '竹ひご・棒' }), slot('cord', S.cord, 4)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, fishing: true },
    desc: '魚を 追い込む 石と 杭の 仕掛け。増水で −50。',
  },
  lookout: {
    name: '見張り台', icon: '🗼', p: 'P2', minutes: 180, size: [2.0, 2.0], hp: 200, weakness: 0.5, place: 'ground', height: 3.4,
    slots: [slot('log', S.log, 4), slot('pole', S.pole, 8), slot('rope', S.rope, 4)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, spotting: 0.05 },
    desc: '上に いる 間、船・飛行機の 発見が 30 秒 早い。',
  },
  garden: {
    name: '畑', icon: '🌱', p: 'P2', minutes: 90, size: [2.0, 2.0], hp: 0, weakness: 0, place: 'ground', height: 0.3, noRuin: true,
    slots: [slot('manure', { label: '糞・腐った 食べ物', need: {}, ids: ['guano', 'rotten_food'] }, 4), slot('seed', { label: '種イモ・種', need: {}, ids: ['taro_seed', 'seed'] }, 4)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, garden: true },
    desc: 'タロイモ 4 株 → 12 日で 12 個。',
  },
  latrine: {
    name: 'トイレ（穴）', icon: '🚽', p: 'P2', minutes: 40, size: [1.0, 1.0], hp: 0, weakness: 0, place: 'ground', height: 0.2, noRuin: true,
    slots: [slot('pole', S.pole, 4), slot('leaf', S.panel, 4, { label: '葉' })],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, hygiene: 0.5 },
    desc: '衛生の 基本減少 −1.5 → −1.0 /h。基地から 20m 以上。',
  },
  raft: {
    name: 'いかだ', icon: '🛶', p: 'P1', minutes: 360, size: [2.6, 3.4], hp: 200, weakness: 0.6, place: 'shore', height: 0.5, water: 'shore', floating: true,
    slots: [slot('float', { label: '浮く 太い 物（丸太 8／竹 14）', need: { float: 6, long: 9 } }, 8), slot('rope', { ...S.rope, need: { fiber: 8, flex: 3 } }, 6), slot('beam', S.pole, 4, { label: '横木（棒）' })],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, raft: true, speed: [0.6, 2.0] },
    desc: '入り江・島の 周りを 移動。沖釣り（大魚 ×2）、難破船へ。',
  },
  memorial: {
    name: '石積み・墓標', icon: '🗿', p: 'P2', minutes: 10, size: [1.2, 1.2], hp: 0, weakness: 0, place: 'ground', height: 0.8, noRuin: true,
    slots: [slot('stone', S.stone, 5)],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, morale: 3 },
    desc: '気力 ＋3（1 日 1 回 手を 合わせる）。',
  },
  calendar_post: {
    name: '日数の 柱', icon: '📅', p: 'P1', minutes: 5, size: [0.6, 0.6], hp: 0, weakness: 0, place: 'ground', height: 1.8, noRuin: true,
    slots: [slot('pole', S.longPole, 1, { label: '棒 1 ＋ 刃物' })],
    effects: { rain: 0, wind: 0, insul: 0, fireInside: false, morale: 1, calendar: true },
    walls: [[0, 0, 0, 0]], cr: 0.25,
    desc: '毎朝 刻むと 気力 ＋1。長い ゲームの 区切り。',
  },
  tent: {
    name: 'テント', icon: '⛺', p: 'P0', minutes: 10, size: [2.5, 2.5], hp: 300, weakness: 0.5, place: 'ground', height: 1.3, item: 'tent', packMinutes: 5,
    slots: [],
    effects: { rain: 1.0, wind: 0.85, insul: 4.0, sleep: 0, sleepAdd: 0.20, fireInside: false, people: 1, bugs: 0, hot: 6 },
    desc: '持ち歩ける ドーム型テント。雨よけ 1.0、風よけ 0.85、保温 ＋4.0。寝床の 質 ＋0.20。中では 火は 不可。',
  },
};

for (const [id, d] of Object.entries(BUILDINGS)) { d.id = id; }

/** ids in menu order */
export const BUILD_ORDER = Object.keys(BUILDINGS);
