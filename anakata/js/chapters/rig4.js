// js/chapters/rig4.js — the controls shared by the slicing and shadow chapters: the 4D orientation R of the
// object, the console with the three knobs that turn X, Y or Z into W (and the W lever, when there is one),
// grabbing the object to turn it in ordinary 3D, the keyboard, and the thumbsticks in VR.
import * as THREE from 'three';
import { identity, rotate, rotate3, orthonormalize } from '../math4.js';
import { Console, Turner } from '../widgets.js';

export class Rig4 {
  constructor(chapter, { center, radius = 0.22, slider = null }) {
    this.chapter = chapter;
    this.R = identity(4);
    this.center = center;
    this.version = 0;
    this.console = new Console({
      dials: [
        { label: 'X → W', sub: 'XW 回転', color: '#ff7a7a', onTurn: (d) => this.rot(0, 3, d) },
        { label: 'Y → W', sub: 'YW 回転', color: '#7aff9a', onTurn: (d) => this.rot(1, 3, d) },
        { label: 'Z → W', sub: 'ZW 回転', color: '#7ab0ff', onTurn: (d) => this.rot(2, 3, d) },
      ],
      slider,
    });
    chapter.root.add(this.console.group);
    this.turner = new Turner({
      center: () => chapter.root.localToWorld(center.clone()),
      radius,
      onRotate: (q) => {
        // the hand's rotation is in world axes; bring it into the stage's axes (the stage may be turned in VR)
        const sq = chapter.root.getWorldQuaternion(new THREE.Quaternion());
        const local = sq.clone().invert().multiply(q).multiply(sq);
        const m = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(local));
        rotate3(this.R, 4, m.elements);
        orthonormalize(this.R, 4);
        this.version++;
      },
    });
    this.items = [...this.console.items, this.turner.item];
  }

  rot(i, j, a) {
    rotate(this.R, 4, i, j, a);
    orthonormalize(this.R, 4);
    this.version++;
    this.chapter.onRotate?.(i, j, a);
  }

  set(m) {
    this.R = Float64Array.from(m);
    this.version++;
  }

  reset() { this.set(identity(4)); }

  // the knobs turn when R changes by keys or sticks too, so what you see on the console stays true
  turnDial(k, a) {
    const d = this.console.dials[k];
    d.angle += a;
    d.spin.rotation.y = d.angle;
  }

  keys(k, dt) {
    const s = 1.2 * dt;
    const pairs = [['KeyJ', 'KeyL', 0], ['KeyI', 'KeyK', 1], ['KeyU', 'KeyO', 2]];
    for (const [a, b, i] of pairs) {
      if (k.has(a)) { this.rot(i, 3, -s); this.turnDial(i, -s); }
      if (k.has(b)) { this.rot(i, 3, s); this.turnDial(i, s); }
    }
    const sl = this.console.slider;
    if (sl) {
      if (k.has('KeyR')) sl.set(sl.value + dt * 0.25);
      if (k.has('KeyF')) sl.set(sl.value - dt * 0.25);
    }
  }

  // VR: left stick up/down moves the W lever; right stick turns X→W (left/right) and Y→W (up/down)
  sticks(app, dt) {
    if (!app.xrActive) return;
    const L = app.input.xr.L, R = app.input.xr.R;
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8);
    const sl = this.console.slider;
    if (sl && L.valid) { const v = dz(-L.axes[1]); if (v) sl.set(sl.value + v * dt * 0.3); }
    if (R.valid) {
      const x = dz(R.axes[0]), y = dz(-R.axes[1]);
      if (x) { this.rot(0, 3, x * dt * 1.2); this.turnDial(0, x * dt * 1.2); }
      if (y) { this.rot(1, 3, y * dt * 1.2); this.turnDial(1, y * dt * 1.2); }
    }
  }
}
