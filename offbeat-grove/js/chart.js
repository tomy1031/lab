// js/chart.js — turns a song's bars into punches.
//
// A bar has 16 steps (sixteenth notes). Step 0, 4, 8, 12 are the beats "1 2 3 4" (表拍), steps 2, 6, 10, 14
// are the "&" between them (裏拍), and the odd steps are the sixteenth offbeats "e" and "a".
// Every 4-bar phrase picks one rhythm pattern for the chosen rhythm mode and repeats it (with the same
// hands and punches) so the body can lock in, then the next phrase changes it. The song's energy decides
// how busy it gets: quiet intros use the easiest patterns, choruses add hooks and uppercuts, breaks add
// branches to duck under — always on the downbeat, so the body keeps the beat while the fists play the "&".
import { rng } from './util.js';

export const MODES = {
  on: { name: '表拍', en: 'ON BEAT', desc: '「1・2・3・4」の拍でパンチ。まずはテンポに体をのせる基本。' },
  off: { name: '裏拍', en: 'OFFBEAT', desc: '拍と拍のまん中「&（エン）」でパンチ。体（ひざ）で表拍を感じながら、その間を打ちます。' },
  mix: { name: '表裏ミックス', en: 'SWITCH', desc: '表拍の小節と裏拍の小節が入れかわります。切りかえで迷わない練習。' },
  sync: { name: 'シンコペーション', en: 'SYNCOPATION', desc: '3-3-2（トレシージョ）やクラーベ、16分の裏など、ずれたリズム。' },
};
export const DIFFS = {
  easy: { name: 'やさしい', en: 'EASY' },
  normal: { name: 'ふつう', en: 'NORMAL' },
  hard: { name: 'はげしい', en: 'HARD' },
};

// patterns: a list of bars, each a list of steps
const PAT = {
  on: {
    easy: [[[0, 8]], [[0, 4, 8]], [[0, 8, 12]]],
    normal: [[[0, 4, 8, 12]], [[0, 4, 8]], [[0, 8, 12]], [[0, 4, 12]]],
    hard: [[[0, 4, 8, 12]], [[0, 4, 8, 12], [0, 4, 8]], [[0, 4, 8, 12], [0, 8, 12]]],
  },
  off: {
    easy: [[[6, 14]], [[2, 10]], [[2, 6, 14]]],
    normal: [[[2, 6, 10, 14]], [[2, 6, 10]], [[6, 10, 14]], [[2, 10, 14]]],
    hard: [[[2, 6, 10, 14]], [[2, 6, 10, 14], [2, 6, 10, 15]], [[2, 6, 10, 14], [2, 6, 11, 14]]],
  },
  mix: {
    easy: [[[0, 8], [6, 14]], [[0, 4, 8], [2, 10]], [[0, 6], [8, 14]]],
    normal: [[[0, 4, 8, 12], [2, 6, 10, 14]], [[0, 6, 8, 14]], [[0, 2, 8, 10]], [[4, 6, 12, 14]]],
    hard: [[[0, 2, 4, 6, 8, 12]], [[0, 6, 8, 14], [2, 4, 10, 12]], [[0, 2, 6, 8, 10, 14]], [[0, 4, 8, 12], [2, 6, 10, 14]]],
  },
  sync: {
    easy: [[[0, 6, 12]], [[0, 6]], [[0, 6, 12], [0, 8]]],
    normal: [[[0, 6, 12]], [[0, 6, 12], [4, 8]], [[0, 6, 10]], [[2, 8, 14]]],
    hard: [[[0, 3, 6, 10, 12]], [[2, 5, 8, 11, 14]], [[0, 3, 7, 10, 14]], [[0, 3, 6, 9, 12, 14]]],
  },
};

const LEVELS = ['easy', 'normal', 'hard'];
export const subOf = (s) => (s % 4 === 0 ? 'on' : s % 2 === 0 ? 'and' : 'six');
export const labelOf = (s) => (s % 4 === 0 ? String(s / 4 + 1) : s % 4 === 2 ? '&' : s % 4 === 1 ? 'e' : 'a');

// where each punch meets you, relative to your eyes (x right, y up, z forward is negative), in metres
const POS = {
  straight: { x: 0.17, y: -0.12, z: -0.52 },
  body: { x: 0.15, y: -0.36, z: -0.5 },
  hook: { x: 0.33, y: -0.14, z: -0.42 },
  upper: { x: 0.13, y: -0.4, z: -0.42 },
};

export function dirOf(kind, hand) {
  const s = hand === 'L' ? 1 : -1;
  if (kind === 'hook') return norm([s, 0, -0.35]);
  if (kind === 'upper') return norm([0, 1, -0.25]);
  return [0, 0, -1];
}
function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }

// grid { spb, t0 }, bars from player.bars
export function buildChart({ bars, grid, mode, diff, seated = false, seed = 1 }) {
  const R = rng(seed);
  const D = LEVELS.indexOf(diff);
  const step = grid.spb / 4;
  const notes = [];
  const lastByHand = { L: -9, R: -9 };
  const nb = bars.length;
  for (let p = 0; p < nb; p += 4) {
    const phrase = bars.slice(p, p + 4);
    const e = phrase[0].e;
    const lvl = e <= 1 ? Math.max(0, D - 1) : D;
    const list = PAT[mode][LEVELS[lvl]];
    const pat = list[Math.floor(R() * list.length)];
    // one template per bar of the pattern: steps with hand and punch, reused in every repetition
    const templates = pat.map((steps, k) => makeTemplate(steps, k, e, D, R, grid.spb));
    phrase.forEach((bar, j) => {
      const b = p + j;
      if (b < 2 || b >= nb - 1) return; // the first two bars are for listening, the last one for the ending
      if (e === 0 && bar.sec !== 'track' && (j % 2 === 1)) return; // quiet parts: every other bar
      const barT = grid.t0 + b * grid.spb * 4;
      const duck = !seated && D >= 1 && ((e === 0.5 && j % 2 === 0) || (e >= 3 && j === 0 && D === 2) || (e >= 3 && j === 0 && p % 8 === 0));
      if (duck) notes.push({ kind: 'duck', t: barT, bar: b, step: 0, sub: 'on', label: '1', hand: null });
      let tpl = templates[j % templates.length];
      if (e === 0.5) tpl = makeTemplate(PAT[mode].easy[0][0], 0, 1, 0, R, grid.spb);
      for (const n of tpl) {
        if (duck && n.step < 6) continue; // room to come back up
        const t = barT + n.step * step;
        let hand = n.hand, kind = n.kind;
        // never ask the same hand twice too fast
        const minGap = kind === 'straight' || kind === 'body' ? 0.27 : 0.42;
        if (t - lastByHand[hand] < minGap) {
          const other = hand === 'L' ? 'R' : 'L';
          if (t - lastByHand[other] >= 0.27) { hand = other; if (kind !== 'straight' && kind !== 'body') kind = 'straight'; }
          else continue;
        }
        if (t - lastByHand[hand] < minGap) kind = 'straight';
        lastByHand[hand] = t;
        const pos = POS[kind];
        notes.push({
          kind, hand, t, bar: b, step: n.step, sub: subOf(n.step), label: labelOf(n.step),
          x: (hand === 'L' ? -1 : 1) * pos.x, y: pos.y + n.dy, z: pos.z, dir: dirOf(kind, hand),
        });
      }
    });
  }
  notes.sort((a, b) => a.t - b.t);
  notes.forEach((n, i) => { n.id = i; n.state = 'wait'; });
  return notes;
}

function makeTemplate(steps, k, e, D, R, spb) {
  const hookP = [0, e >= 2 ? 0.25 : 0, e >= 1 ? (e >= 2 ? 0.32 : 0.18) : 0][D];
  const upP = [0, e >= 3 ? 0.2 : 0, e >= 2 ? 0.25 : 0][D];
  const bodyP = [0, 0.06, 0.14][D];
  const out = [];
  let hand = 'L';
  for (const s of steps) {
    let kind = 'straight';
    const r = R();
    if (r < hookP) kind = 'hook';
    else if (r < hookP + upP) kind = 'upper';
    else if (r < hookP + upP + bodyP) kind = 'body';
    out.push({ step: s, hand, kind, dy: kind === 'straight' ? (R() - 0.5) * 0.08 : 0 });
    hand = hand === 'L' ? 'R' : 'L';
  }
  void k; void spb;
  return out;
}

// the share of notes on each subdivision (shown in the menu, and used by tests)
export function chartSummary(notes) {
  const c = { on: 0, and: 0, six: 0, duck: 0, hook: 0, upper: 0 };
  for (const n of notes) {
    if (n.kind === 'duck') { c.duck++; continue; }
    c[n.sub]++;
    if (n.kind === 'hook') c.hook++;
    if (n.kind === 'upper') c.upper++;
  }
  return c;
}
