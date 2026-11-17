// LiveBrain — one Gemini Live session per scenario: it hears the learner, judges every answer through
// the `judge_reply` function, and (only when the app allows it) answers in the main character's voice.
// The app owns the script and the speakers: model audio is forwarded only after the app decided "react"
// or "chat" for that turn; everything else the model says is dropped. No DOM, no Web Audio here, so the
// same class runs in Node for the API self-check (tools/live_selfcheck.mjs).
import { connectLive, LIVE_MODELS } from './live.js';
import { JUDGE_TOOL, systemInstruction, readJudge, readReport, similarity } from './judge.js';

const noop = () => {};

export class LiveBrain {
  /**
   * @param {object} o
   * @param {string} o.apiKey
   * @param {object} o.lesson, o.variant, o.character   resolved content
   * @param {string} [o.learnerName]
   * @param {number} [o.silenceMs]  how long a pause ends the learner's turn (beginners pause a lot)
   * @param {object} o.on  callbacks: status(s, detail), heard(text), npcAudio(b64), npcText(text),
   *        npcDone(), judge(result) → 'nothing'|'react'|'chat', error(reason)
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
  }

  setup() {
    const { lesson, variant, character, learnerName, silenceMs = 1300 } = this.o;
    const setup = {
      generationConfig: {
        responseModalities: ['AUDIO'],
        temperature: 0.5,
        speechConfig: { languageCode: 'ja-JP', voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voice } } },
      },
      systemInstruction: { parts: [{ text: systemInstruction({ lesson, variant, character, learnerName }) }] },
      tools: [JUDGE_TOOL],
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          prefixPaddingMs: 300,
          silenceDurationMs: silenceMs,
        },
      },
      inputAudioTranscription: {},
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
        this.heardText += t;
        this.awaitingJudge = true;
        this.on.heard(this.heardText);
      },
      onToolCall: (calls) => this.toolCalls(calls),
      onTurnComplete: () => this.turnComplete(),
      onInterrupted: () => { this.trace('interrupted'); if (this.gate === 'play') this.on.npcDone(true); this.gate = 'drop'; },
      onResumption: (h) => { this.resumeHandle = h; },
      onGoAway: () => { this.reconnect('goAway'); },
      onClose: (reason) => { if (!this.closed) this.reconnect(reason); },
    };
  }

  async connect() {
    this.on.status('connecting');
    const res = await connectLive({
      apiKey: this.o.apiKey, setup: this.setup(), handlers: this.handlers(),
      models: this.o.models || LIVE_MODELS, preferred: this.o.model, WebSocketImpl: this.o.WebSocketImpl,
    });
    if (!res.ok) {
      this.on.status('offline', res.reason);
      this.on.error(res.reason, res.tried);
      return false;
    }
    this.session = res.session;
    this.model = res.model;
    this.on.status('live', res.model);
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
    this.gate = 'drop';
    this.session?.sendText(note, false);
  }

  /** 16 kHz PCM16 base64 from the mic (only while the learner may talk). */
  audio(b64) { this.session?.sendAudio(b64); }

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
    this.judgeAt = Date.now();
    let say = 'nothing';
    try { say = this.on.judge(result) || 'nothing'; } catch (e) { console.error(e); }
    this.trace(`judge:${result.branch}/${result.score} → ${say}`);
    // 'armed': the reply has not started yet. A turnComplete that closes the function-call turn
    // can arrive before the reply audio, so only audio switches the gate to 'play'.
    this.gate = say === 'nothing' ? 'drop' : 'armed';
    clearTimeout(this.armTimer);
    if (this.gate === 'armed') this.armTimer = setTimeout(() => { if (this.gate === 'armed') { this.gate = 'drop'; this.on.npcDone(false); } }, 7000);
    const response = { ok: true, say };
    if (say === 'react') {
      response.instruction = `Reply in character to what the learner just said (${result.heard ? `「${result.heard}」` : 'see audio'}): ONE short polite Japanese sentence, at most 15 words, that answers their question or comment directly. Do not greet, do not introduce yourself, do not ask a question, do not continue the script.`;
    } else if (say === 'chat') {
      response.instruction = `Reply in character to 「${result.heard}」 with 1–2 short polite Japanese sentences at the learner's level, then ask one simple question back. No greetings.`;
    }
    this.played = 0;
    this.maxBytes = 24000 * 2 * (say === 'chat' ? 14 : 8); // hard cap on reply length
    this.heardText = '';
    this.session?.sendToolResponse([{ id: call.id, name: call.name, response }]);
  }

  turnComplete() {
    this.trace(`turnComplete(${this.gate})`);
    if (this.gate === 'armed') return; // the reply is still to come
    if (this.gate === 'play') this.on.npcDone(false);
    this.gate = 'drop';
    // The model finished a turn without judging although the learner spoke: judge from the transcript.
    if (this.awaitingJudge && !this.judgePending && this.heardText.trim()) {
      const heard = this.heardText.trim();
      this.heardText = '';
      this.awaitingJudge = false;
      this.on.judge({ heard, branch: 'unjudged', score: 1, grammarUsed: [], correction: '', tipEn: '', source: 'transcript' });
    }
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

  trace(ev) { if (this.o.trace) this.o.trace.push(`${Date.now() % 100000} ${ev}`.slice(0, 120)); }

  close() {
    this.closed = true;
    clearTimeout(this.armTimer);
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
  }
}
