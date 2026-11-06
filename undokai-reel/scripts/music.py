#!/usr/bin/env python3
"""Fit the BGM (Kusikos Post, TikTok "cheap & cute" version, 165 BPM) to the 30 s reel.

  0–22.0 s   the track from its first bar
  22.0 s     jump forward exactly 192 beats (69.82 s), to the same spot in the last phrase
             (chosen where the two spectra match best, so the seam is inaudible)
  28.93 s    the track's own final hit, under the end card
  29.97 s    end

Beat grid of the reel (also used by render.py): beat k at 0.204 + k * 60/165 s.

Usage: python3 music.py out.wav
"""
import os
import subprocess
import sys

import numpy as np
import pyloudnorm as pyln
from scipy import ndimage, signal
from scipy.io import wavfile

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'media_src', 'bgm_kusikos_post.mp3')

BPM, PHASE = 165.0, 0.204
BEAT = 60 / BPM
JUMP_BEAT, JUMP = 60, 192            # leave at beat 60, land 192 beats later
DUR = 899 / 30                       # 29.97 s, kept under Instagram's 30 s


def beat(k):
    return PHASE + k * BEAT


def idx(t):
    return int(round(t * SR))


def load():
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', SRC, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def onset_near(x, t, win=.04):
    h = signal.sosfilt(signal.butter(2, 1500, 'high', fs=SR, output='sos'), x.mean(axis=1))
    e = np.convolve(h ** 2, np.ones(idx(.002)) / idx(.002), mode='same')
    a, b = idx(t - win), idx(t + win)
    d = np.diff(np.log(e[a:b] + 1e-12))
    return (a + int(np.argmax(ndimage.uniform_filter1d(d, idx(.001))))) / SR - .002


def splice(x, t_out, t_in, fade=.015):
    i, j, f = idx(t_out), idx(t_in), idx(fade)
    w = np.sin(np.linspace(0, np.pi / 2, f))[:, None]
    mid = x[i - f:i] * w[::-1] + x[j - f:j] * w
    return np.concatenate([x[:i - f], mid, x[j:]])


def level(x, lufs=-14.0, ceiling_db=-1.0):
    x = x * 10 ** ((lufs - pyln.Meter(SR).integrated_loudness(x)) / 20)
    c = 10 ** (ceiling_db / 20)
    g = np.minimum(1, c / (np.abs(x).max(axis=1) + 1e-12))
    g = ndimage.uniform_filter1d(ndimage.minimum_filter1d(g, idx(.004)), idx(.004))
    return x * g[:, None]


if __name__ == '__main__':
    x = load()
    a = onset_near(x, beat(JUMP_BEAT))
    b = onset_near(x, beat(JUMP_BEAT + JUMP))
    y = splice(x, a, b)
    y = y[:idx(DUR)]
    y = np.pad(y, ((0, idx(DUR) - len(y)), (0, 0)))
    n = len(y)
    t = np.arange(n) / SR
    y *= np.clip(t / .012, 0, 1)[:, None] * np.clip((DUR - t) / .25, 0, 1)[:, None]
    y = level(y)
    out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
    wavfile.write(out, SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))
    print(f'splice {a:.3f}s -> {b:.3f}s (Δ {b - a:.3f}s); final hit at reel {beat(271 - JUMP):.3f}s; '
          f'{pyln.Meter(SR).integrated_loudness(y):.1f} LUFS -> {out}')
