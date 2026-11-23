// player/trapwork.js — setting traps by hand and checking them (DESIGN §26): the work-table flow for each trap,
// knowledge of 「罠の 仕掛け方」 (K0–K3), what you find when you check, collecting the catch (birds go through the
// §25 procedure), baiting, resetting and taking the trap back.
import { TRAP_TYPES, CATCH_ITEMS, CATCH_NAMES } from '../sim/traps.js';
import { itemDef } from '../data/items.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const TRAP_ITEMS = new Set(Object.keys(TRAP_TYPES));
const HOWTO_NAME = { howto_trap_snare: 'くくり罠の 仕掛け方', howto_trap_deadfall: '石落としの 組み方', howto_trap_fish: 'かごの 仕掛け方' };

/** the bait you have: strong smell first (fish, guts, bait balls), then any food */
export function bestBait(inv) {
  const score = (s) => { const d = itemDef(s.id); if (!d) return 0; if (/bait_ball|organ|guts/.test(s.id)) return 4; if (d.food && /fish|sardine|goby|wrasse|jack|eel/.test(s.id)) return 3; if (d.food && !d.food.poison && !/coconut$/.test(s.id)) return 2; return 0; };
  return inv.stacks.filter((s) => score(s) > 0).sort((a, b) => score(b) - score(a))[0] || null;
}

/** the point in front of the player where a trap goes (water traps: up to 2.5 m ahead) */
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

/** inventory → 「仕掛ける」 */
export async function setTrap(game, uid) {
  const inv = game.sys.player.inv, s = inv.get(uid), T = game.sys.traps;
  if (!s || !T || !TRAP_ITEMS.has(s.id)) return false;
  const type = s.id, def = TRAP_TYPES[type];
  const at = spotAhead(game, type);
  if (!at.spot?.ok) { game.bus.emit('toast', { text: `${def.name}：${at.spot?.reason || 'ここには 仕掛けられない'}`, kind: 'warn' }); return false; }
  const K0 = game.sys.knowledge?.level?.(def.howto) ?? 0;
  const K = inv.find('guide') ? Math.max(K0, 1) : K0;
  const teach = teacherFor(game, type);
  const { trapFlow } = await import('../data/handwork.js');
  const flow = trapFlow(type, { K: teach ? Math.max(2, K) : K, trail: at.spot.trail, water: at.spot.water });
  const r = game.handwork
    ? await game.handwork.run(flow, { title: `${def.name}を 仕掛ける`, key: `trap:${type}`, tolMul: [0.85, 1, 1.1, 1.2][K], scene: { trap: { type, K: teach ? Math.max(2, K) : K, onTrail: at.spot.trail < 2.5, water: at.spot.water, depth: at.spot.depth } }, onStep: (st) => { if (teach && st.tip) teach.speak(st.tip); } })
    : { ok: true, p: 0.55, extra: {}, steps: [] };
  if (r.cancelled) return false;
  const part = inv.take(uid, 1)[0];
  game.sys.player.validate?.();
  let bait = null;
  if (r.extra.baited) { const b = bestBait(inv); if (b) bait = inv.take(b.uid, 1)[0]; }
  const t = T.add(type, at.x, at.z, { stack: part, p: r.p, K, bait, spot: at.spot });
  if (r.extra.snapped) {
    // §26: the trigger went off under your fingers
    t.state = 'sprung'; t.note = 'empty'; T.refresh(t);
    game.sys.player.body.injure('bruise', 1, 2, `${def.name}が 手元で はじけた`);
    game.bus.emit('toast', { text: `${def.name}が 手元で はじけた！（指を 打った）仕掛け直そう`, kind: 'bad' });
  }
  game.passTime(Math.round((type === 'deadfall' ? 25 : type === 'snare' ? 20 : 15) * (r.feel?.timeMul ?? 1)));
  learnTrap(game, def.howto, { p: r.p, teach: !!teach });
  if (teach) teach.adjust?.(0, 0.5);
  const where = t.water ? '' : t.onTrail ? '獣道の 上に' : '（獣道から 外れて いる）';
  if (!r.extra.snapped) game.bus.emit('toast', { text: `${def.name}を 仕掛けた${where ? `：${where}` : ''}・${r.feel?.label || ''}${bait ? `・エサ：${itemDef(bait.id)?.name}` : def.baitNeeded ? '・エサが ない（かかりにくい）' : ''}`, kind: 'good' });
  game.stats.trapsSet = (game.stats.trapsSet || 0) + 1;
  return true;
}

/** a partner who knows traps (hunting Lv5+, fish traps: fishing Lv5+) nearby */
function teacherFor(game, type) {
  const C = game.sys.companion;
  if (!C?.ready || C.dead || !C.near?.(6)) return null;
  const sk = C.sheet?.skills || {};
  return (TRAP_TYPES[type].where === 'water' ? sk.fish : sk.hunt) >= 5 ? C : null;
}

/** §26 knowledge: set once → K1, a catch you collect or 3 sets → K2, 3 catches set well (p ≥ 0.6) → K3; a teacher lifts to K2 */
export function learnTrap(game, howto, { p = 0.55, caught = false, teach = false } = {}) {
  const P = game.sys.player, K = game.sys.knowledge;
  const st = (P.stats.traps = P.stats.traps || {});
  const r = (st[howto] = st[howto] || { set: 0, caught: 0, good: 0 });
  if (caught) { r.caught++; if (p >= 0.6) r.good++; } else r.set++;
  const cur = K?.level?.(howto) ?? 0;
  let lv = Math.max(cur, 1);
  if (r.set >= 3 || r.caught >= 1 || teach) lv = Math.max(lv, 2);
  if (cur >= 2 && r.good >= 3) lv = 3;
  if (lv > cur) { K?.learn?.(howto, lv, caught ? '獲物が かかった' : teach ? '教わった' : 'やって 覚えた'); game.bus.emit('toast', { text: `図鑑「${HOWTO_NAME[howto]}」が K${lv} に`, kind: 'info' }); }
  if (howto === 'howto_trap_snare') game.sys.traps?.updateTrailVisibility?.();
  return lv;
}

/** E on a trap */
export async function trapAction(game, interact, t, opt) {
  const T = game.sys.traps, inv = game.sys.player.inv, def = TRAP_TYPES[t.type];
  const toast = (text, kind = 'info') => game.bus.emit('toast', { text, kind });
  switch (opt.id) {
    case 'trap_look': {
      const K = game.sys.knowledge?.level?.(def.howto) ?? 0;
      const hint = t.water ? (K >= 2 ? '口が 流れの 下手を 向いて いれば 魚が 入る。重しが あるか 確かめた' : 'じっと 待とう') : t.onTrail ? (K >= 2 ? '獣道の 上。においが 消えれば かかりやすい' : 'じっと 待とう') : K >= 1 ? '獣道から 外れて いる。踏まれた 草の 筋の 上に 仕掛け直すと いい' : 'じっと 待とう';
      toast(`${def.name}：${hint}`);
      return;
    }
    case 'trap_bait': {
      const b = bestBait(inv);
      if (!b) { toast('エサに なる 物（魚・中身・果物・エサ団子）が ない', 'warn'); return; }
      t.bait = inv.take(b.uid, 1)[0]; game.sys.player.validate?.();
      toast(`${itemDef(t.bait.id)?.name}を エサに した`, 'good');
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
      const { trapFlow } = await import('../data/handwork.js');
      const K = game.sys.knowledge?.level?.(def.howto) ?? 0;
      const flow = trapFlow(t.type, { K, reset: true, trail: t.onTrail ? 0 : 9, water: t.water });
      const r = game.handwork ? await game.handwork.run(flow, { title: `${def.name}を 仕掛け直す`, key: `trap_reset:${t.type}`, scene: { trap: { type: t.type, K, onTrail: t.onTrail, water: t.water } } }) : { p: 0.55, extra: {} };
      if (r.cancelled) return;
      if (r.extra.snapped) { game.sys.player.body.injure('bruise', 1, 2, `${def.name}が はじけた`); toast('手元で はじけた！ もう 一度', 'bad'); return; }
      t.state = 'set'; t.note = null; t.p = (t.p + r.p) / 2; t.setAt = game.clock.total; t.lastRoll = game.clock.total;
      if (game.rng.next() < 0.1 * (1.2 - r.p)) { t.dur = (t.dur ?? 10) - 3; }
      T.refresh(t);
      game.passTime(8);
      toast(`${def.name}を 仕掛け直した（${r.feel?.label || ''}）`, 'good');
      return;
    }
    case 'trap_take': {
      const who = t.catch, c = CATCH_ITEMS[who] || {};
      const mild = (game.settings?.butcherView || 'mild') !== 'normal';
      t.state = 'sprung'; t.note = 'empty';
      const p = t.p;
      t.catch = null; T.refresh(t);
      if (c.bird) {
        // a snared bird: through the §25 procedure (or the skip fade)
        const node = { data: { species: c.bird, diedAt: game.clock.total - 30, animal: null } };
        await interact.birdCarcass(node, { fromTrap: true });
      } else {
        for (const [id, n] of Object.entries(c.items || {})) interact.gain(id, n, { fresh: 95, rng: game.rng });
      }
      toast(`${mild ? '' : ''}${CATCH_NAMES[who] || '獲物'}を ${mild ? '取り出した' : '取った'}。${def.name}は はじけた まま（仕掛け直そう）`, 'good');
      if (game.rng.next() < def.breakOnCatch) { t.dur = 0; T.remove(t); toast(`${def.name}が 壊れた（紐が 切れた）`, 'warn'); }
      learnTrap(game, def.howto, { p, caught: true });
      game.stats.trapCatches = (game.stats.trapCatches || 0) + 1;
      game.passTime(5);
      return;
    }
    default: return;
  }
}
