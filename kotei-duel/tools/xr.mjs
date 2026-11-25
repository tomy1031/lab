// tools/xr.mjs — the game in VR, through the real WebXR code path in Meta's emulator (IWER, Meta Quest 3):
// enter VR (seated) → the menu board → laser + trigger on a chapter → the intro board → 「デュエル開始」 →
// the table is fitted to the head (45 cm below the eyes) → the hint bubble's OK → laser at the next stage on the
// V + trigger → the side board shows 「置く」 → press it: the stage is placed → laser at a hand card + 「使う／出す」
// → 「ターン終了」 on the HUD board → the enemy's turn → your turn again → B cancels a selection →
// a tracked hand: pinch selects → the menu → 「VR を終わる」.
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
  localStorage.clear();
  const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
  d.installRuntime({ forceInstall: true });
  d.position.set(0, 1.2, 0); // seated
  window.__xrd = d;
});
let ok = true;
// answer boards (dialogs, the guide's bubble) with the laser until it is your turn again (or the duel is over)
async function settle(max = 80) {
  for (let i = 0; i < max; i++) {
    const st = await page.evaluate(() => { const A = window.__app; return { modal: A.vr.modal.visible, bubble: A.vr.bubble.visible && !!A.vr.bubbleOk, can: A.D && A.D.canAct(), over: A.D && A.D.over }; });
    if (st.modal) { await page.evaluate(() => { const m = window.__app.vr.modal; const b = m.buttons.find((x) => x.primary && !x.disabled) || m.buttons.find((x) => !x.disabled); return window.__clickBtn('modal', b.id); }); continue; }
    if (st.bubble) { await page.evaluate(() => window.__clickBtn('bubble', 'ok')); continue; }
    if (st.can || st.over) return true;
    await page.waitForTimeout(250);
  }
  return false;
}
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

await page.goto(base + '?nodemo&unlock&seed=5&speed', { waitUntil: 'load' });
await until(() => window.__app && !document.getElementById('btn-vr').disabled);
await page.evaluate(() => { window.__app.settings.speed = 0.15; });
await page.click('#btn-vr');
await until(() => window.__app.xrActive);
await page.evaluate(() => {
  const app = window.__app, d = window.__xrd;
  const V = app.camera.position.constructor, Q = app.camera.quaternion.constructor;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ctl = (s) => d.controllers[s === 'L' ? 'left' : 'right'];
  Object.assign(window, { __V: V, __Q: Q, __frame: frame });
  window.__frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
  // point a controller's ray at a world point
  window.__aimAt = async (side, target) => {
    const c = ctl(side);
    for (let i = 0; i < 4; i++) {
      await frame();
      const h = app.pointer.hands.find((x) => x.side === side);
      const m = h.ray.matrixWorld;
      const o = new V().setFromMatrixPosition(m), dir = new V(0, 0, -1).transformDirection(m);
      const fix = new Q().setFromUnitVectors(dir, target.clone().sub(o).normalize());
      const rq = new Q().setFromRotationMatrix(app.rig.matrixWorld);
      const fixLocal = rq.clone().invert().multiply(fix).multiply(rq);
      const q = new Q(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).premultiply(fixLocal);
      c.quaternion.set(q.x, q.y, q.z, q.w);
    }
    await frame();
  };
  window.__press = async (side, id) => { const c = ctl(side); c.updateButtonValue(id, 1); await frame(); await frame(); c.updateButtonValue(id, 0); await frame(); await frame(); };
  // the world position of a button on a board
  window.__btnPos = (board, id) => {
    const btn = board.buttons.find((x) => x.id === id);
    if (!btn) throw new Error(`no button ${id} on ${board.id}: ${board.buttons.map((x) => x.id).join(',')}`);
    return board.mesh.localToWorld(new V(((btn.x + btn.w / 2) / board.w - 0.5) * board.wm, (0.5 - (btn.y + btn.h / 2) / board.h) * board.hm, 0));
  };
  window.__clickBtn = async (boardName, id) => { await window.__aimAt('R', window.__btnPos(app.vr[boardName], id)); await window.__press('R', 'trigger'); await window.__frames(3); };
  window.__cardPos = (key) => { const m = app.table.cards.get(key); return m.getWorldPosition(new V()); };
  window.__clickCard = async (key) => { await window.__aimAt('R', window.__cardPos(key)); await window.__press('R', 'trigger'); await window.__frames(3); };
});
await page.evaluate(() => window.__frames(4));
check(await page.evaluate(() => window.__app.vr.modal.visible && window.__app.vr.modal.buttons.some((x) => x.id === 'ch4')), 'entered VR: the chapter menu board floats over the table');
await shot(page, 'xr-menu.png');

// laser + trigger on chapter 4
await page.evaluate(() => window.__clickBtn('modal', 'ch4'));
await until(() => window.__app.mode === 'intro' && window.__app.vr.modal.visible);
check(true, 'laser + trigger on 「第 4 章」: the intro board');
await page.evaluate(() => window.__clickBtn('modal', 'go'));
await until(() => window.__app.mode === 'duel');
check(true, '「デュエル開始」 pressed with the laser: the duel begins');

// the table was fitted to the head
await page.waitForTimeout(900);
const fit = await page.evaluate(() => {
  const app = window.__app;
  const p = app.camera.getWorldPosition(new window.__V());
  return { y: p.y - 0.74, z: p.z };
});
check(Math.abs(fit.y - 0.45) < 0.03 && Math.abs(fit.z - 0.92) < 0.05, `the table is fitted to you: eyes ${(fit.y * 100).toFixed(0)} cm above the table, ${(fit.z * 100).toFixed(0)} cm behind its centre`);

// answer the hint bubbles / dialogs until it is our turn
for (let i = 0; i < 12; i++) {
  const st = await page.evaluate(() => { const A = window.__app; return { bubble: A.vr.bubble.visible && !!A.vr.bubbleOk, modal: A.vr.modal.visible, can: A.D.canAct() }; });
  if (st.bubble) { await page.evaluate(() => window.__clickBtn('bubble', 'ok')); continue; }
  if (st.modal) { await page.evaluate(() => { const m = window.__app.vr.modal; window.__clickBtn('modal', (m.buttons.find((x) => x.primary) || m.buttons[0]).id); }); await page.waitForTimeout(200); continue; }
  if (st.can) break;
  await page.waitForTimeout(300);
}
check(await page.evaluate(() => window.__app.D.canAct()), 'the hint bubble was answered with the laser: your turn');
await shot(page, 'xr-duel.png');

// laser at the next stage on the V → select → 「置く」 on the side board
await page.evaluate(() => window.__clickCard('plan:' + window.__app.D.ptr));
const sel = await page.evaluate(() => ({ sel: window.__app.sel, btns: window.__app.vr.info.buttons.map((x) => x.id) }));
check(sel.sel && sel.sel.kind === 'plan' && sel.btns.includes('place'), `laser + trigger on the next stage: selected, the side board offers 「置く」 (${sel.btns.join(',')})`);
await page.evaluate(() => window.__clickBtn('info', 'place'));
await settle();
check(await page.evaluate(() => !!window.__app.D.placed[0]), '「置く」 pressed: 要件定義 is on the V (the lesson board that opened was answered with the laser)');
await shot(page, 'xr-placed.png');

// a hand card: select it with the laser, play it if it can be played
const hand = await page.evaluate(() => { const D = window.__app.D; const h = D.p.hand.find((x) => !D.playProblem(x.uid) && !D.skillTargets(x.id)); return h ? { uid: h.uid, id: h.id } : null; });
if (hand) {
  await page.evaluate((uid) => window.__clickCard('c:' + uid), hand.uid);
  const btns = await page.evaluate(() => window.__app.vr.info.buttons.map((x) => x.id));
  check(btns.includes('play'), `laser on the hand card ${hand.id}: the side board offers it (${btns.join(',')})`);
  await page.evaluate(() => window.__clickBtn('info', 'play'));
  await settle();
  check(await page.evaluate((uid) => !window.__app.D.p.hand.some((x) => x.uid === uid), hand.uid), `played ${hand.id} with the laser`);
} else check(true, 'no playable card in hand this time (skipped)');

// B cancels a selection
await page.evaluate(() => window.__clickCard('plan:' + window.__app.D.ptr));
const hadSel = await page.evaluate(() => !!window.__app.sel);
await page.evaluate(() => window.__press('R', 'b-button'));
check(hadSel && (await page.evaluate(() => !window.__app.sel)), 'B cancels the selection');

// end the turn on the HUD board → the enemy plays → your turn again
const t0 = await page.evaluate(() => window.__app.D.turn);
await page.evaluate(() => window.__clickBtn('hud', 'end'));
await page.waitForTimeout(300);
await settle(160);
const t1 = await page.evaluate(() => ({ turn: window.__app.D.turn, can: window.__app.D.canAct(), field: window.__app.D.e.field.length }));
check(t1.turn === t0 + 1 && t1.can, `「ターン終了」 on the HUD board: the enemy played (troubles on the field: ${t1.field}) and it is your turn ${t1.turn}`);
await shot(page, 'xr-turn2.png');

// a tracked hand: pinch = select
const pinch = await page.evaluate(async () => {
  const d = window.__xrd;
  if (!d.hands || !('primaryInputMode' in d)) return 'no hand emulation';
  d.primaryInputMode = 'hand';
  await window.__frames(8);
  const app = window.__app;
  const h = app.pointer.hands.find((x) => x.isHand && x.side === 'R');
  if (!h) return 'no tracked hand';
  app.sel = null;
  // move the hand so that its ray (whatever its direction) passes through the next stage, then pinch
  const hand = d.hands.right;
  const target = window.__cardPos('plan:' + app.D.ptr);
  for (let i = 0; i < 4; i++) {
    await window.__frame();
    const m = h.ray.matrixWorld;
    const o = new window.__V().setFromMatrixPosition(m), dir = new window.__V(0, 0, -1).transformDirection(m);
    const want = target.clone().sub(dir.clone().multiplyScalar(Math.max(0.25, target.distanceTo(o))));
    const rq = new window.__Q().setFromRotationMatrix(app.rig.matrixWorld).invert();
    const delta = want.sub(o).applyQuaternion(rq);
    hand.position.set(hand.position.x + delta.x, hand.position.y + delta.y, hand.position.z + delta.z);
  }
  await window.__frames(2);
  hand.updatePinchValue(1); await window.__frames(4); hand.updatePinchValue(0); await window.__frames(4);
  const res = app.sel ? app.sel.kind : 'nothing';
  d.primaryInputMode = 'controller';
  await window.__frames(6);
  return res;
});
check(pinch === 'plan' || pinch === 'no hand emulation', `hand tracking: a pinch selects what the hand points at (${pinch})`);

// the menu → leave VR
await page.evaluate(() => window.__clickBtn('hud', 'menu'));
await until(() => window.__app.vr.modal.visible);
await page.evaluate(() => window.__clickBtn('modal', 'exit'));
await until(() => !window.__app.xrActive, null, 10000);
check(await page.isVisible('#side'), '「VR を終わる」: back on the page, the duel goes on on the screen');
check(errors.length === 0, `no errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await b.close();
srv.close();
console.log(ok ? 'xr: all ok' : 'xr: FAILED');
process.exit(ok ? 0 : 1);
