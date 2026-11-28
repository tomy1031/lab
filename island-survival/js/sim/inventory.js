// sim/inventory.js — a bag of item stacks (see docs/dev-contracts.md for the stack shape).
// Stacks of the same id and the same state merge (freshness / quality / wetness are averaged). Foods lose
// freshness every game hour (DESIGN.md §7.2): fresh −= decay × temperature factor × place factor × state factor.
// The weight limit is soft (the player slows down; §4.9).
import { itemDef } from '../data/items.js';

let uid = 1;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** quality rank (§11.7): 0 粗悪 · 1 並 · 2 良 · 3 上等 · 4 逸品 */
export function rankOf(q) { return q < 25 ? 0 : q < 50 ? 1 : q < 75 ? 2 : q < 90 ? 3 : 4; }
export const RANK_NAMES = ['粗悪', '並', '良', '上等', '逸品'];

function defaultQ(d, rng) {
  const [a, b] = d?.q || [35, 65];
  return Math.round(a + (b - a) * (rng ? rng.next() : Math.random()));
}

export function makeStack(id, n = 1, extra = {}) {
  const d = itemDef(id);
  const isFood = !!d?.food;
  const s = {
    uid: uid++, id, n,
    q: extra.q ?? defaultQ(d, extra.rng),
    fresh: extra.fresh ?? (isFood ? 100 : null),
    done: extra.done ?? 0,
    proc: extra.proc ?? 'none',
    dur: extra.dur ?? (d?.tool?.durability ?? d?.durability ?? null),
    wet: extra.wet ?? 0,
  };
  for (const k of ['attrs', 'stats', 'name', 'water', 'contents', 'stage', 'gutted', 'bled', 'contam', 'mix', 'toxicMix', 'kinds', 'stew', 'source', 'ripe']) if (extra[k] !== undefined) s[k] = extra[k];
  return s;
}

const CUSTOM_KEYS = ['attrs', 'stats', 'name', 'water', 'contents', 'mix', 'toxicMix'];
const mergeable = (a, b) => a.id === b.id && a.dur === null && b.dur === null && a.proc === b.proc
  && Math.abs((a.done || 0) - (b.done || 0)) < 15 && Math.abs(a.q - b.q) < 15 && (a.stage ?? null) === (b.stage ?? null)
  && (a.fresh === null) === (b.fresh === null) && Math.abs((a.fresh ?? 0) - (b.fresh ?? 0)) < 20
  && (a.contam || 1) === (b.contam || 1)
  && !CUSTOM_KEYS.some((k) => a[k] !== undefined || b[k] !== undefined);

export class Inventory {
  constructor(capacity = 15) {
    this.stacks = [];
    this.capacity = capacity;
    this.onChange = null;
  }

  changed() { this.onChange?.(this); }

  add(id, n = 1, extra = {}) {
    if (n <= 0 || !itemDef(id)) return null;
    return this.addStack(makeStack(id, n, extra));
  }

  addStack(s) {
    if (!s.uid) s.uid = uid++;
    const d = itemDef(s.id, s);
    const maxStack = d?.stack ?? 50;
    for (const t of this.stacks) {
      if (!mergeable(t, s) || t.n >= maxStack) continue;
      const take = Math.min(maxStack - t.n, s.n);
      const w = take / (t.n + take);
      t.q = t.q + (s.q - t.q) * w;
      if (t.fresh !== null) t.fresh = t.fresh + (s.fresh - t.fresh) * w;
      t.wet = t.wet + (s.wet - t.wet) * w;
      t.done = t.done + ((s.done || 0) - t.done) * w;
      t.n += take; s.n -= take;
      if (s.n <= 0) { this.changed(); return t; }
    }
    if (s.n > 0) this.stacks.push(s);
    this.changed();
    return s;
  }

  /** remove n of a stack (uid) or of an id (least fresh / oldest first); returns the removed parts */
  take(idOrUid, n = 1) {
    const out = [];
    const list = typeof idOrUid === 'number'
      ? this.stacks.filter((s) => s.uid === idOrUid)
      : this.stacks.filter((s) => s.id === idOrUid).sort((a, b) => (a.fresh ?? 0) - (b.fresh ?? 0));
    for (const s of list) {
      if (n <= 0) break;
      const k = Math.min(n, s.n);
      out.push({ ...s, n: k, uid: k === s.n ? s.uid : uid++ });
      s.n -= k; n -= k;
    }
    this.stacks = this.stacks.filter((s) => s.n > 0);
    this.changed();
    return out;
  }

  /** split n off a stack into a new stack object (not added) */
  split(uidOf, n) { return this.take(uidOf, n)[0] || null; }

  removeStack(u) {
    const i = this.stacks.findIndex((s) => s.uid === u);
    if (i < 0) return null;
    const [s] = this.stacks.splice(i, 1);
    this.changed();
    return s;
  }

  count(id) { return this.stacks.reduce((a, s) => a + (s.id === id ? s.n : 0), 0); }
  has(id, n = 1) { return this.count(id) >= n; }
  find(id) { return this.stacks.find((s) => s.id === id) || null; }
  get(u) { return this.stacks.find((s) => s.uid === u) || null; }
  withTag(tag) { return this.stacks.filter((s) => itemDef(s.id, s)?.tags?.includes(tag)); }
  withAttr(attr, min = 1) { return this.stacks.filter((s) => ((s.attrs || itemDef(s.id, s)?.attrs || {})[attr] ?? 0) >= min); }

  weight() { return this.stacks.reduce((a, s) => a + (itemDef(s.id, s)?.weight ?? 0.3) * s.n, 0); }

  /**
   * age by gm game minutes. o: { tAir (°C), place (§7.2 place factor: carried 1.2, shade 0.8, larder 0.6, cool 0.5),
   *   wetRate (wet per minute while in rain / water), dryRate (per minute) }
   */
  tick(gm, o = {}) {
    if (gm <= 0) return;
    const h = gm / 60;
    const tMul = clamp(1 + ((o.tAir ?? 25) - 25) * 0.06, 0.4, 2.0);
    const place = o.place ?? 1.2;
    let rotted = false;
    for (const s of this.stacks) {
      if (s.fresh !== null && s.fresh !== undefined) {
        const d = itemDef(s.id, s);
        const f = d?.food;
        if (f && !s.alive) {
          let state = 1;
          if ((s.done || 0) >= 65 || s.proc === 'stew') state *= 0.6;
          if (s.gutted) state *= 0.8;
          if (s.opened) state *= 2;
          if (s.wet > 40) state *= 1.3;
          const decay = s.proc === 'dried' ? 0.25 : s.proc === 'smoked' ? 0.15 : s.proc === 'salted' ? 0.08 : s.proc === 'salted_dried' ? 0.04 : s.proc === 'stew' ? 3.0 : (f.decay ?? 1);
          const before = s.fresh;
          s.fresh = Math.max(0, s.fresh - decay * tMul * place * state * (s.bled ? 0.8 : 1) * h);
          if (before >= 15 && s.fresh < 15) rotted = true;
        }
      }
      if (o.wetRate > 0) s.wet = Math.min(100, s.wet + o.wetRate * gm);
      else if (s.wet > 0) s.wet = Math.max(0, s.wet - (o.dryRate ?? 0.15) * gm);
    }
    if (rotted) this.onRot?.();
  }

  serialize() { return { capacity: this.capacity, stacks: this.stacks }; }
  deserialize(d) {
    this.capacity = d.capacity ?? this.capacity;
    this.stacks = (d.stacks || []).map((s) => ({ ...s, uid: uid++ }));
    this.changed();
  }
}
