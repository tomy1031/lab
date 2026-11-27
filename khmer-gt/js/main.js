// js/main.js — KHMER GT Main Application Orchestrator
import * as THREE from 'three';
import { CARS, getCarById } from './data/cars.js';
import { COURSES, getCourseById } from './data/courses.js';
import { GameRenderer } from './engine/renderer.js';
import { AudioEngine } from './engine/audio.js';
import { ParticleSystem } from './engine/particles.js';
import { HandTracker } from './engine/hands.js';
import { InputManager } from './engine/input.js';
import { TrackSpline } from './track/spline.js';
import { buildTrackMesh } from './track/builder.js';
import { buildScenery } from './track/scenery.js';
import { buildCarModel } from './car/model.js';
import { RaceManager } from './race/race.js';
import { CameraRig } from './race/camera.js';
import { XRManager } from './vr/xr.js';
import { VRInput } from './vr/vrinput.js';
import { GTCockpit } from './vr/cockpit.js';
import { VRMenuPanel } from './vr/vrpanel.js';
import { RaceHUD } from './ui/hud.js';
import { MenuUI } from './ui/menu.js';

const canvas = document.getElementById('gl');
const renderer = new GameRenderer(canvas);
const audio = new AudioEngine();
const particles = new ParticleSystem(renderer.scene);
const handTracker = new HandTracker();
const inputMgr = new InputManager();
const cameraRig = new CameraRig(renderer.scene, renderer.camera);
const raceMgr = new RaceManager(renderer.scene, audio, particles);
const xrMgr = new XRManager(renderer);
const vrInput = new VRInput(renderer);
vrInput.attach(cameraRig.vrSpace);

const cockpit = new GTCockpit();
cockpit.attachTo(cameraRig.vrSpace);

const vrPanel = new VRMenuPanel();
vrPanel.attachTo(cameraRig.vrSpace, renderer.scene);

const hud = new RaceHUD();

// App state
const state = {
  mode: 'lobby', // lobby | racing | paused | results
  courseId: COURSES[0].id,
  carId: CARS[0].id,
  spline: null,
  course: null,
  trackObj: null,
  sceneryObj: null,
  showroomCar: null,
  showroomPos: new THREE.Vector3(),
  showroomForward: new THREE.Vector3(0, 0, -1),
};

function disposeGroup(group) {
  if (!group) return;
  group.traverse((obj) => {
    if (obj.geometry && !obj.userData.cachedGeo) obj.geometry.dispose();
  });
}

// Load a Cambodia course into the 3D scene
function loadCourse(courseId) {
  const course = getCourseById(courseId);
  state.courseId = course.id;
  state.course = course;

  if (state.trackObj) {
    renderer.scene.remove(state.trackObj.group);
    disposeGroup(state.trackObj.group);
    state.trackObj = null;
  }
  if (state.sceneryObj) {
    state.sceneryObj.dispose();
    state.sceneryObj = null;
  }

  state.spline = new TrackSpline(course, 600);
  state.trackObj = buildTrackMesh(state.spline, course);
  renderer.scene.add(state.trackObj.group);

  state.sceneryObj = buildScenery(renderer.scene, state.spline, course);
  renderer.updateEnvironment(course);
  particles.setCyberRain(course.isCyber);

  // Place showroom showcase car right on the start straight facing the iconic backdrop
  const f = state.spline.sampleAt(state.spline.length - 18);
  state.showroomPos.copy(f.pos).addScaledVector(f.normal, 0.06);
  state.showroomForward.copy(f.tangent);
  rebuildShowroomCar();
  if (xrMgr.presenting && state.mode !== 'racing') refreshVRPanel();
}

function rebuildShowroomCar() {
  if (state.showroomCar) {
    renderer.scene.remove(state.showroomCar.root);
    state.showroomCar = null;
  }
  const spec = getCarById(state.carId);
  state.showroomCar = buildCarModel(spec);
  state.showroomCar.root.position.copy(state.showroomPos);
  const f = state.spline.sampleAt(state.spline.length - 18);
  const m = new THREE.Matrix4().makeBasis(f.right, f.normal, f.tangent.clone().negate());
  state.showroomCar.root.quaternion.setFromRotationMatrix(m);
  state.showroomCar.root.visible = state.mode === 'lobby';
  renderer.scene.add(state.showroomCar.root);
  if (xrMgr.presenting && state.mode !== 'racing') refreshVRPanel();
}

function startRace() {
  audio.unlock();
  if (state.showroomCar) state.showroomCar.root.visible = false;
  state.mode = 'racing';
  menu.setScreen(xrMgr.presenting ? 'vr' : 'race');
  hud.setVisible(!xrMgr.presenting);
  vrPanel.setVisible(false);

  raceMgr.setup({
    spline: state.spline,
    course: state.course,
    playerCarId: state.carId,
    totalLaps: menu.totalLaps,
    difficulty: menu.difficulty,
    startLights: state.trackObj?.startLights || [],
  });

  hud.showBanner(state.course.jpName, `${getCarById(state.carId).name}  •  ${menu.totalLaps} LAPS`);
}

function returnToLobby() {
  raceMgr.clear();
  audio.updateDriving({ active: false });
  state.mode = 'lobby';
  if (state.showroomCar) state.showroomCar.root.visible = true;
  hud.setVisible(false);
  menu.setScreen(xrMgr.presenting ? 'vr' : 'lobby');
  if (xrMgr.presenting) refreshVRPanel();
}

function togglePause() {
  if (state.mode === 'racing') {
    state.mode = 'paused';
    audio.updateDriving({ active: false });
    if (xrMgr.presenting) {
      refreshVRPanel();
    } else {
      menu.setScreen('pause');
    }
  } else if (state.mode === 'paused') {
    state.mode = 'racing';
    if (xrMgr.presenting) {
      vrPanel.setVisible(false);
    } else {
      menu.setScreen('race');
    }
  }
}

// Build interactive VR 3D Menu Panel (controller-free pinch support for every screen)
function refreshVRPanel() {
  if (!xrMgr.presenting) {
    vrPanel.setVisible(false);
    return;
  }
  const course = state.course;
  const car = getCarById(state.carId);

  if (state.mode === 'lobby') {
    vrPanel.setVisible(true);
    vrPanel.draw({
      title: 'KHMER GT — VR GARAGE',
      subtitle: 'ハンドトラッキング対応：指で指してピンチで決定（コントローラー不要）',
      cyber: course.isCyber,
      rows: [
        { label: 'コース (COURSE)', value: `${course.jpName}  [${course.isCyber ? 'CYBER 2099' : course.weather}]`, highlight: true },
        { label: 'マシン (CAR)', value: `${car.name}  (${car.powerPs}PS / ${car.drivetrain})`, highlight: true },
        { label: 'ルール (RACE)', value: `${menu.totalLaps} LAPS  •  AI: ${menu.difficulty.toUpperCase()}` },
      ],
      buttons: [
        { id: 'prev_course', label: '◀ 前のコース', x: 60, y: 420, w: 360, h: 92 },
        { id: 'next_course', label: '次のコース ▶', x: 900, y: 420, w: 360, h: 92 },
        { id: 'prev_car', label: '◀ 前の車種', x: 60, y: 536, w: 360, h: 92 },
        { id: 'next_car', label: '次の車種 ▶', x: 900, y: 536, w: 360, h: 92 },
        { id: 'cycle_diff', label: `難易度: ${menu.difficulty.toUpperCase()}`, x: 455, y: 420, w: 410, h: 92 },
        { id: 'cycle_laps', label: `周回数: ${menu.totalLaps} LAPS`, x: 455, y: 536, w: 410, h: 92 },
        { id: 'start_race', label: 'RACE START (レース開始)', x: 260, y: 670, w: 800, h: 112, primary: true, fontSize: 38 },
      ],
    });
  } else if (state.mode === 'paused') {
    vrPanel.setVisible(true);
    vrPanel.draw({
      title: 'PAUSED',
      subtitle: '両手ハンドルで運転 / パー✋でブレーキ / ✌️👍でERSブースト',
      cyber: course.isCyber,
      rows: [
        { label: 'COURSE', value: course.jpName },
        { label: 'MACHINE', value: car.name },
      ],
      buttons: [
        { id: 'resume', label: 'レース再開', x: 260, y: 430, w: 800, h: 105, primary: true },
        { id: 'restart', label: '最初からやり直す', x: 260, y: 560, w: 380, h: 95 },
        { id: 'lobby', label: 'ガレージへ戻る', x: 680, y: 560, w: 380, h: 95 },
      ],
    });
  } else if (state.mode === 'results') {
    const standings = raceMgr.getStandings();
    const p = raceMgr.player;
    vrPanel.setVisible(true);
    vrPanel.draw({
      title: `FINISH — P${p?.position || 1} / 8`,
      subtitle: `${course.jpName}  •  ${car.name}`,
      cyber: course.isCyber,
      rows: standings.slice(0, 5).map((c, idx) => ({
        label: `#${idx + 1}  ${c.name}`,
        value: c.spec.name,
        highlight: c.isPlayer,
      })),
      buttons: [
        { id: 'restart', label: 'もう一度走る', x: 180, y: 675, w: 440, h: 104, primary: true },
        { id: 'lobby', label: 'コース・車種変更', x: 700, y: 675, w: 440, h: 104 },
      ],
    });
  } else {
    vrPanel.setVisible(false);
  }
}

function handleVRMenuAction(actionId) {
  audio.unlock();
  audio.playClick();
  const cIdx = COURSES.findIndex((c) => c.id === state.courseId);
  const vIdx = CARS.findIndex((c) => c.id === state.carId);

  if (actionId === 'prev_course') {
    const next = COURSES[(cIdx - 1 + COURSES.length) % COURSES.length].id;
    menu.selectCourse(next, true);
  } else if (actionId === 'next_course') {
    const next = COURSES[(cIdx + 1) % COURSES.length].id;
    menu.selectCourse(next, true);
  } else if (actionId === 'prev_car') {
    const next = CARS[(vIdx - 1 + CARS.length) % CARS.length].id;
    menu.selectCar(next, true);
  } else if (actionId === 'next_car') {
    const next = CARS[(vIdx + 1) % CARS.length].id;
    menu.selectCar(next, true);
  } else if (actionId === 'cycle_diff') {
    const order = ['rookie', 'pro', 'master'];
    menu.difficulty = order[(order.indexOf(menu.difficulty) + 1) % order.length];
    refreshVRPanel();
  } else if (actionId === 'cycle_laps') {
    const order = [1, 3, 5];
    menu.totalLaps = order[(order.indexOf(menu.totalLaps) + 1) % order.length];
    refreshVRPanel();
  } else if (actionId === 'start_race') {
    startRace();
  } else if (actionId === 'resume') {
    togglePause();
  } else if (actionId === 'restart') {
    startRace();
  } else if (actionId === 'lobby') {
    returnToLobby();
  }
}

// Race finish & lap banners
raceMgr.onLapBanner = (title, lastLap) => {
  hud.showBanner(title, lastLap > 0 ? `LAST LAP ${lastLap.toFixed(2)}s` : '');
};
raceMgr.onFinish = (standings) => {
  state.mode = 'results';
  if (xrMgr.presenting) {
    refreshVRPanel();
  } else {
    hud.setVisible(false);
    menu.showResults(standings, state.course);
  }
};

// Menu UI wiring
const menu = new MenuUI({
  onClickSound: () => { audio.unlock(); audio.playClick(); },
  onSelectCourse: (id) => loadCourse(id),
  onSelectCar: (id) => {
    state.carId = id;
    rebuildShowroomCar();
  },
  onStartRace: () => startRace(),
  onRestartRace: () => startRace(),
  onReturnLobby: () => returnToLobby(),
  onTogglePause: () => togglePause(),
  onCycleCamera: () => {
    const m = cameraRig.cycleMode();
    hud.showBanner(`CAMERA: ${m.toUpperCase()}`, '');
  },
  onToggleMute: () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    menu.el.btnMute.textContent = audio.muted ? '🔇 ミュート中' : '🔊 サウンド ON';
  },
  onToggleHands: async () => {
    audio.unlock();
    if (handTracker.ready) {
      handTracker.stop();
      menu.setHandStatus('off');
    } else {
      await handTracker.start((st, err) => menu.setHandStatus(st, err));
    }
  },
  onToggleVR: async () => {
    audio.unlock();
    if (xrMgr.presenting) {
      xrMgr.exit();
    } else {
      try {
        await xrMgr.enter();
      } catch (e) {
        alert(`VR開始できませんでした: ${e.message || e}\nMeta Quest ブラウザなど WebXR 対応端末でお試しください。`);
      }
    }
  },
});

// WebXR Session Events
xrMgr.ready.then((supported) => menu.setVRButtonState(supported, false));
xrMgr.onStart = () => {
  cameraRig.setVRMode(true);
  cameraRig.recenterVR();
  menu.setVRButtonState(true, true);
  hud.setVisible(false);
  menu.setScreen('vr');
  refreshVRPanel();
};
xrMgr.onEnd = () => {
  cameraRig.setVRMode(false);
  vrPanel.setVisible(false);
  menu.setVRButtonState(xrMgr.supported, false);
  if (state.mode === 'racing') {
    hud.setVisible(true);
    menu.setScreen('race');
  } else if (state.mode === 'paused') {
    menu.setScreen('pause');
  } else if (state.mode === 'results') {
    menu.showResults(raceMgr.getStandings(), state.course);
  } else {
    menu.setScreen('lobby');
  }
};
xrMgr.onBlur = () => {
  if (state.mode === 'racing') togglePause();
};

// Mobile / Tablet touch controls binding
function bindTouchControls() {
  const bindHold = (id, onChange) => {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => { e.preventDefault(); inputMgr.touch.active = true; onChange(1); el.classList.add('pressed'); };
    const up = (e) => { e.preventDefault(); onChange(0); el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  };
  let tLeft = 0, tRight = 0;
  const syncSteer = () => { inputMgr.touch.steer = tRight - tLeft; };
  bindHold('tc-left', (v) => { tLeft = v; syncSteer(); });
  bindHold('tc-right', (v) => { tRight = v; syncSteer(); });
  bindHold('tc-gas', (v) => { inputMgr.touch.throttle = v; });
  bindHold('tc-brake', (v) => { inputMgr.touch.brake = v; });
  bindHold('tc-boost', (v) => { inputMgr.touch.boost = v > 0; });
}
bindTouchControls();

// Initialize default course (Phnom Penh)
loadCourse(COURSES[0].id);
menu.setScreen('lobby');

// Main Animation Loop (uses setAnimationLoop for seamless WebXR 72/90Hz + Desktop 60Hz support)
let prevTime = performance.now();
renderer.r.setAnimationLoop((now) => {
  const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
  prevTime = now;
  const elapsed = now * 0.001;

  const presenting = xrMgr.presenting;
  const input = inputMgr.poll(dt, {
    vrInput,
    xrSession: xrMgr.session,
    handTracker,
  });

  const edges = inputMgr.consumeEdges();
  if (edges.camera && state.mode === 'racing' && !presenting) {
    const m = cameraRig.cycleMode();
    hud.showBanner(`CAMERA: ${m.toUpperCase()}`, '');
  }
  if (edges.pause && (state.mode === 'racing' || state.mode === 'paused')) {
    togglePause();
  }
  if (edges.recenter && presenting) {
    cameraRig.recenterVR();
  }

  // Update animated scenery (Cyber Angkor hologram rings, floating Khmer signs, laser beam)
  state.sceneryObj?.update(elapsed);

  if (state.mode === 'lobby') {
    cameraRig.updateShowroom(dt, state.showroomPos, state.showroomForward, presenting);
    if (presenting) {
      vrPanel.updateInteraction(vrInput, handleVRMenuAction);
    } else {
      menu.updateHandCursor(dt, handTracker, true);
    }
    cockpit.update({ visible: presenting, car: null, steer: input.steer, vrHands: vrInput.hands, isCyber: state.course.isCyber });
  } else {
    raceMgr.update(dt, input, state.mode === 'paused');
    cameraRig.updateRace(dt, raceMgr.player, presenting);
    particles.update(dt, raceMgr.player?.worldPos);

    const showCockpit = presenting || cameraRig.mode === 'cockpit';
    raceMgr.player?.visual.setInteriorMode(showCockpit);
    cockpit.update({
      visible: showCockpit,
      car: raceMgr.player,
      steer: input.steer,
      totalLaps: raceMgr.totalLaps,
      vrHands: presenting ? vrInput.hands : null,
      isCyber: state.course.isCyber,
    });

    // Attach desktop cockpit to camera when in non-VR cockpit view
    if (!presenting && cameraRig.mode === 'cockpit') {
      if (cockpit.group.parent !== renderer.camera) renderer.camera.add(cockpit.group);
    } else if (cockpit.group.parent !== cameraRig.vrSpace) {
      cameraRig.vrSpace.add(cockpit.group);
    }

    if (presenting) {
      if (state.mode === 'paused' || state.mode === 'results') {
        vrPanel.updateInteraction(vrInput, handleVRMenuAction);
      }
    } else {
      if (state.mode === 'racing') {
        hud.update(dt, { race: raceMgr, spline: state.spline, input, handTracker, course: state.course });
      }
      menu.updateHandCursor(dt, handTracker, state.mode === 'paused' || state.mode === 'results');
    }
  }

  renderer.render();
});

// Public debug & verification handle
window.KHMER_GT = {
  ready: true,
  state,
  courses: COURSES,
  cars: CARS,
  selectCourse: (id) => menu.selectCourse(id, true),
  selectCar: (id) => menu.selectCar(id, true),
  startRace,
  returnToLobby,
  cycleCamera: () => cameraRig.cycleMode(),
  getPerfStats: () => renderer.getPerfStats(),
  getRaceInfo: () => ({
    mode: state.mode,
    courseId: state.courseId,
    carId: state.carId,
    raceState: raceMgr.state,
    playerKmh: raceMgr.player?.kmh || 0,
    playerPos: raceMgr.player?.position || 0,
    playerLap: raceMgr.player?.lap || 0,
    carCount: raceMgr.cars.length,
  }),
};
