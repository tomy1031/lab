#!/usr/bin/env python3
"""Original BGM for the NEXTMAKE MV — synthesized from scratch with numpy.

120 BPM, 50 bars (100 s). Every section boundary lands on the bar grid that
src/index.html uses for its cuts, so picture and music hit together.

Usage: python3 make_music.py out.wav
"""
import sys
import numpy as np
from scipy import signal

SR = 48000
BPM = 120
BEAT = 60 / BPM          # 0.5 s
BAR = BEAT * 4           # 2.0 s
N_BARS = 50
DUR = N_BARS * BAR       # 100 s
N = int(DUR * SR)
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bar_t(b, beat=0.0):
    return b * BAR + beat * BEAT


def idx(t):
    return int(round(t * SR))


# ---------------------------------------------------------------- oscillators
def polyblep(t, dt):
    """PolyBLEP residual for a naive saw (dt is per-sample phase increment)."""
    out = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    out[m] = 2 * x - x * x - 1
    m2 = t > 1 - dt
    x = (t[m2] - 1) / dt[m2]
    out[m2] = x * x + 2 * x + 1
    return out


def saw(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = np.ascontiguousarray(f / SR)
    ph = (phase0 + np.cumsum(dt)) % 1.0
    return 2 * ph - 1 - polyblep(ph, dt)


def sine(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = phase0 + np.cumsum(f / SR)
    return np.sin(2 * np.pi * ph)


def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, sus_len=None):
    """Envelope of n samples; release starts at sus_len (seconds) if given."""
    t = np.arange(n) / SR
    env = np.ones(n)
    env = np.where(t < a, t / max(a, 1e-6), env)
    dec = (t >= a) & (t < a + d)
    env = np.where(dec, 1 - (1 - s) * (t - a) / max(d, 1e-6), env)
    env = np.where(t >= a + d, s, env)
    if sus_len is not None:
        rel = t >= sus_len
        start_level = np.interp(sus_len, t, env) if sus_len < t[-1] else s
        env = np.where(rel, start_level * np.exp(-(t - sus_len) / max(r, 1e-6) * 3), env)
    return env


def lp(x, fc, order=2):
    sos = signal.butter(order, min(fc, SR * 0.45), 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def swept_lp(x, cutoff_curve, bank=(250, 450, 800, 1400, 2500, 4500, 8000, 14000)):
    """Time-varying low-pass by cross-fading a bank of static filters (click free)."""
    bank = np.array(bank, dtype=float)
    outs = [lp(x, f) for f in bank]
    lc = np.log(np.clip(cutoff_curve, bank[0], bank[-1]))
    lb = np.log(bank)
    pos = np.interp(lc, lb, np.arange(len(bank)))
    y = np.zeros_like(x)
    for i, o in enumerate(outs):
        w = np.clip(1 - np.abs(pos - i), 0, 1)
        y += o * (w[:, None] if x.ndim == 2 else w)
    return y


def curve(points, n=N):
    """Piecewise-linear automation from [(time_s, value), ...]."""
    ts, vs = zip(*points)
    return np.interp(np.arange(n) / SR, ts, vs)


def place(buf, sig, t, gain=1.0):
    i = idx(t)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def stereo(x, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l, x * r], axis=1)


# ---------------------------------------------------------------- harmony
# D minor: Bb | F | C | Dm  (VI - III - VII - i), resolving to F major at the end.
CHORDS = {
    'Bb': dict(root=34, tri=[58, 62, 65], arp=[58, 62, 65, 70, 74, 77]),
    'F':  dict(root=41, tri=[57, 60, 65], arp=[57, 60, 65, 69, 72, 77]),
    'C':  dict(root=36, tri=[55, 60, 64], arp=[55, 60, 64, 67, 72, 76]),
    'Dm': dict(root=38, tri=[57, 62, 65], arp=[57, 62, 65, 69, 74, 77]),
    'Gm': dict(root=43, tri=[55, 58, 62], arp=[55, 58, 62, 67, 70, 74]),
}
LOOP = ['Bb', 'F', 'C', 'Dm']


def chord_at(bar):
    if bar >= 48:
        return 'F'
    if bar == 47:
        return 'C'
    if bar == 46:
        return 'Bb'
    if 24 <= bar < 28:  # breakdown: Gm Bb F C
        return ['Gm', 'Bb', 'F', 'C'][bar - 24]
    if 42 <= bar < 46:  # final chorus restarts the loop so the lead lines up
        return LOOP[(bar - 42) % 4]
    return LOOP[bar % 4]


# ---------------------------------------------------------------- sections
def section(bar):
    if bar < 4:
        return 'intro'
    if bar < 8:
        return 'build'
    if bar < 16:
        return 'grooveA'
    if bar < 24:
        return 'drop1'
    if bar < 28:
        return 'break'
    if bar < 38:
        return 'drop2'
    if bar < 42:
        return 'grooveB'
    if bar < 46:
        return 'final'
    return 'outro'


KICK_BARS = [b for b in range(N_BARS) if section(b) in ('grooveA', 'drop1', 'drop2', 'grooveB', 'final')]
DROP_BARS = [b for b in range(N_BARS) if section(b) in ('drop1', 'drop2', 'final')]
IMPACTS = [0.0, 8.0, 16.0, 32.0, 56.0, 92.0]
GAPS = [(15.5, 16.0), (31.75, 32.0), (55.5, 56.0), (91.75, 92.0)]  # silence before hits


# ---------------------------------------------------------------- instruments
def make_kick():
    n = idx(0.45)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t * 400) * 0.35
    return np.tanh((body + click) * 1.6)


def make_clap():
    n = idx(0.5)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5000)
    env = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        env += np.where(t >= off, np.exp(-(t - off) * (180 if k < 2 else 16)), 0)
    tone = np.sin(2 * np.pi * 200 * t) * np.exp(-t * 30) * 0.3
    return (noise * env + tone) * 0.7


def make_hat(open_=False):
    n = idx(0.35 if open_ else 0.08)
    t = np.arange(n) / SR
    noise = hp(rng.standard_normal(n), 7000 if not open_ else 6000, order=4)
    return noise * np.exp(-t * (11 if open_ else 70))


def make_impact():
    n = idx(4.0)
    t = np.arange(n) / SR
    f = 30 + 60 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.3)
    crash = hp(rng.standard_normal(n), 2500) * np.exp(-t * 1.8) * 0.28
    body = lp(rng.standard_normal(n), 400) * np.exp(-t * 3) * 0.6
    return np.tanh((boom * 1.2 + crash + body) * 1.3)


def make_riser(length):
    n = idx(length)
    t = np.arange(n) / SR
    prog = t / length
    noise = rng.standard_normal(n)
    cut = 300 * (40 ** prog)
    sw = swept_lp(noise, cut)
    sw = hp(sw, 200)
    tone = saw(180 * (8 ** prog), n) * 0.12
    tone = lp(tone, 5000)
    env = prog ** 2.2
    return (sw * 0.55 + tone) * env


def make_snare_roll(length):
    """16ths then 32nds, crescendo."""
    out = np.zeros(idx(length) + idx(0.3))
    hit_n = idx(0.18)
    th = np.arange(hit_n) / SR
    t = 0.0
    while t < length - 1e-6:
        prog = t / length
        step = BEAT / 4 if prog < 0.5 else BEAT / 8
        s = bp(rng.standard_normal(hit_n), 1200, 7000) * np.exp(-th * 30)
        s += np.sin(2 * np.pi * 190 * th) * np.exp(-th * 40) * 0.5
        place(out, s, t, 0.15 + 0.85 * prog ** 1.5)
        t += step
    return out


def pluck(m, dur, bright=1.0):
    n = idx(dur + 0.3)
    t = np.arange(n) / SR
    f = mtof(m)
    x = saw(f, n) * 0.6 + saw(f * 1.004, n) * 0.4
    fenv = 400 + 5200 * bright * np.exp(-t * 14)
    # 3-band cross-fade approximating a filter envelope
    y = swept_lp(x, fenv, bank=(400, 900, 2000, 4500, 9000))
    return y * np.exp(-t * 9)


def piano(m, dur):
    n = idx(dur + 1.8)
    t = np.arange(n) / SR
    f = mtof(m)
    y = np.zeros(n)
    for k, a in enumerate([1.0, 0.5, 0.28, 0.16, 0.09, 0.05], start=1):
        y += a * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k * k)) * np.exp(-t * (1.4 + 0.9 * k))
    hammer = hp(rng.standard_normal(n), 2000) * np.exp(-t * 120) * 0.05
    return (y + hammer) * np.minimum(1, t / 0.004)


def lead_note(m, dur):
    n = idx(dur + 0.35)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) * 4, 0, 1)
    f = mtof(m) * vib
    x = saw(f * 0.997, n) + saw(f * 1.003, n) + 0.5 * saw(f * 2, n)
    x = lp(x, 5200)
    env = adsr(n, a=0.008, d=0.18, s=0.65, r=0.25, sus_len=dur)
    return x * env * 0.3


# ---------------------------------------------------------------- tracks
def render():
    L = np.zeros((N, 2))
    t_all = np.arange(N) / SR

    # --- sidechain envelope (kick on every beat of groove bars)
    sc = np.ones(N)
    kick_times = []
    for b in KICK_BARS:
        for beat in range(4):
            kick_times.append(bar_t(b, beat))
    # half-time pulse in build
    for b in range(4, 8):
        kick_times.append(bar_t(b, 0))
        kick_times.append(bar_t(b, 2))
    # heartbeat in intro
    heart = [bar_t(b, 0) for b in range(1, 4)] + [bar_t(b, 0.5) for b in range(1, 4)]
    kick_times = sorted(set(round(k, 4) for k in kick_times))
    for kt in kick_times:
        i = idx(kt)
        j = min(N, i + idx(0.45))
        tt = np.arange(j - i) / SR
        sc[i:j] = np.minimum(sc[i:j], 1 - 0.7 * np.exp(-tt * 9))

    # --- drums
    drums = np.zeros(N)
    kick = make_kick()
    for kt in kick_times:
        place(drums, kick, kt, 0.95)
    for ht in heart:
        place(drums, lp(kick, 300), ht, 0.55)

    clap = make_clap()
    hat_c, hat_o = make_hat(False), make_hat(True)
    hats = np.zeros(N)
    for b in range(N_BARS):
        sec = section(b)
        if sec in ('grooveA', 'drop1', 'drop2', 'grooveB', 'final'):
            place(drums, clap, bar_t(b, 1), 0.55)
            place(drums, clap, bar_t(b, 3), 0.55)
            for s in range(8):
                g = 0.22 if s % 2 else 0.13
                place(hats, hat_c, bar_t(b, s * 0.5), g)
            if sec in ('drop1', 'drop2', 'final'):
                for beat in range(4):
                    place(hats, hat_o, bar_t(b, beat + 0.5), 0.2)
        elif sec == 'build':
            for s in range(8):
                place(hats, hat_c, bar_t(b, s * 0.5), 0.08 + 0.1 * (b - 4) / 4)

    # --- risers / rolls / impacts
    fx = np.zeros(N)
    for start, length in [(4.0, 4.0), (12.0, 4.0), (28.0, 4.0), (50.0, 6.0), (88.0, 4.0)]:
        place(fx, make_riser(length), start, 0.5)
    for start, length in [(14.0, 2.0), (30.0, 2.0), (52.0, 4.0), (90.0, 2.0)]:
        place(drums, make_snare_roll(length), start, 0.45)
    imp = make_impact()
    for it in IMPACTS:
        place(fx, imp, it, 0.9 if it > 0 else 0.6)

    # --- bass (offbeat 8ths + sub on beat) in groove sections
    bass = np.zeros(N)
    for b in range(N_BARS):
        sec = section(b)
        root = CHORDS[chord_at(b)]['root']
        f = mtof(root)
        if sec in ('grooveA', 'drop1', 'drop2', 'grooveB', 'final'):
            for beat in range(4):
                n = idx(0.24)
                tt = np.arange(n) / SR
                note = saw(f * 2, n) * 0.6 + saw(f * 2.01, n) * 0.4
                note = lp(note, 900 if sec not in ('grooveA', 'grooveB') else 600)
                note += sine(f, n) * 0.9
                place(bass, note * adsr(n, 0.004, 0.08, 0.7, 0.05, 0.2), bar_t(b, beat + 0.5),
                      0.47 if sec in ('grooveA', 'grooveB') else 0.55)
        elif sec in ('break', 'outro', 'build'):
            n = idx(BAR)
            tt = np.arange(n) / SR
            sub = sine(f, n) * adsr(n, 0.05, 0.4, 0.8, 0.3, BAR - 0.1)
            place(bass, sub, bar_t(b), 0.45 if sec != 'build' else 0.3)
    # final ring-out on F
    n = idx(8.0)
    tt = np.arange(n) / SR
    place(bass, sine(mtof(41), n) * np.exp(-tt * 0.5) * np.minimum(1, tt / 0.02), bar_t(48), 0.45)

    # --- supersaw pad
    pad = np.zeros((N, 2))
    detunes = [-0.18, -0.11, -0.05, 0.0, 0.05, 0.11, 0.18]
    for b in range(N_BARS):
        tri = CHORDS[chord_at(b)]['tri']
        length = BAR if b < 48 else 8.0
        n = idx(length + 0.6)
        v = np.zeros((n, 2))
        for m in tri + [tri[0] - 12]:
            for k, d in enumerate(detunes):
                pan = (k / (len(detunes) - 1)) * 1.6 - 0.8
                s = saw(mtof(m + d), n, phase0=rng.random())
                v += stereo(s, pan) * 0.06
        env = adsr(n, 0.25 if section(b) in ('intro', 'break', 'outro') else 0.03, 0.3, 0.85, 0.5, length)
        place(pad, v * env[:, None], bar_t(b))
    pad_cut = curve([(0, 350), (8, 1100), (16, 2600), (32, 3200), (32.01, 6000), (48, 6000), (48.01, 1200),
                     (56, 4500), (56.01, 6500), (76, 6500), (76.01, 3500), (84, 4000), (84.01, 8000),
                     (92, 8000), (100, 1500)])
    pad = swept_lp(pad, pad_cut)
    pad_gain = curve([(0, 0.45), (16, 0.42), (32, 0.66), (48, 0.66), (48.01, 0.55), (56, 0.66), (76, 0.6),
                      (76.01, 0.5), (84, 0.5), (84.01, 0.7), (92, 0.7), (92.01, 0.85), (100, 0.0)])
    pad *= pad_gain[:, None]

    # --- arp (16ths)
    arp = np.zeros((N, 2))
    pattern = [0, 2, 1, 3, 2, 4, 3, 5, 4, 3, 2, 4, 1, 3, 2, 1]
    for b in range(4, 46):
        sec = section(b)
        if sec == 'break' and b < 26:
            continue
        notes = CHORDS[chord_at(b)]['arp']
        for s in range(16):
            m = notes[pattern[s]]
            sig = pluck(m, BEAT / 4, bright=0.6 if sec in ('build', 'break') else 1.0)
            pan = -0.35 if s % 2 == 0 else 0.35
            place(arp, stereo(sig, pan), bar_t(b, s / 4), 0.16 if s % 4 == 0 else 0.11)
    arp_cut = curve([(8, 700), (16, 3000), (32, 6000), (48, 1200), (56, 6000), (100, 6000)])
    arp = swept_lp(arp, arp_cut)
    # ping-pong dotted-8th delay
    d = idx(BEAT * 0.75)
    delayed = np.zeros_like(arp)
    fb = arp.copy()
    for k in range(1, 5):
        sh = np.zeros_like(arp)
        sh[d * k:] = fb[:-d * k] * (0.38 ** k)
        if k % 2:
            sh = sh[:, ::-1]
        delayed += sh
    arp = arp + lp(delayed, 3500) * 0.8

    # --- piano motif (intro, break, outro)
    pn = np.zeros(N)
    motif = [(0, 69), (1, 74), (1.5, 77), (2, 76), (3, 72), (4, 74), (5, 69), (6, 65), (6.5, 67), (7, 69)]
    for rep_bar in (0, 2):
        for beat, m in motif:
            place(pn, piano(m, 0.8), bar_t(rep_bar) + beat * BEAT, 0.33)
    for rep_bar in (24, 26):
        for beat, m in motif:
            place(pn, piano(m + 12 if beat > 3 else m, 0.8), bar_t(rep_bar) + beat * BEAT, 0.3)
    for beat, m in [(0, 77), (1, 76), (2, 72), (4, 74), (5, 72), (6, 69), (8, 65), (8, 69), (8, 72), (8, 77)]:
        place(pn, piano(m, 2.5 if beat == 8 else 0.8), bar_t(46) + beat * BEAT, 0.34)
    pn = stereo(pn, 0.1)

    # --- lead melody (drops + final)
    lead = np.zeros(N)
    phrase = [  # (start in 8ths within 4-bar loop, len in 8ths, midi)
        (0, 2, 74), (2, 2, 77), (4, 2, 81), (6, 1, 79), (7, 1, 77),
        (8, 3, 77), (11, 2, 72), (13, 1, 77), (14, 1, 79), (15, 1, 81),
        (16, 2, 79), (18, 2, 76), (20, 2, 74), (22, 2, 72),
        (24, 4, 74), (28, 2, 69), (30, 2, 74),
    ]
    loop_starts = sorted(set([16, 20, 28, 32, 36, 42]))
    for b0 in loop_starts:
        for st, ln, m in phrase:
            t0 = bar_t(b0) + st * BEAT / 2
            if t0 >= bar_t(46):
                continue
            if b0 == 36 and st >= 16:
                continue  # drop2 is 10 bars: cut the loop tail
            up = 12 if b0 == 42 else 0
            place(lead, lead_note(m + up, ln * BEAT / 2 * 0.92), t0, 0.5 if up else 0.55)
            if up:
                place(lead, lead_note(m, ln * BEAT / 2 * 0.92), t0, 0.35)
    lead = stereo(lead, -0.05)

    # --- sidechain & gaps
    pad *= sc[:, None] ** 0.9
    arp *= sc[:, None] ** 0.6
    bass_sc = bass * sc
    gap = np.ones(N)
    for a, b in GAPS:
        i, j = idx(a), idx(b)
        gap[i:j] = 0.0
        # short fade in/out around the gap
        f = idx(0.01)
        gap[i - f:i] = np.linspace(1, 0, f)

    # --- reverb bus
    ir_n = idx(2.6)
    tt = np.arange(ir_n) / SR
    ir = rng.standard_normal((ir_n, 2)) * np.exp(-tt * 2.6)[:, None]
    ir = lp(ir, 6000)
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    send = pad * 0.35 + arp * 0.45 + pn * 0.6 + lead * 0.35 + stereo(fx, 0) * 0.3 + stereo(drums * 0.08, 0)
    wet = np.stack([signal.fftconvolve(send[:, c], ir[:, c])[:N] for c in range(2)], axis=1)

    mix = (pad + arp * 1.0 + pn + lead + stereo(bass_sc, 0) + stereo(drums, 0) * 0.9 +
           stereo(hats, 0.15) + stereo(fx, 0) * 0.8) * gap[:, None] + wet * 0.55

    mix = hp(mix, 28)
    # section dynamics so the drops land harder than intro / breakdown
    dyn = curve([(0, 0.62), (8, 0.7), (15.5, 0.8), (16, 0.88), (31.9, 0.9), (32, 1.0), (48, 1.0), (48.01, 0.78),
                 (55.9, 0.85), (56, 1.0), (76, 1.0), (76.01, 0.9), (84, 0.9), (84.01, 1.0), (100, 1.0)])
    mix *= dyn[:, None]
    # gentle glue: soft clip then normalize
    mix = np.tanh(mix * 0.9)
    fade = curve([(0, 0), (0.02, 1), (97, 1), (100, 0)])
    mix *= fade[:, None]
    mix /= np.max(np.abs(mix)) + 1e-9
    return mix * 0.73  # ≈ -14 LUFS integrated (streaming loudness)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'bgm.wav'
    mix = render()
    from scipy.io import wavfile
    wavfile.write(out, SR, (mix * 32767).astype(np.int16))
    print(f'wrote {out}: {len(mix)/SR:.1f}s')


if __name__ == '__main__':
    main()
