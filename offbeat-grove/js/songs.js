// js/songs.js — the built-in songs. All of them are original and generated live with Web Audio
// (js/synth.js): a song is a tempo, a key, a chord loop, a 2-bar melody, a list of sections and a
// "style" that says what every instrument plays in one bar of 16 steps (sixteenth notes).
// Each style was chosen for how clearly it carries the beat and the offbeat:
//   hip-hop  kick and snare on the beat, hi-hats on the "&"           → on-beat practice
//   ska      the guitar chop plays every "&" and nothing else           → the offbeat, as plain as it gets
//   funk     sixteenth-note bass and clav                               → syncopation
//   house    four-on-the-floor kick, the open hi-hat and bass on "&"   → offbeat over a steady pulse
//   breaks   broken kick pattern, fast hats                              → advanced syncopation
//   drill    only a metronome groove, any tempo                          → pure practice

const Q = {
  maj: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  m9: [0, 3, 7, 10, 14], 6: [0, 4, 7, 9], add9: [0, 4, 7, 14], sus4: [0, 5, 7], 9: [0, 4, 7, 10, 14],
};
const MAJ_PENTA = [0, 2, 4, 7, 9];
const MIN_PENTA = [0, 3, 5, 7, 10];

// chord tones folded into [lo, hi]
export function voice(root, q, lo = 55, hi = 72) {
  return Q[q].map((i) => { let m = root + i; while (m < lo) m += 12; while (m > hi) m -= 12; return m; }).sort((a, b) => a - b);
}
const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };

// [name, bars, energy]: 0 intro/outro, 0.5 break (dodges), 1 verse, 2 chorus, 3 peak
const sec = (list) => list.map(([name, bars, e]) => ({ name, bars, e }));

export const SONGS = [
  {
    id: 'dew', title: 'Morning Dew', jp: '朝つゆのビート', genre: 'ローファイ・ヒップホップ', bpm: 90, key: 50, penta: MAJ_PENTA, style: 'hiphop',
    prog: [[5, 'maj7'], [4, 'm7'], [2, 'm7'], [7, '7']],
    motif: [[0, 5, 2], [2, 6, 2], [4, 5, 4], [10, 3, 2], [12, 4, 4], [16, 3, 3], [19, 2, 3], [22, 1, 2], [24, 2, 4], [30, 4, 2]],
    tip: 'ゆったり。表拍の練習にどうぞ。キック「ドン」とスネア「タン」が表、ハイハット「チッ」が裏です。',
    full: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['A', 8, 1], ['break', 4, 0.5], ['C', 8, 3], ['B', 8, 2], ['C', 8, 3], ['outro', 4, 0]]),
    short: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['C', 8, 3], ['outro', 4, 0]]),
  },
  {
    id: 'skank', title: 'River Skank', jp: '川辺のスカ', genre: 'スカ／ロックステディ', bpm: 100, key: 43, penta: MIN_PENTA, style: 'ska',
    prog: [[0, 'm'], [8, 'maj'], [10, 'maj'], [0, 'm']],
    motif: [[2, 4, 2], [6, 4, 2], [10, 3, 2], [14, 2, 2], [18, 2, 2], [22, 3, 2], [26, 4, 3], [30, 5, 2]],
    tip: 'ギターの「チャッ」が全部、裏拍。裏拍をいちばん感じやすい曲です。まずはここから。',
    full: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['A', 8, 1], ['break', 4, 0.5], ['B', 8, 2], ['C', 8, 3], ['A', 8, 1], ['C', 8, 3], ['outro', 4, 0]]),
    short: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['C', 8, 3], ['outro', 4, 0]]),
  },
  {
    id: 'funk', title: 'Summit Funk', jp: '山頂ファンク', genre: 'ファンク', bpm: 108, key: 40, penta: MIN_PENTA, style: 'funk',
    prog: [[0, 'm7'], [0, 'm7'], [5, '9'], [5, '9']],
    motif: [[0, 5, 1], [3, 4, 1], [6, 3, 2], [8, 4, 1], [10, 2, 2], [14, 0, 2], [19, 2, 1], [22, 3, 2], [24, 4, 1], [27, 5, 3]],
    tip: 'ベースとクラビネットが16分の裏で跳ねます。シンコペーションの練習に。',
    full: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['A', 8, 1], ['B', 8, 2], ['break', 4, 0.5], ['C', 8, 3], ['C', 8, 3], ['B', 8, 2], ['outro', 4, 0]]),
    short: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['C', 8, 3], ['outro', 4, 0]]),
  },
  {
    id: 'canopy', title: 'Canopy House', jp: '木もれびハウス', genre: 'ディープハウス', bpm: 122, key: 45, penta: MIN_PENTA, style: 'house',
    prog: [[0, 'm9'], [8, 'maj7'], [3, 'maj7'], [10, '6']],
    motif: [[0, 5, 2], [3, 4, 2], [6, 5, 2], [10, 3, 3], [14, 2, 2], [16, 5, 2], [19, 4, 2], [22, 7, 3], [26, 6, 2], [30, 5, 2]],
    tip: 'キックが表拍を4つ打ち、オープンハイハット「ツー」とベースが裏拍。体はキックで、パンチはハイハットで。',
    full: sec([['intro', 8, 0], ['A', 16, 1], ['B', 8, 2], ['break', 8, 0.5], ['C', 16, 3], ['B', 8, 2], ['C', 8, 3], ['outro', 8, 0]]),
    short: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['C', 8, 3], ['outro', 4, 0]]),
  },
  {
    id: 'breaks', title: 'Firefly Breaks', jp: 'ほたるのブレイクビーツ', genre: 'ブレイクビーツ', bpm: 134, key: 41, penta: MIN_PENTA, style: 'breaks',
    prog: [[0, 'm'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
    motif: [[0, 5, 6], [6, 4, 2], [8, 3, 4], [12, 4, 4], [16, 5, 4], [20, 7, 4], [24, 6, 6], [30, 4, 2]],
    tip: '速くて、キックがずれて入る上級者向け。裏拍が取れるようになったら挑戦。',
    full: sec([['intro', 8, 0], ['A', 16, 1], ['B', 8, 2], ['break', 8, 0.5], ['C', 16, 3], ['B', 8, 2], ['C', 8, 3], ['outro', 8, 0]]),
    short: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['C', 8, 3], ['outro', 4, 0]]),
  },
  {
    id: 'drill', title: 'Metronome Trail', jp: 'メトロノームの小道', genre: 'リズムドリル', bpm: 100, key: 48, penta: MAJ_PENTA, style: 'drill', drill: true,
    prog: [[0, 'maj7'], [5, 'maj7']],
    motif: [],
    tip: 'ドラムだけのシンプルな伴奏。テンポを自由に変えて、苦手なリズムをくり返し練習できます。',
    full: sec([['intro', 4, 0], ['A', 8, 1], ['A', 8, 1], ['B', 8, 2], ['break', 4, 0.5], ['B', 8, 2], ['C', 8, 2], ['outro', 4, 0]]),
    short: sec([['intro', 4, 0], ['A', 8, 1], ['B', 8, 2], ['outro', 4, 0]]),
  },
];

export const songById = (id) => SONGS.find((s) => s.id === id) || SONGS[1];

// one entry per bar: section, energy, position in the section, chord
export function planBars(song, length = 'full') {
  const out = [];
  const list = song[length] || song.full;
  let gi = 0;
  list.forEach((s, si) => {
    for (let bi = 0; bi < s.bars; bi++) {
      const pc = song.prog[(gi) % song.prog.length];
      out.push({ gi, sec: s.name, si, e: s.e, bi, bn: s.bars, root: song.key + pc[0], q: pc[1], first: bi === 0, last: bi === s.bars - 1, nextE: list[si + 1] ? list[si + 1].e : -1 });
      gi++;
    }
  });
  return out;
}

const mel = (song, deg, oct = 0) => {
  const p = song.penta;
  const o = Math.floor(deg / p.length);
  return fold(song.key, 60, 71) + p[((deg % p.length) + p.length) % p.length] + 12 * (o + oct);
};

// play this bar's half of the 2-bar melody
function melody(B, inst, o = {}) {
  const half = B.gi % 2;
  for (const [s, d, len] of B.song.motif) {
    if (Math.floor(s / 16) !== half) continue;
    const midi = mel(B.song, d, o.oct || 0);
    const t = B.at(s % 16);
    if (inst === 'brass' || inst === 'saws') B.S[inst](B.seg, t, [midi], len * B.step * 0.9, o);
    else B.S[inst](B.seg, t, midi, len * B.step, o);
  }
}

const bassNote = (root) => fold(root, 33, 44);

export const STYLES = {
  hiphop(B) {
    const { S, seg, e, gi } = B;
    const D = (n, s, v, o) => S.drum(seg, n, B.at(s), v, o);
    if (e >= 1) {
      // the on-beat practice song: kick plainly on 1 and 3, one soft pickup every other bar
      D('kickSoft', 0, 1); D('kickSoft', 8, 0.85);
      if (gi % 2 === 1) D('kickSoft', 10, 0.4);
      D('snare', 4, 0.85, { wet: 0.15 }); D('snare', 12, 0.9, { wet: 0.15 });
      D('rim', 4, 0.22); D('rim', 12, 0.22);
    }
    for (let s = 2; s < 16; s += 4) D('hat', s, e >= 1 ? 0.34 : 0.24, { pan: 0.25 });
    if (e >= 1) for (let s = 0; s < 16; s += 4) D('hat', s, 0.14, { pan: 0.25 });
    if (e >= 2) { D('hat', 15, 0.1, { pan: 0.25 }); D('shaker', 6, 0.16, { pan: -0.3 }); D('shaker', 14, 0.16, { pan: -0.3 }); }
    if (B.last && e >= 1 && B.nextE >= 1) { D('snare', 14, 0.3); D('snare', 15, 0.42); }
    if (B.first && e >= 2) D('crash', 0, 0.3, { wet: 0.3 });
    const r = bassNote(B.root);
    if (e >= 1) {
      const o = { wave: 'triangle', cut: 420, env: 260, sub: 0.8, vel: 0.48 };
      S.bass(seg, B.at(0), r, B.step * 5.5, o);
      S.bass(seg, B.at(8), r + 7, B.step * 5, o);
      S.bass(seg, B.at(14), r + 12, B.step * 1.6, { ...o, vel: 0.36 });
    }
    const ch = voice(B.root, B.q, 54, 71);
    if (e < 1) S.keys(seg, B.at(0), ch, B.step * 14, { vel: 0.32 });
    else { S.keys(seg, B.at(0), ch, B.step * 5, { vel: 0.32 }); S.keys(seg, B.at(6), ch, B.step * 7, { vel: 0.24 }); }
    if (e <= 0.5 || e >= 3) S.pad(seg, B.at(0), voice(B.root, B.q, 50, 66), B.step * 16, { vel: e >= 3 ? 0.12 : 0.18 });
    if (e >= 2) melody(B, 'pluck', { vel: e >= 3 ? 0.34 : 0.26 });
    if (e >= 3) melody(B, 'pluck', { vel: 0.12, oct: 1, pan: 0.3 });
  },

  ska(B) {
    const { S, seg, e } = B;
    const D = (n, s, v, o) => S.drum(seg, n, B.at(s), v, o);
    if (e >= 1) {
      D('kick', 0, 0.85); D('kick', 8, 0.8);
      if (e >= 2) { D('snare', 4, 0.85, { wet: 0.2 }); D('snare', 12, 0.9, { wet: 0.2 }); }
      else { D('rim', 4, 0.6); D('rim', 12, 0.6); }
    }
    for (let s = 0; s < 16; s += 2) D('hat', s, s % 4 === 2 ? 0.3 : 0.13, { pan: 0.3 });
    if (e === 0.5) { D('rim', 8, 0.35); D('kick', 8, 0.6); }
    if (B.last && e >= 1 && B.nextE >= 1) { D('tom', 12, 0.4, { rate: 1.3 }); D('tom', 13, 0.4, { rate: 1.15 }); D('tom', 14, 0.45); D('tom', 15, 0.45, { rate: 0.9 }); }
    if (B.first && e >= 2) D('crash', 0, 0.28, { wet: 0.3 });
    const ch = voice(B.root, B.q, 57, 72);
    // the skank: every "&"
    for (const s of [2, 6, 10, 14]) S.skank(seg, B.at(s), ch, { vel: e < 1 ? 0.36 : 0.36 });
    if (e >= 2) for (const s of [2, 6, 10, 14]) S.organ(seg, B.at(s), voice(B.root, B.q, 52, 67), B.step * 1.2, { vel: 0.12 });
    const r = bassNote(B.root);
    if (e >= 1) {
      const o = { wave: 'triangle', cut: 500, env: 500, sub: 0.7, vel: 0.46 };
      S.bass(seg, B.at(0), r, B.step * 2.5, o);
      S.bass(seg, B.at(3), r, B.step * 1, { ...o, vel: 0.45 });
      S.bass(seg, B.at(6), r + 7, B.step * 1.6, o);
      S.bass(seg, B.at(8), r + 12, B.step * 2.5, o);
      S.bass(seg, B.at(11), r + 7, B.step * 1, { ...o, vel: 0.45 });
      S.bass(seg, B.at(14), r + 10, B.step * 1.6, o);
    }
    if (e < 1) S.pad(seg, B.at(0), voice(B.root, B.q, 50, 66), B.step * 16, { vel: 0.14 });
    if (e >= 3) melody(B, 'brass', { vel: 0.34 });
    else if (e >= 2) melody(B, 'pluck', { vel: 0.2, pan: -0.2 });
  },

  funk(B) {
    const { S, seg, e, gi } = B;
    const D = (n, s, v, o) => S.drum(seg, n, B.at(s), v, o);
    if (e >= 1) {
      const kicks = gi % 2 === 0 ? [0, 3, 10] : [0, 6, 10, 11];
      for (const s of kicks) D('kick', s, s === 0 ? 0.9 : 0.7);
      D('snare', 4, 0.85, { wet: 0.12 }); D('snare', 12, 0.9, { wet: 0.12 });
      if (e >= 2) for (const s of [7, 9, 15]) D('snare', s, 0.12);
    }
    for (let s = 0; s < 16; s++) D('hat', s, s % 2 === 0 ? (e >= 1 ? 0.26 : 0.18) : 0.1, { pan: 0.25 });
    if (gi % 2 === 1 && e >= 1) D('hatO', 14, 0.22, { pan: 0.25 });
    if (B.last && e >= 1 && B.nextE >= 1) { D('snare', 13, 0.35); D('snare', 14, 0.45); D('snare', 15, 0.55); }
    if (B.first && e >= 2) D('crash', 0, 0.3, { wet: 0.3 });
    const r = bassNote(B.root);
    if (e >= 1) {
      const o = { wave: 'sawtooth', cut: 260, env: 1800, q: 7, sub: 0.6, vel: 0.44, fDec: 0.05 };
      const line = [[0, 0, 2], [3, 12, 1], [4, 0, 1], [6, 10, 1], [7, 12, 1], [10, 7, 2], [13, 10, 1], [14, 12, 1.5]];
      for (const [s, iv, len] of line) S.bass(seg, B.at(s), r + iv, B.step * len * 0.9, o);
    }
    const ch = voice(B.root, B.q, 55, 70);
    if (e >= 1) for (const s of [1, 3, 6, 9, 11, 14]) S.clav(seg, B.at(s), ch, B.step * 0.6, { vel: s === 6 || s === 14 ? 0.32 : 0.24 });
    if (e < 1 || e >= 2) S.keys(seg, B.at(0), voice(B.root, B.q, 50, 66), B.step * 8, { vel: 0.22, cut: 1800 });
    if (e >= 3) melody(B, 'brass', { vel: 0.3 });
    else if (e >= 2) for (const s of [6, 14]) S.brass(seg, B.at(s), voice(B.root, B.q, 60, 74), B.step * 1.2, { vel: 0.22 });
  },

  house(B) {
    const { S, seg, e } = B;
    const D = (n, s, v, o) => S.drum(seg, n, B.at(s), v, o);
    const kick = e >= 1 && !(B.last && B.nextE >= 2 && B.bn >= 8);
    if (kick) for (const s of [0, 4, 8, 12]) { D('kick', s, 0.95); seg.pump(B.at(s), 0.4, 0.2); }
    if (e >= 2 || (e >= 1 && B.bi >= B.bn / 2)) { D('clap', 4, 0.5, { wet: 0.25 }); D('clap', 12, 0.5, { wet: 0.25 }); }
    for (const s of [2, 6, 10, 14]) D('hatO', s, e >= 1 ? 0.3 : 0.2, { pan: 0.2 });
    if (e >= 2) for (let s = 1; s < 16; s += 2) D('hat', s, 0.12, { pan: -0.25 });
    if (e >= 1) for (let s = 0; s < 16; s += 4) D('shaker', s + 1, 0.12, { pan: 0.35 });
    if (B.last && e >= 1 && B.nextE >= 2) for (let s = 8; s < 16; s++) D('snare', s, 0.12 + (s - 8) * 0.05);
    if (B.first && e >= 2) D('crash', 0, 0.3, { wet: 0.35 });
    const r = bassNote(B.root);
    if (e >= 1) for (const s of [2, 6, 10, 14]) S.bass(seg, B.at(s), s === 14 ? r + 12 : r, B.step * 1.5, { wave: 'sawtooth', cut: 220, env: 700, q: 4, sub: 0.75, vel: 0.42 });
    const ch = voice(B.root, B.q, 56, 72);
    if (e >= 2) for (const s of e >= 3 ? [3, 7, 10] : [3, 10]) S.stab(seg, B.at(s), ch, { vel: 0.36 });
    S.pad(seg, B.at(0), voice(B.root, B.q, 50, 67), B.step * 16, { vel: e >= 1 ? 0.12 : 0.2, cut: e >= 1 ? 1100 : 800 });
    if (e >= 3) melody(B, 'pluck', { vel: 0.26, pan: 0.15, dec: 0.12 });
    if (e === 0.5) melody(B, 'pluck', { vel: 0.16, oct: 1, dec: 0.3 });
  },

  breaks(B) {
    const { S, seg, e, gi } = B;
    const D = (n, s, v, o) => S.drum(seg, n, B.at(s), v, o);
    if (e >= 1) {
      const a = gi % 2 === 0;
      for (const s of a ? [0, 10] : [0, 2, 10, 11]) D('kick', s, s === 0 ? 0.95 : 0.75);
      D('snare', 4, 0.85, { wet: 0.18 }); D('snare', 12, 0.85, { wet: 0.18 });
      for (const s of a ? [7, 15] : [9, 14]) D('snare', s, 0.2);
      for (let s = 0; s < 16; s += 2) D('hat', s, s % 4 === 2 ? 0.26 : 0.16, { pan: 0.3 });
      if (e >= 3) for (let s = 1; s < 16; s += 2) D('hat', s, 0.08, { pan: -0.3 });
      seg.pump(B.at(0), 0.3, 0.25); seg.pump(B.at(10), 0.25, 0.2);
    } else {
      for (const s of [2, 6, 10, 14]) D('shaker', s, 0.2);
    }
    if (B.last && e >= 1 && B.nextE >= 1) for (const s of [12, 13, 14, 15]) D('tom', s, 0.4, { rate: 1.4 - (s - 12) * 0.12 });
    if (B.first && e >= 2) D('crash', 0, 0.32, { wet: 0.35 });
    const r = bassNote(B.root);
    if (e >= 1) {
      S.reese(seg, B.at(0), r, B.step * 5.5, { vel: 0.42 });
      S.reese(seg, B.at(6), r, B.step * 1.8, { vel: 0.32 });
      S.reese(seg, B.at(10), r + 12, B.step * 3.5, { vel: 0.32, cut: 700 });
      S.reese(seg, B.at(14), r + 10, B.step * 1.8, { vel: 0.3 });
    }
    const ch = voice(B.root, B.q, 55, 72);
    if (e >= 3) S.saws(seg, B.at(0), ch, B.step * 15, { vel: 0.16, cut: 2000 });
    else S.pad(seg, B.at(0), voice(B.root, B.q, 50, 67), B.step * 16, { vel: 0.17 });
    if (e >= 2) {
      const seq = [...ch, ch[ch.length - 1] + 12, ...ch.slice().reverse()];
      for (let s = 0; s < 16; s++) S.arp(seg, B.at(s), seq[s % seq.length] + 12, B.step * 0.8, { vel: s % 4 === 2 ? 0.16 : 0.1, pan: (s % 2 ? 0.3 : -0.3) });
    }
    if (e >= 3) melody(B, 'saws', { vel: 0.18, a: 0.02, rel: 0.15 });
  },

  drill(B) {
    const { S, seg, e } = B;
    const D = (n, s, v, o) => S.drum(seg, n, B.at(s), v, o);
    if (e >= 0.5) for (const s of [0, 4, 8, 12]) D('kickSoft', s, s === 0 ? 0.95 : 0.75);
    if (e >= 1) { D('rim', 4, 0.35); D('rim', 12, 0.35); }
    for (const s of [2, 6, 10, 14]) D('hat', s, 0.3, { pan: 0.25 });
    if (e >= 2) for (let s = 1; s < 16; s += 2) D('shaker', s, 0.1, { pan: -0.3 });
    S.pad(seg, B.at(0), voice(B.root, B.q, 50, 67), B.step * 16, { vel: 0.13, cut: 900 });
    if (e >= 1) S.bass(seg, B.at(0), bassNote(B.root), B.step * 3, { wave: 'triangle', cut: 400, env: 200, vel: 0.45 });
  },
};
