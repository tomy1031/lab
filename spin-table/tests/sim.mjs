// tests/sim.mjs — CPU against CPU without drawing: whole matches at each level. Checks that the score is
// right, that rallies happen and end in realistic ways, and that ball speeds and spins are those of the sport.
//   node tests/sim.mjs [level] [seed]
import { Sim } from '../js/sim.js';

const fail = [];
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail.push(m); };

function playMatch(level, seed, bestOf = 3, verbose = false) {
  const sim = new Sim({ mode: 'demo', level, autoP: true, autoLevel: level, seed, bestOf, firstServer: 'p', serveRule: 'strict' });
  sim.start();
  const st = { points: 0, rallies: [], reasons: {}, speeds: [], spins: [], lets: 0, hitsByShot: {}, misses: 0, why: {} };
  let t = 0;
  const dt = 1 / 72;
  while (sim.phase !== 'done' && t < 3600) {
    sim.update(dt); t += dt;
    for (const e of sim.takeEvents()) {
      if (e.type === 'hit') { st.speeds.push(e.speed); st.spins.push(e.total); const k = e.shot || '?'; st.hitsByShot[k] = (st.hitsByShot[k] || 0) + 1; }
      if (e.type === 'whiff') st.misses++;
      if (e.type === 'point') {
        if (e.let) st.lets++; else { st.points++; st.rallies.push(e.hits); st.reasons[e.reason] = (st.reasons[e.reason] || 0) + 1; }
        if (verbose) console.log(`  ${e.let ? 'LET' : e.winner} ${e.reason} (${e.hits} hits)`);
      }
    }
    for (const k of ['c', 'p']) { const w = sim.bots[k].lastWhy; if (w) { st.why[w] = (st.why[w] || 0) + 1; sim.bots[k].lastWhy = null; } }
  }
  return { sim, st, t };
}

const levels = process.argv[2] ? [Number(process.argv[2])] : [1, 3, 5];
for (const level of levels) {
  const t0 = performance.now();
  const { sim, st, t } = playMatch(level, Number(process.argv[3]) || 7 + level, 3, !!process.argv[2]);
  const avg = st.rallies.reduce((a, b) => a + b, 0) / Math.max(1, st.rallies.length);
  const sp = st.speeds.sort((a, b) => a - b), med = sp[Math.floor(sp.length / 2)] * 3.6, max = sp[sp.length - 1] * 3.6;
  const spins = st.spins.sort((a, b) => a - b), smed = spins[Math.floor(spins.length / 2)], smax = spins[spins.length - 1];
  console.log(`level ${level}: ${sim.score.history.map((g) => `${g.p}-${g.c}`).join(', ')} winner ${sim.score.winner} · ${st.points} points in ${(t / 60).toFixed(1)} min (${((performance.now() - t0) / 1000).toFixed(1)} s cpu)`);
  console.log(`  strokes per point ${avg.toFixed(1)} · speed median ${med.toFixed(0)} km/h max ${max.toFixed(0)} · spin median ${smed.toFixed(0)} rpm max ${smax.toFixed(0)} · lets ${st.lets} · whiffs ${st.misses}`);
  console.log('  shots', JSON.stringify(st.hitsByShot));
  console.log('  ends', JSON.stringify(st.reasons));
  if (Object.keys(st.why).length) console.log('  no plan', JSON.stringify(st.why));
  check(sim.phase === 'done' && sim.score.winner, `level ${level}: the match finishes`);
  for (const g of sim.score.history) check(Math.max(g.p, g.c) >= 11 && Math.abs(g.p - g.c) >= 2, `level ${level}: game ${g.p}-${g.c} is a legal 11-point game`);
  check(avg >= (level === 1 ? 2.2 : 3) && avg <= 14, `level ${level}: rallies last ${avg.toFixed(1)} strokes (3–14)`);
  check(med > 25 && med < 90 && max < 140, `level ${level}: ball speeds ${med.toFixed(0)}/${max.toFixed(0)} km/h are table tennis speeds`);
  check(smax > 3000 && smax < 10000, `level ${level}: spin up to ${smax.toFixed(0)} rpm`);
}
if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
console.log('\nall ok');
