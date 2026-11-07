import * as THREE from 'three';

const _v = new THREE.Vector3();

/** Common plumbing for training modules. */
export class Module {
  constructor(app, opts = {}) {
    this.app = app;
    this.opts = opts;
    this.root = new THREE.Group();
    this.stats = { trials: 0, correct: 0, score: 0, metrics: {} };
    this.done = false;
    this.t = 0;
  }
  start() { this.app.scene.add(this.root); }
  stop() {
    this.root.removeFromParent();
    this.root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    return this.stats;
  }
  update(dt) { this.t += dt; }
  onSelectStart() {}
  onSelectEnd() {}
  onDirection() {}
  pointerTarget() { return null; }

  /** World position for a head-relative placement on the training stage. */
  at(az, el, dist, out) { return this.app.stagePoint(az, el, dist, out); }

  face(obj) { obj.lookAt(this.app.head); }

  /** Ray vs sphere: returns distance along the ray or -1. */
  static raySphere(ray, center, radius) {
    _v.subVectors(center, ray.origin);
    const tca = _v.dot(ray.direction);
    if (tca < 0) return -1;
    const d2 = _v.lengthSq() - tca * tca;
    if (d2 > radius * radius) return -1;
    return tca - Math.sqrt(radius * radius - d2);
  }

  /** Angle in degrees between the ray and the direction from ray origin to p. */
  static rayAngle(ray, p) {
    _v.subVectors(p, ray.origin).normalize();
    return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, _v.dot(ray.direction)))));
  }

  /** Hit radius that never gets smaller than `minDeg` of visual angle (fair for hands). */
  hitRadius(center, physR, minDeg = 1.6) {
    const d = center.distanceTo(this.app.head);
    return Math.max(physR * 1.2, d * Math.tan(THREE.MathUtils.degToRad(minDeg)));
  }
}
