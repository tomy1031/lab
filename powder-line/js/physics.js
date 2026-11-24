// js/physics.js — the rider on the snow and the rules of a run. No three.js, so it is tested in Node.
//
// What the body does and what the screen shows are tied together by real physics, not by a turning rate:
//   lean the body by φ  →  the board carves with a sideways (centripetal) acceleration a = g·tan(k·φ).
// A real rider in a carved turn leans so that gravity and the centripetal force add up along the body:
// tan(lean) = a / g. So the same lean always means the same sideways g-force, at any speed: slow → a tight
// turn, fast → a wide one (radius v²/a), exactly what your inner ear expects from that lean. k (gain, 3 by
// default) is there because a living room only lets you lean 10–20°, while riders lean 40–60°.
//   crouch → less air drag (tuck, faster)             lean back (uphill) → skid, brake
//   crouch then extend fast → ollie (pop) along the surface normal, bigger right at a kicker's lip
//   turn the body in the air → the board turns with you, 1:1 → spins (180 … 1080)
//   bend the knees as you touch down → soft landing (no speed lost, bonus)
import { G, clamp } from './course.js';

export const TUNE = {
  gain: 3.0, // body lean → edge (centripetal) lean
  maxEdge: 62 * Math.PI / 180,
  mu: 0.045, // snow friction
  muBrake: 0.42, // skidding sideways
  dragStand: 0.0095, // per metre (drag accel = c·v²): ~15 m/s (54 km/h) on 15°, standing tall
  dragTuck: 0.0065, // tucked: ~18 m/s (65 km/h) on 15°, ~21 m/s on 20°
  dragBrake: 0.004,
  dragAir: 0.0035,
  maxYawRate: 2.6, // rad/s: the tightest a board can pivot
  popBase: 1.8, popExtra: 2.0, // ollie: 1.8–3.8 m/s along the snow's normal
  lipBonus: 1.25, lipWindow: 3.2, // pop within 3.2 m before a lip (or just after leaving it): ×1.25
  airSteer: 0.18,
  vMax: 30,
  pushOff: 6, // m/s at "GO"
};
export const STEP_DT = 1 / 120;
export const POINTS = { blue: 10, green: 30, gold: 100, ring: 50 };
export const SPIN_POINTS = [0, 100, 250, 400, 600, 800, 1000];

const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
export { wrapPi };

export class Rider {
  constructor(course) {
    this.course = course;
    this._n = { x: 0, y: 1, z: 0 };
    this._m = { x: 0, y: 1, z: 0 };
    this.reset();
  }

  reset(s = -3, x = null, speed = 0) {
    const c = this.course;
    const xx = x ?? c.cx(s);
    this.pos = { x: xx, y: c.heightS(xx, s), z: -s };
    this.vel = { x: 0, y: 0, z: 0 };
    this.heading = 0; // yaw of travel: 0 = straight down the course (-z), + = to the left
    if (speed > 0) this.setSpeedDownhill(speed);
    this.air = false;
    this.airTime = 0;
    this.boardYaw = 0;
    this.switch = false;
    this.edge = 0;
    this.skid = 0;
    this.crash = 0;
    this.invuln = 0;
    this.boost = 0;
    this.slow = 0;
    this.popped = false;
    this.fromLip = false;
    this.takeoffYaw = 0;
    this.spin = 0;
    this.grabTime = 0;
    this.grabKind = null;
    this.s = s;
    this.prevS = s;
    this.speed = speed;
    this.normal = { ...c.normal(this.pos.x, this.pos.z) };
  }

  setSpeedDownhill(speed) {
    const n = this.course.normal(this.pos.x, this.pos.z, this._n);
    // (0,0,-1) projected on the snow
    const vn = -n.z;
    let x = -n.x * vn, y = -n.y * vn, z = -1 - n.z * vn;
    const l = Math.hypot(x, y, z) || 1;
    this.vel.x = (x / l) * speed; this.vel.y = (y / l) * speed; this.vel.z = (z / l) * speed;
    this.heading = 0;
  }

  // the kicker whose lip is just ahead (or just behind, for a pop right after leaving it)
  lipNear() {
    const s = -this.pos.z, c = this.course;
    for (const k of c.kickers) {
      if (s < k.s - TUNE.lipWindow || s > k.s + 1.2) continue;
      if (Math.abs(this.pos.x - (c.cx(k.s) + k.ox)) < k.w / 2 + 1) return k;
    }
    return null;
  }

  step(dt, it, ev) {
    const c = this.course, p = this.pos;
    this.prevS = -p.z;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.crash > 0) return this.crashing(dt, ev);
    if (this.air) this.flight(dt, it, ev);
    else this.ground(dt, it, ev);
    this.collide(ev);
    this.s = -p.z;
    this.speed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    // stuck (pushed into a bank, stopped uphill …): put back on the line after a few seconds
    if (!this.air && this.speed < 0.6 && this.s > 5 && this.s < c.length) {
      this.slow += dt;
      if (this.slow > 2.5) this.respawn(ev, 0);
    } else this.slow = 0;
  }

  ground(dt, it, ev) {
    const c = this.course, p = this.pos, v = this.vel;
    const n = c.normal(p.x, p.z, this._n);
    // keep the velocity on the snow
    let vn = v.x * n.x + v.y * n.y + v.z * n.z;
    v.x -= n.x * vn; v.y -= n.y * vn; v.z -= n.z * vn;
    let sp = Math.hypot(v.x, v.y, v.z);
    let dx, dy, dz;
    if (sp > 0.3) { dx = v.x / sp; dy = v.y / sp; dz = v.z / sp; }
    else {
      dx = -Math.sin(this.heading); dz = -Math.cos(this.heading); dy = 0;
      const k = dx * n.x + dz * n.z; dx -= n.x * k; dy -= n.y * k; dz -= n.z * k;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    }
    // to the right of travel, on the snow: d × n
    const rx = dy * n.z - dz * n.y, ry = dz * n.x - dx * n.z, rz = dx * n.y - dy * n.x;
    // the edge: lean → centripetal acceleration
    const phi = clamp((it.lean || 0) * TUNE.gain, -TUNE.maxEdge, TUNE.maxEdge);
    let aLat = G * Math.tan(phi);
    const maxA = TUNE.maxYawRate * Math.max(sp, 0.2);
    aLat = clamp(aLat, -maxA, maxA);
    this.edge += (phi - this.edge) * Math.min(1, dt * 18);
    // gravity along the snow
    const gx = G * n.y * n.x, gy = -G + G * n.y * n.y, gz = G * n.y * n.z;
    const brake = clamp(it.brake || 0, 0, 1);
    const crouch = clamp(it.crouch || 0, 0, 1);
    v.x += (gx + rx * aLat) * dt;
    v.y += (gy + ry * aLat) * dt;
    v.z += (gz + rz * aLat) * dt;
    if (this.boost > 0) { const b = Math.min(this.boost, dt); v.x += dx * 6 * b; v.y += dy * 6 * b; v.z += dz * 6 * b; this.boost -= dt; }
    // friction and drag slow you down but never push you backwards
    const N = G * n.y;
    const mu = TUNE.mu + TUNE.muBrake * brake + 0.02 * Math.abs(Math.tan(phi));
    const cd = TUNE.dragStand + (TUNE.dragTuck - TUNE.dragStand) * crouch + TUNE.dragBrake * brake;
    sp = Math.hypot(v.x, v.y, v.z);
    const loss = (mu * N + cd * sp * sp) * dt;
    const k = sp > loss ? (sp - loss) / sp : 0;
    v.x *= k; v.y *= k; v.z *= k;
    sp *= k;
    if (sp > TUNE.vMax) { const f = TUNE.vMax / sp; v.x *= f; v.y *= f; v.z *= f; sp = TUNE.vMax; }
    // at a crawl the board pivots on the spot, so you can always point it downhill again
    if (sp < 2) this.heading -= (it.lean || 0) * 2.2 * dt;
    // move, then follow the snow — unless it falls away faster than gravity can pull you down (a lip, a crest)
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    const h = c.heightS(p.x, -p.z);
    const gap = p.y - h;
    if (gap > 0.5 * G * n.y * dt * dt + 0.0015 && sp > 4) {
      this.takeOff(this.lipNear() !== null);
      ev.push({ type: 'takeoff', lip: this.fromLip });
    } else {
      p.y = h;
      const m = c.normal(p.x, p.z, this._m);
      vn = v.x * m.x + v.y * m.y + v.z * m.z;
      v.x -= m.x * vn; v.y -= m.y * vn; v.z -= m.z * vn;
      const l = Math.hypot(v.x, v.y, v.z);
      if (l > 1e-6) { const f = sp / l; v.x *= f; v.y *= f; v.z *= f; }
      this.normal.x = m.x; this.normal.y = m.y; this.normal.z = m.z;
    }
    if (sp > 0.5) this.heading = Math.atan2(-v.x, -v.z);
    this.skid += (brake - this.skid) * Math.min(1, dt * 8);
    this.boardYaw = this.heading + (this.switch ? Math.PI : 0) + this.skid * 1.05 * (this.switch ? -1 : 1);
    // ollie
    if (it.pop > 0 && !this.air) this.pop(it.pop, n, ev);
  }

  takeOff(fromLip) {
    this.air = true;
    this.airTime = 0;
    this.popped = false;
    this.fromLip = fromLip;
    this.takeoffYaw = this.boardYaw;
    this.spin = 0;
    this.grabTime = 0;
    this.grabKind = null;
    this.peakY = this.pos.y;
  }

  pop(strength, n, ev) {
    const lip = this.lipNear();
    const dv = (TUNE.popBase + TUNE.popExtra * clamp(strength, 0, 1)) * (lip ? TUNE.lipBonus : 1);
    const v = this.vel;
    if (!this.air) {
      this.takeOff(!!lip);
      v.x += n.x * dv; v.y += n.y * dv; v.z += n.z * dv;
    } else {
      v.y += dv; // a late pop just after leaving the lip
    }
    this.popped = true;
    ev.push({ type: 'pop', strength, lip: !!lip });
  }

  flight(dt, it, ev) {
    const c = this.course, p = this.pos, v = this.vel;
    // a pop right after leaving the snow still counts (you were a few frames late at the lip)
    if (it.pop > 0 && !this.popped && this.airTime < 0.16) this.pop(it.pop, null, ev);
    v.y -= G * dt;
    const sp = Math.hypot(v.x, v.y, v.z);
    const f = 1 - TUNE.dragAir * sp * dt;
    v.x *= f; v.y *= f; v.z *= f;
    // a little steering in the air (arcade), sideways to the horizontal travel
    const vh = Math.hypot(v.x, v.z);
    if (vh > 1) {
      const a = G * Math.tan(clamp((it.lean || 0) * TUNE.gain, -TUNE.maxEdge, TUNE.maxEdge)) * TUNE.airSteer;
      const ux = -v.z / vh, uz = v.x / vh;
      v.x += ux * a * dt; v.z += uz * a * dt;
    }
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    this.airTime += dt;
    if (p.y > this.peakY) this.peakY = p.y;
    // the board turns with your body (VR: 1:1 with how far you have turned since take-off)
    this.spin = it.spin || 0;
    this.boardYaw = this.takeoffYaw + this.spin;
    this.edge *= 1 - Math.min(1, dt * 4);
    if (it.grab) { this.grabTime += dt; this.grabKind = it.grab; }
    const h = c.heightS(p.x, -p.z);
    if (p.y <= h) this.land(h, it, ev);
  }

  land(h, it, ev) {
    const c = this.course, p = this.pos, v = this.vel;
    p.y = h;
    const n = c.normal(p.x, p.z, this._n);
    this.normal.x = n.x; this.normal.y = n.y; this.normal.z = n.z;
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    const impact = Math.max(0, -vn);
    v.x -= n.x * vn; v.y -= n.y * vn; v.z -= n.z * vn;
    let sp = Math.hypot(v.x, v.y, v.z);
    const air = this.airTime;
    this.air = false;
    if (sp > 0.5) this.heading = Math.atan2(-v.x, -v.z);
    // how the board lands relative to the way you were riding (regular or switch)
    const res = wrapPi(this.boardYaw - this.heading - (this.switch ? Math.PI : 0));
    const fakie = Math.abs(res) > Math.PI / 2;
    const off = fakie ? Math.PI - Math.abs(res) : Math.abs(res);
    const turns = Math.floor((Math.abs(this.spin) + 0.75) / Math.PI); // half turns; 180 counts from ~137°
    let quality = 'clean';
    if (air < 0.25) quality = 'hop';
    else if (off > 1.1 || impact > 15) quality = 'bail';
    else if (off > 0.6) quality = 'sketchy';
    // a hard landing costs speed unless you bend your knees (the run can refund it: soft landing)
    let lost = 0;
    if (quality === 'sketchy') lost += sp * 0.2;
    if (quality !== 'hop' && quality !== 'bail') lost += Math.max(0, impact - 5) * 0.35;
    lost = Math.min(lost, sp * 0.5);
    if (lost > 0 && sp > 0) { const f = (sp - lost) / sp; v.x *= f; v.y *= f; v.z *= f; sp -= lost; }
    if (quality !== 'hop' && quality !== 'bail' && fakie) this.switch = !this.switch;
    this.boardYaw = this.heading + (this.switch ? Math.PI : 0);
    ev.push({
      type: 'land', quality, air, impact, lost, fakie, turns, spinDir: Math.sign(this.spin),
      grab: this.grabTime > 0.12 ? this.grabKind : null, grabTime: this.grabTime, height: this.peakY - h, absorb: it.absorb || 0,
    });
    if (quality === 'bail') this.doCrash(ev, 'bail');
  }

  collide(ev) {
    const c = this.course, p = this.pos, v = this.vel;
    const s = -p.z;
    for (const o of c.obstaclesNear(s)) {
      const dx = p.x - o.x, ds = s - o.s;
      const rr = o.r + 0.35;
      const d2 = dx * dx + ds * ds;
      if (d2 > rr * rr) continue;
      const top = c.heightS(o.x, o.s) + o.h * (o.kind === 'tree' ? 1 : 0.85);
      if (p.y > top - 0.1) continue; // cleared it
      const d = Math.sqrt(d2) || 1e-3;
      const nx = dx / d, nz = -ds / d; // world (x, z): away from the obstacle
      const vin = -(v.x * nx + v.z * nz);
      if (vin > 5.5 && this.invuln <= 0 && this.crash <= 0) { this.doCrash(ev, o.kind); return; }
      p.x = o.x + nx * rr; p.z = -(o.s) + nz * rr;
      if (vin > 0) { v.x += nx * vin * 1.2; v.z += nz * vin * 1.2; }
      // head-on: slide off to the side you are on, so you never stay pinned behind it
      if (Math.abs(nx) < 0.5) { const side = dx >= 0 ? 1 : -1; v.x += side * 3; }
      v.x *= 0.92; v.z *= 0.92;
      if (!this.air) p.y = c.heightS(p.x, -p.z);
      ev.push({ type: 'graze', kind: o.kind });
    }
    for (const l of c.logs) {
      if (!(this.prevS < l.s && s >= l.s)) continue;
      if (p.x < l.x0 - 0.3 || p.x > l.x1 + 0.3) continue;
      if (p.y - c.heightS(p.x, l.s) > l.h) continue; // jumped it
      if (this.speed > 4 && this.invuln <= 0) { this.doCrash(ev, 'log'); return; }
      p.z = -(l.s - 0.4); v.x *= 0.2; v.y = 0; v.z = 0.0;
      ev.push({ type: 'graze', kind: 'log' });
    }
    // a hard edge far up the banks
    const cx = c.cx(s), lim = c.hw(s) + 9;
    if (Math.abs(p.x - cx) > lim) {
      const sg = Math.sign(p.x - cx);
      p.x = cx + sg * lim;
      if (v.x * sg > 0) v.x *= -0.3;
      if (!this.air) p.y = c.heightS(p.x, -p.z);
    }
  }

  doCrash(ev, why) {
    this.crash = 1.5;
    this.crashWhy = why;
    this.air = false;
    ev.push({ type: 'crash', why });
  }

  crashing(dt, ev) {
    const c = this.course, p = this.pos, v = this.vel;
    const f = Math.exp(-7 * dt);
    v.x *= f; v.y *= f; v.z *= f;
    p.x += v.x * dt; p.z += v.z * dt;
    p.y = Math.max(p.y + v.y * dt - 2 * dt, c.heightS(p.x, -p.z));
    if (p.y < c.heightS(p.x, -p.z)) p.y = c.heightS(p.x, -p.z);
    this.crash -= dt;
    this.s = -p.z;
    this.speed = Math.hypot(v.x, v.y, v.z);
    if (this.crash <= 0) this.respawn(ev, 6);
  }

  respawn(ev, back = 6) {
    const c = this.course;
    const s = clamp(-this.pos.z - back, 1, c.length + 150);
    const x = c.safeSpot(this.pos.x, s);
    const sw = this.switch;
    this.reset(s, x, 7);
    this.switch = sw;
    this.invuln = 2;
    ev.push({ type: 'respawn' });
  }
}

// a run: the rider plus the rules (crystals, rings, tricks, the clock, the finish)
export class Run {
  constructor(course, { stance = 'regular', ghost = null } = {}) {
    this.course = course;
    this.stance = stance;
    this.rider = new Rider(course);
    this.crystals = [...course.crystals].sort((a, b) => a.s - b.s);
    this.rings = [...course.rings].sort((a, b) => a.s - b.s);
    this.got = new Uint8Array(this.crystals.length);
    this.ringsGot = new Uint8Array(this.rings.length);
    this.state = 'ready';
    this.time = 0;
    this.count = 0;
    this.score = 0;
    this.parts = { crystals: 0, rings: 0, tricks: 0, time: 0 };
    this.stats = { crystals: 0, gold: 0, rings: 0, tricks: 0, crashes: 0, bestAir: 0, bestSpin: 0, soft: 0, touches: 0, maxSpeed: 0 };
    this.acc = 0;
    this.track = []; // ghost samples every 0.05 s: t, x, y, z, boardYaw, edge, crouch
    this.trackT = 0;
    this.ghost = ghost;
    this.pending = null; // a landing that can still become soft for a moment
    this.finishedAt = 0;
  }

  countdown(sec = 3) { this.state = 'count'; this.count = sec; }

  go() {
    this.state = 'ride';
    this.rider.setSpeedDownhill(TUNE.pushOff);
  }

  // dt: frame time. it: intent from the body (or keys). pts: where your body and hands are (world), for crystals
  update(dt, it, pts = null) {
    const ev = [];
    dt = Math.min(dt, 0.1);
    if (this.state === 'count') {
      const before = Math.ceil(this.count);
      this.count -= dt;
      if (Math.ceil(this.count) !== before && this.count > 0) ev.push({ type: 'count', n: Math.ceil(this.count) });
      if (this.count <= 0) { this.go(); ev.push({ type: 'go' }); }
      return ev;
    }
    if (this.state === 'ready') return ev;
    const r = this.rider;
    this.acc += dt;
    let popUsed = false;
    while (this.acc >= STEP_DT) {
      this.acc -= STEP_DT;
      const sub = popUsed ? { ...it, pop: 0 } : it;
      const n0 = ev.length;
      r.step(STEP_DT, sub, ev);
      for (let i = n0; i < ev.length; i++) if (ev[i].type === 'pop') popUsed = true;
      if (it.pop > 0 && (r.air || r.crash > 0)) popUsed = true;
      this.rules(ev, it, pts);
    }
    if (this.state === 'ride') this.time += dt;
    // a landing can be softened by bending the knees just after touch-down
    if (this.pending) {
      this.pending.t -= dt;
      if ((it.absorb || 0) > 0.5) this.softLanding(this.pending, ev);
      else if (this.pending.t <= 0) this.pending = null;
    }
    // ghost track
    this.trackT += dt;
    if (this.trackT >= 0.05 && this.state !== 'done') {
      this.trackT = 0;
      const p = r.pos;
      this.track.push(+this.time.toFixed(3), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +r.boardYaw.toFixed(3), +r.edge.toFixed(3), +(it.crouch || 0).toFixed(2));
    }
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, r.speed);
    if (this.state === 'finish' && (r.speed < 1.5 || this.time - this.finishedAt > 5)) { this.state = 'done'; ev.push({ type: 'done' }); }
    return ev;
  }

  rules(ev, it, pts) {
    const r = this.rider, p = r.pos, s = -p.z;
    // crystals: your body, or reach out and touch them with a hand (+50%)
    const body = pts?.body || { x: p.x, y: p.y + 1.0, z: p.z };
    const hands = pts?.hands || [];
    let lo = 0, hi = this.crystals.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.crystals[m].s < s - 3) lo = m + 1; else hi = m; }
    for (let i = lo; i < this.crystals.length; i++) {
      const cr = this.crystals[i];
      if (cr.s > s + 3) break;
      if (this.got[i]) continue;
      if (cr.wy === undefined) cr.wy = this.course.heightS(cr.x, cr.s) + cr.y;
      const cz = -cr.s;
      let hand = null;
      for (const h of hands) if (h && (h.x - cr.x) ** 2 + (h.y - cr.wy) ** 2 + (h.z - cz) ** 2 < 0.55 * 0.55) hand = h.side || 'hand';
      const bxz = (body.x - cr.x) ** 2 + (body.z - cz) ** 2;
      const hit = hand || (bxz < 1.15 * 1.15 && Math.abs(body.y - cr.wy) < 1.25);
      if (!hit) continue;
      this.got[i] = 1;
      const pts0 = POINTS[cr.kind] || 10;
      const got = hand ? Math.round(pts0 * 1.5) : pts0;
      this.add('crystals', got);
      this.stats.crystals++;
      if (cr.kind === 'gold') this.stats.gold++;
      if (hand) this.stats.touches++;
      ev.push({ type: 'crystal', i, kind: cr.kind, pts: got, hand, x: cr.x, y: cr.wy, z: cz });
    }
    // rings: pass through the middle → points and a push
    for (let i = 0; i < this.rings.length; i++) {
      const g = this.rings[i];
      if (this.ringsGot[i] || !(r.prevS < g.s && s >= g.s)) continue;
      if (g.wy === undefined) g.wy = this.course.heightS(g.x, g.s) + g.y;
      const by = body.y;
      if (Math.hypot(body.x - g.x, by - g.wy) < g.r) {
        this.ringsGot[i] = 1;
        this.add('rings', POINTS.ring);
        this.stats.rings++;
        r.boost = 0.7;
        ev.push({ type: 'ring', i, pts: POINTS.ring });
      }
    }
    for (const e of ev) {
      if (e.done) continue;
      e.done = true;
      if (e.type === 'land') this.scoreLanding(e, ev);
      if (e.type === 'crash') this.stats.crashes++;
    }
    if (this.state === 'ride' && s >= this.course.length) {
      this.state = 'finish';
      this.finishedAt = this.time;
      const bonus = Math.max(0, Math.round((this.course.par - this.time) * 30));
      this.add('time', bonus);
      ev.push({ type: 'finish', time: this.time, bonus, done: true });
    }
  }

  trickName(e) {
    const parts = [];
    if (e.turns > 0) {
      const ccw = e.spinDir > 0;
      const fs = this.stance === 'goofy' ? !ccw : ccw;
      parts.push(`${fs ? 'FS' : 'BS'} ${e.turns * 180}`);
    }
    if (e.grab) parts.push(e.grab);
    if (!parts.length && e.air >= 0.6) parts.push(e.air >= 1.4 ? 'ビッグエア' : 'エア');
    return parts.join(' ');
  }

  scoreLanding(e, ev) {
    if (e.quality === 'hop') return;
    this.stats.bestAir = Math.max(this.stats.bestAir, e.air);
    if (e.quality === 'bail') { ev.push({ type: 'trick', name: '転倒', pts: 0, quality: 'bail', done: true }); return; }
    let pts = 0;
    if (e.air >= 0.6) pts += Math.round(e.air * 60);
    if (e.turns > 0) { pts += SPIN_POINTS[Math.min(e.turns, 6)] + Math.max(0, e.turns - 6) * 200; this.stats.bestSpin = Math.max(this.stats.bestSpin, e.turns * 180); }
    if (e.grab) pts += Math.round(100 + 120 * Math.min(e.grabTime, 2));
    if (e.turns > 0 && e.grab) pts = Math.round(pts * 1.2);
    if (e.quality === 'sketchy') pts = Math.round(pts * 0.5);
    const name = this.trickName(e);
    if (pts > 0) {
      this.add('tricks', pts);
      if (e.turns > 0 || e.grab) this.stats.tricks++;
    }
    const t = { type: 'trick', name, pts, quality: e.quality, air: e.air, done: true };
    ev.push(t);
    // soft landing: knees bent as you touch down (now, or within the next 0.25 s)
    const p = { t: 0.25, pts, lost: e.lost, trick: t };
    if ((e.absorb || 0) > 0.5) this.softLanding(p, ev);
    else if (e.air >= 0.45) this.pending = p;
  }

  softLanding(p, ev) {
    this.pending = null;
    const bonus = Math.max(20, Math.round(p.pts * 0.2));
    this.add('tricks', bonus);
    this.stats.soft++;
    // give back the speed the hard landing took
    const r = this.rider, v = r.vel, sp = Math.hypot(v.x, v.y, v.z);
    if (p.lost > 0 && sp > 0.1) { const f = (sp + p.lost) / sp; v.x *= f; v.y *= f; v.z *= f; }
    ev.push({ type: 'soft', pts: bonus, done: true });
  }

  add(part, pts) { this.parts[part] += pts; this.score += pts; }

  rank() {
    const [S, A, B] = this.course.ranks;
    return this.score >= S ? 'S' : this.score >= A ? 'A' : this.score >= B ? 'B' : 'C';
  }
  totals() { return { crystals: this.crystals.length, rings: this.rings.length }; }
}
