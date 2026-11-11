// js/world/landmarks/skyanchor.js — FABLE
// 天の錨：湖の上（y 170〜330）に浮かぶ巨大な結晶岩。金の帯と欠片がゆっくり回る。
import * as THREE from 'three';
import { part, merge, G } from '../geo.js';
import { structMaterial } from './common.js';
import { LAKE_C } from '../layout.js';

export function buildSkyAnchor(env) {
  const rng = env.fork('anchor');
  const group = new THREE.Group();
  group.position.set(LAKE_C.x, 0, LAKE_C.z);
  const P = [];
  const crystal = (p, n) => {
    const t = Math.min(1, Math.max(0, (p.y - 170) / 160));
    const k = 0.72 + 0.28 * Math.max(0, n.y) + 0.1 * Math.sin(p.y * 0.21 + p.x * 0.13);
    return [(0.34 + 0.3 * t) * k, (0.62 + 0.22 * t) * k, (0.9 + 0.1 * t) * k];
  };
  // 芯の結晶：上は尖塔、下は長い錨の爪
  P.push(part(G.cone(34, 78, 7, true), { pos: [0, 291, 0], color: crystal, jitter: 2.2, glow: (p) => 0.25 + 0.5 * Math.max(0, Math.sin(p.y * 0.35 + p.x * 0.2)) }));
  P.push(part(G.cone(34, 86, 7, true), { pos: [0, 213, 0], rot: [Math.PI, 0, 0], color: crystal, jitter: 2.2, glow: (p) => 0.3 + 0.6 * Math.max(0, Math.sin(p.y * 0.3 + p.z * 0.2)) }));
  // 寄りそう小さな結晶
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.range(-0.3, 0.3), r = rng.range(20, 34), h = rng.range(26, 58), w = rng.range(6, 11);
    const x = Math.sin(a) * r, z = Math.cos(a) * r, y = 262 + rng.range(-6, 10);
    P.push(part(G.cone(w, h, 5, true), { pos: [x, y + h / 2, z], rot: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], color: crystal, glow: 0.45 }));
    if (i % 2 === 0) P.push(part(G.cone(w * 0.8, h * 0.8, 5, true), { pos: [x * 0.9, y - h * 0.4 - 6, z * 0.9], rot: [Math.PI + Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25], color: crystal, glow: 0.5 }));
  }
  // 岩の衣（腰まわりの浮き島。上は草）
  // 浮き岩：上は草、側面は暖かい石、下面は結晶の光を受けて淡い青（下から見上げるので暗くしない）
  const rock = (p, n) => {
    const up = Math.max(0, n.y);
    if (up > 0.6) return [0.24 + 0.08 * up, 0.55, 0.22];
    if (n.y < -0.3) return [0.36, 0.48, 0.62];
    const k = 0.78 + 0.22 * up + 0.08 * Math.sin(p.y * 0.7 + p.x * 0.3);
    return [0.5 * k, 0.46 * k, 0.43 * k];
  };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2), r = rng.range(30, 44), s = rng.range(11, 19);
    P.push(part(G.dodeca(s), { pos: [Math.sin(a) * r, 258 + rng.range(-9, 4), Math.cos(a) * r], scale: [1.25, 0.62, 1.25], rot: [0, a, 0], color: rock, jitter: 1.6, glow: 0.22 }));
  }
  const mat = structMaterial({ glow: 0x7fd4ff, amt: 0.5, night: 0.55, fogMul: 0.5, rim: 0.5 });
  const body = new THREE.Mesh(merge(P), mat);
  group.add(body);

  // 金の帯と、まわる欠片
  const R = [];
  R.push(part(G.torus(52, 0.9, 4, 40), { rot: [Math.PI / 2 - 0.22, 0, 0.1], pos: [0, 262, 0], color: 0xf2c66b, glow: 0.5 }));
  R.push(part(G.torus(40, 0.7, 4, 36, Math.PI * 1.55), { rot: [Math.PI / 2 + 0.35, 0.3, 0], pos: [0, 246, 0], color: 0xf2c66b, glow: 0.5 }));
  R.push(part(G.torus(27, 0.6, 4, 28, Math.PI * 1.2), { rot: [Math.PI / 2 - 0.5, -0.4, 1.0], pos: [0, 300, 0], color: 0xffe9a8, glow: 0.6 }));
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, 6.28), r = rng.range(48, 74), s = rng.range(1.6, 5);
    R.push(part(G.octa(s), { pos: [Math.sin(a) * r, 262 + rng.range(-40, 46), Math.cos(a) * r], scale: [0.7, 1.7, 0.7], rot: [rng.range(-0.5, 0.5), a, rng.range(-0.5, 0.5)], color: crystal, glow: 0.7 }));
  }
  const ringMat = structMaterial({ glow: 0xffe2a0, amt: 0.6, night: 0.5, fogMul: 0.5, rim: 0.4 });
  const rings = new THREE.Mesh(merge(R), ringMat);
  group.add(rings);

  const g1 = env.fx.glows.add({ x: LAKE_C.x, y: 262, z: LAKE_C.z, size: 120, color: 0x7fd4ff, intensity: 0.22 });
  const g2 = env.fx.glows.add({ x: LAKE_C.x, y: 262, z: LAKE_C.z, size: 46, color: 0xdff6ff, intensity: 0.3 });
  let t = 0;
  function update(view) {
    t += view.dt;
    rings.rotation.y = t * 0.035;
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.6);
    const night = view.st.night;
    env.fx.glows.set(g1, { intensity: 0.16 + 0.3 * night + 0.06 * pulse });
    env.fx.glows.set(g2, { intensity: 0.2 + 0.35 * night + 0.1 * pulse });
    mat.uniforms.uGlowAmt.value = 0.45 + 0.12 * pulse;
  }
  return { group, update };
}
