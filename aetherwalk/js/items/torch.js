// js/items/torch.js — fire on items (§4.2), OPUS-A: the torch head and arrow tips catch fire inside any
// 'fire' zone (campfires, braziers, another torch, burning enemies…), carry their own 'fire' zone while lit
// (so a lit torch lights the next torch / an arrow / a bomb fuse / a campfire), and go out in water, in a
// 'water' zone (poured flask), in a 'wind' zone (fan gust, wind blade), when stowed or after 180 s
// (state.burnLimit overrides, e.g. the torch shrine's 45 s).
import * as THREE from 'three';
import { billboard } from '../core/stubs.js';

const _h = new THREE.Vector3();

export function createTorch(ctx, I) {
  const flameGeo = new THREE.ConeGeometry(0.045, 0.16, 6, 1);
  flameGeo.rotateX(-Math.PI / 2);         // tip toward -Z (along the torch)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  let t = 0;

  const headZ = (inst) => (inst.id === 'torch' ? inst.def.torch.head : -0.8);
  const isFlammableCarrier = (inst) => inst.id === 'torch' || inst.id === 'arrow';

  function ensureFlame(inst) {
    if (inst.fx.flame) return;
    const g = new THREE.Group();
    g.name = 'flame';
    const z = headZ(inst);
    const big = inst.id === 'torch';
    const glow = ctx.art.glow({ color: 0xffb347, size: big ? 0.42 : 0.18, opacity: 0.9 });
    glow.position.set(0, 0, z - (big ? 0.06 : 0.0));
    g.add(glow);
    if (big) {
      const f = new THREE.Mesh(flameGeo, flameMat);
      f.position.set(0, 0, z - 0.09);
      f.name = 'flame-cone';
      g.add(f);
      inst.fx.flameCone = f;
    }
    inst.fx.glow = glow;
    inst.object3D.add(g);
    inst.fx.flame = g;
  }

  function ignite(inst) {
    if (inst.state.lit) return;
    inst.state.lit = true;
    inst.state.litTime = 0;
    ensureFlame(inst);
    inst.fx.flame.visible = true;
    ctx.events.emit('item:ignite', { uid: inst.uid, itemId: inst.id });
    I.fx('ember', I.toWorld(inst, 0, 0, headZ(inst), _h), { count: 10 });
    if (inst.heldBy) ctx.input.haptic(inst.heldBy, 0.3, 30);
  }
  function extinguish(inst, why = 'out') {
    if (!inst.state.lit) return;
    inst.state.lit = false;
    if (inst.fx.flame) inst.fx.flame.visible = false;
    if (inst.fireZone) { ctx.zones.remove(inst.fireZone); inst.fireZone = null; }
    ctx.events.emit('item:extinguish', { uid: inst.uid, itemId: inst.id, why });
    I.fx('smoke', I.toWorld(inst, 0, 0, headZ(inst), _h), { count: 6 });
  }

  function update(dt) {
    t += dt;
    const w = ctx.world;
    for (const inst of I.all) {
      if (!isFlammableCarrier(inst) || inst.dead) continue;
      const head = I.toWorld(inst, 0, 0, headZ(inst), inst._head || (inst._head = new THREE.Vector3()));
      if (inst.state.lit) {
        inst.state.litTime += dt;
        const limit = inst.state.burnLimit ?? (inst.id === 'torch' ? inst.def.torch.burnTime : 60);
        let wl = -Infinity;
        try { wl = w.waterLevelAt(head.x, head.z); } catch { /* stub */ }
        if (inst.state.litTime > limit) { extinguish(inst, 'burnout'); continue; }
        if (head.y < wl) { extinguish(inst, 'water'); I.fx('splash', head, { count: 4 }); continue; }
        if (ctx.zones.any('water', head, 0.05)) { extinguish(inst, 'water'); continue; }
        const wind = ctx.zones.any('wind', head, 0.05);
        if (wind && wind.owner !== inst) { extinguish(inst, 'wind'); continue; }
        if (!inst.fireZone) inst.fireZone = ctx.zones.add({ kind: 'fire', pos: new THREE.Vector3().copy(head), r: inst.id === 'torch' ? 0.18 : 0.07, owner: inst, data: { itemId: inst.id, uid: inst.uid } });
        else inst.fireZone.pos.copy(head);
        ensureFlame(inst);
        inst.fx.flame.visible = true;
        const fl = 0.85 + 0.15 * Math.sin(t * 23 + inst.uid) * Math.sin(t * 9.7 + inst.uid * 2);
        if (inst.fx.flameCone) inst.fx.flameCone.scale.set(fl, fl, 0.8 + 0.4 * fl);
        inst.fx.glow.scale.setScalar((inst.id === 'torch' ? 0.42 : 0.18) * (0.9 + 0.2 * fl));
        if (Math.random() < dt * 4) I.fx('ember', head, { count: 1 });
      } else {
        if (inst.fireZone) { ctx.zones.remove(inst.fireZone); inst.fireZone = null; }
        if (inst.fx.flame) inst.fx.flame.visible = false;
        // catch fire from any fire that isn't ours
        if (ctx.zones.any('fire', head, inst.id === 'torch' ? 0.06 : 0.03, inst)) {
          let wl = -Infinity;
          try { wl = w.waterLevelAt(head.x, head.z); } catch { /* stub */ }
          if (head.y >= wl) ignite(inst);
        }
      }
    }
  }

  return {
    update, ignite, extinguish,
    drawCalls() { let n = 0; for (const i of I.all) if (i.state.lit && i.fx.flame) n += i.fx.flameCone ? 2 : 1; return n; },
  };
}

export { billboard };
