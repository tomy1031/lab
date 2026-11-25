// tools/sim.mjs — the rules, without a browser:
//   1. the data: every card / chapter / lesson / quiz / tutorial string is checked (tools/ref/validate.mjs)
//   2. the engine plays exactly like the designer's reference engine (tools/ref/engine.mjs), seed by seed
//   3. the rules teach what they should: careful play beats skipping stages, which beats careless play
//   4. the same seed gives the same duel; every duel ends by turn 20
//   5. single rules, set up by hand: bugs double, the V pairs, holes, approval, change control, a 4-card cut-in,
//      a failed release, being late, rework (a broken stage), the tutorial script
//   node tools/sim.mjs [gamesPerChapter=60]
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duel, C } from '../js/engine.js';
import { CHAPTERS } from '../js/data/chapters.js';
import { TUTORIAL } from '../js/data/tutorial.js';
import { playGame } from './bot.mjs';
import { playGame as refGame } from './ref/bot.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const N = +(process.argv[2] || 60);
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };

// ---------- 1. data ----------
{
  const outp = execFileSync(process.execPath, [path.join(here, 'ref', 'validate.mjs')], { cwd: path.join(here, 'ref'), encoding: 'utf8' });
  const last = outp.trim().split('\n').slice(-3).join(' / ');
  check(/ALL OK/.test(outp), `data checked (furigana on every kanji word, ids, effects, art, lengths): ${last}`);
}

// ---------- 2. same as the reference engine ----------
{
  let diffs = 0, games = 0;
  const first = [];
  for (const ch of CHAPTERS) for (const style of ['good', 'careless', 'skipper']) for (let s = 1; s <= N; s++) {
    const a = await playGame(ch.id, s, style); const b = refGame(ch.id, s, style);
    games++;
    const ka = `${a.over} t${a.turn} tr${a.trust} fix${a.stats.fixSpent}`, kb = `${b.over} t${b.turn} tr${b.trust} fix${b.stats.fixSpent}`;
    if (ka !== kb) { diffs++; if (first.length < 3) first.push(`${ch.id}/${style}/seed ${s}: ${ka} vs ${kb}`); }
  }
  check(diffs === 0, `the engine plays like the reference engine in ${games} games (${diffs} different${first.length ? ': ' + first.join('; ') : ''})`);
}

// ---------- 3. the rules teach ----------
{
  const M = Math.max(N, 100);
  const rows = [];
  for (const ch of CHAPTERS) {
    const r = {};
    for (const style of ['good', 'skipper', 'careless']) {
      let w = 0, inc = 0, turns = 0;
      for (let s = 1; s <= M; s++) { const D = await playGame(ch.id, s, style); if (D.over === 'win') w++; inc += D.stats.incidents; turns += D.turn; }
      r[style] = { win: w / M, inc: inc / M, turns: turns / M };
    }
    rows.push([ch, r]);
    console.log(`    ${ch.id} ${ch.track.padEnd(4)} win: careful ${(100 * r.good.win).toFixed(0).padStart(3)}%  skipper ${(100 * r.skipper.win).toFixed(0).padStart(3)}%  careless ${(100 * r.careless.win).toFixed(0).padStart(3)}%   incidents ${r.good.inc.toFixed(1)} / ${r.skipper.inc.toFixed(1)} / ${r.careless.inc.toFixed(1)}   turns ${r.good.turns.toFixed(1)}`);
  }
  const teach = rows.filter(([ch]) => !['ch1', 'ch8'].includes(ch.id));
  check(teach.every(([, r]) => r.good.win > r.careless.win + 0.4), 'careful play (review, approve, fix, guards) wins far more than careless play in chapters 2–7 and 9');
  check(teach.every(([, r]) => r.good.win >= r.skipper.win), 'skipping design stages never beats doing them');
  check(teach.every(([, r]) => r.careless.inc > r.good.inc), 'careless play leaves more production incidents');
  check(rows.every(([, r]) => r.good.turns <= 14), 'duels are short (on average 14 turns or fewer)');
}

// ---------- 4. determinism and the end ----------
{
  const log = async (seed) => { const ev = []; await playGame('ch9', seed, 'good', { emit: async (e) => { ev.push(e.type + (e.id || e.card || '') + (e.value ?? '')); } }); return ev.join(','); };
  check((await log(11)) === (await log(11)), 'the same seed gives the same duel (event by event)');
  let maxT = 0;
  for (const ch of CHAPTERS) for (const style of ['good', 'careless', 'skipper']) for (let s = 1; s <= 30; s++) { const D = await playGame(ch.id, s, style); maxT = Math.max(maxT, D.turn); if (!D.over) maxT = 99; }
  check(maxT <= 20, `every duel ends (longest: ${maxT} turns)`);
}

// ---------- 5. single rules ----------
async function duel(ch, seed = 1, ask) {
  const D = new Duel(ch, { seed, ask: ask || (async () => 0) });
  await D.start();
  D.effort = 99;
  return D;
}
const bugs = (D, i) => D.placed[i].bugs.map((b) => (b.found ? '' : '?') + b.size).join(',');

{ // bugs double at every stage; found ones do not; the cap is 8
  const D = await duel('ch4');
  await D.place(0); D.stageUsed = 0;
  await D.place(1); D.stageUsed = 0;
  await D.place(2); D.stageUsed = 0;
  check(bugs(D, 0) === '?4' && bugs(D, 1) === '?2' && bugs(D, 2) === '?1', `bugs double each time a stage is placed (要件定義 ${bugs(D, 0)}, 基本設計 ${bugs(D, 1)}, 詳細設計 ${bugs(D, 2)})`);
  D.placed[1].bugs[0].found = true;
  await D.place(3); D.stageUsed = 0;
  check(bugs(D, 0) === '?8' && bugs(D, 1) === '2' && bugs(D, 3) === '?1,?1,?1', `a found bug stops growing, an unfound one stops at 8 (${bugs(D, 0)} / ${bugs(D, 1)}); Coding brings 3 bugs`);
  // the V: Unit Test finds Detailed Design and Coding, not Requirements
  await D.place(4); D.stageUsed = 0;
  check(bugs(D, 2) === '4' && bugs(D, 3) === '2,2,2' && bugs(D, 0) === '?8', `Unit Test finds the bugs of Detailed Design and Coding only (詳細設計 ${bugs(D, 2)}, 製造 ${bugs(D, 3)}, 要件定義 ${bugs(D, 0)})`);
  await D.place(5); D.stageUsed = 0; await D.place(6); D.stageUsed = 0;
  check(bugs(D, 0) === '8', `Acceptance Test finds the Requirements bug — at size ${bugs(D, 0)}: the most expensive fix`);
  const e0 = D.effort; await D.fix(0, D.placed[0].bugs[0].bid);
  check(e0 - D.effort === 8, `fixing it costs its size (${e0 - D.effort} effort); a review right after placing would have cost 1`);
}
{ // skipping: holes whose bugs no test finds
  const D = await duel('ch4');
  await D.place(3); // straight to Coding
  check([0, 1, 2].every((i) => D.placed[i].skipped && D.placed[i].bugs.length === 2), 'jumping to Coding leaves 3 holes with 2 bugs each');
  D.stageUsed = 0; await D.place(4); D.stageUsed = 0; await D.place(5); D.stageUsed = 0; await D.place(6); D.stageUsed = 0;
  check([0, 1, 2].every((i) => D.placed[i].bugs.every((b) => !b.found)), 'no test finds the bugs in the holes (no design document, nothing to test against)');
  D.stageUsed = 0; await D.place(7);
  const inc = D.e.field.filter((t) => t.id === 't_incident').map((t) => t.pressure);
  check(D.released && inc.length === 3 && inc.every((p) => p === 8), `at release they become production incidents of size 8 (${inc.join(',')}, the rest hit Trust directly: ${D.trust})`);
}
{ // approval blocks the enemy's vague cards, not changes; change control needs an approved stage
  const D = await duel('ch4');
  await D.place(0); await D.approve(0);
  const n0 = D.placed[0].bugs.length;
  D.side = 'e';
  await D.run({ on: 'play', op: 'addBug', n: 2, at: 'first' }, { side: 'e', card: 'e_ittaiwanai' });
  check(D.placed[0].bugs.length === n0, '「言った・言わない」 bounces off an approved stage');
  await D.run({ on: 'play', op: 'addBug', n: 2, at: 'latest', force: true }, { side: 'e', card: 'e_spec' });
  check(D.placed[0].bugs.length === n0 + 2, 'a change (仕様変更) still gets in, approved or not');
  const E = await duel('ch4');
  await E.place(0);
  E.p.back.push({ uid: 900, id: 'g_change', down: true });
  check(E.guardOptions({ side: 'e', type: 'event', tag: 'henkou', card: 'e_spec' }).length === 0, 'change control cannot be used while nothing is approved (no baseline, no change)');
  await E.approve(0);
  check(E.guardOptions({ side: 'e', type: 'event', tag: 'henkou', card: 'e_spec' }).length === 1, 'with an approved stage, change control can cut in');
}
{ // a 4-card cut-in: 仕様変更 → 変更管理 → 鶴の一声 → ダブルチェック
  const chain = [];
  const D = new Duel('ch9', { seed: 3, ask: async (k, info) => info.options[0].uid, emit: async (e) => { if (e.type === 'chain' || e.type === 'chainResolved') chain.push(`${e.type}:${e.card}${e.negates ? '!' : ''}`); } });
  await D.start();
  D.effort = 99;
  await D.place(0); await D.approve(0);
  D.p.back = [{ uid: 901, id: 'g_change', down: true }, { uid: 902, id: 'g_double', down: true }];
  D.e.plots = [{ uid: 903, id: 'p_tsuru' }];
  const dl = D.deadline, bugsBefore = D.allBugs().length;
  D.side = 'e';
  const neg = await D.tryGuard({ side: 'e', type: 'event', card: 'e_spec', tag: 'henkou' });
  check(chain.filter((x) => x.startsWith('chain:')).length === 3 && neg && D.deadline === dl + 1 && D.allBugs().length === bugsBefore,
    `4 cards: change control ← the boss's word ← double check; the last resolves first, the change is stopped and the deadline moves +1 (${chain.join(' ')})`);
}
{ // a plot cancels the release: the pointer stays, you can release next turn
  const D = await duel('ch1', 1);
  for (let i = 0; i < 3; i++) { D.stageUsed = 0; await D.place(i); }
  D.e.plots = [{ uid: 904, id: 'p_old_manual' }];
  D.stageUsed = 0;
  const ptr = D.ptr;
  await D.place(3);
  check(!D.released && D.ptr === ptr && D.stats.relFail === 1, 'an old runbook (古い手順書) cancels the release: nothing moves, Trust −2');
  D.stageUsed = 0; await D.place(3);
  check(D.released, 'the next try goes live');
}
{ // late: −2, −3, −4 …
  const D = await duel('ch1', 1);
  const lost = [];
  D.emitFn = async (e) => { if (e.type === 'late') lost.push(e.n); };
  D.deadline = 1;
  for (let i = 0; i < 3; i++) { D.e.hand = []; D.e.deck = []; await D.endTurn(); }
  check(lost.join(',') === '2,3,4', `being late costs more every turn (${lost.join(', ')})`);
}
{ // rework: a broken stage goes back; placing it again brings new bugs
  const D = await duel('ch4');
  await D.place(0); D.stageUsed = 0; await D.place(1);
  D.side = 'e';
  await D.run({ on: 'play', op: 'breakStage', n: 1 }, { side: 'e', card: 'e_chabudai' });
  check(D.ptr === 1 && !D.placed[1], '「ちゃぶ台返し」 breaks the unapproved stage: back to 基本設計');
  D.side = 'p'; D.stageUsed = 0; await D.place(1);
  check(D.placed[1] && D.placed[1].bugs.length === 1, 'placing it again brings its bug again (rework costs)');
  await D.approve(1);
  D.side = 'e';
  await D.run({ on: 'play', op: 'breakStage', n: 1 }, { side: 'e', card: 'e_chabudai' });
  check(!!D.placed[1], 'an approved stage cannot be broken');
}
{ // the tutorial script, step by step
  const asked = [];
  const D = new Duel('ch1', { seed: 1, ask: async (k, info) => { asked.push(info.options.map((o) => o.id).join('/')); return info.options[0].uid; } });
  await D.start();
  let fail = null;
  for (const st of TUTORIAL) {
    const w = st.want;
    if (w.type === 'next' || w.type === 'guard') continue;
    let r = true;
    const find = (list, id) => list.find((x) => x.id === id);
    if (w.type === 'place') r = await D.place(D.track.indexOf(w.stage));
    else if (w.type === 'play') r = await D.play(find(D.p.hand, w.card)?.uid, { target: w.target ? find(D.e.field, w.target)?.uid : undefined });
    else if (w.type === 'review') r = await D.review();
    else if (w.type === 'attack') r = await D.respond(find(D.p.team, w.unit)?.uid, find(D.e.field, w.target)?.uid);
    else if (w.type === 'fix') { const s = D.placed.find((x) => x && x.id === w.stage); r = await D.fix(s.idx, s.bugs.find((b) => b.found)?.bid); }
    else if (w.type === 'endTurn') r = await D.endTurn();
    if (!r && !D.over) { fail = `${st.id} ${JSON.stringify(w)}`; break; }
  }
  check(!fail && D.over === 'win' && D.trust === 20 && D.turn === 5 && asked.includes('g_abplan'), `the tutorial script is legal move by move and wins in 5 turns with Trust 20${fail ? ' — failed at ' + fail : ''}`);
}

console.log(ok ? 'sim: all ok' : 'sim: FAILED');
process.exit(ok ? 0 : 1);
