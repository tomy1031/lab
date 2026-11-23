// sim/fishing.js — fishing outcomes (DESIGN.md §9.4, §22.5, §22.6).
//   spotAt(game, x, z, castDist)   → 'shallow' | 'reef' | 'deep' | 'river' | 'pool' | null (no water)
//   biteModel(game, o)             → { meanSec, weights: [[speciesId, w]], factors } for a cast
//   pickSpecies(rng, weights)      → species id
//   hookOutcome(species, hook)     → { escape, nibbleOnly } chances (hook size vs fish size)
//   netCatch(game, o)              → [{ id, n }] for one cast-net throw
import { FISH } from '../data/fauna.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function partOfDay(h) { return h >= 5 && h < 8 ? 0 : h >= 8 && h < 16 ? 1 : h >= 16 && h < 19 ? 2 : 3; }

/** tide phase from the clock (§22.5: rising / falling 3 h, slack ±40 min around high / low) */
export function tidePhase(clock) {
  const t = clock.total / 60, e = 0.05;
  const a = clock.tide(t - e), b = clock.tide(t + e);
  const slope = (b - a) / (2 * e);
  if (Math.abs(slope) < 0.08) return 'slack';
  if (slope > 0) return 'rising';
  // late falling (the last hour before low water)
  const later = clock.tide(t + 1);
  return later - clock.tide(t) > -0.05 ? 'falling_end' : 'falling';
}

export function spotAt(game, x, z, castDist = 6) {
  const t = game.world.terrain;
  const w = t.waterAt(x, z, game.player.seaLevel);
  if (!w.type) return null;
  if (w.type === 'stream') return 'river';
  if (w.type === 'pond') return 'pool';
  // sea: rocky shore → reef; far & deep → deep; else shallows
  let rocky = false;
  for (let a = 0; a < 6; a++) {
    const px = x + Math.cos(a) * 10, pz = z + Math.sin(a) * 10;
    if (t.zoneAt(px, pz) === 'rocks' || t.zoneAt(px, pz) === 'cliff') { rocky = true; break; }
  }
  if (w.depth > 3 && castDist >= 14) return 'deep';
  return rocky ? 'reef' : 'shallow';
}

const BAIT_ITEMS = new Set(['shellfish', 'crab', 'grub', 'sardine', 'fish_fillet', 'bait_ball', 'seaweed', 'lure', 'worm', 'coconut_meat', 'fish_s', 'goby']);
export function isBait(id) { return BAIT_ITEMS.has(id); }

function baitMul(sp, bait) {
  if (!bait) return 0.3;
  if (sp.best.includes(bait)) return 1.3;
  if (sp.ok.includes(bait) || sp.ok.includes('*')) return 1.0;
  if (bait === 'lure') return sp.best.includes('lure') ? 1.3 : 0.3;
  return 0.3;
}

/**
 * o: { spot, bait (item id | null), hook ('s'|'m'|'l'), fineLine (bool), crouch, sunBehind, splashedRecently, guideMul(speciesId) }
 */
export function biteModel(game, o) {
  const h = game.clock.hour, pod = partOfDay(h);
  const tp = tidePhase(game.clock);
  const W = game.sys.weather;
  if (!o.spot || W?.type === 'storm' || W?.type === 'typhoon') return { meanSec: Infinity, weights: [], factors: { reason: '嵐で 釣りに ならない' } };
  let weather = 1;
  if (W?.type === 'cloudy') weather = 1.2;
  else if (W?.type === 'drizzle') weather = 1.3;
  else if (W?.type === 'rain') weather = (o.spot === 'river' ? 0.5 : 1.3);
  else if ((W?.type === 'clear' || W?.type === 'heat') && pod === 1 && o.spot === 'shallow') weather = 0.7;
  const presence = (o.splashedRecently ? 0.3 : 1) * (o.crouch ? 1 : o.sunBehind ? 0.6 : 0.85);
  const line = o.fineLine || pod === 3 || (W?.rain ?? 0) > 0.2 ? 1 : 0.6;
  const density = (game.sys.events?.mod?.('fishBite') ?? 1) * (game.sys.fishing?.densityAt?.(o.spot) ?? 1);
  const weights = [];
  let total = 0;
  for (const [id, sp] of Object.entries(FISH)) {
    const share = sp.spots[o.spot] || 0;
    if (!share) continue;
    const tm = sp.time[pod] ?? 1;
    let tide = 1;
    if (sp.tide) { if (tp === 'rising' && sp.tide.rising) tide = sp.tide.rising; if ((tp === 'rising' || tp === 'falling') && sp.tide.moving) tide = sp.tide.moving; if (tp === 'slack' && sp.tide.slack) tide = sp.tide.slack; if (tp === 'falling_end' && sp.tide.falling_end) tide = sp.tide.falling_end; }
    const bm = id === 'junk' ? 1 : baitMul(sp, o.bait);
    const hookMatch = o.hook === sp.hook ? 1 : (o.hook === 'm' && sp.hook === 's') ? 0.4 : (o.hook === 'l' && sp.hook === 's') ? 0.05 : (o.hook === 'l' && sp.hook === 'm') ? 0.5 : 1;
    const guide = o.guideMul?.(id) ?? 1;
    const w = share * tm * tide * bm * hookMatch * guide;
    if (w > 0) { weights.push([id, w]); total += w; }
  }
  const rate = density * weather * presence * line * total;
  return { meanSec: rate > 0 ? 60 / rate : Infinity, weights, factors: { pod, tide: tp, weather, presence, line, density } };
}

export function pickSpecies(rng, weights) { return weights.length ? rng.weighted(weights) : null; }

/** hook size vs fish size (§22.5): chance the fish gets off, or only nibbles the bait */
export function hookOutcome(speciesId, hook) {
  const size = FISH[speciesId]?.size || 's';
  if (hook === 's') return { escape: size === 'm' ? 0.3 : size === 'l' ? 0.8 : 0, nibbleOnly: 0 };
  if (hook === 'm') return { escape: size === 'l' ? 0.3 : 0, nibbleOnly: size === 's' ? 0.6 : 0 };
  return { escape: 0, nibbleOnly: size === 's' ? 1 : size === 'm' ? 0.5 : 0 };
}

/** line tension limit when the line is weaker than the fish needs (§9.4) */
export function tensionCap(speciesId, lineStrength) {
  const need = FISH[speciesId]?.line ?? ({ s: 2, m: 4, l: 7 }[FISH[speciesId]?.size] ?? 2);
  return clamp(lineStrength / need, 0.2, 1);
}

/**
 * one cast-net throw (§22.6). o: { s (throw score 0–1), radiusBase (2 for the carried net), mesh (cm), depth, rocky, round (bool) }
 * returns { items: [[id, n]], torn, stung, snag, message }
 */
export function netCatch(game, o) {
  const r = game.rng;
  const radius = (o.radiusBase ?? 2) * (0.4 + 0.6 * clamp(o.s ?? 0.6, 0, 1));
  const area = Math.PI * radius * radius * (o.round === false ? 0.5 : 1);
  const depth = o.depth ?? 1;
  if (depth < 0.3) return { items: [], message: '浅すぎて 魚が いない' };
  let escape = depth > 2 ? 0.6 : 0;
  const tide = game.clock.tide() > 0.35 ? 1.4 : 1;
  const density = (game.sys.events?.mod?.('netCatch') ?? 1) * (game.sys.fishing?.densityAt?.('shallow') ?? 1);
  const pod = partOfDay(game.clock.hour);
  const timeMul = [1.4, 1.0, 1.3, 0.6][pod];
  let n = Math.round(area * 0.55 * tide * density * timeMul * (0.7 + 0.6 * r.next()) * (1 - escape));
  n = clamp(n, 0, 10);
  const mesh = o.mesh ?? 1.5;
  const items = [];
  let small = 0, mid = 0;
  for (let i = 0; i < n; i++) { if (r.next() < 0.75) small++; else mid++; }
  if (mesh >= 3) small = Math.round(small * 0.3);
  if (mesh >= 6) { small = Math.round(small * 0.4); mid = Math.round(mid * 0.4); }
  if (small) items.push(['sardine', small]);
  if (mid) items.push(['jack', mid]);
  if (r.next() < 0.06) items.push(['puffer', 1]);
  if (r.next() < 0.25) items.push(['seaweed', 1]);
  if (r.next() < 0.15) items.push(['crab', 1]);
  const afternoon = game.clock.hour >= 12 && game.clock.hour < 18;
  const stung = afternoon && r.next() < 0.3 * 0.25;
  const snag = o.rocky && r.next() < 0.25;
  const torn = snag || (mid > 0 && mesh <= 1.5 && r.next() < 0.05);
  return { items: snag ? [] : items, torn, stung, snag, message: snag ? '岩に 根がかりした！ 網が 破れた' : n === 0 ? '空振り…（群れの 進む 先に 投げよう）' : '' };
}

/** per-spot overfishing memory (§22.5: > 15 a day → next day density ×0.5) */
export class FishingMemory {
  constructor() { this.today = {}; this.penalty = {}; this.day = 0; }
  init(game) { this.game = game; }
  caught(spot) { this.today[spot] = (this.today[spot] || 0) + 1; }
  densityAt(spot) { return this.penalty[spot] ? 0.5 : 1; }
  onNewDay() {
    this.penalty = {};
    for (const [s, n] of Object.entries(this.today)) if (n > 15) this.penalty[s] = 2;
    this.today = {};
  }
  serialize() { return { today: this.today, penalty: this.penalty }; }
  deserialize(d) { Object.assign(this, d); }
}
