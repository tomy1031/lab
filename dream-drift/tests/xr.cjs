// tests/xr.cjs — the VR mode end to end with Meta's WebXR emulator (IWER, Quest 3 profile):
//   menus → VR card → race starts in an XR session → right trigger accelerates → gripping both controllers
//   and tilting them steers (the wheel sits in your hands and turns with them) → left trigger brakes →
//   left stick press pauses → the laser presses "つづける" on the VR panel →
//   the race finishes → results panel in VR → もう一度 loads the next race inside the headset → hand tracking
//   drives (hands seen = accelerate) → taking the headset off while a race loads returns to the title.
//   npm install && node tests/xr.cjs [outDir]
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');

const IWER = process.env.IWER_PATH || require.resolve('iwer/build/iwer.min.js', { paths: [process.cwd(), __dirname] });
const out = process.argv[2] || path.join(os.tmpdir(), 'dream-drift-xr');
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log('[xr]', ...a);
const fail = [];
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript({ path: IWER });
  await page.addInitScript(() => {
    const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
    d.installRuntime({ forceInstall: true });
    d.position.set(0, 1.2, 0);
    window.__xrd = d;
    const xr = navigator.xr, rs = xr.requestSession.bind(xr);
    window.__xrFrames = 0;
    // like the Quest browser: while an immersive session runs, the page's own animation frames stop (only the
    // headset's frames run). The game's requests wait until the session ends; the emulator's and three.js's
    // frame loops are left alone
    const pageRaf = window.requestAnimationFrame.bind(window), held = [];
    window.requestAnimationFrame = (cb) => {
      if (window.__xrSession && /\/js\/[\w/.-]+\.js/.test(new Error().stack || '')) { held.push(cb); window.__heldFrames = (window.__heldFrames || 0) + 1; return 0; }
      return pageRaf(cb);
    };
    xr.requestSession = async (...a) => {
      const s = await rs(...a);
      window.__xrSession = s;
      const tick = () => { if (window.__xrSession !== s) return; window.__xrFrames++; s.requestAnimationFrame(tick); };
      s.requestAnimationFrame(tick);
      s.addEventListener('end', () => { window.__xrSession = null; held.splice(0).forEach((cb) => pageRaf(cb)); });
      return s;
    };
  });
  await page.goto(`${base}?nosound&cpu=3`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('vr-status').classList.contains('ok'), null, { timeout: 15000 }).catch(() => {});
  check(await page.evaluate(() => window.DD.debug.xr.supported), 'VR is offered (emulated Quest 3)');

  // menus → VR → free race on course 1, one lap
  await page.click('[data-act="start"]');
  await page.click('[data-act="ctl-vr"]');
  await page.click('[data-group="mode"] [data-val="free"]');
  await page.click('[data-group="laps"] [data-val="1"]');
  await page.click('[data-act="setup-ok"]');
  await page.click('[data-act="char-ok"]');
  await page.click('[data-course="0"]', { noWaitAfter: true, timeout: 120000 });
  await page.waitForFunction(() => !!window.__xrSession, null, { timeout: 20000 }).catch(() => {});
  check(await page.evaluate(() => !!window.__xrSession), 'clicking a course starts the XR session');
  await page.waitForFunction(() => window.DD.debug.state().screen === 'race' && window.__xrFrames > 5, null, { timeout: 120000 });
  const seat = await page.evaluate(() => { const c = window.DD.debug.cockpit; return { view: c.view, seat: c.kart && c.kart.vrSeat, cam: window.DD.debug.renderer.r.xr.isPresenting }; });
  check(seat.cam && seat.view === 'first' && seat.seat, `seated in the kart, 1st person (${JSON.stringify(seat)})`);
  await page.screenshot({ path: path.join(out, 'vr-intro.png'), timeout: 120000 });

  // race: right trigger
  await page.evaluate(() => window.DD.debug.skipIntro());
  await page.waitForFunction(() => window.DD.debug.state().phase === 'race', null, { timeout: 120000 });
  const d0 = await page.evaluate(() => window.DD.debug.state().me.raceDist);
  await page.evaluate(() => window.__xrd.controllers.right.updateButtonValue('trigger', 1));
  await page.waitForFunction(() => window.DD.debug.state().raceTime > 1.5, null, { timeout: 180000 });
  const s1 = await page.evaluate(() => window.DD.debug.state().me);
  check(s1.raceDist - d0 > 1 && s1.speed > 5, `right trigger accelerates (speed ${s1.speed.toFixed(1)}, moved ${(s1.raceDist - d0).toFixed(1)})`);

  // steering wheel: grip both, right hand lower → turn right. The wheel you see sits in your hands: centred
  // between the controllers, its rim through both, turned exactly as far as they are; let go and it stays put
  const steer = await page.evaluate(async () => {
    const d = window.__xrd, L = d.controllers.left, R = d.controllers.right;
    const c = window.DD.debug.cockpit, vi = window.DD.debug.vrInput, V = c.rig.position.constructor;
    const fit = () => {
      const wc = c.wheel.getWorldPosition(new V());
      const lp = vi.gripOf('left').getWorldPosition(new V()), rp = vi.gripOf('right').getWorldPosition(new V());
      return {
        centre: +wc.distanceTo(lp.clone().add(rp).multiplyScalar(0.5)).toFixed(3),
        rim: +Math.max(Math.abs(lp.distanceTo(wc) - c.wheelR), Math.abs(rp.distanceTo(wc) - c.wheelR)).toFixed(3),
        turn: +(c.wheel.userData.spin.rotation.z + vi.wheel.angle).toFixed(3), // spin = −hand angle
      };
    };
    L.updateButtonValue('squeeze', 1); R.updateButtonValue('squeeze', 1);
    L.position.set(-0.2, 1.1, -0.35); R.position.set(0.2, 0.9, -0.35);
    await new Promise((r) => setTimeout(r, 2500));
    const right = vi.out.steer, engaged = vi.wheel.engaged, fitR = fit();
    L.position.set(-0.24, 0.85, -0.42); R.position.set(0.24, 1.05, -0.4);
    await new Promise((r) => setTimeout(r, 2500));
    const left = vi.out.steer, fitL = fit();
    L.position.set(-0.2, 1.0, -0.35); R.position.set(0.2, 1.0, -0.35);
    await new Promise((r) => setTimeout(r, 1500));
    const held = c.wheel.position.clone(); // in the seat frame (the seat itself moves with the kart)
    L.updateButtonValue('squeeze', 0); R.updateButtonValue('squeeze', 0);
    L.position.set(-0.3, 0.6, -0.1); R.position.set(0.3, 0.6, -0.1); // hands down in your lap
    await new Promise((r) => setTimeout(r, 1500));
    const stays = +c.wheel.position.distanceTo(held).toFixed(3);
    return { right, left, engaged, fitR, fitL, stays };
  });
  check(steer.engaged && steer.right > 0.3 && steer.left < -0.3, `gripped wheel steers (right ${steer.right.toFixed(2)}, left ${steer.left.toFixed(2)})`);
  const fits = [steer.fitR, steer.fitL];
  check(fits.every((f) => f.centre < 0.02 && f.rim < 0.02 && Math.abs(f.turn) < 0.02),
    `the wheel sits in your hands and turns with them (${JSON.stringify(fits)})`);
  check(steer.stays < 0.005, `let go: the wheel stays where you held it (moved ${steer.stays} m)`);
  await page.screenshot({ path: path.join(out, 'vr-race.png'), timeout: 120000 });

  // left trigger brakes (right released)
  const brake = await page.evaluate(async () => {
    const d = window.__xrd, s0 = window.DD.debug.state().me.speed;
    d.controllers.right.updateButtonValue('trigger', 0); d.controllers.left.updateButtonValue('trigger', 1);
    const t0 = window.DD.debug.state().raceTime;
    while (window.DD.debug.state().raceTime < t0 + 0.6) await new Promise((r) => setTimeout(r, 200));
    const out = { s0, s1: window.DD.debug.state().me.speed, brake: window.DD.debug.vrInput.out.brake, thr: window.DD.debug.vrInput.out.throttle };
    d.controllers.left.updateButtonValue('trigger', 0);
    return out;
  });
  check(brake.brake === 1 && brake.thr === 0 && brake.s1 < brake.s0 - 3, `left trigger brakes (speed ${brake.s0.toFixed(1)} → ${brake.s1.toFixed(1)})`);

  // pause with the left stick, resume with the laser on the panel
  await page.evaluate(() => { window.__xrd.controllers.left.updateButtonValue('thumbstick', 1); });
  await page.waitForFunction(() => window.DD.debug.cockpit.menuOpen, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.__xrd.controllers.left.updateButtonValue('thumbstick', 0));
  check(await page.evaluate(() => window.DD.debug.cockpit.menuOpen), 'left stick press pauses (VR menu open)');
  await page.screenshot({ path: path.join(out, 'vr-pause.png'), timeout: 120000 });
  const aimed = await page.evaluate(async () => {
    const THREE_ = window.DD.debug.cockpit.rig.position.constructor;
    const c = window.DD.debug.cockpit, panel = c.menu, b = panel.buttons.find((x) => x.id === 'resume');
    // the button centre in world space, then in the controllers' (calibrated space) coordinates
    const u = (b.x + b.w / 2) / panel.cv.width, v = 1 - (b.y + b.h / 2) / panel.cv.height;
    const p = new THREE_((u - 0.5) * panel.w, (v - 0.5) * panel.h, 0);
    panel.mesh.localToWorld(p);
    const d = window.__xrd, R = d.controllers.right;
    R.updateButtonValue('squeeze', 0); d.controllers.left.updateButtonValue('squeeze', 0);
    R.position.set(0.15, 1.0, -0.25);
    await new Promise((r) => setTimeout(r, 2000));
    // where the right controller is now, in world space (both points into the controllers' space)
    const ctrl = window.DD.debug.vrInput.ctrl.find((o) => o.userData.source && o.userData.source.handedness === 'right');
    const from = ctrl.getWorldPosition(new THREE_());
    c.space.worldToLocal(p); c.space.worldToLocal(from);
    const dir = p.clone().sub(from).normalize();
    // quaternion turning -z onto dir
    const ax = new THREE_(0, 0, -1).cross(dir); const w = 1 + new THREE_(0, 0, -1).dot(dir);
    const q = [ax.x, ax.y, ax.z, w]; const n = Math.hypot(...q);
    R.quaternion.set(q[0] / n, q[1] / n, q[2] / n, q[3] / n);
    await new Promise((r) => setTimeout(r, 2500));
    const hover = panel.hover;
    R.updateButtonValue('trigger', 0);
    await new Promise((r) => setTimeout(r, 1500));
    R.updateButtonValue('trigger', 1);
    await new Promise((r) => setTimeout(r, 1500));
    R.updateButtonValue('trigger', 0);
    await new Promise((r) => setTimeout(r, 1500));
    return { hover, open: c.menuOpen, paused: window.DD.debug.state().screen };
  });
  check(aimed.hover === 'resume' && !aimed.open, `laser + trigger presses つづける (hover ${aimed.hover}, menu open ${aimed.open})`);

  // finish the race → results panel in VR
  await page.evaluate(() => window.DD.debug.simulate(200));
  await page.waitForFunction(() => window.DD.debug.cockpit.menuOpen && window.DD.debug.state().screen === 's-results', null, { timeout: 180000 }).catch(() => {});
  const res = await page.evaluate(() => { const sp = window.DD.debug.cockpit.menu.spec; return sp ? { title: sp.title, rows: sp.rows.length, buttons: sp.buttons.map((b) => b.id) } : null; });
  check(res && res.rows === 4 && res.buttons.includes('again'), `results panel in VR ${JSON.stringify(res)}`);
  await page.screenshot({ path: path.join(out, 'vr-results.png'), timeout: 120000 });

  // もう一度 on the results panel loads the next race inside the headset (it used to wait for page frames,
  // which a Quest pauses during VR, so it only loaded once you took the headset off)
  await page.evaluate(() => { window.DD.debug.cockpit.onPick('again'); });
  await page.waitForFunction(() => window.DD.debug.state().screen === 'race', null, { timeout: 120000 }).catch(() => {});
  const again = await page.evaluate(() => ({ screen: window.DD.debug.state().screen, vr: !!window.__xrSession, held: window.__heldFrames || 0 }));
  check(again.screen === 'race' && again.vr, `もう一度 starts the next race while still in VR (${JSON.stringify(again)})`);

  // hand tracking: again, with hands instead of controllers
  await page.evaluate(() => { window.__xrd.primaryInputMode = 'hand'; window.DD.debug.skipIntro(); });
  await page.waitForFunction(() => window.DD.debug.state().phase === 'race', null, { timeout: 120000 });
  const h0 = await page.evaluate(() => window.DD.debug.state().me.raceDist);
  await page.waitForFunction(() => window.DD.debug.state().raceTime > 1.5, null, { timeout: 180000 });
  const hs = await page.evaluate(() => ({ mode: window.DD.debug.vrInput.mode, thr: window.DD.debug.vrInput.out.throttle, me: window.DD.debug.state().me }));
  check(hs.mode === 'hands' && hs.thr === 1 && hs.me.raceDist - h0 > 1, `hand tracking drives (mode ${hs.mode}, throttle ${hs.thr}, moved ${(hs.me.raceDist - h0).toFixed(1)})`);

  // quit ends the session
  await page.evaluate(() => window.DD.debug.act('quit'));
  await page.waitForFunction(() => !window.__xrSession, null, { timeout: 30000 }).catch(() => {});
  check(await page.evaluate(() => !window.__xrSession && !window.DD.debug.xr.presenting), 'おわる ends the VR session');

  // taking the headset off while the next race is loading goes back to the title (the race used to start
  // anyway, in the flat page, with nothing to drive it)
  await page.waitForFunction(() => window.DD.debug.state().screen === 's-title', null, { timeout: 120000 });
  await page.click('[data-act="start"]');
  await page.click('[data-act="ctl-vr"]');
  await page.click('[data-act="setup-ok"]');
  await page.click('[data-act="char-ok"]');
  await page.click('[data-course="1"]', { noWaitAfter: true, timeout: 120000 });
  await page.waitForFunction(() => window.DD.debug.state().screen === 'race' && window.__xrSession && window.__xrFrames > 5, null, { timeout: 180000 });
  await page.evaluate(() => { window.DD.debug.act('again'); window.__xrSession.end(); });
  await page.waitForFunction(() => !window.__xrSession && window.DD.debug.state().screen === 's-title', null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const off = await page.evaluate(() => ({ screen: window.DD.debug.state().screen, vr: !!window.__xrSession }));
  check(off.screen === 's-title' && !off.vr, `headset off while a race loads → back to the title (${JSON.stringify(off)})`);
  const errs = [...errors, ...(await page.evaluate(() => window.DD.errors.slice()))];
  check(errs.length === 0, `no errors ${errs.join(' | ')}`);
  await browser.close();
  srv.close();
  if (fail.length) { console.error(`\n${fail.length} check(s) failed`); process.exit(1); }
  console.log('\nall VR checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
