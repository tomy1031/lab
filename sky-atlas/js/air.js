// js/air.js — the air you fly in: wind that turns and strengthens with height (a balloon steers by choosing
// its height), thermals (rising columns of warm air under cumulus clouds, that a glider circles in to climb),
// and ridge lift (wind pushed up a slope). Everything is seeded by the area, so a place always has the
// same thermals.
import * as THREE from 'three';

function mulberry(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
// the compass name of where a horizontal vector comes FROM (x east, z south)
export function windName(v) {
  const from = Math.atan2(-v.x, v.z); // the direction the wind blows from, clockwise from north
  const deg = ((from * 180) / Math.PI + 360) % 360;
  return DIRS[Math.round(deg / 45) % 8];
}

export class Air {
  constructor(area) {
    const r = mulberry(seedOf(String(area.id || area.name || 'air')));
    this.dir0 = r() * Math.PI * 2; // wind direction near the ground (radians, the way it blows)
    this.speed0 = 2.5 + r() * 3; // m/s near the ground
    this.turn = (0.35 + r() * 0.5) * (r() < 0.5 ? -1 : 1); // how much it veers per 1000 m
    const R = Math.min(area.r * 1000 * 0.9, 30000);
    this.thermals = [];
    const n = Math.round(14 + (R / 1000) * 1.1);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
      this.thermals.push({
        x: Math.cos(a) * d, z: Math.sin(a) * d,
        r: 140 + r() * 160, // core radius (m)
        s: 1.6 + r() * 3.2, // core climb (m/s)
        top: 1300 + r() * 1300, // cloud base above the ground (m)
        g: null, // ground height there (filled in once known)
      });
    }
    this._w = new THREE.Vector3();
  }

  // horizontal wind (m/s) at height y (m above sea level)
  wind(y, out = this._w) {
    const h = Math.max(0, y);
    const dir = this.dir0 + (this.turn * Math.min(h, 8000)) / 1000;
    const sp = this.speed0 + (Math.min(h, 7000) / 1000) * 2.3;
    return out.set(Math.cos(dir) * sp, 0, Math.sin(dir) * sp);
  }

  ground(t, groundAt) {
    if (t.g == null || t.gz < 10) {
      const g = groundAt(t.x, t.z);
      t.g = g.h; t.gz = g.z;
    }
    return t.g;
  }

  // vertical air speed (m/s, + = rising) at a point; groundAt(x, z) → { h, z }
  lift(x, y, z, groundAt) {
    let w = 0;
    for (const t of this.thermals) {
      const dx = x - t.x, dz = z - t.z, d2 = dx * dx + dz * dz;
      if (d2 > 9 * t.r * t.r) continue;
      const top = this.ground(t, groundAt) + t.top;
      if (y > top) continue;
      const d = Math.sqrt(d2);
      const fade = Math.min(1, (top - y) / 250);
      w += t.s * Math.exp(-d2 / (t.r * t.r)) * fade;
      w -= 0.7 * Math.exp(-(((d - 2 * t.r) / t.r) ** 2)) * fade; // sinking air around it
    }
    // ridge lift: the wind meeting a slope that rises along it
    const g = groundAt(x, z).h, agl = y - g;
    if (agl < 600) {
      const wv = this.wind(y, new THREE.Vector3());
      const sp = wv.length();
      if (sp > 0.1) {
        const k = 40, ux = wv.x / sp, uz = wv.z / sp;
        const up = (groundAt(x + ux * k, z + uz * k).h - groundAt(x - ux * k, z - uz * k).h) / (2 * k);
        if (up > 0) w += Math.min(6, sp * up * 1.6) * Math.exp(-agl / 220);
      }
    }
    return w;
  }

  // the nearest thermal core (for hints)
  nearest(x, z) {
    let best = null, bd = Infinity;
    for (const t of this.thermals) { const d = Math.hypot(x - t.x, z - t.z); if (d < bd) { bd = d; best = t; } }
    return best ? { t: best, d: bd } : null;
  }
}
