/* Film 02 — 「やるか、やらないか。」 a portrait of 松井 亮 (144 s, 80 BPM: bar 3 s).
 * Words are Matsui's own, from NEXTMAKE's official YouTube channel (lightly cleaned for reading).
 * Cinematic grammar: letterboxed photo passages, black typographic passages, vertical Mincho for the motto.
 */
(() => {
'use strict';
const { W, H, clamp, lerp, prog, E, win, $, el, place, box, show, setT, lines, revealLines, chars, fadeChars,
  photo, kb, wipe, drawLine, count, MARK, logo, buildLogo, scene, hooks, film } = NM;
const M = 160;
const LB = 138;                      // letterbox bar height (2.39:1)
const CAP_Y = 770;                   // caption baseline area inside the letterbox

// ----------------------------------------------------------------- helpers
function vtext(parent, str, css, cls = '') {
  const n = chars(parent, str, css, 'v serif ' + cls);
  return n;
}
function cine(parent, name, b) { return photo(parent, name, b, { cls: 'cine' }); }
function quoteBlock(parent, arr, y, size = 46, x = M) {
  return lines(parent, arr, { left: x + 'px', top: y + 'px', fontSize: size + 'px', lineHeight: 1.55 }, 'serif');
}
function sub(parent, html, x, y, size = 22) {
  const n = el('div', 'abs muted', parent, html); box(n, x, y); place(n, { fontSize: size + 'px', letterSpacing: '.08em', lineHeight: 1.8 });
  return n;
}
/** chapter card: thin numeral, drawn hairline, Mincho title, Latin subtitle */
function chapter(n, no, title, en) {
  const c = { root: el('div', 'fill', n) };
  c.no = lines(c.root, [no], { left: M + 'px', top: '360px', fontSize: '120px' }, 'num');
  c.rule = el('div', 'hair', c.root); box(c.rule, M, 520, 160, 1);
  c.ti = lines(c.root, [title], { left: M + 'px', top: '552px', fontSize: '76px' }, 'serif');
  c.en = el('div', 'abs label muted', c.root, en); box(c.en, M + 4, 676);
  return c;
}
function chapterUpdate(c, t, a, b = a + 2.4) {
  show(c.root, t >= a && t < b ? 1 : 0);
  if (t < a || t >= b) return;
  revealLines(c.no, t, a + .05, { dur: .9, out: b - .45, outDur: .4 });
  drawLine(c.rule, t, a + .25, .9);
  c.rule.style.opacity = clamp((b - .2 - t) / .3);
  revealLines(c.ti, t, a + .35, { dur: .9, out: b - .45, outDur: .4 });
  show(c.en, win(t, a + .6, b - .1, .5, .35));
}
/** photo that is visible in [a, b) with a soft cross-dissolve in */
function photoSpan(p, t, a, b, fi = .6, kbOpts = {}) {
  const vis = t >= a && t < b;
  show(p, vis ? E.inOutSine(clamp((t - a) / fi)) : 0);
  if (vis) kb(p, t, a, b, Object.assign({ s0: 1.06, s1: 1.0 }, kbOpts));
}

// ================================================================= 0–12 Cold open
scene(0, 12, n => {
  const c = {};
  c.a = vtext(n, 'できるか、\nできないか。', { left: '1130px', top: '250px', fontSize: '60px', letterSpacing: '.14em', lineHeight: 1.9 });
  c.b = vtext(n, 'やるか、\nやらないか。', { left: '700px', top: '190px', fontSize: '120px', letterSpacing: '.1em', lineHeight: 1.6 });
  return c;
}, (t, c) => {
  fadeChars(c.a, t, .8, { stag: .1, dur: 1.2 });
  const dim = lerp(1, .26, E.inOutSine(prog(t, 5.0, 6.2)));
  const out = 1 - E.inOutSine(prog(t, 10.6, 11.7));
  c.a.style.opacity = dim * out;
  fadeChars(c.b, t, 6.1, { stag: .14, dur: 1.1, dy: 18 });
  c.b.style.opacity = out * (t >= 6.1 ? 1 : 0);
});

// ================================================================= 12–18 Name card
scene(12, 18, n => {
  const c = {};
  c.ph = cine(n, 'matsui_aupp', [1080, 140, 600, 800]);
  c.cap = el('div', 'abs cap muted', n, '2025.01　AUPP（プノンペン）にて'); box(c.cap, 1080, 960);
  c.lbl = el('div', 'abs label muted', n, 'Founder & CEO — NEXTMAKE Inc.'); box(c.lbl, M, 360);
  c.name = lines(n, ['松井 亮'], { left: M - 6 + 'px', top: '400px', fontSize: '150px', letterSpacing: '.12em' }, 'serif');
  c.ro = el('div', 'abs latin', n, 'AKIRA MATSUI'); box(c.ro, M, 610); place(c.ro, { fontSize: '26px', fontWeight: 300, letterSpacing: '.62em' });
  c.rule = el('div', 'hair', n); box(c.rule, M, 680, 520, 1);
  c.desc = sub(n, '株式会社ネクストメイク　代表取締役社長<br>大阪生まれ、大阪育ち。2018年、大阪で創業。', M, 712, 22);
  return c;
}, (t, c) => {
  const out = 1 - E.inOutSine(prog(t, 17.3, 18));
  wipe(c.ph, t, 12.15, 1.1, 'up', E.inOutQuart);
  c.ph.style.opacity = out;
  kb(c.ph, t, 12, 18, { s0: 1.1, s1: 1.02, ease: E.outCubic });
  show(c.cap, win(t, 13.2, 18, .6, .7));
  show(c.lbl, win(t, 12.6, 18, .6, .7));
  revealLines(c.name, t, 12.8, { dur: 1.1 });
  c.name.style.opacity = out;
  show(c.ro, win(t, 13.4, 18, .7, .7));
  drawLine(c.rule, t, 13.6, 1.0); c.rule.style.opacity = out;
  setT(c.desc, { y: lerp(10, 0, E.outCubic(prog(t, 14, 14.8))), o: win(t, 14, 18, .6, .7) });
});

// ================================================================= 18–33 Ch.1 一言
scene(18, 33, n => {
  const c = {};
  c.ch = chapter(n, '01', '一言', 'The words');
  // manga inset (the CEO's autobiographical manga on the official site)
  c.mg = photo(n, 'manga_admire', [930, 250, 820, 503], { raw: true });
  c.mg.style.background = '#fff';
  c.mgcap = el('div', 'abs cap muted', n, '自伝マンガ『夢を信じたネクマックス』より（NEXTMAKE公式サイト）'); box(c.mgcap, 930, 775);
  c.m1 = quoteBlock(n, ['新卒で入った会社で、', '憧れの人に出会う。'], 400, 48);
  c.m2 = sub(n, '「ここまで強く共感したことは、人生で初めてだった」', M, 580, 22);
  c.p1 = cine(n, 'crowd_blur'); c.p2 = cine(n, 'office_window');
  c.s = el('div', 'scrim-b', n);
  c.t2 = quoteBlock(n, ['26歳、営業の部署にいた頃。', '「私、できるかな。いや、できないと思う」'], CAP_Y - 66, 44);
  c.t2b = sub(n, '——そう口にする人間だった。', M, CAP_Y + 82, 22);
  c.t3 = quoteBlock(n, ['たまたま、営業本部長がそれを聞いていた。'], CAP_Y, 42);
  c.q = lines(n, ['「できるできないじゃねえんだよ。', '　やるかやらないかなんだよ」'], { left: M + 'px', top: '400px', fontSize: '72px', lineHeight: 1.6 }, 'serif');
  return c;
}, (t, c) => {
  chapterUpdate(c.ch, t, 18);
  const vm = t >= 20.4 && t < 23.6;
  if (vm) { wipe(c.mg, t, 20.5, .9, 'up', E.inOutQuart); c.mg.style.opacity = clamp((23.6 - t) / .35); kb(c.mg, t, 20.4, 23.6, { s0: 1.04, s1: 1.0 }); } else show(c.mg, 0);
  show(c.mgcap, win(t, 21.0, 23.5, .5, .3));
  revealLines(c.m1, t, 20.7, { stag: .35, out: 23.1, outDur: .4 }); if (t < 20.7 || t > 23.6) show(c.m1, 0);
  show(c.m2, win(t, 21.5, 23.4, .5, .3));
  photoSpan(c.p1, t, 23.6, 26.6, .7, { s0: 1.08, s1: 1.08, x0: 60, x1: -40 });
  photoSpan(c.p2, t, 26.6, 29.2, .5, { s0: 1.1, s1: 1.04 });
  show(c.s, t >= 23.6 && t < 29.2 ? 1 : 0);
  revealLines(c.t2, t, 23.9, { stag: .6, out: 26.2, outDur: .4 }); if (t < 23.9 || t > 26.7) show(c.t2, 0);
  show(c.t2b, win(t, 25.0, 26.5, .4, .3));
  revealLines(c.t3, t, 26.9, { out: 28.8, outDur: .4 }); if (t < 26.9 || t > 29.2) show(c.t3, 0);
  revealLines(c.q, t, 29.5, { stag: 1.1, dur: 1.0, out: 32.3, outDur: .55 }); if (t < 29.5) show(c.q, 0);
});

// ================================================================= 33–45 Ch.2 ゼロから
scene(33, 45, n => {
  const c = {};
  c.ch = chapter(n, '02', 'ゼロから', 'From zero');
  c.t0 = quoteBlock(n, ['その一言が、いまも座右の銘になっている。'], 500, 50);
  c.p = cine(n, 'osaka_street'); c.s = el('div', 'scrim-b', n);
  c.lbl = el('div', 'abs label muted', n, 'Osaka — 2018.01'); box(c.lbl, M, CAP_Y - 46);
  c.t1 = quoteBlock(n, ['2018年1月、大阪で株式会社NEXT MAKEを設立。'], CAP_Y, 42);
  c.num = lines(n, ['0'], { left: M - 16 + 'px', top: '250px', fontSize: '300px' }, 'num');
  c.q = quoteBlock(n, ['「何かを始める前は、0。', '　前に進んだら、たった0.1%だっていい」'], 640, 50);
  return c;
}, (t, c) => {
  chapterUpdate(c.ch, t, 33);
  revealLines(c.t0, t, 35.6, { out: 37.6, outDur: .4 }); if (t < 35.6 || t > 38) show(c.t0, 0);
  photoSpan(c.p, t, 38.0, 41.0, .7, { s0: 1.1, s1: 1.03 });
  show(c.s, t >= 38 && t < 41 ? 1 : 0);
  show(c.lbl, win(t, 38.3, 41, .5, .3));
  revealLines(c.t1, t, 38.4, { out: 40.6, outDur: .4 }); if (t < 38.4 || t > 41) show(c.t1, 0);
  const vn = t >= 41 && t < 45;
  if (vn) {
    revealLines(c.num, t, 41.1, { dur: .9, out: 44.4, outDur: .5 });
    const p = E.inOutCubic(prog(t, 42.4, 43.4));
    c.num._lines[0].textContent = p <= 0 ? '0' : p < 1 ? (p * .1).toFixed(2) + '%' : '0.1%';
  } else show(c.num, 0);
  revealLines(c.q, t, 41.5, { stag: .9, out: 44.4, outDur: .5 }); if (t < 41.5) show(c.q, 0);
});

// ================================================================= 45–63 Ch.3 好奇心
let IDOTS = [];
hooks.preload.push(async () => { IDOTS = await fetch('../assets/indochina_dots.json').then(r => r.json()); });
const PX = 120, LON0 = 96, LAT0 = 16.4;
const mp = (lon, lat) => [(lon - LON0) * PX, (LAT0 - lat) * PX];
scene(45, 63, n => {
  const c = {};
  c.ch = chapter(n, '03', '好奇心', 'Curiosity');
  c.q = lines(n, ['「好奇心が、止まらないんです」'], { left: 0, right: 0, top: '470px', fontSize: '84px', textAlign: 'center' }, 'serif');
  c.at = el('div', 'abs attrib', n, '— Akira Matsui'); place(c.at, { left: 0, right: 0, top: '620px', textAlign: 'center' });
  c.cv = el('canvas', 'fill', n); c.cv.width = W; c.cv.height = H; c.g = c.cv.getContext('2d');
  c.m1 = quoteBlock(n, ['2023年、ベトナムで会社をつくった頃。', '隣の国カンボジアで働く経営者たちと出会う。'], 250, 40);
  c.m2 = quoteBlock(n, ['「カンボジア、どこですか？」', '「隣だよ。バスで6時間」'], 250, 48);
  c.p = cine(n, 'angkor'); c.s = el('div', 'scrim-b', n);
  c.p1 = quoteBlock(n, ['遊び半分で、バスに揺られて6時間。'], CAP_Y, 44);
  c.p2 = quoteBlock(n, ['早く着きすぎて、プールで泳いでいたら――', 'びしょ濡れのまま、初対面。'], CAP_Y - 40, 44);
  c.p3 = el('div', 'abs serif', n, '「君が松井君か」'); box(c.p3, 1340, CAP_Y + 40); place(c.p3, { fontSize: '34px', color: 'var(--mist)' });
  return c;
}, (t, c) => {
  chapterUpdate(c.ch, t, 45);
  revealLines(c.q, t, 47.6, { dur: 1.1, out: 50.5, outDur: .5 }); if (t < 47.6 || t > 51) show(c.q, 0);
  show(c.at, win(t, 48.7, 50.9, .6, .4));
  // map 51–57
  const g = c.g, vm = t >= 51 && t < 57;
  show(c.cv, vm ? win(t, 51, 57, .6, .4) : 0);
  if (vm) {
    g.clearRect(0, 0, W, H);
    const [vx, vy] = mp(106.7, 10.8), [px, py] = mp(104.9, 11.6);
    const rev = (t - 51) * 1400;
    g.fillStyle = 'rgba(255,255,255,.22)';
    for (const [lon, lat] of IDOTS) {
      const [x, y] = mp(lon, lat);
      const a = clamp((rev - Math.hypot(x - vx, y - vy)) / 300);
      if (a <= 0) continue;
      g.globalAlpha = a; g.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
    }
    g.globalAlpha = 1;
    const rp = E.inOutCubic(prog(t, 54.0, 55.6));
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.6; g.setLineDash([8, 8]);
    const mx = (vx + px) / 2 + 40, my = (vy + py) / 2 + 70;
    g.beginPath();
    for (let k = 0; k <= 50 * rp; k++) {
      const s = k / 50, u = 1 - s;
      const X = u * u * vx + 2 * u * s * mx + s * s * px, Y = u * u * vy + 2 * u * s * my + s * s * py;
      k ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.stroke(); g.setLineDash([]);
    const node = (x, y, label, a, right) => {
      if (a <= 0) return;
      g.globalAlpha = a;
      g.strokeStyle = 'rgba(92,192,255,.9)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 14, 0, 6.283); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 4, 0, 6.283); g.fill();
      g.font = '500 16px LATIN'; if (g.letterSpacing !== undefined) g.letterSpacing = '4px';
      g.textAlign = right ? 'left' : 'right'; g.fillText(label, x + (right ? 26 : -26), y + 6);
      g.globalAlpha = 1;
    };
    node(vx, vy, 'VIETNAM', E.outCubic(prog(t, 51.3, 52)), true);
    node(px, py, 'PHNOM PENH, CAMBODIA', E.outCubic(prog(t, 55.4, 56)), false);
    if (rp > .5) {
      g.globalAlpha = clamp((rp - .5) * 2); g.font = '500 14px LATIN'; g.fillStyle = 'rgba(255,255,255,.75)'; g.textAlign = 'left';
      g.fillText('BY BUS — 6 HOURS', mx - 60, my + 40); g.globalAlpha = 1;
    }
  }
  revealLines(c.m1, t, 51.5, { stag: .5, out: 53.7, outDur: .4 }); if (t < 51.5 || t > 54.2) show(c.m1, 0);
  revealLines(c.m2, t, 54.3, { stag: .9, out: 56.6, outDur: .4 }); if (t < 54.3 || t > 57) show(c.m2, 0);
  // photo 57–63
  photoSpan(c.p, t, 57, 63, .8, { s0: 1.12, s1: 1.03 });
  show(c.s, t >= 57 && t < 63 ? 1 : 0);
  revealLines(c.p1, t, 57.4, { out: 59.2, outDur: .4 }); if (t < 57.4 || t > 59.7) show(c.p1, 0);
  revealLines(c.p2, t, 59.6, { stag: 1.0, out: 62.4, outDur: .5 }); if (t < 59.6) show(c.p2, 0);
  show(c.p3, win(t, 61.3, 62.8, .5, .4));
});

// ================================================================= 63–81 Ch.4 提案
scene(63, 81, n => {
  const c = {};
  c.ch = chapter(n, '04', '提案', 'The proposal');
  c.q1 = quoteBlock(n, ['「2030年に、80万人のエンジニアが', '　足りなくなると言われてる」'], 420, 56);
  c.q1s = sub(n, 'だからこそ、海外の若い世代に教育を。それができたら、社会的に意義のある事業になる――。', M, 660, 22);
  c.p1 = cine(n, 'formal_gathering'); c.s1 = el('div', 'scrim-b', n);
  c.q2 = quoteBlock(n, ['「カンボジアの若い子たちを、僕が教えるので、', '　助けてもらえないか」'], CAP_Y - 50, 46);
  c.r0 = sub(n, '返ってきた言葉は、', M, 440, 26);
  c.r1 = lines(n, ['「本当に、やる気があるか」'], { left: M + 'px', top: '500px', fontSize: '76px' }, 'serif');
  c.p2 = cine(n, 'signing'); c.s2 = el('div', 'scrim-b', n);
  c.a1 = quoteBlock(n, ['「是非、やってみたいです」'], CAP_Y - 30, 54);
  c.a2 = el('div', 'abs label muted', n, '2024.08.27 — AUPP × NEXTMAKE 調印式'); box(c.a2, M, CAP_Y + 62);
  return c;
}, (t, c) => {
  chapterUpdate(c.ch, t, 63);
  revealLines(c.q1, t, 65.6, { stag: .8, out: 69.6, outDur: .5 }); if (t < 65.6 || t > 70.2) show(c.q1, 0);
  show(c.q1s, win(t, 67.2, 69.9, .6, .4));
  photoSpan(c.p1, t, 70, 75, .8, { s0: 1.08, s1: 1.02 });
  show(c.s1, t >= 70 && t < 75 ? 1 : 0);
  revealLines(c.q2, t, 70.4, { stag: .9, out: 74.5, outDur: .5 }); if (t < 70.4 || t > 75) show(c.q2, 0);
  show(c.r0, win(t, 75.2, 77.8, .5, .4));
  revealLines(c.r1, t, 75.8, { dur: 1.0, out: 77.5, outDur: .45 }); if (t < 75.8 || t > 78) show(c.r1, 0);
  photoSpan(c.p2, t, 78, 81, .5, { s0: 1.1, s1: 1.04 });
  show(c.s2, t >= 78 && t < 81 ? 1 : 0);
  revealLines(c.a1, t, 78.3, { out: 80.6, outDur: .4 }); if (t < 78.3 || t > 81) show(c.a1, 0);
  show(c.a2, win(t, 79.0, 80.9, .5, .3));
});

// ================================================================= 81–93 Ch.5 仲間
scene(81, 93, n => {
  const c = {};
  c.ch = chapter(n, '05', '仲間', 'Believers');
  c.p1 = cine(n, 'team_osaka'); c.p2 = cine(n, 'whiteboard');
  c.s = el('div', 'scrim-b', n); c.s.style.background = 'linear-gradient(0deg, rgba(8,10,16,.92), rgba(8,10,16,.5) 45%, rgba(8,10,16,.25))';
  c.t1 = quoteBlock(n, ['「本当に、0→1の事業だったんです」'], CAP_Y - 30, 46);
  c.t2 = quoteBlock(n, ['「半年間、何もすることがない時期もあった」'], CAP_Y - 30, 46);
  c.t3 = quoteBlock(n, ['「それでも僕を信じてついてきてくれたメンバーには、', '　今でも本当に感謝しています」'], CAP_Y - 60, 46);
  return c;
}, (t, c) => {
  chapterUpdate(c.ch, t, 81);
  photoSpan(c.p1, t, 83.4, 88.2, .9, { s0: 1.08, s1: 1.02 });
  photoSpan(c.p2, t, 88.2, 93, .8, { s0: 1.06, s1: 1.0 });
  show(c.s, t >= 83.4 ? 1 : 0);
  revealLines(c.t1, t, 83.8, { out: 85.4, outDur: .4 }); if (t < 83.8 || t > 85.9) show(c.t1, 0);
  revealLines(c.t2, t, 85.9, { out: 87.8, outDur: .4 }); if (t < 85.9 || t > 88.3) show(c.t2, 0);
  revealLines(c.t3, t, 88.6, { stag: 1.2, out: 92.5, outDur: .5 }); if (t < 88.6) show(c.t3, 0);
});

// ================================================================= 93–108 Ch.6 夢
scene(93, 108, n => {
  const c = {};
  c.ch = chapter(n, '06', '夢', 'Dreams');
  c.p1 = cine(n, 'class_teaching'); c.p2 = cine(n, 'it_start'); c.p3 = cine(n, 'ceremony_2026'); c.p4 = cine(n, 'students_cafe');
  c.s = el('div', 'scrim-b', n);
  c.t1 = quoteBlock(n, ['「何かしたいけど、何をしたらいいか分からない。', '　最初は、それでいいと思うんです」'], CAP_Y - 60, 44);
  c.t2 = quoteBlock(n, ['「よければ、僕の夢を手伝ってもらえないかな」'], CAP_Y - 30, 48);
  c.t3 = quoteBlock(n, ['「一緒に進めていく中で、', '　自分がやりたいことは、間違いなく出てくる」'], CAP_Y - 60, 48);
  return c;
}, (t, c) => {
  chapterUpdate(c.ch, t, 93);
  photoSpan(c.p1, t, 95.4, 98.2, .8); photoSpan(c.p2, t, 98.2, 101, .5);
  photoSpan(c.p3, t, 101, 104.6, .6); photoSpan(c.p4, t, 104.6, 108, .5);
  show(c.s, t >= 95.4 ? 1 : 0);
  revealLines(c.t1, t, 95.8, { stag: 1.1, out: 100.5, outDur: .5 }); if (t < 95.8 || t > 101) show(c.t1, 0);
  revealLines(c.t2, t, 101.3, { out: 103.4, outDur: .45 }); if (t < 101.3 || t > 103.9) show(c.t2, 0);
  revealLines(c.t3, t, 104.0, { stag: 1.0, out: 107.5, outDur: .5 }); if (t < 104) show(c.t3, 0);
});

// ================================================================= 108–123 Climax
scene(108, 123, n => {
  const c = {};
  c.m = ['undokai', 'graduation', 'forum', 'student_speech', 'ceremony_group', 'visit_group', 'aupp_group'].map(p => cine(n, p));
  c.s = el('div', 'scrim-b', n);
  c.z1 = lines(n, ['0は、0。'], { left: 0, right: 0, top: '780px', fontSize: '64px', textAlign: 'center' }, 'serif');
  c.z2 = lines(n, ['前に進めば、0.1%。'], { left: 0, right: 0, top: '780px', fontSize: '64px', textAlign: 'center' }, 'serif');
  c.a = vtext(n, 'できるか、\nできないかではなく、', { left: '1150px', top: '230px', fontSize: '56px', letterSpacing: '.14em', lineHeight: 1.9 });
  c.b = vtext(n, 'やるか、\nやらないか。', { left: '700px', top: '190px', fontSize: '120px', letterSpacing: '.1em', lineHeight: 1.6 });
  c.at = el('div', 'abs', n, '— 松井 亮'); place(c.at, { left: '470px', top: '880px', fontSize: '26px', letterSpacing: '.3em', color: 'var(--mist)', fontFamily: 'SERIF' });
  return c;
}, (t, c) => {
  c.m.forEach((p, i) => { const a = 108 + i * .75; show(p, t >= a && t < a + .75 ? 1 : 0); kb(p, t, a, a + .75, { s0: 1.07, s1: 1.03 }); });
  show(c.s, t < 113.25 ? 1 : 0);
  revealLines(c.z1, t, 108.3, { out: 110.3, outDur: .35 }); if (t < 108.3 || t > 110.7) show(c.z1, 0);
  revealLines(c.z2, t, 110.7, { out: 112.8, outDur: .4 }); if (t < 110.7 || t > 113.25) show(c.z2, 0);
  const vb = t >= 114;
  const out = 1 - E.inOutSine(prog(t, 122.0, 123));
  if (vb) {
    fadeChars(c.a, t, 114.2, { stag: .09, dur: 1.0 }); c.a.style.opacity = out;
    fadeChars(c.b, t, 115.7, { stag: .16, dur: 1.2, dy: 20 }); c.b.style.opacity = out;
    show(c.at, win(t, 118.4, 123, .9, 1.0));
  } else { show(c.a, 0); show(c.b, 0); show(c.at, 0); }
});

// ================================================================= 123–144 Closing
scene(123, 144, n => {
  const c = {};
  c.paper = el('div', 'fill paper', n);
  c.l0 = el('div', 'abs', c.paper, 'こういうことをやってみたい、と言う人がいたら――'); box(c.l0, M, 420);
  place(c.l0, { fontSize: '26px', letterSpacing: '.08em', color: 'rgba(11,14,20,.6)' });
  c.q = lines(c.paper, ['「やろうよ。めちゃくちゃ面白いやん」'], { left: M - 10 + 'px', top: '480px', fontSize: '84px' }, 'serif');
  c.qa = el('div', 'abs', c.paper, '— 松井 亮'); box(c.qa, M, 640); place(c.qa, { fontSize: '24px', letterSpacing: '.3em', fontFamily: 'SERIF', color: 'rgba(11,14,20,.6)' });
  // name card
  c.card = el('div', 'fill', c.paper);
  c.ph = photo(c.card, 'matsui_aupp', [1220, 180, 540, 720], { cls: 'cine' });
  c.name = lines(c.card, ['松井 亮'], { left: M - 6 + 'px', top: '300px', fontSize: '120px', letterSpacing: '.12em' }, 'serif');
  c.ro = el('div', 'abs latin', c.card, 'AKIRA MATSUI'); box(c.ro, M, 470); place(c.ro, { fontSize: '22px', fontWeight: 400, letterSpacing: '.6em', color: 'rgba(11,14,20,.55)' });
  c.role = el('div', 'abs', c.card, '株式会社ネクストメイク　代表取締役社長'); box(c.role, M, 530); place(c.role, { fontSize: '22px', letterSpacing: '.1em' });
  c.rule = el('div', 'hair', c.card); box(c.rule, M, 600, 560, 1);
  c.sl = lines(c.card, ['夢を、一緒に実現できる仲間を。'], { left: M + 'px', top: '630px', fontSize: '48px' }, 'serif');
  c.logo = logo(c.card, 40, { left: M + 'px', top: '800px' }, { light: false });
  c.url = el('div', 'abs latin', c.card, 'nextmake.site'); box(c.url, M + 400, 808); place(c.url, { fontSize: '18px', letterSpacing: '.3em', fontWeight: 500, color: 'var(--blue)' });
  c.note = el('div', 'abs cap', c.card, '本人の発言は、株式会社ネクストメイク公式YouTubeチャンネルの動画から引用し、読みやすく整えています。写真は公式サイト・PR TIMES掲載のものです。');
  place(c.note, { left: M + 'px', bottom: '64px', fontSize: '13px', color: 'rgba(11,14,20,.5)' });
  return c;
}, (t, c) => {
  show(c.paper, E.inOutSine(prog(t, 123, 124)));
  const v1 = t < 130;
  show(c.l0, v1 ? win(t, 124.0, 129.6, .8, .5) : 0);
  revealLines(c.q, t, 125.0, { dur: 1.2, out: 129.3, outDur: .6 }); if (t > 130) show(c.q, 0);
  show(c.qa, v1 ? win(t, 126.4, 129.6, .8, .5) : 0);
  const v2 = t >= 130;
  show(c.card, v2 ? 1 : 0);
  if (v2) {
    wipe(c.ph, t, 130.2, 1.2, 'up', E.inOutQuart); kb(c.ph, t, 130, 144, { s0: 1.08, s1: 1.0, ease: E.outCubic });
    revealLines(c.name, t, 130.5, { dur: 1.1 });
    show(c.ro, win(t, 131.1, 150, .8, 0));
    show(c.role, win(t, 131.4, 150, .8, 0));
    drawLine(c.rule, t, 131.6, 1.0);
    revealLines(c.sl, t, 132.4, { dur: 1.1 });
    buildLogo(c.logo, t, 134.0, { dur: 1.2 });
    show(c.url, win(t, 134.8, 150, .8, 0));
    show(c.note, win(t, 135.5, 150, .8, 0));
  }
});

// ================================================================= letterbox, HUD, fades
const LB_ON = [[23.6, 29.2], [38, 41], [57, 63], [70, 75], [78, 81], [83.4, 93], [95.4, 108], [108, 113.25]];
const bars = [...document.querySelectorAll('#letterbox i')];
const hud = $('#hud'), tl = hud.querySelector('.tl'), tr = hud.querySelector('.tr');
tl.innerHTML = '<span class="label" style="font-size:12px;color:rgba(255,255,255,.55)">Akira Matsui — a portrait</span>';
const CH = [[18, 33, '01　一言'], [33, 45, '02　ゼロから'], [45, 63, '03　好奇心'], [63, 81, '04　提案'], [81, 93, '05　仲間'], [93, 108, '06　夢'], [108, 114, 'Epilogue']];
hooks.after.push(t => {
  let h = 0;
  for (const [a, b] of LB_ON) h = Math.max(h, win(t, a - .3, b + .3, .6, .6));
  bars.forEach(b => { b.style.height = (LB * E.inOutSine(h)).toFixed(1) + 'px'; });
  show(hud, h);
  place(tl, { top: '58px' }); place(tr, { top: '58px' });
  const ch = CH.find(c => t >= c[0] && t < c[1]);
  tr.textContent = ch ? ch[2] : ''; tr.style.color = 'rgba(255,255,255,.55)'; tr.style.fontSize = '12px';
  $('#fade').style.opacity = E.inOutSine(prog(t, 142.4, 144)).toFixed(3);
  $('#vignette').style.opacity = t >= 123 ? .2 : 1;
});

film({ duration: 144, fps: 30, audio: '../assets/ceo_score.mp3' });
})();
