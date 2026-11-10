// js/items/index.js — createItems(ctx) (§10.9), OPUS-A.
// Owns every ItemInstance: in a hand (a real mesh under the hand's grip group) or in the world (drawn by one
// InstancedMesh per item kind → few draw calls however many apples lie around). Behaviours live in the
// sibling files: melee, shield, bow, projectiles (thrown / flying / falling items, wind blades), bomb, torch,
// food, flask, windfan, waybell.
import * as THREE from 'three';
import { ITEM_DEFS } from './defs.js';
import { createModels } from './models.js';
import { createMelee } from './melee.js';
import { createShield } from './shield.js';
import { createBow } from './bow.js';
import { createProjectiles } from './projectiles.js';
import { createBomb } from './bomb.js';
import { createTorch } from './torch.js';
import { createFood } from './food.js';
import { createFlask } from './flask.js';
import { createWindfan } from './windfan.js';
import { createWaybell } from './waybell.js';
import { PROJECTILE_MAX } from '../core/config.js';
const HANDS = ['left', 'right'];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const FLIP_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const POOL_DIST2 = 70 * 70;

export async function createItems(ctx) {
  const defs = ITEM_DEFS;
  const models = createModels(ctx);
  const input = ctx.input;
  const scene = ctx.scene;
  let uid = 1;
  const all = [];
  const world = [];
  const held = { left: null, right: null };
  const pulling = { left: null, right: null };
  const gearState = {};                     // remembered state of gear across stow / draw (flask gulps …)

  // ── world rendering: one InstancedMesh per item kind ──
  const pools = new Map();
  const poolList = [];
  function pool(id) {
    let p = pools.get(id);
    if (!p) {
      p = { mesh: null, cap: 0, n: 0 };
      pools.set(id, p);
      poolList.push(p);
    }
    return p;
  }
  function ensureCap(id, p, need) {
    if (p.cap >= need) return;
    const cap = Math.max(8, 1 << Math.ceil(Math.log2(need)));
    if (p.mesh) { p.mesh.removeFromParent(); p.mesh.dispose(); }
    p.mesh = new THREE.InstancedMesh(models.geometry(id), models.material(), cap);
    p.mesh.name = 'items-' + id;
    p.mesh.frustumCulled = false;
    p.mesh.count = 0;
    scene.add(p.mesh);
    p.cap = cap;
  }

  // ── instances ──
  function makeInstance(id, opts = {}) {
    const def = defs[id];
    if (!def) return null;
    const object3D = new THREE.Group();
    object3D.name = 'item:' + id;
    const mesh = models.makeMesh(id);
    object3D.add(mesh);
    const inst = {
      uid: uid++, id, def, object3D, mesh,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), angVel: new THREE.Vector3(),
      heldBy: null,
      state: { lit: false, litTime: 0, fuse: -1, draw: 0, gulps: def.flask ? def.flask.gulps : 3, cook: 0, bites: 0, ...(opts.state || {}) },
      owned: opts.owned ?? !!def.owned,
      sleeping: false,
      count: Math.max(1, opts.count | 0 || 1),
      radius: def.size || 0.05,
      flying: false, thrown: null, stuck: false, droppedAt: 0, pulled: null,
      holdPos: new THREE.Vector3(), holdQuat: new THREE.Quaternion(),
      fx: {},
      bornAt: ctx.clock.time,
    };
    all.push(inst);
    return inst;
  }
  function setModel(inst, id) {
    // cooking: an apple becomes a baked apple in place
    const def = defs[id];
    if (!def) return;
    inst.id = id; inst.def = def;
    inst.mesh.geometry = models.geometry(id);
    inst.mesh.name = 'item-' + id;
    inst.object3D.name = 'item:' + id;
  }

  function holdOffset(inst, hand) {
    const s = hand === 'left' ? -1 : 1;
    inst.holdPos.set(0, 0, 0);
    inst.holdQuat.identity();
    const d = inst.def;
    if (d.id === 'shield' && hand === 'left') inst.holdQuat.copy(FLIP_Z);
    else if (d.cat === 'food') inst.holdPos.set(-s * 0.04, -0.035, 0);
    else if (d.id === 'bomb' || d.id === 'rock' || d.cat === 'material' || d.cat === 'key') inst.holdPos.set(-s * 0.035, -0.03, 0);
    inst.object3D.position.copy(inst.holdPos);
    inst.object3D.quaternion.copy(inst.holdQuat);
  }

  function attach(inst, hand, from, slot = null) {
    if (held[hand] && held[hand] !== inst) return false;
    const wi = world.indexOf(inst);
    if (wi >= 0) world.splice(wi, 1);
    inst.heldBy = hand;
    inst.wasHeld = true;
    if (inst.state.hanging) inst.state.hanging = false;
    inst.flying = false; inst.thrown = null; inst.stuck = false; inst.sleeping = false; inst.pulled = null;
    inst.vel.set(0, 0, 0); inst.angVel.set(0, 0, 0);
    held[hand] = inst;
    input.hands[hand].object3D.add(inst.object3D);
    holdOffset(inst, hand);
    inst.mesh.visible = true;
    if (from === 'world' && inst.def.stack === 1) inst.owned = true;
    updateHeldPose(inst);
    ctx.events.emit('item:grab', { uid: inst.uid, itemId: inst.id, hand, from, slot });
    return true;
  }

  function detachToWorld(inst) {
    const hand = inst.heldBy;
    if (hand && held[hand] === inst) held[hand] = null;
    inst.heldBy = null;
    updateHeldPose(inst);                 // last pose
    scene.add(inst.object3D);
    inst.object3D.position.copy(inst.pos);
    inst.object3D.quaternion.copy(inst.quat);
    inst.mesh.visible = false;
    if (!world.includes(inst)) world.push(inst);
  }

  function updateHeldPose(inst) {
    const h = input.hands[inst.heldBy];
    if (!h) return;
    inst.pos.copy(inst.holdPos).applyQuaternion(h.quat).add(h.pos);
    inst.quat.copy(h.quat).multiply(inst.holdQuat);
  }

  // local point of an item → world
  function toWorld(inst, x, y, z, out) {
    return out.set(x, y, z).applyQuaternion(inst.quat).add(inst.pos);
  }

  const I = {
    ctx, defs, models, held, pulling, world, all, gearState, toWorld,
    get inv() { return ctx.game && !ctx.game.isStub ? ctx.game.inventory : null; },
    damageMul() { const m = ctx.game?.vitals?.damageMul; return Number.isFinite(m) && m > 0 ? m : 1; },
    otherHand: (h) => (h === 'left' ? 'right' : 'left'),
    flyingCount() { let n = 0; for (const i of world) if (i.flying || i.thrown) n++; return n; },
    attach, detachToWorld, setModel, makeInstance,
    despawn,
    emitHit(target, hit, res) {
      const r = res || { applied: 0, killed: false };
      ctx.events.emit('hit', {
        ...hit, point: hit.point, dir: hit.dir,
        targetId: target.id, targetKind: target.kind, applied: r.applied ?? 0, killed: !!r.killed, blocked: !!r.blocked,
      });
      return r;
    },
    /** call a target's onHit safely */
    hitTarget(target, hit) {
      let res = null;
      try { res = target.onHit ? target.onHit(hit) : null; } catch (e) { ctx.report?.(`target ${target.id} onHit: ${e.message}`); }
      return I.emitHit(target, hit, res);
    },
    fx(kind, pos, opts) { try { ctx.world?.fx?.emit?.(kind, pos, opts); } catch { /* stub */ } },
    flash(pos, opts) { try { ctx.world?.fx?.flash?.(pos, opts); } catch { /* stub */ } },
  };

  function despawn(inst) {
    if (!inst) return;
    if (inst.heldBy && held[inst.heldBy] === inst) held[inst.heldBy] = null;
    for (const h of HANDS) if (pulling[h] === inst) pulling[h] = null;
    inst.heldBy = null;
    const wi = world.indexOf(inst);
    if (wi >= 0) world.splice(wi, 1);
    const ai = all.indexOf(inst);
    if (ai >= 0) all.splice(ai, 1);
    inst.object3D.removeFromParent();
    if (inst.fireZone) { ctx.zones.remove(inst.fireZone); inst.fireZone = null; }
    inst.dead = true;
  }

  // ── subsystems ──
  const proj = createProjectiles(ctx, I);
  I.proj = proj;
  const melee = createMelee(ctx, I);
  const shield = createShield(ctx, I, melee);
  const bow = createBow(ctx, I);
  const bomb = createBomb(ctx, I);
  const torch = createTorch(ctx, I);
  const food = createFood(ctx, I);
  const flask = createFlask(ctx, I);
  const fan = createWindfan(ctx, I);
  const bell = createWaybell(ctx, I);
  I.torch = torch; I.bomb = bomb; I.melee = melee;

  function collect(inst) {
    // a counted bundle or a material: straight into the bag
    const inv = I.inv;
    const n = inst.count || 1;
    if (inv) inv.add(inst.id, n);
    else ctx.events.emit('item:pickup', { itemId: inst.id, count: n });
    I.fx('shard', inst.pos, { count: 6 });
    despawn(inst);
  }

  const items = {
    defs,
    handlesXButton: true,          // the X button rings the waybell here (ui checks this flag)
    held,
    pulling,
    get worldItems() { return world; },
    spawn(itemId, { pos, vel, state, owned, count, quat } = {}) {
      const inst = makeInstance(itemId, { state, owned, count });
      if (!inst) return null;
      if (pos) inst.pos.copy(pos); else inst.pos.copy(ctx.player?.pos || ctx.rig.position).y += 1;
      if (quat) inst.quat.copy(quat);
      else inst.quat.setFromAxisAngle(_v.set(0, 1, 0), Math.random() * Math.PI * 2);
      if (vel) inst.vel.copy(vel);
      inst.sleeping = !vel || !!inst.state.hanging;      // fruit hanging on a tree stays put until grabbed
      inst.object3D.position.copy(inst.pos);
      inst.object3D.quaternion.copy(inst.quat);
      inst.mesh.visible = false;
      scene.add(inst.object3D);
      world.push(inst);
      inst.droppedAt = ctx.clock.time;
      if (!vel) proj.settle(inst);
      return inst;
    },
    despawn,
    equip(itemId, hand = 'right') {
      if (!defs[itemId] || (hand !== 'left' && hand !== 'right')) return null;
      const cur = held[hand];
      if (cur && cur.id === itemId) return cur;
      if (cur) items.stow(hand, null);
      if (held[hand]) despawn(held[hand]);
      // the same gear can't be in two places
      const other = held[I.otherHand(hand)];
      if (other && other.id === itemId && defs[itemId].stack === 1) items.stow(I.otherHand(hand), null);
      return items.createInHand(itemId, hand, 'bag', null);
    },
    blockTest(shape, fromPos) { return shield.blockTest(shape, fromPos); },
    makeModel(itemId) { return models.makeModel(itemId); },

    // ── used by the player (grab.js / desktop.js) ──
    createInHand(itemId, hand, from = 'holster', slot = null) {
      const st = defs[itemId]?.stack === 1 && gearState[itemId] ? { ...gearState[itemId] } : undefined;
      const inst = makeInstance(itemId, { state: st, owned: defs[itemId]?.stack === 1 });
      if (!inst) return null;
      scene.add(inst.object3D);
      attach(inst, hand, from, slot);
      return inst;
    },
    grabWorld(inst, hand) {
      if (!inst || inst.heldBy || held[hand]) return false;
      if (inst.count > 1 || inst.def.autoCollect) { collect(inst); return true; }
      return attach(inst, hand, 'world', null);
    },
    isHeld: (id) => held.left?.id === id || held.right?.id === id,
    /** nearest world item whose grab segment is within maxDist of p */
    nearestGrabbable(p, maxDist = 0.25, loose = false) {
      let best = null, bestD = Infinity;
      for (const inst of world) {
        if (inst.pulled || (inst.flying && inst.vel.lengthSq() > 4)) continue;
        const g = inst.def.grab;
        let d;
        if (g && g.length === 2) {
          toWorld(inst, g[0][0], g[0][1], g[0][2], _a);
          toWorld(inst, g[1][0], g[1][1], g[1][2], _b);
          const L = _b.distanceToSquared(_a);
          const t = L > 1e-9 ? Math.max(0, Math.min(1, _v.copy(p).sub(_a).dot(_v2.copy(_b).sub(_a)) / L)) : 0;
          _v.copy(_a).lerp(_b, t);
          d = _v.distanceTo(p) - 0.03;
        } else d = inst.pos.distanceTo(p) - inst.radius;
        if (loose) d = Math.hypot(inst.pos.x - p.x, inst.pos.z - p.z);
        if (d <= maxDist && d < bestD) { best = inst; bestD = d; }
      }
      return best;
    },
    rayGrabbable(o, dir, maxDist = 2.5, coneDeg = 14) {
      let best = null, bestA = coneDeg * Math.PI / 180;
      for (const inst of world) {
        if (inst.pulled || inst.flying) continue;
        _v.copy(inst.pos).sub(o);
        const L = _v.length();
        if (L > maxDist + inst.radius || L < 1e-3) continue;
        const a = Math.acos(Math.max(-1, Math.min(1, _v.dot(dir) / L)));
        if (a < bestA) { best = inst; bestA = a; }
      }
      return best;
    },
    pull(inst, hand) {
      if (!inst || held[hand]) return false;
      inst.pulled = { hand, t: 0, from: inst.pos.clone() };
      inst.sleeping = false;
      pulling[hand] = inst;
      return true;
    },
    cancelPull(hand) {
      const inst = pulling[hand];
      if (inst) { inst.pulled = null; inst.vel.set(0, 0, 0); inst.sleeping = false; }
      pulling[hand] = null;
    },
    onRelease(hand) { return bow.onRelease(hand); },
    /** let go: into the world with a velocity (a throw when fast) */
    drop(hand, vel) {
      const inst = held[hand];
      if (!inst) return null;
      const h = input.hands[hand];
      detachToWorld(inst);
      inst.vel.copy(vel);
      inst.angVel.copy(h.angVel).multiplyScalar(0.8);
      inst.sleeping = false;
      inst.droppedAt = ctx.clock.time;
      inst.dropPos = inst.dropPos || new THREE.Vector3();
      inst.dropPos.copy(inst.pos);
      const speed = vel.length();
      ctx.events.emit('item:release', { uid: inst.uid, itemId: inst.id, hand, to: 'world', slot: null, speed });
      if (speed > 2.5) {
        if (I.flyingCount() >= PROJECTILE_MAX) proj.retireOldest();
        inst.thrown = { hand, t: ctx.clock.time, hits: new Set(), speed };
        ctx.events.emit('item:throw', { uid: inst.uid, itemId: inst.id, hand, speed });
      }
      return inst;
    },
    /** put the held item away: 'quiver' (arrows), a holster slot, or null (the bag) */
    stow(hand, slot) {
      const inst = held[hand];
      if (!inst) return false;
      const inv = I.inv;
      let ok = true;
      if (inv) {
        try { ok = inv.stow(slot || null, inst.id, { ...inst.state }) !== false; } catch (e) { ok = false; ctx.report?.(`inventory.stow: ${e.message}`); }
      }
      if (!ok) return false;
      if (inst.def.stack === 1) gearState[inst.id] = { ...inst.state, lit: false, litTime: 0, fuse: -1, draw: 0 };
      if (inst.state.lit) { inst.state.lit = false; ctx.events.emit('item:extinguish', { uid: inst.uid, itemId: inst.id }); }
      const to = slot === 'quiver' ? 'holster' : !slot ? 'bag' : !inv ? 'holster' : inv.slots?.[slot] === inst.id ? 'holster' : 'bag';
      despawn(inst);
      ctx.events.emit('item:release', { uid: inst.uid, itemId: inst.id, hand, to, slot: slot || null, speed: 0 });
      return true;
    },
    /** tip speed (m/s, body-relative, smoothed) of what a hand swings — used by the arm-swing detector */
    tipSpeed(hand) { return melee.tipSpeed(hand); },
    bowInfo(hand) { return bow.info(hand); },
    /** triangles / draw calls this module currently adds (approximate, §7.6 budget) */
    budget() {
      let calls = 0, tris = 0;
      for (const [id, p] of pools) if (p.mesh && p.mesh.count > 0) { calls++; tris += models.trianglesOf(id) * p.mesh.count; }
      for (const h of HANDS) if (held[h]) { calls++; tris += models.trianglesOf(held[h].id); }
      const extra = melee.drawCalls() + bow.drawCalls() + torch.drawCalls() + proj.drawCalls() + bomb.drawCalls();
      return { drawCalls: calls + extra + 2 /* hands */, triangles: Math.round(tris + 2 * 220), pools: pools.size };
    },
    start() {},
    update(dt) {
      // real elapsed time (0 when paused): fuses, bites and flight follow the clock even at a low frame rate
      if (dt > 0) dt = Math.max(dt, ctx.clock.real || dt);
      // poses of held things first (everyone reads inst.pos / inst.quat)
      for (const h of HANDS) if (held[h]) updateHeldPose(held[h]);
      if (dt > 0) {
        // pulls (distance grab)
        for (const h of HANDS) {
          const inst = pulling[h];
          if (!inst) continue;
          if (inst.dead || held[h]) { pulling[h] = null; continue; }
          const hd = input.hands[h];
          inst.pulled.t += dt;
          const k = Math.min(1, inst.pulled.t / 0.25);
          const e = k * k * (3 - 2 * k);
          inst.pos.copy(inst.pulled.from).lerp(hd.pos, e);
          inst.pos.y += Math.sin(k * Math.PI) * 0.25;
          if (k >= 1) { pulling[h] = null; items.grabWorld(inst, h); }
        }
        melee.update(dt);
        shield.update(dt);
        bow.update(dt);
        torch.update(dt);
        bomb.update(dt);
        food.update(dt);
        flask.update(dt);
        fan.update(dt);
        bell.update(dt);
        proj.update(dt);
        // auto-collect shards / seeds / pearls; owned gear comes home (8 s or 25 m)
        const pp = ctx.player?.pos;
        const now = ctx.clock.time;
        for (let i = world.length - 1; i >= 0; i--) {
          const inst = world[i];
          if (!inst || inst.pulled) continue;
          if (inst.def.autoCollect && pp) {
            const near = Math.hypot(inst.pos.x - pp.x, inst.pos.z - pp.z) < inst.def.autoCollect && Math.abs(inst.pos.y - (pp.y + 0.8)) < 1.4;
            const touch = input.hands.left.pos.distanceTo(inst.pos) < 0.15 || input.hands.right.pos.distanceTo(inst.pos) < 0.15;
            if (near || touch) { collect(inst); continue; }
          }
          if (inst.owned && inst.wasHeld && inst.def.stack === 1 && pp && !inst.flying) {
            const far = inst.pos.distanceTo(pp) > 25;
            if ((now - inst.droppedAt > 8 && !inst.thrown) || far) {
              const inv = I.inv;
              if (inst.def.stack === 1) gearState[inst.id] = { ...inst.state, lit: false, litTime: 0, fuse: -1 };
              despawn(inst);
              inv?.markIn?.(inst.id);
              ctx.events.emit('item:return', { itemId: inst.id });
            }
          }
        }
      }
      // world rendering
      for (let i = 0; i < poolList.length; i++) poolList[i].n = 0;
      const pp = ctx.player?.pos || ctx.rig.position;
      for (const inst of world) {
        inst.object3D.position.copy(inst.pos);
        inst.object3D.quaternion.copy(inst.quat);
        if (inst.pos.distanceToSquared(pp) > POOL_DIST2) continue;
        const p = pool(inst.id);
        ensureCap(inst.id, p, p.n + 1);
        const sc = inst.state.bites > 0 ? 0.8 : 1;
        _s.set(sc, sc, sc);
        _m.compose(inst.pos, inst.quat, _s);
        p.mesh.setMatrixAt(p.n++, _m);
      }
      for (let i = 0; i < poolList.length; i++) {
        const p = poolList[i];
        if (!p.mesh) continue;
        p.mesh.count = p.n;
        p.mesh.visible = p.n > 0;
        p.mesh.instanceMatrix.needsUpdate = true;
      }
      for (const h of HANDS) {
        const inst = held[h];
        if (inst) inst.mesh.scale.setScalar(inst.state.bites > 0 ? 0.8 : 1);
      }
    },
  };
  I.items = items;
  return items;
}
