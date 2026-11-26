#!/usr/bin/env node
// Fast unit tests (no browser): judging helpers, romaji, and the Gemini Live protocol in LiveBrain
// against a fake Live server.   node tests/unit.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LiveBrain } from '../js/talk/brain.js';
import { turnNote, readJudge, offlineJudge, offlineReport, UNIVERSAL_BRANCHES, JUDGE_TOOL, freeSystemInstruction, freeTool, freeReplyInstruction, readReport, offlineFreeReport, freeEndNote } from '../js/talk/judge.js';
import { topicsFor } from '../js/talk/free.js';
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
  assert.equal(offlineJudge('わたしは リンです。カンボジアじんです。', listen).branch, 'full');
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
function fakeLive({ rejectModels = [], speakAfterTool = true, skipTool = false, rejectHints = false, speakOnNote = false } = {}) {
  const sent = [];
  class WS {
    constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 2); this.n = 0; }
    emit(o) { this.onmessage?.({ data: enc.encode(JSON.stringify(o)).buffer }); }
    send(s) {
      const m = JSON.parse(s); sent.push(m);
      if (m.setup) {
        if (rejectModels.includes(m.setup.model.replace('models/', ''))) { setTimeout(() => { this.readyState = 3; this.onclose?.({ code: 1008, reason: 'model not found' }); }, 2); return; }
        if (rejectHints && m.setup.inputAudioTranscription?.languageCodes) { setTimeout(() => { this.readyState = 3; this.onclose?.({ code: 1007, reason: 'Invalid JSON payload received. Unknown name "languageCodes"' }); }, 2); return; }
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
      const note = m.clientContent?.turns?.[0]?.parts?.[0]?.text || '';
      if (speakOnNote && m.clientContent?.turnComplete && /^\[(START|TOPIC|TWIST|NUDGE)\]/.test(note)) {
        // the character speaks on its own (free-talk room)
        setTimeout(() => { this.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] }, outputTranscription: { text: 'こんにちは。' } } }); this.emit({ serverContent: { turnComplete: true } }); }, 5);
      } else if (m.clientContent?.turnComplete) setTimeout(() => this.emit({ toolCall: { functionCalls: [{ id: 'r1', name: 'final_report', args: { stars: 2, summary_en: 'ok', strengths_en: 'a', improve_en: 'b', corrections: [{ heard: 'リンです', better: 'リンと いいます。', tip_en: 't' }], next_words: [{ ja: '週末', kana: 'しゅうまつ', en: 'weekend' }], good_ja: ['リンです'] } }] } }), 5);
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

await test('Live: a verdict that copies an example (not what was heard) is flagged', async () => {
  const { WS } = fakeLive();
  const orig = WS.prototype.send;
  // the model claims the learner said the example answer, but the transcript says something else
  WS.prototype.send = function (s) {
    const m = JSON.parse(s);
    if (m.realtimeInput?.audio && this.n === 2) {
      this.n++;
      this.emit({ serverContent: { inputTranscription: { text: 'おはようございます。きのうは ログインがめんを つくりました。' } } });
      setTimeout(() => this.emit({ toolCall: { functionCalls: [{ id: 'c9', name: 'judge_reply', args: { heard: 'あしたの ひるまでに おわる よていです。', branch: 'full', score: 3, correction: '', tip_en: '' } }] } }), 5);
      return;
    }
    return orig.call(this, s);
  };
  let judged = null;
  const b = new LiveBrain({ apiKey: 'k', lesson: fx.lesson, variant: fx.variant, character: fx.character, WebSocketImpl: WS, on: { judge: (r) => { judged = r; return 'nothing'; } } });
  await b.connect();
  b.setTurn('[TURN 1]', ['full', 'name_only']);
  for (let i = 0; i < 4; i++) b.audio('AAAA');
  await new Promise((r) => setTimeout(r, 60));
  b.close();
  assert.equal(judged.suspect, true);
  assert.match(judged.heard, /ログイン/);
});

await test('Live: no function call but the app wants a reply → the reply is requested in a note', async () => {
  const { WS, sent } = fakeLive({ skipTool: true });
  let judged = null;
  const b = new LiveBrain({ apiKey: 'k', lesson: fx.lesson, variant: fx.variant, character: fx.character, WebSocketImpl: WS, on: { judge: (r) => { judged = r; return 'react'; } } });
  await b.connect();
  b.setTurn('[TURN 1]', ['full', 'name_only']);
  for (let i = 0; i < 4; i++) b.audio('AAAA');
  await new Promise((r) => setTimeout(r, 60));
  b.close();
  assert.equal(judged.branch, 'unjudged');
  const note = sent.find((m) => m.clientContent?.turns?.[0]?.parts?.[0]?.text?.startsWith('[REPLY]'));
  assert.ok(note && note.clientContent.turnComplete === true);
  assert.match(note.clientContent.turns[0].parts[0].text, /リンです/);
});

await test('Live: transcription is set to Japanese with the scene words as hints', async () => {
  const g = await runBrain('nothing', {});
  const t = g.sent.find((m) => m.setup).setup.inputAudioTranscription;
  assert.deepEqual(t.languageCodes, ['ja-JP']);
  assert.ok(Array.isArray(t.customVocabulary) && t.customVocabulary.length > 0);
});

await test('Live: a model that refuses the hints gets a plain transcription setup', async () => {
  const g = await runBrain('nothing', { rejectHints: true });
  assert.ok(g.ok);
  const setups = g.sent.filter((m) => m.setup).map((m) => m.setup.inputAudioTranscription);
  assert.ok(setups[0].languageCodes && !setups.at(-1).languageCodes);
  assert.equal(g.judged.branch, 'name_only');
});

// ------------------------------------------------------------ free-talk room
const freeData = {
  partners: { sakamoto: { places: ['cafe'], worksAt: 'cafe', casual: false, newsJa: ['新しい ケーキを 作りました。'] } },
  topics: [
    { id: 'weekend', kind: 'chat', titleJa: 'しゅうまつ', titleEn: 'Weekend', levels: ['easy', 'normal'] },
    { id: 'order', kind: 'role', titleJa: 'ちゅうもん', titleEn: 'Ordering', levels: ['easy'], places: ['cafe'], partners: ['sakamoto'], situationEn: 'You order a coffee.' },
    { id: 'dreams', kind: 'chat', titleJa: 'ゆめ', titleEn: 'Dreams', levels: ['hard'] },
    { id: 'tickets', kind: 'role', titleJa: 'きっぷ', titleEn: 'Tickets', levels: ['easy'], places: ['station'] },
  ],
};

await test('free talk: topics fit the partner, place and level ("anything" first, specific before general)', () => {
  const ids = topicsFor(freeData, { partner: 'sakamoto', place: 'cafe', level: 'easy' }).map((t) => t.id);
  assert.deepEqual(ids, ['any', 'order', 'weekend']);
  assert.deepEqual(topicsFor(freeData, { partner: 'sakamoto', place: 'park', level: 'hard' }).map((t) => t.id), ['any', 'dreams']);
});

await test('free talk: the instruction carries persona, level, style and topic; the report asks for corrections and words', () => {
  const partner = { id: 'sakamoto', nameJa: '坂本 じろう', kana: 'さかもと じろう', roleEn: 'Owner of the café', personaJa: 'やさしい', voice: 'Charon' };
  const easy = freeSystemInstruction({ partner, info: freeData.partners.sakamoto, place: 'きっさてん (Café)', topic: freeData.topics[1], level: 'easy', style: 'polite', news: ['新しい ケーキを 作りました。'] });
  assert.match(easy, /ROLE-PLAY/);
  assert.match(easy, /N5/);
  assert.match(easy, /です\/ます/);
  assert.match(easy, /新しい ケーキ/);
  assert.match(easy, /judge_reply/);
  const casual = freeSystemInstruction({ partner, place: 'park', topic: { id: 'any' }, level: 'hard', style: 'casual', mood: 'in a playful, joking mood' });
  assert.match(casual, /playful/);
  assert.match(casual, /plain style/);
  assert.match(casual, /N3/);
  const props = freeTool().functionDeclarations[1].parameters.properties;
  assert.ok(props.corrections && props.next_words && props.good_ja && props.level_en);
  assert.ok(freeTool({ nonBlocking: true }).functionDeclarations.every((d) => d.behavior === 'NON_BLOCKING'));
  assert.match(freeReplyInstruction({ branch: 'free', heard: 'コーヒーが すきです' }, { level: 'easy' }), /コーヒーが すきです/);
  assert.match(freeReplyInstruction({ branch: 'dont_know' }, {}), /simpler/);
  assert.match(freeEndNote({ turns: [{ heard: 'a', score: 2, correction: 'b' }], topics: ['Weekend'] }), /^\[END\]/);
});

await test('free talk: the report is read with corrections and words; offline it is built from the turns', () => {
  const r = readReport({ stars: 3, summary_en: 's', strengths_en: 'a', improve_en: 'b', corrections: [{ heard: 'x', better: 'y', tip_en: 'z' }, { heard: 'q' }], next_words: [{ ja: '週末', kana: 'しゅうまつ', en: 'weekend' }], good_ja: ['いいです'], level_en: 'N5' });
  assert.equal(r.free, true);
  assert.deepEqual(r.corrections, [{ heard: 'x', better: 'y', tipEn: 'z' }]);
  assert.equal(r.words[0].kana, 'しゅうまつ');
  assert.equal(r.levelEn, 'N5');
  const off = offlineFreeReport([{ heard: 'コーヒー すき', score: 1, correction: 'コーヒーが すきです。', tipEn: 'Add が.' }, { heard: 'はい', score: 3, correction: 'はい' }], [{ ja: '週末', en: 'weekend' }]);
  assert.equal(off.corrections.length, 1);
  assert.equal(off.good[0], 'はい');
  assert.equal(off.words[0].ja, '週末');
});

await test('Live: free talk — the partner opens on its own, replies by the custom instruction, writes the free report', async () => {
  const { WS, sent } = fakeLive({ speakOnNote: true });
  const got = { audio: 0, done: 0, text: '' };
  const b = new LiveBrain({
    apiKey: 'k', lesson: { vocab: [] }, variant: { characters: ['sakamoto'] }, character: fx.character, WebSocketImpl: WS,
    instruction: 'FREE ROOM', tools: (o) => freeTool(o), replyInstruction: (r) => `CUSTOM ${r.heard}`, extraVocab: ['週末'], replySeconds: { chat: 20 },
    on: { judge: () => 'chat', npcAudio: () => got.audio++, npcDone: () => got.done++, npcText: (t) => { got.text += t; } },
  });
  assert.ok(await b.connect());
  const setup = sent.find((m) => m.setup).setup;
  assert.equal(setup.systemInstruction.parts[0].text, 'FREE ROOM');
  assert.ok(setup.tools[0].functionDeclarations[1].parameters.properties.corrections);
  assert.ok(setup.inputAudioTranscription.customVocabulary.includes('週末'));
  assert.ok(b.speak('[START] Greet the learner.'));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(got.audio, 1);
  assert.equal(got.done, 1);
  assert.equal(got.text, 'こんにちは。');
  b.setTurn('[TURN 1] free', ['free']);
  for (let i = 0; i < 4; i++) b.audio('AAAA');
  await new Promise((r) => setTimeout(r, 80));
  const resp = sent.find((m) => m.toolResponse).toolResponse.functionResponses[0].response;
  assert.equal(resp.say, 'chat');
  assert.equal(resp.instruction, 'CUSTOM リンです。');
  assert.equal(b.maxBytes, 24000 * 2 * 20);
  const report = await b.report('[END] now', 500);
  assert.equal(report.free, true);
  assert.equal(report.corrections[0].better, 'リンと いいます。');
  b.close();
});

await test('base64 silence is exactly 100 ms at 16 kHz', () => {
  assert.equal(Buffer.from(`${'A'.repeat(4267)}=`, 'base64').length, 3200);
});

console.log(`\n${pass} passed`);
