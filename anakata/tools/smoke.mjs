// tools/smoke.mjs — the PC path, end to end: open the page, start on the PC, walk every step of every chapter
// with the panel's own "つぎへ" button, use the mouse on the things you can touch (the lever, a knob, a solid,
// the moon, the past), and check there are no errors. With an outDir, saves a screenshot of every step.
//   node tools/smoke.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { browser, serveApp } from './pw.mjs';

const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const { srv, base } = await serveApp();
const b = await browser();
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
const frames = (n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async (name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };

await page.goto(base + '?shot', { waitUntil: 'load' });
await until(() => window.__app && document.getElementById('loading').classList.contains('hidden'));
check(await page.isVisible('#start'), 'start sheet shows');
check((await page.$$('#chapters .ch')).length === 6, 'six chapters listed');
await shot('00-start.png');
await page.click('#btn-pc');
await until(() => window.__app.started && window.__app.current.index === 1);
check(await page.isVisible('#panel-wrap canvas'), 'guide panel is on the page');

// press a panel button by id, through a real click on the canvas
const pressPanel = async (id) => {
  const r = await page.evaluate((id) => {
    const p = window.__app.panel;
    const b = p.buttons.find((x) => x.id === id);
    if (!b) return null;
    const rc = p.canvas.getBoundingClientRect();
    return { x: rc.left + ((b.x + b.w / 2) / p.canvas.width) * rc.width, y: rc.top + ((b.y + b.h / 2) / p.canvas.height) * rc.height };
  }, id);
  if (!r) return false;
  await page.mouse.click(r.x, r.y);
  return true;
};
// drag in the 3D view from a world point by a screen offset
const screenOf = (expr) => page.evaluate((expr) => {
  const app = window.__app;
  const v = eval(expr); // eslint-disable-line no-eval
  const p = v.clone().project(app.camera);
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
}, expr);
const drag = async (from, dx, dy, steps = 12) => {
  await page.mouse.move(from.x, from.y);
  await frames(2);
  await page.mouse.down();
  await frames(2);
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps); await frames(1); }
  await page.mouse.up();
};

const names = [];
for (let ch = 1; ch <= 6; ch++) {
  await page.evaluate((ch) => window.__app.go(ch), ch);
  await frames(4);
  const n = await page.evaluate(() => window.__app.current.steps.length);
  for (let s = 0; s < n; s++) {
    await frames(s === 0 ? 30 : 50);
    const st = await page.evaluate(() => ({ ch: window.__app.current.index, step: window.__app.current.step, title: window.__app.current.title }));
    check(st.ch === ch && st.step === s, `chapter ${ch} 「${st.title}」 step ${s + 1}/${n}`);
    const name = `${ch}-${s + 1}.png`;
    names.push(name);
    await shot(name);
    if (s < n - 1) check(await pressPanel('next'), '  つぎへ');
  }
}

// the controls guide: on by default, shows "what to do now" on the panel and rings on the things to take
await page.evaluate(() => window.__app.go(3, 0));
await frames(5);
const g1 = await page.evaluate(() => ({ on: window.__app.guide.on, how: window.__app.panel.spec.how, rings: window.__app.guide.markers.filter((m) => m.ring.visible).length }));
check(g1.on && g1.how && g1.rings >= 1, `guide on: 「${g1.how}」, ${g1.rings} marker(s)`);
await page.click('#btn-guide');
await frames(3);
const g2 = await page.evaluate(() => ({ on: window.__app.guide.on, how: window.__app.panel.spec.how, rings: window.__app.guide.markers.filter((m) => m.ring.visible).length, keys: document.getElementById('keys').classList.contains('hidden') }));
check(!g2.on && !g2.how && g2.rings === 0 && g2.keys, 'guide off: no text, no markers, no key help');
await page.keyboard.press('KeyG');
await frames(3);
check(await page.evaluate(() => window.__app.guide.on), 'G key turns the guide back on');
await shot('guide-pc.png');

// interactions with the mouse (fold the guide first, so it covers nothing)
await page.click('#fold');
await page.evaluate(() => window.__app.go(3, 0));
await frames(10);
const lever0 = await page.evaluate(() => window.__app.current.rig.console.slider.value);
const knob = await screenOf('window.__app.current.rig.console.slider.knobWorld()');
await drag(knob, 0, -120);
const lever1 = await page.evaluate(() => window.__app.current.rig.console.slider.value);
check(lever1 > lever0 + 0.1, `slices: dragging the W lever up moves it (${lever0.toFixed(2)} → ${lever1.toFixed(2)})`);
await page.evaluate(() => window.__app.current.setStep(2));
await frames(4);
const v0 = await page.evaluate(() => window.__app.current.rig.version);
const dial = await screenOf('window.__app.current.rig.console.dials[0].center()');
await drag({ x: dial.x + 25, y: dial.y }, -30, 40);
const v1 = await page.evaluate(() => window.__app.current.rig.version);
check(v1 > v0, `slices: turning the X→W knob with the mouse rotates the tesseract (${v1 - v0} updates)`);

await page.evaluate(() => window.__app.go(2, 3));
await frames(10);
const c0 = await page.evaluate(() => window.__app.current.objs[1].mesh.position.y);
const cone = await screenOf('window.__app.current.objs[1].mesh.getWorldPosition(new window.__app.camera.position.constructor())');
await drag(cone, 0, 90);
const c1 = await page.evaluate(() => window.__app.current.objs[1].mesh.position.y);
check(c1 < c0 - 0.03, `flatland: dragging the cone moves it down through the plane (${c0.toFixed(2)} → ${c1.toFixed(2)})`);
const lit = await page.evaluate(() => { const d = window.__app.current.viewData; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; });
check(lit > 0, `flatland: the flatlander's 1D view shows something (${lit} bright pixels)`);

await page.evaluate(() => { window.__app.go(5, 1); window.__app.current.resetMoon(); });
await frames(10);
const moon = await screenOf('window.__app.current.moon.getWorldPosition(new window.__app.camera.position.constructor())');
await drag(moon, 10, -70);
await frames(3);
const fly = await page.evaluate(() => window.__app.current.state);
check(fly === 'flying' || fly === 'gone', `gravity: flicking the moon launches it (${fly})`);
await page.evaluate(() => { const g = window.__app.current; g.setLaw(3); g.launch(0.985); });
await page.waitForTimeout(4000);
const r3 = await page.evaluate(() => { const h = window.__app.current.hist; const rs = h.map((x) => x[1]); return [Math.min(...rs), Math.max(...rs), window.__app.current.state]; });
check(r3[2] === 'flying' && r3[0] > 0.2 && r3[1] < 0.4, `gravity 1/r²: stable orbit, r in [${r3[0].toFixed(3)}, ${r3[1].toFixed(3)}]`);
await page.evaluate(() => { const g = window.__app.current; g.setLaw(4); g.launch(0.985); });
await page.waitForFunction(() => window.__app.current.state === 'gone', null, { timeout: 15000 }).catch(() => {});
check(await page.evaluate(() => window.__app.current.state === 'gone' || window.__app.current.state === 'held'), 'gravity 1/r³: the same throw falls into the sun');

await page.evaluate(() => window.__app.go(6, 4));
await page.waitForFunction(() => window.__app.current.u >= 1, null, { timeout: 8000 });
await frames(5);
const ballScreen = await screenOf(`(() => { const c = window.__app.current; const V = window.__app.camera.position.constructor; const i = c.i0; const p = new V(); const b = c.sim.ball; const k = i * 30; p.set(b[k*3] + c.copyX(i), b[k*3+1], b[k*3+2] - 1.9); c.world.updateMatrixWorld(true); return c.world.localToWorld(p); })()`);
const before = await page.evaluate(() => Array.from(window.__app.current.sim.ball));
await page.mouse.click(ballScreen.x, ballScreen.y);
await frames(10);
const nud = await page.evaluate(() => window.__app.current.nudges.map((n) => n.t));
check(nud.length === 1, `tesseract: clicking the ball in the room in front pushes it (pushes at t = ${nud.join(', ')})`);
await page.waitForFunction(() => window.__app.current.front === null, null, { timeout: 10000 }).catch(() => {});
if (nud.length) {
  const res = await page.evaluate(([before, t0]) => {
    const b = window.__app.current.sim.ball;
    let pastSame = true, futureDiff = 0;
    for (let k = 0; k < b.length / 3; k++) {
      const d = Math.hypot(b[k * 3] - before[k * 3], b[k * 3 + 1] - before[k * 3 + 1], b[k * 3 + 2] - before[k * 3 + 2]);
      if (k / 60 < t0 - 1e-6 && d > 1e-6) pastSame = false;
      if (k / 60 > t0 + 0.5) futureDiff = Math.max(futureDiff, d);
    }
    return { pastSame, futureDiff };
  }, [before, nud[0]]);
  check(res.pastSame && res.futureDiff > 0.1, `tesseract: the past is unchanged, the future moved (up to ${res.futureDiff.toFixed(2)} m)`);
}
await shot('6-push.png');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
