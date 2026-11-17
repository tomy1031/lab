#!/usr/bin/env node
// Free-talk room, end to end in the browser against a fake Gemini Live server (no API key, no network):
// the setup board, おまかせ, the partner's opener in its "Live voice", two learner turns judged with a
// better way to say it, a topic change, and the feedback page.
//   node tests/free.mjs [--shots <dir>] [--partner sakamoto --place cafe]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const shotsAt = arg('--shots');
if (shotsAt) fs.mkdirSync(shotsAt, { recursive: true });

const srv = await serve(0);
const url = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push(m.text()); });

// A fake Gemini Live: speaks when the app sends a [START]/[TOPIC]/[TWIST]/[NUDGE] note, judges after ~1.5 s of
// learner audio, replies after the function response, writes the report on [END].
await page.addInitScript(() => {
  const Real = window.WebSocket;
  const silence = (sec) => { const b = new Uint8Array(Math.round(24000 * 2 * sec)); let s = ''; for (let i = 0; i < b.length; i += 1) s += String.fromCharCode(b[i]); return btoa(s); };
  const SAY = ['こんにちは。きょうは いい てんきですね。', 'へえ、そうですか。どこへ 行きましたか。', 'いいですね。また はなしましょう。'];
  window.__fakeLive = { notes: [], setups: [], judged: 0 };
  class FakeLive {
    constructor(u) {
      if (!/generativelanguage/.test(u)) return new Real(u);
      this.readyState = 0; this.n = 0; this.k = 0; this.counting = false;
      setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 5);
    }
    emit(o) { this.onmessage?.({ data: JSON.stringify(o) }); }
    speak(text) {
      const audio = silence(0.6);
      setTimeout(() => { this.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: audio } }] }, outputTranscription: { text } } }); this.emit({ serverContent: { turnComplete: true } }); }, 120);
    }
    send(s) {
      const m = JSON.parse(s);
      if (m.setup) { window.__fakeLive.setups.push(m.setup); setTimeout(() => this.emit({ setupComplete: {} }), 5); return; }
      const note = m.clientContent?.turns?.[0]?.parts?.[0]?.text || '';
      if (note) window.__fakeLive.notes.push(note);
      if (/^\[TURN/.test(note)) { this.counting = true; this.n = 0; }
      if (m.clientContent?.turnComplete && /^\[(START|TOPIC|TWIST|NUDGE)\]/.test(note)) { this.speak(SAY[this.k++ % SAY.length]); return; }
      if (m.clientContent?.turnComplete && /^\[END\]/.test(note)) {
        setTimeout(() => this.emit({ toolCall: { functionCalls: [{ id: 'rep', name: 'final_report', args: { stars: 2, summary_en: 'Nice chat!', strengths_en: 'You answered every question.', improve_en: 'Use に for places.', corrections: [{ heard: 'こうえん いきました', better: 'こうえんに 行きました。', tip_en: 'Use に (or へ) for where you go.' }], next_words: [{ ja: '週末', kana: 'しゅうまつ', en: 'weekend' }], good_ja: ['たのしかったです'], level_en: 'Solid N5.' } }] } }), 20);
        return;
      }
      if (m.realtimeInput?.audio && this.counting && ++this.n === 15) {
        this.counting = false;
        const j = window.__fakeLive.judged;
        const heard = j % 2 ? 'たのしかったです' : 'こうえん いきました';
        this.emit({ serverContent: { inputTranscription: { text: heard } } });
        setTimeout(() => this.emit({ toolCall: { functionCalls: [{ id: `j${j}`, name: 'judge_reply', args: { heard, branch: 'free', score: j % 2 ? 3 : 1, correction: j % 2 ? heard : 'こうえんに 行きました。', tip_en: 'Use に for places.' } }] } }), 30);
        window.__fakeLive.judged += 1;
      }
      if (m.toolResponse?.functionResponses?.[0]?.name === 'judge_reply') {
        setTimeout(() => this.emit({ serverContent: { turnComplete: true } }), 10);
        if (m.toolResponse.functionResponses[0].response.say !== 'nothing') this.speak(SAY[this.k++ % SAY.length]);
      }
    }
    close() { this.readyState = 3; setTimeout(() => this.onclose?.({ code: 1000, reason: '' }), 1); }
  }
  FakeLive.OPEN = 1;
  window.WebSocket = FakeLive;
});

let failed = 0;
const check = (ok, msg) => { if (ok) console.log(`✓ ${msg}`); else { failed += 1; console.log(`✗ ${msg}`); } };
const shot = async (name) => {
  if (!shotsAt) return;
  await page.screenshot({ path: path.join(shotsAt, name), timeout: 180000 });
  // the panels themselves, at full resolution (board + turn card)
  const pngs = await page.evaluate(() => ({ board: window.KT.board?.panel.visible ? window.KT.board.panel.canvas.toDataURL('image/png') : null, turn: window.KT.turn?.panel.visible ? window.KT.turn.panel.canvas.toDataURL('image/png') : null }));
  for (const [k, v] of Object.entries(pngs)) if (v) fs.writeFileSync(path.join(shotsAt, name.replace('.png', `-${k}.png`)), Buffer.from(v.split(',')[1], 'base64'));
};
const until = async (fn, ms = 60000, arg2) => page.waitForFunction(fn, arg2, { timeout: ms });

try {
  await page.goto(url);
  await until('window.KT && window.KT.ready', 90000);
  await page.evaluate(() => { window.KT.store.settings.noSynth = true; window.KT.store.apiKey = 'test-key'; });
  await page.click('#play-pc');
  await until('window.KT.state.where === "town"');
  const sel = await page.evaluate(() => window.KT.free());
  check(!!sel?.partner, `free-talk tab shows the setup (${sel?.partner} · ${sel?.place})`);
  await page.waitForTimeout(500);
  await shot('free-1-setup.png');
  const partner = arg('--partner'); const place = arg('--place');
  const picked = await page.evaluate(([p, pl]) => window.KT.free(p ? { partner: p, place: pl || 'cafe', topic: 1 } : {}), [partner, place]);
  await page.evaluate(() => { window.KT.startFree(); });
  await until('window.KT.state.where === "free" && window.KT.runner && window.KT.runner.listening', 90000);
  const setup = await page.evaluate(() => window.__fakeLive.setups[0]);
  check(/FREE CONVERSATION/.test(setup?.systemInstruction?.parts?.[0]?.text || ''), `Live got the free-talk instruction for ${picked.partner} at ${picked.place}`);
  check(setup?.inputAudioTranscription?.languageCodes?.[0] === 'ja-JP', 'speech recognition is set to Japanese');
  const opened = await page.evaluate(() => window.__fakeLive.notes.some((n) => n.startsWith('[START]')));
  check(opened, 'the partner opened the conversation');
  await page.waitForTimeout(300);
  await shot('free-2-talk.png');
  // two learner turns (the fake mic sends audio; the fake Live judges and replies)
  for (let i = 1; i <= 2; i++) {
    await until((n) => window.KT.runner.turns.length >= n, 60000, i);
    await until('window.KT.runner && window.KT.runner.listening', 60000);
  }
  const turns = await page.evaluate(() => window.KT.runner.turns.map((t) => [t.heard, t.score, t.correction]));
  check(turns.length >= 2 && turns[0][2] === 'こうえんに 行きました。', `learner turns judged with a better way to say it (${turns.length})`);
  await page.waitForTimeout(300);
  await shot('free-3-feedback.png');
  // a new topic
  const before = await page.evaluate(() => window.KT.runner.topic.id);
  await page.evaluate(() => window.KT.runner.newTopic());
  await until('window.KT.runner && window.KT.runner.listening', 60000);
  const after = await page.evaluate(() => ({ id: window.KT.runner.topic.id, note: window.__fakeLive.notes.some((n) => n.startsWith('[TOPIC]')) }));
  check(after.note && after.id !== before, `topic changed (${before} → ${after.id})`);
  // finish
  await page.evaluate(() => window.KT.runner.finish());
  await until('window.KT.state.where === "report" && window.KT.lastReport && window.KT.lastReport.free', 60000);
  await page.waitForTimeout(600);
  await shot('free-4-report.png');
  const rep = await page.evaluate(() => window.KT.lastReport.report);
  check(rep.source === 'live' && rep.corrections?.length && rep.words?.length, `feedback page with ${rep.corrections?.length} correction(s) and ${rep.words?.length} word(s)`);
} catch (e) {
  failed += 1;
  console.log(`✗ ${String(e).split('\n')[0]}`);
  await shot('free-fail.png').catch(() => {});
}
const kt = await page.evaluate(() => window.KT?.errors || []).catch(() => []);
const all = [...errors, ...kt];
if (all.length) console.log('ERRORS:\n' + [...new Set(all)].slice(0, 20).join('\n'));
await browser.close();
srv.close();
process.exit(failed || all.length ? 1 : 0);
