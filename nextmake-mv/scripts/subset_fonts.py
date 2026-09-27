#!/usr/bin/env python3
"""Subset the variable fonts to exactly the glyphs the MV uses.

Usage: python3 subset_fonts.py <dir-with-ttf>
Expects NotoSansJP[wght].ttf, NotoSerifJP[wght].ttf, Montserrat[wght].ttf
(from github.com/google/fonts, SIL Open Font License) and writes woff2 files to src/fonts/.
"""
import pathlib
import string
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
ttf_dir = pathlib.Path(sys.argv[1])

chars = set(string.printable)
for f in (SRC / 'mv.js', SRC / 'index.html'):
    chars |= set(f.read_text(encoding='utf-8'))
chars |= set('、。「」『』（）｜・〜ー―×→✓％＋')
chars = ''.join(sorted(c for c in chars if c.isprintable() or c == ' '))
(ROOT / 'scripts' / '.glyphs.txt').write_text(chars, encoding='utf-8')

out = SRC / 'fonts'
out.mkdir(exist_ok=True)
for src, dst in [('NotoSansJP[wght].ttf', 'NotoSansJP.woff2'),
                 ('NotoSerifJP[wght].ttf', 'NotoSerifJP.woff2'),
                 ('Montserrat[wght].ttf', 'Montserrat.woff2')]:
    subprocess.run(['pyftsubset', str(ttf_dir / src), f'--text-file={ROOT / "scripts" / ".glyphs.txt"}',
                    '--flavor=woff2', '--layout-features=*', f'--output-file={out / dst}'], check=True)
    print(dst, (out / dst).stat().st_size // 1024, 'KB')
