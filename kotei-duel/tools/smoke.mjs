// tools/smoke.mjs — the game on a PC page (Chromium, software WebGL):
//   1. the title page: chapters, settings, the demo duel behind it, no errors
//   2. chapter 1 (the tutorial) played through the page the way a person would: the first stage is placed by
//      clicking the 3D card with the mouse; every other step follows the guide (bubbles, buttons, the cut-in dialog)
//      → the project is completed with Trust 20 → result → quiz → the next chapter opens
//   3. chapters 2–9 played by the bot on the real page (every event is animated and every dialog is answered)
//      → each duel ends, the result and the quiz appear
//   4. settings: furigana off hides the readings and is remembered
//   5. a phone held upright: the panel becomes a bottom sheet, a duel starts
//   node tools/smoke.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { browser, serveApp } from './pw.mjs';

const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const { srv, base } = await serveApp();
const b = await browser();
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };

async function open(url, viewport = { width: 1280, height: 720 }) {
  const page = await b.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 });
  return { page, errors };
}
const vis = (page, sel) => page.isVisible(sel).catch(() => false);

// ---------- 1. title ----------
{
  const { page, errors } = await open('?unlock');
  check(await vis(page, '#start'), 'title page shows');
  check(await page.locator('.chap').count() === 9, '9 chapters listed');
  await page.waitForFunction(() => window.__app.D && window.__app.D.turn >= 2, null, { timeout: 60000 });
  check(true, 'the demo duel plays behind the title');
  await shot(page, 'title.png');
  check(errors.length === 0, `no errors on the title${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

// ---------- 2. the tutorial through the page ----------
{
  const { page, errors } = await open('?fast&nodemo&seed=1');
  await page.click('#btn-play'); // the first chapter that is not cleared = chapter 1
  await page.waitForSelector('#modal:not(.hidden)');
  check((await page.textContent('#modal h3')).includes('はじめての'), 'chapter 1 intro dialog');
  await page.click('#modal .btns button.primary');
  let clickedWithMouse = false, guardDialog = false, steps = 0, quizSeen = 0, resultSeen = false;
  for (let k = 0; k < 400; k++) {
    await page.waitForTimeout(60);
    const st = await page.evaluate(() => {
      const A = window.__app, D = A.D;
      const s = A.tutStep();
      return { mode: A.mode, i: A.tut?.i, want: s?.want, over: D?.over, canAct: D?.canAct(), busy: D?.busy, side: D?.side, turn: D?.turn,
        modal: !document.getElementById('modal').classList.contains('hidden'), modalTag: document.querySelector('#modal .tag')?.textContent || '',
        bubbleBtn: !!document.querySelector('#bubble:not(.hidden) .bbtn button') };
    });
    if (st.mode === 'title') break;
    if (st.bubbleBtn) { await page.click('#bubble .bbtn button'); continue; }
    if (st.modal) {
      if (st.modalTag.includes('わりこみ')) { guardDialog = true; await page.click('#modal .btns button.primary:not([disabled])'); continue; }
      if (st.modalTag.includes('クイズ') && !st.modalTag.includes('けっか')) { quizSeen++; await page.click('#modal .btns button >> nth=0'); continue; }
      if (st.modalTag.includes('クリア')) resultSeen = true;
      if (st.modalTag.includes('つぎは')) { await shot(page, 'tutorial-next.png'); await page.click('#modal .btns button >> nth=-1'); continue; } // タイトルへ
      await page.click('#modal .btns button.primary');
      continue;
    }
    if (!st.canAct || !st.want || st.mode !== 'duel') continue;
    const w = st.want;
    steps++;
    if (w.type === 'place' && !clickedWithMouse) {
      // click the plan card on the V with the real mouse (raycast through the 3D view)
      const xy = await page.evaluate((stage) => {
        const A = window.__app, D = A.D;
        const idx = D.track.indexOf(stage);
        const m = A.table.cards.get('plan:' + idx);
        const v = m.getWorldPosition(new m.position.constructor()).project(A.camera);
        return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, idx };
      }, w.stage);
      await page.mouse.click(xy.x, xy.y);
      await page.waitForTimeout(150);
      const sel = await page.evaluate(() => window.__app.sel);
      check(sel && sel.kind === 'plan', `mouse click on the 3D V selects the stage (${sel && sel.kind})`);
      await shot(page, 'tutorial-select.png');
      await page.click('#actions button[data-id="place"]');
      clickedWithMouse = true;
      continue;
    }
    await page.evaluate((w) => {
      const A = window.__app, D = A.D;
      const find = (list, id) => list.find((x) => x.id === id);
      if (w.type === 'place') { A.onPick({ kind: 'plan', idx: D.track.indexOf(w.stage) }); A.onButton('place'); }
      else if (w.type === 'play') {
        const h = find(D.p.hand, w.card);
        A.onPick({ kind: 'hand', uid: h.uid, id: h.id });
        if (w.target) { const t = find(D.e.field, w.target); A.onPick({ kind: 'field', uid: t.uid, id: t.id }); }
        else A.onButton('play');
      } else if (w.type === 'review') A.onButton('review');
      else if (w.type === 'attack') { const u = find(D.p.team, w.unit), t = find(D.e.field, w.target); A.onPick({ kind: 'team', uid: u.uid, id: u.id }); A.onPick({ kind: 'field', uid: t.uid, id: t.id }); }
      else if (w.type === 'fix') { const s = D.placed.find((x) => x && x.id === w.stage); const bug = s.bugs.find((x) => x.found); A.onPick({ kind: 'bug', idx: s.idx, bid: bug.bid }); A.onButton('fix'); }
      else if (w.type === 'endTurn') A.onButton('end');
    }, w);
  }
  const res = await page.evaluate(() => ({ cleared: JSON.parse(localStorage.getItem('koteiduel.v1')).progress.cleared, lessons: Object.keys(JSON.parse(localStorage.getItem('koteiduel.v1')).progress.lessons).length }));
  check(clickedWithMouse, 'a stage was placed by clicking the 3D table');
  check(guardDialog, 'the cut-in dialog appeared and the guard was used');
  check(resultSeen, 'the result dialog appeared');
  check(quizSeen === 3, `3 quiz questions (${quizSeen})`);
  check(res.cleared.ch1 === 3, `chapter 1 cleared with 3 stars (${res.cleared.ch1})`);
  check(res.lessons >= 4, `lessons collected in the book (${res.lessons})`);
  check(await page.locator('.chap').nth(1).isEnabled(), 'chapter 2 is now open');
  check(errors.length === 0, `no errors in the tutorial${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

// ---------- 3. chapters 2–9 played by the bot on the page ----------
{
  const { page, errors } = await open('?fast&nodemo&unlock&seed=4');
  for (const ch of ['ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9']) {
    const r = await page.evaluate(async (ch) => {
      const A = window.__app;
      const { playTurn } = await import('./tools/bot.mjs');
      // answer every dialog / bubble at once (take the primary button), like a quick player
      const click = () => {
        const bb = document.querySelector('#bubble:not(.hidden) .bbtn button'); if (bb) bb.click();
        const m = document.getElementById('modal');
        if (!m.classList.contains('hidden')) { const tag = m.querySelector('.tag')?.textContent || ''; if (tag.includes('つぎは')) return 'next'; (m.querySelector('.btns button.primary:not([disabled])') || m.querySelector('.btns button:not([disabled])'))?.click(); }
        return null;
      };
      const iv = setInterval(click, 20);
      A.startChapter(ch);
      await new Promise((r) => { const t = setInterval(() => { if (A.mode === 'duel' && A.D.canAct()) { clearInterval(t); r(); } }, 20); });
      const D = A.D;
      const seen = new Set();
      const orig = A.present.bind(A);
      A.present = async (ev, DD) => { seen.add(ev.type); return orig(ev, DD); };
      while (!D.over) {
        await playTurn(D, 'good');
        if (D.over) break;
        await D.endTurn();
      }
      A.refresh();
      const done = A.finish();
      let tags = new Set();
      await new Promise((r) => { const t = setInterval(() => { const tag = document.querySelector('#modal .tag')?.textContent || ''; if (tag) tags.add(tag); if (tag.includes('つぎは')) { clearInterval(t); r(); } }, 15); });
      clearInterval(iv);
      document.querySelector('#modal .btns button:last-child').click(); // タイトルへ
      await done;
      return { over: D.over, turn: D.turn, trust: D.trust, events: seen.size, tags: [...tags].join('|') };
    }, ch);
    check(r.over && /クリア|ざんねん/.test(r.tags) && r.tags.includes('クイズ'), `${ch}: the bot finished the duel on the page (${r.over}, turn ${r.turn}, trust ${r.trust}, ${r.events} kinds of events animated) → result → quiz`);
    if (ch === 'ch7') await shot(page, 'ch7-end.png');
  }
  check(errors.length === 0, `no errors in chapters 2–9${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
  await page.close();
}

// ---------- 4. settings ----------
{
  const { page, errors } = await open('?nodemo');
  const rtVisible = () => page.evaluate(() => getComputedStyle(document.querySelector('.lead rt')).display !== 'none');
  check(await rtVisible(), 'furigana shown by default');
  const sel = page.locator('#settings select').first();
  await sel.selectOption('false');
  check(!(await rtVisible()), 'furigana off hides the readings');
  await page.reload();
  await page.waitForFunction(() => window.__app);
  check(!(await rtVisible()), 'the setting is remembered');
  check(errors.length === 0, `no errors with settings${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

// ---------- 5. a phone held upright ----------
{
  const { page, errors } = await open('?nodemo&unlock&chapter=ch4&seed=2', { width: 390, height: 844 });
  await page.waitForSelector('#modal:not(.hidden)');
  await page.click('#modal .btns button.primary');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);
    if (await vis(page, '#bubble .bbtn button')) await page.click('#bubble .bbtn button');
    else if (await vis(page, '#modal .btns button.primary')) await page.click('#modal .btns button.primary');
    else if (await page.evaluate(() => window.__app.D.canAct())) break;
  }
  const box = await page.locator('#side').boundingBox();
  check(box && box.y > 400 && box.width > 380, `the panel is a bottom sheet on a phone (y ${box && Math.round(box.y)})`);
  // tap the next stage on the V with a finger
  const tapped = await page.evaluate(() => { const A = window.__app; A.onPick({ kind: 'plan', idx: A.D.ptr }); return !!A.sel; });
  check(tapped, 'a stage can be selected on the phone');
  await shot(page, 'phone.png');
  check(errors.length === 0, `no errors on the phone${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

await b.close();
srv.close();
console.log(ok ? 'smoke: all ok' : 'smoke: FAILED');
process.exit(ok ? 0 : 1);
