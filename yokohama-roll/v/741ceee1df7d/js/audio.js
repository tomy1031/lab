// audio.js — every sound in ハマころ！, synthesised live with the Web Audio API.
//
// No audio files, no libraries. All five music pieces below are original compositions written for
// this game (melodies, chord changes and arrangements); none of them quotes or imitates an existing
// song or game soundtrack.
//
//   const audio = new GameAudio();
//   button.onclick = () => audio.start().then(() => audio.setMusic('title'));
//
// Music runs on a lookahead sequencer: a cheap timer wakes every 25 ms and schedules the notes of the
// next ~120 ms against AudioContext time, so timing never depends on the timer's jitter. Songs are
// compiled once into per-step event lists and loop seamlessly (the step clock never resets).
// Every method is safe to call before start(): it simply does nothing (setMusic remembers the track).

const MUSIC_VOL = 0.35;
const SFX_VOL = 0.6;
const LOOKAHEAD = 0.12; // seconds of music scheduled ahead while the tab is visible
const TICK_MS = 25;
const XFADE = 1.5; // seconds
const MAX_SFX_VOICES = 48;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0); // NaN → 0

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hold an AudioParam at its current value so new automation can start from there without a click.
function hold(param, now) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else {
    const v = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(v, now);
  }
}

// ───────────────────────────── notes, chords, melodies ─────────────────────────────

const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pc = (s) => (PCS[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0) + 12) % 12;
function note(s) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return pc(m[1]) + (Number(m[2]) + 1) * 12; // C4 = 60
}

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], sus: [0, 5, 7], add9: [0, 4, 7, 14],
  maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], 6: [0, 4, 7, 9],
  m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 17], m6: [0, 3, 7, 9],
  7: [0, 4, 7, 10], 9: [0, 4, 7, 10, 14], 13: [0, 4, 7, 10, 14, 21], '7b9': [0, 4, 7, 10, 13],
  '7sus': [0, 5, 7, 10], '9sus': [0, 5, 7, 10, 14], '13sus': [0, 5, 10, 14, 21],
};
function chord(sym) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  const iv = m && QUAL[m[2]];
  if (!iv) throw new Error('bad chord ' + sym);
  const root = pc(m[1]);
  return { root, iv, bass: m[3] ? pc(m[3]) : root };
}
// Close voicing in [low, low+11]; jazz-style rootless when the chord has 4+ tones.
function voice(ch, low, rootless = true, max = 4) {
  let ivs = ch.iv.slice();
  if (rootless && ivs.length >= 4) ivs = ivs.filter((x) => x !== 0);
  if (ivs.length > max) ivs = ivs.filter((x) => x !== 7);
  if (ivs.length > max) ivs = ivs.filter((x) => x !== 0);
  ivs = ivs.slice(0, max);
  const out = ivs.map((iv) => {
    const p = (ch.root + iv) % 12;
    return low + ((((p - low) % 12) + 12) % 12);
  });
  return [...new Set(out)].sort((a, b) => a - b);
}
const bassNote = (ch, lo) => lo + ((((ch.bass - lo) % 12) + 12) % 12);

// "C5:2 D5:1 -:3 | ..." → [{s, m, d}] in steps; '|' marks (and checks) bar lines.
function mel(str, spb, where) {
  const out = [];
  let s = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') {
      if (s % spb) console.warn(`[audio] ${where}: bar line at step ${s} is off the grid`);
      continue;
    }
    const [nm, d] = tok.split(':');
    const dur = Number(d);
    if (nm !== '-') out.push({ s, m: note(nm), d: dur });
    s += dur;
  }
  out.len = s;
  return out;
}

const pentaCache = {};
function penta(keyPc) {
  if (!pentaCache[keyPc]) {
    const pcs = [0, 2, 4, 7, 9].map((x) => (x + keyPc) % 12);
    const out = [];
    for (let m = 36; m <= 108; m++) if (pcs.includes(m % 12)) out.push(m);
    pentaCache[keyPc] = out;
  }
  return pentaCache[keyPc];
}
function nearestIdx(list, m) {
  let best = 0;
  for (let i = 1; i < list.length; i++) if (Math.abs(list[i] - m) < Math.abs(list[best] - m)) best = i;
  return best;
}

// ───────────────────────────── song compiler helpers ─────────────────────────────

const BUSES = ['drums', 'bass', 'keys', 'pad', 'brass', 'lead', 'pluck', 'bell'];
// [gain, pan, reverb send]
const DEFAULT_MIX = {
  drums: [0.8, 0, 0.06], bass: [0.85, 0, 0.02], keys: [0.6, -0.12, 0.2], pad: [0.4, 0, 0.3],
  brass: [0.5, 0.18, 0.16], lead: [0.55, 0.06, 0.2], pluck: [0.45, -0.28, 0.25], bell: [0.35, 0.3, 0.35],
};
const BUS_OF = {
  kick: 'drums', snare: 'drums', hat: 'drums', clap: 'drums', rim: 'drums', brush: 'drums', tom: 'drums',
  wood: 'drums', crash: 'drums', gong: 'drums', timp: 'drums', bass: 'bass', ep: 'keys', pad: 'pad',
  brass: 'brass', lead: 'lead', whistle: 'lead', erhu: 'lead', pluck: 'pluck', bell: 'bell',
};

function makeSong(o) {
  const s = { swing: 0, loopStartBar: 0, autopan: 0, delay: null, ...o };
  s.mix = { ...DEFAULT_MIX, ...(o.mix || {}) };
  s.length = s.bars * s.spb;
  s.loopStart = s.loopStartBar * s.spb;
  s.stepDur = 60 / s.bpm / s.stepsPerBeat;
  s.events = [];
  s.add = (step, e) => {
    if (step >= 0 && step < s.length) (s.events[step] || (s.events[step] = [])).push(e);
  };
  return s;
}
function finalize(s) {
  for (let i = 0; i < s.length; i++) if (!s.events[i]) s.events[i] = [];
  delete s.add;
  return s;
}
function chordTrack(list, spb) {
  const segs = list.map((b) => b.split('|').map(chord));
  const bar = (b) => segs[((b % segs.length) + segs.length) % segs.length];
  return {
    at(b, st) {
      const sg = bar(b);
      return sg[Math.min(sg.length - 1, Math.floor((st * sg.length) / spb))];
    },
    segs(b) {
      const sg = bar(b), L = spb / sg.length;
      return sg.map((ch, k) => ({ ch, st: k * L, len: L }));
    },
  };
}
const VEL = { x: 1, X: 1.2, o: 0.6, O: 0.8, g: 0.28 };
function pat(s, b, inst, str, extra) {
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '.') continue;
    const e = { i: inst, v: VEL[c] ?? 1, ...(extra || {}) };
    if (c === 'O') e.x = 'open';
    s.add(b * s.spb + i, e);
  }
}
// Bass template, one char per step: R root, O octave (slap pop), 5 fifth, 7 seventh, 3 third,
// A chromatic approach from below to the next chord, '-' hold, '.' rest.
function addBass(s, ct, b, tpl, o = {}) {
  const lo = o.lo ?? 36;
  for (let i = 0; i < tpl.length; i++) {
    const c = tpl[i];
    if (c === '.' || c === '-') continue;
    let d = 1;
    while (tpl[i + d] === '-') d++;
    const ch = ct.at(b, i), r = bassNote(ch, lo);
    let m = r;
    if (c === 'O') m = r + 12;
    else if (c === '5') m = r + 7;
    else if (c === '7') m = r + (ch.iv.includes(11) ? 11 : 10);
    else if (c === '3') m = r + (ch.iv.includes(3) ? 3 : 4);
    else if (c === 'A') m = bassNote(i + 1 < s.spb ? ct.at(b, i + 1) : ct.at(b + 1, 0), lo) - 1;
    s.add(b * s.spb + i, { i: 'bass', n: m, d: d * (o.leg ?? 0.85), v: (o.v ?? 0.8) * (c === 'O' ? 1.1 : 1), x: o.x, pop: c === 'O' });
  }
}
// Chord hits [[step, durSteps, vel], ...] voiced from the chord sounding at that step.
function addComp(s, ct, b, hits, inst, o = {}) {
  const segs = ct.segs(b);
  for (const [st, d, v] of hits) {
    const sg = segs.find((x) => st >= x.st && st < x.st + x.len) || segs[segs.length - 1];
    const dd = Math.min(d, sg.st + sg.len - st);
    s.add(b * s.spb + st, { i: inst, n: voice(sg.ch, o.low ?? 57, o.rootless ?? true, o.max ?? 4), d: dd, v: v * (o.v ?? 1), x: o.x, b: o.b });
  }
}
function addPad(s, ct, b, o = {}) {
  for (const sg of ct.segs(b)) {
    s.add(b * s.spb + sg.st, { i: 'pad', n: voice(sg.ch, o.low ?? 57, o.rootless ?? false, o.max ?? 4), d: sg.len * (o.leg ?? 1), v: o.v ?? 0.5, x: o.x });
  }
}
function addMel(s, bar0, str, inst, o = {}) {
  const ev = mel(str, s.spb, s.name);
  if (o.bars && ev.len !== o.bars * s.spb) console.warn(`[audio] ${s.name}: melody is ${ev.len} steps, expected ${o.bars * s.spb}`);
  for (const n of ev) s.add(bar0 * s.spb + n.s, { i: inst, n: n.m + (o.tr || 0), d: n.d * (o.leg ?? 0.92), v: o.v ?? 0.7, x: o.x, b: o.b });
}

// ───────────────────────────── the music (original compositions) ─────────────────────────────

// TITLE — "Harbour Waltz": jazz waltz in F, 3/4, swung eighths, 32 bars (≈58 s).
const TITLE_MEL_1 =
  'C5:1 D5:1 F5:2 A5:2 | G5:4 E5:2 | F5:2 D5:2 Bb4:2 | C5:6 | ' +
  'E5:1 G5:1 A5:2 C6:2 | A5:3 F#5:1 Eb5:2 | D5:2 G5:2 Bb5:1 A5:1 | A5:4 G5:2 |';
const TITLE_MEL_2 =
  'A5:3 F5:1 D5:2 | G5:2 F5:2 Db5:2 | C5:2 E5:2 G5:2 | F#5:4 A5:2 | ' +
  'Bb5:3 A5:1 G5:2 | E5:2 D5:2 Bb4:2 | C5:2 A4:4 | -:6 |';

function buildTitle() {
  const s = makeSong({
    name: 'title', bpm: 100, stepsPerBeat: 2, spb: 6, bars: 32, swing: 0.2, key: 5, autopan: 0.35,
    mix: { drums: [0.6, 0.1, 0.14], bass: [0.85, 0, 0.04], keys: [0.85, -0.1, 0.28], pad: [0.35, 0, 0.5], lead: [0.72, 0.12, 0.3], bell: [0.55, 0.2, 0.4] },
    delay: { beats: 1.5, fb: 0.28, wet: 0.22, buses: ['lead', 'bell'] },
  });
  const P = ['Fmaj7', 'Dm9', 'Gm7', 'C9', 'Am7', 'D7b9', 'Gm7', 'C7sus', 'Bbmaj7', 'Bbm6', 'Am7', 'D7', 'Gm7', 'C9', 'Fmaj7', 'C7sus'];
  const ct = chordTrack([...P, ...P], 6);
  const R = rng(11);
  const comps = [
    [[2, 1.8, 0.5], [4, 1.8, 0.42]],
    [[1, 2.6, 0.46], [4, 1.6, 0.38]],
    [[2, 3.6, 0.48]],
    [[2, 0.9, 0.45], [3, 0.9, 0.3], [4, 1.8, 0.42]],
  ];
  for (let b = 0; b < 32; b++) {
    const k = b % 16;
    addBass(s, ct, b, k % 4 === 3 ? 'R--.A-' : 'R--.5-', { lo: 36, x: 'soft', v: 0.85, leg: 0.95 });
    addComp(s, ct, b, k === 0 ? [[0, 5.5, 0.5]] : comps[Math.floor(R() * comps.length)], 'ep', { low: 55 });
    pat(s, b, 'brush', 'x.o.o.', { x: 'swish' });
    pat(s, b, 'brush', k % 2 ? '..o.og' : '..o.o.');
    pat(s, b, 'kick', 'g.....', { x: 'soft' });
    if (b >= 16) addPad(s, ct, b, { low: 53, v: 0.35, rootless: true });
  }
  addMel(s, 0, TITLE_MEL_1, 'whistle', { tr: 12, v: 0.6, bars: 8 });
  addMel(s, 8, TITLE_MEL_2, 'whistle', { tr: 12, v: 0.6, bars: 8 });
  addMel(s, 16, TITLE_MEL_1, 'bell', { v: 0.6, x: 'vibe', bars: 8 }); // vibes retell the tune
  addMel(s, 24, TITLE_MEL_2, 'whistle', { tr: 12, v: 0.6, bars: 8 });
  return finalize(s);
}

// TOWN / NIGHT — "Minato Bounce": city-pop / jazz-funk in F, sections A B A' C (32 bars).
// A = pentatonic hook, B = D-minor funk call & response, C = Chinatown break (erhu + guzheng run).
const CITY_CH = {
  A: ['Bbmaj7', 'Am7', 'Gm7|C7', 'Fmaj7', 'Bbmaj7', 'Am7|D7', 'Gm7', 'C7sus|C7'],
  B: ['Dm7', 'Dm7', 'Bbmaj7', 'C7', 'Dm7', 'Dm7', 'Ebmaj7', 'C7sus'],
  C: ['Gm7', 'Am7', 'Bbmaj7', 'C', 'Gm7', 'Am7', 'Bbmaj7', 'C7sus'],
  nA: ['Bbmaj9', 'Am11', 'Gm9|C9', 'Fmaj9', 'Bbmaj9', 'Am11|D7b9', 'Gm9', 'C9sus|C7b9'],
  nB: ['Dm9', 'Dm9', 'Bbmaj9', 'C9', 'Dm9', 'Dm11', 'Ebmaj9', 'C9sus'],
  nC: ['Gm9', 'Am11', 'Bbmaj9', 'C9sus', 'Gm9', 'Am11', 'Bbmaj9', 'C9sus'],
};
const CITY_MEL = {
  A:
    '-:2 D5:2 F5:1 G5:1 A5:2 -:1 G5:1 A5:2 C6:2 A5:2 | G5:3 E5:1 -:2 D5:2 C5:4 -:4 | ' +
    '-:2 D5:2 F5:1 G5:1 A5:2 -:1 G5:1 A5:2 D6:2 C6:2 | A5:6 G5:2 F5:2 G5:2 -:4 | ' +
    '-:2 F5:2 G5:1 A5:1 C6:2 -:1 A5:1 C6:2 D6:2 F6:2 | E6:3 D6:1 -:2 C6:2 A5:2 F#5:2 A5:2 -:2 | ' +
    'G5:3 A5:1 Bb5:2 A5:2 G5:2 F5:2 D5:2 F5:2 | G5:8 -:2 E5:2 F5:2 G5:2 |',
  B:
    'D6:1 -:1 C6:1 A5:1 -:2 G5:1 A5:1 -:2 C6:2 A5:1 G5:1 F5:2 | D5:2 -:14 | ' +
    'F5:1 -:1 G5:1 A5:1 -:2 C6:1 D6:1 -:2 F6:2 D6:1 C6:1 A5:2 | G5:4 -:2 E5:2 G5:2 Bb5:2 C6:2 E6:2 | ' +
    'D6:1 -:1 C6:1 A5:1 -:2 G5:1 A5:1 -:2 C6:2 A5:1 G5:1 F5:2 | F5:2 -:2 A5:2 -:2 D6:4 C6:2 A5:2 | ' +
    'G5:3 Bb5:3 D6:2 Eb6:4 D6:2 Bb5:2 | C6:8 -:4 A5:2 C6:2 |',
  C:
    'D6:4 C6:2 A5:2 G5:4 A5:4 | C6:6 A5:2 G5:4 E5:4 | F5:4 G5:2 A5:2 C6:4 D6:4 | C6:12 -:4 | ' +
    'D6:4 F6:2 D6:2 C6:4 A5:4 | G5:6 A5:2 C6:4 E6:4 | D6:4 C6:2 A5:2 G5:4 F5:4 | G5:8 -:8 |',
};
const CITY_BRASS = {
  A: { 1: [[12, 1.5, 0.8], [14, 2, 0.9]], 3: [[12, 1.5, 0.8], [14, 2, 0.9]], 5: [[14, 2, 0.8]], 7: [[8, 1, 0.75], [10, 1.5, 0.85]] },
  A2: { 0: [[0, 2, 0.7]], 1: [[12, 1.5, 0.85], [14, 2, 0.95]], 3: [[11, 1, 0.8], [12, 1.5, 0.85], [14, 2, 1]], 4: [[0, 2, 0.7]], 5: [[14, 2, 0.85]], 7: [[8, 1, 0.8], [10, 1.5, 0.9]] },
  B: { 1: [[3, 1, 0.8], [6, 2, 0.9], [10, 1, 0.8], [12, 3, 1]], 3: [[14, 2, 0.8]], 5: [[3, 1, 0.8], [6, 2, 0.9], [10, 1, 0.8], [12, 3, 1]], 7: [[8, 1, 0.8], [10, 2, 0.9]] },
  C: { 3: [[12, 4, 0.55]], 7: [[8, 1, 0.75], [10, 1, 0.8], [12, 1, 0.9], [14, 2, 1]] },
};
// Guzheng-style pentatonic run over the chord (degree offsets in the F major pentatonic).
const RUNS = [
  [0, 1, 2, 4, 3, 2, 1, 2, 0, 1, 2, 4, 5, 4, 2, 1],
  [4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 6, 5, 4, 2, 1, 0],
];
function addRun(s, ct, b, k, lo, v) {
  const list = penta(s.key), ch = ct.at(b, 0);
  let i0 = list.findIndex((m) => m >= lo && m % 12 === ch.root);
  if (i0 < 0) i0 = list.findIndex((m) => m >= lo + ((((ch.root - lo) % 12) + 12) % 12));
  RUNS[k % 2].forEach((d, st) => s.add(b * 16 + st, { i: 'pluck', n: list[Math.min(list.length - 1, i0 + d)], d: 2, v: v * (st % 4 === 0 ? 1 : 0.62) }));
}

function buildCity(night) {
  const s = makeSong({
    name: night ? 'night' : 'town', bpm: night ? 120 : 124, stepsPerBeat: 4, spb: 16, bars: 32,
    swing: night ? 0.12 : 0.05, key: 5, autopan: night ? 0.25 : 0,
    mix: night
      ? { drums: [0.75, 0, 0.12], bass: [0.85, 0, 0.03], keys: [0.62, -0.15, 0.3], pad: [0.4, 0, 0.4], lead: [0.72, 0.08, 0.32], bell: [0.45, 0.3, 0.45], pluck: [0.45, -0.3, 0.3] }
      : { drums: [0.66, 0, 0.05], bass: [0.8, 0, 0.02], keys: [0.6, -0.15, 0.18], brass: [0.55, 0.2, 0.15], lead: [0.64, 0.05, 0.18], bell: [0.4, 0.3, 0.3], pluck: [0.45, -0.3, 0.25] },
    delay: night ? { beats: 0.75, fb: 0.32, wet: 0.26, buses: ['lead', 'bell'] } : { beats: 0.75, fb: 0.2, wet: 0.1, buses: ['lead'] },
  });
  const order = ['A', 'B', 'A2', 'C'];
  const ct = chordTrack(order.flatMap((x) => CITY_CH[(night ? 'n' : '') + x[0]]), 16);
  const R = rng(night ? 97 : 31);
  const sparkle = penta(5).filter((m) => m >= 84 && m <= 100);
  order.forEach((sec, si) => {
    const b0 = si * 8, S = sec[0];
    for (let k = 0; k < 8; k++) {
      const b = b0 + k, last = k === 7;
      if (!night) {
        // ── town: punchy synth kit
        if (k === 0) s.add(b * 16, { i: 'crash', v: S === 'C' ? 0.5 : 0.8 });
        if (S === 'C') {
          pat(s, b, 'kick', last ? 'x.......x.x.x.x.' : 'x.......x.......');
          if (!last) pat(s, b, 'wood', 'x..o..x...o.x...');
          pat(s, b, 'hat', 'o.g.o.g.o.g.o.g.');
          if (k === 0) s.add(b * 16, { i: 'gong', v: 0.7 });
          if (k === 3) [50, 47, 43, 40].forEach((n, j) => s.add(b * 16 + 12 + j, { i: 'tom', n, v: 0.8 }));
          if (last) pat(s, b, 'snare', 'g.g.o.o.ooxxxxXX');
        } else {
          const kick = S === 'B' ? (k % 2 ? 'x..x...x..x...x.' : 'x..x...x..x.....') : k % 2 ? 'x.....x...x...x.' : 'x.....x...x.....';
          pat(s, b, 'kick', last ? 'x.....x...x.....' : kick);
          pat(s, b, 'snare', last ? '....x.......xoxX' : k % 2 ? '....x..g....x.g.' : '....x.......x...');
          if (sec !== 'A') pat(s, b, 'clap', '....x.......x...');
          const hat = S === 'B' && k % 2 ? 'xgogxgOgxgogxgog' : k % 4 === 3 ? 'xgogxgogxgogxgOg' : 'xgogxgogxgogxgog';
          pat(s, b, 'hat', hat);
        }
        const tpl = S === 'C' ? 'R-----5---R---5-' : S === 'B' ? (k % 2 ? 'R..R..O.R..RO.5A' : 'R..R..O.R-.R7-O.') : k % 2 ? 'R-.RO.R-.R5-O.5A' : 'R-.RO.R-5-.RO.7A';
        addBass(s, ct, b, tpl, { lo: 36, x: 'slap', v: 0.85, leg: 0.8 });
        const comp = S === 'C' ? [[0, 15, 0.3]] : S === 'B' ? [[0, 1, 0.5], [3, 1, 0.4], [6, 2, 0.45], [11, 1, 0.4], [14, 2, 0.42]] : [[2, 2, 0.45], [6, 1, 0.35], [10, 2, 0.45], [13, 2, 0.38]];
        addComp(s, ct, b, comp, 'ep', { low: 57 });
        const br = CITY_BRASS[sec][k];
        if (br) addComp(s, ct, b, br, 'brass', { low: 62 });
        if (S === 'C') addRun(s, ct, b, k, 79, 0.55);
      } else {
        // ── night: same tune, city lights on — soft kit, round bass, pads and sparkles
        if (k === 0 && si === 0) s.add(b * 16, { i: 'crash', v: 0.35 });
        pat(s, b, 'kick', S === 'C' ? 'x.......x.......' : k % 2 ? 'x.......x.x.....' : 'x.........x.....', { x: 'soft' });
        if (S !== 'C') pat(s, b, 'rim', '....x.......x...');
        if (sec === 'B' || sec === 'A2') pat(s, b, 'clap', '............x...');
        pat(s, b, 'hat', 'x.o.x.o.x.o.x.oo', { x: 'shaker' });
        if (S === 'C' && k === 0) s.add(b * 16, { i: 'gong', v: 0.4 });
        if (last) pat(s, b, 'snare', '............g.og');
        const tpl = S === 'C' ? 'R-----5---R---5-' : S === 'B' ? 'R--.R--.R-----5-' : 'R-----.R5---.R-A';
        addBass(s, ct, b, tpl, { lo: 36, x: 'smooth', v: 0.85, leg: 0.95 });
        addPad(s, ct, b, { low: 58, rootless: true, v: 0.55, leg: 1.02 });
        const comp = S === 'B' ? [[0, 1, 0.4], [6, 2, 0.35], [11, 2, 0.35]] : S === 'C' ? [[4, 2, 0.3], [12, 2, 0.3]] : [[2, 1.5, 0.38], [10, 1.5, 0.38]];
        addComp(s, ct, b, comp, 'ep', { low: 57 });
        if (S === 'C') addRun(s, ct, b, k + 1, 79, 0.3);
        for (let st = 0; st < 16; st += 2) {
          if (R() < 0.16) s.add(b * 16 + st + (R() < 0.5 ? 1 : 0), { i: 'bell', n: sparkle[Math.floor(R() * sparkle.length)], d: 4, v: 0.12 + R() * 0.15 });
        }
      }
    }
    // melodies
    if (!night) {
      if (S === 'A') addMel(s, b0, CITY_MEL.A, 'lead', { v: sec === 'A2' ? 0.8 : 0.75, bars: 8 });
      if (sec === 'A2') addMel(s, b0, CITY_MEL.A, 'bell', { tr: 12, v: 0.3 });
      if (S === 'B') addMel(s, b0, CITY_MEL.B, 'lead', { v: 0.75, bars: 8 });
      if (S === 'C') addMel(s, b0, CITY_MEL.C, 'erhu', { tr: -12, v: 0.8, bars: 8, leg: 1 });
    } else {
      if (S === 'A') addMel(s, b0, CITY_MEL.A, 'whistle', { v: 0.55, bars: 8 });
      if (sec === 'A2') addMel(s, b0, CITY_MEL.A, 'bell', { tr: 12, v: 0.25 });
      if (S === 'B') addMel(s, b0, CITY_MEL.B, 'ep', { v: 0.7, b: 'lead', bars: 8 });
      if (S === 'C') addMel(s, b0, CITY_MEL.C, 'whistle', { v: 0.5, bars: 8 });
    }
  });
  return finalize(s);
}

// WORLD — "Around the Planet": D major march-adventure at 140 BPM, A B A' B' (32 bars ≈ 55 s).
const WORLD_MEL = {
  A:
    'A4:3 D5:1 F#5:4 A5:6 F#5:2 | G5:3 E5:1 C5:4 E5:4 G5:4 | B5:6 A5:2 G5:2 A5:2 B5:4 | A5:12 -:2 A4:1 D5:1 | ' +
    'F5:3 D5:1 Bb4:4 D5:4 F5:4 | G5:3 E5:1 C5:4 G5:4 C6:4 | D6:6 C#6:2 B5:2 A5:2 F#5:4 | E5:8 -:4 A4:1 C#5:1 E5:2 |',
  B:
    'D5:4 G5:2 B5:2 D6:8 | C#6:4 B5:2 A5:2 E5:8 | F#5:4 A5:4 C#6:6 B5:2 | B5:8 A5:4 F#5:4 | ' +
    'G5:4 B5:2 E6:2 D6:4 B5:4 | A5:4 C#6:2 F#6:2 E6:4 C#6:4 | D6:6 B5:2 G5:4 B5:4 | A5:12 -:4 |',
};
function buildWorld() {
  const s = makeSong({
    name: 'world', bpm: 140, stepsPerBeat: 4, spb: 16, bars: 32, key: 2,
    mix: { drums: [0.68, 0, 0.1], bass: [0.75, 0, 0.03], pad: [0.58, 0, 0.3], brass: [0.6, -0.15, 0.2], lead: [0.64, 0.08, 0.22], pluck: [0.4, 0.3, 0.25], bell: [0.36, -0.3, 0.35] },
    delay: { beats: 0.75, fb: 0.2, wet: 0.12, buses: ['lead'] },
  });
  const A = ['D', 'C/D', 'G/D', 'D', 'Bb', 'C', 'D', 'A7sus|A7'];
  const B = ['G', 'A', 'F#m', 'Bm', 'Em', 'F#m', 'G', 'A7sus|A'];
  const order = ['A', 'B', 'A2', 'B2'];
  const ct = chordTrack(order.flatMap((x) => (x[0] === 'A' ? A : B)), 16);
  const BR = { A: { 3: [[12, 1, 0.8], [13, 1, 0.85]], 7: [[8, 1.5, 0.9], [10, 1.5, 0.95]] }, B: { 7: [[12, 1, 0.9], [14, 2, 1]] } };
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 2, 1];
  order.forEach((sec, si) => {
    const b0 = si * 8, S = sec[0], again = sec.length > 1;
    for (let k = 0; k < 8; k++) {
      const b = b0 + k, last = k === 7;
      if (k === 0 || (S === 'B' && k === 4)) s.add(b * 16, { i: 'crash', v: 0.85 });
      pat(s, b, 'kick', S === 'B' ? 'x...x...x...x...' : 'x.......x.......');
      if (last) pat(s, b, 'snare', 'x.x.x.xxoooxxxXX');
      else if (k === 3) {
        pat(s, b, 'snare', 'g.g.x.ggg.g.x...');
        [52, 50, 47, 43].forEach((n, j) => s.add(b * 16 + 12 + j, { i: 'tom', n, v: 0.85 }));
      } else pat(s, b, 'snare', S === 'B' ? 'o.g.x.g.o.ggx.go' : 'g.g.x.ggg.g.x.gg');
      if (S === 'B') pat(s, b, 'hat', 'x.o.x.o.x.o.x.o.');
      if (S === 'A' && k % 2 === 0) s.add(b * 16, { i: 'timp', n: bassNote(ct.at(b, 0), 38), v: 0.85 });
      if (last) for (let st = 8; st < 16; st++) s.add(b * 16 + st, { i: 'timp', n: bassNote(ct.at(b, st), 38), v: 0.3 + 0.07 * (st - 8) });
      addBass(s, ct, b, S === 'B' ? 'R.R.O.R.R.R.O.R.' : 'R.R.R.R.R.R.O.R.', { lo: 38, x: 'saw', v: 0.8, leg: 1.3 });
      addPad(s, ct, b, { low: 55, x: 'super', v: S === 'B' ? 0.6 : 0.5 });
      const br = BR[S][k];
      if (br) addComp(s, ct, b, br, 'brass', { low: 62 });
      if (again) {
        const segs = ct.segs(b);
        ARP.forEach((d, st) => {
          const sg = segs.find((x) => st >= x.st && st < x.st + x.len);
          const vc = voice(sg.ch, 62, false, 3);
          const n = d < vc.length ? vc[d] : vc[0] + 12;
          s.add(b * 16 + st, { i: 'pluck', n, d: 1.5, v: st % 4 === 0 ? 0.5 : 0.32 });
        });
      }
    }
    addMel(s, b0, WORLD_MEL[S], 'lead', { x: 'saw', v: 0.75, bars: 8 });
    if (sec === 'A2') addMel(s, b0, WORLD_MEL.A, 'brass', { tr: -12, v: 0.5 });
    if (sec === 'B2') addMel(s, b0, WORLD_MEL.B, 'bell', { tr: 12, v: 0.28 });
  });
  return finalize(s);
}

// ENDING — "Small Ball, Big Blue": 8 triumphant-to-gentle bars (≈19 s), then an 8-bar lullaby loop.
const END_MEL_1 = 'G4:2 C5:2 E5:2 G5:10 | A5:4 G5:2 F5:2 C6:8 | C6:6 Bb5:2 Ab5:4 Eb5:4 | F5:4 Bb5:4 D6:8 | E6:16 |';
const END_MEL_2 = '-:4 E5:4 D5:4 C5:4 | A4:8 G4:4 A4:4 | G4:16 |';
const END_MEL_LOOP =
  'A5:4 C6:4 E6:4 C6:4 | B5:8 G5:4 E5:4 | F5:4 A5:4 C6:4 A5:4 | G5:12 -:4 | ' +
  'A5:4 C6:4 F6:4 E6:4 | D6:6 B5:2 C#6:8 | E6:4 D6:4 A5:4 F5:4 | G5:16 |';
function buildEnding() {
  const s = makeSong({
    name: 'ending', bpm: 100, stepsPerBeat: 4, spb: 16, bars: 16, loopStartBar: 8, key: 0, autopan: 0.2,
    mix: { drums: [0.8, 0, 0.14], bass: [0.85, 0, 0.03], keys: [0.7, -0.12, 0.3], pad: [0.5, 0, 0.4], brass: [0.65, 0.15, 0.25], lead: [0.68, 0.05, 0.3], bell: [0.55, 0.2, 0.45] },
    delay: { beats: 0.75, fb: 0.3, wet: 0.2, buses: ['lead', 'bell'] },
  });
  const ct = chordTrack(['C', 'F/C', 'Ab', 'Bb', 'C', 'Am7', 'Fmaj7', 'G7sus', 'Fmaj7', 'Em7', 'Dm7', 'G7sus|G7', 'Fmaj7', 'Em7|A7', 'Dm9', 'G13sus'], 16);
  for (let b = 0; b < 16; b++) {
    if (b <= 4) {
      if (b === 0 || b === 4) s.add(b * 16, { i: 'crash', v: 1 });
      if (b === 4) s.add(b * 16, { i: 'gong', n: 36, v: 0.6 });
      s.add(b * 16, { i: 'timp', n: bassNote(ct.at(b, 0), 36), v: 0.9 });
      if (b !== 3) s.add(b * 16 + 8, { i: 'timp', n: bassNote(ct.at(b, 8), 36), v: 0.6 });
      else {
        for (let st = 4; st < 16; st++) s.add(b * 16 + st, { i: 'timp', n: bassNote(ct.at(b, st), 36), v: 0.25 + 0.05 * st });
        pat(s, b, 'snare', 'g.g.o.o.ooooxxXX');
      }
      pat(s, b, 'kick', 'x.......x.......');
      addPad(s, ct, b, { low: 55, x: 'super', v: 0.6 });
      addComp(s, ct, b, b < 4 ? [[0, 6, 0.9], [6, 2, 0.75], [8, 8, 0.85]] : [[0, 15, 1]], 'brass', { low: 60 });
      addBass(s, ct, b, 'R-------R-------', { lo: 36, x: 'saw', v: 0.75, leg: 1 });
    } else if (b <= 7) {
      addComp(s, ct, b, [[0, 7, 0.45], [8, 7, 0.38]], 'ep', { low: 55 });
      addBass(s, ct, b, 'R-------5-------', { lo: 36, x: 'soft', v: 0.75 });
      addPad(s, ct, b, { low: 57, rootless: true, v: 0.4 });
      pat(s, b, 'brush', 'x.......o.......', { x: 'swish' });
    } else {
      addComp(s, ct, b, [[0, 3.5, 0.4], [4, 3.5, 0.3], [8, 3.5, 0.36], [12, 3.5, 0.3]], 'ep', { low: 55 });
      addBass(s, ct, b, 'R-------5---R---', { lo: 36, x: 'soft', v: 0.7 });
      addPad(s, ct, b, { low: 57, rootless: true, v: 0.35 });
      pat(s, b, 'brush', 'o.......g.......', { x: 'swish' });
    }
  }
  addMel(s, 0, END_MEL_1, 'lead', { x: 'saw', v: 0.8, bars: 5 });
  addMel(s, 0, END_MEL_1, 'bell', { tr: 12, v: 0.3 });
  addMel(s, 5, END_MEL_2, 'whistle', { tr: 12, v: 0.5, bars: 3 });
  addMel(s, 8, END_MEL_LOOP, 'bell', { x: 'box', v: 0.6, bars: 8 });
  return finalize(s);
}

const SONG_BUILDERS = { title: buildTitle, town: () => buildCity(false), night: () => buildCity(true), world: buildWorld, ending: buildEnding };
const songCache = {};
const getSong = (name) => songCache[name] || (songCache[name] = SONG_BUILDERS[name]());

// ───────────────────────────── instruments ─────────────────────────────
// Each is (audio, outNode, time, event, stepDur, player). Durations are e.d * stepDur seconds.

function vibrato(c, params, t, rate, depth, delay, srcs, nodes) {
  const l = c.createOscillator(), g = c.createGain();
  l.frequency.value = rate;
  g.gain.setValueAtTime(0, t);
  g.gain.setValueAtTime(0, t + delay);
  g.gain.linearRampToValueAtTime(depth, t + delay + 0.3);
  l.connect(g);
  for (const p of params) g.connect(p);
  l.start(t);
  srcs.push(l);
  nodes.push(g);
}
const arr = (n) => (Array.isArray(n) ? n : [n]);

const INST = {
  kick(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1, o = c.createOscillator(), g = c.createGain();
    const soft = e.x === 'soft';
    o.frequency.setValueAtTime(soft ? 110 : 165, t);
    o.frequency.exponentialRampToValueAtTime(46, t + (soft ? 0.09 : 0.12));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * (soft ? 0.8 : 1), t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.02, soft ? 0.07 : 0.09);
    o.connect(g).connect(out);
    o.start(t);
    A._end([o], [g], t + 0.55);
  },
  snare(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1;
    const n = A._noiseSrc(t, 0.4), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass';
    f.frequency.value = 1500;
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.setTargetAtTime(0, t, 0.04 + 0.025 * v);
    n.connect(f).connect(g).connect(out);
    const srcs = [n], nodes = [f, g];
    if (v > 0.4) {
      const o = c.createOscillator(), g2 = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(235, t);
      o.frequency.exponentialRampToValueAtTime(175, t + 0.05);
      g2.gain.setValueAtTime(0.5 * v, t);
      g2.gain.setTargetAtTime(0, t, 0.03);
      o.connect(g2).connect(out);
      o.start(t);
      srcs.push(o);
      nodes.push(g2);
    }
    A._end(srcs, nodes, t + 0.4);
  },
  hat(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1, open = e.x === 'open', shaker = e.x === 'shaker';
    const n = A._noiseSrc(t, 0.5), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass';
    f.frequency.value = shaker ? 5200 : 7600;
    const tau = open ? 0.09 : shaker ? 0.028 : 0.014;
    const pk = (shaker ? 0.22 : 0.3) * v;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pk, t + (shaker ? 0.012 : 0.001));
    g.gain.setTargetAtTime(0, t + (shaker ? 0.014 : 0.002), tau);
    n.connect(f).connect(g).connect(out);
    A._end([n], [f, g], t + 0.03 + tau * 7);
  },
  clap(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1;
    const n = A._noiseSrc(t, 0.4), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass';
    f.frequency.value = 1300;
    f.Q.value = 1.1;
    const pk = 0.55 * v;
    g.gain.setValueAtTime(pk, t);
    g.gain.setTargetAtTime(0, t, 0.004);
    g.gain.setValueAtTime(pk * 0.8, t + 0.011);
    g.gain.setTargetAtTime(0, t + 0.011, 0.004);
    g.gain.setValueAtTime(pk * 0.75, t + 0.022);
    g.gain.setTargetAtTime(0, t + 0.022, 0.055);
    n.connect(f).connect(g).connect(out);
    A._end([n], [f, g], t + 0.4);
  },
  rim(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1, g = c.createGain(), o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = 1750;
    o2.frequency.value = 520;
    g.gain.setValueAtTime(0.28 * v, t);
    g.gain.setTargetAtTime(0, t, 0.012);
    o1.connect(g);
    o2.connect(g);
    g.connect(out);
    o1.start(t);
    o2.start(t);
    A._end([o1, o2], [g], t + 0.12);
  },
  brush(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1, swish = e.x === 'swish';
    const n = A._noiseSrc(t, 0.6), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass';
    f.frequency.value = swish ? 2600 : 4200;
    f.Q.value = swish ? 0.6 : 0.9;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime((swish ? 0.15 : 0.3) * v, t + (swish ? 0.07 : 0.003));
    g.gain.setTargetAtTime(0, t + (swish ? 0.08 : 0.004), swish ? 0.09 : 0.025);
    n.connect(f).connect(g).connect(out);
    A._end([n], [f, g], t + (swish ? 0.6 : 0.2));
  },
  tom(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1, o = c.createOscillator(), g = c.createGain(), f = mtof(e.n ?? 45);
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7 * v, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.01, 0.09);
    o.connect(g).connect(out);
    o.start(t);
    A._end([o], [g], t + 0.6);
  },
  wood(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1, g = c.createGain(), o1 = c.createOscillator(), o2 = c.createOscillator();
    const f = (e.v ?? 1) < 0.8 ? 830 : 1250;
    o1.frequency.value = f;
    o2.frequency.value = f * 2.71;
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.3 * Math.max(0.6, v), t);
    g.gain.setTargetAtTime(0, t, 0.018);
    o1.connect(g);
    o2.connect(g2).connect(g);
    g.connect(out);
    o1.start(t);
    o2.start(t);
    A._end([o1, o2], [g, g2], t + 0.15);
  },
  crash(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1;
    const n = A._noiseSrc(t, 2.6), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass';
    f.frequency.value = 4200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 * v, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, 0.42);
    n.connect(f).connect(g).connect(out);
    A._end([n], [f, g], t + 2.6);
  },
  gong(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1, f = e.n ? mtof(e.n) : 98, srcs = [], nodes = [];
    for (const [r, a, tau] of [[1, 1, 1.4], [1.483, 0.55, 1.0], [1.932, 0.45, 0.8], [2.546, 0.32, 0.6], [3.13, 0.2, 0.45]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(f * r * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(f * r, t + 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16 * v * a, t + 0.012);
      g.gain.setTargetAtTime(0, t + 0.02, tau);
      o.connect(g).connect(out);
      o.start(t);
      srcs.push(o);
      nodes.push(g);
    }
    A._end(srcs, nodes, t + 6);
  },
  timp(A, out, t, e) {
    const c = A.ctx, v = e.v ?? 1, f = mtof(e.n ?? 41), o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f * 1.05, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.65 * v, t + 0.006);
    g.gain.setTargetAtTime(0, t + 0.01, 0.3);
    o.connect(g).connect(out);
    o.start(t);
    const n = A._noiseSrc(t, 0.2, true), lp = c.createBiquadFilter(), g2 = c.createGain();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    g2.gain.setValueAtTime(0.5 * v, t);
    g2.gain.setTargetAtTime(0, t, 0.025);
    n.connect(lp).connect(g2).connect(out);
    A._end([o, n], [g, lp, g2], t + 1.8);
  },

  // Rhodes-like electric piano: 1:1 FM with a decaying index (bright bark → mellow sine).
  ep(A, out, t, e, sd) {
    const c = A.ctx, v = e.v ?? 0.5, dur = Math.max(0.08, e.d * sd);
    for (const m of arr(e.n)) {
      const f = mtof(m);
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), amp = c.createGain();
      car.frequency.value = f;
      mod.frequency.value = f;
      mg.gain.setValueAtTime(f * (0.5 + 2.2 * v), t);
      mg.gain.setTargetAtTime(f * 0.1, t, 0.16);
      mod.connect(mg).connect(car.frequency);
      const pk = 0.3 * v;
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.linearRampToValueAtTime(pk, t + 0.005);
      amp.gain.setTargetAtTime(pk * 0.28, t + 0.006, 0.8);
      amp.gain.setTargetAtTime(0, t + dur, 0.08);
      car.connect(amp).connect(out);
      car.start(t);
      mod.start(t);
      A._end([car, mod], [mg, amp], t + dur + 0.5);
    }
  },
  bass(A, out, t, e, sd) {
    const c = A.ctx, v = e.v ?? 0.8, dur = Math.max(0.05, e.d * sd), f = mtof(e.n), kind = e.x || 'soft';
    const lp = c.createBiquadFilter(), amp = c.createGain(), o1 = c.createOscillator(), o2 = c.createOscillator();
    lp.type = 'lowpass';
    o2.frequency.value = f;
    let pk, rel;
    if (kind === 'slap') {
      o1.type = 'sawtooth';
      o1.frequency.value = f;
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(e.pop ? 3600 : 1300 + 1500 * v, t);
      lp.frequency.setTargetAtTime(e.pop ? 500 : 300, t, e.pop ? 0.05 : 0.07);
      pk = 0.26 * v;
      rel = 0.025;
    } else if (kind === 'saw') {
      o1.type = 'sawtooth';
      o2.type = 'sawtooth';
      o1.frequency.value = f;
      o2.detune.value = 9;
      lp.Q.value = 3;
      lp.frequency.setValueAtTime(2200, t);
      lp.frequency.setTargetAtTime(600, t, 0.08);
      pk = 0.27 * v;
      rel = 0.04;
    } else {
      // soft (title/ending) and smooth (night): round triangle + sine
      o1.type = 'triangle';
      o1.frequency.value = f;
      lp.frequency.value = kind === 'smooth' ? 900 : 700;
      pk = 0.17 * v;
      rel = kind === 'smooth' ? 0.05 : 0.09;
    }
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(pk, t + (kind === 'slap' ? 0.003 : 0.012));
    amp.gain.setTargetAtTime(pk * 0.6, t + 0.015, kind === 'slap' ? 0.18 : 0.5);
    amp.gain.setTargetAtTime(0, t + dur, rel);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(amp).connect(out);
    o1.start(t);
    o2.start(t);
    A._end([o1, o2], [lp, amp], t + dur + rel * 8);
  },
  pad(A, out, t, e, sd) {
    const c = A.ctx, v = e.v ?? 0.5, dur = e.d * sd, sup = e.x === 'super', notes = arr(e.n);
    const lp = c.createBiquadFilter(), amp = c.createGain();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    const cut = sup ? 2600 : 1150, att = sup ? 0.06 : 0.45, rel = sup ? 0.3 : 0.6;
    lp.frequency.setValueAtTime(cut * 0.45, t);
    lp.frequency.linearRampToValueAtTime(cut, t + att + 0.2);
    const det = sup ? [-14, 0, 13] : [-7, 7];
    const pk = (v * 0.45) / Math.sqrt(notes.length * det.length);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(pk, t + att);
    amp.gain.setTargetAtTime(0, t + Math.max(att, dur - rel * 0.3), rel / 3);
    const srcs = [];
    for (const m of notes) {
      for (const d of det) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = d;
        o.connect(lp);
        o.start(t);
        srcs.push(o);
      }
    }
    lp.connect(amp).connect(out);
    A._end(srcs, [lp, amp], t + dur + rel * 2);
  },
  brass(A, out, t, e, sd) {
    const c = A.ctx, v = e.v ?? 0.8, dur = Math.max(0.08, e.d * sd), notes = arr(e.n);
    const lp = c.createBiquadFilter(), amp = c.createGain();
    lp.type = 'lowpass';
    lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(450, t);
    lp.frequency.linearRampToValueAtTime(900 + 2800 * v, t + 0.035);
    lp.frequency.setTargetAtTime(900 + 900 * v, t + 0.04, 0.12);
    lp.frequency.setTargetAtTime(450, t + dur, 0.05);
    const pk = (0.55 * v) / Math.sqrt(notes.length * 2);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(pk, t + 0.022);
    amp.gain.setTargetAtTime(pk * 0.72, t + 0.025, 0.15);
    amp.gain.setTargetAtTime(0, t + dur, 0.05);
    const srcs = [];
    for (const m of notes) {
      const f = mtof(m);
      for (const d of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = d;
        o.frequency.setValueAtTime(f * 0.985, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
        o.connect(lp);
        o.start(t);
        srcs.push(o);
      }
    }
    lp.connect(amp).connect(out);
    A._end(srcs, [lp, amp], t + dur + 0.4);
  },
  lead(A, out, t, e, sd) {
    const c = A.ctx, v = e.v ?? 0.7, dur = Math.max(0.06, e.d * sd), f = mtof(e.n), saw = e.x === 'saw';
    const lp = c.createBiquadFilter(), amp = c.createGain(), srcs = [], nodes = [lp, amp];
    const o1 = c.createOscillator();
    if (saw) o1.type = 'sawtooth';
    else o1.setPeriodicWave(A._pulse);
    o1.frequency.value = f;
    srcs.push(o1);
    if (saw) {
      const o2 = c.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = f;
      o1.detune.value = -8;
      o2.detune.value = 8;
      srcs.push(o2);
    }
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    const cut = saw ? 3400 : 2700;
    lp.frequency.setValueAtTime(cut * 1.7, t);
    lp.frequency.setTargetAtTime(cut, t, 0.08);
    const pk = (saw ? 0.32 : 0.5) * v;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(pk, t + 0.012);
    amp.gain.setTargetAtTime(pk * 0.8, t + 0.015, 0.3);
    amp.gain.setTargetAtTime(0, t + dur, 0.04);
    for (const o of srcs) {
      o.connect(lp);
      o.start(t);
    }
    if (dur > 0.25) vibrato(c, srcs.map((o) => o.detune), t, 5.5, 14, 0.18, srcs, nodes);
    lp.connect(amp).connect(out);
    A._end(srcs, nodes, t + dur + 0.3);
  },
  whistle(A, out, t, e, sd) {
    const c = A.ctx, v = e.v ?? 0.6, dur = Math.max(0.06, e.d * sd), f = mtof(e.n);
    const o = c.createOscillator(), amp = c.createGain(), srcs = [o], nodes = [amp];
    o.frequency.setValueAtTime(f * 0.965, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    const pk = 0.33 * v;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(pk, t + 0.03);
    amp.gain.setTargetAtTime(pk * 0.85, t + 0.03, 0.4);
    amp.gain.setTargetAtTime(0, t + dur, 0.05);
    o.connect(amp).connect(out);
    o.start(t);
    if (dur > 0.2) vibrato(c, [o.detune], t, 5.8, 22, 0.12, srcs, nodes);
    A._end(srcs, nodes, t + dur + 0.4);
  },
  // Erhu-ish bowed lead: nasal resonant saw, slow bow attack, portamento and deepening vibrato.
  erhu(A, out, t, e, sd, p) {
    const c = A.ctx, v = e.v ?? 0.7, dur = Math.max(0.08, e.d * sd), f = mtof(e.n);
    const o = c.createOscillator(), lp = c.createBiquadFilter(), amp = c.createGain(), srcs = [o], nodes = [lp, amp];
    o.type = 'sawtooth';
    const prev = p && p.mono.erhu;
    if (prev && t - prev.end < 0.1 && prev.m !== e.n) {
      o.frequency.setValueAtTime(mtof(prev.m), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    } else {
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    }
    if (p) p.mono.erhu = { m: e.n, end: t + dur };
    lp.type = 'lowpass';
    lp.frequency.value = 2300;
    lp.Q.value = 3;
    const pk = 0.35 * v;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(pk, t + 0.07);
    amp.gain.setTargetAtTime(pk * 0.85, t + 0.07, 0.3);
    amp.gain.setTargetAtTime(0, t + dur, 0.07);
    o.connect(lp).connect(amp).connect(out);
    o.start(t);
    vibrato(c, [o.detune], t, 6.2, 30, 0.1, srcs, nodes);
    A._end(srcs, nodes, t + dur + 0.5);
  },
  // Guzheng-ish pluck: bright saw with a fast filter decay and a small pitch bend into the note.
  pluck(A, out, t, e, sd) {
    const c = A.ctx, v = e.v ?? 0.6, f = mtof(e.n), len = Math.min(1.2, (e.d || 1) * sd);
    const o = c.createOscillator(), lp = c.createBiquadFilter(), amp = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.setValueAtTime(35, t);
    o.detune.linearRampToValueAtTime(0, t + 0.05);
    lp.type = 'lowpass';
    lp.Q.value = 1;
    lp.frequency.setValueAtTime(900 + 4200 * v, t);
    lp.frequency.setTargetAtTime(f * 1.4 + 300, t, 0.07);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.3 * v, t + 0.002);
    amp.gain.setTargetAtTime(0, t + 0.003, 0.1 + 0.15 * len);
    o.connect(lp).connect(amp).connect(out);
    o.start(t);
    A._end([o], [lp, amp], t + 0.15 + len * 1.6);
  },
  // Bells: glockenspiel (default), vibraphone-ish ('vibe') or music box ('box').
  bell(A, out, t, e, sd) {
    const c = A.ctx, v = e.v ?? 0.5, f = mtof(e.n), len = Math.min(1.4, 0.4 + 0.5 * (e.d || 1) * sd);
    const parts = e.x === 'vibe' ? [[1, 1, 0.9], [4, 0.1, 0.18]] : e.x === 'box' ? [[1, 1, 0.7], [3, 0.16, 0.22], [5.98, 0.05, 0.08]] : [[1, 1, 0.7], [2.76, 0.32, 0.22], [5.4, 0.1, 0.1]];
    const srcs = [], nodes = [], fmax = Math.min(15000, c.sampleRate * 0.45);
    let longest = 0;
    for (const [r, a, tau] of parts) {
      if (f * r > fmax) continue;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * r;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3 * v * a, t + 0.002);
      g.gain.setTargetAtTime(0, t + 0.003, tau * len);
      o.connect(g).connect(out);
      o.start(t);
      srcs.push(o);
      nodes.push(g);
      longest = Math.max(longest, tau * len);
    }
    if (srcs.length) A._end(srcs, nodes, t + 0.01 + longest * 5);
  },
};

// ───────────────────────────── the engine ─────────────────────────────

export class GameAudio {
  constructor() {
    this.ctx = null;
    this._muted = false;
    this._track = null;
    this._wantTrack = null;
    this._players = [];
    this._sfxVoices = 0;
    this._timer = null;
    this._roll = null;
    this._lastPickup = -1;
    this._combo = 0;
    this._lastBump = -1;
    this._keyPc = 5;
    this._offline = false;
    this._starting = null;
  }

  get muted() {
    return this._muted;
  }

  /** Create/resume the AudioContext. Call from a user gesture. Optionally pass a (Offline)AudioContext. */
  async start(ctx) {
    if (this.ctx) {
      if (!this._offline && this.ctx.state !== 'running') {
        try {
          await this.ctx.resume();
        } catch (err) { /* ignore */ }
      }
      return;
    }
    if (this._starting) return this._starting;
    this._starting = this._init(ctx);
    try {
      await this._starting;
    } finally {
      this._starting = null;
    }
  }

  async _init(ctx) {
    try {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!ctx && !AC) return;
      const c = ctx || new AC({ latencyHint: 'interactive' });
      this._offline = typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext;
      this._build(c);
      this.ctx = c;
      if (!this._offline) {
        try {
          if (c.state !== 'running') await c.resume();
        } catch (err) { /* autoplay policy: resumes on a later gesture */ }
        this._timer = setInterval(() => this._tick(), TICK_MS);
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', () => this._tick());
          // autoplay block or iOS interruption: any later gesture brings the sound back
          const wake = () => {
            if (c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {});
          };
          for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, wake, { passive: true, capture: true });
        }
      }
      if (this._wantTrack) this.setMusic(this._wantTrack);
    } catch (err) {
      console.warn('[audio] disabled:', err);
      this.ctx = null;
    }
  }

  _build(c) {
    const sr = c.sampleRate;
    // shared noise: 2 s white + 2 s brown, made once
    const L = Math.floor(sr * 2);
    this._white = c.createBuffer(1, L, sr);
    this._brown = c.createBuffer(1, L, sr);
    const w = this._white.getChannelData(0), br = this._brown.getChannelData(0);
    let last = 0, peak = 0;
    for (let i = 0; i < L; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      br[i] = last;
      peak = Math.max(peak, Math.abs(last));
    }
    for (let i = 0; i < L; i++) br[i] *= 0.9 / (peak || 1);
    // 28 % pulse wave for the city lead
    const N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.28);
    this._pulse = c.createPeriodicWave(re, im);

    this.master = c.createGain();
    this.master.gain.value = this._muted ? 0 : 1;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.musicBus = c.createGain();
    this.musicBus.gain.value = MUSIC_VOL;
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = SFX_VOL;
    // one shared reverb (generated impulse response)
    this.revIn = c.createGain();
    this.reverb = c.createConvolver();
    this.reverb.buffer = makeIR(c, 1.8);
    this.musicSend = c.createGain();
    this.musicSend.gain.value = MUSIC_VOL;
    const sfxSend = c.createGain();
    sfxSend.gain.value = SFX_VOL * 0.12;
    // sfxWet: sfx with extra reverb (chimes, shimmer)
    this.sfxWet = c.createGain();
    const wetSend = c.createGain();
    wetSend.gain.value = SFX_VOL * 0.45;

    this.musicBus.connect(this.comp);
    this.sfxBus.connect(this.comp);
    this.sfxBus.connect(sfxSend).connect(this.revIn);
    this.sfxWet.connect(this.sfxBus);
    this.sfxWet.connect(wetSend).connect(this.revIn);
    this.musicSend.connect(this.revIn);
    this.revIn.connect(this.reverb).connect(this.comp);
    this.comp.connect(this.master).connect(c.destination);
  }

  // ───── music ─────

  setMusic(track) {
    const name = track || null;
    if (name && !SONG_BUILDERS[name]) return;
    if (!this.ctx) {
      this._wantTrack = name;
      return;
    }
    if (name === this._track) return;
    this._track = name;
    const now = this.ctx.currentTime;
    let hadPrev = false;
    for (const p of this._players) {
      if (p.stopAt !== Infinity) continue;
      hadPrev = true;
      this._fade(p, 0, XFADE);
      p.stopAt = now + XFADE + 0.05;
    }
    if (name) {
      const song = getSong(name);
      const p = this._makePlayer(song, now + 0.05);
      this._fade(p, 1, hadPrev ? XFADE : 0.3);
      this._players.push(p);
      this._keyPc = song.key;
    }
    while (this._players.length > 3) this._killPlayer(this._players.shift());
    this._tick();
  }

  _makePlayer(song, t0) {
    const c = this.ctx;
    const p = { song, step: 0, time: t0, stopAt: Infinity, mono: {}, nodes: [], srcs: [], bus: {}, f0: 0, f1: 0, ft0: 0, ft1: 0 };
    p.fadeA = c.createGain();
    p.fadeB = c.createGain();
    p.fadeA.gain.value = 0;
    p.fadeB.gain.value = 0;
    p.fadeA.connect(this.musicBus);
    p.fadeB.connect(this.musicSend);
    p.nodes.push(p.fadeA, p.fadeB);
    const pans = {};
    for (const name of BUSES) {
      const [g, pan, rev] = song.mix[name];
      const bg = c.createGain();
      bg.gain.value = g;
      let tail = bg;
      if (c.createStereoPanner) {
        const pn = c.createStereoPanner();
        pn.pan.value = pan;
        bg.connect(pn);
        tail = pn;
        pans[name] = pn;
        p.nodes.push(pn);
      }
      tail.connect(p.fadeA);
      if (rev > 0) {
        const sg = c.createGain();
        sg.gain.value = rev;
        tail.connect(sg).connect(p.fadeB);
        p.nodes.push(sg);
      }
      p.bus[name] = bg;
      p.nodes.push(bg);
    }
    if (song.delay) {
      const d = c.createDelay(2), fb = c.createGain(), lp = c.createBiquadFilter(), send = c.createGain();
      d.delayTime.value = Math.min(1.9, (song.delay.beats * 60) / song.bpm);
      fb.gain.value = song.delay.fb;
      send.gain.value = song.delay.wet;
      lp.type = 'lowpass';
      lp.frequency.value = 2800;
      for (const b of song.delay.buses) p.bus[b].connect(send);
      send.connect(d).connect(lp).connect(fb).connect(d);
      lp.connect(p.fadeA);
      p.nodes.push(d, fb, lp, send);
    }
    if (song.autopan && pans.keys) {
      const l = c.createOscillator(), g = c.createGain();
      l.frequency.value = song.autopan * 10;
      g.gain.value = 0.3;
      l.connect(g).connect(pans.keys.pan);
      l.start(t0);
      p.srcs.push(l);
      p.nodes.push(g);
    }
    return p;
  }

  _fadeLevel(p, t) {
    if (t >= p.ft1) return p.f1;
    if (t <= p.ft0) return p.f0;
    return p.f0 + ((p.f1 - p.f0) * (t - p.ft0)) / (p.ft1 - p.ft0);
  }

  _fade(p, to, dur) {
    const now = this.ctx.currentTime, cur = this._fadeLevel(p, now);
    for (const prm of [p.fadeA.gain, p.fadeB.gain]) {
      prm.cancelScheduledValues(now);
      prm.setValueAtTime(cur, now);
      prm.linearRampToValueAtTime(to, now + dur);
    }
    p.f0 = cur;
    p.f1 = to;
    p.ft0 = now;
    p.ft1 = now + dur;
  }

  _killPlayer(p) {
    for (const s of p.srcs) {
      try {
        s.stop();
      } catch (err) { /* already stopped */ }
    }
    for (const n of p.srcs.concat(p.nodes)) {
      try {
        n.disconnect();
      } catch (err) { /* ignore */ }
    }
  }

  _advance(p, n = 1) {
    const s = p.song;
    p.time += n * s.stepDur;
    let pos = p.step + n;
    if (pos >= s.length) pos = s.loopStart + ((pos - s.length) % (s.length - s.loopStart));
    p.step = pos;
  }

  /** Schedule everything due before `until` (AudioContext seconds; default now + lookahead). */
  _tick(until) {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const end = until ?? now + (hidden ? 1.5 : LOOKAHEAD);
    for (let i = this._players.length - 1; i >= 0; i--) {
      const p = this._players[i];
      if (p.stopAt !== Infinity && now > p.stopAt + 0.3) {
        this._killPlayer(p);
        this._players.splice(i, 1);
        continue;
      }
      // fell behind (tab throttled / context hiccup): skip ahead instead of bursting notes
      if (until === undefined && p.time < now - 0.03) this._advance(p, Math.ceil((now - p.time) / p.song.stepDur));
      while (p.time < end && p.time < p.stopAt) {
        this._playStep(p);
        this._advance(p);
      }
    }
    const R = this._roll;
    if (R && R.on && !this._offline && now - R.lastCall > 0.25) {
      R.g.gain.setTargetAtTime(0, now, 0.08);
      R.grit.gain.setTargetAtTime(0, now, 0.08);
      R.on = false;
      R.lvl = 0;
    }
  }

  _playStep(p) {
    const s = p.song, evs = s.events[p.step];
    if (!evs.length) return;
    const t = p.time + (p.step & 1 ? s.swing * s.stepDur : 0);
    for (const e of evs) {
      try {
        INST[e.i](this, p.bus[e.b || BUS_OF[e.i]], t, e, s.stepDur, p);
      } catch (err) {
        if (!this._warned) console.warn('[audio] note failed:', e.i, err);
        this._warned = true;
      }
    }
  }

  // ───── shared node helpers ─────

  _noiseSrc(t, dur, brown) {
    const s = this.ctx.createBufferSource(), buf = brown ? this._brown : this._white;
    s.buffer = buf;
    if (dur >= buf.duration - 0.05) {
      s.loop = true;
      s.start(t, Math.random() * buf.duration);
    } else s.start(t, Math.random() * (buf.duration - dur));
    return s;
  }

  // Stop sources at stopT and disconnect the whole voice when it has finished.
  _end(srcs, nodes, stopT, sfx) {
    for (const s of srcs) {
      try {
        s.stop(stopT);
      } catch (err) { /* ignore */ }
    }
    if (sfx) this._sfxVoices++;
    srcs[0].onended = () => {
      for (const n of srcs) n.disconnect();
      for (const n of nodes) n.disconnect();
      if (sfx) this._sfxVoices--;
    };
  }

  _tone(out, t, { type = 'sine', f, f1, glide = 0.03, a = 0.003, pk = 0.3, tau = 0.08, hold: h = 0 }) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pk, t + a);
    g.gain.setTargetAtTime(0, t + a + h, tau);
    o.connect(g).connect(out);
    o.start(t);
    this._end([o], [g], t + a + h + tau * 7, true);
    return o;
  }

  _noise(out, t, { brown = false, type = 'bandpass', f = 2000, f1, glide = 0.1, q = 1, a = 0.002, pk = 0.2, tau = 0.05, hold: h = 0 }) {
    const c = this.ctx, total = a + h + tau * 7;
    const n = this._noiseSrc(t, total, brown), flt = c.createBiquadFilter(), g = c.createGain();
    flt.type = type;
    flt.frequency.setValueAtTime(f, t);
    if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + glide);
    flt.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pk, t + a);
    g.gain.setTargetAtTime(0, t + a + h, tau);
    n.connect(flt).connect(g).connect(out);
    this._end([n], [flt, g], t + total, true);
  }

  _boom(out, t, f0, f1, pk, tau) {
    this._tone(out, t, { f: f0, f1, glide: 0.35, a: 0.005, pk, tau });
    this._noise(out, t, { brown: true, type: 'lowpass', f: 260, q: 0.7, pk: pk * 0.8, tau: tau * 0.5 });
  }

  _duck(level, dur) {
    const now = this.ctx.currentTime, g = this.musicBus.gain;
    hold(g, now);
    g.setTargetAtTime(MUSIC_VOL * level, now, 0.04);
    g.setTargetAtTime(MUSIC_VOL, now + dur, 0.35);
  }

  _sfxReady() {
    return !!this.ctx && (this._offline || this.ctx.state === 'running');
  }

  // ───── sound effects ─────

  sfxPickup(ratio, kind) {
    if (!this._sfxReady() || this._sfxVoices > MAX_SFX_VOICES) return;
    const now = this.ctx.currentTime;
    const t = Math.max(now + 0.004, this._lastPickup + 0.032); // space out bursts of pickups
    if (t - now > 0.13) return;
    this._combo = this._lastPickup >= 0 && t - this._lastPickup < 0.5 ? (this._combo + 1) % 6 : 0;
    this._lastPickup = t;
    const big = clamp01(Number(ratio));
    const list = penta(this._keyPc);
    const idx = Math.min(list.length - 1, nearestIdx(list, 96 - big * 36) + this._combo);
    const m = list[idx], f = mtof(m), vol = 0.8 + 0.3 * big, out = this.sfxBus;
    // the pop: pitch drops into the note; small = bright plink, big = round and fat
    this._tone(out, t, { type: big > 0.45 ? 'sine' : 'triangle', f: f * 1.6, f1: f, glide: 0.018 + big * 0.04, pk: 0.4 * vol, tau: 0.04 + big * 0.12 });
    if (big > 0.3) this._tone(out, t, { f: f / 2, f1: f * 0.45, glide: 0.2, pk: 0.32 * big, tau: 0.08 + big * 0.2 });
    else this._tone(out, t + 0.012, { f: f * 2, pk: 0.07, tau: 0.03 });
    this._noise(out, t, { f: 2500 + (1 - big) * 4000, q: 1.2, pk: 0.12 * vol, tau: 0.008 });

    switch (kind) {
      case 'food': // bubbly blub-blub
        [1.19, 1.5, 1.33].forEach((r, i) => this._tone(out, t + 0.04 + i * 0.045, { f: f * r * 0.8, f1: f * r * 1.25, glide: 0.035, pk: 0.13 * vol, tau: 0.025 }));
        break;
      case 'animal': { // chirp-chirp
        const cf = 650 + (1 - big) * 1900;
        this._tone(out, t + 0.03, { f: cf, f1: cf * 1.8, glide: 0.05, pk: 0.12, tau: 0.03, hold: 0.03 });
        this._tone(out, t + 0.11, { f: cf * 1.1, f1: cf * 2, glide: 0.045, pk: 0.1, tau: 0.03, hold: 0.02 });
        break;
      }
      case 'person': // tiny "wah!"
        this._wah(out, t + 0.015, 330 + (1 - big) * 160 + Math.random() * 60, 0.5 * vol);
        break;
      case 'vehicle': { // horn blip (bip-bip for small ones)
        const h = 560 - big * 300;
        if (big < 0.4) {
          this._horn(out, t + 0.03, h, 0.07, 0.16);
          this._horn(out, t + 0.14, h, 0.07, 0.16);
        } else this._horn(out, t + 0.03, h, 0.2, 0.2);
        break;
      }
      case 'plant': // leafy rustle
        this._noise(out, t + 0.01, { f: 3600, q: 0.9, pk: 0.14 * vol, a: 0.02, tau: 0.05, hold: 0.03 });
        this._noise(out, t + 0.07, { f: 5200, q: 0.9, pk: 0.08 * vol, a: 0.015, tau: 0.04 });
        break;
      case 'building':
        this._boom(out, t, 85 - 20 * big, 40, 0.5 * vol, 0.25 + 0.2 * big);
        INST.bell(this, this.sfxWet, t + 0.06, { n: list[nearestIdx(list, 84) + (this._combo % 3)], d: 0.6, v: 0.6 }, 1);
        break;
      case 'landmark': {
        this._boom(out, t, 75, 32, 0.7, 0.55);
        const b = nearestIdx(list, 79);
        [0, 2, 5].forEach((d, i) => INST.bell(this, this.sfxWet, t + 0.05 + i * 0.09, { n: list[b + d], d: 1.2, v: 0.6 }, 1));
        break;
      }
      case 'nature': {
        this._noise(out, t, { brown: true, type: 'lowpass', f: 300, f1: 1200, glide: 0.25, q: 1, a: 0.12, pk: 0.45 * vol, tau: 0.25 });
        this._boom(out, t, 60, 35, 0.4 * vol, 0.4);
        const b = nearestIdx(list, 88);
        [0, 2, 4].forEach((d, i) => INST.bell(this, this.sfxWet, t + 0.08 + i * 0.05, { n: list[b + d], d: 1, v: 0.35 }, 1));
        break;
      }
      default: // 'thing': the pop says it all
        break;
    }
  }

  _wah(out, t, p0, pk) {
    const c = this.ctx, o = c.createOscillator(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g2 = c.createGain(), amp = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(p0 * 0.82, t);
    o.frequency.exponentialRampToValueAtTime(p0 * 1.18, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(p0 * 0.92, t + 0.22);
    f1.type = f2.type = 'bandpass';
    f1.Q.value = 5;
    f2.Q.value = 7;
    f1.frequency.setValueAtTime(350, t); // "w" … → "a"
    f1.frequency.linearRampToValueAtTime(850, t + 0.07);
    f2.frequency.setValueAtTime(700, t);
    f2.frequency.linearRampToValueAtTime(1300, t + 0.07);
    g2.gain.value = 0.6;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(pk, t + 0.03);
    amp.gain.setTargetAtTime(pk * 0.7, t + 0.03, 0.1);
    amp.gain.setTargetAtTime(0, t + 0.16, 0.035);
    o.connect(f1).connect(amp);
    o.connect(f2).connect(g2).connect(amp);
    amp.connect(out);
    o.start(t);
    this._end([o], [f1, f2, g2, amp], t + 0.4, true);
  }

  _horn(out, t, h, len, pk) {
    const c = this.ctx, lp = c.createBiquadFilter(), amp = c.createGain(), srcs = [];
    lp.type = 'lowpass';
    lp.frequency.value = 1700;
    for (const r of [1, 1.26]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = h * r;
      o.connect(lp);
      o.start(t);
      srcs.push(o);
    }
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(pk, t + 0.01);
    amp.gain.setTargetAtTime(0, t + len, 0.025);
    lp.connect(amp).connect(out);
    this._end(srcs, [lp, amp], t + len + 0.25, true);
  }

  sfxBump(strength) {
    if (!this._sfxReady()) return;
    const now = this.ctx.currentTime;
    if (this._lastBump >= 0 && now - this._lastBump < 0.07) return;
    this._lastBump = now;
    const s = clamp01(Number(strength ?? 0.5)), lv = 0.3 + 0.7 * s, t = now + 0.005, out = this.sfxBus, c = this.ctx;
    // thud
    this._tone(out, t, { f: 150, f1: 55, glide: 0.12, pk: 0.55 * lv, tau: 0.08 + 0.06 * s });
    this._noise(out, t, { brown: true, type: 'lowpass', f: 600, q: 0.7, pk: 0.5 * lv, tau: 0.05 });
    // cartoon wobble
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), amp = c.createGain();
    o.type = 'triangle';
    o.frequency.value = 170 + 50 * (1 - s);
    lfo.frequency.value = 13;
    lg.gain.setValueAtTime(10 + 40 * s, t);
    lg.gain.setTargetAtTime(0, t, 0.2);
    lfo.connect(lg).connect(o.frequency);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.24 * lv, t + 0.01);
    amp.gain.setTargetAtTime(0, t + 0.04, 0.15);
    o.connect(amp).connect(out);
    o.start(t);
    lfo.start(t);
    this._end([o, lfo], [lg, amp], t + 1.1, true);
  }

  sfxDrop() {
    if (!this._sfxReady()) return;
    const t = this.ctx.currentTime + 0.005, out = this.sfxBus;
    this._tone(out, t, { type: 'triangle', f: 880, f1: 330, glide: 0.2, pk: 0.25, tau: 0.07, hold: 0.12 });
    this._tone(out, t + 0.2, { f: 520, f1: 260, glide: 0.08, pk: 0.2, tau: 0.05 });
    this._noise(out, t + 0.2, { f: 2400, q: 1.5, pk: 0.1, tau: 0.02 });
  }

  sfxLevelUp() {
    if (!this._sfxReady()) return;
    const t = this.ctx.currentTime + 0.02, out = this.sfxBus;
    let root = 72 + this._keyPc;
    if (root > 78) root -= 12;
    const dt = 0.07;
    [0, 4, 7, 12, 16, 19].forEach((iv, i) => {
      INST.pluck(this, out, t + i * dt, { n: root + iv, d: 0.3, v: 0.75 }, 1);
      INST.bell(this, out, t + i * dt, { n: root + iv + 12, d: 0.3, v: 0.4 }, 1);
    });
    const t2 = t + 6 * dt;
    INST.brass(this, out, t2, { n: [root, root + 4, root + 7, root + 12], d: 0.7, v: 0.95 }, 1);
    INST.bell(this, this.sfxWet, t2, { n: root + 24, d: 1.2, v: 0.5 }, 1);
    INST.bell(this, this.sfxWet, t2 + 0.06, { n: root + 31, d: 1.2, v: 0.35 }, 1);
    INST.hat(this, out, t2, { v: 0.6, x: 'open' });
    this._duck(0.4, 1.2);
  }

  sfxWhoosh() {
    if (!this._sfxReady()) return;
    const c = this.ctx, t = c.currentTime + 0.02, D = 2.6, out = this.sfxBus;
    // rising air
    const n = this._noiseSrc(t, D + 0.2), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(220, t);
    bp.frequency.exponentialRampToValueAtTime(7500, t + 1.9);
    bp.frequency.exponentialRampToValueAtTime(2500, t + D);
    g.gain.setValueAtTime(0.01, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 1.7);
    g.gain.setTargetAtTime(0, t + 1.9, 0.22);
    n.connect(bp).connect(g).connect(out);
    // rumble underneath
    const r = this._noiseSrc(t, D + 0.2, true), lp = c.createBiquadFilter(), g2 = c.createGain();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(150, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 1.8);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(0.5, t + 1.6);
    g2.gain.setTargetAtTime(0, t + 1.9, 0.3);
    r.connect(lp).connect(g2).connect(out);
    this._end([n, r], [bp, g, lp, g2], t + D + 0.2, true);
    // shimmer: a rising pentatonic glitter, then a sparkle chord and a sub drop
    const list = penta(this._keyPc), i0 = nearestIdx(list, 72);
    for (let i = 0; i < 12; i++) INST.bell(this, this.sfxWet, t + 0.3 + i * 0.12, { n: list[Math.min(list.length - 1, i0 + i)], d: 0.6, v: 0.2 + i * 0.03 }, 1);
    [0, 2, 4, 5].forEach((d, i) => INST.bell(this, this.sfxWet, t + 1.85 + i * 0.02, { n: list[Math.min(list.length - 1, i0 + 10 + d)], d: 1.5, v: 0.4 }, 1));
    this._tone(out, t + 1.85, { f: 110, f1: 32, glide: 0.7, pk: 0.5, tau: 0.35, hold: 0.1 });
    this._duck(0.35, 2.4);
  }

  // Continuous rolling rumble. Called every frame; only touches AudioParams ~20×/s when values move.
  sfxRoll(speed01, size01) {
    if (!this._sfxReady()) return;
    const c = this.ctx, now = c.currentTime;
    const R = this._roll || (this._roll = this._makeRoll());
    R.lastCall = now;
    if (now - R.lastSet < 0.045) return;
    const s = clamp01(Number(speed01)), z = clamp01(Number(size01));
    const lvl = s < 0.01 ? 0 : Math.pow(s, 1.2) * (0.32 + 0.25 * z);
    const cut = 110 + (1 - z) * (1 - z) * 1500 * (0.35 + 0.65 * s) + 100 * s;
    if (Math.abs(lvl - R.lvl) < 0.004 && Math.abs(cut - R.cut) < 8 && R.on === lvl > 0) return;
    R.lastSet = now;
    R.lvl = lvl;
    R.cut = cut;
    R.on = lvl > 0;
    R.g.gain.setTargetAtTime(lvl, now, 0.07);
    R.grit.gain.setTargetAtTime(0.25 * lvl * (1 - z), now, 0.07);
    R.lp.frequency.setTargetAtTime(cut, now, 0.08);
    R.lfo.frequency.setTargetAtTime(1.5 + s * (9 - 6 * z), now, 0.1);
  }

  _makeRoll() {
    const c = this.ctx;
    const src = c.createBufferSource(), grit = c.createBufferSource();
    src.buffer = this._brown;
    grit.buffer = this._white;
    src.loop = grit.loop = true;
    const lp = c.createBiquadFilter(), hp = c.createBiquadFilter(), bp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 1.4;
    hp.type = 'highpass';
    hp.frequency.value = 40;
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.8;
    const gGrit = c.createGain(), am = c.createGain(), g = c.createGain(), lfo = c.createOscillator(), lfoG = c.createGain();
    gGrit.gain.value = 0;
    g.gain.value = 0;
    lfo.frequency.value = 3;
    lfoG.gain.value = 0.3; // tumbling bumpiness
    lfo.connect(lfoG).connect(am.gain);
    src.connect(hp).connect(lp).connect(am);
    grit.connect(bp).connect(gGrit).connect(am);
    am.connect(g).connect(this.sfxBus);
    src.start();
    grit.start(0, 0.7);
    lfo.start();
    return { g, grit: gGrit, lp, lfo, lastCall: 0, lastSet: -1, lvl: 0, cut: 400, on: false };
  }

  setMuted(muted) {
    this._muted = !!muted;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    hold(this.master.gain, now);
    this.master.gain.setTargetAtTime(this._muted ? 0 : 1, now, 0.04);
  }
}

// Stereo hall-ish impulse response: decaying noise that darkens over time.
function makeIR(c, sec) {
  const sr = c.sampleRate, len = Math.floor(sr * sec), pre = Math.floor(sr * 0.012), buf = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.9 - 0.75 * x);
      d[i] = lp * Math.exp(-6 * x);
    }
  }
  return buf;
}
