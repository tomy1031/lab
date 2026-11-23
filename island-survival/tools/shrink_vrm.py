#!/usr/bin/env python3
"""Shrink textures inside a VRM/GLB (glTF binary) by downscaling images.

Usage: python3 -I shrink_vrm.py in.vrm out.vrm --max 1024
"""
import argparse
import io
import json
import struct
import sys

from PIL import Image

MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942


def read_glb(path):
    data = open(path, "rb").read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != MAGIC or version != 2:
        sys.exit("not a glTF 2.0 binary")
    off = 12
    js = None
    binc = b""
    while off < min(length, len(data)):
        clen, ctype = struct.unpack_from("<II", data, off)
        body = data[off + 8:off + 8 + clen]
        if ctype == CHUNK_JSON:
            js = json.loads(body.decode("utf-8"))
        elif ctype == CHUNK_BIN and not binc:
            binc = body
        off += 8 + clen
    if js is None:
        sys.exit("no JSON chunk")
    return js, binc


def pad(b, n, fill):
    r = (-len(b)) % n
    return b + fill * r


def shrink_image(raw, mime, max_side):
    im = Image.open(io.BytesIO(raw))
    im.load()
    w, h = im.size
    if max(w, h) > max_side:
        s = max_side / max(w, h)
        nw, nh = max(1, round(w * s)), max(1, round(h * s))
        if im.mode in ("P", "LA", "PA"):
            im = im.convert("RGBA")
        im = im.resize((nw, nh), Image.LANCZOS)
    else:
        return raw, (w, h), (w, h)
    out = io.BytesIO()
    if mime == "image/png":
        im.save(out, "PNG", optimize=True)
    elif mime == "image/jpeg":
        if im.mode != "RGB":
            im = im.convert("RGB")
        im.save(out, "JPEG", quality=90, optimize=True)
    else:
        return raw, (w, h), (w, h)
    new = out.getvalue()
    if len(new) >= len(raw) and False:
        return raw, (w, h), (w, h)
    return new, (w, h), im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--max", type=int, default=1024)
    a = ap.parse_args()

    js, binc = read_glb(a.src)
    views = js.get("bufferViews", [])
    replaced = {}
    tot_b = tot_a = 0
    for i, img in enumerate(js.get("images", [])):
        bv = img.get("bufferView")
        if bv is None:
            continue
        v = views[bv]
        raw = binc[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
        mime = img.get("mimeType", "image/png")
        new, s0, s1 = shrink_image(raw, mime, a.max)
        replaced[bv] = new
        tot_b += len(raw)
        tot_a += len(new)
        print(f"image {i} ({img.get('name', '')}, {mime}): {s0[0]}x{s0[1]} {len(raw):,} B -> {s1[0]}x{s1[1]} {len(new):,} B")
    print(f"images total: {tot_b:,} B -> {tot_a:,} B")

    out = bytearray()
    for i, v in enumerate(views):
        if v.get("buffer", 0) != 0:
            sys.exit("multiple buffers unsupported")
        if i in replaced:
            body = replaced[i]
        else:
            o = v.get("byteOffset", 0)
            body = binc[o:o + v["byteLength"]]
        out += b"\0" * ((-len(out)) % 4)
        v["byteOffset"] = len(out)
        v["byteLength"] = len(body)
        out += body
    out = bytes(pad(bytes(out), 4, b"\0"))
    js["buffers"][0]["byteLength"] = len(out)

    jb = pad(json.dumps(js, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), 4, b" ")
    total = 12 + 8 + len(jb) + 8 + len(out)
    with open(a.dst, "wb") as f:
        f.write(struct.pack("<III", MAGIC, 2, total))
        f.write(struct.pack("<II", len(jb), CHUNK_JSON) + jb)
        f.write(struct.pack("<II", len(out), CHUNK_BIN) + out)
    import os
    print(f"file: {os.path.getsize(a.src):,} B -> {os.path.getsize(a.dst):,} B")


if __name__ == "__main__":
    main()
