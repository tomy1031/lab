// sim/player.js — the player's state around the body simulation: inventory, hotbar and the held tool, worn
// clothes / sleeping bag, where you are (zone, shelter, fire nearby, water), visited map cells, statistics,
// and each frame the `env` object for Body.update (felt temperature inputs, rain, drying …).
import { Body, fireWarmth } from './body.js';
import { Inventory } from './inventory.js';
import { itemDef } from '../data/items.js';
import { CLIMATE } from '../data/climate.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class PlayerState {
  constructor(game) {
    this.game = game;
    this.body = new Body({ rng: game.rng, diff: game.diff, bus: game.bus, isPlayer: true, name: 'あなた' });
    this.inv = new Inventory(15);
    this.hotbar = [null, null, null, null, null, null];
    this.held = null;               // uid
    this.wear = { body: null, head: null, cloak: null, feet: null, bed: null };
    this.zone = 'beach';
    this.shelter = { rain: 0, wind: 0, insul: 0, name: '屋外' };
    this.nearFire = null;           // distance to the nearest burning fire
    this.fireNear = null;           // that Fire
    this.visited = new Set();
    this.sleeping = false;
    this.sleepUntil = null;
    this.resting = false;
    this.heavyT = 0;                // seconds of heavy work left (keeps "working" on for a moment after a hit)
    this.dew = 0;
    this.stats = {
      distance: 0, mealsCooked: 0, mealsRaw: 0, fishCaught: 0, animalsHunted: 0, crafted: 0, bestQ: 0, built: 0,
      firesLit: 0, illnesses: 0, waterCups: 0, gathered: 0, guideK3: 0, nightsSheltered: 0, causes: {},
    };
    this.inv.onChange = () => game.bus.emit('inventory', {});
    game.bus.on('condition', (c) => { if (c.isPlayer) { this.stats.illnesses++; game.bus.emit('toast', { text: `${c.name}になった`, kind: 'bad' }); game.bus.emit('log', { text: `${c.name}になった（${c.source || '原因不明'}）`, kind: 'bad' }); } });
    game.bus.on('healed', (c) => { if (c.isPlayer && c.name) game.bus.emit('toast', { text: `${c.name}が治った`, kind: 'good' }); });
  }

  heldStack() { return this.held ? this.inv.get(this.held) : null; }
  heldDef() { const s = this.heldStack(); return s ? itemDef(s.id, s) : null; }

  /** a weapon / tool kind of what is in the hand ('none' when empty) */
  heldKind() { return this.heldDef()?.tool?.kind || (this.heldStack() ? 'item' : 'none'); }

  equip(uid) {
    if (uid && !this.inv.get(uid)) return false;
    this.held = uid || null;
    this.game.viewmodel?.setTool(this.viewName());
    this.game.bus.emit('equip', { uid });
    return true;
  }

  viewName() {
    const s = this.heldStack();
    if (!s) return 'none';
    const d = itemDef(s.id, s);
    if (d?.tool?.view) return d.tool.view;
    if (d?.cat === 'food') return s.id === 'coconut' ? 'coconut' : 'food';
    if (d?.attrs?.long >= 5) return 'stick';
    if (d?.tags?.includes('stone')) return 'stone';
    if (d?.tags?.includes('leaf')) return 'leaf';
    return 'stone';
  }

  /** after a stack disappears (eaten, broken) */
  validate() {
    if (this.held && !this.inv.get(this.held)) this.equip(null);
    this.hotbar = this.hotbar.map((u) => (u && this.inv.get(u) ? u : null));
    for (const k of Object.keys(this.wear)) if (this.wear[k] && !this.inv.get(this.wear[k])) this.wear[k] = null;
  }

  wearStack(uid) {
    const s = this.inv.get(uid);
    const d = s && itemDef(s.id, s);
    if (!d?.wear) return false;
    const slot = d.wear.slot;
    this.wear[slot] = this.wear[slot] === uid ? null : uid;
    this.game.bus.emit('toast', { text: this.wear[slot] ? `${d.name}を 身につけた` : `${d.name}を はずした` });
    return true;
  }

  /** clothing insulation (°C), rain cover and sun cover (§5.4) */
  clothing() {
    let insul = 0, rain = 0, sun = 1, hasBase = false;
    for (const [slot, uid] of Object.entries(this.wear)) {
      if (!uid || slot === 'bed') continue;
      const s = this.inv.get(uid); const d = s && itemDef(s.id, s);
      if (!d?.wear) continue;
      const wet = (this.body.s.wet > 60) ? (d.tags?.includes('fur') || /fur|hide/.test(s.id) ? 0.6 : 0.3) : 1;
      insul += (s.stats?.warmth ?? d.wear.insul ?? 0) * wet;
      rain += s.stats?.rain ?? d.wear.rain ?? 0;
      if (d.wear.sun) sun *= d.wear.sun;
      if (slot === 'body') hasBase = true;
    }
    if (!hasBase) insul += this.body.s.wet > 60 ? 0.3 : 1.0; // the start clothes (T-shirt, shorts) are always on
    return { insul, rain: Math.min(0.8, rain), sun, hat: sun < 1 };
  }

  /** the sleeping bag / blanket bonus while sleeping (§21.3, §5.4) */
  beddingWarmth(feelOutside) {
    let w = 0;
    const bag = this.inv.stacks.find((s) => s.id === 'sleeping_bag');
    if (bag) w += (feelOutside > 26 ? 3 : 7) * (bag.wet > 40 ? 0.4 : 1);
    const uid = this.wear.bed;
    const s = uid && this.inv.get(uid); const d = s && itemDef(s.id, s);
    if (d?.wear?.slot === 'bed') w += d.wear.insul || 0;
    return w;
  }

  /**
   * Build the env for Body.update. dt: real seconds, gm: game minutes elapsed.
   */
  env(dt, gm) {
    const g = this.game, P = g.player, t = g.world.terrain, W = g.sys.weather, clock = g.clock;
    const hour = clock.hour;
    const x = P.pos.x, z = P.pos.z;
    this.zone = t.zoneAt(x, z);
    const y = t.heightAt(x, z);
    // shelter: structures (building system), trees, caves / rock overhangs
    const sh = g.sys.landmarks?.shelterAt?.(x, z) || g.sys.building?.shelterAt?.(x, z) || { rain: 0, wind: 0, insul: 0, name: '屋外' };
    if (!sh.name) sh.name = '屋外';
    this.shelter = sh;
    // the nearest fire
    let best = null, bd = Infinity;
    for (const f of g.fires || []) {
      if (!f.lit) continue;
      const p = f.group.position;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = f; }
    }
    this.fireNear = best; this.nearFire = best ? bd : null;
    const fuelH = best ? best.fuel / 60 : 0;
    const fireSize = fuelH > 4 ? 'big' : fuelH >= 1 ? 'mid' : 'small';
    const indoor = sh.insul > 0 || sh.name === '洞窟';
    const fireW = best ? fireWarmth(bd, fireSize, { indoor, windSpeed: W.windSpeed }) : 0;
    const daylight = hour >= 6 && hour <= 18;
    const sunElev = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const sun = daylight ? W.sun * sunElev * 1.1 : 0;
    const cloth = this.clothing();
    const rainCover = clamp(sh.rain, 0, 1);
    const inWater = P.moveInfo.inWater, swimming = P.moveInfo.swimming;
    const rainWet = W.wetPerH * (1 - rainCover) * (1 - cloth.rain);
    // drying (§5.5)
    let dry = 10;
    if (W.rain < 0.05 && daylight && sun > 0.5 && !sh.rain) dry = 25;
    if (W.rain < 0.05 && W.windSpeed > 5) dry += 5;
    if (best && bd < 4) dry = Math.max(dry, 40);
    if (W.rain > 0.05 && rainCover > 0.5) dry = 8;
    if (W.humidity >= 0.95 && !(best && bd < 4)) dry *= 0.5;
    if (W.rain > 0.05 && rainCover < 0.5) dry = 0;
    // dew 05–07 walking through grass / jungle (§5.5)
    const dew = hour >= 5 && hour < 7 && P.moveInfo.moving && (this.zone === 'grass' || this.zone === 'jungle') ? 10 : 0;
    const Tair = W.airTemp(hour, { y, zone: sh.name === '洞窟' ? 'cave' : this.zone, day: clock.day });
    let windBlock = clamp(sh.wind, 0, 1);
    if (this.zone === 'jungle') windBlock = Math.max(windBlock, 0.35);
    const sleeping = this.sleeping;
    const feelOutside = Tair; // rough, for the sleeping bag
    const shelterInsul = (sh.insul || 0) + (sleeping ? this.beddingWarmth(feelOutside) + (sh.bedWarm || 0) : 0);
    const huddle = sleeping && g.sys.companion?.huddling?.() ? 1.5 : 0;
    const heavy = this.heavyT > 0;
    this.heavyT = Math.max(0, this.heavyT - dt);
    const night = hour < 5.5 || hour >= 19;
    return {
      dtH: gm / 60, dtReal: dt, sleeping, heavy,
      running: P.moveInfo.running, swimming, moving: P.moveInfo.moving, jumped: P.moveInfo.jumped,
      inWater, waterDepth: P.moveInfo.waterDepth,
      Tair, sun, shade: rainCover >= 0.3 || this.zone === 'jungle', hat: cloth.hat, windSpeed: W.windSpeed * (this.zone === 'hill' ? 1.5 : 1), windBlock,
      rainWet, dry, dew, humidity: W.humidity, fire: fireW, clothes: cloth.insul, shelterInsul, huddle,
      companionNear: !!g.sys.companion?.near?.(10), fireNear: !!(best && bd < 6), night, outdoorsNoFire: night && !(best && bd < 6) && rainCover < 0.5,
      hour, day: clock.day, sleepQuality: this.sleepQuality ?? 0.6, resting: this.resting, sittingByFire: this.resting && best && bd < 4,
    };
  }

  update(dt, gm) {
    const g = this.game;
    const env = this.env(dt, gm);
    this.lastEnv = env;
    this.body.update(env);
    // the inventory ages (freshness), gets wet in rain / water, dries by the fire
    const W = g.sys.weather;
    const wetRate = env.swimming ? 100 : env.rainWet > 0 ? env.rainWet * 0.3 / 60 : 0;
    this.inv.tick(gm, { tAir: env.Tair, wetRate, dryRate: env.fire > 0 ? 0.6 : W.rain > 0.05 ? 0.02 : 0.15, place: 1.2 });
    // map cells visited (20 m grid)
    const P = g.player.pos;
    // you see about 40 m around you: reveal the map cells (20 m grid, key "i,j" = floor(x / 20), floor(z / 20))
    const ci = Math.floor(P.x / 20), cj = Math.floor(P.z / 20);
    if (ci !== this.lastCell?.[0] || cj !== this.lastCell?.[1]) {
      this.lastCell = [ci, cj];
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) if (di * di + dj * dj <= 5) this.visited.add(`${ci + di},${cj + dj}`);
    }
    this.stats.distance += g.player.moveInfo.dist;
    // movement limits from the body
    g.player.speedMul = this.body.speedMul * this.weightMul();
    g.player.canRun = this.body.canRun;
  }

  /** over the carrying limit: −5 % speed per kg, immobile at 1.5× (§4.9) */
  weightMul() {
    const cap = this.capacity;
    const w = this.inv.weight();
    if (w <= cap) return 1;
    if (w >= cap * 1.5) return 0.15;
    return Math.max(0.2, 1 - (w - cap) * 0.05);
  }
  get capacity() {
    let cap = 15;
    for (const s of this.inv.stacks) { const d = itemDef(s.id, s); if (d?.carry) cap += s.stats?.carry ?? d.carry; }
    return cap;
  }

  serialize() {
    return { body: this.body.serialize(), inv: this.inv.serialize(), hotbar: this.hotbar, held: this.held, wear: this.wear, visited: [...this.visited], stats: this.stats };
  }
  deserialize(d) {
    this.body.deserialize(d.body);
    this.inv.deserialize(d.inv);
    // uids are renumbered on load: map by index
    const old = d.inv.stacks.map((s) => s.uid), now = this.inv.stacks.map((s) => s.uid);
    const map = (u) => { const i = old.indexOf(u); return i >= 0 ? now[i] : null; };
    this.hotbar = (d.hotbar || []).map(map);
    this.held = map(d.held);
    this.wear = Object.fromEntries(Object.entries(d.wear || {}).map(([k, v]) => [k, map(v)]));
    this.visited = new Set(d.visited || []);
    Object.assign(this.stats, d.stats || {});
  }
}

export { CLIMATE };
