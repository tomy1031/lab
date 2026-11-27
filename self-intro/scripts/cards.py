"""Name cards for the self-introduction video (PIL). render(style, info, t) -> RGB PIL image 1920x1080.

info: dict(face=PIL.Image (square), name=str, full=str|None, idx=int, total=int, bg=PIL.Image|None)
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageEnhance

W, H = 1920, 1080
FD = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fonts')


def font(name, size, wght=None):
    f = ImageFont.truetype(os.path.join(FD, name), size)
    if wght is not None:
        try:
            f.set_variation_by_axes([wght])
        except Exception:
            pass
    return f


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_back(x, s=1.6):
    x = clamp(x)
    x -= 1
    return x * x * ((s + 1) * x + s) + 1


def circle_mask(size, ss=4):
    m = Image.new('L', (size * ss, size * ss), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * ss - 1, size * ss - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def rrect_mask(w, h, r, ss=4):
    m = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * ss - 1, h * ss - 1), r * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def paste_scaled(base, im, cx, cy, scale, mask=None, alpha=1.0):
    if scale <= 0.01 or alpha <= 0.01:
        return
    w, h = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im2 = im.resize((w, h), Image.LANCZOS)
    if mask is None:
        mask = im2.getchannel('A') if im2.mode == 'RGBA' else Image.new('L', (w, h), 255)
    else:
        mask = mask.resize((w, h), Image.LANCZOS)
    if alpha < 1:
        mask = mask.point(lambda v: int(v * alpha))
    base.paste(im2.convert('RGB'), (int(cx - w / 2), int(cy - h / 2)), mask)


def text_layer(text, fnt, fill, stroke=0, stroke_fill=None, pad=20, spacing=0):
    """Render text to an RGBA image tightly (supports letter spacing)."""
    tmp = ImageDraw.Draw(Image.new('L', (1, 1)))
    chars = list(text)
    widths = [tmp.textlength(c, font=fnt) for c in chars]
    tw = int(sum(widths) + spacing * max(0, len(chars) - 1)) + pad * 2
    asc, desc = fnt.getmetrics()
    th = asc + desc + pad * 2
    im = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = pad
    for c, w in zip(chars, widths):
        d.text((x, pad), c, font=fnt, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
        x += w + spacing
    return im


def reveal_up(base, layer, x, y, p, rise=40):
    """Paste layer at (x,y) top-left, revealed by rising from below a mask line, p in 0..1."""
    if p <= 0:
        return
    e = ease_out(p)
    dy = int((1 - e) * rise)
    a = layer.getchannel('A').point(lambda v: int(v * clamp(p * 1.6)))
    lay = layer.copy()
    lay.putalpha(a)
    # clip to the box [y, y+h]
    crop_h = layer.height - dy
    if crop_h <= 0:
        return
    part = lay.crop((0, 0, layer.width, crop_h))
    base.paste(part, (int(x), int(y + dy)), part)


# ----------------------------------------------------------------- style A: pastel pop
PASTELS = [(255, 214, 201), (204, 236, 222), (206, 226, 250), (255, 236, 179), (232, 214, 245)]


def style_pop(info, t, dur):
    rnd = random.Random(info['idx'] * 7 + 3)
    accent = PASTELS[info['idx'] % len(PASTELS)]
    accent2 = PASTELS[(info['idx'] + 2) % len(PASTELS)]
    img = Image.new('RGB', (W, H), (255, 250, 242))
    d = ImageDraw.Draw(img, 'RGBA')
    # drifting soft circles
    for k in range(9):
        r = rnd.randint(60, 260)
        x0 = rnd.randint(-100, W + 100)
        y0 = rnd.randint(-100, H + 100)
        col = PASTELS[rnd.randint(0, len(PASTELS) - 1)]
        dx = math.sin(t * 0.6 + k) * 14
        dy = math.cos(t * 0.5 + k * 1.7) * 10 - t * 6
        d.ellipse((x0 + dx - r, y0 + dy - r, x0 + dx + r, y0 + dy + r), fill=col + (150,))
    # dotted band
    for i in range(0, W, 38):
        for j in range(0, 3):
            d.ellipse((i + j * 19 - 4, 940 + j * 26 - 4, i + j * 19 + 4, 940 + j * 26 + 4), fill=accent2 + (200,))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    # face
    fs = 560
    face = info['face'].resize((fs, fs), Image.LANCZOS)
    ring = Image.new('RGBA', (fs + 60, fs + 60), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse((0, 0, fs + 59, fs + 59), fill=accent + (255,))
    rd.ellipse((14, 14, fs + 45, fs + 45), fill=(255, 255, 255, 255))
    ring.paste(face, (30, 30), circle_mask(fs))
    # shadow
    sh = Image.new('RGBA', (fs + 140, fs + 140), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((40, 55, fs + 100, fs + 115), fill=(120, 90, 60, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(22))
    p = ease_back((t - 0.05) / 0.55)
    base = img.convert('RGBA')
    if p > 0:
        sc = 0.6 + 0.4 * p
        paste_scaled(base, sh, 560, 545, sc, alpha=clamp(t / 0.3))
        paste_scaled(base, ring, 560, 530, sc, alpha=clamp(t / 0.25))
    # texts
    tag = text_layer(f"じこしょうかい  No.{info['idx']:02d}", font('ZenMaruGothic-Bold.ttf', 40), (120, 96, 80))
    pill = Image.new('RGBA', (tag.width + 30, tag.height - 6), (0, 0, 0, 0))
    ImageDraw.Draw(pill).rounded_rectangle((0, 0, pill.width - 1, pill.height - 1), pill.height // 2, fill=(255, 255, 255, 235))
    pill.paste(tag, (15, -3), tag)
    reveal_up(base, pill, 960, 300, (t - 0.35) / 0.4, 24)
    name = info['name']
    nsize = 190 if len(name) <= 4 else (160 if len(name) <= 6 else 130)
    nl = text_layer(name, font('ZenMaruGothic-Bold.ttf', nsize), (70, 52, 44), stroke=0, spacing=6)
    reveal_up(base, nl, 950, 380, (t - 0.5) / 0.45, 50)
    # underline that draws
    lp = ease_out((t - 0.8) / 0.5)
    if lp > 0:
        dd = ImageDraw.Draw(base)
        lw = int((nl.width - 40) * lp)
        dd.rounded_rectangle((975, 380 + nl.height - 8, 975 + lw, 380 + nl.height + 6), 7, fill=accent)
    if info.get('full'):
        fl = text_layer(info['full'], font('ZenMaruGothic-Medium.ttf', 54), (130, 110, 98), spacing=3)
        reveal_up(base, fl, 960, 380 + nl.height + 30, (t - 0.9) / 0.45, 24)
    return base.convert('RGB')


# ----------------------------------------------------------------- style B: simple on blurred video
def style_simple(info, t, dur):
    bg = info.get('bg')
    if bg is None:
        bg = Image.new('RGB', (W, H), (40, 40, 44))
    zoom = 1.06 + 0.02 * t / max(dur, 1e-3)
    b = bg.resize((int(W * zoom), int(H * zoom)), Image.BILINEAR)
    b = b.crop(((b.width - W) // 2, (b.height - H) // 2, (b.width - W) // 2 + W, (b.height - H) // 2 + H))
    b = b.filter(ImageFilter.GaussianBlur(28))
    b = ImageEnhance.Brightness(b).enhance(0.45)
    base = b.convert('RGBA')
    # face rounded square with white border
    fs = 520
    face = info['face'].resize((fs, fs), Image.LANCZOS)
    card = Image.new('RGBA', (fs + 24, fs + 24), (255, 255, 255, 255))
    card.putalpha(rrect_mask(fs + 24, fs + 24, 44))
    card.paste(face, (12, 12), rrect_mask(fs, fs, 34))
    p = ease_out((t - 0.05) / 0.6)
    if p > 0:
        sh = Image.new('RGBA', (fs + 160, fs + 160), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((60, 80, fs + 100, fs + 120), 50, fill=(0, 0, 0, 120))
        sh = sh.filter(ImageFilter.GaussianBlur(30))
        paste_scaled(base, sh, 600 - (1 - p) * 60, 545, 1.0, alpha=p)
        paste_scaled(base, card, 600 - (1 - p) * 60, 530, 0.94 + 0.06 * p, alpha=p)
    d = ImageDraw.Draw(base)
    lab = text_layer(f"SELF INTRODUCTION  {info['idx']:02d} / {info['total']:02d}", font('Montserrat[wght].ttf', 34, 600), (255, 255, 255, 210), spacing=6)
    reveal_up(base, lab, 960, 330, (t - 0.35) / 0.4, 20)
    name = info['name']
    nsize = 180 if len(name) <= 4 else (150 if len(name) <= 6 else 124)
    nl = text_layer(name, font('NotoSansJP[wght].ttf', nsize, 700), (255, 255, 255), spacing=8)
    reveal_up(base, nl, 960, 390, (t - 0.5) / 0.45, 60)
    lp = ease_out((t - 0.75) / 0.6)
    if lp > 0:
        d.rectangle((982, 390 + nl.height + 4, 982 + int(140 * lp), 390 + nl.height + 10), fill=(255, 196, 92))
    if info.get('full'):
        fl = text_layer(info['full'], font('NotoSansJP[wght].ttf', 50, 400), (235, 235, 235), spacing=4)
        reveal_up(base, fl, 960, 390 + nl.height + 34, (t - 0.85) / 0.45, 24)
    return base.convert('RGB')


# ----------------------------------------------------------------- style C: notebook / polaroid
def style_note(info, t, dur):
    img = Image.new('RGB', (W, H), (250, 246, 236))
    d = ImageDraw.Draw(img)
    for x in range(0, W, 48):
        d.line((x, 0, x, H), fill=(226, 232, 240), width=2)
    for y in range(0, H, 48):
        d.line((0, y, W, y), fill=(226, 232, 240), width=2)
    d.line((150, 0, 150, H), fill=(245, 190, 190), width=3)
    base = img.convert('RGBA')
    fs = 500
    face = info['face'].resize((fs, fs), Image.LANCZOS)
    pol = Image.new('RGBA', (fs + 60, fs + 140), (255, 255, 255, 255))
    pol.paste(face, (30, 30))
    # tape
    tape = Image.new('RGBA', (220, 64), (255, 214, 140, 190))
    tape = tape.rotate(-8, expand=True, resample=Image.BICUBIC)
    pol.paste(tape, ((pol.width - tape.width) // 2, -18), tape)
    pol2 = Image.new('RGBA', (pol.width + 80, pol.height + 80), (0, 0, 0, 0))
    sh = Image.new('RGBA', pol2.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle((48, 56, pol.width + 40, pol.height + 48), fill=(80, 60, 40, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(16))
    pol2.alpha_composite(sh)
    pol2.alpha_composite(pol, (40, 40))
    p = ease_back((t - 0.05) / 0.6, 1.2)
    ang = -5 + (1 - clamp(p)) * -10
    rot = pol2.rotate(ang, expand=True, resample=Image.BICUBIC)
    if p > 0:
        paste_scaled(base, rot, 600, 540 + (1 - clamp(p)) * 80, 0.85 + 0.15 * p, alpha=clamp(t / 0.3))
    name = info['name']
    nsize = 180 if len(name) <= 4 else (150 if len(name) <= 6 else 124)
    # label: the pill from style A ("じこしょうかい No.XX")
    tag = text_layer(f"じこしょうかい  No.{info['idx']:02d}", font('ZenMaruGothic-Bold.ttf', 40), (120, 96, 80))
    pill = Image.new('RGBA', (tag.width + 34, tag.height - 2), (0, 0, 0, 0))
    pdr = ImageDraw.Draw(pill)
    pdr.rounded_rectangle((0, 0, pill.width - 1, pill.height - 1), (pill.height - 1) // 2, fill=(255, 255, 255, 240),
                          outline=(232, 220, 204, 255), width=3)
    pill.paste(tag, (17, -1), tag)
    reveal_up(base, pill, 975, 290, (t - 0.35) / 0.4, 24)
    nl = text_layer(name, font('KleeOne-SemiBold.ttf', nsize), (40, 50, 90), spacing=6)
    reveal_up(base, nl, 970, 380, (t - 0.55) / 0.45, 40)
    lp = ease_out((t - 0.85) / 0.6)
    if lp > 0:
        dd = ImageDraw.Draw(base, 'RGBA')
        x0, y0 = 990, 380 + nl.height - 10
        pts = [(x0 + i, y0 + math.sin(i / 22) * 6) for i in range(0, int((nl.width - 30) * lp), 4)]
        if len(pts) > 1:
            dd.line(pts, fill=(250, 150, 150, 230), width=10, joint='curve')
    if info.get('full'):
        fl = text_layer(info['full'], font('KleeOne-SemiBold.ttf', 52), (100, 100, 120), spacing=2)
        reveal_up(base, fl, 975, 380 + nl.height + 30, (t - 0.95) / 0.45, 20)
    return base.convert('RGB')


STYLES = {'pop': style_pop, 'simple': style_simple, 'note': style_note}


def render(style, info, t, dur=3.0):
    return STYLES[style](info, t, dur)


# ----------------------------------------------------------------- opening / ending (notebook style)
def notebook_bg():
    img = Image.new('RGB', (W, H), (250, 246, 236))
    d = ImageDraw.Draw(img)
    for x in range(0, W, 48):
        d.line((x, 0, x, H), fill=(226, 232, 240), width=2)
    for y in range(0, H, 48):
        d.line((0, y, W, y), fill=(226, 232, 240), width=2)
    d.line((150, 0, 150, H), fill=(245, 190, 190), width=3)
    return img.convert('RGBA')


def polaroid(photo, pw, ph, margin=26, bottom=90, caption=None, cap_font=None, tape=True):
    pol = Image.new('RGBA', (pw + margin * 2, ph + margin + bottom), (255, 255, 255, 255))
    pol.paste(photo.resize((pw, ph), Image.LANCZOS), (margin, margin))
    if caption:
        cl = text_layer(caption, cap_font, (70, 60, 60), pad=10)
        if cl.width > pol.width - 10:
            r = (pol.width - 10) / cl.width
            cl = cl.resize((int(cl.width * r), int(cl.height * r)), Image.LANCZOS)
        pol.alpha_composite(cl, ((pol.width - cl.width) // 2, ph + margin + (bottom - cl.height) // 2))
    if tape:
        tp = Image.new('RGBA', (int(pw * 0.38), int(pw * 0.11)), (255, 214, 140, 190)).rotate(-8, expand=True, resample=Image.BICUBIC)
        pol.alpha_composite(tp, ((pol.width - tp.width) // 2, 0))
    out = Image.new('RGBA', (pol.width + 60, pol.height + 60), (0, 0, 0, 0))
    sh = Image.new('RGBA', out.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle((36, 42, pol.width + 30, pol.height + 36), fill=(80, 60, 40, 80))
    out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12)))
    out.alpha_composite(pol, (30, 30))
    return out


def wavy(base, x0, y0, length, p, color=(250, 150, 150, 230), width=10):
    lp = ease_out(p)
    if lp <= 0:
        return
    dd = ImageDraw.Draw(base, 'RGBA')
    pts = [(x0 + i, y0 + math.sin(i / 22) * 6) for i in range(0, int(length * lp), 4)]
    if len(pts) > 1:
        dd.line(pts, fill=color, width=width, joint='curve')


def pill_label(text, size=40):
    tag = text_layer(text, font('ZenMaruGothic-Bold.ttf', size), (120, 96, 80))
    pill = Image.new('RGBA', (tag.width + 34, tag.height - 2), (0, 0, 0, 0))
    ImageDraw.Draw(pill).rounded_rectangle((0, 0, pill.width - 1, pill.height - 1), (pill.height - 1) // 2,
                                           fill=(255, 255, 255, 240), outline=(232, 220, 204, 255), width=3)
    pill.paste(tag, (17, -1), tag)
    return pill


def render_title(group_photo, n, t, dur=4.5):
    base = notebook_bg()
    pol = polaroid(group_photo, 720, 540, bottom=70)
    p = ease_back((t - 0.1) / 0.7, 1.2)
    if p > 0:
        rot = pol.rotate(-4 + (1 - clamp(p)) * -8, expand=True, resample=Image.BICUBIC)
        paste_scaled(base, rot, 560, 540 + (1 - clamp(p)) * 60, 0.88 + 0.12 * p, alpha=clamp(t / 0.35))
    reveal_up(base, pill_label('Self Introduction'), 1035, 310, (t - 0.5) / 0.4, 24)
    tl = text_layer('じこしょうかい', font('KleeOne-SemiBold.ttf', 112), (40, 50, 90), spacing=4)
    reveal_up(base, tl, 1020, 390, (t - 0.7) / 0.5, 40)
    wavy(base, 1045, 390 + tl.height - 12, tl.width - 50, (t - 1.05) / 0.7)
    sl = text_layer(f'{n}人の スピーチ', font('KleeOne-SemiBold.ttf', 58), (100, 100, 120), spacing=2)
    reveal_up(base, sl, 1035, 390 + tl.height + 36, (t - 1.2) / 0.5, 20)
    a = clamp((dur - t) / 0.01)
    return base.convert('RGB')


def render_ending(faces, names, t, dur=7.0):
    base = notebook_bg()
    tl = text_layer('ありがとうございました', font('KleeOne-SemiBold.ttf', 104), (40, 50, 90), spacing=4)
    reveal_up(base, tl, (W - tl.width) // 2, 70, (t - 0.1) / 0.5, 40)
    wavy(base, (W - tl.width) // 2 + 30, 70 + tl.height - 14, tl.width - 60, (t - 0.45) / 0.7)
    capf = font('ZenMaruGothic-Bold.ttf', 30)
    rows = [list(range(0, 6)), list(range(6, len(faces)))]
    pw = 196
    for r, idxs in enumerate(rows):
        n = len(idxs)
        gap = 286
        x0 = W / 2 - (n - 1) * gap / 2
        for j, i in enumerate(idxs):
            p = ease_back((t - 0.7 - i * 0.09) / 0.5, 1.3)
            if p <= 0:
                continue
            pol = polaroid(faces[i], pw, pw, margin=14, bottom=58, caption=names[i], cap_font=capf, tape=False)
            ang = [-4, 3, -2, 4, -3, 2, 3, -4, 2, -2, 4][i % 11]
            rot = pol.rotate(ang, expand=True, resample=Image.BICUBIC)
            paste_scaled(base, rot, x0 + j * gap, 470 + r * 330 + (1 - clamp(p)) * 40, 0.8 + 0.2 * p, alpha=clamp((t - 0.7 - i * 0.09) / 0.2))
    return base.convert('RGB')
