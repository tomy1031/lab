// hub — the town square of Kotoba Town: a cosy plaza with a notice board (the lesson menu),
// little shops and houses around it that stand for the places you visit in the lessons.
import * as THREE from 'three';
import * as K from '../kit.js';

export const meta = { indoor: false, ambience: 'hub' };

const PLACES = [
  ['かいしゃ', '#7fb5d6'], ['がっこう', '#f2c26b'], ['アパート', '#e9a3a3'], ['デパート', '#b9a3e3'], ['びじゅつかん', '#9fd3b4'],
  ['えき', '#f0a868'], ['カフェ', '#c79a72'], ['こうえん', '#8fcf8a'], ['もりさんの いえ', '#f5b8c8'], ['コンビニ', '#7fcfc9'],
];

export default function build({ setup }) {
  const g = new THREE.Group();
  const r = K.rng(42);
  // ground: grass with a round stone plaza
  g.add(K.mesh(new THREE.RingGeometry(0.01, 60, 48, 16), K.mat('#ffffff', { map: K.noiseTex('#8cc46e', 0.12, [30, 30], 'grass') }), { rx: -Math.PI / 2, cast: false })); // subdivided: huge fan triangles break depth on some GPUs
  g.add(K.mesh(new THREE.RingGeometry(0.01, 7.5, 48, 6), K.mat('#ffffff', { map: K.tileTex('#e6dccb', '#ddd1bd', 10, [3, 3], '#c9bca5'), rough: 0.9 }), { rx: -Math.PI / 2, y: 0.01, cast: false }));
  g.add(K.mesh(new THREE.RingGeometry(7.5, 7.9, 48), K.mat('#c9b48f'), { rx: -Math.PI / 2, y: 0.012, cast: false }));
  // paths
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const p = K.mesh(new THREE.PlaneGeometry(2.2, 22), K.mat('#e2d5bd', { rough: 0.95 }), { rx: -Math.PI / 2, y: 0.008, cast: false });
    p.position.set(Math.sin(a) * 18, 0.008, Math.cos(a) * 18); p.rotation.z = -a;
    g.add(p);
  }
  // notice board (the lesson menu panel floats in front of it)
  const board = new THREE.Group();
  const wood = K.mat('#ffffff', { map: K.woodTex('#a67c52', [1, 2], 6), rough: 0.7 });
  board.add(K.box(0.14, 2.6, 0.14, wood, { x: -1.0 }));
  board.add(K.box(0.14, 2.6, 0.14, wood, { x: 1.0 }));
  board.add(K.rbox(2.4, 0.22, 0.3, 0.08, K.mat('#7a5a3c'), { y: 2.55 }));
  board.add(K.box(2.0, 1.45, 0.06, wood, { y: 0.75, z: -0.05 }));
  board.position.set(0, 0, -2.25);
  g.add(board);
  const sign = K.sign(['ことばタウン'], 1.6, 0.34, { bg: '#fffaf0', fg: '#3f9a73', border: '#e9dcc3' });
  sign.position.set(0, 2.9, -2.08);
  g.add(sign);
  // flower beds around the plaza
  const flowerCols = ['#f6a6a6', '#ffd36b', '#ffffff', '#c9b6ef', '#f7c08a'];
  const petal = new THREE.SphereGeometry(0.06, 6, 4);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2; const rad = 8.2 + r() * 1.2;
    g.add(K.mesh(petal, K.mat(flowerCols[i % flowerCols.length], { rough: 0.6 }), { x: Math.cos(a) * rad, y: 0.08, z: Math.sin(a) * rad, cast: false }));
  }
  // fountain in the middle behind the learner
  const f = new THREE.Group();
  f.add(K.cyl(1.4, 1.5, 0.45, K.mat('#d9d2c4', { rough: 0.8 })));
  f.add(K.cyl(1.25, 1.25, 0.02, K.mat('#7fc6e4', { rough: 0.1, metal: 0.2 }), { y: 0.4 }));
  f.add(K.cyl(0.18, 0.25, 1.1, K.mat('#d9d2c4', { rough: 0.8 })));
  f.add(K.cyl(0.6, 0.5, 0.12, K.mat('#d9d2c4'), { y: 1.05 }));
  f.position.set(0, 0, 4.2);
  g.add(f);
  // houses / shops around: one per place in the lessons
  PLACES.forEach(([name, color], i) => {
    const a = -Math.PI * 0.95 + (i / (PLACES.length - 1)) * Math.PI * 1.9 + Math.PI;
    const rad = 13 + (i % 2) * 1.5;
    const h = house(name, color, 2.6 + r() * 1.4, i);
    h.position.set(Math.sin(a) * rad, 0, Math.cos(a) * rad);
    h.rotation.y = a + Math.PI;
    g.add(h);
  });
  // round trees and lamps
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2; const rad = 9.5 + r() * 2.5;
    const t = tree(setup.season, i);
    t.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    if (Math.abs(t.position.x) < 3 && t.position.z < 0) continue;
    g.add(t);
  }
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3;
    const l = lamp(setup.time === 'night' || setup.time === 'evening');
    l.position.set(Math.cos(a) * 7.0, 0, Math.sin(a) * 7.0);
    g.add(l);
  }
  // benches
  for (const [x, z, ry] of [[-4.5, -1.5, Math.PI / 2.5], [4.5, -1.5, -Math.PI / 2.5]]) {
    const b = bench(); b.position.set(x, 0, z); b.rotation.y = ry; g.add(b);
  }
  // distant hills
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    const hill = K.mesh(new THREE.SphereGeometry(14 + r() * 8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), K.mat('#7fb06a', { rough: 1 }), { x: Math.cos(a) * 52, z: Math.sin(a) * 52, cast: false });
    hill.scale.y = 0.35 + r() * 0.2;
    g.add(hill);
  }
  return K.finalize({
    group: g,
    spawn: K.spot(0, 0, 0),
    slots: {},
    props: {},
    boardAnchor: new THREE.Vector3(0, 1.45, -1.9),
    center: new THREE.Vector3(0, 0, 0),
    radius: 16,
  });
}

function house(name, color, h, seed) {
  const g = new THREE.Group();
  const wall = K.mat('#fbf4e6', { rough: 0.9 });
  const roof = K.mat(color, { rough: 0.6 });
  g.add(K.rbox(3.2, h, 2.6, 0.12, wall));
  const roofG = new THREE.ConeGeometry(2.5, 1.3, 4, 1);
  const rm = K.mesh(roofG, roof, { y: h + 0.62, ry: Math.PI / 4 });
  rm.scale.set(1.05, 1, 0.85);
  g.add(rm);
  g.add(K.rbox(0.9, 1.7, 0.08, 0.04, K.mat('#9b6b43'), { z: 1.31 }));
  for (const x of [-1.0, 1.0]) {
    g.add(K.rbox(0.7, 0.6, 0.06, 0.03, K.mat('#bfe3f7', { rough: 0.2 }), { x, y: 1.1, z: 1.31 }));
  }
  const s = K.sign([name], 1.6, 0.36, { bg: '#fffaf0', fg: '#5b4636', border: color });
  s.position.set(0, 2.05, 1.36);
  g.add(s);
  void seed;
  return g;
}

function tree(season = 'spring', seed = 0) {
  const g = new THREE.Group();
  const r = K.rng(seed + 9);
  g.add(K.cyl(0.12, 0.16, 1.4, K.mat('#8a6243')));
  const col = { spring: ['#f6c1d0', '#f9d4de', '#f1aec2'], summer: ['#6aa75a', '#5e9a50', '#7cb76a'], autumn: ['#e39a4a', '#d9693b', '#f0b85a'], winter: ['#c9b79f', '#b9a78f', '#d5c6b0'] }[season] || ['#6aa75a', '#5e9a50', '#7cb76a'];
  for (let i = 0; i < 5; i++) {
    g.add(K.mesh(new THREE.SphereGeometry(0.75 + r() * 0.35, 12, 9), K.mat(col[i % 3], { rough: 0.85 }), { x: (r() - 0.5) * 1.0, y: 1.9 + r() * 0.7, z: (r() - 0.5) * 1.0 }));
  }
  return g;
}

function lamp(lit) {
  const g = new THREE.Group();
  g.add(K.cyl(0.05, 0.07, 2.8, K.mat('#3e4a4f', { metal: 0.5, rough: 0.4 })));
  g.add(K.mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: '#fff4d0', emissive: lit ? '#ffcf7a' : '#000000', emissiveIntensity: lit ? 1.6 : 0 }), { y: 2.95 }));
  return g;
}

function bench() {
  const g = new THREE.Group();
  const w = K.mat('#b98b5e', { rough: 0.7 });
  g.add(K.box(1.6, 0.06, 0.45, w, { y: 0.42 }));
  g.add(K.box(1.6, 0.4, 0.05, w, { y: 0.5, z: -0.22 }));
  for (const x of [-0.7, 0.7]) g.add(K.box(0.06, 0.42, 0.42, K.mat('#555'), { x }));
  return g;
}
