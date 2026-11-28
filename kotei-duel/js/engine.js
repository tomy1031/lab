// js/engine.js — the rules of KOTEI DUEL (docs/DESIGN.md §3–4), with no drawing in it.
//
// A Duel holds the whole state and changes it only through actions (place, play, review, approve, fix, respond,
// endTurn). Everything that happens is sent out as an event through `emit(ev)`, in order, and the engine waits
// for each one (the page and the headset animate them; tests pass a function that returns at once). When the
// player may cut in with a face-down Guard, the engine asks through `ask('guard', info)` and waits for the answer.
// Randomness (shuffling, the random discard) comes from a seeded generator, so a seed + the same actions always
// give the same duel.
import { CARD_BY_ID, OPS } from './data/cards.js';
import { CHAPTER_BY_ID, TRACKS, DEFAULT_RULES } from './data/chapters.js';
import { LESSON_ON } from './data/lessons.js';

export const C = (id) => CARD_BY_ID[id];

export function rng32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const MAKE = ['design', 'make'];
const grp = (g) => (ef) => !ef.group || ef.group === 'all' || ef.group === g;

export class Duel {
  constructor(chId, opts = {}) {
    const ch = CHAPTER_BY_ID[chId];
    if (!ch) throw new Error('unknown chapter ' + chId);
    const R = { reviewCost: 1, approveCost: 1, ...DEFAULT_RULES, ...ch.rules, ...(opts.rules || {}) };
    const tr = TRACKS[ch.track];
    this.ch = ch; this.R = R;
    this.seed = opts.seed ?? 1;
    this.r = rng32(this.seed);
    this.emitFn = opts.emit || null;
    this.askFn = opts.ask || null;
    this.track = tr.stages; this.pair = tr.pair; this.trackInfo = tr;
    this.turn = 0; this.side = 'p'; this.over = null; this.busy = false;
    this.trust = R.trust; this.effort = 0; this.effortNext = 0; this.deadline = R.deadline; this.late = 0;
    this.ptr = 0; this.placed = []; this.released = false; this.opsLeft = null; this.releaseTurn = null;
    this.stageUsed = 0; this.extra = 0; this.extraBug = 0; this.reviewed = false;
    this.uid = 1;
    this.seen = new Set(); // lessons shown in this duel
    this.moments = new Set();
    this.stats = { fixSpent: 0, incidents: 0, lateTurns: 0, dmg: 0, guards: 0, reviews: 0, approvals: 0, skips: 0, breaks: 0, found: 0, relFail: 0, blocked: 0 };
    const pdeck = R.fixedOrder ? (opts.playerDeck || ch.playerDeck).slice() : shuffle(opts.playerDeck || ch.playerDeck, this.r);
    const edeck = R.fixedOrder ? ch.enemy.deck.flat() : ch.enemy.deck.flatMap((seg) => shuffle(seg, this.r));
    this.p = { deck: pdeck, hand: [], discard: [], team: [], back: [] };
    this.e = { deck: edeck, hand: [], discard: [], field: [], plots: [], ap: 0 };
  }

  // ---------- plumbing ----------
  async emit(ev) { if (this.emitFn) await this.emitFn(ev, this); }
  async ask(kind, info) { return this.askFn ? this.askFn(kind, info, this) : (kind === 'guard' ? 0 : null); }
  async lesson(id, reason) {
    if (!id || this.seen.has(id)) return;
    this.seen.add(id);
    await this.emit({ type: 'lesson', id, reason });
  }
  async lessonOn(key) { await this.lesson(LESSON_ON[key], key); }
  async moment(key, once = true) {
    if (once && this.moments.has(key)) return;
    this.moments.add(key);
    await this.emit({ type: 'moment', key });
  }
  newUid() { return this.uid++; }

  // ---------- setup ----------
  async start() {
    for (let i = 0; i < this.R.hand; i++) this.drawOne('p');
    for (let i = 0; i < this.R.enemyHand; i++) this.drawOne('e');
    await this.emit({ type: 'deal', hand: this.p.hand.slice(), enemyHand: this.e.hand.length });
    if (this.R.startReleased) {
      this.track.forEach((id, i) => { this.placed[i] = { id, idx: i, approved: true, skipped: false, bugs: [] }; });
      this.ptr = this.track.length; this.released = true; this.opsLeft = this.R.ops;
      await this.emit({ type: 'setup', placed: this.placed.slice(), released: true, opsLeft: this.opsLeft });
      // they were there before you came: not NEW
      for (const t of this.R.startTroubles || []) { const u = await this.summon(t.id, t.pressure); if (u) u.isNew = false; }
    }
    await this.moment('start');
    await this.startPlayerTurn();
  }

  drawOne(who) {
    const z = this[who];
    if (!z.deck.length) {
      if (who === 'p' && z.discard.length) { z.deck = shuffle(z.discard, this.r); z.discard = []; }
      else return null;
    }
    const card = { uid: this.newUid(), id: z.deck.shift() };
    z.hand.push(card);
    return card;
  }
  async draw(who, n) {
    const got = [];
    for (let i = 0; i < n; i++) { const c = this.drawOne(who); if (c) got.push(c); }
    if (got.length) await this.emit({ type: 'draw', who, cards: who === 'p' ? got : got.map((c) => ({ uid: c.uid })), n: got.length });
    return got;
  }

  // ---------- board queries ----------
  makeStages() { return this.placed.filter((s) => s && !s.skipped && MAKE.includes(C(s.id).group)); }
  latestMake() { return this.makeStages().slice(-1)[0]; }
  latestAny() { return this.placed.filter((x) => x && !x.skipped).slice(-1)[0]; }
  firstStage() { return this.placed.find((s) => s && !s.skipped); }
  allBugs() { return this.placed.flatMap((s) => (s ? s.bugs.map((b) => ({ b, s })) : [])); }
  bugTotal() { return this.allBugs().reduce((a, x) => a + x.b.size, 0); }
  stageSel(at) {
    if (at === 'latest') return [this.latestMake()].filter(Boolean);
    if (at === 'first') return [this.firstStage()].filter(Boolean);
    if (at === 'make') { const pg = this.placed.find((s) => s && C(s.id).group === 'make'); return [pg || this.latestMake()].filter(Boolean); }
    if (at === 'all' || at === 'any') return this.placed.filter(Boolean);
    if (at === 'placed') return this.placed.filter((s) => s && !s.skipped);
    return [];
  }
  cond(name) {
    if (!name || name === 'always') return true;
    const mk = this.makeStages();
    switch (name) {
      case 'released': return this.released;
      case 'notReleased': return !this.released;
      case 'hasStage': return mk.length > 0;
      case 'hasApproved': return this.placed.some((s) => s && s.approved);
      case 'hasUnapproved': return mk.some((s) => !s.approved);
      case 'firstUnapproved': { const f = this.firstStage(); return !!f && !f.approved && !this.released; }
      case 'latestUnapproved': { const l = this.latestAny(); return !!l && !l.approved && !this.released; }
      case 'testPlaced': return this.placed.some((s) => s && C(s.id).group === 'test') && !this.released;
      case 'nearRelease': return !this.released && this.ptr >= this.track.length - 3;
      case 'hasUnit': return this.p.team.length > 0;
      case 'hasGuard': return this.p.back.some((b) => b.down);
      case 'hasBug': return this.allBugs().length > 0;
      case 'hasUnfound': return this.allBugs().some((x) => !x.b.found);
    }
    if (name.startsWith('stage:')) return this.placed.some((s) => s && s.id === 'st_' + name.slice(6));
    throw new Error('unknown condition ' + name);
  }
  // continuous modifiers from the board (team, face-up documents, the enemy's troubles)
  mods(what, f = () => true) {
    let n = 0;
    const srcs = [...this.p.team.map((u) => u.id), ...this.p.back.filter((b) => !b.down).map((b) => b.id), ...this.e.field.map((t) => t.id)];
    for (const id of srcs) for (const ef of C(id).effects) if (ef.on === 'static' && ef.op === 'mod' && ef.what === what && f(ef)) n += ef.n;
    return n;
  }
  stageCost(id) { return Math.max(0, C(id).cost + this.mods('stageCost', grp(C(id).group))); }
  fixCost(b) { return Math.max(1, b.size + this.mods('fixCost')); }
  unitPower(u, t) {
    let p = C(u.id).power + (u.buff || 0) + this.mods('power');
    if (t) for (const ef of C(u.id).effects) if (ef.op === 'mod' && ef.what === 'powerVs' && ef.tags.includes(C(t.id).tag)) p += ef.n;
    return Math.max(0, p);
  }
  // effort at the start of the next player turn (for the HUD preview)
  baseEffort(turn = this.turn) { return Math.min(this.R.effortCap, this.R.effortStart + (turn - 1) * this.R.effortGrow); }

  // ---------- legality (the page lights up what is allowed) ----------
  canAct() { return !this.over && this.side === 'p' && !this.busy; }
  placeProblem(idx) {
    if (this.released) return 'released';
    if (idx < this.ptr || idx >= this.track.length) return 'order';
    if (this.stageUsed >= 1 + this.extra) return 'once';
    const c = C(this.track[idx]);
    if ((c.group === 'test' || c.group === 'release') && !this.placed.some((s) => s && C(s.id).group === 'make')) return 'needMake';
    if (c.group !== 'make' && c.group !== 'design') for (let j = this.ptr; j < idx; j++) if (C(this.track[j]).group === 'make') return 'skipMake';
    if (this.effort < this.stageCost(this.track[idx])) return 'effort';
    return null;
  }
  canPlace(idx) { return this.canAct() && !this.placeProblem(idx); }
  skipsIfPlaced(idx) { const h = []; for (let j = this.ptr; j < idx; j++) if (C(this.track[j]).group === 'design') h.push(j); return h; }
  playProblem(uid, opt = {}) {
    const hc = this.p.hand.find((h) => h.uid === uid);
    if (!hc) return 'missing';
    const c = C(hc.id);
    if (this.effort < c.cost) return 'effort';
    if (c.kind === 'unit' && this.p.team.length >= this.R.teamSlots && opt.replace == null) return 'teamFull';
    if ((c.kind === 'guard' || c.kind === 'doc') && this.p.back.length >= this.R.backSlots && opt.replace == null) return 'backFull';
    return null;
  }
  canPlay(uid, opt) { return this.canAct() && !this.playProblem(uid, opt); }
  reviewTarget() { const m = this.latestMake(); if (!m) return null; const b = m.bugs.filter((x) => !x.found).sort((a, c) => c.size - a.size)[0]; return b ? { s: m, b } : null; }
  canReview() { return this.canAct() && !this.reviewed && this.effort >= this.R.reviewCost && !!this.reviewTarget(); }
  canApprove(idx) {
    const m = idx == null ? this.latestMake() : this.placed[idx];
    return this.canAct() && !!m && !m.skipped && !m.approved && !this.released && MAKE.includes(C(m.id).group) && this.effort >= this.R.approveCost;
  }
  canFix(idx, bid) {
    const s = this.placed[idx]; const b = s && s.bugs.find((x) => x.bid === bid);
    return this.canAct() && !!b && b.found && this.effort >= this.fixCost(b);
  }
  canRespond(unitUid, troubleUid) {
    const u = this.p.team.find((x) => x.uid === unitUid);
    const t = this.e.field.find((x) => x.uid === troubleUid);
    return this.canAct() && !!u && !!t && !u.acted && !u.tired;
  }
  // everything the player could still do (to warn before ending the turn)
  anythingLeft() {
    if (!this.canAct()) return false;
    for (let i = this.ptr; i < this.track.length; i++) if (!this.placeProblem(i)) return true;
    if (this.p.hand.some((h) => !this.playProblem(h.uid, { replace: 0 }))) return true;
    if (this.canReview()) return true;
    if (this.p.team.some((u) => !u.acted && !u.tired) && this.e.field.length) return true;
    return false;
  }

  // ---------- trust ----------
  async changeTrust(n, src, card) {
    if (this.over || !n) return;
    if (n < 0 && src === 'e') {
      if (await this.tryGuard({ side: 'e', type: 'damage', n: -n, card })) { await this.emit({ type: 'prevented', n: -n, card }); return; }
      this.stats.dmg += -n;
    }
    const before = this.trust;
    this.trust = Math.min(this.R.trust, this.trust + n);
    await this.emit({ type: 'trust', n: this.trust - before, value: this.trust, src, card });
    if (this.trust <= 0) { this.trust = 0; await this.finish('lose'); }
  }
  async finish(result) {
    if (this.over) return;
    this.over = result;
    await this.emit({ type: 'over', result, stars: this.stars() });
  }
  stars() {
    if (this.over !== 'win') return 0;
    let s = 1;
    if (this.trust >= 12) s++;
    if (this.stats.incidents === 0 && this.stats.lateTurns === 0) s++;
    return s;
  }

  // ---------- cut-ins (chains) ----------
  static matches(trig, act) {
    const [k, v] = trig.split(':');
    if (act.type === 'damage') return k === 'damage' && act.n >= +v;
    if (k !== act.type) return false;
    return !v || v === act.tag;
  }
  guardOptions(act) {
    return this.p.back.filter((b) => b.down && (C(b.id).trigger || []).some((t) => Duel.matches(t, act)) && this.cond(C(b.id).need));
  }
  // Returns true if `act` is negated. depth counts the links (A is 1; at most 4 in all).
  async tryGuard(act, depth = 1) {
    if (depth >= 4 || this.over) return false;
    let resp = null;
    if (act.side === 'e') {
      const opts = this.guardOptions(act);
      // a Change Control you hold but cannot use (nothing approved): the lesson of "no baseline, no change control"
      if (act.type === 'event' && act.tag === 'henkou' && this.p.back.some((b) => b.down && b.id === 'g_change') && !this.cond('hasApproved')) await this.lessonOn('changeNoBase');
      if (opts.length) {
        const pick = await this.ask('guard', { act, options: opts.map((b) => ({ uid: b.uid, id: b.id })), depth });
        const chosen = pick == null || pick === -1 || pick === false ? null : opts.find((b) => b.uid === pick) || (pick === true || pick === 0 ? opts[0] : null);
        if (chosen) {
          this.p.back.splice(this.p.back.indexOf(chosen), 1);
          this.p.discard.push(chosen.id);
          this.stats.guards++;
          resp = { side: 'p', type: 'guard', card: chosen.id, uid: chosen.uid, tag: null };
        }
      }
    } else {
      const i = this.e.plots.findIndex((b) => (C(b.id).trigger || []).some((t) => Duel.matches(t, act)));
      if (i >= 0) {
        const pl = this.e.plots.splice(i, 1)[0];
        this.e.discard.push(pl.id);
        resp = { side: 'e', type: 'plot', card: pl.id, uid: pl.uid, tag: C(pl.id).tag };
      }
    }
    if (!resp) return false;
    await this.emit({ type: 'chain', side: resp.side, card: resp.card, uid: resp.uid, vs: act, depth: depth + 1 });
    if (await this.tryGuard(resp, depth + 1)) {
      await this.emit({ type: 'negated', card: resp.card, side: resp.side, by: 'chain' });
      return false;
    }
    let neg = false;
    for (const ef of C(resp.card).effects) if (ef.on === 'trigger') {
      if (ef.op === 'negate') neg = true;
      else await this.run(ef, { side: resp.side, card: resp.card, trig: act });
    }
    await this.emit({ type: 'chainResolved', card: resp.card, side: resp.side, negates: neg ? act : null });
    if (resp.side === 'p') await this.lesson(C(resp.card).lesson, 'guard');
    return neg;
  }

  // ---------- effects ----------
  pickTrouble(ef, ctx) {
    const f = this.e.field.filter((t) => (!ef.tag || C(t.id).tag === ef.tag) && (!ef.newOnly || t.isNew));
    if (ef.target === 'all') return this.e.field.slice();
    if (ef.target === 'trigger') return [ctx.trig && ctx.trig.unit].filter((t) => t && this.e.field.includes(t));
    if (ef.target === 'self') return [ctx.self].filter((t) => t && this.e.field.includes(t));
    if (ef.target === 'strongest') return f.sort((a, b) => b.pressure - a.pressure).slice(0, 1);
    if (ef.target === 'choose') {
      if (ctx.target != null) { const t = f.find((x) => x.uid === ctx.target); if (t) return [t]; }
      return f.sort((a, b) => b.pressure - a.pressure).slice(0, 1);
    }
    return [];
  }
  // targets a skill may be pointed at (for the page): null when the card needs no target
  skillTargets(id) {
    const ef = C(id).effects.find((e) => e.on === 'play' && (e.op === 'hitTrouble' || e.op === 'clearTrouble') && e.target === 'choose');
    if (!ef) return null;
    return this.e.field.filter((t) => (!ef.tag || C(t.id).tag === ef.tag) && (!ef.newOnly || t.isNew)).map((t) => t.uid);
  }
  async hit(t, n, card) {
    t.pressure -= n;
    await this.emit({ type: 'pressure', uid: t.uid, n: -n, value: Math.max(0, t.pressure), card });
    if (t.pressure <= 0) {
      this.e.field.splice(this.e.field.indexOf(t), 1);
      if (!C(t.id).token) this.e.discard.push(t.id);
      await this.emit({ type: 'resolved', uid: t.uid, id: t.id, card });
    }
  }
  async summon(id, pressure, card) {
    if (this.e.field.length >= this.R.fieldSlots) {
      await this.emit({ type: 'overflow', id, pressure: pressure ?? C(id).pressure });
      await this.changeTrust(-(pressure ?? C(id).pressure), 'e', id);
      return null;
    }
    const t = { id, uid: this.newUid(), pressure: pressure ?? C(id).pressure, isNew: !C(id).token, fresh: false };
    this.e.field.push(t);
    await this.emit({ type: 'summon', uid: t.uid, id, pressure: t.pressure, token: !!C(id).token, card });
    for (const ef of C(id).effects) if (ef.on === 'play') await this.run(ef, { side: 'e', card: id, self: t });
    for (const b of [...this.p.team, ...this.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'trouble' && this.e.field.includes(t)) await this.run(ef, { side: 'p', card: b.id, trig: { unit: t } });
    return t;
  }

  async run(ef, ctx) {
    if (this.over) return;
    if (!OPS.includes(ef.op)) throw new Error('unknown op ' + ef.op);
    if (ef.if && !this.cond(ef.if)) return;
    const enemy = ctx.side === 'e';
    const card = ctx.card;
    switch (ef.op) {
      case 'trust': {
        let n = ef.n;
        if (ef.per === 'unapproved') n = ef.n * Math.min(ef.max || 99, this.makeStages().filter((s) => !s.approved).length);
        if (n) await this.changeTrust(n, enemy ? 'e' : 'p', card);
        break;
      }
      case 'effort':
        if (this.side === 'p') { this.effort = Math.max(0, this.effort + ef.n); await this.emit({ type: 'effort', value: this.effort, n: ef.n, card }); }
        else { this.effortNext += ef.n; await this.emit({ type: 'effortNext', value: this.effortNext, n: ef.n, card }); }
        break;
      case 'deadline':
        this.deadline += ef.n;
        await this.emit({ type: 'deadline', value: this.deadline, n: ef.n, card });
        break;
      case 'draw': await this.draw(ctx.side, ef.n); break;
      case 'discard': {
        const out = [];
        for (let i = 0; i < ef.n && this.p.hand.length; i++) { const c = this.p.hand.splice(Math.floor(this.r() * this.p.hand.length), 1)[0]; this.p.discard.push(c.id); out.push(c); }
        if (out.length) await this.emit({ type: 'discard', cards: out, card });
        break;
      }
      case 'addBug': {
        for (const s of this.stageSel(ef.at)) {
          if (enemy && s.approved && !ef.force) {
            this.stats.blocked++;
            await this.emit({ type: 'blocked', idx: s.idx, card, what: 'bug' });
            await this.lessonOn('approveBlocked');
            continue;
          }
          const bugs = [];
          for (let i = 0; i < ef.n; i++) { const b = { bid: this.newUid(), size: 1, found: false }; s.bugs.push(b); bugs.push(b); }
          await this.emit({ type: 'bugs', idx: s.idx, bugs, card });
          if (this.cond('testPlaced')) await this.moment('bugAfterTest');
        }
        break;
      }
      case 'findBug': {
        const bs = this.stageSel(ef.at).filter((s) => !s.skipped).flatMap((s) => s.bugs.map((b) => ({ b, s }))).filter((x) => !x.b.found).sort((a, b) => b.b.size - a.b.size).slice(0, ef.n);
        bs.forEach((x) => { x.b.found = true; });
        this.stats.found += bs.length;
        if (bs.length) await this.emit({ type: 'found', items: bs.map((x) => ({ idx: x.s.idx, bid: x.b.bid, size: x.b.size })), card });
        break;
      }
      case 'fixBug': {
        const c = this.stageSel(ef.at).flatMap((s) => s.bugs.map((b) => ({ b, s }))).filter((x) => (!ef.maxSize || x.b.size <= ef.maxSize) && (!ef.foundOnly || x.b.found)).sort((a, b) => b.b.size - a.b.size).slice(0, ef.n);
        c.forEach((x) => x.s.bugs.splice(x.s.bugs.indexOf(x.b), 1));
        if (c.length) await this.emit({ type: 'fixed', items: c.map((x) => ({ idx: x.s.idx, bid: x.b.bid, size: x.b.size })), cost: 0, how: 'card', card });
        break;
      }
      case 'growBug': {
        const items = [];
        this.allBugs().forEach(({ b, s }) => { if (ef.at !== 'unfound' || !b.found) { const from = b.size; b.size = Math.min(this.R.bugMax, b.size * 2); if (b.size !== from) items.push({ idx: s.idx, bid: b.bid, from, to: b.size }); } });
        if (items.length) { await this.emit({ type: 'grow', items, card }); if (items.some((x) => x.to >= 4)) await this.lessonOn('bugGrew'); }
        break;
      }
      case 'hitTrouble': for (const t of this.pickTrouble(ef, ctx)) await this.hit(t, ef.n + (ef.bonusTag && C(t.id).tag === ef.bonusTag ? ef.bonus : 0), card); break;
      case 'clearTrouble': for (const t of this.pickTrouble(ef, ctx)) await this.hit(t, 999, card); break;
      case 'growTrouble':
        for (const t of this.pickTrouble(ef, ctx)) {
          t.pressure += ef.n;
          await this.emit({ type: 'pressure', uid: t.uid, n: ef.n, value: t.pressure, card });
          if (t.pressure >= 5) await this.lessonOn('troubleGrew');
        }
        break;
      case 'summon': await this.summon(ef.id, ef.pressure, card); break;
      case 'breakStage':
        for (let i = 0; i < ef.n; i++) {
          const l = this.latestAny();
          if (!l || this.released) break;
          if (l.approved) { this.stats.blocked++; await this.emit({ type: 'blocked', idx: l.idx, card, what: 'break' }); await this.lessonOn('approveBlocked'); break; }
          const removed = [];
          this.placed.length = l.idx;
          removed.push(l.idx);
          while (this.placed.length && this.placed[this.placed.length - 1] && this.placed[this.placed.length - 1].skipped) { removed.push(this.placed.length - 1); this.placed.length--; }
          while (this.placed.length && !this.placed[this.placed.length - 1]) this.placed.length--;
          this.ptr = this.placed.length;
          this.stats.breaks++;
          await this.emit({ type: 'broken', idx: l.idx, id: l.id, removed, ptr: this.ptr, card });
          await this.lessonOn('stageBroken');
        }
        break;
      case 'approve': {
        if (ef.off) {
          const s = this.placed.filter((x) => x && x.approved).slice(-1)[0];
          if (s) { s.approved = false; await this.emit({ type: 'approve', idx: s.idx, on: false, card }); }
          break;
        }
        const s = this.latestMake();
        if (!s || s.approved || this.released) break;
        // a stamp from your own card can still be cancelled by the enemy's plot (only the stamp; the card's other effects stay)
        if (ctx.side === 'p' && await this.tryGuard({ side: 'p', type: 'approve', card })) { await this.emit({ type: 'negated', card: 'approve', side: 'p', idx: s.idx, by: 'plot' }); break; }
        s.approved = true; this.stats.approvals++;
        await this.emit({ type: 'approve', idx: s.idx, on: true, card });
        break;
      }
      case 'tire': {
        const us = this.p.team.filter((u) => !u.tired).sort((a, b) => C(b.id).power - C(a.id).power);
        const hitU = ef.target === 'all' ? us : us.slice(0, 1);
        hitU.forEach((u) => { u.tired = 2; });
        if (hitU.length) await this.emit({ type: 'tire', uids: hitU.map((u) => u.uid), card });
        break;
      }
      case 'buff':
        this.p.team.forEach((u) => { u.buff = (u.buff || 0) + ef.n; });
        await this.emit({ type: 'buff', n: ef.n, card });
        break;
      case 'extraStage':
        this.extra += 1; this.extraBug = ef.bug || 0;
        await this.emit({ type: 'extra', bug: this.extraBug, card });
        break;
      case 'clearPlot': {
        const out = [];
        for (let i = 0; i < ef.n && this.e.plots.length; i++) { const p = this.e.plots.shift(); this.e.discard.push(p.id); out.push(p); }
        if (out.length) await this.emit({ type: 'plotBroken', plots: out, card });
        break;
      }
      case 'negate': case 'mod': break;
    }
  }

  // ---------- player actions ----------
  async act(fn) {
    if (!this.canAct()) return false;
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }

  place(idx = this.ptr) {
    if (!this.canPlace(idx)) return Promise.resolve(false);
    return this.act(async () => {
      const id = this.track[idx], c = C(id);
      const cost = this.stageCost(id);
      this.effort -= cost; this.stageUsed++;
      const rush = this.stageUsed > 1 ? this.extraBug : 0;
      await this.emit({ type: 'spend', n: cost, value: this.effort, what: 'stage', id });
      if (c.group === 'release') {
        for (const b of [...this.p.team, ...this.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'release') await this.run(ef, { side: 'p', card: b.id });
        await this.emit({ type: 'releaseTry', idx });
        if (await this.tryGuard({ side: 'p', type: 'release', card: id })) {
          this.stats.relFail++;
          await this.emit({ type: 'releaseFailed', idx });
          await this.lessonOn('releaseFailed');
          return true;
        }
        if (this.over) return true;
      }
      const holes = this.skipsIfPlaced(idx);
      // every bug not found yet doubles
      const grown = [];
      this.allBugs().forEach(({ b, s }) => { if (!b.found) { const from = b.size; b.size = Math.min(this.R.bugMax, b.size * 2); if (b.size !== from) grown.push({ idx: s.idx, bid: b.bid, from, to: b.size }); } });
      const st = { id, idx, approved: false, skipped: false, bugs: [] };
      this.placed[idx] = st; this.ptr = idx + 1;
      const holeStages = [];
      const newBugs = [];
      if (c.group === 'design' || c.group === 'make') {
        const n = Math.max(0, (c.inject || 0) + this.mods('inject', grp(c.group))) + rush;
        for (const j of holes) {
          const h = { id: this.track[j], idx: j, skipped: true, approved: false, bugs: [] };
          for (let i = 0; i < this.R.skipBugs; i++) h.bugs.push({ bid: this.newUid(), size: 1, found: false });
          this.placed[j] = h; holeStages.push(h);
          this.stats.skips++;
        }
        for (let i = 0; i < n; i++) { const b = { bid: this.newUid(), size: 1, found: false }; st.bugs.push(b); newBugs.push(b); }
      } else if (rush) {
        const m = this.latestMake();
        if (m) { for (let i = 0; i < rush; i++) { const b = { bid: this.newUid(), size: 1, found: false }; m.bugs.push(b); } }
      }
      await this.emit({ type: 'place', idx, id, cost, holes: holeStages.map((h) => ({ idx: h.idx, id: h.id, bugs: h.bugs.slice() })) });
      if (grown.length) { await this.emit({ type: 'grow', items: grown, by: 'stage' }); }
      if (holeStages.length) await this.lessonOn('skipStage');
      if (newBugs.length) {
        await this.emit({ type: 'bugs', idx, bugs: newBugs, by: 'stage' });
        await this.lessonOn('firstBug');
      }
      if (rush && !MAKE.includes(c.group)) { const m = this.latestMake(); if (m) await this.emit({ type: 'bugs', idx: m.idx, bugs: m.bugs.slice(-rush), by: 'rush' }); }
      if (grown.some((x) => x.to >= 4)) await this.lessonOn('bugGrew');
      if (c.group === 'test') {
        const items = [];
        for (const pid of this.pair[id] || []) {
          const ps = this.placed.find((s) => s && s.id === pid && !s.skipped);
          if (ps) ps.bugs.forEach((b) => { if (!b.found) { b.found = true; items.push({ idx: ps.idx, bid: b.bid, size: b.size }); } });
        }
        this.stats.found += items.length;
        await this.emit({ type: 'test', idx, id, pairs: (this.pair[id] || []).map((pid) => this.track.indexOf(pid)), items });
        if (items.length) await this.lessonOn('testFound');
      }
      if (MAKE.includes(c.group)) {
        await this.moment('firstDesignPlaced');
        if (this.e.field.some((t) => t.id === 't_fuwa') && c.group === 'design') await this.moment('designWithFuwa');
      }
      for (const ef of c.effects) if (ef.on === 'play') await this.run(ef, { side: 'p', card: id });
      for (const b of [...this.p.team, ...this.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'stage' && (!ef.group || ef.group === c.group)) await this.run(ef, { side: 'p', card: b.id });
      if (c.group === 'release' && !this.over) {
        this.released = true; this.opsLeft = this.R.ops; this.releaseTurn = this.turn;
        const bs = this.allBugs().sort((a, b) => b.b.size - a.b.size);
        await this.emit({ type: 'released', idx, bugs: bs.map((x) => ({ idx: x.s.idx, bid: x.b.bid, size: x.b.size })), opsLeft: this.opsLeft });
        for (const { b, s } of bs) {
          if (this.over) break;
          s.bugs.splice(s.bugs.indexOf(b), 1);
          this.stats.incidents += b.size;
          await this.emit({ type: 'incident', idx: s.idx, bid: b.bid, size: b.size });
          await this.summon('t_incident', b.size);
        }
        if (bs.length) await this.lessonOn('incident');
        await this.lessonOn('opsStart');
      }
      return true;
    });
  }

  play(uid, opt = {}) {
    if (!this.canPlay(uid, opt)) return Promise.resolve(false);
    return this.act(async () => {
      const hi = this.p.hand.findIndex((h) => h.uid === uid);
      const hc = this.p.hand[hi]; const c = C(hc.id);
      if (c.kind === 'unit' && this.p.team.length >= this.R.teamSlots) { const o = this.p.team.splice(opt.replace, 1)[0]; this.p.discard.push(o.id); await this.emit({ type: 'leave', zone: 'team', uid: o.uid, id: o.id }); }
      if ((c.kind === 'guard' || c.kind === 'doc') && this.p.back.length >= this.R.backSlots) { const o = this.p.back.splice(opt.replace, 1)[0]; this.p.discard.push(o.id); await this.emit({ type: 'leave', zone: 'back', uid: o.uid, id: o.id }); }
      this.p.hand.splice(hi, 1);
      this.effort -= c.cost;
      if (c.kind === 'guard') {
        this.p.back.push({ uid: hc.uid, id: hc.id, down: true });
        await this.emit({ type: 'play', uid: hc.uid, id: hc.id, kind: c.kind, zone: 'back', cost: c.cost, value: this.effort });
        return true;
      }
      await this.emit({ type: 'play', uid: hc.uid, id: hc.id, kind: c.kind, zone: c.kind === 'unit' ? 'team' : c.kind === 'doc' ? 'back' : 'skill', cost: c.cost, value: this.effort, target: opt.target });
      if (c.kind === 'unit') this.p.team.push({ uid: hc.uid, id: hc.id, tired: 0, acted: false, buff: 0 });
      else if (c.kind === 'doc') this.p.back.push({ uid: hc.uid, id: hc.id, down: false });
      else this.p.discard.push(hc.id);
      if (hc.id === 's_rush' || hc.id === 's_overtime') await this.lessonOn('rush');
      for (const ef of c.effects) if (ef.on === 'play') await this.run(ef, { side: 'p', card: hc.id, target: opt.target });
      if (c.kind === 'skill') await this.emit({ type: 'skillDone', uid: hc.uid, id: hc.id });
      return true;
    });
  }

  respond(unitUid, troubleUid) {
    if (!this.canRespond(unitUid, troubleUid)) return Promise.resolve(false);
    return this.act(async () => {
      const u = this.p.team.find((x) => x.uid === unitUid);
      const t = this.e.field.find((x) => x.uid === troubleUid);
      u.acted = true;
      const p = this.unitPower(u, t);
      await this.emit({ type: 'respond', unit: u.uid, uid: t.uid, power: p });
      await this.hit(t, p, u.id);
      return true;
    });
  }

  fix(idx, bid) {
    if (!this.canFix(idx, bid)) return Promise.resolve(false);
    return this.act(async () => {
      const s = this.placed[idx]; const b = s.bugs.find((x) => x.bid === bid);
      const k = this.fixCost(b);
      this.effort -= k; this.stats.fixSpent += k;
      s.bugs.splice(s.bugs.indexOf(b), 1);
      await this.emit({ type: 'fixed', items: [{ idx, bid, size: b.size }], cost: k, how: 'fix', value: this.effort });
      return true;
    });
  }

  review() {
    if (!this.canReview()) return Promise.resolve(false);
    return this.act(async () => {
      const { s, b } = this.reviewTarget();
      this.reviewed = true; this.effort -= this.R.reviewCost; this.stats.reviews++;
      s.bugs.splice(s.bugs.indexOf(b), 1);
      await this.emit({ type: 'fixed', items: [{ idx: s.idx, bid: b.bid, size: b.size }], cost: this.R.reviewCost, how: 'review', value: this.effort });
      return true;
    });
  }

  approve(idx) {
    if (!this.canApprove(idx)) return Promise.resolve(false);
    return this.act(async () => {
      const m = idx == null ? this.latestMake() : this.placed[idx];
      this.effort -= this.R.approveCost;
      await this.emit({ type: 'spend', n: this.R.approveCost, value: this.effort, what: 'approve' });
      if (await this.tryGuard({ side: 'p', type: 'approve', card: 'approve' })) { await this.emit({ type: 'negated', card: 'approve', side: 'p', idx: m.idx, by: 'plot' }); return true; }
      m.approved = true; this.stats.approvals++;
      await this.emit({ type: 'approve', idx: m.idx, on: true });
      return true;
    });
  }

  // end the player's turn, play the enemy's turn, start the next player turn
  endTurn() {
    if (!this.canAct()) return Promise.resolve(false);
    return this.act(async () => {
      await this.endPlayerTurn();
      if (this.over) return true;
      await this.enemyTurn();
      if (this.over) return true;
      await this.startPlayerTurn();
      return true;
    });
  }

  // ---------- turn flow ----------
  async startPlayerTurn() {
    this.turn++; this.side = 'p'; this.reviewed = false; this.stageUsed = 0; this.extra = 0; this.extraBug = 0;
    if (this.turn > this.R.turnLimit) { await this.finish('lose'); return; }
    const base = this.baseEffort();
    this.effort = Math.max(0, base + this.mods('effortTurn') + this.effortNext); this.effortNext = 0;
    this.p.team.forEach((u) => { u.acted = false; u.buff = 0; if (u.tired) u.tired--; });
    await this.emit({ type: 'turn', side: 'p', turn: this.turn, effort: this.effort });
    await this.draw('p', 1);
    if (!this.released && this.turn > this.deadline) {
      this.stats.lateTurns++;
      const n = this.R.latePenalty + this.late;
      this.late++;
      await this.emit({ type: 'late', n, late: this.late });
      await this.changeTrust(-n, 'late');
      await this.lessonOn('late');
      if (this.over) return;
    }
    if (!this.released && this.turn >= this.deadline - 1) await this.moment('deadlineNear');
    for (const b of [...this.p.team, ...this.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'turnStart') await this.run(ef, { side: 'p', card: b.id });
    await this.emit({ type: 'main', side: 'p' });
  }

  async endPlayerTurn() {
    for (const b of [...this.p.team, ...this.p.back.filter((x) => !x.down)]) for (const ef of C(b.id).effects) if (ef.on === 'turnEnd') await this.run(ef, { side: 'p', card: b.id });
    const out = [];
    while (this.p.hand.length > this.R.handMax) { const c = this.p.hand.pop(); this.p.discard.push(c.id); out.push(c); }
    if (out.length) await this.emit({ type: 'discard', cards: out, why: 'handMax' });
    if (this.released && !this.over) {
      if (this.releaseTurn !== this.turn || this.R.startReleased) this.opsLeft--;
      await this.emit({ type: 'ops', left: this.opsLeft });
      if (this.opsLeft <= 0) await this.finish('win');
    }
  }

  async enemyTurn() {
    if (this.over) return;
    this.side = 'e';
    const R = this.R, E = this.e;
    E.ap = Math.min(R.enemyApCap, R.enemyApStart + Math.floor((this.turn - 1) / R.enemyApEvery));
    await this.emit({ type: 'turn', side: 'e', turn: this.turn, ap: E.ap });
    await this.draw('e', this.turn >= R.enemyDraw2From ? 2 : 1);
    E.field.forEach((t) => { t.fresh = false; });
    // play cards by priority
    for (let k = 0; k < 10; k++) {
      if (this.over) return;
      const opts = E.hand.filter((h) => {
        const c = C(h.id);
        return c.cost <= E.ap && this.cond(c.ai && c.ai.when) && (c.kind !== 'trouble' || E.field.length < R.fieldSlots) && (c.kind !== 'plot' || E.plots.length < R.plotSlots);
      }).sort((a, b) => ((C(b.id).ai?.prio || 0) - (C(a.id).ai?.prio || 0)) || (C(b.id).cost - C(a.id).cost));
      if (!opts.length) break;
      const h = opts[0]; const c = C(h.id);
      E.hand.splice(E.hand.indexOf(h), 1); E.ap -= c.cost;
      if (c.kind === 'plot') {
        E.plots.push({ uid: h.uid, id: h.id });
        await this.emit({ type: 'plotSet', uid: h.uid, ap: E.ap });
        await this.moment('firstPlot');
        continue;
      }
      await this.emit({ type: 'enemyPlay', uid: h.uid, id: h.id, kind: c.kind, ap: E.ap });
      if (c.kind === 'event' && c.tag === 'henkou') await this.moment('firstChangeEvent');
      if (await this.tryGuard({ side: 'e', type: c.kind, card: h.id, tag: c.tag })) {
        E.discard.push(h.id);
        await this.emit({ type: 'negated', card: h.id, side: 'e', uid: h.uid, by: 'guard' });
        continue;
      }
      if (c.kind === 'trouble') { const t = await this.summon(h.id, c.pressure, null); if (t) t.fresh = !c.sudden; }
      else {
        for (const ef of c.effects) if (ef.on === 'play') await this.run(ef, { side: 'e', card: h.id });
        E.discard.push(h.id);
        await this.emit({ type: 'eventDone', uid: h.uid, id: h.id });
      }
    }
    // attacks, in the order they came
    for (const t of E.field.slice()) {
      if (this.over) return;
      if (!E.field.includes(t) || t.fresh) continue;
      await this.emit({ type: 'attackTry', uid: t.uid, id: t.id, n: t.pressure });
      if (await this.tryGuard({ side: 'e', type: 'attack', card: t.id, unit: t })) { await this.emit({ type: 'negated', card: t.id, side: 'e', uid: t.uid, by: 'guard', what: 'attack' }); continue; }
      if (!E.field.includes(t)) continue;
      await this.emit({ type: 'attack', uid: t.uid, id: t.id, n: t.pressure });
      await this.changeTrust(-t.pressure, 'e', t.id);
      for (const ef of C(t.id).effects) if (ef.on === 'attack' && E.field.includes(t)) await this.run(ef, { side: 'e', card: t.id, self: t });
    }
    E.field.forEach((t) => { t.isNew = !!t.fresh; t.fresh = false; });
    await this.emit({ type: 'enemyEnd' });
  }
}
