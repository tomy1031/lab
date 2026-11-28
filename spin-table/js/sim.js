// js/sim.js — the game without drawing: the ball, the point (rules), the score, the CPU, the ball machine.
// Modes: 'match' (against the CPU), 'rally' (practice: the CPU feeds and returns to your forehand / backhand),
// 'machine' (a ball machine), 'serve' (serve practice), 'demo' (CPU against CPU). Physics runs at 1 kHz; your
// paddle (a PaddleBody, set once per frame by the game) is swept against the ball inside every step.
import { makeBall, copyBall, step, H, TABLE, RPS, spinParts, BALL_R } from './physics.js';
import { Rally, Score, sideOf, other, serveFault } from './rules.js';
import { Bot, Planner } from './ai.js';
import { flyFirst } from './shot.js';

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const MACHINE_SPIN = { top: 40, back: -35, side: 8, none: 0, mix: null };
export const MACHINE_SPEED = { slow: 6.5, mid: 9.5, fast: 13 };

export class Sim {
  /**
   * opts: { mode, level, bestOf, seed, hand ('right'|'left'), firstServer ('p'|'c'|'random'), planner,
   *   autoP (a bot plays your side: demo / PC), machine: { spin, speed, interval, place }, serveRule ('strict'|'warn'|'off'),
   *   assist (0…1), fh, bh, blade (your rubbers) }
   */
  constructor(opts = {}) {
    this.o = opts;
    this.mode = opts.mode || 'match';
    this.rng = mulberry32(opts.seed || ((Math.random() * 2 ** 31) | 0));
    this.planner = opts.planner || new Planner(false);
    this.h = H;
    this.time = 0;
    this.acc = 0;
    this.ball = makeBall({ x: 0, y: -5, z: 0 });
    this.live = false;           // the ball is in play (physics runs)
    this.holder = null;          // 'p' | 'c' | 'machine': who has the ball to serve
    this.held = false;           // the ball sits in a hand
    this.events = [];            // for the game: sounds, haptics, messages
    this.humanPaddle = null;
    this.hand = opts.hand || 'right';
    const lvl = opts.level || 3;
    this.bots = {
      c: new Bot('c', { level: lvl, rng: this.rng, planner: this.planner, mode: this.mode === 'rally' ? 'rally' : 'match' }),
      p: opts.autoP ? new Bot('p', { level: opts.autoLevel || lvl, rng: this.rng, planner: this.planner, mode: 'match', rubber: opts.fh || 'inverted' }) : null,
    };
    if (this.mode === 'machine' || this.mode === 'serve') this.bots.c.enabled = false;
    const first = opts.firstServer === 'c' ? 'c' : opts.firstServer === 'p' ? 'p' : (this.rng() < 0.5 ? 'p' : 'c');
    this.score = new Score(opts.bestOf || 5, this.mode === 'rally' || this.mode === 'machine' ? 'c' : this.mode === 'serve' ? 'p' : first);
    this.rally = null;
    this.phase = 'idle';         // idle → wait (before a serve) → play → after (the point is decided) → … → done
    this.phaseT = 0;
    this.toss = null;            // your toss: { y0, x0, z0, top, t0 }
    this.stats = { rally: 0, best: 0, hits: 0, in: 0, faults: 0, lets: 0, served: 0, servesIn: 0, fastest: 0, maxSpin: 0, streak: 0, bestStreak: 0 };
    this.lastHuman = null;       // the last hit of yours: speeds, spin, sweet spot
    this.body = { x: 0, z: TABLE.halfL + 0.5 };   // where you stand (the game fills it)
    this.machineNext = -1;
    this.pendingMachine = false;
    this.rallyFlip = 1;
  }

  bodyOf(who) { return who === 'c' ? this.bots.c.body : (this.bots.p ? this.bots.p.body : this.body); }
  emit(type, data = {}) { this.events.push({ type, t: this.time, ...data }); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  start() {
    this.time = 0;
    this.phase = 'idle';
    this.nextPoint(0.8);
  }

  /** the next point (or feed) after `delay` seconds */
  nextPoint(delay = 1.0) {
    this.phase = 'wait';
    this.phaseT = this.time + delay;
    this.rally = null;
    this.live = false;
    this.toss = null;
    for (const k of ['c', 'p']) if (this.bots[k]) this.bots[k].reset();
    const server = this.mode === 'machine' ? 'machine' : this.mode === 'serve' ? 'p' : this.mode === 'rally' ? 'c' : this.score.server;
    this.holder = server;
    this.held = server === 'p' && !this.bots.p;
    this.ball.stopped = false;
    if (server === 'c' || (server === 'p' && this.bots.p)) {
      // the bot's ball rests in its hand until it tosses
      const bot = this.bots[server];
      this.ball.p.x = bot.body.x; this.ball.p.y = TABLE.h + 0.1; this.ball.p.z = bot.body.z;
    }
    this.emit('ready', { server });
  }

  /** your hand holds the ball at p (the game calls it every frame while you hold it) */
  setHeld(p) {
    this.ball.p.x = p.x; this.ball.p.y = p.y; this.ball.p.z = p.z;
    this.ball.v.x = this.ball.v.y = this.ball.v.z = 0;
    this.ball.w.x = this.ball.w.y = this.ball.w.z = 0;
  }
  /** you toss: the ball leaves your hand with velocity v */
  tossBall(p, v) {
    if (this.holder !== 'p' || this.phase === 'after' || this.phase === 'done') return false;
    this.setHeld(p);
    this.ball.v.x = v.x; this.ball.v.y = v.y; this.ball.v.z = v.z;
    this.ball.rolling = -1; this.ball.stopped = false;
    this.live = true; this.held = false;
    this.toss = { y0: p.y, x0: p.x, z0: p.z, top: p.y, t0: this.time };
    this.rally = new Rally('p');
    this.phase = 'play';
    this.emit('toss', { who: 'p' });
    return true;
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    // timers between points
    if (this.phase === 'wait' && this.time >= this.phaseT) this.beginServe();
    if (this.phase === 'after' && this.time >= this.phaseT) this.finishPoint();
    for (const k of ['c', 'p']) if (this.bots[k] && this.bots[k].enabled) this.bots[k].update(this, dt);
    this.serveTick();
    if (this.mode === 'machine') this.machineTick();
    // physics steps: the paddle's frame fraction for each step
    const n = Math.floor((this.acc + dt) / H + 1e-9);
    const acc0 = this.acc;
    for (let k = 1; k <= n; k++) {
      const t0 = -acc0 + (k - 1) * H, t1 = t0 + H;
      const a0 = Math.max(0, Math.min(1, t0 / dt)), a1 = Math.max(0, Math.min(1, t1 / dt));
      this.physicsStep(a0, a1);
    }
    this.acc = acc0 + dt - n * H;
    if (this.humanPaddle && this.humanPaddle.cooldown > 0) this.humanPaddle.cooldown -= dt;
  }

  physicsStep(a0, a1) {
    this.time += H;
    if (!this.live) return;
    const b = this.ball;
    const b0 = { x: b.p.x, y: b.p.y, z: b.p.z }, v0 = { ...b.v };
    const ev = [];
    step(b, H, ev);
    if (this.toss && b.p.y > this.toss.top) { this.toss.top = b.p.y; this.lastToss = { height: this.toss.top - this.toss.y0 }; }
    // your paddle
    const P = this.humanPaddle;
    if (P && P.valid && P.enabled && P.cooldown <= 0) {
      const hit = P.sweep(vec(b0), vec(b.p), a0, a1);
      if (hit) {
        // back to the moment of contact, with the velocity of that moment
        const s = hit.s;
        b.p.x = b0.x + (b.p.x - b0.x) * s; b.p.y = b0.y + (b.p.y - b0.y) * s; b.p.z = b0.z + (b.p.z - b0.z) * s;
        b.v.x = v0.x + (b.v.x - v0.x) * s; b.v.y = v0.y + (b.v.y - v0.y) * s; b.v.z = v0.z + (b.v.z - v0.z) * s;
        b.rolling = -1; b.stopped = false;
        const before = { p: { ...b.p }, v: { ...b.v } };
        const info = P.impact(b, hit);
        if (info) {
          if (this.o.assist > 0 && info.face !== 'edge') info.assisted = assistBall(b, this.o.assist);
          // the rest of the step with the new velocity
          b.p.x += b.v.x * H * (1 - s); b.p.y += b.v.y * H * (1 - s); b.p.z += b.v.z * H * (1 - s);
          ev.length = 0;
          this.onStrike('p', before, info);
        }
      }
    }
    // the bots
    for (const k of ['c', 'p']) {
      const bot = this.bots[k];
      if (!bot || !bot.enabled) continue;
      const r = bot.tryContact(this);
      if (r === 'miss') this.emit('whiff', { who: k });
      else if (r) {
        const before = { p: { ...b.p }, v: { ...r.plan.ballAt.v } };
        this.onStrike(k, before, r.info, r.plan);
      }
    }
    for (const e of ev) this.onBallEvent(e);
  }

  onStrike(who, before, info, plan = null) {
    const r = this.rally;
    const b = this.ball;
    let fault = null, warn = null;
    if (r && r.expect === 'strike' && who === 'p' && !this.bots.p) {
      const f = serveFault(this.toss && { height: this.toss.top - this.toss.y0, lateral: Math.hypot(before.p.x - this.toss.x0, before.p.z - this.toss.z0) }, before.p, before.v, 'p');
      if (f && this.o.serveRule === 'strict') fault = f; else if (f && this.o.serveRule !== 'off') warn = f;
    }
    const sp = spinParts(b.v, b.w);
    const data = { who, info, speed: Math.hypot(b.v.x, b.v.y, b.v.z), top: sp.top, side: sp.side, total: sp.total, x: b.p.x, y: b.p.y, z: b.p.z, shot: plan && plan.shot, warn, fault, serve: !!(r && r.expect === 'strike') };
    if (who === 'p') {
      this.stats.hits++;
      if (data.speed > this.stats.fastest) this.stats.fastest = data.speed;
      if (sp.total > this.stats.maxSpin) this.stats.maxSpin = sp.total;
      this.lastHuman = data;
    }
    this.emit('hit', data);
    if (this.toss) this.lastToss = { height: this.toss.top - this.toss.y0 };
    if (r) {
      if (data.serve) this.stats.served += who === 'p' ? 1 : 0;
      const res = r.strike(who, before.p, before.v, fault);
      if (res) this.pointOver(res);
    }
    this.toss = null;
    // the opponent reads the ball
    const opp = other(who);
    if (this.bots[opp] && this.bots[opp].enabled) this.bots[opp].onOpponentStrike(this.time);
  }

  onBallEvent(e) {
    this.emit(e.type, e);
    const r = this.rally;
    if (!r || r.over) return;
    let res = null;
    if (e.type === 'table') {
      if (r.expect === 'strike') {
        // the toss came down on the table without being struck
        res = this.o.serveRule === 'strict' && this.mode === 'match' ? r.end(other(r.server), 'トスを打たなかった') : r.letBall('トスのやり直し');
      } else res = r.table(e.side);
    } else if (e.type === 'net') r.net();
    else if (e.type === 'floor' || e.type === 'barrier' || e.type === 'wall' || e.type === 'side' || e.type === 'stop') {
      if (r.expect === 'strike') res = this.o.serveRule === 'strict' && this.mode === 'match' ? r.end(other(r.server), 'トスを打たなかった') : r.letBall('トスのやり直し');
      else res = r.dead(e.type);
    }
    if (res) this.pointOver(res);
  }

  pointOver(res) {
    if (this.mode !== 'machine') {
      this.phase = 'after';
      this.phaseT = this.time + (res.let ? 1.0 : 1.5);
      this.result = res;
    }
    for (const k of ['c', 'p']) if (this.bots[k]) { this.bots[k].plan = null; this.bots[k].thinkAt = -1; }
    const st = this.stats;
    const hits = this.rally ? this.rally.hits : 0;
    st.rally = hits;
    if (res.let) st.lets++;
    else {
      if (this.mode === 'rally') { if (hits > st.best) st.best = hits; }
      if (this.mode === 'machine') {
        if (res.winner === 'p') { st.in++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); } else { st.faults++; st.streak = 0; }
      }
      if (this.mode === 'serve') {
        if (res.winner === 'p') st.servesIn++; else st.faults++;
      }
      if (this.mode === 'match' || this.mode === 'demo') { if (hits > st.best) st.best = hits; }
    }
    this.emit('point', { ...res, hits, mode: this.mode });
  }

  finishPoint() {
    const res = this.result;
    this.result = null;
    if (!res) { this.nextPoint(0.6); return; }
    if (!res.let && (this.mode === 'match' || this.mode === 'demo')) {
      const out = this.score.point(res.winner);
      this.emit('score', { ...out, points: { ...this.score.points }, games: { ...this.score.games }, call: this.score.call(), server: this.score.server });
      if (out.match) { this.phase = 'done'; this.live = false; this.emit('match', { winner: out.match }); return; }
      this.nextPoint(out.game ? 3.0 : 0.6);
      return;
    }
    this.nextPoint(this.mode === 'machine' ? 0.1 : 0.6);
  }

  beginServe() {
    const who = this.holder;
    if (who === 'machine') { this.phase = 'machine'; this.machineNext = this.time + 0.4; return; }
    if (who === 'p' && !this.bots.p) { this.phase = 'serveWait'; return; }       // you toss when you like
    const bot = this.bots[who];
    this.phase = 'botServe';
    const kind = this.mode === 'rally' ? 'long-top' : undefined;
    bot.serve = null;
    bot.startServe(this, kind);
  }

  serveTick() {
    if (this.phase !== 'botServe') return;
    const who = this.holder, bot = this.bots[who];
    const s = bot.serve;
    if (!s) return;
    if (s.failed) { this.phase = 'wait'; this.phaseT = this.time + 0.5; return; }
    if (s.tossAt < 0) {
      // keep the ball in the hand while walking to the spot; toss after a short pause
      this.ball.p.x = s.P0.x; this.ball.p.y = s.P0.y; this.ball.p.z = s.P0.z;
      if (s.readyAt === undefined) s.readyAt = this.time + 0.9 + 0.6 * this.rng();
      if (this.time < s.readyAt) return;
      s.tossAt = this.time;
      const b = this.ball;
      b.p = { ...s.P0 }; b.v = { x: 0, y: s.vy0, z: 0 }; b.w = { x: 0, y: 0, z: 0 }; b.rolling = -1; b.stopped = false;
      this.live = true;
      this.rally = new Rally(who);
      this.phase = 'play';
      bot.plan = { ...s, tAbs: this.time + s.tc, wing: 'fh', shot: 'serve', ballAt: { v: { x: 0, y: -1, z: 0 } }, bodyX: bot.body.x, bodyZ: bot.body.z };
      bot.serve = null;
      this.emit('toss', { who });
    }
  }

  // ── the ball machine ──
  machineTick() {
    if (this.phase !== 'machine' || this.pendingMachine || this.time < this.machineNext) return;
    const m = this.o.machine || {};
    // the previous ball: returned onto the far half counts as in, anything else as a miss
    const r0 = this.rally;
    if (r0 && !r0.over) this.pointOver(r0.expect === 'return' && r0.last === 'p' ? r0.end('p', '入った') : r0.end('c', '返球できなかった'));
    const spinKey = m.spin === 'mix' || !m.spin ? ['top', 'back', 'side', 'none'][Math.floor(this.rng() * 4)] : m.spin;
    const top = MACHINE_SPIN[spinKey] ?? 0;
    const speed = MACHINE_SPEED[m.speed] || MACHINE_SPEED.mid;
    const fhX = this.hand === 'left' ? -1 : 1;
    let px = 0;
    if (m.place === 'fh') px = 0.38 * fhX; else if (m.place === 'bh') px = -0.35 * fhX;
    else if (m.place === 'random') px = (this.rng() * 2 - 1) * 0.6;
    else { this.rallyFlip = -this.rallyFlip; px = this.rallyFlip > 0 ? 0.38 * fhX : -0.35 * fhX; }
    const depth = top < -10 ? 0.6 + 0.35 * this.rng() : 0.95 + 0.2 * this.rng();
    const P = { x: 0, y: TABLE.h + 0.22, z: -TABLE.halfL + 0.05 };
    const sideSpin = spinKey === 'side' ? (this.rng() < 0.5 ? -1 : 1) * 30 * RPS : 0;
    this.pendingMachine = true;
    this.planner.post({ type: 'machine', P, target: { x: px, z: depth }, speed, top: top * RPS, sideSpin }, (res) => {
      this.pendingMachine = false;
      if (this.phase !== 'machine') return;
      this.machineNext = this.time + Math.max(0.6, m.interval || 1.6);
      if (!res || !res.ok) return;
      const b = this.ball;
      b.p = { ...P }; b.v = { ...res.v }; b.w = { ...res.w }; b.rolling = -1; b.stopped = false;
      this.live = true;
      const r = new Rally('c');
      r.phase = 'play'; r.last = 'c'; r.serving = false; r.expect = 'oppBounce'; r.hits = 1;
      this.rally = r;
      this.emit('machine', { speed: Math.hypot(res.v.x, res.v.y, res.v.z), spin: spinKey });
      this.stats.served++;
      if (this.bots.p) this.bots.p.onOpponentStrike(this.time);
    });
  }
}

const vec = (o) => ({ x: o.x, y: o.y, z: o.z, distanceTo(b) { return Math.hypot(this.x - b.x, this.y - b.y, this.z - b.z); } });

/**
 * Shot assist (0 = pure physics): if your ball would miss the table (net, long, wide), turn its launch —
 * keeping its speed and spin — toward the nearest launch that lands, by `amount`. Cheap: a few coarse flights.
 */
export function assistBall(b, amount) {
  const test = (dEl, dAz) => {
    const t = copyBall(b, makeBall());
    rotateLaunch(t, dEl, dAz);
    const r = flyFirst(t, 1.6, H * 3);
    return r.kind === 'table' && r.side === -1 && !r.edge;
  };
  if (b.v.z >= -0.5 || test(0, 0)) return false;
  const d2r = Math.PI / 180;
  let best = null;
  for (let k = 1; k <= 16 && !best; k++) {
    for (const [e, a] of [[k, 0], [-k, 0], [0, k], [0, -k], [k, k], [k, -k], [-k, k], [-k, -k]]) {
      if (test(e * 0.6 * d2r, a * 0.6 * d2r)) { best = [e * 0.6 * d2r, a * 0.6 * d2r]; break; }
    }
  }
  if (!best) return false;
  // a little inside the edge of what lands
  rotateLaunch(b, best[0] * Math.min(1, amount * 1.6), best[1] * Math.min(1, amount * 1.6));
  return true;
}
function rotateLaunch(b, dEl, dAz) {
  const v = b.v, s = Math.hypot(v.x, v.y, v.z);
  let el = Math.asin(Math.max(-1, Math.min(1, v.y / s))), az = Math.atan2(v.x, v.z);
  el += dEl; az += dAz;
  const c = Math.cos(el);
  const ca = Math.cos(dAz), sa = Math.sin(dAz);
  v.x = s * c * Math.sin(az); v.y = s * Math.sin(el); v.z = s * c * Math.cos(az);
  // the spin turns with the azimuth
  const wx = b.w.x, wz = b.w.z;
  b.w.x = wx * ca + wz * sa; b.w.z = -wx * sa + wz * ca;
}

export { BALL_R, sideOf };
