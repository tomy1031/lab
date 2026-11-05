"""キャラクターのスプライトシート（4 行 × 3 列・透明背景）を 1 体ずつ切り出す。

使い方: python3 scripts/slice_sprites.py <シート.png> <名前（jp / kh / robot）> [<出力フォルダ>]
- 列 = ポーズ（0 立ち・1 歩き・2 座ってタイピング）、行 = キャラクター（0..3）
- 出力: <出力フォルダ>/<名前>-<行>-<ポーズ>.webp（同じシートは同じ倍率・足元をそろえる）と faces/<名前>-<行>.webp（顔のアイコン）
- 位置と大きさを sprites.json にまとめる（3D の板・画面のアイコンが使う）
シートは codex（OpenAI の画像生成）で docs/img/design_reference.jpg の画風に合わせて作ったもの。
"""
import json
import sys
from pathlib import Path

from PIL import Image

POSES = ['stand', 'walk', 'sit']


def components(alpha: Image.Image, thr: int = 24):
    """不透明な部分のかたまり（縮小して数える）→ 元の大きさの外接矩形"""
    scale = 4
    small = alpha.resize((alpha.width // scale, alpha.height // scale))
    w, h = small.size
    px = small.load()
    seen = [[False] * w for _ in range(h)]
    boxes = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y] < thr:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while stack:
                cx, cy = stack.pop()
                n += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for dx in (-2, -1, 0, 1, 2):
                    for dy in (-2, -1, 0, 1, 2):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny] >= thr:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            if n > 60:
                boxes.append((x0 * scale, y0 * scale, (x1 + 1) * scale, (y1 + 1) * scale, n))
    return boxes


def bands(profile: list[int], min_gap: int, min_len: int) -> list[tuple[int, int]]:
    """投影（行や列ごとの不透明な画素の数）から、中身のある帯を探す"""
    out: list[tuple[int, int]] = []
    start = None
    gap = 0
    for i, v in enumerate(profile + [0] * (min_gap + 1)):
        if v > 2:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap > min_gap:
                end = i - gap + 1
                if end - start >= min_len:
                    out.append((start, end))
                start = None
                gap = 0
    return out


def grid_boxes(alpha: Image.Image):
    """格子に並んだシート：横の帯（行）→ それぞれの行の中の縦の帯（列）"""
    a = alpha.point(lambda v: 255 if v > 24 else 0)
    w, h = a.size
    px = a.load()
    rows = bands([sum(1 for x in range(0, w, 2) if px[x, y]) for y in range(h)], 6, 40)
    boxes = []
    for y0, y1 in rows:
        cols = bands([sum(1 for y in range(y0, y1, 2) if px[x, y]) for x in range(w)], 10, 30)
        for x0, x1 in cols:
            sub = a.crop((x0, y0, x1, y1)).getbbox()
            if sub:
                boxes.append((x0 + sub[0], y0 + sub[1], x0 + sub[2], y0 + sub[3], (x1 - x0) * (y1 - y0)))
    return boxes


def main() -> None:
    src = Path(sys.argv[1])
    name = sys.argv[2]
    out = Path(sys.argv[3] if len(sys.argv) > 3 else 'client/public/sprites')
    (out / 'faces').mkdir(parents=True, exist_ok=True)
    sheet = Image.open(src).convert('RGBA')
    boxes = grid_boxes(sheet.getchannel('A'))
    if len(boxes) != 12:
        boxes = components(sheet.getchannel('A'))
        boxes.sort(key=lambda b: -b[4])
        boxes = boxes[:12]
    if len(boxes) != 12:
        raise SystemExit(f'{src}: 12 体のはずが {len(boxes)} 個見つかりました')
    # 行（y の中心）→ 列（x の中心）の順に並べる
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows = [sorted(boxes[i * 3:(i + 1) * 3], key=lambda b: (b[0] + b[2]) / 2) for i in range(4)]
    # 同じシートは同じ倍率：立ち姿の高さの最大を 512px にそろえる
    stand_h = max(r[0][3] - r[0][1] for r in rows)
    k = 512 / stand_h
    meta = json.loads((out / 'sprites.json').read_text()) if (out / 'sprites.json').exists() else {}
    for ri, row in enumerate(rows):
        for pi, (x0, y0, x1, y1, _) in enumerate(row):
            pad = 6
            crop = sheet.crop((max(0, x0 - pad), max(0, y0 - pad), min(sheet.width, x1 + pad), min(sheet.height, y1 + pad)))
            crop = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
            key = f'{name}-{ri}-{POSES[pi]}'
            crop.save(out / f'{key}.webp', 'WEBP', quality=88, method=6)
            # 足元（いちばん下の不透明な行）
            a = crop.getchannel('A')
            bbox = a.point(lambda v: 255 if v > 40 else 0).getbbox() or (0, 0, crop.width, crop.height)
            meta[key] = {'w': crop.width, 'h': crop.height, 'footY': bbox[3] / crop.height, 'cx': ((bbox[0] + bbox[2]) / 2) / crop.width}
        # 顔のアイコン：立ち姿の上の方（頭）を正方形に
        x0, y0, x1, y1, _ = row[0]
        fw = x1 - x0
        side = int(fw * 0.92)
        cx = (x0 + x1) // 2
        top = y0 + int(fw * 0.02)
        face = sheet.crop((cx - side // 2, top, cx + side // 2, top + side)).resize((128, 128), Image.LANCZOS)
        face.save(out / 'faces' / f'{name}-{ri}.webp', 'WEBP', quality=90, method=6)
    (out / 'sprites.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f'{name}: 12 枚と顔 4 枚を {out} に書き出しました（倍率 {k:.3f}）')


if __name__ == '__main__':
    main()
