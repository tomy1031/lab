// Hair for the procedural townspeople: one smooth, sculpted mass per head, like a clay or vinyl figure.
// A cap is draped over the skull from the crown down to a hairline that is drawn per style: a few large
// fringe locks at the front (lobes with soft creases between them), sideburns, the nape, or hair that
// hangs free (bob, long). Curls are big soft clumps pressed into the same mass. A couple of rounded tufts,
// a bun or a tail are added on top. The mass has a clean outline and smooth normals; creases are a slight
// dent plus a darker tone, so the hair reads from a few metres in VR at a small triangle cost.
import * as THREE from 'three';
import { HEAD_SCALE } from './face.js';

const HALF = Math.PI / 2;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const gauss = (x) => Math.exp(-x * x);

/** Smooth curve through [x, value] keys (clamped at the ends). */
function keys(pts) {
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return mix(pts[i - 1][1], pts[i][1], sm(pts[i - 1][0], pts[i][0], x));
    return pts[pts.length - 1][1];
  };
}

/** One fringe lock: [centre az, half width, depth, skew of the tip (-1..1)] → how far it hangs at az. */
function lobeAt(az, [c, w, d, skew = 0]) {
  const x = (az - c) / w;
  if (Math.abs(x) >= 1) return 0;
  const xl = x < skew ? (x - skew) / (1 + skew) : (x - skew) / (1 - skew);
  return d * (1 - Math.abs(xl) ** 1.7) ** 0.8;
}

function rng(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// a rounded tuft: radius along its length (0 root … 1 tip)
const TUFT = [[0, 0], [0.72, 0.06], [1, 0.26], [0.9, 0.5], [0.6, 0.76], [0.26, 0.93], [0, 1]];

/**
 * Build the hair for one person.
 * add(geo, material) receives geometry already in head-centre coordinates.
 * Positions on the head: az = angle around the head (0 = front, + toward the person's left),
 * s = angle down from the crown (π/2 = the level of the head centre; more = below it).
 */
export function buildHair({ add, R, style, color, sex, extras, name = '' }) {
  const rand = rng(`${name}:${style}`);
  // a touch of warm light in every colour, so that even black hair keeps its form
  const base = new THREE.Color(color).lerp(new THREE.Color('#8a6f5e'), 0.07);
  const hairMat = { color: base.clone(), bucket: 'hair', opacity: 1 };
  const dark = { color: base.clone().multiplyScalar(0.6), bucket: 'hair', opacity: 1 };
  const fem = sex === 'f';
  const capOn = extras.has('cap');
  const [SX, SY, SZ] = HEAD_SCALE;

  /**
   * The sculpted mass. base(|az|) → hairline (s) without locks; lobes → fringe locks; th → thickness
   * (R units) at the top and at the sides; hang → below the head centre the hair falls straight down
   * (fall(az, d) → radius factor, d = how far down in R) instead of hugging the head.
   */
  const mass = ({ baseL, lobes = [], top = 0.12, side = 0.085, edge = 0.5, hang = false, fall = () => 1, bumps = 0, scallop = 0, bulge = 0.035, part = null, slant = 0.25, N = 36, nv = 10, start = null, sheen = 0.12 }) => {
    const lobeN = (az) => { let l = 0; for (const lb of lobes) l = Math.max(l, lobeAt(az, lb) / lb[2]); return l; };
    const end = (az) => {
      let l = 0;
      for (const lb of lobes) l = Math.max(l, lobeAt(az, lb));
      return baseL(Math.abs(az), az) + l + (scallop ? scallop * 0.5 * (1 + Math.cos(az * 7 + 0.6)) * sm(0.9, 1.2, Math.abs(az)) : 0);
    };
    // creases between neighbouring locks
    const sorted = [...lobes].sort((a, b) => a[0] - b[0]);
    const creases = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]; const b = sorted[i + 1];
      if (b[0] - b[1] - (a[0] + a[1]) > 0.15) continue;
      creases.push((a[0] + a[1] + b[0] - b[1]) / 2);
    }
    const creaseEnd = creases.map((b) => end(b));
    const crease = (az, s) => {
      let g = 0;
      creases.forEach((b, i) => { g = Math.max(g, gauss((az - b - slant * (creaseEnd[i] - s) * Math.sign(b - (part ?? -9))) / 0.05) * sm(0.75, 0.1, creaseEnd[i] - s)); });
      if (part !== null) g = Math.max(g, gauss((az - part) / 0.045) * sm(0.2, 0.55, s) * 0.8);
      return g;
    };
    const thick = (az, s, se) => {
      let t = mix(top, side, sm(0.35, 1.35, s));
      // curls: big soft clumps that spiral around the head
      if (bumps) t += bumps * (0.5 + 0.5 * Math.cos(az * 5 + s * 3.2)) * (0.5 + 0.5 * Math.cos(s * 7.2 - az * 2)) * sm(0.05, 0.35, s);
      if (capOn) t = Math.min(t, 0.03 + 0.07 * sm(1.25, 1.5, s));
      t *= edge + (1 - edge) * sm(0, 0.3, se - s);
      // every lock is a soft rounded volume, with a dent where two locks meet
      t += bulge * lobeN(az) * sm(0.95, 0.2, se - s) * sm(0, 0.12, se - s);
      return t - 0.04 * crease(az, s);
    };
    const point = (az, s, t, kr = 1) => {
      const r = R * (1 + t);
      if (s <= HALF || !hang) { const el = HALF - s; const ce = Math.cos(el) * kr; return [Math.sin(az) * ce * r * SX, Math.sin(el) * r * SY, Math.cos(az) * ce * r * SZ]; }
      const d = s - HALF; const k = kr * fall(az, d);
      return [Math.sin(az) * r * SX * k, -d * R, Math.cos(az) * r * SZ * k];
    };
    // columns: an even ring plus the tips and edges of every lock, so the outline of the fringe is exact
    const want = [];
    for (let i = 0; i < N; i++) want.push([-Math.PI + (2 * Math.PI * i) / N, 0]);
    for (const [c, w, , skew = 0] of lobes) for (const k of [-1, -0.55, skew - 0.3, skew, skew + 0.3, 0.55, 1]) want.push([c + w * Math.max(-1, Math.min(1, k)), 1]);
    for (const b of creases) want.push([b, 2]);
    if (part !== null) want.push([part, 2]);
    want.sort((a, b) => a[0] - b[0]);
    const cols = [];
    for (const [az, pr] of want) {
      const last = cols[cols.length - 1];
      if (last && az - last[0] < 0.045) { if (pr > last[1]) cols[cols.length - 1] = [az, pr]; continue; }
      cols.push([az, pr]);
    }
    const nc = cols.length; const rows = nv + 2;
    const pos = []; const col = []; const nor = [];
    // normals come from the sculpted surface itself (not from the triangles), so the mass shades smoothly
    const surf = (az, s) => new THREE.Vector3(...point(az, s, thick(az, s, end(az))));
    const normalAt = (az, s) => {
      const e = 0.02; const s1 = Math.max(s, 0.03);
      const du = surf(az + e, s1).sub(surf(az - e, s1)); const dv = surf(az, s1 + e).sub(surf(az, s1 - e));
      const n = dv.cross(du);
      return n.lengthSq() > 1e-16 ? n.normalize() : n.set(0, 1, 0);
    };
    for (let i = 0; i < nc; i++) {
      const az = cols[i][0]; const se = end(az); const s0 = start ? start(Math.abs(az)) : 0;
      for (let j = 0; j <= nv; j++) {
        const s = s0 + (se - s0) * (j / nv);
        const t = start && j === 0 ? -0.012 : thick(az, s, se) * (start ? sm(0.02, 0.15, se - s0) : 1);
        pos.push(...point(az, s, t));
        const n = j === 0 && !start ? new THREE.Vector3(0, 1, 0) : normalAt(az, Math.min(s, se - 0.02));
        nor.push(n.x, n.y, n.z);
        const tone = 1 - 0.3 * crease(az, s) + sheen * gauss((s - 0.78) / 0.2) - 0.1 * sm(0.5, 0, se - s) * (se > HALF + 0.2 ? 1 : 0);
        col.push(tone, tone, tone);
      }
      // the edge is tucked in under the hair (a soft lip instead of a paper-thin rim)
      if (hang && se > HALF + 0.12) pos.push(...point(az, se - 0.04, 0, 0.8)); else pos.push(...point(az, se - 0.06, -0.02));
      col.push(0.62, 0.62, 0.62);
      { const n = normalAt(az, se - 0.02).multiplyScalar(0.35); n.y -= 1; n.normalize(); nor.push(n.x, n.y, n.z); }
    }
    const idx = [];
    for (let i = 0; i < nc; i++) {
      const i1 = (i + 1) % nc;
      for (let j = 0; j < rows - 1; j++) {
        const A = i * rows + j; const B = i1 * rows + j; const D = A + 1; const E = B + 1;
        if (j > 0 || start) idx.push(A, D, B);
        idx.push(B, D, E);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    add(g, hairMat);
    if (hang) {
      // the inside of hair that hangs free (seen past the neck and from behind)
      const p = g.attributes.position; const inner = [];
      for (let k = 0; k < idx.length; k += 3) {
        const [a, b, c] = [idx[k], idx[k + 1], idx[k + 2]];
        if (Math.max(p.getY(a), p.getY(b), p.getY(c)) < -0.05 * R) inner.push(a, c, b);
      }
      const gi = new THREE.BufferGeometry();
      gi.setAttribute('position', p.clone());
      const nn = g.attributes.normal.clone(); for (let i = 0; i < nn.array.length; i++) nn.array[i] *= -1;
      gi.setAttribute('normal', nn);
      gi.setIndex(inner);
      add(gi, dark);
    }
    return { end, thick, point };
  };

  /** A rounded tuft rooted at (az, s), growing along the head toward `lean` (0 = up to the crown) and lifted off it. */
  const tuft = (az, s, { len = 0.34, w = 0.2, lean = 0, lift = 0.5, curl = 0.25, flat = 0.75, depth = 0.05, k = 1 } = {}) => {
    const el = HALF - s;
    const n = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const p = n.clone().multiplyScalar(R * (1 + depth)).multiply(new THREE.Vector3(SX, SY, SZ));
    const up = new THREE.Vector3(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el));
    const sideV = new THREE.Vector3().crossVectors(up, n);
    const tan = up.clone().multiplyScalar(Math.cos(lean)).addScaledVector(sideV, Math.sin(lean));
    const d = tan.clone().multiplyScalar(Math.cos(lift)).addScaledVector(n, Math.sin(lift)).normalize();
    const X = new THREE.Vector3().crossVectors(d, n).normalize();
    const Z = new THREE.Vector3().crossVectors(X, d).normalize();
    const geo = new THREE.LatheGeometry(TUFT.map(([r, y]) => new THREE.Vector2(r, y)), 8);
    const pos = geo.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      v.copy(p).addScaledVector(d, y * len * R).addScaledVector(X, x * w * R * 0.5 + curl * y * y * len * R).addScaledVector(Z, z * w * R * 0.5 * flat - 0.3 * curl * y * y * len * R);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.deleteAttribute('uv');
    geo.computeVertexNormals();
    add(geo, { color: base.clone().multiplyScalar(k), bucket: 'hair', opacity: 1 });
  };

  /** A ball of hair (bun) at (az, s). */
  const ball = (az, s, r, scale = [1.1, 0.95, 0.95], out = 1.16) => {
    const el = HALF - s;
    const g = new THREE.SphereGeometry(R * r, 14, 10);
    g.scale(...scale);
    g.translate(Math.sin(az) * Math.cos(el) * R * out, Math.sin(el) * R * out, Math.cos(az) * Math.cos(el) * R * out);
    g.deleteAttribute('uv');
    add(g, { color: base.clone().multiplyScalar(0.96), bucket: 'hair', opacity: 1 });
  };

  // hairlines (s at |az|): men's cuts leave the ears free, with a sideburn in front and the nape behind
  const cut = (f0, nape = 2.08) => keys([[0, f0], [0.85, f0 + 0.04], [1.04, f0 + 0.2], [1.2, 1.68], [1.36, 1.6], [1.5, 1.45], [1.76, 1.48], [1.96, 1.84], [2.35, nape - 0.04], [Math.PI, nape]]);
  // pulled back (bun, ponytail): a high, soft hairline, the ears free
  const pulled = (f0) => keys([[0, f0], [0.8, f0 + 0.05], [1.02, f0 + 0.22], [1.18, 1.62], [1.34, 1.5], [1.5, 1.42], [1.78, 1.46], [1.98, 1.8], [2.4, 2.0], [Math.PI, 2.04]]);
  // hair that covers the ears and hangs to `len` (R below the head centre) at the sides and `back` behind
  const hanging = (f0, len, back = len) => keys([[0, f0], [0.82, f0 + 0.04], [0.98, f0 + 0.2], [1.1, HALF + len * 0.94], [1.3, HALF + len], [1.8, HALF + len], [2.3, HALF + back], [Math.PI, HALF + back]]);

  switch (style) {
    case 'bald':
      break;
    case 'bald_top':
      // a low fringe of hair around the sides and the back
      mass({ baseL: keys([[0, 1.5], [1.15, 1.5], [1.3, 1.72], [1.5, 1.5], [1.78, 1.52], [2.0, 1.9], [Math.PI, 2.02]]), start: keys([[0, 1.5], [1.15, 1.46], [1.4, 1.24], [Math.PI, 1.12]]), top: 0.05, side: 0.05, edge: 0.3, nv: 4, sheen: 0 });
      break;
    case 'crew':
      mass({ baseL: cut(0.96), lobes: [[-0.62, 0.34, 0.08, 0.2], [-0.02, 0.36, 0.1, 0.3], [0.6, 0.34, 0.08, 0.3]], top: 0.085, side: 0.06, edge: 0.55, nv: 9 });
      if (!capOn && !extras.has('headband')) tuft(0.2, 0.5, { len: 0.26, w: 0.3, lean: -0.5, lift: 0.2, curl: 0.15, depth: 0.03 });
      break;
    case 'side_part':
      mass({ baseL: cut(1.0), lobes: [[-0.86, 0.3, 0.16, -0.5], [0.12, 0.7, 0.24, 0.72], [0.98, 0.22, 0.12, 0.3]], part: -0.56, top: 0.13, side: 0.08, nv: 10 });
      break;
    case 'gray_short':
      mass({ baseL: cut(0.93), lobes: [[-0.8, 0.3, 0.1, -0.5], [0.12, 0.64, 0.14, 0.6], [0.95, 0.22, 0.08, 0.3]], part: -0.5, top: 0.13, side: 0.085, nv: 10 });
      tuft(-0.1, 0.52, { len: 0.36, w: 0.34, lean: -1.2, lift: 0.22, curl: 0.2 });
      break;
    case 'short':
      if (fem) {
        // a short neat cut over the ears with a long side-swept fringe
        mass({ baseL: hanging(1.04, 0.42, 0.5), lobes: [[-0.78, 0.3, 0.2, -0.45], [0.02, 0.56, 0.26, 0.62], [0.82, 0.3, 0.2, 0.4]], part: -0.48, top: 0.13, side: 0.1, hang: true, fall: (az, d) => 1 + 0.03 * Math.sin(d * 5) - 0.5 * d * d, nv: 11 });
      } else {
        if (capOn) mass({ baseL: cut(0.8), top: 0.03, side: 0.08, nv: 9 });
        else mass({ baseL: cut(1.02), lobes: [[-0.74, 0.32, 0.2, 0.2], [-0.14, 0.34, 0.26, 0.35], [0.48, 0.34, 0.22, 0.4], [0.96, 0.2, 0.12, 0.3]], top: 0.14, side: 0.085, nv: 10 });
        if (!capOn) {
          tuft(0.25, 0.42, { len: 0.34, w: 0.32, lean: -0.9, lift: 0.5, curl: 0.3 });
          tuft(-0.5, 0.5, { len: 0.28, w: 0.28, lean: 0.8, lift: 0.4, curl: -0.25 });
        }
      }
      break;
    case 'bob':
      mass({ baseL: hanging(1.06, 0.72), lobes: [[-0.72, 0.32, 0.2, -0.3], [-0.08, 0.38, 0.24, 0.3], [0.56, 0.36, 0.22, 0.45]], top: 0.13, side: 0.11, hang: true, fall: (az, d) => 1 + 0.05 * Math.sin(d * 3.2) - 0.22 * d ** 3, nv: 12 });
      break;
    case 'long':
      // long straight hair: past the chin at the sides, down the back behind the shoulders
      mass({ baseL: hanging(1.08, 0.98, 1.85), lobes: [[-0.66, 0.36, 0.2, -0.2], [0, 0.36, 0.22, 0], [0.66, 0.36, 0.2, 0.2]], top: 0.12, side: 0.1, hang: true, fall: (az, d) => 1 + 0.03 * Math.sin(d * 2.4) - 0.12 * d * d * sm(1.5, 2.2, Math.abs(az)) - 0.06 * d * d, nv: 14 });
      break;
    case 'ponytail':
      // pulled back into a tail, with a soft strand in front of each ear
      mass({ baseL: keys([[0, 1.0], [0.8, 1.05], [1.0, 1.22], [1.14, 1.86], [1.27, 1.9], [1.4, 1.5], [1.78, 1.46], [1.98, 1.8], [2.4, 2.0], [Math.PI, 2.04]]), lobes: [[-0.8, 0.3, 0.2, -0.5], [0.06, 0.6, 0.26, 0.66], [0.9, 0.26, 0.2, 0.3]], part: -0.5, top: 0.11, side: 0.075, N: 44, nv: 11 });
      break;
    case 'bun':
      mass({ baseL: pulled(0.98), lobes: [[-0.72, 0.4, 0.17, -0.55], [0.36, 0.66, 0.2, 0.6]], part: -0.3, top: 0.1, side: 0.07, nv: 10 });
      ball(Math.PI, 0.62, 0.36);
      break;
    case 'wavy':
      if (fem) {
        // curly hair: a full, rounded mass of big soft clumps down to the jaw
        mass({ baseL: hanging(0.98, 0.5, 0.62), lobes: [[-0.76, 0.3, 0.18, -0.2], [-0.2, 0.32, 0.22, 0.1], [0.4, 0.32, 0.2, -0.1], [0.92, 0.26, 0.18, 0.2]], top: 0.17, side: 0.15, edge: 0.7, bumps: 0.11, scallop: 0.16, hang: true, fall: (az, d) => 1.02 + 0.08 * Math.sin(d * 4) - 0.35 * d * d, N: 48, nv: 14, sheen: 0.06 });
        tuft(0.5, 0.42, { len: 0.34, w: 0.56, lean: -1.2, lift: 0.3, curl: 0.5, depth: 0.1 });
        tuft(-0.5, 0.4, { len: 0.34, w: 0.56, lean: 1.0, lift: 0.3, curl: -0.5, depth: 0.1 });
      } else {
        // soft wavy hair: rounder locks, more volume, a tousled top
        mass({ baseL: cut(1.0), lobes: [[-0.78, 0.32, 0.2, -0.1], [-0.2, 0.34, 0.26, 0.2], [0.42, 0.34, 0.22, -0.2], [0.94, 0.24, 0.16, 0.2]], top: 0.16, side: 0.1, bumps: 0.045, N: 40, nv: 11, sheen: 0.05 });
        tuft(0.1, 0.4, { len: 0.36, w: 0.36, lean: -1.0, lift: 0.5, curl: 0.4 });
        tuft(-0.6, 0.55, { len: 0.3, w: 0.32, lean: 0.9, lift: 0.45, curl: -0.4 });
        tuft(0.8, 0.6, { len: 0.28, w: 0.3, lean: -0.6, lift: 0.4, curl: 0.3 });
      }
      break;
    default:
      mass({ baseL: cut(1.02), lobes: [[-0.5, 0.4, 0.2, 0], [0.4, 0.4, 0.2, 0.3]] });
  }
  void rand;
}
