"""Self-check of the final video.
1) contact sheet per student (card + each clip middle) for a visual face/name check
2) re-transcribe the final audio per student piece and print it next to the subtitles
3) loudness per section, true peak
usage: verify.py plan.json workdir final.mp4
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402

plan = json.load(open(sys.argv[1]))
work = sys.argv[2]
final = sys.argv[3]
tl = json.load(open(os.path.join(work, 'timeline.json')))
starts = tl['starts']
out = os.path.join(work, 'verify')
os.makedirs(out, exist_ok=True)

# 1) contact sheets: for each student 4 frames: card end, and middle of each clip
studs = plan['students']
for k, st in enumerate(studs):
    s0 = starts[k + 1]
    ts = [s0 + 2.6]
    t = s0 + plan['card_dur'] - 0.4
    for kk, c in enumerate(st['clips']):
        d = B.dur(os.path.join(work, f"clip_{st['id']}_{kk}.mp4"))
        ts.append(t + d / 2)
        t += d - 0.3
    tiles = []
    for i, tt in enumerate(ts):
        f = os.path.join(out, f"f_{st['id']}_{i}.jpg")
        B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-ss', f'{tt:.2f}', '-i', final, '-frames:v', '1', '-vf', 'scale=640:-2', f])
        tiles.append(f)
    while len(tiles) < 4:
        tiles.append(tiles[-1])
    B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error'] + sum([['-i', x] for x in tiles[:4]], []) +
          ['-filter_complex', '[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack', os.path.join(out, f"sheet_{st['id']}.jpg")])

# 2) re-transcribe each student's section of the final audio
wav = os.path.join(out, 'final16k.wav')
B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', final, '-ac', '1', '-ar', '16000', wav])
from wavload import load  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402
m = WhisperModel('large-v3-turbo', device='cpu', compute_type='int8', cpu_threads=4)
a = load(wav)
report = []
for k, st in enumerate(studs):
    s0, s1 = starts[k + 1], starts[k + 2]
    x = a[int(s0 * 16000):int(s1 * 16000)]
    segs, _ = m.transcribe(x, language='ja', beam_size=5, condition_on_previous_text=False, vad_filter=True)
    heard = ' '.join(s.text for s in segs)
    subs = ' / '.join(t for c in st['clips'] for _, _, t in c['subs'])
    report.append(f"[{st['id']} {st['name']}] {s0:.1f}-{s1:.1f}s ({s1 - s0:.1f}s)\n  heard: {heard}\n  subs : {subs}")
    print(report[-1], flush=True)
open(os.path.join(out, 'report.txt'), 'w').write('\n'.join(report))

# 3) loudness per section
def lufs(t0, t1):
    r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-ss', f'{t0:.2f}', '-to', f'{t1:.2f}', '-i', final, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    I = [l for l in r.splitlines() if l.strip().startswith('I:')]
    P = [l for l in r.splitlines() if l.strip().startswith('Peak:')]
    return (I[-1].split()[1] if I else '?'), (P[-1].split()[1] if P else '?')
print('title', lufs(0, starts[1]))
for k, st in enumerate(studs):
    s0, s1 = starts[k + 1], starts[k + 2]
    print(st['id'], 'card', lufs(s0 + 0.2, s0 + 2.5), 'speech', lufs(s0 + 3.2, s1 - 0.2))
print('ending', lufs(starts[-1], tl['total']))
print('whole', lufs(0, tl['total']))
