// ui/s-map.js — hand-drawn style island map (M). Only visited 20 m cells are revealed (game.sys.player.visited = Set of "i,j").
import { h, clear } from './dom.js';
import { head } from './common.js';

const ZONE_COL = { sea: [190, 222, 224], beach: [241, 223, 174], rocks: [190, 183, 164], jungle: [128, 166, 108], grass: [184, 208, 126], hill: [168, 144, 106], stream: [124, 190, 212], pond: [109, 179, 208], cliff: [140, 125, 106] };
const RANGE = 300, GRID = 160, CELL = 20, SIZE = 720;
const sx = (x) => ((x + RANGE) / (RANGE * 2)) * SIZE;
const sz = (z) => ((z + RANGE) / (RANGE * 2)) * SIZE;

export default function map(ctx) {
  const { game, screens } = ctx;
  const canvas = h('canvas', { class: 'map-canvas', width: SIZE, height: SIZE, 'aria-label': '島の 地図' });
  const g = canvas.getContext('2d');
  const side = h('div', { class: 'map-side' });
  const el = h('div', { class: 'sheet wide map-sheet', tabindex: '-1' }, head('島の 地図', screens),
    h('div', { class: 'sheet-body map-body' }, h('div', { class: 'map-wrap' }, canvas), side));

  const terrain = game.world?.terrain;
  const P = () => game.sys?.player;
  let base = null, baseKey = '', land = null;

  function buildLand() {
    const c = document.createElement('canvas'); c.width = c.height = GRID;
    const cg = c.getContext('2d'); const img = cg.createImageData(GRID, GRID);
    const zones = new Array(GRID * GRID);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const x = ((i + 0.5) / GRID) * RANGE * 2 - RANGE, z = ((j + 0.5) / GRID) * RANGE * 2 - RANGE;
      let zn = 'sea'; try { zn = terrain?.zoneAt?.(x, z) || 'sea'; } catch { /* ignore */ }
      zones[j * GRID + i] = zn;
    }
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const zn = zones[j * GRID + i];
      let col = ZONE_COL[zn] || ZONE_COL.sea;
      const isSea = zn === 'sea';
      if (!isSea) {
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => zones[(j + b) * GRID + (i + a)] === 'sea');
        if (nb) col = [96, 84, 62];
      }
      const n = ((i * 7 + j * 13) % 5) - 2; // paper grain
      const k = (j * GRID + i) * 4;
      img.data[k] = col[0] + n; img.data[k + 1] = col[1] + n; img.data[k + 2] = col[2] + n; img.data[k + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    return c;
  }

  function buildBase(visited) {
    land = land || buildLand();
    const out = document.createElement('canvas'); out.width = out.height = SIZE;
    const og = out.getContext('2d');
    og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.drawImage(land, 0, 0, SIZE, SIZE);
    // fog mask: soft discs around visited cells
    og.globalCompositeOperation = 'destination-in';
    const m = document.createElement('canvas'); m.width = m.height = SIZE;
    const mg = m.getContext('2d');
    const r = ((CELL * 1.7) / (RANGE * 2)) * SIZE;
    for (const key of visited) {
      const [i, j] = key.split(',').map(Number);
      if (!Number.isFinite(i)) continue;
      const cx = sx((i + 0.5) * CELL), cy = sz((j + 0.5) * CELL);
      const gr = mg.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = gr; mg.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    og.drawImage(m, 0, 0);
    return out;
  }

  function paper() {
    g.fillStyle = '#f3ead2'; g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = 'rgba(120,100,60,.10)'; g.lineWidth = 1;
    for (let p = 0; p <= SIZE; p += SIZE / 12) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, SIZE); g.moveTo(0, p); g.lineTo(SIZE, p); g.stroke(); }
  }
  const seen = (x, z) => P()?.visited?.has?.(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  const label = (txt, x, y, col = '#3b3426') => {
    g.font = '700 17px "Zen Maru Gothic", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4; g.strokeStyle = 'rgba(250,244,226,.9)'; g.strokeText(txt, x, y); g.fillStyle = col; g.fillText(txt, x, y);
  };
  const emoji = (e, x, y, s = 22) => { g.font = `${s}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, x, y); };

  function draw() {
    const vis = P()?.visited || new Set();
    const key = `${vis.size}`;
    if (!base || key !== baseKey) { base = buildBase(vis); baseKey = key; }
    paper();
    g.save(); g.globalAlpha = 0.95; g.drawImage(base, 0, 0); g.restore();
    // frame
    g.strokeStyle = '#8a7a58'; g.lineWidth = 3; g.setLineDash([10, 6]); g.strokeRect(6, 6, SIZE - 12, SIZE - 12); g.setLineDash([]);
    // places
    const L = game.world?.layout || {};
    const done = new Set();
    for (const v of Object.values(L)) {
      if (!v || typeof v !== 'object' || Array.isArray(v) || v.x == null || !v.name || done.has(v.name)) continue;
      done.add(v.name);
      const known = seen(v.x, v.z);
      emoji(known ? '📍' : '？', sx(v.x), sz(v.z) - 10, known ? 16 : 14);
      if (known) label(v.name, sx(v.x), sz(v.z) + 8);
    }
    if (Array.isArray(L.stream)) {
      g.strokeStyle = 'rgba(70,150,190,.9)'; g.lineWidth = 3; g.beginPath(); let st = false;
      for (const [x, z] of L.stream) { if (!seen(x, z)) { st = false; continue; } if (!st) { g.moveTo(sx(x), sz(z)); st = true; } else g.lineTo(sx(x), sz(z)); }
      g.stroke();
    }
    // structures / fires
    for (const s of game.sys?.building?.sites || []) {
      if (s.x == null) continue;
      emoji(s.fire || /fire|camp/.test(s.id || '') ? '🔥' : (s.icon || '🏠'), sx(s.x), sz(s.z), 22);
    }
    // companion
    const comp = game.sys?.companion; const cp = comp?.pos || comp?.position || comp?.avatar?.pos;
    if (cp) { g.fillStyle = '#e8743b'; g.beginPath(); g.arc(sx(cp.x), sz(cp.z), 8, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); label(comp.name || '仲間', sx(cp.x), sz(cp.z) - 18, '#b4491a'); }
    // player arrow
    const pp = game.player?.pos || game.player?.position;
    if (pp) {
      g.save(); g.translate(sx(pp.x), sz(pp.z)); g.rotate(-(game.player.yaw || 0));
      g.fillStyle = '#1f7f86'; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, -17); g.lineTo(12, 13); g.lineTo(0, 7); g.lineTo(-12, 13); g.closePath(); g.stroke(); g.fill(); g.restore();
    }
    // compass + scale
    g.save(); g.translate(SIZE - 56, 56); g.strokeStyle = '#5b4b2c'; g.fillStyle = '#5b4b2c'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 28, 0, 7); g.stroke(); g.beginPath(); g.moveTo(0, -24); g.lineTo(7, 4); g.lineTo(0, 0); g.lineTo(-7, 4); g.closePath(); g.fill();
    g.font = '700 16px system-ui'; g.textAlign = 'center'; g.fillText('N', 0, -34); g.restore();
    const bar = (100 / (RANGE * 2)) * SIZE; g.fillStyle = '#5b4b2c'; g.fillRect(24, SIZE - 30, bar, 4); g.font = '600 13px system-ui'; g.textAlign = 'left'; g.fillText('100 m', 24, SIZE - 38);
  }

  function renderSide() {
    clear(side);
    const p = P(); const vis = p?.visited?.size || 0;
    const total = 480; // rough number of land cells (island ≈ 8 ha at 20 m)
    side.append(h('div', { class: 'paper-inset pad' }, h('h3', null, 'この 場所'),
      h('p', null, `${p?.zoneName || zoneJa(p?.zone) || '—'}`), h('p', { class: 'muted small' }, `歩いた 場所：${vis} マス`)));
    const clock = game.clock;
    if (clock?.tide) {
      const t0 = clock.total / 60; let hi = null, lo = null;
      for (let k = 0.25; k <= 14; k += 0.25) {
        const a = clock.tide(t0 + k - 0.25), b = clock.tide(t0 + k), c = clock.tide(t0 + k + 0.25);
        if (b > a && b >= c && !hi) hi = k; if (b < a && b <= c && !lo) lo = k;
      }
      const fmt = (k) => { const hh = (clock.hour + k) % 24; return `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}`; };
      side.append(h('div', { class: 'paper-inset pad' }, h('h3', null, '潮の 時刻'),
        h('p', null, `いまの 潮位 ${clock.tide().toFixed(2)} m`), hi != null ? h('p', { class: 'small' }, `🌊 満潮 ${fmt(hi)}ごろ`) : null, lo != null ? h('p', { class: 'small' }, `🏖 干潮 ${fmt(lo)}ごろ`) : null));
    }
    side.append(h('div', { class: 'paper-inset pad small' }, h('h3', null, 'しるし'),
      h('p', null, '▲ あなた（向きの 矢印）'), h('p', null, '📍 見つけた 場所'), h('p', null, '🏠 建てた もの　🔥 火'), h('p', null, '● 仲間'), h('p', { class: 'muted' }, '歩いた ところだけ 地図に 描かれます。')));
  }
  const zoneJa = (z) => ({ sea: '海', beach: '砂浜', rocks: '岩場', jungle: 'ジャングル', grass: '草原', hill: '山', stream: '小川', pond: '池', cliff: '崖' }[z]);
  renderSide(); draw();
  let acc = 0;
  return { el, update(dt) { acc += dt; if (acc > 0.25) { acc = 0; draw(); } } };
}
