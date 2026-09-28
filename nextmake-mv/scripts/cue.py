"""Small toolkit for fitting a licensed music track to picture: decode, find downbeats, splice, filter, level.

Used by music_ceo.py and music_nmclaw.py (run fetch_music.py first).
"""
import os
import subprocess

import numpy as np
import pyloudnorm as pyln
from scipy import ndimage, signal

SR = 48000
SRC = os.path.join(os.path.dirname(__file__), '..', 'music_src')


def idx(t):
    return int(round(t * SR))


def load(slug):
    path = os.path.join(SRC, slug + '.mp3')
    if not os.path.exists(path):
        raise SystemExit(f'{path} is missing — run scripts/fetch_music.py first')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def onset_near(x, t, win=.05):
    """Time of the sharpest energy rise within ±win of t (a drum hit on the downbeat), minus 2 ms."""
    h = signal.sosfilt(signal.butter(2, 1500, 'high', fs=SR, output='sos'), x.mean(axis=1))
    e = np.convolve(h ** 2, np.ones(idx(.002)) / idx(.002), mode='same')
    a, b = idx(t - win), idx(t + win)
    d = np.diff(np.log(e[a:b] + 1e-12))
    return (a + int(np.argmax(ndimage.uniform_filter1d(d, idx(.001))))) / SR - .002


def splice(x, t_out, t_in, fade=.012):
    """Jump from t_out to t_in (both on downbeats) with a short equal-power crossfade."""
    i, j, f = idx(t_out), idx(t_in), idx(fade)
    w = np.sin(np.linspace(0, np.pi / 2, f))[:, None]
    mid = x[i - f:i] * w[::-1] + x[j - f:j] * w
    return np.concatenate([x[:i - f], mid, x[j:]])


def lowpass_sweep(x, cutoff):
    """Time-varying low-pass: cross-fade a bank of static filters (click free). cutoff: Hz per sample."""
    bank = np.array([220, 330, 500, 750, 1100, 1700, 2600, 4000, 6500, 11000, 20000], float)
    pos = np.interp(np.log(np.clip(cutoff, bank[0], bank[-1])), np.log(bank), np.arange(len(bank)))
    y = np.zeros_like(x)
    for k, fc in enumerate(bank):
        w = np.clip(1 - np.abs(pos - k), 0, 1)
        if not w.any():
            continue
        band = x if fc >= 20000 else signal.sosfiltfilt(signal.butter(2, fc, 'low', fs=SR, output='sos'), x, axis=0)
        y += band * w[:, None]
    return y


def env(points, n):
    ts, vs = zip(*points)
    return np.interp(np.arange(n) / SR, ts, vs)


def level(x, lufs=-15.0, ceiling_db=-1.0):
    """Normalise integrated loudness, then keep peaks under the ceiling with a smooth look-ahead limiter."""
    x = x * 10 ** ((lufs - pyln.Meter(SR).integrated_loudness(x)) / 20)
    c = 10 ** (ceiling_db / 20)
    g = np.minimum(1, c / (np.abs(x).max(axis=1) + 1e-12))
    g = ndimage.minimum_filter1d(g, idx(.004))
    g = ndimage.uniform_filter1d(g, idx(.004))
    return x * g[:, None]


def write(path, x):
    from scipy.io import wavfile
    wavfile.write(path, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    print(f'wrote {path}: {len(x) / SR:.1f}s, {pyln.Meter(SR).integrated_loudness(x):.1f} LUFS')
