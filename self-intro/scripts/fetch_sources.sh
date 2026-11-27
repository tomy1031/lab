#!/bin/bash
# Download the class's iCloud shared album into self-intro/ (git-ignored):
#   dlorig/  original videos (1080p, ~2.4 GB)      dl360/  small 360p copies (for transcription)
#   dlphoto/ photos as JPEG (the class photo IMG_1207 is used in the opening)
# The album link expires on 2026-12-27. Download URLs expire after a few minutes, so each round re-resolves them.
# usage: scripts/fetch_sources.sh [resOriginalRes|resVidSmallRes|resJPEGMedRes ...]
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/meta"
fetch() {
  local KEY=$1 OUT=$2 EXT=$3
  mkdir -p "$OUT"
  for round in 1 2 3 4 5 6; do
    python3 -I "$ROOT/scripts/icloud_list.py" "$ROOT/meta/list_$KEY.json" > /dev/null || { sleep 5; continue; }
    local left=0
    while IFS=$'\t' read -r name url size; do
      local f="$OUT/${name%.*}${EXT:+.$EXT}"; [ -z "$EXT" ] && f="$OUT/$name"
      [ "$(stat -c %s "$f" 2>/dev/null || echo 0)" = "$size" ] && continue
      echo "[$round] $name"
      curl -s -f -C - --speed-limit 40000 --speed-time 15 -o "$f" "$url" || true
      [ "$(stat -c %s "$f" 2>/dev/null || echo 0)" = "$size" ] || left=$((left + 1))
    done < <(python3 -I -c "
import json
for it in json.load(open('$ROOT/meta/list_$KEY.json')):
    r = it['res'].get('$KEY')
    if r: print(it['name'], r['url'], r['size'], sep='\t')
")
    echo "$KEY round $round: $left left"
    [ $left = 0 ] && return 0
  done
  return 1
}
for k in "${@:-resJPEGMedRes resVidSmallRes resOriginalRes}"; do
  for key in $k; do
    case $key in
      resOriginalRes) fetch resOriginalRes "$ROOT/dlorig" "" ;;
      resVidSmallRes) fetch resVidSmallRes "$ROOT/dl360" mp4 ;;
      resJPEGMedRes) fetch resJPEGMedRes "$ROOT/dlphoto" jpg ;;
    esac
  done
done
