// js/game/save.js — localStorage 'aetherwalk.save.v1' (§10.10). ?fresh never reads or writes. (OPUS-B)
export const SAVE_KEY = 'aetherwalk.save.v1';

function storage() {
  try { return window.localStorage || null; } catch (e) { return null; }
}

export function createSaver(ctx) {
  const fresh = !!(ctx.flags && ctx.flags.fresh) || !!(ctx.params && ctx.params.has && ctx.params.has('fresh'));
  return {
    enabled: !fresh,
    read() {
      if (fresh) return null;
      const ls = storage();
      if (!ls) return null;
      try {
        const raw = ls.getItem(SAVE_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        return d && d.v === 1 ? d : null;
      } catch (e) { return null; }
    },
    write(data) {
      if (fresh) return false;
      const ls = storage();
      if (!ls) return false;
      try { ls.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
    },
    clear() {
      if (fresh) return;
      const ls = storage();
      try { ls && ls.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    },
  };
}
