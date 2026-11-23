// sim/inventory.js — a bag of item stacks. A stack is one kind of item with the same state:
//   { id, n, q (quality 0…1), age (game minutes since it was made/picked), cook ('raw'|'half'|'cooked'|'burnt'|
//     'smoked'|'dried'|'salted'|'boiled'), dur (durability left, tools), wet (0…1), custom? (AI-made item def) }
// Items with the same id + cook + rounded quality + no durability merge into one stack; freshness (age) of a
// merged stack is the weighted average (simplification). Weight limit is soft: over the limit you walk slower.
import { itemDef } from '../data/items.js';

let uid = 1;

export function makeStack(id, n = 1, extra = {}) {
  const d = itemDef(id, extra.custom);
  return {
    uid: uid++, id, n, q: extra.q ?? 0.6, age: extra.age ?? 0, cook: extra.cook ?? (d?.cookable ? 'raw' : null),
    dur: extra.dur ?? d?.durability ?? null, wet: extra.wet ?? 0, custom: extra.custom ?? null,
  };
}

const sameKind = (a, b) => a.id === b.id && a.cook === b.cook && a.dur === null && b.dur === null && Math.abs(a.q - b.q) < 0.12 && !a.custom && !b.custom;

export class Inventory {
  constructor(capacity = 30) {
    this.stacks = [];
    this.capacity = capacity; // kg (soft)
    this.onChange = null;
  }

  changed() { this.onChange?.(this); }

  add(id, n = 1, extra = {}) {
    if (n <= 0) return null;
    const s = makeStack(id, n, extra);
    return this.addStack(s);
  }

  addStack(s) {
    const d = itemDef(s.id, s.custom);
    const maxStack = d?.stack ?? 99;
    for (const t of this.stacks) {
      if (sameKind(t, s) && t.n < maxStack) {
        const take = Math.min(maxStack - t.n, s.n);
        t.age = (t.age * t.n + s.age * take) / (t.n + take);
        t.q = (t.q * t.n + s.q * take) / (t.n + take);
        t.wet = (t.wet * t.n + s.wet * take) / (t.n + take);
        t.n += take; s.n -= take;
        if (s.n <= 0) { this.changed(); return t; }
      }
    }
    if (s.n > 0) this.stacks.push(s);
    this.changed();
    return s;
  }

  /** remove n of a stack (by uid) or of an id (oldest first). returns removed stacks (for crafting quality) */
  take(idOrUid, n = 1) {
    const out = [];
    const list = typeof idOrUid === 'number' ? this.stacks.filter((s) => s.uid === idOrUid) : this.stacks.filter((s) => s.id === idOrUid).sort((a, b) => b.age - a.age);
    for (const s of list) {
      if (n <= 0) break;
      const k = Math.min(n, s.n);
      out.push({ ...s, n: k });
      s.n -= k; n -= k;
    }
    this.stacks = this.stacks.filter((s) => s.n > 0);
    this.changed();
    return out;
  }

  removeStack(uid) {
    const i = this.stacks.findIndex((s) => s.uid === uid);
    if (i < 0) return null;
    const [s] = this.stacks.splice(i, 1);
    this.changed();
    return s;
  }

  count(id) { return this.stacks.reduce((a, s) => a + (s.id === id ? s.n : 0), 0); }
  has(id, n = 1) { return this.count(id) >= n; }
  find(id) { return this.stacks.find((s) => s.id === id) || null; }
  get(uid) { return this.stacks.find((s) => s.uid === uid) || null; }

  /** stacks whose definition has tag (≥ min) */
  withTag(tag, min = 1) {
    return this.stacks.filter((s) => (itemDef(s.id, s.custom)?.tags?.[tag] ?? 0) >= min);
  }

  weight() {
    return this.stacks.reduce((a, s) => a + (itemDef(s.id, s.custom)?.weight ?? 0.5) * s.n, 0);
  }

  /** age everything by game minutes; wet items dry slowly (faster near fire / in sun) */
  tick(gm, { dryRate = 0.002, wetRate = 0 } = {}) {
    for (const s of this.stacks) {
      s.age += gm;
      if (wetRate > 0) s.wet = Math.min(1, s.wet + wetRate * gm);
      else s.wet = Math.max(0, s.wet - dryRate * gm);
    }
  }

  serialize() { return { capacity: this.capacity, stacks: this.stacks }; }
  deserialize(d) {
    this.capacity = d.capacity ?? this.capacity;
    this.stacks = (d.stacks || []).map((s) => ({ ...s, uid: uid++ }));
    this.changed();
  }
}
