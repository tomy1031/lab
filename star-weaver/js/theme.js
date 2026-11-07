// theme.js — the visual language shared by every VR panel: fonts, colours, glass surfaces and
// a small set of stroke icons drawn with canvas paths (no image assets to load).

export const FONT = '"Outfit", "Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", system-ui, sans-serif';
export const font = (px, weight = 700, italic = false) => `${italic ? 'italic ' : ''}${weight} ${px}px ${FONT}`;

export const C = {
  ink: '#f6f4ff', muted: '#a9a6d6', dim: '#6f6ca0', line: 'rgba(170, 180, 255, 0.22)',
  L: '#4cc9ff', R: '#ff5fb7', A: '#ffd166', G: '#7affc8', V: '#8f6bff', O: '#ff8a5c',
  glass: 'rgba(255, 255, 255, 0.055)', glassHi: 'rgba(255, 255, 255, 0.11)', glassLine: 'rgba(255, 255, 255, 0.14)',
};

export function spaced(ctx, px) { try { ctx.letterSpacing = `${px}px`; } catch { /* older canvas */ } }

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

// dark glass card with a lit top edge and an optional coloured glow
export function glass(ctx, x, y, w, h, r = 28, { glow = null, strong = false, tint = null } = {}) {
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 36; }
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = linear(ctx, 0, y, 0, y + h, strong
    ? [[0, 'rgba(30, 27, 74, 0.96)'], [1, 'rgba(11, 10, 32, 0.96)']]
    : [[0, 'rgba(24, 22, 62, 0.86)'], [1, 'rgba(9, 8, 28, 0.86)']]);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (tint) { ctx.fillStyle = tint; ctx.fill(); }
  ctx.lineWidth = 2;
  ctx.strokeStyle = linear(ctx, 0, y, 0, y + h, [[0, 'rgba(200, 205, 255, 0.42)'], [0.35, 'rgba(160, 170, 255, 0.16)'], [1, 'rgba(160, 170, 255, 0.1)']]);
  ctx.stroke();
  ctx.restore();
}

// small uppercase section label: "MODE", "SETTINGS"
export function label(ctx, text, x, y, color = C.muted, px = 20, align = 'left') {
  ctx.save();
  ctx.font = font(px, 600);
  spaced(ctx, px * 0.22);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// fit text into maxW by shrinking the font
export function fitText(ctx, text, x, y, maxW, px, weight = 700, align = 'center', italic = false) {
  let size = px;
  ctx.font = font(size, weight, italic);
  while (size > 10 && ctx.measureText(text).width > maxW) { size -= 2; ctx.font = font(size, weight, italic); }
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  return size;
}

// gradient text used for titles and big numbers
export function gradText(ctx, text, x, y, px, weight = 800, stops = [[0, '#ffffff'], [1, '#b9c4ff']], align = 'center', maxW = 0, spacing = 0) {
  ctx.save();
  ctx.font = font(px, weight);
  spaced(ctx, spacing);
  let size = px;
  while (maxW && size > 12 && ctx.measureText(text).width > maxW) { size -= 2; ctx.font = font(size, weight); }
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = linear(ctx, 0, y - size * 0.8, 0, y + size * 0.1, stops);
  ctx.fillText(text, x, y);
  ctx.restore();
  return size;
}

// ---------------- icons ----------------
// each icon is drawn centred on (0,0) inside a 24×24 box; icon() scales it
const I = {
  play(c) { c.beginPath(); c.moveTo(-6, -9); c.lineTo(10, 0); c.lineTo(-6, 9); c.closePath(); c.fill(); },
  pause(c) { c.fillRect(-8, -9, 5, 18); c.fillRect(3, -9, 5, 18); },
  route(c) { c.beginPath(); c.arc(-7, 7, 3, 0, 7); c.stroke(); c.beginPath(); c.arc(7, -7, 3, 0, 7); c.stroke(); c.beginPath(); c.moveTo(-4, 7); c.bezierCurveTo(8, 7, -8, -7, 4, -7); c.stroke(); },
  bolt(c) { c.beginPath(); c.moveTo(2, -11); c.lineTo(-7, 2); c.lineTo(0, 2); c.lineTo(-2, 11); c.lineTo(7, -2); c.lineTo(0, -2); c.closePath(); c.fill(); },
  infinity(c) { c.beginPath(); for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2; const x = 10 * Math.sin(t), y = 5 * Math.sin(2 * t); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); },
  stand(c) { c.beginPath(); c.arc(0, -8, 3, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 4); c.moveTo(-6, -1); c.lineTo(6, -1); c.moveTo(0, 4); c.lineTo(-4, 11); c.moveTo(0, 4); c.lineTo(4, 11); c.stroke(); },
  sit(c) { c.beginPath(); c.arc(-1, -9, 3, 0, 7); c.stroke(); c.beginPath(); c.moveTo(-1, -5); c.lineTo(-2, 3); c.lineTo(6, 3); c.lineTo(6, 10); c.moveTo(-1, -2); c.lineTo(5, -2); c.moveTo(-8, -1); c.lineTo(-8, 11); c.moveTo(-8, 5); c.lineTo(4, 5); c.stroke(); },
  steps(c) { c.beginPath(); c.moveTo(-11, 0); c.lineTo(11, 0); c.moveTo(-7, -4); c.lineTo(-11, 0); c.lineTo(-7, 4); c.moveTo(7, -4); c.lineTo(11, 0); c.lineTo(7, 4); c.stroke(); c.fillRect(-3, 5, 2, 5); c.fillRect(1, 5, 2, 5); },
  squat(c) { c.beginPath(); c.arc(0, -8, 3, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -4); c.lineTo(-1, 2); c.lineTo(5, 5); c.lineTo(1, 11); c.moveTo(-1, 2); c.lineTo(-6, 6); c.lineTo(-3, 11); c.moveTo(-6, -2); c.lineTo(6, -2); c.stroke(); c.beginPath(); c.moveTo(-11, -12); c.lineTo(11, -12); c.stroke(); },
  shield(c) { c.beginPath(); c.moveTo(0, -11); c.lineTo(9, -7); c.lineTo(8, 3); c.quadraticCurveTo(5, 9, 0, 11); c.quadraticCurveTo(-5, 9, -8, 3); c.lineTo(-9, -7); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(-4, 0); c.lineTo(-1, 3); c.lineTo(5, -4); c.stroke(); },
  coach(c) { c.beginPath(); c.arc(0, -8, 3.2, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 5); c.moveTo(0, -2); c.lineTo(-8, -8); c.moveTo(0, -2); c.lineTo(8, -8); c.moveTo(0, 5); c.lineTo(-4, 11); c.moveTo(0, 5); c.lineTo(4, 11); c.stroke(); c.globalAlpha *= 0.5; c.beginPath(); c.arc(0, 0, 11.5, 0, 7); c.stroke(); },
  volume(c) { c.beginPath(); c.moveTo(-10, -4); c.lineTo(-5, -4); c.lineTo(1, -9); c.lineTo(1, 9); c.lineTo(-5, 4); c.lineTo(-10, 4); c.closePath(); c.fill(); c.beginPath(); c.arc(2, 0, 6, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(2, 0, 10, -0.9, 0.9); c.stroke(); },
  ruler(c) { c.beginPath(); c.moveTo(-11, 0); c.lineTo(11, 0); c.moveTo(-11, -5); c.lineTo(-11, 5); c.moveTo(11, -5); c.lineTo(11, 5); c.moveTo(-6, -3); c.lineTo(-6, 0); c.moveTo(0, -4); c.lineTo(0, 0); c.moveTo(6, -3); c.lineTo(6, 0); c.stroke(); },
  cap(c) { c.beginPath(); c.moveTo(-12, -2); c.lineTo(0, -8); c.lineTo(12, -2); c.lineTo(0, 4); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(-7, 1); c.lineTo(-7, 7); c.quadraticCurveTo(0, 11, 7, 7); c.lineTo(7, 1); c.stroke(); },
  retry(c) { c.beginPath(); c.arc(0, 0, 9, -2.6, 2.2); c.stroke(); c.beginPath(); c.moveTo(-9, -12); c.lineTo(-9, -5); c.lineTo(-2, -5); c.stroke(); },
  grid(c) { for (const [x, y] of [[-9, -9], [1, -9], [-9, 1], [1, 1]]) { roundRect(c, x, y, 8, 8, 2); c.stroke(); } },
  leaf(c) { c.beginPath(); c.moveTo(-9, 9); c.quadraticCurveTo(-10, -10, 10, -10); c.quadraticCurveTo(10, 10, -9, 9); c.stroke(); c.beginPath(); c.moveTo(-9, 9); c.lineTo(4, -4); c.stroke(); },
  exit(c) { c.beginPath(); c.moveTo(2, -10); c.lineTo(-9, -10); c.lineTo(-9, 10); c.lineTo(2, 10); c.stroke(); c.beginPath(); c.moveTo(-2, 0); c.lineTo(11, 0); c.moveTo(6, -5); c.lineTo(11, 0); c.lineTo(6, 5); c.stroke(); },
  target(c) { c.beginPath(); c.arc(0, 0, 9, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, 3, 0, 7); c.fill(); for (const [a, b, x, y] of [[0, -12, 0, -6], [0, 12, 0, 6], [-12, 0, -6, 0], [12, 0, 6, 0]]) { c.beginPath(); c.moveTo(a, b); c.lineTo(x, y); c.stroke(); } },
  star(c) { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 11, a = -Math.PI / 2 + (i * Math.PI) / 5; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); },
  hand(c) { c.beginPath(); c.moveTo(-6, 10); c.lineTo(-7, -1); for (const [x, top] of [[-5, -8], [-1.5, -11], [2, -10], [5.5, -7]]) { c.lineTo(x - 1.5, 0); c.lineTo(x - 1.5, top); c.arc(x, top, 1.5, Math.PI, 0); c.lineTo(x + 1.5, 0); } c.lineTo(8, 2); c.lineTo(10, -2); c.quadraticCurveTo(11, 4, 5, 10); c.closePath(); c.stroke(); },
  orbit(c) { c.beginPath(); c.arc(0, 0, 10, 0.3, Math.PI * 2 - 0.3); c.stroke(); c.beginPath(); c.moveTo(10, -6); c.lineTo(10, 1); c.lineTo(4, -2); c.stroke(); c.beginPath(); c.arc(0, 0, 2.5, 0, 7); c.fill(); },
  wing(c) { c.beginPath(); c.arc(0, -8, 3, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 5); c.moveTo(-12, -2); c.lineTo(12, -2); c.moveTo(0, 5); c.lineTo(-4, 11); c.moveTo(0, 5); c.lineTo(4, 11); c.stroke(); },
  yraise(c) { c.beginPath(); c.arc(0, -4, 3, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 7); c.moveTo(0, 1); c.lineTo(-8, -10); c.moveTo(0, 1); c.lineTo(8, -10); c.moveTo(0, 7); c.lineTo(-4, 12); c.moveTo(0, 7); c.lineTo(4, 12); c.stroke(); },
  up(c) { c.beginPath(); c.moveTo(0, 11); c.lineTo(0, -10); c.moveTo(-7, -3); c.lineTo(0, -10); c.lineTo(7, -3); c.stroke(); },
  spiral(c) { c.beginPath(); for (let i = 0; i <= 60; i++) { const a = i * 0.32, r = 1 + i * 0.17; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(r, 0); } c.stroke(); },
  heart(c) { c.beginPath(); c.moveTo(0, 9); c.bezierCurveTo(-14, 0, -8, -12, 0, -4); c.bezierCurveTo(8, -12, 14, 0, 0, 9); c.closePath(); c.stroke(); },
  both(c) { c.beginPath(); c.arc(-6, 0, 5, 0, 7); c.fill(); c.globalAlpha *= 0.6; c.beginPath(); c.arc(6, 0, 5, 0, 7); c.fill(); },
  check(c) { c.beginPath(); c.moveTo(-9, 1); c.lineTo(-3, 7); c.lineTo(9, -6); c.stroke(); },
  crosshair(c) { c.beginPath(); c.arc(0, 0, 7, 0, 7); c.stroke(); c.beginPath(); c.moveTo(-12, 0); c.lineTo(-4, 0); c.moveTo(12, 0); c.lineTo(4, 0); c.moveTo(0, -12); c.lineTo(0, -4); c.moveTo(0, 12); c.lineTo(0, 4); c.stroke(); },
  flame(c) { c.beginPath(); c.moveTo(0, 11); c.quadraticCurveTo(-9, 9, -8, 1); c.quadraticCurveTo(-7, -5, 0, -11); c.quadraticCurveTo(1, -4, 5, -3); c.quadraticCurveTo(9, 2, 8, 5); c.quadraticCurveTo(6, 11, 0, 11); c.closePath(); c.fill(); },
  clock(c) { c.beginPath(); c.arc(0, 0, 10, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 0); c.lineTo(5, 3); c.stroke(); },
  eye(c) { c.beginPath(); c.moveTo(-11, 0); c.quadraticCurveTo(0, -10, 11, 0); c.quadraticCurveTo(0, 10, -11, 0); c.stroke(); c.beginPath(); c.arc(0, 0, 3.5, 0, 7); c.fill(); },
  stretch(c) { c.beginPath(); c.arc(0, -3, 3, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, 1); c.lineTo(0, 7); c.moveTo(0, 2); c.lineTo(-3, -11); c.moveTo(0, 2); c.lineTo(3, -11); c.moveTo(0, 7); c.lineTo(-4, 12); c.moveTo(0, 7); c.lineTo(4, 12); c.stroke(); },
};

export function icon(ctx, name, x, y, size, color = '#fff', lw = 2.2) {
  const f = I[name];
  if (!f) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  f(ctx);
  ctx.restore();
}
export const ICON_NAMES = Object.keys(I);
