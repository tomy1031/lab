// companion/companion.js — the companion as a game system (DESIGN.md §13):
//   • a VRM avatar (avatar.js) moved by CompanionBody (body.js)
//   • a Body (the same physiology as the player, needs × 0.8) and a small inventory
//   • trust / affinity / mood, the behaviour priorities of §13.4 (danger → urgent needs → your orders → sleep →
//     jobs → normal needs → leisure) and five jobs (wood, food, water, fishing, tend the fire)
//   • scripted lines (data/lines.js) as subtitles + a little synthesized voice when there is no API key
//   • with a Gemini key: voice conversation (talk.js) with tools, and memory (memory.js) compressed by Live
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { CompanionBody } from './body.js';
import { Voice } from './voice.js';
import { Mic } from './mic.js';
import { CompanionMemory } from './memory.js';
import { CompanionTalk } from './talk.js';
import { Body, fireWarmth } from '../sim/body.js';
import { Inventory } from '../sim/inventory.js';
import { PERSONAS, systemPrompt, callYouFor } from '../data/personas.js';
import { pickLine } from '../data/lines.js';
import { itemDef } from '../data/items.js';
import { getApiKey } from '../core/save.js';
import { rollSheet, derived, stageOf, STAGES, acceptChance, jobMultiplier, bestJobs, selfAwareness } from '../sim/companion-sheet.js';
import { PROFESSIONS } from '../data/professions.js';
import { assess, stateText, detectTriggers, TRIGGERS, JOB_LABEL } from './plans.js';
import * as CT from '../data/consult.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const AVAILABLE = { nagi: true, touko: true, gen: false };

// abstract jobs (§13.4). Output per game hour is multiplied by the sheet's jobMultiplier (§23.5).
const JOBS = {
  gather_wood: { name: '薪あつめ', pose: 'gather', zones: ['jungle', 'grass'], perHour: [['branch', 5], ['twig', 4]] },
  gather_food: { name: '食べ物さがし', pose: 'gather', zones: ['beach', 'grass', 'jungle'], perHour: [['coconut', 1], ['berry', 3], ['shellfish', 2]] },
  fetch_water: { name: '水くみ', pose: 'gather', zones: ['stream'], perHour: [], needsContainer: true },
  fish: { name: '釣り・漁', pose: 'fish', zones: ['beach', 'rocks'], perHour: [['sardine', 1]], sea: true },
  tend_fire: { name: '火の 番', pose: 'sit', zones: [], perHour: [] },
};
const SHEET_TRAITS = ['coldLow', 'hotHigh', 'illness', 'regen', 'nightFear', 'moraleDrain', 'moraleJungleNight'];

export class Companion {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    this.p = PERSONAS[id] || PERSONAS.nagi;
    this.name = this.p.short || this.p.name;
    this.body = null;      // CompanionBody (movement)
    this.vitals = new Body({ rng: game.rng, diff: game.diff, drainMul: 0.8, bus: game.bus, isPlayer: false, name: this.name });
    this.vitals.s.morale = 65;
    this.inv = new Inventory(10);
    this.trust = 40; this.affinity = 20;
    // §23: the character sheet rolled on the setup screen (or rolled now for quick starts / old saves)
    const given = game.setup?.companionSheet;
    this.setSheet(given && given.char === id ? JSON.parse(JSON.stringify(given)) : rollSheet(id, game.setup?.profession || 'auto', () => game.rng.next()));
    if (Number.isFinite(game.setup?.companionAffinity)) this.affinity = clamp(game.setup.companionAffinity, 0, 100);
    this.stage = stageOf(this.affinity);
    this.refused = {};           // job id → game minute it was refused (asking again right away is pointless)
    this.lastKindT = -999;       // last time the player gave food / a gift / treatment (§23.7 recentKindness)
    this.lastShareT = -999;
    this.idleSince = 0;
    this.pendingPlan = null;     // a proposal waiting for the player's answer (§24.8)
    this.agreedPlan = null;      // { job, t } the player said お願い / 一緒に
    this.together = null;        // { job, until } doing it together: your hand-work tol ×1.1
    this.trigT = {};             // trigger id → game minute last fired (30-minute cool-down)
    this.lastProposalT = -999;
    this.mood = 'normal';
    this.order = 'follow';       // follow | wait | job | base
    this.job = null;             // { id, until (game min), acc }
    this.lastSay = -999; this.sayCooldown = 25;
    this.memory = new CompanionMemory(`isle.memory.${game.setup.seed}.${id}`, this.name);
    this.talk = null;
    this.ready = false;
    this.dayFlags = {};
  }

  init(game) {
    this.game = game;
    this.voice = new Voice(game.audio);
    this.mic = new Mic(game.audio);
    const bus = game.bus;
    bus.on('fire:lit', () => { if (!this.saidFirstFire) { this.saidFirstFire = true; this.say('first_fire'); this.memoryEvent('初めて 火が ついた'); } });
    bus.on('item:gained', (e) => { if (/sardine|jack|seabream|grouper|wrasse|goby|eel|trevally/.test(e.id) && this.near(15)) this.say(e.id === 'puffer' ? 'puffer' : 'fish_caught'); if (e.id === 'puffer' && this.near(15)) this.say('puffer'); });
    bus.on('weather', (e) => { if (['drizzle', 'rain'].includes(e.type)) this.say('rain_start'); });
    bus.on('typhoon:omen', () => this.say('storm_sign'));
    bus.on('condition', (c) => { if (c.isPlayer && this.near(25)) { this.say('player_sick'); this.memoryEvent(`あなたが ${c.name}に なった`); } });
    bus.on('day', () => {
      this.say('morning', true); this.dayFlags = {}; this.dailyRelation();
      // §26.8: mornings are for checking traps
      if (this.game.sys.traps?.list?.length && this.near(30)) import('../data/fieldcraft.js').then((F) => setTimeout(() => { if (F.TRAP_MORNING?.[this.id]) this.speak(F.TRAP_MORNING[this.id]); }, 6000)).catch(() => {});
    });
    bus.on('hour', (h) => { if (Math.floor(h.hour) === 18 && this.near(30)) this.say('sunset'); if (this.game.sys.player.zone === 'jungle' && (h.hour >= 19 || h.hour < 5) && this.near(10)) this.say('night_jungle'); });
    bus.on('ship:pass', () => this.say('ship_seen', true));
    bus.on('eat', (e) => { if (e.isPlayer && e.p > 0.1 && this.id === 'touko' && this.near(10)) this.say('raw_eat_warn', true); });
    bus.on('craft:done', (e) => { if ((e.stack?.q ?? 0) >= 75 && this.near(12)) this.say('praise_craft'); });
    bus.on('log', (e) => this.memoryEvent(e.text));
    bus.on('sleep:start', () => this.compressMemory('bedtime'));
    bus.on('game:end', () => { this.talk?.stop(); });
    bus.on('choice:pick', (e) => { if (this.pendingPlan) this.answer(e.id); });
  }

  /** §23.5: the sheet's derived values drive the body, the bag, the legs and the chatter */
  setSheet(sheet) {
    this.sheet = sheet;
    if (this.game?.setup) this.game.setup.companionSheet = sheet; // the score (§23.6) and the save use the sheet actually played
    const d = this.derived = derived(sheet);
    this.vitals.drainMul = d.appetite;                    // already includes the companion's ×0.8 and sex ×0.9
    const t = {}; for (const k of SHEET_TRAITS) t[k] = d[k];
    this.vitals.setTraits(t);
    this.inv.capacity = Math.round(d.carry * 10) / 10;
    this.speedMul = d.speed / 4.0;
    if (this.body) this.body.speedMul = this.speedMul;
    this.chatMul = d.chatMul;
    this.profName = PROFESSIONS[sheet.profession]?.short || '';
    this.noKill = !!(sheet.flaw?.noKill || (sheet.quirks || []).some((q) => q.noKill));
    this.noSea = sheet.profession === 'farmer' || (sheet.quirks || []).some((q) => q.swimFixed === 0);
  }
  get stageInfo() { return STAGES[this.stage - 1]; }
  /** the profession perk (§23.3) works when the partner stands near you, awake and well */
  perkNear(id, r = 10) { return this.sheet?.perk?.id === id && this.ready && !this.dead && this.body?.mode !== 'sleep' && this.near(r); }

  /** load the avatar (lazy: after the setup screen, §17.4) */
  async load() {
    const g = this.game;
    try {
      const av = await Avatar.load(`assets/companions/${this.p.model === 'seed-san' ? 'seed-san' : 'hana'}.vrm`, g.world.scene);
      this.avatar = av;
      if (this.id === 'nagi') this.tint(av, '#3d78c9'); // ナギ: the blue parka colour on the shirt
      this.body = new CompanionBody(g, av);
      this.body.speedMul = this.speedMul;
      const P = g.player.pos;
      this.body.place(P.x + 2, P.z + 1.5);
      this.ready = true;
      setTimeout(() => this.say('meet', true), 2500);
      this.memoryEvent(`${g.clock.day}日目、浜で ${callYouFor(this.p, this.affinity)}と 出会った`);
    } catch (e) {
      console.warn('companion model failed', e);
      g.bus.emit('toast', { text: `${this.name}の モデルを 読み込めなかった`, kind: 'bad' });
    }
  }

  tint(av, color) {
    av.vrm.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) if (/shirt|tops|cloth|body_00_cloth|Tops/i.test(m.name || '') && m.color) m.color.lerp(new THREE.Color(color), 0.55);
    });
  }

  get pos() { return this.body?.pos || this.game.player.pos; }
  near(r = 10) { return !!this.body && this.body.pos.distanceTo(this.game.player.pos) < r; }
  huddling() { return this.affinity >= 60 && this.body?.mode === 'sleep' && this.near(2.5); }
  helping() { return this.near(8) && this.trust >= 30; }
  /** building time multiplier while helping (§23.5 建築の手伝い): 0.6 for an average helper, down to 0.4 for a master */
  buildHelpMul() { const m = jobMultiplier(this.sheet, 'build_help', { stage: this.stage, morale: this.vitals.s.morale }); return clamp(0.6 / Math.max(0.1, m), 0.4, 0.9); }
  get liveAvailable() { return !!(this.game.apiKey || getApiKey()); }

  // ---------------------------------------------------------------- speech
  say(trigger, force = false, vars = {}) {
    const now = this.game.clock.total;
    if (!this.ready || this.talk?.state === 'live') return;
    if (!force && now - this.lastSay < this.sayCooldown) return;
    if (this.dayFlags[trigger] && !force) return;
    const text = pickLine(this.id, trigger, () => this.game.rng.next(), { affinity: this.affinity, playerName: this.game.setup.playerName, ...vars });
    if (!text) return;
    this.lastSay = now; this.dayFlags[trigger] = true;
    this.speak(text);
  }
  speak(text) {
    this.lastSpoken = text;
    this.game.bus.emit('subtitle', { who: this.name, text, final: true });
    this.game.bus.emit('companion:say', { text, who: this.name, __shown: true });
    this.voice.mumble(text, this.p.pitch || 1);
    this.memory.add('companion', text, { day: this.game.clock.day, hour: Math.floor(this.game.clock.hour) });
    this.memory.closeTurn();
  }
  memoryEvent(text) { if (text) this.memory.add('event', text, { day: this.game.clock.day, hour: Math.floor(this.game.clock.hour) }); }

  // ---------------------------------------------------------------- the companion menu (js/ui/s-companion.js)
  topics() {
    const t = [{ id: 'consult', label: '相談する（どう しよう？）', icon: '🤔' }, { id: 'chat', label: '雑談する', icon: '💬' }, { id: 'advice', label: 'サバイバルの 知恵を 聞く', icon: '💡' }, { id: 'weather', label: '天気は どうなりそう？', icon: '☁️' }];
    const next = [20, 40, 60, 80].findIndex((lv, i) => this.affinity >= lv && !this.memory.data[`story${i}`]);
    if (next >= 0) t.push({ id: `story${next}`, label: '身の上話を 聞く', icon: '📖' });
    const prof = this.sheet.profession;
    if (prof === 'botanist' || (this.id === 'touko' && this.trust >= 50)) t.push({ id: 'identify', label: '持っている 草や キノコを 見てもらう', icon: '🔍' });
    if (prof === 'fisher' || (this.id === 'nagi' && this.trust >= 50)) t.push({ id: 'fishtip', label: '魚の ことを 聞く', icon: '🐟' });
    return t;
  }
  /** a talk-tab topic (the Live session lives in this.talk, so this is not called talk) */
  discuss(topic) {
    this.lastSpoken = '';
    if (topic === 'consult') return this.consult();
    this.talkTopic(topic);
    return this.lastSpoken || '';
  }
  talkTopic(topic) {
    const g = this.game;
    if (!this.dayFlags.talkCount) this.dayFlags.talkCount = 0;
    if (this.dayFlags.talkCount++ < 8) this.adjust(0, 0.5);
    g.sys.player.body.moraleOnce('talk', 2, g.clock.day, 6);
    if (topic?.startsWith('story')) { const i = Number(topic.slice(5)); this.memory.data[`story${i}`] = true; this.say(`story_${i + 1}`, true); g.stats.storiesHeard = (g.stats.storiesHeard || 0) + 1; return; }
    if (topic === 'weather') { const W = g.sys.weather; const next = W.forced?.length ? 'storm' : W.type; this.speak(next === 'storm' || W.type === 'storm' ? (this.id === 'gen' ? 'ひざが 痛む。荒れるぞ。' : '空が あやしいよ。早めに 屋根を 作ろう！') : W.rain > 0.2 ? '今は 雨だね。止むまで 屋根の 下に いよう。' : '今日は もちそう。でも 夕方は 分からないよ。'); return; }
    if (topic === 'identify') {
      const plants = g.sys.player.inv.stacks.filter((s) => itemDef(s.id)?.guide && g.sys.knowledge && g.sys.knowledge.level(itemDef(s.id).guide) < 3 && ['food', 'herb'].includes(itemDef(s.id).cat));
      if (!plants.length) { this.speak('今は 見せてもらう 物が ないみたいですね。'); return; }
      for (const s of plants.slice(0, 3)) g.sys.knowledge.learn(itemDef(s.id).guide, 3, 'トウコに 聞いた');
      this.speak(`${plants.slice(0, 3).map((s) => itemDef(s.id).name).join('、')}… 見分け方を お教えしますね。図鑑に 書いておいてください。`);
      return;
    }
    if (topic === 'fishtip') { this.say('fish_freshness', true); return; }
    if (topic === 'advice') { this.say(this.game.rng.pick(['raw_eat_warn', 'cold', 'rain_start', 'hungry']), true); return; }
    this.say(this.game.rng.pick(['item_react', 'morning', 'sunset', 'praise_craft']), true);
  }
  ask(id) {
    if (id === 'follow') return this.follow();
    if (id === 'wait') return this.wait();
    const r = this.doJob(id, { asked: true });
    if (r === 'ok') this.say('accept', true);
    return r;
  }

  // ---------------------------------------------------------------- 相談して 頼む (§24.8)
  /** a staged line from data/consult.js: string | { text, stage } */
  pickText(list, vars = {}) {
    if (!list?.length) return '';
    const ok = list.filter((l) => typeof l === 'string' || l.stage == null || [].concat(l.stage).includes(this.stage));
    const pool = ok.length ? ok : list;
    const l = pool[Math.min(pool.length - 1, Math.floor(this.game.rng.next() * pool.length))];
    const raw = typeof l === 'string' ? l : l.text;
    return raw.replace(/\{you\}/g, callYouFor(this.p, this.affinity, this.game.setup.playerName)).replace(/\{job\}/g, vars.job || '').replace(/\{item\}/g, vars.item || 'それ');
  }

  /** look at the situation and propose 1–2 plans. Returns { text, choices, situation } (the talk tab shows the buttons). */
  consult({ sit = null, proactive = false } = {}) {
    const all = assess(this, 7);
    const top = (sit && all.find((x) => x.id === sit)) || all[0];
    const plans = top.plans.filter((p) => p.job && JOBS[p.job]).slice(0, 2);
    const text = this.pickText(CT.CONSULT?.[this.id]?.[top.id], { job: JOB_LABEL[plans[0]?.job] }) ||
      (plans.length ? `${plans[0].label}、やろうか？` : '今は 落ち着いてる。図鑑でも うめに 行く？');
    this.speak(text);
    this.pendingPlan = { sit: top.id, plans, t: this.game.clock.total };
    const choices = plans.length
      ? [{ id: 'ok', label: `お願い（${plans[0].label}）`, key: 'Y' }, { id: 'together', label: '一緒に やろう', key: 'U' }, { id: 'no', label: 'いや、いい', key: 'N' }]
      : [{ id: 'no', label: 'そうだね', key: 'N' }];
    if (proactive) this.game.bus.emit('choice:show', { who: this.id, text, choices });
    return { text, choices, situation: top.id };
  }

  /** the player's answer to a proposal: ok (the companion starts the job) / together / no */
  answer(id) {
    const pp = this.pendingPlan;
    this.pendingPlan = null;
    this.game.bus.emit('choice:hide');
    if (!pp || id === 'timeout') return '';
    this.lastSpoken = '';
    const plan = pp.plans[0], now = this.game.clock.total, A = CT.CONSULT_ANSWER?.[this.id] || {};
    let note = '';
    if (id === 'ok' && plan) {
      this.agreedPlan = { job: plan.job, t: now };
      if (plan.lend) { // 水くみ: hand over an empty container first
        const inv = this.game.sys.player.inv, box = inv.get(plan.lend);
        if (box) { const part = inv.take(box.uid, 1)[0]; this.inv.addStack(part); this.game.sys.player.validate?.(); this.game.bus.emit('toast', { text: `${itemDef(part.id)?.name}を ${this.name}に 預けた`, kind: 'info' }); }
      }
      const r = this.doJob(plan.job, { self: true }); // its own idea: always does it (§24.8 引き受け)
      if (r === 'ok') this.speak(this.pickText(A.ok, { job: JOB_LABEL[plan.job] }) || 'まかせて！');
      note = r === 'ok' ? `プレイヤーは「お願い」と 答えた。あなたは ${plan.label}を 始めた。` : `プレイヤーは「お願い」と 答えたが、${r}`;
    } else if (id === 'together') {
      this.follow();
      this.together = { job: plan?.job || null, until: now + 120 };
      this.agreedPlan = plan ? { job: plan.job, t: now } : null;
      this.adjust(0, 0.5);
      this.speak(this.pickText(A.together, { job: JOB_LABEL[plan?.job] }) || 'うん、一緒に やろ！');
      note = `プレイヤーは「一緒に やろう」と 答えた。あなたは プレイヤーに ついて いき、${plan?.label || '作業'}を 手伝う。`;
    } else {
      this.speak(this.pickText(A.no) || 'わかった。');
      note = 'プレイヤーは「いや、いい」と 答えた。';
    }
    if (this.talk?.state === 'live') this.talk.event(`[返事] ${note}`, true, true);
    return this.lastSpoken;
  }
  togetherActive() { return !!this.together && this.game.clock.total < this.together.until && this.near(8); }

  /** game → companion triggers (§24.8 きっかけ): 30 min cool-down each. Live: a [きっかけ] note; keyless: a proposal with buttons. */
  checkTriggers() {
    const g = this.game, now = g.clock.total;
    for (const id of detectTriggers(this)) {
      if (now - (this.trigT[id] ?? -999) < 30) continue;
      this.trigT[id] = now;
      this.onTrigger(id);
    }
  }
  onTrigger(id) {
    const T = TRIGGERS[id], g = this.game, now = g.clock.total;
    if (!T) return;
    if (this.talk?.state === 'live') { this.talk.event(`[きっかけ:${id}] ${T.text}。${stateText(this)}`, true); return; }
    if (!T.sit || !this.near(15) || this.order !== 'follow' || this.job || this.body?.mode === 'sleep' || this.pendingPlan) return;
    if (this.stage <= 1 || now - this.lastProposalT < 60) return;   // stage 1 does only what it is asked (§23.7)
    this.lastProposalT = now;
    // stage 4+: says it and goes (言ってから 自分で 動く), unless the job is risky; otherwise asks first
    if (this.stage >= 4 && this.trust >= 40) {
      const plan = assess(this, 7).find((x) => x.id === T.sit)?.plans.find((p) => p.job && JOBS[p.job]);
      const f = plan && this.requestFactors(plan.job);
      if (plan && !f.danger && !f.dislike && !JOBS[plan.job].sea && this.doJob(plan.job, { self: true }) === 'ok') {
        this.speak(CT.JOB_TALK?.[this.id]?.[plan.job] || `${plan.label}、行ってくる。`);
        return;
      }
    }
    this.consult({ sit: T.sit, proactive: true });
  }

  /** Live tool ask_job: the game decides acceptance (§23.7), never the model */
  askJobTool(job, by = 'player') {
    if (job === 'stop') { this.follow(); return 'stopped the job; following the player'; }
    if (!JOBS[job]) return `unknown job (use one of ${Object.keys(JOBS).join(', ')})`;
    const now = this.game.clock.total;
    if (by === 'self') {
      const agreed = this.agreedPlan?.job === job && now - this.agreedPlan.t < 30;
      const f = this.requestFactors(job);
      if (!agreed && (this.stage < 4 || f.danger || f.dislike || JOBS[job].sea)) return 'not allowed on your own: call propose_plan and wait for the player\'s answer ([返事])';
      const r = this.doJob(job, { self: true });
      return r === 'ok' ? `started ${JOB_LABEL[job]}` : `could not start: ${r}`;
    }
    const r = this.doJob(job, { asked: true });
    if (r === 'ok') return `accepted: you started ${JOB_LABEL[job]}`;
    return `refused (${this.refuseReason(job, r)}). Tell the player why, in your own words`;
  }
  refuseReason(job, r = '') {
    const f = this.requestFactors(job);
    if (/container/.test(r)) return '入れ物が ない';
    if (/too soon/.test(r)) return 'さっき 断った ばかり';
    if (f.danger) return '危ない（嵐か、まだ そこまで 信用して いない）';
    if (f.sick) return '体調が 悪い';
    if (f.morale < 30) return '気力が ない';
    if (f.dislike) return this.game.clock.hour >= 19 || this.game.clock.hour < 5 ? '夜は こわい' : '苦手な 仕事';
    return f.trust < 30 ? 'まだ 打ち解けて いない' : '今は 気が 進まない';
  }
  /** Live tool propose_plan: show the plan with answer buttons */
  proposePlanTool(plans = []) {
    const ok = (plans || []).filter((p) => JOBS[p.job]).slice(0, 2).map((p) => ({ job: p.job, who: p.who || 'companion', label: JOB_LABEL[p.job], reason: p.reason || '' }));
    if (!ok.length) return 'no valid job in the plan';
    this.pendingPlan = { sit: 'live', plans: ok, t: this.game.clock.total };
    const text = ok.map((p) => `${p.label}${p.reason ? `（${p.reason}）` : ''}`).join(' ／ ');
    this.game.bus.emit('choice:show', { who: this.id, text, choices: [{ id: 'ok', label: `お願い（${ok[0].label}）`, key: 'Y' }, { id: 'together', label: '一緒に やろう', key: 'U' }, { id: 'no', label: 'いや、いい', key: 'N' }] });
    return 'shown to the player with buttons. Wait for the [返事] message; the game starts the job if they agree';
  }

  /** §23.7: what makes a request hard for this person right now */
  requestFactors(id) {
    const g = this.game, W = g.sys.weather, hour = g.clock.hour, s = this.vitals.s;
    const storm = W.type === 'storm' || W.type === 'typhoon';
    const night = hour < 5 || hour >= 19;
    const j = JOBS[id] || {};
    let danger = false, dislike = false;
    if (storm && id !== 'tend_fire') danger = true;
    else if (j.sea && W.rain > 0.5) danger = 0.15;
    if (night && id !== 'tend_fire') dislike = true;
    if (j.sea && (this.noSea || (this.noKill && this.trust < 70))) dislike = true;
    if (this.sheet.profession === 'student') dislike = false;     // 伸びしろ：何でも 断らない
    return { affinity: this.affinity, trust: this.trust, danger, dislike, morale: s.morale, sick: this.vitals.visible().some((c) => c.sev >= 2), recentKindness: g.clock.total - this.lastKindT < 120 };
  }
  acceptChanceFor(id) { return acceptChance(this.sheet, this.requestFactors(id)); }
  status() { return { s: this.vitals.s, trust: this.trust, affinity: this.affinity, mood: this.mood, conditions: this.vitals.visible(), inv: this.inv.stacks }; }
  /** the player takes something from the companion's bag. Food follows §23.7 分け方 (stage 1 keeps its own food unless you are starving). */
  take(uid, n = 1) {
    const s = this.inv.get(uid); if (!s) return false;
    const d = itemDef(s.id);
    if (d?.food) {
      const P = this.game.sys.player.body.s, st = this.stage;
      const foodUnits = this.inv.stacks.filter((x) => itemDef(x.id)?.food).reduce((a, x) => a + x.n, 0);
      const no = st === 1 ? P.food >= 15 : st === 2 ? foodUnits <= 1 && this.vitals.s.food < 50 : false;
      if (no) {
        this.speak(this.id === 'gen' ? '…それは おれの 分だ。自分で 取ってこい。' : this.id === 'touko' ? 'すみません、それは わたしの 分なので…。' : 'えっ… それ、あたしの ごはん なんだけど。');
        this.adjust(-0.5, -0.5);
        return false;
      }
    }
    const part = this.inv.take(uid, n)[0]; this.game.sys.player.inv.addStack(part); return true;
  }
  treat(uid) {
    const inv = this.game.sys.player.inv, s = inv.get(uid), d = s && itemDef(s.id, s);
    if (!d?.med) return false;
    const map = { burn: 'aloe', bleed: 'herb_stop_bleed', infection: 'poultice', cold: 'ginger', diarrhea: 'guava', poison: 'charcoal', fever: 'fever', venom: 'suction', wound: 'bandage', antibiotic: 'antibiotic' };
    const ok = this.vitals.treat(map[d.med.type] || d.med.type, d.med.power ?? 1);
    if (ok) { inv.take(uid, 1); this.adjust(5, 3); this.kindness(); this.speak(this.id === 'gen' ? '…すまねえ。' : 'ありがとう…楽に なった。'); }
    return ok;
  }
  startMic() { return this.talkKey(); }
  stopMic() { this.talk?.stop(); }
  startLive() { return this.talkKey(); }
  stopLive() { this.talk?.stop(); }

  // ---------------------------------------------------------------- orders / menu
  call() { if (!this.body) return; this.order = 'follow'; this.job = null; this.body.follow(); this.body.gesture('wave', 1.5); this.game.bus.emit('toast', { text: `${this.name}を 呼んだ`, kind: 'info' }); }
  follow() { this.order = 'follow'; this.job = null; this.body?.follow(); return 'ok'; }
  wait() { this.order = 'wait'; this.job = null; this.body?.wait(); return 'ok'; }
  jobs() {
    const icons = { gather_wood: '🪵', gather_food: '🥥', fetch_water: '💧', fish: '🎣', tend_fire: '🔥' };
    const best = new Set(bestJobs(this.sheet, 3, { stage: this.stage }).map((b) => b.id));
    const night = this.game.clock.hour < 5 || this.game.clock.hour >= 19;
    const list = Object.entries(JOBS).map(([id, j]) => {
      const noBox = j.needsContainer && !this.inv.stacks.some((s) => itemDef(s.id)?.container);
      const sulk = this.game.clock.total - (this.refused[id] ?? -999) < 30;
      const mult = jobMultiplier(this.sheet, id, { stage: this.stage, morale: this.vitals.s.morale, night });
      const p = this.acceptChanceFor(id);
      const chance = p >= 0.85 ? 'きっと やって くれる' : p >= 0.6 ? 'たぶん 引き受ける' : p >= 0.35 ? '五分五分' : p > 0 ? '断られそう' : '今は 無理';
      const reason = noBox ? '入れ物を 渡して' : sulk ? 'さっき 断られた（少し 待って）' : p <= 0 ? '危ないので 嫌がる（信頼 60 から）' : '';
      return { id, name: j.name, label: j.name, icon: icons[id], desc: `${best.has(id) ? '得意・' : ''}成果 ×${mult.toFixed(1)}・${chance}`, fav: best.has(id), mult, chance: p, available: !reason, ok: !reason, reason };
    });
    return [{ id: 'follow', label: 'ついてきて', name: 'ついてきて', icon: '👣', available: true }, { id: 'wait', label: 'ここで 待って', name: 'ここで 待って', icon: '✋', available: true }, ...list];
  }
  doJob(id, { asked = true, self = false } = {}) {
    const j = JOBS[id];
    if (!j || !this.body) return 'unknown job';
    if (j.needsContainer && !this.inv.stacks.some((s) => itemDef(s.id)?.container)) { this.speak(this.id === 'gen' ? '入れ物が ねえと 水は 運べん。' : this.id === 'touko' ? '入れ物が ないと、水は 運べません。' : '入れ物が ないと 水を 運べないよ'); return 'needs a container'; }
    if (asked && !self) {
      // §23.7 協力度: affinity, trust, danger, dislikes, morale, sickness, a recent kindness
      const now = this.game.clock.total;
      if (now - (this.refused[id] ?? -999) < 30) { this.say('refuse', true); return 'refused (asked again too soon)'; }
      const p = this.acceptChanceFor(id);
      if (this.game.rng.next() >= p) {
        this.refused[id] = now;
        this.say('refuse_reason', true);
        this.adjust(-0.5, 0);
        return p <= 0 ? 'refused: too dangerous now' : 'refused';
      }
    }
    this.order = 'job';
    this.job = { id, acc: 0, start: this.game.clock.total };
    if (id === 'tend_fire') {
      const f = this.game.sys.fires?.nearest(this.game.player.pos, 40);
      if (f) this.body.goTo(f.fire.group.position.x + 1.5, f.fire.group.position.z, { then: () => this.body.sit() });
    } else {
      const t = this.game.world.terrain;
      const p = t.randomPointIn(this.game.rng, j.zones, 120, (x, z) => Math.hypot(x - this.body.pos.x, z - this.body.pos.z) < 70) || { x: this.body.pos.x + 10, z: this.body.pos.z };
      this.body.goTo(p.x, p.z, { then: () => this.body.work(j.pose) });
    }
    return 'ok';
  }
  tendingFire(rec) { return this.job?.id === 'tend_fire' && this.body && rec && rec.fire.group.position.distanceTo(this.body.pos) < 4; }

  /** the player hands something over (food when hungry earns trust, §13.3) */
  receive(uid, n = 1) {
    const inv = this.game.sys.player.inv;
    const s = inv.get(uid);
    if (!s) return false;
    const part = inv.take(uid, n)[0];
    this.game.sys.player.validate();
    const d = itemDef(part.id, part);
    if (d?.food && this.vitals.s.food < 60) {
      this.vitals.eat({ name: d.name, food: d.food.food, water: d.food.water, B: d.food.B, parasite: d.food.parasite, fresh: part.fresh, done: part.done, poison: d.food.poison ? { ...d.food.poison, cookable: !!d.food.poison.heatKills } : null });
      if (this.vitals.s.food < 50) this.adjust(2, 1); else this.adjust(0, 1);
      this.kindness();
      this.speak(this.id === 'gen' ? '…助かる。' : this.id === 'touko' ? 'ありがとうございます。いただきます。' : 'やった！ ありがと！');
    } else {
      this.inv.addStack(part);
      const liked = (this.p.likes || []).includes(part.id);
      if (liked && !this.dayFlags.gift) { this.adjust(1, 4); this.kindness(); this.say('gift', true, { item: d?.name }); this.dayFlags.gift = true; }
      else this.say('item_react', true, { item: d?.name });
    }
    this.memoryEvent(`${d?.name}を もらった`);
    return true;
  }
  give(itemName, count = 1) {
    const s = this.inv.stacks.find((x) => x.id === itemName || itemDef(x.id)?.name === itemName || (itemDef(x.id)?.name || '').includes(itemName));
    if (!s) return 'I do not have it';
    const part = this.inv.take(s.uid, count)[0];
    this.game.sys.player.inv.addStack(part);
    this.game.bus.emit('toast', { text: `${this.name}から ${itemDef(part.id)?.name}を もらった`, kind: 'good' });
    return 'given';
  }
  adjust(trust, aff) {
    this.trust = clamp(this.trust + trust, 0, 100); this.affinity = clamp(this.affinity + aff, 0, 100); this.memory.adjust(trust, aff);
    if (aff > 0) this.gainedToday = true;
    const st = stageOf(this.affinity);
    if (st !== this.stage) {
      const up = st > this.stage;
      this.stage = st;
      const info = STAGES[st - 1];
      this.game.bus.emit('companion:stage', { stage: st, name: info.name, up });
      this.game.bus.emit('toast', { text: `${this.name}との 関係：${info.name}${up ? ' ♥' : ''}`, kind: up ? 'good' : 'info' });
      if (up) { this.say('stage_up', true); this.memoryEvent(`${callYouFor(this.p, this.affinity)}との 距離が 縮まった（${info.name}）`); }
      else this.memoryEvent(`${callYouFor(this.p, this.affinity)}との 間に 少し 距離が できた`);
    }
  }
  kindness() { this.lastKindT = this.game.clock.total; }
  nightTogether() { this.adjust(1, 1); }
  /** §13.3 自然減: −0.5 only after a day in which nothing brought you closer (none at 60+) */
  dailyRelation() { const gained = this.gainedToday; this.gainedToday = false; if (!gained && this.affinity < 60) this.adjust(0, -0.5); }

  hudInfo() { return { name: this.name, mood: this.mood, hp: Math.round(this.vitals.s.hp), near: this.near(12), order: this.order, job: this.job ? JOBS[this.job.id].name : null, trust: this.trust, affinity: this.affinity, stage: this.stage, stageName: this.stageInfo.name, profession: this.profName, talking: this.talk?.state === 'live' }; }

  // ---------------------------------------------------------------- Gemini Live
  async talkKey() {
    const key = this.game.apiKey || getApiKey();
    if (!key) { this.game.screens?.show('companion'); return; }
    if (this.talk?.state === 'live' || this.talk?.state === 'connecting') { this.talk.stop(); this.game.bus.emit('toast', { text: `${this.name}との 会話を 終えた`, kind: 'info' }); return; }
    this.talk = new CompanionTalk({
      apiKey: key, persona: systemPrompt(this.p, { playerName: this.game.setup.playerName, trust: this.trust, affinity: this.affinity, mood: this.mood, profession: this.sheet.profession, selfAwareness: selfAwareness(this.sheet, this.p).join('\n') }) +
        ((this.game.settings?.butcherView || 'mild') !== 'normal' ? '\n- 解体や ケガの 話は 生々しい 言葉を さけ、「下ごしらえ」「中身」の ように やわらかく 言う。' : ''),
      voiceName: this.p.voice, memory: this.memory, voice: this.voice, mic: this.mic,
      places: Object.values(this.game.world.layout).map((p) => p.name).filter(Boolean),
      jobs: Object.keys(JOBS),
      when: () => ({ day: this.game.clock.day, hour: Math.floor(this.game.clock.hour) }),
      onStatus: (st, info) => { this.game.bus.emit('toast', { text: { connecting: `${this.name}と つないでいます…`, live: `🎤 ${this.name}と 話せます（T で 終わる）`, error: `会話に つなげなかった（${info}）`, mic: 'マイクが 使えない', reconnecting: '再接続中…' }[st] || '', kind: st === 'error' ? 'bad' : 'info' }); },
      onSubtitle: (who, text, final) => this.game.bus.emit('subtitle', { who: who === 'companion' ? this.name : 'あなた', text, final }),
      onNeedCompress: () => this.compressMemory('size'),
      actions: {
        follow: () => this.follow(), wait: () => this.wait(),
        goTo: (place) => { const p = Object.values(this.game.world.layout).find((x) => x.name === place); if (!p) return 'unknown place'; this.order = 'goto'; this.body.goTo(p.x, p.z); return 'walking'; },
        askJob: (job, by) => this.askJobTool(job, by),
        proposePlan: (plans) => this.proposePlanTool(plans),
        give: (item, n) => this.give(item, n),
        express: (emotion, gesture) => { this.avatar?.setMood(emotion && emotion !== 'neutral' ? { [emotion]: 1 } : {}); if (gesture && gesture !== 'none') { if (gesture === 'sit') this.body.sit(); else this.body.gesture(gesture, 2.5); } return 'ok'; },
        status: () => `${this.statusText()} ${stateText(this)}`,
      },
    });
    const ok = await this.talk.start();
    if (ok) { this.adjust(0, 0.5); this.game.sys.player.body.moraleOnce('talk', 2, this.game.clock.day, 6); }
  }

  statusText() {
    const g = this.game, P = g.sys.player.body.s, C = this.vitals.s;
    const lvl = (v) => (v > 70 ? '十分' : v > 40 ? 'ふつう' : v > 15 ? '少ない' : 'ほとんど ない');
    const inv = g.sys.player.inv.stacks.slice(0, 12).map((s) => `${itemDef(s.id)?.name}×${s.n}`).join('、');
    return `${g.clock.label()}、天気 ${g.sys.weather.name}、気温 ${Math.round(g.sys.weather.airTemp(g.clock.hour))}℃、潮 ${g.clock.tide() > 0.3 ? '満ち' : g.clock.tide() < -0.3 ? '引き' : '中くらい'}。` +
      `あなた（プレイヤー）：体力 ${lvl(P.hp)}・満腹 ${lvl(P.food)}・水分 ${lvl(P.water)}・体温 ${P.bodyTemp.toFixed(1)}℃・濡れ ${P.wet > 50 ? 'びしょ濡れ' : '乾いている'}・状態 ${g.sys.player.body.visible().map((c) => c.name).join('、') || 'なし'}。` +
      `${this.name}（あなた自身）：満腹 ${lvl(C.food)}・水分 ${lvl(C.water)}・体温 ${C.bodyTemp.toFixed(1)}℃。持ち物（プレイヤー）：${inv}。火：${g.fires?.some((f) => f.lit) ? 'ついている' : 'ない'}。場所：${g.sys.player.zone}。`;
  }

  async compressMemory(why) {
    const key = this.game.apiKey || getApiKey();
    const r = await this.memory.compress({ apiKey: key, day: this.game.clock.day, persona: `The character is ${this.p.name}.` });
    if (r.ok && this.talk?.state === 'live' && why !== 'bedtime') this.talk.refreshMemory();
  }

  // ---------------------------------------------------------------- simulation
  envAt() {
    const g = this.game, W = g.sys.weather, pos = this.pos, hour = g.clock.hour;
    const sh = g.sys.building?.shelterAt?.(pos.x, pos.z) || { rain: 0, wind: 0, insul: 0 };
    let fire = 0, fireNear = false;
    for (const f of g.fires || []) { if (!f.lit) continue; const d = Math.hypot(f.group.position.x - pos.x, f.group.position.z - pos.z); const sz = f.fuel / 60 > 4 ? 'big' : f.fuel >= 60 ? 'mid' : 'small'; fire = Math.max(fire, fireWarmth(d, sz)); if (d < 6) fireNear = true; }
    const day = hour >= 6 && hour <= 18;
    const sleeping = this.body?.mode === 'sleep';
    const water = g.world.terrain.waterAt(pos.x, pos.z, g.player.seaLevel);
    return {
      dtH: 0, dtReal: 0, sleeping, heavy: this.body?.mode === 'work', moving: (this.body?.speed ?? 0) > 0.3, running: (this.body?.speed ?? 0) > 3.6,
      swimming: water.type && water.depth > 1.2, inWater: !!water.type, waterDepth: water.depth,
      Tair: W.airTemp(hour, { y: pos.y, zone: g.world.terrain.zoneAt(pos.x, pos.z), day: g.clock.day }), sun: day ? W.sun * 0.9 : 0, shade: sh.rain >= 0.3,
      windSpeed: W.windSpeed, windBlock: sh.wind, rainWet: W.wetPerH * (1 - sh.rain), dry: fire > 0 ? 40 : W.rain > 0.05 ? 0 : 12, fire, clothes: 1, shelterInsul: (sh.insul || 0) + (sleeping && this.inv.find('sleeping_bag') ? 7 : 0),
      companionNear: this.near(10), fireNear, night: hour < 5.5 || hour >= 19, outdoorsNoFire: !fireNear && sh.rain < 0.5, sleepQuality: 0.7, hour, day: g.clock.day,
      zone: g.world.terrain.zoneAt(pos.x, pos.z),
    };
  }

  passTime(gm) { const e = this.envAt(); e.dtH = gm / 60; this.vitals.update(e); this.workTick(gm); }

  update(dt, gm) {
    if (!this.ready) return;
    const g = this.game;
    const e = this.envAt(); e.dtH = gm / 60; e.dtReal = dt;
    this.vitals.update(e);
    this.brain(dt, gm);
    this.workTick(gm);
    this.body.condition = this.vitals.s.bodyTemp < 35.5 ? 'cold' : this.vitals.visible().some((c) => c.sev >= 2) ? 'sick' : this.vitals.s.rest < 20 ? 'tired' : 'ok';
    this.body.update(dt);
    // mood → face
    const s = this.vitals.s;
    this.mood = this.vitals.visible().length ? 'sick' : s.morale > 70 ? 'happy' : s.morale < 25 ? 'sad' : s.rest < 20 ? 'tired' : 'normal';
    const talkLevel = this.voice.level;
    this.avatar.setMood(this.mood === 'happy' ? { happy: 0.55 } : this.mood === 'sad' ? { sad: 0.7 } : this.mood === 'sick' ? { sad: 0.4 } : this.mood === 'tired' ? { relaxed: 0.5 } : { relaxed: 0.15 });
    const head = this.avatar.headPosition();
    const look = this.near(8) ? g.renderer.camera.position : null;
    this.avatar.update(dt, { speed: this.body.speed, talkLevel, lookAt: look });
    this.voice.update(head, g.renderer.camera);
    if (this.vitals.s.hp <= 0 && !this.dead) this.die();
  }

  /** §13.4 priorities, evaluated about once a second */
  brain(dt) {
    this.brainT = (this.brainT || 0) - dt;
    if (this.brainT > 0) return;
    this.brainT = 1;
    const g = this.game, s = this.vitals.s, hour = g.clock.hour;
    // 1 danger: a boar close, or the storm outside
    const boar = g.sys.fauna?.animals?.find((a) => a.alive && a.sp.charger && a.pos.distanceTo(this.body.pos) < 15);
    if (boar && !this.fleeing) { this.fleeing = true; this.speak(this.id === 'gen' ? '下がれ！' : this.id === 'touko' ? '危ないです、離れて！' : '逃げて！'); const away = this.body.pos.clone().sub(boar.pos).setY(0).normalize().multiplyScalar(18).add(this.body.pos); this.body.goTo(away.x, away.z, { run: true, then: () => { this.fleeing = false; this.body.follow(); } }); return; }
    // 2 urgent needs: eat / drink from own bag, else ask
    if (s.water < 15 || s.food < 10) {
      const need = s.water < 15 ? 'water' : 'food';
      const own = this.inv.stacks.find((x) => need === 'food' ? itemDef(x.id)?.food : x.water?.cups);
      if (own && need === 'food') { const d = itemDef(own.id); this.vitals.eat({ name: d.name, food: d.food.food, water: d.food.water, B: d.food.B, fresh: own.fresh, done: own.done }); this.inv.take(own.uid, 1); }
      else if (!this.dayFlags[`ask_${need}`] && this.near(30)) this.say(need === 'water' ? 'thirsty' : 'hungry', true);
      // drink at a nearby river by itself
      if (need === 'water') { const t = g.world.terrain, w = t.waterAt(this.body.pos.x, this.body.pos.z, g.player.seaLevel); if (w.type === 'stream' || w.type === 'pond') { this.vitals.drink({ name: '川の水', water: 20, W: 0.18 }); } }
    }
    if (s.bodyTemp < 35.5 && !this.dayFlags.cold) { this.say('cold', true); }
    // 4 sleep: after 21:00 when tired, near the player / fire
    if ((hour >= 21 || hour < 5) && s.rest < 50 && this.body.mode !== 'sleep' && this.order !== 'job') {
      if (this.near(15)) { this.body.sleep(); return; }
    }
    if (this.body.mode === 'sleep' && (s.rest >= 95 || (hour >= 6 && hour < 20))) this.body.follow();
    // low trust: wander off sometimes
    if (this.trust < 5 && !this.dayFlags.low_trust) this.say('low_trust', true);
    // 5 food sharing, triggers / proposals and initiative by affinity stage (§23.7, §24.8)
    this.shareFood();
    this.checkTriggers();
    this.initiative();
    // 7 leisure chatter: talks more as you get closer (stage chatPerHour × the hunter's quiet ×0.7)
    const now = g.clock.total, dh = Math.max(0, now - (this.lastBrainT ?? now)) / 60;
    this.lastBrainT = now;
    if (this.order === 'follow' && this.near(6) && g.rng.next() < this.stageInfo.chatPerHour * this.chatMul * dh) {
      delete this.dayFlags.stage_talk;
      this.say(hour > 17 && hour < 19 && !this.dayFlags.sunset ? 'sunset' : 'stage_talk');
    }
    // affinity stories
    for (const [i, lv] of [20, 40, 60, 80].entries()) if (this.affinity >= lv && !this.memory.data[`story${i}`] && this.near(6) && hour >= 18) { this.memory.data[`story${i}`] = true; this.say(`story_${i + 1}`, true); g.stats.storiesHeard = (g.stats.storiesHeard || 0) + 1; break; }
  }

  /** §23.7 分け方: stage 1 gives only when you are nearly starving, stage 3+ hands food over unasked, stage 5 even when hungry itself */
  shareFood() {
    const g = this.game, P = g.sys.player.body.s, C = this.vitals.s, now = g.clock.total;
    if (!this.near(5) || now - this.lastShareT < 180 || this.talk?.state === 'live') return;
    const st = this.stage;
    const needFood = st <= 2 ? P.food < 15 : P.food < 40 || P.water < 40;
    if (!needFood) return;
    if (C.food < 30 && st < 5) return;   // keeps its own share unless 親友
    const foods = this.inv.stacks.filter((x) => itemDef(x.id)?.food && !itemDef(x.id)?.food?.poison && (x.fresh ?? 100) >= 40);
    if (!foods.length) return;
    // stage 4+: the better one goes to you
    foods.sort((a, b) => (st >= 4 ? 1 : -1) * ((itemDef(b.id).food.food ?? 0) - (itemDef(a.id).food.food ?? 0)));
    const s = foods[0];
    const n = st >= 5 ? Math.max(1, Math.ceil(s.n / 2)) : 1;
    const part = this.inv.take(s.uid, n)[0];
    if (!part) return;
    g.sys.player.inv.addStack(part);
    this.lastShareT = now;
    this.say('share', true, { item: itemDef(part.id)?.name });
    g.bus.emit('toast', { text: `${this.name}から ${itemDef(part.id)?.name}${n > 1 ? `×${n}` : ''}を もらった`, kind: 'good' });
    g.sys.player.body.moraleOnce('shared', 3, g.clock.day, 2);
  }

  /** §23.7 自分から: stage 2+ with enough trust starts useful work without being asked */
  initiative() {
    const g = this.game, now = g.clock.total;
    if (this.order !== 'follow' || this.job || this.body.mode === 'sleep') { this.idleSince = now; return; }
    const st = this.stage, T = this.trust;
    const wait = st >= 5 ? 0 : st === 4 && T >= 40 ? 0 : Infinity; // stage 2–3 propose first (checkTriggers → consult)
    if (now - this.idleSince < wait || now - (this.lastInitT ?? -999) < 120) return;
    const P = g.sys.player.body.s, hour = g.clock.hour;
    const fire = g.sys.fires?.nearest(g.player.pos, 15);
    let job = null;
    if (fire?.fire?.lit && fire.fire.fuel < 40 && (hour >= 18 || hour < 6 || g.sys.weather.rain > 0.2)) job = 'tend_fire';
    else if (hour >= 7 && hour < 17 && st >= 4 && P.food < 45 && !this.inv.stacks.some((x) => itemDef(x.id)?.food)) job = 'gather_food';
    else if (hour >= 7 && hour < 16 && st >= 3 && fire && !g.sys.player.inv.stacks.some((x) => /branch|firewood|driftwood/.test(x.id))) job = 'gather_wood';
    if (!job) return;
    this.lastInitT = now;
    if (this.doJob(job, { self: true }) === 'ok') {
      this.speak(job === 'tend_fire' ? (this.id === 'gen' ? '火は おれが 見とく。' : this.id === 'touko' ? '火は わたしが 見ておきますね。' : '火、見とくね！') :
        job === 'gather_food' ? (this.id === 'gen' ? '食い物、探してくる。' : this.id === 'touko' ? '食べられる 物、探してきます。' : 'ごはん 探してくる！ 待ってて！') :
        (this.id === 'gen' ? '薪が 足りん。取ってくる。' : this.id === 'touko' ? '薪を 集めて きますね。' : '薪、取ってくるね！'));
    }
  }

  /** abstract job output per game hour (§13.4), handed over when near the player */
  workTick(gm) {
    if (!this.job || this.body?.mode !== 'work' && this.job.id !== 'tend_fire') return;
    const j = JOBS[this.job.id];
    const night = this.game.clock.hour < 5 || this.game.clock.hour >= 19;
    const mult = jobMultiplier(this.sheet, this.job.id, { stage: this.stage, morale: this.vitals.s.morale, night, toolAxe: !!this.inv.find?.('axe') });
    this.job.acc += (gm / 60) * mult;
    if (this.job.id === 'tend_fire') {
      const rec = this.game.sys.fires?.nearest(this.body.pos, 4);
      if (rec && rec.fire.lit && rec.fire.fuel < 90) { const fuel = this.game.sys.player.inv.stacks.find((s) => /branch|twig|firewood|driftwood/.test(s.id)) || this.inv.stacks.find((s) => /branch|twig/.test(s.id)); if (fuel) { const inv = this.game.sys.player.inv.get(fuel.uid) ? this.game.sys.player.inv : this.inv; this.game.sys.fires.addFuel(rec, inv.take(fuel.uid, 1)[0]); } }
      return;
    }
    if (this.job.acc >= 1) {
      this.job.acc -= 1;
      for (const [id, n] of j.perHour) this.inv.add(id, n, { rng: this.game.rng });
      if (this.job.id === 'fish') this.vitals.s.wet = 60;
      if (this.inv.weight() > this.inv.capacity * 0.8 || this.game.clock.total - this.job.start > 180) this.finishJob();
    }
  }

  finishJob() {
    const jobId = this.job?.id;
    const items = this.inv.stacks.filter((s) => !itemDef(s.id)?.tool);
    this.job = null; this.order = 'follow';
    this.body.follow();
    const g = this.game;
    const deliver = () => {
      if (!this.near(5)) { setTimeout(deliver, 2000); return; }
      for (const s of items) { const part = this.inv.removeStack(s.uid); if (part) g.sys.player.inv.addStack(part); }
      this.say('job_done', true);
      this.adjust(0.5, 0.5);
      if (this.talk?.state === 'live') {
        const got = items.map((s) => `${itemDef(s.id)?.name}×${s.n}`).join('、') || '何も 取れなかった';
        this.talk.event(`[結果] ${JOB_LABEL[jobId] || '仕事'}が 終わって 戻った：${got}`, true);
      }
    };
    deliver();
  }

  die() {
    this.dead = true;
    if (this.game.diff?.companionDies === false) { this.vitals.s.hp = 1; this.dead = false; this.body.sleep(); return; }
    this.game.bus.emit('toast', { text: `${this.name}が 動かなく なった…`, kind: 'bad' });
    this.game.sys.player.body.addMorale(-40, 'companion_death');
    this.game.stats.companionAlive = false;
    this.avatar.setPose('sleep');
  }

  serialize() { return { trust: this.trust, affinity: this.affinity, sheet: this.sheet, vitals: this.vitals.serialize(), inv: this.inv.serialize(), pos: this.body ? [this.body.pos.x, this.body.pos.z] : null }; }
  deserialize(d) {
    this.trust = d.trust; this.affinity = d.affinity;
    if (d.sheet?.abilities) this.setSheet(d.sheet);
    this.stage = stageOf(this.affinity);
    this.vitals.deserialize(d.vitals); this.inv.deserialize(d.inv);
    this.inv.capacity = Math.round(this.derived.carry * 10) / 10;
    if (d.pos && this.body) this.body.place(d.pos[0], d.pos[1]);
  }
  debug() { return { ready: this.ready, order: this.order, mode: this.body?.mode, trust: this.trust, affinity: this.affinity, stage: this.stage, profession: this.sheet.profession, carry: this.inv.capacity, food: Math.round(this.vitals.s.food), water: Math.round(this.vitals.s.water) }; }
}
