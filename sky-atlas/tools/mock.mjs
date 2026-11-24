// tools/mock.mjs — a pretend internet for the tests: Playwright answers every map request itself, so the
// tests run with no network and always see the same world.
//   imagery (EOX, aerial): a coloured checkerboard per zoom      terrain (Terrarium, 国土地理院): a 3000 m cone at MOUNT
//   Overpass: a little grid of buildings around the request      Nominatim: one fixed result
import zlib from 'node:zlib';

export const MOUNT = { lat: 35.3606, lon: 138.7274, h: 3000, r: 9000 }; // a cone on 富士山's spot

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}
// rgb: Uint8Array(w*h*3)
export function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const D2R = Math.PI / 180;
const tx2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const ty2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / D2R;
function heightAt(lat, lon) {
  const dy = (lat - MOUNT.lat) * 111320, dx = (lon - MOUNT.lon) * 111320 * Math.cos(MOUNT.lat * D2R);
  const d = Math.hypot(dx, dy);
  return Math.max(0, MOUNT.h * (1 - d / MOUNT.r)) + 50;
}

const cache = new Map();
function demPng(z, x, y, kind) {
  const key = `${kind}/${z}/${x}/${y}`;
  if (cache.has(key)) return cache.get(key);
  const N = 64; // small tiles keep the tests fast (the game reads any size)
  const rgb = new Uint8Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = heightAt(ty2lat(y + (j + 0.5) / N, z), tx2lon(x + (i + 0.5) / N, z));
    const k = (j * N + i) * 3;
    if (kind === 'gsi') { const v = Math.round(h * 100); rgb[k] = (v >> 16) & 255; rgb[k + 1] = (v >> 8) & 255; rgb[k + 2] = v & 255; }
    else { const v = h + 32768; rgb[k] = Math.floor(v / 256); rgb[k + 1] = Math.floor(v) % 256; rgb[k + 2] = Math.floor((v % 1) * 256); }
  }
  const b = png(N, N, rgb);
  cache.set(key, b);
  return b;
}
function imgPng(z, x, y, aerial) {
  const key = `img/${aerial}/${z}/${x}/${y}`;
  if (cache.has(key)) return cache.get(key);
  const N = 32, rgb = new Uint8Array(N * N * 3);
  const base = aerial ? [150, 120, 90] : [70 + (z * 37) % 120, 120 + (z * 23) % 100, 80];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 3, c = ((i >> 3) + (j >> 3) + x + y) & 1 ? 1 : 0.8;
    rgb[k] = base[0] * c; rgb[k + 1] = base[1] * c; rgb[k + 2] = base[2] * c;
  }
  const b = png(N, N, rgb);
  cache.set(key, b);
  return b;
}
function overpass(body) {
  const m = decodeURIComponent(String(body).replace(/\+/g, ' ')).match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
  const [s, w, n, e] = m.slice(1).map(Number);
  const cl = (s + n) / 2, cn = (w + e) / 2, elements = [];
  let id = 1;
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
    const lat = cl + a * 0.0015, lon = cn + b * 0.0018, d = 0.0003;
    const geometry = [[lat - d, lon - d], [lat - d, lon + d], [lat + d, lon + d], [lat + d, lon - d], [lat - d, lon - d]].map(([la, lo]) => ({ lat: la, lon: lo }));
    elements.push({ type: 'way', id: id++, tags: { building: (a + b) % 3 ? 'yes' : 'office', ...(a === 0 && b === 0 ? { height: '120' } : {}) }, geometry });
  }
  return JSON.stringify({ elements });
}

// route every external request of a Playwright context (or page). Returns a request counter.
export async function mockNet(target, { offline = () => false } = {}) {
  const count = { tiles: 0, overpass: 0, nominatim: 0, other: 0 };
  await target.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
    const req = route.request(), url = req.url();
    if (offline()) { count.other++; return route.abort('internetdisconnected'); }
    const cors = { 'access-control-allow-origin': '*' };
    let m;
    if ((m = url.match(/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/))) { count.tiles++; return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: demPng(+m[1], +m[2], +m[3], 't') }); }
    if ((m = url.match(/dem_png\/(\d+)\/(\d+)\/(\d+)\.png/))) { count.tiles++; return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: demPng(+m[1], +m[2], +m[3], 'gsi') }); }
    if ((m = url.match(/tiles\.maps\.eox\.at\/.*\/g\/(\d+)\/(\d+)\/(\d+)\.jpg/))) { count.tiles++; return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: imgPng(+m[1], +m[3], +m[2], false) }); }
    if ((m = url.match(/seamlessphoto\/(\d+)\/(\d+)\/(\d+)\.jpg/))) {
      count.tiles++;
      // a few aerial tiles "do not exist" (404), to exercise the fallback to the satellite mosaic
      if ((+m[2] + +m[3]) % 7 === 0) return route.fulfill({ status: 404, headers: cors, body: 'not found' });
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: imgPng(+m[1], +m[2], +m[3], true) });
    }
    if (/interpreter/.test(url)) { count.overpass++; return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: overpass(req.postData()) }); }
    if (/nominatim/.test(url)) {
      count.nominatim++;
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify([{ name: 'テスト山', display_name: 'テスト山, 静岡県, 日本', lat: String(MOUNT.lat), lon: String(MOUNT.lon) }]) });
    }
    count.other++;
    return route.fulfill({ status: 404, headers: cors, body: '' });
  });
  return count;
}
