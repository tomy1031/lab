// LiveBrain — one Gemini Live session per scenario: it hears the learner, judges every answer through
// the `judge_reply` function, and (only when the app allows it) answers in the main character's voice.
// The app owns the script and the speakers: model audio is forwarded only after the app decided "react"
// or "chat" for that turn; everything else the model says is dropped. No DOM, no Web Audio here, so the
// same class runs in Node for the API self-check (tools/live_selfcheck.mjs).
import { connectLive, LIVE_MODELS, isThinkingModel } from './live.js';
import { judgeTool, systemInstruction, readJudge, readReport, similarity } from './judge.js';
import { resolveCharacter } from '../content/lines.js';

const noop = () => {};
const transcriptionHints = (words) => (words.length ? { languageCodes: ['ja-JP'], customVocabulary: words } : { languageCodes: ['ja-JP'] });

export class LiveBrain {
  /**
   * @param {object} o
   * @param {string} o.apiKey
   * @param {object} o.lesson, o.variant, o.character   resolved content
   * @param {string} [o.learnerName]
   * @param {number} [o.silenceMs]  how long a pause ends the learner's turn (beginners pause a lot)
   * @param {string} [o.thinkingLevel]  LOW | MEDIUM | HIGH for models that reason in the background
   * @param {object} o.on  callbacks: status(s, detail), heard(text), npcAudio(b64), npcText(text),
   *        npcDone(), judge(result) → 'nothing'|'react'|'chat', error(reason)
   * Free-talk room (no script): o.instruction replaces the system instruction, o.tools(opts) the functions,
   * o.replyInstruction(result, say) what the partner is told to answer, o.extraVocab more words for the
   * speech recogniser, o.temperature, o.replySeconds { react, chat } the longest reply.
   */
  constructor(o) {
    this.o = o;
    this.on = { status: noop, heard: noop, npcAudio: noop, npcText: noop, npcDone: noop, judge: () => 'nothing', error: noop, ...o.on };
    this.session = null;
    this.model = null;
    this.valid = [];
    this.gate = 'drop'; // drop | play  — what to do with model audio right now
    this.heardText = '';
    this.judgedThisTurn = false;
    this.pendingReport = null;
    this.resumeHandle = null;
    this.closed = false;
    this.lastNote = '';
    this.awaitingJudge = false;
    this.judgeAt = 0;
    this.played = 0;
    this.maxBytes = Infinity;
    this.cancelled = new Set();
  }

  /**
   * Words the speech recogniser should expect in this scene: people's names, the learner's name and the
   * lesson's key words. Sent as transcription hints together with the language (Japanese).
   */
  vocabulary() {
    const { lesson, variant, learnerName, character } = this.o;
    const out = [];
    for (const c of [character, ...(variant.characters || [])]) {
      const r = typeof c === 'object' && c?.nameJa ? c : resolveCharacter(c);
      if (!r) continue;
      const [family, given] = (r.nameJa || '').split(/\s+/);
      out.push(family, given && `${family}さん`, (r.kana || '').split(/\s+/)[0]);
    }
    if (learnerName) out.push(learnerName);
    for (const v of lesson.vocab || []) out.push(v.ja);
    for (const w of this.o.extraVocab || []) out.push(w);
    return [...new Set(out.filter((w) => w && [...w].length <= 20))].slice(0, 40);
  }

  setup(model = '') {
    const { lesson, variant, character, learnerName, silenceMs = 1300 } = this.o;
    const thinking = isThinkingModel(model);
    const setup = {
      generationConfig: {
        responseModalities: ['AUDIO'],
        temperature: this.o.temperature ?? 0.5,
        speechConfig: { languageCode: 'ja-JP', voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voice } } },
        // only the thinking model takes this; others reject it
        ...(thinking ? { thinkingConfig: { thinkingLevel: this.o.thinkingLevel || 'MEDIUM' } } : {}),
      },
      systemInstruction: { parts: [{ text: this.o.instruction || systemInstruction({ lesson, variant, character, learnerName }) }] },
      // the thinking model only accepts non-blocking functions
      tools: [this.o.tools ? this.o.tools({ nonBlocking: thinking }) : judgeTool({ interview: lesson.format === 'interview', nonBlocking: thinking })],
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          prefixPaddingMs: 300,
          silenceDurationMs: silenceMs,
        },
      },
      // The learner always speaks Japanese (with an accent): tell the recogniser, so it does not guess
      // another language. Models that do not know these fields get a plain setup (see connect()).
      inputAudioTranscription: this.plainTranscription ? {} : transcriptionHints(this.vocabulary()),
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
    };
    return setup;
  }

  handlers() {
    return {
      onAudio: (b64) => {
        this.trace('audio');
        if (this.gate === 'armed') { this.gate = 'play'; clearTimeout(this.armTimer); }
        if (this.gate === 'play') {
          this.played += Math.floor(b64.length * 3 / 4);
          if (this.played > this.maxBytes) { this.gate = 'drop'; this.on.npcDone(false); return; }
          this.on.npcAudio(b64);
        }
      },
      onOutputText: (t) => { this.trace(`out:${t}`); if (this.gate === 'play' || this.gate === 'armed') this.on.npcText(t); },
      onInputText: (t) => {
        // Transcript fragments that trail in right after a verdict belong to the judged utterance.
        if (!this.judgePending && Date.now() - this.judgeAt < 2500) return;
        this.trace(`in:${t}`);
        this.lastHeardAt = Date.now();
        this.heardText += t;
        this.awaitingJudge = true;
        this.on.heard(this.heardText);
      },
      onToolCall: (calls) => this.toolCalls(calls),
      onTurnComplete: () => this.turnComplete(),
      onInterrupted: () => { this.trace('interrupted'); if (this.gate === 'play') this.on.npcDone(true); this.gate = 'drop'; },
      onResumption: (h) => { this.resumeHandle = h; },
      onGoAway: () => { this.reconnect('goAway'); },
      onClose: (reason, ev) => {
        this.trace(`close ${ev?.code ?? ''} ${String(ev?.reason ?? '').slice(0, 80)}`);
        // a reply that was playing or about to play will not finish: let the conversation go on
        if (this.gate !== 'drop') { this.gate = 'drop'; clearTimeout(this.armTimer); this.on.npcDone(true); }
        if (!this.closed) this.reconnect(reason === 'badKey' ? 'closed' : reason);
      },
      onToolCancel: (ids) => { this.trace(`toolCancel ${ids.join(',')}`); for (const id of ids) this.cancelled.add(id); },
      // debugging aid (self-checks): which message types arrive, without the audio payloads
      onRaw: this.o.traceRaw ? (msg) => {
        const sc = msg.serverContent;
        const parts = (sc?.modelTurn?.parts || []).map((p) => Object.keys(p).filter((k) => k !== 'inlineData' || !p.inlineData?.data).join('+') || 'audio');
        const keys = Object.keys(msg).filter((k) => k !== 'serverContent');
        const scKeys = sc ? Object.keys(sc).filter((k) => k !== 'modelTurn') : [];
        if (!parts.every((p) => p === 'audio') || keys.length || scKeys.length) this.trace(`raw ${keys.join(',')}${sc ? ` sc{${[...scKeys, parts.length ? `parts:${[...new Set(parts)].join('|')}` : ''].filter(Boolean).join(',')}}` : ''}${msg.toolCall ? ` ${JSON.stringify(msg.toolCall).slice(0, 90)}` : ''}`);
      } : undefined,
      onInteraction: (st) => {
        this.trace(`status:${st}`);
        this.idle = /IDLE/i.test(st);
        if (this.idle && this.fallbackTimer) { clearTimeout(this.fallbackTimer); this.fallbackTimer = setTimeout(() => this.fallbackJudge(), 1200); }
      },
    };
  }

  async connect() {
    this.on.status('connecting');
    const open = () => connectLive({
      apiKey: this.o.apiKey, setup: (model) => this.setup(model), handlers: this.handlers(),
      models: this.o.models || LIVE_MODELS, preferred: this.o.model, WebSocketImpl: this.o.WebSocketImpl,
    });
    let res = await open();
    if (!res.ok && !this.plainTranscription && res.tried.some((t) => t.endsWith(':invalidSetup'))) {
      // an older model refused the transcription language/vocabulary fields: connect without them
      this.trace('setup refused → plain transcription');
      this.plainTranscription = true;
      res = await open();
    }
    if (!res.ok) {
      this.on.status('offline', res.reason);
      this.on.error(res.reason, res.tried);
      return false;
    }
    this.session = res.session;
    this.model = res.model;
    this.thinking = isThinkingModel(res.model);
    this.on.status('live', res.model);
    this.keepAlive();
    return true;
  }

  async reconnect(why) {
    if (this.closed || this.reconnecting) return;
    this.reconnecting = true;
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
    this.on.status('reconnecting', why);
    const ok = await this.connect();
    this.reconnecting = false;
    if (ok && !this.resumeHandle && this.lastNote) this.session.sendText(this.lastNote, false);
  }

  get live() { return !!this.session?.open; }

  /** Give the model the context for the coming learner turn. */
  setTurn(note, validBranches) {
    this.valid = validBranches;
    this.lastNote = note;
    this.heardText = '';
    this.judgedThisTurn = false;
    this.awaitingJudge = false;
    clearTimeout(this.fallbackTimer); this.fallbackTimer = null;
    this.gate = 'drop';
    this.session?.sendText(note, false);
  }

  /** 16 kHz PCM16 base64 from the mic (only while the learner may talk). */
  audio(b64) { this.lastSent = Date.now(); this.session?.sendAudio(b64); }

  /** Live closes a session after ~20 s without client messages: send 100 ms of silence every 8 s. */
  keepAlive() {
    clearInterval(this.keepTimer);
    const silence = `${'A'.repeat(4267)}=`; // base64 of 3200 zero bytes = 100 ms at 16 kHz
    this.keepTimer = setInterval(() => {
      if (this.closed || !this.live) return;
      if (Date.now() - (this.lastSent || 0) > 8000) { this.lastSent = Date.now(); this.session.sendAudio(silence); }
    }, 2000);
  }

  /** The mic stops sending (NPC talking). */
  micPause() { this.session?.sendAudioStreamEnd(); }

  toolCalls(calls) {
    this.trace(`toolCall:${calls.map((c) => c.name).join(',')}`);
    for (const call of calls) {
      if (call.name === 'judge_reply') {
        // The speech-to-text of the learner's words can trail the verdict by a moment: give it up to
        // 0.8 s, so the cross-check below has something to compare against.
        this.judgePending = true;
        const t0 = Date.now();
        const go = () => {
          if (!this.heardText.trim() && Date.now() - t0 < 800 && !this.closed) { setTimeout(go, 100); return; }
          this.judgePending = false;
          this.finishJudge(call);
        };
        go();
      } else if (call.name === 'final_report') {
        const report = readReport(call.args);
        this.gate = 'drop';
        this.session?.sendToolResponse([{ id: call.id, name: call.name, response: { ok: true, say: 'nothing' } }]);
        this.pendingReport?.(report);
        this.pendingReport = null;
      } else {
        this.session?.sendToolResponse([{ id: call.id, name: call.name, response: { ok: false, error: 'unknown function' } }]);
      }
    }
  }

  finishJudge(call) {
    if (this.cancelled.has(call.id)) { this.trace(`skip cancelled ${call.id}`); return; } // the server dropped this call
    const result = readJudge(call.args, this.valid);
    // Cross-check with the separate speech-to-text: a verdict whose "heard" is not what the
    // transcript says (e.g. the model copied an example answer) is not trusted.
    const asr = this.heardText.trim();
    if (asr) result.asr = asr;
    if (!result.heard) result.heard = asr;
    else if ([...asr].length >= 4 && similarity(result.heard, asr) < 0.4) {
      result.suspect = true;
      this.trace(`suspect: heard「${result.heard}」 asr「${asr}」`);
      result.heard = asr;
    }
    this.judgedThisTurn = true;
    this.awaitingJudge = false;
    clearTimeout(this.fallbackTimer); this.fallbackTimer = null;
    this.trace(`judged ${this.lastHeardAt ? Date.now() - this.lastHeardAt : '?'} ms after the last words`);
    this.judgeAt = Date.now();
    let say = 'nothing';
    try { say = this.on.judge(result) || 'nothing'; } catch (e) { console.error(e); }
    this.trace(`judge:${result.branch}/${result.score} → ${say}`);
    // 'armed': the reply has not started yet. A turnComplete that closes the function-call turn
    // can arrive before the reply audio, so only audio switches the gate to 'play'.
    this.gate = say === 'nothing' ? 'drop' : 'armed';
    clearTimeout(this.armTimer);
    if (this.gate === 'armed') this.armTimer = setTimeout(() => { if (this.gate === 'armed') { this.gate = 'drop'; this.on.npcDone(false); } }, this.thinking ? 15000 : 7000);
    const response = { ok: true, say };
    const custom = say !== 'nothing' && this.o.replyInstruction ? this.o.replyInstruction(result, say) : '';
    if (custom) response.instruction = custom;
    else if (say === 'react') {
      response.instruction = `Reply in character to what the learner just said (${result.heard ? `「${result.heard}」` : 'see audio'}): ONE short polite Japanese sentence, at most 15 words, that answers their question or comment directly. Do not greet, do not introduce yourself, do not ask a question, do not continue the script.`;
    } else if (say === 'chat') {
      response.instruction = `Reply in character to 「${result.heard}」 with 1–2 short polite Japanese sentences at the learner's level, then ask one simple question back. No greetings.`;
    }
    this.played = 0;
    this.maxBytes = this.replyBytes(say); // hard cap on reply length
    this.heardText = '';
    this.session?.sendToolResponse([{ id: call.id, name: call.name, response }]);
  }

  turnComplete() {
    this.trace(`turnComplete(${this.gate})`);
    if (this.gate === 'armed') return; // the reply is still to come
    if (this.gate === 'play') this.on.npcDone(false);
    this.gate = 'drop';
    // The model finished a turn without judging although the learner spoke: judge from the transcript.
    // A thinking model may still be reasoning (turnComplete is not "idle" for it): give it time first.
    if (this.awaitingJudge && !this.judgePending && this.heardText.trim()) {
      if (this.thinking) {
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = setTimeout(() => this.fallbackJudge(), this.idle ? 4000 : 14000);
        return;
      }
      this.fallbackJudge();
    }
  }

  /** No verdict came for what the learner said: judge from the transcript. */
  fallbackJudge() {
    this.fallbackTimer = null;
    if (this.awaitingJudge && !this.judgePending && this.heardText.trim()) {
      const heard = this.heardText.trim();
      this.heardText = '';
      this.awaitingJudge = false;
      this.judgeAt = Date.now();
      let say = 'nothing';
      try { say = this.on.judge({ heard, branch: 'unjudged', score: 1, grammarUsed: [], correction: '', tipEn: '', source: 'transcript' }) || 'nothing'; } catch (e) { console.error(e); }
      this.trace(`fallback judge → ${say}`);
      if (say !== 'nothing') {
        // there is no function call to answer, so ask for the reply in a note
        this.gate = 'armed';
        this.played = 0;
        this.maxBytes = this.replyBytes(say);
        clearTimeout(this.armTimer);
        this.armTimer = setTimeout(() => { if (this.gate === 'armed') { this.gate = 'drop'; this.on.npcDone(false); } }, 7000);
        const custom = this.o.replyInstruction ? this.o.replyInstruction({ heard, branch: 'free', score: 1 }, say) : '';
        this.session?.sendText(custom ? `[REPLY] The learner said 「${heard}」. ${custom}` : say === 'chat'
          ? `[REPLY] The learner said 「${heard}」. Reply in character with 1–2 short polite Japanese sentences at their level, then ask one simple question back. No greetings.`
          : `[REPLY] The learner said 「${heard}」. Reply in character with ONE short polite Japanese sentence (max 15 words) that answers it directly. Do not greet, do not ask a question, do not continue the script.`, true);
      }
    }
  }

  /** Longest reply in bytes of 24 kHz PCM16 (model audio is cut there). */
  replyBytes(say) {
    const sec = this.o.replySeconds?.[say] ?? (say === 'chat' ? 14 : 8);
    return 24000 * 2 * sec;
  }

  /**
   * Let the character speak on its own (free-talk room: the opener, a new topic, a twist, a nudge).
   * The note is a complete turn; the reply is played like a judged reply and ends with npcDone.
   */
  speak(note, seconds = 16) {
    if (!this.live) return false;
    clearTimeout(this.fallbackTimer); this.fallbackTimer = null;
    this.awaitingJudge = false;
    this.heardText = '';
    this.played = 0;
    this.maxBytes = 24000 * 2 * seconds;
    this.gate = 'armed';
    clearTimeout(this.armTimer);
    this.armTimer = setTimeout(() => { if (this.gate === 'armed') { this.gate = 'drop'; this.on.npcDone(false); } }, this.thinking ? 15000 : 9000);
    this.session.sendText(note, true);
    return true;
  }

  /** Ask for the closing report; resolves null on timeout. */
  report(note, timeoutMs = 15000) {
    if (!this.live) return Promise.resolve(null);
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.pendingReport = null; resolve(null); }, timeoutMs);
      this.pendingReport = (r) => { clearTimeout(t); resolve(r); };
      this.gate = 'drop';
      this.session.sendText(note, true);
    });
  }

  trace(ev) {
    const t = this.o.trace;
    if (!t || ev === 'audio') return; // audio chunks are too many to keep
    t.push(`${Date.now() % 100000} ${ev}`.slice(0, 160));
    if (t.length > 400) t.shift();
  }

  close() {
    this.closed = true;
    clearTimeout(this.armTimer);
    clearTimeout(this.fallbackTimer);
    clearInterval(this.keepTimer);
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
  }
}
