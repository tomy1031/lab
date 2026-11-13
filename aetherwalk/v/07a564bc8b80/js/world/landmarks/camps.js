// js/world/landmarks/camps.js — FABLE
// 風見の灯（焚き火）と燭台。
import * as THREE from 'three';
import { part, merge, G } from '../geo.js';
import { structMaterial, makeFlame, toWorld } from './common.js';

let campMat = null;
const mat = () => campMat || (campMat = structMaterial({ glow: 0xffc46a, amt: 0.0, night: 0.9 }));

export function buildWaylight(env, def) {
  const parts = [];
  // 石の輪と薪
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(part(G.ico(0.24, 0), { pos: [Math.sin(a) * 0.85, 0.1, Math.cos(a) * 0.85], scale: [1.1, 0.7, 0.9], rot: [0, a * 2.3, 0], color: 0x8d8778, jitter: 0.04, vary: 0.2 }));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(part(G.cyl(0.07, 0.09, 1.1, 5), { pos: [Math.sin(a) * 0.22, 0.26, Math.cos(a) * 0.22], rot: [Math.cos(a) * 0.95, 0, -Math.sin(a) * 0.95], color: 0x5a4636 }));
  }
  parts.push(part(G.disc(0.7, 8), { pos: [0, 0.03, 0], color: 0x2a2622 }));
  // 風見の柱：金の矢と輪、吊り灯
  parts.push(part(G.cyl(0.07, 0.12, 5.2, 6), { pos: [2.3, 2.6, -1.2], bottom: 0x4a3a2e, top: 0x6b5a48 }));
  parts.push(part(G.torus(0.42, 0.045, 4, 12), { pos: [2.3, 5.5, -1.2], color: 0xf2c66b, glow: 0.3 }));
  parts.push(part(G.cone(0.14, 0.9, 4), { pos: [2.3, 5.5, -1.85], rot: [-Math.PI / 2, 0, 0], color: 0xf2c66b, glow: 0.3 }));
  parts.push(part(G.box(0.05, 0.05, 1.2), { pos: [2.3, 5.5, -1.2], color: 0xf2c66b }));
  parts.push(part(G.box(0.7, 0.05, 0.05), { pos: [2.0, 3.6, -1.2], color: 0x4a3a2e }));
  parts.push(part(G.octa(0.17), { pos: [1.7, 3.3, -1.2], scale: [1, 1.3, 1], color: 0xfff0c0, glow: 1 }));
  // 旗（水色の布）
  parts.push(part(new THREE.PlaneGeometry(0.9, 0.5, 3, 1), { pos: [2.78, 4.6, -1.2], color: 0x7fe9ff, sway: (p) => Math.max(0, p.x - 2.33) * 0.9 }));
  parts.push(part(new THREE.PlaneGeometry(0.9, 0.5, 3, 1), { pos: [2.78, 4.6, -1.2], rot: [0, Math.PI, 0], color: 0x6fd0e6, sway: (p) => Math.max(0, p.x - 2.33) * 0.9 }));
  // 差し掛けの布と丸太の腰かけ
  parts.push(part(G.cyl(0.05, 0.06, 2.4, 4), { pos: [-2.4, 1.2, -1.6], color: 0x5a4636 }));
  parts.push(part(G.cyl(0.05, 0.06, 2.4, 4), { pos: [-0.6, 1.2, -2.9], color: 0x5a4636 }));
  const cloth = new THREE.BufferGeometry();
  cloth.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-2.4, 2.35, -1.6, -0.6, 2.35, -2.9, -3.1, 0.25, -3.4, -0.6, 2.35, -2.9, -1.3, 0.25, -4.6, -3.1, 0.25, -3.4]), 3));
  cloth.computeVertexNormals();
  parts.push(part(cloth, { color: 0xe8dcc0 }));
  const cloth2 = cloth.clone(); cloth2.setIndex([0, 2, 1, 3, 5, 4]);
  parts.push(part(cloth2, { color: 0xc9bda0 }));
  parts.push(part(G.cyl(0.24, 0.26, 1.7, 7), { pos: [1.5, 0.22, 1.3], rot: [Math.PI / 2, 0, 0.7], color: 0x6b5140, vary: 0.1 }));
  parts.push(part(G.cyl(0.2, 0.22, 1.3, 7), { pos: [-1.6, 0.2, 0.9], rot: [Math.PI / 2, 0, -0.9], color: 0x6b5140, vary: 0.1 }));
  const body = new THREE.Mesh(merge(parts), mat());
  const group = new THREE.Group();
  group.add(body);
  const flame = makeFlame(1.25);
  flame.position.set(0, 0.22, 0);
  group.add(flame);
  const anchors = { fire: toWorld(def, 0, 0.45, 0), seat: toWorld(def, 1.5, 0, 1.3), pole: toWorld(def, 2.3, 5.5, -1.2) };
  const pc = toWorld(def, 2.3, 0, -1.2);
  env.col.addCollider({ x: pc.x, z: pc.z, r: 0.2, y0: def.y, y1: def.y + 5.2, kind: 'structure' });
  env.col.addCollider({ x: def.x, z: def.z, r: 0.75, y0: def.y, y1: def.y + 0.5, kind: 'structure' });
  const fx = env.fx;
  const g = fx.glows.add({ x: anchors.fire.x, y: anchors.fire.y + 0.3, z: anchors.fire.z, size: 3.4, color: 0xffa040, intensity: 0, flicker: 0.35 });
  const lan = toWorld(def, 1.7, 3.3, -1.2);
  fx.glows.add({ x: lan.x, y: lan.y, z: lan.z, size: 1.3, color: 0xffc46a, mode: 1, intensity: 0.8, flicker: 0.1 });
  const state = { lit: false };
  let emberT = 0;
  function onState(key, value) {
    if (key !== 'lit') return;
    flame.visible = !!value;
    fx.glows.set(g, { intensity: value ? 1.0 : 0 });
    if (env.ready && value) { fx.api.flash(anchors.fire, { color: 0xffb347, size: 4, life: 0.5 }); fx.api.emit('ember', anchors.fire, { count: 14, speed: 1.8 }); }
  }
  function update(view, dist) {
    if (!state.lit || dist > 40) return;
    emberT -= view.dt;
    if (emberT <= 0) { emberT = 0.35 + Math.random() * 0.4; fx.api.emit('ember', anchors.fire, { count: 1 }); }
  }
  return { object3D: group, anchors, state, onState, update, viewDist: 320, r: 5 };
}

export function buildBrazier(env, def) {
  const parts = [
    part(G.cyl(0.2, 0.34, 0.9, 6), { pos: [0, 0.45, 0], bottom: 0x6f6a60, top: 0x9a9484 }),
    part(G.cyl(0.46, 0.2, 0.3, 8), { pos: [0, 1.05, 0], bottom: 0x7a7468, top: 0xa9a394 }),
    part(G.torus(0.45, 0.035, 4, 8), { pos: [0, 1.2, 0], rot: [Math.PI / 2, 0, 0], color: 0xf2c66b, glow: 0.4 }),
    part(G.cyl(0.4, 0.44, 0.14, 6), { pos: [0, 0.07, 0], color: 0x6f6a60 }),
  ];
  const body = new THREE.Mesh(merge(parts), mat());
  const group = new THREE.Group();
  group.add(body);
  const flame = makeFlame(0.8);
  flame.position.set(0, 1.12, 0);
  group.add(flame);
  const anchors = { fire: toWorld(def, 0, 1.4, 0) };
  env.col.addCollider({ x: def.x, z: def.z, r: 0.42, y0: def.y, y1: def.y + 1.3, kind: 'structure' });
  const g = env.fx.glows.add({ x: anchors.fire.x, y: anchors.fire.y + 0.1, z: anchors.fire.z, size: 2.2, color: 0xffa040, intensity: 0, flicker: 0.35 });
  const state = { lit: false };
  function onState(key, value) {
    if (key !== 'lit') return;
    flame.visible = !!value;
    env.fx.glows.set(g, { intensity: value ? 0.95 : 0 });
    if (env.ready && value) env.fx.api.emit('ember', anchors.fire, { count: 8, speed: 1.5 });
  }
  return { object3D: group, anchors, state, onState, viewDist: 170, r: 0.5 };
}
