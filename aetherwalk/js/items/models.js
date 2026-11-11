// js/items/models.js — every item's look, built in code (§7.4 style, premium pass): smooth where light rolls
// over a surface, crisp facets where an edge should catch it (blades), believable materials through vertex
// colour (steel, gold, wood grain, leather wraps) and per-vertex AO (colour alpha). Each geometry has two groups:
// matte (wood, leather, cloth, food) and metal (steel, gold, brass) → a held item draws with two art.material
// looks (spec/gloss; ≤ 2 draw calls); world pools draw the whole thing with the matte one (one call per kind).
// Gold is a deep albedo (#c0903a) so the polished highlight, not the base colour, carries the shine.
// Grip space: origin at the fist, -Z along the held rod (blade / shaft / neck), +X back of the right hand,
// +Y toward the elbow (handles sit where core/grips.js says the hand closes). Weapons ≤ 400 triangles.
import * as THREE from 'three';
import { GeoBuilder, triCount } from '../core/geo.js';

const C = {
  steel: 0xc3ced8, steelHi: 0xf2f7fb, steelLo: 0x8796a3, gold: 0xc0903a, goldHi: 0xd8ab55, goldLo: 0x8a6224,
  cyan: 0x7fe9ff, white: 0xfffbe8, leather: 0x5e3c26, leatherHi: 0x7a5134, wood: 0x8a6440, woodHi: 0xa77d50, woodLo: 0x5f4129,
  dark: 0x3d2c1f, cloth: 0xb79a6a, pitch: 0x2a1d14, red: 0xd9473a, apple: 0xd8432f, baked: 0xa8582e, glow: 0x62e6ff,
  cream: 0xf1e6cc, ice: 0x9fe3f5, honey: 0xf2c66b, rock: 0x8d8a85, bomb: 0x6e2024, bombDot: 0xffb347, green: 0x5fae4a,
  glass: 0x9fc8d6, paper: 0xf6eedb,
};
const R90 = Math.PI / 2;

// ── colour helpers (item space) ──
const fract = (x) => x - Math.floor(x);
const hash = (n) => fract(Math.sin(n * 127.1) * 43758.5453);
/** wood grain along an axis: long streaks, slight knots */
const grain = (axis = 'z', k = 1) => (x, y, z, c) => {
  const a = axis === 'z' ? z : axis === 'y' ? y : x, u = axis === 'z' ? x + y : axis === 'y' ? x + z : y + z;
  const g = 0.5 + 0.5 * Math.sin(a * 9 * k + Math.sin(u * 160) * 1.6 + Math.sin(a * 37 * k) * 0.6);
  c.multiplyScalar(0.84 + 0.22 * g);
};
/** steel: brighter toward a value 0..1 (edge-ness) */
const MIXC = new THREE.Color();

// ── shapes ──
/** a blade: cross-section ring (thickness x, width y) swept along -Z with a width profile; faceted */
function blade(b, { z0, z1, tipZ, w0, w1, t, fullerTo = 0.7, color = C.steel, inlay = true }) {
  const rings = 5;
  const sec = (w, fuller) => {
    const t1 = t * 0.55, tf = fuller ? t * 0.5 : t;
    return [[0, w], [t1, 0.62 * w], [t, 0.26 * w], [tf, 0], [t, -0.26 * w], [t1, -0.62 * w], [0, -w], [-t1, -0.62 * w], [-t, -0.26 * w], [-tf, 0], [-t, 0.26 * w], [-t1, 0.62 * w]];
  };
  const R = [];
  for (let i = 0; i < rings; i++) {
    const f = i / (rings - 1);
    const z = z0 + (z1 - z0) * f;
    R.push({ z, pts: sec(w0 + (w1 - w0) * f, f < fullerTo) });
  }
  const arr = [];
  const n = 12;
  for (let r = 0; r < rings - 1; r++) for (let i = 0; i < n; i++) {
    const A = R[r], B = R[r + 1], j = (i + 1) % n;
    const a0 = [A.pts[i][0], A.pts[i][1], A.z], a1 = [A.pts[j][0], A.pts[j][1], A.z];
    const b0 = [B.pts[i][0], B.pts[i][1], B.z], b1 = [B.pts[j][0], B.pts[j][1], B.z];
    arr.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
  }
  const L = R[rings - 1];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; arr.push(L.pts[i][0], L.pts[i][1], L.z, 0, 0, tipZ, L.pts[j][0], L.pts[j][1], L.z); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const span = z0 - tipZ;
  b.add(g, color, [0, 0, 0], [0, 0, 0], 1, {
    metal: true,
    shade: (x, y, z, c) => {
      const f = Math.min(1, Math.max(0, (z0 - z) / span));
      const w = w0 + (w1 - w0) * Math.min(1, f / ((z0 - z1) / span));
      const e = Math.abs(y) / Math.max(1e-4, w);
      if (e > 0.95 || z <= z1 + 1e-4) c.lerp(MIXC.setHex(C.steelHi), 0.85);            // the honed edge / tip
      else if (Math.abs(x) < t * 0.6 && e < 0.1) {                                        // the fuller
        c.lerp(MIXC.setHex(C.steelLo), 0.5);
        if (inlay) c.lerp(MIXC.setHex(C.cyan), 0.35);
        c.ao = 0.8;
      } else if (e > 0.5) c.lerp(MIXC.setHex(C.steelHi), 0.25);
    },
  });
}

/** a swept tube with per-ring radii (elliptical: rx, ry) along a polyline in the Y-Z plane; smooth */
function sweep(b, pts, radii, radial, color, opts = {}) {
  const pos = [], idx = [];
  const P = pts.map((p) => new THREE.Vector3(...p));
  for (let i = 0; i < P.length; i++) {
    const t = new THREE.Vector3().subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    const nx = new THREE.Vector3(1, 0, 0);
    const ny = new THREE.Vector3().crossVectors(t, nx).normalize();
    const [rx, ry] = radii[i];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      pos.push(P[i].x + nx.x * Math.cos(a) * rx + ny.x * Math.sin(a) * ry, P[i].y + nx.y * Math.cos(a) * rx + ny.y * Math.sin(a) * ry, P[i].z + nx.z * Math.cos(a) * rx + ny.z * Math.sin(a) * ry);
    }
  }
  for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < radial; k++) {
    const a = i * radial + k, bb = i * radial + (k + 1) % radial, c = (i + 1) * radial + k, d = (i + 1) * radial + (k + 1) % radial;
    idx.push(a, bb, c, bb, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return b.add(g, color, [0, 0, 0], [0, 0, 0], 1, { smooth: true, ...opts });
}

/** leather wrap: a lathe with ridges along Y (later rotated onto Z) */
function wrapProfile(r, len, turns, depth = 0.0012) {
  const pts = [];
  const n = turns * 2;
  for (let i = 0; i <= n; i++) pts.push([r + (i % 2 ? depth : 0), -len / 2 + (len * i) / n]);
  return pts;
}

const BUILD = {
  sword(b) {
    blade(b, { z0: -0.052, z1: -0.74, tipZ: -0.85, w0: 0.024, w1: 0.017, t: 0.0058 });
    // crossguard ≈ 2.7 × the blade's width, swept slightly toward the blade, ball finials; a round quillon block
    sweep(b, [[0, -0.056, -0.0525], [0, -0.036, -0.0485], [0, -0.013, -0.0465], [0, 0.013, -0.0465], [0, 0.036, -0.0485], [0, 0.056, -0.0525]],
      [[0.0042, 0.0046], [0.0048, 0.0054], [0.0058, 0.0066], [0.0058, 0.0066], [0.0048, 0.0054], [0.0042, 0.0046]], 6, C.gold, { metal: 'gold' });
    b.sphere(0.0068, 5, 3, C.gold, [0, 0.0605, -0.054], [0, 0, 0], 1, { metal: 'gold', smooth: true });
    b.sphere(0.0068, 5, 3, C.gold, [0, -0.0605, -0.054], [0, 0, 0], 1, { metal: 'gold', smooth: true });
    b.lathe([[0.0, -0.0095], [0.0095, -0.0075], [0.0122, 0.0], [0.0095, 0.0075], [0.0, 0.0095]], 6, C.gold, [0, 0, -0.0465], [R90, 0, 0], [0.9, 1, 1.15], { metal: 'gold' });
    // grip: leather wrap with ridges, darker in the grooves (radius ≈ 1.3 cm: the hand closes on 1.38)
    b.lathe(wrapProfile(0.0126, 0.098, 3, 0.0012), 6, C.leather, [0, 0, 0.004], [R90, 0, 0], 1, {
      shade: (x, y, z, c) => { const r = Math.hypot(x, y); if (r < 0.0131) { c.multiplyScalar(0.72); c.ao = 0.7; } else c.lerp(MIXC.setHex(C.leatherHi), 0.4); },
    });
    // pommel: a gold wheel-pear
    b.lathe([[0.0, 0.0], [0.011, 0.001], [0.0152, 0.009], [0.0142, 0.019], [0.008, 0.026], [0.0, 0.028]], 7, C.gold, [0, 0, 0.05], [R90, 0, 0], 1, { metal: 'gold' });
    b.gem(0.0112, 0, -0.0465, 0.0062);
    b.gem(-0.0112, 0, -0.0465, 0.0062);
  },
  spear(b) {
    // ash shaft with grain, a leather grip band, a gold collar and butt cap, a leaf-shaped steel head
    b.cyl(0.0142, 0.0156, 1.92, 7, C.wood, [0, 0, -0.42], [R90, 0, 0], 1, { smooth: true, hseg: 4, shade: grain('z', 2) });
    b.lathe(wrapProfile(0.0153, 0.16, 3), 7, C.leather, [0, 0, 0.0], [R90, 0, 0], 1, {
      shade: (x, y, z, c) => { if (Math.hypot(x, y) < 0.0158) { c.multiplyScalar(0.72); c.ao = 0.72; } },
    });
    b.lathe([[0.0, 0], [0.019, 0.004], [0.02, 0.03], [0.017, 0.05], [0.0, 0.052]], 7, C.gold, [0, 0, 0.54], [-R90, 0, 0], 1, { metal: 'gold' });
    b.lathe([[0.0175, 0], [0.021, 0.006], [0.021, 0.03], [0.014, 0.07]], 7, C.gold, [0, 0, -1.37], [-R90, 0, 0], 1, { metal: 'gold' });
    blade(b, { z0: -1.43, z1: -1.56, tipZ: -1.64, w0: 0.024, w1: 0.03, t: 0.0055, fullerTo: 0.6, inlay: true });
    b.box(0.003, 0.05, 0.16, C.cyan, [0, 0.03, -1.3], [0.1, 0, 0], 1, {});            // ribbon
    b.gem(0, 0.022, -1.39, 0.008);
  },
  torch(b) {
    // a knotted branch (handle end z +0.13 → head z −0.41), a pitch-soaked cloth head bound with cord
    b.lathe([[0.0, -0.135], [0.018, -0.13], [0.02, -0.06], [0.017, 0.06], [0.02, 0.17], [0.018, 0.3], [0.021, 0.41], [0.0, 0.415]], 7, C.wood, [0, 0, 0], [-R90, 0, 0], 1, { shade: grain('z', 3) });
    b.lathe([[0.0, 0.0], [0.024, 0.002], [0.04, 0.02], [0.045, 0.055], [0.04, 0.095], [0.026, 0.118], [0.0, 0.124]], 8, C.pitch, [0, 0, -0.395], [-R90, 0, 0], 1, {
      shade: (x, y, z, c) => { const k = 0.5 + 0.5 * Math.sin(Math.atan2(y, x) * 5 + z * 140); c.lerp(MIXC.setHex(C.cloth), 0.12 + 0.25 * k); if (z < -0.5) c.multiplyScalar(0.6); },
    });
    b.torus(0.042, 0.0035, 4, 10, Math.PI * 2, C.cloth, [0, 0, -0.42], [0, 0, 0], 1, { smooth: true });
    b.torus(0.044, 0.0035, 4, 10, Math.PI * 2, C.cloth, [0, 0, -0.475], [0, 0, 0], 1, { smooth: true });
  },
  shield(b) {
    // Ø0.48 decagon board, 0.03 thick; face +X = five bevelled planks with grain + gold boss + gem; smooth gold rim;
    // back −X = darker planks, two crossed leather straps, a grip bar for the fist
    const cx = 0.065, cy = 0.02, R = 0.24, Rp = 0.222, T = 0.026;
    b.cyl(R, R, T, 10, 0x4a3322, [cx, cy, 0], [0, 0, R90], 1, { ao: 0.6 });
    const x0 = cx + T / 2, x1 = x0 + 0.006, xb1 = cx - T / 2, xb0 = xb1 - 0.004;
    const FACE = [0xa8794a, 0x9a6c42, 0xae8150, 0x946640, 0xa47648], BACK = [0x6e5034, 0x8f6e48, 0x553b26, 0x8a6a44, 0x664a30];
    const c = (y) => Math.sqrt(Math.max(0, Rp * Rp - y * y));
    for (let i = 0; i < 5; i++) {
      const ya = -0.225 + i * 0.09 + 0.003, yb = ya + 0.084;
      const pts = [[ya, -c(ya)], [ya, c(ya)], [yb, c(yb)], [yb, -c(yb)]].map(([y, z]) => [y + cy, z]);
      b.prismYZ(pts, x0, x1, FACE[i], { shade: grain('z', 1.5) });
      b.prismYZ(pts, xb0, xb1, BACK[i], { shade: grain('z', 1.5) });
    }
    b.torus(0.235, 0.017, 4, 20, Math.PI * 2, C.gold, [cx, cy, 0], [0, R90, 0], 1, { metal: 'gold', smooth: true });
    b.lathe([[0.062, 0], [0.058, 0.01], [0.044, 0.026], [0.024, 0.036], [0.0, 0.04]], 10, C.gold, [x1, cy, 0], [0, 0, -R90], 1, { metal: 'gold' });
    b.box(0.006, 0.03, 0.4, C.leather, [xb0 - 0.003, cy - 0.03, 0]);
    b.box(0.006, 0.4, 0.03, C.leather, [xb0 - 0.003, cy, -0.07]);
    b.cyl(0.012, 0.012, 0.12, 6, C.leather, [0.004, 0, 0], [R90, 0, 0], 1, { smooth: true });   // grip bar (in the fist)
    b.gem(x1 + 0.044, cy, 0, 0.022);
  },
  bow(b) {
    // laminated limbs: a smooth swept arc, belly toward -Y, tips curving back toward the archer; gold nocks
    const Rr = 0.75, cy = Rr - 0.04, n = 16, a0 = -0.87, a1 = 0.87;
    const pts = [], radii = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      pts.push([0, cy - Rr * Math.cos(t), Rr * Math.sin(t)]);
      const k = Math.abs(i / n - 0.5) * 2;                       // 0 at the grip, 1 at the tips
      radii.push([0.016 - 0.007 * k, 0.012 - 0.006 * k]);
    }
    sweep(b, pts, radii, 6, C.wood, {
      shade: (x, y, z, c) => { grain('z', 4)(x, y, z, c); if (Math.abs(z) > 0.52) c.lerp(MIXC.setHex(C.woodLo), 0.4); },
    });
    b.lathe(wrapProfile(0.021, 0.12, 4, 0.0015), 7, C.leather, [0, -0.034, 0], [R90, 0, 0], 1, {
      shade: (x, y, z, c) => { if (Math.hypot(x, y + 0.034) < 0.0218) { c.multiplyScalar(0.72); c.ao = 0.72; } },
    });
    b.lathe([[0.0, 0], [0.008, 0.004], [0.009, 0.018], [0.0, 0.026]], 6, C.gold, [0, 0.226, 0.565], [-0.2, 0, 0], 1, { metal: 'gold' });
    b.lathe([[0.0, 0], [0.008, 0.004], [0.009, 0.018], [0.0, 0.026]], 6, C.gold, [0, 0.226, -0.565], [Math.PI + 0.2, 0, 0], 1, { metal: 'gold' });
    b.box(0.006, 0.02, 0.012, C.white, [0, -0.058, 0]);                             // arrow rest
    b.gem(0, -0.045, -0.075, 0.009);
    b.gem(0, -0.045, 0.075, 0.009);
  },
  arrow(b) {
    b.cyl(0.0052, 0.0052, 0.76, 5, C.woodHi, [0, 0, -0.38], [R90, 0, 0], 1, { smooth: true, shade: grain('z', 6) });
    blade(b, { z0: -0.765, z1: -0.79, tipZ: -0.82, w0: 0.012, w1: 0.014, t: 0.0028, fullerTo: 0, inlay: false });
    for (const [rz, col] of [[0, C.cyan], [2.09, C.white], [4.19, C.white]]) {
      b.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.004, -0.02, 0, 0.022, -0.035, 0, 0.004, -0.11, 0, 0.004, -0.11, 0, 0.022, -0.035, 0, 0.016, -0.1,
        0, 0.004, -0.02, 0, 0.004, -0.11, 0, 0.022, -0.035, 0, 0.004, -0.11, 0, 0.016, -0.1, 0, 0.022, -0.035], 3)), col, [0, 0, 0], [0, 0, rz]);
    }
    b.cyl(0.0065, 0.0058, 0.014, 5, C.gold, [0, 0, -0.004], [R90, 0, 0], 1, { metal: 'gold', smooth: true });
  },
  bomb(b) {
    // a burstfruit: a dark husk split by six glowing ochre seams, a woody stem and a frayed fuse
    b.ico(0.062, 2, 0x3e1518, [0, 0, 0], [0, 0, 0], [1, 1, 1.08], {
      smooth: true,
      shade: (x, y, z, c) => {
        const a = Math.atan2(y, x), seam = Math.abs(Math.sin(a * 3));
        if (seam < 0.2) c.lerp(MIXC.setHex(C.bombDot), 0.85 * (1 - seam / 0.2));
        else c.lerp(MIXC.setHex(0x6e2024), 0.4 * seam);
        c.ao = 0.75 + 0.25 * Math.min(1, Math.max(0, (-z + 0.02) / 0.08));
      },
    });
    b.lathe([[0.0, 0], [0.013, 0.002], [0.009, 0.012], [0.006, 0.017]], 6, C.dark, [0, 0, -0.064], [-R90, 0, 0], 1, {});
    b.tube([[0, 0, -0.078], [0.004, 0.003, -0.088], [0.0, 0.006, -0.098], [-0.004, 0.003, -0.106]], 0.0025, 6, 4, C.cloth, {});
    b.box(0.032, 0.003, 0.016, C.green, [0.014, 0.0, -0.072], [0, 0.4, 0.2]);
  },
  rock(b) {
    b.dodeca(0.05, C.rock, [0, 0, 0], [0.3, 0.5, 0], [1, 0.8, 0.9], { shade: (x, y, z, c) => c.multiplyScalar(0.9 + 0.2 * hash(Math.round(x * 400) + Math.round(y * 300) * 7)) });
  },
  windfan(b) {
    // gold handle; a pleated paper leaf with cyan ribs (normal ±X), edged in gold
    b.lathe([[0.0, -0.075], [0.011, -0.07], [0.012, 0.05], [0.015, 0.056], [0.0, 0.062]], 7, C.gold, [0, 0, 0.0], [-R90, 0, 0], 1, { metal: 'gold' });
    const leaf = [], N = 10, r0 = 0.03, r1 = 0.235, cz = -0.13;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N - 0.5) * Math.PI * 0.98, a1 = ((i + 1) / N - 0.5) * Math.PI * 0.98;
      const pl = i % 2 ? 0.006 : -0.006;                  // pleats
      const P = (r, a, x) => [x, Math.sin(a) * r, cz - Math.cos(a) * r];
      const A = P(r0, a0, 0), B = P(r1, a0, 0), Cc = P(r1, a1, pl), D = P(r0, a1, 0);
      leaf.push(...A, ...B, ...Cc, ...A, ...Cc, ...D);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(leaf, 3));
    b.add(g, C.paper, [0, 0, 0], [0, 0, 0], 1, { shade: (x, y, z, c) => { const r = Math.hypot(y, z - cz); if (r > 0.22) c.lerp(MIXC.setHex(C.gold), 0.8); } });
    // the back of the leaf (so both sides render)
    const back = new Float32Array(leaf.length);
    for (let i = 0; i < leaf.length; i += 9) { back.set(leaf.slice(i, i + 3), i); back.set(leaf.slice(i + 6, i + 9), i + 3); back.set(leaf.slice(i + 3, i + 6), i + 6); }
    const gb = new THREE.BufferGeometry();
    gb.setAttribute('position', new THREE.Float32BufferAttribute(back, 3));
    b.add(gb, 0xe8dcc0, [0, 0, 0], [0, 0, 0], 1, {});
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4 - 0.5) * Math.PI * 0.95;
      b.box(0.009, 0.005, 0.2, C.cyan, [0, Math.sin(a) * 0.125, cz - Math.cos(a) * 0.125], [a, 0, 0]);
    }
  },
  flask(b) {
    // a blue glass flask in a leather sleeve with a brass neck and a cork
    b.lathe([[0.0, -0.065], [0.03, -0.064], [0.045, -0.05], [0.047, -0.01], [0.044, 0.03], [0.026, 0.06], [0.017, 0.072]], 9, C.glass, [0, 0, 0], [-R90, 0, 0], 1, {
      shade: (x, y, z, c) => { if (z > -0.035 && z < 0.025) { c.setHex(C.leather); if (Math.abs(z + 0.005) > 0.025) c.multiplyScalar(0.8); } },
    });
    b.lathe([[0.017, 0], [0.019, 0.004], [0.019, 0.02], [0.016, 0.024]], 8, C.gold, [0, 0, -0.07], [-R90, 0, 0], 1, { metal: 'gold' });
    b.lathe([[0.0, 0], [0.015, 0.0], [0.014, 0.018], [0.0, 0.02]], 7, 0xb08a5c, [0, 0, -0.092], [-R90, 0, 0], 1, {});
    b.gem(0.047, 0, -0.005, 0.009);
  },
  waybell(b) {
    b.lathe([[0.0, -0.06], [0.009, -0.058], [0.009, 0.05], [0.0, 0.052]], 6, C.gold, [0, 0, 0.0], [R90, 0, 0], 1, { metal: 'gold' });
    b.torus(0.022, 0.005, 5, 10, Math.PI * 2, C.gold, [0, 0, 0.07], [0, R90, 0], 1, { metal: 'gold', smooth: true });
    b.lathe([[0.0, 0], [0.012, 0.002], [0.022, 0.03], [0.04, 0.062], [0.046, 0.07], [0.0, 0.071]], 8, C.gold, [0, 0, -0.06], [-R90, 0, 0], 1, { metal: 'gold' });
    b.ico(0.012, 1, C.goldHi, [0, 0, -0.13], [0, 0, 0], 1, { metal: 'gold', smooth: true });
    b.box(0.004, 0.03, 0.1, C.cyan, [0, 0.02, 0.03], [0, 0, 0], 1, { metal: true });    // ribbon (metal group: one call)
  },
  apple(b) {
    b.ico(0.046, 1, C.apple, [0, 0, 0], [0, 0, 0], [1, 0.92, 1], { smooth: true, shade: (x, y, z, c) => { c.lerp(MIXC.setHex(0xf2b24a), Math.max(0, 0.5 - y / 0.06) * 0.35 + Math.max(0, x / 0.05) * 0.25); } });
    b.cyl(0.003, 0.0035, 0.03, 5, C.dark, [0, 0.05, 0], [0, 0, 0.2], 1, { smooth: true });
    b.box(0.03, 0.002, 0.016, C.green, [0.015, 0.058, 0], [0, 0, 0.4]);
  },
  apple_baked(b) {
    b.ico(0.044, 1, C.baked, [0, 0, 0], [0, 0, 0], [1, 0.85, 1], { smooth: true, shade: (x, y, z, c) => { c.lerp(MIXC.setHex(C.honey), Math.max(0, y / 0.045) * 0.4); } });
    b.cyl(0.003, 0.0035, 0.025, 5, C.dark, [0, 0.045, 0], [0, 0, 0.2], 1, { smooth: true });
  },
  mushroom(b) {
    b.cyl(0.013, 0.017, 0.06, 7, C.cream, [0, -0.01, 0], [0, 0, 0], 1, { smooth: true });
    b.lathe([[0.0, 0], [0.048, 0.0], [0.044, 0.016], [0.026, 0.034], [0.0, 0.04]], 9, C.glow, [0, 0.018, 0], [0, 0, 0], 1, { shade: (x, y, z, c) => { if (y < 0.022) { c.setHex(0xd8f7ff); c.ao = 0.75; } } });
  },
  mushroom_grilled(b) {
    b.cyl(0.012, 0.016, 0.055, 7, 0xc9a86a, [0, -0.01, 0], [0, 0, 0], 1, { smooth: true });
    b.lathe([[0.0, 0], [0.045, 0.0], [0.041, 0.015], [0.024, 0.031], [0.0, 0.036]], 9, 0x8a5a3a, [0, 0.016, 0], [0, 0, 0], 1, {});
  },
  frostberry(b) {
    b.ico(0.02, 0, C.ice, [0.015, 0, 0], [0, 0, 0], 1, { smooth: true });
    b.ico(0.018, 0, 0xbfeefa, [-0.014, 0.008, 0.01], [0, 0, 0], 1, { smooth: true });
    b.ico(0.017, 0, C.ice, [0, -0.012, -0.014], [0, 0, 0], 1, { smooth: true });
    b.box(0.03, 0.003, 0.018, C.green, [0, 0.022, 0], [0, 0, 0.3]);
  },
  honeycomb(b) {
    b.cyl(0.05, 0.05, 0.03, 6, C.honey, [0, 0, 0], [R90, 0, 0], 1, { shade: (x, y, z, c) => { if (Math.abs(z) > 0.014) c.multiplyScalar(0.85); } });
    b.cyl(0.02, 0.02, 0.032, 6, 0xd99a2b, [0.022, 0, 0], [R90, 0, 0]);
    b.cyl(0.02, 0.02, 0.032, 6, 0xd99a2b, [-0.02, 0.018, 0], [R90, 0, 0]);
  },
  shard(b) { b.oct(0.032, C.gold, [0, 0, 0], [0, 0, 0], [0.7, 1.2, 0.7], { metal: 'gold' }); b.oct(0.012, C.white, [0, 0, 0]); },
  aetherseed(b) { b.ico(0.028, 0, C.cyan, [0, 0, 0], [0, 0, 0], [0.8, 1.2, 0.8]); b.cone(0.012, 0.04, 4, C.white, [0, 0.045, 0]); },
  pearl(b) { b.ico(0.03, 1, C.white, [0, 0, 0], [0, 0, 0], 1, { smooth: true, metal: true }); },
};

let _gemGeo = null;
export const gemGeo = () => _gemGeo || (_gemGeo = new THREE.OctahedronGeometry(1, 0));

export function createModels(ctx) {
  const geos = new Map();
  // matte: wood / leather / cloth / food; metal: polished steel and gold (one look between steel 0.9 / 80 and
  // gold 0.7 / 50, so a held item stays at two draw calls)
  const matte = () => ctx.art.material({ color: 0xffffff, vertexColors: true, flat: false, rim: 0.3, spec: 0.1, gloss: 12 });
  const metal = () => ctx.art.material({ color: 0xffffff, vertexColors: true, flat: false, rim: 0.32, spec: 0.75, gloss: 56 });

  function geometry(id) {
    let g = geos.get(id);
    if (g) return g;
    const fn = BUILD[id];
    const b = new GeoBuilder();
    const gems = [];
    b.gem = (x, y, z, size) => gems.push([x, y, z, size]);
    if (fn) fn(b); else b.ico(0.04, 0, 0xff00ff);
    g = b.build();
    g.userData.gems = gems;
    g.userData.tris = triCount(g);
    geos.set(id, g);
    return g;
  }
  function makeMesh(id) {
    const m = new THREE.Mesh(geometry(id), [matte(), metal()]);
    m.name = 'item-' + id;
    return m;
  }
  return {
    geometry, makeMesh, material: matte, metal,
    /** a standalone model (UI icons, chests, enemies holding things) */
    makeModel(id) {
      const g = new THREE.Group();
      g.name = 'model-' + id;
      g.add(makeMesh(id));
      for (const [x, y, z, sz] of geometry(id).userData.gems || []) {
        const m = new THREE.Mesh(gemGeo(), ctx.art.material({ color: 0x7fe9ff, emissive: 0x1b5866, flat: true, spec: 1.0, gloss: 120, rim: 0.5 }));
        m.position.set(x, y, z); m.scale.setScalar(sz); m.name = 'gem';
        g.add(m);
      }
      return g;
    },
    gemsOf(id) { return geometry(id).userData.gems || []; },
    trianglesOf(id) { return geometry(id).userData.tris; },
  };
}
