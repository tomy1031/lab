# tools/icons.py — draws the app icons (a stylized mountain, a rising sun and a curved path on deep navy,
# teal and gold) with Pillow. Output: img/icon-512.png, icon-192.png, icon-maskable-512.png, apple-touch-icon.png
#   python3 tools/icons.py
import math, pathlib
from PIL import Image, ImageDraw, ImageFilter

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'img'
out.mkdir(exist_ok=True)

NAVY_TOP, NAVY_BOT = (16, 26, 58), (6, 10, 24)
TEAL = (46, 214, 196)
GOLD = (255, 200, 90)
MOUNTAIN = (20, 58, 84)
PATH_COL = (255, 226, 150)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def draw(size, safe=1.0):
    """Draw at 4x and downsample. safe < 1 shrinks the emblem for maskable icons (safe zone is 80%)."""
    S = size * 4
    cx = S / 2
    # background: vertical navy gradient
    img = Image.new('RGB', (S, S))
    bg = ImageDraw.Draw(img)
    for y in range(S):
        bg.line([(0, y), (S, y)], fill=lerp(NAVY_TOP, NAVY_BOT, y / S))
    k = safe
    def P(x, y):  # map 0..1 design coordinates (centred) to pixels
        return (cx + (x - 0.5) * S * k, cx + (y - 0.5) * S * k)

    # sun: a gold disc with a soft halo, rising behind the mountain
    halo = Image.new('L', (S, S), 0)
    sx, sy = P(0.5, 0.42)
    r_sun = S * 0.17 * k
    ImageDraw.Draw(halo).ellipse([sx - r_sun * 1.9, sy - r_sun * 1.9, sx + r_sun * 1.9, sy + r_sun * 1.9], fill=255)
    halo = halo.filter(ImageFilter.GaussianBlur(S * 0.06))
    img.paste(Image.new('RGB', (S, S), GOLD), (0, 0), halo.point(lambda v: int(v * 0.45)))
    sun = Image.new('L', (S, S), 0)
    ImageDraw.Draw(sun).ellipse([sx - r_sun, sy - r_sun, sx + r_sun, sy + r_sun], fill=255)
    img.paste(Image.new('RGB', (S, S), GOLD), (0, 0), sun)

    # mountain: a stylized two-peak silhouette (teal-tinted), drawn over the sun's lower half
    mtn = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mtn)
    md.polygon([P(0.05, 0.92), P(0.36, 0.38), P(0.46, 0.52), P(0.60, 0.26), P(0.95, 0.92)], fill=255)
    img.paste(Image.new('RGB', (S, S), MOUNTAIN), (0, 0), mtn)
    # snow-line highlight on the main peak
    snow = Image.new('L', (S, S), 0)
    ImageDraw.Draw(snow).polygon([P(0.60, 0.26), P(0.52, 0.42), P(0.565, 0.40), P(0.60, 0.44), P(0.635, 0.39)], fill=255)
    img.paste(Image.new('RGB', (S, S), (200, 240, 245)), (0, 0), snow.point(lambda v: int(v * 0.85)))

    # curved path climbing from the bottom edge to the peak: a teal glow with a bright core
    pts = []
    for i in range(41):
        t = i / 40
        x = 0.50 + 0.22 * math.sin(t * math.pi * 1.6) * (1 - t) - 0.02 * t
        y = 0.98 - 0.66 * t
        pts.append(P(x, y))
    path_mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(path_mask).line(pts, fill=255, width=int(S * 0.035 * k), joint='curve')
    glow = path_mask.filter(ImageFilter.GaussianBlur(S * 0.02))
    img.paste(Image.new('RGB', (S, S), TEAL), (0, 0), glow.point(lambda v: int(v * 0.8)))
    img.paste(Image.new('RGB', (S, S), PATH_COL), (0, 0), path_mask)

    # a small teal star-spark at the peak for a finishing touch
    spark = Image.new('L', (S, S), 0)
    qx, qy = P(0.60, 0.20)
    rr = S * 0.025 * k
    ImageDraw.Draw(spark).polygon([(qx, qy - rr * 2.2), (qx + rr * 0.5, qy - rr * 0.5), (qx + rr * 2.2, qy),
                                   (qx + rr * 0.5, qy + rr * 0.5), (qx, qy + rr * 2.2), (qx - rr * 0.5, qy + rr * 0.5),
                                   (qx - rr * 2.2, qy), (qx - rr * 0.5, qy - rr * 0.5)], fill=255)
    img.paste(Image.new('RGB', (S, S), TEAL), (0, 0), spark)
    return img.resize((size, size), Image.LANCZOS)

draw(512).save(out / 'icon-512.png', optimize=True)
draw(192).save(out / 'icon-192.png', optimize=True)
draw(180).save(out / 'apple-touch-icon.png', optimize=True)
draw(512, safe=0.78).save(out / 'icon-maskable-512.png', optimize=True)
print('icons written to', out)
