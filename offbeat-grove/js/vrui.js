// js/vrui.js — the panels you see inside VR (a canvas drawn into a texture on a plane). Buttons are picked
// with the controller's laser (trigger) or, with hand tracking, by pointing and pinching.
import * as THREE from 'three';
import { canvasTexture, FONT, roundRect, fmtTime } from './util.js';
import { SONGS, songById } from './songs.js';
import { MODES, DIFFS } from './chart.js';
import { HAND_COLOR, SUB_COLOR } from './targets.js';

const C = { glass: 'rgba(12,28,22,0.86)', line: 'rgba(255,255,255,0.16)', ink: '#f5f2e8', muted: '#b6c3b4', accent: '#9be36a', btn: 'rgba(255,255,255,0.08)', sel: '#f5f2e8', selInk: '#10231b', gold: SUB_COLOR.and };

export class Panel {
  constructor(wPx, hPx, wM) {
    this.w = wPx; this.h = hPx; this.ppm = wPx / wM;
    const { canvas, ctx, tex } = canvasTexture(wPx, hPx);
    this.canvas = canvas; this.ctx = ctx; this.tex = tex;
    tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hPx / this.ppm), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    this.mesh.renderOrder = 8;
    this.buttons = [];
    this.hover = null;
    this.visible = false;
    this.mesh.visible = false;
  }
  show(on) { this.visible = on; this.mesh.visible = on; if (on) this.redraw(); }
  redraw() {
    this.buttons = [];
    const x = this.ctx;
    x.clearRect(0, 0, this.w, this.h);
    this.draw(x);
    this.tex.needsUpdate = true;
  }
  draw() {}
  bg(x, r = 34) {
    x.fillStyle = C.glass;
    roundRect(x, 4, 4, this.w - 8, this.h - 8, r);
    x.fill();
    x.strokeStyle = C.line;
    x.lineWidth = 3;
    x.stroke();
  }
  text(x, s, px, py, size, color = C.ink, weight = 700, align = 'left', maxW) {
    x.font = `${weight} ${size}px ${FONT}`;
    x.fillStyle = color;
    x.textAlign = align;
    x.textBaseline = 'middle';
    x.fillText(s, px, py, maxW);
  }
  // a button: registered for picking, drawn selected / hovered / plain
  button(x, id, bx, by, bw, bh, label, { sel = false, sub = '', big = false, color = null, onClick } = {}) {
    this.buttons.push({ id, x: bx, y: by, w: bw, h: bh, onClick });
    const hov = this.hover === id;
    x.fillStyle = sel ? (color || C.sel) : hov ? 'rgba(255,255,255,0.2)' : C.btn;
    roundRect(x, bx, by, bw, bh, big ? 26 : 16);
    x.fill();
    if (hov) { x.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,0.6)'; x.lineWidth = 4; x.stroke(); }
    const ink = sel ? C.selInk : C.ink;
    if (sub) {
      this.text(x, label, bx + 22, by + bh * 0.36, big ? 44 : 30, ink, 800, 'left', bw - 40);
      this.text(x, sub, bx + 22, by + bh * 0.72, 21, sel ? 'rgba(16,35,27,0.75)' : C.muted, 500, 'left', bw - 40);
    } else this.text(x, label, bx + bw / 2, by + bh / 2 + 2, big ? 46 : 28, ink, 800, 'center', bw - 16);
  }
  // ray (world) → { distance, point, quat, button }
  pick(o, d) {
    if (!this.visible) return null;
    const m = this.mesh;
    m.updateWorldMatrix(true, false);
    const inv = m.matrixWorld.clone().invert();
    const lo = o.clone().applyMatrix4(inv);
    const ld = d.clone().transformDirection(inv);
    if (Math.abs(ld.z) < 1e-6) return null;
    const t = -lo.z / ld.z;
    if (t < 0) return null;
    const p = lo.addScaledVector(ld, t);
    const W = this.w / this.ppm, H = this.h / this.ppm;
    const px = (p.x + W / 2) * this.ppm, py = (H / 2 - p.y) * this.ppm;
    if (px < 0 || py < 0 || px > this.w || py > this.h) return null;
    const point = p.clone().applyMatrix4(m.matrixWorld);
    const button = this.buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || null;
    const quat = new THREE.Quaternion();
    m.getWorldQuaternion(quat);
    point.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(quat), 0.004);
    return { distance: point.distanceTo(o), point, quat, button, px, py };
  }
  setHover(id) { if (id !== this.hover) { this.hover = id; this.redraw(); } }
}

export class MenuPanel extends Panel {
  constructor(app) { super(1400, 900, 1.55); this.app = app; }
  draw(x) {
    const a = this.app, s = a.store.data;
    this.bg(x);
    this.text(x, 'OFFBEAT GROVE', 44, 62, 52, C.ink, 900);
    this.text(x, '裏拍ボクササイズ', 470, 66, 30, C.accent, 700);
    this.text(x, 'トリガー（またはつまむ）で選択', this.w - 44, 64, 22, C.muted, 500, 'right');
    // songs
    this.text(x, '曲', 44, 140, 26, C.muted, 700);
    const songs = [...SONGS];
    if (a.track) songs.push({ id: 'track', title: a.track.name, jp: 'じぶんの曲', genre: `BPM ${a.track.bpm}`, bpm: a.track.bpm });
    songs.forEach((song, i) => {
      const y = 166 + i * 84;
      const bpm = song.drill ? `${s.drillBpm}` : song.bpm;
      this.button(x, 'song:' + song.id, 40, y, 640, 74, song.title, { sel: s.song === song.id, sub: `${song.jp}・${song.genre}・BPM ${bpm}`, onClick: () => a.choose({ song: song.id }) });
    });
    // options
    const X = 720, W = 640;
    this.text(x, 'リズム', X, 140, 26, C.muted, 700);
    Object.entries(MODES).forEach(([k, m], i) => {
      this.button(x, 'mode:' + k, X + (i % 2) * (W / 2 + 4), 166 + Math.floor(i / 2) * 84, W / 2 - 4, 74, m.name, { sel: s.mode === k, sub: m.en, onClick: () => a.choose({ mode: k }) });
    });
    const row = (label, y, key, opts) => {
      this.text(x, label, X, y, 26, C.muted, 700);
      const n = opts.length, bw = (W - (n - 1) * 8) / n;
      opts.forEach(([v, l], i) => this.button(x, key + ':' + v, X + i * (bw + 8), y + 22, bw, 62, l, { sel: s[key] === v, onClick: () => a.choose({ [key]: v }) }));
    };
    row('むずかしさ', 360, 'diff', Object.entries(DIFFS).map(([k, d]) => [k, d.name]));
    row('ガイド音（打つ場所のクリック）', 470, 'guide', [['on', 'あり'], ['fade', 'だんだん消える'], ['off', 'なし']]);
    row('長さ', 580, 'length', [['full', 'フル（約2分半）'], ['short', 'ショート（約1分）']]);
    const song = s.song === 'track' ? null : songById(s.song);
    if (song && song.drill) {
      this.text(x, `テンポ  BPM ${s.drillBpm}`, X, 690, 26, C.ink, 800);
      this.button(x, 'bpm-', X + 330, 664, 140, 54, '−5', { onClick: () => a.choose({ drillBpm: Math.max(60, s.drillBpm - 5) }) });
      this.button(x, 'bpm+', X + 490, 664, 140, 54, '+5', { onClick: () => a.choose({ drillBpm: Math.min(160, s.drillBpm + 5) }) });
    }
    this.button(x, 'start', X, 738, W, 120, '▶  START', { sel: true, color: C.accent, big: true, onClick: () => a.start() });
    // footer: the tip for this song and mode, and the best score
    const tip = s.song === 'track' ? 'じぶんの曲：テンポは自動で検出しました。ずれる場合はPC画面で調整できます。' : song.tip;
    this.wrap(x, tip, 44, 166 + songs.length * 84 + 18, 640, 24, C.muted);
    const best = a.store.best({ song: s.song, mode: s.mode, diff: s.diff, length: s.length });
    if (best) this.text(x, `ベスト ${best.score.toLocaleString()}（${best.rank}）`, 44, this.h - 40, 24, C.gold, 800);
  }
  wrap(x, s, px, py, w, size, color) {
    x.font = `500 ${size}px ${FONT}`;
    let line = '', y = py;
    for (const ch of s) {
      if (x.measureText(line + ch).width > w) { this.text(x, line, px, y, size, color, 500); line = ''; y += size * 1.45; }
      line += ch;
    }
    if (line) this.text(x, line, px, y, size, color, 500);
  }
}

export class PausePanel extends Panel {
  constructor(app) { super(900, 520, 0.95); this.app = app; }
  draw(x) {
    this.bg(x);
    this.text(x, '一時停止', this.w / 2, 80, 54, C.ink, 900, 'center');
    this.text(x, '再開すると1小節のカウントのあとに続きから', this.w / 2, 142, 24, C.muted, 500, 'center');
    this.button(x, 'resume', 60, 190, 780, 110, '▶  再開', { sel: true, color: C.accent, big: true, onClick: () => this.app.resume() });
    this.button(x, 'retry', 60, 330, 375, 100, '最初から', { onClick: () => this.app.start() });
    this.button(x, 'menu', 465, 330, 375, 100, 'メニューへ', { onClick: () => this.app.toMenu() });
  }
}

export class ResultsPanel extends Panel {
  constructor(app) { super(1400, 900, 1.55); this.app = app; this.res = null; }
  draw(x) {
    const r = this.res;
    this.bg(x);
    if (!r) return;
    this.text(x, r.title, 44, 62, 40, C.ink, 900);
    this.text(x, `${MODES[r.mode].name}・${DIFFS[r.diff].name}`, this.w - 44, 62, 28, C.accent, 700, 'right');
    this.text(x, r.rank, 120, 230, 200, r.rank === 'S' ? '#fff3a6' : C.ink, 900, 'center');
    this.text(x, r.score.toLocaleString(), 250, 190, 70, C.ink, 900);
    this.text(x, `${r.isBest ? 'ベスト更新！  ' : ''}正確さ ${r.acc}%   最大コンボ ${r.maxCombo}`, 252, 258, 28, r.isBest ? C.gold : C.muted, 700);
    this.text(x, `パンチ ${r.hits}/${r.punches}   よけた枝 ${r.dodged}/${r.ducks}   ${fmtTime(r.duration)}   目安 ${r.kcal} kcal`, 44, 340, 26, C.muted, 600);
    // timing per subdivision
    this.text(x, 'タイミング（＋は遅い、−は早い）', 44, 410, 26, C.ink, 800);
    const cats = [['on', '表拍「1 2 3 4」'], ['and', '裏拍「&」'], ['six', '16分の裏「e・a」']];
    let y = 450;
    for (const [k, label] of cats) {
      const c = r.cat[k];
      if (!c.n) continue;
      this.text(x, label, 44, y + 26, 26, SUB_COLOR[k], 800);
      this.text(x, `${c.hit}/${c.n}  平均 ${c.mean > 0 ? '+' : ''}${c.mean}ms  ばらつき ±${c.sd}ms`, 330, y + 26, 24, C.ink, 600);
      this.histo(x, c.hist, 900, y, 440, 52, SUB_COLOR[k]);
      y += 76;
    }
    this.wrap(x, r.advice, 44, y + 20, this.w - 88, 26, C.ink);
    this.button(x, 'again', 44, this.h - 132, 640, 96, 'もう一度', { sel: true, color: C.accent, big: true, onClick: () => this.app.start() });
    this.button(x, 'menu', 716, this.h - 132, 640, 96, 'メニューへ', { big: true, onClick: () => this.app.toMenu() });
  }
  histo(x, h, px, py, w, hh, color) {
    const n = h.length, m = Math.max(1, ...h);
    x.strokeStyle = 'rgba(255,255,255,0.4)';
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(px + w / 2, py - 4); x.lineTo(px + w / 2, py + hh + 4); x.stroke();
    h.forEach((v, i) => {
      const bh = (v / m) * hh;
      x.fillStyle = color;
      x.globalAlpha = 0.85;
      x.fillRect(px + (i / n) * w + 1, py + hh - bh, w / n - 2, bh);
    });
    x.globalAlpha = 1;
    this.text(x, '早い', px, py + hh + 16, 18, C.muted, 500);
    this.text(x, '遅い', px + w, py + hh + 16, 18, C.muted, 500, 'right');
  }
  wrap(x, s, px, py, w, size, color) { MenuPanel.prototype.wrap.call(this, x, s, px, py, w, size, color); }
}

// score, combo, the count of the bar ("1 & 2 & 3 & 4 &") and the last timing, below the hit zone
export class Hud extends Panel {
  constructor() { super(1200, 240, 1.5); this.mesh.renderOrder = 7; this.state = {}; }
  set(st) {
    const k = JSON.stringify(st);
    if (k === this._k) return;
    this._k = k;
    this.state = st;
    this.redraw();
  }
  draw(x) {
    const s = this.state;
    x.fillStyle = 'rgba(10,24,18,0.55)';
    roundRect(x, 4, 4, this.w - 8, this.h - 8, 30);
    x.fill();
    this.text(x, (s.score || 0).toLocaleString(), 40, 70, 56, C.ink, 900);
    this.text(x, s.combo > 1 ? `${s.combo} COMBO  ×${s.mult}` : ' ', 40, 140, 30, s.mult >= 4 ? '#fff3a6' : C.accent, 800);
    this.text(x, s.timing || ' ', 40, 196, 26, C.muted, 600);
    // the count strip
    const labels = ['1', '&', '2', '&', '3', '&', '4', '&'];
    const X = 420, W = 740, cw = W / 8;
    labels.forEach((l, i) => {
      const on = s.pos === i;
      const mark = s.marks && s.marks[i];
      const sub = i % 2 === 0 ? 'on' : 'and';
      x.fillStyle = on ? (sub === 'on' ? '#ffffff' : C.gold) : mark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
      roundRect(x, X + i * cw + 4, 30, cw - 8, 110, 16);
      x.fill();
      if (mark) { x.fillStyle = HAND_COLOR[mark]; x.beginPath(); x.arc(X + i * cw + cw / 2, 158, 11, 0, Math.PI * 2); x.fill(); }
      this.text(x, l, X + i * cw + cw / 2, 88, 64, on ? C.selInk : sub === 'on' ? C.ink : C.gold, 900, 'center');
    });
    // progress, or the count-in after a pause
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.fillRect(X, 190, W, 8);
    x.fillStyle = C.accent;
    x.fillRect(X, 190, W * (s.progress || 0), 8);
    if (s.count) this.text(x, `${s.count}…`, X + W / 2, 220, 30, '#fff3a6', 900, 'center');
  }
}
