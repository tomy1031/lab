// dev/mock-game.js — a mock `game` implementing the docs/dev-contracts.md API with plausible data, for dev/ui.html.
import { rollSheet } from '../js/sim/companion-sheet.js';
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ items
export const ITEMS = {
  knife: { name: 'サバイバルナイフ', icon: '🔪', cat: 'tool', weight: 0.4, attrs: { hard: 6, sharp: 8, long: 2 }, tool: { kind: 'knife' }, desc: '切る・削る・さばく。背で火打ち石を打てる。' },
  palm_nut: { name: 'ヤシの実', icon: '🥥', cat: 'food', weight: 1.2, attrs: { hard: 4, container: 5, edible: 6, float: 4 }, food: { food: 16, water: 20 }, desc: '緑の若い実は 水が 多い。' },
  fish_m: { name: '中魚', icon: '🐟', cat: 'food', weight: 0.6, attrs: { edible: 8, scent: 5 }, food: { food: 22 }, desc: '釣りたての 魚。' },
  oyster: { name: '二枚貝', icon: '🦪', cat: 'food', weight: 0.2, attrs: { edible: 4, hard: 3, sharp: 2 }, food: { food: 6 }, desc: '潮だまりで 取れる 貝。' },
  berry: { name: '赤い実？', icon: '🍓', cat: 'food', weight: 0.05, attrs: { edible: 3 }, food: { food: 3, water: 2 }, desc: '正体の 分からない 赤い 実。' },
  stick: { name: '枝', icon: '🌿', cat: 'material', weight: 0.4, attrs: { hard: 4, long: 5, burn: 6, flex: 2 }, desc: '' },
  vine: { name: 'つる', icon: '🌱', cat: 'material', weight: 0.1, attrs: { fiber: 6, flex: 6, burn: 3 }, desc: '' },
  stone_flake: { name: '石の かけら', icon: '🪨', cat: 'material', weight: 0.5, attrs: { hard: 7, sharp: 6, heavy: 3 }, desc: '' },
  round_stone: { name: '丸石', icon: '⚪', cat: 'material', weight: 1.5, attrs: { hard: 8, heavy: 6 }, desc: '' },
  palm_leaf: { name: 'ヤシの葉', icon: '🌴', cat: 'material', weight: 0.3, attrs: { waterproof: 5, flex: 6, fiber: 2, burn: 4 }, desc: '屋根や 編み物に。' },
  bamboo: { name: '竹', icon: '🎋', cat: 'material', weight: 1.0, attrs: { hard: 6, long: 9, flex: 5, container: 5, burn: 5 }, desc: '' },
  tinder: { name: '火口束', icon: '🔥', cat: 'fuel', weight: 0.05, attrs: { tinder: 8, burn: 6 }, desc: '' },
  water_bottle: { name: 'ペットボトル', icon: '🧴', cat: 'container', weight: 0.1, attrs: { container: 5, waterproof: 8 }, container: { liters: 0.5 }, desc: '' },
  herb: { name: 'ヨモギ？', icon: '🍃', cat: 'herb', weight: 0.05, attrs: { med: 4, scent: 5, edible: 2 }, med: { type: 'bleed' }, desc: '切れこみの 葉の 草。' },
  rope: { name: 'ロープ', icon: '🪢', cat: 'material', weight: 0.5, attrs: { fiber: 9, flex: 4 }, desc: '' },
  stone_axe: { name: '石斧', icon: '🪓', cat: 'tool', weight: 1.1, attrs: { hard: 7, sharp: 4, heavy: 4, long: 3 }, tool: { kind: 'axe' }, desc: '手づくりの 石斧。' },
  spear: { name: '槍', icon: '🔱', cat: 'weapon', weight: 0.9, attrs: { sharp: 5, long: 8, hard: 4 }, tool: { kind: 'spear' }, desc: '' },
  shirt: { name: 'Tシャツ', icon: '👕', cat: 'clothing', weight: 0.2, attrs: { insul: 1 }, wear: { slot: 'body' }, desc: '' },
};
export const itemDef = (id, stack) => ({ ...(ITEMS[id] || { name: id, icon: '📦', cat: 'misc', weight: 0.1, attrs: {} }), ...(stack?.name ? { name: stack.name } : {}) });
globalThis.ISLE_ITEMS = { itemDef };

// ------------------------------------------------------------------ small pieces
class Bus {
  constructor() { this.h = {}; }
  on(n, f) { (this.h[n] ||= new Set()).add(f); return () => this.h[n].delete(f); }
  emit(n, a) { this.h[n]?.forEach((f) => f(a)); }
}
class Clock {
  constructor() { this.total = 3 * 1440 + 14 * 60 + 5; this.scale = 1; }
  get day() { return Math.floor(this.total / 1440) + 1; }
  get hour() { return (this.total % 1440) / 60; }
  label() { const h = Math.floor(this.hour), m = Math.floor(this.total % 60); return `${this.day}日目 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  tide(t = this.total / 60) { const s = 1 + 0.3 * Math.cos((2 * Math.PI * (t / 24)) / 14.75); return (0.9 * Math.sin((2 * Math.PI * t) / 12.4) + 0.3 * Math.sin((2 * Math.PI * t) / 24.8 + 1)) * s * 0.7; }
}
const LAYOUT = {
  peak: { x: 70, z: -85, name: '見張り山' }, spring: { x: 52, z: -52, name: '湧き水' }, stream: [[52, -52], [30, -30], [8, -6], [-18, 22], [-48, 52], [-82, 84], [-118, 112]],
  pond: { x: -70, z: -48, name: '静かな池' }, bay: { x: -150, z: 150, name: '入り江' }, cave: { x: 118, z: -50, name: '岩の洞窟' }, wreck: { x: 178, z: 72, name: '難破船' },
  tidepools: { x: -40, z: -215, name: '潮だまり' }, clearing: { x: -10, z: -15, name: '草原' }, start: { x: 150, z: 95, name: '東の浜' },
};
function zoneAt(x, z) {
  const ang = Math.atan2(z, x), r = Math.hypot(x, z);
  const coast = 225 + 28 * Math.sin(ang * 3 + 1) + 12 * Math.sin(ang * 7);
  const bayAng = Math.atan2(150, -150), d = Math.abs(Math.atan2(Math.sin(ang - bayAng), Math.cos(ang - bayAng)));
  const c = coast - 55 * Math.exp(-(d * d) / 0.035);
  if (r > c) return 'sea';
  if (r > c - 14) return 'beach';
  if (Math.hypot(x - 70, z + 85) < 45) return 'hill';
  if (Math.hypot(x - 118, z + 50) < 20 || (x > 100 && r > c - 40)) return 'rocks';
  if (Math.hypot(x + 70, z + 48) < 14) return 'pond';
  if (Math.hypot(x + 10, z + 15) < 40) return 'grass';
  if (Math.hypot(x - 52, z + 52) < 8) return 'stream';
  return r > c - 30 ? 'cliff' : 'jungle';
}

// ------------------------------------------------------------------ the mock game
export function createMockGame(opts = {}) {
  const bus = new Bus(); const clock = new Clock();
  let uid = 1;
  const mk = (id, n = 1, extra = {}) => ({ uid: uid++, id, n, q: 50, fresh: null, done: 0, proc: 'none', dur: null, wet: 0, ...extra });
  const stacks = [
    mk('knife', 1, { q: 82, dur: 380 }), mk('palm_nut', 3, { q: 60, fresh: 88 }), mk('fish_m', 2, { q: 55, fresh: 52 }), mk('fish_m', 1, { q: 55, fresh: 22, done: 80 }),
    mk('oyster', 5, { fresh: 30 }), mk('berry', 6, { fresh: 74 }), mk('stick', 8, { q: 48 }), mk('vine', 6, { q: 52 }), mk('stone_flake', 2, { q: 70 }),
    mk('round_stone', 2), mk('palm_leaf', 12, { q: 45, wet: 55 }), mk('bamboo', 3, { q: 65 }), mk('tinder', 2, { q: 40 }),
    mk('water_bottle', 1, { dur: null, water: { src: 'river_low', cups: 2, treat: 'boil' } }), mk('herb', 4, { fresh: 60 }),
    mk('rope', 1, { q: 92 }), mk('stone_axe', 1, { q: 58, dur: 40, name: '粗悪な 石斧' }), mk('spear', 1, { q: 77, dur: 25 }), mk('shirt', 1, { q: 50 }),
  ];
  stacks[16].q = 20;
  const inv = { stacks, get: (u) => stacks.find((s) => s.uid === u), weight: () => stacks.reduce((a, s) => a + (ITEMS[s.id]?.weight || 0.1) * s.n, 0), capacity: 25 };
  const body = {
    s: { hp: 82, food: 58, water: 24, stamina: 70, staminaMax: 100, rest: 61, bodyTemp: 36.7, wet: 45, morale: 71, hygiene: 55 }, feel: 29,
    visible: () => [{ id: 'cut', sev: 1, name: '切り傷', icon: '🩹', treat: '洗う＋包帯', bleeding: true }, { id: 'cold', sev: 2, name: '風邪', icon: '🤧', treat: '温かくして寝る' }],
  };
  const visited = new Set();
  for (let t = 0; t < 60; t++) { const x = 150 - t * 3.2 + Math.sin(t / 5) * 25, z = 95 - t * 2.6 + Math.cos(t / 4) * 20; visited.add(`${Math.floor(x / 20)},${Math.floor(z / 20)}`); }
  for (const [x, z] of [[-10, -15], [20, -30], [52, -52], [-70, -48], [-60, -30]]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) visited.add(`${Math.floor(x / 20) + a},${Math.floor(z / 20) + b}`);
  const player = { body, inv, hotbar: [stacks[0].uid, stacks[1].uid, null, stacks[16].uid, stacks[17].uid, null], held: stacks[0].uid, heldStack() { return inv.get(this.held); },
    wear: { body: stacks[18].uid, head: null, cloak: null, feet: null, bed: null }, zone: 'beach', visited, capacity: 25 };

  const knowledgeEntries = [
    { id: 'berry', cat: 'plant', level: 3, name: '野イチゴ', provisional: false, verdict: '食用', features: '実が 下向きに つく。葉は ギザギザで 3 枚 1 組。つぶすと 甘い におい。', uses: '生で 食べられる。干して 保存。釣りの エサにも。', lookalike: ['red_berry_toxic'], foundAt: '1 日目 ジャングルの ふち', sketchColor: '#d9534f' },
    { id: 'red_berry_toxic', cat: 'plant', level: 2, name: 'ドクベニの実', provisional: true, verdict: '', features: '実が 上向き。葉は つるつるで 1 枚ずつ。つぶすと 青くさい。', uses: '', lookalike: ['berry'], foundAt: '2 日目 草原', sketchColor: '#c0392b' },
    { id: 'yomogi', cat: 'plant', level: 3, name: 'ヨモギ', verdict: '薬（止血）', features: '葉の 裏が 白い 綿毛。もむと 強い 香り。', uses: '止血・包帯・蚊よけの 煙・茶。', lookalike: ['numb_weed'], foundAt: '2 日目 草原', sketchColor: '#7da76b' },
    { id: 'numb_weed', cat: 'plant', level: 1, name: '切れこみの 葉の 草', provisional: true, foundAt: '2 日目 草原', sketchColor: '#8bb36f', lookalike: ['yomogi'] },
    { id: 'taro', cat: 'plant', level: 0, name: 'タロイモ' }, { id: 'banana', cat: 'plant', level: 2, name: '野生の バナナ', provisional: true, features: '房の 実。似た 毒は ない。', sketchColor: '#e6c84a', foundAt: '3 日目 湿地' },
    { id: 'coconut', cat: 'plant', level: 3, name: 'ヤシの実', verdict: '食用', features: '緑 ＝ 水が 多い。茶色 ＝ 果肉が 多い。', uses: '水・果肉・殻・繊維・油。', sketchColor: '#7a9b4a', foundAt: '1 日目 浜' },
    { id: 'mushroom_c', cat: 'mushroom', level: 2, name: '白い かさ', provisional: true, features: '柄の 根元が そのまま 細い。', lookalike: ['mushroom_toxic'], sketchColor: '#efe9d8', foundAt: '3 日目 密林' },
    { id: 'mushroom_toxic', cat: 'mushroom', level: 1, name: '白い かさ', provisional: true, lookalike: ['mushroom_c'], sketchColor: '#f1ecdf', foundAt: '3 日目 密林' },
    { id: 'mushroom_a', cat: 'mushroom', level: 0, name: 'キクラゲ' }, { id: 'mushroom_b', cat: 'mushroom', level: 3, name: 'ヒラタケ', verdict: '食用', features: '木に 重なって 生える。', uses: '焼く・煮る。', sketchColor: '#a9a9a0' },
    { id: 'fish_m', cat: 'sea', level: 3, name: '中魚', verdict: '食用', features: '目が 澄み えらが 赤い ＝ 新鮮。', uses: '食べる・干す・あら（エサ）。', sketchColor: '#7fb4d8', foundAt: '1 日目 入り江' },
    { id: 'puffer', cat: 'sea', level: 2, name: 'ハリセン魚？', provisional: true, verdict: '', features: '釣ると 丸く ふくらむ。', sketchColor: '#d6b04a' }, { id: 'urchin', cat: 'sea', level: 0, name: 'ウニ' },
    { id: 'goat', cat: 'animal', level: 1, name: 'ヤギ', sketchColor: '#b9a98c', foundAt: '2 日目 山' }, { id: 'boar', cat: 'animal', level: 0, name: 'イノシシ' },
    { id: 'viper', cat: 'danger', level: 2, name: 'ハブ？', provisional: true, verdict: '危険', features: '三角の 頭、太く 短い。', sketchColor: '#8a7a3c' }, { id: 'jelly', cat: 'danger', level: 0, name: 'クラゲ' },
  ];
  const knowledge = {
    level: (id) => knowledgeEntries.find((e) => e.id === id)?.level ?? 0,
    nameOf: (id) => (id === 'berry' ? '赤い実？' : ITEMS[id]?.name), entries: () => knowledgeEntries, learn() {},
  };

  // crafting
  let firstMade = false;
  const hasAttr = (uids, a, v = 3) => uids.some((u) => (ITEMS[inv.get(u)?.id]?.attrs?.[a] || 0) >= v);
  const crafting = {
    preview(method, uids) {
      if (!uids.length) return { method, candidates: [] };
      const out = { method, candidates: [], missingTool: null };
      if (method === 'carve' && !hasAttr([inv.get(player.held)?.uid], 'sharp', 4)) out.missingTool = '鋭い道具';
      if (method === 'heat') out.missingTool = '火';
      if (method === 'tie' && hasAttr(uids, 'fiber') && uids.length >= 2) {
        out.candidates.push({ kind: 'recipe', id: 'stone_axe', name: '石斧', icon: '🪓', known: true, q: 62, hint: '硬い 柄 ＋ 鋭い 刃 ＋ 紐' });
        out.candidates.push({ kind: 'recipe', id: 'spear', name: '槍', icon: '🔱', known: false, q: 55, hint: '長くて 硬い 物の 先に 鋭い 物を くくる' });
        out.candidates.push({ kind: 'generic', id: 'bundle', name: 'しばった 束', icon: '🎍', known: true, q: 40, hint: '' });
      } else if (method === 'weave' && uids.length >= 3 && hasAttr(uids, 'flex', 5)) out.candidates.push({ kind: 'crude', id: 'mat', name: '編みマット', icon: '🧺', known: true, q: 48, hint: '防水の 面が できる' });
      else if (method === 'knap' && hasAttr(uids, 'hard', 7)) out.candidates.push({ kind: 'recipe', id: 'flake', name: '石刃', icon: '🪨', known: true, q: 66, hint: '割ると 鋭い 破片' });
      else if (method === 'mix') out.candidates.push({ kind: 'generic', id: 'paste', name: 'すりつぶした もの', icon: '🥣', known: true, q: 35, hint: '' });
      return out;
    },
    async craft(method, uids) {
      await new Promise((r) => setTimeout(r, 100));
      const first = !firstMade; firstMade = true;
      return { ok: true, first, stack: { id: 'stone_axe', n: 1, q: 91, stats: { sharp: 6, chop: 7 }, name: '逸品の 石斧' }, recipe: 'stone_axe' };
    },
    book: () => [
      { id: 'stone_axe', name: '石斧', icon: '🪓', known: true, method: 'tie', made: 2, desc: '石の 刃 ＋ 木の 柄 ＋ 紐' },
      { id: 'flake', name: '石刃', icon: '🪨', known: true, method: 'knap', made: 5, desc: '硬い 石を 割る' },
      { id: 'spear', name: '槍', icon: '🔱', known: false, hint: '長くて 硬い 物 ＋ 鋭い もの ＋ 紐' },
      { id: 'bow', name: '？？？', known: false, hint: 'しなる 木と 紐で…' }, { id: 'fire_bow', name: '？？？', known: false, hint: '硬い 棒と 板と 紐' },
    ],
  };
  const building = {
    sites: [{ id: 'campfire', x: 130, z: 80, fire: true }, { id: 'lean_to', x: 120, z: 70, icon: '🏕️' }],
    defs: () => [
      { id: 'campfire', name: 'たき火', icon: '🔥', p: 'P0', minutes: 1, materials: [{ label: '小枝', need: 3, have: 8 }], effect: '暖かさと 明かり。煮炊きが できる。' },
      { id: 'lean_to', name: '差しかけ小屋', icon: '🏕️', p: 'P0', minutes: 40, materials: [{ label: '長い 棒', need: 5, have: 8 }, { label: '屋根材', need: 8, have: 12 }, { label: '紐', need: 4, have: 2 }], effect: '雨よけ 0.75、風よけ 0.5、保温 +1.0℃。1〜2 人。' },
      { id: 'drying_rack', name: '干し台', icon: '🐟', p: 'P0', minutes: 25, materials: [{ label: '棒', need: 6, have: 8 }, { label: '紐', need: 4, have: 2 }], effect: '魚や 肉を 干して 保存。12 個まで。' },
      { id: 'grass_bed', name: '草の 寝床', icon: '🛏️', p: 'P0', minutes: 10, materials: [{ label: '保温材', need: 8, have: 12 }], effect: '睡眠の 質 0.85。地面の 冷えを 断つ。' },
      { id: 'signal_fire', name: '狼煙台', icon: '💨', p: 'P0', minutes: 40, materials: [{ label: '丸太', need: 3, have: 0 }, { label: '枝', need: 10, have: 8 }, { label: '生の 葉', need: 10, have: 12 }, { label: '石', need: 6, have: 2 }], effect: '点火すると 煙が 3 時間。船や 飛行機に 気づかれやすい。' },
      { id: 'a_frame', name: '葉ぶきの 三角小屋', icon: '⛺', p: 'P1', minutes: 100, materials: ['長い 棒 9', '屋根材 16', '紐 8', '敷き草 6'], effect: '雨よけ 0.9、風よけ 0.8、保温 +2.5℃。2 人。' },
      { id: 'raised_bed', name: '高床の 寝台', icon: '🛌', p: 'P1', minutes: 60, materials: ['棒 8', '紐 6', '保温材 8'], effect: '睡眠の 質 1.1。ムカデ 無効。' },
      { id: 'smoker', name: '燻製棚', icon: '♨️', p: 'P1', minutes: 60, materials: ['棒 8', '紐 6', '面 6'], effect: '燻製で 長もち。下に 火が 要る。' },
    ],
    startPlacing(id) { console.log('startPlacing', id); },
  };
  const compState = { trust: 52, affinity: 38, mood: 'happy', inv: [mk('oyster', 3, { fresh: 40 }), mk('berry', 4, { fresh: 60 })] };
  const companion = {
    name: 'ナギ', sheet: rollSheet('nagi', 'fisher', Math.random), liveAvailable: true, present: true, pos: { x: 135, z: 85 },
    hudInfo: () => ({ name: 'ナギ', mood: compState.mood, hp: 88, near: true }),
    status: () => ({ s: { hp: 88, food: 62, water: 55, rest: 40, morale: 75 }, trust: compState.trust, affinity: compState.affinity, mood: compState.mood, conditions: [{ name: '日焼け', icon: '☀️' }], inv: compState.inv }),
    topics: () => [{ id: 'hello', label: 'こんにちは' }, { id: 'weather', label: '天気の はなし' }, { id: 'island', label: 'この島の こと' }, { id: 'family', label: 'ふるさとの はなし' }],
    talk: async (id) => ({ hello: 'やあ。今日も 生きてるね。', weather: '午後は 雲が 出そう。風向きが 変わってきた。', island: '東の 岩場に 潮だまりが あるよ。干潮の 時に 行こう。', family: '……家族か。帰ったら 話すよ。' }[id] || '…'),
    jobs: () => [{ id: 'water', label: '水を くんで きて', icon: '💧', desc: '川まで 行って くる' }, { id: 'wood', label: '薪を 集めて', icon: '🪵' }, { id: 'fish', label: '釣りを お願い', icon: '🎣', desc: '入り江で 1 時間' }, { id: 'night', label: '夜の 火の 番', icon: '🔥', available: false, reason: '信頼が たりない' }],
    ask: async (id) => 'まかせて。', treat: async () => 'ありがとう。', give() {}, receive() {},
  };
  const journal = { days: [
    { day: 1, title: '漂着', lines: [{ hour: 8, text: '浜に 流れ着いた。持ち物は ナイフが ひとつだけ。', kind: 'event' }, { hour: 9.5, text: 'ヤシの実を 3 個 拾った。', kind: 'find' }, { hour: 13, text: '石で 殻を 割って 水を 飲んだ。', kind: 'eat' }, { hour: 19.3, text: '初めて 火を おこせた！', kind: 'fire' }] },
    { day: 2, title: '', lines: [{ hour: 7, text: '朝。波の 音で 目が 覚めた。', kind: 'sleep' }, { hour: 11, text: '小川を 見つけた。水は 澄んでいる。', kind: 'find' }, { hour: 15, text: '貝を 食べたら お腹が…', kind: 'sick' }] },
    { day: 3, lines: [{ hour: 8, text: '雨が 降りそうだ。小屋を 建てよう。', kind: 'weather' }, { hour: 12, text: '差しかけ小屋が 完成した。', kind: 'build' }] },
  ], stats: () => ({ '過ごした 日数': 3, '作った もの': 7, '釣った 魚': 4, '歩いた 距離': '3.2 km', '治した 病気・ケガ': 1 }) };

  const actions = {
    eatCard: (uid) => {
      const s = inv.get(uid); const d = itemDef(s.id);
      const unknown = s.id === 'berry';
      return { name: d.name, foodGain: d.food?.food ?? 5, waterGain: d.food?.water ?? 0,
        risk: unknown ? { p: 0.3, band: 2, label: 'あやしい', shown: 'unknown' } : (opts.risk === 'percent' ? { p: 0.048, band: 1, label: '少し心配', shown: 'percent' } : { p: 0.12, band: 2, label: 'あやしい', shown: 'band' }),
        warnings: s.fresh < 40 ? ['鮮度が 落ちています。生は 危険'] : [] };
    },
    eat(uid, o) { console.log('eat', uid, o); bus.emit('toast', { text: o?.nibble ? '少し かじった' : '食べた', kind: 'good' }); },
    drink(uid) { bus.emit('toast', { text: '水を 飲んだ', kind: 'good' }); }, equip(uid) { player.held = uid; }, wear() {}, use() {}, inspect() { bus.emit('toast', { text: '調べた：特に 変わった ところは ない', kind: 'info' }); }, treat() {},
    drop(uid, n) { const s = inv.get(uid); if (s) { s.n -= n; if (s.n <= 0) stacks.splice(stacks.indexOf(s), 1); } }, giveToCompanion() { bus.emit('toast', { text: 'ナギに 渡した', kind: 'info' }); }, fillContainer() {},
    sleepCheck: () => (opts.sleepBad ? { ok: false, reasons: ['動物が 20m 以内に います'] } : { ok: true, reasons: ['雨の 夜に 屋根が ありません（睡眠の 質 ×0.5）'] }),
    sleep: async (arg) => console.log('sleep', arg),
  };
  const weather = { name: '晴れ', type: 'clear', windSpeed: 5, windDir: 1.2, rain: 0, airTemp: () => 28 };

  const game = {
    bus, clock, setup: { days: 7, control: 'mouse', subtitles: true }, diff: { name: 'ふつう' }, sys: { weather, player, knowledge, crafting, building, companion, journal }, actions,
    world: { terrain: { zoneAt }, layout: LAYOUT }, player: { pos: { x: 90, y: 2, z: 40 }, yaw: 0.6 }, paused: false, started: true,
    audio: { volume: {}, setVolume(b, v) { this.volume[b] = v; } }, input: { sensitivity: 1, enabled: true, touch: false, emit: (n) => console.log('input.emit', n), exitLock() {} },
    renderer: { quality: 'mid', setQuality(q) { this.quality = q; } },
    pause(v) { this.paused = v; }, hasSave: () => true, save: () => true, retire() { console.log('retire'); },
    async newGame(setup) { console.log('newGame', JSON.stringify(setup)); await new Promise((r) => setTimeout(r, 500)); game.setup = setup; }, startAmbientPreview() {},
    companionAvailable: (id) => id !== 'gen', testApiKey: async (k) => (k.length > 6 ? { ok: true, model: 'gemini-live' } : { ok: false, reason: 'キーが 短すぎます' }),
    prompt: { key: 'E', text: 'ヤシの実を 落とす', sub: '竹｜硬い 6・長い 9・しなる 5・容器 5' },
    activity: null, goals: [{ text: '水を さがす（ヤシの実 か 川）', done: true }, { text: '性質タグを 見て 何か 1 つ 作る', done: false }, { text: '火を おこす', done: false }, { text: '食べ物を 1 つ 焼く', done: false }],
    startGestures: async () => { game.hands = game.hands || makeHands(); game.hands.status = 'ready'; game.hands.ready = true; }, stopGestures: async () => { if (game.hands) { game.hands.status = 'off'; game.hands.ready = false; } },
  };
  function makeHands() {
    return { status: 'off', ready: false, cursor: { x: 0.5, y: 0.5, visible: false, pinch: false, clicked: false }, events: [],
      drawPreview(c) { const g = c.getContext('2d'); g.fillStyle = '#17383e'; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = '#ffd36b'; g.lineWidth = 3; g.beginPath(); g.arc(c.width / 2 + Math.sin(performance.now() / 400) * 30, c.height / 2, 34, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText('mock camera', 10, 22); } };
  }
  if (opts.hands) { game.hands = makeHands(); game.hands.status = 'ready'; game.hands.ready = true; }
  return game;
}
