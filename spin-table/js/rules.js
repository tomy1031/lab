// js/rules.js — the ITTF laws for one point (service, let, return, double bounce, obstruction, edge ball) and the
// score (11-point games, win by 2, the service changing every 2 points and every point from 10-all).
// Players are 'p' (you, the +z half) and 'c' (the opponent, the −z half).
import { TABLE } from './physics.js';

export const sideOf = (who) => (who === 'p' ? 1 : -1);
export const other = (who) => (who === 'p' ? 'c' : 'p');

/** the judge of one point */
export class Rally {
  constructor(server) {
    this.server = server;
    this.phase = 'serve';     // serve (the ball is tossed / held) → play → over
    this.expect = 'strike';   // strike · ownBounce · oppBounce · return
    this.last = null;         // last player to strike the ball
    this.serving = true;      // until the receiver returns the serve
    this.netOnServe = false;
    this.hits = 0;
    this.result = null;       // { winner, reason } · { let: true, reason }
  }
  get over() { return !!this.result; }
  end(winner, reason) { if (!this.result) { this.result = { winner, reason }; this.phase = 'over'; } return this.result; }
  letBall(reason) { if (!this.result) { this.result = { let: true, reason }; this.phase = 'over'; } return this.result; }

  /**
   * A player strikes the ball. pos/vel: the ball before the strike. serveFault: a reason string if the
   * service action broke the rules (toss too low, struck while rising, in front of the end line …).
   */
  strike(who, pos, vel, serveFault = null) {
    if (this.result) return null;
    if (this.expect === 'strike') {
      if (who !== this.server) return this.end(this.server, 'レシーブ側がサーブ前に打った');
      if (serveFault) return this.end(other(who), serveFault);
      this.last = who; this.hits = 1; this.phase = 'play'; this.expect = 'ownBounce';
      return null;
    }
    if (who === this.last) {
      // the same player again without the opponent touching the ball
      return this.end(other(who), this.expect === 'return' ? '2度打ち' : '2度打ち（自分のコートに入る前）');
    }
    if (this.expect === 'return') {
      this.last = who; this.hits++; this.expect = 'oppBounce'; this.serving = false;
      return null;
    }
    // the receiver struck the ball before it bounced on their court: obstruction if it was above the table
    // (or heading over it); a ball already past the end line / side line was going out
    const over = Math.abs(pos.x) <= TABLE.halfW + 0.02 && Math.abs(pos.z) <= TABLE.halfL + 0.02;
    if (over || this.expect === 'ownBounce') return this.end(this.last, 'ボレー（オブストラクション）');
    return this.end(who, 'アウト（相手コートに入らなかった）');
  }

  /** the ball touched the playing surface of half `side` (±1); edge: on the top edge */
  table(side) {
    if (this.result || this.phase !== 'play') return this.result;
    const hitterSide = sideOf(this.last);
    if (this.expect === 'ownBounce') {           // service: first on the server's court
      if (side === hitterSide) { this.expect = 'oppBounce'; return null; }
      return this.end(other(this.last), 'サーブが自分のコートに入らなかった');
    }
    if (this.expect === 'oppBounce') {
      if (side === -hitterSide) {
        if (this.serving && this.netOnServe) return this.letBall('レット（サーブがネットに触れた）');
        this.expect = 'return';
        return null;
      }
      return this.end(other(this.last), this.serving ? 'サーブが2回自分のコートに入った' : '自分のコートに落ちた');
    }
    if (this.expect === 'return') return this.end(this.last, side === -hitterSide ? 'ツーバウンド' : '返球できなかった');
    return null;
  }

  /** the ball touched the net assembly */
  net() {
    if (this.result || this.phase !== 'play') return;
    if (this.serving && (this.expect === 'ownBounce' || this.expect === 'oppBounce')) this.netOnServe = true;
  }

  /** the ball touched the floor, a barrier, the side of the table, or came to rest */
  dead(reason = 'out') {
    if (this.result || this.phase !== 'play') return this.result;
    if (this.expect === 'return') return this.end(this.last, '返球できなかった');
    const why = this.expect === 'ownBounce' ? 'サーブが自分のコートに入らなかった'
      : reason === 'side' ? 'サイド（台の側面）' : 'アウト';
    return this.end(other(this.last), why);
  }
}

/** the match score */
export class Score {
  constructor(bestOf = 5, firstServer = 'p', pointsToWin = 11) {
    this.bestOf = bestOf;
    this.toWin = pointsToWin;
    this.first = firstServer;     // served first in game 1
    this.games = { p: 0, c: 0 };
    this.points = { p: 0, c: 0 };
    this.history = [];            // finished games: { p, c }
    this.over = false;
    this.winner = null;
  }
  get gameNo() { return this.history.length + 1; }
  /** who serves first in the current game (it alternates game by game) */
  get gameFirst() { return this.history.length % 2 === 0 ? this.first : other(this.first); }
  /** who serves now */
  get server() {
    const t = this.points.p + this.points.c;
    const deuce = this.toWin - 1;
    const k = t < 2 * deuce ? Math.floor(t / 2) : t - 2 * deuce;   // every 2 points; every point from 10-all
    return k % 2 === 0 ? this.gameFirst : other(this.gameFirst);
  }
  get gamesToWin() { return Math.ceil(this.bestOf / 2); }
  /** award a point. Returns { game: winner or null, match: winner or null } */
  point(who) {
    if (this.over) return { game: null, match: null };
    this.points[who]++;
    const a = this.points[who], b = this.points[other(who)];
    if (a >= this.toWin && a - b >= 2) {
      this.history.push({ ...this.points });
      this.games[who]++;
      this.points = { p: 0, c: 0 };
      if (this.games[who] >= this.gamesToWin) { this.over = true; this.winner = who; return { game: who, match: who }; }
      return { game: who, match: null };
    }
    return { game: null, match: null };
  }
  /** game point / match point for whom (or null) */
  get pointFor() {
    for (const w of ['p', 'c']) {
      const a = this.points[w], b = this.points[other(w)];
      if (a >= this.toWin - 1 && a > b) return this.games[w] === this.gamesToWin - 1 ? { who: w, match: true } : { who: w, match: false };
    }
    return null;
  }
  /** the umpire's call: the server's score first ("7–4", "10 all") */
  call() {
    const s = this.server, a = this.points[s], b = this.points[other(s)];
    if (a === b) return `${a} all`;
    return `${a}–${b}`;
  }
}

/**
 * Checks the service action (ITTF 2.6): the ball projected near-vertically ≥ 16 cm from the free hand, struck
 * while falling, behind the end line and above the level of the playing surface. Returns a reason or null.
 */
export function serveFault(toss, strikePos, strikeVel, server) {
  if (!toss) return 'トスをしていない';
  if (toss.height < 0.16) return `トスが低い（${Math.round(toss.height * 100)} cm、16 cm 以上）`;
  if (toss.lateral > 0.6) return 'トスが斜め（ほぼ真上に）';
  if (strikeVel.y > 0.05) return '上がっている途中で打った（落ちてくるところを打つ）';
  if (Math.abs(strikePos.z) < TABLE.halfL - 0.005 || Math.sign(strikePos.z) !== sideOf(server)) return 'エンドラインより前で打った';
  if (strikePos.y < TABLE.h) return '台より低い所で打った';
  return null;
}
