// js/items/torch.js — fire on items (§4.2), OPUS-A: the torch head and arrow tips catch fire inside any
// 'fire' zone (campfires, braziers, another torch, burning enemies…), carry their own 'fire' zone while lit
// (so a lit torch lights the next torch / an arrow / a bomb fuse / a campfire), and go out in water, in a
// 'water' zone (poured flask), in a 'wind' zone (fan gust, wind blade), when stowed or after 180 s
// (state.burnLimit overrides, e.g. the torch shrine's 45 s).
import * as THREE from 'three';

const _h = new THREE.Vector3();

const _iq = new THREE.Quaternion();

/** A-P2-3: two cones in one geometry, vertex coloured: outer r 0.045 h 0.17 #ff6a2b → tip #ffb347,
 *  inner r 0.025 h 0.11 #fff1c0. Base at y = 0, pointing +Y (the flame is turned to world-up each frame). */
function flameGeometry() {
  const parts = [[0.045, 0.17, 0xff6a2b, 0xffb347], [0.025, 0.11, 0xfff1c0, 0xfff1c0]];
  const pos = [], col = [], fr = [];
  const ca = new THREE.Color(), cb = new THREE.Color();
  for (const [r, h, c0, c1] of parts) {
    const g = new THREE.ConeGeometry(r, h, 7, 1, true).toNonIndexed();
    g.translate(0, h / 2, 0);
    ca.setHex(c0); cb.setHex(c1);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const y = a.getY(i), f = y / h;
      pos.push(a.getX(i), y, a.getZ(i));
      col.push(ca.r + (cb.r - ca.r) * f, ca.g + (cb.g - ca.g) * f, ca.b + (cb.b - ca.b) * f);
      fr.push(f);
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.userData.rest = Float32Array.from(pos);
  geo.userData.f = Float32Array.from(fr);
  return geo;
}

export function createTorch(ctx, I) {
  // additive, fogged, vertex coloured (the world's basic)
  const flameMat = ctx.art.basic({ color: 0xffffff, additive: true, vertexColors: true, side: THREE.DoubleSide });
  let t = 0;

  const headZ = (inst) => (inst.id === 'torch' ? inst.def.torch.head : -0.8);
  const isFlammableCarrier = (inst) => inst.id === 'torch' || inst.id === 'arrow';

  function ensureFlame(inst) {
    if (inst.fx.flame) return;
    const g = new THREE.Group();
    g.name = 'flame';
    const z = headZ(inst);
    const big = inst.id === 'torch';
    g.position.set(0, 0, z - (big ? 0.02 : 0));
    const glow = ctx.art.glow({ color: 0xffb347, size: big ? 0.26 : 0.12, opacity: 0.75 });
    glow.name = 'torch-glow';
    glow.position.set(0, big ? 0.07 : 0, 0);
    g.add(glow);
    if (big) {
      const core = ctx.art.glow({ color: 0xfff1c0, size: 0.1, opacity: 1 });
      core.name = 'torch-core';
      core.position.set(0, 0.045, 0);
      g.add(core);
      const f = new THREE.Mesh(flameGeometry(), flameMat);
      f.name = 'flame-cone';
      f.frustumCulled = false;
      g.add(f);
      inst.fx.flameCone = f;
    }
    inst.fx.glow = glow;
    inst.fx.emberT = 0;
    inst.object3D.add(g);
    inst.fx.flame = g;
  }

  /** flicker on the CPU: height ±12 % at 7 Hz and 11 Hz, tip sway ±1.5 cm */
  function flicker(inst, time) {
    const f = inst.fx.flameCone;
    if (!f) return;
    const geo = f.geometry, rest = geo.userData.rest, fr = geo.userData.f, arr = geo.attributes.position.array;
    const ph = inst.uid * 1.7;
    const hk = 1 + 0.08 * Math.sin(time * 2 * Math.PI * 7 + ph) + 0.04 * Math.sin(time * 2 * Math.PI * 11 + ph * 2);
    const sx = 0.012 * Math.sin(time * 2 * Math.PI * 7 + ph * 0.5) + 0.003 * Math.sin(time * 2 * Math.PI * 11 + ph);
    const sz = 0.012 * Math.cos(time * 2 * Math.PI * 7 * 0.8 + ph) + 0.003 * Math.cos(time * 2 * Math.PI * 11 + ph * 1.3);
    for (let i = 0, n = fr.length; i < n; i++) {
      const k = fr[i] * fr[i];
      arr[i * 3] = rest[i * 3] + sx * k;
      arr[i * 3 + 1] = rest[i * 3 + 1] * hk;
      arr[i * 3 + 2] = rest[i * 3 + 2] + sz * k;
    }
    geo.attributes.position.needsUpdate = true;
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
        // flames burn upward whatever the torch's tilt: undo the item's world rotation
        _iq.copy(inst.quat).invert();
        inst.fx.flame.quaternion.copy(_iq);
        flicker(inst, t);
        const fl = 0.93 + 0.07 * Math.sin(t * 2 * Math.PI * 7 + inst.uid);
        inst.fx.glow.scale.setScalar((inst.id === 'torch' ? 0.26 : 0.12) * fl);
        inst.fx.emberT -= dt;
        if (inst.fx.emberT <= 0) { inst.fx.emberT = 0.25; I.fx('ember', head, { count: 1 }); }
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
    drawCalls() { let n = 0; for (const i of I.all) if (i.state.lit && i.fx.flame) n += i.fx.flameCone ? 3 : 1; return n; },
  };
}
