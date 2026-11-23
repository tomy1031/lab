// core/clock.js — game time. One game day lasts `dayMinutes` real minutes (chosen in the setup).
// total = game minutes since day 1 00:00. The game starts on day 1 at 07:00.
export class Clock {
  constructor(dayMinutes = 20, total = 7 * 60) {
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
  /** tide height (m): semi-diurnal, 12.42 h period, ±0.6 m, a little stronger on full/new moon days */
  tide() {
    const h = this.total / 60;
    const spring = 0.8 + 0.2 * Math.cos((this.day / 14.77) * Math.PI * 2);
    return Math.sin((h / 12.42) * Math.PI * 2) * 0.6 * spring;
  }
}
