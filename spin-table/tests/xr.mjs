// tests/xr.mjs — the real WebXR path in Meta's emulator (IWER, Quest 3):
//   A ball machine: the right controller is the paddle; a forehand swing returns the balls onto the far half, and
//     every contact vibrates the controller and shows its speed and spin
//   B serve: the free hand's trigger (press, release) tosses the ball 16 cm or more; the paddle strikes it
//   C the VR menu (B): the game pauses; the laser and the trigger change the mode
//   D the paddle angle with the paddle hand's stick; recentering with a long stick press
//   node tests/xr.mjs
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
import { launch } from './browser.mjs';
const require = createRequire(import.meta.url);
const IWER = require.resolve('iwer/build/iwer.min.js');

const log = (...a) => console.log('[xr]', ...a);
const fail = [];
const check = (c, m) => { log(c ? 'ok  ' : 'FAIL', m); if (!c) fail.push(m); };

async function openInVr(browser, url) {
  const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript({ path: IWER });
  await page.addInitScript(() => {
    const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
    d.installRuntime({ forceInstall: true });
    d.position.set(0, 1.62, 0);
    window.__xrd = d;
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ST && window.ST.ready, null, { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#enter-vr').disabled, null, { timeout: 20000 });
  await page.click('#enter-vr');
  await page.waitForFunction(() => ST.renderer.xr.isPresenting && ST.frames > 10, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, errors };
}
const gameErrors = (page) => page.evaluate(() => [...(ST.errors || []), ...(ST.game.errors || [])]);

/** turn the right controller so the forehand face looks at the net (pitch: close the face, degrees) */
const turnRight = (page, pitch = 0) => page.evaluate((pitch) => {
  const T = ST.THREE, rc = window.__xrd.controllers.right;
  const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -pitch * Math.PI / 180)
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -Math.PI / 2));
  rc.quaternion.set(q.x, q.y, q.z, q.w);
  const f = ST.frames;
  return new Promise((r) => { const w = () => (ST.frames > f + 3 ? r() : setTimeout(w, 10)); w(); });
}, pitch);

/**
 * A virtual player in the page: predicts the ball with the game's own physics and moves the right controller so
 * the paddle's sweet spot travels along a straight swing (direction dir, speed m/s) that reaches the ball at its
 * chosen contact. The emulator runs at a few frames a second, so poses are aimed at the next frame's time.
 * mode 'return': meet the ball after it bounces on your half at z ≥ zc; 'serve': meet the toss as it falls to yc.
 */
const virtualSwing = (page, opts) => page.evaluate((o) => new Promise((resolve) => {
  const g = ST.game, T = ST.THREE, P = ST.physics, rc = window.__xrd.controllers.right;
  const dir = new T.Vector3(o.dir[0], o.dir[1], o.dir[2]).normalize();
  let off = null, lastFrame = -1, lastT = 0, dtF = 0.1, plan = null;
  const t0 = performance.now();
  const sweet = () => { g.myPaddle.updateMatrixWorld(true); return g.myPaddle.localToWorld(new T.Vector3(0, 0.106, 0.0069)); };
  const findContact = (sim) => {
    const b = P.copyBall(sim.ball, P.makeBall());
    let bounced = sim.rally && sim.rally.expect === 'return';
    for (let i = 1; i < 1500; i++) {
      const ev = []; P.step(b, P.H, ev);
      if (ev.some((e) => e.type === 'table' && e.side > 0)) bounced = true;
      if (ev.some((e) => e.type === 'floor')) return null;
      const t = sim.time + i * P.H;
      if (o.mode === 'serve' ? (b.v.y < 0 && b.p.y <= o.yc) : (bounced && b.v.z > 0 && b.p.z >= o.zc)) return { t, p: new T.Vector3(b.p.x, b.p.y, b.p.z) };
    }
    return null;
  };
  const iv = setInterval(() => {
    const sim = g.sim;
    if (ST.frames === lastFrame) return;
    lastFrame = ST.frames;
    if (sim.time > lastT) { dtF = Math.min(0.1, sim.time - lastT); lastT = sim.time; }
    const c = new T.Vector3(rc.position.x, rc.position.y, rc.position.z).applyEuler(ST.rig.rotation).add(ST.rig.position);
    if (!off) { off = sweet().sub(c); return; }
    const incoming = sim.live && (o.mode === 'serve' ? sim.rally && sim.rally.expect === 'strike' : sim.ball.v.z > 0 && sim.ball.p.z > -1.2);
    if (incoming) { const cp = findContact(sim); if (cp) plan = cp; } else if (plan && sim.time > plan.t + 0.3) plan = null;
    let target;
    if (plan) {
      const tNext = sim.time + dtF;
      const lead = Math.max(-0.35 / o.speed, Math.min(0.35 / o.speed, tNext - plan.t));
      target = plan.p.clone().addScaledVector(dir, o.speed * lead);
    } else target = new T.Vector3(o.rest[0], o.rest[1], o.rest[2]);
    const want = target.sub(off).sub(ST.rig.position);
    rc.position.set(want.x, want.y, want.z);
    if (performance.now() - t0 > o.secs * 1000 || (o.until && o.until(sim))) { clearInterval(iv); resolve(); }
  }, 4);
}), opts);

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await launch();

  // A — ball machine
  {
    const { page, errors } = await openInVr(browser, base + '?lite&seed=4&set=mode:machine,machSpeed:slow,machInterval:2.0,machSpin:top,machPlace:fh,hitInfo:true');
    const pre = await page.evaluate(() => ({ rig: ST.rig.position.toArray(), pad: ST.game.myPaddle.visible, valid: ST.game.body.valid }));
    check(pre.pad && pre.valid && pre.rig[2] > 1.5, `VR: you stand behind your end (z ${pre.rig[2].toFixed(2)}), the paddle is on the right controller`);
    // a topspin ball needs a closed face: 15° down, swinging forward and up at 4 m/s
    await turnRight(page, 15);
    await virtualSwing(page, { mode: 'return', zc: 1.55, dir: [0, 0.55, -1], speed: 4, rest: [0.35, 1.0, 1.7], secs: 18 });
    const r = await page.evaluate(() => ({ st: { ...ST.game.sim.stats }, pulses: ST.game.input.pulses || 0, last: ST.game.input.lastPulse, info: ST.game.hud.info.mesh.visible || ST.game.hud.infoT > -1, text: ST.game.lastHitText, hits: ST.game.log.filter((e) => e.type === 'hit' && e.who === 'p').map((e) => e.face) }));
    check(r.st.hits >= 3, `VR machine: the paddle met ${r.st.hits} balls (faces: ${r.hits.join(',')})`);
    check(r.st.in >= 1, `VR machine: returns landed on the far half (${r.st.in} in, ${r.st.faults} not)`);
    check(r.pulses >= r.st.hits && r.last && r.last.side === 'right', `VR machine: every hit vibrates the paddle hand (${r.pulses} pulses)`);
    check(/km\/h/.test(r.text) && /rpm/.test(r.text), `VR machine: the hit read-out (${r.text})`);
    check(!errors.length && !(await gameErrors(page)).length, `VR machine: no errors ${errors.concat(await gameErrors(page)).join(' | ')}`);
    await page.close();
  }

  // B — serve: toss with the left trigger, strike the falling ball
  {
    const { page, errors } = await openInVr(browser, base + '?lite&seed=6&set=mode:serve,tossAssist:true,tossHeight:0.3');
    await page.waitForFunction(() => ST.game.sim.phase === 'serveWait', null, { timeout: 20000 });
    await turnRight(page, 30);
    const held = await page.evaluate(() => { const g = ST.game, b = g.sim.ball.p, h = g.input.hands.left.grip.position; return Math.hypot(b.x - h.x, b.y - h.y - 0.062, b.z - h.z); });
    check(held < 0.02, `serve: the ball rests on the free hand (${(held * 100).toFixed(1)} cm)`);
    await page.evaluate(() => window.__xrd.controllers.left.updateButtonValue('trigger', 1));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__xrd.controllers.left.updateButtonValue('trigger', 0));
    await page.waitForFunction(() => ST.game.sim.live, null, { timeout: 5000 }).catch(() => {});
    await virtualSwing(page, { mode: 'serve', yc: 0.98, dir: [0, -0.35, -1], speed: 3.5, rest: [0, 1.1, 1.75], secs: 6 });
    await page.waitForTimeout(1500);
    const res = await page.evaluate(() => ({ toss: ST.game.sim.lastToss, struck: ST.game.log.some((e) => e.type === 'hit' && e.serve), log: ST.game.log.filter((e) => ['hit', 'point', 'table', 'net'].includes(e.type)).map((e) => e.type + (e.reason ? ':' + e.reason : '') + (e.type === 'table' ? (e.z > 0 ? '+' : '-') : '')) }));
    check(res.toss && res.toss.height >= 0.16, `serve: the toss rises ${res.toss && (res.toss.height * 100).toFixed(0)} cm (16 cm or more)`);
    check(res.struck, `serve: the paddle struck the toss (${res.log.join(' → ')})`);
    check(!errors.length && !(await gameErrors(page)).length, `serve: no errors ${errors.concat(await gameErrors(page)).join(' | ')}`);
    await page.close();
  }

  // C, D — the menu, the paddle angle, recentering
  {
    const { page, errors } = await openInVr(browser, base + '?lite&seed=7&set=mode:match,level:1,gripTilt:30');
    await page.evaluate(() => window.__xrd.controllers.right.updateButtonValue('b-button', 1));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__xrd.controllers.right.updateButtonValue('b-button', 0));
    await page.waitForTimeout(150);
    const open = await page.evaluate(() => ({ open: ST.game.vrmenu.open, t: ST.game.sim.time }));
    await page.waitForTimeout(400);
    const t2 = await page.evaluate(() => ST.game.sim.time);
    check(open.open && Math.abs(t2 - open.t) < 1e-6, 'menu: B opens it and the game stops');
    // aim the right laser at the "ラリー" button and pull the trigger
    const aimed = await page.evaluate(async () => {
      const g = ST.game, T = ST.THREE, m = g.vrmenu, rc = window.__xrd.controllers.right;
      const btn = m.buttons.find((b) => b.text === 'ラリー');
      const W = 1024, H = 1100;
      const local = new T.Vector3((btn.x + btn.w / 2) / W - 0.5, (0.5 - (btn.y + btn.h / 2) / H) * (H / W), 0);
      m.mesh.updateMatrixWorld(true);
      const target = m.mesh.localToWorld(local);
      rc.position.set(0.2, 1.3, -0.2);
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 120));
        const h = g.input.hands.right;
        const o = h.ray.position, dir = new T.Vector3(0, 0, -1).applyQuaternion(h.ray.quaternion);
        const want = target.clone().sub(o).normalize();
        const fix = new T.Quaternion().setFromUnitVectors(dir, want);
        const cq = new T.Quaternion(rc.quaternion.x, rc.quaternion.y, rc.quaternion.z, rc.quaternion.w);
        const nq = fix.multiply(cq);
        rc.quaternion.set(nq.x, nq.y, nq.z, nq.w);
      }
      await new Promise((r) => setTimeout(r, 150));
      return m.hoverKey;
    });
    await page.evaluate(() => window.__xrd.controllers.right.updateButtonValue('trigger', 1));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__xrd.controllers.right.updateButtonValue('trigger', 0));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ mode: ST.settings.get('mode'), simMode: ST.game.sim.mode, open: ST.game.vrmenu.open }));
    check(aimed && after.mode === 'rally' && after.simMode === 'rally' && !after.open, `menu: the laser + trigger switch to rally practice (hover ${aimed}, mode ${after.mode})`);
    // the paddle angle: push the right stick forward for a moment
    const tilt0 = await page.evaluate(() => ST.settings.get('gripTilt'));
    await page.evaluate(() => window.__xrd.controllers.right.updateAxes('thumbstick', 0, -1));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__xrd.controllers.right.updateAxes('thumbstick', 0, 0));
    const tilt1 = await page.evaluate(() => ST.settings.get('gripTilt'));
    check(tilt1 > tilt0, `paddle angle: the stick raises the tip (${tilt0}° → ${tilt1}°)`);
    // recenter: turn the head 40° and hold the left stick pressed
    await page.evaluate(() => { const d = window.__xrd; const T = ST.THREE; const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.7); d.quaternion.set(q.x, q.y, q.z, q.w); });
    await page.evaluate(() => window.__xrd.controllers.left.updateButtonValue('thumbstick', 1));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__xrd.controllers.left.updateButtonValue('thumbstick', 0));
    const rot = await page.evaluate(() => ST.rig.rotation.y);
    check(Math.abs(rot + 0.7) < 0.08, `recenter: the table turns to where you face (rig ${(rot * 180 / Math.PI).toFixed(0)}°)`);
    check(!errors.length && !(await gameErrors(page)).length, `menu: no errors ${errors.concat(await gameErrors(page)).join(' | ')}`);
    await page.close();
  }

  await browser.close();
  srv.close();
  if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); }
  console.log('\nall ok');
})();
