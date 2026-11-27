"""Render the whole self-introduction video. usage: make_all.py plan.json workdir [ids...]"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402
from cards import render_title, render_ending  # noqa: E402
from PIL import Image  # noqa: E402

STYLE = 'note'
TITLE_DUR = 4.5
END_DUR = 7.0
FADE = 0.5

plan = json.load(open(sys.argv[1]))
work = sys.argv[2]
only = set(sys.argv[3:])
os.makedirs(work, exist_ok=True)
studs = [s for s in plan['students'] if not only or s['id'] in only]

pieces = []
for st in studs:
    p = B.student_piece(st, plan, work, STYLE)
    print('piece', st['id'], st['name'], round(B.dur(p), 2), flush=True)
    pieces.append(p)
if only:
    sys.exit(0)

title = os.path.join(work, 'title.mp4')
if not os.path.exists(title):
    group = Image.open(os.path.join(B.ROOT, 'dlphoto', 'IMG_1207.jpg')).convert('RGB').crop((280, 396, 1800, 1536))
    n = int(round(TITLE_DUR * B.FPS))
    B.encode_frames((render_title(group, plan['total'], i / B.FPS, TITLE_DUR) for i in range(n)), TITLE_DUR, title)

ending = os.path.join(work, 'ending.mp4')
if not os.path.exists(ending):
    faces = [Image.open(os.path.join(work, f"face_{s['id']}.png")).convert('RGB') for s in plan['students']]
    names = [s['name'] for s in plan['students']]
    n = int(round(END_DUR * B.FPS))
    B.encode_frames((render_ending(faces, names, i / B.FPS, END_DUR) for i in range(n)), END_DUR, ending)

parts = [title] + pieces + [ending]
joined = B.xfade_join(parts, os.path.join(work, 'joined.mp4'), [FADE] * (len(parts) - 1))
total = B.dur(joined)

# timeline (start of each part in the joined video)
starts, t = [], 0.0
for i, p in enumerate(parts):
    starts.append(t)
    t += B.dur(p) - (FADE if i < len(parts) - 1 else 0)
segs = [(0, TITLE_DUR - 0.4, 'loud')]
cd = plan.get('card_dur', 3.0)
for st, s0, p in zip(studs, starts[1:-1], pieces):
    segs.append((s0, s0 + cd - 0.35, 'loud'))
    segs.append((s0 + cd + 0.15, s0 + B.dur(p) - 0.6, 'soft'))
segs.append((starts[-1] + 0.2, total, 'loud'))
json.dump({'starts': starts, 'parts': parts, 'total': total, 'ids': [s['id'] for s in studs]},
          open(os.path.join(work, 'timeline.json'), 'w'), indent=1)

bgm = os.path.join(work, 'bgm_long.wav')
if not os.path.exists(bgm):
    src = os.path.join(B.ROOT, 'music_src', 'pastel_house.mp3')
    d = B.dur(src)
    body = d - 2.0  # drop the tail (final chord / silence) before looping
    B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', src, '-i', src, '-i', src, '-filter_complex',
           f'[0:a]atrim=0:{body}[a0];[1:a]atrim=0:{body}[a1];[a0][a1]acrossfade=d=2.5:c1=qsin:c2=qsin[x];[x][2:a]acrossfade=d=2.5:c1=qsin:c2=qsin[y]',
           '-map', '[y]', '-ar', '48000', '-ac', '2', bgm])
final = os.path.join(work, 'final.mp4')
B.bgm_mix(joined, final, bgm, segs, total)
print('final', final, round(B.dur(final), 2))
