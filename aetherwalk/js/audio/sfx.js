// js/audio/sfx.js — synthesized effects: footsteps per surface, swings, hits, telegraph risers, hurt, tools (§9) (OPUS-B)
import { midi } from './synth.js';

// footstep color per surface: [filter type, center Hz, Q, gain, length s, extra]
const SURF = {
  grass: ['bandpass', 2600, 0.7, 0.22, 0.09], dirt: ['lowpass', 900, 0.8, 0.3, 0.07], sand: ['bandpass', 3800, 0.6, 0.18, 0.12],
  rock: ['bandpass', 1500, 2.2, 0.28, 0.05], stone: ['bandpass', 1800, 2.6, 0.3, 0.05], snow: ['lowpass', 1500, 0.6, 0.3, 0.14],
  wood: ['bandpass', 600, 3.0, 0.35, 0.07], water: ['bandpass', 1100, 0.9, 0.3, 0.16], ice: ['highpass', 2400, 1.5, 0.22, 0.06],
};
// telegraph risers: each type its own rising shape (heard even when you do not look)
const TELE = {
  thornling: { f0: 700, f1: 1700, type: 'square', g: 0.06 },
  husk: { f0: 160, f1: 420, type: 'sawtooth', g: 0.08 },
  wisp: { f0: 520, f1: 1100, type: 'sine', g: 0.12, wobble: true },
  lurker: { f0: 70, f1: 240, type: 'sawtooth', g: 0.1, rumble: true },
  rimeguard: { f0: 110, f1: 330, type: 'sawtooth', g: 0.1 },
  stillheart: { f0: 90, f1: 360, type: 'sawtooth', g: 0.12 },
  shrine: { f0: 300, f1: 900, type: 'triangle', g: 0.08 },
};

export function createSfx(S, buses) {
  const ac = S.ac;
  const fx = {
    step({ surface = 'grass', strength = 0.6, foot = 'L', running = false, dest }) {
      const s = SURF[surface] || SURF.grass;
      const t = ac.currentTime;
      const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      let out = dest || buses.sfx;
      if (pan) { pan.pan.value = foot === 'L' ? -0.25 : 0.25; pan.connect(out); out = pan; }
      const len = s[4] * (running ? 0.7 : 1);
      const g = s[3] * (0.6 + 0.6 * strength) * (running ? 1.1 : 1);
      S.burst({ t, dur: len, type: s[0], freq: s[1] * (running ? 1.25 : 1) * (0.9 + Math.random() * 0.2), q: s[2], gain: g, dest: out, buf: surface === 'snow' || surface === 'grass' ? S.pink : S.noise });
      // a low body thump under every step
      S.tone(running ? 95 : 80, { t, decay: 0.07, gain: 0.08 * (0.5 + strength), dest: out, glideTo: 50, glideTime: 0.07 });
      if (surface === 'water') S.burst({ t: t + 0.03, dur: 0.12, type: 'highpass', freq: 3000, q: 0.5, gain: 0.08, dest: out });
    },
    swing({ speed = 4, dest }) {
      const k = Math.min(1, Math.max(0, (speed - 3) / 6));
      S.burst({ dur: 0.16 + 0.08 * k, type: 'bandpass', freq: 500 + 900 * k, sweepTo: 1800 + 2600 * k, q: 1.6, gain: 0.12 + 0.12 * k, dest: dest || buses.sfx, attack: 0.03 });
    },
    hit({ type = 'slash', strong = false, dest }) {
      const d = dest || buses.sfx, t = ac.currentTime;
      if (type === 'armor') {
        for (const f of [880, 1320, 2011]) S.tone(f, { t, type: 'square', decay: 0.18, gain: 0.05, dest: d });
        S.burst({ t, dur: 0.05, type: 'highpass', freq: 3000, gain: 0.2, dest: d });
        return;
      }
      if (type === 'blunt') {
        S.tone(140, { t, decay: 0.16, gain: 0.25, dest: d, glideTo: 60, glideTime: 0.15 });
        S.burst({ t, dur: 0.08, type: 'lowpass', freq: 700, gain: 0.3, dest: d });
      } else {
        S.burst({ t, dur: 0.1, type: 'bandpass', freq: 2400, q: 1.2, gain: 0.28, dest: d, sweepTo: 900 });
        S.tone(strong ? 520 : 660, { t, type: 'triangle', decay: 0.12, gain: 0.08, dest: d });
      }
      if (strong) S.tone(1046, { t: t + 0.02, decay: 0.4, gain: 0.07, dest: d });
    },
    deflect({ dest }) { S.bell(1568, { decay: 0.5, gain: 0.12, dest: dest || buses.sfx }); S.burst({ dur: 0.05, type: 'highpass', freq: 4000, gain: 0.15, dest: dest || buses.sfx }); },
    block({ parry = false, dest }) {
      const d = dest || buses.sfx, t = ac.currentTime;
      S.tone(parry ? 330 : 180, { t, type: 'triangle', decay: 0.2, gain: 0.25, dest: d, glideTo: parry ? 660 : 120, glideTime: 0.12 });
      S.burst({ t, dur: 0.07, type: 'bandpass', freq: 900, q: 1.5, gain: 0.25, dest: d });
      if (parry) { S.bell(1318, { t: t + 0.04, decay: 0.7, gain: 0.12, dest: d }); S.bell(1976, { t: t + 0.1, decay: 0.6, gain: 0.08, dest: d }); }
    },
    telegraph({ type = 'husk', duration = 1, dest }) {
      const p = TELE[type] || TELE.husk, d = dest || buses.sfx, t = ac.currentTime;
      if (!S.take(duration)) return;
      const o = ac.createOscillator();
      o.type = p.type;
      o.frequency.setValueAtTime(p.f0, t);
      o.frequency.exponentialRampToValueAtTime(p.f1, t + duration);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(p.f0 * 3, t); f.frequency.exponentialRampToValueAtTime(p.f1 * 5, t + duration);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p.g, t + duration * 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.08);
      o.connect(f); f.connect(g); g.connect(d);
      if (p.wobble) {
        const l = ac.createOscillator(), lg = ac.createGain();
        l.frequency.value = 9; lg.gain.value = p.f0 * 0.08; l.connect(lg); lg.connect(o.frequency);
        l.start(t); l.stop(t + duration + 0.1);
      }
      o.start(t); o.stop(t + duration + 0.1);
      if (p.rumble) S.burst({ t, dur: duration, type: 'lowpass', freq: 220, gain: 0.25, dest: d, buf: S.brown });
    },
    attack({ dest }) { S.burst({ dur: 0.18, type: 'bandpass', freq: 600, sweepTo: 200, q: 1, gain: 0.2, dest: dest || buses.sfx }); },
    hurt({ dest }) {
      const d = dest || buses.sfx, t = ac.currentTime;
      S.tone(110, { t, decay: 0.25, gain: 0.35, dest: d, glideTo: 55, glideTime: 0.2 });
      S.burst({ t, dur: 0.18, type: 'lowpass', freq: 500, gain: 0.3, dest: d, buf: S.brown });
    },
    dodge({ dest }) {
      const d = dest || buses.sfx, t = ac.currentTime;
      S.burst({ t, dur: 0.22, type: 'bandpass', freq: 900, sweepTo: 3000, q: 1.2, gain: 0.12, dest: d, attack: 0.04 });
      S.bell(midi(91), { t: t + 0.06, decay: 0.5, gain: 0.05, dest: d });
    },
    death({ dest }) {
      const d = dest || buses.sfx, t = ac.currentTime;
      [76, 72, 69, 64].forEach((n, i) => S.bell(midi(n), { t: t + i * 0.22, decay: 1.4, gain: 0.08, dest: d }));
      S.burst({ t, dur: 2.0, type: 'bandpass', freq: 600, sweepTo: 3000, q: 0.5, gain: 0.12, dest: d, attack: 0.6, buf: S.pink });
    },
    respawn({ dest }) { const d = dest || buses.sfx, t = ac.currentTime; [64, 69, 72, 76].forEach((n, i) => S.pluck(midi(n), { t: t + i * 0.09, gain: 0.12, dest: d })); },
    enemyDeath({ dest }) {
      const d = dest || buses.sfx, t = ac.currentTime;
      S.burst({ t, dur: 0.6, type: 'bandpass', freq: 400, sweepTo: 4000, q: 0.7, gain: 0.18, dest: d, attack: 0.02, buf: S.pink });
      S.bell(midi(84), { t: t + 0.15, decay: 0.9, gain: 0.07, dest: d }); S.bell(midi(91), { t: t + 0.25, decay: 0.9, gain: 0.05, dest: d });
    },
    explosion({ dest }) {
      const d = dest || buses.sfx, t = ac.currentTime;
      S.burst({ t, dur: 0.9, type: 'lowpass', freq: 900, sweepTo: 120, gain: 0.6, dest: d, buf: S.brown });
      S.tone(70, { t, decay: 0.6, gain: 0.4, dest: d, glideTo: 35, glideTime: 0.5 });
    },
    bowDraw({ dest }) { S.burst({ dur: 0.45, type: 'bandpass', freq: 300, sweepTo: 700, q: 6, gain: 0.08, dest: dest || buses.sfx, attack: 0.2 }); },
    bowRelease({ dest }) { const d = dest || buses.sfx; S.tone(220, { type: 'triangle', decay: 0.18, gain: 0.15, dest: d, glideTo: 110, glideTime: 0.15 }); S.burst({ dur: 0.2, type: 'bandpass', freq: 1500, sweepTo: 3500, gain: 0.1, dest: d }); },
    bolt({ dest }) { S.tone(380, { type: 'sine', decay: 0.4, gain: 0.08, dest: dest || buses.sfx, glideTo: 260, glideTime: 0.4 }); },
    fireLit({ dest }) {
      const d = dest || buses.sfx;
      S.burst({ dur: 0.5, type: 'lowpass', freq: 300, sweepTo: 1600, gain: 0.35, dest: d, attack: 0.05, buf: S.brown });
      for (let i = 0; i < 6; i++) S.burst({ t: ac.currentTime + 0.1 + Math.random() * 0.6, dur: 0.02, type: 'highpass', freq: 2500, gain: 0.12, dest: d });
    },
    crackle({ dest }) { S.burst({ dur: 0.015 + Math.random() * 0.02, type: 'highpass', freq: 1800 + Math.random() * 2000, gain: 0.05 + Math.random() * 0.06, dest: dest || buses.amb }); },
    eat({ dest }) { const d = dest || buses.sfx, t = ac.currentTime; for (let i = 0; i < 3; i++) S.burst({ t: t + i * 0.11, dur: 0.06, type: 'bandpass', freq: 2200, q: 1.2, gain: 0.18, dest: d }); },
    drink({ dest }) { const d = dest || buses.sfx, t = ac.currentTime; for (let i = 0; i < 3; i++) S.tone(300 + i * 40, { t: t + i * 0.16, decay: 0.1, gain: 0.12, dest: d, glideTo: 520 + i * 40, glideTime: 0.08 }); },
    heal({ dest }) { const d = dest || buses.sfx, t = ac.currentTime; [72, 76, 79].forEach((n, i) => S.bell(midi(n), { t: t + i * 0.07, decay: 0.6, gain: 0.05, dest: d })); },
    waybell({ dest }) { const d = dest || buses.sfx, t = ac.currentTime; for (let i = 0; i < 4; i++) S.bell(midi(88 + (i % 2) * 3), { t: t + i * 0.12, decay: 0.9, gain: 0.07, dest: d }); },
    fan({ dest }) { S.burst({ dur: 0.45, type: 'bandpass', freq: 400, sweepTo: 2200, q: 0.8, gain: 0.25, dest: dest || buses.sfx, attack: 0.05, buf: S.pink }); },
    holsterIn({ dest }) { S.burst({ dur: 0.06, type: 'bandpass', freq: 900, q: 2, gain: 0.12, dest: dest || buses.sfx }); S.tone(240, { decay: 0.05, gain: 0.06, dest: dest || buses.sfx }); },
    holsterOut({ dest }) { S.burst({ dur: 0.12, type: 'bandpass', freq: 1800, sweepTo: 3600, q: 3, gain: 0.08, dest: dest || buses.sfx }); },
    shard({ dest }) { S.bell(midi(96 + Math.floor(Math.random() * 3) * 2), { decay: 0.35, gain: 0.05, dest: dest || buses.sfx }); },
    item({ dest }) { const d = dest || buses.sfx, t = ac.currentTime; S.pluck(midi(79), { t, gain: 0.1, dest: d }); S.pluck(midi(84), { t: t + 0.08, gain: 0.1, dest: d }); },
    lift({ ratio = 0, dest }) { S.tone(220 + 440 * ratio, { type: 'triangle', decay: 0.06, gain: 0.05, dest: dest || buses.sfx }); },
    towerBell({ dest }) {
      const d = dest || buses.sfx, t = ac.currentTime;
      S.bell(midi(55), { t, decay: 5, gain: 0.3, dest: d, partials: [0.5, 1, 1.19, 1.56, 2.0, 2.66], amps: [0.6, 1, 0.5, 0.4, 0.35, 0.2] });
      S.bell(midi(67), { t: t + 0.02, decay: 3, gain: 0.1, dest: d });
    },
    bellSmall({ dest }) { S.bell(midi(84), { decay: 1.2, gain: 0.12, dest: dest || buses.sfx }); },
    miss({ dest }) { S.tone(300, { type: 'triangle', decay: 0.2, gain: 0.08, dest: dest || buses.sfx, glideTo: 200, glideTime: 0.18 }); },
    click({ dest }) { S.tone(1200, { type: 'sine', decay: 0.04, gain: 0.06, dest: dest || buses.sfx }); },
    tick({ dest }) { S.tone(1760, { type: 'sine', decay: 0.05, gain: 0.05, dest: dest || buses.sfx }); },
    beat({ strong = false, dest }) {
      const d = dest || buses.music, t = ac.currentTime;
      S.tone(strong ? 90 : 120, { t, decay: 0.16, gain: strong ? 0.22 : 0.12, dest: d, glideTo: 45, glideTime: 0.12 });
      if (!strong) S.burst({ t, dur: 0.04, type: 'highpass', freq: 7000, gain: 0.05, dest: d });
    },
  };
  return fx;
}
