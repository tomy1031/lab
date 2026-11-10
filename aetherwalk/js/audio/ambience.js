// js/audio/ambience.js — region × time-of-day soundscapes with 2 s crossfades: wind (world.wind + your speed),
// meadow birds / crickets, forest leaves / frogs, canyon sand, peaks blizzard, coast waves, campfire crackle (§9) (OPUS-B)
import { midi } from './synth.js';

export function createAmbience(S, buses, ctx, sfx) {
  const ac = S.ac;
  const wind = S.bed(S.pink, 'bandpass', 500, 0.6, buses.amb);
  const leaves = S.bed(S.noise, 'bandpass', 3800, 0.8, buses.amb);
  const sand = S.bed(S.noise, 'highpass', 3200, 0.7, buses.amb);
  const blizzard = S.bed(S.brown, 'lowpass', 260, 0.7, buses.amb);
  const waves = S.bed(S.pink, 'lowpass', 650, 0.6, buses.amb);
  const lap = S.bed(S.pink, 'bandpass', 900, 1.2, buses.amb);
  const T = 0.65;                        // setTargetAtTime τ ≈ 2 s crossfade
  let evT = 1, swell = 0, last = '', crackleT = 0, gustT = 0;

  function target(bed, v) { bed.gain.gain.setTargetAtTime(v, ac.currentTime, T); }

  return {
    update(dt) {
      const w = ctx.world, pl = ctx.player;
      if (!pl || !pl.pos) return;
      const region = (w && w.regionAt) ? safe(() => w.regionAt(pl.pos.x, pl.pos.z), 'meadow') : 'meadow';
      const night = w ? (w.nightFactor ?? (w.phase === 'night' ? 1 : 0)) : 0;
      const ws = w && w.wind ? (w.wind.strength ?? 0.4) : 0.4;
      const sp = pl.speed || 0;
      // wind: louder and brighter with the world's wind and your own speed (or a glide)
      const k = Math.min(1, ws * 0.6 + sp / 9 + (pl.gliding ? 0.5 : 0));
      wind.gain.gain.setTargetAtTime(0.05 + 0.22 * k, ac.currentTime, 0.4);
      wind.filter.frequency.setTargetAtTime(300 + 1100 * k, ac.currentTime, 0.4);
      const key = `${region}|${night > 0.5}`;
      if (key !== last) {
        last = key;
        target(leaves, region === 'forest' ? (night > 0.5 ? 0.025 : 0.05) : region === 'meadow' ? 0.012 : 0);
        target(sand, region === 'canyon' ? 0.035 : 0);
        target(blizzard, region === 'peaks' ? 0.22 : 0);
        target(waves, region === 'coast' || region === 'sea' ? 0.18 : 0);
        target(lap, region === 'lake' ? 0.05 : 0);
      }
      // slow swells
      swell += dt;
      if (region === 'coast' || region === 'sea') waves.filter.frequency.setTargetAtTime(400 + 500 * (0.5 + 0.5 * Math.sin(swell * 0.8)), ac.currentTime, 0.5);
      if (region === 'forest') leaves.filter.frequency.setTargetAtTime(3000 + 1600 * (0.5 + 0.5 * Math.sin(swell * 0.37)), ac.currentTime, 0.8);
      if (region === 'canyon') {
        gustT -= dt;
        if (gustT <= 0) { gustT = 3 + Math.random() * 5; sand.gain.gain.setTargetAtTime(0.09, ac.currentTime, 0.4); sand.gain.gain.setTargetAtTime(0.03, ac.currentTime + 1.2, 0.8); }
      }
      // creatures
      evT -= dt;
      if (evT <= 0) {
        evT = 0.6 + Math.random() * 2.4;
        const t = ac.currentTime;
        if (night > 0.5) {
          if (region === 'meadow' || region === 'lake' || region === 'coast') crickets(t);
          if (region === 'forest' || region === 'lake') frog(t);
        } else {
          if (region === 'meadow' || region === 'lake') bird(t, 1);
          if (region === 'forest') bird(t, 0.7);
          if (region === 'coast' && Math.random() < 0.4) gull(t);
        }
      }
      // campfire crackle near a lit waylight
      const G = ctx.game;
      if (G && G.checkpoints) {
        crackleT -= dt;
        if (crackleT <= 0) {
          crackleT = 0.05 + Math.random() * 0.25;
          const l = G.checkpoints.nearLit(7);
          if (l) sfx.crackle({ dest: buses.amb });
        }
      }
    },
  };

  function bird(t, k) {
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) S.tone(base * (1 + 0.15 * Math.sin(i * 1.7)), { t: t + i * 0.09, decay: 0.07, gain: 0.025 * k, dest: buses.amb, glideTo: base * (1.25 + Math.random() * 0.3), glideTime: 0.06 });
  }
  function gull(t) { S.tone(1300, { t, type: 'triangle', decay: 0.35, gain: 0.025, dest: buses.amb, glideTo: 900, glideTime: 0.3 }); }
  function crickets(t) {
    const f = 4300 + Math.random() * 600;
    for (let i = 0; i < 6; i++) S.tone(f, { t: t + i * 0.045, decay: 0.025, gain: 0.018, dest: buses.amb });
  }
  function frog(t) {
    const f = 110 + Math.random() * 60;
    S.tone(f, { t, type: 'square', decay: 0.14, gain: 0.03, dest: buses.amb, glideTo: f * 0.8, glideTime: 0.12 });
    S.tone(f * 1.01, { t: t + 0.18, type: 'square', decay: 0.1, gain: 0.02, dest: buses.amb });
  }
}
function safe(fn, d) { try { return fn(); } catch (e) { return d; } }
export { midi };
