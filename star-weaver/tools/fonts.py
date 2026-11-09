# tools/fonts.py — self-hosted fonts for offline play: subsets Outfit (Latin, variable weight) and
# Zen Kaku Gothic New (Japanese, 400/500/700/900) down to the characters this app actually shows
# (every non-ASCII character in js/*.js and index.html, plus printable ASCII), as woff2.
#
#   pip install fonttools brotli
#   python3 tools/fonts.py <dir with Outfit[wght].ttf and ZenKakuGothicNew-*.ttf>
#
# Sources: https://github.com/google/fonts/tree/main/ofl/outfit and .../ofl/zenkakugothicnew (SIL OFL 1.1,
# no Reserved Font Names). Re-run after adding new Japanese text; characters outside the subset still
# render, just in the system font.
import pathlib, subprocess, sys

root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
out = root / 'fonts'
out.mkdir(exist_ok=True)

chars = set(chr(c) for c in range(0x20, 0x7f))
for f in list((root / 'js').glob('*.js')) + [root / 'index.html']:
    chars |= {c for c in f.read_text(encoding='utf-8') if ord(c) > 0x7f}
chars |= set('　、。・「」『』（）！？：；〜ー…‥―–—·×→←↑↓★☆∞♪')
text = ''.join(sorted(chars))
(out / '.subset-chars.txt').write_text(text, encoding='utf-8')

def subset(font, dest, unicodes_text=None, latin_only=False):
    args = [sys.executable, '-m', 'fontTools.subset', str(src / font), f'--output-file={out / dest}', '--flavor=woff2',
            '--layout-features=*', '--no-hinting', '--desubroutinize']
    if latin_only:
        args.append('--unicodes=U+0020-007E,U+00A0-00FF,U+2010-2027,U+2190-2193,U+00B7,U+00D7,U+221E,U+2605,U+2606')
    else:
        args.append(f'--text-file={out / ".subset-chars.txt"}')
    subprocess.run(args, check=True)
    print(f'{dest}: {(out / dest).stat().st_size // 1024} KB')

subset('Outfit[wght].ttf', 'Outfit.woff2', latin_only=True)
for w, name in [(400, 'Regular'), (500, 'Medium'), (700, 'Bold'), (900, 'Black')]:
    subset(f'ZenKakuGothicNew-{name}.ttf', f'ZenKakuGothicNew-{w}.woff2')
for lic in ['Outfit-OFL.txt', 'ZenKakuGothicNew-OFL.txt']:
    if (src / lic).exists():
        (out / lic).write_text((src / lic).read_text(encoding='utf-8'), encoding='utf-8')
(out / '.subset-chars.txt').unlink()
print(f'{len(text)} characters')
