import wave, numpy as np, sys
w = wave.open(sys.argv[1]); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
sr = 16000; t0, t1 = float(sys.argv[2]), float(sys.argv[3]); st = 0.25
chars = ' .:-=+*#%@'
out = []
for t in np.arange(t0, t1, st):
    seg = a[int(t * sr):int((t + st) * sr)]
    db = 20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)
    out.append(chars[int(np.clip((db + 70) / 40 * 9, 0, 9))])
s = ''.join(out)
print(f"{t0:.0f}s |" + '|'.join(s[i:i + 4] for i in range(0, len(s), 4)) + f"| {t1:.0f}s  (each | = 1s)")
