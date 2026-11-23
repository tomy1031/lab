// tests/sim.mjs — the survival formulas checked against the worked examples in docs/DESIGN.md.
//   node tests/sim.mjs
import { feltTemp, targetBodyTemp, eatRisk, drinkRisk, coldChance, fireWarmth, Body } from '../js/sim/body.js';
import { RNG } from '../js/core/rng.js';
import { DIFFICULTY } from '../js/data/conditions.js';

let failed = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) failed++; };

// §5.6 example: storm night, Tair 15, wind 15, soaked, no wind block, wet clothes +0.3
{
  const tf = feltTemp({ Tair: 15, sun: 0, windSpeed: 15, windBlock: 0, wet: 100, fire: 0, clothes: 0.3 });
  check(near(tf, -5.7, 0.05), `storm night felt temperature −5.7 (got ${tf.toFixed(2)})`);
  const tt = targetBodyTemp(tf);
  check(near(tt, 31.1, 0.05), `target body temperature 31.1 (got ${tt.toFixed(2)})`);
  // 1 h at 0.35/h toward target from 36.8
  let bt = 36.8; const step = (t) => t + (tt - t) * 0.35;
  bt = step(bt);
  check(near(bt, 34.8, 0.05), `after 1 h ≈ 34.8 (got ${bt.toFixed(2)})`);
  // the body integrates in small steps to the same hourly result
  const b0 = new Body({ rng: new RNG(1), diff: DIFFICULTY.normal }); b0.s.wet = 100;
  for (let i = 0; i < 20; i++) b0.update({ dtH: 0.05, dtReal: 3, Tair: 15, sun: 0, windSpeed: 15, rainWet: 90, dry: 0, clothes: 0.3 });
  check(near(b0.s.bodyTemp, 34.8, 0.1), `Body after 1 h in the storm ≈ 34.8 (got ${b0.s.bodyTemp.toFixed(2)})`);
  // same night in a lean-to: rain block 0.8, wind block 0.5, insulation +1, fire 2 m (mid +10), dry clothes +1
  const tf2 = feltTemp({ Tair: 15, sun: 0, windSpeed: 15, windBlock: 0.5, wet: 0, fire: 10, clothes: 1.0, shelterInsul: 1.0 });
  check(near(tf2, 22.5, 0.05), `lean-to + fire felt 22.5 (got ${tf2.toFixed(2)})`);
  check(targetBodyTemp(tf2) === 36.8, 'comfortable → 36.8');
}
// fire warmth table
check(fireWarmth(1, 'mid') === 10 && fireWarmth(3, 'big') === 9 && fireWarmth(5, 'small') === 1 && fireWarmth(7, 'big') === 0, 'fire warmth by distance and size');

// §7.4 examples (normal difficulty, hygiene 60)
const fish = { B: 0.12, parasite: 0.03 };
const ctx = { hygiene: 60, D: 1 };
const pr = (f) => eatRisk({ ...fish, ...f }, ctx).p;
check(near(pr({ fresh: 100, done: 0 }), 0.12, 1e-9), 'fresh fish raw 12%');
check(near(pr({ fresh: 100, done: 50 }), 0.054, 1e-9), 'fresh fish half-cooked 5.4%');
check(near(pr({ fresh: 100, done: 80 }), 0.0096, 1e-9), 'fresh fish well cooked ≈1%');
check(near(pr({ fresh: 30, done: 0 }), 0.48, 1e-9), 'going-off fish raw 48%');
check(near(pr({ fresh: 30, done: 80 }), 0.0384, 1e-9), 'going-off fish cooked 3.8%');
check(near(pr({ fresh: 5, done: 80 }), 0.35 * Math.sqrt(0.08), 1e-9), 'rotten fish cooked ≈10%');
check(near(eatRisk({ B: 0.35, parasite: 0.3, fresh: 100, done: 0 }, { hygiene: 20, D: 1 }).p, 0.455, 1e-9), 'raw boar at hygiene 20: 45.5%');
check(near(eatRisk({ B: 0.35, parasite: 0.3, fresh: 100, done: 0 }, { hygiene: 20 }).pParasite, 0.3, 1e-9), 'raw boar parasite 30%');
check(near(pr({ fresh: 100, done: 0, stew: true }), 0.006, 1e-9), 'fish stew 0.6%');
// §7.6 water
check(near(1 - Math.pow(1 - drinkRisk(0.18), 5), 0.63, 0.01), '5 cups of downstream water ≈63%');
check(near(1 - Math.pow(1 - drinkRisk(0.18, 0.03), 5), 0.027, 0.002), 'boiled ≈2.7%');
// §5.7 cold
check(near(1 - Math.pow(1 - coldChance({ bodyTemp: 36.8, wet: 0, rest: 80, food: 70, morale: 70 }), 24), 0.09, 0.005), 'comfortable day ≈9% cold');
check(near(1 - Math.pow(1 - coldChance({ bodyTemp: 35.5, wet: 80, rest: 80, food: 70, morale: 70 }), 8), 0.18, 0.01), 'wet & cold night ≈18%');

// a body standing still with nothing: water 70 → 0 in about 15.5 h (4.5/h), dies ~20 h later
{
  const b = new Body({ rng: new RNG(3), diff: DIFFICULTY.normal });
  let h = 0, dry = null, dead = null;
  while (h < 80 && dead === null) {
    b.update({ dtH: 0.1, dtReal: 6, Tair: 26, sun: 0, shade: true, windSpeed: 2, dry: 10, clothes: 1 });
    h += 0.1;
    if (dry === null && b.s.water <= 0) dry = h;
    if (b.s.hp <= 0) dead = h;
  }
  check(dry !== null && near(dry, 70 / 4.5, 0.6), `water runs out after ≈15.6 h (got ${dry?.toFixed(1)})`);
  check(dead !== null && dead - dry > 12 && dead - dry < 24, `then death within ~20 h (got ${(dead - dry).toFixed(1)} h)`);
}
// a cold, soaked night without shelter lowers the temperature into hypothermia
{
  const b = new Body({ rng: new RNG(5), diff: DIFFICULTY.normal });
  b.s.wet = 100;
  for (let i = 0; i < 30; i++) b.update({ dtH: 0.1, dtReal: 6, Tair: 15, sun: 0, windSpeed: 15, rainWet: 90, dry: 0, clothes: 0.3 });
  check(b.s.bodyTemp < 34.9 && b.hasAny('hypothermia'), `3 h in a storm night → hypothermia (bt ${b.s.bodyTemp.toFixed(2)})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall sim checks passed');
process.exit(failed ? 1 : 0);
