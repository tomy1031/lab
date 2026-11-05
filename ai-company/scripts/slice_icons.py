"""アイコンのシート（4 × 4・透明背景）を 1 つずつ切り出す。
使い方: python3 scripts/slice_icons.py <シート.png> [<出力フォルダ>]
出力: <出力フォルダ>/<名前>.webp（192px の正方形）。シートは codex で参考デザインのドックの質感に合わせて生成したもの
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from slice_sprites import grid_boxes  # noqa: E402

NAMES = ['folder', 'task', 'chat', 'doc', 'people', 'chart', 'target', 'robot', 'globe', 'hand', 'bell', 'calendar', 'settings', 'search', 'spark', 'check']


def main() -> None:
    sheet = Image.open(sys.argv[1]).convert('RGBA')
    out = Path(sys.argv[2] if len(sys.argv) > 2 else 'client/public/icons')
    out.mkdir(parents=True, exist_ok=True)
    boxes = grid_boxes(sheet.getchannel('A'))
    if len(boxes) != len(NAMES):
        raise SystemExit(f'{len(NAMES)} 個のはずが {len(boxes)} 個')
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows = [sorted(boxes[i * 4:(i + 1) * 4], key=lambda b: b[0]) for i in range(4)]
    for name, (x0, y0, x1, y1, _) in zip(NAMES, [b for r in rows for b in r]):
        side = max(x1 - x0, y1 - y0) + 8
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        crop = sheet.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)).resize((192, 192), Image.LANCZOS)
        crop.save(out / f'{name}.webp', 'WEBP', quality=90, method=6)
    print(f'{len(NAMES)} 個を {out} に書き出しました')


if __name__ == '__main__':
    main()
