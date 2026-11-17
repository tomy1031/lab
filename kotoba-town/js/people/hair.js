// Hair for the procedural townspeople: a shell over the skull plus individual locks (bangs, crown
// tufts, side locks, curls) laid along the head surface. The hairline sits high enough that the
// painted brows show, and the bangs end just above them.
import * as THREE from 'three';
import { shapeHead, headPoint } from './face.js';

// a teardrop lock hanging from y = 0 to y = -1 (radius 1 at the widest); listed bottom-up so the
// lathe faces point outward
const LOCK_PROFILE = [[0, -1], [0.2, -0.94], [0.56, -0.78], [0.88, -0.58], [1, -0.38], [0.86, -0.2], [0.5, -0.05], [0, 0.04]].map(([r, y]) => new THREE.Vector2(r, y));
// a strand with a rounded end, for long hair that falls
const STRAND_PROFILE = [[0, -1], [0.45, -0.98], [0.8, -0.9], [0.98, -0.72], [1, -0.4], [0.86, -0.18], [0.5, -0.05], [0, 0.04]].map(([r, y]) => new THREE.Vector2(r, y));
const deg = (d) => (d * Math.PI) / 180;

function rng(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Build the hair for one person.
 * add(geo, material) receives geometry already in head-centre coordinates.
 */
export function buildHair({ add, R, style, color, sex, extras, name = '' }) {
  const rand = rng(`${name}:${style}`);
  const base = new THREE.Color(color);
  // a little colour variation between locks reads as depth
  const tone = (k = 1) => ({ color: base.clone().multiplyScalar(k * (0.94 + rand() * 0.12)), bucket: 'hair', opacity: 1 });
  const hairMat = { color: base.clone(), bucket: 'hair', opacity: 1 };
  const fem = sex === 'f';
  const capOn = extras.has('cap');

  /** Skull shell: a sphere cap tilted back so the front hairline is at elevation `front` and the nape at `back` (degrees). */
  const shell = (front = 36, back = -42, radius = 1.065) => {
    // cap half-angle B tilted back by A: front edge at 90 - (B - A), nape at 90 - (A + B)
    const A = deg((front - back) / 2);
    const B = deg((180 - front - back) / 2);
    const geo = new THREE.SphereGeometry(R * radius, 40, 22, 0, Math.PI * 2, 0, B);
    geo.rotateX(-A);
    add(shapeHead(geo, R), hairMat);
  };

  /**
   * One lock rooted at (az, el) on the head, hanging along the surface.
   * dir: sweep around the surface normal (+ toward the person's left); up: point toward the crown instead.
   * hug: how much the lock follows the curve of the head (0 = straight).
   */
  const lock = (az, el, { len = 0.35, w = 0.32, th = 0.1, dir = 0, up = false, hang = false, blunt = false, hug = 0.5, lift = 0, radius = 1.035, k = 1 } = {}) => {
    const { p, n } = headPoint(az, el, R * radius, R);
    const q = headPoint(az, el - 0.02, R * radius, R).p;
    // along the head surface, or straight down (gravity) for hair that falls free
    const down = hang ? new THREE.Vector3(0, -1, 0) : q.sub(p);
    down.addScaledVector(n, -down.dot(n)).normalize();
    if (up) down.negate();
    const side0 = new THREE.Vector3().crossVectors(n, down);
    const d = down.clone().multiplyScalar(Math.cos(dir)).addScaledVector(side0, Math.sin(dir)).normalize();
    const X = new THREE.Vector3().crossVectors(n, d);
    const geo = new THREE.LatheGeometry(blunt ? STRAND_PROFILE : LOCK_PROFILE, 8);
    const pos = geo.attributes.position;
    const L = len * R; const W = (w * R) / 2; const T = (th * R) / 2;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      const s = -y * L;                                    // distance along the lock
      const curl = (hug * s * s) / (2 * R);                // follow the head's curve
      v.copy(p).addScaledVector(n, lift * R + z * T - curl).addScaledVector(d, s).addScaledVector(X, x * W);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    add(geo, tone(k));
  };

  /** A row of bangs across the forehead. */
  const bangs = ({ n = 8, from = -0.8, to = 0.8, el = 0.55, len = 0.36, w = 0.34, th = 0.1, sweep = 0.2, fan = 0.45, part = null, jitter = 0.12 } = {}) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const az = from + (to - from) * t + (rand() - 0.5) * 0.08;
      let dir = sweep + az * fan + (rand() - 0.5) * jitter;
      if (part !== null) dir = Math.sign(az - part || 1) * Math.abs(sweep) + az * fan * 0.6;
      const edge = 1 - Math.pow(Math.abs(az) / 1.2, 2) * 0.35;
      lock(az, el - Math.abs(az) * 0.08, { len: len * edge * (0.88 + rand() * 0.24), w, th, dir, hug: 0.6 });
    }
  };

  /** Bumps on the crown so the silhouette is not a smooth bowl. */
  const crown = ({ n = 6, el = 1.0, len = 0.34, w = 0.42, th = 0.12, lift = 0.0 } = {}) => {
    if (capOn) return;
    for (let i = 0; i < n; i++) {
      const az = -1.0 + (2.0 * i) / Math.max(1, n - 1) + (rand() - 0.5) * 0.2;
      lock(az, el + (rand() - 0.5) * 0.15, { len, w, th, up: true, dir: (rand() - 0.5) * 0.4, hug: 0.9, lift, radius: 1.05 });
    }
  };

  /** Locks down the sides of the head (in front of / over the ears). */
  const sides = ({ len = 0.32, w = 0.24, th = 0.12, el = 0.2, az = [1.15, 1.45], hug = 0.4, inward = 0.0, hang = false, blunt = false } = {}) => {
    for (const s of [-1, 1]) for (const a of az) lock(s * a, el + (rand() - 0.5) * 0.06, { len: len * (0.9 + rand() * 0.2), w, th, dir: -s * inward, hug, hang, blunt, radius: 1.05 });
  };

  /** Locks that frame the face, from the temples down past the cheekbones. */
  const frame = ({ len = fem ? 0.55 : 0.3, w = 0.26, th = 0.1, az = 0.98, el = 0.42 } = {}) => {
    for (const s of [-1, 1]) {
      lock(s * az, el, { len, w, th, dir: s * 0.12, hug: 0.6, radius: 1.04 });
      lock(s * (az + 0.18), el - 0.05, { len: len * 0.9, w: w * 1.1, th, dir: s * 0.05, hug: 0.5, radius: 1.045 });
    }
  };

  /** Curly hair: short, fat locks pointing every which way, laid over the shell (keeps the face clear). */
  const clumps = ({ rows, len = 0.34, w = 0.42, th = 0.18, radius = 1.08 } = {}) => {
    for (const [el, n, span] of rows) {
      for (let i = 0; i < n; i++) {
        const az = -span + (2 * span * i) / Math.max(1, n - 1) + (rand() - 0.5) * 0.15;
        if (el < 0.62 && Math.abs(az) < 1.12) continue;
        lock(az, el + (rand() - 0.5) * 0.1, { len: len * (0.8 + rand() * 0.4), w: w * (0.85 + rand() * 0.3), th, dir: (rand() - 0.5) * 3.2, up: rand() < 0.4, hug: 0.9, radius, k: 0.9 + rand() * 0.2 });
      }
    }
  };

  switch (style) {
    case 'bald_top': {
      const geo = new THREE.TorusGeometry(R * 0.86, R * 0.18, 8, 28, Math.PI * 1.15);
      geo.rotateZ(Math.PI * 0.93); geo.rotateX(Math.PI / 2 - 0.1); geo.scale(1.02, 1.0, 1.08); geo.translate(0, -R * 0.06, -R * 0.06);
      add(geo, hairMat);
      break;
    }
    case 'crew':
      shell(36, -45, 1.05);
      bangs({ n: 8, from: -0.85, to: 0.85, el: 0.64, len: 0.2, w: 0.22, th: 0.08, sweep: 0.1, fan: 0.3 });
      crown({ n: 7, len: 0.24, w: 0.3, th: 0.08, lift: 0.0 });
      frame({ len: 0.2, w: 0.2, th: 0.08 });
      sides({ len: 0.2, w: 0.2, th: 0.08, el: 0.3 });
      break;
    case 'side_part':
      shell(30, -45);
      bangs({ n: 7, from: -0.45, to: 0.95, el: 0.58, len: 0.36, w: 0.36, th: 0.13, sweep: 0.85, fan: 0.25 });
      bangs({ n: 2, from: -0.95, to: -0.65, el: 0.52, len: 0.26, w: 0.34, th: 0.12, sweep: -0.5, fan: 0.2 });
      crown({ n: 6 });
      frame();
      sides({ len: 0.26, el: 0.28 });
      break;
    case 'gray_short':
      shell(32, -45);
      bangs({ n: 6, from: -0.5, to: 0.9, el: 0.62, len: 0.3, w: 0.36, th: 0.12, sweep: 0.7, fan: 0.2 });
      bangs({ n: 2, from: -0.95, to: -0.7, el: 0.56, len: 0.22, w: 0.34, th: 0.11, sweep: -0.6, fan: 0.2 });
      crown({ n: 5, len: 0.3 });
      frame({ len: 0.24 });
      sides({ len: 0.22, el: 0.3 });
      break;
    case 'short':
      shell(28, -44);
      if (fem) {
        // a short neat cut with long side-swept bangs
        bangs({ n: 7, from: -0.55, to: 0.95, el: 0.56, len: 0.42, w: 0.36, th: 0.13, sweep: 0.75, fan: 0.25 });
        bangs({ n: 2, from: -0.95, to: -0.7, el: 0.5, len: 0.3, w: 0.34, th: 0.12, sweep: -0.4, fan: 0.2 });
        sides({ len: 0.5, w: 0.34, th: 0.13, el: 0.3, hug: 0.4, hang: true });
        crown({ n: 5, len: 0.28 });
        frame();
      } else {
        bangs({ n: 7, from: -0.82, to: 0.82, el: 0.56, len: 0.34, w: 0.34, th: 0.13, sweep: 0.25, fan: 0.4 });
        crown({ n: 7, len: 0.32 });
        frame();
        sides({ len: 0.26, el: 0.28 });
      }
      break;
    case 'bob':
      shell(30, -62);
      bangs({ n: 8, from: -0.85, to: 0.85, el: 0.56, len: 0.38, w: 0.34, th: 0.13, sweep: 0.3, fan: 0.35 });
      sides({ len: 0.85, w: 0.44, th: 0.16, el: 0.4, az: [1.0, 1.3, 1.65, 2.0], hug: 0.55, inward: 0, hang: true, blunt: true });
      crown({ n: 5, len: 0.3 });
      break;
    case 'long': {
      shell(30, -62);
      bangs({ n: 8, from: -0.85, to: 0.85, el: 0.56, len: 0.38, w: 0.34, th: 0.12, sweep: -0.15, fan: 0.4 });
      sides({ len: 1.3, w: 0.44, th: 0.15, el: 0.4, az: [1.0, 1.3, 1.65, 2.0], hug: 0.12, inward: 0, hang: true, blunt: true });
      for (let i = 0; i < 6; i++) {
        const az = Math.PI + (i - 2.5) * 0.32;
        lock(az, 0.35, { len: 1.9, w: 0.5, th: 0.2, hug: 0.05, hang: true, blunt: true, radius: 1.06 });
      }
      crown({ n: 5, len: 0.3 });
      break;
    }
    case 'ponytail':
      shell(32, -48);
      bangs({ n: 7, from: -0.7, to: 0.9, el: 0.58, len: 0.36, w: 0.34, th: 0.12, sweep: 0.45, fan: 0.3 });
      frame({ len: 0.6 });
      break;
    case 'bun':
      shell(32, -48);
      bangs({ n: 8, from: -0.8, to: 0.8, el: 0.6, len: 0.3, w: 0.34, th: 0.12, sweep: 0.5, fan: 0.25, part: -0.12 });
      frame({ len: 0.5 });
      {
        const { p } = headPoint(Math.PI, 0.62, R * 1.2, R);
        const bun = new THREE.SphereGeometry(R * 0.36, 16, 12);
        bun.scale(1.1, 0.95, 0.9); bun.translate(p.x, p.y, p.z);
        add(bun, tone(0.95));
      }
      break;
    case 'wavy':
      shell(fem ? 32 : 38, fem ? -60 : -45, fem ? 1.08 : 1.065);
      if (fem) {
        // a soft, full curly bob: curly bangs, clumps all over, and volume down to the jaw
        bangs({ n: 7, from: -0.8, to: 0.8, el: 0.6, len: 0.28, w: 0.38, th: 0.14, sweep: 0, fan: 0.4, jitter: 1.4 });
        clumps({ rows: [[1.4, 5, 1.6], [1.15, 9, 2.2], [0.88, 11, 2.6], [0.6, 12, 2.9], [0.32, 12, 3.0], [0.05, 12, 3.0], [-0.22, 10, 2.9]] });
        // extra volume on top: bigger clumps sitting a little proud of the shell
        clumps({ rows: [[1.25, 7, 2.0], [0.95, 9, 2.4]], len: 0.42, w: 0.5, th: 0.22, radius: 1.13 });
        sides({ len: 0.55, w: 0.42, th: 0.18, el: 0.25, az: [1.15, 1.5, 1.85], hug: -0.4, hang: true });
      } else {
        bangs({ n: 7, from: -0.8, to: 0.8, el: 0.58, len: 0.3, w: 0.34, th: 0.14, sweep: 0.1, fan: 0.5, jitter: 0.9 });
        for (let i = 0; i < 8; i++) lock(-1.3 + i * 0.37 + (rand() - 0.5) * 0.2, 1.0 + (rand() - 0.5) * 0.3, { len: 0.3, w: 0.32, th: 0.15, up: true, dir: (rand() - 0.5) * 1.6, hug: 0.9, lift: 0.02, radius: 1.05 });
        sides({ len: 0.28, el: 0.3 });
      }
      break;
    default:
      shell();
      bangs();
  }
}
