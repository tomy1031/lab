// js/bot.js — a player that plays by itself (ported from the designer's balance bot, docs/DESIGN.md §12).
// Used by the tests (tools/sim.mjs) and by the page's demo / auto-play. Styles:
//   'good'     — places a stage every turn, reviews, approves, fixes found bugs, reports NEW troubles, sets guards
//   'careless' — never reviews, approves, fixes or uses guards (uses overtime and rush)
//   'skipper'  — jumps straight to Coding on the first turn, then plays like 'good'
import { Duel, C } from './engine.js';

const bugsOf = (D) => D.allBugs();
const latestMake = (D) => D.placed.filter((s) => s && ['design', 'make'].includes(C(s.id).group)).slice(-1)[0];
const has = (D, id) => D.p.hand.some((h) => h.id === id);

export async function playTurn(D, style = 'good') {
  const careful = style !== 'careless';
  const tryPlay = async (id, opt = {}) => {
    const h = D.p.hand.find((x) => x.id === id);
    if (!h || D.effort < C(id).cost) return false;
    return D.play(h.uid, { ...opt, target: opt.target ? opt.target.uid : undefined });
  };
  const field = () => D.e.field;
  // 0. free report on new troubles
  if (careful) while (has(D, 's_report') && field().some((t) => t.isNew)) { const t = field().filter((x) => x.isNew).sort((a, b) => b.pressure - a.pressure)[0]; if (!(await tryPlay('s_report', { target: t }))) break; }
  // 1. targeted removal
  if (careful) {
    for (const t of field().slice()) { if (C(t.id).tag === 'aimai' && has(D, 's_hearing')) await tryPlay('s_hearing', { target: t }); }
    for (const t of field().slice().sort((a, b) => b.pressure - a.pressure)) { if (!field().includes(t)) continue; if (C(t.id).tag === 'honban' && t.pressure >= 3 && has(D, 's_naze')) await tryPlay('s_naze', { target: t }); }
    for (const t of field().slice().sort((a, b) => b.pressure - a.pressure)) { if (!field().includes(t)) continue; if (C(t.id).tag === 'honban' && has(D, 's_log')) await tryPlay('s_log', { target: t }); }
  }
  // 2. responses: resolve what we can, biggest first
  const doAttacks = async () => {
    for (const u of D.p.team.slice()) {
      if (u.acted || u.tired || !field().length || !D.p.team.includes(u)) continue;
      const scored = field().map((t) => { const p = D.unitPower(u, t); return { t, p, kill: p >= t.pressure }; }).filter((x) => x.p > 0);
      if (!scored.length) continue;
      scored.sort((a, b) => (b.kill - a.kill) || (b.t.pressure - a.t.pressure));
      await D.respond(u.uid, scored[0].t.uid);
      if (D.over) return;
    }
  };
  if (has(D, 's_pairpro') && D.p.team.filter((u) => !u.tired).length >= 2 && field().length) await tryPlay('s_pairpro');
  await doAttacks();
  if (D.over) return;
  // 2b. get people on the board when troubles pile up
  const pressure = () => field().reduce((a, t) => a + t.pressure, 0);
  const unitPrio0 = ['u_fujiki', 'u_ops', 'u_yamada', 'u_nyam', 'u_senpai', 'u_pg', 'u_tester', 'u_se', 'u_tantou', 'u_newbie', 'u_reviewer'];
  if (pressure() >= 3) {
    for (const id of unitPrio0) if (D.p.team.length < D.R.teamSlots && pressure() >= 3) { if (!careful && ['u_reviewer', 'u_senpai', 'u_tantou'].includes(id)) continue; await tryPlay(id); }
    await doAttacks();
  }
  if (careful) for (const id of ['g_rollback', 'g_abplan']) if (pressure() >= 5 && D.p.back.length < D.R.backSlots && !D.p.back.some((x) => x.id === id)) await tryPlay(id);
  // 3. bug-reducing documents / members before the stage
  const nextId = D.track[D.ptr];
  const nextGroup = nextId && C(nextId).group;
  if (!D.released && nextId) {
    const sc = D.stageCost(nextId);
    if (careful) {
      if (nextGroup === 'design') for (const id of ['d_hearing', 'u_se']) if (has(D, id) && D.effort >= sc + C(id).cost) await tryPlay(id);
      if (nextGroup === 'make') for (const id of ['d_kiyaku', 'u_pg']) if (has(D, id) && D.effort >= sc + C(id).cost) await tryPlay(id);
      if (nextGroup === 'release') for (const id of ['s_rehearsal', 'd_procedure']) if (has(D, id) && D.e.plots.length && D.effort >= sc + C(id).cost) await tryPlay(id);
      if (nextGroup === 'test') for (const id of ['u_tester', 'd_testcase']) if (has(D, id) && D.effort >= sc + C(id).cost) await tryPlay(id);
    }
    let place = true;
    if (nextGroup === 'release' && careful) {
      for (const x of bugsOf(D).filter((x) => x.b.found).sort((a, b) => b.b.size - a.b.size)) if (D.effort - D.fixCost(x.b) >= sc) await D.fix(x.s.idx, x.b.bid);
      if (has(D, 's_retest') && bugsOf(D).some((x) => !x.b.found) && D.effort >= sc + 1) await tryPlay('s_retest');
      const rem = D.bugTotal();
      if (rem >= 4 && D.turn < D.deadline && D.trust > 6) place = false;
      if (D.e.plots.length && !D.p.back.some((b) => b.down && ['g_double'].includes(b.id)) && D.turn < D.deadline && (has(D, 'g_double') || has(D, 's_rehearsal'))) place = false;
    }
    if (style === 'skipper' && D.ptr === 0) { const pg = D.track.indexOf('st_pg'); if (D.canPlace(pg)) { await D.place(pg); place = false; } }
    if (place && D.canPlace(D.ptr)) await D.place(D.ptr);
    if (style === 'careless' && has(D, 's_rush') && D.effort >= 1 + (D.track[D.ptr] ? D.stageCost(D.track[D.ptr]) : 9)) { await tryPlay('s_rush'); if (D.canPlace(D.ptr)) await D.place(D.ptr); }
  }
  if (D.over) return;
  if (careful) {
    // 4. review the newest stage
    const lm = () => latestMake(D);
    const unf = () => (lm() ? lm().bugs.filter((b) => !b.found || b.size <= 2).length : 0);
    if (unf() >= 2) await tryPlay('s_peer');
    while (unf() >= 1 && (await tryPlay('s_review')));
    if (unf() >= 1) await tryPlay('s_peer');
    if (unf() >= 1 && has(D, 'u_senpai') && D.p.team.length < 3) await tryPlay('u_senpai');
    if (bugsOf(D).some((x) => x.b.size <= 2)) await tryPlay('s_soudan');
    const f = D.placed.find((s) => s); if (f && f.bugs.some((b) => b.size <= 2) && f !== lm()) await tryPlay('s_yomiawase');
    if (unf() >= 1 && lm() && !lm().approved) await tryPlay('s_wire');
    while (lm() && lm().bugs.some((x) => !x.found) && (await D.review()));
    // 5. approve
    if (lm() && !lm().approved && !D.released) { (await tryPlay('s_stamp')) || (D.p.team.length < 3 && (await tryPlay('u_tantou'))) || (await D.approve()); }
    for (const m of D.placed.filter((x) => x && !x.skipped && !x.approved && C(x.id).group !== 'test')) await D.approve(m.idx);
    // 6. fix found bugs (cheap first)
    if (bugsOf(D).some((x) => x.b.found && x.b.size <= 4)) await tryPlay('s_bugreport');
    for (const x of bugsOf(D).filter((x) => x.b.found).sort((a, b) => a.b.size - b.b.size)) await D.fix(x.s.idx, x.b.bid);
    if (bugsOf(D).some((x) => !x.b.found) && D.placed.some((s) => s && C(s.id).group === 'test')) await tryPlay('s_retest');
  }
  if (D.over) return;
  // 7. board development
  const unitPrio = ['u_fujiki', 'u_ops', 'u_yamada', 'u_nyam', 'u_reviewer', 'u_senpai', 'u_tester', 'u_pg', 'u_se', 'u_tantou', 'u_newbie'];
  for (const id of unitPrio) { if (!careful && ['u_reviewer', 'u_senpai', 'u_tantou'].includes(id)) continue; if (id === 'u_fujiki' && !field().length) continue; if (D.p.team.length < D.R.teamSlots) await tryPlay(id); }
  await doAttacks();
  if (D.over) return;
  if (careful) {
    for (const id of ['g_rollback', 'g_double', 'g_change', 'g_minutes', 'g_basis', 'g_phase2', 'g_abplan', 'd_estimate', 'd_monitor', 'd_kadai', 'd_ci', 'd_testcase', 'd_procedure']) {
      if (D.p.back.length >= D.R.backSlots) break;
      if (D.p.back.some((b) => b.id === id)) continue;
      if (id === 'g_double' && !D.e.plots.length) continue;
      await tryPlay(id);
    }
    if (D.turn >= D.deadline - 1 && !D.released && D.ptr < D.track.length - 1) await tryPlay('s_buffer');
    for (const t of field().slice().sort((a, b) => b.pressure - a.pressure)) if (field().includes(t) && has(D, 's_5w1h')) await tryPlay('s_5w1h', { target: t });
    if (D.trust <= D.R.trust - 2) await tryPlay('s_kaizen');
    await tryPlay('s_renraku');
  } else await tryPlay('s_overtime');
}

// play a whole duel with the bot; returns the finished Duel
export async function playGame(chId, seed, style = 'good', opts = {}) {
  const D = new Duel(chId, { seed, ...opts, ask: opts.ask || (async (kind) => (kind === 'guard' ? style !== 'careless' : null)) });
  await D.start();
  while (!D.over) {
    await playTurn(D, style);
    if (D.over) break;
    await D.endTurn();
  }
  return D;
}
