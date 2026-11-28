// js/ai.js — a player driven by the planner: the CPU opponent, the "you" of the demo and of the PC strokes.
// It reacts after its reaction time, runs (top speed and acceleration like a person), and meets the ball at the
// planned moment with the planned paddle. If it cannot get there in time, it stretches (worse) or misses.
import { LEVELS, HAND_OFFSET, wingFor, runJob } from './planner.js';
import { TABLE, contact, rubberCOR, RUBBERS, BALL_R } from './physics.js';

/** posts planner jobs to a worker in the browser, or runs them at once (node, or if workers fail) */
export class Planner {
  constructor(useWorker = typeof Worker !== 'undefined') {
    this.cbs = new Map();
    this.id = 0;
    this.worker = null;
    if (useWorker) {
      try {
        this.worker = new Worker(new URL('./planworker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => { const cb = this.cbs.get(e.data.id); this.cbs.delete(e.data.id); if (cb) cb(e.data.res); };
        this.worker.onerror = () => { this.worker = null; for (const [, cb] of this.cbs) cb({ ok: false, why: 'worker' }); this.cbs.clear(); };
      } catch { this.worker = null; }
    }
  }
  post(job, cb) {
    if (!this.worker) { cb(runJob(job)); return; }
    const id = ++this.id;
    this.cbs.set(id, cb);
    this.worker.postMessage({ id, job });
  }
}

const plainBall = (b) => ({ p: { ...b.p }, v: { ...b.v }, w: { ...b.w }, rolling: b.rolling, stopped: b.stopped });

/** human-like movement on the floor: top speed, acceleration, a harder stop */
export function moveBody(body, tx, tz, dt, vmax, acc) {
  const dx = tx - body.x, dz = tz - body.z, d = Math.hypot(dx, dz);
  const dec = acc * 1.4;
  const want = d < 0.005 ? 0 : Math.min(vmax, Math.sqrt(2 * dec * d) * 0.95);
  const wx = d > 1e-6 ? (dx / d) * want : 0, wz = d > 1e-6 ? (dz / d) * want : 0;
  const ex = wx - body.vx, ez = wz - body.vz, el = Math.hypot(ex, ez);
  const lim = (want > Math.hypot(body.vx, body.vz) ? acc : dec) * dt;
  if (el <= lim) { body.vx = wx; body.vz = wz; } else { body.vx += (ex / el) * lim; body.vz += (ez / el) * lim; }
  body.x += body.vx * dt; body.z += body.vz * dt;
}

export class Bot {
  /**
   * who: 'c' (the −z half) or 'p' (+z). opts: { level, rng (() → [0,1)), planner, mode, rubber }
   */
  constructor(who, opts) {
    this.who = who;
    this.side = who === 'p' ? 1 : -1;
    this.level = opts.level || 3;
    this.rng = opts.rng || Math.random;
    this.planner = opts.planner;
    this.mode = opts.mode || 'match';
    this.rubber = opts.rubber || 'inverted';
    this.enabled = true;
    this.body = { x: this.readyX(), z: this.readyZ(), vx: 0, vz: 0 };
    this.plan = null;            // { tAbs (sim time of contact), P, n, vp, wing, shot, ... }
    this.serve = null;           // a planned serve in progress
    this.thinkAt = -1;           // sim time to read the ball
    this.waiting = false;
    this.lastShot = null;
    this.stretch = 0;
    this.forced = null;          // PC strokes: { shot, target }
    this.rallyTarget = null;     // rally practice: where to return
    this.swingT = -1;            // for the avatar: time of the last contact
  }
  get L() { return LEVELS[this.level] || LEVELS[3]; }
  readyX() { return -0.12 * this.side; }
  readyZ() { return this.side * (TABLE.halfL + 0.62); }
  rnds(n = 24) { const a = []; for (let i = 0; i < n; i++) a.push(this.rng()); return a; }

  reset() {
    this.plan = null; this.serve = null; this.thinkAt = -1; this.waiting = false; this.stretch = 0;
  }
  /** the opponent (or the machine) struck the ball at sim time t */
  onOpponentStrike(t) {
    if (!this.enabled) return;
    this.plan = null;
    const react = this.L.react * (0.85 + 0.3 * this.rng());
    this.thinkAt = t + react;
  }
  /** read the ball and plan (called by the sim once the reaction time has passed) */
  think(sim) {
    this.thinkAt = -1;
    if (this.mode === 'rally') { this.flip = -(this.flip || 1); this.rallyTarget = this.flip * 0.36; }
    const job = {
      type: 'rally', ball: plainBall(sim.ball), side: this.side, level: this.level, rnd: this.rnds(), mode: this.mode,
      bounced: !!(sim.rally && sim.rally.expect === 'return' && sim.rally.last !== this.who),
      body: { x: this.body.x, z: this.body.z }, delay: this.planner.worker ? 0.05 : 0.0,
      forced: this.forced, rubber: this.rubber, opp: { x: sim.bodyOf(this.who === 'p' ? 'c' : 'p').x }, rallyTarget: this.rallyTarget,
    };
    const t0 = sim.time, token = (this.token = (this.token || 0) + 1);
    this.waiting = true;
    this.planner.post(job, (res) => {
      if (token !== this.token) return;
      this.waiting = false;
      if (!res || !res.ok) { this.plan = null; this.lastWhy = res && res.why; return; }
      const tAbs = t0 + res.tc;
      if (tAbs < sim.time + 0.02) { this.plan = null; this.lastWhy = 'late'; return; }
      // forehand or backhand, from where we can be
      const wing = wingFor(res.P.x, this.body.x, this.side, this.rng());
      const right = this.side;
      this.plan = { ...res, tAbs, wing, bodyX: res.P.x - right * HAND_OFFSET[wing], bodyZ: this.side * Math.max(TABLE.halfL + 0.12, Math.abs(res.P.z) + 0.40) };
    });
  }
  /** plan a serve; the toss starts when the plan is back */
  startServe(sim, kind) {
    const token = (this.token = (this.token || 0) + 1);
    const x = this.side * (0.2 + 0.25 * this.rng()) * (this.rng() < 0.75 ? 1 : -1) * 0.9;
    this.waiting = true;
    this.planner.post({ type: 'serve', side: this.side, level: this.level, rnd: this.rnds(), kind, x, rubber: this.rubber }, (res) => {
      if (token !== this.token) return;
      this.waiting = false;
      if (!res || !res.ok) { this.serve = { failed: true }; return; }
      this.serve = { ...res, tossAt: -1 };
    });
  }

  /** movement and timing; returns nothing — contacts happen in tryContact (per physics step) */
  update(sim, dt) {
    if (this.thinkAt >= 0 && sim.time >= this.thinkAt) this.think(sim);
    let tx = this.readyX(), tz = this.readyZ();
    if (this.plan) { tx = this.plan.bodyX; tz = this.plan.bodyZ; }
    else if (this.serve && !this.serve.failed) { tx = this.serve.P0.x - this.side * 0.25; tz = this.side * (TABLE.halfL + 0.45); }
    if (this.serve && this.serve.tossAt >= 0) { tx = this.body.x; tz = this.body.z; }    // stand still while serving
    const L = this.L;
    moveBody(this.body, tx, tz, dt, L.vmax, L.acc);
    // never inside the table
    if (this.body.z * this.side < TABLE.halfL + 0.1) { this.body.z = this.side * (TABLE.halfL + 0.1); this.body.vz = 0; }
  }

  /**
   * Called every physics step with the true ball. Returns { info } when it struck the ball, 'miss' when it
   * swung and missed, or null.
   */
  tryContact(sim) {
    const pl = this.plan;
    if (!pl || sim.time + 1e-9 < pl.tAbs - sim.h * 0.5) return null;
    this.plan = null;
    this.swingT = sim.time;
    this.lastPlan = pl;
    const b = sim.ball;
    const off = Math.hypot(b.p.x - pl.P.x, b.p.y - pl.P.y, b.p.z - pl.P.z);
    // can the hand reach? the shoulder is at the body + 0.2 m to the paddle side, 1.30 m up (crouched)
    const sx = this.body.x + this.side * 0.2, sz = this.body.z - this.side * 0.05;
    const reach = Math.hypot(pl.P.x - sx, pl.P.y - 1.30, pl.P.z - sz);
    this.stretch = Math.max(0, reach - 0.78);
    if (off > 0.06 || reach > 1.02) { this.lastShot = { shot: pl.shot, miss: true }; return 'miss'; }
    let n = pl.n, vp = pl.vp;
    if (this.stretch > 0) {
      // stretched: slower and less precise
      const k = 1 - Math.min(0.3, this.stretch * 1.2);
      const a = (this.rng() - 0.5) * this.stretch * 0.35;
      n = { x: n.x + a, y: n.y + a * 0.5, z: n.z }; const l = Math.hypot(n.x, n.y, n.z); n = { x: n.x / l, y: n.y / l, z: n.z / l };
      vp = { x: vp.x * k, y: vp.y * k, z: vp.z * k };
    }
    const info = strikeWith(b, n, vp, this.rubber);
    if (!info) { this.lastShot = { shot: pl.shot, miss: true }; return 'miss'; }
    this.lastShot = { shot: pl.shot, wing: pl.wing, seenTop: pl.seenTop, trueTop: pl.trueTop };
    return { info, plan: pl };
  }
}

/** apply a planned paddle (face normal n, velocity vp at the contact point) to the ball */
export function strikeWith(b, n, vp, rubberKey = 'inverted') {
  const rub = RUBBERS[rubberKey] || RUBBERS.inverted;
  const un = (b.v.x - vp.x) * n.x + (b.v.y - vp.y) * n.y + (b.v.z - vp.z) * n.z;
  if (un >= 0) return null;
  const vin = Math.hypot(b.v.x, b.v.y, b.v.z);
  contact(b, n, vp, rubberCOR(rub, un), rub.mu, rub.et, 0.026);
  // keep the ball out of the paddle
  b.p.x += n.x * 0.002; b.p.y += n.y * 0.002; b.p.z += n.z * 0.002;
  return { un: -un, speedIn: vin, speedOut: Math.hypot(b.v.x, b.v.y, b.v.z), paddleSpeed: Math.hypot(vp.x, vp.y, vp.z), face: 'fh', sweet: 0.9, offX: 0, offY: 0, normal: n };
}

export { BALL_R };
