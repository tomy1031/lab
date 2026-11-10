// js/game/enemies.js — Nagi creatures: spawning, AI (§5.4), telegraphed attacks and the player's defenses (§5.3) (OPUS-B)
// Budget: ≤ 6 active, each ≤ 3 draw calls; shadows = 1 InstancedMesh, bolts = 1 InstancedMesh, ≤ 3 telegraph meshes visible.
import * as THREE from 'three';
import { ENEMY_DEFS, LINE_HALF, NOTICE_DAY, NOTICE_NIGHT, LEASH, ACTIVE_R, DESPAWN_R, MAX_ACTIVE, MAX_ATTACKERS } from './enemies.data.js';
import { createModelKit, COLORS } from './enemyModels.js';
import { clamp, damp, yawTo, angDiff, heightAt, fx, emit, spawnList, isNight, landmark, setting, DEG } from './util.js';

const MAX_BOLTS = 8, TELE_SLOTS = 3, MAX_SHADOWS = 10;

export function createEnemies(ctx, G) {
  const kit = createModelKit(ctx);
  const root = new THREE.Group();
  root.name = 'game:enemies';
  ctx.scene && ctx.scene.add(root);
  const rng = (ctx.rng && typeof ctx.rng.fork === 'function') ? ctx.rng.fork('enemies') : { next: Math.random, range: (a, b) => a + Math.random() * (b - a) };
  const rnd = () => (typeof rng.next === 'function' ? rng.next() : Math.random());

  const list = [];                // public: [{ id, type, pos, hp, state }] (the enemy objects)
  const groups = [];
  const attackers = new Set();
  let nextId = 1, groupCheckT = 0, frame = 0;
  const pendingBlasts = [];

  // ── scratch (no per-frame allocation) ──
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _pp = new THREE.Vector3(), _head = new THREE.Vector3();
  const _from = new THREE.Vector3(), _dir = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion();
  const _s = new THREE.Vector3(), _res = { x: 0, z: 0 }, _zones = [], _up = new THREE.Vector3(0, 1, 0);

  // ── shared blob shadows (1 draw call) ──
  let shadows = null;
  try {
    const art = ctx.art || (ctx.world && ctx.world.art);
    let sgeo = null, smat = null;
    if (art && typeof art.blobShadow === 'function') {
      const m = art.blobShadow(1);
      sgeo = m.geometry; smat = m.material;
    }
    if (!sgeo) {
      sgeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
      smat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    }
    shadows = new THREE.InstancedMesh(sgeo, smat, MAX_SHADOWS);
    shadows.frustumCulled = false;
    shadows.count = 0;
    shadows.renderOrder = 1;
    root.add(shadows);
  } catch (e) { shadows = null; }

  // ── telegraph meshes (#ff3b5c, the warning color is used ONLY here) ──
  const teleGeo = buildTelegraphGeos();
  const tele = [];
  for (let i = 0; i < TELE_SLOTS; i++) {
    // drawn over grass and slopes: a warning must always be seen (§5.2)
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.danger, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide, fog: false });
    const band = new THREE.Mesh(teleGeo.band(), mat);
    const fan = new THREE.Mesh(teleGeo.fan, mat);
    const ring = new THREE.Mesh(teleGeo.ring, mat);
    for (const m of [band, fan, ring]) { m.visible = false; m.frustumCulled = false; m.renderOrder = 50; root.add(m); }
    tele.push({ band, fan, ring, mat, owner: null, t: 0, dur: 1, kind: null });
  }

  // ── enemy bolts (wisp light balls) ──
  const boltMat = new THREE.MeshBasicMaterial({ color: COLORS.danger, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const boltMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), boltMat, MAX_BOLTS);
  boltMesh.frustumCulled = false;
  boltMesh.count = 0;
  root.add(boltMesh);
  const bolts = [];
  for (let i = 0; i < MAX_BOLTS; i++) {
    const b = { i, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.2, owner: null, reflected: false,
      life: 0, dodged: false, charging: false, scale: 0, target: null, shape: { kind: 'sphere', center: null, radius: 0.2 } };
    b.shape.center = b.pos;
    b.sphere = { c: b.pos, r: 0.32, part: 'body' };
    bolts.push(b);
  }

  // ── public API object ──
  const api = {
    list, groups, attackers, bolts, kit, root,
    get count() { let n = 0; for (const e of list) if (e.state !== 'dead') n++; return n; },
    spawn(type, x, z, opts = {}) { return spawnEnemy(type, x, z, opts); },
    clear() { for (const e of list.slice()) removeEnemy(e); for (const g of groups) { g.active = false; g.members.length = 0; } clearBolts(); },
    resetNear() { resetAll(); },
    inCombat() { for (const e of list) if (e.state === 'chase' || e.state === 'windup' || e.state === 'attack' || e.state === 'recover' || e.state === 'notice') return true; return false; },
    nearestThreat(x, z, maxD = 10) {
      let best = null, bd = maxD;
      for (const e of list) {
        if (e.state === 'dead' || e.state === 'idle' || e.state === 'wander' || e.state === 'sleep' || e.state === 'return') continue;
        const d = Math.hypot(e.pos.x - x, e.pos.z - z);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    resolveAttack,      // used by boss / shrines
    remove: (e) => removeEnemy(e),
    damage: (e, n, by, hit) => damageEnemy(e, n, by, hit),
    stagger: (e, sec) => stagger(e, sec),
    hitTestPlayer,
    telegraphShow, telegraphHide,
    spawnBolt,
    update,
    loadGroups,
    onDawn() { for (const g of groups) if (g.cleared && !g.forever) g.cleared = false; },
    killedForever: {},  // groupId → true (saved in quest.flags)
  };

  // ── groups from the world layout ──
  function loadGroups() {
    groups.length = 0;
    for (const sp of spawnList(ctx, 'enemies')) {
      if (!sp || !ENEMY_DEFS[sp.type]) continue;
      if (sp.type === 'stillheart') continue;   // boss.js owns the heart
      const def = ENEMY_DEFS[sp.type];
      const forever = !!(sp.boss || def.miniboss || def.boss);
      groups.push({ sp, id: sp.id ?? `g${groups.length}`, active: false, members: [], cleared: !!api.killedForever[sp.id], forever });
    }
  }

  function aliveCount() { let n = 0; for (const e of list) if (e.state !== 'dead' && !e.ctrl) n++; return n; }

  function groupsTick(px, pz) {
    const night = isNight(ctx);
    const start = landmark(ctx, 'start');
    const stage = G.quest ? G.quest.stage : 9;
    for (const g of groups) {
      const sp = g.sp;
      const d = Math.hypot(sp.x - px, sp.z - pz);
      if (g.active) {
        const allDead = g.members.length > 0 && g.members.every((e) => e.state === 'dead');
        if (allDead) {
          g.active = false; g.members.length = 0; g.cleared = true;
          if (g.forever) api.killedForever[g.id] = true;
          continue;
        }
        const busy = g.members.some((e) => e.state === 'chase' || e.state === 'windup' || e.state === 'attack');
        if (d > DESPAWN_R || (sp.night && !night && !busy && d > 30)) {
          for (const e of g.members) if (e.state !== 'dead') removeEnemy(e);
          g.members.length = 0; g.active = false;
        }
        continue;
      }
      if (g.cleared || d > ACTIVE_R) continue;
      if (sp.night && !night) continue;
      if (stage >= 6 && !sp.night) continue;      // after the ending, the Nagi only walk at night (§8.1)
      // the warm-up walk from the stone stage to the camp has no enemies (§2.6)
      if (stage <= 1 && start && Math.hypot(sp.x - start.x, sp.z - start.z) < 140) continue;
      const room = MAX_ACTIVE - aliveCount();
      if (room <= 0) continue;
      const n = Math.min(room, Math.max(1, sp.count || 1));
      g.active = true;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = (sp.radius || 4) * Math.sqrt(rnd()) * 0.8;
        const drops = i === 0 && G.quest && G.quest.extraDropsFor ? G.quest.extraDropsFor(sp) : null;
        const e = spawnEnemy(sp.type, sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r, { group: g, home: sp, drops });
        if (e) g.members.push(e);
      }
    }
  }

  // ── creating an enemy ──
  function spawnEnemy(type, x, z, opts = {}) {
    const def = ENEMY_DEFS[type];
    if (!def) return null;
    if (!opts.force && !opts.ctrl && aliveCount() >= MAX_ACTIVE) {
      // keep the Quest 2 budget: retire the farthest idle one
      let far = null, fd = -1;
      for (const o of list) {
        if (o.state === 'dead' || o.ctrl) continue;
        const d = Math.hypot(o.pos.x - x, o.pos.z - z);
        if (d > fd) { fd = d; far = o; }
      }
      if (far) removeEnemy(far);
    }
    const model = opts.ctrl && opts.model ? opts.model : kit.build(type);
    const id = `${type}-${nextId++}`;
    const y = heightAt(ctx, x, z);
    const e = {
      id, type, def, model, ctrl: opts.ctrl || null,
      pos: new THREE.Vector3(x, y, z), center: new THREE.Vector3(x, y + def.center, z),
      yaw: opts.yaw ?? rnd() * Math.PI * 2, hp: opts.hp ?? def.hp, maxHp: opts.hp ?? def.hp,
      state: 'idle', t: 0, home: { x: opts.home ? opts.home.x : x, z: opts.home ? opts.home.z : z, r: (opts.home && opts.home.radius) || 6 },
      group: opts.group || null, extraDrops: opts.drops || null, tag: opts.tag || null, noDrops: !!opts.noDrops,
      atk: null, atkCd: 0.6 + rnd() * 0.8, token: false, teleSlot: null,
      burnT: 0, burnTick: 0, fireZone: null, firePos: new THREE.Vector3(), meltT: 0, staggerT: 0, flipT: 0, hurtT: 0,
      burrowed: !!def.burrows, rise: def.burrows ? 0 : 1, speedNow: 0, side: rnd() < 0.5 ? -1 : 1, wanderT: 0, wx: x, wz: z,
      stuckT: 0, lastX: x, lastZ: z, leap: null, charge: null, blastFrame: -10, dyingT: 0, vel: new THREE.Vector3(),
      aimX: 0, aimZ: 0, alerted: false, boltIdx: -1, anim: 0,
      shapeHigh: { kind: 'high', y: 0 },
      shapeLine: { kind: 'line', x0: 0, z0: 0, x1: 0, z1: 0, halfWidth: LINE_HALF },
      shapeSphere: { kind: 'sphere', center: new THREE.Vector3(), radius: 0.2 },
      spheres: [],
    };
    e.state = opts.state || 'idle';
    if (opts.spheres) e.spheres = opts.spheres; else buildSpheres(e);
    if (!e.ctrl) { root.add(model.root); placeModel(e, 0); }
    e.target = opts.noTarget ? null : addTarget(e);
    list.push(e);
    emit(ctx, 'enemy:spawn', { id, type, pos: e.pos });
    return e;
  }

  function buildSpheres(e) {
    const S = (r, part, ox = 0, oy = 0, oz = 0) => ({ c: new THREE.Vector3(), r, part, ox, oy, oz });
    switch (e.type) {
      case 'thornling': e.spheres = [S(0.32, 'body', 0, 0.24, 0)]; break;
      case 'husk': e.spheres = [S(0.42, 'body', 0, 0.75, 0), S(0.34, 'body', 0, 1.45, 0), S(0.17, 'weak', 0, 1.12, -0.3), S(0.22, 'body', 0, 1.78, 0)]; break;
      case 'wisp': e.spheres = [S(0.38, 'body', 0, 0, 0)]; break;
      case 'lurker': e.spheres = [S(0.75, 'body', 0, 0.5, 0), S(0.45, 'body', 0, 0.45, -0.85), S(0.4, 'weak', 0, 0.2, 0)]; break;
      case 'rimeguard': e.spheres = [S(0.95, 'armor', 0, 1.95, 0), S(0.5, 'armor', 0, 0.7, 0), S(0.32, 'armor', 0, 2.8, 0), S(0.36, 'weak', 0, 2.05, 0.78)]; break;
      default: e.spheres = [S(e.def.radius || 0.5, 'body', 0, e.def.center || 0.5, 0)];
    }
  }

  function addTarget(e) {
    const t = ctx.targets;
    if (!t || typeof t.add !== 'function') return null;
    try {
      return t.add({ id: e.id, kind: 'enemy', spheres: e.spheres, owner: e, onHit: (hit) => onHit(e, hit) });
    } catch (err) { return null; }
  }
  function removeTarget(e) {
    if (e.target && ctx.targets && typeof ctx.targets.remove === 'function') { try { ctx.targets.remove(e.target); } catch (err) { /* ignore */ } }
    e.target = null;
  }

  function removeEnemy(e) {
    releaseToken(e);
    clearTelegraph(e);
    removeTarget(e);
    setFire(e, false);
    if (e.model && e.model.root && e.model.root.parent) e.model.root.parent.remove(e.model.root);
    const i = list.indexOf(e);
    if (i >= 0) list.splice(i, 1);
    if (e.group) { const j = e.group.members.indexOf(e); if (j >= 0) e.group.members.splice(j, 1); }
  }

  // ── damage to enemies (target.onHit) ──
  function onHit(e, hit) {
    if (!hit || e.state === 'dead' || e.dyingT > 0) return { applied: 0, killed: false };
    if (e.ctrl && typeof e.ctrl.onHit === 'function') return e.ctrl.onHit(e, hit);
    let part = hit.part || 'body';
    if (part === 'weak' && e.type === 'lurker' && e.flipT <= 0) part = 'body';        // belly only when flipped
    if (part === 'armor' && e.meltT > 0) part = 'body';
    const fire = hit.element === 'fire' || hit.type === 'fire';
    if (hit.type === 'blast') e.blastFrame = frame;
    if (hit.type === 'gust') { gustPush(e, hit.dir, 1); return { applied: 0, killed: false }; }
    let dmg = Math.max(0, +hit.damage || 0);
    dmg *= part === 'weak' ? 2 : part === 'armor' ? 0.25 : 1;
    if (fire) {
      if (e.type === 'thornling') dmg = Math.max(dmg, e.hp);          // thorn balls burn up at once
      if (e.type === 'rimeguard') { e.meltT = 8; e.model.setMelt(true); }
      igniteEnemy(e);
    }
    const point = hit.point || e.center;
    if (part === 'armor') fx(ctx, 'spark', point, { count: 10, color: 0xdff6ff, speed: 3 });
    else fx(ctx, 'spark', point, { count: 6, color: 0xfffbe8, speed: 2 });
    const killed = damageEnemy(e, dmg, hit.itemId || hit.type || 'player', hit);
    return { applied: dmg, killed, blocked: part === 'armor' };
  }

  function damageEnemy(e, dmg, by, hit) {
    if (dmg <= 0 || e.state === 'dead') return false;
    e.hp = Math.max(0, e.hp - dmg);
    e.hurtT = 0.12;
    e.model.setHurt(true);
    if (e.state === 'idle' || e.state === 'wander' || e.state === 'sleep' || e.state === 'return') setState(e, 'chase');
    if (e.hp <= 0) { kill(e, by); return true; }
    // flinch: light ones on any solid hit, others on strong hits; heavy ones only on parry
    const strong = dmg >= 6;
    if (!e.def.heavy && (e.def.light || strong)) {
      if (e.state === 'windup' && (e.def.light || dmg >= 8)) cancelAttack(e);
      if (hit && hit.dir && e.type !== 'lurker') { e.vel.x += hit.dir.x * (e.def.light ? 3 : 1.5); e.vel.z += hit.dir.z * (e.def.light ? 3 : 1.5); }
      if (e.state !== 'windup' && e.state !== 'attack') stagger(e, e.def.light ? 0.5 : 0.3);
    }
    return false;
  }

  function kill(e, by) {
    releaseToken(e);
    clearTelegraph(e);
    removeTarget(e);
    setFire(e, false);
    e.state = 'dead';
    e.dyingT = 0.6;
    const p = _v.copy(e.center);
    fx(ctx, 'poof', p, { count: 26, color: 0xd9d4e6, speed: 1.6, life: 1.4 });
    fx(ctx, 'shard', p, { count: 10, color: 0xffd76a, speed: 2.2 });
    emit(ctx, 'enemy:death', { id: e.id, type: e.type, pos: e.center.clone(), by: by || 'player' });
    if (!e.noDrops) dropLoot(e);
  }

  function dropLoot(e) {
    const P = G.pickups;
    if (!P) return;
    const drops = (e.extraDrops || []).concat(e.def.drops || []);
    for (const d of drops) {
      if (d.chance != null && rnd() > d.chance) continue;
      const n = d.min + Math.floor(rnd() * (d.max - d.min + 1));
      if (n <= 0) continue;
      if (d.itemId === 'shard') P.dropShards(e.pos, n);
      else P.dropItem(d.itemId, e.pos, n);
    }
  }

  function stagger(e, sec) {
    if (e.state === 'dead') return;
    cancelAttack(e);
    e.staggerT = Math.max(e.staggerT, sec);
    setState(e, 'stagger');
    emit(ctx, 'enemy:stagger', { id: e.id, type: e.type, attack: null });
  }

  function cancelAttack(e) {
    clearTelegraph(e);
    releaseToken(e);
    if (e.boltIdx >= 0) { const b = bolts[e.boltIdx]; if (b && b.charging) deactivateBolt(b); e.boltIdx = -1; }
    e.model.setDanger(false);
    e.atk = null; e.leap = null; e.charge = null;
    e.atkCd = Math.max(e.atkCd, 1.0);
  }

  function igniteEnemy(e) {
    if (e.type === 'wisp') return;     // made of cold fire
    e.burnT = 3; e.burnTick = 0;
    setFire(e, true);
  }
  function setFire(e, on) {
    const Z = ctx.zones;
    if (on && !e.fireZone && Z && typeof Z.add === 'function') {
      try { e.fireZone = Z.add({ kind: 'fire', pos: e.firePos.copy(e.center), r: Math.max(0.4, e.def.radius), owner: 'enemy:' + e.id, data: { enemy: e.id } }); } catch (err) { e.fireZone = null; }
    } else if (!on && e.fireZone) {
      try { Z && Z.remove(e.fireZone); } catch (err) { /* ignore */ }
      e.fireZone = null;
    }
  }

  function gustPush(e, dir, strength = 1) {
    if (!dir || e.state === 'dead') return;
    const k = e.def.heavy ? 0.3 : e.def.light ? 6 : 2.5;
    e.vel.x += dir.x * k * strength; e.vel.z += dir.z * k * strength;
    if (e.def.light) stagger(e, 0.8);
  }

  function setState(e, s) {
    if (e.state === s) return;
    e.state = s; e.t = 0;
    if (s === 'chase' && !e.alerted) {
      e.alerted = true;
      emit(ctx, 'enemy:alert', { id: e.id, type: e.type, pos: e.pos });
    }
    if (s === 'idle' || s === 'wander' || s === 'return') e.alerted = false;
  }
  function takeToken(e) {
    if (e.token) return true;
    if (attackers.size >= MAX_ATTACKERS) return false;
    attackers.add(e.id); e.token = true; return true;
  }
  function releaseToken(e) { if (e.token) { attackers.delete(e.id); e.token = false; } }

  // ── telegraphs ──
  function telegraphShow(owner, kind, opts) {
    let slot = null;
    for (const s of tele) if (s.owner === owner) { slot = s; break; }
    if (!slot) for (const s of tele) if (!s.owner) { slot = s; break; }
    if (!slot) return null;
    slot.owner = owner; slot.t = 0; slot.dur = opts.dur || 1; slot.kind = kind;
    slot.band.visible = slot.fan.visible = slot.ring.visible = false;
    if (kind === 'line') {
      layBand(slot.band, opts.x0, opts.z0, opts.x1, opts.z1, opts.halfWidth ?? LINE_HALF);
      slot.band.visible = true;
    } else if (kind === 'high') {
      slot.fan.position.set(opts.x, opts.y, opts.z);
      slot.fan.rotation.set(0, -opts.yaw, 0);
      const s = opts.reach || 2.3;
      slot.fan.scale.set(s, 1, s);
      slot.fan.visible = true;
    } else if (kind === 'sphere') {
      slot.ring.position.set(opts.x, heightAt(ctx, opts.x, opts.z) + 0.06, opts.z);
      const s = Math.max(0.35, opts.radius || 0.5);
      slot.ring.scale.set(s, 1, s);
      slot.ring.visible = true;
    }
    return slot;
  }
  function telegraphHide(owner) {
    for (const s of tele) if (s.owner === owner) {
      s.owner = null; s.band.visible = s.fan.visible = s.ring.visible = false;
    }
  }
  function clearTelegraph(e) { telegraphHide(e); }
  function layBand(mesh, x0, z0, x1, z1, half) {
    // a terrain-hugging strip from (x0,z0) to (x1,z1): segment rows of 2 vertices
    const pos = mesh.geometry.attributes.position;
    const rows = pos.count / 2;
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * half, nz = dx / L * half;
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const cx = x0 + dx * t, cz = z0 + dz * t;
      const y = heightAt(ctx, cx, cz) + 0.12;
      pos.setXYZ(i * 2, cx + nx, y, cz + nz);
      pos.setXYZ(i * 2 + 1, cx - nx, y, cz - nz);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }
  function teleTick(dt) {
    for (const s of tele) {
      if (!s.owner) continue;
      s.t += dt;
      const k = clamp(s.t / s.dur, 0, 1);
      // brighter and faster pulse as the hit approaches
      s.mat.opacity = (s.kind === 'high' ? 0.14 : 0.3) + 0.3 * k + 0.12 * Math.sin(s.t * (10 + 18 * k));
    }
  }

  // ── attack resolution (§5.3): dodge → block/parry → damage ──
  function hitTestPlayer(shape) {
    const body = ctx.player && ctx.player.body;
    if (body && typeof body.hitTest === 'function') {
      try { return !!body.hitTest(shape); } catch (err) { /* fall back */ }
    }
    const pl = ctx.player;
    if (!pl || !pl.pos) return false;
    if (shape.kind === 'high') {
      const hy = (body && body.headPos) ? body.headPos.y : pl.pos.y + (pl.headHeight || 1.6);
      return hy >= shape.y;
    }
    if (shape.kind === 'line') {
      const px = pl.pos.x, pz = pl.pos.z;
      const dx = shape.x1 - shape.x0, dz = shape.z1 - shape.z0, L2 = dx * dx + dz * dz || 1;
      const t = clamp(((px - shape.x0) * dx + (pz - shape.z0) * dz) / L2, 0, 1);
      return Math.hypot(px - (shape.x0 + dx * t), pz - (shape.z0 + dz * t)) <= shape.halfWidth;
    }
    if (shape.kind === 'sphere') {
      const c = shape.center, x = pl.pos.x, z = pl.pos.z;
      const y0 = pl.pos.y + 0.2, y1 = pl.pos.y + (pl.headHeight || 1.6);
      const cy = clamp(c.y, y0, y1);
      return Math.hypot(c.x - x, c.y - cy, c.z - z) <= shape.radius + 0.25;
    }
    return false;
  }

  /** returns 'dodge' | 'block' | 'parry' | 'hit' | 'none' */
  function resolveAttack(src, shape, atk, fromPos, opts = {}) {
    const pl = ctx.player;
    if (!pl || !pl.pos || (G.vitals && G.vitals.dead)) return 'none';
    const inReach = opts.inReach !== false;
    if (!inReach || !hitTestPlayer(shape)) {
      emit(ctx, 'player:dodge', { kind: shape.kind === 'high' ? 'duck' : 'side', enemyId: src.id, attack: atk.id });
      return 'dodge';
    }
    let b = null;
    const items = ctx.items;
    if (items && typeof items.blockTest === 'function') {
      try { b = items.blockTest(shape, fromPos); } catch (err) { b = null; }
    }
    if (b && b.blocked) {
      emit(ctx, 'block', { itemId: b.itemId || 'shield', parry: !!b.parry, enemyId: src.id, attack: atk.id });
      if (b.point) fx(ctx, 'spark', b.point, { count: b.parry ? 18 : 8, color: 0xffd76a, speed: 3 });
      if (b.parry && src.def && !src.ctrl) {
        if (src.type === 'lurker') flip(src); else stagger(src, 2.0);
      }
      return b.parry ? 'parry' : 'block';
    }
    _dir.set(pl.pos.x - fromPos.x, 0, pl.pos.z - fromPos.z);
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
    _dir.normalize();
    if (G.vitals) G.vitals.damage(atk.damage, { source: 'enemy', type: atk.id, dir: _dir, enemyId: src.id });
    return 'hit';
  }

  function flip(e) {
    cancelAttack(e);
    e.flipT = 3;
    e.staggerT = 3;
    setState(e, 'stagger');
    fx(ctx, 'dust', e.pos, { count: 16, color: 0xe8b27a, speed: 2 });
    emit(ctx, 'enemy:stagger', { id: e.id, type: e.type, attack: 'flip' });
  }

  // ── bolts ──
  function spawnBolt(owner, pos, r = 0.2) {
    for (const b of bolts) {
      if (b.active) continue;
      b.active = true; b.owner = owner; b.reflected = false; b.dodged = false; b.charging = true; b.life = 0;
      b.pos.copy(pos); b.vel.set(0, 0, 0); b.r = r; b.scale = 0.02; b.shape.radius = r;
      b.sphere.r = Math.max(0.3, r + 0.12);
      if (ctx.targets && typeof ctx.targets.add === 'function' && !b.target) {
        try { b.target = ctx.targets.add({ id: 'bolt-' + b.i, kind: 'projectile', spheres: [b.sphere], owner: b, onHit: (hit) => deflectBolt(b, hit) }); } catch (err) { b.target = null; }
      }
      return b;
    }
    return null;
  }
  function launchBolt(b, speed) {
    const pl = ctx.player;
    if (!pl) { deactivateBolt(b); return; }
    _head.copy((pl.body && pl.body.chestPos) || pl.pos);
    if (!(pl.body && pl.body.chestPos)) _head.y += 1.3;
    _head.y += 0.12;
    b.vel.subVectors(_head, b.pos).normalize().multiplyScalar(speed);
    b.charging = false;
    emit(ctx, 'projectile:fire', { kind: 'bolt', pos: b.pos, dir: _v2.copy(b.vel).normalize(), speed, by: b.owner ? b.owner.id : 'enemy' });
  }
  function deflectBolt(b, hit) {
    if (!b.active || b.reflected) return { applied: 0, killed: false };
    if (hit && (hit.speed == null || hit.speed >= 2 || hit.type === 'gust' || hit.type === 'arrow' || hit.type === 'thrown')) {
      reflectBolt(b);
      return { applied: 0, killed: true, blocked: true };
    }
    return { applied: 0, killed: false };
  }
  function reflectBolt(b) {
    b.reflected = true; b.charging = false;
    const o = b.owner;
    const sp = Math.max(8, b.vel.length() * 1.6);
    if (o && o.state !== 'dead') b.vel.subVectors(o.center, b.pos).normalize().multiplyScalar(sp);
    else b.vel.multiplyScalar(-1.6);
    fx(ctx, 'spark', b.pos, { count: 12, color: 0xfffbe8, speed: 3 });
    emit(ctx, 'block', { itemId: 'deflect', parry: true, enemyId: o ? o.id : null, attack: 'bolt' });
  }
  function deactivateBolt(b) {
    b.active = false; b.charging = false;
    if (b.target && ctx.targets) { try { ctx.targets.remove(b.target); } catch (err) { /* ignore */ } }
    b.target = null;
    if (b.owner && b.owner.boltIdx === b.i) b.owner.boltIdx = -1;
  }
  function clearBolts() { for (const b of bolts) if (b.active) deactivateBolt(b); }

  function boltsTick(dt) {
    const pl = ctx.player;
    let n = 0;
    for (const b of bolts) {
      if (!b.active) continue;
      if (b.charging) {
        b.scale = Math.min(b.r, b.scale + dt * b.r * 1.1);
        if (b.owner && b.owner.state !== 'dead') { b.pos.copy(b.owner.center); _v.set(Math.sin(b.owner.yaw), 0, -Math.cos(b.owner.yaw)); b.pos.addScaledVector(_v, 0.45); }
        else { deactivateBolt(b); continue; }
      } else {
        b.life += dt;
        b.scale = b.r;
        b.pos.addScaledVector(b.vel, dt);
        if (b.life > 5 || b.pos.y < heightAt(ctx, b.pos.x, b.pos.z) - 0.1) {
          fx(ctx, 'spark', b.pos, { count: 6, color: 0xc23bff, speed: 1 });
          deactivateBolt(b); continue;
        }
        // the fan's gust / the gale blade throw it back
        const Z = ctx.zones;
        if (!b.reflected && Z && typeof Z.any === 'function') {
          try { if (Z.any('wind', b.pos, b.r)) reflectBolt(b); } catch (err) { /* ignore */ }
        }
        if (b.reflected) {
          for (const e of list) {
            if (e.state === 'dead' || e.ctrl) continue;
            if (e.center.distanceTo(b.pos) < (e.def.radius || 0.4) + b.r + 0.1) {
              damageEnemy(e, 6, 'deflect', null);
              fx(ctx, 'spark', b.pos, { count: 14, color: 0xfffbe8, speed: 3 });
              deactivateBolt(b); break;
            }
          }
          if (!b.active) continue;
        } else if (pl && pl.pos) {
          const ch = (pl.body && pl.body.chestPos) || pl.pos;
          const d = ch.distanceTo(b.pos);
          if (d < 1.4) {
            const res = hitTestPlayer(b.shape);
            if (res) {
              const r = resolveAttack(b.owner || { id: 'bolt' }, b.shape, ATK_BOLT, b.pos, {});
              if (r === 'block' || r === 'parry') reflectBolt(b);
              else { fx(ctx, 'spark', b.pos, { count: 8, color: 0xc23bff, speed: 2 }); deactivateBolt(b); }
              if (!b.active) continue;
            }
          }
          // passed the player without touching → a dodge
          if (!b.dodged && b.active && !b.reflected) {
            _v.subVectors(ch, b.pos);
            if (_v.dot(b.vel) < 0 && d < 2.0) {
              b.dodged = true;
              emit(ctx, 'player:dodge', { kind: 'side', enemyId: b.owner ? b.owner.id : null, attack: 'bolt' });
            }
          }
        }
      }
      _s.setScalar(Math.max(0.01, b.scale));
      _m4.compose(b.pos, _q.identity(), _s);
      boltMesh.setMatrixAt(n++, _m4);
    }
    boltMesh.count = n;
    if (n) boltMesh.instanceMatrix.needsUpdate = true;
  }
  const ATK_BOLT = ENEMY_DEFS.wisp.attacks[0];

  // ── per-enemy AI ──
  function update(dt) {
    frame++;
    if (dt <= 0) return;
    const pl = ctx.player;
    playerPosInto(_pp);
    const px = _pp.x, pz = _pp.z;
    groupCheckT -= dt;
    if (groupCheckT <= 0) { groupCheckT = 0.5; groupsTick(px, pz); }

    // explosions announced by items: damage what onHit did not already cover
    if (pendingBlasts.length) {
      for (const bl of pendingBlasts) blastNow(bl);
      pendingBlasts.length = 0;
    }
    const night = isNight(ctx);
    const notice = night ? NOTICE_NIGHT : NOTICE_DAY;

    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.ctrl) { try { e.ctrl.update(e, dt); } catch (err) { reportOnce(err); } continue; }
      if (e.state === 'dead') {
        e.dyingT -= dt;
        const k = clamp(e.dyingT / 0.6, 0, 1);
        e.model.root.scale.setScalar(Math.max(0.01, k));
        e.model.root.position.y += dt * 0.6;
        if (e.dyingT <= 0) removeEnemy(e);
        continue;
      }
      // far from the player → retire (the group remembers its spawn)
      const dx = px - e.pos.x, dz = pz - e.pos.z, d = Math.hypot(dx, dz);
      if (d > DESPAWN_R && !e.group && !e.tag) { removeEnemy(e); continue; }
      tickStatus(e, dt);
      if (e.state === 'dead') continue;
      think(e, dt, d, dx, dz, notice);
      moveEnemy(e, dt);
      placeModel(e, dt);
    }
    separate();
    boltsTick(dt);
    teleTick(dt);
    shadowsTick();
  }

  function tickStatus(e, dt) {
    if (e.hurtT > 0) { e.hurtT -= dt; if (e.hurtT <= 0) e.model.setHurt(false); }
    if (e.meltT > 0) { e.meltT -= dt; if (e.meltT <= 0) e.model.setMelt(false); }
    if (e.flipT > 0) e.flipT -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;
    // fire: 2/s for 3 s; water puts it out; touching fire zones ignites
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick += dt;
      e.firePos.copy(e.center);
      if (e.burnTick >= 1) { e.burnTick -= 1; damageEnemy(e, 2, 'fire', null); fx(ctx, 'ember', e.center, { count: 6 }); }
      const w = ctx.world;
      if (w && typeof w.waterDepthAt === 'function' && w.waterDepthAt(e.pos.x, e.pos.z) > 0.25) e.burnT = 0;
      if (e.burnT <= 0) setFire(e, false);
    } else if (e.type !== 'wisp' && (frame + e.spheres.length) % 6 === 0) {
      const Z = ctx.zones;
      if (Z && typeof Z.query === 'function') {
        _zones.length = 0;
        try { Z.query('fire', e.center, e.def.radius || 0.4, _zones); } catch (err) { _zones.length = 0; }
        for (const z of _zones) {
          if (z.owner === 'enemy:' + e.id) continue;
          if (e.type === 'thornling') { damageEnemy(e, e.hp, 'fire', null); break; }
          if (e.type === 'rimeguard') { e.meltT = 8; e.model.setMelt(true); }
          igniteEnemy(e); break;
        }
      }
    }
    // knockback velocity decays
    if (e.vel.x || e.vel.z) {
      e.vel.multiplyScalar(Math.exp(-dt * 6));
      if (Math.abs(e.vel.x) + Math.abs(e.vel.z) < 0.02) e.vel.set(0, 0, 0);
    }
  }

  function think(e, dt, d, dx, dz, notice) {
    e.t += dt;
    const def = e.def;
    const yawToP = yawTo(dx, dz);
    e.speedNow = 0;
    const leashD = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
    switch (e.state) {
      case 'sleep':
        if (d < notice * 0.5) setState(e, 'notice');
        break;
      case 'idle':
      case 'wander': {
        if (d < notice && !(G.vitals && G.vitals.dead)) { setState(e, 'notice'); break; }
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = 3 + rnd() * 4;
          const a = rnd() * Math.PI * 2, r = Math.min(8, e.home.r || 6) * rnd();
          e.wx = e.home.x + Math.cos(a) * r; e.wz = e.home.z + Math.sin(a) * r;
          e.state = rnd() < 0.6 ? 'wander' : 'idle';
        }
        if (e.state === 'wander') {
          const wx = e.wx - e.pos.x, wz = e.wz - e.pos.z;
          if (Math.hypot(wx, wz) > 0.6) { turnTo(e, yawTo(wx, wz), dt); e.speedNow = def.speed * 0.35; }
        }
        break;
      }
      case 'notice':
        turnTo(e, yawToP, dt * 1.5);
        if (e.t > (def.light ? 0.25 : 0.45)) setState(e, 'chase');
        break;
      case 'return': {
        const hx = e.home.x - e.pos.x, hz = e.home.z - e.pos.z;
        if (Math.hypot(hx, hz) < 1.5) { e.hp = e.maxHp; setState(e, 'idle'); break; }
        turnTo(e, yawTo(hx, hz), dt);
        e.speedNow = def.speed * 0.8;
        if (d < notice * 0.5 && leashD < LEASH * 0.6) setState(e, 'chase');
        break;
      }
      case 'chase': {
        if (G.vitals && G.vitals.dead) { setState(e, 'return'); break; }
        if (leashD > LEASH || d > notice * 2.2) { releaseToken(e); setState(e, 'return'); break; }
        if (e.burrowed === false && def.burrows && e.t > 0.2 && d > def.keep + 3) e.burrowed = true;
        // melee cannot reach you on a lift or a ledge far above/below (wisps shoot, so they still can)
        const dyP = (ctx.player && ctx.player.pos ? ctx.player.pos.y : e.pos.y) - e.pos.y;
        const reachY = e.type === 'wisp' ? 12 : e.type === 'rimeguard' ? 3.2 : 2.2;
        const atk = Math.abs(dyP) <= reachY ? pickAttack(e, d) : null;
        // at most two attackers at a time (§5.3); the others wait outside the ring
        const canToken = e.token || attackers.size < MAX_ATTACKERS;
        if (canToken && d < (def.attacks[0].range ? def.attacks[0].range[1] : 3) + 3) takeToken(e);
        else if (e.token && d > def.keep + 6) releaseToken(e);
        const want = canToken ? def.keep : Math.max(def.keep, 4.2);
        turnTo(e, yawToP, dt);
        if (d > want + 0.3) {
          e.speedNow = def.speed * (d > want + 4 ? 1 : 0.7);
        } else if (d < want - 0.8 && !def.boss) {
          e.speedNow = -def.speed * 0.4;      // back off a little
        } else if (!canToken) {
          e.speedNow = 0;                       // circle slowly while waiting
          e.strafe = 0.6 * e.side;
        }
        if (atk && e.token && e.atkCd <= 0 && Math.abs(angDiff(e.yaw, yawToP)) < 35 * DEG) startWindup(e, atk, d, dx, dz);
        break;
      }
      case 'windup':
        windupTick(e, dt, d, dx, dz);
        break;
      case 'attack':
        attackTick(e, dt, d);
        break;
      case 'recover':
        if (e.type === 'wisp' || e.type === 'lurker') turnTo(e, yawToP, dt * 0.6);
        if (e.t > (e.atk && e.atk.recover ? e.atk.recover : 0.8)) {
          releaseToken(e);
          e.model.setDanger(false);
          e.atk = null;
          setState(e, 'chase');
        }
        break;
      case 'stagger':
        e.staggerT -= dt;
        if (e.staggerT <= 0) { e.flipT = 0; setState(e, 'chase'); }
        break;
    }
  }

  function pickAttack(e, d) {
    const atks = e.def.attacks;
    if (!atks || !atks.length) return null;
    const ok = [];
    for (const a of atks) if (d >= (a.range ? a.range[0] : 0) && d <= (a.range ? a.range[1] : 2)) ok.push(a);
    if (!ok.length) return null;
    if (ok.length === 1) return ok[0];
    if (!e.nextAtk || !ok.includes(e.nextAtk)) e.nextAtk = ok[Math.floor(rnd() * ok.length)];
    return e.nextAtk;
  }

  function startWindup(e, atk, d, dx, dz) {
    const pl = ctx.player;
    e.atk = atk;
    e.nextAtk = null;
    setState(e, 'windup');
    e.model.setDanger(true);
    const seated = !!setting(ctx, 'seated', false);
    const stand = (pl && pl.standHeight) || 1.6;
    const gy = pl && pl.pos ? pl.pos.y : heightAt(ctx, e.pos.x, e.pos.z);
    e.aimYaw = yawTo(dx, dz);
    let kind = atk.kind;
    if (kind === 'high' && seated) kind = 'sphere';     // seated play: ducks become shield-able hits (§2.5)
    e.atkKind = kind;
    if (kind === 'high') {
      e.shapeHigh.y = gy + stand * 0.80;
      telegraphShow(e, 'high', { x: e.pos.x, y: e.shapeHigh.y, z: e.pos.z, yaw: e.aimYaw, reach: (atk.range ? atk.range[1] : 2.3) + 0.2, dur: atk.windup });
    } else if (kind === 'line') {
      const len = atk.length || (d + (atk.extra || 2));
      const ux = Math.sin(e.aimYaw), uz = -Math.cos(e.aimYaw);
      const sx = e.pos.x + ux * (e.def.radius * 0.6), sz = e.pos.z + uz * (e.def.radius * 0.6);
      Object.assign(e.shapeLine, { x0: sx, z0: sz, x1: sx + ux * len, z1: sz + uz * len, halfWidth: LINE_HALF });
      telegraphShow(e, 'line', { ...e.shapeLine, dur: atk.windup });
      if (e.type === 'lurker') { e.burrowed = false; fx(ctx, 'dust', e.pos, { count: 18, color: 0xe8b27a, speed: 1.6 }); }
    } else if (kind === 'sphere') {
      const c = e.shapeSphere.center;
      if (e.type === 'thornling') {
        c.set(pl.pos.x, gy + 0.45, pl.pos.z);
        e.shapeSphere.radius = atk.hitR || 0.16;
        telegraphShow(e, 'sphere', { x: c.x, z: c.z, radius: 0.55, dur: atk.windup });
      } else if (e.type === 'wisp') {
        const b = spawnBolt(e, e.center, atk.hitR || 0.2);
        e.boltIdx = b ? b.i : -1;
      } else {
        // seated replacement of a high attack: a chest-height blow you block or lean away from
        if (pl.body && pl.body.chestPos) c.copy(pl.body.chestPos); else c.set(pl.pos.x, gy + stand * 0.7, pl.pos.z);
        e.shapeSphere.radius = 0.2;
        telegraphShow(e, 'sphere', { x: c.x, z: c.z, radius: 0.5, dur: atk.windup });
      }
    }
    emit(ctx, 'enemy:telegraph', { id: e.id, type: e.type, attack: atk.id, kind, duration: atk.windup, pos: e.pos });
  }

  function windupTick(e, dt, d, dx, dz) {
    const atk = e.atk;
    if (!atk) { setState(e, 'chase'); return; }
    // thornlings and wisps keep tracking a little; heavy blows are locked (fair dodges)
    if (e.type === 'wisp') turnTo(e, yawTo(dx, dz), dt);
    if (e.t >= atk.windup) {
      setState(e, 'attack');
      emit(ctx, 'enemy:attack', { id: e.id, type: e.type, attack: atk.id });
      beginAttack(e, d);
    }
  }

  function beginAttack(e, d) {
    const atk = e.atk;
    const kind = e.atkKind;
    if (e.type === 'thornling') {
      e.leap = { x0: e.pos.x, z0: e.pos.z, x1: e.shapeSphere.center.x, z1: e.shapeSphere.center.z, t: 0, T: atk.leapTime || 0.38, resolved: false };
      return;
    }
    if (e.type === 'wisp') {
      const b = e.boltIdx >= 0 ? bolts[e.boltIdx] : null;
      if (b && b.active) launchBolt(b, atk.boltSpeed || 5);
      e.boltIdx = -1;
      clearTelegraph(e);
      return;
    }
    if (e.type === 'lurker') {
      e.charge = { t: 0, dist: 0, max: Math.hypot(e.shapeLine.x1 - e.shapeLine.x0, e.shapeLine.z1 - e.shapeLine.z0), resolved: false };
      return;
    }
    // instant blows: husk sweep / slam, rimeguard beam / quake
    const pl = ctx.player;
    let inReach = Math.abs(pl.pos.y - e.pos.y) <= (e.type === 'rimeguard' ? 3.2 : 2.2);
    if (kind === 'high') {
      const reach = (atk.range ? atk.range[1] : 2.3) + 0.35;
      const pdx = pl.pos.x - e.pos.x, pdz = pl.pos.z - e.pos.z;
      const off = Math.abs(angDiff(e.aimYaw, yawTo(pdx, pdz)));
      inReach = inReach && Math.hypot(pdx, pdz) <= reach && off <= ((atk.arc || 80) / 2 + 12) * DEG;
    }
    _from.copy(e.center);
    const shape = kind === 'high' ? e.shapeHigh : kind === 'line' ? e.shapeLine : e.shapeSphere;
    resolveAttack(e, shape, atk, _from, { inReach });
    if (kind === 'line') {
      fx(ctx, 'ring', _v.set((e.shapeLine.x0 + e.shapeLine.x1) / 2, e.pos.y, (e.shapeLine.z0 + e.shapeLine.z1) / 2), { color: 0xd9d4e6, size: 2 });
      fx(ctx, 'dust', _v.set(e.shapeLine.x0 + (e.shapeLine.x1 - e.shapeLine.x0) * 0.4, e.pos.y, e.shapeLine.z0 + (e.shapeLine.z1 - e.shapeLine.z0) * 0.4), { count: 14, speed: 2 });
    } else if (kind === 'high') {
      fx(ctx, 'gust', _v.copy(e.center), { count: 8, dir: _v2.set(Math.sin(e.aimYaw), 0, -Math.cos(e.aimYaw)), speed: 4 });
    }
    clearTelegraph(e);
  }

  function attackTick(e, dt, d) {
    const atk = e.atk;
    if (!atk) { setState(e, 'chase'); return; }
    if (e.leap) {
      const L = e.leap;
      L.t += dt;
      const k = clamp(L.t / L.T, 0, 1);
      e.pos.x = L.x0 + (L.x1 - L.x0) * k;
      e.pos.z = L.z0 + (L.z1 - L.z0) * k;
      e.hop = Math.sin(k * Math.PI) * 0.55;
      if (!L.resolved && k >= 0.8) {
        L.resolved = true;
        _from.copy(e.center);
        resolveAttack(e, e.shapeSphere, atk, _from, { inReach: Math.abs(ctx.player.pos.y - e.pos.y) <= 2.2 });
        clearTelegraph(e);
      }
      if (k >= 1) { e.hop = 0; e.leap = null; e.atkCd = atk.cooldown; setState(e, 'recover'); }
      return;
    }
    if (e.charge) {
      const C = e.charge, sp = atk.chargeSpeed || 10;
      const ux = Math.sin(e.aimYaw), uz = -Math.cos(e.aimYaw);
      const step = sp * dt;
      const nx = e.pos.x + ux * step, nz = e.pos.z + uz * step;
      const w = ctx.world;
      const blocked = w && typeof w.isBlocked === 'function' && w.isBlocked(nx, nz, 0.5);
      if (blocked) {   // slams into a rock: flips over, belly exposed
        fx(ctx, 'spark', e.center, { count: 14, color: 0xfffbe8 });
        clearTelegraph(e);
        flip(e);
        return;
      }
      e.pos.x = nx; e.pos.z = nz;
      C.dist += step;
      if ((C.t += dt) > 0.05 && (frame & 1)) fx(ctx, 'dust', e.pos, { count: 3, color: 0xe8b27a, speed: 1 });
      // resolve when the charge passes the player's position along the line
      if (!C.resolved) {
        const pl = ctx.player;
        const along = (pl.pos.x - e.shapeLine.x0) * ux + (pl.pos.z - e.shapeLine.z0) * uz;
        if (C.dist + e.def.radius * 0.6 >= along - 0.3) {
          C.resolved = true;
          _from.copy(e.center);
          const r = resolveAttack(e, e.shapeLine, atk, _from, { inReach: Math.abs(pl.pos.y - e.pos.y) <= 2.2 });
          if (r === 'parry') return;      // flipped already
        }
      }
      if (C.dist >= C.max) {
        e.charge = null; e.atkCd = atk.cooldown; clearTelegraph(e);
        e.burrowed = true;
        setState(e, 'recover');
      }
      return;
    }
    if (e.t > 0.25) { e.atkCd = atk.cooldown; setState(e, 'recover'); }
  }

  function turnTo(e, target, dt) {
    const turn = (e.def.turn || 4) * dt;
    const dd = angDiff(e.yaw, target);
    e.yaw += clamp(dd, -turn, turn);
  }

  function moveEnemy(e, dt) {
    let sp = e.speedNow;
    const strafe = e.strafe || 0;
    e.strafe = 0;
    let mx = 0, mz = 0;
    if (sp !== 0) { mx += Math.sin(e.yaw) * sp; mz += -Math.cos(e.yaw) * sp; }
    if (strafe) { mx += Math.cos(e.yaw) * strafe; mz += Math.sin(e.yaw) * strafe; }
    mx += e.vel.x; mz += e.vel.z;
    if (mx === 0 && mz === 0) return;
    let nx = e.pos.x + mx * dt, nz = e.pos.z + mz * dt;
    const w = ctx.world;
    if (w && typeof w.resolveCircle === 'function' && !e.def.float) {
      try { if (w.resolveCircle(nx, nz, e.def.radius, _res)) { nx = _res.x; nz = _res.z; } } catch (err) { /* ignore */ }
    }
    if (w && typeof w.waterDepthAt === 'function' && !e.def.float && w.waterDepthAt(nx, nz) > 0.9) { nx = e.pos.x; nz = e.pos.z; }
    // stuck → slide sideways around the obstacle (no path finding, §5.4)
    const moved = Math.hypot(nx - e.pos.x, nz - e.pos.z);
    if (Math.abs(sp) > 0.2 && moved < Math.abs(sp) * dt * 0.3) {
      e.stuckT += dt;
      if (e.stuckT > 0.35) {
        const sx = Math.cos(e.yaw) * e.side * Math.abs(sp), sz = Math.sin(e.yaw) * e.side * Math.abs(sp);
        nx = e.pos.x + sx * dt; nz = e.pos.z + sz * dt;
        if (w && typeof w.resolveCircle === 'function') { try { if (w.resolveCircle(nx, nz, e.def.radius, _res)) { nx = _res.x; nz = _res.z; } } catch (err) { /* ignore */ } }
        if (e.stuckT > 2.5) { e.side = -e.side; e.stuckT = 0; }
      }
    } else e.stuckT = Math.max(0, e.stuckT - dt);
    e.pos.x = nx; e.pos.z = nz;
  }

  function separate() {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'dead' || a.ctrl) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'dead' || b.ctrl) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = (a.def.radius + b.def.radius) * 1.1;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-6 && d2 < min * min) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const ux = dx / d, uz = dz / d;
          if (!a.leap && !a.charge) { a.pos.x -= ux * push; a.pos.z -= uz * push; }
          if (!b.leap && !b.charge) { b.pos.x += ux * push; b.pos.z += uz * push; }
        }
      }
    }
  }

  // ── placing and animating the model ──
  function placeModel(e, dt) {
    const m = e.model, def = e.def;
    e.anim += dt;
    const ground = heightAt(ctx, e.pos.x, e.pos.z);
    e.pos.y = ground;
    let y = ground;
    const r = m.root, spin = m.spin;
    const windK = e.state === 'windup' && e.atk ? clamp(e.t / e.atk.windup, 0, 1) : 0;
    switch (e.type) {
      case 'thornling': {
        // a springy bounce while rolling keeps it above the grass
        y += (e.hop || 0) + (Math.abs(e.speedNow) > 0.2 ? Math.abs(Math.sin(e.anim * 9)) * 0.12 : 0);
        const roll = (e.speedNow + (e.leap ? 6 : 0)) * dt / 0.2;
        spin.rotation.x -= roll;
        const sq = e.state === 'windup' ? 1 - 0.4 * windK : 1;
        spin.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
        if (e.state === 'windup') { spin.position.x = Math.sin(e.anim * 60) * 0.015; } else spin.position.x = 0;
        spin.position.y = 0.24 + (1 - sq) * -0.08;   // the ball rolls around its own center
        break;
      }
      case 'husk': {
        const walk = Math.abs(e.speedNow) > 0.1 ? 1 : 0;
        spin.rotation.z = Math.sin(e.anim * 4) * 0.05 * walk;
        y += Math.abs(Math.sin(e.anim * 4)) * 0.04 * walk;
        const A = m.armsPivot;
        let ax = Math.sin(e.anim * 4) * 0.25 * walk + 0.05, ay = 0;
        if (e.atk && (e.state === 'windup' || e.state === 'attack' || e.state === 'recover')) {
          const at = e.state === 'attack' ? clamp(e.t / 0.2, 0, 1) : e.state === 'recover' ? 1 : 0;
          const back = e.state === 'recover' ? 1 - clamp(e.t / 0.6, 0, 1) : 1;
          if (e.atk.id === 'sweep') {
            ax = 1.5 * Math.min(1, windK * 2) * back + (e.state !== 'windup' ? 1.5 * back : 0);
            ax = Math.min(ax, 1.5);
            ay = e.state === 'windup' ? 0.9 * windK : (0.9 - 2.0 * at) * back;
          } else {
            ax = e.state === 'windup' ? 3.0 * windK : (3.0 - 2.0 * at) * back + 0.05;
            spin.rotation.x = e.state === 'windup' ? 0.15 * windK : 0;
          }
        } else spin.rotation.x = 0;
        A.rotation.set(ax, 0, 0);
        spin.rotation.y = ay;
        if (e.state === 'stagger') spin.rotation.x = -0.25 * Math.sin(Math.min(1, e.t * 4) * Math.PI);
        break;
      }
      case 'wisp': {
        y += def.float + Math.sin(e.anim * 2.1 + e.yaw) * 0.15;
        if (m.armsPivot) m.armsPivot.rotation.y += dt * 2.2;
        const s = 1 + (e.state === 'windup' ? 0.35 * windK : 0) + Math.sin(e.anim * 9) * 0.04;
        if (m.core) m.core.scale.setScalar(s);
        if (m.glow) m.glow.scale.setScalar(0.9 + 0.2 * Math.sin(e.anim * 5));
        break;
      }
      case 'lurker': {
        const wantRise = e.burrowed && e.flipT <= 0 ? 0 : 1;
        e.rise = damp(e.rise, wantRise, 0.18, dt);
        y += -0.72 * (1 - e.rise);
        if (e.burrowed && Math.abs(e.speedNow) > 0.3 && (frame % 5 === 0)) fx(ctx, 'dust', e.pos, { count: 2, color: 0xe8b27a, speed: 0.8 });
        if (e.flipT > 0) {
          spin.rotation.z = damp(spin.rotation.z, Math.PI, 0.1, dt);
          y += 0.75;
        } else spin.rotation.z = damp(spin.rotation.z, 0, 0.1, dt);
        if (e.state === 'windup') spin.position.x = Math.sin(e.anim * 50) * 0.03; else spin.position.x = 0;
        break;
      }
      case 'rimeguard': {
        const walk = Math.abs(e.speedNow) > 0.1 ? 1 : 0;
        y += Math.abs(Math.sin(e.anim * 2.4)) * 0.06 * walk;
        const A = m.armsPivot;
        let ax = Math.sin(e.anim * 2.4) * 0.15 * walk;
        spin.rotation.x = 0;
        if (e.atk && e.atk.id === 'quake' && (e.state === 'windup' || e.state === 'attack' || e.state === 'recover')) {
          ax = e.state === 'windup' ? 3.0 * windK : e.state === 'attack' ? 0.6 : 0.6 * (1 - clamp(e.t / 0.6, 0, 1));
        } else if (e.atk && e.atk.id === 'beam' && e.state === 'windup') {
          spin.rotation.x = -0.12 * windK;
        }
        A.rotation.set(ax, 0, 0);
        if (e.state === 'stagger') spin.rotation.x = -0.15 * Math.sin(Math.min(1, e.t * 3) * Math.PI);
        break;
      }
    }
    r.position.set(e.pos.x, y, e.pos.z);
    r.rotation.y = -e.yaw;
    r.scale.setScalar(1);
    // hit spheres follow the model (local offsets rotated by yaw)
    const cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
    for (const s of e.spheres) {
      let oy = s.oy, oz = s.oz;
      if (e.type === 'lurker' && e.flipT > 0) { oy = 0.9 - oy + 0.75; }
      s.c.set(e.pos.x + s.ox * cy - oz * sy, y + oy - (e.type === 'wisp' ? 0 : 0), e.pos.z + s.ox * sy + oz * cy);
      if (e.type === 'wisp') s.c.y = y;
    }
    e.center.set(e.pos.x, y + (e.type === 'wisp' ? 0 : def.center), e.pos.z);
  }

  function shadowsTick() {
    if (!shadows) return;
    let n = 0;
    for (const e of list) {
      if (n >= MAX_SHADOWS) break;
      if (e.ctrl || (e.state === 'dead' && e.dyingT < 0.3)) continue;
      if (e.type === 'lurker' && e.rise < 0.3) continue;
      const r = (e.def.radius || 0.4) * (e.type === 'wisp' ? 1.2 : 1.6);
      _s.set(r, 1, r);
      _v.set(e.pos.x, e.pos.y + 0.04, e.pos.z);
      _m4.compose(_v, _q.identity(), _s);
      shadows.setMatrixAt(n++, _m4);
    }
    shadows.count = n;
    if (n) shadows.instanceMatrix.needsUpdate = true;
  }

  function playerPosInto(out) {
    const pl = ctx.player;
    if (pl && pl.pos) return out.copy(pl.pos);
    if (ctx.camera) { ctx.camera.getWorldPosition(out); return out; }
    return out.set(0, 0, 0);
  }

  function blastNow(bl) {
    for (const e of list) {
      if (e.state === 'dead') continue;
      if (Math.abs(e.blastFrame - bl.frame) <= 2) continue;   // items already hit it through onHit
      const d = e.center.distanceTo(bl.pos);
      if (d > bl.radius + (e.def.radius || 0.4)) continue;
      const k = clamp(1 - d / bl.radius, 0, 1);
      const dmg = Math.round(4 + (bl.damage - 4) * k);
      _dir.subVectors(e.center, bl.pos).setY(0).normalize();
      if (e.ctrl && e.ctrl.onHit) e.ctrl.onHit(e, { source: 'player', itemId: 'bomb', type: 'blast', damage: dmg, element: 'none', point: e.center, dir: _dir, part: 'body' });
      else { damageEnemy(e, dmg, 'bomb', { dir: _dir }); gustPush(e, _dir, 1.5); }
    }
  }

  function resetAll() {
    clearBolts();
    for (const e of list.slice()) {
      if (e.ctrl) { if (e.ctrl.reset) e.ctrl.reset(e); continue; }
      if (e.state === 'dead') continue;
      cancelAttack(e);
      e.pos.set(e.home.x, heightAt(ctx, e.home.x, e.home.z), e.home.z);
      e.hp = e.maxHp; e.burnT = 0; setFire(e, false); e.staggerT = 0; e.flipT = 0;
      e.state = 'idle'; e.t = 0; e.alerted = false; e.vel.set(0, 0, 0);
      e.atkCd = 2.5;
      placeModel(e, 0);
    }
    attackers.clear();
    for (const s of tele) { s.owner = null; s.band.visible = s.fan.visible = s.ring.visible = false; }
  }

  let reported = false;
  function reportOnce(err) {
    if (reported) return;
    reported = true;
    try { (window.AW && window.AW.errors || []).push('game.enemies: ' + (err && err.message)); } catch (e2) { /* ignore */ }
  }

  // ── events from other modules ──
  ctx.events?.on?.('explosion', (e) => {
    if (!e || !e.pos) return;
    pendingBlasts.push({ pos: e.pos.clone ? e.pos.clone() : new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z), radius: e.radius || 4, damage: e.damage || 14, frame });
  });
  ctx.events?.on?.('gust', (g) => {
    if (!g || !g.pos || !g.dir) return;
    const R = g.radius || 6;
    for (const e of list) {
      if (e.state === 'dead' || e.ctrl) continue;
      _v.subVectors(e.center, g.pos);
      const d = _v.length();
      if (d > R) continue;
      _v.normalize();
      if (_v.dot(g.dir) < Math.cos(35 * DEG) && d > 1) continue;
      gustPush(e, g.dir, g.strength ?? 1);
    }
    for (const b of bolts) {
      if (!b.active || b.reflected) continue;
      _v.subVectors(b.pos, g.pos);
      if (_v.length() < R && _v.normalize().dot(g.dir) > Math.cos(35 * DEG)) reflectBolt(b);
    }
  });
  ctx.events?.on?.('time:phase', (p) => { if (p && p.phase === 'dawn') api.onDawn(); });

  return api;
}

// ── telegraph geometry ──
function buildTelegraphGeos() {
  // fan: a 100° slab at head height with a bright vertical rim (a "line at head height")
  const arc = 100 * DEG, segs = 14;
  const pos = [];
  const a0 = -arc / 2;
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + (arc * i) / segs, t1 = a0 + (arc * (i + 1)) / segs;
    const x0 = Math.sin(t0), z0 = -Math.cos(t0), x1 = Math.sin(t1), z1 = -Math.cos(t1);
    // flat sector, from 0.35 to 1.0 of the radius
    pos.push(x0 * 0.35, 0, z0 * 0.35, x0, 0, z0, x1, 0, z1);
    pos.push(x0 * 0.35, 0, z0 * 0.35, x1, 0, z1, x1 * 0.35, 0, z1 * 0.35);
    // rim curtain (8 cm tall)
    pos.push(x0, -0.04, z0, x1, -0.04, z1, x1, 0.04, z1);
    pos.push(x0, -0.04, z0, x1, 0.04, z1, x0, 0.04, z0);
  }
  const fan = new THREE.BufferGeometry();
  fan.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fan.computeBoundingSphere();
  const ring = new THREE.RingGeometry(0.72, 1.0, 24).rotateX(-Math.PI / 2);
  const band = () => {
    const rows = 14, g = new THREE.BufferGeometry();
    const p = new Float32Array(rows * 2 * 3);
    const idx = [];
    for (let i = 0; i < rows - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setIndex(idx);
    return g;
  };
  return { fan, ring, band };
}
