// js/core/warm.js — shader warm-up (OPUS-A). Every material/object combination OPUS-A can draw is drawn once in
// one synchronous frame before the loop starts (so before AW.ready): the skinned gloves (their baked-map
// variant), bracers, gems, glow sprites, shadows, trail, holster marks and comfort aids (shown for that frame
// only), plus throwaway copies of a held sword (steel + gold), its glow, an item pool, a flame / spark glow, the
// bowstring, a wind blade and the holster ghost. Under SwiftShader a program link can take seconds; on a Quest
// it is a visible hitch. Drawing them here (scaled to nothing, just in front of the camera) moves that cost into
// the loading screen. (Entering XR may still compile its own variants once.)
import * as THREE from 'three';

const MINE = /^(glove-|item-|items-|glow-sprites|item-shadows|gems$|swing-trail|sword-aura|holster-|grab-aim-|bowstring|flame-cone|torch-glow|torch-core|bomb-spark|gale$|gem$|vignette|center-ring|warm-)/;

/** draw everything once now (hidden OPUS-A objects shown for this frame, throwaway extras), then put it back */
export function warmShaders(ctx, extra = []) {
  const restore = [];
  const list = [];
  ctx.scene.traverse((o) => { if ((o.isMesh || o.isLine || o.isPoints) && MINE.test(o.name || '')) list.push(o); });
  for (const o of list) {
    // the object and any hidden group above it (the holster marks) are shown for this one frame
    for (let x = o; x && x !== ctx.scene; x = x.parent) {
      if (x.visible && (x !== o || x.frustumCulled === false)) continue;
      restore.push([x, x.visible, x.frustumCulled]);
      x.visible = true;
      if (x === o) x.frustumCulled = false;
    }
  }
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
  const t0 = performance.now();
  try {
    ctx.renderer.render(ctx.scene, ctx.camera);
  } finally {
    group.removeFromParent();
    // (item geometries are shared with the real items: only the throwaway glow geometry is freed)
    group.traverse((c) => { if (c.name === 'warm-sword-aura') c.geometry.dispose(); });
    for (let i = restore.length - 1; i >= 0; i--) { const [o, v, f] = restore[i]; o.visible = v; o.frustumCulled = f; }
  }
  return performance.now() - t0;
}
