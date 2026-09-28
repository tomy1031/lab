#!/usr/bin/env python3
"""Soundtrack for the NMClaw promo (86 s): 「Future Next」 by FLASH☆BEAT (OpenTracks), fitted to picture.

  0–16 s   problem act: the track's intro, muffled behind a low-pass and pulled back
  16 s     the filter opens as the dot becomes the mic, right on the track's first drop
  16–78 s  the full track under the demo, dashboard, features and flow
  78–86 s  end card: an 8-bar jump inside the outro (downbeat to downbeat) reaches the track's own ending

Usage: python3 music_nmclaw.py out.wav   (run fetch_music.py first)
"""
import sys

import numpy as np

import cue

DUR = 86
OPEN = 16.0                      # film time of the drop

x = cue.load('future_next')
drop = cue.onset_near(x, 27.61)
a, b = cue.onset_near(x, 91.02), cue.onset_near(x, 106.02)
y = cue.splice(x, a, b)[cue.idx(drop - OPEN):]
y = y[:cue.idx(DUR)]
y = np.pad(y, ((0, cue.idx(DUR) - len(y)), (0, 0)))

n = len(y)
cut = cue.env([(0, 420), (OPEN - 1.1, 520), (OPEN - .05, 20000), (DUR, 20000)], n)
y = cue.lowpass_sweep(y, cut)
y *= cue.env([(0, 0), (.6, .5), (OPEN - 1.1, .56), (OPEN - .05, 1), (DUR - 1.4, 1), (DUR, 0)], n)[:, None]

if __name__ == '__main__':
    print(f'drop at {drop:.3f}s -> film {OPEN}s; splice {a:.3f}s -> {b:.3f}s')
    cue.write(sys.argv[1] if len(sys.argv) > 1 else 'nmclaw.wav', cue.level(y, lufs=-15.0))
