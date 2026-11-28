// js/game/telegraph.js — enemy attack warnings (#ff3b5c only, §5.2) built from three readable parts (ART_REVIEW B-P1-4):
//   edge   — a 6 cm outline at 0.95 opacity (blinks to #ff8fa3 at 8 Hz in the last 25 %)
//   fill   — the area at 0.16 → 0.38 (held at 0.12 while you stand inside it)
//   motion — chevrons / arcs flowing at 2.5 m/s in the attack direction
// `high` attacks add a 10 cm vertical band at the threat height (the line you duck under) with a glow at each end.
// One mesh (vertex RGBA, depthTest off) per slot = 1 draw call (+2 glows for `high`). No per-frame allocation. (OPUS-B)
import * as THREE from 'three';

const DANGER = 0xff3b5c, FLASH = 0xff8fa3;
const MAX_V = 3200;            // vertices per slot (non-indexed triangles)
const EDGE = 0.06, CHEV_W = 0.25, FLOW = 2.5, LIFT = 0.12;

export function createTelegraphs(ctx, parent, heightAt, slotsN = 3) {
  const cD = new THREE.Color(DANGER), cF = new THREE.Color(FLASH);
  const art = ctx.art || (ctx.world && ctx.world.art);
  const slots = [];
  for (let i = 0; i < slotsN; i++) {
    const pos = new Float32Array(MAX_V * 3), col = new Float32Array(MAX_V * 4);
    const geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 4);
    pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pa); geo.setAttribute('color', ca);
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false,
      side: THREE.DoubleSide, fog: false, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 50; mesh.visible = false;
    parent.add(mesh);
    const glows = [];
    for (let g = 0; g < 2; g++) {
      let m = null;
      try { if (art && typeof art.glow === 'function') m = art.glow({ color: DANGER, size: 0.25, opacity: 0.95 }); } catch (e) { m = null; }
      if (m) { m.visible = false; m.renderOrder = 51; parent.add(m); }
      glows.push(m);
    }
    slots.push({ mesh, geo, pa, ca, pos, col, glows, owner: null, kind: null, t: 0, dur: 1, n: 0,
      // shape data
      x0: 0, z0: 0, x1: 0, z1: 0, hw: 0.32, L: 1, rows: 0, hRow: new Float32Array(48), ux: 0, uz: 1, nx: -1, nz: 0,
      cx: 0, cz: 0, yaw: 0, arc: 1.7, R: 2, y: 1.3, A: 16, M: 4, hGrid: new Float32Array(17 * 17), r: 0.5 });
  }

  // ── vertex writers ──
  let S = null, n = 0, cr = 0, cg = 0, cb = 0, ca = 0;
  function begin(slot) { S = slot; n = 0; }
  function color(c, a) { cr = c.r; cg = c.g; cb = c.b; ca = a; }
  function v(x, y, z) {
    if (n >= MAX_V) return;
    const p = S.pos, c = S.col, i3 = n * 3, i4 = n * 4;
    p[i3] = x; p[i3 + 1] = y; p[i3 + 2] = z;
    c[i4] = cr; c[i4 + 1] = cg; c[i4 + 2] = cb; c[i4 + 3] = ca;
    n++;
  }
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    if (n + 6 > MAX_V) return;
    v(ax, ay, az); v(bx, by, bz); v(cx, cy, cz);
    v(ax, ay, az); v(cx, cy, cz); v(dx, dy, dz);
  }
  // positions on the current shape (no closures per frame)
  function P(u, w, out) { out[0] = S.x0 + S.ux * u + S.nx * w; out[1] = S.z0 + S.uz * u + S.nz * w; return out; }
  function X(a, r) { return S.cx + Math.sin(a) * r; }
  function Z(a, r) { return S.cz - Math.cos(a) * r; }
  function end() {
    S.n = n;
    S.geo.setDrawRange(0, n);
    S.pa.needsUpdate = true; S.ca.needsUpdate = true;
  }

  // ── show / hide ──
  function show(owner, kind, o) {
    let s = null;
    for (const q of slots) if (q.owner === owner) { s = q; break; }
    if (!s) for (const q of slots) if (!q.owner) { s = q; break; }
    if (!s) return null;
    s.owner = owner; s.kind = kind; s.t = 0; s.dur = Math.max(0.2, o.dur || 1);
    if (kind === 'line') {
      s.x0 = o.x0; s.z0 = o.z0; s.x1 = o.x1; s.z1 = o.z1; s.hw = o.halfWidth ?? 0.32;
      s.L = Math.max(0.5, Math.hypot(s.x1 - s.x0, s.z1 - s.z0));
      s.ux = (s.x1 - s.x0) / s.L; s.uz = (s.z1 - s.z0) / s.L; s.nx = -s.uz; s.nz = s.ux;
      s.rows = Math.min(s.hRow.length, Math.max(2, Math.ceil(s.L / 0.5) + 1));
      for (let i = 0; i < s.rows; i++) {
        const t = i / (s.rows - 1);
        s.hRow[i] = heightAt(s.x0 + (s.x1 - s.x0) * t, s.z0 + (s.z1 - s.z0) * t) + LIFT;
      }
    } else if (kind === 'high') {
      s.cx = o.x; s.cz = o.z; s.yaw = o.yaw || 0; s.y = o.y; s.R = Math.max(1, o.reach || 2.3);
      s.arc = ((o.arc || 100) * Math.PI) / 180;
      s.A = 16; s.M = Math.min(16, Math.max(3, Math.ceil(s.R / 0.75)));
      for (let j = 0; j <= s.M; j++) for (let i = 0; i <= s.A; i++) {
        const a = s.yaw - s.arc / 2 + (s.arc * i) / s.A, r = (s.R * j) / s.M;
        s.hGrid[j * (s.A + 1) + i] = heightAt(s.cx + Math.sin(a) * r, s.cz - Math.cos(a) * r) + LIFT;
      }
    } else {
      s.cx = o.x; s.cz = o.z; s.r = Math.max(0.35, o.radius || 0.5);
      s.A = 24;
      // rings: centre, half, full, and the outer "lock-on" ring range
      for (let j = 0; j <= 3; j++) for (let i = 0; i <= s.A; i++) {
        const a = (i / s.A) * Math.PI * 2, r = s.r * RINGS[j];
        s.hGrid[j * (s.A + 1) + i] = heightAt(s.cx + Math.sin(a) * r, s.cz - Math.cos(a) * r) + LIFT;
      }
    }
    s.mesh.visible = true;
    build(s, 0);
    return s;
  }
  function hide(owner) {
    for (const s of slots) if (s.owner === owner) {
      s.owner = null; s.mesh.visible = false;
      for (const g of s.glows) if (g) g.visible = false;
    }
  }
  function hideAll() { for (const s of slots) { s.owner = null; s.mesh.visible = false; for (const g of s.glows) if (g) g.visible = false; } }

  function tick(dt) {
    for (const s of slots) {
      if (!s.owner) continue;
      s.t += dt;
      build(s, s.t);
    }
  }

  // ── shapes ──
  function inside(s, px, pz) {
    if (s.kind === 'line') {
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0, L2 = dx * dx + dz * dz || 1;
      let t = ((px - s.x0) * dx + (pz - s.z0) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(px - (s.x0 + dx * t), pz - (s.z0 + dz * t)) <= s.hw;
    }
    if (s.kind === 'high') {
      const d = Math.hypot(px - s.cx, pz - s.cz);
      if (d > s.R) return false;
      let a = Math.atan2(px - s.cx, -(pz - s.cz)) - s.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.abs(a) <= s.arc / 2;
    }
    return Math.hypot(px - s.cx, pz - s.cz) <= s.r;
  }

  function build(s, t) {
    const k = Math.min(1, t / s.dur);
    const pl = ctx.player && ctx.player.pos;
    const isIn = pl ? inside(s, pl.x, pl.z) : false;
    const fillA = isIn ? 0.12 : 0.16 + 0.22 * k;
    const blink = k > 0.75 && (Math.floor(t * 16) & 1) === 0;
    const edgeC = blink ? cF : cD;
    begin(s);
    if (s.kind === 'line') buildLine(s, t, fillA, edgeC);
    else if (s.kind === 'high') buildHigh(s, t, fillA, edgeC, pl);
    else buildSphere(s, k, fillA, edgeC);
    end();
  }

  function hAt(s, u) {   // band height at distance u along the line
    const f = Math.max(0, Math.min(s.rows - 1, (u / s.L) * (s.rows - 1)));
    const i = Math.min(s.rows - 2, Math.floor(f)), w = f - i;
    return s.hRow[i] * (1 - w) + s.hRow[i + 1] * w;
  }
  function buildLine(s, t, fillA, edgeC) {
    const a = _a, b = _b, c = _c, d = _d;
    const hw = s.hw, step = s.L / (s.rows - 1);
    // fill
    color(cD, fillA);
    for (let i = 0; i < s.rows - 1; i++) {
      const u0 = i * step, u1 = u0 + step, h0 = s.hRow[i], h1 = s.hRow[i + 1];
      P(u0, hw, a); P(u0, -hw, b); P(u1, -hw, c); P(u1, hw, d);
      quad(a[0], h0, a[1], b[0], h0, b[1], c[0], h1, c[1], d[0], h1, d[1]);
    }
    // chevrons flowing toward the far end
    color(cD, fillA + 0.15);
    const sp = 1.0, ph = (t * FLOW) % sp, wing = hw * 0.8, tipLen = Math.min(0.35, hw);
    for (let u = ph; u + tipLen <= s.L; u += sp) {
      if (u - CHEV_W < 0) continue;
      const tip = u + tipLen, ht = hAt(s, tip), hb = hAt(s, u), hb2 = hAt(s, u - CHEV_W);
      for (const side of SIDES) {
        P(tip, 0, a); P(u, side * wing, b); P(u - CHEV_W, side * wing, c); P(tip - CHEV_W, 0, d);
        quad(a[0], ht, a[1], b[0], hb, b[1], c[0], hb2, c[1], d[0], hb2, d[1]);
      }
    }
    // edge: both long sides and both ends
    color(edgeC, 0.95);
    for (let i = 0; i < s.rows - 1; i++) {
      const u0 = i * step, u1 = u0 + step, h0 = s.hRow[i], h1 = s.hRow[i + 1];
      for (const side of SIDES) {
        P(u0, side * hw, a); P(u0, side * (hw - EDGE), b); P(u1, side * (hw - EDGE), c); P(u1, side * hw, d);
        quad(a[0], h0, a[1], b[0], h0, b[1], c[0], h1, c[1], d[0], h1, d[1]);
      }
    }
    for (const uu of ENDS) {
      const u0 = uu === 0 ? 0 : s.L - EDGE, u1 = u0 + EDGE, h0 = hAt(s, u0), h1 = hAt(s, u1);
      P(u0, hw, a); P(u0, -hw, b); P(u1, -hw, c); P(u1, hw, d);
      quad(a[0], h0, a[1], b[0], h0, b[1], c[0], h1, c[1], d[0], h1, d[1]);
    }
    for (const g of s.glows) if (g) g.visible = false;
  }

  function gridH(s, j, i) { return s.hGrid[j * (s.A + 1) + i]; }
  function ringH(s, r, i) {   // fan ground height at radius r on spoke i
    const f = Math.max(0, Math.min(s.M, (r / s.R) * s.M));
    const j = Math.min(s.M - 1, Math.floor(f)), w = f - j;
    return gridH(s, j, i) * (1 - w) + gridH(s, j + 1, i) * w;
  }
  function buildHigh(s, t, fillA, edgeC, pl) {
    const A = s.A, M = s.M, a0 = s.yaw - s.arc / 2, da = s.arc / A;
    // fill on the ground: the footprint of the swing (a plate at chest height would tint the whole view)
    color(cD, fillA);
    for (let j = 0; j < M; j++) {
      const r0 = (s.R * j) / M, r1 = (s.R * (j + 1)) / M;
      for (let i = 0; i < A; i++) {
        const aa = a0 + da * i, ab = aa + da;
        quad(X(aa, r0), gridH(s, j, i), Z(aa, r0), X(ab, r0), gridH(s, j, i + 1), Z(ab, r0),
          X(ab, r1), gridH(s, j + 1, i + 1), Z(ab, r1), X(aa, r1), gridH(s, j + 1, i), Z(aa, r1));
      }
    }
    // arcs flowing outward
    color(cD, fillA + 0.15);
    const sp = Math.max(1.0, s.R / 7), ph = (t * FLOW) % sp;
    for (let r = ph + 0.3; r + CHEV_W <= s.R; r += sp) {
      const r1 = r + CHEV_W;
      for (let i = 0; i < A; i++) {
        const aa = a0 + da * i, ab = aa + da;
        quad(X(aa, r), ringH(s, r, i), Z(aa, r), X(ab, r), ringH(s, r, i + 1), Z(ab, r),
          X(ab, r1), ringH(s, r1, i + 1), Z(ab, r1), X(aa, r1), ringH(s, r1, i), Z(aa, r1));
      }
    }
    // edge: the two spokes and the outer arc
    color(edgeC, 0.95);
    for (let j = 0; j < M; j++) {
      const r0 = (s.R * j) / M, r1 = (s.R * (j + 1)) / M;
      for (const side of SIDES) {
        const i = side < 0 ? 0 : A, a = side < 0 ? a0 : a0 + s.arc, ain = a - side * Math.min(da, EDGE / Math.max(0.5, r1));
        quad(X(a, r0), gridH(s, j, i), Z(a, r0), X(ain, r0), gridH(s, j, i), Z(ain, r0),
          X(ain, r1), gridH(s, j + 1, i), Z(ain, r1), X(a, r1), gridH(s, j + 1, i), Z(a, r1));
      }
    }
    const rO = s.R, rI = s.R - EDGE;
    for (let i = 0; i < A; i++) {
      const aa = a0 + da * i, ab = aa + da, h0 = gridH(s, M, i), h1 = gridH(s, M, i + 1);
      quad(X(aa, rI), h0, Z(aa, rI), X(ab, rI), h1, Z(ab, rI), X(ab, rO), h1, Z(ab, rO), X(aa, rO), h0, Z(aa, rO));
    }
    // the line you duck under: a 10 cm vertical band at the threat height, on the arc through where you stand
    // 0.8 m in front of you (toward the attacker), or the reach's edge when you are outside
    let rb = s.R;
    if (pl) rb = Math.max(0.6, Math.min(s.R, Math.hypot(pl.x - s.cx, pl.z - s.cz) - 0.8));
    color(edgeC, 0.9);
    const y0 = s.y - 0.05, y1 = s.y + 0.05;
    for (let i = 0; i < A; i++) {
      const aa = a0 + da * i, ab = aa + da;
      quad(X(aa, rb), y0, Z(aa, rb), X(ab, rb), y0, Z(ab, rb), X(ab, rb), y1, Z(ab, rb), X(aa, rb), y1, Z(aa, rb));
    }
    const g0 = s.glows[0], g1 = s.glows[1];
    if (g0) { g0.visible = true; g0.position.set(X(a0, rb), s.y, Z(a0, rb)); }
    if (g1) { g1.visible = true; g1.position.set(X(a0 + s.arc, rb), s.y, Z(a0 + s.arc, rb)); }
  }

  function buildSphere(s, k, fillA, edgeC) {
    const A = s.A;
    const radii = RAD;
    color(cD, fillA);
    for (let j = 0; j < 2; j++) {
      const r0 = s.r * radii[j], r1 = s.r * radii[j + 1];
      for (let i = 0; i < A; i++) {
        const aa = (i / A) * Math.PI * 2, ab = ((i + 1) / A) * Math.PI * 2;
        quad(X(aa, r0), gridH(s, j, i), Z(aa, r0), X(ab, r0), gridH(s, j, i + 1), Z(ab, r0),
          X(ab, r1), gridH(s, j + 1, i + 1), Z(ab, r1), X(aa, r1), gridH(s, j + 1, i), Z(aa, r1));
      }
    }
    // a ring closing in on the landing spot
    const rr = s.r * (1.6 - 0.6 * k);
    color(cD, Math.min(0.9, fillA + 0.3));
    ringStrip(s, rr, rr + 0.05, 2, 3);
    color(edgeC, 0.95);
    ringStrip(s, s.r - EDGE, s.r, 2, 2);
    for (const g of s.glows) if (g) g.visible = false;
  }
  function ringStrip(s, r0, r1, j0, j1) {
    const A = s.A;
    for (let i = 0; i < A; i++) {
      const aa = (i / A) * Math.PI * 2, ab = ((i + 1) / A) * Math.PI * 2;
      const h0 = (gridH(s, j0, i) + gridH(s, j1, i)) / 2, h1 = (gridH(s, j0, i + 1) + gridH(s, j1, i + 1)) / 2;
      quad(X(aa, r0), h0, Z(aa, r0), X(ab, r0), h1, Z(ab, r0), X(ab, r1), h1, Z(ab, r1), X(aa, r1), h0, Z(aa, r1));
    }
  }

  return { show, hide, hideAll, tick, slots };
}

const SIDES = [-1, 1], ENDS = [0, 1], RAD = [0, 0.5, 1], RINGS = [0, 0.5, 1, 1.6];
const _a = [0, 0], _b = [0, 0], _c = [0, 0], _d = [0, 0];
