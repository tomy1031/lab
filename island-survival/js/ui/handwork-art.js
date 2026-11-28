// js/ui/handwork-art.js — 2D canvas drawing library for the hand-work overlay (DESIGN §24).
// Pure drawing: every function only touches the 2D context it is given. No imports, no DOM.
// Paper-notebook style: ink outlines, soft flat fills, a little hatching. No red anywhere.
//
//   drawProp(ctx, id, { x, y, scale = 1, rot = 0, t = 0, ...state })
//   drawHand(ctx, { x, y, side, pose, rot, scale, holding, holdState })
//   drawSpark(ctx, x, y, size, kind)
//   propBounds(id, scale) -> { w, h }

export const INK = '#2a2923', INK_SOFT = '#5d5849', TEAL = '#1f7f86', ORANGE = '#e8743b', SUN = '#f2b84b';
const GREEN = '#4a9a52', WOOD = '#b07a45', WOOD_D = '#8a5a30', STONE = '#8d8a80', STONE_D = '#6f6c64';
const CHERT = '#a8774f', OBS = '#2b2f3a', CORD = '#c9a96a', LEAF = '#6aa35a', SKIN = '#e9c9a6', PAPER = '#f7f0dd';

// ---------- small helpers ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
function hex(c) {
  if (c[0] === 'r') return c.match(/\d+/g).slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixc(a, b, t) {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
}
const lighten = (c, t = 0.35) => mixc(c, '#ffffff', t);
const darken = (c, t = 0.3) => mixc(c, '#2a2923', t);
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function paint(ctx, fill, lw = 2.5, stroke = INK) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); }
// smooth closed curve through points (Catmull-Rom -> bezier)
function blob(ctx, pts, closed = true) {
  const n = pts.length; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const a = (!closed && i === 0) ? p1 : p0, d = (!closed && i === n - 2) ? p2 : p3;
    ctx.bezierCurveTo(p1[0] + (p2[0] - a[0]) / 6, p1[1] + (p2[1] - a[1]) / 6, p2[0] - (d[0] - p1[0]) / 6, p2[1] - (d[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}
function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
function hatch(ctx, x0, y0, x1, y1, gap = 9, color = INK, alpha = 0.18, lw = 1.6, ang = 0.8) {
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  const len = Math.hypot(x1 - x0, y1 - y0) * 1.4, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ca = Math.cos(ang), sa = Math.sin(ang);
  ctx.beginPath();
  for (let d = -len / 2; d < len / 2; d += gap) { const px = cx + -sa * d, py = cy + ca * d; ctx.moveTo(px - ca * len, py - sa * len); ctx.lineTo(px + ca * len, py + sa * len); }
  ctx.stroke(); ctx.restore();
}
function shadow(ctx, x, y, rx, ry, a = 0.14) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = INK; ell(ctx, x, y, rx, ry); ctx.fill(); ctx.restore(); }
// thick outlined polyline "limb": ink underlay + colour on top
function limb(ctx, pts, w, fill, lw = 2.5) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const trace = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
  trace(); ctx.strokeStyle = INK; ctx.lineWidth = w + lw * 2; ctx.stroke();
  trace(); ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke(); ctx.restore();
}
function withT(ctx, x, y, scale, rot, fn) {
  ctx.save(); ctx.translate(num(x, 0), num(y, 0)); if (rot) ctx.rotate(rot); const s = num(scale, 1); ctx.scale(s, s); fn(); ctx.restore();
}
const STONE_FILL = { chert: CHERT, obsidian: OBS, stone: STONE };

// ---------- props (local coords, centred at 0,0; scale 1 ≈ natural size from propBounds) ----------
const P = {};

P.lap = (ctx) => {
  shadow(ctx, 0, 62, 190, 16, 0.16);
  rr(ctx, -175, -34, 330, 92, 40); paint(ctx, WOOD);
  ctx.save(); rr(ctx, -175, -34, 330, 92, 40); ctx.clip();
  hatch(ctx, -175, -34, 155, 58, 11, WOOD_D, 0.28, 1.6, 0.05);
  ctx.fillStyle = lighten(WOOD, 0.4); ctx.globalAlpha = 0.5; rr(ctx, -150, -28, 270, 12, 6); ctx.fill(); ctx.restore();
  ctx.save(); ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  [[-100, 4, -50, 4], [20, 22, 90, 22], [-30, 38, 30, 38], [60, -6, 110, -6]].forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo((a + c) / 2, b + 4, c, d); ctx.stroke(); });
  ctx.restore();
  ell(ctx, 155, 12, 34, 46); paint(ctx, lighten(WOOD, 0.45));
  [30, 20, 10, 3].forEach((r, i) => { ell(ctx, 155, 12, r * 0.75, r * 1.0); paint(ctx, null, 1.4, i ? INK_SOFT : INK_SOFT); });
};

function coreOutline(ctx) { blob(ctx, [[-70, -8], [-48, -56], [4, -70], [56, -54], [76, 0], [54, 56], [2, 68], [-52, 50]]); }
P.core = (ctx, s) => {
  const mat = s.material in STONE_FILL ? s.material : 'chert', base = STONE_FILL[mat];
  const chips = clamp(Math.round(num(s.chips, 0)), 0, 6);
  shadow(ctx, 6, 74, 76, 11);
  coreOutline(ctx); paint(ctx, base);
  ctx.save(); coreOutline(ctx); ctx.clip();
  hatch(ctx, -80, -80, 90, 80, 10, INK, mat === 'obsidian' ? 0.35 : 0.14, 1.5, 0.9);
  ctx.globalAlpha = mat === 'obsidian' ? 0.55 : 0.45; ctx.fillStyle = mat === 'obsidian' ? '#6c8fd0' : lighten(base, 0.5);
  ell(ctx, 18, -34, 30, 11, -0.5); ctx.fill();
  // flake scars: scalloped facets along the left edge
  for (let i = 0; i < chips; i++) {
    const cy = -46 + i * 18, cx = -70 + (i % 2) * 6;
    ctx.globalAlpha = 1; ell(ctx, cx + 6, cy, 22, 13, 0.5); ctx.fillStyle = mat === 'obsidian' ? '#3b4256' : lighten(base, 0.38); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 18, cy, 9, -1, 1); ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.restore();
  coreOutline(ctx); paint(ctx, null, 3);
  if (s.cracked) {
    ctx.save(); coreOutline(ctx); ctx.clip();
    ctx.beginPath(); ctx.moveTo(14, -72); ctx.lineTo(4, -40); ctx.lineTo(22, -18); ctx.lineTo(0, 6); ctx.lineTo(20, 30); ctx.lineTo(6, 70);
    ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = lighten(base, 0.6); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
};

P.hammerstone = (ctx, s) => {
  const r = clamp(num(s.raised, 0));
  shadow(ctx, 6, 56 + r * 14, 46 - r * 10, 8 - r * 3, 0.16 - r * 0.06);
  blob(ctx, [[-44, 4], [-30, -38], [10, -46], [44, -22], [46, 16], [20, 44], [-20, 44]]); paint(ctx, STONE, 3);
  ctx.save(); blob(ctx, [[-44, 4], [-30, -38], [10, -46], [44, -22], [46, 16], [20, 44], [-20, 44]]); ctx.clip();
  hatch(ctx, -50, -50, 50, 50, 9, INK, 0.16, 1.5, 0.9);
  ctx.globalAlpha = 0.5; ctx.fillStyle = lighten(STONE, 0.5); ell(ctx, -10, -24, 18, 8, -0.4); ctx.fill(); ctx.restore();
  ctx.fillStyle = STONE_D; ctx.globalAlpha = 0.5; [[10, 10], [24, -8], [-8, 22], [-22, 4]].forEach(([x, y]) => { ell(ctx, x, y, 2.6, 2); ctx.fill(); }); ctx.globalAlpha = 1;
};

function flakePath(ctx) { blob(ctx, [[-72, 4], [-34, -30], [26, -36], [78, -4], [30, 26], [-30, 28]]); }
P.flake = (ctx, s) => {
  const mat = s.material in STONE_FILL ? s.material : 'chert', base = STONE_FILL[mat], k = clamp(num(s.size, 1), 0.3, 1.2);
  ctx.save(); ctx.scale(k, k); shadow(ctx, 6, 38, 66, 8);
  flakePath(ctx); paint(ctx, base, 3);
  ctx.save(); flakePath(ctx); ctx.clip();
  ctx.strokeStyle = mat === 'obsidian' ? '#6c8fd0' : lighten(base, 0.45); ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9;
  [14, 30, 46].forEach((r) => { ctx.beginPath(); ctx.arc(-60, 0, r + 14, -0.8, 0.8); ctx.stroke(); });
  ctx.globalAlpha = 0.5; ctx.fillStyle = mat === 'obsidian' ? '#6c8fd0' : lighten(base, 0.5); ell(ctx, 14, -22, 30, 5, -0.12); ctx.fill();
  ctx.restore(); flakePath(ctx); paint(ctx, null, 3);
  ctx.strokeStyle = lighten(base, 0.7); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(34, 22); ctx.quadraticCurveTo(66, 14, 76, -2); ctx.stroke();
  ctx.restore();
};

P.whetstone = (ctx, s) => {
  const wet = clamp(num(s.wet, 0));
  shadow(ctx, 0, 40, 150, 12, 0.16);
  rr(ctx, -150, -34, 300, 70, 26); paint(ctx, STONE, 3);
  ctx.save(); rr(ctx, -150, -34, 300, 70, 26); ctx.clip();
  hatch(ctx, -150, -34, 150, 36, 10, INK, 0.12, 1.4, 0.9);
  ctx.fillStyle = lighten(STONE, 0.45); ctx.globalAlpha = 0.5; rr(ctx, -128, -28, 230, 10, 5); ctx.fill(); ctx.globalAlpha = 1;
  if (wet > 0.02) {
    ctx.globalAlpha = 0.35 + wet * 0.45; ctx.fillStyle = '#7fc6cf'; blob(ctx, [[-86, -4], [-40, -22], [40, -22], [96, -6], [84, 22], [10, 28], [-60, 24]]); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-60, -6); ctx.quadraticCurveTo(-10, -14, 40, -10); ctx.stroke();
    ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6; blob(ctx, [[-86, -4], [-40, -22], [40, -22], [96, -6], [84, 22], [10, 28], [-60, 24]]); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-120, 20); ctx.lineTo(-96, 26); ctx.moveTo(100, 22); ctx.lineTo(126, 12); ctx.stroke();
};

P.blade = (ctx, s, t) => {
  const kind = s.kind || 'knife', shine = clamp(num(s.shine, 0)), tilt = num(s.angle, 0);
  ctx.save(); ctx.rotate(tilt);
  const edge = (pts) => { // glowing edge highlight along a polyline
    if (shine <= 0.02) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = 0.3 + 0.7 * shine;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 + shine * 4; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.globalAlpha = shine * 0.6; ctx.strokeStyle = '#bfeff3'; ctx.lineWidth = 8 + shine * 6; ctx.stroke(); ctx.restore();
  };
  const glint = (x, y) => { if (shine > 0.6) drawStar(ctx, x, y, 8 + 10 * shine + Math.sin(t * 5) * 2, '#ffffff', TEAL); };
  if (kind === 'axe') {
    limb(ctx, [[-130, 18], [100, -10]], 16, WOOD); // haft
    ctx.beginPath(); ctx.moveTo(40, -62); ctx.lineTo(112, -40); ctx.lineTo(86, 40); ctx.lineTo(34, 20); ctx.closePath(); paint(ctx, STONE, 3);
    hatch(ctx, 34, -60, 110, 40, 9, INK, 0.15, 1.4, 0.8);
    ctx.strokeStyle = CORD; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(36, -34); ctx.lineTo(44, 24); ctx.stroke();
    edge([[112, -40], [86, 40]]); glint(100, 0);
  } else if (kind === 'stone') {
    blob(ctx, [[-110, 6], [-50, -40], [40, -44], [124, -2], [50, 36], [-50, 38]]); paint(ctx, STONE, 3);
    hatch(ctx, -110, -40, 120, 40, 10, INK, 0.14, 1.4, 0.9);
    edge([[40, -42], [124, -2], [50, 36]]); glint(110, -4);
  } else if (kind === 'bone') {
    ctx.beginPath(); ctx.moveTo(-120, -14); ctx.quadraticCurveTo(-140, -30, -126, -4); ctx.quadraticCurveTo(-140, 20, -116, 14);
    ctx.lineTo(60, 12); ctx.lineTo(130, 0); ctx.lineTo(60, -14); ctx.closePath(); paint(ctx, '#efe6cf', 3);
    ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-90, -2); ctx.lineTo(50, 0); ctx.stroke();
    edge([[60, -14], [130, 0]]); glint(122, 0);
  } else if (kind === 'shell') {
    ctx.beginPath(); ctx.moveTo(-90, 40); ctx.bezierCurveTo(-130, -30, -40, -70, 40, -50); ctx.bezierCurveTo(130, -20, 110, 50, 40, 52); ctx.bezierCurveTo(-10, 56, -60, 56, -90, 40); ctx.closePath(); paint(ctx, '#f0d9c0', 3);
    ctx.save(); ctx.clip(); ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.7;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-90, 40); ctx.lineTo(-70 + i * 26, -60 + Math.abs(i - 3) * 8); ctx.stroke(); }
    ctx.restore(); edge([[40, -50], [110, -10], [90, 40]]); glint(104, -6);
  } else { // knife
    limb(ctx, [[-140, 4], [-40, 4]], 22, WOOD); // handle
    ctx.strokeStyle = CORD; ctx.lineWidth = 5; ctx.beginPath(); [-66, -56, -46].forEach((x) => { ctx.moveTo(x, -9); ctx.lineTo(x + 6, 17); }); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-40, -16); ctx.lineTo(72, -16); ctx.quadraticCurveTo(128, -8, 136, 24); ctx.quadraticCurveTo(60, 22, -40, 22); ctx.closePath(); paint(ctx, STONE, 3);
    ctx.fillStyle = lighten(STONE, 0.5); ctx.globalAlpha = 0.5; rr(ctx, -34, -12, 100, 7, 3); ctx.fill(); ctx.globalAlpha = 1;
    edge([[-30, 22], [60, 22], [136, 24]]); glint(120, 22);
  }
  ctx.restore();
};

function stickPoly(len, taper, straight) {
  const L = len * 150, N = 26, bend = (1 - straight) * 20, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = -L + 2 * L * u, cy = bend * Math.sin(u * Math.PI) - bend * 0.3 * Math.sin(u * Math.PI * 2);
    const k = clamp((u - 0.55) / 0.45), w = 11 * (1 - taper * Math.pow(k, 1.4) * 0.93) + (i === 0 ? -1 : 0);
    top.push([x, cy - w]); bot.push([x, cy + w]);
  }
  return { top, bot, L, N };
}
P.stick = (ctx, s) => {
  const len = clamp(num(s.length, 1), 0.4, 1.4), taper = clamp(num(s.taper, 0)), notch = clamp(num(s.notch, 0)), ch = clamp(num(s.charred, 0)), straight = clamp(num(s.straight, 1));
  const g = stickPoly(len, taper, straight), pts = g.top.concat(g.bot.slice().reverse());
  shadow(ctx, 0, 26, g.L * 0.95, 5, 0.12);
  poly(ctx, pts); paint(ctx, WOOD, 3);
  ctx.save(); poly(ctx, pts); ctx.clip();
  ctx.beginPath(); g.top.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] + 4) : ctx.moveTo(p[0], p[1] + 4)));
  ctx.strokeStyle = lighten(WOOD, 0.45); ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); g.bot.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] - 3) : ctx.moveTo(p[0], p[1] - 3))); ctx.strokeStyle = WOOD_D; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.6;
  for (let i = 3; i < g.N - 2; i += 4) { const a = g.top[i], b = g.bot[i]; ctx.beginPath(); ctx.moveTo(a[0], (a[1] + b[1]) / 2 - 2); ctx.lineTo(a[0] + 12, (a[1] + b[1]) / 2 - 1); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (ch > 0.01) {
    const x0 = g.L - g.L * 2 * (0.1 + 0.4 * ch), gr = ctx.createLinearGradient(x0, 0, g.L, 0);
    gr.addColorStop(0, 'rgba(42,37,35,0)'); gr.addColorStop(0.5, `rgba(60,45,35,${0.55 * ch + 0.2})`); gr.addColorStop(1, `rgba(30,26,24,${0.5 + 0.5 * ch})`);
    ctx.fillStyle = gr; ctx.fillRect(x0, -30, g.L - x0 + 4, 60);
  }
  ctx.restore();
  poly(ctx, pts); paint(ctx, null, 3);
  ell(ctx, -g.L, 0, 4.5, 11); paint(ctx, lighten(WOOD, 0.55), 2);
  if (notch > 0.01) {
    const i = Math.round(g.N * 0.38), c = g.top[i], d = 4 + 12 * notch, hw = 4 + 9 * notch;
    poly(ctx, [[c[0] - hw, c[1] - 1], [c[0] + hw * 0.4, c[1] - 1], [c[0] - hw * 0.1, c[1] + d]]);
    paint(ctx, '#4a2f18', 2.2);
    ctx.strokeStyle = lighten(WOOD, 0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c[0] - hw, c[1] + 1); ctx.lineTo(c[0] - hw * 0.1, c[1] + d + 1); ctx.stroke();
  }
};

P.cord = (ctx, s, t) => {
  const prog = clamp(num(s.progress, 0)), loose = !!s.loose, tight = !!s.tight;
  const x0 = -160, x1 = 160, xp = x0 + prog * (x1 - x0), w = tight ? 15 : 18;
  const strands = [CORD, lighten(CORD, 0.25), darken(CORD, 0.1)];
  // loose strands fan out to the right
  const spread = loose ? 30 : 20;
  strands.forEach((c, i) => {
    const off = (i - 1) * spread, wob = Math.sin(t * 1.6 + i * 2) * (loose ? 4 : 1.5);
    const path = () => { ctx.beginPath(); ctx.moveTo(xp, 0); ctx.bezierCurveTo(xp + 50, off * 0.3 + wob, xp + 70 + (loose ? 10 : 0), off + wob, x1, off * 1.25 + (loose ? Math.sin(i * 3 + 1) * 12 : 0)); };
    if (prog < 0.999) { path(); ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.stroke(); path(); ctx.strokeStyle = c; ctx.lineWidth = 7; ctx.stroke(); }
    if (loose && prog < 0.999) { ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x1, off * 1.25); ctx.lineTo(x1 + 8, off * 1.25 + 8 + i * 2); ctx.moveTo(x1, off * 1.25); ctx.lineTo(x1 + 10, off * 1.25 - 4); ctx.stroke(); }
  });
  if (prog > 0.01) { // twisted rope: slanted wraps
    const yy = (x) => (tight ? 0 : Math.sin(x * 0.03) * 2.5);
    const trace = () => { ctx.beginPath(); for (let x = x0; x <= xp; x += 6) (x === x0 ? ctx.moveTo(x, yy(x)) : ctx.lineTo(x, yy(x))); };
    trace(); ctx.strokeStyle = INK; ctx.lineWidth = w + 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    trace(); ctx.strokeStyle = CORD; ctx.lineWidth = w; ctx.stroke();
    ctx.lineCap = 'butt';
    const step = tight ? 8 : 11;
    for (let x = x0 + 6; x < xp - 2; x += step) {
      ctx.beginPath(); ctx.moveTo(x, yy(x) - w / 2); ctx.lineTo(x + 7, yy(x) + w / 2); ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 3, yy(x) - w / 2 + 1); ctx.lineTo(x + 9, yy(x) + w / 2 - 1); ctx.strokeStyle = lighten(CORD, 0.5); ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.lineCap = 'round'; ell(ctx, xp, 0, 3, 3); paint(ctx, CORD, 1.5);
  }
  // left end tassel
  ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, -2); ctx.lineTo(x0 - 12, -8); ctx.moveTo(x0, 2); ctx.lineTo(x0 - 12, 8); ctx.stroke();
};

function wrapBands(ctx, n, axisFrom, axisTo, width, tight, bump) {
  const dx = axisTo[0] - axisFrom[0], dy = axisTo[1] - axisFrom[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const gap = tight ? 9 : 12;
  for (let i = 0; i < n; i++) {
    const c = i * gap - (n - 1) * gap / 2, cx = (axisFrom[0] + axisTo[0]) / 2 + ux * c, cy = (axisFrom[1] + axisTo[1]) / 2 + uy * c;
    const jit = tight ? 0 : Math.sin(i * 7.3) * 0.18, hw = width / 2 + (tight ? 2 : bump + Math.cos(i * 3.1) * 2);
    const a = [cx - nx * hw - ux * 5, cy - ny * hw - uy * 5], b = [cx + nx * hw + ux * 5, cy + ny * hw + uy * 5];
    const sl = (tight ? 0.35 : 0.35 + jit);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = tight ? CORD : lighten(CORD, 0.1); ctx.lineWidth = 5.4; ctx.stroke();
    ctx.strokeStyle = lighten(CORD, 0.5); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(a[0] + ux * 1.5 + nx * 3, a[1] + uy * 1.5 + ny * 3); ctx.lineTo(b[0] + ux * 1.5 - nx * 3, b[1] + uy * 1.5 - ny * 3); ctx.stroke();
    void sl;
  }
}
P.lashing = (ctx, s, t) => {
  const wraps = clamp(Math.round(num(s.wraps, 0)), 0, 8), tight = !!s.tight, variant = s.variant === 'haft' ? 'haft' : 'cross';
  shadow(ctx, 0, 100, 120, 10, 0.12);
  if (variant === 'cross') {
    limb(ctx, [[-110, 82], [120, -82]], 22, WOOD, 2.8); limb(ctx, [[-120, -70], [120, 78]], 22, lighten(WOOD, 0.12), 2.8);
    ell(ctx, 120, -82, 4, 11, -0.9); paint(ctx, lighten(WOOD, 0.55), 1.6);
    if (wraps) wrapBands(ctx, wraps, [-34, 0], [34, 0], 50, tight, 4);
    // wraps lie diagonal across the junction: draw rotated copy
    if (!wraps) { ell(ctx, 0, 0, 3, 3); paint(ctx, null, 0); }
  } else {
    limb(ctx, [[-4, 110], [4, -28]], 20, WOOD, 2.8); // handle
    ctx.save(); ctx.translate(0, -52); ctx.rotate(-Math.PI / 2); ctx.scale(0.62, 0.62); P.flake(ctx, { material: 'stone', size: 1 }); ctx.restore();
    if (wraps) { ctx.save(); ctx.translate(0, 8); ctx.rotate(Math.PI / 2); wrapBands(ctx, wraps, [-40, 0], [40, 0], 28, tight, 4); ctx.restore(); }
  }
  if (wraps > 0 && !tight) { // slack tail dangling
    const wob = Math.sin(t * 2) * 4;
    ctx.beginPath(); ctx.moveTo(10, 8); ctx.bezierCurveTo(30, 40 + wob, 50, 36, 62, 66 + wob); ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = CORD; ctx.lineWidth = 4.6; ctx.stroke();
  }
};

P.weave = (ctx, s, t) => {
  const total = Math.max(1, Math.round(num(s.total, 8))), rows = clamp(Math.round(num(s.rows, 0)), 0, total);
  const looseSet = new Set(Array.isArray(s.loose) ? s.loose : []);
  const mat = s.material || 'leaf', pal = { leaf: [LEAF, '#8cc470'], vine: ['#7a6a3a', '#9d8850'], fiber: [CORD, '#ddc48c'] }[mat] || [LEAF, '#8cc470'];
  const nW = 9, sp = 32, W = nW * sp, H = 210, x0 = -W / 2, y0 = -H / 2, rowH = H / total, th = Math.min(rowH * 0.86, 24), ww = 20;
  ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = INK; rr(ctx, x0 - 6, y0 - 4, W + 12, H + 14, 8); ctx.fill(); ctx.restore();
  // paper-ish mat backing line
  const wx = (i) => x0 + sp / 2 + i * sp;
  for (let i = 0; i < nW; i++) { // warps with fringe
    rr(ctx, wx(i) - ww / 2, y0 - 14, ww, H + 28, 7); paint(ctx, pal[0], 2.2);
    ctx.strokeStyle = lighten(pal[0], 0.45); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(wx(i) - 3, y0 - 6); ctx.lineTo(wx(i) - 3, y0 + H + 6); ctx.stroke();
  }
  // next-row guide
  if (rows < total) {
    const yy = y0 + (rows + 0.5) * rowH; ctx.save(); ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 12; ctx.strokeStyle = TEAL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 - 6, yy); ctx.lineTo(x0 + W + 6, yy); ctx.stroke(); ctx.restore();
  }
  for (let r = 0; r < rows; r++) {
    const yc = y0 + (r + 0.5) * rowH;
    if (looseSet.has(r)) { // slack row: wavy, sagging, bulging past the edges
      const path = () => { ctx.beginPath(); for (let x = x0 - 12; x <= x0 + W + 12; x += 6) { const y = yc + Math.sin(x * 0.07 + r) * 5 + Math.sin((x - x0) / W * Math.PI) * 4; (x === x0 - 12 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); } };
      path(); ctx.strokeStyle = INK; ctx.lineWidth = th + 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); path(); ctx.strokeStyle = lighten(pal[1], 0.1); ctx.lineWidth = th - 1; ctx.stroke();
      continue;
    }
    rr(ctx, x0 - 2, yc - th / 2, W + 4, th, th / 2.4); paint(ctx, pal[1], 2.2);
    ctx.strokeStyle = lighten(pal[1], 0.5); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0 + 6, yc - th / 4); ctx.lineTo(x0 + W - 6, yc - th / 4); ctx.stroke();
    for (let i = 0; i < nW; i++) if ((i + r) % 2 === 1) { // warp passes over
      ctx.fillStyle = pal[0]; ctx.fillRect(wx(i) - ww / 2 + 1, yc - th / 2 - 1, ww - 2, th + 2);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(wx(i) - ww / 2, yc - th / 2 - 1); ctx.lineTo(wx(i) - ww / 2, yc + th / 2 + 1); ctx.moveTo(wx(i) + ww / 2, yc - th / 2 - 1); ctx.lineTo(wx(i) + ww / 2, yc + th / 2 + 1); ctx.stroke();
      ctx.strokeStyle = lighten(pal[0], 0.45); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(wx(i) - 3, yc - th / 2); ctx.lineTo(wx(i) - 3, yc + th / 2); ctx.stroke();
    }
  }
};

P.bowl = (ctx, s, t) => {
  const mix = clamp(num(s.mix, 0)), content = s.content || 'paste';
  const defs = { paste: [LEAF, '#e8c15a'], clay: ['#b98a64', '#8d6a4a'], powder: [STONE_D, CHERT], water: ['#8fd0d8', '#bfe8ec'] }[content] || [LEAF, '#e8c15a'];
  const [ca, cb] = Array.isArray(s.colors) && s.colors.length >= 2 ? s.colors : defs;
  shadow(ctx, 0, 80, 92, 11, 0.16);
  // shell body
  ctx.beginPath(); ctx.moveTo(-104, -14); ctx.bezierCurveTo(-104, 62, -50, 84, 0, 84); ctx.bezierCurveTo(50, 84, 104, 62, 104, -14); ctx.closePath(); paint(ctx, WOOD_D, 3);
  ctx.save(); ctx.clip(); hatch(ctx, -110, -14, 110, 84, 8, INK, 0.2, 1.4, 1.1); ctx.fillStyle = lighten(WOOD_D, 0.3); ctx.globalAlpha = 0.45; ell(ctx, -58, 36, 14, 26, 0.5); ctx.fill(); ctx.restore();
  ell(ctx, 0, -14, 104, 36); paint(ctx, '#d7b98a', 3);        // rim
  ell(ctx, 0, -12, 92, 29); paint(ctx, '#6a4423', 2);          // inner shadow
  ell(ctx, 0, -9, 84, 25); ctx.fillStyle = mixc(ca, cb, mix); ctx.fill();
  ctx.save(); ell(ctx, 0, -9, 84, 25); ctx.clip();
  if (content === 'water') {
    ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
    [0.3, 0.55, 0.8].forEach((k, i) => { ell(ctx, Math.sin(t + i) * 8, -9, 84 * k + Math.sin(t * 2 + i) * 3, 25 * k); ctx.stroke(); });
  } else {
    ctx.translate(0, -9);
    const rot = t * (0.8 + mix * 1.2), a = (1 - mix);
    for (let k = 0; k < 3; k++) {
      [ca, cb].forEach((c, ci) => {
        ctx.beginPath(); for (let u = 0; u <= 1; u += 0.04) { const ang = rot + ci * Math.PI + k * 2.1 + u * 5, rad = 12 + u * 78; (u === 0 ? ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.3) : ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.3)); }
        ctx.strokeStyle = c; ctx.globalAlpha = 0.35 + 0.65 * a; ctx.lineWidth = 7 * a + 2; ctx.lineCap = 'round'; ctx.stroke();
      });
    }
    if (content === 'powder') { const R = rng(5); ctx.fillStyle = INK; ctx.globalAlpha = 0.25; for (let i = 0; i < 30; i++) { ell(ctx, (R() - 0.5) * 150, (R() - 0.5) * 40, 1.3, 1); ctx.fill(); } }
  }
  ctx.restore();
  ell(ctx, 0, -9, 84, 25); paint(ctx, null, 2);
  ctx.beginPath(); ctx.arc(0, -14, 100, Math.PI * 1.1, Math.PI * 1.35); ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.6; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
  if (s.pestle) {
    const sw = Math.sin(t * 3) * 6 * (1 - mix * 0.3);
    limb(ctx, [[46 + sw, -100], [8 + sw * 0.4, -10]], 22, STONE, 3);
    ell(ctx, 8 + sw * 0.4, -8, 17, 9); paint(ctx, STONE_D, 2.4);
    ctx.strokeStyle = lighten(STONE, 0.5); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(40 + sw, -96); ctx.lineTo(14 + sw * 0.4, -22); ctx.stroke();
  }
};

P.clay = (ctx, s) => {
  const coils = clamp(Math.round(num(s.coils, 0)), 0, 3), sm = clamp(num(s.smooth, 0));
  const CL = '#b98a64', CL_L = lighten(CL, 0.3);
  shadow(ctx, 0, 70, 100, 11, 0.16);
  if (coils === 0) { // lump of clay + one rolled coil
    blob(ctx, [[-70, 30], [-50, -20], [10, -44], [66, -10], [74, 36], [20, 62], [-40, 60]]); paint(ctx, CL, 3);
    ctx.fillStyle = CL_L; ctx.globalAlpha = 0.5; ell(ctx, -10, -18, 26, 9, -0.4); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(24, 24, 7, 0, 5); ctx.stroke(); return;
  }
  ell(ctx, 0, 56, 78, 16); paint(ctx, darken(CL, 0.1), 3); // base disc
  const hs = [0, 52, 100, 138].slice(0, coils + 1), ws = [78, 88, 86, 70];
  for (let i = 0; i < coils; i++) {
    const yb = 56 - i * 44, w0 = ws[i], w1 = ws[i + 1] || ws[i];
    ctx.beginPath(); ctx.moveTo(-w0, yb); ctx.bezierCurveTo(-w0 - 8, yb - 22, -w1 - 6, yb - 34, -w1, yb - 44); ctx.lineTo(w1, yb - 44); ctx.bezierCurveTo(w1 + 6, yb - 34, w0 + 8, yb - 22, w0, yb); ctx.bezierCurveTo(w0 - 20, yb + 18, -w0 + 20, yb + 18, -w0, yb); ctx.closePath();
    paint(ctx, CL, 3);
    ctx.save(); ctx.clip();
    ctx.fillStyle = CL_L; ctx.globalAlpha = 0.35; ell(ctx, -w0 * 0.45, yb - 22, 14, 18, 0.2); ctx.fill(); ctx.globalAlpha = 1;
    if (sm < 1) { ctx.strokeStyle = darken(CL, 0.35); ctx.lineWidth = 2; ctx.globalAlpha = 1 - sm; for (let x = -w1 + 8; x < w1; x += 15) { ctx.beginPath(); ctx.moveTo(x, yb - 44); ctx.quadraticCurveTo(x + 4, yb - 24, x - 3, yb - 2); ctx.stroke(); } }
    ctx.restore();
    ell(ctx, 0, yb - 44, w1, 14); paint(ctx, i === coils - 1 ? darken(CL, 0.35) : CL, 2.4);
    if (i === coils - 1) { ell(ctx, 0, yb - 43, w1 - 9, 9); ctx.fillStyle = darken(CL, 0.5); ctx.fill(); }
  }
  if (sm > 0.5) { ctx.strokeStyle = '#fff'; ctx.globalAlpha = (sm - 0.5) * 1.4; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-72, 30 - (coils - 1) * 44); ctx.lineTo(-76, 8 - (coils - 1) * 22); ctx.stroke(); ctx.globalAlpha = 1; }
  void hs;
};

P.fire = (ctx, s, t) => {
  const pw = clamp(num(s.power, 0.6), 0, 1);
  shadow(ctx, 0, 62, 110, 14, 0.2);
  ctx.save(); ctx.globalAlpha = 0.12 + pw * 0.2; const g = ctx.createRadialGradient(0, -10, 10, 0, -10, 150); g.addColorStop(0, SUN); g.addColorStop(1, 'rgba(242,184,75,0)'); ctx.fillStyle = g; ctx.fillRect(-160, -160, 320, 320); ctx.restore();
  limb(ctx, [[-84, 48], [66, 18]], 22, WOOD_D, 2.8); limb(ctx, [[84, 48], [-60, 20]], 22, WOOD, 2.8);
  ell(ctx, 90, 47, 4, 10, 0.2); paint(ctx, lighten(WOOD, 0.5), 1.4);
  // flames behind stones, in front of logs
  const h = 30 + pw * 105, flame = (cx, w, hh, col, ph) => {
    const sw = Math.sin(t * 5 + ph) * 7 * pw, fl = 1 + Math.sin(t * 9 + ph * 2) * 0.07;
    ctx.beginPath(); ctx.moveTo(cx - w, 40); ctx.bezierCurveTo(cx - w * 1.2, 0, cx - w * 0.3 + sw * 0.4, -hh * 0.5, cx + sw, -hh * fl);
    ctx.bezierCurveTo(cx + w * 0.4 + sw * 0.5, -hh * 0.4, cx + w * 1.3, 0, cx + w, 40); ctx.closePath(); paint(ctx, col, col === ORANGE ? 3 : 0);
  };
  flame(0, 54, h, ORANGE, 0); flame(-26, 28, h * 0.6, ORANGE, 2); flame(28, 26, h * 0.52, ORANGE, 4);
  flame(0, 36, h * 0.68, SUN, 1); flame(0, 18, h * 0.38, '#fff4c4', 3);
  [[-96, 52, 20, 14], [-52, 62, 22, 14], [0, 66, 22, 14], [52, 62, 22, 14], [96, 52, 20, 14]].forEach(([x, y, rx, ry], i) => { blob(ctx, [[x - rx, y], [x - rx * 0.5, y - ry], [x + rx * 0.6, y - ry * 0.9], [x + rx, y], [x + rx * 0.4, y + ry], [x - rx * 0.5, y + ry * 0.8]]); paint(ctx, i % 2 ? STONE : STONE_D, 2.6); });
};

const FOOD_STOPS = [[0, '#ecd0ba'], [0.4, '#e6bf92'], [0.7, '#dca948'], [0.95, '#b9782f'], [1.1, '#7a4a22'], [1.2, '#3a2a1e'], [1.4, '#1f1b18']];
function foodColor(d) {
  d = clamp(d, 0, 1.4);
  for (let i = 1; i < FOOD_STOPS.length; i++) if (d <= FOOD_STOPS[i][0]) { const a = FOOD_STOPS[i - 1], b = FOOD_STOPS[i]; return mixc(a[1], b[1], (d - a[0]) / (b[0] - a[0])); }
  return FOOD_STOPS[FOOD_STOPS.length - 1][1];
}
P.skewer = (ctx, s, t) => {
  const d = clamp(num(s.doneness, 0), 0, 1.4), side = s.side ? 1 : 0, food = s.food || 'fish';
  const c = foodColor(d), c2 = foodColor(d + 0.28), face = side ? foodColor(d * 0.8) : c;
  ctx.save(); ctx.rotate(-0.1);
  shadow(ctx, 0, 70, 120, 8, 0.1);
  limb(ctx, [[-140, 4], [140, -4]], 9, WOOD, 2.4);
  ell(ctx, 142, -4, 3, 5); paint(ctx, lighten(WOOD, 0.5), 1.4);
  const grill = (clipFn) => { // browned stripes; angle flips with `side`
    ctx.save(); clipFn(); ctx.clip(); ctx.globalAlpha = clamp(d * 0.9, 0, 0.85); ctx.strokeStyle = c2; ctx.lineWidth = 5; ctx.lineCap = 'butt';
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(i * 20 - 14, side ? -50 : 50); ctx.lineTo(i * 20 + 14, side ? 50 : -50); ctx.stroke(); }
    ctx.restore();
  };
  if (food === 'fish') {
    const body = () => blob(ctx, [[-84, -2], [-48, -30], [14, -34], [70, -10], [84, 4], [60, 24], [0, 32], [-52, 24]]);
    poly(ctx, [[-70, 2], [-124, -34], [-112, 2], [-124, 38]]); paint(ctx, mixc(face, '#000', 0.08), 3);
    poly(ctx, [[-10, -30], [24, -58], [40, -26]]); paint(ctx, mixc(face, '#000', 0.08), 2.6);
    body(); paint(ctx, face, 3); grill(body);
    ctx.save(); body(); ctx.clip(); ctx.strokeStyle = darken(face, 0.35); ctx.globalAlpha = 0.7; ctx.lineWidth = 1.6;
    for (let x = -50; x < 40; x += 13) { ctx.beginPath(); ctx.arc(x, 0, 13, -0.9, 0.9); ctx.stroke(); } ctx.restore();
    ell(ctx, 56, -6, 5.5, 5.5); paint(ctx, '#fff', 2); ell(ctx, 57, -6, 2.4, 2.4); ctx.fillStyle = INK; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(80, 6); ctx.lineTo(70, 8); ctx.stroke();
  } else if (food === 'meat') {
    [-62, 0, 62].forEach((x, i) => { const body = () => blob(ctx, [[x - 30, -4 + i], [x - 14, -32], [x + 18, -34], [x + 34, -6], [x + 28, 26], [x - 6, 34], [x - 28, 20]]); body(); paint(ctx, i === 1 ? face : mixc(face, '#000', 0.06), 3); grill(body);
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.28; ell(ctx, x - 6, -18, 10, 5, -0.3); ctx.fill(); ctx.globalAlpha = 1; });
  } else if (food === 'crab') {
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { [-1, 1].forEach((sg) => { ctx.beginPath(); ctx.moveTo(sg * 38, -4 + i * 12); ctx.lineTo(sg * 66, -14 + i * 18); ctx.lineTo(sg * 82, 6 + i * 16); ctx.stroke(); }); }
    [-1, 1].forEach((sg) => { limb(ctx, [[sg * 40, -22], [sg * 72, -48]], 7, face, 2.2); ell(ctx, sg * 80, -56, 14, 11, sg * 0.5); paint(ctx, face, 2.6); });
    const body = () => ell(ctx, 0, 0, 52, 38); body(); paint(ctx, face, 3); grill(body);
    ctx.save(); body(); ctx.clip(); hatch(ctx, -50, -38, 50, 38, 9, INK, 0.14, 1.4, 0.3); ctx.restore();
    [-12, 12].forEach((x) => { ell(ctx, x, -34, 4, 4); paint(ctx, '#fff', 1.8); });
  } else { // root
    const body = () => blob(ctx, [[-96, 6], [-50, -22], [30, -28], [100, -4], [96, 10], [30, 32], [-52, 28]]);
    body(); paint(ctx, face, 3); grill(body);
    ctx.save(); body(); ctx.clip(); ctx.strokeStyle = darken(face, 0.3); ctx.globalAlpha = 0.5; ctx.lineWidth = 1.6;
    for (let x = -80; x < 80; x += 22) { ctx.beginPath(); ctx.moveTo(x, -26); ctx.quadraticCurveTo(x + 8, 4, x - 2, 30); ctx.stroke(); } ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-96, 6); ctx.lineTo(-114, 2); ctx.stroke();
  }
  if (d > 1.15) { ctx.strokeStyle = '#6f6c64'; ctx.globalAlpha = 0.6; ctx.lineWidth = 2.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 36, -50); ctx.bezierCurveTo(i * 36 + 12, -70 - Math.sin(t * 3 + i) * 4, i * 36 - 12, -80, i * 36 + 4, -96); ctx.stroke(); } }
  ctx.restore();
};

P.pot = (ctx, s, t) => {
  const bub = clamp(num(s.bubbles, 0)), steam = clamp(num(s.steam, 0)), content = s.content || 'water';
  const cc = { water: '#8fd0d8', stew: '#c9964f', pitch: '#3a3028', tea: '#b9783a' }[content] || '#8fd0d8';
  const CLAY = '#c98a5b';
  shadow(ctx, 0, 84, 100, 9, 0.16);
  [-1, 1].forEach((sg) => { ctx.beginPath(); ctx.arc(sg * 104, -20, 18, 0, Math.PI * 2); paint(ctx, CLAY, 3); ell(ctx, sg * 104, -20, 7, 7); paint(ctx, PAPER, 2.2); });
  ctx.beginPath(); ctx.moveTo(-96, -48); ctx.bezierCurveTo(-120, 10, -90, 80, -54, 84); ctx.lineTo(54, 84); ctx.bezierCurveTo(90, 80, 120, 10, 96, -48); ctx.closePath(); paint(ctx, CLAY, 3);
  ctx.save(); ctx.clip(); hatch(ctx, -120, -50, 120, 90, 9, INK, 0.14, 1.4, 0.9);
  ctx.fillStyle = INK; ctx.globalAlpha = 0.22; ell(ctx, 0, 90, 70, 24); ctx.fill(); // soot
  ctx.fillStyle = lighten(CLAY, 0.45); ctx.globalAlpha = 0.45; ell(ctx, -66, 8, 8, 30, 0.1); ctx.fill(); ctx.restore();
  ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-104, 20); ctx.quadraticCurveTo(0, 38, 104, 20); ctx.moveTo(-96, 36); ctx.quadraticCurveTo(0, 54, 96, 36); ctx.stroke();
  ell(ctx, 0, -48, 98, 28); paint(ctx, lighten(CLAY, 0.2), 3);
  ell(ctx, 0, -46, 88, 22); paint(ctx, cc, 2.2);
  ctx.save(); ell(ctx, 0, -46, 88, 22); ctx.clip();
  if (bub > 0.02) {
    const n = Math.round(2 + bub * 10), R = rng(9);
    for (let i = 0; i < n; i++) {
      const ph = (t * (0.7 + bub * 1.5) + R() * 3) % 1, bx = (R() - 0.5) * 140, by = -46 + (R() - 0.5) * 24, r = (3 + R() * 4) * (0.4 + bub * 0.8) * (0.6 + 0.6 * Math.sin(ph * Math.PI));
      ell(ctx, bx, by, r, r * 0.8); ctx.globalAlpha = 0.85; ctx.fillStyle = content === 'pitch' ? '#6f6c64' : '#fff'; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.2; ctx.stroke();
    }
  } else { ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ell(ctx, 0, -46, 40, 9); ctx.stroke(); }
  ctx.restore();
  ell(ctx, 0, -46, 88, 22); paint(ctx, null, 2.2);
  if (steam > 0.02) {
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const bx = -50 + i * 33, ph = (t * 0.6 + i * 0.27) % 1; ctx.globalAlpha = steam * (1 - ph) * 0.85; ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 3.5 + steam * 2;
      ctx.beginPath(); for (let u = 0; u <= 1; u += 0.1) { const y = -60 - u * (50 + 50 * steam) - ph * 16, x = bx + Math.sin(u * 5 + t * 2 + i) * 9; (u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); } ctx.stroke(); }
    ctx.restore();
  }
};

const FILTER_COL = { cloth: ['#efe6cf', '#b9ad8c'], charcoal: ['#3a3a40', '#6f6c64'], sand: ['#e4cc92', '#b79d5e'], gravel: ['#a9a69c', '#6f6c64'] };
P.filter = (ctx, s, t) => {
  const layers = Array.isArray(s.layers) ? s.layers : [], slots = Math.max(0, Math.round(num(s.slots, 0))), water = clamp(num(s.water, 0));
  const outline = () => { ctx.beginPath(); ctx.moveTo(-72, -140); ctx.lineTo(-72, 92); ctx.lineTo(-24, 128); ctx.lineTo(-24, 160); ctx.lineTo(24, 160); ctx.lineTo(24, 128); ctx.lineTo(72, 92); ctx.lineTo(72, -140); };
  ctx.save(); ctx.globalAlpha = 0.5; outline(); ctx.fillStyle = '#dff1f2'; ctx.fill(); ctx.restore();
  const uh = 44, yb = 96, R = rng(3);
  ctx.save(); outline(); ctx.clip();
  const slotRect = (i) => [-80, yb - (i + 1) * uh, 160, uh];
  layers.forEach((L, i) => {
    const [x, y, w, h] = slotRect(i), [c1, c2] = FILTER_COL[L] || FILTER_COL.sand;
    ctx.fillStyle = c1; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = c2; ctx.fillStyle = c2; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    if (L === 'cloth') { for (let yy = y + 6; yy < y + h; yy += 7) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); } for (let xx = x + 8; xx < x + w; xx += 9) { ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1; } }
    else if (L === 'charcoal') { for (let k = 0; k < 22; k++) { ctx.globalAlpha = 0.8; blob(ctx, [[0, -5], [6, -3], [5, 4], [-4, 5]].map(([a, b]) => [a + x + R() * w, b + y + 6 + R() * (h - 12)])); ctx.fill(); } ctx.globalAlpha = 1; }
    else if (L === 'sand') { for (let k = 0; k < 60; k++) { ell(ctx, x + R() * w, y + R() * h, 1.3, 1.1); ctx.fill(); } }
    else { for (let k = 0; k < 14; k++) { ell(ctx, x + 10 + R() * (w - 20), y + 8 + R() * (h - 16), 8 + R() * 4, 6 + R() * 3, R()); paint(ctx, mixc(c1, '#ffffff', R() * 0.3), 1.8); } }
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  });
  ctx.restore();
  // empty slots
  ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.8;
  for (let i = layers.length; i < layers.length + slots; i++) { const [x, y, w, h] = slotRect(i); if (y < -140) break; rr(ctx, x + 12, y + 4, w - 24, h - 8, 8); ctx.stroke(); }
  ctx.restore();
  // water: level above the stack + falling drops
  const top = yb - layers.length * uh;
  if (water > 0.02) {
    ctx.save(); outline(); ctx.clip(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#7fc6cf'; ctx.fillRect(-80, top - 14 - water * 22, 160, 14 + water * 22); ctx.restore();
    ctx.save(); ctx.fillStyle = '#7fc6cf'; ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const ph = (t * 0.9 + i / 3) % 1, y = lerp(top - 6, 92, ph); ctx.globalAlpha = 1 - ph * 0.3; ell(ctx, -30 + i * 30, y, 3.5, 5); ctx.fill(); }
    const ph2 = (t * 1.1) % 1; ctx.globalAlpha = water; ell(ctx, 0, lerp(128, 170, ph2), 4, 6); ctx.fillStyle = '#bfeff3'; ctx.fill(); ctx.stroke(); ctx.restore();
  }
  outline(); paint(ctx, null, 3.2);
  ctx.save(); ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.8; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-60, -120); ctx.lineTo(-60, 20); ctx.stroke(); ctx.restore();
  ctx.beginPath(); ctx.moveTo(-72, -140); ctx.lineTo(72, -140); ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.stroke();
};

// ----- tokens -----
function tokenIcon(ctx, kind) {
  switch (kind) {
    case 'cloth': rr(ctx, -20, -17, 40, 34, 4); paint(ctx, '#efe6cf', 2.4); ctx.strokeStyle = '#b9ad8c'; ctx.lineWidth = 1.4; for (let i = -10; i <= 12; i += 8) { ctx.beginPath(); ctx.moveTo(-18, i); ctx.lineTo(18, i); ctx.stroke(); } ctx.setLineDash([3, 3]); rr(ctx, -16, -13, 32, 26, 3); ctx.stroke(); ctx.setLineDash([]); break;
    case 'charcoal': [[-9, 6, 11], [9, 8, 10], [0, -8, 11]].forEach(([x, y, r], i) => { blob(ctx, [[x - r, y], [x - r * 0.4, y - r * 0.9], [x + r * 0.8, y - r * 0.7], [x + r, y + r * 0.4], [x - r * 0.3, y + r]]); paint(ctx, i ? '#3a3a40' : '#4a4a52', 2.2); }); break;
    case 'sand': blob(ctx, [[-22, 14], [-10, -2], [0, -12], [12, -2], [22, 14]], true); paint(ctx, '#e4cc92', 2.4); ctx.fillStyle = '#b79d5e'; [[-8, 8], [4, 4], [10, 10], [-2, 12], [-14, 12]].forEach(([x, y]) => { ell(ctx, x, y, 1.4, 1.2); ctx.fill(); }); break;
    case 'gravel': [[-9, 6, 8], [8, 8, 7], [-1, -8, 8], [14, -4, 5]].forEach(([x, y, r], i) => { ell(ctx, x, y, r, r * 0.8, i); paint(ctx, i % 2 ? '#a9a69c' : '#8d8a80', 2.2); }); break;
    case 'leaf': ctx.beginPath(); ctx.moveTo(-18, 16); ctx.bezierCurveTo(-24, -14, 4, -24, 20, -18); ctx.bezierCurveTo(22, 4, 4, 18, -18, 16); ctx.closePath(); paint(ctx, LEAF, 2.4); ctx.strokeStyle = darken(LEAF, 0.4); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-18, 16); ctx.quadraticCurveTo(0, 0, 16, -14); ctx.stroke(); break;
    case 'stone': blob(ctx, [[-20, 6], [-12, -14], [10, -16], [22, 2], [10, 16], [-10, 16]]); paint(ctx, STONE, 2.4); ctx.fillStyle = lighten(STONE, 0.5); ctx.globalAlpha = 0.5; ell(ctx, -3, -8, 8, 3.5, -0.3); ctx.fill(); ctx.globalAlpha = 1; break;
    case 'stick': limb(ctx, [[-20, 16], [20, -16]], 8, WOOD, 2.2); limb(ctx, [[2, 2], [12, 10]], 4, WOOD, 1.8); break;
    case 'cord': for (let i = 3; i >= 0; i--) { ell(ctx, 0, 0, 8 + i * 4.5, 6 + i * 3.4); paint(ctx, null, 3.4); ctx.strokeStyle = CORD; ctx.lineWidth = 1.8; ctx.stroke(); } ell(ctx, 0, 0, 5, 3.4); paint(ctx, CORD, 1.8); break;
    case 'blade': blob(ctx, [[-20, 6], [-8, -10], [10, -12], [22, -2], [8, 8], [-8, 10]]); paint(ctx, STONE, 2.4); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(8, -11); ctx.lineTo(22, -2); ctx.stroke(); break;
    case 'feather': ctx.beginPath(); ctx.moveTo(-16, 18); ctx.bezierCurveTo(-26, -6, -2, -22, 20, -20); ctx.bezierCurveTo(22, 2, 4, 20, -16, 18); ctx.closePath(); paint(ctx, '#e6f2f2', 2.4); ctx.save(); ctx.clip(); ctx.fillStyle = TEAL; ctx.globalAlpha = 0.45; ctx.fillRect(-10, -30, 40, 20); ctx.restore(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-20, 22); ctx.lineTo(14, -14); ctx.stroke(); break;
    case 'meat': blob(ctx, [[-16, 2], [-6, -14], [12, -12], [20, 2], [10, 14], [-6, 14]]); paint(ctx, '#d9a07a', 2.4); limb(ctx, [[14, 8], [24, 16]], 6, '#efe6cf', 2); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.4; ell(ctx, -4, -6, 5, 3, -0.3); ctx.fill(); ctx.globalAlpha = 1; break;
    case 'herb': ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, -12); ctx.stroke(); [[-9, 4, -0.6], [9, 0, 0.6], [-8, -8, -0.6], [8, -12, 0.6], [0, -20, 0]].forEach(([x, y, r]) => { ell(ctx, x, y, 8, 4.5, r + (x ? 0 : Math.PI / 2)); paint(ctx, LEAF, 2); }); break;
    case 'fiber': for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 7, -18); ctx.quadraticCurveTo(i * 3, 0, i * 6, 18); ctx.strokeStyle = INK; ctx.lineWidth = 5.4; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = i % 2 ? CORD : lighten(CORD, 0.25); ctx.lineWidth = 3; ctx.stroke(); } ctx.fillStyle = TEAL; rr(ctx, -16, -2, 32, 7, 3); paint(ctx, TEAL, 2); break;
    default: ell(ctx, 0, 0, 12, 12); paint(ctx, STONE, 2.4);
  }
}
P.token = (ctx, s) => {
  const held = !!s.held;
  if (held) { shadow(ctx, 4, 40, 34, 7, 0.2); ctx.translate(0, -6); ctx.rotate(-0.05); } else shadow(ctx, 0, 36, 30, 5, 0.1);
  rr(ctx, -34, -34, 68, 68, 16); paint(ctx, '#fffaf0', 2.6);
  ctx.save(); rr(ctx, -34, -34, 68, 68, 16); ctx.clip(); ctx.fillStyle = 'rgba(176,122,69,0.12)'; ctx.fillRect(-34, 14, 68, 24); ctx.restore();
  ctx.save(); ctx.scale(1.05, 1.05); tokenIcon(ctx, s.kind); ctx.restore();
};

P.slot = (ctx, s, t) => {
  const w = num(s.w, 90), h = num(s.h, 90), act = !!s.active, filled = !!s.filled;
  if (act) { ctx.save(); ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 5); ctx.fillStyle = TEAL; rr(ctx, -w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 20); ctx.fill(); ctx.restore(); }
  rr(ctx, -w / 2, -h / 2, w, h, 14);
  if (filled) { ctx.fillStyle = 'rgba(74,154,82,0.14)'; ctx.fill(); ctx.strokeStyle = GREEN; ctx.lineWidth = 2.4; ctx.stroke(); }
  else { ctx.fillStyle = act ? 'rgba(31,127,134,0.1)' : 'rgba(93,88,73,0.05)'; ctx.fill(); ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 14; ctx.strokeStyle = act ? TEAL : INK_SOFT; ctx.lineWidth = act ? 3 : 2.2; ctx.lineCap = 'round'; ctx.stroke(); ctx.setLineDash([]); }
};

P.arm = (ctx, s) => {
  const wraps = clamp(Math.round(num(s.wraps, 0)), 0, 6), tight = clamp(num(s.tight, 0));
  shadow(ctx, 0, 52, 150, 9, 0.12);
  ctx.beginPath(); ctx.moveTo(-170, -46); ctx.lineTo(90, -32); ctx.lineTo(90, 32); ctx.lineTo(-170, 48); ctx.closePath(); paint(ctx, SKIN, 3);
  ctx.fillStyle = lighten(SKIN, 0.5); ctx.globalAlpha = 0.5; rr(ctx, -150, -38, 220, 9, 4); ctx.fill(); ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(124, 0); ctx.rotate(Math.PI / 2); ctx.scale(0.8, 0.8); ctx.translate(0, 20); handBody(ctx, 'open', 'right', false, null); ctx.restore();
  ctx.beginPath(); ctx.moveTo(90, -32); ctx.lineTo(90, 32); ctx.strokeStyle = INK; ctx.lineWidth = 0; ctx.stroke();
  // bandage
  const gap = 11 + (1 - tight) * 3, bump = (1 - tight) * 7;
  for (let i = 0; i < wraps; i++) {
    const cx = -30 + i * gap - (wraps - 1) * gap / 2 + 30, hw = 38 - cx * 0.0 + bump + Math.sin(i * 5.1) * (1 - tight) * 3;
    ctx.beginPath(); ctx.moveTo(cx - 6, -hw + (cx + 150) * 0.018 - 2); ctx.lineTo(cx + 6, hw + (cx + 150) * 0.018); ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = '#efe3c4'; ctx.lineWidth = 8.4; ctx.stroke();
    ctx.strokeStyle = '#b9ad8c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - 5, -hw + 1); ctx.lineTo(cx + 7, hw - 1); ctx.stroke();
  }
  if (wraps > 0 && tight < 0.7) { const lx = -30 + (wraps - 1) * gap / 2 + 30; ctx.beginPath(); ctx.moveTo(lx + 4, 36); ctx.bezierCurveTo(lx + 16, 62, lx - 4, 74, lx + 12, 92); ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.stroke(); ctx.strokeStyle = '#efe3c4'; ctx.lineWidth = 8.4; ctx.stroke(); }
  if (wraps > 0 && tight >= 0.7) { ell(ctx, -30 + (wraps - 1) * gap / 2 + 30 + 4, 8, 7, 5); paint(ctx, '#efe3c4', 2.2); }
};

P.stake = (ctx, s) => {
  const d = clamp(num(s.depth, 0)), gy = 78, top = lerp(-120, -14, d);
  shadow(ctx, 0, gy + 14, 50, 8, 0.12);
  // buried part (faint, below ground) then visible part
  rr(ctx, -15, top, 30, gy - top + 10, 5); paint(ctx, WOOD, 3);
  ctx.save(); rr(ctx, -15, top, 30, gy - top + 10, 5); ctx.clip(); hatch(ctx, -15, top, 15, gy, 7, WOOD_D, 0.4, 1.4, 1.5); ctx.fillStyle = lighten(WOOD, 0.45); ctx.globalAlpha = 0.5; ctx.fillRect(-10, top, 5, gy - top); ctx.restore();
  ell(ctx, 0, top, 15, 6); paint(ctx, lighten(WOOD, 0.5), 2.4);
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-4, top); ctx.lineTo(-1, top + 6); ctx.stroke();
  // ground mound
  ctx.beginPath(); ctx.moveTo(-90, gy + 14); ctx.quadraticCurveTo(-50, gy - 8, -15, gy); ctx.lineTo(15, gy); ctx.quadraticCurveTo(50, gy - 8, 90, gy + 14); ctx.quadraticCurveTo(0, gy + 30, -90, gy + 14); ctx.closePath(); paint(ctx, '#c9b48a', 2.8);
  ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.6; [[-60, 20], [40, 22], [66, 16]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, gy + y - 6); ctx.lineTo(x + 8, gy + y - 6); ctx.stroke(); });
};

P.mallet = (ctx, s) => {
  const r = clamp(num(s.raised, 0));
  shadow(ctx, 0, 56, 100 - r * 30, 8, 0.12 - r * 0.05);
  ctx.save(); ctx.translate(-92, 0); ctx.rotate(-r * 0.6); ctx.translate(92, 0);
  limb(ctx, [[-100, 2], [62, 2]], 15, WOOD, 2.8);
  ell(ctx, -100, 2, 5, 9); paint(ctx, lighten(WOOD, 0.5), 2);
  rr(ctx, 40, -36, 74, 76, 14); paint(ctx, WOOD_D, 3);
  ctx.save(); rr(ctx, 40, -36, 74, 76, 14); ctx.clip(); hatch(ctx, 40, -36, 114, 40, 8, INK, 0.22, 1.5, 0.05); ctx.fillStyle = lighten(WOOD_D, 0.4); ctx.globalAlpha = 0.4; ctx.fillRect(46, -32, 7, 70); ctx.restore();
  ctx.strokeStyle = CORD; ctx.lineWidth = 5; [50, 104].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, -35); ctx.lineTo(x, 39); ctx.stroke(); });
  ctx.restore();
};

P.ring = (ctx, s, t) => {
  const r = Math.max(2, num(s.r, 60)), r0 = Math.max(2, num(s.r0, 30)), good = !!s.good;
  ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = -t * 8; ell(ctx, 0, 0, r0, r0); ctx.strokeStyle = good ? GREEN : INK_SOFT; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
  ell(ctx, 0, 0, r0, r0); ctx.fillStyle = good ? 'rgba(74,154,82,0.18)' : 'rgba(242,184,75,0.12)'; ctx.fill();
  ctx.strokeStyle = good ? GREEN : INK_SOFT; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
  if (good) { ell(ctx, 0, 0, r0 + 8, r0 + 8); ctx.strokeStyle = GREEN; ctx.globalAlpha = 0.35; ctx.lineWidth = 8; ctx.stroke(); ctx.globalAlpha = 1; }
  ell(ctx, 0, 0, r, r); ctx.strokeStyle = TEAL; ctx.lineWidth = 5; ctx.stroke();
  ell(ctx, 0, 0, r + 4, r + 4); ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
};

// ---------- absolute-coordinate props ----------
function drawPath(ctx, s, t) {
  const pts = Array.isArray(s.pts) ? s.pts.filter((p) => Array.isArray(p) && p.length >= 2) : [];
  if (pts.length < 2) return;
  const w = num(s.width, 5), done = clamp(num(s.done, 0));
  const segs = [], total = pts.reduce((a, p, i) => { if (!i) return 0; const l = Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); segs.push(l); return a + l; }, 0);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const trace = (lim) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); let acc = 0; for (let i = 1; i < pts.length; i++) { const l = segs[i - 1]; if (acc + l <= lim) { ctx.lineTo(pts[i][0], pts[i][1]); acc += l; } else { const k = (lim - acc) / l; ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)); return; } } };
  ctx.setLineDash([1, w * 2.4]); ctx.strokeStyle = INK_SOFT; ctx.lineWidth = w * 0.75; trace(total); ctx.stroke(); ctx.setLineDash([]);
  if (done > 0.003) { trace(total * done); ctx.strokeStyle = '#fff'; ctx.lineWidth = w + 5; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1; ctx.strokeStyle = TEAL; ctx.lineWidth = w; ctx.stroke(); }
  ell(ctx, pts[0][0], pts[0][1], 7, 7); paint(ctx, SUN, 2.2);
  const e = pts[pts.length - 1]; ell(ctx, e[0], e[1], 6, 6); paint(ctx, done >= 0.995 ? GREEN : PAPER, 2.2);
  ctx.restore();
}
function drawArrow(ctx, s, t) {
  const f = s.from, to = s.to; if (!Array.isArray(f) || !Array.isArray(to)) return;
  const dx = to[0] - f[0], dy = to[1] - f[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, bow = Math.min(18, L * 0.08);
  const mx = (f[0] + to[0]) / 2 + nx * bow, my = (f[1] + to[1]) / 2 + ny * bow;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const body = () => { ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.quadraticCurveTo(mx, my, to[0] - ux * 12, to[1] - uy * 12); };
  body(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
  body(); ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 30; ctx.strokeStyle = ORANGE; ctx.lineWidth = 5; ctx.stroke(); ctx.setLineDash([]);
  const hx = to[0], hy = to[1];
  poly(ctx, [[hx, hy], [hx - ux * 22 + nx * 12, hy - uy * 22 + ny * 12], [hx - ux * 22 - nx * 12, hy - uy * 22 - ny * 12]]); paint(ctx, ORANGE, 2.6);
  ell(ctx, f[0], f[1], 5, 5); paint(ctx, PAPER, 2.4);
  ctx.restore();
}

// ---------- hands ----------
function handBody(ctx, pose, side, cuff, holdFn) {
  ctx.save(); if (side === 'left') ctx.scale(-1, 1);
  const knuck = (x, y, r) => { ell(ctx, x, y, r, r); paint(ctx, SKIN, 2.5); };
  if (cuff) { rr(ctx, -38, 34, 76, 74, 14); paint(ctx, TEAL, 3); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-32, 40, 7, 62); rr(ctx, -40, 34, 80, 16, 8); paint(ctx, '#2d98a0', 2.8); }
  const palm = (y0 = -16, h = 66) => { rr(ctx, -34, y0, 68, h, 24); paint(ctx, SKIN, 3); };
  if (pose === 'open') {
    [[-17, -12, -22, -66], [-3, -14, -4, -76], [12, -12, 13, -70], [26, -8, 31, -56]].forEach(([x, y, x2, y2]) => limb(ctx, [[x, y], [x2, y2]], 15, SKIN, 2.5));
    limb(ctx, [[-30, 22], [-56, -6]], 16, SKIN, 2.5); palm();
    ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, 24); ctx.quadraticCurveTo(4, 16, 20, 26); ctx.stroke();
  } else if (pose === 'point') {
    limb(ctx, [[-17, -8], [-17, -74]], 15, SKIN, 2.5); limb(ctx, [[-30, 22], [-46, -4]], 16, SKIN, 2.5); palm(-18, 68);
    [-1, 13, 27].forEach((x, i) => knuck(x, -14 - (i === 1 ? 1 : 0), 10));
    limb(ctx, [[-38, 18], [-18, 8]], 13, SKIN, 2.5);
  } else if (pose === 'pinch') {
    limb(ctx, [[-17, -8], [-22, -34], [-36, -50]], 14, SKIN, 2.5);
    knuck(-1, -12, 10); knuck(13, -10, 10); knuck(27, -6, 9);
    limb(ctx, [[-32, 26], [-52, 0], [-44, -42]], 15, SKIN, 2.5); palm(-14, 64);
    ell(ctx, -40, -50, 4, 4); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill();
    if (holdFn) holdFn(-40, -50);
    limb(ctx, [[-17, -8], [-22, -34], [-36, -50]], 14, SKIN, 2.5); // re-draw index over the held thing
    limb(ctx, [[-32, 26], [-52, 0], [-44, -42]], 15, SKIN, 2.5);
  } else { // grip / fist
    palm(-22, 74);
    if (holdFn) holdFn(0, 4);
    if (pose === 'grip') {
      [-26, -10, 6, 22].forEach((y, i) => limb(ctx, [[-28, y], [24 - (i === 3 ? 4 : 0), y]], 14, SKIN, 2.5));
      limb(ctx, [[-36, 26], [-6, -26]], 14, SKIN, 2.5);
    } else {
      rr(ctx, -34, -26, 68, 70, 24); paint(ctx, SKIN, 3); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); [-14, 2, 18].forEach((x) => { ctx.moveTo(x, -26); ctx.lineTo(x, -8); }); ctx.stroke();
      limb(ctx, [[-30, 24], [10, 4]], 15, SKIN, 2.5);
    }
  }
  ctx.restore();
}
const HOLD_SCALE = { hammerstone: 0.75, blade: 0.5, stick: 0.5, mallet: 0.5, token: 0.55 };
export function drawHand(ctx, o = {}) {
  const pose = ['open', 'grip', 'pinch', 'point', 'fist'].includes(o.pose) ? o.pose : 'open', side = o.side === 'left' ? 'left' : 'right';
  const hold = o.holding && HOLD_SCALE[o.holding] ? o.holding : null;
  withT(ctx, o.x, o.y, o.scale, o.rot, () => {
    const holdFn = hold ? (px, py) => {
      ctx.save(); if (side === 'left') ctx.scale(-1, 1);
      ctx.translate(px, hold === 'hammerstone' && pose !== 'pinch' ? py - 34 : py); const hs = HOLD_SCALE[hold] * (pose === 'pinch' ? 0.7 : 1);
      if (hold !== 'hammerstone' && hold !== 'token') ctx.rotate(pose === 'pinch' ? -Math.PI / 2 + 0.5 : -Math.PI / 2);
      ctx.scale(hs, hs);
      const st = Object.assign({}, o.holdState); if (hold === 'blade' && !st.kind) st.kind = 'knife';
      if (hold === 'token' && !st.kind) st.kind = 'stone';
      ctx.translate(hold === 'stick' ? 0 : hold === 'mallet' ? -20 : hold === 'blade' ? -30 : 0, 0);
      P[hold](ctx, st, 0); ctx.restore();
    } : null;
    handBody(ctx, pose, side, true, holdFn);
  });
}

// ---------- sparks / particles ----------
function drawStar(ctx, x, y, r, fill, stroke) {
  ctx.save(); ctx.translate(x, y); ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rad = i % 2 ? r * 0.3 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); } ctx.restore();
}
export function drawSpark(ctx, x, y, size = 8, kind = 'dust') {
  const r = Math.max(1, num(size, 8)); ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (kind) {
    case 'chip': poly(ctx, [[-r, 0.2 * r], [-0.3 * r, -r * 0.8], [r, -0.2 * r], [0.5 * r, r * 0.7]]); paint(ctx, '#b9a688', Math.max(1.4, r * 0.18)); break;
    case 'spark': drawStar(ctx, 0, 0, r * 1.3, SUN, ORANGE); ell(ctx, 0, 0, r * 0.25, r * 0.25); ctx.fillStyle = '#fff'; ctx.fill(); break;
    case 'shaving': ctx.beginPath(); ctx.arc(0, 0, r, 0.3, 4.9); ctx.arc(1, 1, r * 0.55, 4.6, 0.4, true); ctx.strokeStyle = INK; ctx.lineWidth = r * 0.5 + 2; ctx.stroke(); ctx.strokeStyle = lighten(WOOD, 0.55); ctx.lineWidth = r * 0.5; ctx.stroke(); break;
    case 'water': ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.9, r * 0.9, 0, r * 0.9); ctx.bezierCurveTo(-r * 0.9, r * 0.9, -r * 0.9, -r * 0.2, 0, -r * 1.3); paint(ctx, '#9bdbe2', 1.8, TEAL); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8; ell(ctx, -r * 0.3, r * 0.1, r * 0.15, r * 0.3); ctx.fill(); break;
    case 'steam': ctx.globalAlpha = 0.45; ell(ctx, 0, 0, r * 1.3, r); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.2; ctx.stroke(); break;
    case 'bubble': ell(ctx, 0, 0, r, r); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.6; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 3.6, 4.6); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke(); break;
    case 'ember': ctx.globalAlpha = 0.35; ell(ctx, 0, 0, r * 1.6, r * 1.6); ctx.fillStyle = SUN; ctx.fill(); ctx.globalAlpha = 1; ell(ctx, 0, 0, r * 0.7, r * 0.7); ctx.fillStyle = ORANGE; ctx.fill(); ell(ctx, 0, 0, r * 0.35, r * 0.35); ctx.fillStyle = '#fff4c4'; ctx.fill(); break;
    case 'leaf': ctx.rotate(0.5); ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, -r * 0.9, r, 0); ctx.quadraticCurveTo(0, r * 0.9, -r, 0); paint(ctx, LEAF, 1.8); ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r * 0.7, 0); ctx.strokeStyle = darken(LEAF, 0.4); ctx.lineWidth = 1.2; ctx.stroke(); break;
    default: ctx.globalAlpha = 0.5; ell(ctx, 0, 0, r, r * 0.85); ctx.fillStyle = '#c9b48a'; ctx.fill(); ctx.globalAlpha = 0.7; ell(ctx, r * 0.3, -r * 0.2, r * 0.45, r * 0.4); ctx.fillStyle = '#e4d6b4'; ctx.fill();
  }
  ctx.restore();
}

// ---------- public ----------
const BOUNDS = {
  lap: [380, 130], core: [160, 150], hammerstone: [100, 100], flake: [160, 70], whetstone: [300, 90], blade: [300, 120], stick: [300, 40],
  cord: [340, 70], lashing: [260, 220], weave: [310, 250], bowl: [210, 170], clay: [180, 170], fire: [220, 200], skewer: [290, 150], pot: [250, 200],
  filter: [150, 310], token: [72, 72], slot: [90, 90], arm: [340, 100], stake: [180, 220], mallet: [230, 100], ring: [240, 240], path: [0, 0], arrow: [0, 0],
};
export function propBounds(id, scale = 1) {
  const b = BOUNDS[id] || [100, 100], s = num(scale, 1);
  return { w: b[0] * s, h: b[1] * s };
}
export const PROP_IDS = Object.keys(BOUNDS);

export function drawProp(ctx, id, o = {}) {
  const s = o || {}, t = num(s.t, 0);
  if (id === 'path') { drawPath(ctx, s, t); return; }
  if (id === 'arrow') { drawArrow(ctx, s, t); return; }
  const fn = P[id]; if (!fn) return;
  withT(ctx, s.x, s.y, s.scale, s.rot, () => fn(ctx, s, t));
}
// internal hook so hands can draw held props through the same table
void PAPER; void GREEN;
