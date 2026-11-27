"""Cut a square face portrait from a full frame, brighten it and upscale.

facecrop(frame_rgb_pil, box(x,y,w,h), size=640, scale=2.3, lift=..) -> PIL RGB
"""
import numpy as np
from PIL import Image, ImageFilter


def tone(arr, lift=0.0, warm=0.0, sat=1.0):
    """arr float 0..1 RGB. lift: shadow/midtone lift amount (0..0.5). warm: + makes warmer."""
    a = arr.copy()
    if lift:
        # filmic lift: brighten mid/shadows, protect highlights
        a = 1 - (1 - a) ** (1 + lift * 2)
    if warm:
        a[..., 0] *= 1 + warm
        a[..., 2] *= 1 - warm
    if sat != 1:
        y = (a * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
        a = y + (a - y) * sat
    return np.clip(a, 0, 1)


def facecrop(frame, box, size=640, scale=2.3, down=0.12, lift=0.25, warm=0.0, sat=1.05):
    x, y, w, h = box
    cx, cy = x + w / 2, y + h / 2 + down * h
    s = h * scale
    x0, y0 = cx - s / 2, cy - s / 2
    # pad if out of frame
    W, H = frame.size
    x0 = max(0, min(W - s, x0))
    y0 = max(0, min(H - s, y0))
    crop = frame.crop((int(x0), int(y0), int(x0 + s), int(y0 + s)))
    big = crop.resize((size, size), Image.LANCZOS)
    a = np.asarray(big).astype(np.float32) / 255
    a = tone(a, lift=lift, warm=warm, sat=sat)
    out = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
    out = out.filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
    return out
