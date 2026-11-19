// js/racket.js — the racket: its model, where it is in the hand, and the swept collision of the string bed
// with the ball between two frames (the head moves up to 30 m/s, the ball 50 m/s: 12–20 cm per physics step).
//
// Racket frame (local): +Y along the shaft toward the tip, +Z the string-bed normal, +X across the face.
// Origin = the middle of the hand on the grip. A standard racket: 68.5 cm long, 100 in² head (33 × 25 cm).
import * as THREE from 'three';
import { BALL_R, contact, racketACOR, STRING_MU } from './physics.js';

export const RACKET = {
  length: 0.685, butt: -0.055,      // butt cap just below the little finger
  headC: 0.45,                       // head centre above the hand
  a: 0.165, b: 0.125,                // string bed half-length / half-width
  rim: 0.022,                        // frame beyond the strings
  sweet: -0.02,                      // sweet spot slightly toward the throat
};

function stringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(245,245,235,0.95)';
  g.lineWidth = 2.2;
  for (let i = 0; i <= 16; i++) { const x = 8 + i * 15; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let i = 0; i <= 19; i++) { const y = 6 + i * 13; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  // stencilled logo
  g.fillStyle = 'rgba(220,40,40,0.55)';
  g.font = 'bold 70px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('R', 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** builds the racket mesh (local racket frame) */
export function buildRacketMesh(color = 0x1e2a44, accent = 0xe8b928) {
  const R = RACKET;
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.2 });
  // head: an elliptical tube
  const pts = [];
  const ra = R.a + R.rim * 0.5, rb = R.b + R.rim * 0.5;
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    // slightly egg-shaped (wider toward the tip)
    const y = Math.cos(t) * ra;
    const x = Math.sin(t) * rb * (1 + 0.06 * Math.cos(t));
    pts.push(new THREE.Vector3(x, R.headC + y, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const head = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.0105, 8, true), frameMat);
  head.scale.z = 1.6;   // the frame is deeper (24 mm) than it is wide
  g.add(head);
  // throat: two beams from the bottom of the head to the shaft
  const throatTop = R.headC - ra;
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * 0.055, throatTop + 0.012, 0);
    const b = new THREE.Vector3(0, 0.13, 0);
    const len = a.distanceTo(b);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, len, 8), frameMat);
    beam.position.copy(a).add(b).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
    beam.scale.z = 1.5;
    g.add(beam);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.02), frameMat);
  bridge.position.set(0, throatTop + 0.006, 0);
  g.add(bridge);
  // shaft + handle (octagonal grip with a wrap)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.1, 8), frameMat);
  shaft.position.y = 0.09;
  g.add(shaft);
  // the grip runs from the butt cap up to the shaft (19 cm); the hand holds it near the butt
  const gripLen = 0.19;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0165, gripLen, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.9 }));
  grip.position.y = R.butt + 0.012 + gripLen / 2;
  grip.rotation.y = Math.PI / 8;
  g.add(grip);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.016, 8), accentMat);
  cap.position.y = R.butt + 0.008;
  g.add(cap);
  // strings
  const sGeo = new THREE.CircleGeometry(1, 48);
  const strings = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ map: stringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  strings.scale.set(R.b, R.a, 1);
  strings.position.y = R.headC;
  g.add(strings);
  // damper
  const damp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.008), accentMat);
  damp.position.set(0, R.headC - R.a + 0.03, 0);
  g.add(damp);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

const _q = new THREE.Quaternion(), _p = new THREE.Vector3();
const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4();
const _c = new THREE.Vector3(), _n = new THREE.Vector3(), _ax = new THREE.Vector3(), _aw = new THREE.Vector3();
const _bp = new THREE.Vector3(), _loc = new THREE.Vector3(), _w0 = new THREE.Vector3(), _w1 = new THREE.Vector3();
const _inv = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);

/**
 * A racket in the world whose pose is set once per frame; between the previous and the current frame its pose
 * is interpolated (position lerp, rotation slerp) for the swept test.
 */
export class RacketBody {
  constructor() {
    this.p0 = new THREE.Vector3(); this.q0 = new THREE.Quaternion();
    this.p1 = new THREE.Vector3(); this.q1 = new THREE.Quaternion();
    this.dt = 1 / 72;
    this.valid = false;
    this.cooldown = 0;
    this.power = 1;
    this.enabled = true;
  }
  /** new frame pose (world) */
  setPose(p, q, dt) {
    if (!this.valid) { this.p0.copy(p); this.q0.copy(q); this.valid = true; }
    else { this.p0.copy(this.p1); this.q0.copy(this.q1); }
    this.p1.copy(p); this.q1.copy(q);
    this.dt = Math.max(1 / 240, dt);
  }
  teleport(p, q) { this.p0.copy(p); this.q0.copy(q); this.p1.copy(p); this.q1.copy(q); this.valid = true; }
  poseAt(a, outP, outQ) {
    outP.lerpVectors(this.p0, this.p1, a);
    outQ.slerpQuaternions(this.q0, this.q1, a);
  }
  /** world velocity of a local point (racket frame) over the last frame */
  pointVelocity(local, out) {
    _m0.compose(this.p0, this.q0, _one); _m1.compose(this.p1, this.q1, _one);
    _w0.copy(local).applyMatrix4(_m0); _w1.copy(local).applyMatrix4(_m1);
    return out.subVectors(_w1, _w0).divideScalar(this.dt);
  }
  /** signed distance of point bp to the string plane at frame-interpolation a, and the plane frame */
  planeAt(a, bp) {
    this.poseAt(a, _p, _q);
    _n.set(0, 0, 1).applyQuaternion(_q);
    _c.set(0, RACKET.headC, 0).applyQuaternion(_q).add(_p);
    return _bp.copy(bp).sub(_c).dot(_n);
  }

  /**
   * Swept test of the ball moving b0 → b1 (world positions at the start/end of one physics step) against the
   * racket moving from frame fraction a0 to a1. Returns null or { s (fraction of the step), local:{x,y}, side,
   * frame (rim hit), rho }.
   */
  sweep(b0, b1, a0, a1) {
    if (!this.valid || !this.enabled || this.cooldown > 0) return null;
    const r = BALL_R;
    const at = (s, out) => out.lerpVectors(b0, b1, s);
    const K = 4;
    const bp = new THREE.Vector3();
    let sPrev = 0;
    let dPrev = this.planeAt(a0, at(0, bp));
    // quick reject: both ends far from the head
    this.poseAt(a0, _p, _q); _c.set(0, RACKET.headC, 0).applyQuaternion(_q).add(_p);
    const far0 = b0.distanceTo(_c), far1 = b1.distanceTo(_c);
    const moveR = this.p0.distanceTo(this.p1) + b0.distanceTo(b1) + 0.6;
    if (far0 > moveR && far1 > moveR) return null;
    for (let k = 1; k <= K; k++) {
      const s = k / K;
      const d = this.planeAt(a0 + (a1 - a0) * s, at(s, bp));
      const sideStart = Math.sign(dPrev) || 1;
      if (Math.abs(dPrev) <= r || Math.sign(d) !== Math.sign(dPrev) || Math.abs(d) <= r) {
        // time when |d| reaches r on the side the ball came from
        let lo = sPrev, hi = s;
        const target = sideStart * r;
        if (Math.abs(dPrev) > r) {
          for (let i = 0; i < 18; i++) {
            const m = (lo + hi) / 2;
            const dm = this.planeAt(a0 + (a1 - a0) * m, at(m, bp));
            if ((dm - target) * sideStart > 0) lo = m; else hi = m;
          }
        } else hi = lo;
        const sc = hi;
        const dc = this.planeAt(a0 + (a1 - a0) * sc, at(sc, bp));
        // where on the face
        this.poseAt(a0 + (a1 - a0) * sc, _p, _q);
        _m0.compose(_p, _q, _one);
        _inv.copy(_m0).invert();
        _loc.copy(bp).applyMatrix4(_inv);
        const u = (_loc.y - RACKET.headC) / RACKET.a, t = _loc.x / RACKET.b;
        const rho = Math.hypot(u, t);
        const rimRho = 1 + (RACKET.rim + r * 0.6) / RACKET.b;
        if (rho <= rimRho) {
          const side = Math.abs(dPrev) > r ? sideStart : Math.sign(dc) || sideStart;
          return { s: sc, a: a0 + (a1 - a0) * sc, local: { x: _loc.x, y: _loc.y }, u, t, rho, frame: rho > 1, side };
        }
        if (Math.sign(d) !== Math.sign(dPrev)) return null;   // passed beside the head
      }
      sPrev = s; dPrev = d;
    }
    return null;
  }

  /**
   * Apply the impact found by sweep() to ball state `ball` (its position is already at the contact).
   * Returns { speedIn, speedOut, racketSpeed, sweet, frame, normal }.
   */
  impact(ball, hit) {
    this.poseAt(hit.a, _p, _q);
    _n.set(0, 0, 1).applyQuaternion(_q).multiplyScalar(hit.side);
    _ax.set(0, 1, 0).applyQuaternion(_q);
    _aw.set(1, 0, 0).applyQuaternion(_q);
    const vr = this.pointVelocity(new THREE.Vector3(hit.local.x, hit.local.y, 0), new THREE.Vector3()).multiplyScalar(this.power);
    const vin = Math.hypot(ball.v.x, ball.v.y, ball.v.z);
    const relN = (ball.v.x - vr.x) * _n.x + (ball.v.y - vr.y) * _n.y + (ball.v.z - vr.z) * _n.z;
    let e, mu = STRING_MU;
    const n = _n.clone();
    if (hit.frame) {
      // the frame: little rebound, the ball shanks off toward the outside of the head
      e = 0.12; mu = 0.2;
      const radial = _ax.clone().multiplyScalar(hit.u).add(_aw.clone().multiplyScalar(hit.t)).normalize();
      n.addScaledVector(radial, 0.9).normalize();
    } else {
      const s = (hit.local.y - RACKET.headC - RACKET.sweet) / RACKET.a;
      e = racketACOR(s, hit.t);
      // an off-centre hit twists the racket in the hand: the face turns toward the side that was hit
      const twist = 0.14 * hit.t * Math.min(1, Math.abs(relN) / 40);
      n.addScaledVector(_aw, twist * Math.sign(hit.side || 1) * hit.side).normalize();
    }
    contact(ball, n, vr, e, mu);
    this.cooldown = 0.12;
    return {
      speedIn: vin, speedOut: Math.hypot(ball.v.x, ball.v.y, ball.v.z), racketSpeed: vr.length(),
      sweet: hit.frame ? 0 : Math.max(0, 1 - hit.rho), frame: hit.frame, impulse: Math.abs(relN),
    };
  }
}
