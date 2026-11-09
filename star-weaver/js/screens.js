// screens.js — how each VR panel is drawn. Every function paints one canvas in the shared theme;
// the game decides when to show them and what the buttons do.
import { C, font, glass, label, fitText, gradText, icon, roundRect, linear, spaced } from './theme.js';
import { MODES } from './timeline.js';
import { fmtTime, clamp } from './util.js';

const GRAD_TITLE = [[0, '#ffffff'], [0.55, '#d9e2ff'], [1, '#9fb3ff']];
const GRAD_GOLD = [[0, '#fff6d6'], [0.6, '#ffd166'], [1, '#ff9a5c']];

function chip(c, text, x, y, { color = C.ink, bg = 'rgba(255,255,255,0.08)', px = 22, ic = null, icColor = null, align = 'left' } = {}) {
  c.save();
  c.font = font(px, 700); spaced(c, 1.5);
  const tw = c.measureText(text).width, iw = ic ? px + 10 : 0, w = tw + iw + 32, h = px + 20;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  roundRect(c, x0, y, w, h, h / 2); c.fillStyle = bg; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.stroke();
  if (ic) icon(c, ic, x0 + 16 + px / 2, y + h / 2, px, icColor || color, 2.4);
  c.fillStyle = color; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(text, x0 + 16 + iw, y + h / 2 + 1);
  c.restore();
  return w;
}

function bar(c, x, y, w, h, f, stops = [[0, C.L], [1, C.V]]) {
  roundRect(c, x, y, w, h, h / 2); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
  if (f > 0.001) { roundRect(c, x, y, Math.max(h, w * clamp(f, 0, 1)), h, h / 2); c.fillStyle = linear(c, x, 0, x + w, 0, stops); c.fill(); }
}

// ---------------- logo (far, above the menu) ----------------
export function drawLogo(c, p, { best, streak, minutes }) {
  const W = p.canvas.width;
  c.save();
  c.shadowColor = 'rgba(140, 120, 255, 0.9)'; c.shadowBlur = 50;
  gradText(c, 'STAR WEAVER', W / 2, 205, 196, 800, GRAD_TITLE, 'center', W - 120, 18);
  c.restore();
  c.save();
  c.strokeStyle = linear(c, W / 2 - 520, 0, W / 2 + 520, 0, [[0, 'rgba(76,201,255,0)'], [0.3, C.L], [0.7, C.R], [1, 'rgba(255,95,183,0)']]);
  c.lineWidth = 3; c.beginPath(); c.moveTo(W / 2 - 520, 252); c.lineTo(W / 2 + 520, 252); c.stroke();
  c.restore();
  label(c, 'RHYTHM FITNESS FOR SHOULDERS & BACK', W / 2, 305, '#cfd3ff', 34, 'center');
  let x = W / 2;
  const items = [[`BEST  ${best ? best.toLocaleString() : '—'}`, 'star', C.A], [`STREAK  ${streak} DAY${streak === 1 ? '' : 'S'}`, 'flame', '#ff8a5c'], [`TOTAL  ${minutes} MIN`, 'clock', C.L]];
  c.font = font(28, 700); spaced(c, 1.5);
  const widths = items.map(([t]) => c.measureText(t).width + 28 + 32 + 10);
  const total = widths.reduce((a, b) => a + b, 0) + 24 * 2;
  x = W / 2 - total / 2;
  items.forEach(([t, ic, col], i) => { chip(c, t, x, 352, { px: 28, ic, icColor: col }); x += widths[i] + 24; });
}

// ---------------- menu console ----------------
export function menuButtons(g, onMode, onPlay, onTutorial, onRecal) {
  const s = g.store.settings;
  const card = (k, x) => ({
    x, y: 86, w: 300, h: 236, style: 'card', label: MODES[k].label, sub: MODES[k].note, icon: MODES[k].icon, chip: MODES[k].chip,
    selected: () => s.mode === k, onPress: () => onMode(k),
  });
  const b = [card('journey', 36), card('quick', 362), card('endless', 688),
    { x: 36, y: 418, w: 616, h: 132, style: 'primary', label: 'PLAY', icon: 'play', font: 64, onPress: onPlay },
    { x: 672, y: 418, w: 316, h: 62, style: 'ghost', label: 'TUTORIAL', icon: 'cap', font: 28, onPress: onTutorial },
  ];
  if (g.xr) b.push({ x: 672, y: 488, w: 316, h: 62, style: 'ghost', label: 'RECALIBRATE', icon: 'ruler', font: 26, onPress: onRecal });
  return b;
}
export function drawMenu(c, p, g) {
  const s = g.store.settings, W = p.canvas.width, H = p.canvas.height;
  glass(c, 4, 4, W - 8, H - 8, 40, { strong: true });
  label(c, 'SELECT MODE', 40, 62, C.muted, 22);
  const summary = [s.stance === 'sit' ? 'SEATED' : 'STANDING', s.stance === 'sit' ? null : `STEP ${{ small: 'S', mid: 'M', large: 'L' }[s.step]}`, s.stance === 'sit' ? null : `SQUAT ${{ off: 'OFF', shallow: 'LOW', normal: 'MID' }[s.squat]}`, s.backCare ? 'BACK CARE' : null, s.coach !== false ? 'COACH' : null].filter(Boolean);
  label(c, 'YOUR SETUP', 40, 372, C.muted, 18);
  let x = 40;
  for (const t of summary) x += chip(c, t, x, 382, { px: 18, bg: 'rgba(120,130,255,0.14)' }) + 10;
  c.fillStyle = C.dim; c.textBaseline = 'alphabetic';
  fitText(c, '設定は右のパネルで変更 · ボタンは指先やコントローラーの先で押してください', 40, 640, W - 80, 22, 500, 'left');
  const best = g.store.data.best[s.mode];
  if (best) { c.fillStyle = C.A; fitText(c, `BEST ${best.toLocaleString()}`, W - 40, 62, 300, 22, 700, 'right'); }
}

// ---------------- settings (side panel) ----------------
export function settingsButtons(g, set) {
  const s = g.store.settings, sit = s.stance === 'sit';
  const rowY = (i) => 112 + i * 116;
  const seg = (row, opts, key) => {
    const n = opts.length, gap = 10, w = (560 - gap * (n - 1)) / n;
    return opts.map(([v, lab, ic], i) => ({
      x: 40 + i * (w + gap), y: rowY(row), w, h: 68, style: 'seg', label: lab, icon: ic, font: 26,
      selected: () => s[key] === v, disabled: sit && (key === 'step' || key === 'squat'), onPress: () => set(key, v),
    }));
  };
  return [
    ...seg(0, [['stand', 'STAND', 'stand'], ['sit', 'SIT', 'sit']], 'stance'),
    ...seg(1, [['small', 'S'], ['mid', 'M'], ['large', 'L']], 'step'),
    ...seg(2, [['off', 'OFF'], ['shallow', 'LOW'], ['normal', 'MID']], 'squat'),
    ...seg(3, [[false, 'OFF'], [true, 'ON', 'shield']], 'backCare'),
    ...seg(4, [[false, 'OFF'], [true, 'ON', 'coach']], 'coach'),
    ...seg(5, [['low', '1'], ['mid', '2'], ['high', '3']], 'volume'),
  ];
}
export function drawSettings(c, p, g) {
  const W = p.canvas.width, H = p.canvas.height, sit = g.store.settings.stance === 'sit';
  glass(c, 4, 4, W - 8, H - 8, 36, { strong: true });
  label(c, 'SETTINGS', 40, 58, C.ink, 24);
  const rows = [['STANCE', '姿勢'], ['SIDE STEP', `横ステップ ${{ small: '30', mid: '45', large: '60' }[g.store.settings.step]}cm`], ['SQUAT', 'バーくぐりの深さ'], ['BACK CARE', '腰いたわり'], ['COACH', 'お手本ホログラム'], ['VOLUME', '音量']];
  rows.forEach(([en, jp], i) => {
    const y = 100 + i * 116;
    const dim = sit && (i === 1 || i === 2);
    label(c, en, 42, y, dim ? C.dim : C.muted, 19);
    c.fillStyle = dim ? C.dim : C.dim; c.textBaseline = 'alphabetic';
    fitText(c, dim ? '座って遊ぶときは出ません' : jp, W - 40, y, 300, 19, 500, 'right');
  });
}

// ---------------- HUD (three angled modules) ----------------
export function drawHudScore(c, p, g) {
  const W = p.canvas.width, H = p.canvas.height, st = g.stats;
  glass(c, 4, 4, W - 8, H - 8, 34);
  label(c, 'SCORE', 36, 58, C.muted, 22);
  gradText(c, Math.round(g.score).toLocaleString(), 32, 160, 92, 800, GRAD_TITLE, 'left', W - 60);
  const acc = st.total ? Math.round((st.hit / st.total) * 1000) / 10 : 100;
  let x = 34;
  x += chip(c, `${acc}%`, x, 196, { px: 22, ic: 'target', icColor: C.L }) + 10;
  chip(c, `${g.stats.kcal.toFixed(1)} kcal`, x, 196, { px: 22, ic: 'flame', icColor: '#ff8a5c' });
}
export function drawHudCombo(c, p, g) {
  const W = p.canvas.width, H = p.canvas.height, cx = W / 2, cy = 168, R = 128;
  const fever = g.fever, f = fever ? 1 : Math.min(1, g.combo / 30);
  c.save();
  c.beginPath(); c.arc(cx, cy, R + 18, 0, Math.PI * 2);
  c.fillStyle = 'rgba(12, 10, 36, 0.62)'; c.fill();
  c.lineWidth = 14; c.strokeStyle = 'rgba(255,255,255,0.1)'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  if (f > 0) {
    c.shadowColor = fever ? C.R : C.A; c.shadowBlur = 24;
    c.strokeStyle = fever ? linear(c, cx - R, 0, cx + R, 0, [[0, C.R], [1, C.V]]) : linear(c, cx - R, 0, cx + R, 0, [[0, C.A], [1, C.O]]);
    c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); c.stroke();
  }
  c.restore();
  gradText(c, String(g.combo), cx, cy + 34, g.combo >= 100 ? 96 : 116, 800, fever ? [[0, '#ffe1f3'], [1, C.R]] : GRAD_GOLD, 'center');
  label(c, fever ? 'FEVER' : 'COMBO', cx, cy + 76, fever ? C.R : C.muted, 22, 'center');
  chip(c, `×${g.multiplier.toFixed(1)}`, cx, 318, { px: 22, align: 'center', bg: fever ? 'rgba(255,95,183,0.3)' : 'rgba(255,255,255,0.1)' });
}
export function drawHudStage(c, p, g) {
  const W = p.canvas.width, H = p.canvas.height, seg = g.curSeg, tl = g.tl;
  glass(c, 4, 4, W - 8, H - 8, 34);
  if (!seg) return;
  label(c, seg.stage.sub + (seg.loop ? `  ·  LAP ${seg.loop + 1}` : ''), W - 36, 58, C.muted, 22, 'right');
  c.save(); spaced(c, 2); c.fillStyle = '#fff'; c.textBaseline = 'alphabetic'; fitText(c, seg.stage.name, W - 34, 124, W - 70, 52, 800, 'right'); c.restore();
  const prog = clamp((g.t - seg.t0) / (seg.t1 - seg.t0), 0, 1);
  bar(c, 36, 152, W - 72, 14, prog, [[0, C.L], [1, C.V]]);
  const endless = g.mode === 'endless' && !g.endlessStopped;
  const left = endless ? fmtTime(g.stats.playSec) : fmtTime(tl.end - g.t);
  chip(c, `${endless ? 'TIME' : 'LEFT'}  ${left}`, W - 36, 194, { px: 22, ic: 'clock', icColor: C.L, align: 'right' });
  chip(c, `${seg.bpm} BPM`, 36, 194, { px: 22 });
  if (g.assist > 0) chip(c, g.assist > 1 ? 'EASY ++' : 'EASY +', 36 + 150, 194, { px: 22, color: C.G });
}

// ---------------- hint card (first time a mechanic appears, tips, cool-down cues) ----------------
export function drawHint(c, p, { en, text, sub, icon: ic = 'star', accent = C.V }) {
  const W = p.canvas.width, H = p.canvas.height;
  glass(c, 4, 4, W - 8, H - 8, 40, { strong: true, glow: 'rgba(120, 100, 255, 0.5)' });
  const s = H - 48;
  roundRect(c, 24, 24, s, s, 30);
  c.fillStyle = linear(c, 24, 24, 24 + s, 24 + s, [[0, '#3fb6ff'], [1, '#7a5cff']]); c.fill();
  icon(c, ic, 24 + s / 2, 24 + s / 2, s * 0.56, '#ffffff', 2.2);
  const x = 24 + s + 36;
  c.save(); spaced(c, 4); c.fillStyle = C.A; c.textBaseline = 'alphabetic'; fitText(c, en || '', x, 76, W - x - 40, 40, 800, 'left'); c.restore();
  c.fillStyle = '#ffffff'; fitText(c, text || '', x, 134, W - x - 40, 42, 700, 'left');
  if (sub) { c.fillStyle = C.muted; fitText(c, sub, x, 184, W - x - 40, 28, 500, 'left'); }
}

// ---------------- stage title ----------------
export function drawTitle(c, p, seg) {
  const W = p.canvas.width, st = seg.stage;
  const lap = seg.loop ? `  ·  LAP ${seg.loop + 1}` : '';
  c.save();
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 3;
  c.font = font(44, 600); spaced(c, 12);
  const tw = c.measureText(st.sub + lap).width;
  c.beginPath(); c.moveTo(W / 2 - tw / 2 - 160, 74); c.lineTo(W / 2 - tw / 2 - 40, 74); c.moveTo(W / 2 + tw / 2 + 40, 74); c.lineTo(W / 2 + tw / 2 + 160, 74); c.stroke();
  c.fillStyle = C.A; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(st.sub + lap, W / 2, 76);
  c.restore();
  c.save(); c.shadowColor = 'rgba(255, 95, 183, 0.8)'; c.shadowBlur = 44;
  gradText(c, st.name, W / 2, 268, 168, 800, GRAD_TITLE, 'center', W - 100, 14);
  c.restore();
  label(c, `${seg.bpm} BPM`, W / 2, 352, '#d7dcff', 36, 'center');
}

// ---------------- welcome & calibration ----------------
export function drawWelcome(c, p, hasCalib) {
  const W = p.canvas.width, H = p.canvas.height;
  glass(c, 4, 4, W - 8, H - 8, 40, { strong: true });
  label(c, 'WELCOME TO', 48, 70, C.muted, 22);
  c.save(); c.shadowColor = 'rgba(140,120,255,0.8)'; c.shadowBlur = 30; gradText(c, 'STAR WEAVER', 46, 160, 92, 800, GRAD_TITLE, 'left', W - 96, 8); c.restore();
  c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
  fitText(c, 'まっすぐ立って正面を向き、ボタンを指先で押してください', 48, 236, W - 96, 32, 700, 'left');
  c.fillStyle = C.muted;
  fitText(c, '前後の移動はありません。左右に1歩ずつ動ける広さがあればOK', 48, 280, W - 96, 25, 500, 'left');
  fitText(c, hasCalib ? '「START」で腕の長さを測り直します' : '最初に腕の長さを測って、星の位置をあなたに合わせます', 48, 316, W - 96, 25, 500, 'left');
}
export function welcomeButtons(hasCalib, onStart, onReuse) {
  return [
    { x: 48, y: 378, w: hasCalib ? 440 : 928, h: 140, style: 'primary', label: 'START', icon: 'play', font: 56, onPress: onStart },
    ...(hasCalib ? [{ x: 508, y: 378, w: 468, h: 140, style: 'ghost', label: 'USE SAVED', sub: '前回の測定ですぐメニューへ', icon: 'check', font: 40, onPress: onReuse }] : []),
  ];
}
export function drawTpose(c, p, f) {
  const W = p.canvas.width, H = p.canvas.height;
  glass(c, 4, 4, W - 8, H - 8, 36, { strong: true });
  label(c, 'CALIBRATION', 44, 60, C.muted, 22);
  c.save(); spaced(c, 8); gradText(c, 'T-POSE', 42, 142, 84, 800, GRAD_TITLE, 'left'); c.restore();
  label(c, f >= 1 ? 'DONE' : f > 0 ? 'HOLD…' : 'WAITING', W - 44, 60, f > 0 ? C.A : C.dim, 22, 'right');
  c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
  fitText(c, 'コーチと同じように、両腕を横にまっすぐ広げて2秒キープ', 44, 214, W - 88, 36, 700, 'left');
  c.fillStyle = C.muted; fitText(c, '腕の長さを測って、星があなたの手の届く位置に出るようにします', 44, 260, W - 88, 26, 500, 'left');
  bar(c, 44, 300, W - 88, 24, f, [[0, C.A], [1, C.O]]);
}

// ---------------- pause ----------------
export function drawPause(c, p, g) {
  const W = p.canvas.width, H = p.canvas.height;
  glass(c, 4, 4, W - 8, H - 8, 40, { strong: true });
  c.save(); spaced(c, 8); gradText(c, 'PAUSED', W / 2, 108, 76, 800, GRAD_TITLE, 'center'); c.restore();
  label(c, `SCORE ${Math.round(g.score).toLocaleString()}   ·   ${fmtTime(g.stats.playSec)}`, W / 2, 158, C.muted, 22, 'center');
}
export function pauseButtons(canCool, h) {
  return [
    { x: 40, y: 200, w: 456, h: 200, style: 'primary', label: 'RESUME', sub: '3秒後に再開', icon: 'play', font: 50, onPress: h.resume },
    { x: 528, y: 200, w: 456, h: 200, style: 'ghost', label: canCool ? 'COOL DOWN' : 'FINISH', sub: canCool ? 'ストレッチして終わる' : 'リザルトへ', icon: canCool ? 'leaf' : 'check', font: 44, onPress: h.cool },
    { x: 40, y: 424, w: 456, h: 200, style: 'ghost', label: 'RECENTER', sub: '今の立ち位置を中心に', icon: 'crosshair', font: 44, onPress: h.recenter },
    { x: 528, y: 424, w: 456, h: 200, style: 'ghost', label: 'QUIT', sub: '記録せずメニューへ', icon: 'exit', font: 44, onPress: h.quit },
  ];
}

// ---------------- results ----------------
const RANK_COLORS = { SS: [C.R, C.A], S: [C.A, C.O], A: [C.L, C.V], B: [C.G, C.L], C: ['#b0aee0', '#7b78b0'] };
function hexPath(c, cx, cy, r) {
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; i ? c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  c.closePath();
}
export function drawResults(c, p, r, shownScore) {
  const W = p.canvas.width, H = p.canvas.height;
  glass(c, 4, 4, W - 8, H - 8, 44, { strong: true });
  // rank badge
  const [c1, c2] = RANK_COLORS[r.rank] || RANK_COLORS.C;
  const cx = 230, cy = 250;
  c.save();
  c.shadowColor = c1; c.shadowBlur = 60;
  hexPath(c, cx, cy, 170); c.fillStyle = 'rgba(16, 12, 48, 0.9)'; c.fill();
  c.lineWidth = 10; c.strokeStyle = linear(c, cx - 170, cy - 170, cx + 170, cy + 170, [[0, c1], [1, c2]]); c.stroke();
  c.restore();
  hexPath(c, cx, cy, 146); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.18)'; c.stroke();
  gradText(c, r.rank, cx, cy + 66, r.rank.length > 1 ? 150 : 190, 800, [[0, '#ffffff'], [1, c1]], 'center');
  label(c, 'RANK', cx, 470, C.muted, 24, 'center');
  if (r.newBest) chip(c, 'NEW BEST', cx, 500, { px: 26, align: 'center', bg: 'rgba(255,95,183,0.35)', ic: 'star', icColor: C.A });
  // score and summary
  const x0 = 460;
  label(c, `RESULTS  ·  ${MODES[r.mode].label}`, x0, 76, C.muted, 24);
  gradText(c, Math.round(shownScore).toLocaleString(), x0 - 4, 196, 130, 800, GRAD_TITLE, 'left', W - x0 - 40);
  let x = x0;
  x += chip(c, `ACCURACY ${r.acc}%`, x, 222, { px: 24, ic: 'target', icColor: C.L }) + 12;
  x += chip(c, `MAX COMBO ${r.maxCombo}`, x, 222, { px: 24, ic: 'bolt', icColor: C.A }) + 12;
  chip(c, `TIME ${fmtTime(r.sec)}`, x, 222, { px: 24, ic: 'clock', icColor: C.G });
  label(c, 'BODY REPORT', x0, 324, C.muted, 22);
  const items = [
    ['orbit', 'SHOULDER CIRCLES', '肩まわし', r.counts.circles, C.L], ['up', 'OVERHEAD REACH', '腕上げ', r.counts.reach, C.A], ['wing', 'CHEST OPENER', '胸ひらき', r.counts.open, C.R],
    ['spiral', 'TWIST', 'ツイスト', r.counts.twist, C.V], ['steps', 'SIDE STEPS', 'サイドステップ', r.counts.steps, C.G], ['squat', 'SQUATS', 'スクワット', r.counts.squats, C.O],
  ];
  const tw = (W - x0 - 40 - 2 * 14) / 3;
  items.forEach(([ic, en, jp, v, col], i) => {
    const tx = x0 + (i % 3) * (tw + 14), ty = 340 + Math.floor(i / 3) * 128;
    glass(c, tx, ty, tw, 114, 22);
    c.beginPath(); c.arc(tx + 42, ty + 57, 26, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.07)'; c.fill();
    icon(c, ic, tx + 42, ty + 57, 30, col, 2.4);
    c.fillStyle = '#fff'; c.textBaseline = 'alphabetic'; c.font = font(48, 800); c.textAlign = 'left'; c.fillText(String(v), tx + 84, ty + 66);
    c.save(); c.font = font(15, 700); spaced(c, 2); c.fillStyle = C.muted; c.fillText(en, tx + 86, ty + 92); c.restore();
    c.fillStyle = C.dim; c.font = font(16, 500); c.fillText(jp, tx + 86, ty + 30);
  });
  x = x0;
  x += chip(c, `${r.kcal} kcal`, x, 618, { px: 24, ic: 'flame', icColor: C.O }) + 12;
  x += chip(c, `ARMS MOVED ${r.travel} m`, x, 618, { px: 24, ic: 'hand', icColor: C.L }) + 12;
  if (r.streak > 0) chip(c, `${r.streak} DAY STREAK`, x, 618, { px: 24, ic: 'flame', icColor: C.R, bg: 'rgba(255,95,183,0.2)' });
  c.fillStyle = C.muted; c.textBaseline = 'alphabetic';
  fitText(c, r.streak > 1 ? 'いい調子！ 毎日少しずつが肩こり対策の近道です' : 'おつかれさまでした！ 水分補給も忘れずに', x0, 708, W - x0 - 40, 26, 500, 'left');
}
export function resultButtons(h) {
  return [
    { x: 16, y: 16, w: 488, h: 198, style: 'primary', label: 'RETRY', icon: 'retry', font: 58, onPress: h.retry },
    { x: 520, y: 16, w: 488, h: 198, style: 'ghost', label: 'MENU', icon: 'grid', font: 52, onPress: h.menu },
  ];
}

// ---------------- tutorial ----------------
export function drawTutorialCard(c, p, { step, total, en, text, sub, icon: ic, done = false }) {
  const W = p.canvas.width, H = p.canvas.height;
  glass(c, 4, 4, W - 8, H - 8, 44, { strong: true, glow: done ? 'rgba(122, 255, 200, 0.6)' : 'rgba(120, 100, 255, 0.55)' });
  const s = H - 64;
  roundRect(c, 32, 32, s, s, 36);
  c.fillStyle = done ? linear(c, 32, 32, 32 + s, 32 + s, [[0, '#2fd39a'], [1, '#2a9dff']]) : linear(c, 32, 32, 32 + s, 32 + s, [[0, '#3fb6ff'], [1, '#7a5cff']]);
  c.fill();
  icon(c, done ? 'check' : ic, 32 + s / 2, 32 + s / 2, s * 0.56, '#fff', 2.4);
  const x = 32 + s + 44;
  label(c, step ? `TUTORIAL  ·  STEP ${step} / ${total}` : 'TUTORIAL', x, 72, done ? C.G : C.muted, 24);
  // progress dots
  if (total) for (let i = 0; i < total; i++) {
    c.beginPath(); c.arc(W - 60 - (total - 1 - i) * 30, 64, i < step ? 9 : 7, 0, Math.PI * 2);
    c.fillStyle = i < step - 1 || (done && i < step) ? C.G : i === step - 1 ? C.A : 'rgba(255,255,255,0.2)'; c.fill();
  }
  c.save(); spaced(c, 5); gradText(c, en, x, 152, 64, 800, done ? [[0, '#ffffff'], [1, C.G]] : GRAD_TITLE, 'left', W - x - 50); c.restore();
  c.fillStyle = '#fff'; c.textBaseline = 'alphabetic'; fitText(c, text, x, 214, W - x - 50, 38, 700, 'left');
  if (sub) { c.fillStyle = C.muted; fitText(c, sub, x, 262, W - x - 50, 27, 500, 'left'); }
}
