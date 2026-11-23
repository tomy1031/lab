// companion/talk.js — voice conversation with the companion through Gemini Live.
//
// • audio in: the microphone (16 kHz PCM) while talk mode is on (open mic, the server detects turns)
// • audio out: the companion's voice (24 kHz PCM) → Voice (positioned at the avatar, lip sync)
// • text: input/output transcriptions → subtitles + memory
// • context: the game pushes short status notes (time, weather, both people's condition, what just happened)
//   as text turns without asking for a reply; important events can ask for a reaction (rate-limited)
// • tools: the companion can act in the game — follow / wait / go to a place / gather / give an item /
//   express an emotion or gesture / remember a fact. The game implements them through `actions`.
import { connectLive } from './live.js';

export const LIVE_VOICES = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];

function toolDecls(places, resources) {
  return [{
    functionDeclarations: [
      { name: 'follow_player', description: 'Start following the player around.', parameters: { type: 'OBJECT', properties: {} } },
      { name: 'wait_here', description: 'Stop and stay where you are (or at the base).', parameters: { type: 'OBJECT', properties: { at_base: { type: 'BOOLEAN' } } } },
      { name: 'go_to', description: 'Walk to a named place on the island.', parameters: { type: 'OBJECT', properties: { place: { type: 'STRING', enum: places } }, required: ['place'] } },
      { name: 'gather', description: 'Go and gather a resource for the group (takes in-game time).', parameters: { type: 'OBJECT', properties: { resource: { type: 'STRING', enum: resources }, amount: { type: 'INTEGER' } }, required: ['resource'] } },
      { name: 'give_item', description: 'Give one of YOUR items to the player.', parameters: { type: 'OBJECT', properties: { item: { type: 'STRING', description: 'item name in Japanese or id' }, count: { type: 'INTEGER' } }, required: ['item'] } },
      { name: 'express', description: 'Show an emotion and/or a gesture with your body and face.', parameters: { type: 'OBJECT', properties: { emotion: { type: 'STRING', enum: ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral'] }, gesture: { type: 'STRING', enum: ['none', 'wave', 'cheer', 'point', 'sit', 'shiver'] } } } },
      { name: 'remember', description: 'Store something important to remember long-term (a promise, the player\'s preference, a discovery).', parameters: { type: 'OBJECT', properties: { fact: { type: 'STRING' }, importance: { type: 'INTEGER', description: '1–3' } }, required: ['fact'] } },
      { name: 'check_status', description: 'Get the current survival status (time, weather, both people\'s condition, inventory, base).', parameters: { type: 'OBJECT', properties: {} } },
    ],
  }];
}

export class CompanionTalk {
  /**
   * o: { apiKey, persona (system text), voiceName, memory (CompanionMemory), voice (Voice), mic (Mic),
   *      places [], resources [], actions: { follow, wait, goTo, gather, give, express, remember, status } ,
   *      onStatus(state, info), onSubtitle(who, text, final), when() → { day, hour } }
   */
  constructor(o) {
    this.o = o;
    this.session = null;
    this.state = 'off'; // off | connecting | live | error
    this.closed = true;
    this.resumeHandle = null;
    this.speaking = false;
    this.lastReactT = 0;
    this.outBuf = ''; this.inBuf = '';
    this.micOn = false;
  }

  setup() {
    const o = this.o;
    return {
      generationConfig: {
        responseModalities: ['AUDIO'],
        temperature: 0.85,
        speechConfig: { languageCode: 'ja-JP', voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voiceName || 'Aoede' } } },
      },
      systemInstruction: { parts: [{ text: this.instruction() }] },
      tools: toolDecls(o.places, o.resources),
      realtimeInputConfig: { automaticActivityDetection: { disabled: false, prefixPaddingMs: 300, silenceDurationMs: 900 } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
    };
  }

  instruction() {
    const o = this.o;
    return [
      o.persona,
      '',
      '## 話し方のルール',
      '- 日本語で、短く自然に話す（1〜3文）。相手の話をよく聞き、気持ちに反応し、ときどき質問を返す。',
      '- あなたはこの島で一緒に生き延びている仲間。ゲームの数値をそのまま読み上げず、体の感覚や気持ちとして話す（「お腹ぺこぺこ」「寒くて震える」）。',
      '- 危険（脱水・低体温・食中毒・夜の行動・嵐）には仲間として気づかい、具体的なサバイバルの知恵を短く伝える（煮沸・ろ過・火を通す・雨宿り・乾かす）。',
      '- 頼まれたこと・自分から決めたことは、必ずツールで実行する（ついていく・待つ・行く・集める・渡す・表情）。できないことは正直に言う。',
      '- 大事なこと（約束・相手の名前や好み・発見・ケンカや仲直り）は remember で覚える。',
      '- 「[状況]」「[できごと]」で始まるテキストはゲームからの情報。そのまま読み上げず、必要なときだけ自然に反応する。',
      '',
      '## あなたの記憶',
      o.memory.contextText(),
    ].join('\n');
  }

  async start() {
    if (this.state === 'live' || this.state === 'connecting') return true;
    this.closed = false;
    this.o.voice.init();
    const ok = await this.connect();
    if (ok) await this.enableMic(true);
    return ok;
  }

  async connect() {
    this.state = 'connecting';
    this.o.onStatus?.('connecting');
    const res = await connectLive({ apiKey: this.o.apiKey, setup: () => this.setup(), handlers: this.handlers() });
    if (!res.ok) {
      this.state = 'error';
      this.o.onStatus?.('error', res.reason);
      return false;
    }
    this.session = res.session;
    this.model = res.model;
    this.state = 'live';
    this.o.onStatus?.('live', res.model);
    // greet: the companion opens the conversation in character
    this.pushStatus(true, '（プレイヤーが話しかけてきた。いまの状況をふまえて、ひとこと声をかけて。）');
    return true;
  }

  async enableMic(on) {
    const mic = this.o.mic;
    if (on) {
      const ok = await mic.start();
      if (!ok) { this.o.onStatus?.('mic', mic.state); return false; }
      mic.onChunk = (b64) => { if (this.session?.open && this.micOn) this.session.sendAudio(b64); };
      mic.sending = true;
      this.micOn = true;
    } else {
      this.micOn = false;
      mic.sending = false;
      this.session?.sendAudioStreamEnd();
    }
    return true;
  }

  handlers() {
    return {
      onAudio: (b64) => { this.o.voice.pushPcm(b64); this.speaking = true; },
      onOutputText: (t) => { this.outBuf += t; this.o.memory.add('companion', t, this.o.when()); this.o.onSubtitle?.('companion', this.outBuf, false); },
      onInputText: (t) => { this.inBuf += t; this.o.memory.add('player', t, this.o.when()); this.o.onSubtitle?.('player', this.inBuf, false); },
      onTurnComplete: () => {
        if (this.outBuf) this.o.onSubtitle?.('companion', this.outBuf, true);
        if (this.inBuf) this.o.onSubtitle?.('player', this.inBuf, true);
        this.outBuf = ''; this.inBuf = '';
        this.speaking = false;
        this.o.memory.closeTurn();
        if (this.o.memory.needsCompression()) this.o.onNeedCompress?.();
      },
      onInterrupted: () => { this.o.voice.stop(); this.outBuf = ''; },
      onToolCall: (calls) => this.toolCalls(calls),
      onResumption: (h) => { this.resumeHandle = h; },
      onGoAway: () => this.reconnect(),
      onClose: (reason) => { if (!this.closed) this.reconnect(reason); },
    };
  }

  async reconnect() {
    if (this.closed || this.reconnecting) return;
    this.reconnecting = true;
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
    this.o.onStatus?.('reconnecting');
    const ok = await this.connect();
    this.reconnecting = false;
    if (!ok) this.stop();
  }

  async toolCalls(calls) {
    const a = this.o.actions;
    const responses = [];
    for (const c of calls) {
      let result;
      try {
        const args = c.args || {};
        switch (c.name) {
          case 'follow_player': result = a.follow(); break;
          case 'wait_here': result = a.wait(!!args.at_base); break;
          case 'go_to': result = a.goTo(args.place); break;
          case 'gather': result = a.gather(args.resource, args.amount || 3); break;
          case 'give_item': result = a.give(args.item, args.count || 1); break;
          case 'express': result = a.express(args.emotion || 'neutral', args.gesture || 'none'); break;
          case 'remember': this.o.memory.addFact(args.fact, this.o.when().day, args.importance || 2); result = 'remembered'; break;
          case 'check_status': result = a.status(); break;
          default: result = 'unknown tool';
        }
      } catch (e) { result = `error: ${e.message}`; }
      responses.push({ id: c.id, name: c.name, response: { result: typeof result === 'string' ? result : JSON.stringify(result) } });
    }
    this.session?.sendToolResponse(responses);
  }

  /** send a status note; react=true asks the companion to say something about it (rate-limited) */
  pushStatus(react = false, extra = '') {
    if (!this.session?.open) return;
    const st = this.o.actions.status();
    const note = `[状況] ${typeof st === 'string' ? st : JSON.stringify(st)}${extra ? `\n${extra}` : ''}`;
    this.session.sendText(note, react);
  }

  /** something happened in the game: tell the companion; important ones may get a spoken reaction */
  event(text, important = false) {
    if (!this.session?.open) return;
    const now = performance.now() / 1000;
    const react = important && now - this.lastReactT > 45 && !this.speaking;
    if (react) this.lastReactT = now;
    this.session.sendText(`[できごと] ${text}`, react);
  }

  /** after the memory was compressed, rebuild the session with the new summary */
  async refreshMemory() {
    if (!this.session?.open) return;
    this.resumeHandle = null; // a fresh context with the compressed memory in the instructions
    await this.reconnect();
  }

  stop() {
    this.closed = true;
    this.enableMic(false);
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
    this.o.voice.stop();
    this.state = 'off';
    this.o.onStatus?.('off');
    this.o.memory.closeTurn();
  }
}
