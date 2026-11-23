// sim/resources.js — what you can do with each kind of thing in the world (DESIGN.md §8.2, §9.3, §9.6, §20, §22.7,
// §22.8): the options shown in the prompt, the activity used (hit / hold / dig …), tool requirements, yields,
// regrowth, and the look-alike species of plants (berries, herbs, mushrooms, taro) assigned per node.
//
// An option: { id, label, key ('E' | 'click'), activity: { kind, params }, needs?: (ctx) → string|null (reason it is not
//   possible), gameMinutes, stamina, heavy, yields: (ctx) → [[itemId, n, extra]], after: 'hide'|'shrink'|'keep'|'stump',
//   regrowDays, noise (m heard by animals), sound }
// ctx = { game, node, held (stack|null), heldDef, tool (kind), knowledge, rng, hour, tide, zone }

// the held tool: ctx.tool = ItemDef.tool.kind ('blade', 'axe', …); crafted tools carry stack.stats
const sharp = (ctx) => (ctx.heldStack?.attrs?.sharp ?? ctx.heldDef?.attrs?.sharp ?? 0) >= 4;
const chopPower = (ctx) => ctx.heldStack?.stats?.chop ?? ctx.heldDef?.tool?.chop ?? (sharp(ctx) ? 2 : 0);
const knifeLike = (ctx) => ctx.tool === 'blade' || /knife|machete/.test(ctx.heldStack?.id || '');

/** hits to fell a tree (§22.8): ceil(d² / (chop × 4) × hardness) */
export function fellHits(diameterCm, chop, hardness = 1) {
  if (chop <= 0) return Infinity;
  return Math.max(1, Math.ceil((diameterCm * diameterCm) / (chop * 4) * hardness));
}

/** species of look-alike nodes, decided once per node from the seeded rng (§20.4) */
export function assignSpecies(node, rng, zone) {
  switch (node.kind) {
    case 'bush_berry': node.data.species = rng.next() < 0.33 ? 'red_berry_toxic' : 'berry'; break;
    case 'mushroom': node.data.species = rng.pick(['mushroom_a', 'mushroom_b', 'mushroom_c', 'mushroom_toxic']); break;
    case 'herb':
      if (zone === 'jungle') node.data.species = rng.pick(['dokudami', 'ginger', 'ginger', 'turmeric', 'dokudami']);
      else if (zone === 'stream' || zone === 'pond') node.data.species = rng.next() < 0.4 ? 'numb_weed' : 'yomogi';
      else node.data.species = rng.weighted([['yomogi', 0.35], ['numb_weed', 0.25], ['lemongrass', 0.25], ['guava_leaf', 0.15]]);
      break;
    case 'banana': node.data.ripe = rng.next() < 0.6; break;
    case 'clay': break;
    case 'fern': node.data.species = zone === 'stream' || zone === 'pond' ? (rng.next() < 0.5 ? 'taro' : 'false_taro') : null; break;
    default: break;
  }
  node.data.q = Math.round(35 + rng.next() * 30);  // §11.3: natural quality 35–65 per node
  node.data.left = defaultStock(node.kind);
}

function defaultStock(kind) {
  return { palm: 4, bush_berry: 6, banana: 1, herb: 3, mushroom: 3, shell: 2, seaweed: 3, nest: 3, vine: 3, bamboo: 1, tree: 3, bush: 4, grass_tuft: 3, fern: 3, aloe: 2, clay: 6, sugarcane: 3, rock: 1, flint: 1, driftwood: 1, coconut_fallen: 1, boulder: 0 }[kind] ?? 1;
}

/** the gathered bundle may contain the toxic look-alike while you do not know the plant (§20.3) */
function lookalikeMix(ctx, realId, safeId, toxicId, baseMix) {
  const k = ctx.knowledge;
  const lv = Math.max(k?.level(safeId) ?? 0, k?.level(toxicId) ?? 0);
  if (lv >= 3) return { id: realId, extra: {} };
  // K0–K1: everything that looks alike goes into one bundle of the safe id, with a hidden toxic share
  if (lv <= 1) return { id: safeId, extra: { mix: { toxic: toxicId, p: realId === toxicId ? 1 : 0 } } };
  // K2: sorted by observation, with the observation mistake rate
  const mistake = k?.mixRate?.(safeId) ?? 0.1;
  if (ctx.rng.next() < mistake) return { id: realId === toxicId ? safeId : toxicId, extra: realId === toxicId ? { mix: { toxic: toxicId, p: 1 } } : {} };
  return { id: realId, extra: {} };
}

function speciesYield(ctx, n) {
  const sp = ctx.node.data.species;
  const pairs = { berry: ['berry', 'red_berry_toxic'], red_berry_toxic: ['berry', 'red_berry_toxic'], yomogi: ['yomogi', 'numb_weed'], numb_weed: ['yomogi', 'numb_weed'],
    mushroom_c: ['mushroom_c', 'mushroom_toxic'], mushroom_toxic: ['mushroom_c', 'mushroom_toxic'], taro: ['taro', 'false_taro'], false_taro: ['taro', 'false_taro'] };
  const pr = pairs[sp];
  const mul = ctx.knowledge?.harvestMul?.(sp) ?? 1;
  const count = Math.max(1, Math.round(n * mul));
  if (!pr) return [[sp, count, { q: ctx.node.data.q }]];
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = lookalikeMix(ctx, sp, pr[0], pr[1]);
    const prev = out.find((o) => o[0] === r.id && JSON.stringify(o[2].mix || null) === JSON.stringify(r.extra.mix || null));
    if (prev) prev[1]++; else out.push([r.id, 1, { q: ctx.node.data.q, ...r.extra }]);
  }
  return out;
}

const HOLD = (seconds) => ({ kind: 'hold', params: { seconds } });
const HIT = (hits, o = {}) => ({ kind: 'hit', params: { hits, interval: 0.45, ...o } });

/** options per node kind. Order = priority (the first possible one is the default E action) */
export const RESOURCE_OPTIONS = {
  palm: [
    { id: 'shake', label: 'ヤシを ゆすって 実を 落とす', activity: HIT(3, { anyStroke: true }), gameMinutes: 5, stamina: 8, after: 'keep', stock: true,
      yields: (c) => [['coconut', c.score >= 0.8 ? 2 : 1, { q: c.node.data.q, stage: c.rng.next() < 0.5 ? 'green' : 'brown' }]], regrowDays: 5, sound: 'rustle', hint: 'グーで 上に 突き上げる（2〜3 回）' },
    { id: 'leaf', label: 'ヤシの 葉を 取る', activity: HOLD(1.4), gameMinutes: 3, stamina: 2, yields: (c) => [['palm_leaf', knifeLike(c) ? 3 : 2, { q: c.node.data.q }]], after: 'keep', sound: 'rustle' },
  ],
  coconut_fallen: [
    { id: 'pick', label: '落ちた ヤシの実を 拾う', activity: HOLD(0.5), gameMinutes: 1, yields: (c) => [['coconut', 1, { q: c.node.data.q, stage: 'brown', fresh: 70 }]], after: 'hide', regrowDays: 3, sound: 'pickup' },
  ],
  tree: [
    { id: 'branches', label: '枝と 小枝を 集める', activity: HOLD(1.2), gameMinutes: 3, stamina: 2, stock: true, yields: (c) => [['branch', 2, { q: c.node.data.q, wet: c.rainWet }], ['twig', 3, { q: c.node.data.q, wet: c.rainWet }]], after: 'keep', regrowDays: 1, sound: 'rustle' },
    { id: 'fell', label: '木を 切り倒す', needs: (c) => (chopPower(c) >= 6 ? null : '斧が 要る（手斧・石斧）'), heavy: true, stamina: 4, noise: 80, sound: 'chop',
      activity: (c) => HIT(Math.min(14, fellHits(c.node.data.diameter || 20, chopPower(c), 1)), { perHitStamina: 4 }),
      gameMinutes: (c) => Math.round(20 * 18 / Math.max(6, chopPower(c))),
      yields: (c) => [['log', 1, { q: c.node.data.q }], ['branch', 3, { q: c.node.data.q }], ['bark', 1, { q: c.node.data.q }]], after: 'stump', fall: true },
    { id: 'bark', label: '樹皮を はぐ', needs: (c) => (sharp(c) ? null : '刃物が 要る'), activity: HOLD(1.6), gameMinutes: 6, stamina: 2, yields: (c) => [['bark', 2, { q: c.node.data.q }]], after: 'keep', sound: 'chop_weak' },
  ],
  bamboo: [
    { id: 'cut', label: '竹を 切る', needs: (c) => (sharp(c) || chopPower(c) > 0 ? null : '刃物が 要る（石刃でも 切れる）'), heavy: true, noise: 40, sound: 'chop',
      activity: (c) => HIT(knifeLike(c) || chopPower(c) >= 6 ? 3 : 6), gameMinutes: (c) => (knifeLike(c) || chopPower(c) >= 6 ? 8 : 20), stamina: 8, stock: true,
      yields: (c) => [['bamboo', 1, { q: c.node.data.q }]], after: 'shrink', regrowDays: 7 },
  ],
  bush_berry: [
    { id: 'pick', label: '赤い 実を 摘む', activity: HOLD(1.2), gameMinutes: 3, stock: true, yields: (c) => speciesYield(c, 3), after: 'shrink', regrowDays: 3, sound: 'pick', hint: 'つまんで 上に 引く', learn: 'seen' },
    { id: 'twigs', label: '小枝を 集める', activity: HOLD(1.0), gameMinutes: 2, yields: () => [['twig', 2, {}]], after: 'keep', sound: 'rustle' },
  ],
  bush: [
    { id: 'twigs', label: '小枝と 葉を 集める', activity: HOLD(1.0), gameMinutes: 3, stock: true, yields: (c) => [['twig', 2, { wet: c.rainWet }], ['green_grass', 1, {}]], after: 'keep', regrowDays: 1, sound: 'rustle' },
  ],
  fern: [
    { id: 'pick', label: (c) => (c.node.data.species ? '大きな ハート形の 葉の 根を 掘る' : '葉を 取る'),
      activity: (c) => (c.node.data.species ? HIT(4, { anyStroke: true }) : HOLD(1.0)), gameMinutes: (c) => (c.node.data.species ? 10 : 2), stock: true,
      yields: (c) => (c.node.data.species ? [...speciesYield(c, 1), ['big_leaf', 2, {}]] : [['green_grass', 2, {}]]), after: 'shrink', regrowDays: 2, sound: 'dig' },
  ],
  grass_tuft: [
    { id: 'pick', label: '草を 刈る', activity: HOLD(0.9), gameMinutes: 3, stock: true,
      yields: (c) => [[c.hour > 9 && c.rain < 0.05 && c.zone !== 'jungle' ? 'dry_grass' : 'green_grass', knifeLike(c) ? 3 : 2, { wet: c.rainWet }]], after: 'shrink', regrowDays: 1, sound: 'rustle' },
  ],
  herb: [
    { id: 'pick', label: '草を 摘む', activity: HOLD(1.0), gameMinutes: 3, stock: true, yields: (c) => speciesYield(c, 2), after: 'shrink', regrowDays: 3, sound: 'pick', learn: 'seen' },
  ],
  mushroom: [
    { id: 'pick', label: 'キノコを 採る', activity: HOLD(0.9), gameMinutes: 2, stock: true, yields: (c) => speciesYield(c, 2), after: 'hide', regrowDays: 3, sound: 'pick', learn: 'seen' },
  ],
  banana: [
    { id: 'pick', label: 'バナナの 房を 取る', needs: (c) => (c.node.data.left > 0 ? null : 'まだ 実が ない'), activity: HOLD(1.6), gameMinutes: 6, stamina: 3,
      yields: (c) => [['banana', 3 + (knifeLike(c) ? 1 : 0), { q: c.node.data.q, stage: c.node.data.ripe ? 'ripe' : 'green' }], ['big_leaf', 2, {}]], after: 'keep', stock: true, regrowDays: 6, sound: 'rustle' },
  ],
  vine: [
    { id: 'pull', label: 'つるを 取る', activity: (c) => HOLD(knifeLike(c) ? 0.8 : 1.6), gameMinutes: (c) => (knifeLike(c) ? 2 : 4), stamina: 2, stock: true,
      yields: (c) => [['vine', 2, { q: c.node.data.q }]], after: 'keep', regrowDays: 2, sound: 'rustle', hint: 'つかんで 引く' },
  ],
  aloe: [
    { id: 'pick', label: 'アロエを 切り取る', activity: HOLD(1.0), gameMinutes: 2, stock: true, yields: (c) => [['aloe', 1, { q: c.node.data.q }]], after: 'shrink', regrowDays: 4, sound: 'pick', learn: 'seen' },
  ],
  shell: [
    { id: 'pick', label: '貝殻を 拾う', activity: HOLD(0.5), gameMinutes: 1, yields: (c) => [['shell', 1 + (c.rng.next() < 0.3 ? 1 : 0), { q: c.node.data.q }]], after: 'hide', regrowDays: 1, sound: 'pick' },
    { id: 'clam', label: '貝を 掘る（干潮）', needs: (c) => (c.tide < -0.2 ? null : '潮が 引いて いない'), activity: HIT(3, { anyStroke: true }), gameMinutes: 8,
      yields: (c) => [['shellfish', 1 + Math.floor(c.rng.next() * 3), { q: c.node.data.q }]], after: 'keep', stock: true, regrowDays: 0.5, sound: 'dig', learn: 'seen' },
  ],
  seaweed: [
    { id: 'pick', label: '海藻を 取る', activity: HOLD(0.8), gameMinutes: 2, stock: true, yields: (c) => [['seaweed', 2, { q: c.node.data.q }]], after: 'shrink', regrowDays: 1, sound: 'pick' },
  ],
  rock: [
    { id: 'pick', label: '石を 拾う', activity: HOLD(0.5), gameMinutes: 1, yields: (c) => [[c.zone === 'rocks' && c.rng.next() < 0.4 ? 'flat_stone' : 'stone', 1, { q: c.node.data.q }]], after: 'hide', regrowDays: 1, sound: 'stone_hit' },
    { id: 'limpet', label: 'カサガイを はがす', needs: (c) => (c.zone === 'rocks' && c.tide < 0 ? null : '干潮の 岩場で'), activity: HIT(1), gameMinutes: 3,
      yields: (c) => { const p = knifeLike(c) ? 0.95 : (c.heldDef?.attrs?.hard ?? 0) >= 7 ? 0.7 : 0.3; return c.rng.next() < p ? [['shellfish', 1, {}]] : []; }, failText: '吸いついて 取れなかった', after: 'keep', sound: 'stone_hit' },
  ],
  flint: [
    { id: 'pick', label: '黒っぽい 石を 拾う', activity: HOLD(0.6), gameMinutes: 1, yields: (c) => [['flint', 1, { q: c.node.data.q }]], after: 'hide', regrowDays: 3, sound: 'stone_hit', learn: 'seen' },
  ],
  driftwood: [
    { id: 'pick', label: '流木を 拾う', activity: HOLD(0.7), gameMinutes: 1, yields: (c) => [['driftwood', 1, { q: c.node.data.q }], ['twig', 1, {}]], after: 'hide', regrowDays: 1, sound: 'pickup' },
  ],
  clay: [
    { id: 'dig', label: '粘土を 掘る', activity: HIT(6, { anyStroke: true }), gameMinutes: 12, stamina: 3, stock: true, yields: (c) => [['clay', 2, { q: c.node.data.q }]], after: 'keep', regrowDays: 0.5, sound: 'dig', hint: '手を 開いて 下へ すくい、手前に 引く' },
  ],
  sugarcane: [
    { id: 'cut', label: 'サトウキビを 折る', activity: HOLD(1.2), gameMinutes: 4, stock: true, yields: (c) => [['sugarcane', 1, { q: c.node.data.q }]], after: 'shrink', regrowDays: 4, sound: 'chop_weak' },
  ],
  nest: [
    { id: 'eggs', label: '巣の 卵を 取る', activity: HOLD(0.8), gameMinutes: 2, yields: (c) => [['egg', 1 + Math.floor(c.rng.next() * 3), {}]], after: 'shrink', regrowDays: 2, sound: 'pick', peck: true },
  ],
  boulder: [],
  driftage: [
    { id: 'pick', label: (c) => `${c.node.data.name || '漂着物'}を 拾う`, activity: HOLD(0.6), gameMinutes: 1, yields: (c) => [[c.node.data.item, c.node.data.n || 1, { q: c.node.data.q ?? 60 }]], after: 'remove', sound: 'pickup' },
  ],
};

/** the default ("E") option that is possible now, plus the list of all with reasons */
export function optionsFor(ctx) {
  const list = RESOURCE_OPTIONS[ctx.node.kind] || [];
  return list.map((o) => {
    const reason = o.needs ? o.needs(ctx) : null;
    const stockOut = o.stock && (ctx.node.data.left ?? 1) <= 0;
    return { opt: o, ok: !reason && !stockOut, reason: reason || (stockOut ? 'もう 取れない（あとで また 生える）' : null) };
  });
}

export const val = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);
