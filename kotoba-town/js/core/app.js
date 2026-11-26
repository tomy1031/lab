// Renderer, camera rig, WebXR session, frame loop and pointer input (mouse + XR controllers/hands).
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/**
 * Standing eye height, matched to the townspeople (their eyes are at 1.45–1.71 m, about 1.6 m on average),
 * so the learner looks at faces straight on. In VR the real head height is measured and the world is
 * shifted to this height (a tall learner would otherwise look down on everyone).
 */
export const EYE_HEIGHT = 1.57;
/** Eye height when the learner sits on a chair (interviews). */
export const SEATED_EYE = 1.18;

export class App {
  constructor(container) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(0.6);
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 400);
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.rig = new THREE.Group(); // moved to the learner's spot in each scene
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.clock = new THREE.Clock();
    this.updaters = new Set();
    this.yaw = 0; this.pitch = 0; // desktop look
    this.inXR = false;
    this.eyeOffset = 0; // VR: world shift that puts the learner's eyes at EYE_HEIGHT
    this.calibrateIn = 0; // VR: frames until the head height is measured

    this.raycaster = new THREE.Raycaster();
    this.interactive = new Set(); // objects with userData.onClick / onHover
    this.hovered = new Map();     // source → object
    this.pointer = new THREE.Vector2(-9, -9);
    this.controllers = [];
    this._setupDesktop();
    this._setupXR();

    window.addEventListener('resize', () => this.resize());
    r.setAnimationLoop((t, frame) => this._frame(t, frame));
  }

  resize() {
    const w = window.innerWidth; const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  /**
   * Run fn(k) with k going 0 → 1 over ms, driven by the render loop (window.requestAnimationFrame does not
   * run during an immersive WebXR session on Quest). Resolves when done; a later tween with the same key
   * replaces this one.
   */
  tween(ms, fn, key = null) {
    if (key && this._tweens?.[key]) this._tweens[key]();
    this._tweens ||= {};
    const t0 = performance.now();
    return new Promise((resolve) => {
      let off = null;
      const stop = () => { off?.(); if (key && this._tweens[key] === stop) delete this._tweens[key]; resolve(); };
      off = this.onUpdate(() => {
        const k = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
        fn(k);
        if (k >= 1) stop();
      });
      if (key) this._tweens[key] = stop;
      fn(0);
    });
  }

  /** Put the learner at a spot (feet position, facing yaw radians). */
  placeRig(pos, yaw) {
    this.rig.position.copy(pos);
    this.rig.rotation.set(0, yaw, 0);
    this.rigBaseY = pos.y;
    this.seatOffset = 0;
    this._tweens?.seat?.();
    if (!this.inXR) this.camera.position.y = EYE_HEIGHT;
    else { this.calibrateEyes(); this._applyRigY(); } // a new place: measure the head height again
    this.yaw = 0; this.pitch = 0;
    this._applyLook();
  }

  /**
   * Sit down / stand up: the eyes move smoothly to chair height and back. On PC the camera moves; in VR
   * the world moves instead, so a learner who stands in the room still sees from the chair (someone who
   * really sits down needs no change).
   */
  setSeated(on, ms = 900) {
    // in VR the eyes are already brought to EYE_HEIGHT (calibrateEyes), so the same drop works for both
    const target = on ? SEATED_EYE - EYE_HEIGHT : 0;
    const from = this.seatOffset || 0;
    return this.tween(ms, (k) => {
      const e = k * k * (3 - 2 * k);
      this.seatOffset = from + (target - from) * e;
      if (this.inXR) this._applyRigY();
      else { this.rig.position.y = this.rigBaseY || 0; this.camera.position.y = EYE_HEIGHT + this.seatOffset; }
    }, 'seat');
  }

  /** VR: the rig height = the spot + the eye-height shift + sitting. */
  _applyRigY() {
    this.rig.position.y = (this.rigBaseY || 0) + (this.inXR ? this.eyeOffset : 0) + (this.seatOffset || 0) * (this.inXR ? 1 : 0);
  }

  /**
   * VR: measure the learner's real eye height (local-floor) and shift the world so their eyes are at
   * EYE_HEIGHT, the townspeople's eye level. Done when the session starts and at every new place, so a
   * learner who sits down or stands up in the real room is matched again at the next scene.
   */
  calibrateEyes() {
    const y = this.camera.position.y; // head height above the real floor (pose from the headset)
    if (!this.inXR || !(y > 0.5 && y < 2.4)) { this.calibrateIn = Math.max(this.calibrateIn, 10); return false; } // no pose yet
    this.eyeOffset = Math.max(-0.7, Math.min(0.6, EYE_HEIGHT - y));
    return true;
  }

  /** World position of the learner's eyes. */
  headPosition(target = new THREE.Vector3()) { return this.camera.getWorldPosition(target); }

  addInteractive(obj) { this.interactive.add(obj); return obj; }
  removeInteractive(obj) { this.interactive.delete(obj); }
  clearInteractive() { this.interactive.clear(); this.hovered.clear(); }

  // ------------------------------------------------------------- desktop input
  _setupDesktop() {
    const el = this.renderer.domElement;
    let dragging = false; let moved = 0; let lx = 0; let ly = 0;
    el.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (!dragging || this.inXR) return;
      const dx = e.clientX - lx; const dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.0042;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0042, -1.2, 1.2);
      this._applyLook();
    });
    el.addEventListener('pointerup', (e) => {
      dragging = false;
      if (moved < 6 && !this.inXR) {
        this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        this._click(this.raycaster, 'mouse');
      }
    });
    el.addEventListener('pointerleave', () => { this.pointer.set(-9, -9); });
    window.addEventListener('keydown', (e) => {
      if (this.inXR) return;
      if (e.key === 'ArrowLeft') { this.yaw += 0.15; this._applyLook(); }
      if (e.key === 'ArrowRight') { this.yaw -= 0.15; this._applyLook(); }
    });
  }

  _applyLook() {
    if (this.inXR) return;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /** Desktop: turn the view smoothly toward a world point (used to face the speaking NPC). */
  lookToward(worldPos, amount = 1) {
    if (this.inXR) return;
    const eye = this.headPosition();
    const local = this.rig.worldToLocal(worldPos.clone());
    const eyeLocal = this.rig.worldToLocal(eye.clone());
    const d = local.sub(eyeLocal);
    const targetYaw = Math.atan2(-d.x, -d.z);
    const targetPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * amount;
    this.pitch += (THREE.MathUtils.clamp(targetPitch, -0.6, 0.4) - this.pitch) * amount;
    this._applyLook();
  }

  // ------------------------------------------------------------------ XR input
  _setupXR() {
    const r = this.renderer;
    const factory = new XRControllerModelFactory();
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const c = r.xr.getController(i);
      const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.75 }));
      line.scale.z = 3;
      line.name = 'ray';
      c.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
      dot.visible = false;
      this.scene.add(dot);
      c.userData.dot = dot;
      c.addEventListener('selectstart', () => this._xrSelect(c));
      c.addEventListener('connected', (e) => { c.userData.hand = !!e.data.hand; line.visible = !e.data.hand; c.userData.gamepad = e.data.gamepad; });
      c.addEventListener('disconnected', () => { c.userData.gamepad = null; });
      this.rig.add(c);
      const grip = r.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      this.rig.add(grip);
      this.controllers.push(c);
    }
    r.xr.addEventListener('sessionstart', () => {
      this.inXR = true;
      this.eyeOffset = 0;
      this.calibrateIn = 20; // the headset pose settles over the first frames
      this.camera.rotation.set(0, 0, 0);
      document.body.classList.add('xr');
      this.onXRChange?.(true);
    });
    r.xr.addEventListener('sessionend', () => {
      this.inXR = false;
      this.eyeOffset = 0;
      this.rig.position.y = this.rigBaseY || 0;
      this.camera.position.set(0, EYE_HEIGHT + (this.seatOffset || 0), 0);
      document.body.classList.remove('xr');
      this._applyLook();
      this.onXRChange?.(false);
    });
  }

  _rayFrom(ctrl) {
    const m = new THREE.Matrix4().extractRotation(ctrl.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);
    return this.raycaster;
  }

  _xrSelect(ctrl) { this._click(this._rayFrom(ctrl), ctrl); }

  _hit(raycaster) {
    const list = [...this.interactive].filter((o) => o.visible && isShown(o));
    const hits = raycaster.intersectObjects(list, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !this.interactive.has(o)) o = o.parent;
      if (o && (o.userData.onClick || o.userData.onHover || o.userData.onPointer)) return { obj: o, point: h.point, distance: h.distance, uv: h.uv };
    }
    return null;
  }

  _click(raycaster, source) {
    const hit = this._hit(raycaster);
    if (hit?.obj.userData.onClick && !hit.obj.userData.disabled) hit.obj.userData.onClick(hit, source);
    else this.onEmptyClick?.(raycaster, source);
  }

  async enterVR() {
    if (!navigator.xr) throw new Error('WebXR not available');
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    });
    await this.renderer.xr.setSession(session);
    return session;
  }

  exitVR() { this.renderer.xr.getSession()?.end(); }

  _frame(t, frame) {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.inXR && this.calibrateIn > 0 && --this.calibrateIn === 0 && this.calibrateEyes()) this._applyRigY();
    // hover for mouse + controllers
    const sources = [];
    if (this.inXR) for (const c of this.controllers) { if (c.userData.gamepad || c.userData.hand) sources.push([c, this._rayFrom(c).ray.clone()]); }
    else if (this.pointer.x > -2) { this.raycaster.setFromCamera(this.pointer, this.camera); sources.push(['mouse', this.raycaster.ray.clone()]); }
    const now = new Set();
    for (const [src, ray] of sources) {
      this.raycaster.ray.copy(ray);
      const hit = this._hit(this.raycaster);
      if (src !== 'mouse') {
        const line = src.getObjectByName('ray');
        if (line) line.scale.z = hit ? hit.distance : 3;
        src.userData.dot.visible = !!hit;
        if (hit) src.userData.dot.position.copy(hit.point);
      }
      if (hit) { now.add(hit.obj); hit.obj.userData.onPointer?.(hit, src); }
    }
    for (const o of this.interactive) {
      const on = now.has(o);
      if (!!o.userData.hover !== on) { o.userData.hover = on; o.userData.onHover?.(on); if (!on) o.userData.onPointer?.(null); }
    }
    if (!this.inXR) this.renderer.domElement.style.cursor = now.size ? 'pointer' : 'grab';
    // thumbstick snap turn
    if (this.inXR) this._sticks(dt);
    for (const fn of this.updaters) fn(dt, t / 1000, frame);
    this.renderer.render(this.scene, this.camera);
  }

  _sticks() {
    for (const c of this.controllers) {
      const gp = c.userData.gamepad;
      if (!gp || !gp.axes) continue;
      const x = gp.axes[2] ?? 0;
      if (Math.abs(x) > 0.7 && !c.userData.turned) {
        c.userData.turned = true;
        const head = this.headPosition();
        const before = head.clone();
        this.rig.rotateY(x > 0 ? -Math.PI / 6 : Math.PI / 6);
        this.rig.updateMatrixWorld(true);
        const after = this.headPosition();
        this.rig.position.add(before.sub(after)); // turn around the head, not the rig origin
      } else if (Math.abs(x) < 0.3) c.userData.turned = false;
      // A / X button → "help" shortcut handled by the game
      const pressed = gp.buttons?.[4]?.pressed || gp.buttons?.[5]?.pressed;
      if (pressed && !c.userData.btn) this.onButton?.('primary');
      c.userData.btn = pressed;
    }
  }
}

function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
