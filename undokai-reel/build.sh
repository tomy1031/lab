#!/bin/bash
# Charity UNDOKAI 2026 reel: media -> assets -> music -> video
set -euo pipefail
cd "$(dirname "$0")"
[ -d media_src/icloud ] && [ "$(ls media_src/icloud | wc -l)" -ge 34 ] || python3 scripts/fetch_media.py
[ -f media_src/bgm_kusikos_post.mp3 ] || { echo "put the BGM at media_src/bgm_kusikos_post.mp3"; exit 1; }
python3 scripts/prep_photos.py
python3 scripts/make_assets.py
python3 scripts/music.py build/music.wav
python3 scripts/render.py output/undokai_2026_reel.mp4
ffmpeg -v error -y -ss 1.1 -i output/undokai_2026_reel.mp4 -frames:v 1 -q:v 2 output/cover_hook.jpg
ffmpeg -v error -y -ss 27.0 -i output/undokai_2026_reel.mp4 -frames:v 1 -q:v 2 output/cover_info.jpg
ffmpeg -v error -y -i output/undokai_2026_reel.mp4 -vf scale=720:1280 -c:v libx264 -crf 23 -preset slow \
  -c:a aac -b:a 160k -movflags +faststart output/undokai_2026_reel_720p.mp4
echo done
