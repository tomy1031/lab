#!/usr/bin/env bash
# Full pipeline: music -> fonts -> video.
# Requirements: python3 (numpy, scipy, fonttools, brotli), node + playwright (Chromium), ffmpeg with libx264.
#   pip install numpy scipy fonttools brotli
#   npm i -g playwright   (or set NODE_PATH to a directory containing it)
# Font sources (SIL OFL) are downloaded from github.com/google/fonts when FONT_DIR is not set.
set -euo pipefail
cd "$(dirname "$0")/.."

WORK=${WORK:-$(mktemp -d)}
FONT_DIR=${FONT_DIR:-$WORK/fonts}
OUT=${OUT:-output/nextmake_mv.mp4}

echo "== BGM"
python3 scripts/make_music.py "$WORK/bgm.wav"
ffmpeg -y -loglevel error -i "$WORK/bgm.wav" -c:a libmp3lame -b:a 192k src/assets/bgm.mp3

echo "== Fonts"
if [ ! -f "$FONT_DIR/NotoSansJP[wght].ttf" ]; then
  mkdir -p "$FONT_DIR"
  base=https://raw.githubusercontent.com/google/fonts/main/ofl
  curl -sSL -o "$FONT_DIR/NotoSansJP[wght].ttf"  "$base/notosansjp/NotoSansJP%5Bwght%5D.ttf"
  curl -sSL -o "$FONT_DIR/NotoSerifJP[wght].ttf" "$base/notoserifjp/NotoSerifJP%5Bwght%5D.ttf"
  curl -sSL -o "$FONT_DIR/Montserrat[wght].ttf"  "$base/montserrat/Montserrat%5Bwght%5D.ttf"
fi
python3 scripts/subset_fonts.py "$FONT_DIR"

echo "== Video"
NODE_PATH=${NODE_PATH:-$(npm root -g)} node scripts/render.cjs --video "$OUT" --audio "$WORK/bgm.wav" --workers "${WORKERS:-4}"
echo "done: $OUT"
