// tools/modes.mjs — the nine ways to fly, checked as physics: each mode is run in the page for some seconds
// with made-up controller poses / keys over flat ground, and what it does is compared with what it should do
// (glide ratios, climbing in a thermal, turning the right way, a balloon drifting with the wind, …).
//   node tools/modes.mjs
import { browser, serveApp } from './pw.mjs';
import { mockNet } from './mock.mjs';

const { srv, base } = await serveApp();
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 800, height: 500 } });
await mockNet(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '?quality=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });

const results = await page.evaluate(async () => {
  const THREE = await import('three');
  const { Flight } = await import('./js/flight.js');
  const { Air } = await import('./js/air.js');
  const { ScreenInput } = await import('./js/input.js');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const out = [];
  const check = (ok, msg) => out.push([!!ok, msg]);

  const handOf = (x, y, z, d = V(0, 0, -1)) => ({ on: true, pos: V(x, y, z), quat: new THREE.Quaternion(), ray: { o: V(x, y, z), d: d.clone().normalize() }, trigger: 0, grip: 0, stick: [0, 0], buttons: [], vel: V(0, 0, 0) });
  const xrInput = () => ({ head: V(0, 1.6, 0), headQuat: new THREE.Quaternion(), hands: { L: handOf(-0.25, 1.2, -0.3), R: handOf(0.25, 1.2, -0.3) }, was: () => false, pressed: [] });

  // a flight over flat ground at 0 m, still air unless the test adds some
  function make(mode, { y = 500, xr = true, inp = xrInput(), speed = 'normal' } = {}) {
    const rig = new THREE.Group();
    rig.position.set(0, y, 0);
    rig.updateMatrixWorld();
    const f = new Flight(rig);
    f.speedSetting = speed;
    f.groundAt = () => 0;
    f.groundAtFull = () => ({ h: 0, z: 12 });
    f.limit = 1e9;
    const air = new Air({ id: 'test', r: 25 });
    air.thermals = [];
    air.speed0 = 0; air.turn = 0;
    air.wind = (yy, o = new THREE.Vector3()) => o.set(0, 0, 0);
    f.air = air;
    const sin = new ScreenInput(document.createElement('div'));
    sin.enabled = true;
    const c = { xr, inp, sin, headLocal: inp.head, headWorld: inp.head.clone().add(rig.position) };
    f.mode = mode;
    f.setMode(mode, c);
    return { f, rig, inp, sin, c };
  }
  function run(s, seconds, each) {
    const dt = 1 / 60;
    for (let i = 0; i < seconds * 60; i++) {
      s.rig.updateMatrixWorld();
      s.c.headWorld = s.inp.head.clone().applyMatrix4(s.rig.matrixWorld);
      each?.(i * dt);
      s.f.update(dt, s.c);
    }
    s.rig.updateMatrixWorld();
    return s;
  }
  const spread = (inp, dy = 0, y = 1.3) => { inp.hands.L.pos.set(-0.8, y + dy, -0.1); inp.hands.R.pos.set(0.8, y - dy, -0.1); };

  // スーパーマン: the right trigger flies along the right hand's ray, letting go coasts to a stop
  {
    const s = make('point');
    s.inp.hands.R.trigger = 1;
    run(s, 3);
    const p = s.rig.position, v = s.f.speed;
    check(p.z < -300 && Math.abs(p.x) < 5, `スーパーマン: trigger flies where the hand points (${Math.round(-p.z)} m in 3 s, ${Math.round(v * 3.6)} km/h)`);
    s.inp.hands.R.trigger = 0;
    run(s, 4);
    check(s.f.speed < v * 0.1, `スーパーマン: letting go slows to a stop (${Math.round(s.f.speed * 3.6)} km/h)`);
  }
  // 空中浮遊: the left stick moves slowly and smoothly, never past its cap
  {
    const s = make('float', { y: 100 });
    s.inp.hands.L.stick = [0, -1];
    let peakAcc = 0, last = 0;
    run(s, 6, () => { const v = s.f.speed; peakAcc = Math.max(peakAcc, (v - last) * 60); last = v; });
    const cap = s.f.M.cap(s.f);
    check(s.f.speed <= cap * 1.01 && s.f.speed > cap * 0.9 && s.rig.position.z < 0, `空中浮遊: slow and capped (${s.f.speed.toFixed(1)} m/s, cap ${cap.toFixed(1)})`);
    check(peakAcc < 12, `空中浮遊: gentle acceleration (peak ${peakAcc.toFixed(1)} m/s²)`);
  }
  // 鳥: gliding sinks; flapping (hands swept down, again and again) climbs; a tilt turns
  {
    const s = make('bird', { y: 500 });
    spread(s.inp);
    run(s, 10);
    const glide = s.rig.position.clone();
    check(glide.y < 500 && glide.z < -80, `鳥: arms spread glide forward and down (${Math.round(-glide.z)} m ahead, ${Math.round(500 - glide.y)} m lower)`);
    const s2 = make('bird', { y: 500 });
    spread(s2.inp);
    run(s2, 10, (t) => {
      const ph = (t % 0.9) / 0.9; // a flap every 0.9 s: down fast, up slowly
      const vy = ph < 0.35 ? -3 : 1.2;
      s2.inp.hands.L.vel.set(0, vy, 0); s2.inp.hands.R.vel.set(0, vy, 0);
    });
    check(s2.rig.position.y > 520, `鳥: flapping climbs (${Math.round(s2.rig.position.y - 500)} m in 10 s)`);
    const s3 = make('bird', { y: 500 });
    spread(s3.inp, 0.2);
    const y0 = s3.rig.rotation.y;
    run(s3, 3);
    check(s3.rig.rotation.y < y0 - 0.3, `鳥: left wing up turns right (${((s3.rig.rotation.y - y0) * 57.3).toFixed(0)}° in 3 s)`);
  }
  // ムササビ: about 3:1 at 35–60 m/s; diving is faster; triggers lift you
  {
    const s = make('squirrel', { y: 3000 });
    spread(s.inp, 0, 1.28);
    run(s, 12);
    const p0 = s.rig.position.clone();
    run(s, 20);
    const d = s.rig.position.clone().sub(p0);
    const ratio = Math.hypot(d.x, d.z) / -d.y, V = s.f.st.V;
    check(ratio > 2.2 && ratio < 4.5 && V > 30 && V < 62, `ムササビ: glide ratio ${ratio.toFixed(1)}:1 at ${Math.round(V * 3.6)} km/h`);
    spread(s.inp, 0, 0.95); // arms lowered: dive
    run(s, 10);
    check(s.f.st.V > V + 8, `ムササビ: diving speeds up (${Math.round(s.f.st.V * 3.6)} km/h)`);
    const y1 = s.rig.position.y;
    s.inp.hands.L.trigger = s.inp.hands.R.trigger = 1;
    spread(s.inp, 0, 1.28);
    run(s, 4);
    check(s.rig.position.y > y1, `ムササビ: both triggers ride an updraft (+${Math.round(s.rig.position.y - y1)} m)`);
  }
  // ほうき: trigger goes along the broom; pointing it left turns you left
  {
    const s = make('broom', { y: 300 });
    s.inp.hands.R.trigger = 1;
    run(s, 3);
    check(s.rig.position.z < -100, `ほうき: trigger flies forward (${Math.round(-s.rig.position.z)} m)`);
    s.inp.hands.R.ray.d.set(-1, 0, -1).normalize();
    const y0 = s.rig.rotation.y;
    run(s, 1.5);
    check(s.rig.rotation.y > y0 + 0.5 && s.f.vel.x < -10, `ほうき: pointing left turns left (${((s.rig.rotation.y - y0) * 57.3).toFixed(0)}°)`);
    s.inp.hands.R.trigger = 0;
    run(s, 4);
    check(s.f.speed < 15, `ほうき: letting go hovers (${s.f.speed.toFixed(1)} m/s)`);
  }
  // グライダー: ~35:1 in still air; climbs in a thermal; the stick banks it into a turn
  {
    const s = make('glider', { y: 1500 });
    run(s, 10);
    const p0 = s.rig.position.clone();
    run(s, 30);
    const d = s.rig.position.clone().sub(p0);
    const ratio = Math.hypot(d.x, d.z) / -d.y;
    check(ratio > 25 && ratio < 50, `グライダー: glide ratio ${ratio.toFixed(0)}:1 at ${Math.round(s.f.st.V * 3.6)} km/h`);
    const s2 = make('glider', { y: 800 });
    s2.f.air.thermals = [{ x: 0, z: 0, r: 250, s: 3.5, top: 2000, g: 0, gz: 12 }];
    s2.inp.hands.R.stick = [-0.55, 0.3]; // circle left, a bit slow
    const y0 = s2.rig.position.y;
    run(s2, 40);
    const yaw = s2.rig.rotation.y;
    check(s2.rig.position.y > y0 + 40, `グライダー: circling in a thermal climbs (+${Math.round(s2.rig.position.y - y0)} m in 40 s)`);
    check(yaw > 2, `グライダー: left stick banks into a left turn (${Math.round(yaw * 57.3)}°)`);
    const s3 = make('glider', { y: 1 });
    s3.f.onGround = true; s3.f.st.V = 25;
    run(s3, 8);
    check(s3.f.speed < 2, `グライダー: rolls to a stop on the ground (${s3.f.speed.toFixed(1)} m/s)`);
  }
  // 気球: burner up, cools down, vent down faster; the wind carries it (and turns with height)
  {
    const s = make('balloon', { y: 400 });
    s.f.air = new Air({ id: 'wind', r: 25 });
    s.f.air.thermals = [];
    s.inp.hands.R.trigger = 1;
    run(s, 20);
    const vUp = s.f.vel.y, h = Math.hypot(s.f.vel.x, s.f.vel.z);
    check(vUp > 1, `気球: burner → rising ${vUp.toFixed(1)} m/s, heat ${Math.round(s.f.st.heat * 100)}%`);
    check(h > 2, `気球: the wind carries it (${(h * 3.6).toFixed(0)} km/h, ${s.f.info})`);
    s.inp.hands.R.trigger = 0;
    s.inp.hands.R.buttons = [false, false, false, false, true];
    run(s, 25);
    check(s.f.vel.y < -1, `気球: venting → sinking ${s.f.vel.y.toFixed(1)} m/s`);
    const a = s.f.air.wind(100, new THREE.Vector3()), c = s.f.air.wind(3000, new THREE.Vector3());
    check(Math.abs(Math.atan2(a.z, a.x) - Math.atan2(c.z, c.x)) > 0.3 && c.length() > a.length(), 'the wind turns and strengthens with height (a balloon steers by height)');
  }
  // ジェットパック: palms down + triggers climb; nothing → fall; A/X hovers
  {
    const s = make('jetpack', { y: 300 });
    for (const h of [s.inp.hands.L, s.inp.hands.R]) { h.ray.d.set(0, -1, 0); h.trigger = 1; }
    run(s, 2);
    check(s.f.vel.y > 3, `ジェットパック: palms down, full thrust → climbing ${s.f.vel.y.toFixed(1)} m/s`);
    for (const h of [s.inp.hands.L, s.inp.hands.R]) h.trigger = 0;
    run(s, 2);
    check(s.f.vel.y < -5, `ジェットパック: no thrust → falling ${s.f.vel.y.toFixed(1)} m/s`);
    for (const h of [s.inp.hands.L, s.inp.hands.R]) { h.ray.d.set(0, -1, 1).normalize(); h.trigger = 1; }
    s.inp.hands.L.buttons = [false, false, false, false, true];
    run(s, 2);
    check(s.f.speed < 3, `ジェットパック: A / X hovers (${s.f.speed.toFixed(1)} m/s)`);
  }
  // 魔法のじゅうたん: lean forward → go; lean right → turn right
  {
    const s = make('carpet', { y: 200 });
    s.inp.head.set(0, 1.6, -0.16);
    run(s, 4);
    check(s.rig.position.z < -40, `じゅうたん: leaning forward flies forward (${Math.round(-s.rig.position.z)} m)`);
    s.inp.head.set(0.16, 1.6, 0);
    const y0 = s.rig.rotation.y;
    run(s, 2);
    check(s.rig.rotation.y < y0 - 0.5, `じゅうたん: leaning right turns right (${((s.rig.rotation.y - y0) * 57.3).toFixed(0)}°)`);
  }
  // on a screen
  {
    const s = make('glider', { y: 1500, xr: false });
    s.sin.keys.add('KeyD');
    const h0 = s.f.heading;
    run(s, 4);
    check(s.f.heading < h0 - 0.2, `画面・グライダー: D banks right (${((s.f.heading - h0) * 57.3).toFixed(0)}°)`);
    const s2 = make('balloon', { y: 400, xr: false });
    s2.sin.keys.add('Space');
    run(s2, 15);
    check(s2.f.vel.y > 1, `画面・気球: Space = burner (${s2.f.vel.y.toFixed(1)} m/s)`);
    const s3 = make('bird', { y: 400, xr: false });
    s3.sin.keys.add('Space');
    run(s3, 8);
    check(s3.rig.position.y > 400, `画面・鳥: Space flaps and climbs (+${Math.round(s3.rig.position.y - 400)} m)`);
    const s4 = make('jetpack', { y: 400, xr: false });
    s4.sin.keys.add('Space');
    run(s4, 2);
    check(s4.f.vel.y > 2, `画面・ジェットパック: Space thrusts up (${s4.f.vel.y.toFixed(1)} m/s)`);
  }
  return out;
});
let ok = true;
for (const [good, msg] of results) { console.log(`${good ? 'ok ' : 'BAD'} ${msg}`); ok = ok && good; }
console.log(`${errors.length ? 'BAD' : 'ok '} no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok && !errors.length ? 0 : 1);
