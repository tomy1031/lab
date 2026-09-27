/* Promo — IDO（観光DX）「ひとつのQRから、街の物語がひらく。」 (100 s)
 * Act 1 (0–26)  legend: Miyoshi photographs, vertical Mincho, the four meanings of IDO   [score cue A: koto / shakuhachi / taiko]
 * Act 2 (26–66) journey: QR → preview → ticket → unlock → walk → languages → montage     [cue B: 96 BPM wa-modern, 2 bars per step]
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

// ================================================================= Act 2 — journey (26–66), 96 BPM: bar 2.5 s, 2 bars per step
const STEPS = [
  ['01 Scan', 'QRコードを読み取る', 'アプリのインストールは不要。<br>観光地のQRから、その場所の物語へ。'],
  ['02 Preview', '物語の一部を、無料で見る', '短い動画ガイドで、<br>歴史ストーリーの入口を体験。'],
  ['03 Ticket', 'ガイドチケットを購入', '続きは、WEB上で<br>安全かつ簡単に。'],
  ['04 Unlock', 'すべてのガイドがひらく', '街全体の観光地を巡る<br>動画ガイドとルートが開放される。'],
];
scene(26, 46, n => {
  const c = {};
  washi(n);
  c.photo = photo(n, 'miyoshi_kazura_people', [M, 150, 900, 640]);
  c.photo._img.style.filter = 'saturate(.85)';
  c.alts = [['miyoshi_iya_autumn', '祖谷渓の紅葉（徳島県三好市）'], ['miyoshi_oboke_boat', '大歩危の遊覧船（徳島県三好市）'], ['miyoshi_okuiya_bridge', '奥祖谷二重かずら橋（徳島県三好市）']]
    .map(([f, cap]) => { const p = photo(n, f, [M, 150, 900, 640]); p._img.style.filter = 'saturate(.85)'; p._cap = cap; return p; });
  c.sign = el('div', 'abs', n); box(c.sign, M + 620, 520, 200, 250);
  place(c.sign, { background: '#6b4a2f', borderRadius: '6px', boxShadow: '0 20px 40px rgba(0,0,0,.35)', padding: '18px', color: '#f3eee4', textAlign: 'center', font: '600 16px SERIF' });
  c.sign.innerHTML = `<div style="background:#fff;padding:8px;border-radius:4px"><img src="${QR}" style="width:148px;height:148px;display:block"></div><div style="margin-top:12px;letter-spacing:.2em">物語を見る</div>`;
  c.cap = el('div', 'abs cap', n, '祖谷のかずら橋（徳島県三好市）'); box(c.cap, M, 804); c.cap.style.color = 'rgba(29,27,24,.6)';
  c.steps = STEPS.map(([s, h, d]) => ({ s: (() => { const x = el('div', 'abs step', n, s.toUpperCase()); box(x, M, 860); return x; })(),
    h: mincho(n, [h], M, 890, 48), d: subT(n, d, 1000, 890, 560, 'rgba(29,27,24,.7)', 21) }));
  // phone
  c.ph = phone(n, 1370, 110, { app: 'IDO　物語ガイド' });
  c.ph.bar.querySelector('.dot').outerHTML = '<span class="seal">旅</span>';
  const S = c.ph.screen;
  // scan view
  c.cam = el('div', 'abs', S); box(c.cam, 0, 134, 392, 698); c.cam.style.overflow = 'hidden';
  const camImg = el('img', '', c.cam); camImg.src = '../assets/img/miyoshi_kazura_people.jpg'; place(camImg, { width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(1px) brightness(.85)' });
  c.frame = el('div', 'abs', c.cam); box(c.frame, 96, 250, 200, 200);
  c.frame.innerHTML = ['0,0', '1,0', '0,1', '1,1'].map(p => { const [x, y] = p.split(','); return `<i style="position:absolute;${+x ? 'right' : 'left'}:0;${+y ? 'bottom' : 'top'}:0;width:40px;height:40px;border:4px solid #fff;${+x ? 'border-left' : 'border-right'}:none;${+y ? 'border-top' : 'border-bottom'}:none;border-radius:6px"></i>`; }).join('')
    + `<img src="${QR}" style="position:absolute;left:30px;top:30px;width:140px;height:140px;opacity:.95">`;
  c.scanline = el('div', 'abs', c.frame); box(c.scanline, 8, 0, 184, 3); c.scanline.style.background = SHU; c.scanline.style.boxShadow = `0 0 12px ${SHU}`;
  c.ok = el('div', 'abs', c.cam); box(c.ok, 46, 500, 300, 64);
  place(c.ok, { background: 'rgba(251,248,242,.95)', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 18px', font: '700 18px SANS', color: SUMI });
  c.ok.appendChild(icon('check', 28, SHU)); el('span', '', c.ok, '物語が見つかりました');
  // preview
  c.pv = el('div', 'abs', S); box(c.pv, 0, 134, 392, 698);
  c.pv.innerHTML = `<div style="position:absolute;left:18px;right:18px;top:18px;height:240px;border-radius:16px;overflow:hidden">
      <img src="../assets/img/miyoshi_iya_autumn.jpg" style="width:100%;height:100%;object-fit:cover">
      <div class="sub" style="position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff;font:600 15px SANS;text-shadow:0 1px 6px rgba(0,0,0,.7)"></div>
      <div style="position:absolute;left:12px;top:12px;background:${SHU};color:#fff;font:700 12px SANS;padding:5px 10px;border-radius:6px">無料プレビュー</div></div>
    <div style="position:absolute;left:18px;right:18px;top:270px;height:4px;background:rgba(29,27,24,.12);border-radius:2px"><i class="bar" style="position:absolute;left:0;top:0;bottom:0;background:${SHU};border-radius:2px"></i></div>
    <div style="position:absolute;left:22px;top:300px;font:600 12px LATIN;letter-spacing:.2em;color:#8a8276">STORY 01</div>
    <div style="position:absolute;left:22px;top:324px;font:700 22px SERIF;color:${SUMI}">谷に眠る物語</div>
    <div style="position:absolute;left:22px;top:368px;right:22px;font:500 15px/1.8 SANS;color:#5f584d">この土地の歴史と文化を、短い動画でたどる。続きはガイドチケットで。</div>`;
  c.pvSub = c.pv.querySelector('.sub'); c.pvBar = c.pv.querySelector('.bar');
  // ticket
  c.tk = el('div', 'abs', S); box(c.tk, 0, 134, 392, 698);
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
  // unlock list
  c.ul = el('div', 'abs', S); box(c.ul, 0, 134, 392, 698); c.ul.style.background = '#fbf8f2';
  const G = [['STORY 01', '谷に眠る物語'], ['STORY 02', '街の成り立ち'], ['STORY 03', '産業が生まれた理由'], ['STORY 04', '受け継がれた文化'], ['ROUTE', '街を巡るおすすめルート'], ['MAP', '周辺の食・宿・土産・体験']];
  c.items = G.map(([k, s]) => {
    const it = el('div', 'guide', c.ul); const ic = el('span', '', it); ic.appendChild(icon('lock', 26, '#9b9386'));
    const ic2 = el('span', '', it); ic2.appendChild(icon('unlock', 26, SHU)); ic2.style.display = 'none';
    el('div', '', it, `<span class="k">${k}</span>${s}`);
    return { it, ic, ic2 };
  });
  return c;
}, (t, c) => {
  const stepAt = [26, 31, 36, 41];
  c.steps.forEach(({ s, h, d }, i) => {
    const a = stepAt[i], b = a + 5;
    show(s, win(t, a + .05, b, .35, .3));
    revealLines(h, t, a + .15, { dur: .8, out: b - .4, outDur: .35 }); if (t < a || t > b) show(h, 0);
    setT(d, { y: lerp(10, 0, E.outCubic(prog(t, a + .4, a + .9))), o: win(t, a + .4, b, .45, .3) });
  });
  // left photo + sign: visible during scan, then fades a bit
  wipe(c.photo, t, 26.05, .9, 'up', E.inOutQuart); kb(c.photo, t, 26, 31.6, { s0: 1.06, s1: 1.0 });
  if (t >= 31.6) show(c.photo, 0);
  c.alts.forEach((p, i) => { const a = 31 + i * 5; if (t >= a && t < a + 5.6) { wipe(p, t, a, .8, 'left', E.inOutQuart); kb(p, t, a, a + 5.6, { s0: 1.08, s1: 1.0 }); } else show(p, 0); });
  pop(c.sign, t, 26.6, { dy: 30, out: 30.6, outDur: .5 });
  const ci = clamp(Math.floor((t - 26) / 5), 0, 3);
  c.cap.textContent = ci === 0 ? '祖谷のかずら橋（徳島県三好市）' : c.alts[ci - 1]._cap;
  show(c.cap, win(t, 26.8, 46, .5, .3));
  // phone slides in
  const pin = E.outCubic(prog(t, 26.2, 27.2));
  c.ph.root.style.transform = `translateX(${lerp(160, 0, pin).toFixed(1)}px)`; c.ph.root.style.opacity = pin;
  // scan 26–31
  const scan = t < 31;
  show(c.cam, scan ? 1 : 0);
  if (scan) {
    const ph = ((t - 26.8) % 1.2) / 1.2;
    c.scanline.style.transform = `translateY(${(ph * 194).toFixed(1)}px)`;
    show(c.scanline, t >= 26.8 && t < 28.8 ? 1 : 0);
    c.frame.style.transform = `scale(${t >= 28.8 ? 1 + .06 * Math.exp(-(t - 28.8) * 6) : 1})`;
    pop(c.ok, t, 28.9);
  }
  // preview 31–36
  const pv = t >= 31 && t < 36;
  if (pv) { wipe(c.pv, t, 31, .5, 'left', E.outQuart); } else show(c.pv, 0);
  c.pvBar.style.width = (100 * clamp((t - 31.4) / 4.4)).toFixed(1) + '%';
  const subs = ['かつてこの谷には、', '人々の暮らしと、', '受け継がれてきた物語がある。'];
  c.pvSub.textContent = t < 32.6 ? subs[0] : t < 34.0 ? subs[1] : subs[2];
  // ticket 36–41
  const tk = t >= 36 && t < 41;
  if (tk) wipe(c.tk, t, 36, .5, 'left', E.outQuart); else show(c.tk, 0);
  const press = t >= 38.2 && t < 38.6;
  c.tkBtn.style.transform = `scale(${press ? .96 : 1})`;
  const rp = prog(t, 38.2, 38.8);
  c.ripple.style.transform = `scale(${1 + rp * 6})`; c.ripple.style.opacity = t >= 38.2 ? (1 - rp) * .8 : 0;
  pop(c.tkDone, t, 38.7, { dy: 20 });
  // unlock 41–46
  const ul = t >= 41;
  if (ul) wipe(c.ul, t, 41, .5, 'left', E.outQuart); else show(c.ul, 0);
  c.items.forEach(({ it, ic, ic2 }, i) => {
    const a = 41.9 + i * .625;
    const open = t >= a;
    ic.style.display = open ? 'none' : 'inline-block'; ic2.style.display = open ? 'inline-block' : 'none';
    const f = open ? Math.exp(-(t - a) * 4) : 0;
    it.style.background = `rgba(184,65,44,${(f * .12).toFixed(3)})`;
    it.style.color = open ? SUMI : '#9b9386';
    ic2.style.transform = `scale(${1 + f * .3})`;
  });
  c.ph.root.style.opacity = pin * (1 - E.inOutSine(prog(t, 45.6, 46)));
});

// map 46–56 (walk + languages)
scene(46, 56, n => {
  const c = {};
  washi(n);
  c.svg = el('div', 'fill', n);
  const route = 'M 260 820 C 420 760 520 640 700 620 S 980 700 1080 560 S 1260 330 1460 360 S 1700 300 1760 220';
  c.svg.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <g fill="none" stroke="rgba(29,27,24,.10)" stroke-width="1.2">
      ${[0, 1, 2, 3, 4, 5].map(i => `<path d="M ${-40} ${260 + i * 40} C 400 ${140 + i * 36} 800 ${420 + i * 30} 1200 ${220 + i * 38} S 1800 ${120 + i * 42} 1980 ${200 + i * 40}"/>`).join('')}
      ${[0, 1, 2, 3].map(i => `<path d="M ${-40} ${900 + i * 36} C 500 ${980 - i * 20} 900 ${820 - i * 30} 1400 ${960 - i * 24} S 1900 ${880 - i * 30} 1980 ${900 - i * 20}"/>`).join('')}
    </g>
    <path d="M -20 700 C 300 640 420 900 760 860 S 1200 700 1500 760 S 1850 640 1960 600" fill="none" stroke="#9fb7c4" stroke-width="26" stroke-linecap="round" opacity=".55"/>
    <path class="route" d="${route}" fill="none" stroke="${SHU}" stroke-width="4" stroke-dasharray="12 10" stroke-linecap="round"/>
  </svg>`;
  c.route = c.svg.querySelector('.route');
  c.routeLen = 2100;
  const SP = [[260, 820, 'STORY 01'], [700, 620, 'STORY 02'], [1080, 560, 'STORY 03'], [1460, 360, 'STORY 04'], [1760, 220, 'GOAL']];
  c.spots = SP.map(([x, y, s]) => {
    const d = el('div', 'abs', n, `<div style="width:26px;height:26px;border-radius:50%;background:${SHU};border:4px solid #fbf8f2;box-shadow:0 4px 12px rgba(0,0,0,.2)"></div><div style="margin-top:8px;margin-left:-20px;font:600 12px LATIN;letter-spacing:.2em;color:${SHU}">${s}</div>`);
    box(d, x - 13, y - 13); return d;
  });
  const POI = [[520, 740, 'heart', '食べる'], [880, 700, 'leaf', '体験する'], [1240, 500, 'pin', '泊まる'], [1600, 420, 'ticket', '買う'], [420, 560, 'heart', '食べる'], [1330, 700, 'leaf', '体験する']];
  c.pois = POI.map(([x, y, ic, s]) => {
    const d = el('div', 'abs', n); box(d, x - 20, y - 20);
    place(d, { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px 8px 10px', borderRadius: '999px', background: '#fbf8f2', boxShadow: '0 6px 16px rgba(29,27,24,.12)', font: '600 16px SANS', color: SUMI });
    d.appendChild(icon(ic, 22, SUMI)); el('span', '', d, s); return d;
  });
  c.st = el('div', 'abs step', n, '05 WALK'); box(c.st, M, 110);
  c.h = mincho(n, ['物語の舞台を、歩く。'], M, 140, 56);
  c.chips = el('div', 'abs', n); box(c.chips, M, 250);
  ['食べる', '泊まる', '買う', '体験する'].forEach(s => el('span', 'chipw', c.chips, s));
  // languages panel
  c.lang = el('div', 'abs', n); box(c.lang, 0, 0, W, H);
  const L = washi(c.lang); L.style.opacity = .96;
  c.lst = el('div', 'abs step', c.lang, '06 LANGUAGES'); box(c.lst, M, 300);
  c.lh = mincho(c.lang, ['言葉の壁を越えて、', '街の物語を世界へ。'], M, 340, 60);
  c.ld = subT(c.lang, '動画・音声・字幕・地図情報を多言語で。<br>専属ガイドを手配しなくても、同じ品質で歴史と文化を。', M, 560, 780);
  c.ph = phone(c.lang, 1270, 110, { app: 'IDO　物語ガイド' });
  c.ph.bar.querySelector('.dot').outerHTML = '<span class="seal">旅</span>';
  const S = c.ph.screen;
  c.vid = el('div', 'abs', S); box(c.vid, 18, 152, 356, 250); place(c.vid, { borderRadius: '16px', overflow: 'hidden' });
  c.vid.innerHTML = `<img src="../assets/img/miyoshi_okuiya_bridge.jpg" style="width:100%;height:100%;object-fit:cover"><div class="s" style="position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff;font:600 15px SANS;text-shadow:0 1px 6px rgba(0,0,0,.8)"></div>`;
  c.sub = c.vid.querySelector('.s');
  c.tog = el('div', 'abs', S); box(c.tog, 98, 430, 196, 52);
  place(c.tog, { borderRadius: '26px', background: '#ece5d8', display: 'flex', font: '700 17px LATIN' });
  c.tog.innerHTML = `<span class="ja" style="flex:1;display:grid;place-items:center;border-radius:26px">JA</span><span class="en" style="flex:1;display:grid;place-items:center;border-radius:26px">EN</span>`;
  c.title = el('div', 'abs', S); box(c.title, 22, 510, 350); place(c.title, { font: '700 22px SERIF', color: SUMI });
  c.desc = el('div', 'abs', S); box(c.desc, 22, 556, 350); place(c.desc, { font: '500 15px/1.8 SANS', color: '#5f584d' });
  return c;
}, (t, c) => {
  const vm = t < 51;
  const dp = E.inOutSine(prog(t, 46.3, 50.4));
  c.route.setAttribute('stroke-dashoffset', '0');
  c.route.style.strokeDasharray = `12 10`;
  c.route.style.clipPath = `inset(0 ${(100 - dp * 100).toFixed(1)}% 0 0)`;
  c.spots.forEach((d, i) => pop(d, t, 46.5 + i * .8, { dy: 10, s0: .5 }));
  c.pois.forEach((d, i) => pop(d, t, 47.6 + i * .42, { dy: 14, s0: .8 }));
  show(c.st, win(t, 46.1, 51, .35, .3));
  revealLines(c.h, t, 46.2, { out: 50.6, outDur: .35 });
  show(c.chips, win(t, 47.0, 51, .5, .3));
  // languages 51–56
  const vl = t >= 51;
  if (vl) wipe(c.lang, t, 51, .6, 'up', E.outQuart); else show(c.lang, 0);
  show(c.lst, win(t, 51.2, 56, .35, .3));
  revealLines(c.lh, t, 51.3, { stag: .2, out: 55.6, outDur: .35 });
  setT(c.ld, { y: lerp(10, 0, E.outCubic(prog(t, 51.8, 52.3))), o: win(t, 51.8, 56, .45, .3) });
  const en = Math.floor((t - 51) / 1.25) % 2 === 1;
  c.sub.textContent = en ? 'An old story still sleeps in this valley.' : 'この谷には、いまも古い物語が眠っている。';
  c.title.textContent = en ? 'A story in the valley' : '谷に眠る物語';
  c.desc.textContent = en ? 'Trace the history and culture of this place in short video stories.' : 'この土地の歴史と文化を、短い動画でたどる。';
  c.tog.querySelector('.ja').style.cssText += `;background:${en ? 'transparent' : SUMI};color:${en ? '#8a8276' : '#fff'}`;
  c.tog.querySelector('.en').style.cssText += `;background:${en ? SUMI : 'transparent'};color:${en ? '#fff' : '#8a8276'}`;
  void vm;
});

// montage 56–66
scene(56, 66, n => {
  const c = {};
  c.m = ['miyoshi_kazura_walk', 'miyoshi_oboke', 'miyoshi_oboke_boat', 'miyoshi_koboke', 'miyoshi_thatch', 'miyoshi_village', 'miyoshi_upper_iya', 'miyoshi_okuiya_bridge'].map(p => cine(n, p));
  c.s = el('div', 'scrim-b', n);
  c.t1 = lines(n, ['見る観光から、', '物語をたどる観光へ。'], { left: M + 'px', top: '760px', fontSize: '64px', color: '#f3eee4', lineHeight: 1.45 }, 'mincho');
  c.t2 = lines(n, ['一つの名所で終わらず、', '街全体へ人の流れを。'], { left: M + 'px', top: '760px', fontSize: '64px', color: '#f3eee4', lineHeight: 1.45 }, 'mincho');
  return c;
}, (t, c) => {
  c.m.forEach((p, i) => { const a = 56 + i * 1.25; show(p, t >= a && t < a + 1.25 ? 1 : 0); kb(p, t, a, a + 1.25, { s0: 1.07, s1: 1.02 }); });
  revealLines(c.t1, t, 56.3, { stag: .3, out: 60.6, outDur: .4 }); if (t > 61) show(c.t1, 0);
  revealLines(c.t2, t, 61.3, { stag: .3, out: 65.5, outDur: .45 }); if (t < 61.3) show(c.t2, 0);
});

// ================================================================= Act 3 — return (66–100)
const CYC = ['ガイドチケットを購入', '地域の物語を体験', '街を巡る', '売上の一部を地域へ還元', '文化・観光資源を保全'];
scene(66, 78, n => {
  const c = {};
  washi(n);
  c.st = el('div', 'abs step', n, 'Local value cycle'.toUpperCase()); box(c.st, M, 360);
  c.h = mincho(n, ['旅を楽しむことが、', '街を守ることにつながる。'], M, 400, 60);
  c.d = subT(n, 'ガイドチケットの売上の一部を地域へ還元。<br>訪れる人の体験が、文化や観光資源を<br>次の世代へ残す力になる。', M, 620, 700);
  const cx = 1340, cy = 540, R = 290;
  c.svg = el('div', 'fill', n);
  c.svg.innerHTML = `<svg width="${W}" height="${H}"><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(29,27,24,.14)" stroke-width="1"/>
    <circle class="arc" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${SHU}" stroke-width="2" stroke-dasharray="${2 * Math.PI * R}" stroke-dashoffset="${2 * Math.PI * R}" transform="rotate(-90 ${cx} ${cy})"/></svg>`;
  c.arc = c.svg.querySelector('.arc'); c.L = 2 * Math.PI * R;
  c.center = el('div', 'abs mincho', n, '地域の<br>未来へ'); box(c.center, cx - 100, cy - 50, 200); place(c.center, { textAlign: 'center', fontSize: '36px', lineHeight: 1.5, color: SUMI });
  c.nodes = CYC.map((s, i) => {
    const a = (-90 + i * 72) * Math.PI / 180, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    const d = el('div', 'abs', n); box(d, x - 12, y - 12, 24, 24); place(d, { borderRadius: '50%', background: '#fbf8f2', border: `3px solid ${SHU}` });
    const tx = el('div', 'abs', n, `<span style="font:600 13px LATIN;letter-spacing:.2em;color:${SHU}">0${i + 1}</span><br><span style="font:600 22px SERIF;color:${SUMI}">${s}</span>`);
    const right = Math.cos(a) > .2, left = Math.cos(a) < -.2;
    const lower = Math.sin(a) > .3;
    box(tx, right ? x + 26 : left ? x - 26 : x, y + (i === 0 ? -80 : lower ? 18 : -24));
    tx.style.transform = left ? 'translateX(-100%)' : right ? '' : 'translateX(-50%)';
    tx.style.textAlign = left ? 'right' : right ? 'left' : 'center';
    tx.style.whiteSpace = 'nowrap';
    return { d, tx };
  });
  return c;
}, (t, c) => {
  show(c.st, win(t, 66.2, 78, .4, .4));
  revealLines(c.h, t, 66.3, { stag: .25, out: 77.4, outDur: .5 });
  setT(c.d, { y: lerp(10, 0, E.outCubic(prog(t, 67.2, 67.8))), o: win(t, 67.2, 78, .6, .5) });
  c.arc.setAttribute('stroke-dashoffset', (c.L * (1 - E.inOutSine(prog(t, 67.6, 75.2)))).toFixed(1));
  c.nodes.forEach(({ d, tx }, i) => { const a = 67.6 + i * 1.6; pop(d, t, a, { dy: 0, s0: .3, out: 77.5, outDur: .4 }); pop(tx, t, a + .1, { out: 77.5, outDur: .4 }); });
  pop(c.center, t, 75.4, { out: 77.5, outDur: .4 });
});

scene(78, 86, n => {
  const c = {};
  c.p1 = cine(n, 'miyoshi_thatch'); c.p2 = cine(n, 'miyoshi_upper_iya');
  c.s = el('div', 'scrim-b', n);
  c.st = el('div', 'abs step', n, 'CASE'); box(c.st, M, 640); c.st.style.color = '#e5a291';
  c.h = lines(n, ['徳島県三好市で展開。'], { left: M + 'px', top: '680px', fontSize: '72px', color: '#f3eee4' }, 'mincho');
  c.d = subT(n, '地域に残る歴史と文化を、動画ストーリーと街歩きで体験できる<br>デジタル観光ガイドとして。', M, 800, 1100, 'rgba(243,238,228,.8)', 24);
  c.d2 = lines(n, ['大きな設備を増やさず、街全体を観光体験に。'], { left: M + 'px', top: '800px', fontSize: '44px', color: '#f3eee4' }, 'mincho');
  return c;
}, (t, c) => {
  span(c.p1, t, 78, 82.2, .8, { s0: 1.1, s1: 1.03 }); span(c.p2, t, 82, 86, .6, { s0: 1.08, s1: 1.0 });
  show(c.s, 1);
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
