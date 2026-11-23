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

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const AVAILABLE = { nagi: true, touko: true, gen: false };

const JOBS = {
  gather_wood: { name: '薪あつめ', pose: 'gather', zones: ['jungle', 'grass'], perHour: [['branch', 5], ['twig', 4]], fav: 'gen' },
  gather_food: { name: '食べ物さがし', pose: 'gather', zones: ['beach', 'grass', 'jungle'], perHour: [['coconut', 1], ['berry', 3], ['shellfish', 2]], fav: 'touko' },
  fetch_water: { name: '水くみ', pose: 'gather', zones: ['stream'], perHour: [], needsContainer: true },
  fish: { name: '釣り・漁', pose: 'fish', zones: ['beach', 'rocks'], perHour: [['sardine', 1]], fav: 'nagi' },
  tend_fire: { name: '火の 番', pose: 'sit', zones: [], perHour: [], fav: 'gen' },
};

export class Companion {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    this.p = PERSONAS[id] || PERSONAS.nagi;
    this.name = this.p.short || this.p.name;
    this.body = null;      // CompanionBody (movement)
    this.vitals = new Body({ rng: game.rng, diff: game.diff, drainMul: 0.8, bus: game.bus, isPlayer: false, name: this.name });
    this.vitals.s.morale = 65;
    this.inv = new Inventory(id === 'touko' ? 8 : 10);
    this.trust = 40; this.affinity = 20;
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
    bus.on('day', () => { this.say('morning', true); this.dayFlags = {}; this.dailyRelation(); });
    bus.on('hour', (h) => { if (Math.floor(h.hour) === 18 && this.near(30)) this.say('sunset'); if (this.game.sys.player.zone === 'jungle' && (h.hour >= 19 || h.hour < 5) && this.near(10)) this.say('night_jungle'); });
    bus.on('ship:pass', () => this.say('ship_seen', true));
    bus.on('eat', (e) => { if (e.isPlayer && e.p > 0.1 && this.id === 'touko' && this.near(10)) this.say('raw_eat_warn', true); });
    bus.on('craft:done', (e) => { if ((e.stack?.q ?? 0) >= 75 && this.near(12)) this.say('praise_craft'); });
    bus.on('log', (e) => this.memoryEvent(e.text));
    bus.on('sleep:start', () => this.compressMemory('bedtime'));
    bus.on('game:end', () => { this.talk?.stop(); });
  }

  /** load the avatar (lazy: after the setup screen, §17.4) */
  async load() {
    const g = this.game;
    try {
      const av = await Avatar.load(`assets/companions/${this.p.model === 'seed-san' ? 'seed-san' : 'hana'}.vrm`, g.world.scene);
      this.avatar = av;
      if (this.id === 'nagi') this.tint(av, '#3d78c9'); // ナギ: the blue parka colour on the shirt
      this.body = new CompanionBody(g, av);
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
    this.game.bus.emit('subtitle', { who: this.name, text, final: true });
    this.game.bus.emit('companion:say', { text, who: this.name, __shown: true });
    this.voice.mumble(text, this.p.pitch || 1);
    this.memory.add('companion', text, { day: this.game.clock.day, hour: Math.floor(this.game.clock.hour) });
    this.memory.closeTurn();
  }
  memoryEvent(text) { if (text) this.memory.add('event', text, { day: this.game.clock.day, hour: Math.floor(this.game.clock.hour) }); }

  // ---------------------------------------------------------------- the companion menu (js/ui/s-companion.js)
  topics() {
    const t = [{ id: 'chat', label: '雑談する', icon: '💬' }, { id: 'advice', label: 'サバイバルの 知恵を 聞く', icon: '💡' }, { id: 'weather', label: '天気は どうなりそう？', icon: '☁️' }];
    const next = [20, 40, 60, 80].findIndex((lv, i) => this.affinity >= lv && !this.memory.data[`story${i}`]);
    if (next >= 0) t.push({ id: `story${next}`, label: '身の上話を 聞く', icon: '📖' });
    if (this.id === 'touko') t.push({ id: 'identify', label: '持っている 草や キノコを 見てもらう', icon: '🔍' });
    if (this.id === 'nagi') t.push({ id: 'fishtip', label: '魚の ことを 聞く', icon: '🐟' });
    return t;
  }
  talk(topic) {
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
    const r = this.doJob(id);
    if (r === 'ok') this.speak(this.id === 'gen' ? '任せろ。' : this.id === 'touko' ? 'わかりました。行ってきます。' : 'りょうかい！ 行ってくる！');
    return r;
  }
  status() { return { s: this.vitals.s, trust: this.trust, affinity: this.affinity, mood: this.mood, conditions: this.vitals.visible(), inv: this.inv.stacks }; }
  take(uid, n = 1) { const s = this.inv.get(uid); if (!s) return false; const part = this.inv.take(uid, n)[0]; this.game.sys.player.inv.addStack(part); return true; }
  treat(uid) {
    const inv = this.game.sys.player.inv, s = inv.get(uid), d = s && itemDef(s.id, s);
    if (!d?.med) return false;
    const map = { burn: 'aloe', bleed: 'herb_stop_bleed', infection: 'poultice', cold: 'ginger', diarrhea: 'guava', poison: 'charcoal', fever: 'fever', venom: 'suction', wound: 'bandage', antibiotic: 'antibiotic' };
    const ok = this.vitals.treat(map[d.med.type] || d.med.type, d.med.power ?? 1);
    if (ok) { inv.take(uid, 1); this.adjust(5, 3); this.speak(this.id === 'gen' ? '…すまねえ。' : 'ありがとう…楽に なった。'); }
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
    const list = Object.entries(JOBS).map(([id, j]) => {
      const noBox = j.needsContainer && !this.inv.stacks.some((s) => itemDef(s.id)?.container);
      return { id, name: j.name, label: j.name, icon: icons[id], desc: j.fav === this.id ? '得意な 仕事' : '', fav: j.fav === this.id, available: !noBox, ok: !noBox, reason: noBox ? '入れ物を 渡して' : '' };
    });
    return [{ id: 'follow', label: 'ついてきて', name: 'ついてきて', icon: '👣', available: true }, { id: 'wait', label: 'ここで 待って', name: 'ここで 待って', icon: '✋', available: true }, ...list];
  }
  doJob(id) {
    const j = JOBS[id];
    if (!j || !this.body) return 'unknown job';
    if (this.trust < 20 && this.game.rng.next() < 0.5) { this.say('refuse', true); return 'refused'; }
    if (this.id === 'touko' && id === 'fish' && this.trust < 70) { this.say('refuse', true); return 'refused'; }
    if (j.needsContainer && !this.inv.stacks.some((s) => itemDef(s.id)?.container)) { this.speak('入れ物が ないと 水を 運べないよ'); return 'needs a container'; }
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
      this.speak(this.id === 'gen' ? '…助かる。' : this.id === 'touko' ? 'ありがとうございます。いただきます。' : 'やった！ ありがと！');
    } else {
      this.inv.addStack(part);
      const liked = (this.p.likes || []).includes(part.id);
      if (liked && !this.dayFlags.gift) { this.adjust(1, 4); this.say('gift', true, { item: d?.name }); this.dayFlags.gift = true; }
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
  adjust(trust, aff) { this.trust = clamp(this.trust + trust, 0, 100); this.affinity = clamp(this.affinity + aff, 0, 100); this.memory.adjust(trust, aff); }
  nightTogether() { this.adjust(1, 1); }
  dailyRelation() { if (this.affinity < 60) this.affinity = Math.max(0, this.affinity - 0.5); }

  hudInfo() { return { name: this.name, mood: this.mood, hp: Math.round(this.vitals.s.hp), near: this.near(12), order: this.order, job: this.job ? JOBS[this.job.id].name : null, trust: this.trust, affinity: this.affinity, talking: this.talk?.state === 'live' }; }

  // ---------------------------------------------------------------- Gemini Live
  async talkKey() {
    const key = this.game.apiKey || getApiKey();
    if (!key) { this.game.screens?.show('companion'); return; }
    if (this.talk?.state === 'live' || this.talk?.state === 'connecting') { this.talk.stop(); this.game.bus.emit('toast', { text: `${this.name}との 会話を 終えた`, kind: 'info' }); return; }
    this.talk = new CompanionTalk({
      apiKey: key, persona: systemPrompt(this.p, { playerName: this.game.setup.playerName, trust: this.trust, affinity: this.affinity, mood: this.mood }),
      voiceName: this.p.voice, memory: this.memory, voice: this.voice, mic: this.mic,
      places: Object.values(this.game.world.layout).map((p) => p.name).filter(Boolean),
      resources: ['wood', 'food', 'water', 'fish', 'vines', 'stones', 'leaves'],
      when: () => ({ day: this.game.clock.day, hour: Math.floor(this.game.clock.hour) }),
      onStatus: (st, info) => { this.game.bus.emit('toast', { text: { connecting: `${this.name}と つないでいます…`, live: `🎤 ${this.name}と 話せます（T で 終わる）`, error: `会話に つなげなかった（${info}）`, mic: 'マイクが 使えない', reconnecting: '再接続中…' }[st] || '', kind: st === 'error' ? 'bad' : 'info' }); },
      onSubtitle: (who, text, final) => this.game.bus.emit('subtitle', { who: who === 'companion' ? this.name : 'あなた', text, final }),
      onNeedCompress: () => this.compressMemory('size'),
      actions: {
        follow: () => this.follow(), wait: () => this.wait(),
        goTo: (place) => { const p = Object.values(this.game.world.layout).find((x) => x.name === place); if (!p) return 'unknown place'; this.order = 'goto'; this.body.goTo(p.x, p.z); return 'walking'; },
        gather: (res) => this.doJob({ wood: 'gather_wood', food: 'gather_food', water: 'fetch_water', fish: 'fish' }[res] || 'gather_wood'),
        give: (item, n) => this.give(item, n),
        express: (emotion, gesture) => { this.avatar?.setMood(emotion && emotion !== 'neutral' ? { [emotion]: 1 } : {}); if (gesture && gesture !== 'none') { if (gesture === 'sit') this.body.sit(); else this.body.gesture(gesture, 2.5); } return 'ok'; },
        status: () => this.statusText(),
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
    // 7 leisure chatter
    if (this.order === 'follow' && this.near(6) && g.rng.next() < 0.02) this.say(g.rng.pick(['item_react', 'praise_craft', 'morning']).replace('morning', 'sunset') === 'sunset' && hour > 17 ? 'sunset' : 'item_react');
    // affinity stories
    for (const [i, lv] of [20, 40, 60, 80].entries()) if (this.affinity >= lv && !this.memory.data[`story${i}`] && this.near(6) && hour >= 18) { this.memory.data[`story${i}`] = true; this.say(`story_${i + 1}`, true); g.stats.storiesHeard = (g.stats.storiesHeard || 0) + 1; break; }
  }

  /** abstract job output per game hour (§13.4), handed over when near the player */
  workTick(gm) {
    if (!this.job || this.body?.mode !== 'work' && this.job.id !== 'tend_fire') return;
    const j = JOBS[this.job.id];
    const skill = j.fav === this.id ? 1.8 : 1;
    const morale = this.vitals.s.morale < 30 ? 0.7 : 1;
    this.job.acc += (gm / 60) * skill * morale;
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
    const items = this.inv.stacks.filter((s) => !itemDef(s.id)?.tool);
    this.job = null; this.order = 'follow';
    this.body.follow();
    const g = this.game;
    const deliver = () => {
      if (!this.near(5)) { setTimeout(deliver, 2000); return; }
      for (const s of items) { const part = this.inv.removeStack(s.uid); if (part) g.sys.player.inv.addStack(part); }
      this.speak(this.id === 'gen' ? '取ってきた。使え。' : this.id === 'touko' ? '集めてきました。確認してくださいね。' : 'ただいま！ いっぱい 取れたよ！');
      this.adjust(0.5, 0.5);
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

  serialize() { return { trust: this.trust, affinity: this.affinity, vitals: this.vitals.serialize(), inv: this.inv.serialize(), pos: this.body ? [this.body.pos.x, this.body.pos.z] : null }; }
  deserialize(d) { this.trust = d.trust; this.affinity = d.affinity; this.vitals.deserialize(d.vitals); this.inv.deserialize(d.inv); if (d.pos && this.body) this.body.place(d.pos[0], d.pos[1]); }
  debug() { return { ready: this.ready, order: this.order, mode: this.body?.mode, trust: this.trust, affinity: this.affinity, food: Math.round(this.vitals.s.food), water: Math.round(this.vitals.s.water) }; }
}
