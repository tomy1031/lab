// tests/crafting.mjs — 錬成 (DESIGN.md §11) checked against the worked examples and rules of the spec.
//   node tests/crafting.mjs
// Runs on a fixture of materials copied from §11.3 (and a tiny in-memory inventory), so it does not need items.js;
// at the end, if js/data/items.js loads, every template output is also resolved against the real item table.
import { Crafting, fitOf, qualityOf, inheritAttrs, testCond, rankOf } from '../js/sim/crafting.js';
import { RECIPES, RECIPE_LIST, METHODS, variantsOf, recipeHint, filterQ, flakeSharp } from '../js/data/recipes.js';
import { CRAFTED } from '../js/data/crafted.js';

let failed = 0, passed = 0;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const check = (cond, msg) => { if (cond) passed++; else { failed++; console.log('FAIL', msg); } if (process.env.VERBOSE) console.log(cond ? 'ok  ' : 'FAIL', msg); };
const section = (s) => { if (process.env.VERBOSE) console.log(`\n# ${s}`); };

// ---------------------------------------------------------------- fixture: §11.3 materials (+ a few §6.4 / §7.1 items)
const A = (s) => Object.fromEntries((s || '').split(/\s+/).filter(Boolean).map((t) => { const m = /^([a-z]+)(\d+)$/.exec(t); return [m[1], +m[2]]; }));
const FIX = {};
const M = (id, name, attrs, weight, tags, extra = {}) => { FIX[id] = { name, icon: '·', cat: 'material', weight, attrs: A(attrs), tags, stack: 20, q: [35, 65], p: 'P0', ...extra }; };
M('twig', '小枝', 'burn7 tinder2 long2 hard2', 0.05, ['wood'], { fuel: 0.25, board: 0.3 });
M('branch', '枝', 'hard4 long5 burn6', 0.4, ['wood'], { fuel: 0.75, board: 1.0 });
M('pole', '長い棒', 'hard5 long8 burn5 flex2', 0.9, ['wood'], { board: 1.0 });
M('bent_wood', '曲がり木', 'hard5 long8 flex7', 0.8, ['wood'], { board: 0.5 });
M('log', '丸太', 'hard6 long9 heavy9 burn8 float6', 12, ['wood']);
M('bamboo', '竹', 'hard6 long9 flex5 container5 float7 burn5 waterproof6', 1.5, ['wood', 'plant'], { board: 1.2 });
M('vine', 'つる', 'fiber6 flex7 long8', 0.2, ['plant', 'fiber']);
M('palm_leaf', 'ヤシの葉', 'fiber4 waterproof5 insul4 burn5 long6 flex5', 0.3, ['leaf', 'plant']);
M('big_leaf', '大きな葉', 'waterproof6 insul2 flex6 container1', 0.1, ['leaf', 'plant']);
M('palm_fiber', 'ヤシの繊維', 'fiber5 tinder8 burn7 absorb3 insul3', 0.05, ['plant', 'fiber'], { tinder: 1.1 });
M('coconut_shell', 'ヤシ殻', 'container4 hard5 burn6 waterproof8 float4', 0.2, ['plant'], { container: { liters: 0.25, heatproof: false } });
M('bark', '樹皮', 'fiber3 burn6 tinder4 waterproof4 container1 insul3', 0.3, ['wood', 'plant'], { tinder: 0.6 });
M('dry_grass', '枯れ草', 'tinder7 burn8 fiber2 insul5', 0.1, ['plant'], { tinder: 1.0 });
M('green_grass', '草・シダ', 'fiber3 insul3 absorb2', 0.1, ['plant']);
M('wood_shavings', '木くず', 'tinder6 burn8', 0.02, ['wood'], { tinder: 0.7 });
M('bamboo_strip', '竹ひご', 'flex8 long7 hard3 fiber2', 0.1, ['wood', 'plant']);
M('driftwood', '流木', 'hard4 long5 burn7 float7', 0.6, ['wood'], { board: 1.1 });
M('firewood', '薪', 'hard5 burn8 long4 heavy3', 2.5, ['wood']);
M('stone', '丸石', 'hard8 heavy6', 1.0, ['stone']);
M('flat_stone', '平たい石', 'hard8 heavy8 heatproof9', 3.0, ['stone']);
M('flint', '火打ち石', 'hard9 sharp5 spark7', 0.4, ['stone']);
M('shell', '貝殻', 'hard5 sharp4 shine4 container1', 0.05, ['shell']);
M('bone', '骨', 'hard6 sharp3 long4', 0.2, ['bone']);
M('hide', '皮', 'insul8 waterproof5 fiber3 flex5', 2.0, ['hide']);
M('sinew', '腱', 'fiber9 flex6 long4', 0.05, ['fiber']);
M('feather', '羽根', 'insul5 float3 shine2', 0.01, ['feather']);
M('cloth', '布切れ', 'fiber5 absorb6 insul4 burn6 tinder3 flex6', 0.1, ['cloth'], { tinder: 0.8 });
M('rope_scrap', 'ロープ片', 'fiber8 long6 flex5', 0.2, ['fiber', 'cloth']);
M('plastic_bottle', 'ペットボトル', 'container6 waterproof10 float8 shine3', 0.05, ['plastic'], { container: { liters: 0.5, heatproof: false } });
M('can', '空き缶', 'container4 heatproof8 hard5 shine7 sharp3 waterproof10', 0.05, ['metal'], { container: { liters: 0.35, heatproof: true } });
M('glass_bottle', 'ガラス瓶', 'container6 waterproof10 hard5 shine6', 0.4, ['glass']);
M('glass_shard', 'ガラス片', 'sharp8 hard5 shine6', 0.05, ['glass']);
M('sand', '砂', 'absorb5 heavy5 heatproof6', 1.0, ['stone']);
M('clay', '粘土', 'sticky5 waterproof6 heatproof8 heavy6', 1.0, ['stone']);
M('mud', '泥', 'sticky3 insul3 waterproof3 scent2', 1.0, []);
M('charcoal', '炭', 'burn9 absorb9 med3', 0.1, ['wood'], { fuel: 3.0 });
M('ash', '灰', 'absorb4', 0.1, []);
M('resin', '樹脂', 'sticky8 burn8 waterproof7 tinder3 scent3', 0.1, ['plant']);
M('salt', '塩', '', 0.1, ['salt']);
M('thorn', '大きなトゲ', 'sharp7 hard3 long1', 0.01, ['plant']);
M('metal_scrap', '金属片', 'hard9 sharp5 heavy5 heatproof9 shine5 spark3', 0.5, ['metal', 'steel']);
const FOOD = (food, water, B, decay) => ({ food, water, B, parasite: 0, decay, thick: 1, rawPenalty: 0, mustCook: false, cookable: true });
M('coconut', 'ヤシの実', 'edible3', 1.2, ['food', 'plant'], { cat: 'food', food: { ...FOOD(12, 20, 0.005, 0.1), cookable: false, stage: { green: { food: 4, water: 30 }, brown: { food: 16, water: 10 } } } });
M('coconut_meat', 'ヤシの果肉', 'edible4', 0.3, ['food', 'plant'], { cat: 'food', food: FOOD(16, 2, 0.01, 2.0) });
M('fish_s', '小魚', 'edible3 scent5', 0.2, ['food', 'fish'], { cat: 'food', food: FOOD(12, 2, 0.10, 6.0) });
M('fat', '脂身', 'burn7 waterproof5 edible3 sticky2 scent4', 0.3, ['food', 'meat'], { cat: 'food', food: FOOD(8, 0, 0.2, 2.0) });
M('yomogi', 'ヨモギ', 'med7 scent3 edible1', 0.05, ['plant', 'herb'], { cat: 'herb', guide: 'yomogi', med: { type: 'hemostat', power: 7, use: 'apply' } });
M('dokudami', 'ドクダミ', 'med6 scent5', 0.05, ['plant', 'herb'], { cat: 'herb', guide: 'dokudami', med: { type: 'poultice', power: 6, use: 'apply' } });
M('ginger', '野生のショウガ', 'med7 scent6 edible1', 0.1, ['plant', 'herb'], { cat: 'herb', guide: 'ginger', med: { type: 'cold', power: 7, use: 'tea' } });
M('lemongrass', 'レモングラス', 'scent7 med2 edible1', 0.05, ['plant', 'herb'], { cat: 'herb', guide: 'lemongrass' });
M('numb_weed', 'シビレ草', 'toxic8 scent2', 0.05, ['plant'], { cat: 'herb', guide: 'numb_weed', food: { ...FOOD(1, 0, 0, 2.0), poison: { id: 'vomit', chance: 0.8, sev: [1, 1] } } });
M('charcoal_powder', '炭の粉', 'absorb9 burn9 med6', 0.1, ['plant', 'herb'], { cat: 'herb' });
FIX.knife = { name: 'サバイバルナイフ', icon: '🔪', cat: 'tool', weight: 0.3, attrs: A('hard8 sharp9 long1 spark3'), tags: ['metal', 'steel'], stack: 1, p: 'P0',
  tool: { kind: 'blade', durability: 400, sharp: 9, view: 'knife' }, perk: { craftSharpQ: 20 } };
FIX.pot = { name: '鍋', icon: '🍲', cat: 'container', weight: 0.9, attrs: A('container8 heatproof9 hard6 waterproof10'), tags: ['metal'], stack: 1, p: 'P0',
  container: { liters: 3, heatproof: true }, tool: { kind: 'pot', view: 'pot' } };

function itemDef(id, stack = null) {
  const base = FIX[id] ?? CRAFTED[id];
  if (!base || !stack) return base;
  const d = { ...base };
  if (stack.name) d.name = stack.name;
  if (stack.attrs) d.attrs = stack.attrs;
  if (stack.stats) { d.stats = stack.stats; if (d.tool) d.tool = { ...d.tool, ...stack.stats }; }
  return d;
}
const AT = (s) => (s ? attrsOf(s) : {});
function attrsOf(stack) {
  const a = { ...(stack.attrs ?? itemDef(stack.id)?.attrs ?? {}) };
  if ((stack.wet ?? 0) > 60) for (const k of ['burn', 'tinder']) if (a[k]) a[k] *= 0.3;
  return a;
}

class Bag {
  constructor() { this.stacks = []; this.next = 1; }
  add(id, n = 1, extra = {}) {
    const d = itemDef(id);
    if (!d) throw new Error('fixture has no ' + id);
    const s = { uid: this.next++, id, n, q: 50, fresh: d.food ? 100 : null, done: 0, proc: 'none', dur: d.tool?.durability ?? null, wet: 0, ...extra };
    this.stacks.push(s);
    return s;
  }
  addStack(s) { if (!s.uid) s.uid = this.next++; this.stacks.push(s); return s; }
  get(uid) { return this.stacks.find((s) => s.uid === uid) || null; }
  take(uid, n = 1) {
    const s = this.get(uid);
    if (!s) return [];
    const k = Math.min(n, s.n);
    s.n -= k;
    if (s.n <= 0) this.stacks = this.stacks.filter((x) => x !== s);
    return [{ ...s, n: k }];
  }
  count(id) { return this.stacks.reduce((a, s) => a + (s.id === id ? s.n : 0), 0); }
}

const baseCtx = () => ({ day: 1, held: null, nearWorkbench: false, hasGuide: false, morale: 50, night: false, lit: true, handInjured: false,
  skillCraft: 0, difficulty: 'normal', knowledge: null, nearFire: false });
/** a fresh world: bag, context, crafting with noise fixed to 0 (rng 0.5 → −5 + 10 × 0.5) */
function world(over = {}, rngValue = 0.5) {
  const bag = new Bag();
  const ctx = { ...baseCtx(), ...over };
  const rng = { v: rngValue, next() { return this.v; } };
  const c = new Crafting({ itemDef, attrsOf, inventory: bag, rng, getContext: () => ctx });
  return { bag, ctx, c, rng };
}

// ---------------------------------------------------------------- data tables
section('data');
check(RECIPE_LIST.length === 64, `64 templates (got ${RECIPE_LIST.length})`);
const byP = { P0: 0, P1: 0, P2: 0 };
for (const r of RECIPE_LIST) byP[r.p]++;
check(byP.P0 === 28, `28 P0 templates (got ${byP.P0})`);
check(byP.P1 === 31 && byP.P2 === 5, `31 P1 + 5 P2 (got ${byP.P1} / ${byP.P2})`);
check(Object.keys(METHODS).length === 7, '7 methods');
for (const r of RECIPE_LIST) {
  const vs = variantsOf(r);
  const okV = vs.every((v) => METHODS[v.method] && v.slots.length && v.slots.every((s) => s.key && s.name && (s.n ?? 1) >= 1));
  const okOut = r.out.from || itemDef(r.out.id);
  if (!okV || !okOut || typeof r.stats !== 'function' || !(r.minutes > 0)) check(false, `template ${r.id} is complete`);
}
check(true, 'every template has methods, slots, an output def, stats() and minutes');
const VIEWS = 'knife machete axe stone_axe spear club bow rod net rifle pistol flint steel stone stick torch bottle pot coconut food rope shovel hammer leaf'.split(' ');
const badView = Object.entries(CRAFTED).filter(([, d]) => d.tool && !VIEWS.includes(d.tool.view)).map(([k]) => k);
check(!badView.length, `every crafted tool has a viewmodel view (${badView.join(' ') || 'ok'})`);
const badDef = Object.entries(CRAFTED).filter(([, d]) => !(d.name && d.icon && d.cat && d.weight >= 0 && d.attrs && Array.isArray(d.tags) && d.stack >= 1 && d.p)).map(([k]) => k);
check(!badDef.length, `every CRAFTED def has the ItemDef fields (${badDef.join(' ') || 'ok'})`);
for (const g of ['joined_pole', 'weighted_club', 'spike_bundle', 'bundle', 'mat', 'woven_cord', 'carved_stick', 'paste_food', 'mystery_medicine', 'poison_paste',
  'sticky_goo', 'fire_starter', 'scent_ball', 'mud_ball', 'shard', 'crushed', 'hot_stone', 'shell_lime', 'pottery', 'filled_container', 'tinder_box']) {
  if (!CRAFTED[g]) check(false, `generic result ${g} has a def`);
}
check(recipeHint(RECIPES.spear_tip) === '？？？（結ぶ：長い ＋ 鋭い ＋ 紐）', `spear hint 「${recipeHint(RECIPES.spear_tip)}」 (§11.1)`);

// ---------------------------------------------------------------- §11.7 formulas
section('§11.7 quality');
check(fitOf(7, 5) === 1 && near(fitOf(4, 3), 0.8) && near(fitOf(6, 3), 1.2) && near(fitOf(9, 5), 1.2) && fitOf(5, [1, 6]) === 1, 'fit: ideal = min + 2, clamp 0.5–1.2, ranges are gates');
const ex = qualityOf({ slots: [{ fit: 1.0, m: 0.8 }, { fit: 0.8, m: 0.75 }, { fit: 1.2, m: 0.75 }], score: null, noise: 0 });
check(near(ex.base, 53.67, 0.01) && ex.q === 58, `worked example: base 53.7, Q 58 (got ${ex.base}, ${ex.q})`);
check(qualityOf({ slots: [{ fit: 1, m: 1 }], score: 1 }).q === 82 && qualityOf({ slots: [{ fit: 1, m: 1 }], score: 0 }).q === 64 && qualityOf({ slots: [{ fit: 1, m: 1 }], score: 0.55 }).q === 74, 'hand-work −6..+12 (§24.4; p 0.55 = +4)');
check(qualityOf({ slots: [{ fit: 1, m: 1 }], extra: 9 }).over === 12, 'over-count bonus capped at +12');
check(rankOf(24) === 0 && rankOf(25) === 1 && rankOf(58) === 2 && rankOf(75) === 3 && rankOf(90) === 4, 'rank table');
check(flakeSharp(5, 0) === 7 && flakeSharp(5, 1) === 9 && flakeSharp(0, 0.5) === 5 && flakeSharp(9, 1) === 10, 'flake sharpness: chert 7–9, round stone 4–6, obsidian 10');

// the worked example crafted: flake (sharp 7, Q60) + branch (Q50) + vine (Q50) → knife Q ≈ 58
section('knife (§11.7 example)');
{
  const { bag, c } = world();
  const f = bag.add('flake', 1, { q: 60, attrs: { hard: 9, sharp: 7 } });
  const b = bag.add('branch', 1, { q: 50 });
  const v = bag.add('vine', 1, { q: 50 });
  const pv = c.preview('tie', [f.uid, b.uid, v.uid]);
  check(Array.isArray(pv) && pv.candidates === pv && pv.length <= 3, 'preview is an array (also .candidates) of ≤ 3');
  check(pv[0]?.id === 'knife_made' && pv[0].kind === 'recipe' && pv[0].q === 58, `preview: knife first, predicted Q 58 (got ${pv[0]?.id} ${pv[0]?.q})`);
  check(pv[0].known === false && pv[0].name === '？？？' && pv[0].hint === '？？？（結ぶ：鋭い ＋ 硬い ＋ 紐）', `undiscovered → ？？？ + hint (${pv[0].hint})`);
  check(pv[0].uses[f.uid] === 1 && pv[0].uses[b.uid] === 1 && pv[0].uses[v.uid] === 1, 'uses one of each');
  const r = c.craft('tie', [f.uid, b.uid, v.uid]);
  check(r.ok && r.recipe === 'knife_made' && r.kind === 'recipe' && r.q === 58 && r.first, `crafted knife Q 58, first (got ${r.q})`);
  check(r.stack.stats.sharp === 7 && near(r.stack.stats.melee, 4 + 58 / 12, 0.01) && r.stack.dur === 98 && r.stack.stats.durability === 98, 'knife stats: sharp 7, melee 4 + Q/12, durability 40 + Q');
  check(AT(r.stack).hard === 9 && AT(r.stack).sharp === 7 && AT(r.stack).long === 5 && !AT(r.stack).fiber && !AT(r.stack).flex, 'tie inheritance: hard/sharp max, the cord\'s fiber is gone');
  check(!bag.get(f.uid) && !bag.get(b.uid) && !bag.get(v.uid), 'inputs consumed');
  check(c.preview('tie', [bag.add('flake', 1, { q: 60, attrs: { hard: 9, sharp: 7 } }).uid, bag.add('branch').uid, bag.add('vine').uid])[0].name === '手づくりナイフ', 'known after the first time');
  check(c.book().find((e) => e.id === 'knife_made').known && !c.book().find((e) => e.id === 'axe_made').known, 'recipe book records it');
}

// ---------------------------------------------------------------- templates
section('templates');
{ // stone flake from chert + round stone (§11.4 knap, §21.1)
  const { bag, c } = world();
  const ch = bag.add('flint'), st = bag.add('stone');
  const r = c.craft('knap', [ch.uid, st.uid]);
  check(r.ok && r.recipe === 'flake' && AT(r.stack).sharp === 8 && r.stack.stats.carve === -10, `chert flake: sharp 8 at the button, carve −10 (sharp ${AT(r.stack).sharp})`);
  check(!bag.get(ch.uid) && bag.count('stone') === 1, 'the core is used up, the hammer stone stays');
  check(r.stack.dur === Math.round(15 + r.q / 4), 'flake durability 15 + Q/4');
  const r2 = c.craft('knap', [bag.add('flint').uid, st.uid], { score: 1 });
  check(r2.q === 80 && AT(r2.stack).sharp === 9, `knapping minigame s=1: Q = 20 + 60 s = 80, sharp 9 (got ${r2.q})`);
  const s2 = bag.add('stone', 2);
  const r3 = c.craft('knap', [s2.uid, s2.uid]);
  check(r3.ok && r3.recipe === 'flake' && AT(r3.stack).sharp === 5 && AT(r3.stack).heavy === 3, 'two round stones → a flake (sharp 4–6), heavy 3: an axe blade');
  // held hammer stone works too
  const ch2 = bag.add('flint');
  const w2 = world();
  w2.ctx.held = w2.bag.add('stone');
  const r4 = w2.c.craft('knap', [w2.bag.add('flint').uid]);
  check(r4.ok && r4.recipe === 'flake' && w2.bag.count('stone') === 1, 'the hammer stone may be held in the hand');
  void ch2;
}
{ // spear: pole + flake + vine
  const { bag, c } = world();
  const p = bag.add('pole'), f = bag.add('flake', 1, { q: 50, attrs: { hard: 9, sharp: 7 } }), v = bag.add('vine');
  const r = c.craft('tie', [p.uid, f.uid, v.uid]);
  check(r.ok && r.recipe === 'spear_tip', `pole + flake + vine → spear_tip (got ${r.recipe})`);
  check(near(r.stack.stats.power, 10 + 7 + r.q / 8, 0.01) && r.stack.stats.range === 15 && AT(r.stack).long === 8 && AT(r.stack).hard === 9, 'spear: power 10 + sharp + Q/8, thrown 15 m');
}
{ // cord from 3 vines (fiber 8) and the over-count bonus
  const { bag, c } = world();
  const v3 = bag.add('vine', 3);
  const r = c.craft('weave', [v3.uid, v3.uid, v3.uid]);
  check(r.ok && r.recipe === 'cord' && r.stack.stats.fiber === 8 && AT(r.stack).fiber === 8 && AT(r.stack).long === 8, `3 vines → cord fiber 8 (got ${AT(r.stack).fiber})`);
  const v5 = bag.add('vine', 5);
  const r5 = c.craft('weave', [[v5.uid, 5]]);
  check(r5.ok && r5.recipe === 'cord' && r5.q === r.q + 6 && !bag.get(v5.uid) && r5.stack.stats.size === 1.2, `5 vines: +3 per extra (Q ${r.q} → ${r5.q}), all used, size +20 %`);
  const v9 = bag.add('vine', 9);
  check(c.preview('weave', { [v9.uid]: 9 })[0].id === 'mat', '9 fibres: the mat (P0, uses 6) ranks first');
  const r9 = c.craft('weave', { [v9.uid]: 9 }, { id: 'cord' });
  check(r9.q === r.q + 12 && bag.count('vine') === 2, 'over-count capped at +12 (4 extra used, the rest stays)');
  const g3 = bag.add('green_grass', 3);
  check(c.craft('weave', [g3.uid, g3.uid, g3.uid]).stack.attrs.fiber === 5, 'grass cord fiber 5');
}
{ // crude: fiber-2 grass where fiber ≥ 3 is needed (§11.8 ①)
  const { bag, c } = world();
  const f = bag.add('flake', 1, { q: 60, attrs: { hard: 9, sharp: 7 } }), b = bag.add('branch'), g = bag.add('dry_grass');
  const pv = c.preview('tie', [f.uid, b.uid, g.uid]);
  check(pv[0].id === 'torch' && pv[0].kind === 'recipe', 'branch + dry grass is an exact torch, ranked before the near knife (§11.1 order)');
  const ck = pv.find((x) => x.id === 'knife_made');
  check(ck?.kind === 'crude' && ck.name === '粗悪な ？？？' && ck.missing.includes('紐が 弱すぎる かも') && ck.q <= 30, `preview: near template with 「紐が 弱すぎる かも」 (${ck?.missing})`);
  const r = c.craft('tie', [f.uid, b.uid, g.uid], { id: 'knife_made' });
  check(r.ok && r.kind === 'crude' && r.stack.name === '粗悪な 手づくりナイフ' && r.q <= 30, `粗悪な 手づくりナイフ, Q ≤ 30 (got ${r.stack?.name} ${r.q})`);
  check(r.stack.dur === Math.round((40 + r.q) * 0.4), 'crude durability ×0.4');
}
{ // water filter (§11.5 D)
  check(filterQ([{ id: 'cloth', attrs: { absorb: 6 } }, { id: 'sand', attrs: { absorb: 5 } }, { id: 'charcoal', attrs: { absorb: 9 } }]) === 100, 'filter: cloth + sand + charcoal → 100');
  check(filterQ([{ id: 'cloth', attrs: { absorb: 6 } }, { id: 'sand', attrs: { absorb: 5 } }, { id: 'palm_fiber', attrs: { absorb: 3 } }]) === 55, 'filter without charcoal ≤ 55 (90 → 55)');
  check(filterQ([{ id: 'charcoal', attrs: { absorb: 9 } }, { id: 'palm_fiber', attrs: { absorb: 3 } }, { id: 'palm_fiber', attrs: { absorb: 3 } }]) === 80, 'filter 2 kinds ×0.8: 20 + 5 × 15 × 0.8 = 80');
  check(filterQ([{ id: 'cloth', attrs: { absorb: 6 } }, { id: 'cloth', attrs: { absorb: 6 } }, { id: 'cloth', attrs: { absorb: 6 } }]) === 55, 'filter 1 kind: 20 + 5 × 18 × 0.6 = 74 → 55 without charcoal');
  const { bag, c } = world();
  const bt = bag.add('plastic_bottle'), ch = bag.add('charcoal'), pf = bag.add('palm_fiber', 2);
  const r = c.craft('pack', [bt.uid, ch.uid, pf.uid, pf.uid]);
  check(r.ok && r.recipe === 'water_filter' && r.q === 80 && near(r.stack.stats.filterMul, 0.28), `crafted filter Q 80, ×0.28 (got ${r.q})`);
}
{ // knap a coconut: two shells (one with the water) + the meat (§11.4)
  const { bag, c } = world();
  const nut = bag.add('coconut'), st = bag.add('stone');
  const r = c.craft('knap', [nut.uid, st.uid]);
  check(r.ok && r.recipe === 'shell_bowl' && bag.count('shell_bowl') === 2 && bag.count('coconut_meat') === 1, 'coconut → 2 shell bowls + meat');
  check(bag.stacks.some((s) => s.id === 'shell_bowl' && s.water?.src === 'coconut_water' && s.water.cups === 1), 'one bowl holds the coconut water');
  check(bag.count('stone') === 1, 'the stone stays');
}
{ // friction kits and the V-notch (§22.9)
  const { bag, c, ctx } = world();
  const b = bag.add('branch'), d = bag.add('driftwood');
  const r = c.craft('carve', [b.uid, d.uid]);
  check(r.ok && r.recipe === 'hand_drill_kit' && r.q <= 30 && r.stack.stats.noNotch === true && r.stack.stats.notch === false, `no blade: kit without a notch, Q ≤ 30 (Q ${r.q})`);
  check(near(r.stack.stats.baseRate, 0.12 * r.stack.stats.board * 0.3, 1e-3), 'no notch: base rate ×0.3');
  ctx.held = bag.add('knife');
  const r2 = c.craft('carve', [bag.add('branch').uid, bag.add('driftwood').uid]);
  check(r2.ok && r2.recipe === 'hand_drill_kit' && r2.stack.stats.notch === true && near(r2.stack.stats.baseRate, 0.12 * r2.stack.stats.board, 1e-3), 'with a knife: notched kit');
  check(ctx.held.dur === 399, 'carving wears the blade by 1');
  const bw = bag.add('bent_wood'), cd = bag.add('vine'), dr = bag.add('branch'), bd = bag.add('driftwood'), sh = bag.add('shell');
  const r3 = c.craft('tie', [bw.uid, cd.uid, dr.uid, bd.uid, sh.uid]);
  check(r3.ok && r3.recipe === 'bow_drill_kit' && r3.stack.stats.notch && near(r3.stack.stats.base, 0.2 + 0.3 * r3.q / 100, 1e-3), `bow drill kit: base 0.20 + 0.30 Q/100 (Q ${r3.q})`);
}
{ // heat: charcoal batch (placed 4 h), clay pot shaped → fired (placed 3 h)
  const { bag, c, ctx } = world({ nearFire: true });
  const w = bag.add('branch', 4), lf = bag.add('palm_leaf');
  const r = c.craft('heat', [[w.uid, 4], lf.uid]);
  check(r.ok && r.recipe === 'charcoal_batch' && r.placed && r.readyInMinutes === 240 && r.pending.stacks[0].id === 'charcoal' && r.pending.stacks[0].n === 2 + Math.floor(r.q / 40), `charcoal batch placed, 2 + Q/40 charcoal (Q ${r.q})`);
  check(bag.count('charcoal') === 0 && bag.count('branch') === 0, 'placed: nothing added yet, wood used');
  const cl = bag.add('clay', 4), sd = bag.add('sand');
  const p = c.craft('mix', [[cl.uid, 4], sd.uid]);
  check(p.ok && p.recipe === 'clay_pot' && p.stack.id === 'clay_pot_raw' && p.stack.stats.temper === 1 && p.stack.stats.dried === 0, 'clay ×4 + sand → shaped pot (tempered, not dried)');
  p.stack.stats.dried = 1;
  const f = c.craft('heat', [p.stack.uid]);
  check(f.ok && f.placed && f.readyInMinutes === 180 && f.pending.stacks[0].id === 'clay_pot', 'firing the pot: placed 3 h, pending clay pot (crack roll below the rng)');
  ctx.nearFire = false;
  const nf = c.preview('heat', [bag.add('twig').uid]);
  check(nf.missingTool === '火' && !nf.some((x) => x.ready), 'heat without a fire → missingTool 火');
}
{ // herb tea uses one cup of the pot's water; poultice; bandage without a blade
  const { bag, c } = world({ nearFire: true });
  const pot = bag.add('pot', 1, { water: { src: 'river_low', cups: 4, treat: 'boil' } }), gi = bag.add('ginger');
  const r = c.craft('heat', [pot.uid, gi.uid]);
  check(r.ok && r.recipe === 'herb_tea' && pot.water.cups === 3 && bag.get(pot.uid) && r.stack.stats.herbs[0] === 'ginger', 'herb tea: pot keeps, one cup used');
  check(c.craft('mix', [bag.add('dokudami').uid, bag.add('cloth').uid]).recipe === 'bandage', 'cloth + herb → a medicated bandage');
  const p = c.craft('mix', [bag.add('dokudami').uid, bag.add('mud').uid]);
  check(p.ok && p.recipe === 'poultice' && near(p.stack.stats.power, 0.8 + p.q / 250, 1e-3), 'poultice ×(0.8 + Q/250)');
  const bd = c.craft('carve', [bag.add('cloth').uid]);
  check(bd.ok && bd.recipe === 'bandage', 'a bandage needs no blade (tearing cloth)');
}
{ // poison tip (pack): the same weapon, coated
  const { bag, c } = world();
  const sp = bag.add('spear_wood', 1, { dur: 30 }), nw = bag.add('numb_weed');
  const r = c.craft('pack', [sp.uid, nw.uid]);
  check(r.ok && r.recipe === 'poison_tip' && r.stack.id === 'spear_wood' && AT(r.stack).toxic === 7 && r.stack.name === '毒を ぬった 木の 槍' && r.stack.dur === 30, 'poison: spear keeps its id and wear, toxic = 8 − 1');
}

// ---------------------------------------------------------------- inheritance (§11.4)
section('inheritance');
{
  const fl = { attrs: { hard: 9, sharp: 7 } }, br = { attrs: FIX.branch.attrs }, vi = { attrs: FIX.vine.attrs };
  const t = inheritAttrs('tie', [fl, br, { ...vi, role: 'bind' }]);
  check(t.hard === 9 && t.sharp === 7 && t.long === 5 && t.burn === 6 && !t.fiber && !t.flex, 'tie: hard/sharp max, the cord vanishes');
  check(JSON.stringify(inheritAttrs('tie', [fl, br, vi])) === JSON.stringify(t), 'tie: the best fiber is the cord when no roles are given');
  check(inheritAttrs('tie', [{ attrs: FIX.branch.attrs }, { attrs: FIX.twig.attrs }, { ...vi, role: 'bind' }]).long === 6, 'tie long = max + second × 0.5 (5 + 1)');
  check(inheritAttrs('tie', [{ attrs: FIX.pole.attrs }, { attrs: FIX.bent_wood.attrs }, { ...vi, role: 'bind' }]).long === 10, 'tie long capped at 10');
  check(inheritAttrs('tie', [{ attrs: FIX.stone.attrs }, { attrs: FIX.flat_stone.attrs }, { ...vi, role: 'bind' }]).heavy === 10, 'tie heavy = sum (≤ 10)');
  const n = inheritAttrs('weave', [vi, vi, vi]);
  check(n.fiber === 8 && n.long === 9 && n.flex === 7, 'なう: fiber max + 2, long avg + 1');
  const mat = inheritAttrs('weave', Array(6).fill({ attrs: FIX.palm_leaf.attrs }), { q: 60 });
  check(mat.waterproof === 7 && mat.insul === 6, '編む: waterproof / insul avg + 1, +1 more at Q ≥ 50');
  const mx = inheritAttrs('mix', [{ attrs: FIX.numb_weed.attrs, weight: 0.05 }, { attrs: FIX.clay.attrs, weight: 1 }]);
  check(mx.toxic === 7 && mx.sticky === 4 && mx.heavy === 6, 'mix: weighted average, toxic / sticky = max − 1');
  check(inheritAttrs('carve', [{ id: 'pole', attrs: FIX.pole.attrs, tags: ['wood'] }], { point: true, toolSharp: 9 }).sharp === 3, 'carve point: wood ≤ 3');
  check(inheritAttrs('carve', [{ id: 'bone', attrs: FIX.bone.attrs, tags: ['bone'] }], { point: true, toolSharp: 9 }).sharp === 5, 'carve point: min(tool − 1, hard − 1) on bone');
  check(testCond({ id: 'dry_grass', attrs: FIX.dry_grass.attrs, tags: [] }, { need: { fiber: 3 } }).near === true, 'fiber 2 vs ≥ 3 is "near" (≥ 60 %)');
}

// ---------------------------------------------------------------- §11.8 ③ generic results, every method
section('generic: tie');
{
  const { bag, c } = world({ maxP: 'P1' });
  const r = c.craft('tie', [bag.add('driftwood').uid, bag.add('branch').uid, bag.add('vine').uid]);
  check(r.ok && r.kind === 'generic' && r.id === 'joined_pole' && AT(r.stack).long === 8 && AT(r.stack).hard === 3, `継ぎ棒: long 5 + 2.5, hard = min − 1 (got ${r.id} ${JSON.stringify(AT(r.stack))})`);
  const w = c.craft('tie', [bag.add('stone').uid, bag.add('branch').uid, bag.add('vine').uid], { kind: 'generic' });
  check(w.ok && w.id === 'weighted_club' && w.stack.stats.melee === 6 + 8 / 2, 'おもり付き棒: melee = heavy + hard/2');
  const t = bag.add('thorn', 2);
  const s = c.craft('tie', [t.uid, t.uid, bag.add('vine').uid], { kind: 'generic' });
  check(s.ok && s.id === 'spike_bundle' && AT(s.stack).sharp === 7, 'トゲ束: sharp max');
  const tw = bag.add('twig', 3);
  const b = c.craft('tie', [tw.uid, tw.uid, tw.uid, bag.add('vine').uid]);
  check(b.ok && b.id === 'bundle' && b.stack.name === '小枝の 束' && b.stack.contents.length === 2 && near(b.stack.stats.weight, (0.15 + 0.2) * 0.9, 0.01), '束: keeps the contents, weight ×0.9');
  const un = c.disassemble(b.stack.uid);
  check(un.ok && bag.count('twig') === 3 && bag.count('vine') === 1, 'untying a bundle gives everything back');
  check(!c.craft('tie', [bag.add('stone').uid, bag.add('stone').uid]).ok, 'tie without any cord says so');
}
section('generic: weave');
{
  const { bag, c } = world();
  const bw = bag.add('bent_wood', 9);
  const r = c.craft('weave', [bw.uid, bw.uid, bw.uid]);
  check(r.ok && r.id === 'woven_cord' && AT(r.stack).fiber === 2 && AT(r.stack).long === 9, '編みひも (なう rule)');
  const m = c.craft('weave', [[bw.uid, 6]], { kind: 'generic' });
  check(m.ok && m.id === 'mat' && m.kind === 'generic' && AT(m.stack).waterproof >= 1, '編みマット (編む rule)');
  check(!c.craft('weave', [bag.add('stone').uid, bag.add('sand').uid, bag.add('feather').uid]).ok, 'weave needs 3 things with fiber ≥ 2 or flex ≥ 5');
}
section('generic: carve');
{
  const { bag, c, ctx } = world();
  const pv = c.preview('carve', [bag.add('twig').uid]);
  check(pv.missingTool && !pv.some((x) => x.ready), `carve without a blade → missingTool (${pv.missingTool})`);
  check(!c.craft('carve', [bag.add('twig').uid]).ok, 'carve without a blade fails with a reason');
  ctx.held = bag.add('knife');
  const r = c.craft('carve', [bag.add('twig').uid]);
  check(r.ok && r.id === 'carved_stick' && AT(r.stack).sharp === 1 && bag.count('wood_shavings') === 1, '削った 棒 + 木くず');
  const r2 = c.craft('carve', [bag.add('branch').uid], { kind: 'generic' });
  check(r2.ok && AT(r2.stack).sharp === 3, 'a carved branch: sharp 3 (wood cap)');
  const bb = c.craft('carve', [bag.add('bamboo').uid], { kind: 'generic' });
  check(bb.ok && bag.count('bamboo_strip') === 6, 'bamboo → 6 strips (§11.4)');
  const cl = c.craft('carve', [bag.add('cloth').uid], { kind: 'generic' });
  check(cl.ok && bag.count('cloth_strip') === 3, 'cloth → 3 strips');
  const d0 = ctx.held.dur;
  const st = c.craft('carve', [bag.add('stone').uid]);
  check(st.ok && !st.stack && /歯が 立たない/.test(st.message) && ctx.held.dur === d0 - 2 && bag.count('stone') === 1, '石: 歯が 立たない, blade −2');
  const sp = c.craft('carve', [bag.add('pole').uid]);
  check(sp.ok && sp.recipe === 'spear_wood' && AT(sp.stack).sharp === 3 && near(sp.stack.stats.power, 6 + sp.q / 10, 0.01), 'pole → wooden spear (power 6 + Q/10); knife +20 to Q');
}
section('generic: mix');
{
  const { bag, c, ctx } = world();
  const fs = bag.add('fish_s', 2, { fresh: 80 });
  const p = c.craft('mix', [fs.uid, fs.uid], { kind: 'generic' });
  check(p.ok && p.id === 'paste_food' && near(p.stack.mix.food, 21.6) && p.stack.fresh === 80, '練り物: food = Σ × 0.9, freshness = lowest');
  const md = c.craft('mix', [bag.add('yomogi').uid, bag.add('dokudami').uid], { kind: 'generic' });
  check(md.ok && md.id === 'mystery_medicine' && md.stack.stats.power === 0.5 && md.stack.stats.herbs.length === 2, 'よく 分からない 薬 (×0.5)');
  const pz = c.craft('mix', [bag.add('numb_weed').uid, bag.add('clay').uid]);
  check(pz.ok && pz.id === 'poison_paste' && AT(pz.stack).toxic === 7, '毒の ペースト: toxic max − 1');
  const sg = c.craft('mix', [bag.add('resin').uid, bag.add('clay').uid]);
  check(sg.ok && sg.id === 'sticky_goo' && AT(sg.stack).sticky === 7, 'ねばねば: sticky max − 1');
  const fsr = c.craft('mix', [bag.add('twig').uid, bag.add('branch').uid]);
  check(fsr.ok && fsr.id === 'fire_starter' && AT(fsr.stack).tinder >= 2 && fsr.stack.stats.tinder > 0, '着火剤: tinder + 2');
  const sc = c.craft('mix', [bag.add('lemongrass').uid, bag.add('sand').uid]);
  check(sc.ok && sc.id === 'scent_ball', 'におい玉');
  const mb = c.craft('mix', [bag.add('sand').uid, bag.add('stone').uid]);
  check(mb.ok && mb.id === 'mud_ball' && mb.morale === 1, '泥だんご (+1 morale the first time)');
  // §11.8 ④: an unidentified poison goes into a normal-looking paste
  ctx.knowledge = { level: () => 0, nameOf: (id) => (id === 'numb_weed' ? '切れこみの 葉の 草' : null) };
  const pf = bag.add('fish_s', 2);
  const hid = c.craft('mix', [pf.uid, pf.uid, bag.add('numb_weed').uid], { kind: 'generic' });
  check(hid.ok && hid.id === 'paste_food' && hid.stack.toxicMix && hid.stack.mix.p === 0.8 && !hid.warnings.length, 'unknown poison → 練り物 with a hidden poison, no warning');
  ctx.knowledge = { level: () => 3 };
  const kn = c.preview('mix', [bag.add('numb_weed').uid, bag.add('fish_s').uid, bag.add('fish_s').uid]);
  check(kn.some((x) => x.id === 'bait_ball' && x.ready), 'known poison with fish → poison bait template');
}
section('generic: knap');
{
  const { bag, c } = world();
  const st = bag.add('stone');
  const sh = c.craft('knap', [bag.add('shell').uid, st.uid]);
  check(sh.ok && sh.id === 'shard' && bag.count('shard') === 1 && bag.count('shell_powder') === 1 && AT(bag.stacks.find((s) => s.id === 'shard')).sharp === 7, '貝 → 破片 (sharp 4 + 2 + 1) と 粉');
  const bn = c.craft('knap', [bag.add('bone').uid, st.uid]);
  check(bn.ok && bag.count('bone_shard') === 2, '骨 → 骨片 ×2');
  const gl = c.craft('knap', [bag.add('glass_bottle').uid, st.uid]);
  check(gl.ok && bag.count('glass_shard') === 3, 'ガラス瓶 → ガラス片 ×3');
  const bk = c.craft('knap', [bag.add('bark').uid, st.uid]);
  check(bk.ok && bk.id === 'crushed' && bk.stack.name === 'つぶれた 樹皮' && AT(bk.stack).fiber === 4 && bk.stack.stats.tinder === 0.9, 'つぶれた 樹皮: fiber + 1, もんだ 内皮 0.9');
  check(bag.count('stone') === 1, 'the hammer stone is never used up');
  const ch = c.craft('knap', [bag.add('charcoal').uid, st.uid]);
  check(ch.ok && ch.recipe === 'charcoal_powder' && bag.count('charcoal_powder') === 3, 'charcoal → powder ×3 (template)');
  const nh = c.preview('knap', [bag.add('shell').uid]);
  check(nh.missingTool && !nh.some((x) => x.ready), 'knap without a hammer stone → missingTool');
}
section('generic: heat');
{
  const { bag, c } = world({ nearFire: true });
  const tw = bag.add('twig', 3);
  const a = c.craft('heat', [tw.uid, tw.uid, tw.uid]);
  check(a.ok && a.id === 'ash' && bag.count('ash') === 1 && bag.count('twig') === 0, '燃える 物 → 灰');
  const br = bag.add('branch', 2);
  const ch = c.craft('heat', [br.uid, br.uid, bag.add('sand').uid]);
  check(ch.ok && ch.id === 'charcoal' && ch.placed && ch.readyInMinutes === 240 && ch.pending.stacks[0].id === 'charcoal', '蒸し焼き（土を かぶせる） → 炭, placed');
  const hs = c.craft('heat', [bag.add('stone').uid]);
  check(hs.ok && hs.id === 'hot_stone' && hs.stack.stats.hotMinutes === 20 && hs.warnings.some((w) => /はぜる/.test(w)), '石 → 焼き石 (with the 15 % burst warning)');
  const sl = c.craft('heat', [bag.add('shell').uid]);
  check(sl.ok && sl.id === 'shell_lime', '貝 → 貝灰');
  const cl = bag.add('clay', 2);
  const po = c.craft('heat', [cl.uid, cl.uid]);
  check(po.ok && po.placed && po.pending.stacks[0].name === '焼き物の 皿', '粘土 → 焼き物 (2 → 皿), placed');
  const fd = c.craft('heat', [bag.add('fish_s').uid]);
  check(!fd.ok && fd.redirect === 'cook', 'food → §7.3 cooking (redirect)');
  const pt = c.craft('heat', [bag.add('spear_wood', 1, { stats: { power: 11 } }).uid]);
  check(pt.ok && pt.stack.stats.hardened === 1 && pt.stack.stats.power === 13 && AT(pt.stack).hard === 6, 'fire-hardening a wooden spear: hard + 1, power + 2');
  const sea = bag.add('pot', 1, { water: { src: 'sea', cups: 12, treat: 'none' } });
  const sa = c.craft('heat', [sea.uid]);
  check(sa.ok && sa.placed && sa.pending.stacks.find((s) => s.id === 'salt').n === 2 && !bag.get(sea.uid), '海水 3 L → 塩 2 (the pot sits on the fire)');
}
section('generic: pack');
{
  const { bag, c } = world();
  const tb = c.craft('pack', [bag.add('plastic_bottle').uid, bag.add('dry_grass').uid]);
  check(tb.ok && tb.id === 'tinder_box' && tb.stack.stats.keepsDry === 1 && tb.stack.contents[0].id === 'dry_grass' && tb.stack.vessel.id === 'plastic_bottle', '防水容器 ＋ 火口 ＝ 濡れない 火口入れ');
  const fc = c.craft('pack', [bag.add('can').uid, bag.add('stone').uid]);
  check(fc.ok && fc.id === 'filled_container' && fc.stack.name === '丸石入りの 空き缶', '◯◯入りの 容器');
  const back = c.disassemble(fc.stack.uid);
  check(back.ok && bag.count('can') === 1 && bag.count('stone') === 1, 'taking things out returns the container and contents');
  const ct = c.craft('pack', [bag.add('branch').uid, bag.add('resin').uid]);
  check(ct.ok && ct.stack.name === '樹脂を ぬった 枝' && AT(ct.stack).sticky === 7 && AT(ct.stack).waterproof === 6, 'coating: sticky / waterproof = coat − 1');
  const pl = c.craft('pack', [bag.add('stone').uid, bag.add('feather').uid]);
  check(pl.ok && pl.id === 'bundle' && /^重ねた/.test(pl.stack.name), 'no container: 重ねた 物');
}

// ---------------------------------------------------------------- never "nothing happens" (§11.1 ③)
section('junk');
{
  const ids = ['twig', 'branch', 'stone', 'flat_stone', 'shell', 'bone', 'feather', 'sand', 'clay', 'bark', 'big_leaf', 'can', 'plastic_bottle',
    'coconut_shell', 'thorn', 'charcoal', 'cloth', 'resin', 'driftwood', 'green_grass', 'metal_scrap', 'hide', 'ash'];
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  let total = 0, nothing = [];
  for (let k = 0; k < 120; k++) {
    for (const method of ['tie', 'mix', 'knap', 'heat', 'pack', 'carve']) {
      const { bag, c, ctx } = world({ nearFire: true });
      ctx.held = bag.add('knife');
      const n = 2 + Math.floor(rnd() * 3);
      const uids = [];
      for (let j = 0; j < n; j++) uids.push(bag.add(ids[Math.floor(rnd() * ids.length)]).uid);
      if (method === 'tie') uids.push(bag.add('vine').uid);
      if (method === 'knap') uids.push(bag.add('stone').uid);
      const r = c.craft(method, uids);
      total++;
      if (!r.ok || (!r.stack && !r.placed && !/歯が 立たない|沸いた/.test(r.message))) nothing.push(`${method}: ${uids.map((u) => bag.get(u)?.id ?? '?').join('+')} → ${r.message}`);
    }
  }
  check(!nothing.length, `${total} random junk crafts all make something (${nothing.slice(0, 3).join(' | ')})`);
}

// ---------------------------------------------------------------- book, save, repair, take apart
section('book / save / repair / disassemble');
{
  const { bag, c, ctx } = world();
  const mk = () => c.craft('tie', [bag.add('flake', 1, { q: 60, attrs: { hard: 9, sharp: 7 } }).uid, bag.add('branch').uid, bag.add('vine').uid]);
  const r = mk();
  const bk = c.book();
  check(bk.length === 64 && bk.filter((e) => e.known).length === 1 && bk.find((e) => e.id === 'spear_tip').hint === '？？？（結ぶ：長い ＋ 鋭い ＋ 紐）', 'book: 64 entries, hints for the unknown');
  ctx.hasGuide = true;
  check(c.book().every((e) => e.known), 'the field guide shows every template');
  ctx.hasGuide = false;
  ctx.knowledge = { level: (g) => (g === 'yomogi' ? 3 : 0) };
  check(c.book().find((e) => e.id === 'poultice').known && !c.book().find((e) => e.id === 'axe_made').known, '§20.3: a K3 herb discloses the poultice and tea');
  ctx.knowledge = null;
  const saved = JSON.parse(JSON.stringify(c.serialize()));
  const c2 = new Crafting({ itemDef, attrsOf, inventory: bag, getContext: () => ctx });
  c2.deserialize(saved);
  check(c2.book().find((e) => e.id === 'knife_made').known && c2.made.knife_made.n === 1 && c2.made.knife_made.bestQ === 58, 'serialize / deserialize keeps the book');
  // repair (+50 %, Q unchanged)
  const k = r.stack;
  k.dur = 10;
  check(!c.repair(k.uid, bag.add('stone').uid).ok, 'repair needs a material of one of its slots');
  const rp = c.repair(k.uid, bag.add('vine').uid);
  check(rp.ok && k.dur === 10 + 49 && k.q === 58, `repair +50 % of 98 (dur ${k.dur})`);
  // take apart: blade always back, cord / handle 80 %
  const da = c.disassemble(k.uid);
  check(da.ok && !bag.get(k.uid) && bag.stacks.some((s) => s.id === 'flake' && AT(s).sharp === 7) && bag.count('branch') >= 1, 'disassemble: blade back, handle / cord 80 %');
  const w2 = world({}, 0.95);
  const k2 = w2.c.craft('tie', [w2.bag.add('flake', 1, { attrs: { hard: 9, sharp: 7 } }).uid, w2.bag.add('branch').uid, w2.bag.add('vine').uid]).stack;
  const d2 = w2.c.disassemble(k2.uid);
  check(d2.ok && w2.bag.count('flake') === 1 && w2.bag.count('vine') === 0 && d2.lost.some((l) => l.id === 'vine'), 'an unlucky roll loses the cord, never the blade');
}
{ // context terms: workbench +10, guide +10, low morale −10, night without light −10
  const q = (over) => { const { bag, c } = world(over); return c.preview('tie', [bag.add('flake', 1, { q: 60, attrs: { hard: 9, sharp: 7 } }).uid, bag.add('branch').uid, bag.add('vine').uid])[0].q; };
  check(q({ nearWorkbench: true }) === 68 && q({ hasGuide: true, nearWorkbench: true }) === 78 && q({ morale: 20 }) === 48 && q({ morale: 90 }) === 63 && q({ night: true, lit: false }) === 48 && q({ skillCraft: 3 }) === 64,
    'Q terms: workbench / guide +10, morale ±, dark −10, skill ×2');
  const { bag, c } = world({ difficulty: 'hard' });
  const r = c.craft('tie', [bag.add('flake', 1, { q: 60, attrs: { hard: 9, sharp: 7 } }).uid, bag.add('branch').uid, bag.add('vine').uid]);
  check(r.stack.dur === Math.round(98 * 0.85), 'difficulty: tool durability ×0.85 on hard');
}

// ---------------------------------------------------------------- the real item table (if it loads)
section('items.js');
try {
  const items = await import('../js/data/items.js');
  const missing = RECIPE_LIST.filter((r) => !r.out.from && !items.itemDef(r.out.id)).map((r) => r.id);
  check(!missing.length, `every template output resolves in items.js + CRAFTED (${missing.join(' ') || 'ok'})`);
  const bag = new Bag();
  const realBag = { ...bag, stacks: [], next: 1, add(id, n = 1, extra = {}) { const d = items.itemDef(id); const s = { uid: this.next++, id, n, q: 50, fresh: d.food ? 100 : null, done: 0, proc: 'none', dur: d.tool?.durability ?? null, wet: 0, ...extra }; this.stacks.push(s); return s; },
    addStack: Bag.prototype.addStack, get: Bag.prototype.get, take: Bag.prototype.take, count: Bag.prototype.count };
  const ctx = baseCtx();
  const c = new Crafting({ itemDef: items.itemDef, attrsOf: items.attrsOf, inventory: realBag, rng: () => 0.5, getContext: () => ctx });
  const fl = c.craft('knap', [realBag.add('flint').uid, realBag.add('stone').uid]);
  const cd = c.craft('weave', [[realBag.add('vine', 3).uid, 3]]);
  const kn = c.craft('tie', [fl.stack.uid, realBag.add('branch').uid, cd.stack.uid]);
  check(fl.ok && fl.recipe === 'flake' && cd.ok && cd.recipe === 'cord' && kn.ok && kn.recipe === 'knife_made', `real items: chert → flake, vines → cord, flake + branch + cord → knife (Q ${kn.q})`);
  ctx.held = kn.stack;
  const sp = c.craft('carve', [realBag.add('pole').uid]);
  check(sp.ok && sp.recipe === 'spear_wood', 'real items: the hand-made knife carves a spear');
} catch (e) {
  console.log('skip  items.js not loadable here:', e.message);
}

console.log(`\n${failed ? 'FAILED' : 'all passed'}: ${passed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
