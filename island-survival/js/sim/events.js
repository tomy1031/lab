// sim/events.js — random events (§14), rescue / escape / retire (§15.1). Game system: Events.
//
// Hooks it expects from the game (all optional, called with `?.`):
//   game.spawnDrop(id, n, x, z, extra)     put items on the ground
//   game.end({ result, how?, cause?, ... }) finish the game. result ∈ 'rescued' | 'raft' | 'drift' | 'retired' | 'broken' | 'dead' | 'stay'
//   game.signalState()  or  game.sys.signals.state()  → current signals (see SIGNAL KEYS below)
//   game.raftInfo()     → { has, q, sail, oarQ, beach:'north'|…, water (L), foodFull, preservedOnly, companionNagi, ebb }
//   game.stealFood(n) / game.stealDried(n)  → array of lost names
//   game.sys.weather {type, season(day), scheduleTyphoon(block), history, block}
//   game.sys.player.body.s.morale ; game.sys.companion.say(text)
//
// SIGNAL KEYS (booleans unless noted): smoke:'beach'|'hill'|'other'|null, bigFire, bigFireHill, sos:0|1|2, mirrorQ:number|null,
//   waving, companionWave, gunshots:number, fireColumn, whistle, lookout, tarp.
// They can also be pushed momentarily: events.signal('waving'), events.signal('mirror', {q}), events.signal('gunshots', {n}).
import { EVENTS, FLOTSAM, SUPPLY_DROP, COMPANION_GIFTS, SIGNAL_TABLE, WEATHER_NOTICE, PASS } from '../data/events.js';

const STORMY = ['storm', 'typhoon'];
const WET = ['drizzle', 'rain', 'storm', 'typhoon'];
const SIG_TTL = { waving: 12, mirror: 12, gunshots: 40, companionWave: 12, whistle: 12 };

/** probability that a pass is noticed, §15.1. `sig` = signal state, `ctx` = { night, hill, weather } */
export function noticeProbability(kind, sig = {}, ctx = {}) {
  const col = kind === 'plane' ? 'plane' : 'ship';
  const night = !!ctx.night;
  const parts = [];
  const add = (key, label, cond = true, v) => {
    const e = SIGNAL_TABLE[key]; if (!e || !cond) return;
    if (e.day && night) return; if (e.night && !night) return;
    const val = v ?? e[col]; if (val > 0) parts.push({ key, label, value: val });
  };
  if (sig.smoke) add(sig.smoke === 'hill' ? 'smokeHill' : sig.smoke === 'beach' ? 'smokeBeach' : 'smokeOther', '狼煙');
  if (sig.bigFire) add(sig.bigFireHill ? 'bigFireHill' : 'bigFire', '大きな 火');
  const sos = sig.sos | 0; if (sos >= 2) add('sos2', 'SOS(2 か所)'); else if (sos === 1) add('sos1', 'SOS');
  if (sig.mirrorQ != null && !night && ['clear', 'heat', undefined].includes(ctx.weather)) parts.push({ key: 'mirror', label: '合図の 鏡', value: 0.15 + sig.mirrorQ / 400 });
  if (sig.waving) add('waving', '手を 振る');
  if (sig.companionWave) add('companionWave', '仲間も 振る');
  if ((sig.gunshots | 0) >= 3) add('gunshots', '銃の 3 連発');
  if (sig.fireColumn) add('fireColumn', '火柱');
  if (sig.whistle) add('whistle', '竹笛');
  if (sig.lookout) add('lookout', '見張り台');
  if (sig.tarp) add('tarp', '派手な 色');
  const sum = parts.reduce((a, b) => a + b.value, 0);
  const mult = WEATHER_NOTICE[ctx.weather ?? 'clear'] ?? 1;
  const p = Math.min(0.95, Math.max(0.02, 0.02 + sum)) * mult;
  return { p, sum, mult, parts };
}
/** per-check probability: 1 − (1 − P)^(1/N) */
export function perCheck(P, n) { return 1 - Math.pow(1 - P, 1 / n); }

export class Events {
  constructor() { this.reset(); }
  reset() {
    this.game = null;
    this.day1Done = false;
    this.lastHour = null;       // last processed absolute game hour (integer)
    this.queue = [];            // [{ atH, id, data }]
    this.effects = [];          // [{ id, untilH, data }]
    this.typhoon = null;        // { startH, endH, block, day, sent:[bool], started, ended }
    this.typhoonCount = 0; this.lastTyphoonDay = -99;
    this.guaranteeDay = null;
    this.pass = null;           // running ship / plane pass
    this.pickup = null;         // { day, hour, kind }  plane → next day 10:00 boat
    this.offer = null;          // pending "go home?" question
    this.retireAtMin = null;
    this.moraleZeroMin = 0;
    this.refused = 0; this.stayUnlocked = false;
    this.stormFlag = false; this.rainSeen = false; this.clearDays = 0; this.rainBlocks = 0; this.lastBlock = -1;
    this.flood = null; this.redTideDays = 0;
    this.seenShipHours = [];
    this.pushed = {};           // momentary signals { key: {until, val} }
    this.clockSec = 0;
    this.log = [];              // last events (debug)
    this.ended = false;
    this.campSeen = false; this.woundWarned = false;
    this.passedCount = { ship: 0, plane: 0 };
  }

  init(game) {
    this.game = game;
    const days = game.setup?.days ?? 7;
    if (this.guaranteeDay == null) {
      if (days === 7) this.guaranteeDay = 5;
      else if (days === 0 || days >= 14) this.guaranteeDay = game.rng.int(6, 10);
      else this.guaranteeDay = -1;
    }
    game.bus?.on?.('tool:broken', (e) => {
      this.morale(-4); this.toast(`${e?.name ? '壊れた ' + e.name : '道具が 壊れた'}…`, 'bad');
    });
    game.bus?.on?.('wound:untreated', (e) => { if ((e?.hours ?? 0) >= 12) this.woundAche(); });
    game.bus?.on?.('zone:enter', (e) => this.onZone(e?.id));
  }

  // ------------------------------------------------------------------ helpers
  get rng() { return this.game.rng; }
  get days() { return this.game.setup?.days ?? 7; }
  get bad() { return this.game.diff?.badEvents ?? 1; }
  toast(text, kind = 'info') { this.game.bus?.emit('toast', { text, kind }); }
  note(text, kind = 'event') { this.game.bus?.emit('log', { text, kind }); }
  say(text) { this.game.sys?.companion?.say?.(text); }
  morale(d) { const s = this.game.sys?.player?.body?.s; if (s) s.morale = Math.max(0, Math.min(100, s.morale + d)); }
  weatherType() { return this.game.sys?.weather?.type ?? 'clear'; }
  season(day) { return this.game.sys?.weather?.season?.(day) ?? 'dry'; }
  record(id, extra) { this.log.push({ id, t: +(this.game.clock.total / 60).toFixed(1), ...extra }); if (this.log.length > 40) this.log.shift(); this.game.bus?.emit('event', { id, ...extra }); }
  beachPoint() {
    const z = this.game.world?.zones?.beach_s ?? this.game.zones?.beach_s;
    const c = z?.center ?? z?.pos ?? z;
    const bx = c?.x, bz = c?.z;
    return [bx == null ? undefined : bx + this.rng.float(-6, 6), bz == null ? undefined : bz + this.rng.float(-4, 4)];
  }
  drop(id, n = 1, extra) { const [x, z] = this.beachPoint(); this.game.spawnDrop?.(id, n, x, z, extra); }
  hasMod(id) { const H = this.game.clock.total / 60; return this.effects.some((e) => e.id === id && e.untilH > H); }
  addEffect(id, hours, data) { const H = this.game.clock.total / 60; this.effects = this.effects.filter((e) => e.id !== id || e.untilH < H); this.effects.push({ id, untilH: H + hours, data }); }
  /** multipliers / offsets other systems read. */
  mod(name) {
    switch (name) {
      case 'fishBite': return this.hasMod('fish_run') ? 3 : 1;
      case 'netCatch': return this.hasMod('fish_run') ? 2 : 1;
      case 'bayFishing': return this.hasMod('red_tide') ? 0.5 : 1;
      case 'shellPoison': return this.hasMod('red_tide');
      case 'forageMult': return this.hasMod('fruit_fall') ? 2 : 1;
      case 'riverWidth': return this.hasMod('flash_flood') ? 2 : 1;
      case 'tideAmp': return this.hasMod('full_moon') ? 1.3 : 1;
      case 'nightLight': return this.hasMod('full_moon');
      case 'lobster': return this.hasMod('full_moon') ? 2 : 1;
      case 'tempOffset': { const h = this.game.clock.hour; return this.hasMod('cold_night') && h >= 2 && h < 6 ? -3 : 0; }
      default: return 1;
    }
  }

  // ------------------------------------------------------------------ main loop
  update(dt, gm, game = this.game) {
    if (!this.game) this.init(game);
    if (this.ended) return;
    const clock = game.clock;
    this.clockSec += dt;
    if (!this.day1Done) { this.day1Done = true; this.flotsam(true); }
    // hour-by-hour processing (handles sleeping fast-forward)
    const H = Math.floor(clock.total / 60);
    if (this.lastHour == null) this.lastHour = H;
    let guard = 0;
    while (this.lastHour < H && guard++ < 96 && !this.ended) { this.lastHour++; this.onHour(this.lastHour); }
    if (this.ended) return;
    this.runPass(dt);
    // morale 0 for 12 h (§4.5)
    const s = game.sys?.player?.body?.s;
    if (s) {
      if (s.morale <= 0) this.moraleZeroMin += gm; else this.moraleZeroMin = 0;
      if (this.moraleZeroMin >= 720) this.broken();
    }
    if (this.retireAtMin != null && clock.total >= this.retireAtMin) { this.retireAtMin = null; this.finish({ result: 'retired', how: 'flare' }); }
    // promised day: noon of day N
    if (this.days > 0 && clock.day === this.days && clock.hour >= 12 && !this.offer) {
      this.arrivePromised();
    }
    // plane pickup next day 10:00
    if (this.pickup && (clock.day > this.pickup.day || (clock.day === this.pickup.day && clock.hour >= this.pickup.hour))) {
      this.pickup = null; this.toast('救助船が 浜に 着いた!', 'good'); this.noticed('boat');
    }
  }

  onHour(Habs) {
    const day = Math.floor(Habs / 24) + 1, hour = Habs % 24;
    const w = this.game.sys?.weather;
    // weather bookkeeping
    if (w) {
      if (STORMY.includes(w.type)) this.stormFlag = true;
      if (WET.includes(w.type)) this.rainSeen = true;
      if (w.block !== this.lastBlock) {
        this.lastBlock = w.block;
        this.rainBlocks = ['rain', 'storm', 'typhoon'].includes(w.type) ? this.rainBlocks + 1 : 0;
        if (this.rainBlocks === 2 && !this.flood) this.flood = { startH: Habs + 6 };
      }
    }
    if (this.flood && Habs >= this.flood.startH) {
      this.flood = null; this.addEffect('flash_flood', 12); this.toast('川の 水かさが 増えて いる! 川べりの 物が 危ない。', 'bad'); this.note('川が 増水した'); this.record('flash_flood');
    }
    if (hour === 6) this.onMorning(day, Habs);
    if (hour === 18) this.onEvening(day, Habs);
    this.typhoonTick(Habs);
    // queued events
    const due = this.queue.filter((q) => q.atH <= Habs); this.queue = this.queue.filter((q) => q.atH > Habs);
    for (const q of due) this.fire(q);
    // hourly chances
    if (w && STORMY.includes(w.type) && this.rng.chance(0.06)) {
      const where = this.rng.pick(['rocks', 'jungle']);
      this.game.bus?.emit('lightning:fire', { where });
      this.toast('近くに 雷が 落ちた! 木が くすぶって いる…', 'info'); this.record('lightning_fire', { where });
    }
    if (hour === 23 && this.rng.chance(0.30 * this.bad)) this.ratTheft();
    if (hour === 1 && this.rng.chance(0.25)) this.nightNoise();
    if (hour === 20 && this.game.sys?.player && this.rng.chance(0.15) && w && ['clear', 'heat'].includes(w.type)) {
      this.morale(5); this.toast('流れ星が 夜空を 横切った。', 'good'); this.say('わあ…きれい'); this.record('meteor');
    }
    if (hour === 13 && this.rng.chance(0.10 * this.bad) && this.game.sys?.player?.rackUncovered?.()) this.birdTheft();
    this.checkWound();
    // effects expiry
    this.effects = this.effects.filter((e) => e.untilH > Habs);
  }

  // ------------------------------------------------------------------ morning / evening
  onMorning(day, Habs) {
    const g = this.game, w = g.sys?.weather;
    // clear days counter (for red tide)
    if (day > 1) { this.clearDays = this.rainSeen ? 0 : this.clearDays + 1; this.rainSeen = false; }
    // plan tomorrow's typhoon first (it blocks other majors around it)
    this.planTyphoon(day, Habs);
    this.flotsam(false);
    if (this.rng.chance(0.02)) this.messageBottle();
    if (g.setup?.difficulty === 'easy' && day % 7 === 0) this.supplyDrop();
    // major event of the day (at most one)
    const typhoonNear = this.typhoon && !this.typhoon.ended && this.typhoon.startH - Habs < 30;
    if (!typhoonNear) {
      const unl = this.days === 0;
      const shipP = day >= 3 ? (unl && day >= 10 ? 0.08 : 0.06) : 0;
      const planeP = day >= 5 ? 0.04 : 0;
      if (shipP && this.rng.chance(shipP)) this.queuePass('ship', Habs);
      else if (planeP && this.rng.chance(planeP)) this.queuePass('plane', Habs);
    }
    // fish run on a rising-tide morning
    if (this.rng.chance(0.08)) {
      for (let h = 6; h <= 11; h++) {
        const t = g.clock.total / 60 - 6 + h;
        if (g.clock.tide(t + 0.25) > g.clock.tide(t - 0.25)) { this.queue.push({ atH: Habs + (h - 6), id: 'fish_run' }); break; }
      }
    }
    // fruit day after rain
    if (w && g.clock.total / 60 - (w.lastRainEndH ?? -99) < 14 && this.rng.chance(0.20)) {
      this.addEffect('fruit_fall', 18);
      this.drop('coconut', this.rng.int(4, 6));
      this.toast('雨の あとで ヤシの実が たくさん 落ちて いる!', 'good'); this.record('fruit_fall');
    }
    // red tide
    if (this.redTideDays > 0) { this.redTideDays--; if (!this.redTideDays) this.toast('海の 色が もとに もどった。', 'info'); }
    else if (this.season(day) === 'dry' && this.clearDays >= 3 && this.rng.chance(0.15 * this.bad)) {
      this.redTideDays = this.rng.int(2, 3); this.addEffect('red_tide', this.redTideDays * 24);
      this.toast('海が 赤茶色に 濁って いる…(貝は 食べない ほうが いい)', 'bad'); this.record('red_tide');
    }
    if (this.rng.chance(0.05)) this.queue.push({ atH: Habs + this.rng.int(1, 4), id: 'whale' });
    this.companionGift();
    // 10-day milestone (§17.2)
    if (day % 10 === 0) { this.morale(10); this.toast(`${day} 日目。よく ここまで 生きのびた。`, 'good'); this.say(`${day} 日も 経ったんだね`); }
  }
  onEvening(day, Habs) {
    const w = this.game.sys?.weather;
    if (w && ['clear'].includes(w.type) && w.windSpeed < 3 && this.rng.chance(0.20 * this.bad)) {
      this.addEffect('cold_night', 12); this.record('cold_night');
    }
    // full moon spring tide (14.75-day cycle)
    if (day >= 8 && Math.floor((day - 8) / 14.75) !== Math.floor((day - 9) / 14.75)) {
      this.addEffect('full_moon', 12); this.toast('満月だ。潮が 大きく 動く 夜に なる。', 'info'); this.record('full_moon');
    }
  }

  flotsam(day1) {
    const afterStorm = this.stormFlag; this.stormFlag = false;
    const items = [];
    if (day1) items.push(...FLOTSAM.day1);
    else {
      const [a, b] = afterStorm ? FLOTSAM.afterStorm : FLOTSAM.count;
      const n = Math.round(this.rng.int(a, b) * (this.game.diff?.resources ?? 1) * 0.85 + 0.2) || a;
      for (let i = 0; i < n; i++) items.push([this.rng.weighted(FLOTSAM.pool), 1]);
      if (this.rng.chance(FLOTSAM.crate.chance)) { const c = this.rng.weighted(FLOTSAM.crate.pool); items.push(['__crate', c]); }
    }
    for (const [id, n] of items) {
      if (id === '__crate') { this.drop(n.id, n.n, n.extra); this.toast('浜に 木箱が 流れ着いて いる!', 'good'); }
      else this.drop(id, n);
    }
    this.lastFlotsam = items.map((x) => x[0]);
    if (!day1) { this.toast(afterStorm ? '嵐の あとの 浜は 漂着物で いっぱいだ。' : '浜に 漂着物が 流れ着いた。', 'info'); }
    this.record('flotsam', { n: items.length, day1, afterStorm });
  }
  messageBottle() {
    this.drop('message_bottle', 1, { map: this.rng.chance(0.10) });
    this.toast('浜に びんが 流れ着いて いる。手紙が 入って いる!', 'good'); this.morale(8); this.record('message_bottle');
  }
  supplyDrop() {
    for (const [id, n] of SUPPLY_DROP) this.drop(id, n);
    this.toast('番組からの 差し入れが 浜に 届いた!', 'good'); this.record('supply_drop');
  }
  companionGift() {
    const c = this.game.sys?.companion, s = this.game.sys?.player?.body?.s;
    if (!c || !s || (c.affinity ?? 0) < 50 || s.morale >= 40 || !this.rng.chance(0.30)) return;
    const id = COMPANION_GIFTS[c.id ?? c.persona] ?? 'grilled_fish';
    this.game.sys.player.inv?.add?.(id, 1);
    this.morale(10); this.say('これ、よかったら…食べて'); this.toast('仲間が 贈り物を くれた。', 'good'); this.record('companion_gift', { id });
  }

  // ------------------------------------------------------------------ small events
  ratTheft() {
    const n = this.rng.int(1, 3);
    const lost = this.game.stealFood?.(n);
    if (lost == null) return;               // nothing stealable / no hook
    if (lost.length) { this.toast(`ネズミに ${lost.join('・')} を かじられた…`, 'bad'); this.record('rat_theft', { lost }); }
  }
  birdTheft() { const lost = this.game.stealDried?.(this.rng.int(1, 2)); if (lost?.length) { this.toast('鳥に 干物を 取られた!', 'bad'); this.record('bird_theft', { lost }); } }
  nightNoise() {
    const p = this.game.sys?.player; if (!p) return;
    if (p.shelter?.name || (p.nearFire != null && p.nearFire < 4 && (this.game.sys?.fire?.size ?? 1) >= 2)) return;
    const what = this.rng.weighted([['カニ', 30], ['風', 30], ['コウモリ', 30], ['イノシシ', 10]]);
    this.morale(-3); this.game.bus?.emit('sleep:disturb', { hours: 1 });
    this.toast(`夜の 物音で 目が 覚めた…(${what === 'イノシシ' ? '大きな 影が 動いた!' : what + 'だった'})`, 'bad');
    if (what === 'イノシシ') this.game.bus?.emit('boar:raid', {});
    this.record('night_noise', { what });
  }
  checkWound() {
    const h = this.game.sys?.player?.body?.untreatedWoundHours?.();
    if (h != null && h >= 12) this.woundAche(); else if (h === 0 || h === null) this.woundWarned = false;
  }
  woundAche() {
    if (this.woundWarned) return; this.woundWarned = true;
    this.toast('傷が うずく…手当てを しないと 化膿する。', 'bad'); this.say('傷、だいじょうぶ?'); this.record('wound_fester');
  }
  onZone(id) {
    if (this.campSeen || !['cave_deep', 'rocks_shade'].includes(id)) return;
    this.campSeen = true;
    this.drop('rusty_knife', 1, { q: 30 }); this.drop('old_diary', 1);
    this.morale(-5); this.toast('昔の 遭難者の 跡を 見つけた…', 'info'); this.record('old_camp');
  }
  fire(q) {
    if (q.id === 'ship' || q.id === 'plane') return this.startPass(q.id);
    if (q.id === 'fish_run') { this.addEffect('fish_run', 2); this.toast('入り江に 鳥山が! 魚の 大群だ、いまが チャンス!', 'good'); this.say('魚が 騒いでる!'); this.record('fish_run'); }
    if (q.id === 'whale') { this.morale(10); this.toast('沖で クジラが 潮を 吹いた。', 'good'); this.record('whale'); }
  }

  // ------------------------------------------------------------------ typhoon (§5.2, §14)
  planTyphoon(day, Habs) {
    if (this.typhoon && !this.typhoon.ended) return;
    const days = this.days, nd = day + 1;
    if (days > 0 && (days < 7 || nd >= days)) return;
    if (nd < 2 || nd - this.lastTyphoonDay < 4) return;
    let go = false;
    if (this.typhoonCount === 0 && this.guaranteeDay > 0 && nd >= this.guaranteeDay) go = true;
    else if (this.typhoonCount > 0 && (days === 0 || days >= 30) && nd - this.lastTyphoonDay >= 30) go = true;
    else if (days !== 7 && nd >= 6 && this.rng.chance((this.season(nd) === 'wet' ? 0.08 : 0.03) * this.bad)) go = true;
    if (!go) return;
    const startHour = this.rng.pick([6, 12]);
    const startH = (nd - 1) * 24 + startHour;
    const block = Math.floor(startH / 6);
    this.game.sys?.weather?.scheduleTyphoon?.(block);
    this.typhoon = { startH, endH: startH + 18, block, day: nd, sent: [], started: false, ended: false };
    this.typhoonCount++; this.lastTyphoonDay = nd;
    this.record('typhoon_planned', { startH });
  }
  typhoonTick(Habs) {
    const t = this.typhoon; if (!t || t.ended) return;
    const om = EVENTS.typhoon.omen;
    om.forEach((o, i) => {
      if (!t.sent[i] && Habs >= t.startH - o.before && Habs < t.startH) {
        t.sent[i] = true; this.toast(o.text, 'warn'); this.note(o.text, 'omen'); this.say(o.who);
        this.game.bus?.emit('typhoon:omen', { hoursBefore: o.before, text: o.text });
      }
    });
    if (!t.started && Habs >= t.startH) { t.started = true; this.game.bus?.emit('typhoon:start', {}); this.toast('大嵐が 島に 来た!', 'bad'); this.record('typhoon'); }
    if (t.started && Habs >= t.endH) { t.ended = true; this.game.bus?.emit('typhoon:end', {}); this.toast('大嵐が 過ぎた。', 'good'); }
  }

  // ------------------------------------------------------------------ ship / plane passes (§15.1b)
  queuePass(kind, Habs) {
    const hours = kind === 'ship' ? [[7, 3], [8, 3], [9, 3], [10, 2], [11, 2], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1]] : [[9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1]];
    const h = this.rng.weighted(hours);
    this.queue.push({ atH: Habs + (h - 6), id: kind });
  }
  startPass(kind) {
    if (this.pass || STORMY.includes(this.weatherType()) || (this.typhoon && !this.typhoon.ended && this.game.clock.total / 60 > this.typhoon.startH - 6)) return;
    const cfg = PASS[kind];
    this.pass = { kind, t: 0, dur: cfg.durSec, n: cfg.checks, done: 0, noticed: false, tried: false };
    this.passedCount[kind]++;
    if (kind === 'ship') this.seenShipHours.push(Math.floor(this.game.clock.hour));
    this.game.bus?.emit('ship:pass', { kind, durSec: cfg.durSec });
    this.toast(kind === 'ship' ? '沖に 船が 見える! 汽笛が 聞こえる!' : '上空を 飛行機が 飛んで いく!', 'warn');
    this.say(kind === 'ship' ? '船だ! 合図を 送って!' : '飛行機だ!');
    this.record(kind);
  }
  signalState() {
    const g = this.game;
    const base = { ...(g.sys?.signals?.state?.() ?? g.signalState?.() ?? {}) };
    for (const [k, v] of Object.entries(this.pushed)) {
      if (v.until < this.clockSec) continue;
      if (k === 'mirror') base.mirrorQ = v.val?.q ?? 50;
      else if (k === 'gunshots') base.gunshots = Math.max(base.gunshots | 0, v.val?.n ?? 3);
      else base[k] = true;
    }
    return base;
  }
  /** push a momentary signal: waving / mirror {q} / gunshots {n} / companionWave / whistle */
  signal(name, val) { this.pushed[name] = { until: this.clockSec + (SIG_TTL[name] ?? 10), val }; }
  noticeNow(kind = this.pass?.kind ?? 'ship') {
    const clock = this.game.clock;
    const sig = this.signalState();
    const night = clock.hour < 5.5 || clock.hour >= 19;
    return noticeProbability(kind, sig, { night, weather: this.weatherType() });
  }
  runPass(dt) {
    const ps = this.pass; if (!ps) return;
    const step = ps.dur / ps.n;
    ps.t += dt;
    while (!ps.noticed && ps.done < ps.n && ps.t >= (ps.done + 1) * step) {
      ps.done++;
      const np = this.noticeNow(ps.kind);
      if (np.parts.length) ps.tried = true;
      if (this.rng.next() < perCheck(np.p, ps.n)) { ps.noticed = true; break; }
    }
    if (ps.noticed) { const kind = ps.kind; this.pass = null; this.game.bus?.emit('ship:end', { kind, noticed: true }); this.onNoticed(kind); }
    else if (ps.t >= ps.dur) {
      this.pass = null; this.game.bus?.emit('ship:end', { kind: ps.kind, noticed: false });
      if (ps.tried) { this.morale(-12); this.toast('気づいて もらえなかった…', 'bad'); }
      else this.toast(ps.kind === 'ship' ? '船は 遠ざかって いった。' : '飛行機は 飛び去った。', 'info');
    }
  }
  onNoticed(kind) {
    if (kind === 'plane') {
      this.toast('飛行機が 翼を 振った! 明日の 朝 10 時に 救助船が 来る!', 'good');
      const c = this.game.clock; this.pickup = { day: c.day + 1, hour: 10, kind: 'plane' }; return;
    }
    this.toast('船が 向きを 変え、汽笛を 3 回 鳴らした!', 'good');
    this.noticed('ship');
  }
  /** after being noticed: unlimited → rescued; day modes → ask */
  noticed(how) {
    const c = this.game.clock;
    const askable = this.days > 0 || (this.days === 0 && c.day >= 100);
    if (!askable) return this.finish({ result: 'rescued', how: 'signal', by: how });
    this.offer = { how };
    this.game.bus?.emit('rescue:offer', { how, day: c.day, early: this.days > 0 && c.day < this.days });
    this.game.screens?.show?.('rescue_offer', { how, ev: this });
  }
  /** UI: true = go home (early return / rescue), false = stay (morale +15, achievement not_yet) */
  answerOffer(goHome) {
    if (!this.offer) return;
    const how = this.offer.how; this.offer = null;
    if (goHome) return this.finish({ result: 'rescued', how: this.days > 0 ? 'early' : 'signal', by: how });
    this.refused++; this.morale(15); this.toast('もう 少し、この 島に 残る。', 'info'); this.game.bus?.emit('rescue:refused', { count: this.refused });
    if (this.days === 0 && this.refused >= 2) { this.stayUnlocked = true; this.game.bus?.emit('ending:stay', {}); }
  }
  arrivePromised() {
    if (this.ended) return;
    this.toast('汽笛が 聞こえる。迎えの 船が 来た!', 'good');
    const onBeach = this.game.sys?.player?.zone === 'beach_s' || this.game.sys?.player?.zone === 'beach';
    this.finish({ result: 'rescued', how: 'promised', onBeach });
  }
  nextShipHint() {
    const hs = this.seenShipHours;
    if (!hs.length) return this.passedCount.ship ? null : '沖の 水平線を ときどき 眺めて みよう。';
    const avg = hs.reduce((a, b) => a + b, 0) / hs.length;
    if (avg < 10) return '沖を 船が 通るのは 朝が 多い';
    if (avg < 14) return '船が 通ったのは 昼ごろ だった';
    return '船が 通ったのは 午後だった';
  }

  // ------------------------------------------------------------------ raft (§15.1c), retire (d)
  /** → { ok, reasons[], p } — p only meaningful when ok */
  canEscapeByRaft() {
    const g = this.game, r = g.raftInfo?.() ?? null, reasons = [];
    if (!r || !r.has) return { ok: false, reasons: ['いかだが ない'], p: 0 };
    const w = this.weatherType();
    const comp = g.setup?.companion && g.setup.companion !== 'none';
    if (!r.sail) reasons.push('帆が ない');
    if (r.oarQ == null) reasons.push('オールが ない');
    if (STORMY.includes(w)) reasons.push('嵐の 中は 出航 できない');
    if ((r.water ?? 0) < 6) reasons.push('水が 6L 以上 必要');
    if ((r.foodFull ?? 0) < (comp ? 400 : 200)) reasons.push(`食料が 満腹 ${comp ? 400 : 200} ぶん 必要`);
    if (r.beach === undefined) reasons.push('浜で 出航する');
    return { ok: reasons.length === 0, reasons, p: this.raftChance(r, w) };
  }
  raftChance(r = this.game.raftInfo?.() ?? {}, w = this.weatherType(), mini = 0) {
    const g = this.game;
    let p = 0.30 + (r.q ?? 0) / 250 + (r.sail ? 0.15 : 0) + (r.oarQ ?? 0) / 500;
    if ((r.water ?? 0) >= 9) p += 0.08;
    if (r.preservedOnly) p += 0.05;
    p += { clear: 0.10, heat: 0.10, cloudy: 0, fog: 0, drizzle: -0.15, rain: -0.30 }[w] ?? 0;
    if (r.beach === 'north') p += 0.05;
    if (r.ebb) p += 0.05;
    if (g.setup?.companion === 'nagi') p += 0.05;
    if (this.season(g.clock.day) === 'wet') p -= 0.10;
    return Math.min(0.95, Math.max(0.05, p + mini));
  }
  /** miniBonus 0…0.09 from the three rowing mini-games */
  escapeByRaft(miniBonus = 0) {
    const c = this.canEscapeByRaft(); if (!c.ok) return { ok: false, reasons: c.reasons };
    const p = Math.min(0.95, Math.max(0.05, c.p + Math.min(0.09, Math.max(0, miniBonus))));
    if (this.rng.next() < p) { this.finish({ result: 'raft', how: 'raft', p }); return { ok: true, success: true, p }; }
    if (this.game.setup?.difficulty === 'easy' || this.rng.chance(0.5)) { this.finish({ result: 'drift', how: 'drift', p, scoreMult: 0.6 }); return { ok: true, success: false, saved: true, p }; }
    this.finish({ result: 'dead', cause: 'sea', how: 'raft', p }); return { ok: true, success: false, saved: false, p };
  }
  canRetire() { return this.days > 0 && !this.ended && this.retireAtMin == null; }
  /** menu "リタイアする": a flare; the boat comes 2 game hours later (opts.immediate to skip) */
  retire(opts = {}) {
    if (!this.canRetire()) return false;
    if (opts.immediate) { this.finish({ result: 'retired', how: 'flare' }); return true; }
    this.retireAtMin = this.game.clock.total + 120; this.toast('発煙筒を たいた。2 時間ほどで 迎えが 来る。', 'info'); return true;
  }
  broken() {
    if (this.ended) return;
    if (this.days > 0) return this.finish({ result: 'broken', how: 'flare', auto: true });
    if (this.rng.chance(0.30)) this.finish({ result: 'rescued', how: 'broken_rescued', by: 'ship' });
    else this.finish({ result: 'dead', cause: 'sick', how: 'despair' });
  }
  finish(info) { if (this.ended) return; this.ended = true; this.game.end?.(info); }

  // ------------------------------------------------------------------ persistence / debug
  serialize() {
    const { game, pushed, log, ...rest } = this;
    return JSON.parse(JSON.stringify(rest));
  }
  deserialize(d) { if (!d) return; const g = this.game; Object.assign(this, d); this.game = g; this.pushed = {}; this.log = []; }
  debug() {
    return { day1Done: this.day1Done, queue: this.queue, effects: this.effects.map((e) => e.id), typhoon: this.typhoon && { startH: this.typhoon.startH, started: this.typhoon.started }, pass: this.pass && { kind: this.pass.kind, t: Math.round(this.pass.t), done: this.pass.done },
      pickup: this.pickup, offer: !!this.offer, refused: this.refused, moraleZeroMin: Math.round(this.moraleZeroMin), guaranteeDay: this.guaranteeDay, clearDays: this.clearDays, recent: this.log.slice(-6) };
  }
}
export default Events;
