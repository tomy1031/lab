"""The soft two-note chime played when a name card appears. usage: chime.py out.wav"""
import sys
import wave

import numpy as np

sr = 48000
n = int(1.6 * sr)
t = np.arange(n) / sr


def bell(f, start, amp):
    tt = np.clip(t - start, 0, None)
    env = np.exp(-tt * 4.5) * (1 - np.exp(-tt * 400))
    s = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 6) \
        + 0.15 * np.sin(2 * np.pi * f * 5.4 * tt) * np.exp(-tt * 10)
    return (t >= start) * env * s * amp


y = bell(1318.5, 0.0, 0.5) + bell(1760.0, 0.11, 0.42)  # E6 then A6
rng = np.random.default_rng(1)
ir = rng.standard_normal(int(0.5 * sr)) * np.exp(-np.arange(int(0.5 * sr)) / sr * 9)
ir /= np.abs(ir).sum() / 6
y = y + 0.25 * np.convolve(y, ir)[:n]  # a touch of room
y = y / np.abs(y).max() * 10 ** (-16 / 20)
w = wave.open(sys.argv[1], 'w')
w.setnchannels(2)
w.setsampwidth(2)
w.setframerate(sr)
w.writeframes((np.stack([y, y], 1) * 32767).astype(np.int16).tobytes())
w.close()
