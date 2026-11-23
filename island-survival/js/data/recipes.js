// data/recipes.js — 錬成 (crafting): the 7 methods (DESIGN.md §11.4) and the 64 templates (§11.5 A–E).
//
// A template is a set of slots; a slot is a property condition, so anything that meets it fits (§11.1).
//   slot = { key, name, need: { attr: min | [min, max] }, n = 1,
//            tags?: [...]  (the item has one of these material tags)      ┐ gates: AND-ed with `need`
//            ids?: [...]   (the item id is one of these)                  │
//            maxW?: kg     (small / thin things)                          │
//            water?: cups  (a container holding at least this much fresh water)
//            anyOf?: [{ need?, tags?, ids? }, …]  alternatives (OR); each is merged over the slot's own need
//            optional?     (can be left out; raises Q a little, §11.7)
//            consume?: false  (a tool that is used, not used up: hammer stone, pot, needle) — may be the held item
//            bind?         (a cord: its fiber vanishes into the knot, §11.4 tie)
//            more?         (over-count bonus, §11.7; default on for n ≥ 2)   max?: units taken at most (no bonus)
//            back?         (share returned when taken apart, §11.7: cords / handles 0.8, blades 1)
//            qBonus?       (flat Q instead of the optional weight: bone needle +10)
//            hint?         (text in the 「？？？」 hint instead of the property tag) }
// Range conditions (`long: [1, 6]`) are gates for the fit; only `≥` conditions enter the §11.7 fit average
// (that is what the worked example of §11.7 does: the handle's fit is hard 4 / 5 = 0.8, long 1–6 is not counted).
//
// recipe = { name, group (A–E), method, p, minutes, slots | variants: [{ method, slots, noBlade? }], out: { id, n },
//            stats(Q, s, x) → performance numbers (s = slot views by key, null when an optional slot is empty;
//            x = { score, extra, crude, notch, attrs (inherited), ctx }). Keys that are attribute names
//            (except `tinder`, which is the §10.1 tinder multiplier) also set the result's attributes.
//            setAttrs: fixed attribute values, special: handled in sim/crafting.js, perf: the 性能 column }
// A slot view: { n, items: [{ id, attrs, q, tags, stack, def }], a: max attrs, avg: mean attrs, ids, tags, first }.

export const ATTRS = ['hard', 'sharp', 'long', 'flex', 'fiber', 'burn', 'tinder', 'waterproof', 'container', 'heavy', 'sticky',
  'toxic', 'insul', 'float', 'edible', 'med', 'heatproof', 'absorb', 'shine', 'spark', 'scent'];

/** display tags of §11.2 */
export const ATTR_TAG = {
  hard: '硬い', sharp: '鋭い', long: '長い', flex: 'しなる', fiber: '紐に なる', burn: '燃える', tinder: '火口に なる',
  waterproof: '水を 通さない', container: '容器', heavy: '重い', sticky: 'くっつく', toxic: '毒', insul: '保温', float: '浮く',
  edible: '食べられる', med: '薬効', heatproof: '熱に 強い', absorb: '吸う・こす', shine: '光る', spark: '火花が 出る', scent: 'におう',
};
/** shorter tags for the 「？？？（結ぶ：長い ＋ 鋭い ＋ 紐）」 hints */
const HINT_TAG = { ...ATTR_TAG, fiber: '紐', tinder: '火口', waterproof: '防水', heatproof: '耐熱', absorb: '吸う', spark: '火花' };

// ---------------------------------------------------------------- methods (§11.4)
// hand: the tool the method needs — held: must be in the hand; inputOrHeld: on the bench or in the hand.
export const METHODS = {
  tie: { id: 'tie', name: '結ぶ・組む', short: '結ぶ', icon: '🪢', gesture: '結ぶ', needs: '紐に なる 物（fiber ≥ 3）が 1 つ 以上', bindMin: 3, minUnits: 2 },
  carve: { id: 'carve', name: '削る・切る', short: '削る', icon: '🔪', gesture: '切る・削る', needs: '鋭い 道具（sharp ≥ 4）を 手に 持つ',
    hand: { need: { sharp: 4 }, where: 'held', label: '鋭い 刃物（sharp 4 以上）' }, minUnits: 1 },
  weave: { id: 'weave', name: '編む・なう', short: '編む', icon: '🧺', gesture: '編む', needs: 'fiber ≥ 2 または flex ≥ 5 の 物が 3 つ 以上', minUnits: 3 },
  mix: { id: 'mix', name: '混ぜる・こねる・すりつぶす', short: '混ぜる', icon: '🥣', gesture: '混ぜる', needs: '2 つ 以上（粉・液・やわらかい 物）', minUnits: 2 },
  knap: { id: 'knap', name: '割る・砕く・叩く', short: '割る', icon: '🪨', gesture: '割る／打ち欠く', needs: '硬い 叩く 物（hard ≥ 7、heavy ≥ 4）と 台',
    hand: { need: { hard: 7, heavy: 4 }, where: 'inputOrHeld', label: '叩き石（hard 7・heavy 4 以上）' }, minUnits: 1 },
  heat: { id: 'heat', name: '火に かける（焼く・煮る・蒸し焼き）', short: '火に かける', icon: '🔥', gesture: '置く → 待つ → 取り出す', needs: '火（§10）。煮るには 容器',
    fire: true, minUnits: 1 },
  pack: { id: 'pack', name: '詰める・重ねる・ぬる', short: '詰める', icon: '📦', gesture: '置く（つまんで はなす）', needs: '容器 または 土台に なる 物 ＋ 中身', minUnits: 2 },
};
export const METHOD_IDS = Object.keys(METHODS);

// ---------------------------------------------------------------- slot helpers
const S = (key, name, need = {}, o = {}) => ({ key, name, need, n: 1, ...o });
const cord = (min = 3, o = {}) => S('cord', '紐', { fiber: min }, { bind: true, back: 0.8, ...o });
const glue = () => S('glue', '接着', { sticky: 6 }, { optional: true });
const hammer = () => S('hammer', '叩き石', { hard: 7, heavy: 4 }, { consume: false, hint: '叩き石' });
const needle = () => S('needle', '骨針', {}, { ids: ['bone_needle'], optional: true, consume: false, qBonus: 10 });
const BAIT = [{ need: { edible: 1 } }, { need: { scent: 4 } }];
const WOOD = ['wood'];
const G = (s) => (s.glue ? 1.5 : 1);                    // "接着" slot: durability ×1.5 (§11.5 knife, pitch)
const tanned = (it) => !!(it.stack?.stats?.tanned || it.stack?.proc === 'tanned');
const lineStrength = (v) => v.first.stack?.stats?.strength ?? (v.a.fiber || 0) * 0.8;
const AREA = { tarp: 6, sailcloth: 6, mat: 3 };          // rain catcher: sheet area in "big leaves"

/** §11.4 knap: flake sharpness = min(10, material sharp (round stone counts as 2) + 2 + 2s) */
export function flakeSharp(baseSharp, score = 0.5) {
  return Math.min(10, Math.max(baseSharp || 0, 2) + 2 + Math.round(2 * (score ?? 0.5)));
}

/** §10.1 / §22.9 numbers for the friction kits (read by sim/fires.js ignitionChance: base, board, notch) */
function kitStats(kind, base, s, x, uses) {
  const board = s.board.first.def?.board ?? 1.0;
  const notch = !!x.notch;
  return { kind, base: +base.toFixed(3), board, notch, noNotch: !notch, baseRate: +(base * board * (notch ? 1 : 0.3)).toFixed(3), durability: uses };
}

/** §11.5 D water filter: Q = 20 + 5 × Σabsorb(top 3 layers) × (3 kinds 1.0 / 2 kinds 0.8 / 1 kind 0.6), ≤ 100; no charcoal ≤ 55 */
export function filterQ(layers) {
  const top = [...layers].sort((a, b) => (b.attrs.absorb || 0) - (a.attrs.absorb || 0)).slice(0, 3);
  const sum = top.reduce((a, l) => a + (l.attrs.absorb || 0), 0);
  const kinds = new Set(top.map((l) => l.id)).size;
  const mul = kinds >= 3 ? 1.0 : kinds === 2 ? 0.8 : 0.6;
  let q = Math.min(100, 20 + 5 * sum * mul);
  if (!top.some((l) => l.id === 'charcoal' || l.id === 'charcoal_powder')) q = Math.min(q, 55);
  return Math.round(q);
}

// ---------------------------------------------------------------- templates (§11.5)
const L = [];
const R = (id, o) => L.push({ id, out: { id, n: 1 }, ...o });

// A. 刃物・武器
R('flake', { name: '石刃', group: 'A', method: 'knap', p: 'P0', minutes: 5, special: 'flake',
  slots: [S('core', '核', { hard: 7 }, { tags: ['stone'] }), hammer()],
  qScore: (sc, s) => 20 + 60 * sc + (s.core.ids.includes('obsidian') ? 20 : 0),   // §9.3 knapping minigame
  stats: (Q, s, x) => ({ sharp: flakeSharp(s.core.a.sharp, x.score), heavy: Math.floor((s.core.a.heavy || 0) / 2), carve: -10, butcher: 0.8, durability: 15 + Q / 4 }),
  perf: 'sharp ＝ 核の sharp ＋2〜4。そのまま 手持ちの 刃物（削りの 品質 −10）。耐久 15 + Q/4' });
R('knife_made', { name: '手づくりナイフ', group: 'A', method: 'tie', p: 'P0', minutes: 15,
  slots: [S('blade', '刃', { sharp: 5 }, { back: 1 }), S('handle', '柄', { hard: 3, long: [1, 6] }, { back: 0.8 }), cord(3), glue()],
  stats: (Q, s) => ({ sharp: s.blade.a.sharp, carve: -10 + Q / 5, melee: 4 + Q / 12, butcher: Q >= 50 ? 0.9 : 0.8, durability: (40 + Q) * G(s) }),
  perf: '切れ味 ＝ 刃の sharp。削りの 品質補正 −10 + Q/5。近接 4 + Q/12。耐久 40 + Q（接着 ×1.5）' });
R('axe_made', { name: '石斧', group: 'A', method: 'tie', p: 'P0', minutes: 30,
  slots: [S('blade', '刃', { sharp: 4, hard: 7, heavy: 3 }, { back: 1 }), S('handle', '柄', { hard: 4, long: [4, 7] }, { back: 0.8 }), cord(5), glue()],
  stats: (Q, s) => ({ sharp: s.blade.a.sharp, chop: 6 + Q / 10 + (s.blade.tags.includes('metal') ? 4 : 0), melee: 8 + Q / 8, durability: (50 + Q) * G(s) }),
  perf: '伐採力 6 + Q/10（金属の 刃 ＋4）。近接 8 + Q/8。耐久 50 + Q' });
R('spear_wood', { name: '木の 槍', group: 'A', method: 'carve', p: 'P0', minutes: 10, point: true,
  slots: [S('shaft', '棒', { long: 7, hard: 4 })],
  stats: (Q) => ({ power: 6 + Q / 10, durability: 20 + Q / 3 }),
  perf: '威力 6 + Q/10（火で 焼き締め ＋2）。耐久 20 + Q/3' });
R('spear_tip', { name: '穂先つきの 槍', group: 'A', method: 'tie', p: 'P0', minutes: 20,
  slots: [S('shaft', '棒', { long: 7, hard: 4 }, { back: 0.8 }), S('tip', '穂先', { sharp: 5, hard: 5 }, { back: 1 }), cord(4), glue()],
  stats: (Q, s) => ({ sharp: s.tip.a.sharp, power: 10 + s.tip.a.sharp + Q / 8, range: 15, durability: (30 + Q / 2) * G(s) }),
  perf: '威力 10 + 穂先の sharp + Q/8（最大 約 32）。投げられる（15m）。耐久 30 + Q/2' });
R('harpoon', { name: '銛', group: 'A', method: 'tie', p: 'P0', minutes: 25,
  slots: [S('shaft', '棒', { long: 7 }, { back: 0.8 }), S('barbs', 'かえし', { sharp: 5 }, { n: 2, max: 3, more: false, maxW: 0.3, back: 1 }), cord(5)],
  stats: (Q, s) => ({ hitRadius: 1 + Q / 200, barbed: 1, power: 8 + Q / 10 + (s.barbs.n >= 3 ? 1 : 0), durability: 25 + Q / 2 }),
  perf: '魚突きの 当たり 半径 ×(1 + Q/200)、刺した 魚が 外れない。耐久 25 + Q/2' });
R('bow_made', { name: '手づくりの 弓', group: 'A', method: 'tie', p: 'P0', minutes: 40,
  slots: [S('stave', '弓幹', { flex: 5, long: 7, hard: 4 }, { back: 0.8 }), S('string', '弦', { fiber: 7, long: 6 }, { bind: true, back: 0.8 })],
  stats: (Q) => ({ power: 10 + Q / 5, speed: 0.6 + Q / 250, range: Math.round(40 * (0.6 + Q / 250)), durability: 40 + Q }),
  perf: '威力 10 + Q/5、初速 ×(0.6 + Q/250)。弦の 耐久 40 + Q 射' });
R('arrow', { name: '矢', group: 'A', method: 'tie', p: 'P0', minutes: 20, out: { id: 'arrow', n: 3 },
  slots: [S('shaft', '矢軸', { long: [4, 7], hard: 3 }, { n: 3, more: false }), S('head', '矢じり', { sharp: 5 }, { n: 3, optional: true, more: false }),
    S('fletch', '羽', {}, { n: 3, optional: true, more: false, tags: ['feather'] }), S('bind', '紐／接着', {}, { anyOf: [{ need: { fiber: 3 } }, { need: { sticky: 5 } }], bind: true, hint: '紐' })],
  stats: (Q, s) => ({ sharp: s.head ? s.head.a.sharp : 0, powerMul: s.head ? 1 : 0.6, spread: s.fletch ? 1 : 2, recover: +((40 + Q / 2) / 100).toFixed(2) }),
  perf: '1 回で 3 本。矢じり なし：威力 ×0.6。羽 なし：ばらつき 2 倍。回収率 40 + Q/2 %' });
R('club', { name: 'こん棒', group: 'A', method: 'carve', p: 'P0', minutes: 5,
  slots: [S('body', '棒', { hard: 5, long: [4, 6], heavy: 3 })],
  stats: (Q) => ({ melee: 8 + Q / 10, durability: 40 + Q / 2 }),
  perf: '近接 8 + Q/10。やぶを 叩く（ヘビよけ）' });
R('hammer', { name: '石の ハンマー', group: 'A', method: 'tie', p: 'P1', minutes: 15,
  slots: [S('head', '頭', { hard: 8, heavy: 5 }, { back: 1 }), S('handle', '柄', { long: [3, 6] }, { back: 0.8 }), cord(5)],
  stats: (Q) => ({ buildMul: 0.85, knapBonus: 0.1, melee: 6 + Q / 12, durability: 60 + Q }),
  perf: '杭打ち・建築の 所要 ×0.85、割る の スコア ＋0.1。耐久 60 + Q' });
R('sling', { name: '投石ひも', group: 'A', method: 'tie', p: 'P2', minutes: 15,
  slots: [S('pouch', '受け', { flex: 5 }, { tags: ['cloth', 'hide', 'mat'] }), S('cords', '紐', { fiber: 5 }, { n: 2, more: false, bind: true, back: 0.8 })],
  stats: (Q) => ({ speedMin: 15, speedMax: 30, power: 12, durability: 30 + Q / 2 }),
  perf: '石の 初速 15〜30 m/s、威力 12' });
R('poison_tip', { name: '毒を ぬった 矢・槍', group: 'A', method: 'pack', p: 'P1', minutes: 5, special: 'coat', out: { from: 'weapon', n: 1 },
  slots: [S('weapon', '武器', {}, { ids: ['arrow', 'arrow_pro', 'spear_wood', 'spear_tip', 'harpoon'], max: 3, more: false, hint: '矢・槍' }), S('poison', '毒', { toxic: 6 })],
  stats: (Q, s) => ({ toxic: s.poison.a.toxic - 1, poisoned: 1, slowSec: 60, downMin: 3, hpMax: 50, meatLoss: 1, unsafe: 0.1 }),
  perf: '当たった 獲物は 60 秒後に 動きが 半分、3 分後に 倒れる（HP 50 以下）' });

// B. 漁の 道具・罠
R('hook', { name: '釣り針', group: 'B', method: 'carve', p: 'P0', minutes: 10, point: true,
  slots: [S('mat', '素材', {}, { anyOf: [{ need: { sharp: 3, hard: 3 } }, { need: { hard: 5 }, tags: ['metal'] }], maxW: 0.3, hint: '鋭い 小物' })],
  stats: (Q, s, x) => ({ bite: Math.max(3, x.attrs.sharp || 0), grace: +(Q / 500).toFixed(3), durability: 10 + Q / 4 }),
  perf: 'かかり ＝ sharp、バレにくさ ＝ Q（合わせの 猶予 +Q/500 秒）。耐久 10 + Q/4 匹' });
R('line', { name: '釣り糸', group: 'B', method: 'weave', p: 'P0', minutes: 15,
  slots: [S('fibers', '細い 繊維', { fiber: 4 }, { n: 3, maxW: 0.1 })],
  stats: (Q, s) => { const f = Math.min(10, s.fibers.a.fiber + 2); return { fiber: f, long: 8, strength: +(f * (0.6 + Q / 250)).toFixed(2) }; },
  perf: '糸の 強さ ＝ fiber × (0.6 + Q/250)' });
R('rod_made', { name: '手づくりの 竿', group: 'B', method: 'tie', p: 'P0', minutes: 10,
  slots: [S('pole', '竿', { flex: 4, long: 7 }, { back: 0.8 }), S('line', '糸', {}, { ids: ['line'], bind: true, back: 0.8, hint: '釣り糸' }),
    S('hook', '針', {}, { ids: ['hook', 'hook_pro'], back: 1, hint: '釣り針' }), S('float', 'ウキ', { float: 5 }, { optional: true, maxW: 0.6, back: 1 }),
    S('sinker', 'おもり', { heavy: 4 }, { optional: true, maxW: 1.0, back: 1 })],
  stats: (Q, s) => ({ cast: +(0.7 + (s.pole.a.flex || 0) / 20).toFixed(2), bobber: s.float ? 0.15 : 0, sinker: s.sinker ? 3 : 0,
    lineStrength: +lineStrength(s.line).toFixed(2), hookBite: s.hook.a.sharp || 0, durability: 50 + Q }),
  perf: '飛距離 ×(0.7 + flex/20)。ウキ：猶予 ＋0.15 秒。おもり：飛距離 ＋3m' });
R('lure', { name: 'ルアー', group: 'B', method: 'tie', p: 'P1', minutes: 15,
  slots: [S('shiny', '光る 物', { shine: 4 }, { maxW: 0.3, back: 1 }), S('hook', '針', {}, { ids: ['hook', 'hook_pro'], back: 1, hint: '釣り針' }), S('feather', '羽', {}, { optional: true, tags: ['feather'] })],
  stats: (Q, s) => ({ baitMul: +(0.7 + Q / 400 + (s.feather ? 0.1 : 0)).toFixed(3), durability: 15 + Q / 4 }),
  perf: 'エサ倍率 0.7 + Q/400（羽つき ＋0.1）、エサが 減らない' });
R('hand_net', { name: 'タモ（手網）', group: 'B', method: 'weave', p: 'P1', minutes: 30,
  slots: [S('frame', '枠', { flex: 5, long: 5 }, { back: 0.8 }), S('mesh', '網', { fiber: 4 }, { n: 4 }), S('handle', '柄', { long: 5, hard: 4 }, { optional: true })],
  stats: (Q) => ({ dropLarge: 0, grabMul: 1.5, durability: 30 + Q / 2 }),
  perf: '大魚の 取り込み 落とし 0%。潮だまりの 手づかみ 成功 ×1.5' });
R('cast_net_made', { name: '手づくりの 投網', group: 'B', method: 'weave', p: 'P1', minutes: 120,
  slots: [S('cords', '紐', { fiber: 5 }, { n: 10 }), S('weights', 'おもり', { heavy: 4 }, { n: 4, maxW: 1.0, more: false })],
  stats: (Q) => ({ radiusMul: +(0.5 + Q / 200).toFixed(3), durability: 20 + Q / 3 }),
  perf: '広がり 半径 ×(0.5 + Q/200)。耐久 20 + Q/3 投' });
R('fish_trap', { name: '魚かご（うけ）', group: 'B', method: 'weave', p: 'P1', minutes: 60,
  slots: [S('withies', '編み材', { flex: 5, long: 5 }, { n: 8 }), S('ties', '紐', { fiber: 3 }, { n: 2, more: false, bind: true })],
  stats: () => ({ durability: 20 }), perf: '§9.5。耐久 20 回' });
R('snare', { name: 'くくり罠', group: 'B', method: 'tie', p: 'P1', minutes: 20,
  slots: [S('noose', '輪', { fiber: 6 }, { bind: true, back: 0.8 }), S('spring', 'ばね木', { flex: 5, long: 6 }, { back: 0.8 }), S('stake', '杭', { hard: 4 }, { back: 0.8 }),
    S('bait', 'エサ', {}, { anyOf: BAIT, optional: true })],
  stats: (Q, s) => ({ breakChance: 0.3, bait: s.bait ? 1 : 0, durability: 10 }), perf: '§11.6。捕獲ごとに 30% で 紐が 切れる' });
R('deadfall', { name: '石落とし', group: 'B', method: 'tie', p: 'P1', minutes: 15,
  slots: [S('weight', '重し', { heavy: 8 }, { back: 1 }), S('sticks', '支え棒', { hard: 2, long: [2, 4] }, { n: 3, more: false, back: 0.8 }), S('bait', 'エサ', {}, { anyOf: BAIT, hint: 'エサ' })],
  stats: () => ({ breakChance: 0.1, durability: 10 }), perf: '§11.6。ネズミ・トカゲ・ヤシガニ。エサ 必須' });
R('crab_pot', { name: 'カニかご', group: 'B', method: 'weave', p: 'P2', minutes: 40,
  slots: [S('withies', '編み材', { flex: 5 }, { n: 6 }), S('bait', 'エサ', {}, { anyOf: BAIT, hint: 'エサ' })],
  stats: () => ({ catchMin: 1, catchMax: 3, durability: 20 }), perf: '潮 1 回で カニ 1〜3' });
R('float_made', { name: 'ウキ', group: 'B', method: 'carve', p: 'P1', minutes: 5,
  slots: [S('mat', '素材', { float: 5 }, { maxW: 0.6 })],
  stats: () => ({ bobber: 0.15 }), perf: 'アタリが 見やすい（猶予 ＋0.15 秒）' });

// C. 紐・布・かご・服
R('cord', { name: '縄', group: 'C', method: 'weave', p: 'P0', minutes: 10,
  slots: [S('fibers', '繊維', { fiber: 2 }, { n: 3 })],
  stats: (Q, s) => ({ fiber: Math.min(10, s.fibers.a.fiber + 2), long: 8 }),
  perf: 'fiber ＝ min(10, 最大 ＋ 2)（草 → 5、つる → 8）、long 8' });
R('rope_made', { name: '丈夫な ロープ', group: 'C', method: 'weave', p: 'P1', minutes: 20,
  slots: [S('cords', '縄', {}, { n: 3, anyOf: [{ ids: ['cord'] }, { need: { fiber: 8, long: 6 } }], hint: '縄' })],
  stats: (Q, s) => { const f = Math.min(10, s.cords.a.fiber + 2); return { fiber: f, long: 10, climb: f >= 9 ? 1 : 0 }; },
  perf: 'fiber ＝ min(10, 縄の fiber ＋ 2)、long 10。崖に 使えるのは fiber 9 以上' });
R('mat', { name: '編みマット', group: 'C', method: 'weave', p: 'P0', minutes: 25,
  slots: [S('sheets', '面に なる 物', {}, { n: 6, anyOf: [{ need: { fiber: 2 } }, { tags: ['leaf'] }], hint: '紐か 葉' })],
  stats: (Q, s, x) => ({ waterproof: x.attrs.waterproof || 0, insul: x.attrs.insul || 0 }),
  perf: 'waterproof・insul ＝ 平均 ＋1（Q 50 以上で ＋2）。屋根材・敷物・帆・壁・風よけの 素材' });
R('basket', { name: 'かご', group: 'C', method: 'weave', p: 'P1', minutes: 30, shape: 'basket',
  slots: [S('withies', '編み材', { flex: 5 }, { n: 6 })],
  stats: (Q, s, x) => ({ container: Math.min(7, 2 + s.withies.n / 4), capacity: 10, leaks: (x.attrs.waterproof || 0) < 7 ? 1 : 0 }),
  perf: '置き容器（食料 10 個）。容器 ＝ 2 + 本数/4（上限 7）' });
R('backpack', { name: '背負いかご', group: 'C', method: 'weave', p: 'P1', minutes: 60, shape: 'basket',
  slots: [S('withies', '編み材', { flex: 5 }, { n: 8 }), S('straps', '紐', { fiber: 5 }, { n: 2, more: false, bind: true })],
  stats: (Q) => ({ carry: Math.min(8, 4 + Q / 25) }), perf: '所持上限 ＋4 + Q/25 kg（最大 ＋8）' });
R('leaf_cape', { name: '葉の マント（みの）', group: 'C', method: 'weave', p: 'P0', minutes: 40,
  slots: [S('leaves', '葉', { waterproof: 4 }, { n: 6 }), S('ties', '紐', { fiber: 3 }, { n: 2, more: false, bind: true })],
  stats: (Q) => ({ warmth: 1.0, rain: +Math.min(0.8, 0.4 + Q / 250).toFixed(3), days: 10 }), perf: '雨よけ率 0.4 + Q/250（最大 0.8）、保温 ＋1.0℃' });
R('leaf_hat', { name: '葉の 笠', group: 'C', method: 'weave', p: 'P1', minutes: 15,
  slots: [S('leaves', '葉', { waterproof: 4 }, { n: 3 }), S('tie', '紐', { fiber: 3 }, { bind: true })],
  stats: () => ({ rain: 0.15, sun: 0.5, days: 8 }), perf: '雨よけ 0.15、日差し ×0.5' });
R('sandals', { name: '草ぞうり', group: 'C', method: 'weave', p: 'P1', minutes: 20,
  slots: [S('fibers', '繊維', { fiber: 3 }, { n: 4 })],
  stats: (Q) => ({ days: 4 + Q / 20 }), perf: '靴が 壊れた 後の 足を 守る。耐久 4 + Q/20 日' });
R('fur_vest', { name: '毛皮の 上着', group: 'C', method: 'tie', p: 'P1', minutes: 90,
  slots: [S('hides', '皮', { insul: 6 }, { n: 2, more: false, back: 0.8 }), S('thread', '糸', { fiber: 6 }, { n: 2, more: false, bind: true }), needle()],
  qBonus: (s) => (s.hides.items.every(tanned) ? 20 : 0),
  stats: (Q, s) => ({ warmth: 3 + Q / 50, rain: 0.3, days: 60, rotDays: s.hides.items.every(tanned) ? 0 : 5 }),
  perf: '保温 ＋3 + Q/50 ℃。なめした 皮は Q ＋20、なめさないと 5 日で 腐る' });
R('blanket', { name: '掛け布団', group: 'C', method: 'weave', p: 'P1', minutes: 30,
  variants: [
    { method: 'weave', slots: [S('insul', '保温材', { insul: 4 }, { n: 6 }), S('tie', '紐', { fiber: 3 }, { optional: true, bind: true })] },
    { method: 'tie', slots: [S('hides', '毛皮', { insul: 6 }, { n: 2, more: false, tags: ['hide'] }), needle()] }],
  stats: (Q, s) => { const fur = !!s.hides; const avg = fur ? s.hides.avg.insul : s.insul.avg.insul; return { warmth: +Math.min(6, avg * 0.6).toFixed(2), days: fur ? 90 : 15 }; },
  perf: '保温 ＝ 平均 insul × 0.6（草 3.0、毛皮 6.0 上限）。寝るときに 使う' });
R('bandage', { name: '包帯', group: 'C', method: 'carve', p: 'P0', minutes: 5,
  variants: [
    { method: 'carve', noBlade: true, slots: [S('cloth', '布', { absorb: 4, fiber: 3 }), S('herb', '薬草', { med: 5 }, { optional: true })] },
    { method: 'mix', slots: [S('cloth', '布', { absorb: 4, fiber: 3 }), S('herb', '薬草', { med: 5 })] }],
  stats: (Q, s) => ({ stopBleed: 1, infection: 0.2, herbs: s.herb ? s.herb.ids : [] }), perf: '§6.3。出血を 止め、感染率 ×0.2。薬草入りは その 効果も' });
R('water_skin', { name: '皮の 水袋', group: 'C', method: 'tie', p: 'P1', minutes: 60,
  slots: [S('hide', '皮', {}, { tags: ['hide'], back: 0.8 }), S('thread', '糸', { fiber: 6 }, { bind: true }),
    S('seal', '目止め', {}, { anyOf: [{ need: { sticky: 6 } }, { ids: ['beeswax', 'fat', 'oil', 'pitch'] }], hint: 'くっつく' }), needle()],
  stats: (Q) => ({ liters: 1.5, leak: Q < 40 ? 0.1 : 0 }), perf: '1.5L。Q < 40 は 1h に 10% もれる' });

// D. 容器・水・火
R('shell_bowl', { name: 'ヤシ殻の 器', group: 'D', method: 'knap', p: 'P0', minutes: 3, special: 'coconut', out: { id: 'shell_bowl', n: 2 },
  slots: [S('nut', 'ヤシの実', {}, { ids: ['coconut', 'coconut_open'] }),
    S('breaker', '石／刃物', {}, { anyOf: [{ need: { hard: 7, heavy: 4 } }, { need: { sharp: 4 } }], consume: false, hint: '石か 刃物' })],
  stats: () => ({ liters: 0.25 }), perf: '殻 2 つ（0.25L）＋ 果肉 ＋ ヤシの 水。火には かけられない' });
R('bamboo_cup', { name: '竹筒（水筒）', group: 'D', method: 'carve', p: 'P0', minutes: 10,
  slots: [S('tube', '竹', {}, { ids: ['bamboo'] }), S('plug', '栓', {}, { optional: true, anyOf: [{ tags: ['wood'] }, { tags: ['cloth'] }, { tags: ['leaf'] }], maxW: 0.5 })],
  stats: (Q, s) => ({ liters: 0.5, heatproof: 5, maxBoils: 3, lid: s.plug ? 1 : 0 }), perf: '0.5L。直火 3 回まで（煮沸 可）' });
R('clay_pot', { name: '土器の 鍋', group: 'D', method: 'mix', p: 'P1', minutes: 30, special: 'greenware', out: { id: 'clay_pot_raw', n: 1 },
  slots: [S('clay', '粘土', {}, { n: 4, more: false, ids: ['clay'] }), S('temper', '混ぜ物', {}, { optional: true, ids: ['sand', 'shell_powder'] })],
  stats: (Q, s) => ({ temper: s.temper ? 1 : 0, dried: 0 }),
  perf: '成形 30 分 → 日陰で 乾燥 12h → 火で 焼成 3h。2L、直火 可。割れる 確率 0.45 − Q/300 −（混ぜ物 0.15）−（乾燥 0.15）' });
R('can_pot', { name: '空き缶の 小鍋', group: 'D', method: 'tie', p: 'P0', minutes: 5,
  slots: [S('can', '空き缶', {}, { ids: ['can'], back: 1 }), S('handle', '取っ手', { fiber: 3 }, { bind: true })],
  stats: () => ({ liters: 0.35, heatproof: 8, durability: 20 }), perf: '0.35L、直火 可（煮沸 1 杯 ずつ）。20 回で 穴' });
R('water_filter', { name: 'ろ過器', group: 'D', method: 'pack', p: 'P0', minutes: 15,
  slots: [S('tube', '筒', { container: 4 }, { back: 1 }), S('layers', '層', { absorb: 3 }, { n: 3, more: false })],
  q: (s) => filterQ(s.layers.items),
  stats: (Q) => ({ filterMul: +(0.6 - 0.4 * Q / 100).toFixed(3), durability: 50 }),
  perf: 'Q ＝ 20 + 5 × Σabsorb（上位 3 層）×（3 種 1.0 / 2 種 0.8 / 1 種 0.6）。炭なしは 上限 55。50 杯で 炭を 交換' });
R('solar_still', { name: '太陽熱の 蒸留器', group: 'D', method: 'pack', p: 'P1', minutes: 30,
  slots: [S('sheet', '防水の 面', { waterproof: 8 }, { ids: ['tarp', 'sailcloth', 'mat'], back: 1 }), S('catch', '受け容器', { container: 3 }, { back: 1 }),
    S('weight', 'おもり石', { heavy: 4 }, { tags: ['stone'], back: 1 })],
  stats: () => ({ sunny: 0.1, cloudy: 0.03 }), perf: '晴れ 0.1 L/h（06–18 時）、くもり 0.03。海水・尿から 真水' });
R('rain_catcher', { name: '雨水受け（小）', group: 'D', method: 'tie', p: 'P0', minutes: 10,
  slots: [S('sheet', '面', { waterproof: 5 }, { more: true, back: 1 }), S('poles', '棒', { long: 4, hard: 3 }, { n: 2, more: false, back: 0.8 }),
    S('vessel', '容器', { container: 3 }, { back: 1 })],
  stats: (Q, s) => { const area = s.sheet.items.reduce((a, i) => a + (AREA[i.id] || 1), 0); return { area, light: +(0.05 * area).toFixed(2), heavy: +(0.2 * area).toFixed(2) }; },
  perf: '面の 広さ × 雨量：小雨 0.15 L/h、大雨 0.6 L/h（葉 3 枚ぶん）' });
R('tinder_bundle', { name: '火口束', group: 'D', method: 'mix', p: 'P0', minutes: 3, out: { id: 'tinder_bundle', n: 3 },
  slots: [S('tinder', '火口', { tinder: 5 }, { n: 2 }), S('accel', '着火剤', {}, { optional: true, ids: ['resin', 'fat'] })],
  stats: (Q, s) => ({ tinder: s.accel ? 1.3 : 1.15 }), perf: '火口倍率 1.15（樹脂入り 1.3）。3 回ぶん' });
R('char_cloth', { name: '炭布', group: 'D', method: 'heat', p: 'P1', minutes: 20, out: { id: 'char_cloth', n: 4 }, setAttrs: { tinder: 10 },
  slots: [S('cloth', '布', {}, { ids: ['cloth', 'cloth_strip'] }), S('tin', 'ふた付き 耐熱容器', { container: 2, heatproof: 7 }, { consume: false })],
  stats: () => ({ tinder: 1.25, flintSteel: 0.75 }), perf: 'tinder 10。火打ち石＋鋼の 基本率 0.75 に。4 回ぶん' });
R('hand_drill_kit', { name: 'きりもみ棒と 火きり板', group: 'D', method: 'carve', p: 'P0', minutes: 15, bladeOptional: true, notch: true,
  slots: [S('drill', 'きりもみ棒', { hard: [3, 5], long: [4, 6] }, { tags: WOOD, hint: '乾いた 棒' }), S('board', '火きり板', { hard: [3, 5] }, { tags: WOOD, hint: '乾いた 板' })],
  stats: (Q, s, x) => kitStats('hand_drill', 0.12, s, x, 8),
  perf: '§10.1 きりもみ 基本率 0.12 × 板の 補正。V 字の 切り欠き（刃物）が ないと ×0.3' });
R('bow_drill_kit', { name: '火きり弓セット', group: 'D', method: 'tie', p: 'P0', minutes: 30, notch: true,
  slots: [S('bow', '弓', { flex: 3, long: 4 }, { back: 0.8 }), S('string', '紐', { fiber: 6 }, { bind: true, back: 0.8 }),
    S('drill', '棒', { hard: [3, 6], long: [3, 6] }, { tags: WOOD, back: 0.8 }), S('board', '板', { hard: [3, 5] }, { tags: WOOD, back: 0.8 }),
    S('socket', '押さえ', { hard: 5 }, { anyOf: [{ tags: ['shell'] }, { tags: ['stone'] }, { tags: ['bone'] }], back: 1, hint: 'くぼみの ある 硬い 物' })],
  stats: (Q, s, x) => kitStats('bow_drill', 0.2 + 0.3 * Q / 100, s, x, 15),
  perf: '§10.1 弓ぎり 基本率 0.20 + 0.30 × Q/100 × 板の 補正。切り欠きが ないと ×0.3' });
R('torch', { name: 'たいまつ', group: 'D', method: 'tie', p: 'P0', minutes: 10,
  slots: [S('stick', '棒', { long: 4 }, { back: 0.8 }), S('wrap', '燃える 巻き物', { burn: 6, fiber: 1 }), S('oil', '油', {}, { optional: true, ids: ['fat', 'resin', 'oil'] })],
  stats: (Q, s) => ({ minutes: s.oil ? 40 : 15, light: 8 }), perf: '15 分（油 あり 40 分）。明かり 8m、イノシシ・ヘビ・蚊よけ' });
R('shell_lamp', { name: '貝の ランプ', group: 'D', method: 'pack', p: 'P1', minutes: 10,
  slots: [S('dish', '皿', { container: 1, heatproof: 4 }, { back: 1 }), S('oil', '油', {}, { ids: ['fat', 'oil'] }), S('wick', '芯', { fiber: 1, tinder: 3 })],
  stats: () => ({ light: 4, hours: 6 }), perf: '明かり 4m・6h /脂 1。屋内で 安全' });
R('charcoal_batch', { name: '炭焼き', group: 'D', method: 'heat', p: 'P1', minutes: 15, wait: 240, special: 'batch', out: { id: 'charcoal', n: 0 },
  variants: [
    { method: 'heat', slots: [S('wood', '薪', { burn: 5, hard: 4 }, { n: 4, tags: WOOD }), S('cover', '土・葉', {}, { anyOf: [{ ids: ['mud', 'sand', 'clay'] }, { tags: ['leaf'] }], hint: '土か 葉' })] },
    { method: 'heat', slots: [S('wood', 'ヤシ殻', {}, { n: 6, ids: ['coconut_shell', 'shell_bowl'] }), S('cover', '土・葉', {}, { anyOf: [{ ids: ['mud', 'sand', 'clay'] }, { tags: ['leaf'] }], hint: '土か 葉' })] }],
  stats: (Q) => ({ count: 2 + Math.floor(Q / 40) }), perf: '土を かぶせて 4h 放置 → 炭 ×(2 + Q/40)' });
R('pitch', { name: 'ピッチ', group: 'D', method: 'heat', p: 'P1', minutes: 15, setAttrs: { sticky: 10, waterproof: 9, burn: 7 },
  slots: [S('resin', '樹脂', {}, { n: 2, more: false, ids: ['resin'] }), S('powder', '炭の 粉', {}, { ids: ['charcoal_powder', 'charcoal'] }),
    S('vessel', '耐熱容器', { container: 2, heatproof: 5 }, { consume: false })],
  stats: () => ({ glueMul: 1.5 }), perf: 'sticky 10・waterproof 9。「接着」スロットに 入れると 耐久 ×1.5' });
R('soap', { name: '石けん', group: 'D', method: 'heat', p: 'P2', minutes: 60, special: 'brew', out: { id: 'soap', n: 6 },
  slots: [S('ash', '灰', {}, { n: 3, more: false, ids: ['ash'] }), S('fat', '脂', {}, { ids: ['fat'] }),
    S('vessel', '水の 入った 耐熱容器', { container: 3, heatproof: 5 }, { water: 1, consume: false, hint: '水と 鍋' })],
  stats: () => ({ hygiene: 70 }), perf: '6 回ぶん。水浴びの 衛生 ＋70' });

// E. 薬・虫よけ・合図・その他
R('poultice', { name: '薬草の 湿布', group: 'E', method: 'mix', p: 'P0', minutes: 5,
  slots: [S('herb', '薬草', { med: 5 }, { max: 3, more: false }), S('binder', 'つなぎ', {}, { optional: true, anyOf: [{ need: { sticky: 3 } }, { tags: ['cloth'] }] }),
    S('char', '炭', {}, { optional: true, ids: ['charcoal', 'charcoal_powder'] })],
  stats: (Q, s) => { const kinds = [...new Set(s.herb.ids)]; return { power: +((0.8 + Q / 250) * (kinds.length >= 3 ? 0.7 : 1)).toFixed(3), herbs: kinds }; },
  perf: '薬草の 効果 ×(0.8 + Q/250)。2 種で 両方の 効果（3 種 以上は 各 ×0.7）' });
R('herb_tea', { name: '薬草茶・煎じ薬', group: 'E', method: 'heat', p: 'P0', minutes: 15, special: 'brew',
  slots: [S('vessel', '水の 入った 鍋', { container: 3, heatproof: 4 }, { water: 1, consume: false, hint: '水と 鍋' }), S('herb', '薬草', { med: 3 }, { max: 2, more: false })],
  stats: (Q, s) => ({ bodyTemp: 0.4, morale: 3, herbs: [...new Set(s.herb.ids)] }), perf: '§6.4。体温 ＋0.4、気力 ＋3' });
R('charcoal_powder', { name: '炭の 粉', group: 'E', method: 'knap', p: 'P0', minutes: 3, out: { id: 'charcoal_powder', n: 3 },
  slots: [S('char', '炭', {}, { ids: ['charcoal'] }), hammer()],
  stats: () => ({}), perf: '§6.4。水で 飲むと 毒を 吸着。3 回ぶん' });
R('repellent', { name: '虫よけ軟膏', group: 'E', method: 'mix', p: 'P1', minutes: 10,
  slots: [S('herb', 'におう 草', { scent: 6 }), S('oil', '油', {}, { ids: ['fat', 'oil'] })],
  stats: () => ({ hours: 12 }), perf: '蚊よけ 12h' });
R('signal_mirror', { name: '合図の 鏡', group: 'E', method: 'carve', p: 'P1', minutes: 20, noBlade: true,
  slots: [S('plate', '光る 板', { shine: 5 }, { ids: ['can', 'metal_scrap', 'glass_shard', 'crushed'] }), S('polish', 'みがき', {}, { optional: true, ids: ['sand', 'ash'] })],
  stats: (Q) => ({ signal: +(0.15 + Q / 400).toFixed(3) }), perf: '晴れの 昼、船・飛行機に 気づかれる ＋0.15 + Q/400' });
R('digging_stick', { name: '掘り棒・シャベル', group: 'E', method: 'carve', p: 'P1', minutes: 10,
  variants: [
    { method: 'carve', slots: [S('stick', '棒', { hard: 4, long: 5 })] },
    { method: 'tie', slots: [S('stick', '棒', { hard: 4, long: 5 }, { back: 0.8 }), S('spade', 'へら', {}, { ids: ['big_shell', 'metal_scrap', 'plank'], back: 1, hint: '平たい 物' }), cord(3)] }],
  stats: (Q, s) => ({ digMul: s.spade ? 0.35 : 0.5 }), perf: '掘る 回数 ×0.5（へら付き ×0.35）' });
R('splint', { name: '添え木', group: 'E', method: 'tie', p: 'P1', minutes: 10,
  slots: [S('sticks', '棒', { hard: 4, long: [2, 5] }, { n: 2, more: false, back: 0.8 }), S('ties', '紐', { fiber: 3 }, { n: 2, more: false, bind: true, back: 0.8 }),
    S('pad', '当て布', {}, { optional: true, tags: ['cloth'] })],
  stats: () => ({ move: 0.8, heal: 0.7 }), perf: '§6.3。ねんざの 移動 ×0.8、期間 ×0.7。骨折に 必須' });
R('crutch', { name: '松葉づえ', group: 'E', method: 'tie', p: 'P2', minutes: 20,
  slots: [S('pole', '棒', { long: 8, hard: 5 }, { back: 0.8 }), S('bar', '横木', { hard: 3, long: [2, 6] }, { back: 0.8 }), cord(3)],
  stats: () => ({ move: 0.6 }), perf: '§6.3。骨折でも 移動 ×0.6' });
R('paddle', { name: 'オール', group: 'E', method: 'tie', p: 'P1', minutes: 20,
  variants: [
    { method: 'tie', slots: [S('shaft', '棒', { long: 7 }, { back: 0.8 }), S('blade', '水かき', {}, { ids: ['plank', 'big_shell', 'mat', 'metal_scrap'], back: 1, hint: '平たい 物' }), cord(3)] },
    { method: 'carve', slots: [S('plank', '板', {}, { ids: ['plank'] })] }],
  stats: (Q) => ({ speed: +(0.8 + Q / 250).toFixed(3) }), perf: 'いかだの 速さ ×(0.8 + Q/250)' });
R('sail', { name: '帆', group: 'E', method: 'tie', p: 'P1', minutes: 60,
  variants: [
    { method: 'tie', slots: [S('sheet', '帆', { fiber: 3 }, { ids: ['sailcloth', 'tarp'], back: 1 }), S('ties', '紐', { fiber: 3 }, { n: 3, more: false, bind: true }), S('spar', '帆桁', { long: 8 }, { back: 0.8 })] },
    { method: 'tie', slots: [S('sheet', '編みマット', {}, { n: 3, more: false, ids: ['mat'], back: 1 }), S('ties', '紐', { fiber: 3 }, { n: 3, more: false, bind: true }), S('spar', '帆桁', { long: 8 }, { back: 0.8 })] }],
  stats: (Q, s) => { const wp = s.sheet.avg.waterproof || 0; return { sailWaterproof: +wp.toFixed(1), windFactor: +(0.15 * (0.5 + wp / 20)).toFixed(3) }; },
  perf: 'いかだの 速さ ＋風速 × 0.15 × (0.5 + waterproof/20) m/s（追い風）' });
R('bait_ball', { name: '練りエサ', group: 'E', method: 'mix', p: 'P1', minutes: 3, out: { id: 'bait_ball', n: 5 },
  slots: [S('food', '食べ物', { edible: 1 }), S('smell', 'におい', { scent: 4 })],
  stats: (Q, s, x) => ({ baitMul: 1.2, poison: (x.attrs.toxic || 0) >= 3 ? 1 : 0 }), perf: 'エサ倍率 1.2、5 回ぶん。毒入りは 毒エサ' });
R('bone_needle', { name: '骨の 針', group: 'E', method: 'carve', p: 'P1', minutes: 10, point: true,
  slots: [S('bone', '骨', { hard: 5 }, { tags: ['bone'], maxW: 0.3 })],
  stats: () => ({ sewBonus: 10 }), perf: '「縫う」型の Q ＋10' });
R('whistle', { name: '竹笛', group: 'E', method: 'carve', p: 'P2', minutes: 10,
  slots: [S('tube', '竹', {}, { ids: ['bamboo'] })],
  stats: () => ({ callRange: 150, signal: 0.03, morale: 1 }), perf: '仲間を 遠くから 呼べる（150m）。船への 合図 ＋0.03' });

/** all 64 templates by id (insertion order = the §11.5 tables) */
export const RECIPES = Object.fromEntries(L.map((r) => [r.id, r]));
export const RECIPE_LIST = L;

/** the ways a template can be made: [{ method, slots, noBlade }] (most have one) */
export function variantsOf(r) {
  if (r.variants) return r.variants.map((v, i) => ({ i, method: v.method ?? r.method, slots: v.slots, noBlade: v.noBlade ?? r.noBlade }));
  return [{ i: 0, method: r.method, slots: r.slots, noBlade: r.noBlade }];
}

function slotHint(s) {
  let tag = s.hint;
  if (!tag) {
    let best = null;
    for (const [k, v] of Object.entries(s.need || {})) if (!Array.isArray(v) && (best === null || v > s.need[best])) best = k;
    if (!best) best = Object.keys(s.need || {})[0] || null;
    tag = best ? HINT_TAG[best] : s.name;
  }
  return s.n > 1 ? `${tag} ×${s.n}` : tag;
}

/** 「？？？（結ぶ：長い ＋ 鋭い ＋ 紐）」 — the hint of an undiscovered template (§11.1) */
export function recipeHint(r) {
  const v = variantsOf(r)[0];
  const parts = v.slots.filter((s) => !s.optional).map(slotHint);
  return `？？？（${METHODS[v.method].short}：${parts.join(' ＋ ')}）`;
}

/** what a slot asks for, in words: 「紐（紐に なる 3 以上）」 */
export function slotText(s) {
  const conds = Object.entries(s.need || {}).map(([k, v]) => (Array.isArray(v) ? `${ATTR_TAG[k]} ${v[0]}〜${v[1]}` : `${ATTR_TAG[k]} ${v} 以上`));
  if (s.anyOf) conds.push(s.hint || s.anyOf.map((a) => Object.entries(a.need || {}).map(([k, v]) => `${ATTR_TAG[k]} ${v} 以上`).join('・') || (a.ids || a.tags || []).join('・')).join(' か '));
  return `${s.name}${s.n > 1 ? ` ×${s.n}` : ''}${conds.length ? `（${conds.join('、')}）` : ''}`;
}

/** materials that mend things that were not crafted from a template (§3 net, §21.2 tent, §21.3 sleeping bag) */
export const REPAIRS = {
  net: [{ need: { fiber: 4 } }],
  rod: [{ need: { fiber: 4 } }],
  bow: [{ need: { fiber: 7 } }],
  rope: [{ need: { fiber: 6 } }],
  tent: [{ tags: ['cloth'] }, { need: { sticky: 6 } }],
  sleeping_bag: [{ tags: ['cloth'] }],
  clothes_base: [{ tags: ['cloth'] }],
};

/** §11.7 rank table */
export const RANKS = [
  { min: 1, name: '粗悪', color: 'gray', breakChance: 0.05 },
  { min: 25, name: '並', color: 'white' },
  { min: 50, name: '良', color: 'green' },
  { min: 75, name: '上等', color: 'blue', morale: 2, moraleFirst: true },
  { min: 90, name: '逸品', color: 'gold', morale: 5, nameable: true },
];
