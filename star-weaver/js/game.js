// game.js — the state machine (calibrate → menu → play → results), scoring, HUD and the frame loop.
import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Hands } from './input.js';
import { UI } from './ui.js';
import { Panel, COLORS, font, fitText, roundRect } from './text.js';
import { Body, STEP_WIDTH, SQUAT_DEPTH } from './body.js';
import { Timeline, STAGES, MODES } from './timeline.js';
import { generateStage, coolBars } from './chart.js';
import { ENTITY, spawnLead, HAND_COLORS, assets } from './entities.js';
import { clamp, makeRng, fmtTime, lerp } from './util.js';

const JUDGE_POINTS = { perfect: 300, great: 200, good: 100, miss: 0 };
const v3 = () => new THREE.Vector3();

// song clock: follows the audio output when sound is on, the performance clock otherwise (tests, muted)
class Clock {
  constructor(audio) { this.audio = audio; this.speed = 1; this.paused = false; }
  start(t0, { speed = 1, useAudio = true } = {}) {
    this.speed = speed;
    this.useAudio = useAudio && this.audio.ok && this.audio.ctx.state === 'running' && speed === 1;
    if (this.useAudio) this.songStartCtx = this.audio.heardTime() - t0;
    this.perf0 = performance.now() / 1000; this.t0 = t0; this.pausedAt = 0; this.paused = false;
    // audio scheduling uses context time; map the song start onto it
    this.songStartSched = this.useAudio ? this.songStartCtx : this.audio.ok ? this.audio.ctx.currentTime - t0 : 0;
  }
  now() {
    if (this.useAudio) return this.audio.heardTime() - this.songStartCtx;
    const p = this.paused ? this.pausedAt : performance.now() / 1000;
    return this.t0 + (p - this.perf0) * this.speed;
  }
  pause() { if (!this.paused) { this.paused = true; this.pausedAt = performance.now() / 1000; } }
  resume() { if (this.paused) { this.perf0 += performance.now() / 1000 - this.pausedAt; this.paused = false; } }
}

export class Game {
  constructor({ renderer, scene, camera, audio, store, params }) {
    Object.assign(this, { renderer, scene, camera, audio, store, params });
    this.xr = false;
    this.stageRoot = new THREE.Group();
    scene.add(this.stageRoot);
    this.world = new World(this.stageRoot);
    this.playRoot = new THREE.Group();
    this.stageRoot.add(this.playRoot);
    this.fx = new FX(this.stageRoot);
    this.uiRoot = new THREE.Group();
    this.stageRoot.add(this.uiRoot);
    this.hands = new Hands(renderer, scene);
    this.body = new Body();
    this.ui = new UI(this);
    this.clock = new Clock(audio);
    this.head = v3(); this.headDir = new THREE.Vector3(0, 0, -1); this.headPrev = v3();
    this.state = 'idle';
    this.t = 0; this.beatPulse = 0; this.approach = 2.4; this.assist = 0;
    this.entities = [];
    this.queue = [];
    this.weaving = new Set();
    this.pxScale = 1000;
    this.listeners = {};
    assets();
    this._buildHandVisuals();
    this._buildPanels();
    this.world.setPalette('lake', 0);
    const s = store.settings;
    this.world.setLaneWidth(STEP_WIDTH[s.step] || 0.45, s.stance === 'stand');
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { for (const fn of this.listeners[ev] || []) fn(data); }

  // ---------------- setup ----------------
  _buildHandVisuals() {
    const a = assets();
    this.handVis = {};
    for (const k of ['L', 'R']) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 2), a.coreMat[k]);
      const glow = new THREE.Sprite(a.glowMat[k]); glow.scale.setScalar(0.15);
      g.add(glow, core);
      g.visible = false;
      this.stageRoot.add(g);
      this.handVis[k] = g;
    }
  }

  _buildPanels() {
    const P = (o) => { const p = new Panel(o); p.visible = false; this.uiRoot.add(p.mesh); return p; };
    this.hud = P({ w: 2.0, h: 0.525, px: 1024, order: 25 });
    this.caption = P({ w: 1.7, h: 0.3, px: 1024, order: 26 });
    this.title = P({ w: 2.2, h: 0.6, px: 1024, order: 27 });
    this.menu = this.ui.add(P({ w: 0.64, h: 0.475, px: 1024, interactive: true, order: 40 }));
    this.welcome = this.ui.add(P({ w: 0.62, h: 0.38, px: 1024, interactive: true, order: 40 }));
    this.tposeBoard = P({ w: 1.1, h: 0.62, px: 1024, order: 40 });
    this.tposeSkip = this.ui.add(P({ w: 0.26, h: 0.09, px: 512, interactive: true, order: 41 }));
    this.resultBoard = P({ w: 1.5, h: 1.05, px: 1024, order: 40 });
    this.resultBtns = this.ui.add(P({ w: 0.56, h: 0.12, px: 1024, interactive: true, order: 41 }));
    this.pausePanel = this.ui.add(P({ w: 0.6, h: 0.36, px: 1024, interactive: true, order: 45 }));
    // pause orb beside the hip, held for 0.8 s (hand-tracking players have no B/Y button)
    const po = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.044, 32, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    const bars = new THREE.Group();
    for (const x of [-0.012, 0.012]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.034), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); m.position.x = x; bars.add(m); }
    po.add(ring, fill, bars);
    po.visible = false;
    this.stageRoot.add(po);
    this.pauseOrb = po;
    this.ui.holdTargets.push({ mesh: po, radius: 0.09, time: 0, needed: 0.8, onHold: () => this.pause(), onProgress: (f) => { fill.material.opacity = f * 0.8; fill.scale.setScalar(Math.max(0.01, f)); } });
  }

  // put the stage (and everything on it) where the player stands, facing where they look
  alignToHead() {
    const c = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    this.stageRoot.position.set(c.position.x, 0, c.position.z);
    this.stageRoot.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
    this.stageRoot.updateMatrixWorld(true);
  }
  // the headset was re-centred (Meta button long-press): follow it
  onReferenceReset() {
    if (this.state === 'play' || this.state === 'paused' || this.state === 'resuming') this.recenter();
    else this.alignToHead();
  }
  // re-centre keeping the current lane, e.g. after the player drifted
  recenter() {
    const lane = this.lane || 0;
    this.alignToHead();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.stageRoot.quaternion);
    this.stageRoot.position.addScaledVector(right, -lane * this.laneW);
    this.stageRoot.updateMatrixWorld(true);
  }

  get laneW() { return STEP_WIDTH[this.store.settings.step] || 0.45; }

  // where interactive panels go: within arm's reach in VR, a little further on a monitor
  placeReach(panel, y = null, z = null, x = 0) {
    const b = this.body;
    const zz = z ?? (this.xr ? -0.46 : -0.85);
    const yy = y ?? (this.xr ? b.shoulderY + 0.03 : b.eyeY - 0.12);
    panel.mesh.position.set(x + (this.headLaneX || 0), yy, zz);
    const dy = b.eyeY - yy, dz = -zz;
    panel.mesh.rotation.set(-Math.atan2(dy, dz) * 0.9, 0, 0);
    panel.visible = true;
  }
  placeFar(panel, y, z) {
    panel.mesh.position.set(this.headLaneX || 0, y, z);
    panel.mesh.rotation.set(-Math.atan2(this.body.eyeY - y, -z) * 0.6, 0, 0);
    panel.visible = true;
  }
  refreshPanels() {
    for (const p of [this.menu, this.welcome, this.tposeBoard, this.tposeSkip, this.resultBoard, this.resultBtns, this.pausePanel, this.hud, this.caption, this.title]) if (p.drawFn) p.redraw();
  }
  hideAllPanels() {
    for (const p of [this.menu, this.welcome, this.tposeBoard, this.tposeSkip, this.resultBoard, this.resultBtns, this.pausePanel, this.hud, this.caption, this.title]) p.visible = false;
  }

  // ---------------- lifecycle ----------------
  enter(xr) {
    this.xr = xr;
    this.hands.manual = !xr;
    this.hideAllPanels();
    this.clearPlay();
    const c = this.store.data.calib, s = this.store.settings;
    if (c) this.body.configure({ eyeY: s.stance === 'sit' ? (c.sitEye || c.eye * 0.76) : c.eye, stature: c.stature, gripSpan: c.span || 0, seated: s.stance === 'sit', backCare: s.backCare });
    this.startAmbient();
    if (xr) { this.pendingAlign = 3; this.setState('welcome'); }
    else {
      this.stageRoot.position.set(0, 0, 0); this.stageRoot.rotation.set(0, 0, 0); this.stageRoot.updateMatrixWorld(true);
      this.body.configure({ eyeY: 1.58, stature: 1.7, gripSpan: 0, seated: false, backCare: s.backCare });
      this.camera.position.set(0, this.body.eyeY, 0);
      this.camera.rotation.set(0, 0, 0);
      this.setState(this.params.autoplay ? 'play' : 'menu');
      if (this.params.autoplay) this.startGame();
    }
  }
  exit() {
    this.audio.stopMusic();
    this.clearPlay();
    this.hideAllPanels();
    this.pauseOrb.visible = false;
    this.state = 'idle';
    this.xr = false;
  }

  setState(s) {
    this.state = s;
    this.hideAllPanels();
    this.pauseOrb.visible = false;
    if (s === 'welcome') this.showWelcome();
    else if (s === 'tpose') this.showTpose();
    else if (s === 'menu') this.showMenu();
    this.emit('state', s);
  }

  startAmbient() {
    const tl = new Timeline();
    tl.add('menu', 0, { bars: 100000 });
    this.ambientTl = tl;
    if (this.audio.ok) this.audio.startMusic(tl, this.audio.ctx.currentTime + 0.1);
    this.audio.level = 0;
  }

  // ---------------- calibration ----------------
  showWelcome() {
    const c = this.store.data.calib;
    this.placeReach(this.welcome);
    this.welcome.set((ctx, p) => {
      this.panelBg(ctx, p);
      ctx.fillStyle = COLORS.ink; ctx.textBaseline = 'alphabetic';
      fitText(ctx, 'STAR WEAVER', 512, 92, 900, 74, 800);
      ctx.fillStyle = COLORS.muted; fitText(ctx, 'ほしつむぎ — 肩と腰にやさしいリズムエクササイズ', 512, 140, 900, 32, 500);
      ctx.fillStyle = COLORS.ink;
      fitText(ctx, 'まっすぐ立って正面を向き、ボタンに指でタッチ', 512, 220, 920, 38, 700);
      ctx.fillStyle = COLORS.muted;
      fitText(ctx, '前後の移動は不要。左右に1歩ずつ動けるスペースがあればOK', 512, 268, 920, 28, 500);
    }, [
      { x: 140, y: 330, w: c ? 360 : 744, h: 140, label: 'はじめる', sub: '身長と腕の長さを測る', style: 'primary', onPress: () => this.beginCalibration(false) },
      ...(c ? [{ x: 524, y: 330, w: 360, h: 140, label: '前回の測定で', sub: 'すぐメニューへ', onPress: () => this.beginCalibration(true) }] : []),
    ]);
  }
  beginCalibration(reuse) {
    const s = this.store.settings, c = this.store.data.calib;
    const eye = this.camera.position.y;
    this.alignToHead();
    if (s.stance === 'sit') this.body.configure({ eyeY: eye, seated: true, stature: c?.stature || 1.7, gripSpan: c?.span || 0 });
    else this.body.configure({ eyeY: eye, seated: false, stature: eye / 0.936, gripSpan: reuse && c ? c.span : 0 });
    if (reuse && c) { this.saveCalib(c.span || 0); this.setState('menu'); return; }
    this.tpose = { hold: 0, best: 0 };
    this.setState('tpose');
  }
  showTpose() {
    this.placeFar(this.tposeBoard, this.body.eyeY - 0.05, -1.3);
    this.drawTpose(0);
    this.placeReach(this.tposeSkip, this.body.shoulderY - 0.38, -0.42, 0.24);
    this.tposeSkip.set((ctx, p) => this.panelBg(ctx, p), [{ x: 16, y: 16, w: 480, h: 144, label: 'スキップ', sub: '標準サイズで遊ぶ', onPress: () => this.finishTpose(0) }]);
  }
  drawTpose(f) {
    this.tposeBoard.set((ctx, p) => {
      this.panelBg(ctx, p);
      ctx.fillStyle = COLORS.ink; ctx.textBaseline = 'alphabetic';
      fitText(ctx, '両腕を横にまっすぐ広げて「T」の字に', 512, 88, 940, 52, 800);
      ctx.fillStyle = COLORS.muted;
      fitText(ctx, 'そのまま2秒キープすると腕の長さを測ります', 512, 140, 940, 32, 500);
      // pictogram
      ctx.save(); ctx.translate(512, 360); ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(0, -120, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -80); ctx.lineTo(0, 60); ctx.lineTo(-40, 170); ctx.moveTo(0, 60); ctx.lineTo(40, 170); ctx.stroke();
      ctx.strokeStyle = COLORS.L; ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(-250, -60); ctx.stroke();
      ctx.strokeStyle = COLORS.R; ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(250, -60); ctx.stroke();
      ctx.restore();
      roundRect(ctx, 212, 560, 600, 26, 13); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
      if (f > 0) { roundRect(ctx, 212, 560, 600 * f, 26, 13); ctx.fillStyle = COLORS.A; ctx.fill(); }
    });
  }
  updateTpose(dt) {
    const L = this.hands.L, R = this.hands.R, b = this.body;
    let ok = false, span = 0;
    if (L.tracked && R.tracked) {
      span = L.world.distanceTo(R.world);
      const yOk = Math.abs(L.local.y - b.shoulderY) < 0.28 && Math.abs(R.local.y - b.shoulderY) < 0.28;
      ok = span > 0.95 && yOk && L.local.x < -0.4 && R.local.x > 0.4;
    }
    const tp = this.tpose;
    tp.hold = ok ? tp.hold + dt : Math.max(0, tp.hold - dt * 2);
    if (ok) tp.best = Math.max(tp.best, span);
    const f = clamp(tp.hold / 2, 0, 1);
    if (Math.abs(f - (tp.drawn || 0)) > 0.04 || (f === 0) !== ((tp.drawn || 0) === 0)) { tp.drawn = f; this.drawTpose(f); }
    if (tp.hold >= 2) { this.audio.chord(3); this.hands.haptic('L', 0.7, 80); this.hands.haptic('R', 0.7, 80); this.finishTpose(tp.best); }
  }
  finishTpose(span) {
    const s = this.store.settings, prev = this.store.data.calib || {};
    this.body.configure({ gripSpan: span || prev.span || 0 });
    this.saveCalib(span || prev.span || 0);
    this.setState('menu');
  }
  saveCalib(span) {
    const b = this.body, prev = this.store.data.calib || {};
    const seated = this.store.settings.stance === 'sit';
    const stature = span > 0.9 ? clamp(span + 0.2, 1.3, 2.1) : seated ? prev.stature || 1.7 : b.stature;
    this.body.configure({ stature, gripSpan: span });
    this.store.setCalib({ eye: seated ? prev.eye || 1.58 : b.eyeY, sitEye: seated ? b.eyeY : prev.sitEye, stature, span, date: Date.now() });
  }

  // ---------------- menu ----------------
  panelBg(ctx, p) {
    const W = p.canvas.width, H = p.canvas.height;
    roundRect(ctx, 4, 4, W - 8, H - 8, 36);
    ctx.fillStyle = COLORS.panel; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = COLORS.line; ctx.stroke();
  }
  showMenu() {
    this.placeReach(this.menu);
    const s = this.store.settings, st = this.store;
    const set = (k, v) => () => { st.setSetting(k, v); this.applySettings(); this.menu.redraw(); };
    const sit = () => s.stance === 'sit';
    const modeBtn = (k, x) => ({ x, y: 150, w: 300, h: 124, label: MODES[k].label, sub: MODES[k].note, selected: () => s.mode === k, onPress: set('mode', k) });
    const opt = (k, v, label, x, y, w, sub) => ({ x, y, w, h: 86, label, sub, selected: () => s[k] === v, onPress: set(k, v) });
    const btns = [
      modeBtn('journey', 40), modeBtn('quick', 362), modeBtn('endless', 684),
      opt('stance', 'stand', '立って', 230, 300, 170), opt('stance', 'sit', '座って', 410, 300, 170),
      opt('volume', 'low', '小', 720, 300, 84), opt('volume', 'mid', '中', 812, 300, 84), opt('volume', 'high', '大', 904, 300, 84),
      opt('step', 'small', '小', 230, 400, 110, '30cm'), opt('step', 'mid', '中', 350, 400, 110, '45cm'), opt('step', 'large', '大', 470, 400, 110, '60cm'),
      { x: 720, y: 400, w: 268, h: 86, label: () => (s.backCare ? '腰いたわり ON' : '腰いたわり OFF'), selected: () => s.backCare, onPress: () => { st.setSetting('backCare', !s.backCare); this.applySettings(); this.menu.redraw(); } },
      opt('squat', 'off', 'なし', 230, 500, 110), opt('squat', 'shallow', '浅め', 350, 500, 110), opt('squat', 'normal', 'ふつう', 470, 500, 110),
      ...(this.xr ? [{ x: 720, y: 500, w: 268, h: 86, label: '測りなおす', onPress: () => this.setState('welcome') }] : []),
      { x: 40, y: 610, w: 640, h: 124, label: '▶  PLAY', style: 'primary', font: 64, onPress: () => this.startGame() },
    ];
    for (const b of btns) if (sit() && b.y >= 400 && b.y < 600 && b.x < 600) b.disabled = true;
    this.menuButtons = btns;
    this.menu.set((ctx, p) => {
      this.panelBg(ctx, p);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COLORS.ink; fitText(ctx, 'STAR WEAVER', 360, 92, 640, 70, 800, 'center');
      ctx.fillStyle = COLORS.muted; fitText(ctx, 'ほしつむぎ', 820, 88, 300, 40, 700, 'center');
      ctx.font = font(30, 700); ctx.textAlign = 'left'; ctx.fillStyle = COLORS.muted;
      ctx.fillText('姿勢', 50, 355); ctx.fillText('音量', 640, 355);
      ctx.fillText('横ステップ', 50, 455); ctx.fillText('スクワット', 50, 555);
      if (sit()) { ctx.fillStyle = 'rgba(14,12,40,0.6)'; ctx.fillRect(220, 394, 370, 200); }
      // records
      const best = st.data.best[s.mode] || 0, streak = st.streak();
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.muted; ctx.font = font(26, 500); ctx.fillText('ベスト', 838, 640);
      ctx.fillStyle = COLORS.A; fitText(ctx, best ? best.toLocaleString() : '—', 838, 684, 290, 44, 800);
      ctx.fillStyle = COLORS.muted; ctx.font = font(26, 500); ctx.fillText(streak ? `${streak}日連続プレイ中` : '今日から記録スタート', 838, 724);
    }, btns);
  }
  applySettings() {
    const s = this.store.settings, c = this.store.data.calib;
    this.audio.setVolume(s.volume);
    const seated = s.stance === 'sit';
    if (seated !== this.body.seated) {
      // switching stance needs a new eye height: use what we saw last time, or the live head height
      const eye = seated ? (c?.sitEye || this.camera.position.y) : (c?.eye || this.camera.position.y);
      this.body.configure({ eyeY: this.xr ? this.camera.position.y : eye, seated });
    }
    this.body.configure({ backCare: s.backCare });
    this.world.setLaneWidth(this.laneW, !seated);
  }

  // ---------------- play ----------------
  clearPlay() {
    for (const e of this.entities) e.cancel();
    this.entities = [];
    this.queue = [];
    for (const t of [...this.weaving]) this.weave(false, t);
    this.audio.weave(false);
  }

  startGame() {
    const s = this.store.settings, p = this.params;
    this.applySettings();
    if (this.xr) { this.body.configure({ eyeY: Math.max(0.9, this.camera.position.y) }); this.recenterSoft(); }
    this.clearPlay();
    this.hideAllPanels();
    this.mode = p.mode || s.mode;
    const tl = this.tl = new Timeline();
    const quick = this.mode === 'quick';
    for (const [k, sec] of MODES[this.mode].plan) {
      if (k === 'cool') tl.add('cool', 0, { bars: coolBars(quick, s.backCare) });
      else tl.add(k, sec);
    }
    if (this.mode === 'endless') { tl.addEndless(); tl.addEndless(); }
    this.chartCtx = {
      rng: makeRng(p.seed || (Date.now() & 0xffffff)), body: this.body, lane: 0, laneW: this.laneW,
      squatDepth: s.stance === 'sit' ? 0 : SQUAT_DEPTH[s.squat] || 0, seated: s.stance === 'sit', backCare: s.backCare,
      quick, seen: new Set(), moves: 0, tipIndex: 0, last: null,
    };
    this.world.setLaneWidth(this.laneW, s.stance !== 'sit');
    this.lane = 0; this.headLaneX = 0;
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.fever = false; this.assist = 0; this.recent = [];
    this.stats = { total: 0, hit: 0, perfect: 0, great: 0, good: 0, miss: 0, reach: 0, open: 0, circles: 0, twist: 0, steps: 0, squats: 0, stretch: 0, kcal: 0, playSec: 0 };
    this.curSeg = null;
    this.cooling = false;
    this.ended = false;
    this.hudDirty = true;
    const t0 = -2.2;
    this.clock.start(t0, { speed: p.speed || 1, useAudio: !p.nosound });
    if (this.audio.ok) {
      this.audio.startMusic(tl, this.clock.songStartSched);
      if (!p.nosound) this.audio.countIn(this.clock.songStartSched, tl.segs[0].beatSec, 4);
    }
    this.t = t0;
    this.state = 'play';
    this.placeFar(this.hud, this.body.eyeY + 0.72, -3.4);
    this.hud.mesh.position.x = 0;
    this.drawHud(true);
    this.emit('state', 'play');
    this.showCaption('準備はいい？', this.hands.anyHandTracking ? '一時停止は左腰の ⏸ を長押し' : '一時停止は B / Y ボタン', 2.6);
  }
  recenterSoft() {
    // keep the stage where it was calibrated, but follow the player's current facing if it drifted a lot
    const yawNow = (() => { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); return Math.atan2(-f.x, -f.z); })();
    let d = yawNow - this.stageRoot.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    const local = this.stageRoot.worldToLocal(this.camera.position.clone());
    if (Math.abs(d) > 0.5 || Math.hypot(local.x, local.z) > 0.5) this.alignToHead();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.clock.pause();
    this.audio.weave(false);
    this.audio.suspend();
    this.placeReach(this.pausePanel);
    this.pausePanel.mesh.position.x = this.head.x;
    const canCool = !this.cooling && this.curSeg && this.curSeg.key !== 'cool';
    this.pausePanel.set((ctx, p) => {
      this.panelBg(ctx, p);
      ctx.fillStyle = COLORS.ink; ctx.textBaseline = 'alphabetic';
      fitText(ctx, '一時停止中', 512, 96, 900, 64, 800);
      ctx.fillStyle = COLORS.muted; fitText(ctx, `スコア ${Math.round(this.score).toLocaleString()}　·　${fmtTime(this.stats.playSec)}`, 512, 150, 900, 32, 500);
    }, [
      { x: 40, y: 200, w: 450, h: 150, label: '再開', sub: '3秒後にスタート', style: 'primary', onPress: () => this.resume() },
      { x: 534, y: 200, w: 450, h: 150, label: canCool ? 'クールダウンへ' : '終了してリザルト', sub: canCool ? 'ストレッチして終わる' : '', onPress: () => (canCool ? this.toCooldown() : this.finish(true)) },
      { x: 40, y: 380, w: 450, h: 150, label: '位置リセット', sub: '今の立ち位置を中心に', onPress: () => { this.recenter(); this.resume(); } },
      { x: 534, y: 380, w: 450, h: 150, label: 'メニューへ', sub: '記録せずに戻る', onPress: () => this.quitToMenu() },
    ]);
    this.emit('state', 'paused');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.pausePanel.visible = false;
    this.state = 'resuming';
    this.resumeAt = performance.now() + 2500;
    this.showCaption('3', '', 0.9);
  }
  _doResume() {
    this.audio.resume();
    this.clock.resume();
    this.state = 'play';
  }
  toCooldown() {
    this.cooling = true;
    const tcut = this.tl.cutAfter(this.t, 1);
    this.queue = this.queue.filter((e) => e.t < tcut - 0.05);
    for (const e of this.entities) if (e.ev.t >= tcut - 0.05 && !e.dead) e.cancel();
    this.entities = this.entities.filter((e) => !e.dead);
    this.tl.add('cool', 0, { bars: coolBars(this.mode === 'quick', this.store.settings.backCare) });
    this.mode === 'endless' && (this.endlessStopped = true);
    this.resume();
  }
  quitToMenu() {
    this.audio.resume();
    this.clearPlay();
    this.startAmbient();
    this.setState('menu');
  }

  showCaption(text, sub, dur = 3.5) {
    this.captionUntil = performance.now() + dur * 1000;
    this.placeFar(this.caption, this.body.eyeY + 0.3, -2.6);
    this.caption.mesh.position.x = this.headLaneX || 0;
    this.caption.set((ctx, p) => {
      const W = p.canvas.width, H = p.canvas.height;
      roundRect(ctx, 30, 8, W - 60, H - 16, 40);
      ctx.fillStyle = 'rgba(10, 8, 34, 0.62)'; ctx.fill();
      ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
      fitText(ctx, text, W / 2, sub ? 92 : 112, W - 120, 58, 800);
      if (sub) { ctx.fillStyle = '#d7d1ff'; fitText(ctx, sub, W / 2, 152, W - 120, 32, 500); }
    });
  }
  showTitle(seg) {
    const st = seg.stage;
    this.titleUntil = performance.now() + 3200;
    this.titleStart = performance.now();
    this.placeFar(this.title, this.body.eyeY + 0.05, -3.2);
    this.title.mesh.position.x = 0;
    const lap = seg.loop ? `  ·  LAP ${seg.loop + 1}` : '';
    this.title.set((ctx, p) => {
      const W = p.canvas.width;
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = '#ff7ad9'; ctx.shadowBlur = 30;
      ctx.fillStyle = '#ffd166'; fitText(ctx, st.sub + lap, W / 2, 90, W - 80, 44, 700);
      ctx.fillStyle = '#ffffff'; fitText(ctx, st.name, W / 2, 200, W - 80, 104, 800);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; fitText(ctx, `${seg.bpm} BPM`, W / 2, 262, W - 80, 30, 500);
    });
  }

  // timeline bookkeeping: generate charts ahead, extend endless mode, change stages
  advanceTimeline(t) {
    const tl = this.tl;
    if (this.mode === 'endless' && !this.endlessStopped && tl.last.t0 - t < 15) tl.addEndless();
    for (const seg of tl.segs) {
      if (seg.generated || seg.t0 - t > 9) continue;
      seg.generated = true;
      const evs = generateStage(seg, this.chartCtx);
      const ap = seg.stage.approach;
      for (const ev of evs) {
        ev.seg = seg;
        ev.tSpawn = ev.t - (ev.type === 'caption' ? 0 : spawnLead(ev, ap * (1 + this.assist * 0.12), seg.barSec));
        this.queue.push(ev);
      }
      this.queue.sort((a, b) => a.tSpawn - b.tSpawn);
    }
    const seg = tl.at(Math.max(0, t));
    if (seg !== this.curSeg && (t >= seg.t0 - 0.05 || !this.curSeg)) {
      this.curSeg = seg;
      if (seg.key === 'cool') this.setFever(false); // calm down: keep the combo, drop the fireworks
      this.world.setPalette(seg.stage.palette, 3);
      this.showTitle(seg);
      this.hudDirty = true;
    }
  }

  spawn(t) {
    const q = this.queue;
    while (q.length && q[0].tSpawn <= t) {
      const ev = q.shift();
      if (ev.type === 'caption') { this.showCaption(ev.text, ev.sub, ev.dur); continue; }
      if (ev.optional && this.assist >= 1) continue;
      if (t > ev.t + 0.2 && ev.type !== 'thread' && ev.type !== 'gaze') continue; // too late (e.g. after a hitch)
      const C = ENTITY[ev.type];
      if (!C) continue;
      this.approach = ev.seg.stage.approach * (1 + this.assist * 0.12);
      this.entities.push(new C(this, ev));
    }
  }

  // ---------------- scoring ----------------
  scoreTick(points, ev) {
    if (this.state !== 'play') return;
    this.score += points * this.multiplier * (ev.seg && ev.seg.key === 'cool' ? 0.6 : 1);
    this.hudDirty = true;
  }
  get multiplier() { return (1 + Math.min(this.combo, 40) / 40) * (this.fever ? 1.5 : 1); }

  judge(kind, j, pos, ev, hand = null, extra = {}) {
    const st = this.stats, gentle = kind === 'gaze' || ev.long;
    const col = HAND_COLORS[ev.hand] || (kind === 'wall' || kind === 'bar' ? new THREE.Color('#7affc8') : HAND_COLORS.A);
    st.total++;
    st[j]++;
    if (j === 'miss') {
      if (!gentle) {
        if (this.combo >= 10) this.fx.popup('miss', pos.clone().add(new THREE.Vector3(0, 0.12, 0)));
        this.combo = 0;
        this.setFever(false);
      }
      this.fx.popup(kind === 'wall' || kind === 'bar' ? 'bump' : 'miss', pos, kind === 'wall' || kind === 'bar' ? 1.4 : 0.8);
      this.audio.miss();
      if (kind === 'wall' || kind === 'bar') { this.hands.haptic('L', 0.8, 120); this.hands.haptic('R', 0.8, 120); }
    } else {
      st.hit++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const pts = JUDGE_POINTS[j] * (kind === 'thread' ? 2 : kind === 'gate' && !ev.long ? 1.5 : 1);
      this.score += pts * this.multiplier;
      this.audio.hit(j, this.combo);
      const big = kind !== 'orb';
      this.fx.burst(pos, col, big ? 56 : 32, big ? 1.5 : 1.15, 0.026, 0.65);
      this.fx.ring(pos, col, big ? 0.15 : 0.1);
      const label = kind === 'wall' ? 'step' : kind === 'bar' ? 'squat' : kind === 'thread' && j === 'perfect' ? 'weave' : gentle ? 'clear' : j;
      this.fx.popup(label, pos.clone().add(new THREE.Vector3(0, 0.12, 0)), big ? 1.2 : 0.8);
      if (hand) this.hands.haptic(hand.side, j === 'perfect' ? 0.9 : 0.6, j === 'perfect' ? 60 : 40);
      if (kind === 'wall' || kind === 'bar') this.audio.whoosh(0.18);
      if (kind === 'thread' || kind === 'gate') this.audio.chord(j === 'perfect' ? 4 : 3, 0.16);
      if (!this.fever && this.combo >= 30 && !(this.curSeg && this.curSeg.key === 'cool')) this.setFever(true);
      if (this.combo % 50 === 0) {
        this.fx.popupText(`${this.combo} COMBO!`, '#ffd166', new THREE.Vector3(this.head.x, this.body.eyeY - 0.05, -1.7), 1.8);
        this.audio.chord(5, 0.18);
        this.world.feverTarget = Math.max(this.world.feverTarget, 0.6);
        if (!this.fever) setTimeout(() => { if (!this.fever) this.world.feverTarget = 0; }, 1500);
      }
      // movement report
      if (kind === 'orb') {
        if (ev.kind === 'high' || ev.kind === 'y' || ev.kind === 'top') st.reach++;
        if (ev.kind === 'wide') st.open++;
        if (ev.twist) st.twist++;
      }
      if (kind === 'thread') { if (ev.kind === 'infinity') st.twist++; else st.circles += extra.loops || 0; }
      if (kind === 'gate') {
        if (ev.pose === 'wing') st.open++;
        else if (ev.pose === 'sky' || ev.pose === 'crown') st.reach++;
        if (ev.long) st.stretch++;
      }
      if (kind === 'wall') st.steps++;
      if (kind === 'bar') st.squats++;
    }
    if (!gentle) {
      this.recent.push(j === 'miss' ? 0 : 1);
      if (this.recent.length > 16) this.recent.shift();
      if (this.recent.length >= 12) {
        const missRate = 1 - this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
        if (missRate > 0.4 && this.assist < 2) { this.assist++; this.recent = this.recent.slice(-6); }
        else if (missRate < 0.08 && this.assist > 0) { this.assist--; this.recent = this.recent.slice(-6); }
      }
    }
    this.hudDirty = true;
    this.emit('judge', { kind, j });
  }
  setFever(on) {
    if (on === this.fever) return;
    this.fever = on;
    this.world.feverTarget = on ? 1 : 0;
    if (on) { this.fx.popup('fever', new THREE.Vector3(this.head.x, this.body.eyeY + 0.02, -1.8), 2); this.audio.chord(5, 0.2); }
    this.hudDirty = true;
  }
  weave(on, thread) {
    if (on) this.weaving.add(thread); else this.weaving.delete(thread);
    const seg = this.curSeg || STAGES.lake;
    const root = seg.stage ? seg.stage.scale[0] - 12 : 69;
    this.audio.weave(this.weaving.size > 0, root);
  }

  // ---------------- HUD ----------------
  drawHud(force = false) {
    const now = performance.now();
    if (!force && (!this.hudDirty || now - (this.hudDrawn || 0) < 90)) return;
    this.hudDirty = false; this.hudDrawn = now;
    const seg = this.curSeg, t = this.t, tl = this.tl;
    this.hud.set((ctx, p) => {
      const W = p.canvas.width, H = p.canvas.height;
      roundRect(ctx, 6, 6, W - 12, H - 12, 40);
      ctx.fillStyle = 'rgba(10, 8, 34, 0.5)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = this.fever ? 'rgba(255,122,217,0.9)' : 'rgba(160,150,255,0.3)'; ctx.stroke();
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COLORS.muted; ctx.font = font(26, 700); ctx.textAlign = 'left'; ctx.fillText('SCORE', 46, 76);
      ctx.fillStyle = '#ffffff'; ctx.font = font(60, 800); ctx.fillText(Math.round(this.score).toLocaleString(), 44, 146);
      ctx.textAlign = 'center';
      ctx.fillStyle = this.fever ? '#ff7ad9' : COLORS.A; ctx.font = font(this.combo >= 100 ? 84 : 100, 800); ctx.fillText(String(this.combo), W / 2, 150);
      ctx.fillStyle = COLORS.muted; ctx.font = font(26, 700); ctx.fillText(this.fever ? 'FEVER COMBO' : 'COMBO', W / 2, 188);
      ctx.fillStyle = '#ffffff'; ctx.font = font(30, 700); ctx.fillText(`×${this.multiplier.toFixed(1)}`, W / 2, 228);
      // fever gauge
      const fg = this.fever ? 1 : Math.min(1, this.combo / 30);
      roundRect(ctx, W / 2 - 150, 248, 300, 16, 8); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
      if (fg > 0) { roundRect(ctx, W / 2 - 150, 248, 300 * fg, 16, 8); ctx.fillStyle = this.fever ? '#ff7ad9' : '#ffd166'; ctx.fill(); }
      ctx.textAlign = 'right';
      if (seg) {
        ctx.fillStyle = COLORS.muted; ctx.font = font(26, 700); ctx.fillText(seg.stage.sub + (seg.loop ? ` · LAP ${seg.loop + 1}` : ''), W - 46, 76);
        ctx.fillStyle = '#ffffff'; fitText(ctx, seg.stage.name, W - 46, 128, 330, 44, 800, 'right');
        const prog = clamp((t - seg.t0) / (seg.t1 - seg.t0), 0, 1);
        roundRect(ctx, W - 376, 154, 330, 14, 7); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
        roundRect(ctx, W - 376, 154, 330 * prog, 14, 7); ctx.fillStyle = '#7af0ff'; ctx.fill();
        ctx.fillStyle = COLORS.muted; ctx.font = font(26, 500); ctx.textAlign = 'right';
        const left = this.mode === 'endless' && !this.endlessStopped ? `経過 ${fmtTime(this.stats.playSec)}` : `残り ${fmtTime(tl.end - t)}`;
        ctx.fillText(left, W - 46, 210);
      }
      ctx.textAlign = 'left'; ctx.fillStyle = COLORS.muted; ctx.font = font(24, 500);
      ctx.fillText(`約 ${this.stats.kcal.toFixed(1)} kcal`, 46, 196);
      if (this.assist > 0) ctx.fillText(this.assist > 1 ? 'ゆったりモード++' : 'ゆったりモード', 46, 232);
    });
  }

  // ---------------- results ----------------
  finish(early = false) {
    if (this.ended) return;
    this.ended = true;
    this.audio.resume();
    this.clock.resume();
    this.clearPlay();
    const st = this.stats, acc = st.total ? st.hit / st.total : 0;
    const rank = acc >= 0.97 && st.total > 40 ? 'SS' : acc >= 0.92 ? 'S' : acc >= 0.82 ? 'A' : acc >= 0.68 ? 'B' : 'C';
    const result = {
      date: new Date().toISOString(), mode: this.mode, score: Math.round(this.score), rank, acc: Math.round(acc * 1000) / 10,
      maxCombo: this.maxCombo, sec: Math.round(st.playSec), kcal: Math.round(st.kcal * 10) / 10,
      counts: { reach: st.reach, open: st.open, circles: st.circles, twist: st.twist, steps: st.steps, squats: st.squats, stretch: st.stretch },
      travel: Math.round(this.hands.L.travel + this.hands.R.travel), early,
    };
    const rec = this.params.autoplay ? { newBest: false } : this.store.record(result);
    this.lastResult = { ...result, ...rec, streak: this.store.streak() };
    this.state = 'results';
    this.hideAllPanels();
    this.audio.stopMusic();
    this.audio.fanfare();
    setTimeout(() => { if (this.state === 'results') this.startAmbient(); }, 2500);
    this.showResults();
    this.emit('results', this.lastResult);
    this.emit('state', 'results');
  }
  showResults() {
    const r = this.lastResult;
    this.placeFar(this.resultBoard, this.body.eyeY - 0.05, -1.7);
    this.resultBoard.mesh.position.x = this.head.x;
    this.resultBoard.set((ctx, p) => {
      this.panelBg(ctx, p);
      const W = p.canvas.width;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COLORS.muted; fitText(ctx, `${MODES[r.mode].label}　リザルト`, W / 2, 70, 900, 34, 700);
      ctx.shadowColor = '#ff7ad9'; ctx.shadowBlur = 30;
      ctx.fillStyle = COLORS.A; ctx.font = font(170, 800); ctx.textAlign = 'left'; ctx.fillText(r.rank, 70, 250);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = font(76, 800); ctx.fillText(r.score.toLocaleString(), 330, 180);
      ctx.fillStyle = r.newBest ? '#ff7ad9' : COLORS.muted; ctx.font = font(30, 700);
      ctx.fillText(r.newBest ? '★ 自己ベスト更新！' : r.prevBest ? `ベスト ${r.prevBest.toLocaleString()}` : '', 334, 226);
      ctx.fillStyle = COLORS.ink; ctx.font = font(30, 600);
      ctx.fillText(`正確さ ${r.acc}%　最大コンボ ${r.maxCombo}`, 334, 270);
      // body report
      const items = [
        ['肩まわし', r.counts.circles, '回'], ['腕を上へ', r.counts.reach, '回'], ['胸ひらき', r.counts.open, '回'],
        ['ツイスト', r.counts.twist, '回'], ['サイドステップ', r.counts.steps, '歩'], ['ミニスクワット', r.counts.squats, '回'],
      ];
      ctx.fillStyle = COLORS.muted; ctx.font = font(30, 700); ctx.fillText('からだレポート', 70, 340);
      items.forEach(([k, v, u], i) => {
        const x = 70 + (i % 3) * 300, y = 380 + Math.floor(i / 3) * 104;
        roundRect(ctx, x, y, 280, 90, 20); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
        ctx.fillStyle = COLORS.muted; ctx.font = font(24, 600); ctx.fillText(k, x + 20, y + 34);
        ctx.fillStyle = '#ffffff'; ctx.font = font(40, 800); ctx.fillText(String(v), x + 20, y + 78);
        const w = ctx.measureText(String(v)).width;
        ctx.fillStyle = COLORS.muted; ctx.font = font(24, 600); ctx.fillText(u, x + 28 + w, y + 78);
      });
      ctx.fillStyle = COLORS.ink; ctx.font = font(32, 700);
      ctx.fillText(`プレイ ${fmtTime(r.sec)}　·　約 ${r.kcal} kcal　·　腕の移動 ${r.travel} m`, 70, 618);
      ctx.fillStyle = COLORS.A; ctx.font = font(30, 700);
      ctx.fillText(r.streak > 1 ? `${r.streak}日連続！ この調子で肩こりにさよなら` : 'おつかれさまでした！ 水分補給も忘れずに', 70, 670);
    });
    this.placeReach(this.resultBtns, this.body.shoulderY - 0.22, this.xr ? -0.45 : -0.8);
    this.resultBtns.mesh.position.x = this.head.x;
    this.resultBtns.set((ctx, p) => this.panelBg(ctx, p), [
      { x: 20, y: 20, w: 482, h: 180, label: 'もう一度', style: 'primary', onPress: () => this.startGame() },
      { x: 522, y: 20, w: 482, h: 180, label: 'メニューへ', onPress: () => this.setState('menu') },
    ]);
  }

  // ---------------- frame ----------------
  update(dt) {
    const cam = this.camera;
    if (this.xr && this.pendingAlign > 0 && --this.pendingAlign === 0) {
      this.alignToHead();
      this.body.configure({ eyeY: Math.max(0.9, cam.position.y) });
      if (this.state === 'welcome') this.showWelcome();
    }
    // head & hands in stage space
    this.headPrev.copy(this.head);
    const headObj = this.xr ? cam : this.headObj || cam; // desktop preview supplies a virtual head
    this.stageRoot.worldToLocal(this.head.copy(headObj.position));
    const q = new THREE.Quaternion().copy(this.stageRoot.quaternion).invert().multiply(headObj.quaternion);
    this.headDir.set(0, 0, -1).applyQuaternion(q);
    const toLocal = (w, out) => this.stageRoot.worldToLocal(out.copy(w));
    this.hands.update(dt, toLocal);
    for (const k of ['L', 'R']) {
      const h = this.hands[k], v = this.handVis[k];
      v.visible = h.tracked && this.state !== 'idle';
      v.position.copy(h.local);
      if (v.visible && h.speed > 0.9 && this.state === 'play') this.fx.spark(h.local, HAND_COLORS[k], 0.014, 0.35, 0.05);
    }
    // controller pause (B / Y), resume with the same
    for (const k of ['L', 'R']) {
      const h = this.hands[k];
      if (h.pressed(4) || h.pressed(5)) { if (this.state === 'play') this.pause(); else if (this.state === 'paused') this.resume(); }
    }
    this.ui.update(dt);
    const lanePx = this.xr ? this.pxFromXR() : this.pxFromCanvas();
    this.pxScale = lanePx;
    assets().dotMat.uniforms.px.value = lanePx;

    let beatPhase = 0, level = 0, approachSpeed = 2;
    const st = this.state;
    if (st === 'tpose') this.updateTpose(dt);
    if (st === 'resuming' && performance.now() >= this.resumeAt) this._doResume();
    if (st === 'resuming') { const n = Math.ceil((this.resumeAt - performance.now()) / 1000 * 1.2); if (n !== this.resumeN) { this.resumeN = n; this.showCaption(String(Math.max(1, n)), '', 0.9); } }
    if (this.state === 'play') {
      const t = this.clock.now();
      const gdt = clamp(t - this.t, 0, 0.1);
      this.t = t;
      this.advanceTimeline(t);
      this.spawn(t);
      const seg = this.curSeg || this.tl.segs[0];
      const beat = (t - seg.t0) / seg.beatSec;
      beatPhase = ((beat % 1) + 1) % 1;
      this.beatPulse = Math.pow(1 - beatPhase, 4);
      for (const e of this.entities) if (!e.dead) e.update(t, gdt);
      this.entities = this.entities.filter((e) => !e.dead);
      // music intensity follows the combo
      const lvl = this.fever ? 4 : this.combo >= 18 ? 3 : this.combo >= 8 ? 2 : 1;
      this.audio.level = lvl;
      level = seg.stage.level < 0 ? -1 : clamp(lvl, seg.stage.level, seg.stage.cap);
      approachSpeed = 14 / seg.stage.approach;
      // movement bookkeeping
      if (t > 0) {
        this.stats.playSec += gdt;
        const hs = (this.hands.L.speed + this.hands.R.speed) / 2;
        const vy = Math.abs(this.head.y - this.headPrev.y) / Math.max(dt, 1e-3), vx = Math.abs(this.head.x - this.headPrev.x) / Math.max(dt, 1e-3);
        const met = clamp(2.1 + 1.9 * Math.min(hs, 2.5) + 2.5 * Math.min(vy, 0.6) + 1.5 * Math.min(vx, 0.8), 1.8, 7.5);
        this.stats.kcal += met * (this.store.settings.weight || 65) * gdt / 3600;
      }
      this.headLaneX = this.head.x;
      if (Math.floor(t * 2) !== this.hudSec) { this.hudSec = Math.floor(t * 2); this.hudDirty = true; }
      this.drawHud();
      // pause orb follows the player's left hip
      this.pauseOrb.visible = this.xr;
      this.pauseOrb.position.set(this.head.x - 0.5, this.body.shoulderY - 0.5, this.head.z - 0.08);
      this.pauseOrb.lookAt(this.stageRoot.localToWorld(this.head.clone()));
      if (!this.ended && t > this.tl.end + 0.6 && (this.mode !== 'endless' || this.endlessStopped)) this.finish();
    } else if (this.state === 'menu' || this.state === 'results' || this.state === 'welcome' || this.state === 'tpose') {
      const now = this.audio.ok ? this.audio.ctx.currentTime : performance.now() / 1000;
      beatPhase = (now / (60 / STAGES.menu.bpm)) % 1;
      level = -1;
      this.beatPulse = Math.pow(1 - beatPhase, 4) * 0.4;
    }
    if (this.audio.ok) this.audio.update();
    // panels with timed visibility
    const now = performance.now();
    if (this.caption.visible && now > this.captionUntil) this.caption.visible = false;
    if (this.title.visible) {
      const k = (now - this.titleStart) / 1000;
      const s = Math.min(1, k * 2.2);
      this.title.mesh.scale.setScalar(0.85 + 0.15 * s);
      this.title.mesh.material.opacity = Math.min(s, clamp((this.titleUntil - now) / 600, 0, 1));
      if (now > this.titleUntil) this.title.visible = false;
    }
    this.world.update(dt, { beat: beatPhase, level, px: lanePx, approachSpeed });
    this.fx.update(dt, lanePx);
  }

  pxFromCanvas() {
    const h = this.renderer.domElement.height || 800;
    return (h * this.camera.projectionMatrix.elements[5]) / 2;
  }
  pxFromXR() {
    const xc = this.renderer.xr.getCamera();
    const c0 = xc.cameras && xc.cameras[0];
    if (!c0 || !c0.viewport || !c0.viewport.w) return this.pxScale || 1200;
    return (c0.viewport.w * c0.projectionMatrix.elements[5]) / 2;
  }
}
