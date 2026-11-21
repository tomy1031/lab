// js/rules.js — the rules of tennis (singles): who wins each rally, and the score of the match.
// Pure logic, no rendering. Players: 'p' (you, the z > 0 half) and 'c' (the CPU, the z < 0 half).
import { inSingles, inServiceBox } from './physics.js';

export const other = (w) => (w === 'p' ? 'c' : 'p');
export const sideSign = (w) => (w === 'p' ? 1 : -1);
export const halfOf = (z) => (z > 0 ? 'p' : 'c');

/**
 * Judges one point (or one practice ball) from the ball's events.
 * Every method returns null (nothing decided) or a result:
 *   { type: 'point', winner, reason }   reason: out | net | double-fault | winner | ace | double-hit | volley-serve
 *   { type: 'fault' } | { type: 'let' } | { type: 'retoss' } | { type: 'serve-in' } | { type: 'in', x, z } | { type: 'out', x, z }
 */
export class Judge {
  constructor() { this.reset(); }
  reset() {
    this.phase = 'idle';        // idle | toss | serve | rally | dead
    this.server = null; this.court = 'deuce'; this.second = false;
    this.lastHitter = null; this.bounces = 0; this.netTouch = false;
    this.receiverTouched = false; this.shots = 0;
    this.practice = false;
  }
  /** a service: the server holds / tosses the ball; nothing counts until the server hits it */
  startServe(server, court, second) {
    this.reset();
    this.phase = 'toss'; this.server = server; this.court = court; this.second = !!second;
  }
  /** a ball put into play without the service rules (rally practice, ball machine). from: who sent it */
  startRally(from, practice = true) {
    this.reset();
    this.phase = 'rally'; this.lastHitter = from; this.practice = practice;
  }
  dead(r) { if (r && r.type === 'point') this.phase = 'dead'; return r; }

  hit(who) {
    if (this.phase === 'toss') {
      if (who !== this.server) return null;
      this.phase = 'serve'; this.lastHitter = who; this.bounces = 0; this.netTouch = false; this.shots = 1;
      return null;
    }
    if (this.phase === 'serve') {
      if (who === this.server) return this.dead({ type: 'point', winner: other(who), reason: 'double-hit' });
      // the receiver must let the service bounce
      return this.dead({ type: 'point', winner: this.server, reason: 'volley-serve' });
    }
    if (this.phase !== 'rally') return null;
    if (who === this.lastHitter && !this.practice) return this.dead({ type: 'point', winner: other(who), reason: 'double-hit' });
    if (this.lastHitter && who !== this.lastHitter && this.server && who !== this.server) this.receiverTouched = true;
    this.lastHitter = who; this.bounces = 0; this.netTouch = false; this.shots++;
    return null;
  }

  net() { this.netTouch = true; return null; }

  bounce(x, z) {
    const half = halfOf(z);
    if (this.phase === 'toss') return { type: 'retoss' };
    if (this.phase === 'serve') {
      const receiver = other(this.server);
      if (half === receiver && inServiceBox(x, z, sideSign(receiver), this.court)) {
        if (this.netTouch) { this.phase = 'dead'; return { type: 'let' }; }
        this.phase = 'rally'; this.bounces = 1;
        return { type: 'serve-in', x, z };
      }
      this.phase = 'dead';
      if (this.second) return { type: 'point', winner: receiver, reason: 'double-fault', x, z };
      return { type: 'fault', x, z };
    }
    if (this.phase !== 'rally') return null;
    const target = this.lastHitter ? other(this.lastHitter) : half;
    if (this.bounces === 0) {
      if (half === target && inSingles(x, z, sideSign(target))) { this.bounces = 1; return { type: 'in', x, z }; }
      if (this.practice) { this.phase = 'dead'; return { type: 'out', x, z, reason: half !== target ? 'net' : 'out' }; }
      return this.dead({ type: 'point', winner: target, reason: half !== target ? 'net' : 'out', x, z });
    }
    // second bounce: the receiver did not get to it
    if (this.practice) { this.phase = 'dead'; return { type: 'down', x, z }; }
    const ace = this.shots === 1 && this.server === this.lastHitter;
    return this.dead({ type: 'point', winner: this.lastHitter, reason: ace ? 'ace' : 'winner', x, z });
  }

  /** the ball reached a fence */
  wall(x, z) {
    if (this.phase === 'toss') return { type: 'retoss' };
    if (this.phase === 'serve') {
      this.phase = 'dead';
      if (this.second) return { type: 'point', winner: other(this.server), reason: 'double-fault' };
      return { type: 'fault', x, z };
    }
    if (this.phase !== 'rally') return null;
    if (this.bounces === 0) {
      const target = other(this.lastHitter);
      if (this.practice) { this.phase = 'dead'; return { type: 'out', x, z, reason: 'out' }; }
      return this.dead({ type: 'point', winner: target, reason: 'out', x, z });
    }
    return this.bounce(x, z === 0 ? -sideSign(this.lastHitter) : z);
  }
}

const NAMES_JA = { p: 'YOU', c: 'CPU' };
const PTS = ['0', '15', '30', '40'];
const PTS_EN = ['love', 'fifteen', 'thirty', 'forty'];

/** The score of a match: points, games, sets, tie-breaks, the server and the court to serve from. */
export class Score {
  /** opt: { sets: 1 | 3, games: 6 | 4 (games to win a set), tiebreak: bool, noAd: bool, first: 'p' | 'c' } */
  constructor(opt = {}) {
    this.opt = { sets: 1, games: 6, tiebreak: true, noAd: false, first: 'p', ...opt };
    this.points = { p: 0, c: 0 };
    this.games = { p: 0, c: 0 };
    this.sets = [];               // finished sets: [{p, c, tb?}]
    this.setsWon = { p: 0, c: 0 };
    this.tb = false; this.tbFirst = null;
    this.gameServer = this.opt.first;
    this.over = false; this.winner = null;
    this.history = [];
  }
  get setsToWin() { return this.opt.sets === 3 ? 2 : this.opt.sets === 5 ? 3 : 1; }
  /** who serves the next point */
  server() {
    if (!this.tb) return this.gameServer;
    const n = this.points.p + this.points.c;
    if (n === 0) return this.tbFirst;
    return Math.floor((n - 1) / 2) % 2 === 0 ? other(this.tbFirst) : this.tbFirst;
  }
  /** 'deuce' (right court, even point count) or 'ad' */
  court() { return (this.points.p + this.points.c) % 2 === 0 ? 'deuce' : 'ad'; }

  /** the point goes to w. Returns { game, set, match, tbStart } */
  point(w) {
    if (this.over) return { match: true };
    const o = other(w);
    this.points[w]++;
    const a = this.points[w], b = this.points[o];
    let game = false;
    if (this.tb) game = a >= 7 && a - b >= 2;
    else if (this.opt.noAd) game = a >= 4;
    else game = a >= 4 && a - b >= 2;
    const res = { game: false, set: false, match: false, tbStart: false, winner: w };
    this.history.push(w);
    if (!game) return res;
    res.game = true;
    const wasTb = this.tb;
    const tbScore = wasTb ? { p: this.points.p, c: this.points.c } : null;
    this.games[w]++;
    this.points = { p: 0, c: 0 };
    const G = this.opt.games;
    const gw = this.games[w], go = this.games[o];
    let set = false;
    if (wasTb) set = true;
    else if (gw >= G && gw - go >= 2) set = true;
    // the server alternates every game; after a tie-break the player who received first serves
    if (wasTb) this.gameServer = other(this.tbFirst);
    else this.gameServer = other(this.gameServer);
    this.tb = false;
    if (!set && this.opt.tiebreak && this.games.p === G && this.games.c === G) {
      this.tb = true; this.tbFirst = this.gameServer; res.tbStart = true;
    }
    if (set) {
      res.set = true;
      this.sets.push({ p: this.games.p, c: this.games.c, tb: tbScore });
      this.setsWon[w]++;
      this.games = { p: 0, c: 0 };
      if (this.setsWon[w] >= this.setsToWin) { this.over = true; this.winner = w; res.match = true; }
    }
    return res;
  }

  /** points as shown on the board, server first: "30-15", "デュース", "アドバンテージ YOU" */
  pointText() {
    const s = this.server(), r = other(s);
    const a = this.points[s], b = this.points[r];
    if (this.tb) return `${a}-${b}`;
    if (a >= 3 && b >= 3 && !this.opt.noAd) {
      if (a === b) return 'デュース';
      return `アドバンテージ ${NAMES_JA[a > b ? s : r]}`;
    }
    if (this.opt.noAd && a === 3 && b === 3) return '40-40（決勝ポイント）';
    return `${PTS[Math.min(a, 3)]}-${PTS[Math.min(b, 3)]}`;
  }
  /** the umpire's call in English: "thirty fifteen", "deuce", "advantage you" */
  pointCall() {
    const s = this.server(), r = other(s);
    const a = this.points[s], b = this.points[r];
    if (this.tb) return `${a} ${b}`;
    if (a === 0 && b === 0) return '';
    if (a >= 3 && b >= 3 && !this.opt.noAd) {
      if (a === b) return 'deuce';
      return `advantage ${a > b ? (s === 'p' ? 'you' : 'computer') : (r === 'p' ? 'you' : 'computer')}`;
    }
    if (a === b) return `${PTS_EN[a]} all`;
    return `${PTS_EN[Math.min(a, 3)]} ${PTS_EN[Math.min(b, 3)]}`;
  }
  /** games of the current set and set scores, for the board */
  snapshot() {
    return {
      points: { ...this.points }, games: { ...this.games }, sets: this.sets.map((x) => ({ ...x })),
      setsWon: { ...this.setsWon }, tb: this.tb, server: this.server(), court: this.court(),
      text: this.pointText(), over: this.over, winner: this.winner,
    };
  }
  /** is the next point a game / set / match point for someone? */
  pressure() {
    for (const w of ['p', 'c']) {
      const save = JSON.stringify([this.points, this.games, this.sets, this.setsWon, this.tb, this.tbFirst, this.gameServer, this.over, this.winner, this.history]);
      const r = this.point(w);
      [this.points, this.games, this.sets, this.setsWon, this.tb, this.tbFirst, this.gameServer, this.over, this.winner, this.history] = JSON.parse(save);
      if (r.match) return { who: w, kind: 'match' };
      if (r.set) return { who: w, kind: 'set' };
    }
    return null;
  }
}
