// sim/fires.js — everything about fire (DESIGN.md §10, §7.3, §7.6, §7.7, §22.9):
//   • the ignition chance of each method (tinder, dampness, wind, board material, V-notch, skill, difficulty)
//   • fuel: what each fuel adds, burn rate by fire type and weather, rain putting fires out, embers (2 h)
//   • cooking on a fire: food items placed on the fire gain `done` every real second (small 3 / mid 5 / big 7 /
//     embers 4 × thickness); you take them out when they look right
//   • boiling water in a heat-proof container (10 min → 'boil'), stew (§7.7) and herb tea
import * as THREE from 'three';
import { Fire } from '../world/fire.js';
import { itemDef, attrsOf } from '../data/items.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** fire types (§10.3 second table) */
export const FIRE_TYPES = {
  campfire: { name: 'たき火', fuelMax: 6, rate: 1.0, windy: 1.5, rainOut: { drizzle: 'double', rain: 20, storm: 0 } },
  fire_ring: { name: '石囲いの 炉', fuelMax: 10, rate: 0.85, windy: 1.0, rainOut: { drizzle: 'double', rain: 60, storm: 30 } },
  clay_oven: { name: 'かまど', fuelMax: 16, rate: 0.6, windy: 1.0, rainOut: {} },
  signal_fire: { name: '狼煙台', fuelMax: 8, rate: 1.5, windy: 1.0, rainOut: { drizzle: 'double', rain: 60, storm: 30 } },
};

/** ignition methods (§10.1) */
export const METHODS = {
  firesteel: { name: '火打ち石（ファイヤースターター）', base: 0.85, kind: 'spark', minutes: 2, stamina: 2 },
  lighter: { name: 'ライター', base: 0.95, kind: 'spark', minutes: 1, stamina: 0 },
  flint_steel: { name: '火打ち石と 鋼', base: 0.55, kind: 'spark', minutes: 3, stamina: 3, fineTinder: true },
  flint_flint: { name: '石と 石', base: 0.10, kind: 'spark', minutes: 3, stamina: 4, fineTinder: true },
  hand_drill: { name: 'きりもみ', base: 0.12, kind: 'friction', minutes: 10, stamina: 15 },
  bow_drill: { name: '弓ぎり', base: 0.35, kind: 'friction', minutes: 6, stamina: 8 },
  fire_plow: { name: '火みぞ', base: 0.18, kind: 'friction', minutes: 8, stamina: 14 },
  gunpowder: { name: '弾の 火薬', base: 0.90, kind: 'spark', minutes: 2, stamina: 0 },
  ember: { name: '熾火から', base: 1.0, kind: 'blow', minutes: 1, stamina: 0 },
  torch: { name: 'たいまつの 火を 移す', base: 1.0, kind: 'blow', minutes: 1, stamina: 0 },
};

/** best tinder in the inventory → { stack, mul } (§10.1 tinder table; wet tinder ×0.3) */
export function bestTinder(inv) {
  let best = null, mul = 0.15;
  for (const s of inv.stacks) {
    const d = itemDef(s.id, s);
    let m = s.stats?.tinder ?? d?.tinder;
    if (!m) continue;
    if (s.wet > 60) m *= 0.3;
    if (s.q >= 75) m += 0.1;
    if (m > mul) { mul = m; best = s; }
  }
  return { stack: best, mul };
}

/** P(ignite) for one attempt (§10.1): ctx { method, base?, tinderMul, damp, windSpeed, windBlock, s (0–1), skill, diffFire, board, notch, wetKit } */
export function ignitionChance(c) {
  const M = METHODS[c.method] || METHODS.firesteel;
  let base = c.base ?? M.base;
  if (M.kind === 'friction') {
    base *= c.board ?? 1;                    // §22.9 board material
    if (c.notch === false) base *= 0.3;      // no V-notch
    if (c.wetKit) base *= c.wetKit;          // damp 0.3 / soaked 0
  }
  let tinder = c.tinderMul ?? 1;
  if (M.fineTinder && tinder < 0.9) tinder *= 0.3; // low-temperature sparks need fine tinder
  let damp = c.damp ?? 1;
  if (c.method === 'firesteel') damp = Math.pow(damp, 0.5);
  if (c.method === 'lighter') damp = Math.pow(damp, 0.8);
  const ws = c.windSpeed ?? 0;
  let wind = ws < 3 ? 1 : ws < 6 ? 0.9 : ws < 10 ? 0.7 : 0.4;
  wind = 1 - (1 - wind) * (1 - (c.windBlock ?? 0));
  const s = c.s ?? 0.55;
  return clamp(base * tinder * damp * wind * (0.5 + 0.9 * s) + (c.skill ?? 0) * 0.02 + (c.diffFire ?? 0), 0, 0.98);
}

/** dampness factor of the air / rain at the fire site (§10.1 humidity table) */
export function dampness({ rain, humidity, roof, hour, tinderWet }) {
  let d = 1;
  if (roof) { if (humidity >= 0.95) d = 0.6; else if (humidity >= 0.85) d = 0.8; }
  else if (rain > 0.9) d = 0; else if (rain > 0.6) d = 0.1; else if (rain > 0.2) d = 0.35; else if (humidity >= 0.85) d = 0.8;
  if (hour >= 5 && hour < 7 && !roof) d *= 0.8;
  if (tinderWet) d *= 0.3;
  return d;
}

const COOK_RATE = { small: 3, mid: 5, big: 7, ember: 4 };

export class Fires {
  constructor(game) {
    this.game = game;
    this.list = [];       // { fire: Fire, type, site?, cooking: [{ stack, mesh }], pots: [{ stack, boilMin }] , emberUntil }
  }

  init(game) { this.game = game; game.fires = []; }

  /** a fire object for a building site or a free fire */
  add(fire, type = 'campfire', site = null) {
    fire.type = type;
    const rec = { fire, type, site, cooking: [], pots: [], emberUntil: -1 };
    fire.rec = rec;
    this.list.push(rec);
    this.sync();
    return rec;
  }
  sync() { this.list = this.list.filter((r) => !r.removed && !(r.site && !r.site.fire)); this.game.fires = this.list.map((r) => r.fire); }

  /** an unlit fire for a building (called when a campfire / ring is completed) */
  make(type, x, y, z, { lit = false, site = null } = {}) {
    const fire = new Fire(this.game.world.scene, x, y, z, { kind: type === 'signal_fire' ? 'signal' : 'campfire', fuel: 30, lit, maxFuel: (FIRE_TYPES[type]?.fuelMax ?? 6) * 60 });
    return this.add(fire, type, site);
  }

  nearest(pos, maxDist = 3) {
    let best = null, bd = maxDist;
    for (const r of this.list) {
      const p = r.fire.group.position;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  size(rec) { const h = rec.fire.fuel / 60; return !rec.fire.lit ? (this.isEmber(rec) ? 'ember' : null) : h > 4 ? 'big' : h >= 1 ? 'mid' : 'small'; }
  isEmber(rec) { return !rec.fire.lit && this.game.clock.total < rec.emberUntil; }

  /** add one fuel stack unit to a fire (§10.3) → hours added */
  addFuel(rec, stack) {
    const d = itemDef(stack.id, stack);
    let h = d?.fuel ?? (attrsOf(stack).burn >= 5 ? 0.4 : 0);
    if (!h) return 0;
    if (stack.wet > 60) h *= 0.5;
    const max = (FIRE_TYPES[rec.type]?.fuelMax ?? 6) * 60;
    // big logs only catch on a big fire; green wood smokes
    if (stack.id === 'log' && this.size(rec) !== 'big') return -1;
    rec.fire.maxFuel = max;
    rec.fire.addFuel(h * 60);
    if (d?.smoky || stack.id === 'green_wood' || stack.id === 'green_grass') rec.smokeUntil = this.game.clock.total + 120;
    return h;
  }

  /** light the fire (after a successful attempt) */
  light(rec, how = '') {
    rec.fire.lit = true;
    rec.fire.fuel = Math.max(rec.fire.fuel, 15);
    rec.fire.wet = 0;
    this.game.sys.sfx?.play('ignite');
    this.game.bus.emit('fire:lit', { type: rec.type, how });
  }

  /** put food on the fire to cook */
  cook(rec, stack) {
    if (rec.cooking.length >= 4) return false;
    const skewer = this.game.sys.player.inv.stacks.some((s) => (attrsOf(s).long ?? 0) >= 2 && (attrsOf(s).hard ?? 0) >= 2 && s.id !== stack.id);
    const m = this.foodMesh(stack, rec, rec.cooking.length);
    rec.cooking.push({ stack, mesh: m, skewer, ashChecked: false });
    return true;
  }

  foodMesh(stack, rec, i) {
    const d = itemDef(stack.id, stack);
    const g = new THREE.Mesh(new THREE.SphereGeometry(d?.food?.thick === 0.6 ? 0.12 : 0.08, 8, 6), new THREE.MeshStandardMaterial({ color: '#d98a6a', roughness: 0.7 }));
    g.scale.set(1.6, 0.7, 1);
    const a = (i / 4) * Math.PI * 2;
    g.position.set(Math.cos(a) * 0.28, 0.32, Math.sin(a) * 0.28);
    rec.fire.group.add(g);
    return g;
  }

  /** take food (or a pot) off the fire back into the inventory */
  takeOff(rec, idx) {
    const c = rec.cooking.splice(idx, 1)[0];
    if (!c) return null;
    c.mesh.parent?.remove(c.mesh);
    this.game.sys.player.inv.addStack(c.stack);
    return c.stack;
  }

  /** put a container with water (and maybe ingredients) on the fire */
  boil(rec, stack) {
    const d = itemDef(stack.id, stack);
    if (!(d?.container?.heatproof || stack.stats?.heatproof || attrsOf(stack).heatproof >= 5)) return 'heat';
    if (!stack.water?.cups) return 'empty';
    rec.pots.push({ stack, boilMin: 0 });
    return 'ok';
  }

  /** real-time cooking and the hourly burn */
  update(dt, gm) {
    const g = this.game, W = g.sys.weather;
    if (this.list.some((r) => r.site && !r.site.fire)) this.sync();
    const rain = W?.rain ?? 0, wind = W?.windSpeed ?? 2, type = W?.type || 'clear';
    for (const rec of this.list) {
      const f = rec.fire, T = FIRE_TYPES[rec.type] || FIRE_TYPES.campfire;
      const roof = (g.sys.building?.shelterAt?.(f.group.position.x, f.group.position.z)?.rain ?? 0) >= 0.7;
      f.sheltered = roof;
      if (f.lit) {
        let rate = T.rate * (wind > 6 ? T.windy : 1);
        if (!roof && (type === 'drizzle') && T.rainOut.drizzle === 'double') rate *= 2;
        if (g.sys.companion?.tendingFire?.(rec)) rate *= 0.85;
        f.fuel -= gm * rate;
        // rain drowns open fires (§10.3)
        if (!roof && rain > 0.6) {
          rec.rainMin = (rec.rainMin || 0) + gm;
          const limit = type === 'storm' || type === 'typhoon' ? T.rainOut.storm : T.rainOut.rain;
          if (limit !== undefined && rec.rainMin >= limit) { f.fuel = 0; f.wet = 1; g.sys.sfx?.play('fire_out'); g.bus.emit('toast', { text: `雨で ${T.name}の 火が 消えた`, kind: 'bad' }); }
        } else rec.rainMin = 0;
        if (f.fuel <= 0) {
          f.fuel = 0; f.lit = false;
          rec.emberUntil = g.clock.total + (rec.buried ? 8 * 60 : 2 * 60) * (rain > 0.6 && !roof ? 0 : 1);
          g.bus.emit('fire:out', { type: rec.type });
        }
      }
      f.animate(dt, g.world.env?.night ?? 0);
      // cooking: done += rate × thickness per real second (§7.3: real time, not game time)
      const sz = this.size(rec);
      const rate = sz ? COOK_RATE[sz] : 0;
      for (const c of rec.cooking) {
        if (!rate) continue;
        const d = itemDef(c.stack.id, c.stack);
        const thick = d?.food?.thick ?? 1;
        c.stack.done = (c.stack.done || 0) + rate * thick * dt;
        if (!c.ashChecked && c.stack.done > 10) { c.ashChecked = true; if (!c.skewer && g.rng.next() < 0.3) c.stack.ash = true; }
        const k = Math.min(1, c.stack.done / 130);
        c.mesh.material.color.setRGB(0.85 - k * 0.75, 0.54 - k * 0.48, 0.42 - k * 0.38);
        if (Math.random() < dt * 0.5) g.sys.sfx?.play('sizzle', { volume: 0.4 });
      }
      // boiling: 10 game minutes at a mid fire or more
      for (const p of rec.pots) {
        if (sz === 'mid' || sz === 'big') p.boilMin += gm;
        if (p.boilMin >= 10 && p.stack.water && p.stack.water.treat !== 'boil' && p.stack.water.treat !== 'filter_boil') {
          p.stack.water.treat = p.stack.water.treat === 'filter' ? 'filter_boil' : 'boil';
          p.stack.water.warm = true;
          if (p.stack.contents?.length) this.finishStew(p.stack);
          g.bus.emit('toast', { text: `${itemDef(p.stack.id, p.stack)?.name}の 水が 沸いた`, kind: 'good' });
        }
      }
    }
  }

  /** pot contents + boiling water → stew or tea (§7.7, §11.5 herb_tea) */
  finishStew(pot) {
    const ings = pot.contents;
    const herbs = ings.filter((s) => itemDef(s.id)?.med);
    const foods = ings.filter((s) => itemDef(s.id)?.food && !itemDef(s.id)?.med);
    const kinds = new Set(foods.map((s) => s.id)).size;
    const sumFood = foods.reduce((a, s) => a + (itemDef(s.id).food.food || 0) * s.n, 0);
    const sumWater = foods.reduce((a, s) => a + (itemDef(s.id).food.water || 0) * s.n, 0);
    const worstFresh = foods.length ? Math.max(40, Math.min(...foods.map((s) => s.fresh ?? 100))) : 100;
    const poison = ings.find((s) => itemDef(s.id)?.food?.poison && !itemDef(s.id).food.poison.heatKills) || ings.find((s) => s.mix?.p > 0);
    pot.stew = {
      food: sumFood * 1.15 * (1 + 0.05 * Math.max(0, kinds - 1)) * (this.game.sys.player.inv.stacks.includes(pot) && itemDef(pot.id)?.perk?.stewFullness ? 1 : 1),
      water: (pot.water?.cups || 1) * 20 * 0.8 + sumWater, kinds, fresh: worstFresh,
      B: foods.length ? Math.max(...foods.map((s) => itemDef(s.id).food.B || 0)) : 0,
      parasite: 0, poison: poison ? (itemDef(poison.id)?.food?.poison || { id: 'plant_poison', chance: 0.7, sev: [1, 2] }) : null,
      herbs: herbs.map((s) => itemDef(s.id).med?.type).filter(Boolean),
      name: this.stewName(foods, herbs),
      portions: Math.max(1, Math.round((sumFood || 10) / 20)),
    };
    pot.contents = [];
  }

  stewName(foods, herbs) {
    if (!foods.length && herbs.length) return `${itemDef(herbs[0].id).name}の お茶`;
    const has = (re) => foods.some((s) => re.test(s.id));
    if (foods.length >= 4) return 'ごった煮';
    if (has(/fish|sardine|jack|seabream|grouper|wrasse|goby|eel/) && has(/seaweed/)) return '魚と 海藻の 潮汁';
    if (has(/boar/) && has(/taro/)) return 'イノシシの 芋煮';
    if (has(/mushroom/)) return 'キノコ汁';
    if (has(/fish|sardine|jack/)) return '魚の スープ';
    if (has(/meat/)) return '肉の スープ';
    return `${itemDef(foods[0].id).name}の 煮込み`;
  }

  serialize() {
    return this.list.filter((r) => !r.site).map((r) => ({ type: r.type, ...r.fire.serialize(), emberUntil: r.emberUntil }));
  }
}
