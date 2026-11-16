// Scene preview for development and screenshots:
//   dev/scene.html?scene=office&time=noon&season=spring&weather=clear&view=spawn&cast=aoki,ogawa&labels=1
// views: spawn | left | right | back | overview | face (close-up of the first person) | people
import * as THREE from 'three';
import { App } from '../js/core/app.js';
import { makeEnvironment } from '../js/world/environment.js';
import { loadScene } from '../js/world/scenes/index.js';
import { CAST } from '../js/content/cast.js';
import * as K from '../js/world/kit.js';

const q = new URLSearchParams(location.search);
const { Person } = await import('../js/people/person.js');
const id = q.get('scene') || 'office';
const setup = { time: q.get('time') || 'noon', season: q.get('season') || 'spring', weather: q.get('weather') || 'clear' };
const view = q.get('view') || 'spawn';
const castIds = (q.get('cast') || '').split(',').filter(Boolean);
await document.fonts.load('700 20px "M PLUS Rounded 1c"').catch(() => {});

const app = new App(document.getElementById('stage'));
const mod = await loadScene(id);
const built = mod.default({ setup });
app.scene.add(built.group);
const env = makeEnvironment(app.scene, { ...setup, indoor: mod.meta?.indoor, center: built.center, radius: built.radius });
app.renderer.toneMappingExposure = env.exposure;
const spawn = built.spawn;
app.placeRig(spawn.pos, spawn.yaw);

const people = [];
const slotNames = Object.keys(built.slots).filter((s) => built.slots[s]);
const pool = castIds.length ? castIds : Object.keys(CAST);
slotNames.forEach((slot, i) => {
  const cid = pool[i % pool.length];
  const sp = built.slots[slot];
  const p = new Person(CAST[cid].look, { name: cid });
  p.root.position.copy(sp.pos);
  p.root.rotation.y = sp.yaw;
  if (sp.sit) p.setSitting(true, sp.sit);
  app.scene.add(p.root);
  people.push(p);
  if (q.get('labels')) {
    const tag = K.sign([`${slot}: ${cid}`], 0.9, 0.16, { bg: 'rgba(0,0,0,0.6)', fg: '#ffe08a', emissive: true });
    tag.position.copy(sp.pos).add(new THREE.Vector3(0, 2.05, 0));
    app.scene.add(tag);
    app.onUpdate(() => tag.quaternion.copy(app.camera.getWorldQuaternion(new THREE.Quaternion())));
  }
});
if (q.get('labels')) {
  for (const [pid, obj] of Object.entries(built.props)) {
    const w = new THREE.Vector3();
    obj.getWorldPosition(w);
    const tag = K.sign([pid], 0.6, 0.12, { bg: 'rgba(30,60,120,0.75)', fg: '#ffffff', emissive: true });
    tag.position.copy(w).add(new THREE.Vector3(0, 0.35, 0));
    app.scene.add(tag);
    app.onUpdate(() => tag.quaternion.copy(app.camera.getWorldQuaternion(new THREE.Quaternion())));
  }
}
const head = new THREE.Vector3();
app.onUpdate((dt, t) => {
  app.headPosition(head);
  people.forEach((p, i) => { p.setLookTarget(head); p.update(dt, q.get('talk') && i === 0 ? 0.4 + 0.3 * Math.sin(t * 9) : 0); });
  built.update?.(dt, t);
  env.update(dt);
});
if (q.get('gesture') && people[0]) setTimeout(() => people[0].gesture(q.get('gesture'), { target: built.props[q.get('target')]?.getWorldPosition(new THREE.Vector3()) }), 300);

// lineup: every cast member in a row (for checking the characters)
if (view === 'lineup') {
  for (const p of people) app.scene.remove(p.root);
  people.length = 0;
  const ids = castIds.length ? castIds : Object.keys(CAST);
  ids.forEach((cid, i) => {
    const p = new Person(CAST[cid].look, { name: cid });
    const col = i % 8; const row = Math.floor(i / 8);
    p.root.position.set((col - 3.5) * 0.85, 0, -3 - row * 1.6);
    app.scene.add(p.root);
    people.push(p);
  });
}
// camera views
const cam = app.camera;
function setView() {
  if (view === 'overview') {
    app.rig.position.set(0, 0, 0); app.rig.rotation.set(0, 0, 0);
    const c = built.center || new THREE.Vector3();
    cam.position.set(c.x + 7, 9, c.z + 9);
    cam.lookAt(c.x, 0, c.z);
  } else if (view === 'face' && people[0]) {
    app.rig.position.set(0, 0, 0); app.rig.rotation.set(0, 0, 0);
    const p = people[0].root;
    const fwd = new THREE.Vector3(Math.sin(p.rotation.y), 0, Math.cos(p.rotation.y));
    const h = people[0].dims.H;
    cam.position.copy(p.position).addScaledVector(fwd, 0.55).add(new THREE.Vector3(0, h * 0.9, 0)); cam.fov = 40; cam.updateProjectionMatrix();
    cam.lookAt(p.position.clone().add(new THREE.Vector3(0, h * 0.88, 0)));
    people[0].setLookTarget(cam.position.clone());
  } else if (view === 'lineup') {
    app.rig.position.set(0, 0, 0); app.rig.rotation.set(0, 0, 0);
    cam.position.set(0, 1.45, 1.6);
    cam.lookAt(0, 0.95, -3.6);
  } else if (view === 'people') {
    app.rig.position.set(0, 0, 0); app.rig.rotation.set(0, 0, 0);
    const p = people[0].root;
    const fwd = new THREE.Vector3(Math.sin(p.rotation.y), 0, Math.cos(p.rotation.y));
    cam.position.copy(p.position).addScaledVector(fwd, 2.4).add(new THREE.Vector3(0, 1.3, 0));
    cam.lookAt(p.position.clone().add(new THREE.Vector3(0, 0.95, 0)));
  } else {
    const yaw = { spawn: 0, left: Math.PI / 2, right: -Math.PI / 2, back: Math.PI }[view] ?? 0;
    app.yaw = yaw; app.pitch = -0.08; app._applyLook();
  }
}
setView();
document.getElementById('info').textContent = `${id} ${setup.time}/${setup.season}/${setup.weather} view=${view} · ${app.renderer.info.render.triangles} tris · ${app.renderer.info.render.calls} calls`;
let frames = 0;
app.onUpdate(() => { if (++frames === 20) { document.getElementById('info').textContent = `${id} ${setup.time}/${setup.season}/${setup.weather} view=${view} · ${app.renderer.info.render.triangles} tris · ${app.renderer.info.render.calls} calls`; window.__ready = true; } });
window.__built = built;
