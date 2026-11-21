// tutorial.js — a hands-on, step-by-step lesson. Nothing is timed until the player is ready:
// orbs stop at their touch point, comets wait for the hand, curtains and bars wait for the move.
// The hologram coach demonstrates each move; a card explains it in one line.
import * as THREE from 'three';
import { Gen } from './chart.js';
import { STAGES } from './timeline.js';
import { ENTITY } from './entities.js';
import { STEP_WIDTH, SQUAT_DEPTH } from './body.js';
import { makeRng } from './util.js';

const NO_CAPTIONS = { has: () => true, add() {} };

export class Tutorial {
  constructor(game) {
    this.game = game;
  }

  start() {
    const g = this.game, s = g.store.settings;
    this.t = 0;
    this.lane = 0;
    this.standing = s.stance !== 'sit';
    this.squat = this.standing ? SQUAT_DEPTH[s.squat] || 0 : 0;
    this.steps = [this.touch, this.rhythm, this.trace, this.pose];
    if (this.standing) this.steps.push(this.step);
    if (this.squat) this.steps.push(this.duck);
    this.total = this.steps.length;
    this.index = -1;
    this.wait = null;
    this.gen = null;
    this.next();
  }

  next() {
    this.index++;
    if (this.index >= this.steps.length) { this.gen = this.finish(); return; }
    this.gen = this.steps[this.index].call(this);
  }

  update(dt) {
    this.t += dt;
    for (let guard = 0; guard < 8; guard++) {
      if (this.wait !== null) {
        if (typeof this.wait === 'number' ? this.t < this.wait : !this.wait()) return;
        this.wait = null;
      }
      const r = this.gen.next();
      if (r.done) { if (this.index < this.steps.length) this.next(); else return; continue; }
      this.wait = typeof r.value === 'number' ? this.t + r.value : r.value;
    }
  }

  // ---------- helpers ----------
  card(en, text, sub, icon) { this.game.showTutorialCard({ step: this.index + 1, total: this.total, en, text, sub, icon }); }
  nice(text = 'いいですね！', sub = '') {
    const g = this.game;
    g.showTutorialCard({ step: this.index + 1, total: this.total, en: 'NICE!', text, sub, done: true });
    g.audio.chord(4, 0.2);
    g.fx.popup('nice', new THREE.Vector3(g.head.x, g.body.eyeY + 0.05, -1.4), 1.6);
  }
  make(lead) {
    const g = this.game;
    const seg = { t0: this.t + lead, beatSec: 0.6, barSec: 2.4, stage: STAGES.warm };
    const ctx = { rng: makeRng(7 + this.index), body: g.body, lane: this.lane, laneW: g.laneW, squatDepth: this.squat, seen: NO_CAPTIONS, backCare: g.store.settings.backCare };
    return { gen: new Gen(seg, ctx), seg, ctx };
  }
  spawn(evs, seg, wait = true) {
    const g = this.game, out = [];
    for (const ev of evs) {
      if (ev.type === 'caption') continue;
      ev.wait = wait; ev.seg = seg;
      const e = new ENTITY[ev.type](g, ev);
      g.entities.push(e);
      out.push(e);
    }
    return out;
  }
  orb(hand, name) {
    const { gen, seg } = this.make(this.game.approach);
    gen.orb(0, hand, name);
    return this.spawn(gen.events, seg)[0];
  }

  // ---------- steps ----------
  *touch() {
    this.card('TOUCH THE STARS', '青い星は「左手」でタッチ', '星は手元のリングで止まって待っています。コーチのまねをしてみよう', 'hand');
    yield 1.2;
    let o = this.orb('L', 'front');
    yield () => o.dead;
    this.card('TOUCH THE STARS', 'ピンクの星は「右手」でタッチ', '色で使う手が決まっています', 'hand');
    yield 0.6;
    o = this.orb('R', 'front');
    yield () => o.dead;
    this.card('REACH HIGH', '高い星は、腕を上へ伸ばしてタッチ', '肩まわりをぐーっと伸ばそう', 'up');
    yield 0.6;
    o = this.orb('R', 'high');
    yield () => o.dead;
    this.card('BOTH HANDS', 'ふたつ同時に来たら、両手で', '腕を大きく横に開くと胸がひらきます', 'both');
    yield 0.6;
    const a = this.orb('L', 'wide'), b = this.orb('R', 'wide');
    yield () => a.dead && b.dead;
    this.nice('タッチは完璧！', '');
    yield 1.6;
  }

  *rhythm() {
    const g = this.game;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.card('RHYTHM', attempt ? 'もう一度！ リングに重なる瞬間にタッチ' : '本番では星は止まりません', '星がリングに重なった瞬間にタッチ。4つ来ます', 'target');
      yield 2.2;
      const before = g.stats.hit;
      const { gen, seg } = this.make(g.approach);
      ['L', 'R', 'L', 'R'].forEach((h, i) => gen.orb(i * 1.6, h, i % 2 ? 'front' : 'y'));
      const orbs = this.spawn(gen.events, seg, false);
      yield () => orbs.every((o) => o.dead);
      if (g.stats.hit - before >= 3) { this.nice('リズムもばっちり！', 'リングに重なる瞬間ほど高得点（PERFECT）'); yield 1.8; return; }
    }
    this.nice('大丈夫、本番で慣れていきましょう', 'ミスが続くと自動でゆっくりになります');
    yield 2;
  }

  *trace() {
    this.card('TRACE THE COMET', '彗星に右手を重ねて、一緒に大きな円をえがく', '手が離れると彗星は止まって待ちます。コーチと同じ動きで', 'orbit');
    yield 1.2;
    let { gen, seg } = this.make(1.6);
    gen.circle(0, 7, 'R', 1, 1, 'none');
    const [c] = this.spawn(gen.events, seg);
    yield () => c.dead;
    this.card('RAINBOW', '両腕を横から頭の上へ、そして下ろす', 'ゆっくりでOK。肩甲骨から動かすイメージ', 'yraise');
    yield 0.8;
    ({ gen, seg } = this.make(1.6));
    gen.rainbow(0, 7, 'L', 1); gen.rainbow(0, 7, 'R', 1);
    const both = this.spawn(gen.events, seg);
    yield () => both.every((x) => x.dead);
    this.nice('肩がほぐれてきました', '');
    yield 1.6;
  }

  *pose() {
    this.card('HOLD THE POSE', '両手をリングに合わせて、そのままキープ', '両腕を横に大きく広げて胸をひらく「WING」', 'wing');
    yield 1.2;
    let { gen, seg } = this.make(this.game.approach);
    gen.gate(0, 3, 'wing');
    const [w] = this.spawn(gen.events, seg);
    w.dur = 2;
    yield () => w.dead;
    this.card('Y-RAISE', '両手を斜め上へ、Yの字でキープ', '肩はすくめずに下げたまま', 'yraise');
    yield 0.8;
    ({ gen, seg } = this.make(this.game.approach));
    gen.gate(0, 3, 'sky');
    const [y] = this.spawn(gen.events, seg);
    y.dur = 2;
    yield () => y.dead;
    this.nice('いい姿勢です', '');
    yield 1.6;
  }

  *step() {
    const g = this.game;
    this.card('SIDE STEP', '光のカーテンが来たら、矢印の方へ横に1歩', '足元の光るマークへ移動。カーテンはあなたが動くまで待ちます', 'steps');
    yield 1.2;
    let { gen, seg, ctx } = this.make(g.approach);
    gen.wall(0);
    this.lane = ctx.lane;
    const [w1] = this.spawn(gen.events, seg);
    yield () => w1.dead;
    this.card('SIDE STEP', 'こんどは真ん中に戻ろう', 'また矢印の方へ1歩', 'steps');
    yield 0.6;
    ({ gen, seg, ctx } = this.make(g.approach));
    ctx.lane = this.lane;
    gen.events.push({ type: 'wall', t: gen.T(0), from: this.lane, free: 0, laneW: g.laneW });
    this.lane = 0;
    const [w2] = this.spawn(gen.events, seg);
    yield () => w2.dead;
    this.nice('ステップOK！', '前後には動かず、横だけで大丈夫です');
    yield 1.6;
  }

  *duck() {
    this.card('DUCK', '光のバーは、軽くひざを曲げてくぐる', '背すじはまっすぐ。お尻を少し後ろへ引くと腰にやさしい', 'squat');
    yield 1.2;
    const { gen, seg } = this.make(this.game.approach);
    gen.bar(0);
    const [b] = this.spawn(gen.events, seg);
    yield () => b.dead;
    this.nice('ナイススクワット！', '');
    yield 1.6;
  }

  *finish() {
    const g = this.game;
    g.store.setTutorialDone();
    g.showTutorialCard({ step: this.total, total: this.total, en: 'ALL SET!', text: '準備完了！ さっそく遊んでみよう', sub: 'まずは QUICK（約6分）がおすすめ。迷ったらコーチのまねをすればOK', done: true });
    g.audio.fanfare();
    g.showTutorialDone();
    yield () => false;
  }
}
