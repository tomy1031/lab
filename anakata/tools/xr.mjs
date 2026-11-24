// tools/xr.mjs — drives the real WebXR code path in Meta's emulator (IWER, Meta Quest 3 profile: the same
// Touch Plus controllers as the Quest 3S): enter VR → the guide cards float above both controllers and the
// panel says what to do → A hides the guide, X shows it again → B opens the chapter list → laser + trigger
// on a chapter → grab the W lever with the grip and pull it up → grab a knob and twist the wrist → the right
// thumbstick turns the tesseract → throw the moon by hand → in the tesseract, walk along time with the left
// stick and push the ball with the laser → hand tracking: the guide card changes to pinches → leave VR.
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
  const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
  d.installRuntime({ forceInstall: true });
  d.position.set(0, 1.6, 0);
  window.__xrd = d;
});
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

await page.goto(base, { waitUntil: 'load' });
await until(() => window.__app && !document.getElementById('btn-vr').disabled);
await page.click('#btn-vr');
await until(() => window.__app.xrActive && window.__app.current.index === 1);

// helpers in the page
await page.evaluate(() => {
  const app = window.__app, d = window.__xrd;
  const V = app.input.head.constructor, Q = app.input.headQuat.constructor;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ctl = (s) => d.controllers[s === 'L' ? 'left' : 'right'];
  window.__frame = frame;
  window.__frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
  // point a controller's laser at a world point
  window.__aimAt = async (side, target) => {
    const c = ctl(side);
    for (let i = 0; i < 4; i++) {
      await frame();
      const r = app.input.xr[side].ray;
      const want = target.clone().sub(r.origin).normalize();
      const fix = new Q().setFromUnitVectors(r.direction.clone().normalize(), want);
      const q = new Q(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).premultiply(fix);
      c.quaternion.set(q.x, q.y, q.z, q.w);
    }
    await frame();
  };
  // the world point of a button on the guide panel
  window.__panelButton = (id) => {
    const p = app.panel;
    const btn = p.buttons.find((x) => x.id === id);
    if (!btn) throw new Error('no button ' + id);
    return p.mesh.localToWorld(new V(((btn.x + btn.w / 2) / p.canvas.width - 0.5) * p.wm, (0.5 - (btn.y + btn.h / 2) / p.canvas.height) * p.hm, 0));
  };
  window.__press = async (side, id) => { const c = ctl(side); c.updateButtonValue(id, 1); await frame(); c.updateButtonValue(id, 0); await frame(); await frame(); };
  window.__hold = (side, id, v) => ctl(side).updateButtonValue(id, v);
  // move a controller's grip to a world point (the emulator places the controller, the grip follows it)
  window.__moveTo = async (side, target) => {
    const c = ctl(side);
    for (let i = 0; i < 3; i++) {
      await frame();
      const g = app.input.xr[side].pos;
      c.position.set(c.position.x + target.x - g.x, c.position.y + target.y - g.y, c.position.z + target.z - g.z);
    }
    await frame();
  };
  window.__ctl = ctl;
  window.__V = V; window.__Q = Q;
});
await page.evaluate(() => window.__frames(8));
check(await page.evaluate(() => window.__app.panel.mesh.visible), 'entered VR at chapter 1: the guide panel floats in front of you');

// the controls guide
const g1 = await page.evaluate(() => ({ L: window.__app.guide.cards.L.sprite.visible, R: window.__app.guide.cards.R.sprite.visible, how: window.__app.panel.spec.how }));
check(g1.L && g1.R && /トリガー/.test(g1.how), `guide on: cards above both controllers, panel says 「${g1.how}」`);
await shot(page, 'xr-guide.png');
await page.evaluate(() => window.__press('R', 'a-button'));
const g2 = await page.evaluate(() => ({ on: window.__app.guide.on, L: window.__app.guide.cards.L.sprite.visible, how: window.__app.panel.spec.how }));
check(!g2.on && !g2.L && !g2.how, 'A button: the guide is hidden');
await page.evaluate(() => window.__press('L', 'x-button'));
check(await page.evaluate(() => window.__app.guide.on), 'X button: the guide is back');

// B: the chapter list; laser + trigger on chapter 3
await page.evaluate(() => window.__press('R', 'b-button'));
check(await page.evaluate(() => window.__app.menuOpen), 'B button: the chapter list opens');
await page.evaluate(async () => { await window.__aimAt('R', window.__panelButton('ch2')); });
const hov = await page.evaluate(() => window.__app.panel.hoverId);
check(hov === 'ch2', `the laser hovers chapter 3 (${hov})`);
await page.evaluate(() => window.__press('R', 'trigger'));
await until(() => window.__app.current.index === 3 && !window.__app.menuOpen, null, 5000);
check(true, 'trigger: chapter 3 「4次元の切り口」 opens');

// grab the W lever with the grip and pull it up
const lever = await page.evaluate(async () => {
  const sl = window.__app.current.rig.console.slider;
  const v0 = sl.value;
  await window.__moveTo('L', sl.knobWorld());
  window.__hold('L', 'squeeze', 1);
  await window.__frames(2);
  const c = window.__ctl('L');
  for (let i = 0; i < 10; i++) { c.position.set(c.position.x, c.position.y + 0.02, c.position.z); await window.__frame(); }
  window.__hold('L', 'squeeze', 0);
  await window.__frames(2);
  return [v0, sl.value];
});
check(lever[1] > lever[0] + 0.25, `grip on the W lever and pull up: ${lever[0].toFixed(2)} → ${lever[1].toFixed(2)}`);

// grab a knob and twist the wrist
await page.evaluate(() => window.__app.current.setStep(4));
const twist = await page.evaluate(async () => {
  const ch = window.__app.current, dial = ch.rig.console.dials[0];
  const v0 = ch.rig.version, a0 = dial.angle;
  await window.__moveTo('R', dial.center());
  window.__hold('R', 'squeeze', 1);
  await window.__frames(2);
  const c = window.__ctl('R');
  const Q = window.__Q, V = window.__V;
  const axis = new V(0, 1, 0).transformDirection(dial.group.matrixWorld);
  for (let i = 0; i < 12; i++) {
    const q = new Q(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).premultiply(new Q().setFromAxisAngle(axis, 0.08));
    c.quaternion.set(q.x, q.y, q.z, q.w);
    await window.__frame();
  }
  window.__hold('R', 'squeeze', 0);
  await window.__frames(2);
  return { updates: ch.rig.version - v0, turned: dial.angle - a0 };
});
check(twist.updates > 3 && Math.abs(twist.turned) > 0.5, `grip a knob and twist the wrist: the knob turns ${(twist.turned * 57.3).toFixed(0)}°, the tesseract rotates (${twist.updates} updates)`);

// thumbsticks
const stick = await page.evaluate(async () => {
  const ch = window.__app.current, v0 = ch.rig.version, w0 = ch.rig.console.slider.value;
  window.__ctl('R').updateAxes('thumbstick', 1, 0);
  window.__ctl('L').updateAxes('thumbstick', 0, -1);
  await window.__frames(10);
  window.__ctl('R').updateAxes('thumbstick', 0, 0);
  window.__ctl('L').updateAxes('thumbstick', 0, 0);
  await window.__frames(2);
  return { rot: ch.rig.version - v0, w: ch.rig.console.slider.value - w0 };
});
check(stick.rot > 3 && stick.w > 0, `thumbsticks: right turns X→W (${stick.rot} updates), left moves W up (+${stick.w.toFixed(2)})`);
await shot(page, 'xr-slices.png');

// throw the moon by hand
await page.evaluate(() => { window.__app.go(5, 1); window.__app.current.resetMoon(); });
const thrown = await page.evaluate(async () => {
  const g = window.__app.current;
  await window.__frames(3);
  await window.__moveTo('R', g.moon.getWorldPosition(new window.__V()));
  window.__hold('R', 'squeeze', 1);
  await window.__frames(2);
  const c = window.__ctl('R');
  for (let i = 0; i < 6; i++) { c.position.set(c.position.x, c.position.y + 0.004, c.position.z - 0.02); await window.__frame(); }
  window.__hold('R', 'squeeze', 0);
  await window.__frames(2);
  return { state: g.state, v: g.vel.length() };
});
check(thrown.state === 'flying' && thrown.v > 0.05, `grip the moon and throw it: ${thrown.state} at ${thrown.v.toFixed(2)} m/s`);

// the tesseract: walk along time with the left stick, push the ball with the laser
await page.evaluate(() => window.__app.go(6, 2));
await until(() => window.__app.current.u >= 1, null, 40000); // software rendering in the emulator is slow
const walk = await page.evaluate(async () => {
  const ch = window.__app.current, t0 = ch.tNow();
  window.__ctl('L').updateAxes('thumbstick', 1, 0);
  await window.__frames(30);
  window.__ctl('L').updateAxes('thumbstick', 0, 0);
  await window.__frames(20);
  return [t0, ch.tNow(), ch.travel.x];
});
check(walk[1] > walk[0], `left stick: you walk into the future (t = ${walk[0]} → ${walk[1]} s, ${walk[2].toFixed(1)} m)`);
await page.evaluate(() => window.__app.current.setStep(4));
const push = await page.evaluate(async () => {
  const ch = window.__app.current;
  await window.__frames(4);
  await window.__aimAt('R', ch.ballWorld());
  await window.__press('R', 'trigger');
  await window.__frames(4);
  return ch.nudges.length;
});
check(push === 1, 'laser + trigger on the ball: the past is pushed, the future rewrites');
await shot(page, 'xr-tesseract.png');

// hand tracking: the card explains pinches
await page.evaluate(async () => { window.__xrd.primaryInputMode = 'hand'; await window.__frames(6); });
const hand = await page.evaluate(() => ({ isHand: window.__app.input.xr.R.isHand, key: window.__app.guide.cards.R.key, how: window.__app.panel.spec.how }));
check(hand.isHand && /true/.test(hand.key) && /つまむ/.test(hand.how), `hand tracking: the guide speaks of pinches (「${hand.how}」)`);

await page.evaluate(() => window.__app.renderer.xr.getSession().end());
await until(() => !window.__app.xrActive && !document.getElementById('start').classList.contains('hidden'), null, 5000);
check(true, 'leaving VR returns to the start sheet');
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
