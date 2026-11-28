// vr/cockpit.js — everything you see in VR besides the course:
//   the rig that seats you in your kart (1st person) or follows it (3rd person), yaw only so the horizon
//   never tilts; a steering wheel that sits where your controllers are and turns exactly as your hands do;
//   two panels at the top of the view, clear of the wheel and your hands: the item (up left) and your place,
//   lap and time (up right); a controls card before the start;
//   big messages (3-2-1, LAP, GOAL); menu panels with laser pointers; and a comfort vignette that narrows
//   the view while the kart turns hard.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { VRPanel, roundRect, text } from './panel.js';
import { WHEEL_X, WHEEL_Y } from './vrinput.js';
import { ITEM_IDS, ITEMS, itemIconURL } from '../race/items.js';
import { clamp, damp, dampAngle, wrapAngle } from '../engine/util.js';
import { fmtTime } from '../ui/hud.js';

const SEAT_Y = 1.55, SEAT_Z = -0.25; // eye point in kart space (+z forward)
const UP = new THREE.Vector3(0, 1, 0);
const RANK_COLORS = [['#fff6b0', '#ffc61a'], ['#ffffff', '#b9c6e8'], ['#ffd8b0', '#e0803a']];
// the two HUD panels, in the seat frame (eyes at the origin, -z ahead): up left and up right, facing you
const POD_ITEM = new THREE.Vector3(-0.5, 0.2, -1.12), POD_STATUS = new THREE.Vector3(0.5, 0.2, -1.12);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';
const WHEEL_R = 0.19; // radius of the wheel model
// where the wheel waits (seat frame, eyes at the origin) until you first take hold of it
const WHEEL_HOME = new THREE.Vector3(0, -0.42, -0.42), WHEEL_HOME_R = 0.2;

export class VRCockpit {
  constructor({ camera, renderer, vrInput, portraits }) {
    this.camera = camera; this.renderer = renderer; this.r = renderer.r; this.input = vrInput;
    this.portraits = portraits;
    this.rig = new THREE.Group(); this.rig.name = 'vr-rig';
    this.space = new THREE.Group(); this.rig.add(this.space);
    vrInput.attach(this.space);
    this.view = 'first';
    this.yaw = 0; this.y = 0; this.lastHeading = 0; this.yawRate = 0;
    this.vignetteOn = true;
    this.needCenter = 0;

    // controller and hand models
    const cmf = new XRControllerModelFactory(), hmf = new XRHandModelFactory();
    vrInput.grips.forEach((g) => g.add(cmf.createControllerModel(g)));
    vrInput.hands.forEach((h) => h.add(hmf.createHandModel(h, 'spheres')));

    // steering wheel (replaces the kart's own fixed wheel). 1st person: it lives in the seat frame and goes
    // where your two hands hold it; 3rd person: on the kart
    this.wheel = buildWheel();
    this.wheelAt = WHEEL_HOME.clone(); this.wheelR = WHEEL_HOME_R; this.wheelHeld = false;
    const N = new THREE.Vector3().crossVectors(WHEEL_X, WHEEL_Y);
    this.wheelQuat = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(WHEEL_X, WHEEL_Y, N));

    // how to drive, shown before the start
    this.hint = makeHint();
    this.hint.position.set(0, 0.95, -2.5);
    this.hint.visible = false;
    this.rig.add(this.hint);

    // HUD panels: the item, and place / lap / time. Drawn over everything (never hidden by the kart or the wheel)
    this.itemPod = makePod(0.27, 512, 600);
    this.statusPod = makePod(0.36, 640, 420);
    placePod(this.itemPod.mesh, POD_ITEM); placePod(this.statusPod.mesh, POD_STATUS);
    this.rig.add(this.itemPod.mesh, this.statusPod.mesh);
    this.podT = 0; this.itemSig = ''; this.pop = 0; this.lastItem = null;
    this.icons = {};
    for (const id of ITEM_IDS) {
      const im = new Image(); im.src = itemIconURL(id); this.icons[id] = im;
      im.onload = () => { this.itemSig = ''; }; // redraw once it has loaded
    }

    // big messages, 2.6 m ahead
    this.msgPanel = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.8), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false }));
    this.msgCv = document.createElement('canvas'); this.msgCv.width = 1400; this.msgCv.height = 400;
    this.msgTex = new THREE.CanvasTexture(this.msgCv); this.msgTex.colorSpace = THREE.SRGBColorSpace;
    this.msgPanel.material.map = this.msgTex;
    this.msgPanel.position.set(0, 0.3, -2.6);
    this.msgPanel.renderOrder = 30;
    this.msgPanel.visible = false;
    this.msgT = 0; this.msgDur = 1;
    this.rig.add(this.msgPanel);

    // menu
    this.menu = new VRPanel(1.5, 1.05);
    this.menu.mesh.position.set(0, -0.05, -1.4);
    this.menu.mesh.visible = false;
    this.rig.add(this.menu.mesh);
    this.onPick = null;

    // laser pointers (only while a menu is open)
    this.ray = new THREE.Raycaster();
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.lasers = vrInput.ctrl.map((c) => {
      const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#7fe9ff', transparent: true, opacity: 0.85 }));
      line.scale.z = 3; line.visible = false; c.add(line);
      c.addEventListener('select', () => this.onSelect(c));
      return line;
    });

    this.vignette = makeVignette();
  }

  // while in VR the camera rides in the rig (three.js puts the head pose under the camera's parent)
  takeCamera() { this.space.add(this.camera); this.camera.near = 0.1; this.camera.updateProjectionMatrix(); }
  releaseCamera() {
    this.camera.removeFromParent();
    this.camera.position.set(0, 0, 0); this.camera.quaternion.identity(); this.camera.scale.set(1, 1, 1);
    this.camera.near = 0.3; this.camera.updateProjectionMatrix();
  }
  worldPosition(out) { return this.rig.getWorldPosition(out); }

  attach(scene) { scene.add(this.rig); scene.add(this.vignette); }
  detach() {
    this.rig.parent?.remove(this.rig);
    this.vignette.parent?.remove(this.vignette);
    this.wheel.parent?.remove(this.wheel);
  }

  // seat the player in kart k
  setKart(k, view = this.view) {
    this.kart = k; this.view = view;
    this.wheel.parent?.remove(this.wheel);
    // a VR seat kart has no fixed wheel: the turning one stands in for it in both views
    const tilt = this.wheel.userData.tilt;
    if (k.vrSeat && view === 'first') {
      tilt.rotation.x = 0; this.wheel.quaternion.copy(this.wheelQuat);
      this.wheel.position.copy(this.wheelAt); this.wheel.scale.setScalar(this.wheelR / WHEEL_R);
      this.rig.add(this.wheel);
    } else if (k.vrSeat) {
      tilt.rotation.x = -0.5; this.wheel.quaternion.identity(); this.wheel.scale.setScalar(1);
      this.wheel.position.set(0, 1.1, 0.42); k.rig.visual.add(this.wheel);
    }
    k.rig.driver.visible = view !== 'first';
    this.hint.userData.draw();
    this.yaw = k.heading; this.lastHeading = k.heading;
    this.y = k.pos.y;
    this.place(0, true);
    this.itemSig = ''; this.lastItem = k.item || null; this.pop = 0;
    this.drawPods(k, null, 0);
  }

  // line the player's head up with the seat (or the 3rd-person anchor) and face forward
  recenter() {
    const p = this.camera.position, q = this.camera.quaternion;
    _e.setFromQuaternion(q, 'YXZ');
    const yaw = _e.y;
    this.space.rotation.set(0, -yaw, 0);
    _v.copy(p).applyAxisAngle(UP, -yaw);
    this.space.position.set(-_v.x, -_v.y, -_v.z);
  }

  place(dt, snap = false) {
    const k = this.kart; if (!k) return;
    const h = k.heading;
    if (this.view === 'first') {
      this.yaw = h;
      this.y = snap ? k.pos.y : damp(this.y, k.pos.y, 14, dt);
      this.rig.position.set(k.pos.x + Math.sin(h) * SEAT_Z, this.y + SEAT_Y, k.pos.z + Math.cos(h) * SEAT_Z);
    } else {
      this.yaw = snap ? h : dampAngle(this.yaw, h, 4, dt);
      this.y = snap ? k.pos.y : damp(this.y, k.pos.y, 6, dt);
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      this.rig.position.set(k.pos.x - fx * 5.6, this.y + 2.4, k.pos.z - fz * 5.6);
    }
    this.rig.rotation.set(0, this.yaw + Math.PI, 0);
  }

  update(dt, race, ctl) {
    const k = this.kart; if (!k) return;
    this.place(dt);
    this.updateWheel(dt, ctl);
    this.hint.visible = !!race && (race.phase === 'intro' || race.phase === 'countdown') && !this.menuOpen;
    // comfort vignette from the turn rate
    const dh = wrapAngle(k.heading - this.lastHeading); this.lastHeading = k.heading;
    this.yawRate = damp(this.yawRate, Math.abs(dh) / Math.max(dt, 1e-3), 8, dt);
    const target = this.vignetteOn && race.started ? clamp((this.yawRate - 0.45) * 0.55, 0, 0.8) + (k.boost > 0 ? 0.15 : 0) : 0;
    const u = this.vignette.material.uniforms.k;
    u.value = damp(u.value, Math.min(0.85, target), 6, dt);
    this.vignette.visible = u.value > 0.01;
    // HUD panels: place / lap / time ~12 Hz, the item when it changes (or spins); a pop when you get one
    this.drawPods(k, race, dt);
    const pv = this.itemPod.mesh.visible;
    this.itemPod.mesh.visible = this.statusPod.mesh.visible = !this.menuOpen && !!race;
    if (!pv) this.itemSig = '';
    // message fade
    if (this.msgPanel.visible) {
      this.msgT += dt;
      const t = this.msgT / this.msgDur;
      this.msgPanel.material.opacity = t < 0.15 ? t / 0.15 : t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
      const s = t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : 1;
      this.msgPanel.scale.setScalar(s);
      if (t >= 1) this.msgPanel.visible = false;
    }
    this.updatePointers();
  }

  // the wheel: in 1st person it sits exactly in your hands while you grip it with both (centre between the
  // controllers, rim through them, turned as far as they are), and stays where you last held it when you let go
  updateWheel(dt, ctl) {
    const w = this.input.wheel, spin = this.wheel.userData.spin;
    this.wheel.userData.grip.visible = w.engaged;
    if (this.wheel.parent !== this.rig) { spin.rotation.z = damp(spin.rotation.z, ctl.steer * 1.5, 16, dt); return; } // on the kart (3rd person)
    const hold = w.two || (!this.wheelHeld && w.both && plausibleHands(w.left, w.right));
    if (hold) {
      // centre between the hands; radius: half their distance across the wheel's plane
      _v.addVectors(w.left, w.right).multiplyScalar(0.5);
      _w.subVectors(w.right, w.left);
      this.wheelAt.copy(_v);
      this.wheelR = clamp(Math.hypot(_w.dot(WHEEL_X), _w.dot(WHEEL_Y)) / 2, 0.12, 0.34);
      if (w.two) this.wheelHeld = true;
    }
    this.wheel.position.copy(this.wheelAt);
    this.wheel.scale.setScalar(this.wheelR / WHEEL_R);
    // turned exactly as far as your hands; otherwise (stick, one hand, let go) as far as the steering says
    const target = w.two ? -w.angle : -this.input.wheelAngleFor(ctl.steer);
    spin.rotation.z = w.two ? target : damp(spin.rotation.z, target, 16, dt);
  }

  message(textStr, { color = '#ffffff', sub = '', dur = 1.2, size = 210 } = {}) {
    const c = this.msgCv.getContext('2d'), W = this.msgCv.width, H = this.msgCv.height;
    c.clearRect(0, 0, W, H);
    text(c, textStr, W / 2, sub ? H * 0.42 : H / 2, size, color);
    if (sub) text(c, sub, W / 2, H * 0.82, 64, '#ffffff', 800);
    this.msgTex.needsUpdate = true;
    this.msgT = 0; this.msgDur = dur;
    this.msgPanel.visible = true;
  }

  drawPods(k, race, dt) {
    // the item: a pop when the roulette starts and when it lands
    const holding = k.roulette > 0 ? 'spin' : k.item || null;
    if (holding !== this.lastItem) { if (holding) this.pop = 1; this.lastItem = holding; }
    if (this.pop > 0) {
      this.pop = Math.max(0, this.pop - dt * 3.2);
      const p = this.pop, s = 1 + 0.32 * Math.sin(p * Math.PI) * p;
      this.itemPod.mesh.scale.setScalar(s);
    } else this.itemPod.mesh.scale.setScalar(1);
    const spinFrame = k.roulette > 0 ? Math.floor(performance.now() / 70) % ITEM_IDS.length : -1;
    const sig = `${holding}|${k.itemCount}|${spinFrame}|${this.pop > 0.5}`;
    if (sig !== this.itemSig) { this.itemSig = sig; this.drawItemPod(k, spinFrame); }
    this.podT -= dt;
    if (this.podT <= 0) { this.podT = 1 / 12; this.drawStatusPod(k, race); }
  }

  drawItemPod(k, spinFrame) {
    const { cv, tex } = this.itemPod, c = cv.getContext('2d'), W = cv.width, s = 440, x0 = (W - s) / 2, y0 = 14;
    c.clearRect(0, 0, W, cv.height); c.textBaseline = 'middle';
    const id = spinFrame >= 0 ? ITEM_IDS[spinFrame] : k.item;
    const live = !!id;
    // frame: a white ring around a deep glass square, brighter while you hold something
    c.save();
    c.shadowColor = live ? 'rgba(120, 230, 255, 0.9)' : 'rgba(0,0,0,0)'; c.shadowBlur = live ? 36 : 0;
    roundRect(c, x0, y0, s, s, 96); c.fillStyle = live ? '#ffffff' : 'rgba(255,255,255,0.45)'; c.fill();
    c.restore();
    roundRect(c, x0 + 16, y0 + 16, s - 32, s - 32, 82);
    const g = c.createLinearGradient(0, y0, 0, y0 + s); g.addColorStop(0, live ? '#6a4fe0' : 'rgba(60,40,140,0.55)'); g.addColorStop(1, live ? '#22105e' : 'rgba(30,16,80,0.55)');
    c.fillStyle = g; c.fill();
    roundRect(c, x0 + 34, y0 + 30, s - 68, (s - 60) * 0.42, 70); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    const im = id && this.icons[id];
    if (im && im.complete && im.naturalWidth) {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowOffsetY = 10; c.shadowBlur = 10;
      const m = spinFrame >= 0 ? 0.88 : 1, d = (s - 110) * m;
      c.drawImage(im, x0 + (s - d) / 2, y0 + (s - d) / 2, d, d);
      c.restore();
    } else if (!live) text(c, 'ITEM', W / 2, y0 + s / 2, 64, 'rgba(255,255,255,0.35)', 900);
    if (k.itemCount > 1 && spinFrame < 0) {
      c.beginPath(); c.arc(x0 + s - 34, y0 + s - 34, 62, 0, Math.PI * 2); c.fillStyle = '#ff4fa8'; c.fill(); c.lineWidth = 12; c.strokeStyle = '#ffffff'; c.stroke();
      text(c, `×${k.itemCount}`, x0 + s - 34, y0 + s - 30, 62, '#ffffff', 900);
    }
    if (id && spinFrame < 0) {
      const name = ITEMS[id].name;
      c.font = `900 50px ${FONT}`; const tw = Math.min(W - 20, c.measureText(name).width + 70);
      roundRect(c, (W - tw) / 2, y0 + s + 22, tw, 82, 41); c.fillStyle = 'rgba(20, 10, 56, 0.85)'; c.fill();
      c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke();
      text(c, name, W / 2, y0 + s + 64, 46, '#ffffff', 900);
    }
    tex.needsUpdate = true;
  }

  drawStatusPod(k, race) {
    const { cv, tex } = this.statusPod, c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H); c.textBaseline = 'middle';
    roundRect(c, 8, 8, W - 16, H - 16, 64);
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(46, 28, 110, 0.86)'); g.addColorStop(1, 'rgba(18, 10, 48, 0.86)');
    c.fillStyle = g; c.fill(); c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.stroke();
    // place, big, with a metal gradient for the podium
    const pl = k.place || 1, cols = RANK_COLORS[pl - 1] || ['#bff4ff', '#4fd2ff'];
    c.save();
    c.font = `italic 900 230px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const pg = c.createLinearGradient(0, 60, 0, 270); pg.addColorStop(0, cols[0]); pg.addColorStop(1, cols[1]);
    c.lineJoin = 'round'; c.lineWidth = 22; c.strokeStyle = '#1a0e40'; c.strokeText(String(pl), 160, 262);
    c.fillStyle = pg; c.fillText(String(pl), 160, 262);
    c.font = `900 76px ${FONT}`; c.lineWidth = 14; c.strokeText('位', 268, 258); c.fillStyle = '#ffffff'; c.fillText('位', 268, 258);
    c.restore();
    // lap and time
    const laps = race ? race.laps : 3;
    text(c, 'LAP', 470, 92, 46, 'rgba(255,255,255,0.75)', 900);
    text(c, `${Math.min(laps, k.lap || 1)}/${laps}`, 470, 168, 92, '#ffffff', 900);
    const t = race ? (k.finished && !k.estimated ? k.finishTime : race.started ? race.raceTime : 0) : 0;
    text(c, fmtTime(t), 470, 250, 54, '#ffffff', 800);
    // speed
    const sp = clamp(Math.max(0, k.speed) / (k.maxSpeed * 1.3), 0, 1);
    roundRect(c, 60, 312, W - 120, 30, 15); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill();
    if (sp > 0.01) { roundRect(c, 60, 312, Math.max(30, (W - 120) * sp), 30, 15); c.fillStyle = k.boost > 0 ? '#ff8a1f' : '#4fe3ff'; c.fill(); }
    if (k.wrongWay > 1.2 && !k.finished) { roundRect(c, 60, 352, W - 120, 50, 25); c.fillStyle = '#ff3c50'; c.fill(); text(c, '逆走中！', W / 2, 378, 40, '#ffffff', 900); }
    tex.needsUpdate = true;
  }

  // ---- menus
  openMenu(spec, onPick) {
    this.onPick = onPick;
    this.msgPanel.visible = false; // a message would cover the panel
    this.menu.hover = null;
    this.menu.draw(spec);
    this.menu.mesh.visible = true;
    for (const l of this.lasers) l.visible = true;
  }
  closeMenu() {
    this.onPick = null;
    this.menu.mesh.visible = false;
    for (const l of this.lasers) l.visible = false;
  }
  get menuOpen() { return this.menu.mesh.visible; }

  updatePointers() {
    if (!this.menuOpen) return;
    let hover = null;
    for (let i = 0; i < this.input.ctrl.length; i++) {
      const c = this.input.ctrl[i];
      if (!c.userData.source) { this.lasers[i].visible = false; continue; }
      this.lasers[i].visible = true;
      this.ray.setFromXRController(c);
      const hit = this.ray.intersectObject(this.menu.mesh, false)[0];
      this.lasers[i].scale.z = hit ? hit.distance : 3;
      if (hit && hit.uv) { const id = this.menu.hit(hit.uv); if (id) { hover = id; c.userData.hover = id; } else c.userData.hover = null; }
      else c.userData.hover = null;
    }
    this.menu.setHover(hover);
  }

  onSelect(c) {
    if (!this.menuOpen || !this.onPick) return;
    this.ray.setFromXRController(c);
    const hit = this.ray.intersectObject(this.menu.mesh, false)[0];
    const id = hit && hit.uv ? this.menu.hit(hit.uv) : null;
    if (id) this.onPick(id);
  }
}

// both controllers held roughly like a wheel: in front of you, below your eyes, a wheel's width apart
function plausibleHands(l, r) {
  const d = l.distanceTo(r);
  return d > 0.18 && d < 0.8 && l.z < -0.1 && r.z < -0.1 && l.y < 0.05 && r.y < 0.05 && l.x < r.x;
}

function makeHint() {
  const W = 1200, H = 330;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8 * H / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  m.renderOrder = 29;
  // drawn when a race starts (by then the web font has loaded)
  m.userData.draw = () => { drawHint(cv.getContext('2d'), W, H); tex.needsUpdate = true; };
  return m;
}

function drawHint(c, W, H) {
  c.clearRect(0, 0, W, H);
  roundRect(c, 6, 6, W - 12, H - 12, 50); c.fillStyle = 'rgba(24, 16, 60, 0.82)'; c.fill();
  c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,0.5)'; c.stroke();
  const rows = [
    ['ハンドル', '両手の グリップ（中指）を にぎって 回す'],
    ['アクセル', '右トリガー'], ['ブレーキ', '左トリガー'],
    ['ドリフト', 'A / X ・ アイテム B / Y'],
  ];
  rows.forEach(([k, v], i) => {
    const y = 62 + i * 70;
    c.font = `800 46px ${FONT}`; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = '#ffd93b'; c.fillText(k, 300, y);
    c.font = `700 44px ${FONT}`; c.textAlign = 'left'; c.fillStyle = '#ffffff'; c.fillText(v, 340, y);
  });
}

function buildWheel() {
  const g = new THREE.Group();
  const tilt = new THREE.Group(); tilt.rotation.x = -0.5; g.add(tilt);
  const spin = new THREE.Group(); tilt.add(spin);
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2d3a', roughness: 0.5 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 10, 36), dark);
  spin.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 20), new THREE.MeshStandardMaterial({ color: '#ff5fa2', roughness: 0.4 }));
  hub.rotation.x = Math.PI / 2; spin.add(hub);
  for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.15, 0.02), dark);
    sp.position.set(Math.sin(a) * 0.1, -Math.cos(a) * 0.1, 0); sp.rotation.z = a; spin.add(sp);
  }
  // top marker, so you can see how far it is turned
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.035), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd93b').multiplyScalar(1.5), toneMapped: false }));
  mark.position.set(0, 0.19, 0); spin.add(mark);
  // glow ring while your hands hold it
  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.034, 8, 36), new THREE.MeshBasicMaterial({ color: '#4fe3ff', transparent: true, opacity: 0.35, toneMapped: false }));
  grip.visible = false; spin.add(grip);
  g.userData.spin = spin; g.userData.grip = grip; g.userData.tilt = tilt;
  return g;
}

// a dark ring around the edge of the view (head-locked at render time, so it never lags)
function makeVignette() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { k: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float k; varying vec3 vP;
      void main(){ vec3 d = normalize(vP); float edge = 1.0 + d.z; // 0 straight ahead (-z), 2 behind
        float a = smoothstep(mix(0.55, 0.12, k), mix(0.85, 0.36, k), edge) * k;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 16), mat);
  m.renderOrder = 1000;
  m.frustumCulled = false;
  m.matrixAutoUpdate = false;
  m.matrixWorldAutoUpdate = false;
  m.visible = false;
  m.onBeforeRender = (renderer) => { if (renderer.xr.isPresenting) m.matrixWorld.copy(renderer.xr.getCamera().matrixWorld); };
  return m;
}

// a HUD panel: a canvas on a plane `w` metres wide, drawn over the scene
function makePod(w, cw, ch) {
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * ch) / cw), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  mesh.renderOrder = 25;
  return { cv, tex, mesh };
}
// at p in the seat frame, turned to face the eyes
function placePod(mesh, p) {
  mesh.position.copy(p);
  mesh.rotation.set(Math.atan2(p.y, Math.hypot(p.x, p.z)), Math.atan2(-p.x, -p.z), 0, 'YXZ');
}
