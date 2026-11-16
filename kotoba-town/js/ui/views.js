// The game's UI pieces, drawn on Panels: speech bubble, the learner's turn card, the big board
// (lesson list, scenario cards, briefing, report) and toasts.
import * as THREE from 'three';
import { Panel, THEME, rr, font, wrap, card, nameTag, stars, star, text, shade } from './panel.js';
import { toRomaji } from '../content/index.js';

const NAME_COLORS = ['#ffd36b', '#9ad8b7', '#f6b3c6', '#a9cdf0', '#f7c08a', '#c9b6ef'];
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
      const px = t.main.length > 34 ? 44 : 52;
      g.font = font(px, 800);
      const lines = wrap(g, t.main, W - 170);
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

  redraw() {
    const s = this.state; if (!s) return;
    const p = this.panel;
    p.draw((g, W, H) => {
      card(g, 10, 10, W - 20, H - 30, { fill: s.mode === 'npc' ? '#f7f2e6' : THEME.cream });
      // header
      const listening = s.mode === 'listen' || s.mode === 'free';
      nameTag(g, 50, 40, listening ? (s.mode === 'free' ? 'フリートーク · Free talk' : 'あなたの ばん · Your turn') : s.mode === 'feedback' ? 'ひょうか · Feedback' : 'きいて · Listen', listening ? THEME.leaf : s.mode === 'feedback' ? THEME.sun : '#d9cdb8', listening ? '#ffffff' : THEME.ink, 36);
      // mic indicator
      const cx = W - 120; const cy = 92;
      const micOn = listening && s.mic === 'on';
      g.fillStyle = micOn ? 'rgba(124,197,160,0.25)' : 'rgba(0,0,0,0.06)';
      g.beginPath(); g.arc(cx, cy, 44 + (micOn ? this.level * 30 : 0), 0, Math.PI * 2); g.fill();
      g.fillStyle = micOn ? THEME.leafDark : s.mic === 'denied' ? THEME.red : '#b9ad98';
      g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fill();
      drawMic(g, cx, cy, 22, '#ffffff');
      g.font = font(22, 800); g.textAlign = 'center'; g.fillStyle = THEME.soft;
      g.fillText(micOn ? 'listening' : s.mic === 'denied' ? 'mic blocked' : s.mode === 'npc' ? 'wait…' : 'mic', cx, cy + 74);

      let y = 140;
      if (s.mode === 'npc') {
        text(g, s.promptEn || 'Listen…', 60, y, W - 240, 40, { color: THEME.soft });
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
      // listen / free
      y = text(g, s.promptEn || '', 60, y, W - 240, 40, { maxLines: 3 });
      y += 10;
      if (s.heard) {
        g.fillStyle = '#f1eadb'; rr(g, 50, y, W - 100, 90, 26); g.fill();
        text(g, `🎤 ${s.heard}`, 76, y + 22, W - 160, 36, { color: THEME.ink, maxLines: 1 });
        y += 104;
      }
      if (s.showHint && s.hintJa) {
        g.fillStyle = '#fff3cf'; rr(g, 50, y, W - 100, 96, 26); g.fill();
        text(g, `💡 ${s.hintJa}`, 76, y + 24, W - 160, 38, { color: '#8a6416', weight: 800, maxLines: 1 });
        y += 110;
      }
      if (s.notice) { y = text(g, s.notice, 60, y, W - 120, 30, { color: THEME.red, maxLines: 2 }) + 6; }
      if (s.choices?.length) {
        g.font = font(26, 700); g.fillStyle = THEME.soft; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(s.live ? 'Say one of these (or your own answer):' : 'Read one aloud, then tap it:', 60, y);
        y += 40;
        for (const [i, c] of s.choices.slice(0, 4).entries()) {
          p.button(`c${i}`, 50, y, W - 100, 74, c, () => this.h.choose(c), { color: '#ffffff', fg: THEME.ink, outline: THEME.line, size: 34 });
          y += 86;
        }
      }
      // bottom buttons
      const by = H - 130;
      if (s.mode === 'free') {
        p.button('finish', W / 2 - 170, by, 340, 84, 'おわる · Finish', () => this.h.finish(), { color: THEME.blue });
        return;
      }
      p.button('hint', 50, by, 300, 84, 'ヒント · Hint', () => this.h.hint(), { color: THEME.sun, fg: THEME.ink });
      p.button('again', 370, by, 300, 84, 'もういちど', () => this.h.again(), { color: '#a9cdf0', fg: THEME.ink });
      p.button('skip', 690, by, 300, 84, 'スキップ', () => this.h.skip(), { color: '#e8dccb', fg: THEME.soft });
    });
  }
}

function drawMic(g, x, y, s, color) {
  g.save();
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = s * 0.18; g.lineCap = 'round';
  rr(g, x - s * 0.32, y - s * 0.8, s * 0.64, s * 1.1, s * 0.32); g.fill();
  g.beginPath(); g.arc(x, y - s * 0.05, s * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.beginPath(); g.moveTo(x, y + s * 0.5); g.lineTo(x, y + s * 0.8); g.stroke();
  g.restore();
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

  lessons(list, progress, onPick, extra) {
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      g.textBaseline = 'alphabetic';
      nameTag(g, 70, 44, 'ことばタウン · Kotoba Town', THEME.leaf, '#ffffff', 46);
      g.font = font(32, 700); g.fillStyle = THEME.soft; g.textAlign = 'right';
      g.fillText('Minna no Nihongo I · 1–10', W - 80, 92);
      const cols = 5; const cw = (W - 160 - (cols - 1) * 28) / cols; const ch = 360;
      list.forEach((L, i) => {
        const x = 80 + (i % cols) * (cw + 28); const y = 150 + Math.floor(i / cols) * (ch + 34);
        const got = L.variants.reduce((s, v) => s + (progress[v.id]?.stars || 0), 0);
        const hover = p.hoverId === L.id;
        g.fillStyle = THEME.shadow; rr(g, x + 3, y + 10, cw, ch, 40); g.fill();
        g.fillStyle = hover ? '#fff6dc' : '#ffffff'; rr(g, x, y - (hover ? 4 : 0), cw, ch, 40); g.fill();
        g.fillStyle = colorFor(L.id); g.beginPath(); g.arc(x + 70, y + 74, 46, 0, Math.PI * 2); g.fill();
        g.font = font(46, 800); g.fillStyle = THEME.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(L.lesson), x + 70, y + 76);
        g.textAlign = 'left'; g.textBaseline = 'top';
        text(g, L.titleJa, x + 28, y + 140, cw - 56, 38, { weight: 800, maxLines: 2 });
        text(g, L.titleEn, x + 28, y + 236, cw - 56, 26, { color: THEME.soft, maxLines: 2, weight: 500 });
        for (let k = 0; k < 9; k++) star(g, x + 36 + (k % 9) * 26, y + ch - 40, 11, k < got ? THEME.sun : '#ece3d2');
        p.buttons.push({ id: L.id, x, y, w: cw, h: ch, onClick: () => onPick(L) });
      });
      extra?.(g, W, H, p);
    });
  }

  variants(lesson, progress, onPick, onBack, sceneName) {
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      nameTag(g, 70, 44, `だい ${lesson.lesson} か · Lesson ${lesson.lesson}`, colorFor(lesson.id), THEME.ink, 44);
      text(g, `${lesson.titleJa} — ${lesson.titleEn}`, 80, 130, W - 160, 40, { weight: 800, maxLines: 1 });
      text(g, lesson.summaryEn, 80, 186, W - 160, 30, { color: THEME.soft, maxLines: 2, weight: 500 });
      const cw = (W - 160 - 2 * 32) / 3; const ch = 640;
      lesson.variants.forEach((v, i) => {
        const x = 80 + i * (cw + 32); const y = 270;
        const hover = p.hoverId === v.id;
        g.fillStyle = THEME.shadow; rr(g, x + 3, y + 10, cw, ch, 40); g.fill();
        g.fillStyle = hover ? '#fff6dc' : '#ffffff'; rr(g, x, y - (hover ? 4 : 0), cw, ch, 40); g.fill();
        g.fillStyle = '#eef6f1'; rr(g, x + 22, y + 22, cw - 44, 110, 28); g.fill();
        g.font = font(30, 800); g.fillStyle = THEME.leafDark; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(`📍 ${sceneName(v.scene)}${v.call ? ' · 📞' : ''}`, x + 46, y + 56);
        g.font = font(24, 700); g.fillStyle = THEME.soft;
        g.fillText(`${v.setup?.time || ''} · ${v.setup?.season || ''}${v.setup?.weather === 'rain' ? ' · rain' : ''}`, x + 46, y + 100);
        let yy = text(g, v.titleJa, x + 30, y + 160, cw - 60, 40, { weight: 800, maxLines: 2 });
        yy = text(g, v.titleEn, x + 30, yy + 4, cw - 60, 28, { color: THEME.soft, maxLines: 2 });
        text(g, v.briefEn, x + 30, yy + 18, cw - 60, 27, { color: '#6c7d8a', weight: 500, maxLines: 7 });
        stars(g, x + 30, y + ch - 80, progress[v.id]?.stars || 0, 3, 46);
        p.buttons.push({ id: v.id, x, y, w: cw, h: ch, onClick: () => onPick(v) });
      });
      p.button('back', 80, H - 150, 320, 84, '← もどる · Back', onBack, { color: '#e8dccb', fg: THEME.ink });
    });
  }

  briefing({ lesson, variant, cast, live, onStart, onBack, note }) {
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      nameTag(g, 70, 44, `だい ${lesson.lesson} か · ${variant.titleJa}`, colorFor(lesson.id), THEME.ink, 42);
      let y = text(g, variant.titleEn, 80, 140, W - 160, 44, { weight: 800, maxLines: 1 });
      y = text(g, variant.briefEn, 80, y + 10, W - 160, 34, { color: THEME.ink, weight: 500, maxLines: 4 });
      y = text(g, `🧑 ${variant.roleEn}`, 80, y + 10, W - 160, 30, { color: THEME.soft, maxLines: 2 });
      y += 20;
      g.fillStyle = '#eef6f1'; rr(g, 70, y, W - 140, 60 + variant.missionsEn.length * 58, 30); g.fill();
      g.font = font(30, 800); g.fillStyle = THEME.leafDark; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText('Missions', 100, y + 20);
      variant.missionsEn.forEach((m, i) => text(g, `☐ ${m.text}`, 110, y + 70 + i * 58, W - 260, 32, { maxLines: 1 }));
      y += 80 + variant.missionsEn.length * 58;
      g.font = font(28, 700); g.fillStyle = THEME.soft;
      g.fillText(`People: ${cast.map((c) => `${c.nameJa}（${c.roleEn}）`).join('、 ')}`.slice(0, 120), 80, y + 4);
      g.fillStyle = live ? '#e3f1fb' : '#fdf0e2'; rr(g, 70, H - 270, W - 140, 90, 30); g.fill();
      text(g, note || (live ? '🎙️ Gemini Live is on: speak naturally — the mic stays on and turns green when it is your turn.' : '📝 Offline practice: no API key, so you read an answer aloud and tap it. Add a Gemini key in Settings for real conversation.'), 100, H - 252, W - 200, 28, { color: live ? '#2f6db3' : '#a3622a', maxLines: 2 });
      p.button('start', W - 520, H - 160, 440, 96, 'はじめる · Start', onStart, { color: THEME.leaf, size: 42 });
      p.button('back', 80, H - 150, 320, 84, '← もどる', onBack, { color: '#e8dccb', fg: THEME.ink });
    });
  }

  report({ lesson, variant, report, turns, missions, onRetry, onOther, onTown, onFree }) {
    this.panel.visible = true;
    this.panel.draw((g, W, H, p) => {
      card(g, 10, 10, W - 20, H - 30, { r: 60 });
      nameTag(g, 70, 44, 'けっか · Results', THEME.sun, THEME.ink, 44);
      g.font = font(30, 700); g.fillStyle = THEME.soft; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillText(`${lesson.titleJa} · ${variant.titleJa}${report.source === 'live' ? ' · judged by Gemini Live' : ''}`, W - 80, 92);
      stars(g, 80, 130, report.stars, 3, 84);
      let y = text(g, report.summaryEn, 420, 130, W - 500, 32, { weight: 700, maxLines: 4 });
      y = Math.max(y, 240);
      const colW = (W - 200) / 2;
      let ly = text(g, `👍 ${report.strengthsEn}`, 80, y + 10, colW, 28, { color: THEME.leafDark, maxLines: 3 });
      ly = text(g, `🌱 ${report.improveEn}`, 80, ly + 10, colW, 28, { color: '#a3622a', maxLines: 3 });
      if (report.pronunciationEn) ly = text(g, `🗣️ ${report.pronunciationEn}`, 80, ly + 10, colW, 28, { color: '#2f6db3', maxLines: 2 });
      ly += 14;
      missions.forEach((m) => { ly = text(g, `${m.done ? '☑' : '☐'} ${m.text}`, 80, ly, colW, 28, { color: m.done ? THEME.ink : THEME.soft, maxLines: 1 }); });
      // turn list
      let ty = y + 10; const tx = 120 + colW;
      g.font = font(28, 800); g.fillStyle = THEME.ink; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText('Your answers', tx, ty); ty += 46;
      for (const t of turns.slice(-6)) {
        if (ty > H - 260) break;
        stars(g, tx, ty + 2, t.score, 3, 26);
        text(g, t.heard || '—', tx + 110, ty, colW - 120, 28, { maxLines: 1 });
        ty += 38;
        if (t.correction && t.correction !== t.heard) { text(g, `→ ${t.correction}`, tx + 110, ty, colW - 120, 26, { color: THEME.leafDark, maxLines: 1 }); ty += 36; }
        ty += 10;
      }
      const by = H - 160;
      p.button('retry', 80, by, 380, 90, 'もう いちど · Retry', onRetry, { color: THEME.leaf });
      p.button('other', 490, by, 420, 90, 'ほかの ばめん · Other', onOther, { color: '#a9cdf0', fg: THEME.ink });
      if (onFree) p.button('free', 940, by, 380, 90, 'フリートーク', onFree, { color: THEME.pink, fg: THEME.ink });
      p.button('town', W - 420, by, 340, 90, 'まちへ · Town', onTown, { color: '#e8dccb', fg: THEME.ink });
    });
  }

  message(title, body, buttons = []) {
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
