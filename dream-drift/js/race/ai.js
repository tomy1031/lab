// race/ai.js — CPU drivers: follow the racing line with a personal lane, dodge karts and traps, drift
// through long corners for mini-turbos and use items with a little cunning. The same brain also drives
// the player's kart in autoplay and after the finish line.
import { clamp, mod, makeRng } from '../engine/util.js';

export class AIDriver {
  constructor(kart, { skill = 0.95, aggr = 0.8, seed = 1 } = {}) {
    this.kart = kart;
    this.skill = skill;
    this.aggr = aggr;
    this.rng = makeRng(seed);
    this.lane = (this.rng.next() - 0.5) * 0.5;
    this.laneTarget = this.lane;
    this.laneT = 0;
    this.hardSteerT = 0;
    this.driftT = 0;
    this.itemDelay = 0;
    this.ctl = { steer: 0, throttle: 1, brake: 0, drift: false, item: false };
    this.reverseT = 0;
  }

  update(dt, race) {
    const k = this.kart, tr = race.track, N = tr.N, ctl = this.ctl;
    ctl.item = false;
    // wander lane slowly
    this.laneT -= dt;
    if (this.laneT <= 0) { this.laneT = 2 + this.rng.next() * 4; this.laneTarget = (this.rng.next() - 0.5) * 0.9; }
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 0.5);

    const hw = tr.HW[k.idx];
    const speed = Math.max(0, k.speed);
    const look = 4 + speed * 0.2;
    const p = k.prog + look;
    const ri = mod(Math.round(p), N);
    let off = tr.racing[ri] + this.lane * hw * 0.55;

    // avoid karts just ahead and traps on the line
    for (const o of race.karts) {
      if (o === k) continue;
      let ds = o.prog - k.prog; if (ds < -N / 2) ds += N; else if (ds > N / 2) ds -= N;
      if (ds > 0 && ds < 5) {
        const dd = o.loc.d - off;
        if (Math.abs(dd) < 2.4) off += dd > 0 ? -2.6 : 2.6;
      }
    }
    for (const t of race.items.traps) {
      let ds = t.prog - k.prog; if (ds < -N / 2) ds += N; else if (ds > N / 2) ds -= N;
      if (ds > 0 && ds < 12) {
        const dd = t.d - off;
        if (Math.abs(dd) < 2.6) off += dd > 0 ? -3 : 3;
      }
    }
    // go for item boxes when empty-handed
    if (!k.item && !k.roulette) {
      const row = race.items.nextRow(k.prog, 14);
      if (row) {
        let best = null, bd = 99;
        for (const b of row.boxes) if (b.active) { const dd = Math.abs(b.d - off); if (dd < bd) { bd = dd; best = b; } }
        if (best && bd < 5) off = best.d;
      }
    }
    off = clamp(off, -hw + 1.2, hw - 1.2);

    const tx = tr.P[ri].x + tr.R[ri].x * off, tz = tr.P[ri].z + tr.R[ri].z * off;
    const dx = tx - k.pos.x, dz = tz - k.pos.z;
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    const lateral = dx * -fz + dz * fx; // dot with the kart's right vector (-cos h, sin h) = (-fz, fx)
    const forward = dx * fx + dz * fz;
    const ang = Math.atan2(lateral, forward);
    let steer = clamp(ang * 2.4, -1, 1);

    // drift through long corners (mini-turbo), more often for skilful drivers
    if (Math.abs(steer) > 0.55 && speed > 14) this.hardSteerT += dt; else this.hardSteerT = Math.max(0, this.hardSteerT - dt * 2);
    if (!ctl.drift && this.hardSteerT > 0.35 && this.skill > 0.9 && !k.offroad) { ctl.drift = true; this.driftT = 0; }
    if (ctl.drift) {
      this.driftT += dt;
      const ahead = tr.curv[mod(k.idx + 8, N)] * (k.drift.dir || Math.sign(steer));
      if (k.drift.active && (ahead < 0.006 || this.driftT > 2.8) && (k.drift.level >= 1 || this.driftT > 1.2)) ctl.drift = false;
      if (!k.drift.active && this.driftT > 0.6) ctl.drift = false;
    }
    if (k.drift.active) steer = clamp(steer * 1.15, -1, 1);

    // throttle; lift on very sharp angles
    let thr = Math.abs(ang) > 1.1 ? 0.4 : 1;
    let brk = 0;
    // stuck facing a wall → back off a bit
    if (this.reverseT > 0) { this.reverseT -= dt; thr = 0; brk = 1; steer = -steer; }
    else if (Math.abs(ang) > 2.0 && speed < 4) this.reverseT = 0.8;

    ctl.steer = steer; ctl.throttle = thr; ctl.brake = brk;
    this.useItems(dt, race);
    return ctl;
  }

  useItems(dt, race) {
    const k = this.kart, ctl = this.ctl, N = race.track.N;
    if (!k.item || k.roulette > 0) { this.itemDelay = 0.6 + this.rng.next() * 2.5 / this.aggr; return; }
    this.itemDelay -= dt;
    if (this.itemDelay > 0) return;
    const it = k.item;
    let fire = false;
    const near = (minDs, maxDs, maxD) => race.karts.some((o) => {
      if (o === k || o.finished) return false;
      let ds = o.raceDist - k.raceDist;
      return ds > minDs && ds < maxDs && (maxD === undefined || Math.abs(o.loc.d - k.loc.d) < maxD);
    });
    if (it === 'boost' || it === 'triple') fire = Math.abs(race.track.curv[mod(k.idx + 10, N)]) < 0.02 || this.itemDelay < -3;
    else if (it === 'pudding') fire = near(-10, -1) || this.itemDelay < -6;
    else if (it === 'bubble') fire = near(2, 22, 3) || this.itemDelay < -8;
    else if (it === 'homing') fire = k.place > 1 || this.itemDelay < -5;
    else fire = true; // shield, comet
    if (fire) { ctl.item = true; this.itemDelay = 0.5 + this.rng.next() * 1.5 / this.aggr; }
  }
}
