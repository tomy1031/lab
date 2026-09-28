#!/usr/bin/env python3
"""Soundtrack for film 02 (154 s): 「スイングバイ」 by のる (OpenTracks), fitted to picture.

The track is used whole except for one 4-bar repeat (31.4–38.3 s), cut on downbeats where the
material before and after is most alike. With that cut the track lines up with the film:
  45 s   first chorus lands on chapter 03 「好奇心」
  87 s   the build returns on 「是非、やってみたいです」
  96 s   the breakdown sits under chapter 05 (the six idle months)
  108 s  the final chorus enters on a photo cut in chapter 06 「夢」 and carries the epilogue, motto and name card
  153 s  the track's own ending

Usage: python3 music_ceo.py out.wav   (run fetch_music.py first)
"""
import sys

import numpy as np

import cue

DUR = 154

x = cue.load('swingby')
a, b = cue.onset_near(x, 31.35), cue.onset_near(x, 38.29)
y = cue.splice(x, a, b)
y = y[:cue.idx(DUR)]
y = np.pad(y, ((0, cue.idx(DUR) - len(y)), (0, 0)))
y *= cue.env([(0, 1), (DUR - 1.6, 1), (DUR, 0)], len(y))[:, None]

if __name__ == '__main__':
    print(f'splice {a:.3f}s -> {b:.3f}s ({b - a:.2f}s removed)')
    cue.write(sys.argv[1] if len(sys.argv) > 1 else 'ceo.wav', cue.level(y, lufs=-15.0))
