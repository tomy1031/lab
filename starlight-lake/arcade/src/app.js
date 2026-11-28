import * as THREE from 'three';
import { Input } from '../../src/input.js';
import { UIManager, Panel } from '../../src/ui.js';
import { Effects } from '../../src/fx.js';
import { sph } from '../../src/util.js';
import { DEG } from '../../src/config.js';
import { ArcadeSound } from './sound.js';
import { ArcadeWorld } from './world.js';
import { Progress, GAMES, GAME_ORDER } from './progress.js';
import { Screens, ArcadeHud } from './screens.js';
import { NUM_FONT, POP_FONT } from './fonts.js';
import { BubblePop } from './games/bubble.js';
import { RingRush } from './games/rings.js';
import { FlashCount } from './games/flash.js';
import { DepthOrder } from './games/depth.js';
import { SideCatch } from './games/catch.js';

const GAME_CLASSES = { bubble: BubblePop, rings: RingRush, flash: FlashCount, depth: DepthOrder, catch: SideCatch };
const _v = new THREE.Vector3();

function bandsFor(ppd) {
  const b = [1.5, 3, 6, 9].filter((sf) => sf <= ppd * 0.3);
  return b.length >= 2 ? b : [1.5, 3];
}

/** EYE GYM: one-minute games for the eyes, with scores, ranks and levels that grow. */
export class ArcadeApp {
  constructor(container) {
    this.progress = new Progress();
    this.settings = this.progress.settings;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 2000);
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);
    this.head = this.camera.position;
    this.headQuat = this.camera.quaternion;
    this.view = { kind: 'preview', ppd: 14, field: { az: 30, el: 18 }, sfBands: [1.5, 3, 6], stereo: false, ipd: 0.063 };
    this.computeDesktopView();

    this.sound = new ArcadeSound();
    this.audio = this.sound;                 // the shared Input calls app.audio
    this.sound.volume = this.settings.volume; this.sound.music = this.settings.music;
    this.world = new ArcadeWorld(this);
    this.scene.add(this.world.group, this.world.sky);
    this.fx = new Effects(this);
    this.scene.add(this.fx.group);
    this.ui = new UIManager(this);
    this.stage = new THREE.Object3D(); this.stageYaw = 0; this.scene.add(this.stage);
    this.screens = new Screens(this);
    this.hud = new ArcadeHud(this);
    this.handStyle = { solid: true, color: [1.0, 0.82, 0.9] };    // soft pink gloves in daylight
    this.input = new Input(this);
    this.mode = 'idle';
    this.game = null;
    this.paused = false;
    this.timeScale = 1;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.previewYaw = 0;
    this.onExitHooks = [];
    window.addEventListener('resize', () => this.onResize());
    r.xr.addEventListener('sessionstart', () => this.onXRStart());
    r.xr.addEventListener('sessionend', () => this.onXREnd());
    document.fonts?.addEventListener?.('loadingdone', () => this.ui.redrawAll());
    r.setAnimationLoop(() => this.tick());
  }

  // ---------- views ----------
  computeDesktopView() {
    const c = this.camera;
    const H = this.renderer?.getDrawingBufferSize(new THREE.Vector2()).y ?? window.innerHeight;
    const ppd = (H / 2) / Math.tan((c.fov * DEG) / 2) * DEG;
    this.view.ppd = ppd;
    this.view.sfBands = bandsFor(ppd);
  }
  computeXRView() {
    const cam = this.renderer.xr.getCamera();
    if (!cam.cameras.length) return false;
    const c0 = cam.cameras[0], e = c0.projectionMatrix.elements, W = c0.viewport.z;
    if (!W) return false;
    const ppd = W / ((1 + e[8]) / e[0] - (e[8] - 1) / e[0]) * DEG;
    const ipd = cam.cameras.length > 1 ? cam.cameras[0].position.distanceTo(cam.cameras[1].position) : 0.063;
    this.view = { kind: 'vr', ppd, field: { az: 32, el: 18 }, sfBands: bandsFor(ppd), stereo: true, ipd: ipd > 0.04 && ipd < 0.08 ? ipd : 0.063 };
    return true;
  }
  onResize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.computeDesktopView();
  }
  available() { return GAME_ORDER.filter((id) => this.view.stereo || id !== 'depth'); }

  // ---------- head & stage (same contract as Starlight Lake, so shared UI and input work) ----------
  headYaw() { _v.set(0, 0, -1).applyQuaternion(this.headQuat); return Math.atan2(-_v.x, -_v.z); }
  recenter() { this.stage.position.copy(this.head); this.stageYaw = this.headYaw(); this.stage.rotation.set(0, this.stageYaw, 0); }
  stagePoint(az, el, dist, out = new THREE.Vector3()) {
    sph(az, el, dist, out);
    out.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.stageYaw);
    return out.add(this.stage.position);
  }
  uiPlacement(dist, el) { return { dist, el }; }
  say(text) { this.banner(text, '#3a4466', 0.06, 1.8, -12); }
  banner(text, color = '#ff4f9a', size = 0.13, life = 1.6, el = 10) {
    this.fx.text(text, this.stagePoint(0, el, 1.8), { color, size, life, font: NUM_FONT, glow: 'rgba(255,255,255,0.95)', rise: 0.12 });
  }

  // ---------- input routing ----------
  onSelectStart(p) { if (this.mode === 'play' && !this.paused) this.game.onSelectStart(p); }
  onSelectEnd(p) { if (this.mode === 'play' && !this.paused) this.game.onSelectEnd(p); }
  onDirection(dir, p) { if (this.mode === 'play' && !this.paused) this.game.onDirection(dir, p); }
  pointerTarget(p) { return this.mode === 'play' && !this.paused ? this.game.pointerTarget(p) : null; }
  onConfirm() {}
  togglePause() {
    if (this.mode !== 'play') return;
    this.paused = !this.paused;
    if (this.paused) { this.screens.pause(); this.sound.setMode('quiet'); }
    else { this.screens.close(); this.sound.setMode('play'); }
  }
  cycleVolume() {
    const steps = [0, 0.4, 0.8, 1];
    const i = steps.findIndex((v) => Math.abs(v - this.settings.volume) < 0.05);
    this.settings.volume = steps[(i + 1) % steps.length];
    this.sound.setVolume(this.settings.volume);
    this.progress.save();
  }

  // ---------- flow ----------
  menu() {
    this.recenter();
    this.mode = 'menu';
    this.sound.setMode('hub');
    this.screens.hub();
  }
  startDaily() {
    this.dailyList = this.progress.daily(this.available());
    this.dailyIndex = 0;
    this.intro(this.dailyList[0], { daily: true });
  }
  nextDaily() {
    this.dailyIndex++;
    if (this.dailyIndex < this.dailyList.length) this.intro(this.dailyList[this.dailyIndex], { daily: true });
    else this.dailyDone();
  }
  dailyDone() { this.sound.stamp(); this.fx.burst(this.stagePoint(0, 8, 1.6), { count: 120, color: [1, 0.6, 0.8], speed: 1.4, size: 0.02, life: 1.6 }); this.screens.dailyDone(this.lastStamped); this.mode = 'menu'; }

  intro(id, { daily }) {
    this.recenter();
    this.mode = 'intro';
    this.pendingId = id; this.pendingDaily = daily;
    this.world.setAccent(parseInt(GAMES[id].color.slice(1), 16));
    this.sound.setMode('hub');
    this.screens.intro(id, { daily, index: this.dailyIndex || 0, count: this.dailyList?.length || 3 });
  }

  countdown() {
    this.screens.close();
    this.recenter();
    this.mode = 'countdown';
    this.sound.setMode('quiet');
    const G = GAME_CLASSES[this.pendingId];
    this.game = new G(this);
    this.cd = 3.6; this.cdShown = 4;
  }

  beginPlay() {
    this.mode = 'play';
    this.game.start();
    this.sound.setMode('play');
    this.hudDirty = true;
  }

  finishGame() {
    this.mode = 'finish';
    this.finishT = 1.5;
    this.sound.whistle();
    this.sound.setMode('quiet');
    this.banner('FINISH!', '#3fb8ff', 0.2, 1.4, 6);
  }

  showResult() {
    const id = this.pendingId;
    const res = this.game.stop();
    this.game = null;
    this.hud.update(null);
    const daily = this.pendingDaily;
    const last = daily && this.dailyIndex >= this.dailyList.length - 1;
    const rec = this.progress.record(id, { ...res, dailyCount: this.dailyList?.length }, { daily });
    this.lastStamped = rec.stamped;
    this.mode = 'result';
    if (rec.levelUp || rec.newBest) setTimeout(() => this.sound.levelUp(), 1300);
    if (rec.rank.r === 'S' || rec.newBest) setTimeout(() => this.fx.burst(this.stagePoint(0, 10, 1.6), { count: 90, color: [1, 0.8, 0.4], speed: 1.2, size: 0.02, life: 1.4 }), 1300);
    this.screens.result(id, res, rec, { daily, last });
    for (const f of this.onRecord || []) f();
  }

  quitGame() {
    this.paused = false;
    if (this.game) { this.game.stop(); this.game = null; }
    this.hud.update(null);
    this.menu();
  }

  // ---------- modes ----------
  async enterVR() {
    this.sound.init();
    const q = this.settings.quality, highRes = q === 'high' || (q === 'auto' && !/Quest 2|Quest\b(?! [3P])/.test(navigator.userAgent));
    this.renderer.xr.setFramebufferScaleFactor(highRes ? 1.3 : 1.0);
    const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await this.renderer.xr.setSession(s);
  }
  onXRStart() {
    try { this.renderer.xr.setFoveation(0.25); } catch (e) { /* optional */ }
    this.view.kind = 'vr'; this.needXRView = true; this.xrFrames = 0;
    document.body.classList.add('in-xr');
  }
  onXREnd() {
    if (this.game) { this.game.stop(); this.game = null; }
    this.toPreview();
    document.body.classList.remove('in-xr');
  }
  startDesktop() {
    this.sound.init();
    this.view.kind = 'desktop'; this.view.stereo = false;
    this.computeDesktopView();
    this.input.look.yaw = this.headYaw(); this.input.look.pitch = 0;
    this.menu();
  }
  toPreview() {
    this.screens.close(); this.hud.update(null);
    this.mode = 'idle'; this.paused = false;
    this.view.kind = 'preview'; this.view.stereo = false;
    this.computeDesktopView();
    for (const f of this.onExitHooks) f();
  }
  exit() { const s = this.renderer.xr.getSession(); if (s) s.end(); else { if (this.game) { this.game.stop(); this.game = null; } this.toPreview(); } }

  /** Fingertips and controller tips, for games you can touch. */
  touchPoints() {
    const pts = [];
    if (!this.renderer.xr.isPresenting) return pts;
    for (const p of this.input.pointers) {
      if (p.kind !== 'xr' || !p.active) continue;
      if (p.isHand) { const tip = p.hand.joints?.['index-finger-tip']; if (tip?.visible) pts.push({ pos: tip.position, pointer: p }); }
      else pts.push({ pos: p.ctrl.position, pointer: p });
    }
    return pts;
  }

  // ---------- loop ----------
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta()) * this.timeScale;
    this.time += dt;
    const presenting = this.renderer.xr.isPresenting;
    if (presenting && this.needXRView && ++this.xrFrames > 3 && this.computeXRView()) { this.needXRView = false; this.menu(); }
    if (!presenting) {
      if (this.view.kind === 'preview') this.camera.quaternion.setFromEuler(new THREE.Euler(0.04, this.previewYaw + Math.sin(this.time * 0.05) * 0.4, 0, 'YXZ'));
      else this.camera.quaternion.setFromEuler(new THREE.Euler(this.input.look.pitch, this.input.look.yaw, 0, 'YXZ'));
      this.camera.position.set(0, 1.6, 0);
    }
    this.input.update(dt);
    if (!this.paused) {
      if (this.mode === 'countdown') {
        this.cd -= dt;
        const n = Math.ceil(this.cd - 0.6);
        if (n !== this.cdShown) {
          this.cdShown = n;
          if (n >= 1 && n <= 3) { this.banner(String(n), '#3fb8ff', 0.3, 0.8, 4); this.sound.beep(false); }
          else if (n === 0) { this.banner('GO!', '#ff4f9a', 0.3, 0.9, 4); this.sound.beep(true); }
        }
        if (this.cd <= 0) this.beginPlay();
      } else if (this.mode === 'play') {
        this.game.update(dt);
        this.game.touch(this.touchPoints());
        const left = this.game.remaining();
        if (left <= 5 && Math.ceil(left) !== this.lastTick) { this.lastTick = Math.ceil(left); if (left > 0) this.sound.beep(false); }
        if (left <= 0) this.finishGame();
      } else if (this.mode === 'finish') {
        this.game.update(dt * 0.3);
        this.finishT -= dt;
        if (this.finishT <= 0) this.showResult();
      }
    }
    if (this.game && (this.mode === 'play' || this.mode === 'finish')) this.hud.update(this.game);
    const sp = this.screens.panel;
    if (sp?.animUntil && performance.now() < sp.animUntil + 50) sp.redraw();
    this.world.update(this.time, dt, this.head);
    this.fx.update(dt, this.head, this.view.ppd);
    _v.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.sound.setListener(this.head, _v, new THREE.Vector3(0, 1, 0).applyQuaternion(this.headQuat));
    this.sound.update();
    this.renderer.render(this.scene, this.camera);
  }
}
