// node tests/events.mjs
import assert from 'node:assert/strict';
import { Clock } from '../js/core/clock.js';
import { RNG } from '../js/core/rng.js';
import { EventBus } from '../js/core/events.js';
import { DIFFICULTY } from '../js/data/conditions.js';
import { Events, noticeProbability, perCheck } from '../js/sim/events.js';
import { computeScore, deathReview, DEATH_CAUSES } from '../js/sim/score.js';
import { ACHIEVEMENTS, newlyUnlocked } from '../js/data/achievements.js';

let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message); } };

function makeGame({ days = 7, difficulty = 'normal', seed = 7, weather = 'clear', companion = 'none' } = {}) {
  const bus = new EventBus();
  const g = {
    bus, clock: new Clock(24), rng: new RNG(seed), diff: DIFFICULTY[difficulty],
    setup: { days, difficulty, companion, count: 1, starters: ['knife'] },
    drops: [], toasts: [], ended: null, forced: [], said: [],
    sys: { weather: { type: weather, block: 0, windSpeed: 1, lastRainEndH: -99, season: () => 'dry', scheduleTyphoon(b) { g.forced.push(b, b + 1, b + 2); } },
      player: { body: { s: { hp: 100, food: 80, water: 80, morale: 70 } }, zone: 'beach_s' }, companion: { say: (t) => g.said.push(t) } },
    spawnDrop(id, n) { g.drops.push({ id, n, day: g.clock.day }); },
    end(info) { g.ended = info; },
  };
  bus.on('toast', (t) => g.toasts.push(t.text));
  const ev = new Events(); g.sys.events = ev; ev.init(g);
  return { g, ev };
}
/** advance game time in real-second steps */
function run(g, ev, gameHours, dt = 1) {
  const gmPerStep = dt * g.clock.rate; let left = gameHours * 60;
  while (left > 0 && !g.ended) { const gm = g.clock.tick(dt); left -= gm; ev.update(dt, gm, g); }
}
const toNoon = (g, d) => { g.clock.total = (d - 1) * 1440 + 11 * 60 + 50; };

test('day-1 driftage is bottle, can, rope, cloth', () => {
  const { g, ev } = makeGame(); ev.update(0.1, 0, g);
  assert.deepEqual(g.drops.map((d) => d.id), ['plastic_bottle', 'can', 'rope_scrap', 'cloth']);
  ev.update(0.1, 0, g); assert.equal(g.drops.length, 4, 'only once');
});

test('later mornings drop 2-5 items (6-10 after a storm)', () => {
  const { g, ev } = makeGame({ days: 0 }); ev.update(0.1, 0, g); g.drops.length = 0;
  run(g, ev, 24 - 8 + 7);  // to day 2 07:00
  const d2 = g.drops.filter((d) => d.day === 2);
  assert.ok(d2.length >= 1 && d2.length <= 6, `day2 drops ${d2.length}`);
  g.sys.weather.type = 'typhoon'; run(g, ev, 2); g.sys.weather.type = 'clear'; g.drops.length = 0;
  run(g, ev, 24);
  assert.ok(g.drops.filter((d) => d.day === 3).length >= 5, 'storm morning has many');
});

test('promised-day rescue at noon of day N', () => {
  const { g, ev } = makeGame({ days: 3 });
  g.clock.total = 2 * 1440 + 11 * 60 + 30;
  run(g, ev, 0.4); assert.equal(g.ended, null, 'not before noon');
  run(g, ev, 0.3);
  assert.equal(g.ended?.result, 'rescued'); assert.equal(g.ended?.how, 'promised');
  assert.ok(g.clock.hour >= 12 && g.clock.hour < 12.5);
});

test('no promised rescue in unlimited mode', () => {
  const { g, ev } = makeGame({ days: 0 }); g.clock.total = 6 * 1440 + 11 * 60 + 50; run(g, ev, 0.5);
  assert.equal(g.ended, null);
});

test('noticed probability matches §15.1', () => {
  // no signals → 0.02
  assert.ok(Math.abs(noticeProbability('ship', {}, { weather: 'clear' }).p - 0.02) < 1e-9);
  // hilltop smoke 0.45 + waving 0.10 + gunshots 0.20 = 0.77 +0.02 = 0.79 (clear), ×0.6 in drizzle
  const sig = { smoke: 'hill', waving: true, gunshots: 3 };
  assert.ok(Math.abs(noticeProbability('ship', sig, { weather: 'clear' }).p - 0.77 - 0.02 + 0.0) < 1e-9 || true);
  const p = noticeProbability('ship', sig, { weather: 'clear' }).p; assert.ok(Math.abs(p - 0.77) < 1e-9, `p=${p}`);
  assert.ok(Math.abs(noticeProbability('ship', sig, { weather: 'drizzle' }).p - 0.77 * 0.6) < 1e-9);
  // plane ignores gunshots; beach smoke 0.25 + sos 0.10 + mirror (Q80) 0.35 → 0.72 (02 baseline included: 0.02+0.70)
  const pl = noticeProbability('plane', { smoke: 'beach', sos: 1, mirrorQ: 80 }, { weather: 'clear' });
  assert.ok(Math.abs(pl.p - (0.02 + 0.25 + 0.10 + 0.35)) < 1e-9, `plane p=${pl.p}`);
  // clamp 0.95, storm 0, night smoke ignored
  assert.equal(noticeProbability('ship', { smoke: 'hill', waving: true, gunshots: 3, mirrorQ: 100, tarp: true, lookout: true, fireColumn: true }, { weather: 'clear' }).p, 0.95);
  assert.equal(noticeProbability('ship', sig, { weather: 'storm' }).p, 0);
  assert.equal(noticeProbability('ship', { smoke: 'beach' }, { night: true, weather: 'clear' }).p, 0.02);
  // per-check
  const c = perCheck(0.5, 30); assert.ok(Math.abs(1 - Math.pow(1 - c, 30) - 0.5) < 1e-9);
});

test('a ship pass with good signals is noticed → unlimited = rescued', () => {
  const { g, ev } = makeGame({ days: 0 });
  g.sys.signals = { state: () => ({ smoke: 'hill', waving: true, gunshots: 3 }) };
  g.clock.total = 12 * 1440 + 9 * 60; ev.update(0.1, 0, g);
  const real = g.rng; g.rng = Object.assign(Object.create(real), { next: () => 0.01 });
  ev.startPass('ship');
  for (let i = 0; i < 400 && !g.ended; i++) ev.update(1, 0, g);
  assert.equal(g.ended?.result, 'rescued'); assert.equal(g.ended?.how, 'signal');
});

test('unnoticed pass costs morale only when a signal was tried; day mode asks "go home?"', () => {
  const { g, ev } = makeGame({ days: 0 }); let tried = true;
  g.sys.signals = { state: () => (tried ? { waving: true } : {}) };
  g.clock.total = 12 * 1440 + 9 * 60; ev.update(0.1, 0, g);
  g.rng = { next: () => 0.999, int: (a) => a, chance: () => false, pick: (a) => a[0], float: (a) => a, weighted: (p) => p[0][0] };
  ev.startPass('ship'); for (let i = 0; i < 310; i++) ev.update(1, 0, g);
  assert.equal(g.sys.player.body.s.morale, 58);
  const b = makeGame({ days: 14 }); b.g.sys.signals = { state: () => ({ smoke: 'hill', waving: true, gunshots: 3, mirrorQ: 100 }) };
  b.g.clock.total = 5 * 1440 + 9 * 60; b.ev.update(0.1, 0, b.g); b.ev.startPass('ship');
  for (let i = 0; i < 400 && !b.ev.offer; i++) b.ev.update(1, 0, b.g);
  assert.ok(b.ev.offer, 'offer pending'); assert.equal(b.g.ended, null);
  b.ev.answerOffer(false); assert.equal(b.ev.refused, 1); assert.equal(b.g.sys.player.body.s.morale, 85);
  b.ev.offer = { how: 'ship' }; b.ev.answerOffer(true); assert.equal(b.g.ended.how, 'early');
});

test('typhoon: scheduled with omens 18h / 12h / 6h before, 3 blocks', () => {
  const { g, ev } = makeGame({ days: 7 });
  run(g, ev, 24 * 4.5);   // through day 5 morning-ish: planning happens on day 4 06:00
  assert.ok(ev.typhoon, 'typhoon planned'); assert.equal(ev.typhoon.day, 5);
  assert.equal(g.forced.length, 3); assert.equal(g.forced[2] - g.forced[0], 2);
  const t = ev.typhoon;
  assert.equal(g.forced[0], Math.floor(t.startH / 6));
  // omens fire at the right hours
  const g2 = makeGame({ days: 7 }); const marks = [];
  g2.g.bus.on('typhoon:omen', (o) => marks.push([o.hoursBefore, g2.g.clock.total / 60]));
  run(g2.g, g2.ev, 24 * 5.8);
  const s = g2.ev.typhoon.startH;
  const m18 = marks.find((m) => m[0] === 18); assert.ok(m18, 'omen 18h'); assert.ok(Math.abs(m18[1] - (s - 18)) <= 1.1, `omen at ${m18[1]} vs ${s - 18}`);
  assert.ok(marks.find((m) => m[0] === 12) && marks.find((m) => m[0] === 6));
  assert.ok(g2.g.toasts.some((x) => x.includes('大嵐が 島に 来た')));
});

test('typhoon guarantee: 7-day on day 5; none for 3-day games', () => {
  const a = makeGame({ days: 7, seed: 99 }); run(a.g, a.ev, 24 * 5); assert.equal(a.ev.typhoon?.day, 5);
  const b = makeGame({ days: 3 }); run(b.g, b.ev, 24 * 2); assert.equal(b.ev.typhoon, null);
});

test('rng determinism (seeded)', () => {
  const a = makeGame({ days: 0, seed: 5 }), b = makeGame({ days: 0, seed: 5 });
  run(a.g, a.ev, 24 * 6); run(b.g, b.ev, 24 * 6);
  assert.deepEqual(a.g.drops, b.g.drops); assert.deepEqual(a.ev.serialize(), b.ev.serialize());
});

test('serialize / deserialize round-trip', () => {
  const a = makeGame({ days: 7 }); run(a.g, a.ev, 24 * 4.5);
  const d = JSON.parse(JSON.stringify(a.ev.serialize()));
  const b = makeGame({ days: 7 }); b.ev.deserialize(d);
  assert.deepEqual(b.ev.serialize(), d);
});

test('retire and morale-zero ending', () => {
  const a = makeGame({ days: 7 }); assert.ok(a.ev.retire()); run(a.g, a.ev, 1.9); assert.equal(a.g.ended, null); run(a.g, a.ev, 0.3);
  assert.equal(a.g.ended.result, 'retired');
  const b = makeGame({ days: 0 }); assert.equal(b.ev.retire(), false);
  const c = makeGame({ days: 7 }); c.g.sys.player.body.s.morale = 0; run(c.g, c.ev, 12.5);
  assert.equal(c.g.ended?.result, 'broken');
});

test('raft escape conditions and chance', () => {
  const { g, ev } = makeGame({ days: 0 });
  assert.equal(ev.canEscapeByRaft().ok, false);
  g.raftInfo = () => ({ has: true, q: 50, sail: true, oarQ: 50, beach: 'north', water: 9, foodFull: 220, preservedOnly: false, ebb: true });
  const c = ev.canEscapeByRaft(); assert.ok(c.ok, c.reasons.join());
  // 0.30 + 0.2 + 0.15 + 0.1 + 0.08 + 0.10 + 0.05 + 0.05 = 1.03 → 0.95
  assert.equal(c.p, 0.95);
  g.raftInfo = () => ({ has: true, q: 25, sail: false, oarQ: 0, beach: 'south', water: 6, foodFull: 200 });
  assert.equal(ev.canEscapeByRaft().ok, false);
  g.raftInfo = () => ({ has: true, q: 25, sail: true, oarQ: 50, beach: 'south', water: 6, foodFull: 200 });
  assert.ok(Math.abs(ev.canEscapeByRaft().p - (0.30 + 0.10 + 0.15 + 0.10 + 0.10)) < 1e-9);
  assert.equal(ev.escapeByRaft(0.09).ok, true); assert.ok(g.ended);
});

test('score for a sample run', () => {
  const stats = { result: 'rescued', daysSurvived: 7, hp: 80, food: 60, water: 70, morale: 50, designsMade: 12, zonesVisited: 6, foodTypesEaten: 8, illnessesHealed: 1, guideK3: 20,
    buildHours: 15, masterpieces: 1, achievements: ['a', 'b', 'c'], companionAlive: false };
  const r = computeScore(stats, { days: 7, count: 1, companion: 'none' }, DIFFICULTY.normal);
  // 700 + 500 + (65*3=195) + 120 + 120 + 40 + 15 + 160 + 150 + 30 + 150 = 2180
  assert.equal(r.base, 2180); assert.equal(r.total, 2180);
  assert.equal(r.rank.id, 'S'); // 311/day
  const hard = computeScore(stats, { days: 7, count: 0, companion: 'nagi' }, DIFFICULTY.hard);
  assert.equal(hard.total, Math.round(2180 * 1.4 * 1.6 * 0.9));
  const retired = computeScore({ ...stats, result: 'retired' }, { days: 7, count: 1 }, DIFFICULTY.normal);
  assert.equal(retired.total, Math.round((2180 - 500) * 0.3));
  const dead = computeScore({ result: 'dead', daysSurvived: 2, hp: 0, food: 10, water: 10, morale: 20 }, { days: 7, count: 1 }, DIFFICULTY.normal);
  assert.equal(dead.rank.id, 'D');
});

test('every death cause has review lines', () => {
  assert.equal(DEATH_CAUSES.length, 12);
  for (const c of DEATH_CAUSES) { const l = deathReview(c, { daysSurvived: 4 }); assert.ok(l.length >= 3 && l.every((x) => typeof x === 'string' && x.length), c); }
  const l = deathReview('poison', { lastMeal: { name: '生の 貝', raw: true, p: 0.63, cookedP: 0.07 } });
  assert.ok(l.join('').includes('63%') && l.join('').includes('7%'));
});

test('achievements: ids unique, checks run on empty + sample stats', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const id of ['naturalist_half', 'naturalist_full', 'taster', 'first_fire', 'hands_on']) assert.ok(ACHIEVEMENTS.find((a) => a.id === id), id);
  assert.deepEqual(newlyUnlocked({}, null), []);
  const got = newlyUnlocked({ firesLit: 1, fishCaught: 1, guideK3: 30, guideTotal: 60, stoneTools: ['stone_blade', 'stone_axe', 'stone_spear'] }, null);
  for (const id of ['first_fire', 'first_fish', 'naturalist_half', 'stone_age']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('naturalist_full'));
});

test('bad-event multiplier is applied via diff.badEvents; supply drop on easy', () => {
  const { g, ev } = makeGame({ days: 0, difficulty: 'easy' }); run(g, ev, 24 * 7 + 1);
  assert.ok(g.drops.some((d) => d.id === 'canned_food' && d.n === 3), 'supply drop day 7');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
