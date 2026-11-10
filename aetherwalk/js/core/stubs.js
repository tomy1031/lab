// js/core/stubs.js — stand-ins used when a module fails to load or to create (§10.14, OPUS-A).
// Every stub has the full API shape, so the rest of the game keeps running.
import * as THREE from 'three';
import { SPAWN_FALLBACK } from './config.js';

export const PALETTE = {
  gold: 0xffd76a, cyan: 0x7fe9ff, white: 0xfffbe8, danger: 0xff3b5c, ash: 0x6b6770, core: 0xc23bff,
  fireA: 0xffb347, fireB: 0xff6a2b, uiBg: 0x1b2440, uiInk: 0xf4ecd8,
};

// ───────────────────────────── art (Lambert + basic) ─────────────────────────────
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}
const _bq = new THREE.Quaternion(), _bp = new THREE.Vector3(), _bs = new THREE.Vector3(), _bq2 = new THREE.Quaternion();
const _cp = new THREE.Vector3(), _cs = new THREE.Vector3();
/** make a mesh always face the camera (rewrites matrixWorld right before it is drawn) */
export function billboard(mesh) {
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.matrixWorld.decompose(_bp, _bq2, _bs);
    camera.matrixWorld.decompose(_cp, _bq, _cs);     // never call camera.getWorld*(): XR eye cameras have no parent
    mesh.matrixWorld.compose(_bp, _bq, _bs);
  };
  return mesh;
}

export function createStubArt() {
  const matCache = new Map();
  const basicCache = new Map();
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const art = {
    palette: PALETTE,
    material({ color = 0xffffff, vertexColors = false, flat = true, emissive = 0x000000, rim = 0.25, map = null, side = THREE.FrontSide } = {}) {
      const key = [color, vertexColors, flat, emissive, rim, map && map.uuid, side].join('|');
      let m = matCache.get(key);
      if (!m) {
        m = new THREE.MeshLambertMaterial({ color, vertexColors, flatShading: flat, emissive, map, side });
        matCache.set(key, m);
      }
      return m;
    },
    basic({ color = 0xffffff, map = null, transparent = false, additive = false, fog = true, depthWrite, side = THREE.FrontSide, opacity = 1 } = {}) {
      if (depthWrite === undefined) depthWrite = !(transparent || additive);
      const key = [color, map && map.uuid, transparent, additive, fog, depthWrite, side, opacity].join('|');
      let m = basicCache.get(key);
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color, map, transparent: transparent || additive, opacity, fog, depthWrite, side,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        basicCache.set(key, m);
      }
      return m;
    },
    glow({ color = 0xffd76a, size = 0.3, opacity = 1 } = {}) {
      const mat = new THREE.MeshBasicMaterial({
        color, map: glowTexture(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.scale.setScalar(size);
      mesh.renderOrder = 10;
      mesh.name = 'glow';
      return billboard(mesh);
    },
    blobShadow(radius = 0.4) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      return m;
    },
    canvasTexture(w, h, draw) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (draw) draw(g);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    },
  };
  return art;
}

// ───────────────────────────── world ─────────────────────────────
export async function createStubWorld(ctx) {
  const GROUND = 20;
  const art = createStubArt();
  const scene = ctx.scene;
  const group = new THREE.Group();
  group.name = 'stub-world';
  scene.add(group);
  scene.background = new THREE.Color(0x9fd0f0);
  scene.fog = new THREE.Fog(0xcfe6ee, 60, 600);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a9466, 1.6);
  const sun = new THREE.DirectionalLight(0xfffaf0, 1.4);
  sun.position.set(0.5, 0.8, -0.4);
  group.add(hemi, sun);
  // ground with a grid so motion is visible
  const tex = art.canvasTexture(128, 128, (g) => {
    g.fillStyle = '#5fae4a'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#56a043'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(400, 400);
  tex.anisotropy = 4;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND;
  group.add(ground);
  // a few posts along the start road for a sense of speed
  const postGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.6, 6);
  postGeo.translate(0, 0.8, 0);
  const posts = new THREE.InstancedMesh(postGeo, art.material({ color: 0x9a9484 }), 80);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 80; i++) {
    const side = i % 2 ? 1 : -1;
    m4.makeTranslation(side * 4, GROUND, 540 - Math.floor(i / 2) * 10);
    posts.setMatrixAt(i, m4);
  }
  posts.frustumCulled = false;
  group.add(posts);

  const colliders = [];
  const platforms = [];
  const landmarks = { start: { id: 'start', name: '目覚めの石舞台', kind: 'ruin', x: 0, y: GROUND, z: 540, r: 10, yaw: 0 } };
  const spawn = { ...SPAWN_FALLBACK };
  const world = {
    isStub: true,
    size: 1600, seaLevel: 0, lakeLevel: 24,
    heightAt: () => GROUND,
    normalAt: (x, z, out = new THREE.Vector3()) => out.set(0, 1, 0),
    slopeAt: () => 0,
    groundAt(x, z, y = Infinity) {
      let g = GROUND;
      for (const p of platforms) {
        const inside = p.r != null ? (x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r : x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
        if (inside && p.y <= y + 0.6 && p.y > g) g = p.y;
      }
      return g;
    },
    waterLevelAt: () => -Infinity,
    waterDepthAt: () => 0,
    regionAt: () => 'meadow',
    surfaceAt: () => 'grass',
    pathAt: () => 0,
    isBlocked(x, z, r = 0.3) {
      if (Math.abs(x) > 780 || Math.abs(z) > 780) return true;
      for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return true;
      return false;
    },
    resolveCircle(x, z, r, out) {
      let hit = false;
      for (const c of colliders) {
        const dx = x - c.x, dz = z - c.z, R = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1e-4;
          x = c.x + (dx / d) * R; z = c.z + (dz / d) * R; hit = true;
        }
      }
      if (out) { out.x = x; out.z = z; }
      return hit;
    },
    collidersNear(x, z, radius, out = []) {
      out.length = 0;
      for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (radius + c.r) ** 2) out.push(c);
      return out;
    },
    addCollider(c) { const h = { y0: -1e9, y1: 1e9, kind: 'structure', ...c }; colliders.push(h); return h; },
    removeCollider(h) { const i = colliders.indexOf(h); if (i >= 0) colliders.splice(i, 1); },
    raycastGround(origin, dir, maxDist = 100, out = {}) {
      if (Math.abs(dir.y) < 1e-6) return null;
      const t = (GROUND - origin.y) / dir.y;
      if (t < 0 || t > maxDist) return null;
      out.point = (out.point || new THREE.Vector3()).copy(dir).multiplyScalar(t).add(origin);
      out.normal = (out.normal || new THREE.Vector3()).set(0, 1, 0);
      out.distance = t;
      return out;
    },
    raycastSolid(origin, dir, maxDist = 100, out = {}) {
      const r = world.raycastGround(origin, dir, maxDist, out);
      if (r) r.kind = 'ground';
      return r;
    },
    addPlatform(p) { const q = { ...p }; platforms.push(q); return q; },
    removePlatform(p) { const i = platforms.indexOf(p); if (i >= 0) platforms.splice(i, 1); },
    landmarks,
    landmarkList: Object.values(landmarks),
    vistas: [],
    spawnPoints: { player: spawn, waylights: [], towers: [], shrines: [], chests: [], seeds: [], enemies: [], gather: [] },
    props: { list: [], byId: {}, ofKind: () => [], near: (x, z, r, out = []) => { out.length = 0; return out; } },
    time: 7, timeScale: 1 / 60, phase: 'day', nightFactor: 0,
    setTimeOfDay(h) { world.time = ((Number(h) % 24) + 24) % 24; },
    sunDirection: new THREE.Vector3(0.5, 0.8, -0.4).normalize(),
    sunColor: new THREE.Color(0xfffaf0), skyColor: new THREE.Color(0xcfe8ff), groundColor: new THREE.Color(0x8a9466), fogColor: new THREE.Color(0xcfe6ee),
    wind: { dir: new THREE.Vector2(1, 0), strength: 0.3 },
    art,
    fx: { emit() {}, ribbon() {}, flash() {} },
    drawMap(g, size) { g.fillStyle = '#5fae4a'; g.fillRect(0, 0, size, size); },
    worldToMap(x, z, size, out = {}) { out.u = (x / 1600 + 0.5) * size; out.v = (z / 1600 + 0.5) * size; return out; },
    update(dt) { world.time = (world.time + dt * world.timeScale) % 24; },
    setQuality() {},
  };
  return world;
}

// ───────────────────────────── a training dummy target (OPUS-A's own test target) ─────────────────────────────
export function createDummy(ctx, x, z, { hp = Infinity, kind = 'dummy', id = null } = {}) {
  const art = ctx.art || createStubArt();
  const y = ctx.world ? ctx.world.heightAt(x, z) : 0;
  const g = new THREE.Group();
  g.name = 'dummy';
  const wood = art.material({ color: 0x9a7a52 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6), wood);
  post.position.y = 0.85;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 7), art.material({ color: 0xc9a86a }));
  body.position.y = 1.2;
  const headM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), art.material({ color: 0xd8c08a }));
  headM.position.y = 1.65;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), wood);
  arm.position.y = 1.35;
  const sway = new THREE.Group();
  sway.add(body, headM, arm);
  g.add(post, sway);
  g.position.set(x, y, z);
  ctx.scene.add(g);
  const cBody = new THREE.Vector3(x, y + 1.2, z), cHead = new THREE.Vector3(x, y + 1.65, z);
  const spheres = [{ c: cBody, r: 0.3, part: 'body' }, { c: cHead, r: 0.16, part: 'weak' }];
  const state = { hp, maxHp: hp, hits: 0, lastHit: null, swayV: 0, swayA: 0, swayAxis: new THREE.Vector3(1, 0, 0), dead: false };
  const dummy = {
    id: id || 'dummy' + Math.floor(Math.random() * 1e6), type: kind, kind, pos: g.position, object3D: g, state, target: null,
    get hp() { return state.hp; },
    update(dt) {
      // spring sway
      state.swayV += (-40 * state.swayA - 6 * state.swayV) * dt;
      state.swayA += state.swayV * dt;
      sway.quaternion.setFromAxisAngle(state.swayAxis, state.swayA);
      cBody.set(g.position.x, g.position.y + 1.2, g.position.z);
      cHead.set(g.position.x, g.position.y + 1.65, g.position.z);
    },
    remove() { ctx.targets.remove(dummy.target); g.removeFromParent(); },
  };
  dummy.target = ctx.targets.add({
    id: dummy.id, kind: kind === 'dummy' ? 'dummy' : 'enemy', spheres, owner: dummy,
    onHit(hit) {
      if (state.dead) return { applied: 0, killed: false };
      const mul = hit.part === 'weak' ? 2 : hit.part === 'armor' ? 0.25 : 1;
      const applied = (hit.damage || 0) * mul;
      state.hits++;
      state.lastHit = { type: hit.type, damage: applied, speed: hit.speed, itemId: hit.itemId };
      if (hit.dir) { state.swayAxis.set(hit.dir.z, 0, -hit.dir.x).normalize(); state.swayV += Math.min(6, 1 + applied * 0.4); }
      if (Number.isFinite(state.hp)) state.hp -= applied;
      const killed = Number.isFinite(state.hp) && state.hp <= 0;
      if (killed) {
        state.dead = true;
        ctx.world?.fx?.emit?.('poof', cHead, { count: 20 });
        ctx.events.emit('enemy:death', { id: dummy.id, type: kind, pos: g.position, by: hit.itemId });
        setTimeout(() => dummy.remove(), 50);
      }
      return { applied, killed };
    },
  });
  return dummy;
}

// ───────────────────────────── player ─────────────────────────────
export async function createStubPlayer(ctx) {
  const pos = new THREE.Vector3(0, ctx.world.heightAt(0, 540), 540);
  ctx.rig.position.copy(pos);
  const player = {
    isStub: true, rig: ctx.rig, pos, vel: new THREE.Vector3(), yaw: 0, speed: 0, cadence: 0, steps: 0, gait: 'idle',
    moving: false, grounded: true, gliding: false, ducking: false, lean: 0, headHeight: 1.6, standHeight: 1.6, armSpan: 1.6,
    body: { headPos: new THREE.Vector3(), chestPos: new THREE.Vector3(), radius: 0.25, hitTest: () => true },
    holsters: { slotPos: (slot, out = new THREE.Vector3()) => out.copy(pos), handIn: () => null },
    teleport(x, z, yawDeg = 0) {
      pos.set(x, ctx.world.heightAt(x, z), z);
      ctx.rig.position.copy(pos);
      ctx.rig.rotation.y = -(yawDeg * Math.PI) / 180;
      ctx.events.emit('player:teleport', { x, z, yaw: yawDeg });
    },
    addImpulse() {}, setEnabled() {}, simulateSteps() {},
    abilities: { glide: false },
    update() { player.body.headPos.copy(ctx.input.head.pos); player.body.chestPos.copy(ctx.input.head.pos).y -= 0.35; },
  };
  return player;
}

// ───────────────────────────── items ─────────────────────────────
export async function createStubItems() {
  return {
    isStub: true, defs: {}, held: { left: null, right: null }, worldItems: [],
    spawn: () => null, despawn() {}, equip: () => null, blockTest: () => null,
    makeModel: () => new THREE.Group(), update() {},
  };
}

// ───────────────────────────── game ─────────────────────────────
export async function createStubGame(ctx) {
  const items = {};
  const dummies = [];
  const game = {
    isStub: true,
    vitals: {
      hp: 12, maxHp: 12, stamina: 0, maxStamina: 100, tier: 0, speedMul: 1, damageMul: 1, invulnerable: false,
      damage: () => 0, heal() {}, addStamina() {}, spendStamina: () => true,
    },
    inventory: {
      count: (id) => items[id] || 0, has: (id) => (items[id] || 0) > 0,
      add(id, n = 1) { items[id] = (items[id] || 0) + n; return n; },
      remove(id, n = 1) { if ((items[id] || 0) < n) return false; items[id] -= n; return true; },
      list: () => Object.keys(items).map((id) => ({ id, count: items[id] })),
      slots: { backR: null, backL: null, hipR: null, hipL: null, chest: null, belt: null },
      setSlot() { return false; }, take: () => null, stow: () => false, capacity: () => 99,
    },
    quest: { stage: 0, objective: null, towers: {}, shrines: {}, seeds: [], setStage(n) { game.quest.stage = n; } },
    enemies: {
      get list() { return dummies.filter((d) => !d.state.dead).map((d) => ({ id: d.id, type: d.type, pos: d.pos, hp: d.hp, state: 'idle' })); },
      get count() { return dummies.filter((d) => !d.state.dead).length; },
      spawn(type, x, z) { const d = createDummy(ctx, x, z, { hp: 12, kind: type || 'husk' }); dummies.push(d); return d; },
      clear() { for (const d of dummies) d.remove(); dummies.length = 0; },
    },
    stats: { steps: 0, distance: 0, kcal: 0, activeSec: 0, bestCadence: 0, session: {} },
    checkpoint: 'start',
    save() {}, load: () => false, reset() {},
    bot: { enabled: false, start() {}, stop() {} },
    update(dt) { for (const d of dummies) d.update(dt); },
  };
  ctx.events.on('step', () => { game.stats.steps++; });
  return game;
}

export async function createStubUI() {
  return {
    isStub: true, menuOpen: false,
    setHudVisible() {}, toast() {}, title() {}, openMenu() {}, closeMenu() {}, update() {},
  };
}

export async function createStubAudio() {
  return { isStub: true, resume() {}, setMuted() {}, play() {}, update() {} };
}
