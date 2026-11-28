// js/main.js — start-up: renderer, scene, menu, entering VR or playing on PC.
//   ?demo        CPU against CPU (also the attract mode)        ?seed=N    reproducible CPU decisions
//   ?set=key:value,…  override settings (tests)                  ?lite      no shadows, small XR framebuffer (tests)
//   ?cam=tv      a broadcast camera from the corner of the stands (PC / demo)
import * as THREE from 'three';
import { Settings } from './settings.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { buildMenu } from './menu.js';
import { makeBall, copyBall, step, H, TABLE } from './physics.js';

const params = new URLSearchParams(location.search);
const demo = params.has('demo');
const lite = params.has('lite');
const timeScale = Math.max(0.1, Math.min(8, Number(params.get('fast')) || 1));
const ST = (window.ST = { ready: false, errors: [] });
addEventListener('error', (e) => ST.errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => ST.errors.push(String(e.reason)));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.5);
document.body.prepend(renderer.domElement);
if (lite) { renderer.xr.setFramebufferScaleFactor(0.25); renderer.setPixelRatio(0.6); }

const scene = new THREE.Scene();
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 120);
camera.position.set(0, 1.85, TABLE_Z());
rig.add(camera);
function TABLE_Z() { return TABLE.halfL + 2.0; }

const settings = new Settings();
const input = new Input(renderer, rig);
const game = new Game({ renderer, scene, camera, rig, settings, input, demo, seed: Number(params.get('seed')) || undefined, lite });
ST.physics = { makeBall, copyBall, step, H, TABLE };
ST.game = game; ST.settings = settings; ST.THREE = THREE; ST.renderer = renderer; ST.camera = camera; ST.rig = rig;

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
game.tvCamera = params.get('cam') === 'tv';
game.onHud = (lines) => {
  const key = lines.join('|');
  if (hud.dataset.key === key) return;
  hud.dataset.key = key;
  hud.innerHTML = lines.map((l, i) => (i === 0 ? `<b>${esc(l)}</b>` : i === lines.length - 1 ? `<span class="tip">${esc(l)}</span>` : esc(l))).join('<br>');
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
menuBtn.onclick = () => showMenu(true);

const sessionKeys = ['mode', 'level', 'bestOf', 'firstServe', 'hand'];
const snap = () => JSON.stringify(sessionKeys.map((k) => settings.get(k)));
let menuSnapshot = snap();
document.getElementById('play-pc').onclick = () => {
  game.sound.start();
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  if (!playing || snap() !== menuSnapshot || game.sim.phase === 'done') { game.start(); playing = true; }
  menuSnapshot = snap();
  showMenu(false);
};

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
    s.addEventListener('end', () => {
      xrSession = null; vrBtn.textContent = 'VR をはじめる'; playing = false;
      rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); camera.position.set(0, 1.85, TABLE_Z());
      game.showVrMenu(false); showMenu(true);
    });
    await renderer.xr.setSession(s);
    // 90 Hz where the headset can: the paddle is tracked (and swept) more finely than at 72 Hz
    try {
      if (s.supportedFrameRates && s.updateTargetFrameRate && [...s.supportedFrameRates].includes(90)) await s.updateTargetFrameRate(90);
    } catch { /* keep the default */ }
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
  const dt = Math.min(0.1, timer.getDelta()) * timeScale;
  if (game.needRecenter && renderer.xr.isPresenting) {
    if (--game.needRecenter === 0) game.recenter();
  }
  try {
    // in VR the controller pose changes once per frame, so the frame is one step (the physics interpolates the
    // paddle across it); on PC a long frame is split so nothing jumps more than 1/30 s
    const n = renderer.xr.isPresenting ? 1 : Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < n; i++) game.frame(dt / n);
    if (!renderer.xr.isPresenting) game.pcCamera(dt);
  } catch (e) { ST.errors.push(String(e && e.stack || e)); console.error(e); }
  renderer.render(scene, camera);
  ST.frames = (ST.frames || 0) + 1;
});

if (demo) {
  menuEl.classList.add('hidden');
  hud.classList.remove('hidden');
  game.start();
  playing = true;
  addEventListener('pointerdown', () => game.sound.start(), { once: true });
}

// offline: the published build registers its service worker (sw.js is filled in by tools/bundle.mjs)
if (window.SPIN_TABLE_BUILD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* online only */ });
}
ST.ready = true;
