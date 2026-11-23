// tests/sheet.mjs — companion character sheet checked against DESIGN §23.8.   node tests/sheet.mjs
import {
  mod, rollDice, rollSheet, derived, jobMultiplier, bestJobs, oneLiner, stageOf, STAGES, acceptChance, selfAwareness, sheetSummary, scoreMulOf,
} from '../js/sim/companion-sheet.js';
import { PROFESSIONS, CHAR_INFO, JOBS_SKILL } from '../js/data/professions.js';

let failed = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) failed++; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
// deterministic rng for reproducible stats
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const fixed = (v) => () => v;

check(mod(8) === -1 && mod(10) === 0 && mod(11) === 0 && mod(14) === 2 && mod(18) === 4 && mod(3) === -4 && mod(20) === 5, 'mod(x) table');
{ const d = rollDice('3d6+2', fixed(0.5)); check(d.total === 14 && d.bonus === 2 && d.rolls.join() === '4,4,4', 'rollDice 3d6+2 with fixed rng'); }
{ const d = rollDice('3d6-1', fixed(0)); check(d.total === 2 && d.bonus === -1, 'rollDice 3d6-1 minimum'); }

// 10 rolls of the same profession differ
{
  const sheets = Array.from({ length: 10 }, () => rollSheet('nagi', 'fisher'));
  const kinds = new Set(sheets.map((s) => JSON.stringify([s.abilities, s.skills])));
  check(kinds.size >= 8, `10 fisher rolls differ (${kinds.size} distinct)`);
}

// means
{
  const rng = lcg(7), N = 4000;
  const fs = Array.from({ length: N }, () => rollSheet('nagi', 'fisher', rng));
  const m = mean(fs.map((s) => s.abilities.str));
  check(near(m, 11.5, 0.3), `fisher (female) STR mean ≈ 11.5 over ${N} (got ${m.toFixed(2)})`);
  check(fs.every((s) => s.abilities.str >= 3 && s.abilities.str <= 20), 'abilities clamped 3–20');
  check(fs.every((s) => s.skills.fish >= 5 && s.skills.fish <= 8), 'Nagi fisher fish 5–8');
  const bs = Array.from({ length: N }, () => rollSheet('touko', 'botanist', rng));
  const mi = mean(bs.map((s) => s.abilities.int)), ms = mean(bs.map((s) => s.abilities.str));
  check(near(mi, 14.5, 0.3), `botanist INT mean ≈ 14.5 (got ${mi.toFixed(2)})`);
  check(near(ms, 7.5, 0.3), `botanist (female) STR mean ≈ 7.5 (got ${ms.toFixed(2)})`);
  check(bs.every((s) => s.skills.gather >= 5 && s.skills.gather <= 8), 'Touko botanist gather 5–8');
  const gs = Array.from({ length: N }, () => rollSheet('gen', 'carpenter', rng));
  check(gs.every((s) => s.skills.build >= 7 && s.skills.build <= 9), 'Gen carpenter build 7–9 (age lower bound +1)');
  check(gs.every((s) => s.skills.swim === 0), 'Gen never swims (any profession)');
  const gf = Array.from({ length: 300 }, () => rollSheet('gen', 'fisher', rng));
  check(gf.every((s) => s.skills.swim === 0), 'Gen as fisher still swim 0');
  const nf = Array.from({ length: 300 }, () => rollSheet('nagi', 'office', rng));
  check(nf.every((s) => s.skills.swim >= 4), 'Nagi swim ≥ 4 even as office worker');
  const th = Array.from({ length: 500 }, () => rollSheet('touko', 'guide', rng));
  check(th.every((s) => s.skills.nav >= 4 && s.skills.nav <= 7) && th.every((s) => Object.values(s.skills).every((v) => v <= 8)), 'Touko nav −2; guide skill cap 8');
  check(th.every((s) => s.quirks.some((q) => q.noKill)), 'Touko noKill quirk kept as guide');
  const auto = Array.from({ length: N }, () => rollSheet('nagi', 'auto', rng).profession);
  const pDef = auto.filter((p) => p === 'fisher').length / N, pOther = auto.filter((p) => p === 'student').length / N;
  check(near(pDef, 0.4, 0.04) && near(pOther, 0.0667, 0.02), `auto: default ≈ 40% (${pDef.toFixed(3)}), others ≈ 6.7% (${pOther.toFixed(3)})`);
}

// sex/age deltas on identical dice (every die = 4)
{
  const f = rollSheet('nagi', 'carpenter', fixed(0.5)), g = rollSheet('gen', 'carpenter', fixed(0.5));
  // base 3d6 = 12; carpenter: str+2 con+1 dex+3 agi-1 int+0 pow+1
  check(f.abilities.str === 12 + 2 - 1 && g.abilities.str === 12 + 2 + 1, 'sex: female STR −1, male +1 (same dice)');
  check(f.abilities.dex === 12 + 3 + 1 && g.abilities.dex === 12 + 3, 'sex: female DEX +1');
  check(g.abilities.con === 12 + 1 - 1 && f.abilities.con === 12 + 1, 'age 58: CON −1');
  check(g.abilities.int === 12 + 0 + 2 && f.abilities.int === 12, 'age 58: INT +2');
  check(f.abilities.agi === 12 - 1 + 1 && g.abilities.agi === 12 - 1 - 1, 'age: young AGI +1, old AGI −1');
  check(g.abilities.pow === 12 + 1 + 1 && f.abilities.pow === 12 + 1, 'age 58: POW +1');
  check(near(derived(f).appetite / derived(g).appetite, 0.9 * (0.85 + (f.abilities.str + f.abilities.con) / 2 * 0.015) / (0.85 + (g.abilities.str + g.abilities.con) / 2 * 0.015), 1e-9), 'appetite carries sex ×0.9');
  check(/＋2（大工）/.test(f.breakdown.str) && /−1（性別）/.test(f.breakdown.str), `breakdown text: "${f.breakdown.str}"`);
  const dd = derived(f), dg = derived(g);
  check(dd.regen > dg.regen, 'young regen ×1.1 > old ×0.85');
  check(dd.shiverEarly === 0.2 && dd.coreCold === 0.9 && dg.sweat === 1.05, 'sex cold/heat flags');
}

// score multiplier bounds
{
  const lo = scoreMulOf(120), hi = scoreMulOf(18), mid = scoreMulOf(63);
  check(near(lo, 0.81, 0.001) && near(hi, 0.99, 0.001) && near(mid, 0.9, 1e-9), `scoreMul bounds ${lo}…${hi}, 63→${mid}`);
  check(near(scoreMulOf(80), 0.839, 0.001) && near(scoreMulOf(50), 0.947, 0.001), 'scoreMul 80 → 0.84, 50 → 0.95');
  const rng = lcg(3);
  const all = Array.from({ length: 2000 }, () => rollSheet('nagi', 'auto', rng).scoreMul);
  check(Math.min(...all) >= 0.81 && Math.max(...all) <= 0.99, 'rolled scoreMul stays within 0.81–0.99');
  const s = rollSheet('touko', 'botanist', lcg(1));
  check(s.total === Object.values(s.abilities).reduce((a, b) => a + b, 0) && s.scoreMul === scoreMulOf(s.total), 'sheet.total / scoreMul consistent');
}

// derived
{
  const s = rollSheet('gen', 'carpenter', lcg(5));
  const withAbil = (o) => ({ ...s, abilities: { ...s.abilities, ...o } });
  check(near(derived(withAbil({ str: 5 })).carry, 8, 1e-9) && near(derived(withAbil({ str: 16 })).carry, 12.4, 1e-9), 'carry 8 kg at STR 5, 12.4 kg at 16');
  const d16 = derived(withAbil({ con: 16 }));
  check(near(d16.coldLow, 18.2, 1e-9), `CON 16 → coldLow 18.2 (${d16.coldLow})`);
  check(near(d16.illnessBase, 0.82, 1e-9) && near(d16.illness, 0.82, 1e-9), `CON 16 → illness ×0.82 (male ${d16.illness})`);
  const d10 = derived(withAbil({ str: 10, con: 10, agi: 10, pow: 10, int: 10 }));
  check(near(d10.carry, 10, 1e-9) && near(d10.speed, 4.0, 1e-9) && near(d10.staminaMax, 100, 1e-9) && near(d10.appetite, 0.8, 1e-9) && near(d10.hotHigh, 30, 1e-9)
    && near(d10.dodge, 0.5, 1e-9) && near(d10.advice, 0.6, 1e-9) && near(d10.moraleDrain, -0.8, 1e-9), 'all-10 values: carry 10, speed 4.0, stamina 100, appetite 0.8, dodge 50%, advice 60%');
  const dn = derived({ ...withAbil({ pow: 10 }), skills: { ...s.skills, night: 0 } });
  check(near(dn.nightFear, -2.0, 1e-9), 'night fear −2.0 at POW 10 / night 0');
  const dl = derived({ ...withAbil({ int: 10 }), skills: { ...s.skills, nav: 0 } });
  check(near(dl.lostRate, 0.04, 1e-9) && near(derived({ ...dl && withAbil({ int: 10 }), skills: { ...s.skills, nav: 5 } }).lostRate, 0.016, 1e-9), 'lost rate 4% (nav 0) / 1.6% (nav 5)');
  const t = rollSheet('touko', 'botanist', lcg(2));
  const tn = { ...t, skills: { ...t.skills, nav: 5 }, abilities: { ...t.abilities, int: 10 } };
  check(near(derived(tn).lostRate, 0.032, 1e-9), 'Touko lost rate ×2');
  const cookS = rollSheet('nagi', 'cook', lcg(4)), cd = derived({ ...cookS, abilities: { ...cookS.abilities, con: 10 } });
  check(near(cd.coldLow, 21, 1e-9), 'cook flaw: coldLow +1℃');
  check(['強い', 'ふつう', '弱い', '寒さに 強い', 'ふつう', '寒がり'].includes(cd.labels.cold) && cd.labels.cold === '寒がり', `label for coldLow 21: ${cd.labels.cold}`);
}

// job multiplier
{
  const base = rollSheet('nagi', 'fisher', lcg(9));
  const strong = { ...base, profession: 'office', abilities: { ...base.abilities, agi: 14 }, skills: { ...base.skills, fish: 8 } };
  const weak = { ...base, profession: 'office', abilities: { ...base.abilities, agi: 8 }, skills: { ...base.skills, fish: 1 } };
  const neutral = jobMultiplier(strong, 'fish', { stage: 3 }) / jobMultiplier(weak, 'fish', { stage: 3 });
  check(near(neutral, 2.51, 0.02), `fish Lv8/AGI14 vs Lv1/AGI8, same stage: ×${neutral.toFixed(2)} (DESIGN formula 1.56·1.10 / 0.72·0.95)`);
  const staged = jobMultiplier(strong, 'fish', { stage: 4 }) / jobMultiplier(weak, 'fish', { stage: 2 });
  check(staged > 2.4 && staged < 3.0, `…with stage 4 vs stage 2: ×${staged.toFixed(2)} (≥ the ≈2.4× in the spec)`);
  check(near(jobMultiplier(strong, 'fish', { stage: 3 }), 1.56 * 1.1, 1e-9), 'fish Lv8 AGI14 stage 3 = 1.716');
  check(near(jobMultiplier(weak, 'fish', { stage: 3, morale: 20 }) / jobMultiplier(weak, 'fish', { stage: 3 }), 0.7, 1e-9), 'morale < 30 → ×0.7');
  const n5 = { ...strong, skills: { ...strong.skills, night: 5 } };
  check(near(jobMultiplier(n5, 'fish', { night: true }) / jobMultiplier(n5, 'fish', {}), 0.7, 1e-9), 'night skill 5 → ×0.7 at night');
  const nurse = { ...strong, profession: 'nurse', skills: { ...strong.skills, gather: 5 } };
  const nurseAs = { ...nurse, profession: 'office' };
  check(near(jobMultiplier(nurse, 'gather_wood') / jobMultiplier(nurseAs, 'gather_wood'), 0.8, 1e-9), 'nurse flaw: wood ×0.8');
  const car = { ...strong, profession: 'carpenter' };
  check(jobMultiplier(car, 'build_help') > jobMultiplier({ ...car, profession: 'office' }, 'build_help'), 'carpenter perk raises build_help');
  const s = rollSheet('nagi', 'fisher', lcg(11));
  const best = bestJobs(s, 3);
  check(best.length === 3 && best[0].mult >= best[1].mult && best[1].mult >= best[2].mult, `bestJobs sorted: ${best.map((b) => `${b.label}×${b.mult.toFixed(1)}`).join(' ')}`);
  check(Object.keys(JOBS_SKILL).every((j) => Number.isFinite(jobMultiplier(s, j))), 'all job ids evaluate');
}

// stages and acceptChance
{
  check([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(stageOf).join() === '1,1,2,2,3,3,4,4,5,5', 'stageOf boundaries');
  check(STAGES.length === 5 && STAGES[0].jobMul === 0.85 && STAGES[4].jobMul === 1.2 && STAGES[2].name === '打ち解けた', 'STAGES table');
  const s = rollSheet('nagi', 'fisher', lcg(1));
  const a = acceptChance(s, { affinity: 10, trust: 20 }), b = acceptChance(s, { affinity: 70, trust: 60 });
  check(near(a, 0.5, 0.005), `affinity 10 / trust 20 → ${a.toFixed(3)} ≈ 0.50`);
  check(near(b, 0.92, 0.005), `affinity 70 / trust 60 → ${b.toFixed(3)} ≈ 0.92`);
  check(acceptChance(s, { affinity: 90, trust: 50, danger: true }) === 0, 'danger with trust 50 → refused');
  check(near(acceptChance(s, { affinity: 50, trust: 80, danger: true }), 0.35 + 0.15 + 0.48 - 0.3, 1e-9), 'danger with trust 80 follows the formula');
  check(near(acceptChance(s, { affinity: 10, trust: 15 }), 0.47, 0.005), 'affinity 10 / trust 15 → 47%');
  check(acceptChance(s, { affinity: 0, trust: 0, dislike: true, sick: true, morale: 10 }) === 0.05, 'floor 0.05');
  check(acceptChance(s, { affinity: 100, trust: 100, recentKindness: true }) === 1, 'cap 1.0');
  check(near(acceptChance(s, { affinity: 85, trust: 50, dislike: true }), 0.35 + 0.255 + 0.3 - 0.1, 1e-9), 'dislike −0.10 at affinity ≥ 80');
}

// text outputs
{
  for (const [c, p] of [['nagi', 'fisher'], ['touko', 'botanist'], ['gen', 'carpenter'], ['nagi', 'student'], ['touko', 'office']]) {
    const s = rollSheet(c, p, lcg(c.length * 31 + p.length));
    const one = oneLiner(s), aw = selfAwareness(s, { short: CHAR_INFO[c].short });
    const sum = sheetSummary(s);
    check(typeof one === 'string' && one.length > 4 && aw.length >= 1 && aw.length <= 2 && !/\d/.test(aw.join('')), `${c}/${p}: 「${one}」 ${aw.join(' ')}`);
    check(sum.abilities.length === 6 && sum.skills.length === 11 && sum.life.length === 8 && sum.best.length === 3 && sum.title.includes(PROFESSIONS[p].name), `${c}/${p}: summary shape (${sum.title})`);
  }
  const sorted = sheetSummary(rollSheet('nagi', 'fisher', lcg(8))).skills;
  const firstLow = sorted.findIndex((x) => x.lv < 4);
  check(firstLow === -1 || sorted.slice(firstLow).every((x) => x.lv < 4), 'skills ≥4 listed first');
  const hi = { ...rollSheet('nagi', 'fisher', lcg(2)) }; hi.abilities = { str: 16, con: 10, dex: 10, agi: 10, int: 10, pow: 5 };
  check(oneLiner(hi) === '力持ち だけど、夜は ちょっと 苦手。', `oneLiner example: ${oneLiner(hi)}`);
}

// plain JSON round-trip (save/load)
{
  const s = rollSheet('touko', 'auto', lcg(99));
  const back = JSON.parse(JSON.stringify(s));
  check(JSON.stringify(derived(back)) === JSON.stringify(derived(s)) && sheetSummary(back).title === sheetSummary(s).title, 'sheet survives JSON round-trip');
}

console.log(failed ? `\n${failed} FAILED` : '\nall sheet checks passed');
process.exit(failed ? 1 : 0);
