// main.js — DREAM DRIFT: boots the renderer, runs the title attract mode, the menus (controller, keyboard,
// touch or hand cursor), races and the four-course Grand Prix. Test hooks live on window.DD.
import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { HandTracker } from './engine/hands.js';
import { GameAudio } from './engine/audio.js';
import { disposeTree, makeRng } from './engine/util.js';
import { buildWorld } from './track/world.js';
import { Race, POINTS } from './race/race.js';
import { RaceCamera } from './race/camera.js';
import { SPEED_CLASSES } from './race/kart.js';
import { CHARACTERS, charById, renderPortraits } from './race/characters.js';
import { COURSES, TITLE_MUSIC } from './courses/index.js';
import { Hud, fmtTime } from './ui/hud.js';
import { Nav } from './ui/nav.js';
import { XRManager } from './vr/xr.js';
import { VRInput } from './vr/vrinput.js';
import { VRCockpit } from './vr/cockpit.js';

const DD = window.DD;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------------------------
// settings
const SETTINGS_KEY = 'dreamdrift.settings.v1';
const settings = { music: 0.6, sfx: 0.85, quality: 'high', sens: 1, mode: 'gp', cls: 'normal', cpu: 7, laps: 3, char: 'luna', vrView: 'first', vrVignette: 'on' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };
if (params.get('quality')) settings.quality = params.get('quality');
if (params.get('cpu')) settings.cpu = Math.max(0, Math.min(7, Number(params.get('cpu'))));
if (params.get('laps')) settings.laps = Number(params.get('laps'));
if (params.get('cls')) settings.cls = params.get('cls');
if (params.get('char')) settings.char = params.get('char');

// ---------------------------------------------------------------------------------------------
// core objects
const renderer = new Renderer($('gl'), settings.quality);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.3, 2400);
const raceCam = new RaceCamera(camera);
const input = new Input();
const hands = new HandTracker();
hands.interp.opts.sensitivity = settings.sens;
input.hands = hands;
const audio = new GameAudio();
audio.setVolumes(settings.music, settings.sfx);
if (params.has('nosound')) audio.setMuted(true);
const nav = new Nav({ audio });
const xr = new XRManager(renderer);
const vrInput = new VRInput(renderer);
let cockpit = null;
let portraits = new Map();
const portraitImgs = new Map();
let hud = null;
const inVR = () => xr.presenting;
const vrWorldPos = new THREE.Vector3();

const state = {
  screen: 'loading', control: 'pad', inRace: false, paused: false, freeCam: null,
  world: null, race: null, me: null, courseIdx: 0,
  gp: null, attractIdx: Number(params.get('attract') || 0), resultsTimer: 0, loadToken: 0, goingTitle: false,
  fps: 60, fpsAcc: 0, fpsN: 0, fpsT: 0, lowT: 0,
  history: [],
};
let raceSeed = Number(params.get('seed') || Date.now() % 100000);

// ---------------------------------------------------------------------------------------------
// screens
const BACK = { 's-control': 's-title', 's-hands': 's-control', 's-setup': 's-control', 's-char': 's-setup', 's-course': 's-char', 's-settings': 's-title' };
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
  state.screen = id || 'race';
  nav.setRoot(id ? $(id) : null);
  if (id === 's-pause' || id === 's-results' || id === 's-gp') return;
  if (!id) $('cursor').classList.remove('on');
}
function toast(text, ms = 2600) {
  const t = $('toast'); t.textContent = text; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), ms);
}

input.onMenu = (a) => {
  audio.unlock();
  if (state.screen === 'race') {
    if (a === 'pause' && state.inRace) pause(true);
    return;
  }
  if (state.screen === 's-loading') return;
  if (a === 'ok') { nav.press(); return; }
  if (a === 'back' || a === 'pause') {
    if (state.screen === 's-pause') { pause(false); return; }
    const b = BACK[state.screen];
    if (b) { audio.play('back'); go(b); }
    return;
  }
  nav.move(a);
};
input.onPad = (name) => updatePadStatus(name);
function updatePadStatus(name) {
  const el = $('pad-status');
  el.textContent = name ? `コントローラ：接続中（${name.replace(/\(.*?\)/g, '').trim().slice(0, 40)}）` : 'コントローラ：未接続（ボタンを 押すと 認識）';
  el.classList.toggle('ok', !!name);
}

function go(id) {
  if (id === 's-title') { goTitle(); return; }
  showScreen(id);
  if (id === 's-setup') refreshSetup();
  if (id === 's-char') refreshChar();
}

// click handling for every [data-act] / [data-val] button
document.addEventListener('click', (e) => {
  audio.unlock();
  const el = e.target.closest('[data-act], [data-val], [data-char], [data-course]');
  if (!el) return;
  if (el.dataset.val !== undefined) {
    const grp = el.closest('[data-group]').dataset.group;
    for (const b of el.parentElement.querySelectorAll('[data-val]')) b.classList.toggle('on', b === el);
    if (grp === 'laps') settings.laps = Number(el.dataset.val);
    else if (grp === 'quality') { settings.quality = el.dataset.val; renderer.setQuality(settings.quality); }
    else settings[grp] = el.dataset.val;
    saveSettings();
    audio.play('select');
    return;
  }
  if (el.dataset.char) { settings.char = el.dataset.char; saveSettings(); refreshChar(); audio.play('select'); return; }
  if (el.dataset.course !== undefined) { audio.play('confirm'); startRace(Number(el.dataset.course)); return; }
  act(el.dataset.act);
});

function act(a) {
  switch (a) {
    case 'start': audio.play('confirm'); go('s-control'); break;
    case 'settings': audio.play('confirm'); go('s-settings'); break;
    case 'back': audio.play('back'); go(BACK[state.screen] || 's-title'); break;
    case 'ctl-pad':
      audio.play('confirm');
      state.control = 'pad'; input.handMode = false;
      go('s-setup');
      break;
    case 'ctl-hands':
      audio.play('confirm');
      state.control = 'hands';
      go('s-hands');
      startHands();
      break;
    case 'hands-ok': audio.play('confirm'); input.handMode = hands.ready; go('s-setup'); break;
    case 'ctl-vr':
      if (!xr.supported) { audio.play('back'); toast('この ブラウザでは VR が 使えません。Meta Quest の ブラウザで 開いてね'); break; }
      audio.play('confirm');
      state.control = 'vr'; input.handMode = false;
      go('s-setup');
      break;
    case 'vr-view':
      settings.vrView = settings.vrView === 'first' ? 'third' : 'first'; saveSettings();
      if (inVR() && state.race && state.me) { cockpit.setKart(state.me, settings.vrView); cockpit.needCenter = 2; if (state.paused) vrPauseMenu(); }
      break;
    case 'cpu-': settings.cpu = Math.max(0, settings.cpu - 1); saveSettings(); refreshSetup(); audio.play('select'); break;
    case 'cpu+': settings.cpu = Math.min(7, settings.cpu + 1); saveSettings(); refreshSetup(); audio.play('select'); break;
    case 'setup-ok': audio.play('confirm'); go('s-char'); break;
    case 'char-ok':
      audio.play('confirm');
      if (settings.mode === 'gp') startGP(); else { buildCourseGrid(); go('s-course'); }
      break;
    case 'resume': pause(false); break;
    case 'restart': audio.play('confirm'); pause(false, true); startRace(state.courseIdx, true); break;
    case 'quit': audio.play('back'); pause(false, true); if (inVR()) xr.exit(); goTitle(); break;
    case 'next': audio.play('confirm'); nextGPRace(); break;
    case 'again': audio.play('confirm'); startRace(state.courseIdx); break;
    case 'courses': audio.play('confirm'); buildCourseGrid(); go('s-course'); break;
    case 'gp-final': audio.play('confirm'); showGPFinal(); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------------------------
// hand tracking setup screen
function startHands() {
  const st = $('hand-status');
  $('hands-ok').disabled = true;
  hands.start((s, err) => {
    st.textContent = s === 'camera' ? 'カメラを 起動しています…（許可を 求められたら「許可」）'
      : s === 'model' ? '手の 認識モデルを 読みこみ中…'
        : s === 'ready' ? '準備 OK！ 手を カメラに 映してね'
          : s === 'error' ? `カメラが 使えません：${err}` : '';
    $('hands-ok').disabled = s !== 'ready';
    if (s === 'ready' && state.screen === 's-hands') nav.setFocus($('hands-ok'), false);
    if (s === 'error') toast('カメラが 使えないので、コントローラ・キーボードで あそべます');
  });
}
function updateHandSetup() {
  if (state.screen !== 's-hands' || !hands.ready) return;
  hands.drawPreview($('setup-cam'), hands.ctl.steer);
  const s = hands.ctl.steer;
  const m = $('setup-meter');
  m.style.left = s >= 0 ? '50%' : `${50 + s * 50}%`;
  m.style.width = `${Math.abs(s) * 50}%`;
  const poses = hands.ctl.poses || [];
  $('g-wheel').classList.toggle('live', hands.hands.length > 0 && Math.abs(s) > 0.15);
  $('g-go').classList.toggle('live', hands.hands.length > 0);
  $('g-peace').classList.toggle('live', poses.includes('peace'));
  $('g-pinch').classList.toggle('live', hands.cursor.pinch);
  const n = hands.hands.length;
  $('hand-status').textContent = n === 0 ? '手が 見えません。カメラの 前に 両手を 出してね'
    : n === 1 ? '片手 モード：手を かたむけて ハンドル' : `両手で ハンドル！ ${s > 0.15 ? '→ 右' : s < -0.15 ? '← 左' : 'まっすぐ'}`;
}

// ---------------------------------------------------------------------------------------------
// setup / character / course screens
function refreshSetup() {
  for (const grp of ['mode', 'cls', 'laps']) {
    for (const b of document.querySelectorAll(`[data-group="${grp}"] [data-val]`)) b.classList.toggle('on', String(settings[grp]) === b.dataset.val);
  }
  $('cpu-num').textContent = settings.cpu;
  $('cpu-dots').innerHTML = '<i style="background:#ffd93b"></i>' + Array.from({ length: settings.cpu }, () => '<i style="background:#8a5cff"></i>').join('');
}
function buildCharGrid() {
  const grid = $('chargrid');
  grid.innerHTML = CHARACTERS.map((c) => `<button class="ch" data-nav data-char="${c.id}" style="--c:${c.kart}"><img alt="${c.name}" src="${portraits.get(c.id) || ''}"><div class="nm outline">${c.name}</div></button>`).join('');
}
function refreshChar() {
  for (const b of document.querySelectorAll('[data-char]')) b.classList.toggle('on', b.dataset.char === settings.char);
  const c = charById(settings.char);
  const bar = (v) => `<span class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'f' : ''}"></i>`).join('')}</span>`;
  $('chinfo').innerHTML = `<div class="sp">${c.species}</div><h3 class="outline" style="color:${c.kart}">${c.name}</h3><div style="font-weight:500;opacity:.9">${c.line}</div>
    <div class="stat">スピード ${bar(c.speed)}</div><div class="stat">加速 ${bar(c.accel)}</div><div class="stat">ハンドル ${bar(c.handling)}</div><div class="stat">重さ ${bar(Math.round(1 + (c.weight - 0.8) / 0.15))}</div>`;
}
function buildCourseGrid() {
  $('coursegrid').innerHTML = COURSES.map((c, i) => `<button class="course" data-nav data-course="${i}">
    <div class="img" style="background-image:url(img/course-${c.id}.jpg), linear-gradient(135deg, ${c.theme.sky.top}, ${c.theme.sky.horizon})"></div>
    <div class="tx"><div class="no">COURSE ${i + 1}</div><h3>${c.name}</h3><p>${c.tagline}</p></div></button>`).join('');
}

// ---------------------------------------------------------------------------------------------
// worlds and races
function disposeWorld() {
  cockpit?.detach();
  if (state.race) { state.race.dispose(); state.race = null; }
  if (state.world) { disposeTree(state.world.scene); state.world = null; }
}

function loadCourse(idx) {
  disposeWorld();
  const course = COURSES[idx];
  state.world = buildWorld(course, { shadowSize: renderer.q.shadowSize });
  renderer.setScene(state.world.scene, camera, course.theme.bloom);
  return course;
}

// run fn (building a course) once the loading screen has had a chance to show. Inside a VR session the page's
// own animation frames stop (only the headset's run), so this must not wait on requestAnimationFrame alone —
// it did, and the next race only loaded once you took the headset off. A newer call cancels an older one.
function afterLoadingShown(fn) {
  const token = ++state.loadToken;
  let done = false;
  const run = () => { if (done || token !== state.loadToken) return; done = true; fn(); };
  if (inVR()) setTimeout(run, 150); // a few headset frames show the "loading" message first
  else { requestAnimationFrame(() => setTimeout(run, 30)); setTimeout(run, 400); }
}

function goTitle() {
  if (inVR()) xr.exit();
  cockpit?.closeMenu();
  state.inRace = false; state.gp = null; state.paused = false; state.goingTitle = true;
  hud?.show(false);
  $('touch').classList.remove('show');
  showScreen('s-loading');
  afterLoadingShown(() => {
    state.goingTitle = false;
    const idx = state.attractIdx++ % COURSES.length;
    const course = loadCourse(idx);
    const rng = makeRng(raceSeed++);
    const chars = [...CHARACTERS].sort(() => rng.next() - 0.5);
    state.race = new Race({ scene: state.world.scene, course, track: state.world.track, entrants: chars.map((c) => ({ char: c })), cls: SPEED_CLASSES.normal, laps: 99, seed: raceSeed, attract: true });
    state.me = null;
    raceCam.cut.t = 0;
    audio.playMusic(TITLE_MUSIC);
    audio.setTempo(1);
    audio.engine(false);
    showScreen('s-title');
    DD.ready = true;
  });
}

function entrantsFor(courseIdx) {
  const me = charById(settings.char);
  let grid;
  if (state.gp && state.gp.roster) {
    // later Grand Prix races keep the same rivals; the points leader starts at the back
    const pts = (c) => state.gp.totals.get(c.id) || 0;
    grid = state.gp.roster.map((id) => charById(id)).sort((a, b) => pts(a) - pts(b));
  } else {
    const rng = makeRng(raceSeed + courseIdx * 13);
    const others = CHARACTERS.filter((c) => c.id !== me.id).sort(() => rng.next() - 0.5).slice(0, settings.cpu);
    grid = [...others, me];
  }
  const seat = state.control === 'vr' && settings.vrView === 'first';
  return grid.map((c) => ({ char: c, human: c.id === me.id, vrSeat: seat && c.id === me.id }));
}

function startRace(idx, restart = false) {
  state.courseIdx = idx;
  state.inRace = false;
  // VR: the headset session has to be requested inside this click
  if (state.control === 'vr' && xr.supported && !inVR()) {
    xr.enter().catch((e) => {
      toast(`VR を はじめられませんでした（${e && e.message || e}）`);
      state.control = 'pad';
      renderer.setQuality(settings.quality);
    });
  }
  showScreen('s-loading');
  hud?.show(false);
  cockpit?.closeMenu();
  if (inVR()) cockpit.message('よみこみ中…', { size: 130, dur: 30 });
  if (state.control === 'vr' && renderer.qname !== 'vr') renderer.setQuality('vr');
  afterLoadingShown(() => {
    const course = loadCourse(idx);
    const entrants = entrantsFor(idx);
    if (state.gp && !state.gp.roster) state.gp.roster = entrants.map((e) => e.char.id);
    if (!restart) raceSeed++;
    const race = state.race = new Race({
      scene: state.world.scene, course, track: state.world.track, entrants,
      cls: SPEED_CLASSES[settings.cls] || SPEED_CLASSES.normal, laps: settings.laps, seed: raceSeed,
      autoplay: params.has('autoplay'),
    });
    state.me = race.karts.find((k) => k.isHuman);
    race.on(onRaceEvent);
    raceCam.snap(state.me);
    raceCam.t = 0;
    hud.setup(race, state.me, course, state.control === 'hands' && hands.ready);
    hud.showBanner(`${state.gp ? `グランプリ ${state.gp.index + 1}/4 ・ ` : ''}COURSE ${idx + 1}`, course.name, true);
    hud.show(state.control !== 'vr');
    if (state.control === 'vr') {
      cockpit.attach(state.world.scene);
      cockpit.setKart(state.me, settings.vrView);
      cockpit.vignetteOn = settings.vrVignette !== 'off';
      cockpit.message(course.name, { sub: `${state.gp ? `グランプリ ${state.gp.index + 1}/4 ・ ` : ''}COURSE ${idx + 1}`, size: 110, dur: 3.4 });
      if (inVR()) cockpit.needCenter = 3;
    }
    $('touch').classList.toggle('show', state.control === 'pad' && matchMedia('(pointer: coarse)').matches);
    document.body.classList.toggle('touch-mode', $('touch').classList.contains('show'));
    audio.playMusic(course.music);
    audio.setTempo(1);
    state.inRace = true; state.paused = false; state.resultsTimer = 0;
    showScreen(null);
    if (params.has('skipintro')) race.skipIntro();
  });
}

function startGP() {
  state.gp = { index: 0, totals: new Map(), results: [], roster: null };
  startRace(0);
}
function nextGPRace() {
  state.gp.index++;
  if (state.gp.index >= COURSES.length) { showGPFinal(); return; }
  startRace(state.gp.index);
}

function pause(on, silent = false) {
  if (!state.inRace) return;
  state.paused = on;
  if (on) {
    audio.engine(false); audio.play('back'); showScreen('s-pause');
    if (inVR()) vrPauseMenu();
  } else {
    if (!silent) audio.play('confirm');
    showScreen(null);
    cockpit?.closeMenu();
  }
}
function vrPauseMenu() {
  cockpit.openMenu({
    title: 'ポーズ',
    sub: '右スティック押しこみで 視点を 正面に もどせます',
    buttons: [{ id: 'resume', label: 'つづける', primary: true }, { id: 'vr-view', label: settings.vrView === 'first' ? '後ろから 見る' : '運転席から 見る' }, { id: 'restart', label: 'やり直す' }, { id: 'quit', label: 'おわる' }],
  }, (id) => act(id));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.inRace && !state.paused && state.race && state.race.phase !== 'done') pause(true);
});
$('h-pause').addEventListener('click', (e) => { e.stopPropagation(); if (state.inRace && !state.paused) pause(true); });

// ---------------------------------------------------------------------------------------------
// race events → HUD and sound
function onRaceEvent(type, d) {
  const me = state.me;
  const mine = d.kart === me;
  if (inVR()) vrEvent(type, d, me, mine);
  switch (type) {
    case 'count': hud.flash(String(d.n), '', 0.95); audio.play('count'); if (d.n === 3) hud.showBanner('', '', false); break;
    case 'go': hud.flash('GO!', 'go', 1.1); audio.play('go'); if (me.rocket) { audio.play('boost'); hud.flash('ロケットスタート！', 'go small', 1.3); } break;
    case 'lap':
      if (d.final) { hud.flash('ファイナルラップ！', 'small', 1.6); audio.play('finallap'); audio.setTempo(1.1); }
      else { hud.flash(`LAP ${d.lap}`, 'small', 1.2); audio.play('lap'); }
      break;
    case 'finish':
      hud.flash(`GOAL!  ${d.place}位`, 'go', 2.4);
      audio.play('finish', d.place);
      audio.engine(false);
      break;
    case 'done': state.resultsTimer = 2.2; break;
    case 'itemget': if (mine) audio.play('itemget'); break;
    case 'itemready': if (mine) audio.play('itemready'); break;
    case 'use': if (mine) audio.play(d.item === 'triple' || d.item === 'boost' ? 'boost' : 'use_' + d.item); break;
    case 'shothit': case 'trap':
      if (mine && d.hurt) { audio.play('hit'); raceCam.addShake(0.9); input.rumble(1, 260); }
      else if (d.by === me && d.hurt) { hud.flash('ヒット！', 'small', 0.9); audio.play('trick'); }
      break;
    case 'bump':
      if (d.a === me || d.b === me) {
        const j = Math.min(1, d.power / 9);
        audio.play('bump', j); raceCam.addShake(0.3 + 0.6 * j); input.rumble(0.45 + 0.55 * j, 90 + 80 * j);
      }
      break;
    case 'pad': if (mine) audio.play('pad'); break;
    case 'jump': if (mine) audio.play('jump'); break;
    default:
      if (type.startsWith('kart:') && mine) {
        const e = type.slice(5);
        if (e === 'hop') audio.play('hop');
        else if (e.startsWith('miniturbo')) audio.play('miniturbo', Number(e.slice(-1)));
        else if (e.startsWith('driftlevel')) audio.play('driftlevel', Number(e.slice(-1)));
        else if (e === 'wall') { audio.play('wall'); raceCam.addShake(0.6); input.rumble(0.8, 140); }
        else if (e === 'shieldpop') audio.play('shieldpop');
        else if (e === 'trick') { audio.play('trick'); hud.flash('トリック！', 'small', 0.8); }
        else if (e === 'respawn') audio.play('respawn');
      }
  }
}

// the same events inside the headset: big messages and controller rumble
function vrEvent(type, d, me, mine) {
  const rum = (s, ms) => vrInput.rumble(s, ms, xr.session);
  switch (type) {
    case 'count': cockpit.message(String(d.n), { dur: 0.95 }); break;
    case 'go': cockpit.message(me.rocket ? 'ロケットスタート！' : 'GO!', { color: '#ffd93b', size: me.rocket ? 140 : 230 }); if (me.rocket) rum(0.6, 250); break;
    case 'lap': cockpit.message(d.final ? 'ファイナルラップ！' : `LAP ${d.lap}`, { size: d.final ? 140 : 190, dur: 1.5 }); break;
    case 'finish': cockpit.message('GOAL!', { color: '#ffd93b', sub: `${d.place}位`, dur: 3 }); rum(0.5, 300); break;
    case 'shothit': case 'trap':
      if (mine && d.hurt) rum(1, 350);
      else if (d.by === me && d.hurt) cockpit.message('ヒット！', { size: 130, dur: 0.9 });
      break;
    case 'bump': if (d.a === me || d.b === me) rum(0.5 + 0.5 * Math.min(1, d.power / 9), 110); break;
    case 'pad': case 'jump': if (mine) rum(0.35, 120); break;
    case 'itemready': if (mine) rum(0.2, 40); break;
    default:
      if (type.startsWith('kart:') && mine) {
        const e = type.slice(5);
        if (e === 'wall') rum(0.8, 130);
        else if (e.startsWith('miniturbo')) rum(0.4, 140);
        else if (e.startsWith('driftlevel')) rum(0.15, 30);
        else if (e === 'trick') cockpit.message('トリック！', { size: 130, dur: 0.8 });
      }
  }
}

// ---------------------------------------------------------------------------------------------
// results
function showResults() {
  const race = state.race, me = state.me;
  state.inRace = false;
  audio.engine(false);
  const order = race.standings();
  const gp = state.gp;
  if (gp) {
    order.forEach((k, i) => gp.totals.set(k.char.id, (gp.totals.get(k.char.id) || 0) + (POINTS[i] || 0)));
    gp.results.push(order.map((k) => k.char.id));
  }
  $('res-title').textContent = `${me.place}位 ${me.place === 1 ? '— 優勝！' : me.place <= 3 ? '— 表彰台！' : ''}`;
  $('res-table').innerHTML = order.map((k, i) => `<div class="rrow ${k === me ? 'me' : ''}">
    <span class="pl outline" style="color:${['#ffd93b', '#e6ecff', '#ffb070'][i] || '#fff'}">${i + 1}</span>
    <img alt="" src="${portraits.get(k.char.id) || ''}"><span>${k.char.name}</span>
    <span class="tm">${k.estimated ? '— —' : fmtTime(k.finishTime)}</span>
    <span class="pt">${gp ? `+${POINTS[i] || 0}　計 ${gp.totals.get(k.char.id)}` : ''}</span></div>`).join('');
  const btns = gp
    ? (gp.index < COURSES.length - 1 ? '<button class="btn primary big" data-nav data-act="next">つぎの レースへ</button>' : '<button class="btn primary big" data-nav data-act="gp-final">総合結果へ</button>') + '<button class="btn" data-nav data-act="quit">タイトルへ</button>'
    : '<button class="btn primary big" data-nav data-act="again">もう一度</button><button class="btn" data-nav data-act="courses">コースを えらぶ</button><button class="btn" data-nav data-act="quit">タイトルへ</button>';
  $('res-btns').innerHTML = btns;
  showScreen('s-results');
  if (inVR()) {
    cockpit.openMenu({
      title: `${me.place}位 ${me.place === 1 ? '— 優勝！' : me.place <= 3 ? '— 表彰台！' : ''}`,
      rows: order.map((k, i) => ({ text: `${i + 1}  ${k.char.name}`, right: (k.estimated ? '— —' : fmtTime(k.finishTime)) + (gp ? `　+${POINTS[i] || 0}（計 ${gp.totals.get(k.char.id)}）` : ''), me: k === me, img: portraitImgs.get(k.char.id) })),
      buttons: gp
        ? [gp.index < COURSES.length - 1 ? { id: 'next', label: 'つぎの レースへ', primary: true } : { id: 'gp-final', label: '総合結果へ', primary: true }, { id: 'quit', label: 'おわる' }]
        : [{ id: 'again', label: 'もう一度', primary: true }, { id: 'quit', label: 'おわる' }],
    }, (id) => act(id));
  }
}

function showGPFinal() {
  const gp = state.gp;
  const ids = [...gp.totals.keys()].sort((a, b) => gp.totals.get(b) - gp.totals.get(a));
  const myId = settings.char;
  const myPlace = ids.indexOf(myId) + 1;
  $('gp-title').textContent = myPlace === 1 ? 'グランプリ 優勝！ おめでとう！' : `グランプリ 総合 ${myPlace}位`;
  const pod = [ids[1], ids[0], ids[2]].map((id, j) => {
    if (!id) return '<div></div>';
    const pl = [2, 1, 3][j], h = [90, 130, 64][j], col = ['#c9d2ff', '#ffd93b', '#ffb070'][j];
    return `<div><img alt="" src="${portraits.get(id) || ''}"><div class="outline">${charById(id).name}</div><div class="blk outline" style="height:${h}px;background:${col};color:#fff">${pl}</div></div>`;
  }).join('');
  $('gp-podium').innerHTML = pod;
  $('gp-table').innerHTML = ids.map((id, i) => `<div class="rrow ${id === myId ? 'me' : ''}"><span class="pl outline">${i + 1}</span><img alt="" src="${portraits.get(id) || ''}"><span>${charById(id).name}</span><span class="tm">${gp.results.map((r) => r.indexOf(id) + 1 + '位').join(' ・ ')}</span><span class="pt">${gp.totals.get(id)} pt</span></div>`).join('');
  audio.play('finish', myPlace);
  showScreen('s-gp');
  if (inVR()) {
    cockpit.openMenu({
      title: myPlace === 1 ? 'グランプリ 優勝！' : `グランプリ 総合 ${myPlace}位`,
      rows: ids.map((id, i) => ({ text: `${i + 1}  ${charById(id).name}`, right: `${gp.totals.get(id)} pt`, me: id === myId, img: portraitImgs.get(id) })),
      buttons: [{ id: 'quit', label: 'おわる', primary: true }],
    }, (id) => act(id));
  }
}

// ---------------------------------------------------------------------------------------------
// main loop
const STEP = 1 / 120;
let last = performance.now(), elapsed = 0;
const humanCtl = new Map();

// advance the race by exactly this frame's time, in equal sub-steps of at most 1/120 s. (A fixed step with a
// carried-over remainder made the karts move in uneven jumps against the display's refresh — 60, 120 or 144 Hz —
// which shook the whole picture.)
function stepRace(race, dt, ctl) {
  const n = Math.min(12, Math.max(1, Math.ceil(dt / STEP - 1e-6)));
  const h = dt / n;
  for (let i = 0; i < n; i++) race.step(h, ctl);
}

function frame(now) {
  const raw = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, raw);
  last = now;
  elapsed += dt;
  try { tick(dt, raw); } catch (e) { reportError(e); }
}

function tick(dt, raw = dt) {
  const vr = inVR();
  let ctl = input.poll(dt);
  if (hands.ready) hands.poll();
  if (vr) {
    ctl = vrInput.poll(dt, xr.session);
    if (vrInput.pauseEdge && state.inRace && state.race && state.race.phase !== 'done') pause(!state.paused);
    if (vrInput.recenterEdge) cockpit.recenter();
    if (cockpit.needCenter > 0 && --cockpit.needCenter === 0) cockpit.recenter();
  }
  const race = state.race;
  if (race && !state.paused) {
    humanCtl.clear();
    if (state.me) humanCtl.set(state.me, ctl);
    stepRace(race, dt, humanCtl);
    race.frame(dt);
  }
  if (race) {
    const me = state.me;
    let mode = 'attract';
    if (me) mode = race.phase === 'intro' ? 'intro' : me.finished ? 'finish' : 'chase';
    let camPos = camera.position;
    if (vr && me && cockpit.kart === me) {
      cockpit.update(dt, race, ctl);
      camPos = cockpit.worldPosition(vrWorldPos);
    } else if (state.freeCam) { camera.position.copy(state.freeCam.pos); camera.lookAt(state.freeCam.look); camera.fov = state.freeCam.fov; camera.updateProjectionMatrix(); }
    else if (!state.paused && !vr) raceCam.update(dt, race, me || race.karts[0], mode);
    if (!state.freeCam) race.cameraCull(camPos);
    const focus = state.freeCam ? state.freeCam.look : me ? me.pos : race.karts[raceCam.cut.kart]?.pos;
    state.world.update(dt, elapsed, vr ? { position: camPos } : camera, focus);
    const sh = vr ? 1800 : renderer.r.getDrawingBufferSize(new THREE.Vector2()).y;
    race.parts.add.setScale(sh, vr ? 100 : camera.fov); race.parts.soft.setScale(sh, vr ? 100 : camera.fov);
    if (me && state.inRace && !state.paused) {
      audio.engine(race.phase !== 'intro' && !me.finished, Math.max(0, me.speed) / me.maxSpeed, me.boost > 0, me.drift.active);
      if (!vr) hud.update(dt, race, me, state.control === 'hands' ? hands : null, audio);
      else if (me.roulette > 0) { cockpit.tickT = (cockpit.tickT || 0) - dt; if (cockpit.tickT <= 0) { cockpit.tickT = 0.07; audio.play('tick'); } }
      if (race.phase === 'intro' && (ctl.item || ctl.drift) && race.phaseT > 0.6) race.skipIntro();
    }
    if (race.phase === 'done' && state.inRace && state.resultsTimer > 0) {
      state.resultsTimer -= dt;
      if (state.resultsTimer <= 0) showResults();
    }
  }
  if (state.screen !== 'race') nav.updateHand(dt, hands);
  updateHandSetup();
  renderer.render();
  measure(Math.min(raw, 2));
}

function measure(dt) {
  state.fpsAcc += dt; state.fpsN++;
  if (state.fpsAcc >= 1) {
    state.fps = state.fpsN / state.fpsAcc; state.fpsAcc = 0; state.fpsN = 0;
    if (state.inRace && !state.paused && !params.has('quality') && !inVR()) {
      state.lowT = state.fps < 40 ? state.lowT + 1 : 0;
      if (state.lowT >= 5 && renderer.qname !== 'low') {
        const next = renderer.qname === 'high' ? 'mid' : 'low';
        renderer.setQuality(next); settings.quality = next; saveSettings();
        toast(`動きが 重いので 画質を「${next === 'mid' ? '中' : '低'}」に 下げました`);
        state.lowT = 0;
      }
    }
  }
}

function reportError(e) {
  const msg = (e && (e.stack || e.message)) || String(e);
  if (DD.errors.length < 50) DD.errors.push(msg);
  if (!reportError.shown) { reportError.shown = true; console.error(e); }
}

// ---------------------------------------------------------------------------------------------
// boot
async function boot() {
  showScreen('s-loading');
  $('load-text').textContent = 'キャラクターを 準備中…';
  await new Promise((r) => setTimeout(r, 20));
  portraits = renderPortraits(256);
  hud = new Hud(portraits);
  buildCharGrid();
  refreshSetup();
  updatePadStatus(input.firstPad()?.id || '');
  input.bindTouch($('touch'));
  // settings sliders
  const sm = $('set-music'), ss = $('set-sfx'), se = $('set-sens');
  sm.value = settings.music; ss.value = settings.sfx; se.value = settings.sens;
  const vol = () => { settings.music = Number(sm.value); settings.sfx = Number(ss.value); audio.setVolumes(settings.music, settings.sfx); saveSettings(); };
  sm.addEventListener('input', vol); ss.addEventListener('input', vol);
  se.addEventListener('input', () => { settings.sens = Number(se.value); hands.interp.opts.sensitivity = settings.sens; vrInput.sens = settings.sens; saveSettings(); });
  for (const b of document.querySelectorAll('[data-group="quality"] [data-val]')) b.classList.toggle('on', b.dataset.val === renderer.qname);
  addEventListener('pointerdown', () => audio.unlock(), { once: false });
  // VR: the cockpit (needs the portraits for the result panels) and the session hooks
  for (const [id, url] of portraits) { const im = new Image(); im.src = url; portraitImgs.set(id, im); }
  cockpit = new VRCockpit({ camera, renderer, vrInput, portraits });
  vrInput.sens = settings.sens;
  xr.onStart = () => {
    cockpit.takeCamera();
    hud?.show(false);
    $('touch').classList.remove('show');
    if (state.race && state.me && state.control === 'vr') { cockpit.attach(state.world.scene); cockpit.setKart(state.me, settings.vrView); }
    cockpit.needCenter = 3;
  };
  xr.onEnd = () => {
    cockpit.releaseCamera();
    cockpit.closeMenu();
    renderer.setQuality(settings.quality);
    // back to the title — also when a race was still loading (it would start with no way to drive it)
    if (state.screen !== 's-title' && !state.goingTitle) { toast('VR を おわりました'); goTitle(); }
  };
  xr.onBlur = () => { if (state.inRace && !state.paused && state.race && state.race.phase !== 'done') pause(true); };
  xr.ready.then((ok) => {
    const card = $('ctl-vr-card');
    card.classList.toggle('na', !ok);
    $('vr-status').textContent = ok ? 'VR ヘッドセット：使えます' : 'この ブラウザでは 使えません（Meta Quest の ブラウザで 開いてね）';
    $('vr-status').classList.toggle('ok', ok);
  });
  for (const b of document.querySelectorAll('[data-group="vrView"] [data-val], [data-group="vrVignette"] [data-val]')) {
    const grp = b.closest('[data-group]').dataset.group;
    b.classList.toggle('on', b.dataset.val === settings[grp]);
  }
  renderer.r.setAnimationLoop(frame);

  if (params.has('course')) {
    // test / direct link: ?course=1..4 starts a free race at once
    settings.mode = 'free';
    startRace(Math.max(0, Math.min(COURSES.length - 1, Number(params.get('course')) - 1)));
    DD.ready = true;
  } else {
    goTitle();
    const sc = params.get('screen');
    if (sc) setTimeout(() => { if (sc === 's-course') buildCourseGrid(); go(sc); }, 200);
  }
}

// ---------------------------------------------------------------------------------------------
// test hooks
DD.debug = {
  state() {
    const r = state.race, me = state.me;
    const info = renderer.r.info;
    return {
      screen: state.screen, phase: r?.phase, fps: Math.round(state.fps), quality: renderer.qname,
      drawCalls: info.render.calls, triangles: info.render.triangles,
      raceTime: r?.raceTime, course: state.courseIdx,
      me: me && { place: me.place, lap: me.lap, raceDist: me.raceDist, speed: me.speed, finished: me.finished, item: me.item, x: me.pos.x, y: me.pos.y, z: me.pos.z, offroad: me.offroad },
      karts: r?.karts.map((k) => ({ id: k.char.id, place: k.place, lap: k.lap, dist: +k.raceDist.toFixed(1), finished: k.finished, time: k.finishTime, respawns: k.respawns || 0 })),
      errors: DD.errors.length,
    };
  },
  // run the physics without rendering (fast-forward). returns the state afterwards
  simulate(seconds, step = 1 / 60) {
    const r = state.race; if (!r) return null;
    r.skipIntro();
    const ctl = new Map();
    for (let t = 0; t < seconds; t += step) {
      if (state.me) ctl.set(state.me, { steer: 0, throttle: 1, brake: 0 });
      r.step(step, ctl);
      if (r.phase === 'done') break;
    }
    r.frame(0.016);
    return this.state();
  },
  skipIntro() { state.race?.skipIntro(); },
  hud(on) { hud?.show(on); },
  // fast-forward the cameras (title cuts, course intro, chase) and record frames where the lens is inside a
  // scenery object (bounding spheres of every mesh / instance outside the road and the race)
  sceneryProbe(seconds = 30, dt = 1 / 30) {
    const r = state.race; if (!r) return null;
    const spheres = [];
    const m = new THREE.Matrix4(), w = new THREE.Matrix4(), c = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion();
    state.world.scene.updateMatrixWorld(true);
    state.world.scene.traverse((o) => {
      if (!o.isMesh || o.name === 'sky') return;
      for (let p = o; p; p = p.parent) if (p.name === 'track' || p.name === 'race' || p.name === 'vr-rig') return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = g.boundingSphere;
      const add = (mat) => {
        w.copy(o.matrixWorld).multiply(mat); w.decompose(c, q, sc);
        const rad = bs.radius * Math.max(sc.x, sc.y, sc.z);
        if (rad > 60) return; // floors and sky-sized things
        const ctr = bs.center.clone().applyMatrix4(w);
        spheres.push([ctr.x, ctr.y, ctr.z, rad, o.name || o.parent?.name || g.type, o]);
      };
      if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); add(m); } else add(m.identity());
    });
    const hits = [];
    const ray = new THREE.Raycaster();
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
    const me = state.me, ctl = new Map(me ? [[me, { steer: 0, throttle: 1 }]] : []);
    for (let t = 0; t < seconds; t += dt) {
      r.step(dt, ctl); r.frame(dt);
      const mode = me ? (r.phase === 'intro' ? 'intro' : me.finished ? 'finish' : 'chase') : 'attract';
      raceCam.update(dt, r, me || r.karts[0], mode);
      const p = camera.position;
      const cand = new Set();
      for (const sp of spheres) if (Math.hypot(p.x - sp[0], p.y - sp[1], p.z - sp[2]) < sp[3]) cand.add(sp[5]);
      for (const o of cand) {
        // inside = most rays from the lens meet the inside (a back face) of this object first
        let inside = 0;
        for (const dir of DIRS) {
          ray.set(p, dir); ray.far = 80;
          const mats = Array.isArray(o.material) ? o.material : [o.material], sides = mats.map((mm) => mm.side);
          mats.forEach((mm) => { mm.side = THREE.DoubleSide; });
          const hit = ray.intersectObject(o, false)[0];
          mats.forEach((mm, i) => { mm.side = sides[i]; });
          if (hit && hit.face) {
            const n = hit.face.normal.clone().transformDirection(o.matrixWorld);
            if (n.dot(dir) > 0) inside++;
          }
        }
        if (inside >= 4) { hits.push([+t.toFixed(2), mode, o.name || o.parent?.name || o.geometry.type, inside]); break; }
      }
    }
    return { spheres: spheres.length, frames: Math.round(seconds / dt), hits };
  },
  // judder: run n display frames of dt (e.g. 1/144 with a little timing noise) through the real per-frame path
  // (physics stepping + camera) and measure how unevenly your kart moves across the screen (px, RMS of the
  // frame-to-frame change in its screen velocity)
  judderProbe(n = 240, dt = 1 / 144, noise = 0.0007) {
    const r = state.race, me = state.me; if (!r || !me) return null;
    r.skipIntro();
    const v = new THREE.Vector3(), pts = [];
    const H = 720, W = 1280;
    for (let i = 0; i < n; i++) {
      const d = dt + (Math.sin(i * 12.9898) * 43758.5453 % 1) * noise;
      stepRace(r, Math.max(0.001, d), new Map([[me, { steer: 0, throttle: 1 }]]));
      r.frame(d);
      raceCam.update(d, r, me, r.phase === 'intro' ? 'intro' : 'chase');
      camera.updateMatrixWorld(); camera.aspect = W / H; camera.updateProjectionMatrix();
      v.copy(me.pos); v.y += 1; v.project(camera);
      if (r.phase === 'race') pts.push([(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]);
    }
    let s2 = 0, k = 0;
    for (let i = 2; i < pts.length; i++) {
      const ax = pts[i][0] - 2 * pts[i - 1][0] + pts[i - 2][0], ay = pts[i][1] - 2 * pts[i - 1][1] + pts[i - 2][1];
      s2 += ax * ax + ay * ay; k++;
    }
    return { frames: pts.length, judderPx: +Math.sqrt(s2 / Math.max(1, k)).toFixed(3) };
  },
  // drive your kart with ctlFn(t) for n frames of dt (physics + chase camera, no rendering) and record
  // [t, kart heading, camera yaw, slip angle, speed, drifting, lateral offset d, half width]
  steerProbe(n, dt, ctlFn) {
    const r = state.race, me = state.me; if (!r || !me) return null;
    const ctl = { steer: 0, throttle: 1, brake: 0, drift: false, item: false }, map = new Map([[me, ctl]]);
    const fwd = new THREE.Vector3(), out = [];
    for (let i = 0; i < n; i++) {
      Object.assign(ctl, ctlFn(i * dt));
      stepRace(r, dt, map); r.frame(dt);
      raceCam.update(dt, r, me, r.phase === 'intro' ? 'intro' : 'chase');
      camera.getWorldDirection(fwd);
      const vh = Math.atan2(me.vel.x, me.vel.z);
      let slip = vh - me.heading; while (slip > Math.PI) slip -= 2 * Math.PI; while (slip < -Math.PI) slip += 2 * Math.PI;
      out.push([+(i * dt).toFixed(3), me.heading, Math.atan2(fwd.x, fwd.z), slip, me.speed, me.drift.active ? 1 : 0, me.loc.d, me.loc.hw]);
    }
    return out;
  },
  // render n frames at a fixed time step and return each as a PNG data URL (flicker analysis in tests)
  captureFrames(n = 60, dt = 1 / 60, onFrame = null, keep = () => true) {
    renderer.r.setAnimationLoop(null);
    const out = [];
    try {
      for (let i = 0; i < n; i++) {
        onFrame?.(i);
        elapsed += dt;
        tick(dt, dt);
        if (keep(i)) out.push(renderer.r.domElement.toDataURL('image/png'));
      }
    } finally { last = performance.now(); renderer.r.setAnimationLoop(frame); }
    return out;
  },
  // fast-forward frame by frame (physics + camera, no rendering) and record moments that can make the screen
  // flicker: glow motes or particles right in front of the lens, karts touching the camera, the camera outside the walls
  probe(seconds = 30, dt = 1 / 60) {
    const r = state.race, me = state.me; if (!r || !me) return null;
    r.skipIntro();
    const motes = [];
    state.world.scene.traverse((o) => { if (o.isPoints && o.geometry.attributes.phase) motes.push(o); });
    const loc = {}, ctl = new Map([[me, { steer: 0, throttle: 1 }]]);
    const rec = { frames: 0, moteNear: [], partNear: [], kartNear: [], outside: [] };
    const cam = camera.position;
    const near = (arr, n, lim) => { let best = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(arr[i * 3] - cam.x, arr[i * 3 + 1] - cam.y, arr[i * 3 + 2] - cam.z); if (d < best) best = d; } return best < lim ? best : null; };
    let hint = -1;
    for (let t = 0; t < seconds; t += dt) {
      r.step(dt, ctl); r.frame(dt);
      raceCam.update(dt, r, me, r.phase === 'intro' ? 'intro' : me.finished ? 'finish' : 'chase');
      r.cameraCull(cam);
      state.world.update(dt, elapsed + t, camera, me.pos);
      rec.frames++;
      if (r.phase !== 'race') continue;
      const tt = +r.raceTime.toFixed(2);
      for (const m of motes) {
        const d = near(m.geometry.attributes.position.array, m.geometry.attributes.position.count, 4.5);
        if (d !== null) { rec.moteNear.push([tt, +d.toFixed(2)]); break; }
      }
      for (const P of [r.parts.add, r.parts.soft]) { const d = near(P.pos, P.alive, 2.5); if (d !== null) { rec.partNear.push([tt, +d.toFixed(2)]); break; } }
      for (const k of r.karts) if (k !== me && !k.camHide && Math.hypot(k.pos.x - cam.x, k.pos.y + 0.9 - cam.y, k.pos.z - cam.z) < 2.0) { rec.kartNear.push([tt, k.char.id]); break; }
      const L = r.track.locate(cam, hint, loc); hint = L.i;
      if (Math.abs(L.d) > L.wall) rec.outside.push([tt, +(Math.abs(L.d) - L.wall).toFixed(2)]);
      if (r.phase === 'done') break;
    }
    return rec;
  },
  // park the camera on the course: f = lap fraction 0…1, d = lateral offset, h = height, back = metres behind,
  // look = metres ahead to look at. view(null) returns to the race camera.
  view(f, { d = 0, h = 5, back = 12, look = 25, fov = 68, showHud = false } = {}) {
    if (f === null) { state.freeCam = null; hud?.show(state.inRace); return; }
    const tr = state.race.track, p = f * tr.N;
    const pos = tr.pointAt(p - back / tr.step, d); pos.y += h;
    const lk = tr.pointAt(p + look / tr.step, 0); lk.y += 1.5;
    state.freeCam = { pos, look: lk, fov };
    hud?.show(showHud);
    return { pos: pos.toArray(), look: lk.toArray() };
  },
  // raw camera placement in world coordinates
  camAt(pos, look, fov = 60) { state.freeCam = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov }; hud?.show(false); },
  startRace(idx) { startRace(idx); },
  go, act, showResults: () => showResults(),
  hands, input, audio, renderer, xr, vrInput, get cockpit() { return cockpit; },
  get race() { return state.race; },
  get raceCam() { return raceCam; },
  setControl(c) { state.control = c; },
};

boot().catch((e) => {
  reportError(e);
  const f = $('fatal');
  f.style.display = 'flex';
  f.innerHTML = `<div><h2>はじめられませんでした</h2><p>WebGL に 対応した ブラウザ（Chrome・Edge・Safari・Firefox の 最新版）で 開いてください。</p><pre style="white-space:pre-wrap;opacity:.7">${String(e && e.message || e)}</pre></div>`;
});
