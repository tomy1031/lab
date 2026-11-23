// tests/building.mjs — the pure parts of base building (DESIGN.md §12) with a fake game.
//   node tests/building.mjs
import {
  Building, slotMatches, rainBlock, stormDamagePerHour, damagePerHour, workMultiplier, insideFootprint, avgQuality,
  leakFactor, leanToWind, windbreakCovers, setItemApi, deliveredFraction,
} from '../js/sim/building.js';
import { BUILDINGS } from '../js/data/buildings.js';

let failed = 0;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) failed++; };

// ---- a tiny item table (items.js is written elsewhere)
const ITEMS = {
  palm_leaf: { attrs: { waterproof: 4, flex: 6, fiber: 3 }, tags: ['leaf', 'plant'] },
  woven_mat: { attrs: { waterproof: 5, flex: 5, fiber: 6 }, tags: ['mat', 'cloth'] },
  tarp: { attrs: { waterproof: 10, flex: 5 }, tags: ['cloth'] },
  bark: { attrs: { waterproof: 5, flex: 2 }, tags: ['bark'] },
  banana_leaf: { attrs: { waterproof: 3, flex: 6 }, tags: ['leaf'] },
  stick: { attrs: { long: 5, hard: 4, burn: 5 }, tags: ['wood'] },
  long_branch: { attrs: { long: 8, hard: 5, burn: 5 }, tags: ['wood'] },
  vine: { attrs: { fiber: 5, flex: 6 }, tags: ['fiber'] },
  grass: { attrs: { fiber: 1, flex: 3, insul: 4, burn: 6 }, tags: ['plant'] },
  stone: { attrs: { hard: 7, heavy: 6 }, tags: ['stone'] },
  bamboo: { attrs: { long: 8, hard: 5, float: 6 }, tags: ['plant'] },
};
const stackOf = (id, n = 1, q = 50, extra = {}) => ({ uid: ++stackOf.u, id, n, q, ...extra });
stackOf.u = 0;
setItemApi({ attrsOf: (s) => s.attrs || ITEMS[s.id]?.attrs || {}, tagsOf: (s) => ITEMS[s.id]?.tags || [] });

// ---- slot matching with substitute materials (§12.1 step 4)
{
  const roof = BUILDINGS.lean_to.slots.find((s) => s.key === 'roof');
  check(roof.need.waterproof === 4 && roof.n === 8, 'lean_to roof slot: waterproof ≥ 4 × 8');
  check(slotMatches(roof, stackOf('palm_leaf')), 'palm leaf (waterproof 4) fills a roof slot');
  check(slotMatches(roof, stackOf('woven_mat')), 'woven mat substitutes');
  check(slotMatches(roof, stackOf('tarp')), 'tarp substitutes');
  check(slotMatches(roof, stackOf('bark')), 'bark substitutes');
  check(!slotMatches(roof, stackOf('banana_leaf')), 'banana leaf (waterproof 3) does not');
  check(!slotMatches(roof, stackOf('stone')), 'a stone does not');
  check(!slotMatches(roof, stackOf('palm_leaf', 0)), 'empty stack does not');
  const cord = BUILDINGS.lean_to.slots.find((s) => s.key === 'cord');
  check(slotMatches(cord, stackOf('vine')) && !slotMatches(cord, stackOf('grass')), 'cord slot fiber ≥ 3 / flex ≥ 3: vine yes, grass no');
  const pole = BUILDINGS.lean_to.slots.find((s) => s.key === 'pole');
  check(slotMatches(pole, stackOf('long_branch')) && !slotMatches(pole, stackOf('stick')), 'long pole slot needs long ≥ 6');
  const stoneSlot = BUILDINGS.fire_ring.slots[0];
  check(slotMatches(stoneSlot, stackOf('stone')) && !slotMatches(stoneSlot, stackOf('stick')), 'stone slot matches by tag');
  const bam = BUILDINGS.bamboo_hut.slots.find((s) => s.key === 'bamboo');
  check(slotMatches(bam, stackOf('bamboo')) && !slotMatches(bam, stackOf('stick')), 'ids-only slot accepts exactly its ids');
  check(slotMatches(BUILDINGS.grass_bed.slots[0], stackOf('grass')), 'grass fills the bedding slot (insul ≥ 3)');
  // per-instance attribute override (crafted items inherit)
  check(slotMatches(roof, stackOf('banana_leaf', 1, 50, { attrs: { waterproof: 6 } })), 'attrsOf honours per-stack attribute overrides');
}

// ---- rain-block formula (§12.1)
{
  const parts = (wp, n = 8) => [{ id: 'x', n, q: 50, wp }];
  check(near(rainBlock(0.75, parts(5)), 0.75), 'base 0.75, waterproof 5, Q 50 → 0.75');
  check(near(rainBlock(0.75, parts(4)), 0.71), 'palm leaves (4) → 0.75 − 0.04 = 0.71');
  check(near(rainBlock(0.75, parts(10)), 0.95), 'tarp (10) → 0.95');
  check(near(rainBlock(0.75, parts(5), 100), 0.85), 'Q 100 adds 0.10');
  check(near(rainBlock(0.75, parts(5), 0), 0.65), 'Q 0 subtracts 0.10');
  check(rainBlock(0.97, parts(10), 100) === 1, 'clamped to 1.0');
  check(near(rainBlock(0.75, [{ n: 4, wp: 4 }, { n: 4, wp: 10 }]), 0.75 + (7 - 5) * 0.04), 'mean of mixed roof materials');
  check(rainBlock(0.1, parts(0), 0) === 0, 'clamped to 0');
  check(near(rainBlock(0.9, parts(6), 70), 0.9 + 0.04 + 0.04), 'a-frame with good mats');
  check(leakFactor(0.8) === 1 && leakFactor(0.4) === 0.7 && leakFactor(0.2) === 0.4, 'leaks: <50% ×0.7, <25% ×0.4');
  check(near(avgQuality({ a: [{ n: 2, q: 40 }], b: [{ n: 2, q: 80 }] }), 60) && avgQuality({}) === 50, 'quality = n-weighted mean, default 50');
}

// ---- storm damage per hour by weakness (§12.4)
{
  check(near(stormDamagePerHour(15, 1.0), 6), 'wind 15, windbreak/lean-to (1.0): (15−10)×1.2 = 6 /h');
  check(near(stormDamagePerHour(15, 0.6), 3.6), 'a-frame (0.6): 3.6 /h');
  check(near(stormDamagePerHour(15, 0.4), 2.4), 'bamboo hut (0.4): 2.4 /h');
  check(near(stormDamagePerHour(15, 0.1), 0.6), 'log cabin (0.1): 0.6 /h');
  check(stormDamagePerHour(15, 0) === 0 && stormDamagePerHour(8, 1) === 0, 'cave 0; wind below 10 harmless');
  check(near(stormDamagePerHour(20, 1, true), 6), 'reinforced halves the damage');
  for (const [id, wk] of [['windbreak', 1], ['drying_rack', 1], ['lean_to', 1], ['a_frame', 0.6], ['bamboo_hut', 0.4], ['log_cabin', 0.1], ['cave_home', 0]]) check(BUILDINGS[id].weakness === wk, `${id} weakness ${wk}`);
  const lean = BUILDINGS.lean_to;
  check(near(damagePerHour(lean, { stormy: false, wind: 3, heavy: true }, { leaf: true }), 1 + 3 / 24), 'heavy rain −1/h on a leaf roof plus −3/day ageing');
  check(near(damagePerHour(lean, { stormy: false, wind: 3, heavy: false }, { leaf: true }), 3 / 24), 'leaf roof ageing −3 per day');
  check(near(damagePerHour(BUILDINGS.drying_rack, { stormy: false, wind: 0, heavy: false }, { leaf: false }), 1 / 24), 'cord ageing −1 per day');
  check(damagePerHour(BUILDINGS.campfire, { stormy: true, wind: 30, heavy: true }, {}) === 0, 'hp-less things are not damaged');
  check(near(workMultiplier({ axe: true }), 0.6) && near(workMultiplier({ hammer: true }), 0.85) && near(workMultiplier({ companion: true }), 0.6) && near(workMultiplier({ companion: 'gen' }), 0.45) && workMultiplier() === 1 && near(workMultiplier({ axe: true, hammer: true }), 0.51), 'work multipliers');
}

// ---- a fake game
function fakeGame({ trees = [], weather = {}, zone = 'grass', total = 0 } = {}) {
  const events = [];
  const inv = {
    stacks: [],
    get(uid) { return this.stacks.find((s) => s.uid === uid) || null; },
    find(id) { return this.stacks.find((s) => s.id === id) || null; },
    take(uid, n) {
      const s = this.get(uid); if (!s) return [];
      const k = Math.min(n, s.n); s.n -= k;
      const out = [{ ...s, n: k }];
      this.stacks = this.stacks.filter((t) => t.n > 0);
      return out;
    },
    add(id, n) { this.stacks.push(stackOf(id, n)); },
  };
  return {
    events, bus: { emit: (n, a) => events.push([n, a]), on() {} },
    clock: { total, hour: 12, tide: () => 0 },
    sys: { weather: { type: 'clear', rain: 0, windSpeed: 2, windDir: 0, ...weather }, player: { inv } },
    world: { nodes: { query: (x, z, r, f) => trees.filter((n) => Math.hypot(n.x - x, n.z - z) <= r && (!f || f(n))) }, terrain: { zoneAt: () => zone } },
    rng: { next: () => 0.99 },
  };
}
function boot(opts) { const g = fakeGame(opts); const b = new Building(); b.init(g); return [b, g]; }
function finished(b, id, x = 0, z = 0, rot = 0, parts = {}) {
  const s = b.createSite(id, { x, y: 1, z, rot });
  for (const sl of BUILDINGS[id].slots) s.delivered[sl.key] = [{ id: parts[sl.key] || 'x', n: sl.n, q: 50, wp: parts.wp ?? 5 }];
  b.complete(s);
  return s;
}

// ---- delivery, work, completion
{
  const [b, g] = boot();
  const s = b.createSite('lean_to', { x: 0, y: 1, z: 0, rot: 0 });
  const inv = g.sys.player.inv;
  inv.stacks.push(stackOf('palm_leaf', 12, 60), stackOf('stone', 3), stackOf('long_branch', 5, 70), stackOf('vine', 6, 40));
  const r = b.deliver(s, inv.stacks.map((t) => t.uid));
  check(r.rejected.length === 1 && inv.find('stone'), 'the stone is rejected and stays in the bag');
  check(deliveredFraction(s) === 1 && inv.find('palm_leaf').n === 4 && inv.find('vine').n === 2, 'delivery takes only what the slots need');
  check(b.isReady(s) && b.work(s, 10).done === false, 'ready; partial work does not finish');
  const w = b.work(s, 10, { axe: true });
  check(near(s.workFrac, 10 / 40 + 10 / 24) && s.stage === 'frame', 'axe makes later work worth 1/0.6');
  const r2 = b.work(s, 60, { companion: 'gen' });
  check(r2.done && s.stage === 'done', 'completes');
  check(s.hp > 0 && near(s.q, (8 * 60 + 5 * 70 + 4 * 40) / 17, 0.01), 'Q = mean quality of the delivered materials');
  check(near(s.rain, 0.75 + (4 - 5) * 0.04 + (s.q - 50) / 500, 1e-9), 'rain block from the formula with palm leaves');
  check(g.events.some((e) => e[0] === 'build:done' && e[1].id === 'lean_to'), 'build:done emitted');
  // deliver in several goes
  const s2 = b.createSite('windbreak', { x: 10, y: 1, z: 10, rot: 0 });
  inv.stacks.push(stackOf('long_branch', 2), stackOf('palm_leaf', 4));
  b.deliver(s2, [inv.find('long_branch').uid]);
  check(b.missing(s2).length === 3 && b.work(s2, 5).reason === 'materials', 'work needs every slot filled');
}

// ---- shelterAt inside / outside footprints
{
  const [b, g] = boot({ weather: { windDir: 0 } });
  const rot = 0;
  const a = finished(b, 'a_frame', 0, 0, rot, { wp: 4 });
  const inside = b.shelterAt(0.5, 0.5), outside = b.shelterAt(5, 0);
  check(inside.name === BUILDINGS.a_frame.name && near(inside.rain, a.rain) && inside.rain > 0.8 && inside.wind === 0.8 && inside.insul === 2.5, 'inside the a-frame: its rain / wind / insul');
  check(outside.rain === 0 && outside.wind === 0 && outside.site === null, 'outside: open air');
  check(b.shelterAt(1.2, 1.6).site === a && b.shelterAt(1.4, 0).site === null && b.shelterAt(0, 1.8).site === null, 'footprint edges (2.6 × 3.4)');
  check(inside.fireInside === false, 'no ground fire inside an a-frame');
  // rotation: a-frame turned 90°, so its long side lies along x
  const [b2] = boot();
  finished(b2, 'a_frame', 0, 0, Math.PI / 2);
  check(b2.shelterAt(1.6, 0).site && !b2.shelterAt(0, 1.6).site, 'footprint follows the rotation');
  check(insideFootprint({ id: 'a_frame', x: 0, z: 0, rot: 0 }, 1.29, 1.69) && !insideFootprint({ id: 'a_frame', x: 0, z: 0, rot: 0 }, 1.31, 0), 'insideFootprint');
  // leaking roof
  a.hp = a.def.hp * 0.4;
  check(near(b.shelterAt(0, 0).rain, a.rain * 0.7), 'hp < 50 %: rain block ×0.7');
  a.hp = a.def.hp * 0.2;
  check(near(b.shelterAt(0, 0).rain, a.rain * 0.4), 'hp < 25 %: ×0.4');
  // frames shelter nothing
  b.createSite('log_cabin', { x: 20, y: 1, z: 0, rot: 0 });
  check(b.shelterAt(20, 0).site === null, 'an unfinished frame gives no shelter');
  // the best of overlapping covers
  const [b3] = boot();
  finished(b3, 'lean_to', 0, 0, 0);
  finished(b3, 'tent', 0, 0, 0);
  check(b3.shelterAt(0, 0).name === 'テント', 'tent beats lean-to when both cover the point');
  // tent numbers (§21.2)
  const t = b3.shelterAt(0, 0);
  check(t.rain === 1 && t.wind === 0.85 && t.insul === 4, 'tent: rain 1.0, wind 0.85, +4 °C');
}

// ---- the lean-to only blocks wind from its back
{
  const [b, g] = boot({ weather: { windDir: 0 } });
  finished(b, 'lean_to', 0, 0, 0);                           // front = +z, back = −z
  g.sys.weather.windDir = 0;                                  // air moves toward +z: from the back
  check(near(b.shelterAt(0, 0).wind, 0.5), 'wind from behind: 0.5');
  g.sys.weather.windDir = Math.PI;                            // air moves toward −z: from the front
  check(near(b.shelterAt(0, 0).wind, 0.2), 'wind from the front: 0.2');
  g.sys.weather.windDir = Math.PI / 2;
  const side = b.shelterAt(0, 0).wind;
  check(side > 0.2 && side < 0.5, 'wind from the side: in between');
  check(near(leanToWind({ rot: Math.PI }, 0, 0.5), 0.2), 'leanToWind respects the rotation');
  // windbreak: only the lee side within 2.2 m
  const [b2, g2] = boot({ weather: { windDir: 0 } });
  const wb = finished(b2, 'windbreak', 0, 0, 0);
  check(b2.shelterAt(0, 1.2).wind === 0.6 && b2.shelterAt(0, -1.2).wind === 0 && b2.shelterAt(0, 3).wind === 0 && b2.shelterAt(4, 1.2).wind === 0, 'windbreak: 0.6 on the lee side only');
  check(windbreakCovers(wb, 0, 1, 0) && !windbreakCovers(wb, 0, 1, Math.PI / 2), 'not when the wind runs along the wall');
}

// ---- trees (§5.5)
{
  const trees = [{ kind: 'tree', x: 10, z: 10 }, { kind: 'palm', x: -10, z: 0 }, { kind: 'rock', x: 0, z: 10 }];
  const [b, g] = boot({ trees });
  let s = b.shelterAt(11, 10);
  check(s.name === '木の 下' && s.rain === 0.5 && s.wind === 0.3 && s.insul === 0, 'under a tree: rain 0.5, wind 0.3');
  g.sys.weather.type = 'storm';
  check(b.shelterAt(11, 10).rain === 0.3, 'storm: rain 0.3');
  g.sys.weather.type = 'clear'; g.sys.weather.rain = 0.7;
  check(b.shelterAt(-10, 1).rain === 0.3, 'heavy rain: 0.3');
  check(b.shelterAt(0, 10).rain === 0 && b.shelterAt(14, 10).rain === 0, 'not under a rock, nor 4 m from a trunk');
  const [bj] = boot({ trees, zone: 'jungle' });
  check(bj.shelterAt(10, 10).wind === 0.5, 'jungle: wind 0.5');
  // a hut beats a tree
  const [bh] = boot({ trees });
  finished(bh, 'a_frame', 10, 10, 0, { wp: 4 });
  check(bh.shelterAt(10, 10).name === BUILDINGS.a_frame.name, 'a hut under a tree: the hut');
}

// ---- beds (§4.6, §21.2)
{
  const [b] = boot();
  finished(b, 'grass_bed', 0, 0);
  finished(b, 'raised_bed', 10, 0);
  finished(b, 'hammock', 20, 0);
  finished(b, 'tent', 30, 0);
  finished(b, 'grass_bed', 30, 0);
  finished(b, 'bamboo_hut', 40, 0);
  check(near(b.bedAt(0, 0), 0.85) && near(b.bedAt(10, 0), 1.1) && near(b.bedAt(20, 0), 0.95), 'grass bed 0.85 · raised bed 1.1 · hammock 0.95');
  check(near(b.bedAt(30, 0), 1.05), 'grass bed inside the tent: 0.85 + 0.20 = 1.05');
  check(near(b.bedAt(40, 0), 0.65), 'bamboo hut: ground 0.55 + 0.1');
  check(b.bedAt(50, 50) === null, 'no bed structure → null');
  const [bt] = boot();
  finished(bt, 'tent', 0, 0);
  check(near(bt.bedAt(0, 0), 0.75), 'tent on bare ground: 0.55 + 0.20');
  // a worn bed after 7 days
  const [bw, gw] = boot();
  finished(bw, 'grass_bed', 0, 0);
  gw.clock.total = 8 * 1440;
  check(near(bw.bedAt(0, 0), 0.7), 'grass bed worn after 7 days: 0.7');
}

// ---- update(): storm damage, ageing, collapse, rain collection, storm-surge washing
{
  const [b, g] = boot({ weather: { type: 'storm', rain: 1, windSpeed: 15 } });
  const lean = finished(b, 'lean_to', 0, 0, 0, { wp: 5 });
  lean.y = 5;                                                  // above the surge
  const cabin = finished(b, 'log_cabin', 20, 0, 0, { wp: 5 });
  cabin.y = 5;
  const h0 = lean.hp, c0 = cabin.hp;
  b.update(0.1, 60, g);                                        // one game hour
  const ld = h0 - lean.hp, cd = c0 - cabin.hp;
  check(near(ld, 6 + 1 + 3 / 24, 1e-6), `lean-to loses 6 (storm) + 1 (heavy rain) + 0.125 (age) in an hour (got ${ld.toFixed(3)})`);
  check(near(cd, 0.6 + 1 + 3 / 24, 1e-6), `log cabin loses ${cd.toFixed(3)} (weakness 0.1)`);
  // reinforce halves the storm part
  const lean2 = finished(b, 'lean_to', 40, 0, 0, { wp: 5 });
  lean2.y = 5; lean2.reinforced = true;
  const h2 = lean2.hp; b.update(0.1, 60, g);
  check(near(h2 - lean2.hp, 3 + 1 + 3 / 24, 1e-6), 'reinforced: storm part ×0.5');
  // collapse → ruin, repair stands it up again
  lean.hp = 2;
  b.update(0.1, 60, g);
  check(lean.stage === 'ruin' && g.events.some((e) => e[0] === 'build:ruin'), 'hp below 0 → ruin');
  check(!b.shelterAt(0, 0).site, 'a ruin gives no shelter');
  g.sys.weather = { type: 'clear', rain: 0, windSpeed: 2, windDir: 0 };
  const inv = g.sys.player.inv;
  inv.stacks.push(stackOf('palm_leaf', 5));
  b.repair(lean, inv.find('palm_leaf').uid);
  check(near(lean.hp, 80 * 0.15) && lean.stage === 'ruin', 'one repair: +15 % of max hp, still a ruin');
  b.repair(lean, inv.find('palm_leaf').uid);
  check(lean.stage === 'done' && near(lean.hp, 80 * 0.3), 'two repairs: stands again');
  check(!b.repair(lean, 999), 'repair with nothing');
  // reinforce takes cord and stones
  inv.stacks.length = 0;
  inv.stacks.push(stackOf('vine', 4), stackOf('stone', 6));
  const rr = b.reinforce(lean);
  check(rr.ok && lean.reinforced && !inv.find('vine') && !inv.find('stone'), 'reinforce uses cord ×4 and stones ×6');
  check(!b.reinforce(lean).ok, 'only once');
  // the storm is over: reinforcement wears off
  b.update(0.1, 1, g);
  check(!lean.reinforced, 'reinforcement lasts one storm');
}
{
  // clear skies: ageing only
  const [b, g] = boot({ weather: { type: 'clear', windSpeed: 3 } });
  const a = finished(b, 'a_frame', 0, 0, 0);
  const h = a.hp; b.update(0.1, 24 * 60, g);
  check(near(h - a.hp, 3, 1e-6), 'one calm day: leaf roof −3');
  const r = finished(b, 'drying_rack', 10, 0, 0); r.leaf = false;
  const hr = r.hp; b.update(0.1, 24 * 60, g);
  check(near(hr - r.hp, 1, 1e-6), 'one calm day: cord −1');
  // rain catcher fills
  const [b2, g2] = boot({ weather: { type: 'rain', rain: 0.8, windSpeed: 3 } });
  const rc = finished(b2, 'rain_catcher', 0, 0, 0);
  b2.update(0.1, 120, g2);
  check(near(rc.water, 1.6), 'rain catcher: heavy rain 0.8 L/h × 2 h');
  g2.sys.weather = { type: 'drizzle', rain: 0.2, windSpeed: 1 };
  b2.update(0.1, 60, g2);
  check(near(rc.water, 1.8) && near(b2.takeWater(rc, 1), 1) && near(rc.water, 0.8), 'drizzle 0.2 L/h; takeWater');
  b2.update(0.1, 60 * 100, g2);
  check(near(rc.water, 4), 'capacity 4 L');
  // storm surge washes low sites 50 %
  const [b3, g3] = boot({ weather: { type: 'storm', rain: 1, windSpeed: 12 } });
  g3.clock.tide = () => 0.5;
  const low = finished(b3, 'windbreak', 0, 0, 0); low.y = 0.5;
  const sos = finished(b3, 'sos_sign', 10, 0, 0); sos.y = 1.2;
  g3.rng.next = () => 0.1;
  b3.update(0.1, 1, g3);
  check(!b3.sites.includes(low) && g3.events.some((e) => e[0] === 'build:washed' && e[1].id === 'windbreak' && e[1].items.length), 'surge washes a low windbreak away, half the materials scatter');
  check(sos.stage === 'done' && near(sos.hp, 87.5 - 30 - 1 / 24 * 0, 0.1), `SOS stones: storm −30 (hp ${sos.hp})`);
  const [b4, g4] = boot({ weather: { type: 'storm', rain: 1, windSpeed: 12 } });
  g4.clock.tide = () => 0.5; g4.rng.next = () => 0.9;
  const low4 = finished(b4, 'windbreak', 0, 0, 0); low4.y = 0.5;
  b4.update(0.1, 1, g4);
  check(b4.sites.includes(low4), '… and survives on the other 50 %');
}

// ---- save / load
{
  const [b, g] = boot();
  const s = finished(b, 'a_frame', 3, 4, 1.2, { wp: 4 });
  s.hp = 77; s.water = 0;
  b.createSite('lean_to', { x: 9, y: 0, z: 9, rot: 0 });
  const d = JSON.parse(JSON.stringify(b.serialize()));
  const [b2] = boot();
  b2.deserialize(d);
  check(b2.sites.length === 2 && b2.sites[0].stage === 'done' && b2.sites[0].hp === 77 && b2.sites[0].def === BUILDINGS.a_frame && near(b2.sites[0].rot, 1.2) && b2.sites[1].stage === 'frame', 'serialize → deserialize keeps sites');
  check(b2.shelterAt(3, 4).site === b2.sites[0], 'shelter works after load');
}

// ---- the build menu
{
  const [b] = boot();
  const defs = b.defs();
  const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
  const P0 = ['campfire', 'fire_ring', 'signal_fire', 'sos_sign', 'windbreak', 'lean_to', 'a_frame', 'grass_bed', 'drying_rack', 'rain_catcher', 'tent'];
  check(P0.every((id) => byId[id]?.p === 'P0'), 'P0 set as in §18.1');
  check(defs.filter((d) => d.p === 'P0').length === P0.length, 'nothing else is P0');
  check(['clay_oven', 'signal_fire', 'sos_sign', 'windbreak', 'lean_to', 'a_frame', 'bamboo_hut', 'log_cabin', 'cave_home', 'tree_house', 'grass_bed', 'hammock', 'raised_bed', 'drying_rack', 'smoker', 'larder', 'cool_pit', 'wood_shed', 'rain_tank', 'workbench', 'fence', 'pit_trap', 'fish_weir', 'lookout', 'garden', 'latrine', 'raft', 'memorial', 'calendar_post'].every((id) => byId[id]), 'every §12.2 row is present');
  check(byId.lean_to.slotsText.some((t) => t.includes('屋根材 ×8') && t.includes('防水4以上')), `readable slot text (${byId.lean_to.slotsText.join(' / ')})`);
  check(byId.tent.minutes === 10 && byId.tent.item === 'tent' && byId.tent.effects.sleepAdd === 0.2, 'tent: 10 min, from the inventory item');
  check(defs.every((d) => d.name && d.icon && d.size?.length === 2 && d.effectText !== undefined), 'every def has name, icon, size');
  check(byId.lean_to.minutes === 40 && byId.a_frame.minutes === 100 && byId.log_cabin.minutes === 720 && byId.bamboo_hut.hp === 260, 'times and hp from §12.2');
}

console.log(failed ? `\n${failed} FAILED` : '\nall building tests passed');
process.exit(failed ? 1 : 0);
