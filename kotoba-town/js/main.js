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
import { loadCourses, loadVoiceIndex, loadFreeTalk, charactersOf } from './content/index.js';
import { resolveCharacter } from './content/lines.js';
import { SpeechBubble, TurnCard, Board, Toast, LazyFollow } from './ui/views.js';
import { Navi, NAVI_LINES } from './ui/navi.js';
import { Runner } from './talk/runner.js';
import { FreeTalk, topicsFor } from './talk/free.js';
import { FREE_LEVELS } from './talk/judge.js';
import { LIVE_MODELS } from './talk/live.js';

const KT = (window.KT = window.KT || { ready: false, errors: [], log: [] });
const log = (...a) => { KT.log.push(a.join(' ')); if (KT.log.length > 200) KT.log.shift(); if (new URLSearchParams(location.search).has('debug')) console.log('[kt]', ...a); };

const $ = (s) => document.querySelector(s);
const SCENE_NAMES = { office: 'かいしゃ · Office', classroom: 'きょうしつ · Classroom', apartment: 'アパート · Apartment', depato: 'デパート · Dept. store', museum: 'びじゅつかん · Museum', station: 'えき · Station', cafe: 'きっさてん · Café', park: 'こうえん · Park', home: 'もりさんの いえ · Home', konbini: 'コンビニ · Konbini', clinic: 'びょういん · Clinic', izakaya: 'いざかや · Izakaya', interview: 'めんせつの へや · Interview room' };

// Free-talk room: where the partner stands in each place (staff = at their own workplace) and how the learner moves.
const FREE_PLACES = {
  cafe: { staff: 'counter', friend: 'npc1' },
  park: { friend: 'npc1' },
  office: { staff: 'npc1', friend: 'npc1' },
  classroom: { staff: 'teacher', friend: 'npc1' },
  apartment: { friend: 'npc1' },
  depato: { staff: 'clerk', friend: 'npc1' },
  museum: { staff: 'counter', friend: 'npc1' },
  station: { staff: 'staff', friend: 'npc1' },
  home: { staff: 'host', friend: 'host' },
  konbini: { staff: 'clerk', friend: 'npc1' },
  clinic: { staff: 'doctor', friend: 'npc1', staffMoves: ['walk', 'sit'] },
  izakaya: { staff: 'staff', friend: 'npc1', moves: ['sit'] },
  interview: { staff: 'npc1', friend: 'npc1', moves: ['walk', 'sit'] },
};
const OUTDOOR = new Set(['park', 'station']);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const placeName = (id) => { const [ja, en] = (SCENE_NAMES[id] || id).split(' · '); return { nameJa: ja, nameEn: en || ja }; };

async function boot() {
  const fontReady = document.fonts?.load('800 40px "M PLUS Rounded 1c"').catch(() => {});
  const app = new App($('#stage'));
  const sound = new Sound();
  const mic = new Mic(sound);
  const amb = new Ambience(sound);
  const stage = new Stage(app, sound);
  const [courses, freeData] = await Promise.all([loadCourses(), loadFreeTalk(), loadVoiceIndex(), fontReady]);
  const units = courses.flatMap((c) => c.units);
  const bubble = new SpeechBubble(app);
  const toast = new Toast(app);
  const board = new Board(app, sound);
  // ネクマックス, the guide: by the board in the town square, small and floating beside the learner in scenes
  const navi = new Navi(app, store.settings);
  let naviWelcomed = false;
  let runner = null;
  const turn = new TurnCard(app, {
    hint: () => runner?.hint(), again: () => runner?.again(), skip: () => runner?.skip(),
    choose: (t) => runner?.choose(t), finish: () => runner?.endFree(),
    ideas: () => runner?.ideas?.(), topic: () => runner?.newTopic?.(),
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

  const state = { lesson: null, variant: null, where: 'title', course: courses[0]?.id || 'minna', mode: 'practice', page: {}, free: null };
  const tabs = [...courses.map(({ id, titleJa, titleEn }) => ({ id, titleJa, titleEn })), ...(freeData ? [{ id: 'free', titleJa: 'フリートーク', titleEn: 'Free talk' }] : [])];
  KT.state = state; KT.app = app; KT.stage = stage; KT.store = store; KT.board = board; KT.turn = turn; KT.navi = navi;

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
    navi.stand(new THREE.Vector3(a.x + 1.1, 0.6, a.z + 0.2), 0.78);
    showLessons();
    await stage.fade(0, 400);
    if (!naviWelcomed) { naviWelcomed = true; navi.say(NAVI_LINES.welcome[0], { ms: 4200, pose: 'wave', force: true }); setTimeout(() => { if (state.where === 'town') navi.say(NAVI_LINES.welcome[1], { ms: 5000, force: true }); }, 4400); }
    else navi.say(NAVI_LINES.town, { ms: 5000, pose: 'wave', force: true });
  }

  const starsOf = (id, mode) => store.starsOf(id, mode);

  function showLessons() {
    if (state.course === 'free' && freeData) {
      if (state.where === 'town' && state.naviTab !== 'free') navi.say(NAVI_LINES.free, { ms: 5000, force: true });
      state.naviTab = 'free';
      showFree();
      return;
    }
    state.naviTab = state.course;
    board.courses({
      courses, tabs, active: state.course, starsOf,
      onTab: (id) => { state.course = id; showLessons(); },
      onPick: (L) => showVariants(L),
      page: state.page[state.course] || 0,
      onPage: (i) => { state.page[state.course] = i; showLessons(); },
    });
  }

  // ------------------------------------------------------- free-talk room
  const freePartners = () => Object.keys(freeData?.partners || {}).filter((id) => resolveCharacter(id));
  function freePlaces(pid) {
    const typical = (freeData.partners[pid]?.places || []).filter((x) => FREE_PLACES[x]);
    return [...typical, ...Object.keys(FREE_PLACES).filter((x) => !typical.includes(x))];
  }
  const freeTopics = (sel) => topicsFor(freeData, { partner: sel.partner, place: sel.place, level: sel.level });
  function freeSel() {
    if (!state.free) {
      const partner = freePartners()[0];
      state.free = { partner, place: freePlaces(partner)[0], topic: 0, level: store.settings.freeLevel || 'easy', style: 'polite' };
    }
    return state.free;
  }

  function showFree() {
    const sel = freeSel();
    const info = freeData.partners[sel.partner] || {};
    const partner = resolveCharacter(sel.partner);
    const topics = freeTopics(sel);
    sel.topic = Math.max(0, Math.min(topics.length - 1, sel.topic));
    const topic = topics[sel.topic];
    const place = placeName(sel.place);
    const lv = FREE_LEVELS[sel.level];
    const set = (patch) => { Object.assign(sel, patch); showFree(); };
    const cyc = (list, cur, dir) => list[(list.indexOf(cur) + dir + list.length) % list.length];
    board.freeSetup({
      tabs, partners: freePartners().map((id) => { const c = resolveCharacter(id); return { id, nameJa: c.nameJa, roleEn: c.roleEn }; }),
      partner, info, place, topic, topicPos: `${sel.topic + 1} / ${topics.length}`, level: sel.level, style: sel.style,
      levels: Object.entries(FREE_LEVELS).map(([id, l]) => [id, l.ja, l.en]),
      live: !!store.apiKey,
      summary: `${partner.nameJa}さんと、${place.nameJa}で「${topic.titleJa}」 · ${lv.ja}・${sel.style === 'casual' ? 'ともだち' : 'ていねい'}`,
      on: {
        tab: (id) => { state.course = id; showLessons(); },
        partner: (id) => set({ partner: id, place: freePlaces(id)[0], topic: 0, style: freeData.partners[id]?.casual ? sel.style : 'polite' }),
        place: (dir) => set({ place: cyc(freePlaces(sel.partner), sel.place, dir), topic: 0 }),
        topic: (dir) => set({ topic: (sel.topic + dir + topics.length) % topics.length }),
        level: (l) => { store.settings.freeLevel = l; store.saveSettings(); set({ level: l, topic: 0 }); },
        style: (st) => set({ style: st }),
        random: () => {
          const id = pickOne(freePartners());
          const typical = freePlaces(id).slice(0, Math.max(1, (freeData.partners[id]?.places || []).length));
          const where = Math.random() < 0.8 ? pickOne(typical) : pickOne(freePlaces(id));
          Object.assign(sel, { partner: id, place: where, style: freeData.partners[id]?.casual && Math.random() < 0.5 ? 'casual' : 'polite' });
          const list = freeTopics(sel);
          sel.topic = list.length > 1 && Math.random() < 0.85 ? 1 + Math.floor(Math.random() * (list.length - 1)) : 0;
          sound.blip('pop');
          showFree();
        },
        start: () => openFree({ ...sel }),
      },
    });
  }

  function randomSetup(place) {
    const now = season();
    return {
      time: pickOne(place === 'izakaya' ? ['evening', 'night', 'night'] : place === 'clinic' || place === 'museum' || place === 'depato' ? ['morning', 'noon', 'evening'] : ['morning', 'noon', 'noon', 'evening', 'night']),
      season: Math.random() < 0.5 ? now : pickOne(['spring', 'summer', 'autumn', 'winter']),
      weather: OUTDOOR.has(place) && Math.random() < 0.25 ? 'rain' : 'clear',
    };
  }

  async function openFree(sel) {
    const partner = resolveCharacter(sel.partner);
    const info = freeData.partners[sel.partner] || {};
    const topics = freeTopics(sel);
    const topic = topics[sel.topic] || topics[0];
    const P = FREE_PLACES[sel.place] || FREE_PLACES.park;
    const staff = info.worksAt === sel.place && P.staff;
    const slot = staff ? P.staff : P.friend;
    const moves = (staff ? P.staffMoves : P.friendMoves) || P.moves || [];
    const setup = randomSetup(sel.place);
    runner?.stop(); runner = null;
    state.where = 'free';
    board.hide();
    await stage.fade(1, 350);
    await stage.load(sel.place, setup, [{ char: partner, slot }]);
    amb.start(sel.place, { weather: setup.weather, time: setup.time });
    boardMode = 'follow';
    await stage.fade(0, 450);
    for (const m of moves) await stage.learner(m);
    await sound.unlock();
    stage.ensureSpeakers();
    if (mic.state !== 'on') await mic.start();
    const place = { id: sel.place, ...placeName(sel.place) };
    navi.follow();
    navi.quiet(3000);
    runner = new FreeTalk({
      partner, info, place, setupEn: `${setup.time}, ${setup.season}${setup.weather === 'rain' ? ', raining' : ''}`,
      // at work they stay polite with customers, even friends of the learner's age
      topic, topics, level: sel.level, style: staff ? 'polite' : sel.style,
      twists: (freeData.twists || []).filter((t) => !t.places?.length || t.places.includes(sel.place)),
      stage, bubble, turn, toast, sound, mic, settings: store.settings, apiKey: store.apiKey, log,
      events: (ev) => navi.event(ev),
      onDone: (res) => (res.failed ? goTown() : showFreeReport(sel, partner, place, res)),
    });
    KT.runner = runner;
    follow.update(0, true);
    try { await runner.begin(); } catch (e) { KT.errors.push(String(e?.stack || e)); console.error(e); toast.show(`Error: ${e.message}`, 5000); }
  }

  function showFreeReport(sel, partner, place, { report, turns, topics }) {
    state.where = 'report';
    sound.fanfare(report.stars);
    boardMode = 'follow';
    boardFollow.update(0, true);
    navi.follow({ side: 0.74, ahead: 0.95, below: 0.5, shift: 0 });
    setTimeout(() => navi.event({ type: 'report', free: true, stars: report.stars }), 600);
    board.freeReport({
      report, turns, partner, place, topics,
      onAgain: () => openFree(sel),
      onNew: () => { state.course = 'free'; goTown(); },
      onTown: () => goTown(),
    });
    KT.lastReport = { report, turns, free: true };
  }

  function showVariants(L) {
    state.lesson = L;
    state.course = L.course;
    board.variants(L, starsOf, (v) => openVariant(L, v), showLessons, (s) => SCENE_NAMES[s] || s);
  }

  async function openVariant(L, v) {
    // 'loading' until the briefing is on screen, so nothing can start the talk underneath it
    state.lesson = L; state.variant = v; state.where = 'loading';
    board.hide();
    await stage.fade(1, 350);
    const cast = charactersOf(v).map((char) => ({ char, slot: v.positions?.[char.id] || null }));
    let auto = 0;
    for (const c of cast) if (!c.slot) c.slot = (SCENES[v.scene]?.slots || []).filter((s) => s !== 'phone')[auto++] || 'npc1';
    await stage.load(v.scene, v.setup || {}, cast);
    amb.start(v.scene, { weather: v.setup?.weather, time: v.setup?.time });
    boardMode = 'follow';
    boardFollow.update(0, true);
    navi.follow({ side: 0.74, ahead: 0.95, below: 0.5, shift: 0 });
    setTimeout(() => { if (state.where === 'brief') navi.say(NAVI_LINES.brief, { ms: 5500, pose: 'wave', force: true }); }, 900);
    const live = !!store.apiKey;
    board.briefing({
      lesson: L, variant: v, cast: cast.map((c) => c.char), live,
      note: mic.state !== 'on' && live ? '🎙️ The microphone is not available — allow it in the browser to talk with Gemini Live.' : null,
      onPractice: () => start(L, v, 'practice'), onReal: () => start(L, v, 'real'), onBack: () => goTown(),
    });
    state.where = 'brief';
    await stage.fade(0, 450);
  }

  async function start(L, v, mode = 'practice') {
    board.hide();
    state.where = 'talk';
    state.mode = mode === 'real' && store.apiKey ? 'real' : 'practice';
    await sound.unlock();
    stage.ensureSpeakers();
    if (mic.state !== 'on') await mic.start();
    navi.follow();
    navi.quiet(2500);
    runner = new Runner({
      lesson: L, variant: v, stage, bubble, turn, toast, sound, mic, settings: store.settings, apiKey: store.apiKey, log,
      mode: state.mode, events: (ev) => navi.event(ev),
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
    navi.follow({ side: 0.74, ahead: 0.95, below: 0.5, shift: 0 });
    if (!again) setTimeout(() => navi.event({ type: 'report', stars: report.stars }), 600);
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
    $('#set-navi').checked = store.settings.navi !== false;
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
      music: $('#set-music').checked, model: $('#set-model').value, navi: $('#set-navi').checked,
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
  navi.stand(new THREE.Vector3(stage.built.boardAnchor.x + 1.1, 0.6, stage.built.boardAnchor.z + 0.2), 0.78);
  showLessons();
  app.yaw = 0.35; app.pitch = 0.05; app._applyLook();
  document.body.classList.add('ready');
  KT.ready = true;

  KT.open = (vId) => { const L = units.find((x) => x.variants.some((v) => v.id === vId)); return openVariant(L, L.variants.find((v) => v.id === vId)); };
  KT.start = (mode = 'practice') => start(state.lesson, state.variant, mode);
  KT.goTown = goTown;
  KT.showCourse = (id) => { state.course = id; showLessons(); };
  KT.free = (patch = {}) => { if (!freeData) return null; Object.assign(freeSel(), patch); state.course = 'free'; showLessons(); return state.free; };
  KT.startFree = () => openFree({ ...freeSel() });

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
