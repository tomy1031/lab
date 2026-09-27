/* NEXTMAKE investor MV — deterministic motion graphics.
 * Every visual is a pure function of time t (seconds): window.seek(t) renders a frame.
 * Music is 120 BPM (beat 0.5 s, bar 2 s); scene boundaries sit on that grid.
 */
(() => {
'use strict';

const W = 1920, H = 1080, FPS = 30, DURATION = 100;
const BEAT = 0.5;

// ------------------------------------------------------------------ math
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  lin: p => p,
  outCubic: p => 1 - Math.pow(1 - p, 3),
  inCubic: p => p * p * p,
  inOutCubic: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  outExpo: p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p),
  inExpo: p => p <= 0 ? 0 : Math.pow(2, 10 * p - 10),
  outBack: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  outQuart: p => 1 - Math.pow(1 - p, 4),
};
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// window visibility with fades: returns opacity for [a, b]
function win(t, a, b, fi = .3, fo = .3) {
  if (t < a || t > b) return 0;
  const i = fi > 0 ? clamp((t - a) / fi) : 1;
  const o = fo > 0 ? clamp((b - t) / fo) : 1;
  return Math.min(i, o);
}
// kick-drum punch (1 at each beat, decays within the beat)
function punch(t, a, b, amt = .03) {
  if (t < a || t >= b) return 0;
  const ph = ((t - a) % BEAT) / BEAT;
  return amt * Math.exp(-ph * 7);
}

// ------------------------------------------------------------------ DOM helpers
const $ = sel => document.querySelector(sel);
function el(tag, cls, parent, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}
function place(n, css) { Object.assign(n.style, css); return n; }
function setT(n, { x = 0, y = 0, s = 1, r = 0, o = 1, blur = 0 } = {}) {
  n.style.transform = `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
  n.style.opacity = o;
  n.style.filter = blur > .25 ? `blur(${blur.toFixed(2)}px)` : 'none';
  n.style.visibility = o <= .001 ? 'hidden' : 'visible';
}
function text(parent, str, css = {}, cls = '') {
  const n = el('div', 'abs ' + cls, parent);
  place(n, css);
  n._chars = [];
  for (const ch of str) {
    if (ch === '\n') { el('br', '', n); continue; }
    const s = el('span', 'ch', n);
    s.textContent = ch;
    n._chars.push(s);
  }
  return n;
}
// staggered character reveal (+ optional exit)
function chars(n, t, start, { dur = .5, stag = .035, dy = 50, blur = 10, sc = 1, out = null, outDur = .3, outDy = -30 } = {}) {
  const cs = n._chars;
  for (let i = 0; i < cs.length; i++) {
    const p = E.outCubic(prog(t, start + i * stag, start + i * stag + dur));
    let o = p, y = (1 - p) * dy, b = (1 - p) * blur, s = lerp(sc, 1, p);
    if (out !== null) {
      const q = E.inCubic(prog(t, out + i * stag * .4, out + i * stag * .4 + outDur));
      o *= 1 - q; y += q * outDy; b += q * blur;
    }
    cs[i].style.opacity = o;
    cs[i].style.transform = `translateY(${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    cs[i].style.filter = b > .3 ? `blur(${b.toFixed(1)}px)` : 'none';
  }
  n.style.opacity = 1;
  n.style.visibility = 'visible';
}
function photo(parent, name, box = [0, 0, W, H], cls = '') {
  const d = el('div', 'photo ' + cls, parent);
  place(d, { left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px' });
  const img = el('img', '', d);
  img.src = `assets/img/${name}.jpg`;
  d._img = img;
  return d;
}
function kb(d, t, a, b, { s0 = 1.06, s1 = 1.16, x0 = 0, x1 = 0, y0 = 0, y1 = 0, extra = 0 } = {}) {
  const p = prog(t, a, b);
  d._img.style.transform = `translate(${lerp(x0, x1, p).toFixed(1)}px, ${lerp(y0, y1, p).toFixed(1)}px) scale(${(lerp(s0, s1, p) + extra).toFixed(4)})`;
}
function show(n, o) { n.style.opacity = o; n.style.visibility = o <= .001 ? 'hidden' : 'visible'; }

// NEXTMAKE mark, rebuilt as vector from the official logo
const MARK = `<svg viewBox="0 0 512 445" xmlns="http://www.w3.org/2000/svg">
  <polygon class="mk1" points="0,182 285,445 0,445" fill="#1668c4"/>
  <polygon class="mk2" points="90,0 90,265 285,445 490,445" fill="#3fb0ff"/>
  <polygon class="mk3" points="285,210 512,5 512,445 490,445" fill="#1668c4"/>
</svg>`;
function logo(parent, size, css = {}) {
  const n = el('div', 'abs logo', parent, `<span>NEXT</span>${MARK}<span>MAKE</span>`);
  place(n, Object.assign({ fontSize: size + 'px' }, css));
  return n;
}

// ------------------------------------------------------------------ stage
const root = $('#scenes');
const scenes = [];
function scene(a, b, build, update) {
  const n = el('div', 'scene', root);
  const ctx = build(n) || {};
  scenes.push({ a, b, n, ctx, update });
}

// ------------------------------------------------------------------ background particle network
const bg = $('#bg'), g = bg.getContext('2d');
const R = rng(42);
const PTS = Array.from({ length: 130 }, () => ({
  x: R() * (W + 400) - 200, y: R() * (H + 400) - 200,
  vx: (R() - .5) * 22, vy: (R() - .5) * 14, r: .8 + R() * 1.8, ph: R() * 6.28,
}));
function bgLevel(t) {
  // how visible the network is — strongest on dark typographic scenes
  const keys = [[0, .2], [1.5, 1], [7.5, 1], [8, .25], [12, 1], [16, 1], [20, .5], [32, .15], [48, .4], [56, .15],
                [76, .7], [84, .15], [88, .9], [92, 1], [100, .6]];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t >= t0 && t <= t1) return lerp(v0, v1, (t - t0) / (t1 - t0));
  }
  return .6;
}
function drawBg(t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const grad = g.createRadialGradient(W * .5, H * .45, 50, W * .5, H * .5, W * .75);
  grad.addColorStop(0, '#0d2250');
  grad.addColorStop(.55, '#07122b');
  grad.addColorStop(1, '#030815');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const lv = bgLevel(t);
  if (lv <= .01) return;
  const P = PTS.map(p => {
    let x = (p.x + p.vx * t) % (W + 400); if (x < 0) x += W + 400; x -= 200;
    let y = (p.y + p.vy * t) % (H + 400); if (y < 0) y += H + 400; y -= 200;
    return [x, y, p];
  });
  g.lineWidth = 1;
  for (let i = 0; i < P.length; i++) {
    for (let j = i + 1; j < P.length; j++) {
      const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1];
      const d2 = dx * dx + dy * dy;
      if (d2 < 190 * 190) {
        const a = (1 - Math.sqrt(d2) / 190) * .28 * lv;
        g.strokeStyle = `rgba(90,180,255,${a.toFixed(3)})`;
        g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[j][0], P[j][1]); g.stroke();
      }
    }
  }
  for (const [x, y, p] of P) {
    const tw = .55 + .45 * Math.sin(t * 2.2 + p.ph);
    g.fillStyle = `rgba(150,220,255,${(.75 * lv * tw).toFixed(3)})`;
    g.beginPath(); g.arc(x, y, p.r, 0, 6.283); g.fill();
  }
}

// ------------------------------------------------------------------ overlays
const IMPACTS = [[0, .5], [8, .75], [16, 1], [32, 1], [56, 1], [92, 1]];
const CUTS = [9, 10, 11, 12, 20, 22, 24, 26, 28, 30, 34, 36, 38, 40, 42, 44, 46, 48, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 80, 84, 88, 96];
function flashAt(t) {
  let f = 0;
  for (const [ti, amt] of IMPACTS) if (t >= ti) f = Math.max(f, amt * .9 * Math.exp(-(t - ti) * 6));
  for (const ti of CUTS) if (t >= ti) f = Math.max(f, .22 * Math.exp(-(t - ti) * 14));
  return f;
}
function shakeAt(t) {
  let x = 0, y = 0;
  for (const [ti, amt] of IMPACTS) {
    if (t >= ti && t < ti + .8) {
      const k = amt * 16 * Math.exp(-(t - ti) * 7);
      x += Math.sin(t * 91.7 + ti) * k; y += Math.cos(t * 73.3 + ti * 2) * k;
    }
  }
  return [x, y];
}
// film grain texture
(() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), im = x.createImageData(256, 256), r = rng(9);
  for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

// HUD
const hud = $('#hud');
hud.querySelector('.tl').innerHTML = `<div class="logo" style="font-size:22px">${MARK}<span style="letter-spacing:.18em;font-weight:600">NEXTMAKE INC.</span></div>`;
const CHAPTERS = [
  [0, 16, 'PROLOGUE'], [16, 32, '01 — HISTORY'], [32, 48, '02 — NATIONAL PROJECT'], [48, 76, '03 — 5 FRONTIERS'],
  [76, 84, '04 — GROWTH ENGINE'], [84, 92, '05 — MISSION'], [92, 100, 'INVEST IN THE NEXT'],
];
function fmt(t) { const s = Math.floor(t); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function drawHud(t) {
  const o = Math.min(win(t, 8.2, 15.4, .4, .2) + win(t, 20.2, 91.6, .4, .3), 1);
  hud.style.opacity = o;
  const ch = CHAPTERS.find(c => t >= c[0] && t < c[1]);
  hud.querySelector('.tr').textContent = ch ? ch[2] : '';
  hud.querySelector('.bl').textContent = `${fmt(t)} / ${fmt(DURATION)}   ·   PEOPLE × CULTURE × TECHNOLOGY`;
  hud.querySelector('.bar i').style.width = (t / DURATION * 100).toFixed(2) + '%';
}

// ================================================================== SCENES
// ---------------------------------------------------------- A. HOOK 0–8
scene(0, 8, n => {
  const c = {};
  c.photo = photo(n, 'students_hall');
  c.tint = el('div', 'shade-all', n); c.tint.style.background = 'rgba(4,10,24,.72)';
  c.l1 = text(n, '2030年、日本では', { top: '250px', fontSize: '50px', fontWeight: 500, letterSpacing: '.12em' }, 'center-x');
  c.num = el('div', 'abs center-x mont grad', n); place(c.num, { top: '330px', fontSize: '250px', fontWeight: 800, lineHeight: 1, letterSpacing: '-.01em' });
  c.numGlow = el('div', 'abs center-x mont', n); place(c.numGlow, { top: '330px', fontSize: '250px', fontWeight: 800, lineHeight: 1, color: 'transparent', textShadow: '0 0 60px rgba(69,214,255,.55)' });
  c.l2 = text(n, '人のIT人材が、不足する。', { top: '640px', fontSize: '72px', fontWeight: 800, letterSpacing: '.04em' }, 'center-x');
  c.src = el('div', 'abs', n, '出典：経済産業省「IT人材需給に関する調査」（2019年）における2030年の最大試算');
  place(c.src, { left: '64px', bottom: '48px', fontSize: '18px', color: 'rgba(255,255,255,.55)', letterSpacing: '.04em' });
  c.b1 = text(n, '人が、足りない。', { top: '450px', fontSize: '130px', fontWeight: 900, letterSpacing: '.06em' }, 'center-x');
  c.b2a = text(n, 'ならば、', { top: '330px', fontSize: '60px', fontWeight: 500, letterSpacing: '.1em' }, 'center-x');
  c.b2b = text(n, '世界中の才能と、つなげばいい。', { top: '450px', fontSize: '104px', fontWeight: 900, letterSpacing: '.02em' }, 'center-x glow');
  return c;
}, (t, c) => {
  // part 1: the problem
  const gl = t > 3.8 && t < 4.0;
  chars(c.l1, t, .35, { stag: .05, out: 3.75 });
  const cp = E.outExpo(prog(t, .9, 3.1));
  const val = Math.round(790000 * cp / 1000) * 1000;
  c.num.textContent = c.numGlow.textContent = val.toLocaleString('en-US');
  const no = win(t, .85, 3.95, .25, .12);
  setT(c.num, { o: no, s: lerp(1.12, 1, E.outCubic(prog(t, .85, 1.6))), x: gl ? Math.sin(t * 400) * 18 : 0 });
  setT(c.numGlow, { o: no * .9, s: lerp(1.12, 1, E.outCubic(prog(t, .85, 1.6))) });
  c.num.style.textShadow = gl ? '-10px 0 #ff2a6d, 10px 0 #2af5ff' : 'none';
  chars(c.l2, t, 2.1, { stag: .035, out: 3.75 });
  show(c.src, win(t, 1.4, 3.9, .4, .15));
  // part 2: the turn
  chars(c.b1, t, 4.02, { stag: .06, dur: .35, dy: 0, blur: 14, sc: 1.4, out: 5.7, outDur: .25 });
  if (t < 4) show(c.b1, 0); else show(c.b1, 1);
  chars(c.b2a, t, 5.95, { stag: .05, out: 7.75 });
  chars(c.b2b, t, 6.25, { stag: .04, out: 7.8, outDur: .2 });
  // background photo emerges during the turn
  show(c.photo, .55 * win(t, 5.8, 8.2, 1.2, .01));
  kb(c.photo, t, 5.8, 8, { s0: 1.25, s1: 1.12 });
  c.photo.style.filter = `blur(${lerp(10, 2, prog(t, 5.8, 8)).toFixed(1)}px) saturate(.7)`;
  show(c.tint, win(t, 5.8, 8.2, 1.2, .01));
});

// ---------------------------------------------------------- B. ANSWER 8–15.5
scene(8, 15.5, n => {
  const c = {};
  c.ph = ['osaka_street', 'team_osaka', 'staff_engineer', 'verify_meeting'].map(p => photo(n, p));
  c.shade = el('div', 'shade-b', n);
  c.l1 = el('div', 'abs label', n, 'OSAKA, JAPAN — EST. 2018'); place(c.l1, { left: '120px', top: '640px' });
  c.t1 = text(n, '大阪発のIT企業が、', { left: '116px', top: '690px', fontSize: '84px', fontWeight: 900 });
  c.t2 = text(n, '日本と世界の才能をつなぐ。', { left: '116px', top: '800px', fontSize: '84px', fontWeight: 900 }, 'glow');
  c.words = ['PEOPLE', '×', 'CULTURE', '×', 'TECHNOLOGY'].map((w, i) => {
    const d = el('div', 'abs center-x mont', n, w);
    place(d, { top: (250 + i * 118) + 'px', fontSize: (w === '×' ? 64 : 120) + 'px', fontWeight: 800, letterSpacing: '.14em', lineHeight: 1 });
    if (w !== '×') d.classList.add('grad');
    return d;
  });
  c.jp = text(n, '人  ×  文化  ×  技術', { top: '900px', fontSize: '40px', fontWeight: 700, letterSpacing: '.3em', color: 'var(--cyan)' }, 'center-x');
  c.streak = el('div', 'hline', n); place(c.streak, { top: '540px', height: '3px', width: '1400px' });
  return c;
}, (t, c) => {
  c.ph.forEach((p, i) => {
    const a = 8 + i, b = a + 1;
    show(p, t >= a && t < b + .02 ? 1 : 0);
    kb(p, t, a, b + 1, { s0: 1.14, s1: 1.04, x0: i % 2 ? -30 : 30, x1: 0, extra: punch(t, 8, 12, .02) });
  });
  const txt = win(t, 8, 12, .01, .12);
  show(c.shade, txt); show(c.l1, win(t, 8.2, 12, .3, .12));
  chars(c.t1, t, 8.25, { stag: .04, out: 11.85, outDur: .15 });
  chars(c.t2, t, 9.6, { stag: .04, out: 11.85, outDur: .15 });
  // words slam on beats
  const starts = [12, 12.5, 13, 13.5, 14];
  c.words.forEach((w, i) => {
    const p = E.outExpo(prog(t, starts[i], starts[i] + .35));
    const out = E.inExpo(prog(t, 15.1, 15.45));
    setT(w, { o: (t >= starts[i] ? p : 0) * (1 - out), s: lerp(1.6, 1, p) * lerp(1, .2, out), blur: (1 - p) * 16, y: lerp(0, (540 - (300 + i * 118)), out) });
  });
  chars(c.jp, t, 14.2, { stag: .03, dy: 20, out: 15.1, outDur: .2 });
  const sp = prog(t, 12, 15.5);
  setT(c.streak, { x: lerp(-1500, 2000, (sp * 3.5) % 1), o: t >= 12 ? .8 : 0 });
});

// ---------------------------------------------------------- C. LOGO 16–20
scene(16, 20, n => {
  const c = {};
  c.glow = el('div', 'abs', n); place(c.glow, { left: '360px', top: '140px', width: '1200px', height: '800px', background: 'radial-gradient(ellipse at center, rgba(31,111,255,.45), rgba(31,111,255,0) 65%)' });
  c.logo = logo(n, 150, { left: '0', right: '0', top: '380px', justifyContent: 'center' });
  c.mk = [...c.logo.querySelectorAll('polygon')];
  c.words = [...c.logo.querySelectorAll('span')];
  c.words.forEach(w => place(w, { background: 'linear-gradient(100deg, #fff 42%, #7fdcff 50%, #fff 58%)', backgroundSize: '300% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }));
  c.jp = text(n, '株式会社ネクストメイク', { top: '600px', fontSize: '40px', fontWeight: 700, letterSpacing: '.5em' }, 'center-x');
  c.tag = text(n, 'ITで、新しい「次」を創造する。', { top: '680px', fontSize: '54px', fontWeight: 800, letterSpacing: '.08em' }, 'center-x glow');
  c.loc = el('div', 'abs center-x label', n, 'OSAKA · TOKYO · PHNOM PENH · VIETNAM · UZBEKISTAN'); place(c.loc, { top: '800px', fontSize: '20px', color: 'rgba(255,255,255,.7)' });
  return c;
}, (t, c) => {
  const p = E.outExpo(prog(t, 16, 16.9));
  const out = E.inCubic(prog(t, 19.55, 19.95));
  setT(c.glow, { o: win(t, 16, 20, .6, .4), s: 1 + .08 * Math.sin(t * 2) });
  setT(c.logo, { o: 1 - out, s: lerp(1.25, 1, p) * (1 + prog(t, 16.9, 19.5) * .04) * lerp(1, 1.3, out), blur: (1 - p) * 18 + out * 20 });
  // mark pieces fly in
  const dirs = [[-260, 120, -25], [0, -260, 0], [260, 120, 25]];
  c.mk.forEach((m, i) => {
    const q = E.outBack(prog(t, 16 + i * .08, 16.7 + i * .08));
    m.style.transform = `translate(${dirs[i][0] * (1 - q)}px, ${dirs[i][1] * (1 - q)}px) rotate(${dirs[i][2] * (1 - q)}deg)`;
    m.style.transformOrigin = '256px 222px';
  });
  c.words.forEach((w, i) => {
    const q = E.outCubic(prog(t, 16.1 + i * .1, 16.8 + i * .1));
    w.style.display = 'inline-block';
    w.style.transform = `translateX(${(i ? 1 : -1) * 120 * (1 - q)}px)`;
    w.style.opacity = q;
  });
  const sh = E.inOutCubic(prog(t, 16.8, 17.8));
  c.words.forEach(w => { w.style.backgroundPosition = `${lerp(100, 0, sh)}% 0`; });
  chars(c.jp, t, 16.9, { stag: .03, dy: 16, out: 19.5, outDur: .3 });
  chars(c.tag, t, 17.35, { stag: .035, out: 19.55, outDur: .3 });
  show(c.loc, win(t, 18.1, 19.9, .5, .3));
});

// ---------------------------------------------------------- D. HISTORY 20–31.75
const MAPBOX = { x: 70, y: 200, w: 900, h: 700, lon0: 40, lon1: 150, lat0: -12, lat1: 60 };
const proj = (lon, lat) => [MAPBOX.x + (lon - MAPBOX.lon0) / (MAPBOX.lon1 - MAPBOX.lon0) * MAPBOX.w,
                            MAPBOX.y + (MAPBOX.lat1 - lat) / (MAPBOX.lat1 - MAPBOX.lat0) * MAPBOX.h];
const NODES = {
  OSAKA: [135.5, 34.7, 20], TOKYO: [139.7, 35.7, 28], VIETNAM: [108.2, 16.1, 24], 'PHNOM PENH': [104.9, 11.6, 26], UZBEKISTAN: [69.2, 41.3, 30],
};
const MILESTONES = [
  { y: '2018', t: '大阪で創業', d: '株式会社NEXT MAKE 設立\n2019年 受託開発事業を開始', img: 'staff_dev', node: 'OSAKA' },
  { y: '2021', t: '自社サービスとデザイン', d: '情報サービス「TANBAMU」開始\n2022年 IT導入補助金 支援事業者に', img: 'web_uchida', node: 'OSAKA' },
  { y: '2023', t: '海外へ ― ベトナム', d: 'ベトナムで海外事業を開始\n日本企業向けオフショア開発', img: 'global_team', node: 'VIETNAM' },
  { y: '2024', t: 'カンボジア国家プロジェクト', d: '郵便電気通信省・AUPPと\n「Japanese IT Pathway」始動', img: 'signing', node: 'PHNOM PENH' },
  { y: '2025', t: '東京本店・国際フォーラム', d: '東京本店を設立\nカンボジアビジネスフォーラム主催', img: 'forum', node: 'TOKYO' },
  { y: '2026', t: '5つの新事業を同時リリース', d: 'ウズベキスタンで事業開始\nカンボジア法人「Khmersabai」設立', img: 'ecosystem', node: 'UZBEKISTAN' },
];
let DOTS = [];
scene(20, 31.75, n => {
  const c = {};
  c.cv = el('canvas', 'abs', n); c.cv.width = W; c.cv.height = H; place(c.cv, { left: 0, top: 0 });
  c.g = c.cv.getContext('2d');
  c.head = el('div', 'abs label', n, 'HISTORY — 2018 → 2026'); place(c.head, { left: '120px', top: '150px' });
  c.title = text(n, '8年で、大阪から世界へ。', { left: '116px', top: '190px', fontSize: '64px', fontWeight: 900 });
  c.cards = MILESTONES.map((m, i) => {
    const k = el('div', 'abs card', n); place(k, { left: '1060px', top: '230px', width: '780px', height: '640px', overflow: 'hidden' });
    const ph = photo(k, m.img, [0, 0, 780, 330]);
    const yr = el('div', 'abs mont grad', k, m.y); place(yr, { left: '44px', top: '300px', fontSize: '120px', fontWeight: 800, lineHeight: 1 });
    const tt = el('div', 'abs', k, m.t); place(tt, { left: '48px', top: '440px', fontSize: '44px', fontWeight: 900 });
    const dd = el('div', 'abs', k, m.d.replace('\n', '<br>')); place(dd, { left: '48px', top: '508px', fontSize: '28px', fontWeight: 500, lineHeight: 1.6, color: '#cfe3ff' });
    return { k, ph, yr };
  });
  c.tl = el('div', 'abs', n); place(c.tl, { left: '120px', right: '120px', top: '960px', height: '2px', background: 'rgba(255,255,255,.18)' });
  c.tlFill = el('div', 'abs', c.tl); place(c.tlFill, { left: 0, top: 0, height: '2px', background: 'var(--cyan)', boxShadow: '0 0 12px var(--cyan)' });
  c.ticks = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'].map((y, i) => {
    const d = el('div', 'abs mont', n, y); place(d, { left: (120 + i * (1680 / 8) - 30) + 'px', top: '976px', fontSize: '18px', fontWeight: 700, letterSpacing: '.1em', color: 'rgba(255,255,255,.4)' });
    return d;
  });
  return c;
}, (t, c) => {
  const idx = clamp(Math.floor((t - 20) / 2), 0, 5);
  const gx = c.g;
  gx.clearRect(0, 0, W, H);
  // dot map with a ripple reveal from Osaka
  const [ox, oy] = proj(135.5, 34.7);
  const rev = (t - 20) * 900;
  for (const [lon, lat] of DOTS) {
    const [x, y] = proj(lon, lat);
    const d = Math.hypot(x - ox, y - oy);
    const a = clamp((rev - d) / 200) * .42;
    if (a <= 0) continue;
    gx.fillStyle = `rgba(120,190,255,${a.toFixed(3)})`;
    gx.fillRect(x - 2.2, y - 2.2, 4.4, 4.4);
  }
  // arcs + nodes
  const order = ['OSAKA', 'VIETNAM', 'PHNOM PENH', 'TOKYO', 'UZBEKISTAN'];
  const appear = { OSAKA: 20.2, VIETNAM: 24.1, 'PHNOM PENH': 26.1, TOKYO: 28.1, UZBEKISTAN: 30.1 };
  for (const name of order) {
    const [lon, lat, lblOff] = NODES[name];
    const [x, y] = proj(lon, lat);
    const ta = appear[name];
    if (t < ta) continue;
    if (name !== 'OSAKA') {
      const p = E.outCubic(prog(t, ta, ta + .8));
      const mx = (ox + x) / 2, my = Math.min(oy, y) - 120 - Math.abs(ox - x) * .15;
      gx.strokeStyle = 'rgba(69,214,255,.85)'; gx.lineWidth = 2.5; gx.setLineDash([]);
      gx.beginPath();
      for (let k = 0; k <= 40 * p; k++) {
        const s = k / 40, u = 1 - s;
        const px = u * u * ox + 2 * u * s * mx + s * s * x, py = u * u * oy + 2 * u * s * my + s * s * y;
        k === 0 ? gx.moveTo(px, py) : gx.lineTo(px, py);
      }
      gx.stroke();
    }
    const pulse = ((t - ta) % 1.2) / 1.2;
    gx.strokeStyle = `rgba(69,214,255,${(1 - pulse) * .9})`; gx.lineWidth = 2;
    gx.beginPath(); gx.arc(x, y, 8 + pulse * 34, 0, 6.283); gx.stroke();
    gx.fillStyle = '#fff'; gx.shadowColor = '#45d6ff'; gx.shadowBlur = 20;
    gx.beginPath(); gx.arc(x, y, 7, 0, 6.283); gx.fill(); gx.shadowBlur = 0;
    gx.font = '700 20px MONT'; gx.fillStyle = `rgba(255,255,255,${clamp((t - ta) * 3)})`;
    const lx = name === 'TOKYO' ? x + 16 : name === 'OSAKA' ? x - 16 : x + 16;
    gx.textAlign = name === 'OSAKA' ? 'right' : 'left';
    gx.fillText(name, lx, y + (name === 'TOKYO' ? -14 : name === 'OSAKA' ? 26 : 6));
  }
  show(c.head, win(t, 20.1, 31.75, .4, .2));
  chars(c.title, t, 20.2, { stag: .04, out: 31.5, outDur: .2 });
  c.cards.forEach((k, i) => {
    const a = 20 + i * 2, b = a + 2;
    const pin = E.outExpo(prog(t, a, a + .5));
    const pout = E.inCubic(prog(t, b - .2, b));
    const vis = t >= a - .01 && t < b + .01;
    setT(k.k, { o: vis ? pin * (1 - pout) : 0, x: lerp(120, 0, pin) - pout * 80, blur: (1 - pin) * 6 });
    if (vis) kb(k.ph, t, a, b, { s0: 1.12, s1: 1.02 });
  });
  const tp = clamp((t - 20) / 11.75);
  const yrs = [0, 3, 5, 6, 7, 8];
  const target = yrs[idx] / 8 + prog(t, 20 + idx * 2, 22 + idx * 2) * ((yrs[Math.min(idx + 1, 5)] - yrs[idx]) / 8);
  c.tlFill.style.width = (clamp(target) * 100).toFixed(2) + '%';
  c.ticks.forEach((d, i) => { d.style.color = i / 8 <= target + .001 ? '#fff' : 'rgba(255,255,255,.35)'; });
  show(c.tl, win(t, 20.1, 31.75, .4, .2));
  c.ticks.forEach(d => { d.style.opacity = win(t, 20.1, 31.75, .4, .2); });
  void tp;
});

// ---------------------------------------------------------- E. NATIONAL PROJECT 32–48
scene(32, 48, n => {
  const c = {};
  // 32–34 slam
  c.p0 = photo(n, 'signing_wide'); c.s0 = el('div', 'shade-all', n); c.s0.style.background = 'rgba(4,10,24,.62)';
  c.k0 = el('div', 'abs center-x label', n, 'CAMBODIA × JAPAN'); place(c.k0, { top: '360px', fontSize: '26px' });
  c.t0 = text(n, '国家と、組む。', { top: '420px', fontSize: '190px', fontWeight: 900, letterSpacing: '.06em' }, 'center-x glow');
  // 34–36 MPTC
  c.p1 = photo(n, 'signing', [0, 0, 1100, H]); c.s1 = el('div', 'abs', n); place(c.s1, { left: '700px', top: 0, width: '400px', height: H + 'px', background: 'linear-gradient(90deg, rgba(4,10,24,0), rgba(4,10,24,1))' });
  c.r1 = el('div', 'abs', n); place(c.r1, { left: '1100px', top: 0, width: '820px', height: H + 'px', background: '#040a18' });
  c.l1 = el('div', 'abs label', n, 'JAPANESE IT PATHWAY — 2024.09 START'); place(c.l1, { left: '1150px', top: '300px' });
  c.t1a = text(n, 'カンボジア\n郵便電気通信省が', { left: '1146px', top: '350px', fontSize: '70px', fontWeight: 900, lineHeight: 1.3 });
  c.t1b = text(n, '出資する、', { left: '1146px', top: '540px', fontSize: '70px', fontWeight: 900 }, 'glow');
  c.t1c = el('div', 'abs', n, '日本とカンボジアをつなぐ<br>国際IT人材育成プロジェクト'); place(c.t1c, { left: '1150px', top: '660px', fontSize: '36px', fontWeight: 700, lineHeight: 1.6, color: '#cfe3ff' });
  c.t1d = el('div', 'abs', n, '2024.08 AUPP × NEXTMAKE パートナーシップ調印式（プノンペン）'); place(c.t1d, { left: '48px', bottom: '64px', fontSize: '20px', color: 'rgba(255,255,255,.8)' });
  // 36–38 classes grid
  c.g = ['class_teaching', 'aupp_class', 'it_start'].map((p, i) => photo(n, p, [i * 640, 0, 640, H]));
  c.gs = el('div', 'shade-b', n);
  c.t2 = text(n, '日本語  ×  IT  ×  日本企業文化', { top: '800px', fontSize: '76px', fontWeight: 900, letterSpacing: '.04em' }, 'center-x glow');
  c.t2s = el('div', 'abs center-x', n, 'AUPP（アメリカン大学プノンペン）・CADT の学生に2年間のカリキュラムを提供'); place(c.t2s, { top: '920px', fontSize: '28px', fontWeight: 600, color: '#cfe3ff' });
  // 38–40 78 students
  c.p3 = photo(n, 'ceremony_2026'); c.p3.style.filter = 'blur(3px)'; c.s3 = el('div', 'shade-all', n); c.s3.style.background = 'rgba(4,10,24,.74)';
  c.l3 = el('div', 'abs center-x label', n, 'STUDENTS IN THE PROGRAM'); place(c.l3, { top: '250px' });
  c.row3 = el('div', 'abs', n); place(c.row3, { left: 0, right: 0, top: '290px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '18px' });
  c.n3 = el('div', 'mont grad', c.row3, '78'); place(c.n3, { fontSize: '360px', fontWeight: 800, lineHeight: 1 });
  c.u3 = el('div', '', c.row3, '名'); place(c.u3, { fontSize: '90px', fontWeight: 900, marginBottom: '40px' });
  c.d3 = el('div', 'abs center-x', n, '参加学生　AUPP 38名 ｜ CADT 40名'); place(c.d3, { top: '700px', fontSize: '46px', fontWeight: 800 });
  // 40–42 dignitaries
  c.p4 = photo(n, 'formal_gathering'); c.s4 = el('div', 'shade-b', n);
  c.t4a = text(n, '開講式には', { left: '120px', top: '640px', fontSize: '44px', fontWeight: 700 });
  c.t4b = text(n, 'カンボジア郵便電気通信大臣、\n駐カンボジア日本国大使が出席。', { left: '116px', top: '710px', fontSize: '66px', fontWeight: 900, lineHeight: 1.35 });
  // 42–44 forum
  c.p5 = photo(n, 'forum'); c.s5 = el('div', 'shade-l', n);
  c.l5 = el('div', 'abs label', n, 'CAMBODIA BUSINESS FORUM — HILTON OSAKA 2025.06'); place(c.l5, { left: '120px', top: '300px' });
  c.t5 = text(n, '国際フォーラムを主催', { left: '116px', top: '350px', fontSize: '76px', fontWeight: 900 });
  c.n5 = el('div', 'abs mont grad', n, '120+'); place(c.n5, { left: '110px', top: '470px', fontSize: '250px', fontWeight: 800, lineHeight: 1 });
  c.u5 = el('div', 'abs', n, '社以上が参加'); place(c.u5, { left: '120px', top: '740px', fontSize: '56px', fontWeight: 900 });
  // 44–46 rapid montage
  c.m = ['undokai', 'namecard', 'student_speech', 'students_cafe'].map(p => photo(n, p));
  c.ms = el('div', 'shade-b', n);
  c.t6 = text(n, '才能が、育っている。', { top: '820px', fontSize: '96px', fontWeight: 900, letterSpacing: '.08em' }, 'center-x glow');
  // 46–48 graduation
  c.p7 = photo(n, 'ceremony_group'); c.s7 = el('div', 'shade-b', n);
  c.l7 = el('div', 'abs label', n, '2026.09 — JAPANESE IT PATHWAY COMPLETION CEREMONY'); place(c.l7, { left: '120px', top: '700px' });
  c.t7 = text(n, '1期生、日本企業への就職へ。', { left: '116px', top: '750px', fontSize: '92px', fontWeight: 900 }, 'glow');
  return c;
}, (t, c) => {
  const pu = punch(t, 32, 48, .025);
  // 32–34
  const v0 = t < 34 ? 1 : 0;
  show(c.p0, v0); show(c.s0, v0); kb(c.p0, t, 32, 34, { s0: 1.2, s1: 1.08, extra: pu });
  show(c.k0, win(t, 32.1, 34, .3, .1));
  chars(c.t0, t, 32.0, { stag: .06, dur: .35, dy: 0, sc: 1.5, blur: 16, out: 33.85, outDur: .15 });
  if (t >= 34) show(c.t0, 0);
  // 34–36
  const v1 = t >= 34 && t < 36 ? 1 : 0;
  [c.p1, c.s1, c.r1].forEach(x => show(x, v1));
  kb(c.p1, t, 34, 36, { s0: 1.15, s1: 1.05, x0: -40, x1: 0 });
  show(c.l1, v1 * win(t, 34.1, 36, .3, .1));
  chars(c.t1a, t, 34.1, { stag: .03, dy: 30, out: 35.85, outDur: .15 });
  chars(c.t1b, t, 34.55, { stag: .04, dy: 30, out: 35.85, outDur: .15 });
  show(c.t1c, v1 * win(t, 34.9, 36, .3, .1)); show(c.t1d, v1 * win(t, 34.3, 36, .3, .1));
  if (!v1) { show(c.t1a, 0); show(c.t1b, 0); }
  // 36–38
  const v2 = t >= 36 && t < 38;
  c.g.forEach((p, i) => {
    const a = 36 + i * .5;
    const q = E.outExpo(prog(t, a, a + .45));
    show(p, v2 && t >= a ? 1 : 0);
    p.style.clipPath = `inset(${((1 - q) * 100).toFixed(1)}% 0 0 0)`;
    kb(p, t, a, 38, { s0: 1.2, s1: 1.06, extra: pu });
  });
  show(c.gs, v2 ? 1 : 0);
  chars(c.t2, t, 36.9, { stag: .03, out: 37.85, outDur: .15 });
  if (!v2) show(c.t2, 0);
  show(c.t2s, v2 ? win(t, 37.2, 38, .3, .1) : 0);
  // 38–40
  const v3 = t >= 38 && t < 40;
  show(c.p3, v3 ? 1 : 0); show(c.s3, v3 ? 1 : 0); kb(c.p3, t, 38, 40, { s0: 1.1, s1: 1.2 });
  const cnt = Math.round(78 * E.outExpo(prog(t, 38.05, 39.1)));
  c.n3.textContent = cnt;
  setT(c.row3, { o: v3 ? 1 : 0, s: lerp(1.3, 1, E.outExpo(prog(t, 38, 38.5))) + pu });
  show(c.l3, v3 ? win(t, 38.1, 40, .3, .1) : 0); show(c.u3, v3 ? win(t, 38.4, 40, .2, .1) : 0);
  setT(c.d3, { o: v3 ? win(t, 38.7, 40, .3, .1) : 0, y: lerp(30, 0, E.outCubic(prog(t, 38.7, 39.2))) });
  // 40–42
  const v4 = t >= 40 && t < 42;
  show(c.p4, v4 ? 1 : 0); show(c.s4, v4 ? 1 : 0); kb(c.p4, t, 40, 42, { s0: 1.05, s1: 1.15, y0: 20, y1: -20 });
  chars(c.t4a, t, 40.1, { stag: .04, out: 41.85, outDur: .15 });
  chars(c.t4b, t, 40.4, { stag: .025, out: 41.85, outDur: .15 });
  if (!v4) { show(c.t4a, 0); show(c.t4b, 0); }
  // 42–44
  const v5 = t >= 42 && t < 44;
  show(c.p5, v5 ? 1 : 0); show(c.s5, v5 ? 1 : 0); kb(c.p5, t, 42, 44, { s0: 1.08, s1: 1.18, x0: 40, x1: -20 });
  show(c.l5, v5 ? win(t, 42.1, 44, .3, .1) : 0);
  chars(c.t5, t, 42.1, { stag: .035, out: 43.85, outDur: .15 });
  if (!v5) show(c.t5, 0);
  c.n5.textContent = Math.round(120 * E.outExpo(prog(t, 42.3, 42.95))) + '+';
  setT(c.n5, { o: v5 ? win(t, 42.3, 44, .15, .1) : 0, s: 1 + pu });
  show(c.u5, v5 ? win(t, 42.7, 44, .2, .1) : 0);
  // 44–46 montage every beat
  const v6 = t >= 44 && t < 46;
  c.m.forEach((p, i) => {
    const a = 44 + i * .5;
    show(p, v6 && t >= a && t < a + .5 ? 1 : 0);
    kb(p, t, a, a + .5, { s0: 1.18, s1: 1.1 });
  });
  show(c.ms, v6 ? 1 : 0);
  chars(c.t6, t, 44.05, { stag: .05, out: 45.85, outDur: .15 });
  if (!v6) show(c.t6, 0);
  // 46–48
  const v7 = t >= 46 && t < 48;
  show(c.p7, v7 ? 1 : 0); show(c.s7, v7 ? 1 : 0); kb(c.p7, t, 46, 48.2, { s0: 1.04, s1: 1.14 });
  show(c.l7, v7 ? win(t, 46.2, 48, .3, .2) : 0);
  chars(c.t7, t, 46.3, { stag: .04, out: 47.8, outDur: .2 });
  if (!v7) show(c.t7, 0);
});

// ---------------------------------------------------------- F. 5 FRONTIERS INTRO 48–55.5
const FR = [['01', '情報'], ['02', '文化'], ['03', '信頼'], ['04', '安全'], ['05', '才能']];
scene(48, 55.5, n => {
  const c = {};
  c.p = photo(n, 'ecosystem'); c.s = el('div', 'shade-all', n); c.s.style.background = 'linear-gradient(0deg, rgba(4,10,24,.92), rgba(4,10,24,.45))';
  c.t1 = text(n, 'そして今、', { top: '330px', fontSize: '58px', fontWeight: 600, letterSpacing: '.14em' }, 'center-x');
  c.t2 = text(n, '5つの事業を、社会へ実装する。', { top: '440px', fontSize: '100px', fontWeight: 900 }, 'center-x glow');
  c.items = FR.map(([no, w], i) => {
    const d = el('div', 'abs', n, `<div class="mont" style="font-size:28px;font-weight:800;letter-spacing:.2em;color:var(--cyan)">${no}</div><div style="font-size:110px;font-weight:900;line-height:1.1">${w}</div>`);
    place(d, { left: (180 + i * 330) + 'px', top: '400px', width: '260px', textAlign: 'center' });
    return d;
  });
  c.lbl = el('div', 'abs center-x mont', n, '05 FRONTIERS'); place(c.lbl, { top: '700px', fontSize: '56px', fontWeight: 800, letterSpacing: '.5em' });
  c.line = el('div', 'hline', n); place(c.line, { left: '160px', width: '1600px', top: '660px' });
  return c;
}, (t, c) => {
  show(c.p, win(t, 48, 55.5, .01, .3)); kb(c.p, t, 48, 55.5, { s0: 1.05, s1: 1.25 });
  c.p.style.filter = `brightness(${lerp(1.6, 1, E.outCubic(prog(t, 48, 49.5))).toFixed(2)})`;
  chars(c.t1, t, 48.4, { stag: .06, out: 51.7, outDur: .25 });
  chars(c.t2, t, 49.2, { stag: .04, out: 51.75, outDur: .25 });
  c.items.forEach((d, i) => {
    const a = 52 + i * .5;
    const q = E.outExpo(prog(t, a, a + .4));
    const out = E.inExpo(prog(t, 55.1, 55.45));
    setT(d, { o: q * (1 - out), y: lerp(60, 0, q), s: lerp(1, .6, out), blur: (1 - q) * 10 + out * 10 });
  });
  setT(c.lbl, { o: win(t, 54.4, 55.45, .2, .2), s: lerp(1.2, 1, E.outCubic(prog(t, 54.4, 55))) });
  setT(c.line, { o: win(t, 52, 55.45, .3, .2), s: prog(t, 52, 54.5) });
});

// ---------------------------------------------------------- G. BUSINESSES 56–76
const BIZ = [
  { no: '01', name: 'NMClaw', cat: 'AI OPERATIONS PLATFORM', tag: '情報を、価値へ。',
    desc: '話すだけで、会社の情報が整理される。<br>会話・音声・チャットをAIが構造化し、次の行動へ。',
    chips: ['音声・チャット入力', 'AI自動振り分け', 'ダッシュボード可視化'], imgs: ['nmclaw', 'nmclaw_transform'],
    proof: '現場の声を、そのまま経営の判断材料へ。' },
  { no: '02', name: 'IDO', cat: 'STORY-DRIVEN TOURISM DX', tag: '文化を、体験へ。',
    desc: 'ひとつのQRから、街の物語がひらく。<br>歴史・文化を動画ストーリーにし、街全体の回遊へ。',
    chips: ['QRですぐ体験', '多言語ガイド', '売上の一部を地域へ還元'], imgs: ['ido_journey', 'ido_miyoshi'],
    proof: '導入事例　徳島県三好市' },
  { no: '03', name: 'Verify', cat: 'BLOCKCHAIN DOCUMENT VERIFICATION', tag: '信頼を、証明へ。',
    desc: '紙もPDFも、そのまま。<br>QRひとつで、証明書の真正性を確認。',
    chips: ['ブロックチェーン記録', 'QR検証', '改ざん検知'], imgs: ['verify_hero', 'verify_edu'],
    proof: 'award' },
  { no: '04', name: 'Security Drone', cat: 'AI × DRONE SOLUTIONS', tag: '異常の兆候を、安全へ。',
    desc: 'AIが侵入や異常を検知し、ドローンが現場へ。<br>確認・通知・警告・記録を自動化。',
    chips: ['AI自律制御', 'リアルタイム画像解析', '警備・点検・災害対応'], imgs: ['drone_security', 'drone_network'],
    proof: '空から、現場の判断を進化させる。' },
  { no: '05', name: 'Internship Lab', cat: 'GLOBAL TALENT PROJECT TEAM', tag: '才能を、企業の力へ。',
    desc: '日本人PM ＋ 海外大学生2〜3名のチームで<br>開発・テスト・AI活用・海外展開を支援。',
    chips: ['日本人PMが管理', '日本語で進行', 'Pathway修了生'], imgs: ['lab_pathway', 'lab_collab'],
    proof: 'cost' },
];
scene(56, 76, n => {
  const c = { b: [] };
  BIZ.forEach((bz, i) => {
    const r = el('div', 'abs', n); place(r, { inset: 0 });
    const pa = photo(r, bz.imgs[0], [560, 0, 1360, H]), pb = photo(r, bz.imgs[1], [560, 0, 1360, H]);
    const sl = el('div', 'abs', r); place(sl, { inset: 0, background: 'linear-gradient(90deg, #040a18 0%, #040a18 33%, rgba(4,10,24,.82) 44%, rgba(4,10,24,.2) 62%, rgba(4,10,24,0) 80%)' });
    const no = el('div', 'abs mont', r, bz.no); place(no, { left: '112px', top: '150px', fontSize: '200px', fontWeight: 800, lineHeight: 1, color: 'transparent', WebkitTextStroke: '2px rgba(69,214,255,.8)' });
    const cat = el('div', 'abs label', r, bz.cat); place(cat, { left: '120px', top: '370px' });
    const nm = el('div', 'abs mont', r, bz.name); place(nm, { left: '112px', top: '400px', fontSize: bz.name.length > 10 ? '104px' : '130px', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.01em' });
    const tag = text(r, bz.tag, { left: '118px', top: '560px', fontSize: '64px', fontWeight: 900 }, 'glow');
    const desc = el('div', 'abs', r, bz.desc); place(desc, { left: '120px', top: '670px', fontSize: '30px', fontWeight: 600, lineHeight: 1.65, color: '#d8e9ff' });
    const chips = el('div', 'abs', r); place(chips, { left: '120px', top: '800px', width: '1100px' });
    const cs = bz.chips.map(x => el('span', 'chip', chips, x));
    let proof;
    if (bz.proof === 'award') {
      proof = el('div', 'abs card', r); place(proof, { left: '1100px', top: '520px', width: '700px', height: '420px', padding: '34px 40px' });
      proof.innerHTML = `<img src="assets/img/verify_award.png" style="position:absolute;right:30px;top:24px;width:150px;height:150px">
        <div class="mont" style="font-size:20px;font-weight:700;letter-spacing:.2em;color:var(--gold)">2026 UN PUBLIC SERVICE AWARDS</div>
        <div style="font-size:36px;font-weight:900;line-height:1.35;margin-top:12px">国連公共サービス賞<br>受賞プラットフォームを<br><span style="color:var(--gold)">日本初導入</span></div>
        <div style="display:flex;gap:40px;margin-top:22px">
          <div><span class="mont" style="font-size:52px;font-weight:800">475</span><span style="font-size:26px;font-weight:800">万+ 文書</span></div>
          <div><span class="mont" style="font-size:52px;font-weight:800">108</span><span style="font-size:26px;font-weight:800">+ 機関</span></div>
        </div>
        <div style="font-size:15px;color:rgba(255,255,255,.6);margin-top:6px">※受賞・数値はカンボジア政府の原型プラットフォーム（verify.gov.kh）、2026年7月時点</div>`;
    } else if (bz.proof === 'cost') {
      proof = el('div', 'abs card', r); place(proof, { left: '1100px', top: '520px', width: '700px', height: '420px', padding: '34px 40px' });
      proof.innerHTML = `<div class="mont" style="font-size:20px;font-weight:700;letter-spacing:.2em;color:var(--cyan)">PROJECT-BASED COST</div>
        <div style="font-size:26px;font-weight:700;margin-top:16px;color:#cfe3ff">一般的なSES単価　1名 月60〜80万円</div>
        <div style="font-size:30px;font-weight:900;margin-top:14px">チーム型で</div>
        <div style="margin-top:4px"><span class="mont grad" style="font-size:110px;font-weight:800;line-height:1.05">40–60</span><span class="mont" style="font-size:60px;font-weight:800">%</span></div>
        <div style="font-size:30px;font-weight:900">のコスト削減を目指せる</div>
        <div style="font-size:15px;color:rgba(255,255,255,.6);margin-top:8px">※公式サイト記載の比較イメージ。業務範囲・期間・体制により異なります</div>`;
    } else {
      proof = el('div', 'abs card', r, `<div style="font-size:34px;font-weight:900;line-height:1.4;white-space:nowrap">${bz.proof}</div>`);
      place(proof, { right: '120px', top: '800px', padding: '30px 44px' });
    }
    c.b.push({ r, pa, pb, no, cat, nm, tag, desc, cs, proof });
  });
  c.dots = el('div', 'abs', n); place(c.dots, { right: '64px', top: '50%', display: 'flex', flexDirection: 'column', gap: '18px' });
  c.dd = BIZ.map(bz => el('div', 'mont', c.dots, bz.no));
  c.dd.forEach(d => place(d, { fontSize: '18px', fontWeight: 800, letterSpacing: '.1em', textAlign: 'right' }));
  return c;
}, (t, c) => {
  const pu = punch(t, 56, 76, .025);
  const cur = clamp(Math.floor((t - 56) / 4), 0, 4);
  c.b.forEach((b, i) => {
    const s = 56 + i * 4, e = s + 4;
    const vis = t >= s && t < e;
    show(b.r, vis ? 1 : 0);
    if (!vis) return;
    show(b.pa, t < s + 2 ? 1 : 0); show(b.pb, t >= s + 2 ? 1 : 0);
    kb(b.pa, t, s, s + 2, { s0: 1.18, s1: 1.06, x0: 40, x1: 0, extra: pu });
    kb(b.pb, t, s + 2, e, { s0: 1.06, s1: 1.16, extra: pu });
    const q = E.outExpo(prog(t, s, s + .5));
    const out = E.inCubic(prog(t, e - .18, e));
    setT(b.no, { o: q * (1 - out), x: lerp(-80, 0, q) });
    setT(b.cat, { o: win(t, s + .1, e, .3, .15) });
    setT(b.nm, { o: E.outCubic(prog(t, s + .05, s + .4)) * (1 - out), x: lerp(-60, 0, E.outExpo(prog(t, s + .05, s + .6))), blur: (1 - E.outCubic(prog(t, s + .05, s + .4))) * 12 });
    chars(b.tag, t, s + .35, { stag: .04, dy: 30, out: e - .18, outDur: .15 });
    setT(b.desc, { o: win(t, s + .7, e, .35, .15), y: lerp(20, 0, E.outCubic(prog(t, s + .7, s + 1.1))) });
    b.cs.forEach((ch, k) => {
      const a = s + 1.0 + k * .15;
      const p = E.outBack(prog(t, a, a + .35));
      ch.style.display = 'inline-block';
      ch.style.opacity = clamp(p) * (1 - out);
      ch.style.transform = `scale(${lerp(.6, 1, clamp(p))})`;
    });
    const pp = E.outExpo(prog(t, s + 2, s + 2.5));
    setT(b.proof, { o: pp * (1 - out), y: lerp(60, 0, pp), blur: (1 - pp) * 8 });
  });
  c.dd.forEach((d, i) => { d.style.color = i === cur ? 'var(--cyan)' : 'rgba(255,255,255,.35)'; d.style.transform = `scale(${i === cur ? 1.3 : 1})`; });
  show(c.dots, win(t, 56.3, 76, .3, .2));
});

// ---------------------------------------------------------- H. FOUNDATION + FLYWHEEL 76–84
scene(76, 84, n => {
  const c = {};
  const works = ['web_uchida', 'web_track', 'web_shizuku', 'web_lealo', 'web_aquick', 'web_fujii', 'sys_hukoren', 'sys_nakatani', 'sys_track'];
  c.rows = [0, 1].map(r => {
    const row = el('div', 'abs', n); place(row, { left: 0, top: (130 + r * 330) + 'px', height: '300px', width: '5000px' });
    const list = r ? works.slice().reverse() : works;
    [...list, ...list].forEach((w, i) => {
      const p = photo(row, w, [i * 520, 0, 500, 300]);
      p.style.borderRadius = '14px';
    });
    return row;
  });
  c.sh = el('div', 'abs', n); place(c.sh, { inset: 0, background: 'linear-gradient(0deg, rgba(4,10,24,1) 22%, rgba(4,10,24,.55) 55%, rgba(4,10,24,.25) 100%)' });
  c.l1 = el('div', 'abs label', n, 'FOUNDATION'); place(c.l1, { left: '120px', top: '720px' });
  c.t1 = text(n, '受託開発で磨いた、揺るがない実装力。', { left: '116px', top: '760px', fontSize: '66px', fontWeight: 900 });
  c.svc = el('div', 'abs', n); place(c.svc, { left: '120px', top: '860px', width: '1700px' });
  c.chips = ['Web・EC制作', 'システム開発', 'アプリ開発', 'インフラ構築', 'SES', '動画制作', '補助金活用支援'].map(s => el('span', 'chip', c.svc, s));
  c.cl = el('div', 'abs', n, '実績：大阪府トラック協会 南大阪支部 ／ 大阪府こども会育成連合会 ／ ナカタニ自動車 ／ ウチダコーポレーション ほか　｜　取引銀行：三井住友銀行・京都銀行・りそな銀行');
  place(c.cl, { left: '120px', top: '960px', fontSize: '20px', color: 'rgba(255,255,255,.7)' });

  // flywheel
  c.fw = el('div', 'abs', n); place(c.fw, { inset: 0 });
  c.fwT = text(c.fw, '才能が事業を生み、事業が才能を育てる。', { top: '64px', fontSize: '54px', fontWeight: 900 }, 'center-x glow');
  c.ring = el('div', 'abs', c.fw); place(c.ring, { left: '630px', top: '210px', width: '660px', height: '660px', borderRadius: '50%', border: '2px dashed rgba(69,214,255,.45)' });
  c.arc = el('div', 'abs', c.fw); place(c.arc, { left: '630px', top: '210px', width: '660px', height: '660px', borderRadius: '50%', border: '6px solid transparent', borderTopColor: 'var(--cyan)', boxShadow: '0 0 0 0 transparent', filter: 'drop-shadow(0 0 10px #45d6ff)' });
  c.core = el('div', 'abs', c.fw, `<div style="width:120px;margin:0 auto">${MARK}</div><div class="mont" style="font-size:26px;font-weight:700;letter-spacing:.2em;margin-top:16px">NEXTMAKE</div>`);
  place(c.core, { left: '810px', top: '430px', width: '300px', textAlign: 'center' });
  c.core.querySelector('svg').style.width = '120px';
  const nodes = [
    ['01 育てる', 'Japanese IT Pathway', 960, 210], ['02 つくる', 'Internship Lab・海外開発拠点', 1330, 540],
    ['03 事業化する', '5つの新規事業', 960, 870], ['04 届ける', '企業・行政・地域へ社会実装', 590, 540],
  ];
  c.nodes = nodes.map(([a, b, x, y]) => {
    const d = el('div', 'abs card', c.fw, `<div style="font-size:38px;font-weight:900">${a}</div><div style="font-size:22px;font-weight:600;color:#cfe3ff;margin-top:6px">${b}</div>`);
    place(d, { left: (x - 200) + 'px', top: (y - 62) + 'px', width: '400px', height: '124px', padding: '18px 20px', textAlign: 'center' });
    return d;
  });
  return c;
}, (t, c) => {
  const vA = t < 80;
  c.rows.forEach((r, i) => { show(r, vA ? 1 : 0); r.style.transform = `translateX(${(i ? -1 : 1) * (t - 76) * 120 - (i ? 1400 : 2000)}px)`; });
  show(c.sh, vA ? 1 : 0);
  show(c.l1, vA ? win(t, 76.1, 80, .3, .15) : 0);
  chars(c.t1, t, 76.15, { stag: .03, out: 79.8, outDur: .2 });
  if (!vA) show(c.t1, 0);
  c.chips.forEach((ch, k) => {
    const p = E.outBack(prog(t, 76.8 + k * .12, 77.2 + k * .12));
    ch.style.display = 'inline-block';
    ch.style.opacity = vA ? clamp(p) * win(t, 76, 80, .01, .2) : 0;
    ch.style.transform = `scale(${lerp(.6, 1, clamp(p))})`;
  });
  show(c.cl, vA ? win(t, 77.6, 80, .4, .2) : 0);
  // flywheel 80–84
  const vB = t >= 80;
  show(c.fw, vB ? win(t, 80, 84, .2, .25) : 0);
  if (vB) {
    chars(c.fwT, t, 80.05, { stag: .03 });
    c.ring.style.transform = `rotate(${(t - 80) * 20}deg)`;
    c.arc.style.transform = `rotate(${(t - 80) * 180 - 45}deg)`;
    const coreP = E.outBack(prog(t, 80, 80.5));
    setT(c.core, { s: coreP * (1 + punch(t, 80, 84, .05)), o: clamp(coreP) });
    c.nodes.forEach((d, i) => {
      const a = 80.2 + i * .5;
      const q = E.outBack(prog(t, a, a + .4));
      const lit = t >= a && ((t - 80.2) / .5 | 0) % 4 === i;
      setT(d, { o: clamp(q), s: lerp(.6, 1, clamp(q)) * (lit ? 1.06 : 1) });
      d.style.borderColor = lit ? 'rgba(69,214,255,.95)' : 'rgba(120,190,255,.25)';
      d.style.boxShadow = lit ? '0 0 40px rgba(69,214,255,.45)' : '0 30px 80px rgba(0,0,0,.45)';
    });
  }
});

// ---------------------------------------------------------- I. MISSION 84–91.75
scene(84, 91.75, n => {
  const c = {};
  c.m = ['team_osaka', 'undokai', 'sharewis_team', 'ceremony_2026', 'visit_group', 'aupp_group', 'manga_event', 'graduation'].map(p => photo(n, p));
  c.ms = el('div', 'shade-b', n);
  c.t1 = text(n, '人、文化、技術をつなぎ、', { top: '780px', fontSize: '84px', fontWeight: 600, letterSpacing: '.06em' }, 'center-x serif glow');
  c.p2 = photo(n, 'ceremony_group'); c.s2 = el('div', 'shade-all', n); c.s2.style.background = 'rgba(4,10,24,.72)';
  c.l2 = el('div', 'abs center-x label', n, 'OUR MISSION'); place(c.l2, { top: '330px' });
  c.t2a = text(n, 'まだ見ぬ価値を、', { top: '390px', fontSize: '120px', fontWeight: 700, letterSpacing: '.06em' }, 'center-x serif');
  c.t2b = text(n, '社会へ届ける。', { top: '560px', fontSize: '120px', fontWeight: 700, letterSpacing: '.06em' }, 'center-x serif glow');
  return c;
}, (t, c) => {
  c.m.forEach((p, i) => {
    const a = 84 + i * .5;
    show(p, t >= a && t < a + .5 ? 1 : 0);
    kb(p, t, a, a + .5, { s0: 1.16, s1: 1.08 });
  });
  show(c.ms, t < 88 ? 1 : 0);
  chars(c.t1, t, 84.3, { stag: .06, out: 87.8, outDur: .2 });
  if (t >= 88) show(c.t1, 0);
  const v2 = t >= 88;
  show(c.p2, v2 ? win(t, 88, 91.75, .3, .3) : 0); show(c.s2, v2 ? 1 : 0);
  kb(c.p2, t, 88, 92, { s0: 1.05, s1: 1.14 });
  c.p2.style.filter = 'blur(3px) saturate(.8)';
  show(c.l2, v2 ? win(t, 88.2, 91.6, .4, .2) : 0);
  chars(c.t2a, t, 88.3, { stag: .08, dur: .7, out: 91.45, outDur: .25 });
  chars(c.t2b, t, 89.2, { stag: .08, dur: .7, out: 91.45, outDur: .25 });
  if (!v2) { show(c.t2a, 0); show(c.t2b, 0); }
});

// ---------------------------------------------------------- J. CTA 92–100
scene(92, 100, n => {
  const c = {};
  c.glow = el('div', 'abs', n); place(c.glow, { left: '260px', top: '80px', width: '1400px', height: '800px', background: 'radial-gradient(ellipse at center, rgba(31,111,255,.5), rgba(31,111,255,0) 65%)' });
  c.logo = logo(n, 128, { left: 0, right: 0, top: '270px', justifyContent: 'center' });
  c.inv = el('div', 'abs center-x mont grad', n, 'INVEST IN THE NEXT.'); place(c.inv, { top: '450px', fontSize: '92px', fontWeight: 800, letterSpacing: '.12em' });
  c.jp = text(n, '次の可能性を、一緒に実装しませんか。', { top: '600px', fontSize: '52px', fontWeight: 800, letterSpacing: '.06em' }, 'center-x');
  c.info = el('div', 'abs center-x', n, '<span style="font-weight:800">株式会社ネクストメイク</span>　｜　大阪本社・東京本店　｜　カンボジア・ベトナム・ウズベキスタンで事業展開');
  place(c.info, { top: '730px', fontSize: '28px', color: '#cfe3ff' });
  c.url = el('div', 'abs center-x mont', n, 'nextmake.site'); place(c.url, { top: '790px', fontSize: '40px', fontWeight: 700, letterSpacing: '.12em', color: 'var(--cyan)' });
  c.disc = el('div', 'abs center-x', n, '本映像は公開情報（公式サイト・PR TIMES・公式YouTube 等）をもとに制作したイメージ映像です。数値は各出典の公表時点のものです。');
  place(c.disc, { bottom: '56px', fontSize: '17px', color: 'rgba(255,255,255,.5)' });
  c.black = el('div', 'abs', n); place(c.black, { inset: 0, background: '#000' });
  return c;
}, (t, c) => {
  const p = E.outExpo(prog(t, 92, 92.8));
  setT(c.glow, { o: win(t, 92, 100, .4, .01), s: 1 + .06 * Math.sin(t * 1.6) });
  setT(c.logo, { s: lerp(1.4, 1, p) * (1 + prog(t, 92.8, 100) * .04), o: clamp(p * 1.4), blur: (1 - p) * 20 });
  const ip = E.outCubic(prog(t, 92.7, 93.5));
  setT(c.inv, { o: ip, y: lerp(40, 0, ip), s: 1 });
  c.inv.style.letterSpacing = lerp(.4, .12, ip).toFixed(3) + 'em';
  chars(c.jp, t, 93.5, { stag: .035 });
  setT(c.info, { o: E.outCubic(prog(t, 94.8, 95.5)), y: lerp(20, 0, E.outCubic(prog(t, 94.8, 95.5))) });
  setT(c.url, { o: E.outCubic(prog(t, 95.2, 95.9)) });
  show(c.disc, E.outCubic(prog(t, 95.6, 96.4)));
  show(c.black, E.inOutCubic(prog(t, 98.6, 100)));
});

// ================================================================== driver
const world = $('#world');
function seek(t) {
  t = clamp(t, 0, DURATION - 1e-4);
  drawBg(t);
  for (const s of scenes) {
    const vis = t >= s.a && t < s.b;
    s.n.style.display = vis ? 'block' : 'none';
    if (vis) s.update(t, s.ctx);
  }
  const [sx, sy] = shakeAt(t);
  world.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
  $('#flash').style.opacity = flashAt(t).toFixed(3);
  const f = Math.floor(t * FPS);
  $('#grain').style.transform = `translate(${(f * 37) % 256 - 128}px, ${(f * 91) % 256 - 128}px)`;
  drawHud(t);
}

async function ready() {
  DOTS = await fetch('assets/asia_dots.json').then(r => r.json());
  await document.fonts.load('900 40px NSJP'); await document.fonts.load('800 40px MONT'); await document.fonts.load('700 40px SERIF');
  await document.fonts.ready;
  const imgs = [...document.images];
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  return true;
}
window.MV = { seek, ready, DURATION, FPS };

// ------------------------------------------------------------------ preview player
const isRender = new URLSearchParams(location.search).has('render');
document.body.classList.add(isRender ? 'render' : 'preview');
if (!isRender) {
  const vp = $('#viewport');
  const fit = () => {
    const s = Math.min(innerWidth / W, (innerHeight - 70) / H);
    vp.style.transform = `scale(${s})`;
    vp.style.width = W + 'px'; vp.style.height = H + 'px';
    document.body.style.minHeight = '100vh';
    vp.style.marginLeft = ((innerWidth - W * s) / 2) + 'px';
    vp.style.marginTop = '0px';
    document.body.style.display = 'block';
  };
  addEventListener('resize', fit); fit();
  const audio = $('#music'), scrub = $('#scrub'), tc = $('#tc'), btn = $('#play');
  let playing = false, t0 = 0, wall = 0;
  const now = () => playing ? (audio.duration ? audio.currentTime : t0 + (performance.now() - wall) / 1000) : +scrub.value;
  btn.onclick = () => {
    playing = !playing; btn.textContent = playing ? '❚❚ Pause' : '▶ Play';
    if (playing) { t0 = +scrub.value; wall = performance.now(); audio.currentTime = t0; audio.play().catch(() => {}); } else audio.pause();
  };
  scrub.oninput = () => { audio.currentTime = +scrub.value; t0 = +scrub.value; wall = performance.now(); seek(+scrub.value); };
  ready().then(() => {
    const loop = () => {
      const t = now();
      if (playing && t >= DURATION) { playing = false; btn.textContent = '▶ Play'; }
      scrub.value = t; tc.textContent = t.toFixed(2);
      seek(t);
      requestAnimationFrame(loop);
    };
    loop();
  });
}
})();
