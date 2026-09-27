/* Film 01 — "Invest in the Next" (100 s, 120 BPM: beat 0.5 s, bar 2 s).
 * Refined edition: ink / paper alternation, Mincho statements, thin numerals, hairlines, mask reveals.
 */
(() => {
'use strict';
const { W, H, clamp, lerp, prog, E, win, $, el, place, box, show, setT, lines, revealLines, chars, fadeChars,
  photo, kb, wipe, drawLine, count, MARK_LIGHT, MARK, logo, buildLogo, scene, hooks, film } = NM;
const M = 128;

// paper panels used as full backgrounds
const paperBg = n => place(el('div', 'fill paper', n), {});

// ================================================================= A. Prologue 0–8
scene(0, 8, n => {
  const c = {};
  c.paper = paperBg(n);
  c.lbl = el('div', 'abs label muted', c.paper, 'Japan — 2030'); box(c.lbl, M, 300);
  c.num = lines(c.paper, ['0'], { left: M - 14 + 'px', top: '340px', fontSize: '300px' }, 'num');
  c.rule = el('div', 'hair', c.paper); box(c.rule, M, 700, W - 2 * M, 1);
  c.l1 = lines(c.paper, ['人のIT人材が、足りなくなる。'], { left: M + 'px', top: '740px', fontSize: '60px' }, 'serif');
  c.src = el('div', 'abs cap muted', c.paper, '出典：経済産業省「IT人材需給に関する調査」（2019年）2030年時点の最大試算'); box(c.src, M, H - 110);
  c.t2 = chars(n, '人が、足りない。', { left: M + 'px', top: '470px', fontSize: '104px' }, 'serif');
  c.ph = photo(n, 'students_hall');
  c.sc = el('div', 'scrim', n);
  c.t3 = lines(n, ['ならば、', '世界中の才能と、つなげばいい。'], { left: M + 'px', top: '560px', lineHeight: 1.5 }, 'serif');
  c.t3._lines[0].style.fontSize = '44px'; c.t3._lines[1].style.fontSize = '88px';
  return c;
}, (t, c) => {
  show(c.paper, t < 4 ? 1 : 0);
  show(c.lbl, win(t, .3, 4, .6, 0));
  revealLines(c.num, t, .4, { dur: .9 });
  count(c.num._lines[0], t, .5, 3.1, 790000, { fmt: v => (Math.round(v / 1000) * 1000).toLocaleString('en-US') });
  drawLine(c.rule, t, 1.0, 1.4);
  revealLines(c.l1, t, 1.7);
  show(c.src, win(t, 2.2, 4, .6, 0));
  // turn
  fadeChars(c.t2, t, 4.05, { stag: .08, dur: .8, out: 5.55, outDur: .4 });
  if (t < 4) show(c.t2, 0);
  const pv = win(t, 6.0, 8.0, .9, .05);
  show(c.ph, pv); show(c.sc, pv);
  kb(c.ph, t, 6, 8, { s0: 1.12, s1: 1.05, ease: E.outCubic });
  revealLines(c.t3, t, 6.25, { stag: .22, out: 7.6, outDur: .4 });
  if (t < 6.25) show(c.t3, 0);
});

// ================================================================= B. Osaka + principle 8–15.5
scene(8, 15.5, n => {
  const c = {};
  c.ph = ['osaka_street', 'team_osaka', 'staff_engineer', 'verify_meeting'].map(p => photo(n, p));
  c.sc = el('div', 'scrim-b', n);
  c.lbl = el('div', 'abs label muted', n, 'Osaka — since 2018'); box(c.lbl, M, 752);
  c.t1 = lines(n, ['大阪から、', '日本と世界の才能をつなぐ。'], { left: M + 'px', top: '790px', fontSize: '72px', lineHeight: 1.4 }, 'serif');
  // principle on paper
  c.paper = paperBg(n);
  c.rows = [['People', '人'], ['Culture', '文化'], ['Technology', '技術']].map(([en, jp], i) => {
    const y = 190 + i * 200;
    const r = {};
    r.en = lines(c.paper, [en], { left: M - 8 + 'px', top: y + 'px', fontSize: '150px', fontWeight: 200, letterSpacing: '-.01em' }, 'latin');
    r.jp = lines(c.paper, [jp], { left: '1320px', top: (y + 58) + 'px', fontSize: '56px' }, 'serif');
    r.rule = el('div', 'hair', c.paper); box(r.rule, M, y + 196, W - 2 * M, 1);
    return r;
  });
  c.t2 = lines(c.paper, ['を、つなぐ。'], { left: '1320px', top: '860px', fontSize: '64px' }, 'serif');
  return c;
}, (t, c) => {
  c.ph.forEach((p, i) => {
    const a = 8 + i;
    if (i === 0) show(p, t < 9.4 ? 1 : 0); else wipe(p, t, a, .4, 'up', E.outQuart);
    if (t >= a + 1.4) show(p, 0);
    kb(p, t, a, a + 1.4, { s0: 1.08, s1: 1.02 });
  });
  const v1 = t < 12;
  show(c.sc, v1 ? 1 : 0);
  show(c.lbl, v1 ? win(t, 8.3, 11.9, .5, .2) : 0);
  revealLines(c.t1, t, 8.4, { stag: .18, out: 11.6, outDur: .35 });
  if (!v1) show(c.t1, 0);
  // paper principle
  const vp = t >= 12;
  if (vp) wipe(c.paper, t, 12, .45, 'up', E.outQuart, 15.15, .35); else show(c.paper, 0);
  c.rows.forEach((r, i) => {
    const a = 12.05 + i * .5;
    revealLines(r.en, t, a, { dur: .8 });
    revealLines(r.jp, t, a + .15, { dur: .8 });
    drawLine(r.rule, t, a + .1, 1.2);
  });
  revealLines(c.t2, t, 13.9, { dur: .9 });
});

// ================================================================= C. Logo 16–20
scene(16, 20, n => {
  const c = {};
  c.glow = el('div', 'fill', n); c.glow.style.background = 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(40,95,170,.28), rgba(40,95,170,0) 70%)';
  c.logo = logo(n, 132, { left: 0, right: 0, top: '430px', justifyContent: 'center' });
  c.rule = el('div', 'hair', n); box(c.rule, (W - 520) / 2, 600, 520, 1); c.rule.style.transformOrigin = '50% 50%';
  c.jp = el('div', 'abs', n, '株式会社ネクストメイク'); place(c.jp, { left: 0, right: 0, top: '630px', textAlign: 'center', fontSize: '18px', letterSpacing: '.6em', fontWeight: 500, color: 'var(--mist)' });
  c.tag = lines(n, ['ITで、新しい「次」を創造する。'], { left: 0, right: 0, top: '700px', fontSize: '46px', textAlign: 'center' }, 'serif');
  return c;
}, (t, c) => {
  const out = E.inOutSine(prog(t, 19.3, 19.95));
  show(c.glow, win(t, 16, 20, 1.2, .6));
  buildLogo(c.logo, t, 16.0, { dur: 1.2 });
  c.logo.style.opacity = 1 - out;
  c.logo.style.transform = `scale(${lerp(1.0, 1.03, prog(t, 16, 19.5)).toFixed(4)})`;
  drawLine(c.rule, t, 16.9, 1.0);
  c.rule.style.opacity = (1 - out) * (t >= 16.9 ? 1 : 0);
  show(c.jp, win(t, 17.1, 19.95, .8, .5));
  revealLines(c.tag, t, 17.4, { out: 19.3, outDur: .5 });
});

// ================================================================= D. History 20–31.75
const MAPBOX = { x: 70, y: 220, w: 900, h: 700, lon0: 40, lon1: 150, lat0: -12, lat1: 60 };
const proj = (lon, lat) => [MAPBOX.x + (lon - MAPBOX.lon0) / (MAPBOX.lon1 - MAPBOX.lon0) * MAPBOX.w,
                            MAPBOX.y + (MAPBOX.lat1 - lat) / (MAPBOX.lat1 - MAPBOX.lat0) * MAPBOX.h];
const NODES = [
  ['OSAKA', 135.5, 34.7, 20.3, 'r'], ['VIETNAM', 108.2, 16.1, 24.1, 'l'], ['PHNOM PENH', 104.9, 11.6, 26.1, 'l'],
  ['TOKYO', 139.7, 35.7, 28.1, 'l'], ['UZBEKISTAN', 69.2, 41.3, 30.1, 'l'],
];
const MILESTONES = [
  ['2018', '大阪で創業', '株式会社NEXT MAKE 設立。<br>翌年、受託開発事業を開始。', 'staff_dev'],
  ['2021', '自社サービスとデザイン', '情報サービス「TANBAMU」を開始。<br>2022年、IT導入補助金 支援事業者に。', 'web_uchida'],
  ['2023', 'ベトナムへ', 'ベトナムで海外事業を開始。<br>日本企業向けのオフショア開発。', 'global_team'],
  ['2024', 'カンボジア国家プロジェクト', '郵便電気通信省・AUPPと<br>「Japanese IT Pathway」を始動。', 'signing'],
  ['2025', '東京本店・国際フォーラム', '東京本店を設立。<br>カンボジアビジネスフォーラムを主催。', 'forum'],
  ['2026', '5つの新事業', 'ウズベキスタンで事業開始。カンボジア法人設立。<br>5つの新サービスを同時にリリース。', 'ecosystem'],
];
let DOTS = [];
hooks.preload.push(async () => { DOTS = await fetch('../assets/asia_dots.json').then(r => r.json()); });
scene(20, 31.75, n => {
  const c = {};
  c.cv = el('canvas', 'fill', n); c.cv.width = W; c.cv.height = H; c.g = c.cv.getContext('2d');
  c.lbl = el('div', 'abs label muted', n, 'History — 2018 / 2026'); box(c.lbl, M, 150);
  c.title = lines(n, ['8年で、大阪から世界へ。'], { left: M + 'px', top: '184px', fontSize: '48px' }, 'serif');
  c.items = MILESTONES.map(([y, ti, d, img]) => {
    const r = {};
    r.ph = photo(n, img, [1100, 200, 692, 330]);
    r.y = lines(n, [y], { left: '1086px', top: '560px', fontSize: '150px' }, 'num');
    r.ti = lines(n, [ti], { left: '1100px', top: '716px', fontSize: '40px' }, 'serif');
    r.d = el('div', 'abs body muted', n, d); box(r.d, 1100, 780, 700);
    return r;
  });
  c.tl = el('div', 'hair', n); box(c.tl, M, 962, W - 2 * M, 1);
  c.prog = el('div', 'abs', n); box(c.prog, M, 961, 0, 3); c.prog.style.background = '#fff';
  c.ticks = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'].map((y, i) => {
    const d = el('div', 'abs latin', n, y); box(d, M + i * (W - 2 * M) / 8 - 20, 980);
    place(d, { fontSize: '14px', letterSpacing: '.12em', fontWeight: 500 });
    return d;
  });
  return c;
}, (t, c) => {
  const g = c.g;
  g.clearRect(0, 0, W, H);
  const [ox, oy] = proj(135.5, 34.7);
  const rev = (t - 20) * 800;
  g.fillStyle = 'rgba(255,255,255,.2)';
  for (const [lon, lat] of DOTS) {
    const [x, y] = proj(lon, lat);
    const a = clamp((rev - Math.hypot(x - ox, y - oy)) / 240);
    if (a <= 0) continue;
    g.globalAlpha = a;
    g.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
  }
  g.globalAlpha = 1;
  for (const [name, lon, lat, ta, side] of NODES) {
    if (t < ta) continue;
    const [x, y] = proj(lon, lat);
    if (name !== 'OSAKA') {
      const p = E.inOutCubic(prog(t, ta, ta + 1.0));
      const mx = (ox + x) / 2, my = Math.min(oy, y) - 90 - Math.abs(ox - x) * .12;
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 0; k <= 60 * p; k++) {
        const s = k / 60, u = 1 - s;
        const X = u * u * ox + 2 * u * s * mx + s * s * x, Y = u * u * oy + 2 * u * s * my + s * s * y;
        k ? g.lineTo(X, Y) : g.moveTo(X, Y);
      }
      g.stroke();
    }
    const q = E.outCubic(prog(t, ta, ta + .6));
    g.strokeStyle = `rgba(92,192,255,${(.9 * q).toFixed(3)})`; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, 6 + 12 * q, 0, 6.283); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.5, 0, 6.283); g.fill();
    g.font = '500 14px LATIN'; g.fillStyle = `rgba(255,255,255,${(.85 * q).toFixed(3)})`;
    g.textAlign = side === 'r' ? 'right' : 'left';
    const tx = side === 'r' ? x - 16 : x + 16, ty = name === 'TOKYO' ? y - 12 : name === 'OSAKA' ? y + 24 : y + 5;
    if (g.letterSpacing !== undefined) g.letterSpacing = '3px';
    g.fillText(name, tx, ty);
  }
  show(c.lbl, win(t, 20.1, 31.75, .5, .3));
  revealLines(c.title, t, 20.2, { out: 31.3, outDur: .4 });
  c.items.forEach((r, i) => {
    const a = 20 + i * 2, b = a + 2;
    const vis = t >= a && t < b;
    if (!vis) { [r.ph, r.y, r.ti, r.d].forEach(x => show(x, 0)); return; }
    wipe(r.ph, t, a, .6, 'left', E.outQuart);
    kb(r.ph, t, a, b, { s0: 1.08, s1: 1.02 });
    revealLines(r.y, t, a + .05, { dur: .7, out: b - .35, outDur: .3 });
    revealLines(r.ti, t, a + .2, { dur: .7, out: b - .35, outDur: .3 });
    setT(r.d, { y: lerp(12, 0, E.outCubic(prog(t, a + .35, a + .9))), o: win(t, a + .35, b, .5, .25) });
    if (t > b - .3) r.ph.style.opacity = clamp((b - t) / .3);
  });
  const yrs = [0, 3, 5, 6, 7, 8];
  const i = clamp(Math.floor((t - 20) / 2), 0, 5);
  const target = yrs[i] / 8;
  drawLine(c.tl, t, 20.1, 1.2);
  c.prog.style.width = ((W - 2 * M) * target).toFixed(1) + 'px';
  show(c.prog, t >= 20.3 ? 1 : 0);
  c.ticks.forEach((d, k) => { d.style.color = k / 8 <= target + 1e-3 ? '#fff' : 'rgba(255,255,255,.3)'; show(d, win(t, 20.2, 31.75, .6, .3)); });
});

// ================================================================= E. National project 32–48
scene(32, 48, n => {
  const c = {};
  // 32–34
  c.p0 = photo(n, 'signing_wide'); c.s0 = el('div', 'scrim-b', n);
  c.l0 = el('div', 'abs label muted', n, 'Cambodia × Japan'); box(c.l0, M, 700);
  c.t0 = chars(n, '国家と、組む。', { left: M + 'px', top: '740px', fontSize: '150px' }, 'serif');
  // 34–36 split
  c.p1 = photo(n, 'signing', [0, 0, 960, H]);
  c.cap1 = el('div', 'abs cap', n, '2024.08.27　AUPP × NEXTMAKE 調印式　プノンペン'); box(c.cap1, M, H - 110); c.cap1.style.color = 'rgba(255,255,255,.8)';
  c.pp = el('div', 'abs paper', n); box(c.pp, 960, 0, 960, H);
  c.l1 = el('div', 'abs label muted', c.pp, 'Japanese IT Pathway — since 2024'); box(c.l1, 110, 300);
  c.t1 = lines(c.pp, ['カンボジア郵便電気通信省が', '出資する、', '国際IT人材育成プロジェクト。'], { left: '108px', top: '350px', fontSize: '54px', lineHeight: 1.55 }, 'serif');
  c.d1 = el('div', 'abs body muted', c.pp, 'AUPP・CADTの学生が、日本語・IT・日本企業文化を<br>2年間で学び、日本企業での活躍を目指す。'); box(c.d1, 110, 640);
  // 36–38 triptych
  c.tri = ['class_teaching', 'aupp_class', 'it_start'].map((p, i) => photo(n, p, [i * 646, 0, 628, H]));
  c.s2 = el('div', 'scrim-b', n);
  c.t2 = lines(n, ['日本語　×　IT　×　日本企業文化'], { left: M + 'px', top: '850px', fontSize: '64px' }, 'serif');
  // 38–40 students
  c.pp3 = el('div', 'fill paper', n);
  c.l3 = el('div', 'abs label muted', c.pp3, 'Students enrolled'); box(c.l3, M, 250);
  c.n3 = lines(c.pp3, ['0'], { left: M - 24 + 'px', top: '290px', fontSize: '460px' }, 'num');
  c.u3 = lines(c.pp3, ['名'], { left: M + 560 + 'px', top: '600px', fontSize: '96px' }, 'serif');
  c.rows3 = [['AUPP', 'アメリカン大学プノンペン', '38'], ['CADT', 'カンボジア・デジタル技術アカデミー', '40']].map(([a, b, v], i) => {
    const y = 360 + i * 200;
    const r = { rule: el('div', 'hair', c.pp3) }; box(r.rule, 1080, y, 712, 1);
    r.a = el('div', 'abs label', c.pp3, a); box(r.a, 1080, y + 34);
    r.b = el('div', 'abs', c.pp3, b); box(r.b, 1080, y + 70); place(r.b, { fontSize: '22px', letterSpacing: '.06em' });
    r.v = lines(c.pp3, [v], { right: M + 'px', top: (y + 26) + 'px', fontSize: '120px' }, 'num');
    return r;
  });
  c.l3b = el('div', 'abs cap muted', c.pp3, 'プログラム開始　2024.09'); box(c.l3b, 1080, 790);
  // 40–42 ceremony
  c.p4 = photo(n, 'formal_gathering'); c.s4 = el('div', 'scrim-b', n);
  c.l4 = el('div', 'abs label muted', n, 'Opening ceremony — 2024.08.27'); box(c.l4, M, 740);
  c.t4 = lines(n, ['開講式には、カンボジア郵便電気通信大臣と', '駐カンボジア日本国大使が出席。'], { left: M + 'px', top: '782px', fontSize: '54px', lineHeight: 1.5 }, 'serif');
  // 42–44 forum
  c.p5 = photo(n, 'forum', [760, 0, 1160, H]);
  c.l5 = el('div', 'abs label muted', n, 'Cambodia Business Forum<br>Hilton Osaka — 2025.06'); box(c.l5, M, 270); c.l5.style.lineHeight = 2;
  c.n5 = lines(n, ['0'], { left: M - 12 + 'px', top: '370px', fontSize: '250px' }, 'num');
  c.t5 = lines(n, ['社以上が参加した', '国際フォーラムを主催。'], { left: M + 'px', top: '660px', fontSize: '46px', lineHeight: 1.6 }, 'serif');
  // 44–46 montage
  c.m = ['undokai', 'namecard', 'student_speech', 'students_cafe'].map(p => photo(n, p));
  c.s6 = el('div', 'scrim-b', n);
  c.t6 = chars(n, '才能が、育っている。', { left: M + 'px', top: '830px', fontSize: '92px' }, 'serif');
  // 46–48 graduation
  c.p7 = photo(n, 'ceremony_group'); c.s7 = el('div', 'scrim-b', n);
  c.l7 = el('div', 'abs label muted', n, 'Completion ceremony — 2026.09'); box(c.l7, M, 770);
  c.t7 = lines(n, ['1期生、日本企業への就職へ。'], { left: M + 'px', top: '810px', fontSize: '84px' }, 'serif');
  return c;
}, (t, c) => {
  const seg = (a, b) => t >= a && t < b;
  // 32–34
  const v0 = seg(32, 34);
  show(c.p0, v0 ? 1 : 0); show(c.s0, v0 ? 1 : 0); kb(c.p0, t, 32, 34, { s0: 1.1, s1: 1.04, ease: E.outCubic });
  show(c.l0, v0 ? win(t, 32.1, 34, .4, .15) : 0);
  fadeChars(c.t0, t, 32.05, { stag: .09, dur: .7, out: 33.7, outDur: .3 });
  if (!v0) show(c.t0, 0);
  // 34–36
  const v1 = seg(34, 36);
  if (v1) { wipe(c.p1, t, 34, .6, 'right', E.outQuart); wipe(c.pp, t, 34, .6, 'up', E.outQuart); } else { show(c.p1, 0); show(c.pp, 0); }
  kb(c.p1, t, 34, 36, { s0: 1.1, s1: 1.03 });
  show(c.cap1, v1 ? win(t, 34.4, 36, .4, .15) : 0);
  show(c.l1, win(t, 34.3, 36, .4, .1));
  revealLines(c.t1, t, 34.35, { stag: .12, out: 35.75, outDur: .25 });
  show(c.d1, win(t, 34.9, 36, .5, .15));
  // 36–38
  const v2 = seg(36, 38);
  c.tri.forEach((p, i) => { if (v2) wipe(p, t, 36 + i * .25, .6, 'up', E.outQuart); else show(p, 0); kb(p, t, 36, 38, { s0: 1.12, s1: 1.04 }); });
  show(c.s2, v2 ? 1 : 0);
  revealLines(c.t2, t, 36.8, { out: 37.75, outDur: .25 });
  if (!v2) show(c.t2, 0);
  // 38–40
  const v3 = seg(38, 40);
  show(c.pp3, v3 ? 1 : 0);
  if (v3) {
    show(c.l3, win(t, 38.1, 40, .4, .1));
    revealLines(c.n3, t, 38.05, { dur: .7 });
    count(c.n3._lines[0], t, 38.1, 39.0, 78);
    revealLines(c.u3, t, 38.5);
    c.rows3.forEach((r, i) => {
      drawLine(r.rule, t, 38.2 + i * .2, .8);
      show(r.a, win(t, 38.4 + i * .2, 40, .4, .1)); show(r.b, win(t, 38.5 + i * .2, 40, .4, .1));
      revealLines(r.v, t, 38.45 + i * .2);
      count(r.v._lines[0], t, 38.45 + i * .2, 39.2 + i * .2, [38, 40][i]);
    });
    show(c.l3b, win(t, 39, 40, .4, .1));
  }
  // 40–42
  const v4 = seg(40, 42);
  show(c.p4, v4 ? 1 : 0); show(c.s4, v4 ? 1 : 0); kb(c.p4, t, 40, 42, { s0: 1.04, s1: 1.1, y0: 12, y1: -12 });
  show(c.l4, v4 ? win(t, 40.15, 42, .4, .15) : 0);
  revealLines(c.t4, t, 40.2, { stag: .14, out: 41.75, outDur: .25 });
  if (!v4) show(c.t4, 0);
  // 42–44
  const v5 = seg(42, 44);
  if (v5) wipe(c.p5, t, 42, .7, 'left', E.outQuart); else show(c.p5, 0);
  kb(c.p5, t, 42, 44, { s0: 1.1, s1: 1.03 });
  show(c.l5, v5 ? win(t, 42.1, 44, .4, .15) : 0);
  revealLines(c.n5, t, 42.1, { dur: .7, out: 43.75, outDur: .25 });
  count(c.n5._lines[0], t, 42.15, 42.95, 120, { fmt: v => Math.round(v) + '+' });
  revealLines(c.t5, t, 42.5, { stag: .12, out: 43.75, outDur: .25 });
  if (!v5) { show(c.n5, 0); show(c.t5, 0); }
  // 44–46
  const v6 = seg(44, 46);
  c.m.forEach((p, i) => { const a = 44 + i * .5; show(p, v6 && t >= a && t < a + .5 ? 1 : 0); kb(p, t, a, a + .5, { s0: 1.08, s1: 1.04 }); });
  show(c.s6, v6 ? 1 : 0);
  fadeChars(c.t6, t, 44.1, { stag: .06, dur: .6, out: 45.75, outDur: .25 });
  if (!v6) show(c.t6, 0);
  // 46–48
  const v7 = seg(46, 48);
  show(c.p7, v7 ? 1 : 0); show(c.s7, v7 ? 1 : 0); kb(c.p7, t, 46, 48, { s0: 1.02, s1: 1.08 });
  show(c.l7, v7 ? win(t, 46.2, 48, .4, .2) : 0);
  revealLines(c.t7, t, 46.3, { out: 47.7, outDur: .3 });
  if (!v7) show(c.t7, 0);
});

// ================================================================= F. Five frontiers 48–55.5
const FIVE = [['01', '情報', 'Information'], ['02', '文化', 'Culture'], ['03', '信頼', 'Trust'], ['04', '安全', 'Safety'], ['05', '才能', 'Talent']];
scene(48, 55.5, n => {
  const c = {};
  c.paper = paperBg(n);
  c.t0 = lines(c.paper, ['そして今、'], { left: M + 'px', top: '220px', fontSize: '40px' }, 'serif muted');
  c.t1 = lines(c.paper, ['5つの事業を、社会へ実装する。'], { left: M + 'px', top: '290px', fontSize: '86px' }, 'serif');
  const cw = (W - 2 * M) / 5;
  c.cols = FIVE.map(([no, jp, en], i) => {
    const x = M + i * cw;
    const r = { v: el('div', 'vhair', c.paper) }; box(r.v, x, 360, 1, 400);
    r.no = lines(c.paper, [no], { left: x + 28 + 'px', top: '380px', fontSize: '44px' }, 'num');
    r.jp = lines(c.paper, [jp], { left: x + 26 + 'px', top: '500px', fontSize: '112px' }, 'serif');
    r.en = el('div', 'abs label muted', c.paper, en); box(r.en, x + 30, 690);
    return r;
  });
  c.lbl = el('div', 'abs label muted', c.paper, 'Five frontiers'); box(c.lbl, M, 230);
  c.cap = lines(c.paper, ['それぞれの可能性を、社会で使われる仕組みへ。'], { left: M + 'px', top: '850px', fontSize: '40px' }, 'serif');
  return c;
}, (t, c) => {
  const out = E.inOutSine(prog(t, 55.0, 55.45));
  c.paper.style.opacity = 1 - out;
  revealLines(c.t0, t, 48.4, { out: 51.7, outDur: .35 });
  revealLines(c.t1, t, 48.9, { out: 51.75, outDur: .35 });
  c.cols.forEach((r, i) => {
    const a = 52 + i * .5;
    drawLine(r.v, t, a - .1, .7, E.outQuart, true);
    revealLines(r.no, t, a);
    revealLines(r.jp, t, a + .08);
    show(r.en, win(t, a + .25, 56, .4, 0));
  });
  show(c.lbl, win(t, 51.9, 56, .4, 0));
  revealLines(c.cap, t, 54.5);
});

// ================================================================= G. Businesses 56–76
const BIZ = [
  { name: 'NMClaw', cat: 'AI operations platform', tag: '情報を、価値へ。',
    desc: '話すだけで、会社の情報が整理される。会話・音声・チャットをAIが構造化し、次の行動へつなげる業務基盤。',
    feats: ['音声・チャットで入力', 'AIが不足情報を確認・自動で振り分け', 'ダッシュボードとレポートで可視化'], imgs: ['nmclaw', 'nmclaw_transform'],
    proof: `<div class="serif" style="font-size:40px;line-height:1.5">現場の声を、<br>そのまま経営の判断材料へ。</div>` },
  { name: 'IDO', cat: 'Story-driven tourism', tag: '文化を、体験へ。',
    desc: 'ひとつのQRから、街の物語がひらく。地域の歴史と文化を動画ストーリーにし、街全体の回遊へつなぐ。',
    feats: ['アプリ不要、QRからすぐに体験', '多言語の動画ガイドとマップ', 'ガイド売上の一部を地域へ還元'], imgs: ['ido_journey', 'ido_miyoshi'],
    proof: `<div class="label muted">Case</div><div class="serif" style="font-size:44px;margin-top:14px">徳島県三好市で展開</div>` },
  { name: 'Verify', cat: 'Blockchain document verification', tag: '信頼を、証明へ。',
    desc: '紙もPDFも、そのまま。証明書にQRをひとつ加えるだけで、発行元・改ざんの有無・有効性を確認できる。',
    feats: ['ブロックチェーンによる記録', 'QRに個人情報を保存しない設計', '既存の発行フローを変えずに導入'], imgs: ['verify_hero', 'verify_edu'],
    proof: `<div style="display:flex;gap:28px;align-items:center">
        <img src="../assets/img/verify_award.png" style="width:104px;height:104px">
        <div><div class="label" style="color:var(--gold)">2026 UN Public Service Awards</div>
        <div class="serif" style="font-size:34px;line-height:1.5;margin-top:10px">国連公共サービス賞 受賞プラットフォームを、<br>日本で初めて導入。</div></div></div>
      <div style="display:flex;gap:56px;margin-top:26px;align-items:baseline">
        <div><span class="num" style="font-size:72px">475</span><span class="serif" style="font-size:24px">万+ 文書</span></div>
        <div><span class="num" style="font-size:72px">108</span><span class="serif" style="font-size:24px">+ 機関</span></div></div>
      <div class="cap muted" style="margin-top:16px">受賞・数値はカンボジア政府の原型プラットフォーム verify.gov.kh（2026年7月時点）</div>` },
  { name: 'Security Drone', cat: 'AI × drone solutions', tag: '異常の兆候を、安全へ。',
    desc: 'AIが侵入や異常を検知し、ドローンが現場へ向かう。確認・通知・警告・記録までを自動化する。',
    feats: ['AIによる自律制御', 'リアルタイム画像解析', '警備・点検・災害対応・農業'], imgs: ['drone_security', 'drone_network'],
    proof: `<div class="serif" style="font-size:40px;line-height:1.5">空から、<br>現場の判断を進化させる。</div>` },
  { name: 'Internship Lab', cat: 'Global talent project team', tag: '才能を、企業の力へ。',
    desc: '日本人PMと、Japanese IT Pathwayで学んだ海外大学生2〜3名がひとつのチームになり、開発・テスト・AI活用・海外展開を支援する。',
    feats: ['日本人PMが要件整理と品質を管理', '日本語で進行', 'プロジェクト単位のチーム編成'], imgs: ['lab_pathway', 'lab_collab'],
    proof: `<div class="label muted">Project-based cost</div>
      <div style="font-size:20px;margin-top:14px;letter-spacing:.06em" class="muted">一般的なSES単価　1名 月60〜80万円 → チーム型で</div>
      <div style="display:flex;align-items:baseline;gap:18px;margin-top:6px"><span class="num" style="font-size:132px">40–60</span><span class="num" style="font-size:64px">%</span>
      <span class="serif" style="font-size:30px">のコスト削減を目指せる</span></div>
      <div class="cap muted" style="margin-top:10px">公式サイト記載の比較イメージ。業務範囲・期間・体制により異なります。</div>` },
];
scene(56, 76, n => {
  const c = { b: [] };
  BIZ.forEach((bz, i) => {
    const r = { root: el('div', 'fill', n) };
    r.pa = photo(r.root, bz.imgs[0], [760, 0, 1160, H]);
    r.pb = photo(r.root, bz.imgs[1], [760, 0, 1160, H]);
    r.shade = el('div', 'abs', r.root); box(r.shade, 760, 0, 1160, H); r.shade.style.background = 'linear-gradient(0deg, rgba(8,10,16,.94) 0%, rgba(8,10,16,.78) 30%, rgba(8,10,16,0) 62%)';
    r.panel = el('div', 'abs inkbg', r.root); box(r.panel, 0, 0, 760, H);
    r.lbl = el('div', 'abs label muted', r.panel, `${String(i + 1).padStart(2, '0')} / 05 — ${bz.cat}`); box(r.lbl, M, 230);
    r.name = lines(r.panel, [bz.name], { left: M - 6 + 'px', top: '268px', fontSize: bz.name.length > 8 ? '82px' : '112px', fontWeight: 300, letterSpacing: '-.01em' }, 'latin');
    r.tag = lines(r.panel, [bz.tag], { left: M + 'px', top: '420px', fontSize: '50px' }, 'serif');
    r.desc = el('div', 'abs body muted', r.panel, bz.desc); box(r.desc, M, 515, 540); r.desc.style.fontSize = '20px';
    r.feats = bz.feats.map((f, k) => {
      const y = 700 + k * 62;
      const it = { rule: el('div', 'hair', r.panel) }; box(it.rule, M, y, 540, 1);
      it.tx = el('div', 'abs', r.panel, `<span class="latin" style="font-size:13px;letter-spacing:.2em;color:var(--mist);margin-right:22px">0${k + 1}</span>${f}`);
      box(it.tx, M, y + 18); it.tx.style.fontSize = '20px'; it.tx.style.letterSpacing = '.05em';
      return it;
    });
    r.proof = el('div', 'abs', r.root, bz.proof); box(r.proof, 860, 0, 960); r.proof.style.bottom = '110px'; r.proof.style.top = 'auto';
    c.b.push(r);
  });
  c.idx = el('div', 'abs latin', n); box(c.idx, M, 972);
  c.idx.innerHTML = BIZ.map((_, i) => `<span style="margin-right:22px">0${i + 1}</span>`).join('');
  place(c.idx, { fontSize: '14px', letterSpacing: '.2em', fontWeight: 500 });
  return c;
}, (t, c) => {
  const cur = clamp(Math.floor((t - 56) / 4), 0, 4);
  c.b.forEach((r, i) => {
    const s = 56 + i * 4, e = s + 4;
    const vis = t >= s && t < e;
    r.root.style.display = vis ? 'block' : 'none';
    if (!vis) return;
    if (i === 0) show(r.pa, t < s + 2.6 ? 1 : 0); else wipe(r.pa, t, s, .6, 'left', E.outQuart);
    if (t >= s + 2.6) show(r.pa, 0);
    wipe(r.pb, t, s + 2, .6, 'left', E.outQuart);
    kb(r.pa, t, s, s + 2.6, { s0: 1.08, s1: 1.02 });
    kb(r.pb, t, s + 2, e, { s0: 1.06, s1: 1.02 });
    show(r.shade, t >= s + 2 ? E.outCubic(prog(t, s + 2, s + 2.6)) : 0);
    show(r.lbl, win(t, s + .1, e, .4, .2));
    revealLines(r.name, t, s + .05, { dur: .8, out: e - .3, outDur: .25 });
    revealLines(r.tag, t, s + .3, { dur: .8, out: e - .3, outDur: .25 });
    setT(r.desc, { y: lerp(10, 0, E.outCubic(prog(t, s + .55, s + 1.1))), o: win(t, s + .55, e, .5, .25) });
    r.feats.forEach((it, k) => {
      drawLine(it.rule, t, s + .8 + k * .15, .7);
      it.rule.style.opacity = Math.min(1, clamp((e - t) / .25));
      setT(it.tx, { x: lerp(-10, 0, E.outCubic(prog(t, s + .95 + k * .15, s + 1.5 + k * .15))), o: win(t, s + .95 + k * .15, e, .4, .25) });
    });
    setT(r.proof, { y: lerp(24, 0, E.outCubic(prog(t, s + 2.3, s + 3))), o: win(t, s + 2.3, e, .6, .25) });
  });
  [...c.idx.children].forEach((sp, i) => { sp.style.color = i === cur ? '#fff' : 'rgba(255,255,255,.28)'; });
  show(c.idx, win(t, 56.3, 76, .4, .2));
});

// ================================================================= H. Foundation + growth engine 76–84
scene(76, 84, n => {
  const c = {};
  c.paper = paperBg(n);
  c.l1 = el('div', 'abs label muted', c.paper, 'Foundation'); box(c.l1, M, 230);
  c.t1 = lines(c.paper, ['受託開発で磨いた、', '揺るがない実装力。'], { left: M + 'px', top: '270px', fontSize: '60px', lineHeight: 1.5 }, 'serif');
  c.svc = el('div', 'abs', c.paper, 'Web・EC制作　／　システム開発　／　アプリ開発<br>インフラ構築　／　SES　／　動画制作　／　補助金活用支援');
  box(c.svc, M, 500); place(c.svc, { fontSize: '20px', lineHeight: 2, letterSpacing: '.06em' });
  c.rule = el('div', 'hair', c.paper); box(c.rule, M, 620, 600, 1);
  c.cl = el('div', 'abs cap muted', c.paper, '主な実績　大阪府トラック協会 南大阪支部／大阪府こども会育成連合会／<br>ナカタニ自動車／ウチダコーポレーション ほか<br><br>取引銀行　三井住友銀行／京都銀行／りそな銀行');
  box(c.cl, M, 650); place(c.cl, { fontSize: '16px', lineHeight: 1.9 });
  const works = ['web_uchida', 'web_track', 'web_shizuku', 'web_lealo', 'web_aquick', 'web_fujii', 'sys_hukoren', 'sys_nakatani', 'sys_track'];
  c.grid = works.map((w, i) => photo(c.paper, w, [880 + (i % 3) * 312, 230 + Math.floor(i / 3) * 190, 296, 172], { raw: true }));
  // growth engine
  c.ink = el('div', 'fill inkbg', n);
  c.l2 = el('div', 'abs label muted', c.ink, 'Growth engine'); box(c.l2, M, 380);
  c.t2 = lines(c.ink, ['才能が事業を生み、', '事業が才能を育てる。'], { left: M + 'px', top: '420px', fontSize: '60px', lineHeight: 1.5 }, 'serif');
  const cx = 1330, cy = 545, R = 300;
  c.svg = el('div', 'abs', c.ink, `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <circle class="arc" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="${2 * Math.PI * R}" stroke-dashoffset="${2 * Math.PI * R}" transform="rotate(-90 ${cx} ${cy})"/>
    <circle class="dot" cx="${cx}" cy="${cy - R}" r="5" fill="#5cc0ff"/></svg>`);
  box(c.svg, 0, 0, W, H);
  c.core = el('div', 'abs', c.ink, `<div style="width:84px">${MARK_LIGHT}</div>`); box(c.core, cx - 42, cy - 40);
  c.core.querySelector('svg').style.width = '84px';
  const nodes = [['01', '育てる', 'Japanese IT Pathway', 0], ['02', 'つくる', 'Internship Lab・海外開発拠点', 90], ['03', '事業化する', '5つの新規事業', 180], ['04', '届ける', '企業・行政・地域へ社会実装', 270]];
  c.nodes = nodes.map(([no, a, b, deg]) => {
    const rad = (deg - 90) * Math.PI / 180, x = cx + Math.cos(rad) * R, y = cy + Math.sin(rad) * R;
    const d = el('div', 'abs', c.ink, `<div class="latin" style="font-size:13px;letter-spacing:.2em;color:var(--mist)">${no}</div><div class="serif" style="font-size:34px;margin-top:4px">${a}</div><div style="font-size:15px;letter-spacing:.06em;color:var(--mist);margin-top:4px">${b}</div>`);
    const dot = el('div', 'abs', c.ink); box(dot, x - 5, y - 5, 10, 10); place(dot, { borderRadius: '50%', background: '#fff' });
    const off = { 0: [24, -70], 90: [28, -26], 180: [24, 10], 270: [-28, -26] }[deg];
    box(d, x + off[0], y + off[1]);
    if (deg === 270) { d.style.textAlign = 'right'; d.style.transform = 'translateX(-100%)'; }
    return { d, dot };
  });
  return c;
}, (t, c) => {
  const vA = t < 80;
  show(c.paper, vA ? 1 : 0);
  if (vA) {
    show(c.l1, win(t, 76.1, 80, .4, .2));
    revealLines(c.t1, t, 76.15, { stag: .14, out: 79.6, outDur: .3 });
    show(c.svc, win(t, 76.7, 80, .5, .3));
    drawLine(c.rule, t, 76.9, .8);
    show(c.cl, win(t, 77.2, 80, .5, .3));
    c.grid.forEach((p, i) => { wipe(p, t, 76.3 + i * .08, .6, 'up', E.outQuart); kb(p, t, 76, 80, { s0: 1.06, s1: 1.0 }); p.style.opacity = clamp((80 - t) / .3); });
  }
  const vB = t >= 80;
  show(c.ink, vB ? 1 : 0);
  if (vB) {
    show(c.l2, win(t, 80.1, 84, .4, .3));
    revealLines(c.t2, t, 80.15, { stag: .14, out: 83.6, outDur: .35 });
    const L = 2 * Math.PI * 300;
    const p = E.inOutCubic(prog(t, 80.2, 82.4));
    c.svg.querySelector('.arc').setAttribute('stroke-dashoffset', (L * (1 - p)).toFixed(1));
    const ang = (-90 + 360 * p + (t > 82.4 ? (t - 82.4) * 60 : 0)) * Math.PI / 180;
    const dot = c.svg.querySelector('.dot');
    dot.setAttribute('cx', (1330 + Math.cos(ang) * 300).toFixed(1)); dot.setAttribute('cy', (545 + Math.sin(ang) * 300).toFixed(1));
    show(c.svg, win(t, 80.05, 84, .3, .35));
    show(c.core, win(t, 80.3, 84, .5, .35));
    c.nodes.forEach(({ d, dot: nd }, i) => {
      const a = 80.4 + i * .5;
      show(nd, win(t, a, 84, .2, .35));
      d.style.opacity = win(t, a + .05, 84, .45, .35);
    });
  }
});

// ================================================================= I. Mission 84–91.75
scene(84, 91.75, n => {
  const c = {};
  c.m = ['team_osaka', 'undokai', 'sharewis_team', 'ceremony_2026', 'visit_group', 'aupp_group', 'manga_event', 'graduation'].map(p => photo(n, p));
  c.s = el('div', 'scrim-b', n);
  c.t1 = chars(n, '人、文化、技術をつなぎ、', { left: 0, right: 0, top: '850px', fontSize: '64px', textAlign: 'center' }, 'serif');
  c.bgp = photo(n, 'ceremony_group'); c.bgp._img.style.filter = 'saturate(.4) blur(3px) brightness(.5)';
  c.s2 = el('div', 'scrim', n); c.s2.style.background = 'rgba(8,10,16,.7)';
  c.l2 = el('div', 'abs label muted', n, 'Our mission'); place(c.l2, { left: 0, right: 0, top: '360px', textAlign: 'center' });
  c.t2a = chars(n, 'まだ見ぬ価値を、', { left: 0, right: 0, top: '420px', fontSize: '108px', textAlign: 'center' }, 'serif');
  c.t2b = chars(n, '社会へ届ける。', { left: 0, right: 0, top: '580px', fontSize: '108px', textAlign: 'center' }, 'serif');
  return c;
}, (t, c) => {
  c.m.forEach((p, i) => { const a = 84 + i * .5; show(p, t >= a && t < a + .5 ? 1 : 0); kb(p, t, a, a + .5, { s0: 1.06, s1: 1.03 }); });
  show(c.s, t < 88 ? 1 : 0);
  fadeChars(c.t1, t, 84.3, { stag: .07, dur: .8, out: 87.7, outDur: .3 });
  if (t >= 88) show(c.t1, 0);
  const v2 = t >= 88;
  show(c.bgp, v2 ? win(t, 88, 91.75, .6, .4) : 0); show(c.s2, v2 ? 1 : 0);
  kb(c.bgp, t, 88, 92, { s0: 1.04, s1: 1.1 });
  show(c.l2, v2 ? win(t, 88.2, 91.5, .6, .3) : 0);
  fadeChars(c.t2a, t, 88.3, { stag: .09, dur: 1.0, out: 91.2, outDur: .5 });
  fadeChars(c.t2b, t, 89.1, { stag: .09, dur: 1.0, out: 91.2, outDur: .5 });
  if (!v2) { show(c.t2a, 0); show(c.t2b, 0); }
});

// ================================================================= J. End card 92–100
scene(92, 100, n => {
  const c = {};
  c.paper = paperBg(n);
  c.logo = logo(c.paper, 120, { left: 0, right: 0, top: '330px', justifyContent: 'center' }, { light: false });
  c.rule = el('div', 'hair', c.paper); box(c.rule, (W - 560) / 2, 510, 560, 1); c.rule.style.transformOrigin = '50% 50%';
  c.inv = lines(c.paper, ['Invest in the next.'], { left: 0, right: 0, top: '548px', fontSize: '84px', fontWeight: 200, textAlign: 'center', letterSpacing: '.01em' }, 'latin');
  c.jp = chars(c.paper, '次の可能性を、一緒に実装しませんか。', { left: 0, right: 0, top: '690px', fontSize: '38px', textAlign: 'center' }, 'serif');
  c.info = el('div', 'abs muted', c.paper, '株式会社ネクストメイク　｜　大阪本社・東京本店　｜　カンボジア・ベトナム・ウズベキスタンで事業展開');
  place(c.info, { left: 0, right: 0, top: '800px', textAlign: 'center', fontSize: '18px', letterSpacing: '.08em' });
  c.url = el('div', 'abs latin', c.paper, 'nextmake.site');
  place(c.url, { left: 0, right: 0, top: '850px', textAlign: 'center', fontSize: '22px', letterSpacing: '.3em', fontWeight: 500, color: 'var(--blue)' });
  c.disc = el('div', 'abs cap muted', c.paper, '本映像は公開情報（公式サイト・PR TIMES・公式YouTube 等）をもとに制作したイメージ映像です。数値は各出典の公表時点のものです。');
  place(c.disc, { left: 0, right: 0, bottom: '64px', textAlign: 'center', fontSize: '13px' });
  return c;
}, (t, c) => {
  buildLogo(c.logo, t, 92.05, { dur: 1.3 });
  drawLine(c.rule, t, 92.9, 1.0);
  revealLines(c.inv, t, 93.2, { dur: 1.1 });
  fadeChars(c.jp, t, 94.0, { stag: .04, dur: .8 });
  show(c.info, E.outCubic(prog(t, 95.1, 95.9)));
  show(c.url, E.outCubic(prog(t, 95.4, 96.2)));
  show(c.disc, E.outCubic(prog(t, 95.8, 96.6)));
});

// ================================================================= HUD, fades
const hud = $('#hud'), tl = hud.querySelector('.tl'), tr = hud.querySelector('.tr');
tl.innerHTML = `<div class="logo" style="font-size:15px;gap:12px">${MARK_LIGHT}<span class="label" style="font-size:13px">NEXTMAKE</span></div>`;
const CHAPTERS = [[8, 16, 'Prologue'], [20, 32, '01 — History'], [32, 48, '02 — National project'], [48, 76, '03 — Five frontiers'],
  [76, 84, '04 — Growth engine'], [84, 92, '05 — Mission']];
const PAPER = [[0, 4], [12, 15.5], [38, 40], [48, 55.5], [76, 80], [92, 100]];
const onPaper = (t, side) => PAPER.some(([a, b]) => t >= a && t < b) || (side === 'r' && t >= 34 && t < 36);
hooks.after.push(t => {
  const vis = Math.min(1, win(t, 8.3, 15.4, .5, .2) + win(t, 20.3, 91.5, .5, .3));
  show(hud, vis);
  const ch = CHAPTERS.find(c => t >= c[0] && t < c[1]);
  tr.textContent = ch ? ch[2] : '';
  tl.style.color = onPaper(t, 'l') ? 'var(--ink)' : '#fff';
  tr.style.color = onPaper(t, 'r') ? 'rgba(11,14,20,.6)' : 'rgba(255,255,255,.7)';
  $('#fade').style.opacity = E.inOutSine(prog(t, 98.6, 100)).toFixed(3);
  $('#vignette').style.opacity = onPaper(t, 'l') ? .25 : 1;
});

film({ duration: 100, fps: 30, audio: '../assets/invest_bgm.mp3' });
})();
