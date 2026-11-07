// minimap.js — heading-up circular minimap for the town, and a flat world map for the globe stage.
export class Minimap {
  constructor(canvas, M) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.M = M;
    const B = M.BOUNDS;
    this.scale = 0.3; // px per metre in the pre-rendered map
    const w = Math.ceil((B.x1 - B.x0) * this.scale), h = Math.ceil((B.z1 - B.z0) * this.scale);
    this.map = document.createElement('canvas');
    this.map.width = w; this.map.height = h;
    const g = this.map.getContext('2d');
    const P = (x, z) => [(x - B.x0) * this.scale, (z - B.z0) * this.scale];
    const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, z], i) => { const [px, pz] = P(x, z); i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.closePath(); g.fillStyle = fill; g.fill(); };
    g.fillStyle = '#4f9fd6'; g.fillRect(0, 0, w, h);
    for (const l of M.LAND) poly(l, '#efe9dc');
    const pc = { park: '#9fd77c', plaza: '#f2dcb8', china: '#f0a08c' };
    for (const p of M.PATCHES) poly(p.poly, pc[p.kind]);
    g.strokeStyle = '#9a9aa2'; g.lineWidth = M.ROAD_W * this.scale; g.lineCap = 'round';
    for (const r of M.ROADS) { g.beginPath(); r.forEach(([x, z], i) => { const [px, pz] = P(x, z); i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.stroke(); }
    this.labels = [
      ['中華街', 450, 445, '#c8231c'], ['赤レンガ', 120, -300, '#b0442c'], ['ランドマーク', -640, -140, '#445'],
      ['山下公園', 750, 140, '#2f7a2f'], ['大さん橋', 340, -150, '#445'], ['観覧車', -260, -210, '#445'],
      ['マリンタワー', 660, 255, '#445'], ['スタジアム', -130, 460, '#445'], ['ベイブリッジ', 1450, 0, '#445'],
    ];
    this.worldCanvas = null;
    this.bounds = M.BOUNDS;
    this.maxRange = 3000;
  }

  setWorld(canvas) { this.worldCanvas = canvas; }

  // switch to another flat map (canvas covering `bounds`, labels [[name, x, z, colour]])
  setFlatMap(canvas, bounds, labels, maxRange) {
    this.map = canvas;
    this.bounds = bounds;
    this.scale = canvas.width / (bounds.x1 - bounds.x0);
    this.labels = labels;
    this.maxRange = maxRange;
  }

  drawTown(x, z, yaw, r) {
    const { ctx, cv } = this;
    const W = cv.width, H = cv.height, B = this.bounds;
    const range = Math.min(Math.max(r * 70, 260), this.maxRange); // metres across
    const k = W / range; // px per metre
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#4f9fd6'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI + yaw);
    const s = k / this.scale;
    ctx.drawImage(this.map, -(x - B.x0) * k, -(z - B.z0) * k, this.map.width * s, this.map.height * s);
    ctx.restore();
    // labels (kept upright)
    ctx.save();
    ctx.font = 'bold 11px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    const c = Math.cos(Math.PI + yaw), sn = Math.sin(Math.PI + yaw);
    for (const [name, lx, lz, col] of this.labels) {
      const dx = (lx - x) * k, dz = (lz - z) * k;
      const px = W / 2 + dx * c - dz * sn, pz = H / 2 + dx * sn + dz * c;
      if (Math.hypot(px - W / 2, pz - H / 2) > W / 2 - 12) continue;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, pz, 3, 0, 7); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(name, px, pz - 6);
      ctx.fillText(name, px, pz - 6);
    }
    // ball
    const br = Math.max(4, r * k);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, br, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - br - 9); ctx.lineTo(W / 2 - 6, H / 2 - br - 1); ctx.lineTo(W / 2 + 6, H / 2 - br - 1); ctx.fill();
    ctx.restore();
  }

  drawWorld({ lat, lon }, r) {
    const { ctx, cv } = this;
    const W = cv.width, H = cv.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1d4f8a'; ctx.fillRect(0, 0, W, H);
    if (this.worldCanvas) {
      // show a window of the equirectangular map centred on the ball (wraps in longitude)
      const wc = this.worldCanvas;
      const spanDeg = Math.min(360, Math.max(70, r * 1.3));
      const pxPerDeg = W / spanDeg;
      const mapW = 360 * pxPerDeg, mapH = 180 * pxPerDeg;
      const cx = W / 2 - (lon + 180) * pxPerDeg, cy = H / 2 - (90 - lat) * pxPerDeg;
      for (const off of [-mapW, 0, mapW]) ctx.drawImage(wc, cx + off, cy, mapW, mapH);
    }
    ctx.restore();
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 6, 0, 7); ctx.fill(); ctx.stroke();
  }
}
