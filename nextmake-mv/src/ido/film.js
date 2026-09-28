/* Promo — IDO（観光DX）「ひとつのQRから、街の物語がひらく。」 (100 s)
 * Act 1 (0–26)  legend: Miyoshi photographs, vertical Mincho, the four meanings of IDO   [score cue A: koto / shakuhachi / taiko]
 * Act 2 (26–66) journey: on-site QR scan → story plays → ticket opens every guide → walk the route, scanning at each stop
 *               → languages → montage of places                                         [cue B: 96 BPM wa-modern, bar 2.5 s]
 * Act 3 (66–100) return: local value cycle, the Miyoshi case, end card, photo credits     [cue C: strings + koto]
 */
(() => {
'use strict';
const { W, H, clamp, lerp, prog, E, win, $, el, place, box, show, setT, lines, revealLines, chars, fadeChars,
  photo, kb, wipe, drawLine, count, MARK, logo, buildLogo, scene, hooks, film, rng } = NM;
const { icon, phone, type, pop } = UI;
const M = 128;
const SUMI = '#1d1b18', SHU = '#b8412c', KIN = '#a88a54';

// ----------------------------------------------------------------- textures & helpers
const WASHI = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), r = rng(5);
  g.fillStyle = '#f1ebdf'; g.fillRect(0, 0, 512, 512);
  const im = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < im.data.length; i += 4) { const v = (r() - .5) * 10; im.data[i] += v; im.data[i + 1] += v; im.data[i + 2] += v - 1; }
  g.putImageData(im, 0, 0);
  for (let k = 0; k < 260; k++) {               // fibres
    g.strokeStyle = `rgba(${150 + r() * 60},${130 + r() * 50},${100 + r() * 40},${(.05 + r() * .09).toFixed(3)})`;
    g.lineWidth = .4 + r() * .9;
    const x = r() * 512, y = r() * 512, a = r() * 6.28, L = 8 + r() * 40;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * .5 + (r() - .5) * 8, y + Math.sin(a) * L * .5 + (r() - .5) * 8, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  return c.toDataURL();
})();
function washi(parent) {
  const n = el('div', 'fill washi', parent); n.style.backgroundImage = `url(${WASHI})`; n.style.backgroundSize = '512px 512px'; return n;
}
const QR = (() => {                                 // decorative QR-like pattern (not a real code)
  const c = document.createElement('canvas'), S = 25, P = 10; c.width = c.height = S * P;
  const g = c.getContext('2d'), r = rng(21);
  g.fillStyle = '#fff'; g.fillRect(0, 0, S * P, S * P); g.fillStyle = SUMI;
  const finder = (x, y) => { g.fillRect(x * P, y * P, 7 * P, 7 * P); g.fillStyle = '#fff'; g.fillRect((x + 1) * P, (y + 1) * P, 5 * P, 5 * P); g.fillStyle = SUMI; g.fillRect((x + 2) * P, (y + 2) * P, 3 * P, 3 * P); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const inF = (x < 8 && y < 8) || (x > S - 9 && y < 8) || (x < 8 && y > S - 9);
    if (!inF && r() < .48) g.fillRect(x * P, y * P, P, P);
  }
  finder(0, 0); finder(S - 7, 0); finder(0, S - 7);
  return c.toDataURL();
})();
function vt(parent, str, css, cls = '') { return chars(parent, str, css, 'v mincho ' + cls); }
function mincho(parent, arr, x, y, size, color = SUMI, extra = {}) {
  return lines(parent, arr, Object.assign({ left: x + 'px', top: y + 'px', fontSize: size + 'px', color, lineHeight: 1.55 }, extra), 'mincho');
}
function subT(parent, html, x, y, w, color = 'rgba(29,27,24,.7)', size = 22) {
  const n = el('div', 'abs', parent, html); box(n, x, y, w); place(n, { fontSize: size + 'px', lineHeight: 1.9, letterSpacing: '.06em', color }); return n;
}
function cine(parent, name, b) {
  const p = photo(parent, name, b);
  p._img.style.filter = 'saturate(.72) contrast(1.06) brightness(.9) sepia(.08)';
  return p;
}
function span(p, t, a, b, fi = .8, k = {}) {
  const vis = t >= a && t < b;
  show(p, vis ? E.inOutSine(clamp((t - a) / fi)) : 0);
  if (vis) kb(p, t, a, b, Object.assign({ s0: 1.08, s1: 1.0 }, k));
}

// ================================================================= Act 1 — legend (0–26)
scene(0, 26, n => {
  const c = {};
  c.p1 = cine(n, 'miyoshi_iya_observatory'); c.p2 = cine(n, 'miyoshi_ochiai'); c.p3 = cine(n, 'miyoshi_kazurabashi');
  c.sc = el('div', 'fill', n); c.sc.style.background = 'linear-gradient(90deg, rgba(12,14,18,.15), rgba(12,14,18,.62) 70%)';
  c.sc3 = el('div', 'scrim-b', n);
  c.v1 = vt(n, '名所の背景には、\n人々の営みがある。', { left: '1480px', top: '220px', fontSize: '54px', color: '#f3eee4', lineHeight: 1.9 });
  c.v2 = vt(n, '産業が生まれた理由。\n受け継がれてきた時間。', { left: '1480px', top: '220px', fontSize: '54px', color: '#f3eee4', lineHeight: 1.9 });
  c.h3 = lines(n, ['歴史を知ると、', '街の歩き方が変わる。'], { left: M + 'px', top: '720px', fontSize: '72px', color: '#f3eee4', lineHeight: 1.45 }, 'mincho');
  c.place = el('div', 'abs label', n, 'Miyoshi, Tokushima'); box(c.place, M, 150); c.place.style.color = 'rgba(243,238,228,.7)';
  // four meanings
  c.ink = el('div', 'fill aibg', n);
  c.ido = el('div', 'abs latin', c.ink, 'IDO'); place(c.ido, { left: 0, right: 0, top: '120px', textAlign: 'center', fontSize: '28px', fontWeight: 300, letterSpacing: '.8em', color: 'rgba(243,238,228,.7)' });
  const MEAN = [['異土', '異なる土地の物語を紡ぐ'], ['移動', 'もう一歩先へ足を運ぶ'], ['緯度', '土地と土地を結ぶ座標'], ['I do', '自ら体験し、物語の一部になる']];
  c.means = MEAN.map(([k, s], i) => {
    const x = 1400 - i * 330;
    const col = el('div', 'abs', c.ink); box(col, x, 250);
    const big = el('div', 'v mincho', col, k); place(big, { fontSize: '120px', color: '#f3eee4', letterSpacing: '.12em', height: '430px' });
    if (k === 'I do') { big.classList.remove('v'); place(big, { writingMode: 'vertical-rl', textOrientation: 'sideways', fontFamily: 'LATIN', fontWeight: 300, fontSize: '104px' }); }
    const small = el('div', 'v mincho', col, s); place(small, { position: 'absolute', left: '-58px', top: '6px', fontSize: '26px', color: 'rgba(243,238,228,.72)', letterSpacing: '.18em' });
    const line = el('div', 'abs', col); box(line, 160, 0, 1, 520); line.style.background = 'rgba(184,65,44,.8)'; line.style.transformOrigin = '50% 0';
    return { col, big, small, line };
  });
  return c;
}, (t, c) => {
  span(c.p1, t, 0, 5.2, 1.6, { s0: 1.12, s1: 1.04 });
  span(c.p2, t, 5.0, 10.2, .8, { s0: 1.1, s1: 1.02, x0: 40, x1: -20 });
  span(c.p3, t, 10.0, 15.4, .8, { s0: 1.14, s1: 1.04 });
  show(c.sc, t < 10.2 ? 1 : 0); show(c.sc3, t >= 10 && t < 15.4 ? 1 : 0);
  show(c.place, win(t, .8, 15, .8, .6));
  fadeChars(c.v1, t, .9, { stag: .09, dur: 1.0, out: 4.6, outDur: .5 }); if (t > 5.2) show(c.v1, 0);
  fadeChars(c.v2, t, 5.6, { stag: .09, dur: 1.0, out: 9.6, outDur: .5 }); if (t < 5.6 || t > 10.2) show(c.v2, 0);
  revealLines(c.h3, t, 10.6, { stag: .8, dur: 1.2, out: 14.6, outDur: .6 }); if (t < 10.6) show(c.h3, 0);
  // meanings 16–25.4
  show(c.ink, t >= 15.4 ? E.inOutSine(prog(t, 15.4, 16.0)) * (1 - E.inOutSine(prog(t, 25.3, 26))) : 0);
  show(c.ido, win(t, 16.0, 25.4, .6, .4));
  c.means.forEach(({ col, big, small, line }, i) => {
    const a = 16.2 + i * 2.2;
    const p = E.outCubic(prog(t, a, a + .9));
    const dim = t > a + 2.2 && t < 24.6 ? .45 : 1;
    col.style.opacity = (p * dim).toFixed(3); col.style.visibility = p > 0 ? 'visible' : 'hidden';
    big.style.transform = `translateY(${((1 - p) * 30).toFixed(1)}px)`;
    small.style.opacity = E.outCubic(prog(t, a + .4, a + 1.1)).toFixed(3);
    line.style.transform = `scaleY(${E.inOutCubic(prog(t, a + .1, a + 1.2)).toFixed(3)})`;
  });
});

// ================================================================= Act 2 — journey (26–66), 96 BPM: bar 2.5 s
const SVGNS = 'http://www.w3.org/2000/svg';
function S(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
/** scene entrance: the new page slides up over the old one, finishing at a + dur */
function enterUp(n, t, a, dur = .5) {
  const p = E.inOutQuart(prog(t, a, a + dur));
  n.style.clipPath = p < 1 ? `inset(${((1 - p) * 100).toFixed(2)}% 0 0 0)` : 'none';
}
function stepHead(parent, step, head, sub, light = false) {
  return {
    s: (() => { const x = el('div', 'abs step', parent, step); box(x, M, 104); if (light) x.style.color = '#e5a291'; return x; })(),
    h: mincho(parent, [head], M, 136, 54, light ? '#f3eee4' : SUMI),
    d: subT(parent, sub, M, 232, 1000, light ? 'rgba(243,238,228,.78)' : 'rgba(29,27,24,.7)', 21),
  };
}
function headIn(o, t, a, b) {
  show(o.s, win(t, a + .05, b, .35, .3));
  revealLines(o.h, t, a + .12, { dur: .8, out: b - .4, outDur: .35 }); if (t < a || t > b) show(o.h, 0);
  setT(o.d, { y: lerp(10, 0, E.outCubic(prog(t, a + .45, a + .95))), o: win(t, a + .45, b, .45, .3) });
}

// ----------------------------------------------------------------- 01 on site: scan the QR at the place (26–36)
const QRC = [1530, 513];                              // centre of the QR on the post, in world coordinates
const SCAN = { up: 28.5, lock: 29.75, play: 31.0 };
function world(parent) {
  const w = el('div', 'abs', parent); box(w, 0, 0, W, H); w.style.transformOrigin = '0 0';
  const img = el('img', '', w); img.src = '../assets/img/miyoshi_kazura_walk.jpg';
  place(img, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', objectFit: 'cover', filter: 'saturate(.85) brightness(.92)' });
  const post = el('div', 'post', w); box(post, 1390, 380, 280);
  post.innerHTML = `<div class="pillar"></div><div class="plate"><div class="pt">この場所の物語</div><img src="${QR}"><div class="pf"><span>スマホで読み取る</span><span class="seal">旅</span></div></div>`;
  return w;
}
scene(26, 36, n => {
  const c = {};
  c.wa = world(n);
  c.ring = el('div', 'abs', c.wa); box(c.ring, QRC[0] - 95, QRC[1] - 95, 190, 190); place(c.ring, { border: `4px solid ${SHU}`, borderRadius: '14px' });
  c.svg = S('svg', { width: W, height: H }); c.svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible'; c.wa.appendChild(c.svg);
  c.call = S('polyline', { points: '', fill: 'none', stroke: '#f3eee4', 'stroke-width': 2 }, c.svg);
  c.callT = el('div', 'abs callout', c.wa, '観光地に設置された<br>QRコード'); box(c.callT, 990, 470, 240);
  c.dark = el('div', 'fill', n); c.dark.style.background = 'rgba(12,14,18,1)';
  c.top = el('div', 'abs', n); box(c.top, 0, 0, W, 330); c.top.style.background = 'linear-gradient(180deg, rgba(12,14,18,.78), rgba(12,14,18,0))';
  c.bot = el('div', 'abs', n); box(c.bot, 0, 800, W, 280); c.bot.style.background = 'linear-gradient(0deg, rgba(12,14,18,.85), rgba(12,14,18,0))';
  c.head = stepHead(n, '01 SCAN — ON SITE', 'その場所で、QRにかざすだけ。', 'アプリのインストールは不要。観光地のQRから、その場所の物語へ。', true);
  // the past, drifting out of the phone
  c.past = [['miyoshi_thatch', 760, 330, 330, 220], ['miyoshi_ochiai', 830, 600, 300, 200]].map(([f, x, y, w, h]) => {
    const d = el('div', 'past', n); box(d, x, y, w, h);
    d.innerHTML = `<img src="../assets/img/${f}.jpg">`; return { d, x, y, w, h };
  });
  c.threads = S('svg', { width: W, height: H }); c.threads.style.cssText = 'position:absolute;left:0;top:0;overflow:visible'; n.appendChild(c.threads);
  c.th = c.past.map(() => S('path', { fill: 'none', stroke: 'rgba(243,238,228,.7)', 'stroke-width': 1.6, 'stroke-dasharray': '4 6' }, c.threads));
  // phone, held up to the post
  c.ph = phone(n, 0, 0);
  c.ph.root.style.transformOrigin = '0 0';
  const Sc = c.ph.screen; Sc.style.background = '#000';
  c.wb = world(Sc);
  c.camUI = el('div', 'fill', Sc);
  c.camT = el('div', 'abs', c.camUI, 'QRコードを読み取る'); place(c.camT, { left: 0, right: 0, top: '84px', textAlign: 'center', font: '600 17px SANS', color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.6)' });
  c.frame = el('div', 'abs', c.camUI); box(c.frame, 196 - 128, 416 - 128, 256, 256);
  c.frame.innerHTML = ['0,0', '1,0', '0,1', '1,1'].map(p => { const [x, y] = p.split(','); return `<i style="position:absolute;${+x ? 'right' : 'left'}:0;${+y ? 'bottom' : 'top'}:0;width:46px;height:46px;border:5px solid currentColor;${+x ? 'border-left' : 'border-right'}:none;${+y ? 'border-top' : 'border-bottom'}:none;border-radius:8px"></i>`; }).join('');
  c.scanline = el('div', 'abs', c.frame); box(c.scanline, 10, 0, 236, 3); c.scanline.style.background = SHU; c.scanline.style.boxShadow = `0 0 14px ${SHU}`;
  c.ok = el('div', 'abs', c.camUI); box(c.ok, 46, 640, 300, 64);
  place(c.ok, { background: 'rgba(251,248,242,.96)', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 18px', font: '700 18px SANS', color: SUMI });
  c.ok.appendChild(icon('check', 28, SHU)); el('span', '', c.ok, '物語が見つかりました');
  // story player
  c.pl = el('div', 'fill', Sc); c.pl.style.background = '#fbf8f2';
  c.pl.innerHTML = `<div class="vid" style="position:absolute;left:0;right:0;top:0;height:470px;overflow:hidden;background:#000">
      <img src="../assets/img/miyoshi_kazurabashi.jpg" style="position:absolute;left:-40%;top:0;height:100%;width:auto;filter:sepia(.55) saturate(.7) brightness(.9)">
      <div class="sub" style="position:absolute;left:0;right:0;bottom:22px;text-align:center;color:#fff;font:600 17px SANS;text-shadow:0 1px 8px rgba(0,0,0,.85)"></div>
      <div style="position:absolute;left:16px;top:72px;background:${SHU};color:#fff;font:700 12px SANS;padding:5px 10px;border-radius:6px">無料プレビュー</div></div>
    <div style="position:absolute;left:20px;right:20px;top:488px;height:4px;background:rgba(29,27,24,.12);border-radius:2px"><i class="bar" style="position:absolute;left:0;top:0;bottom:0;background:${SHU};border-radius:2px"></i></div>
    <div style="position:absolute;left:24px;top:514px;font:600 12px LATIN;letter-spacing:.2em;color:#8a8276">STORY 01</div>
    <div style="position:absolute;left:24px;top:538px;font:700 24px SERIF;color:${SUMI}">谷に眠る物語</div>
    <div style="position:absolute;left:24px;top:584px;right:24px;font:500 15px/1.8 SANS;color:#5f584d">この土地の歴史と文化を、短い動画でたどる。</div>
    <div class="cta" style="position:absolute;left:20px;right:20px;top:700px;height:60px;border-radius:30px;background:${SUMI};color:#fff;display:grid;place-items:center;font:700 17px SANS">続きはガイドチケットで</div>`;
  c.plImg = c.pl.querySelector('img'); c.plSub = c.pl.querySelector('.sub'); c.plBar = c.pl.querySelector('.bar'); c.plCta = c.pl.querySelector('.cta');
  // the three steps, lit one by one
  const PILLS = ['① 現地のQRを見つける', '② スマホのカメラでかざす（アプリ不要）', '③ その場所の物語が、その場で始まる'];
  c.pills = el('div', 'abs pills', n); box(c.pills, M, 948);
  c.pill = PILLS.map((s, i) => { if (i) el('span', 'arr', c.pills, '→'); return el('span', 'pill', c.pills, s); });
  c.note = el('div', 'abs cap', n, '※QRの設置場所・デザインはイメージです'); box(c.note, M, 1030); c.note.style.color = 'rgba(243,238,228,.5)';
  return c;
}, (t, c) => {
  // the world: gentle push-in; dims and softens when the phone comes up
  const sA = 1 + .05 * prog(t, 26, 36), T = [960 * (1 - sA), 540 * (1 - sA)];
  c.wa.style.transform = `translate(${T[0].toFixed(2)}px, ${T[1].toFixed(2)}px) scale(${sA.toFixed(4)})`;
  const up = E.inOutCubic(prog(t, SCAN.up, SCAN.up + .8));
  const focus = E.inOutSine(prog(t, SCAN.up + .2, SCAN.up + .9));
  c.wa.style.filter = focus > 0 ? `blur(${(focus * 3).toFixed(2)}px)` : 'none';
  show(c.dark, Math.max(1 - E.inOutSine(prog(t, 26, 26.7)), focus * .38));
  show(c.top, 1); show(c.bot, 1);
  headIn(c.head, t, 26.3, 35.7);
  // the post is pointed out
  const pulse = t >= 26.8 && t < SCAN.up + .4;
  const ph = ((t - 26.8) % .9) / .9;
  c.ring.style.transform = `scale(${(1 + ph * .35).toFixed(3)})`; c.ring.style.opacity = pulse ? ((1 - ph) * (1 - focus)).toFixed(3) : 0;
  const cq = E.inOutCubic(prog(t, 27.0, 27.5));
  const pts = [[1230, 520], [1330, 520], [1390, 480]];
  const L = pts.length - 1, u = cq * L, k = Math.floor(u);
  const shown = pts.slice(0, k + 1);
  if (k < L) shown.push([lerp(pts[k][0], pts[k + 1][0], u - k), lerp(pts[k][1], pts[k + 1][1], u - k)]);
  c.call.setAttribute('points', cq > 0 ? shown.map(p => p.join(',')).join(' ') : '');
  c.call.style.opacity = (1 - focus).toFixed(3);
  pop(c.callT, t, 27.3, { dy: 10, out: SCAN.up, outDur: .3 });
  // the phone rises in front of the post; its screen is a camera looking at the same place
  const QS = [QRC[0] * sA + T[0], QRC[1] * sA + T[1]];
  const px = QS[0] - 210, py = lerp(1120, QS[1] - 430, up);
  c.ph.root.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${lerp(8, -2, up).toFixed(2)}deg)`;
  show(c.ph.root, t >= SCAN.up ? 1 : 0);
  const k2 = 1.55, Scx = px + 14 + 196, Scy = py + 14 + 416;
  c.wb.style.transform = `translate(${((T[0] - Scx) * k2 + 196).toFixed(1)}px, ${((T[1] - Scy) * k2 + 416).toFixed(1)}px) scale(${(sA * k2).toFixed(4)})`;
  const locked = t >= SCAN.lock;
  c.frame.style.color = locked ? SHU : '#fff';
  c.frame.style.transform = `scale(${locked ? (.94 + .1 * Math.exp(-(t - SCAN.lock) * 7)).toFixed(3) : 1})`;
  const sp = ((t - SCAN.up - .6) % .8) / .8;
  c.scanline.style.transform = `translateY(${(sp * 252).toFixed(1)}px)`;
  show(c.scanline, t >= SCAN.up + .6 && !locked ? 1 : 0);
  show(c.camT, win(t, SCAN.up + .5, SCAN.play, .3, .2));
  pop(c.ok, t, SCAN.lock + .1, { dy: 14 });
  // the story plays, right there
  const pv = t >= SCAN.play;
  if (pv) wipe(c.pl, t, SCAN.play, .5, 'up', E.outQuart); else show(c.pl, 0);
  c.plImg.style.transform = `translateX(${(-(t - SCAN.play) * 14).toFixed(1)}px) scale(${(1.05 + (t - SCAN.play) * .01).toFixed(4)})`;
  c.plBar.style.width = (100 * clamp((t - 31.3) / 4.4)).toFixed(1) + '%';
  const subs = ['かつてこの谷には、', '人々の暮らしと、', '受け継がれてきた物語がある。'];
  c.plSub.textContent = t < 32.4 ? subs[0] : t < 33.7 ? subs[1] : subs[2];
  pop(c.plCta, t, 34.3, { dy: 10 });
  c.past.forEach(({ d, x, y, w, h }, i) => {
    const a = SCAN.play + .5 + i * .5;
    const p = E.outCubic(prog(t, a, a + 1.0));
    const sx = Scx, sy = Scy - 150;
    d.style.transform = `translate(${lerp(sx - x - w / 2, 0, p).toFixed(1)}px, ${(lerp(sy - y - h / 2, 0, p) + Math.sin((t + i) * 1.3) * 5).toFixed(1)}px) scale(${lerp(.2, 1, p).toFixed(3)})`;
    d.style.opacity = (p * .82 * (1 - E.inCubic(prog(t, 35.3, 35.8)))).toFixed(3);
    const ex = x + w, ey = y + h / 2;
    c.th[i].setAttribute('d', `M ${sx} ${sy} C ${sx - 120} ${sy - 40}, ${ex + 120} ${ey + 30}, ${ex} ${ey}`);
    c.th[i].style.opacity = d.style.opacity;
  });
  // steps
  const PA = [26.4, SCAN.up, SCAN.play];
  c.pill.forEach((p, i) => {
    const on = t >= PA[i] && (i === 2 || t < PA[i + 1]), done = i < 2 && t >= PA[i + 1];
    p.className = 'pill' + (on ? ' on' : done ? ' done' : '');
    const f = t >= PA[i] ? Math.exp(-(t - PA[i]) * 5) : 0;
    p.style.transform = `scale(${(1 + f * .08).toFixed(3)})`;
  });
  setT(c.pills, { y: lerp(20, 0, E.outCubic(prog(t, 26.3, 26.9))), o: win(t, 26.3, 35.8, .5, .3) });
  show(c.note, win(t, 27, 35.8, .5, .3));
});

// ----------------------------------------------------------------- 02 ticket: one purchase opens every guide (36–41)
const GUIDES = [['STORY 01', '谷に眠る物語', 'miyoshi_iya_autumn'], ['STORY 02', '街の成り立ち', 'miyoshi_village'], ['STORY 03', '産業が生まれた理由', 'miyoshi_ochiai'],
  ['STORY 04', '受け継がれた文化', 'miyoshi_thatch'], ['ROUTE', '街を巡るおすすめルート', 'miyoshi_iya_observatory'], ['MAP', '周辺の食・宿・土産・体験', 'miyoshi_oboke_boat']];
const PAY = { tap: 38.2, done: 38.7, open: 39.0 };
scene(36, 41, n => {
  const c = {};
  washi(n);
  c.head = stepHead(n, '02 TICKET', '続きは、ガイドチケットで。', '無料で入口を体験　→　チケットを購入　→　街全体のガイドがひらく');
  c.ph = phone(n, 0, 0, { app: 'IDO　物語ガイド' });
  c.ph.bar.querySelector('.dot').outerHTML = '<span class="seal">旅</span>';
  c.ph.root.style.transformOrigin = '0 0';
  const Sc = c.ph.screen;
  c.tk = el('div', 'abs', Sc); box(c.tk, 0, 134, 392, 698);
  c.tk.innerHTML = `<div style="position:absolute;left:18px;right:18px;top:24px;border-radius:18px;background:#fff;box-shadow:0 10px 30px rgba(29,27,24,.08);padding:22px">
      <div style="font:600 12px LATIN;letter-spacing:.2em;color:${SHU}">GUIDE TICKET</div>
      <div style="font:700 26px SERIF;margin-top:8px;color:${SUMI}">ガイドチケット</div>
      <div style="font:500 15px/1.8 SANS;color:#5f584d;margin-top:8px">街全体の動画ガイドと<br>おすすめルートが見放題に</div>
      <div style="display:flex;gap:10px;margin-top:16px;font:600 13px SANS;color:#5f584d"><span>● 動画ガイド</span><span>● ルート</span><span>● 周辺情報</span></div></div>
    <div class="btn" style="position:absolute;left:18px;right:18px;top:300px;height:64px;border-radius:32px;background:${SUMI};color:#fff;display:grid;place-items:center;font:700 19px SANS">購入する</div>
    <div class="done" style="position:absolute;left:18px;right:18px;top:390px;height:120px;border-radius:18px;background:#fff;display:flex;align-items:center;gap:16px;padding:0 22px;box-shadow:0 10px 30px rgba(29,27,24,.08)"></div>`;
  c.tkBtn = c.tk.querySelector('.btn'); c.tkDone = c.tk.querySelector('.done');
  c.tkDone.appendChild(icon('check', 40, SHU)); el('div', '', c.tkDone, `<div style="font:700 19px SANS;color:${SUMI}">購入が完了しました</div><div style="font:500 14px SANS;color:#5f584d;margin-top:4px">すべてのガイドが見られます</div>`);
  c.ripple = el('div', 'abs', c.tk); box(c.ripple, 196 - 30, 332 - 30, 60, 60); place(c.ripple, { borderRadius: '50%', background: 'rgba(255,255,255,.5)' });
  c.finger = el('div', 'abs', n); box(c.finger, 0, 0, 44, 44); place(c.finger, { borderRadius: '50%', background: 'rgba(29,27,24,.18)', border: '2px solid rgba(29,27,24,.35)' });
  // the guide shelf
  c.cnt = el('div', 'abs', n); box(c.cnt, 640, 296); place(c.cnt, { font: '600 18px SANS', color: SUMI, letterSpacing: '.06em' });
  c.cards = GUIDES.map(([k, s, img], i) => {
    const x = 640 + (i % 3) * 392, y = 340 + Math.floor(i / 3) * 316;
    const d = el('div', 'gcard', n); box(d, x, y, 370, 290);
    d.innerHTML = `<div class="th"><img src="../assets/img/${img}.jpg"><div class="veil"></div></div><div class="k">${k}</div><div class="s">${s}</div>`;
    const lk = el('div', 'lk', d); lk.appendChild(icon('lock', 40, '#fff'));
    const ul = el('div', 'lk', d); ul.appendChild(icon('unlock', 40, '#fff'));
    const badge = el('div', 'free', d, i ? 'ひらきました' : '無料で視聴済み');
    return { d, img: d.querySelector('img'), veil: d.querySelector('.veil'), lk, ul, badge };
  });
  return c;
}, (t, c, n) => {
  enterUp(c.cards[0].d.parentNode, t, 36, .5);
  headIn(c.head, t, 36.1, 41.2);
  c.ph.root.style.transform = `translate(${M}px, ${lerp(380, 300, E.outCubic(prog(t, 36.1, 36.9))).toFixed(1)}px) scale(.78)`;
  const press = t >= PAY.tap && t < PAY.tap + .35;
  c.tkBtn.style.transform = `scale(${press ? .96 : 1})`;
  const rp = prog(t, PAY.tap, PAY.tap + .6);
  c.ripple.style.transform = `scale(${1 + rp * 6})`; c.ripple.style.opacity = t >= PAY.tap ? (1 - rp) * .8 : 0;
  pop(c.tkDone, t, PAY.done, { dy: 20 });
  // a fingertip taps the button
  const fx = M + (14 + 196) * .78 - 22, fy = 300 + (14 + 134 + 332) * .78 - 22;
  const fin = E.inOutCubic(prog(t, 37.4, PAY.tap));
  c.finger.style.transform = `translate(${(fx + 60 * (1 - fin)).toFixed(1)}px, ${(fy + 120 * (1 - fin)).toFixed(1)}px) scale(${press ? .85 : 1})`;
  show(c.finger, win(t, 37.3, PAY.tap + .6, .25, .3));
  let open = 1;
  c.cards.forEach(({ d, img, veil, lk, ul, badge }, i) => {
    pop(d, t, 36.4 + i * .08, { dy: 24 });
    const a = i ? PAY.open + (i - 1) * .3125 : 0;
    const u = i ? E.outCubic(prog(t, a, a + .45)) : 1;
    if (i && t >= a) open++;
    img.style.filter = `grayscale(${(1 - u).toFixed(2)}) blur(${((1 - u) * 4).toFixed(1)}px)`;
    veil.style.opacity = ((1 - u) * .55).toFixed(3);
    show(lk, i ? 1 - clamp(u * 3) : 0);
    const f = i && t >= a ? Math.exp(-(t - a) * 3.5) : 0;
    show(ul, i ? f : 0); ul.style.transform = `scale(${(1 + (1 - f) * .3).toFixed(3)})`;
    d.style.boxShadow = `0 14px 34px rgba(29,27,24,.10), 0 0 0 ${(f * 4).toFixed(2)}px rgba(184,65,44,.8)`;
    show(badge, i ? E.outCubic(prog(t, a + .1, a + .4)) * (1 - E.inCubic(prog(t, a + 1.2, a + 1.5))) : E.outCubic(prog(t, 36.8, 37.2)));
  });
  c.cnt.innerHTML = `ひらいたガイド　<span style="font:300 30px LATIN;color:${SHU}">${open}</span> / 6`;
  show(c.cnt, E.outCubic(prog(t, 36.6, 37.0)));
});

// ----------------------------------------------------------------- 03 walk: a QR at every stop along the route (41–51)
const ROUTE = 'M 260 820 C 420 760 520 640 700 620 S 980 700 1080 560 S 1260 330 1460 360 S 1700 300 1760 220';
const STOPS = [[260, 820, 'STORY 01', '谷に眠る物語', 'miyoshi_iya_autumn', [300, 862]], [700, 620, 'STORY 02', '街の成り立ち', 'miyoshi_village', [560, 454]],
  [1080, 560, 'STORY 03', '産業が生まれた理由', 'miyoshi_ochiai', [1110, 604]], [1460, 360, 'STORY 04', '受け継がれた文化', 'miyoshi_thatch', [1486, 404]], [1760, 220, 'GOAL', '', '', null]];
const SC = [42.25, 44.125, 46.0, 47.875, 49.75];      // a scan every three beats
scene(41, 51, n => {
  const c = {};
  washi(n);
  const svg = S('svg', { width: W, height: H }); svg.style.cssText = 'position:absolute;left:0;top:0'; n.appendChild(svg);
  const g = S('g', { fill: 'none', stroke: 'rgba(29,27,24,.10)', 'stroke-width': 1.2 }, svg);
  for (let i = 0; i < 6; i++) S('path', { d: `M -40 ${260 + i * 40} C 400 ${140 + i * 36} 800 ${420 + i * 30} 1200 ${220 + i * 38} S 1800 ${120 + i * 42} 1980 ${200 + i * 40}` }, g);
  for (let i = 0; i < 4; i++) S('path', { d: `M -40 ${900 + i * 36} C 500 ${980 - i * 20} 900 ${820 - i * 30} 1400 ${960 - i * 24} S 1900 ${880 - i * 30} 1980 ${900 - i * 20}` }, g);
  S('path', { d: 'M -20 700 C 300 640 420 900 760 860 S 1200 700 1500 760 S 1850 640 1960 600', fill: 'none', stroke: '#9fb7c4', 'stroke-width': 26, 'stroke-linecap': 'round', opacity: .55 }, svg);
  c.plan = S('path', { d: ROUTE, fill: 'none', stroke: 'rgba(184,65,44,.28)', 'stroke-width': 3, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round' }, svg);
  c.route = S('path', { d: ROUTE, fill: 'none', stroke: SHU, 'stroke-width': 5, 'stroke-dasharray': '14 10', 'stroke-linecap': 'round' }, svg);
  c.stops = STOPS.map(([x, y, k, s, img, cp], i) => {
    const m = el('div', 'stop' + (k === 'GOAL' ? ' goal' : ''), n); box(m, x - 26, y - 26, 52, 52);
    m.innerHTML = k === 'GOAL' ? '<b>GOAL</b>' : `<img src="${QR}"><i class="ck"></i>`;
    const lab = el('div', 'abs', n, k); box(lab, x - 60, y + 32, 120); place(lab, { textAlign: 'center', font: '600 12px LATIN', letterSpacing: '.2em', color: SHU });
    const pulse = el('div', 'abs', n); box(pulse, x - 40, y - 40, 80, 80); place(pulse, { borderRadius: '50%', border: `3px solid ${SHU}` });
    let card = null;
    if (cp) {
      card = el('div', 'scard', n); box(card, cp[0], cp[1], 320, 100);
      card.innerHTML = `<img src="../assets/img/${img}.jpg"><div><div class="k">${k}　<span>▶ 再生中</span></div><div class="s">${s}</div></div>`;
    }
    return { m, lab, pulse, card, x, y };
  });
  const POI = [[520, 740, 'heart', '食べる'], [880, 700, 'leaf', '体験する'], [1240, 500, 'pin', '泊まる'], [1650, 560, 'ticket', '買う'], [420, 560, 'heart', '食べる'], [1380, 780, 'leaf', '体験する']];
  c.pois = POI.map(([x, y, ic, s]) => {
    const d = el('div', 'poi', n); box(d, x - 20, y - 20);
    d.appendChild(icon(ic, 22, SUMI)); el('span', '', d, s); return d;
  });
  c.me = el('div', 'me', n); c.me.appendChild(icon('walk', 30, '#fff'));
  c.head = stepHead(n, '03 WALK', '街を歩き、次の場所でも物語を。', 'スポットごとのQRで、その場所の物語が再生される。<br>道中の食・宿・土産・体験も、地図から。');
  c.svg = svg;
  return c;
}, (t, c) => {
  enterUp(c.svg.parentNode, t, 41, .5);
  headIn(c.head, t, 41.1, 51.2);
  if (!c.len) {                                     // path lengths at each stop (measured once, on the first visible frame)
    c.len = c.route.getTotalLength();
    c.at = STOPS.map(([x, y]) => {
      let best = 0, bd = 1e9;
      for (let k = 0; k <= 600; k++) { const p = c.route.getPointAtLength(c.len * k / 600); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = c.len * k / 600; } }
      return best;
    });
  }
  let s = c.at[0];
  for (let i = 0; i < SC.length - 1; i++) if (t >= SC[i] + .6) s = lerp(c.at[i], c.at[i + 1], E.inOutSine(prog(t, SC[i] + .6, SC[i + 1] - .05)));
  const P = c.route.getPointAtLength(s);
  const done = s / c.len;
  c.route.style.clipPath = `inset(0 ${((1 - (P.x - 260) / 1500) * 100).toFixed(2)}% 0 0)`;
  show(c.plan, E.outCubic(prog(t, 41.3, 41.9)));
  c.me.style.transform = `translate(${(P.x - 30).toFixed(1)}px, ${(P.y - 76).toFixed(1)}px)`;
  show(c.me, E.outCubic(prog(t, 41.7, 42.1)));
  void done;
  c.stops.forEach(({ m, lab, pulse, card }, i) => {
    pop(m, t, 41.3 + i * .12, { dy: 0, s0: .3 });
    show(lab, E.outCubic(prog(t, 41.4 + i * .12, 41.8 + i * .12)));
    const a = SC[i];
    const ph = prog(t, a, a + .7);
    pulse.style.transform = `scale(${(.6 + ph * 1.2).toFixed(3)})`; pulse.style.opacity = t >= a ? ((1 - ph) * .9).toFixed(3) : 0;
    m.classList.toggle('done', t >= a + .15);
    if (card) {
      const pin = E.outBack(prog(t, a + .1, a + .5)), pout = E.inCubic(prog(t, a + 1.5, a + 1.8));
      card.style.opacity = (clamp(pin) * (1 - pout)).toFixed(3); card.style.visibility = t >= a + .1 && pout < 1 ? 'visible' : 'hidden';
      card.style.transform = `scale(${(lerp(.6, 1, clamp(pin)) * (1 - pout * .5)).toFixed(3)})`;
    }
  });
  c.pois.forEach((d, i) => pop(d, t, 44.5 + i * .625, { dy: 14, s0: .8 }));
});

// ----------------------------------------------------------------- 04 languages (51–56)
const LANGS = [['日本語', 'この谷には、いまも古い物語が眠っている。', '谷に眠る物語', 'この土地の歴史と文化を、短い動画でたどる。'],
  ['English', 'An old story still sleeps in this valley.', 'A story in the valley', 'Trace the history and culture of this place in short video stories.']];
scene(51, 56, n => {
  const c = {};
  washi(n);
  c.head = { s: (() => { const x = el('div', 'abs step', n, '04 LANGUAGES'); box(x, M, 300); return x; })(), h: mincho(n, ['言葉の壁を越えて、', '街の物語を世界へ。'], M, 340, 60),
    d: subT(n, '動画・音声・字幕・地図情報を多言語で。<br>専属ガイドを手配しなくても、同じ品質で歴史と文化を。', M, 560, 780) };
  c.langs = el('div', 'abs', n); box(c.langs, M, 700); place(c.langs, { display: 'flex', alignItems: 'center', gap: '12px' });
  c.globe = icon('globe', 40, SHU); c.langs.appendChild(c.globe);
  c.chips = ['日本語', 'English', 'ほか多言語'].map(s => el('span', 'lchip', c.langs, s));
  c.subcard = el('div', 'abs subcard', n); box(c.subcard, M, 790, 860, 120);
  c.subk = el('div', 'k', c.subcard, 'SUBTITLE'); c.subA = el('div', 'tx', c.subcard); c.subB = el('div', 'tx', c.subcard);
  c.ph = phone(n, 1270, 110, { app: 'IDO　物語ガイド' });
  c.ph.bar.querySelector('.dot').outerHTML = '<span class="seal">旅</span>';
  const Sc = c.ph.screen;
  c.vid = el('div', 'abs', Sc); box(c.vid, 18, 152, 356, 250); place(c.vid, { borderRadius: '16px', overflow: 'hidden' });
  c.vid.innerHTML = `<img src="../assets/img/miyoshi_okuiya_bridge.jpg" style="width:100%;height:100%;object-fit:cover"><div class="s" style="position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff;font:600 15px SANS;text-shadow:0 1px 6px rgba(0,0,0,.8)"></div>`;
  c.vimg = c.vid.querySelector('img'); c.sub = c.vid.querySelector('.s');
  c.tog = el('div', 'abs', Sc); box(c.tog, 98, 430, 196, 52);
  place(c.tog, { borderRadius: '26px', background: '#ece5d8', display: 'flex', font: '700 17px LATIN' });
  c.tog.innerHTML = `<span class="ja" style="flex:1;display:grid;place-items:center;border-radius:26px">JA</span><span class="en" style="flex:1;display:grid;place-items:center;border-radius:26px">EN</span>`;
  c.title = el('div', 'abs', Sc); box(c.title, 22, 510, 350); place(c.title, { font: '700 22px SERIF', color: SUMI });
  c.desc = el('div', 'abs', Sc); box(c.desc, 22, 556, 350); place(c.desc, { font: '500 15px/1.8 SANS', color: '#5f584d' });
  return c;
}, (t, c) => {
  enterUp(c.langs.parentNode, t, 51, .6);
  show(c.head.s, win(t, 51.2, 56, .35, .3));
  revealLines(c.head.h, t, 51.3, { stag: .2, out: 55.6, outDur: .35 });
  setT(c.head.d, { y: lerp(10, 0, E.outCubic(prog(t, 51.8, 52.3))), o: win(t, 51.8, 56, .45, .3) });
  setT(c.langs, { y: lerp(10, 0, E.outCubic(prog(t, 52.0, 52.5))), o: win(t, 52.0, 56, .45, .3) });
  c.globe.style.transform = `rotate(${(t * 40).toFixed(1)}deg)`;
  const k = Math.floor((t - 51) / 1.25) % 2, kt = 51 + Math.floor((t - 51) / 1.25) * 1.25;
  const L = LANGS[k];
  c.chips.forEach((ch, i) => { ch.className = 'lchip' + (i === k ? ' on' : ''); });
  c.sub.textContent = L[1]; c.title.textContent = L[2]; c.desc.textContent = L[3];
  c.tog.querySelector('.ja').style.cssText += `;background:${k ? 'transparent' : SUMI};color:${k ? '#8a8276' : '#fff'}`;
  c.tog.querySelector('.en').style.cssText += `;background:${k ? SUMI : 'transparent'};color:${k ? '#fff' : '#8a8276'}`;
  // the big subtitle card rolls to the new language
  const sw = E.outCubic(prog(t, kt, kt + .4));
  c.subA.textContent = L[1]; c.subB.textContent = LANGS[1 - k][1];
  c.subA.style.transform = `translateY(${((1 - sw) * 40).toFixed(1)}px)`; c.subA.style.opacity = sw.toFixed(3);
  c.subB.style.transform = `translateY(${(-sw * 40).toFixed(1)}px)`; c.subB.style.opacity = t < 52.25 ? 0 : (1 - sw).toFixed(3);
  setT(c.subcard, { y: lerp(10, 0, E.outCubic(prog(t, 52.2, 52.7))), o: win(t, 52.2, 56, .45, .3) });
  c.vimg.style.transform = `scale(${(1.04 + (t - 51) * .012).toFixed(4)})`;
  const pin = E.outCubic(prog(t, 51.3, 52.1));
  c.ph.root.style.transform = `translateX(${lerp(140, 0, pin).toFixed(1)}px)`; c.ph.root.style.opacity = pin;
});

// montage 56–66: each photo is a different place in the town
const PLACES = [['miyoshi_kazura_walk', '祖谷のかずら橋'], ['miyoshi_oboke', '大歩危'], ['miyoshi_oboke_boat', '大歩危の遊覧船'], ['miyoshi_koboke', '小歩危'],
  ['miyoshi_thatch', '落合集落'], ['miyoshi_village', '祖谷の山里'], ['miyoshi_upper_iya', '奥祖谷'], ['miyoshi_okuiya_bridge', '奥祖谷二重かずら橋']];
scene(56, 66, n => {
  const c = {};
  c.m = PLACES.map(([p]) => cine(n, p));
  c.s = el('div', 'scrim-b', n);
  c.tops = el('div', 'abs', n); box(c.tops, 0, 0, W, 260); c.tops.style.background = 'linear-gradient(180deg, rgba(12,14,18,.55), rgba(12,14,18,0))';
  c.tag = el('div', 'abs', n); box(c.tag, M, 110); place(c.tag, { display: 'flex', alignItems: 'center', gap: '14px', font: '600 30px SERIF', color: '#f3eee4' });
  c.pin = icon('pin', 34, '#e5a291'); c.tag.appendChild(c.pin); c.tagT = el('span', '', c.tag);
  c.tagS = el('div', 'abs label', n, 'Miyoshi, Tokushima'); box(c.tagS, M + 48, 160); c.tagS.style.color = 'rgba(243,238,228,.6)';
  c.dots = el('div', 'abs', n); box(c.dots, M + 48, 196); place(c.dots, { display: 'flex', gap: '10px' });
  c.dot = PLACES.map(() => { const d = el('i', '', c.dots); place(d, { width: '28px', height: '3px', borderRadius: '2px', background: 'rgba(243,238,228,.3)' }); return d; });
  c.t1 = lines(n, ['見る観光から、', '物語をたどる観光へ。'], { left: M + 'px', top: '760px', fontSize: '64px', color: '#f3eee4', lineHeight: 1.45 }, 'mincho');
  c.t2 = lines(n, ['一つの名所で終わらず、', '街全体へ人の流れを。'], { left: M + 'px', top: '760px', fontSize: '64px', color: '#f3eee4', lineHeight: 1.45 }, 'mincho');
  return c;
}, (t, c) => {
  const i0 = clamp(Math.floor((t - 56) / 1.25), 0, PLACES.length - 1);
  c.m.forEach((p, i) => { const a = 56 + i * 1.25; show(p, t >= a && t < a + 1.25 ? 1 : 0); kb(p, t, a, a + 1.25, { s0: 1.07, s1: 1.02 }); });
  const a = 56 + i0 * 1.25, e = E.outCubic(prog(t, a, a + .4));
  c.tagT.textContent = PLACES[i0][1];
  setT(c.tag, { x: (1 - e) * -16, o: e * win(t, 56.1, 65.8, .3, .4) });
  show(c.tagS, win(t, 56.3, 65.8, .4, .4));
  c.dot.forEach((d, i) => { d.style.background = i < i0 ? 'rgba(229,162,145,.9)' : i === i0 ? '#e5a291' : 'rgba(243,238,228,.3)'; d.style.transform = `scaleY(${i === i0 ? 1.8 : 1})`; });
  show(c.dots, win(t, 56.3, 65.8, .4, .4));
  revealLines(c.t1, t, 56.3, { stag: .3, out: 60.6, outDur: .4 }); if (t > 61) show(c.t1, 0);
  revealLines(c.t2, t, 61.3, { stag: .3, out: 65.5, outDur: .45 }); if (t < 61.3) show(c.t2, 0);
});

// ================================================================= Act 3 — return (66–100)
const CYC = [['ガイドチケットを購入', 'ticket'], ['地域の物語を体験', 'play'], ['街を巡る', 'walk'], ['売上の一部を地域へ還元', 'heart'], ['文化・観光資源を保全', 'leaf']];
scene(66, 78, n => {
  const c = {};
  washi(n);
  c.st = el('div', 'abs step', n, 'Local value cycle'.toUpperCase()); box(c.st, M, 360);
  c.h = mincho(n, ['旅を楽しむことが、', '街を守ることにつながる。'], M, 400, 60);
  c.d = subT(n, 'ガイドチケットの売上の一部を地域へ還元。<br>訪れる人の体験が、文化や観光資源を<br>次の世代へ残す力になる。', M, 620, 700);
  const cx = 1340, cy = 540, R = 290;
  Object.assign(c, { cx, cy, R });
  c.svg = S('svg', { width: W, height: H }); c.svg.style.cssText = 'position:absolute;left:0;top:0'; n.appendChild(c.svg);
  S('circle', { cx, cy, r: R, fill: 'none', stroke: 'rgba(29,27,24,.14)', 'stroke-width': 1 }, c.svg);
  c.L = 2 * Math.PI * R;
  c.arc = S('circle', { cx, cy, r: R, fill: 'none', stroke: SHU, 'stroke-width': 3, 'stroke-dasharray': c.L, 'stroke-dashoffset': c.L, transform: `rotate(-90 ${cx} ${cy})` }, c.svg);
  c.flow = [0, 1, 2, 3].map(() => S('circle', { r: 6, fill: SHU }, c.svg));
  c.inflow = [0, 1, 2].map(() => S('circle', { r: 5, fill: 'rgba(184,65,44,.8)' }, c.svg));
  c.center = el('div', 'abs mincho', n, '地域の<br>未来へ'); box(c.center, cx - 100, cy - 50, 200); place(c.center, { textAlign: 'center', fontSize: '36px', lineHeight: 1.5, color: SUMI });
  c.halo = el('div', 'abs', n); box(c.halo, cx - 110, cy - 110, 220, 220); place(c.halo, { borderRadius: '50%', background: 'radial-gradient(circle, rgba(184,65,44,.14), rgba(184,65,44,0) 70%)' });
  c.nodes = CYC.map(([s, ic], i) => {
    const a = (-90 + i * 72) * Math.PI / 180, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    const d = el('div', 'cnode', n); box(d, x - 34, y - 34, 68, 68); d.appendChild(icon(ic, 30, SHU));
    const tx = el('div', 'abs', n);
    const inner = el('div', '', tx, `<span style="font:600 13px LATIN;letter-spacing:.2em;color:${SHU}">0${i + 1}</span><br><span style="font:600 22px SERIF;color:${SUMI}">${s}</span>`);
    const right = Math.cos(a) > .2, left = Math.cos(a) < -.2;
    const lower = Math.sin(a) > .3;
    box(tx, right ? x + 46 : left ? x - 46 : x, y + (i === 0 ? -100 : lower ? 40 : -24));
    tx.style.transform = left ? 'translateX(-100%)' : right ? '' : 'translateX(-50%)';
    tx.style.textAlign = left ? 'right' : right ? 'left' : 'center';
    tx.style.whiteSpace = 'nowrap';
    return { d, tx: inner, x, y };
  });
  return c;
}, (t, c) => {
  show(c.st, win(t, 66.2, 78, .4, .4));
  revealLines(c.h, t, 66.3, { stag: .25, out: 77.4, outDur: .5 });
  setT(c.d, { y: lerp(10, 0, E.outCubic(prog(t, 67.2, 67.8))), o: win(t, 67.2, 78, .6, .5) });
  const drawn = E.inOutSine(prog(t, 67.6, 75.2));
  c.arc.setAttribute('stroke-dashoffset', (c.L * (1 - drawn)).toFixed(1));
  const out = 1 - E.inCubic(prog(t, 77.4, 77.9));
  c.flow.forEach((f, k) => {                        // tokens travel the drawn part of the ring, then keep circling
    const u = ((t - 67.6) * .16 + k * .25) % 1;
    const lim = drawn < 1 ? drawn : 1;
    const uu = drawn < 1 ? u * lim : u;
    const ang = -Math.PI / 2 + uu * Math.PI * 2;
    f.setAttribute('cx', (c.cx + Math.cos(ang) * c.R).toFixed(1)); f.setAttribute('cy', (c.cy + Math.sin(ang) * c.R).toFixed(1));
    f.setAttribute('opacity', (t > 67.8 ? out * .9 : 0).toFixed(3));
  });
  const n4 = c.nodes[3];                            // value flows from 「地域へ還元」 into the centre
  c.inflow.forEach((f, k) => {
    const u = ((t - 73) * .7 + k / 3) % 1;
    f.setAttribute('cx', lerp(n4.x, c.cx, u).toFixed(1)); f.setAttribute('cy', lerp(n4.y, c.cy, u).toFixed(1));
    f.setAttribute('opacity', (t > 73.6 ? Math.sin(Math.PI * u) * out : 0).toFixed(3));
  });
  c.nodes.forEach(({ d, tx }, i) => {
    const a = 67.6 + i * 1.6;
    pop(d, t, a, { dy: 0, s0: .3, out: 77.5, outDur: .4 }); pop(tx, t, a + .1, { out: 77.5, outDur: .4 });
    const f = t >= a ? Math.exp(-(t - a) * 3) : 0;
    d.style.boxShadow = `0 10px 26px rgba(29,27,24,.12), 0 0 0 ${(f * 14).toFixed(1)}px rgba(184,65,44,${(f * .25).toFixed(3)})`;
  });
  pop(c.center, t, 75.4, { out: 77.5, outDur: .4 });
  show(c.halo, E.outCubic(prog(t, 75.4, 76)) * out * (.75 + .25 * Math.sin(t * 3)));
});

let SHIKOKU = null;
hooks.preload.push(async () => { SHIKOKU = await fetch('../assets/shikoku.json').then(r => r.json()); });
scene(78, 86, n => {
  const c = {};
  c.p1 = cine(n, 'miyoshi_thatch'); c.p2 = cine(n, 'miyoshi_upper_iya');
  c.s = el('div', 'scrim-b', n);
  c.glow = el('div', 'abs', n); box(c.glow, 1000, 0, 920, 760); c.glow.style.background = 'radial-gradient(ellipse at 60% 45%, rgba(12,14,18,.62), rgba(12,14,18,0) 70%)';
  c.map = el('div', 'abs', n); box(c.map, 1180, 110, 608, 462);
  c.st = el('div', 'abs step', n, 'CASE'); box(c.st, M, 640); c.st.style.color = '#e5a291';
  c.h = lines(n, ['徳島県三好市で展開。'], { left: M + 'px', top: '680px', fontSize: '72px', color: '#f3eee4' }, 'mincho');
  c.d = subT(n, '地域に残る歴史と文化を、動画ストーリーと街歩きで体験できる<br>デジタル観光ガイドとして。', M, 800, 1100, 'rgba(243,238,228,.8)', 24);
  c.d2 = lines(n, ['大きな設備を増やさず、街全体を観光体験に。'], { left: M + 'px', top: '800px', fontSize: '44px', color: '#f3eee4' }, 'mincho');
  return c;
}, (t, c) => {
  if (!c.built && SHIKOKU) {                          // the map, built from Natural Earth outlines
    c.built = true;
    const sv = S('svg', { width: 608, height: 462, viewBox: `0 0 ${SHIKOKU.w} ${SHIKOKU.h}` }); c.map.appendChild(sv);
    c.ctx = S('g', {}, sv);
    SHIKOKU.ctx.forEach(d => S('path', { d, fill: 'rgba(243,238,228,.07)', stroke: 'rgba(243,238,228,.3)', 'stroke-width': 1 }, c.ctx));
    c.pref = Object.entries(SHIKOKU.pref).map(([k, d]) => S('path', { d, fill: k === 'tokushima' ? 'rgba(184,65,44,0)' : 'rgba(243,238,228,.12)', stroke: k === 'tokushima' ? '#e5a291' : 'rgba(243,238,228,.75)', 'stroke-width': k === 'tokushima' ? 2.4 : 1.4, 'data-k': k }, sv));
    const [mx, my] = SHIKOKU.miyoshi;
    c.pulse = S('circle', { cx: mx, cy: my, r: 10, fill: 'none', stroke: '#fff', 'stroke-width': 2 }, sv);
    c.pin = S('g', {}, sv);
    S('circle', { cx: mx, cy: my, r: 9, fill: SHU, stroke: '#fff', 'stroke-width': 3 }, c.pin);
    c.lab = el('div', 'abs', c.map, `<div style="font:600 30px SERIF;color:#fff">三好市</div><div style="font:500 13px LATIN;letter-spacing:.24em;color:rgba(243,238,228,.7);margin-top:4px">MIYOSHI, TOKUSHIMA</div>`);
    box(c.lab, mx * 608 / SHIKOKU.w - 250, my * 462 / SHIKOKU.h - 110, 240); c.lab.style.textAlign = 'right';
    c.shi = el('div', 'abs label', c.map, 'Shikoku'); box(c.shi, 300, 390); c.shi.style.color = 'rgba(243,238,228,.55)';
  }
  span(c.p1, t, 78, 82.2, .8, { s0: 1.1, s1: 1.03 }); span(c.p2, t, 82, 86, .6, { s0: 1.08, s1: 1.0 });
  show(c.s, 1);
  const mo = win(t, 78.2, 85.8, .5, .4);
  show(c.glow, mo); show(c.map, mo);
  if (c.built) {
    c.ctx.style.opacity = E.outCubic(prog(t, 78.3, 79.0));
    c.pref.forEach((p, i) => {
      if (!p._len) p._len = p.getTotalLength();
      const q = E.inOutCubic(prog(t, 78.4 + i * .15, 79.6 + i * .15));
      p.setAttribute('stroke-dasharray', `${p._len.toFixed(0)} ${p._len.toFixed(0)}`);
      p.setAttribute('stroke-dashoffset', (p._len * (1 - q)).toFixed(1));
      if (p.getAttribute('data-k') === 'tokushima') p.setAttribute('fill', `rgba(184,65,44,${(.5 * E.outCubic(prog(t, 79.5, 80.2))).toFixed(3)})`);
    });
    const pd = E.outBack(prog(t, 80.0, 80.5));
    c.pin.setAttribute('transform', `translate(0 ${((1 - clamp(pd)) * -40).toFixed(1)})`); c.pin.style.opacity = clamp(pd * 2);
    const ph = ((t - 80.4) % 1.4) / 1.4;
    c.pulse.setAttribute('r', (10 + ph * 34).toFixed(1)); c.pulse.style.opacity = t > 80.4 ? (1 - ph).toFixed(3) : 0;
    setT(c.lab, { x: (1 - E.outCubic(prog(t, 80.3, 80.8))) * 14, o: E.outCubic(prog(t, 80.3, 80.8)) });
    show(c.shi, E.outCubic(prog(t, 79.2, 79.8)));
  }
  show(c.st, win(t, 78.3, 85.8, .4, .3));
  revealLines(c.h, t, 78.4, { out: 85.4, outDur: .45 });
  setT(c.d, { o: win(t, 79.0, 82, .5, .4) });
  revealLines(c.d2, t, 82.3, { out: 85.4, outDur: .45 }); if (t < 82.3) show(c.d2, 0);
});

const CREDITS = [
  ['祖谷のかずら橋', 'Motokoka', 'CC BY-SA 4.0'], ['奥祖谷二重かずら橋', '京浜にけ', 'CC BY-SA 3.0'], ['祖谷渓', 'KimonBerlin', 'CC BY-SA 2.0'],
  ['祖谷渓（展望台）', 'Naokijp', 'CC BY-SA 4.0'], ['大歩危・小歩危', 'Naokijp', 'CC BY-SA 4.0'], ['大歩危の遊覧船', 'ブルーノ・プラス', 'CC BY-SA 4.0'],
  ['東祖谷落合', 'At by At', 'CC BY-SA 3.0'], ['落合集落', 'Motokoka', 'CC BY-SA 4.0'], ['かずら橋', 'ume-y', 'CC BY 2.0'],
];
scene(86, 100, n => {
  const c = {};
  washi(n);
  c.name = lines(n, ['IDO'], { left: M - 10 + 'px', top: '230px', fontSize: '200px', fontWeight: 200, letterSpacing: '.06em', color: SUMI }, 'latin');
  c.mean = el('div', 'abs mincho', n, '異土　・　移動　・　緯度　・　I do'); box(c.mean, M, 470); place(c.mean, { fontSize: '26px', color: 'rgba(29,27,24,.6)' });
  c.tag = mincho(n, ['文化を、体験へ。'], M, 530, 76);
  c.rule = el('div', 'hair ink', n); box(c.rule, M, 670, 600, 1);
  c.cta = subT(n, 'あなたの街に眠る物語を、新しい観光体験にしませんか。<br>自治体・観光施設・文化団体の皆さまと、歴史の発掘からストーリー制作、導入、運用まで。', M, 700, 1100, SUMI, 24);
  c.url = el('div', 'abs latin', n, 'nextmake.site/nm-ido'); box(c.url, M, 820); place(c.url, { fontSize: '22px', letterSpacing: '.24em', fontWeight: 500, color: SHU });
  c.logo = logo(n, 34, { left: M + 'px', top: '910px' }, { light: false });
  c.img = photo(n, 'ido_journey', [1240, 180, 560, 700], { raw: true });
  c.seal = el('div', 'abs', n, '旅'); box(c.seal, 1740, 840, 90, 90);
  place(c.seal, { background: SHU, color: '#fbf8f2', display: 'grid', placeItems: 'center', font: '600 52px SERIF', borderRadius: '8px', transform: 'rotate(-4deg)' });
  // credits
  c.cr = el('div', 'fill', n);
  const cw = washi(c.cr); void cw;
  const list = CREDITS.map(([a, b, l]) => `${a}　Photo: ${b} / ${l}`).join('<br>');
  c.crT = el('div', 'abs credit', c.cr, `<div class="step" style="margin-bottom:16px">Photo credits</div>${list}<br><br>写真（三好市の風景）：Wikimedia Commons より、各ライセンスに基づき使用（トリミング・色調補正あり）。<br>IDOのイメージ画像：株式会社ネクストメイク　／　※画面はイメージです。`);
  box(c.crT, M, 220, 1400); c.crT.style.fontSize = '17px';
  return c;
}, (t, c) => {
  revealLines(c.name, t, 86.2, { dur: 1.1 });
  show(c.mean, E.outCubic(prog(t, 86.9, 87.6)));
  revealLines(c.tag, t, 87.2, { dur: 1.0 });
  drawLine(c.rule, t, 87.9, 1.0);
  setT(c.cta, { y: lerp(10, 0, E.outCubic(prog(t, 88.3, 88.9))), o: E.outCubic(prog(t, 88.3, 88.9)) });
  show(c.url, E.outCubic(prog(t, 89.0, 89.6)));
  buildLogo(c.logo, t, 89.4, { dur: 1.0 });
  wipe(c.img, t, 86.4, 1.2, 'up', E.inOutQuart); kb(c.img, t, 86, 95, { s0: 1.1, s1: 1.02 });
  const sp = E.outBack(prog(t, 90.2, 90.8));
  c.seal.style.transform = `rotate(-4deg) scale(${lerp(1.6, 1, clamp(sp)).toFixed(3)})`; c.seal.style.opacity = clamp(sp * 1.4);
  show(c.cr, E.inOutSine(prog(t, 95.0, 95.6)));
});

// ================================================================= HUD, letterbox-free, fades
const hud = $('#hud'), tl = hud.querySelector('.tl'), tr = hud.querySelector('.tr');
tl.innerHTML = '<span class="label" style="font-size:12px">IDO — Story-driven journeys</span>';
hooks.after.push(t => {
  const ink = t < 26 || (t >= 56 && t < 66) || (t >= 78 && t < 86);
  show(hud, Math.min(1, win(t, 1, 25.2, .8, .5) + win(t, 26.5, 85.6, .5, .4)));
  tl.style.color = ink ? 'rgba(243,238,228,.7)' : 'rgba(29,27,24,.55)';
  tr.style.color = ink ? 'rgba(243,238,228,.55)' : 'rgba(29,27,24,.45)';
  tr.textContent = t < 26 ? 'Act I — 伝承' : t < 66 ? 'Act II — 旅' : 'Act III — 還る';
  $('#fade').style.opacity = E.inOutSine(prog(t, 98.6, 100)).toFixed(3);
  $('#vignette').style.opacity = ink ? .9 : .25;
});

film({ duration: 100, fps: 30, audio: '../assets/ido_score.mp3' });
})();
