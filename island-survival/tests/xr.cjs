// tests/xr.cjs — VR (WebXR) end to end with Meta's WebXR emulator (IWER, Quest 3 profile):
//   the HUD offers 🥽 VR → the session starts and the headset drives the frames (the page's own frames stop, as on a
//   Quest) → the camera sits at the player's eyes → left stick walks, the headset origin follows → right stick turns
//   30° → stepping in the room moves the body → the controls guide floats above both controllers and lights the
//   pressed button → 足踏み (head bob) and 腕振り (controllers swung in turn) walk, the arm swing is no chop →
//   pointing at a bush shows its options, the trigger gathers →
//   B opens the VR menu (game paused) → the laser presses tabs and buttons: 作る → put stones on the bench → 割る →
//   作る opens the hand-work table as a panel → the trigger works on it, おまかせ finishes it → the item is made →
//   swinging the controller down gives a swing gesture → 「ガイドを 消す／出す」 in the menu → 設定 → 「VR を 出る」 ends
//   the session and the page loop resumes.
//   IWER_PATH=…/iwer/build/iwer.min.js node tests/xr.cjs [outDir]     (or npm i -D iwer)
const { chromium } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');

const IWER = process.env.IWER_PATH || require.resolve('iwer/build/iwer.min.js', { paths: [process.cwd(), __dirname] });
const out = process.argv[2] || path.join(os.tmpdir(), 'island-xr');
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log('[xr]', ...a);
const fail = [];
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

(async () => {
  const srv = await serve(0, path.resolve(__dirname, '..'));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript({ path: IWER });
  await page.addInitScript(() => {
    const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
    d.installRuntime({ forceInstall: true });
    d.position.set(0, 1.6, 0);
    window.__xrd = d;
    const xr = navigator.xr, rs = xr.requestSession.bind(xr);
    window.__xrFrames = 0;
    // like the Quest browser: while an immersive session runs, the page's own animation frames stop
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
  await page.goto(base + '?quick&nosound&quality=low&starter=knife,firesteel&count=2&companion=none&seed=7');
  await page.waitForFunction(() => window.ISLE?.game?.running, null, { timeout: 120000 });
  await page.waitForFunction(() => window.ISLE.xr && window.ISLE.xr.supported !== undefined && document.getElementById('vr-enter'), null, { timeout: 20000 }).catch(() => {});
  check(await page.evaluate(() => !!(window.ISLE.xr?.supported && document.getElementById('vr-enter'))), 'VR is offered on the HUD (emulated Quest 3)');

  // helpers in the page: frames, controller pose (aim at a world point), buttons
  await page.evaluate(async () => { window.ISLE.THREE = window.ISLE.THREE || await import('three'); });
  await page.evaluate(() => {
    const g = window.ISLE.game, xr = window.ISLE.xr, d = window.__xrd;
    const THREE = window.ISLE.THREE;
    window.X = {
      g, xr, d,
      frames: (n) => new Promise((res) => { const f0 = window.__xrFrames; const w = () => (window.__xrFrames - f0 >= n || !window.__xrSession ? res() : setTimeout(w, 10)); w(); }),
      /** world → the device's local space (inverse of xr.applyOffset) */
      toLocal(p) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -xr.yaw); return new THREE.Vector3(p.x - xr.W.x, p.y - xr.W.y - xr.lift, p.z - xr.W.z).applyQuaternion(q); },
      /** hold the right controller below-right of the head and point it at a world point */
      aim(world) {
        const t = window.X.toLocal(world);
        const from = new THREE.Vector3(d.position.x + 0.15, d.position.y - 0.25, d.position.z - 0.15);
        const m = new THREE.Matrix4().lookAt(from, t, new THREE.Vector3(0, 1, 0)); // −Z towards the target
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        const c = d.controllers.right; c.position.set(from.x, from.y, from.z); c.quaternion.set(q.x, q.y, q.z, q.w);
      },
      /** the world point of a canvas pixel (px, py) on a panel mesh of w × h metres, canvas cw × ch */
      panelPoint(mesh, px, py, cw, ch, w, h) { mesh.updateMatrixWorld(true); return mesh.localToWorld(new THREE.Vector3((px / cw - 0.5) * w, (0.5 - py / ch) * h, 0)); },
      async press(btnId = 'trigger', side = 'right', n = 3) { d.controllers[side].updateButtonValue(btnId, 1); await window.X.frames(n); d.controllers[side].updateButtonValue(btnId, 0); await window.X.frames(n); },
      /** press a VR menu region by its id */
      async menu(id) {
        let r = xr.menu.regions.find((x) => x.id === id);
        if (!r && id.startsWith('row:')) { // scroll the row into view first
          const rid = id.split(':')[1], i = (xr.menu.data.rows || []).findIndex((x) => x.id === rid);
          if (i >= 0) { xr.scroll = Math.max(0, i - 2); xr.refreshMenu(); await window.X.frames(2); r = xr.menu.regions.find((x) => x.id === id); }
        }
        if (!r) return false;
        window.X.aim(window.X.panelPoint(xr.menu.mesh, r.x + r.w / 2, r.y + r.h / 2, xr.menu.cv.width, xr.menu.cv.height, 0.9, 0.62));
        await window.X.frames(3);
        await window.X.press();
        return true;
      },
      menuIds: () => xr.menu.regions.map((r) => r.id),
    };
  });
  // enter VR from the HUD button (a user gesture, as the browser requires)
  await page.click('#vr-enter');
  await page.waitForFunction(() => !!window.__xrSession && window.__xrFrames > 10, null, { timeout: 30000 }).catch(() => {});
  const s0 = await page.evaluate(() => { const g = window.ISLE.game, c = g.renderer.camera; return { vr: g.vrActive, pres: g.renderer.r.xr.isPresenting, held: window.__heldFrames || 0, cam: c.position.toArray(), pos: g.player.pos.toArray() }; });
  check(s0.vr && s0.pres, `the XR session runs (${JSON.stringify({ vr: s0.vr, pres: s0.pres })})`);
  check(s0.held > 0, `the page's own frames are held during the session (${s0.held}), the headset's frames drive the game`);
  check(Math.hypot(s0.cam[0] - s0.pos[0], s0.cam[2] - s0.pos[2]) < 0.3 && Math.abs(s0.cam[1] - s0.pos[1] - 1.6) < 0.25, `the camera is at the player's eyes (cam ${s0.cam.map((v) => v.toFixed(2))}, feet ${s0.pos.map((v) => v.toFixed(2))})`);
  await page.screenshot({ path: path.join(out, 'xr-enter.png') });

  // left stick: walk where you look; the headset origin follows the body
  const w0 = await page.evaluate(async () => {
    const { g, d, xr } = window.X, p0 = g.player.pos.clone(), yaw = xr.yaw;
    d.controllers.left.updateAxes('thumbstick', 0, -1);
    await window.X.frames(60);
    d.controllers.left.updateAxes('thumbstick', 0, 0);
    await window.X.frames(10);
    const p1 = g.player.pos, c = g.renderer.camera.position;
    const fwd = -((p1.x - p0.x) * Math.sin(yaw) + (p1.z - p0.z) * Math.cos(yaw));
    return { moved: Math.hypot(p1.x - p0.x, p1.z - p0.z), fwd, camOff: Math.hypot(c.x - p1.x, c.z - p1.z) };
  });
  check(w0.moved > 1 && w0.fwd > 0.8, `left stick walks forward (${w0.moved.toFixed(2)} m, along the view ${w0.fwd.toFixed(2)} m)`);
  check(w0.camOff < 0.3, `the view goes with the body (head ${w0.camOff.toFixed(2)} m from the feet)`);

  // right stick: snap turn 30°
  const t0 = await page.evaluate(async () => {
    const { g, d } = window.X, y0 = g.player.yaw;
    d.controllers.right.updateAxes('thumbstick', 1, 0); await window.X.frames(4);
    d.controllers.right.updateAxes('thumbstick', 0, 0); await window.X.frames(4);
    let dy = g.player.yaw - y0; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    return dy * 180 / Math.PI;
  });
  check(Math.abs(Math.abs(t0) - 30) < 3, `right stick turns 30° (${t0.toFixed(1)}°)`);

  // room-scale: a real step moves the body
  const r0 = await page.evaluate(async () => {
    const { g, d } = window.X, p0 = g.player.pos.clone();
    d.position.set(d.position.x + 0.6, d.position.y, d.position.z); await window.X.frames(6);
    return Math.hypot(g.player.pos.x - p0.x, g.player.pos.z - p0.z);
  });
  check(Math.abs(r0 - 0.6) < 0.15, `a step in the room moves the body (${r0.toFixed(2)} m)`);

  // the controls guide above the hands (§27.6): on by default, a pressed button lights its row
  const gd0 = await page.evaluate(async () => {
    const { xr, d } = window.X, G = xr.guide.cards;
    d.controllers.right.updateButtonValue('trigger', 1); await window.X.frames(3);
    const lit = G.right.pressed?.includes('trigger');
    d.controllers.right.updateButtonValue('trigger', 0); await window.X.frames(3);
    return { on: xr.guide.on, left: G.left.mesh.visible, right: G.right.mesh.visible, titles: [G.left.title, G.right.title], lit };
  });
  check(gd0.on && gd0.left && gd0.right && gd0.lit, `the controls guide shows above both controllers and lights the pressed button (${JSON.stringify(gd0)})`);
  await page.screenshot({ path: path.join(out, 'xr-guide.png') });

  // 足踏み (§27.5): bobbing the head in rhythm walks forward with the stick at rest
  const st0 = await page.evaluate(async () => {
    const { g, d, xr } = window.X;
    xr.move = 'step'; xr.steps.reset();
    const p0 = g.player.pos.clone(), y0 = d.position.y, yaw = xr.yaw;
    // the head bobs 1.7 times a second (±3 cm), driven by the game's own frame time
    let tt = 0, seen = '';
    const upd = xr.update.bind(xr);
    xr.update = (dt) => { tt += dt; d.position.set(d.position.x, y0 + 0.03 * Math.sin(2 * Math.PI * 1.7 * tt), d.position.z); upd(dt); if (xr.body.by) seen = xr.body.by; };
    while (tt < 4.5) await window.X.frames(1);
    xr.update = upd;
    const p1 = g.player.pos.clone(), walking = xr.body.walking, by = seen;
    d.position.set(d.position.x, y0, d.position.z);
    for (let i = 0; i < 15; i++) await window.X.frames(1); // walking ends within ~1.2 s of the last step
    const pS = g.player.pos.clone();
    for (let i = 0; i < 10; i++) await window.X.frames(1);
    const p2 = g.player.pos.clone();
    const fwd = -((p1.x - p0.x) * Math.sin(yaw) + (p1.z - p0.z) * Math.cos(yaw));
    return { moved: Math.hypot(p1.x - p0.x, p1.z - p0.z), fwd, walking, by, after: Math.hypot(p2.x - pS.x, p2.z - pS.z) };
  });
  check(st0.moved > 1 && st0.fwd > 0.8 && st0.by === '足踏み', `足踏み walks forward (${st0.moved.toFixed(2)} m, by ${st0.by})`);
  check(st0.after < 0.2, `standing still stops the steps (${st0.after.toFixed(2)} m once stopped)`);

  // 腕振り: swinging the two controllers in turn walks, and is not taken for a chop
  const ar0 = await page.evaluate(async () => {
    const { g, d, xr } = window.X;
    xr.move = 'arms'; xr.arms.reset(); xr.room = null;
    const h = d.position;
    const pose = (s) => {
      d.controllers.left.position.set(h.x - 0.25, h.y - 0.6 + 0.1 * s, h.z - 0.15 - 0.15 * s);
      d.controllers.right.position.set(h.x + 0.25, h.y - 0.6 - 0.1 * s, h.z - 0.15 + 0.15 * s);
    };
    pose(0); await window.X.frames(8); // hands down at the sides first
    const it = g.sys.interact, seen = [], orig = it.gestureActions.bind(it);
    it.gestureActions = (ev) => { if (ev.length) seen.push(...ev.map((e) => e.type)); return orig(ev); };
    const p0 = g.player.pos.clone();
    // the arms swing 1.6 times a second in turn, driven by the game's own frame time
    let tt = 0, by = '';
    const upd = xr.update.bind(xr);
    xr.update = (dt) => { tt += dt; pose(Math.sin(2 * Math.PI * 1.6 * tt)); upd(dt); if (xr.body.by) by = xr.body.by; };
    while (tt < 4.5) await window.X.frames(1);
    xr.update = upd;
    const p1 = g.player.pos.clone();
    for (let i = 0; i < 15; i++) await window.X.frames(1);
    const pS = g.player.pos.clone();
    for (let i = 0; i < 10; i++) await window.X.frames(1);
    const p2 = g.player.pos.clone();
    it.gestureActions = orig;
    xr.move = 'stick';
    return { moved: Math.hypot(p1.x - p0.x, p1.z - p0.z), by, after: Math.hypot(p2.x - pS.x, p2.z - pS.z), gestures: seen };
  });
  check(ar0.moved > 1 && ar0.by === '腕振り', `腕振り walks (${ar0.moved.toFixed(2)} m, by ${ar0.by})`);
  check(ar0.after < 0.2, `resting the arms stops walking (${ar0.after.toFixed(2)} m once stopped)`);
  check(!ar0.gestures.some((x) => x === 'swing'), `swinging the arms to walk is not a swing gesture (${ar0.gestures.join(', ') || 'none'})`);

  // point at a bush / plant in reach: its options show; the trigger does the chosen one
  const aimRes = await page.evaluate(async () => {
    const { g, xr } = window.X, P = g.player, it = g.sys.interact;
    const cand = [...g.world.nodes.all.values()].filter((n) => ['bush', 'fern', 'herb', 'grass', 'vine', 'shrub', 'berry', 'flower', 'rock', 'stone'].some((k) => n.kind.includes(k)) && n.alive !== false);
    cand.sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z));
    for (const n of cand.slice(0, 25)) {
      // stand 1.4 m from it, facing it (the head looks along −Z of the turned space)
      const fx = -Math.sin(xr.yaw), fz = -Math.cos(xr.yaw);
      P.place(n.x - fx * 1.4, n.z - fz * 1.4, xr.yaw);
      await window.X.frames(4);
      const y = g.world.terrain.heightAt(n.x, n.z) + 0.35;
      window.X.aim({ x: n.x, y, z: n.z });
      await window.X.frames(6);
      if (it.target && it.target.options?.length) return { kind: n.kind, type: it.target.type, label: it.target.label, opts: it.target.options.map((o) => o.label), prompt: xr.prompt.mesh.visible };
    }
    return null;
  });
  check(!!aimRes, `pointing the controller at a plant / rock targets it (${JSON.stringify(aimRes)})`);
  if (aimRes) {
    const before = await page.evaluate(() => JSON.stringify(window.X.g.sys.player.inv.stacks.map((s) => [s.id, s.n])));
    const act = await page.evaluate(async () => {
      const { g } = window.X, it = g.sys.interact;
      const o = it.target.options.findIndex((x) => x.ok !== false);
      it.optIndex = Math.max(0, o);
      await window.X.press('trigger', 'right', 3);
      let started = !!it.activity;
      // hold the trigger: activities read it as the held button
      window.X.d.controllers.right.updateButtonValue('trigger', 1);
      for (let i = 0; i < 300 && it.activity; i++) await window.X.frames(2);
      window.X.d.controllers.right.updateButtonValue('trigger', 0);
      await window.X.frames(4);
      return { started, still: !!it.activity };
    });
    const after = await page.evaluate(() => JSON.stringify(window.X.g.sys.player.inv.stacks.map((s) => [s.id, s.n])));
    check(act.started || before !== after, `the trigger does the chosen option (activity ${act.started}, inventory ${before === after ? 'same' : 'changed'})`);
    await page.screenshot({ path: path.join(out, 'xr-aim.png') });
  }

  // B: the VR menu (pauses); the laser presses a tab
  const m0 = await page.evaluate(async () => { const { g, xr } = window.X; await window.X.press('b-button'); return { open: xr.menuOpen, paused: g.paused, vis: xr.menu.mesh.visible, ids: window.X.menuIds().slice(0, 12) }; });
  check(m0.open && m0.paused && m0.vis, `B opens the VR menu and pauses (${JSON.stringify(m0)})`);
  await page.screenshot({ path: path.join(out, 'xr-menu.png') });
  const m1 = await page.evaluate(async () => { const ok = await window.X.menu('tab:make'); return { ok, page: window.X.xr.page }; });
  check(m1.ok && m1.page === 'make', `the laser presses the 作る tab (${JSON.stringify(m1)})`);

  // the bench: give two stones, put them on, 割る, 作る → the hand-work table appears as a panel
  const c0 = await page.evaluate(async () => {
    const { g, xr } = window.X, inv = g.sys.player.inv;
    inv.add?.('stone', 3, { q: 50 }) ?? inv.addStack({ id: 'stone', n: 3, q: 50 });
    xr.refreshMenu(); await window.X.frames(3);
    const st = inv.stacks.find((s) => s.id === 'stone');
    const ok1 = await window.X.menu(`row:s${st.uid}:add`);
    const ok2 = await window.X.menu(`row:s${st.uid}:add`);
    const ok3 = await window.X.menu('row:m2:knap');
    await window.X.frames(3);
    const cands = (xr.cands || []).map((c) => ({ name: c.name, ready: c.ready, kind: c.kind }));
    return { ok1, ok2, ok3, bench: xr.bench.length, method: xr.method, cands, ids: window.X.menuIds().filter((i) => i.includes(':make')) };
  });
  check(c0.ok1 && c0.bench === 2 && c0.method === 'knap' && c0.cands.some((c) => c.ready), `stones on the bench, 割る shows what they can become (${JSON.stringify(c0)})`);
  const hw0 = await page.evaluate(async () => {
    const { g, xr } = window.X;
    const i = (xr.cands || []).findIndex((c) => c.ready);
    const p = window.X.menu(`row:c${i}:make`); // resolves after the press; the table opens meanwhile
    for (let k = 0; k < 60 && !g.handwork.active; k++) await window.X.frames(2);
    await window.X.frames(6);
    return { active: !!g.handwork.active, panel: xr.hwPlane.visible, menu: xr.menuOpen, freeze: g.freezeRender, pres: g.renderer.r.xr.isPresenting };
  });
  check(hw0.active && hw0.panel && !hw0.menu, `作る opens the hand-work table as a VR panel (${JSON.stringify(hw0)})`);
  await page.screenshot({ path: path.join(out, 'xr-handwork.png') });
  // the trigger on the table presses there (the laser is the pointer)
  const hw1 = await page.evaluate(async () => {
    const { g, xr } = window.X;
    window.X.aim(window.X.panelPoint(xr.hwPlane, 400, 300, 800, 500, 1.0, 0.625));
    await window.X.frames(4);
    window.X.d.controllers.right.updateButtonValue('trigger', 1); await window.X.frames(3);
    const I = g.handwork.active?.I; const r = { down: !!I?.down, x: I?.x, y: I?.y, vr: !!I?.vr };
    window.X.d.controllers.right.updateButtonValue('trigger', 0); await window.X.frames(3);
    return r;
  });
  check(hw1.down && hw1.vr && Math.abs(hw1.x - 400) < 40 && Math.abs(hw1.y - 300) < 40, `the trigger works on the table at the laser point (${JSON.stringify(hw1)})`);
  // おまかせ on the header finishes it; the item is made
  const hw2 = await page.evaluate(async () => {
    const { g, xr } = window.X;
    const b = xr.hwBtns.find((x) => x.id === 'auto');
    const n0 = g.sys.player.inv.stacks.reduce((a, s) => a + s.n, 0);
    window.X.aim(window.X.panelPoint(xr.hwHeadMesh, b.x + b.w / 2, b.y + b.h / 2, 1000, 150, 1.0, 0.15));
    await window.X.frames(4);
    await window.X.press();
    for (let k = 0; k < 200 && g.handwork.active; k++) await window.X.frames(2);
    await window.X.frames(10);
    const stones = g.sys.player.inv.stacks.find((s) => s.id === 'stone')?.n ?? 0;
    return { active: !!g.handwork.active, panel: xr.hwPlane.visible, stones, n0, n1: g.sys.player.inv.stacks.reduce((a, s) => a + s.n, 0), paused: g.paused };
  });
  check(!hw2.active && !hw2.panel && hw2.stones < 3, `おまかせ finishes the work and the stones were used (${JSON.stringify(hw2)})`);
  check(!hw2.paused, 'the game runs again after the work');

  // a real swing: the controller moving down fast is a swing gesture
  const sw = await page.evaluate(async () => {
    const { g, d, xr } = window.X;
    const c = d.controllers.right; const seen = [];
    const it = g.sys.interact; const orig = it.gestureActions.bind(it);
    it.gestureActions = (ev) => { if (ev.length) seen.push(...ev.map((e) => `${e.type}:${e.dir || ''}`)); return orig(ev); };
    // raise the arm slowly (0.4 m/s: no gesture), rest, then bring it down at 4 m/s — in the game's own frame time
    const y0 = c.position.y, top = d.position.y + 0.3;
    let tt = 0, y = y0;
    const upd = xr.update.bind(xr);
    xr.update = (dt) => { tt += dt; y = tt < 2 ? Math.min(top, y + 0.4 * dt) : tt < 2.6 ? top : Math.max(top - 0.9, y - 4 * dt); c.position.set(d.position.x + 0.2, y, d.position.z - 0.3); upd(dt); };
    while (tt < 3.6) await window.X.frames(1);
    xr.update = upd;
    it.gestureActions = orig;
    return seen;
  });
  check(sw.includes('swing:down'), `swinging the controller down is a swing gesture (${sw.join(', ')})`);

  // settings → 「VR を 出る」 ends the session; the page's own loop resumes
  // the menu's 「ガイドを 消す」 hides the cards (and keeps it); pressing again brings them back
  const gd1 = await page.evaluate(async () => {
    const { xr } = window.X, G = xr.guide.cards;
    await window.X.press('b-button');
    await window.X.menu('guide'); await window.X.frames(3);
    const off = { on: xr.guide.on, vis: G.left.mesh.visible || G.right.mesh.visible, saved: JSON.parse(localStorage.getItem('isle.settings') || '{}').vrGuide };
    await window.X.menu('guide'); await window.X.frames(3);
    const menuTitle = G.right.title;
    return { off, on: xr.guide.on, vis: G.right.mesh.visible, menuTitle };
  });
  check(!gd1.off.on && !gd1.off.vis && gd1.off.saved === false && gd1.on && gd1.vis && /メニュー/.test(gd1.menuTitle), `「ガイドを 消す／出す」 in the VR menu hides and shows the guide (${JSON.stringify(gd1)})`);

  const ex = await page.evaluate(async () => {
    const { g, xr } = window.X;
    if (!xr.menuOpen) await window.X.press('b-button');
    await window.X.menu('tab:settings');
    const hasExit = window.X.menuIds().includes('exit');
    await window.X.menu('exit');
    for (let k = 0; k < 50 && window.__xrSession; k++) await new Promise((r) => setTimeout(r, 50));
    const f0 = g.fps, t0 = g.last;
    await new Promise((r) => setTimeout(r, 600));
    return { hasExit, session: !!window.__xrSession, vr: g.vrActive, pres: g.renderer.r.xr.isPresenting, loop: g.last !== t0, screen: g.screens.current };
  });
  check(ex.hasExit && !ex.session && !ex.vr && !ex.pres, `「VR を 出る」 ends the session (${JSON.stringify(ex)})`);
  check(ex.loop, 'the page loop runs again after VR');
  await page.screenshot({ path: path.join(out, 'xr-exit.png') });

  const errs = errors.filter((e) => !/favicon|Failed to load resource|WebGL|GPU stall|swiftshader/i.test(e));
  check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''}`);
  await browser.close();
  srv.close();
  log(fail.length ? `${fail.length} FAILED` : 'all passed', '→', out);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
