/* Promo — NMClaw「話すだけで、会社の情報が整理される。」 (86 s)
 * Act 1 (0–16) problem, dark · Act 2 (16–76) product demo on a 120 BPM grid · Act 3 (76–86) end card.
 * UI data (company names, amounts) is fictional sample data.
 */
(() => {
'use strict';
const { W, H, clamp, lerp, prog, E, win, $, el, place, box, show, setT, lines, revealLines, chars, fadeChars,
  photo, kb, wipe, drawLine, count, MARK, logo, buildLogo, scene, hooks, film, rng } = NM;
const { icon, phone, type, wave, pop } = UI;
const M = 128;
const BLUE = '#1668c4', INK = '#0b1a33';

function hl(parent, arr, x, y, size, color = INK) {
  const n = lines(parent, arr, { left: x + 'px', top: y + 'px', fontSize: size + 'px', color }, 'hl');
  return n;
}
function lbl(parent, text, x, y, color = BLUE) {
  const n = el('div', 'abs label', parent, text); box(n, x, y); n.style.color = color; return n;
}
function sub(parent, html, x, y, w, color = '#5b6b85', size = 24) {
  const n = el('div', 'abs', parent, html); box(n, x, y, w);
  place(n, { fontSize: size + 'px', lineHeight: 1.8, letterSpacing: '.04em', color }); return n;
}

// ================================================================= Act 1 — problem (0–16)
const FRAGS = [
  ['note', '口頭で報告済み'], ['msg', '見積もり、どこにありますか？'], ['notif', '新着メッセージ 12件'], ['cell', 'A12  =SUM(B2:B11)'],
  ['note', 'あとで入力します'], ['msg', '金額いくらでしたっけ'], ['notif', '未入力の日報 5件'], ['note', '担当：？'],
  ['msg', '先方から電話ありました'], ['cell', '見積一覧_最新_v3(2).xlsx'], ['note', '期日いつ？'], ['msg', '共有しておきます'],
  ['notif', '不在着信 3件'], ['note', '議事録どこ？'], ['cell', '顧客リスト_営業部.xlsx'], ['msg', '確認中です…'],
  ['note', '日報まだです'], ['notif', 'リマインダー：報告書'],
];
scene(0, 16, n => {
  const c = {};
  const R = rng(11);
  c.frags = FRAGS.map(([k, s], i) => {
    const d = el('div', 'frag ' + k, n, s);
    const x = 80 + R() * 1560, y = 70 + R() * 880;
    d._p = { x, y, r: (R() - .5) * 10, vx: (R() - .5) * 26, vy: (R() - .5) * 18, a: .15 + i * .2, z: .7 + R() * .5 };
    return d;
  });
  c.dim = el('div', 'fill', n); c.dim.style.background = 'radial-gradient(ellipse at 30% 55%, rgba(11,14,20,.92), rgba(11,14,20,.55) 70%)';
  c.p = [['Problem 01', '情報が、人にとどまる。', '口頭報告や個人のメモに残り、必要な人へ届かない。', 4.0],
         ['Problem 02', '入力と報告に、時間がかかる。', '同じ内容を、いくつもの台帳やシステムへ繰り返し入力。', 7.5],
         ['Problem 03', '経営状況が、見えにくい。', '集計を待つあいだに、判断がどうしても後手になる。', 11.0]].map(([l, h, s, a]) => ({
    l: lbl(n, l, M, 420, '#7fb6ef'), h: hl(n, [h], M, 460, 84, '#fff'), s: sub(n, s, M, 590, 1200, 'rgba(255,255,255,.62)'), a,
  }));
  c.dot = el('div', 'abs', n); box(c.dot, W / 2 - 10, H / 2 - 10, 20, 20); place(c.dot, { borderRadius: '50%', background: '#3fb0ff', boxShadow: '0 0 30px #3fb0ff' });
  return c;
}, (t, c) => {
  const col = E.inCubic(prog(t, 14.4, 15.4));
  c.frags.forEach(d => {
    const p = d._p;
    const o = E.outCubic(prog(t, p.a, p.a + .5));
    const x = p.x + p.vx * t, y = p.y + p.vy * t;
    const cx = lerp(x, W / 2 - 60, col), cy = lerp(y, H / 2 - 20, col);
    d.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) rotate(${p.r}deg) scale(${(p.z * (1 - col * .9)).toFixed(3)})`;
    d.style.left = '0'; d.style.top = '0';
    d.style.opacity = (o * (1 - col)).toFixed(3);
    d.style.filter = p.z < .85 ? 'blur(1.5px)' : 'none';
  });
  show(c.dim, win(t, 3.6, 14.6, .6, .5));
  c.p.forEach(({ l, h, s, a }) => {
    const b = a + 3.4;
    show(l, win(t, a + .05, b, .35, .3));
    revealLines(h, t, a + .1, { dur: .7, out: b - .35, outDur: .3 });
    if (t < a || t > b) show(h, 0);
    setT(s, { y: lerp(10, 0, E.outCubic(prog(t, a + .4, a + .9))), o: win(t, a + .4, b, .45, .3) });
  });
  const d = win(t, 15.2, 16, .2, 0);
  setT(c.dot, { o: d, s: 1 + .15 * Math.sin(t * 12) });
});

// ================================================================= Act 2 — demo (16–76)
const SAID = '今日、山田工務店さんに外壁塗装の見積もりを出しました。金額は120万円、お返事は来週の金曜日です。';
scene(16, 44, n => {
  const c = {};
  c.bg = el('div', 'fill light dotgrid', n);
  // copy blocks per step
  c.c1 = { l: lbl(n, 'NMClaw — AI operations platform', M, 300), h: hl(n, ['話すだけで、', '会社の情報が整理される。'], M, 340, 76),
           s: sub(n, 'PCを開かなくても、話す・送るだけ。<br>いつもの言葉で、現場の状況をそのまま共有。', M, 580, 800) };
  c.c2 = { l: lbl(n, 'AI hearing', M, 300), h: hl(n, ['足りない情報は、', 'AIが聞き返す。'], M, 340, 76),
           s: sub(n, '顧客、案件、金額、期日。<br>抜け漏れを、その場で防ぐ。', M, 580, 800) };
  c.c3 = { l: lbl(n, 'Auto sort', M, 110), h: hl(n, ['会社のルールで、自動で振り分け。'], M, 150, 56),
           s: sub(n, '会話から顧客・案件・売上・タスク・日報を判断し、適切な項目へ。', M, 236, 1200, '#5b6b85', 22) };
  // phone
  c.ph = phone(n, 1250, 110, { app: 'NMClaw' });
  const S = c.ph.screen;
  c.mic = el('div', 'abs', S); box(c.mic, 146, 560, 120, 120);
  place(c.mic, { borderRadius: '50%', background: BLUE, display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 12px 40px rgba(22,104,196,.45)' });
  c.mic.appendChild(icon('mic', 52, '#fff'));
  c.rings = [0, 1, 2].map(() => { const r = el('div', 'abs', S); box(r, 146, 560, 120, 120); place(r, { borderRadius: '50%', border: '2px solid rgba(22,104,196,.5)' }); return r; });
  c.cv = el('canvas', 'abs', S); c.cv.width = 340; c.cv.height = 90; box(c.cv, 26, 440, 340, 90);
  c.hint = el('div', 'abs', S, '話しかけてください'); place(c.hint, { left: 0, right: 0, top: '720px', textAlign: 'center', font: '500 17px SANS', color: '#5b6b85' });
  c.b1 = el('div', 'bubble me', S); place(c.b1, { top: '160px' });
  c.b2 = el('div', 'bubble ai', S, '<span class="who">NMCLAW AI</span>ありがとうございます。先方のご担当者は、どなたですか？'); place(c.b2, { top: '360px' });
  c.b3 = el('div', 'bubble me', S, '佐藤さんです。'); place(c.b3, { top: '490px' });
  c.b4 = el('div', 'bubble ai', S); place(c.b4, { top: '560px' });
  c.b4.innerHTML = '<span class="who">NMCLAW AI</span>登録しました。10/9（金）に「回答確認」のタスクを作成します。';
  // cards for auto sort
  const cards = [['顧客', 'db', 760, 330], ['案件', 'doc', 1100, 330], ['売上', 'chart', 1440, 330], ['タスク', 'check', 760, 640], ['日報', 'chat', 1100, 640]];
  c.cards = cards.map(([name, ic, x, y]) => {
    const k = el('div', 'uicard', n); box(k, x, y, 320, 270);
    const hd = el('div', '', k); place(hd, { display: 'flex', alignItems: 'center', gap: '12px', padding: '22px 24px 14px', borderBottom: '1px solid rgba(11,26,51,.07)' });
    hd.appendChild(icon(ic, 26, BLUE)); el('span', '', hd, name).style.cssText = 'font:700 22px SANS';
    k._rows = el('div', '', k); place(k._rows, { padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: '10px' });
    return k;
  });
  const TOK = [['顧客', '山田工務店（担当：佐藤様）', 0, 33.0], ['案件', '外壁塗装 見積もり', 1, 34.0], ['金額', '¥1,200,000', 2, 35.0],
               ['期日', '10/9（金）', 3, 36.0], ['タスク', '回答確認', 3, 37.0], ['日報', '見積もり提出 1件', 4, 38.0]];
  c.tok = TOK.map(([k, v, ci, a]) => {
    const d = el('div', 'token', n, `<b>${k}</b>${v}`); place(d, { left: 0, top: 0 });
    const row = el('div', '', c.cards[ci]._rows, `<span style="font:600 12px LATIN;letter-spacing:.18em;color:#5b6b85;margin-right:12px">${k}</span>${v}`);
    place(row, { font: '600 19px SANS', color: INK, opacity: 0 });
    return { d, row, ci, a };
  });
  c.store = sub(n, '<span style="color:#1668c4;font-weight:700">✓</span>　業務データとして蓄積。会社のルールに沿って整理し、安全に保存。', 760, 950, 1100, '#0b1a33', 22);
  return c;
}, (t, c) => {
  show(c.bg, 1);
  // copy
  const cp = (o, a, b) => { show(o.l, win(t, a, b, .4, .3)); revealLines(o.h, t, a + .15, { stag: .15, out: b - .45, outDur: .35 }); if (t < a || t > b) show(o.h, 0); setT(o.s, { y: lerp(10, 0, E.outCubic(prog(t, a + .6, a + 1.1))), o: win(t, a + .6, b, .5, .3) }); };
  cp(c.c1, 16.4, 24); cp(c.c2, 24.2, 32); cp(c.c3, 32.2, 44);
  // phone position: right → left and smaller for auto sort
  const mv = E.inOutCubic(prog(t, 31.6, 32.6));
  const pin = E.outCubic(prog(t, 16.2, 17.2));
  c.ph.root.style.transform = `translate(${lerp(lerp(120, 0, pin), -1122, mv).toFixed(1)}px, ${lerp(0, 215, mv).toFixed(1)}px) scale(${lerp(1, .74, mv).toFixed(4)})`;
  c.ph.root.style.transformOrigin = '0 0';
  c.ph.root.style.opacity = pin;
  // mic + waveform + transcript
  const listening = t >= 17.2 && t < 22.6;
  c.rings.forEach((r, i) => {
    const ph = ((t - 17.2 + i * .45) % 1.35) / 1.35;
    r.style.opacity = listening ? (1 - ph) * .8 : 0;
    r.style.transform = `scale(${1 + ph * .9})`;
  });
  const micOut = E.inCubic(prog(t, 23.6, 24.2));
  pop(c.mic, t, 16.6, { out: 23.6 });
  show(c.hint, win(t, 16.8, 17.8, .3, .3));
  wave(c.cv, t, listening ? .5 + .5 * Math.abs(Math.sin(t * 2.2)) : 0);
  show(c.cv, win(t, 17.2, 23.8, .3, .4));
  type(c.b1, SAID, t, 18.0, 4.4);
  pop(c.b1, t, 17.9);
  c.b1.style.top = lerp(160, 90, E.inOutCubic(prog(t, 24.0, 24.6))) + 'px';
  pop(c.b2, t, 24.8); pop(c.b3, t, 26.8); pop(c.b4, t, 28.4);
  void micOut;
  // tokens fly to cards
  const cardsIn = t >= 32.4;
  c.cards.forEach((k, i) => { if (cardsIn) pop(k, t, 32.5 + i * .12, { dy: 24 }); else show(k, 0); });
  c.tok.forEach(({ d, row, ci, a }, i) => {
    const k = c.cards[ci];
    const x0 = 180, y0 = 430;                   // from the phone's transcript
    const x1 = parseFloat(k.style.left) + 24, y1 = parseFloat(k.style.top) + 90 + (ci === 3 && i === 4 ? 44 : 0);
    const p = E.inOutCubic(prog(t, a - .45, a));
    const vis = t >= a - .5 && t < a + .05;
    d.style.opacity = vis ? 1 : 0; d.style.visibility = vis ? 'visible' : 'hidden';
    const arc = Math.sin(p * Math.PI) * -80;
    d.style.transform = `translate(${lerp(x0, x1, p).toFixed(1)}px, ${(lerp(y0, y1, p) + arc).toFixed(1)}px) scale(${lerp(1, .9, p).toFixed(3)})`;
    row.style.opacity = t >= a ? E.outCubic(prog(t, a, a + .3)) : 0;
    const flash = t >= a ? Math.exp(-(t - a) * 3) : 0;
    k.style.boxShadow = `0 18px 48px rgba(11,26,51,.10), 0 0 0 ${(1 + flash * 2).toFixed(2)}px rgba(22,104,196,${(.08 + flash * .8).toFixed(3)})`;
  });
  setT(c.store, { y: lerp(10, 0, E.outCubic(prog(t, 40.2, 40.8))), o: win(t, 40.2, 44, .5, .3) });
});

// dashboard 44–56
scene(44, 56, n => {
  const c = {};
  el('div', 'fill light dotgrid', n);
  c.h = hl(n, ['散らばる情報が、判断できるデータに。'], M, 70, 56);
  c.win = el('div', 'uicard', n); box(c.win, M, 180, W - 2 * M, 840); c.win.style.overflow = 'hidden';
  const side = el('div', '', c.win); place(side, { position: 'absolute', left: 0, top: 0, bottom: 0, width: '220px', background: '#0b1a33', color: '#cfe0f5', padding: '28px 22px' });
  side.innerHTML = `<div style="display:flex;align-items:center;gap:10px;font:700 20px LATIN;color:#fff"><span style="width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#1668c4,#3fb0ff)"></span>NMClaw</div>
    ${['ダッシュボード', 'AIチャット', '顧客', '案件', '売上', 'タスク', '日報', 'レポート'].map((s, i) => `<div style="margin-top:${i ? 16 : 36}px;font:500 16px SANS;opacity:${i ? .6 : 1};${i ? '' : 'color:#fff'}">${s}</div>`).join('')}`;
  const kp = [['今月の売上', 18750000, v => '¥' + Math.round(v).toLocaleString('en-US')], ['進行中の案件', 128, v => Math.round(v)], ['今週のタスク', 34, v => Math.round(v)], ['対応漏れ', 0, v => Math.round(v)]];
  c.kpi = kp.map(([name, to, f], i) => {
    const k = el('div', 'uicard kpi', c.win); box(k, 260 + i * 350, 36, 320, 150); k.style.padding = '24px 26px';
    k.innerHTML = `<div class="h">${name}</div><div class="v">0</div>`;
    return { k, v: k.querySelector('.v'), to, f };
  });
  // bar chart
  c.chart = el('div', 'uicard', c.win); box(c.chart, 260, 216, 900, 360); c.chart.style.padding = '24px 28px';
  c.chart.innerHTML = '<div class="h">売上推移</div>';
  c.bars = [42, 55, 49, 68, 74, 88].map((v, i) => {
    const b = el('div', 'abs', c.chart); box(b, 60 + i * 135, 300, 64, 0); place(b, { background: i === 5 ? BLUE : '#9cc3ee', borderRadius: '8px 8px 2px 2px', bottom: '46px', top: 'auto' });
    const m = el('div', 'abs', c.chart, (i + 4) + '月'); box(m, 60 + i * 135, 318); place(m, { width: '64px', textAlign: 'center', font: '500 15px SANS', color: '#5b6b85' });
    return { b, v };
  });
  // pipeline donut
  c.donut = el('div', 'uicard', c.win); box(c.donut, 1190, 216, 312, 360); c.donut.style.padding = '24px 28px';
  c.donut.innerHTML = `<div class="h">案件ステータス</div><svg width="256" height="256" viewBox="0 0 256 256" style="margin-top:14px">
    <circle cx="128" cy="128" r="92" fill="none" stroke="#e7eef7" stroke-width="26"/>
    <circle class="a" cx="128" cy="128" r="92" fill="none" stroke="#1668c4" stroke-width="26" stroke-dasharray="578" stroke-dashoffset="578" transform="rotate(-90 128 128)"/>
    <circle class="b" cx="128" cy="128" r="92" fill="none" stroke="#3fb0ff" stroke-width="26" stroke-dasharray="578" stroke-dashoffset="578" transform="rotate(126 128 128)"/>
    <text x="128" y="136" text-anchor="middle" style="font:300 44px LATIN;fill:#0b1a33">128</text></svg>`;
  // AI summary
  c.sum = el('div', 'uicard', c.win); box(c.sum, 260, 606, 900, 200); c.sum.style.padding = '24px 28px';
  c.sum.innerHTML = '<div class="h">AI 週次サマリー</div><div class="tx" style="font:500 22px/1.8 SANS;margin-top:14px;color:#0b1a33"></div>';
  c.sumTx = c.sum.querySelector('.tx');
  c.tasks = el('div', 'uicard', c.win); box(c.tasks, 1190, 606, 312, 200); c.tasks.style.padding = '24px 28px';
  c.tasks.innerHTML = '<div class="h">今日のタスク</div>' + ['回答確認　山田工務店', '見積もり作成　2件', '請求書送付'].map((s, i) =>
    `<div style="margin-top:${i ? 10 : 18}px;font:500 17px SANS;display:flex;gap:10px;align-items:center"><span style="width:16px;height:16px;border-radius:5px;border:2px solid #1668c4"></span>${s}</div>`).join('');
  c.alert = el('div', 'uicard', n); box(c.alert, W - M - 520, 900, 480, 96);
  place(c.alert, { display: 'flex', alignItems: 'center', gap: '18px', padding: '0 26px', background: '#0b1a33', color: '#fff' });
  c.alert.appendChild(icon('bell', 34, '#f0b44c'));
  el('div', '', c.alert, '<div style="font:700 20px SANS">期日が近い案件が2件あります</div><div style="font:500 15px SANS;opacity:.7;margin-top:4px">回答確認：山田工務店　ほか1件</div>');
  return c;
}, (t, c) => {
  revealLines(c.h, t, 44.2, { out: 55.6, outDur: .35 });
  pop(c.win, t, 44.1, { dy: 40, s0: .98 });
  c.kpi.forEach(({ k, v, to, f }, i) => { pop(k, t, 44.5 + i * .12); v.textContent = f(to * E.outExpo(prog(t, 44.6 + i * .12, 46.2 + i * .12))); });
  pop(c.chart, t, 45.0);
  c.bars.forEach(({ b, v }, i) => { b.style.height = (v * 2.6 * E.outCubic(prog(t, 45.4 + i * .15, 46.4 + i * .15))).toFixed(1) + 'px'; });
  pop(c.donut, t, 45.2);
  c.donut.querySelector('.a').setAttribute('stroke-dashoffset', (578 - 578 * .58 * E.outCubic(prog(t, 45.6, 47))).toFixed(1));
  c.donut.querySelector('.b').setAttribute('stroke-dashoffset', (578 - 578 * .27 * E.outCubic(prog(t, 46.0, 47.4))).toFixed(1));
  pop(c.sum, t, 46.4); pop(c.tasks, t, 46.6);
  type(c.sumTx, '今週は新規見積もり12件。回答待ち3件のうち、2件が期日間近です。優先して確認しましょう。', t, 47.0, 3.2);
  const a = E.outBack(prog(t, 50.5, 51.1));
  c.alert.style.transform = `translateX(${lerp(600, 0, clamp(a)).toFixed(1)}px)`;
  show(c.alert, win(t, 50.5, 56, .1, .3));
});

// features 56–68
const FEATS = [['01', 'mic', '音声・チャット入力', 'PCを開かなくても、話す・送る\nという自然な操作で情報を残せる。'],
  ['02', 'ask', 'AIヒアリング', '不足している内容をAIが確認し、\n情報の抜け漏れを減らす。'],
  ['03', 'sort', 'データを自動で振り分け', '顧客、案件、売上、タスク、日報を\n判断し、適切な項目へ分類・保存。'],
  ['04', 'doc', '業務サマリー', '日次・週次の状況を、必要な人へ\n読みやすくまとめて届ける。'],
  ['05', 'bell', 'アラート・タスク化', '期日や対応漏れを見つけ、\n次にすべき行動を明確にする。'],
  ['06', 'chart', '可視化してアウトプット', 'ダッシュボード、グラフ、レポートで\n判断や共有に使える形に。']];
scene(56, 68, n => {
  const c = {};
  el('div', 'fill light dotgrid', n);
  c.l = lbl(n, 'Features', M, 96);
  c.h = hl(n, ['NMClawで、実現できること。'], M, 130, 56);
  c.tiles = FEATS.map(([no, ic, ti, d], i) => {
    const x = M + (i % 3) * 564, y = 280 + Math.floor(i / 3) * 360;
    const k = el('div', 'uicard feat', n); box(k, x, y, 536, 330); k.style.padding = '34px 38px';
    const top = el('div', '', k); place(top, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
    el('div', 'n', top, no); top.appendChild(icon(ic, 44, BLUE));
    el('div', 't', k, ti); el('div', 'd', k, d.replace('\n', '<br>'));
    return k;
  });
  return c;
}, (t, c) => {
  show(c.l, win(t, 56.1, 68, .4, .3));
  revealLines(c.h, t, 56.2, { out: 67.6, outDur: .35 });
  c.tiles.forEach((k, i) => {
    pop(k, t, 56.5 + i * .5, { dy: 30, out: 67.6 });
    const hi = 60 + i * 1.3;
    const on = t >= hi && t < hi + 1.3;
    const f = on ? Math.sin(Math.PI * (t - hi) / 1.3) : 0;
    k.style.boxShadow = `0 ${18 + f * 20}px ${48 + f * 30}px rgba(11,26,51,${(.10 + f * .08).toFixed(3)}), 0 0 0 ${(1 + f * 1.5).toFixed(2)}px rgba(22,104,196,${(.05 + f * .6).toFixed(3)})`;
  });
});

// flow 68–76
const FLOW = [['01', 'チャット・音声で入力'], ['02', 'AIが内容を理解'], ['03', 'データを自動振り分け'], ['04', '業務データとして蓄積'], ['05', '可視化してアウトプット']];
scene(68, 76, n => {
  const c = {};
  el('div', 'fill light dotgrid', n);
  c.l = lbl(n, 'How it works', M, 300);
  c.h = hl(n, ['入力から、可視化まで。ひとつの流れで。'], M, 340, 60);
  c.rule = el('div', 'abs', n); box(c.rule, M + 120, 620, W - 2 * M - 240, 2); place(c.rule, { background: BLUE, transformOrigin: '0 50%' });
  const step = (W - 2 * M - 240) / 4;
  c.nodes = FLOW.map(([no, s], i) => {
    const x = M + 120 + i * step;
    const dot = el('div', 'abs', n); box(dot, x - 13, 607, 26, 26); place(dot, { borderRadius: '50%', background: '#fff', border: `3px solid ${BLUE}` });
    const tx = el('div', 'abs', n, `<div style="font:300 34px LATIN;color:${BLUE}">${no}</div><div style="font:700 24px SANS;margin-top:10px;color:${INK}">${s}</div>`);
    box(tx, x - 150, 670); place(tx, { width: '300px', textAlign: 'center' });
    return { dot, tx };
  });
  return c;
}, (t, c) => {
  show(c.l, win(t, 68.1, 76, .4, .3));
  revealLines(c.h, t, 68.2, { out: 75.5, outDur: .4 });
  drawLine(c.rule, t, 68.6, 4.0, E.inOutSine);
  c.rule.style.opacity = clamp((76 - t) / .4);
  c.nodes.forEach(({ dot, tx }, i) => { pop(dot, t, 68.6 + i, { dy: 0, s0: .3, out: 75.5 }); pop(tx, t, 68.7 + i, { out: 75.5 }); });
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
  c.note = el('div', 'abs cap', n, '※画面はイメージです。登場する社名・金額などは架空のものです。'); box(c.note, M, 1000); c.note.style.color = 'rgba(11,26,51,.5)';
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
const CH = [[16, 24, '01 — Voice & chat'], [24, 32, '02 — AI hearing'], [32, 44, '03 — Auto sort'], [44, 56, '04 — Dashboard'], [56, 68, '05 — Features'], [68, 76, '06 — Flow']];
hooks.after.push(t => {
  show(hud, Math.min(win(t, 16.6, 75.6, .5, .4), 1));
  const ch = CH.find(c => t >= c[0] && t < c[1]);
  tr.textContent = ch ? ch[2] : '';
  tl.style.color = '#1668c4'; tr.style.color = 'rgba(11,26,51,.5)';
  $('#fade').style.opacity = E.inOutSine(prog(t, 84.6, 86)).toFixed(3);
  $('#vignette').style.opacity = t < 16 ? 1 : .15;
  $('#grain').style.opacity = t < 16 ? .055 : .03;
});

film({ duration: 86, fps: 30, audio: '../assets/nmclaw_score.mp3' });
})();
