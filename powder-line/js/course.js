// js/course.js — the courses: the snow surface as an exact height function, and everything on it.
// No three.js here, so the physics tests run in Node.
//
// Coordinates: y is up, the course runs down the -z axis. s = -z is the distance down the course (metres),
// x is across. The course never turns around: it winds left and right (cx(s)) but always heads downhill,
// so the view can stay facing down the slope (the comfortable default in VR).
//
// height(x, z) = base(s)            the long profile: integral of the slope (C1, no kinks)
//              + walls(|x - cx|)    the corridor's banks rising into the forest
//              + features           kickers (a ramp with a sharp lip), islands that split the run in two,
//                                   rollers and moguls
export const G = 9.81;
const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (t) => t * t * (3 - 2 * t);
// smoothstep(e0, e1, x): 0 at e0, 1 at e1 (e0 > e1 works too: a falling edge)
export const smoothstep = (e0, e1, x) => smooth01(clamp((x - e0) / (e1 - e0), 0, 1));

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = smooth01(fx), v = smooth01(fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

// piecewise curves through keyframes [[s, value], ...]
function linearKeys(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (s <= keys[i][0]) { const [s0, v0] = keys[i - 1], [s1, v1] = keys[i]; return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0); }
  }
  return keys[keys.length - 1][1];
}
function smoothKeys(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (s <= keys[i][0]) { const [s0, v0] = keys[i - 1], [s1, v1] = keys[i]; return v0 + (v1 - v0) * smooth01((s - s0) / (s1 - s0)); }
  }
  return keys[keys.length - 1][1];
}

const WALL_FLAT = 6; // the last 6 m of the half width curve up into the bank
function wall(e) {
  if (e <= 0) return 0;
  if (e <= 6) return 0.07 * e * e; // 40° at the corridor's edge
  if (e <= 14) { const d = e - 6; return 2.52 + 0.84 * d - 0.025 * d * d; }
  return 7.64 + 0.44 * (e - 14);
}

export const STEP = 0.5; // base profile table resolution (m)

export class Course {
  constructor(spec) {
    Object.assign(this, { id: spec.id, name: spec.name, en: spec.en, level: spec.level, sub: spec.sub, theme: spec.theme, par: spec.par, ranks: spec.ranks });
    this.spec = spec;
    this.length = spec.length;
    this.sMin = -60;
    this.sMax = spec.length + 220;
    this.slopeKeys = spec.slope;
    this.slopeMods = [];
    this.cxKeys = spec.cx || [[0, 0]];
    this.hwKeys = spec.hw || [[0, 18]];
    this.kickers = [];
    this.islands = [];
    this.rollers = [];
    this.moguls = [];
    this.crystals = [];
    this.rings = [];
    this.obstacles = [];
    this.logs = [];
    this.signs = [];
    this.flags = [];
    this.arches = [];
    this.lanterns = [];
    this.icewalls = [];
    this.fb = Array.from({ length: Math.ceil((this.sMax - this.sMin) / 10) + 1 }, () => []);
    this.featureList = [];
    // features first (they change the slope), then the profile table, then what sits on the snow
    spec.build(this, BuildHelpers(this));
    this.buildProfile();
    for (const fn of this.after) fn();
    this.scatterTrees(spec.seed || 1);
    this.index();
  }

  // ---- the long profile ----
  slopeDeg(s) {
    let d = linearKeys(this.slopeKeys, s);
    for (const m of this.slopeMods) {
      if (s < m.s0 || s > m.s1) continue;
      const k = clamp(Math.min(1, (s - m.s0) / m.r0, (m.s1 - s) / m.r1), 0, 1);
      d = m.set !== undefined ? d + (m.set - d) * k : d + m.add * k;
    }
    return d;
  }
  buildProfile() {
    const n = Math.ceil((this.sMax - this.sMin) / STEP) + 1;
    this.nb = n;
    this.tb = new Float64Array(n); // base height
    this.tg = new Float64Array(n); // d(base)/ds
    let b = 0;
    let g0 = -Math.tan(this.slopeDeg(this.sMin) * DEG);
    for (let i = 0; i < n; i++) {
      const s = this.sMin + i * STEP;
      const g = -Math.tan(this.slopeDeg(s) * DEG);
      if (i > 0) b += (g0 + g) * 0.5 * STEP;
      this.tb[i] = b; this.tg[i] = g; g0 = g;
    }
    this.after = this.after || [];
    // the start gate (s = 0) is at height 0
    const i0 = Math.round((0 - this.sMin) / STEP);
    const off = this.tb[i0];
    for (let i = 0; i < n; i++) this.tb[i] -= off;
  }
  // cubic Hermite through the table: continuous height and slope
  base(s) {
    let u = (s - this.sMin) / STEP;
    if (u <= 0) return this.tb[0] + this.tg[0] * (s - this.sMin);
    if (u >= this.nb - 1) return this.tb[this.nb - 1] + this.tg[this.nb - 1] * (s - (this.sMin + (this.nb - 1) * STEP));
    const i = Math.floor(u), t = u - i;
    const p0 = this.tb[i], p1 = this.tb[i + 1], m0 = this.tg[i] * STEP, m1 = this.tg[i + 1] * STEP;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
  }
  cx(s) { return smoothKeys(this.cxKeys, s); }
  hw(s) { return smoothKeys(this.hwKeys, s); }

  // ---- the surface ----
  height(x, z) { return this.heightS(x, -z); }
  heightS(x, s) {
    const c = this.cx(s), w = this.hw(s);
    const dx = x - c, ad = Math.abs(dx);
    let h = this.base(s);
    const e = ad - (w - WALL_FLAT);
    if (e > 0) {
      h += wall(e);
      if (e > 10) h += noise2(x * 0.02, s * 0.02) * 6 * smoothstep(10, 40, e) + noise2(x * 0.08, s * 0.08) * 1.0 * smoothstep(10, 20, e);
    }
    const bucket = this.fb[Math.floor((s - this.sMin) / 10)];
    if (bucket) for (const f of bucket) h += f.fn(x, s, dx, ad, w);
    return h;
  }
  // surface normal at (x, z). Downhill along s uses the uphill-side difference so a kicker's lip never
  // tilts the normal of the ramp you are still riding.
  normal(x, z, out = { x: 0, y: 1, z: 0 }) {
    const s = -z, e = 0.12;
    const hx = (this.heightS(x + e, s) - this.heightS(x - e, s)) / (2 * e);
    const h0 = this.heightS(x, s);
    const hs = (h0 - this.heightS(x, s - e)) / e; // dh/ds
    const hz = -hs; // dh/dz
    const l = Math.hypot(hx, 1, hz);
    out.x = -hx / l; out.y = 1 / l; out.z = -hz / l;
    return out;
  }
  // how much the features (not the bank) lift the snow here — used to keep respawns off the island mounds
  featureLift(x, s) {
    let h = 0;
    const bucket = this.fb[Math.floor((s - this.sMin) / 10)];
    const dx = x - this.cx(s);
    if (bucket) for (const f of bucket) if (f.kind === 'island') h += f.fn(x, s, dx, Math.abs(dx), this.hw(s));
    return h;
  }

  // bucket features and obstacles by s for fast lookups
  index() {
    const nb = Math.ceil((this.sMax - this.sMin) / 10) + 1;
    const ob = Array.from({ length: nb }, () => []);
    for (const o of this.obstacles) {
      const i0 = Math.floor((o.s - o.r - 1 - this.sMin) / 10), i1 = Math.floor((o.s + o.r + 1 - this.sMin) / 10);
      for (let i = Math.max(0, i0); i <= Math.min(nb - 1, i1); i++) ob[i].push(o);
    }
    this.ob = ob;
  }
  obstaclesNear(s) { return this.ob[Math.floor((s - this.sMin) / 10)] || []; }
  addFeature(f) {
    this.featureList.push(f);
    const nb = this.fb.length;
    const i0 = Math.floor((f.s0 - this.sMin) / 10), i1 = Math.floor((f.s1 - this.sMin) / 10);
    for (let i = Math.max(0, i0); i <= Math.min(nb - 1, i1); i++) this.fb[i].push(f);
  }

  // trees in the forest on both sides and on the islands (seeded, so the same every time)
  scatterTrees(seed) {
    const r = rng(seed * 7919 + 13);
    const dens = this.theme.trees ?? 1;
    const trees = [];
    for (let s = this.sMin + 5; s < this.sMax - 5; s += 2.2 / dens) {
      for (const side of [-1, 1]) {
        const k = 1 + Math.floor(r() * 2.2);
        for (let j = 0; j < k; j++) {
          const e = 5.5 + Math.pow(r(), 1.7) * 75;
          const w = this.hw(s);
          const x = this.cx(s) + side * (w - WALL_FLAT + e);
          const ss = s + (r() - 0.5) * 2;
          if (this.nearSomething(x, ss, 3)) continue;
          trees.push({ kind: 'tree', x, s: ss, r: 0.75, h: 5 + r() * 5, scale: 0.75 + r() * 0.7, collide: e < 16 });
        }
      }
    }
    for (const isl of this.islands) {
      for (let s = isl.s0 + 8; s < isl.s1 - 8; s += 4.5) {
        const wi = isl.widthAt(s) - 1.5;
        if (wi < 1) continue;
        for (let o = -wi; o <= wi; o += 3.2) {
          const x = this.cx(s) + isl.ox + o + (r() - 0.5) * 1.2;
          trees.push({ kind: 'tree', x, s: s + (r() - 0.5) * 2, r: 0.75, h: 5 + r() * 4, scale: 0.8 + r() * 0.5, collide: true });
        }
      }
    }
    for (const t of trees) if (t.collide) this.obstacles.push(t); else (this.decorTrees = this.decorTrees || []).push(t);
    this.trees = trees;
  }
  nearSomething(x, s, d) {
    for (const o of this.signs) if (Math.abs(o.s - s) < d + 2 && Math.abs(o.x - x) < d + 2) return true;
    return false;
  }

  // a spot to put a rider back after a fall: on the snow of the corridor, off the islands, away from trees
  safeSpot(x, s) {
    const c = this.cx(s), w = this.hw(s);
    let best = null;
    for (const o of [0, 2, -2, 4, -4, 6, -6, 9, -9, 12, -12, 15, -15, 18, -18]) {
      const xx = clamp(x + o, c - w + WALL_FLAT + 1, c + w - WALL_FLAT - 1);
      if (this.featureLift(xx, s) > 0.2) continue;
      let blocked = false;
      // nothing right here, and nothing straight ahead for the next 18 m
      for (const ob of this.obstaclesNear(s).concat(this.obstaclesNear(s + 10), this.obstaclesNear(s + 18))) {
        if (Math.hypot(ob.x - xx, ob.s - s) < ob.r + 2) blocked = true;
        if (ob.s > s && ob.s < s + 18 && Math.abs(ob.x - xx) < ob.r + 1.6) blocked = true;
      }
      for (const l of this.logs) if (Math.abs(l.s - s) < 3 && xx > l.x0 - 1 && xx < l.x1 + 1) blocked = true;
      if (!blocked) { best = xx; break; }
    }
    return best ?? c;
  }
}

// helpers the course specs use to put things on the snow
function BuildHelpers(C) {
  C.after = [];
  const H = {
    // a kicker: a curved ramp that ends in a sharp lip at s; the slope after it steepens into a landing
    kicker(s, ox = 0, { len = 7, h = 1.4, w = 6, land = 4, landLen = 24, arc = 16, crystals = 'blue', n = 5 } = {}) {
      const k = { s, ox, len, h, w };
      C.kickers.push(k);
      C.addFeature({
        kind: 'kicker', s0: s - len - 1, s1: s + 0.5, k,
        fn: (x, ss, dx) => {
          const t = (ss - (s - len)) / len;
          if (t < 0 || t > 1) return 0;
          const lat = smoothstep(w / 2 + 1.3, w / 2, Math.abs(dx - ox));
          return lat ? h * t * t * lat : 0;
        },
      });
      if (land) C.slopeMods.push({ s0: s - 0.2, s1: s + landLen, r0: 1.2, r1: 8, add: land });
      C.flags.push({ x: ox - w / 2 - 0.8, s: s - 0.5, kick: k }, { x: ox + w / 2 + 0.8, s: s - 0.5, kick: k });
      if (crystals) C.after.push(() => H.arc(k, arc, crystals, n));
      return k;
    },
    // a ledge: the lane rises gently for len metres and ends in a cliff of height h (no upward kick)
    ledge(s, ox = 0, { len = 45, h = 2.8, w = 10, land = 6, landLen = 26, arc = 17, crystals = 'gold', n = 5 } = {}) {
      const k = { s, ox, len, h, w, ledge: true };
      C.kickers.push(k);
      C.addFeature({
        kind: 'ledge', s0: s - len - 1, s1: s + 0.5, k,
        fn: (x, ss, dx) => {
          const t = (ss - (s - len)) / len;
          if (t < 0 || t > 1) return 0;
          const lat = smoothstep(w / 2 + 3, w / 2, Math.abs(dx - ox));
          return lat ? h * smooth01(t) * lat : 0;
        },
      });
      if (land) C.slopeMods.push({ s0: s - 0.2, s1: s + landLen, r0: 1.2, r1: 8, add: land });
      C.flags.push({ x: ox - w / 2 - 0.8, s: s - 0.5, kick: k }, { x: ox + w / 2 + 0.8, s: s - 0.5, kick: k });
      C.signs.push({ s: s - len - 12, x: ox, kind: 'warn', text: '! ドロップ' });
      if (crystals) C.after.push(() => H.arc(k, arc, crystals, n));
      return k;
    },
    // crystals along the flight path off a kicker at an expected take-off speed (ride it well to collect them);
    // the last one is the special kind
    arc(k, speed, kind = 'blue', n = 5) {
      const dbase = (C.base(k.s) - C.base(k.s - 0.1)) / 0.1;
      const dyds = dbase + (k.ledge ? 0 : (2 * k.h) / k.len);
      const a = Math.atan(dyds);
      const vs = speed * Math.cos(a), vy = speed * Math.sin(a) + 2.6; // with an ollie at the lip
      const x = C.cx(k.s) + k.ox, y0 = C.base(k.s) + k.h + 1.0;
      let placed = 0;
      for (let t = 0.12; t < 4 && placed < n; t += 0.04) {
        const s = k.s + vs * t, y = y0 + vy * t - 0.5 * G * t * t;
        const ground = C.heightS(x, s);
        if (y < ground + 1.3) break;
        if (t >= 0.12 + placed * 0.22) {
          C.crystals.push({ kind: placed === n - 1 ? kind : 'blue', x, s, y: y - ground, air: true });
          placed++;
        }
      }
    },
    // an island of trees on a mound that splits the run into two lanes between s0 and s1
    island(s0, s1, ox = 0, w = 8, h = 3.2) {
      const isl = { s0, s1, ox, w, h, widthAt: (s) => { const t = (s - s0) / (s1 - s0); return t <= 0 || t >= 1 ? 0 : w * Math.sqrt(Math.sin(Math.PI * t)); } };
      C.islands.push(isl);
      C.addFeature({
        kind: 'island', s0, s1,
        fn: (x, s, dx) => {
          const t = (s - s0) / (s1 - s0);
          if (t <= 0 || t >= 1) return 0;
          const wi = isl.widthAt(s);
          const fade = smooth01(clamp(Math.min(t, 1 - t) * 7, 0, 1));
          return h * fade * smoothstep(wi + 4.5, wi - 0.5, Math.abs(dx - ox));
        },
      });
      // a rock at the nose so the split is visible from afar
      C.after.push(() => C.obstacles.push({ kind: 'rock', x: C.cx(s0 + 6) + ox, s: s0 + 6, r: 1.6, h: 1.8, scale: 1.6 }));
      C.signs.push({ s: s0 - 18, x: ox, kind: 'fork', text: '◀ 分かれ道 ▶' });
      return isl;
    },
    rollers(s0, s1, amp = 0.35, wl = 16) {
      C.rollers.push({ s0, s1, amp, wl });
      C.addFeature({
        kind: 'rollers', s0, s1,
        fn: (x, s, dx, ad, w) => {
          if (s < s0 || s > s1) return 0;
          const env = smoothstep(s0, s0 + wl, s) * smoothstep(s1, s1 - wl, s);
          return amp * env * Math.sin((2 * Math.PI * (s - s0)) / wl) * smoothstep(w - 4, w - 9, ad);
        },
      });
    },
    moguls(s0, s1, amp = 0.45, wl = 7) {
      C.moguls.push({ s0, s1, amp, wl });
      C.addFeature({
        kind: 'moguls', s0, s1,
        fn: (x, s, dx, ad, w) => {
          if (s < s0 || s > s1) return 0;
          const env = smoothstep(s0, s0 + wl, s) * smoothstep(s1, s1 - wl, s);
          return amp * env * Math.sin((2 * Math.PI * s) / wl) * Math.cos((2 * Math.PI * dx) / (wl * 0.9) + s * 0.21) * smoothstep(w - 4, w - 9, ad);
        },
      });
    },
    // a cliff: the slope tips over for a few metres (a drop you fly off)
    drop(s, deg = 48, len = 5, after = 24, afterLen = 26) {
      C.slopeMods.push({ s0: s, s1: s + len, r0: 0.6, r1: 1.5, set: deg });
      if (after) C.slopeMods.push({ s0: s + len - 1.5, s1: s + len + afterLen, r0: 1.5, r1: 8, set: after });
      C.signs.push({ s: s - 25, x: 0, kind: 'warn', text: '! ドロップ' });
    },
    // a line of crystals: x as a function of s (relative to the course centre)
    line(s0, s1, step, xf, kind = 'blue', y = 1.1) {
      for (let s = s0; s <= s1 + 1e-6; s += step) C.crystals.push({ kind: typeof kind === 'function' ? kind(s) : kind, x: () => C.cx(s) + xf(s), s, y });
    },
    ring(s, ox = 0, y = 1.5, r = 1.9) { C.rings.push({ s, ox, y, r }); },
    tree(s, ox, sc = 1) { C.after.push(() => C.obstacles.push({ kind: 'tree', x: C.cx(s) + ox, s, r: 0.75, h: 6, scale: sc, collide: true })); },
    rock(s, ox, r = 1.2) { C.after.push(() => C.obstacles.push({ kind: 'rock', x: C.cx(s) + ox, s, r, h: r * 1.1, scale: r })); },
    ice(s, ox, r = 0.9) { C.after.push(() => C.obstacles.push({ kind: 'ice', x: C.cx(s) + ox, s, r, h: 4.5 + r * 2, scale: r })); },
    log(s, ox0, ox1) { C.logs.push({ s, ox0, ox1, h: 0.42 }); },
    sign(s, side, key, text) { C.signs.push({ s, x: side, kind: 'lesson', key, text }); },
    arch(s, kind = 'ice') { C.arches.push({ s, kind }); },
    lanterns(s0, s1, step = 24) { for (let s = s0; s <= s1; s += step) C.lanterns.push({ s }); },
    icewall(s0, s1, side) { C.icewalls.push({ s0, s1, side }); },
  };
  // logs and lines are relative to the centre until the profile exists
  C.after.push(() => {
    for (const l of C.logs) { const c = C.cx(l.s); l.x0 = c + l.ox0; l.x1 = c + l.ox1; }
    for (const cr of C.crystals) if (typeof cr.x === 'function') cr.x = cr.x();
    for (const r of C.rings) r.x = C.cx(r.s) + r.ox;
    for (const sg of C.signs) sg.x = C.cx(sg.s) + (sg.x === 'L' ? -(C.hw(sg.s) - 4) : sg.x === 'R' ? C.hw(sg.s) - 4 : sg.x);
    for (const f of C.flags) f.x = C.cx(f.s) + f.x;
  });
  return H;
}
