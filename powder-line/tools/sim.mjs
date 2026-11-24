// tools/sim.mjs — the physics and the body reading, in Node (no browser):
//   speeds on a slope (standing vs tucked), the lean → centripetal acceleration law at two speeds,
//   lean direction, kickers and ollies, spins counted from the body's turn, crashes and respawns,
//   the body tracker (lean angle, crouch, pop from a crouch-and-extend, no pop from slowly standing up,
//   soft-landing absorb, spin unwrap, grabs), and the autopilot finishing every course.
//   node tools/sim.mjs
import { Course, G } from '../js/course.js';
import { SPECS, getCourse } from '../js/courses.js';
import { Rider, Run, TUNE, STEP_DT } from '../js/physics.js';
import { Body, BODY } from '../js/body.js';
import { Bot } from '../js/bot.js';

let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const DEG = Math.PI / 180;

// a plain test slope: constant angle, wide, optional features
function testCourse(deg, build = () => {}, length = 3000) {
  return new Course({ id: 't', name: 't', theme: { trees: 0.01 }, par: 100, ranks: [1, 1, 1], length, slope: [[-60, deg], [5000, deg]], cx: [[0, 0]], hw: [[0, 40]], build, seed: 1 });
}
const ride = (rider, it, sec) => { const ev = []; for (let t = 0; t < sec; t += STEP_DT) rider.step(STEP_DT, typeof it === 'function' ? it(t) : it, ev); return ev; };

// 1. terminal speed: g(sinα − μ cosα) = c v²
{
  const c = testCourse(15);
  const a = 15 * DEG;
  for (const [crouch, cd, label] of [[0, TUNE.dragStand, 'standing'], [1, TUNE.dragTuck, 'tucked']]) {
    const r = new Rider(c); r.reset(0, 0, 5);
    ride(r, { lean: 0, crouch }, 40);
    const vt = Math.sqrt((G * (Math.sin(a) - TUNE.mu * Math.cos(a))) / cd);
    check(Math.abs(r.speed - vt) / vt < 0.03, `${label} on 15°: ${r.speed.toFixed(1)} m/s (${(r.speed * 3.6).toFixed(0)} km/h), theory ${vt.toFixed(1)}`);
  }
}

// 2. lean → centripetal acceleration a = g·tan(gain·φ), the same at any speed (radius grows as v²)
{
  const c = testCourse(12);
  for (const v0 of [10, 18]) {
    const r = new Rider(c); r.reset(0, 0, v0);
    const phi = 8 * DEG;
    ride(r, { lean: 0 }, 0.2);
    const h0 = r.heading, sp0 = r.speed;
    ride(r, { lean: phi }, 0.25);
    const omega = (r.heading - h0) / 0.25, v = (sp0 + r.speed) / 2;
    const aMeasured = Math.abs(omega * v) * 1; // horizontal turn rate × speed (≈ centripetal on a 12° slope)
    const aLaw = G * Math.tan(TUNE.gain * phi) * Math.cos(12 * DEG);
    check(Math.abs(aMeasured - aLaw) / aLaw < 0.12, `lean 8° at ${v0} m/s: sideways ${aMeasured.toFixed(2)} m/s² (law ${aLaw.toFixed(2)}), radius ${(v * v / aMeasured).toFixed(0)} m`);
    check(r.heading < h0, `lean right → turns right (heading ${(h0 / DEG).toFixed(1)}° → ${(r.heading / DEG).toFixed(1)}°)`);
  }
  const r = new Rider(c); r.reset(0, 0, 12);
  ride(r, { lean: 6 * DEG }, 2);
  check(r.pos.x > 3, `lean right for 2 s: moved ${r.pos.x.toFixed(1)} m to the right`);
  const l = new Rider(c); l.reset(0, 0, 12);
  ride(l, { lean: -6 * DEG }, 2);
  check(l.pos.x < -3, `lean left for 2 s: moved ${(-l.pos.x).toFixed(1)} m to the left`);
  const b = new Rider(c); b.reset(0, 0, 15);
  ride(b, { brake: 1 }, 2);
  check(b.speed < 8, `sit back (brake) 2 s: 15 → ${b.speed.toFixed(1)} m/s`);
}

// 3. a kicker throws you in the air; an ollie at the lip goes higher; a plain ollie on the flat
{
  const mk = () => testCourse(14, (C, H) => H.kicker(80, 0, { len: 7, h: 1.4, w: 6, crystals: null }));
  const fly = (pop) => {
    const c = mk(); const r = new Rider(c); r.reset(30, 0, 14);
    const ev = [];
    let popped = false;
    for (let t = 0; t < 8; t += STEP_DT) {
      const it = { lean: 0, crouch: 0.5, pop: 0 };
      if (pop && !popped && !r.air && r.s > 80 - 1.0) { it.pop = 1; popped = true; }
      r.step(STEP_DT, it, ev);
    }
    return ev.find((e) => e.type === 'land' && e.air > 0.3);
  };
  const plain = fly(false), withPop = fly(true);
  check(plain && plain.air > 0.5, `kicker at ~15 m/s: ${plain?.air.toFixed(2)} s in the air, ${plain?.height.toFixed(1)} m high`);
  check(withPop && withPop.air > plain.air + 0.3, `ollie at the lip: ${withPop?.air.toFixed(2)} s, ${withPop?.height.toFixed(1)} m (lip bonus)`);
  const c = testCourse(10); const r = new Rider(c); r.reset(10, 0, 10);
  const ev = ride(r, (t) => ({ pop: t < STEP_DT ? 0.6 : 0 }), 2);
  const land = ev.find((e) => e.type === 'land');
  check(land && land.air > 0.4 && land.air < 1.0, `ollie on the slope (strength 0.6): ${land?.air.toFixed(2)} s in the air, ${land?.quality}`);
}

// 4. spins: the board turns with the body; land a 360 clean, a 540 as fakie, 90° off is a bail
{
  const mk = () => testCourse(14, (C, H) => H.kicker(80, 0, { len: 8, h: 2.0, w: 7, crystals: null }));
  const spin = (total) => {
    const c = mk(); const run = new Run(c); run.state = 'ride'; run.rider.reset(30, 0, 16);
    let landed = null;
    for (let t = 0; t < 8 && !landed; t += STEP_DT) {
      const r = run.rider;
      const it = { lean: 0, crouch: 0.3, pop: !r.air && r.s > 79 ? 1 : 0, spin: r.air ? Math.min(total, r.airTime * 10) * Math.sign(total || 1) : 0, absorb: 0 };
      if (total < 0) it.spin = r.air ? Math.max(total, -r.airTime * 10) : 0;
      const ev = run.update(STEP_DT, it);
      landed = ev.find((e) => e.type === 'trick') || landed;
    }
    return landed && { ...landed, switch: run.rider.switch };
  };
  const s360 = spin(2 * Math.PI);
  check(s360 && /360/.test(s360.name) && s360.quality === 'clean', `turn your body 360° in the air: 「${s360?.name}」 ${s360?.pts} pts, ${s360?.quality}`);
  const s540 = spin(-3 * Math.PI);
  check(s540 && /BS 540/.test(s540.name) && s540.switch && s540.quality === 'clean', `turn −540° (clockwise, regular stance): 「${s540?.name}」 ${s540?.pts} pts, now riding switch`);
  const s90 = spin(Math.PI / 2);
  check(s90 && s90.quality === 'bail', `land 90° sideways: ${s90?.quality}`);
}

// 5. trees: hit one fast → crash, then back on the snow a little uphill, moving again
{
  const c = testCourse(14, (C, H) => H.tree(60, 0));
  const r = new Rider(c); r.reset(30, 0, 14);
  const ev = ride(r, { lean: 0 }, 5);
  const crash = ev.find((e) => e.type === 'crash'), resp = ev.find((e) => e.type === 'respawn');
  check(crash && crash.why === 'tree' && resp && r.speed > 3, `hit a tree at speed: crash, then respawn (now ${r.speed.toFixed(1)} m/s at s=${r.s.toFixed(0)})`);
}

// 6. the body tracker
{
  const b = new Body();
  b.calibrate({ x: 0.1, y: 1.7, z: -0.2, yaw: 0 });
  const H = { x: 0.1, y: 1.7, z: -0.2, yaw: 0 };
  const step = (n, f, air = false, hands = []) => { let o; for (let i = 0; i < n; i++) { f(i); o = b.update(1 / 72, { ...H }, hands, air, { stance: 'regular' }); } return o; };
  let o = step(30, () => {});
  check(Math.abs(o.lean) < 1e-6 && o.crouch === 0 && o.pop === 0, 'standing still: no lean, no crouch, no pop');
  o = step(40, () => { H.x = 0.1 + 0.12; });
  const want = Math.asin((0.12 - BODY.dead) / (BODY.pivot * 1.7));
  check(Math.abs(o.lean - want) < 0.003, `head 12 cm to the right: lean ${(o.lean / DEG).toFixed(1)}° (expected ${(want / DEG).toFixed(1)}°)`);
  H.x = 0.1;
  o = step(40, () => { H.z = -0.2 + 0.18; });
  check(o.brake > 0.5 && Math.abs(o.lean) < 0.01, `head 18 cm back (uphill): brake ${o.brake.toFixed(2)}`);
  H.z = -0.2;
  // slowly crouch, hold, then stand up slowly: crouch but no pop
  let pops = 0;
  o = step(72, (i) => { H.y = 1.7 - 0.3 * (i / 72); });
  check(o.crouch > 0.6, `head 30 cm lower: crouch ${o.crouch.toFixed(2)}`);
  for (let i = 0; i < 144; i++) { H.y = 1.4 + 0.3 * (i / 144); const q = b.update(1 / 72, { ...H }, [], false, {}); if (q.pop) pops++; }
  check(pops === 0, 'standing up slowly (0.2 m/s): no ollie');
  // crouch, then extend fast (≈1.2 m/s): one pop, strong
  step(50, (i) => { H.y = 1.7 - 0.25 * Math.min(1, i / 25); });
  let popS = 0, popCount = 0;
  for (let i = 0; i < 40; i++) { H.y = Math.min(1.72, 1.45 + 1.2 * (i / 72)); const q = b.update(1 / 72, { ...H }, [], false, {}); if (q.pop) { popCount++; popS = q.pop; } }
  check(popCount === 1 && popS > 0.6, `crouch and extend fast: ${popCount} ollie, strength ${popS.toFixed(2)}`);
  // knees bending fast: absorb
  H.y = 1.7; step(40, () => {});
  o = step(10, (i) => { H.y = 1.7 - 0.06 * i; });
  check(o.absorb > 0.5, `knees bending (head dropping ~4 m/s): absorb ${o.absorb.toFixed(2)}`);
  // spin: turn 400° while in the air, unwrapped
  H.y = 1.7; step(20, () => {});
  o = step(80, (i) => { H.yaw = ((((i + 1) / 80) * 400 * DEG + Math.PI) % (2 * Math.PI)) - Math.PI; }, true);
  check(Math.abs(o.spin - 400 * DEG) < 0.05, `turning 400° in the air: spin ${(o.spin / DEG).toFixed(0)}°`);
  // grab: right (back) hand low on the toe side with the grip, in the air
  H.yaw = 0;
  o = step(5, () => {}, true, [{ side: 'R', x: 0.35, y: 0.55, z: -0.2, grip: 1, tracked: true }]);
  check(o.grab === 'インディ', `back hand down at the toes with the grip: ${o.grab}`);
  o = step(5, () => {}, true, [{ side: 'R', x: 0.35, y: 1.0, z: -0.2, grip: 1, tracked: true }]);
  check(o.grab === null, 'hand at the hip with the grip held: no grab');
}

// 7. the autopilot rides every course to the finish
for (const spec of SPECS) {
  const c = getCourse(spec.id);
  const run = new Run(c);
  const bot = new Bot(c);
  run.countdown(0.01);
  let t = 0;
  const dt = 1 / 72;
  let crashes = 0, tricks = [];
  while (run.state !== 'done' && t < 400) {
    const it = bot.update(dt, run);
    const ev = run.update(dt, it);
    for (const e of ev) { if (e.type === 'crash') crashes++; if (e.type === 'trick' && e.pts > 0) tricks.push(e.name); }
    t += dt;
  }
  const tot = run.totals();
  check(run.state === 'done', `${spec.name}: autopilot finished in ${run.time.toFixed(1)} s (par ${c.par}), score ${run.score} (rank ${run.rank()}), crystals ${run.stats.crystals}/${tot.crystals}, rings ${run.stats.rings}/${tot.rings}, crashes ${crashes}, max ${(run.stats.maxSpeed * 3.6).toFixed(0)} km/h, tricks ${tricks.length}: ${[...new Set(tricks)].slice(0, 6).join('・')}`);
  check(crashes <= 2, `${spec.name}: at most 2 crashes for the autopilot (${crashes})`);
}

process.exit(ok ? 0 : 1);
