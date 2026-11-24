// tools/xr.mjs — rides through the real WebXR code path in Meta's emulator (IWER, Meta Quest 3 profile):
// enter VR → the menu board floats in front → laser + trigger on 「スタート」 → stand still: calibration →
// 3-2-1 → move the headset right: the rider turns right → crouch: tuck → crouch and extend fast: an ollie →
// on a kicker, turn the headset 360° in the air: a 360 → reach a controller down with the grip in the air: a grab
// → B: pause → B: resume → reach the finish: the results board → the "follow" view turns the world with you
// → stick control (seated) → leave VR.
//   npm i && node tools/xr.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { browser, serveApp } from './pw.mjs';

const require = createRequire(import.meta.url);
const IWER = process.env.IWER_PATH || require.resolve('iwer/build/iwer.min.js');
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };

const { srv, base } = await serveApp();
const b = await browser();
const page = await b.newPage({ viewport: { width: 1000, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript({ path: IWER });
await page.addInitScript(() => {
  localStorage.clear();
  const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
  d.installRuntime({ forceInstall: true });
  d.position.set(0, 1.7, 0);
  window.__xrd = d;
});
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

await page.goto(base + '?course=practice', { waitUntil: 'load' });
await until(() => window.__app && !document.getElementById('btn-vr').disabled);
await page.click('#btn-vr');
await until(() => window.__app.xrActive && window.__app.state === 'vrmenu');

await page.evaluate(() => {
  const app = window.__app, d = window.__xrd;
  const V = app.camera.position.constructor, Q = app.camera.quaternion.constructor;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ctl = (s) => d.controllers[s === 'L' ? 'left' : 'right'];
  Object.assign(window, { __V: V, __Q: Q, __frame: frame, __ctl: ctl });
  window.__frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
  window.__aimAt = async (side, target) => {
    const c = ctl(side);
    for (let i = 0; i < 4; i++) {
      await frame();
      const h = app.xr.hands.find((x) => x.side === side);
      const m = h.ray.matrixWorld;
      const o = new V().setFromMatrixPosition(m), dir = new V(0, 0, -1).transformDirection(m);
      const fix = new Q().setFromUnitVectors(dir, target.clone().sub(o).normalize());
      // the emulator's controller lives in the play space; the dolly may be turned
      const dq = new Q().setFromRotationMatrix(app.dolly.matrixWorld);
      const fixLocal = dq.clone().invert().multiply(fix).multiply(dq);
      const q = new Q(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).premultiply(fixLocal);
      c.quaternion.set(q.x, q.y, q.z, q.w);
    }
    await frame();
  };
  window.__btn = (id) => {
    const p = app.hud.panel;
    const btn = p.buttons.find((x) => x.id === id);
    if (!btn) throw new Error('no button ' + id + ' in ' + p.buttons.map((x) => x.id).join(','));
    return p.mesh.localToWorld(new V(((btn.x + btn.w / 2) / p.w - 0.5) * p.wm, (0.5 - (btn.y + btn.h / 2) / p.h) * p.hm, 0));
  };
  window.__press = async (side, id) => { const c = ctl(side); c.updateButtonValue(id, 1); await frame(); await frame(); c.updateButtonValue(id, 0); await frame(); await frame(); };
  window.__click = async (id) => { await window.__aimAt('R', window.__btn(id)); await window.__press('R', 'trigger'); };
  window.__head = (x, y, z) => { d.position.set(x, y, z); };
  window.__yaw = (a) => { const q = new Q().setFromAxisAngle(new V(0, 1, 0), a); d.quaternion.set(q.x, q.y, q.z, q.w); };
  window.__events = [];
  const h0 = app.handle.bind(app);
  app.handle = (ev) => { for (const e of ev) window.__events.push({ type: e.type, name: e.name, pts: e.pts, quality: e.quality }); h0(ev); };
});
await page.evaluate(() => window.__frames(6));
check(await page.evaluate(() => window.__app.hud.panel.mesh.visible && window.__app.hud.panel.buttons.some((b) => b.id === 'start')), 'entered VR: the menu board floats in front of you');
await shot(page, 'xr-menu.png');

// laser + trigger on スタート → calibration
await page.evaluate(() => window.__click('start'));
await until(() => window.__app.state === 'calib', null, 10000);
check(true, 'laser + trigger on 「スタート」: calibration (stand still, look downhill)');
await until(() => window.__app.state === 'count' || window.__app.state === 'ride', null, 30000);
const cal = await page.evaluate(() => window.__app.body.cal);
check(Math.abs(cal.h - 1.7) < 0.02 && Math.abs(cal.x) < 0.02, `calibrated: standing height ${cal.h.toFixed(2)} m, feet at (${cal.x.toFixed(2)}, ${cal.z.toFixed(2)})`);
await until(() => window.__app.state === 'ride', null, 30000);
check(true, '3・2・1・GO: riding');
await shot(page, 'xr-ride.png');

// lean right: move the headset 15 cm to the right → the rider heads right
const lean = await page.evaluate(async () => {
  const app = window.__app, r = app.run.rider;
  app.jumpTo(60, 12);
  window.__head(0, 1.7, 0); await window.__frames(4);
  const h0 = r.heading, x0 = r.pos.x;
  window.__head(0.15, 1.7, 0);
  await window.__frames(25);
  const res = { lean: app.it.lean, dh: r.heading - h0, dx: r.pos.x - x0, edge: r.edge };
  window.__head(0, 1.7, 0); await window.__frames(4);
  return res;
});
check(lean.lean > 0.05 && lean.dh < -0.05 && lean.dx > 0.2, `headset 15 cm right: lean ${(lean.lean * 57.3).toFixed(1)}°, heading ${(lean.dh * 57.3).toFixed(0)}°, moved ${lean.dx.toFixed(2)} m right, edge ${(lean.edge * 57.3).toFixed(0)}°`);
const leanL = await page.evaluate(async () => {
  const app = window.__app, r = app.run.rider;
  app.jumpTo(60, 12);
  await window.__frames(3);
  const h0 = r.heading;
  window.__head(-0.15, 1.7, 0); await window.__frames(25);
  const res = { dh: r.heading - h0 };
  window.__head(0, 1.7, 0); await window.__frames(4);
  return res;
});
check(leanL.dh > 0.05, `headset 15 cm left: heading +${(leanL.dh * 57.3).toFixed(0)}° (left)`);

// crouch: the head 35 cm lower → tuck
const tuck = await page.evaluate(async () => {
  const app = window.__app;
  window.__head(0, 1.35, 0); await window.__frames(12);
  const c = app.it.crouch;
  window.__head(0, 1.7, 0); await window.__frames(12);
  return c;
});
check(tuck > 0.7, `head 35 cm lower: tuck ${tuck.toFixed(2)}`);

// crouch, then extend fast: an ollie
const ollie = await page.evaluate(async () => {
  const app = window.__app, r = app.run.rider;
  app.jumpTo(160, 12);
  window.__events.length = 0;
  window.__head(0, 1.45, 0); await window.__frames(10);
  let air = false;
  for (let i = 0; i <= 6; i++) { window.__head(0, 1.45 + 0.045 * i, 0); await window.__frame(); air = air || r.air; }
  for (let i = 0; i < 10; i++) { await window.__frame(); air = air || r.air; }
  return { air, pops: window.__events.filter((e) => e.type === 'pop').length };
});
check(ollie.air && ollie.pops === 1, `crouch and extend fast: an ollie (${ollie.pops} pop, in the air: ${ollie.air})`);
await page.evaluate(() => window.__frames(30));

// a kicker: turn 360° in the air, and grab with the right hand low and the grip held
const air = await page.evaluate(async () => {
  const app = window.__app, r = app.run.rider, k = app.course.kickers[1];
  window.__head(0, 1.7, 0); window.__yaw(0);
  app.jumpTo(k.s - 30, 15);
  window.__events.length = 0;
  while (!r.air) await window.__frame();
  const c = window.__ctl('R');
  c.position.set(0.25, 0.5, -0.1);
  c.updateButtonValue('squeeze', 1);
  let a = 0, grabbed = false;
  while (r.air) {
    a = Math.min(2 * Math.PI, a + 0.5);
    window.__yaw(a);
    await window.__frame();
    grabbed = grabbed || !!app.it.grab;
  }
  c.updateButtonValue('squeeze', 0);
  c.position.set(0.25, 1.1, -0.3);
  await window.__frames(6);
  window.__yaw(0); await window.__frames(4);
  return { grabbed, tricks: window.__events.filter((e) => e.type === 'trick') };
});
const t360 = air.tricks.find((t) => /360/.test(t.name));
check(air.grabbed, 'in the air, the right hand down with the grip: a grab');
check(t360 && t360.pts > 300, `the headset turned 360° in the air: 「${t360?.name}」 +${t360?.pts} (${t360?.quality})`);
await shot(page, 'xr-air.png');

// B: pause, B: resume
await page.evaluate(() => window.__press('R', 'b-button'));
check(await page.evaluate(() => window.__app.state === 'pause' && window.__app.hud.panel.mesh.visible), 'B: pause board');
await page.evaluate(() => window.__press('R', 'b-button'));
check(await page.evaluate(() => window.__app.state === 'ride' && !window.__app.hud.panel.mesh.visible), 'B again: riding on');

// the finish → results board
await page.evaluate(() => { const app = window.__app; app.jumpTo(app.course.length - 15, 14); });
await until(() => window.__app.state === 'results', null, 60000);
const res = await page.evaluate(() => ({ vis: window.__app.hud.panel.mesh.visible, title: window.__app.hud.panel.spec.title, ids: window.__app.hud.panel.buttons.map((b) => b.id) }));
check(res.vis && /ランク/.test(res.title) && res.ids.includes('retry'), `finish line: results board 「${res.title}」`);
await shot(page, 'xr-results.png');

// the follow view: the world turns with your heading
const follow = await page.evaluate(async () => {
  const app = window.__app;
  app.settings.view = 'follow';
  await window.__click('retry');
  for (let i = 0; i < 400 && app.state !== 'ride'; i++) await window.__frame();
  app.jumpTo(60, 12);
  window.__head(0.15, 1.7, 0);
  const y0 = app.rigYaw;
  await window.__frames(25);
  window.__head(0, 1.7, 0);
  const res = { state: app.state, turned: app.rigYaw - y0 };
  app.settings.view = 'fixed';
  return res;
});
check(follow.state === 'ride' && follow.turned < -0.03, `「進行方向に回る」 view: the world turned ${(follow.turned * 57.3).toFixed(0)}° with your heading`);

// stick control (seated)
const stick = await page.evaluate(async () => {
  const app = window.__app, r = app.run.rider;
  app.settings.control = 'stick';
  app.jumpTo(60, 12);
  await window.__frames(2);
  const h0 = r.heading;
  window.__ctl('L').updateAxes('thumbstick', 1, 0);
  await window.__frames(20);
  window.__ctl('L').updateAxes('thumbstick', 0, 0);
  app.settings.control = 'body';
  return r.heading - h0;
});
check(stick < -0.05, `stick control: left stick right turns right (${(stick * 57.3).toFixed(0)}°)`);

// leave VR
await page.evaluate(() => window.__app.renderer.xr.getSession().end());
await until(() => !window.__app.xrActive && window.__app.state === 'title', null, 10000);
check(await page.isVisible('#start'), 'left VR: back to the start page');
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
