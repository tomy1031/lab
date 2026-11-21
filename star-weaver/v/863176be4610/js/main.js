// main.js — boot: renderer, landing page wiring, WebXR session, desktop preview.
import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { store } from './store.js';
import { Game } from './game.js';
import { Desktop } from './desktop.js';
import { MODES } from './timeline.js';
import { fmtTime } from './util.js';
import { GLYPHS } from './glyphs.js';
import { initPWA } from './pwa.js';
import { FONT } from './theme.js';

const q = new URLSearchParams(location.search);
const params = {
  autoplay: q.has('autoplay'),
  tutorial: q.has('tutorial'),
  loopDemo: q.has('loop'),
  speed: Number(q.get('speed')) || 1,
  seed: Number(q.get('seed')) || 0,
  mode: MODES[q.get('mode')] ? q.get('mode') : null,
  nosound: q.has('nosound'),
  skill: q.has('skill') ? Number(q.get('skill')) : 1,
};
store.load();

const $ = (s) => document.querySelector(s);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
if (renderer.xr.setFoveation) renderer.xr.setFoveation(0.6);
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 220);
camera.position.set(0, 1.6, 0);
scene.add(camera);

const audio = new AudioEngine();
const game = new Game({ renderer, scene, camera, audio, store, params });
const desk = new Desktop(game, renderer.domElement);
window.__game = game; // handy for debugging and the automated tests

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = 0;
renderer.setAnimationLoop((time) => {
  const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 72;
  last = time;
  try {
    if (!renderer.xr.isPresenting) desk.update(dt);
    game.update(dt);
  } catch (e) { console.error(e); window.__lastError = String(e && e.stack || e); }
  renderer.render(scene, camera);
});

// ---------------- landing page ----------------
const overlay = $('#overlay'), deskBar = $('#deskbar');
function showOverlay(on) {
  overlay.hidden = !on;
  deskBar.hidden = on || renderer.xr.isPresenting;
  if (on) renderStats();
}

function renderStats() {
  const d = store.data, tot = store.totals();
  $('#streak').textContent = store.streak();
  $('#sessions').textContent = tot.sessions;
  $('#minutes').textContent = tot.minutes;
  $('#kcal').textContent = tot.kcal;
  $('#weight').value = d.settings.weight;
  const list = $('#history');
  list.innerHTML = '';
  for (const r of d.history.slice(0, 6)) {
    const li = document.createElement('li');
    const dt = new Date(r.date);
    li.innerHTML = `<span class="h-date">${dt.getMonth() + 1}/${dt.getDate()}</span><span class="h-mode">${MODES[r.mode]?.label || r.mode}</span><b class="h-rank">${r.rank}</b><span class="h-score">${r.score.toLocaleString()}</span><span class="h-meta">${fmtTime(r.sec)} · ${r.kcal}kcal</span>`;
    list.appendChild(li);
  }
  $('#history-wrap').hidden = !d.history.length;
  const r = game.lastResult;
  $('#last').hidden = !r;
  if (r) {
    $('#last-rank').textContent = r.rank;
    $('#last-score').textContent = r.score.toLocaleString();
    $('#last-meta').textContent = `${MODES[r.mode].label} · ${fmtTime(r.sec)} · ${r.kcal} kcal · 肩まわし ${r.counts.circles} · 腕上げ ${r.counts.reach} · 胸ひらき ${r.counts.open}`;
  }
}
$('#weight').addEventListener('change', (e) => {
  const v = Math.round(Number(e.target.value));
  if (v >= 25 && v <= 200) store.setSetting('weight', v);
});

const vrBtn = $('#enter-vr'), vrNote = $('#vr-note');
async function checkXR() {
  if (!navigator.xr) { vrNote.textContent = 'このブラウザはWebXRに対応していません。Meta Quest のブラウザでこのページを開いてください。'; vrBtn.disabled = true; return; }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-vr');
    vrBtn.disabled = !ok;
    vrNote.textContent = ok ? 'ヘッドセットをかぶったら、正面を向いて立ってください。' : 'VRヘッドセットが見つかりません。Meta Quest のブラウザで開くと ENTER VR が押せます。';
  } catch { vrBtn.disabled = true; vrNote.textContent = 'WebXR を確認できませんでした（HTTPS で開いていますか？）'; }
}
checkXR();

let session = null;
vrBtn.addEventListener('click', async () => {
  audio.init(store.settings.volume);
  try {
    session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] });
  } catch (e) { vrNote.textContent = `VRを開始できませんでした: ${e.message || e}`; return; }
  await renderer.xr.setSession(session);
  showOverlay(false);
  deskBar.hidden = true;
  session.addEventListener('end', () => {
    session = null;
    game.exit();
    camera.position.set(0, 1.6, 0);
    showOverlay(true);
  });
  session.addEventListener('visibilitychange', () => { if (session && session.visibilityState !== 'visible') game.pause(); });
  try {
    const rates = session.supportedFrameRates ? Array.from(session.supportedFrameRates) : [];
    if (rates.includes(90) && session.updateTargetFrameRate) await session.updateTargetFrameRate(90);
  } catch { /* keep the default rate */ }
  // the player can re-centre with a long press of the Meta button: keep the stage in front of them
  setTimeout(() => {
    const ref = renderer.xr.getReferenceSpace();
    if (ref && ref.addEventListener) ref.addEventListener('reset', () => setTimeout(() => game.onReferenceReset(), 150));
  }, 0);
  game.enter(true);
});

function startDesktop(autoplay) {
  if (!params.nosound) audio.init(store.settings.volume);
  showOverlay(false);
  game.params.autoplay = autoplay;
  desk.start(autoplay);
  game.enter(false);
  $('#desk-hint').textContent = autoplay ? 'AUTOPLAY · Space で一時停止' : 'マウス＝手（左手は鏡写し） · A/D＝横ステップ · S＝スクワット · Space＝一時停止 · メニューはクリック';
}
$('#preview').addEventListener('click', () => startDesktop(false));
$('#demo').addEventListener('click', () => startDesktop(true));
$('#desk-back').addEventListener('click', () => { desk.stop(); game.exit(); showOverlay(true); });
game.on('results', () => renderStats());

// canvas text only uses the web font once its glyphs are loaded: fetch the subsets the VR panels need,
// then redraw whatever panel is already showing (system fonts are used until then)
if (document.fonts && document.fonts.load) {
  Promise.all(['500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 40px ${FONT}`, GLYPHS)))
    .then(() => game.refreshPanels())
    .catch(() => {});
}

// ---------------- offline / updates (published builds only) ----------------
const pwa = initPWA({
  onStatus: (st) => {
    const el = $('#offline');
    el.hidden = false;
    el.classList.toggle('ready', st.state === 'ready');
    $('#offline-text').textContent = st.state === 'ready' ? 'READY · ネットなしでも遊べます'
      : st.state === 'error' ? 'オフライン保存に失敗しました' : `保存中… ${st.cached || 0} / ${st.total || '?'}`;
  },
  onUpdate: () => { $('#update').hidden = false; },
  onInstallable: (on) => { $('#install').hidden = !on; },
});
$('#btn-update').addEventListener('click', () => pwa.apply());
$('#install').addEventListener('click', () => pwa.install && pwa.install());
window.__pwa = pwa;

showOverlay(true);
if (params.autoplay || params.tutorial) startDesktop(params.autoplay);
