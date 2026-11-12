// js/ui/icons.js — item icons drawn on canvas (defs.icon names = item ids) (OPUS-B)
import { C } from './text.js';

function poly(g, pts, fill, stroke = 'rgba(14,20,48,0.8)', lw = 3) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function circ(g, x, y, r, fill, stroke = 'rgba(14,20,48,0.8)', lw = 3) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}

const DRAW = {
  sword(g) { poly(g, [-6, 34, 6, 34, 4, -40, 0, -50, -4, -40], '#e8eef5'); poly(g, [-20, 30, 20, 30, 20, 36, -20, 36], C.gold); poly(g, [-4, 36, 4, 36, 4, 50, -4, 50], '#8a5a3a'); },
  spear(g) { g.save(); g.rotate(0.6); poly(g, [-3, 50, 3, 50, 3, -30, -3, -30], '#a77b4f'); poly(g, [-9, -28, 9, -28, 0, -54], '#e8eef5'); g.restore(); },
  torch(g) { g.save(); g.rotate(0.35); poly(g, [-5, 48, 5, 48, 7, -12, -7, -12], '#8a5a3a'); circ(g, 0, -24, 14, C.fireA, null); circ(g, 0, -28, 8, '#fff2b0', null); g.restore(); },
  shield(g) { poly(g, [-34, -36, 34, -36, 30, 10, 0, 44, -30, 10], '#6f8f5a'); poly(g, [-20, -24, 20, -24, 18, 6, 0, 28, -18, 6], '#9fc07f', null); circ(g, 0, -4, 7, C.gold); },
  bow(g) { g.beginPath(); g.arc(18, 0, 46, Math.PI * 0.62, Math.PI * 1.38); g.lineWidth = 9; g.strokeStyle = '#a77b4f'; g.stroke(); g.beginPath(); g.moveTo(-17, -40); g.lineTo(-17, 40); g.lineWidth = 2; g.strokeStyle = C.white; g.stroke(); },
  arrow(g) { g.save(); g.rotate(-0.78); poly(g, [-2, 44, 2, 44, 2, -34, -2, -34], '#a77b4f', null); poly(g, [-8, -32, 8, -32, 0, -50], '#e8eef5'); poly(g, [-8, 46, 0, 36, 8, 46, 8, 52, 0, 44, -8, 52], C.cyan, null); g.restore(); },
  bomb(g) {
    circ(g, 0, 10, 30, '#8f3a34');
    for (const [x, y] of [[-12, 4], [8, -2], [12, 20], [-6, 24], [0, 10]]) circ(g, x, y, 4, '#f0b070', null);
    g.beginPath(); g.moveTo(4, -18); g.quadraticCurveTo(14, -34, 26, -36); g.lineWidth = 4; g.strokeStyle = '#6b4a2a'; g.stroke();
    circ(g, 28, -38, 7, '#ffb347', null); circ(g, 28, -38, 3, '#fff2b0', null);
  },
  rock(g) { poly(g, [-30, 20, -24, -10, 0, -24, 26, -14, 32, 14, 10, 28], '#9a9484'); },
  windfan(g) { g.beginPath(); g.moveTo(0, 36); g.arc(0, 36, 64, -Math.PI * 0.82, -Math.PI * 0.18); g.closePath(); g.fillStyle = C.cyan; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(14,20,48,0.8)'; g.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI * 0.82 + i * Math.PI * 0.16; g.beginPath(); g.moveTo(0, 36); g.lineTo(Math.cos(a) * 60, 36 + Math.sin(a) * 60); g.lineWidth = 2; g.stroke(); } },
  flask(g) { poly(g, [-22, -6, 22, -6, 26, 40, -26, 40], '#4fc2c9'); poly(g, [-8, -30, 8, -30, 8, -6, -8, -6], '#8a5a3a'); },
  waybell(g) { g.beginPath(); g.moveTo(-26, 22); g.quadraticCurveTo(-24, -30, 0, -32); g.quadraticCurveTo(24, -30, 26, 22); g.closePath(); g.fillStyle = C.gold; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(14,20,48,0.8)'; g.stroke(); circ(g, 0, 28, 7, '#c9a24a'); },
  apple(g) { circ(g, 0, 8, 30, '#ff7a3d'); circ(g, -10, -2, 8, '#ffd28a', null); poly(g, [-2, -22, 2, -22, 4, -36, -1, -36], '#6b4a2a', null); poly(g, [4, -30, 22, -38, 14, -24], '#7fae5a', null); },
  apple_baked(g) { circ(g, 0, 8, 30, '#c2552a'); circ(g, -8, 0, 7, '#ffb347', null); poly(g, [-2, -22, 2, -22, 4, -36, -1, -36], '#4a321e', null); g.fillStyle = C.fireA; g.fillRect(-18, 34, 36, 4); },
  mushroom(g) { poly(g, [-8, 40, 8, 40, 6, 0, -6, 0], '#f3efe4'); g.beginPath(); g.ellipse(0, 0, 32, 22, 0, Math.PI, 0); g.closePath(); g.fillStyle = '#62e6ff'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(14,20,48,0.8)'; g.stroke(); circ(g, -12, -8, 4, '#fffbe8', null); circ(g, 10, -12, 3, '#fffbe8', null); },
  mushroom_grilled(g) { poly(g, [-8, 40, 8, 40, 6, 0, -6, 0], '#d9b88a'); g.beginPath(); g.ellipse(0, 0, 32, 22, 0, Math.PI, 0); g.closePath(); g.fillStyle = '#c27a3a'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(14,20,48,0.8)'; g.stroke(); },
  frostberry(g) { circ(g, -10, 10, 16, '#c9e8ff'); circ(g, 12, 6, 16, '#9fd0ff'); circ(g, 2, -12, 14, '#e6f6ff'); poly(g, [0, -26, 10, -40, 14, -30], '#5d9a7a', null); },
  honeycomb(g) { for (const [x, y] of [[-16, -10], [16, -10], [0, 18], [-16, 46 - 28], [16, 18]]) { const s = 15; poly(g, [x - s, y, x - s / 2, y - s * 0.87, x + s / 2, y - s * 0.87, x + s, y, x + s / 2, y + s * 0.87, x - s / 2, y + s * 0.87], '#ffc23a'); } },
  shard(g) { poly(g, [0, -40, 18, 0, 0, 40, -18, 0], C.gold); poly(g, [0, -40, 6, 0, 0, 40], '#fff2b0', null); },
  aetherseed(g) { g.beginPath(); g.ellipse(0, 6, 18, 30, 0.3, 0, Math.PI * 2); g.fillStyle = C.cyan; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(14,20,48,0.8)'; g.stroke(); g.beginPath(); g.moveTo(-6, -20); g.quadraticCurveTo(-26, -44, -6, -46); g.lineWidth = 3; g.strokeStyle = '#fffbe8'; g.stroke(); },
  pearl(g) { circ(g, 0, 0, 30, '#f4f0ff'); circ(g, -10, -10, 9, '#ffffff', null); circ(g, 0, 0, 30, null, C.cyan, 3); },
  glide(g) { poly(g, [-50, 0, 0, -18, 50, 0, 30, 6, 0, -4, -30, 6], C.cyan); },
};

/** draw item `id` centered at (cx, cy), fitting `size` px */
export function drawIcon(g, id, cx, cy, size) {
  const f = DRAW[id] || DRAW.shard;
  g.save();
  g.translate(cx, cy);
  const k = size / 110;
  g.scale(k, k);
  g.lineJoin = 'round';
  try { f(g); } catch (e) { /* ignore */ }
  g.restore();
}
export const ICON_IDS = Object.keys(DRAW);
