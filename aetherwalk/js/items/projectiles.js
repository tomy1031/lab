// js/items/projectiles.js — everything that moves on its own (§10.9), OPUS-A:
// arrows in flight (gravity, sweep targets → raycastSolid, stick in the ground, max 10 stuck, oldest goes),
// thrown / dropped items (gravity, bounce, roll, sleep; a throw hits each target once), and wind blades.
// Each step: ctx.targets.sweep along the motion first, then world.raycastSolid — nothing tunnels.
import * as THREE from 'three';
import { STUCK_ARROWS_MAX, PROJECTILE_MAX } from '../core/config.js';
import { clamp } from '../core/util.js';

const NEG_Z = new THREE.Vector3(0, 0, -1);
const _p1 = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _t0 = new THREE.Vector3(), _t1 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _hits = [], _ray = {}, _n = new THREE.Vector3();
// resting height of the item's origin above the ground when lying down
const REST = { sword: 0.016, spear: 0.02, torch: 0.04, bow: 0.012, shield: -0.035, arrow: 0.008, windfan: 0.014, flask: 0.045, waybell: 0.025 };
const LONG = new Set(['sword', 'spear', 'torch', 'bow', 'shield', 'arrow', 'windfan', 'flask', 'waybell']);
const FLOATS = new Set(['torch', 'bow', 'arrow', 'shield', 'windfan', 'apple', 'apple_baked', 'mushroom', 'mushroom_grilled', 'frostberry', 'honeycomb', 'flask']);

export function createProjectiles(ctx, I) {
  const gales = [];
  const galeGeo = new THREE.TorusGeometry(0.42, 0.025, 3, 14, Math.PI * 0.7);
  galeGeo.rotateZ(Math.PI * 0.15);
  galeGeo.rotateX(Math.PI / 2);
  const galeMat = new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const stuck = [];

  // A-P3-3: a pale 0.4 m streak behind each flying arrow (camera-facing quads, one mesh for all)
  const STREAK_MAX = 8;
  const sPos = new Float32Array(STREAK_MAX * 4 * 3), sCol = new Float32Array(STREAK_MAX * 4 * 3);
  const sIdx = [];
  for (let i = 0; i < STREAK_MAX; i++) { const a = i * 4; sIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setIndex(sIdx);
  const streaks = new THREE.Mesh(sGeo, ctx.art.basic({ color: 0xffffff, additive: true, vertexColors: true, side: THREE.DoubleSide }));
  streaks.name = 'item-streaks'; streaks.frustumCulled = false; streaks.visible = false; streaks.renderOrder = 7;
  ctx.scene.add(streaks);
  const _sd = new THREE.Vector3(), _ss = new THREE.Vector3(), _sc = new THREE.Vector3(), _sb = new THREE.Vector3();
  function updateStreaks() {
    let n = 0;
    _sc.setFromMatrixPosition(ctx.camera.matrixWorld);
    for (const inst of I.world) {
      if (n >= STREAK_MAX) break;
      if (!inst.flying || inst.vel.lengthSq() < 4) continue;
      _sd.copy(inst.vel).normalize();
      _sb.copy(inst.pos).addScaledVector(_sd, -0.4);
      _ss.copy(_sc).sub(inst.pos).cross(_sd);
      if (_ss.lengthSq() < 1e-8) continue;
      _ss.normalize().multiplyScalar(0.007);
      const o = n * 12;
      sPos[o] = inst.pos.x + _ss.x; sPos[o + 1] = inst.pos.y + _ss.y; sPos[o + 2] = inst.pos.z + _ss.z;
      sPos[o + 3] = inst.pos.x - _ss.x; sPos[o + 4] = inst.pos.y - _ss.y; sPos[o + 5] = inst.pos.z - _ss.z;
      sPos[o + 6] = _sb.x + _ss.x; sPos[o + 7] = _sb.y + _ss.y; sPos[o + 8] = _sb.z + _ss.z;
      sPos[o + 9] = _sb.x - _ss.x; sPos[o + 10] = _sb.y - _ss.y; sPos[o + 11] = _sb.z - _ss.z;
      const a = 0.35;                               // #fffbe8 × 0.35 at the arrow → 0 at the end
      sCol[o] = a; sCol[o + 1] = a * 0.98; sCol[o + 2] = a * 0.91; sCol[o + 3] = a; sCol[o + 4] = a * 0.98; sCol[o + 5] = a * 0.91;
      sCol.fill(0, o + 6, o + 12);
      n++;
    }
    if (n < STREAK_MAX) sPos.fill(0, n * 12);
    streaks.visible = n > 0;
    if (n) { sGeo.attributes.position.needsUpdate = true; sGeo.attributes.color.needsUpdate = true; }
  }

  const rest = (inst) => (REST[inst.id] ?? inst.radius);

  /** lay an item down on the ground under it (and stop it) */
  function settle(inst) {
    const w = ctx.world;
    let g = inst.pos.y - 0.5;
    try { g = w.groundAt(inst.pos.x, inst.pos.z, inst.pos.y + 0.3); } catch { /* stub */ }
    if (LONG.has(inst.id) && !inst.stuck) {
      _f.set(0, 0, -1).applyQuaternion(inst.quat);
      _f.y = 0;
      if (_f.lengthSq() < 1e-4) _f.set(0, 0, -1);
      _f.normalize();
      _z.copy(_f).negate();
      _x.set(0, 1, 0);
      _y.crossVectors(_z, _x);
      _m.makeBasis(_x, _y, _z);
      inst.quat.setFromRotationMatrix(_m);
    }
    if (Number.isFinite(g) && inst.pos.y - rest(inst) < g + 0.5) inst.pos.y = g + rest(inst);
    let wl = -Infinity;
    try { wl = w.waterLevelAt(inst.pos.x, inst.pos.z); } catch { /* stub */ }
    if (wl > inst.pos.y && FLOATS.has(inst.id)) inst.pos.y = wl;
    inst.vel.set(0, 0, 0); inst.angVel.set(0, 0, 0);
    inst.sleeping = true; inst.thrown = null; inst.flying = false;
  }

  function launchArrow(inst, dir, speed, damage, hand) {
    I.detachToWorld(inst);
    inst.flying = true;
    inst.stuck = false;
    inst.sleeping = false;
    inst.vel.copy(dir).multiplyScalar(speed);
    inst.arrowDamage = damage;
    inst.firedAt = ctx.clock.time;
    inst.firedBy = hand;
    inst.flightHits = inst.flightHits || new Set();
    inst.flightHits.clear();
    inst.quat.setFromUnitVectors(NEG_Z, _d.copy(dir).normalize());
    inst.droppedAt = ctx.clock.time;
    if (I.flyingCount() > PROJECTILE_MAX) retireOldest(inst);
    ctx.events.emit('projectile:fire', { kind: 'arrow', pos: inst.pos, dir: _d, speed, by: 'player', lit: !!inst.state.lit });
  }

  function retireOldest(except = null) {
    let old = null;
    for (const i of I.world) if ((i.flying || i.thrown) && i !== except && (!old || (i.firedAt ?? i.droppedAt) < (old.firedAt ?? old.droppedAt))) old = i;
    if (!old) return;
    if (old.id === 'arrow' && old.flying) I.despawn(old);
    else { old.flying = false; old.thrown = null; }
  }

  function stickArrow(inst, point, fwd, kind) {
    inst.flying = false;
    inst.vel.set(0, 0, 0);
    if (kind === 'water') { I.fx('splash', point, { count: 6 }); I.despawn(inst); return; }
    inst.pos.copy(point).addScaledVector(fwd, -0.74);        // tip buried a few cm
    inst.stuck = true;
    inst.sleeping = true;
    if (inst.state.lit) { inst.state.lit = false; ctx.events.emit('item:extinguish', { uid: inst.uid, itemId: inst.id }); }
    stuck.push(inst);
    while (stuck.length > STUCK_ARROWS_MAX) { const o = stuck.shift(); if (!o.dead && !o.heldBy) I.despawn(o); }
    I.fx('dust', point, { count: 4 });
  }

  function stepArrow(inst, dt) {
    inst.vel.y -= 9.8 * dt;
    const speed = inst.vel.length();
    _f.copy(inst.vel).normalize();
    _p1.copy(inst.pos).addScaledVector(inst.vel, dt);
    const len = inst.def.arrow.length - 0.02;
    _t0.copy(inst.pos).addScaledVector(_f, len);
    _t1.copy(_p1).addScaledVector(_f, len);
    // targets first
    const hits = ctx.targets.sweep(_t0, _t1, 0.03, _hits);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (h.target.owner === 'player' || inst.flightHits.has(h.target)) continue;
      inst.flightHits.add(h.target);
      const lit = !!inst.state.lit;
      const dmg = inst.arrowDamage + (lit ? inst.def.arrow.fireBonus : 0);
      I.hitTarget(h.target, { source: 'player', itemId: 'arrow', type: 'arrow', damage: dmg, element: lit ? 'fire' : 'none',
        point: h.point, dir: _f, speed, hand: inst.firedBy || null, part: h.sphere.part || 'body' });
      I.fx('spark', h.point, { count: 8, color: lit ? 0xffb347 : 0xffd76a });
      if (inst.firedBy) ctx.input.haptic(inst.firedBy, 0.3, 25);
      I.despawn(inst);
      return;
    }
    // then the world
    const dist = _t0.distanceTo(_t1);
    if (dist > 1e-5 && ctx.world?.raycastSolid) {
      _d.copy(_t1).sub(_t0).divideScalar(dist);
      const r = ctx.world.raycastSolid(_t0, _d, dist, _ray);
      if (r) { stickArrow(inst, r.point, _f, r.kind); return; }
    }
    inst.pos.copy(_p1);
    if (speed > 0.1) inst.quat.setFromUnitVectors(NEG_Z, _f);
    if (ctx.clock.time - inst.firedAt > 8 || inst.pos.y < -50) I.despawn(inst);
  }

  function stepFree(inst, dt) {
    const w = ctx.world;
    inst.vel.y -= 9.8 * dt;
    let wl = -Infinity;
    try { wl = w.waterLevelAt(inst.pos.x, inst.pos.z); } catch { /* stub */ }
    if (inst.pos.y < wl) {
      inst.vel.multiplyScalar(Math.max(0, 1 - 3 * dt));
      if (FLOATS.has(inst.id)) inst.vel.y += 14 * dt * clamp((wl - inst.pos.y) / 0.1, 0, 1.5);
      if (!inst.inWater) { inst.inWater = true; I.fx('splash', inst.pos, { count: 6 }); }
    } else inst.inWater = false;
    const speed = inst.vel.length();
    _p1.copy(inst.pos).addScaledVector(inst.vel, dt);
    // a throw hits each target once
    if (inst.thrown && speed > 0.5) {
      const hits = ctx.targets.sweep(inst.pos, _p1, Math.max(0.03, inst.radius * 0.8), _hits);
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.target.owner === 'player' || inst.thrown.hits.has(h.target)) continue;
        inst.thrown.hits.add(h.target);
        const th = inst.def.thrown;
        const lit = !!inst.state.lit;
        let dmg = th && speed >= th.minSpeed ? th.damage * I.damageMul() : 0;
        if (lit && inst.def.melee?.fireBonus) dmg += inst.def.melee.fireBonus;
        _d.copy(inst.vel).normalize();
        I.hitTarget(h.target, { source: 'player', itemId: inst.id, type: 'thrown', damage: dmg, element: lit ? 'fire' : 'none',
          point: h.point, dir: _d, speed, hand: inst.thrown.hand, part: h.sphere.part || 'body' });
        I.fx('spark', h.point, { count: 6 });
        // bounce off
        _n.copy(h.point).sub(h.sphere.c).normalize();
        const vn = inst.vel.dot(_n);
        if (vn < 0) inst.vel.addScaledVector(_n, -1.4 * vn).multiplyScalar(0.5);
        _p1.copy(inst.pos).addScaledVector(inst.vel, dt);
        break;
      }
    }
    // walls / trees / rocks
    const dist = inst.pos.distanceTo(_p1);
    if (dist > 1e-4 && w?.raycastSolid) {
      _d.copy(_p1).sub(inst.pos).divideScalar(dist);
      const r = w.raycastSolid(inst.pos, _d, dist + inst.radius * 0.5, _ray);
      if (r && r.kind !== 'ground' && r.kind !== 'water' && r.normal) {
        const vn = inst.vel.dot(r.normal);
        if (vn < 0) inst.vel.addScaledVector(r.normal, -1.5 * vn).multiplyScalar(0.55);
        _p1.copy(r.point).addScaledVector(r.normal, inst.radius + 0.01);
        if (inst.thrown) I.fx('spark', r.point, { count: 4 });
      }
    }
    // ground
    let g = -Infinity;
    try { g = w.groundAt(_p1.x, _p1.z, _p1.y + 0.4); } catch { g = -Infinity; }
    const rh = rest(inst);
    if (_p1.y - rh < g) {
      _p1.y = g + rh;
      if (inst.vel.y < 0) {
        const impact = -inst.vel.y;
        inst.vel.y = impact > 1.5 ? impact * 0.3 : 0;
        inst.vel.x *= 0.62; inst.vel.z *= 0.62;
        inst.angVel.multiplyScalar(0.5);
        if (impact > 2.5) I.fx('dust', _p1, { count: 3 });
      }
      inst.thrown = null;
      if (inst.vel.length() < 0.35) { inst.pos.copy(_p1); settle(inst); return; }
      // rolling friction
      inst.vel.x *= Math.max(0, 1 - 2.5 * dt); inst.vel.z *= Math.max(0, 1 - 2.5 * dt);
    }
    if (inst.inWater && FLOATS.has(inst.id) && Math.abs(_p1.y - wl) < 0.05 && inst.vel.length() < 0.3) { inst.pos.copy(_p1); inst.pos.y = wl; settle(inst); return; }
    inst.pos.copy(_p1);
    // spin
    const av = inst.angVel.length();
    if (av > 1e-3) {
      _q.setFromAxisAngle(_n.copy(inst.angVel).multiplyScalar(1 / av), av * dt);
      inst.quat.premultiply(_q).normalize();
    }
    if (inst.pos.y < -60) I.despawn(inst);
  }

  // ── wind blades ──
  function fireGale(pos, dir, hand) {
    let g = gales.find((x) => !x.alive);
    if (!g) {
      if (gales.length >= 3) return null;
      const mesh = new THREE.Mesh(galeGeo, galeMat);
      mesh.name = 'gale';
      mesh.frustumCulled = false;
      mesh.renderOrder = 7;
      ctx.scene.add(mesh);
      g = { mesh, pos: new THREE.Vector3(), prev: new THREE.Vector3(), dir: new THREE.Vector3(), life: 0, alive: false, hits: new Set(), zone: null, hand: null };
      gales.push(g);
    }
    g.alive = true; g.life = 0.6; g.hits.clear(); g.hand = hand;
    g.pos.copy(pos); g.prev.copy(pos);
    g.dir.copy(dir).normalize();
    g.mesh.visible = true;
    g.mesh.position.copy(pos);
    g.mesh.quaternion.setFromUnitVectors(NEG_Z, g.dir);
    g.zone = ctx.zones.add({ kind: 'wind', pos: g.pos, r: 0.5, owner: 'gale', data: { dir: g.dir, strength: 1 } });
    ctx.events.emit('projectile:fire', { kind: 'gale', pos: g.pos, dir: g.dir, speed: 14, by: 'player' });
    return g;
  }
  function updateGales(dt) {
    for (const g of gales) {
      if (!g.alive) continue;
      g.life -= dt;
      g.prev.copy(g.pos);
      g.pos.addScaledVector(g.dir, 14 * dt);
      const hits = ctx.targets.sweep(g.prev, g.pos, 0.35, _hits);
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.target.owner === 'player' || g.hits.has(h.target)) continue;
        g.hits.add(h.target);
        I.hitTarget(h.target, { source: 'player', itemId: 'gale', type: 'slash', damage: 4 * I.damageMul(), element: 'wind',
          point: h.point, dir: g.dir, speed: 14, hand: g.hand, part: h.sphere.part || 'body' });
        I.fx('gust', h.point, { count: 8, dir: g.dir });
      }
      g.mesh.position.copy(g.pos);
      g.mesh.scale.setScalar(0.8 + (0.6 - g.life) * 0.8);
      if (g.life <= 0.3 && g.zone) { ctx.zones.remove(g.zone); g.zone = null; }
      if (g.life <= 0) { g.alive = false; g.mesh.visible = false; if (g.zone) { ctx.zones.remove(g.zone); g.zone = null; } }
    }
  }

  function update(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.05 - 1e-6));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      const list = I.world;
      for (let i = list.length - 1; i >= 0; i--) {
        const inst = list[i];
        if (!inst || inst.pulled || inst.heldBy || inst.dead) continue;
        if (inst.flying) stepArrow(inst, h);
        else if (!inst.sleeping) stepFree(inst, h);
      }
      updateGales(h);
    }
    updateStreaks();
  }

  return {
    update, settle, launchArrow, fireGale, retireOldest,
    drawCalls() { let n = streaks.visible ? 1 : 0; for (const g of gales) if (g.alive) n++; return n; },
  };
}
