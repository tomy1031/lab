// js/main.js — THE MATRIX: COSMOS — WebXR VR + PC/Mobile Physics Sensory Experience
import * as THREE from 'three';
import { MatrixEnvironment } from './matrixEnv.js';
import { MatrixAudio } from './audio.js';
import { XRInput } from './xrInput.js';
import { HoloDock } from './hud3d.js';
import { LightspeedRealm } from './realms/lightspeed.js';
import { QuantumRealm } from './realms/quantum.js';
import { GravityRealm } from './realms/gravity.js';
import { DimensionsRealm } from './realms/dimensions.js';
import { StringsRealm } from './realms/strings.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

class MatrixCosmosApp {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: params.has('shot'),
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    if (this.renderer.xr.setFoveation) this.renderer.xr.setFoveation(0.35);
    $('stage').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.03, 120);
    this.scene.add(this.camera);

    // Everything lives inside this.world so VR recentering aligns the whole cosmos to your head & facing direction!
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.env = new MatrixEnvironment(this.scene);
    this.audio = new MatrixAudio();
    this.input = new XRInput(this);
    this.dock = new HoloDock(this);
    this.world.add(this.dock.mesh);

    this.realms = [
      new LightspeedRealm(this),
      new QuantumRealm(this),
      new GravityRealm(this),
      new DimensionsRealm(this),
      new StringsRealm(this),
    ];
    this.realms.forEach((r) => {
      r.group.visible = false;
      this.world.add(r.group);
    });

    this.realmIndex = 0;
    this.current = null;
    this.xrActive = false;
    this.started = false;
    this.hudHidden = false;
    this.vrSupported = false;
    this.lastHudHit = false;
    this.realmConsumesDrag = false;
    this._recenterFrames = 0;
    this._domAcc = 0;
    this._lastActionsKey = '';

    this.camPos = new THREE.Vector3(0, 1.58, 0.55);
    this.clock = new THREE.Clock();
    this.t = 0;

    this._initDOM();
    const initialRealm = Math.max(0, Math.min(this.realms.length - 1, Number(params.get('realm')) || 0));
    this.switchRealm(initialRealm, false);

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('keydown', (e) => this._onKeyDown(e));

    // Expose hook for automated testing & quick debugging
    window.__MATRIX_COSMOS__ = this;

    if (params.has('pc')) {
      this.startDesktop(initialRealm);
    }

    this.renderer.setAnimationLoop((time, frame) => this._frame(frame));
  }

  _onResize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  switchRealm(index, withEffect = true) {
    index = ((index % this.realms.length) + this.realms.length) % this.realms.length;
    if (this.current) {
      this.current.exit();
      this.current.group.visible = false;
    }
    this.realmIndex = index;
    this.current = this.realms[index];
    this.current.group.visible = true;
    this.current.enter();

    // Reset desktop camera to optimal panoramic vantage point for each realm
    this.camPos.set(0, 1.56, 0.55);
    this.input.yaw = 0;
    this.input.pitch = -0.04;

    if (withEffect) {
      this.env.triggerTransition();
      this.audio.realmShift();
    }
    this._syncRealmTabs();
    this._syncDOMHUD(true);
  }

  async enterVR(realmIdx = this.realmIndex) {
    if (!navigator.xr) return;
    this.audio.ensure();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'hand-tracking'],
      });
      await this.renderer.xr.setSession(session);
      this.xrActive = true;
      this.started = true;
      this.input.bindSession(session);
      this._recenterFrames = 4;
      $('start-screen').classList.add('hidden');
      $('hud').classList.add('hidden');
      this.dock.hiddenByUser = false;
      this.switchRealm(realmIdx, true);

      session.addEventListener('end', () => {
        this.xrActive = false;
        this.world.position.set(0, 0, 0);
        this.world.rotation.set(0, 0, 0);
        this.dock.mesh.visible = false;
        this._onResize();
        $('hud').classList.toggle('hidden', !this.started);
      });
    } catch (err) {
      this._toast('VR セッションを開始できませんでした: ' + (err?.message || err));
    }
  }

  recenter() {
    const h = this.input.head;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.input.headQuat);
    this.world.position.set(h.x, THREE.MathUtils.clamp(h.y - 1.58, -0.7, 0.4), h.z);
    this.world.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
    this.audio.click(920);
  }

  startDesktop(realmIdx = this.realmIndex) {
    this.audio.ensure();
    this.started = true;
    $('start-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.switchRealm(realmIdx, true);
  }

  showStartScreen() {
    this.started = false;
    $('start-screen').classList.remove('hidden');
    $('hud').classList.add('hidden');
  }

  _handleUIAction(id) {
    if (id.startsWith('realm:')) {
      this.switchRealm(Number(id.slice(6)), true);
      return;
    }
    if (id === 'sys:recenter') { this.recenter(); return; }
    if (id === 'sys:mute') {
      this.audio.setMuted(!this.audio.muted);
      $('btn-mute').textContent = this.audio.muted ? 'AUDIO OFF' : 'AUDIO ON';
      return;
    }
    if (id === 'sys:hide') {
      this.dock.hiddenByUser = true;
      this.audio.click(360);
      return;
    }
    this.current?.onAction(id);
    this._syncDOMHUD(true);
  }

  _onKeyDown(e) {
    if (!this.started || this.xrActive) return;
    if (e.target && /INPUT|TEXTAREA|BUTTON/.test(e.target.tagName) && e.code === 'Space') return;
    if (/^Digit[1-5]$/.test(e.code)) {
      this.switchRealm(Number(e.code.slice(5)) - 1, true);
    } else if (e.code === 'Space') {
      e.preventDefault();
      const state = this.current.getUIState();
      const hot = state.actions?.find((a) => a.hot) || state.actions?.[0];
      if (hot) this._handleUIAction(hot.id);
    } else if (e.code === 'KeyH') {
      this.hudHidden = !this.hudHidden;
      $('hud').classList.toggle('minimal', this.hudHidden);
    } else if (e.code === 'Escape') {
      this.showStartScreen();
    }
  }

  _updateDesktopCamera(dt) {
    const k = this.input.keys;
    if (k.has('ArrowLeft')) this.input.yaw -= dt * 1.4;
    if (k.has('ArrowRight')) this.input.yaw += dt * 1.4;

    const fwd = new THREE.Vector3(-Math.sin(this.input.yaw), 0, -Math.cos(this.input.yaw));
    const right = new THREE.Vector3(Math.cos(this.input.yaw), 0, -Math.sin(this.input.yaw));
    const spd = 2.0 * dt;
    if (k.has('KeyW')) this.camPos.addScaledVector(fwd, spd);
    if (k.has('KeyS')) this.camPos.addScaledVector(fwd, -spd);
    if (k.has('KeyA')) this.camPos.addScaledVector(right, -spd);
    if (k.has('KeyD')) this.camPos.addScaledVector(right, spd);
    if (k.has('KeyE')) this.camPos.y += spd;
    if (k.has('KeyQ')) this.camPos.y -= spd;

    if (this.input.wheelDelta) {
      this.camPos.addScaledVector(fwd, -this.input.wheelDelta * 0.25);
    }
    this.camPos.y = THREE.MathUtils.clamp(this.camPos.y, 0.45, 4.5);

    // Gentle idle parallax float on start screen
    if (!this.started) {
      const idleYaw = Math.sin(this.t * 0.22) * 0.14;
      this.camera.position.set(Math.sin(this.t * 0.18) * 0.25, 1.58, 0.75);
      this.camera.rotation.set(-0.04, idleYaw, 0, 'YXZ');
    } else {
      this.camera.position.copy(this.camPos);
      this.camera.rotation.set(this.input.pitch, -this.input.yaw, 0, 'YXZ');
    }
    this.camera.updateMatrixWorld();
  }

  _updateDesktopClicks() {
    if (!this.started || this.xrActive) return;
    // Quick direct click in 3D canvas triggers tactile realm interactions when not dragging camera
    if (this.input.mouseJustDown && !this.input.mouseDragging) {
      const r = this.current;
      if (r.id === 'gravity') {
        r.launchPhoton(this.input.mouseRay.origin, this.input.mouseRay.direction);
      } else if (r.id === 'strings') {
        // Pluck the nearest string to the clicked ray!
        let bestIdx = 0;
        let bestD = Infinity;
        r.strings.forEach((s, idx) => {
          const p = new THREE.Vector3(s.x, 1.56, s.z);
          const d = this.input.mouseRay.distanceToPoint(p);
          if (d < bestD) { bestD = d; bestIdx = idx; }
        });
        if (bestD < 0.45) r.pluck(bestIdx, 1.0);
      }
    }
  }

  _updateVRDockInteraction() {
    this.lastHudHit = false;
    let hovered = null;
    for (const h of [this.input.L, this.input.R]) {
      if (!h.valid) continue;
      // B / Y button (index 5) toggles dock visibility cleanly
      if (h.buttonDown(5)) {
        this.dock.hiddenByUser = !this.dock.hiddenByUser;
        this.audio.click(this.dock.hiddenByUser ? 360 : 720);
      }
      // A / X button (index 4) cycles realms forward/backward!
      if (h.buttonDown(4)) {
        this.switchRealm(this.realmIndex + (h.side === 'R' ? 1 : -1), true);
        h.haptic(0.35, 25);
      }

      const hit = this.dock.rayHit(h.ray);
      if (hit) {
        this.lastHudHit = true;
        this.input.setLaserVisual(h, hit.dist);
        if (hit.button) hovered = hit.button;
        if (hit.sliderVal != null && (h.trigger || h.grip)) {
          this.current.setSlider(hit.sliderVal);
          h.haptic(0.08, 8);
        } else if (hit.button && h.triggerDown) {
          this._handleUIAction(hit.button);
          h.haptic(0.4, 25);
        }
      } else {
        this.input.setLaserVisual(h, null);
      }
    }
    this.dock.hoverId = hovered;
  }

  _frame(xrFrame) {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;

    if (this.xrActive && xrFrame) {
      const ref = this.renderer.xr.getReferenceSpace();
      this.input.updateXR(xrFrame, ref, dt, this.t);
      if (this._recenterFrames > 0 && this.input.head.y > 0.3 && --this._recenterFrames === 0) {
        this.recenter();
      }
      this._updateVRDockInteraction();
    } else {
      this._updateDesktopCamera(dt);
      this.input.updateDesktop(this.camera);
      this._updateDesktopClicks();
    }

    this.world.updateMatrixWorld(true);
    this.current.update(dt, this.t, this.input);
    this.env.update(dt);

    const uiState = {
      ...this.current.getUIState(),
      realmIndex: this.realmIndex,
      realms: this.realms,
      muted: this.audio.muted,
    };

    if (this.xrActive) {
      this.dock.update(uiState);
    } else if (this.started) {
      this._domAcc += dt;
      if (this._domAcc > 0.08) {
        this._domAcc = 0;
        this._syncDOMHUD(false, uiState);
      }
    }

    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  _initDOM() {
    // Populate start screen realm chips & bottom HUD realm tabs
    const startGrid = $('start-realms');
    const tabBar = $('realm-tabs');

    this.realms.forEach((r, i) => {
      const chip = document.createElement('button');
      chip.className = 'realm-chip';
      chip.innerHTML = `<span class="num">0${i + 1}</span><span class="name">${r.shortLabel.slice(3)}</span>`;
      chip.onclick = () => {
        if (this.vrSupported) this.enterVR(i);
        else this.startDesktop(i);
      };
      startGrid.appendChild(chip);

      const tab = document.createElement('button');
      tab.className = 'tab-btn';
      tab.dataset.idx = String(i);
      tab.textContent = r.shortLabel;
      tab.onclick = () => this.switchRealm(i, true);
      tabBar.appendChild(tab);
    });

    $('btn-vr').onclick = () => this.enterVR(this.realmIndex);
    $('btn-vr-top').onclick = () => this.enterVR(this.realmIndex);
    $('btn-pc').onclick = () => this.startDesktop(this.realmIndex);
    $('btn-menu').onclick = () => this.showStartScreen();
    $('btn-mute').onclick = () => this._handleUIAction('sys:mute');
    $('btn-hide-hud').onclick = () => {
      this.hudHidden = !this.hudHidden;
      $('hud').classList.toggle('minimal', this.hudHidden);
      $('btn-hide-hud').textContent = this.hudHidden ? 'HUD 表示' : 'HUD 最小';
    };

    const slider = $('param-slider');
    slider.addEventListener('input', () => {
      this.audio.ensure();
      this.current.setSlider(Number(slider.value));
      this._syncDOMHUD(false);
    });

    // Check WebXR immersive-vr availability
    const status = $('vr-status');
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr
        .isSessionSupported('immersive-vr')
        .then((ok) => {
          this.vrSupported = ok;
          $('btn-vr').disabled = !ok;
          $('btn-vr-top').classList.toggle('hidden', !ok);
          status.textContent = ok
            ? '● WEBXR READY — Meta Quest 等の VR ヘッドセットで即座に接続可能'
            : '○ PC / モバイル ブラウザ検出 — 下のボタンで3D体感モードへ（QuestブラウザならVR覚醒可）';
        })
        .catch(() => {
          status.textContent = '○ PC / モバイル 3D体感モードで接続できます';
        });
    } else {
      status.textContent = '○ PC / モバイル 3D体感モードで接続できます（Quest ブラウザで VR 対応）';
    }

    this._registerSW();
  }

  _syncRealmTabs() {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.idx) === this.realmIndex);
    });
    const titleEl = $('realm-title');
    if (titleEl && this.current) titleEl.textContent = this.current.title;
  }

  _syncDOMHUD(forceActions = false, cachedState = null) {
    const st = cachedState || this.current.getUIState();
    $('telemetry-text').textContent = st.telemetry;
    $('insight-text').textContent = st.insight;

    if (st.slider) {
      $('slider-label').textContent = st.slider.label;
      $('slider-readout').textContent = st.slider.readout;
      const sl = $('param-slider');
      if (document.activeElement !== sl) {
        sl.value = String(st.slider.value);
      }
    }

    const actionsKey = JSON.stringify(st.actions);
    if (forceActions || actionsKey !== this._lastActionsKey) {
      this._lastActionsKey = actionsKey;
      const box = $('realm-actions');
      box.innerHTML = '';
      (st.actions || []).forEach((a) => {
        const btn = document.createElement('button');
        btn.className = 'act-btn' + (a.hot ? ' hot' : '') + (a.active ? ' active' : '');
        btn.textContent = a.label;
        btn.onclick = () => this._handleUIAction(a.id);
        box.appendChild(btn);
      });
    }
  }

  _toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  _registerSW() {
    if (window.MATRIX_COSMOS_BUILD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
}

new MatrixCosmosApp();
