// js/core/gems.js — every small cyan gem on the player's things (glove cuffs, shield boss, sword guard) in ONE
// instanced draw call with art.basic (#7fe9ff, lit-independent, fogged). Each gem follows an Object3D:
// add(object3D, x, y, z, size) → handle; remove(handle). Matrices are rebuilt once per frame just before
// rendering (a loop 'post' hook). No allocation per frame.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
const MAX = 32;

export function getGems(ctx) {
  if (ctx._awGems) return ctx._awGems;
  const geo = new THREE.OctahedronGeometry(1, 0);
  const mesh = new THREE.InstancedMesh(geo, ctx.art.basic({ color: 0x7fe9ff }), MAX);
  mesh.name = 'gems';
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 1;
  ctx.scene.add(mesh);
  const list = [];

  function visibleChain(o) {
    for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === ctx.scene) return true; }
    return false;                                      // not in the scene
  }
  function update() {
    let n = 0;
    const cam = ctx.camera.matrixWorld.elements;
    for (let i = 0; i < list.length && n < MAX; i++) {
      const h = list[i];
      if (!visibleChain(h.obj)) continue;
      h.obj.updateWorldMatrix(true, false);
      _p.set(h.x, h.y, h.z);
      _s.setScalar(h.size);
      _l.compose(_p, _q.identity(), _s);
      _m.multiplyMatrices(h.obj.matrixWorld, _l);
      const e = _m.elements;
      const dx = e[12] - cam[12], dy = e[13] - cam[13], dz = e[14] - cam[14];
      if (dx * dx + dy * dy + dz * dz > 3600) continue;    // 60 m
      mesh.setMatrixAt(n++, _m);
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
  }
  ctx.loop?.addHook?.('gems', update, 'post');
  const gems = {
    mesh,
    add(obj, x, y, z, size) { const h = { obj, x, y, z, size }; list.push(h); return h; },
    remove(h) { const i = list.indexOf(h); if (i >= 0) list.splice(i, 1); },
    get count() { return mesh.count; },
  };
  ctx._awGems = gems;
  return gems;
}

// ── soft glow sprites (pickups, gem glints at night): one instanced additive art.basic quad mesh, facing the
// camera. Producers call push(pos, size, color) during their update; the mesh is rebuilt right before render.
const _sp = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3(), _sm = new THREE.Matrix4();
export function getSprites(ctx) {
  if (ctx._awSprites) return ctx._awSprites;
  const tex = ctx.art.canvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  const MAXS = 32;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), ctx.art.basic({ color: 0xffffff, map: tex, additive: true }), MAXS);
  mesh.name = 'glow-sprites';
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 8;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  ctx.scene.add(mesh);
  const P = Array.from({ length: MAXS }, () => ({ p: new THREE.Vector3(), s: 0, c: new THREE.Color() }));
  let n = 0;
  ctx.loop?.addHook?.('sprites-reset', () => { n = 0; }, 'pre');
  ctx.loop?.addHook?.('sprites', () => {
    ctx.camera.matrixWorld.decompose(_sp, _sq, _ss);
    for (let i = 0; i < n; i++) {
      _ss.setScalar(P[i].s);
      _sm.compose(P[i].p, _sq, _ss);
      mesh.setMatrixAt(i, _sm);
      mesh.setColorAt(i, P[i].c);
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, 'post');
  const sprites = {
    mesh,
    /** a glow of diameter `size` (m) at world `pos`; `color` a THREE.Color (brightness = strength) */
    push(pos, size, color) { if (n >= MAXS) return false; const e = P[n++]; e.p.copy(pos); e.s = size; e.c.copy(color); return true; },
    get count() { return n; },
  };
  ctx._awSprites = sprites;
  return sprites;
}
