// js/game/pickups.js — light shards (auto-collect), enemy drops, chests, gathering points (OPUS-B)
import * as THREE from 'three';
import { heightAt, fx, emit, toast, spawnList, findProp, setPropState, anchorOf, playerPos } from './util.js';

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
    openChest(entry, silent = false) {
      const Q = G.quest;
      if (Q.chests.includes(entry.id)) return;
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
        if (d > 1.5) continue;
        // the pedestal sword waits until the camp fire is lit (§8.1 stage 1)
        if (c.pedestal) { const camp = G.checkpoints && G.checkpoints.byId('camp_meadow'); if (camp && !camp.lit) continue; }
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
