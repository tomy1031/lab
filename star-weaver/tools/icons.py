# tools/icons.py — draws the app icons (a glowing four-point star on a night-sky disc) with Pillow.
#   python3 tools/icons.py
import math, pathlib
from PIL import Image, ImageDraw, ImageFilter

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'img'
out.mkdir(exist_ok=True)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def draw(size, safe=1.0):
    S = size * 4  # supersample
    img = Image.new('RGB', (S, S))
    px = img.load()
    top, bot = (24, 22, 72), (6, 5, 22)
    cx = cy = S / 2
    for y in range(S):
        for x in range(0, S):
            r = math.hypot(x - cx, y - cy) / (S * 0.72)
            base = lerp(top, bot, min(1, y / S * 0.6 + r * 0.6))
            px[x, y] = base
    # aurora glow
    glow = Image.new('RGB', (S, S), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([S * 0.15, S * 0.1, S * 0.85, S * 0.7], fill=(70, 60, 190))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.12))
    img = Image.blend(img, Image.composite(glow, img, glow.convert('L')), 0.6)
    k = safe
    # orbit ring
    ring = Image.new('L', (S, S), 0)
    rd = ImageDraw.Draw(ring)
    w = int(S * 0.018 * k)
    rd.ellipse([cx - S * 0.36 * k, cy - S * 0.14 * k, cx + S * 0.36 * k, cy + S * 0.14 * k], outline=255, width=w)
    ring = ring.rotate(-24, resample=Image.BICUBIC, center=(cx, cy))
    ringcol = Image.new('RGB', (S, S), (255, 120, 200))
    img.paste(ringcol, (0, 0), ring.point(lambda v: int(v * 0.8)))
    # star: soft glow + sharp four-point shape, cyan→pink gradient
    star = Image.new('L', (S, S), 0)
    sd = ImageDraw.Draw(star)
    R, r = S * 0.33 * k, S * 0.075 * k
    pts = []
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 4
        rr = R if i % 2 == 0 else r
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    sd.polygon(pts, fill=255)
    halo = star.filter(ImageFilter.GaussianBlur(S * 0.05))
    grad = Image.new('RGB', (S, S))
    gp = grad.load()
    for y in range(S):
        for x in range(S):
            t = max(0, min(1, (x - y) / S * 0.9 + 0.5))
            gp[x, y] = lerp((76, 201, 255), (255, 95, 183), t)
    img.paste(grad, (0, 0), halo.point(lambda v: int(v * 0.9)))
    white = Image.new('RGB', (S, S), (255, 255, 255))
    core = star.filter(ImageFilter.GaussianBlur(S * 0.004))
    img.paste(grad, (0, 0), core)
    inner = Image.new('L', (S, S), 0)
    ImageDraw.Draw(inner).ellipse([cx - S * 0.05 * k, cy - S * 0.05 * k, cx + S * 0.05 * k, cy + S * 0.05 * k], fill=255)
    img.paste(white, (0, 0), inner.filter(ImageFilter.GaussianBlur(S * 0.02)))
    return img.resize((size, size), Image.LANCZOS)

draw(512).save(out / 'icon-512.png', optimize=True)
draw(192).save(out / 'icon-192.png', optimize=True)
draw(180).save(out / 'apple-touch-icon.png', optimize=True)
draw(512, safe=0.78).save(out / 'icon-maskable-512.png', optimize=True)
print('icons written to', out)
