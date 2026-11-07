// main.js — ハマころ！ game loop, ball physics, camera, HUD and stage flow.
import * as THREE from 'three';
import { makeToyMaterial, nightUniform } from './material.js';
import { ProtoRegistry } from './engine/objects.js';
import { buildTown } from './engine/town.js';
import { buildGlobe, EARTH_R, latLonToVec, vecToLatLon } from './engine/globe.js';
import { buildKanto } from './engine/kanto.js';
import * as K from './kanto_map.js';
import { Minimap } from './engine/minimap.js';
import { ItemViewer } from './engine/itemViewer.js';
import { Ceo } from './ceo.js';
import * as M from './map.js';

const qs = new URLSearchParams(location.search);
const DEBUG = qs.has('debug');
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- tuning
const PICK_K = 1.45;          // can pick items whose size < PICK_K * r  (≈ 72% of the diameter)
const GROW_K = 4.6;           // how much of an item's volume is added to the ball
const START_R = 0.15;
const CITY_GOALS = [
  { d: 1, text: 'まずは 直径 1m をめざそう！', done: '1m！ 人や自転車も まきこめるぞ' },
  { d: 5, text: '中華街の 屋台や 人も まきこもう！ 目標 5m', done: '5m！ 海にも 入れるようになった！' },
  { d: 20, text: '夕暮れのヨコハマ。クルマや 木を まきこめ！ 目標 20m', done: '20m！ 家や お店も まきこめる！' },
  { d: 60, text: '中華街の ビルを ねらえ！ 目標 60m', done: '60m！ オフィスビルも いける！' },
  { d: 150, text: '夜のヨコハマ。観覧車も 客船も まきこめ！ 目標 150m', done: '150m！ 港が ちいさく見える！' },
  { d: 300, text: 'ランドマークタワーごと ヨコハマを まるめろ！ 目標 300m', done: 'ヨコハマを まるめた！' },
];
const KANTO_GOALS = [
  { d: 1000, text: '関東へ ようこそ！ 川崎の工場や 電車を まきこもう 目標 1km', done: '1km！ 東京が 見えてきた！' },
  { d: 3000, text: '東京へ！ 東京タワーや スカイツリーを まきこめ 目標 3km', done: '3km！ 東京を まるめた！' },
  { d: 8000, text: '空港も 遊園地も！ 関東平野を ころがれ 目標 8km', done: '8km！ 山も まきこめそうだ！' },
  { d: 20000, text: '筑波山・丹沢・箱根… 山ごと 関東を まるめろ！ 目標 20km', done: '関東を まるめた！' },
];
const WORLD_UNIT_KM = 6.371;  // planet: 1 unit = 6.371 km (radius 1000)
const WORLD_GOALS = [
  { d: 16, text: '日本列島へ！ 富士山や 名古屋・大阪を めざせ 目標 100km', done: '100km！ 富士山も まきこめる！' },
  { d: 47, text: '北海道から 沖縄まで 日本を まるめろ！ 目標 300km', done: '日本を まるめた！' },
  { d: 157, text: 'アジアへ ころがれ！ 目標 1,000km', done: 'ユーラシアが ちいさく見える！' },
  { d: 470, text: '世界中を ころがれ！ 目標 3,000km', done: '大陸ごと いけそうだ！' },
  { d: 628, text: '地球を まるごと まきこめ！ 目標 4,000km', done: 'せかいが まるくなった！' },
];
const SIZE_K = 0.22;          // planet: growth per unit of an item's bulk (see bulkOf)
const SIZE_K_KANTO = 0.6;
let stageStartD = START_R * 2;

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, qs.has('lowres') ? 1 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !qs.has('noshadow');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 5000);
// The camera lives in a rig: on screen the rig stays at the origin; in VR (js/vr.js) the rig follows the ball
// and scales with it, while the headset moves the camera inside it.
const rig = new THREE.Group();
rig.name = 'camera-rig';
rig.add(camera);
const material = makeToyMaterial();
scene.add(rig);
const itemViewer = new ItemViewer($('item-canvas'), material);
const ceo = new Ceo({ scene, box: $('ceo'), text: $('ceo-text') });

// 松井社長's orders. Indexes of the stage arrays follow that stage's goals: [i] is said when goal i is reached.
const CEO = {
  story: 'ネクマックス、今日の仕事は 横浜を まるめることだ。まずは 直径 1m。やるか、やらないか。…やるよな？',
  town: [
    'よし、1m だ。次は 中華街。屋台も 人も まきこんで 5m を目指せ。',
    '5m か。海にも 入れるぞ。日が暮れるまでに 20m だ。',
    '20m。いよいよ ビルが 相手だ。中華街の ビルから いこう。',
    '60m。オフィスビルも いける。観覧車も 客船も 見えているな？',
    '150m。仕上げだ。ランドマークタワーごと 横浜を まるめてこい。',
  ],
  kantoStart: '横浜は 合格だ。次は 関東。夜明けの 川崎から いこう。まずは 1km。',
  kanto: [
    '1km。東京が 見えてきたな。東京タワーと スカイツリーを まきこんで 3km だ。',
    '東京も まるめたか。空港も 遊園地も まきこんで 8km。',
    '8km。あとは 山だ。筑波山、丹沢、箱根…関東ごと まるめてこい。',
  ],
  worldStart: '関東も まるめたか。ここからは 地球だ。まずは 日本列島から。',
  world: [
    '100km。富士山も もう まきこめる。日本列島を まるめて 300km だ。',
    '日本を まるめた。次は アジアだ。1,000km を目指せ。',
    'アジアが ちいさく見えるな。世界中を ころがれ。3,000km だ。',
    '大陸ごと いけるぞ。最後は 地球だ。',
  ],
  ending: '見事だ。ちいさな玉が 世界になった。やれば できる。それを 忘れるな。',
  timeattack: 'タイムアタックだ。5分で どこまで 大きくなれるか。時間は 待ってくれないぞ。',
  otsukai: 'ネクマックス、おつかいを 頼む。リストの 6つを 集めてきてくれ。大きい物は 玉を 育ててからだ。',
  kanto0: '関東から だな。夜明けの 川崎から いこう。まずは 1km。',
  world0: '日本から だな。日本列島を まるめて、世界へ ひろげるぞ。',
  drop: ['あわてるな。ぶつかる前に よく見るんだ。', '急がば回れ、だ。大きい物は よけて通れ。', 'ダッシュは 使いどころが 大事だぞ。', '動いている物には 気をつけろ。'],
  idle: (left) => `目標まで あと ${left}。手を 止めるな。`,
  errand: (name, left) => (left ? `${name}、たしかに 受け取った。あと ${left}つだ。` : 'ぜんぶ そろったな。ありがとう、助かった。'),
  result: {
    timeup: (d) => `${d} か。次は もっと いけるはずだ。`,
    clear: () => '5分 かからずに 横浜を まるめたか。たいしたものだ。',
    errand: () => 'おつかい ありがとう。仕事が 早くて 助かる。',
    story: () => 'ちいさな一歩が 世界を まるめた。やるか、やらないか。やったな。',
  },
};
let ceoDropCool = 0, ceoIdleT = 0, ceoIdleGoal = -1;
function ceoLine() { return ceo.current(); }
function ceoReact(kind) {
  if (kind === 'drop' && ceoDropCool <= 0) {
    ceoDropCool = 25;
    ceo.say(CEO.drop[(Math.random() * CEO.drop.length) | 0], { hold: 3.5 });
  }
}

// NexMax pushes the ball (optional module: the game still runs if it fails to load)
let pusher = null;
let pusherMod = null;
import('./pusher.js').then((m) => {
  pusherMod = m;
  pusher = m.createPusher();
  pusher.setVisible(false); // shown once play starts
  scene.add(pusher.root);
  m.setOutlineViewport(renderer.getDrawingBufferSize(new THREE.Vector2()).y);
}).catch((e) => console.warn('pusher unavailable', e));
let bumpedNow = false, cheerNow = false;

// VR (WebXR) — optional module; the same game, viewed through a headset
let vr = null;
import('./vr.js').then((m) => {
  vr = m.setupVR({ renderer, scene, camera, rig, material, getHud: () => hudSnapshot() });
  vr.onSupported((ok) => document.body.classList.toggle('vr-ok', ok));
}).catch((e) => console.warn('vr unavailable', e));
const vrActive = () => !!(vr && vr.active);

const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// sky dome
const skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.3, 0.4, -0.8).normalize() } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vP;
      void main(){ float h = clamp(vP.y*1.6+0.12,0.,1.); vec3 c = mix(bottom, top, pow(h,0.7));
        float s = max(dot(normalize(vP), sunDir),0.); c += sunCol*(pow(s,40.)*0.9 + pow(s,4.)*0.25);
        gl_FragColor = vec4(c,1.); }`,
  })
);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);
scene.fog = new THREE.Fog(0xcfeaf7, 100, 1000);

// ---------------------------------------------------------------- content
const reg = new ProtoRegistry();
async function loadMod(path) {
  try { return await import(path); } catch (e) { console.warn('module load failed', path, e); return null; }
}
const [small, mid, big, world, audioMod, kantoMod] = await Promise.all([
  loadMod('./models/town_small.js'), loadMod('./models/town_mid.js'), loadMod('./models/town_big.js'),
  loadMod('./models/world.js'), loadMod('./audio.js'), loadMod('./models/kanto.js'),
]);
for (const m of [small, mid, big]) if (m) reg.add(m.default || m.PROTOS, 'town');
const worldReg = new ProtoRegistry();
if (world) worldReg.add(world.default || world.PROTOS, 'world');
const kantoReg = new ProtoRegistry();
if (kantoMod) kantoReg.add(kantoMod.default || kantoMod.PROTOS, 'kanto');

const audio = audioMod && audioMod.GameAudio ? new audioMod.GameAudio() : null;
const sfx = (fn, ...a) => { try { audio && audio[fn] && audio[fn](...a); } catch (e) { /* ignore */ } };

$('loading-text').textContent = 'ヨコハマを つくっています…';
await new Promise((r) => setTimeout(r, 20));
const vrDevice = await Promise.race([
  navigator.xr && navigator.xr.isSessionSupported ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : false,
  new Promise((r) => setTimeout(() => r(false), 500)),
]);
const town = buildTown(scene, reg, material, { log: DEBUG, density: parseFloat(qs.get('density') || (vrDevice ? '0.6' : '1')) });
let stage = town;      // current stage object (town, kanto or globe)
let globe = null, kanto = null;
let stageName = 'town';
// flat stages share one interface for the ball physics
const townFlat = { isLand: M.isLand, bounds: M.BOUNDS, seaMinR: M.SEA_MIN_R, seaY: M.SEA_Y, groundY: town.groundY };
let flat = townFlat;

const minimap = new Minimap($('minimap'), M);

// ---------------------------------------------------------------- ball
const ballGroup = new THREE.Group();
scene.add(ballGroup);
const coreTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fbe9c6'; g.fillRect(0, 0, 512, 256);
  for (let row = 0; row < 7; row++) {
    g.strokeStyle = row % 2 ? '#2f6db3' : '#45a3d9'; g.lineWidth = 9;
    g.beginPath();
    for (let x = 0; x <= 512; x += 4) { const y = 22 + row * 35 + Math.sin(x / 512 * Math.PI * 8 + row) * 8; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 26; i++) { g.fillStyle = i % 3 ? '#e2483d' : '#ffd23f'; g.beginPath(); g.arc((i * 97) % 512, (i * 53) % 256, 7, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshLambertMaterial({ map: coreTex }));
core.castShadow = true;
ballGroup.add(core);

const ball = {
  pos: new THREE.Vector3(M.START.x, START_R, M.START.z),
  vel: new THREE.Vector3(),
  r: START_R,
  vol: (4 / 3) * Math.PI * START_R ** 3,
  heading: new THREE.Vector3(Math.sin(M.START.yaw), 0, Math.cos(M.START.yaw)),
  up: new THREE.Vector3(0, 1, 0),
  items: [],
  coreR: START_R * 0.92,
  support: -Infinity, // top of something low the ball is rolling over
  surf: null,         // planet: current surface radius under the ball
};
const stats = { count: 0, byName: new Map(), biggest: null, startTime: 0, elapsed: 0, landmarks: [] };

function setR(r) {
  ball.r = r;
  ball.vol = (4 / 3) * Math.PI * r ** 3;
}
if (qs.get('r')) setR(parseFloat(qs.get('r')));

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const joy = { active: false, id: null, x: 0, y: 0, ox: 0, oy: 0 };
let dragYaw = 0; // accumulated camera yaw from mouse/touch drag
let mouseDrag = null;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.55 && !joy.active) {
    joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    showJoy(e.clientX, e.clientY, 0, 0);
  } else {
    mouseDrag = { id: e.pointerId, x: e.clientX };
  }
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (joy.active && e.pointerId === joy.id) {
    const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy, R = 60;
    const l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
    joy.x = (dx * k) / R; joy.y = (-dy * k) / R;
    showJoy(joy.ox, joy.oy, dx * k, dy * k);
  } else if (mouseDrag && e.pointerId === mouseDrag.id) {
    dragYaw += (e.clientX - mouseDrag.x) * 0.006;
    mouseDrag.x = e.clientX;
  }
});
const endPointer = (e) => {
  if (joy.active && e.pointerId === joy.id) { joy.active = false; joy.x = joy.y = 0; $('joy').style.display = 'none'; }
  if (mouseDrag && e.pointerId === mouseDrag.id) mouseDrag = null;
};
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
function showJoy(x, y, dx, dy) {
  const j = $('joy'); j.style.display = 'block'; j.style.left = x + 'px'; j.style.top = y + 'px';
  $('joy-knob').style.transform = `translate(${dx}px, ${dy}px)`;
}

function readInput() {
  let f = 0, t = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) t -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) t += 1;
  if (joy.active) { f += joy.y; t += joy.x * 0.9; }
  const dash = keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight') || (joy.active && Math.hypot(joy.x, joy.y) > 0.97);
  let sx = 0; // sideways roll (VR comfort mode moves the ball sideways instead of turning the view)
  if (vrActive()) {
    const v = vr.readInput();
    f += v.f; t += v.t; sx += v.s || 0;
    if (v.snap) dragYaw += v.snap;
    if (v.dash) return { f: Math.max(-1, Math.min(1, f)), t: Math.max(-1, Math.min(1, t)), s: Math.max(-1, Math.min(1, sx)), dash: true };
  }
  if (autopilot.on) return autopilot.input();
  return { f: Math.max(-1, Math.min(1, f)), t: Math.max(-1, Math.min(1, t)), s: Math.max(-1, Math.min(1, sx)), dash };
}

// ---------------------------------------------------------------- game state
let state = 'title'; // title | play | trans | ending | result
let paused = false;
let goalIdx = 0;
let stateT = 0;
let lastDistrict = null;
let shake = 0;
let bumpCool = 0;
const camState = { dist: 1.2, height: 0.6, pos: new THREE.Vector3(), init: false };

function goals() { return stageName === 'town' ? CITY_GOALS : stageName === 'kanto' ? KANTO_GOALS : WORLD_GOALS; }
function diameterDisplay(r) {
  if (stageName === 'world') {
    const km = r * 2 * WORLD_UNIT_KM;
    return km >= 1000 ? `${Math.floor(km / 1000)},${String(Math.floor(km % 1000)).padStart(3, '0')}km` : `${km.toFixed(km < 100 ? 1 : 0)}km`;
  }
  const d = r * 2;
  if (d < 1) return `${Math.floor(d * 100)}cm ${Math.floor((d * 1000) % 10)}mm`;
  if (d < 1000) return `${Math.floor(d)}m ${String(Math.floor((d * 100) % 100)).padStart(2, '0')}cm`;
  return `${(d / 1000).toFixed(d < 10000 ? 2 : 1)}km`;
}
function goalDisplay(d) {
  if (stageName === 'world') { const km = d * WORLD_UNIT_KM; return `${(Math.round(km / (km >= 1000 ? 100 : 10)) * (km >= 1000 ? 100 : 10)).toLocaleString()}km`; }
  return d < 1 ? `${d * 100}cm` : d < 1000 ? `${d}m` : `${d / 1000}km`;
}

// ---------------------------------------------------------------- game modes
// story: Yokohama → Kanto → Japan → world. timeattack: 5 minutes in Yokohama. otsukai: NexMax's shopping list.
// kanto / world: start the story from a later stage.
const TA_SECONDS = 300;
const ERRAND = [
  { id: 'shumai_box', hint: '広場や 大さん橋' },
  { id: 'red_shoes', hint: '山下公園・運河パーク' },
  { id: 'panda_plush', hint: '中華街や 広場' },
  { id: 'lion_dancer', hint: '中華街（玉 3m〜）' },
  { id: 'rickshaw', hint: '通り・中華街（玉 4m〜）' },
  { id: 'chinatown_gate', hint: '中華街の入口（玉 22m〜）' },
];
let mode = 'story';
const errandDone = new Set();
const RECORD_KEY = 'hamakoro.records.v1';
function loadRecords() { try { return JSON.parse(localStorage.getItem(RECORD_KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveRecord(key, value, better) {
  const r = loadRecords();
  const isBest = r[key] == null || better(value, r[key]);
  if (isBest) { r[key] = value; try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch (e) { /* private mode */ } }
  return { isBest, best: isBest ? value : r[key] };
}
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmtMeters = (d) => (d < 1 ? `${Math.round(d * 100)}cm` : d < 1000 ? `${d.toFixed(d < 10 ? 2 : 1)}m` : `${(d / 1000).toFixed(d < 10000 ? 2 : 1)}km`);
function fmtItemSize(o) {
  if (stageName === 'world') { const km = o.size * WORLD_UNIT_KM; return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km).toLocaleString()}km`; }
  return fmtMeters(o.size);
}
function showRecords() {
  const r = loadRecords();
  const set = (k, t) => { const el = document.querySelector(`[data-rec="${k}"]`); if (el) el.textContent = t; };
  set('story', r.story != null ? `ベスト ${fmtTime(r.story)}` : '');
  set('timeattack', r.timeattack != null ? `ベスト 直径 ${fmtMeters(r.timeattack)}` : '');
  set('otsukai', r.otsukai != null ? `ベスト ${fmtTime(r.otsukai)}` : '');
}
function setupErrand() {
  errandDone.clear();
  $('errand').classList.remove('hidden');
  $('errand-list').innerHTML = ERRAND.map((e) => {
    const p = reg.get(e.id);
    return `<li data-id="${e.id}"><div><span>${p ? p.name : e.id}</span><small>${e.hint}</small></div></li>`;
  }).join('');
}
function errandPicked(o) {
  if (mode !== 'otsukai' || errandDone.has(o.proto.id) || !ERRAND.some((e) => e.id === o.proto.id)) return false;
  errandDone.add(o.proto.id);
  const li = document.querySelector(`#errand-list li[data-id="${o.proto.id}"]`);
  if (li) li.classList.add('done');
  const left = ERRAND.length - errandDone.size;
  banner(`${o.name} ゲット！`, left ? `あと ${left} こ` : 'おつかい かんりょう！', 2);
  ceo.say(CEO.errand(o.name, left), { hold: 3.5 });
  sfx('sfxLevelUp');
  cheerNow = true;
  if (!left) setTimeout(() => showResult('errand'), 1200);
  return true;
}

// ---------------------------------------------------------------- toast / banners
function needDisplay(d) {
  if (stageName === 'world') { const km = d * WORLD_UNIT_KM; return km < 100 ? `${km.toFixed(0)}km` : `${(Math.ceil(km / 10) * 10).toLocaleString()}km`; }
  return d < 1 ? `${Math.ceil(d * 100)}cm` : d < 1000 ? `${Math.ceil(d)}m` : `${(d / 1000).toFixed(1)}km`;
}
let noticeTimer = 0;
function notice(text) {
  const el = $('notice');
  el.textContent = text;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  noticeTimer = 2.6;
}
let toastTimer = 0;
function toast(name, big = false) {
  const el = $('toast');
  el.innerHTML = `<b>${name}</b> を まきこんだ！`;
  el.classList.toggle('big', big);
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  toastTimer = big ? 3 : 1.6;
}
let bannerTimer = 0;
function banner(text, sub = '', time = 2.6) {
  $('banner-main').textContent = text;
  $('banner-sub').textContent = sub;
  const el = $('banner');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  bannerTimer = time;
}
let msgTimer = 0;
function message(text, time = 4) {
  const el = $('message');
  el.textContent = text;
  el.classList.add('show');
  msgTimer = time;
}

// ---------------------------------------------------------------- picking / bumping
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

// The most one item may add, as a fraction of the ball's volume: generous while the ball is small,
// tighter once whole buildings are on the menu so the late city doesn't snowball in a minute.
const CAP_CURVE = [[12, 0.5], [25, 0.14], [40, 0.05], [100, 0.02], [300, 0.013]]; // [diameter m, max fraction one item adds]
function growCap() {
  if (stageName === 'kanto') {
    const D = ball.r * 2;
    if (D < 3000) return 0.08;
    const t = Math.min(1, (Math.log(D) - Math.log(3000)) / (Math.log(15000) - Math.log(3000)));
    return Math.exp(Math.log(0.08) + (Math.log(0.035) - Math.log(0.08)) * t);
  }
  if (stageName === 'world') {
    // planet: steady through Japan and Asia, stingier once whole countries are edible
    const D = ball.r * 2;
    if (D < 47) return 0.06;
    const t = Math.min(1, (Math.log(D) - Math.log(47)) / (Math.log(470) - Math.log(47)));
    return Math.exp(Math.log(0.05) + (Math.log(0.022) - Math.log(0.05)) * t);
  }
  const D = ball.r * 2;
  if (D < CAP_CURVE[0][0]) return Infinity;
  for (let i = 0; i < CAP_CURVE.length - 1; i++) {
    const [d0, c0] = CAP_CURVE[i], [d1, c1] = CAP_CURVE[i + 1];
    if (D <= d1) {
      const t = (Math.log(D) - Math.log(d0)) / (Math.log(d1) - Math.log(d0));
      return Math.exp(Math.log(c0) + (Math.log(c1) - Math.log(c0)) * t);
    }
  }
  return CAP_CURVE[CAP_CURVE.length - 1][1];
}
// Kanto / planet: grow by the thing's real bulk. A flat airport or rice field is wide but thin, so it
// counts for much less than a mountain of the same width (it used to count as a full cube).
function bulkOf(o) {
  const p = o.proto, s = o.scale;
  const w = p.w * s, d = p.d * s, h = p.h * s;
  const m = Math.max(w, d, h);
  return Math.max(w, m * 0.08) * Math.max(d, m * 0.08) * Math.max(h, m * 0.18);
}
function growthOf(o) {
  const a = stageName === 'town' ? o.vol * GROW_K : bulkOf(o) * (stageName === 'kanto' ? SIZE_K_KANTO : SIZE_K);
  const c = growCap() * ball.vol;
  if (!isFinite(c)) return a;
  return a / Math.cbrt(1 + (a / c) ** 3); // ~linear below the cap, flat above it
}
function pick(o) {
  o.picked = true;
  const gained = growthOf(o);
  ball.vol += gained;
  const newR = Math.cbrt((ball.vol * 3) / (4 * Math.PI));
  const oldR = ball.r;
  ball.r = newR;
  // attach a copy of the mesh to the ball
  const mesh = new THREE.Mesh(o.proto.geom, material);
  mesh.castShadow = true;
  const dir = _v.copy(o.center).sub(ball.pos);
  if (dir.lengthSq() < 1e-10) dir.copy(ball.heading);
  dir.normalize();
  const invB = ballGroup.quaternion.clone().invert();
  const localDir = dir.clone().applyQuaternion(invB);
  const localQ = invB.clone().multiply(o.quat);
  const dist = oldR * 0.8 + Math.min(o.size * 0.14, oldR * 0.3);
  mesh.quaternion.copy(localQ);
  mesh.scale.setScalar(o.scale);
  const cOff = o.proto.center.clone().multiplyScalar(o.scale).applyQuaternion(localQ);
  mesh.position.copy(localDir).multiplyScalar(dist).sub(cOff);
  ballGroup.add(mesh);
  ball.items.push({ mesh, o, dist, ext: o.size * 0.5, gained });
  // stats
  stats.count++;
  stats.byName.set(o.name, (stats.byName.get(o.name) || 0) + 1);
  if (!stats.biggest || o.size > stats.biggest.size) stats.biggest = { name: o.name, size: o.size };
  const ratio = o.size / (2 * oldR);
  const special = errandPicked(o);
  if (o.landmark) { stats.landmarks.push(o.name); toast(o.name, true); sfx('sfxLevelUp'); }
  if (!pickSfx || ratio > pickSfx.ratio) pickSfx = { ratio, kind: o.proto.kind };
  const weight = ratio + (o.landmark || special ? 10 : 0);
  if (!cardCand || weight > cardCand.weight) cardCand = { o, weight, ratio, n: stats.count };
}
let pickSfx = null, cardCand = null, cardShown = null, cardT = 0;
function flushPickSfx() {
  if (pickSfx) { sfx('sfxPickup', pickSfx.ratio, pickSfx.kind); pickSfx = null; }
  // the corner card shows the latest notable catch in 3D (bigger or special catches jump the queue)
  if (cardCand && (cardT <= 0 || cardCand.weight > (cardShown ? cardShown.weight * 1.3 : 0))) {
    const { o, n } = cardCand;
    itemViewer.show(o.proto);
    $('item-name').textContent = o.name;
    $('item-meta').textContent = `大きさ ${fmtItemSize(o)} ・ ${n.toLocaleString()}こ目`;
    const card = $('item-card');
    card.classList.remove('hidden', 'pop'); void card.offsetWidth; card.classList.add('pop');
    cardShown = cardCand; cardT = 0.45;
    cardCand = null;
  }
}

function buryItems() {
  const cr = ball.r * 0.86;
  ball.coreR = cr;
  for (let i = ball.items.length - 1; i >= 0; i--) {
    const it = ball.items[i];
    if (it.dist + it.ext * 0.3 < cr || ball.items.length > 420 && i < ball.items.length - 420) {
      ballGroup.remove(it.mesh);
      ball.items.splice(i, 1);
    }
  }
}

// Knock items off the ball after a hard hit. Only things stuck on the outside fall off, never a big
// catch (each item may cost at most 4% of the ball), and they land back in the world to be picked up again.
function dropItems(n, normal) {
  const lost = [];
  for (let i = ball.items.length - 1; i >= 0 && lost.length < n; i--) {
    const it = ball.items[i];
    const o = it.o;
    if (o.size < ball.r * 0.25) continue;              // tiny bits stay stuck in the ball
    if ((it.gained || 0) > ball.vol * 0.04) continue;  // a big catch doesn't come off from one bump
    ball.items.splice(i, 1);
    ballGroup.remove(it.mesh);
    const side = new THREE.Vector3().crossVectors(ball.up, normal).multiplyScalar((Math.random() - 0.5) * 2);
    const p = ball.pos.clone().addScaledVector(normal, ball.r * 1.4 + o.size).add(side.multiplyScalar(ball.r));
    if (stageName !== 'world') {
      if (!flat.isLand(p.x, p.z) && o.proto.def.move !== 'sail') continue;
      p.y = o.mover && o.mover.type === 'sail' ? o.pos.y : 0;
      stage.objs.teleport(o, p, o.quat);
      if (o.mover && o.mover.type === 'walk') { o.mover.hx = p.x; o.mover.hz = p.z; o.mover.tx = p.x; o.mover.tz = p.z; }
    } else {
      const nn = p.clone().normalize();
      p.copy(nn).multiplyScalar(EARTH_R);
      stage.objs.teleport(o, p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nn));
    }
    ball.vol = Math.max(ball.vol - (it.gained || 0), (4 / 3) * Math.PI * START_R ** 3);
    ball.r = Math.cbrt((ball.vol * 3) / (4 * Math.PI));
    o.picked = false;
    o.cool = 1.5; // can't be re-picked immediately
    stats.count = Math.max(0, stats.count - 1);
    lost.push(o.name);
  }
  if (lost.length) sfx('sfxDrop');
  return lost;
}

// ---------------------------------------------------------------- physics step
function maxSpeed(dash) {
  const r = ball.r;
  let base;
  if (stageName === 'kanto') base = 2.6 * r;
  else if (stageName === 'world') base = r <= 60 ? 2.6 * r : 156 * Math.pow(r / 60, 0.8);
  else base = r <= 8 ? 1.7 + 5.4 * r : (1.7 + 5.4 * 8) * Math.pow(r / 8, 0.78);
  // VR comfort mode slows things a little (vr.speedScale), and the VR module eases the dash in
  return base * (dash ? 1.65 : 1) * (vrActive() && vr.speedScale ? vr.speedScale : 1);
}

let inpDash = false;
function step(dt, inp) {
  inpDash = inp.dash;
  const up = ball.up;
  // steering
  const turnRate = 1.9;
  ball.heading.applyAxisAngle(up, -inp.t * turnRate * dt - dragYaw);
  dragYaw = 0;
  const right = _v2.crossVectors(ball.heading, up).normalize();
  const ms = maxSpeed(inp.dash);
  const acc = ms * 2.4;
  ball.vel.addScaledVector(ball.heading, inp.f * acc * dt);
  ball.vel.addScaledVector(right, inp.t * acc * 0.35 * dt * (inp.f === 0 ? 1 : 0.4));
  if (inp.s) ball.vel.addScaledVector(right, inp.s * acc * 0.8 * dt);
  const fr = inp.f !== 0 || inp.s ? 0.6 : 1.8;
  ball.vel.multiplyScalar(Math.exp(-fr * dt));
  const sp = ball.vel.length();
  if (sp > ms) ball.vel.multiplyScalar(ms / sp);

  // integrate in sub-steps to avoid tunnelling through thin things
  const travel = ball.vel.length() * dt;
  const sub = Math.min(4, Math.max(1, Math.ceil(travel / (ball.r * 0.6))));
  const h = dt / sub;
  for (let s = 0; s < sub; s++) {
    if (stageName === 'world') moveSphere(h); else moveFlat(h);
    collide();
  }
  // roll the ball
  const v = ball.vel.length();
  if (v > 1e-4) {
    const axis = _v.crossVectors(up, ball.vel).normalize();
    _q.setFromAxisAngle(axis, (v * dt) / Math.max(ball.r, 1e-3));
    ballGroup.quaternion.premultiply(_q);
  }
  ballGroup.position.copy(ball.pos);
  buryItems();
}

function moveFlat(h) {
  const B = flat.bounds;
  let nx = ball.pos.x + ball.vel.x * h, nz = ball.pos.z + ball.vel.z * h;
  if (ball.r < flat.seaMinR) {
    // the sea is too deep for a small ball: slide along the quay
    if (!flat.isLand(nx, nz)) {
      if (flat.isLand(nx, ball.pos.z)) { nz = ball.pos.z; ball.vel.z *= -0.2; }
      else if (flat.isLand(ball.pos.x, nz)) { nx = ball.pos.x; ball.vel.x *= -0.2; }
      else { nx = ball.pos.x; nz = ball.pos.z; ball.vel.multiplyScalar(-0.2); }
    }
  }
  nx = Math.max(B.x0 + ball.r, Math.min(B.x1 - ball.r, nx));
  nz = Math.max(B.z0 + ball.r, Math.min(B.z1 - ball.r, nz));
  ball.pos.x = nx; ball.pos.z = nz;
  // ground: land at y=0, sea bed below; a ball resting over the quay edge is held up by it
  let gy = flat.groundY(nx, nz);
  if (gy < 0) {
    const e = ball.r * 0.7;
    if (flat.isLand(nx + e, nz) || flat.isLand(nx - e, nz) || flat.isLand(nx, nz + e) || flat.isLand(nx, nz - e)) gy = 0;
  }
  if (ball.support > gy) gy = ball.support; // rolling over something low
  const ty = gy + ball.r;
  ball.pos.y += (ty - ball.pos.y) * Math.min(1, h * 10);
}

function moveSphere(h) {
  ball.pos.addScaledVector(ball.vel, h);
  const n = ball.up.copy(ball.pos).normalize();
  const want = Math.max(EARTH_R, ball.support); // rolling over something low
  ball.surf = ball.surf == null ? want : ball.surf + (want - ball.surf) * Math.min(1, h * 10);
  ball.pos.copy(n).multiplyScalar(ball.surf + ball.r);
  ball.vel.addScaledVector(n, -ball.vel.dot(n));
  ball.heading.addScaledVector(n, -ball.heading.dot(n)).normalize();
}

// Collisions. Smaller things stick; low things (lower than about half the ball's radius) are rolled
// over; anything else is a wall. Whether a hit knocks items off depends on how hard it was:
// the closing speed (your speed plus the other thing's, if it was moving into you) against your
// normal top speed, and how much bigger the obstacle is than what you could pick up.
// Normal-speed bumps never cost anything; a full dash into a building, or a car running into you, can.
const CLIMB_K = 0.55;
let lastBump = null, dropCool = 0, hintCool = 0;
const ZERO = new THREE.Vector3();
function topOf(o) {
  // height of the object's top above the surface the ball rolls on
  if (stageName === 'world') return o.pos.length() + stage.objs.topHeight(o);
  return o.pos.y + stage.objs.topHeight(o);
}
function collide() {
  const r = ball.r;
  const hits = [];
  stage.objs.contacts(ball.pos, r, (o, dist, normal) => hits.push({ o, dist, normal: normal.clone() }));
  const base = stageName === 'world' ? ball.pos.length() - r : ball.pos.y - r; // bottom of the ball
  ball.support = -Infinity;
  for (const hit of hits) {
    const o = hit.o;
    if (o.picked) continue;
    if (o.cool > 0) continue;
    if (o.size < r * PICK_K) { pick(o); continue; }
    const top = topOf(o);
    if (top - base <= r * CLIMB_K) {
      ball.support = Math.max(ball.support, top); // roll over it
      continue;
    }
    // solid: push out along the surface tangent
    const n = hit.normal;
    n.addScaledVector(ball.up, -n.dot(ball.up));
    if (n.lengthSq() < 1e-6) continue;
    n.normalize();
    const pen = r - hit.dist;
    ball.pos.addScaledVector(n, pen + 1e-4);
    const ov = o.vel || ZERO;
    const vn = ball.vel.dot(n), on = ov.dot(n);
    if (vn < 0) ball.vel.addScaledVector(n, -vn * 1.45);       // bounce off
    if (on > ball.vel.dot(n)) ball.vel.addScaledVector(n, on - ball.vel.dot(n)); // shoved by a moving thing
    const ms = maxSpeed(false);
    const impact = Math.max(0, on - vn) / ms; // closing speed; 1 = head-on at normal top speed
    if (bumpCool > 0 || impact < 0.25) continue;
    bumpCool = 0.35;
    shake = Math.max(shake, Math.min(1, impact) * 0.6);
    sfx('sfxBump', Math.min(1, impact));
    bumpedNow = true;
    lastBump = o.name;
    const heavy = Math.min(1, Math.max(0, o.size / (r * PICK_K) - 1));
    const damage = impact * (0.7 + 0.3 * heavy);
    if (damage > 1.15 && dropCool <= 0 && ball.items.length > 4) {
      const lost = dropItems(damage > 1.6 ? 2 : 1, n);
      if (lost.length) {
        dropCool = 2.5;
        const what = lost.join('と');
        const moving = ov.lengthSq() > (ms * 0.25) ** 2;
        notice(moving ? `${o.name}に ぶつかられて ${what}を おとした！` : inpDash ? `ダッシュで ${o.name}に 激突！ ${what}を おとした` : `${o.name}に 強く ぶつかって ${what}を おとした`);
        ceoReact('drop');
      }
    } else if (hintCool <= 0) {
      hintCool = 4;
      notice(`${o.name}は 直径 ${needDisplay(o.size / PICK_K * 2)} から まきこめる`);
    }
  }
}

// ---------------------------------------------------------------- autopilot (testing / attract mode)
const autopilot = {
  on: qs.has('auto'), target: null, retarget: 0, since: 0, bad: new Set(), lastCount: 0, wander: 0,
  input() {
    const dt = 1 / 30;
    this.retarget -= dt; this.since += dt;
    if (stats.count !== this.lastCount) { this.lastCount = stats.count; this.since = 0; }
    if (this.since > 5 && this.target) { this.bad.add(this.target); this.target = null; this.since = 0; this.wander = 2.5; }
    if (this.wander > 0) { this.wander -= dt; return { f: 1, t: 0.6, dash: true }; }
    if (!this.target || this.target.picked || this.retarget <= 0) {
      this.retarget = 2;
      let best = null, bd = Infinity;
      for (const o of stage.objs.objs) {
        if (o.picked || this.bad.has(o) || o.size >= ball.r * PICK_K || o.size < ball.r * 0.12) continue;
        const alt = stageName === 'world' ? o.pos.length() - EARTH_R : o.pos.y;
        if (alt > ball.r * 1.5) continue; // flying out of reach
        const d = o.center.distanceTo(ball.pos) / (0.4 + o.size / ball.r);
        if (d < bd) { bd = d; best = o; }
      }
      this.target = best;
    }
    if (!this.target) return { f: 1, t: 0.3, dash: true };
    const to = _v.copy(this.target.center).sub(ball.pos);
    to.addScaledVector(ball.up, -to.dot(ball.up));
    const dist = to.length();
    const right = _v2.crossVectors(ball.heading, ball.up);
    const a = Math.atan2(to.dot(right), to.dot(ball.heading));
    const f = Math.cos(a) > 0.5 ? 1 : dist < ball.r * 12 ? -0.2 : 0.25;
    return { f, t: Math.max(-1, Math.min(1, a * 2.5)), dash: dist > ball.r * 30 };
  },
};

// ---------------------------------------------------------------- environment / time of day
const C = (h) => new THREE.Color(h);
const SKY = {
  day: { top: C(0x3d94e0), bottom: C(0xd6eef9), sun: C(0xfff4dc), hemi: 1.5, sunI: 2.4, fog: C(0xcfe7f4), water: C(0x3a8cc4) },
  dusk: { top: C(0x3a4d93), bottom: C(0xffa877), sun: C(0xff9a50), hemi: 1.0, sunI: 1.8, fog: C(0xe9a98e), water: C(0x36628f) },
  night: { top: C(0x060b26), bottom: C(0x24305e), sun: C(0x8fa6ff), hemi: 0.55, sunI: 0.55, fog: C(0x1b2448), water: C(0x16294a) },
};
let tod = 0;
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function lerpEnv(key, t) {
  if (t < 0.5) return _c1.copy(SKY.day[key]).lerp(SKY.dusk[key], t * 2);
  return _c1.copy(SKY.dusk[key]).lerp(SKY.night[key], (t - 0.5) * 2);
}
function lerpNum(key, t) { return t < 0.5 ? SKY.day[key] + (SKY.dusk[key] - SKY.day[key]) * t * 2 : SKY.dusk[key] + (SKY.night[key] - SKY.dusk[key]) * (t - 0.5) * 2; }

function updateEnvironment(dt) {
  if (stageName === 'town') {
    const D = ball.r * 2;
    const target = THREE.MathUtils.clamp((Math.log10(D) - Math.log10(4)) / (Math.log10(160) - Math.log10(4)), 0, 1);
    tod += (target - tod) * Math.min(1, dt * 0.5);
    skyUniforms.top.value.copy(lerpEnv('top', tod));
    skyUniforms.bottom.value.copy(lerpEnv('bottom', tod));
    skyUniforms.sunCol.value.copy(lerpEnv('sun', tod));
    sun.color.copy(lerpEnv('sun', tod));
    sun.intensity = lerpNum('sunI', tod);
    hemi.intensity = lerpNum('hemi', tod);
    hemi.color.copy(_c2.set(0xffffff).lerp(SKY.night.sun, Math.max(0, tod - 0.5) * 2));
    scene.fog.color.copy(lerpEnv('fog', tod));
    town.waterMat.color.copy(lerpEnv('water', tod));
    nightUniform.value = THREE.MathUtils.smoothstep(tod, 0.45, 0.95);
    // sun sinks toward the west as evening falls
    const el = THREE.MathUtils.lerp(0.75, 0.12, Math.min(tod * 1.4, 1));
    skyUniforms.sunDir.value.set(-0.55, el, -0.6).normalize();
    scene.fog.near = 40 + ball.r * 22;
    scene.fog.far = 1100 + ball.r * 45;
  } else if (stageName === 'kanto') {
    // dawn after the Yokohama night, turning into a clear morning as the ball grows
    const D = ball.r * 2;
    const k = THREE.MathUtils.clamp((Math.log(D) - Math.log(300)) / (Math.log(4000) - Math.log(300)), 0, 1);
    const target = 0.5 * (1 - k);
    tod += (target - tod) * Math.min(1, dt * 0.5);
    skyUniforms.top.value.copy(lerpEnv('top', tod));
    skyUniforms.bottom.value.copy(lerpEnv('bottom', tod));
    skyUniforms.sunCol.value.copy(lerpEnv('sun', tod));
    sun.color.copy(lerpEnv('sun', tod));
    sun.intensity = lerpNum('sunI', tod);
    hemi.intensity = lerpNum('hemi', tod);
    hemi.color.set(0xffffff);
    scene.fog.color.copy(lerpEnv('fog', tod));
    kanto.waterMat.color.copy(lerpEnv('water', tod));
    nightUniform.value = 0.4 * Math.max(0, tod * 2 - 0.2);
    const el = THREE.MathUtils.lerp(0.1, 0.8, 1 - tod * 2);
    skyUniforms.sunDir.value.set(0.7, el, -0.35).normalize();
    scene.fog.near = 2000 + ball.r * 25;
    scene.fog.far = 16000 + ball.r * 70;
  } else {
    nightUniform.value = 0.25;
  }
}

// ---------------------------------------------------------------- camera
function updateCamera(dt, mode = 'play') {
  const r = ball.r;
  let wantDist = 1.0 + r * 5.6, wantH = 0.5 + r * 2.8; // high enough to see the ball over NexMax's helmet
  if (mode === 'pull') { wantDist *= 3.2; wantH *= 4.5; }
  const k = camState.init ? 1 - Math.exp(-dt * 2.5) : 1;
  camState.dist += (wantDist - camState.dist) * k;
  camState.height += (wantH - camState.height) * k;
  const target = _v.copy(ball.pos).addScaledVector(ball.up, r * 0.55);
  const want = _v2.copy(ball.pos).addScaledVector(ball.heading, -camState.dist).addScaledVector(ball.up, camState.height);
  if (!camState.init) { camState.pos.copy(want); camState.init = true; }
  camState.pos.lerp(want, 1 - Math.exp(-dt * 7));
  if (stageName !== 'world') camState.pos.y = Math.max(camState.pos.y, (flat.isLand(camState.pos.x, camState.pos.z) ? 0 : flat.seaY) + 0.15 + r * 0.2);
  camera.position.copy(camState.pos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * r * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * r * 0.5;
    shake = Math.max(0, shake - dt * 2.5);
  }
  camera.up.copy(ball.up);
  camera.lookAt(target);
  const near = Math.max(0.03, r * 0.12);
  const far = stageName !== 'world' ? scene.fog.far * 1.6 + 2000 : 3000 + r * 300;
  if (Math.abs(camera.near - near) / near > 0.05 || camera.far !== far) {
    camera.near = near; camera.far = far; camera.updateProjectionMatrix();
  }
  camera.getWorldPosition(sky.position);
  sky.scale.setScalar(camera.far * 0.9);
  // shadow box follows the ball
  const sd = skyUniforms.sunDir.value;
  if (stageName !== 'world') {
    sun.position.copy(ball.pos).addScaledVector(sd, 60 + r * 30);
  } else {
    const right = _v.crossVectors(ball.heading, ball.up);
    const ld = new THREE.Vector3().copy(ball.up).multiplyScalar(0.9).addScaledVector(right, -0.35).addScaledVector(ball.heading, 0.3).normalize();
    sun.position.copy(ball.pos).addScaledVector(ld, 80 + r * 30);
  }
  sun.target.position.copy(ball.pos);
  const ext = Math.max(6, r * 16);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - ext) / ext > 0.08) {
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.near = 1; sc.far = (60 + r * 30) * 2 + ext;
    sc.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- HUD
function updateHUD() {
  $('size').textContent = diameterDisplay(ball.r);
  const G = goals();
  const g = G[Math.min(goalIdx, G.length - 1)];
  const prev = goalIdx > 0 ? G[goalIdx - 1].d : stageStartD;
  const D = ball.r * 2;
  const p = THREE.MathUtils.clamp((Math.log(D) - Math.log(prev)) / (Math.log(g.d) - Math.log(prev)), 0, 1);
  if (mode === 'otsukai') {
    $('goal-bar').style.width = (errandDone.size / ERRAND.length * 100).toFixed(1) + '%';
    $('goal-label').textContent = `おつかい ${errandDone.size} / ${ERRAND.length}`;
  } else {
    $('goal-bar').style.width = (p * 100).toFixed(1) + '%';
    $('goal-label').textContent = `目標 ${goalDisplay(g.d)}`;
  }
  $('count').textContent = `${stats.count.toLocaleString()} こ`;
  const t = stats.elapsed;
  const left = TA_SECONDS - t;
  $('timer').textContent = mode === 'timeattack' ? `のこり ${fmtTime(Math.max(0, left))}` : fmtTime(t);
  $('timer').classList.toggle('hurry', mode === 'timeattack' && left < 30);
  // size ring
  const ring = $('size-ring');
  const ringScale = THREE.MathUtils.clamp(D / g.d, 0.05, 1);
  ring.style.setProperty('--fill', ringScale.toFixed(3));
}

// Everything the HUD shows, as plain data (the VR module draws it on a panel inside the headset).
function hudSnapshot() {
  const vis = (id) => $(id).classList.contains('show');
  const bar = parseFloat($('goal-bar').style.width) || 0;
  return {
    state, mode, stage: stageName,
    size: $('size').textContent, goal: $('goal-label').textContent, goalProgress: bar / 100,
    count: $('count').textContent, timer: $('timer').textContent, district: $('district').textContent,
    message: vis('message') ? $('message').textContent : '',
    banner: vis('banner') ? { main: $('banner-main').textContent, sub: $('banner-sub').textContent } : null,
    toast: vis('toast') ? $('toast').textContent : '',
    ceo: typeof ceoLine === 'function' ? ceoLine() : null,
    item: cardShown ? { name: cardShown.o.name, meta: $('item-meta').textContent, proto: cardShown.o.proto } : null,
    errand: mode === 'otsukai' ? ERRAND.map((e) => ({ name: (reg.get(e.id) || { name: e.id }).name, done: errandDone.has(e.id) })) : null,
    result: state === 'result' ? { title: $('result-title').textContent, desc: $('result-desc').textContent } : null,
  };
}

function checkGoals() {
  if (mode === 'otsukai') return;
  const G = goals();
  if (goalIdx >= G.length) return;
  if (ball.r * 2 >= G[goalIdx].d) {
    const g = G[goalIdx];
    goalIdx++;
    sfx('sfxLevelUp');
    cheerNow = true;
    if (goalIdx >= G.length) {
      if (mode === 'timeattack') showResult('clear');
      else if (stageName === 'town') startTransition('kanto');
      else if (stageName === 'kanto') startTransition('world');
      else startEnding();
    } else {
      banner(g.done, '');
      const order = (stageName === 'town' ? CEO.town : stageName === 'kanto' ? CEO.kanto : CEO.world)[goalIdx - 1];
      setTimeout(() => { if (state === 'play') { if (order) ceo.say(order, { hold: 5 }); else message(G[goalIdx].text, 6); } }, 1600);
      ceoIdleT = 0;
      if (stageName === 'town' && goalIdx === 3) sfx('setMusic', 'night');
    }
  }
}

function checkDistrict() {
  if (stageName === 'world') {
    const { lat, lon } = vecToLatLon(ball.pos);
    const name = worldRegion(lat, lon);
    if (name !== lastDistrict) { lastDistrict = name; $('district').textContent = name; }
    return;
  }
  if (stageName === 'kanto') {
    const rg = K.regionAt(ball.pos.x, ball.pos.z);
    if (rg.name !== lastDistrict) {
      lastDistrict = rg.name;
      $('district').textContent = rg.name;
      if (state === 'play' && rg.name !== '関東平野') banner(rg.name, 'エリア', 1.8);
    }
    return;
  }
  const d = M.districtAt(ball.pos.x, ball.pos.z);
  const name = d ? d.name : '横浜港';
  if (name !== lastDistrict) {
    lastDistrict = name;
    $('district').textContent = name;
    if (name !== '横浜のまち' && state === 'play' && ball.r < 60) banner(name, 'エリア', 1.8);
  }
}

function worldRegion(lat, lon) {
  if (lat > 66) return '北極';
  if (lat < -60) return '南極';
  if (lat > 24 && lat < 46 && lon > 128 && lon < 146) return '日本';
  if (lon > 60 && lon < 150 && lat > -10) return 'アジア';
  if (lon > 110 && lon < 180 && lat < -10) return 'オセアニア';
  if (lon > -20 && lon < 50 && lat > 36) return 'ヨーロッパ';
  if (lon > -20 && lon < 52 && lat <= 36 && lat > -36) return 'アフリカ';
  if (lon > 35 && lon <= 60 && lat > 12 && lat < 40) return '中東';
  if (lon < -30 && lon > -170 && lat > 12) return '北アメリカ';
  if (lon < -30 && lon > -90 && lat <= 12) return '南アメリカ';
  return '大海原';
}

// ---------------------------------------------------------------- stage transitions
let transTo = null;
function startTransition(next) {
  state = 'trans'; stateT = 0; transTo = next;
  if (next === 'kanto') banner('ヨコハマを まるめた！', 'つぎは 関東だ！', 3.4);
  else banner('関東を まるめた！', 'つぎは 日本、そして世界へ', 3.4);
  sfx('sfxWhoosh');
}

function disposeFlatStage(st) {
  if (!st) return;
  scene.remove(st.group);
  st.objs.dispose();
  st.group.traverse((m) => { if (m.isMesh && m.material && m.material.map) m.material.map.dispose(); });
}

function enterKanto() {
  disposeFlatStage(town);
  kanto = buildKanto(scene, kantoReg, material, {
    log: DEBUG, texSize: innerWidth < 900 || vrDevice ? 2048 : 4096, density: parseFloat(qs.get('density') || (vrDevice ? '0.6' : '1')),
    fujiGeom: worldReg.get('mt_fuji') ? worldReg.get('mt_fuji').geom : null,
  });
  stage = kanto; stageName = 'kanto';
  flat = { isLand: K.isLand, bounds: K.BOUNDS, seaMinR: 0, seaY: K.SEA_Y, groundY: kanto.groundY };
  goalIdx = 0;
  stageStartD = ball.r * 2;
  ball.pos.set(K.START.x, ball.r, K.START.z);
  ball.heading.set(Math.sin(K.START.yaw), 0, Math.cos(K.START.yaw));
  ball.up.set(0, 1, 0);
  ball.vel.set(0, 0, 0);
  tod = 0.5;
  camState.init = false;
  minimap.setFlatMap(kanto.canvas, K.BOUNDS, K.LABELS.map(([n, x, z]) => [n, x, z, '#335']), 220000);
  lastDistrict = null;
}

function enterWorld() {
  const startR = Math.max(1.2, ball.r / (WORLD_UNIT_KM * 1000)); // metres → planet units (1 unit = 6,371 m)
  const factor = startR / ball.r;
  // shrink what's stuck on the ball into world units
  for (const it of ball.items) {
    it.mesh.position.multiplyScalar(factor);
    it.mesh.scale.multiplyScalar(factor);
    it.dist *= factor; it.ext *= factor;
  }
  // keep only the most recent bits so the ball looks like a souvenir of the journey
  while (ball.items.length > 160) { const it = ball.items.shift(); ballGroup.remove(it.mesh); }
  disposeFlatStage(kanto); kanto = null;
  if (stage === town) disposeFlatStage(town);
  scene.fog = null;
  sky.visible = false;
  scene.background = new THREE.Color(0x02030c);
  globe = buildGlobe(scene, worldReg, material, world, { texW: qs.get('tex') ? +qs.get('tex') : innerWidth < 900 ? 2048 : 4096 });
  stage = globe; stageName = 'world';
  goalIdx = 0;
  setR(startR);
  stageStartD = startR * 2;
  latLonToVec(35.45, 139.64, ball.up);
  ball.pos.copy(ball.up).multiplyScalar(EARTH_R + ball.r);
  // head west along Japan first
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(ball.up, -ball.up.y).normalize();
  ball.heading.copy(north).applyAxisAngle(ball.up, Math.PI * 0.62);
  ball.vel.set(0, 0, 0);
  hemi.intensity = 1.3; hemi.color.set(0xffffff); hemi.groundColor.set(0x667788);
  sun.intensity = 2.3; sun.color.set(0xfff6e8);
  camState.init = false;
  minimap.setWorld(globe.canvas);
  lastDistrict = null;
}

function startEnding() {
  state = 'ending'; stateT = 0;
  ceo.say(CEO.ending, { hold: 7, sky: true });
  banner('地球を まきこむぞ！', '', 3);
  sfx('sfxWhoosh');
  sfx('setMusic', 'ending');
}

function showResult(kind = 'story') {
  if (state === 'result') return;
  state = 'result';
  const t = stats.elapsed;
  const top = [...stats.byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const bigName = stats.landmarks.length ? stats.landmarks.slice(-4).join('、') : (stats.biggest ? stats.biggest.name : '-');
  let title, desc, cells;
  if (kind === 'timeup' || kind === 'clear') {
    const D = ball.r * 2;
    const rec = saveRecord('timeattack', D, (a, b) => a > b);
    title = kind === 'clear' ? 'ヨコハマを まるめた！' : 'タイムアップ！';
    desc = kind === 'clear' ? `${fmtTime(t)} で ヨコハマを まるごと まきこみました。` : '5分間で ここまで 大きくなりました。';
    cells = [['さいごの大きさ', fmtMeters(D)], ['まきこんだ数', `${stats.count.toLocaleString()} こ`], [rec.isBest ? 'ベスト更新！' : 'ベスト記録', fmtMeters(rec.best)], ['いちばんの大物', bigName]];
  } else if (kind === 'errand') {
    const rec = saveRecord('otsukai', t, (a, b) => a < b);
    title = 'おつかい かんりょう！';
    desc = 'たのまれた 6つの品物を ぜんぶ まきこみました。ネクマックスも 大よろこび！';
    cells = [['かかった時間', fmtTime(t)], [rec.isBest ? 'ベスト更新！' : 'ベスト記録', fmtTime(rec.best)], ['まきこんだ数', `${stats.count.toLocaleString()} こ`], ['玉の大きさ', diameterDisplay(ball.r)]];
  } else {
    const rec = mode === 'story' ? saveRecord('story', t, (a, b) => a < b) : null;
    title = 'せかいが まるくなった！';
    desc = mode === 'story' ? 'ヨコハマから はじまった ちいさな玉は、関東、日本をこえて ついに 地球まで まきこみました。' : 'ちいさな玉は ついに 地球まで まきこみました。';
    cells = [['かかった時間', fmtTime(t)], ['まきこんだ数', `${stats.count.toLocaleString()} こ`], ['さいごの大きさ', diameterDisplay(ball.r)],
      rec ? [rec.isBest ? 'ベスト更新！' : 'ベスト記録', fmtTime(rec.best)] : ['大物', bigName]];
  }
  const said = kind === 'timeup' ? CEO.result.timeup(fmtMeters(ball.r * 2)) : (CEO.result[kind] || CEO.result.story)();
  $('result-ceo').querySelector('p').textContent = `「${said}」`;
  $('result-title').textContent = title;
  $('result-desc').textContent = desc;
  $('result-stats').innerHTML = cells.map(([k, v], i) => `<div>${k}<br><b${String(v).length > 10 ? ' style="font-size:14px"' : ''}>${v}</b></div>`).join('');
  $('result-list').innerHTML = top.map(([n, c]) => `<li><span>${n}</span><b>${c}</b></li>`).join('');
  $('result').classList.add('show');
  $('hud').classList.add('hidden');
  sfx('setMusic', 'ending');
}

// ---------------------------------------------------------------- pause / mute
function togglePause() {
  if (state !== 'play') return;
  paused = !paused;
  $('pause').classList.toggle('show', paused);
}
function toggleMute() {
  if (!audio) return;
  audio.setMuted(!audio.muted);
  $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
}
$('btn-mute').addEventListener('click', toggleMute);
$('btn-pause').addEventListener('click', togglePause);
$('btn-resume').addEventListener('click', togglePause);
$('btn-again').addEventListener('click', () => location.reload());

// ---------------------------------------------------------------- start
$('loading').classList.add('hidden');
$('title').classList.add('show');
async function startGame(m = 'story') {
  mode = m;
  $('title').classList.remove('show');
  $('hud').classList.remove('hidden');
  if (audio) { try { await audio.start(); audio.setMusic(m === 'world' ? 'world' : 'town'); } catch (e) { console.warn(e); } }
  state = 'play';
  stats.elapsed = 0;
  camState.init = false;
  const order = (text) => setTimeout(() => ceo.say(text, { hold: 6, sky: true }), 1500);
  if (m === 'kanto') { setR(150); enterKanto(); banner('関東から スタート！', '夜明けの関東を まきこめ', 2.6); order(CEO.kanto0); return; }
  if (m === 'world') { setR(10000); enterWorld(); banner('日本から スタート！', '日本、そして 世界へ', 2.6); order(CEO.world0); return; }
  if (m === 'timeattack') { banner('タイムアタック！', '5分で どこまで 大きくなれる？', 2.6); order(CEO.timeattack); return; }
  if (m === 'otsukai') { setupErrand(); banner('おつかい スタート！', 'リストの 6つを まきこめ', 2.6); order(CEO.otsukai); return; }
  banner('ハマころ！', 'ちいさな玉で ヨコハマを まきこめ！', 2.6);
  order(CEO.story);
}
let wantVR = false;
$('vr-toggle').addEventListener('click', () => {
  wantVR = !wantVR;
  $('vr-toggle').setAttribute('aria-pressed', String(wantVR));
});
$('btn-vr').addEventListener('click', () => { if (vr) (vr.active ? vr.exit() : vr.enter()); });
for (const b of document.querySelectorAll('.mode')) {
  b.addEventListener('click', () => {
    const m = b.dataset.mode;
    if (m === 'select') { $('modes').classList.add('hidden'); $('stage-select').classList.remove('hidden'); return; }
    if (wantVR && vr) vr.enter(); // must start inside the click (user gesture)
    startGame(m);
  });
}
$('btn-back').addEventListener('click', () => { $('stage-select').classList.add('hidden'); $('modes').classList.remove('hidden'); });
showRecords();
if (qs.has('autostart')) startGame(qs.get('mode') || 'story');
if (qs.get('stage') === 'kanto') startGame('kanto');
if (qs.get('stage') === 'world') startGame('world');

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let titleT = 0;
let frameNo = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  frameNo++;
  if (state === 'title') {
    titleT += dt;
    // slow fly-around over the start area at golden hour
    tod = 0.3;
    updateEnvironment(0);
    const a = titleT * 0.05 + 2.4;
    const cx = -150, cz = -250;
    camera.position.set(cx + Math.cos(a) * 260, 70 + Math.sin(titleT * 0.1) * 10, cz + Math.sin(a) * 260);
    camera.up.set(0, 1, 0);
    camera.lookAt(cx, 40, cz);
    camera.near = 1; camera.far = 6000; camera.updateProjectionMatrix();
    sky.position.copy(camera.position); sky.scale.setScalar(5000);
    scene.fog.near = 400; scene.fog.far = 2600;
    sun.position.set(cx + 300, 400, cz + 200); sun.target.position.set(cx, 0, cz);
    town.updateMovers(dt, { pos: new THREE.Vector3(cx, 0, cz), r: 0.15 }, PICK_K);
    stage.objs.updateVisibility(camera.position, 1, 1.4);
    renderer.render(scene, camera);
    return;
  }
  if (paused) { renderer.render(scene, camera); return; }

  if (state === 'play') {
    stats.elapsed += dt;
    if (mode === 'timeattack' && stats.elapsed >= TA_SECONDS) showResult('timeup');
    const inp = readInput();
    step(dt, inp);
    for (const o of stage.objs.objs) if (o.cool > 0) o.cool -= dt;
    bumpCool -= dt; dropCool -= dt; hintCool -= dt;
    sfx('sfxRoll', Math.min(1, ball.vel.length() / maxSpeed(false)), Math.min(1, Math.log10(1 + ball.r * 2) / 3));
    flushPickSfx();
    checkGoals();
    if (frameNo % 10 === 0) checkDistrict();
    updateCamera(dt);
  } else if (state === 'trans') {
    stateT += dt;
    ball.vel.multiplyScalar(0.95);
    step(dt, { f: 0, t: 0, dash: false });
    if (transTo) {
      updateCamera(dt, 'pull');
      if (stateT > 3.0) $('fade').classList.add('show');
      if (stateT > 3.8) {
        const next = transTo; transTo = null;
        if (next === 'kanto') {
          enterKanto();
          banner('関東へ ころがれ！', '夜が明けてきた', 3.2);
          sfx('setMusic', 'town');
          setTimeout(() => ceo.say(CEO.kantoStart, { hold: 6, sky: true }), 2200);
        } else {
          enterWorld();
          banner('日本へ、そして せかいへ！', 'ここからは 地球サイズ', 3.2);
          sfx('setMusic', 'world');
          setTimeout(() => ceo.say(CEO.worldStart, { hold: 6, sky: true }), 2200);
        }
        updateCamera(dt);
        $('fade').classList.remove('show');
        stateT = 0;
      }
    } else {
      updateCamera(dt);
      if (stateT > 1.2) state = 'play';
    }
  } else if (state === 'ending') {
    stateT += dt;
    step(dt, { f: 0, t: 0, dash: false });
    // the planet is pulled into the ball
    const t = Math.min(stateT / 5, 1);
    const e = t * t * (3 - 2 * t);
    const s = 1 - e * 0.82;
    globe.earth.scale.setScalar(s);
    globe.atmo.scale.setScalar(s);
    for (const g of globe.objs.byProto.values()) g.mesh.visible = stateT < 1.5;
    const toBall = ball.pos.clone().multiplyScalar(e * 0.55);
    globe.earth.position.copy(toBall);
    globe.atmo.position.copy(toBall);
    ball.r += (ball.r * 1.2 - ball.r) * dt * 0.4;
    camState.dist += dt * ball.r * 1.2;
    camState.height += dt * ball.r * 0.6;
    updateCamera(dt);
    ballGroup.rotation.y += dt * 0.3;
    if (stateT > 5.5 && !$('result').classList.contains('show')) showResult();
  } else if (state === 'result') {
    ballGroup.rotateOnWorldAxis(ball.up, dt * 0.25);
    updateCamera(dt);
  }

  stage.objs.time += dt;
  stage.updateMovers(dt, ball, PICK_K);
  if (pusher) {
    pusher.update(dt, { pos: ball.pos, r: ball.r, heading: ball.heading, up: ball.up, speed: ball.vel.length(), dash: inpDash, bumped: bumpedNow, cheer: cheerNow, planetR: stageName === 'world' ? EARTH_R : 0 });
    pusher.setVisible(state !== 'ending');
  }
  bumpedNow = false; cheerNow = false;
  cardT -= dt;
  if (!vrActive()) itemViewer.update(dt); // the headset shows the item on its own panel
  if (state !== 'title') ceo.update(dt, ball);
  ceoDropCool -= dt;
  if (state === 'play' && mode !== 'otsukai') {
    if (goalIdx !== ceoIdleGoal) { ceoIdleGoal = goalIdx; ceoIdleT = 0; }
    ceoIdleT += dt;
    if (ceoIdleT > 80) {
      ceoIdleT = 0;
      const G = goals(), g = G[Math.min(goalIdx, G.length - 1)];
      ceo.say(CEO.idle(needDisplay(Math.max(0, g.d - ball.r * 2))), { hold: 3.5 });
    }
  }
  stage.objs.updateVisibility(camera.position, ball.r, (stageName === 'world' ? 3 : stageName === 'kanto' ? 0.55 : 1) * (vr ? vr.viewScale : 1));
  core.scale.setScalar(ball.r * 0.86);
  updateEnvironment(dt);
  if (state !== 'title') updateHUD();
  if (vrActive()) vr.update(dt, { pos: ball.pos, r: ball.r, heading: ball.heading, up: ball.up, state, stage: stageName });
  if (frameNo % 3 === 0 && !vrActive()) {
    if (stageName !== 'world') minimap.drawTown(ball.pos.x, ball.pos.z, Math.atan2(ball.heading.x, ball.heading.z), ball.r);
    else minimap.drawWorld(vecToLatLon(ball.pos), ball.r);
  }
  // timers
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('show');
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) $('banner').classList.remove('show');
  if (msgTimer > 0 && (msgTimer -= dt) <= 0) $('message').classList.remove('show');
  if (noticeTimer > 0 && (noticeTimer -= dt) <= 0) $('notice').classList.remove('show');
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame); // works on screen and inside a WebXR session

document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !paused && !vrActive()) togglePause(); });
addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  renderer.setSize(innerWidth, innerHeight);
  if (pusherMod) pusherMod.setOutlineViewport(renderer.getDrawingBufferSize(new THREE.Vector2()).y);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- debug handle
window.__game = {
  ball, stats, get state() { return state; }, get stage() { return stageName; },
  setR(r) { setR(r); }, teleport(x, z) { ball.pos.set(x, ball.r, z); },
  snapCamera() { camState.init = false; },
  toKanto() { startTransition('kanto'); }, toWorld() { startTransition('world'); }, ending() { startEnding(); },
  autopilot, town, get globe() { return globe; }, get kanto() { return kanto; },
  renderer, scene, camera, reg, worldReg, kantoReg,
  simulate(seconds, fps = 30) {
    // run the game logic without rendering (for pacing tests)
    const dt = 1 / fps;
    for (let i = 0; i < seconds * fps; i++) {
      if (state === 'trans' && transTo) {
        const next = transTo; transTo = null;
        if (next === 'kanto') enterKanto(); else enterWorld();
        state = 'play';
      }
      if (state !== 'play') break;
      stats.elapsed += dt;
      if (mode === 'timeattack' && stats.elapsed >= TA_SECONDS) { showResult('timeup'); break; }
      step(dt, readInput());
      for (const o of stage.objs.objs) if (o.cool > 0) o.cool -= dt;
      bumpCool -= dt; dropCool -= dt; hintCool -= dt;
      stage.objs.time += dt;
      checkGoals();
      stage.updateMovers(dt, ball, PICK_K);
    }
    return { r: ball.r, d: ball.r * 2, count: stats.count, goalIdx, state: state === 'trans' ? 'play' : state };
  },
};
