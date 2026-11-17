// Kotoba Town — boot and game flow: town square (lesson board) → scenario briefing → conversation
// (Runner) → report. Works on PC (mouse) and in VR (controllers / hands).
import * as THREE from 'three';
import { App } from './core/app.js';
import { store } from './core/store.js';
import { Sound } from './audio/sound.js';
import { Mic } from './audio/mic.js';
import { Ambience } from './audio/ambience.js';
import { Stage } from './world/stage.js';
import { SCENES } from './content/cast.js';
import { loadCourses, loadVoiceIndex, charactersOf } from './content/index.js';
import { SpeechBubble, TurnCard, Board, Toast, LazyFollow } from './ui/views.js';
import { Runner } from './talk/runner.js';
import { LIVE_MODELS } from './talk/live.js';

const KT = (window.KT = window.KT || { ready: false, errors: [], log: [] });
const log = (...a) => { KT.log.push(a.join(' ')); if (KT.log.length > 200) KT.log.shift(); if (new URLSearchParams(location.search).has('debug')) console.log('[kt]', ...a); };

const $ = (s) => document.querySelector(s);
const SCENE_NAMES = { office: 'かいしゃ · Office', classroom: 'きょうしつ · Classroom', apartment: 'アパート · Apartment', depato: 'デパート · Dept. store', museum: 'びじゅつかん · Museum', station: 'えき · Station', cafe: 'きっさてん · Café', park: 'こうえん · Park', home: 'もりさんの いえ · Home', konbini: 'コンビニ · Konbini' };

async function boot() {
  const fontReady = document.fonts?.load('800 40px "M PLUS Rounded 1c"').catch(() => {});
  const app = new App($('#stage'));
  const sound = new Sound();
  const mic = new Mic(sound);
  const amb = new Ambience(sound);
  const stage = new Stage(app, sound);
  const [courses] = await Promise.all([loadCourses(), loadVoiceIndex(), fontReady]);
  const units = courses.flatMap((c) => c.units);
  const bubble = new SpeechBubble(app);
  const toast = new Toast(app);
  const board = new Board(app, sound);
  let runner = null;
  const turn = new TurnCard(app, {
    hint: () => runner?.hint(), again: () => runner?.again(), skip: () => runner?.skip(),
    choose: (t) => runner?.choose(t), finish: () => runner?.endFree(),
  });
  turn.panel.onClickSound = () => sound.blip('pop');
  const follow = new LazyFollow(app, turn.panel.mesh, { dist: 0.8, height: -0.42 });
  const boardFollow = new LazyFollow(app, board.panel.mesh, { dist: 1.05, height: -0.12, threshold: 0.9 });
  let boardMode = 'world'; // 'world' = fixed in the hub, 'follow' = in front of the learner

  app.onUpdate((dt, t) => {
    stage.update(dt, t);
    if (turn.panel.visible) { follow.update(dt); turn.setLevel(mic.sending ? mic.level : 0); }
    if (board.panel.visible && boardMode === 'follow') boardFollow.update(dt);
    board.panel.mesh.scale.setScalar(boardMode === 'follow' ? 0.62 : 1);
  });

  const state = { lesson: null, variant: null, where: 'title', course: courses[0]?.id || 'minna', mode: 'practice' };
  KT.state = state; KT.app = app; KT.stage = stage; KT.store = store;

  // ------------------------------------------------------------------ places
  async function goTown() {
    runner?.stop(); runner = null;
    state.where = 'town';
    await stage.fade(1, 300);
    await stage.load('hub', { time: timeOfDay(), season: season(), weather: 'clear' }, []);
    amb.start('hub', { music: store.settings.music });
    boardMode = 'world';
    const a = stage.built.boardAnchor;
    board.panel.mesh.position.copy(a);
    board.panel.mesh.rotation.set(0, 0, 0);
    showLessons();
    await stage.fade(0, 400);
  }

  const starsOf = (id, mode) => store.starsOf(id, mode);

  function showLessons() {
    board.courses({
      courses, active: state.course, starsOf,
      onTab: (id) => { state.course = id; showLessons(); },
      onPick: (L) => showVariants(L),
    });
  }

  function showVariants(L) {
    state.lesson = L;
    state.course = L.course;
    board.variants(L, starsOf, (v) => openVariant(L, v), showLessons, (s) => SCENE_NAMES[s] || s);
  }

  async function openVariant(L, v) {
    state.lesson = L; state.variant = v; state.where = 'brief';
    board.hide();
    await stage.fade(1, 350);
    const cast = charactersOf(v).map((char) => ({ char, slot: v.positions?.[char.id] || null }));
    let auto = 0;
    for (const c of cast) if (!c.slot) c.slot = (SCENES[v.scene]?.slots || []).filter((s) => s !== 'phone')[auto++] || 'npc1';
    await stage.load(v.scene, v.setup || {}, cast);
    amb.start(v.scene, { weather: v.setup?.weather, time: v.setup?.time });
    boardMode = 'follow';
    boardFollow.update(0, true);
    const live = !!store.apiKey;
    board.briefing({
      lesson: L, variant: v, cast: cast.map((c) => c.char), live,
      note: mic.state !== 'on' && live ? '🎙️ The microphone is not available — allow it in the browser to talk with Gemini Live.' : null,
      onPractice: () => start(L, v, 'practice'), onReal: () => start(L, v, 'real'), onBack: () => goTown(),
    });
    await stage.fade(0, 450);
  }

  async function start(L, v, mode = 'practice') {
    board.hide();
    state.where = 'talk';
    state.mode = mode === 'real' && store.apiKey ? 'real' : 'practice';
    await sound.unlock();
    stage.ensureSpeakers();
    if (mic.state !== 'on') await mic.start();
    runner = new Runner({
      lesson: L, variant: v, stage, bubble, turn, toast, sound, mic, settings: store.settings, apiKey: store.apiKey, log,
      mode: state.mode,
      onDone: (res) => showReport(L, v, res, state.mode),
    });
    KT.runner = runner;
    follow.update(0, true);
    try { await runner.begin(); } catch (e) { KT.errors.push(String(e?.stack || e)); console.error(e); toast.show(`Error: ${e.message}`, 5000); }
  }

  function showReport(L, v, { report, turns, missions }, mode, { again = false } = {}) {
    state.where = 'report';
    if (!again) { store.record(v.id, report.stars, mode); sound.fanfare(report.stars); }
    boardMode = 'follow';
    boardFollow.update(0, true);
    // ITビジネス編 follows one story: offer the next episode (same pattern letter when it exists)
    const course = courses.find((c) => c.id === L.course);
    const next = L.course === 'it' ? course?.units.find((u) => u.no === L.no + 1) : null;
    const nextVariant = next ? next.variants[L.variants.indexOf(v)] || next.variants[0] : null;
    board.report({
      lesson: L, variant: v, report, turns, missions, mode,
      onRetry: () => openVariant(L, v),
      onReal: mode === 'practice' && store.apiKey ? () => openVariant(L, v) : null,
      onNext: nextVariant ? () => openVariant(next, nextVariant) : null,
      onOther: () => { board.hide(); goTown().then(() => showVariants(L)); },
      onTown: () => goTown(),
    });
    KT.lastReport = { report, turns, missions, mode, variant: v.id };
  }

  // ---------------------------------------------------------------- landing
  const landing = $('#landing');
  const vrBtn = $('#enter-vr');
  const pcBtn = $('#play-pc');
  const xrOk = await navigator.xr?.isSessionSupported?.('immersive-vr').catch(() => false);
  if (!xrOk) { vrBtn.disabled = true; vrBtn.title = 'WebXR is not available on this device'; }
  const keyState = () => {
    const ok = !!store.apiKey;
    $('#key-state').textContent = ok ? 'Gemini Live: ON ✓' : 'Gemini Live: OFF (offline practice) — add your key in せってい';
    $('#key-state').className = ok ? 'pill ok' : 'pill off';
  };
  keyState();

  async function begin(vr) {
    // Everything that needs the click's user activation starts synchronously here:
    // the VR session first, then audio, then the microphone (マイクは スタート時に オン —
    // it opens now and stays on for the whole session; the game only gates what is sent).
    const xr = vr ? app.enterVR().then(() => null, (e) => e) : Promise.resolve(null);
    const unlocked = sound.unlock();
    const micOk = mic.start();
    landing.classList.add('hide');
    document.body.classList.remove('landing');
    await unlocked;
    const [xrErr, okMic] = await Promise.all([xr, micOk]);
    if (xrErr) toast.show(`VR: ${xrErr.message}`, 4000);
    log('mic', mic.state);
    if (!okMic) toast.show(mic.state === 'denied' ? 'マイクが ブロックされています · Mic blocked' : 'マイクが ありません · No microphone', 4000);
    stage.ensureSpeakers();
    await goTown();
  }
  vrBtn.addEventListener('click', () => begin(true));
  pcBtn.addEventListener('click', () => begin(false));

  app.onXRChange = (on) => {
    if (!on && state.where !== 'title') $('#pc-hud').classList.add('show');
    if (on) { boardFollow.update(0, true); follow.update(0, true); }
  };
  app.onButton = () => openMenu();
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.where !== 'title') openMenu(); });
  $('#hud-town').addEventListener('click', () => goTown());
  $('#hud-settings').addEventListener('click', () => openSettings());

  function openMenu() {
    if (state.where === 'town' || state.where === 'title' || state.menu) return;
    const prev = { draw: board.panel.drawFn, visible: board.panel.visible, mode: boardMode, h: board.panel.canvas.height };
    state.menu = true;
    boardMode = 'follow'; boardFollow.update(0, true);
    const resume = () => {
      state.menu = false;
      boardMode = prev.mode;
      if (prev.visible && prev.draw) { board.panel.setHeight(prev.h); board.panel.draw(prev.draw); } else board.hide();
    };
    board.message('メニュー · Menu', 'Go back to the town square, or keep going here.', [
      { label: 'つづける · Resume', onClick: resume },
      { label: 'まちへ · Town', onClick: () => { state.menu = false; goTown(); }, color: '#a9cdf0', fg: '#5b4636' },
    ]);
  }

  // --------------------------------------------------------------- settings
  const dlg = $('#settings');
  function openSettings() {
    $('#set-key').value = store.apiKey;
    $('#set-name').value = store.settings.name;
    $('#set-display').value = store.settings.display;
    $('#set-romaji').checked = store.settings.romaji;
    $('#set-english').checked = store.settings.english;
    $('#set-rate').value = String(store.settings.rate);
    $('#set-slow').checked = store.settings.slowSpeaker;
    $('#set-music').checked = store.settings.music;
    $('#set-model').innerHTML = ['', ...LIVE_MODELS].map((m) => `<option value="${m}">${m || 'auto (newest first)'}</option>`).join('');
    $('#set-model').value = store.settings.model;
    dlg.showModal();
  }
  $('#open-settings').addEventListener('click', openSettings);
  $('#set-save').addEventListener('click', (e) => {
    e.preventDefault();
    store.apiKey = $('#set-key').value;
    Object.assign(store.settings, {
      name: $('#set-name').value.trim(), display: $('#set-display').value, romaji: $('#set-romaji').checked,
      english: $('#set-english').checked, rate: Number($('#set-rate').value) || 1, slowSpeaker: $('#set-slow').checked,
      music: $('#set-music').checked, model: $('#set-model').value,
    });
    store.saveSettings();
    keyState();
    dlg.close();
  });
  $('#set-cancel').addEventListener('click', (e) => { e.preventDefault(); dlg.close(); });
  $('#key-test').addEventListener('click', async (e) => {
    e.preventDefault();
    const out = $('#key-result');
    const key = $('#set-key').value.trim();
    if (!key) { out.textContent = 'Paste a key first.'; return; }
    out.textContent = 'Testing…';
    const { connectLive } = await import('./talk/live.js');
    const res = await connectLive({ apiKey: key, setup: { generationConfig: { responseModalities: ['AUDIO'] } } });
    if (res.ok) { out.textContent = `✓ OK — ${res.model}`; res.session.close(); }
    else out.textContent = `✗ ${res.reason} (${res.tried.join(', ')})`;
  });

  // backdrop: the town square behind the title screen
  await stage.load('hub', { time: timeOfDay(), season: season(), weather: 'clear' }, []);
  board.panel.mesh.position.copy(stage.built.boardAnchor);
  showLessons();
  app.yaw = 0.35; app.pitch = 0.05; app._applyLook();
  document.body.classList.add('ready');
  KT.ready = true;

  KT.open = (vId) => { const L = units.find((x) => x.variants.some((v) => v.id === vId)); return openVariant(L, L.variants.find((v) => v.id === vId)); };
  KT.start = (mode = 'practice') => start(state.lesson, state.variant, mode);
  KT.goTown = goTown;
  KT.showCourse = (id) => { state.course = id; showLessons(); };

  // test hook: jump straight into a variant (?play=l01a)
  const q = new URLSearchParams(location.search);
  if (q.get('play')) {
    const vId = q.get('play');
    const L = units.find((x) => x.variants.some((v) => v.id === vId));
    if (L) { landing.classList.add('hide'); document.body.classList.remove('landing'); await openVariant(L, L.variants.find((v) => v.id === vId)); }
  }
}

function timeOfDay() {
  const forced = new URLSearchParams(location.search).get('time');
  if (forced) return forced;
  const h = new Date().getHours();
  return h < 10 ? 'morning' : h < 16 ? 'noon' : h < 19 ? 'evening' : 'night';
}
function season() {
  const m = new Date().getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m <= 8 && m >= 6 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

boot().catch((e) => { KT.errors.push(String(e?.stack || e)); console.error(e); const n = document.querySelector('#boot-error'); if (n) n.textContent = `Error: ${e.message}`; });
void THREE;
