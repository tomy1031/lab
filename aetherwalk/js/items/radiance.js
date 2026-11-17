// js/items/radiance.js — the enchanted sword (OPUS-A). Steel in daylight, alive at night:
//  · a rune line of light down both fullers (a core line + diamond glyphs) with a slow pulse travelling up the blade
//  · a soft additive sheath hugging the edges (stronger at night, a glint sweeping up the blade now and then)
//  · a few motes drifting along the blade, the guard gems shining
//  · flare while swinging, a crisp flash where it hits (gold on strong hits), gold-tinged with tailwind II
// Everything is ONE additive mesh per sword (positions / colours rewritten each frame: ≈ 190 vertices; the sheath,
// motes, gem shine and impact star turn to the camera) → +1 draw call while held, none for sprites.
// Also drawn on a sword lying in the world (the pedestal).
// Additive light is added after the sRGB encode, so small linear values already read strongly: the levels
// below are low on purpose (daylight sheath ≈ 0.1 on screen, the rune line ≈ 0.6).
import * as THREE from 'three';
import { SWORD_BLADE as B } from './models.js';
import { clamp } from '../core/util.js';

export const RADIANT = new Set(['sword']);

const K_HALO = 0, K_RUNE = 1, K_GLYPH = 2, K_STAR = 3, K_SPARK = 4;
const MOTES = 4, SPARKS = MOTES + 2;                    // drifting motes + the two guard gems
const CYAN = new THREE.Color(0.5, 0.9, 1.0), WHITE = new THREE.Color(0.86, 1.0, 1.0), GOLD = new THREE.Color(1.0, 0.8, 0.4);
const _ch = new THREE.Color(), _cr = new THREE.Color(), _p = new THREE.Vector3(), _sc = new THREE.Color();
const _iq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _cpos = new THREE.Vector3(), _cs = new THREE.Vector3();
const _rx = new THREE.Vector3(), _ry = new THREE.Vector3(), _hl = new THREE.Vector3();

/** half-width of the blade at z (item space) */
function halfW(z) {
  if (z >= B.z1) return B.w0 + (B.w1 - B.w0) * (B.z0 - z) / (B.z0 - B.z1);
  return B.w1 * Math.max(0, (z - B.tipZ) / (B.z1 - B.tipZ));
}

/** the aura geometry in item space: position + colour (rewritten per frame); per-vertex kind / z / weight */
function auraGeometry() {
  const pos = [], idx = [], kind = [], zs = [], wgt = [];
  const v = (x, y, z, k, w) => { pos.push(x, y, z); kind.push(k); zs.push(z); wgt.push(w); return kind.length - 1; };
  // 1. the sheath: a ribbon along the blade, turned to face the camera every frame (so it shows edge-on too),
  //    five columns (the centre hidden inside the steel, so only the glow around the edges shows), rows down
  //    the blade and past the tip; positions here are placeholders
  const rows = [-0.058, -0.15, -0.26, -0.38, -0.5, -0.62, -0.72, -0.8, -0.885];
  const cols = [[-1, 0.018, 0], [-1, 0.005, 0.5], [0, 0, 1], [1, 0.005, 0.5], [1, 0.018, 0]];
  const base = kind.length;
  for (const z of rows) {
    const ends = z > -0.1 ? 0.35 : z < -0.86 ? 0.3 : 1;
    for (const [s, e, k] of cols) v(0, s ? s * (halfW(Math.max(z, B.tipZ)) + e) : 0, z, K_HALO, k * ends);
  }
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < cols.length - 1; c++) {
    const a = base + r * cols.length + c, b2 = a + 1, d = a + cols.length, e = d + 1;
    idx.push(a, d, b2, b2, d, e);
  }
  // 2. the rune line down each fuller (just above its floor), 10 segments so the pulse can travel
  for (const s of [-1, 1]) {
    const x = s * 0.0039, z0 = -0.075, z1 = -0.5, n = 10;
    const b0 = kind.length;
    for (let i = 0; i <= n; i++) {
      const z = z0 + (z1 - z0) * (i / n);
      const fade = i === 0 || i === n ? 0.3 : 1;
      v(x, -0.0011, z, K_RUNE, fade); v(x, 0.0011, z, K_RUNE, fade);
    }
    for (let i = 0; i < n; i++) { const a = b0 + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    // 3. diamond glyphs along the line
    for (let g = 0; g < 7; g++) {
      const zc = -0.11 - g * 0.058;
      const xg = s * 0.0047;
      const a = v(xg, 0, zc + 0.0068, K_GLYPH, 1), b2 = v(xg, 0.0034, zc, K_GLYPH, 1), c = v(xg, 0, zc - 0.0068, K_GLYPH, 1), d = v(xg, -0.0034, zc, K_GLYPH, 1);
      idx.push(a, b2, c, a, c, d);
    }
  }
  // 4. the impact star: two crossed thin diamonds (centre bright, points dark), placed and turned to the camera
  //    at the hit point each frame while a flash lasts (collapsed otherwise) — no extra draw call
  const star = kind.length;
  for (let d = 0; d < 2; d++) {
    const c = v(0, 0, 0, K_STAR, 1);
    const o = [v(0, 0, 0, K_STAR, 0), v(0, 0, 0, K_STAR, 0), v(0, 0, 0, K_STAR, 0), v(0, 0, 0, K_STAR, 0)];
    for (let i = 0; i < 4; i++) idx.push(c, o[i], o[(i + 1) % 4]);
  }
  // 5. sparkles (motes, gem shine): small camera-facing diamonds, centre bright
  const spark = kind.length;
  for (let d = 0; d < SPARKS; d++) {
    const c = v(0, 0, 0, K_SPARK, 1);
    const o = [v(0, 0, 0, K_SPARK, 0), v(0, 0, 0, K_SPARK, 0), v(0, 0, 0, K_SPARK, 0), v(0, 0, 0, K_SPARK, 0)];
    for (let i = 0; i < 4; i++) idx.push(c, o[i], o[(i + 1) % 4]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData = { kind: Uint8Array.from(kind), z: Float32Array.from(zs), w: Float32Array.from(wgt), star, spark, rows, cols };
  return g;
}

export function createRadiance(ctx, I) {
  const mat = ctx.art.basic({ color: 0xffffff, additive: true, vertexColors: true, side: THREE.DoubleSide });
  const flashes = Array.from({ length: 6 }, () => ({ p: new THREE.Vector3(), t0: -10, strong: false }));
  let fh = 0;

  function auraOf(inst) {
    if (inst.fx.aura) return inst.fx.aura;
    const m = new THREE.Mesh(auraGeometry(), mat);
    m.name = 'sword-aura';
    m.renderOrder = 7;
    m.frustumCulled = false;
    inst.object3D.add(m);
    inst.fx.aura = m;
    inst.fx.flare = 0; inst.fx.hitK = 0; inst.fx.hitGold = 0;
    return m;
  }

  /** a hit by a radiant blade: crisp flash at the point (gold when strong), the blade flares */
  function hit(inst, point, strong) {
    const f = flashes[fh++ % flashes.length];
    f.p.copy(point); f.t0 = ctx.clock.time; f.strong = !!strong;
    inst.fx.lastFlash = f;
    inst.fx.hitK = 1;
    if (strong) inst.fx.hitGold = 1;
    I.flash(point, { color: strong ? 0xffe6a8 : 0xe0fbff, size: strong ? 0.45 : 0.3, intensity: strong ? 0.9 : 0.6, life: 0.14 });
    I.fx('spark', point, { count: strong ? 16 : 10, color: strong ? 0xffe6a8 : 0xc8f6ff, speed: 4, size: 0.022 });
  }

  function paint(inst, dt, night, tier, speed, t) {
    const m = auraOf(inst);
    const fx = inst.fx;
    m.visible = inst.mesh.visible && R.gain > 0;
    if (!m.visible) return;
    // swing flare (eased), hit flash decay
    const want = clamp((speed - 1.5) / 4, 0, 1);
    fx.flare += (want - fx.flare) * Math.min(1, dt * (want > fx.flare ? 14 : 4));
    fx.hitK = Math.max(0, fx.hitK - dt * 4);
    fx.hitGold = Math.max(0, fx.hitGold - dt * 1.6);
    const gold = Math.min(1, (tier >= 2 ? 0.6 : 0) + fx.hitGold * 0.8);
    const lift = 1 + 1.4 * fx.flare + 1.2 * fx.hitK;
    const desk = (ctx.flags.xr ? 1 : 1.25) * R.gain;       // the PC preview sees the blade small: a little more
    _ch.copy(CYAN).lerp(GOLD, gold);                       // sheath
    _cr.copy(WHITE).lerp(GOLD, gold * 0.6);                // runes
    const halo = (0.012 + 0.07 * night) * lift * desk * (ctx.flags.xr ? 1 : 1.6);   // PC: the blade is small on screen
    const rune = (0.3 + 0.42 * night) * (1 + 0.6 * fx.flare + 0.8 * fx.hitK) * desk;
    // a glint sweeping up the blade every 4.5 s (and at the start of a swing)
    const cyc = (t + inst.uid * 1.7) % 4.5;
    const sweepZ = cyc < 0.7 ? B.z0 + (B.tipZ - 0.04 - B.z0) * (cyc / 0.7) : 9;
    const g = m.geometry, U = g.userData, col = g.attributes.color.array;
    for (let i = 0; i < U.kind.length; i++) {
      const z = U.z[i];
      const pulse = 0.78 + 0.22 * Math.sin(t * 2.2 + z * 9);                   // travels toward the tip
      const sweep = sweepZ < 1 ? Math.max(0, 1 - Math.abs(z - sweepZ) / 0.09) : 0;
      let k, c;
      if (U.kind[i] >= K_STAR) continue;
      if (U.kind[i] === K_HALO) { k = halo * U.w[i] * pulse + 0.06 * sweep * U.w[i]; c = _ch; }
      else { k = rune * U.w[i] * (U.kind[i] === K_GLYPH ? 1.15 : 1) * pulse + 0.35 * sweep; c = _cr; }
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    camIn(inst);
    faceSheath(g);
    starOf(inst, g, t);
    // motes drifting up the blade, and the guard gems shining
    const mb = (0.22 + 0.4 * night) * (1 + fx.flare) * R.gain;
    for (let j = 0; j < MOTES; j++) {
      const ph = j / MOTES + inst.uid * 0.13;
      const s = (t * 0.16 + ph) % 1;
      const z = -0.09 + (B.tipZ + 0.02 + 0.09) * s;
      const w = halfW(z) + 0.006;
      _p.set(0.008 * Math.sin(t * 1.3 + j * 4.7), w * Math.sin(t * 0.9 + j * 2.1), z);
      _sc.copy(_cr).multiplyScalar(mb * Math.sin(Math.PI * s));
      sparkle(g, j, _p, 0.0065 + 0.002 * Math.sin(t * 3 + j), _sc);
    }
    const gp = 0.75 + 0.25 * Math.sin(t * 2.6 + inst.uid);
    _sc.copy(CYAN).lerp(GOLD, gold * 0.5).multiplyScalar((0.35 + 0.45 * night) * gp * (1 + fx.hitK) * R.gain);
    for (let j = 0; j < 2; j++) {
      _p.set(j ? -0.0128 : 0.0128, 0, -0.0465);
      sparkle(g, MOTES + j, _p, (0.011 + 0.008 * night) * (1 + 0.5 * fx.flare), _sc);
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  // the camera in blade space: position (_cl) and its right / up axes (_rx, _ry)
  const _cl = new THREE.Vector3();
  function camIn(inst) {
    (R.camera || ctx.camera).matrixWorld.decompose(_cpos, _cq, _cs);
    _iq.copy(inst.quat).invert();
    _cl.copy(_cpos).sub(inst.pos).applyQuaternion(_iq);
    _rx.set(1, 0, 0).applyQuaternion(_cq).applyQuaternion(_iq);
    _ry.set(0, 1, 0).applyQuaternion(_cq).applyQuaternion(_iq);
  }
  /** sparkle j: a diamond facing the camera at blade-space point c, half-size r */
  function sparkle(g, j, c, r, color) {
    const P = g.attributes.position.array, col = g.attributes.color.array, b = g.userData.spark + j * 5;
    const pts = [[0, 0], [r, 0], [0, r], [-r, 0], [0, -r]];
    for (let i = 0; i < 5; i++) {
      const o = (b + i) * 3, [u, w] = pts[i];
      P[o] = c.x + _rx.x * u + _ry.x * w; P[o + 1] = c.y + _rx.y * u + _ry.y * w; P[o + 2] = c.z + _rx.z * u + _ry.z * w;
      const k = i === 0 ? 1 : 0;
      col[o] = color.r * k; col[o + 1] = color.g * k; col[o + 2] = color.b * k;
    }
  }

  /** turn the sheath ribbon to the camera: per row, the side axis ⟂ to the blade and to the view (blade space) */
  function faceSheath(g) {
    const U = g.userData, P = g.attributes.position.array;
    const nc = U.cols.length;
    for (let r = 0; r < U.rows.length; r++) {
      const z = U.rows[r];
      let sx = -_cl.y, sy = _cl.x;                         // ⟂ to the blade axis (Z) and to the view
      const L = Math.hypot(sx, sy) || 1;
      sx /= L; sy /= L;
      // how wide the blade looks across that axis (flat face: width; edge-on: thickness)
      const app = halfW(Math.max(z, B.tipZ)) * Math.abs(sy) + B.t * Math.abs(sx);
      for (let c = 0; c < nc; c++) {
        const [side, e] = U.cols[c];
        const o = side ? side * (app + e) : 0;
        const k = (r * nc + c) * 3;
        P[k] = sx * o; P[k + 1] = sy * o; P[k + 2] = z;
      }
    }
  }

  /** the latest impact on this blade as a crisp 4-point star facing the camera, in the blade's own space */
  function starOf(inst, g, t) {
    const U = g.userData, P = g.attributes.position.array, col = g.attributes.color.array;
    const f = inst.fx.lastFlash;
    const a = f ? t - f.t0 : 9, life = f && f.strong ? 0.24 : 0.17;
    const on = a >= 0 && a < life;
    if (!on && !inst.fx.starOn) return;
    inst.fx.starOn = on;
    const k = on ? 1 - a / life : 0;
    // the hit point in blade space (camIn has set _iq, _cl, _rx, _ry), pulled 8 cm toward the camera so the
    // target's own surface doesn't swallow it
    if (on) {
      _hl.copy(f.p).sub(inst.pos).applyQuaternion(_iq);
      _p.copy(_cl).sub(_hl).normalize();
      _hl.addScaledVector(_p, 0.08);
    }
    const L = (f && f.strong ? 0.3 : 0.22) * (0.75 + 0.25 * k), W = 0.015;
    _sc.copy(f && f.strong ? GOLD : WHITE).lerp(WHITE, 0.4).multiplyScalar(1.6 * k * k);
    for (let d = 0; d < 2; d++) {
      const ax = d ? _ry : _rx, bx = d ? _rx : _ry, b = U.star + d * 5;
      const pts = [[0, 0], [L, 0], [0, W], [-L, 0], [0, -W]];
      for (let i = 0; i < 5; i++) {
        const o = (b + i) * 3;
        if (!on) { P[o] = P[o + 1] = P[o + 2] = 0; col[o] = col[o + 1] = col[o + 2] = 0; continue; }
        const [u, w] = pts[i], s = d ? 0.7 : 1;       // the vertical ray a little shorter
        P[o] = _hl.x + ax.x * u * s + bx.x * w; P[o + 1] = _hl.y + ax.y * u * s + bx.y * w; P[o + 2] = _hl.z + ax.z * u * s + bx.z * w;
        const c = i === 0 ? 1 : 0;
        col[o] = _sc.r * c; col[o + 1] = _sc.g * c; col[o + 2] = _sc.b * c;
      }
    }
  }

  function update(dt) {
    const t = ctx.clock.time;
    const night = clamp(ctx.world?.nightFactor ?? 0, 0, 1);
    const tier = ctx.game?.vitals?.tier | 0;
    for (const h of ['left', 'right']) {
      const inst = I.held[h];
      if (inst && RADIANT.has(inst.id)) paint(inst, dt, night, tier, I.melee?.tipSpeed(h) || 0, t);
    }
    const pp = ctx.player?.pos;
    for (const inst of I.world) if (RADIANT.has(inst.id) && (!pp || inst.pos.distanceToSquared(pp) < 900)) paint(inst, dt, night, 0, 0, t);
  }

  /** draw calls the enchantment adds right now (one per visible sword) */
  function drawCalls() {
    let n = 0;
    for (const h of ['left', 'right']) if (I.held[h]?.fx?.aura?.visible) n++;
    for (const inst of I.world) if (inst.fx?.aura?.visible) n++;
    return n;
  }

  /** a throwaway glow mesh for the shader warm-up frame (core/warm.js) */
  function warmObject() { const m = new THREE.Mesh(auraGeometry(), mat); m.name = 'warm-sword-aura'; return m; }

  // gain: 0 hides the enchantment; camera: face the impact star to another camera (tests / screenshots)
  const R = { update, hit, drawCalls, warmObject, RADIANT, gain: 1, camera: null };
  return R;
}
