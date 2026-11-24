// js/input.js — one way to point, press and grab, whatever you hold:
//   - Meta Quest controllers: a laser from each hand (trigger or grip to press), and direct grabs with the hand
//   - hand tracking: the same laser from the hand, pinch to press, pinch close to an object to grab it
//   - mouse or touch: a ray from the camera through the cursor
// Things you can touch ("items") answer rayHit(ray) and/or near(handPos); the Interactor gives each pointer
// the closest one and sends it press / drag / release.
import * as THREE from 'three';

const GRAB_R = 0.07; // a hand this close (metres) to something grabbable takes it directly
const HAND_COL = { L: '#4cc9ff', R: '#ffb24c', M: '#ffffff' };

export class Pointer {
  constructor(side, kind, scene) {
    this.side = side;
    this.kind = kind;
    this.ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    this.pos = new THREE.Vector3(); // grip (hand) position; for the mouse, the ray origin
    this.quat = new THREE.Quaternion();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.velHist = [];
    this.valid = false;
    this.gripValid = false;
    this.held = false;
    this.pressed = false;
    this.justPressed = false;
    this.justReleased = false;
    this.downQ = false;
    this.upQ = false;
    this.axes = [0, 0];
    this.buttons = [];
    this.buttonsPrev = [];
    this.source = null;
    this.hover = null;
    this.active = null;
    this.isHand = false;
    if (kind === 'xr') {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      this.laser = new THREE.Line(g, new THREE.LineBasicMaterial({ color: HAND_COL[side], transparent: true, opacity: 0.75, depthWrite: false }));
      this.laser.frustumCulled = false;
      this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }));
      this.dot.renderOrder = 30;
      // a small glowing marker for the hand, so you always see where "you" are
      this.handMark = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 10), new THREE.MeshBasicMaterial({ color: HAND_COL[side], transparent: true, opacity: 0.85 }));
      this.laser.visible = this.dot.visible = this.handMark.visible = false;
      scene.add(this.laser, this.dot, this.handMark);
    }
  }

  down() { this.downQ = true; this.held = true; }
  up() { this.upQ = true; this.held = false; }

  step() {
    this.justPressed = this.justReleased = false;
    if (this.downQ) { this.downQ = false; this.justPressed = true; this.pressed = true; }
    else if (this.upQ) { this.upQ = false; this.justReleased = true; this.pressed = false; }
    else this.pressed = this.held;
  }

  button(i) { return !!this.buttons[i]; }
  buttonDown(i) { return !!this.buttons[i] && !this.buttonsPrev[i]; }

  // throw velocity: the strongest of the last few frames, so letting go a bit late still throws
  throwVelocity() {
    let best = new THREE.Vector3();
    for (const v of this.velHist) if (v.lengthSq() > best.lengthSq()) best = v;
    return best.clone();
  }

  haptic(intensity = 0.3, ms = 30) {
    const g = this.source && this.source.gamepad;
    const h = g && g.hapticActuators && g.hapticActuators[0];
    try {
      if (h && h.pulse) h.pulse(intensity, ms);
      else if (g && g.vibrationActuator) g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity }).catch(() => {});
    } catch { /* no haptics */ }
  }
}

export class Input {
  constructor(app) {
    this.app = app;
    const scene = app.scene;
    this.xr = { L: new Pointer('L', 'xr', scene), R: new Pointer('R', 'xr', scene) };
    this.mouse = new Pointer('M', 'mouse', scene);
    this.head = new THREE.Vector3(0, 1.6, 0);
    this.headQuat = new THREE.Quaternion();
    this.items = [];
    this.mouseNDC = new THREE.Vector2();
    this.mouseIn = false;
    this.look = null; // desktop: dragging the view
    this.yaw = 0;
    this.pitch = -0.12;
    this.wheel = 0;
    this.keys = new Set();
    this.tmpV = new THREE.Vector3();
    const el = app.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (app.xrActive) return;
      el.setPointerCapture?.(e.pointerId);
      this.setMouse(e);
      this.mouse.down();
      this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY;
      this.mouse.pointerType = e.pointerType;
    });
    el.addEventListener('pointermove', (e) => {
      if (app.xrActive) return;
      this.setMouse(e);
      if (this.look) {
        const k = e.pointerType === 'touch' ? 0.006 : 0.004;
        this.yaw += (e.clientX - this.look.x) * k;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.look.y) * k, -1.3, 1.3);
        this.look.x = e.clientX; this.look.y = e.clientY;
      }
    });
    const up = (e) => { if (!app.xrActive) { this.mouse.up(); this.look = null; } void e; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { this.mouseIn = false; });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { if (!e.repeat) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setMouse(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.mouseNDC.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.mouseIn = true;
  }

  bindSession(session) {
    const side = (e) => (e.inputSource.handedness === 'left' ? 'L' : e.inputSource.handedness === 'right' ? 'R' : null);
    for (const [ev, fn] of [['selectstart', 'down'], ['selectend', 'up'], ['squeezestart', 'down'], ['squeezeend', 'up']]) {
      session.addEventListener(ev, (e) => {
        const s = side(e);
        if (!s) return;
        const p = this.xr[s];
        // grip and trigger both mean "press"; count them so releasing one while holding the other keeps hold
        p.count = Math.max(0, (p.count || 0) + (fn === 'down' ? 1 : -1));
        if (fn === 'down' && p.count === 1) p.down();
        if (fn === 'up' && p.count === 0) p.up();
      });
    }
  }

  // read the headset and both hands for this XR frame
  readXR(frame, ref, dt) {
    const vp = frame.getViewerPose(ref);
    if (vp) {
      const p = vp.transform.position, o = vp.transform.orientation;
      this.head.set(p.x, p.y, p.z);
      this.headQuat.set(o.x, o.y, o.z, o.w);
    }
    const seen = { L: false, R: false };
    for (const src of frame.session.inputSources) {
      const s = src.handedness === 'left' ? 'L' : src.handedness === 'right' ? 'R' : null;
      if (!s) continue;
      const p = this.xr[s];
      p.source = src;
      p.isHand = !!src.hand;
      const rp = src.targetRaySpace && frame.getPose(src.targetRaySpace, ref);
      if (!rp) continue;
      seen[s] = true;
      const t = rp.transform;
      p.ray.origin.set(t.position.x, t.position.y, t.position.z);
      p.ray.direction.set(0, 0, -1).applyQuaternion(this.tmpQ(t.orientation));
      let gp = src.gripSpace && frame.getPose(src.gripSpace, ref);
      if (!gp && src.hand) {
        const j = src.hand.get('index-finger-metacarpal') || src.hand.get('wrist');
        gp = j && frame.getJointPose(j, ref);
      }
      p.prevPos.copy(p.pos);
      if (gp) {
        p.pos.set(gp.transform.position.x, gp.transform.position.y, gp.transform.position.z);
        p.quat.copy(this.tmpQ(gp.transform.orientation));
        p.gripValid = true;
      } else {
        p.pos.copy(p.ray.origin);
        p.quat.copy(this.tmpQ(t.orientation));
        p.gripValid = false;
      }
      if (!p.valid) p.prevPos.copy(p.pos);
      if (dt > 0) {
        const v = p.pos.clone().sub(p.prevPos).divideScalar(dt);
        p.vel.lerp(v, 0.5);
        p.velHist.push(v);
        if (p.velHist.length > 5) p.velHist.shift();
      }
      p.valid = true;
      const gpad = src.gamepad;
      p.buttonsPrev = p.buttons;
      p.buttons = gpad ? gpad.buttons.map((b) => b.pressed) : [];
      if (gpad && gpad.axes.length >= 4) p.axes = [gpad.axes[2], gpad.axes[3]];
      else if (gpad && gpad.axes.length >= 2) p.axes = [gpad.axes[0], gpad.axes[1]];
      else p.axes = [0, 0];
    }
    for (const s of ['L', 'R']) if (!seen[s]) { this.xr[s].valid = false; this.xr[s].axes = [0, 0]; }
  }

  tmpQ(o) { return new THREE.Quaternion(o.x, o.y, o.z, o.w); }

  readDesktop(camera) {
    camera.getWorldPosition(this.head);
    camera.getWorldQuaternion(this.headQuat);
    const m = this.mouse;
    m.valid = this.mouseIn || m.pressed;
    const rc = (this._rc ||= new THREE.Raycaster());
    rc.setFromCamera(this.mouseNDC, camera);
    m.ray.copy(rc.ray);
    m.prevPos.copy(m.pos);
    m.pos.copy(m.ray.origin);
  }

  pointers() {
    return this.app.xrActive ? [this.xr.L, this.xr.R] : [this.mouse];
  }

  // hover, press, drag, release. Returns the pointers whose press found nothing (the desktop turns those
  // into looking around).
  update(dt) {
    const free = [];
    for (const p of this.pointers()) {
      p.step();
      if (!p.valid) {
        if (p.active) { p.active.item.release?.(p); p.active = null; }
        this.showLaser(p, null);
        continue;
      }
      if (p.active) {
        if (p.pressed) p.active.item.drag?.(p, dt);
        else { p.active.item.release?.(p); p.active = null; }
        this.showLaser(p, p.active ? p.active.hit : null, p.active?.direct);
        continue;
      }
      let best = null;
      if (p.kind === 'xr') {
        let bd = GRAB_R;
        for (const it of this.items) {
          if (!it.near || (it.enabled && !it.enabled())) continue;
          const d = it.near(p.pos);
          if (d != null && d < bd) { bd = d; best = { item: it, hit: { d: 0, point: p.pos.clone() }, direct: true }; }
        }
      }
      if (!best) {
        // the nearest hit wins, except that a board you can read (priority) always wins over the invisible
        // grab zones around 3D things
        let bd = Infinity, pri = false;
        for (const it of this.items) {
          if (!it.rayHit || (it.enabled && !it.enabled())) continue;
          const h = it.rayHit(p.ray, p);
          if (!h) continue;
          const ip = !!it.priority;
          if ((ip && !pri) || (ip === pri && h.d < bd)) { bd = h.d; pri = ip; best = { item: it, hit: h, direct: false }; }
        }
      }
      if ((p.hover && p.hover.item) !== (best && best.item) || (best && best.hit.button !== p.hover?.hit?.button)) {
        p.hover?.item.hoverOff?.(p);
        best?.item.hoverOn?.(p, best.hit);
        if (best && p.kind === 'xr') p.haptic(0.08, 12);
      }
      p.hover = best;
      if (p.justPressed) {
        if (best && best.item.press && best.item.press(p, best.hit, best.direct) !== false) {
          p.active = best;
          p.haptic(0.35, 25);
        } else free.push(p);
      }
      this.showLaser(p, best ? best.hit : null, best?.direct);
    }
    return free;
  }

  showLaser(p, hit, direct) {
    if (p.kind !== 'xr') return;
    const on = p.valid && this.app.xrActive;
    p.handMark.visible = on;
    if (on) p.handMark.position.copy(p.pos);
    p.laser.visible = on && !direct && !this.app.hideLasers;
    p.dot.visible = on && !!hit && !direct;
    if (!on) return;
    const len = hit ? hit.d : 0.6;
    p.laser.position.copy(p.ray.origin);
    p.laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), p.ray.direction);
    p.laser.scale.set(1, 1, Math.max(0.01, len));
    p.laser.material.opacity = hit ? 0.85 : 0.3;
    if (hit) p.dot.position.copy(p.ray.at(hit.d, this.tmpV));
  }
}
