import { Panel, roundRect, wrapText, shade } from '../../src/ui.js';
import { GAMES, GAME_ORDER, SKILLS, rankOf } from './progress.js';
import { POP_FONT, NUM_FONT } from './fonts.js';

// The arcade's in-world screens. All are bright "pop" cards.

const ease = (t) => 1 - Math.pow(1 - Math.min(1, t), 3);

/** Five-axis radar of skill levels (1-50). Also used on the title page. */
export function drawRadar(g, cx, cy, R, values, { labels = true, font = POP_FONT, ink = '#3a4466' } = {}) {
  const keys = Object.keys(SKILLS);
  const ang = (i) => -Math.PI / 2 + (i / keys.length) * Math.PI * 2;
  g.save();
  for (const k of [0.25, 0.5, 0.75, 1]) {
    g.beginPath();
    keys.forEach((_, i) => { const x = cx + Math.cos(ang(i)) * R * k, y = cy + Math.sin(ang(i)) * R * k; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.strokeStyle = 'rgba(90,110,170,0.22)'; g.lineWidth = 2; g.stroke();
  }
  g.beginPath();
  keys.forEach((k, i) => { const v = Math.max(0.06, (values[k] || 1) / 50); const x = cx + Math.cos(ang(i)) * R * v, y = cy + Math.sin(ang(i)) * R * v; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath();
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  grad.addColorStop(0, 'rgba(255,111,168,0.55)'); grad.addColorStop(1, 'rgba(63,184,255,0.55)');
  g.fillStyle = grad; g.fill(); g.strokeStyle = '#ff6fa8'; g.lineWidth = 4; g.stroke();
  if (labels) {
    keys.forEach((k, i) => {
      const x = cx + Math.cos(ang(i)) * (R + 46), y = cy + Math.sin(ang(i)) * (R + 30);
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${Math.round(R * 0.15)}px ${font}`; g.fillText(SKILLS[k].label, x, y - R * 0.07);
      g.font = `600 ${Math.round(R * 0.15)}px ${NUM_FONT}`; g.fillStyle = '#ff4f9a'; g.fillText(`Lv.${values[k] || 1}`, x, y + R * 0.1);
    });
  }
  g.restore();
}

function header(g, W, title, sub, color = '#3a4466') {
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = color; g.font = `700 92px ${NUM_FONT}`; g.fillText(title, W / 2, 128);
  if (sub) { g.fillStyle = '#7480a0'; g.font = `700 34px ${POP_FONT}`; g.fillText(sub, W / 2, 178); }
}

function chip(g, x, y, r, color, icon, done) {
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  g.fillStyle = '#fff'; g.font = `700 ${Math.round(r)}px ${NUM_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(icon, x, y + 3);
  if (done) {
    g.beginPath(); g.arc(x + r * 0.7, y - r * 0.7, r * 0.42, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.strokeStyle = '#4fcf6f'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + r * 0.5, y - r * 0.7); g.lineTo(x + r * 0.65, y - r * 0.55); g.lineTo(x + r * 0.92, y - r * 0.9); g.stroke();
  }
  g.restore();
}

export class Screens {
  constructor(app) { this.app = app; this.panel = null; }

  show(panel, dist = 1.6, el = 0) {
    this.close();
    this.panel = this.app.ui.add(panel);
    this.app.ui.placeInFront(panel, dist, el);
    return panel;
  }
  close() { if (this.panel) { this.app.ui.remove(this.panel); this.panel = null; } }

  hub() {
    const app = this.app, pr = app.progress;
    const daily = pr.daily(app.available());
    const day = pr.day();
    const eye = pr.eyeLevel();
    this.show(new Panel({
      w: 1.25, h: 1.0, px: 1250, theme: 'pop', accent: '#ff6fa8',
      draw: (g, W, H, panel) => {
        header(g, W, 'EYE GYM', '見る力の脳トレ');
        // eye level + xp
        g.textAlign = 'left'; g.fillStyle = '#3a4466'; g.font = `700 40px ${NUM_FONT}`;
        g.fillText(`EYE LEVEL ${eye.lv}`, 90, 258);
        g.fillStyle = '#ff4f9a'; g.font = `600 34px ${NUM_FONT}`; g.fillText(pr.title(eye.lv), 420, 258);
        g.textAlign = 'right'; g.fillStyle = '#7480a0'; g.font = `700 30px ${POP_FONT}`;
        g.fillText(`EYE POWER ${pr.eyePower()}`, W - 90, 258);
        roundRect(g, 90, 278, W - 180, 22, 11); g.fillStyle = '#e4ebfa'; g.fill();
        roundRect(g, 90, 278, Math.max(22, (W - 180) * eye.into / eye.need), 22, 11); g.fillStyle = '#ffb52e'; g.fill();
        // today's training
        roundRect(g, 70, 330, W - 140, 300, 30); g.fillStyle = '#f3f7ff'; g.fill();
        g.textAlign = 'left'; g.fillStyle = '#3a4466'; g.font = `800 40px ${POP_FONT}`;
        g.fillText('きょうのトレーニング', 110, 390);
        g.textAlign = 'right'; g.fillStyle = day.stamp ? '#4fcf6f' : '#7480a0'; g.font = `700 32px ${POP_FONT}`;
        g.fillText(day.stamp ? 'クリア！' : `連続 ${pr.streak()} 日`, W - 110, 390);
        daily.forEach((id, i) => {
          const x = 220 + i * 330, def = GAMES[id];
          chip(g, x, 480, 50, def.color, def.icon, day.done.includes(id));
          g.textAlign = 'center'; g.fillStyle = '#3a4466'; g.font = `600 34px ${NUM_FONT}`; g.fillText(def.title, x, 580);
        });
        panel.button('daily', W / 2 - 300, 660, 600, 110, day.stamp ? 'もう一度トレーニング' : 'トレーニング開始 ▶', { primary: true, color: '#ff6fa8', onClick: () => app.startDaily() });
        panel.button('free', 90, 800, 340, 92, 'フリープレイ', { color: '#3fb8ff', onClick: () => this.freeplay() });
        panel.button('rec', 455, 800, 340, 92, 'きろく', { color: '#9a7bff', onClick: () => this.records() });
        panel.button('vol', 820, 800, 340, 92, `音量 ${Math.round(app.settings.volume * 100)}%`, { color: '#4fcf6f', onClick: () => { app.cycleVolume(); panel.redraw(); } });
      },
    }), 1.75, 2);
  }

  freeplay() {
    const app = this.app, pr = app.progress, avail = app.available();
    this.show(new Panel({
      w: 1.25, h: 0.95, px: 1250, theme: 'pop', accent: '#3fb8ff',
      draw: (g, W, H, panel) => {
        header(g, W, 'FREE PLAY', 'すきなゲームをえらぼう');
        GAME_ORDER.forEach((id, i) => {
          const def = GAMES[id], ok = avail.includes(id);
          const col = i % 3, row = Math.floor(i / 3);
          const inRow = row === 0 ? 3 : GAME_ORDER.length - 3;
          const x0 = W / 2 - (inRow * 350 + (inRow - 1) * 30) / 2;
          panel.button('g-' + id, x0 + col * 380, 230 + row * 250, 350, 220, def.title, {
            color: ok ? def.color : '#b8c0d6', font: `700 50px ${NUM_FONT}`,
            sub: ok ? `Lv.${pr.skillLevel(def.skill)}  ・  BEST ${pr.data.games[id].best.toLocaleString()}` : 'VR でプレイ',
            onClick: () => { if (ok) app.intro(id, { daily: false }); },
          });
        });
        panel.button('back', W / 2 - 170, H - 130, 340, 90, 'もどる', { ghost: true, color: '#3fb8ff', onClick: () => this.hub() });
      },
    }), 1.75, 2);
  }

  records() {
    const app = this.app, pr = app.progress;
    const vals = {}; for (const k of Object.keys(SKILLS)) vals[k] = pr.skillLevel(k);
    this.show(new Panel({
      w: 1.25, h: 1.0, px: 1250, theme: 'pop', accent: '#9a7bff',
      draw: (g, W, H, panel) => {
        header(g, W, 'RECORDS', `EYE POWER ${pr.eyePower()}  ・  ${pr.title()}`);
        drawRadar(g, 330, 520, 210, vals);
        g.textAlign = 'left';
        GAME_ORDER.forEach((id, i) => {
          const def = GAMES[id], rec = pr.data.games[id];
          const y = 280 + i * 92;
          chip(g, 690, y, 32, def.color, def.icon, false);
          g.fillStyle = '#3a4466'; g.font = `600 36px ${NUM_FONT}`; g.fillText(def.title, 740, y - 4);
          g.fillStyle = '#7480a0'; g.font = `700 26px ${POP_FONT}`;
          g.fillText(`BEST ${rec.best.toLocaleString()}  ・  ${rec.plays} 回`, 740, y + 32);
        });
        // last 14 days
        const d = new Date();
        g.fillStyle = '#3a4466'; g.font = `700 28px ${POP_FONT}`; g.textAlign = 'left'; g.fillText('この2週間', 90, 800);
        for (let i = 13; i >= 0; i--) {
          const day = new Date(d); day.setDate(d.getDate() - i);
          const k = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          const st = pr.data.days[k]?.stamp, x = 270 + (13 - i) * 62;
          g.beginPath(); g.arc(x, 790, 24, 0, Math.PI * 2); g.fillStyle = st ? '#ff6fa8' : '#e4ebfa'; g.fill();
          g.fillStyle = st ? '#fff' : '#9aa6c0'; g.font = `600 22px ${NUM_FONT}`; g.textAlign = 'center'; g.fillText(String(day.getDate()), x, 798);
        }
        panel.button('back', W / 2 - 170, H - 120, 340, 88, 'もどる', { ghost: true, color: '#9a7bff', onClick: () => this.hub() });
      },
    }), 1.75, 2);
  }

  intro(id, { daily, index, count }) {
    const app = this.app, pr = app.progress, def = GAMES[id];
    this.show(new Panel({
      w: 1.1, h: 0.78, px: 1100, theme: 'pop', accent: def.color,
      draw: (g, W, H, panel) => {
        if (daily) { g.fillStyle = '#7480a0'; g.font = `700 30px ${POP_FONT}`; g.textAlign = 'center'; g.fillText(`きょうのトレーニング ${index + 1} / ${count}`, W / 2, 80); }
        chip(g, W / 2, 175, 66, def.color, def.icon, false);
        g.textAlign = 'center'; g.fillStyle = '#3a4466'; g.font = `700 84px ${NUM_FONT}`; g.fillText(def.title, W / 2, 320);
        g.fillStyle = shade(def.color, -0.25); g.font = `800 32px ${POP_FONT}`;
        g.fillText(`${SKILLS[def.skill].label} Lv.${pr.skillLevel(def.skill)}   ・   BEST ${pr.data.games[id].best.toLocaleString()}`, W / 2, 378);
        g.fillStyle = '#3a4466'; g.font = `700 38px ${POP_FONT}`;
        wrapText(g, def.how, W / 2, 450, W - 160, 52, { align: 'center' });
        panel.button('go', W / 2 - 250, H - 150, 500, 110, 'スタート！', { primary: true, color: def.color, onClick: () => app.countdown() });
        panel.button('back', 40, H - 120, 200, 80, 'もどる', { ghost: true, color: def.color, font: `800 30px ${POP_FONT}`, onClick: () => this.hub() });
      },
    }), 1.6, 2);
  }

  result(id, res, rec, { daily, last }) {
    const app = this.app, def = GAMES[id];
    const t0 = performance.now();
    const panel = new Panel({
      w: 1.15, h: 0.95, px: 1150, theme: 'pop', accent: def.color,
      draw: (g, W, H, p) => {
        const k = ease((performance.now() - t0) / 1300);
        g.textAlign = 'center'; g.fillStyle = '#7480a0'; g.font = `600 40px ${NUM_FONT}`; g.fillText(`${def.title}  RESULT`, W / 2, 86);
        g.fillStyle = '#3a4466'; g.font = `700 150px ${NUM_FONT}`; g.fillText(Math.round(res.score * k).toLocaleString(), W / 2 - 110, 250);
        // rank stamp
        const rk = rec.rank, s = k >= 1 ? 1 : 0;
        if (s) {
          g.save(); g.translate(W - 230, 200); g.rotate(-0.15);
          g.beginPath(); g.arc(0, 0, 92, 0, Math.PI * 2); g.fillStyle = rk.color; g.fill();
          g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke();
          g.fillStyle = '#fff'; g.font = `700 120px ${NUM_FONT}`; g.textBaseline = 'middle'; g.fillText(rk.r, 0, 6);
          g.restore(); g.textBaseline = 'alphabetic';
        }
        let y = 330;
        if (s && (rec.newBest || rec.firstPlay)) {
          roundRect(g, W / 2 - 250, y - 48, 500, 66, 33); g.fillStyle = '#ffb52e'; g.fill();
          g.fillStyle = '#fff'; g.font = `700 42px ${NUM_FONT}`; g.fillText(rec.firstPlay ? 'FIRST RECORD!' : 'NEW RECORD!', W / 2, y);
        } else if (s) { g.fillStyle = '#7480a0'; g.font = `700 32px ${POP_FONT}`; g.fillText(`BEST ${Math.max(rec.prevBest, res.score).toLocaleString()}`, W / 2, y); }
        y += 80;
        g.fillStyle = rec.levelUp ? '#ff4f9a' : '#3a4466'; g.font = `800 46px ${POP_FONT}`;
        g.fillText(rec.levelUp ? `${SKILLS[def.skill].label} Lv.${rec.prevLevel} → Lv.${rec.level}  UP!` : `${SKILLS[def.skill].label} Lv.${rec.level}`, W / 2, y);
        y += 66;
        g.fillStyle = '#7480a0'; g.font = `700 32px ${POP_FONT}`;
        g.fillText(`正解 ${res.hits}  ・  正答率 ${Math.round(res.accuracy * 100)}%  ・  最大コンボ ${res.maxCombo}`, W / 2, y);
        // xp bar
        y += 50;
        const eye = rec.eyeAfter;
        g.textAlign = 'left'; g.fillStyle = '#3a4466'; g.font = `700 32px ${NUM_FONT}`;
        g.fillText(`EYE LEVEL ${eye.lv}${rec.eyeLevelUp ? '  UP!' : ''}`, 120, y + 6);
        g.textAlign = 'right'; g.fillStyle = '#ffb52e'; g.fillText(`+${rec.xpGain} XP`, W - 120, y + 6);
        roundRect(g, 120, y + 24, W - 240, 22, 11); g.fillStyle = '#e4ebfa'; g.fill();
        roundRect(g, 120, y + 24, Math.max(22, (W - 240) * (eye.into / eye.need) * k), 22, 11); g.fillStyle = '#ffb52e'; g.fill();
        if (daily && !last) p.button('next', W / 2 - 250, H - 150, 500, 110, 'つぎのゲーム ▶', { primary: true, color: '#ff6fa8', onClick: () => app.nextDaily() });
        else if (daily && last) p.button('done', W / 2 - 250, H - 150, 500, 110, 'トレーニング完了 ▶', { primary: true, color: '#ff6fa8', onClick: () => app.dailyDone() });
        else {
          p.button('again', W / 2 - 360, H - 150, 340, 110, 'もう一回', { primary: true, color: def.color, onClick: () => app.intro(id, { daily: false }) });
          p.button('menu', W / 2 + 20, H - 150, 340, 110, 'メニュー', { ghost: true, color: def.color, onClick: () => this.hub() });
        }
      },
    });
    panel.animUntil = t0 + 1400;
    this.show(panel, 1.6, 2);
  }

  dailyDone(stamped) {
    const app = this.app, pr = app.progress;
    const vals = {}; for (const k of Object.keys(SKILLS)) vals[k] = pr.skillLevel(k);
    this.show(new Panel({
      w: 1.15, h: 0.95, px: 1150, theme: 'pop', accent: '#ff6fa8',
      draw: (g, W, H, panel) => {
        g.save(); g.translate(W / 2, 150); g.rotate(-0.08);
        roundRect(g, -260, -80, 520, 150, 30); g.lineWidth = 12; g.strokeStyle = '#ff4f9a'; g.stroke();
        g.fillStyle = '#ff4f9a'; g.font = `700 110px ${NUM_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CLEAR!', 0, 0);
        g.restore(); g.textBaseline = 'alphabetic';
        g.textAlign = 'center'; g.fillStyle = '#3a4466'; g.font = `800 40px ${POP_FONT}`;
        g.fillText(stamped ? `きょうのトレーニング完了！ 連続 ${pr.streak()} 日` : 'きょうもおつかれさま！', W / 2, 300);
        drawRadar(g, W / 2, 545, 170, vals);
        g.fillStyle = '#7480a0'; g.font = `700 30px ${POP_FONT}`;
        g.fillText(`EYE POWER ${pr.eyePower()}  ・  また明日！`, W / 2, H - 175);
        panel.button('menu', W / 2 - 250, H - 140, 500, 104, 'メニューへ', { primary: true, color: '#ff6fa8', onClick: () => this.hub() });
      },
    }), 1.6, 2);
  }

  pause() {
    const app = this.app;
    return this.show(new Panel({
      w: 0.9, h: 0.55, px: 1000, theme: 'pop', accent: '#3fb8ff',
      draw: (g, W, H, panel) => {
        header(g, W, 'PAUSE', null);
        panel.button('resume', W / 2 - 330, H - 190, 300, 110, 'つづける', { primary: true, color: '#3fb8ff', onClick: () => app.togglePause() });
        panel.button('quit', W / 2 + 30, H - 190, 300, 110, 'やめる', { ghost: true, color: '#3fb8ff', onClick: () => app.quitGame() });
      },
    }), 1.3, 0);
  }
}

/** Small strip under the play area: game, score, combo, time. */
export class ArcadeHud {
  constructor(app) {
    this.app = app;
    this.state = {};
    this.panel = new Panel({
      w: 0.7, h: 0.12, px: 1100, glass: false,
      draw: (g, W, H) => {
        const d = this.state;
        if (!d.title) return;
        roundRect(g, 6, 6, W - 12, H - 12, (H - 12) / 2); g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill();
        g.lineWidth = 4; g.strokeStyle = d.color || '#3fb8ff'; g.stroke();
        g.textBaseline = 'middle';
        g.textAlign = 'left'; g.fillStyle = d.color || '#3fb8ff'; g.font = `700 46px ${NUM_FONT}`; g.fillText(d.title, 50, H / 2 + 2);
        g.textAlign = 'center'; g.fillStyle = '#3a4466'; g.font = `700 60px ${NUM_FONT}`; g.fillText(d.score.toLocaleString(), W * 0.52, H / 2 + 2);
        g.textAlign = 'right'; g.font = `700 44px ${NUM_FONT}`;
        g.fillStyle = d.combo >= 5 ? '#ff4f9a' : '#7480a0';
        g.fillText(`${d.combo > 1 ? '×' + d.combo + '   ' : ''}${d.time}`, W - 60, H / 2 + 2);
      },
    });
    app.ui.add(this.panel);
    this.panel.visible = false;
  }
  update(game) {
    const app = this.app;
    if (!game) { this.panel.visible = false; return; }
    this.panel.visible = true;
    const left = Math.ceil(game.remaining());
    const st = { title: game.def.title, color: game.def.color, score: game.score, combo: game.combo, time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
    if (app.hudDirty || st.time !== this.state.time || st.title !== this.state.title) {
      this.state = st; this.panel.redraw(); app.hudDirty = false;
    }
    this.panel.mesh.position.copy(app.stagePoint(0, -22, 1.45));
    this.panel.mesh.lookAt(app.head);
  }
}

export { rankOf };
