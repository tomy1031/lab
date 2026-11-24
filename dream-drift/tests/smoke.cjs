// tests/smoke.cjs — end-to-end checks in headless Chromium (SwiftShader):
//   1. title → menus → Grand Prix race with the keyboard; the kart drives; pause / resume
//   2. every course (both cups): a full 8-kart race fast-forwarded to the finish (all finish, no respawns, no
//      errors); on Battambang the train crosses the road, the barriers close and the CPUs wait;
//      on course 1 also the camera probe (nothing on the lens — see DD.debug.probe)
//   3. results screen; smooth motion (no judder against 60 / 144 Hz displays)
//   4. phone touch controls   5. drift (starts only with a hop, eases in, moderate curve) and kart-to-kart knocks
//   6. the handling tuning panel (test drive, live sliders, kept, copy / paste)
//   node tests/smoke.cjs [outDir]
const { chromium, devices } = require('playwright');
const serve = require('./serve.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');

const out = process.argv[2] || path.join(os.tmpdir(), 'dream-drift-smoke');
fs.mkdirSync(out, { recursive: true });
const fail = [];
const log = (...a) => console.log('[smoke]', ...a);
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

async function open(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 90000 });
  return { page, errors };
}
const ddErrors = (page) => page.evaluate(() => window.DD.errors.slice());
const screen = (page) => page.evaluate(() => window.DD.debug.state().screen);
const waitScreen = (page, id) => page.waitForFunction((s) => window.DD.debug.state().screen === s, id, { timeout: 60000 });

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // 1. menus and a real race with the keyboard
  {
    const { page, errors } = await open(browser, `${base}?nosound&quality=low`);
    await page.setViewportSize({ width: 800, height: 450 });
    check((await screen(page)) === 's-title', 'title screen is up');
    await page.keyboard.press('Enter');
    await waitScreen(page, 's-control');
    check(true, 'Enter → control choice');
    await page.keyboard.press('Enter'); // controller / keyboard card has focus
    await waitScreen(page, 's-setup');
    check(true, 'controller chosen → race setup');
    await page.click('[data-group="mode"] [data-val="gp"]');
    await page.click('[data-act="setup-ok"]');
    await waitScreen(page, 's-char');
    // the roster: moving the cursor picks (like a fighting game), and the turntable shows that racer
    const pick0 = await page.evaluate(() => document.querySelector('.ch.on')?.dataset.char);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);
    const pick = await page.evaluate(() => {
      const p = window.DD.debug.charPreview, on = document.querySelector('.ch.on')?.dataset.char;
      return { on, running: p.running, shown: p.cur && p.cur.root.name, w: p.canvas.width };
    });
    check(pick.on && pick.on !== pick0 && pick.shown === 'kart-' + pick.on && pick.running && pick.w > 0, `→ on the roster picks the next racer and the turntable shows it (${pick0} → ${JSON.stringify(pick)})`);
    await page.click('[data-char="momo"]');
    await page.click('[data-act="char-ok"]');
    await waitScreen(page, 'race');
    check(true, 'Grand Prix race 1 started');
    check(!(await page.evaluate(() => window.DD.debug.charPreview.running)), 'the turntable stops when the race starts');
    // (the course may still be loading: keep skipping the intro until the race is on)
    await page.waitForFunction(() => { window.DD.debug.skipIntro(); return window.DD.debug.state().phase === 'race'; }, null, { timeout: 120000, polling: 500 });
    const d0 = await page.evaluate(() => window.DD.debug.state().me.raceDist);
    await page.keyboard.down('ArrowUp');
    // software rendering is slow: wait for 2 s of game time rather than wall time
    await page.waitForFunction(() => window.DD.debug.state().raceTime > 2, null, { timeout: 180000 });
    const s1 = await page.evaluate(() => window.DD.debug.state());
    await page.keyboard.up('ArrowUp');
    check(s1.me.raceDist - d0 > 3, `kart drives forward with ↑ (moved ${(s1.me.raceDist - d0).toFixed(1)} samples, speed ${s1.me.speed.toFixed(1)})`);
    // HUD layout: no two parts overlap, the middle of the screen is clear, the item sits top left
    const lay = await page.evaluate(() => {
      const ids = ['h-item', 'h-rank', 'h-lapbox', 'h-pos', 'h-map', 'h-pause'], W = innerWidth, H = innerHeight;
      const R = Object.fromEntries(ids.map((id) => [id, document.getElementById(id).getBoundingClientRect()]));
      R.time = document.querySelector('.h-time').getBoundingClientRect();
      const keys = Object.keys(R), over = [];
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = R[keys[i]], b = R[keys[j]];
        if (a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) over.push(keys[i] + '/' + keys[j]);
      }
      const mid = keys.filter((k) => { const r = R[k]; return r.width && r.left < W * 0.62 && r.right > W * 0.38 && r.top < H * 0.75 && r.bottom > H * 0.25; });
      const it = R['h-item'];
      return { over, mid, item: [Math.round(it.right / W * 100), Math.round(it.bottom / H * 100)] };
    });
    check(!lay.over.length && !lay.mid.length && lay.item[0] < 20 && lay.item[1] < 30, `HUD: nothing overlaps, the centre is clear, the item is top left (${JSON.stringify(lay)})`);
    // the drivers' faces are alive: someone blinks or changes expression within a couple of seconds
    const faces = await page.evaluate(async () => {
      const seen = new Set(), r = window.DD.debug.race;
      for (let i = 0; i < 80; i++) { for (const k of r.karts) seen.add(k.rig.anim.expr); await new Promise((res) => setTimeout(res, 100)); }
      return [...seen];
    });
    check(faces.length > 1, `drivers blink and change expression (${faces.join(',')})`);
    await page.screenshot({ path: path.join(out, 'race-keyboard.png') });
    await page.keyboard.press('Escape');
    await waitScreen(page, 's-pause');
    check(true, 'Esc → pause');
    await page.keyboard.press('Enter');
    await waitScreen(page, 'race');
    check(true, 'Enter → resume');
    const errs = [...errors, ...(await ddErrors(page))];
    check(errs.length === 0, `no errors in the menu + race flow ${errs.join(' | ')}`);
    log('perf', JSON.stringify(await page.evaluate(() => { const s = window.DD.debug.state(); return { fps: s.fps, drawCalls: s.drawCalls, triangles: s.triangles }; })));
    await page.close();
  }

  // 2. every course: full race, fast-forwarded
  for (let c = 1; c <= 8; c++) {
    const { page, errors } = await open(browser, `${base}?course=${c}&autoplay&nosound&quality=low&seed=${c * 7}`);
    await page.waitForFunction(() => window.DD.debug.state().screen === 'race', null, { timeout: 90000 });
    if (c === 1) {
      // nothing may sit on the lens: no kart inside the chase camera, the camera never outside the walls
      const pr = await page.evaluate(() => window.DD.debug.probe(60));
      check(pr.kartNear.length === 0 && pr.outside.length === 0, `course 1: camera stays clear for 60 s (kart at lens ${pr.kartNear.length}, outside walls ${pr.outside.length})`);
    }
    if (c === 8) {
      // Battambang: the train crosses the road; the barriers close, CPUs wait at them and none is run over
      const t = await page.evaluate(() => {
        const r = window.DD.debug.race, rail = r.hazards.find((h) => h.solid), ctl = new Map();
        r.skipIntro();
        let closed = 0, waited = 0, hit = 0;
        const emit0 = r.emit.bind(r); r.emit = (ty, d) => { if (ty === 'trap' && d.kind === 'train') hit++; return emit0(ty, d); };
        for (let i = 0; i < 60 * 70; i++) { r.step(1 / 60, ctl); if (rail.crossings.some((c) => c.closed)) closed++; if (r.karts.some((k) => k.waiting)) waited++; }
        r.emit = emit0;
        return { crossings: rail.crossings.length, closed: closed / 60, waited: waited / 60, hit };
      });
      check(t.crossings === 2 && t.closed > 5 && t.waited > 2 && t.hit === 0, `course 8: the train crosses — barriers closed ${t.closed.toFixed(1)} s, karts waited ${t.waited.toFixed(1)} s, run over ${t.hit}`);
    }
    const s = await page.evaluate(() => window.DD.debug.simulate(420));
    const resp = s.karts.reduce((a, k) => a + k.respawns, 0);
    const times = s.karts.map((k) => k.time).sort((a, b) => a - b);
    check(s.phase === 'done' && s.karts.every((k) => k.finished), `course ${c}: all ${s.karts.length} karts finish (${times[0].toFixed(1)}–${times[times.length - 1].toFixed(1)} s)`);
    check(resp === 0, `course ${c}: no respawns (${resp})`);
    log(`course ${c}: me ${s.me.place}位, drawCalls ${s.drawCalls}, triangles ${s.triangles}`);
    if (c === 8) {
      await page.evaluate(() => window.DD.debug.showResults());
      await waitScreen(page, 's-results');
      const rows = await page.$$eval('#res-table .rrow', (r) => r.length);
      check(rows === 8, `results table lists 8 karts (${rows})`);
      await page.screenshot({ path: path.join(out, 'results.png') });
    }
    const errs = [...errors, ...(await ddErrors(page))];
    check(errs.length === 0, `course ${c}: no errors ${errs.join(' | ')}`);
    await page.close();
  }

  // 3. smooth motion: your kart driving straight moves evenly across the screen at 60 and 144 Hz (on an empty
  //    course: a CPU knocking into you rocks the camera on purpose)
  {
    const { page, errors } = await open(browser, `${base}?course=1&nosound&quality=low&seed=3&cpu=0`);
    await page.waitForFunction(() => window.DD.debug.race, null, { timeout: 90000 });
    await page.evaluate(() => window.DD.debug.judderProbe(200, 1 / 60, 0)); // through the countdown
    for (const hz of [60, 144]) {
      const r = await page.evaluate((hz) => window.DD.debug.judderProbe(Math.round(1.5 * hz), 1 / hz, 0), hz);
      check(r.frames > 50 && r.judderPx < 0.15, `no judder at ${hz} Hz (${r.judderPx} px over ${r.frames} frames)`);
    }
    // after a hit and after being put back on the road your kart stays visible (no on/off blinking)
    const blink = await page.evaluate(() => {
      const r = window.DD.debug.race, me = r.karts.find((k) => k.isHuman);
      let hidden = 0;
      for (const ev of [() => me.hit('spin'), () => me.respawn(r.track)]) {
        ev();
        for (let i = 0; i < 150; i++) { r.step(1 / 60, new Map([[me, { steer: 0, throttle: 1 }]])); r.frame(1 / 60); if (!me.rig.visual.visible) hidden++; }
      }
      return hidden;
    });
    check(blink === 0, `your kart never blinks out after a hit or a respawn (${blink} hidden frames)`);
    const errs = [...errors, ...(await ddErrors(page))];
    check(errs.length === 0, `judder probe: no errors ${errs.join(' | ')}`);
    await page.close();
  }

  // 4. phone: touch controls appear; the steering slider steers in proportion to where it is touched
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`${base}?course=1&nosound&quality=low&cpu=2`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.DD && window.DD.ready && window.DD.debug.state().screen === 'race', null, { timeout: 120000 });
    check(await page.evaluate(() => document.getElementById('touch').classList.contains('show')), 'phone: touch controls shown');
    const box = await page.locator('[data-steerpad]').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const cy = box.y + box.height / 2, cx = box.x + box.width / 2;
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: cy, id: 1 }] });
    const steerAt = async (type, x) => { await touch(type, x); await page.waitForTimeout(2500); return page.evaluate(() => window.DD.debug.input.touch.steer); };
    const small = await steerAt('touchStart', cx + box.width * 0.1);
    const full = await steerAt('touchMove', cx + box.width * 0.45);
    const left = await steerAt('touchMove', cx - box.width * 0.25);
    const rel = await steerAt('touchEnd');
    check(small > 0 && small < 0.3 && full === 1 && left < -0.3 && rel === 0, `phone: slider steers in proportion (near ${small.toFixed(2)}, edge ${full}, left ${left.toFixed(2)}, released ${rel})`);
    check(errors.length === 0, `phone: no errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // 5. drift and knocks, on course 1 with one scripted CPU (DD.debug.steerProbe steps the race frame by frame)
  {
    const { page, errors } = await open(browser, `${base}?course=1&nosound&quality=low&seed=3&cpu=1&skipintro`);
    await page.waitForFunction(() => window.DD.debug.race, null, { timeout: 90000 });
    const r = await page.evaluate(() => {
      const D = window.DD.debug, race = D.race, tr = race.track, dt = 1 / 60, rc = D.raceCam;
      const me = race.karts.find((k) => k.isHuman), cpu = race.karts.find((k) => !k.isHuman);
      D.steerProbe(200, dt, () => ({ steer: 0, throttle: 1 })); // countdown
      let cpuCtl = { steer: 0, throttle: 1, brake: 0, drift: false, item: false };
      race.ais.get(cpu).update = () => cpuCtl;
      const put = (k, p, d, v) => {
        k.placeOnTrack(tr, p, d); k.speed = v; k.vel.set(Math.sin(k.heading) * v, 0, Math.cos(k.heading) * v);
        k.invuln = 0; k.boost = 0; k.spin = 0; k.drift.active = false; k.driftBlend = 0;
      };
      const park = () => put(cpu, 300, 6, 0);
      const ad = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
      const out = {};
      // a. holding the button on the straight and steering later does not start a drift out of nowhere
      park(); put(me, 104, 0, 24); rc.hint = -1; rc.snap(me);
      D.steerProbe(36, dt, () => ({ steer: 0, throttle: 1, drift: true }));
      const late = D.steerProbe(36, dt, () => ({ steer: 1, throttle: 1, drift: true }));
      out.lateDrift = late.some((x) => x[5]);
      // b. press while steering into the first corner: a drift starts, eases in, and with the stick let go keeps
      //    a moderate curve (not a sudden tight turn)
      put(me, 104, 0, 24); rc.hint = -1; rc.snap(me); D.steerProbe(20, dt, () => ({ steer: 0, throttle: 1 }));
      const rec = D.steerProbe(84, dt, (t) => ({ steer: t < 0.2 ? 0.8 : 0, throttle: 1, drift: true }));
      out.drifting = rec[rec.length - 1][5] === 1;
      const rate = rec.map((x, i) => (i ? Math.abs(ad(x[1] - rec[i - 1][1])) / dt : 0));
      out.jerk = Math.max(...rate.map((v, i) => (i >= 6 ? Math.abs(v - rate[i - 6]) : 0)));
      out.neutralRadius = rec[rec.length - 1][4] / (rate.slice(-20).reduce((a, b) => a + b, 0) / 20);
      // c. running into the back of a slower kart costs you speed and shoves it on; the camera rocks smoothly
      put(me, 30, 0, 26); put(cpu, 33, 0, 15); cpuCtl = { ...cpuCtl, throttle: 0.3 }; rc.hint = -1; rc.snap(me);
      const bumps = []; const emit0 = race.emit.bind(race); race.emit = (t, d) => { if (t === 'bump') bumps.push(d.power); return emit0(t, d); };
      let you0 = 0, cpu0 = 0, hit = -1; const cam = [];
      for (let i = 0; i < 70; i++) {
        if (hit < 0) { you0 = me.speed; cpu0 = cpu.speed; }
        D.steerProbe(1, dt, () => ({ steer: 0, throttle: 1 }));
        cam.push(rc.cam.position.toArray());
        if (hit < 0 && bumps.length) hit = i;
        if (hit >= 0 && i === hit + 2) { out.youLost = you0 - me.speed; out.cpuGained = cpu.speed - cpu0; }
      }
      race.emit = emit0;
      out.bumped = bumps.length > 0;
      out.camJitter = 0;
      for (let i = Math.max(2, hit + 1); i < cam.length; i++) for (let a = 0; a < 3; a++) out.camJitter = Math.max(out.camJitter, Math.abs(cam[i][a] - 2 * cam[i - 1][a] + cam[i - 2][a]));
      return out;
    });
    check(!r.lateDrift, 'drift: holding the button and steering later does not start a drift');
    check(r.drifting && r.jerk < 0.9, `drift: pressing while steering starts a drift that eases in (turn-rate change ${r.jerk.toFixed(2)} rad/s per 0.1 s)`);
    check(r.neutralRadius > 40 && r.neutralRadius < 80, `drift: with the stick let go it keeps a moderate curve (radius ${r.neutralRadius.toFixed(0)} m)`);
    check(r.bumped && r.youLost > 1.5 && r.cpuGained > 1.5, `knock: a rear-end costs speed (you −${(r.youLost || 0).toFixed(1)} m/s, the kart ahead +${(r.cpuGained || 0).toFixed(1)} m/s)`);
    check(r.camJitter < 0.12, `knock: the camera rocks smoothly (largest frame-to-frame jolt ${r.camJitter.toFixed(3)} m)`);
    const errs = [...errors, ...(await ddErrors(page))];
    check(errs.length === 0, `drift / knocks: no errors ${errs.join(' | ')}`);
    await page.close();
  }

  // 6. the tuning panel: a test drive from the settings (no CPUs, endless laps, the panel open); a slider changes the
  //    handling at once (a neutral drift turns tighter), the values are kept, copied, and read back in
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`${base}?nosound&quality=low`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 90000 });
    await page.evaluate(() => window.DD.debug.go('s-settings'));
    await page.click('[data-act="tune-drive"]', { timeout: 60000, noWaitAfter: true });
    await page.waitForFunction(() => window.DD.debug.state().screen === 'race' && window.DD.debug.race?.phase !== 'intro', null, { timeout: 120000 });
    const td = await page.evaluate(() => ({ karts: window.DD.debug.race.karts.length, laps: window.DD.debug.race.laps, open: window.DD.debug.tune.panel.isOpen }));
    check(td.karts === 1 && td.laps === 99 && td.open, `tuning: test drive from the settings (karts ${td.karts}, laps ${td.laps}, panel ${td.open})`);
    const r = await page.evaluate(() => {
      const D = window.DD.debug, T = D.tune, race = D.race, tr = race.track, me = race.karts[0], dt = 1 / 60;
      while (race.phase !== 'race') D.steerProbe(10, dt, () => ({ steer: 0, throttle: 0 }));
      const radius = () => {
        me.placeOnTrack(tr, 104, 0); me.speed = 24; me.vel.set(Math.sin(me.heading) * 24, 0, Math.cos(me.heading) * 24);
        me.drift.active = false; me.driftBlend = 0; D.raceCam.hint = -1; D.raceCam.snap(me);
        D.steerProbe(20, dt, () => ({ steer: 0, throttle: 1 }));
        const rec = D.steerProbe(84, dt, (t) => ({ steer: t < 0.2 ? 0.8 : 0, throttle: 1, drift: true }));
        let sum = 0; for (let i = rec.length - 20; i < rec.length; i++) { let d = rec[i][1] - rec[i - 1][1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; sum += Math.abs(d) / dt; }
        return rec[rec.length - 1][4] / (sum / 20);
      };
      const a = radius(); T.setTune('driftNeutral', 0.5); const b = radius(); T.resetTune();
      // the panel's slider
      const row = [...document.querySelectorAll('#tuner .tn-p')].find((x) => x.textContent.includes('内側に 入れた'));
      const range = row.querySelector('input[type=range]'); range.value = '0.2'; range.dispatchEvent(new Event('input', { bubbles: true }));
      return { a, b, driftIn: T.TUNE.driftIn, saved: localStorage.getItem('dream-drift-tune'), changed: row.classList.contains('changed') };
    });
    check(r.b < r.a * 0.8, `tuning: a stronger neutral drift turns tighter at once (radius ${r.a.toFixed(0)} → ${r.b.toFixed(0)} m)`);
    check(r.driftIn === 0.2 && /"driftIn":0.2/.test(r.saved || '') && r.changed, `tuning: the slider sets the value and keeps it on the device (${r.saved})`);
    await page.click('[data-tn="copy"]');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(/DREAM DRIFT 調整値/.test(clip) && /"driftIn":0.2/.test(clip), `tuning: 値を コピー puts every value on the clipboard (${clip.split('\n')[0]})`);
    const back = await page.evaluate(async (clip) => {
      const T = window.DD.debug.tune; T.resetTune(); window.DD.debug.tune.panel.refresh();
      const out = document.querySelector('#tuner [data-tn="out"]'); out.value = clip;
      document.querySelector('#tuner [data-tn="load"]').click();
      const v = T.TUNE.driftIn; T.resetTune(); return v;
    }, clip);
    check(back === 0.2, `tuning: pasted values read back in (driftIn ${back})`);
    check(errors.length === 0, `tuning: no errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  await browser.close();
  srv.close();
  if (fail.length) { console.error(`\n${fail.length} check(s) failed`); process.exit(1); }
  console.log('\nall smoke checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
