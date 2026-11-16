// js/world/landmarks/shrines.js — FABLE
// 祠：石の輪と 3 本の立石、宙に浮く結晶。遠くから細い光の筋が見える。
import * as THREE from 'three';
import { part, merge, G } from '../geo.js';
import { structMaterial, toWorld, makeFlame } from './common.js';

const MODE = {
  idle: { col: 0x7fe9ff, amt: 0.55, shaft: 0.45, glow: 0.7 },
  active: { col: 0xffd76a, amt: 1.3, shaft: 0.9, glow: 1.3 },
  done: { col: 0xb8ffd0, amt: 0.7, shaft: 0.25, glow: 0.6 },
};

export function buildShrine(env, def) {
  const parts = [];
  const stone = 0xa9a79c, stoneD = 0x77756c;
  parts.push(part(G.cyl(5.0, 5.3, 0.24, 14), { pos: [0, 0.02, 0], bottom: stoneD, top: stone, vary: 0.12 }));
  parts.push(part(G.ring(6.6, 7.0, 28), { pos: [0, 0.06, 0], color: 0xdff6ff, glow: 1 }));          // 挑戦の輪
  parts.push(part(G.ring(3.3, 3.5, 20), { pos: [0, 0.16, 0], color: 0xdff6ff, glow: 0.8 }));
  parts.push(part(G.ring(0.9, 1.05, 10), { pos: [0, 0.16, 0], color: 0xf2c66b, glow: 0.8 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI, x = Math.sin(a) * 4.3, z = Math.cos(a) * 4.3;
    const h = i === 0 ? 4.4 : 3.3;
    parts.push(part(G.cyl(0.34, 0.62, h, 5, 2), { pos: [x, h / 2, z], rot: [0, a, 0], scale: [1.5, 1, 0.7], bottom: stoneD, top: stone, jitter: 0.05, jitterY: 0, vary: 0.1 }));
    parts.push(part(G.box(0.1, h * 0.55, 0.06), { pos: [x * 0.9, h * 0.52, z * 0.9], rot: [0, a, 0], color: 0xdff6ff, glow: 1 }));
    parts.push(part(G.octa(0.16), { pos: [x * 0.9, h * 0.88, z * 0.9], color: 0xdff6ff, glow: 1 }));
  }
  // 宙の結晶
  parts.push(part(G.octa(0.42), { pos: [0, 3.5, 0], scale: [1, 1.7, 1], rot: [0, 0.3, 0], color: 0xeafcff, glow: 1 }));
  parts.push(part(G.octa(0.14), { pos: [0.6, 3.1, 0.2], color: 0xeafcff, glow: 1 }));
  parts.push(part(G.octa(0.11), { pos: [-0.5, 3.9, -0.3], color: 0xeafcff, glow: 1 }));
  const torch = def.data && def.data.type === 'torch';
  if (torch) {
    // 灯しの祠：いつも燃えている火皿（正面）
    parts.push(part(G.cyl(0.22, 0.36, 0.9, 6), { pos: [0, 0.6, -2.6], bottom: stoneD, top: stone }));
    parts.push(part(G.cyl(0.5, 0.22, 0.3, 8), { pos: [0, 1.2, -2.6], bottom: stoneD, top: stone }));
  }
  const mat = structMaterial({ glow: MODE.idle.col, amt: MODE.idle.amt, night: 0.5 });
  const body = new THREE.Mesh(merge(parts), mat);
  const group = new THREE.Group();
  group.add(body);
  const anchors = { center: toWorld(def, 0, 0.15, 0), crystal: toWorld(def, 0, 3.5, 0) };
  if (torch) {
    const flame = makeFlame(0.9);
    flame.position.set(0, 1.28, -2.6); flame.visible = true;
    group.add(flame);
    anchors.fire = toWorld(def, 0, 1.55, -2.6);
    env.fx.glows.add({ x: anchors.fire.x, y: anchors.fire.y + 0.1, z: anchors.fire.z, size: 2.4, color: 0xffa040, intensity: 0.95, flicker: 0.35 });
    const fp = toWorld(def, 0, 0, -2.6);
    env.col.addCollider({ x: fp.x, z: fp.z, r: 0.45, y0: def.y, y1: def.y + 1.4, kind: 'structure' });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI;
    const p = toWorld(def, Math.sin(a) * 4.3, 0, Math.cos(a) * 4.3);
    env.col.addCollider({ x: p.x, z: p.z, r: 0.6, y0: def.y - 1, y1: def.y + 4.4, kind: 'structure' });
  }
  const fx = env.fx;
  const g = fx.glows.add({ x: anchors.crystal.x, y: anchors.crystal.y, z: anchors.crystal.z, size: 2.6, color: MODE.idle.col, intensity: MODE.idle.glow, flicker: 0.1 });
  const top = anchors.crystal.clone(); top.y += 46;
  const shaft = fx.shafts.add({ from: anchors.crystal, to: top, width: 0.7, color: MODE.idle.col, intensity: MODE.idle.shaft });
  const state = { mode: 'idle' };
  function onState(key, value) {
    if (key !== 'mode') return;
    const m = MODE[value] || MODE.idle;
    mat.uniforms.uGlowCol.value.set(m.col); mat.uniforms.uGlowAmt.value = m.amt;
    fx.glows.set(g, { color: m.col, intensity: m.glow });
    fx.shafts.set(shaft, { color: m.col, intensity: m.shaft });
    if (env.ready && value === 'done') { fx.api.flash(anchors.crystal, { color: 0xb8ffd0, size: 7, life: 0.9 }); fx.api.emit('heal', anchors.crystal, { count: 24 }); }
  }
  return { object3D: group, anchors, state, onState, viewDist: 420, r: 7 };
}
