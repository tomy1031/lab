#!/usr/bin/env python3
"""Score for film 01 "Invest in the Next" — 120 BPM, 50 bars (100 s), D minor resolving to F major.

Cinematic electronic: string ensemble, piano and FM-bell hook, e-piano stabs, soft four-on-the-floor.
Section boundaries match src/invest/film.js (drops at 16, 32, 56, 92 s).

Usage: python3 music_invest.py out.wav
"""
import sys
import numpy as np
from scipy.io import wavfile
from synth import (SR, idx, mtof, rng, adsr, lp, curve, place, stereo, reverb, pingpong, master, swept_lp,
                   piano, fm_bell, epiano, strings, saw, sine, soft_kick, snap, rim, shaker, swell, boom)

BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
N_BARS = 50
N = idx(N_BARS * BAR)


def bt(bar, beat=0.0):
    return bar * BAR + beat * BEAT


CH = {
    'Bb': dict(root=34, tri=[58, 62, 65, 69]), 'F': dict(root=41, tri=[57, 60, 65, 67]),
    'C': dict(root=36, tri=[55, 60, 64, 67]), 'Dm': dict(root=38, tri=[57, 62, 65, 69]),
    'Gm': dict(root=43, tri=[55, 58, 62, 65]),
}
LOOP = ['Bb', 'F', 'C', 'Dm']


def chord(b):
    if b >= 48: return 'F'
    if b == 47: return 'C'
    if b == 46: return 'Bb'
    if 24 <= b < 28: return ['Gm', 'Bb', 'F', 'C'][b - 24]
    if 42 <= b < 46: return LOOP[(b - 42) % 4]
    return LOOP[b % 4]


def section(b):
    for end, name in [(4, 'intro'), (8, 'build'), (16, 'grooveA'), (24, 'drop1'), (28, 'break'), (38, 'drop2'),
                      (42, 'grooveB'), (46, 'final'), (50, 'outro')]:
        if b < end:
            return name


GROOVE = {'grooveA', 'drop1', 'drop2', 'grooveB', 'final'}
DROP = {'drop1', 'drop2', 'final'}
GAPS = [(15.5, 16.0), (31.75, 32.0), (55.5, 56.0), (91.75, 92.0)]
HITS = [(0, .5), (8, .6), (16, .9), (32, 1.0), (56, 1.0), (92, 1.0)]


def render():
    # sidechain from kick grid
    kicks = sorted({round(bt(b, k), 4) for b in range(N_BARS) if section(b) in GROOVE for k in range(4)} |
                   {round(bt(b, k), 4) for b in range(4, 8) for k in (0, 2)})
    sc = np.ones(N)
    for k in kicks:
        i = idx(k); j = min(N, i + idx(.45)); tt = np.arange(j - i) / SR
        sc[i:j] = np.minimum(sc[i:j], 1 - .55 * np.exp(-tt * 9))

    drums = np.zeros(N)
    kick = soft_kick()
    for k in kicks:
        place(drums, kick, k, .9)
    for b in range(1, 4):                       # heartbeat in the intro
        place(drums, lp(kick, 250), bt(b), .5)
    sn, rm, sh = snap(), rim(), shaker()
    perc = np.zeros(N)
    for b in range(N_BARS):
        s = section(b)
        if s in DROP:
            place(drums, sn, bt(b, 1), .5); place(drums, sn, bt(b, 3), .5)
        elif s in GROOVE:
            place(perc, rm, bt(b, 1), .22); place(perc, rm, bt(b, 3), .22)
        if s in GROOVE:
            for k in range(16):
                place(perc, sh, bt(b, k / 4), .17 if k % 2 else .09)
        elif s == 'build':
            for k in range(8):
                place(perc, sh, bt(b, k / 2), .06 + .08 * (b - 4) / 4)

    fx = np.zeros(N)
    for start, ln in [(4, 4), (12, 3.5), (28, 3.75), (50, 5.5), (88, 3.75)]:
        place(fx, swell(ln), start, .45)
    for t0, g in HITS:
        place(fx, boom(), t0, .8 * g)

    # bass: sub on beats + short filtered saw on offbeats in grooves; long sub elsewhere
    bass = np.zeros(N)
    for b in range(N_BARS):
        s = section(b); f = mtof(CH[chord(b)]['root'])
        if s in GROOVE:
            for k in range(4):
                n = idx(.22); env = adsr(n, .004, .08, .6, .05, .18)
                body = lp(saw(f * 2, n) * .5 + saw(f * 2.005, n) * .5, 520) + sine(f, n) * 1.0
                place(bass, body * env, bt(b, k + .5), .5)
        else:
            n = idx(BAR); place(bass, sine(f, n) * adsr(n, .08, .4, .8, .3, BAR - .1), bt(b), .38 if s != 'build' else .25)
    n = idx(8); tt = np.arange(n) / SR
    place(bass, sine(mtof(41), n) * np.exp(-tt * .5) * np.minimum(1, tt / .02), bt(48), .4)

    # strings bed
    strs = np.zeros((N, 2))
    for b in range(N_BARS):
        tri = CH[chord(b)]['tri']
        ln = BAR if b < 48 else 7.5
        slow = section(b) in ('intro', 'break', 'outro')
        place(strs, strings(tri[:3] + [tri[0] - 12], ln, attack=.7 if slow else .12, release=.9, cutoff=3200), bt(b), .55)
    cut = curve([(0, 900), (8, 1800), (16, 3400), (32, 5500), (48, 2000), (56, 6000), (76, 4200), (84, 7500), (92, 7000), (100, 1800)], N)
    strs = swept_lp(strs, cut)
    strs *= curve([(0, .55), (8, .6), (15.5, .85), (16, .5), (32, .62), (48, .7), (56, .6), (76, .5), (84, .68), (92, .8), (100, 0)], N)[:, None]
    strs *= (sc ** .8)[:, None]

    # e-piano syncopated stabs in grooves
    ep = np.zeros(N)
    for b in range(N_BARS):
        if section(b) not in GROOVE:
            continue
        tri = CH[chord(b)]['tri']
        for beat in (0.5, 1.5, 2.75, 3.5):
            for m in tri:
                place(ep, epiano(m, .22, vel=.8), bt(b, beat), .09)
    ep = stereo(ep, .15) * (sc ** .5)[:, None]

    # FM-bell arpeggio (8ths) with ping-pong delay
    arp = np.zeros((N, 2))
    pat = [0, 2, 1, 3, 2, 1, 3, 2]
    for b in range(4, 46):
        s = section(b)
        if s == 'break' and b < 26:
            continue
        tri = CH[chord(b)]['tri']
        notes = [m + 12 for m in tri]
        for k in range(8):
            v = .45 + .1 * (b - 4) / 4 if s == 'build' else .55 if s in ('grooveA', 'grooveB', 'break') else .75
            place(arp, stereo(fm_bell(notes[pat[k]], .2, index=1.6, vel=v), -.4 if k % 2 else .4), bt(b, k / 2), .12)
    arp = arp + pingpong(arp, BEAT * .75, fb=.35, tone=4500) * .7

    # piano: intro motif, breakdown, outro cadence
    pn = np.zeros(N)
    motif = [(0, 69), (1, 74), (1.5, 77), (2, 76), (3, 72), (4, 74), (5, 69), (6, 65), (6.5, 67), (7, 69)]
    for rb in (0, 2):
        for beat, m in motif:
            place(pn, piano(m, .9, vel=.9), bt(rb) + beat * BEAT, .32)
    for rb in (4, 6):                           # motif carries on, an octave up, through the build
        for beat, m in motif:
            place(pn, piano(m + 12, .8, vel=.75), bt(rb) + beat * BEAT, .24)
    for rb in (24, 26):
        for beat, m in motif:
            place(pn, piano(m + (12 if beat > 3 else 0), .9, vel=.85), bt(rb) + beat * BEAT, .3)
        for m in CH[chord(rb)]['tri'][:3]:
            place(pn, piano(m - 12, 3.5, vel=.6), bt(rb), .18)
    for beat, m in [(0, 77), (1, 76), (2, 72), (4, 74), (5, 72), (6, 69)]:
        place(pn, piano(m, .9), bt(46) + beat * BEAT, .32)
    for m in (53, 57, 60, 65, 69, 72, 77):
        place(pn, piano(m, 5.0, vel=.8), bt(48), .16)
    pn = stereo(pn, .08)

    # hook: piano + bell doubling (drops and final)
    hook = np.zeros(N)
    phrase = [(0, 2, 74), (2, 2, 77), (4, 2, 81), (6, 1, 79), (7, 1, 77), (8, 3, 77), (11, 2, 72), (13, 1, 77), (14, 1, 79),
              (15, 1, 81), (16, 2, 79), (18, 2, 76), (20, 2, 74), (22, 2, 72), (24, 4, 74), (28, 2, 69), (30, 2, 74)]
    for b0 in (16, 20, 28, 32, 36, 42):
        for st, ln, m in phrase:
            if b0 == 36 and st >= 16:
                continue
            t0 = bt(b0) + st * BEAT / 2
            d = ln * BEAT / 2
            up = 12 if b0 == 42 else 0
            place(hook, piano(m + up, d * .95, vel=1.0), t0, .42)
            place(hook, fm_bell(m + up, d * .9, index=1.2, ratio=2.0, vel=.8), t0, .16)
    hook = stereo(hook, -.05)

    gap = np.ones(N)
    for a, b in GAPS:
        i, j = idx(a), idx(b); f = idx(.012)
        gap[i:j] = 0; gap[i - f:i] = np.linspace(1, 0, f)

    send = strs * .4 + arp * .5 + pn * .7 + hook * .45 + ep * .3 + stereo(fx, 0) * .35 + stereo(drums, 0) * .05
    wet = reverb(send, seconds=3.2, decay=2.0)
    dry = strs + arp + pn + hook + ep + stereo(bass * sc, 0) + stereo(drums, 0) * .85 + stereo(perc, .12) + stereo(fx, 0) * .75
    mix = dry * gap[:, None] + wet * .6
    mix *= curve([(0, .64), (8, .8), (15.5, 1.0), (16, .88), (31.9, .9), (32, 1), (48, 1), (48.01, .8), (55.9, .86), (56, 1),
                  (76, 1), (76.01, .9), (84, .9), (84.01, 1), (97, 1), (100, 0)], N)[:, None]
    return master(mix)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'invest.wav'
    m = render()
    wavfile.write(out, SR, (m * 32767).astype(np.int16))
    print(f'wrote {out}: {len(m) / SR:.1f}s')
