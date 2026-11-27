"""Files for the lab site: output/self_intro_720p.mp4, output/poster.jpg, output/faces/NN.jpg, and the chapter list
written into site/self-intro.html (between <!--PEOPLE--> markers).
usage: publish_files.py plan.json workdir outdir site_html
"""
import html
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402

plan = json.load(open(sys.argv[1]))
work, outdir, page = sys.argv[2], sys.argv[3], sys.argv[4]
os.makedirs(os.path.join(outdir, 'faces'), exist_ok=True)
final = os.path.join(work, 'final.mp4')
tl = json.load(open(os.path.join(work, 'timeline.json')))

mp4 = os.path.join(outdir, 'self_intro_720p.mp4')
crf = int(os.environ.get('CRF', '24'))
B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', final, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264',
       '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', mp4])
print(mp4, round(os.path.getsize(mp4) / 1e6, 1), 'MB')
poster = os.path.join(outdir, 'poster.jpg')
B.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-ss', '3.9', '-i', final, '-frames:v', '1', '-vf', 'scale=1280:720', '-q:v', '3', poster])

items = []
for k, st in enumerate(plan['students']):
    Image.open(os.path.join(work, f"face_{st['id']}.png")).convert('RGB').resize((240, 240), Image.LANCZOS).save(
        os.path.join(outdir, 'faces', f"{st['id']}.jpg"), quality=86)
    t = tl['starts'][k + 1] + 0.1  # start of that student's name card (with its chime)
    m, s = divmod(int(t), 60)
    full = f"（{html.escape(st['full'])}）" if st.get('full') else ''
    items.append(
        f'    <li><button type="button" data-t="{t:.1f}"><img src="media/faces/{st["id"]}.jpg" alt="{html.escape(st["name"])}さんの顔" width="84" height="84" loading="lazy">'
        f'<span><span class="no">No.{st["idx"]:02d} · <span class="t">{m}:{s:02d}</span></span>'
        f'<span class="name">{html.escape(st["name"])}</span><span class="what">{html.escape(st["what"])}{full}</span></span></button></li>')
src = open(page, encoding='utf-8').read()
block = '<!--PEOPLE-->\n' + '\n'.join(items) + '\n<!--/PEOPLE-->'
if '<!--/PEOPLE-->' in src:
    src = re.sub(r'<!--PEOPLE-->.*?<!--/PEOPLE-->', lambda _: block, src, flags=re.S)
else:
    src = src.replace('<!--PEOPLE-->', block)
open(page, 'w', encoding='utf-8').write(src)
print('chapters written:', len(items))
