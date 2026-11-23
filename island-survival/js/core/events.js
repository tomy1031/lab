// core/events.js — a tiny event bus shared by all systems.
//   bus.on('item:gained', fn) · bus.emit('item:gained', { id, n }) · bus.once(...)
// Common events (payloads in comments):
//   toast {text, kind}             a short message at the top of the screen
//   log {text, kind}               an entry in the day's log (journal) + companion memory
//   item:gained {item, n} / item:lost {item, n} / item:used {item}
//   craft:done {result, inputs} / build:done {structure}
//   eat {item, risk} / drink {source, risk} / sick {disease} / healed {disease}
//   hour {day, hour} / day {day} / weather {type}
//   player:dead {cause} / game:end {result}
//   companion:say {text} / companion:mood {mood}
export class EventBus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.map.get(name)?.delete(fn); }
  once(name, fn) { const off = this.on(name, (a) => { off(); fn(a); }); return off; }
  emit(name, arg) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(arg); } catch (e) { console.error(`[bus] ${name}`, e); window.ISLE?.errors?.push(`${name}: ${e.message}`); }
    }
  }
}
