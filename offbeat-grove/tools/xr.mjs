// tools/xr.mjs — drives the real WebXR code path in Meta's emulator (IWER, Meta Quest 3 profile):
// enter VR → the menu panel → aim the right controller's laser at START and pull the trigger → punch
// targets with the emulated controllers → B pauses → laser + trigger on 再開 → switch to hand tracking
// (gloves follow the hands) → the results panel → メニューへ → leave VR.
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
const page = await b.newPage({ viewport: { width: 900, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript({ path: IWER });
await page.addInitScript(() => {
  const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
  d.installRuntime({ forceInstall: true });
  d.position.set(0, 1.65, 0);
  window.__xrd = d;
});
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

await page.goto(base + '?quality=low&song=canopy&mode=off&diff=normal&length=short&seed=5', { waitUntil: 'load' });
await until(() => window.__app && !document.getElementById('btn-vr').disabled);
await page.click('#btn-vr');
await until(() => window.__app.xr && window.__app.menu.visible);
check(true, 'entered VR: the menu panel is in front of you');

// helpers in the page: aim a controller's laser at a panel button, pull the trigger
await page.evaluate(() => {
  const app = window.__app, d = window.__xrd;
  const V = app.input.head.constructor, Q = app.input.headQuat.constructor;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__frame = frame;
  window.__aim = async (side, panel, id) => {
    const c = d.controllers[side === 'L' ? 'left' : 'right'];
    const btn = panel.buttons.find((x) => x.id === id);
    if (!btn) throw new Error('no button ' + id);
    const W = panel.w / panel.ppm, H = panel.h / panel.ppm;
    const target = panel.mesh.localToWorld(new V((btn.x + btn.w / 2) / panel.ppm - W / 2, H / 2 - (btn.y + btn.h / 2) / panel.ppm, 0));
    for (let i = 0; i < 4; i++) {
      await frame();
      const r = app.input.rays[side];
      const want = target.clone().sub(r.o).normalize();
      const fix = new Q().setFromUnitVectors(r.d.clone().normalize(), want);
      const q = new Q(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).premultiply(fix);
      c.quaternion.set(q.x, q.y, q.z, q.w);
    }
    await frame();
    return panel.hover;
  };
  window.__pull = async (side) => {
    const c = d.controllers[side === 'L' ? 'left' : 'right'];
    c.updateButtonValue('trigger', 1); await frame();
    c.updateButtonValue('trigger', 0); await frame(); await frame();
  };
  window.__press = async (side, id) => {
    const c = d.controllers[side === 'L' ? 'left' : 'right'];
    c.updateButtonValue(id, 1); await frame();
    c.updateButtonValue(id, 0); await frame();
  };
});

const hover = await page.evaluate(() => window.__aim('R', window.__app.menu, 'start'));
check(hover === 'start', `laser hovers START (${hover})`);
await page.evaluate(() => window.__pull('R'));
await until(() => window.__app.state === 'play', null, 8000);
const st = await page.evaluate(() => ({ eyeY: window.__app.session.eyeY, hud: window.__app.hud.visible, lane: window.__app.lane.mesh.visible }));
check(st.hud, `START with the trigger → playing (eye height ${st.eyeY.toFixed(2)} m, HUD shown)`);

// a bot in the page: before each target arrives, swing that hand's glove through the target along its punch
// direction (the controller is moved so the glove — not the controller — passes through the target)
await page.evaluate(() => {
  const app = window.__app, d = window.__xrd;
  const V = app.input.head.constructor;
  window.__bot = true;
  const tick = () => {
    if (!window.__bot) return;
    const s = app.session;
    if (s && app.state === 'play') {
      for (const side of ['L', 'R']) {
        const c = d.controllers[side === 'L' ? 'left' : 'right'];
        const g = app.input.gloves[side];
        if (!g.tracked) continue;
        const n = s.active.find((x) => x.state === 'wait' && x.hand === side && x.kind !== 'duck' && x.t - app.songT < 0.45);
        let to;
        if (n) {
          const lead = n.t - app.songT;
          const p = app.playRoot.localToWorld(s.posAt(n, n.t));
          const dir = new V(...n.dir).applyQuaternion(app.playRoot.quaternion);
          to = p.addScaledVector(dir, lead > 0.12 ? -0.35 : 0.08); // wind up, then strike through
        } else {
          to = app.playRoot.localToWorld(new V(side === 'L' ? -0.22 : 0.22, s.eyeY - 0.35, -0.25));
        }
        c.position.set(c.position.x + to.x - g.pos.x, c.position.y + to.y - g.pos.y, c.position.z + to.z - g.pos.z);
      }
      // duck under branches
      const duck = s.active.find((x) => x.kind === 'duck' && x.state === 'wait' && x.t - app.songT < 0.6);
      d.position.y = duck ? 1.65 - 0.32 : 1.65;
    }
    setTimeout(tick, 16);
  };
  tick();
});
await until(() => window.__app.session && window.__app.session.hits >= 6, null, 90000);
await shot(page, 'xr-play.png');
const mid = await page.evaluate(() => { const s = window.__app.session; return { t: window.__app.songT, hits: s.hits, judged: s.judged.length, grades: s.judged.slice(-6).map((n) => n.grade) }; });
check(mid.hits >= 6, `controllers punch targets: ${mid.hits} hits of ${mid.judged} judged (${mid.grades.join(' ')})`);

// pause with B, check the clock stops, resume with the laser
await page.evaluate(() => window.__press('R', 'b-button'));
await until(() => window.__app.state === 'paused', null, 5000);
const t1 = await page.evaluate(() => window.__app.songT);
await page.waitForTimeout(1200);
const t2 = await page.evaluate(() => window.__app.songT);
check(Math.abs(t2 - t1) < 0.01 && (await page.evaluate(() => window.__app.pausePanel.visible)), 'B button pauses: the song stops and the pause panel opens');
await page.evaluate(() => { window.__bot = false; });
const hov2 = await page.evaluate(() => window.__aim('R', window.__app.pausePanel, 'resume'));
await page.evaluate(() => window.__pull('R'));
await until(() => window.__app.state === 'play', null, 5000);
check(hov2 === 'resume', 'laser + trigger on 再開 resumes after a count-in');

// hand tracking: the gloves follow the hands
await page.evaluate(async () => { window.__xrd.primaryInputMode = 'hand'; for (let i = 0; i < 6; i++) await window.__frame(); });
const hands = await page.evaluate(() => ({ hand: window.__app.input.handMode, L: window.__app.input.gloves.L.tracked, R: window.__app.input.gloves.R.tracked }));
check(hands.hand && hands.L && hands.R, 'hand tracking: both gloves follow the hands');
await page.evaluate(async () => { window.__xrd.primaryInputMode = 'controller'; for (let i = 0; i < 4; i++) await window.__frame(); });

// jump to the end: the results panel, then back to the menu with the laser
await page.evaluate(() => { const s = window.__app.session; s.endT = window.__app.songT + 0.3; });
await until(() => window.__app.state === 'results' && window.__app.resultsPanel.visible, null, 10000);
await shot(page, 'xr-results.png');
const res = await page.evaluate(() => { const r = window.__app.lastResults; return { rank: r.rank, score: r.score, and: r.cat.and, advice: r.advice }; });
check(res.and.n > 0, `results panel: rank ${res.rank}, score ${res.score}, offbeat ${res.and.hit}/${res.and.n} (mean ${res.and.mean}ms, ±${res.and.sd}ms)`);
const hov3 = await page.evaluate(() => window.__aim('R', window.__app.resultsPanel, 'menu'));
await page.evaluate(() => window.__pull('R'));
await until(() => window.__app.state === 'menu' && window.__app.menu.visible, null, 5000);
check(hov3 === 'menu', 'メニューへ → back to the menu panel');
// pick another rhythm mode on the panel
await page.evaluate(() => window.__aim('R', window.__app.menu, 'mode:sync'));
await page.evaluate(() => window.__pull('R'));
check((await page.evaluate(() => window.__app.store.data.mode)) === 'sync', 'menu panel: rhythm mode changed to シンコペーション with the laser');

// leave VR
await page.evaluate(() => window.__app.renderer.xr.getSession().end());
await until(() => !window.__app.xr && !document.getElementById('menu').classList.contains('hidden'), null, 5000);
check(true, 'leaving VR brings back the page menu');
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
