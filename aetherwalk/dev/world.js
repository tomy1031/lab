// dev/world.js — FABLE（開発用。ビルドには入らない）
// 世界だけを本物で動かす最小のプレビュー。
//   ?x=&z=&yaw=&pitch=&t=&lift=&vista=v_awakening&seed=7&hud=0
// キー：WASD 移動（Shift で速く）、矢印 見回す、[ ] 時刻、1-7 絶景
import * as THREE from 'three';
import { createWorld } from '../js/world/index.js';

const params = new URLSearchParams(location.search);
const errors = [];
window.DEV = { ready: false, errors };
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.stack || e.reason)));

function mkRng(seed) {
  let a = seed | 0;
  const next = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()), pick: (arr) => arr[Math.floor(next() * arr.length)],
    fork: (label) => { let h = seed | 0; for (const ch of String(label)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193); return mkRng(h ^ 0x9e3779b9); } };
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 3000);
const rig = new THREE.Group();
rig.add(camera); scene.add(rig);
camera.position.set(0, 1.6, 0);
camera.rotation.order = 'YXZ';
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const listeners = {};
const seed = +(params.get('seed') ?? 7);
const ctx = {
  renderer, scene, camera, rig,
  events: { on(n, f) { (listeners[n] ||= []).push(f); return () => {}; }, once() {}, off() {}, emit(n, p) { (listeners[n] || []).forEach((f) => f(p)); (DEV.events ||= []).push([n, p]); if (DEV.events.length > 200) DEV.events.shift(); } },
  settings: { get: () => undefined, set() {}, all: () => ({}) },
  rng: mkRng(seed), clock: { time: 0, dt: 0, frame: 0 },
  flags: { desktop: true, nosound: true, fresh: true, xr: false, device: 'pc', seed },
  params, paused: false, setPaused() {}, progress() {},
  zones: null, targets: null,
};
const state = { x: 0, z: 540, yaw: 0, pitch: 0, lift: 0 };
function place() {
  const y = (state.onGround ? ctx.world.groundAt(state.x, state.z, ctx.world.heightAt(state.x, state.z) + 0.5) : ctx.world.groundAt(state.x, state.z, Infinity)) + state.lift;
  rig.position.set(state.x, y, state.z);
  rig.rotation.y = -state.yaw * Math.PI / 180;
  camera.rotation.x = state.pitch * Math.PI / 180;
  rig.updateMatrixWorld(true);
}
DEV.view = (x, z, yaw = 0, pitch = 0, t, lift = 0, onGround = true) => { Object.assign(state, { x, z, yaw, pitch, lift, onGround }); if (t !== undefined && t !== null) ctx.world.setTimeOfDay(t); place(); };
DEV.vista = (id) => { const v = ctx.world.vistas.find((q) => q.id === id); if (!v) return false; DEV.view(v.x, v.z, v.yaw, v.pitch || 0, v.time, v.lift || 0, false); return true; };
DEV.settle = (frames = 6, dt = 0.05) => { for (let i = 0; i < frames; i++) { ctx.world.update(dt, ctx); } renderer.render(scene, camera); return DEV.info(); };
DEV.info = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, points: renderer.info.render.points, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length, state: { ...state }, y: rig.position.y, time: ctx.world.time, region: ctx.world.regionAt(state.x, state.z), buildMs: ctx.world.buildMs, timing: ctx.world._debug && ctx.world._debug.timing });

DEV.breakdown = () => {
  const root = ctx.world.root, res = {};
  const vis = root.children.map((c) => c.visible);
  for (let i = 0; i < root.children.length; i++) {
    root.children.forEach((c, j) => { c.visible = j === i && vis[j]; });
    renderer.render(scene, camera);
    res[root.children[i].name || i] = [renderer.info.render.calls, renderer.info.render.triangles];
  }
  root.children.forEach((c, j) => { c.visible = vis[j]; });
  renderer.render(scene, camera);
  return res;
};
const t0 = performance.now();
try {
  ctx.world = await createWorld(ctx);
  ctx.art = ctx.world.art;
} catch (e) { errors.push(String(e && e.stack || e)); throw e; }
DEV.world = ctx.world; DEV.ctx = ctx; DEV.createMs = performance.now() - t0; DEV.THREE = THREE;
if (params.get('vista')) DEV.vista(params.get('vista'));
else DEV.view(+(params.get('x') ?? 0), +(params.get('z') ?? 540), +(params.get('yaw') ?? 0), +(params.get('pitch') ?? 0), params.get('t') !== null ? +params.get('t') : undefined, +(params.get('lift') ?? 0));

const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'BracketLeft') ctx.world.setTimeOfDay(ctx.world.time - 0.5);
  if (e.code === 'BracketRight') ctx.world.setTimeOfDay(ctx.world.time + 0.5);
  const n = +e.key; if (n >= 1 && n <= ctx.world.vistas.length) DEV.vista(ctx.world.vistas[n - 1].id);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const info = document.getElementById('info');
if (params.get('hud') === '0') info.style.display = 'none';
let last = performance.now();
const manual = params.has('manual');
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (manual) return;
  const sp = (keys.ShiftLeft ? 20 : 5) * dt, yr = state.yaw * Math.PI / 180;
  let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (f || s) { state.x += (Math.sin(yr) * f + Math.cos(yr) * s) * sp; state.z += (-Math.cos(yr) * f + Math.sin(yr) * s) * sp; }
  state.yaw += ((keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0)) * 70 * dt;
  state.pitch += ((keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0)) * 50 * dt;
  place();
  ctx.clock.time += dt; ctx.clock.dt = dt; ctx.clock.frame++;
  ctx.world.update(dt, ctx);
  renderer.render(scene, camera);
  if (ctx.clock.frame % 20 === 0) info.textContent = `x ${state.x.toFixed(0)} z ${state.z.toFixed(0)} yaw ${state.yaw.toFixed(0)} t ${ctx.world.time.toFixed(2)} ${ctx.world.regionAt(state.x, state.z)}\ncalls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`;
});
DEV.ready = true;
