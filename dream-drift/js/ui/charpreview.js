// ui/charpreview.js — the live turntable on the character select screen: the chosen racer in their kart on a
// lit stage, turning slowly, blinking and swaying; picking someone makes them hop and smile.
import * as THREE from 'three';
import { CHARACTERS, buildKart, animateDriver, holdExpression, EXPR } from '../race/characters.js';

export class CharPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.rigs = new Map();
    this.cur = null;
    this.t = 0; this.hop = 0; this.spinV = 0;
    this.running = false;
    this.fake = { speed: 0, steer: 0, boost: 0, spin: 0, finished: false, drift: { active: false } };
  }

  init() {
    if (this.r) return true;
    try {
      this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch { return false; }
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.NeutralToneMapping;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight('#ffffff', '#7a6ab8', 1.4));
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(3, 6, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -3; key.shadow.camera.right = key.shadow.camera.top = 3;
    s.add(key);
    const rim = new THREE.DirectionalLight('#9fdcff', 2.2); rim.position.set(-4, 3, -4); s.add(rim);
    // the stage: a glossy disc with a glowing ring in the racer's colour
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.75, 0.24, 64), new THREE.MeshStandardMaterial({ color: '#2b1d66', roughness: 0.3, metalness: 0.2 }));
    disc.position.y = -0.12; disc.receiveShadow = true; s.add(disc);
    const top = new THREE.Mesh(new THREE.CircleGeometry(2.45, 64), new THREE.MeshStandardMaterial({ color: '#3d2a8a', roughness: 0.25, metalness: 0.1 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.005; top.receiveShadow = true; s.add(top);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.0; s.add(this.ring);
    this.turn = new THREE.Group(); s.add(this.turn);
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    return true;
  }

  rigFor(id) {
    if (!this.rigs.has(id)) {
      const c = CHARACTERS.find((x) => x.id === id) || CHARACTERS[0];
      const rig = buildKart(c);
      rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      rig.blob.visible = false;
      this.rigs.set(id, { rig, c });
    }
    return this.rigs.get(id);
  }

  // show a racer (with a hop and a smile unless `quiet`)
  set(id, quiet = false) {
    if (!this.init()) return;
    const { rig, c } = this.rigFor(id);
    if (this.cur !== rig) {
      if (this.cur) this.turn.remove(this.cur.root);
      this.turn.add(rig.root);
      this.cur = rig;
      this.ring.material.color.set(c.kart).multiplyScalar(1.6);
    }
    if (!quiet) { this.hop = 1; this.spinV = 2.2; holdExpression(rig, Math.random() < 0.5 ? EXPR.happy : EXPR.wink, 1.4); }
  }

  start() {
    if (this.running || !this.init()) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  frame(dt) {
    const cv = this.canvas, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h || !this.cur) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      this.r.setPixelRatio(dpr); this.r.setSize(w, h, false);
      this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    }
    this.t += dt;
    // slow turn, a quick spin when picked
    this.spinV *= Math.exp(-dt * 2.5);
    this.turn.rotation.y = 0.55 + Math.sin(this.t * 0.45) * 0.38 + (this.turn.userData.extra = (this.turn.userData.extra || 0) + this.spinV * dt);
    // hop
    const rig = this.cur;
    let y = 0, sq = 0;
    if (this.hop > 0) {
      this.hop = Math.max(0, this.hop - dt * 1.9);
      const p = 1 - this.hop;
      y = Math.max(0, Math.sin(Math.min(1, p * 1.6) * Math.PI)) * 0.55;
      sq = p > 0.62 && p < 0.85 ? Math.sin(((p - 0.62) / 0.23) * Math.PI) * 0.12 : 0;
    }
    rig.visual.position.y = y;
    rig.visual.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.3);
    // the driver: idle sway; a hop shakes the ears like a little acceleration
    const f = this.fake;
    f.steer = Math.sin(this.t * 0.9) * 0.35;
    f.speed = this.hop > 0 ? Math.sin((1 - this.hop) * 12) * 6 : 0;
    animateDriver(rig, f, dt);
    for (const wheel of rig.pivots) wheel.rotation.y = -f.steer * 0.45;
    // frame the kart: a little closer on a narrow canvas
    const asp = this.cam.aspect, d = asp < 1 ? 9.4 : 8.2;
    this.cam.position.set(0, 2.9, d); this.cam.lookAt(0, 1.0, 0);
    this.r.render(this.scene, this.cam);
  }
}
