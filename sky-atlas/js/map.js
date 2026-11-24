// js/map.js — a small world map on the menu page: drag to move, wheel / buttons to zoom, tap to choose a
// place. It uses the same satellite tiles (from the store when they are there, so the downloaded areas
// show offline). Saved areas are drawn as squares.
import { lon2tx, lat2ty, tx2lon, ty2lat, clamp } from './geo.js';
import { SAT } from './sources.js';
import { getTile, Missing } from './tiles.js';

export class MapPicker {
  constructor(canvas, onPick) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.onPick = onPick;
    this.z = 1.6; // fractional zoom
    this.cx = 0.5; this.cy = 0.42; // centre in world fractions (0..1)
    this.tiles = new Map(); // key → { img, state }
    this.areas = [];
    this.current = null;
    this.mark = null;
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      const ws = this.worldPx();
      this.cx = drag.cx - dx / ws;
      this.cy = clamp(drag.cy - dy / ws, 0, 1);
      this.draw();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) {
        const r = canvas.getBoundingClientRect();
        const { lat, lon } = this.toLatLon(e.clientX - r.left, e.clientY - r.top);
        this.mark = { lat, lon };
        this.onPick(lat, lon);
        this.draw();
      }
      drag = null;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      this.zoomAt(-Math.sign(e.deltaY) * 0.5, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }
  worldPx() { return 256 * 2 ** this.z; }
  toLatLon(px, py) {
    const ws = this.worldPx();
    let fx = this.cx + (px - this.w / 2) / ws;
    const fy = clamp(this.cy + (py - this.h / 2) / ws, 0, 1);
    fx = ((fx % 1) + 1) % 1;
    return { lat: ty2lat(fy, 0), lon: tx2lon(fx, 0) };
  }
  toPx(lat, lon) {
    const ws = this.worldPx();
    let dx = lon2tx(lon, 0) - this.cx;
    dx -= Math.round(dx);
    return { x: this.w / 2 + dx * ws, y: this.h / 2 + (lat2ty(lat, 0) - this.cy) * ws };
  }
  zoomBy(d) { this.zoomAt(d, this.w / 2, this.h / 2); }
  zoomAt(d, px, py) {
    const before = this.toLatLon(px, py);
    this.z = clamp(this.z + d, 0.5, 12);
    const ws = this.worldPx();
    const fx = lon2tx(before.lon, 0), fy = lat2ty(before.lat, 0);
    this.cx = fx - (px - this.w / 2) / ws;
    this.cy = clamp(fy - (py - this.h / 2) / ws, 0, 1);
    this.draw();
  }
  center(lat, lon, z) {
    this.cx = lon2tx(lon, 0);
    this.cy = lat2ty(lat, 0);
    if (z != null) this.z = z;
    this.mark = { lat, lon };
    this.draw();
  }
  setAreas(list, current) { this.areas = list; this.current = current; this.draw(); }

  tile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let t = this.tiles.get(key);
    if (!t) {
      t = { state: 'loading', img: null };
      this.tiles.set(key, t);
      // the coarse world tiles are kept, so the map is there offline too
      getTile(SAT.url(z, x, y, 2024), { store: z <= 3 })
        .then((b) => createImageBitmap(b))
        .then((img) => { t.img = img; t.state = 'ok'; this.draw(); })
        .catch((e) => { t.state = e instanceof Missing ? 'missing' : 'error'; setTimeout(() => { if (t.state === 'error') this.tiles.delete(key); }, 20000); });
      if (this.tiles.size > 400) {
        for (const [k, v] of this.tiles) { if (this.tiles.size <= 300) break; if (v.state !== 'loading') { v.img?.close?.(); this.tiles.delete(k); } }
      }
    }
    return t;
  }

  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }
  paint() {
    const x = this.ctx, w = this.w, h = this.h;
    x.fillStyle = '#0d2236';
    x.fillRect(0, 0, w, h);
    const zi = clamp(Math.round(this.z), 0, 12);
    const n = 2 ** zi, ws = this.worldPx(), ts = ws / n;
    const x0 = Math.floor((this.cx - w / 2 / ws) * n), x1 = Math.floor((this.cx + w / 2 / ws) * n);
    const y0 = Math.max(0, Math.floor((this.cy - h / 2 / ws) * n)), y1 = Math.min(n - 1, Math.floor((this.cy + h / 2 / ws) * n));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n;
      const px = w / 2 + (tx / n - this.cx) * ws, py = h / 2 + (ty / n - this.cy) * ws;
      let t = this.tile(zi, wx, ty);
      // while loading, draw a parent tile scaled up
      if (t.state !== 'ok') {
        for (let up = 1; up <= zi; up++) {
          const pz = zi - up, f = 2 ** up;
          const p = this.tiles.get(`${pz}/${Math.floor(wx / f)}/${Math.floor(ty / f)}`);
          if (p && p.state === 'ok') {
            const sx = ((wx % f) / f) * p.img.width, sy = ((ty % f) / f) * p.img.height;
            x.drawImage(p.img, sx, sy, p.img.width / f, p.img.height / f, px, py, ts + 0.5, ts + 0.5);
            break;
          }
        }
        continue;
      }
      x.drawImage(t.img, px, py, ts + 0.5, ts + 0.5);
    }
    // saved areas
    for (const a of this.areas) this.square(a, a.done ? '#ffd166' : 'rgba(255,209,102,0.5)');
    if (this.current) this.square(this.current, '#7fd3ff');
    if (this.mark) {
      const p = this.toPx(this.mark.lat, this.mark.lon);
      x.fillStyle = '#ff5d5d';
      x.strokeStyle = '#fff';
      x.lineWidth = 2;
      x.beginPath(); x.arc(p.x, p.y, 6, 0, Math.PI * 2); x.fill(); x.stroke();
    }
  }
  square(a, color) {
    const x = this.ctx;
    const p = this.toPx(a.lat, a.lon);
    const mPerPx = (40075016 * Math.cos((a.lat * Math.PI) / 180)) / this.worldPx();
    const r = Math.max(4, (a.r * 1000) / mPerPx);
    x.strokeStyle = color;
    x.lineWidth = 2;
    x.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
  }
}
