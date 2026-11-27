#!/bin/bash
# Fonts, models and the BGM (all git-ignored). usage: scripts/fetch_assets.sh
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/fonts" "$ROOT/models" "$ROOT/music_src" "$ROOT/meta"
GF=https://raw.githubusercontent.com/google/fonts/main/ofl   # SIL Open Font License
for f in zenmarugothic/ZenMaruGothic-Bold.ttf zenmarugothic/ZenMaruGothic-Medium.ttf kleeone/KleeOne-SemiBold.ttf \
         notosansjp/NotoSansJP%5Bwght%5D.ttf montserrat/Montserrat%5Bwght%5D.ttf; do
  n=$(basename "$f" | sed 's/%5B/[/;s/%5D/]/')
  [ -f "$ROOT/fonts/$n" ] || curl -sfL -o "$ROOT/fonts/$n" "$GF/$f"
done
M=$ROOT/models
[ -f "$M/yunet.onnx" ] || curl -sfL -o "$M/yunet.onnx" https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx
[ -f "$M/realesr-general-x4v3.pth" ] || curl -sfL -o "$M/realesr-general-x4v3.pth" https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth
[ -f "$M/std.rnnn" ] || curl -sfL -o "$M/std.rnnn" https://raw.githubusercontent.com/richardpl/arnndn-models/master/std.rnnn
# BGM: 「パステルハウス」かずち (OpenTracks, formerly DOVA-SYNDROME) — fine as video BGM, but the file itself may not be redistributed
[ -f "$ROOT/music_src/pastel_house.mp3" ] || python3 -c "
import sys; sys.path.insert(0, '$ROOT/../nextmake-mv/scripts')
from fetch_music import fetch
print(fetch(1021, '$ROOT/music_src/pastel_house.mp3'))"
python3 -I "$ROOT/scripts/chime.py" "$ROOT/meta/chime.wav"
