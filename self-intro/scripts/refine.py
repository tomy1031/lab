"""Snap clip in/out points to real speech boundaries using the audio energy (16 kHz wav).
refine(wav, in, out, tail) -> (new_in, new_out, speech_on, speech_off)
- speech_on: first speech onset at/after in-0.25; new_in leaves ~0.35 s of lead-in (not reaching into earlier speech)
- speech_off: end of the speech run that contains out-0.3 (a gap of >= 0.22 s ends it), searched up to out+0.9
- new_out = speech_off + tail (the part after speech_off is faded to silence by the caller)
"""
import wave
import numpy as np

_cache = {}


def env(path):
    if path not in _cache:
        w = wave.open(path)
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        hop = 160  # 10 ms
        n = len(a) // hop
        e = 20 * np.log10(np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
        _cache[path] = e
    return _cache[path]


def refine(path, t_in, t_out, lead=0.35, tail=0.45):
    e = env(path)
    fr = lambda t: int(round(t * 100))
    w0, w1 = fr(max(0, t_in - 3)), fr(t_out + 3)
    win = e[w0:w1]
    thr = max(np.percentile(win, 20) + 12, np.percentile(win, 95) - 32)
    sp = e > thr
    # onset
    i = fr(t_in - 0.25)
    while i < fr(t_out) and not sp[i:i + 3].all():
        i += 1
    on = i / 100
    # earlier speech end before onset (do not reach into it)
    j = i - 1
    while j > fr(on - 1.5) and not sp[j]:
        j -= 1
    prev_end = (j + 1) / 100 if sp[j] else on - 1.5
    new_in = max(on - lead, prev_end + 0.08)
    # offset: from out-0.3, walk forward until a silence of >= 0.22 s
    k = fr(t_out - 0.3)
    lim = fr(t_out + 0.9)
    off = None
    while k < lim:
        if not sp[k:k + 22].any():
            off = k / 100
            break
        k += 1
    if off is None:
        off = t_out + 0.1
    return round(new_in, 2), round(off + tail, 2), round(on, 2), round(off, 2)
