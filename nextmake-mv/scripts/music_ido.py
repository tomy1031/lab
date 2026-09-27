#!/usr/bin/env python3
"""Score for the IDO (tourism DX) promo (100 s) — three cues that switch with the story.

  A  0–26 s   伝承 legend: miyako-bushi (D Eb G A Bb) koto phrases, shakuhachi, river ambience,
              taiko on each of the four meanings of IDO, a roll into silence
  B 26–66 s   旅 journey: starts on the QR chime; 96 BPM (bar 2.5 s) wa-modern in D major pentatonic —
              koto riff, nylon-string strums, soft kit, bamboo-flute melody; UI sounds on each phone action
  C 66–100 s  還る return: strings, koto arpeggios and piano, resolving to D major for the end card

Usage: python3 music_ido.py out.wav
"""
import sys
import numpy as np
from scipy.io import wavfile
from synth import (SR, idx, mtof, rng, adsr, lp, hp, curve, place, stereo, reverb, pingpong, master, swept_lp,
                   piano, fm_bell, strings, saw, sine, soft_kick, rim, shaker, swell, boom,
                   koto, shakuhachi, taiko, chime, ping, tick, ambience, pluck_guitar)

DUR = 100
N = idx(DUR)


def cue_a():
    a = np.zeros((N, 2))
    riv = ambience(16.5, 'river')
    place(a, stereo(lp(riv, 2500) * curve([(0, 0), (1.5, 1), (14, 1), (16, 0)], len(riv)), 0), 0, .3)
    wind = ambience(11.5, 'wind')
    place(a, stereo(wind * curve([(0, 0), (1.5, 1), (10, 1), (11.5, 0)], len(wind)), 0), 14.8, .35)
    place(a, strings([38, 45, 50], 15.0, attack=3.0, release=1.5, cutoff=1200, width=.6), .3, .32)
    place(a, strings([38, 45, 51], 10.0, attack=1.5, release=1.0, cutoff=1400, width=.6), 15.6, .26)
    # koto phrases (miyako-bushi on D)
    phr = [[(0, 74), (.36, 70), (.72, 69), (1.2, 67, .5), (1.9, 63, 1), (2.8, 62)],
           [(0, 69), (.3, 70), (.6, 74), (1.1, 75, 1), (1.8, 74), (2.2, 70), (2.9, 69)],
           [(0, 62), (.35, 63), (.7, 67), (1.05, 69), (1.4, 70), (1.9, 74, 1), (2.7, 75), (3.4, 74)]]
    for start, p in zip((.9, 5.6, 10.6), phr):
        for ev in p:
            t0, m = ev[0], ev[1]
            bend = ev[2] if len(ev) > 2 else 0
            place(a, stereo(koto(m, 2.8, bright=.6, bend=bend), (m - 68) / 14), start + t0, .32)
    # shakuhachi long tones
    for t0, m, d in [(2.2, 69, 2.4), (4.9, 67, 1.0), (7.0, 70, 2.2), (9.4, 69, 1.2), (12.4, 74, 2.6)]:
        place(a, stereo(shakuhachi(m, d), -.15), t0, .22)
    # taiko
    place(a, stereo(taiko(True), 0), 10.6, .38)
    for i, t0 in enumerate((16.2, 18.4, 20.6, 22.8)):
        place(a, stereo(taiko(True), 0), t0, .42)
        place(a, stereo(taiko(False), .2), t0 + 1.1, .25)
        m = [62, 67, 69, 74][i]
        place(a, stereo(koto(m, 2.2, bright=.7), -.2), t0 + .02, .3)
        place(a, stereo(koto(m + 12, 2.2, bright=.7), .2), t0 + .05, .18)
    # roll into the switch
    for k, t0 in enumerate(np.arange(24.4, 25.4, .09)):
        place(a, stereo(taiko(False), .1 if k % 2 else -.1), t0, .08 + .3 * (t0 - 24.4))
    place(a, stereo(taiko(True), 0), 25.4, .5)
    return a * curve([(0, 1), (25.9, 1), (26.2, .0), (DUR, 0)], N)[:, None]


BPM_B = 96
BEAT_B = 60 / BPM_B            # .625
BAR_B = 4 * BEAT_B             # 2.5
B0 = 26.0
CHB = {'D': (38, [62, 66, 69]), 'Bm': (35, [62, 66, 71]), 'G': (43, [62, 67, 71]), 'A': (45, [61, 64, 69])}
LOOPB = ['D', 'Bm', 'G', 'A']


def btb(bar, beat=0.0):
    return B0 + bar * BAR_B + beat * BEAT_B


def cue_b():
    b = np.zeros((N, 2))
    nb = 16
    full = lambda bar: bar >= 12          # 56–66 montage
    walk = lambda bar: 8 <= bar < 12      # 46–56
    # sidechain / kicks
    kicks = []
    for bar in range(nb):
        kicks += [btb(bar, k) for k in ((0, 1, 2, 3) if full(bar) else (0, 2))] if bar >= 2 else []
    sc = np.ones(N)
    for k in kicks:
        i = idx(k); j = min(N, i + idx(.4)); tt = np.arange(j - i) / SR
        sc[i:j] = np.minimum(sc[i:j], 1 - .45 * np.exp(-tt * 9))
    # strums (nylon) on beats 1, 2.5, 3.5
    gt = np.zeros((N, 2))
    for bar in range(nb):
        root, tri = CHB[LOOPB[bar % 4]]
        voicing = [root + 12, tri[0], tri[1], tri[2], tri[0] + 12]
        for beat in (0, 1.5, 2.5, 3.5):
            for k, m in enumerate(voicing):
                place(gt, stereo(pluck_guitar(m, 1.0, vel=.8 if beat else 1.0), (k - 2) / 5), btb(bar, beat) + k * .014, .14 if not full(bar) else .17)
    gt *= (sc ** .6)[:, None]
    # koto riff (8ths), pentatonic
    kt = np.zeros((N, 2))
    riff = [74, 76, 78, 81, 78, 76, 74, 71]
    for bar in range(nb):
        if bar < 1:
            continue
        shift = {'D': 0, 'Bm': -3, 'G': -3, 'A': -2}[LOOPB[bar % 4]]
        pent = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]
        for k in range(8):
            m = riff[k] + shift
            m = min(pent, key=lambda p: abs(p - m))
            place(kt, stereo(koto(m, 1.2, bright=.75, vel=.9), .35 if k % 2 else -.1), btb(bar, k / 2), .15 if not full(bar) else .2)
    kt = kt + pingpong(kt, BEAT_B * .75, fb=.28, tone=5000) * .5
    # bass
    bass = np.zeros(N)
    for bar in range(nb):
        root, _ = CHB[LOOPB[bar % 4]]
        for beat, d in ((0, 1.4), (2, .9), (3, .5)):
            n = idx(d * BEAT_B)
            body = sine(mtof(root), n) + lp(saw(mtof(root) * 2, n), 400) * .3
            place(bass, body * adsr(n, .01, .2, .7, .1, d * BEAT_B * .8), btb(bar, beat), (.44 if full(bar) else .38) if bar >= 2 else .24)
    # drums
    dr = np.zeros(N)
    kick, rm, sh = soft_kick(), rim(), shaker()
    for k in kicks:
        place(dr, kick, k, .75)
    for bar in range(2, nb):
        place(dr, rm, btb(bar, 1), .2); place(dr, rm, btb(bar, 3), .2)
        for k in range(8):
            place(dr, sh, btb(bar, k / 2), .1 if k % 2 else .05)
        place(dr, taiko(False), btb(bar, 0), .12 if not full(bar) else .18)
    # pad
    pad = np.zeros((N, 2))
    for bar in range(nb):
        root, tri = CHB[LOOPB[bar % 4]]
        place(pad, strings([root + 12] + tri, BAR_B, attack=.4, release=.8, cutoff=3200), btb(bar), .32 if not full(bar) else .5)
    pad *= (sc ** .8)[:, None]
    # bamboo flute melody over walk + montage
    fl = np.zeros(N)
    mel = [(0, 2, 81), (2, 1, 78), (3, 1, 76), (4, 3, 74), (7, 1, 76), (8, 2, 78), (10, 2, 81), (12, 4, 83),
           (16, 2, 81), (18, 1, 78), (19, 1, 81), (20, 3, 78), (23, 1, 76), (24, 4, 74), (28, 4, 76)]
    for b0 in (8, 12):
        for st, ln, m in mel:
            place(fl, shakuhachi(m, ln * BEAT_B / 2 * .95, vel=.9, meri=st % 8 == 0), btb(b0) + st * BEAT_B / 2, .27)
    fl = stereo(fl, -.1)
    # UI sounds
    ui = np.zeros((N, 2))
    place(ui, stereo(chime(90, 1.8), 0), 26.0, .5)            # the switch: QR chime
    place(ui, stereo(chime(95, 1.2), .2), 28.8, .4)           # scanned
    place(ui, stereo(ping(88), 0), 31.2, .25)                 # play
    place(ui, stereo(tick() * 2, 0), 38.2, .5)                # tap
    place(ui, stereo(chime(93, 1.2), .2), 38.7, .38)          # purchased
    for i in range(6):                                        # unlocks — D pentatonic up
        place(ui, stereo(fm_bell([74, 76, 78, 81, 83, 86][i], .5, index=.9, ratio=2.0), (i - 2.5) / 4), 41.9 + i * .625, .2)
    for i in range(5):                                        # story pins
        place(ui, stereo(koto([74, 76, 78, 81, 86][i], 1.2, bright=.8), (i - 2) / 3), 46.5 + i * .8, .16)
    for i in range(6):
        place(ui, stereo(ping(96 + (i % 3) * 2), 0), 47.6 + i * .42, .06)
    for t0 in (52.25, 53.5, 54.75):
        place(ui, stereo(tick(), .3), t0, .3)
    # koto glissando into cue C
    for k, m in enumerate([62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]):
        place(ui, stereo(koto(m, 2.0, bright=.8), (k - 5) / 6), 65.1 + k * .07, .12)
    mix = gt + kt + stereo(bass * sc, 0) + stereo(dr, 0) * 1.0 + pad + fl + ui
    return mix * curve([(0, 0), (25.98, 0), (26.0, 1), (65.8, 1), (67.0, .0), (DUR, 0)], N)[:, None]


def cue_c():
    c = np.zeros((N, 2))
    prog_c = [(66.0, 'G', [55, 59, 62, 67]), (69.4, 'D', [54, 57, 62, 66]), (72.8, 'Em', [52, 55, 59, 64]), (76.2, 'A', [52, 57, 61, 64]),
              (79.6, 'G', [55, 59, 62, 67]), (83.0, 'A', [57, 61, 64, 69]), (86.2, 'D', [50, 57, 62, 66, 69]), (91.0, 'D', [50, 57, 62, 66, 69])]
    for i, (t0, name, notes) in enumerate(prog_c):
        d = (prog_c[i + 1][0] - t0) if i + 1 < len(prog_c) else 9.0
        place(c, strings(notes, d, attack=1.0, release=1.6, cutoff=2600), t0, .5)
        root = {'G': 43, 'D': 38, 'Em': 40, 'A': 45}[name]
        n = idx(d); place(c, stereo(sine(mtof(root), n) * adsr(n, .3, .5, .8, .8, d - .2), 0), t0, .28)
        for k in range(8 if d > 3 else 4):
            m = notes[k % len(notes)] + 12
            place(c, stereo(koto(m, 2.0, bright=.55, vel=.8), .3 if k % 2 else -.3), t0 + k * d / 8, .1)
    # piano melody over the cycle and case
    mel = [(66.6, 74, 1.6), (68.2, 71, .8), (69.0, 69, 1.6), (70.8, 66, 1.4), (72.8, 67, 1.6), (74.4, 71, .8), (75.2, 69, 2.0),
           (79.6, 74, 1.6), (81.2, 76, .8), (82.0, 78, 1.8), (83.8, 76, 1.0), (84.8, 73, 1.2), (86.2, 74, 3.0)]
    for t0, m, d in mel:
        place(c, stereo(piano(m, d, vel=.85), .05), t0, .3)
    # end card phrase: koto + bell, final chord
    for k, m in enumerate([74, 76, 78, 81, 78, 86]):
        place(c, stereo(koto(m, 2.4, bright=.7), .2), 89.4 + k * .3, .2)
    place(c, stereo(chime(98, 2.4), 0), 90.2, .22)             # seal
    for m in (50, 57, 62, 66, 69, 74):
        place(c, stereo(piano(m, 8.0, vel=.6), 0), 91.0, .1)
    return c * curve([(0, 0), (65.4, 0), (66.2, 1), (DUR, 1)], N)[:, None]


def render():
    a, b, c = cue_a(), cue_b(), cue_c()
    send = a * .7 + b * .35 + c * .6
    wet = reverb(send, seconds=3.4, decay=1.8, tone=6000)
    mix = a + b + c + wet * .6
    mix *= curve([(0, 0), (.05, 1), (98.4, 1), (100, 0)], N)[:, None]
    return master(mix, lufs_gain=.86)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'ido.wav'
    m = render()
    wavfile.write(out, SR, (m * 32767).astype(np.int16))
    print(f'wrote {out}: {len(m) / SR:.1f}s')
