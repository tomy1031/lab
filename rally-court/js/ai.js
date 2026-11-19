// js/ai.js — the CPU player's decisions (pure logic; avatar.js draws it). It sees the ball's predicted path,
// reacts after its reaction time, runs with human limits (top speed, acceleration), and when the ball reaches
// the planned contact point it picks a shot (target, pace, spin), solves the launch and adds an execution
// error that grows with pace, stretching and its level. Unforced errors, winners and tired lobs come out of
// that, not out of scripted outcomes. It can play either half (side −1: the CPU; +1: the demo bot for you).
import { H, COURT, speed as vlen } from './physics.js';
import { planIntercept, findEvent } from './predict.js';
import { solveSafe, solveShot } from './solver.js';
import { moveToward, clampToArea } from './motion.js';
import { LEVELS } from './config.js';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function gauss(rand) { let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const D2R = Math.PI / 180;
export const SERVE_CONTACT = 2.68;     // m, contact height of the serve (1.83 m player, arm + racket)
export const SERVE_FRONT = 0.3;        // m, the toss / contact in front of the body

export class Cpu {
  constructor(side = -1, opt = {}) {
    this.side = side;
    this.who = side < 0 ? 'c' : 'p';
    this.handSign = 1;
    this.rand = opt.rand || Math.random;
    this.s = { x: 0, z: side * 12.6, vx: 0, vz: 0 };
    this.level = LEVELS[3];
    this.levelN = 3;
    this.time = 0;
    this.plan = null; this.hitStep = -1; this.reactUntil = 0; this.shot = null;
    this.target = { x: 0, z: side * 12.6 };
    this.swing = null;
    this.serve = null;
    this.friendly = false;
    this.lastShot = null;
  }
  setLevel(n) { this.levelN = n; this.level = LEVELS[Math.max(1, Math.min(5, n | 0))]; }
  place(x, z) {
    Object.assign(this.s, { x, z, vx: 0, vz: 0 });
    this.target = { x, z };
    this.plan = null; this.hitStep = -1; this.swing = null; this.serve = null; this.shot = null;
  }
  readyPos(bounce) {
    const x = bounce ? Math.max(-2.2, Math.min(2.2, bounce.x * 0.35)) : 0;
    return { x, z: this.side * (COURT.halfLen + 0.7) };
  }

  /** a new flight began. pred: prediction from now; step0: the current physics step; from: who sent it */
  onBall(pred, step0, from, ctx) {
    this.plan = null; this.hitStep = -1; this.shot = null;
    if (from !== this.who) this.splitT = this.time;           // split step as the opponent hits
    if (from === this.who) {
      // recover toward the middle of the possible replies
      const b = findEvent(pred, 'bounce', -this.side);
      this.target = this.readyPos(b);
      this.reactUntil = this.time + 0.15;
      return;
    }
    const lv = this.level;
    const plan = planIntercept(pred, this.side, {
      from: this.s, vmax: lv.vmax, accel: lv.accel, decel: lv.accel * 1.4, react: lv.react,
      contactH: 0.95, reach: 0.85, front: 0.4, handSign: this.handSign,
      volley: Math.abs(this.s.z) < 7.5,
    });
    if (!plan) { this.target = this.readyPos(null); return; }
    this.plan = plan;
    this.hitStep = step0 + plan.i;
    this.reactUntil = this.time + lv.react;
    this.tHit = this.time + plan.t;
    this.target = plan.stance;
    this.swing = { kind: plan.wing, volley: plan.volley, cH: plan.c.y, tHit: this.tHit, slice: false, reach: 0.85, front: 0.4 };
  }

  /** the ball is going out / the point is over: just go back */
  idle(home) { this.plan = null; this.hitStep = -1; this.shot = null; this.target = home || this.readyPos(null); }

  update(dt) {
    this.time += dt;
    const lv = this.level;
    if (this.serve) { this.s.vx *= 0.8; this.s.vz *= 0.8; return; }
    if (this.time < this.reactUntil) moveToward(this.s, null, dt, lv.vmax, lv.accel, lv.accel * 1.4);
    else moveToward(this.s, this.target, dt, lv.vmax, lv.accel, lv.accel * 1.4);
    clampToArea(this.s, this.side);
  }

  /** the stroke animation state for the avatar */
  /**
   * The stroke animation state for the avatar (js/stroke.js): the take-back starts ~1 s before the contact
   * (prep 0 → 1), the forward swing takes the last 0.45 s accelerating into the contact, the finish 0.5 s;
   * a split step when the opponent hits; the serve's toss rises the arms to the trophy position.
   */
  swingState() {
    const split = this.splitT != null ? (this.time - this.splitT) / 0.42 : -1;
    if (this.serve) {
      const sv = this.serve;
      if (sv.tHit == null) return { kind: 'serve', u: -1, toss: Math.min(1, Math.max(0, (sv.t - 0.05) / 0.85)) };
      const dt = this.time - sv.tHit;
      if (dt < -0.5) return { kind: 'serve', u: -1, toss: Math.min(1, Math.max(0, (sv.t - 0.05) / 0.85)) };
      return { kind: 'serve', u: dt < 0 ? Math.pow(1 + dt / 0.5, 1.7) - 1 : 1 - Math.pow(1 - Math.min(1, dt / 0.55), 2), toss: 1 };
    }
    const sw = this.swing;
    if (!sw) return { kind: 'ready', u: 0, split };
    const dt = this.time - sw.tHit;
    if (sw.kind === 'serve-follow') {
      if (dt > 0.6) { this.swing = null; return { kind: 'ready', u: 0, split }; }
      return { kind: 'serve', u: 1 - Math.pow(1 - Math.min(1, dt / 0.55), 2), toss: 1 };
    }
    if (dt > 0.6) { this.swing = null; return { kind: 'ready', u: 0, split }; }
    let u, prep = 1;
    if (dt < -0.45) { u = -1; prep = Math.min(1, Math.max(0, (1.0 + dt) / 0.55)); }
    else if (dt < 0) u = Math.pow(1 + dt / 0.45, 1.7) - 1;
    else u = 1 - Math.pow(1 - Math.min(1, dt / 0.5), 2);
    return { ...sw, u, prep, split };
  }

  /**
   * Decide the shot ahead of the contact (a few frames after reacting), from the predicted state of the ball at
   * the contact — so the solving doesn't land on the contact frame. pred: the flight's prediction.
   */
  prepare(pred, ctx) {
    const plan = this.plan;
    if (!plan || this.shot || plan.i > pred.n) return;
    const i = plan.i;
    const c = { x: pred.x[i], y: pred.y[i], z: pred.z[i] };
    const vin = Math.hypot(pred.vx[i], pred.vy[i], pred.vz[i]);
    const tol = 0.28 + this.level.stretch;
    const stretch = plan.reachable ? 0 : Math.min(1, plan.short / tol);
    this.shot = this.chooseShot(c, vin, stretch, ctx);
  }

  /**
   * Called at the planned step: hit the ball (mutates ball.v / ball.w). ctx: { surf, opp:{x,z}, mode }.
   * Returns { ok, kind, kmh } or { ok: false } for a miss.
   */
  hit(ball, ctx) {
    const plan = this.plan;
    const shot = this.shot;
    this.plan = null; this.hitStep = -1; this.shot = null;
    if (!plan) return { ok: false };
    const d = Math.hypot(this.s.x - plan.stance.x, this.s.z - plan.stance.z);
    const tol = 0.28 + this.level.stretch;
    if (this.swing) this.swing.tHit = this.time;
    if (d > tol) return { ok: false, reason: 'late' };
    const stretch = Math.max(0, d - 0.12) / tol;
    const sh = shot || this.chooseShot({ x: ball.p.x, y: ball.p.y, z: ball.p.z }, vlen(ball.v), stretch, ctx);
    ball.v.x = sh.v.x; ball.v.y = sh.v.y; ball.v.z = sh.v.z;
    ball.w.x = sh.w.x; ball.w.y = sh.w.y; ball.w.z = sh.w.z;
    ball.rolling = false; ball.stopped = false;
    if (this.swing) { this.swing.slice = sh.kind === 'slice'; this.swing.cH = ball.p.y; }
    this.lastShot = { kind: sh.kind, kmh: sh.kmh, rpm: sh.rpm };
    return { ok: true, kind: sh.kind, kmh: sh.kmh };
  }

  /** pick a target, pace and spin from contact point c, solve the launch and add the execution error */
  chooseShot(c, vin, stretch, ctx) {
    const lv = this.level, r = this.rand;
    const S = COURT.singlesHalfW, L = COURT.halfLen;
    const tz = -this.side;                       // the half to aim at
    const opp = ctx.opp || { x: 0, z: tz * 12 };
    let kind = 'drive', spin = lv.spin * (0.8 + 0.4 * r()), spd = lv.speed * (0.85 + 0.3 * r()), margin = lv.margin;
    let T;
    if (this.friendly || ctx.mode === 'rally') {
      // rally practice: keep it in play, to the forehand and backhand alternately, moderate pace
      spd = Math.min(spd, 18 + this.levelN * 2.6) * (0.9 + 0.15 * r());
      margin = 1.5;
      this.alt = !this.alt;
      const fhX = (tz > 0 ? 1 : -1) * (ctx.oppHand || 1);   // the receiver's forehand side
      T = { x: (this.alt ? fhX : -fhX) * (1.2 + r() * 1.3), z: tz * (L - 2.6 - r() * 1.6) };
    } else {
      if (stretch > 0.55 || c.y < 0.42) { kind = 'slice'; spin = -(70 + 60 * r()); spd *= 0.72; margin *= 1.3; }
      else if (Math.abs(c.z) < 8 && c.y > 0.95 && c.y < 1.8) { spd *= 1.12; margin *= 0.85; }
      if (c.y > 1.85 && Math.abs(c.z) < 9) { kind = 'smash'; spd *= 1.3; spin = 20; margin *= 0.8; }
      const oppAtNet = Math.abs(opp.z) < 6;
      if (oppAtNet && kind !== 'smash' && r() < 0.3 + 0.05 * this.levelN) kind = 'lob';
      // aim away from the opponent (sometimes behind them), deep
      const awaySign = Math.abs(opp.x) > 0.6 ? -Math.sign(opp.x) : (r() < 0.5 ? -1 : 1);
      const behind = r() < 0.18;
      const sx = behind ? -awaySign : awaySign;
      // how far toward the sideline: mostly safe, wider on an easy ball (slow, comfortable, inside the court)
      const easy = vin < 20 && c.y > 0.7 && c.y < 1.5 && Math.abs(c.z) < COURT.halfLen + 0.3 && stretch < 0.3;
      const go = easy && r() < lv.aim ? 0.75 + 0.25 * r() : 0.2 + 0.55 * r() * lv.aim / 0.55;
      const wide = (S - margin) * Math.min(1, go);
      let depth = L - margin - r() * 2.0;
      if (oppAtNet && kind === 'drive') depth = L - margin - 2.5 - r() * 2;   // dipping pass
      T = { x: sx * wide, z: tz * depth };
      if (kind === 'lob') { T = { x: (r() - 0.5) * 3, z: tz * (L - margin - 0.6) }; }
    }
    let sol;
    if (kind === 'lob') {
      const s0 = 15 + r() * 4;
      sol = solveShot(c, T, s0, 90, ctx.surf, 'lob');
      if (!sol.ok) sol = solveSafe(c, T, spd * 0.7, spin, ctx.surf, 0.4);
    } else {
      const minClear = kind === 'smash' ? 0.05 : 0.1 + margin * 0.2;
      sol = solveSafe(c, T, spd, spin, ctx.surf, minClear);
    }
    if (!sol.ok) {
      // nothing sensible: a defensive floater down the middle
      sol = solveSafe(c, { x: 0, z: tz * (L - 3) }, 14, 60, ctx.surf, 0.5);
      if (!sol.ok) return { v: { x: 0, y: 6, z: tz * 12 }, w: { x: 0, y: 0, z: 0 }, kind: 'push', kmh: 50, rpm: 0 };
    }
    // execution error: more on fast incoming balls, when stretched, and for weaker levels
    const diff = 1 + 1.4 * stretch + Math.max(0, (vin - 24) / 14) + (kind === 'smash' ? 0.5 : 0);
    const errScale = this.friendly || ctx.mode === 'rally' ? 0.55 : 1;
    const dth = gauss(r) * lv.angErr * 1.05 * diff * errScale * D2R;
    const dph = gauss(r) * lv.angErr * 1.5 * diff * errScale * D2R;
    const dsp = 1 + gauss(r) * 0.03 * diff;
    let { x: vx, y: vy, z: vz } = sol.v;
    const sp = Math.hypot(vx, vy, vz) * dsp;
    const th = Math.asin(vy / Math.hypot(vx, vy, vz)) + dth;
    const ph = Math.atan2(vx, vz) + dph;
    vx = sp * Math.cos(th) * Math.sin(ph); vz = sp * Math.cos(th) * Math.cos(ph); vy = sp * Math.sin(th);
    return { v: { x: vx, y: vy, z: vz }, w: { ...sol.w }, kind, kmh: sp * 3.6, rpm: Math.abs(spin) * 60 / (2 * Math.PI) };
  }

  // ── service ───────────────────────────────────────────────────────────
  /** stand at the baseline for a serve; returns the toss start {x, y, z} */
  serveBegin(court, second) {
    const x = (court === 'deuce' ? 1 : -1) * 0.75 * this.side;
    this.place(x, this.side * (COURT.halfLen + 0.25));
    this.serve = { court, second, t: 0, tossed: false, tHit: null, hitStep: -1 };
    this.swing = null;
  }
  /**
   * advance the service motion. Returns { toss: { p, v } } once, when the ball leaves the hand
   * (vertical, peaking ~0.3 m above the contact height, slightly into the court).
   */
  serveUpdate(dt) {
    const sv = this.serve;
    if (!sv) return null;
    sv.t += dt;
    if (!sv.tossed && sv.t >= 0.65) {
      sv.tossed = true;
      const rel = 1.95, peak = SERVE_CONTACT + 0.3;
      const vy = Math.sqrt(2 * 9.81 * (peak - rel));
      const front = -this.side * SERVE_FRONT;
      const sideOff = this.side * 0.2 * this.handSign;          // under the contact point, on the hitting arm's side
      return { toss: { p: { x: this.s.x + sideOff, y: rel, z: this.s.z + front }, v: { x: 0, y: vy, z: 0 } } };
    }
    return null;
  }
  /** after the toss: the step at which the falling ball is at the contact height (pred from the toss) */
  serveSchedule(pred, step0, ctx) {
    let apex = 0;
    for (let i = 1; i <= pred.n; i++) if (pred.y[i] < pred.y[i - 1]) { apex = i; break; }
    let i = apex;
    while (i < pred.n && pred.y[i] > SERVE_CONTACT) i++;
    this.serve.hitStep = step0 + i;
    this.serve.tHit = this.time + i * H;
    this.hitStep = step0 + i;
    // decide the serve now (the toss is predictable), not on the contact frame
    this.serve.shot = this.chooseServe({ x: pred.x[i], y: pred.y[i], z: pred.z[i] }, ctx);
  }
  /** hit the serve (mutates the ball). ctx: { surf }. */
  serveHit(ball, ctx) {
    const sv = this.serve;
    this.hitStep = -1;
    const sh = sv.shot || this.chooseServe({ x: ball.p.x, y: ball.p.y, z: ball.p.z }, ctx);
    ball.v.x = sh.v.x; ball.v.y = sh.v.y; ball.v.z = sh.v.z;
    ball.w.x = sh.w.x; ball.w.y = sh.w.y; ball.w.z = sh.w.z;
    this.lastShot = { kind: sv.second ? 'kick' : 'serve', kmh: sh.kmh, rpm: sh.rpm };
    // after the serve, step into the court a little and get ready
    this.serve = null;
    this.swing = { kind: 'serve-follow', u: 1, tHit: this.time };
    this.target = { x: this.s.x * 0.5, z: this.side * (COURT.halfLen + 0.5) };
    this.reactUntil = this.time + 0.35;
    return { ok: true, kind: 'serve', kmh: sh.kmh };
  }
  chooseServe(c, ctx) {
    const sv = this.serve;
    const lv = this.level, r = this.rand;
    const recvSide = -this.side;
    const boxSign = (sv.court === 'deuce' ? 1 : -1) * recvSide;   // x sign of the target box
    const pick = r();
    // T, wide or at the body; the better the server the closer to the lines
    let tx = pick < 0.4 ? 0.25 + (1 - lv.aim) * 0.8 : pick < 0.75 ? COURT.singlesHalfW - 0.35 - (1 - lv.aim) * 1.2 : 1.9;
    const margin = sv.second ? 0.75 : 0.4;
    let tzAbs = COURT.serviceZ - margin - r() * 0.7;
    let kmh, top, sideSpin = 0;
    if (sv.second) { kmh = lv.serve2 * (0.93 + 0.1 * r()); top = 260 + 60 * r(); }
    else { kmh = lv.serve1 * (0.94 + 0.08 * r()); top = 40 + 40 * r(); sideSpin = pick < 0.4 ? 0 : 30 * r(); }
    // the serves that miss: a little long or wide, or into the net
    const pFault = this.friendly ? lv.faults * 0.3 : sv.second ? lv.faults * 0.22 : lv.faults;
    let netErr = 0;
    if (r() < pFault) {
      const m = r();
      if (m < 0.4) tzAbs = COURT.serviceZ + 0.15 + r() * 0.6;
      else if (m < 0.7) tx = COURT.singlesHalfW + 0.12 + r() * 0.5;
      else netErr = 1.2 + r() * 1.6;
    }
    const T = { x: boxSign * tx, z: recvSide * tzAbs };
    let sol = solveShot(c, T, kmh / 3.6, top, ctx.surf, 'drive', sideSpin);
    if (!sol.ok) sol = solveSafe(c, T, kmh / 3.6 * 0.85, top, ctx.surf, 0.05);
    if (!sol.ok) sol = solveSafe(c, { x: boxSign * 1.5, z: recvSide * 4.5 }, 30, 200, ctx.surf, 0.1);
    const { x: vx, y: vy, z: vz } = sol.v;
    const sp = Math.hypot(vx, vy, vz);
    const th = Math.asin(vy / sp) - netErr * D2R + gauss(r) * 0.12 * D2R;
    const ph = Math.atan2(vx, vz) + gauss(r) * 0.25 * D2R;
    return {
      v: { x: sp * Math.cos(th) * Math.sin(ph), y: sp * Math.sin(th), z: sp * Math.cos(th) * Math.cos(ph) },
      w: { ...sol.w }, kmh: sp * 3.6, rpm: top * 60 / (2 * Math.PI),
    };
  }
}
