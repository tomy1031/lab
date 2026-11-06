#!/usr/bin/env python3
"""Cut the graphic parts out of the official banner/poster and build the reel's sprites.

  title.png      運動会 brush lettering + UNDOKAI + 絆 sun, keyed off the sky, with a white sticker edge
  kizuna.png     the 絆 sun on its own (end-card stamp)
  corner_l.png   sakura + Japanese-flag ribbon (bottom-left of the banner), feathered into transparency
  corner_r.png   daisies + Cambodian-flag ribbon (bottom-right of the banner)
  logos.png      AUPP · Osaka Sangyo Univ. · 運動会屋 · NEXTMAKE, from the poster (white background)
  sky.png        1080x1920 sky backdrop for the end card

Usage: python3 make_assets.py   (writes into build/)
"""
import os

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT = os.path.join(ROOT, 'build')
os.makedirs(OUT, exist_ok=True)

banner = np.asarray(Image.open(os.path.join(ROOT, 'assets', 'banner.png')).convert('RGB')).astype(np.float32)
poster = np.asarray(Image.open(os.path.join(ROOT, 'assets', 'poster.png')).convert('RGB')).astype(np.float32)


def save(name, rgb, a):
    rgba = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, name))


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def sticker(rgb, a, edge, shadow=0):
    """Add a white outline of `edge` px (and an optional soft drop shadow) around an RGBA cut-out."""
    pad = edge * 2 + shadow * 2
    rgb = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)))
    a = np.pad(a, pad)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * edge + 1, 2 * edge + 1))
    outline = cv2.GaussianBlur(cv2.dilate((a > .35).astype(np.float32), k), (0, 0), edge * .18)
    out_a = np.maximum(outline, a)
    out_rgb = rgb * a[..., None] + 255 * (1 - a[..., None])
    out_rgb = np.where(out_a[..., None] > 0, out_rgb, 0)
    if shadow:
        sh = cv2.GaussianBlur(np.roll(out_a, (shadow, shadow // 2), (0, 1)), (0, 0), shadow * .6) * .35
        total = out_a + sh * (1 - out_a)
        out_rgb = (out_rgb * out_a[..., None] + 20 * sh[..., None] * (1 - out_a[..., None])) / np.maximum(total, 1e-6)[..., None]
        out_a = total
    return out_rgb, out_a


# ---------------------------------------------------------------- title (banner px)
x0, y0, x1, y1 = 1600, 300, 4200, 1330
crop = banner[y0:y1, x0:x1]
R, G, B = crop[..., 0], crop[..., 1], crop[..., 2]
Y = .299 * R + .587 * G + .114 * B
yy, xx = np.mgrid[y0:y1, x0:x1]
cx, cy, r_sun = 3672, 872, 300                      # the peach watercolor disc behind 絆
d = np.hypot(xx - cx, yy - cy)

ink = smooth(205 - Y, 0, 150)                        # black brush strokes and the grey swoosh
ink = np.where(d < r_sun + 10, np.where(Y < 90, ink, 0), ink)
red = (R > 150) & (G < 140) & (B < 140) & (xx > 1800) & (xx < 3150) & (yy > 1050)   # the red O of UNDOKAI
warm = smooth(R - B, 15, 90)                         # orange swirl around the sun (sky is blue: R < B)
disc = smooth(r_sun + 18 - d, 0, 22)                 # the disc itself, incl. the white 絆
sun_a = np.maximum(disc, np.where(d < 520, warm, 0))
sun_a = np.where(xx > 3200, sun_a, 0)

a = np.maximum.reduce([ink, red.astype(np.float32), sun_a])
sky = np.array([212, 238, 250], np.float32)
# un-mix the sky from semi-transparent swirl pixels; brush ink is plain black
rgb = (crop - (1 - a[..., None]) * sky) / np.maximum(a[..., None], 1e-3)
rgb = np.where((ink > sun_a)[..., None] & ~red[..., None], np.minimum(rgb, 25), rgb)
rgb = np.clip(rgb, 0, 255)
t_rgb, t_a = sticker(rgb, a, 20, 14)
save('title.png', t_rgb, t_a)
# the same lettering without the sticker edge, for print and other layouts
ys, xs = np.nonzero(a > .02)
pad = 12
cy0, cy1, cx0, cx1 = max(0, ys.min() - pad), ys.max() + pad, max(0, xs.min() - pad), xs.max() + pad
save('title_clean.png', rgb[cy0:cy1, cx0:cx1], a[cy0:cy1, cx0:cx1])

# the 絆 sun alone
sx0, sy0 = 3300 - x0, 380 - y0
s_a = np.where(d < 520, sun_a, 0) * np.where(d < r_sun + 10, 1, 1 - ink)        # drop the tail of 会 that crosses the swirl
s_rgb, s_a = rgb[sy0:sy0 + 980, sx0:sx0 + 900], s_a[sy0:sy0 + 980, sx0:sx0 + 900]
save('kizuna.png', s_rgb, s_a)
# a clean stand-alone 絆 sun for other uses: paint the peach over the tail of 会 that crosses the disc
crop_d = d[sy0:sy0 + 980, sx0:sx0 + 900]
crop_ink = ink[sy0:sy0 + 980, sx0:sx0 + 900]
hole = cv2.dilate((crop_ink > .06).astype(np.uint8), np.ones((17, 17), np.uint8)) > 0
# fill the hole with the same disc rotated by 60°, so the watercolour texture continues (no dark sources)
ccx, ccy = cx - 3300, cy - 380
M = cv2.getRotationMatrix2D((ccx, ccy), 60, 1.0)
rot_rgb = cv2.warpAffine(np.clip(s_rgb, 0, 255).astype(np.float32), M, (s_rgb.shape[1], s_rgb.shape[0]), flags=cv2.INTER_LINEAR)
in_disc = crop_d < r_sun + 10
k_rgb = np.where((hole & in_disc)[..., None], rot_rgb, s_rgb)
feather = cv2.GaussianBlur((hole & in_disc).astype(np.float32), (0, 0), 4)[..., None]
k_rgb = s_rgb * (1 - feather) + rot_rgb * feather
k_rgb = np.where((hole & in_disc)[..., None], rot_rgb, k_rgb)
k_a = np.where(in_disc, np.maximum(s_a, disc[sy0:sy0 + 980, sx0:sx0 + 900]), np.where(hole, 0, s_a))
save('kizuna_clean.png', k_rgb, k_a)

# ---------------------------------------------------------------- corners
H, W = banner.shape[:2]


def corner(region, fade):
    x0, y0, x1, y1 = region
    c = banner[y0:y1, x0:x1]
    gy, gx = np.mgrid[y0:y1, x0:x1]
    not_sun = smooth(np.hypot(gx - 3672, gy - 872) - 540, 0, 60)    # keep the 絆 sun out of the right corner
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    # sky & clouds are light and blue-ish; flowers/ribbons are saturated, or white with warm/grey shading
    sat = (np.max(c, 2) - np.min(c, 2)) / np.maximum(np.max(c, 2), 1)
    blueish_sky = (B > R + 8) & (B > 215) & (sat < .32)
    a = 1 - blueish_sky.astype(np.float32)
    a = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    a = cv2.GaussianBlur(a, (0, 0), 2.5)
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    a *= fade(xx / w, yy / h) * not_sun
    return c, a


def fade_l(u, v):
    return smooth(.8 - u, 0, .25) * smooth(v, .02, .2)


def fade_r(u, v):
    return smooth(u, 0, .22) * smooth(v, .02, .2)


c, a = corner((0, 760, 2050, H), fade_l)
save('corner_l.png', c, a)
c, a = corner((3600, 650, W, H), fade_r)
save('corner_r.png', c, a)

# ---------------------------------------------------------------- logos (poster, white bg)
def logo(box):
    x0, y0, x1, y1 = box
    c = poster[y0:y1, x0:x1]
    a = smooth(255 - c.min(axis=2), 4, 40)
    return c, a


parts = [logo(b) for b in [(118, 1285, 300, 1465), (325, 1290, 590, 1480), (632, 1288, 785, 1470), (278, 1505, 640, 1570)]]
hts = [150, 150, 150, 52]
row = []
for (c, a), h in zip(parts, hts):
    s = h / c.shape[0]
    size = (int(c.shape[1] * s), h)
    row.append((cv2.resize(c, size, interpolation=cv2.INTER_AREA), cv2.resize(a, size, interpolation=cv2.INTER_AREA)))
gap = 44
w = sum(p[0].shape[1] for p in row) + gap * (len(row) - 1)
canvas = np.full((150, w, 3), 255, np.float32)
ca = np.zeros((150, w), np.float32)
x = 0
for c, a in row:
    y = (150 - c.shape[0]) // 2
    canvas[y:y + c.shape[0], x:x + c.shape[1]] = c * a[..., None] + canvas[y:y + c.shape[0], x:x + c.shape[1]] * (1 - a[..., None])
    ca[y:y + c.shape[0], x:x + c.shape[1]] = np.maximum(ca[y:y + c.shape[0], x:x + c.shape[1]], a)
    x += c.shape[1] + gap
save('logos.png', canvas, ca)

# ---------------------------------------------------------------- sky backdrop
yy = np.linspace(0, 1, 1920)[:, None, None]
top, bot = np.array([150, 206, 240], np.float32), np.array([236, 248, 253], np.float32)
sky = top * (1 - yy) + bot * yy
sky = np.broadcast_to(sky, (1920, 1080, 3)).copy()
rng = np.random.default_rng(7)
clouds = np.zeros((1920, 1080), np.float32)
for _ in range(70):
    cx, cy = rng.uniform(-100, 1180), rng.choice([rng.uniform(1150, 1700), rng.uniform(0, 420)])
    r = rng.uniform(70, 190)
    yy2, xx2 = np.ogrid[0:1920, 0:1080]
    clouds = np.maximum(clouds, np.exp(-((xx2 - cx) ** 2 + ((yy2 - cy) * 1.5) ** 2) / (2 * r * r)))
clouds = cv2.GaussianBlur(np.clip(clouds * 1.4, 0, 1), (0, 0), 6)
sky = sky * (1 - clouds[..., None] * .8) + 255 * clouds[..., None] * .8
noise = rng.normal(0, 3, sky.shape[:2])[..., None]
Image.fromarray(np.clip(sky + noise, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'sky.png'))
print('assets written to', OUT)
