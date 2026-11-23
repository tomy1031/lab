// player/trapwork.js — setting traps by hand and checking them (DESIGN §26): the work-table flow for each trap
// (player/fieldflows.js), knowledge of the 「罠の 仕掛け方」 entries (K0–K3), what you find when you check (§26.8 cards
// with the cause at K1+), collecting the catch (birds go through the §25 procedure), baiting, resetting, taking it back.
import { TRAP_TYPES, CATCH_ITEMS, CATCH_NAMES, baitClass } from '../sim/traps.js';
import { itemDef } from '../data/items.js';
import { TRAP_CARD, TRAP_CAUSE, TEACH, TRAIL_SPOT } from '../data/fieldcraft.js';
import { trapFlowFor } from './fieldflows.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const TRAP_ITEMS = new Set(Object.keys(TRAP_TYPES));
const HOWTO_NAME = { howto_trap_snare: 'くくり罠の 仕掛け方', howto_trap_deadfall: '石落としの 組み方', howto_trap_fish: 'かごの 仕掛け方' };
const TEACH_KEY = { snare: 'snare', deadfall: 'deadfall', fish_trap: 'fish_trap', crab_pot: 'fish_trap' };
const mildOf = (game) => (game.settings?.butcherView || 'mild') !== 'normal';

/** the best bait you carry for this trap / target (§26.4): best > suits > anything else */
export function bestBait(inv, type = 'snare', aim = 'small') {
  const rank = { best: 4, ball: 3, ok: 2, wrong: 1, weed: 0.5, none: 0 };
  const cands = inv.stacks.filter((s) => itemDef(s.id)?.food && !itemDef(s.id)?.food?.poison && s.id !== 'coconut');
  cands.sort((a, b) => rank[baitClass(type, aim, b)] - rank[baitClass(type, aim, a)]);
  return cands[0] || null;
}

/** the point in front of the player where a trap goes (water traps: up to 2.6 m ahead) */
function spotAhead(game, type) {
  const P = game.player, fwd = P.forward;
  const tries = TRAP_TYPES[type].where === 'water' ? [1.4, 2, 2.6, 1] : [1.2, 0.8, 1.6];
  let last = null;
  for (const d of tries) {
    const x = P.pos.x + fwd.x * d, z = P.pos.z + fwd.z * d;
    const s = game.sys.traps.spotFor(type, x, z);
    if (s.ok) return { x, z, spot: s };
    last = s;
  }
  return { spot: last };
}

/** a partner who knows traps (hunting Lv5+, baskets: fishing Lv5+) within 5 m */
function teacherFor(game, type) {
  const C = game.sys.companion;
  if (!C?.ready || C.dead || !C.near?.(5)) return null;
  const sk = C.sheet?.skills || {};
  return (TRAP_TYPES[type].where === 'water' ? sk.fish : sk.hunt) >= 5 ? C : null;
}

/** §26.6 injuries while setting (manual only; assist / auto / mastered: none) */
function injuries(game, type, r, K, mode) {
  if (mode !== 'manual' || r.quick) return null;
  const B = game.sys.player.body, rng = game.rng;
  if (type === 'snare' && (r.extra.dropped === 'bend' || r.extra.snapped)) {
    if (rng.next() < (K >= 3 ? 0.10 : 0.25)) { B.injure('bruise', 1, 2, 'ばね木が はねた'); return 'ばね木が はねて 手を 打った'; }
  }
  if (type === 'deadfall' && (r.extra.dropped === 'lift' || r.extra.dropped === 'lower' || (r.stepP?.lower ?? 1) < 0.25)) {
    if (rng.next() < (K >= 3 ? 0.15 : 0.30)) { B.injure('bruise', 1, 3, '石に 指を はさんだ'); return '石に 指を はさんだ'; }
  }
  return null;
}

/** what the result of the work table means for the trap (§26.5 「まちがえると」) */
function marksOf(type, r) {
  const sp = r.stepP || {}, x = r.extra || {}, m = {};
  if ((sp.stake ?? 1) < 0.3) m.stakeShallow = true;
  if ((sp.loopPos ?? 1) < 0.25) m.loopOff = true;
  if ((sp.loop ?? 1) < 0.3) m.looseKnot = true;
  if (x.triggerShallow) m.triggerShallow = true;
  if (x.triggerDeep) m.triggerDeep = true;
  if ((sp.assemble ?? 1) < 0.5 || x.wrongOrder) m.assembleOff = true;
  if (x.mouthMul != null) m.mouthMul = x.mouthMul;
  if ((sp.stones ?? 1) < 0.25) m.stonesWeak = true;
  if ((sp.bait ?? 1) < 0.3) m.baitNearMouth = true;
  return m;
}

function stepScores(r) {
  const by = {};
  for (const s of r.steps || []) if (s.hid) (by[s.hid] = by[s.hid] || []).push(s.p);
  const out = {};
  for (const [k, v] of Object.entries(by)) out[k] = v.reduce((a, b) => a + b, 0) / v.length;
  return out;
}

/** inventory → 「前に 仕掛ける」 */
export async function setTrap(game, uid) {
  const inv = game.sys.player.inv, s = inv.get(uid), T = game.sys.traps, P = game.sys.player;
  if (!s || !T || !TRAP_ITEMS.has(s.id)) return false;
  const type = s.id, def = TRAP_TYPES[type];
  const at = spotAhead(game, type);
  if (!at.spot?.ok) { game.bus.emit('toast', { text: `${def.name}：${at.spot?.reason || 'ここには 仕掛けられない'}`, kind: 'warn' }); return false; }
  const K0 = game.sys.knowledge?.level?.(def.howto) ?? 0;
  const K = inv.find('guide') ? Math.max(K0, type === 'fish_trap' || type === 'crab_pot' ? 3 : 2) : K0;
  const teach = teacherFor(game, type);
  const Kshow = teach ? Math.max(2, K) : K;
  const flow = trapFlowFor(type, { K: Kshow, trailUsers: at.spot.trailRef?.users || [] });
  const mode = game.handwork?.mode?.() ?? 'auto';
  const r = game.handwork
    ? await game.handwork.run(flow, {
      title: `${def.name}を 仕掛ける`, key: `trap:${type}`, tolMul: [0.85, 1, 1.1, 1.2][K] * (type === 'snare' && at.spot.zone === 'beach' ? 0.85 : 1),
      scene: { trap: { id: type, type, K: Kshow, aim: 'bird', view: mildOf(game) ? 'mild' : 'normal' } },
      onStep: (st) => { const line = teach && TEACH[teach.id]?.[TEACH_KEY[type]]?.[st.hid]; if (line) teach.speak(line); },
    })
    : { ok: true, p: 0.55, extra: {}, steps: [] };
  if (r.cancelled) return false;
  r.stepP = stepScores(r);
  const part = inv.take(uid, 1)[0];
  P.validate?.();
  const aim = r.extra.aim || (type === 'snare' ? 'small' : null);
  let bait = null;
  if (r.extra.baited) { const b = bestBait(inv, type, aim); if (b) bait = inv.take(b.uid, 1)[0]; }
  // your scent on the trap (§26.3): bloody hands ×0.4, muddy / smoky hands ×0.85
  const scent = P.bloodyHands ? 0.4 : P.smoky || P.muddy ? 0.85 : 1;
  const t = T.add(type, at.x, at.z, { stack: part, p: r.p, K: r.sameRhythm || mode === 'auto' ? Math.min(K, 1) : K, bait, spot: at.spot, aim, marks: marksOf(type, r), scent });
  const hurt = injuries(game, type, r, K, mode);
  if (r.extra.snapped || r.extra.dropped) {
    t.state = 'sprung'; t.note = 'empty'; T.refresh(t);
    game.bus.emit('toast', { text: `${def.name}：${hurt || (r.extra.snapped ? '手元で はじけた' : '途中で 手を はなして しまった')}。仕掛け直そう`, kind: hurt ? 'bad' : 'warn' });
  }
  game.passTime(Math.round((type === 'deadfall' ? 8 : type === 'snare' ? 10 : 6) * (r.feel?.timeMul ?? 1)));
  P.body.s.stamina = Math.max(0, P.body.s.stamina - flow.length);
  learnTrap(game, def.howto, { p: r.p, teach: !!teach, half: mode === 'auto' || !!r.quick || !!r.sameRhythm });
  if (teach) teach.adjust?.(0, 1);
  const bc = baitClass(type, aim, bait);
  const where = t.water ? (r.extra.mouthMul != null && r.extra.mouthMul < 1 ? '口の 向きが ずれて いる' : '') : t.onTrail ? (K >= 2 ? '獣道の 上' : '') : (K >= 1 ? '獣道から 外れて いる' : '');
  if (!r.extra.snapped && !r.extra.dropped) game.bus.emit('toast', { text: `${def.name}を 仕掛けた${where ? `（${where}）` : ''}・${r.feel?.label || ''}${bait ? `・エサ：${itemDef(bait.id)?.name}${K >= 2 && bc === 'best' ? '（いちばん 合う）' : K >= 2 && bc === 'wrong' ? '（合わない）' : ''}` : def.baitNeeded ? '・エサが ない（ほとんど かからない）' : ''}`, kind: 'good' });
  game.stats.trapsSet = (game.stats.trapsSet || 0) + 1;
  return true;
}

/** §26.7 knowledge: once → K1, 3 sets or 1 catch (or a teacher / the guide) → K2, 3 catches after K2 (baskets 5) → K3; auto / mastered count half */
export function learnTrap(game, howto, { p = 0.55, caught = false, teach = false, half = false, seen = false } = {}) {
  const P = game.sys.player, K = game.sys.knowledge;
  const st = (P.stats.traps = P.stats.traps || {});
  const r = (st[howto] = st[howto] || { set: 0, caught: 0, good: 0, seen: 0 });
  if (caught) { r.caught++; if (p >= 0.6) r.good++; } else if (seen) r.seen++; else r.set += half ? 0.5 : 1;
  const cur = K?.level?.(howto) ?? 0;
  let lv = Math.max(cur, r.set >= 1 || r.seen >= 1 || r.caught >= 1 ? 1 : cur);
  if (!half && (r.set >= 3 || r.caught >= 1 || teach)) lv = Math.max(lv, 2);
  if (cur >= 2 && r.good >= (howto === 'howto_trap_fish' ? 5 : 3)) lv = 3;
  if (lv > cur) { K?.learn?.(howto, lv, caught ? '獲物が かかった' : teach ? '教わった' : 'やって 覚えた'); game.bus.emit('toast', { text: `図鑑「${HOWTO_NAME[howto]}」が K${lv} に`, kind: 'info' }); }
  if (howto === 'howto_trap_snare') game.sys.traps?.updateTrailVisibility?.();
  return lv;
}

/** the §26.8 card: what you see + (K1+) why */
function card(game, t) {
  const def = TRAP_TYPES[t.type], mild = mildOf(game), w = mild ? 'mild' : 'normal';
  const K = game.sys.knowledge?.level?.(def.howto) ?? 0;
  const fill = (s) => (s || '').replace(/\{who\}/g, CATCH_NAMES[t.catch] || '獲物').replace(/\{trap\}/g, def.name);
  const state = t.state === 'caught' ? 'caught' : t.state === 'broken' ? 'broken' : t.state === 'sprung' ? (t.note === 'escaped' || t.note === 'eaten' ? 'lost' : 'empty') : t.note === 'baitGone' ? 'baitGone' : 'set';
  let cause = null;
  if (K >= 1) {
    const M = t.marks || {}, now = game.clock.total;
    if (state === 'set') cause = now - t.setAt < 6 * 60 ? TRAP_CAUSE.scent : !t.water && !t.onTrail ? TRAP_CAUSE.offTrail : !t.bait && def.baitNeeded ? TRAP_CAUSE.noBait : null;
    if (state === 'empty') cause = t.note === 'wind' ? TRAP_CAUSE.wind : M.triggerShallow ? TRAP_CAUSE.triggerShallow : M.loopOff ? TRAP_CAUSE.loopHeight : M.assembleOff ? TRAP_CAUSE.triggerShallow : TRAP_CAUSE.loopHeight;
    if (state === 'baitGone') cause = M.triggerDeep ? TRAP_CAUSE.triggerDeep : TRAP_CAUSE.baitNearMouth;
    if (state === 'caught') cause = t.narrow ? TRAP_CAUSE.narrowGood : null;
    if (state === 'lost') cause = M.stakeShallow ? TRAP_CAUSE.stakeShallow : TRAP_CAUSE.late12h;
    if (state === 'broken') cause = t.note === 'flood' ? TRAP_CAUSE.flood : TRAP_CAUSE.looseKnot;
    if (t.water && state === 'set' && (M.mouthMul ?? 1) < 1) cause = TRAP_CAUSE.mouthWrong;
  }
  return { state, text: fill(TRAP_CARD[state]?.[w]), cause };
}

/** E on a trap */
export async function trapAction(game, interact, t, opt) {
  const T = game.sys.traps, inv = game.sys.player.inv, def = TRAP_TYPES[t.type];
  const toast = (text, kind = 'info') => game.bus.emit('toast', { text, kind });
  const mild = mildOf(game);
  const c0 = card(game, t);
  // checking teaches a little (K1 by seeing a result) and leaves your scent for 3 h (traps.js)
  if (opt.id !== 'trap_pick') learnTrap(game, def.howto, { seen: true });
  switch (opt.id) {
    case 'trap_look': {
      toast(`${c0.text}${c0.cause ? `　…${c0.cause}` : ''}`);
      return;
    }
    case 'trap_bait': {
      const b = bestBait(inv, t.type, t.aim);
      if (!b) { toast('エサに なる 物（魚・ヤシの実の 身・貝・木の実・エサ団子）が ない', 'warn'); return; }
      t.bait = inv.take(b.uid, 1)[0]; t.note = null; game.sys.player.validate?.();
      const K = game.sys.knowledge?.level?.(def.howto) ?? 0, bc = baitClass(t.type, t.aim, t.bait);
      toast(`${itemDef(t.bait.id)?.name}を エサに した${K >= 2 ? (bc === 'best' ? '（いちばん 合う）' : bc === 'wrong' ? '（あまり 合わない）' : '') : ''}`, 'good');
      game.passTime(2);
      return;
    }
    case 'trap_pick': {
      T.remove(t);
      inv.addStack({ ...t.item, n: 1 }); if (t.bait) inv.addStack(t.bait);
      game.sys.player.validate?.();
      toast(`${def.name}を 回収した`);
      return;
    }
    case 'trap_reset': {
      const K = game.sys.knowledge?.level?.(def.howto) ?? 0;
      const flow = trapFlowFor(t.type, { K, reset: true });
      const mode = game.handwork?.mode?.() ?? 'auto';
      toast(`${c0.text}${c0.cause ? `　…${c0.cause}` : ''}`);
      const r = game.handwork ? await game.handwork.run(flow, { title: `${def.name}を 仕掛け直す`, key: `trap_reset:${t.type}`, scene: { trap: { id: t.type, type: t.type, K, aim: t.aim, view: mild ? 'mild' : 'normal' } } }) : { p: 0.55, extra: {}, steps: [] };
      if (r.cancelled) return;
      r.stepP = stepScores(r);
      const hurt = injuries(game, t.type, r, K, mode);
      if (r.extra.snapped || r.extra.dropped) { toast(`${hurt || '手元で はじけた'}。もう 一度`, hurt ? 'bad' : 'warn'); return; }
      t.state = 'set'; t.note = null; t.p = (t.p + r.p) / 2; t.setAt = game.clock.total; t.lastRoll = game.clock.total;
      t.marks = { ...(t.marks || {}), ...marksOf(t.type, r), triggerShallow: !!r.extra.triggerShallow, triggerDeep: !!r.extra.triggerDeep };
      if (r.extra.baited && !t.bait) { const b = bestBait(inv, t.type, t.aim); if (b) { t.bait = inv.take(b.uid, 1)[0]; game.sys.player.validate?.(); } }
      T.refresh(t);
      game.passTime(3);
      toast(`${def.name}を 仕掛け直した（${r.feel?.label || ''}）`, 'good');
      return;
    }
    case 'trap_take': {
      const who = t.catch, c = CATCH_ITEMS[who] || {}, n = t.count || 1;
      toast(`${c0.text}${c0.cause ? `　…${c0.cause}` : ''}`, 'good');
      t.state = 'sprung'; t.note = 'empty';
      const p = t.p;
      t.catch = null; t.count = 0; T.refresh(t);
      if (c.bird) {
        // a snared bird is alive: §25 step 0 (mild: 楽に して やる) and the procedure, or the skip fade
        const node = { data: { species: c.bird, diedAt: game.clock.total - 30, animal: null } };
        await interact.birdCarcass(node, { fromTrap: true });
      } else {
        // the deadfall's catch has been spoiling since it was caught; baskets hold live fish
        const fresh = t.type === 'deadfall' ? clamp(100 - (game.clock.total - (t.caughtAt ?? game.clock.total)) / 60 * 3, 30, 100) : 100;
        for (const [id, k] of Object.entries(c.items || {})) interact.gain(id, k * (TRAP_TYPES[t.type].where === 'water' ? n : 1), { fresh, rng: game.rng });
      }
      const brk = def.breakOnCatch * (1.33 - 0.6 * p) * ((game.sys.knowledge?.level?.(def.howto) ?? 0) >= 3 ? 0.8 : 1) * (t.marks?.looseKnot ? 1.2 : 1);
      if (game.rng.next() < brk) { T.remove(t); toast(`${def.name}が 壊れた（${t.type === 'snare' ? '紐が 切れた' : '棒が 折れた'}）`, 'warn'); }
      else toast(`${def.name}は はじけた まま（仕掛け直そう）`);
      learnTrap(game, def.howto, { p, caught: true });
      game.sys.player.body.addMorale?.(2, 'trap_catch');
      game.stats.trapCatches = (game.stats.trapCatches || 0) + 1;
      game.passTime(5);
      return;
    }
    default: return;
  }
}

/** a hunter partner points out a trail once per trail (§26.3) */
export function partnerSpotsTrail(game) {
  const C = game.sys.companion, T = game.sys.traps;
  if (!C?.ready || C.dead || !T || (C.sheet?.skills?.hunt ?? 0) < 5 || !C.near?.(10)) return;
  const nt = T.nearestTrail(game.player.pos.x, game.player.pos.z);
  if (!nt.trail || nt.d > 6) return;
  T.spotted = T.spotted || {};
  if (T.spotted[nt.trail.id]) return;
  T.spotted[nt.trail.id] = true;
  C.speak(TRAIL_SPOT[C.id] || 'ここ、通り道だ。');
  T.flashTrail?.(nt.trail);
  const K = game.sys.knowledge;
  const st = (game.sys.player.stats.tracks = game.sys.player.stats.tracks || { right: 0, ages: 0 });
  st.right++;
  if ((K?.level?.('howto_read_tracks') ?? 0) < 1) K?.learn?.('howto_read_tracks', 1, '仲間に 教わった');
}
