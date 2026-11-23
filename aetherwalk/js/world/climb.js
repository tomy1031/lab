// js/world/climb.js — 世界担当（FABLE の代行）
// 登り面（DESIGN_V2 §2・§5.2）：つた壁と風の楔。見た目・足場（休み棚・上）・当たり（矢が刺さる）と、手で掴めるかの問い合わせ。
// 1 か所 = 1 メッシュ（1 ドローコール）、80 m より遠い面は描かない。掴めるものは水色に光る（§7.1 の「良いもの」）。
import * as THREE from 'three';
import { part, merge, G } from './geo.js';
import { structMaterial, stoneMaterial, strataColor, toWorld } from './landmarks/common.js';
import { CLIMBS } from './layout.js';

const VIEW_R = 80, GRAB_R = 0.25;
const DEG = Math.PI / 180;

// ── 風穴のアーチの形（landmarks/ruins.js の buildArch と同じ式）：ローカル x での背の高さ（z ≈ 0） ──
const ARCH_R = 19.8, ARCH_H = 26.2;
export function archTopY(lx) {
  let best = -1e9, bd = 1e9;
  for (let k = 0; k <= 400; k++) {
    const a = Math.PI * (0.02 + k / 400 * 0.98);
    const cx = -Math.cos(a) * ARCH_R, cy = Math.sin(a) * ARCH_H - 3.0;
    const tx = Math.sin(a) * ARCH_R, ty = Math.cos(a) * ARCH_H, tl = Math.hypot(tx, ty);
    const leg = Math.abs(Math.cos(a)), rb = 2.1 + 3.4 * leg * leg;
    const ox = cx - ty / tl * rb, oy = cy + tx / tl * rb;      // 外向きの法線（上の面）
    const d = Math.abs(ox - lx);
    if (d < bd) { bd = d; best = oy; }
  }
  if (Math.abs(lx - 0.5) < 4.8) best = Math.max(best, 25.95 - 0.35 * Math.abs(lx - 0.5) / 4.8);   // 背の岩の層
  return best;
}

// 面の座標：u は登る人の右手の向き（外向き n を見る人の右）、v は y0 からの高さ
function frame(s) {
  const yr = s.yaw * DEG;
  s.n = { x: Math.sin(yr), z: -Math.cos(yr) };
  s.r = { x: -Math.cos(yr), z: -Math.sin(yr) };
  return s;
}
const at = (s, u, v, d, out = new THREE.Vector3()) => out.set(s.x + s.r.x * u + s.n.x * d, s.y0 + v, s.z + s.r.z * u + s.n.z * d);

// 面の定義を確定する（spawns.js も使う）
export function buildClimbSurfaces(hf, landmarks) {
  const list = [];
  for (const c of CLIMBS) {
    const s = { id: c.id, kind: c.kind, width: c.width, region: c.region, pegs: [], ledges: [] };
    if (c.on === 'great_arch') {
      const def = landmarks.great_arch, a = def.yaw * DEG;
      const p = toWorld(def, c.lx, 0, c.lz);
      s.x = p.x; s.z = p.z; s.yaw = (def.yaw + 360) % 360;       // −z 面＝アーチと同じ向き
      s.y0 = hf.heightAt(p.x, p.z) + 0.05;
      s.y1 = def.y + archTopY(c.lx) - 0.25;
      s.arch = { def, lx: c.lx, lz: c.lz, a };
    } else {
      s.x = c.x; s.z = c.z; s.yaw = c.yaw;
      s.y0 = c.y0 ?? hf.heightAt(c.x + Math.sin(c.yaw * DEG) * 0.6, c.z - Math.cos(c.yaw * DEG) * 0.6);
      s.y1 = c.y1 ?? s.y0 + c.height;
    }
    frame(s);
    const H = s.y1 - s.y0;
    for (const v of c.ledges || []) s.ledges.push({ v, depth: 0.9 });
    if (s.kind === 'pegs') {
      // 楔：左右 2 列を互い違いに 0.58 m おき。最後の段は上端の縁（乗り越えの握り）
      let i = 0;
      for (let v = 0.95; v < H - 0.5; v += 0.58, i++) {
        if (s.ledges.some((l) => Math.abs(l.v - v) < 0.3)) continue;
        s.pegs.push({ u: (i % 2 ? 0.34 : -0.34) + Math.sin(i * 2.3) * 0.05, v: +v.toFixed(2) });
      }
      for (const u of [-0.55, 0, 0.55]) s.pegs.push({ u, v: +(H - 0.12).toFixed(2) });
    }
    // 上に出る場所：面から 1.6 m 奥、上の足場の上
    const back = s.kind === 'pegs' ? 2.2 : 1.8;
    s.topExit = { x: s.x - s.n.x * back, y: s.y1 + (s.kind === 'pegs' ? 0.25 : 0), z: s.z - s.n.z * back };
    if (s.arch) {
      const t = toWorld(s.arch.def, s.arch.lx, 0, -3.2);
      s.topExit = { x: t.x, y: s.y1 + 0.25, z: t.z };
    }
    list.push(s);
  }
  return list;
}

export function createClimb(env, sp) {
  const group = new THREE.Group();
  group.name = 'aw-climb';
  const { hf, col } = env;
  const surfaces = sp.climbs || buildClimbSurfaces(hf, sp.landmarks);
  const byId = {};
  const sites = [];
  const V = new THREE.Vector3(), W2 = new THREE.Vector3();

  for (const s of surfaces) {
    byId[s.id] = s;
    const H = s.y1 - s.y0;
    // ── 足場：休み棚と、上 ──
    for (const l of s.ledges) for (const u of [-0.85, 0, 0.85]) {
      at(s, u, l.v, l.depth * 0.5, V);
      col.addPlatform({ x: V.x, z: V.z, r: 0.62, y: V.y, surface: 'rock' });
    }
    // ── 当たり：面の奥に並べた円柱（矢が刺さる 'structure'。歩いて壁にめりこまない）──
    for (let u = -s.width / 2 + 0.8; u <= s.width / 2 - 0.8 + 1e-3; u += 1.5) {
      at(s, u, 0, -1.0, V);
      col.addCollider({ x: V.x, z: V.z, r: 1.0, y0: s.y0 - 1, y1: s.y1 - 0.3, kind: 'structure' });
    }
    // ── 見た目 ──
    const mesh = s.kind === 'vine' ? buildVineWall(env, s, H) : buildPegRoute(env, s, H);
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    group.add(mesh);
    sites.push({ s, mesh });
    // 下の 3 つの握りと休み棚：水色のかすかな光（世界の glows で 1 回の描画にまとまる）
    const marks = s.kind === 'pegs' ? s.pegs.slice(0, 3).map((p) => [p.u, p.v]) : [[-1.6, 1.0], [0.4, 1.4], [2.2, 0.9]];
    for (const [u, v] of marks) { at(s, u, v, 0.16, V); env.fx.glows.add({ x: V.x, y: V.y, z: V.z, size: 0.22, color: 0x7fe9ff, intensity: 0.3 }); }
  }
  // つた壁の上：面から奥 5 m を平らな足場に（崖の縁のくぼみを歩けるように）
  for (const s of surfaces) {
    if (s.kind !== 'vine') continue;
    if (Math.abs(Math.sin(s.yaw * DEG * 2)) < 1e-3) {
      // 東西南北を向く壁：1 枚の長方形
      const a = at(s, -s.width / 2, 0, 0, new THREE.Vector3()), b = at(s, s.width / 2, 0, -4.8, new THREE.Vector3());
      col.addPlatform({ x0: a.x, x1: b.x, z0: a.z, z1: b.z, y: s.y1, surface: 'rock' });
    } else for (let d = -0.6; d >= -4.6; d -= 1.3) for (let u = -s.width / 2 + 0.6; u <= s.width / 2 - 0.6 + 1e-3; u += 1.3) {
      at(s, u, 0, d, V);
      col.addPlatform({ x: V.x, z: V.z, r: 0.95, y: s.y1, surface: 'rock' });
    }
  }
  // アーチの背を歩けるように：背の上に円の足場を並べる（外の斜面から頂まで）
  const arch = surfaces.find((s) => s.arch);
  if (arch) {
    const def = arch.arch.def;
    // 0.8 m おき（段差 0.5 m 以下）。足場の上がりは 0.6 m まで
    for (let lx = arch.arch.lx - 0.4; lx >= -9; lx -= 0.8) {
      const y = def.y + archTopY(lx);
      for (const lz of lx > 9 ? [-2.4, -0.9] : [-1.0, 1.0]) {
        const p = toWorld(def, lx, 0, lz);
        col.addPlatform({ x: p.x, z: p.z, r: 1.15, y: y + 0.02, surface: 'rock' });
      }
    }
    // 柱の上（楔の終わり）から背へ
    const p = toWorld(def, arch.arch.lx, 0, -3.4);
    col.addPlatform({ x: p.x, z: p.z, r: 2.1, y: arch.y1 + 0.25, surface: 'rock' });
  }

  function update(view) {
    for (const st of sites) {
      const d = Math.hypot(st.s.x - view.cam.x, st.s.z - view.cam.z);
      st.mesh.visible = d < VIEW_R + st.s.width;
    }
  }

  // ── 問い合わせ ──
  const tmp = { x: 0, y: 0, z: 0 };
  function local(s, p, o) {
    const dx = p.x - s.x, dz = p.z - s.z;
    o.d = dx * s.n.x + dz * s.n.z; o.u = dx * s.r.x + dz * s.r.z; o.v = p.y - s.y0;
    return o;
  }
  const L = { d: 0, u: 0, v: 0 };
  const setP = (o, x, y, z) => { if (o.set) o.set(x, y, z); else { o.x = x; o.y = y; o.z = z; } };
  function grabAt(h, out = {}) {
    if (!h) return false;
    let best = null, bd = 1e9, bu = 0, bv = 0;
    for (const s of surfaces) {
      if (Math.abs(h.x - s.x) > s.width + 3 || Math.abs(h.z - s.z) > s.width + 3) continue;
      local(s, h, L);
      const H = s.y1 - s.y0;
      if (L.v < -0.3 || L.v > H + 0.45 || Math.abs(L.u) > s.width / 2 + 0.3) continue;
      if (s.kind === 'vine') {
        // つた：面のどこでも（面の手前 0.25 m まで、少しめりこんでもよい）
        if (L.d > GRAB_R + 0.12 || L.d < -0.15 || Math.abs(L.u) > s.width / 2 || L.v > H + 0.1) continue;
        const dd = Math.abs(L.d - 0.12);
        if (dd < bd) { bd = dd; best = s; bu = L.u; bv = Math.min(H, Math.max(0, L.v)); }
      } else {
        // 楔・横木：いちばん近いものが 0.25 m 以内
        for (const p of s.pegs) {
          const du = L.u - p.u, dv = L.v - p.v, dd = L.d - 0.12, dist = Math.sqrt(du * du + dv * dv + dd * dd);
          if (dist <= GRAB_R && dist < bd) { bd = dist; best = s; bu = p.u; bv = p.v; }
        }
      }
    }
    if (!best) return false;
    out.id = best.id;
    if (!out.point) out.point = new THREE.Vector3();
    if (!out.normal) out.normal = new THREE.Vector3();
    at(best, bu, bv, 0.12, W2);
    setP(out.point, W2.x, W2.y, W2.z);
    setP(out.normal, best.n.x, 0, best.n.z);
    out.u = bu; out.v = bv; out.surface = best;
    return true;
  }
  function near(x, z, r, out = []) {
    out.length = 0;
    for (const s of surfaces) {
      tmp.x = x; tmp.y = s.y0; tmp.z = z;
      local(s, tmp, L);
      const du = Math.max(0, Math.abs(L.u) - s.width / 2), dist = Math.hypot(du, Math.max(0, L.d));
      if (dist <= r) out.push(s);
    }
    return out;
  }
  const api = { list: surfaces, byId, grabAt, near };
  return { group, update, api };
}

// 休み棚：上は平ら、下は壁へすぼまる。白っぽい砂岩
function ledgeGeo(l, w) {
  const g = new THREE.BoxGeometry(w, 0.7, l.depth + 0.25, 3, 1, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) p.setXYZ(i, x * 0.8, y, z < 0 ? z : z - (l.depth + 0.1));       // 下の前の辺を壁へ引く
    if (Math.abs(x) > w * 0.45) p.setY(i, p.getY(i) - 0.08 * Math.sign(y + 1));
  }
  g.computeVertexNormals();
  return part(g, { pos: [0, l.v - 0.35, (l.depth + 0.25) / 2 - 0.25], color: (q, n) => { const k = 0.82 + 0.18 * Math.max(0, n.y) + 0.05 * Math.sin(q.x * 5); return [0.72 * k, 0.6 * k, 0.45 * k]; }, jitter: 0.03 });
}

// ── つた壁：岩の面（地層の色）＋太いつた（ゆれる）＋葉＋節の水色の花＋休み棚 ──
function buildVineWall(env, s, H) {
  const rng = env.fork('climb-' + s.id);
  const P = [];
  const W = s.width;
  const strata = strataColor(0);
  // 面の座標で部品を作り、最後に世界へ置く（u → −x' … ここではローカル x = u、y = v、z = d）
  // 岩の面：細かく分けて凹凸をつけた板と、上の縁、左右のふくらみ
  const face = new THREE.PlaneGeometry(W + 2.4, H + 3.2, 14, 18);
  const fp = face.getAttribute('position');
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), y = fp.getY(i);
    const bump = 0.12 * Math.sin(x * 1.7 + y * 0.6) * Math.sin(y * 1.3 - x * 0.4) + 0.06 * Math.sin(x * 4.1 + y * 3.3);
    const edge = Math.max(0, Math.abs(x) - W / 2) * 0.35;
    fp.setZ(i, -0.16 + bump - edge);
  }
  face.computeVertexNormals();
  P.push(part(face, { pos: [0, (H + 3.2) / 2 - 3.0, 0], color: (p, n) => { const c = strata({ x: p.x, y: p.y + s.y0, z: p.z }, n); const k = 0.82 + 0.1 * Math.sin(p.x * 2.3 + p.y * 1.1); return [c[0] * k, c[1] * k, c[2] * k]; } }));
  // 上の縁（段丘の乾いた土の色）と左右の岩のふくらみ
  P.push(part(G.box(W + 2.6, 0.7, 3.0), { pos: [0, H - 0.35, -1.4], color: 0xb8865a, jitter: 0.06 }));
  for (const sx of [-1, 1]) P.push(part(G.dodeca(1.0), { pos: [sx * (W / 2 + 1.6), H * 0.45, -1.2], scale: [1.8, H * 0.55, 1.8], color: strata, jitter: 0.25 }));
  // 休み棚：白っぽい岩の棚（下は壁へすぼまるくさび形）
  for (const l of s.ledges) P.push(ledgeGeo(l, 3.4));
  // つた：太い茎が面をのぼり、枝を出す。葉は面を向いてゆれる。節には水色の花（光る＝掴める）
  const stems = 11;
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.5, 0.45, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -0.5, 0.45, 0]), 3));
  leafGeo.computeVertexNormals();
  const flower = new THREE.CircleGeometry(1, 5);
  const VV = (x, y, z) => new THREE.Vector3(x, y, z);
  const addLeaf = (x, y, ang, size, t) => {
    const g = 0.55 + 0.45 * rng.next();
    P.push(part(leafGeo, { pos: [x, y, 0.16 + rng.range(0, 0.06)], rot: [rng.range(-0.5, -0.2), rng.range(-0.3, 0.3), ang], scale: size,
      color: [0.06 * g + 0.02 * t, (0.2 + 0.18 * t) * g, 0.05 * g], sway: 0.6 }));
  };
  for (let k = 0; k < stems; k++) {
    const u0 = -W / 2 + 0.5 + (k + rng.range(0.1, 0.9)) * ((W - 1) / stems), ph = rng.range(0, 6.28), amp = rng.range(0.25, 0.6);
    const pts = [], rad = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const v = -0.3 + (H + 0.4) * i / n;
      pts.push(VV(u0 + Math.sin(v * 0.55 + ph) * amp, v, 0.1 + 0.03 * Math.sin(v * 1.3 + k)));
      rad.push(0.055 * (1 - 0.45 * i / n));
    }
    // 茎は細い管（半径は一定。根もとの太さは 2 本重ねて出す）
    P.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.06, 4, false), { color: 0x4f3d24, sway: 0.15 }));
    // 枝と葉
    for (let i = 1; i < n; i++) {
      const p = pts[i], t = i / n;
      if (rng.next() < 0.55) {
        const dir = rng.next() < 0.5 ? -1 : 1, len = rng.range(0.5, 1.2);
        const b = [VV(p.x, p.y, p.z), VV(p.x + dir * len * 0.5, p.y + len * 0.35, 0.13), VV(p.x + dir * len, p.y + len * 0.55, 0.12)];
        P.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(b), 4, 0.022, 3, false), { color: 0x5a4a2a, sway: 0.3 }));
        addLeaf(b[2].x, b[2].y, dir * 0.8 + rng.range(-0.4, 0.4), rng.range(0.25, 0.38), t);
        addLeaf(b[1].x, b[1].y, -dir * 0.5 + rng.range(-0.5, 0.5), rng.range(0.2, 0.32), t);
      }
      // 葉の房：茎のまわりに重なる大きめの葉（面の 6 割ほどを覆う）
      for (let q = 0; q < 6; q++) addLeaf(p.x + rng.range(-0.35, 0.35), p.y + rng.range(-0.5, 0.5), rng.range(-2.8, 2.8), rng.range(0.22, 0.4), t);
      if (i % 2 === 0) {
        // 節の花（水色、まんなかは白）
        P.push(part(flower, { pos: [p.x + rng.range(-0.08, 0.08), p.y, 0.24], scale: rng.range(0.07, 0.1), color: 0x7fe9ff, glow: 1 }));
        P.push(part(new THREE.CircleGeometry(1, 4), { pos: [p.x, p.y, 0.245], scale: 0.03, color: 0xfffbe8, glow: 1 }));
      }
    }
  }
  const g = merge(P);
  const mesh = new THREE.Mesh(g, structMaterial({ glow: 0x7fe9ff, amt: 0.6, night: 1.1, rim: 0.2, side: THREE.DoubleSide }));
  // 面の座標 → 世界：x' = u（右手 r）、z' = d（外向き n）
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(s.r.x, 0, s.r.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(s.n.x, 0, s.n.z));
  m.setPosition(s.x, s.y0, s.z);
  mesh.matrix.copy(m);
  return mesh;
}

// ── 楔の道：アーチの脚に寄りそう岩の柱（地層の色、風に磨かれた明るい帯）＋金の楔（水色の輪）＋手の白い跡＋休み棚 ──
function buildPegRoute(env, s, H) {
  const rng = env.fork('climb-' + s.id);
  const P = [];
  const W = s.width;
  const strata = strataColor(0);
  // 柱：前の面は平ら（登る面）、奥はアーチの中へ。上はアーチの背の斜面に溶ける
  const body = new THREE.BoxGeometry(W + 1.0, H + 1.6, 4.6, 6, 16, 2);
  const bp = body.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const front = z > 2.2;
    const j = front ? 0.05 : 0.35;
    bp.setXYZ(i, x * (1 + 0.06 * Math.sin(y * 0.8)) + Math.sin(y * 1.9 + x) * j, y, z + (front ? 0.04 * Math.sin(x * 3 + y * 1.7) : Math.sin(x * 2.1 + y) * j));
  }
  body.computeVertexNormals();
  P.push(part(body, { pos: [0, (H + 1.6) / 2 - 1.5, -2.3 - 0.02], color: (p, n) => {
    const c = strata({ x: p.x, y: p.y + s.y0, z: p.z }, n);
    // 前の面のまんなか：風に磨かれた明るい帯（登る道すじ）
    const band = n.z > 0.6 ? Math.max(0, 1 - Math.abs(p.x) / (W * 0.42)) : 0;
    const k = 0.72 + 0.2 * band;
    return [c[0] * k + 0.04 * band, c[1] * k + 0.03 * band, c[2] * k + 0.025 * band];
  } }));
  // 休み棚
  for (const l of s.ledges) P.push(ledgeGeo(l, 2.9));
  // 楔：岩に打った金の楔と、頭の水色の輪。まわりに手の白い跡（チョーク）
  const ring = new THREE.RingGeometry(0.045, 0.085, 8);
  const shaft = G.cyl(0.026, 0.034, 0.16, 5);
  const chalk = new THREE.CircleGeometry(1, 6);
  s.pegs.forEach((pg, i) => {
    P.push(part(shaft, { pos: [pg.u, pg.v, 0.06], rot: [Math.PI / 2, 0, 0], color: 0xffd76a, glow: 0.25 }));
    P.push(part(ring, { pos: [pg.u, pg.v, 0.142], color: 0x7fe9ff, glow: 1 }));
    P.push(part(new THREE.CircleGeometry(0.032, 6), { pos: [pg.u, pg.v, 0.141], color: 0xfff1c0, glow: 0.6 }));
    if (i % 2 === 0 || i < 4) P.push(part(chalk, { pos: [pg.u + rng.range(-0.06, 0.06), pg.v - 0.1, 0.012], scale: [rng.range(0.1, 0.16), rng.range(0.06, 0.1), 1], rot: [0, 0, rng.range(-0.5, 0.5)], color: 0xeae4d8 }));
  });
  // 下の 3 つの楔の上に、上向きの水色の矢じり（風の印）
  for (let i = 0; i < 3 && i < s.pegs.length; i++) {
    const pg = s.pegs[i];
    for (const sx of [-1, 1]) P.push(part(G.box(0.12, 0.022, 0.01), { pos: [pg.u + sx * 0.045, pg.v + 0.2, 0.02], rot: [0, 0, sx * 0.6], color: 0x7fe9ff, glow: 0.9 }));
  }
  const g = merge(P);
  const mesh = new THREE.Mesh(g, stoneMaterial({ glow: 0x7fe9ff, amt: 0.55, night: 0.9, moss: 0.15, grain: [1, 1], spec: 0.03 }));
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(s.r.x, 0, s.r.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(s.n.x, 0, s.n.z));
  m.setPosition(s.x, s.y0, s.z);
  mesh.matrix.copy(m);
  return mesh;
}
