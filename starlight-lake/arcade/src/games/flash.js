import * as THREE from 'three';
import { ArcadeGame } from './base.js';
import { Star } from '../visuals.js';
import { Staircase } from '../../../src/staircase.js';
import { Panel } from '../../../src/ui.js';
import { levelFrom } from '../progress.js';
import { rand, pick } from '../../../src/util.js';
import { NUM_FONT, POP_FONT } from '../fonts.js';

// Flash Count (speed of seeing): stars flash for a moment, then a sparkle mask; how many were
// there? The exposure time follows a 3-down-1-up staircase, so it shortens as you get faster,
// and higher levels show more stars. Brief-exposure training is the idea behind Polat et al.
// 2012 (presbyopia) and speed-of-processing training.

const COLORS = [0xffd45e, 0xff6fa8, 0x3fb8ff, 0x4fcf6f, 0x9a7bff, 0xff9d2e];

export class FlashCount extends ArcadeGame {
  constructor(app) { super(app, 'flash'); }

  start() {
    super.start();
    const app = this.app;
    this.st = new Staircase({ start: 700, min: 40, max: 1500, easier: 1, steps: [0.15, 0.09, 0.05] }, app.progress.stair('eg-flash'));
    this.stars = Array.from({ length: 14 }, () => { const s = new Star(); s.mesh.visible = false; this.root.add(s.mesh); return s; });
    this.dot = new Star(0xffffff); this.root.add(this.dot.mesh);
    this.panel = null;
    this.onKey = (e) => { if (this.phase === 'answer' && /^[1-9]$/.test(e.key)) this.answer(+e.key); };
    window.addEventListener('keydown', this.onKey);
    this.newTrial();
  }

  level() { return levelFrom(this.st.threshold(), 800, 50); }

  newTrial() {
    const lv = this.level();
    const maxN = Math.min(9, 4 + Math.floor(lv / 7));
    this.n = Math.floor(rand(2, maxN + 1));
    this.pts = [];
    for (let k = 0; k < 60 && this.pts.length < this.n; k++) {
      const p = { az: rand(-9, 9), el: rand(-5, 6) };
      if (this.pts.every((q) => Math.hypot(q.az - p.az, q.el - p.el) > 3.4)) this.pts.push(p);
    }
    this.n = this.pts.length;
    this.phase = 'ready'; this.pt = 0;
    this.stars.forEach((st) => { st.mesh.visible = false; });
    this.closePanel();
  }

  placeStar(s, az, el, deg) {
    s.mesh.position.copy(this.at(az, el, 2));
    s.mesh.scale.setScalar(2 * 2 * Math.tan(THREE.MathUtils.degToRad(deg / 2)));
    this.face(s.mesh);
  }

  update(dt) {
    super.update(dt);
    this.pt += dt;
    this.placeStar(this.dot, 0, 0.5, 0.9);
    this.dot.uniforms.uSpin.value = this.t;
    const dur = this.st.value / 1000;
    if (this.phase === 'ready') {
      this.dot.uniforms.uOpacity.value = 0.5 + 0.5 * Math.sin(this.pt * 12);
      if (this.pt > 0.75) {
        this.phase = 'show'; this.pt = 0;
        this.pts.forEach((p, i) => { const s = this.stars[i]; s.mesh.visible = true; s.uniforms.uOpacity.value = 1; s.uniforms.uColor.value.setHex(pick(COLORS), THREE.LinearSRGBColorSpace); s.uniforms.uSpin.value = rand(0, 6); this.placeStar(s, p.az, p.el, 2.8); });
        this.app.sound.beep(true);
      }
    } else if (this.phase === 'show') {
      this.dot.uniforms.uOpacity.value = 1;
      if (this.pt >= dur) {
        this.phase = 'mask'; this.pt = 0;
        // a burst of look-alike sparkles hides what stayed on the retina
        this.stars.forEach((s) => { s.mesh.visible = true; s.uniforms.uOpacity.value = 0.55; s.uniforms.uColor.value.setHex(pick(COLORS), THREE.LinearSRGBColorSpace); this.placeStar(s, rand(-11, 11), rand(-6, 7), rand(1.2, 2.6)); });
      }
    } else if (this.phase === 'mask') {
      if (this.pt > 0.22) { this.stars.forEach((s) => { s.mesh.visible = false; }); this.phase = 'answer'; this.pt = 0; this.askAnswer(); }
    } else if (this.phase === 'answer') {
      if (this.pt > 7) this.answer(-1);
    } else if (this.phase === 'feedback') {
      if (this.pt > 0.9) this.newTrial();
    }
  }

  askAnswer() {
    const n = this.n;
    const set = new Set([n]);
    while (set.size < 4) { const c = n + Math.round(rand(-2.4, 2.4)); if (c >= 1 && c <= 12) set.add(c); }
    const opts = [...set].sort((a, b) => a - b);
    const app = this.app;
    this.panel = app.ui.add(new Panel({
      w: 0.86, h: 0.24, px: 1100, theme: 'pop', accent: this.def.color,
      draw: (g, W, H, panel) => {
        g.fillStyle = '#3a4466'; g.font = `700 40px ${POP_FONT}`; g.textAlign = 'center';
        g.fillText('星はいくつ？', W / 2, 70);
        opts.forEach((v, i) => panel.button('n' + v, 40 + i * 260, 100, 240, 170, String(v), { color: ['#ff6fa8', '#3fb8ff', '#ffb52e', '#4fcf6f'][i], font: `700 110px ${NUM_FONT}`, onClick: () => this.answer(v) }));
      },
    }));
    const p = this.at(0, -14, 1.5);
    this.panel.mesh.position.copy(p); this.panel.mesh.lookAt(app.head);
    this.answerStart = this.t;
  }

  closePanel() { if (this.panel) { this.app.ui.remove(this.panel); this.panel = null; } }

  answer(v) {
    if (this.phase !== 'answer') return;
    const ok = v === this.n;
    this.st.update(ok);
    const pos = this.at(0, 2, 2);
    if (ok) {
      const rt = this.t - this.answerStart;
      this.reward(pos, { mult: 1 + Math.max(0, (3 - rt) / 3) * 0.6 });
      this.app.sound.good(pos, this.combo);
      this.app.fx.burst(pos, { count: 36, color: [1, 0.85, 0.4], speed: 0.6, size: 0.02 });
    } else {
      this.fail(pos, { word: v < 0 ? 'TIME UP' : `${this.n}こ でした` });
    }
    // show the answer again, clearly
    this.pts.forEach((p, i) => { const s = this.stars[i]; s.mesh.visible = true; s.uniforms.uOpacity.value = ok ? 0.9 : 0.6; this.placeStar(s, p.az, p.el, 2.8); });
    this.closePanel();
    this.phase = 'feedback'; this.pt = 0;
  }

  stop() {
    this.closePanel();
    window.removeEventListener('keydown', this.onKey);
    this.app.progress.setStair('eg-flash', this.st.toJSON());
    this.app.progress.save();
    return super.stop();
  }
}
