// js/world/landmarks/towers.js — FABLE
// 鐘塔：6 本柱の吹き抜けの塔。中を昇降台が上下し、頂の甲板に鐘が下がる。目覚めると天の錨へ光の柱を放つ。
import * as THREE from 'three';
import { part, merge, G, tubeGeo } from '../geo.js';
import { structMaterial, toWorld } from './common.js';
import { LAKE_C } from '../layout.js';

const TINT = {
  meadow: { stone: 0xb9b3a2, stoneD: 0x8d8778, roof: 0x4f79b8, roofL: 0x7fa6dc },
  forest: { stone: 0x9aa392, stoneD: 0x6f7868, roof: 0x2f7a5e, roofL: 0x5fae8c },
  canyon: { stone: 0xd9a57c, stoneD: 0xa8704f, roof: 0x9a3f35, roofL: 0xd06a4a },
  peaks: { stone: 0xc5cede, stoneD: 0x8e9ab2, roof: 0x4c5f8f, roofL: 0x8fa6d8 },
};

export function buildTower(env, def, tw) {
  const H = tw.liftHeight, T = TINT[tw.region] || TINT.meadow;
  const parts = [];
  const R = 4.4;
  // 土台の敷石
  parts.push(part(G.cyl(7.2, 7.6, 0.3, 12), { pos: [0, 0.0, 0], bottom: T.stoneD, top: T.stone, vary: 0.1 }));
  parts.push(part(G.ring(2.3, 2.7, 16), { pos: [0, 0.17, 0], color: 0xf2c66b, glow: 1 }));
  // 柱：根もとは重い石の控え壁（足が大地に立つ）、その上に細い柱。甲板の上は笠を支える細柱
  const BH = Math.min(6, H * 0.24);
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.5) / 6 * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R;
    const xo = Math.sin(a) * (R + 0.35), zo = Math.cos(a) * (R + 0.35);
    parts.push(part(G.cyl(0.62, 1.05, BH, 4), { pos: [xo, BH / 2, zo], rot: [0, a + Math.PI / 4, 0], bottom: T.stoneD, top: T.stone, jitter: 0.04, jitterY: 0, vary: 0.1 }));
    parts.push(part(G.cone(0.72, 0.9, 4), { pos: [xo, BH + 0.42, zo], rot: [0, a + Math.PI / 4, 0], color: T.roof }));
    parts.push(part(G.cyl(0.27, 0.4, H - BH + 0.3, 6, 2), { pos: [x, BH + (H - BH) / 2 - 0.15, z], bottom: T.stoneD, top: T.stone, jitter: 0.02, jitterY: 0, vary: 0.1 }));
    const x2 = Math.sin(a) * 5.15, z2 = Math.cos(a) * 5.15;
    parts.push(part(G.cyl(0.12, 0.15, 5.4, 5), { pos: [x2, H + 2.7, z2], bottom: T.stoneD, top: T.stone }));
    parts.push(part(G.box(0.42, 0.5, 0.42), { pos: [x2, H + 0.25, z2], rot: [0, a, 0], color: T.stoneD }));
    // 光る紋（柱の内側）
    parts.push(part(G.box(0.1, (H - BH) * 0.6, 0.05), { pos: [x * 0.92, BH + (H - BH) * 0.45, z * 0.92], rot: [0, a, 0], color: 0xbfe9ff, glow: 1 }));
    // 甲板から垂れる旗（ひとつおき）
    if (i % 2 === 0) {
      const ab = a + Math.PI / 6, bx = Math.sin(ab) * 5.25, bz = Math.cos(ab) * 5.25;
      const fl = new THREE.PlaneGeometry(1.15, 4.6, 1, 4);
      for (const side of [0, Math.PI]) parts.push(part(fl, { pos: [bx, H - 2.65, bz], rot: [0, ab + side, 0], bottom: T.roof, top: T.roofL, sway: (p) => Math.max(0, H - 0.4 - p.y) * 0.18 }));
      parts.push(part(G.octa(0.16), { pos: [bx, H - 5.05, bz], scale: [1, 1.5, 0.5], rot: [0, ab, 0], color: 0xf2c66b, glow: 0.6 }));
    }
  }
  // 控え壁をつなぐ帯、中ほどの金の帯、甲板の下の太い帯（横線は少なく）
  parts.push(part(G.torus(R + 0.25, 0.3, 4, 6), { rot: [Math.PI / 2, 0, Math.PI / 6], pos: [0, BH - 0.1, 0], color: T.stoneD }));
  parts.push(part(G.torus(R, 0.12, 4, 12), { rot: [Math.PI / 2, 0, 0], pos: [0, BH + (H - BH) * 0.55, 0], color: 0xf2c66b, glow: 0.4 }));
  parts.push(part(G.torus(R + 0.05, 0.26, 4, 6), { rot: [Math.PI / 2, 0, Math.PI / 6], pos: [0, H - 0.6, 0], color: T.stoneD }));
  // 風のらせん：柱の外を 2 回り半のぼる細い光の帯
  {
    const pts = [], ra = [], turns = 2.5, n = 64;
    for (let k = 0; k <= n; k++) {
      const t = k / n, ang = t * turns * Math.PI * 2 + 0.4, y = BH + 0.6 + t * (H - BH - 1.6), r = R + 0.48;
      pts.push(new THREE.Vector3(Math.sin(ang) * r, y, Math.cos(ang) * r)); ra.push(0.085);
    }
    parts.push(part(tubeGeo(pts, ra, ra, 4), { color: 0xd8f6ff, glow: 0.9 }));
  }
  // 甲板（まん中は昇降台の穴）
  parts.push(part(new THREE.RingGeometry(2.25, 5.5, 12).rotateX(-Math.PI / 2), { pos: [0, H, 0], color: T.stone, vary: 0.12 }));
  parts.push(part(new THREE.RingGeometry(2.25, 5.5, 12).rotateX(Math.PI / 2), { pos: [0, H - 0.35, 0], color: T.stoneD }));
  parts.push(part(G.cyl(5.5, 5.5, 0.35, 12, 1, true), { pos: [0, H - 0.175, 0], color: T.stoneD }));
  parts.push(part(G.cyl(2.25, 2.25, 0.35, 12, 1, true), { pos: [0, H - 0.175, 0], scale: [-1, 1, 1], color: T.stoneD }));
  parts.push(part(G.ring(5.05, 5.4, 12), { pos: [0, H + 0.02, 0], color: 0xf2c66b, glow: 0.6 }));
  // 屋根（二重の笠）と金の頂
  parts.push(part(G.cone(5.9, 1.3, 6, true), { pos: [0, H + 6.0, 0], rot: [0, Math.PI / 6, 0], bottom: T.roof, top: T.roofL }));
  parts.push(part(G.cone(4.0, 4.4, 6, true), { pos: [0, H + 8.3, 0], rot: [0, Math.PI / 6, 0], bottom: T.roof, top: T.roofL }));
  parts.push(part(G.disc(5.9, 6), { pos: [0, H + 5.37, 0], rot: [Math.PI, Math.PI / 6, 0], color: T.stone }));
  parts.push(part(G.cyl(0.08, 0.08, 1.6, 4), { pos: [0, H + 11.1, 0], color: 0xf2c66b }));
  parts.push(part(G.octa(0.55), { pos: [0, H + 12.1, 0], scale: [1, 1.5, 1], color: 0xfff1c0, glow: 1 }));
  // 鐘（天の錨の方へ 2.8 m、胸の高さ）
  const dirA = Math.atan2(LAKE_C.x - def.x, -(LAKE_C.z - def.z));      // 錨への方位（ワールド）
  const la = dirA - (def.yaw || 0) * Math.PI / 180;                     // ローカルでの角度
  const bx = Math.sin(la) * 2.9, bz = -Math.cos(la) * 2.9;
  parts.push(part(G.cyl(0.025, 0.025, 3.6, 4), { pos: [bx, H + 3.5, bz], color: 0x6b5a3a }));
  parts.push(part(G.cyl(0.11, 0.26, 0.2, 8, 1, true), { pos: [bx, H + 1.6, bz], bottom: 0xe2b455, top: 0xffe08a, glow: 0.25 }));
  parts.push(part(G.cyl(0.26, 0.31, 0.22, 8, 1, true), { pos: [bx, H + 1.39, bz], bottom: 0xcf9a40, top: 0xe2b455, glow: 0.25 }));
  parts.push(part(G.cyl(0.33, 0.34, 0.05, 8, 1, true), { pos: [bx, H + 1.26, bz], color: 0xf2c66b, glow: 0.3 }));
  parts.push(part(G.sphere(0.12, 6, 4), { pos: [bx, H + 1.7, bz], color: 0xe2b455 }));
  parts.push(part(G.octa(0.05), { pos: [bx, H + 1.18, bz], color: 0x7fe9ff, glow: 1 }));

  const mat = structMaterial({ glow: 0x7fe9ff, amt: 0.08, night: 0.35, fogMul: 0.8 });
  const body = new THREE.Mesh(merge(parts), mat);
  const group = new THREE.Group();
  group.add(body);
  // 昇降台
  const lift = new THREE.Mesh(merge([
    part(G.cyl(2.15, 2.15, 0.22, 16), { pos: [0, -0.11, 0], bottom: T.stoneD, top: T.stone }),
    part(G.ring(1.7, 2.0, 16), { pos: [0, 0.012, 0], color: 0xf2c66b, glow: 1 }),
    part(G.ring(0.5, 0.62, 8), { pos: [0, 0.012, 0], color: 0x7fe9ff, glow: 1 }),
  ]), structMaterial({ glow: 0xffd76a, amt: 0.5, night: 0.4 }));
  lift.position.y = 0.2;
  group.add(lift);

  const anchors = {
    liftBase: toWorld(def, 0, 0.2, 0),
    top: toWorld(def, 0, H, 0),
    chime: toWorld(def, bx, H + 1.4, bz),
    roof: toWorld(def, 0, H + 12.1, 0),
  };
  // 衝突と甲板
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.5) / 6 * Math.PI * 2;
    const p = toWorld(def, Math.sin(a) * (R + 0.3), 0, Math.cos(a) * (R + 0.3));
    env.col.addCollider({ x: p.x, z: p.z, r: 0.95, y0: def.y - 1, y1: def.y + H, kind: 'structure' });
  }
  env.col.addPlatform({ x: def.x, z: def.z, r: 5.5, y: def.y + H, surface: 'stone' });
  env.col.addPlatform({ x: def.x, z: def.z, r: 7.3, y: def.y + 0.15, surface: 'stone' });

  // 光：頂の灯と、天の錨への光の柱
  const fx = env.fx;
  const gTop = fx.glows.add({ x: anchors.roof.x, y: anchors.roof.y, z: anchors.roof.z, size: 5, color: 0x9fe9ff, intensity: 0.12 });
  const gLamp = fx.glows.add({ x: def.x, y: def.y + H + 4.6, z: def.z, size: 3.2, color: 0xffd9a0, mode: 1, intensity: 0.5 });
  const beam = fx.shafts.add({ from: anchors.roof, to: new THREE.Vector3(LAKE_C.x, 262, LAKE_C.z), width: 2.6, color: 0x9fe9ff, intensity: 0 });
  const state = { awake: false, lift: 0 };
  function onState(key, value) {
    if (key === 'lift') lift.position.y = 0.2 + Math.max(0, Math.min(H, +value || 0));
    if (key === 'awake') {
      const on = !!value;
      mat.uniforms.uGlowAmt.value = on ? 1.1 : 0.08;
      mat.uniforms.uGlowCol.value.set(on ? 0xa8f0ff : 0x7fe9ff);
      fx.glows.set(gTop, { intensity: on ? 1.2 : 0.12, size: on ? 9 : 5 });
      fx.shafts.set(beam, { intensity: on ? 0.85 : 0 });
      if (on && env.ready) { fx.api.flash(anchors.chime, { color: 0xfff1c0, size: 8, life: 0.8 }); fx.api.emit('shard', anchors.chime, { count: 24, speed: 4 }); }
    }
  }
  return { object3D: group, anchors, state, onState, viewDist: 1e9, parts: { lift, body }, r: 7.5 };
}
