// js/player.js — music playback with one interface for the generated songs and for your own audio file.
//
//   grid      { bpm, spb, t0 }   seconds per beat, and the song time of the first downbeat
//   bars      [{ e, sec, bi, bn, ... }]  one entry per bar (energy decides how busy the chart is)
//   start(atCtx, fromT, countIn)  start at AudioContext time atCtx, from song time fromT, after countIn beats of clicks
//   stop()    cut everything that was scheduled
//   songTime(perfMs)  song time of the sound that reaches the ear at that moment
import { planBars, STYLES } from './songs.js';

class BasePlayer {
  constructor(audio) {
    this.audio = audio;
    this.songStartCtx = Infinity;
    this.seg = null;
    this.playing = false;
  }
  songTime(perfMs, smooth = true) {
    if (!isFinite(this.songStartCtx)) return -999;
    return this.audio.heard(perfMs, smooth) - this.songStartCtx;
  }
  // AudioContext time of a song time (for scheduling guide clicks)
  ctxTime(t) { return this.songStartCtx + t; }
  stop() {
    this.playing = false;
    clearInterval(this.timer);
    if (this.seg) this.seg.stop();
    this.seg = null;
  }
  _beginSegment(atCtx, fromT, countIn) {
    if (this.seg) this.seg.stop();
    this.seg = this.audio.segment();
    const lead = countIn * this.grid.spb;
    this.songStartCtx = atCtx + lead - fromT;
    if (countIn) this.audio.countIn(this.seg, atCtx, countIn, this.grid.spb);
    this.fromT = fromT;
    this.playing = true;
  }
}

export class GenPlayer extends BasePlayer {
  constructor(audio, song, { length = 'full', bpm } = {}) {
    super(audio);
    this.kind = 'gen';
    this.song = song;
    const b = bpm || song.bpm;
    this.grid = { bpm: b, spb: 60 / b, t0: 0 };
    this.barDur = this.grid.spb * 4;
    this.bars = planBars(song, length);
    this.duration = this.bars.length * this.barDur + 2.5;
  }
  start(atCtx, fromT = 0, countIn = 0) {
    this._beginSegment(atCtx, fromT, countIn);
    this.nextBar = Math.max(0, Math.floor(fromT / this.barDur));
    this.timer = setInterval(() => this.pump(), 40);
    this.pump();
  }
  pump(horizon = 0.9) {
    if (!this.playing) return;
    const ctx = this.audio.ctx, now = ctx.currentTime;
    const S = this.audio.synth, style = STYLES[this.song.style];
    const step = this.grid.spb / 4;
    const minCtx = this.songStartCtx + this.fromT - 0.002;
    while (this.nextBar < this.bars.length && this.songStartCtx + this.nextBar * this.barDur < now + horizon) {
      const i = this.nextBar++;
      const bar = this.bars[i];
      const t0 = this.songStartCtx + i * this.barDur;
      const B = {
        ...bar, S, seg: this.seg, song: this.song, step,
        at: (s) => { const t = t0 + s * step; return t < minCtx || t < now - 0.01 ? null : t; },
      };
      style(B);
    }
  }
  // the chord under song time t (hit sounds are tuned to it)
  chordAt(t) {
    const i = Math.max(0, Math.min(this.bars.length - 1, Math.floor(t / this.barDur)));
    return this.bars[i];
  }
}

export class TrackPlayer extends BasePlayer {
  // track: { buffer, bpm, t0, bars: [{ e }] } from js/beat.js
  constructor(audio, track) {
    super(audio);
    this.kind = 'track';
    this.track = track;
    this.grid = { bpm: track.bpm, spb: 60 / track.bpm, t0: track.t0 };
    this.bars = track.bars;
    this.duration = track.buffer.duration;
  }
  start(atCtx, fromT = 0, countIn = 0) {
    this._beginSegment(atCtx, fromT, countIn);
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.track.buffer;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g);
    g.connect(this.seg.out);
    const begin = this.songStartCtx + Math.max(0, fromT);
    src.start(Math.max(begin, ctx.currentTime), Math.max(0, fromT));
    this.src = src;
  }
  stop() {
    try { this.src && this.src.stop(); } catch { /* already stopped */ }
    super.stop();
  }
  chordAt() { return null; }
}
