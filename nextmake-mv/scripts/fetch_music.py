#!/usr/bin/env python3
"""Download the free BGM used by films 02 and 03 from OpenTracks (formerly DOVA-SYNDROME).

The OpenTracks licence allows the tracks as background music in videos (commercial use included,
no credit required), but forbids redistributing the audio files themselves. So the tracks are not
committed: this script fetches them through the site's normal download form into music_src/
(git-ignored), and scripts/music_ceo.py / music_nmclaw.py edit them to picture.

Licence: https://opentracks.com/help/articles/license/
Usage: python3 fetch_music.py [dest_dir]
"""
import http.cookiejar
import os
import re
import sys
import urllib.parse
import urllib.request

TRACKS = {
    # slug: (OpenTracks id, title, composer)
    'swingby': (22209, 'スイングバイ', 'のる'),
    'future_next': (9485, 'Future Next', 'FLASH☆BEAT'),
}
SITE = 'https://opentracks.com'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'


def fetch(track_id, dest):
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    page = f'{SITE}/bgm/detail/{track_id}/download'
    req = urllib.request.Request(page, headers={'User-Agent': UA, 'Referer': f'{SITE}/bgm/detail/{track_id}'})
    html = op.open(req, timeout=60).read().decode('utf-8', 'ignore')
    token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html).group(1)
    body = urllib.parse.urlencode({'csrfmiddlewaretoken': token, 'track': '1'}).encode()
    req = urllib.request.Request(page, data=body, headers={'User-Agent': UA, 'Referer': page, 'Origin': SITE})
    with op.open(req, timeout=120) as r:
        if 'audio' not in r.headers.get('Content-Type', ''):
            raise RuntimeError(f'track {track_id}: expected audio, got {r.headers.get("Content-Type")}')
        data = r.read()
    with open(dest, 'wb') as f:
        f.write(data)
    return len(data)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'music_src')
    os.makedirs(out, exist_ok=True)
    for slug, (tid, title, by) in TRACKS.items():
        dest = os.path.join(out, slug + '.mp3')
        if os.path.exists(dest):
            print(f'{slug}: already there')
            continue
        n = fetch(tid, dest)
        print(f'{slug}: 「{title}」 by {by} — {n / 1e6:.1f} MB')
