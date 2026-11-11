// js/world/landmarks/index.js — FABLE
// 動かない景観：天の錨、大樹、アーチ、遺跡。遠いものは隠す。
import * as THREE from 'three';
import { buildSkyAnchor } from './skyanchor.js';
import { buildStart, buildPier, buildFallenBridge, buildLighthouse, buildArch, buildElder, buildIsle } from './ruins.js';
import { yawRot, STONE_WET } from './common.js';
import { LAKE_LEVEL } from '../layout.js';

export function createLandmarks(env, sp) {
  const group = new THREE.Group();
  group.name = 'aw-landmarks';
  const L = sp.landmarks;
  const items = [];
  const place = (mesh, def, viewDist, radius = 20) => {
    mesh.position.set(def.x, def.y, def.z);
    mesh.rotation.y = yawRot(def.yaw || 0);
    mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
    group.add(mesh);
    items.push({ mesh, x: def.x, z: def.z, viewDist });
    return mesh;
  };
  const anchor = buildSkyAnchor(env);
  group.add(anchor.group);

  place(buildStart(env, L.start), L.start, 520);
  const pier = buildPier(env, L.pier, LAKE_LEVEL);
  place(pier.mesh, L.pier, 420);
  place(buildFallenBridge(env, L.fallen_bridge), L.fallen_bridge, 420);
  const lh = { x: 489, z: 508, yaw: 40 };
  lh.y = env.hf.heightAt(lh.x, lh.z);
  place(buildLighthouse(env, lh), lh, 600);
  place(buildIsle(env, { x: L.isle.x, y: L.isle.y, z: L.isle.z, yaw: 0 }), { x: L.isle.x, y: L.isle.y, z: L.isle.z, yaw: 0 }, 520);
  place(buildArch(env, L.great_arch), L.great_arch, 1e9);
  place(buildElder(env, L.elder_tree), L.elder_tree, 1e9);

  let timer = 0;
  function update(view) {
    anchor.update(view);
    // 石の濡れ：夜明け（5〜8 時）にいちばん濡れ、日が高くなると乾く。夜は夜露で少し
    const h = env.world.time, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    STONE_WET.value = Math.max(sm(4.6, 5.6, h) * (1 - sm(7.6, 9.6, h)), view.st.night * 0.45);
    timer -= view.dt;
    if (timer > 0 && !view.jump) return;
    timer = 0.3;
    for (const it of items) {
      const dx = it.x - view.cam.x, dz = it.z - view.cam.z;
      it.mesh.visible = dx * dx + dz * dz < it.viewDist * it.viewDist;
    }
  }
  return { group, update, pier, lighthouse: lh };
}
