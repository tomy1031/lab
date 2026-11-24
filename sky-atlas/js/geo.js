// js/geo.js — map math: Web Mercator tiles (z/x/y, the same grid as every web map) and the local frame
// the game flies in. Each area is flat around its centre: x = east, y = up, z = south (so the camera's
// default -z looks north), in real metres. Within ±50 km of the centre the scale error stays under ~1%.
export const R = 6378137; // Web Mercator sphere radius (m)
export const EARTH_R = 6371000; // mean Earth radius, for the horizon curvature
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const HALF = Math.PI * R; // half the Mercator world width (m)

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

// fractional tile coordinates at zoom z
export const lon2tx = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const lat2ty = (lat, z) => ((1 - Math.asinh(Math.tan(clamp(lat, -85.05, 85.05) * D2R)) / Math.PI) / 2) * 2 ** z;
export const tx2lon = (x, z) => (x / 2 ** z) * 360 - 180;
export const ty2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * R2D;

// size of one tile at zoom z in Mercator metres (multiply by cos(lat) for metres on the ground)
export const tileSpan = (z) => (2 * HALF) / 2 ** z;
export const groundTile = (z, lat) => tileSpan(z) * Math.cos(lat * D2R);

export const tileKey = (z, x, y) => `${z}/${x}/${y}`;

// great-circle distance in metres
export function haversine(lat1, lon1, lat2, lon2) {
  const a = Math.sin(((lat2 - lat1) * D2R) / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(((lon2 - lon1) * D2R) / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export class Frame {
  constructor(lat, lon) {
    this.lat = lat;
    this.lon = lon;
    this.k = Math.cos(lat * D2R); // Mercator → ground metres at the centre
    this.mx0 = R * lon * D2R;
    this.my0 = R * Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -85.05, 85.05) * D2R) / 2));
  }
  // lon/lat → local metres
  toLocal(lon, lat) {
    const mx = R * lon * D2R, my = R * Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -85.05, 85.05) * D2R) / 2));
    return { x: (mx - this.mx0) * this.k, z: -(my - this.my0) * this.k };
  }
  toLonLat(x, z) {
    const mx = x / this.k + this.mx0, my = -z / this.k + this.my0;
    return { lon: (mx / R) * R2D, lat: (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * R2D };
  }
  // local metres → fractional tile coordinates at zoom z
  tileXY(x, z, zoom) {
    const s = tileSpan(zoom);
    return { tx: (x / this.k + this.mx0 + HALF) / s, ty: (HALF - (-z / this.k + this.my0)) / s };
  }
  // a tile's rectangle in local metres (x0 west < x1 east, z0 north < z1 south)
  tileRect(z, x, y) {
    const s = tileSpan(z), mx = -HALF + x * s, my = HALF - y * s;
    return { x0: (mx - this.mx0) * this.k, x1: (mx + s - this.mx0) * this.k, z0: -(my - this.my0) * this.k, z1: -(my - s - this.my0) * this.k };
  }
}

// tile range at zoom z that covers a square of half-size h metres (on the ground) around lat/lon
export function tileRange(lat, lon, h, z) {
  const n = 2 ** z, s = groundTile(z, lat);
  const cx = lon2tx(lon, z), cy = lat2ty(lat, z), d = h / s;
  return {
    z,
    x0: Math.max(0, Math.floor(cx - d)), x1: Math.min(n - 1, Math.floor(cx + d)),
    y0: Math.max(0, Math.floor(cy - d)), y1: Math.min(n - 1, Math.floor(cy + d)),
  };
}
export const inRange = (r, x, y) => !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
export const rangeCount = (r) => (r ? (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) : 0);

// elevation PNG decoders → metres. Terrarium (AWS / Mapzen): (R·256 + G + B/256) − 32768.
// 国土地理院 dem_png: x = R·2¹⁶ + G·2⁸ + B, 0.01 m steps, 2²³ = no data (sea).
export function decodeTerrarium(px, out) {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
  return out;
}
export function decodeGsi(px, out) {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    const v = px[i] * 65536 + px[i + 1] * 256 + px[i + 2];
    out[j] = v === 8388608 ? 0 : v < 8388608 ? v * 0.01 : (v - 16777216) * 0.01;
  }
  return out;
}
