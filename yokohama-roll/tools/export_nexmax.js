// tools/export_nexmax.js — turns the game's procedural NexMax (ネクマックス) into a standard glTF 2.0 file
// (GLB) that other software can open: Blender, Unity, Unreal, Windows 3D Viewer, web viewers.
// Runs in a browser page (tools/export_nexmax.html), driven by tools/export-nexmax.mjs.
//
// The game draws NexMax with things only its own renderer understands; for the file they become plain glTF:
//  - Outline: in the game a shader pushes an inside-out copy of each body part ("hull") outwards by a few
//    pixels. Here the hull is pushed out by a fixed OUTLINE_W and given a dark unlit material: the classic
//    "inverted hull" outline, which works in any renderer that culls back faces. Each one is a separate
//    mesh named "<part>_outline", so it is easy to hide or delete.
//  - Expressions and fists: the game swaps a mesh's geometry. Here every variant is its own mesh
//    ("eyeballs_happy", "features_worried", "handR_fist", …), and the one that is not shown has scale 0.
//    The animations switch them with stepped scale keys, so a punch closes the fist and "hurt" looks
//    surprised (a motion clip keys only the variants it changes). Four tiny clips "face_<expression>"
//    switch the face on their own and can be layered over any motion except "hurt".
//  - Motion: the game animates by code every frame. Here each motion is played at 30 fps and every joint's
//    position / rotation / scale is recorded into an animation clip. Loops (idle, walk, run, …) are cut at
//    the point where the pose repeats best and cross-faded into their first frame, so they loop seamlessly.
// The rig is a hierarchy of rigid parts under joints (hips, torso, head, shoulderL/R, elbowL/R, wristL/R,
// hipL/R, kneeL/R, ankleL/R); there is no skinning. Units are metres: the figure is 1.2 m tall, feet at the
// origin, facing +Z (glTF's "forward"), +Y up.
import * as THREE from 'three';
import { GLTFExporter } from '../node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { createNexmax } from '../js/vendor/nexmax.js';

const FPS = 30;
const DT = 1 / FPS;
const HEIGHT = 1.2;
const OUTLINE_W = 0.0045; // metres, for the 1.2 m figure (about what the game draws at full-body distance)
const OUTLINE_COLOR = '#16223a';
const EXPRESSIONS = ['happy', 'determined', 'worried', 'surprised'];

// The motions: [clip name, game pose, kind, options]
//   loop:    played until steady, then cut where the pose repeats (between min and max seconds)
//   oneshot: from standing (idle) into the pose for `dur` seconds, then back to standing
export const CLIPS = [
  ['idle', 'idle', 'loop', { min: 3, max: 7, warm: 3 }],
  ['walk', 'walk', 'loop', { min: 0.5, max: 2.5, speed: 2.2 }],
  ['run', 'run', 'loop', { min: 0.3, max: 2, speed: 5.2 }],
  ['dash', 'dash', 'loop', { min: 0.3, max: 2, speed: 6.4 }],
  ['wave', 'wave', 'loop', { min: 0.6, max: 3.5 }],
  ['sit', 'sit', 'loop', { min: 2.5, max: 6, warm: 3 }],
  ['jump', 'jump', 'oneshot', { dur: 0.7, tail: 0.9 }],
  ['punch', 'punch', 'oneshot', { dur: 0.45, tail: 0.7 }],
  ['punchL', 'punchL', 'oneshot', { dur: 0.45, tail: 0.7 }],
  ['hurt', 'hurt', 'oneshot', { dur: 0.6, tail: 0.9 }],
];

const smooth = (x) => x * x * (3 - 2 * x);

export async function exportNexmax() {
  const ch = createNexmax(HEIGHT, { variant: 'protagonist' });
  const root = ch.root;
  root.updateMatrixWorld(true);
  const swapNames = { eyes: 'eyeballs', features: 'features', handR: 'handR', handL: 'handL' };
  const swap = Object.fromEntries(Object.entries(swapNames).map(([k, n]) => [k, root.getObjectByName(n)]));
  for (const [k, m] of Object.entries(swap)) if (!m || !m.isMesh) throw new Error('part not found: ' + k);
  const run = (n, speed = 0) => { for (let i = 0; i < n; i++) ch.update(DT, speed); };
  const settle = () => { ch.setPose('idle'); run(FPS * 2); };

  // --- every expression and both hand shapes (the game swaps these geometries in place)
  const variants = { eyes: {}, features: {}, handR: {}, handL: {} };
  settle();
  for (const e of EXPRESSIONS) {
    ch.setExpression(e);
    run(15);
    variants.eyes[e] = swap.eyes.geometry;
    variants.features[e] = swap.features.geometry;
  }
  ch.setExpression('happy');
  run(15);
  variants.handR.open = swap.handR.geometry;
  variants.handL.open = swap.handL.geometry;
  for (const p of ['punch', 'punchL', 'run', 'dash']) {
    ch.setPose(p);
    for (let i = 0; i < 45; i++) {
      run(1, p === 'run' ? 5.2 : p === 'dash' ? 6.4 : 0);
      for (const h of ['handR', 'handL']) if (swap[h].geometry !== variants[h].open) variants[h].fist = swap[h].geometry;
    }
  }
  settle();
  const variantOf = (key, geo) => Object.keys(variants[key]).find((v) => variants[key][v] === geo);

  // --- record the motions
  const live = [];
  root.traverse((o) => live.push(o));
  const snap = () => {
    const f = new Float32Array(live.length * 10);
    live.forEach((o, i) => {
      f.set([o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z], i * 10);
    });
    const v = {};
    for (const k of Object.keys(swap)) v[k] = variantOf(k, swap[k].geometry) || Object.keys(variants[k])[0];
    return { f, v };
  };
  const rest = snap();
  const record = (n, speed) => Array.from({ length: n }, () => { ch.update(DT, speed); return snap(); });
  const poseErr = (a, b) => {
    let e = 0;
    for (let i = 0; i < live.length; i++) {
      const o = i * 10;
      const dq = Math.abs(a.f[o + 3] * b.f[o + 3] + a.f[o + 4] * b.f[o + 4] + a.f[o + 5] * b.f[o + 5] + a.f[o + 6] * b.f[o + 6]);
      e += (1 - Math.min(1, dq)) * 8 + Math.hypot(a.f[o] - b.f[o], a.f[o + 1] - b.f[o + 1], a.f[o + 2] - b.f[o + 2]) + Math.abs(a.f[o + 8] - b.f[o + 8]) * 0.05;
    }
    return e;
  };
  const blend = (a, b, w) => {
    const f = new Float32Array(a.f.length);
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    for (let i = 0; i < live.length; i++) {
      const o = i * 10;
      for (const j of [0, 1, 2, 7, 8, 9]) f[o + j] = a.f[o + j] + (b.f[o + j] - a.f[o + j]) * w;
      qa.fromArray(a.f, o + 3).slerp(qb.fromArray(b.f, o + 3), w).toArray(f, o + 3);
    }
    return { f, v: w < 0.5 ? a.v : b.v };
  };

  const clips = [];
  const info = [];
  for (const [name, pose, kind, o] of CLIPS) {
    let frames;
    if (kind === 'loop') {
      const speed = o.speed || 0;
      ch.setPose(pose);
      run(Math.round((o.warm || 2) * FPS), speed);
      const fade = Math.round(0.35 * FPS);
      const F = record(fade + Math.round(o.max * FPS) + 2, speed);
      const s = fade;
      let L = Math.round(o.min * FPS), best = Infinity;
      for (let k = Math.round(o.min * FPS); s + k < F.length; k++) {
        const e = poseErr(F[s], F[s + k]);
        if (e < best - 1e-6) { best = e; L = k; }
      }
      frames = [];
      for (let j = 0; j <= L; j++) {
        let fr = F[s + j];
        if (j > L - fade) fr = blend(fr, F[s + j - L], smooth((j - (L - fade)) / fade));
        frames.push(fr);
      }
      info.push({ name, loop: true, seconds: +(L / FPS).toFixed(2), seamError: +best.toFixed(3) });
    } else {
      settle();
      const start = snap();
      ch.setPose(pose);
      const A = record(Math.round(o.dur * FPS), 0);
      ch.setPose('idle');
      const B = record(Math.round(o.tail * FPS), 0);
      frames = [start, ...A, ...B];
      info.push({ name, loop: false, seconds: +((frames.length - 1) / FPS).toFixed(2) });
    }
    clips.push({ name, frames });
  }
  settle();

  // --- the file's copy of the character (the live one above keeps its original geometry)
  const copy = root.clone(true);
  const nodes = [];
  copy.traverse((o) => nodes.push(o));
  if (nodes.length !== live.length) throw new Error('clone does not match');
  // the copy starts in the rest pose (standing, happy, hands open)
  nodes.forEach((n, i) => {
    const o = i * 10;
    n.position.fromArray(rest.f, o);
    n.quaternion.fromArray(rest.f, o + 3);
    n.scale.fromArray(rest.f, o + 7);
  });
  // glTF's forward is +Z; the game model faces -Z
  copy.rotation.y = Math.PI;
  copy.name = 'NexMax';
  // unique, readable names: joints keep theirs, meshes get "_mesh"
  const used = new Set();
  const uniq = (n) => { let s = n, k = 2; while (used.has(s)) s = `${n}_${k++}`; used.add(s); return s; };
  nodes.forEach((n, i) => { if (i > 0) n.name = uniq(n.isMesh ? `${n.name || 'part'}_mesh` : n.name || 'node'); });

  // variant meshes: one per expression / hand shape, the hidden ones at scale 0
  const variantNodes = {}; // key -> { variant -> mesh }
  for (const [key, liveMesh] of Object.entries(swap)) {
    const i = live.indexOf(liveMesh);
    const m = nodes[i];
    const parent = m.parent;
    variantNodes[key] = {};
    for (const [v, geo] of Object.entries(variants[key])) {
      const vm = new THREE.Mesh(geo, m.material);
      vm.name = uniq(`${swapNames[key]}_${v}`);
      vm.position.copy(m.position);
      vm.quaternion.copy(m.quaternion);
      vm.scale.copy(m.scale);
      if (v !== rest.v[key]) vm.scale.setScalar(0);
      parent.add(vm);
      variantNodes[key][v] = vm;
    }
    parent.remove(m);
    nodes[i] = null;
  }

  // outlines and plain-glTF geometry
  const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR });
  outlineMat.name = 'outline';
  const geoCache = new Map();
  const meshes = [];
  copy.traverse((o) => { if (o.isMesh) meshes.push(o); });
  let tris = 0;
  for (const m of meshes) {
    if (!m.visible || m.isInstancedMesh) continue;
    const key = m.geometry.uuid + '|' + (m.material.vertexColors ? 'c' : '') + (m.material.map ? 't' : '');
    if (!geoCache.has(key)) geoCache.set(key, convert(m.geometry, !!m.material.vertexColors, !!m.material.map));
    const { base, hull } = geoCache.get(key);
    m.geometry = base;
    m.material = plainMaterial(m.material);
    tris += base.index.count / 3;
    if (hull) {
      const om = new THREE.Mesh(hull, outlineMat);
      om.name = uniq(m.name.replace(/_mesh$/, '') + '_outline');
      m.add(om);
      tris += hull.index.count / 3;
    }
  }

  // --- animation clips: every joint that ever moves gets a track in every clip, so each clip fully sets the pose
  const moving = [];
  nodes.forEach((n, i) => {
    if (!n || i === 0) return;
    if (!isExported(n)) return;
    const o = i * 10;
    const ch3 = { p: false, q: false, s: false };
    for (const c of clips) for (const fr of c.frames) {
      for (let j = 0; j < 3; j++) if (Math.abs(fr.f[o + j] - rest.f[o + j]) > 1e-6) ch3.p = true;
      for (let j = 3; j < 7; j++) if (Math.abs(fr.f[o + j] - rest.f[o + j]) > 1e-6) ch3.q = true;
      for (let j = 7; j < 10; j++) if (Math.abs(fr.f[o + j] - rest.f[o + j]) > 1e-6) ch3.s = true;
    }
    if (ch3.p || ch3.q || ch3.s) moving.push({ n, o, ...ch3 });
  });
  const animClips = clips.map(({ name, frames }) => {
    const times = frames.map((_, j) => j / FPS);
    const tracks = [];
    for (const { n, o, p, q, s } of moving) {
      if (p) tracks.push(new THREE.VectorKeyframeTrack(`${n.name}.position`, times, frames.flatMap((fr) => [fr.f[o], fr.f[o + 1], fr.f[o + 2]])));
      if (q) tracks.push(new THREE.QuaternionKeyframeTrack(`${n.name}.quaternion`, times, frames.flatMap((fr) => [fr.f[o + 3], fr.f[o + 4], fr.f[o + 5], fr.f[o + 6]])));
      if (s) tracks.push(new THREE.VectorKeyframeTrack(`${n.name}.scale`, times, frames.flatMap((fr) => [fr.f[o + 7], fr.f[o + 8], fr.f[o + 9]])));
    }
    // switch a face or hand variant only in the clips that change it, so a face_* clip can be layered on top
    const vs = frames.map((fr) => fr.v);
    const changed = Object.keys(variantNodes).filter((k) => vs.some((v) => v[k] !== rest.v[k]));
    if (changed.length) tracks.push(...variantTracks(variantNodes, vs, times, rest, changed));
    return new THREE.AnimationClip(name, times[times.length - 1], tracks);
  });
  for (const e of EXPRESSIONS) {
    const v = frameVariants(rest, { eyes: e, features: e });
    animClips.push(new THREE.AnimationClip(`face_${e}`, 0.1, variantTracks(variantNodes, [v, v], [0, 0.1], rest, ['eyes', 'features'])));
  }
  info.push({ name: 'face_*', loop: false, seconds: 0.1, note: EXPRESSIONS.join(', ') });

  const scene = new THREE.Scene();
  scene.add(copy);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, trs: true, onlyVisible: true, animations: animClips });
  return { glb, info, triangles: Math.round(tris), joints: moving.map((m) => m.n.name) };
}

function isExported(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function frameVariants(rest, over) { return { ...rest.v, ...over }; }

// stepped scale keys that show one variant and hide the others
function variantTracks(variantNodes, perFrame, times, rest, keys = Object.keys(variantNodes)) {
  const tracks = [];
  for (const key of keys) {
    for (const [v, mesh] of Object.entries(variantNodes[key])) {
      const t = [], vals = [];
      let prev = null;
      perFrame.forEach((fv, j) => {
        const on = (fv[key] || rest.v[key]) === v ? 1 : 0;
        if (on !== prev || j === perFrame.length - 1) { t.push(times[j]); vals.push(on, on, on); prev = on; }
      });
      const tr = new THREE.VectorKeyframeTrack(`${mesh.name}.scale`, t, vals);
      tr.setInterpolation(THREE.InterpolateDiscrete);
      tracks.push(tr);
    }
  }
  return tracks;
}

// split a game geometry into the visible surface and (if it has one) the outline hull, keeping only
// standard attributes; vertex colours and texture coordinates only where the material uses them
function convert(g, keepColor, keepUv) {
  const idx = g.index.array;
  const ol = g.attributes.aOutline;
  const pick = (hull) => {
    const map = new Map();
    const out = [];
    for (let i = 0; i < idx.length; i += 3) {
      const isHull = !!ol && ol.getX(idx[i]) > 0.5;
      if (isHull !== hull) continue;
      for (let k = 0; k < 3; k++) {
        const v = idx[i + k];
        if (!map.has(v)) map.set(v, map.size);
        out.push(map.get(v));
      }
    }
    if (!out.length) return null;
    const n = map.size;
    const geo = new THREE.BufferGeometry();
    const names = hull ? ['position', 'normal'] : ['position', 'normal', ...(keepUv ? ['uv'] : []), ...(keepColor ? ['color'] : [])];
    for (const name of names) {
      const a = g.attributes[name];
      if (!a) continue;
      const arr = new Float32Array(n * a.itemSize);
      for (const [src, dst] of map) for (let c = 0; c < a.itemSize; c++) arr[dst * a.itemSize + c] = a.array[src * a.itemSize + c];
      geo.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    if (hull) {
      const p = geo.attributes.position.array, nr = geo.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) {
        const l = Math.hypot(nr[i], nr[i + 1], nr[i + 2]) || 1;
        for (let c = 0; c < 3; c++) p[i + c] += (nr[i + c] / l) * OUTLINE_W;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(out) : new Uint16Array(out), 1));
    geo.computeBoundingSphere();
    return geo;
  };
  return { base: pick(false), hull: ol ? pick(true) : null };
}

// the same look, minus the game's shader hooks (the file cannot carry those)
const matCache = new Map();
function plainMaterial(m) {
  if (matCache.has(m)) return matCache.get(m);
  const c = m.clone();
  // glTF colour factors are 0..1 (the game over-brightens a few glowing parts)
  if (c.color) c.color.setRGB(Math.min(1, c.color.r), Math.min(1, c.color.g), Math.min(1, c.color.b));
  c.onBeforeCompile = () => {};
  c.customProgramCacheKey = () => '';
  if (!c.name) c.name = ({ MeshPhysicalMaterial: 'vinyl', MeshStandardMaterial: 'standard', MeshBasicMaterial: 'glow' })[m.type] || 'material';
  matCache.set(m, c);
  return c;
}

// load the file back with three's own GLTFLoader (a round-trip check), and render a picture of it
export async function renderPreview(glb, { size = 1024, clip = 'idle', at = 1.0, bg = '#eaf3fb' } = {}) {
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.toneMapping = THREE.NeutralToneMapping;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9c7d6', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(1.5, 3, 2.5);
  scene.add(key);
  scene.add(gltf.scene);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const c = gltf.animations.find((a) => a.name === clip);
  if (c) { mixer.clipAction(c).play(); mixer.update(at); }
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  cam.position.set(1.15, 1.05, 2.6);
  cam.lookAt(0, 0.62, 0);
  renderer.render(scene, cam);
  const png = renderer.domElement.toDataURL('image/png');
  const stats = { clips: gltf.animations.map((a) => `${a.name} ${a.duration.toFixed(2)}s`), meshes: 0 };
  gltf.scene.traverse((o) => { if (o.isMesh) stats.meshes++; });
  renderer.dispose();
  renderer.domElement.remove();
  return { png, stats };
}
