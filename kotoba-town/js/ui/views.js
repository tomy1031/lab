// The game's UI pieces, drawn on Panels: speech bubble, the learner's turn card, the big board
// (lesson list, scenario cards, briefing, report) and toasts.
import * as THREE from 'three';
import { Panel, THEME, rr, font, wrap, card, nameTag, stars, star, text, shade, fitWrap } from './panel.js';
import { toRomaji } from '../content/index.js';
import { RUBRIC_INFO, VERDICTS } from '../talk/judge.js';

/** A small rounded label (criteria chips). Returns its width. */
function chip(g, x, y, label, bg, fg, size = 24) {
  g.font = font(size, 800);
  const w = g.measureText(label).width + size * 1.1;
  g.fillStyle = bg; rr(g, x, y, w, size * 1.8, size * 0.9); g.fill();
  g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(label, x + size * 0.55, y + size * 0.92);
  return w;
}

/** Five dots for a 1–5 score. */
function dots(g, x, y, score, color) {
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i < score ? color : '#e8dfcf';
    g.beginPath(); g.arc(x + i * 30, y, 11, 0, Math.PI * 2); g.fill();
  }
}

const NAME_COLORS = ['#ffd36b', '#9ad8b7', '#f6b3c6', '#a9cdf0', '#f7c08a', '#c9b6ef'];
/** 「だい 3 か」 for the textbook course, 「第2話 · story」 for ITビジネス編. */
export function unitLabel(L) {
  return L.course === 'it' ? `${L.episodeJa || `第${L.no}話`} · ${L.storyJa}` : `だい ${L.no} か · Lesson ${L.no}`;
}

export const colorFor = (id) => NAME_COLORS[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % NAME_COLORS.length];

/** Choose what to show for a Japanese line according to the settings. */
export function lineText(line, settings) {
  const main = settings.display === 'kanji' ? line.ja : line.kana || line.ja;
  return { main, romaji: settings.romaji ? toRomaji(line.kana || '') : '', en: settings.english ? line.en || '' : '' };
}

// ------------------------------------------------------------------ bubble
export class SpeechBubble {
  constructor(app) {
    this.panel = new Panel(app, 1100, 460, 0.95, { name: 'bubble', interactive: false });
    this.panel.visible = false;
    app.scene.add(this.panel.mesh);
    this.app = app;
    this.progress = 1;
  }

  show({ name, id, line, settings, live = false }) {
    this.data = { name, id, line, settings, live };
    this.progress = 0;
    this.panel.visible = true;
    this.redraw();
  }

  setProgress(p) {
    const q = Math.min(1, Math.max(0, p));
    if (Math.abs(q - this.progress) < 0.02 && q < 1) return;
    this.progress = q;
    this.redraw();
  }

  /** Live (streamed) text: replace the line text as it arrives. */
  setLiveText(ja) { if (this.data) { this.data.line = { ...this.data.line, ja, kana: ja }; this.progress = 1; this.redraw(); } }

  redraw() {
    const d = this.data; if (!d) return;
    const t = lineText(d.line, d.settings);
    this.panel.draw((g, W, H) => {
      const top = 46; const bh = H - top - 70;
      // bubble body + tail
      g.fillStyle = THEME.shadow;
      rr(g, 20, top + 10, W - 40, bh, 70); g.fill();
      g.fillStyle = d.live ? '#f3fbff' : THEME.cream;
      rr(g, 16, top, W - 40, bh, 70); g.fill();
      g.beginPath(); g.moveTo(W / 2 - 40, top + bh - 4); g.lineTo(W / 2, H - 12); g.lineTo(W / 2 + 34, top + bh - 4); g.closePath(); g.fill();
      // name tag
      nameTag(g, 60, 8, d.name, colorFor(d.id), THEME.ink, 36);
      if (d.live) { g.font = font(26, 800); g.fillStyle = THEME.blue; g.textAlign = 'right'; g.fillText('● Gemini Live', W - 70, 40); }
      // text
      const n = Math.ceil([...t.main].length * this.progress);
      const shown = [...t.main].slice(0, n).join('');
      let y = top + 52;
      // the whole line always fits: smaller type for long lines, room kept for the romaji / English
      g.font = font(30, 700);
      const below = (t.en ? Math.min(2, wrap(g, t.en, W - 170).length) * 30 * 1.45 + 6 : 0) + (t.romaji ? 2 * 26 * 1.45 + 4 : 0);
      const fit = fitWrap(g, t.main, W - 170, bh - 52 - below - 40, [52, 46, 40, 35, 31, 28], { weight: 800, lh: 1.32 });
      const px = fit.px;
      g.font = font(px, 800);
      const lines = fit.lines;
      let used = 0;
      g.fillStyle = THEME.ink; g.textAlign = 'left'; g.textBaseline = 'top';
      for (const l of lines) {
        const take = Math.max(0, Math.min(l.length, [...shown].length - used));
        g.fillText([...l].slice(0, take).join(''), 70, y);
        used += [...l].length;
        y += px * 1.32;
      }
      if (this.progress >= 1) {
        if (t.romaji) y = text(g, t.romaji, 70, y + 4, W - 170, 26, { color: THEME.soft, weight: 500, maxLines: 2 });
        if (t.en) text(g, t.en, 70, y + 6, W - 170, 30, { color: '#7a8a96', weight: 700, maxLines: 2 });
        // little "next" triangle like a village chat window
        g.fillStyle = THEME.sun;
        g.beginPath(); g.moveTo(W - 92, top + bh - 46); g.lineTo(W - 68, top + bh - 46); g.lineTo(W - 80, top + bh - 30); g.closePath(); g.fill();
      }
    });
  }

  /** Keep the bubble above a speaker, turned toward the learner. */
  follow(worldPos, head) {
    this.panel.placeFacing(worldPos.clone().add(new THREE.Vector3(0, 0.3, 0)), head);
  }

  hide() { this.panel.visible = false; this.data = null; }
}

// ---------------------------------------------------------------- turn card
export class TurnCard {
  constructor(app, handlers) {
    this.app = app;
    this.h = handlers; // { hint(), again(), skip(), choose(text), finish() }
    this.panel = new Panel(app, 1200, 860, 0.6, { name: 'turn' });
    this.panel.visible = false;
    app.scene.add(this.panel.mesh);
    this.state = null;
    this.level = 0;
  }

  /** state: { mode:'listen'|'npc'|'feedback'|'free', promptEn, hintJa, showHint, model, choices, heard, mic, feedback, live, settings, attempt } */
  set(state) { this.state = { ...this.state, ...state }; this.panel.visible = true; this.redraw(); }
  hide() { this.panel.visible = false; }

  setLevel(v) {
    if (Math.abs(v - this.level) < 0.04) return;
    this.level = v;
    if (this.state?.mode === 'listen' || this.state?.mode === 'free') this.redraw();
  }

  /** How tall the card must be to show the prompt, hint and every example in full at a readable size. */
  needHeight(s) {
    if (s.mode !== 'listen' && s.mode !== 'free') return 860;
    const g = this.panel.g; const W = this.panel.canvas.width;
    const m = (str, px, mw, weight = 700) => { g.font = font(px, weight); return wrap(g, str, mw).length * px * 1.45; };
    if (s.room) {
      let y = 140 + m(s.promptEn || '', 36, W - 240, 800) + 16;
      if (s.heard) y += m(`🎤 ${s.heard}`, 30, W - 160) + 50;
      if (s.last) y += 60 + m(`🎤 ${s.last.heard || '—'}`, 26, W - 260) + (s.last.correction && s.last.correction !== s.last.heard ? m(`✓ ${s.last.correction}`, 30, W - 160, 800) : 0) + (s.last.tipEn ? m(s.last.tipEn, 24, W - 160, 500) : 0) + 30;
      if (s.ideas?.length) y += 50 + s.ideas.reduce((a, t) => a + m(`・${t}`, 26, W - 160, 600), 0);
      if (s.starters?.length) y += 40 + m(s.starters.join('　／　'), 30, W - 160, 800) + 20;
      return Math.min(1600, Math.max(860, Math.ceil(y + 160)));
    }
    let y = 140 + Math.min(m(s.promptEn || '', 34, W - 240), 170) + 10;
    if (s.heard) y += Math.min(m(`🎤 ${s.heard}`, 31, W - 160), 110) + 54;
    if (s.showHint && s.hintJa) y += Math.min(m(`💡 ${s.hintJa}`, 33, W - 160, 800), 120) + 58;
    if (s.notice) y += 2 * 30 * 1.45 + 6;
    if (s.choices?.length) {
      y += 40;
      g.font = font(28, 800);
      for (const c of s.choices.slice(0, 4)) y += Math.max(74, wrap(g, c, W - 160).length * 28 * 1.3 + 30) + 12;
    }
    return Math.min(1500, Math.max(860, Math.ceil(y + 146)));
  }

  redraw() {
    const s = this.state; if (!s) return;
    const p = this.panel;
    p.setHeight(this.needHeight(s));
    p.draw((g, W, H) => {
      card(g, 10, 10, W - 20, H - 30, { fill: s.mode === 'npc' ? '#f7f2e6' : THEME.cream });
      // header
      const listening = s.mode === 'listen' || s.mode === 'free';
      const tagW = nameTag(g, 50, 40, listening ? (s.mode === 'free' ? 'フリートーク · Free talk' : 'あなたの ばん · Your turn') : s.mode === 'feedback' ? 'ひょうか · Feedback' : 'きいて · Listen', listening ? THEME.leaf : s.mode === 'feedback' ? THEME.sun : '#d9cdb8', listening ? '#ffffff' : THEME.ink, 36);
      // which mode we are in: れんしゅう (practice, with examples) or ほんばん (real, no help)
      if (s.room) nameTag(g, 50 + tagW + 16, 46, s.levelLabel || '', '#cfe3f7', '#2f5f8a', 28);
      else nameTag(g, 50 + tagW + 16, 46, s.exam ? 'ほんばん' : 'れんしゅう', s.exam ? '#f7a35c' : '#d7ecdf', s.exam ? '#ffffff' : THEME.leafDark, 28);
      // mic indicator
      const cx = W - 120; const cy = 92;
      const micOn = listening && s.mic === 'on';
      g.fillStyle = micOn ? 'rgba(124,197,160,0.25)' : 'rgba(0,0,0,0.06)';
      g.beginPath(); g.arc(cx, cy, 44 + (micOn ? this.level * 30 : 0), 0, Math.PI * 2); g.fill();
      g.fillStyle = micOn ? THEME.leafDark : s.mic === 'denied' ? THEME.red : '#b9ad98';
      g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fill();
      drawMic(g, cx, cy, 22, '#ffffff');
      g.font = font(22, 800); g.textAlign = 'center'; g.fillStyle = THEME.soft;
      g.fillText(micOn ? 'listening' : s.mic === 'denied' ? 'mic blocked' : s.mode === 'npc' || s.waiting ? 'wait…' : 'mic', cx, cy + 74);

      let y = 140;
      if (s.mode === 'npc') {
        text(g, s.promptEn || 'Listen…', 60, y, W - 240, 40, { color: THEME.soft });
        return;
      }
      if (s.mode === 'feedback' && s.feedback?.interview) {
        // job interview: how an interviewer would take this answer
        const f = s.feedback;
        stars(g, 60, y - 6, f.score, 3, 48);
        g.font = font(36, 800); g.fillStyle = THEME.ink; g.textAlign = 'left';
        g.fillText(['もう いちど 考えよう', 'もう 少し', 'いい 答えです', 'すばらしい 答えです'][f.score] || '', 250, y + 4);
        y += 72;
        if (f.heard) y = text(g, `🎤 ${f.heard}`, 60, y, W - 120, 28, { color: THEME.soft, maxLines: 2 });
        let cx = 60; const cy = y + 6; let any = false;
        for (const id of f.criteriaMet || []) { if (!RUBRIC_INFO[id] || cx > W - 300) continue; cx += chip(g, cx, cy, `✓ ${RUBRIC_INFO[id].ja}`, '#e3f3ea', THEME.leafDark) + 12; any = true; }
        for (const id of f.criteriaMissed || []) { if (!RUBRIC_INFO[id] || cx > W - 300) continue; cx += chip(g, cx, cy, `△ ${RUBRIC_INFO[id].ja}`, '#fdebd3', '#a3622a') + 12; any = true; }
        if (any) y += 62;
        if (f.correction && f.correction !== f.heard) {
          y += 6;
          g.fillStyle = '#eaf6ef'; rr(g, 50, y, W - 100, 196, 28); g.fill();
          g.font = font(22, 800); g.fillStyle = THEME.leafDark; g.textAlign = 'left'; g.textBaseline = 'top';
          g.fillText(f.offline ? 'こたえの れい · A model answer' : '言い直すなら · A better answer', 76, y + 16);
          text(g, f.correction, 76, y + 52, W - 160, 32, { color: THEME.leafDark, weight: 800, maxLines: 4 });
          y += 214;
        }
        if (f.tipEn) text(g, `${f.offline ? '👂' : '🌱'} ${f.tipEn}`, 60, y + 4, W - 120, 28, { color: '#6c7d8a', maxLines: 3 });
        return;
      }
      if (s.mode === 'feedback' && s.feedback) {
        const f = s.feedback;
        stars(g, 60, y, f.score, 3, 56);
        g.font = font(40, 800); g.fillStyle = THEME.ink; g.textAlign = 'left';
        g.fillText(['Let\'s try again', 'Good try!', 'Good!', 'Excellent!'][f.score] || '', 280, y + 10);
        y += 90;
        if (f.heard) y = text(g, `🎤 ${f.heard}`, 60, y, W - 120, 34, { color: THEME.soft, maxLines: 2 });
        if (f.correction && f.correction !== f.heard) {
          y += 8;
          g.fillStyle = '#eaf6ef'; rr(g, 50, y, W - 100, 120, 28); g.fill();
          text(g, '✓ ' + f.correction, 76, y + 22, W - 160, 38, { color: THEME.leafDark, weight: 800, maxLines: 2 });
          y += 140;
        }
        if (f.tipEn) y = text(g, f.tipEn, 60, y + 4, W - 120, 32, { color: '#6c7d8a', maxLines: 3 });
        return;
      }
      if (s.room) { this.drawRoom(g, W, H, p, s); return; }
      // listen / free — every text is shown in full (wrapped, smaller type only when it must)
      const by = H - 130;
      const pf = fitWrap(g, s.promptEn || '', W - 240, 170, [40, 34, 30, 27]);
      y = text(g, s.promptEn || '', 60, y, W - 240, pf.px);
      y += 10;
      if (s.heard) {
        const hf = fitWrap(g, `🎤 ${s.heard}`, W - 160, 110, [36, 31, 27, 24]);
        g.fillStyle = '#f1eadb'; rr(g, 50, y, W - 100, hf.height + 40, 26); g.fill();
        text(g, `🎤 ${s.heard}`, 76, y + 20, W - 160, hf.px, { color: THEME.ink });
        y += hf.height + 54;
      }
      if (s.showHint && s.hintJa) {
        const kf = fitWrap(g, `💡 ${s.hintJa}`, W - 160, 120, [38, 33, 29, 25], { weight: 800 });
        g.fillStyle = '#fff3cf'; rr(g, 50, y, W - 100, kf.height + 44, 26); g.fill();
        text(g, `💡 ${s.hintJa}`, 76, y + 22, W - 160, kf.px, { color: '#8a6416', weight: 800 });
        y += kf.height + 58;
      }
      if (s.notice) { y = text(g, s.notice, 60, y, W - 120, 30, { color: THEME.red, maxLines: 2 }) + 6; }
      if (s.choices?.length) {
        g.font = font(26, 700); g.fillStyle = THEME.soft; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(s.live ? 'Examples — say one, or your own answer:' : 'Read one aloud, then tap it:', 60, y);
        y += 40;
        // the largest type at which every example fits as a whole (several lines per button if needed)
        const list = s.choices.slice(0, 4);
        const room = by - 16 - y;
        let size = 34; let laid = null;
        for (const px of [34, 30, 27, 24, 21, 19]) {
          g.font = font(px, 800);
          const rows = list.map((c) => wrap(g, c, W - 160));
          const hs = rows.map((r) => Math.max(74, r.length * px * 1.3 + 30));
          const total = hs.reduce((a, b) => a + b, 0) + (list.length - 1) * 12;
          size = px; laid = { rows, hs };
          if (total <= room) break;
        }
        for (const [i, c] of list.entries()) {
          const h = laid.hs[i];
          p.button(`c${i}`, 50, y, W - 100, h, c, () => this.h.choose(c), { color: '#ffffff', fg: THEME.ink, outline: THEME.line, size, lines: laid.rows[i], lineHeight: size * 1.3 });
          y += h + 12;
        }
      }
      // bottom buttons
      if (s.mode === 'free' && !s.room) {
        p.button('finish', W / 2 - 170, by, 340, 84, 'おわる · Finish', () => this.h.finish(), { color: THEME.blue });
        return;
      }
      if (s.exam) {
        // ほんばん: no hints or examples — only ask to hear it again, or give up on this turn
        p.button('again', 50, by, 460, 84, 'もういちど きく', () => this.h.again(), { color: '#a9cdf0', fg: THEME.ink });
        p.button('skip', 530, by, 460, 84, 'スキップ', () => this.h.skip(), { color: '#e8dccb', fg: THEME.soft });
      } else {
        p.button('hint', 50, by, 300, 84, 'ヒント · Hint', () => this.h.hint(), { color: THEME.sun, fg: THEME.ink });
        p.button('again', 370, by, 300, 84, 'もういちど', () => this.h.again(), { color: '#a9cdf0', fg: THEME.ink });
        p.button('skip', 690, by, 300, 84, 'スキップ', () => this.h.skip(), { color: '#e8dccb', fg: THEME.soft });
      }
    });
  }
}

/** The free-talk room's card: topic, what the learner is saying, the last line with a better way to say it, ideas. */
TurnCard.prototype.drawRoom = function drawRoom(g, W, H, p, s) {
  let y = 140;
  const kind = s.topicKind === 'role' ? 'ロールプレイ' : 'おしゃべり';
  const kw = chip(g, 60, y - 4, kind, s.topicKind === 'role' ? '#fde3c8' : '#e3f3ea', s.topicKind === 'role' ? '#a3622a' : THEME.leafDark, 22);
  y = text(g, s.promptEn || '', 60 + kw + 14, y, W - 240 - kw - 14, 36, { weight: 800 }) + 16;
  if (s.heard) {
    const hf = fitWrap(g, `🎤 ${s.heard}`, W - 160, 140, [30, 27, 24]);
    g.fillStyle = '#f1eadb'; rr(g, 50, y, W - 100, hf.height + 36, 26); g.fill();
    text(g, `🎤 ${s.heard}`, 76, y + 18, W - 160, hf.px, { color: THEME.ink });
    y += hf.height + 50;
  } else if (s.waiting) {
    y = text(g, '👂 きいて ください · Listen to your partner', 60, y, W - 120, 26, { color: THEME.soft }) + 12;
  } else {
    y = text(g, '🎙️ どうぞ、はなして ください · Your turn — just talk', 60, y, W - 120, 26, { color: THEME.leafDark, weight: 800 }) + 12;
  }
  if (s.last) {
    const l = s.last;
    g.fillStyle = '#eef6f1';
    g.font = font(26, 700);
    const better = l.correction && l.correction !== l.heard;
    const bh = 30 + wrap(g, `🎤 ${l.heard || '—'}`, W - 260).length * 26 * 1.45 + (better ? (g.font = font(30, 800), wrap(g, `✓ ${l.correction}`, W - 160).length * 30 * 1.45) : 0) + (l.tipEn ? (g.font = font(24, 500), wrap(g, l.tipEn, W - 160).length * 24 * 1.45) : 0) + 20;
    g.fillStyle = '#eef6f1'; rr(g, 50, y, W - 100, bh, 26); g.fill();
    stars(g, 70, y + 12, l.score ?? 0, 3, 30);
    let ly = text(g, `🎤 ${l.heard || '—'}`, 200, y + 14, W - 260, 26, { color: THEME.soft });
    if (better) ly = text(g, `✓ ${l.correction}`, 76, ly + 6, W - 160, 30, { color: THEME.leafDark, weight: 800 });
    if (l.tipEn) text(g, l.tipEn, 76, ly + 4, W - 160, 24, { color: '#6c7d8a', weight: 500 });
    y += bh + 14;
  }
  if (s.ideas?.length) {
    g.font = font(24, 800); g.fillStyle = '#8a6416'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('💡 はなせる こと · Ideas', 60, y); y += 40;
    for (const t of s.ideas) y = text(g, `・${t}`, 70, y, W - 160, 26, { color: THEME.ink, weight: 600 });
    y += 10;
  }
  if (s.starters?.length) {
    const st = s.starters.join('　／　');
    g.font = font(30, 800);
    const sh = wrap(g, st, W - 160).length * 30 * 1.45 + 30;
    g.fillStyle = '#fff3cf'; rr(g, 50, y, W - 100, sh, 26); g.fill();
    text(g, st, 76, y + 15, W - 160, 30, { color: '#8a6416', weight: 800 });
  }
  const by = H - 130;
  p.button('ideas', 50, by, 330, 84, s.ideas ? 'ヒントを とじる' : 'ヒント · Ideas', () => this.h.ideas?.(), { color: THEME.sun, fg: THEME.ink, size: 30 });
  p.button('topic', 400, by, 400, 84, 'わだいを かえる · Topic', () => this.h.topic?.(), { color: '#a9cdf0', fg: THEME.ink, size: 30, disabled: !!s.waiting });
  p.button('finish', 820, by, 330, 84, 'おわる · Finish', () => this.h.finish(), { color: THEME.blue, size: 30 });
};

function drawMic(g, x, y, s, color) {
  g.save();
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = s * 0.18; g.lineCap = 'round';
  rr(g, x - s * 0.32, y - s * 0.8, s * 0.64, s * 1.1, s * 0.32); g.fill();
  g.beginPath(); g.arc(x, y - s * 0.05, s * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.beginPath(); g.moveTo(x, y + s * 0.5); g.lineTo(x, y + s * 0.8); g.stroke();
  g.restore();
}

/** Course tabs on the town board: Japanese title with the English one below. */
function drawTabs(g, p, W, tabs, active, onTab) {
  const x0 = 440; const gap = 18;
  const tw = (W - x0 - 70 - gap * (tabs.length - 1)) / tabs.length;
  tabs.forEach((c, i) => {
    const x = x0 + i * (tw + gap);
    const on = c.id === active;
    p.button(`tab-${c.id}`, x, 32, tw, 88, '', () => onTab(c.id), { color: on ? THEME.sun : '#f1eadb', fg: THEME.ink });
    const hover = p.hoverId === `tab-${c.id}` ? -2 : 0;
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = THEME.ink;
    let sz = 30; g.font = font(sz, 800);
    while (sz > 18 && g.measureText(c.titleJa).width > tw - 50) { sz -= 1; g.font = font(sz, 800); }
    g.fillText(c.titleJa, x + tw / 2, 32 + 33 + hover);
    let ez = 19; g.font = font(ez, 700);
    while (ez > 13 && g.measureText(c.titleEn).width > tw - 50) { ez -= 1; g.font = font(ez, 700); }
    g.fillStyle = THEME.soft; g.fillText(c.titleEn, x + tw / 2, 32 + 66 + hover);
    g.restore();
  });
}

// -------------------------------------------------------------------- board
/** The big panel: lessons, scenario cards, briefing and the report. */
export class Board {
  constructor(app, sound) {
    this.app = app;
    this.panel = new Panel(app, 1800, 1100, 1.7, { name: 'board' });
    this.panel.onHoverSound = () => sound.blip('soft');
    this.panel.onClickSound = () => sound.blip('pop');
    app.scene.add(this.panel.mesh);
    this.panel.visible = false;
  }

  hide() { this.panel.visible = false; }

  /**
   * The town board: course tabs and the units of the chosen course (10 per page when a course has more than 12).
   * courses: [{ id, titleJa, titleEn, units: [...] }]; tabs: every tab (the courses + the free-talk room);
   * starsOf(variantId, mode); page/onPage for long courses.
   */
  courses({ courses, tabs = courses, active, starsOf, onTab, onPick, page = 0, onPage }) {
    this.panel.setHeight(1100);
    this.panel.visible = true;
    const course = courses.find((c) => c.id === active) || courses[0];
    const paged = course.units.length > 12;
    const pages = paged ? Math.ceil(course.units.length / 10) : 1;
    const pg = Math.max(0, Math.min(pages - 1, page));
    const units = paged ? course.units.slice(pg * 10, pg * 10 + 10) : course.units;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      g.textBaseline = 'alphabetic';
      nameTag(g, 70, 40, 'ことばタウン', THEME.leaf, '#ffffff', 40);
      drawTabs(g, p, W, tabs, course.id, onTab);
      if (paged) {
        // pages: 1〜10, 11〜20 …
        const bw = 300; const x0 = W / 2 - (pages * bw + (pages - 1) * 24) / 2;
        for (let i = 0; i < pages; i++) {
          const a = course.units[i * 10]?.no; const b = course.units[Math.min(course.units.length, i * 10 + 10) - 1]?.no;
          p.button(`page-${i}`, x0 + i * (bw + 24), H - 128, bw, 76, `${a}〜${b}`, () => onPage?.(i), { color: i === pg ? THEME.sun : '#f1eadb', fg: THEME.ink, size: 32 });
        }
      }
      const cols = paged ? 5 : units.length > 10 ? 6 : 5; const cw = (W - 160 - (cols - 1) * 28) / cols; const ch = paged ? 370 : 380;
      units.forEach((L, i) => {
        const x = 80 + (i % cols) * (cw + 28); const y = 150 + Math.floor(i / cols) * (ch + 30);
        const real = L.variants.reduce((s2, v) => s2 + starsOf(v.id, 'real'), 0);
        const prac = L.variants.reduce((s2, v) => s2 + starsOf(v.id, 'practice'), 0);
        const hover = p.hoverId === L.id;
        g.fillStyle = THEME.shadow; rr(g, x + 3, y + 10, cw, ch, 40); g.fill();
        g.fillStyle = hover ? '#fff6dc' : '#ffffff'; rr(g, x, y - (hover ? 4 : 0), cw, ch, 40); g.fill();
        g.fillStyle = colorFor(L.id); g.beginPath(); g.arc(x + 66, y + 70, 44, 0, Math.PI * 2); g.fill();
        g.font = font(44, 800); g.fillStyle = THEME.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(L.no), x + 66, y + 72);
        g.textAlign = 'left'; g.textBaseline = 'top';
        if (L.course === 'it') {
          g.font = font(22, 800); g.fillStyle = THEME.soft;
          g.fillText(`${L.storyKey}  ${L.episodeJa || ''}`, x + 124, y + 56);
        }
        // titles in full: smaller type for long ones
        const tf = fitWrap(g, L.titleJa, cw - 52, 100, [36, 31, 27, 24], { weight: 800 });
        const ty = text(g, L.titleJa, x + 26, y + 124, cw - 52, tf.px, { weight: 800 });
        const ef = fitWrap(g, L.titleEn, cw - 52, y + ch - 96 - (ty + 6), [24, 21, 19, 17], { weight: 500 });
        text(g, L.titleEn, x + 26, ty + 6, cw - 52, ef.px, { color: THEME.soft, weight: 500 });
        const max = L.variants.length * 3;
        const sx = cols > 5 ? 132 : 150; const step = Math.min(22, (cw - sx - 18) / max); const sr = Math.min(9, step * 0.42);
        g.font = font(cols > 5 ? 18 : 20, 800); g.fillStyle = THEME.leafDark; g.fillText('れんしゅう', x + 22, y + ch - 82);
        g.fillStyle = '#c9772e'; g.fillText('ほんばん', x + 22, y + ch - 50);
        for (let k = 0; k < max; k++) {
          star(g, x + sx + k * step, y + ch - 72, sr, k < prac ? '#9ad8b7' : '#ece3d2');
          star(g, x + sx + k * step, y + ch - 40, sr, k < real ? THEME.sun : '#ece3d2');
        }
        p.buttons.push({ id: L.id, x, y, w: cw, h: ch, onClick: () => onPick(L) });
      });
    });
  }

  /**
   * The free-talk room: choose a partner, a place, a topic, the level and the style — or おまかせ.
   * v: { tabs, partners [{ id, nameJa, roleEn, casual }], partner, info, place {nameJa,nameEn}, topic, topicPos,
   *      level, style, levels, live, summary, on: { tab, partner, place(dir), topic(dir), level, style, random, start } }
   */
  freeSetup(v) {
    this.panel.setHeight(1100);
    this.panel.visible = true;
    const on = v.on;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      g.textBaseline = 'alphabetic';
      nameTag(g, 70, 40, 'ことばタウン', THEME.leaf, '#ffffff', 40);
      drawTabs(g, p, W, v.tabs, 'free', on.tab);
      const label = (str, x, y) => { g.font = font(28, 800); g.fillStyle = THEME.ink; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(str, x, y); };
      // partners
      label('だれと はなす？ · Who', 80, 140);
      const cols = 4; const cw = 252; const chh = 80; const gap = 12;
      v.partners.forEach((c, i) => {
        const x = 80 + (i % cols) * (cw + gap); const y = 186 + Math.floor(i / cols) * (chh + gap);
        const sel = c.id === v.partner.id; const hover = p.hoverId === `p-${c.id}`;
        g.fillStyle = THEME.shadow; rr(g, x + 2, y + 5, cw, chh, 24); g.fill();
        g.fillStyle = sel ? THEME.sun : hover ? '#fff6dc' : '#ffffff'; rr(g, x, y, cw, chh, 24); g.fill();
        g.fillStyle = colorFor(c.id); g.beginPath(); g.arc(x + 36, y + chh / 2, 22, 0, Math.PI * 2); g.fill();
        g.fillStyle = THEME.ink; g.font = font(22, 800); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText([...c.nameJa][0], x + 36, y + chh / 2 + 1);
        g.textAlign = 'left'; g.textBaseline = 'top';
        let nsz = 25; g.font = font(nsz, 800); while (nsz > 18 && g.measureText(c.nameJa).width > cw - 82) { nsz -= 1; g.font = font(nsz, 800); }
        g.fillText(c.nameJa, x + 68, y + 8);
        // the role in full (two short lines)
        const role = c.roleEn.split(/[,(]/)[0].trim();
        const rf = fitWrap(g, role, cw - 80, 36, [15, 14, 13, 12], { weight: 600, lh: 1.2 });
        text(g, role, x + 68, y + 40, cw - 80, rf.px, { color: THEME.soft, weight: 600, maxLines: 2, lh: 1.2 });
        p.buttons.push({ id: `p-${c.id}`, x, y, w: cw, h: chh, onClick: () => on.partner(c.id) });
      });
      const rows = Math.ceil(v.partners.length / cols);
      const iy = 186 + rows * (chh + gap) + 6;
      if (v.info) text(g, [v.info.relationEn && `${v.partner.nameJa}: ${v.info.relationEn}.`, v.info.likesEn && `Likes ${v.info.likesEn}.`].filter(Boolean).join(' '), 80, iy, 1050, 22, { color: THEME.soft, maxLines: 3, weight: 600 });
      // right column: place, topic, level, style
      const rx = 1170; const rw = W - 80 - rx;
      const cycler = (id, y, h, lines, dir) => {
        p.button(`${id}-prev`, rx, y + (h - 70) / 2, 70, 70, '◀', () => dir(-1), { color: '#f1eadb', fg: THEME.ink, size: 28 });
        p.button(`${id}-next`, rx + rw - 70, y + (h - 70) / 2, 70, 70, '▶', () => dir(1), { color: '#f1eadb', fg: THEME.ink, size: 28 });
        g.fillStyle = '#ffffff'; rr(g, rx + 82, y, rw - 164, h, 26); g.fill();
        let ly = y + 12;
        for (const [str, px, color, weight] of lines) { if (!str) continue; ly = text(g, str, rx + 100, ly, rw - 200, px, { color, weight, maxLines: 2 }); }
      };
      label('どこで · Where', rx, 140);
      cycler('place', 180, 84, [[v.place.nameJa, 28, THEME.ink, 800], [v.place.nameEn, 18, THEME.soft, 600]], on.place);
      label(`なにを はなす · Topic  ${v.topicPos}`, rx, 284);
      cycler('topic', 324, 128, [[v.topic.titleJa, 27, THEME.ink, 800], [`${v.topic.titleEn}${v.topic.kind === 'role' ? '  (role-play)' : ''}`, 19, THEME.soft, 600]], on.topic);
      label('レベル · Level', rx, 476);
      const lw = (rw - 20) / 3;
      v.levels.forEach(([id, ja, en], i) => p.button(`lv-${id}`, rx + i * (lw + 10), 516, lw, 76, '', () => on.level(id), { color: v.level === id ? THEME.leaf : '#f1eadb', lines: [ja, en], size: 22, lineHeight: 26, fg: v.level === id ? '#ffffff' : THEME.ink }));
      label('はなしかた · Style', rx, 612);
      const sw = (rw - 10) / 2;
      p.button('st-polite', rx, 652, sw, 70, 'ていねい · Polite', () => on.style('polite'), { color: v.style === 'polite' ? THEME.leaf : '#f1eadb', fg: v.style === 'polite' ? '#ffffff' : THEME.ink, size: 24 });
      p.button('st-casual', rx + sw + 10, 652, sw, 70, 'ともだち · Casual', () => on.style('casual'), { color: v.style === 'casual' ? THEME.leaf : '#f1eadb', fg: v.style === 'casual' ? '#ffffff' : THEME.ink, size: 24, disabled: !v.info?.casual });
      const about = v.topic.situationEn || (v.topic.ideasEn || []).join(' · ');
      if (about) text(g, about, rx, 744, rw, 21, { color: '#6c7d8a', maxLines: 5, weight: 500 });
      // start
      text(g, v.live ? v.summary : '🎙️ フリートークは Gemini Live が ひつようです — add your Gemini API key in せってい (Settings).', 80, H - 232, W - 160, 26, { color: v.live ? THEME.leafDark : THEME.red, weight: 800, maxLines: 2 });
      p.button('random', 80, H - 150, 460, 92, '🎲 おまかせ · Surprise me', on.random, { color: THEME.sun, fg: THEME.ink, size: 32 });
      p.button('start', W - 80 - 620, H - 150, 620, 92, 'はなす！ · Start talking', on.start, { color: '#f7a35c', size: 36, disabled: !v.live });
    });
  }

  /** Feedback after a free talk: summary, what was good, better ways to say things, words for next time. */
  freeReport({ report, turns, partner, place, topics, onAgain, onNew, onTown }) {
    this.panel.setHeight(1100);
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      nameTag(g, 70, 44, 'フリートークの ふりかえり · Feedback', THEME.sun, THEME.ink, 40);
      g.font = font(24, 700); g.fillStyle = THEME.soft; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillText(`${partner.nameJa} · ${place.nameJa} · ${turns.length} turns${report.source === 'live' ? ' · Gemini Live' : ''}`, W - 80, 92);
      stars(g, 80, 128, report.stars, 3, 72);
      let y = text(g, report.summaryEn || '', 360, 128, W - 440, 30, { weight: 700, maxLines: 3 });
      y = Math.max(y + 10, 230);
      if (topics?.length) y = text(g, `💬 ${topics.map((t) => t.titleJa).join('、 ')}`, 360, y - 6, W - 440, 22, { color: THEME.soft, maxLines: 1 }) + 10;
      const colW = (W - 200) / 2; const lx = 80; const rx = 120 + colW;
      // left: strengths, next steps, things said well
      let ly = Math.max(y, 270);
      if (report.strengthsEn) ly = text(g, `👍 ${report.strengthsEn}`, lx, ly, colW, 26, { color: THEME.leafDark, maxLines: 3 }) + 8;
      if (report.improveEn) ly = text(g, `🌱 ${report.improveEn}`, lx, ly, colW, 26, { color: '#a3622a', maxLines: 3 }) + 8;
      if (report.pronunciationEn) ly = text(g, `🗣️ ${report.pronunciationEn}`, lx, ly, colW, 26, { color: '#2f6db3', maxLines: 2 }) + 8;
      if (report.levelEn) ly = text(g, `📈 ${report.levelEn}`, lx, ly, colW, 26, { color: THEME.ink, maxLines: 2 }) + 8;
      if (report.good?.length) {
        ly += 6; g.font = font(26, 800); g.fillStyle = THEME.leafDark; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText('✨ よかった ことば · Said well', lx, ly); ly += 40;
        for (const t of report.good) { if (ly > H - 300) break; ly = text(g, `「${t}」`, lx + 10, ly, colW - 10, 26, { color: THEME.ink, maxLines: 2, weight: 700 }) + 4; }
      }
      if (report.words?.length && ly < H - 300) {
        ly += 10; g.font = font(26, 800); g.fillStyle = '#8a6416'; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText('📒 つぎに つかえる ことば · Words', lx, ly); ly += 44;
        let cx = lx;
        for (const w of report.words) {
          const lab = `${w.ja}${w.kana && w.kana !== w.ja ? `（${w.kana}）` : ''} ${w.en}`;
          g.font = font(22, 800);
          const cw = g.measureText(lab).width + 26;
          if (cx + cw > lx + colW) { cx = lx; ly += 52; }
          if (ly > H - 230) break;
          chip(g, cx, ly, lab, '#fff3cf', '#8a6416', 22);
          cx += cw + 12;
        }
      }
      // right: better ways to say it
      let ry = Math.max(y, 270);
      g.font = font(28, 800); g.fillStyle = THEME.ink; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText('✍️ こう いうと もっと いい · Better ways to say it', rx, ry); ry += 48;
      if (!report.corrections?.length) ry = text(g, turns.length ? 'Nothing big to fix — great job!' : 'Say a few sentences next time, and you will get tips here.', rx, ry, colW, 26, { color: THEME.soft, maxLines: 2 });
      for (const c of report.corrections || []) {
        if (ry > H - 300) break;
        g.fillStyle = '#eef6f1';
        g.font = font(24, 700); const h1 = wrap(g, `🎤 ${c.heard}`, colW - 40).slice(0, 2).length * 24 * 1.45;
        g.font = font(28, 800); const h2 = wrap(g, `✓ ${c.better}`, colW - 40).slice(0, 2).length * 28 * 1.45;
        g.font = font(21, 500); const h3 = c.tipEn ? wrap(g, c.tipEn, colW - 40).slice(0, 2).length * 21 * 1.45 : 0;
        g.fillStyle = '#eef6f1'; rr(g, rx - 10, ry, colW + 10, h1 + h2 + h3 + 30, 24); g.fill();
        let cy = text(g, `🎤 ${c.heard}`, rx + 12, ry + 12, colW - 40, 24, { color: THEME.soft, maxLines: 2 });
        cy = text(g, `✓ ${c.better}`, rx + 12, cy + 2, colW - 40, 28, { color: THEME.leafDark, weight: 800, maxLines: 2 });
        if (c.tipEn) cy = text(g, c.tipEn, rx + 12, cy + 2, colW - 40, 21, { color: '#6c7d8a', weight: 500, maxLines: 2 });
        ry = cy + 26;
      }
      const list = [
        ['again', 'もう いちど はなす · Again', onAgain, THEME.leaf, '#ffffff'],
        ['new', 'ほかの あいて・わだい', onNew, '#a9cdf0', THEME.ink],
        ['town', 'まちへ · Town', onTown, '#e8dccb', THEME.ink],
      ];
      const bw = (W - 160 - (list.length - 1) * 24) / list.length;
      list.forEach(([id, label, fn, color, fg], i) => p.button(id, 80 + i * (bw + 24), H - 160, bw, 90, label, fn, { color, fg, size: 32 }));
    });
  }

  variants(lesson, starsOf, onPick, onBack, sceneName) {
    this.panel.setHeight(1100);
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      nameTag(g, 70, 44, unitLabel(lesson), colorFor(lesson.id), THEME.ink, 44);
      text(g, `${lesson.titleJa} — ${lesson.titleEn}`, 80, 130, W - 160, 40, { weight: 800, maxLines: 1 });
      text(g, lesson.course === 'it' && lesson.previouslyEn ? `${lesson.summaryEn}  ·  Story so far: ${lesson.previouslyEn}` : lesson.summaryEn, 80, 186, W - 160, 28, { color: THEME.soft, maxLines: 2, weight: 500 });
      const n = lesson.variants.length;
      const cw = (W - 160 - (n - 1) * 32) / n; const ch = 640;
      lesson.variants.forEach((v, i) => {
        const x = 80 + i * (cw + 32); const y = 270;
        const hover = p.hoverId === v.id;
        g.fillStyle = THEME.shadow; rr(g, x + 3, y + 10, cw, ch, 40); g.fill();
        g.fillStyle = hover ? '#fff6dc' : '#ffffff'; rr(g, x, y - (hover ? 4 : 0), cw, ch, 40); g.fill();
        g.fillStyle = '#eef6f1'; rr(g, x + 22, y + 22, cw - 44, 110, 28); g.fill();
        g.font = font(30, 800); g.fillStyle = THEME.leafDark; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(`📍 ${sceneName(v.scene)}${v.call ? ' · 📞' : ''}`, x + 46, y + 56);
        g.font = font(24, 700); g.fillStyle = THEME.soft;
        g.fillText(lesson.course === 'it' ? `パターン ${String.fromCharCode(65 + i)}` : `${v.setup?.time || ''} · ${v.setup?.season || ''}${v.setup?.weather === 'rain' ? ' · rain' : ''}`, x + 46, y + 100);
        let yy = text(g, v.titleJa, x + 30, y + 160, cw - 60, 40, { weight: 800, maxLines: 2 });
        yy = text(g, v.titleEn, x + 30, yy + 4, cw - 60, 28, { color: THEME.soft, maxLines: 2 });
        text(g, v.briefEn, x + 30, yy + 18, cw - 60, 27, { color: '#6c7d8a', weight: 500, maxLines: n > 2 ? 7 : 6 });
        g.font = font(24, 800); g.textBaseline = 'middle';
        g.fillStyle = THEME.leafDark; g.fillText('れんしゅう', x + 30, y + ch - 104);
        stars(g, x + 170, y + ch - 126, starsOf(v.id, 'practice'), 3, 40);
        g.fillStyle = '#c9772e'; g.fillText('ほんばん', x + 30, y + ch - 52);
        stars(g, x + 170, y + ch - 74, starsOf(v.id, 'real'), 3, 40);
        p.buttons.push({ id: v.id, x, y, w: cw, h: ch, onClick: () => onPick(v) });
      });
      p.button('back', 80, H - 150, 320, 84, '← もどる · Back', onBack, { color: '#e8dccb', fg: THEME.ink });
    });
  }

  /** Briefing with the two ways to play: れんしゅう (with examples and hints) and ほんばん (no help, needs the key). */
  briefing({ lesson, variant, cast, live, onPractice, onReal, onBack, note }) {
    // Everything is shown in full: the panel grows taller for long briefs (interviews) instead of cutting
    // text; type only shrinks a little before that.
    const W0 = 1800; const g0 = this.panel.g;
    const people = `People: ${cast.map((c) => `${c.nameJa}（${c.roleEn}）`).join('、 ')}`;
    const measure = (k) => {
      const h = (str, px, mw, weight = 700) => { g0.font = font(px * k, weight); return wrap(g0, str, mw).length * px * k * 1.45; };
      return h(variant.briefEn, 31, W0 - 160, 500) + 8 + h(`🧑 ${variant.roleEn}`, 28, W0 - 160) + 14 + 70
        + variant.missionsEn.reduce((a, m) => a + h(`☐ ${m.text}`, 29, W0 - 260) + 6, 0) + 10 + h(people, 26, W0 - 160);
    };
    const top = 136 + 42 * 1.45; // below the English title
    const bottom = 330 + 30; // mode boxes + buttons
    let k = 1;
    for (const kk of [1, 0.94, 0.88]) { k = kk; if (top + measure(kk) + bottom <= 1100) break; }
    const H0 = Math.min(1900, Math.max(1100, Math.ceil(top + measure(k) + bottom + 20)));
    this.panel.setHeight(H0);
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      nameTag(g, 70, 44, `${unitLabel(lesson)} · ${variant.titleJa}`, colorFor(lesson.id), THEME.ink, 40);
      let y = text(g, variant.titleEn, 80, 136, W - 160, 42, { weight: 800, maxLines: 1 });
      y = text(g, variant.briefEn, 80, y + 8, W - 160, 31 * k, { color: THEME.ink, weight: 500 });
      y = text(g, `🧑 ${variant.roleEn}`, 80, y + 8, W - 160, 28 * k, { color: THEME.soft });
      y += 14;
      g.font = font(29 * k, 700);
      const mh = variant.missionsEn.reduce((a, m) => a + wrap(g, `☐ ${m.text}`, W - 260).length * 29 * k * 1.45 + 6, 0);
      g.fillStyle = '#eef6f1'; rr(g, 70, y, W - 140, 62 + mh, 30); g.fill();
      g.font = font(28 * k, 800); g.fillStyle = THEME.leafDark; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText('Missions', 100, y + 16);
      let my = y + 58;
      variant.missionsEn.forEach((m) => { my = text(g, `☐ ${m.text}`, 110, my, W - 260, 29 * k) + 6; });
      y += 72 + mh;
      text(g, people, 80, y, W - 160, 26 * k, { color: THEME.soft });
      // the two modes
      const bx = 70; const bw = (W - 140 - 30) / 2; const by = H - 330;
      g.fillStyle = '#eef6f1'; rr(g, bx, by, bw, 168, 30); g.fill();
      text(g, '📗 れんしゅう · Practice — answer examples are shown from the start, hints help you. Read one aloud or say your own answer.', bx + 26, by + 22, bw - 52, 25, { color: THEME.leafDark, maxLines: 4 });
      g.fillStyle = live ? '#fff1e3' : '#f2eee6'; rr(g, bx + bw + 30, by, bw, 168, 30); g.fill();
      text(g, live ? '🎯 ほんばん · Real — no examples, no hints. Just listen and answer, like at work or in town. Judged by Gemini Live.' : '🎯 ほんばん · Real needs a Gemini API key (せってい · Settings). Without it, practise first.', bx + bw + 56, by + 22, bw - 52, 25, { color: live ? '#a3622a' : THEME.soft, maxLines: 4 });
      if (note) text(g, note, 80, by - 44, W - 160, 24, { color: THEME.red, maxLines: 1 });
      p.button('back', 80, H - 140, 260, 84, '← もどる', onBack, { color: '#e8dccb', fg: THEME.ink });
      p.button('practice', 380, H - 140, 600, 90, 'れんしゅう · Practice', onPractice, { color: THEME.leaf, size: 38 });
      p.button('real', 1010, H - 140, 600, 90, 'ほんばん · Real', onReal, { color: '#f7a35c', size: 38, disabled: !live });
    });
  }

  report(args) {
    if (args.report?.interview) { this.interviewReport(args); return; }
    const { lesson, variant, report, turns, missions, mode, onRetry, onReal, onNext, onOther, onTown } = args;
    this.panel.setHeight(1100);
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      const tw = nameTag(g, 70, 44, 'けっか · Results', THEME.sun, THEME.ink, 44);
      nameTag(g, 70 + tw + 18, 52, mode === 'real' ? 'ほんばん' : 'れんしゅう', mode === 'real' ? '#f7a35c' : '#d7ecdf', mode === 'real' ? '#ffffff' : THEME.leafDark, 32);
      g.font = font(28, 700); g.fillStyle = THEME.soft; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillText(`${lesson.titleJa} · ${variant.titleJa}${report.source === 'live' ? ' · judged by Gemini Live' : ''}`, W - 80, 92);
      stars(g, 80, 130, report.stars, 3, 84);
      let y = text(g, report.summaryEn, 420, 130, W - 500, 32, { weight: 700, maxLines: 4 });
      y = Math.max(y, 240);
      const colW = (W - 200) / 2;
      let ly = text(g, `👍 ${report.strengthsEn}`, 80, y + 10, colW, 28, { color: THEME.leafDark, maxLines: 3 });
      ly = text(g, `🌱 ${report.improveEn}`, 80, ly + 10, colW, 28, { color: '#a3622a', maxLines: 3 });
      if (report.pronunciationEn) ly = text(g, `🗣️ ${report.pronunciationEn}`, 80, ly + 10, colW, 28, { color: '#2f6db3', maxLines: 2 });
      ly += 14;
      missions.forEach((m) => { ly = text(g, `${m.done ? '☑' : '☐'} ${m.text}`, 80, ly, colW, 26, { color: m.done ? THEME.ink : THEME.soft, maxLines: 2 }); });
      // turn list
      let ty = y + 10; const tx = 120 + colW;
      g.font = font(28, 800); g.fillStyle = THEME.ink; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText('Your answers', tx, ty); ty += 46;
      for (const t of turns.slice(-6)) {
        if (ty > H - 260) break;
        stars(g, tx, ty + 2, t.score, 3, 26);
        ty = Math.max(ty + 38, text(g, t.heard || '—', tx + 110, ty, colW - 120, 26, { maxLines: 2 }));
        if (t.correction && t.correction !== t.heard) ty = text(g, `→ ${t.correction}`, tx + 110, ty, colW - 120, 24, { color: THEME.leafDark, maxLines: 2 }) + 4;
        ty += 10;
      }
      const by = H - 160;
      const buttons = [
        ['retry', 'もう いちど · Retry', onRetry, THEME.leaf, '#ffffff'],
        onReal && ['real', 'ほんばんに ちょうせん', onReal, '#f7a35c', '#ffffff'],
        onNext && ['next', 'つぎの 話へ · Next', onNext, THEME.sun, THEME.ink],
        ['other', 'ほかの ばめん', onOther, '#a9cdf0', THEME.ink],
        ['town', 'まちへ · Town', onTown, '#e8dccb', THEME.ink],
      ].filter(Boolean);
      const bw = (W - 160 - (buttons.length - 1) * 24) / buttons.length;
      buttons.forEach(([id, label, fn, color, fg], i) => p.button(id, 80 + i * (bw + 24), by, bw, 90, label, fn, { color, fg, size: 32 }));
    });
  }

  /** Job interview result: verdict, the interviewer's rubric, what to improve, a better answer; page 2 lists every answer. */
  interviewReport(args, page = 'summary') {
    const { lesson, variant, report, turns, mode, onRetry, onReal, onNext, onOther, onTown } = args;
    this.panel.setHeight(1100);
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      const tw = nameTag(g, 70, 44, 'めんせつの けっか · Interview result', THEME.sun, THEME.ink, 40);
      nameTag(g, 70 + tw + 18, 50, mode === 'real' ? 'ほんばん' : 'れんしゅう', mode === 'real' ? '#f7a35c' : '#d7ecdf', mode === 'real' ? '#ffffff' : THEME.leafDark, 30);
      g.font = font(24, 700); g.fillStyle = THEME.soft; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      const by = report.source !== 'live' ? 'scored on this device' : /extended-thinking/.test(report.model || '') ? 'judged by Gemini Live (Extended Thinking)' : 'judged by Gemini Live';
      g.fillText(`${lesson.titleJa} · ${variant.titleJa} · ${by}`, W - 80, 90);
      const buttons = page === 'summary'
        ? [['answers', 'こたえを みる · Answers', () => this.interviewReport(args, 'answers'), '#cfe3f7', THEME.ink]]
        : [['back', 'けっかに もどる · Back', () => this.interviewReport(args, 'summary'), '#cfe3f7', THEME.ink]];
      if (page === 'summary') {
        const v = VERDICTS[report.verdict] || VERDICTS.borderline;
        g.fillStyle = v.color; rr(g, 80, 128, 640, 120, 60); g.fill();
        g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.font = font(46, 800); g.fillText(`判定：${v.ja}`, 120, 172);
        g.font = font(24, 700); g.fillText(v.en, 122, 220);
        text(g, report.verdictReasonEn || report.summaryEn || '', 760, 132, W - 840, 30, { weight: 700, maxLines: 4 });
        // rubric
        g.font = font(28, 800); g.fillStyle = THEME.ink; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText('ひょうか · How the interviewer saw it', 80, 282);
        let ry = 332;
        for (const c of report.criteria || []) {
          const info = RUBRIC_INFO[c.id]; if (!info) continue;
          g.font = font(26, 800); g.fillStyle = THEME.ink; g.textBaseline = 'top'; g.fillText(info.ja, 80, ry);
          g.font = font(18, 700); g.fillStyle = THEME.soft; g.fillText(info.en, 80, ry + 32);
          dots(g, 352, ry + 18, c.score, c.score >= 4 ? THEME.leaf : c.score === 3 ? THEME.sun : '#e0705c');
          if (c.commentEn) text(g, c.commentEn, 512, ry + 2, 400, 22, { color: '#6c7d8a', maxLines: 2, weight: 500 });
          ry += 64;
        }
        // improvements + a better answer
        const rx = 960; const rw = W - rx - 80;
        g.font = font(28, 800); g.fillStyle = '#a3622a'; g.textBaseline = 'top'; g.fillText('🌱 つぎに なおす こと · Improve next', rx, 282);
        let iy = 330;
        (report.improvements || []).forEach((t, i) => { iy = text(g, `${i + 1}. ${t}`, rx, iy, rw, 26, { color: THEME.ink, maxLines: 3, weight: 600 }) + 8; });
        if (report.rewrite?.answerJa) {
          iy += 10;
          g.fillStyle = '#eaf6ef'; rr(g, rx - 16, iy, rw + 32, H - 210 - iy, 28); g.fill();
          g.font = font(26, 800); g.fillStyle = THEME.leafDark; g.textBaseline = 'top'; g.fillText('✍️ 言い直して みよう · Try this answer', rx, iy + 18);
          let qy = iy + 58;
          if (report.rewrite.questionJa) qy = text(g, `Q. ${report.rewrite.questionJa}`, rx, qy, rw, 24, { color: THEME.soft, maxLines: 2, weight: 700 }) + 6;
          text(g, report.rewrite.answerJa, rx, qy, rw, 28, { color: THEME.leafDark, weight: 800, maxLines: Math.max(2, Math.floor((H - 230 - qy) / 40)) });
        }
      } else {
        g.font = font(28, 800); g.fillStyle = THEME.ink; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText('こたえ · Your answers (→ a better answer)', 80, 130);
        let ty = 180;
        const rows = turns.filter((t) => t.questionJa !== undefined);
        const per = Math.max(78, Math.min(120, (H - 380) / Math.max(1, rows.length)));
        for (const t of rows) {
          if (ty > H - 260) break;
          stars(g, 80, ty + 4, t.score, 3, 22);
          text(g, `Q. ${t.questionJa || t.promptEn}`, 180, ty, W - 260, 21, { color: THEME.soft, maxLines: 1, weight: 700 });
          text(g, `🎤 ${t.heard || '—'}`, 180, ty + 28, (W - 280) / 2, 22, { maxLines: 2 });
          const better = t.betterAnswer || (t.score < 2 ? t.modelAnswer : '');
          if (better) text(g, `→ ${better}`, 180 + (W - 260) / 2, ty + 28, (W - 280) / 2, 22, { color: THEME.leafDark, maxLines: 2, weight: 700 });
          ty += per;
        }
      }
      const list = [
        ...buttons,
        ['retry', 'もう いちど · Retry', onRetry, THEME.leaf, '#ffffff'],
        onReal && ['real', 'ほんばんに ちょうせん', onReal, '#f7a35c', '#ffffff'],
        onNext && ['next', 'つぎの 話へ · Next', onNext, THEME.sun, THEME.ink],
        ['other', 'ほかの ばめん', onOther, '#a9cdf0', THEME.ink],
        ['town', 'まちへ · Town', onTown, '#e8dccb', THEME.ink],
      ].filter(Boolean);
      const bw = (W - 160 - (list.length - 1) * 20) / list.length;
      list.forEach(([id, label, fn, color, fg], i) => p.button(id, 80 + i * (bw + 20), H - 160, bw, 90, label, fn, { color, fg, size: 28 }));
    });
  }

  message(title, body, buttons = []) {
    this.panel.setHeight(1100);
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      nameTag(g, 70, 44, title, THEME.sun, THEME.ink, 44);
      text(g, body, 90, 170, W - 180, 38, { maxLines: 10, weight: 500 });
      buttons.forEach((b, i) => p.button(`b${i}`, 90 + i * 460, H - 170, 420, 90, b.label, b.onClick, { color: b.color || THEME.leaf, fg: b.fg }));
    });
  }
}

/** Short floating notice (e.g. "Connecting to Gemini Live…"). */
export class Toast {
  constructor(app) {
    this.panel = new Panel(app, 1000, 150, 0.62, { name: 'toast', interactive: false, depthTest: false });
    this.panel.visible = false;
    app.camera.add(this.panel.mesh);
    this.panel.mesh.position.set(0, 0.2, -0.9);
    this.timer = null;
  }
  show(msg, ms = 2600, color = THEME.night) {
    clearTimeout(this.timer);
    this.panel.visible = true;
    this.panel.draw((g, W, H) => {
      g.fillStyle = 'rgba(40,50,70,0.82)'; rr(g, 6, 6, W - 12, H - 12, (H - 12) / 2); g.fill();
      g.font = font(42, 800); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let m = msg; while (g.measureText(m).width > W - 80 && m.length > 4) m = `${m.slice(0, -2)}…`;
      g.fillText(m, W / 2, H / 2 + 2);
      void color;
    });
    if (ms) this.timer = setTimeout(() => { this.panel.visible = false; }, ms);
  }
  hide() { this.panel.visible = false; }
}

/** Keeps a panel comfortably in front of the learner (lazy follow on yaw). */
export class LazyFollow {
  constructor(app, obj, { dist = 0.95, height = -0.32, threshold = 0.6 } = {}) {
    Object.assign(this, { app, obj, dist, height, threshold });
    this.yaw = null;
  }
  update(dt, force = false) {
    const head = this.app.headPosition();
    const dir = new THREE.Vector3(); this.app.camera.getWorldDirection(dir);
    const yawNow = Math.atan2(dir.x, dir.z);
    if (this.yaw === null || force) this.yaw = yawNow;
    let d = yawNow - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > this.threshold) this.yaw += d * Math.min(1, dt * 2.5);
    const target = new THREE.Vector3(head.x + Math.sin(this.yaw) * this.dist, head.y + this.height, head.z + Math.cos(this.yaw) * this.dist);
    if (force) this.obj.position.copy(target); else this.obj.position.lerp(target, Math.min(1, dt * 6));
    this.obj.lookAt(head.x, head.y + this.height * 0.4, head.z);
  }
}

export { shade };
