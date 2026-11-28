// core/clock.js — game time. One game day lasts `dayMinutes` real minutes (chosen in the setup).
// total = game minutes since day 1 00:00. The game starts on day 1 at 08:00 (DESIGN.md §4.1).
export class Clock {
  constructor(dayMinutes = 24, total = 8 * 60) {
    this.dayMinutes = dayMinutes;
    this.total = total;
    this.scale = 1;         // >1 while sleeping / waiting
    this.paused = false;
  }
  /** game minutes per real second at normal speed */
  get rate() { return 1440 / (this.dayMinutes * 60); }
  get day() { return Math.floor(this.total / 1440) + 1; }
  get hour() { return (this.total % 1440) / 60; }
  get minuteOfDay() { return this.total % 1440; }
  get isNight() { const h = this.hour; return h < 5.5 || h >= 19; }
  /** advance by real seconds; returns elapsed game minutes */
  tick(dt) {
    if (this.paused) return 0;
    const gm = dt * this.rate * this.scale;
    this.total += gm;
    return gm;
  }
  /** "3日目 14:05" */
  label() {
    const h = Math.floor(this.hour), m = Math.floor(this.minuteOfDay % 60);
    return `${this.day}日目 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  /** tide (m), DESIGN.md §8.3: semi-diurnal + diurnal terms, spring/neap modulation; storms add surge elsewhere */
  tide(t = this.total / 60) {
    const spring = 1 + 0.3 * Math.cos((2 * Math.PI * (t / 24)) / 14.75);
    // scaled ×0.7 from the design's ±1.2 m so the generated beaches keep a dry strip at high tide
    return (0.9 * Math.sin((2 * Math.PI * t) / 12.4) + 0.3 * Math.sin((2 * Math.PI * t) / 24.8 + 1.0)) * spring * 0.7;
  }
  /** game hours → real seconds per game hour */
  get realSecPerHour() { return this.dayMinutes * 60 / 24; }
}
