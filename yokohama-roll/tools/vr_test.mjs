// VR smoke test without a headset: Meta's Immersive Web Emulation Runtime (IWER, devDependency) pretends to be
// a Quest 3 with Touch controllers, injected before the game boots.
//
//   node tools/vr_test.mjs [outDir]        (VIEW=960x540 to change the window size)
//
// Opens index.html?noshadow&lowres, turns on "VR で あそぶ", starts ストーリー, then checks: the session starts
// and renders in stereo, the HUD panel shows size/goal, the left stick moves the ball, a right-stick flick
// snap-turns 30°, the horizon stays level, and leaving VR restores the screen view. Screenshots: <outDir>/vr_*.png
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || process.env.OUT || os.tmpdir());
fs.mkdirSync(outDir, { recursive: true });
const query = process.env.QUERY || 'noshadow&lowres&density=0.4';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const [VW, VH] = (process.env.VIEW || '640x360').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const logs = [], errors = [];
const benign = (t) => /GPU stall|Automatic fallback|favicon|ERR_FILE_NOT_FOUND|404 \(Not Found\)/.test(t);
page.on('console', (m) => { const t = m.type() + ': ' + m.text(); logs.push(t); if (m.type() === 'error' && !benign(t)) errors.push(t); });
page.on('pageerror', (e) => { const t = 'pageerror: ' + e.message + '\n' + e.stack; logs.push(t); errors.push(t); });
await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => {
  const rel = route.request().url().split('three@0.170.0/')[1];
  route.fulfill({ path: path.join(root, 'node_modules/three', rel), contentType: 'text/javascript' });
});
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
// IWER: an emulated Quest 3 on navigator.xr, installed before any page script runs
await page.addInitScript({ path: path.join(root, 'node_modules/iwer/build/iwer.min.js') });
await page.addInitScript(() => {
  const dev = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: true });
  dev.installRuntime({ forceInstall: true });
  // hands resting low in front of the body (IWER's default puts them in front of the face)
  dev.controllers.left.position.set(-0.2, 1.05, -0.3);
  dev.controllers.right.position.set(0.2, 1.05, -0.3);
  window.__xrDevice = dev;
  window.vrApi = () => window.__game.camera.parent.getObjectByName('vr-hud-root').userData.vr;
});

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const shot = async (name) => { const p = path.join(outDir, `vr_${name}.png`); await page.screenshot({ path: p, timeout: 180000 }); console.log('  screenshot', p); };
// a real click when the element fits in the (small) window, else a DOM click (IWER needs no user activation)
const click = (sel) => page.click(sel, { timeout: 5000 }).catch(() => page.$eval(sel, (el) => el.click()));
const frames = () => page.evaluate(() => window.__game.renderer.info.render.frame);
async function waitFrames(n, timeout = 120000) {
  const f0 = await frames();
  await page.waitForFunction((t) => window.__game.renderer.info.render.frame >= t, f0 + n, { timeout, polling: 100 });
}

try {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/index.html?${query}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 180000 });
  console.log(`game ready after ${Date.now() - t0}ms`);
  await page.waitForFunction(() => document.body.classList.contains('vr-ok'), null, { timeout: 30000 }).catch(() => {});
  check('navigator.xr reports immersive-vr (VR buttons shown)', await page.evaluate(() => document.body.classList.contains('vr-ok')));
  const before = await page.evaluate(() => ({ shadows: window.__game.renderer.shadowMap.enabled, fov: window.__game.camera.fov }));

  // title: VR toggle, then ストーリー (vr.enter() runs inside that click)
  await click('#vr-toggle');
  await click('#mode-story');
  await page.waitForFunction(() => window.__game.renderer.xr.isPresenting && window.__game.state === 'play', null, { timeout: 60000 });
  check('session started from the mode click', await page.evaluate(() => !!window.__xrDevice.activeSession));
  await waitFrames(20);
  const fps0 = await frames(), tf = Date.now();
  await waitFrames(20);
  const fps = (((await frames()) - fps0) * 1000) / (Date.now() - tf);
  const st = await page.evaluate(() => {
    const g = window.__game, xr = g.renderer.xr, rig = g.camera.parent, cams = xr.getCamera().cameras;
    const e = rig.matrixWorld.elements, sc = Math.hypot(e[4], e[5], e[6]);
    const ball = g.ball.pos;
    const ndc = cams.map((c) => ball.clone().project(c));
    const eyeW = ball.clone().setFromMatrixPosition(cams[0].matrixWorld);
    return {
      cams: cams.length, eyes: cams.map((c) => c.viewport && [c.viewport.x, c.viewport.width]),
      rigUp: [e[4] / sc, e[5] / sc, e[6] / sc], scale: rig.scale.x, r: g.ball.r,
      ndc: ndc.map((v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]),
      eyeToBall: eyeW.distanceTo(ball) / rig.scale.x, shadows: g.renderer.shadowMap.enabled,
      hud: rig.getObjectByName('vr-hud').userData.hud, hudVisible: rig.getObjectByName('vr-hud-root').visible,
      comfort: rig.getObjectByName('vr-hud-root').userData.vr.comfort,
      camVsHead: g.camera.position.distanceTo(cams[0].position.clone().add(cams[1].position).multiplyScalar(0.5)),
      size: document.getElementById('size').textContent, goal: document.getElementById('goal-label').textContent,
      fb: [g.renderer.domElement.width, g.renderer.domElement.height],
      info: { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, programs: g.renderer.info.programs.length },
    };
  });
  console.log('  state', JSON.stringify(st), `~${fps.toFixed(1)} fps (swiftshader)`);
  check('stereo rendering (2 XR views, side by side)', st.cams === 2 && st.eyes[0][0] === 0 && st.eyes[1][0] > 0, JSON.stringify(st.eyes));
  check('horizon level (rig up = world up)', Math.abs(st.rigUp[1] - 1) < 1e-6, st.rigUp.map((v) => v.toFixed(4)).join(','));
  check('rig scaled with the ball (r / 0.4)', Math.abs(st.scale - st.r / 0.4) / (st.r / 0.4) < 0.05, `scale ${st.scale.toFixed(3)} r ${st.r}`);
  check('ball in view of both eyes', st.ndc.every(([x, y, z]) => Math.abs(x) < 0.9 && Math.abs(y) < 0.9 && z < 1), JSON.stringify(st.ndc));
  check('ball ~3.7 m in front of the eye (headset metres)', st.eyeToBall > 3 && st.eyeToBall < 4.5, st.eyeToBall.toFixed(2) + ' m');
  check('shadows off in VR', !st.shadows);
  check('comfort mode on by default, announced on the HUD', st.comfort && st.hud && /快適/.test(st.hud.notice || ''), st.hud && st.hud.notice);
  check('headset pose drives the camera (no screen shake/position reaches it)', st.camVsHead < 0.06, st.camVsHead.toFixed(3) + ' m');
  check('HUD panel shows size + goal', st.hudVisible && st.hud && st.hud.size === st.size && st.hud.goal === st.goal, JSON.stringify(st.hud));
  await shot('start');
  const hudPng = await page.evaluate(() => window.__game.camera.parent.getObjectByName('vr-hud').userData.canvas.toDataURL('image/png'));
  fs.writeFileSync(path.join(outDir, 'vr_hud.png'), Buffer.from(hudPng.split(',')[1], 'base64'));
  console.log('  hud canvas', path.join(outDir, 'vr_hud.png'));

  // left thumbstick forward → the ball rolls along its heading
  const p0 = await page.evaluate(() => { const b = window.__game.ball; return { x: b.pos.x, z: b.pos.z, hx: b.heading.x, hz: b.heading.z }; });
  await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -1));
  await waitFrames(45);
  const vigMoving = await page.evaluate(() => vrApi().vignette);
  await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
  const p1 = await page.evaluate(() => { const b = window.__game.ball; return { x: b.pos.x, z: b.pos.z }; });
  const dx = p1.x - p0.x, dz = p1.z - p0.z, moved = Math.hypot(dx, dz), along = (dx * p0.hx + dz * p0.hz) / (moved || 1);
  check('left stick forward moves the ball forward', moved > 0.3 && along > 0.7, `moved ${moved.toFixed(2)} m, along heading ${along.toFixed(2)}`);
  await shot('moved');
  await waitFrames(40);
  const vigStill = await page.evaluate(() => vrApi().vignette);
  check('tunnel vignette while moving, gone when still', vigMoving > 0.2 && vigStill < 0.03, `moving ${vigMoving.toFixed(2)}, still ${vigStill.toFixed(3)}`);

  // comfort mode: left stick X rolls the ball sideways, the heading (and view) does not turn
  const side = async (x, n) => {
    const a = await page.evaluate(() => { const b = window.__game.ball; return { x: b.pos.x, z: b.pos.z, hx: b.heading.x, hz: b.heading.z }; });
    await page.evaluate((x) => window.__xrDevice.controllers.left.updateAxes('thumbstick', x, 0), x);
    await waitFrames(n);
    const vigNow = await page.evaluate(() => vrApi().vignette);
    await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
    await waitFrames(3);
    const b = await page.evaluate(() => { const b = window.__game.ball; return { x: b.pos.x, z: b.pos.z, hx: b.heading.x, hz: b.heading.z }; });
    const dx = b.x - a.x, dz = b.z - a.z;
    // lateral: along right = heading × up; turn: degrees to the right (positive = clockwise from above)
    return { lateral: dx * -a.hz + dz * a.hx, turn: (Math.atan2(a.hx * b.hz - a.hz * b.hx, a.hx * b.hx + a.hz * b.hz) * 180) / Math.PI, vig: vigNow };
  };
  const c1 = await side(1, 30);
  check('comfort: stick X rolls sideways to the right, heading unchanged', c1.lateral > 0.2 && Math.abs(c1.turn) < 0.5, JSON.stringify(c1));
  // B (right) toggles to ふつう: stick X turns smoothly; the choice is remembered
  await page.evaluate(() => window.__xrDevice.controllers.right.updateButtonValue('b-button', 1));
  await waitFrames(3);
  await page.evaluate(() => window.__xrDevice.controllers.right.updateButtonValue('b-button', 0));
  await waitFrames(3);
  const tog = await page.evaluate(() => ({ comfort: vrApi().comfort, stored: localStorage.getItem('hamakoro.vr.comfort'), hud: window.__game.camera.parent.getObjectByName('vr-hud').userData.hud }));
  check('B toggles to ふつう (HUD notice, stored)', !tog.comfort && tog.stored === '0' && /ふつう/.test(tog.hud.notice || ''), JSON.stringify({ comfort: tog.comfort, stored: tog.stored, notice: tog.hud.notice }));
  await shot('notice');
  const n1 = await side(1, 20);
  check('ふつう: stick X turns smoothly right (vignette on yaw)', n1.turn > 5 && n1.vig > 0.05, JSON.stringify(n1)); // side(): right turn > 0
  await page.evaluate(() => window.__xrDevice.controllers.left.updateButtonValue('y-button', 1));
  await waitFrames(3);
  await page.evaluate(() => window.__xrDevice.controllers.left.updateButtonValue('y-button', 0));
  await waitFrames(3);
  check('Y toggles back to comfort', await page.evaluate(() => vrApi().comfort && localStorage.getItem('hamakoro.vr.comfort') === '1'));

  // right-stick flick → one 30° snap turn to the right (and the view cuts with it)
  const yaw = () => page.evaluate(() => {
    const g = window.__game, e = g.camera.parent.matrixWorld.elements;
    return { h: Math.atan2(g.ball.heading.x, g.ball.heading.z), rig: Math.atan2(-e[8], -e[10]) };
  });
  const y0 = await yaw();
  await page.evaluate(() => window.__xrDevice.controllers.right.updateAxes('thumbstick', 1, 0));
  await waitFrames(12);
  await page.evaluate(() => window.__xrDevice.controllers.right.updateAxes('thumbstick', 0, 0));
  await waitFrames(4);
  const y1 = await yaw();
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const dh = (wrapA(y1.h - y0.h) * 180) / Math.PI, dr = (wrapA(y1.rig - y0.rig) * 180) / Math.PI;
  // heading.x = sin(yaw): turning right (clockwise from above) lowers atan2(x, z)
  check('right-stick flick snap-turns 30° right (once)', Math.abs(dh + 30) < 4, `heading ${dh.toFixed(1)}°`);
  check('view follows the snap turn', Math.abs(dr - dh) < 6, `rig ${dr.toFixed(1)}°`);
  // a second flick needs the stick to come back first (re-arm); holding it does not repeat
  await page.evaluate(() => window.__xrDevice.controllers.right.updateAxes('thumbstick', -1, 0));
  await waitFrames(12);
  await page.evaluate(() => window.__xrDevice.controllers.right.updateAxes('thumbstick', 0, 0));
  await waitFrames(4);
  const y2 = await yaw();
  check('left flick snaps back', Math.abs((wrapA(y2.h - y0.h) * 180) / Math.PI) < 4, `${((wrapA(y2.h - y0.h) * 180) / Math.PI).toFixed(1)}°`);

  // trigger → dash (faster top speed)
  await page.evaluate(() => { const c = window.__xrDevice.controllers; c.right.updateButtonValue('trigger', 1); c.left.updateAxes('thumbstick', 0, -1); });
  await waitFrames(3);
  const ss0 = await page.evaluate(() => vrApi().speedScale);
  await waitFrames(37);
  const ss1 = await page.evaluate(() => vrApi().speedScale);
  check('comfort speedScale 0.8, dash eased in', ss0 < 0.7 && Math.abs(ss1 - 0.8) < 0.01, `just pressed ${ss0.toFixed(2)}, later ${ss1.toFixed(2)} (× main.js dash 1.65)`);
  const dashV = await page.evaluate(() => window.__game.ball.vel.length());
  await page.evaluate(() => { const c = window.__xrDevice.controllers; c.right.updateButtonValue('trigger', 0); c.left.updateAxes('thumbstick', 0, 0); });
  check('trigger dashes', dashV > 2.6, `speed ${dashV.toFixed(2)} m/s (comfort walk max ≈ 2.0)`);

  // roll onto something small: the HUD card shows it and the 3D model turns next to the panel
  const picked = await page.evaluate(() => {
    const g = window.__game, b = g.ball;
    let best = null, bd = Infinity;
    for (const o of g.town.objs.objs) {
      if (o.picked || o.size > b.r * 1.2 || o.size < b.r * 0.3 || o.pos.y > b.r) continue;
      const d = o.center.distanceTo(b.pos);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return null;
    g.teleport(best.center.x - b.heading.x * b.r * 1.5, best.center.z - b.heading.z * b.r * 1.5);
    return best.name;
  });
  if (picked) {
    await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, -0.6));
    await page.waitForFunction(() => window.__game.stats.count > 0, null, { timeout: 120000, polling: 200 }).catch(() => {});
    await page.evaluate(() => window.__xrDevice.controllers.left.updateAxes('thumbstick', 0, 0));
    await waitFrames(12);
  }
  const card = await page.evaluate(() => {
    const rig = window.__game.camera.parent, m = rig.getObjectByName('vr-item');
    return { count: window.__game.stats.count, visible: m.visible, geom: m.geometry.attributes.position ? m.geometry.attributes.position.count : 0, hudItem: rig.getObjectByName('vr-hud').userData.hud.item };
  });
  check('rolled-up item shows on the HUD card with its 3D model', card.count > 0 && card.visible && card.geom > 0 && !!card.hudItem, `${picked} → ${JSON.stringify(card)}`);
  // look down at the HUD (head pitched 36° down)
  await page.evaluate(() => { const a = -36 * Math.PI / 360; window.__xrDevice.quaternion.set(Math.sin(a), 0, 0, Math.cos(a)); });
  await waitFrames(4);
  await shot('hud_look');
  const hudPng2 = await page.evaluate(() => window.__game.camera.parent.getObjectByName('vr-hud').userData.canvas.toDataURL('image/png'));
  fs.writeFileSync(path.join(outDir, 'vr_hud_item.png'), Buffer.from(hudPng2.split(',')[1], 'base64'));
  // the headset pose moves the camera inside the rig: look straight again and stand up a bit
  await page.evaluate(() => { window.__xrDevice.quaternion.set(0, 0, 0, 1); window.__xrDevice.position.y += 0.2; });
  await waitFrames(4);
  await shot('play');

  // leave VR with the HUD's 🥽 button: the screen camera comes back
  await page.evaluate(() => document.getElementById('btn-vr').click());
  await page.waitForFunction(() => !window.__game.renderer.xr.isPresenting, null, { timeout: 30000 });
  await waitFrames(20);
  const after = await page.evaluate(() => {
    const g = window.__game, rig = g.camera.parent, cam = g.camera;
    return {
      rigId: rig.position.length() === 0 && rig.scale.x === 1 && rig.quaternion.w === 1,
      fov: cam.fov, shadows: g.renderer.shadowMap.enabled, hud: rig.getObjectByName('vr-hud-root').visible,
      camToBall: cam.position.distanceTo(g.ball.pos), camWant: 1.5 + g.ball.r * 7, state: g.state,
      canvas: [g.renderer.domElement.width, g.renderer.domElement.height, g.renderer.domElement.parentElement.id],
    };
  });
  console.log('  after exit', JSON.stringify(after));
  check('exit restores the screen view', after.rigId && after.fov === before.fov && after.shadows === before.shadows && !after.hud && after.camToBall < after.camWant && after.canvas[2] === 'app',
    JSON.stringify(after));
  await shot('exit');

  // and back in from the HUD button (a real click), then out again
  await click('#btn-vr');
  await page.waitForFunction(() => window.__game.renderer.xr.isPresenting, null, { timeout: 30000 });
  await waitFrames(10);
  check('re-enter from the HUD 🥽 button', await page.evaluate(() => window.__game.camera.parent.scale.x > 0.2));
  await page.evaluate(() => window.__xrDevice.activeSession.end());
  await page.waitForFunction(() => !window.__game.renderer.xr.isPresenting, null, { timeout: 30000 });
  await waitFrames(5);
  check('no console errors', errors.length === 0, errors.slice(0, 5).join('\n'));
} catch (e) {
  check('test ran to the end', false, e.stack || String(e));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || process.env.LOGS) console.log(logs.filter((l) => !benign(l)).slice(-40).join('\n'));
await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
