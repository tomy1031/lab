#!/usr/bin/env python3
"""Download the shared iCloud Photos album (Undokai 2025 photos & videos) into media_src/icloud/.

The album is an iCloud Link (share.icloud.com/photos/<id>); it is read through the public CloudKit
endpoints the iCloud web viewer uses — no Apple ID needed. Originals are saved as-is; for photos edited
in Photos (crop/colour), the edited full-size JPEG is saved too as edited_<name>.jpg.

The media are not committed to git (people's faces; 260 MB). Usage: python3 fetch_media.py [short-id]
"""
import base64
import json
import os
import ssl
import sys
import urllib.request

SHORT_ID = sys.argv[1] if len(sys.argv) > 1 else '087QVzMFwDxlKTsSIfoNPpuBQ'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'media_src', 'icloud')
DB = 'https://ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production'
ca = os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None)
CTX = ssl.create_default_context(cafile=ca)


def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {'Content-Type': 'application/json', 'Origin': 'https://www.icloud.com'})
    with urllib.request.urlopen(req, context=CTX) as r:
        return json.load(r)


def main():
    os.makedirs(OUT, exist_ok=True)
    res = post(f'{DB}/public/records/resolve', {'shortGUIDs': [{'value': SHORT_ID}]})['results'][0]
    zone, acc = res['zoneID'], res['anonymousPublicAccess']
    url = f"{acc['databasePartition']}/database/1/com.apple.photos.cloud/production/shared/changes/zone?publicAccessAuthToken={acc['token']}"
    recs, token = [], None
    while True:
        z = {'zoneID': zone, 'resultsLimit': 200}
        if token:
            z['syncToken'] = token
        page = post(url, {'zones': [z]})['zones'][0]
        recs += page['records']
        token = page['syncToken']
        if not page.get('moreComing'):
            break
    masters = {r['recordName']: r for r in recs if r['recordType'] == 'CPLMaster'}
    assets = sorted([r for r in recs if r['recordType'] == 'CPLAsset'], key=lambda a: a['fields']['assetDate']['value'])
    for i, a in enumerate(assets):
        f = masters[a['fields']['masterRef']['value']['recordName']]['fields']
        name = base64.b64decode(f['filenameEnc']['value']).decode()
        stem, ext = os.path.splitext(name)
        jobs = [(f['resOriginalRes']['value']['downloadURL'], f'{i:02d}_{stem}{ext.lower()}')]
        if 'resJPEGFullRes' in a['fields']:
            jobs.append((a['fields']['resJPEGFullRes']['value']['downloadURL'], f'edited_{stem}.jpg'))
        for u, fn in jobs:
            path = os.path.join(OUT, fn)
            if os.path.exists(path):
                continue
            with urllib.request.urlopen(u.replace('${f}', fn), context=CTX) as r, open(path, 'wb') as w:
                w.write(r.read())
            print(fn)
    print(f'{len(assets)} items in {OUT}')


if __name__ == '__main__':
    main()
