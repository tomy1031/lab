// js/core/warm.js — shader warm-up (OPUS-A). Every material/object combination OPUS-A can draw is drawn once in
// the first frame, before AW.ready: the skinned gloves (their baked-map variant), the bracers, gems, glow sprites,
// shadows and trail (hidden until used), and throwaway copies of a held sword (steel + gold), its glow and an item
// pool. Under SwiftShader a program link can take seconds; on a Quest it is a visible hitch. Drawing them here
// (scaled to nothing, just in front of the camera) moves that cost into the loading screen.
import * as THREE from 'three';

const MINE = /^(glove-|item-|items-|glow-sprites|item-shadows|gems$|swing-trail|sword-aura|holster-|grab-aim-|bowstring|flame-cone|torch-glow|torch-core|bomb-spark|gale$|gem$|warm-)/;

/** set up the warm-up for the next frame; returns done() to call after that frame */
export function prepareWarmup(ctx, extra = []) {
  const restore = [];
  const hiddenChain = (o) => { for (let x = o.parent; x; x = x.parent) if (!x.visible) return true; return false; };
  ctx.scene.traverse((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints) || !MINE.test(o.name || '')) return;
    if (o.visible && o.frustumCulled === false) return;
    if (hiddenChain(o)) return;                 // (a hidden fallback group stays hidden)
    restore.push([o, o.visible, o.frustumCulled]);
    o.visible = true;
    o.frustumCulled = false;
  });
  // throwaway objects, shrunk to nothing 0.5 m in front of the eye
  const group = new THREE.Group();
  group.name = 'warm-up';
  group.position.set(0, 0, -0.5);
  group.scale.setScalar(1e-4);
  for (const o of extra) {
    if (!o) continue;
    o.traverse((c) => { c.frustumCulled = false; if (!c.name) c.name = 'warm-'; });
    group.add(o);
  }
  ctx.camera.add(group);
  ctx.camera.updateMatrixWorld(true);
  return function done() {
    group.removeFromParent();
    // (item geometries are shared with the real items: only the throwaway glow geometry is freed)
    group.traverse((c) => { if (c.name === 'warm-sword-aura') c.geometry.dispose(); });
    for (const [o, v, f] of restore) { o.visible = v; o.frustumCulled = f; }
  };
}
