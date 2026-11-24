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
const c01 = (v) => Math.max(0, Math.min(1, v));
const norm = (x, y) => ({ x: (x - BOX.x) / BOX.w, y: (y - BOX.y) / BOX.h });
const bottomRow = (n) => Array.from({ length: n }, (_, i) => [BOX.x + BOX.w * (0.16 + (0.68 * i) / Math.max(1, n - 1)), BOX.y + BOX.h * 0.93]);
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
    out.push(step('strike', 3, { label: name('snare', 'stake', K), hint: hint('snare', 'stake', K), targets: G.stakeTargets.map(P), hid: 'stake', sync: (k, tr) => { tr.stake = c01(k.count / 3); } }));
  }
  out.push(step('hold', 4, { label: name('snare', 'bend', K), hint: hint('snare', 'bend', K), band: [0.45, 0.75], hid: 'bend',
    sync: (k, tr, hw, done) => { tr.aim = hw.extra.aim || tr.aim; tr.bend = done ? (k.dropped ? 0 : 1) : c01((hw.sc.bend ?? 0) / 0.6); tr.sprung = !!k.dropped; } }));
  if (!reset) {
    out.push(step('twist', 4, { label: name('snare', 'loop', K), hint: hint('snare', 'loop', K), tighten: true, hid: 'loop', sync: (k, tr, hw, done) => { tr.tight = done; } }));
    out.push(step('place', 1, { label: name('snare', 'size', K), hint: hint('snare', 'size', K), tokens: ['cord'], tokenAt: [P([G.loopStart.x, G.loopStart.y])], hideSlot: true, hideTokens: true, hid: 'loopPos',
      slotFrom: (x) => { const z = G.loopZones[x.aim === 'small' ? 'small' : 'bird']; const [cx, cy] = P([z.x, z.y]); const r = Math.max(14, z.r * BOX.h); return [cx, cy, r * 1.4, r * 1.4]; },
      sync: (k, tr, hw) => { const z = G.loopZones[hw.extra.aim === 'small' ? 'small' : 'bird']; const tk = k.tokens[0]; if (tk) tr.loop = { ...norm(tk.x, tk.y), r: z.r }; } }));
  }
  out.push(step('trace', 1, { mode: 'line', weight: 3, depthStop: true, trigger: true, band: G.triggerBand || [0.35, 0.65], lines: [G.trigger.map(P)], label: name('snare', 'trigger', K), hint: hint('snare', 'trigger', K), hid: 'trigger',
    sync: (k, tr, hw, done) => { if (!done) tr.trigger = k.live ?? 0; if (done && hw.extra.snapped) { tr.sprung = true; tr.bend = 0; } } }));
  out.push(step('place', 1, { weight: 0, bait: true, tokens: ['meat'], slotAt: S(G.baitSlot), hidePlaced: true, label: name('snare', 'bait', K), hint: hint('snare', 'bait', K), hid: 'bait', sync: (k, tr) => { tr.bait = k.count > 0; } }));
  if (reset) out.unshift({ kind: 'choose', n: 1, weight: 0, scene: 'trap', pick: 'noop', label: '仕掛け直す', options: [{ label: 'はじめる', value: 1 }], sync: (k, tr) => { tr.stake = 1; tr.tight = true; tr.loop = null; tr.sprung = true; } });
  return out;
}

export function deadfallFlow({ K = 0, reset = false } = {}) {
  const G = GEO.deadfall, out = [];
  if (!reset && K === 0) out.push(...guess('deadfall', 0));
  out.push(step('place', 1, { weight: 0, bait: true, tokens: ['meat'], slotAt: S(G.baitSlot), hidePlaced: true, label: name('deadfall', 'bait', K), hint: hint('deadfall', 'bait', K), hid: 'bait', sync: (k, tr) => { tr.bait = k.count > 0; } }));
  out.push(step('hold', 3, { label: name('deadfall', 'lift', K), hint: hint('deadfall', 'lift', K), band: [0.5, 0.8], hid: 'lift', sync: (k, tr, hw, done) => { tr.rockLift = done ? (k.dropped ? 0 : 1) : c01((hw.sc.rockLift ?? 0) / 0.65); } }));
  const ids = ['upright', 'diagonal', 'bait'];
  out.push(step('place', 3, { label: name('deadfall', 'assemble', K), hint: hint('deadfall', 'assemble', K), ordered: true, tokens: ['stick', 'stick', 'stick'], tokenIds: ids, tokenLabels: K >= 1 ? ['① 立て棒', '② 斜め棒', '③ エサ棒'] : ['棒', '棒', '棒'],
    tokenAt: (G.partsTray || []).map(P), slotList: G.slots.map((sl) => S(sl, 50, 40)), hideSlot: K < 2, hidePlaced: true, hid: 'assemble', sync: (k, tr) => { tr.rockLift = 1; tr.parts = (k.placedIds || []).slice(); } }));
  out.push(step('hold', 3, { weight: 3, release: 'gentle', label: name('deadfall', 'lower', K), hint: hint('deadfall', 'lower', K), band: [0.35, 0.6], hid: 'lower',
    sync: (k, tr, hw, done) => { tr.rockLift = done ? (k.dropped ? 0 : 0.92) : 1 - 0.08 * c01(k.progress); tr.set = done && !k.dropped; tr.sprung = !!k.dropped; if (k.dropped) tr.parts = []; } }));
  return out;
}

export function basketFlow(type, { K = 0, reset = false } = {}) {
  const G = GEO[type] || GEO.fish_trap, out = [];
  const start = (G.rightAngle ?? 0) + Math.PI * (0.6 + Math.random() * 0.6);
  out.push(step('place', 1, { weight: 0, bait: true, tokens: ['meat'], slotAt: [...P(G.baitCenter), 70, 60], hidePlaced: true, label: name('fish_trap', 'bait', K), hint: hint('fish_trap', 'bait', K), hid: 'bait', sync: (k, tr) => { tr.bait = k.count > 0; if (tr.mouthAngle == null) tr.mouthAngle = start; } }));
  if (!reset) out.push(step('twist', 2, { label: '中に 結ぶ', hid: 'baitTie' }));
  out.push(step('place', 1, { tokens: ['leaf'], tokenLabels: ['かご'], hideTokens: true, slotAt: S(G.trapSlot, 90, 60), hideSlot: true, rotate: { target: G.rightAngle ?? G.flowDir ?? 0, start }, rotateOnly: true, label: name('fish_trap', 'place', K), hint: hint('fish_trap', 'place', K) || 'かごの 口の 向きを 回して 決める', hid: 'place',
    tokenAt: [P([G.trapSlot.x, G.trapSlot.y])] }));
  if (!reset) {
    out.push(step('place', 3, { tokens: ['stone', 'stone', 'stone'], tokenAt: G.stonePile ? G.stonePile.map(P) : null, slotList: G.stoneSlots.map((sl) => S(sl, 50, 44)), hidePlaced: true, label: name('fish_trap', 'stones', K), hint: hint('fish_trap', 'stones', K), hid: 'stones', sync: (k, tr) => { tr.stones = k.count; } }));
    out.push(step('twist', 3, { tighten: true, label: name('fish_trap', 'rope', K), hint: hint('fish_trap', 'rope', K), hid: 'rope', sync: (k, tr, hw, done) => { tr.rope = done ? 1 : c01(k.progress); } }));
  } else out.unshift({ kind: 'choose', n: 1, weight: 0, scene: 'trap', pick: 'noop', label: '沈め直す', options: [{ label: 'はじめる', value: 1 }], sync: (k, tr) => { tr.stones = 3; tr.rope = 1; } });
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
      options: types.map((t) => ({ label: { teepee: '円すい（ティピー）', logcabin: '井げた', star: '星形' }[t] || t, value: t })), sync: (k, tr, hw) => { tr.layType = hw.extra.layType || 'teepee'; tr.placed = 0; } },
    { kind: 'place', n: 6, scene: 'trap', ordered: true, hid: 'lay', tokenAt: bottomRow(6), hidePlaced: true, sync: (k, tr, hw) => { tr.layType = hw.extra.layType || tr.layType; tr.placed = k.count; }, label: K >= 1 ? '火口 → 鉛筆の 太さ ×3 → 指の 太さ ×2' : '組む', hint: hint('firelay', 'tinder', K),
      tokens: ['fiber', 'stick', 'stick', 'stick', 'stick', 'stick'], tokenIds: ['tinder', 'pencil', 'pencil', 'pencil', 'finger', 'finger'], tokenLabels: K >= 1 ? ['火口', '細', '細', '細', '太', '太'] : null,
      slotFrom: (x) => null, slotListFrom: (x) => (G.types[x.layType] || G.types[types[0]]).slots.map((sl) => S(sl, 44, 36)), hideSlot: K < 2 },
  ];
}

// ---------------------------------------------------------------- coconut (§26.9)
export function coconutFlow({ K = 0, blade = true } = {}) {
  const G = GEO.coconut;
  const eyes = G.eyes.map((e, i) => ({ label: `目 ${i + 1}`, ok: i === (G.softEye ?? 0), spot: [...P(e), 22] }));
  return [
    blade ? step('trace', Math.min(3, G.seams.length), { mode: 'line', lines: G.seams.map((l) => l.map(P)), label: name('coconut', 'husk', Math.max(K, 1)) || '外皮を はぐ', hint: hint('coconut', 'husk', K), hid: 'husk', sync: (k, tr) => { tr.husk = c01((k.count + (k.live ?? 0)) / 3); } })
      : step('strike', 5, { targets: G.seams.map((l) => P(l[Math.floor(l.length / 2)])), label: '継ぎ目を 打つ', hint: hint('coconut', 'husk', K), hid: 'husk', sync: (k, tr) => { tr.husk = c01(k.count / 5); } }),
    { kind: 'choose', n: 1, scene: 'trap', label: name('coconut', 'eye', Math.max(K, 1)) || '柔らかい 目を 打つ', hint: K >= 2 ? hint('coconut', 'eye', K) : '3 つの 目の うち、柔らかい 1 つを 打つ', options: eyes, showAnswer: K >= 2, wrongMsg: '…固い。別の 目を 打とう', hid: 'eye', sync: (k, tr, hw, done) => { tr.husk = 1; tr.opened = done ? 1 : 0; } },
    step('strike', 4, { targets: G.equator.map(P), label: name('coconut', 'equator', Math.max(K, 1)) || '赤道を 打って 割る', hint: hint('coconut', 'equator', K), hid: 'equator', sync: (k, tr, hw, done) => { tr.crack = c01(k.count / 4); tr.halves = done && k.p >= 0.7; } }),
  ];
}

// ---------------------------------------------------------------- the fishing knot (§26.9)
export function knotFlow({ K = 0 } = {}) {
  const G = GEO.knot;
  return [
    step('twist', 5, { label: name('knot', 'wrap', Math.max(K, 1)) || '本線に 巻く', hint: hint('knot', 'wrap', K), hid: 'wrap', sync: (k, tr) => { tr.wraps = k.count; } }),
    step('place', 1, { tokens: ['cord'], tokenAt: G.tag ? [P(G.tag)] : null, slotAt: S(G.loopSlot, 50, 44), hideSlot: K < 2, hidePlaced: true, label: name('knot', 'thread', Math.max(K, 1)) || 'はしを 輪に 通す', hint: hint('knot', 'thread', K), hid: 'thread', sync: (k, tr) => { tr.wraps = 5; tr.threaded = k.count > 0; } }),
    step('twist', 1, { tighten: true, label: name('knot', 'tighten', Math.max(K, 1)) || 'しめる', hint: hint('knot', 'tighten', K), hid: 'tighten', sync: (k, tr, hw, done) => { tr.tight = done; } }),
  ];
}

// ---------------------------------------------------------------- signals (§26.9)
export function sosFlow({ K = 0 } = {}) {
  const G = GEO.sos;
  return [
    { kind: 'choose', n: 1, scene: 'trap', label: name('signal', 'color', Math.max(K, 1)) || '石の 色を 選ぶ', question: '白い 砂に 並べる なら？', showAnswer: K >= 2, hid: 'color',
      options: [{ label: '黒い 石・海藻', ok: true, value: 'dark' }, { label: '白い サンゴ', ok: false, value: 'light' }, { label: '黄色い 砂岩', ok: false, value: 'light' }], wrongMsg: '…砂に まぎれて 見えにくい',
      sync: (k, tr, hw, done) => { tr.color = done ? 'dark' : hw.extra.wrongChoices ? 'light' : tr.color; } },
    step('place', 5, { tokens: ['stone', 'stone', 'stone', 'stone', 'stone'], tokenAt: G.piles ? [P(G.piles[0])] : null, slotList: G.letterSlots.map((sl) => (Array.isArray(sl) ? [...P(sl), 44, 40] : S(sl, 44, 40))), hideSlot: K < 2, hidePlaced: true, label: name('signal', 'stones', Math.max(K, 1)) || '「S」の 線に そって 並べる', hint: hint('signal', 'stones', K), hid: 'stones', sync: (k, tr) => { tr.placed = k.count; } }),
  ];
}
export function signalFireFlow({ K = 0 } = {}) {
  const G = GEO.signal;
  return [
    step('place', 4, { tokens: ['stick', 'stick', 'stick', 'fiber'], tokenAt: bottomRow(4), slotList: G.coreSlots.map((sl) => S(sl, 44, 40)), hideSlot: K < 2, hidePlaced: true, label: name('signal', 'core', Math.max(K, 1)) || '乾いた 芯を 円すいに', hint: hint('signal', 'core', K), hid: 'core', sync: (k, tr) => { tr.placed = k.count; } }),
    step('place', 1, { tokens: ['leaf'], tokenAt: [P([0.2, 0.9])], slotAt: S(G.greenPile, 90, 60), label: name('signal', 'green', Math.max(K, 1)) || '生の 葉は わきに 積む', hint: hint('signal', 'green', K), hid: 'green' }),
  ];
}

// ---------------------------------------------------------------- reading tracks (§26.3)
export function tracksFlow({ K = 0, species, kind, age, others = [] } = {}) {
  const opts = [species, ...others].slice(0, 3).sort(() => Math.random() - 0.5).map((sp) => ({ label: TRACKS[sp]?.name || sp, ok: sp === species }));
  const out = [{ kind: 'choose', n: 1, scene: 'track', label: 'だれの？', question: K >= 1 ? (kind === 'scat' ? TRACKS[species]?.scat : TRACKS[species]?.track) || 'だれの 跡？' : 'だれの 跡？', options: opts, showAnswer: K >= 2, wrongMsg: '…ちがうかも', hid: 'who' }];
  if (K >= 2) out.push({ kind: 'choose', n: 1, scene: 'track', label: 'いつの？', question: 'いつの 跡？', options: Object.entries(TRACK_AGE).map(([k, v]) => ({ label: `${v.name}（${v.clue}）`, ok: k === age })), showAnswer: K >= 3, wrongMsg: '…ちがうかも', hid: 'when' });
  return out;
}
