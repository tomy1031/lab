// js/audio/stingers.js — short pentatonic bell/harp stingers (no background music; wind and steps lead) (§9) (OPUS-B)
import { midi, pentaNote } from './synth.js';

// [root midi, pattern of pentatonic indices, spacing s, voice]
const STING = {
  region:  [67, [0, 2, 4, 7], 0.16, 'pluck'],
  vista:   [64, [0, 4, 7, 9, 11], 0.22, 'bell'],
  bell:    [60, [0, 2, 4, 5, 7, 10], 0.18, 'bell'],
  shrine:  [65, [0, 1, 2, 4, 5, 7], 0.11, 'pluck'],
  seed:    [72, [0, 2, 4], 0.09, 'bell'],
  chest:   [69, [0, 2, 4, 5], 0.1, 'pluck'],
  dawn:    [62, [0, 2, 4, 7, 9], 0.3, 'bell'],
  quest:   [67, [0, 4, 2, 5], 0.14, 'pluck'],
  combatStart: [57, [0, 1], 0.24, 'pluck'],
  combatEnd:   [60, [2, 1, 0], 0.18, 'pluck'],
  ending:  [60, [0, 2, 4, 5, 7, 9, 10, 12], 0.26, 'bell'],
  item:    [74, [0, 2], 0.08, 'pluck'],
};

export function createStingers(S, buses) {
  return {
    play(name, gain = 1) {
      const s = STING[name];
      if (!s) return;
      const [root, pat, gap, voice] = s;
      const t0 = S.ac.currentTime + 0.02;
      pat.forEach((i, k) => {
        const f = midi(pentaNote(root, i));
        const t = t0 + k * gap;
        if (voice === 'bell') S.bell(f, { t, decay: 1.8, gain: 0.09 * gain, dest: buses.music });
        else S.pluck(f, { t, decay: 1.1, gain: 0.13 * gain, dest: buses.music });
      });
      // a soft fifth under the last note
      const last = pentaNote(root, pat[pat.length - 1]);
      S.pluck(midi(last - 12), { t: t0 + (pat.length - 1) * gap, decay: 1.6, gain: 0.07 * gain, dest: buses.music });
    },
  };
}
