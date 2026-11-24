import * as G from './engine.mjs';
const { C } = G;
const bugsOf = (S) => S.placed.flatMap((s) => (s ? s.bugs.map((b) => ({ b, s })) : []));
const latestMake = (S) => S.placed.filter((s) => s && ['design', 'make'].includes(C(s.id).group)).slice(-1)[0];
const has = (S, id) => S.p.hand.includes(id);

// style: 'good' | 'careless' (no review / fix / approve / guards) | 'skipper' (skips design stages)
export function playTurn(S, style = 'good') {
  const careful = style !== 'careless';
  const tryPlay = (id, opt) => has(S, id) && S.effort >= C(id).cost && G.playCard(S, id, opt);
  const field = () => S.e.field;
  // 0. free report on new troubles
  if (careful) while (has(S, 's_report') && field().some((t) => t.isNew)) { const t = field().filter((x) => x.isNew).sort((a, b) => b.pressure - a.pressure)[0]; if (!tryPlay('s_report', { target: t })) break; }
  // 1. targeted removal
  if (careful) {
    for (const t of field().slice()) { if (C(t.id).tag === 'aimai' && has(S, 's_hearing')) tryPlay('s_hearing', { target: t }); }
    for (const t of field().slice().sort((a, b) => b.pressure - a.pressure)) { if (!field().includes(t)) continue; if (C(t.id).tag === 'honban' && t.pressure >= 3 && has(S, 's_naze')) tryPlay('s_naze', { target: t }); }
    for (const t of field().slice().sort((a, b) => b.pressure - a.pressure)) { if (!field().includes(t)) continue; if (C(t.id).tag === 'honban' && has(S, 's_log')) tryPlay('s_log', { target: t }); }
  }
  // 2. attacks: kill what we can, biggest first
  const doAttacks = () => {
    for (const u of S.p.team) {
      if (u.acted || u.tired || !field().length) continue;
      const scored = field().map((t) => { const p = G.unitPower(S, u, t); return { t, p, kill: p >= t.pressure }; }).filter((x) => x.p > 0);
      if (!scored.length) continue;
      scored.sort((a, b) => (b.kill - a.kill) || (b.t.pressure - a.t.pressure));
      G.attack(S, u, scored[0].t);
    }
  };
  if (has(S, 's_pairpro') && S.p.team.filter((u) => !u.tired).length >= 2 && field().length) tryPlay('s_pairpro');
  doAttacks();
  // 2b. threat mode: get people on the board when troubles pile up
  const pressure = () => field().reduce((a, t) => a + t.pressure, 0);
  const unitPrio0 = ['u_fujiki', 'u_ops', 'u_yamada', 'u_nyam', 'u_senpai', 'u_pg', 'u_tester', 'u_se', 'u_tantou', 'u_newbie', 'u_reviewer'];
  if (pressure() >= 3) { for (const id of unitPrio0) if (S.p.team.length < S.R.teamSlots && pressure() >= 3) { if (!careful && ['u_reviewer', 'u_senpai', 'u_tantou'].includes(id)) continue; tryPlay(id); } doAttacks(); }
  if (careful) for (const id of ['g_rollback', 'g_abplan']) if (pressure() >= 5 && S.p.back.length < S.R.backSlots && !S.p.back.some((x) => x.id === id)) tryPlay(id);
  // 3. inject-reducing docs / units before the stage
  const nextId = S.track[S.ptr];
  const nextGroup = nextId && C(nextId).group;
  if (!S.released && nextId) {
    const sc = G.stageCost(S, nextId);
    if (careful) {
      if (nextGroup === 'design') for (const id of ['d_hearing', 'u_se']) if (has(S, id) && S.effort >= sc + C(id).cost) tryPlay(id);
      if (nextGroup === 'make') for (const id of ['d_kiyaku', 'u_pg']) if (has(S, id) && S.effort >= sc + C(id).cost) tryPlay(id);
      if (nextGroup === 'release') for (const id of ['s_rehearsal', 'd_procedure']) if (has(S, id) && S.e.plots.length && S.effort >= sc + C(id).cost) tryPlay(id);
      if (nextGroup === 'test') for (const id of ['u_tester', 'd_testcase']) if (has(S, id) && S.effort >= sc + C(id).cost) tryPlay(id);
    }
    // release decision: fix first if we can afford to wait
    let place = true;
    if (nextGroup === 'release' && careful) {
      const tot = G.bugTotal(S); const foundCost = bugsOf(S).filter((x) => x.b.found).reduce((a, x) => a + G.fixCost(S, x.b), 0);
      // spend on fixes first, release if leftover allows; else wait if before deadline and bugs heavy
      for (const x of bugsOf(S).filter((x) => x.b.found).sort((a, b) => b.b.size - a.b.size)) if (S.effort - G.fixCost(S, x.b) >= sc) G.fixBug(S, x.s, x.b);
      if (has(S, 's_retest') && bugsOf(S).some((x) => !x.b.found) && S.effort >= sc + 1) tryPlay('s_retest');
      const rem = G.bugTotal(S);
      if (rem >= 4 && S.turn < S.deadline && S.trust > 6) place = false;
      if (S.e.plots.length && !S.p.back.some((b) => b.down && ['g_double'].includes(b.id)) && S.turn < S.deadline && (has(S, 'g_double') || has(S, 's_rehearsal') )) { place = false; }
    }
    if (style === 'skipper' && S.ptr === 0) { const pg = S.track.indexOf('st_pg'); if (G.canPlace(S, pg)) { G.placeStage(S, pg); place = false; } }
    if (place && G.canPlace(S, S.ptr)) G.placeStage(S, S.ptr);
    if (style === 'careless' && has(S, 's_rush') && S.effort >= 1 + (S.track[S.ptr] ? G.stageCost(S, S.track[S.ptr]) : 9)) { tryPlay('s_rush'); if (G.canPlace(S, S.ptr)) G.placeStage(S, S.ptr); }
  }
  if (S.over) return;
  if (careful) {
    // 4. review newest stage
    const lm = () => latestMake(S);
    const unf = () => (lm() ? lm().bugs.filter((b) => !b.found || b.size <= 2).length : 0);
    if (unf() >= 2) tryPlay('s_peer');
    while (unf() >= 1 && tryPlay('s_review')) ;
    if (unf() >= 1) tryPlay('s_peer');
    if (unf() >= 1 && has(S, 'u_senpai') && S.p.team.length < 3) tryPlay('u_senpai');
    if (bugsOf(S).some((x) => x.b.size <= 2)) tryPlay('s_soudan');
    const f = S.placed.find((s) => s); if (f && f.bugs.some((b) => b.size <= 2) && f !== lm()) tryPlay('s_yomiawase');
    if (unf() >= 1 && lm() && !lm().approved) tryPlay('s_wire');
    while (lm() && lm().bugs.some((x) => !x.found) && G.review(S)) ;
    // 5. approve
    if (lm() && !lm().approved && !S.released) { tryPlay('s_stamp') || (S.p.team.length < 3 && tryPlay('u_tantou')) || G.approve(S); }
    for (const m of S.placed.filter((x) => x && !x.skipped && !x.approved && C(x.id).group !== 'test')) G.approve(S, m);
    // 6. fix found bugs (cheap first)
    if (bugsOf(S).some((x) => x.b.found && x.b.size <= 4)) tryPlay('s_bugreport');
    for (const x of bugsOf(S).filter((x) => x.b.found).sort((a, b) => a.b.size - b.b.size)) G.fixBug(S, x.s, x.b);
    if (bugsOf(S).some((x) => !x.b.found) && S.placed.some((s) => s && C(s.id).group === 'test')) tryPlay('s_retest');
  }
  // 7. board development
  const unitPrio = ['u_fujiki', 'u_ops', 'u_yamada', 'u_nyam', 'u_reviewer', 'u_senpai', 'u_tester', 'u_pg', 'u_se', 'u_tantou', 'u_newbie'];
  for (const id of unitPrio) { if (!careful && ['u_reviewer', 'u_senpai', 'u_tantou'].includes(id)) continue; if (id === 'u_fujiki' && !field().length) continue; if (S.p.team.length < S.R.teamSlots) tryPlay(id); }
  doAttacks();
  if (careful) {
    for (const id of ['g_rollback', 'g_double', 'g_change', 'g_minutes', 'g_basis', 'g_phase2', 'g_abplan', 'd_estimate', 'd_monitor', 'd_kadai', 'd_ci', 'd_testcase', 'd_procedure']) {
      if (S.p.back.length >= S.R.backSlots) break;
      if (S.p.back.some((b) => b.id === id)) continue;
      if (id === 'g_double' && !S.e.plots.length) continue;
      tryPlay(id);
    }
    if (S.turn >= S.deadline - 1 && !S.released && S.ptr < S.track.length - 1) tryPlay('s_buffer');
    for (const t of field().slice().sort((a, b) => b.pressure - a.pressure)) if (field().includes(t) && has(S, 's_5w1h')) tryPlay('s_5w1h', { target: t });
    if (S.trust <= S.R.trust - 2) tryPlay('s_kaizen');
    tryPlay('s_renraku');
  } else { tryPlay('s_overtime'); }
}
export function playGame(chId, seed, style = 'good', opts = {}) {
  const S = G.newGame(chId, seed, { ...opts, ask: () => style !== 'careless' });
  while (!S.over) {
    G.startPlayerTurn(S); if (S.over) break;
    playTurn(S, style);
    if (S.over) break;
    G.endPlayerTurn(S); if (S.over) break;
    G.enemyTurn(S);
  }
  return S;
}
