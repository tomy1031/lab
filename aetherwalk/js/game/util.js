// js/game/util.js — small helpers shared inside js/game (OPUS-B). No allocation in hot paths.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, tau, dt) => (tau <= 0 ? b : a + (b - a) * (1 - Math.exp(-dt / tau)));
export const smooth = (t) => t * t * (3 - 2 * t);
/** yaw (0 = north / -Z, clockwise) of the direction (dx, dz) */
export const yawTo = (dx, dz) => Math.atan2(dx, -dz);
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const dist2D = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
export const isFn = (o, k) => !!o && typeof o[k] === 'function';

export function todayKey(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

// ── world access that tolerates the stub world ──
export function heightAt(ctx, x, z) {
  const w = ctx.world;
  if (w && typeof w.heightAt === 'function') {
    const h = w.heightAt(x, z);
    if (Number.isFinite(h)) return h;
  }
  return 0;
}
export function groundAt(ctx, x, z, y) {
  const w = ctx.world;
  if (w && typeof w.groundAt === 'function') {
    const h = w.groundAt(x, z, y);
    if (Number.isFinite(h)) return h;
  }
  return heightAt(ctx, x, z);
}
export function landmark(ctx, id) {
  const l = ctx.world && ctx.world.landmarks;
  return (l && l[id]) || null;
}
export function propsOf(ctx, kind) {
  const p = ctx.world && ctx.world.props;
  if (!p) return [];
  try {
    if (typeof p.ofKind === 'function') return p.ofKind(kind) || [];
    if (Array.isArray(p.list)) return p.list.filter((q) => q.kind === kind);
  } catch (e) { /* stub */ }
  return [];
}
export function propById(ctx, id) {
  const p = ctx.world && ctx.world.props;
  return (p && p.byId && p.byId[id]) || null;
}
export function spawnList(ctx, key) {
  const s = ctx.world && ctx.world.spawnPoints;
  const v = s && s[key];
  return Array.isArray(v) ? v : [];
}
export function fx(ctx, kind, pos, opts) {
  const f = ctx.world && ctx.world.fx;
  if (f && typeof f.emit === 'function') { try { f.emit(kind, pos, opts); } catch (e) { /* ignore */ } }
}
export function flash(ctx, pos, opts) {
  const f = ctx.world && ctx.world.fx;
  if (f && typeof f.flash === 'function') { try { f.flash(pos, opts); } catch (e) { /* ignore */ } }
}
export function setPropState(prop, key, value) {
  if (!prop) return;
  if (prop.state && prop.state[key] === value) return;
  if (typeof prop.setState === 'function') { try { prop.setState(key, value); } catch (e) { /* ignore */ } }
  else if (prop.state) prop.state[key] = value;
}
export function anchorOf(prop, name, out) {
  const a = prop && prop.anchors && prop.anchors[name];
  if (a) return out.copy(a);
  return out.set(prop ? prop.x || 0 : 0, prop ? prop.y || 0 : 0, prop ? prop.z || 0 : 0);
}
/** prop whose id is `id`, else the nearest prop of `kind` within `maxDist` of (x, z) */
export function findProp(ctx, kind, id, x, z, maxDist = 12) {
  const byId = propById(ctx, id);
  if (byId && byId.kind === kind) return byId;
  let best = null, bd = maxDist;
  for (const p of propsOf(ctx, kind)) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function emit(ctx, name, payload) {
  const ev = ctx.events;
  if (ev && typeof ev.emit === 'function') ev.emit(name, payload);
}
export function toast(ctx, text, sub = '', kind = 'info', ms = 3000, tag) {
  emit(ctx, 'ui:toast', { text, sub, kind, ms, tag });
}
export function setting(ctx, key, def) {
  const s = ctx.settings;
  if (s && typeof s.get === 'function') {
    const v = s.get(key);
    return v === undefined || v === null ? def : v;
  }
  return def;
}
export function playerPos(ctx, out) {
  const p = ctx.player && ctx.player.pos;
  if (p) return out.copy(p);
  if (ctx.camera) { ctx.camera.getWorldPosition(out); out.y -= 1.6; return out; }
  return out.set(0, 0, 0);
}
export function headPos(ctx, out) {
  const b = ctx.player && ctx.player.body;
  if (b && b.headPos) return out.copy(b.headPos);
  if (ctx.input && ctx.input.head && ctx.input.head.pos) return out.copy(ctx.input.head.pos);
  if (ctx.camera) return ctx.camera.getWorldPosition(out);
  return out.set(0, 1.6, 0);
}
export function isNight(ctx) {
  const w = ctx.world;
  if (!w) return false;
  if (w.phase) return w.phase === 'night';
  return (w.nightFactor || 0) > 0.6;
}

/** concatenate non-indexed geometries (position, normal, color) into one BufferGeometry */
export function mergeGeos(list) {
  let n = 0;
  const parts = list.map((g) => {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.attributes.normal) gg.computeVertexNormals();
    n += gg.attributes.position.count;
    return gg;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    else col.fill(1, o * 3, (o + c) * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const _c = new THREE.Color();
/** paint a whole geometry one color (hex sRGB → linear vertex colors) */
export function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  _c.setHex(hex);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** paint by height: lower color → upper color (sRGB hex) between y0..y1 */
export function paintY(geo, hexLo, hexHi, y0, y1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const lo = new THREE.Color(hexLo), hi = new THREE.Color(hexHi);
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = clamp((p.getY(i) - y0) / (y1 - y0 || 1), 0, 1);
    a[i * 3] = lo.r + (hi.r - lo.r) * t; a[i * 3 + 1] = lo.g + (hi.g - lo.g) * t; a[i * 3 + 2] = lo.b + (hi.b - lo.b) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export function xform(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(m);
  return geo;
}
