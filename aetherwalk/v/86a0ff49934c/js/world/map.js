// js/world/map.js — FABLE
// 絵地図：地面の色テクスチャと高さから、紙に描いたような地図を作る（UI の手首メニュー用）。
import { HALF, GRID_N, LAKE_C } from './layout.js';

export function createMap(env, sp) {
  const { hf } = env;
  const S = env.tex.colorSize, cdata = env.tex.colorData, RS = env.tex.regionSize, rdata = env.tex.regionData;
  let colorCv = null, sepiaCv = null, waterCv = null, masks = null, cache = null, cacheKey = '';
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function build() {
    colorCv = mk(S, S); sepiaCv = mk(S, S);
    const cc = colorCv.getContext('2d'), sc = sepiaCv.getContext('2d');
    const img = cc.createImageData(S, S), simg = sc.createImageData(S, S);
    const d = img.data, sd = simg.data;
    const H = hf.H, N = GRID_N;
    const hAt = (i, j) => H[Math.min(N - 1, Math.max(0, j * 2 + 1)) * N + Math.min(N - 1, Math.max(0, i * 2 + 1))];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = (j * S + i) * 4;
      const h = hAt(i, j);
      let r, g, b;
      const x = -HALF + (i + 0.5) * 4, z = -HALF + (j + 0.5) * 4;
      const inLake = Math.hypot(x - LAKE_C.x, z - LAKE_C.z) < 205 && h < 24;
      if (h < 0 || inLake) {
        const dep = inLake ? Math.min(1, (24 - h) / 8) : Math.min(1, -h / 14);
        r = 150 - 60 * dep; g = 200 - 50 * dep; b = 216 - 26 * dep;
        // 岸の線
        if (dep < 0.07) { r = 235; g = 244; b = 240; }
      } else {
        // 陰影（北西からの光）
        const sh = Math.max(-1, Math.min(1, ((hAt(i + 1, j) - hAt(i - 1, j)) + (hAt(i, j + 1) - hAt(i, j - 1))) * -0.07));
        const k2 = 0.92 + 0.3 * sh;
        r = (cdata[k] * 0.78 + 244 * 0.22) * k2; g = (cdata[k + 1] * 0.78 + 236 * 0.22) * k2; b = (cdata[k + 2] * 0.78 + 216 * 0.22) * k2;
      }
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
      const l = r * 0.3 + g * 0.5 + b * 0.2;
      if (h < 0 || inLake) { sd[k] = r * 0.8 + 40; sd[k + 1] = g * 0.8 + 38; sd[k + 2] = b * 0.8 + 34; }   // 水はいつも水の色
      else { sd[k] = 236 * 0.62 + l * 0.36; sd[k + 1] = 226 * 0.62 + l * 0.34; sd[k + 2] = 200 * 0.62 + l * 0.3; }
      sd[k + 3] = 255;
    }
    cc.putImageData(img, 0, 0); sc.putImageData(simg, 0, 0);
    // 道（点線）
    for (const c2 of [cc, sc]) {
      c2.lineWidth = 1.6; c2.strokeStyle = c2 === cc ? 'rgba(122,92,58,0.9)' : 'rgba(140,120,96,0.55)'; c2.setLineDash([3, 2.2]); c2.lineJoin = 'round';
      for (const p of hf.pathLines) {
        c2.beginPath();
        p.samples.forEach((q, n) => { const u = (q[0] + HALF) / 4, v = (q[1] + HALF) / 4; if (n) c2.lineTo(u, v); else c2.moveTo(u, v); });
        if (p.closed) c2.closePath();
        c2.stroke();
      }
      c2.setLineDash([]);
    }
    // 水のマスク（どの地域が開いていても水は同じ色で描く）
    waterCv = mk(S, S);
    { const wc = waterCv.getContext('2d'), wi = wc.createImageData(S, S);
      for (let q = 0; q < S * S; q++) { const isW = d[q * 4 + 2] > d[q * 4] + 30 && d[q * 4 + 2] > 150; wi.data[q * 4] = d[q * 4]; wi.data[q * 4 + 1] = d[q * 4 + 1]; wi.data[q * 4 + 2] = d[q * 4 + 2]; wi.data[q * 4 + 3] = isW ? 255 : 0; }
      wc.putImageData(wi, 0, 0); }
    // 地域のマスク（重みをアルファに）
    masks = [];
    for (let m = 0; m < 4; m++) {
      const cv = mk(RS, RS), c2 = cv.getContext('2d'), im = c2.createImageData(RS, RS);
      for (let q = 0; q < RS * RS; q++) { im.data[q * 4] = 255; im.data[q * 4 + 1] = 255; im.data[q * 4 + 2] = 255; im.data[q * 4 + 3] = Math.min(255, Math.max(0, (rdata[q * 4 + m] - 96) * 4)); }
      c2.putImageData(im, 0, 0);
      masks.push(cv);
    }
  }
  const ORDER = ['meadow', 'forest', 'canyon', 'peaks'];
  function drawMap(ctx2d, sizePx, opts = {}) {
    if (!ctx2d) return;
    if (!colorCv) build();
    const rev = opts.revealed;
    const key = rev ? ORDER.map((r) => (rev[r] ? 1 : 0)).join('') : '1111';
    if (key !== cacheKey || !cache) {
      cache = cache || mk(S, S);
      const c = cache.getContext('2d');
      c.globalCompositeOperation = 'source-over';
      if (key === '1111') c.drawImage(colorCv, 0, 0);
      else {
        c.drawImage(sepiaCv, 0, 0);
        const tmp = mk(S, S), t = tmp.getContext('2d');
        ORDER.forEach((r, m) => {
          if (key[m] !== '1') return;
          t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, S, S); t.drawImage(colorCv, 0, 0);
          t.globalCompositeOperation = 'destination-in'; t.imageSmoothingEnabled = true; t.drawImage(masks[m], 0, 0, S, S);
          c.drawImage(tmp, 0, 0);
        });
        c.drawImage(waterCv, 0, 0);
      }
      cacheKey = key;
    }
    ctx2d.save();
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.drawImage(cache, 0, 0, sizePx, sizePx);
    ctx2d.restore();
  }
  function worldToMap(x, z, sizePx, out = {}) {
    out.u = ((x + HALF) / 1600) * sizePx; out.v = ((z + HALF) / 1600) * sizePx;
    return out;
  }
  return { drawMap, worldToMap };
}
