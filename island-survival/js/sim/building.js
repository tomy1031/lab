// sim/building.js — base building (DESIGN.md §12): ghost placement → a site with a frame → deliver materials
// (property-condition slots, so substitutes work) → work (time) → a finished structure that shelters, decays in
// storms and can be repaired. Also owns the fires (campfire / stone ring / signal fire) it builds.
//
// game.sys.building:
//   defs()                      the build-menu list ({ id, name, icon, p, minutes, slotsText[], slots[], effectText, desc, … })
//   startPlacing(id)            ghost placement, then creates a site (stage 'frame'); the tent consumes the inventory item `tent`
//   sites                       [{ uid, id, def, x, y, z, rot, stage: 'frame'|'done'|'ruin', delivered: {slotKey: [{id,n,q,wp}]},
//                                workDone (min), workFrac 0–1, hp, q, rain, node, mesh, fire? }]
//   deliver(site, uids)         put stacks from the player's inventory into the slots they satisfy
//   work(site, minutes, helpers) helpers = { axe, hammer, companion: true | 'gen', gen }; completes the building
//   shelterAt(x, z)             → { rain, wind, insul, name, fireInside, sleep, site } (best cover at the point, trees included)
//   bedAt(x, z)                 → bed quality multiplier (§4.6; tent +0.20, hut +0.10) or null when no bed structure is there
//   repair(site, uid) · reinforce(site) · pack(site) (tent) · takeWater(site, L) · missing(site) · nearby(x, z, r)
//   update(dt, gm, game) · serialize() / deserialize() · debug()
// Events: 'build:placed' {id, name, site}, 'build:done' {id, name, site, morale}, 'build:ruin' {id, name, why},
//         'build:washed' {id, name, x, z, items: [{id, n}]}, toasts in Japanese.
// The Fire objects of the sites are ticked and animated here (do not tick them again elsewhere).
import { BUILDINGS, BUILD_ORDER, ATTR_JP } from '../data/buildings.js';

// Optional deps: items.js is written in parallel; structures.js / fire.js need three (absent in the node tests).
let attrsOf = (s) => s?.attrs || {};
let tagsOf = () => [];
try { const m = await import('../data/items.js'); attrsOf = m.attrsOf; tagsOf = (s) => m.itemDef?.(s.id, s)?.tags || []; } catch (e) { /* tests inject */ }
let Structures = null, FireCls = null;
try { Structures = await import('../world/structures.js'); } catch (e) { /* node */ }
try { FireCls = (await import('../world/fire.js')).Fire; } catch (e) { /* node */ }

/** tests / other agents may replace the item accessors */
export function setItemApi({ attrsOf: a, tagsOf: t } = {}) { if (a) attrsOf = a; if (t) tagsOf = t; }

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ pure parts
/** does a stack fill a slot? ids are an "or"; otherwise every attribute minimum and (if given) one tag must hold */
export function slotMatches(slot, stack, env = {}) {
  if (!stack || !(stack.n > 0)) return false;
  if (slot.ids?.includes(stack.id)) return true;
  const hasNeed = slot.need && Object.keys(slot.need).length > 0, hasTags = slot.tags?.length > 0;
  if (!hasNeed && !hasTags) return false;
  const attrs = (env.attrsOf || attrsOf)(stack) || {};
  for (const [k, v] of Object.entries(slot.need || {})) if ((attrs[k] ?? 0) < v) return false;
  if (hasTags) {
    const tags = (env.tagsOf || tagsOf)(stack) || [];
    if (!slot.tags.some((t) => tags.includes(t))) return false;
  }
  return true;
}

export const deliveredCount = (site, key) => (site.delivered?.[key] || []).reduce((a, p) => a + p.n, 0);
export const slotRemaining = (site, slot) => Math.max(0, slot.n - deliveredCount(site, slot.key));
export function allDelivered(site) { return BUILDINGS[site.id].slots.every((s) => slotRemaining(site, s) <= 0); }
export function deliveredFraction(site) {
  const slots = BUILDINGS[site.id].slots;
  const tot = slots.reduce((a, s) => a + s.n, 0);
  if (!tot) return 1;
  return slots.reduce((a, s) => a + Math.min(s.n, deliveredCount(site, s.key)), 0) / tot;
}
/** n-weighted mean quality of everything delivered (default 50) */
export function avgQuality(delivered) {
  let n = 0, q = 0;
  for (const list of Object.values(delivered || {})) for (const p of list) { n += p.n; q += (p.q ?? 50) * p.n; }
  return n ? q / n : 50;
}
export function avgWaterproof(parts) {
  let n = 0, w = 0;
  for (const p of parts) { n += p.n; w += (p.wp ?? 0) * p.n; }
  return n ? w / n : 0;
}
/** §12.1: rain block = clamp(base + (mean roof waterproof − 5) × 0.04 + (Q − 50) / 500, 0, 1) */
export function rainBlock(base, roofParts, Q = 50) {
  if (!(base > 0)) return 0;
  if (!roofParts?.length) return clamp(base + (Q - 50) / 500, 0, 1);
  return clamp(base + (avgWaterproof(roofParts) - 5) * 0.04 + (Q - 50) / 500, 0, 1);
}
/** leaking roof (§12.4): hp < 50 % → ×0.7, < 25 % → ×0.4 */
export function leakFactor(hpFrac) { return hpFrac < 0.25 ? 0.4 : hpFrac < 0.5 ? 0.7 : 1; }
/** storm damage per game hour (§12.4): (wind − 10) × 1.2 × weakness, halved when reinforced */
export function stormDamagePerHour(wind, weakness, reinforced = false) {
  return Math.max(0, wind - 10) * 1.2 * weakness * (reinforced ? 0.5 : 1);
}
/** total hp loss per hour of one structure under the current weather ctx { stormy, wind, heavy } */
export function damagePerHour(def, ctx, site = {}) {
  if (!(def.hp > 0)) return 0;
  let d = 0;
  if (ctx.stormy) d += stormDamagePerHour(ctx.wind, def.weakness ?? 1, site.reinforced);
  if (site.leaf) {
    if (ctx.heavy) d += 1;
    d += 3 / 24;           // leaf roof: −3 per day
  } else if (def.slots.some((s) => s.cord)) d += 1 / 24;     // cord: −1 per day
  return d;
}
/** helpers → time multiplier (§12.1 step 3) */
export function workMultiplier(h = {}) {
  let m = 1;
  if (h.axe) m *= 0.6;
  if (h.hammer) m *= 0.85;
  if (typeof h.companion === 'number') m *= h.companion; // the helper's own multiplier (§23.5 建築の手伝い)
  else if (h.gen || h.companion === 'gen') m *= 0.45; else if (h.companion) m *= 0.6;
  return m;
}
/** point in site-local coordinates (u across, v front) */
export function toLocal(site, x, z) {
  const dx = x - site.x, dz = z - site.z, c = Math.cos(site.rot || 0), s = Math.sin(site.rot || 0);
  return [dx * c - dz * s, dx * s + dz * c];
}
export function insideFootprint(site, x, z, pad = 0) {
  const [w, d] = BUILDINGS[site.id].size;
  const [u, v] = toLocal(site, x, z);
  return Math.abs(u) <= w / 2 + pad && Math.abs(v) <= d / 2 + pad;
}
/** wind (blocked fraction) of a lean-to: full from the back, 0.2 from the front / side (§12.3) */
export function leanToWind(site, windDir, base) {
  if (windDir === undefined || windDir === null) return base;
  const dx = Math.sin(windDir), dz = Math.cos(windDir);      // the air moves toward (dx, dz)
  // the back is local −v; local v axis in world: (sin rot, cos rot)
  const fx = Math.sin(site.rot || 0), fz = Math.cos(site.rot || 0);
  const dot = dx * fx + dz * fz;                           // > 0: wind blows from the back toward the front (blocked)
  return 0.2 + (base - 0.2) * smooth(-0.2, 0.6, dot);
}
/** a standing wall (windbreak): blocks wind for people within 2 m on its lee side when the wind is roughly across it */
export function windbreakCovers(site, x, z, windDir) {
  if (windDir === undefined || windDir === null) return false;
  const [w] = BUILDINGS[site.id].size;
  const [u, v] = toLocal(site, x, z);
  if (Math.abs(u) > w / 2 + 0.6) return false;
  const dx = Math.sin(windDir), dz = Math.cos(windDir);
  const fx = Math.sin(site.rot || 0), fz = Math.cos(site.rot || 0);
  const across = dx * fx + dz * fz;                          // wind component along local v (through the wall)
  if (Math.abs(across) < 0.5) return false;
  return across > 0 ? (v > 0 && v < 2.2) : (v < 0 && v > -2.2);
}

const rankText = (n) => String(n);
export function condText(slot) {
  const parts = Object.entries(slot.need || {}).map(([k, v]) => `${ATTR_JP[k] || k}${v}以上`);
  return parts.join('・');
}
export function slotText(slot) { const c = condText(slot); return `${slot.label} ×${rankText(slot.n)}${c ? `（${c}）` : ''}`; }
export function effectText(def) {
  const e = def.effects, out = [];
  if (e.rain) out.push(`雨よけ ${Math.round(e.rain * 100)}%`);
  if (e.wind) out.push(`風よけ ${Math.round(e.wind * 100)}%`);
  if (e.insul) out.push(`保温 ${e.insul > 0 ? '+' : ''}${e.insul}℃`);
  if (e.sleep) out.push(`睡眠 ×${e.sleep}`);
  if (e.sleepAdd) out.push(`睡眠 +${e.sleepAdd}`);
  if (e.people) out.push(`${e.people}人`);
  if (e.water) out.push(`雨水 ${e.water.cap}L`);
  if (e.storage?.n) out.push(`${e.storage.n}個 収納`);
  return out.join('・');
}
const moraleFor = (def) => (def.morale ?? (def.minutes >= 300 ? 12 : def.minutes >= 90 ? 8 : def.minutes >= 30 ? 5 : 0));

const REINFORCE = [
  { key: 'cord', label: '紐', need: { fiber: 3, flex: 3 }, n: 4 },
  { key: 'stone', label: '石の 重し', need: {}, tags: ['stone'], ids: ['stone', 'rock', 'cobble'], n: 6 },
];

// ------------------------------------------------------------------------------------------------ system
export class Building {
  constructor() {
    this.game = null;
    this.sites = [];
    this.nextUid = 1;
    this.stormId = 0;
    this._storm = 0;
    this._t = 0;
    this._pending = null;
    this._warnAt = 0;
  }

  init(game) { this.game = game; }

  // ---- menu -------------------------------------------------------------------------------------
  defs() {
    return BUILD_ORDER.map((id) => {
      const d = BUILDINGS[id];
      return {
        id, name: d.name, icon: d.icon, p: d.p, minutes: d.minutes, size: d.size, hp: d.hp, desc: d.desc,
        place: d.place, item: d.item || null,
        slots: d.slots.map((s) => ({ key: s.key, label: s.label, n: s.n, need: s.need, text: slotText(s) })),
        slotsText: d.slots.map(slotText),
        effectText: effectText(d),
        effects: d.effects,
        available: !d.item || !!this.game?.sys?.player?.inv?.find?.(d.item),
      };
    });
  }

  // ---- placement --------------------------------------------------------------------------------
  startPlacing(id) {
    const g = this.game, def = BUILDINGS[id];
    if (!def || !g?.placement || !Structures) return false;
    const inv = g.sys?.player?.inv;
    if (def.item && !inv?.find?.(def.item)) { this.toast('テントを 持っていない', 'warn'); return false; }
    g.placement.start({
      id, size: def.size, water: def.water, floating: def.floating,
      maxSlope: def.place === 'flat' ? 0.5 : undefined,
      build: () => Structures.buildMesh(id, { stage: 'done', progress: 1 }),
      check: (x, z) => this.canPlaceAt(def, x, z),
    }, (pos) => {
      if (def.item) { const st = inv?.find?.(def.item); if (!st) return; inv.take(st.uid, 1); }
      const site = this.createSite(id, pos);
      this.toast(def.slots.length ? `「${def.name}」の 骨組みを 置いた。素材を 納めよう（E）` : `「${def.name}」を 張る 場所を 決めた。`, 'info');
      g.bus.emit('build:placed', { id, name: def.name, site });
    });
    return true;
  }

  canPlaceAt(def, x, z) {
    const g = this.game, t = g.world?.terrain;
    if (['campfire', 'signal_fire', 'tent'].includes(def.id) || def.fire) {
      const sh = this.shelterAt(x, z);
      if (sh.site && sh.rain >= 0.9 && (sh.fireInside !== true) && def.id !== 'tent' && def.fire) { this.warn('小屋の 中に 地面の 火は 置けない（石囲いの 炉なら 可）'); return false; }
      if (def.fire && def.id !== 'fire_ring') {
        const inner = this.sites.find((s) => s.stage === 'done' && s.id !== 'windbreak' && insideFootprint(s, x, z) && BUILDINGS[s.id].effects.rain >= 0.9);
        if (inner) { this.warn('小屋の 中に 地面の 火は 置けない（石囲いの 炉なら 可）'); return false; }
      }
    }
    if (def.id === 'sos_sign' && t) {
      const zone = t.zoneAt?.(x, z);
      if (!['beach', 'grass', 'rocks', 'hill'].includes(zone)) { this.warn('SOS は 浜・草原・岩山の 平地に'); return false; }
      if (t.heightAt(x, z) < 0.9) { this.warn('満潮線より 上に 作ろう（流される）'); return false; }
    }
    return true;
  }

  warn(text) {
    const now = performance?.now?.() ?? 0;
    if (now - this._warnAt < 2500) return;
    this._warnAt = now;
    this.toast(text, 'warn');
  }
  toast(text, kind = 'info') { this.game?.bus?.emit('toast', { text, kind }); }

  // ---- sites ------------------------------------------------------------------------------------
  createSite(id, { x, y = 0, z, rot = 0 }, extra = {}) {
    const def = BUILDINGS[id];
    const site = {
      uid: this.nextUid++, id, def, x, y, z, rot, stage: 'frame', delivered: {}, workDone: 0, workFrac: 0, hp: 0, q: 50,
      rain: 0, wind: 0, reinforced: false, leaf: false, roofKind: 'palm', born: 0, water: 0, node: null, mesh: null, fire: null, colliders: [],
      _prog: -1, ...extra,
    };
    for (const s of def.slots) site.delivered[s.key] ||= [];
    this.sites.push(site);
    this.attach(site);
    if (!def.slots.length) site.ready = true;
    return site;
  }

  /** mesh + node for a site (also used after load) */
  attach(site) {
    const g = this.game, def = BUILDINGS[site.id], w = g?.world;
    if (!w) return;
    this.refreshMesh(site, true);
    if (w.nodes?.add) {
      site.node = w.nodes.add({
        kind: 'structure', structure: true, buildId: site.id, name: def.name, x: site.x, y: site.y, z: site.z,
        r: Math.max(def.size[0], def.size[1]) / 2, pickY: Math.min(1.2, def.height / 2), data: { site },
      });
    }
    if (site.stage === 'done') this.solidify(site);
    if (site.stage === 'done' && def.fire && !site.fire) this.makeFire(site);
  }

  progressOf(site) {
    if (site.stage === 'done') return 1;
    return clamp(deliveredFraction(site) * 0.5 + site.workFrac * 0.5, 0, 1);
  }

  refreshMesh(site, force = false) {
    const g = this.game;
    if (!Structures || !g?.world?.scene) return;
    const prog = this.progressOf(site);
    const key = site.stage + ':' + Math.round(prog * 40) + ':' + site.roofKind;
    if (!force && key === site._prog) return;
    site._prog = key;
    if (site.mesh) { g.world.scene.remove(site.mesh); site.mesh.traverse((o) => o.geometry?.dispose?.()); }
    const stage = site.stage === 'ruin' ? 'ruin' : site.stage;
    site.mesh = Structures.buildMesh(site.id, { stage, progress: prog, materials: { roof: this.roofKindOf(site) } });
    site.mesh.position.set(site.x, site.y, site.z);
    site.mesh.rotation.y = site.rot;
    g.world.scene.add(site.mesh);
  }

  roofParts(site) {
    const def = BUILDINGS[site.id];
    let slots = def.slots.filter((s) => s.roof);
    if (!slots.length) slots = def.slots.filter((s) => ['panel', 'cover'].includes(s.key));
    return slots.flatMap((s) => site.delivered[s.key] || []);
  }
  roofKindOf(site) {
    const parts = this.roofParts(site);
    if (!parts.length || !Structures) return site.roofKind || 'palm';
    const tally = {};
    for (const p of parts) { const k = Structures.roofKindOf(p.id); tally[k] = (tally[k] || 0) + p.n; }
    return Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  }

  /** world solid circles (walls) and the raised floor, once the structure stands */
  solidify(site) {
    const def = BUILDINGS[site.id], nodes = this.game?.world?.nodes;
    if (!nodes?.add) return;
    const c = Math.cos(site.rot), s = Math.sin(site.rot);
    const W = (u, v) => [site.x + u * c + v * s, site.z - u * s + v * c];
    for (const seg of def.walls || []) {
      const L = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]), n = Math.max(1, Math.ceil(L / 0.55) + 1);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const [wx, wz] = W(seg[0] + (seg[2] - seg[0]) * t, seg[1] + (seg[3] - seg[1]) * t);
        site.colliders.push(nodes.add({ kind: 'collider', solid: true, cr: def.cr ?? 0.35, r: 0, x: wx, y: site.y, z: wz, solidTop: site.y + def.height, data: { site } }));
      }
    }
    if (def.floorH && site.node) {
      site.node.floorY = site.y + def.floorH;
      site.node.fw = def.size[0] / 2 * 0.92; site.node.fd = def.size[1] / 2 * 0.92;
    }
  }
  unsolidify(site) {
    const nodes = this.game?.world?.nodes;
    for (const n of site.colliders) nodes?.remove?.(n);
    site.colliders = [];
    if (site.node) { delete site.node.floorY; }
  }

  makeFire(site) {
    const g = this.game, def = BUILDINGS[site.id];
    if (!FireCls || !g?.world?.scene || !def.fire) return null;
    const laid = Object.values(site.delivered).flat().reduce((a, p) => a + p.n, 0) * 15;
    const f = new FireCls(g.world.scene, site.x, site.y, site.z, { kind: def.fire.kind, fuel: site.fireFuel ?? (def.id === 'campfire' ? laid : 0), maxFuel: def.fire.maxFuelMin, lit: false });
    // our mesh has the stones and logs: drop the ones Fire builds itself, keep flames / smoke / light
    for (const ch of [...f.group.children]) if (ch.isMesh) f.group.remove(ch);
    f.bus = (name, fire) => g.bus.emit(name, { fire, site });
    site.fire = f;
    // the game's fire system (sim/fires.js) owns burning, rain, cooking and lighting when present
    if (g.sys?.fires?.add) { g.sys.fires.add(f, def.id === 'fire_ring' ? 'fire_ring' : def.id === 'signal_fire' ? 'signal_fire' : def.id === 'clay_oven' ? 'clay_oven' : 'campfire', site); f.managed = true; }
    return f;
  }

  // ---- delivery & work --------------------------------------------------------------------------
  /** free list of what a site still needs */
  missing(site) {
    return BUILDINGS[site.id].slots.map((s) => ({ key: s.key, label: s.label, n: s.n, have: deliveredCount(site, s.key), need: slotRemaining(site, s), text: slotText(s) })).filter((m) => m.need > 0);
  }
  isReady(site) { return site.stage === 'frame' && allDelivered(site); }
  nearby(x, z, r = 3, filter = null) {
    return this.sites.filter((s) => Math.hypot(s.x - x, s.z - z) - Math.max(...BUILDINGS[s.id].size) / 2 <= r && (!filter || filter(s)));
  }

  /** take stacks (uids from the player's inventory) into the slots they satisfy. returns { delivered: [{key,id,n}], rejected: [uid] } */
  deliver(site, uids) {
    const inv = this.game?.sys?.player?.inv, def = BUILDINGS[site.id];
    const out = { delivered: [], rejected: [] };
    if (!inv || site.stage !== 'frame') return out;
    for (const uid of uids) {
      const st = inv.get(uid);
      if (!st) { out.rejected.push(uid); continue; }
      let used = false;
      for (const slot of def.slots) {
        const rem = slotRemaining(site, slot);
        if (rem <= 0) continue;
        const cur = inv.get(uid);
        if (!cur || !slotMatches(slot, cur)) continue;
        const wp = attrsOf(cur)?.waterproof ?? 0;
        const parts = inv.take(uid, Math.min(cur.n, rem));
        for (const p of parts) {
          site.delivered[slot.key].push({ id: p.id, n: p.n, q: p.q ?? 50, wp });
          out.delivered.push({ key: slot.key, id: p.id, n: p.n });
        }
        used = true;
        break;            // one slot per call: leftovers stay in the bag (a leaf must not spill into the cord slot)
      }
      if (!used) out.rejected.push(uid);
    }
    if (out.delivered.length) {
      site.roofKind = this.roofKindOf(site);
      this.refreshMesh(site);
      if (allDelivered(site)) this.toast(`${def.name}：素材が そろった。作業しよう（E）`, 'good');
      else { const m = this.missing(site)[0]; this.toast(`${def.name}：あと ${m.label} ×${m.need}`, 'info'); }
    } else if (out.rejected.length) this.toast('それは ここの 素材に ならない', 'warn');
    return out;
  }

  /** work on a frame (game minutes). returns { ok, done, progress, stamina, reason? } */
  work(site, minutes, helpers = {}) {
    const def = BUILDINGS[site.id];
    if (site.stage !== 'frame') return { ok: false, reason: 'stage' };
    if (!allDelivered(site)) return { ok: false, reason: 'materials', missing: this.missing(site) };
    let need = def.minutes * workMultiplier(helpers);
    const w = this.game?.sys?.weather;
    if (def.id === 'tent' && w?.windSpeed > 10) need *= 2;
    site.workDone += minutes;
    site.workFrac = clamp(site.workFrac + minutes / Math.max(1, need), 0, 1);
    const res = { ok: true, done: false, progress: site.workFrac, stamina: minutes, remaining: Math.max(0, (1 - site.workFrac) * need) };
    if (site.workFrac >= 1) {
      if (def.id === 'tent' && ['storm', 'typhoon'].includes(w?.type) && (this.game?.rng?.next?.() ?? Math.random()) < 0.6) {
        site.workFrac = 0; site.workDone = 0;
        this.toast('嵐で 設営に 失敗した…やり直し', 'warn');
        res.ok = false; res.reason = 'storm'; this.refreshMesh(site);
        return res;
      }
      this.complete(site);
      res.done = true;
    } else this.refreshMesh(site);
    return res;
  }

  complete(site) {
    const g = this.game, def = BUILDINGS[site.id];
    site.stage = 'done';
    site.q = avgQuality(site.delivered);
    site.roofKind = this.roofKindOf(site);
    site.leaf = !!def.leafRoof && site.roofKind !== 'tarp';
    site.rain = rainBlock(def.effects.rain, this.roofParts(site), site.q);
    site.hp = def.hp * (0.75 + 0.25 * clamp(site.q / 100));
    site.born = g?.clock?.total ?? 0;
    site.workFrac = 1;
    this.refreshMesh(site, true);
    this.solidify(site);
    if (def.fire && !site.fire) this.makeFire(site);
    const morale = moraleFor(def);
    this.toast(`${def.name}が 完成した！`, 'good');
    g?.bus?.emit('build:done', { id: site.id, name: def.name, site, morale });
    g?.bus?.emit('log', { text: `${def.name}を 建てた`, kind: 'build' });
    return site;
  }

  /** tent only: take it down (5 min) and put the item back */
  pack(site) {
    const def = BUILDINGS[site.id];
    if (!def.item || site.stage === 'frame') return false;
    this.removeSite(site);
    this.game?.sys?.player?.inv?.add(def.item, 1);
    this.toast('テントを たたんだ。', 'info');
    return { minutes: def.packMinutes || 5 };
  }

  removeSite(site) {
    const g = this.game;
    this.unsolidify(site);
    if (site.node) g?.world?.nodes?.remove?.(site.node);
    if (site.mesh) { g?.world?.scene?.remove(site.mesh); site.mesh.traverse((o) => o.geometry?.dispose?.()); }
    site.fire?.remove?.();
    site.fire = null; site.mesh = null; site.node = null;
    this.sites = this.sites.filter((s) => s !== site);
  }

  // ---- repair / reinforce -----------------------------------------------------------------------
  repair(site, uid) {
    const inv = this.game?.sys?.player?.inv, def = BUILDINGS[site.id];
    if (!inv || !(def.hp > 0) || site.stage === 'frame') return false;
    const st = inv.get(uid);
    if (!st) return false;
    const slot = def.slots.find((s) => slotMatches(s, st));
    if (!slot) { this.toast('その 素材では 直せない', 'warn'); return false; }
    inv.take(uid, 1);
    site.hp = Math.min(def.hp, site.hp + def.hp * 0.15);
    if (site.stage === 'ruin' && site.hp >= def.hp * 0.3) {
      site.stage = 'done';
      this.refreshMesh(site, true); this.solidify(site);
      this.toast(`${def.name}を 立て直した。`, 'good');
    } else this.toast(`${def.name}を 直した（${Math.round(site.hp / def.hp * 100)}%）`, 'good');
    return true;
  }

  /** before a storm: cord ×4 + stones ×6 → the next storm's damage ×0.5 */
  reinforce(site) {
    const inv = this.game?.sys?.player?.inv, def = BUILDINGS[site.id];
    if (!inv || !(def.hp > 0) || site.stage !== 'done') return { ok: false, reason: 'stage' };
    if (site.reinforced) return { ok: false, reason: 'already' };
    const picks = [];
    for (const slot of REINFORCE) {
      let need = slot.n;
      for (const st of inv.stacks) {
        if (need <= 0) break;
        if (!slotMatches(slot, st)) continue;
        const k = Math.min(st.n, need); picks.push([st.uid, k]); need -= k;
      }
      if (need > 0) { this.toast(`補強には ${slot.label} ×${slot.n} が いる`, 'warn'); return { ok: false, reason: 'materials', missing: slot.label }; }
    }
    for (const [uid, k] of picks) inv.take(uid, k);
    site.reinforced = true;
    this.toast(`${def.name}を 補強した（次の 嵐の ダメージ ×0.5）`, 'good');
    return { ok: true };
  }

  takeWater(site, liters) {
    const got = Math.min(site.water || 0, liters);
    site.water = (site.water || 0) - got;
    return got;
  }

  // ---- queries ----------------------------------------------------------------------------------
  /** best shelter covering (x, z) — structures (stage 'done'), or trees. Rock overhangs and caves are the lead's. */
  shelterAt(x, z) {
    const g = this.game, w = g?.sys?.weather;
    const windDir = w?.windDir;
    const heavy = (w?.rain ?? 0) >= 0.6 || ['storm', 'typhoon', 'rain'].includes(w?.type);
    let best = { rain: 0, wind: 0, insul: 0, name: null, fireInside: true, sleep: 0, site: null, people: 0 };
    let score = -1;
    for (const s of this.sites) {
      if (s.stage !== 'done') continue;
      const def = BUILDINGS[s.id], e = def.effects;
      if (def.effects.bedOnly && !(e.rain || e.wind)) continue;
      let cand = null;
      if (e.windOneSide) {
        if (windbreakCovers(s, x, z, windDir)) cand = { rain: 0, wind: e.wind, insul: 0, name: def.name, fireInside: true, sleep: 0, site: s, people: 0 };
      } else if ((e.rain || e.wind || e.insul) && insideFootprint(s, x, z)) {
        let rain = s.rain ?? e.rain;
        if (def.leafRoof && def.hp > 0) rain *= leakFactor(s.hp / def.hp);
        if (s.id === 'tent' && s.hp < def.hp * 0.3) rain = Math.min(rain, 0.6);
        let wind = e.wind;
        if (e.windFromBackOnly) wind = leanToWind(s, windDir, e.wind);
        cand = { rain, wind, insul: e.insul || 0, name: def.name, fireInside: e.fireInside, sleep: e.sleep || 0, site: s, people: e.people || 0 };
      }
      if (!cand) continue;
      const sc = cand.rain * 10 + cand.wind * 2 + cand.insul * 0.3;
      if (sc > score) { score = sc; best = cand; }
    }
    // trees: palms / broad-leaf trunks within 2.5 m (§5.5)
    const nodes = g?.world?.nodes;
    if (nodes?.query && best.rain < 0.5) {
      const trees = nodes.query(x, z, 2.5, (n) => (n.kind === 'tree' || n.kind === 'palm') && Math.hypot(n.x - x, n.z - z) <= 2.5);
      if (trees.length) {
        const jungle = g.world?.terrain?.zoneAt?.(x, z) === 'jungle';
        const t = { rain: heavy ? 0.3 : 0.5, wind: jungle ? 0.5 : 0.3, insul: 0, name: '木の 下', fireInside: true, sleep: 0, site: null, people: 1 };
        if (t.rain > best.rain || (t.rain === best.rain && t.wind > best.wind)) best = t;
        else if (best.rain === 0 && best.wind < t.wind) best = { ...best, wind: t.wind };
      }
    }
    return best;
  }

  /** is there a fire of ours within r of (x, z)? */
  nearFire(x, z, r = 6) {
    let best = null;
    for (const s of this.sites) {
      if (!s.fire || !s.fire.lit) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d <= r && (best === null || d < best)) best = d;
    }
    return best;
  }

  /** bed multiplier (§4.6) where (x, z) lies; tent +0.20, bamboo hut +0.10; null when no bed structure covers the point */
  bedAt(x, z) {
    const clock = this.game?.clock;
    let mult = null, add = 0, found = false;
    for (const s of this.sites) {
      if (s.stage !== 'done') continue;
      const def = BUILDINGS[s.id], e = def.effects;
      if (!(e.sleep || e.sleepAdd) || !insideFootprint(s, x, z)) continue;
      found = true;
      if (e.sleepAdd) add += e.sleepAdd;
      if (e.bedOnly || e.sleep >= 0.5) {
        let m = e.sleep;
        if (e.wornDays && clock && clock.total - s.born > e.wornDays * 1440) m = e.sleepWorn ?? m;
        mult = Math.max(mult ?? 0, m);
      } else add += e.sleep;
    }
    if (!found) return null;
    return (mult ?? 0.55) + add;
  }

  // ---- per frame --------------------------------------------------------------------------------
  update(dt, gm, game) {
    if (game) this.game = game;
    const g = this.game;
    if (this._pending && g?.world) { this.rebuild(); }
    if (!this.sites.length) return;
    const w = g?.sys?.weather;
    const type = w?.type ?? 'clear', rain = w?.rain ?? 0, wind = w?.windSpeed ?? 0;
    const stormy = type === 'storm' || type === 'typhoon';
    const heavy = rain >= 0.6 || stormy || type === 'rain';
    const drizzle = !heavy && (type === 'drizzle' || rain > 0.05);
    if (stormy && !this._storm) { this._storm = ++this.stormId; }
    else if (!stormy && this._storm) {
      this._storm = 0;
      for (const s of this.sites) s.reinforced = false;
    }
    const gH = gm / 60;
    this._t += dt;
    const slow = this._t > 1.5;
    if (slow) this._t = 0;
    const night = g?.clock ? (g.clock.hour < 5.5 || g.clock.hour > 19 ? 1 : 0) : 0;
    const rnd = () => (g?.rng?.next?.() ?? Math.random());
    const ctx = { stormy, wind, heavy };
    const doomed = [];
    for (const s of [...this.sites]) {
      const def = BUILDINGS[s.id];
      if (s.stage === 'done') {
        // storm episode start: stone letters get battered, low sites may be washed away
        if (stormy && s.stormSeen !== this._storm) {
          s.stormSeen = this._storm;
          if (def.stormDamage && def.hp) s.hp = Math.max(0, s.hp - def.stormDamage);
          s.stormRoll = false;
        }
        if (stormy && !s.stormRoll && s.y < 2 && def.id !== 'raft' && def.id !== 'sos_sign' && !def.floating) {
          const tide = g?.clock?.tide?.() ?? 0;
          if (tide > 0.3) {
            s.stormRoll = true;
            if (rnd() < 0.5) { doomed.push(s); continue; }
          }
        }
        if (def.hp > 0) {
          const dmg = damagePerHour(def, ctx, s) * gH;
          if (dmg > 0) {
            const before = s.hp / def.hp;
            s.hp = Math.max(0, s.hp - dmg);
            if (def.leafRoof && before >= 0.5 && s.hp / def.hp < 0.5) this.toast(`${def.name}の 屋根が 傷んで 雨漏りしている`, 'warn');
          }
          if (def.id === 'tent' && wind > 20 && rnd() < 1 - Math.pow(1 - 0.15 * (s.reinforced ? 0.3 : 1), gH)) { s.hp = 0; }
          if (s.hp <= 0) { this.ruin(s, '嵐と 時間で 傷んだ'); continue; }
        }
        // rain catchers
        if (def.effects.water) {
          const rate = heavy ? def.effects.water.heavy : drizzle ? def.effects.water.drizzle : 0;
          s.water = Math.min(def.effects.water.cap, (s.water || 0) + rate * gH);
        }
      }
      if (s.fire && !s.fire.managed) {
        if (slow) s.fire.sheltered = this.shelterAt(s.x, s.z).rain >= 0.9;
        s.fire.tick(gm, s.fire.sheltered ? 0 : rain, wind / 22);
        s.fire.animate(dt, night);
      }
    }
    for (const s of doomed) this.wash(s);
  }

  ruin(site, why = '') {
    const def = BUILDINGS[site.id];
    if (def.noRuin) { this.removeSite(site); return; }
    site.stage = 'ruin'; site.hp = 0;
    this.unsolidify(site);
    site.fire?.remove?.(); site.fire = null;
    this.refreshMesh(site, true);
    this.toast(`${def.name}が 壊れた…（直せば 立て直せる）`, 'danger');
    this.game?.bus?.emit('build:ruin', { id: site.id, name: def.name, why, site });
  }

  /** storm surge: the structure is gone, half the materials are scattered on the beach */
  wash(site) {
    const def = BUILDINGS[site.id], items = [];
    for (const list of Object.values(site.delivered)) for (const p of list) { const k = Math.floor(p.n / 2); if (k > 0) items.push({ id: p.id, n: k, q: p.q }); }
    this.toast(`高潮で ${def.name}が 流された…`, 'danger');
    this.game?.bus?.emit('build:washed', { id: site.id, name: def.name, x: site.x, z: site.z, items });
    this.removeSite(site);
  }

  // ---- save -------------------------------------------------------------------------------------
  serialize() {
    return {
      nextUid: this.nextUid, stormId: this.stormId,
      sites: this.sites.map((s) => ({
        uid: s.uid, id: s.id, x: s.x, y: s.y, z: s.z, rot: s.rot, stage: s.stage, delivered: s.delivered, workDone: s.workDone, workFrac: s.workFrac,
        hp: s.hp, q: s.q, rain: s.rain, reinforced: s.reinforced, leaf: s.leaf, roofKind: s.roofKind, born: s.born, water: s.water,
        fire: s.fire ? s.fire.serialize() : (s.fireState || null),
      })),
    };
  }

  deserialize(d) {
    this._pending = d || null;
    if (this.game?.world) this.rebuild();
  }

  rebuild() {
    const d = this._pending;
    this._pending = null;
    for (const s of [...this.sites]) this.removeSite(s);
    if (!d) return;
    this.nextUid = d.nextUid || 1; this.stormId = d.stormId || 0;
    for (const o of d.sites || []) {
      if (!BUILDINGS[o.id]) continue;
      const { fire, ...rest } = o;
      const site = {
        def: BUILDINGS[o.id], node: null, mesh: null, fire: null, colliders: [], _prog: -1, wind: 0, ...rest,
      };
      this.sites.push(site);
      site.fireFuel = fire?.fuel;
      this.attach(site);
      if (site.fire && fire) { site.fire.fuel = fire.fuel; site.fire.lit = fire.lit; site.fire.wet = fire.wet || 0; site.fire.sheltered = !!fire.sheltered; }
    }
  }

  debug() {
    return {
      sites: this.sites.map((s) => ({
        uid: s.uid, id: s.id, stage: s.stage, hp: Math.round(s.hp), q: Math.round(s.q), rain: +(s.rain || 0).toFixed(2),
        work: +s.workFrac.toFixed(2), missing: s.stage === 'frame' ? this.missing(s).map((m) => `${m.key}×${m.need}`) : undefined,
        fire: s.fire ? { lit: s.fire.lit, fuel: Math.round(s.fire.fuel) } : undefined,
      })),
    };
  }
}
