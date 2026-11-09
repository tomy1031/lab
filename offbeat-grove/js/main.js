// js/main.js — OFFBEAT GROVE: renderer, WebXR session, the frame loop and the flow
// menu → play → (pause) → results → menu, both in VR (Meta Quest) and on a PC or phone.
import * as THREE from 'three';
import { store } from './store.js';
import { AudioEngine } from './audio.js';
import { World } from './world.js';
import { Lane } from './lane.js';
import { Targets } from './targets.js';
import { FX } from './fx.js';
import { Input, DeskGloves } from './gloves.js';
import { MenuPanel, PausePanel, ResultsPanel, Hud } from './vrui.js';
import { songById } from './songs.js';
import { GenPlayer, TrackPlayer } from './player.js';
import { buildChart } from './chart.js';
import { PlaySession } from './game.js';
import { DomUI } from './dom.js';
import { clamp, smoothstep } from './util.js';

const params = new URLSearchParams(location.search);

class App {
  constructor() {
    this.store = store;
    this.params = params;
    for (const k of ['song', 'mode', 'diff', 'guide', 'length']) if (params.get(k)) store.data[k] = params.get(k);
    if (params.get('quality')) store.data.quality = params.get('quality');
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(0.5);
    document.getElementById('stage').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 4000);
    this.camera.position.set(0, 1.6, 0);
    this.world = new World(r, this.scene, store.data.quality);
    this.playRoot = new THREE.Group();
    this.scene.add(this.playRoot);
    this.lane = new Lane(this.playRoot);
    this.targets = new Targets(this.playRoot);
    this.fx = new FX(this.playRoot);
    this.input = new Input(this.scene);
    this.desk = new DeskGloves(this.input);
    this.audio = new AudioEngine(store);
    this.menu = new MenuPanel(this);
    this.pausePanel = new PausePanel(this);
    this.resultsPanel = new ResultsPanel(this);
    this.hud = new Hud();
    this.scene.add(this.menu.mesh, this.pausePanel.mesh, this.resultsPanel.mesh);
    this.playRoot.add(this.hud.mesh);
    this.state = 'menu';
    this.xr = false;
    this.auto = false;
    this.session = null;
    this.player = null;
    this.preview = null;
    this.track = null;
    this.songT = -999;
    this.simT = null;
    this.duckT = 0;
    this.t = 0;
    this.clock = new THREE.Clock();
    this.dom = new DomUI(this);
    for (const s of ['L', 'R']) this.input.gloves[s].mesh.visible = false;
    window.addEventListener('resize', () => this.resize());
    r.setAnimationLoop((time, frame) => this.frame(time, frame));
    this.dom.ready();
    if (params.has('autoplay')) setTimeout(() => this.startDesk(true), 300);
  }

  resize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ---- flow ----
  choose(patch) {
    store.set(patch);
    this.menu.redraw();
    this.dom.sync();
    if (patch.song || patch.drillBpm) this.startPreview();
  }

  startPreview() {
    this.stopPreview();
    if (this.state !== 'menu' || !this.audio.ready || this.params.has('nosound')) return;
    const s = store.data;
    let p;
    if (s.song === 'track') {
      if (!this.track) return;
      p = new TrackPlayer(this.audio, this.track);
      p.start(this.audio.now() + 0.05, this.track.buffer.duration * 0.3, 0);
    } else {
      const song = songById(s.song);
      p = new GenPlayer(this.audio, song, { bpm: song.drill ? s.drillBpm : undefined });
      const b = Math.max(0, p.bars.findIndex((x) => x.e >= 2));
      p.start(this.audio.now() + 0.05, b * p.barDur, 0);
    }
    p.seg.out.gain.value = 0.55;
    this.preview = p;
    this.previewEnd = this.audio.now() + 14;
  }

  stopPreview() {
    if (this.preview) this.preview.stop();
    this.preview = null;
  }

  startDesk(auto) {
    this.audio.ensure();
    this.auto = auto;
    this.start();
  }

  start() {
    const s = store.data;
    this.audio.ensure();
    this.stopPreview();
    if (this.player) this.player.stop();
    this.targets.clear();
    let player, title;
    if (s.song === 'track' && this.track) {
      player = new TrackPlayer(this.audio, this.track);
      title = this.track.name;
    } else {
      const song = songById(s.song === 'track' ? 'skank' : s.song);
      player = new GenPlayer(this.audio, song, { length: s.length, bpm: song.drill ? s.drillBpm : undefined });
      title = song.drill ? `${song.title}（BPM ${s.drillBpm}）` : song.title;
    }
    const seed = parseInt(params.get('seed'), 10) || ((Date.now() / 1000) | 0);
    const notes = buildChart({ bars: player.bars, grid: player.grid, mode: s.mode, diff: s.diff, seated: s.seated, seed });
    // the play area: where you stand, facing where you look
    let eyeY = 1.6;
    if (this.xr) {
      const h = this.input.head;
      eyeY = clamp(h.y, 0.95, 2.1);
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.input.headQuat);
      this.playRoot.position.set(h.x, 0, h.z);
      this.playRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    } else {
      this.playRoot.position.set(0, 0, 0);
      this.playRoot.rotation.set(0, 0, 0);
    }
    // the scoreboard floats above the approach path, where your eyes already are
    this.hud.mesh.position.set(0, eyeY + 0.6, -3.1);
    this.hud.mesh.rotation.set(0.12, 0, 0);
    this.session = new PlaySession(this, { notes, player, opts: { ...s }, title, eyeY, auto: this.auto && !this.xr, keys: !this.xr && !this.auto });
    this.player = player;
    this.simT = null;
    this.songT = -999;
    player.start(this.audio.now() + 0.3, 0, 0);
    this.state = 'play';
    this.audio.ambience('play');
    this.panels();
    this.dom.onState();
  }

  pause() {
    if (this.state !== 'play') return;
    this.pausedAt = this.songT;
    this.player.stop();
    this.state = 'paused';
    this.panels();
    this.dom.onState();
  }

  resume() {
    if (this.state !== 'paused') return;
    const p = Math.max(0, this.pausedAt);
    this.session.rewind(p);
    this.simT = null;
    this.player.start(this.audio.now() + 0.15, p, 4);
    this.state = 'play';
    this.panels();
    this.dom.onState();
  }

  finish(res) {
    const s = store.data;
    res.isBest = store.addResult({ song: s.song, mode: s.mode, diff: s.diff, length: s.length }, res);
    this.lastResults = res;
    this.resultsPanel.res = res;
    this.targets.clear();
    this.state = 'results';
    this.audio.ambience('menu');
    this.panels();
    this.dom.onState();
  }

  toMenu() {
    if (this.player) this.player.stop();
    this.player = null;
    this.session = null;
    this.targets.clear();
    this.state = 'menu';
    this.auto = false;
    this.audio.ambience('menu');
    this.panels();
    this.dom.onState();
  }

  duck(sec = 0.6) { this.duckT = sec; }

  // which VR panels show, placed in front of you
  panels() {
    const xr = this.xr;
    const st = this.state;
    const place = (panel, dist, dy) => {
      const h = this.input.head;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.input.headQuat);
      f.y = 0;
      if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
      f.normalize();
      panel.mesh.position.set(h.x + f.x * dist, h.y + dy, h.z + f.z * dist);
      panel.mesh.lookAt(h.x, h.y + dy * 0.4, h.z);
    };
    const want = { menu: xr && st === 'menu', pause: xr && st === 'paused', results: xr && st === 'results' };
    if (want.menu && !this.menu.visible) place(this.menu, 1.45, -0.12);
    if (want.pause && !this.pausePanel.visible) place(this.pausePanel, 0.95, -0.05);
    if (want.results && !this.resultsPanel.visible) place(this.resultsPanel, 1.45, -0.12);
    this.menu.show(want.menu);
    this.pausePanel.show(want.pause);
    this.resultsPanel.show(want.results);
    this.hud.show(st === 'play' || st === 'paused');
    const gl = st === 'play' || st === 'paused' || xr;
    for (const s of ['L', 'R']) if (!gl) this.input.gloves[s].mesh.visible = false;
  }

  // ---- VR ----
  async enterVR() {
    if (this.xr || !navigator.xr) return;
    this.audio.ensure();
    let session;
    try {
      session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    } catch (e) {
      this.dom.toast('VR を開始できませんでした：' + e.message);
      return;
    }
    this.stopPreview();
    this.renderer.xr.setFramebufferScaleFactor(store.data.quality === 'low' ? 0.85 : 1.0);
    await this.renderer.xr.setSession(session);
    this.xr = true;
    this.input.bindSession(session);
    try {
      const rates = session.supportedFrameRates ? [...session.supportedFrameRates] : [];
      if (rates.includes(90) && session.updateTargetFrameRate) session.updateTargetFrameRate(90).catch(() => {});
    } catch { /* fixed frame rate */ }
    session.addEventListener('end', () => this.onXREnd());
    session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') this.pause(); });
    this.needPlace = true;
    this.toMenu();
    this.dom.onState();
  }

  onXREnd() {
    this.xr = false;
    if (this.state === 'play') this.pause();
    if (this.state !== 'results') this.toMenu();
    this.camera.position.set(0, 1.6, 0);
    this.camera.quaternion.identity();
    this.resize();
    this.panels();
    this.dom.onState();
  }

  xrPointers() {
    const st = this.state;
    const ui = st === 'menu' || st === 'paused' || st === 'results';
    const panels = [this.menu, this.pausePanel, this.resultsPanel].filter((p) => p.visible);
    const hits = {};
    if (ui) {
      for (const side of ['L', 'R']) {
        const r = this.input.rays[side];
        if (!r.on) continue;
        let best = null;
        for (const p of panels) { const h = p.pick(r.o, r.d); if (h && (!best || h.distance < best.distance)) best = { ...h, panel: p }; }
        if (best) hits[side] = best;
      }
      for (const p of panels) {
        const h = (hits.R && hits.R.panel === p && hits.R.button) ? hits.R : (hits.L && hits.L.panel === p && hits.L.button) ? hits.L : null;
        p.setHover(h ? h.button.id : null);
      }
    }
    for (const side of this.input.takeSelects()) {
      const h = hits[side];
      if (ui && h && h.button && h.button.onClick) {
        this.audio.ui();
        this.input.gloves[side].haptic(0.4, 20);
        h.button.onClick();
      }
    }
    this.input.showPointers(ui, hits);
  }

  // ---- PC camera ----
  deskCamera(dt) {
    const c = this.camera;
    this.duckT = Math.max(0, this.duckT - dt);
    const playing = this.state === 'play' || this.state === 'paused';
    // the player's head on a PC (the camera, except in the spectator view)
    const head = this.deskHead || (this.deskHead = new THREE.Object3D());
    const d = this.duckT > 0 ? smoothstep(0, 0.12, this.duckT) * smoothstep(0, 0.15, 0.7 - this.duckT + 0.15) : 0;
    head.position.set(0, 1.6 - d * 0.3, 0);
    head.rotation.set(-0.16, 0, 0, 'YXZ');
    head.updateMatrixWorld();
    if (params.get('view') === 'wide' && playing) {
      c.position.set(0.75, 1.9, 1.25);
      c.lookAt(-0.05, 1.3, -2.6);
    } else if (playing) {
      c.position.copy(head.position);
      c.quaternion.copy(head.quaternion);
    } else {
      c.position.set(0, 1.62, 0.2);
      c.rotation.set(-0.02 + Math.sin(this.t * 0.05) * 0.03, Math.sin(this.t * 0.045) * 0.6, 0, 'YXZ');
    }
    const src = playing ? head : c;
    this.input.head.copy(src.position);
    this.input.headQuat.copy(src.quaternion);
  }

  // ---- every frame ----
  frame(time, xrFrame) {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    const xr = this.renderer.xr.isPresenting;
    if (xr && xrFrame) {
      this.input.readXR(xrFrame, this.renderer.xr.getReferenceSpace(), dt);
      if (this.needPlace) { this.needPlace = false; this.menu.visible = false; this.panels(); }
    } else this.deskCamera(dt);

    const p = this.player;
    if (p && p.playing) {
      const disp = xr ? (xrFrame && xrFrame.predictedDisplayTime) || performance.now() + 20 : performance.now() + 12;
      this.songT = p.songTime(disp);
      if (p.pump) p.pump();
      if (this.songT > p.duration) p.stop();
    }
    if (this.preview) {
      if (this.preview.pump) this.preview.pump();
      if (this.audio.now() > this.previewEnd) { this.preview.seg.out.gain.setTargetAtTime(0, this.audio.now(), 0.5); if (this.audio.now() > this.previewEnd + 2) this.stopPreview(); }
    }

    const sess = this.session;
    if (this.state === 'play' && sess) {
      if (xr) {
        if (this.input.takePause()) this.pause();
        else sess.update(this.songT, dt);
      } else {
        const cam = this.deskHead || this.camera;
        // PC: simulate in 10 ms steps of song time, so punches land on time even at a low frame rate
        let from = this.simT === null || this.simT > this.songT ? this.songT - dt : this.simT;
        const span = this.songT - from;
        const n = Math.min(60, Math.max(1, Math.ceil(span / 0.01)));
        for (let i = 1; i <= n && this.state === 'play'; i++) {
          const t = from + (span * i) / n;
          this.desk.update(span / n || dt, cam, t);
          sess.update(t, span / n || dt);
        }
        this.simT = this.songT;
      }
    }
    if (xr) this.xrPointers();

    // lane, HUD, beat pulse
    let pulse = 0;
    const g = sess && sess.player.grid;
    if (sess && (this.state === 'play' || this.state === 'paused')) {
      const beat = (this.songT - g.t0) / g.spb;
      this.lane.set(beat, g.spb, sess.speed, store.data.labels, store.data.mode === 'sync');
      this.lane.fade(1, dt);
      this.hud.set(sess.hud(this.songT));
      const bar = sess.player.bars[Math.floor(beat / 4)];
      if (beat >= 0 && bar) pulse = Math.exp(-(beat - Math.floor(beat)) * 5) * (bar.e >= 1 ? 1 : 0.4);
    } else this.lane.fade(0, dt);
    for (const s of ['L', 'R']) this.input.gloves[s].update(dt);

    const headQ = this.input.headQuat;
    const localQ = this.playRoot.quaternion.clone().invert().multiply(headQ);
    this.fx.update(dt, localQ);
    const vh = xr ? 1800 : this.renderer.domElement.height;
    this.fx.uScale.value = vh;
    this.world.update(this.t, pulse, xr ? this.input.head : this.camera.position, vh);
    this.audio.tick(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

window.__app = new App();
