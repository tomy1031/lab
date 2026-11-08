// game.js — the state machine (calibrate → menu → tutorial / play → results), scoring, HUD,
// the hologram coach and the frame loop.
import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Hands } from './input.js';
import { UI } from './ui.js';
import { Panel } from './text.js';
import { C } from './theme.js';
import * as S from './screens.js';
import { Body, STEP_WIDTH, SQUAT_DEPTH } from './body.js';
import { Timeline, STAGES, MODES } from './timeline.js';
import { generateStage, coolBars } from './chart.js';
import { ENTITY, spawnLead, assets } from './entities.js';
import { HAND_COLORS, GREEN } from './palette.js';
import { HandVisual } from './handvis.js';
import { Coach } from './coach.js';
import { Tutorial } from './tutorial.js';
import { uTime, uBeat } from './gfx.js';
import { clamp, makeRng } from './util.js';

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
    this.coach = new Coach(this.stageRoot);
    this.tutorial = new Tutorial(this);
    this.head = v3(); this.headDir = new THREE.Vector3(0, 0, -1); this.headPrev = v3(); this.eyeLocal = v3();
    this.state = 'idle';
    this.t = 0; this.beatPulse = 0; this.approach = 2.4; this.assist = 0;
    this.entities = [];
    this.queue = [];
    this.weaving = new Set();
    this.pxScale = 1000;
    this.listeners = {};
    this.stats = this.freshStats();
    this.score = 0; this.combo = 0; this.fever = false;
    this.coachLane = 0; this.coachHold = 0;
    assets();
    this.handVis = { L: new HandVisual(this.stageRoot, 'L'), R: new HandVisual(this.stageRoot, 'R') };
    this._buildPanels();
    this.world.setPalette('lake', 0);
    const s = store.settings;
    this.world.setLaneWidth(STEP_WIDTH[s.step] || 0.45, s.stance === 'stand');
    this.coach.setBody(this.body);
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { for (const fn of this.listeners[ev] || []) fn(data); }
  freshStats() { return { total: 0, hit: 0, perfect: 0, great: 0, good: 0, miss: 0, reach: 0, open: 0, circles: 0, twist: 0, steps: 0, squats: 0, stretch: 0, kcal: 0, playSec: 0 }; }

  // ---------------- panels ----------------
  _buildPanels() {
    const P = (o) => { const p = new Panel(o); p.visible = false; this.uiRoot.add(p.mesh); if (o.interactive) this.ui.add(p); return p; };
    this.logo = P({ w: 2.6, h: 0.72, px: 1600, order: 18 });
    this.menu = P({ w: 0.66, h: 0.44, px: 1024, interactive: true, order: 40, glow: '#6a5cff' });
    this.settingsPanel = P({ w: 0.36, h: 0.46, px: 640, interactive: true, order: 40, glow: '#3f8cff' });
    this.hudScore = P({ w: 0.95, h: 0.4, px: 640, order: 25 });
    this.hudCombo = P({ w: 0.78, h: 0.56, px: 512, order: 25 });
    this.hudStage = P({ w: 0.95, h: 0.4, px: 640, order: 25 });
    this.hint = P({ w: 1.5, h: 0.33, px: 1024, order: 26 });
    this.title = P({ w: 3.0, h: 0.78, px: 1600, order: 27 });
    this.welcome = P({ w: 0.62, h: 0.42, px: 1024, interactive: true, order: 40, glow: '#6a5cff' });
    this.tposeBoard = P({ w: 1.3, h: 0.46, px: 1024, order: 40 });
    this.tposeSkip = P({ w: 0.28, h: 0.1, px: 512, interactive: true, order: 41 });
    this.resultBoard = P({ w: 1.6, h: 0.95, px: 1280, order: 40, glow: '#6a5cff' });
    this.resultBtns = P({ w: 0.58, h: 0.13, px: 1024, interactive: true, order: 41 });
    this.pausePanel = P({ w: 0.6, h: 0.4, px: 1024, interactive: true, order: 45, glow: '#6a5cff' });
    this.tutCard = P({ w: 1.7, h: 0.44, px: 1280, order: 30 });
    this.tutCtl = P({ w: 0.3, h: 0.1, px: 512, interactive: true, order: 41 });
    this.tutDone = P({ w: 0.62, h: 0.14, px: 1024, interactive: true, order: 41 });
    this.allPanels = [this.logo, this.menu, this.settingsPanel, this.hudScore, this.hudCombo, this.hudStage, this.hint, this.title, this.welcome, this.tposeBoard, this.tposeSkip, this.resultBoard, this.resultBtns, this.pausePanel, this.tutCard, this.tutCtl, this.tutDone];
    // pause orb beside the hip, held for 0.8 s (hand-tracking players have no B/Y button)
    const po = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.044, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    const bars = new THREE.Group();
    for (const x of [-0.012, 0.012]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.034), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); m.position.x = x; bars.add(m); }
    po.add(ring, fill, bars);
    po.visible = false;
    this.stageRoot.add(po);
    this.pauseOrb = po;
    this.ui.holdTargets.push({ mesh: po, radius: 0.09, time: 0, needed: 0.8, onHold: () => this.pause(), onProgress: (f) => { fill.material.opacity = f * 0.8; fill.scale.setScalar(Math.max(0.01, f)); } });
  }
  refreshPanels() { for (const p of this.allPanels) if (p.drawFn) p.redraw(); }
  hideAllPanels() { for (const p of this.allPanels) p.visible = false; }

  // within arm's reach in VR (a little further on a monitor); yaw turns side panels toward the player
  placeReach(panel, { x = 0, y = null, z = null, yaw = 0 } = {}) {
    const b = this.body;
    const zz = z ?? (this.xr ? -0.46 : -0.85);
    const yy = y ?? (this.xr ? b.shoulderY + 0.03 : b.eyeY - 0.12);
    panel.mesh.position.set(x + (this.headLaneX || 0), yy, zz);
    const dy = b.eyeY - yy, dz = Math.hypot(zz, x);
    panel.mesh.rotation.set(0, 0, 0, 'YXZ');
    panel.mesh.rotation.order = 'YXZ';
    panel.mesh.rotation.y = yaw;
    panel.mesh.rotation.x = -Math.atan2(dy, dz) * 0.9;
    panel.visible = true;
  }
  placeFar(panel, y, z, x = null) {
    panel.mesh.rotation.order = 'YXZ';
    panel.mesh.position.set(x ?? (this.headLaneX || 0), y, z);
    panel.mesh.rotation.set(-Math.atan2(this.body.eyeY - y, -z) * 0.6, 0, 0);
    panel.visible = true;
  }
  // on a circle around the player (HUD modules)
  placeArc(panel, angle, radius, y) {
    panel.mesh.rotation.order = 'YXZ';
    panel.mesh.position.set(-Math.sin(angle) * radius, y, -Math.cos(angle) * radius);
    panel.mesh.rotation.set(-Math.atan2(y - this.body.eyeY, radius) * 0.8 * -1, angle, 0);
    panel.visible = true;
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
  onReferenceReset() {
    if (this.state === 'play' || this.state === 'paused' || this.state === 'resuming') this.recenter();
    else this.alignToHead();
  }
  recenter() {
    const lane = this.coachLane / (this.laneW || 1);
    this.alignToHead();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.stageRoot.quaternion);
    this.stageRoot.position.addScaledVector(right, -this.coachLane);
    this.stageRoot.updateMatrixWorld(true);
    return lane;
  }
  get laneW() { return STEP_WIDTH[this.store.settings.step] || 0.45; }

  // ---------------- lifecycle ----------------
  enter(xr) {
    this.xr = xr;
    this.hands.manual = !xr;
    this.hideAllPanels();
    this.clearPlay();
    const c = this.store.data.calib, s = this.store.settings;
    if (c) this.body.configure({ eyeY: s.stance === 'sit' ? (c.sitEye || c.eye * 0.76) : c.eye, stature: c.stature, gripSpan: c.span || 0, seated: s.stance === 'sit', backCare: s.backCare });
    this.coach.setBody(this.body);
    this.startAmbient();
    if (xr) { this.pendingAlign = 3; this.setState('welcome'); }
    else {
      this.stageRoot.position.set(0, 0, 0); this.stageRoot.rotation.set(0, 0, 0); this.stageRoot.updateMatrixWorld(true);
      this.body.configure({ eyeY: 1.58, stature: 1.7, gripSpan: 0, seated: false, backCare: s.backCare });
      this.coach.setBody(this.body);
      this.camera.position.set(0, this.body.eyeY, 0);
      this.camera.rotation.set(0, 0, 0);
      if (this.params.tutorial) this.startTutorial();
      else if (this.params.autoplay) this.startGame();
      else this.setState('menu');
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
    if (this.audio.ok) this.audio.startMusic(tl, this.audio.ctx.currentTime + 0.1);
    this.audio.level = 0;
  }

  // ---------------- welcome & calibration ----------------
  showWelcome() {
    const has = !!this.store.data.calib;
    this.placeReach(this.welcome);
    this.welcome.set((c, p) => S.drawWelcome(c, p, has), S.welcomeButtons(has, () => this.beginCalibration(false), () => this.beginCalibration(true)));
  }
  beginCalibration(reuse) {
    const s = this.store.settings, c = this.store.data.calib;
    const eye = this.camera.position.y;
    this.alignToHead();
    if (s.stance === 'sit') this.body.configure({ eyeY: eye, seated: true, stature: c?.stature || 1.7, gripSpan: c?.span || 0 });
    else this.body.configure({ eyeY: eye, seated: false, stature: eye / 0.936, gripSpan: reuse && c ? c.span : 0 });
    this.coach.setBody(this.body);
    if (reuse && c) { this.saveCalib(c.span || 0); this.afterCalibration(); return; }
    this.tpose = { hold: 0, best: 0 };
    this.setState('tpose');
  }
  showTpose() {
    this.placeFar(this.tposeBoard, this.body.eyeY + 0.66, -2.3);
    this.tposeBoard.set((c, p) => S.drawTpose(c, p, 0));
    this.placeReach(this.tposeSkip, { x: 0.26, y: this.body.shoulderY - 0.4, z: -0.4 });
    this.tposeSkip.set(null, [{ x: 12, y: 12, w: 488, h: 159, style: 'ghost', label: 'SKIP', sub: '標準サイズで遊ぶ', font: 46, onPress: () => this.finishTpose(0) }]);
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
    if (Math.abs(f - (tp.drawn || 0)) > 0.04 || (f === 0) !== ((tp.drawn || 0) === 0)) { tp.drawn = f; this.tposeBoard.set((c, p) => S.drawTpose(c, p, f)); }
    if (tp.hold >= 2) { this.audio.chord(3); this.hands.haptic('L', 0.7, 80); this.hands.haptic('R', 0.7, 80); this.finishTpose(tp.best); }
  }
  finishTpose(span) {
    const prev = this.store.data.calib || {};
    this.body.configure({ gripSpan: span || prev.span || 0 });
    this.saveCalib(span || prev.span || 0);
    this.afterCalibration();
  }
  afterCalibration() {
    this.coach.setBody(this.body);
    if (!this.store.data.tutorialDone) this.startTutorial();
    else this.setState('menu');
  }
  saveCalib(span) {
    const b = this.body, prev = this.store.data.calib || {};
    const seated = this.store.settings.stance === 'sit';
    const stature = span > 0.9 ? clamp(span + 0.2, 1.3, 2.1) : seated ? prev.stature || 1.7 : b.stature;
    this.body.configure({ stature, gripSpan: span });
    this.store.setCalib({ eye: seated ? prev.eye || 1.58 : b.eyeY, sitEye: seated ? b.eyeY : prev.sitEye, stature, span, date: Date.now() });
  }

  // ---------------- menu ----------------
  showMenu() {
    const st = this.store, s = st.settings;
    const tot = st.totals();
    this.placeFar(this.logo, this.body.eyeY + 0.5, -3.3, 0);
    this.logo.set((c, p) => S.drawLogo(c, p, { best: st.data.best[s.mode] || 0, streak: st.streak(), minutes: tot.minutes }));
    this.placeReach(this.menu, { x: -0.06 });
    const redrawAll = () => { this.menu.redraw(); this.settingsPanel.set((c, p) => S.drawSettings(c, p, this), S.settingsButtons(this, setOpt)); this.logo.redraw(); };
    const setOpt = (k, v) => { st.setSetting(k, v); this.applySettings(); redrawAll(); };
    this.menu.set((c, p) => S.drawMenu(c, p, this), S.menuButtons(this, (k) => { st.setSetting('mode', k); redrawAll(); }, () => this.startGame(), () => this.startTutorial(), () => this.setState('welcome')));
    this.placeReach(this.settingsPanel, { x: 0.47, z: this.xr ? -0.33 : -0.62, yaw: -0.62 });
    this.settingsPanel.set((c, p) => S.drawSettings(c, p, this), S.settingsButtons(this, setOpt));
  }
  applySettings() {
    const s = this.store.settings, c = this.store.data.calib;
    this.audio.setVolume(s.volume);
    const seated = s.stance === 'sit';
    if (seated !== this.body.seated) {
      const eye = seated ? (c?.sitEye || this.camera.position.y) : (c?.eye || this.camera.position.y);
      this.body.configure({ eyeY: this.xr ? this.camera.position.y : eye, seated });
    }
    this.body.configure({ backCare: s.backCare });
    this.coach.setBody(this.body);
    this.world.setLaneWidth(this.laneW, !seated);
  }

  // ---------------- tutorial ----------------
  startTutorial() {
    this.applySettings();
    if (this.xr) { this.body.configure({ eyeY: Math.max(0.9, this.camera.position.y) }); this.coach.setBody(this.body); }
    this.clearPlay();
    this.hideAllPanels();
    this.initRun();
    this.state = 'tutorial';
    this.headLaneX = 0; this.coachLane = 0;
    this.approach = 2.6;
    this.world.setPalette('dawn', 2);
    this.tutorial.start();
    this.placeReach(this.tutCtl, { x: 0.3, y: this.body.shoulderY - 0.42, z: -0.38 });
    this.tutCtl.set(null, [{ x: 10, y: 10, w: 492, h: 151, style: 'ghost', label: 'SKIP', sub: 'チュートリアルを終える', font: 44, onPress: () => this.endTutorial() }]);
    this.emit('state', 'tutorial');
  }
  showTutorialCard(info) {
    this.placeFar(this.tutCard, this.body.eyeY + 0.42, -2.3, 0);
    this.tutCard.t0 = performance.now();
    this.tutCard.set((c, p) => S.drawTutorialCard(c, p, info));
    this.tutorialInfo = info;
  }
  showTutorialDone() {
    this.tutCtl.visible = false;
    this.placeReach(this.tutDone, { y: this.body.shoulderY - 0.1 });
    this.tutDone.set(null, [
      { x: 14, y: 14, w: 560, h: 210, style: 'primary', label: 'PLAY QUICK', icon: 'bolt', font: 52, onPress: () => { this.store.setSetting('mode', 'quick'); this.startGame(); } },
      { x: 590, y: 14, w: 420, h: 210, style: 'ghost', label: 'MENU', icon: 'grid', font: 48, onPress: () => this.endTutorial() },
    ]);
  }
  endTutorial() {
    this.store.setTutorialDone();
    this.clearPlay();
    this.world.setPalette('lake', 2);
    this.setState('menu');
  }

  // ---------------- play ----------------
  clearPlay() {
    for (const e of this.entities) e.cancel();
    this.entities = [];
    this.queue = [];
    for (const t of [...this.weaving]) this.weave(false, t);
    this.audio.weave(false);
  }
  initRun() {
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.fever = false; this.assist = 0; this.recent = [];
    this.world.feverTarget = 0;
    this.stats = this.freshStats();
    this.hands.L.travel = this.hands.R.travel = 0;
    this.t = 0;
    this.orbsSeen = 0;
  }
  startGame() {
    const s = this.store.settings, p = this.params;
    this.applySettings();
    if (this.xr) { this.body.configure({ eyeY: Math.max(0.9, this.camera.position.y) }); this.recenterSoft(); }
    this.coach.setBody(this.body);
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
    this.headLaneX = 0; this.coachLane = 0;
    this.initRun();
    this.curSeg = null;
    this.cooling = false; this.endlessStopped = false;
    this.ended = false;
    const t0 = -2.2;
    this.clock.start(t0, { speed: p.speed || 1, useAudio: !p.nosound });
    if (this.audio.ok) {
      this.audio.startMusic(tl, this.clock.songStartSched);
      if (!p.nosound) this.audio.countIn(this.clock.songStartSched, tl.segs[0].beatSec, 4);
    }
    this.t = t0;
    this.state = 'play';
    const y = this.body.eyeY;
    this.placeArc(this.hudScore, 0.36, 3.2, y + 0.6);
    this.placeArc(this.hudCombo, 0, 3.3, y + 0.68);
    this.placeArc(this.hudStage, -0.36, 3.2, y + 0.6);
    this.hudDirty = { score: true, combo: true, stage: true };
    this.drawHud(true);
    this.emit('state', 'play');
    this.showHint({ en: 'GET READY', text: 'コーチのまねをして体を動かそう', sub: this.hands.anyHandTracking ? '一時停止は左腰の ⏸ を長押し' : '一時停止は B / Y ボタン', icon: 'coach' }, 2.6);
  }
  recenterSoft() {
    const yawNow = (() => { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); return Math.atan2(-f.x, -f.z); })();
    let d = yawNow - this.stageRoot.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    const local = this.stageRoot.worldToLocal(this.camera.position.clone());
    if (Math.abs(d) > 0.5 || Math.hypot(local.x, local.z) > 0.5) this.alignToHead();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.hint.visible = false;
    this.title.visible = false;
    this.clock.pause();
    this.audio.weave(false);
    this.audio.suspend();
    this.placeReach(this.pausePanel, { x: this.head.x - (this.headLaneX || 0) });
    const canCool = !this.cooling && this.curSeg && this.curSeg.key !== 'cool';
    this.pausePanel.set((c, p) => S.drawPause(c, p, this), S.pauseButtons(canCool, {
      resume: () => this.resume(),
      cool: () => (canCool ? this.toCooldown() : this.finish(true)),
      recenter: () => { this.recenter(); this.resume(); },
      quit: () => this.quitToMenu(),
    }));
    this.emit('state', 'paused');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.pausePanel.visible = false;
    this.state = 'resuming';
    this.resumeAt = performance.now() + 2500;
    this.resumeN = null;
  }
  _doResume() { this.audio.resume(); this.clock.resume(); this.state = 'play'; }
  toCooldown() {
    this.cooling = true;
    const tcut = this.tl.cutAfter(this.t, 1);
    this.queue = this.queue.filter((e) => e.t < tcut - 0.05);
    for (const e of this.entities) if (e.ev.t >= tcut - 0.05 && !e.dead) e.cancel();
    this.entities = this.entities.filter((e) => !e.dead);
    this.tl.add('cool', 0, { bars: coolBars(this.mode === 'quick', this.store.settings.backCare) });
    if (this.mode === 'endless') this.endlessStopped = true;
    this.resume();
  }
  quitToMenu() {
    this.audio.resume();
    this.clearPlay();
    this.startAmbient();
    this.setState('menu');
  }

  showHint(info, dur = 3.8) {
    this.hintUntil = performance.now() + dur * 1000;
    this.placeFar(this.hint, this.body.eyeY + 0.3, -2.5);
    this.hint.t0 = performance.now();
    this.hint.set((c, p) => S.drawHint(c, p, info));
  }
  showTitle(seg) {
    this.titleUntil = performance.now() + 3200;
    this.titleStart = performance.now();
    this.placeFar(this.title, this.body.eyeY - 0.28, -3.4, 0);
    this.title.set((c, p) => S.drawTitle(c, p, seg));
  }

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
      if (seg.key === 'cool') this.setFever(false);
      this.world.setPalette(seg.stage.palette, 3);
      this.showTitle(seg);
      this.hudDirty.stage = true;
    }
  }
  spawn(t) {
    const q = this.queue;
    while (q.length && q[0].tSpawn <= t) {
      const ev = q.shift();
      if (ev.type === 'caption') { this.showHint(ev, ev.dur); continue; }
      if (ev.optional && this.assist >= 1) continue;
      if (t > ev.t + 0.2 && ev.type !== 'thread' && ev.type !== 'gaze') continue;
      const Cls = ENTITY[ev.type];
      if (!Cls) continue;
      this.approach = ev.seg.stage.approach * (1 + this.assist * 0.12);
      if (ev.type === 'orb') this.orbsSeen++;
      this.entities.push(new Cls(this, ev));
    }
  }

  // ---------------- scoring ----------------
  scoreTick(points, ev) {
    if (this.state !== 'play') return;
    this.score += points * this.multiplier * (ev.seg && ev.seg.key === 'cool' ? 0.6 : 1);
    this.hudDirty.score = true;
  }
  get multiplier() { return (1 + Math.min(this.combo, 40) / 40) * (this.fever ? 1.5 : 1); }

  judge(kind, j, pos, ev, hand = null, extra = {}) {
    const st = this.stats, gentle = kind === 'gaze' || ev.long, tut = this.state === 'tutorial';
    const col = HAND_COLORS[ev.hand] || (kind === 'wall' || kind === 'bar' ? GREEN : HAND_COLORS.A);
    st.total++;
    st[j]++;
    if (kind === 'wall') this.coachLane = ev.free * ev.laneW;
    if (j === 'miss') {
      if (!gentle && !tut) { this.combo = 0; this.setFever(false); }
      const blocked = kind === 'wall' || kind === 'bar';
      this.fx.popup(blocked ? 'bump' : 'miss', pos, blocked ? 1.3 : 0.8);
      this.audio.miss();
      if (blocked) { this.hands.haptic('L', 0.8, 120); this.hands.haptic('R', 0.8, 120); }
    } else {
      st.hit++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const pts = JUDGE_POINTS[j] * (kind === 'thread' ? 2 : kind === 'gate' && !ev.long ? 1.5 : 1);
      if (!tut) this.score += pts * this.multiplier;
      this.audio.hit(j, this.combo);
      const big = kind !== 'orb';
      this.fx.flash(pos, col, big ? 0.5 : 0.36);
      this.fx.burst(pos, col, big ? 56 : 32, big ? 1.5 : 1.15, 0.026, 0.65);
      this.fx.ring(pos, col, big ? 0.15 : 0.1);
      const label = kind === 'wall' ? 'step' : kind === 'bar' ? 'squat' : kind === 'thread' && j === 'perfect' ? 'weave' : gentle ? 'clear' : j;
      this.fx.popup(label, pos.clone().add(new THREE.Vector3(0, 0.12, 0)), big ? 1.2 : 0.8);
      if (hand) this.hands.haptic(hand.side, j === 'perfect' ? 0.9 : 0.6, j === 'perfect' ? 60 : 40);
      if (kind === 'wall' || kind === 'bar') this.audio.whoosh(0.18);
      if (kind === 'thread' || kind === 'gate') this.audio.chord(j === 'perfect' ? 4 : 3, 0.16);
      if (!tut && !this.fever && this.combo >= 30 && !(this.curSeg && this.curSeg.key === 'cool')) this.setFever(true);
      if (!tut && this.combo % 50 === 0) {
        this.fx.popupText(`${this.combo} COMBO!`, '#ffd166', new THREE.Vector3(this.head.x, this.body.eyeY - 0.05, -1.7), 1.8);
        this.audio.chord(5, 0.18);
        this.world.feverTarget = Math.max(this.world.feverTarget, 0.6);
        if (!this.fever) setTimeout(() => { if (!this.fever) this.world.feverTarget = 0; }, 1500);
      }
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
    if (!gentle && !tut) {
      this.recent.push(j === 'miss' ? 0 : 1);
      if (this.recent.length > 16) this.recent.shift();
      if (this.recent.length >= 12) {
        const missRate = 1 - this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
        if (missRate > 0.4 && this.assist < 2) { this.assist++; this.recent = this.recent.slice(-6); }
        else if (missRate < 0.08 && this.assist > 0) { this.assist--; this.recent = this.recent.slice(-6); }
      }
    }
    this.hudDirty && (this.hudDirty.score = this.hudDirty.combo = true);
    this.emit('judge', { kind, j });
  }
  setFever(on) {
    if (on === this.fever) return;
    this.fever = on;
    this.world.feverTarget = on ? 1 : 0;
    if (on) { this.fx.popup('fever', new THREE.Vector3(this.head.x, this.body.eyeY + 0.02, -1.8), 2); this.audio.chord(5, 0.2); }
    if (this.hudDirty) this.hudDirty.combo = true;
  }
  weave(on, thread) {
    if (on) this.weaving.add(thread); else this.weaving.delete(thread);
    const seg = this.curSeg;
    const root = seg && seg.stage ? seg.stage.scale[0] - 12 : 69;
    this.audio.weave(this.weaving.size > 0, root);
  }

  // ---------------- HUD ----------------
  drawHud(force = false) {
    const now = performance.now(), d = this.hudDirty;
    if (!d) return;
    if ((force || d.score) && (force || now - (this.hudScoreAt || 0) > 110)) { d.score = false; this.hudScoreAt = now; this.hudScore.set((c, p) => S.drawHudScore(c, p, this)); }
    if (force || d.combo) { d.combo = false; this.hudCombo.set((c, p) => S.drawHudCombo(c, p, this)); }
    if ((force || d.stage) && (force || now - (this.hudStageAt || 0) > 480)) { d.stage = false; this.hudStageAt = now; this.hudStage.set((c, p) => S.drawHudStage(c, p, this)); }
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
    this.placeFar(this.resultBoard, this.body.eyeY - 0.02, -1.8, this.head.x);
    this.countUp = { start: performance.now(), dur: 1500, last: 0 };
    this.resultBoard.set((c, p) => S.drawResults(c, p, r, 0));
    this.placeReach(this.resultBtns, { x: this.head.x - (this.headLaneX || 0), y: this.body.shoulderY - 0.22, z: this.xr ? -0.45 : -0.8 });
    this.resultBtns.set(null, S.resultButtons({ retry: () => this.startGame(), menu: () => this.setState('menu') }));
  }

  // ---------------- coach ----------------
  coachDemo(t) {
    const D = { L: null, R: null, laneX: this.coachLane, drop: 0 };
    let show = false;
    const teach = this.state === 'tutorial' || (this.curSeg && this.curSeg.key === 'warm') || this.orbsSeen < 24;
    const orbWhen = { L: Infinity, R: Infinity };
    for (const e of this.entities) {
      if (e.dead) continue;
      const ev = e.ev;
      if (ev.type === 'gate' && t > ev.t - this.approach * 0.9 && (t < ev.t1 + 0.2 || ev.wait) && !e.done) {
        for (const h of ev.hands) D[h] = ev.targets[h];
        show = true;
      } else if (ev.type === 'thread' && t > ev.t - (ev.lead || 1.5) && e.phase !== 'done') {
        const u = ev.wait ? Math.min(1, e.u + 0.06) : clamp((t + 0.15 - ev.t) / (ev.t1 - ev.t), 0, 1);
        const p = ev.path(u, new THREE.Vector3());
        if (ev.hand === 'A') { D.L = p.clone().add(new THREE.Vector3(-0.05, 0, 0)); D.R = p.clone().add(new THREE.Vector3(0.05, 0, 0)); }
        else D[ev.hand] = p;
        show = true;
      } else if (ev.type === 'wall' && (e.waiting || (ev.t - t < 1.8 && ev.t - t > -0.3))) {
        D.laneX = ev.free * ev.laneW; show = true;
      } else if (ev.type === 'bar' && (e.waiting || (ev.t - t < 1.3 && ev.t - t > -0.3))) {
        D.drop = ev.depth; show = true;
      } else if (ev.type === 'orb' && teach && e.state === 'fly' && (ev.wait || (ev.t - t < 1.0 && ev.t - t > -0.15))) {
        for (const h of ev.hand === 'A' ? ['R'] : [ev.hand]) if (ev.t < orbWhen[h]) { orbWhen[h] = ev.t; D[h] = ev.pos; }
        show = true;
      }
    }
    return { D, show };
  }
  updateCoach(dt) {
    const on = this.store.settings.coach !== false;
    let visible = false;
    if (this.state === 'tpose') {
      const b = this.body;
      this.coach.demo({ L: new THREE.Vector3(-(b.shoulderHalf + b.reach * 0.95), b.shoulderY, -0.03), R: new THREE.Vector3(b.shoulderHalf + b.reach * 0.95, b.shoulderY, -0.03), laneX: 0 });
      visible = true;
    } else if (this.state === 'play' || this.state === 'tutorial' || this.state === 'resuming' || this.state === 'paused') {
      const { D, show } = this.coachDemo(this.t);
      if (show) this.coachHold = 1.2; else this.coachHold -= dt;
      this.coach.demo(D);
      visible = on && this.coachHold > 0 && this.state !== 'paused';
      if (this.state === 'tutorial') visible = true;
    }
    this.coach.projector.motes.material.uniforms.px.value = this.pxScale;
    this.coach.update(dt, { visible });
  }

  // ---------------- frame ----------------
  update(dt) {
    const cam = this.camera;
    // while paused, hide what was flying so the menu is not cluttered (it comes back for the countdown)
    this.playRoot.visible = this.state !== 'paused';
    if (this.xr && this.pendingAlign > 0 && --this.pendingAlign === 0) {
      this.alignToHead();
      this.body.configure({ eyeY: Math.max(0.9, cam.position.y) });
      this.coach.setBody(this.body);
      if (this.state === 'welcome') this.showWelcome();
    }
    uTime.value += dt;
    // head & hands in stage space
    this.headPrev.copy(this.head);
    const headObj = this.xr ? cam : this.headObj || cam;
    this.stageRoot.worldToLocal(this.head.copy(headObj.position));
    this.stageRoot.worldToLocal(this.eyeLocal.copy(cam.position));
    const q = new THREE.Quaternion().copy(this.stageRoot.quaternion).invert().multiply(headObj.quaternion);
    this.headDir.set(0, 0, -1).applyQuaternion(q);
    const toLocal = (w, out) => this.stageRoot.worldToLocal(out.copy(w));
    this.hands.update(dt, toLocal);
    const active = this.state !== 'idle';
    for (const k of ['L', 'R']) this.handVis[k].update(dt, this.hands[k], this.eyeLocal, toLocal, active);
    for (const k of ['L', 'R']) {
      const h = this.hands[k];
      if (h.pressed(4) || h.pressed(5)) { if (this.state === 'play') this.pause(); else if (this.state === 'paused') this.resume(); }
    }
    this.ui.update(dt);
    const px = this.xr ? this.pxFromXR() : this.pxFromCanvas();
    this.pxScale = px;

    let beatPhase = 0, level = 0, approachSpeed = 2;
    const st = this.state;
    if (st === 'tpose') this.updateTpose(dt);
    if (st === 'resuming') {
      if (performance.now() >= this.resumeAt) this._doResume();
      else { const n = Math.ceil(((this.resumeAt - performance.now()) / 1000) * 1.2); if (n !== this.resumeN) { this.resumeN = n; this.showHint({ en: String(Math.max(1, n)), text: 'まもなく再開します', sub: '', icon: 'play' }, 0.9); } }
    }
    if (this.state === 'tutorial') {
      this.tutorial.update(dt);
      this.t = this.tutorial.t;
      for (const e of this.entities) if (!e.dead) e.update(this.t, dt);
      this.entities = this.entities.filter((e) => !e.dead);
      const now = this.audio.ok ? this.audio.ctx.currentTime : performance.now() / 1000;
      beatPhase = (now / (60 / STAGES.menu.bpm)) % 1;
      this.beatPulse = Math.pow(1 - beatPhase, 4) * 0.5;
      level = -1;
    } else if (this.state === 'play') {
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
      const lvl = this.fever ? 4 : this.combo >= 18 ? 3 : this.combo >= 8 ? 2 : 1;
      this.audio.level = lvl;
      level = seg.stage.level < 0 ? -1 : clamp(lvl, seg.stage.level, seg.stage.cap);
      approachSpeed = 14 / seg.stage.approach;
      if (t > 0) {
        this.stats.playSec += gdt;
        const hs = (this.hands.L.speed + this.hands.R.speed) / 2;
        const vy = Math.abs(this.head.y - this.headPrev.y) / Math.max(dt, 1e-3), vx = Math.abs(this.head.x - this.headPrev.x) / Math.max(dt, 1e-3);
        const met = clamp(2.1 + 1.9 * Math.min(hs, 2.5) + 2.5 * Math.min(vy, 0.6) + 1.5 * Math.min(vx, 0.8), 1.8, 7.5);
        this.stats.kcal += met * (this.store.settings.weight || 65) * gdt / 3600;
      }
      this.headLaneX = this.head.x;
      if (Math.floor(t * 2) !== this.hudSec) { this.hudSec = Math.floor(t * 2); this.hudDirty.stage = true; this.hudDirty.score = true; }
      this.drawHud();
      this.pauseOrb.visible = this.xr;
      this.pauseOrb.position.set(this.head.x - 0.5, this.body.shoulderY - 0.5, this.head.z - 0.08);
      this.pauseOrb.lookAt(this.stageRoot.localToWorld(this.head.clone()));
      if (!this.ended && t > this.tl.end + 0.6 && (this.mode !== 'endless' || this.endlessStopped)) this.finish();
    } else if (this.state !== 'paused' && this.state !== 'resuming') {
      const now = this.audio.ok ? this.audio.ctx.currentTime : performance.now() / 1000;
      beatPhase = (now / (60 / STAGES.menu.bpm)) % 1;
      level = -1;
      this.beatPulse = Math.pow(1 - beatPhase, 4) * 0.4;
    }
    uBeat.value = this.beatPulse;
    this.updateCoach(dt);
    if (this.audio.ok) this.audio.update();
    // timed panels and entrance animations
    const now = performance.now();
    if (this.hint.visible && now > this.hintUntil) this.hint.visible = false;
    if (this.title.visible) {
      const k = (now - this.titleStart) / 1000;
      if (now > this.titleUntil) this.title.visible = false;
      else this.title.mesh.material.opacity = Math.min(1, k * 2.5, (this.titleUntil - now) / 600);
    }
    for (const p of this.allPanels) if (p !== this.title) p.tick(now);
    if (this.title.visible) { const k = Math.min(1, (now - this.titleStart) / 500); this.title.mesh.scale.setScalar(0.9 + 0.1 * (1 - Math.pow(1 - k, 3))); }
    if (this.hint.visible) this.hint.mesh.position.y = this.body.eyeY + 0.3 - 0.04 * (1 - Math.min(1, (now - this.hint.t0) / 260));
    if (this.state === 'results' && this.countUp) {
      const k = Math.min(1, (now - this.countUp.start) / this.countUp.dur);
      if (k < 1 || this.countUp.last < 1) {
        if (now - (this.countUp.at || 0) > 45 || k >= 1) {
          this.countUp.at = now; this.countUp.last = k;
          const e = 1 - Math.pow(1 - k, 3);
          this.resultBoard.set((c, p) => S.drawResults(c, p, this.lastResult, this.lastResult.score * e));
        }
      }
    }
    this.world.update(dt, { beat: beatPhase, level, px, approachSpeed });
    this.fx.update(dt, px);
    assets();
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
