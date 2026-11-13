// js/game/inventory.js — the bag (counts per item id), holster slots, the `out` set (§4.4, §10.9) (OPUS-B)
import { ITEM_INFO, SLOT_IDS, SLOT_CATS, TIER_BONUS_CATS } from './itemInfo.js';
import { emit, toast } from './util.js';

// default holster for gear when it first arrives (§4.3 table)
const HOME = { sword: 'backR', spear: 'backR', shield: 'backL', bow: 'backL', torch: 'hipL', flask: 'hipR', windfan: 'hipR' };

export function createInventory(ctx, G) {
  const items = {};               // { [itemId]: count }
  const out = new Set();          // gear currently in a hand / in the world (count stays 1)
  const slots = { backR: null, backL: null, hipR: null, hipL: null, chest: null, belt: null };
  const temper = { sword: 0, spear: 0 };

  const def = (id) => {
    const d = ctx.items && ctx.items.defs && ctx.items.defs[id];
    const f = ITEM_INFO[id];
    if (!d) return f || null;
    if (!f) return d;
    return { ...f, ...d, food: d.food || f.food, slots: (d.slots && d.slots.length) ? d.slots : f.slots };
  };
  const isGear = (id) => { const d = def(id); return !!d && d.stack === 1; };
  const seedTier = () => Math.min(6, Math.floor((G.quest ? G.quest.seeds.length : 0) / 4));

  function fits(slot, id) {
    const d = def(id);
    if (!d) return false;
    if (Array.isArray(d.slots) && d.slots.length) return d.slots.includes(slot);
    return (SLOT_CATS[slot] || []).includes(d.cat);
  }
  function firstOfCat(slot) {
    for (const id of Object.keys(items)) if (items[id] > 0 && fits(slot, id) && !isGear(id)) return id;
    return null;
  }
  function autoSlot(id) {
    const d = def(id);
    if (!d || id === 'waybell') return;          // the waybell hangs on the wrist menu, not a holster (§4.3)
    if (d.stack === 1) {
      for (const s of SLOT_IDS) if (slots[s] === id) return;   // already holstered
      const home = HOME[id];
      if (home && !slots[home] && fits(home, id)) { slots[home] = id; return; }
      for (const s of SLOT_IDS) if (!slots[s] && fits(s, id) && s !== 'chest' && s !== 'belt') { slots[s] = id; return; }
    } else if (d.cat === 'food' && !slots.chest) slots.chest = id;
    else if (d.cat === 'throwable' && !slots.belt) slots.belt = id;
  }

  const inv = {
    items, out, slots, temper,
    def,
    count: (id) => items[id] || 0,
    has: (id) => (items[id] || 0) > 0,
    capacity(id) {
      const d = def(id);
      if (!d) return 0;
      let c = d.stack || 1;
      if (d.stack > 1 && TIER_BONUS_CATS.has(d.cat)) c += 2 * seedTier();
      return c;
    },
    /** add n; returns how many actually fit. Emits item:pickup (and a toast for new gear). */
    add(id, n = 1, opts = {}) {
      if (!id || !(n > 0)) return 0;
      const d = def(id);
      if (!d) return 0;
      const had = items[id] || 0;
      const cap = inv.capacity(id);
      const got = Math.max(0, Math.min(n, cap - had));
      if (got <= 0) return 0;
      items[id] = had + got;
      autoSlot(id);
      if (!opts.silent) {
        emit(ctx, 'item:pickup', { itemId: id, count: got });
        if (d.stack === 1 && had === 0) toast(ctx, `${d.name} を手に入れた`, d.en || '', 'item', 3500);
      }
      if (id === 'pearl' || id === 'aetherseed') G.vitals && G.vitals.refreshCaps();
      return got;
    },
    remove(id, n = 1) {
      const had = items[id] || 0;
      if (had < n) return false;
      items[id] = had - n;
      if (items[id] <= 0) {
        delete items[id];
        out.delete(id);
        for (const s of SLOT_IDS) {
          if (slots[s] === id) slots[s] = (s === 'chest' || s === 'belt') ? firstOfCat(s) : null;
        }
      }
      return true;
    },
    list() {
      return Object.keys(items).filter((k) => items[k] > 0).map((id) => ({ id, count: items[id] }));
    },
    setSlot(slot, id) {
      if (!(slot in slots)) return false;
      if (id == null) { slots[slot] = null; return true; }
      if (!inv.has(id) || !fits(slot, id)) return false;
      // gear lives in one slot at a time
      if (isGear(id)) for (const s of SLOT_IDS) if (slots[s] === id) slots[s] = null;
      slots[slot] = id;
      emit(ctx, 'inventory:change', { slot, itemId: id });
      return true;
    },
    /** draw from a holster: gear stays counted (goes to `out`), consumables are decremented now */
    take(slot) {
      if (slot === 'quiver') {         // the special arrow pick over the shoulder (§4.3)
        if ((items.arrow || 0) <= 0) return null;
        inv.remove('arrow', 1);
        return 'arrow';
      }
      if (!(slot in slots)) return null;
      let id = slots[slot];
      if (!id) {
        if (slot === 'chest' || slot === 'belt') { id = firstOfCat(slot); slots[slot] = id; }
        if (!id) return null;
      }
      if (!inv.has(id)) {
        slots[slot] = (slot === 'chest' || slot === 'belt') ? firstOfCat(slot) : null;
        return null;
      }
      if (isGear(id)) {
        if (out.has(id)) return null;
        out.add(id);
        return id;
      }
      inv.remove(id, 1);
      if (!inv.has(id) && (slot === 'chest' || slot === 'belt')) slots[slot] = firstOfCat(slot);
      return id;
    },
    /** put back what a hand holds. Unfitting things go to the bag. false = no room (keep holding). */
    stow(slot, id, state) {
      if (!id) return false;
      const d = def(id);
      if (!d) return false;
      if (isGear(id)) {
        if (!inv.has(id)) items[id] = 1;          // gear found in the world becomes owned
        out.delete(id);
        if (slot && slot in slots && fits(slot, id) && (!slots[slot] || slots[slot] === id || !inv.has(slots[slot]))) {
          for (const s of SLOT_IDS) if (slots[s] === id) slots[s] = null;
          slots[slot] = id;
        } else autoSlot(id);
        emit(ctx, 'inventory:change', { slot, itemId: id });
        return true;
      }
      const had = items[id] || 0;
      if (had >= inv.capacity(id)) return false;
      items[id] = had + 1;
      if (slot && (slot === 'chest' || slot === 'belt') && fits(slot, id)) slots[slot] = id;
      else autoSlot(id);
      emit(ctx, 'inventory:change', { slot, itemId: id });
      return true;
    },
    /** gear came back (returned / stowed elsewhere) */
    markIn(id) { out.delete(id); },
    markOut(id) { if (isGear(id) && inv.has(id)) out.add(id); },
    serialize() {
      return { items: { ...items }, slots: { ...slots }, temper: { ...temper } };
    },
    restore(data) {
      for (const k of Object.keys(items)) delete items[k];
      out.clear();
      for (const s of SLOT_IDS) slots[s] = null;
      if (!data) return;
      if (data.items) for (const k of Object.keys(data.items)) if (data.items[k] > 0 && (ITEM_INFO[k] || def(k))) items[k] = data.items[k] | 0;
      if (data.slots) for (const s of SLOT_IDS) {
        const id = data.slots[s];
        slots[s] = id && items[id] && id !== 'waybell' ? id : null;
      }
      if (data.temper) { temper.sword = data.temper.sword | 0; temper.spear = data.temper.spear | 0; }
    },
    clear() { inv.restore(null); temper.sword = 0; temper.spear = 0; },
  };

  // world gear grabbed by a hand becomes owned; returned gear is back in the bag
  ctx.events?.on?.('item:grab', (e) => {
    if (!e || !e.itemId) return;
    const d = def(e.itemId);
    if (!d) return;
    if (d.stack === 1) {
      if (!inv.has(e.itemId) && e.from === 'world') inv.add(e.itemId, 1);
      out.add(e.itemId);
    }
  });
  ctx.events?.on?.('item:release', (e) => {
    if (!e || !e.itemId || !isGear(e.itemId)) return;
    if (e.to === 'holster' || e.to === 'bag') out.delete(e.itemId);
  });
  ctx.events?.on?.('item:return', (e) => { if (e && e.itemId) out.delete(e.itemId); });

  return inv;
}
