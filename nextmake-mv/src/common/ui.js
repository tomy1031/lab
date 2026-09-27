/* Product-UI mockup helpers shared by the promo films. Depends on NM (lib.js). */
window.UI = (() => {
'use strict';
const { el, place, box, clamp, prog, E, lerp } = NM;

const ICONS = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  ask: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01"/>',
  sort: '<path d="M4 6h10M4 12h7M4 18h4M17 5v14M14 16l3 3 3-3"/>',
  db: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3M14 21h1"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H3z"/><path d="M14 6v12"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19l7-7"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M11 21l2-6-3-3 1-4 4 3h3M9 12l-2 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
};
function icon(name, size = 32, color) {
  const n = el('span', 'icon');
  n.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
  place(n, { width: size + 'px', height: size + 'px', color: color || 'currentColor' });
  return n;
}

/** phone frame; returns { root, screen } positioned at (x, y) (top-left) */
function phone(parent, x, y, { time = '9:41', app = null } = {}) {
  const root = el('div', 'phone', parent); box(root, x, y);
  el('div', 'island', root);
  const screen = el('div', 'screen', root);
  const st = el('div', 'status', screen, `<span>${time}</span><span style="letter-spacing:2px">●●● ◧</span>`);
  let bar = null;
  if (app) bar = el('div', 'appbar', screen, `<span class="dot"></span><span>${app}</span>`);
  return { root, screen, status: st, bar };
}

/** typewriter: reveal str progressively between a and a + dur */
function type(n, str, t, a, dur, caret = true) {
  const k = Math.round(str.length * clamp((t - a) / dur));
  const showCaret = caret && t >= a && t < a + dur + .4 && Math.floor(t * 2.4) % 2 === 0;
  n.textContent = str.slice(0, k) + (showCaret ? '｜' : '');
}

/** voice waveform on a canvas: amplitude env over time, deterministic */
function wave(cv, t, level = 1, color = '#1668c4', bars = 40) {
  const g = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h);
  const bw = w / bars;
  g.fillStyle = color;
  for (let i = 0; i < bars; i++) {
    const v = (Math.sin(t * 7.3 + i * .9) * .5 + .5) * (Math.sin(t * 3.1 + i * .37) * .4 + .6) * (Math.sin(t * 13 + i * 2.1) * .2 + .8);
    const env = Math.sin(Math.PI * (i + .5) / bars) ** .6;
    const bh = Math.max(4, h * .9 * v * env * level);
    const x = i * bw + bw * .25, y = (h - bh) / 2;
    const r = Math.min(bw * .25, 3);
    g.beginPath(); g.roundRect(x, y, bw * .5, bh, r); g.fill();
  }
}

/** pop-in for UI elements */
function pop(n, t, a, { dur = .45, dy = 16, s0 = .96, out = null, outDur = .3 } = {}) {
  const p = E.outCubic(prog(t, a, a + dur));
  let o = p;
  if (out !== null) o *= 1 - E.inCubic(prog(t, out, out + outDur));
  n.style.opacity = o.toFixed(3);
  n.style.visibility = o <= .001 ? 'hidden' : 'visible';
  n.style.transform = `translateY(${((1 - p) * dy).toFixed(1)}px) scale(${lerp(s0, 1, p).toFixed(4)})`;
}

return { ICONS, icon, phone, type, wave, pop };
})();
