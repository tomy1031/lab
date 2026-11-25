// KOTEI DUEL — reference rules engine (design check / balance simulation). Plain JS, deterministic (seeded RNG).
// (Kept as the rules reference: tools/sim.mjs checks that js/engine.js plays every game exactly like this one.)
// This file is the precise companion of docs/DESIGN.md: where the prose is ambiguous, this code is the rule.
//   DESIGN 3.4 turn flow  -> startPlayerTurn / endPlayerTurn      DESIGN 3.5 enemy turn + 3.10 CPU -> enemyTurn
//   DESIGN 3.6 place stage -> canPlace / placeStage               DESIGN 3.4 base actions -> review / approve / fixBug / attack / playCard
//   DESIGN 3.8 cut-ins     -> tryGuard (max 4 cards, last resolves first, negate cancels the previous action)
//   DESIGN 4   effect ops  -> run() (one switch, 21 ops; conditions -> cond())
// State is a plain object (see newGame). Hidden-information/UI choices (which guard, which target) are made by
// opts.ask / ctx.target or by simple defaults (biggest bug, strongest trouble) so the bots can play.
import { CARDS, CARD_BY_ID, OPS } from '../../js/data/cards.js';
import { CHAPTERS, TRACKS, DEFAULT_RULES } from '../../js/data/chapters.js';

export function rng32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const C = (id) => CARD_BY_ID[id];

export function newGame(chId, seed = 1, opts = {}) {
  const ch = CHAPTERS.find((c) => c.id === chId);
  const R = { reviewCost: 1, approveCost: 1, ...DEFAULT_RULES, ...ch.rules, ...(opts.rules || {}) };
  const tr = TRACKS[ch.track];
  const r = rng32(seed);
  const S = {
    ch, R, r, track: tr.stages, pair: tr.pair, turn: 0, side: 'p', over: null, log: [], stats: { fixSpent: 0, incidents: 0, lateTurns: 0, dmg: 0, guards: 0, lessons: {} },
    trust: R.trust, effort: 0, effortNext: 0, deadline: R.deadline, late: 0,
    ptr: 0, placed: [], released: false, opsLeft: null, stageUsed: 0, extra: 0, extraBug: 0, uid: 1,
    p: { deck: R.fixedOrder ? ch.playerDeck.slice() : shuffle(opts.playerDeck || ch.playerDeck, r), hand: [], discard: [], team: [], back: [] },
    e: { deck: R.fixedOrder ? ch.enemy.deck.flat() : ch.enemy.deck.flatMap((seg) => shuffle(seg, r)), hand: [], discard: [], field: [], plots: [], ap: 0 },
    ask: opts.ask || (() => true), // (kind, info) => decision for the player's optional guard activation
  };
  for (let i = 0; i < R.hand; i++) draw(S, 'p');
  for (let i = 0; i < R.enemyHand; i++) draw(S, 'e');
  if (R.startReleased) {
    S.track.forEach((id, i) => { S.placed[i] = { id, idx: i, approved: true, bugs: [] }; });
    S.ptr = S.track.length; S.released = true; S.opsLeft = R.ops;
    for (const t of R.startTroubles || []) { const u = summon(S, t.id, t.pressure); if (u) u.isNew = false; }
  }
  return S;
}
const L = (S, ...a) => { S.log.push(`T${S.turn}${S.side} ` + a.join(' ')); };
function draw(S, who) {
  const z = S[who];
  if (!z.deck.length) { if (who === 'p' && z.discard.length) { z.deck = shuffle(z.discard, S.r); z.discard = []; } else return; }
  z.hand.push(z.deck.shift());
}
// ---------- board helpers ----------
const makeStages = (S) => S.placed.filter((s) => s && !s.skipped && ['design', 'make'].includes(C(s.id).group));
const latestMake = (S) => makeStages(S).slice(-1)[0];
const firstStage = (S) => S.placed.find((s) => s && !s.skipped);
const allBugs = (S) => S.placed.flatMap((s) => (s ? s.bugs.map((b) => ({ b, s })) : []));
export const bugTotal = (S) => allBugs(S).reduce((a, x) => a + x.b.size, 0);
function stageSel(S, at) {
  if (at === 'latest') return [latestMake(S)].filter(Boolean);
  if (at === 'first') return [firstStage(S)].filter(Boolean);
  if (at === 'make') { const pg = S.placed.find((s) => s && C(s.id).group === 'make'); return [pg || latestMake(S)].filter(Boolean); }
  if (at === 'all' || at === 'any') return S.placed.filter(Boolean);
  if (at === 'placed') return S.placed.filter((s) => s && !s.skipped);
  return [];
}
export function cond(S, name) {
  if (!name || name === 'always') return true;
  const mk = makeStages(S);
  switch (name) {
    case 'released': return S.released;
    case 'notReleased': return !S.released;
    case 'hasStage': return mk.length > 0;
    case 'hasApproved': return S.placed.some((s) => s && s.approved);
    case 'hasUnapproved': return mk.some((s) => !s.approved);
    case 'firstUnapproved': { const f = firstStage(S); return !!f && !f.approved && !S.released; }
    case 'latestUnapproved': { const l = S.placed.filter((x) => x && !x.skipped).slice(-1)[0]; return !!l && !l.approved && !S.released; }
    case 'testPlaced': return S.placed.some((s) => s && C(s.id).group === 'test') && !S.released;
    case 'nearRelease': return !S.released && S.ptr >= S.track.length - 3;
    case 'hasUnit': return S.p.team.length > 0;
    case 'hasGuard': return S.p.back.some((b) => b.down);
    case 'hasBug': return allBugs(S).length > 0;
    case 'hasUnfound': return allBugs(S).some((x) => !x.b.found);
  }
  if (name.startsWith('stage:')) return S.placed.some((s) => s && s.id === 'st_' + name.slice(6));
  throw new Error('unknown cond ' + name);
}
// continuous modifiers
function mods(S, what, f = () => true) {
  let n = 0;
  const srcs = [...S.p.team.map((u) => u.id), ...S.p.back.filter((b) => !b.down).map((b) => b.id), ...S.e.field.map((t) => t.id)];
  for (const id of srcs) for (const ef of C(id).effects) if (ef.on === 'static' && ef.op === 'mod' && ef.what === what && f(ef)) n += ef.n;
  return n;
}
const grp = (g) => (ef) => !ef.group || ef.group === 'all' || ef.group === g;
export const stageCost = (S, id) => Math.max(0, C(id).cost + mods(S, 'stageCost', grp(C(id).group)));
export const fixCost = (S, b) => Math.max(1, b.size + mods(S, 'fixCost'));
export function unitPower(S, u, t) {
  let p = C(u.id).power + (u.buff || 0) + mods(S, 'power');
  if (t) for (const ef of C(u.id).effects) if (ef.op === 'mod' && ef.what === 'powerVs' && ef.tags.includes(C(t.id).tag)) p += ef.n;
  return Math.max(0, p);
}
// ---------- trust ----------
function trust(S, n, src) {
  if (S.over) return;
  if (n < 0 && src === 'e') {
    if (-n >= 1 && tryGuard(S, { side: 'e', type: 'damage', n: -n })) { L(S, 'damage', n, 'prevented'); return; }
    S.stats.dmg += -n;
  }
  S.trust = Math.min(S.R.trust, S.trust + n);
  if (S.trust <= 0) { S.trust = 0; S.over = 'lose'; L(S, 'LOSE trust 0'); }
}
// ---------- chain ----------
function matches(trig, act) {
  const [k, v] = trig.split(':');
  if (act.type === 'damage') return k === 'damage' && act.n >= +v;
  if (k !== act.type) return false;
  return !v || v === act.tag;
}
// returns true if `act` is negated. depth counts links.
function tryGuard(S, act, depth = 1) {
  if (depth >= 4) return false;
  let resp = null;
  if (act.side === 'e') {
    const i = S.p.back.findIndex((b) => b.down && C(b.id).trigger.some((t) => matches(t, act)) && cond(S, C(b.id).need));
    if (i >= 0 && S.ask('guard', { card: S.p.back[i].id, act })) { resp = { side: 'p', type: 'guard', card: S.p.back[i].id, tag: null }; S.p.back.splice(i, 1); S.p.discard.push(resp.card); S.stats.guards++; }
  } else {
    const i = S.e.plots.findIndex((b) => C(b.id).trigger.some((t) => matches(t, act)));
    if (i >= 0) { resp = { side: 'e', type: 'plot', card: S.e.plots[i].id, tag: C(S.e.plots[i].id).tag }; S.e.plots.splice(i, 1); S.e.discard.push(resp.card); }
  }
  if (!resp) return false;
  L(S, 'CHAIN', resp.card, 'vs', act.card || act.type);
  if (tryGuard(S, resp, depth + 1)) { L(S, resp.card, 'negated'); return false; }
  let neg = false;
  for (const ef of C(resp.card).effects) if (ef.on === 'trigger') { if (ef.op === 'negate') neg = true; else run(S, ef, { side: resp.side, card: resp.card, trig: act }); }
  S.stats.lessons[C(resp.card).lesson] = 1;
  return neg;
}
// ---------- effects ----------
function pickTrouble(S, ef, ctx) {
  const f = S.e.field.filter((t) => (!ef.tag || C(t.id).tag === ef.tag) && (!ef.newOnly || t.isNew));
  if (ef.target === 'all') return S.e.field.slice();
  if (ef.target === 'trigger') return [ctx.trig && ctx.trig.unit].filter((t) => t && S.e.field.includes(t));
  if (ef.target === 'self') return [ctx.self].filter(Boolean);
  if (ef.target === 'strongest') return f.sort((a, b) => b.pressure - a.pressure).slice(0, 1);
  if (ef.target === 'choose') { if (ctx.target && f.includes(ctx.target)) return [ctx.target]; return f.sort((a, b) => b.pressure - a.pressure).slice(0, 1); }
  return [];
}
function hit(S, t, n) { t.pressure -= n; if (t.pressure <= 0) { S.e.field.splice(S.e.field.indexOf(t), 1); if (!C(t.id).token) S.e.discard.push(t.id); L(S, 'resolved', t.id); } }
function summon(S, id, pressure) {
  const R = S.R;
  if (S.e.field.length >= R.fieldSlots) { L(S, 'no slot: direct', pressure); trust(S, -pressure, 'e'); return null; }
  const t = { id, uid: S.uid++, pressure: pressure ?? C(id).pressure, isNew: !C(id).token };
  S.e.field.push(t);
  for (const ef of C(id).effects) if (ef.on === 'play') run(S, ef, { side: 'e', card: id, self: t });
  for (const b of [...S.p.team, ...S.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'trouble' && S.e.field.includes(t)) run(S, ef, { side: 'p', card: b.id, trig: { unit: t } });
  return t;
}
export function run(S, ef, ctx) {
  if (S.over) return;
  if (!OPS.includes(ef.op)) throw new Error('unknown op ' + ef.op);
  if (ef.if && !cond(S, ef.if)) return;
  const enemy = ctx.side === 'e';
  switch (ef.op) {
    case 'trust': {
      let n = ef.n;
      if (ef.per === 'unapproved') n = ef.n * Math.min(ef.max || 99, makeStages(S).filter((s) => !s.approved).length);
      if (n) trust(S, n, enemy ? 'e' : 'p');
      break; }
    case 'effort': if (S.side === 'p') S.effort = Math.max(0, S.effort + ef.n); else S.effortNext += ef.n; break;
    case 'deadline': S.deadline += ef.n; break;
    case 'draw': for (let i = 0; i < ef.n; i++) draw(S, ctx.side); break;
    case 'discard': for (let i = 0; i < ef.n && S.p.hand.length; i++) S.p.discard.push(S.p.hand.splice(Math.floor(S.r() * S.p.hand.length), 1)[0]); break;
    case 'addBug': for (const s of stageSel(S, ef.at)) { if (enemy && s.approved && !ef.force) { L(S, 'blocked by approval', ctx.card); continue; } for (let i = 0; i < ef.n; i++) s.bugs.push({ size: 1, found: false }); } break;
    case 'findBug': { const bs = stageSel(S, ef.at).filter((s) => !s.skipped).flatMap((s) => s.bugs).filter((b) => !b.found).sort((a, b) => b.size - a.size); bs.slice(0, ef.n).forEach((b) => { b.found = true; }); break; }
    case 'fixBug': {
      let sts = stageSel(S, ef.at);
      let c = sts.flatMap((s) => s.bugs.map((b) => ({ b, s }))).filter((x) => (!ef.maxSize || x.b.size <= ef.maxSize) && (!ef.foundOnly || x.b.found)).sort((a, b) => b.b.size - a.b.size);
      c.slice(0, ef.n).forEach((x) => x.s.bugs.splice(x.s.bugs.indexOf(x.b), 1));
      break; }
    case 'growBug': allBugs(S).forEach(({ b }) => { if (ef.at !== 'unfound' || !b.found) b.size = Math.min(S.R.bugMax, b.size * 2); }); break;
    case 'hitTrouble': for (const t of pickTrouble(S, ef, ctx)) hit(S, t, ef.n + (ef.bonusTag && C(t.id).tag === ef.bonusTag ? ef.bonus : 0)); break;
    case 'clearTrouble': for (const t of pickTrouble(S, ef, ctx)) hit(S, t, 999); break;
    case 'growTrouble': for (const t of pickTrouble(S, ef, ctx)) t.pressure += ef.n; break;
    case 'summon': summon(S, ef.id, ef.pressure); break;
    case 'breakStage': for (let i = 0; i < ef.n; i++) { const l = S.placed.filter((x) => x && !x.skipped).slice(-1)[0]; if (!l || l.approved || S.released) break; S.placed.length = l.idx; while (S.placed.length && S.placed[S.placed.length - 1].skipped) S.placed.length--; S.ptr = S.placed.length; S.stats.breaks = (S.stats.breaks || 0) + 1; L(S, 'BREAK', l.id); } break;
    case 'approve': {
      if (ef.off) { const s = S.placed.filter((x) => x && x.approved).slice(-1)[0]; if (s) s.approved = false; break; }
      const s = latestMake(S); if (!s || s.approved || S.released) break;
      if (ctx.side === 'p' && tryGuard(S, { side: 'p', type: 'approve', card: ctx.card })) { L(S, 'approval cancelled'); break; }
      s.approved = true; break; }
    case 'tire': { const us = S.p.team.filter((u) => !u.tired).sort((a, b) => C(b.id).power - C(a.id).power); (ef.target === 'all' ? us : us.slice(0, 1)).forEach((u) => { u.tired = 2; }); break; }
    case 'buff': S.p.team.forEach((u) => { u.buff = (u.buff || 0) + ef.n; }); break;
    case 'extraStage': S.extra += 1; S.extraBug = ef.bug || 0; break;
    case 'clearPlot': for (let i = 0; i < ef.n && S.e.plots.length; i++) { const p = S.e.plots.shift(); S.e.discard.push(p.id); L(S, 'plot destroyed', p.id); } break;
    case 'negate': case 'mod': break;
  }
}
// ---------- player actions ----------
export function canPlace(S, idx) {
  if (S.released || idx < S.ptr || idx >= S.track.length) return false;
  if (S.stageUsed >= 1 + S.extra) return false;
  const c = C(S.track[idx]);
  if ((c.group === 'test' || c.group === 'release') && !S.placed.some((s) => s && C(s.id).group === 'make')) return false;
  if (c.group !== 'make' && c.group !== 'design') { /* skipping over make is impossible */ for (let j = S.ptr; j < idx; j++) if (C(S.track[j]).group === 'make') return false; }
  return S.effort >= stageCost(S, S.track[idx]);
}
export function placeStage(S, idx = S.ptr) {
  if (!canPlace(S, idx)) return false;
  const id = S.track[idx], c = C(id);
  S.effort -= stageCost(S, id); S.stageUsed++;
  const rush = S.stageUsed > 1 ? S.extraBug : 0;
  if (c.group === 'release') {
    for (const b of [...S.p.team, ...S.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'release') run(S, ef, { side: 'p', card: b.id });
    if (tryGuard(S, { side: 'p', type: 'release', card: id })) { L(S, 'RELEASE FAILED'); S.stats.relFail = (S.stats.relFail || 0) + 1; return true; }
    if (S.over) return true;
  }
  // skipped make-stages
  const holes = []; for (let j = S.ptr; j < idx; j++) if (C(S.track[j]).group === 'design') holes.push(j);
  // grow unfound bugs
  allBugs(S).forEach(({ b }) => { if (!b.found) b.size = Math.min(S.R.bugMax, b.size * 2); });
  const st = { id, idx, approved: false, bugs: [] }; S.placed[idx] = st; S.ptr = idx + 1;
  if (c.group === 'design' || c.group === 'make') {
    const n = Math.max(0, c.inject + mods(S, 'inject', grp(c.group))) + rush;
    for (const j of holes) { S.placed[j] = { id: S.track[j], idx: j, skipped: true, approved: false, bugs: [] }; for (let i = 0; i < S.R.skipBugs; i++) S.placed[j].bugs.push({ size: 1, found: false }); S.stats.skips = (S.stats.skips || 0) + 1; }
    for (let i = 0; i < n; i++) st.bugs.push({ size: 1, found: false });
  } else if (rush) { const m = latestMake(S); if (m) for (let i = 0; i < rush; i++) m.bugs.push({ size: 1, found: false }); }
  if (c.group === 'test') for (const pid of S.pair[id] || []) { const ps = S.placed.find((s) => s && s.id === pid && !s.skipped); if (ps) ps.bugs.forEach((b) => { b.found = true; }); }
  L(S, 'PLACE', id, 'bugs', JSON.stringify(S.placed.filter(Boolean).map((s) => s.bugs.map((b) => (b.found ? '' : '?') + b.size).join(','))));
  for (const ef of c.effects) if (ef.on === 'play') run(S, ef, { side: 'p', card: id });
  for (const b of [...S.p.team, ...S.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'stage' && (!ef.group || ef.group === c.group)) run(S, ef, { side: 'p', card: b.id });
  if (c.group === 'release') {
    S.released = true; S.opsLeft = S.R.ops; S.stats.releaseTurn = S.turn;
    const bs = allBugs(S).sort((a, b) => b.b.size - a.b.size);
    for (const { b, s } of bs) { s.bugs.splice(s.bugs.indexOf(b), 1); S.stats.incidents += b.size; summon(S, 't_incident', b.size); }
  }
  return true;
}
export function canPlay(S, id) {
  const c = C(id);
  if (S.effort < c.cost) return false;
  return true;
}
export function playCard(S, id, opt = {}) {
  const i = S.p.hand.indexOf(id); const c = C(id);
  if (i < 0 || S.effort < c.cost) return false;
  if (c.kind === 'unit' && S.p.team.length >= S.R.teamSlots) { if (opt.replace == null) return false; const o = S.p.team.splice(opt.replace, 1)[0]; S.p.discard.push(o.id); }
  if ((c.kind === 'guard' || c.kind === 'doc') && S.p.back.length >= S.R.backSlots) { if (opt.replace == null) return false; const o = S.p.back.splice(opt.replace, 1)[0]; S.p.discard.push(o.id); }
  S.p.hand.splice(i, 1); S.effort -= c.cost;
  L(S, 'play', id);
  if (c.kind === 'guard') { S.p.back.push({ id, down: true }); return true; }
  if (c.kind === 'unit') { S.p.team.push({ id, tired: 0, acted: false, buff: 0 }); }
  else if (c.kind === 'doc') S.p.back.push({ id, down: false });
  else S.p.discard.push(id);
  for (const ef of c.effects) if (ef.on === 'play') run(S, ef, { side: 'p', card: id, target: opt.target });
  return true;
}
export function attack(S, u, t) {
  if (u.acted || u.tired || !S.e.field.includes(t)) return false;
  u.acted = true; const p = unitPower(S, u, t); L(S, 'attack', u.id, '->', t.id, p); hit(S, t, p); return true;
}
export function fixBug(S, s, b) {
  if (!b.found) return false; const k = fixCost(S, b); if (S.effort < k) return false;
  S.effort -= k; S.stats.fixSpent += k; s.bugs.splice(s.bugs.indexOf(b), 1); L(S, 'fix', k); return true;
}
export function review(S) {
  const m = latestMake(S); if (!m) return false; const b = m.bugs.filter((x) => !x.found).sort((a, c) => c.size - a.size)[0];
  if (!b || S.reviewed || S.effort < S.R.reviewCost) return false; S.reviewed = true; S.effort -= S.R.reviewCost; m.bugs.splice(m.bugs.indexOf(b), 1); L(S, 'review'); return true;
}
export function approve(S, m = latestMake(S)) {
  if (!m || m.skipped || m.approved || S.released || !['design', 'make'].includes(C(m.id).group) || S.effort < S.R.approveCost) return false; S.effort -= S.R.approveCost;
  if (tryGuard(S, { side: 'p', type: 'approve', card: 'approve' })) return true;
  m.approved = true; L(S, 'approve', m.id); return true;
}
// ---------- turn flow ----------
export function startPlayerTurn(S) {
  S.turn++; S.side = 'p'; S.reviewed = false; S.stageUsed = 0; S.extra = 0; S.extraBug = 0;
  if (S.turn > S.R.turnLimit) { S.over = 'lose'; return; }
  const base = Math.min(S.R.effortCap, S.R.effortStart + (S.turn - 1) * S.R.effortGrow);
  S.effort = Math.max(0, base + mods(S, 'effortTurn') + S.effortNext); S.effortNext = 0;
  S.p.team.forEach((u) => { u.acted = false; u.buff = 0; if (u.tired) u.tired--; });
  draw(S, 'p');
  if (!S.released && S.turn > S.deadline) { S.stats.lateTurns++; trust(S, -(S.R.latePenalty + S.late), 'late'); S.late++; L(S, 'LATE'); }
  for (const b of [...S.p.team, ...S.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'turnStart') run(S, ef, { side: 'p', card: b.id });
}
export function endPlayerTurn(S) {
  for (const b of [...S.p.team, ...S.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'turnEnd') run(S, ef, { side: 'p', card: b.id });
  while (S.p.hand.length > S.R.handMax) S.p.discard.push(S.p.hand.pop());
  if (S.released && !S.over) { if (S.stats.releaseTurn !== S.turn || S.R.startReleased) S.opsLeft--; if (S.opsLeft <= 0) { S.over = 'win'; L(S, 'WIN'); } }
}
export function enemyTurn(S) {
  if (S.over) return;
  S.side = 'e'; const R = S.R, E = S.e;
  E.ap = Math.min(R.enemyApCap, R.enemyApStart + Math.floor((S.turn - 1) / R.enemyApEvery));
  draw(S, 'e'); if (S.turn >= R.enemyDraw2From) draw(S, 'e');
  E.field.forEach((t) => { t.fresh = false; });
  // play by priority
  for (let guard = 0; guard < 10; guard++) {
    const opts = E.hand.map((id) => C(id)).filter((c) => c.cost <= E.ap && cond(S, c.ai && c.ai.when)
      && (c.kind !== 'trouble' || E.field.length < R.fieldSlots) && (c.kind !== 'plot' || E.plots.length < R.plotSlots))
      .sort((a, b) => (b.ai.prio - a.ai.prio) || (b.cost - a.cost));
    if (!opts.length || S.over) break;
    const c = opts[0]; E.hand.splice(E.hand.indexOf(c.id), 1); E.ap -= c.cost;
    L(S, 'enemy plays', c.id);
    if (c.kind === 'plot') { E.plots.push({ id: c.id }); continue; }
    if (tryGuard(S, { side: 'e', type: c.kind, card: c.id, tag: c.tag })) { E.discard.push(c.id); L(S, c.id, 'negated'); continue; }
    if (c.kind === 'trouble') { const t = summon(S, c.id, c.pressure); if (t) t.fresh = !c.sudden; }
    else { for (const ef of c.effects) if (ef.on === 'play') run(S, ef, { side: 'e', card: c.id }); E.discard.push(c.id); }
  }
  // attack
  for (const t of E.field.slice()) {
    if (S.over) break;
    if (!E.field.includes(t) || t.fresh) continue;
    if (tryGuard(S, { side: 'e', type: 'attack', card: t.id, unit: t })) { L(S, 'attack negated', t.id); continue; }
    if (!E.field.includes(t)) continue;
    L(S, 'ATTACK', t.id, t.pressure); trust(S, -t.pressure, 'e');
    for (const ef of C(t.id).effects) if (ef.on === 'attack' && E.field.includes(t)) run(S, ef, { side: 'e', card: t.id, self: t });
  }
  E.field.forEach((t) => { t.isNew = !!t.fresh; t.fresh = false; });
}
export { C };
