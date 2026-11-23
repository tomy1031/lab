// sim/body.js — the human body: vitals, stamina, felt temperature and body temperature, wetness, sleep,
// illnesses / poisonings / injuries, and the risk formulas for eating and drinking (DESIGN.md §4–§7).
// No three.js: the game builds an `env` object each frame and calls body.update(env). Used for the player
// and (with a 0.8 drain factor) for the companion. Pure helpers are exported for tests.
import { CONDITIONS, INFECTION_BASE, SEVERITY_BY_FRESH } from '../data/conditions.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ pure formulas
/** fire warmth by distance and fire size (§5.4). size: 'small' | 'mid' | 'big' */
export function fireWarmth(dist, size, { indoor = false, windSpeed = 0 } = {}) {
  const T = { small: [6, 3, 1], mid: [10, 6, 3], big: [14, 9, 5] }[size] || [0, 0, 0];
  let w = dist < 2 ? T[0] : dist < 4 ? T[1] : dist < 6 ? T[2] : 0;
  if (indoor) w *= 1.3; else if (windSpeed > 8) w *= 0.6;
  return w;
}

/**
 * felt temperature (§5.4).
 * e: { Tair, sun (0…1.3, already 0 at night), shade (bool: roof / tree), hat (bool), windSpeed, windBlock (0…1),
 *      wet (0…100), fire (°C), clothes (°C insulation, already reduced when wet), shelterInsul, huddle (°C) }
 */
export function feltTemp(e) {
  let t = e.Tair;
  if (!e.shade) t += (e.sun || 0) * 4.0 * (e.hat ? 0.5 : 1);
  const wb = clamp(e.windBlock || 0, 0, 1);
  t -= (e.windSpeed || 0) * 0.6 * (1 - wb);
  t -= ((e.wet || 0) / 100) * 8.0 * ((e.windSpeed || 0) > 6 ? 1.5 : 1) * (1 - wb * 0.5);
  t += e.fire || 0;
  t += e.clothes || 0;
  t += e.shelterInsul || 0;
  t += e.huddle || 0;
  return t;
}

/** target body temperature for a felt temperature (§5.6) */
export function targetBodyTemp(Tfeel, { working = false, starving = false, fever = 0 } = {}) {
  let t;
  if (Tfeel < 20) t = 36.8 - (20 - Tfeel) * (starving ? 0.30 : 0.22);
  else if (Tfeel > 30) t = 36.8 + (Tfeel - 30) * 0.25;
  else t = 36.8;
  if (working) t += 0.6;
  t += fever;
  return clamp(t, 30, 43);
}

/** freshness stage 0 fresh · 1 a bit old · 2 going off · 3 rotten (§7.2) */
export function freshStage(fresh) { return fresh >= 70 ? 0 : fresh >= 40 ? 1 : fresh >= 15 ? 2 : 3; }
export const FRESH_F = [1.0, 1.8, 4.0, 9.0];

/** cooking stage from `done` (§7.3): 0 raw · 1 half · 2 cooked · 3 burnt · 4 charcoal */
export function cookStage(done) { return done < 30 ? 0 : done < 65 ? 1 : done <= 100 ? 2 : done <= 130 ? 3 : 4; }
export const COOK_C = [1.0, 0.45, 0.08, 0.06, 0.06];
export const COOK_FOOD = [1.0, 1.1, 1.25, 0.7, 0];
export const PROC_S = { none: 1, dried: 0.6, smoked: 0.4, salted: 0.5, salted_dried: 0.4, confit: 0.3 };

/**
 * chance of food poisoning for one portion (§7.4).
 * f: { B, parasite, fresh, done, proc ('none'|'dried'|…), stew (bool) }, ctx: { hygiene, D, washedHands }
 * returns { p, pParasite }
 */
export function eatRisk(f, ctx = {}) {
  const st = freshStage(f.fresh ?? 100);
  const F = FRESH_F[st];
  const cst = cookStage(f.done ?? 0);
  const C = f.stew ? 0.05 : COOK_C[cst];
  const S = PROC_S[f.proc || 'none'] ?? 1;
  const hyg = ctx.hygiene ?? 60;
  let H = hyg >= 50 ? 1 : 1 + (50 - hyg) / 100;
  if (ctx.washedHands) H = 0.9;
  const D = ctx.D ?? 1;
  let p = (f.B ?? 0) * F * C * S * H * D;
  if (st === 3) p = Math.max(p, 0.35 * Math.sqrt(C));
  p = clamp(p, 0, 0.95);
  const pm = cst === 0 && !f.stew ? 1 : cst === 1 && !f.stew ? 0.5 : 0;
  const ps = f.proc === 'smoked' || f.proc === 'dried' ? 0.5 : f.proc === 'salted' ? 0.7 : 1;
  return { p, pParasite: clamp((f.parasite ?? 0) * pm * ps, 0, 1), stage: st };
}

/** water illness chance for one cup (§7.6). W: base rate of the source, treat multiplier, D difficulty */
export function drinkRisk(W, treat = 1, D = 1) { return clamp(W * treat * D, 0, 0.9); }

/** risk band shown without the guide (§7.4): 0 safe · 1 a bit worrying · 2 suspicious · 3 dangerous */
export function riskBand(p) { return p < 0.03 ? 0 : p < 0.12 ? 1 : p < 0.35 ? 2 : 3; }
export const RISK_LABEL = ['安全そう', '少し心配', 'あやしい', '危険'];

/** chance of catching a cold this hour (§5.7) */
export function coldChance(s, D = 1, recentCold = false) {
  let p = 0.004 * (s.bodyTemp < 36 ? 3 : 1) * (s.wet > 50 ? 2 : 1) * (s.rest < 30 ? 1.5 : 1) * (s.food < 20 ? 1.3 : 1) * (s.morale < 20 ? 1.2 : 1) * D;
  if (recentCold) p *= 0.3;
  return Math.min(0.12, p);
}

// ------------------------------------------------------------------ the body
export class Body {
  /** opts: { rng, diff (DIFFICULTY entry), drainMul (companion 0.8), name, bus, isPlayer } */
  constructor(opts = {}) {
    this.rng = opts.rng;
    this.diff = opts.diff || { drain: 1, illness: 1, worsen: 1, thermal: 0.35, needs: 1 };
    this.drainMul = opts.drainMul ?? 1;
    this.name = opts.name || 'あなた';
    this.bus = opts.bus || null;
    this.isPlayer = opts.isPlayer ?? true;
    this.s = { hp: 100, food: 70, water: 70, stamina: 100, staminaMax: 100, rest: 80, bodyTemp: 36.8, wet: 0, morale: 70, hygiene: 60 };
    this.conditions = [];      // { id, sev, t (hours since start), incubation, duration, treated:{}, source, bleedStopped }
    this.lastHour = -1;
    this.hoursT = 0;           // total game hours lived
    this.feel = 27;            // last felt temperature
    this.tTarget = 36.8;
    this.sleeping = false;
    this.sleepQuality = 0.6;
    this.coldCuredAt = -999;
    this.flags = {};           // per-day counters (sea water cups, coconuts eaten, morale bonuses …)
    this.zeroMoraleH = 0;
    this.deathCause = null;
    this.log = [];
    this.heavyT = 0;           // seconds of heavy work recently (for 'working')
  }

  emit(name, arg) { this.bus?.emit(name, { who: this.name, isPlayer: this.isPlayer, ...arg }); }

  has(id) { return this.conditions.find((c) => c.id === id && c.t >= c.incubation) || null; }
  hasAny(id) { return this.conditions.find((c) => c.id === id) || null; }

  /** add a condition (same id keeps the heavier one) */
  addCondition(id, sev = 1, source = '', { incubation = null } = {}) {
    const def = CONDITIONS[id];
    if (!def) return null;
    sev = clamp(Math.round(sev), 1, 3);
    const inc = incubation ?? (def.incubation[0] + this.rng.next() * (def.incubation[1] - def.incubation[0]));
    const old = this.hasAny(id);
    if (old) {
      if (sev > old.sev) { old.sev = sev; old.duration = def.hours[sev - 1]; }
      return old;
    }
    const c = { id, sev, t: 0, incubation: inc, duration: def.hours[sev - 1], treated: {}, source, worsenT: 0, infectT: 0 };
    this.conditions.push(c);
    if (inc <= 0) this.onset(c);
    return c;
  }

  onset(c) {
    const def = CONDITIONS[c.id];
    c.started = true;
    if (def.vomitFood) { this.s.food = Math.max(0, this.s.food - def.vomitFood[c.sev - 1] * (c.treated.ginger ? 0.5 : 1)); this.emit('vomit', {}); }
    this.addMorale(def.kind === 'injury' ? -5 : -8, 'sick');
    this.emit('condition', { id: c.id, sev: c.sev, name: def.name, source: c.source });
  }

  removeCondition(id) {
    const i = this.conditions.findIndex((c) => c.id === id);
    if (i >= 0) {
      const [c] = this.conditions.splice(i, 1);
      if (id === 'cold') this.coldCuredAt = this.hoursT;
      this.emit('healed', { id, name: CONDITIONS[id]?.name });
      return c;
    }
    return null;
  }

  /** sum of a per-severity effect over active conditions (mul = multiply, else add) */
  eff(key, mul = false) {
    let v = mul ? 1 : 0;
    for (const c of this.conditions) {
      if (c.t < c.incubation) continue;
      const arr = CONDITIONS[c.id]?.[key];
      if (!arr) continue;
      const x = arr[c.sev - 1];
      if (x === undefined) continue;
      if (c.id === 'cold' && c.treated.feverStopUntil > this.hoursT && key === 'temp') continue;
      v = mul ? v * x : v + x;
    }
    return v;
  }

  addMorale(d, why = '') {
    this.s.morale = clamp(this.s.morale + d, 0, 100);
    if (Math.abs(d) >= 3) this.emit('morale', { delta: d, why });
  }

  /** daily-limited morale bonus (key per day) */
  moraleOnce(key, d, day, limit = 1) {
    const k = `${key}:${day}`;
    this.flags[k] = (this.flags[k] || 0) + 1;
    if (this.flags[k] <= limit) this.addMorale(d, key);
  }

  get speedMul() {
    const s = this.s;
    let m = this.eff('move', true);
    if (s.food < 10) m *= 0.85;
    if (s.water < 10) m *= 0.8;
    if (s.bodyTemp >= 40 && s.bodyTemp < 41.5) m *= 0.8;
    if (s.bodyTemp < 35 && s.bodyTemp >= 33) m *= 0.7;
    if (s.bodyTemp < 33) m *= 0.6;
    return m;
  }
  get canRun() {
    const s = this.s;
    if (s.stamina < 10 || s.hp < 30 || s.bodyTemp < 33) return false;
    return !this.conditions.some((c) => c.t >= c.incubation && CONDITIONS[c.id]?.noRun);
  }
  /** multiplier for action success / quality (§4.5) */
  get workMul() {
    const s = this.s;
    let m = this.eff('work', true);
    if (s.food < 10) m *= 0.85;
    if (s.rest < 30) m *= 0.9;
    if (s.morale < 10) m *= 0.8; else if (s.morale > 80) m *= 1.05;
    if (s.bodyTemp >= 38.5 && s.bodyTemp < 40) m *= 0.9;
    if (s.bodyTemp < 35 && s.bodyTemp >= 33) m *= 0.7;
    if (s.stamina < 10) m *= 0.7;
    return m;
  }
  /** aim / gesture shake factor (cold, stings, numbness) */
  get shake() {
    let k = 1;
    if (this.s.bodyTemp < 36) k += 0.3;
    k += this.eff('shake');
    if (this.has('numb')) k += 0.6;
    return k;
  }

  /**
   * env: { dtH (game hours), dtReal (s), sleeping, heavy (bool), running, swimming, moving, jumped,
   *        Tair, sun, shade, hat, windSpeed, windBlock, rainWet (wet/h from the rain after roof & clothes), dry (wet/h drying),
   *        humidity, fire (°C), clothes, shelterInsul, huddle, companionNear, fireNear, night, outdoorsNoFire,
   *        inWater, waterDepth, hour, day, sleepQuality }
   */
  update(env) {
    const s = this.s, dh = env.dtH, D = this.diff;
    if (dh <= 0 && !env.dtReal) return;
    this.hoursT += dh;
    const drain = D.drain * this.drainMul * (D.needs || 1);
    const sleeping = !!env.sleeping;
    this.sleeping = sleeping;
    const heavy = !!env.heavy;

    // ---------------- felt temperature & body temperature
    const fever = this.eff('temp');
    const clothes = env.clothes ?? (s.wet > 60 ? 0.3 : 1.0);
    this.feel = feltTemp({ Tair: env.Tair, sun: env.sun, shade: env.shade, hat: env.hat, windSpeed: env.windSpeed, windBlock: env.windBlock, wet: s.wet, fire: env.fire, clothes, shelterInsul: env.shelterInsul, huddle: env.huddle });
    this.tTarget = targetBodyTemp(this.feel, { working: heavy, starving: s.food < 10, fever });
    // the design's rate is a per-hour step: 1 h moves 35 % of the gap (so dh-steps compound to the same)
    s.bodyTemp += (this.tTarget - s.bodyTemp) * (1 - Math.pow(1 - (D.thermal ?? 0.35), dh));

    // ---------------- wetness (§5.5)
    if (env.swimming || env.waterDepth > 1.0) s.wet = 100;
    else if (env.inWater) s.wet = Math.max(s.wet, 40);
    s.wet = clamp(s.wet + (env.rainWet || 0) * dh - (env.dry ?? 10) * dh + (env.dew || 0) * dh + (heavy && this.feel > 30 ? 8 * dh : 0), 0, 100);

    // ---------------- needs (§4.3)
    const hot = this.feel > 30 ? (this.feel - 30) * 0.4 : 0;
    let dFood = sleeping ? -1.5 : heavy ? -5.0 : -3.0;
    if (s.bodyTemp < 36) dFood -= 1.5;
    dFood *= this.eff('foodDrain', true);
    let dWater = sleeping ? -2.0 : heavy ? -7.0 : -4.5;
    dWater -= hot * (sleeping ? 0.3 : 1);
    dWater += this.eff('water');
    if (s.bodyTemp >= 38.5 && s.bodyTemp < 40) dWater -= 1.5;
    s.food = clamp(s.food + dFood * drain * dh, 0, 100);
    s.water = clamp(s.water + dWater * drain * dh, 0, 100);
    let dRest = sleeping ? 12 * (env.sleepQuality ?? this.sleepQuality) : heavy ? -5.5 : -4.2;
    if (!sleeping && env.sittingByFire) dRest = 1.0;
    s.rest = clamp(s.rest + (dRest > 0 ? dRest : dRest * drain) * dh, 0, 100);

    // ---------------- morale (§4.3)
    let dM = -0.8;
    if (env.night && env.outdoorsNoFire) dM -= 2;
    if (s.wet > 50) dM -= 1.5;
    if (env.companionNear) dM += 0.6;
    if (env.night && env.fireNear) dM += 1.5;
    if (s.food < 30) dM -= 0.5;
    if (s.food < 10) dM -= 1.0;
    if (s.rest < 10) dM -= 2;
    dM -= 0.5 * this.conditions.filter((c) => c.t >= c.incubation).length;
    if (sleeping) dM *= 0.3;
    s.morale = clamp(s.morale + dM * dh, 0, 100);
    if (s.morale <= 0) this.zeroMoraleH += dh; else this.zeroMoraleH = 0;

    // ---------------- hp (§4.3, §4.5, §5.6, §6)
    let dHp = 0;
    const heavyCond = this.conditions.some((c) => c.t >= c.incubation && c.sev >= 2 && CONDITIONS[c.id]?.kind !== 'injury');
    if (s.food > 40 && s.water > 40 && !heavyCond && s.bodyTemp >= 35 && s.bodyTemp < 38.5) dHp += sleeping ? 3.0 : 1.5;
    if (s.food <= 0) dHp -= 2.0;
    if (s.water <= 0) dHp -= 5.0;
    else if (s.water < 10) dHp -= 1.0;
    const bt = s.bodyTemp;
    if (bt >= 41.5) dHp -= 10; else if (bt >= 40) dHp -= 4;
    if (bt < 31) dHp -= 25; else if (bt < 33) dHp -= 10; else if (bt < 35) dHp -= 4;
    let condHp = 0;
    for (const c of this.conditions) {
      if (c.t < c.incubation) continue;
      const def = CONDITIONS[c.id];
      let h = def.hp?.[c.sev - 1] ?? 0;
      if (def.bleed && c.bleedStopped) h = Math.min(0, h * 0.2);
      condHp += h;
    }
    dHp += Math.max(-12, condHp);
    if (D.name === '極限' && s.morale <= 0) dHp -= 1;
    s.hp = clamp(s.hp + dHp * dh, 0, 100);

    // ---------------- stamina (real-time, §4.4)
    const inj = 1 - this.eff('stamina', true);
    s.staminaMax = 100 * clamp(0.35 + (s.rest / 100) * 0.65, 0.35, 1) * clamp(0.5 + s.food / 100, 0.5, 1) * (1 - inj);
    const dr = env.dtReal || 0;
    if (env.running) s.stamina -= 5.0 * dr;
    else if (env.swimming) s.stamina -= 4.0 * dr;
    else if (env.moving) s.stamina += 3.0 * dr * (s.water < 20 ? 0.5 : 1);
    else s.stamina += 6.0 * dr * (s.water < 20 ? 0.5 : 1) * (s.water < 30 ? 0.7 / 0.7 : 1);
    if (env.jumped) s.stamina -= 6;
    if (env.swimming && s.stamina <= 0) { s.hp = Math.max(0, s.hp - 5 * dr); if (s.hp <= 0) this.deathCause ||= 'drown'; }
    s.stamina = clamp(s.stamina, 0, s.staminaMax);

    // ---------------- conditions: time, auto conditions, healing
    this.autoConditions(env);
    for (const c of [...this.conditions]) {
      const before = c.t < c.incubation;
      const speed = (sleeping || env.resting ? 1.5 : 1) * (s.food > 50 && s.water > 50 ? 1.2 : 1) * (c.treated.speed || 1);
      c.t += dh * (c.t < c.incubation ? 1 : speed);
      if (before && c.t >= c.incubation) this.onset(c);
      if (c.t >= c.incubation && c.t - c.incubation >= c.duration) this.removeCondition(c.id);
    }

    // ---------------- hourly checks
    const hourIdx = Math.floor(this.hoursT);
    if (hourIdx !== this.lastHour) {
      const n = this.lastHour < 0 ? 0 : hourIdx - this.lastHour;
      this.lastHour = hourIdx;
      for (let k = 0; k < Math.min(n, 48); k++) this.hourly(env);
    }

    // ---------------- death
    if (s.hp <= 0 && !this.deathCause) this.deathCause = this.guessCause();
  }

  autoConditions(env) {
    const s = this.s;
    // hypothermia / heatstroke follow the body temperature
    if (s.bodyTemp < 35) { const sev = s.bodyTemp < 31 ? 3 : s.bodyTemp < 33 ? 2 : 1; const c = this.hasAny('hypothermia'); if (!c) this.addCondition('hypothermia', sev, '冷え', { incubation: 0 }); else c.sev = sev; }
    else if (this.hasAny('hypothermia') && s.bodyTemp >= 36) this.removeCondition('hypothermia');
    if (s.bodyTemp >= 40) { this.hotT = (this.hotT || 0) + env.dtH; if (this.hotT > 0.5) { const sev = s.bodyTemp >= 41.5 ? 3 : 2; const c = this.hasAny('heatstroke'); if (!c) this.addCondition('heatstroke', sev, '暑さ', { incubation: 0 }); else c.sev = Math.max(c.sev, sev); } }
    else { this.hotT = 0; const hs = this.hasAny('heatstroke'); if (hs && s.bodyTemp < 38.5) { hs.coolT = (hs.coolT || 0) + env.dtH; if (hs.coolT > 2) this.removeCondition('heatstroke'); } }
  }

  hourly(env) {
    const s = this.s, D = this.diff, r = this.rng;
    // cold (§5.7)
    if (!this.hasAny('cold')) {
      const p = coldChance(s, D.illness, this.hoursT - this.coldCuredAt < 48);
      if (r.next() < p) this.addCondition('cold', r.next() < 0.75 ? 1 : 2, s.wet > 50 ? '濡れて冷えた' : '疲れと冷え');
    }
    // heatstroke chance (§6.2)
    if (!this.hasAny('heatstroke') && env.sun > 0.5 && !env.shade) {
      const p = 0.02 * (s.water < 30 ? 3 : 1) * (env.hat ? 1 : 2) * (this.feel > 32 ? 1 : 0.2);
      if (r.next() < p * D.illness) this.addCondition('heatstroke', 1, '日差し', { incubation: 0 });
    }
    // dehydration flag
    // worsening every 12 h, infection of wounds every 12 h
    for (const c of [...this.conditions]) {
      if (c.t < c.incubation) continue;
      const def = CONDITIONS[c.id];
      c.worsenT += 1;
      if (c.worsenT >= 12) {
        c.worsenT = 0;
        if (c.sev < 3 && !def.noWorsen && !def.auto && def.kind !== 'injury') {
          const treated = Object.keys(c.treated).length > 0;
          const p = (treated ? 0.03 : 0.10 * 1.5) * (s.rest < 30 ? 1.5 : 1) * (s.food < 20 ? 1.3 : 1) * (D.worsen ?? 1);
          if (r.next() < p) { c.sev++; c.duration = def.hours[c.sev - 1]; this.emit('worse', { id: c.id, sev: c.sev, name: def.name }); }
        }
        if (def.wound && !c.healedWound) {
          const base = INFECTION_BASE[def.wound] ?? 0.06;
          const p = base * (c.treated.washed ? 0.5 : 1) * (c.treated.bandage ? 0.4 : 1) * (c.treated.herb ? 0.5 : 1) * (s.hygiene < 50 ? 1.5 : 1) * (c.dirty ? 1.5 : 1) * D.illness;
          if (r.next() < p) this.addCondition('infection', 1, `${def.name}から`);
        }
      }
    }
    // infection severity 3 for 48 h → sepsis-like heavy damage (folded into its hp)
    // natural partial heal of light infection after 72 h is in its duration; 2/3 never heal by themselves
    // sleep deprivation: forced sleep handled by the game (rest = 0)
  }

  // ------------------------------------------------------------------ actions on the body
  /**
   * eat one portion. food: { name, food, water, B, parasite, fresh, done, proc, stew, poison: {id, chance, sev:[a,b], source}, moraleRaw, raw kind }
   * Returns { p, poisoned, parasite, poisonHit }
   */
  eat(food, ctx = {}) {
    const s = this.s, r = this.rng;
    if (this.has('numb')) return { refused: 'しびれて食べられない' };
    const st = freshStage(food.fresh ?? 100);
    const cst = cookStage(food.done ?? 0);
    if (cst === 4) return { refused: '炭になっている' };
    const fMul = (food.stew ? 1 : COOK_FOOD[cst]) * (st === 3 ? 0.5 : 1) * this.eff('absorb', true);
    if (s.food > 95 && r.next() < 0.2) { s.water = Math.max(0, s.water - 10); this.emit('toast', { text: '食べすぎて気持ちが悪い…' }); }
    s.food = clamp(s.food + (food.food || 0) * fMul, 0, 100);
    s.water = clamp(s.water + (food.water || 0), 0, 100);
    // morale (§4.7)
    if (cst === 0 && !food.stew && food.rawPenalty) this.addMorale(food.rawPenalty, 'raw');
    if (cst === 2 || food.stew) this.addMorale(food.stew ? (food.kinds >= 3 ? 8 : 4) : 4, 'warm_meal');
    if (cst === 3) this.addMorale(-2, 'burnt');
    if (st === 2) this.addMorale(-3, 'stale');
    if (st === 3) this.addMorale(-6, 'rotten');
    // illness
    const risk = eatRisk(food, { hygiene: s.hygiene, D: this.diff.illness, washedHands: ctx.washedHands });
    const out = { p: risk.p, poisoned: false };
    if (r.next() < risk.p) {
      const w = SEVERITY_BY_FRESH[st];
      const roll = r.next();
      const sev = roll < w[0] ? 1 : roll < w[0] + w[1] ? 2 : 3;
      this.addCondition('food_poison', sev, food.name);
      out.poisoned = true;
    }
    if (risk.pParasite > 0 && r.next() < risk.pParasite) { this.addCondition('parasite', 1, food.name); out.parasite = true; }
    // toxins (heat does not remove them)
    if (food.poison) {
      const pz = food.poison;
      let chance = pz.chance * (ctx.nibble ? 0.2 : 1) * (pz.cookable && cst >= 2 ? 0 : 1);
      if (r.next() < chance) {
        const sev = ctx.nibble ? 1 : pz.sev ? pz.sev[0] + Math.floor(r.next() * (pz.sev[1] - pz.sev[0] + 1)) : 1;
        this.addCondition(pz.id || 'plant_poison', sev, food.name, pz.incubation !== undefined ? { incubation: pz.incubation } : {});
        if (pz.also) this.addCondition(pz.also, 1, food.name);
        if (pz.hp) { s.hp = Math.max(0, s.hp - pz.hp); }
        out.poisonHit = true;
      }
    }
    this.emit('eat', { name: food.name, p: risk.p });
    return out;
  }

  /** drink one cup. src: { name, water (per cup, sea = −10), W, treat (multiplier), salty } */
  drink(src, ctx = {}) {
    const s = this.s, r = this.rng;
    s.water = clamp(s.water + (src.water ?? 20) * (ctx.hands ? 0.5 : 1) * (src.coconut && this.has('water_illness') ? 1.5 : 1), 0, 100);
    if (src.salty) {
      const k = `sea:${ctx.day}`; this.flags[k] = (this.flags[k] || 0) + 1;
      if (this.flags[k] >= 2) { s.food = Math.max(0, s.food - 15); this.emit('vomit', {}); }
      return { p: 0 };
    }
    const p = drinkRisk(src.W ?? 0, src.treat ?? 1, this.diff.illness);
    if (r.next() < p) this.addCondition('water_illness', r.next() < 0.7 ? 1 : 2, src.name);
    if (src.parasite && r.next() < src.parasite) this.addCondition('parasite', 1, src.name);
    if (src.warm) { s.bodyTemp += 0.4; }
    this.emit('drink', { name: src.name, p });
    return { p };
  }

  /** an injury happening now (cut, burn, bite, bruise …) */
  injure(id, sev = 1, hpLoss = 0, source = '') {
    this.s.hp = Math.max(0, this.s.hp - hpLoss);
    const c = this.addCondition(id, sev, source, { incubation: 0 });
    this.emit('hurt', { id, sev, hp: hpLoss, source });
    if (this.s.hp <= 0) this.deathCause ||= source || id;
    return c;
  }

  /** treatments: kind 'wash'|'bandage'|'herb'|'charcoal'|'ginger'|'aloe'|'cool'|'antibiotic'|'fever'|'splint'|'suction' */
  treat(kind, power = 1) {
    let did = false;
    for (const c of this.conditions) {
      const def = CONDITIONS[c.id];
      if (kind === 'wash' && def.wound) { c.treated.washed = true; did = true; }
      if (kind === 'bandage' && def.wound) { c.treated.bandage = true; c.bleedStopped = true; did = true; }
      if (kind === 'herb_stop_bleed' && def.bleed) { c.bleedStopped = true; c.treated.herb = true; did = true; }
      if (kind === 'poultice' && c.id === 'infection' && this.rng.next() < 0.6 * power) { c.sev--; did = true; if (c.sev <= 0) { this.removeCondition('infection'); } }
      if (kind === 'charcoal' && (c.id === 'food_poison' || c.id === 'plant_poison')) { c.treated.speed = 2; if (c.t < 2 + c.incubation && this.rng.next() < 0.6) c.sev = Math.max(1, c.sev - 1); did = true; }
      if (kind === 'ginger' && c.id === 'cold') { c.treated.speed = 1 / 0.6; c.treated.ginger = true; did = true; }
      if (kind === 'aloe' && (c.id === 'burn' || c.id === 'sting')) { c.treated.speed = 2; did = true; }
      if (kind === 'cool' && c.id === 'burn' && c.t < 0.3) { c.sev = Math.max(1, c.sev - 1); did = true; }
      if (kind === 'antibiotic' && c.id === 'infection') { c.sev -= 2; did = true; }
      if (kind === 'fever' && (c.id === 'cold' || c.id === 'infection')) { c.treated.feverStopUntil = this.hoursT + 12; did = true; }
      if (kind === 'splint' && c.id === 'sprain') { c.treated.speed = 1 / 0.7; did = true; }
      if (kind === 'suction' && c.id === 'snake_venom') { c.sev = Math.max(1, c.sev - 1); did = true; }
      if (kind === 'guava' && (c.id === 'water_illness' || c.id === 'food_poison')) { c.treated.speed = 1.3; did = true; }
      if (kind === 'vomit' && c.id === 'plant_poison' && c.t < c.incubation + 0.5) { c.sev = Math.max(1, c.sev - 1); did = true; }
    }
    this.conditions = this.conditions.filter((c) => c.sev > 0);
    if (did) this.addCondition && this.emit('treated', { kind });
    return did;
  }

  guessCause() {
    const s = this.s;
    if (s.water <= 0) return 'thirst';
    if (s.food <= 0) return 'hunger';
    if (s.bodyTemp < 33) return 'cold';
    if (s.bodyTemp >= 40) return 'heat';
    const worst = this.conditions.filter((c) => c.t >= c.incubation).sort((a, b) => b.sev - a.sev)[0];
    return worst ? worst.id : 'unknown';
  }

  /** list of visible conditions for the HUD */
  visible() {
    return this.conditions.filter((c) => c.t >= c.incubation).map((c) => ({ id: c.id, sev: c.sev, name: CONDITIONS[c.id].name, icon: CONDITIONS[c.id].icon, treat: CONDITIONS[c.id].treat, bleeding: CONDITIONS[c.id].bleed && !c.bleedStopped }));
  }

  serialize() { return { s: this.s, conditions: this.conditions, hoursT: this.hoursT, lastHour: this.lastHour, coldCuredAt: this.coldCuredAt, flags: this.flags }; }
  deserialize(d) { Object.assign(this, { s: { ...this.s, ...d.s }, conditions: d.conditions || [], hoursT: d.hoursT || 0, lastHour: d.lastHour ?? -1, coldCuredAt: d.coldCuredAt ?? -999, flags: d.flags || {} }); }
}
