// itemViewer.js — the "just rolled up" card: a small turntable that shows the latest item in 3D with its name.
// Uses its own little WebGLRenderer on a transparent canvas, so the HUD card behind it can be styled freely.
import * as THREE from 'three';

export class ItemViewer {
  constructor(canvas, material, { pixelRatio = 2, antialias = true } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatio));
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(2, 3, 2.5);
    this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.pivot.add(this.mesh);
    this.t = 0;
    this.pop = 0;
    this.active = false;
    this.w = 0; this.h = 0;
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // proto: { geom, center, w, h, d }
  show(proto) {
    this.resize();
    this.mesh.geometry = proto.geom;
    // centre the model on the turntable and frame it
    this.mesh.position.copy(proto.center).multiplyScalar(-1);
    const rad = Math.max(Math.hypot(proto.w, proto.h, proto.d) / 2, 1e-4);
    const dist = rad / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.02;
    this.camera.position.set(0, rad * 0.45, dist);
    this.camera.near = dist / 100; this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
    this.pivot.rotation.set(0.12, -0.6, 0);
    this.pop = 1;
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    this.resize();
    this.t += dt;
    this.pivot.rotation.y += dt * 0.9;
    // a little bounce when a new item lands in the card
    this.pop = Math.max(0, this.pop - dt * 3);
    const s = 1 + Math.sin(this.pop * Math.PI) * 0.18;
    this.pivot.scale.setScalar(s);
    this.renderer.render(this.scene, this.camera);
  }
}
