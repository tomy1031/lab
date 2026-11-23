// js/game/pickups.js — light shards (auto-collect), enemy drops, chests, gathering points (OPUS-B)
import * as THREE from 'three';
import { heightAt, fx, flash, emit, toast, spawnList, findProp, setPropState, anchorOf, playerPos } from './util.js';

const MAX_SHARDS = 48;

export function createPickups(ctx, G) {
  const root = new THREE.Group();
  root.name = 'game:pickups';
  ctx.scene && ctx.scene.add(root);
  const art = ctx.art || (ctx.world && ctx.world.art);
  let shardMat;
  try { shardMat = art && art.basic ? art.basic({ color: 0xffd76a }) : null; } catch (e) { shardMat = null; }
  if (!shardMat) shardMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
  const shardMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0).scale(1, 1.6, 1), shardMat, MAX_SHARDS);
  shardMesh.frustumCulled = false;
  shardMesh.count = 0;
  root.add(shardMesh);
  const shards = [];
  for (let i = 0; i < MAX_SHARDS; i++) shards.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, ground: 0, spin: Math.random() * 6 });

  const _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
  const _a = new THREE.Vector3();
  let chestT = 0, gatherT = 0, pendingShard = 0, shardToastT = 0;
  // the Wayfarer Blade on the camp pedestal: a real world item you grip (spawned when you come within 3 m)
  const ped = { inst: null, failed: false };
  const _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _yAxis = new THREE.Vector3(0, 1, 0), _zAxis = new THREE.Vector3(0, 0, 1);
  // the prop sword's mesh frame (+Y up the blade, guard across X, flats facing Z) → the item's frame
  // (blade toward −Z, guard across Y, flats facing X): item x→z, y→x, z→y
  const PED_PERM = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  const PED_GRIP_Y = 1.45;    // prop sword guard at 1.40 in its mesh frame; the item's guard sits 0.05 below its grip origin
  const PED_TILT = 0.12;      // the prop sword's lean (rotation.z about the pedestal base)
  const PED_SPAWN = 6.0, PED_DROP = 25;
  const itemsReal = () => { const it = ctx.items; return !!(it && !it.isStub && typeof it.spawn === 'function'); };

  const chests = [];
  const gathers = [];
  const spawned = new Map();     // world item uid → gather entry

  const P = {
    shards, chests, gathers,
    dropShards(pos, n) {
      for (let k = 0; k < n; k++) {
        const s = shards.find((q) => !q.active);
        if (!s) { G.inventory.add('shard', n - k, { silent: true }); break; }
        s.active = true; s.t = 0;
        s.pos.set(pos.x, (pos.y || heightAt(ctx, pos.x, pos.z)) + 0.6, pos.z);
        const a = Math.random() * Math.PI * 2;
        s.vel.set(Math.cos(a) * 1.6, 3 + Math.random() * 1.5, Math.sin(a) * 1.6);
        s.ground = heightAt(ctx, pos.x, pos.z);
      }
    },
    dropItem(itemId, pos, n = 1) {
      const items = ctx.items;
      const def = G.inventory.def(itemId);
      // key gear (e.g. the husk's shield) goes straight to the bag so progress can't be lost
      if (def && def.stack === 1) { G.inventory.add(itemId, 1); return; }
      if (items && typeof items.spawn === 'function') {
        for (let k = 0; k < n; k++) {
          try {
            items.spawn(itemId, { pos: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.6, (pos.y || heightAt(ctx, pos.x, pos.z)) + 0.5, pos.z + (Math.random() - 0.5) * 0.6),
              vel: new THREE.Vector3((Math.random() - 0.5), 2.5, (Math.random() - 0.5)) });
          } catch (e) { G.inventory.add(itemId, 1); }
        }
      } else {
        const got = G.inventory.add(itemId, n);
        if (got && def) toast(ctx, `${def.name} ×${got}`, def.en || '', 'item', 2200);
      }
    },
    load() {
      chests.length = 0;
      for (const c of spawnList(ctx, 'chests')) {
        // the sword lies on a pedestal at the first camp (a chest entry with pedestal: true)
        const ped = findProp(ctx, 'pedestal', c.id, c.x, c.z, 4);
        const isPed = !!c.pedestal || (!!ped && (c.loot || []).some((l) => l.itemId === 'sword'));
        const prop = isPed ? (ped || findProp(ctx, 'chest', c.id, c.x, c.z, 4)) : findProp(ctx, 'chest', c.id, c.x, c.z, 4);
        chests.push({ c, prop, id: c.id, x: c.x, z: c.z, pedestal: isPed });
      }
      gathers.length = 0;
      for (const g of spawnList(ctx, 'gather')) {
        const kind = g.kind === 'tree' ? 'appletree' : g.kind === 'bush' ? 'bush' : null;
        const prop = kind ? findProp(ctx, kind, g.id, g.x, g.z, 4) : null;
        gathers.push({ g, prop, id: g.id, left: g.count || 1, items: [], depleted: false });
      }
    },
    pedestalChest() { return chests.find((c) => c.pedestal) || null; },
    /** is this world item the pedestal's sword? (inventory adds it quietly; we celebrate here) */
    isPedestalUid(uid) { return !!ped.inst && ped.inst.uid === uid; },
    openChest(entry, silent = false) {
      const Q = G.quest;
      if (Q.chests.includes(entry.id)) return;
      if (entry.pedestal) dropPedestalSword(entry, false);
      Q.chests.push(entry.id);
      if (entry.pedestal) { setPropState(entry.prop, entry.prop && entry.prop.kind === 'pedestal' ? 'taken' : 'open', true); if (entry.prop) Q.props[entry.prop.id] = { taken: true }; }
      else setPropState(entry.prop, 'open', true);
      const loot = (entry.c.loot || []).map((l) => ({ itemId: l.itemId, count: l.count || 1 }));
      if (silent) { for (const l of loot) G.inventory.add(l.itemId, l.count, { silent: true }); return; }
      const names = [];
      for (const l of loot) {
        const got = G.inventory.add(l.itemId, l.count);
        const d = G.inventory.def(l.itemId);
        if (d) names.push(`${d.name}${l.count > 1 ? ' ×' + l.count : ''}${got < l.count ? '（いっぱい）' : ''}`);
      }
      anchorOf(entry.prop, 'loot', _a);
      if (!entry.prop) _a.set(entry.x, heightAt(ctx, entry.x, entry.z) + 0.6, entry.z);
      fx(ctx, 'shard', _a, { count: 24, color: 0xffd76a, speed: 2.5 });
      emit(ctx, 'chest:open', { id: entry.id, loot });
      if (!entry.pedestal) toast(ctx, '宝箱をあけた', names.join('・'), 'item', 4000);
      else celebrateSword();
      G.requestSave && G.requestSave();
    },
    onDawn() {
      for (const g of gathers) { g.left = g.g.count || 1; g.depleted = false; setPropState(g.prop, 'fruit', g.left); }
    },
    serializeGather() {
      const o = {};
      for (const g of gathers) if (g.left !== (g.g.count || 1)) o[g.id] = g.left;
      return o;
    },
    restoreGather(o) {
      if (!o) return;
      for (const g of gathers) if (o[g.id] != null) { g.left = o[g.id]; setPropState(g.prop, 'fruit', g.left); }
    },
    update,
  };

  function update(dt) {
    if (dt <= 0) return;
    playerPos(ctx, _p);
    // shards: pop, fall, then fly to the player (1 m pickup, 2.5 m pull)
    let n = 0;
    for (const s of shards) {
      if (!s.active) continue;
      s.t += dt;
      const dx = _p.x - s.pos.x, dy = (_p.y + 0.9) - s.pos.y, dz = _p.z - s.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (s.t > 0.5 && d < 2.6) {
        const k = Math.min(1, dt * 9);
        s.pos.x += dx * k; s.pos.y += dy * k; s.pos.z += dz * k;
        if (d < 0.7) { s.active = false; pendingShard++; continue; }
      } else {
        s.vel.y -= 9.8 * dt;
        s.pos.addScaledVector(s.vel, dt);
        const gy = s.ground + 0.25;
        if (s.pos.y < gy) { s.pos.y = gy; s.vel.set(0, 0, 0); }
        if (s.t > 90) { s.active = false; continue; }
      }
      s.spin += dt * 3;
      _e.set(0, s.spin, 0);
      _q.setFromEuler(_e);
      _m.compose(_a.copy(s.pos).setY(s.pos.y + Math.sin(s.t * 3 + s.spin) * 0.04), _q, _s);
      shardMesh.setMatrixAt(n++, _m);
    }
    shardMesh.count = n;
    if (n) shardMesh.instanceMatrix.needsUpdate = true;
    if (pendingShard > 0) {
      shardToastT -= dt;
      if (shardToastT <= 0) {
        G.inventory.add('shard', pendingShard);
        fx(ctx, 'shard', _a.set(_p.x, _p.y + 1.1, _p.z), { count: 4 + pendingShard, color: 0xffd76a, speed: 1 });
        pendingShard = 0; shardToastT = 0.25;
      }
    }

    // chests open when you step up to them (and whatever hid them is gone)
    chestT -= dt;
    if (chestT <= 0) {
      chestT = 0.25;
      for (const c of chests) {
        if (G.quest.chests.includes(c.id)) continue;
        const d = Math.hypot(_p.x - c.x, _p.z - c.z);
        if (c.pedestal) { pedestalTick(c, d); continue; }
        if (d > 1.5) continue;
        // a chest up on a ledge (the arch crest) opens only from its own height, not from underneath
        if (Number.isFinite(c.c.y) && Math.abs(_p.y - c.c.y) >= 2) continue;
        if (c.c.hiddenBy) {
          const h = ctx.world && ctx.world.props && ctx.world.props.byId && ctx.world.props.byId[c.c.hiddenBy];
          if (h && h.state && !(h.state.broken || h.state.burnt || h.state.melted)) continue;
        }
        P.openChest(c);
      }
    }

    // gathering: real world items appear near the player; without items they are collected by touch
    gatherT -= dt;
    if (gatherT <= 0) {
      gatherT = 0.5;
      const items = ctx.items;
      const canSpawn = items && typeof items.spawn === 'function';
      for (const g of gathers) {
        const d = Math.hypot(_p.x - g.g.x, _p.z - g.g.z);
        if (g.left <= 0) continue;
        if (canSpawn) {
          if (d < 28 && g.items.length === 0) {
            for (let i = 0; i < g.left; i++) {
              const pos = new THREE.Vector3();
              if (g.prop && g.prop.anchors && g.prop.anchors['fruit' + i]) pos.copy(g.prop.anchors['fruit' + i]);
              else {
                const a = (i / Math.max(1, g.left)) * Math.PI * 2;
                pos.set(g.g.x + Math.cos(a) * 0.5, (g.g.y ?? heightAt(ctx, g.g.x, g.g.z)) + (g.g.kind === 'tree' ? 1.8 : 0.15), g.g.z + Math.sin(a) * 0.5);
              }
              try {
                const inst = items.spawn(g.g.itemId, { pos, vel: new THREE.Vector3(), state: { hanging: g.g.kind === 'tree' } });
                if (inst) { inst.sleeping = true; g.items.push(inst); spawned.set(inst.uid, g); }
              } catch (e) { /* items stub */ }
            }
          } else if (d > 45 && g.items.length) {
            for (const inst of g.items) {
              spawned.delete(inst.uid);
              if (!inst.heldBy) { try { items.despawn(inst); } catch (e) { /* ignore */ } }
            }
            g.items.length = 0;
          }
        } else if (d < 1.6) {
          const got = G.inventory.add(g.g.itemId, g.left);
          if (got > 0) {
            g.left -= got;
            setPropState(g.prop, 'fruit', g.left);
            const def = G.inventory.def(g.g.itemId);
            if (def) toast(ctx, `${def.name} ×${got}`, def.en || '', 'item', 2000);
          }
        }
      }
    }
  }

  // ── the pedestal sword ──
  function pedestalTick(c, d) {
    // already carried one (debug, a skipped stage): the pedestal is simply empty
    if (G.inventory.has('sword')) { if (!ped.inst || !ped.inst.heldBy) P.openChest(c, true); return; }
    if (itemsReal() && !ped.failed) {
      if (!ped.inst && d < PED_SPAWN) spawnPedestalSword(c);
      else if (ped.inst && !ped.inst.heldBy && d > PED_DROP) dropPedestalSword(c, true);
      return;
    }
    // hand-less / stub items: walk up to it
    if (d <= 1.5) P.openChest(c);
  }
  /** the prop's own sword mesh (the tall one in the pedestal group), or null */
  function propSword(prop) {
    const kids = prop && prop.object3D && prop.object3D.children;
    if (!kids) return null;
    for (const k of kids) {
      if (!k.isMesh || !k.geometry) continue;
      if (!k.geometry.boundingBox) k.geometry.computeBoundingBox();
      if (k.geometry.boundingBox.max.y > 1.2) return k;
    }
    return null;
  }
  /** show / hide only the prop's sword mesh: no shard burst, the pedestal glow stays (the real sword stands there) */
  function showPropSword(prop, v) {
    const sw = propSword(prop);
    if (sw) sw.visible = v;
    else setPropState(prop, 'taken', !v);
  }
  /** the real sword standing point-down exactly where the prop sword stands (guards aligned) */
  function pedestalPose(c, outPos, outQuat) {
    const prop = c.prop, sw = propSword(prop);
    if (sw) {
      sw.updateWorldMatrix(true, false);
      sw.matrixWorld.decompose(_p, _q2, _a);
      outQuat.copy(_q2).multiply(PED_PERM);
      outPos.set(0, PED_GRIP_Y, 0).applyMatrix4(sw.matrixWorld);
      return;
    }
    // no prop mesh (stub world): the same pose from the prop's data (prop yaw is in degrees, rotation.y = −yaw)
    const yawR = -((prop && Number.isFinite(prop.yaw) ? prop.yaw : 0) * Math.PI / 180);
    _q2.setFromAxisAngle(_yAxis, yawR).multiply(_q3.setFromAxisAngle(_zAxis, PED_TILT));
    const by = prop && Number.isFinite(prop.y) ? prop.y : heightAt(ctx, c.x, c.z);
    outPos.set(0, PED_GRIP_Y, 0).applyQuaternion(_q2).add(_p.set(prop ? prop.x : c.x, by, prop ? prop.z : c.z));
    outQuat.copy(_q2).multiply(PED_PERM);
  }
  function spawnPedestalSword(c) {
    let inst = null;
    try {
      pedestalPose(c, _a, _q);
      // a given quat = a "placed" item: it keeps this exact pose until a hand takes it
      inst = ctx.items.spawn('sword', { pos: _a.clone(), quat: _q.clone(), owned: true });
    } catch (e) { inst = null; }
    if (!inst) { ped.failed = true; return; }
    ped.inst = inst;
    showPropSword(c.prop, false);               // the real one takes its place, same pose: no visible change
  }
  /** take the real sword away again (you walked off) and show the prop sword */
  function dropPedestalSword(c, restoreProp) {
    const inst = ped.inst;
    if (!inst) return;
    ped.inst = null;
    if (!inst.heldBy) { try { ctx.items.despawn(inst); } catch (e) { /* ignore */ } }
    if (restoreProp) showPropSword(c.prop, true);
  }
  function celebrateSword() {
    const c = P.pedestalChest();
    if (c) { anchorOf(c.prop, 'item', _a); if (!c.prop) _a.set(c.x, heightAt(ctx, c.x, c.z) + 1.4, c.z); }
    else playerPos(ctx, _a).y += 1.3;
    fx(ctx, 'shard', _a, { count: 30, color: 0xffd76a, speed: 2.6 });
    flash(ctx, _a, { color: 0x7fe9ff, size: 3.5, life: 0.5 });
    emit(ctx, 'ui:title', { text: '旅人の剣を手に入れた', sub: 'WAYFARER BLADE' });
    toast(ctx, '振って斬る・強く振ると強打', 'SWING TO SLASH · SWING HARD FOR A STRONG HIT', 'item', 5500);
  }
  ctx.events?.on?.('item:grab', (e) => {
    if (!e || !ped.inst || e.uid !== ped.inst.uid) return;
    const c = P.pedestalChest();
    ped.inst = null;
    if (!c) return;
    const Q = G.quest;
    if (!Q.chests.includes(c.id)) Q.chests.push(c.id);
    if (c.prop) Q.props[c.prop.id] = { taken: true };
    setPropState(c.prop, 'taken', true);        // pulled out: the pedestal glow goes out with a burst of shards
    emit(ctx, 'chest:open', { id: c.id, loot: [{ itemId: 'sword', count: 1 }] });
    celebrateSword();
    G.requestSave && G.requestSave(true);
  });

  // a hand took a gathered item: one fewer on the tree
  ctx.events?.on?.('item:grab', (e) => {
    if (!e || e.from !== 'world') return;
    const g = spawned.get(e.uid);
    if (!g) return;
    spawned.delete(e.uid);
    const i = g.items.findIndex((x) => x.uid === e.uid);
    if (i >= 0) g.items.splice(i, 1);
    g.left = Math.max(0, g.left - 1);
    setPropState(g.prop, 'fruit', g.left);
  });
  ctx.events?.on?.('time:phase', (p) => { if (p && p.phase === 'dawn') P.onDawn(); });

  return P;
}
