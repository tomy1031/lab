// world/rainfx.js — rain streaks around the camera (a box of line segments that wraps as you move),
// slanted by the wind, plus splashes on the ground are implied by the ocean shader ripples.
import * as THREE from 'three';

export class RainFX {
  constructor(scene, count = 3500) {
    this.count = count;
    const pos = new Float32Array(count * 6);
    this.seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.seed[i * 3] = Math.random() * 40 - 20;
      this.seed[i * 3 + 1] = Math.random() * 24;
      this.seed[i * 3 + 2] = Math.random() * 40 - 20;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: '#cfd8e3', transparent: true, opacity: 0.0, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 2;
    scene.add(this.lines);
    this.t = 0;
  }

  /** rain 0…1, wind 0…1, windDir radians, cam: camera, covered: true under a roof (no streaks right above) */
  update(dt, rain, wind, cam, night = 0) {
    this.t += dt;
    const n = Math.floor(this.count * Math.min(1, rain * 1.2));
    this.lines.visible = n > 0;
    if (!n) return;
    this.mat.opacity = 0.18 + rain * 0.3 - night * 0.12;
    const p = this.lines.geometry.attributes.position.array;
    const speed = 16 + rain * 8;
    const wx = 3 + wind * 9, wz = 1.5 + wind * 4;
    const len = 0.5 + rain * 0.5;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    for (let i = 0; i < n; i++) {
      const s = i * 3;
      let y = (this.seed[s + 1] - this.t * speed) % 24; if (y < 0) y += 24;
      let x = (this.seed[s] + this.t * wx * 0.3 - cx) % 40; if (x < -20) x += 40; if (x > 20) x -= 40;
      let z = (this.seed[s + 2] + this.t * wz * 0.3 - cz) % 40; if (z < -20) z += 40; if (z > 20) z -= 40;
      const X = cx + x, Y = cy - 8 + y, Z = cz + z;
      const k = i * 6;
      p[k] = X; p[k + 1] = Y; p[k + 2] = Z;
      p[k + 3] = X - wx / speed * len; p[k + 4] = Y + len; p[k + 5] = Z - wz / speed * len;
    }
    for (let i = n; i < this.count; i++) { const k = i * 6; p[k + 1] = p[k + 4] = -1000; }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
