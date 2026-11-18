// vr/cockpit.js — everything you see in VR besides the course:
//   the rig that seats you in your kart (1st person) or follows it (3rd person), yaw only so the horizon
//   never tilts; a steering wheel that turns with you; the dashboard (place, lap, time, item, mini-map);
//   big messages (3-2-1, LAP, GOAL); menu panels with laser pointers; and a comfort vignette that narrows
//   the view while the kart turns hard.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { VRPanel, roundRect, text } from './panel.js';
import { ITEM_ICONS, ITEM_IDS, ITEMS } from '../race/items.js';
import { clamp, damp, dampAngle, wrapAngle } from '../engine/util.js';
import { fmtTime } from '../ui/hud.js';

const SEAT_Y = 1.55, SEAT_Z = -0.25; // eye point in kart space (+z forward)
const UP = new THREE.Vector3(0, 1, 0);
const RANK_COLORS = ['#ffd93b', '#e6ecff', '#ffb070'];
const _v = new THREE.Vector3(), _e = new THREE.Euler();

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

    // steering wheel (1st person; replaces the kart's own fixed wheel)
    this.wheel = buildWheel();

    // dashboard
    this.dash = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false }));
    this.dashCv = document.createElement('canvas'); this.dashCv.width = 1040; this.dashCv.height = 400;
    this.dashTex = new THREE.CanvasTexture(this.dashCv); this.dashTex.colorSpace = THREE.SRGBColorSpace; this.dashTex.anisotropy = 4;
    this.dash.material.map = this.dashTex;
    this.dash.renderOrder = 15;
    this.dashT = 0;
    this.icons = {};
    for (const id of ITEM_IDS) { const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ITEM_ICONS[id]); this.icons[id] = im; }

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
    this.dash.parent?.remove(this.dash);
  }

  // seat the player in kart k
  setKart(k, view = this.view) {
    this.kart = k; this.view = view;
    this.wheel.parent?.remove(this.wheel);
    this.dash.parent?.remove(this.dash);
    // a VR seat kart has no fixed wheel: the turning one stands in for it in both views
    if (k.vrSeat) { this.wheel.position.set(0, 1.1, 0.42); k.rig.visual.add(this.wheel); }
    if (view === 'first') {
      k.rig.driver.visible = false;
      // low on the dash, just above the wheel, tilted to face the driver's eyes (kart +z is forward)
      this.dash.position.set(0, 1.25, 1.12);
      this.dash.rotation.set(Math.atan2(SEAT_Y - 1.25, 1.12 - SEAT_Z), Math.PI, 0, 'YXZ');
      this.dash.scale.setScalar(0.95);
      k.rig.root.add(this.dash);
    } else {
      k.rig.driver.visible = true;
      this.dash.position.set(0, -0.62, -1.45);
      this.dash.rotation.set(-0.55, 0, 0, 'XYZ');
      this.dash.scale.setScalar(1);
      this.rig.add(this.dash);
    }
    this.yaw = k.heading; this.lastHeading = k.heading;
    this.y = k.pos.y;
    this.place(0, true);
    this.drawDash(k, null);
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
    // steering wheel follows your steering
    const spin = this.wheel.userData.spin;
    spin.rotation.z = damp(spin.rotation.z, ctl.steer * 1.5, 16, dt);
    this.wheel.userData.grip.visible = this.input.wheel.engaged;
    // comfort vignette from the turn rate
    const dh = wrapAngle(k.heading - this.lastHeading); this.lastHeading = k.heading;
    this.yawRate = damp(this.yawRate, Math.abs(dh) / Math.max(dt, 1e-3), 8, dt);
    const target = this.vignetteOn && race.started ? clamp((this.yawRate - 0.45) * 0.55, 0, 0.8) + (k.boost > 0 ? 0.15 : 0) : 0;
    const u = this.vignette.material.uniforms.k;
    u.value = damp(u.value, Math.min(0.85, target), 6, dt);
    this.vignette.visible = u.value > 0.01;
    // dashboard ~12 Hz
    this.dashT -= dt;
    if (this.dashT <= 0) { this.dashT = 1 / 12; this.drawDash(k, race); }
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

  message(textStr, { color = '#ffffff', sub = '', dur = 1.2, size = 210 } = {}) {
    const c = this.msgCv.getContext('2d'), W = this.msgCv.width, H = this.msgCv.height;
    c.clearRect(0, 0, W, H);
    text(c, textStr, W / 2, sub ? H * 0.42 : H / 2, size, color);
    if (sub) text(c, sub, W / 2, H * 0.82, 64, '#ffffff', 800);
    this.msgTex.needsUpdate = true;
    this.msgT = 0; this.msgDur = dur;
    this.msgPanel.visible = true;
  }

  drawDash(k, race) {
    const c = this.dashCv.getContext('2d'), W = this.dashCv.width, H = this.dashCv.height;
    c.clearRect(0, 0, W, H);
    roundRect(c, 6, 6, W - 12, H - 12, 60);
    c.fillStyle = 'rgba(24, 16, 60, 0.82)'; c.fill();
    c.lineWidth = 8; c.strokeStyle = 'rgba(255,255,255,0.5)'; c.stroke();
    // place
    const pl = k.place || 1;
    text(c, String(pl), 150, 205, 230, RANK_COLORS[pl - 1] || '#7fdcff');
    text(c, '位', 262, 265, 80, '#ffffff');
    // lap and time
    const laps = race ? race.laps : 3;
    text(c, `LAP ${Math.min(laps, k.lap || 1)}/${laps}`, 520, 120, 78, '#ffffff');
    const t = race ? (k.finished && !k.estimated ? k.finishTime : race.started ? race.raceTime : 0) : 0;
    text(c, fmtTime(t), 520, 215, 64, '#ffffff', 800);
    // speed bar
    const sp = clamp(Math.max(0, k.speed) / (k.maxSpeed * 1.3), 0, 1);
    roundRect(c, 360, 280, 320, 34, 17); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill();
    if (sp > 0.01) { roundRect(c, 360, 280, Math.max(34, 320 * sp), 34, 17); c.fillStyle = k.boost > 0 ? '#ff8a1f' : '#4fe3ff'; c.fill(); }
    if (k.wrongWay > 1.2 && !k.finished) text(c, '逆走中！', 520, 350, 46, '#ff6070');
    // item slot
    const x0 = 760, y0 = 60, s = 230;
    roundRect(c, x0, y0, s, s, 50);
    c.fillStyle = 'rgba(120, 100, 220, 0.7)'; c.fill(); c.lineWidth = 8; c.strokeStyle = '#ffffff'; c.stroke();
    let id = k.item;
    if (k.roulette > 0) id = ITEM_IDS[Math.floor(performance.now() / 70) % ITEM_IDS.length];
    const im = id && this.icons[id];
    if (im && im.complete && im.naturalWidth) c.drawImage(im, x0 + 25, y0 + 25, s - 50, s - 50);
    if (k.itemCount > 1 && k.roulette <= 0) text(c, `×${k.itemCount}`, x0 + s - 20, y0 + s - 15, 54, '#ff9ad0');
    if (id && k.roulette <= 0) text(c, ITEMS[id].name, x0 + s / 2, y0 + s + 52, 40, '#ffffff', 800);
    this.dashTex.needsUpdate = true;
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
  g.userData.spin = spin; g.userData.grip = grip;
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
