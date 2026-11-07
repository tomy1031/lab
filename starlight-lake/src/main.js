import * as THREE from 'three';
import { Store } from './storage.js';
import { Environment } from './world/environment.js';
import { Effects } from './fx.js';
import { AudioEngine } from './audio.js';
import { UIManager, Panel, wrapText } from './ui.js';
import { Input } from './input.js';
import { Score, Hud, Caption, Director } from './session.js';
import { FONT, DEG } from './config.js';
import { sph } from './util.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Spatial-frequency bands the display can render cleanly (>= 2.5 pixels per cycle). */
function bandsFor(ppd, kind) {
  const maxSf = ppd * 0.4;
  if (kind === 'screen') {
    const b = [3, 6, 9, 12, 18, 24].filter((sf) => sf <= Math.min(24, maxSf));
    return b.slice(-4);
  }
  const b = [1.5, 3, 6, 9].filter((sf) => sf <= maxSf);
  return b.length >= 2 ? b : [1.5, 3];
}

export class App {
  constructor(container) {
    this.store = new Store();
    this.settings = this.store.settings;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 2000);
    this.camera.position.set(0, 1.6, 0);
    this.camera.layers.enable(1); this.camera.layers.enable(2);   // desktop sees both eye layers
    this.scene.add(this.camera);
    this.head = this.camera.position;
    this.headQuat = this.camera.quaternion;

    this.view = { kind: 'preview', ppd: 14, field: { az: 30, el: 16 }, sfBands: [1.5, 3, 6], stereo: false, ipd: 0.063 };
    this.computeDesktopView();

    this.audio = new AudioEngine();
    this.audio.volume = this.settings.volume; this.audio.music = this.settings.music;
    this.env = new Environment(this);
    this.scene.add(this.env.group);
    this.env.constellations.load(this.store.data.totals.constellations);
    this.env.lotus.setCount(this.lotusCount());
    this.fx = new Effects(this);
    this.scene.add(this.fx.group);
    this.ui = new UIManager(this);
    this.stage = new THREE.Object3D();
    this.stageYaw = 0;
    this.scene.add(this.stage);
    this.score = new Score(this);
    this.hud = new Hud(this);
    this.captionBox = new Caption(this);
    this.director = new Director(this);
    this.input = new Input(this);
    this.setupDichoptic();
    // A small pause orb within reach of the pointer: hands have no B/Y button to press.
    this.pauseBtn = this.ui.add(new Panel({
      w: 0.13, h: 0.13, px: 256, glass: false,
      draw: (g, W, H, panel) => panel.button('pause', 14, 14, W - 28, H - 28, 'Ⅱ', { onClick: () => this.togglePause() }),
    }));
    this.pauseBtn.visible = false;

    this.paused = false;
    this.menu = null;
    this.timeScale = 1;   // tests fast-forward with this; play is always real time
    this.clock = new THREE.Clock();
    this.time = 0;
    this.previewYaw = 0.15;
    this.screenYaw = Math.atan2(-this.env.sky.moonDir.x, -this.env.sky.moonDir.z) * 0.6;

    window.addEventListener('resize', () => this.onResize());
    r.xr.addEventListener('sessionstart', () => this.onXRStart());
    r.xr.addEventListener('sessionend', () => this.onXREnd());
    r.setAnimationLoop(() => this.tick());
    this.onExitHooks = [];
  }

  /** Dichoptic mode: raise the fellow eye's contrast step by step as performance allows (Hess et al.). */
  afterNight(results) {
    if (this.settings.dichoptic === 'off') return;
    const t = results.reduce((a, r) => a + (r.trials || 0), 0), c = results.reduce((a, r) => a + (r.correct || 0), 0);
    if (t >= 30 && c / t >= 0.75) this.settings.fellow = Math.min(1, +(this.settings.fellow + 0.05).toFixed(2));
  }

  lotusCount() { return Math.min(64, 4 + this.store.data.totals.nights); }

  // ---------- views ----------
  computeDesktopView() {
    const c = this.camera;
    const H = this.renderer?.getDrawingBufferSize(new THREE.Vector2()).y ?? window.innerHeight;
    const ppd = (H / 2) / Math.tan((c.fov * DEG) / 2) * DEG;
    const hfov = 2 * Math.atan(Math.tan((c.fov * DEG) / 2) * c.aspect) / DEG;
    this.view.ppd = ppd;
    this.view.field = { az: Math.min(30, hfov / 2 - 5), el: Math.min(16, c.fov / 2 - 6) };
    if (this.view.kind !== 'screen') this.view.sfBands = bandsFor(ppd, 'desktop');
  }

  /** Screen mode: the camera's field of view equals the physical screen seen from `distance`. */
  setScreenCalibration(pxPerMm, distance) {
    const hM = window.innerHeight / pxPerMm / 1000;
    const fov = 2 * Math.atan(hM / 2 / distance) / DEG;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const H = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const ppd = (H / 2) / Math.tan((fov * DEG) / 2) * DEG;
    const hfov = 2 * Math.atan(Math.tan((fov * DEG) / 2) * this.camera.aspect) / DEG;
    this.view = { kind: 'screen', ppd, field: { az: hfov / 2 * 0.8, el: fov / 2 * 0.72 }, sfBands: bandsFor(ppd, 'screen'), stereo: false, ipd: 0.063 };
    this.env.setPpd(ppd);
  }

  computeXRView() {
    const cam = this.renderer.xr.getCamera();
    if (!cam.cameras.length) return false;
    const c0 = cam.cameras[0];
    const e = c0.projectionMatrix.elements;
    const tanR = (1 + e[8]) / e[0], tanL = (e[8] - 1) / e[0];
    const W = c0.viewport.z;
    if (!W) return false;
    const ppd = W / (tanR - tanL) * DEG;      // pixels per degree at the centre of the eye buffer
    const ipd = cam.cameras.length > 1 ? cam.cameras[0].position.distanceTo(cam.cameras[1].position) : 0.063;
    this.view = { kind: 'vr', ppd, field: { az: 32, el: 18 }, sfBands: bandsFor(ppd, 'vr'), stereo: true, ipd: ipd > 0.04 && ipd < 0.08 ? ipd : 0.063 };
    this.env.setPpd(ppd);
    return true;
  }

  onResize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.view.kind === 'screen' && this.calib) this.setScreenCalibration(this.calib.pxPerMm, this.calib.distance);
    else this.computeDesktopView();
  }

  // ---------- dichoptic (binocular balance) ----------
  setupDichoptic() {
    const d = this.settings.dichoptic;
    this.weakLayer = d === 'left' ? 1 : d === 'right' ? 2 : 0;
    this.fellowLayer = d === 'left' ? 2 : d === 'right' ? 1 : 0;
    if (!this.veil) {
      this.veil = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }));
      this.veil.renderOrder = 999;
      this.veil.frustumCulled = false;
      this.camera.add(this.veil);
    }
    this.veil.layers.set(this.fellowLayer || 0);
    this.veil.material.opacity = 1 - this.settings.fellow;
    this.veil.visible = false;
  }

  /** Assign an object to the weaker / fellow eye in dichoptic mode (no-op otherwise). */
  eye(obj, role) {
    if (!this.weakLayer) return;
    const L = role === 'weak' ? this.weakLayer : this.fellowLayer;
    obj.traverse((o) => o.layers.set(L));
  }

  // ---------- head & stage ----------
  headYaw() {
    _v.set(0, 0, -1).applyQuaternion(this.headQuat);
    return Math.atan2(-_v.x, -_v.z);
  }

  recenter() {
    this.stage.position.copy(this.head);
    this.stageYaw = this.view.kind === 'screen' ? this.screenYaw : this.headYaw();
    this.stage.rotation.set(0, this.stageYaw, 0);
  }

  stagePoint(az, el, dist, out = new THREE.Vector3()) {
    sph(az, el, dist, out);
    out.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.stageYaw);
    return out.add(this.stage.position);
  }

  caption(text, sec) { this.captionBox.show(text, sec); }

  /**
   * Where a UI element of w x h metres should sit. VR and desktop keep the designed distance and
   * elevation; screen mode has a field of view of only a few degrees, so elements move further
   * away (to cover `frac` of the width) and elevations are squeezed into the visible area.
   */
  uiPlacement(dist, el, w, h, frac = 0.7) {
    if (this.view.kind !== 'screen') return { dist, el };
    const vf = this.camera.fov;
    const hf = 2 * Math.atan(Math.tan((vf * DEG) / 2) * this.camera.aspect) / DEG;
    const d = Math.max(dist, (w / 2) / Math.tan((frac * hf * DEG) / 2), (h / 2) / Math.tan((0.42 * vf) * DEG));
    return { dist: d, el: (el / 25) * (vf / 2) };
  }

  // ---------- events from Input ----------
  onSelectStart(p) { if (!this.paused) this.director.module?.onSelectStart(p); }
  onSelectEnd(p) { if (!this.paused) this.director.module?.onSelectEnd(p); }
  onDirection(dir, p) { if (!this.paused) this.director.module?.onDirection(dir, p); }
  pointerTarget(p) { return this.paused ? null : this.director.module?.pointerTarget(p) ?? null; }
  onConfirm() {
    if (this.director.running && !this.director.module && !this.paused) this.director.startStep();
  }

  togglePause() {
    if (!this.director.running) return;
    this.paused = !this.paused;
    if (this.paused) this.showPauseMenu(); else this.closeMenu();
  }

  // ---------- menus ----------
  closeMenu() { if (this.menu) { this.ui.remove(this.menu); this.menu = null; } }
  openMenu(panel, dist = 1.6, el = 0) {
    this.closeMenu();
    this.menu = this.ui.add(panel);
    this.ui.placeInFront(panel, dist, el);
  }

  showStartMenu() {
    this.recenter();
    const s = this.settings, d = this.store.data;
    const last = d.history[d.history.length - 1];
    this.openMenu(new Panel({
      w: 1.15, h: 0.78, px: 1200,
      draw: (g, W, H, panel) => {
        g.textAlign = 'center';
        g.fillStyle = '#f4f8ff'; g.font = `700 72px ${FONT}`; g.fillText('ほしあかりの湖', W / 2, 108);
        g.fillStyle = '#9fbde8'; g.font = `500 30px ${FONT}`; g.fillText('STARLIGHT LAKE ・ 視覚トレーニング', W / 2, 156);
        g.fillStyle = '#d9e6ff'; g.font = `400 32px ${FONT}`;
        const info = d.totals.nights
          ? `これまで ${d.totals.nights} 夜 ・ 星座 ${d.totals.constellations.length} ・ 前回 ${last ? new Date(last.date).toLocaleDateString('ja-JP') : '-'}`
          : '夕暮れから夜明けまで、ひと晩の旅。夜が明けたら今日のおしまい。';
        wrapText(g, info, W / 2, 230, W - 160, 44, { align: 'center' });
        g.fillStyle = '#a9c4e8'; g.font = `500 30px ${FONT}`; g.fillText('今夜の長さ', W / 2, 330);
        const opts = [10, 15, 20, 30];
        opts.forEach((m, i) => panel.button('m' + m, W / 2 - 400 + i * 205, 356, 185, 74, `${m} 分`, {
          selected: s.minutes === m, onClick: () => { s.minutes = m; this.store.save(); panel.redraw(); },
        }));
        if (s.dichoptic !== 'off') {
          g.fillStyle = '#ffd9b0'; g.font = `400 26px ${FONT}`;
          g.fillText(`両眼バランスモード：${s.dichoptic === 'left' ? '左' : '右'}目を主に使用（反対の目のコントラスト ${Math.round(s.fellow * 100)}%）`, W / 2, 478);
        }
        panel.button('start', W / 2 - 230, H - 150, 460, 96, '旅をはじめる', { primary: true, onClick: () => { this.closeMenu(); this.audio.init(); this.director.begin(); } });
      },
    }), 1.8, 2);
  }

  showPauseMenu() {
    this.openMenu(new Panel({
      w: 0.9, h: 0.56, px: 1000,
      draw: (g, W, H, panel) => {
        g.textAlign = 'center'; g.fillStyle = '#f2f8ff'; g.font = `700 60px ${FONT}`;
        g.fillText('ひと休み', W / 2, 100);
        g.fillStyle = '#b8cdf0'; g.font = `400 30px ${FONT}`;
        g.fillText(`音量 ${Math.round(this.settings.volume * 100)}%`, W / 2, 175);
        panel.button('vd', W / 2 - 260, 200, 160, 70, '－', { onClick: () => this.setVolume(-0.1, panel) });
        panel.button('vu', W / 2 + 100, 200, 160, 70, '＋', { onClick: () => this.setVolume(0.1, panel) });
        panel.button('resume', W / 2 - 330, H - 140, 300, 86, 'つづける', { primary: true, onClick: () => this.togglePause() });
        panel.button('end', W / 2 + 30, H - 140, 300, 86, '今夜はここまで', { onClick: () => { this.paused = false; this.closeMenu(); this.director.endNow(); } });
      },
    }), 1.4, 0);
  }

  setVolume(d, panel) {
    this.settings.volume = Math.max(0, Math.min(1, +(this.settings.volume + d).toFixed(2)));
    this.audio.setVolume(this.settings.volume);
    this.store.save();
    panel.redraw();
  }

  /** 'auto': Quest 3 / Pro render sharper; Quest 2 keeps the default resolution for a steady frame rate. */
  resolvedQuality() {
    const q = this.settings.quality;
    if (q !== 'auto') return q;
    return /Quest 2|Quest\b(?! [3P])/.test(navigator.userAgent) ? 'standard' : 'high';
  }

  // ---------- modes ----------
  async enterVR() {
    if (!navigator.xr) throw new Error('WebXR not available');
    this.audio.init();
    this.renderer.xr.setFramebufferScaleFactor(this.resolvedQuality() === 'high' ? 1.3 : 1.0);
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await this.renderer.xr.setSession(session);
  }

  onXRStart() {
    this.setupDichoptic();
    this.veil.visible = this.settings.dichoptic !== 'off';
    try { this.renderer.xr.setFoveation(0.25); } catch (e) { /* optional */ }
    this.view.kind = 'vr';
    this.needXRView = true;
    this.xrFrames = 0;
    this.director.running = false;
    document.body.classList.add('in-xr');
  }

  onXREnd() {
    this.veil.visible = false;
    if (this.director.running) this.director.endNow();
    this.toPreview();
    document.body.classList.remove('in-xr');
  }

  startDesktop() {
    this.audio.init();
    this.camera.fov = 62; this.camera.updateProjectionMatrix();
    this.view.kind = 'desktop'; this.view.stereo = false;
    this.computeDesktopView();
    this.env.setPpd(this.view.ppd);
    this.input.look.yaw = this.headYaw(); this.input.look.pitch = 0;
    this.showStartMenu();
  }

  startScreen(pxPerMm, distance) {
    this.audio.init();
    this.calib = { pxPerMm, distance };
    this.setScreenCalibration(pxPerMm, distance);
    this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.screenYaw, 0, 'YXZ'));
    this.showStartMenu();
  }

  toPreview() {
    this.closeMenu();
    this.director.closePanel();
    this.director.running = false;
    this.paused = false;
    this.hud.panel.visible = false;
    this.camera.fov = 62; this.camera.updateProjectionMatrix();
    this.view.kind = 'preview';
    this.computeDesktopView();
    this.env.setPpd(this.view.ppd);
    for (const f of this.onExitHooks) f();
  }

  exit() {
    const s = this.renderer.xr.getSession();
    if (s) s.end(); else this.toPreview();
  }

  // ---------- loop ----------
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta()) * this.timeScale;
    this.time += dt;
    const presenting = this.renderer.xr.isPresenting;
    // wait a few frames so the head pose and eye cameras are real before placing the menu
    if (presenting && this.needXRView && ++this.xrFrames > 3 && this.computeXRView()) {
      this.needXRView = false;
      this.showStartMenu();
    }
    if (!presenting) {
      const k = this.view.kind;
      if (k === 'preview') {
        const yaw = this.previewYaw + Math.sin(this.time * 0.035) * 0.35;
        this.camera.quaternion.setFromEuler(new THREE.Euler(0.06 + Math.sin(this.time * 0.05) * 0.03, yaw, 0, 'YXZ'));
      } else if (k === 'screen') {
        this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.screenYaw, 0, 'YXZ'));
      } else {
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.input.look.pitch, this.input.look.yaw, 0, 'YXZ'));
      }
      this.camera.position.set(0, 1.6, 0);
    }
    this.veil.material.color.copy(this.env.veilColor);

    this.input.update(dt);
    if (!this.paused) {
      if (this.director.running) this.director.update(dt);
      else this.director.updateIdle(dt);
    }
    this.captionBox.update(dt);
    const showPause = this.director.running && !this.paused && this.view.kind !== 'screen';
    this.pauseBtn.visible = showPause;
    if (showPause) {
      this.pauseBtn.mesh.position.copy(this.stagePoint(-30, -24, 1.25));
      this.pauseBtn.mesh.lookAt(this.head);
    }
    this.env.update(this.time, dt, this.head);
    this.fx.update(dt, this.head, this.view.ppd);
    _v.set(0, 0, -1).applyQuaternion(this.headQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.headQuat);
    this.audio.setListener(this.head, _v, up);
    this.audio.update(this.stagePoint((Math.random() - 0.5) * 120, 5, 12));
    this.renderer.render(this.scene, this.camera);
  }
}
