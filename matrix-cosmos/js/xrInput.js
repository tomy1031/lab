// js/xrInput.js — Unified WebXR (Quest controllers + hand tracking) & Desktop/Touch input with cybernetic Matrix hands
import * as THREE from 'three';

class HandState {
  constructor(side, scene) {
    this.side = side; // 'L' | 'R'
    this.valid = false;
    this.isHand = false;
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    this.axes = [0, 0];
    this.trigger = false;
    this.triggerDown = false;
    this.triggerUp = false;
    this.grip = false;
    this.gripDown = false;
    this.buttons = [];
    this.prevButtons = [];
    this.source = null;
    this._trigQ = false;
    this._trigUpQ = false;
    this._gripQ = false;

    const col = side === 'L' ? '#00f0ff' : '#00ff55';
    this.group = new THREE.Group();
    // Sleek cybernetic Matrix hand orb + wireframe shell
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.022, 1),
      new THREE.MeshBasicMaterial({ color: '#d8ffe6', transparent: true, opacity: 0.9 })
    );
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.036, 0),
      new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.75 })
    );
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.044, 0.052, 24),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
    );
    this.group.add(core, cage, this.ring);
    this.cage = cage;

    // Matrix laser beam
    const lg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    this.laser = new THREE.Line(
      lg,
      new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.65, depthWrite: false })
    );
    this.laser.frustumCulled = false;

    this.dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true })
    );
    this.dot.renderOrder = 40;

    this.group.visible = false;
    this.laser.visible = false;
    this.dot.visible = false;
    scene.add(this.group, this.laser, this.dot);
  }

  buttonDown(idx) {
    return !!this.buttons[idx] && !this.prevButtons[idx];
  }

  haptic(intensity = 0.35, ms = 25) {
    const g = this.source && this.source.gamepad;
    const h = g && g.hapticActuators && g.hapticActuators[0];
    try {
      if (h && h.pulse) h.pulse(intensity, ms);
      else if (g && g.vibrationActuator) {
        g.vibrationActuator.playEffect('dual-rumble', {
          duration: ms,
          strongMagnitude: intensity,
          weakMagnitude: intensity,
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  }
}

export class XRInput {
  constructor(app) {
    this.app = app;
    this.L = new HandState('L', app.scene);
    this.R = new HandState('R', app.scene);
    this.head = new THREE.Vector3(0, 1.6, 0);
    this.headQuat = new THREE.Quaternion();

    // Desktop / touch pointer & camera look
    this.yaw = 0;
    this.pitch = -0.06;
    this.keys = new Set();
    this.mouseNDC = new THREE.Vector2();
    this.mouseRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    this.mouseDown = false;
    this.mouseJustDown = false;
    this.mouseDragging = false;
    this.mouseVel = new THREE.Vector2();
    this.wheelDelta = 0;
    this._rc = new THREE.Raycaster();
    this._dragStart = null;
    this._lastPtr = { x: 0, y: 0 };
    this._tmpQ = new THREE.Quaternion();
    this._tmpV = new THREE.Vector3();

    const el = app.renderer.domElement;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => {
      if (app.xrActive) return;
      this.app.audio.ensure();
      el.setPointerCapture?.(e.pointerId);
      this._updateNDC(e);
      this.mouseDown = true;
      this.mouseJustDown = true;
      this.mouseDragging = false;
      this._dragStart = { x: e.clientX, y: e.clientY };
      this._lastPtr = { x: e.clientX, y: e.clientY };
    });

    el.addEventListener('pointermove', (e) => {
      if (app.xrActive) return;
      this._updateNDC(e);
      const dx = e.clientX - this._lastPtr.x;
      const dy = e.clientY - this._lastPtr.y;
      this.mouseVel.set(dx, dy);
      if (this.mouseDown) {
        if (!this.mouseDragging && this._dragStart) {
          if (Math.hypot(e.clientX - this._dragStart.x, e.clientY - this._dragStart.y) > 4) {
            this.mouseDragging = true;
          }
        }
        // Only rotate camera if active realm isn't consuming the drag
        if (!this.app.realmConsumesDrag) {
          const sens = e.pointerType === 'touch' ? 0.0052 : 0.0036;
          this.yaw += dx * sens;
          this.pitch = THREE.MathUtils.clamp(this.pitch + dy * sens, -1.25, 1.25);
        }
      }
      this._lastPtr = { x: e.clientX, y: e.clientY };
    });

    const onUp = () => {
      this.mouseDown = false;
      this._dragStart = null;
      this.app.realmConsumesDrag = false;
    };
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    el.addEventListener('wheel', (e) => {
      if (app.xrActive) return;
      this.wheelDelta += Math.sign(e.deltaY) * Math.min(2.5, Math.abs(e.deltaY) / 80);
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { if (!e.repeat) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _updateNDC(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.mouseNDC.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
  }

  bindSession(session) {
    const getHand = (e) =>
      e.inputSource.handedness === 'left' ? this.L : e.inputSource.handedness === 'right' ? this.R : null;

    session.addEventListener('selectstart', (e) => {
      const h = getHand(e);
      if (h) { h._trigQ = true; h.trigger = true; }
    });
    session.addEventListener('selectend', (e) => {
      const h = getHand(e);
      if (h) { h._trigUpQ = true; h.trigger = false; }
    });
    session.addEventListener('squeezestart', (e) => {
      const h = getHand(e);
      if (h) { h._gripQ = true; h.grip = true; }
    });
    session.addEventListener('squeezeend', (e) => {
      const h = getHand(e);
      if (h) { h.grip = false; }
    });
  }

  updateXR(frame, refSpace, dt, t) {
    const vp = frame.getViewerPose(refSpace);
    if (vp) {
      const p = vp.transform.position;
      const o = vp.transform.orientation;
      this.head.set(p.x, p.y, p.z);
      this.headQuat.set(o.x, o.y, o.z, o.w);
    }

    const seen = { L: false, R: false };
    for (const src of frame.session.inputSources) {
      const side = src.handedness === 'left' ? 'L' : src.handedness === 'right' ? 'R' : null;
      if (!side) continue;
      const h = this[side];
      h.source = src;
      h.isHand = !!src.hand;

      const rp = src.targetRaySpace && frame.getPose(src.targetRaySpace, refSpace);
      if (!rp) continue;
      seen[side] = true;

      const rt = rp.transform;
      this._tmpQ.set(rt.orientation.x, rt.orientation.y, rt.orientation.z, rt.orientation.w);
      h.ray.origin.set(rt.position.x, rt.position.y, rt.position.z);
      h.ray.direction.set(0, 0, -1).applyQuaternion(this._tmpQ);

      let gp = src.gripSpace && frame.getPose(src.gripSpace, refSpace);
      if (!gp && src.hand) {
        const j = src.hand.get('index-finger-tip') || src.hand.get('wrist');
        gp = j && frame.getJointPose(j, refSpace);
      }

      h.prevPos.copy(h.pos);
      if (gp) {
        const gt = gp.transform;
        h.pos.set(gt.position.x, gt.position.y, gt.position.z);
        h.quat.set(gt.orientation.x, gt.orientation.y, gt.orientation.z, gt.orientation.w);
      } else {
        h.pos.copy(h.ray.origin);
        h.quat.copy(this._tmpQ);
      }
      if (!h.valid) h.prevPos.copy(h.pos);
      if (dt > 0) {
        h.vel.copy(h.pos).sub(h.prevPos).divideScalar(dt);
      }

      h.valid = true;
      h.triggerDown = h._trigQ;
      h.triggerUp = h._trigUpQ;
      h.gripDown = h._gripQ;
      h._trigQ = h._trigUpQ = h._gripQ = false;

      const gpad = src.gamepad;
      h.prevButtons = h.buttons;
      h.buttons = gpad ? gpad.buttons.map((b) => b.pressed) : [];
      if (gpad && gpad.axes.length >= 4) h.axes = [gpad.axes[2], gpad.axes[3]];
      else if (gpad && gpad.axes.length >= 2) h.axes = [gpad.axes[0], gpad.axes[1]];
      else h.axes = [0, 0];

      // Visual cybernetic hand
      h.group.visible = true;
      h.group.position.copy(h.pos);
      h.group.quaternion.copy(h.quat);
      h.cage.rotation.y = t * 1.4;
      h.cage.rotation.x = t * 0.9;
      h.ring.scale.setScalar(h.trigger || h.grip ? 1.35 : 1.0);
    }

    for (const side of ['L', 'R']) {
      const h = this[side];
      if (!seen[side]) {
        h.valid = false;
        h.axes = [0, 0];
        h.triggerDown = h.triggerUp = h.gripDown = false;
        h.group.visible = false;
        h.laser.visible = false;
        h.dot.visible = false;
      }
    }
  }

  setLaserVisual(hand, hitDist = null) {
    if (!hand.valid || !this.app.xrActive) {
      hand.laser.visible = false;
      hand.dot.visible = false;
      return;
    }
    hand.laser.visible = true;
    const len = hitDist != null ? hitDist : 1.8;
    hand.laser.position.copy(hand.ray.origin);
    hand.laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), hand.ray.direction);
    hand.laser.scale.set(1, 1, Math.max(0.02, len));
    hand.laser.material.opacity = hitDist != null ? 0.9 : 0.25;
    hand.dot.visible = hitDist != null;
    if (hitDist != null) {
      hand.dot.position.copy(hand.ray.at(hitDist, this._tmpV));
    }
  }

  updateDesktop(camera) {
    camera.getWorldPosition(this.head);
    camera.getWorldQuaternion(this.headQuat);
    this._rc.setFromCamera(this.mouseNDC, camera);
    this.mouseRay.copy(this._rc.ray);
  }

  endFrame() {
    this.mouseJustDown = false;
    this.wheelDelta = 0;
    this.mouseVel.multiplyScalar(0.6);
  }
}
