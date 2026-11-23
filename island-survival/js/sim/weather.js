// sim/weather.js — weather states, transitions and the air temperature.
// The state changes on the hour by a Markov table (WEATHER[x].next), blends smoothly over ~40 game minutes,
// and gives: visual parameters for the sky/ocean/rain particles, air temperature (°C) at a place and time,
// wind (0…1), rain (0…1) and sun strength for the body simulation.
import { WEATHER, CLIMATE } from '../data/climate.js';
import { clamp, lerp } from '../core/rng.js';

export class Weather {
  constructor(game, rng) {
    this.game = game;
    this.rng = rng;
    this.type = 'clear';
    this.prev = 'clear';
    this.blend = 1;          // 0 → prev, 1 → type
    this.hoursLeft = 6;
    this.lastHour = -1;
    this.forecast = [];      // [{type, hours}] what comes next (shown by some items / the companion's guess)
    this.lightningT = 3;
  }

  init(game) { this.game = game; }

  param(k) {
    const a = WEATHER[this.prev][k] ?? 0, b = WEATHER[this.type][k] ?? 0;
    return lerp(a, b, this.blend);
  }
  get rain() { return this.param('rain'); }
  get wind() { return this.param('wind'); }
  get cloud() { return this.param('cloud'); }
  get fog() { return this.param('fog'); }
  get storm() { return this.param('storm'); }
  get name() { return WEATHER[this.type].name; }

  /** seasonless tropical day curve: min at 05:00, max at 14:00 */
  airTemp(hour, x = 0, z = 0, y = 0) {
    const C = CLIMATE;
    const k = 0.5 - 0.5 * Math.cos(((hour - 5 + 24) % 24) / 9 * Math.PI);  // 0 at 5:00 → 1 at 14:00
    const day = hour >= 5 && hour <= 14 ? k : 0.5 + 0.5 * Math.cos(((hour - 14 + 24) % 24) / 15 * Math.PI);
    let t = lerp(C.nightMin, C.dayMax, day);
    t += this.param('temp');
    t -= Math.max(0, y) * C.lapse;            // higher = cooler
    t += this.dayOffset || 0;
    return t;
  }

  /** wind speed felt (0…1) is lower in the jungle and inside shelters */
  setState(type, blendNow = false) {
    if (!WEATHER[type]) return;
    this.prev = blendNow ? type : this.currentDominant();
    this.type = type;
    this.blend = blendNow ? 1 : 0;
    const W = WEATHER[type];
    this.hoursLeft = W.minH + this.rng.float(0, W.maxH - W.minH);
    this.game?.bus?.emit('weather', { type, name: W.name });
  }

  currentDominant() { return this.blend > 0.5 ? this.type : this.prev; }

  pickNext() {
    const table = WEATHER[this.type].next;
    const day = this.game?.clock?.day || 1;
    const pairs = Object.entries(table).map(([k, w]) => [k, w * (k === 'storm' ? (this.game?.difficultyMul?.storm ?? 1) * (day > 3 ? 1 : 0.3) : 1)]);
    return this.rng.weighted(pairs);
  }

  update(dt, gm) {
    if (gm <= 0) return;
    this.blend = Math.min(1, this.blend + gm / 40);
    this.hoursLeft -= gm / 60;
    if (this.hoursLeft <= 0) this.setState(this.pickNext());
    // lightning during storms
    if (this.storm > 0.5) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = this.rng.float(4, 14);
        const near = this.rng.next();
        this.game.world?.sky?.strike(0.4 + 0.6 * (1 - near));
        this.game.bus.emit('thunder', { distance: near });
      }
    }
    // a daily random offset (±1.5 °C) for variety
    const day = this.game.clock.day;
    if (day !== this.offDay) { this.offDay = day; this.dayOffset = this.rng.float(-1.5, 1.5); }
  }

  /** for the sky / ocean / particles */
  visual() { return { cloud: this.cloud, rain: this.rain, fog: this.fog, wind: this.wind, storm: this.storm }; }

  serialize() { return { type: this.type, prev: this.prev, blend: this.blend, hoursLeft: this.hoursLeft }; }
  deserialize(d) { Object.assign(this, d); }
  debug() { return { type: this.type, rain: +this.rain.toFixed(2), wind: +this.wind.toFixed(2), hoursLeft: +this.hoursLeft.toFixed(1) }; }
}
