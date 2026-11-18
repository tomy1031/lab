// js/main.js — start-up: renderer, scene, menu, entering VR or playing on PC.
//   ?demo        CPU vs CPU, seen from behind your side (also the attract mode)
//   ?seed=N      reproducible CPU decisions      ?set=key:value,…  override settings (tests)
import * as THREE from 'three';
import { Settings } from './settings.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { buildMenu } from './menu.js';

const params = new URLSearchParams(location.search);
const demo = params.has('demo');
const timeScale = Math.max(0.1, Math.min(8, Number(params.get('fast')) || 1));   // tests run the game faster
const RC = (window.RC = { ready: false, errors: [] });
addEventListener('error', (e) => RC.errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => RC.errors.push(String(e.reason)));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.prepend(renderer.domElement);
// ?lite: no shadows and a small XR framebuffer (tests in software rendering)
const lite = params.has('lite');
if (lite) { renderer.shadowMap.enabled = false; renderer.xr.setFramebufferScaleFactor(0.2); renderer.setPixelRatio(0.5); }

const scene = new THREE.Scene();
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.03, 900);
camera.position.set(0, 1.65, 0);
rig.add(camera);
rig.position.set(0, 0, 12.6);

const settings = new Settings();
const input = new Input(renderer, rig);
const game = new Game({ renderer, scene, camera, rig, settings, input, demo, seed: Number(params.get('seed')) || undefined });
game.player.isXR = () => renderer.xr.isPresenting;
game.autoSwing = params.has('autoswing');
if (lite) { game.world.crowd.visible = false; scene.traverse((o) => { o.castShadow = false; }); }
RC.game = game; RC.settings = settings; RC.THREE = THREE;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── menu ──
const menuEl = document.getElementById('menu');
const hud = document.getElementById('pc-hud');
const menuBtn = document.getElementById('pc-menu-btn');
buildMenu(menuEl, settings);
let playing = false;
function showMenu(on) {
  menuEl.classList.toggle('hidden', !on);
  hud.classList.toggle('hidden', on || renderer.xr.isPresenting);
  menuBtn.classList.toggle('hidden', on || renderer.xr.isPresenting);
  game.paused = on && playing;
}
game.onPcMenu = (on) => showMenu(on);
game.onHud = (lines) => {
  if (renderer.xr.isPresenting) return;
  const key = lines.join('|');
  if (hud.dataset.key === key) return;
  hud.dataset.key = key;
  hud.innerHTML = lines.map((l, i) => (i === 0 ? `<b>${esc(l)}</b>` : i === lines.length - 1 ? `<span class="tip">${esc(l)}</span>` : esc(l))).join('<br>');
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
menuBtn.onclick = () => showMenu(true);

let menuSnapshot = '';
const sessionKeys = ['mode', 'level', 'sets', 'games', 'surface', 'noAd', 'firstServe', 'hand'];
const snap = () => JSON.stringify(sessionKeys.map((k) => settings.get(k)));

document.getElementById('play-pc').onclick = () => {
  game.sound.start();
  if (!playing || snap() !== menuSnapshot) { game.start(); playing = true; }
  menuSnapshot = snap();
  showMenu(false);
};
menuSnapshot = snap();

// ── VR ──
const vrBtn = document.getElementById('enter-vr');
const note = document.getElementById('xr-note');
let xrSession = null;
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    vrBtn.disabled = !ok;
    note.textContent = ok ? '' : 'このブラウザは VR に対応していません。Meta Quest のブラウザで開くと VR で遊べます（PC でも遊べます）。';
  }).catch(() => { note.textContent = 'VR の確認に失敗しました。PC で遊べます。'; });
} else {
  note.textContent = 'このブラウザは WebXR に対応していません。Meta Quest のブラウザで開くと VR で遊べます（PC でも遊べます）。';
}
vrBtn.onclick = async () => {
  if (xrSession) { xrSession.end(); return; }
  try {
    game.sound.start();
    const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    xrSession = s;
    s.addEventListener('end', () => { xrSession = null; vrBtn.textContent = 'VR をはじめる'; showMenu(true); playing = false; });
    await renderer.xr.setSession(s);
    // 90 Hz where the headset can (smoother racket tracking)
    try { if (s.supportedFrameRates && s.updateTargetFrameRate) { const rates = [...s.supportedFrameRates]; if (rates.includes(90)) await s.updateTargetFrameRate(90); } } catch { /* keep the default */ }
    vrBtn.textContent = 'VR をおわる';
    camera.position.set(0, 0, 0);
    game.needRecenter = 3;
    showMenu(false);
    game.start();
    playing = true;
    menuSnapshot = snap();
  } catch (e) {
    note.textContent = 'VR を開始できませんでした：' + (e && e.message ? e.message : e);
  }
};

// ── loop ──
const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(0.25, timer.getDelta()) * timeScale;
  if (game.needRecenter && renderer.xr.isPresenting) {
    // after a few XR frames the head pose is real: face the net and stand where the session wants you
    if (--game.needRecenter === 0) { const b = { ...game.sim.body }; game.player.recenter(); game.player.place(b.x, b.z); }
  }
  try {
    // large steps (tests at ?fast=N) are split so that nothing moves more than 1/30 s at once
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < n; i++) game.frame(dt / n);
  } catch (e) { RC.errors.push(String(e && e.stack || e)); console.error(e); }
  renderer.render(scene, camera);
  RC.frames = (RC.frames || 0) + 1;
});

if (demo) {
  menuEl.classList.add('hidden');
  hud.classList.remove('hidden');
  game.start();
  playing = true;
  // a click unlocks the sound
  addEventListener('pointerdown', () => game.sound.start(), { once: true });
}
RC.ready = true;
