"""Small numpy synthesizer shared by the film scores (no samples, no third-party music)."""
import numpy as np
from scipy import signal

SR = 48000
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def idx(t):
    return int(round(t * SR))


# ---------------------------------------------------------------- oscillators
def polyblep(t, dt):
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
    return np.sin(2 * np.pi * (phase0 + np.cumsum(f / SR)))


def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, sus_len=None):
    t = np.arange(n) / SR
    env = np.where(t < a, t / max(a, 1e-6), 1.0)
    dec = (t >= a) & (t < a + d)
    env = np.where(dec, 1 - (1 - s) * (t - a) / max(d, 1e-6), env)
    env = np.where(t >= a + d, s, env)
    if sus_len is not None:
        lvl = np.interp(sus_len, t, env) if sus_len < t[-1] else s
        env = np.where(t >= sus_len, lvl * np.exp(-(t - sus_len) / max(r, 1e-6) * 3), env)
    return env


# ---------------------------------------------------------------- filters
def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR * .45), 'low', fs=SR, output='sos'), x, axis=0)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'high', fs=SR, output='sos'), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=0)


def swept_lp(x, cutoff, bank=(250, 450, 800, 1400, 2500, 4500, 8000, 14000)):
    """Time-varying low-pass by cross-fading a bank of static filters (click free)."""
    bank = np.array(bank, dtype=float)
    outs = [lp(x, f) for f in bank]
    pos = np.interp(np.log(np.clip(cutoff, bank[0], bank[-1])), np.log(bank), np.arange(len(bank)))
    y = np.zeros_like(x)
    for i, o in enumerate(outs):
        w = np.clip(1 - np.abs(pos - i), 0, 1)
        y += o * (w[:, None] if x.ndim == 2 else w)
    return y


# ---------------------------------------------------------------- utilities
def curve(points, n):
    ts, vs = zip(*points)
    return np.interp(np.arange(n) / SR, ts, vs)


def place(buf, sig, t, gain=1.0):
    i = idx(t)
    if i >= len(buf) or i < 0:
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def stereo(x, pan=0.0):
    return np.stack([x * np.cos((pan + 1) * np.pi / 4), x * np.sin((pan + 1) * np.pi / 4)], axis=1)


def reverb(x, seconds=2.8, decay=2.4, tone=6000, seed=3):
    """Stereo convolution reverb with a synthetic exponentially decaying noise tail."""
    r = np.random.default_rng(seed)
    n = idx(seconds)
    t = np.arange(n) / SR
    ir = r.standard_normal((n, 2)) * np.exp(-t * decay)[:, None]
    ir[:idx(.012)] *= np.linspace(0, 1, idx(.012))[:, None]      # pre-delay softening
    ir = lp(ir, tone)
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    if x.ndim == 1:
        x = stereo(x)
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], axis=1)


def pingpong(x, delay_s, fb=.38, taps=4, tone=3500):
    d = idx(delay_s)
    out = np.zeros_like(x)
    for k in range(1, taps + 1):
        sh = np.zeros_like(x)
        sh[d * k:] = x[:-d * k] * (fb ** k)
        out += sh[:, ::-1] if k % 2 else sh
    return lp(out, tone)


def master(mix, lufs_gain=.73):
    mix = hp(mix, 28)
    mix = np.tanh(mix * .9)
    mix /= np.max(np.abs(mix)) + 1e-9
    return mix * lufs_gain


# ---------------------------------------------------------------- instruments
def piano(m, dur, vel=1.0, bright=1.0):
    """Additive piano-ish tone with inharmonic partials and a soft hammer."""
    n = idx(dur + 2.2)
    t = np.arange(n) / SR
    f = mtof(m)
    y = np.zeros(n)
    for k, a in enumerate([1.0, .55, .3, .18, .1, .06, .035], start=1):
        y += a * bright ** (k - 1) * np.sin(2 * np.pi * f * k * t * (1 + .0004 * k * k)) * np.exp(-t * (.9 + .75 * k) * (1 + m / 120))
    y += hp(rng.standard_normal(n), 2500) * np.exp(-t * 140) * .03 * vel
    rel = np.where(t > dur, np.exp(-(t - dur) * 5), 1.0)
    return y * rel * np.minimum(1, t / .003) * vel


def fm_bell(m, dur, index=2.2, ratio=3.5, vel=1.0):
    """Glassy FM bell / celesta."""
    n = idx(dur + 1.6)
    t = np.arange(n) / SR
    f = mtof(m)
    env_i = index * np.exp(-t * 3)
    mod = np.sin(2 * np.pi * f * ratio * t) * env_i
    y = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.2)
    y += .25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 5)
    return y * np.minimum(1, t / .002) * vel


def epiano(m, dur, vel=1.0):
    """Rhodes-like FM electric piano with gentle tremolo."""
    n = idx(dur + 1.2)
    t = np.arange(n) / SR
    f = mtof(m)
    mod = np.sin(2 * np.pi * f * t) * (1.4 * np.exp(-t * 6) + .25)
    y = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * .9)
    y += .15 * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t * 40)       # tine click
    env = adsr(n, .004, .6, .55, .35, dur)
    return y * env * (1 + .08 * np.sin(2 * np.pi * 4.5 * t)) * vel


def strings(notes, dur, attack=.9, release=1.2, cutoff=2600, width=.8, vib=.004):
    """Ensemble strings: detuned saws, slow attack, vibrato, stereo spread."""
    n = idx(dur + release + .2)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    det = [-.09, -.03, .03, .09]
    for m in notes:
        for k, d in enumerate(det):
            lfo = 1 + vib * np.sin(2 * np.pi * (5 + k * .3) * t + k)
            s = saw(mtof(m + d) * lfo, n, phase0=rng.random())
            out += stereo(s, (k / (len(det) - 1) * 2 - 1) * width) * .08
    out = lp(out, cutoff)
    env = adsr(n, attack, .5, .9, release, dur)
    return out * env[:, None]


def sub(m, dur, a=.03):
    n = idx(dur + .3)
    return sine(mtof(m), n) * adsr(n, a, .2, .9, .25, dur)


def soft_kick():
    n = idx(.5)
    t = np.arange(n) / SR
    f = 44 + 70 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    click = lp(hp(rng.standard_normal(n), 1500), 6000) * np.exp(-t * 300) * .15
    return np.tanh((body + click) * 1.3)


def rim():
    n = idx(.25)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 1650 * t) * np.exp(-t * 60) * .5 + np.sin(2 * np.pi * 420 * t) * np.exp(-t * 45) * .6
    noise = bp(rng.standard_normal(n), 1500, 7000) * np.exp(-t * 55) * .5
    return tone + noise


def snap():
    n = idx(.4)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 1200, 6500)
    env = np.exp(-t * 170) + np.where(t > .012, np.exp(-(t - .012) * 22), 0) * .8
    return noise * env * .6


def shaker(open_=False):
    n = idx(.18 if open_ else .07)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 6500, order=4) * np.sin(np.pi * np.clip(t / (n / SR), 0, 1)) ** 2 * np.exp(-t * 18)


def swell(length, lo=300, hi=9000, tone_from=160, tone_to=900):
    """Gentle filtered-noise riser with a soft tonal sweep."""
    n = idx(length)
    t = np.arange(n) / SR
    p = t / length
    y = swept_lp(rng.standard_normal(n), lo * (hi / lo) ** p)
    y = hp(y, 180)
    tone = lp(saw(tone_from * (tone_to / tone_from) ** p, n), 3000) * .08
    return (y * .45 + tone) * p ** 2.4


def boom(length=4.0, bright=.12):
    """Low cinematic hit without a harsh crash."""
    n = idx(length)
    t = np.arange(n) / SR
    f = 32 + 45 * np.exp(-t * 5)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.2)
    air = lp(hp(rng.standard_normal(n), 900), 5000) * np.exp(-t * 2.5) * bright
    return np.tanh((b * 1.1 + air) * 1.2)
