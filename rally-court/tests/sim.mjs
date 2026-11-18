// tests/sim.mjs — whole sessions without a browser: the demo bot (your half) against the CPU.
// A best-of-one match must finish with a legal score; rallies must have realistic length and pace;
// every mode must run without errors.   node tests/sim.mjs
import { Sim } from '../js/sim.js';
import { defaults } from '../js/config.js';

let fails = 0, passes = 0;
const check = (cond, msg) => { if (cond) { passes++; console.log('ok  ', msg); } else { fails++; console.log('FAIL', msg); } };

function run(mode, over = {}, seconds = 600, seed = 7) {
  const set = { ...defaults(), ...over };
  const sim = new Sim({ get: (k) => set[k], seed, bot: true });
  sim.start(mode);
  const counts = { hit: 0, bounce: 0, point: 0, fault: 0, let: 0, net: 0, whiff: 0 };
  const rallies = []; const speeds = []; const reasons = {};
  let shotsInPoint = 0;
  const dt = 1 / 72;
  for (let t = 0; t < seconds && sim.phase !== 'over'; t += dt) {
    sim.update(dt);
    for (const e of sim.events) {
      if (e.type in counts) counts[e.type]++;
      if (e.type === 'hit') { shotsInPoint++; if (e.kind !== 'serve' && e.kind !== 'kick') speeds.push(e.kmh); }
      if (e.type === 'result' && e.res.type === 'fault') counts.fault++;
      if (e.type === 'result' && e.res.type === 'let') counts.let++;
      if (e.type === 'point') { rallies.push(shotsInPoint); shotsInPoint = 0; reasons[e.reason] = (reasons[e.reason] || 0) + 1; }
    }
    sim.events.length = 0;
  }
  return { sim, counts, rallies, speeds, reasons };
}

{
  const r = run('match', { level: 3, games: 6, sets: 1 }, 3600);
  const s = r.sim.score;
  console.log('match', JSON.stringify(s.sets), 'points', r.rallies.length, 'reasons', JSON.stringify(r.reasons), 'faults', r.counts.fault, 'lets', r.counts.let, 'whiffs', r.counts.whiff);
  const avg = r.rallies.reduce((a, b) => a + b, 0) / Math.max(1, r.rallies.length);
  const avgKmh = r.speeds.reduce((a, b) => a + b, 0) / Math.max(1, r.speeds.length);
  console.log(`  average shots per point ${avg.toFixed(2)}, groundstroke pace ${avgKmh.toFixed(0)} km/h`);
  check(s.over, 'a one-set match (bot vs level 3) finishes');
  const set = s.sets[0];
  check(set && ((Math.max(set.p, set.c) === 6 && Math.abs(set.p - set.c) >= 2) || (Math.max(set.p, set.c) === 7)), `legal set score ${set && set.p}-${set && set.c}`);
  check(avg > 2.2 && avg < 12, 'realistic rally length (2.2–12 shots per point)');
  check(avgKmh > 70 && avgKmh < 140, 'realistic groundstroke pace (70–140 km/h)');
  check(r.reasons.ace !== undefined || r.reasons.winner !== undefined, 'winners happen');
  check(r.reasons.out !== undefined || r.reasons.net !== undefined, 'errors happen');
}
for (const mode of ['rally', 'machine', 'serve']) {
  const r = run(mode, {}, 120);
  check(r.counts.hit > 10, `${mode}: balls are hit (${r.counts.hit})`);
}
{
  const r = run('rally', { level: 2 }, 300, 3);
  const avgRally = r.sim.stats.bestRally;
  check(r.counts.hit > 40, `rally practice keeps going (${r.counts.hit} hits in 5 min)`);
}
for (const surface of ['clay', 'grass']) {
  const r = run('match', { surface, games: 4 }, 2400, 11);
  check(r.sim.score.over, `${surface}: a short-set match finishes`);
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
