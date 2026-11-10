// js/core/events.js — synchronous event bus (§10.6, OPUS-A).
// Listener lists are copy-on-write, so emit() never allocates and a listener may on()/off() during emit.
// A throwing listener is reported once (AW.errors) and the others still run.

export function createEvents(report = () => {}) {
  const map = new Map();          // name → fn[]
  const reported = new Set();

  function on(name, fn) {
    const list = map.get(name);
    map.set(name, list ? [...list, fn] : [fn]);
    return () => off(name, fn);
  }
  function off(name, fn) {
    const list = map.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i < 0) return;
    const next = list.slice();
    next.splice(i, 1);
    if (next.length) map.set(name, next); else map.delete(name);
  }
  function once(name, fn) {
    const wrap = (p) => { off(name, wrap); fn(p); };
    return on(name, wrap);
  }
  function emit(name, payload) {
    const list = map.get(name);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (e) {
        const key = name + ':' + (e && e.message);
        if (!reported.has(key)) { reported.add(key); report(`event "${name}" listener: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e}`); }
      }
    }
  }
  const count = (name) => (map.get(name) || []).length;
  return { on, off, once, emit, count };
}
