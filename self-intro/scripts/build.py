"""Build the self-introduction video from plan.json.

python3 build.py <plan.json> <workdir> [--only N,N] [--sample bgm_slug] [--style pop]
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cards import render as render_card, text_layer, font  # noqa: E402
from facecrop import tone  # noqa: E402
from refine import refine  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..'))
FPS = 30
W, H = 1920, 1080
X264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', str(FPS)]
AAC = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2']


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        print(' '.join(map(str, cmd))[:2000])
        print(r.stderr[-3000:])
        raise SystemExit(1)
    return r


def dur(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).stdout)


# ------------------------------------------------------------------ face
def make_face(st, work):
    out = os.path.join(work, f"face_{st['id']}.png")
    if os.path.exists(out):
        return Image.open(out)
    f = st['face']
    src = os.path.join(ROOT, 'dlorig', f"IMG_{st['video']}.MOV")
    full = os.path.join(work, f"facefull_{st['id']}.png")
    run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-ss', str(f['t']), '-i', src, '-frames:v', '1', full])
    fr = Image.open(full).convert('RGB')
    x, y, w, h = f['box']
    scale = f.get('scale', 2.3)
    down = f.get('down', 0.12)
    s = h * scale
    cx, cy = x + w / 2 + f.get('dx', 0) * h, y + h / 2 + down * h
    x0 = max(0, min(W - s, cx - s / 2))
    y0 = max(0, min(H - s, cy - s / 2))
    crop = fr.crop((int(x0), int(y0), int(x0 + s), int(y0 + s)))
    raw = os.path.join(work, f"faceraw_{st['id']}.png")
    crop.save(raw)
    up = os.path.join(work, f"faceup_{st['id']}.png")
    run([sys.executable, '-I', os.path.join(HERE, 'upscale.py'), os.path.join(ROOT, 'models', 'realesr-general-x4v3.pth'), raw, up])
    a = np.asarray(Image.open(up).resize((640, 640), Image.LANCZOS)).astype(np.float32) / 255
    b = np.asarray(crop.resize((640, 640), Image.LANCZOS)).astype(np.float32) / 255
    m = a * 0.75 + b * 0.25
    m = tone(m, lift=f.get('lift', 0.25), warm=f.get('warm', 0.0), sat=1.06)
    im = Image.fromarray((m * 255 + .5).astype(np.uint8))
    im.save(out)
    return im


# ------------------------------------------------------------------ card
def make_card(st, plan, work, style, dur_s=3.0):
    out = os.path.join(work, f"card_{st['id']}_{style}.mp4")
    if os.path.exists(out):
        return out
    face = make_face(st, work)
    bgp = os.path.join(work, f"facefull_{st['id']}.png")
    info = dict(face=face, name=st['name'], full=st.get('full'), idx=st['idx'], total=plan['total'],
                bg=Image.open(bgp).convert('RGB'))
    chime = os.path.join(ROOT, 'meta', 'chime.wav')
    encode_frames((render_card(style, info, i / FPS, dur_s) for i in range(int(round(dur_s * FPS)))), dur_s, out,
                  audio=chime if os.path.exists(chime) else None, delay_ms=150)
    return out


def encode_frames(frames, dur_s, out, audio=None, delay_ms=0):
    """frames: iterable of PIL RGB images (W x H). Audio: optional wav placed at delay_ms, padded with silence."""
    if audio:
        ain = ['-i', audio]
        af = ['-af', f'adelay={delay_ms}|{delay_ms},apad,aresample=48000']
    else:
        ain = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
        af = []
    p = subprocess.Popen(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                          '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-'] + ain + af + ['-t', f'{dur_s}'] + X264 + AAC + [out],
                         stdin=subprocess.PIPE)
    for fr in frames:
        p.stdin.write(fr.tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit('encode failed: ' + out)
    return out


# ------------------------------------------------------------------ subtitles (ASS)
def ass_time(t):
    t = max(0, t)
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f'{h}:{m:02d}:{s:05.2f}'


def write_ass(path, subs, offset):
    hdr = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Zen Maru Gothic,60,&H00FFFFFF,&H00FFFFFF,&H00302824,&H66000000,-1,0,0,0,100,100,2,0,1,5,2,2,80,80,58,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for s in subs:
        a, b, txt = s
        lines.append(f"Dialogue: 0,{ass_time(a - offset)},{ass_time(b - offset)},Sub,,0,0,0,,{{\\fad(120,120)}}{txt}")
    open(path, 'w').write(hdr + '\n'.join(lines) + '\n')


# ------------------------------------------------------------------ name tag (small, top-left)
def make_tag(st, work):
    out = os.path.join(work, f"tag_{st['id']}.png")
    if os.path.exists(out):
        return out
    num = text_layer(f"No.{st['idx']:02d}", font('ZenMaruGothic-Bold.ttf', 34), (120, 96, 80))
    nm = text_layer(st['name'], font('ZenMaruGothic-Bold.ttf', 46), (70, 52, 44), spacing=2)
    w = num.width + nm.width - 10
    h = max(num.height, nm.height) - 18
    im = Image.new('RGBA', (w + 20, h + 20), (0, 0, 0, 0))
    from PIL import ImageDraw, ImageFilter
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((10, 14, w + 10, h + 14), h // 2, fill=(0, 0, 0, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(6))
    im.alpha_composite(sh)
    pill = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(pill).rounded_rectangle((10, 8, w + 10, h + 8), h // 2, fill=(255, 250, 242, 235))
    im.alpha_composite(pill)
    im.alpha_composite(num, (14, 8 + (h - num.height) // 2 + 2))
    im.alpha_composite(nm, (14 + num.width - 22, 8 + (h - nm.height) // 2))
    im.save(out)
    return out


# ------------------------------------------------------------------ clip
def color_chain(cc):
    lift = cc.get('lift', 0.6)  # 0..1 strength of the shadow/midtone lift
    pts = [(0, 0), (0.12, 0.12 + 0.05 * lift), (0.3, 0.3 + 0.12 * lift), (0.55, 0.55 + 0.13 * lift),
           (0.8, 0.8 + 0.08 * lift), (1, 1)]
    curve = ' '.join(f'{a:.3f}/{min(1, b):.3f}' for a, b in pts)
    f = [f"hqdn3d=1.5:1.5:4:4", f"curves=all='{curve}'"]
    if cc.get('temp'):
        f.append(f"colortemperature=temperature={cc['temp']}:mix=0.5")
    f.append(f"eq=saturation={cc.get('sat', 1.1)}:contrast={cc.get('contrast', 1.02)}")
    f.append('unsharp=5:5:0.45')
    return ','.join(f)


def wav16(video):
    """16 kHz mono copy of a source video's sound (used for transcription and for finding speech boundaries)."""
    p = os.path.join(ROOT, 'wav', f'IMG_{video}.wav')
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', os.path.join(ROOT, 'dlorig', f'IMG_{video}.MOV'),
             '-ac', '1', '-ar', '16000', p])
    return p


def measure_lufs(src, a, b, pre):
    r = run(['ffmpeg', '-nostdin', '-hide_banner', '-ss', str(a), '-to', str(b), '-i', src, '-vn', '-af',
             pre + ',ebur128=framelog=quiet', '-f', 'null', '-'])
    for line in r.stderr.splitlines()[::-1]:
        if line.strip().startswith('I:'):
            return float(line.split()[1])
    return -30.0


def make_clip(st, k, cl, work, show_tag=True):
    out = os.path.join(work, f"clip_{st['id']}_{k}.mp4")
    if os.path.exists(out):
        return out
    src = os.path.join(ROOT, 'dlorig', f"IMG_{st['video']}.MOV")
    # snap the cut points to the real start/end of speech, so no crossfade eats the first or last syllable:
    # lead-in before the first word, and after the last word a tail that fades to silence (crossfades happen there)
    first, last_clip = k == 0, k == len(st['clips']) - 1
    r_in, r_out, on, off = refine(wav16(st['video']), cl['in'], cl['out'],
                                  lead=0.5 if first else 0.35, tail=0.75 if last_clip else 0.4)
    a, b = min(cl['in'], r_in), r_out
    fo_start = max(0.0, off + 0.05 - a)
    fo_dur = max(0.1, (b - a) - fo_start - 0.05)
    pre = (f"aresample=48000,highpass=f=90,arnndn=m={ROOT}/models/std.rnnn:mix=0.75,"
           "acompressor=threshold=-36dB:ratio=2.5:attack=8:release=250")
    lufs = measure_lufs(src, a, off, pre)
    gain = max(-10, min(30, -17.0 - lufs))
    vf = color_chain(st.get('cc', {}))
    if cl.get('zoom'):
        z = cl['zoom']  # [scale, cx, cy] in source pixels
        sc, cx, cy = z
        cw, ch = W / sc, H / sc
        x0 = max(0, min(W - cw, cx - cw / 2))
        y0 = max(0, min(H - ch, cy - ch / 2))
        vf = f"crop={cw:.0f}:{ch:.0f}:{x0:.0f}:{y0:.0f},scale={W}:{H}:flags=lanczos," + vf
    vf = f"scale={W}:{H}," + vf + f",fps={FPS},format=yuv420p"
    subs = cl.get('subs', [])
    inputs = ['-ss', str(a), '-to', str(b), '-i', src]
    fc = f"[0:v]{vf}[v0]"
    last = 'v0'
    if subs:
        ass = os.path.join(work, f"sub_{st['id']}_{k}.ass")
        write_ass(ass, subs, a)
        fc += f";[{last}]ass={ass}:fontsdir={ROOT}/fonts[v1]"
        last = 'v1'
    if show_tag:
        tag = make_tag(st, work)
        inputs += ['-i', tag]
        fc += f";[{last}][1:v]overlay=40:36[v2]"
        last = 'v2'
    fc += (f";[0:a]{pre},volume={gain:.2f}dB,alimiter=limit=0.89:level=false,"
           f"afade=t=in:d=0.12,afade=t=out:st={fo_start:.3f}:d={fo_dur:.3f},aformat=channel_layouts=stereo[a0]")
    run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error'] + inputs + ['-filter_complex', fc, '-map', f'[{last}]', '-map', '[a0]']
        + X264 + AAC + [out])
    return out


# ------------------------------------------------------------------ joining with crossfades
def xfade_join(parts, out, fades):
    """parts: list of mp4 paths; fades: list of crossfade durations (len = len(parts)-1)."""
    if os.path.exists(out):
        return out
    ds = [dur(p) for p in parts]
    inputs = []
    for p in parts:
        inputs += ['-i', p]
    fc = []
    vlast, alast = '0:v', '0:a'
    t = ds[0]
    for i in range(1, len(parts)):
        fd = fades[i - 1]
        off = t - fd
        fc.append(f"[{vlast}][{i}:v]xfade=transition=fade:duration={fd}:offset={off:.3f}[vx{i}]")
        fc.append(f"[{alast}][{i}:a]acrossfade=d={fd}:c1=tri:c2=tri[ax{i}]")
        vlast, alast = f'vx{i}', f'ax{i}'
        t = off + ds[i]
    run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error'] + inputs +
        ['-filter_complex', ';'.join(fc), '-map', f'[{vlast}]', '-map', f'[{alast}]'] + X264 + AAC + [out])
    return out


def student_piece(st, plan, work, style):
    out = os.path.join(work, f"piece_{st['id']}_{style}.mp4")
    if os.path.exists(out):
        return out
    card = make_card(st, plan, work, style, plan.get('card_dur', 3.0))
    clips = [make_clip(st, k, cl, work) for k, cl in enumerate(st['clips'])]
    parts = [card] + clips
    fades = [0.4] + [0.3] * (len(clips) - 1)
    return xfade_join(parts, out, fades)


# ------------------------------------------------------------------ BGM
def bgm_mix(video, out, bgm, segments, total, levels=(-5.0, -17.0), loop_from=0.0):
    """segments: list of (start, end, 'loud'|'soft'). Builds a volume envelope and mixes BGM under the video audio."""
    loud, soft = levels
    # envelope keyframes in dB
    keys = []
    for s, e, kind in segments:
        lv = loud if kind == 'loud' else soft
        keys.append((s, lv))
        keys.append((e, lv))
    keys.sort()
    # piecewise-linear interpolation with 0.5s ramps implied by keyframe spacing
    expr_parts = []
    for (t0, d0), (t1, d1) in zip(keys, keys[1:]):
        if t1 <= t0:
            continue
        expr_parts.append((t0, t1, d0, d1))
    # build as a sampled gain curve file instead of a giant expression
    sr = 100
    n = int(total * sr) + 1
    g = np.full(n, soft, dtype=np.float32)
    for t0, t1, d0, d1 in expr_parts:
        i0, i1 = int(t0 * sr), int(t1 * sr)
        g[i0:i1 + 1] = np.linspace(d0, d1, max(1, i1 - i0 + 1))
    # smooth ramps
    k = np.ones(50) / 50
    g = np.convolve(np.pad(g, (25, 24), mode='edge'), k, mode='valid')
    lin = 10 ** (g / 20)
    env = os.path.join(os.path.dirname(out), 'bgm_env.npy')
    np.save(env, lin)
    # render bgm (looped, normalized to -16 LUFS) to wav, apply envelope in numpy
    tmpw = os.path.join(os.path.dirname(out), 'bgm_raw.wav')
    run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-stream_loop', '-1', '-ss', str(loop_from), '-i', bgm, '-t', f'{total + 1:.2f}',
         '-af', 'aresample=48000,loudnorm=I=-16:TP=-2:LRA=11', '-ac', '2', '-ar', '48000', tmpw])
    import wave
    w = wave.open(tmpw)
    raw = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32).reshape(-1, 2) / 32768
    t = np.arange(raw.shape[0]) / 48000
    gain = np.interp(t, np.arange(n) / sr, lin)
    # fade out at the end
    fo = np.clip((total - t) / 3.0, 0, 1)
    fi = np.clip(t / 1.0, 0, 1)
    y = raw * (gain * fo * fi)[:, None]
    envw = os.path.join(os.path.dirname(out), 'bgm_env.wav')
    ww = wave.open(envw, 'w')
    ww.setnchannels(2)
    ww.setsampwidth(2)
    ww.setframerate(48000)
    ww.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    ww.close()
    run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', video, '-i', envw, '-filter_complex',
         '[0:a][1:a]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.93:level=false[a]',
         '-map', '0:v', '-map', '[a]', '-c:v', 'copy'] + AAC + ['-movflags', '+faststart', out])
    return out
