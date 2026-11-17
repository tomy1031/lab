// Runner: plays one scenario variant — NPC lines (pre-generated voices), the learner's spoken
// answers (Gemini Live judges them and picks the branch), retries/hints, off-script replies in the
// NPC's own Live voice, optional free talk, and the closing report.
import { LiveBrain } from './brain.js';
import { turnNote, freeTalkNote, endNote, offlineJudge, offlineReport, offlineInterviewReport } from './judge.js';
import { LIVE_MODELS, THINKING_MODEL } from './live.js';
import { reviewInterview } from './review.js';
import { resolveCharacter } from '../content/lines.js';
import { voiceUrl } from '../content/index.js';
import { UTILITY_LINES } from '../content/cast.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

export class Runner {
  constructor(o) {
    Object.assign(this, o); // lesson, variant, stage, bubble, turn, toast, sound, mic, settings, apiKey, onDone, log
    this.chars = Object.fromEntries(this.variant.characters.map((c) => { const r = resolveCharacter(c); return [r.id, r]; }));
    this.main = resolveCharacter(this.variant.characters[0]);
    this.nodes = Object.fromEntries(this.variant.nodes.map((n) => [n.id, n]));
    // job interviews (ITビジネス編 Story C): every answer is judged against an interviewer's rubric on
    // Gemini Live; the final evaluation comes from a model that thinks first (review.js)
    this.interview = this.lesson.format === 'interview';
    this.turns = [];
    this.k = 0;
    this.brain = null;
    this.cur = null;
    this.stopped = false;
    this.npcBusy = false;
    this.log = o.log || (() => {});
    // 'practice' = れんしゅう: answer examples shown from the start, hints. 'real' = ほんばん: no examples, no hints.
    this.mode = o.mode === 'real' && o.apiKey ? 'real' : 'practice';
  }

  get live() { return !!this.brain?.live; }

  // ------------------------------------------------------------- lifecycle
  async begin() {
    this.mic.onChunk = (b64) => { if (this.mic.sending && this.brain?.live) this.brain.audio(b64); };
    if (this.apiKey) {
      this.toast.show('Gemini Live に つないで います… Connecting', 0);
      this.brain = new LiveBrain({
        apiKey: this.apiKey,
        lesson: this.lesson,
        variant: this.variant,
        character: this.main,
        learnerName: this.settings.name,
        silenceMs: this.settings.slowSpeaker ? 1800 : this.interview ? 1600 : 1300,
        model: this.settings.model || undefined,
        // Live's own Extended Thinking model cannot return verdicts yet (its function calls fail): opt-in only
        models: this.interview && this.settings.liveThinking ? [THINKING_MODEL, ...LIVE_MODELS] : undefined,
        thinkingLevel: this.settings.thinkingLevel || 'MEDIUM',
        trace: (window.KT && (window.KT.trace = [])) || undefined,
        on: {
          status: (s, d) => this.log('live', s, d),
          heard: (t) => this.onHeard(t),
          judge: (r) => this.onJudge(r),
          npcAudio: (b64) => this.onLiveAudio(b64),
          npcText: (t) => this.onLiveText(t),
          npcDone: () => this.onLiveDone(),
          error: (reason) => this.onLiveError(reason),
        },
      });
      const ok = await this.brain.connect();
      this.toast.show(ok ? `Gemini Live ✓ (${this.brain.model})` : `Gemini Live: ${this.liveErrorText(this.brain.lastError || 'offline')} — offline practice`, 3000);
      if (!ok) this.brain = null;
    }
    if (this.mode === 'real' && !this.brain) {
      // ほんばん needs Gemini Live to judge free answers; without it, fall back to れんしゅう
      this.mode = 'practice';
      this.toast.show('ほんばんは Gemini に つながらないので、れんしゅうに します', 4000);
    }
    if (this.variant.call) {
      this.toast.show('📞 でんわ です · The phone is ringing', 3000);
      await this.sound.ring(2);
    }
    if (this.variant.entrance === 'knock') {
      this.toast.show('コン、コン、コン · You knock on the door', 2600);
      await this.sound.knock(3);
    }
    await this.go(this.variant.start);
  }

  stop() {
    this.stopped = true;
    this.closeMic();
    this.brain?.close();
    this.brain = null;
    clearTimeout(this.idleTimer); clearTimeout(this.idleTimer2);
    for (const p of this.stage.people.values()) p.speaker?.stop();
    this.bubble.hide();
    this.turn.hide();
  }

  liveErrorText(reason) {
    return {
      badKey: 'API key was rejected', rateLimited: 'quota used up for now', modelNotFound: 'no Live model available', network: 'network error', timeout: 'no answer', noKey: 'no API key',
    }[reason] || reason;
  }

  onLiveError(reason) { if (this.brain) this.brain.lastError = reason; }

  // ----------------------------------------------------------------- script
  async go(id) {
    let nodeId = id;
    while (nodeId && !this.stopped) {
      const node = this.nodes[nodeId];
      if (!node) break;
      if (node.learner) await this.stage.learner(node.learner); // interviews: walk to the chair, sit, stand
      if (node.focus) this.stage.focus(node.focus);
      this.lastSay = node.say || [];
      await this.say(this.lastSay);
      if (this.stopped) return;
      if (node.end) break;
      if (node.listen) nodeId = await this.listen(node);
      else if (node.nextRandom) nodeId = pick(node.nextRandom);
      else nodeId = node.next;
    }
    if (this.stopped) return;
    if (this.variant.freeTalk && this.live) await this.freeTalk();
    await this.finish();
  }

  /** Speak scripted lines (picking one of the alternatives). */
  async say(lines, { remember = true } = {}) {
    this.npcBusy = true;
    this.closeMic();
    this.turn.set({ mode: 'npc', promptEn: 'Listen…', mic: this.mic.state, settings: this.settings });
    const spoken = [];
    for (const [i, line] of lines.entries()) {
      if (this.stopped) break;
      const node = this.variant.nodes.find((n) => n.say === lines);
      const altIdx = line.alts?.length ? Math.floor(Math.random() * (line.alts.length + 1)) - 1 : -1;
      const chosen = altIdx >= 0 ? { ...line, ...line.alts[altIdx] } : line;
      const lineId = node ? `${this.variant.id}/${node.id}_${i}${altIdx >= 0 ? `_a${altIdx}` : ''}` : null;
      await this.speakLine(line.who, chosen, lineId, line.gesture, line.target);
      spoken.push({ name: this.chars[line.who]?.nameJa, ja: chosen.ja, en: chosen.en });
      await sleep(220);
    }
    if (remember) this.lastSpoken = spoken.length ? spoken : this.lastSpoken || [];
    this.npcBusy = false;
    return spoken;
  }

  /** One line: bubble + gesture + voice (pre-generated → speech synthesis → silent reading time). */
  async speakLine(who, line, lineId, gesture, target) {
    const entry = this.stage.people.get(who);
    const char = this.chars[who] || entry?.char;
    this.stage.ensureSpeakers();
    this.stage.setSpeaking(who);
    if (gesture && entry?.person) entry.person.gesture(gesture, { target: target ? this.stage.propPosition(target) : null });
    this.bubble.show({ name: char?.nameJa || who, id: who, line, settings: this.settings });
    this.placeBubble(who);
    const url = lineId ? voiceUrl(lineId) : null;
    const t0 = performance.now();
    const est = Math.max(1.2, [...(line.kana || line.ja)].length * 0.14) * 1000;
    const tick = setInterval(() => { this.placeBubble(who); this.bubble.setProgress((performance.now() - t0) / (est * 0.85)); }, 50);
    try {
      if (url && entry?.speaker) await entry.speaker.playUrl(url, this.settings.rate || 1);
      else await this.synth(line, est, who);
    } catch (e) {
      this.log('audio', String(e));
      await this.synth(line, est, who);
    }
    clearInterval(tick);
    this.bubble.setProgress(1);
    this.stage.setSpeaking(null);
  }

  /** Browser speech synthesis if available (lines not recorded yet), otherwise reading time. */
  synth(line, est, who) {
    return new Promise((resolve) => {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      const ja = voices.find((v) => v.lang?.startsWith('ja'));
      this.stage.fakeTalk(who, est);
      if (!ja || this.settings.noSynth) { setTimeout(resolve, est + 400); return; }
      const u = new SpeechSynthesisUtterance(line.ja);
      u.voice = ja; u.lang = 'ja-JP'; u.rate = (this.settings.rate || 1) * 0.95;
      const done = () => { clearTimeout(guard); this.stage.fakeTalk(who, 0); resolve(); };
      const guard = setTimeout(done, est * 2.5 + 1500);
      u.onend = done; u.onerror = done;
      window.speechSynthesis.speak(u);
    });
  }

  placeBubble(who) {
    const head = this.stage.app.headPosition();
    const entry = this.stage.people.get(who);
    if (entry?.person) this.bubble.follow(entry.person.topWorld(), head);
    else {
      const dir = this.stage.app.camera.getWorldDirection(head.clone()).setY(0).normalize();
      const p = head.clone().addScaledVector(dir, 1.25); p.y += 0.22;
      this.bubble.follow(p, head);
    }
  }

  async playUtility(key, who = this.main.id) {
    const u = UTILITY_LINES[key];
    if (!u) return;
    await this.speakLine(who, u, `_cast/${who}_${key}`);
  }

  // ----------------------------------------------------------------- listen
  openMic() {
    if (this.mic.state !== 'on') return;
    this.mic.sending = true;
    this.sound.blip('listen');
  }

  closeMic() {
    if (this.mic.sending) { this.mic.sending = false; this.brain?.micPause(); }
  }

  /** Wait for the learner's answer to a node; resolves with the next node id. */
  listen(node) {
    const li = node.listen;
    return new Promise((resolve) => {
      this.cur = { node, li, attempts: 0, reacts: 0, resolve, showHint: false, choices: null, heard: '', question: this.lastSpoken || [] };
      this.k += 1;
      if (this.live) {
        this.brain.setTurn(turnNote({ k: this.k, character: this.main, npcLines: this.lastSpoken || [], listen: li, grammar: this.lesson.grammar }), li.branches.map((b) => b.id));
      }
      this.promptCard();
      this.openMic();
      this.armIdle();
    });
  }

  promptCard(extra = {}) {
    const c = this.cur; if (!c) return;
    const practice = this.mode === 'practice';
    if (practice && !c.choices && !c.free) c.choices = shuffle(c.li.branches.map((b) => b.exampleJa).filter(Boolean));
    this.turn.set({
      mode: c.free ? 'free' : 'listen',
      exam: !practice,
      promptEn: c.free ? this.variant.freeTalk.topicEn : c.li.promptEn,
      hintJa: c.li?.hintJa,
      showHint: practice && c.showHint,
      choices: practice && !c.free ? c.choices : null,
      heard: c.heard,
      mic: this.mic.state,
      live: this.live,
      notice: extra.notice || null,
      settings: this.settings,
    });
  }

  armIdle() {
    clearTimeout(this.idleTimer); clearTimeout(this.idleTimer2);
    if (this.cur?.free || this.mode === 'real') return; // ほんばん: no automatic help
    this.idleTimer = setTimeout(() => { if (this.cur && !this.cur.showHint) { this.cur.showHint = true; this.sound.blip('hint'); this.promptCard(); } }, 14000);
    this.idleTimer2 = setTimeout(() => { if (this.cur) { this.cur.showChoices = true; this.cur.choices ||= shuffle(this.cur.li.branches.map((b) => b.exampleJa)); this.promptCard(); } }, 30000);
  }

  onHeard(t) {
    if (!this.cur) return;
    this.cur.heard = t;
    this.promptCard();
  }

  /** Turn-card buttons. */
  hint() {
    if (!this.cur || this.cur.free || this.mode === 'real') return;
    if (!this.cur.showHint) this.cur.showHint = true;
    else { this.cur.showChoices = true; this.cur.choices ||= shuffle(this.cur.li.branches.map((b) => b.exampleJa)); }
    this.promptCard();
  }

  async again() {
    if (!this.cur || this.npcBusy) return;
    this.closeMic();
    await this.say(this.lastSay || [], { remember: false });
    this.promptCard(); this.openMic();
  }

  skip() {
    const c = this.cur; if (!c || c.free) return;
    this.record({ heard: '', score: 0, correction: c.li.modelAnswers?.[0] || '', tipEn: 'Skipped — here is a model answer.', branch: 'skipped' });
    this.accept(c.li.fallback, { score: 0, heard: '', correction: c.li.modelAnswers?.[0], tipEn: 'Skipped. Model answer shown.' });
  }

  /** The learner tapped a suggested answer (offline practice, or as a fallback). */
  choose(textJa) {
    const c = this.cur; if (!c || c.free) return;
    const r = offlineJudge(textJa, c.li);
    r.score = Math.min(r.score, this.live ? 1 : 2);
    if (this.live) r.tipEn = 'Tapped — next time try saying it out loud!';
    this.handle(r);
  }

  /** Verdict from Gemini Live (or from the transcript fallback). Returns what the model may say. */
  onJudge(result) {
    const c = this.cur;
    if (!c || this.npcBusy) return 'nothing';
    if (c.free) return this.onFreeJudge(result);
    let r = result;
    if (r.branch === 'unjudged') r = { ...offlineJudge(r.heard, c.li), source: 'transcript' };
    return this.handle(r);
  }

  handle(r) {
    const c = this.cur;
    const li = c.li;
    // the judge's words did not match the transcript: ask again instead of trusting the branch
    if (r.suspect && li.branches.some((b) => b.id === r.branch)) r = { ...r, branch: 'unclear', score: 0, tipEn: 'I could not catch that clearly — please say it again.' };
    const valid = li.branches.find((b) => b.id === r.branch);
    this.log('judge', r.branch, r.score, r.heard);
    if (valid) {
      this.record(r);
      this.accept(valid.next, r);
      return 'nothing';
    }
    switch (r.branch) {
      case 'repeat':
        this.again();
        return 'nothing';
      case 'dont_know':
        c.attempts += 1; c.showHint = true;
        this.npcRespond('slow');
        return 'nothing';
      case 'english':
        c.attempts += 1; c.showHint = true;
        this.promptCard({ notice: 'Try it in Japanese! 日本語で どうぞ。' });
        this.npcRespond('hmm', 'Try it in Japanese! 日本語で どうぞ。');
        return 'nothing';
      case 'asks_npc':
      case 'off_topic':
        if (this.live && c.reacts < 2) {
          c.reacts += 1;
          this.closeMic();
          this.npcBusy = true;
          this.liveReply = { who: this.main.id, text: '' };
          this.stage.ensureSpeakers();
          this.stage.setSpeaking(this.main.id);
          return 'react';
        }
        c.attempts += 1;
        this.npcRespond('sodesuka');
        return 'nothing';
      case 'unclear':
      default:
        if (!r.heard) return 'nothing'; // noise: keep listening quietly
        c.attempts += 1;
        if (c.attempts >= 3) { this.giveUp(); return 'nothing'; }
        c.showHint = true;
        this.npcRespond('again');
        return 'nothing';
    }
  }

  /** Short NPC utility response, then listen again (or give up after 3 tries). */
  async npcRespond(key, notice) {
    const c = this.cur;
    this.closeMic();
    if (c.attempts >= 3) { this.giveUp(); return; }
    await this.playUtility(key, this.mainSpeakerId());
    if (this.cur !== c) return;
    this.promptCard(notice ? { notice } : {});
    this.openMic();
    this.armIdle();
  }

  mainSpeakerId() { return this.stage.people.has(this.main.id) ? this.main.id : [...this.stage.people.keys()][0]; }

  giveUp() {
    const c = this.cur;
    this.record({ heard: c.heard, score: 0, correction: c.li.modelAnswers?.[0] || '', tipEn: 'Let\'s look at a model answer and keep going.', branch: 'fallback' });
    this.accept(c.li.fallback, { score: 0, heard: c.heard, correction: c.li.modelAnswers?.[0], tipEn: 'Here is a model answer — try it next time!' });
  }

  async accept(next, r) {
    const c = this.cur;
    this.cur = null;
    clearTimeout(this.idleTimer); clearTimeout(this.idleTimer2);
    this.closeMic();
    this.sound.blip(r.score >= 2 ? 'good' : 'soft');
    if (this.interview) {
      // ほんばん is a real interview: no feedback in between, everything comes in the evaluation at the end
      if (this.mode === 'real') { this.turn.set({ mode: 'npc', promptEn: '…', mic: this.mic.state }); await sleep(500); c.resolve(next); return; }
      const better = r.betterAnswer || (r.source === 'live' ? r.correction : c.li.modelAnswers?.[0]) || '';
      this.turn.set({
        mode: 'feedback',
        feedback: { score: r.score, heard: r.heard, correction: better, tipEn: r.improveEn || r.tipEn || c.li.lookForEn || '', criteriaMet: r.criteriaMet || [], criteriaMissed: r.criteriaMissed || [], interview: true, offline: r.source !== 'live' },
        mic: this.mic.state,
      });
      await sleep(better && better !== r.heard ? 6500 : 3500);
      c.resolve(next);
      return;
    }
    this.turn.set({ mode: 'feedback', feedback: { score: r.score, heard: r.heard, correction: r.correction, tipEn: r.tipEn }, mic: this.mic.state });
    await sleep(r.score >= 2 && (!r.correction || r.correction === r.heard) ? 1600 : 3200);
    c.resolve(next);
  }

  record(r) {
    const c = this.cur;
    this.turns.push({
      nodeId: c.node?.id, promptEn: c.free ? 'Free talk' : c.li.promptEn, heard: r.heard || '', score: r.score ?? 0,
      correction: r.correction || '', tipEn: r.tipEn || '', branch: r.branch, grammar: c.li?.grammar || [], grammarUsed: r.grammarUsed || [],
      ...(this.interview && !c.free ? {
        questionJa: (c.question || []).map((l) => l.ja).join(' '), criteria: c.li.criteria || [], criteriaMet: r.criteriaMet || [], criteriaMissed: r.criteriaMissed || [],
        improveEn: r.improveEn || '', betterAnswer: r.betterAnswer || '', pitfallsEn: c.li.pitfallsEn || '', lookForEn: c.li.lookForEn || '', modelAnswer: c.li.modelAnswers?.[0] || '',
      } : {}),
    });
  }

  // ------------------------------------------------------- Live voice replies
  onLiveAudio(b64) {
    const id = this.liveReply?.who || this.main.id;
    const sp = this.stage.people.get(id)?.speaker;
    sp?.pushPcm(b64);
  }

  onLiveText(t) {
    if (!this.liveReply) return;
    this.liveReply.text += t;
    const ch = this.chars[this.liveReply.who];
    if (!this.bubble.data?.live) this.bubble.show({ name: ch?.nameJa || '', id: this.liveReply.who, line: { ja: '', kana: '', en: '' }, settings: { ...this.settings, english: false }, live: true });
    this.bubble.setLiveText(this.liveReply.text);
    this.placeBubble(this.liveReply.who);
  }

  async onLiveDone() {
    const who = this.liveReply?.who || this.main.id;
    const sp = this.stage.people.get(who)?.speaker;
    if (sp) await sp.streamDone();
    this.stage.setSpeaking(null);
    this.liveReply = null;
    this.npcBusy = false;
    if (this.cur) {
      if (this.cur.free) { this.cur.count += 1; if (this.cur.count >= (this.variant.freeTalk.maxTurns || 4)) { this.endFree(); return; } }
      this.promptCard();
      this.openMic();
      this.armIdle();
    }
  }

  // --------------------------------------------------------------- free talk
  async freeTalk() {
    const ft = this.variant.freeTalk;
    await this.speakLine(this.main.id, { ja: ft.openerJa, kana: ft.openerKana || ft.openerJa, en: ft.openerEn }, `${this.variant.id}/free_open`);
    if (!this.live || this.stopped) return;
    await new Promise((resolve) => {
      this.cur = { free: true, count: 0, resolve, li: { grammar: [] }, heard: '' };
      this.k += 1;
      this.brain.setTurn(freeTalkNote({ k: this.k, character: this.main, freeTalk: ft, lessonNo: this.lesson.lesson, course: this.lesson.course }), ['free']);
      this.promptCard();
      this.openMic();
    });
  }

  onFreeJudge(r) {
    const c = this.cur;
    if (!r.heard && r.branch === 'unclear') return 'nothing';
    this.record(r);
    this.turn.set({ mode: 'free', promptEn: r.correction && r.correction !== r.heard ? `✓ ${r.correction}` : this.variant.freeTalk.topicEn, heard: r.heard, mic: this.mic.state });
    this.closeMic();
    this.npcBusy = true;
    this.liveReply = { who: this.main.id, text: '' };
    this.stage.setSpeaking(this.main.id);
    void c;
    return 'chat';
  }

  endFree() {
    const c = this.cur;
    if (!c?.free) return;
    this.cur = null;
    this.closeMic();
    c.resolve();
  }

  // ------------------------------------------------------------------ finish
  async finish() {
    this.closeMic();
    this.turn.hide();
    this.bubble.hide();
    this.toast.show(this.live ? (this.interview ? '面接の 評価を 考えて います… Evaluating your interview' : 'Gemini Live が ふりかえり中… Writing your feedback') : 'まとめ中…', 0);
    let report = null;
    const rubric = this.interview ? this.lesson.rubric || [] : null;
    if (this.interview) {
      // the considered evaluation (a thinking model reads the whole interview) and Live's quick one, in parallel
      const [review, quick] = await Promise.all([
        this.apiKey ? reviewInterview({ apiKey: this.apiKey, lesson: this.lesson, variant: this.variant, turns: this.turns, level: this.settings.reviewLevel || 'HIGH', timeoutMs: 75000, log: (m) => this.log('review', m) }).catch(() => null) : null,
        this.live ? this.brain.report(endNote({ turns: this.turns, rubric }), 30000) : null,
      ]);
      const local = offlineInterviewReport(this.turns, rubric);
      if (review) report = { ...local, ...review };
      else if (quick?.interview) report = { ...local, ...quick, model: this.brain?.model || null };
      else if (quick) report = { ...local, ...quick, interview: true, verdict: local.verdict, criteria: local.criteria, improvements: local.improvements, rewrite: local.rewrite, model: this.brain?.model || null };
      else report = local;
    } else if (this.live) report = await this.brain.report(endNote({ turns: this.turns }), 15000);
    if (!report) report = offlineReport(this.turns);
    this.toast.hide();
    const missions = this.variant.missionsEn.map((m) => ({
      text: m.text,
      done: !m.grammar?.length ? this.turns.some((t) => t.score >= 1)
        : this.turns.some((t) => t.score >= 2 && (t.grammar.some((g) => m.grammar.includes(g)) || t.grammarUsed.some((g) => m.grammar.includes(g)))),
    }));
    this.brain?.close();
    this.brain = null;
    this.onDone?.({ report, turns: this.turns, missions });
  }
}
