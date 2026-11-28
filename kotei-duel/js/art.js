// js/art.js — card illustrations drawn in code (no image files, so everything works offline):
// a background (gradient + pattern) and a bold flat icon with a soft glow. art = { icon, bg, pattern, color, icon2 }
// Icons are drawn in a 100×100 box and scaled.

const TAU = Math.PI * 2;

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

// ---- backgrounds ----
const PATTERNS = {
  grid(c, w, h, col) { c.strokeStyle = col; c.lineWidth = 1.5; for (let x = 0; x < w; x += 22) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } },
  circuit(c, w, h, col) {
    c.strokeStyle = col; c.lineWidth = 2.5; c.fillStyle = col;
    for (let i = 0; i < 18; i++) {
      const x = (i * 71) % w, y = (i * 53) % h;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 40, y); c.lineTo(x + 60, y + 20); c.lineTo(x + 60, y + 50); c.stroke();
      c.beginPath(); c.arc(x + 60, y + 54, 4, 0, TAU); c.fill();
    }
  },
  rays(c, w, h, col) { c.fillStyle = col; const cx = w / 2, cy = h / 2; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, w, a, a + TAU / 40); c.closePath(); c.fill(); } },
  dots(c, w, h, col) { c.fillStyle = col; for (let y = 8; y < h; y += 18) for (let x = (y / 18) % 2 ? 8 : 17; x < w; x += 18) { c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill(); } },
  waves(c, w, h, col) { c.strokeStyle = col; c.lineWidth = 3; for (let y = 10; y < h; y += 24) { c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, y + Math.sin(x / 18 + y) * 6); c.stroke(); } },
  hex(c, w, h, col) { c.strokeStyle = col; c.lineWidth = 2; const s = 16; for (let y = 0; y < h + s; y += s * 1.5) for (let x = 0; x < w + s; x += s * 1.732) { const ox = ((y / (s * 1.5)) % 2) * s * 0.866; c.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; c.lineTo(x + ox + Math.cos(a) * s, y + Math.sin(a) * s); } c.closePath(); c.stroke(); } },
  fire(c, w, h, col) { c.fillStyle = col; for (let i = 0; i < 14; i++) { const x = (i * 47) % w, b = h; c.beginPath(); c.moveTo(x - 18, b); c.quadraticCurveTo(x - 10, b - 60 - (i % 3) * 30, x, b - 90 - (i % 4) * 25); c.quadraticCurveTo(x + 10, b - 50, x + 18, b); c.fill(); } },
  binary(c, w, h, col) { c.fillStyle = col; c.font = '700 16px monospace'; for (let y = 16; y < h; y += 20) { let s = ''; for (let k = 0; k < 40; k++) s += ((k * 7 + y * 3) % 5) > 2 ? '1' : '0'; c.fillText(s, 0, y); } },
};

const PALETTE = {
  blue: ['#3d7bff', '#0d2a6e'], green: ['#2fd08f', '#0b4f3a'], pink: ['#ff6fa8', '#6d1240'], gold: ['#ffcf3f', '#7a4b00'],
  purple: ['#a86bff', '#2e1066'], red: ['#ff5a4f', '#5c0a0a'], orange: ['#ff9a3d', '#6b2a00'], teal: ['#3fd6e8', '#0b4250'],
  gray: ['#9aa7c2', '#2a3248'], night: ['#3b4cff', '#060a22'],
};

export function drawArt(c, art, x, y, w, h, style) {
  const [a, b] = PALETTE[art.bg] || [style?.frame || '#3d7bff', style?.frame2 || '#0d2a6e'];
  const g = c.createRadialGradient(x + w / 2, y + h * 0.45, 10, x + w / 2, y + h / 2, w * 0.75);
  g.addColorStop(0, a); g.addColorStop(1, b);
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.save(); c.translate(x, y);
  (PATTERNS[art.pattern] || PATTERNS.circuit)(c, w, h, 'rgba(255,255,255,0.13)');
  c.restore();
  // glow disk
  const s = Math.min(w, h) * 0.86;
  const cx = x + w / 2, cy = y + h / 2;
  const gl = c.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 0.62);
  gl.addColorStop(0, 'rgba(255,255,255,0.45)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.fillRect(x, y, w, h);
  // icon(s)
  const drawIcon = (name, ix, iy, size, col) => {
    const f = ICONS[name] || ICONS.star;
    c.save();
    c.translate(ix - size / 2, iy - size / 2);
    c.scale(size / 100, size / 100);
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
    c.lineJoin = 'round'; c.lineCap = 'round';
    f(c, col || art.color || '#ffffff', art);
    c.restore();
  };
  if (art.icon2) {
    drawIcon(art.icon, cx - s * 0.2, cy, s * 0.62);
    drawIcon(art.icon2, cx + s * 0.27, cy + s * 0.12, s * 0.42, art.color2);
  } else drawIcon(art.icon, cx, cy, s * 0.78);
}

// ---- icons (100×100) ----
const W = '#ffffff', INK = '#18203a';
function stroke(c, col, w) { c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
function fill(c, col) { c.fillStyle = col; c.fill(); }
function person(c, x, y, s, col) { c.beginPath(); c.arc(x, y - s * 0.55, s * 0.32, 0, TAU); fill(c, col); c.beginPath(); c.moveTo(x - s * 0.6, y + s * 0.6); c.quadraticCurveTo(x - s * 0.6, y - s * 0.12, x, y - s * 0.12); c.quadraticCurveTo(x + s * 0.6, y - s * 0.12, x + s * 0.6, y + s * 0.6); c.closePath(); fill(c, col); }
function docShape(c, x, y, w, h, col) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w - 14, y); c.lineTo(x + w, y + 14); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); fill(c, col); }
function lines(c, x, y, w, n, gap, col, lw = 4) { c.strokeStyle = col; c.lineWidth = lw; for (let i = 0; i < n; i++) { c.beginPath(); c.moveTo(x, y + i * gap); c.lineTo(x + w * (i === n - 1 ? 0.6 : 1), y + i * gap); c.stroke(); } }

export const ICONS = {
  star(c, col) { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 20 : 44, a = (i / 10) * TAU - Math.PI / 2; c.lineTo(50 + Math.cos(a) * r, 52 + Math.sin(a) * r); } c.closePath(); fill(c, col); },
  doc(c, col) { docShape(c, 22, 10, 56, 80, col); lines(c, 32, 34, 36, 5, 11, INK); },
  clipboard(c, col) { rr(c, 20, 14, 60, 78, 8); fill(c, col); rr(c, 36, 6, 28, 16, 5); fill(c, INK); lines(c, 32, 40, 36, 4, 12, INK); c.beginPath(); c.moveTo(30, 40); c.stroke(); },
  checklist(c, col) { rr(c, 18, 10, 64, 80, 8); fill(c, col); for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(28, 28 + i * 17); c.lineTo(32, 33 + i * 17); c.lineTo(40, 23 + i * 17); stroke(c, '#18a77a', 4); c.beginPath(); c.moveTo(46, 28 + i * 17); c.lineTo(72, 28 + i * 17); stroke(c, INK, 4); } },
  magnifier(c, col) { c.beginPath(); c.arc(42, 42, 26, 0, TAU); stroke(c, col, 10); c.beginPath(); c.arc(42, 42, 20, 0, TAU); fill(c, 'rgba(180,230,255,0.35)'); c.beginPath(); c.moveTo(61, 61); c.lineTo(86, 86); stroke(c, col, 14); },
  people(c, col) { person(c, 32, 56, 26, col); person(c, 68, 56, 26, col); person(c, 50, 48, 30, col); },
  person(c, col) { person(c, 50, 54, 40, col); },
  boss(c, col) { person(c, 50, 58, 38, col); c.beginPath(); c.moveTo(30, 18); c.lineTo(36, 4); c.lineTo(44, 14); c.lineTo(50, 2); c.lineTo(56, 14); c.lineTo(64, 4); c.lineTo(70, 18); c.closePath(); fill(c, '#ffcf3f'); },
  handshake(c, col) { c.beginPath(); c.moveTo(6, 44); c.lineTo(30, 34); c.lineTo(50, 44); c.lineTo(70, 34); c.lineTo(94, 44); c.lineTo(94, 64); c.lineTo(72, 72); c.lineTo(50, 82); c.lineTo(28, 72); c.lineTo(6, 64); c.closePath(); fill(c, col); c.beginPath(); c.moveTo(38, 54); c.lineTo(62, 70); c.moveTo(46, 50); c.lineTo(68, 64); stroke(c, INK, 4); },
  ear(c, col) { c.beginPath(); c.moveTo(36, 84); c.quadraticCurveTo(24, 70, 30, 56); c.bezierCurveTo(12, 30, 32, 8, 54, 10); c.bezierCurveTo(80, 12, 84, 40, 70, 56); c.quadraticCurveTo(60, 66, 62, 78); c.quadraticCurveTo(60, 94, 44, 90); c.closePath(); fill(c, col); c.beginPath(); c.arc(54, 36, 12, Math.PI, TAU * 0.95); stroke(c, INK, 5); },
  speech(c, col) { rr(c, 8, 12, 70, 50, 14); fill(c, col); c.beginPath(); c.moveTo(24, 60); c.lineTo(18, 80); c.lineTo(40, 60); fill(c, col); rr(c, 42, 44, 50, 40, 12); fill(c, '#ffcf3f'); lines(c, 18, 30, 48, 2, 14, INK); },
  question(c, col) { c.beginPath(); c.arc(50, 50, 42, 0, TAU); fill(c, col); c.fillStyle = INK; c.font = '900 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 50, 54); },
  exclaim(c, col) { c.beginPath(); c.moveTo(50, 6); c.lineTo(94, 88); c.lineTo(6, 88); c.closePath(); fill(c, col); c.fillStyle = INK; c.font = '900 56px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 50, 62); },
  gear(c, col) { c.beginPath(); for (let i = 0; i < 16; i++) { const r = i % 2 ? 34 : 44, a = (i / 16) * TAU; c.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r); } c.closePath(); fill(c, col); c.beginPath(); c.arc(50, 50, 14, 0, TAU); fill(c, INK); },
  code(c, col) { c.beginPath(); c.moveTo(34, 24); c.lineTo(10, 50); c.lineTo(34, 76); stroke(c, col, 12); c.beginPath(); c.moveTo(66, 24); c.lineTo(90, 50); c.lineTo(66, 76); stroke(c, col, 12); c.beginPath(); c.moveTo(58, 16); c.lineTo(42, 84); stroke(c, '#ffcf3f', 10); },
  laptop(c, col) { rr(c, 18, 18, 64, 44, 6); fill(c, col); rr(c, 24, 24, 52, 32, 3); fill(c, '#1b2b55'); c.beginPath(); c.moveTo(6, 70); c.lineTo(94, 70); c.lineTo(86, 80); c.lineTo(14, 80); c.closePath(); fill(c, col); lines(c, 30, 34, 26, 3, 8, '#7fe3ff', 3); },
  bug(c, col) { c.beginPath(); c.ellipse(50, 56, 22, 30, 0, 0, TAU); fill(c, col); c.beginPath(); c.arc(50, 26, 13, 0, TAU); fill(c, col); c.beginPath(); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { c.moveTo(50 + s * 20, 44 + i * 14); c.lineTo(50 + s * 40, 36 + i * 18); } c.moveTo(44, 16); c.lineTo(36, 4); c.moveTo(56, 16); c.lineTo(64, 4); stroke(c, col, 5); c.beginPath(); c.moveTo(50, 30); c.lineTo(50, 84); stroke(c, INK, 3); c.beginPath(); c.arc(45, 24, 3, 0, TAU); c.arc(55, 24, 3, 0, TAU); fill(c, '#fff'); },
  net(c, col) { c.beginPath(); c.arc(50, 34, 28, 0, TAU); stroke(c, col, 7); for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(50 + i * 10, 8); c.lineTo(50 + i * 10, 60); stroke(c, col, 2); c.beginPath(); c.moveTo(22, 34 + i * 10); c.lineTo(78, 34 + i * 10); stroke(c, col, 2); } c.beginPath(); c.moveTo(70, 54); c.lineTo(92, 92); stroke(c, '#c98a1b', 9); },
  shield(c, col) { c.beginPath(); c.moveTo(50, 6); c.lineTo(86, 18); c.quadraticCurveTo(86, 70, 50, 94); c.quadraticCurveTo(14, 70, 14, 18); c.closePath(); fill(c, col); c.beginPath(); c.moveTo(34, 50); c.lineTo(46, 62); c.lineTo(68, 38); stroke(c, '#18a77a', 9); },
  flask(c, col) { c.beginPath(); c.moveTo(38, 8); c.lineTo(62, 8); c.moveTo(42, 8); c.lineTo(42, 38); c.lineTo(16, 86); c.lineTo(84, 86); c.lineTo(58, 38); c.lineTo(58, 8); stroke(c, col, 7); c.beginPath(); c.moveTo(30, 62); c.lineTo(70, 62); c.lineTo(80, 82); c.lineTo(20, 82); c.closePath(); fill(c, '#2fd08f'); c.beginPath(); c.arc(44, 72, 4, 0, TAU); c.arc(56, 68, 3, 0, TAU); fill(c, '#fff'); },
  link(c, col) { c.save(); c.translate(50, 50); c.rotate(-Math.PI / 4); rr(c, -42, -14, 46, 28, 14); stroke(c, col, 9); rr(c, -4, -14, 46, 28, 14); stroke(c, '#ffcf3f', 9); c.restore(); },
  puzzle(c, col) { c.beginPath(); c.moveTo(14, 30); c.lineTo(40, 30); c.arc(50, 26, 10, Math.PI, 0); c.lineTo(84, 30); c.lineTo(84, 50); c.arc(88, 60, 10, -Math.PI / 2, Math.PI / 2); c.lineTo(84, 88); c.lineTo(14, 88); c.closePath(); fill(c, col); },
  server(c, col) { for (let i = 0; i < 3; i++) { rr(c, 20, 10 + i * 28, 60, 24, 5); fill(c, col); c.beginPath(); c.arc(32, 22 + i * 28, 4, 0, TAU); fill(c, '#2fd08f'); lines(c, 44, 22 + i * 28, 28, 1, 0, INK, 4); } },
  database(c, col) { for (let i = 2; i >= 0; i--) { c.beginPath(); c.ellipse(50, 26 + i * 22, 32, 10, 0, 0, TAU); c.rect(18, 26 + i * 22, 64, 22); fill(c, i % 2 ? '#cfe0ff' : col); } c.beginPath(); c.ellipse(50, 26, 32, 10, 0, 0, TAU); fill(c, '#ffffff'); },
  rocket(c, col) { c.beginPath(); c.moveTo(50, 4); c.quadraticCurveTo(72, 24, 66, 64); c.lineTo(34, 64); c.quadraticCurveTo(28, 24, 50, 4); fill(c, col); c.beginPath(); c.arc(50, 34, 8, 0, TAU); fill(c, '#3d7bff'); c.beginPath(); c.moveTo(34, 50); c.lineTo(20, 72); c.lineTo(36, 64); c.moveTo(66, 50); c.lineTo(80, 72); c.lineTo(64, 64); fill(c, '#ff5a4f'); c.beginPath(); c.moveTo(40, 66); c.quadraticCurveTo(50, 100, 60, 66); fill(c, '#ffcf3f'); },
  cloud(c, col) { c.beginPath(); c.arc(34, 56, 18, 0, TAU); c.arc(52, 44, 24, 0, TAU); c.arc(72, 58, 16, 0, TAU); c.rect(34, 56, 40, 18); fill(c, col); },
  fog(c, col) { ICONS.cloud(c, col); c.globalAlpha = 0.6; lines(c, 16, 82, 68, 2, 9, col, 5); c.globalAlpha = 1; c.fillStyle = INK; c.font = '900 30px sans-serif'; c.textAlign = 'center'; c.fillText('??', 52, 62); },
  hourglass(c, col) { c.beginPath(); c.moveTo(24, 8); c.lineTo(76, 8); c.lineTo(52, 50); c.lineTo(76, 92); c.lineTo(24, 92); c.lineTo(48, 50); c.closePath(); stroke(c, col, 7); c.beginPath(); c.moveTo(34, 18); c.lineTo(66, 18); c.lineTo(50, 44); c.closePath(); fill(c, '#ffcf3f'); c.beginPath(); c.moveTo(50, 70); c.lineTo(66, 86); c.lineTo(34, 86); c.closePath(); fill(c, '#ffcf3f'); },
  clock(c, col) { c.beginPath(); c.arc(50, 50, 40, 0, TAU); fill(c, col); c.beginPath(); c.moveTo(50, 50); c.lineTo(50, 22); c.moveTo(50, 50); c.lineTo(70, 60); stroke(c, INK, 7); },
  calendar(c, col) { rr(c, 12, 16, 76, 72, 8); fill(c, col); rr(c, 12, 16, 76, 18, 8); fill(c, '#ff5a4f'); for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { rr(c, 20 + k * 17, 42 + r * 14, 11, 9, 2); fill(c, INK); } },
  money(c, col) { c.beginPath(); c.arc(50, 50, 40, 0, TAU); fill(c, '#ffcf3f'); c.beginPath(); c.arc(50, 50, 32, 0, TAU); stroke(c, '#c98a1b', 4); c.fillStyle = '#7a4b00'; c.font = '900 50px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('¥', 50, 54); },
  calculator(c, col) { rr(c, 20, 6, 60, 88, 9); fill(c, col); rr(c, 28, 14, 44, 20, 3); fill(c, '#2fd08f'); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) { rr(c, 28 + k * 16, 42 + r * 16, 12, 12, 3); fill(c, INK); } },
  chart(c, col) { c.beginPath(); c.moveTo(12, 12); c.lineTo(12, 88); c.lineTo(90, 88); stroke(c, col, 6); [[22, 50], [40, 36], [58, 58], [76, 20]].forEach(([x, hh], i) => { rr(c, x, 88 - (88 - hh) + 0, 12, 88 - hh, 2); fill(c, ['#3d7bff', '#2fd08f', '#ffcf3f', '#ff6fa8'][i]); }); },
  gantt(c, col) { for (let i = 0; i < 5; i++) { rr(c, 14 + i * 12, 14 + i * 15, 34, 10, 4); fill(c, i % 2 ? '#ffcf3f' : col); } c.beginPath(); c.moveTo(10, 90); c.lineTo(92, 90); stroke(c, col, 4); },
  warning(c, col) { ICONS.exclaim(c, col); },
  fire(c, col) { c.beginPath(); c.moveTo(50, 4); c.bezierCurveTo(70, 30, 90, 46, 80, 70); c.bezierCurveTo(72, 92, 28, 96, 20, 70); c.bezierCurveTo(14, 50, 30, 40, 34, 22); c.bezierCurveTo(42, 34, 44, 40, 50, 4); fill(c, '#ff5a1f'); c.beginPath(); c.moveTo(50, 40); c.bezierCurveTo(64, 56, 70, 66, 64, 78); c.bezierCurveTo(58, 92, 40, 90, 36, 78); c.bezierCurveTo(32, 66, 44, 58, 50, 40); fill(c, '#ffcf3f'); },
  bolt(c, col) { c.beginPath(); c.moveTo(58, 4); c.lineTo(20, 56); c.lineTo(46, 56); c.lineTo(38, 96); c.lineTo(80, 40); c.lineTo(52, 40); c.closePath(); fill(c, col); },
  meteor(c, col) { c.beginPath(); c.moveTo(10, 10); c.lineTo(56, 44); c.lineTo(44, 56); c.closePath(); fill(c, 'rgba(255,160,60,0.8)'); c.beginPath(); c.arc(62, 62, 26, 0, TAU); fill(c, col); c.beginPath(); c.arc(54, 56, 6, 0, TAU); c.arc(70, 70, 5, 0, TAU); fill(c, 'rgba(0,0,0,0.35)'); },
  tornado(c, col) { for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(50 + Math.sin(i) * 6, 14 + i * 14, 40 - i * 6, 7, 0, 0, TAU); stroke(c, col, 6); } },
  ghost(c, col) { c.beginPath(); c.moveTo(20, 90); c.lineTo(20, 42); c.bezierCurveTo(20, 6, 80, 6, 80, 42); c.lineTo(80, 90); c.lineTo(70, 80); c.lineTo(60, 90); c.lineTo(50, 80); c.lineTo(40, 90); c.lineTo(30, 80); c.closePath(); fill(c, col); c.beginPath(); c.arc(38, 42, 6, 0, TAU); c.arc(62, 42, 6, 0, TAU); fill(c, INK); },
  eye(c, col) { c.beginPath(); c.moveTo(6, 50); c.quadraticCurveTo(50, 6, 94, 50); c.quadraticCurveTo(50, 94, 6, 50); fill(c, col); c.beginPath(); c.arc(50, 50, 18, 0, TAU); fill(c, '#3d7bff'); c.beginPath(); c.arc(50, 50, 8, 0, TAU); fill(c, INK); },
  check(c, col) { c.beginPath(); c.arc(50, 50, 42, 0, TAU); fill(c, col); c.beginPath(); c.moveTo(28, 52); c.lineTo(44, 68); c.lineTo(74, 34); stroke(c, '#18a77a', 12); },
  cross(c, col) { c.beginPath(); c.arc(50, 50, 42, 0, TAU); fill(c, col); c.beginPath(); c.moveTo(32, 32); c.lineTo(68, 68); c.moveTo(68, 32); c.lineTo(32, 68); stroke(c, '#d22', 12); },
  stamp(c, col) { rr(c, 38, 6, 24, 40, 8); fill(c, col); rr(c, 20, 44, 60, 16, 4); fill(c, col); c.beginPath(); c.arc(50, 80, 16, 0, TAU); stroke(c, '#e33', 6); c.fillStyle = '#e33'; c.font = '900 18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('承認', 50, 81); },
  book(c, col) { c.beginPath(); c.moveTo(50, 22); c.quadraticCurveTo(30, 10, 8, 16); c.lineTo(8, 84); c.quadraticCurveTo(30, 78, 50, 90); c.quadraticCurveTo(70, 78, 92, 84); c.lineTo(92, 16); c.quadraticCurveTo(70, 10, 50, 22); fill(c, col); c.beginPath(); c.moveTo(50, 22); c.lineTo(50, 90); stroke(c, INK, 3); lines(c, 16, 34, 26, 4, 11, INK, 3); lines(c, 58, 34, 26, 4, 11, INK, 3); },
  scroll(c, col) { rr(c, 18, 14, 64, 72, 6); fill(c, col); c.beginPath(); c.arc(18, 20, 8, 0, TAU); c.arc(82, 80, 8, 0, TAU); fill(c, '#c98a1b'); lines(c, 28, 34, 44, 4, 12, INK); },
  key(c, col) { c.beginPath(); c.arc(30, 50, 18, 0, TAU); stroke(c, col, 10); c.beginPath(); c.moveTo(48, 50); c.lineTo(92, 50); c.moveTo(78, 50); c.lineTo(78, 66); c.moveTo(88, 50); c.lineTo(88, 62); stroke(c, col, 9); },
  lock(c, col) { c.beginPath(); c.arc(50, 38, 20, Math.PI, 0); stroke(c, col, 9); rr(c, 22, 40, 56, 48, 8); fill(c, col); c.beginPath(); c.arc(50, 60, 7, 0, TAU); fill(c, INK); },
  flag(c, col) { c.beginPath(); c.moveTo(20, 6); c.lineTo(20, 94); stroke(c, col, 7); c.beginPath(); c.moveTo(24, 10); c.lineTo(84, 22); c.lineTo(24, 50); c.closePath(); fill(c, '#ff5a4f'); },
  wrench(c, col) { c.save(); c.translate(50, 50); c.rotate(Math.PI / 4); rr(c, -7, -6, 14, 52, 6); fill(c, col); c.beginPath(); c.arc(0, -22, 20, Math.PI * 0.62, Math.PI * 2.38); c.lineTo(8, -34); c.lineTo(8, -46); c.lineTo(-8, -46); c.lineTo(-8, -34); c.closePath(); fill(c, col); c.restore(); },
  monitor(c, col) { rr(c, 8, 12, 84, 56, 6); fill(c, col); rr(c, 14, 18, 72, 44, 3); fill(c, '#1b2b55'); c.beginPath(); c.moveTo(14, 50); c.lineTo(34, 36); c.lineTo(50, 44); c.lineTo(70, 26); c.lineTo(86, 34); stroke(c, '#2fd08f', 4); rr(c, 40, 70, 20, 12, 2); fill(c, col); rr(c, 28, 82, 44, 8, 3); fill(c, col); },
  wireframe(c, col) { rr(c, 12, 8, 76, 84, 6); stroke(c, col, 5); rr(c, 20, 16, 60, 14, 3); fill(c, col); rr(c, 20, 36, 26, 26, 3); stroke(c, col, 4); c.beginPath(); c.moveTo(20, 36); c.lineTo(46, 62); c.moveTo(46, 36); c.lineTo(20, 62); stroke(c, col, 3); lines(c, 52, 40, 28, 3, 9, col, 4); rr(c, 20, 72, 60, 12, 4); fill(c, '#ffcf3f'); },
  flow(c, col) { rr(c, 34, 4, 32, 16, 8); fill(c, col); c.beginPath(); c.moveTo(50, 30); c.lineTo(70, 44); c.lineTo(50, 58); c.lineTo(30, 44); c.closePath(); fill(c, '#ffcf3f'); rr(c, 8, 72, 30, 18, 3); fill(c, col); rr(c, 62, 72, 30, 18, 3); fill(c, col); c.beginPath(); c.moveTo(50, 20); c.lineTo(50, 30); c.moveTo(30, 44); c.lineTo(22, 44); c.lineTo(22, 72); c.moveTo(70, 44); c.lineTo(78, 44); c.lineTo(78, 72); stroke(c, col, 4); },
  vmodel(c, col) { c.beginPath(); c.moveTo(10, 14); c.lineTo(50, 88); c.lineTo(90, 14); stroke(c, col, 12); for (const [x, y] of [[10, 14], [24, 40], [38, 66], [90, 14], [76, 40], [62, 66]]) { c.beginPath(); c.arc(x, y, 7, 0, TAU); fill(c, '#ffcf3f'); } c.setLineDash([5, 6]); for (const y of [14, 40, 66]) { c.beginPath(); c.moveTo(10 + (y - 14) * 0.54 + 10, y); c.lineTo(90 - (y - 14) * 0.54 - 10, y); stroke(c, col, 3); } c.setLineDash([]); },
  mail(c, col) { rr(c, 8, 22, 84, 56, 6); fill(c, col); c.beginPath(); c.moveTo(10, 26); c.lineTo(50, 56); c.lineTo(90, 26); stroke(c, INK, 5); },
  phone(c, col) { rr(c, 28, 6, 44, 88, 9); fill(c, col); rr(c, 33, 16, 34, 62, 3); fill(c, '#1b2b55'); c.beginPath(); c.arc(50, 86, 4, 0, TAU); fill(c, INK); },
  bell(c, col) { c.beginPath(); c.moveTo(20, 74); c.quadraticCurveTo(26, 66, 26, 46); c.bezierCurveTo(26, 20, 74, 20, 74, 46); c.quadraticCurveTo(74, 66, 80, 74); c.closePath(); fill(c, col); c.beginPath(); c.arc(50, 82, 8, 0, TAU); fill(c, col); c.beginPath(); c.moveTo(8, 30); c.lineTo(16, 36); c.moveTo(92, 30); c.lineTo(84, 36); stroke(c, '#ff5a4f', 5); },
  robot(c, col) { rr(c, 22, 24, 56, 48, 10); fill(c, col); c.beginPath(); c.arc(38, 46, 7, 0, TAU); c.arc(62, 46, 7, 0, TAU); fill(c, '#3fd6e8'); rr(c, 36, 60, 28, 5, 2); fill(c, INK); c.beginPath(); c.moveTo(50, 24); c.lineTo(50, 10); stroke(c, col, 4); c.beginPath(); c.arc(50, 8, 5, 0, TAU); fill(c, '#ff5a4f'); rr(c, 30, 76, 40, 16, 4); fill(c, col); },
  pen(c, col) { c.save(); c.translate(50, 50); c.rotate(Math.PI / 4); rr(c, -8, -44, 16, 70, 3); fill(c, col); c.beginPath(); c.moveTo(-8, 26); c.lineTo(0, 42); c.lineTo(8, 26); fill(c, '#ffcf3f'); c.restore(); },
  scissors(c, col) { c.beginPath(); c.arc(28, 74, 12, 0, TAU); c.arc(72, 74, 12, 0, TAU); stroke(c, col, 6); c.beginPath(); c.moveTo(36, 66); c.lineTo(74, 8); c.moveTo(64, 66); c.lineTo(26, 8); stroke(c, col, 7); },
  table(c, col) { c.beginPath(); c.moveTo(4, 40); c.lineTo(96, 40); c.lineTo(84, 58); c.lineTo(16, 58); c.closePath(); fill(c, col); c.beginPath(); c.moveTo(4, 40); c.lineTo(50, 92); c.lineTo(96, 40); stroke(c, '#ff5a4f', 6); },
  rollback(c, col) { c.beginPath(); c.arc(50, 52, 32, Math.PI * 0.15, Math.PI * 1.6); stroke(c, col, 11); c.beginPath(); c.moveTo(6, 30); c.lineTo(34, 18); c.lineTo(32, 46); c.closePath(); fill(c, col); },
  heart(c, col) { c.beginPath(); c.moveTo(50, 88); c.bezierCurveTo(10, 60, 6, 30, 26, 18); c.bezierCurveTo(40, 10, 50, 22, 50, 30); c.bezierCurveTo(50, 22, 60, 10, 74, 18); c.bezierCurveTo(94, 30, 90, 60, 50, 88); fill(c, col); },
  trophy(c, col) { c.beginPath(); c.moveTo(26, 10); c.lineTo(74, 10); c.lineTo(70, 46); c.quadraticCurveTo(50, 64, 30, 46); c.closePath(); fill(c, '#ffcf3f'); c.beginPath(); c.arc(22, 26, 10, Math.PI / 2, Math.PI * 1.5); c.arc(78, 26, 10, -Math.PI / 2, Math.PI / 2); stroke(c, '#ffcf3f', 5); rr(c, 44, 56, 12, 18, 2); fill(c, '#c98a1b'); rr(c, 28, 74, 44, 14, 3); fill(c, col); },
  sparkle(c, col) { for (const [x, y, s] of [[50, 50, 40], [80, 20, 14], [20, 80, 12]]) { c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); fill(c, col); } },
  sword(c, col) { c.save(); c.translate(50, 50); c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, -46); c.lineTo(7, -34); c.lineTo(7, 20); c.lineTo(-7, 20); c.lineTo(-7, -34); c.closePath(); fill(c, col); rr(c, -20, 20, 40, 7, 3); fill(c, '#ffcf3f'); rr(c, -4, 27, 8, 18, 3); fill(c, '#7a4b00'); c.restore(); },
  hammer(c, col) { c.save(); c.translate(50, 50); c.rotate(-Math.PI / 5); rr(c, -5, -10, 10, 56, 4); fill(c, '#c98a1b'); rr(c, -26, -32, 52, 24, 5); fill(c, col); c.restore(); },
  target(c, col) { for (const [r, k] of [[42, col], [30, '#ff5a4f'], [18, col], [7, '#ff5a4f']]) { c.beginPath(); c.arc(50, 50, r, 0, TAU); fill(c, k); } },
  bridge(c, col) { c.beginPath(); c.moveTo(4, 60); c.quadraticCurveTo(50, 10, 96, 60); stroke(c, col, 7); c.beginPath(); c.moveTo(4, 62); c.lineTo(96, 62); stroke(c, col, 8); for (let x = 16; x < 90; x += 12) { c.beginPath(); c.moveTo(x, 62); c.lineTo(x, 60 - Math.sin(((x - 4) / 92) * Math.PI) * 38); stroke(c, col, 3); } },
  box(c, col) { c.beginPath(); c.moveTo(50, 8); c.lineTo(90, 28); c.lineTo(50, 48); c.lineTo(10, 28); c.closePath(); fill(c, '#ffe3a0'); c.beginPath(); c.moveTo(10, 28); c.lineTo(50, 48); c.lineTo(50, 94); c.lineTo(10, 74); c.closePath(); fill(c, col); c.beginPath(); c.moveTo(90, 28); c.lineTo(50, 48); c.lineTo(50, 94); c.lineTo(90, 74); c.closePath(); fill(c, '#c98a1b'); },
  coffee(c, col) { rr(c, 18, 30, 52, 56, 10); fill(c, col); c.beginPath(); c.arc(72, 54, 12, -Math.PI / 2, Math.PI / 2); stroke(c, col, 7); for (const x of [32, 46, 58]) { c.beginPath(); c.moveTo(x, 24); c.quadraticCurveTo(x - 6, 16, x, 8); stroke(c, 'rgba(255,255,255,0.8)', 4); } },
  moon(c, col) { c.beginPath(); c.arc(50, 50, 38, Math.PI * 0.32, Math.PI * 1.68); c.arc(66, 40, 30, Math.PI * 1.25, Math.PI * 0.62, true); c.closePath(); fill(c, col); },
  crown(c, col) { c.beginPath(); c.moveTo(10, 78); c.lineTo(14, 26); c.lineTo(34, 50); c.lineTo(50, 18); c.lineTo(66, 50); c.lineTo(86, 26); c.lineTo(90, 78); c.closePath(); fill(c, '#ffcf3f'); rr(c, 10, 78, 80, 10, 3); fill(c, col); },
  sun(c, col) { c.beginPath(); c.arc(50, 50, 24, 0, TAU); fill(c, '#ffcf3f'); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); c.moveTo(50 + Math.cos(a) * 32, 50 + Math.sin(a) * 32); c.lineTo(50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44); stroke(c, '#ffcf3f', 6); } },
  mask(c, col) { c.beginPath(); c.moveTo(10, 30); c.quadraticCurveTo(50, 18, 90, 30); c.quadraticCurveTo(90, 74, 50, 86); c.quadraticCurveTo(10, 74, 10, 30); fill(c, col); c.beginPath(); c.ellipse(34, 46, 10, 6, 0.2, 0, TAU); c.ellipse(66, 46, 10, 6, -0.2, 0, TAU); fill(c, INK); c.beginPath(); c.arc(50, 64, 12, 0.1, Math.PI - 0.1); stroke(c, INK, 4); },
};
export const ICON_NAMES = Object.keys(ICONS);
