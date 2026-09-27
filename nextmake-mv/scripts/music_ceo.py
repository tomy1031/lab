#!/usr/bin/env python3
"""Score for film 02 「やるか、やらないか。」 — 80 BPM, 48 bars (144 s), E-flat major / C minor.

Solo piano opens; strings enter with the name card; the harmony turns from C minor to E-flat at
"ゼロから" (33 s); FM bells for "好奇心"; a quiet pulse through the proposal; a string swell into the
motto at 114 s; piano alone for the close. Bar boundaries match src/ceo/film.js.

Usage: python3 music_ceo.py out.wav
"""
import sys
import numpy as np
from scipy.io import wavfile
from synth import (SR, idx, mtof, adsr, lp, curve, place, stereo, reverb, pingpong, master,
                   piano, fm_bell, strings, sine, soft_kick, rim, shaker, swell, boom)

BPM = 80
BEAT = 60 / BPM          # 0.75 s
BAR = 4 * BEAT           # 3 s
N_BARS = 48
N = idx(N_BARS * BAR)


def bt(bar, beat=0.0):
    return bar * BAR + beat * BEAT


# chord voicings: bass root + mid triad (MIDI)
V = {
    'Cm': (36, [60, 63, 67]), 'Ab': (32, [60, 63, 68]), 'Eb': (39, [58, 63, 67]), 'Bb': (34, [58, 62, 65]),
    'Fm': (41, [60, 65, 68]), 'G': (43, [59, 62, 67]), 'Gm': (43, [58, 62, 67]),
}
PROG = ['Cm', 'Ab', 'Eb', 'Bb',                 # 0–3   cold open
        'Cm', 'Ab',                             # 4–5   name card
        'Fm', 'Cm', 'Ab', 'G', 'G',             # 6–10  ch1 (dark, ends on the dominant)
        'Eb', 'Bb', 'Cm', 'Ab',                 # 11–14 ch2 (turns to major)
        'Ab', 'Bb', 'Eb', 'Cm', 'Ab', 'Bb',     # 15–20 ch3
        'Cm', 'Ab', 'Eb', 'Bb', 'Ab', 'Bb',     # 21–26 ch4
        'Cm', 'Gm', 'Ab', 'Bb',                 # 27–30 ch5
        'Ab', 'Bb', 'Gm', 'Cm', 'Fm',           # 31–35 ch6 (IV–V–iii–vi)
        'Ab', 'Bb',                             # 36–37 montage
        'Ab', 'Bb', 'Eb',                       # 38–40 motto
        'Ab', 'Eb', 'Bb', 'Cm', 'Ab', 'Bb', 'Eb']   # 41–47 closing
assert len(PROG) == N_BARS


def sec(b):
    for end, name in [(4, 'open'), (6, 'name'), (11, 'ch1'), (15, 'ch2'), (21, 'ch3'), (27, 'ch4'), (31, 'ch5'),
                      (36, 'ch6'), (38, 'montage'), (41, 'motto'), (48, 'close')]:
        if b < end:
            return name


def render():
    pn = np.zeros(N)
    # ---- intro motif (bars 0–3), repeated an octave lower-ish under the name card
    motif = [(0, 0, 67, 1), (0, 1, 75, 1), (0, 2, 74, .5), (0, 2.5, 75, .5), (0, 3, 72, 1),
             (1, 0, 72, 1), (1, 1, 75, 1), (1, 2, 80, 2),
             (2, 0, 70, 1), (2, 1, 75, 1), (2, 2, 79, 1), (2, 3, 77, 1),
             (3, 0, 77, 2), (3, 2, 74, 1), (3, 3, 70, 1)]
    for b0 in (0, 41, 43):
        for b, beat, m, d in motif:
            if b0 == 43 and b >= 2:
                continue
            place(pn, piano(m, d * BEAT * 1.1, vel=.85), bt(b0 + b, beat), .34)
    # ---- left hand: sustained chord roots in the open, broken chords elsewhere
    for b in range(N_BARS):
        s = sec(b)
        root, tri = V[PROG[b]]
        if s == 'open':
            place(pn, piano(root + 12, BAR, vel=.55), bt(b), .22)
            continue
        if s in ('montage',):
            continue
        pattern = [0, 1, 2, 1, 0, 1, 2, 1] if s not in ('motto',) else [0, 2]
        step = 8 if s != 'motto' else 2
        vel = {'name': .5, 'ch1': .5, 'ch2': .6, 'ch3': .62, 'ch4': .62, 'ch5': .55, 'ch6': .66, 'close': .55}.get(s, .6)
        place(pn, piano(root + 12, BAR * .95, vel=vel * .9), bt(b), .15)
        for k in range(step):
            m = tri[pattern[k]]
            place(pn, piano(m, BEAT * (4 / step) * 1.4, vel=vel * .85), bt(b, k * 4 / step), .21)
    # ---- right-hand melody for ch2 (the turn to major) and the motto
    mel_ch2 = [(11, 0, 79, 2), (11, 2, 77, 1), (11, 3, 75, 1), (12, 0, 74, 2), (12, 2, 70, 2),
               (13, 0, 75, 1.5), (13, 1.5, 74, .5), (13, 2, 72, 2), (14, 0, 72, 1), (14, 1, 75, 1), (14, 2, 80, 2)]
    for b, beat, m, d in mel_ch2:
        place(pn, piano(m, d * BEAT, vel=.8), bt(b, beat), .3)
    mel_motto = [(38, 0, 75, 2), (38, 2, 77, 1), (38, 3, 79, 1), (39, 0, 80, 2), (39, 2, 79, 1), (39, 3, 77, 1), (40, 0, 79, 4)]
    for b, beat, m, d in mel_motto:
        place(pn, piano(m, d * BEAT, vel=.95), bt(b, beat), .36)
        place(pn, piano(m - 12, d * BEAT, vel=.7), bt(b, beat), .22)
    # final chord
    for m in (39, 51, 58, 63, 67, 70, 75, 79):
        place(pn, piano(m, 6, vel=.7), bt(47), .15)
    pn = stereo(pn, .05)

    # ---- strings bed
    st = np.zeros((N, 2))
    for b in range(4, N_BARS):
        s = sec(b)
        if s == 'montage':
            pass
        root, tri = V[PROG[b]]
        notes = [root + 12] + tri
        if s in ('motto', 'ch6', 'montage'):
            notes = notes + [tri[-1] + 12]
        att = .9 if s in ('name', 'ch1', 'ch5', 'close', 'motto') else .35
        place(st, strings(notes, BAR, attack=att, release=1.4, cutoff=3200), bt(b), .5)
    st *= curve([(0, 0), (12, .35), (18, .4), (27, .55), (33, .45), (45, .5), (63, .55), (78, .7), (81, .45), (93, .55),
                 (108, .85), (113.25, .9), (114, 1.0), (123, .8), (126, .45), (141, .4), (144, .0)], N)[:, None]
    # low cello line doubling roots in the dark chapter and the climax
    cello = np.zeros((N, 2))
    for b in list(range(6, 11)) + list(range(36, 41)):
        root, _ = V[PROG[b]]
        place(cello, strings([root + 12], BAR, attack=.4, release=1.0, cutoff=1200, width=.2), bt(b), .5)
    # tension swell under the ch1 quote (29–33 s)
    swell_ = np.zeros(N)
    place(swell_, swell(3.2, lo=250, hi=5000), 29.8, .3)
    place(swell_, swell(4.5, lo=250, hi=7000), 103.5, .35)
    place(swell_, swell(1.8, lo=400, hi=9000), 111.5, .35)

    # ---- bells: curiosity and dream
    bells = np.zeros((N, 2))
    pat = [0, 1, 2, 1, 2, 0, 1, 2]
    for b in list(range(15, 21)) + list(range(33, 38)):
        _, tri = V[PROG[b]]
        for k in range(8):
            m = tri[pat[k]] + 12
            place(bells, stereo(fm_bell(m, .3, index=1.3, ratio=3.0, vel=.6), .45 if k % 2 else -.45), bt(b, k / 2), .1)
    bells = bells + pingpong(bells, BEAT * .75, fb=.3, tone=5000) * .6

    # ---- bass
    bass = np.zeros(N)
    for b in range(4, N_BARS):
        s = sec(b)
        if s in ('open',):
            continue
        root, _ = V[PROG[b]]
        n = idx(BAR)
        place(bass, sine(mtof(root), n) * adsr(n, .15, .5, .8, .6, BAR - .2), bt(b), .18 if s not in ('ch4', 'ch6', 'montage', 'motto') else .27)
    n = idx(6); tt = np.arange(n) / SR
    place(bass, sine(mtof(39), n) * np.exp(-tt * .6) * np.minimum(1, tt / .05), bt(47), .35)

    # ---- percussion: gentle pulse from ch3, fuller at the montage
    dr = np.zeros(N)
    kick, rm, sh = soft_kick(), rim(), shaker()
    for b in range(15, 38):
        s = sec(b)
        if s == 'ch5':
            continue
        if s in ('ch4', 'ch6', 'montage'):
            beats = (0, 1, 2, 3) if s == 'montage' else (0, 2)
            for k in beats:
                place(dr, kick, bt(b, k), .6 if s != 'montage' else .8)
        if s in ('ch3', 'ch4', 'ch6', 'montage'):
            place(dr, rm, bt(b, 1), .12); place(dr, rm, bt(b, 3), .12)
            for k in range(8):
                place(dr, sh, bt(b, k / 2), .09 if k % 2 else .05)
    fx = np.zeros(N)
    for t0, g in [(12, .35), (33, .45), (114, .9)]:
        place(fx, boom(4.0, bright=.08), t0, g)

    # gap before the motto
    gap = np.ones(N)
    i, j = idx(113.25), idx(114.0)
    gap[i:j] = 0; gap[i - idx(.02):i] = np.linspace(1, 0, idx(.02))

    send = pn * .75 + st * .55 + cello * .4 + bells * .5 + stereo(swell_, 0) * .4 + stereo(fx, 0) * .3 + stereo(dr, 0) * .06
    wet = reverb(send, seconds=4.0, decay=1.55, tone=5500)
    dry = pn + st + cello * .8 + bells + stereo(bass, 0) + stereo(dr, 0) + stereo(swell_, 0) * .8 + stereo(fx, 0) * .7
    mix = dry * gap[:, None] + wet * .75
    mix *= curve([(0, .8), (108, 1.0), (144, 1.0)], N)[:, None]
    fade = curve([(0, 0), (.05, 1), (141, 1), (144, 0)], N)
    return master(mix * fade[:, None], lufs_gain=.86)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'ceo.wav'
    m = render()
    wavfile.write(out, SR, (m * 32767).astype(np.int16))
    print(f'wrote {out}: {len(m) / SR:.1f}s')
