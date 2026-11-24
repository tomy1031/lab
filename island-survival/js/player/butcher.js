// player/butcher.js — butchering as a hands-on procedure you learn (DESIGN §25): the flow of steps on the paper
// diagram (butcher-art.js), knowledge K0–K3 of 「解体の 手順」 in the field guide, a partner who teaches,
// and the depiction setting 「解体の 表現」 normal | mild (default) | skip. Same game time and the same average yield
// in every setting; doing it yourself moves the yield 0.9–1.08× (§25.6).
import { DIAGRAMS, lineToCanvas } from '../ui/butcher-art.js';
import { BUTCHER_TEACH, BUTCHER_HINT, BUTCHER_STEP_NAME, FIRST_KILL } from '../data/consult.js';

export const BOX = { x: 40, y: 30, w: 720, h: 450 };
const L = (pt) => lineToCanvas(pt, BOX);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** which diagram / guide entry an animal uses */
export function butcherKind(speciesId) {
  if (/fowl|bird|gull/.test(speciesId)) return { cat: 'bird', diagram: 'bird', howto: 'howto_butcher_bird' };
  if (/fish|sardine|jack|seabream|grouper|wrasse|goby|eel|trevally|snapper|mackerel|puffer/.test(speciesId)) return { cat: 'fish', diagram: 'fish', howto: 'howto_butcher_fish' };
  if (speciesId === 'boar') return { cat: 'beast', diagram: 'boar', howto: 'howto_butcher_beast' };
  if (speciesId === 'goat') return { cat: 'beast', diagram: 'goat', howto: 'howto_butcher_beast' };
  return { cat: 'beast', diagram: 'small', howto: 'howto_butcher_beast' };
}

export function viewOf(game) {
  const v = game.settings?.butcherView;
  return v === 'normal' || v === 'skip' ? v : 'mild';
}
const word = (view) => (view === 'normal' ? 'normal' : 'mild');
const keyOf = (cat, bs) => (cat === 'fish' && bs === 'gut' ? 'fish_gut' : cat === 'bird' && bs === 'gut' ? 'bird_gut' : bs);
export const stepName = (cat, bs, view) => BUTCHER_STEP_NAME[keyOf(cat, bs)]?.[word(view)] || bs;

const ORDER = { beast: ['bleed', 'open', 'gut', 'skin', 'portion'], fish: ['stun', 'scale', 'gut'], bird: ['pluck', 'gut'] };

/** the steps for one carcass (§25.2 / §25.3) */
export function butcherFlow({ kind, view, K, bledOK = true, axe = false, teach = false }) {
  const D = DIAGRAMS[kind.diagram], cat = kind.cat, out = [];
  const shown = teach ? Math.max(2, K) : K;
  const hint = (bs) => (shown >= 2 ? BUTCHER_HINT[keyOf(cat, bs)]?.[word(view)] : shown >= 1 ? stepName(cat, bs, view) : null);
  const steps = ORDER[cat].filter((bs) => bs !== 'bleed' || bledOK);
  const zones = (D.noTouch || []).map((z) => { const [x, y] = L([z.x, z.y]); return { x, y, rx: z.rx * BOX.w, ry: z.ry * BOX.w }; });
  steps.forEach((bs, i) => {
    const S = D.steps[bs] || { lines: [], points: [] };
    const base = { scene: 'carcass', bstep: bs, label: shown >= 1 ? `${S.label || i + 1}. ${stepName(cat, bs, view)}` : '？', hint: hint(bs) };
    if (shown === 0 && cat === 'beast') {
      // K0: you have to guess what comes next (§25.4)
      const wrong = ORDER.beast.filter((x) => x !== bs).sort(() => Math.random() - 0.5).slice(0, 2);
      const opts = [bs, ...wrong].sort(() => Math.random() - 0.5).map((x) => ({ label: GUESS[x] || stepName(cat, x, view), ok: x === bs }));
      out.push({ kind: 'choose', n: 1, weight: 0, ...base, label: 'つぎは どこから？', hint: '順番が 分からない。どれから やる？', options: opts });
    }
    const lines = (S.lines || []).map((l) => l.map(L));
    switch (bs) {
      case 'bleed': out.push({ kind: 'trace', n: 1, mode: 'line', lines, ...base }); break;
      case 'open': out.push({ kind: 'trace', n: 1, mode: 'line', lines, noTouch: zones, ...base }); break;
      case 'gut': {
        if (lines.length) out.push({ kind: 'trace', n: 1, mode: 'line', lines, noTouch: cat !== 'beast' ? zones : null, ...base });
        const [from, to] = (S.points || []).map(L);
        out.push({ kind: 'place', n: 1, tokens: ['leaf'], tokenAt: [from || [400, 250]], slotAt: [...(to || [400, 440]), 130, 60], firm: true, ...base, hint: shown >= 2 ? (view === 'normal' ? 'つぶさない ように そっと 取り出して 葉の 上へ' : '中身を そっと 取り出して 葉の 上へ') : base.hint });
        break;
      }
      case 'skin': out.push({ kind: 'trace', n: Math.min(3, lines.length), mode: 'line', lines, ...base }); out.push({ kind: 'place', n: 1, tokens: ['cloth'], tokenAt: [L([0.55, 0.42])], slotAt: [...L([0.18, 0.9]), 130, 60], ...base, hint: shown >= 2 ? 'ゆっくり 一定に 引いて 外す' : base.hint }); break;
      case 'portion': { const j = (D.joints || []).slice(0, axe ? 2 : 4).map(L); out.push({ kind: 'strike', n: j.length || 2, targets: j.length ? j : [[400, 250]], ...base }); break; }
      case 'stun': out.push({ kind: 'strike', n: 1, targets: (S.points || []).map(L), ...base }); break;
      case 'scale': out.push({ kind: 'rub', n: 6, ...base }); break;
      case 'pluck': { const pts = (S.points || []).map(L); out.push({ kind: 'place', n: Math.max(1, pts.length), tokens: pts.map(() => 'feather'), tokenAt: pts, slotAt: [...L([0.2, 0.88]), 140, 70], ...base }); break; }
      default: break;
    }
  });
  return out;
}
const GUESS = { bleed: 'のどから？', open: '腹から？', gut: '中から？', skin: '皮から？', portion: '脚から？' };

/** knowledge bookkeeping (§25.4): returns the new level */
export function learnButcher(game, kind, { p = 0.55, skipped = false, teach = false } = {}) {
  const P = game.sys.player, K = game.sys.knowledge;
  const st = (P.stats.butcher = P.stats.butcher || {});
  const r = (st[kind.cat] = st[kind.cat] || { n: 0, real: 0, good: 0 });
  r.n += skipped ? 0.5 : 1;
  if (!skipped) r.real += 1;
  const cur = K?.level?.(kind.howto) ?? 0;
  let lv = cur;
  if (r.n >= 1) lv = Math.max(lv, 1);
  if (!skipped && (r.real >= 3 || teach)) lv = Math.max(lv, teach ? Math.min(2, cur + 1) : 2);
  if (cur >= 2 && !skipped) { if (p >= 0.6) r.good++; if (r.good >= (kind.cat === 'fish' ? 5 : 3)) lv = 3; }
  if (skipped) lv = Math.min(lv, Math.max(cur, 1));
  if (lv > cur) K?.learn?.(kind.howto, lv, skipped ? '省略' : teach ? '教わった' : 'やって 覚えた');
  return lv;
}

/** a partner who can teach this (§25.4: hunting Lv5+, fish: fishing Lv5+), standing near */
export function teacher(game, kind) {
  const C = game.sys.companion;
  if (!C?.ready || C.dead || !C.near?.(6)) return null;
  const sk = C.sheet?.skills || {};
  return (kind.cat === 'fish' ? sk.fish : sk.hunt) >= 5 ? C : null;
}

/** the partner says the next step (keyless line; with Live, a [STATE] note) */
export function teachLine(C, kind, bs, view) {
  const t = BUTCHER_TEACH[C.id]?.[keyOf(kind.cat, bs)]?.[word(view)];
  if (!t) return;
  if (C.talk?.state === 'live') C.talk.event(`[STATE] 解体：${stepName(kind.cat, bs, view)}（プレイヤーに 次の やり方を 短く 教えて）`, true, true);
  else C.speak(t);
}

export function firstKillLine(game) {
  const C = game.sys.companion;
  if (C?.ready && !C.dead && C.near?.(15) && FIRST_KILL[C.id]) setTimeout(() => C.speak(FIRST_KILL[C.id]), 1400);
}

/** 省略: a 2-second fade with one line (§25.5) */
export function skipFade(text = 'ていねいに 下ごしらえを した。') {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'bv-skip';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 400); }, 1700);
  });
}

/** per-step performance from the hand-work result (steps that were skipped count 0.3: §25.2) */
export function stepScores(r) {
  const by = {};
  for (const s of r.steps || []) if (s.kind !== 'choose') (by[s.bstep] = by[s.bstep] || []).push(s.p);
  const out = {};
  for (const [k, v] of Object.entries(by)) out[k] = v.reduce((a, b) => a + b, 0) / v.length;
  return out;
}
export { clamp01 };
