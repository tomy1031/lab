#!/usr/bin/env python3
"""Photos of the album -> build/photos/NN_NAME.jpg (HEIC decoded, EXIF orientation applied, edits used).

Usage: python3 prep_photos.py
"""
import glob
import os

import pillow_heif
from PIL import Image, ImageOps

pillow_heif.register_heif_opener()
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'media_src', 'icloud')
OUT = os.path.join(ROOT, 'build', 'photos')
os.makedirs(OUT, exist_ok=True)

for f in sorted(glob.glob(os.path.join(SRC, '[0-9]*.heic')) + glob.glob(os.path.join(SRC, '[0-9]*.jpg'))):
    num, name = os.path.basename(f).split('_', 1)
    stem = os.path.splitext(name)[0]
    edited = os.path.join(SRC, f'edited_{stem}.jpg')
    im = ImageOps.exif_transpose(Image.open(edited if os.path.exists(edited) else f)).convert('RGB')
    im.thumbnail((2400, 2400), Image.LANCZOS)
    im.save(os.path.join(OUT, f'{num}_{stem}.jpg'), quality=93)
print('photos ->', OUT)
