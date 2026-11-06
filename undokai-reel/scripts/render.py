#!/usr/bin/env python3
"""Render the 30 s Instagram reel (1080x1920, 30 fps) for Charity UNDOKAI 2026 — theme 絆 (KIZUNA).

Every cut and pop lands on the beat of the BGM (165 BPM; beat k at 0.204 + k*60/165 s, see music.py).

  0.0– 3.1 s  hook        cavalry charging at the camera, battle clash; 運動会 / 絆 title slams in
  3.1– 6.7 s  who         opening ceremony flags (JAPAN × CAMBODIA), then RED / BLUE / WHITE team cards
  6.7–14.7 s  協力        building the human horse, the lift, the charge, the battle
 14.7–20.6 s  仲間        tug-of-war, flags, friends posing, the flag bearer
 20.6–23.5 s  思い出      polaroids of last year drop onto a pile of medals
 23.5–30.0 s  join us     vertical re-layout of the banner + date, place, how to join; final hit on 絆

Usage: python3 render.py [out.mp4] [--from S --to S] [--stills t1,t2,...]
"""
import argparse
import math
import os
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
MEDIA = os.path.join(ROOT, 'media_src', 'icloud')
BUILD = os.path.join(ROOT, 'build')
FONTS = os.path.join(ROOT, 'assets', 'fonts')

W, H, FPS = 1080, 1920, 30
N = 899                                   # 29.97 s
BEAT = 60 / 165


def b(k):
    return 0.204 + k * BEAT


# ------------------------------------------------------------------ palette
RED = (0.89, 0.16, 0.22)
NAVY = (0.10, 0.17, 0.42)
BLUE = (0.14, 0.33, 0.75)
YELLOW = (1.0, 0.82, 0.18)
WHITE = (1.0, 1.0, 1.0)
INK = (0.06, 0.07, 0.12)


def hexrgb(c):
    return tuple(int(v * 255) for v in c)


# ------------------------------------------------------------------ easing
def clamp(x, a=0.0, c=1.0):
    return max(a, min(c, x))


def out_cubic(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def in_cubic(x):
    x = clamp(x)
    return x ** 3


def out_back(x, s=2.2):
    x = clamp(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def prog(t, t0, dur):
    return clamp((t - t0) / dur)


# ------------------------------------------------------------------ sprites
def to_spr(img):
    """PIL RGBA / float RGBA -> premultiplied float32 RGBA."""
    a = np.asarray(img).astype(np.float32) / 255 if not isinstance(img, np.ndarray) else img
    a = a.copy()
    a[..., :3] *= a[..., 3:4]
    return a


def load_spr(name, width=None):
    im = Image.open(os.path.join(BUILD, name)).convert('RGBA')
    if width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    return to_spr(im)


def paste(dst, spr, cx, cy, s=1.0, rot=0.0, op=1.0):
    """Composite a premultiplied RGBA sprite centred at (cx, cy), scaled and rotated (degrees, CCW)."""
    if op <= .004 or s <= .01:
        return
    h, w = spr.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), rot, s)
    M[0, 2] += cx - w / 2
    M[1, 2] += cy - h / 2
    pts = np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]], np.float64) @ M.T
    x0, y0 = max(0, int(math.floor(pts[:, 0].min()))), max(0, int(math.floor(pts[:, 1].min())))
    x1, y1 = min(W, int(math.ceil(pts[:, 0].max()))), min(H, int(math.ceil(pts[:, 1].max())))
    if x1 <= x0 or y1 <= y0:
        return
    M[0, 2] -= x0
    M[1, 2] -= y0
    p = cv2.warpAffine(spr, M, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = p[..., 3:4] * op
    reg = dst[y0:y1, x0:x1]
    reg *= 1 - a
    reg += p[..., :3] * op


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def text_spr(text, fnt, fill=WHITE, stroke=0, stroke_fill=NAVY, shadow=0, shadow_fill=INK, tracking=0):
    """Sticker text: fill + outline + hard drop shadow."""
    pad = stroke + shadow + 12
    asc, desc = fnt.getmetrics()
    widths = [fnt.getlength(ch) for ch in text]
    tw = int((fnt.getlength(text) if not tracking else sum(widths) + tracking * (len(text) - 1))) + 2
    im = Image.new('RGBA', (tw + 2 * pad + int(.25 * (asc + desc)), asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def draw(ox, oy, color, sw):
        x = pad + ox
        if not tracking:
            d.text((x, pad + oy), text, font=fnt, fill=hexrgb(color) + (255,), stroke_width=sw, stroke_fill=hexrgb(color) + (255,))
            return
        for ch, cw in zip(text, widths):
            d.text((x, pad + oy), ch, font=fnt, fill=hexrgb(color) + (255,), stroke_width=sw, stroke_fill=hexrgb(color) + (255,))
            x += cw + tracking
    if shadow:
        draw(shadow * .5, shadow, shadow_fill, stroke)
    if stroke:
        draw(0, 0, stroke_fill, stroke)
    draw(0, 0, fill, 0)
    return to_spr(im.crop(im.getbbox()))


def pill_spr(text, fnt, fg, bg, padx=34, pady=16, outline=0, outline_fill=WHITE, shadow=8, tracking=0):
    t = text_spr(text, fnt, fill=fg, tracking=tracking)
    th, tw = t.shape[:2]
    w, h = tw + 2 * padx, th + 2 * pady
    pad = outline + shadow + 4
    im = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = h // 2
    if shadow:
        d.rounded_rectangle([pad + shadow * .5, pad + shadow, pad + w + shadow * .5, pad + h + shadow], r, fill=hexrgb(INK) + (150,))
    if outline:
        d.rounded_rectangle([pad - outline, pad - outline, pad + w + outline, pad + h + outline], r + outline, fill=hexrgb(outline_fill) + (255,))
    d.rounded_rectangle([pad, pad, pad + w, pad + h], r, fill=hexrgb(bg) + (255,))
    s = to_spr(im)
    y0, x0 = pad + pady, pad + padx
    a = t[..., 3:4]
    s[y0:y0 + th, x0:x0 + tw] = s[y0:y0 + th, x0:x0 + tw] * (1 - a) + t
    return s


def seal_spr(chars, size=150):
    """Red hanko stamp with white brush kanji, set vertically."""
    f = font('YujiSyuku-subset.ttf', size)
    n = len(chars)
    w, h = int(size * 1.45), int(size * (1.12 * n + .45))
    pad = 10
    im = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([pad, pad, pad + w, pad + h], int(size * .22), fill=hexrgb(RED) + (255,))
    d.rounded_rectangle([pad + 12, pad + 12, pad + w - 12, pad + h - 12], int(size * .16), outline=(255, 255, 255, 235), width=5)
    for i, ch in enumerate(chars):
        cw = f.getlength(ch)
        d.text((pad + (w - cw) / 2, pad + size * .2 + i * size * 1.12), ch, font=f, fill=(255, 255, 255, 255))
    arr = np.asarray(im).astype(np.float32) / 255
    rng = np.random.default_rng(len(chars) * 7 + size)
    grain = cv2.GaussianBlur(rng.random(arr.shape[:2]).astype(np.float32), (0, 0), 1.6)
    arr[..., 3] *= np.clip((grain - .36) * 9, .55, 1)          # worn ink texture
    return to_spr(arr)


def polaroid_spr(path, width, crop=None, border=22, bottom=86):
    im = Image.open(path).convert('RGB')
    if crop:
        x0, y0, x1, y1 = crop
        im = im.crop((int(x0 * im.width), int(y0 * im.height), int(x1 * im.width), int(y1 * im.height)))
    pw = width - 2 * border
    im = im.resize((pw, round(im.height * pw / im.width)), Image.LANCZOS)
    sh = 18
    card = Image.new('RGBA', (width + 2 * sh, im.height + border + bottom + 2 * sh), (0, 0, 0, 0))
    shadow = Image.new('RGBA', card.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([sh + 6, sh + 12, sh + width + 6, sh + im.height + border + bottom + 12], fill=(0, 0, 0, 110))
    shadow = Image.fromarray(cv2.GaussianBlur(np.asarray(shadow), (0, 0), 9))
    card.alpha_composite(shadow)
    ImageDraw.Draw(card).rectangle([sh, sh, sh + width, sh + im.height + border + bottom], fill=(252, 251, 247, 255))
    card.paste(im, (sh + border, sh + border))
    return to_spr(card)


def grade(img):
    """Lift the overcast footage a little: contrast, saturation, warmth."""
    x = img.astype(np.float32) / 255
    x = (x - .5) * 1.07 + .52
    g = x.mean(axis=2, keepdims=True)
    x = g + (x - g) * 1.22
    x *= np.array([1.03, 1.0, .97], np.float32)
    return np.clip(x, 0, 1)


# ------------------------------------------------------------------ video sources
class Video:
    """Frames of one shot, decoded lazily through ffmpeg (sequential reads only)."""

    def __init__(self, name, start, frames, speed=1.0, crop=None, size=(W, H)):
        self.name, self.start, self.frames, self.speed, self.crop, self.size = name, start, frames, speed, crop, size
        self.proc, self.idx, self.cur = None, -1, None

    def _open(self):
        path = os.path.join(MEDIA, self.name)
        w, h = self.size
        vf = [f'setpts=(PTS-STARTPTS)/{self.speed}', f'fps={FPS}']
        if self.crop and self.crop[0] == 'box':                      # explicit pixel box
            _, x, y, cw, ch = self.crop
            vf.append(f'crop={cw}:{ch}:{x}:{y}')
        elif self.crop:                                              # landscape -> 9:16 window
            cx, cy, hf = self.crop
            vf.append(f"crop=trunc(ih*{hf}*9/16/2)*2:trunc(ih*{hf}/2)*2:"
                      f"max(0\\,min(iw-ow\\,iw*{cx}-ow/2)):max(0\\,min(ih-oh\\,ih*{cy}-oh/2))")
        vf.append(f'scale={w}:{h}:flags=lanczos')
        if self.crop and self.crop[0] != 'box':
            vf.append('unsharp=5:5:0.7')
        cmd = ['ffmpeg', '-v', 'error', '-ss', f'{self.start:.3f}', '-i', path, '-vf', ','.join(vf),
               '-frames:v', str(self.frames + 2), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def get(self, i):
        if self.proc is None:
            self._open()
        w, h = self.size
        while self.idx < i:
            raw = self.proc.stdout.read(w * h * 3)
            if len(raw) < w * h * 3:
                break
            self.cur = grade(np.frombuffer(raw, np.uint8).reshape(h, w, 3))
            self.idx += 1
        return self.cur

    def close(self):
        if self.proc:
            self.proc.kill()
            self.proc = None


def cover(img, w=W, h=H):
    ih, iw = img.shape[:2]
    s = max(w / iw, h / ih)
    r = cv2.resize(img, (round(iw * s), round(ih * s)), interpolation=cv2.INTER_AREA)
    y0, x0 = (r.shape[0] - h) // 2, (r.shape[1] - w) // 2
    return r[y0:y0 + h, x0:x0 + w]


def load_photo(name):
    im = Image.open(os.path.join(ROOT, 'build', 'photos', name)).convert('RGB')
    return np.asarray(im)


def place(dst, img, s=1.0, dx=0.0, dy=0.0, rot=0.0):
    """Full-frame layer with zoom/offset (zoom punch, slow push)."""
    if abs(s - 1) < 1e-4 and dx == 0 and dy == 0 and rot == 0 and img.shape[:2] == (H, W):
        dst[:] = img
        return
    ih, iw = img.shape[:2]
    M = cv2.getRotationMatrix2D((iw / 2, ih / 2), rot, s)
    M[0, 2] += W / 2 - iw / 2 + dx
    M[1, 2] += H / 2 - ih / 2 + dy
    dst[:] = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


# ------------------------------------------------------------------ confetti
class Burst:
    COLORS = [RED, BLUE, YELLOW, WHITE, (1.0, .55, .7), (.3, .8, .55)]

    def __init__(self, t0, x, y, n=90, speed=1500, up=1.0, spread=math.pi, angle=-math.pi / 2, seed=0):
        rng = np.random.default_rng(seed)
        self.t0, self.x, self.y = t0, x, y
        ang = angle + rng.uniform(-spread / 2, spread / 2, n)
        sp = speed * rng.uniform(.35, 1, n)
        self.vx, self.vy = np.cos(ang) * sp, np.sin(ang) * sp * up
        self.size = rng.uniform(12, 26, n)
        self.rot0, self.rotv = rng.uniform(0, 6.28, n), rng.uniform(-14, 14, n)
        self.flut = rng.uniform(2, 5, n)
        self.col = [self.COLORS[i] for i in rng.integers(0, len(self.COLORS), n)]

    def draw(self, img, t):
        dt = t - self.t0
        if dt < 0 or dt > 2.6:
            return
        drag = (1 - np.exp(-2.2 * dt)) / 2.2
        x = self.x + self.vx * drag + 40 * np.sin(self.flut * dt * 3)
        y = self.y + self.vy * drag + 900 * dt * dt * .5
        rot = self.rot0 + self.rotv * dt
        fade = clamp((2.6 - dt) / .5)
        for i in range(len(x)):
            if not (-40 < x[i] < W + 40 and -40 < y[i] < H + 40):
                continue
            s = self.size[i]
            sq = abs(math.cos(rot[i] * .7)) * .8 + .2           # flip in 3D
            c, sn = math.cos(rot[i]), math.sin(rot[i])
            pts = np.array([[-s / 2, -s * sq / 3], [s / 2, -s * sq / 3], [s / 2, s * sq / 3], [-s / 2, s * sq / 3]])
            pts = pts @ np.array([[c, sn], [-sn, c]]) + [x[i], y[i]]
            if fade < .3 and i % 3:
                continue
            col = tuple(int(255 * v) for v in self.col[i])
            cv2.fillConvexPoly(img, pts.astype(np.int32), col, lineType=cv2.LINE_AA)


# ------------------------------------------------------------------ the edit
def frames(t0, t1):
    return int(round((t1 - t0) * FPS)) + 1


SHOTS = []          # (t0, t1, draw(frame, t, local_t))


def shot(t0, t1):
    def deco(fn):
        SHOTS.append((t0, t1, fn))
        return fn
    return deco


def punch(lt, amt=.085, dur=.3):
    """Zoom punch at the head of a cut."""
    return 1 + amt * (1 - out_cubic(lt / dur))


def video_shot(t0, t1, name, start, speed=1.0, crop=None, push=.04, amt=.085):
    v = Video(name, start, frames(t0, t1), speed, crop)

    def draw(fr, t, lt):
        img = v.get(int(lt * FPS))
        place(fr, img, s=punch(lt, amt) + push * lt / (t1 - t0))
        if t + 1 / FPS >= t1:
            v.close()
    SHOTS.append((t0, t1, draw))


def build():
    T_END = N / FPS
    # ---- 1. hook
    video_shot(0, b(4), '20_IMG_7189.mov', 3.15, speed=1.15, amt=0)
    video_shot(b(4), b(8), '23_IMG_7193.mov', 0.2, crop=(.40, .5, 1.0))
    # ---- 2. who: flags, then the three teams
    video_shot(b(8), b(12), '05_IMG_7175.mov', 9.7, crop=(.33, .56, .9))
    teams = [('00_IMG_4692.mov', 'RED TEAM', RED, WHITE, -4), ('01_IMG_4691.mov', 'BLUE TEAM', BLUE, WHITE, 3),
             ('02_IMG_4693.mov', 'WHITE TEAM', (.9, .94, 1.0), NAVY, -2.5)]
    for i, (name, label, col, fg, rot) in enumerate(teams):
        t0, t1 = b(12 + 2 * i), b(14 + 2 * i)
        team_shot(t0, t1, name, label, col, fg, rot, i)
    # ---- 3. 協力 teamwork: build the horse, lift, charge, battle
    video_shot(b(18), b(22), '16_IMG_7185.mov', 12.4)
    video_shot(b(22), b(26), '19_IMG_7188.mov', 1.9, speed=2.0)
    video_shot(b(26), b(30), '19_IMG_7188.mov', 6.0)
    video_shot(b(30), b(33), '23_IMG_7193.mov', 19.2, crop=(.27, .5, 1.0))
    video_shot(b(33), b(36), '21_IMG_7191.mov', 58.45, crop=(.70, .5, 1.0))
    video_shot(b(36), b(40), '23_IMG_7193.mov', 35.3, crop=(.72, .5, 1.0))
    # ---- 4. 仲間 friends
    tug_shot(b(40), b(44))
    video_shot(b(44), b(48), '22_IMG_7192.mov', 0.1, crop=(.66, .5, 1.0))
    trio_shot(b(48), b(52))
    video_shot(b(52), b(56), '21_IMG_7191.mov', 0.1, crop=(.50, .5, 1.0))
    # ---- 5. 思い出 memories
    memories_shot(b(56), b(64))
    # ---- 6. end card
    endcard_shot(b(64), T_END)


def team_shot(t0, t1, name, label, col, fg, rot, i):
    v = Video(name, 1.0 + i * .4, frames(t0, t1), 1.0, ('box', 0, 465, 720, 525), size=(940, 686))
    lab = text_spr(label, font('Poppins-BlackItalic.ttf', 128), fill=fg, stroke=12,
                   stroke_fill=INK if fg == WHITE else WHITE, shadow=12)
    stripes = np.zeros((H + 400, W + 400, 3), np.float32)
    c = np.array(col, np.float32)
    yy, xx = np.mgrid[0:H + 400, 0:W + 400]
    band = ((xx + yy) // 90) % 2
    stripes[:] = np.where(band[..., None] == 0, c, c * .9)

    def draw(fr, t, lt):
        off = int(lt * 260) % 180
        fr[:] = stripes[off:off + H, off:off + W]
        img = v.get(int(lt * FPS))
        card = np.ones((img.shape[0] + 36, img.shape[1] + 36, 4), np.float32)
        card[18:-18, 18:-18, :3] = img
        p = out_back(lt / .28)
        paste(fr, card, W / 2, 1010, s=.55 + .45 * p, rot=rot + (1 - p) * 10)
        q = out_back((lt - .05) / .25)
        paste(fr, lab, W / 2, 470, s=.4 + .6 * q, rot=rot * .8, op=clamp(q * 3))
        if t + 1 / FPS >= t1:
            v.close()
    SHOTS.append((t0, t1, draw))


def tug_shot(t0, t1):
    photo = load_photo('32_IMG_1239.jpg')
    bg = cv2.GaussianBlur(cover(photo).astype(np.float32) / 255, (0, 0), 28) * .8
    card = polaroid_spr(os.path.join(BUILD, 'photos', '32_IMG_1239.jpg'), 1000)
    pull = text_spr('PULL!', font('LuckiestGuy-Regular.ttf', 150), fill=YELLOW, stroke=12, stroke_fill=INK, shadow=12)

    def draw(fr, t, lt):
        fr[:] = bg
        k = (t - t0) / BEAT
        jerk = -46 * math.exp(-(k % 1) * 5) * (1 if int(k) % 2 == 0 else -1)   # the rope jerks on every beat
        p = out_back(lt / .3)
        paste(fr, card, W / 2 + jerk, 980, s=.7 + .3 * p, rot=-3 + jerk * .03)
        for j in range(4):
            tj = t0 + j * BEAT
            if t >= tj:
                q = out_back((t - tj) / .18)
                paste(fr, pull, 290 if j % 2 == 0 else 790, 470 if j % 2 == 0 else 1500, s=q * (.75 + .1 * j),
                      rot=8 if j % 2 else -8, op=clamp(1 - (t - tj - .3) / .1) if t - tj > .3 else 1)
    SHOTS.append((t0, t1, draw))


def trio_shot(t0, t1):
    bgc = np.array((1.0, .86, .25), np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    dots = (((xx // 60) + (yy // 60)) % 2 == 0)
    bg = np.where(dots[..., None], bgc, bgc * .94)
    cards = [(polaroid_spr(os.path.join(BUILD, 'photos', n), 820), x, y, r) for n, x, y, r in
             [('25_IMG_1232.jpg', 470, 760, -6), ('29_IMG_1236.jpg', 600, 1140, 5), ('28_IMG_1235.jpg', 500, 1490, -3)]]

    def draw(fr, t, lt):
        fr[:] = bg
        for j, (c, x, y, r) in enumerate(cards):
            tj = t0 + j * BEAT
            if t >= tj:
                q = out_back((t - tj) / .26)
                paste(fr, c, x, y - (1 - q) * 120, s=1.35 - .35 * q, rot=r + (1 - q) * 12)
    SHOTS.append((t0, t1, draw))


def memories_shot(t0, t1):
    medals = load_photo('11_IMG_7177.jpg')
    bg = grade(cover(medals)) * .82
    cards = [(polaroid_spr(os.path.join(BUILD, 'photos', n), 780), x, y, r) for n, x, y, r in
             [('26_IMG_1233.jpg', 520, 760, -7), ('24_IMG_1231.jpg', 590, 1080, 6), ('31_IMG_1238.jpg', 470, 1370, -4),
              ('33_IMG_1240.jpg', 560, 1000, 3)]]

    def draw(fr, t, lt):
        place(fr, bg, s=1.04 + .06 * lt / (t1 - t0), rot=-.6 * lt)
        for j, (c, x, y, r) in enumerate(cards):
            tj = t0 + 2 * j * BEAT
            if t >= tj:
                q = out_back((t - tj) / .3, 1.6)
                paste(fr, c, x, y - (1 - q) * 700, s=1.25 - .25 * q, rot=r + (1 - q) * 20)
    SHOTS.append((t0, t1, draw))


SPR = {}


def endcard_shot(t0, t1):
    sky = np.asarray(Image.open(os.path.join(BUILD, 'sky.png')).convert('RGB')).astype(np.float32) / 255
    SPR['title'] = load_spr('title.png', 1000)
    SPR['cl'] = load_spr('corner_l.png', 820)
    SPR['cr'] = load_spr('corner_r.png', 800)
    logos = Image.open(os.path.join(BUILD, 'logos.png')).convert('RGBA')
    lw = 820
    logos = logos.resize((lw, round(logos.height * lw / logos.width)), Image.LANCZOS)
    plate = Image.new('RGBA', (lw + 80, logos.height + 44), (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle([0, 0, plate.width - 1, plate.height - 1], 30, fill=(255, 255, 255, 240))
    plate.alpha_composite(logos, (40, 22))
    SPR['logos'] = to_spr(plate)
    SPR['co'] = text_spr('AUPP  ×  OSAKA SANGYO UNIV.', font('Poppins-Bold.ttf', 38), fill=NAVY, tracking=3)
    SPR['date'] = pill_spr('SAT  28 NOV 2026', font('Poppins-Black.ttf', 76), WHITE, NAVY, padx=46, pady=14, outline=6)
    SPR['time'] = text_spr('3:00 – 6:30 PM   |   AUPP SPORTS FIELD', font('Poppins-Bold.ttf', 44), fill=NAVY)
    SPR['supply'] = pill_spr('JOIN WITH 1 SCHOOL SUPPLY', font('Poppins-BlackItalic.ttf', 52), WHITE, RED, padx=40, pady=12, outline=6)
    SPR['supply2'] = text_spr('notebook · pen · pencil · ruler — every item helps a student', font('Poppins-SemiBold.ttf', 30), fill=INK)
    SPR['join'] = text_spr('JOIN US!', font('LuckiestGuy-Regular.ttf', 196), fill=WHITE, stroke=16, stroke_fill=RED, shadow=16)
    SPR['open'] = pill_spr('OPEN TO ALL', font('Poppins-BlackItalic.ttf', 40), INK, YELLOW, padx=28, pady=8, shadow=6)
    SPR['kz'] = text_spr('KIZUNA = BOND', font('PermanentMarker-Regular.ttf', 44), fill=RED, stroke=6, stroke_fill=WHITE)
    kizuna = load_spr('kizuna.png', 330)

    def draw(fr, t, lt):
        fr[:] = sky
        rise = out_cubic(lt / .55)
        paste(fr, SPR['cl'], 310, H - SPR['cl'].shape[0] / 2 + 40 + (1 - rise) * 500, rot=0)
        paste(fr, SPR['cr'], W - 300, H - SPR['cr'].shape[0] / 2 + 80 + (1 - rise) * 600)
        # title drops in, then breathes on the beat
        q = out_back((t - b(64) - .04) / .4, 1.8)
        beatpulse = .012 * math.exp(-((t - .204) / BEAT % 1) * 6)
        paste(fr, SPR['title'], W / 2, 430 - (1 - q) * 700, s=.98 + beatpulse)
        # the 絆 sun answers the final hit
        hit = b(271 - 192)
        if t >= hit - .02:
            z = out_back((t - hit) / .35, 3)
            paste(fr, kizuna, 851, 445, s=.977 * (1 + .25 * (1 - z) + .12 * math.exp(-(t - hit) * 6)))
        items = [('kz', 860, 690, 66, -7), ('co', W / 2, 760, 65, 0), ('date', W / 2, 870, 66, 0), ('time', W / 2, 975, 67, 0),
                 ('supply', W / 2, 1090, 68, -2), ('supply2', W / 2, 1172, 68.5, 0), ('join', W / 2 - 40, 1330, 70, -4),
                 ('open', 860, 1425, 71, 8), ('logos', W / 2, 1545, 72, 0)]
        for key, x, y, k, rot in items:
            tk = b(k)
            if t < tk:
                continue
            p = out_back((t - tk) / .28)
            extra = 0
            if key == 'join':
                extra = .05 * math.exp(-((t - .204) / BEAT % 1) * 5) + .12 * math.exp(-max(0, t - hit) * 5) * (t >= hit)
            paste(fr, SPR[key], x, y, s=.5 + .5 * p + extra, rot=rot, op=clamp(p * 2.5))
    SHOTS.append((t0, t1, draw))


# ------------------------------------------------------------------ overlays (independent of shots)
def overlays():
    title = load_spr('title.png', 1000)
    big = {}
    big['jp'] = pill_spr('JAPAN', font('Poppins-BlackItalic.ttf', 104), RED, WHITE, padx=44, pady=6, outline=0, shadow=12)
    big['kh'] = pill_spr('CAMBODIA', font('Poppins-BlackItalic.ttf', 104), WHITE, BLUE, padx=44, pady=6, outline=7,
                         outline_fill=RED, shadow=12)
    big['x'] = text_spr('×', font('Poppins-Black.ttf', 150), fill=YELLOW, stroke=10, stroke_fill=INK, shadow=10)
    stamps = []
    for chars, word, k0, k1 in [('協力', 'TEAMWORK', 18, 25.5), ('仲間', 'FRIENDS', 48, 55.5), ('思い出', 'MEMORIES', 56, 63.5)]:
        stamps.append((seal_spr(chars, 118), text_spr(word, font('Poppins-BlackItalic.ttf', 118), fill=WHITE, stroke=12,
                                                       stroke_fill=INK, shadow=14), b(k0), b(k1)))
    ov = []

    def hook(fr, t):
        if b(0) <= t < b(8):
            q = out_back((t - b(0)) / .32, 2.6)
            m = out_back((t - b(4)) / .3, 1.4)                  # shrink to a badge at the cut
            exit_ = in_cubic((t - (b(8) - .22)) / .22)
            pulse = .02 * math.exp(-((t - .204) / BEAT % 1) * 6)
            s_ = (1.9 - .9 * q) * (1 - .36 * m) * (1 + pulse)
            paste(fr, title, W / 2 + 0 * m, 410 - 120 * m - exit_ * 700, s=s_, rot=-3 * q + 6 * (1 - q),
                  op=clamp((t - b(0)) * 20))
    ov.append(hook)

    def who(fr, t):
        if b(8) <= t < b(12):
            for key, k, x0, x1, y in [('jp', 8, -400, 360, 1170), ('x', 9, W / 2, W / 2, 1300), ('kh', 10, W + 500, 640, 1440)]:
                tk = b(k)
                if t < tk:
                    continue
                p = out_back((t - tk) / .26)
                if key == 'x':
                    paste(fr, big[key], x1, y, s=p, rot=(1 - p) * 90)
                else:
                    paste(fr, big[key], x0 + (x1 - x0) * p, y, rot=-4)
    ov.append(who)

    def stamp(fr, t):
        for seal, word, t0, t1 in stamps:
            if not (t0 <= t < t1):
                continue
            p = out_back((t - t0) / .22, 1.4)
            out = in_cubic((t - (t1 - .18)) / .18)
            sh, sw = seal.shape[:2]
            cy = 300 + sh / 2
            paste(fr, seal, 80 + sw / 2, cy - out * 600, s=2.3 - 1.3 * p, rot=-8 + (1 - p) * 20)
            q = out_back((t - t0 - BEAT * .5) / .24)
            paste(fr, word, 80 + sw + 30 + word.shape[1] / 2 * .82, cy - 10 - out * 600, s=.82 * q, rot=-5)
    ov.append(stamp)
    return ov


BURSTS = [Burst(b(0), W / 2, 700, n=110, speed=1700, seed=1),
          Burst(b(18), 200, 420, n=60, speed=1300, seed=2),
          Burst(b(48), 200, 420, n=60, speed=1300, seed=3),
          Burst(b(64) + .3, W / 2, 500, n=90, speed=1500, seed=4),
          Burst(b(79), -20, 1300, n=110, speed=2300, spread=.9, angle=-1.05, seed=5),
          Burst(b(79), W + 20, 1300, n=110, speed=2300, spread=.9, angle=-2.09, seed=6)]
FLASH = [b(0), b(8), b(18), b(40), b(56), b(64)]
SHAKE = [b(0), b(18), b(48), b(56), b(79)]


def render(out, t_from=0.0, t_to=None, stills=None):
    build()
    ovs = overlays()
    fr = np.zeros((H, W, 3), np.float32)
    f0 = int(round(t_from * FPS))
    f1 = N if t_to is None else min(N, int(round(t_to * FPS)))
    still_frames = {int(round(s * FPS)): s for s in (stills or [])}
    enc = None
    if not stills:
        music = os.path.join(BUILD, 'music.wav')
        cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
               '-ss', f'{t_from:.4f}', '-i', music, '-map', '0:v', '-map', '1:a',
               '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
               '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]
        enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    todo = sorted(still_frames) if still_frames else range(f0, f1)
    for f in todo:
        t = f / FPS
        for t0, t1, fn in SHOTS:
            if t0 <= t < t1:
                fn(fr, t, t - t0)          # decoders read forward lazily, so skipping frames is fine
        for o in ovs:
            o(fr, t)
        for tf in FLASH:
            if 0 <= t - tf < .12:
                fr[:] = fr + (1 - fr) * (.45 * (1 - (t - tf) / .12))
        img = (np.clip(fr, 0, 1) * 255).astype(np.uint8)
        for bu in BURSTS:
            bu.draw(img, t)
        for ts in SHAKE:
            if 0 <= t - ts < .16:
                a = 14 * (1 - (t - ts) / .16)
                M = np.float32([[1, 0, a * math.sin(f * 2.1)], [0, 1, a * math.cos(f * 1.7)]])
                img = cv2.warpAffine(img, M, (W, H), borderMode=cv2.BORDER_REFLECT)
        if enc:
            enc.stdin.write(img.tobytes())
        else:
            Image.fromarray(img).save(os.path.join(out, f'still_{still_frames[f]:05.2f}.jpg'), quality=88)
        if f % 60 == 0:
            print(f'{t:5.1f}s', flush=True)
    if enc:
        enc.stdin.close()
        enc.wait()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out', nargs='?', default=os.path.join(ROOT, 'output', 'undokai_2026_reel.mp4'))
    ap.add_argument('--from', dest='t_from', type=float, default=0.0)
    ap.add_argument('--to', dest='t_to', type=float, default=None)
    ap.add_argument('--stills', type=str, default=None)
    a = ap.parse_args()
    stills = [float(s) for s in a.stills.split(',')] if a.stills else None
    if stills:
        os.makedirs(a.out, exist_ok=True)
    render(a.out, a.t_from, a.t_to, stills)
