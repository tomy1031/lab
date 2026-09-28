#!/usr/bin/env bash
# Full pipeline for all four films: music -> fonts -> video.
# Requirements: python3 (numpy, scipy, fonttools, brotli), node + playwright (Chromium), ffmpeg with libx264.
#   pip install numpy scipy fonttools brotli pyloudnorm
#   npm i -g playwright   (or set NODE_PATH to a directory containing it)
# Font sources (SIL OFL) are downloaded from github.com/google/fonts when FONT_DIR is not set.
set -euo pipefail
cd "$(dirname "$0")/.."

WORK=${WORK:-$(mktemp -d)}
FONT_DIR=${FONT_DIR:-$WORK/fonts}
WORKERS=${WORKERS:-4}
export NODE_PATH=${NODE_PATH:-$(npm root -g)}

echo "== Music"
python3 scripts/fetch_music.py            # films 02/03: free BGM from OpenTracks (not redistributed)
python3 scripts/music_invest.py "$WORK/invest.wav"
python3 scripts/music_ceo.py "$WORK/ceo.wav"
python3 scripts/music_nmclaw.py "$WORK/nmclaw.wav"
python3 scripts/music_ido.py "$WORK/ido.wav"
ffmpeg -y -loglevel error -i "$WORK/invest.wav" -c:a libmp3lame -b:a 192k src/assets/invest_bgm.mp3
ffmpeg -y -loglevel error -i "$WORK/ceo.wav" -c:a libmp3lame -b:a 192k src/assets/ceo_score.mp3
ffmpeg -y -loglevel error -i "$WORK/nmclaw.wav" -c:a libmp3lame -b:a 192k src/assets/nmclaw_score.mp3
ffmpeg -y -loglevel error -i "$WORK/ido.wav" -c:a libmp3lame -b:a 192k src/assets/ido_score.mp3

echo "== Fonts"
if [ ! -f "$FONT_DIR/NotoSansJP[wght].ttf" ]; then
  mkdir -p "$FONT_DIR"
  base=https://raw.githubusercontent.com/google/fonts/main/ofl
  curl -sSL -o "$FONT_DIR/NotoSansJP[wght].ttf"  "$base/notosansjp/NotoSansJP%5Bwght%5D.ttf"
  curl -sSL -o "$FONT_DIR/NotoSerifJP[wght].ttf" "$base/notoserifjp/NotoSerifJP%5Bwght%5D.ttf"
  curl -sSL -o "$FONT_DIR/Montserrat[wght].ttf"  "$base/montserrat/Montserrat%5Bwght%5D.ttf"
fi
python3 scripts/subset_fonts.py "$FONT_DIR"

encode() {  # $1 silent render, $2 wav, $3 output name
  ffmpeg -y -loglevel error -i "$1" -i "$2" -map 0:v -map 1:a -c:v libx264 -preset slow -crf 24 -tune film \
    -profile:v high -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -shortest "output/$3.mp4"
  ffmpeg -y -loglevel error -i "output/$3.mp4" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 24 \
    -tune film -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "output/$3_720p.mp4"
}

echo "== Film 01"
node scripts/render.cjs --page invest/index.html --video "$WORK/invest.mp4" --duration 100 --workers "$WORKERS" --crf 16
encode "$WORK/invest.mp4" "$WORK/invest.wav" 01_invest_in_the_next

echo "== Film 02"
node scripts/render.cjs --page ceo/index.html --video "$WORK/ceo.mp4" --duration 154 --workers "$WORKERS" --crf 16
encode "$WORK/ceo.mp4" "$WORK/ceo.wav" 02_yaruka_yaranaika

echo "== Promo 03 NMClaw"
node scripts/render.cjs --page nmclaw/index.html --video "$WORK/nmclaw.mp4" --duration 86 --workers "$WORKERS" --crf 16
encode "$WORK/nmclaw.mp4" "$WORK/nmclaw.wav" 03_nmclaw_promo

echo "== Promo 04 IDO"
node scripts/render.cjs --page ido/index.html --video "$WORK/ido.mp4" --duration 100 --workers "$WORKERS" --crf 16
encode "$WORK/ido.mp4" "$WORK/ido.wav" 04_ido_promo
echo "done: output/"
