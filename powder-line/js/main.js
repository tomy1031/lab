// js/main.js — POWDER LINE: the renderer, the WebXR session, the frame loop and the flow of a run
// (menu → stand and calibrate → 3-2-1 → ride → finish → results), in VR (Meta Quest) and on a PC or phone.
//
// In VR the game never moves your head. It moves the ground: a "dolly" carries your play space so that the
// spot where you stood at calibration (your feet) is always on the rider's position on the snow, and your
// head moves inside it exactly as you move. Lean, crouch, extend, turn — the headset sees it and the rider
// does it; the screen shows what that does on the snow.
import * as THREE from 'three';
import { SPECS, getCourse } from './courses.js';
import { Run } from './physics.js';
import { Body, StickRider } from './body.js';
import { Bot } from './bot.js';
import { World } from './world.js';
import { Avatar, Board } from './rider.js';
import { Sound } from './audio.js';
import { Keys, XRInput } from './input.js';
import { VRHud, fmtTime } from './hud.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const STORE = 'powderline.v1';

export const LESSONS = {
  lean: { title: '体を かたむけて 曲がる', vr: '体ごと 右へ 傾くと 右へ、左へ 傾くと 左へ。傾けるほど 鋭く 曲がる。足もとの 輪の 点が あなたの 頭', pc: '← → で 体を 傾けて 曲がる。Shift を 足すと 深く 傾く' },
  tuck: { title: 'しゃがむと 速い', vr: 'ひざを 曲げて 低く かまえると 空気の 抵抗が へって 速くなる。輪を くぐると さらに 加速', pc: '↑（W）で しゃがんで 加速。輪を くぐると さらに 加速' },
  ollie: { title: 'オーリー（ジャンプ）', vr: 'しゃがんで → すばやく 伸び上がると 跳ぶ（足は 床から はなさなくて よい）。トリガーでも 跳べる', pc: 'スペースを 押して ためて、はなすと 跳ぶ。丸太を 越えよう' },
  kicker: { title: 'キッカーと グラブ', vr: '台の 先の オレンジの 線で 伸び上がると 高く 跳ぶ。空中で 手を 足もとへ 下ろし グリップを にぎると グラブ', pc: '台の 先（オレンジの 線）で スペースを はなすと 高く 跳ぶ。空中で Z / X で グラブ' },
  spin: { title: 'スピン', vr: '空中で 体ごと 回ると、板も 同じだけ 回る。着地までに 板を まっすぐ（か 真うしろ）に もどそう', pc: '空中で ← → で 回る。着地までに 板を まっすぐ（か 真うしろ）に' },
  brake: { title: 'ブレーキと 着地', vr: '体を 山側（後ろ）へ 引くと 減速。着地の 瞬間に ひざを 曲げると ソフトランディング', pc: '↓（S）で 減速。着地の 瞬間に スペースか ↑ で ソフトランディング' },
};

const DEFAULTS = { stance: 'regular', view: 'fixed', vignette: 1, jump: 'both', control: 'body', sens: 1, music: true, sound: true, ghost: true, feetRing: true };
const OPTIONS = {
  stance: [['regular', 'レギュラー（左足前）'], ['goofy', 'グーフィー（右足前）'], ['forward', '正面向き']],
  view: [['fixed', '斜面に 固定'], ['follow', '進行方向に 回る']],
  vignette: [[0, 'なし'], [1, '弱'], [2, '強']],
  jump: [['both', '体＋トリガー'], ['body', '体だけ'], ['button', 'トリガーだけ']],
  control: [['body', '体で 滑る'], ['stick', 'スティック（座って）']],
  sens: [[1, 'ふつう'], [1.35, '大きめ'], [0.75, '小さめ']],
};
const LABEL = { stance: 'スタンス', view: '視点の 向き', vignette: '視野しぼり', jump: 'ジャンプ', control: '操作', sens: '曲がりやすさ' };

function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function save(d) { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch { /* private mode */ } }

class App {
  constructor() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(0.5);
    $('stage').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 3000);
    this.dolly = new THREE.Group(); // your play space, carried down the mountain
    this.dolly.add(this.camera);
    this.scene.add(this.dolly);
    this.store = load();
    this.settings = { ...DEFAULTS, ...(this.store.settings || {}) };
    this.world = new World(this);
    this.sound = new Sound();
    this.sound.muted = !this.settings.sound;
    this.sound.musicOn = this.settings.music;
    this.keys = new Keys();
    this.xr = new XRInput(this);
    this.hud = new VRHud(this);
    this.hud.attachWrist(this.xr.hands[0].grip);
    this.body = new Body();
    this.stick = new StickRider();
    this.board = new Board(); // VR: the board under your feet
    this.scene.add(this.board.group);
    this.avatar = new Avatar(); // PC: you, seen from behind
    this.scene.add(this.avatar.group);
    this.ghost = new Avatar({ ghost: true });
    this.scene.add(this.ghost.group);
    this.xrActive = false;
    this.autopilot = params.has('auto');
    this.state = 'title';
    this.t = 0;
    this.clock = new THREE.Clock();
    this.rigYaw = 0;
    this.headingS = 0;
    this.chase = { yaw: 0, pos: new THREE.Vector3(), init: false };
    this.hapT = 0;
    this.fade = 0;
    this.it = {};
    this.courseId = params.get('course') || this.store.last || 'practice';
    if (!SPECS.find((s) => s.id === this.courseId)) this.courseId = 'practice';
    this.loadCourse(this.courseId);
    addEventListener('resize', () => this.resize());
    r.setAnimationLoop((time, frame) => this.frame(frame));
    this.dom();
  }

  // ---- courses and runs ----
  loadCourse(id) {
    this.courseId = id;
    this.course = getCourse(id);
    this.world.load(this.course, { signMode: this.xrActive ? 'vr' : 'pc', lessons: LESSONS });
    this.newRun(this.state === 'title');
    this.store.last = id; save(this.store);
  }

  newRun(demo = false) {
    this.demo = demo;
    this.run = new Run(this.course, { stance: this.settings.stance === 'goofy' ? 'goofy' : 'regular' });
    this.bot = new Bot(this.course, { seed: 1 + Math.floor(Math.random() * 1000) });
    this.world.resetCrystals();
    this.chase.init = false;
    this.ghostTrack = !demo && this.settings.ghost ? this.best()?.ghost || null : null;
    this.ghost.group.visible = false;
    if (demo) { this.run.countdown(0.01); }
  }

  // tests and screenshots: put the rider at s (metres down the course), moving
  jumpTo(s, speed = 14, x = null) {
    const r = this.run.rider;
    r.reset(s, x ?? this.course.cx(s), speed);
    this.chase.init = false; this.chase.placed = false;
    if (this.run.state === 'ready' || this.run.state === 'count') { this.run.state = 'ride'; if (this.state === 'count') this.state = 'ride'; }
  }

  best(id = this.courseId) { return (this.store.best || {})[id] || null; }

  startRun() {
    this.sound.init();
    this.newRun(false);
    this.sound.startMusic(this.course.theme.music);
    if (this.xrActive) {
      this.hud.hidePanel();
      if (this.settings.control === 'stick') { this.state = 'count'; this.run.countdown(3); this.provisional(); }
      else this.beginCalib('count');
    } else {
      this.state = 'count';
      this.run.countdown(3);
      this.showDOM('hud');
    }
  }

  // ---- VR: stand, look downhill, hold still → calibrate ----
  beginCalib(next) {
    this.state = 'calib';
    this.calibNext = next;
    this.calibT = 0;
    this.calibRef = null;
    this.hud.hidePanel();
    this.hud.bigText('まっすぐ 立って', '斜面の 下（滑る 方）を 見て、少し じっと して ください');
  }

  // a provisional frame from where you stand now (before calibrating), so the slope is in front of you
  provisional() {
    const h = this.headPose;
    if (!h) return;
    this.body.calibrate({ x: h.x, y: Math.max(1.2, h.y), z: h.z, yaw: h.yaw });
  }

  // ---- the frame loop ----
  frame(xrFrame) {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;
    if (this.xrActive && xrFrame) this.readXR(xrFrame);
    if (this.xrActive) this.updateVR(dt);
    else this.updatePC(dt);
    const p = this.run.rider.pos;
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    this.world.update(dt, this.t, cam, this.run.rider.s);
    this.world.updateShadow(this.run.rider);
    this.sound.tick();
    this.updateGhost();
    this.keys.endFrame();
    this.renderer.render(this.scene, this.camera);
    void p;
  }

  readXR(xrFrame) {
    const ref = this.renderer.xr.getReferenceSpace();
    const pose = ref && xrFrame.getViewerPose(ref);
    if (pose) {
      const { position: p, orientation: o } = pose.transform;
      const q = new THREE.Quaternion(o.x, o.y, o.z, o.w);
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      this.headPose = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-f.x, -f.z), q };
    }
    this.xr.read();
  }

  hands() {
    return this.xr.hands.map((h) => ({ side: h.side, x: h.grip.position.x, y: h.grip.position.y, z: h.grip.position.z, grip: h.isHand ? 0 : h.btn.grip, trigger: h.btn.trigger, tracked: h.connected && h.grip.visible !== false }));
  }

  updateVR(dt) {
    const head = this.headPose;
    if (!head) return;
    if (!this.body.cal) this.provisional();
    const st = this.state;
    // the menu board and the laser
    if (this.hud.panel.mesh.visible) {
      if (this.needPanel) { this.hud.placePanel(head, head.yaw, 1.2); this.needPanel = false; }
      const hits = this.xr.point([this.hud.panel.mesh], true);
      let hover = null;
      for (const { hand, hit } of hits) {
        const b = this.hud.panel.hitButton(hit.uv);
        if (b) { hover = b.id; if (hand.pressedNow('trigger')) { this.sound.click(); hand.pulse(0.3, 30); this.onButton(b.id); return; } }
      }
      this.hud.panel.setHover(hover);
    } else this.xr.point([], false);
    const anyPressed = (k) => this.xr.hands.some((h) => h.pressedNow(k));
    if (st === 'calib') {
      // wait until the head is still for a moment, then take the frame
      if (!this.calibRef) this.calibRef = { ...head };
      const moved = Math.hypot(head.x - this.calibRef.x, head.y - this.calibRef.y, head.z - this.calibRef.z) + Math.abs(head.yaw - this.calibRef.yaw) * 0.3;
      if (moved > 0.06) { this.calibRef = { ...head }; this.calibT = 0; }
      this.calibT += dt;
      if (this.calibT > 1.2) {
        this.body.calibrate(head);
        this.headingS = this.run.rider.heading;
        this.hud.bigText('');
        if (this.calibNext === 'count') { this.state = 'count'; this.run.countdown(3); }
        else this.state = this.calibNext;
      }
    }
    let it = { lean: 0, crouch: 0, brake: 0, pop: 0, spin: 0, grab: null, absorb: 0 };
    const r = this.run.rider;
    if (st === 'count' || st === 'ride' || st === 'finish') {
      if (this.settings.control === 'stick') {
        const L = this.xr.L, R = this.xr.R;
        it = this.stick.update(dt, { lx: L.axes[0], ly: L.axes[1], rx: R.axes[0], jump: Math.max(R.btn.trigger, R.btn.a, L.btn.a), grabL: L.btn.grip > 0.6, grabR: R.btn.grip > 0.6 }, r.air);
      } else {
        it = { ...this.body.update(dt, head, this.hands(), r.air, { stance: this.settings.stance, jump: this.settings.jump }) };
        if (this.settings.jump !== 'body' && !r.air && this.xr.hands.some((h) => h.pressedNow('trigger'))) it.pop = Math.max(it.pop, 0.75);
        it.lean *= this.settings.sens;
      }
      if (this.autopilot) it = this.bot.update(dt, this.run);
      if (st === 'count') { it.pop = 0; }
      this.it = it;
      const ev = this.run.update(dt, it, this.bodyPoints(head));
      this.handle(ev);
      if (st === 'ride' && anyPressed('b')) this.pause();
    } else if ((st === 'vrmenu' || st === 'results') && anyPressed('a') && st === 'vrmenu') this.startRun();
    else if (st === 'pause' && anyPressed('b')) this.resume();
    this.placeRig(dt);
    this.board.place(r);
    this.board.group.visible = r.crash <= 0;
    this.avatar.group.visible = false;
    const cal = this.body.cal;
    this.hud.yawRate = this.yawRate || 0;
    this.hud.update(dt, cal ? { x: cal.x, z: cal.z, yaw: cal.yaw } : { x: 0, z: 0, yaw: 0 }, this.body, r, this.run, this.settings);
    this.ride(dt, it);
  }

  // where you are in the world: feet on the rider, the calibrated downhill straight ahead
  placeRig(dt) {
    const r = this.run.rider, cal = this.body.cal;
    if (!cal) return;
    let yaw = -cal.yaw;
    if (this.settings.view === 'follow') {
      if (!r.air && r.speed > 1) {
        let d = r.heading - this.headingS;
        d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
        this.headingS += d * Math.min(1, dt / 0.2);
      }
      yaw += this.headingS;
    }
    this.yawRate = Math.abs(yaw - this.rigYaw) / Math.max(dt, 1e-3);
    this.rigYaw = yaw;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // R(yaw)·(cal.x, 0, cal.z)
    const ox = c * cal.x + s * cal.z, oz = -s * cal.x + c * cal.z;
    this.dolly.rotation.set(0, yaw, 0);
    this.dolly.position.set(r.pos.x - ox, r.pos.y, r.pos.z - oz);
    this.dolly.updateMatrixWorld(true);
  }

  // your body and hands in the world, for collecting crystals
  bodyPoints(head) {
    const r = this.run.rider;
    const hw = this.dolly.localToWorld(new THREE.Vector3(head.x, head.y, head.z));
    const body = { x: (hw.x + r.pos.x) / 2, y: (hw.y + r.pos.y) / 2 + 0.15, z: (hw.z + r.pos.z) / 2 };
    const hands = this.xr.hands.filter((h) => h.connected).map((h) => { const p = h.world(); return { x: p.x, y: p.y, z: p.z, side: h.side }; });
    return { body, hands };
  }

  updatePC(dt) {
    const r = this.run.rider;
    let it;
    if (this.demo || this.autopilot) it = this.bot.update(dt, this.run);
    else it = this.state === 'ride' || this.state === 'count' || this.state === 'finish' ? this.keys.intent(dt, r.air) : { lean: 0, crouch: 0 };
    if (this.state === 'count') it.pop = 0;
    this.it = it;
    if (this.state !== 'pause' && this.state !== 'results') {
      const ev = this.run.update(dt, it);
      this.handle(ev);
    }
    if (this.demo && this.run.state === 'done') this.newRun(true);
    if (!this.demo) {
      if (this.keys.took('Escape')) { if (this.state === 'ride' || this.state === 'count') this.pause(); else if (this.state === 'pause') this.resume(); }
      if (this.keys.took('KeyR') && (this.state === 'ride' || this.state === 'results' || this.state === 'pause')) this.startRun();
      if (this.keys.took('Enter') && this.state === 'results') this.startRun();
    }
    this.avatar.group.visible = true;
    this.avatar.pose(r, it, dt);
    this.avatar.group.visible = r.crash <= 0 || Math.floor(this.t * 10) % 2 === 0;
    this.board.group.visible = false;
    this.chaseCam(dt);
    this.ride(dt, it);
    this.pcHud(dt);
  }

  chaseCam(dt) {
    const r = this.run.rider, p = r.pos, cam = this.camera;
    if (!this.chase.init) { this.chase.yaw = r.heading; this.chase.init = true; }
    if (!r.air && r.speed > 1) {
      let d = r.heading - this.chase.yaw;
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      this.chase.yaw += d * Math.min(1, dt * 3);
    }
    const back = 5.4, up = 2.3, y = this.chase.yaw;
    const want = new THREE.Vector3(p.x + Math.sin(y) * back, p.y + up, p.z + Math.cos(y) * back);
    const g = this.course.height(want.x, want.z) + 1.3;
    if (want.y < g) want.y = g;
    if (!this.chase.placed) { this.chase.pos.copy(want); this.chase.placed = true; }
    this.chase.pos.lerp(want, Math.min(1, dt * 7));
    this.chase.pos.y += (want.y - this.chase.pos.y) * Math.min(1, dt * 4);
    cam.position.copy(this.chase.pos);
    cam.lookAt(p.x - Math.sin(y) * 7, p.y + 0.6, p.z - Math.cos(y) * 7);
    const fov = 68 + Math.min(14, r.speed * 0.5);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
  }

  // feedback while riding: sound, vibration, spray off the edge
  ride(dt, it) {
    const r = this.run.rider;
    const active = this.state === 'ride' || this.state === 'finish' || (this.demo && this.run.state === 'ride');
    this.sound.ride(r.speed, r.edge, r.air, it.brake || 0, active && r.crash <= 0);
    if (active && !r.air && r.crash <= 0 && r.speed > 3) {
      const n = (Math.abs(r.edge) * 1.6 + (it.brake || 0) * 3 + 0.15) * r.speed * dt * 5;
      const fx = -Math.sin(r.heading), fz = -Math.cos(r.heading);
      const side = r.edge > 0 ? -1 : 1; // spray flies out of the turn
      for (let i = 0; i < n; i++) {
        const k = Math.random();
        this.world.emit(r.pos.x - fx * (0.3 + k * 0.5) + -fz * side * 0.15, r.pos.y + 0.05, r.pos.z - fz * (0.3 + k * 0.5) + fx * side * 0.15,
          -fz * side * (1.5 + Math.random() * 2) - fx * 1.5, 1 + Math.random() * 1.8, fx * side * (1.5 + Math.random() * 2) - fz * 1.5, 0.5 + Math.random() * 0.4);
      }
    }
    // vibration in VR: the edge biting into the snow, more as you carve harder and faster
    if (this.xrActive && active) {
      this.hapT -= dt;
      if (this.hapT <= 0 && !r.air && r.crash <= 0) {
        this.hapT = 0.07;
        const k = Math.min(0.6, (0.04 + Math.abs(r.edge) * 0.45 + (it.brake || 0) * 0.3) * Math.min(1, r.speed / 14));
        if (k > 0.03) this.xr.pulse(null, k, 80);
      }
    }
    // the white fade during a fall
    const want = r.crash > 0 ? 1 : 0;
    this.fade += (want - this.fade) * Math.min(1, dt * (want ? 9 : 3));
    this.hud.fade.visible = this.xrActive && this.fade > 0.01;
    this.hud.fade.material.opacity = this.fade * 0.92;
    const f = $('fade');
    if (f) f.style.opacity = this.xrActive ? 0 : (this.fade * 0.85).toFixed(3);
  }

  // what happened this frame
  handle(ev) {
    for (const e of ev) {
      switch (e.type) {
        case 'count': this.sound.count(e.n); this.say(String(e.n)); break;
        case 'go': this.sound.count(0); this.say('GO!'); if (this.state === 'count') this.state = 'ride'; if (!this.demo) this.sound.startMusic(this.course.theme.music); setTimeout(() => this.say(''), 700); break;
        case 'pop': if (!this.demo) { this.sound.pop(); this.haptic(null, 0.45, 40); } break;
        case 'land':
          if (e.quality !== 'hop' && !this.demo) { this.sound.land(e.impact, e.quality); this.haptic(null, Math.min(1, 0.35 + e.impact / 10), 90); }
          if (e.quality !== 'hop') this.landingSpray(e.impact);
          break;
        case 'trick': if (!this.demo && (e.pts > 0 || e.quality === 'bail')) { this.popText(e.name || 'エア', e.pts ? `+${e.pts}` : '', e.quality === 'sketchy' ? '#ffb36b' : e.quality === 'bail' ? '#ff6a6a' : '#ffd23f'); if (e.pts) this.sound.trick(e.pts); } break;
        case 'soft': if (!this.demo) { this.popText('ソフトランディング', `+${e.pts}`, '#5fd8c8'); this.sound.soft(); } break;
        case 'crystal':
          this.world.collect(e.i);
          if (!this.demo) {
            this.sound.crystal(e.kind);
            if (e.hand) this.haptic(e.hand, 0.7, 45);
            if (e.kind === 'gold' || e.hand) this.popText(e.hand ? 'タッチ！' : 'ゴールド', `+${e.pts}`, e.kind === 'gold' ? '#ffd23f' : '#9fe6ff');
          }
          break;
        case 'ring': this.world.passRing(e.i); if (!this.demo) { this.sound.ring(); this.haptic(null, 0.5, 80); this.popText('ブースト', `+${e.pts}`, '#ff8fc8'); } break;
        case 'crash': if (!this.demo) { this.sound.crash(); this.haptic(null, 1, 250); this.popText('転倒', '', '#ff6a6a'); } break;
        case 'graze': if (!this.demo) { this.sound.graze(); this.haptic(null, 0.6, 60); } break;
        case 'finish':
          if (!this.demo) { this.sound.finish(); this.say('FINISH', `${fmtTime(e.time)}　タイムボーナス +${e.bonus}`); this.state = 'finish'; }
          break;
        case 'done': if (!this.demo) this.results(); break;
      }
    }
  }

  landingSpray(impact) {
    const r = this.run.rider;
    for (let i = 0; i < 10 + impact * 4; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * (1 + impact * 0.3);
      this.world.emit(r.pos.x, r.pos.y + 0.1, r.pos.z, Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s, 0.6);
    }
  }

  haptic(side, k, ms) { if (this.xrActive) this.xr.pulse(side === 'hand' ? null : side, k, ms); }

  say(text, sub = '') {
    if (this.xrActive) this.hud.bigText(text, sub);
    const b = $('big');
    if (b) { b.innerHTML = text ? `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}` : ''; b.classList.toggle('show', !!text); }
  }

  popText(text, sub, color) {
    if (this.xrActive) { this.hud.pop(text, color, sub); return; }
    const box = $('pops');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'pop';
    el.style.color = color;
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 1600);
    while (box.children.length > 4) box.firstChild.remove();
  }

  updateGhost() {
    const g = this.ghostTrack;
    if (!g || this.demo || !(this.state === 'ride' || this.state === 'finish')) { this.ghost.group.visible = false; return; }
    const t = this.run.time;
    const n = g.length / 7;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m * 7] <= t) lo = m; else hi = m - 1; }
    if (lo >= n - 1) { this.ghost.group.visible = false; return; }
    const a = lo * 7, b = a + 7, k = Math.min(1, Math.max(0, (t - g[a]) / Math.max(1e-3, g[b] - g[a])));
    const s = [];
    for (let i = 0; i < 7; i++) s.push(g[a + i] + (g[b + i] - g[a + i]) * (i === 4 ? 0 : k));
    s[4] = g[a + 4];
    this.ghost.group.visible = true;
    this.ghost.poseGhost(s, this.course);
  }

  // ---- pause, results ----
  pause() {
    this.state = 'pause';
    this.sound.ride(0, 0, false, 0, false);
    if (this.xrActive) { this.needPanel = true; this.hud.showPanel(this.pauseSpec()); }
    else this.showDOM('pause');
  }
  resume() {
    this.state = this.run.state === 'count' ? 'count' : 'ride';
    if (this.xrActive) this.hud.hidePanel(); else this.showDOM('hud');
  }

  results() {
    const run = this.run, rank = run.rank();
    const best = this.best();
    this.store.best = this.store.best || {};
    const rec = { score: Math.max(run.score, best?.score || 0), time: Math.min(run.finishedAt || 999, best?.time || 999), rank: rankMax(rank, best?.rank), ghost: best?.ghost };
    const newBest = !best || run.score > best.score;
    const newTime = !best || run.finishedAt < best.time;
    if (newTime) rec.ghost = run.track;
    this.store.best[this.courseId] = rec;
    save(this.store);
    this.lastResult = { rank, newBest, newTime, score: run.score, time: run.finishedAt };
    this.state = 'results';
    this.sound.stopMusic();
    this.say('');
    if (this.xrActive) { this.needPanel = true; this.hud.showPanel(this.resultsSpec()); }
    else { this.fillResults(); this.showDOM('results'); }
  }

  statsRows() {
    const run = this.run, s = run.stats, p = run.parts;
    return [
      ['タイム', `${fmtTime(run.finishedAt)}（基準 ${fmtTime(this.course.par)}）`],
      ['クリスタル', `${s.crystals} / ${run.crystals.length}（金 ${s.gold}・タッチ ${s.touches}）　${p.crystals}`],
      ['リング', `${s.rings} / ${run.rings.length}　${p.rings}`],
      ['トリック', `${s.tricks} 回・ソフト着地 ${s.soft}　${p.tricks}`],
      ['タイムボーナス', `${p.time}`],
      ['最高速度・最長エア', `${Math.round(s.maxSpeed * 3.6)} km/h・${s.bestAir.toFixed(1)} 秒`],
      ['転倒', `${s.crashes} 回`],
    ];
  }

  // ---- VR panels ----
  menuSpec() {
    const c = this.course, b = this.best();
    return {
      title: 'POWDER LINE', sub: '体で 滑る VR スノーボード',
      lines: [`【${c.name}】${c.sub}`, b ? `ベスト：${b.score} 点（${b.rank}）・${fmtTime(b.time)}` : 'まだ 記録が ありません', 'レーザーで 指して トリガー。A / X で スタート。'],
      buttons: [
        ...SPECS.map((s) => ({ id: 'course:' + s.id, label: s.name, on: s.id === this.courseId })),
        { id: 'start', label: 'スタート', primary: true, wide: true },
        { id: 'settings', label: '設定' }, { id: 'exitvr', label: 'VR を 終わる' },
      ],
    };
  }
  settingsSpec() {
    const S = this.settings;
    const opt = (k) => (OPTIONS[k].find(([v]) => v === S[k]) || OPTIONS[k][0])[1];
    return {
      title: '設定', sub: 'ボタンを 押すと 切りかわります',
      buttons: [
        ...Object.keys(OPTIONS).map((k) => ({ id: 'opt:' + k, label: `${LABEL[k]}：${opt(k)}`, wide: true })),
        { id: 'tog:music', label: `音楽 ${S.music ? 'ON' : 'OFF'}`, on: S.music }, { id: 'tog:ghost', label: `ゴースト ${S.ghost ? 'ON' : 'OFF'}`, on: S.ghost },
        { id: 'tog:feetRing', label: `足もとの 輪 ${S.feetRing ? 'ON' : 'OFF'}`, on: S.feetRing }, { id: 'tog:sound', label: `効果音 ${S.sound ? 'ON' : 'OFF'}`, on: S.sound },
        { id: 'menu', label: '◀ もどる', primary: true, wide: true },
      ],
    };
  }
  pauseSpec() {
    return {
      title: 'ひと休み', sub: this.course.name,
      lines: [`${fmtTime(this.run.time)}　${this.run.score} 点`, 'B / Y で つづける'],
      buttons: [{ id: 'resume', label: 'つづける', primary: true, wide: true }, { id: 'retry', label: 'はじめから' }, { id: 'recal', label: '立ち位置を 合わせる' }, { id: 'settings', label: '設定' }, { id: 'menu', label: 'コース選択' }],
    };
  }
  resultsSpec() {
    const L = this.lastResult;
    const next = SPECS[(SPECS.findIndex((s) => s.id === this.courseId) + 1) % SPECS.length];
    return {
      title: `${this.course.name}　ランク ${L.rank}`, sub: `${L.score} 点${L.newBest ? '　ベスト更新！' : ''}${L.newTime ? '　最速タイム！（ゴースト保存）' : ''}`,
      stats: this.statsRows(),
      buttons: [{ id: 'retry', label: 'もう一度', primary: true }, { id: 'course:' + next.id + ':go', label: `つぎ：${next.name}` }, { id: 'menu', label: 'コース選択', wide: true }],
    };
  }

  onButton(id) {
    if (id.startsWith('course:')) {
      const [, cid, go] = id.split(':');
      if (cid !== this.courseId) this.loadCourse(cid);
      if (go) return this.startRun();
      if (this.xrActive) { this.state = 'vrmenu'; this.hud.showPanel(this.menuSpec()); }
      return;
    }
    if (id.startsWith('opt:')) {
      const k = id.slice(4), list = OPTIONS[k];
      const i = list.findIndex(([v]) => v === this.settings[k]);
      this.settings[k] = list[(i + 1) % list.length][0];
      this.saveSettings();
      return this.hud.showPanel(this.settingsSpec());
    }
    if (id.startsWith('tog:')) {
      const k = id.slice(4);
      this.settings[k] = !this.settings[k];
      this.saveSettings();
      return this.hud.showPanel(this.settingsSpec());
    }
    switch (id) {
      case 'start': return this.startRun();
      case 'retry': return this.startRun();
      case 'settings': this.settingsFrom = this.state; return this.hud.showPanel(this.settingsSpec());
      case 'menu':
        if (this.settingsFrom === 'pause' && this.state === 'pause') { this.settingsFrom = null; return this.hud.showPanel(this.pauseSpec()); }
        this.settingsFrom = null;
        this.toMenu();
        return;
      case 'resume': return this.resume();
      case 'recal': this.hud.hidePanel(); return this.beginCalib('ride');
      case 'exitvr': this.renderer.xr.getSession()?.end(); return;
    }
  }

  saveSettings() {
    this.store.settings = this.settings;
    save(this.store);
    this.sound.setMuted(!this.settings.sound);
    this.sound.setMusic(this.settings.music);
    this.run.stance = this.settings.stance === 'goofy' ? 'goofy' : 'regular';
    this.syncDOMSettings();
  }

  toMenu() {
    this.sound.stopMusic();
    this.say('');
    if (this.xrActive) {
      this.state = 'vrmenu';
      this.newRun(false);
      this.needPanel = true;
      this.hud.showPanel(this.menuSpec());
    } else {
      this.state = 'title';
      this.newRun(true);
      this.showDOM('start');
    }
  }

  // ---- VR session ----
  async enterVR() {
    this.sound.init();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await this.renderer.xr.setSession(session);
      session.addEventListener('end', () => this.onVREnd());
      try { if (session.updateTargetFrameRate && session.supportedFrameRates?.includes(90)) await session.updateTargetFrameRate(90); } catch { /* keep the default */ }
    } catch (e) {
      this.toast('VR を 開始 できませんでした：' + (e.message || e));
      return;
    }
    this.xrActive = true;
    this.showDOM('none');
    this.world.setSignMode('vr');
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.body.cal = null;
    this.state = 'vrmenu';
    this.newRun(false);
    this.needPanel = true;
    this.hud.showPanel(this.menuSpec());
  }

  onVREnd() {
    this.xrActive = false;
    this.hud.hidePanel();
    this.hud.bigText('');
    this.xr.point([], false);
    this.dolly.position.set(0, 0, 0);
    this.dolly.rotation.set(0, 0, 0);
    this.world.setSignMode('pc');
    this.resize();
    this.toMenu();
  }

  // ---- PC / phone page ----
  resize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  showDOM(which) {
    for (const id of ['start', 'hud', 'results', 'pause']) $(id).classList.toggle('hidden', id !== which);
    $('topbar').classList.toggle('hidden', which === 'none' || which === 'start');
    $('touch').classList.toggle('hidden', which !== 'hud' || !matchMedia('(pointer: coarse)').matches);
  }

  pcHud(dt) {
    this.pcT = (this.pcT || 0) - dt;
    if (this.pcT > 0 || this.state === 'title') return;
    this.pcT = 0.1;
    const run = this.run, r = run.rider;
    $('h-time').textContent = fmtTime(run.time);
    $('h-score').textContent = run.score;
    $('h-speed').textContent = `${Math.round(r.speed * 3.6)} km/h`;
    $('h-crystals').textContent = `◆ ${run.stats.crystals}/${run.crystals.length}`;
    $('h-course').textContent = this.course.name;
  }

  fillResults() {
    const L = this.lastResult;
    $('r-title').textContent = `${this.course.name}`;
    $('r-rank').textContent = L.rank;
    $('r-score').textContent = `${L.score} 点${L.newBest ? '　ベスト更新！' : ''}${L.newTime ? '　最速タイム！' : ''}`;
    $('r-stats').innerHTML = this.statsRows().map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
    const next = SPECS[(SPECS.findIndex((s) => s.id === this.courseId) + 1) % SPECS.length];
    $('r-next').textContent = `つぎ：${next.name}`;
    $('r-next').onclick = () => { this.loadCourse(next.id); this.startRun(); };
  }

  dom() {
    // course list
    const list = $('courses');
    list.innerHTML = '';
    for (const s of SPECS) {
      const b = document.createElement('button');
      b.className = 'course';
      b.dataset.id = s.id;
      const best = this.best(s.id);
      b.innerHTML = `<span class="lv lv${s.level}">${['練習', '初級', '中級', '上級'][s.level]}</span><b>${s.name}</b><small>${s.sub}</small><em>${best ? `ベスト ${best.score} 点（${best.rank}）・${fmtTime(best.time)}` : ''}</em>`;
      b.onclick = () => { if (s.id !== this.courseId) { this.state = 'title'; this.loadCourse(s.id); } this.markCourse(); };
      list.appendChild(b);
    }
    this.markCourse();
    // settings
    const box = $('settings');
    box.innerHTML = '';
    for (const k of Object.keys(OPTIONS)) {
      const l = document.createElement('label');
      l.innerHTML = `<span>${LABEL[k]}</span>`;
      const sel = document.createElement('select');
      sel.id = 'set-' + k;
      for (const [v, t] of OPTIONS[k]) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; sel.appendChild(o); }
      sel.onchange = () => { const v = OPTIONS[k].find(([x]) => String(x) === sel.value)[0]; this.settings[k] = v; this.saveSettings(); };
      l.appendChild(sel);
      box.appendChild(l);
    }
    for (const k of ['music', 'sound', 'ghost', 'feetRing']) {
      const l = document.createElement('label');
      l.className = 'tog';
      l.innerHTML = `<input type="checkbox" id="set-${k}"> <span>${{ music: '音楽', sound: '効果音', ghost: 'ゴースト（最速の 自分）', feetRing: '足もとの 輪（VR）' }[k]}</span>`;
      box.appendChild(l);
      l.querySelector('input').onchange = (e) => { this.settings[k] = e.target.checked; this.saveSettings(); };
    }
    this.syncDOMSettings();
    $('btn-pc').onclick = () => this.startRun();
    $('btn-vr').onclick = () => this.enterVR();
    $('btn-retry').onclick = () => this.startRun();
    $('btn-menu').onclick = () => this.toMenu();
    $('p-resume').onclick = () => this.resume();
    $('p-retry').onclick = () => this.startRun();
    $('p-menu').onclick = () => this.toMenu();
    $('btn-pause').onclick = () => (this.state === 'pause' ? this.resume() : this.pause());
    $('btn-sound').onclick = () => { this.settings.sound = !this.settings.sound; this.saveSettings(); };
    // touch buttons act as keys
    for (const el of document.querySelectorAll('#touch [data-key]')) {
      const k = el.dataset.key;
      const on = (e) => { e.preventDefault(); this.sound.init(); this.keys.down.add(k); };
      const off = (e) => { e.preventDefault(); this.keys.down.delete(k); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    }
    const note = $('vr-note');
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
        $('btn-vr').disabled = !ok;
        note.textContent = ok ? 'Meta Quest などの VR ゴーグルで そのまま 入れます。まわりに 半径 1 m ほどの 空間を。' : 'この ブラウザでは VR が 使えません。PC・スマホで どうぞ（Quest の ブラウザなら VR で 入れます）。';
      }).catch(() => { note.textContent = 'VR の 確認に 失敗しました。PC・スマホで どうぞ。'; });
    } else note.textContent = 'この ブラウザでは VR が 使えません（WebXR なし）。PC・スマホで どうぞ。';
    this.offline();
    $('loading').classList.add('hidden');
    if (params.has('play')) this.startRun();
    else this.showDOM('start');
  }

  markCourse() {
    for (const b of document.querySelectorAll('#courses .course')) b.classList.toggle('on', b.dataset.id === this.courseId);
  }

  syncDOMSettings() {
    for (const k of Object.keys(OPTIONS)) { const el = $('set-' + k); if (el) el.value = String(this.settings[k]); }
    for (const k of ['music', 'sound', 'ghost', 'feetRing']) { const el = $('set-' + k); if (el) el.checked = !!this.settings[k]; }
    const b = $('btn-sound'); if (b) b.textContent = this.settings.sound ? '音 ON' : '音 OFF';
  }

  toast(msg, action) {
    const t = $('toast');
    t.textContent = msg;
    if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.run(); t.classList.add('hidden'); }; t.appendChild(b); }
    t.classList.remove('hidden');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.add('hidden'), action ? 15000 : 5000);
  }

  // the published build registers the service worker, which keeps every file for offline use
  offline() {
    const el = $('offline'), txt = $('offline-text');
    if (!window.PL_BUILD || !('serviceWorker' in navigator)) {
      txt.textContent = window.PL_BUILD ? 'この ブラウザは オフライン保存に 対応していません' : '開発版（オフライン保存は 公開版で 有効）';
      return;
    }
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const ready = () => { el.classList.add('ok'); txt.textContent = `オフラインでも 遊べます（版 ${window.PL_BUILD}）`; };
      if (reg.active) ready();
      navigator.serviceWorker.ready.then(ready);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) this.toast('新しい 版が あります。', { label: '更新する', run: () => w.postMessage('SKIP_WAITING') });
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController || this.xrActive) return;
        reloaded = true;
        location.reload();
      });
    }).catch(() => { txt.textContent = 'オフライン保存に 失敗しました（オンラインでは 遊べます）'; });
  }
}

function rankMax(a, b) { const o = ['S', 'A', 'B', 'C']; if (!b) return a; return o.indexOf(a) <= o.indexOf(b) ? a : b; }

window.__app = new App();
