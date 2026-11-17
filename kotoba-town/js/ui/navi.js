// Navi: ネクマックス (NEXT MAKE's robot), the town's guide. In the town square it stands next to the board;
// in a scene it floats, small, beside the learner. It says short tips in its own bubble (kana + English)
// and reacts to how the answers go (a hop and a smile, or a worried face and a kind word). It never talks
// over a character: the game tells it when it may speak.
import * as THREE from 'three';
import { createNexmax, setOutlineViewport } from '../vendor/nexmax.js';
import { Panel, THEME, rr, font, nameTag, text, fitWrap } from './panel.js';

const SKY = '#66b2f0';
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** What ネクマックス says. Simple kana with spaces (beginners), English below. */
export const NAVI_LINES = {
  welcome: [
    { ja: 'ようこそ、ことばタウンへ！ ぼくは ネクマックス。', en: "Welcome to Kotoba Town! I'm Nexmax, your guide." },
    { ja: 'コースを えらんで、まちの ひとと にほんごで はなそう！', en: 'Pick a course and talk with the people in town — in Japanese!' },
  ],
  town: [
    { ja: 'きょうは どこで はなす？', en: 'Where shall we talk today?' },
    { ja: 'まずは「れんしゅう」。なれたら「ほんばん」に ちょうせん！', en: 'Start with practice. When it feels easy, try the real mode!' },
    { ja: '「フリートーク」は だいほんが ないよ。じゆうに はなそう！', en: 'Free talk has no script — just chat!' },
    { ja: 'ITビジネスへんでは、めんせつも れんしゅう できるよ。', en: 'In the IT course you can even practise job interviews.' },
    { ja: '1かから 20かまで あるよ。じゅんばんに やってみよう！', en: 'There are lessons 1 to 20 — go through them in order!' },
  ],
  free: [
    { ja: 'だれと はなす？ まよったら「おまかせ」！', en: 'Who will you talk to? If you can’t choose, try “Surprise me”!' },
    { ja: 'レベルは あとから かえられるよ。', en: 'You can change the level any time.' },
  ],
  brief: [
    { ja: '「れんしゅう」は こたえの れいが でるよ。', en: 'Practice shows example answers.' },
    { ja: '「ほんばん」は ヒント なし！ ほんとうの まちと おなじだよ。', en: 'Real mode has no hints — just like the real town!' },
    { ja: 'ミッションを みてから はじめよう。', en: 'Read the missions, then start.' },
  ],
  firstTurn: [{ ja: 'マイクは オン！ にほんごで こたえてね。', en: 'The mic is on — answer in Japanese!' }],
  freeStart: [{ ja: 'じゆうに はなそう！ わだいは「わだいを かえる」で かえられるよ。', en: 'Talk freely! “Topic” changes the subject.' }],
  good: [
    { ja: 'いいね！', en: 'Nice!' }, { ja: 'すごい！', en: 'Great!' }, { ja: 'じょうず！', en: 'Well said!' }, { ja: 'その ちょうし！', en: 'Keep it up!' },
  ],
  low: [
    { ja: 'だいじょうぶ！ カードの「✓」を まねして みて。', en: 'It’s OK! Try saying the ✓ sentence on the card.' },
    { ja: 'ゆっくりで いいよ。', en: 'Take your time.' },
    { ja: 'みじかくて いいよ。ひとことでも OK！', en: 'Short is fine — even one word!' },
  ],
  hint: [
    { ja: 'こまったら「ヒント」を おしてね。', en: 'Stuck? Press “Hint”.' },
    { ja: 'もういちど ききたい ときは「もういちど」！', en: 'Want to hear it again? Press “もういちど”.' },
  ],
  freeHint: [{ ja: '「ヒント」で はなせる ことが みられるよ。', en: '“Ideas” shows things you can say.' }],
  report: {
    3: [{ ja: 'やったね！ ほし みっつ！', en: 'You did it — three stars!' }],
    2: [{ ja: 'いい かんじ！ つぎは「ほんばん」にも ちょうせん！', en: 'Nice! Next, try the real mode too!' }],
    1: [{ ja: 'だいじょうぶ。もう いちど やって みよう！', en: 'No worries — let’s try once more!' }],
  },
  freeReport: [{ ja: 'たくさん はなせたね！ ✓の ことばを つぎに つかって みよう。', en: 'You talked a lot! Use the ✓ phrases next time.' }],
};

export class Navi {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.nx = createNexmax(1.0, { variant: 'protagonist' });
    this.nx.autoExpression = false;
    this.nx.setExpression('happy');
    this.root = new THREE.Group();
    this.root.name = 'navi';
    this.root.add(this.nx.root);
    this.root.visible = false;
    app.scene.add(this.root);
    this.bubble = new Panel(app, 960, 330, 0.66, { name: 'navi-bubble', interactive: false });
    this.bubble.visible = false;
    app.scene.add(this.bubble.mesh);
    this.mode = 'hidden';
    this.anchor = new THREE.Vector3();
    this.yaw = null;
    this.t = 0;
    this.poseUntil = 0;
    this.sayUntil = 0;
    this.quietUntil = 0;
    this.last = '';
    this.size = new THREE.Vector2();
    this.head = new THREE.Vector3();
    app.onUpdate((dt) => this.update(dt));
  }

  get enabled() { return this.settings.navi !== false; }

  /** Stand on the ground at a spot (the town square, next to the board). */
  stand(pos, height = 0.95) {
    this.mode = 'stand';
    this.anchor.copy(pos);
    this.scale = height;
    this.placed = false;
    this.root.visible = this.enabled;
  }

  /** Float beside the learner (scenes). side: how far to the left (m). */
  follow({ side = 0.62, ahead = 0.82, below = 0.42, height = 0.4 } = {}) {
    this.mode = 'follow';
    this.offset = { side, ahead, below };
    this.scale = height;
    this.yaw = null;
    this.placed = false;
    this.root.visible = this.enabled;
  }

  hide() { this.mode = 'hidden'; this.root.visible = false; this.bubble.visible = false; }

  /** Say a line (or one of a list). ms: how long the bubble stays. Skipped while told to be quiet. */
  say(lines, { ms = 4500, pose = null, expr = 'happy', force = false } = {}) {
    if (!this.enabled || this.mode === 'hidden') return;
    if (!force && performance.now() < this.quietUntil) return;
    const list = Array.isArray(lines) ? lines.filter((l) => l.ja !== this.last) : [lines];
    const line = pick(list.length ? list : Array.isArray(lines) ? lines : [lines]);
    if (!line) return;
    this.last = line.ja;
    this.nx.setExpression(expr);
    if (pose) this.act(pose, 1400);
    this.drawBubble(line);
    this.bubble.visible = true;
    this.sayUntil = performance.now() + ms;
  }

  /** A short move: wave, jump, hold … then back to idle. */
  act(pose, ms = 1200, expr) {
    if (expr) this.nx.setExpression(expr);
    this.nx.setPose(pose);
    this.poseUntil = performance.now() + ms;
  }

  /** Keep quiet for a while (a character is talking, or the learner should think). */
  quiet(ms = 4000) {
    this.quietUntil = performance.now() + ms;
    this.bubble.visible = false;
    this.sayUntil = 0;
  }

  // ------------------------------------------------------------ game events
  /** From the runners: { type: 'listen' | 'judged' | 'hint' | 'npc' | 'free', … } */
  event(ev) {
    if (!this.enabled || this.mode === 'hidden') return;
    switch (ev.type) {
      case 'npc': this.quiet(1500); this.nx.setExpression('happy'); break;
      case 'listen':
        if (ev.k === 1) this.say(ev.free ? NAVI_LINES.freeStart : NAVI_LINES.firstTurn, { ms: 5000, pose: 'wave', force: true });
        break;
      case 'judged': {
        if (ev.exam) break; // ほんばん: no feedback in between, not even from the guide
        const s = ev.score ?? 1;
        if (s >= 2) {
          this.act('jump', 900, 'happy');
          if (s === 3 || Math.random() < 0.35) this.say(NAVI_LINES.good, { ms: 1800, force: true });
        } else {
          this.nx.setExpression('worried');
          this.poseUntil = performance.now() + 2500;
          if (!ev.exam && Math.random() < 0.6) this.say(NAVI_LINES.low, { ms: 3500, expr: 'worried', force: true });
        }
        break;
      }
      case 'hint': this.say(ev.free ? NAVI_LINES.freeHint : NAVI_LINES.hint, { ms: 4500, pose: 'wave', force: true }); break;
      case 'report': this.say(ev.free ? NAVI_LINES.freeReport : NAVI_LINES.report[ev.stars] || NAVI_LINES.report[2], { ms: 7000, pose: ev.stars >= 3 || ev.free ? 'jump' : 'wave', force: true }); break;
      default: break;
    }
  }

  // ----------------------------------------------------------------- drawing
  drawBubble(line) {
    const english = this.settings.english !== false;
    this.bubble.draw((g, W, H) => {
      const top = 40; const bh = H - top - 46;
      g.fillStyle = THEME.shadow; rr(g, 14, top + 8, W - 28, bh, 54); g.fill();
      g.fillStyle = '#f2f9ff'; rr(g, 10, top, W - 28, bh, 54); g.fill();
      g.strokeStyle = SKY; g.lineWidth = 6; rr(g, 13, top + 3, W - 34, bh - 6, 51); g.stroke();
      g.fillStyle = '#f2f9ff';
      g.beginPath(); g.moveTo(W / 2 - 30, top + bh - 4); g.lineTo(W / 2, H - 6); g.lineTo(W / 2 + 26, top + bh - 4); g.closePath(); g.fill();
      nameTag(g, 44, 4, 'ネクマックス', SKY, '#ffffff', 30);
      const room = bh - 40 - (english ? 2 * 24 * 1.4 : 0);
      const f = fitWrap(g, line.ja, W - 110, room, [44, 39, 34, 30], { weight: 800, lh: 1.3 });
      let y = text(g, line.ja, 52, top + 30, W - 110, f.px, { color: THEME.ink, weight: 800, lh: 1.3 });
      if (english && line.en) text(g, line.en, 52, y + 4, W - 110, 24, { color: '#5b7a96', weight: 600, maxLines: 2, lh: 1.4 });
    });
  }

  update(dt) {
    if (this.mode === 'hidden' || !this.enabled) { this.root.visible = false; this.bubble.visible = false; return; }
    this.root.visible = true;
    this.t += dt;
    const now = performance.now();
    if (this.poseUntil && now > this.poseUntil) { this.poseUntil = 0; this.nx.setPose('idle'); this.nx.setExpression('happy'); }
    if (this.sayUntil && now > this.sayUntil) { this.sayUntil = 0; this.bubble.visible = false; }
    const head = this.app.headPosition(this.head);
    if (this.mode === 'stand') {
      // hovers beside the town board
      this.root.position.copy(this.anchor);
      this.root.position.y += Math.sin(this.t * 1.8) * 0.02;
      this.placed = true;
    } else {
      // lazy follow on yaw, like the cards: stays put while the learner looks around a little
      const dir = new THREE.Vector3(); this.app.camera.getWorldDirection(dir);
      const yawNow = Math.atan2(dir.x, dir.z);
      if (this.yaw === null) this.yaw = yawNow;
      let d = yawNow - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 0.75) this.yaw += d * Math.min(1, dt * 2.2);
      const { side, ahead, below } = this.offset;
      const fx = Math.sin(this.yaw); const fz = Math.cos(this.yaw);
      // forward f = (fx, fz); the learner's left is (fz, -fx)
      const target = new THREE.Vector3(head.x + fx * ahead + fz * side, head.y - below + Math.sin(this.t * 2.1) * 0.012, head.z + fz * ahead - fx * side);
      if (!this.placed) { this.root.position.copy(target); this.placed = true; } else this.root.position.lerp(target, Math.min(1, dt * 4));
    }
    this.root.scale.setScalar(this.scale);
    // face the learner (the model looks along -Z)
    const dx = head.x - this.root.position.x; const dz = head.z - this.root.position.z;
    this.root.rotation.y = Math.atan2(-dx, -dz);
    this.app.renderer.getDrawingBufferSize(this.size);
    setOutlineViewport(this.size.y);
    this.nx.update(dt, 0);
    if (this.bubble.visible) {
      const p = this.root.position.clone(); p.y += this.scale * 1.12 + this.bubble.hM * 0.5;
      if (this.mode === 'stand') p.x += 0.25; // keep clear of the board's edge
      else if (this.yaw !== null) { p.x -= Math.cos(this.yaw) * 0.17; p.z += Math.sin(this.yaw) * 0.17; } // toward the middle of the view
      this.bubble.placeFacing(p, head);
      this.bubble.mesh.scale.setScalar(this.mode === 'stand' ? 1 : 0.62);
    }
  }
}
