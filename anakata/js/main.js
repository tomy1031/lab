// js/main.js — ANAKATA: the renderer, the WebXR session, the frame loop, and moving between the chapters,
// in VR (Meta Quest: controllers or hands) and on a PC or phone (mouse / touch, the guide as an overlay).
import * as THREE from 'three';
import { Bulk } from './env.js';
import { Input } from './input.js';
import { Panel, TAGS } from './ui.js';
import { Sound } from './audio.js';
import { Guide } from './guide.js';
import { Hub } from './chapters/hub.js';
import { Ladder } from './chapters/ladder.js';
import { Flatland } from './chapters/flatland.js';
import { Slices } from './chapters/slices.js';
import { Shadows } from './chapters/shadows.js';
import { Gravity } from './chapters/gravity.js';
import { Tesseract } from './chapters/tesseract.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.params = params;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(0.4);
    $('stage').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.02, 2000);
    this.scene.add(this.camera);
    this.stage = new THREE.Group(); // everything you stand among; recentred on you when VR starts
    this.scene.add(this.stage);
    this.env = new Bulk(this.scene);
    this.stage.add(this.env.platform);
    this.sound = new Sound();
    this.input = new Input(this);
    this.panel = new Panel(this);
    this.stage.add(this.panel.mesh);
    this.panel.onButton = (id) => this.onButton(id);
    this.guide = new Guide(this);
    this.xrActive = false;
    this.menuOpen = false;
    this.started = false;
    this.t = 0;
    this.clock = new THREE.Clock();
    this.cam = { pos: new THREE.Vector3(0, 1.5, 0.45) };
    this.chapters = [Hub, Ladder, Flatland, Slices, Shadows, Gravity, Tesseract].map((C) => new C(this));
    this.chapters.forEach((c, i) => { c.index = i; });
    this.current = null;
    this.go(0);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    r.setAnimationLoop((time, frame) => this.frame(frame));
    this.dom();
  }

  resize() {
    if (this.renderer.xr.isPresenting) return;
    this.viewShift = -1;
    this.camera.clearViewOffset();
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ---- chapters ----
  go(i, step = 0) {
    if (this.current) this.current.exit();
    this.current = this.chapters[i];
    this.menuOpen = i === 0;
    this.env.setMode(this.current.envMode || 'hub');
    this.current.enter(step);
    const v = this.current.view;
    this.cam.pos.fromArray(v.pos);
    this.input.yaw = v.yaw;
    this.input.pitch = v.pitch;
    this.sound.setChord(i);
    this.refreshPanel();
    this.updateKeys();
  }

  showMenu(open = true) {
    this.menuOpen = open || this.current.index === 0;
    this.refreshPanel();
  }

  refreshPanel() {
    if (!this.current) return;
    this.panel.show(this.menuOpen ? this.menuSpec() : this.current.panelSpec());
  }

  menuSpec() {
    const actions = [];
    if (this.current.index > 0) actions.push({ id: 'close', label: '◀ 章に もどる' });
    if (this.xrActive) actions.push({ id: 'recenter', label: '高さ・向きを 合わせる' });
    actions.push({ id: 'guide', label: this.guide.on ? '操作ガイド ON' : '操作ガイド OFF', on: this.guide.on });
    actions.push({ id: 'sound', label: this.sound.muted ? '音 OFF' : '音 ON', on: !this.sound.muted });
    if (this.xrActive) actions.push({ id: 'exitvr', label: 'VR を 終わる' });
    return {
      kind: 'menu',
      text: this.xrActive
        ? 'インターステラーの 5次元＝ **空間 4 ＋ 時間 1**。章を えらんでください。レーザーで 指して **トリガー**。**A / X** で 操作ガイド、**B / Y** で この 目次。'
        : 'インターステラーの 5次元＝ **空間 4 ＋ 時間 1**。見えない 次元を、たとえ・切り口・影・重力・時間 で 体感します。章を えらんでください。',
      chapters: this.chapters.slice(1).map((c) => ({ title: c.title, tag: c.tag, sub: c.sub, current: c === this.current })),
      actions,
    };
  }

  onButton(id) {
    const c = this.current;
    if (id === 'menu') return this.showMenu(true);
    if (id === 'close') return this.showMenu(false);
    if (id === 'recenter') { this.recenter(); return; }
    if (id === 'guide') { this.guide.toggle(); return; }
    if (id === 'sound') { this.sound.setMuted(!this.sound.muted); this.syncSoundBtn(); return this.refreshPanel(); }
    if (id === 'exitvr') { this.renderer.xr.getSession()?.end(); return; }
    if (id.startsWith('ch')) return this.go(Number(id.slice(2)) + 1);
    if (id === 'next') {
      if (c.step < c.steps.length - 1) c.setStep(c.step + 1);
      else if (c.index < this.chapters.length - 1) this.go(c.index + 1);
      else this.showMenu(true);
      this.sound.chime(c.step);
      return;
    }
    if (id === 'prev') {
      if (c.step > 0) c.setStep(c.step - 1);
      else if (c.index > 1) { const p = this.chapters[c.index - 1]; this.go(p.index, p.steps.length - 1); }
      return;
    }
    c.onAction(id);
  }

  onKey(e) {
    if (!this.started || this.xrActive) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.target && e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return; // the button's own click
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.onButton(this.menuOpen && this.current.index ? 'close' : 'next'); }
    else if (e.code === 'Backspace') { e.preventDefault(); this.onButton('prev'); }
    else if (e.code === 'KeyM' || e.code === 'Escape') this.showMenu(!this.menuOpen);
    else if (e.code === 'KeyG') this.guide.toggle();
    else if (/^Digit[1-6]$/.test(e.code)) this.go(Number(e.code.slice(5)));
  }

  // ---- VR ----
  async enterVR() {
    if (!navigator.xr) return;
    this.sound.ensure();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
      await this.renderer.xr.setSession(session);
      this.xrActive = true;
      this.started = true;
      this.input.bindSession(session);
      this.recenterIn = 4;
      $('start').classList.add('hidden');
      $('hud').classList.add('hidden');
      this.panel.mesh.visible = true;
      if (this.current.index === 0) this.go(this.startChapter || 1);
      this.refreshPanel();
      session.addEventListener('end', () => {
        this.xrActive = false;
        this.stage.position.set(0, 0, 0);
        this.stage.rotation.set(0, 0, 0);
        this.panel.mesh.visible = false;
        this.resize();
        this.showStart();
      });
    } catch (err) {
      this.toast('VR を はじめられませんでした：' + (err && err.message ? err.message : err));
    }
  }

  // put the stage where you stand and face, at your eye height
  recenter() {
    const h = this.input.head;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.input.headQuat);
    this.stage.position.set(h.x, THREE.MathUtils.clamp(h.y - 1.6, -0.8, 0.35), h.z);
    this.stage.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    this.current.onRecenter?.();
  }

  // ---- PC / phone ----
  startPC(ch) {
    this.sound.ensure();
    this.started = true;
    $('start').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.panel.mesh.visible = false;
    this.go(ch || this.startChapter || 1);
  }

  showStart() {
    this.started = false;
    $('start').classList.remove('hidden');
    $('hud').classList.add('hidden');
    this.go(0);
  }

  updateKeys() {
    const k = $('keys');
    if (k) k.textContent = 'ドラッグ：見回す・物を動かす　WASD/QE・ホイール：移動　Space：つぎへ　M：目次　G：操作ガイド' + (this.current.keyHelp ? '　' + this.current.keyHelp : '');
  }

  desktopCamera(dt) {
    const inp = this.input, k = inp.keys;
    const own = this.current.ownsMove;
    if (k.has('ArrowLeft')) inp.yaw -= dt * 1.4;
    if (k.has('ArrowRight')) inp.yaw += dt * 1.4;
    if (k.has('ArrowUp')) inp.pitch = Math.min(1.3, inp.pitch + dt * 1.0);
    if (k.has('ArrowDown')) inp.pitch = Math.max(-1.3, inp.pitch - dt * 1.0);
    const fwd = new THREE.Vector3(-Math.sin(inp.yaw), 0, -Math.cos(inp.yaw));
    const right = new THREE.Vector3(Math.cos(inp.yaw), 0, -Math.sin(inp.yaw));
    if (!own) {
      const sp = 1.2 * dt;
      if (k.has('KeyW')) this.cam.pos.addScaledVector(fwd, sp);
      if (k.has('KeyS')) this.cam.pos.addScaledVector(fwd, -sp);
      if (k.has('KeyA')) this.cam.pos.addScaledVector(right, -sp);
      if (k.has('KeyD')) this.cam.pos.addScaledVector(right, sp);
      if (k.has('KeyQ')) this.cam.pos.y -= sp;
      if (k.has('KeyE')) this.cam.pos.y += sp;
      if (inp.wheel) this.cam.pos.addScaledVector(new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(inp.pitch, inp.yaw, 0, 'YXZ')), -inp.wheel * 0.12);
      this.cam.pos.y = THREE.MathUtils.clamp(this.cam.pos.y, 0.3, 4);
      inp.wheel = 0;
    }
    this.camera.position.copy(this.cam.pos);
    this.camera.rotation.set(inp.pitch, -inp.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    // on a wide screen the guide covers the lower left: shift the picture right so the scene is not under it
    const wrap = document.getElementById('panel-wrap');
    const open = wrap && !wrap.classList.contains('folded') && innerWidth > 820;
    const shift = open ? Math.round(wrap.getBoundingClientRect().width * 0.42) : 0;
    if (shift !== this.viewShift) {
      this.viewShift = shift;
      if (shift) this.camera.setViewOffset(innerWidth, innerHeight, -shift, 0, innerWidth, innerHeight);
      else this.camera.clearViewOffset();
    }
  }

  // ---- the frame ----
  frame(xrFrame) {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    const inp = this.input;
    if (this.xrActive && xrFrame) {
      inp.readXR(xrFrame, this.renderer.xr.getReferenceSpace(), dt);
      if (this.recenterIn > 0 && inp.head.y > 0.3 && --this.recenterIn === 0) this.recenter();
      // B / Y: the chapter list; A / X: the controls guide
      for (const p of [inp.xr.L, inp.xr.R]) {
        if (p.buttonDown(5)) this.showMenu(!this.menuOpen);
        if (p.buttonDown(4)) this.guide.toggle();
      }
    } else {
      this.desktopCamera(dt);
      inp.readDesktop(this.camera);
    }
    this.stage.updateMatrixWorld(true);
    inp.items = [this.panel.item, ...((this.started || this.xrActive) && !this.menuOpen ? this.current.items : [])];
    const free = inp.update(dt);
    for (const p of free) {
      if (p.kind === 'mouse') inp.look = { x: p.lastX, y: p.lastY };
      this.current.onFree?.(p);
    }
    this.current.update(dt, this.t);
    if (this.started && !this.xrActive) this.current.keys(inp.keys, dt);
    this.guide.update(this.t);
    this.panel.update();
    this.env.update(this.t);
    this.renderer.render(this.scene, this.camera);
  }

  toast(msg, action) {
    const t = $('toast');
    t.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = action.run;
      t.appendChild(b);
    }
    t.classList.remove('hidden');
    clearTimeout(this.toastT);
    if (!action) this.toastT = setTimeout(() => t.classList.add('hidden'), 5000);
  }

  syncGuideBtn() {
    const b = $('btn-guide');
    if (b) { b.textContent = this.guide.on ? '操作ガイド ON' : '操作ガイド OFF'; b.classList.toggle('on', this.guide.on); }
    $('keys')?.classList.toggle('hidden', !this.guide.on);
  }

  syncSoundBtn() {
    $('btn-sound').textContent = this.sound.muted ? '音 OFF' : '音 ON';
  }

  dom() {
    const list = $('chapters');
    this.startChapter = Number(params.get('ch')) || 1;
    this.chapters.slice(1).forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'ch';
      b.innerHTML = `<span class="n">${i + 1}</span><span><b></b><small></small></span><span class="tag ${c.tag}"></span>`;
      b.querySelector('b').textContent = c.title;
      b.querySelector('small').textContent = c.desc;
      b.querySelector('.tag').textContent = TAGS[c.tag].label;
      b.onclick = () => {
        this.startChapter = i + 1;
        if (this.vrOK) this.enterVR();
        else this.startPC(i + 1);
      };
      list.appendChild(b);
    });
    $('btn-pc').onclick = () => this.startPC();
    $('btn-vr').onclick = () => this.enterVR();
    $('btn-vr2').onclick = () => this.enterVR();
    $('btn-home').onclick = () => this.showStart();
    $('btn-guide').onclick = () => this.guide.toggle();
    this.syncGuideBtn();
    $('btn-sound').onclick = () => { this.sound.setMuted(!this.sound.muted); this.syncSoundBtn(); this.refreshPanel(); };
    const wrap = $('panel-wrap');
    wrap.appendChild(this.panel.canvas);
    $('fold').onclick = () => { wrap.classList.toggle('folded'); $('fold').textContent = wrap.classList.contains('folded') ? '案内を ひらく' : 'たたむ'; };
    const note = $('vr-note');
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
        this.vrOK = ok;
        $('btn-vr').disabled = !ok;
        $('btn-vr2').classList.toggle('hidden', !ok);
        note.textContent = ok ? 'Meta Quest などの VR ゴーグルで そのまま 入れます。' : 'この ブラウザでは VR が 使えません。PC・スマホで どうぞ（Quest の ブラウザなら VR で 入れます）。';
      }).catch(() => { note.textContent = 'VR の 確認に 失敗しました。PC・スマホで どうぞ。'; });
    } else note.textContent = 'この ブラウザでは VR が 使えません（WebXR なし）。PC・スマホで どうぞ。Quest の ブラウザなら VR で 入れます。';
    this.offline();
    $('loading').classList.add('hidden');
    if (params.has('pc')) this.startPC(this.startChapter);
    else this.showStart();
    if (params.get('step')) this.current.setStep(Number(params.get('step')));
  }

  // the published build registers the service worker, which keeps every file for offline use
  offline() {
    const el = $('offline'), txt = $('offline-text');
    if (!window.AK_BUILD || !('serviceWorker' in navigator)) {
      txt.textContent = window.AK_BUILD ? 'この ブラウザは オフライン保存に 対応していません' : '開発版（オフライン保存は 公開版で 有効）';
      return;
    }
    const hadController = !!navigator.serviceWorker.controller; // first install: no reload needed
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const ready = () => { el.classList.add('ok'); txt.textContent = `オフラインでも 遊べます（版 ${window.AK_BUILD}）`; };
      if (reg.active) ready();
      navigator.serviceWorker.ready.then(ready);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            this.toast('新しい 版が あります。', { label: '更新する', run: () => { w.postMessage('SKIP_WAITING'); } });
          }
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController) return;
        if (this.xrActive) return;
        reloaded = true;
        location.reload();
      });
    }).catch(() => { txt.textContent = 'オフライン保存に 失敗しました（オンラインでは 遊べます）'; });
  }
}

window.__app = new App();
