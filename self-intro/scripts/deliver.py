"""Make the files to hand over: full video (1080p), lighter 720p, and one short file per student.
usage: deliver.py plan.json workdir outdir
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402

plan = json.load(open(sys.argv[1]))
work, outdir = sys.argv[2], sys.argv[3]
os.makedirs(os.path.join(outdir, '1人ずつ'), exist_ok=True)
final = os.path.join(work, 'final.mp4')
tl = json.load(open(os.path.join(work, 'timeline.json')))
starts = tl['starts']

full = os.path.join(outdir, 'じこしょうかい_全員_1080p.mp4')
B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', final, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
       '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', full])
small = os.path.join(outdir, 'じこしょうかい_全員_720p（共有用）.mp4')
B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', final, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264',
       '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', small])

tmpd = os.path.join(work, 'single')
os.makedirs(tmpd, exist_ok=True)
cd = plan.get('card_dur', 3.0)
for k, st in enumerate(plan['students']):
    piece = os.path.join(work, f"piece_{st['id']}_note.mp4")
    d = B.dur(piece)
    mixed = os.path.join(tmpd, f"mix_{st['id']}.mp4")
    B.bgm_mix(piece, mixed, os.path.join(work, 'bgm_long.wav'), [(0, cd - 0.35, 'loud'), (cd + 0.15, d - 0.6, 'soft')], d,
              loop_from=k * 23.0)
    o = os.path.join(outdir, '1人ずつ', f"{st['idx']:02d}_{st['name'].replace(' ', '')}.mp4")
    B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', mixed,
           '-vf', f'fade=t=out:st={d - 0.45:.3f}:d=0.45', '-af', f'afade=t=out:st={d - 0.6:.3f}:d=0.6',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
           '-movflags', '+faststart', o])
    print(o, round(B.dur(o), 1))
for f in [full, small]:
    print(f, round(B.dur(f), 1), round(os.path.getsize(f) / 1e6, 1), 'MB')
