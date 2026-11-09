// timeline.js — stage definitions and the tempo map (a list of segments, one per stage).
// Song time 0 is the downbeat of the first stage. Every segment starts on a bar line.

// chords: [bass root midi, chord tones midi]; scale: pentatonic used for melodies and hit chimes
export const STAGES = {
  warm: {
    name: 'FIRST LIGHT', sub: 'WARM-UP', bpm: 90, level: 0, cap: 1, approach: 2.7, palette: 'dawn',
    chords: [[41, [53, 57, 60, 64]], [43, [55, 59, 62, 64]], [40, [52, 55, 59, 62]], [45, [57, 60, 64, 67]]],
    scale: [72, 74, 76, 79, 81, 84, 86, 88, 91, 93],
  },
  lake: {
    name: 'STARLIT LAKE', sub: 'STAGE 1', bpm: 100, level: 1, cap: 4, approach: 2.35, palette: 'lake',
    chords: [[45, [57, 60, 64, 69]], [41, [57, 60, 65, 69]], [48, [55, 60, 64, 67]], [43, [55, 59, 62, 67]]],
    scale: [69, 72, 74, 76, 79, 81, 84, 86, 88, 91],
  },
  river: {
    name: 'METEOR STREAM', sub: 'STAGE 2', bpm: 110, level: 1, cap: 4, approach: 2.1, palette: 'river',
    chords: [[38, [57, 62, 65, 69]], [46, [58, 62, 65, 70]], [41, [57, 60, 65, 69]], [48, [55, 60, 64, 67]]],
    scale: [74, 77, 79, 81, 84, 86, 89, 91, 93, 96],
  },
  meteor: {
    name: 'STARFALL', sub: 'STAGE 3', bpm: 118, level: 2, cap: 4, approach: 1.9, palette: 'meteor',
    chords: [[40, [55, 59, 64, 67]], [48, [55, 60, 64, 67]], [43, [55, 59, 62, 67]], [38, [57, 62, 66, 69]]],
    scale: [76, 79, 81, 83, 86, 88, 91, 93, 95, 98],
  },
  aurora: {
    name: 'AURORA RUSH', sub: 'FINAL STAGE', bpm: 126, level: 2, cap: 4, approach: 1.75, palette: 'aurora',
    chords: [[42, [57, 61, 66, 69]], [38, [57, 62, 66, 69]], [45, [57, 61, 64, 69]], [40, [56, 59, 64, 68]]],
    scale: [78, 81, 83, 85, 88, 90, 93, 95, 97, 100],
  },
  cool: {
    name: 'STARGAZE', sub: 'COOL-DOWN', bpm: 76, level: -1, cap: 0, approach: 3.2, palette: 'cool',
    chords: [[36, [55, 59, 60, 64]], [45, [55, 57, 60, 64]], [41, [53, 57, 60, 64]], [43, [55, 59, 62, 64]]],
    scale: [72, 74, 76, 79, 81, 84, 86, 88, 91, 93],
  },
  menu: {
    name: 'menu', sub: '', bpm: 70, level: -1, cap: -1, approach: 3, palette: 'lake',
    chords: [[45, [57, 60, 64, 71]], [41, [57, 60, 64, 69]], [48, [55, 60, 64, 71]], [43, [55, 59, 62, 69]]],
    scale: [69, 72, 74, 76, 79, 81, 84],
  },
};

// [stage, seconds] — cool-down length comes from its fixed routine (see chart.js)
export const MODES = {
  journey: { label: 'JOURNEY', chip: '14 MIN', note: 'ウォームアップから整理運動までのフルコース', icon: 'route', plan: [['warm', 100], ['lake', 150], ['river', 165], ['meteor', 165], ['aurora', 120], ['cool', 0]] },
  quick: { label: 'QUICK', chip: '6 MIN', note: '仕事の合間にサクッと全身リフレッシュ', icon: 'bolt', plan: [['warm', 50], ['lake', 70], ['river', 75], ['meteor', 70], ['cool', 0]] },
  endless: { label: 'ENDLESS', chip: '∞', note: '周回ごとにテンポアップ。好きなだけ', icon: 'infinity', plan: [['warm', 60]] },
};
const ENDLESS_LOOP = ['lake', 'river', 'meteor', 'aurora'];

export class Timeline {
  constructor() { this.segs = []; this.loop = 0; }

  get end() { return this.segs.length ? this.segs[this.segs.length - 1].t1 : 0; }
  get last() { return this.segs[this.segs.length - 1]; }

  add(stageKey, seconds, { bars = 0, bpm = 0 } = {}) {
    const st = STAGES[stageKey];
    const tempo = bpm || st.bpm;
    const beatSec = 60 / tempo;
    const barSec = beatSec * 4;
    if (!bars) bars = Math.max(4, Math.round(seconds / barSec / 2) * 2);
    const t0 = this.end;
    const seg = {
      index: this.segs.length, key: stageKey, stage: st, bpm: tempo, beatSec, barSec, bars,
      t0, t1: t0 + bars * barSec, generated: false, loop: this.loop,
    };
    this.segs.push(seg);
    return seg;
  }

  // endless mode: next stage of the loop, a little faster every lap
  addEndless(secondsPerStage = 90) {
    const n = this.segs.filter((s) => s.key !== 'warm' && s.key !== 'cool').length;
    const key = ENDLESS_LOOP[n % ENDLESS_LOOP.length];
    this.loop = Math.floor(n / ENDLESS_LOOP.length);
    const bpm = Math.min(140, STAGES[key].bpm + this.loop * 6);
    return this.add(key, secondsPerStage, { bpm });
  }

  at(t) {
    const s = this.segs;
    for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].t0) return s[i];
    return s[0];
  }

  beatIn(seg, t) { return (t - seg.t0) / seg.beatSec; }
  time(seg, beat) { return seg.t0 + beat * seg.beatSec; }

  // cut the timeline at the first bar line at least `leadBars` bars after t, dropping later segments
  cutAfter(t, leadBars = 1) {
    const seg = this.at(t);
    const bar = Math.floor((t - seg.t0) / seg.barSec) + 1 + leadBars;
    seg.bars = Math.min(seg.bars, Math.max(1, bar));
    seg.t1 = seg.t0 + seg.bars * seg.barSec;
    this.segs.length = seg.index + 1;
    return seg.t1;
  }
}
