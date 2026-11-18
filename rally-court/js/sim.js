// js/sim.js — one tennis session without any rendering: the ball at 240 Hz, the rules and the score, the CPU
// (and an optional bot playing your half for the demo and the tests), the ball machine, serves, and the plan
// of where you should stand for the next ball (what the stepping / auto movement walks you to).
// The browser game (game.js) feeds it your body position and your racket; node tests run it alone.
import { H, makeBall, copyBall, step, SURFACES, COURT, speed as vlen, rpm as wrpm } from './physics.js';
import { predict, planIntercept, findEvent } from './predict.js';
import { solveSafe } from './solver.js';
import { Judge, Score, other } from './rules.js';
import { Cpu, rng, gauss } from './ai.js';

const CALL_EN = {
  out: 'out', fault: 'fault', let: 'let', 'double-fault': 'double fault',
};
export const REASON_JA = {
  out: 'アウト', net: 'ネット', 'double-fault': 'ダブルフォルト', winner: 'ウィナー', ace: 'サービスエース',
  'double-hit': 'ツーバウンド前に2回触った', 'volley-serve': 'サーブをノーバウンドで打った', fault: 'フォルト', let: 'レット',
};

export class Sim {
  /** opt: { get(key) → setting, seed, bot (a CPU plays your half) } */
  constructor(opt) {
    this.get = opt.get;
    this.rand = rng(opt.seed || (Date.now() & 0xffff) + 1);
    this.ball = makeBall({ x: 0, y: 1, z: -11 });
    this.live = false;                   // the ball is in the air / on the court and simulated
    this.holder = null;                  // 'p' while you hold the ball for your serve
    this.stepN = 0; this.acc = 0; this.time = 0;
    this.judge = new Judge();
    this.cpu = new Cpu(-1, { rand: this.rand });
    this.bot = opt.bot ? new Cpu(1, { rand: this.rand }) : null;
    this.cpuActive = true;
    this.body = { x: 0, z: 12.6, vx: 0, vz: 0 };      // your body (set by the game every frame, or by the bot)
    this.events = [];
    this.pred = null; this.flight = 0;
    this.playerPlan = null; this.planT = 0;
    this.ready = { x: 0, z: 12.6 };
    this.phase = 'idle'; this.timer = 0; this.next = null;
    this.stats = this.freshStats();
    this.mode = 'match';
    this._save = makeBall();
  }
  freshStats() { return { shots: 0, rally: 0, bestRally: 0, lastKmh: 0, lastRpm: 0, topKmh: 0, serves: 0, servesIn: 0, topServe: 0, returnsIn: 0, returns: 0, points: { p: 0, c: 0 } }; }
  get surf() { return SURFACES[this.get('surface')] || SURFACES.hard; }
  emit(e) { this.events.push(e); }
  handSign() { return this.get('hand') === 'left' ? -1 : 1; }

  // ── sessions ───────────────────────────────────────────────────────────
  start(mode) {
    this.mode = mode;
    this.stats = this.freshStats();
    this.cpu.setLevel(this.get('level'));
    this.cpu.friendly = mode === 'rally';
    if (this.bot) { this.bot.setLevel(Math.max(3, this.get('level'))); this.bot.handSign = this.handSign(); }
    this.cpuActive = mode === 'match' || mode === 'rally';
    this.score = mode === 'match' ? new Score({ sets: this.get('sets'), games: this.get('games'), tiebreak: true, noAd: this.get('noAd'), first: this.get('firstServe') }) : null;
    this.live = false; this.holder = null;
    this.serveCourt = 'deuce'; this.second = false;
    this.emit({ type: 'session', mode });
    this.cpu.place(0, -(COURT.halfLen + 0.8));
    this.schedule(0.6, () => this.nextBall());
    this.phase = 'between';
  }
  schedule(t, fn) { this.timer = t; this.next = fn; }

  nextBall() {
    this.playerPlan = null;
    this.emit({ type: 'clear' });
    if (this.mode === 'match') return this.startPoint(false);
    if (this.mode === 'serve') {
      this.serveCourt = this.stats.serves % 2 === 0 ? 'deuce' : 'ad';
      return this.startServeP(this.serveCourt, false);
    }
    if (this.mode === 'rally') return this.feedRally();
    if (this.mode === 'machine') { this.machineNext = this.time + this.get('machineInterval'); return this.feedMachine(); }
  }

  startPoint(second) {
    const sc = this.score;
    const server = sc.server(), court = sc.court();
    this.second = second;
    this.serveCourt = court;
    this.emit({ type: 'score', snap: sc.snapshot() });
    if (server === 'p') {
      // the CPU receives in its deuce (right, −x) or ad court
      this.cpu.place((court === 'deuce' ? -1 : 1) * 2.3, -(COURT.halfLen + (second ? 0.6 : 1.4)));
      this.startServeP(court, second);
    } else {
      this.placeBody((court === 'deuce' ? 1 : -1) * 2.3, COURT.halfLen + (second ? 0.6 : 1.3));
      this.cpu.serveBegin(court, second);
      this.judge.startServe('c', court, second);
      this.live = false; this.holder = 'c';
      this.phase = 'serve-c';
      this.emit({ type: 'serve-ready', who: 'c', court, second });
    }
  }
  startServeP(court, second) {
    this.placeBody((court === 'deuce' ? 1 : -1) * 0.75, COURT.halfLen + 0.3);
    this.judge.startServe('p', court, second);
    this.live = false; this.holder = 'p';
    this.phase = 'serve-p';
    this.emit({ type: 'serve-ready', who: 'p', court, second });
    if (this.bot) this.bot.serveBegin(court, second);
  }
  placeBody(x, z) {
    Object.assign(this.body, { x, z, vx: 0, vz: 0 });
    this.ready = { x, z };
    if (this.bot) this.bot.place(x, z);
    this.emit({ type: 'place', x, z });
  }

  /** you released the ball for your serve (from the game's hand tracking) */
  toss(p, v) {
    if (this.holder !== 'p') return;
    this.holder = null; this.live = true;
    Object.assign(this.ball.p, p); Object.assign(this.ball.v, v);
    this.ball.w.x = this.ball.w.y = this.ball.w.z = 0;
    this.ball.rolling = this.ball.stopped = false;
    this.emit({ type: 'toss', who: 'p' });
  }

  feedRally() {
    this.cpu.place((this.rand() - 0.5) * 1.5, -(COURT.halfLen + 0.4));
    const c = { x: this.cpu.s.x - 0.6, y: 0.95, z: this.cpu.s.z + 0.45 };
    const fhX = this.handSign();
    const T = { x: (this.rand() < 0.5 ? fhX : -fhX) * (1.2 + this.rand() * 1.2), z: COURT.halfLen - 2.6 - this.rand() * 1.4 };
    const sp = 16 + this.get('level') * 2;
    const sol = solveSafe(c, T, sp, 150, this.surf, 0.6);
    this.judge.startRally('c', true);
    this.launch(c, sol, 'c');
    this.cpu.swing = { kind: 'fh', tHit: this.cpu.time, cH: 0.95, u: 0 };
    this.stats.rally = 0;
    this.emit({ type: 'hit', who: 'c', x: c.x, y: c.y, z: c.z, kmh: sp * 3.6, sweet: 1 });
  }
  feedMachine() {
    const c = { x: 0, y: 1.05, z: -(COURT.halfLen + 0.2) };
    const course = this.get('machineCourse');
    const fhX = this.handSign();
    this.machineN = (this.machineN || 0) + 1;
    let side = course === 'fh' ? 1 : course === 'bh' ? -1 : course === 'alt' ? (this.machineN % 2 ? 1 : -1) : (this.rand() < 0.5 ? 1 : -1);
    const T = { x: side * fhX * (1.6 + this.rand() * 0.9), z: COURT.halfLen - 2.4 - this.rand() * 1.6 };
    const spinSet = this.get('machineSpin');
    const spinKind = spinSet === 'mix' ? ['flat', 'top', 'slice'][(this.rand() * 3) | 0] : spinSet;
    const spin = spinKind === 'top' ? 180 : spinKind === 'slice' ? -110 : 25;
    const sp = this.get('machineSpeed') / 3.6;
    const sol = solveSafe(c, T, sp, spin, this.surf, 0.35);
    this.judge.startRally('c', true);
    this.launch(c, sol, 'c');
    this.emit({ type: 'machine', x: c.x, y: c.y, z: c.z, kmh: sp * 3.6 });
  }
  launch(c, sol, from) {
    const b = this.ball;
    Object.assign(b.p, c);
    if (sol && sol.ok) { Object.assign(b.v, sol.v); Object.assign(b.w, sol.w); }
    else { b.v.x = 0; b.v.y = 5; b.v.z = 14; b.w.x = b.w.y = b.w.z = 0; }
    b.rolling = b.stopped = false;
    this.live = true; this.holder = null;
    this.phase = 'play';
    this.newFlight(from);
  }

  // ── each frame ────────────────────────────────────────────────────────
  /**
   * dt: frame time. hooks: { racket(b0, b1, a0, a1) → hit|null, impact(ball, hit) → info } for your racket.
   */
  update(dt, hooks = {}) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (this.timer > 0) { this.timer -= dt; if (this.timer <= 0 && this.next) { const f = this.next; this.next = null; f(); } }
    if (this.cpuActive) this.cpu.update(dt);
    if (this.bot) { this.bot.update(dt); Object.assign(this.body, this.bot.s); }
    // the CPU's serve motion
    if (this.phase === 'serve-c' && this.cpu.serve) {
      const r = this.cpu.serveUpdate(dt);
      if (r && r.toss) {
        Object.assign(this.ball.p, r.toss.p); Object.assign(this.ball.v, r.toss.v);
        this.ball.w.x = this.ball.w.y = this.ball.w.z = 0; this.ball.rolling = this.ball.stopped = false;
        this.live = true; this.holder = null;
        this.cpu.serveSchedule(predict(this.ball, this.surf, 2, 1), this.stepN + 1);
      }
    }
    if (this.bot && this.phase === 'serve-p' && this.bot.serve) {
      const r = this.bot.serveUpdate(dt);
      if (r && r.toss) { this.holder = 'p'; this.toss(r.toss.p, r.toss.v); this.bot.serveSchedule(predict(this.ball, this.surf, 2, 1), this.stepN + 1); }
    }
    if (this.mode === 'machine' && this.machineNext != null && this.time >= this.machineNext) {
      this.machineNext += this.get('machineInterval');
      if (this.machineNext < this.time) this.machineNext = this.time + this.get('machineInterval');
      this.timer = 0; this.next = null;
      this.emit({ type: 'clear' });
      this.feedMachine();
    }
    this.acc += dt;
    const n = Math.floor(this.acc / H);
    this.acc -= n * H;
    for (let k = 0; k < n; k++) this.stepOnce(hooks, k / n, (k + 1) / n);
    // re-plan your next ball now and then (you moved, or changed your mind about the wing)
    this.planT -= dt;
    if (this.planT <= 0) { this.planT = 0.25; this.planPlayer(); }
  }

  stepOnce(hooks, a0, a1) {
    this.stepN++;
    const b = this.ball;
    // scheduled strokes happen at the start of the step, exactly at the planned contact
    if (this.live && this.cpuActive && this.cpu.hitStep === this.stepN) this.cpuHit(this.cpu);
    if (this.live && this.bot && this.bot.hitStep === this.stepN) this.cpuHit(this.bot);
    if (!this.live) return;
    const save = copyBall(b, this._save);
    const ev = [];
    step(b, H, this.surf, ev);
    if (hooks.racket) {
      const hit = hooks.racket(save.p, b.p, a0, a1);
      if (hit) {
        copyBall(save, b);
        ev.length = 0;
        if (hit.s > 0.001) step(b, hit.s * H, this.surf, ev);
        this.handleEvents(ev);
        const info = hooks.impact(b, hit);
        this.humanHit(info);
        const ev2 = [];
        step(b, (1 - hit.s) * H, this.surf, ev2);
        this.handleEvents(ev2);
        return;
      }
    }
    this.handleEvents(ev);
  }

  handleEvents(ev) {
    for (const e of ev) {
      let r = null;
      if (e.type === 'bounce') { r = this.judge.bounce(e.x, e.z); this.emit({ type: 'bounce', x: e.x, z: e.z, vy: e.vy, res: r }); }
      else if (e.type === 'net') { r = this.judge.net(); this.emit({ type: 'net', x: e.x, y: e.y, cord: e.cord }); }
      else if (e.type === 'wall') { r = this.judge.wall(e.x, e.z); this.emit({ type: 'wall', x: e.x, z: e.z }); }
      else if (e.type === 'stop') { this.emit({ type: 'stop' }); }
      if (r) this.result(r);
    }
  }

  cpuHit(cpu) {
    const ctx = { surf: this.surf, opp: cpu === this.cpu ? this.body : this.cpu.s, mode: this.mode };
    let res;
    if (cpu.serve && cpu.serve.hitStep === this.stepN) {
      res = cpu.serveHit(this.ball, ctx);
      if (cpu.side > 0) { this.stats.serves++; this.stats.lastKmh = res.kmh; }
    } else res = cpu.hit(this.ball, ctx);
    if (!res.ok) { this.emit({ type: 'whiff', who: cpu.who }); return; }
    const r = this.judge.hit(cpu.who);
    this.emit({ type: 'hit', who: cpu.who, x: this.ball.p.x, y: this.ball.p.y, z: this.ball.p.z, kmh: res.kmh, kind: res.kind, sweet: 1 });
    if (r) { this.result(r); return; }
    this.stats.rally++;
    this.newFlight(cpu.who);
  }

  /** your racket hit the ball (info from racket.impact) */
  humanHit(info) {
    if (this.holder === 'p') return;
    const serving = this.judge.phase === 'toss';
    const r = this.judge.hit('p');
    const kmh = vlen(this.ball.v) * 3.6;
    this.stats.shots++; this.stats.rally++;
    this.stats.lastKmh = kmh; this.stats.lastRpm = wrpm(this.ball.w);
    this.stats.topKmh = Math.max(this.stats.topKmh, kmh);
    if (serving) { this.stats.serves++; this.stats.topServe = Math.max(this.stats.topServe, kmh); }
    this.emit({ type: 'hit', who: 'p', x: this.ball.p.x, y: this.ball.p.y, z: this.ball.p.z, kmh, rpm: this.stats.lastRpm, sweet: info.sweet, frame: info.frame, impulse: info.impulse, serve: serving });
    if (r) { this.result(r); return; }
    this.newFlight('p');
  }

  newFlight(from) {
    this.flight++;
    if (this.phase === 'serve-p' || this.phase === 'serve-c') this.phase = 'play';
    this.lastFrom = from;
    this.pred = predict(this.ball, this.surf, 5, 3);
    const step0 = this.stepN + 1;
    if (this.cpuActive && this.judge.phase !== 'dead') this.cpu.onBall(this.pred, step0, from, { surf: this.surf });
    if (this.bot && this.judge.phase !== 'dead') this.bot.onBall(this.pred, step0, from, { surf: this.surf });
    this.planPlayer(true);
  }

  /** where you should stand for the next ball (or the ready position after your shot) */
  planPlayer(fresh = false) {
    if (!this.live || this.holder || this.phase !== 'play') { if (fresh) this.playerPlan = null; return; }
    // keep the plan for the last moment before the contact (no jumping target while you swing)
    const cur = this.playerPlan;
    if (!fresh && cur && cur.flight === this.flight && cur.tAbs - this.time < 0.35) return;
    const pred = fresh ? this.pred : predict(this.ball, this.surf, 4, 3);
    if (this.lastFrom === 'p') {
      const b = findEvent(pred, 'bounce', -1);
      const keepNet = this.body.z < 6.5;
      this.ready = { x: b ? Math.max(-2.2, Math.min(2.2, b.x * 0.35)) : 0, z: keepNet ? this.body.z : COURT.halfLen + 0.7 };
      this.playerPlan = null;
      return;
    }
    const plan = planIntercept(pred, 1, {
      from: this.body, vmax: this.get('maxSpeed'), accel: this.get('accel'), decel: this.get('decel'), react: 0,
      contactH: this.get('contactH'), reach: this.get('reach'), front: this.get('front'), handSign: this.handSign(),
      volley: this.body.z < 7, prefer: this.playerPlan ? this.playerPlan.wing : null,
      bounced: !fresh && this.judge.bounces >= 1 && this.ball.p.z > 0,
    });
    if (plan) {
      plan.flight = this.flight;
      plan.tAbs = this.time + plan.t;
      this.playerPlan = plan;
    } else if (fresh) this.playerPlan = null;
  }

  // ── results ──────────────────────────────────────────────────────────
  result(r) {
    const m = this.mode;
    this.emit({ type: 'result', res: r });
    if (r.type === 'serve-in') {
      if (this.judge.server === 'p') { this.stats.servesIn++; }
      return;
    }
    if (r.type === 'in') {
      if (this.judge.lastHitter === 'p') this.stats.returnsIn++;
      if (this.judge.lastHitter === 'p') this.emit({ type: 'call', ja: 'IN', en: '', quiet: true });
      return;
    }
    if (r.type === 'retoss') {
      this.emit({ type: 'call', ja: 'もう一度トス', en: '' });
      this.schedule(0.7, () => { if (this.judge.phase === 'toss') { this.live = false; this.holder = 'p'; this.emit({ type: 'rehold' }); if (this.bot) this.bot.serveBegin(this.serveCourt, this.second); } });
      return;
    }
    if (r.type === 'fault') {
      this.emit({ type: 'call', ja: 'フォルト', en: 'fault' });
      this.finishBall(1.4, () => {
        if (m === 'match') this.startPoint(true);
        else this.nextBall();
      });
      return;
    }
    if (r.type === 'let') {
      this.emit({ type: 'call', ja: 'レット', en: 'let' });
      this.finishBall(1.4, () => {
        if (m === 'match') this.startPoint(this.second);
        else if (m === 'serve') this.startServeP(this.serveCourt, false);
      });
      return;
    }
    if (r.type === 'out') { this.emit({ type: 'call', ja: r.reason === 'net' ? 'ネット' : 'アウト', en: r.reason === 'net' ? '' : 'out' }); this.finishBall(m === 'machine' ? 0 : 1.5); return; }
    if (r.type === 'down') { this.finishBall(m === 'machine' ? 0 : 1.2); return; }
    if (r.type === 'point') {
      if (m !== 'match') { this.emit({ type: 'call', ja: REASON_JA[r.reason] || '', en: CALL_EN[r.reason] || '' }); this.finishBall(1.5); return; }
      const sc = this.score;
      this.stats.points[r.winner]++;
      this.stats.bestRally = Math.max(this.stats.bestRally, this.stats.rally);
      const res = sc.point(r.winner);
      const callEn = r.reason === 'out' ? 'out. ' : r.reason === 'double-fault' ? 'fault. ' : '';
      let en, ja;
      if (res.match) { en = `${callEn}game, set and match, ${r.winner === 'p' ? 'you' : 'computer'}`; ja = r.winner === 'p' ? 'ゲームセット！ あなたの勝ち' : 'ゲームセット　CPU の勝ち'; }
      else if (res.set) { en = `${callEn}game and set, ${r.winner === 'p' ? 'you' : 'computer'}`; ja = `セット ${r.winner === 'p' ? 'YOU' : 'CPU'}`; }
      else if (res.game) { en = `${callEn}game, ${r.winner === 'p' ? 'you' : 'computer'}`; ja = `ゲーム ${r.winner === 'p' ? 'YOU' : 'CPU'}`; }
      else { en = callEn + sc.pointCall(); ja = sc.pointText(); }
      if (res.tbStart) en += '. tie-break';
      this.emit({ type: 'point', winner: r.winner, reason: r.reason, reasonJa: REASON_JA[r.reason] || '', ja, en, game: res.game, set: res.set, match: res.match, snap: sc.snapshot(), pressure: sc.over ? null : sc.pressure() });
      this.emit({ type: 'score', snap: sc.snapshot() });
      if (res.match) { this.finishBall(0, null); this.phase = 'over'; this.emit({ type: 'match-over', winner: r.winner, snap: sc.snapshot() }); return; }
      this.finishBall(res.game ? 3.2 : 2.4, () => this.startPoint(false));
    }
  }
  /** let the dead ball roll on for a moment, then clear and continue */
  finishBall(t, then) {
    this.phase = 'between';
    this.playerPlan = null;
    this.cpu.idle();
    if (this.bot) this.bot.idle({ x: 0, z: COURT.halfLen + 0.7 });
    if (this.mode === 'machine') return;            // the machine keeps its own rhythm
    this.schedule(Math.max(0.05, t || 1.5), () => {
      this.live = false;
      if (then) then(); else if (this.mode !== 'match') this.nextBall();
    });
  }
}
