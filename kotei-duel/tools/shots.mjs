// tools/shots.mjs — the pictures in docs/: preview.jpg (a duel on a PC, for the lab site) and vr-view.jpg
// (the same table in VR, from the Meta Quest emulator).
//   node tools/shots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { browser, serveApp } from './pw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
fs.mkdirSync(docs, { recursive: true });
const { srv, base } = await serveApp();
const b = await browser();

// play a few turns of chapter 4 with the bot (answering every dialog), then stop on a turn with things on the table
async function playInto(page, turns) {
  await page.evaluate(async (turns) => {
    const A = window.__app;
    const { playTurn } = await import('./js/bot.js');
    const click = () => {
      if (A.xrActive) {
        if (A.vr.bubble.visible && A.vr.bubbleOk) { const f = A.vr.bubbleOk; A.vr.hideBubble(); f(); }
        if (A.vr.modal.visible) { const m = A.vr.modal; const bt = m.buttons.find((x) => x.primary && !x.disabled) || m.buttons.find((x) => !x.disabled); A.vr.closeDialog(bt.id); }
        return;
      }
      document.querySelector('#bubble:not(.hidden) .bbtn button')?.click();
      const m = document.getElementById('modal');
      if (!m.classList.contains('hidden')) (m.querySelector('.btns button.primary:not([disabled])') || m.querySelector('.btns button:not([disabled])'))?.click();
    };
    const iv = setInterval(click, 30);
    await new Promise((r) => { const t = setInterval(() => { if (A.mode === 'duel' && A.D && A.D.canAct()) { clearInterval(t); r(); } }, 30); });
    const D = A.D;
    for (let i = 0; i < turns && !D.over; i++) {
      await playTurn(D, 'good');
      if (i === turns - 1) break;
      await D.endTurn();
    }
    // leave a found bug or a trouble selected so the panel shows something
    await new Promise((r) => setTimeout(r, 600));
    clearInterval(iv);
    const plan = D.ptr < D.track.length ? { kind: 'plan', idx: D.ptr } : null;
    if (plan) A.onPick(plan);
    await new Promise((r) => setTimeout(r, 1200));
    A.fx.clear();
    document.getElementById('banner').classList.add('hidden');
  }, turns);
}

{
  const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(base + '?nodemo&unlock&seed=21&chapter=ch4');
  await page.waitForFunction(() => window.__app && window.__app.mode === 'intro');
  await page.evaluate(() => { window.__app.settings.speed = 0.3; });
  await page.click('#modal .btns button.primary');
  await playInto(page, 5);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(docs, 'preview.jpg'), type: 'jpeg', quality: 86 });
  console.log('wrote docs/preview.jpg');
  await page.close();
}

{
  const require = createRequire(import.meta.url);
  const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.addInitScript({ path: require.resolve('iwer/build/iwer.min.js') });
  await page.addInitScript(() => { const d = new window.IWER.XRDevice(window.IWER.metaQuest3); d.installRuntime({ forceInstall: true }); d.position.set(0, 1.2, 0); d.quaternion.set(-0.2, 0, 0, 0.98); window.__xrd = d; });
  await page.goto(base + '?nodemo&unlock&seed=21');
  await page.waitForFunction(() => window.__app && !document.getElementById('btn-vr').disabled);
  await page.evaluate(() => { window.__app.settings.speed = 0.3; });
  await page.click('#btn-vr');
  await page.waitForFunction(() => window.__app.xrActive && window.__app.vr.modal.visible);
  await page.evaluate(() => { const A = window.__app; A.vr.closeDialog('ch4'); });
  await page.waitForFunction(() => window.__app.mode === 'intro');
  await page.evaluate(() => window.__app.vr.closeDialog('go'));
  await playInto(page, 4);
  await page.evaluate(() => { const d = window.__xrd; d.controllers.right.position.set(0.18, 1.0, -0.25); d.controllers.left.position.set(-0.2, 0.98, -0.2); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(docs, 'vr-view.jpg'), type: 'jpeg', quality: 86 });
  console.log('wrote docs/vr-view.jpg');
  await page.close();
}
await b.close();
srv.close();
