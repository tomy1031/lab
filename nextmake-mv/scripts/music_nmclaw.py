#!/usr/bin/env python3
"""Score for the NMClaw promo (86 s) — three cues that switch with the story.

  A  0–16 s   "problem": clock ticks, notification pings, low drone, dissonant piano stabs → silence
  B 16–76 s   "demo": 120 BPM bright tech-pop in F major (I–V–vi–IV); builds with each UI step;
              every token that lands in a card plays a rising scale note
  C 76–86 s   "end card": warm Fmaj9 resolve, slow hook on piano + bell

Usage: python3 music_nmclaw.py out.wav
"""
import sys
import numpy as np
from scipy.io import wavfile
from synth import (SR, idx, mtof, rng, adsr, lp, hp, curve, place, stereo, reverb, pingpong, master, swept_lp,
                   piano, fm_bell, epiano, strings, saw, sine, soft_kick, snap, rim, shaker, swell, boom,
                   chime, ping, buzz, tick)

DUR = 86
N = idx(DUR)
BEAT = .5
B0 = 16.0                      # cue B starts here, on its bar grid


def bt(bar, beat=0.0):         # bar/beat in cue B
    return B0 + bar * 2 + beat * BEAT


CH = {'F': (41, [60, 65, 69, 72]), 'C': (36, [60, 64, 67, 72]), 'Dm': (38, [62, 65, 69, 74]), 'Bb': (34, [58, 62, 65, 70])}
LOOP = ['F', 'C', 'Dm', 'Bb']


def cue_a():
    a = np.zeros((N, 2))
    # drone
    n = idx(16)
    t = np.arange(n) / SR
    dr = sine(mtof(26), n) * .5 + lp(saw(mtof(38), n) * .5 + saw(mtof(38) * 1.006, n) * .5, 260) * .6
    dr *= np.minimum(1, t / 3) * (1 + .15 * np.sin(2 * np.pi * .25 * t))
    place(a, stereo(dr, 0), 0, .28)
    cl = strings([62, 63, 69], 15.2, attack=4, release=.3, cutoff=1400, width=.9)
    place(a, cl, .3, .18)
    # clock
    for k in range(1, 31):
        place(a, stereo(tick(), .3 if k % 2 else -.3), k * .5, .35 if k % 4 == 0 else .2)
    # notifications (match the fragments popping up)
    notes = [88, 91, 93, 96, 90, 95]
    for i in range(18):
        t0 = .15 + i * .2
        place(a, stereo(ping(notes[i % len(notes)]), (i % 5) / 2.5 - .8), t0, .12)
        if i % 4 == 1:
            place(a, stereo(buzz(.3), .2), t0 + .05, .25)
    # stabs on each problem
    for t0 in (4.0, 7.5, 11.0):
        for m in (38, 39, 45, 50, 51):
            place(a, stereo(piano(m, 1.6, vel=.9), 0), t0, .2)
        place(a, stereo(boom(3.0, bright=.05), 0), t0, .32)
    # heartbeat pulse
    k = lp(soft_kick(), 220)
    for t0 in np.arange(4.0, 14.5, 1.0):
        place(a, stereo(k, 0), t0, .28)
    place(a, stereo(swell(2.9, lo=300, hi=8000), 0), 12.55, .5)
    g = curve([(0, 1), (15.44, 1), (15.46, 0), (DUR, 0)], N)
    return a * g[:, None]


def cue_b():
    b = np.zeros((N, 2))
    nb = 30                                            # bars 16–76
    # sidechain
    kicks = []
    for bar in range(nb):
        s = bar_section(bar)
        if s in ('hear',):
            kicks += [bt(bar, 0), bt(bar, 2)]
        elif s in ('sort', 'dash', 'feat') or (s == 'flow' and bar < 28):
            kicks += [bt(bar, k) for k in range(4)]
    sc = np.ones(N)
    for k in kicks:
        i = idx(k); j = min(N, i + idx(.4)); tt = np.arange(j - i) / SR
        sc[i:j] = np.minimum(sc[i:j], 1 - .5 * np.exp(-tt * 10))
    # pads
    pad = np.zeros((N, 2))
    for bar in range(nb):
        root, tri = CH[LOOP[bar % 4]]
        pad_notes = [root + 12] + tri[:3]
        place(pad, strings(pad_notes, 2.0, attack=.2 if bar else .8, release=.6, cutoff=3800), bt(bar), .42)
    pad *= curve([(0, 0), (16, .7), (32, .75), (44, .85), (68, .8), (76, .6), (78, 0), (DUR, 0)], N)[:, None]
    pad *= (sc ** .8)[:, None]
    # e-piano stabs
    ep = np.zeros(N)
    for bar in range(4, nb):
        _, tri = CH[LOOP[bar % 4]]
        for beat in (.5, 1.5, 2.75, 3.5):
            for m in tri[:3]:
                place(ep, epiano(m, .2, vel=.8), bt(bar, beat), .085)
    ep = stereo(ep, .15) * (sc ** .5)[:, None]
    # bell arpeggio
    arp = np.zeros((N, 2))
    pat = [0, 1, 2, 3, 2, 1, 2, 3]
    for bar in range(nb):
        s = bar_section(bar)
        _, tri = CH[LOOP[bar % 4]]
        sub_div = 16 if s in ('sort', 'dash', 'feat') else 8
        for k in range(sub_div):
            m = tri[pat[k % 8]] + 12
            v = .5 if s == 'voice' else .65
            place(arp, stereo(fm_bell(m, .16, index=1.4, ratio=3.5, vel=v), .4 if k % 2 else -.4), bt(bar, k * 4 / sub_div), .09 if sub_div == 16 else .11)
    arp = arp + pingpong(arp, .375, fb=.3, tone=5000) * .5
    arp *= curve([(0, 0), (16, 1), (72, 1), (76, .6), (77, 0), (DUR, 0)], N)[:, None]
    # bass
    bass = np.zeros(N)
    for bar in range(nb):
        s = bar_section(bar)
        root, _ = CH[LOOP[bar % 4]]
        f = mtof(root)
        if s in ('sort', 'dash', 'feat', 'flow'):
            for k in range(4):
                n = idx(.22); body = lp(saw(f * 2, n), 500) * .5 + sine(f, n)
                place(bass, body * adsr(n, .004, .08, .6, .05, .18), bt(bar, k + .5), .42)
        else:
            n = idx(2.0); place(bass, sine(f, n) * adsr(n, .05, .3, .8, .2, 1.9), bt(bar), .3)
    # drums
    dr = np.zeros(N)
    kick, sn, rm, sh = soft_kick(), snap(), rim(), shaker()
    for k in kicks:
        place(dr, kick, k, .85)
    for bar in range(nb):
        s = bar_section(bar)
        if s in ('dash', 'feat'):
            place(dr, sn, bt(bar, 1), .45); place(dr, sn, bt(bar, 3), .45)
        elif s in ('sort', 'hear') or (s == 'flow' and bar < 28):
            place(dr, rm, bt(bar, 1), .2); place(dr, rm, bt(bar, 3), .2)
        if s != 'voice' and bar < 29:
            for k in range(8):
                place(dr, sh, bt(bar, k / 2), .12 if k % 2 else .06)
    # hook (dashboard + features)
    hook = np.zeros(N)
    phrase = [(0, 2, 77), (2, 1, 79), (3, 1, 81), (4, 2, 84), (6, 2, 81), (8, 3, 79), (11, 1, 76), (12, 4, 79),
              (16, 2, 74), (18, 1, 77), (19, 1, 81), (20, 3, 79), (23, 1, 77), (24, 4, 77), (28, 4, 74)]
    for b0 in (14, 18, 22):                            # 44 s, 52 s, 60 s
        for st, ln, m in phrase:
            t0 = bt(b0) + st * BEAT / 2
            place(hook, piano(m, ln * BEAT / 2 * .95, vel=.9), t0, .3)
            place(hook, fm_bell(m, ln * BEAT / 2 * .9, index=1.0, ratio=2.0, vel=.7), t0, .12)
    hook = stereo(hook, -.05)
    # UI sounds on the grid
    ui = np.zeros((N, 2))
    place(ui, stereo(chime(93, 1.6), 0), 16.0, .5)          # the dot becomes the mic
    for t0 in (24.8, 26.8, 28.4):
        place(ui, stereo(ping(90 if t0 != 26.8 else 86), .3 if t0 != 26.8 else -.3), t0, .3)
    for i, t0 in enumerate([33.0, 34.0, 35.0, 36.0, 37.0, 38.0]):     # tokens land: F G A C D F
        place(ui, stereo(fm_bell([77, 79, 81, 84, 86, 89][i], .5, index=1.1, ratio=2.0), (i - 2.5) / 4), t0, .22)
    place(ui, stereo(chime(88, 1.2), .4), 50.5, .35)                  # alert toast
    for i in range(6):
        place(ui, stereo(ping(84 + [0, 2, 4, 7, 9, 12][i]), 0), 60 + i * 1.3, .1)
    for i in range(5):
        place(ui, stereo(fm_bell(72 + [0, 2, 4, 7, 9][i], .6, index=.9, ratio=2.0), 0), 68.6 + i, .16)
    place(ui, stereo(swell(2.0, lo=400, hi=9000), 0), 74.0, .3)
    # typing clicks while the transcript appears
    for k in range(40):
        place(ui, stereo(tick() * .5, .1), 18.0 + k * .11, .08)

    mix = pad + ep + arp + stereo(bass * sc, 0) + stereo(dr, 0) * .9 + hook + ui
    g = curve([(0, 0), (15.99, 0), (16.0, 1), (75.6, 1), (77.2, 0), (DUR, 0)], N)
    return mix * g[:, None]


def bar_section(bar):
    t = B0 + bar * 2
    for end, name in [(24, 'voice'), (32, 'hear'), (44, 'sort'), (56, 'dash'), (68, 'feat'), (76, 'flow')]:
        if t < end:
            return name
    return 'end'


def cue_c():
    c = np.zeros((N, 2))
    fmaj9 = [41, 53, 57, 60, 64, 67, 69]
    place(c, strings([53, 57, 60, 64, 67], 9.0, attack=1.2, release=1.5, cutoff=3000), 75.8, .5)
    for m in fmaj9:
        place(c, stereo(piano(m, 8.0, vel=.6), 0), 76.0, .12)
    motif = [(0, 77), (1, 79), (2, 81), (3, 84), (5, 81), (6, 79), (8, 77)]
    for k, m in motif:
        place(c, stereo(piano(m, 1.2, vel=.8), .1), 76.6 + k * .5, .26)
        place(c, stereo(fm_bell(m + 12, .8, index=.8, ratio=2.0, vel=.6), -.2), 76.6 + k * .5, .07)
    place(c, stereo(chime(96, 2.2), 0), 79.2, .3)
    n = idx(9.5); tt = np.arange(n) / SR
    place(c, stereo(sine(mtof(29), n) * np.exp(-tt * .35) * np.minimum(1, tt / .5), 0), 76.0, .35)
    return c


def render():
    a, b, c = cue_a(), cue_b(), cue_c()
    send = a * .5 + b * .4 + c * .7
    wet = reverb(send, seconds=3.0, decay=2.0, tone=6000)
    mix = a + b + c + wet * .55
    mix *= curve([(0, 0), (.05, 1), (84.6, 1), (86, 0)], N)[:, None]
    return master(mix, lufs_gain=.74)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'nmclaw.wav'
    m = render()
    wavfile.write(out, SR, (m * 32767).astype(np.int16))
    print(f'wrote {out}: {len(m) / SR:.1f}s')
