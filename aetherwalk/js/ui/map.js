// js/ui/map.js — the map page: world.drawMap (FABLE's painted map) + markers for you, the objective,
// towers, shrines and waylights (OPUS-B)
import { C, text, roundRect } from './text.js';

export function createMapPainter(ctx) {
  const base = document.createElement('canvas');
  let baseSize = 0, baseKey = '';
  const uv = { u: 0, v: 0 };

  function revealed() {
    const t = (ctx.game && ctx.game.quest && ctx.game.quest.towers) || {};
    return { meadow: !!t.meadow, forest: !!t.forest, canyon: !!t.canyon, peaks: !!t.peaks };
  }
  function toMap(x, z, size, out) {
    const w = ctx.world;
    if (w && typeof w.worldToMap === 'function') {
      try { w.worldToMap(x, z, size, out); if (Number.isFinite(out.u)) return out; } catch (e) { /* fall back */ }
    }
    out.u = (x + 800) / 1600 * size; out.v = (z + 800) / 1600 * size;
    return out;
  }
  function paintBase(size) {
    const r = revealed();
    const key = `${size}|${r.meadow}${r.forest}${r.canyon}${r.peaks}`;
    if (key === baseKey) return;
    baseKey = key; baseSize = size;
    base.width = base.height = size;
    const g = base.getContext('2d');
    const w = ctx.world;
    let ok = false;
    if (w && typeof w.drawMap === 'function') {
      try { w.drawMap(g, size, { revealed: r }); ok = true; } catch (e) { ok = false; }
    }
    if (!ok) {
      g.fillStyle = '#1766a8'; g.fillRect(0, 0, size, size);
      g.fillStyle = '#8fbf6a'; g.beginPath(); g.arc(size / 2, size / 2, size * 0.41, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4fc2c9'; g.beginPath(); g.arc(size / 2, size * 0.475, size * 0.13, 0, Math.PI * 2); g.fill();
    }
  }

  /** draw the map page into g at (x, y) with side `size` */
  function draw(g, x, y, size, S) {
    paintBase(512);
    g.save();
    roundRect(g, x, y, size, size, 16);
    g.clip();
    g.drawImage(base, x, y, size, size);
    const G = ctx.game;
    const M = (wx, wz) => { toMap(wx, wz, size, uv); uv.u += x; uv.v += y; return uv; };
    // waylights
    for (const l of (G && G.checkpoints ? G.checkpoints.lights : [])) {
      const p = M(l.x, l.z);
      g.beginPath(); g.arc(p.u, p.v, 7, 0, Math.PI * 2);
      g.fillStyle = l.lit ? C.fireA : 'rgba(244,236,216,0.35)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(14,20,48,0.8)'; g.stroke();
    }
    // shrines (revealed regions or done)
    const rv = revealed();
    for (const s of (G && G.shrines ? G.shrines.shrines : [])) {
      const done = G.quest.shrines[s.id] && G.quest.shrines[s.id].done;
      if (!done && s.region && rv[s.region] === false && s.region !== 'coast' && s.region !== 'lake') continue;
      const p = M(s.x, s.z);
      g.save(); g.translate(p.u, p.v); g.rotate(Math.PI / 4);
      g.fillStyle = done ? C.cyan : 'rgba(127,233,255,0.25)'; g.fillRect(-7, -7, 14, 14);
      g.lineWidth = 2.5; g.strokeStyle = C.cyan; g.strokeRect(-7, -7, 14, 14);
      g.restore();
    }
    // towers
    for (const t of (G && G.towers ? G.towers.towers : [])) {
      const p = M(t.x, t.z);
      g.beginPath(); g.moveTo(p.u, p.v - 13); g.lineTo(p.u + 9, p.v + 8); g.lineTo(p.u - 9, p.v + 8); g.closePath();
      g.fillStyle = t.awake ? C.gold : 'rgba(180,176,190,0.85)'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(14,20,48,0.85)'; g.stroke();
      if (t.awake) { g.beginPath(); g.arc(p.u, p.v - 2, 16, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = 'rgba(255,215,106,0.6)'; g.stroke(); }
    }
    // objective
    const o = G && G.quest && G.quest.objective;
    if (o) {
      const p = M(o.x, o.z);
      const pulse = 1 + 0.15 * Math.sin(performance.now() / 200);
      star(g, p.u, p.v, 13 * pulse, C.gold);
    }
    // you
    const pl = ctx.player;
    if (pl && pl.pos) {
      const p = M(pl.pos.x, pl.pos.z);
      g.save(); g.translate(p.u, p.v); g.rotate(pl.yaw || 0);
      g.beginPath(); g.moveTo(0, -15); g.lineTo(10, 11); g.lineTo(0, 5); g.lineTo(-10, 11); g.closePath();
      g.fillStyle = C.white; g.fill(); g.lineWidth = 3; g.strokeStyle = C.bgSolid; g.stroke();
      g.restore();
    }
    g.restore();
    roundRect(g, x, y, size, size, 16);
    g.lineWidth = 3; g.strokeStyle = C.line; g.stroke();
  }
  function star(g, x, y, r, col) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 2.5; g.strokeStyle = 'rgba(14,20,48,0.85)'; g.stroke();
  }
  return { draw, invalidate() { baseKey = ''; } };
}
