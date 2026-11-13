import * as THREE from 'three';
import { GAMES } from '../progress.js';
import { NUM_FONT } from '../fonts.js';

const _v = new THREE.Vector3();

/**
 * One-minute arcade round. Points per success grow with your skill level and your combo,
 * so getting better shows up directly as bigger scores and better ranks.
 */
export class ArcadeGame {
  constructor(app, id) {
    this.app = app; this.id = id; this.def = GAMES[id];
    this.root = new THREE.Group();
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.hits = 0; this.misses = 0; this.trials = 0;
    this.t = 0; this.duration = 60;
  }
  start() { this.app.scene.add(this.root); }
  stop() {
    const res = this.result();
    this.root.removeFromParent();
    this.root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    return res;
  }
  result() {
    return { score: this.score, hits: this.hits, misses: this.misses, maxCombo: this.maxCombo, accuracy: this.trials ? this.hits / this.trials : 0, level: this.level() };
  }
  level() { return 1; }
  remaining() { return Math.max(0, this.duration - this.t); }
  update(dt) { this.t += dt; }
  onSelectStart() {}
  onSelectEnd() {}
  onDirection() {}
  pointerTarget() { return null; }
  touch() {}

  reward(pos, { mult = 1, word, color } = {}) {
    const app = this.app;
    this.combo++; this.hits++; this.trials++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const pts = Math.round(this.def.base * (1 + this.level() * 0.05) * (1 + Math.min(this.combo, 20) * 0.05) * mult);
    this.score += pts;
    const w = word || (this.combo >= 15 ? 'PERFECT!' : this.combo >= 5 ? 'GREAT!' : 'GOOD');
    const c = color || (this.combo >= 15 ? '#ff4f9a' : this.combo >= 5 ? '#ff9d2e' : '#3fb8ff');
    if (pos) {
      app.fx.text(`${w} +${pts}`, _v.copy(pos).add(new THREE.Vector3(0, 0.08 + pos.distanceTo(app.head) * 0.04, 0)).clone(), { color: c, size: 0.05 + pos.distanceTo(app.head) * 0.035, font: NUM_FONT, glow: 'rgba(255,255,255,0.95)', weight: 700 });
      app.fx.ring(pos, { color: [1, 0.85, 0.5], size: 0.1 + pos.distanceTo(app.head) * 0.08 });
    }
    if (this.combo % 10 === 0) { app.banner(`${this.combo} COMBO!`, '#ff4f9a'); app.sound.levelUp(); }
    app.world.pulse(0.3);
    app.hudDirty = true;
    return pts;
  }

  fail(pos, { word = 'MISS', sound = true } = {}) {
    const app = this.app;
    this.combo = 0; this.misses++; this.trials++;
    if (sound) app.sound.bad(pos);
    if (pos) app.fx.text(word, pos.clone().add(new THREE.Vector3(0, 0.06, 0)), { color: '#8a94b0', size: 0.04 + pos.distanceTo(app.head) * 0.03, font: NUM_FONT, glow: 'rgba(255,255,255,0.9)' });
    app.hudDirty = true;
  }

  at(az, el, d, out) { return this.app.stagePoint(az, el, d, out); }
  face(o) { o.lookAt(this.app.head); }

  static raySphere(ray, center, radius) {
    _v.subVectors(center, ray.origin);
    const tca = _v.dot(ray.direction);
    if (tca < 0) return -1;
    const d2 = _v.lengthSq() - tca * tca;
    if (d2 > radius * radius) return -1;
    return tca - Math.sqrt(radius * radius - d2);
  }
  static rayAngle(ray, p) {
    _v.subVectors(p, ray.origin).normalize();
    return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, _v.dot(ray.direction)))));
  }
  hitRadius(center, physR, minDeg = 1.8) {
    const d = center.distanceTo(this.app.head);
    return Math.max(physR * 1.15, d * Math.tan(THREE.MathUtils.degToRad(minDeg)));
  }
}
