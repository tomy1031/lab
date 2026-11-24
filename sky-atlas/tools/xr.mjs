// tools/xr.mjs — drives the real WebXR code path in Meta's emulator (IWER, Meta Quest 3 profile), with the
// pretend internet: a place's "VR で飛ぶ" → in VR over the ground → スーパーマン: the right trigger flies
// where the right hand points → B opens the menu → laser + trigger on つばさ → arms spread and tilted turn
// you → right stick snap-turns 30° → the menu's "VR を終わる" leaves VR.
//   npm i && node tools/xr.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { browser, serveApp } from './pw.mjs';
import { mockNet } from './mock.mjs';

const require = createRequire(import.meta.url);
const IWER = process.env.IWER_PATH || require.resolve('iwer/build/iwer.min.js');
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };

const { srv, base } = await serveApp();
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 900, height: 500 } });
await mockNet(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.addInitScript({ path: IWER });
await page.addInitScript(() => {
  const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
  d.installRuntime({ forceInstall: true });
  d.position.set(0, 1.6, 0);
  window.__xrd = d;
});
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

await page.goto(base + '?quality=low', { waitUntil: 'load' });
await until(() => window.__app && !document.getElementById('btn-vr').disabled);
check(true, 'VR is available (emulated Quest 3)');
await page.click('#presets .place [data-act="fly"]');
await until(() => window.__app.state === 'vr' && window.__app.world && window.__app.world.terrain.started);
check(await page.evaluate(() => window.__app.renderer.xr.isPresenting), `in VR over ${await page.evaluate(() => window.__app.area.name)}`);

await page.evaluate(() => {
  const app = window.__app, d = window.__xrd;
  const V = app.rig.position.constructor, Q = app.rig.quaternion.constructor;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__frame = frame;
  window.__wait = async (ms) => { const t = performance.now(); while (performance.now() - t < ms) await frame(); };
  window.__aim = async (side, panel, id) => {
    const c = d.controllers[side === 'L' ? 'left' : 'right'];
    const btn = panel.buttons.find((x) => x.id === id);
    if (!btn) throw new Error('no button ' + id);
    const W = panel.w / panel.ppm, H = panel.h / panel.ppm;
    const target = panel.mesh.localToWorld(new V((btn.x + btn.w / 2) / panel.ppm - W / 2, H / 2 - (btn.y + btn.h / 2) / panel.ppm, 0));
    const tl = app.rig.worldToLocal(target.clone()); // the emulator works in the play area (rig) space
    for (let i = 0; i < 5; i++) {
      await frame();
      const h = app.xin.hands[side];
      const fix = new Q().setFromUnitVectors(h.ray.d.clone().normalize(), tl.clone().sub(h.ray.o).normalize());
      const q = new Q(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).premultiply(fix);
      c.quaternion.set(q.x, q.y, q.z, q.w);
    }
    await frame();
    return panel.hover;
  };
  window.__press = async (side, id, v = 1) => {
    const c = d.controllers[side === 'L' ? 'left' : 'right'];
    c.updateButtonValue(id, v); await frame();
    c.updateButtonValue(id, 0); await frame(); await frame();
  };
});

// スーパーマン: point the right hand straight ahead and hold the trigger
const fly = await page.evaluate(async () => {
  const app = window.__app, d = window.__xrd;
  const c = d.controllers.right;
  c.position.set(0.25, 1.3, -0.4);
  c.quaternion.set(0, 0, 0, 1);
  await window.__wait(300);
  const p0 = app.rig.position.clone();
  c.updateButtonValue('trigger', 1);
  await window.__wait(1500);
  c.updateButtonValue('trigger', 0);
  const p1 = app.rig.position.clone();
  const fwd = new p0.constructor(0, 0, -1).applyQuaternion(app.rig.quaternion);
  return { along: p1.clone().sub(p0).dot(fwd), dist: p1.distanceTo(p0), speed: app.flight.speed, mode: app.flight.mode };
});
check(fly.mode === 'point' && fly.along > 30 && fly.along > 0.9 * fly.dist, `right trigger flies where the hand points (${Math.round(fly.along)} m ahead, ${Math.round(fly.speed * 3.6)} km/h)`);
await shot(page, '1-vr-flight.png');

// B → menu; aim at つばさ and pull the trigger
await page.evaluate(() => window.__press('R', 'b-button'));
await until(() => window.__app.menu.visible);
check(true, 'B opens the menu panel in front of you');
const hov = await page.evaluate(() => window.__aim('R', window.__app.menu, 'mode:wings'));
check(hov === 'mode:wings', `laser hovers つばさ (${hov})`);
await shot(page, '2-vr-menu.png');
await page.evaluate(() => window.__press('R', 'trigger'));
check(await page.evaluate(() => window.__app.flight.mode === 'wings'), 'trigger picks つばさ');
await page.evaluate(() => window.__press('R', 'b-button'));
await until(() => !window.__app.menu.visible);

// つばさ: arms spread, left hand higher → turning right (yaw decreasing), moving forward
const wings = await page.evaluate(async () => {
  const app = window.__app, d = window.__xrd;
  const L = d.controllers.left, R = d.controllers.right;
  L.quaternion.set(0, 0, 0, 1); R.quaternion.set(0, 0, 0, 1);
  L.position.set(-0.8, 1.42, -0.1); R.position.set(0.8, 1.42, -0.1);
  await window.__wait(600);
  const y0 = app.rig.rotation.y, p0 = app.rig.position.clone();
  L.position.set(-0.78, 1.62, -0.1); R.position.set(0.78, 1.22, -0.1);
  await window.__wait(1200);
  return { open: app.flight.wingsOpen, dyaw: app.rig.rotation.y - y0, moved: app.rig.position.distanceTo(p0), vig: app.vignette.k };
});
check(wings.open && wings.dyaw < -0.05 && wings.moved > 5, `つばさ: spread arms glide (${Math.round(wings.moved)} m) and a tilt turns right (${(wings.dyaw * 180 / Math.PI).toFixed(0)}°), comfort vignette ${wings.vig.toFixed(2)}`);
await shot(page, '3-vr-wings.png');

// right stick → a 30° snap turn
const snap = await page.evaluate(async () => {
  const app = window.__app, d = window.__xrd;
  d.controllers.left.position.set(-0.2, 1.1, -0.2); d.controllers.right.position.set(0.2, 1.1, -0.2); // fold the wings
  await window.__wait(300);
  const y0 = app.rig.rotation.y;
  d.controllers.right.updateAxes('thumbstick', 1, 0);
  await window.__wait(200);
  d.controllers.right.updateAxes('thumbstick', 0, 0);
  await window.__wait(100);
  return ((app.rig.rotation.y - y0) * 180) / Math.PI;
});
check(Math.abs(snap + 30) < 1, `right stick snap-turns right by 30° (${snap.toFixed(1)}°)`);

// HUD on the wrist shows numbers
const hud = await page.evaluate(() => window.__app.hud.data);
check(hud.kmh >= 0 && hud.alt > 0 && hud.name, `wrist display: ${hud.name}・${hud.kmh} km/h・標高 ${hud.alt} m・${hud.dir}`);

// leave VR from the menu
await page.evaluate(() => window.__press('L', 'y-button'));
await until(() => window.__app.menu.visible);
await page.evaluate(async () => { await window.__aim('R', window.__app.menu, 'exit'); await window.__press('R', 'trigger'); });
await until(() => window.__app.state === 'menu' && !window.__app.renderer.xr.isPresenting);
check(await page.isVisible('#menu'), 'VR を終わる → back to the menu page');
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
