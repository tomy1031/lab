#!/usr/bin/env node
// Fast unit tests (no browser): judging helpers, romaji, and the Gemini Live protocol in LiveBrain
// against a fake Live server.   node tests/unit.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LiveBrain } from '../js/talk/brain.js';
import { turnNote, readJudge, offlineJudge, offlineReport, UNIVERSAL_BRANCHES, JUDGE_TOOL } from '../js/talk/judge.js';
import { toRomaji } from '../js/content/index.js';
import { closeReason, resample, floatToPcm16, bytesToBase64, pcm16Base64ToFloat } from '../js/talk/live.js';

let pass = 0;
const test = async (name, fn) => { try { await fn(); pass++; console.log(`✓ ${name}`); } catch (e) { console.log(`✗ ${name}\n  ${e.stack}`); process.exitCode = 1; } };
const fx = JSON.parse(fs.readFileSync(new URL('../tools/selfcheck.json', import.meta.url)));
const listen = { ...fx.turn.listen, hintJa: 'h' };

await test('romaji', () => {
  assert.equal(toRomaji('わたしは リンです。'), 'watashi wa rindesu.');
  assert.equal(toRomaji('きょうしつ'), 'kyoushitsu');
  assert.equal(toRomaji('ちょっと'), 'chotto');
  assert.equal(toRomaji('コーヒー'), 'koohii');
});

await test('readJudge normalises and rejects unknown branches', () => {
  const r = readJudge({ heard: ' リンです ', branch: 'Name_Only', score: 7, grammar_used: 'g1, g9', correction: 'x', tip_en: 't' }, ['full', 'name_only']);
  assert.equal(r.branch, 'name_only');
  assert.equal(r.score, 3);
  assert.deepEqual(r.grammarUsed, ['g1', 'g9']);
  assert.equal(readJudge({ branch: 'teleport' }, ['full']).branch, 'unclear');
  for (const b of UNIVERSAL_BRANCHES) assert.equal(readJudge({ branch: b }, []).branch, b);
});

await test('offline judge picks the nearest branch example', () => {
  assert.equal(offlineJudge('わたしは リンです。ベトナムじんです。', listen).branch, 'full');
  assert.equal(offlineJudge('リンです。', listen).branch, 'name_only');
  assert.equal(offlineJudge('もう いちど おねがいします', listen).branch, 'repeat');
  assert.equal(offlineJudge('I am Lin', listen).branch, 'english');
  assert.equal(offlineJudge('', listen).branch, 'unclear');
  assert.ok(offlineReport([{ score: 3 }, { score: 3 }]).stars === 3);
});

await test('turn note names who spoke and lists branches', () => {
  const note = turnNote({ k: 2, character: fx.character, npcLines: [{ name: '小川', ja: 'おはよう。', en: 'Morning.' }], listen, grammar: fx.lesson.grammar });
  assert.match(note, /\[TURN 2\]/);
  assert.match(note, /小川: 「おはよう。」/);
  assert.match(note, /- full: /);
  assert.equal(JUDGE_TOOL.functionDeclarations.map((f) => f.name).join(), 'judge_reply,final_report');
});

await test('PCM helpers round-trip', () => {
  const f = new Float32Array([0, 0.5, -0.5, 0.25]);
  const back = pcm16Base64ToFloat(bytesToBase64(new Uint8Array(floatToPcm16(f).buffer)));
  for (let i = 0; i < f.length; i++) assert.ok(Math.abs(back[i] - f[i]) < 1e-3);
  assert.equal(resample(new Float32Array(48000), 48000, 16000).length, 16000);
  assert.equal(closeReason({ code: 1008, reason: 'API key not valid' }), 'badKey');
  assert.equal(closeReason({ code: 1011, reason: 'You exceeded your current quota' }), 'rateLimited');
});

// ---------------------------------------------------------------- fake Live
const enc = new TextEncoder();
function fakeLive({ rejectModels = [], speakAfterTool = true, skipTool = false } = {}) {
  const sent = [];
  class WS {
    constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 2); this.n = 0; }
    emit(o) { this.onmessage?.({ data: enc.encode(JSON.stringify(o)).buffer }); }
    send(s) {
      const m = JSON.parse(s); sent.push(m);
      if (m.setup) {
        if (rejectModels.includes(m.setup.model.replace('models/', ''))) { setTimeout(() => { this.readyState = 3; this.onclose?.({ code: 1008, reason: 'model not found' }); }, 2); return; }
        setTimeout(() => this.emit({ setupComplete: {} }), 2);
      }
      if (m.realtimeInput?.audio && ++this.n === 3) {
        this.emit({ serverContent: { inputTranscription: { text: 'リンです' } } });
        if (skipTool) setTimeout(() => this.emit({ serverContent: { turnComplete: true } }), 5);
        else setTimeout(() => this.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'judge_reply', args: { heard: 'リンです。', branch: 'name_only', score: 2, correction: 'リンです。', tip_en: 'Add your country.' } }] } }), 5);
      }
      if (m.toolResponse && m.toolResponse.functionResponses[0].name === 'judge_reply') {
        // the function-call turn closes first, then (maybe) the spoken reply follows
        setTimeout(() => this.emit({ serverContent: { turnComplete: true } }), 3);
        if (speakAfterTool) setTimeout(() => { this.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] }, outputTranscription: { text: 'そうですか。' } } }); this.emit({ serverContent: { turnComplete: true } }); }, 15);
      }
      if (m.clientContent?.turnComplete) setTimeout(() => this.emit({ toolCall: { functionCalls: [{ id: 'r1', name: 'final_report', args: { stars: 2, summary_en: 'ok', strengths_en: 'a', improve_en: 'b' } }] } }), 5);
    }
    close() { this.readyState = 3; setTimeout(() => this.onclose?.({ code: 1000, reason: '' }), 1); }
  }
  return { WS, sent };
}

async function runBrain(decide, opts) {
  const { WS, sent } = fakeLive(opts);
  const got = { judged: null, audio: 0, done: 0, text: '' };
  const b = new LiveBrain({
    apiKey: 'k', lesson: fx.lesson, variant: fx.variant, character: fx.character, WebSocketImpl: WS,
    on: { judge: (r) => { got.judged = r; return decide; }, npcAudio: () => got.audio++, npcDone: () => got.done++, npcText: (t) => { got.text += t; } },
  });
  got.ok = await b.connect();
  b.setTurn(turnNote({ k: 1, character: fx.character, npcLines: [], listen, grammar: fx.lesson.grammar }), ['full', 'name_only']);
  for (let i = 0; i < 4; i++) b.audio('AAAA');
  await new Promise((r) => setTimeout(r, 80));
  got.report = await b.report('[END]', 500);
  got.model = b.model; got.sent = sent;
  b.close();
  return got;
}

await test('Live: falls back to the next model, judges, keeps quiet on "nothing"', async () => {
  const g = await runBrain('nothing', { rejectModels: ['gemini-3.8-live'] });
  assert.ok(g.ok);
  assert.equal(g.model, 'gemini-3.1-flash-live-preview');
  assert.equal(g.judged.branch, 'name_only');
  assert.equal(g.audio, 0);
  assert.equal(g.sent.find((m) => m.toolResponse).toolResponse.functionResponses[0].response.say, 'nothing');
  assert.equal(g.report.stars, 2);
  const setup = g.sent.find((m) => m.setup).setup;
  assert.ok(!('thinkingConfig' in setup.generationConfig) && !('proactivity' in setup), 'never send settings 3.8 rejects');
  assert.ok(setup.inputAudioTranscription && setup.realtimeInputConfig.automaticActivityDetection);
});

await test('Live: "react" plays the reply that arrives after the function-call turn closes', async () => {
  const g = await runBrain('react', {});
  assert.equal(g.audio, 1);
  assert.equal(g.done, 1);
  assert.equal(g.text, 'そうですか。');
});

await test('Live: no function call → judged from the transcript', async () => {
  const g = await runBrain('nothing', { skipTool: true });
  assert.equal(g.judged.branch, 'unjudged');
  assert.equal(g.judged.heard, 'リンです');
});

console.log(`\n${pass} passed`);
