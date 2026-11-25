// js/bot.js — an autopilot rider: the demo run behind the title screen, and the tests' test rider.
// It only ever sends the same intent a person sends (lean, crouch, pop, spin, grab, absorb).
import { clamp } from './course.js';

export class Bot {
  constructor(course, { tricks = true, greedy = true, seed = 1 } = {}) {
    this.c = course;
    this.tricks = tricks;
    this.greedy = greedy;
    this.spin = 0;
    this.spinTarget = 0;
    this.rand = seed;
    this.prefer = 0; // preferred side when the run splits
    this.lastLean = 0;
  }

  rnd() { this.rand = (this.rand * 16807) % 2147483647; return this.rand / 2147483647; }

  // free stretches of snow across the corridor at s (no island mound)
  lanes(s) {
    const c = this.c, cx = c.cx(s), w = c.hw(s) - 6.5;
    const out = [];
    let a = null;
    for (let x = cx - w; x <= cx + w + 1e-6; x += 0.5) {
      const free = c.featureLift(x, s) < 0.25;
      if (free && a === null) a = x;
      if ((!free || x + 0.5 > cx + w) && a !== null) { const b = free ? x : x - 0.5; if (b - a > 2) out.push([a, b]); a = null; }
    }
    return out.length ? out : [[cx - w, cx + w]];
  }

  update(dt, run) {
    const r = run.rider, c = this.c, p = r.pos, s = r.s;
    const it = { lean: 0, crouch: 0, brake: 0, pop: 0, spin: 0, grab: null, absorb: 0 };
    if (run.state !== 'ride' && run.state !== 'finish') return it;
    const L = clamp(r.speed * 0.85, 7, 20);
    const sa = s + L;
    // which lane: keep the one you are heading into
    const lanes = this.lanes(sa);
    let lane = lanes[0], best = Infinity;
    const want = p.x + this.prefer * 3;
    for (const l of lanes) { const d = want < l[0] ? l[0] - want : want > l[1] ? want - l[1] : 0; if (d < best) { best = d; lane = l; } }
    let xt = (lane[0] + lane[1]) / 2;
    if (lanes.length === 1) xt = c.cx(sa);
    // a kicker ahead in this lane: line up with it
    let kick = null;
    for (const k of c.kickers) {
      const kx = c.cx(k.s) + k.ox;
      if (k.s > s + 2 && k.s < s + 45 && kx > lane[0] - 2 && kx < lane[1] + 2) { kick = k; xt = kx; break; }
    }
    // crystals within reach in this lane
    if (this.greedy && !kick) {
      let bestC = null, bd = Infinity;
      for (let i = 0; i < run.crystals.length; i++) {
        const cr = run.crystals[i];
        if (run.got[i] || cr.air || cr.s < s + 5 || cr.s > s + 26) continue;
        if (cr.x < lane[0] - 1 || cr.x > lane[1] + 1) continue;
        const d = Math.abs(cr.x - p.x) + (cr.s - s) * 0.3;
        if (d < bd) { bd = d; bestC = cr; }
      }
      if (bestC) xt = bestC.x;
      for (const g of run.rings) if (g.s > s + 4 && g.s < s + 30 && g.x > lane[0] - 1 && g.x < lane[1] + 1) { xt = g.x; break; }
    }
    // steer around trees, rocks and ice
    for (const o of c.obstaclesNear(s + 10).concat(c.obstaclesNear(s + 20))) {
      if (o.s < s + 1 || o.s > s + 24) continue;
      const clear = o.r + 1.6;
      if (Math.abs(xt - o.x) < clear) {
        const side = p.x >= o.x ? 1 : -1;
        xt = o.x + side * (clear + 0.4);
      }
    }
    xt = clamp(xt, lane[0], lane[1]);
    // heading toward the target
    const psiDes = -Math.atan2(xt - p.x, L);
    const err = r.heading - psiDes;
    let lean = clamp(err * 0.55, -0.3, 0.3);
    it.lean = this.lastLean + (lean - this.lastLean) * Math.min(1, dt * 10);
    this.lastLean = it.lean;
    it.crouch = Math.abs(err) < 0.15 && r.speed < 24 ? 0.8 : 0.2;
    if (r.speed > 27) it.brake = 0.5;
    // pop at the lip, and over logs
    if (!r.air && kick) {
      const d = kick.s - s;
      if (d > 0.1 && d < Math.max(1.2, r.speed * 0.06)) it.pop = 1;
    }
    for (const l of c.logs) if (!r.air && l.s - s > 0 && l.s - s < Math.max(2.2, r.speed * 0.2) && p.x > l.x0 - 0.5 && p.x < l.x1 + 0.5) it.pop = 1;
    // in the air: spin and grab on the big ones, absorb the landing
    if (r.air) {
      if (r.airTime < 0.02) {
        const v = r.vel;
        const tAir = (v.y + Math.sqrt(Math.max(0, v.y * v.y + 2 * 9.81 * 1.5))) / 9.81;
        const turns = this.tricks ? Math.floor((tAir - 0.25) * 2.2) : 0;
        this.spinTarget = clamp(turns, 0, 4) * Math.PI * (this.rnd() < 0.5 ? 1 : -1);
        this.spin = 0;
      }
      const rate = 9 * dt;
      this.spin += clamp(this.spinTarget - this.spin, -rate, rate);
      it.spin = this.spin;
      if (this.tricks && r.airTime > 0.15 && r.vel.y > -4) it.grab = 'インディ';
      const h = c.heightS(p.x, -p.z);
      if (p.y - h < 0.8 && r.vel.y < 0) it.absorb = 1;
      it.lean = 0;
    }
    return it;
  }
}
