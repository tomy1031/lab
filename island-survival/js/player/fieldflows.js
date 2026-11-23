// player/fieldflows.js — the work-table flows for knowledge-based field craft (DESIGN §26): traps (snare, deadfall,
// fish trap / crab pot), the fire lay, opening a coconut, the fishing knot, SOS stones / the signal fire, reading tracks.
// Geometry comes from the diagrams in ui/trap-art.js (normalized to the 720×450 box at (40, 30)).
import { GEO } from '../ui/trap-art.js';
import { TRAP_STEP, K0_GUESS, TRACKS, TRACK_AGE } from '../data/fieldcraft.js';

export const BOX = { x: 40, y: 30, w: 720, h: 450 };
const P = (pt) => [BOX.x + pt[0] * BOX.w, BOX.y + pt[1] * BOX.h];
/** a slot {x,y,w,h} (normalized) → [cx, cy, w, h] in canvas px */
const S = (sl, minW = 60, minH = 50) => [BOX.x + sl.x * BOX.w, BOX.y + sl.y * BOX.h, Math.max(minW, (sl.w ?? 0.1) * BOX.w), Math.max(minH, (sl.h ?? 0.1) * BOX.h)];
const step = (kind, n, extra) => ({ kind, n, scene: 'trap', ...extra });
const name = (g, k, K) => (K >= 1 ? TRAP_STEP[g]?.[k]?.name || '' : '？');
const hint = (g, k, K) => (K >= 2 ? TRAP_STEP[g]?.[k]?.hint || null : null);
const guess = (g, correct) => {
  const opts = (K0_GUESS[g] || []).map((label, i) => ({ label, ok: i === correct }));
  return opts.length ? [{ kind: 'choose', n: 1, weight: 0, scene: 'trap', label: 'つぎは どこから？', hint: '順番が 分からない。どれから やる？', options: opts }] : [];
};

// ---------------------------------------------------------------- traps (§26.5)
export function snareFlow({ K = 0, reset = false, trailUsers = [] } = {}) {
  const G = GEO.snare, out = [];
  if (!reset) {
    if (K === 0) out.push(...guess('snare', 0));
    out.push({ kind: 'choose', n: 1, weight: 0, scene: 'trap', pick: 'aim', label: name('snare', 'aim', Math.max(K, 1)) || 'ねらいを 決める', question: 'なにを ねらう？',
      hint: K >= 2 && trailUsers.length ? `この 道を 通るのは：${trailUsers.map((u) => TRACKS[u]?.name || u).join('・')}` : null,
      options: [{ label: '鳥（野鶏・海鳥）', value: 'bird' }, { label: '小さい けもの', value: 'small' }] });
    out.push(step('strike', 3, { label: name('snare', 'stake', K), hint: hint('snare', 'stake', K), targets: G.stakeTargets.map(P), hid: 'stake' }));
  }
  out.push(step('hold', 4, { label: name('snare', 'bend', K), hint: hint('snare', 'bend', K), band: [0.45, 0.75], hid: 'bend' }));
  if (!reset) {
    out.push(step('twist', 4, { label: name('snare', 'loop', K), hint: hint('snare', 'loop', K), tighten: true, hid: 'loop' }));
    out.push(step('place', 1, { label: name('snare', 'size', K), hint: hint('snare', 'size', K), tokens: ['cord'], tokenAt: [P([G.loopStart.x, G.loopStart.y])], hideSlot: K < 2, hid: 'loopPos',
      slotFrom: (x) => { const z = G.loopZones[x.aim === 'small' ? 'small' : 'bird']; const [cx, cy] = P([z.x, z.y]); const r = Math.max(26, z.r * BOX.w); return [cx, cy, r * 2, r * 2]; } }));
  }
  out.push(step('trace', 1, { mode: 'line', weight: 3, depthStop: true, trigger: true, band: G.triggerBand || [0.35, 0.65], lines: [G.trigger.map(P)], label: name('snare', 'trigger', K), hint: hint('snare', 'trigger', K), hid: 'trigger' }));
  out.push(step('place', 1, { weight: 0, bait: true, tokens: ['meat'], slotAt: S(G.baitSlot), label: name('snare', 'bait', K), hint: hint('snare', 'bait', K), hid: 'bait' }));
  return out;
}

export function deadfallFlow({ K = 0, reset = false } = {}) {
  const G = GEO.deadfall, out = [];
  if (!reset && K === 0) out.push(...guess('deadfall', 0));
  out.push(step('place', 1, { weight: 0, bait: true, tokens: ['meat'], slotAt: S(G.baitSlot), label: name('deadfall', 'bait', K), hint: hint('deadfall', 'bait', K), hid: 'bait' }));
  out.push(step('hold', 3, { label: name('deadfall', 'lift', K), hint: hint('deadfall', 'lift', K), band: [0.5, 0.8], hid: 'lift' }));
  const ids = ['upright', 'diagonal', 'bait'];
  out.push(step('place', 3, { label: name('deadfall', 'assemble', K), hint: hint('deadfall', 'assemble', K), ordered: true, tokens: ['stick', 'stick', 'stick'], tokenIds: ids, tokenLabels: K >= 1 ? ['① 立て棒', '② 斜め棒', '③ エサ棒'] : ['棒', '棒', '棒'],
    tokenAt: (G.partsTray || []).map(P), slotList: G.slots.map((sl) => S(sl, 50, 40)), hideSlot: K < 2, hid: 'assemble' }));
  out.push(step('hold', 3, { weight: 3, release: 'gentle', label: name('deadfall', 'lower', K), hint: hint('deadfall', 'lower', K), band: [0.35, 0.6], hid: 'lower' }));
  return out;
}

export function basketFlow(type, { K = 0, reset = false } = {}) {
  const G = GEO[type] || GEO.fish_trap, out = [];
  out.push(step('place', 1, { weight: 0, bait: true, tokens: ['meat'], slotAt: [...P(G.baitCenter), 70, 60], label: name('fish_trap', 'bait', K), hint: hint('fish_trap', 'bait', K), hid: 'bait' }));
  if (!reset) out.push(step('twist', 2, { label: '中に 結ぶ', hid: 'baitTie' }));
  out.push(step('place', 1, { tokens: ['leaf'], tokenLabels: ['かご'], slotAt: S(G.trapSlot, 90, 60), rotate: { target: G.rightAngle ?? G.flowDir ?? 0, start: (G.rightAngle ?? 0) + Math.PI * (0.6 + Math.random() * 0.6) }, label: name('fish_trap', 'place', K), hint: hint('fish_trap', 'place', K), hid: 'place' }));
  if (!reset) {
    out.push(step('place', 3, { tokens: ['stone', 'stone', 'stone'], slotList: G.stoneSlots.map((sl) => S(sl, 50, 44)), label: name('fish_trap', 'stones', K), hint: hint('fish_trap', 'stones', K), hid: 'stones' }));
    out.push(step('twist', 3, { tighten: true, label: name('fish_trap', 'rope', K), hint: hint('fish_trap', 'rope', K), hid: 'rope' }));
  }
  return out;
}

export function trapFlowFor(type, opts) {
  if (type === 'snare') return snareFlow(opts);
  if (type === 'deadfall') return deadfallFlow(opts);
  return basketFlow(type, opts);
}

// ---------------------------------------------------------------- the fire lay (§26.9)
export const LAY_MUL = { teepee: 1.1, logcabin: 1.0, star: 0.9 };
export function fireLayFlow({ K = 0 } = {}) {
  const G = GEO.firelay;
  const types = Object.keys(G.types);
  return [
    { kind: 'choose', n: 1, weight: 0, scene: 'trap', pick: 'layType', label: name('firelay', 'type', Math.max(K, 1)) || '組み方を 選ぶ', question: 'どう 組む？',
      options: types.map((t) => ({ label: { teepee: '円すい（ティピー）', logcabin: '井げた', star: '星形' }[t] || t, value: t })) },
    { kind: 'place', n: 6, scene: 'trap', ordered: true, hid: 'lay', label: K >= 1 ? '火口 → 鉛筆の 太さ ×3 → 指の 太さ ×2' : '組む', hint: hint('firelay', 'tinder', K),
      tokens: ['fiber', 'stick', 'stick', 'stick', 'stick', 'stick'], tokenIds: ['tinder', 'pencil', 'pencil', 'pencil', 'finger', 'finger'], tokenLabels: K >= 1 ? ['火口', '細', '細', '細', '太', '太'] : null,
      slotFrom: (x) => null, slotListFrom: (x) => (G.types[x.layType] || G.types[types[0]]).slots.map((sl) => S(sl, 44, 36)), hideSlot: K < 2 },
  ];
}

// ---------------------------------------------------------------- coconut (§26.9)
export function coconutFlow({ K = 0, blade = true } = {}) {
  const G = GEO.coconut;
  const eyes = G.eyes.map((e, i) => ({ label: `目 ${i + 1}`, ok: i === (G.softEye ?? 0), spot: [...P(e), 22] }));
  return [
    blade ? step('trace', Math.min(3, G.seams.length), { mode: 'line', lines: G.seams.map((l) => l.map(P)), label: name('coconut', 'husk', Math.max(K, 1)) || '外皮を はぐ', hint: hint('coconut', 'husk', K), hid: 'husk' })
      : step('strike', 5, { targets: G.seams.map((l) => P(l[Math.floor(l.length / 2)])), label: '継ぎ目を 打つ', hint: hint('coconut', 'husk', K), hid: 'husk' }),
    { kind: 'choose', n: 1, scene: 'trap', label: name('coconut', 'eye', Math.max(K, 1)) || '柔らかい 目を 打つ', hint: K >= 2 ? hint('coconut', 'eye', K) : '3 つの 目の うち、柔らかい 1 つを 打つ', options: eyes, showAnswer: K >= 2, wrongMsg: '…固い。別の 目を 打とう', hid: 'eye' },
    step('strike', 4, { targets: G.equator.map(P), label: name('coconut', 'equator', Math.max(K, 1)) || '赤道を 打って 割る', hint: hint('coconut', 'equator', K), hid: 'equator' }),
  ];
}

// ---------------------------------------------------------------- the fishing knot (§26.9)
export function knotFlow({ K = 0 } = {}) {
  const G = GEO.knot;
  return [
    step('twist', 5, { label: name('knot', 'wrap', Math.max(K, 1)) || '本線に 巻く', hint: hint('knot', 'wrap', K), hid: 'wrap' }),
    step('place', 1, { tokens: ['cord'], slotAt: S(G.loopSlot, 50, 44), hideSlot: K < 2, label: name('knot', 'thread', Math.max(K, 1)) || 'はしを 輪に 通す', hint: hint('knot', 'thread', K), hid: 'thread' }),
    step('twist', 1, { tighten: true, label: name('knot', 'tighten', Math.max(K, 1)) || 'しめる', hint: hint('knot', 'tighten', K), hid: 'tighten' }),
  ];
}

// ---------------------------------------------------------------- signals (§26.9)
export function sosFlow({ K = 0 } = {}) {
  const G = GEO.sos;
  return [
    { kind: 'choose', n: 1, scene: 'trap', label: name('signal', 'color', Math.max(K, 1)) || '石の 色を 選ぶ', question: '白い 砂に 並べる なら？', showAnswer: K >= 2, hid: 'color',
      options: [{ label: '黒い 石・海藻', ok: true }, { label: '白い サンゴ', ok: false }, { label: '黄色い 砂岩', ok: false }], wrongMsg: '…砂に まぎれて 見えにくい' },
    step('place', 5, { tokens: ['stone', 'stone', 'stone', 'stone', 'stone'], slotList: G.letterSlots.map((sl) => S(sl, 44, 40)), hideSlot: K < 2, label: name('signal', 'stones', Math.max(K, 1)) || '「S」の 線に そって 並べる', hint: hint('signal', 'stones', K), hid: 'stones' }),
  ];
}
export function signalFireFlow({ K = 0 } = {}) {
  const G = GEO.signal;
  return [
    step('place', 4, { tokens: ['stick', 'stick', 'stick', 'fiber'], slotList: G.coreSlots.map((sl) => S(sl, 44, 40)), hideSlot: K < 2, label: name('signal', 'core', Math.max(K, 1)) || '乾いた 芯を 円すいに', hint: hint('signal', 'core', K), hid: 'core' }),
    step('place', 1, { tokens: ['leaf'], slotAt: S(G.greenPile, 90, 60), label: name('signal', 'green', Math.max(K, 1)) || '生の 葉は わきに 積む', hint: hint('signal', 'green', K), hid: 'green' }),
  ];
}

// ---------------------------------------------------------------- reading tracks (§26.3)
export function tracksFlow({ K = 0, species, kind, age, others = [] } = {}) {
  const opts = [species, ...others].slice(0, 3).sort(() => Math.random() - 0.5).map((sp) => ({ label: TRACKS[sp]?.name || sp, ok: sp === species }));
  const out = [{ kind: 'choose', n: 1, scene: 'track', label: 'だれの？', question: K >= 1 ? (kind === 'scat' ? TRACKS[species]?.scat : TRACKS[species]?.track) || 'だれの 跡？' : 'だれの 跡？', options: opts, showAnswer: K >= 2, wrongMsg: '…ちがうかも', hid: 'who' }];
  if (K >= 2) out.push({ kind: 'choose', n: 1, scene: 'track', label: 'いつの？', question: 'いつの 跡？', options: Object.entries(TRACK_AGE).map(([k, v]) => ({ label: `${v.name}（${v.clue}）`, ok: k === age })), showAnswer: K >= 3, wrongMsg: '…ちがうかも', hid: 'when' });
  return out;
}
