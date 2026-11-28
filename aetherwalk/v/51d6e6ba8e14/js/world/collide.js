// js/world/collide.js — FABLE
// 衝突（円柱とレイだけ）と足場。three.js に依存しない（ベクトルは {x,y,z} を持つものなら何でもよい）。
import { HALF } from './layout.js';

const CS = 16, GN = 100;   // 16 m のセル、100×100

export function createCollision(hf) {
  const cells = new Array(GN * GN);
  const all = new Set();
  const platforms = [];
  const cellOf = (v) => { const c = Math.floor((v + HALF) / CS); return c < 0 ? 0 : c >= GN ? GN - 1 : c; };

  function addCollider(c) {
    const h = { x: c.x, z: c.z, r: c.r, y0: c.y0 ?? -1e9, y1: c.y1 ?? 1e9, kind: c.kind || 'structure', _cells: [] };
    const i0 = cellOf(h.x - h.r), i1 = cellOf(h.x + h.r), j0 = cellOf(h.z - h.r), j1 = cellOf(h.z + h.r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * GN + i;
      (cells[k] || (cells[k] = [])).push(h); h._cells.push(k);
    }
    all.add(h);
    return h;
  }
  function removeCollider(h) {
    if (!h || !all.has(h)) return;
    for (const k of h._cells) { const a = cells[k]; const q = a.indexOf(h); if (q >= 0) a.splice(q, 1); }
    all.delete(h);
  }
  function isBlocked(x, z, r = 0.3) {
    if (hf.waterDepthAt(x, z) > 1.1) return true;
    const i0 = cellOf(x - r), i1 = cellOf(x + r), j0 = cellOf(z - r), j1 = cellOf(z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = cells[j * GN + i];
      if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const c = a[q], dx = x - c.x, dz = z - c.z, rr = r + c.r;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
    }
    return false;
  }
  function resolveCircle(x, z, r, out) {
    let moved = false;
    for (let it = 0; it < 3; it++) {
      let hit = false;
      const i0 = cellOf(x - r), i1 = cellOf(x + r), j0 = cellOf(z - r), j1 = cellOf(z + r);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const a = cells[j * GN + i];
        if (!a) continue;
        for (let q = 0; q < a.length; q++) {
          const c = a[q], rr = r + c.r;
          let dx = x - c.x, dz = z - c.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
          const push = rr - d + 1e-3;
          x += (dx / d) * push; z += (dz / d) * push;
          hit = true; moved = true;
        }
      }
      if (!hit) break;
    }
    if (out) { out.x = x; out.z = z; }
    return moved;
  }
  function collidersNear(x, z, radius, out = []) {
    out.length = 0;
    const i0 = cellOf(x - radius), i1 = cellOf(x + radius), j0 = cellOf(z - radius), j1 = cellOf(z + radius);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = cells[j * GN + i];
      if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const c = a[q], dx = x - c.x, dz = z - c.z, rr = radius + c.r;
        if (dx * dx + dz * dz < rr * rr && out.indexOf(c) < 0) out.push(c);
      }
    }
    return out;
  }

  // ── 足場 ──
  function addPlatform(p) {
    const pl = p.r !== undefined
      ? { x: p.x, z: p.z, r: p.r, y: p.y, circle: true, surface: p.surface || 'stone' }
      : { x0: Math.min(p.x0, p.x1), x1: Math.max(p.x0, p.x1), z0: Math.min(p.z0, p.z1), z1: Math.max(p.z0, p.z1), y: p.y, circle: false, surface: p.surface || 'stone' };
    platforms.push(pl);
    return pl;
  }
  function removePlatform(pl) { const i = platforms.indexOf(pl); if (i >= 0) platforms.splice(i, 1); }
  function onPlatform(pl, x, z) {
    if (pl.circle) { const dx = x - pl.x, dz = z - pl.z; return dx * dx + dz * dz <= pl.r * pl.r; }
    return x >= pl.x0 && x <= pl.x1 && z >= pl.z0 && z <= pl.z1;
  }
  function groundAt(x, z, y) {
    let g = hf.heightAt(x, z);
    const lim = (y === undefined ? 1e9 : y + 0.6);
    for (let i = 0; i < platforms.length; i++) {
      const pl = platforms[i];
      if (pl.y > g && pl.y <= lim && onPlatform(pl, x, z)) g = pl.y;
    }
    return g;
  }
  function platformAt(x, z, y) {
    let best = null, g = hf.heightAt(x, z);
    for (let i = 0; i < platforms.length; i++) {
      const pl = platforms[i];
      if (pl.y > g && pl.y <= y + 0.6 && onPlatform(pl, x, z)) { g = pl.y; best = pl; }
    }
    return best;
  }

  // ── レイ ──
  const setV = (v, x, y, z) => { if (v.set) v.set(x, y, z); else { v.x = x; v.y = y; v.z = z; } };
  function mkOut(out) {
    if (!out.point) out.point = { x: 0, y: 0, z: 0 };
    if (!out.normal) out.normal = { x: 0, y: 1, z: 0 };
    return out;
  }
  function groundNormal(x, z, n) {
    const hx = hf.heightAt(x + 0.5, z) - hf.heightAt(x - 0.5, z), hz = hf.heightAt(x, z + 0.5) - hf.heightAt(x, z - 0.5);
    const il = 1 / Math.sqrt(hx * hx + hz * hz + 1);
    setV(n, -hx * il, il, -hz * il);
  }
  // 地形（と水面）をレイマーチ。戻り値は距離（なければ -1）。water = true なら水面でも止まる
  let _hitWater = false;
  function marchGround(o, d, maxDist, water) {
    _hitWater = false;
    let t = 0, step = 0.4, prevT = 0;
    let prevAbove = o.y - hf.heightAt(o.x, o.z);
    if (prevAbove < 0) return 0;
    while (t < maxDist) {
      prevT = t;
      t = Math.min(maxDist, t + step);
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (x < -HALF - 50 || x > HALF + 50 || z < -HALF - 50 || z > HALF + 50) { if (y < 0) { _hitWater = water; return water ? t : -1; } if (d.y >= 0) return -1; }
      const gh = hf.heightAt(x, z);
      let above = y - gh;
      let w = false;
      if (water) { const wl = hf.waterLevelAt(x, z); if (wl > gh && y < wl) { above = y - wl; w = true; } }
      if (above <= 0) {
        // 二分法でつめる
        let a = prevT, b = t;
        for (let i = 0; i < 7; i++) {
          const m = (a + b) * 0.5, mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
          let lv = hf.heightAt(mx, mz);
          if (w) lv = Math.max(lv, hf.waterLevelAt(mx, mz));
          if (my - lv > 0) a = m; else b = m;
        }
        _hitWater = w;
        return (a + b) * 0.5;
      }
      step = Math.min(4, Math.max(0.4, above * 0.45));
      prevAbove = above;
    }
    return -1;
  }
  function rayPlatforms(o, d, maxDist) {
    let best = -1;
    if (d.y >= -1e-5) return -1;
    for (let i = 0; i < platforms.length; i++) {
      const pl = platforms[i];
      const t = (pl.y - o.y) / d.y;
      if (t < 0 || t > maxDist || (best >= 0 && t >= best)) continue;
      if (onPlatform(pl, o.x + d.x * t, o.z + d.z * t)) best = t;
    }
    return best;
  }
  function raycastGround(origin, dir, maxDist = 100, out = {}) {
    mkOut(out);
    const tg = marchGround(origin, dir, maxDist, false), tp = rayPlatforms(origin, dir, maxDist);
    if (tg < 0 && tp < 0) return null;
    const usePl = tp >= 0 && (tg < 0 || tp < tg), t = usePl ? tp : tg;
    setV(out.point, origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    if (usePl) setV(out.normal, 0, 1, 0); else groundNormal(out.point.x, out.point.z, out.normal);
    out.distance = t;
    return out;
  }
  const _seen = [];
  function raycastSolid(origin, dir, maxDist = 100, out = {}) {
    mkOut(out);
    let t = marchGround(origin, dir, maxDist, true), kind = t >= 0 ? (_hitWater ? 'water' : 'ground') : null;
    const tp = rayPlatforms(origin, dir, maxDist);
    let nx = 0, ny = 1, nz = 0, fromGround = kind === 'ground';
    if (tp >= 0 && (t < 0 || tp < t)) { t = tp; kind = 'structure'; fromGround = false; }
    const lim = t >= 0 ? t : maxDist;
    // 円柱：レイに沿って 8 m ごとにセルを拾う
    _seen.length = 0;
    const hl = Math.hypot(dir.x, dir.z);
    for (let s = 0; s <= lim + 8; s += 8) {
      const px = origin.x + dir.x * Math.min(s, lim), pz = origin.z + dir.z * Math.min(s, lim);
      const i0 = cellOf(px - 9), i1 = cellOf(px + 9), j0 = cellOf(pz - 9), j1 = cellOf(pz + 9);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const a = cells[j * GN + i];
        if (!a) continue;
        for (let q = 0; q < a.length; q++) {
          const c = a[q];
          if (_seen.indexOf(c) >= 0) continue;
          _seen.push(c);
          if (hl < 1e-5) continue;
          // 2D の円とレイ
          const ox = origin.x - c.x, oz = origin.z - c.z;
          const A = dir.x * dir.x + dir.z * dir.z, B = 2 * (ox * dir.x + oz * dir.z), C = ox * ox + oz * oz - c.r * c.r;
          const disc = B * B - 4 * A * C;
          if (disc < 0) continue;
          let tc = (-B - Math.sqrt(disc)) / (2 * A);
          if (tc < 0) { if (C < 0) tc = 0; else continue; }
          const limNow = t >= 0 ? t : maxDist;
          if (tc > limNow) continue;
          const y = origin.y + dir.y * tc;
          if (y < c.y0 || y > c.y1) continue;
          t = tc; kind = c.kind; fromGround = false;
          const hx = origin.x + dir.x * tc - c.x, hz = origin.z + dir.z * tc - c.z, l = Math.hypot(hx, hz) || 1;
          nx = hx / l; ny = 0; nz = hz / l;
        }
      }
    }
    if (kind === null) return null;
    setV(out.point, origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    if (fromGround) groundNormal(out.point.x, out.point.z, out.normal); else setV(out.normal, nx, ny, nz);
    out.distance = t; out.kind = kind;
    return out;
  }
  return { addCollider, removeCollider, isBlocked, resolveCircle, collidersNear, addPlatform, removePlatform, groundAt, platformAt, raycastGround, raycastSolid, platforms, count: () => all.size };
}
