// sim/weather.js — weather blocks, seasons, air temperature and wind (DESIGN.md §5.1–5.3).
// The weather is decided for each 6-hour block (00/06/12/18). Day 1 is fixed (clear, clear, cloudy, cloudy)
// so the first night is dry; day 2's evening turns to drizzle half of the time (to learn sheltering).
// Fog can appear 06:00–08:30 after a rainy block; heat waves on dry-season clear afternoons.
// Typhoons are scheduled by the events system (forceBlocks).
import { WEATHER, CLIMATE, transitions } from '../data/climate.js';
import { clamp, lerp } from '../core/rng.js';

export class Weather {
  constructor(rng, { startSeason = 'dry' } = {}) {
    this.rng = rng;
    this.startSeason = startSeason;
    this.block = -1;          // index of the current 6 h block since day 1 00:00
    this.type = 'clear';
    this.prev = 'clear';
    this.blend = 1;
    this.windSpeed = 2;       // m/s (actual)
    this.windTarget = 2;
    this.windDir = 0.8;       // radians, the direction the air moves to (x = sin, z = cos)
    this.forced = [];         // [{ block, type }] e.g. a typhoon
    this.history = [];        // last few block types (for fog / river turbidity)
    this.lastRainEndH = -99;
    this.dayOffset = 0;
    this.lightningT = 4;
  }

  /** dry or wet season on a game day */
  season(day) {
    const { dry, wet } = CLIMATE.seasonDays;
    let d = (day - 1) % (dry + wet);
    if (this.startSeason === 'wet') d = (d + dry) % (dry + wet);
    return d < dry ? 'dry' : 'wet';
  }

  W(t) { return WEATHER[t] || WEATHER.clear; }
  param(k) { return lerp(this.W(this.prev)[k] ?? 0, this.W(this.type)[k] ?? 0, this.blend); }
  get rain() { return this.param('rain'); }
  get cloud() { return this.param('cloud'); }
  get fog() { return this.param('fog'); }
  get storm() { return this.param('storm'); }
  get sun() { return this.param('sun'); }
  get humidity() { return this.param('humidity'); }
  get wetPerH() { return this.param('wetPerH'); }
  get name() { return this.W(this.type).name; }
  /** wind 0…1 for visuals */
  get wind() { return clamp(this.windSpeed / 22); }

  /** choose the weather of a new block */
  decide(block, day) {
    const forced = this.forced.find((f) => f.block === block);
    if (forced) return forced.type;
    const hourStart = (block % 4) * 6;
    if (day === 1) return ['clear', 'clear', 'cloudy', 'cloudy'][block % 4];
    const season = this.season(day);
    let next = this.rng.weighted(transitions(this.type, season));
    if (day === 2 && hourStart === 18 && next === 'clear' && this.rng.chance(0.5)) next = 'drizzle';
    // morning fog after rain
    const wasRain = ['drizzle', 'rain', 'storm', 'typhoon'].includes(this.type);
    if (hourStart === 6 && (next === 'clear' || next === 'cloudy') && wasRain && this.rng.chance(0.35)) { this.fogUntil = (block * 6 + 2.5); }
    if (hourStart === 12 && season === 'dry' && next === 'clear' && this.rng.chance(0.15)) next = 'heat';
    return next;
  }

  /** call every frame with the game clock */
  update(dt, gm, clockOrGame) {
    const clock = clockOrGame?.clock || clockOrGame;
    const totalH = clock.total / 60;
    const block = Math.floor(totalH / 6);
    if (block !== this.block) {
      const first = this.block < 0;
      this.block = block;
      // the next block is decided one block ahead so people can read the sky (§24.8 rain_soon); a typhoon scheduled later still wins
      const forcedNow = this.forced.find((f) => f.block === block);
      const nt = forcedNow ? forcedNow.type : this.queued?.block === block ? this.queued.type : this.decide(block, clock.day);
      if (['drizzle', 'rain', 'storm', 'typhoon'].includes(this.type) && !['drizzle', 'rain', 'storm', 'typhoon'].includes(nt)) this.lastRainEndH = totalH;
      this.prev = first ? nt : this.currentDominant();
      this.type = nt;
      this.blend = first ? 1 : 0;
      this.history.push(nt); if (this.history.length > 8) this.history.shift();
      const [a, b] = this.W(nt).wind;
      this.windTarget = this.rng.float(a, b);
      this.onChange?.(nt);
      const nb = block + 1;
      this.queued = { block: nb, type: this.decide(nb, Math.floor((nb * 6) / 24) + 1) };
    }
    // fog overlay in the morning
    if (this.fogUntil && totalH < this.fogUntil && clock.hour >= 6 && this.type !== 'fog') { this.prev = this.currentDominant(); this.type = 'fog'; this.blend = 0; }
    if (this.fogUntil && totalH >= this.fogUntil && this.type === 'fog') { this.fogUntil = 0; this.prev = 'fog'; this.type = 'cloudy'; this.blend = 0; }
    this.blend = Math.min(1, this.blend + gm / 15);
    // gusty wind wandering around its target; the direction drifts slowly
    this.windSpeed += (this.windTarget + Math.sin(totalH * 7.3) * 0.15 * this.windTarget - this.windSpeed) * Math.min(1, gm / 20);
    this.windDir += (this.rng.next() - 0.5) * 0.02 * Math.min(gm, 5);
    if (clock.day !== this.offDay) { this.offDay = clock.day; this.dayOffset = this.rng.float(-1, 1); }
  }

  currentDominant() { return this.blend > 0.5 ? this.type : this.prev; }

  /** what the sky says about the next 6 h block: { type, inH } (null right after a load) */
  upcoming(clock) {
    if (!this.queued) return null;
    const forced = this.forced.find((f) => f.block === this.queued.block);
    return { type: forced ? forced.type : this.queued.type, inH: this.queued.block * 6 - clock.total / 60 };
  }
  rainSoon(clock, withinH = 3) {
    const u = this.upcoming(clock);
    return !!u && u.inH <= withinH && ['drizzle', 'rain', 'storm', 'typhoon'].includes(u.type) && !['drizzle', 'rain', 'storm', 'typhoon'].includes(this.type);
  }

  /** schedule a typhoon: 3 storm blocks starting at a block index */
  scheduleTyphoon(startBlock) { for (let i = 0; i < 3; i++) this.forced.push({ block: startBlock + i, type: 'typhoon' }); }

  /** outside air temperature at hour h (0…24), height y (m), zone, day */
  airTemp(h, { y = 0, zone = null, day = 1 } = {}) {
    if (zone === 'cave') return CLIMATE.caveTemp;
    const rainy = ['cloudy', 'drizzle', 'rain', 'storm', 'typhoon', 'fog'].includes(this.type);
    const swing = CLIMATE.swing * (rainy ? 0.6 : 1);
    let t = this.param('tmean') + CLIMATE.seasonTemp[this.season(day)] + swing * Math.cos(((h - 14) / 24) * Math.PI * 2);
    t -= Math.max(0, y) * CLIMATE.lapse;
    if (zone && CLIMATE.zone[zone] && !(zone === 'jungle' && (h < 6 || h > 18))) t += CLIMATE.zone[zone];
    return t + this.dayOffset;
  }

  /** for the sky / ocean / particles */
  visual() { return { cloud: this.cloud, rain: this.rain, fog: this.fog, wind: this.wind, storm: this.storm }; }

  serialize() { return { block: this.block, type: this.type, prev: this.prev, blend: this.blend, windSpeed: this.windSpeed, windTarget: this.windTarget, windDir: this.windDir, forced: this.forced, history: this.history, lastRainEndH: this.lastRainEndH, startSeason: this.startSeason }; }
  deserialize(d) { Object.assign(this, d); }
  debug() { return { type: this.type, rain: +this.rain.toFixed(2), wind: +this.windSpeed.toFixed(1) }; }
}
