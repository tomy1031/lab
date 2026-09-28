/* Promo — NMClaw「話すだけで、会社の情報が整理される。」 (86 s)
 * Act 1 (0–16) three problems as animated diagrams · Act 2 (16–76) the product, explained visually
 * · Act 3 (76–86) end card. Scene changes sit on the music's downbeats (bar() below).
 * UI data (company names, amounts) is fictional sample data.
 */
(() => {
'use strict';
const { W, H, clamp, lerp, prog, E, win, $, el, place, box, show, setT, lines, revealLines,
  photo, kb, wipe, drawLine, logo, buildLogo, scene, hooks, film, rng } = NM;
const { icon, phone, type, wave, pop } = UI;
const M = 128;
const BLUE = '#1668c4', SKY = '#3fb0ff', INK = '#0b1a33', MUTE = '#5b6b85', AMBER = '#e89a2c', RED = '#ff6b6b';

// music grid: the drop lands on 16.0 s, 128 BPM
const BAR = 1.8715, BEAT = BAR / 4;
const bar = k => 16 + k * BAR;

// ----------------------------------------------------------------- helpers
function hl(parent, arr, x, y, size, color = INK) {
  return lines(parent, arr, { left: x + 'px', top: y + 'px', fontSize: size + 'px', color }, 'hl');
}
function lbl(parent, text, x, y, color = BLUE) {
  const n = el('div', 'abs label', parent, text); box(n, x, y); n.style.color = color; return n;
}
function sub(parent, html, x, y, w, color = MUTE, size = 24) {
  const n = el('div', 'abs', parent, html); box(n, x, y, w);
  place(n, { fontSize: size + 'px', lineHeight: 1.8, letterSpacing: '.04em', color }); return n;
}
function copy(o, t, a, b) {                     // label + headline + sub, in and out
  show(o.l, win(t, a, b, .4, .3));
  revealLines(o.h, t, a + .12, { stag: .12, out: b - .45, outDur: .35 });
  if (t < a || t > b) show(o.h, 0);
  if (o.s) setT(o.s, { y: lerp(10, 0, E.outCubic(prog(t, a + .5, a + 1))), o: win(t, a + .5, b, .5, .3) });
}
const SVGNS = 'http://www.w3.org/2000/svg';
function S(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function layer(parent) {
  const s = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  s.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
  parent.appendChild(s);
  return s;
}
/** cubic Bézier through control points; .at(u) → [x, y]; .pts(u) → polyline string up to u */
function curve(p0, p1, p2, p3) {
  const at = u => {
    const v = 1 - u;
    return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
            v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
  };
  const pts = (u1, u0 = 0, n = 48) => {
    const out = [];
    for (let k = 0; k <= n; k++) { const [x, y] = at(lerp(u0, u1, k / n)); out.push(x.toFixed(1) + ',' + y.toFixed(1)); }
    return out.join(' ');
  };
  return { at, pts };
}
/** polyline drawn along a curve between a and a + dur */
function trace(pl, cv, t, a, dur, ease = E.inOutCubic) {
  const q = clamp(ease(prog(t, a, a + dur)));
  pl.setAttribute('points', q > 0 ? cv.pts(q) : '');
  return q;
}
/** scene entrance on a downbeat: wipe from the left with a blue leading edge, finishing at a + dur */
function enter(n, edge, t, a, dur = .45) {
  const p = E.inOutQuart(prog(t, a, a + dur));
  n.style.clipPath = p < 1 ? `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)` : 'none';
  edge.style.transform = `translateX(${(p * W - 10).toFixed(1)}px)`;
  show(edge, p > 0 && p < 1 ? 1 : 0);
}
function edgeBar(n) {
  const e = el('div', 'abs', n); box(e, 0, 0, 10, H);
  place(e, { background: `linear-gradient(90deg, rgba(63,176,255,0), ${SKY})`, boxShadow: `0 0 40px ${SKY}`, zIndex: 20 });
  return e;
}
function lightBg(n) {
  const bg = el('div', 'fill light dotgrid', n);
  return t => { bg.style.backgroundPosition = `${(-t * 9).toFixed(1)}px ${(-t * 4).toFixed(1)}px`; };
}
function avatar(g, x, y, s = 1, stroke = 'rgba(255,255,255,.85)') {
  const a = S('g', { transform: `translate(${x} ${y}) scale(${s})` }, g);
  S('circle', { cx: 0, cy: -44, r: 22, fill: 'rgba(255,255,255,.06)', stroke, 'stroke-width': 2 }, a);
  S('path', { d: 'M -40 14 C -40 -12 -22 -16 0 -16 C 22 -16 40 -12 40 14 Z', fill: 'rgba(255,255,255,.06)', stroke, 'stroke-width': 2 }, a);
  return a;
}

// ================================================================= Act 1 — problems (0–16), dark
const FRAGS = [
  ['note', '口頭で報告済み'], ['msg', '見積もり、どこにありますか？'], ['notif', '新着メッセージ 12件'], ['cell', 'A12  =SUM(B2:B11)'],
  ['note', 'あとで入力します'], ['msg', '金額いくらでしたっけ'], ['notif', '未入力の日報 5件'], ['note', '担当：？'],
  ['msg', '先方から電話ありました'], ['cell', '見積一覧_最新_v3(2).xlsx'], ['note', '期日いつ？'], ['msg', '共有しておきます'],
  ['notif', '不在着信 3件'], ['note', '議事録どこ？'], ['cell', '顧客リスト_営業部.xlsx'], ['msg', '確認中です…'],
  ['note', '日報まだです'], ['notif', 'リマインダー：報告書'],
];
const P = [bar(-7), bar(-5), bar(-3), bar(-1)];          // 2.90, 6.64, 10.39, 14.13
scene(0, 16, n => {
  const c = {};
  const R = rng(11);
  c.frags = FRAGS.map(([k, s], i) => {
    const d = el('div', 'frag ' + k, n, s);
    const x = 80 + R() * 1560, y = 70 + R() * 880;
    d._p = { x, y, r: (R() - .5) * 10, vx: (R() - .5) * 26, vy: (R() - .5) * 18, a: .1 + i * .14, z: .7 + R() * .5 };
    return d;
  });
  c.dim = el('div', 'fill', n); c.dim.style.background = 'radial-gradient(ellipse at 50% 60%, rgba(11,14,20,.94), rgba(11,14,20,.78) 75%)';
  c.head = [['Problem 01', '情報が、人にとどまる。', '口頭報告や個人のメモに残り、必要な人へ届かない。'],
            ['Problem 02', '入力と報告に、時間がかかる。', '同じ内容を、いくつもの台帳やシステムへ繰り返し入力。'],
            ['Problem 03', '経営状況が、見えにくい。', '集計を待つあいだに、判断がどうしても後手になる。']].map(([l, h, s]) => ({
    l: lbl(n, l, M, 132, '#7fb6ef'), h: hl(n, [h], M, 168, 64, '#fff'), s: sub(n, s, M, 262, 1200, 'rgba(255,255,255,.62)', 22),
  }));

  // --- P1: information stays with people
  const g1 = c.g1 = el('div', 'fill', n);
  const s1 = layer(g1);
  const WK = [[360, '営業'], [700, '現場'], [1040, '事務']], MX = 1540, AY = 720;
  c.w = WK.map(([x, name], i) => {
    const a = avatar(s1, x, AY, 1.35);
    const t = S('text', { x, y: AY + 58, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.6)', style: 'font:500 20px SANS' }, s1); t.textContent = name;
    const cv = curve([x + 40, AY - 80], [x + 160, AY - 290 + i * 40], [MX - 260, AY - 290 + i * 40], [MX - 50, AY - 90]);
    const ln = S('polyline', { fill: 'none', stroke: 'rgba(127,182,239,.8)', 'stroke-width': 2, 'stroke-dasharray': '7 7' }, s1);
    const [bx, by] = cv.at(.56);
    const brk = S('g', { transform: `translate(${bx} ${by})` }, s1);
    S('circle', { r: 17, fill: '#1b1f2a', stroke: RED, 'stroke-width': 2 }, brk);
    S('path', { d: 'M -6 -6 L 6 6 M 6 -6 L -6 6', stroke: RED, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, brk);
    const memos = [0, 1, 2].map(k => {
      const m = el('div', 'memo ' + ['note', 'msg', 'cell'][k], g1);
      m.innerHTML = '<i></i><i></i>';
      return m;
    });
    return { x, a, t, cv, ln, brk, memos };
  });
  c.mgr = avatar(s1, MX, AY, 1.7, '#fff');
  c.mgrT = S('text', { x: MX, y: AY + 70, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.8)', style: 'font:500 20px SANS' }, s1); c.mgrT.textContent = '経営者・管理者';
  c.q = el('div', 'abs', g1, '？'); box(c.q, MX + 50, AY - 210, 64, 64);
  place(c.q, { borderRadius: '50%', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.3)', display: 'grid', placeItems: 'center', font: '700 32px SANS', color: '#fff' });

  // --- P2: the same entry, typed again and again
  const g2 = c.g2 = el('div', 'fill', n);
  const s2 = layer(g2);
  c.src = el('div', 'darkcard', g2); box(c.src, M, 520, 400, 240);
  c.src.innerHTML = '<div class="h">現場からの報告</div><div class="r">山田工務店</div><div class="r">外壁塗装 見積もり</div><div class="r">¥1,200,000　10/9（金）</div>';
  const FORMS = ['日報', '案件管理表.xlsx', '報告チャット', '顧客台帳'];
  c.forms = FORMS.map((name, i) => {
    const y = 420 + i * 130;
    const f = el('div', 'darkcard form', g2); box(f, 700, y, 600, 108);
    f.innerHTML = `<div class="h">${name}</div><div class="in"></div><div class="badge">${i + 1}回目</div>`;
    const cv = curve([528, 640], [620, 640], [610, y + 54], [700, y + 54]);
    const ln = S('polyline', { fill: 'none', stroke: 'rgba(127,182,239,.7)', 'stroke-width': 2 }, s2);
    const head = S('circle', { r: 5, fill: SKY }, s2);
    return { f, inp: f.querySelector('.in'), cv, ln, head };
  });
  c.clock = S('g', { transform: 'translate(1560 650)' }, s2);
  S('circle', { r: 118, fill: 'rgba(255,255,255,.04)', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2 }, c.clock);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    S('line', { x1: Math.sin(a) * 100, y1: -Math.cos(a) * 100, x2: Math.sin(a) * 110, y2: -Math.cos(a) * 110, stroke: 'rgba(255,255,255,.5)', 'stroke-width': 2 }, c.clock);
  }
  c.arc = S('path', { fill: 'rgba(255,107,107,.28)', stroke: 'none' }, c.clock);
  c.hand = S('line', { x1: 0, y1: 0, x2: 0, y2: -86, stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round' }, c.clock);
  S('circle', { r: 6, fill: '#fff' }, c.clock);
  c.clockT = el('div', 'abs', g2, '入力と報告に使う時間'); place(c.clockT, { left: '1400px', width: '320px', top: '790px', textAlign: 'center', font: '500 20px SANS', color: 'rgba(255,255,255,.7)' });

  // --- P3: the field moves on, management sees it late
  const g3 = c.g3 = el('div', 'fill', n);
  const s3 = layer(g3);
  const X0 = 380, X1 = 1720, YF = 560, YM = 820, LAG = 420;
  for (const [y, name, ic] of [[YF, '現場', 'walk'], [YM, '経営', 'chart']]) {
    S('line', { x1: X0, y1: y, x2: X1, y2: y, stroke: 'rgba(255,255,255,.28)', 'stroke-width': 2 }, s3);
    const tg = el('div', 'abs', g3); box(tg, M, y - 26, 200, 52);
    place(tg, { display: 'flex', alignItems: 'center', gap: '12px', font: '700 24px SANS', color: '#fff' });
    tg.appendChild(icon(ic, 30, '#7fb6ef')); el('span', '', tg, name);
  }
  ['月', '火', '水', '木', '金'].forEach((d, k) => {
    const x = X0 + 90 + k * 290;
    const tx = S('text', { x, y: YF - 60, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.45)', style: 'font:500 18px SANS' }, s3); tx.textContent = d;
    S('line', { x1: x, y1: YF - 44, x2: x, y2: YM + 20, stroke: 'rgba(255,255,255,.06)', 'stroke-width': 1 }, s3);
  });
  c.ev = [460, 620, 800, 980, 1130, 1300, 1450, 1600].map(x => {
    const f = S('circle', { cx: x, cy: YF, r: 11, fill: SKY }, s3);
    const cv = curve([x, YF + 12], [x + 60, YF + 150], [x + LAG - 60, YM - 150], [x + LAG, YM - 12]);
    const ln = S('polyline', { fill: 'none', stroke: 'rgba(127,182,239,.45)', 'stroke-width': 1.6, 'stroke-dasharray': '5 6' }, s3);
    const m = S('circle', { cx: x + LAG, cy: YM, r: 11, fill: 'rgba(255,255,255,.55)' }, s3);
    return { x, f, cv, ln, m };
  });
  c.cursor = S('line', { x1: 0, y1: YF - 40, x2: 0, y2: YM + 40, stroke: '#fff', 'stroke-width': 2 }, s3);
  c.now = S('text', { x: 0, y: YF - 50, 'text-anchor': 'middle', fill: '#fff', style: 'font:600 16px LATIN;letter-spacing:.2em' }, s3); c.now.textContent = 'TODAY';
  c.wait = el('div', 'abs', g3); box(c.wait, 560, 660, 170, 40);
  place(c.wait, { display: 'flex', alignItems: 'center', gap: '10px', font: '500 18px SANS', color: 'rgba(255,255,255,.75)' });
  c.spin = el('span', '', c.wait); place(c.spin, { width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,.25)', borderTopColor: '#fff' });
  el('span', '', c.wait, '集計待ち');
  c.gap = el('div', 'abs', g3); box(c.gap, 0, YM + 34, 0, 2); place(c.gap, { background: AMBER });
  c.gapT = el('div', 'abs', g3, '判断が、後手に'); place(c.gapT, { top: (YM + 48) + 'px', font: '700 24px SANS', color: AMBER, textAlign: 'center' });
  Object.assign(c, { X0, X1, LAG });

  c.dot = el('div', 'abs', n); box(c.dot, W / 2 - 10, H / 2 - 10, 20, 20); place(c.dot, { borderRadius: '50%', background: SKY, boxShadow: `0 0 30px ${SKY}` });
  return c;
}, (t, c) => {
  // fragments drift, then collapse into one point
  const col = E.inCubic(prog(t, 14.3, 15.4));
  c.frags.forEach(d => {
    const p = d._p;
    const o = E.outCubic(prog(t, p.a, p.a + .5));
    const x = p.x + p.vx * t, y = p.y + p.vy * t;
    const cx = lerp(x, W / 2 - 60, col), cy = lerp(y, H / 2 - 20, col);
    d.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) rotate(${p.r}deg) scale(${(p.z * (1 - col * .9)).toFixed(3)})`;
    d.style.left = '0'; d.style.top = '0';
    d.style.opacity = (o * (1 - col) * (t > 2.6 && t < 14.3 ? .55 : 1)).toFixed(3);
    d.style.filter = p.z < .85 ? 'blur(1.5px)' : 'none';
  });
  show(c.dim, win(t, 2.5, 14.3, .5, .4));
  c.head.forEach((o, i) => copy(o, t, P[i] + .05, P[i + 1] - .1));

  // P1 ------------------------------------------------------------
  const a1 = P[0], o1 = win(t, a1, P[1] - .05, .3, .35);
  show(c.g1, o1);
  if (o1 > 0) {
    c.w.forEach((w, i) => {
      const p = E.outBack(prog(t, a1 + .15 + i * .12, a1 + .6 + i * .12));
      w.a.style.opacity = clamp(p); w.t.style.opacity = clamp(p);
      w.a.setAttribute('transform', `translate(${w.x} ${720 + (1 - clamp(p)) * 20}) scale(${(clamp(p) * .2 + .8) * 1.35})`);
      w.memos.forEach((m, k) => {
        const ang = t * 1.4 + k * 2.09 + i;
        const r = 118;
        m.style.transform = `translate(${(w.x - 22 + Math.cos(ang) * r).toFixed(1)}px, ${(650 + Math.sin(ang) * r * .5).toFixed(1)}px) rotate(${(Math.sin(ang) * 8).toFixed(1)}deg)`;
        m.style.opacity = E.outCubic(prog(t, a1 + .4 + k * .1, a1 + .8 + k * .1)).toFixed(3);
      });
      const q = clamp(E.inOutCubic(prog(t, a1 + .9 + i * .15, a1 + 1.7 + i * .15))) * .52;
      w.ln.setAttribute('points', q > 0 ? w.cv.pts(q) : '');
      const b = E.outBack(prog(t, a1 + 1.75 + i * .15, a1 + 2.05 + i * .15));
      w.brk.style.opacity = clamp(b);
    });
    c.mgr.style.opacity = E.outCubic(prog(t, a1 + .5, a1 + 1)); c.mgrT.style.opacity = c.mgr.style.opacity;
    pop(c.q, t, a1 + 2.4, { dy: 10, s0: .6 });
  }

  // P2 ------------------------------------------------------------
  const a2 = P[1], o2 = win(t, a2, P[2] - .05, .3, .35);
  show(c.g2, o2);
  if (o2 > 0) {
    pop(c.src, t, a2 + .1, { dy: 20 });
    const ENTRY = '山田工務店　外壁塗装　¥1,200,000　10/9';
    c.forms.forEach((f, i) => {
      const s = a2 + .5 + i * .72;
      pop(f.f, t, s - .15, { dy: 14 });
      const q = trace(f.ln, f.cv, t, s - .25, .3);
      const [hx, hy] = f.cv.at(q); f.head.setAttribute('cx', hx.toFixed(1)); f.head.setAttribute('cy', hy.toFixed(1));
      f.head.style.opacity = q > 0 && q < 1 ? 1 : 0;
      type(f.inp, ENTRY, t, s, .55);
    });
    const p = clamp(prog(t, a2 + .4, P[2] - .3));
    const ang = p * Math.PI * 2 * .85;
    c.hand.setAttribute('transform', `rotate(${(t - a2) * 520})`);
    const x = Math.sin(ang) * 118, y = -Math.cos(ang) * 118;
    c.arc.setAttribute('d', p > 0 ? `M 0 0 L 0 -118 A 118 118 0 ${ang > Math.PI ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)} Z` : '');
    c.clock.style.opacity = E.outCubic(prog(t, a2 + .2, a2 + .7));
    show(c.clockT, E.outCubic(prog(t, a2 + .5, a2 + 1)));
  }

  // P3 ------------------------------------------------------------
  const a3 = P[2], o3 = win(t, a3, P[3] - .05, .3, .35);
  show(c.g3, o3);
  if (o3 > 0) {
    const cx = lerp(c.X0, c.X1, E.inOutSine(prog(t, a3 + .3, P[3] - .35)));
    c.cursor.setAttribute('x1', cx); c.cursor.setAttribute('x2', cx); c.now.setAttribute('x', cx);
    let last = null;
    c.ev.forEach(e => {
      e.f.setAttribute('r', cx >= e.x ? 11 : 0);
      const u = clamp((cx - e.x) / c.LAG);
      e.ln.setAttribute('points', u > 0 ? e.cv.pts(u) : '');
      const got = cx >= e.x + c.LAG;
      e.m.setAttribute('r', got ? 11 : 0);
      if (got) last = e.x + c.LAG;
    });
    c.spin.style.transform = `rotate(${t * 540}deg)`;
    show(c.wait, win(t, a3 + .9, P[3], .3, .3));
    const gp = E.outCubic(prog(t, a3 + 2.6, a3 + 3.1));
    const gx = last || c.X0;
    box(c.gap, gx, 854, (cx - gx) * gp, 3);
    c.gapT.style.left = ((gx + cx) / 2 - 150) + 'px'; c.gapT.style.width = '300px';
    show(c.gap, gp); show(c.gapT, gp);
  }
  setT(c.dot, { o: win(t, 15.2, 16, .2, 0), s: 1 + .15 * Math.sin(t * 12) });
});

// ================================================================= Act 2 — 01 voice, 02 understanding (16–31)
const SAID = '今日、山田工務店さんに外壁塗装の見積もりを出しました。金額は120万円、お返事は来週の金曜日です。';
const ENT = [['顧客', '山田工務店'], ['案件', '外壁塗装の見積もり'], ['金額', '120万円'], ['期日', '来週の金曜日']];
const SLOTS = [['顧客', '山田工務店'], ['案件', '外壁塗装 見積もり'], ['金額', '¥1,200,000'], ['期日', '10/9（金）'], ['担当者', '？']];
scene(16, bar(8), n => {
  const c = {};
  c.bg = lightBg(n);
  c.ripples = [0, 1, 2].map(() => { const r = el('div', 'abs', n); place(r, { borderRadius: '50%', border: `2px solid rgba(22,104,196,.18)` }); return r; });
  c.c1 = { l: lbl(n, 'NMClaw — AI operations platform', M, 300), h: hl(n, ['話すだけで、', '会社の情報が整理される。'], M, 340, 76),
           s: sub(n, 'PCを開かなくても、話す・送るだけ。<br>いつもの言葉で、現場の状況をそのまま共有。', M, 580, 800) };
  c.c2 = { l: lbl(n, 'AI understanding', M, 96), h: hl(n, ['話した内容を、AIが理解。', '足りない情報は、聞き返す。'], M, 132, 52) };
  // phone
  c.ph = phone(n, 1250, 110, { app: 'NMClaw' });
  const Sc = c.ph.screen;
  c.mic = el('div', 'abs', Sc); box(c.mic, 146, 560, 120, 120);
  place(c.mic, { borderRadius: '50%', background: BLUE, display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 12px 40px rgba(22,104,196,.45)' });
  c.mic.appendChild(icon('mic', 52, '#fff'));
  c.rings = [0, 1, 2].map(() => { const r = el('div', 'abs', Sc); box(r, 146, 560, 120, 120); place(r, { borderRadius: '50%', border: '2px solid rgba(22,104,196,.5)' }); return r; });
  c.cv = el('canvas', 'abs', Sc); c.cv.width = 340; c.cv.height = 90; box(c.cv, 26, 440, 340, 90);
  c.hint = el('div', 'abs', Sc, '話しかけてください'); place(c.hint, { left: 0, right: 0, top: '720px', textAlign: 'center', font: '500 17px SANS', color: MUTE });
  c.b1 = el('div', 'bubble me', Sc); place(c.b1, { top: '150px' });
  c.b2 = el('div', 'bubble ai', Sc, '<span class="who">NMCLAW AI</span>ありがとうございます。先方のご担当者は、どなたですか？'); place(c.b2, { top: '350px' });
  c.b3 = el('div', 'bubble me', Sc, '佐藤さんです。'); place(c.b3, { top: '480px' });
  c.b4 = el('div', 'bubble ai', Sc); place(c.b4, { top: '550px' });
  c.b4.innerHTML = '<span class="who">NMCLAW AI</span>登録しました。10/9（金）に「回答確認」のタスクを作成します。';
  // the sentence, lifted out of the phone and read by the AI
  c.fly = el('div', 'abs', n); box(c.fly, M, 330, 1020);
  c.card = el('div', 'uicard said', c.fly);
  let html = SAID;
  ENT.forEach(([k, v], i) => { html = html.replace(v, `<span class="ent" data-i="${i}"><span class="tag">${k}</span>${v}</span>`); });
  c.card.innerHTML = `<div class="h">音声メモ → テキスト</div><div class="tx">${html}</div>`;
  c.ents = [...c.card.querySelectorAll('.ent')];
  c.slots = SLOTS.map(([k, v], i) => {
    const s = el('div', 'slot', n); box(s, M + i * 212, 616, 198, 96);
    s.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="ok"></div>`;
    s.querySelector('.ok').appendChild(icon('check', 20, '#fff'));
    return s;
  });
  c.miss = c.slots[4];
  c.task = el('div', 'slot wide', n); box(c.task, M, 740, 1046, 84);
  c.task.innerHTML = '<div class="k">タスクを作成</div><div class="v">10/9（金）　回答確認 ─ 山田工務店（担当：佐藤様）</div><div class="ok"></div>';
  c.task.querySelector('.ok').appendChild(icon('check', 20, '#fff'));
  c.svg = layer(n);
  c.askCv = curve([M + 4 * 212 + 99, 612], [M + 4 * 212 + 99, 500], [1180, 520], [1282, 520]);
  c.ask = S('polyline', { fill: 'none', stroke: AMBER, 'stroke-width': 2.5, 'stroke-dasharray': '7 6' }, c.svg);
  return c;
}, (t, c, n) => {
  c.bg(t);
  // the dot opens into the product world
  const r = E.inOutCubic(prog(t, 16, 16.55)) * 1200;
  c.card.parentNode.parentNode.style.clipPath = r < 1199 ? `circle(${r.toFixed(1)}px at 960px 540px)` : 'none';
  copy(c.c1, t, 16.4, bar(4) - .1);
  copy(c.c2, t, bar(4) + .15, bar(8) + .2);
  // phone
  const pin = E.outCubic(prog(t, 16.2, 17.2));
  c.ph.root.style.transform = `translateX(${lerp(120, 0, pin).toFixed(1)}px)`;
  c.ph.root.style.opacity = pin;
  const listening = t >= 17.2 && t < 22.6;
  c.rings.forEach((rg, i) => {
    const ph = ((t - 17.2 + i * .45) % 1.35) / 1.35;
    rg.style.opacity = listening ? (1 - ph) * .8 : 0;
    rg.style.transform = `scale(${1 + ph * .9})`;
  });
  c.ripples.forEach((rg, i) => {                  // the voice fills the room
    const ph = ((t - 17.2 + i * .9) % 2.7) / 2.7;
    const R = 60 + ph * 900;
    box(rg, 1470 - R, 744 - R, 2 * R, 2 * R);
    rg.style.opacity = listening ? ((1 - ph) * .9).toFixed(3) : 0;
  });
  pop(c.mic, t, 16.6, { out: 23.2 });
  show(c.hint, win(t, 16.8, 17.8, .3, .3));
  wave(c.cv, t, listening ? .5 + .5 * Math.abs(Math.sin(t * 2.2)) : 0);
  show(c.cv, win(t, 17.2, 23.2, .3, .4));
  type(c.b1, SAID, t, 18.0, 4.4);
  pop(c.b1, t, 17.9);
  pop(c.b2, t, 26.8); pop(c.b3, t, 28.15); pop(c.b4, t, 29.3);
  // sentence flies out of the phone and gets read
  const f = E.inOutCubic(prog(t, bar(4) - .25, bar(4) + .45));
  c.fly.style.transform = `translate(${lerp(1150, 0, f).toFixed(1)}px, ${lerp(-170, 0, f).toFixed(1)}px) scale(${lerp(.36, 1, f).toFixed(4)})`;
  c.fly.style.transformOrigin = '0 0';
  show(c.fly, t < bar(4) - .25 ? 0 : clamp(f * 3));
  c.ents.forEach((e, i) => {
    const a = bar(4) + BEAT * (2 + i);
    const p = E.outCubic(prog(t, a, a + .3));
    e.style.backgroundSize = `${(p * 100).toFixed(1)}% 100%`;
    const tg = e.firstChild; tg.style.opacity = p.toFixed(3); tg.style.transform = `translateY(${((1 - p) * 8).toFixed(1)}px)`;
    pop(c.slots[i], t, a + .08, { dy: 18 });
    const flash = t >= a ? Math.exp(-(t - a) * 4) : 0;
    c.slots[i].style.boxShadow = `0 12px 30px rgba(11,26,51,.08), 0 0 0 ${(1 + flash * 3).toFixed(2)}px rgba(22,104,196,${(.15 + flash * .7).toFixed(3)})`;
    c.slots[i].classList.toggle('done', t >= a + .2);
  });
  // the missing field: AI asks, the answer fills it
  const ma = bar(4) + BEAT * 6, filled = t >= 28.2;
  pop(c.miss, t, ma, { dy: 18 });
  c.miss.classList.toggle('missing', !filled);
  c.miss.classList.toggle('done', filled);
  c.miss.querySelector('.v').textContent = filled ? '佐藤様' : '？';
  const pulse = !filled && t >= ma ? .5 + .5 * Math.sin((t - ma) * 9) : 0;
  c.miss.style.boxShadow = filled ? `0 12px 30px rgba(11,26,51,.08), 0 0 0 ${(1 + 3 * Math.exp(-(t - 28.2) * 4)).toFixed(2)}px rgba(22,104,196,.8)`
    : `0 12px 30px rgba(11,26,51,.08), 0 0 0 ${(2 + pulse * 3).toFixed(2)}px rgba(232,154,44,${(.4 + pulse * .5).toFixed(3)})`;
  trace(c.ask, c.askCv, t, 26.45, .4);
  c.ask.setAttribute('stroke', filled ? BLUE : AMBER);
  c.ask.style.opacity = (1 - E.inCubic(prog(t, 28.6, 29.1))).toFixed(3);
  pop(c.task, t, 29.4, { dy: 20 });
  c.task.classList.toggle('done', t >= 29.6);
});

// ================================================================= 03 auto sort (31–42)
const CHIPS = [['顧客', '山田工務店（担当：佐藤様）', 0], ['案件', '外壁塗装 見積もり', 1], ['金額', '¥1,200,000', 2],
               ['期日', '10/9（金）', 3], ['タスク', '回答確認', 3], ['日報', '見積もり提出 1件', 4]];
const DEST = [['顧客', 'db'], ['案件', 'doc'], ['売上', 'chart'], ['タスク', 'check'], ['日報', 'chat']];
const HUB = [960, 600];
scene(bar(8) - .45, bar(14), n => {
  const c = {};
  c.bg = lightBg(n);
  c.edge = edgeBar(n);
  c.cp = { l: lbl(n, 'Auto sort', M, 86), h: hl(n, ['会社のルールで、自動で振り分け。'], M, 122, 52),
           s: sub(n, '会話から顧客・案件・売上・タスク・日報を判断し、適切な項目へ。', M, 200, 1200, MUTE, 22) };
  c.svg = layer(n);
  c.chips = CHIPS.map(([k, v, d], i) => {
    const y = 300 + i * 90;
    const ch = el('div', 'slot row', n); box(ch, M, y, 400, 70);
    ch.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="ok"></div>`;
    ch.querySelector('.ok').appendChild(icon('check', 18, '#fff'));
    const cv = curve([M + 400, y + 35], [720, y + 35], [760, HUB[1]], [HUB[0] - 120, HUB[1]]);
    const base = S('polyline', { fill: 'none', stroke: '#c9d9ee', 'stroke-width': 2 }, c.svg);
    const hot = S('polyline', { fill: 'none', stroke: BLUE, 'stroke-width': 3 }, c.svg);
    return { ch, cv, base, hot, d, k, v };
  });
  c.dests = DEST.map(([name, ic], j) => {
    const y = 270 + j * 128;
    const k = el('div', 'uicard dest', n); box(k, 1360, y, 432, 110);
    k.innerHTML = `<div class="top"><span class="ic"></span><b>${name}</b><span class="cnt">0件</span></div><div class="last"></div>`;
    k.querySelector('.ic').appendChild(icon(ic, 26, BLUE));
    const cv = curve([HUB[0] + 120, HUB[1]], [1200, HUB[1]], [1230, y + 55], [1360, y + 55]);
    const base = S('polyline', { fill: 'none', stroke: '#c9d9ee', 'stroke-width': 2 }, c.svg);
    const hot = S('polyline', { fill: 'none', stroke: BLUE, 'stroke-width': 3 }, c.svg);
    return { k, cv, base, hot, cnt: k.querySelector('.cnt'), last: k.querySelector('.last'), n: 0 };
  });
  // hub
  c.hub = el('div', 'hub', n); box(c.hub, HUB[0] - 120, HUB[1] - 120, 240, 240);
  c.hub.innerHTML = '<div class="ring"></div><div class="core"><div class="mk"></div><b>NMClaw AI</b></div>';
  c.ring = c.hub.querySelector('.ring');
  c.rules = ['金額 → 売上', '期日 → タスク', '報告 → 日報'].map((s, k) => {
    const p = el('div', 'rule', n, s); box(p, HUB[0] - 120, 780 + k * 50, 240, 40); return p;
  });
  c.ruleL = el('div', 'abs label', n, 'Company rules'); box(c.ruleL, HUB[0] - 120, 744); place(c.ruleL, { width: '240px', textAlign: 'center', color: MUTE, fontSize: '12px' });
  c.pk = CHIPS.map(() => { const p = el('div', 'pkt', n); return p; });
  c.idle = [...c.chips, ...c.dests].map(() => [0, 1].map(() => S('circle', { r: 3.5, fill: SKY, opacity: 0 }, c.svg)));
  c.store = sub(n, `<span style="color:${BLUE};font-weight:700">✓</span>　業務データとして蓄積。会社のルールに沿って整理し、安全に保存。`, 1360, 940, 460, INK, 20);
  return c;
}, (t, c, n) => {
  const A = bar(8);
  enter(c.chips[0].ch.parentNode, c.edge, t, A - .45);
  c.bg(t);
  copy(c.cp, t, A + .1, bar(14) + 1);
  c.chips.forEach((o, i) => {
    pop(o.ch, t, A + .2 + i * .1, { dy: 0, s0: .9 });
    o.ch.style.transform += ` translateX(${((1 - E.outCubic(prog(t, A + .2 + i * .1, A + .7 + i * .1))) * -60).toFixed(1)}px)`;
    trace(o.base, o.cv, t, A + .5 + i * .06, .6);
  });
  c.dests.forEach((d, j) => { pop(d.k, t, A + .5 + j * .1, { dy: 20 }); trace(d.base, d.cv, t, A + .9 + j * .06, .6); d.n = 0; d.txt = ''; });
  pop(c.hub, t, A + .3, { dy: 0, s0: .5, dur: .6 });
  c.ring.style.transform = `rotate(${(t * 40).toFixed(1)}deg)`;
  show(c.ruleL, E.outCubic(prog(t, A + 1, A + 1.4)));
  c.rules.forEach((r, k) => pop(r, t, A + 1.1 + k * .15, { dy: 10 }));
  // six records travel: chip → hub → card, one every two beats
  let hubHit = 0;
  CHIPS.forEach((ch, i) => {
    const a = bar(9) + BEAT * (2 + 2 * i);
    const o = c.chips[i], d = c.dests[ch[2]], p = c.pk[i];
    const u1 = E.inOutCubic(prog(t, a - .55, a - .12)), u2 = E.inOutCubic(prog(t, a, a + .45));
    let pos = null;
    if (t >= a - .55 && t < a - .12) pos = o.cv.at(u1);
    else if (t >= a && t < a + .45) pos = d.cv.at(u2);
    if (pos) { p.style.transform = `translate(${(pos[0] - 9).toFixed(1)}px, ${(pos[1] - 9).toFixed(1)}px)`; show(p, 1); } else show(p, 0);
    o.hot.setAttribute('points', t >= a - .55 && t < a + .2 ? o.cv.pts(u1) : '');
    d.hot.setAttribute('points', t >= a && t < a + .75 ? d.cv.pts(u2) : '');
    o.ch.classList.toggle('done', t >= a - .12);
    if (t >= a - .12) hubHit = Math.max(hubHit, Math.exp(-(t - (a - .12)) * 5));
    if (t >= a + .45) { d.n++; d.txt = `<span>${ch[0]}</span>${ch[1]}`; d.hitAt = a + .45; }
  });
  c.hub.style.boxShadow = `0 20px 60px rgba(22,104,196,${(.18 + hubHit * .35).toFixed(3)}), 0 0 0 ${(hubHit * 16).toFixed(1)}px rgba(63,176,255,${(hubHit * .25).toFixed(3)})`;
  const settle = bar(13);
  c.dests.forEach((d, j) => {
    d.cnt.textContent = d.n + '件';
    d.last.innerHTML = d.txt || '<span>—</span>';
    const flash = d.hitAt !== undefined && t >= d.hitAt ? Math.exp(-(t - d.hitAt) * 4) : 0;
    const wave2 = t >= settle ? Math.max(0, Math.sin(Math.PI * clamp((t - settle - j * .12) / .6))) : 0;
    const f = Math.max(flash, wave2);
    d.k.style.boxShadow = `0 18px 48px rgba(11,26,51,.10), 0 0 0 ${(1 + f * 2.5).toFixed(2)}px rgba(22,104,196,${(.08 + f * .8).toFixed(3)})`;
    d.hitAt = undefined;
  });
  // ambient data flow on every line
  const flow = win(t, bar(9), bar(14), .6, .3);
  [...c.chips, ...c.dests].forEach((o, i) => c.idle[i].forEach((dot, k) => {
    const u = ((t * .55 + k * .5 + i * .13) % 1);
    const [x, y] = o.cv.at(u);
    dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1));
    dot.setAttribute('opacity', (flow * .55 * Math.sin(Math.PI * u)).toFixed(3));
  }));
  setT(c.store, { y: lerp(10, 0, E.outCubic(prog(t, settle, settle + .5))), o: E.outCubic(prog(t, settle, settle + .5)) });
});

// ================================================================= 04 dashboard (42–53)
scene(bar(14) - .45, bar(20), n => {
  const c = {};
  c.bg = lightBg(n);
  c.edge = edgeBar(n);
  c.cam = el('div', 'fill', n);
  c.win = el('div', 'uicard', c.cam); box(c.win, M, 180, W - 2 * M, 840); c.win.style.overflow = 'hidden';
  const side = el('div', '', c.win); place(side, { position: 'absolute', left: 0, top: 0, bottom: 0, width: '220px', background: INK, color: '#cfe0f5', padding: '28px 22px' });
  side.innerHTML = `<div style="display:flex;align-items:center;gap:10px;font:700 20px LATIN;color:#fff"><span style="width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#1668c4,#3fb0ff)"></span>NMClaw</div>
    ${['ダッシュボード', 'AIチャット', '顧客', '案件', '売上', 'タスク', '日報', 'レポート'].map((s, i) => `<div class="nav" style="margin-top:${i ? 16 : 36}px;font:500 16px SANS;opacity:${i ? .6 : 1};${i ? '' : 'color:#fff'}">${s}</div>`).join('')}`;
  c.nav = [...side.querySelectorAll('.nav')];
  const kp = [['今月の売上', 18750000, v => '¥' + Math.round(v).toLocaleString('en-US')], ['進行中の案件', 128, v => Math.round(v)], ['今週のタスク', 34, v => Math.round(v)], ['対応漏れ', 0, v => Math.round(v)]];
  c.kpi = kp.map(([name, to, f], i) => {
    const k = el('div', 'uicard kpi', c.win); box(k, 260 + i * 350, 36, 320, 150); k.style.padding = '24px 26px';
    k.innerHTML = `<div class="h">${name}</div><div class="v">0</div><svg class="spark" width="110" height="36" viewBox="0 0 110 36"><polyline fill="none" stroke="${BLUE}" stroke-width="2" points=""/></svg>`;
    return { k, v: k.querySelector('.v'), to, f, sp: k.querySelector('polyline') };
  });
  c.chart = el('div', 'uicard', c.win); box(c.chart, 260, 216, 900, 360); c.chart.style.padding = '24px 28px';
  c.chart.innerHTML = '<div class="h">売上推移</div>';
  const BV = [42, 55, 49, 68, 74, 88];
  c.bars = BV.map((v, i) => {
    const b = el('div', 'abs', c.chart); box(b, 60 + i * 135, 300, 64, 0); place(b, { background: i === 5 ? BLUE : '#9cc3ee', borderRadius: '8px 8px 2px 2px', bottom: '46px', top: 'auto' });
    const m = el('div', 'abs', c.chart, (i + 4) + '月'); box(m, 60 + i * 135, 318); place(m, { width: '64px', textAlign: 'center', font: '500 15px SANS', color: MUTE });
    return { b, v };
  });
  c.trend = S('svg', { width: 900, height: 360, viewBox: '0 0 900 360' }); c.trend.style.cssText = 'position:absolute;left:0;top:0';
  c.chart.appendChild(c.trend);
  c.trendCv = BV.map((v, i) => [60 + i * 135 + 32, 314 - v * 2.6 - 24]);
  c.trendL = S('polyline', { fill: 'none', stroke: SKY, 'stroke-width': 3, 'stroke-linejoin': 'round' }, c.trend);
  c.trendD = c.trendCv.map(([x, y]) => S('circle', { cx: x, cy: y, r: 6, fill: '#fff', stroke: SKY, 'stroke-width': 3, opacity: 0 }, c.trend));
  c.donut = el('div', 'uicard', c.win); box(c.donut, 1190, 216, 312, 360); c.donut.style.padding = '24px 28px';
  c.donut.innerHTML = `<div class="h">案件ステータス</div><svg width="256" height="256" viewBox="0 0 256 256" style="margin-top:14px">
    <circle cx="128" cy="128" r="92" fill="none" stroke="#e7eef7" stroke-width="26"/>
    <circle class="a" cx="128" cy="128" r="92" fill="none" stroke="#1668c4" stroke-width="26" stroke-dasharray="578" stroke-dashoffset="578" transform="rotate(-90 128 128)"/>
    <circle class="b" cx="128" cy="128" r="92" fill="none" stroke="#3fb0ff" stroke-width="26" stroke-dasharray="578" stroke-dashoffset="578" transform="rotate(126 128 128)"/>
    <text x="128" y="136" text-anchor="middle" style="font:300 44px LATIN;fill:#0b1a33">128</text></svg>`;
  c.sum = el('div', 'uicard', c.win); box(c.sum, 260, 606, 900, 200); c.sum.style.padding = '24px 28px';
  c.sum.innerHTML = '<div class="h">AI 週次サマリー</div><div class="tx" style="font:500 22px/1.8 SANS;margin-top:14px;color:#0b1a33"></div>';
  c.sumTx = c.sum.querySelector('.tx');
  c.tasks = el('div', 'uicard', c.win); box(c.tasks, 1190, 606, 312, 200); c.tasks.style.padding = '24px 28px';
  c.tasks.innerHTML = '<div class="h">今日のタスク</div>' + ['回答確認　山田工務店', '見積もり作成　2件', '請求書送付'].map((s, i) =>
    `<div style="margin-top:${i ? 10 : 18}px;font:500 17px SANS;display:flex;gap:10px;align-items:center"><span class="box" style="width:16px;height:16px;border-radius:5px;border:2px solid #1668c4"></span>${s}</div>`).join('');
  c.alert = el('div', 'uicard', c.cam); box(c.alert, W - M - 520, 890, 480, 96);
  place(c.alert, { display: 'flex', alignItems: 'center', gap: '18px', padding: '0 26px', background: INK, color: '#fff' });
  c.bell = icon('bell', 34, '#f0b44c'); c.alert.appendChild(c.bell);
  c.band = el('div', 'abs', n); box(c.band, 0, 0, W, 250); c.band.style.background = 'linear-gradient(180deg, #f4f6f9 62%, rgba(244,246,249,0))';
  c.h = hl(n, ['散らばる情報が、判断できるデータに。'], M, 70, 52);
  c.h2 = hl(n, ['AIが状況をまとめ、期日の前に知らせる。'], M, 70, 52);
  el('div', '', c.alert, '<div style="font:700 20px SANS">期日が近い案件が2件あります</div><div style="font:500 15px SANS;opacity:.7;margin-top:4px">回答確認：山田工務店　ほか1件</div>');
  return c;
}, (t, c, n) => {
  const A = bar(14);
  enter(c.cam.parentNode, c.edge, t, A - .45);
  c.bg(t);
  const Z = bar(18);                               // camera moves in on the summary and the alert
  revealLines(c.h, t, A + .1, { out: Z - .4, outDur: .35 });
  revealLines(c.h2, t, Z + .1, { out: bar(20) + 1, outDur: .3 }); if (t < Z + .1) show(c.h2, 0);
  const rise = E.outCubic(prog(t, A - .1, A + 1.0));
  const zoom = E.inOutCubic(prog(t, Z - .3, Z + .6));
  c.cam.style.transformOrigin = '1300px 980px';
  c.cam.style.transform = `perspective(1800px) translateY(${lerp(60, 0, rise).toFixed(1)}px) rotateX(${lerp(12, 0, rise).toFixed(2)}deg) scale(${(lerp(.94, 1, rise) * lerp(1, 1.22, zoom) + (t - A) * .002).toFixed(4)})`;
  show(c.band, zoom);
  c.nav.forEach((d, i) => { const hi = i >= 2 && i <= 6 && t >= A + .3 + (i - 2) * .12 && t < A + .6 + (i - 2) * .12; d.style.color = hi ? SKY : ''; });
  c.kpi.forEach(({ k, v, to, f, sp }, i) => {
    pop(k, t, A + .4 + i * .1);
    v.textContent = f(to * E.outExpo(prog(t, A + .5 + i * .1, A + 2.1 + i * .1)));
    const q = E.outCubic(prog(t, A + .9 + i * .1, A + 1.8 + i * .1));
    const pts = [0, 1, 2, 3, 4, 5, 6].map(k => [k * 18, 28 - (Math.sin(k * 1.3 + i) * .5 + .5) * 14 - k * 2]).slice(0, 1 + Math.round(q * 6));
    sp.setAttribute('points', pts.map(p => p.join(',')).join(' '));
  });
  pop(c.chart, t, A + .8);
  c.bars.forEach(({ b, v }, i) => { b.style.height = (v * 2.6 * E.outCubic(prog(t, A + 1.1 + i * .12, A + 1.9 + i * .12))).toFixed(1) + 'px'; });
  const tq = clamp(prog(t, A + 2.0, A + 3.2)) * (c.trendCv.length - 1);
  const pts = c.trendCv.filter((_, i) => i <= tq);
  const kf = Math.floor(tq), fr = tq - kf;
  if (kf < c.trendCv.length - 1 && tq > 0) pts.push([lerp(c.trendCv[kf][0], c.trendCv[kf + 1][0], fr), lerp(c.trendCv[kf][1], c.trendCv[kf + 1][1], fr)]);
  c.trendL.setAttribute('points', pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '));
  c.trendD.forEach((d, i) => d.setAttribute('opacity', i <= tq ? 1 : 0));
  pop(c.donut, t, A + 1.0);
  c.donut.querySelector('.a').setAttribute('stroke-dashoffset', (578 - 578 * .58 * E.outCubic(prog(t, A + 1.4, A + 2.8))).toFixed(1));
  c.donut.querySelector('.b').setAttribute('stroke-dashoffset', (578 - 578 * .27 * E.outCubic(prog(t, A + 1.8, A + 3.2))).toFixed(1));
  pop(c.sum, t, A + 2.2); pop(c.tasks, t, A + 2.4);
  type(c.sumTx, '今週は新規見積もり12件。回答待ち3件のうち、2件が期日間近です。優先して確認しましょう。', t, A + 2.8, 3.0);
  const al = E.outBack(prog(t, Z + .2, Z + .8));
  c.alert.style.transform = `translateX(${lerp(600, 0, clamp(al)).toFixed(1)}px)`;
  show(c.alert, win(t, Z + .2, bar(20) + 1, .1, .3));
  const ring = t >= Z + .7 ? Math.exp(-(t - Z - .7) * 1.6) * Math.sin((t - Z - .7) * 28) : 0;
  c.bell.style.transform = `rotate(${(ring * 18).toFixed(1)}deg)`;
});

// ================================================================= 05 features (53–68)
const FEATS = [['01', '音声・チャット入力', 'PCを開かなくても、話す・送る\nという自然な操作で情報を残せる。'],
  ['02', 'AIヒアリング', '不足している内容をAIが確認し、\n情報の抜け漏れを減らす。'],
  ['03', 'データを自動で振り分け', '顧客、案件、売上、タスク、日報を\n判断し、適切な項目へ分類・保存。'],
  ['04', '業務サマリー', '日次・週次の状況を、必要な人へ\n読みやすくまとめて届ける。'],
  ['05', 'アラート・タスク化', '期日や対応漏れを見つけ、\n次にすべき行動を明確にする。'],
  ['06', '可視化してアウトプット', 'ダッシュボード、グラフ、レポートで\n判断や共有に使える形に。']];
/** animated pictograms, one per feature: draw(g, t, k) with k = 0 idle … 1 highlighted (canvas 250×118) */
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
const PICT = [
  (g, t, k) => {                                   // mic + live waveform
    g.strokeStyle = g.fillStyle = BLUE; g.lineWidth = 3;
    rr(g, 26, 22, 30, 50, 15); g.stroke();
    g.beginPath(); g.arc(41, 60, 26, .15 * Math.PI, .85 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(41, 86); g.lineTo(41, 98); g.stroke();
    for (let i = 0; i < 16; i++) {
      const v = (Math.sin(t * 9 + i * .8) * .5 + .5) * (Math.sin(t * 4 + i * .3) * .3 + .7);
      const h = 6 + (14 + 52 * k) * v;
      rr(g, 88 + i * 10, 59 - h / 2, 5, h, 2.5); g.fill();
    }
  },
  (g, t, k) => {                                   // question → answer → check
    const ph = (t * .7) % 1;
    g.lineWidth = 2.5;
    const a1 = clamp(ph / .15), a2 = clamp((ph - .35) / .15), a3 = clamp((ph - .6) / .12);
    g.globalAlpha = .35 + .65 * a1; g.fillStyle = '#eaf2fc'; rr(g, 12, 12, 118, 48, 16); g.fill();
    g.fillStyle = BLUE; g.font = '700 26px SANS'; g.fillText('？', 56, 46);
    g.globalAlpha = .25 + .75 * a2 * (.4 + .6 * k); g.fillStyle = BLUE; rr(g, 120, 62, 118, 46, 16); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(162, 86); g.lineTo(174, 97); g.lineTo(196, 72);
    g.setLineDash([60, 60]); g.lineDashOffset = 60 * (1 - a3); g.stroke(); g.setLineDash([]);
    g.globalAlpha = 1;
  },
  (g, t, k) => {                                   // one stream, sorted into three
    const ys = [22, 59, 96];
    g.strokeStyle = '#c9d9ee'; g.lineWidth = 2;
    ys.forEach(y => { g.beginPath(); g.moveTo(30, 59); g.bezierCurveTo(100, 59, 110, y, 180, y); g.stroke(); });
    g.fillStyle = BLUE; g.beginPath(); g.arc(24, 59, 9, 0, 6.283); g.fill();
    ys.forEach((y, i) => { g.strokeStyle = BLUE; g.lineWidth = 2.5; rr(g, 188, y - 14, 48, 28, 8); g.stroke(); });
    for (let j = 0; j < 3; j++) {
      const u = (t * (.6 + .6 * k) + j / 3) % 1, y = ys[j];
      const bx = (1 - u) ** 3 * 30 + 3 * (1 - u) ** 2 * u * 100 + 3 * (1 - u) * u * u * 110 + u ** 3 * 180;
      const by = (1 - u) ** 3 * 59 + 3 * (1 - u) ** 2 * u * 59 + 3 * (1 - u) * u * u * y + u ** 3 * y;
      g.fillStyle = SKY; g.beginPath(); g.arc(bx, by, 5, 0, 6.283); g.fill();
    }
  },
  (g, t, k) => {                                   // a summary writes itself
    g.strokeStyle = BLUE; g.lineWidth = 2.5; rr(g, 60, 8, 96, 104, 10); g.stroke();
    const ph = (t * .45) % 1;
    [60, 70, 48, 64, 40].forEach((w, i) => {
      const p = clamp((ph * (1 + k) * 1.3 - i * .15) / .25);
      g.fillStyle = i ? '#9cc3ee' : BLUE; rr(g, 74, 22 + i * 17, w * p, 7, 3.5); g.fill();
    });
    const s = .6 + .4 * Math.sin(t * 5);
    g.fillStyle = SKY; g.save(); g.translate(186, 36); g.scale(s, s); g.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 6 : 18, a = i * Math.PI / 4; g.lineTo(Math.sin(a) * r, -Math.cos(a) * r); }
    g.fill(); g.restore();
  },
  (g, t, k) => {                                   // the bell rings, the task gets ticked
    const sw = Math.sin(t * 7) * (6 + 16 * k) * Math.PI / 180;
    g.save(); g.translate(48, 26); g.rotate(sw); g.strokeStyle = AMBER; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-22, 50); g.lineTo(-18, 40); g.lineTo(-18, 24); g.arc(0, 24, 18, Math.PI, 0); g.lineTo(18, 40); g.lineTo(22, 50); g.closePath(); g.stroke();
    g.beginPath(); g.arc(0, 56, 5, 0, Math.PI); g.stroke(); g.restore();
    const ph = (t * .6) % 1;
    [0, 1, 2].forEach(i => {
      const y = 26 + i * 32;
      g.strokeStyle = BLUE; g.lineWidth = 2.5; rr(g, 104, y - 11, 22, 22, 6); g.stroke();
      g.fillStyle = '#9cc3ee'; rr(g, 138, y - 4, 90 - i * 14, 8, 4); g.fill();
      const d = clamp((ph * 3 - i) / .5);
      if (d > 0) { g.strokeStyle = BLUE; g.lineWidth = 3.5; g.beginPath(); g.moveTo(108, y); g.lineTo(108 + 6 * d, y + 6 * d); if (d > .5) g.lineTo(108 + 6 + 10 * (d - .5) * 2, y + 6 - 12 * (d - .5) * 2); g.stroke(); }
    });
  },
  (g, t, k) => {                                   // bars grow, the trend follows
    const ph = (t * .5) % 1, grow = E.outCubic(clamp(ph / .5)) * (.5 + .5 * k) + .5 * (1 - k);
    const V = [.35, .5, .42, .7, .85];
    g.strokeStyle = '#c9d9ee'; g.lineWidth = 2; g.beginPath(); g.moveTo(30, 108); g.lineTo(236, 108); g.stroke();
    V.forEach((v, i) => { g.fillStyle = i === 4 ? BLUE : '#9cc3ee'; const h = 86 * v * grow; rr(g, 44 + i * 40, 106 - h, 24, h, 4); g.fill(); });
    g.strokeStyle = SKY; g.lineWidth = 3; g.beginPath();
    V.forEach((v, i) => { const x = 56 + i * 40, y = 96 - 86 * v * grow; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  },
];
scene(bar(20) - .45, bar(28), n => {
  const c = {};
  c.bg = lightBg(n);
  c.edge = edgeBar(n);
  c.l = lbl(n, 'Features', M, 96);
  c.h = hl(n, ['NMClawで、実現できること。'], M, 130, 52);
  c.tiles = FEATS.map(([no, ti, d], i) => {
    const x = M + (i % 3) * 564, y = 270 + Math.floor(i / 3) * 360;
    const k = el('div', 'uicard feat', n); box(k, x, y, 536, 330);
    el('div', 'n', k, no);
    const cv = el('canvas', 'pict', k); cv.width = 250; cv.height = 118;
    el('div', 't', k, ti); el('div', 'd', k, d.replace('\n', '<br>'));
    const pr = el('div', 'prog', k);
    return { k, g: cv.getContext('2d'), pr };
  });
  return c;
}, (t, c, n) => {
  const A = bar(20);
  enter(c.l.parentNode, c.edge, t, A - .45);
  c.bg(t);
  show(c.l, win(t, A + .1, bar(28) + 1, .4, .3));
  revealLines(c.h, t, A + .15);
  c.tiles.forEach(({ k, g, pr }, i) => {
    const a = A + .3 + i * BEAT / 2;
    const s = bar(21) + i * BAR, on = t >= s && t < s + BAR;
    const f = on ? Math.sin(Math.PI * (t - s) / BAR) : 0;
    const all = t >= bar(27) ? E.outCubic(prog(t, bar(27), bar(27) + .5)) : 0;
    const act = Math.max(on ? 1 : 0, all);
    pop(k, t, a, { dy: 34 });
    k.style.transform += ` scale(${(1 + f * .035).toFixed(4)})`;
    k.style.zIndex = on ? 2 : 1;
    k.style.boxShadow = `0 ${18 + f * 24}px ${48 + f * 36}px rgba(11,26,51,${(.10 + f * .10).toFixed(3)}), 0 0 0 ${(1 + f * 2).toFixed(2)}px rgba(22,104,196,${(.05 + f * .7).toFixed(3)})`;
    pr.style.transform = `scaleX(${on ? clamp((t - s) / BAR).toFixed(4) : t >= s + BAR ? 1 : 0})`;
    pr.style.opacity = on ? 1 : t >= s + BAR ? .25 : 0;
    g.clearRect(0, 0, 250, 118);
    g.globalAlpha = .45 + .55 * act;
    PICT[i](g, t, act);
    g.globalAlpha = 1;
  });
});

// ================================================================= 06 flow (68–76)
const FLOW = [['01', 'チャット・音声で入力', 'mic', '音声メモ'], ['02', 'AIが内容を理解', 'ask', '顧客・案件・金額・期日'],
  ['03', 'データを自動振り分け', 'sort', '5つの項目へ'], ['04', '業務データとして蓄積', 'db', '会社のデータに'], ['05', '可視化してアウトプット', 'chart', 'グラフ・レポート']];
scene(bar(28) - .45, 76, n => {
  const c = {};
  c.bg = lightBg(n);
  c.edge = edgeBar(n);
  c.l = lbl(n, 'How it works', M, 240);
  c.h = hl(n, ['入力から、可視化まで。ひとつの流れで。'], M, 280, 56);
  const X0 = 300, DX = 330, Y = 620;
  c.pipe = el('div', 'abs', n); box(c.pipe, X0, Y - 3, DX * 4, 6); place(c.pipe, { background: '#dfe8f3', borderRadius: '3px' });
  c.fillL = el('div', 'abs', n); box(c.fillL, X0, Y - 3, DX * 4, 6); place(c.fillL, { background: `linear-gradient(90deg, ${BLUE}, ${SKY})`, borderRadius: '3px', transformOrigin: '0 50%' });
  c.st = FLOW.map(([no, s, ic], i) => {
    const x = X0 + i * DX;
    const d = el('div', 'station', n); box(d, x - 62, Y - 62, 124, 124);
    const ico = icon(ic, 50, BLUE); d.appendChild(ico);
    const tx = el('div', 'abs', n, `<div style="font:300 30px LATIN;color:${BLUE}">${no}</div><div style="font:700 22px SANS;margin-top:8px;color:${INK}">${s}</div>`);
    box(tx, x - 150, Y + 92); place(tx, { width: '300px', textAlign: 'center' });
    return { x, d, ico, tx };
  });
  c.pkt = el('div', 'flowpkt', n); c.pktT = el('span', '', c.pkt);
  c.mini = el('div', 'abs', n); box(c.mini, X0 + 4 * DX - 60, Y - 190, 120, 70);
  c.miniB = [.4, .65, .5, .9].map((v, i) => { const b = el('div', 'abs', c.mini); place(b, { left: i * 30 + 'px', bottom: 0, width: '20px', height: v * 70 + 'px', background: i === 3 ? BLUE : '#9cc3ee', borderRadius: '4px 4px 1px 1px', transformOrigin: '50% 100%' }); return b; });
  Object.assign(c, { X0, DX, Y });
  return c;
}, (t, c, n) => {
  const A = bar(28);
  enter(c.l.parentNode, c.edge, t, A - .45);
  c.bg(t);
  show(c.l, win(t, A + .1, 75.6, .4, .3));
  revealLines(c.h, t, A + .15, { out: 75.4, outDur: .35 });
  const ST = FLOW.map((_, i) => A + BEAT * (2 + 2 * i));        // station hits, every two beats
  let x = c.X0, lab = FLOW[0][3];
  for (let i = 0; i < FLOW.length; i++) {
    if (t >= ST[i]) { x = c.st[i].x; lab = FLOW[i][3]; }
    if (i < FLOW.length - 1 && t >= ST[i] + .2 && t < ST[i + 1]) x = lerp(c.st[i].x, c.st[i + 1].x, E.inOutCubic(prog(t, ST[i] + .2, ST[i + 1])));
  }
  const out = 1 - E.inCubic(prog(t, 75.3, 75.8));
  c.st.forEach(({ d, ico, tx, x: sx }, i) => {
    pop(d, t, A + .2 + i * .08, { dy: 0, s0: .4 });
    pop(tx, t, A + .3 + i * .08);
    const hit = t >= ST[i], f = hit ? Math.exp(-(t - ST[i]) * 4) : 0;
    d.classList.toggle('on', hit);
    ico.style.color = hit ? '#fff' : BLUE;
    d.style.boxShadow = `0 14px 36px rgba(11,26,51,.12), 0 0 0 ${(f * 22).toFixed(1)}px rgba(63,176,255,${(f * .3).toFixed(3)})`;
    d.style.opacity = (parseFloat(d.style.opacity) * out).toFixed(3); tx.style.opacity = (parseFloat(tx.style.opacity) * out).toFixed(3);
  });
  c.fillL.style.transform = `scaleX(${((x - c.X0) / (c.DX * 4)).toFixed(4)})`;
  show(c.pipe, out); show(c.fillL, out);
  c.pktT.textContent = lab;
  c.pkt.style.transform = `translate(${(x).toFixed(1)}px, ${c.Y - 132}px) translateX(-50%)`;
  show(c.pkt, Math.min(E.outCubic(prog(t, ST[0] - .3, ST[0])), out));
  const m = E.outBack(prog(t, ST[4] + .1, ST[4] + .6));
  show(c.mini, clamp(m) * out);
  c.miniB.forEach((b, i) => { b.style.transform = `scaleY(${clamp(E.outCubic(prog(t, ST[4] + .1 + i * .08, ST[4] + .6 + i * .08))).toFixed(3)})`; });
  c.pkt.style.visibility = t >= ST[4] + .1 ? 'hidden' : c.pkt.style.visibility;
});

// ================================================================= Act 3 — end card (76–86)
scene(76, 86, n => {
  const c = {};
  el('div', 'fill light', n);
  c.img = photo(n, 'nmclaw', [960, 0, 960, H], { raw: true });
  c.fade = el('div', 'abs', n); box(c.fade, 960, 0, 960, H); c.fade.style.background = 'linear-gradient(90deg, #f4f6f9 0%, rgba(244,246,249,0) 30%)';
  c.name = lines(n, ['NMClaw'], { left: M - 8 + 'px', top: '250px', fontSize: '140px', fontWeight: 300, color: INK, letterSpacing: '-.01em' }, 'latin');
  c.cat = lbl(n, 'AI operations platform', M, 430);
  c.tag = hl(n, ['情報を、価値へ。'], M, 470, 72);
  c.rule = el('div', 'hair ink', n); box(c.rule, M, 600, 560, 1);
  c.cta = sub(n, 'まずは、今の情報の流れをお聞かせください。<br>現在の報告方法や管理表から、自動化できるところをご提案します。', M, 630, 780, INK, 24);
  c.url = el('div', 'abs latin', n, 'nextmake.site/nmclaw'); box(c.url, M, 760); place(c.url, { fontSize: '22px', letterSpacing: '.24em', fontWeight: 500, color: BLUE });
  c.logo = logo(n, 34, { left: M + 'px', top: '880px' }, { light: false });
  c.note = el('div', 'abs cap', n, '※画面はイメージです。登場する社名・金額などは架空のものです。　音楽：「Future Next」FLASH☆BEAT（OpenTracks）'); box(c.note, M, 1000); c.note.style.color = 'rgba(11,26,51,.5)';
  return c;
}, (t, c) => {
  wipe(c.img, t, 76.1, 1.0, 'left', E.inOutQuart); kb(c.img, t, 76, 86, { s0: 1.08, s1: 1.0 });
  show(c.fade, t >= 76.1 ? 1 : 0);
  revealLines(c.name, t, 76.3, { dur: 1.0 });
  show(c.cat, win(t, 76.8, 90, .5, 0));
  revealLines(c.tag, t, 77.0, { dur: .9 });
  drawLine(c.rule, t, 77.6, .9);
  setT(c.cta, { y: lerp(10, 0, E.outCubic(prog(t, 78.0, 78.6))), o: E.outCubic(prog(t, 78.0, 78.6)) });
  show(c.url, E.outCubic(prog(t, 78.6, 79.2)));
  buildLogo(c.logo, t, 79.2, { dur: 1.0 });
  show(c.note, E.outCubic(prog(t, 79.8, 80.4)));
});

// ================================================================= HUD, fades
const hud = $('#hud'), tl = hud.querySelector('.tl'), tr = hud.querySelector('.tr');
tl.innerHTML = '<span class="label" style="font-size:12px">NMClaw</span>';
const CH = [[16, bar(4), '01 — Voice & chat'], [bar(4), bar(8), '02 — AI hearing'], [bar(8), bar(14), '03 — Auto sort'],
  [bar(14), bar(20), '04 — Dashboard'], [bar(20), bar(28), '05 — Features'], [bar(28), 76, '06 — Flow']];
hooks.after.push(t => {
  show(hud, Math.min(win(t, 16.6, 75.6, .5, .4), 1));
  const ch = CH.find(c => t >= c[0] && t < c[1]);
  tr.textContent = ch ? ch[2] : '';
  tl.style.color = BLUE; tr.style.color = 'rgba(11,26,51,.5)';
  $('#fade').style.opacity = E.inOutSine(prog(t, 84.6, 86)).toFixed(3);
  $('#vignette').style.opacity = t < 16 ? 1 : .15;
  $('#grain').style.opacity = t < 16 ? .055 : .03;
});

film({ duration: 86, fps: 30, audio: '../assets/nmclaw_score.mp3' });
})();
