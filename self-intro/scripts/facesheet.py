"""Rank face candidates and save a sheet of the best N crops (from the 1080p original)."""
import cv2, json, sys, numpy as np
vid, fj, out = sys.argv[1], sys.argv[2], sys.argv[3]
N = int(sys.argv[4]) if len(sys.argv) > 4 else 12
c = json.load(open(fj))
# keep faces that are not on the projector: person faces are usually lower than y>250 and the subject is tracked; just rank
for f in c:
    f['rank'] = f['h'] * min(f['sharp'], 400) ** 0.5 * f['score'] * max(0, 1 - 2.5 * f['yaw'])
c.sort(key=lambda f: -f['rank'])
picked = []
for f in c:
    if all(abs(f['t'] - p['t']) > 3 for p in picked):
        picked.append(f)
    if len(picked) >= N: break
cap = cv2.VideoCapture(vid); fps = cap.get(5)
tiles = []
for p in picked:
    cap.set(cv2.CAP_PROP_POS_MSEC, p['t'] * 1000); ok, fr = cap.read()
    if not ok: continue
    cx, cy, s = p['x'] + p['w'] // 2, p['y'] + p['h'] // 2, int(p['h'] * 1.8)
    x0, y0 = max(0, cx - s // 2), max(0, cy - s // 2)
    crop = cv2.resize(fr[y0:y0 + s, x0:x0 + s], (240, 240))
    cv2.putText(crop, f"{p['t']:.1f}s h{p['h']}", (5, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)
    tiles.append(crop)
while len(tiles) % 6: tiles.append(np.zeros((240, 240, 3), np.uint8))
rows = [np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)]
cv2.imwrite(out, np.vstack(rows))
json.dump(picked, open(out + '.json', 'w'))
