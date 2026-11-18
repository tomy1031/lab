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

const DD = window.DD;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------------------------
// settings
const SETTINGS_KEY = 'dreamdrift.settings.v1';
const settings = { music: 0.6, sfx: 0.85, quality: 'high', sens: 1, mode: 'gp', cls: 'normal', cpu: 7, laps: 3, char: 'luna' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };
if (params.get('quality')) settings.quality = params.get('quality');

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
let portraits = new Map();
let hud = null;

const state = {
  screen: 'loading', control: 'pad', inRace: false, paused: false, freeCam: null,
  world: null, race: null, me: null, courseIdx: 0,
  gp: null, attractIdx: Number(params.get('attract') || 0), resultsTimer: 0,
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
    case 'cpu-': settings.cpu = Math.max(0, settings.cpu - 1); saveSettings(); refreshSetup(); audio.play('select'); break;
    case 'cpu+': settings.cpu = Math.min(7, settings.cpu + 1); saveSettings(); refreshSetup(); audio.play('select'); break;
    case 'setup-ok': audio.play('confirm'); go('s-char'); break;
    case 'char-ok':
      audio.play('confirm');
      if (settings.mode === 'gp') startGP(); else { buildCourseGrid(); go('s-course'); }
      break;
    case 'resume': pause(false); break;
    case 'restart': audio.play('confirm'); pause(false, true); startRace(state.courseIdx, true); break;
    case 'quit': audio.play('back'); pause(false, true); goTitle(); break;
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

function goTitle() {
  state.inRace = false; state.gp = null; state.paused = false;
  hud?.show(false);
  $('touch').classList.remove('show');
  showScreen('s-loading');
  requestAnimationFrame(() => setTimeout(() => {
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
  }, 30));
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
  return grid.map((c) => ({ char: c, human: c.id === me.id }));
}

function startRace(idx, restart = false) {
  state.courseIdx = idx;
  state.inRace = false;
  showScreen('s-loading');
  hud?.show(false);
  requestAnimationFrame(() => setTimeout(() => {
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
    hud.show(true);
    $('touch').classList.toggle('show', state.control === 'pad' && matchMedia('(pointer: coarse)').matches);
    document.body.classList.toggle('touch-mode', $('touch').classList.contains('show'));
    audio.playMusic(course.music);
    audio.setTempo(1);
    state.inRace = true; state.paused = false; state.resultsTimer = 0;
    showScreen(null);
    if (params.has('skipintro')) race.skipIntro();
  }, 30));
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
  if (on) { audio.engine(false); audio.play('back'); showScreen('s-pause'); }
  else { if (!silent) audio.play('confirm'); showScreen(null); }
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
      if (mine && d.hurt) { audio.play('hit'); raceCam.addShake(0.8); }
      else if (d.by === me && d.hurt) { hud.flash('ヒット！', 'small', 0.9); audio.play('trick'); }
      break;
    case 'bump': if (d.a === me || d.b === me) { audio.play('bump'); raceCam.addShake(Math.min(0.6, d.power * 0.05)); } break;
    case 'pad': if (mine) audio.play('pad'); break;
    case 'jump': if (mine) audio.play('jump'); break;
    default:
      if (type.startsWith('kart:') && mine) {
        const e = type.slice(5);
        if (e === 'hop') audio.play('hop');
        else if (e.startsWith('miniturbo')) audio.play('miniturbo', Number(e.slice(-1)));
        else if (e.startsWith('driftlevel')) audio.play('driftlevel', Number(e.slice(-1)));
        else if (e === 'wall') { audio.play('wall'); raceCam.addShake(0.4); }
        else if (e === 'shieldpop') audio.play('shieldpop');
        else if (e === 'trick') { audio.play('trick'); hud.flash('トリック！', 'small', 0.8); }
        else if (e === 'respawn') audio.play('respawn');
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
}

// ---------------------------------------------------------------------------------------------
// main loop
const STEP = 1 / 120;
let acc = 0, last = performance.now(), elapsed = 0;
const humanCtl = new Map();

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, raw);
  last = now;
  elapsed += dt;
  try { tick(dt, raw); } catch (e) { reportError(e); }
}

function tick(dt, raw = dt) {
  const ctl = input.poll();
  if (hands.ready) hands.poll();
  const race = state.race;
  if (race && !state.paused) {
    humanCtl.clear();
    if (state.me) humanCtl.set(state.me, ctl);
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 10) { race.step(STEP, humanCtl); acc -= STEP; n++; }
    if (n >= 10) acc = 0;
    race.frame(dt);
  }
  if (race) {
    const me = state.me;
    let mode = 'attract';
    if (me) mode = race.phase === 'intro' ? 'intro' : me.finished ? 'finish' : 'chase';
    if (state.freeCam) { camera.position.copy(state.freeCam.pos); camera.lookAt(state.freeCam.look); camera.fov = state.freeCam.fov; camera.updateProjectionMatrix(); }
    else if (!state.paused) raceCam.update(dt, race, me || race.karts[0], mode);
    if (!state.freeCam) race.cameraCull(camera.position);
    const focus = state.freeCam ? state.freeCam.look : me ? me.pos : race.karts[raceCam.cut.kart]?.pos;
    state.world.update(dt, elapsed, camera, focus);
    const sh = renderer.r.getDrawingBufferSize(new THREE.Vector2()).y;
    race.parts.add.setScale(sh, camera.fov); race.parts.soft.setScale(sh, camera.fov);
    if (me && state.inRace && !state.paused) {
      audio.engine(race.phase !== 'intro' && !me.finished, Math.max(0, me.speed) / me.maxSpeed, me.boost > 0, me.drift.active);
      hud.update(dt, race, me, state.control === 'hands' ? hands : null, audio);
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
    if (state.inRace && !state.paused && !params.has('quality')) {
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
  se.addEventListener('input', () => { settings.sens = Number(se.value); hands.interp.opts.sensitivity = settings.sens; saveSettings(); });
  for (const b of document.querySelectorAll('[data-group="quality"] [data-val]')) b.classList.toggle('on', b.dataset.val === renderer.qname);
  addEventListener('pointerdown', () => audio.unlock(), { once: false });
  requestAnimationFrame(frame);

  if (params.has('course')) {
    // test / direct link: ?course=1..4 starts a free race at once
    settings.mode = 'free';
    if (params.get('cpu')) settings.cpu = Number(params.get('cpu'));
    if (params.get('laps')) settings.laps = Number(params.get('laps'));
    if (params.get('cls')) settings.cls = params.get('cls');
    if (params.get('char')) settings.char = params.get('char');
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
  hands, input, audio, renderer,
  get race() { return state.race; },
  setControl(c) { state.control = c; },
};

boot().catch((e) => {
  reportError(e);
  const f = $('fatal');
  f.style.display = 'flex';
  f.innerHTML = `<div><h2>はじめられませんでした</h2><p>WebGL に 対応した ブラウザ（Chrome・Edge・Safari・Firefox の 最新版）で 開いてください。</p><pre style="white-space:pre-wrap;opacity:.7">${String(e && e.message || e)}</pre></div>`;
});
