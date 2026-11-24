// tools/shots.mjs — the pictures in docs/: preview.jpg (the lab page card: a grab off a kicker, seen from
// behind on a PC) and vr-view.jpg (what you see in the headset, from Meta's emulator: the slope ahead,
// your mittens, the clock on your wrist, the ring at your feet).
//   node tools/shots.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { browser, serveApp } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { srv, base } = await serveApp();
const b = await browser();

// 1. the card picture
{
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base + '?course=glacier&play&auto', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && window.__app.state === 'ride', null, { timeout: 30000 });
  await page.evaluate(() => { document.getElementById('hud').style.display = 'none'; document.getElementById('topbar').style.display = 'none'; });
  await page.evaluate(async () => {
    const app = window.__app, r = app.run.rider;
    app.jumpTo(176, 15);
    const raf = () => new Promise((res) => requestAnimationFrame(res));
    while (r.s < 196) await raf();
  });
  await page.screenshot({ path: path.join(root, 'docs', 'preview.jpg'), type: 'jpeg', quality: 86 });
  console.log('wrote docs/preview.jpg');
  await page.close();
}

// 2. the view in the headset
{
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript({ path: require.resolve('iwer/build/iwer.min.js') });
  await page.addInitScript(() => {
    localStorage.clear();
    const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
    d.installRuntime({ forceInstall: true });
    d.position.set(0, 1.7, 0);
    d.controllers.left.position.set(-0.28, 1.05, -0.32);
    d.controllers.right.position.set(0.3, 1.0, -0.3);
    window.__xrd = d;
  });
  await page.goto(base + '?course=hill', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && !document.getElementById('btn-vr').disabled);
  await page.click('#btn-vr');
  await page.waitForFunction(() => window.__app.state === 'vrmenu');
  await page.evaluate(async () => {
    const app = window.__app, d = window.__xrd;
    const raf = () => new Promise((res) => requestAnimationFrame(res));
    app.autopilot = true;
    app.startRun();
    while (app.state !== 'ride') await raf();
    app.jumpTo(206, 13);
    // look a little down, as you do when you ride
    const q = new app.camera.quaternion.constructor().setFromAxisAngle(new app.camera.position.constructor(1, 0, 0), -0.22);
    d.quaternion.set(q.x, q.y, q.z, q.w);
    d.position.set(0.06, 1.55, 0);
    for (let i = 0; i < 40; i++) await raf();
  });
  await page.screenshot({ path: path.join(root, 'docs', 'vr-view.jpg'), type: 'jpeg', quality: 84 });
  console.log('wrote docs/vr-view.jpg');
  await page.close();
}
await b.close();
srv.close();
