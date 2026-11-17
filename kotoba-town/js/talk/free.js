// FreeTalk: the free-talk room. Nothing is scripted — the partner is played live by Gemini Live in the
// character's own voice: it opens the conversation, replies to every learner utterance, may bring up a
// small twist, switches topic when asked and writes the closing feedback. Every utterance is still judged
// (score, a better way to say it, a tip) and shown on the turn card while the partner answers.
import { LiveBrain } from './brain.js';
import { freeTool, freeSystemInstruction, freeReplyInstruction, freeEndNote, offlineFreeReport, FREE_LEVELS } from './judge.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

/** Topics that fit this partner, place and level (the "anything" topic is always possible). */
export function topicsFor(data, { partner, place, level }) {
  const all = data?.topics || [];
  const fits = (t) => (!t.places?.length || t.places.includes(place)) && (!t.partners?.length || t.partners.includes(partner))
    && (!t.levels?.length || t.levels.includes(level));
  const specific = all.filter((t) => fits(t) && (t.partners?.length || t.places?.length));
  const general = all.filter((t) => fits(t) && !t.partners?.length && !t.places?.length);
  return [ANY_TOPIC, ...specific, ...general];
}

/** The partner's mood today (one per conversation, for variety). */
export const MOODS = [
  'in a cheerful mood', 'relaxed and chatty', 'a little tired but friendly', 'excited about some small good news',
  'curious about the learner and full of questions', 'calm and thoughtful', 'in a playful, joking mood', 'a bit busy but kind',
];

export const ANY_TOPIC = {
  id: 'any', kind: 'chat', titleJa: 'なんでも', titleEn: 'Anything',
  ideasEn: ['Answer their question, then ask one back', 'Talk about your day, your studies or your town', 'Say what you like and why'],
  startersJa: ['きょうは …', 'わたしは …が すきです。', '…さんは？'],
  wordsJa: [],
};

export class FreeTalk {
  /**
   * o: partner (resolved cast entry), info (freetalk partners[id]), place { id, nameJa, nameEn }, setupEn,
   *    topic, topics (the list the learner can switch through), level, style, twists[], stage, bubble, turn,
   *    toast, sound, mic, settings, apiKey, log, onDone({ report, turns, topics })
   */
  constructor(o) {
    Object.assign(this, o);
    this.log = o.log || (() => {});
    this.turns = [];
    this.talked = [];
    this.brain = null;
    this.stopped = false;
    this.npcBusy = false;
    this.listening = false;
    this.exchanges = 0;
    this.showIdeas = o.level === 'easy';
    this.last = null;
    this.twistAt = 3 + Math.floor(Math.random() * 3);
    this.twist = o.twists?.length && Math.random() < 0.85 ? pick(o.twists) : null;
    this.news = shuffle(o.info?.newsJa || []).slice(0, 3);
    this.mood = o.mood || pick(MOODS);
    this.mode = 'free';
  }

  get live() { return !!this.brain?.live; }

  /** Tell the guide (ネクマックス) what is happening. */
  emit(ev) { try { this.events?.({ free: true, ...ev }); } catch (e) { this.log('navi', String(e)); } }

  async begin() {
    this.mic.onChunk = (b64) => { if (this.mic.sending && this.brain?.live) this.brain.audio(b64); };
    this.toast.show('Gemini Live に つないで います… Connecting', 0);
    this.topicsUsed = [this.topic];
    this.brain = new LiveBrain({
      apiKey: this.apiKey,
      lesson: { vocab: [] },
      variant: { characters: [this.partner.id] },
      character: this.partner,
      learnerName: this.settings.name,
      instruction: this.instruction(),
      tools: (opts) => freeTool(opts),
      replyInstruction: (r) => freeReplyInstruction(r, { level: this.level, style: this.style }),
      replySeconds: { react: 10, chat: 18 },
      temperature: 0.85,
      extraVocab: this.words().map((w) => w.ja),
      silenceMs: this.settings.slowSpeaker ? 1900 : this.level === 'easy' ? 1700 : 1400,
      model: this.settings.model || undefined,
      trace: (window.KT && (window.KT.trace = [])) || undefined,
      on: {
        status: (s, d) => this.log('live', s, d),
        heard: (t) => this.onHeard(t),
        judge: (r) => this.onJudge(r),
        npcAudio: (b64) => this.onAudio(b64),
        npcText: (t) => this.onText(t),
        npcDone: () => this.onNpcDone(),
        error: (reason) => { if (this.brain) this.brain.lastError = reason; },
      },
    });
    const ok = await this.brain.connect();
    if (!ok || this.stopped) {
      this.toast.show(`Gemini Live: ${this.brain?.lastError || 'offline'} — フリートークは Gemini Live が ひつようです`, 5000);
      this.brain?.close(); this.brain = null;
      if (!this.stopped) this.onDone?.({ report: null, turns: [], topics: [], failed: true });
      return;
    }
    this.toast.show(`Gemini Live ✓ (${this.brain.model})`, 2200);
    this.card();
    await sleep(500);
    this.partnerSpeaks(this.openerNote());
  }

  instruction() {
    return freeSystemInstruction({
      partner: this.partner, info: this.info, place: `${this.place.nameJa} (${this.place.nameEn})`, setupEn: this.setupEn,
      topic: this.topic, level: this.level, style: this.style, learnerName: this.settings.name, news: this.news, mood: this.mood,
    });
  }

  words() { return (this.topic?.wordsJa || []).filter((w) => w?.ja); }

  openerNote() {
    const t = this.topic;
    const greet = this.info?.worksAt === this.place.id ? 'Greet the learner as you would greet someone at your workplace' : 'Greet the learner naturally for this place and time';
    return `[START] ${greet}, then open the conversation${t.id === 'any' ? ' with something from your own day or the place' : ` about 「${t.titleJa}」${t.openerEn ? ` (${t.openerEn})` : ''}`}. 1–2 short sentences and one easy question. Speak now.`;
  }

  stop() {
    this.stopped = true;
    this.closeMic();
    clearTimeout(this.nudgeTimer);
    this.brain?.close();
    this.brain = null;
    for (const p of this.stage.people.values()) p.speaker?.stop();
    this.bubble.hide();
    this.turn.hide();
  }

  // ------------------------------------------------------------------ voice
  partnerSpeaks(note, seconds = 16) {
    this.emit({ type: 'npc' });
    this.closeMic();
    this.npcBusy = true;
    this.reply = { text: '' };
    this.stage.ensureSpeakers();
    this.stage.setSpeaking(this.partner.id);
    this.card();
    if (!this.brain?.speak(note, seconds)) { this.npcBusy = false; this.stage.setSpeaking(null); this.listen(); }
  }

  onAudio(b64) {
    this.stage.people.get(this.partner.id)?.speaker?.pushPcm(b64);
  }

  onText(t) {
    if (!this.reply) this.reply = { text: '' };
    this.reply.text += t;
    if (!this.bubble.data?.live) this.bubble.show({ name: this.partner.nameJa, id: this.partner.id, line: { ja: '', kana: '', en: '' }, settings: { ...this.settings, english: false }, live: true });
    this.bubble.setLiveText(this.reply.text);
    const entry = this.stage.people.get(this.partner.id);
    if (entry?.person) this.bubble.follow(entry.person.topWorld(), this.stage.app.headPosition());
  }

  async onNpcDone() {
    const sp = this.stage.people.get(this.partner.id)?.speaker;
    if (sp) await sp.streamDone();
    if (this.stopped) return;
    this.stage.setSpeaking(null);
    if (this.reply?.text) this.talked.push(this.reply.text);
    this.reply = null;
    this.npcBusy = false;
    // a small surprise once, in the middle of the chat
    if (this.twist && !this.twistDone && this.exchanges >= this.twistAt) {
      this.twistDone = true;
      this.partnerSpeaks(`[TWIST] Something small happens now: ${this.twist.en} React to it naturally in 1–2 short sentences, then ask the learner one easy question about it or go back to your conversation.`, 16);
      return;
    }
    this.listen();
  }

  // ------------------------------------------------------------------ learner
  listen() {
    if (this.stopped) return;
    this.listening = true;
    this.heard = '';
    this.listens = (this.listens || 0) + 1;
    this.emit({ type: 'listen', k: this.listens });
    this.brain?.setTurn(`[TURN ${this.turns.length + 1}] Mode: free talk. Topic: ${this.topic.titleEn}. Judge the learner's next utterance with judge_reply (branch "free").`, ['free']);
    this.card();
    this.openMic();
    clearTimeout(this.nudgeTimer);
    // quiet for a long time: the partner helps (at most twice in a row)
    if ((this.nudges || 0) >= 2) return;
    this.nudgeTimer = setTimeout(() => {
      if (this.stopped || !this.listening || this.heard || this.npcBusy) return;
      this.nudges = (this.nudges || 0) + 1;
      this.showIdeas = true;
      this.emit({ type: 'hint' });
      this.partnerSpeaks('[NUDGE] The learner has been quiet for a while. Help them kindly: ask your last question again in simpler words, or offer two easy choices. One short sentence.', 10);
    }, this.level === 'easy' ? 22000 : 28000);
  }

  openMic() {
    if (this.mic.state !== 'on') return;
    this.mic.sending = true;
    this.sound.blip('listen');
  }

  closeMic() {
    if (this.mic.sending) { this.mic.sending = false; this.brain?.micPause(); }
  }

  onHeard(t) {
    if (!this.listening) return;
    this.heard = t;
    this.card();
  }

  onJudge(r) {
    if (!this.listening || this.npcBusy) return 'nothing';
    if (!r.heard && (r.branch === 'unclear' || !r.branch)) return 'nothing'; // noise: keep listening
    this.listening = false;
    clearTimeout(this.nudgeTimer);
    this.nudges = 0;
    this.exchanges += 1;
    if (r.branch !== 'repeat') {
      this.turns.push({ heard: r.heard || '', score: r.score ?? 1, correction: r.correction || '', tipEn: r.tipEn || '', branch: r.branch, topic: this.topic.id, promptEn: this.topic.titleEn, grammar: [], grammarUsed: [] });
      this.last = { heard: r.heard, score: r.score, correction: r.correction, tipEn: r.tipEn, source: r.source };
      this.emit({ type: 'judged', score: r.score ?? 1 });
      this.sound.blip(r.score >= 2 ? 'good' : 'soft');
    }
    this.closeMic();
    this.npcBusy = true;
    this.reply = { text: '' };
    this.stage.ensureSpeakers();
    this.stage.setSpeaking(this.partner.id);
    this.card();
    return 'chat';
  }

  // ------------------------------------------------------------------ buttons
  ideas() { this.showIdeas = !this.showIdeas; this.card(); }

  /** Another topic: the next one in the list the learner can switch through. */
  newTopic() {
    if (this.npcBusy || this.stopped) return;
    const list = this.topics.filter((t) => t.id !== 'any' && !this.topicsUsed.includes(t));
    const next = list.length ? pick(list) : pick(this.topics.filter((t) => t !== this.topic));
    if (!next) return;
    this.topic = next;
    this.topicsUsed.push(next);
    this.listening = false;
    clearTimeout(this.nudgeTimer);
    this.sound.blip('pop');
    this.partnerSpeaks(`[TOPIC] The learner wants to talk about something else. Move on naturally to 「${next.titleJa}」 (${next.titleEn}).${next.kind === 'role' && next.situationEn ? ` This is now a short role-play: ${next.situationEn}` : ''}${next.openerEn ? ` ${next.openerEn}` : ''} 1–2 short sentences and one easy question. Speak now.`, 16);
  }

  endFree() { return this.finish(); }

  /** The learner ends the conversation: Live writes the feedback. */
  async finish() {
    if (this.finishing) return;
    this.finishing = true;
    this.listening = false;
    clearTimeout(this.nudgeTimer);
    this.closeMic();
    for (const p of this.stage.people.values()) p.speaker?.stop();
    this.stage.setSpeaking(null);
    this.turn.hide();
    this.bubble.hide();
    this.toast.show('Gemini Live が ふりかえり中… Writing your feedback', 0);
    const topics = this.topicsUsed.map((t) => t.titleEn);
    const live = this.live && this.turns.length ? await this.brain.report(freeEndNote({ turns: this.turns, topics }), 25000) : null;
    const local = offlineFreeReport(this.turns, this.topicsUsed.flatMap((t) => t.wordsJa || []));
    const report = live ? { ...local, ...live, free: true, corrections: live.corrections?.length ? live.corrections : local.corrections, words: live.words?.length ? live.words : local.words, good: live.good?.length ? live.good : local.good } : local;
    this.toast.hide();
    this.brain?.close();
    this.brain = null;
    this.onDone?.({ report, turns: this.turns, topics: this.topicsUsed });
  }

  // ------------------------------------------------------------------ card
  card() {
    if (this.stopped) return;
    const t = this.topic;
    this.turn.set({
      mode: 'free',
      room: true,
      exam: false,
      levelLabel: FREE_LEVELS[this.level]?.ja,
      promptEn: `${t.titleJa} · ${t.titleEn}`,
      topicKind: t.kind,
      ideas: this.showIdeas ? t.ideasEn || [] : null,
      starters: this.showIdeas && this.level !== 'hard' ? t.startersJa || [] : null,
      heard: this.listening ? this.heard : '',
      last: this.last,
      waiting: this.npcBusy,
      mic: this.mic.state,
      live: this.live,
      settings: this.settings,
      choices: null, hintJa: null, showHint: false, notice: null,
    });
  }
}
