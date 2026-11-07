import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// One pointer abstraction for Touch controllers, tracked hands and the mouse.
// - Controllers: trigger = select, thumbstick = direction answer, B/Y = pause.
// - Hands: the system aim ray, pinch = select; pinch-and-swipe = flick. Fingertips glow.
// - Mouse: left button = select / drag to flick, right-drag = look around, arrows = direction.

const JOINTS = ['wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'];
const TIPS = new Set(['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip']);

function rayMesh() {
  const geo = new THREE.CylinderGeometry(0.0012, 0.0035, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Vector3(0.65, 0.88, 1.0) }, uAlpha: { value: 0.8 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vT; void main(){ vT = -position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vT; void main(){ gl_FragColor = vec4(uColor * uAlpha * (1.0 - vT) * smoothstep(0.0, 0.05, vT), 1.0); }',
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 70; m.frustumCulled = false;
  return m;
}

function cursorMesh() {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32), new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, fog: false }));
  m.renderOrder = 80; m.visible = false;
  return m;
}

export class Pointer {
  constructor(kind, index) {
    this.kind = kind;              // 'xr' | 'mouse'
    this.index = index;
    this.isHand = false;
    this.handedness = index === 0 ? 'left' : 'right';
    this.active = kind === 'mouse';
    this.ray = new THREE.Ray();
    this.pressed = false;
    this.pressDir = new THREE.Vector3();
    this.pressTime = 0;
    this.hoverUI = null;           // {panel, button, point, distance}
    this.inputSource = null;
    this.pinch = 0;
    this.axes = { x: 0, y: 0 };
    this.btnPrev = [];
  }
  get origin() { return this.ray.origin; }
  get dir() { return this.ray.direction; }
}

export class Input {
  constructor(app) {
    this.app = app;
    this.pointers = [];
    this.handVis = [];
    const xr = app.renderer.xr;
    const factory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const p = new Pointer('xr', i);
      const ctrl = xr.getController(i);
      const grip = xr.getControllerGrip(i);
      const hand = xr.getHand(i);
      grip.add(factory.createControllerModel(grip));
      p.ctrl = ctrl; p.grip = grip; p.hand = hand;
      p.line = rayMesh(); p.cursor = cursorMesh();
      p.line.visible = false;
      app.scene.add(ctrl, grip, hand, p.line, p.cursor);
      const vis = this.makeHandVisual();
      app.scene.add(vis.mesh);
      p.handVisual = vis;
      ctrl.addEventListener('connected', (e) => {
        p.inputSource = e.data; p.active = true;
        p.handedness = e.data.handedness; p.isHand = !!e.data.hand;
        grip.visible = !p.isHand;
      });
      ctrl.addEventListener('disconnected', () => { p.active = false; p.inputSource = null; p.line.visible = false; p.cursor.visible = false; vis.mesh.visible = false; });
      ctrl.addEventListener('selectstart', () => this.selectStart(p));
      ctrl.addEventListener('selectend', () => this.selectEnd(p));
      this.pointers.push(p);
    }
    // mouse / touch
    const m = new Pointer('mouse', 2);
    m.cursor = cursorMesh();
    app.scene.add(m.cursor);
    this.mouse = m;
    this.pointers.push(m);
    this.ndc = new THREE.Vector2(0, 0);
    this.look = { yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0 };
    this.bindDom(app.renderer.domElement);
    this.raycaster = new THREE.Raycaster();
  }

  makeHandVisual() {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), JOINTS.length);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 65;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(JOINTS.length * 3), 3);
    return { mesh };
  }

  bindDom(el) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (this.app.renderer.xr.isPresenting) return;
      this.setNdc(e);
      if (e.button === 2 && this.app.view.kind === 'desktop') {
        this.look.dragging = true; this.look.lastX = e.clientX; this.look.lastY = e.clientY;
        return;
      }
      if (e.button === 0) { this.app.audio.init(); this.updateMouseRay(); this.selectStart(this.mouse); }
    });
    window.addEventListener('pointermove', (e) => {
      this.setNdc(e);
      if (this.look.dragging) {
        this.look.yaw -= (e.clientX - this.look.lastX) * 0.0035;
        this.look.pitch = Math.max(-1.2, Math.min(1.2, this.look.pitch - (e.clientY - this.look.lastY) * 0.0035));
        this.look.lastX = e.clientX; this.look.lastY = e.clientY;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) { this.look.dragging = false; return; }
      if (this.mouse.pressed) { this.updateMouseRay(); this.selectEnd(this.mouse); }
    });
    window.addEventListener('keydown', (e) => {
      if (this.app.renderer.xr.isPresenting) return;
      const map = { ArrowRight: 0, ArrowUp: 1, ArrowLeft: 2, ArrowDown: 3, d: 0, w: 1, a: 2, s: 3 };
      if (e.key in map) { e.preventDefault(); this.app.onDirection(map[e.key], null); }
      else if (e.key === 'Escape' || e.key === 'p') this.app.togglePause();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.app.onConfirm?.(); }
    });
  }

  setNdc(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  updateMouseRay() {
    this.raycaster.setFromCamera(this.ndc, this.app.camera);
    this.mouse.ray.copy(this.raycaster.ray);
  }

  selectStart(p) {
    p.pressed = true;
    p.pressDir.copy(p.dir);
    p.pressTime = performance.now();
    if (p.hoverUI?.button) { p.consumed = true; return; }   // UI buttons fire on release
    p.consumed = false;
    this.app.onSelectStart(p);
  }

  selectEnd(p) {
    if (!p.pressed) return;
    p.pressed = false;
    if (p.consumed) {
      p.consumed = false;
      const h = this.app.ui.hit(p.ray);
      if (h?.button) { this.pulse(p, 0.35, 25); this.app.audio.bell(h.point, { midi: 81, vel: 0.25, dur: 0.5 }); h.button.onClick?.(); }
      return;
    }
    this.app.onSelectEnd(p);
  }

  pulse(p, intensity = 0.5, ms = 40) {
    const act = p.inputSource?.gamepad?.hapticActuators?.[0];
    try { act?.pulse?.(intensity, ms); } catch (e) { /* not supported */ }
  }

  /** Flick direction (0 right, 1 up, 2 left, 3 down) from the ray movement since press, or -1. */
  flickDirection(p, minDeg = 2.5) {
    const app = this.app;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(app.headQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(app.headQuat);
    const d = p.dir.clone().sub(p.pressDir);
    const x = d.dot(right), y = d.dot(up);
    const mag = Math.hypot(x, y) * 57.3;
    if (mag < minDeg) return -1;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 0 : 2;
    return y > 0 ? 1 : 3;
  }

  update(dt) {
    const app = this.app;
    const presenting = app.renderer.xr.isPresenting;
    for (const p of this.pointers) {
      if (p.kind === 'xr') {
        if (!presenting || !p.active) { p.line.visible = false; p.cursor.visible = false; p.handVisual.mesh.visible = false; continue; }
        p.ray.origin.copy(p.ctrl.position);
        p.ray.direction.set(0, 0, -1).applyQuaternion(p.ctrl.quaternion).normalize();
        this.updateHand(p);
        this.updateGamepad(p);
      } else {
        if (presenting) { p.cursor.visible = false; continue; }
        this.updateMouseRay();
      }
      // UI hover
      const h = app.ui.hit(p.ray);
      if (p.hoverUI?.panel && p.hoverUI.panel !== h?.panel) p.hoverUI.panel.setHover(null);
      p.hoverUI = h;
      if (h) h.panel.setHover(h.button?.id ?? null);
      // module hover / ray length
      const tgt = h ? { point: h.point, distance: h.distance } : app.pointerTarget(p);
      const len = tgt ? tgt.distance : 3.0;
      if (p.line) {
        p.line.visible = true;
        p.line.position.copy(p.ray.origin);
        p.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), p.ray.direction);
        p.line.scale.set(1, 1, Math.min(len, 8));
        p.line.material.uniforms.uAlpha.value = p.pressed ? 1.0 : 0.65;
      }
      if (tgt) {
        p.cursor.visible = true;
        p.cursor.position.copy(tgt.point);
        p.cursor.lookAt(app.head);
        const fovK = presenting ? 1 : app.camera.fov / 62;   // keep the cursor the same size on screen
        const s = Math.max(0.006 * fovK, tgt.distance * 0.006 * fovK) * (p.pressed ? 0.7 : 1);
        p.cursor.scale.setScalar(s);
      } else p.cursor.visible = false;
    }
  }

  updateHand(p) {
    const vis = p.handVisual.mesh;
    if (!p.isHand || !p.hand.joints) { vis.visible = false; return; }
    const j = p.hand.joints;
    const m = new THREE.Matrix4(), s = new THREE.Vector3();
    let any = false;
    JOINTS.forEach((name, i) => {
      const jt = j[name];
      if (!jt || !jt.visible) { m.makeScale(0, 0, 0); vis.setMatrixAt(i, m); return; }
      any = true;
      const r = (jt.jointRadius || 0.008) * (TIPS.has(name) ? 1.1 : 0.7);
      m.compose(jt.position, jt.quaternion, s.set(r, r, r));
      vis.setMatrixAt(i, m);
      const tip = TIPS.has(name);
      const glow = tip ? 1.0 : 0.55;
      vis.instanceColor.setXYZ(i, 0.62 * glow + p.pinch * 0.3, 0.85 * glow, 1.0 * glow);
    });
    vis.visible = any;
    vis.instanceMatrix.needsUpdate = true;
    vis.instanceColor.needsUpdate = true;
    const a = j['thumb-tip'], b = j['index-finger-tip'];
    if (a && b && a.visible && b.visible) {
      const d = a.position.distanceTo(b.position);
      p.pinch = Math.max(0, Math.min(1, (0.06 - d) / 0.045));
    }
    p.line && (p.line.material.uniforms.uColor.value.set(0.65 + p.pinch * 0.3, 0.88, 1.0));
  }

  updateGamepad(p) {
    const gp = p.inputSource?.gamepad;
    if (!gp) return;
    const ax = gp.axes;
    const x = ax.length >= 4 ? ax[2] : ax[0] || 0, y = ax.length >= 4 ? ax[3] : ax[1] || 0;
    const was = Math.hypot(p.axes.x, p.axes.y) > 0.7;
    p.axes.x = x; p.axes.y = y;
    const now = Math.hypot(x, y) > 0.7;
    if (now && !was) {
      const dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 0 : 2) : (y < 0 ? 1 : 3);   // stick up is negative y
      this.app.onDirection(dir, p);
    }
    const btn = gp.buttons;
    for (const idx of [4, 5]) {
      const pressed = !!btn[idx]?.pressed;
      if (pressed && !p.btnPrev[idx] && idx === 5) this.app.togglePause();
      p.btnPrev[idx] = pressed;
    }
  }
}
