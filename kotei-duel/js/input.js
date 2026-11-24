// js/input.js — one way to point at things, for every device:
//  - PC / phone: the mouse or a finger (a ray from the camera through the pointer)
//  - VR (Meta Quest): a laser from each controller, or from a tracked hand (pinch = select)
// Everything you can point at is a mesh with userData.hit = { id, ... }. The game asks hover() each frame
// and gets "select" events (click / tap / trigger / pinch), plus grip / A / B / X / Y and the stick in VR.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// one Quest controller (or a tracked hand)
class Hand {
  constructor(app, i) {
    const xr = app.renderer.xr;
    this.i = i;
    this.ray = xr.getController(i);
    this.grip = xr.getControllerGrip(i);
    this.handSpace = xr.getHand(i);
    this.source = null;
    this.side = i === 0 ? 'L' : 'R';
    this.btn = { trigger: 0, grip: 0, a: 0, b: 0, stick: 0, pinch: 0 };
    this.prev = { ...this.btn };
    this.axes = [0, 0];
    this.connected = false;
    this.ray.addEventListener('connected', (e) => { this.source = e.data; this.connected = true; this.side = e.data.handedness === 'left' ? 'L' : 'R'; });
    this.ray.addEventListener('disconnected', () => { this.source = null; this.connected = false; });
    // laser
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.laser = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.8 }));
    this.laser.visible = false;
    this.ray.add(this.laser);
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }));
    this.dot.renderOrder = 60;
    this.dot.visible = false;
    app.rig.add(this.ray, this.grip, this.handSpace);
    app.scene.add(this.dot);
    // a simple glove on the controller so you can see your hands
    const glove = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.09), new THREE.MeshStandardMaterial({ color: '#e9eef8', roughness: 0.6 }));
    palm.position.set(0, -0.01, 0.04);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#2b6cff', roughness: 0.5 }));
    cuff.rotation.x = Math.PI / 2; cuff.position.set(0, -0.01, 0.1);
    glove.add(palm, cuff);
    this.grip.add(glove);
    this.glove = glove;
    // joints for hand tracking (small spheres on the fingertips)
    this.tips = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: '#e9eef8' }));
      m.visible = false; app.scene.add(m); this.tips.push(m);
    }
    this.wp = new THREE.Vector3();
    this.o = new THREE.Vector3();
    this.d = new THREE.Vector3();
  }

  read() {
    this.prev = { ...this.btn };
    const src = this.source;
    const gp = src && src.gamepad;
    const hand = src && src.hand;
    this.isHand = !!hand;
    this.glove.visible = !hand;
    if (hand) {
      // pinch: thumb tip close to index tip
      const th = this.handSpace.joints['thumb-tip'], ix = this.handSpace.joints['index-finger-tip'];
      let pinch = 0;
      if (th && ix) {
        const dd = th.position.distanceTo(ix.position);
        pinch = dd < 0.018 ? 1 : dd < 0.03 ? 0.5 : 0;
      }
      this.btn = { trigger: pinch >= 1 ? 1 : 0, grip: 0, a: 0, b: 0, stick: 0, pinch };
      this.axes = [0, 0];
      const names = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
      names.forEach((n, k) => {
        const j = this.handSpace.joints[n];
        this.tips[k].visible = !!j;
        if (j) j.getWorldPosition(this.tips[k].position);
      });
      return;
    }
    for (const t of this.tips) t.visible = false;
    if (!gp) { this.btn = { trigger: 0, grip: 0, a: 0, b: 0, stick: 0, pinch: 0 }; this.axes = [0, 0]; return; }
    const v = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    this.btn = { trigger: v(0), grip: v(1), a: v(4), b: v(5), stick: v(3), pinch: 0 };
    this.axes = [gp.axes[2] || 0, gp.axes[3] || 0];
  }
  pressedNow(k) { return this.btn[k] > 0.5 && !(this.prev[k] > 0.5); }
  releasedNow(k) { return !(this.btn[k] > 0.5) && this.prev[k] > 0.5; }
  pulse(intensity, ms) {
    const gp = this.source && this.source.gamepad;
    const h = gp && gp.hapticActuators && gp.hapticActuators[0];
    if (h && h.pulse) try { h.pulse(clamp(intensity, 0, 1), ms); } catch { /* not supported */ }
  }
  world() { this.grip.getWorldPosition(this.wp); return this.wp; }
  // the pointing ray in world space
  rayWorld() {
    const m = this.ray.matrixWorld;
    this.o.setFromMatrixPosition(m);
    this.d.set(0, 0, -1).transformDirection(m);
    return { o: this.o, d: this.d };
  }
}

export class Pointer {
  constructor(app) {
    this.app = app;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9, -9);
    this.mouseIn = false;
    this.events = []; // { type: 'select'|'back'|'menu'|'help'|..., hit, hand }
    this.hands = [new Hand(app, 0), new Hand(app, 1)];
    this.hovered = null; // current hit (the first one found)
    this.hoverHand = null;
    this.activeHand = 1; // the hand whose laser selects (the last one that pressed its trigger)
    const el = app.renderer.domElement;
    const setMouse = (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.mouseIn = true;
    };
    let down = null;
    el.addEventListener('pointermove', (e) => { setMouse(e); });
    el.addEventListener('pointerdown', (e) => { setMouse(e); down = { x: e.clientX, y: e.clientY, t: performance.now() }; app.sound?.init?.(); });
    el.addEventListener('pointerup', (e) => {
      setMouse(e);
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 14) return;
      const hit = this.pick(this.app.targets());
      this.events.push({ type: 'select', hit, button: e.button });
      if (e.pointerType !== 'mouse') this.mouseIn = false; // a finger leaves no hover behind
    });
    el.addEventListener('pointerleave', () => { this.mouseIn = false; });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.events.push({ type: 'back' }); });
  }

  // ray from the camera through the mouse
  pick(targets) {
    if (!this.mouseIn) return null;
    this.raycaster.setFromCamera(this.mouse, this.app.camera);
    const hit = this.raycaster.intersectObjects(targets, true).find((h) => hitData(h.object));
    return hit ? { ...hitData(hit.object), object: hitOwner(hit.object), point: hit.point, uv: hit.uv } : null;
  }

  // called every frame
  update(targets, xrActive) {
    if (!xrActive) {
      this.hovered = this.pick(targets);
      for (const h of this.hands) { h.laser.visible = false; h.dot.visible = false; }
      return;
    }
    this.hovered = null;
    for (const h of this.hands) {
      h.read();
      h.laser.visible = h.connected;
      h.dot.visible = false;
      if (!h.connected) continue;
      const { o, d } = h.rayWorld();
      this.raycaster.set(o, d);
      const hit = this.raycaster.intersectObjects(targets, true).find((x) => hitData(x.object));
      h.laser.scale.z = hit ? hit.distance : 1.6;
      h.laser.material.opacity = h === this.hands[this.activeHand] ? 0.9 : 0.35;
      if (hit) {
        h.dot.visible = true;
        h.dot.position.copy(hit.point);
        const data = { ...hitData(hit.object), object: hitOwner(hit.object), point: hit.point, uv: hit.uv, hand: h };
        if (!this.hovered || h === this.hands[this.activeHand]) { this.hovered = data; this.hoverHand = h; }
        h.hit = data;
      } else h.hit = null;
      if (h.pressedNow('trigger')) {
        this.activeHand = this.hands.indexOf(h);
        this.events.push({ type: 'select', hit: h.hit, hand: h });
        h.pulse(0.3, 25);
      }
      if (h.pressedNow('grip')) this.events.push({ type: 'grip', hit: h.hit, hand: h });
      if (h.releasedNow('grip')) this.events.push({ type: 'release', hit: h.hit, hand: h });
      if (h.pressedNow('a')) this.events.push({ type: h.side === 'R' ? 'A' : 'X', hand: h });
      if (h.pressedNow('b')) this.events.push({ type: h.side === 'R' ? 'B' : 'Y', hand: h });
    }
  }

  take() { const e = this.events; this.events = []; return e; }
  pulse(intensity, ms) { for (const h of this.hands) h.pulse(intensity, ms); }
}

function hitData(o) {
  for (let x = o; x; x = x.parent) if (x.userData && x.userData.hit) return x.userData.hit;
  return null;
}
function hitOwner(o) {
  for (let x = o; x; x = x.parent) if (x.userData && x.userData.hit) return x;
  return o;
}
