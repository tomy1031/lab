// js/game/stats.js — steps, distance, active time, kcal (estimate), best cadence, daily history (§2.7) (OPUS-B)
import { todayKey, emit, setting } from './util.js';

const MET = { walk: 3.5, jog: 7.0, sprint: 9.5, fight: 4.0, rest: 1.5 };

export function createStats(ctx, G) {
  const blank = () => ({ steps: 0, distance: 0, kcal: 0, activeSec: 0, bestCadence: 0, kills: 0, deaths: 0 });
  const s = {
    ...blank(),
    days: {},
    session: blank(),
    met: 1.5,            // current MET (for UI)
    activeNow: false,
    restMode: null,      // { t } — "今日はここまで" cooldown
    realStride: 0.7,     // m per real step (reference distance)
    serialize() {
      return { steps: s.steps, distance: s.distance, kcal: s.kcal, activeSec: s.activeSec, bestCadence: s.bestCadence,
        kills: s.kills, deaths: s.deaths, days: s.days };
    },
    restore(d) {
      const b = blank();
      for (const k of Object.keys(b)) s[k] = (d && Number.isFinite(d[k])) ? d[k] : 0;
      s.days = (d && d.days && typeof d.days === 'object') ? d.days : {};
      Object.assign(s.session, blank());
    },
    today() { return day(); },
    add(key, n = 1) { s[key] += n; s.session[key] += n; if (key === 'kills' || key === 'deaths') { /* totals only */ } },
  };

  function day() {
    const k = todayKey();
    let d = s.days[k];
    if (!d) {
      d = s.days[k] = { steps: 0, kcal: 0, activeSec: 0, distance: 0, bestCadence: 0 };
      // keep the history small: last 60 days
      const keys = Object.keys(s.days).sort();
      while (keys.length > 60) delete s.days[keys.shift()];
    }
    return d;
  }

  let lastX = NaN, lastZ = NaN, tickT = 0, handFastT = 0;
  ctx.events?.on?.('step', () => {
    s.steps++; s.session.steps++;
    day().steps++;
  });
  ctx.events?.on?.('player:teleport', () => { lastX = NaN; });
  ctx.events?.on?.('player:respawn', () => { lastX = NaN; });
  ctx.events?.on?.('enemy:death', (e) => { if (e && e.by !== 'reset') { s.kills++; s.session.kills++; } });
  ctx.events?.on?.('player:death', () => { s.deaths++; s.session.deaths++; });

  s.update = function (dtSim) {
    if (dtSim <= 0) return;
    // body time follows the real clock even when the frame rate collapses (ctx.clock.real, OPUS-A)
    const real = ctx.clock && ctx.clock.real > 0 ? Math.min(ctx.clock.real, 0.25) : 0;
    const dt = Math.max(dtSim, real);
    const pl = ctx.player;
    // distance travelled in the world (skip teleports and big jumps)
    if (pl && pl.pos) {
      const x = pl.pos.x, z = pl.pos.z;
      if (Number.isFinite(lastX)) {
        const d = Math.hypot(x - lastX, z - lastZ);
        if (d < 2.5 && d > 0.0005) {
          const km = d / 1000;
          s.distance += km; s.session.distance += km; day().distance += km;
        }
      }
      lastX = x; lastZ = z;
    }
    // active: stepping or a hand faster than 1.5 m/s (with a little hold)
    const hands = ctx.input && ctx.input.hands;
    let hand = 0;
    if (hands) {
      const l = hands.left && hands.left.vel, r = hands.right && hands.right.vel;
      if (l) hand = Math.max(hand, l.length());
      if (r) hand = Math.max(hand, r.length());
    }
    if (hand > 1.5) handFastT = 1.0; else handFastT = Math.max(0, handFastT - dt);
    const moving = !!(pl && pl.moving && pl.gait && pl.gait !== 'idle');
    s.activeNow = moving || handFastT > 0;
    if (s.activeNow) { s.activeSec += dt; s.session.activeSec += dt; day().activeSec += dt; }
    const gait = pl && pl.gait;
    s.met = moving ? (MET[gait] || MET.walk) : handFastT > 0 ? MET.fight : MET.rest;
    const kg = +setting(ctx, 'weightKg', 60) || 60;
    const kcal = s.met * 3.5 * kg / 200 / 60 * dt;
    s.kcal += kcal; s.session.kcal += kcal; day().kcal += kcal;
    if (pl && moving && pl.cadence > s.bestCadence && pl.cadence < 260) {
      s.bestCadence = Math.round(pl.cadence);
    }
    if (pl && moving && pl.cadence > s.session.bestCadence && pl.cadence < 260) {
      s.session.bestCadence = Math.round(pl.cadence);
      const d = day();
      if (s.session.bestCadence > (d.bestCadence || 0)) d.bestCadence = s.session.bestCadence;
    }
    tickT += dt;
    if (tickT >= 1) {
      tickT -= 1;
      emit(ctx, 'stats:tick', { steps: s.steps, distance: s.distance, kcal: s.kcal, activeSec: s.activeSec,
        cadence: pl ? Math.round(pl.cadence || 0) : 0, session: s.session });
    }
  };
  return s;
}
