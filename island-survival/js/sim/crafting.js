// sim/crafting.js — 錬成 (DESIGN.md §11): what the things on the bench can become (preview), making it (craft),
// the recipe book, repairing and taking apart. Data: js/data/recipes.js (methods, 64 templates), js/data/crafted.js.
//
// The result is decided in three steps (§11.1): a template whose slots the materials meet → a near template
// (「粗悪な ◯◯」, §11.8 ①) → the method's generic result (§11.8 ③). "Nothing happens" never happens: when a method
// cannot be used at all (no blade in hand, no fire, too few things) the answer says what is missing.
//
// Dependencies are injected so this runs without the game (tests use a fixture):
//   new Crafting({ itemDef, attrsOf, inventory, rng, getContext })
//   inventory: get(uid), take(uid, n) → removed parts, addStack(stack) (or add(id, n, extra))
//   rng: RNG ({ next() }) or a function → [0, 1)
//   getContext() → { day, held (stack in hand | null), nearWorkbench, hasGuide, morale, night, lit, handInjured,
//                    skillCraft, difficulty ('normal' | DIFFICULTY entry), knowledge ({ level(guideId), nameOf(id) }),
//                    nearFire (bool), nearOven?, maxP? ('P0' | 'P1' | 'P2': hide later templates) }
// Inputs (`uids`): an array where each entry is one unit — a uid (1 of that stack), [uid, n] or { uid, n }; a uid
// repeated k times is k units (that is what the 6 bench slots pass). A plain object { uid: n } works too.
import { METHODS, RECIPE_LIST, RECIPES, ATTRS, ATTR_TAG, REPAIRS, RANKS, variantsOf, recipeHint, slotText, flakeSharp } from '../data/recipes.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const P_ORDER = { P0: 0, P1: 1, P2: 2 };
const DIFF_DUR = { easy: 1.5, normal: 1.0, hard: 0.85, extreme: 0.7 };          // §17.1 道具の 耐久
const HERBS = ['aloe', 'yomogi', 'dokudami', 'ginger', 'guava_leaf', 'turmeric', 'cinchona', 'neem_fruit', 'lemongrass'];
const MED_TEMPLATES = ['poultice', 'herb_tea'];                               // §20.3: a K3 herb discloses these
const STAT_ATTRS = new Set(ATTRS.filter((k) => k !== 'tinder'));              // stats.tinder is the §10.1 multiplier
const POINTED = ['spear_wood', 'carved_stick', 'digging_stick'];               // wooden points that fire can harden
const COATS = ['fat', 'resin', 'beeswax', 'pitch', 'oil', 'poison_paste', 'sticky_goo'];
const FAIL = Object.freeze({ ok: false, near: false, fit: 0, lack: [] });
const LACK = { fiber: '弱すぎる', sharp: 'なまくら すぎる', hard: 'やわらかすぎる', long: '短すぎる', flex: 'しならなさすぎる', heavy: '軽すぎる',
  waterproof: '水を 通しすぎる', container: '小さすぎる', absorb: '吸わなさすぎる', burn: '燃えにくすぎる', tinder: '火口に ならなさすぎる' };
const OVER = { long: '長すぎる', hard: '硬すぎる' };

// ---------------------------------------------------------------- pure helpers (exported for tests)

/** how far a value meets a condition (min or [min, max]); ≥ 1 = met, 0.6–1 = "near" (§11.8 ①) */
export function ratioOf(v, cond) {
  if (Array.isArray(cond)) {
    const [a, b] = cond;
    if (v < a) return a > 0 ? v / a : 1;
    if (v > b) return v > 0 ? b / v : 1;
    return 1;
  }
  return cond > 0 ? v / cond : 1;
}

/** §11.7 fit of one attribute: clamp(value / (min + 2), 0.5, 1.2); a range is 1 inside, the near ratio outside */
export function fitOf(value, cond) {
  if (Array.isArray(cond)) { const r = ratioOf(value, cond); return r >= 1 ? 1 : clamp(r, 0.5, 1); }
  return clamp(value / (cond + 2), 0.5, 1.2);
}

/**
 * Does a material meet a slot condition? m = { id, attrs, tags, weight, stack }.
 * → { ok, near, fit, lack: [{ attr, have, need }] }. Only `≥` conditions enter the fit average (§11.7 example);
 * a range that is missed multiplies the fit by its ratio.
 */
export function testCond(m, c) {
  if (c.anyOf) {
    let best = FAIL;
    for (const alt of c.anyOf) {
      const r = testCond(m, { need: { ...(c.need || {}), ...(alt.need || {}) }, tags: alt.tags ?? c.tags, ids: alt.ids ?? c.ids, maxW: c.maxW, water: c.water });
      if (condScore(r) > condScore(best)) best = r;
    }
    return best;
  }
  if (c.ids && !c.ids.includes(m.id)) return FAIL;
  if (c.tags && !c.tags.some((t) => (m.tags || []).includes(t))) return FAIL;
  if (c.maxW != null && (m.weight ?? 0) > c.maxW) return FAIL;
  if (c.water) { const w = m.stack?.water; if (!w || w.src === 'sea' || (w.cups ?? 0) < c.water) return FAIL; }
  let ok = true, near = true, sum = 0, cnt = 0, pen = 1;
  const lack = [];
  for (const [k, cond] of Object.entries(c.need || {})) {
    const v = m.attrs?.[k] || 0;
    const r = ratioOf(v, cond);
    if (r < 1) { ok = false; lack.push({ attr: k, have: v, need: cond }); if (r < 0.6) near = false; }
    if (Array.isArray(cond)) { if (r < 1) pen *= Math.max(0.5, r); } else { sum += fitOf(v, cond); cnt++; }
  }
  const fit = (cnt ? sum / cnt : 1) * pen;
  if (ok) return { ok: true, near: false, fit, lack };
  return near ? { ok: false, near: true, fit, lack } : { ok: false, near: false, fit: 0, lack };
}
const condScore = (r) => (r.ok ? 2 : r.near ? 1 : 0) + r.fit / 10;

/** §11.7 rank: 0 粗悪 · 1 並 · 2 良 · 3 上等 · 4 逸品 */
export function rankOf(q) { return q < 25 ? 0 : q < 50 ? 1 : q < 75 ? 2 : q < 90 ? 3 : 4; }

/** §11.7 mood term: morale > 80 +5 / < 30 −10; night without light −10; hurt hand −10 */
export function moodOf(c = {}) {
  let m = 0;
  if ((c.morale ?? 50) > 80) m += 5; else if ((c.morale ?? 50) < 30) m -= 10;
  if (c.night && !c.lit) m -= 10;
  if (c.handInjured) m -= 10;
  return m;
}

/**
 * §11.7 quality. o = { slots: [{ fit, m } | { fm }] (required, equal weights), optional: [{ fit, m }] (+0.1 × fit × m each,
 * at most +0.2), base? (overrides the slot sum), tool, skill (craft Lv), score (minigame 0–1; null = button +4),
 * noMini, mood, noise, extra (over-count units: +3 each, ≤ +12), bonus, cap } → { q, base, tool, skill, mood, noise, over, bonus }
 */
export function qualityOf(o = {}) {
  const fm = (s) => s.fm ?? (s.fit ?? 1) * (s.m ?? 1);
  let base = o.base;
  if (base == null) {
    const req = o.slots || [];
    base = req.length ? (70 * req.reduce((a, s) => a + fm(s), 0)) / req.length : 0;
    let ow = 0;
    for (const s of o.optional || []) {
      const w = Math.min(0.1, 0.2 - ow);
      if (w <= 0) break;
      base += 70 * w * fm(s);
      ow += w;
    }
  }
  const mini = o.noMini ? 0 : o.score == null ? 4 : 8 * clamp(o.score, 0, 1);
  const skill = (o.skill || 0) * 2 + mini;
  const over = Math.min(12, 3 * (o.extra || 0));
  const raw = base + (o.tool || 0) + skill + (o.mood || 0) + (o.noise || 0) + over + (o.bonus || 0);
  let q = clamp(Math.round(raw), 1, 100);
  if (o.cap != null) q = Math.min(q, o.cap);
  return { q, base: r2(base), tool: o.tool || 0, skill: r2(skill), mood: o.mood || 0, noise: r2(o.noise || 0), over, bonus: o.bonus || 0 };
}

/** §11.4 carve: a point on wood / bone / bamboo = min(tool sharp − 1, hard − 1), capped wood 3, bone 6, bamboo 5 */
export function carvePoint(m, toolSharp) {
  const tags = m.tags || [];
  const cap = m.id === 'bamboo' || m.id === 'bamboo_strip' ? 5 : tags.includes('bone') ? 6 : tags.includes('wood') || tags.includes('plant') ? 3 : null;
  if (cap == null) return m.attrs?.sharp || 0;               // stone, metal: a knife does not sharpen them
  return Math.max(0, Math.min((toolSharp || 0) - 1, (m.attrs?.hard || 0) - 1, cap));
}

function tidy(o) {
  const out = {};
  for (const k of ATTRS) { const v = Math.round(clamp(o[k] || 0, 0, 10)); if (v > 0) out[k] = v; }
  return out;
}
const maxOf = (units, k) => units.reduce((a, u) => Math.max(a, u.attrs[k] || 0), 0);

/**
 * §11.4: the attributes a result inherits. items = [{ attrs, n?, weight?, role? ('bind' | 'part' | 'tool'), id?, tags? }].
 *   tie   hard / sharp = max, long = max + second × 0.5, heavy = sum (≤ 10), other = max; the cord's (role 'bind', or
 *         the best fiber ≥ 3 when no roles are given) attributes vanish into the knot.
 *   carve the material's, with o.point: sharp = carvePoint (o.toolSharp)
 *   weave 3–5 (なう): averages, fiber = min(10, max + 2), long = avg + 1, flex ≥ 5;
 *         6+ (編む): averages, waterproof / insul = avg + 1 (+1 more when o.q ≥ 50), container = basket 2 + n/4 (≤ 7) else 0
 *   mix   weight-weighted average; toxic / med / scent / sticky = max − 1; o.water: sticky − 2
 *   knap  o.kind 'shard': sharp = flakeSharp; 'powder': absorb + 1; 'crushed': fiber + 1, tinder + 1
 *   heat  o.kind 'harden': hard + 1, sharp + 1; 'pottery': hard 6 waterproof 8 heatproof 9 sticky 0
 *   pack  the base's, with o.coat: toxic / waterproof / sticky = max(own, coat − 1)
 * Integers 0–10, zeros omitted (o.raw keeps the unrounded numbers).
 */
export function inheritAttrs(method, items, o = {}) {
  const list = (items || []).filter((i) => i && i.attrs && i.role !== 'tool');
  const units = [];
  for (const i of list) for (let k = 0; k < Math.max(1, Math.round(i.n ?? 1)); k++) units.push(i);
  let out = {};
  switch (method) {
    case 'tie': {
      let binds = units.filter((u) => u.role === 'bind');
      if (!binds.length && !list.some((i) => i.role)) {
        const c = units.filter((u) => (u.attrs.fiber || 0) >= 3).sort((a, b) => b.attrs.fiber - a.attrs.fiber)[0];
        if (c && units.length > 1) binds = [c];
      }
      const parts = units.filter((u) => !binds.includes(u));
      for (const k of ATTRS) {
        const vals = parts.map((p) => p.attrs[k] || 0).filter((v) => v > 0).sort((a, b) => b - a);
        if (!vals.length) continue;
        out[k] = k === 'long' ? vals[0] + 0.5 * (vals[1] || 0) : k === 'heavy' ? vals.reduce((a, b) => a + b, 0) : vals[0];
      }
      break;
    }
    case 'carve': {
      const m = units[0];
      if (!m) break;
      out = { ...m.attrs };
      if (o.point) out.sharp = Math.max(out.sharp || 0, carvePoint(m, o.toolSharp ?? 0));
      break;
    }
    case 'weave': {
      const n = units.length;
      if (!n) break;
      for (const k of ATTRS) out[k] = units.reduce((a, u) => a + (u.attrs[k] || 0), 0) / n;
      if (n < 6) {
        out.fiber = Math.min(10, maxOf(units, 'fiber') + 2);
        out.long = Math.min(10, out.long + 1);
        out.flex = Math.max(out.flex, 5);
      } else {
        const plus = 1 + ((o.q ?? 0) >= 50 ? 1 : 0);
        out.waterproof += plus;
        out.insul += plus;
        out.container = o.shape === 'basket' ? Math.min(7, 2 + n / 4) : 0;
      }
      break;
    }
    case 'mix': {
      let tw = 0;
      const s = {};
      for (const u of units) { const w = u.weight ?? 1; tw += w; for (const k of ATTRS) s[k] = (s[k] || 0) + (u.attrs[k] || 0) * w; }
      for (const k of ATTRS) out[k] = tw ? s[k] / tw : 0;
      for (const k of ['toxic', 'med', 'scent', 'sticky']) { const mx = maxOf(units, k); out[k] = mx > 0 ? mx - 1 : 0; }
      if (o.water) out.sticky = Math.max(0, out.sticky - 2);
      break;
    }
    case 'knap': {
      const m = units[0];
      if (!m) break;
      out = { ...m.attrs };
      if (o.kind === 'shard') { out.sharp = flakeSharp(m.attrs.sharp, o.score); out.heavy = Math.floor((out.heavy || 0) / 2); delete out.container; }
      else if (o.kind === 'powder') { out.absorb = (out.absorb || 0) + 1; delete out.sharp; delete out.container; out.hard = 0; }
      else if (o.kind === 'crushed') {
        if (out.fiber) out.fiber += 1;
        if (out.tinder) out.tinder += 1;
        out.long = Math.max(0, (out.long || 0) - 2);
        out.container = 0;
      }
      break;
    }
    case 'heat': {
      const m = units[0];
      if (!m) break;
      out = { ...m.attrs };
      if (o.kind === 'harden') { out.hard = (out.hard || 0) + 1; out.sharp = (out.sharp || 0) + 1; }
      else if (o.kind === 'pottery') out = { hard: 6, waterproof: 8, heatproof: 9, heavy: Math.min(10, out.heavy || 0) };
      break;
    }
    case 'pack': {
      const base = units[0];
      if (!base) break;
      out = { ...base.attrs };
      if (o.coat) for (const c of units.slice(1)) for (const k of ['toxic', 'waterproof', 'sticky']) if ((c.attrs[k] || 0) > 1) out[k] = Math.max(out[k] || 0, c.attrs[k] - 1);
      break;
    }
    default:
      out = { ...(units[0]?.attrs || {}) };
  }
  return o.raw ? out : tidy(out);
}

/** slot view handed to recipe.stats: { n, items, a (max), avg, ids, tags, first, q } */
function viewOf(items) {
  const a = {}, avg = {};
  for (const k of ATTRS) {
    let mx = 0, sm = 0;
    for (const it of items) { const v = it.attrs[k] || 0; if (v > mx) mx = v; sm += v; }
    if (mx) a[k] = mx;
    if (sm) avg[k] = sm / items.length;
  }
  return { n: items.length, items, a, avg, ids: [...new Set(items.map((i) => i.id))], tags: [...new Set(items.flatMap((i) => i.tags || []))],
    first: items[0], q: items.reduce((s, i) => s + i.q, 0) / items.length };
}

/** specificity of a way to make a template (ranking tie-break): Σ minimums + 3 per gate */
function specificity(v) {
  if (v._spec != null) return v._spec;
  let s = 0;
  for (const sl of v.slots) {
    if (sl.optional) continue;
    for (const c of Object.values(sl.need || {})) s += Array.isArray(c) ? c[0] : c;
    s += 3 * ((sl.tags ? 1 : 0) + (sl.ids ? 1 : 0) + (sl.maxW != null ? 1 : 0) + (sl.water ? 1 : 0) + (sl.anyOf ? 1 : 0));
  }
  v._spec = s;
  return s;
}

const KIND_ORDER = { recipe: 0, crude: 1, generic: 2 };
function byRank(a, b) {
  return (KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    || ((P_ORDER[a.recipe?.p] ?? 0) - (P_ORDER[b.recipe?.p] ?? 0))
    || (b.units - a.units)
    || (specificity(b.variant) - specificity(a.variant))
    || (b.score - a.score)
    || (a.order - b.order);
}

// ---------------------------------------------------------------- the system

export class Crafting {
  /** @param {{ itemDef: Function, attrsOf?: Function, inventory?: object, rng?: object|Function, getContext?: Function }} deps */
  constructor({ itemDef, attrsOf, inventory, rng, getContext } = {}) {
    if (!itemDef) throw new Error('Crafting needs itemDef');
    this.itemDef = itemDef;
    this.attrsOf = attrsOf || ((s) => s.attrs || itemDef(s.id, s)?.attrs || {});
    this.inv = inventory || null;
    this.rng = rng || null;
    this.getContext = getContext || (() => ({}));
    this.made = {};   // template id → { n, bestQ, firstDay, fine }
    this.found = {};  // generic result id → times made
  }

  // ---------------------------------------------------------------- public API

  /**
   * Up to 3 things the bench could become with this method (§11.10 ②): templates, near templates, the generic result
   * (and, when there is room, one template that lacks a single slot, with `ready: false`).
   * Returns an array of candidates { kind: 'recipe' | 'crude' | 'generic', id, name, icon, q (predicted), rank, rankName,
   * desc, hint (only for an undiscovered template: 「？？？（…）」), known, missing: [hints], uses: { uid: n },
   * tools: { uid: n }, ready, minutes, warnings, placed?, readyInMinutes? }. The array also carries `.candidates`
   * (itself), `.method`, `.missingTool` (what the method lacks: blade / fire / hammer stone) and `.blocked`.
   * @param {string} method  tie | carve | weave | mix | knap | heat | pack
   * @param {Array|object} uids  bench units (see the file header)
   * @param {{ score?: number }} [opts]  a minigame score to predict with (default: the button, +4)
   */
  preview(method, uids, opts = {}) {
    const ctx = this._ctx();
    const res = this._candidates(method, uids, ctx);
    const list = res.list.map((c) => this._public(c, ctx, opts));
    list.candidates = list;
    list.method = method;
    list.missingTool = res.missingTool || undefined;
    list.blocked = res.blocked || undefined;
    return list;
  }

  /**
   * Make it: consumes the used units (not tools, not leftovers), computes Q (§11.7), inherits attributes (§11.4) and
   * adds the result to the inventory. → { ok, stack, stacks, recipe (template id | null), id, kind, first, q, rank,
   * rankName, minutes, message, morale, warnings, events, toolWear, placed?, readyInMinutes?, pending? }.
   * Placed jobs (pottery firing, charcoal, salt, salting) are not added: `pending.stacks` is what the game gives after
   * `readyInMinutes`. On failure: { ok: false, message, reason, missing, redirect? }.
   * @param {string} method
   * @param {Array|object} uids
   * @param {{ score?: number, id?: string, kind?: string }} [opts]  minigame score 0–1; which candidate (default: the first ready one)
   */
  craft(method, uids, opts = {}) {
    const ctx = this._ctx();
    const res = this._candidates(method, uids, ctx);
    const pool = res.all;
    let c = null;
    if (opts.id != null || opts.kind) c = pool.find((x) => (opts.id == null || x.id === opts.id) && (!opts.kind || x.kind === opts.kind)) || null;
    else c = res.list.find((x) => x.ready) || null;
    if (!c && !res.list.length) {
      const why = res.blocked || 'この 組み合わせでは 作れない';
      return { ok: false, message: why, reason: why, missing: res.blocked ? [res.blocked] : [], missingTool: res.missingTool || null };
    }
    c ??= res.list[0];
    if (!c.ready) {
      const why = c.block || c.missing?.[0] || this._missingOf(c)[0] || '足りない 物が ある';
      return { ok: false, message: why, reason: why, missing: c.kind === 'generic' ? c.missing : this._missingOf(c), redirect: c.redirect || null, missingTool: res.missingTool || null };
    }
    const qi = this._quality(c, ctx, { score: opts.score ?? null, noise: true });
    const Q = qi.q;
    const out = c.kind === 'generic' ? c.build(Q, ctx, opts) : this._buildTemplate(c, Q, ctx, opts);
    this._consume(c, out);
    let toolWear = out.toolWear ?? (c.method === 'carve' && ctx.held && !c.variant?.noBlade && this._blade(ctx.held) ? 1 : 0);
    let toolBroken = false;
    if (toolWear && ctx.held && ctx.held.dur != null) { ctx.held.dur = Math.max(0, ctx.held.dur - toolWear); toolBroken = ctx.held.dur === 0; }
    const placed = !!out.placed;
    const stacks = placed ? [] : (out.stacks || []).map((s) => this._add(s));
    const stack = placed ? null : stacks[0] ?? out.stack ?? null;

    // recipe book (§11.1) and morale (§11.7 rank table)
    let first = false, morale = 0;
    const rank = rankOf(Q);
    if (c.kind !== 'generic') {
      const id = c.recipe.id;
      first = !this.made[id];
      const rec = this.made[id] || (this.made[id] = { n: 0, bestQ: 0, firstDay: ctx.day ?? null, fine: false });
      rec.n++;
      rec.bestQ = Math.max(rec.bestQ, Q);
      if (rank === 4) morale += RANKS[4].morale;
      else if (rank === 3 && !rec.fine) morale += RANKS[3].morale;
      if (rank >= 3) rec.fine = true;
    } else if (c.id) {
      first = !this.found[c.id];
      this.found[c.id] = (this.found[c.id] || 0) + 1;
      if (c.id === 'mud_ball' && first) morale += 1;     // §11.8 ③ 泥だんご: 気力 ＋1（初回）
    }
    const minutes = this._minutes(c.minutes, ctx);
    const showName = out.name || (stack ? this._displayName(stack, ctx) : c.name);
    let message = out.message || `${showName}（${RANKS[rank].name}・Q${Q}）が できた`;
    if (placed && !out.message) message = `${showName}を 仕掛けた（${out.wait} 分後に できあがる）`;
    if (first && c.kind !== 'generic') message += '　初めて 作った！';
    if (toolBroken) message += '　刃物が 壊れた…';
    return {
      ok: true, stack, stacks, recipe: c.kind === 'generic' ? null : c.recipe.id, id: c.id, kind: c.kind, first, q: Q, rank,
      rankName: RANKS[rank].name, minutes, message, reason: null, morale, warnings: c.warnings || [], events: out.events || [],
      toolWear, toolBroken, quality: qi, placed, readyInMinutes: placed ? out.wait : 0,
      pending: placed ? { stacks: out.stacks || [], readyInMinutes: out.wait } : null,
    };
  }

  /**
   * The recipe book (§11.1): every template with its 「？？？」 hint. known = made at least once, or shown by the
   * field guide (all) / a K3 herb (the poultice and tea, §20.3).
   * → [{ id, name, icon, method, methods, methodName, known, discovered, made, bestQ, hint, desc, recipe, p, group }]
   */
  book() {
    const ctx = this._ctx();
    const herbK3 = this._herbKnown(ctx);
    return RECIPE_LIST.filter((r) => !ctx.maxP || P_ORDER[r.p] <= P_ORDER[ctx.maxP]).map((r) => {
      const m = this.made[r.id];
      const shown = !!m || !!ctx.hasGuide || (herbK3 && MED_TEMPLATES.includes(r.id));
      const def = r.out.from ? null : this.itemDef(r.out.id);
      const v = variantsOf(r);
      return {
        id: r.id, name: shown ? r.name : '？？？', icon: shown ? def?.icon || '✨' : '？', method: r.method,
        methods: [...new Set(v.map((x) => x.method))], methodName: METHODS[r.method].name, known: shown, discovered: !!m,
        made: m?.n || 0, bestQ: m?.bestQ ?? null, hint: recipeHint(r), desc: shown ? r.perf : null,
        recipe: shown ? v[0].slots.map((s) => `${slotText(s)}${s.optional ? '（任意）' : ''}`).join(' ＋ ') : null, p: r.p, group: r.group,
      };
    });
  }

  /**
   * §11.7 修理: one unit of a material that fits one of the item's slots → durability +50 % of its maximum (≤ 100 %),
   * Q unchanged. → { ok, stack, added, message } | { ok: false, message, reason }
   */
  repair(uid, materialUid) {
    const fail = (m) => ({ ok: false, message: m, reason: m });
    const st = this.inv?.get?.(uid), mat = this.inv?.get?.(materialUid);
    if (!st || !mat) return fail('見つからない');
    if (uid === materialUid) return fail('それ自身では 直せない');
    const def = this.itemDef(st.id, st) || {};
    const max = st.stats?.durability ?? def.tool?.durability ?? def.wear?.days ?? null;
    if (st.dur == null || !max) return fail('直す ものでは ない');
    if (st.dur >= max) return fail('傷んで いない');
    const conds = this._repairConds(st.id);
    const m = this._mat(mat);
    if (!conds.some((c) => testCond(m, c).ok)) return fail(`${this._displayName(mat)}では 直せない`);
    this.inv.take(materialUid, 1);
    const before = st.dur;
    st.dur = Math.min(max, st.dur + Math.ceil(max * 0.5));
    this.inv.changed?.();
    return { ok: true, stack: st, added: st.dur - before, message: `${this._displayName(st)}を 直した（耐久 ${st.dur}/${max}）`, reason: null };
  }

  /**
   * §11.7 作り直し: take one crafted thing apart. Cords and handles come back 80 % each, blades always; a bundle or a
   * filled container gives everything back. → { ok, stacks (returned), lost: [{ id, n }], message }
   */
  disassemble(uid) {
    const fail = (m) => ({ ok: false, message: m, reason: m });
    const st = this.inv?.get?.(uid);
    if (!st) return fail('見つからない');
    const back = [], lost = [];
    if (st.contents?.length || st.vessel) {
      for (const c of [st.vessel, ...(st.contents || [])]) if (c) back.push({ ...c, uid: undefined });
    } else if (st.parts?.length) {
      for (const p of st.parts) {
        let k = 0;
        for (let j = 0; j < p.n; j++) if ((p.back ?? 0) >= 1 || this._rand() < (p.back ?? 0)) k++;
        if (k) back.push(this._stack(p.id, k, p));
        if (p.n - k > 0) lost.push({ id: p.id, n: p.n - k });
      }
    } else return fail('これは ばらせない');
    this.inv.take(uid, 1);
    const stacks = back.map((s) => { delete s.uid; return this._add(s); });
    const name = this._displayName(st);
    return { ok: true, stacks, lost, message: `${name}を ばらした${lost.length ? '（一部は 使えなく なった）' : ''}`, reason: null };
  }

  /** recipe book for the save (§17.3) */
  serialize() { return { v: 1, made: JSON.parse(JSON.stringify(this.made)), found: { ...this.found } }; }
  /** @param {{ made?: object, found?: object }} d */
  deserialize(d) {
    this.made = d?.made ? JSON.parse(JSON.stringify(d.made)) : {};
    this.found = d?.found ? { ...d.found } : {};
  }

  // ---------------------------------------------------------------- context, randomness, materials

  _ctx() {
    const c = { ...(this.getContext?.() || {}) };
    c.morale ??= 50;
    c.skillCraft ??= 0;
    c.held ??= null;
    return c;
  }

  _rand() {
    const r = this.rng;
    if (typeof r === 'function') return r();
    if (r?.next) return r.next();
    if (r?.float) return r.float();
    return Math.random();
  }

  /** a material descriptor of a stack */
  _mat(stack, avail = 1, extra = {}) {
    const def = this.itemDef(stack.id, stack) || { name: stack.id, attrs: {}, tags: [], weight: 0.3 };
    const q = stack.q ?? 50;
    return { uid: stack.uid, id: stack.id, stack, def, attrs: this.attrsOf(stack) || {}, tags: def.tags || [], weight: def.weight ?? 0.3,
      q, m: 0.5 + 0.5 * clamp(q, 0, 100) / 100, avail, ...extra };
  }

  _pool(uids, ctx) {
    const want = new Map();
    const add = (u, n) => { if (u == null) return; const k = typeof u === 'string' && /^\d+$/.test(u) ? Number(u) : u; want.set(k, (want.get(k) || 0) + (n ?? 1)); };
    if (Array.isArray(uids)) for (const u of uids) { if (Array.isArray(u)) add(u[0], u[1]); else if (u && typeof u === 'object') add(u.uid, u.n); else add(u, 1); }
    else if (uids && typeof uids === 'object') for (const [k, v] of Object.entries(uids)) add(k, v);
    const entries = [];
    for (const [uid, n] of want) {
      const st = this.inv?.get?.(uid) || (ctx.held && ctx.held.uid === uid ? ctx.held : null);
      if (!st || !(st.n > 0) || n <= 0) continue;
      entries.push(this._mat(st, Math.min(n, st.n), { idx: entries.length, isHeld: !!(ctx.held && ctx.held.uid === uid) }));
    }
    let held = null;
    if (ctx.held && !want.has(ctx.held.uid)) held = this._mat(ctx.held, 1, { idx: entries.length, isHeld: true, toolOnly: true });
    return { entries, held, all: held ? [...entries, held] : entries };
  }

  _blade(held) {
    if (!held) return null;
    const d = this.itemDef(held.id, held) || {};
    const a = this.attrsOf(held) || {};
    const sharp = Math.max(a.sharp || 0, d.tool?.sharp || 0, held.stats?.sharp || 0);
    if (sharp < 4) return null;
    // §11.7 tool term: take-along knife +20 (§3), stone flake −10, hand-made knife −10 + Q/5, other blades (sharp − 5) × 3
    const bonus = d.perk?.craftSharpQ ?? held.stats?.carve ?? d.tool?.carve ?? (sharp - 5) * 3;
    return { stack: held, sharp, bonus };
  }

  _isHammer(m) { return (m.attrs.hard || 0) >= 7 && (m.attrs.heavy || 0) >= 4; }

  _knows(m, ctx) {
    if (ctx.hasGuide) return true;
    const k = ctx.knowledge;
    if (!k?.level || !m.def?.guide) return true;
    return k.level(m.def.guide) >= 3;
  }

  _herbKnown(ctx) {
    const k = ctx.knowledge;
    if (!k?.level) return false;
    return HERBS.some((h) => k.level(h) >= 3);
  }

  _poison(m) {
    const p = m.def?.food?.poison;
    if ((m.attrs.toxic || 0) >= 3) return { id: p?.id || 'plant_poison', chance: p?.chance ?? 0.7, sev: Math.max(1, Math.round(m.attrs.toxic / 3)) };
    if (p) return { id: p.id, chance: p.chance ?? 0.7, sev: Math.max(1, (p.sev || [1])[0]), heatKills: !!p.heatKills };
    return null;
  }

  _displayName(stack, ctx = null) {
    if (!stack) return '';
    if (stack.name) return stack.name;
    const k = (ctx || this._ctx()).knowledge;
    const n = k?.nameOf?.(stack.id);
    return (n && n !== stack.id ? n : null) || this.itemDef(stack.id, stack)?.name || stack.id;
  }

  _diffDur(ctx) {
    const d = ctx.difficulty;
    if (d && typeof d === 'object') return d.durability ?? 1;
    return DIFF_DUR[d] ?? 1;
  }

  _minutes(base, ctx) {
    let m = base || 5;
    if (ctx.nearWorkbench) m *= 0.8;                              // §12.2 作業台
    m *= Math.max(0.5, 1 - 0.03 * (ctx.skillCraft || 0));        // §4.8 熟練: 所要 −3 % / Lv
    if ((ctx.morale ?? 50) < 30) m *= 1.2;                        // §4.5 落ち込み
    return Math.max(1, Math.round(m));
  }

  /** a new stack in the contract shape (the inventory gives it a uid) */
  _stack(id, n, o = {}) {
    const d = this.itemDef(id) || {};
    const s = {
      id, n, q: Math.round(clamp(o.q ?? 50, 1, 100)), fresh: o.fresh ?? (d.food ? 100 : null), done: o.done ?? 0, proc: o.proc ?? 'none',
      dur: o.dur ?? null, wet: Math.round(o.wet ?? 0),
    };
    for (const k of ['attrs', 'stats', 'name', 'water', 'contents', 'vessel', 'parts', 'mix', 'toxicMix', 'stage']) if (o[k] != null) s[k] = o[k];
    if (s.attrs && sameAttrs(s.attrs, d.attrs || {})) delete s.attrs;
    return s;
  }

  _copy(stack, n, over = {}) {
    const s = JSON.parse(JSON.stringify({ ...stack, n }));
    delete s.uid;
    return Object.assign(s, over);
  }

  _add(s) {
    if (!this.inv) return s;
    if (this.inv.addStack) return this.inv.addStack(s) || s;
    return this.inv.add?.(s.id, s.n, s) || s;
  }

  _take(m, n) {
    if (n <= 0 || m.toolOnly) return;
    const got = this.inv?.take?.(m.uid, n);
    if (!got || !got.length) m.stack.n = Math.max(0, m.stack.n - n);   // a held stack that is not in the bag
  }

  // ---------------------------------------------------------------- matching templates

  /** best way to fill a template's slots: exact → near (crude) → one slot missing (a hint only) */
  _plan(r, v, pool) {
    return this._assign(r, v, pool, { allowNear: false, allowMissing: false })
      || this._assign(r, v, pool, { allowNear: true, allowMissing: false })
      || this._assign(r, v, pool, { allowNear: false, allowMissing: true });
  }

  _assign(r, v, pool, { allowNear, allowMissing }) {
    const slots = v.slots, ents = pool.all;
    const T = slots.map((s) => ents.map((e) => (e.toolOnly && s.consume !== false ? FAIL : testCond(e, s))));
    const req = [];
    slots.forEach((s, i) => { if (!s.optional) req.push(i); });
    if (!req.length) return null;
    let empty = 0;
    for (const si of req) if (!T[si].some((t) => t.ok || (allowNear && t.near))) empty++;
    if (empty > (allowMissing ? 1 : 0)) return null;
    if (allowMissing && empty === 0) return null;           // nothing is missing: the other passes decide

    const avail = ents.map((e) => e.avail);
    const cur = slots.map(() => null);
    let best = null, budget = 30000;
    const evaluate = (nearSi, missSi) => {
      let sum = 0;
      for (const si of req) {
        if (si === missSi) continue;
        const p = cur[si];
        sum += p.reduce((a, i) => a + T[si][i].fit * ents[i].m, 0) / p.length;
      }
      const score = sum / req.length;
      if (!best || score > best.score) best = { score, picks: cur.map((p) => (p ? p.slice() : null)), nearSi, missSi, avail: avail.slice() };
    };
    const rec = (ri, nearSi, missSi) => {
      if (--budget < 0) return;
      if (ri === req.length) { evaluate(nearSi, missSi); return; }
      const si = req[ri], need = slots[si].n ?? 1;
      const cands = [];
      for (let i = 0; i < ents.length; i++) { const t = T[si][i]; if (t.ok || (allowNear && t.near && (nearSi < 0 || nearSi === si))) cands.push(i); }
      const picks = [];
      const choose = (c0, left, isNear) => {
        if (budget < 0) return;
        if (left === 0) { cur[si] = picks.slice(); rec(ri + 1, isNear ? si : nearSi, missSi); cur[si] = null; return; }
        for (let c = c0; c < cands.length; c++) {
          const i = cands[c];
          if (avail[i] <= 0) continue;
          avail[i]--; picks.push(i);
          choose(c, left - 1, isNear || !T[si][i].ok);
          picks.pop(); avail[i]++;
        }
      };
      choose(0, need, false);
      if (allowMissing && missSi < 0) rec(ri + 1, nearSi, si);
    };
    rec(0, -1, -1);
    if (!best) return null;
    if (allowMissing && best.missSi < 0) return null;

    // optional slots (all n units or nothing), `max` (more of the same, no bonus), over-count extras (§11.7)
    const left = best.avail, picks = best.picks, extras = slots.map(() => []);
    const order = (si) => ents.map((_, i) => i).filter((i) => T[si][i].ok).sort((a, b) => T[si][b].fit * ents[b].m - T[si][a].fit * ents[a].m);
    slots.forEach((s, si) => {
      if (!s.optional || picks[si]) return;
      const need = s.n ?? 1, got = [];
      for (const i of order(si)) while (got.length < need && left[i] > 0) { left[i]--; got.push(i); }
      if (got.length === need) picks[si] = got; else for (const i of got) left[i]++;
    });
    slots.forEach((s, si) => {
      if (!picks[si] || !(s.max > (s.n ?? 1))) return;
      for (const i of order(si)) while (picks[si].length < s.max && left[i] > 0) { left[i]--; picks[si].push(i); }
    });
    let extra = 0;
    if (best.missSi < 0) {
      slots.forEach((s, si) => {
        if (!picks[si] || s.consume === false || !(s.more ?? (s.n ?? 1) >= 2)) return;
        for (const i of order(si)) while (extra < 4 && left[i] > 0) { left[i]--; extras[si].push(i); extra++; }
      });
    }
    let units = 0;
    picks.forEach((p) => { if (p) units += p.length; });
    return {
      kind: best.nearSi >= 0 ? 'crude' : 'recipe', recipe: r, variant: v, method: v.method, id: r.id, ents, T, picks, extras, extra,
      nearSi: best.nearSi, missSi: best.missSi, ready: best.missSi < 0, score: best.score, units, order: RECIPE_LIST.indexOf(r),
      minutes: r.minutes, warnings: [],
    };
  }

  _templateBlock(p, ctx, g) {
    const M = METHODS[p.method], r = p.recipe, v = p.variant;
    if (p.method === 'carve' && !g.blade && !v.noBlade && !r.bladeOptional) return `${M.hand.label}を 手に 持つ`;
    if (p.method === 'heat' && !g.fire) return '火の そばで ないと できない';
    if (g.units < (M.minUnits || 1)) return `${M.short}には ${M.minUnits} つ 以上 置く`;
    return null;
  }

  _views(plan) {
    const out = {};
    plan.variant.slots.forEach((s, si) => {
      const idx = [...(plan.picks[si] || []), ...(plan.extras[si] || [])];
      if (!idx.length) { out[s.key] = null; return; }
      out[s.key] = viewOf(idx.map((i) => { const e = plan.ents[i]; return { id: e.id, attrs: e.attrs, q: e.q, tags: e.tags, stack: e.stack, def: e.def, weight: e.weight, fit: plan.T[si][i].fit, m: e.m }; }));
    });
    return out;
  }

  _missingOf(plan) {
    if (plan.kind === 'generic') return plan.missing || [];
    const out = [];
    const slots = plan.variant.slots;
    if (plan.nearSi >= 0) {
      const s = slots[plan.nearSi];
      const lacks = plan.picks[plan.nearSi].flatMap((i) => plan.T[plan.nearSi][i].lack);
      const seen = new Set();
      for (const l of lacks) {
        if (seen.has(l.attr)) continue;
        seen.add(l.attr);
        const over = Array.isArray(l.need) && l.have > l.need[1];
        out.push(`${s.name}が ${over ? OVER[l.attr] || `${ATTR_TAG[l.attr]}が 強すぎる` : LACK[l.attr] || `${ATTR_TAG[l.attr]}が 足りない`} かも`);
      }
    }
    if (plan.missSi >= 0) out.push(`あと ${slotText(slots[plan.missSi])}`);
    if (plan.block) out.push(plan.block);
    return out;
  }

  // ---------------------------------------------------------------- candidates

  _candidates(method, uids, ctx) {
    const M = METHODS[method];
    if (!M) return { list: [], all: [], blocked: `「${method}」と いう 手法は ない` };
    const pool = this._pool(uids, ctx);
    if (!pool.entries.length) return { list: [], all: [], blocked: '素材を 作業台に 置いて ください' };
    const units = pool.entries.reduce((a, e) => a + e.avail, 0);
    const blade = this._blade(ctx.held);
    const fire = ctx.nearFire != null && ctx.nearFire !== false;
    const hammer = pool.all.some((e) => this._isHammer(e));
    const g = { blade, fire, units, hammer };
    const ready = [], hints = [];
    for (const r of RECIPE_LIST) {
      if (ctx.maxP && P_ORDER[r.p] > P_ORDER[ctx.maxP]) continue;
      let best = null;
      for (const v of variantsOf(r)) {
        if (v.method !== method) continue;
        const p = this._plan(r, v, pool);
        if (!p) continue;
        const block = this._templateBlock(p, ctx, g);
        if (block) { p.ready = false; p.block = block; }
        if (!best || (p.ready && !best.ready) || (p.ready === best.ready && byRank(p, best) < 0)) best = p;
      }
      if (!best) continue;
      best.warnings = this._warnings(method, best, ctx);
      (best.ready ? ready : hints).push(best);
    }
    ready.sort(byRank);
    const gen = this._generic(method, pool, ctx, g);
    const all = gen ? [...ready, gen] : [...ready];
    let list;
    const dupe = gen && ready.some((c) => c.kind === 'recipe' && c.recipe.out?.id === gen.id);
    if (gen && gen.ready && !dupe) list = ready.length >= 3 ? [...ready.slice(0, 2), gen] : [...ready, gen];
    else list = ready.slice(0, 3);
    if (list.length < 3) {
      const useful = hints.filter((h) => {
        const consumed = h.picks.reduce((a, p, si) => a + (p && h.variant.slots[si].consume !== false ? p.length : 0), 0);
        return consumed >= 1 && (h.missSi < 0 || h.units >= 2);
      }).sort((a, b) => (a.missSi < 0 ? 0 : 1) - (b.missSi < 0 ? 0 : 1) || byRank(a, b));
      if (useful[0]) { list.push(useful[0]); all.push(useful[0]); }
    }
    if (gen && !gen.ready && !list.some((c) => c.ready)) list.push(gen);
    list = list.slice(0, 3);
    let missingTool = null;
    if (!list.some((c) => c.ready)) {
      if (method === 'carve' && !blade) missingTool = M.hand.label;
      else if (method === 'heat' && !fire) missingTool = '火';
      else if (method === 'knap' && !hammer) missingTool = M.hand.label;
    }
    return { list, all, pool, missingTool, blocked: null };
  }

  /** §11.8 ④ — dangerous combinations, as warnings shown before making */
  _warnings(method, plan, ctx) {
    const w = [];
    const mats = plan.kind === 'generic' ? plan.mats || [] : plan.picks.flatMap((p, si) => (p && plan.variant.slots[si].consume !== false ? p.map((i) => plan.ents[i]) : []));
    if (['mix', 'heat', 'pack'].includes(method)) {
      const tox = mats.filter((m) => (m.attrs.toxic || 0) >= 3 && this._knows(m, ctx));
      const out = plan.kind === 'generic' ? plan.id : plan.recipe.id;
      if (tox.length && !['poison_tip', 'poison_paste', 'bait_ball'].includes(out)) w.push(`毒（${this._displayName(tox[0].stack, ctx)}）が 混ざる。食べると 中毒`);
    }
    if (method === 'heat') {
      if (mats.some((m) => m.id === 'stone')) w.push('川の 丸石は 15% で はぜる（やけど）');
      if (mats.some((m) => m.id === 'bamboo')) w.push('竹は 節で はぜる（大きな 音）');
      if (mats.some((m) => m.id === 'green_wood' || m.id === 'green_grass')) w.push('生木・生の 草は 濃い 煙が 出る');
      if (mats.filter((m) => m.id === 'fat' || m.id === 'resin').length >= 3) w.push('脂・樹脂を 3 つ 以上 → 炎が 急に 大きく なる（1m 以内 やけど 30%）');
    }
    if (method === 'pack' && mats.some((m) => m.stack.water?.src === 'sea') && mats.some((m) => m.stack.water && m.stack.water.src !== 'sea')) w.push('海水が 混ざると 全部 海水に なる');
    return w;
  }

  _public(c, ctx, opts) {
    const known = c.kind === 'generic' ? true : !!this.made[c.recipe.id] || !!ctx.hasGuide || (this._herbKnown(ctx) && MED_TEMPLATES.includes(c.recipe.id));
    let q = null;
    if (c.ready) q = this._quality(c, ctx, { score: opts.score ?? null, noise: false }).q;
    const uses = {}, tools = {};
    if (c.kind === 'generic') {
      for (const [i, n] of c.used || []) { const e = c.ents[i]; uses[e.uid] = (uses[e.uid] || 0) + n; }
      for (const [i, n] of c.tools || []) { const e = c.ents[i]; tools[e.uid] = (tools[e.uid] || 0) + n; }
    } else {
      c.variant.slots.forEach((s, si) => {
        for (const i of [...(c.picks[si] || []), ...(c.extras[si] || [])]) {
          const e = c.ents[i];
          const into = s.consume === false || e.toolOnly ? tools : uses;
          into[e.uid] = (into[e.uid] || 0) + 1;
        }
      });
      if (c.method === 'carve' && ctx.held && this._blade(ctx.held)) tools[ctx.held.uid] = 1;
    }
    let name, desc, hint = null, icon;
    if (c.kind === 'generic') { name = c.name; desc = c.desc || ''; icon = c.icon || (c.id ? this.itemDef(c.id)?.icon : '✨'); }
    else {
      const r = c.recipe;
      const outId = r.out.from ? null : r.out.id;
      icon = known ? (outId ? this.itemDef(outId)?.icon : '✨') || '✨' : '？';
      name = known ? (c.kind === 'crude' ? `粗悪な ${r.name}` : r.name) : (c.kind === 'crude' ? '粗悪な ？？？' : '？？？');
      desc = known ? r.perf : recipeHint(r);
      if (!known) hint = recipeHint(r);
    }
    const rank = q != null ? rankOf(q) : null;
    const out = {
      kind: c.kind, id: c.id, name, icon, q, rank, rankName: rank != null ? RANKS[rank].name : null, desc, hint, known,
      missing: c.kind === 'generic' ? c.missing || [] : this._missingOf(c), uses, tools, ready: !!c.ready,
      minutes: this._minutes(c.minutes, ctx), method: c.method, warnings: c.warnings || [],
    };
    if (c.placed || c.recipe?.wait) { out.placed = true; out.readyInMinutes = c.wait ?? c.recipe?.wait; }
    if (c.redirect) out.redirect = c.redirect;
    return out;
  }

  // ---------------------------------------------------------------- quality

  _quality(plan, ctx, { score = null, noise = false } = {}) {
    const blade = this._blade(ctx.held);
    let tool = (ctx.nearWorkbench ? 10 : 0) + (ctx.hasGuide ? 10 : 0);      // §12.2 作業台 / §3 図鑑
    if (plan.method === 'carve' && blade && !(plan.variant?.noBlade)) tool += blade.bonus;
    const mood = moodOf(ctx);
    let sc = score;
    if (plan.method === 'knap' && this._hammerTool(plan, ctx)) sc = Math.min(1, (sc ?? 0.5) + 0.1);   // §11.5 hammer
    const nz = noise ? -5 + 10 * this._rand() : 0;
    if (plan.kind === 'generic') {
      const ms = (plan.mats || []).map((m) => m.m);
      const base = ms.length ? 70 * ms.reduce((a, b) => a + b, 0) / ms.length : 35;   // generic: fit 1.0 (as §11.9)
      return qualityOf({ base, tool, skill: ctx.skillCraft, score: sc, mood, noise: nz, cap: plan.cap ?? null });
    }
    const r = plan.recipe, S = this._views(plan);
    if (r.q) {                                                             // a fixed formula (water filter)
      let q = clamp(Math.round(r.q(S)), 1, 100);
      if (plan.kind === 'crude') q = Math.min(q, 30);
      return { q, base: q, fixed: true, tool: 0, skill: 0, mood: 0, noise: 0, over: 0, bonus: 0 };
    }
    let cap = plan.kind === 'crude' ? 30 : null;
    if (r.notch && !blade) cap = Math.min(cap ?? 100, 30);                 // §22.9: no V-notch without a blade
    let bonus = 0;
    plan.variant.slots.forEach((s, si) => { if (s.qBonus && plan.picks[si]) bonus += s.qBonus; });
    if (r.qBonus) bonus += r.qBonus(S);
    if (r.qScore && score != null) {                                       // §9.3 knapping: Q = 20 + 60 s (obsidian +20)
      return qualityOf({ base: r.qScore(score, S), tool, skill: ctx.skillCraft, noMini: true, mood, bonus, cap });
    }
    const slots = [], optional = [];
    plan.variant.slots.forEach((s, si) => {
      const idx = plan.picks[si];
      if (!idx || s.qBonus) return;
      const fm = idx.reduce((a, i) => a + plan.T[si][i].fit * plan.ents[i].m, 0) / idx.length;
      (s.optional ? optional : slots).push({ fm });
    });
    return qualityOf({ slots, optional, tool, skill: ctx.skillCraft, score: sc, mood, noise: nz, extra: plan.extra, bonus, cap });
  }

  _hammerTool(plan, ctx) {
    if (ctx.held?.id === 'hammer') return true;
    if (plan.kind === 'generic') return (plan.mats || []).some((m) => m.id === 'hammer');
    return plan.picks.some((p) => p && p.some((i) => plan.ents[i].id === 'hammer'));
  }

  // ---------------------------------------------------------------- making a template

  _buildTemplate(plan, Q, ctx, opts) {
    const r = plan.recipe, v = plan.variant, S = this._views(plan);
    const blade = this._blade(ctx.held);
    const x = { score: opts.score ?? null, extra: plan.extra, crude: plan.kind === 'crude', notch: !!blade, ctx, Q };
    const consumedSlots = v.slots.map((s, si) => (s.consume !== false && S[s.key] ? si : -1)).filter((si) => si >= 0);
    x.attrs = this._inherit(plan, S, Q, blade);
    const stats = {};
    for (const [k, val] of Object.entries(r.stats ? r.stats(Q, S, x) || {} : {})) stats[k] = typeof val === 'number' ? r3(val) : val;

    const wet = Math.max(0, ...consumedSlots.flatMap((si) => S[v.slots[si].key].items.map((it) => it.stack.wet || 0)));
    if (r.special === 'coconut') return this._makeCoconut(plan, S, Q);
    if (r.special === 'coat') return this._makeCoat(plan, S, Q, stats);

    let outId = r.out.id;
    const def = this.itemDef(outId) || {};
    let attrs = x.attrs ? { ...x.attrs } : { ...(def.attrs || {}) };
    for (const [k, val] of Object.entries(stats)) if (STAT_ATTRS.has(k) && typeof val === 'number') attrs[k] = val;
    if (r.setAttrs) Object.assign(attrs, r.setAttrs);
    attrs = tidy(attrs);

    // durability: crude ×0.4 (§11.8 ①), over-count +10 % each (§11.7), difficulty (§17.1)
    const durMul = (plan.kind === 'crude' ? 0.4 : 1) * (1 + 0.1 * plan.extra) * this._diffDur(ctx);
    const baseDur = stats.durability ?? (def.wear ? stats.days ?? def.wear.days : def.tool?.durability ?? null);
    let dur = null;
    if (baseDur != null) { dur = Math.max(1, Math.round(baseDur * durMul)); if (stats.durability != null) stats.durability = dur; }
    if (stats.days != null) stats.days = r2(stats.days * durMul);
    if (plan.extra) stats.size = r2(1 + 0.1 * plan.extra);
    if (Q < 25) stats.breakChance = Math.max(stats.breakChance || 0, RANKS[0].breakChance);
    if (Q >= 90) stats.masterpiece = 1;
    const name = plan.kind === 'crude' ? `粗悪な ${def.name || r.name}` : null;
    const parts = (v.method === 'tie' || v.method === 'pack') && (r.out.n ?? 1) === 1 ? this._partsOf(plan, consumedSlots) : null;

    if (r.special === 'batch') {                                           // charcoal: 2 + floor(Q/40), placed 4 h
      const n = stats.count ?? 2;
      return { placed: true, wait: r.wait, stacks: [this._stack(outId, n, { q: Q })], name: `${r.name}（炭 ×${n}）` };
    }
    if (r.special === 'greenware') {                                       // clay pot: shaped now, dried and fired later
      return { stacks: [this._stack(outId, 1, { q: Q, attrs, name, stats: { ...stats, shapeQ: Q } })], name: name || def.name };
    }
    const brew = this._brew(plan);
    const n = r.out.n ?? 1;
    const out = this._stack(outId, n, { q: Q, attrs, stats, name, dur, wet, parts });
    if (brew) out.fresh = 100;
    return { stacks: [out] };
  }

  /** attributes the template result inherits (§11.4); null = the definition's */
  _inherit(plan, S, Q, blade) {
    const r = plan.recipe, v = plan.variant, m = plan.method;
    const consumed = v.slots.filter((s) => s.consume !== false && S[s.key]);
    if (m === 'tie') return inheritAttrs('tie', consumed.map((s) => ({ attrs: S[s.key].a, role: s.bind ? 'bind' : 'part' })));
    if (m === 'weave') return inheritAttrs('weave', consumed.flatMap((s) => S[s.key].items.map((it) => ({ attrs: it.attrs }))), { q: Q, shape: r.shape });
    if (m === 'mix') return inheritAttrs('mix', consumed.flatMap((s) => S[s.key].items.map((it) => ({ attrs: it.attrs, weight: it.weight }))));
    if (m === 'carve') { const main = S[v.slots[0].key].first; return inheritAttrs('carve', [main], { point: r.point, toolSharp: blade?.sharp ?? 0 }); }
    if (r.special === 'flake') return { ...S.core.first.attrs };
    return null;
  }

  _partsOf(plan, slotIdx) {
    const map = new Map();
    for (const si of slotIdx) {
      const s = plan.variant.slots[si];
      const back = s.back ?? (s.bind ? 0.8 : s.need?.sharp ? 1 : 0);
      for (const i of plan.picks[si] || []) {
        const e = plan.ents[i];
        const key = `${si}:${i}`;
        const p = map.get(key) || { id: e.id, n: 0, q: e.q, back, slot: s.key, attrs: e.stack.attrs, stats: e.stack.stats, name: e.stack.name, dur: e.stack.dur };
        p.n++;
        map.set(key, p);
      }
    }
    return [...map.values()].map((p) => JSON.parse(JSON.stringify(p)));
  }

  /** a vessel slot that gives one cup of its water (herb tea, soap) */
  _brew(plan) {
    if (plan.recipe.special !== 'brew') return null;
    const si = plan.variant.slots.findIndex((s) => s.water);
    const i = plan.picks[si]?.[0];
    return i != null ? plan.ents[i] : null;
  }

  /** §11.4 knap: a coconut → two shell bowls (one holding its water) + the meat */
  _makeCoconut(plan, S, Q) {
    const nut = S.nut.first;
    const stage = nut.stack.stage && nut.def?.food?.stage?.[nut.stack.stage];
    const cups = nut.id === 'coconut' ? Math.min(1, Math.max(0.5, (stage?.water ?? 20) / 20)) : 0;
    const out = [this._stack('shell_bowl', 1, { q: Q, water: cups ? { src: 'coconut_water', cups, treat: 'none' } : null }), this._stack('shell_bowl', 1, { q: Q })];
    if (this.itemDef('coconut_meat')) out.push(this._stack('coconut_meat', 1, { q: nut.q, fresh: nut.stack.fresh ?? 100 }));
    return { stacks: out, name: 'ヤシ殻の 器 ×2・果肉・ヤシの 水' };
  }

  /** §11.4 pack: poison on arrows / spears — the same weapons, coated (toxic = poison − 1) */
  _makeCoat(plan, S, Q, stats) {
    const out = [];
    const seen = new Map();
    for (const i of plan.picks[plan.variant.slots.findIndex((s) => s.key === 'weapon')]) seen.set(i, (seen.get(i) || 0) + 1);
    for (const [i, n] of seen) {
      const e = plan.ents[i];
      const attrs = tidy({ ...e.attrs, toxic: Math.max(e.attrs.toxic || 0, stats.toxic || 0) });
      const base = e.stack.name || e.def.name;
      out.push(this._copy(e.stack, n, { attrs, stats: { ...(e.stack.stats || {}), ...stats, poisonQ: Q }, name: `毒を ぬった ${base}` }));
    }
    return { stacks: out };
  }

  _consume(plan, out) {
    const counts = new Map();
    const bump = (i, n = 1) => counts.set(i, (counts.get(i) || 0) + n);
    if (plan.kind === 'generic') {
      for (const [i, n] of plan.used || []) bump(i, n);
      if (out.moveTools) for (const [i, n] of plan.tools || []) bump(i, n);
    } else {
      plan.variant.slots.forEach((s, si) => {
        if (s.consume === false) return;
        for (const i of [...(plan.picks[si] || []), ...(plan.extras[si] || [])]) bump(i);
      });
      const v = this._brew(plan);
      if (v?.stack.water) { v.stack.water.cups = Math.max(0, (v.stack.water.cups || 0) - 1); if (!v.stack.water.cups) delete v.stack.water; }
    }
    for (const [i, n] of counts) this._take(plan.ents[i], n);
    this.inv?.changed?.();
  }

  // ---------------------------------------------------------------- generic results (§11.8 ③)

  _generic(method, pool, ctx, g) {
    const E = pool.all;
    const U = [];
    pool.entries.forEach((e, i) => { for (let k = 0; k < e.avail; k++) U.push(i); });
    const fn = { tie: this._gTie, carve: this._gCarve, weave: this._gWeave, mix: this._gMix, knap: this._gKnap, heat: this._gHeat, pack: this._gPack }[method];
    const plan = fn.call(this, E, U, ctx, g, pool);
    if (!plan) return null;
    plan.ents = E;
    plan.method = method;
    plan.order = 9999;
    plan.units = plan.used ? [...plan.used.values()].reduce((a, b) => a + b, 0) : 0;
    plan.score = 0;
    plan.mats = plan.mats || [...(plan.used?.keys() || [])].map((i) => E[i]);
    plan.warnings = plan.ready ? this._warnings(method, plan, ctx) : [];
    if (plan.id && !plan.icon) plan.icon = this.itemDef(plan.id)?.icon;
    return plan;
  }

  /** a generic plan: used = unit list (entry indices) */
  _gp(id, used, o = {}) {
    const m = new Map();
    for (const i of used) m.set(i, (m.get(i) || 0) + 1);
    const t = new Map();
    for (const i of o.tools || []) t.set(i, (t.get(i) || 0) + 1);
    const def = id ? this.itemDef(id) : null;
    return { kind: 'generic', id, name: o.name || def?.name || '？', desc: o.desc || def?.desc || '', ready: true, used: m, tools: t,
      minutes: o.minutes ?? 5, cap: o.cap ?? null, build: o.build, placed: !!o.placed, wait: o.wait, missing: [], icon: o.icon };
  }

  _blocked(reason, o = {}) {
    return { kind: 'generic', id: null, name: o.name || '（できない）', desc: reason, ready: false, used: new Map(), tools: new Map(), minutes: 0,
      missing: [reason], redirect: o.redirect || null, icon: o.icon || '✋' };
  }

  _nm(E, i, ctx) { return this._displayName(E[i].stack, ctx); }

  /** the most common name among units: 「つる」 */
  _mainName(E, U, ctx) {
    const c = new Map();
    for (const i of U) c.set(E[i].id, (c.get(E[i].id) || 0) + 1);
    const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    const i = U.find((j) => E[j].id === top[0]);
    return this._nm(E, i, ctx);
  }

  _contents(E, U) {
    const map = new Map();
    for (const i of U) map.set(i, (map.get(i) || 0) + 1);
    return [...map.entries()].map(([i, n]) => this._copy(E[i].stack, n));
  }

  _gTie(E, U, ctx) {
    if (U.length < 2) return this._blocked('結ぶには 2 つ 以上 置く');
    const a = (i, k) => E[i].attrs[k] || 0;
    const sorted = [...U].sort((x, y) => a(y, 'fiber') - a(x, 'fiber'));
    let cord = a(sorted[0], 'fiber') >= 3 ? sorted[0] : null;
    let weak = false;
    if (cord == null && a(sorted[0], 'fiber') >= 2) { cord = sorted[0]; weak = true; }
    if (cord == null) return this._blocked('紐に なる 物（fiber 3 以上）が いる');
    const parts = U.slice();
    parts.splice(parts.indexOf(cord), 1);
    const cap = weak ? 30 : null;
    const knot = (Q) => Math.max(1, Math.round((a(cord, 'fiber') * Q) / 10));     // §11.4 結び目の 強さ ＝ fiber × 品質
    const tieAttrs = (ps) => inheritAttrs('tie', [...ps.map((i) => ({ attrs: E[i].attrs, role: 'part' })), { attrs: E[cord].attrs, role: 'bind' }]);
    const parted = (list, backOf) => {
      const m = new Map();
      for (const i of list) { const p = m.get(i) || { id: E[i].id, n: 0, q: E[i].q, back: backOf(i), attrs: E[i].stack.attrs, stats: E[i].stack.stats, name: E[i].stack.name }; p.n++; m.set(i, p); }
      return [...m.values()].map((p) => JSON.parse(JSON.stringify(p)));
    };
    const longs = parts.filter((i) => a(i, 'long') >= 5);
    if (longs.length >= 2) {
      const used = [...longs, cord];
      return this._gp('joined_pole', used, { cap, minutes: 5, build: (Q) => {
        const attrs = tieAttrs(longs);
        attrs.hard = Math.max(0, Math.min(...longs.map((i) => a(i, 'hard'))) - 1);   // §11.8 ③: hard ＝ 最小 −1
        const dur = knot(Q);
        return { stacks: [this._stack('joined_pole', 1, { q: Q, attrs: tidy(attrs), stats: { durability: dur }, dur, parts: parted(used, (i) => (i === cord ? 0.8 : 0.8)) })] };
      } });
    }
    const heavy = parts.filter((i) => a(i, 'heavy') >= 4).sort((x, y) => a(y, 'heavy') - a(x, 'heavy'))[0];
    const shaft = heavy != null ? parts.filter((i) => i !== heavy && a(i, 'long') >= 4).sort((x, y) => a(y, 'long') - a(x, 'long'))[0] : undefined;
    if (heavy != null && shaft != null) {
      const used = [heavy, shaft, cord];
      return this._gp('weighted_club', used, { cap, minutes: 5, build: (Q) => {
        const attrs = tidy(tieAttrs([heavy, shaft]));
        const dur = knot(Q);
        const melee = r2((attrs.heavy || 0) + (attrs.hard || 0) / 2);           // §11.8 ③: 威力 ＝ heavy + hard/2
        return { stacks: [this._stack('weighted_club', 1, { q: Q, attrs, stats: { melee, durability: dur }, dur, parts: parted(used, (i) => (i === heavy ? 1 : 0.8)) })] };
      } });
    }
    const sharps = parts.filter((i) => a(i, 'sharp') >= 4);
    if (sharps.length >= 2) {
      const used = [...sharps, cord];
      return this._gp('spike_bundle', used, { cap, minutes: 5, build: (Q) => {
        const attrs = tidy(tieAttrs(sharps));
        return { stacks: [this._stack('spike_bundle', 1, { q: Q, attrs, stats: { trap: 1, puncture: 1 }, parts: parted(used, (i) => (i === cord ? 0.8 : 1)) })] };
      } });
    }
    const all = U.slice();
    const name = `${this._mainName(E, parts.length ? parts : all, ctx)}の 束`;
    return this._gp('bundle', all, { cap, minutes: 3, name, build: (Q) => {
      const weight = r2(all.reduce((s, i) => s + E[i].weight, 0) * 0.9);
      const fuel = r2(all.reduce((s, i) => s + (E[i].def.fuel || 0), 0));
      return { stacks: [this._stack('bundle', 1, { q: Q, name, contents: this._contents(E, all), stats: { weight, fuel } })] };
    } });
  }

  _gWeave(E, U) {
    const ok = U.filter((i) => (E[i].attrs.fiber || 0) >= 2 || (E[i].attrs.flex || 0) >= 5);
    if (ok.length < 3) return this._blocked('fiber 2 以上 か flex 5 以上 の 物が 3 つ 以上 いる');
    const id = ok.length >= 6 ? 'mat' : 'woven_cord';
    return this._gp(id, ok, { minutes: id === 'mat' ? 25 : 10, build: (Q) => {
      const attrs = inheritAttrs('weave', ok.map((i) => ({ attrs: E[i].attrs })), { q: Q });
      return { stacks: [this._stack(id, 1, { q: Q, attrs, stats: id === 'mat' ? { waterproof: attrs.waterproof || 0, insul: attrs.insul || 0 } : { fiber: attrs.fiber || 0 } })] };
    } });
  }

  _gCarve(E, U, ctx, g) {
    if (!g.blade) return this._blocked(`${METHODS.carve.hand.label}を 手に 持つ`);
    const i = U.find((j) => !E[j].isHeld) ?? U[0];
    const e = E[i], tags = e.tags;
    const shavings = (Q) => (tags.includes('wood') && this.itemDef('wood_shavings') ? [this._stack('wood_shavings', 1, { q: Q })] : []);
    if (e.id === 'bamboo' && this.itemDef('bamboo_strip')) {                // §11.4: 竹 → 竹ひご 6
      return this._gp('bamboo_strip', [i], { name: '竹ひご ×6', minutes: 15, build: (Q) => ({ stacks: [this._stack('bamboo_strip', 6, { q: Q })] }) });
    }
    if (e.id === 'cloth') {                                               // 布 → 細布 3
      return this._gp('cloth_strip', [i], { name: '細布 ×3', minutes: 3, build: (Q) => ({ stacks: [this._stack('cloth_strip', 3, { q: Q })] }) });
    }
    if (tags.includes('wood') || tags.includes('bone') || tags.includes('plant') && (e.attrs.hard || 0) >= 2) {
      const bone = tags.includes('bone');
      const name = `削った ${this._nm(E, i, ctx)}`;
      return this._gp('carved_stick', [i], { name, minutes: 5, build: (Q) => {
        const attrs = inheritAttrs('carve', [e], { point: true, toolSharp: g.blade.sharp });
        return { stacks: [this._stack('carved_stick', 1, { q: Q, attrs, name: bone || e.id !== 'branch' ? name : null, wet: e.stack.wet }), ...shavings(Q)] };
      } });
    }
    if (['stone', 'metal', 'glass', 'shell'].some((t) => tags.includes(t))) {      // 「歯が 立たない」: blade −2
      const p = this._gp(null, [], { name: '（何も 変わらない）', desc: '歯が 立たない。刃物の 耐久 −2', minutes: 2,
        build: () => ({ stacks: [], toolWear: 2, message: `${this._nm(E, i, ctx)}には 歯が 立たない…（刃が 傷んだ）` }) });
      p.mats = [e];
      return p;
    }
    const name = `刻んだ ${this._nm(E, i, ctx)}`;
    return this._gp('chopped', [i], { name, minutes: 3, build: (Q) => {
      const attrs = { ...e.attrs, long: 0 };
      if (attrs.tinder) attrs.tinder += 1;
      return { stacks: [this._stack('chopped', 1, { q: Q, attrs: tidy(attrs), name, fresh: e.stack.fresh ?? null, mix: e.def.food ? { ids: [e.id], food: e.def.food.food || 0, water: e.def.food.water || 0, B: e.def.food.B || 0 } : null })] };
    } });
  }

  _gMix(E, U, ctx) {
    if (U.length < 2) return this._blocked('混ぜるには 2 つ 以上 置く');
    const items = U.map((i) => ({ attrs: E[i].attrs, weight: E[i].weight }));
    const R = inheritAttrs('mix', items, { raw: true });
    const knownTox = Math.max(0, ...U.filter((i) => this._knows(E[i], ctx)).map((i) => E[i].attrs.toxic || 0));
    const visTox = knownTox > 0 ? knownTox - 1 : 0;
    const poisonUnits = U.filter((i) => this._poison(E[i]));
    const mixInfo = () => {
      const foods = U.filter((i) => E[i].def.food);
      const food = r2(foods.reduce((s, i) => s + (E[i].def.food.food || 0), 0) * 0.9);
      const water = r2(foods.reduce((s, i) => s + (E[i].def.food.water || 0), 0));
      const B = Math.max(0, ...foods.map((i) => E[i].def.food.B || 0));
      const pz = poisonUnits.map((i) => this._poison(E[i])).sort((x, y) => y.chance - x.chance)[0] || null;
      return { ids: [...new Set(U.map((i) => E[i].id))], food, water, B, p: pz ? pz.chance : 0, poison: pz ? { id: pz.id, chance: pz.chance, sev: [pz.sev, pz.sev] } : null };
    };
    const fresh = () => { const f = U.map((i) => E[i].stack.fresh).filter((v) => v != null); return f.length ? Math.min(...f) : null; };
    const make = (id, o = {}) => this._gp(id, U, { minutes: 5, ...o, build: (Q) => {
      const attrs = tidy({ ...R, ...(o.attrs || {}) });
      const mix = mixInfo();
      return { stacks: [this._stack(id, 1, { q: Q, attrs, fresh: o.food ? fresh() ?? 100 : null, mix: o.food || mix.poison ? mix : null, toxicMix: mix.poison ? true : null, stats: o.stats ? o.stats(attrs, mix) : null, name: o.stackName || null })] };
    } });
    if (R.edible >= 2 && visTox <= 0) return make('paste_food', { food: true });
    if (R.med >= 4) {
      const herbs = [...new Set(U.filter((i) => (E[i].attrs.med || 0) >= 3).map((i) => E[i].id))];
      return make('mystery_medicine', { stats: (at, mix) => ({ herbs, power: 0.5, harm: mix.poison ? 1 : 0 }) });
    }
    if (visTox >= 4) return make('poison_paste');
    if (R.sticky >= 5) return make('sticky_goo');
    if (R.burn >= 6) return make('fire_starter', { attrs: { tinder: (R.tinder || 0) + 2 }, stats: (at) => ({ tinder: r2(Math.min(1.1, 0.4 + (at.tinder || 0) * 0.08)) }) });
    if (R.scent >= 5) return make('scent_ball');
    const clay = U.filter((i) => E[i].id === 'clay').length;
    return make('mud_ball', { stackName: clay ? '粘土の だんご' : null, stats: () => ({ clay }) });
  }

  _gKnap(E, U, ctx, g, pool) {
    const isHam = (i) => this._isHammer(E[i]);
    const heldHam = pool.held && this._isHammer(pool.held) ? pool.held : null;
    let target = U.find((i) => !isHam(i));
    const hams = U.filter(isHam);
    if (target == null && (hams.length >= 2 || (hams.length && heldHam))) target = hams[0];
    if (target == null) return this._blocked('割る 物を 置く');
    const rest = U.slice();
    rest.splice(rest.indexOf(target), 1);
    const hammer = rest.find(isHam);
    if (hammer == null && !heldHam) return this._blocked(`${METHODS.knap.hand.label}が いる`);
    const tools = hammer != null ? [hammer] : [];
    const e = E[target], tags = e.tags, nm = this._nm(E, target, ctx);
    const P = (id, o) => { const p = this._gp(id, [target], { tools, minutes: 3, ...o }); p.mats = [e]; return p; };
    if (e.id === 'glass_bottle' && this.itemDef('glass_shard')) return P('glass_shard', { name: 'ガラス片 ×3', build: (Q) => ({ stacks: [this._stack('glass_shard', 3, { q: Q })] }) });
    if (e.id === 'charcoal' && this.itemDef('charcoal_powder')) return P('charcoal_powder', { build: (Q) => ({ stacks: [this._stack('charcoal_powder', 3, { q: Q })] }) });
    if (tags.includes('bone')) return P('bone_shard', { name: '骨片 ×2', build: (Q) => ({ stacks: [this._stack('bone_shard', 2, { q: Q })] }) });
    if (tags.includes('shell')) {
      return P('shard', { name: `${nm}の 破片と 粉`, build: (Q, c, o) => {
        const attrs = inheritAttrs('knap', [e], { kind: 'shard', score: o?.score });
        return { stacks: [this._stack('shard', 1, { q: Q, attrs, name: `${nm}の 破片` }), this._stack('shell_powder', 1, { q: Q })] };
      } });
    }
    if (e.id === 'salt') return P('salt', { name: '塩（粉）', build: (Q) => ({ stacks: [this._copy(e.stack, 1)], message: '塩を 細かく した' }) });
    if (tags.includes('stone') || tags.includes('glass')) {
      return P('shard', { name: `${nm}の 破片`, build: (Q, c, o) => {
        const attrs = inheritAttrs('knap', [e], { kind: 'shard', score: o?.score });
        return { stacks: [this._stack('shard', 2, { q: Q, attrs, name: `${nm}の 破片` })] };
      } });
    }
    if (e.def.food && e.def.cat === 'food') {
      const name = `つぶした ${nm}`;
      return P('paste_food', { name, build: (Q) => ({ stacks: [this._stack('paste_food', 1, { q: Q, name, fresh: e.stack.fresh ?? 100,
        mix: { ids: [e.id], food: e.def.food.food || 0, water: e.def.food.water || 0, B: e.def.food.B || 0, p: 0, poison: null } })] }) });
    }
    const name = `つぶれた ${nm}`;
    return P('crushed', { name, build: (Q) => {
      const attrs = inheritAttrs('knap', [e], { kind: 'crushed' });
      const tinderMul = (e.attrs.tinder || 0) >= 4 ? Math.max(e.def.tinder || 0, 0.9) : null;   // §10.1 もんだ 内皮 0.9
      const stats = tinderMul ? { tinder: tinderMul } : {};
      if (tags.includes('metal')) stats.flat = 1;
      return { stacks: [this._stack('crushed', 1, { q: Q, attrs, name, stats })] };
    } });
  }

  _gHeat(E, U, ctx, g) {
    if (!g.fire) return this._blocked('火の そばで ないと できない');
    const ids = (i) => E[i].id;
    const tagsOf = (i) => E[i].tags;
    const heatproof = (i) => !!(E[i].def.container?.heatproof || E[i].stack.stats?.heatproof || (E[i].attrs.heatproof || 0) >= 5);
    const isVessel = (i) => (E[i].attrs.container || 0) >= 2 || !!E[i].def.container;
    // 1. fire a shaped clay pot (§11.5 D: crack = 0.45 − Q/300 − temper 0.15 − dried 0.15, ≥ 0.05; かまど −0.1)
    const raw = U.find((i) => ids(i) === 'clay_pot_raw');
    if (raw != null) {
      const e = E[raw];
      return this._gp('clay_pot', [raw], { name: '土器の 鍋（焼成）', minutes: 10, placed: true, wait: 180, build: () => {
        const st = e.stack.stats || {};
        const p = Math.max(0.05, 0.45 - e.q / 300 - (st.temper ? 0.15 : 0) - (st.dried ? 0.15 : 0) - (ctx.nearOven ? 0.1 : 0));
        const cracked = this._rand() < p;
        const stacks = cracked ? [this._stack('shard', 2, { q: 30, name: '土器の かけら', attrs: { hard: 6, sharp: 3, heatproof: 9 } })]
          : [this._stack('clay_pot', 1, { q: e.q, stats: { liters: 2, crackChance: r2(p) } })];
        return { placed: true, wait: 180, stacks, events: cracked ? ['cracked'] : [], name: '土器の 鍋', crackChance: p };
      } });
    }
    // 2. sea water in a heat-proof vessel → salt (§7.8: 3 L → 2 salt in 2 h)
    const sea = U.find((i) => E[i].stack.water?.src === 'sea' && heatproof(i));
    if (sea != null) {
      const cups = E[sea].stack.water.cups || 0;
      const n = Math.max(1, Math.round(cups / 6));
      return this._gp('salt', [], { tools: [sea], name: `塩 ×${n}（海水を 煮つめる）`, minutes: 5, placed: true, wait: Math.max(20, cups * 10), build: () => {
        const v = this._copy(E[sea].stack, 1);
        delete v.water;
        return { placed: true, wait: Math.max(20, cups * 10), moveTools: true, stacks: [this._stack('salt', n, { q: 50 }), v], name: '塩' };
      } });
    }
    // 3. fresh water alone → boiled (§7.6)
    if (U.length === 1 && E[U[0]].stack.water?.cups && heatproof(U[0])) {
      const i = U[0];
      return this._gp(null, [], { tools: [i], name: 'お湯（煮沸）', desc: '10 分 沸かすと 安全な 水に なる', minutes: 10, build: () => {
        const w = E[i].stack.water;
        w.treat = w.treat === 'filter' ? 'filter_boil' : 'boil';
        w.warm = true;
        return { stacks: [], stack: E[i].stack, message: '水が 沸いた（煮沸）' };
      } });
    }
    // 4. a wooden point → fire-hardened once (§11.4: hard +1, sharp +1; spear +2 power)
    const pt = U.find((i) => POINTED.includes(ids(i)) && !E[i].stack.stats?.hardened);
    if (pt != null) {
      const e = E[pt];
      return this._gp(ids(pt), [pt], { name: `焼き締めた ${this._nm(E, pt, ctx)}`, minutes: 10, build: () => {
        const attrs = inheritAttrs('heat', [e], { kind: 'harden' });
        const stats = { ...(e.stack.stats || {}), hardened: 1 };
        if (stats.power != null) stats.power = r2(stats.power + 2);
        else if (e.id === 'spear_wood') stats.power = (e.def.tool?.power || 0) + 2;
        return { stacks: [this._copy(e.stack, 1, { attrs, stats })] };
      } });
    }
    // 5. clay → pottery: shape by the amount (1 sinker, 2 plate, 3+ bowl)
    const clay = U.filter((i) => ids(i) === 'clay' || (ids(i) === 'mud_ball' && E[i].stack.stats?.clay > 0));
    if (clay.length) {
      const shape = clay.length >= 3 ? ['器', { container: 4 }] : clay.length === 2 ? ['皿', { container: 2 }] : ['おもり', { heavy: 4, container: 0 }];
      return this._gp('pottery', clay, { name: `焼き物の ${shape[0]}`, minutes: 10, placed: true, wait: 180, build: (Q) => {
        const cracked = this._rand() < Math.max(0.05, 0.45 - Q / 300);
        const attrs = tidy({ ...inheritAttrs('heat', [E[clay[0]]], { kind: 'pottery', raw: true }), ...shape[1] });
        const stacks = cracked ? [this._stack('shard', 1, { q: 30, name: '焼き物の かけら', attrs: { hard: 6, sharp: 3 } })]
          : [this._stack('pottery', 1, { q: Q, attrs, name: `焼き物の ${shape[0]}` })];
        return { placed: true, wait: 180, stacks, events: cracked ? ['cracked'] : [] };
      } });
    }
    // 6. fat in a heat-proof vessel → oil (§11.4: burn 8, waterproof 6)
    const fats = U.filter((i) => ids(i) === 'fat');
    const pot = U.find((i) => isVessel(i) && heatproof(i) && ids(i) !== 'fat');
    if (fats.length && pot != null) {
      return this._gp('oil', fats, { tools: [pot], minutes: 15, name: `油 ×${fats.length}`, build: (Q) => ({ stacks: [this._stack('oil', fats.length, { q: Q })], events: fats.length >= 3 ? ['flare'] : [] }) });
    }
    // 7. food → §7.3 cooking on the fire (not here)
    if (U.some((i) => E[i].def.cat === 'food' && E[i].def.food)) return this._blocked('食べ物は 火に のせて 焼く（料理）', { redirect: 'cook', name: '（料理）', icon: '🍳' });
    // 8. burnables → charcoal when covered with earth (placed 4 h), ash when burned in the open
    const cover = U.filter((i) => ['mud', 'sand', 'clay'].includes(ids(i)));
    const burn = U.filter((i) => !cover.includes(i) && ((E[i].attrs.burn || 0) >= 4 || tagsOf(i).includes('wood')));
    if (burn.length) {
      const events = [];
      if (burn.some((i) => ids(i) === 'bamboo')) events.push('bang');
      if (burn.some((i) => ids(i) === 'green_wood' || ids(i) === 'green_grass')) events.push('smoke');
      if (burn.filter((i) => ids(i) === 'fat' || ids(i) === 'resin').length >= 3) events.push('flare');
      if (cover.length && this.itemDef('charcoal')) {
        const n = Math.max(1, Math.floor(burn.length / 2));
        return this._gp('charcoal', [...burn, cover[0]], { name: `炭 ×${n}（蒸し焼き）`, minutes: 10, placed: true, wait: 240, build: (Q) => ({ placed: true, wait: 240, stacks: [this._stack('charcoal', n, { q: Q })], events }) });
      }
      const n = Math.max(1, Math.floor(burn.length / 3));
      return this._gp(this.itemDef('ash') ? 'ash' : null, burn, { name: `灰（燃やす）`, desc: '燃料として 燃えて 灰に なる', minutes: 30,
        build: (Q) => ({ stacks: this.itemDef('ash') ? [this._stack('ash', n, { q: Q })] : [], events, message: `${this._mainName(E, burn, ctx)}が 燃えて 灰に なった` }) });
    }
    // 9. stone / sand / shell → hot stones (round river stones burst 15 %), shells → shell lime
    const shells = U.filter((i) => tagsOf(i).includes('shell') && !(E[i].attrs.container >= 4));
    if (shells.length) return this._gp('shell_lime', shells, { minutes: 30, build: (Q) => ({ stacks: [this._stack('shell_lime', shells.length, { q: Q })] }) });
    const stones = U.filter((i) => tagsOf(i).includes('stone') || ids(i) === 'sand');
    if (stones.length) {
      return this._gp('hot_stone', stones, { name: `焼き石 ×${stones.length}`, minutes: 20, build: (Q) => {
        let ok = 0, burst = 0;
        for (const i of stones) { const p = ids(i) === 'stone' ? ((E[i].stack.wet || 0) > 60 ? 0.3 : 0.15) : 0; if (this._rand() < p) burst++; else ok++; }
        const stacks = ok ? [this._stack('hot_stone', ok, { q: Q, stats: { hotMinutes: 20 } })] : [];
        return { stacks, events: burst ? ['burst'] : [], message: burst ? `石が はぜた！（やけどに 注意）　焼き石 ×${ok}` : null };
      } });
    }
    // 10. the rest: plastic melts (sticky), metal / glass get hot, anything else burns to ash
    const i = U[0], e = E[i];
    if (tagsOf(i).includes('plastic')) {
      return this._gp('sticky_goo', [i], { name: `溶けた ${this._nm(E, i, ctx)}`, minutes: 5, build: (Q) => ({ stacks: [this._stack('sticky_goo', 1, { q: Q, attrs: { sticky: 6, waterproof: 8 }, name: `溶けた ${this._nm(E, i, ctx)}` })], events: ['smoke'] }) });
    }
    if (tagsOf(i).includes('metal') || tagsOf(i).includes('glass') || heatproof(i)) {
      return this._gp(e.id, [i], { name: `熱い ${this._nm(E, i, ctx)}`, minutes: 10, build: () => ({ stacks: [this._copy(e.stack, 1, { stats: { ...(e.stack.stats || {}), hotMinutes: 20 } })] }) });
    }
    return this._gp(this.itemDef('ash') ? 'ash' : null, U.slice(), { name: '灰', minutes: 20,
      build: (Q) => ({ stacks: this.itemDef('ash') ? [this._stack('ash', 1, { q: Q })] : [], message: `${this._mainName(E, U, ctx)}は 焦げて 灰に なった` }) });
  }

  _gPack(E, U, ctx) {
    if (U.length < 2) return this._blocked('詰めるには 2 つ 以上 置く');
    const a = (i, k) => E[i].attrs[k] || 0;
    const vessels = U.filter((i) => a(i, 'container') >= 2 || E[i].def.container).sort((x, y) => a(y, 'container') - a(x, 'container'));
    const v = vessels[0];
    // salting (§7.8): container + salt + food → placed 4 h
    const salt = U.filter((i) => E[i].id === 'salt');
    const foods = U.filter((i) => i !== v && E[i].def.cat === 'food' && E[i].def.food);
    if (v != null && salt.length && foods.length) {
      const k = Math.min(salt.length, foods.length);
      const fs = foods.slice(0, k);
      return this._gp(E[fs[0]].id, [...fs, ...salt.slice(0, k)], { tools: [v], name: `${this._nm(E, fs[0], ctx)}の 塩漬け`, minutes: 5, placed: true, wait: 240, build: () => {
        const stacks = this._contents(E, fs).map((s) => Object.assign(s, { proc: 'salted' }));
        stacks.push(this._copy(E[v].stack, 1));
        return { placed: true, wait: 240, moveTools: true, stacks };
      } });
    }
    const isCoat = (i) => COATS.includes(E[i].id) || a(i, 'toxic') >= 3 || a(i, 'sticky') >= 5;
    const toolish = (i) => ['tool', 'weapon', 'ammo', 'clothing'].includes(E[i].def.cat) || !!E[i].def.tool;
    const coats = U.filter(isCoat);
    const bases = U.filter((i) => !isCoat(i) && i !== v);
    const coatBase = [...bases.filter(toolish), ...bases][0] ?? (v != null && toolish(v) ? v : undefined);
    if (coats.length && coatBase != null && (v == null || toolish(coatBase))) {
      const c = coats[0], b = coatBase;
      const name = `${this._nm(E, c, ctx)}を ぬった ${this._nm(E, b, ctx)}`;
      return this._gp(E[b].id, [b, c], { name, minutes: 5, build: () => {
        const attrs = inheritAttrs('pack', [E[b], E[c]], { coat: true });
        const stats = { ...(E[b].stack.stats || {}) };
        if (a(c, 'toxic') >= 3) stats.poisoned = 1;
        if (stats.durability && a(c, 'sticky') >= 6) stats.durability = Math.round(stats.durability * 1.5);
        return { stacks: [this._copy(E[b].stack, 1, { attrs, stats, name })] };
      } });
    }
    if (v != null) {
      const inner = U.filter((i) => i !== v);
      const dry = a(v, 'waterproof') >= 7 && inner.every((i) => a(i, 'tinder') >= 4);
      const id = dry ? 'tinder_box' : 'filled_container';
      const vn = this._nm(E, v, ctx);
      const name = dry ? `濡れない 火口入れ（${vn}）` : `${this._mainName(E, inner, ctx)}入りの ${vn}`;
      return this._gp(id, U.slice(), { name, minutes: 3, build: (Q) => {
        const vessel = this._copy(E[v].stack, 1);
        const contents = this._contents(E, inner);
        if (vessel.water && vessel.water.src !== 'sea' && inner.some((i) => E[i].stack.water?.src === 'sea')) vessel.water.src = 'sea';  // §11.8 ④
        const stats = { keepsDry: dry ? 1 : 0 };
        if (dry) stats.tinder = Math.max(...inner.map((i) => E[i].def.tinder || 0.5));
        return { stacks: [this._stack(id, 1, { q: Q, name, vessel, contents, stats, attrs: tidy({ ...E[v].attrs }) })] };
      } });
    }
    const name = `重ねた ${this._mainName(E, U, ctx)}`;
    return this._gp('bundle', U.slice(), { name, minutes: 3, build: (Q) => ({ stacks: [this._stack('bundle', 1, { q: Q, name, contents: this._contents(E, U),
      stats: { weight: r2(U.reduce((s, i) => s + E[i].weight, 0) * 0.9), fuel: r2(U.reduce((s, i) => s + (E[i].def.fuel || 0), 0)) } })] }) });
  }

  _repairConds(id) {
    const r = RECIPE_LIST.find((x) => x.out?.id === id) || RECIPES[id];
    if (r) return variantsOf(r).flatMap((v) => v.slots.filter((s) => s.consume !== false));
    return REPAIRS[id] || [];
  }
}

function sameAttrs(a, b) {
  for (const k of ATTRS) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}
