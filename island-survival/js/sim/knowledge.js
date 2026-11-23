// sim/knowledge.js — what the player knows about each entry of the island field guide (DESIGN §20).
// Levels: 0 unknown (K0), 1 seen (K1: provisional name), 2 studied (K2: features, "?" after the name),
// 3 confirmed (K3: verdict, uses, poison / medicine tags, harvest and risk details).
// No three.js imports. Every use of the game object is optional, so the class also works in tests.
import { GUIDE } from '../data/guide.js';

// §20.3: a toxic look-alike is mixed into a gathered bundle at these rates while the player is K0–K1.
// Entries not listed here have no toxic look-alike, so nothing is mixed in.
// The taro group (0.30) is not in the spec; it is an assumption made for the same reason as the others.
const MIX_GROUP = {
  berry: 'red_berry', red_berry_toxic: 'red_berry',
  mushroom_a: 'mushroom', mushroom_b: 'mushroom', mushroom_c: 'mushroom', mushroom_toxic: 'mushroom',
  yomogi: 'herb', numb_weed: 'herb',
  taro: 'taro', false_taro: 'taro',
};
const MIX_LOW = { red_berry: 0.33, mushroom: 0.25, herb: 0.40, taro: 0.30 };
const DEFAULT_OBS_MISS = 0.15; // K2 mistake rate before the player has observed the item
const HARVEST = [1.0, 1.0, 1.2, 1.4];

// §20.2 observation mistake rate by light (0–1): daylight 95% right, dusk / cloudy 85%, torch 70%
function observeMiss(light) {
  const l = Number.isFinite(light) ? light : 1;
  if (l >= 0.75) return 0.05;
  if (l >= 0.35) return 0.15;
  return 0.30;
}

// §17.1 difficulty → the risk display mode it implies
function displayMode(d) {
  if (d === 'percent' || d === 'band' || d === 'none') return d;
  if (d === 'easy') return 'percent';
  if (d === 'normal' || d === 'hard') return 'band';
  if (d === 'extreme') return 'none';
  return 'band';
}

const clampLevel = (v) => Math.max(0, Math.min(3, Math.floor(Number(v) || 0)));

export class Knowledge {
  constructor(game = null) {
    this.game = game || null;
    this.levels = {};   // id → 0..3
    this.how = {};      // id → how the last level was reached ('seen', 'observe', 'eat', 'guide', ...)
    this.foundAt = {};  // id → { day, zone } at the first sighting (K1)
    this.obsRate = {};  // id → mistake rate of the latest observation (§20.3, K2 mixing)
  }

  init(game) {
    this.game = game || this.game;
    return this;
  }

  // ── helpers ─────────────────────────────────────────────
  _emit(name, arg) {
    try { this.game?.bus?.emit?.(name, arg); } catch (e) { /* the bus is optional */ }
  }

  _rand() {
    const rng = this.game?.rng;
    return typeof rng?.next === 'function' ? rng.next() : Math.random();
  }

  _here() {
    return {
      day: this.game?.clock?.day ?? 0,
      zone: this.game?.player?.zone ?? null,
    };
  }

  // ── queries ─────────────────────────────────────────────
  level(id) {
    return clampLevel(this.levels[id]);
  }

  /** Marks K1 (first sighting). Returns true when this is a new sighting. */
  seen(id) {
    if (!GUIDE[id] || this.level(id) >= 1) return false;
    return this.learn(id, 1, 'seen');
  }

  /**
   * Raises the level of an entry. Never lowers it. Emits a toast and a log line on each raise.
   * The first reach of K3 adds one to game.stats.guideK3 (score, §20.3 and §15.3).
   * Returns true when the level went up.
   */
  learn(id, level, how = '') {
    if (!GUIDE[id]) return false;
    const cur = this.level(id);
    const next = clampLevel(level);
    if (next <= cur) return false;

    this.levels[id] = next;
    this.how[id] = how || this.how[id] || '';
    if (!this.foundAt[id] && next >= 1) this.foundAt[id] = this._here();

    const text = `図鑑に 記録：${this.nameOf(id)}`;
    this._emit('toast', { text, kind: 'guide' });
    this._emit('log', { text, kind: 'guide' });

    if (next === 3 && cur < 3 && this.game?.stats) {
      this.game.stats.guideK3 = (this.game.stats.guideK3 || 0) + 1;
    }
    return true;
  }

  /**
   * Observation (§20.2, K2): studies an entry that has been seen, using light 0–1.
   * The result can be wrong: `mistake` is true with probability 1 − accuracy (5% / 15% / 30%).
   * Returns { level, mistake }. Entries at K0 are not observed and return mistake false.
   */
  observe(id, light = 1) {
    if (!GUIDE[id] || this.level(id) < 1) return { level: this.level(id), mistake: false };
    const miss = observeMiss(light);
    this.obsRate[id] = miss;
    const mistake = this._rand() < miss;
    this.learn(id, 2, 'observe');
    return { level: this.level(id), mistake };
  }

  /** The name shown in the UI for an item id: provisional at K0–K1, true name + ？ at K2, true name + tag at K3. */
  nameOf(itemId) {
    const g = GUIDE[itemId];
    if (!g) return String(itemId ?? '');
    const lv = this.level(itemId);
    if (lv <= 1) return g.provisional;
    if (lv === 2) return `${g.name}？`;
    if (g.verdict === 'poison') return `${g.name}（毒）`;
    if (g.verdict === 'medicine') return `${g.name}（薬）`;
    return g.name;
  }

  /** Chance (0–1) that a toxic look-alike is mixed into a gathered bundle of this item. */
  mixRate(id) {
    const group = MIX_GROUP[id];
    if (!group) return 0;
    const lv = this.level(id);
    if (lv >= 3) return 0;
    if (lv === 2) return this.obsRate[id] ?? DEFAULT_OBS_MISS;
    return MIX_LOW[group];
  }

  /** Harvest multiplier: ×1.0 at K0–K1, ×1.2 at K2, ×1.4 at K3. */
  harvestMul(id) {
    return HARVEST[this.level(id)];
  }

  /**
   * Risk display before eating (§20.3, §17.1). difficultyShowRisk is the difficulty's display mode
   * ('percent' | 'band' | 'none'), or a difficulty name ('easy' … 'extreme').
   * Returns 'unknown' (K0–K1) | 'band_vague' (K2) | 'percent' | 'band' | 'none' (K3, or K2 with no display).
   */
  riskShown(id, difficultyShowRisk) {
    const lv = this.level(id);
    const mode = displayMode(difficultyShowRisk);
    if (lv <= 1) return 'unknown';
    if (lv === 2) return mode === 'none' ? 'none' : 'band_vague';
    return mode;
  }

  /** The list for the guide screen. Fields are hidden below the level that unlocks them. */
  entries() {
    return Object.keys(GUIDE).map((id) => {
      const g = GUIDE[id];
      const lv = this.level(id);
      return {
        id,
        cat: g.cat,
        level: lv,
        name: lv >= 1 ? g.name : null,
        provisional: lv >= 1 ? g.provisional : null,
        verdict: lv >= 3 ? g.verdict : null,
        features: lv >= 2 ? g.features : null,
        where: lv >= 2 ? g.where : null,
        when: lv >= 2 ? (g.when ?? null) : null,
        uses: lv >= 3 ? g.uses : null,
        lookalike: g.lookalike ?? null,
        foundAt: this.foundAt[id] ? { ...this.foundAt[id] } : null,
        icon: g.icon,
        color: g.color,
      };
    });
  }

  /** Share of the guide filled in, 0–1: the average of level / 3 over all entries. */
  completion() {
    const ids = Object.keys(GUIDE);
    if (!ids.length) return 0;
    let sum = 0;
    for (const id of ids) sum += this.level(id) / 3;
    return sum / ids.length;
  }

  // ── starting guide (§20.3) ──────────────────────────────
  /**
   * The take-along guide: plant / mushroom / sea entries start at K3, animal / danger at K2.
   * Stone entries are not in the starting guide. These levels are given directly, without toasts
   * and without the K3 score, since the player did not discover them on the island.
   */
  grantStarterGuide() {
    const target = { plant: 3, mushroom: 3, sea: 3, animal: 2, danger: 2 };
    let changed = 0;
    for (const id of Object.keys(GUIDE)) {
      const want = target[GUIDE[id].cat];
      if (!want || this.level(id) >= want) continue;
      this.levels[id] = want;
      this.how[id] = this.how[id] || 'guide';
      changed++;
    }
    if (changed) this._emit('log', { text: '持ちこみの 図鑑を 開いた', kind: 'guide' });
    return changed;
  }

  // ── save / load ─────────────────────────────────────────
  serialize() {
    return {
      v: 1,
      levels: { ...this.levels },
      how: { ...this.how },
      foundAt: Object.fromEntries(Object.entries(this.foundAt).map(([k, v]) => [k, { ...v }])),
      obsRate: { ...this.obsRate },
    };
  }

  deserialize(data) {
    this.levels = {}; this.how = {}; this.foundAt = {}; this.obsRate = {};
    if (!data || typeof data !== 'object') return this;
    for (const [id, lv] of Object.entries(data.levels || {})) {
      if (GUIDE[id]) this.levels[id] = clampLevel(lv);
    }
    for (const [id, how] of Object.entries(data.how || {})) {
      if (GUIDE[id] && typeof how === 'string') this.how[id] = how;
    }
    for (const [id, at] of Object.entries(data.foundAt || {})) {
      if (GUIDE[id] && at && typeof at === 'object') {
        this.foundAt[id] = { day: Number(at.day) || 0, zone: at.zone ?? null };
      }
    }
    for (const [id, r] of Object.entries(data.obsRate || {})) {
      if (GUIDE[id] && Number.isFinite(r)) this.obsRate[id] = Math.max(0, Math.min(1, r));
    }
    return this;
  }
}
