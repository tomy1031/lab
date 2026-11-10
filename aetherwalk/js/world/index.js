// js/world/index.js — FABLE
// ユラ島：createWorld(ctx) → World（§10.7）。
import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL, LAKE_LEVEL, LAKE_C, ICE_LEVEL, LM, LANDMARKS, VISTAS } from './layout.js';
import { buildHeightfield } from './heightfield.js';
import { makeRng } from './noise.js';
import { createBiomes } from './biomes.js';
import { createCollision } from './collide.js';
import { createArt, U } from './art.js';
import { createPalette, phaseOf, REGION_AIR } from './palette.js';
import { createTextures, createTerrain } from './terrain.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createGrass } from './grass.js';
import { createFlora } from './flora.js';
import { createFx } from './fx.js';
import { createLife } from './life.js';
import { createProps } from './props.js';
import { createLandmarks } from './landmarks/index.js';
import { buildSpawnPoints } from './spawns.js';
import { createMap } from './map.js';

export async function createWorld(ctx) {
  const T0 = performance.now();
  const seed = (ctx.flags && Number.isFinite(+ctx.flags.seed)) ? (+ctx.flags.seed | 0) : 7;
  const baseRng = (ctx.rng && typeof ctx.rng.fork === 'function') ? ctx.rng : makeRng(seed * 2654435761);
  const fork = (label) => {
    try { const r = baseRng.fork('world:' + label); if (r && typeof r.next === 'function' && typeof r.range === 'function') return r; } catch (e) { /* fallthrough */ }
    return makeRng(seed * 7919).fork(label);
  };
  const progress = (label, r) => { try { ctx.progress && ctx.progress(label, r); } catch (e) { /* noop */ } };
  const tick = () => new Promise((res) => setTimeout(res, 0));
  const timing = {};
  const lap = (name, t) => { timing[name] = Math.round(performance.now() - t); };

  // ── 地形のデータ ──
  let t = performance.now();
  progress('島をつくっています', 0.1);
  const hf = buildHeightfield(seed);
  lap('heightfield', t);
  const biomes = createBiomes(hf);
  const col = createCollision(hf);
  const art = createArt();
  const palette = createPalette();
  await tick();

  const root = new THREE.Group();
  root.name = 'aw-world';
  ctx.scene.add(root);

  t = performance.now();
  progress('地面を塗っています', 0.3);
  const tex = createTextures(hf, biomes);
  lap('textures', t);
  t = performance.now();
  const terrain = createTerrain(ctx, hf, biomes);
  root.add(terrain.group);
  lap('terrain', t);
  await tick();

  const sky = createSky(ctx, fork('sky'));
  root.add(sky.group);
  const water = createWater(ctx, hf);
  root.add(water.group);
  progress('草木を植えています', 0.5);

  const wind = { dir: new THREE.Vector2(0.8, 0.6).normalize(), strength: 0.5 };
  const world = {
    size: WORLD_SIZE, seaLevel: SEA_LEVEL, lakeLevel: LAKE_LEVEL,
    // 地形
    heightAt: hf.heightAt,
    normalAt(x, z, out = new THREE.Vector3()) {
      const hx = hf.heightAt(x + 1, z) - hf.heightAt(x - 1, z), hz = hf.heightAt(x, z + 1) - hf.heightAt(x, z - 1);
      return out.set(-hx, 2, -hz).normalize();
    },
    slopeAt: hf.slopeAt,
    groundAt: col.groundAt,
    waterLevelAt: hf.waterLevelAt,
    waterDepthAt: hf.waterDepthAt,
    regionAt: hf.regionAt,
    surfaceAt(x, z, y) {
      const pl = col.platformAt(x, z, y === undefined ? 1e9 : y);
      if (pl) return pl.surface;
      return hf.surfaceAt(x, z);
    },
    pathAt: hf.pathAt,
    // 衝突
    isBlocked: col.isBlocked, resolveCircle: col.resolveCircle, collidersNear: col.collidersNear,
    addCollider: col.addCollider, removeCollider: col.removeCollider,
    raycastGround: (o, d, m, out) => col.raycastGround(o, d, m, vecOut(out)),
    raycastSolid: (o, d, m, out) => col.raycastSolid(o, d, m, vecOut(out)),
    addPlatform: col.addPlatform, removePlatform: col.removePlatform,
    // 時間・光・風
    time: 7.0, timeScale: 1 / 60, phase: 'day', nightFactor: 0,
    sunDirection: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), skyColor: new THREE.Color(), groundColor: new THREE.Color(), fogColor: new THREE.Color(),
    wind,
    art, root,
    _debug: { timing, hf, terrain, sky, water, U },
  };
  function vecOut(out) {
    out = out || {};
    if (!out.point) out.point = new THREE.Vector3();
    if (!out.normal) out.normal = new THREE.Vector3();
    return out;
  }
  const env = { ctx, world, hf, biomes, col, art, palette, root, fork, seed, quality: 0, regionTex: tex.regionTex, tex, ready: false };

  // ── 草・木・岩 ──
  t = performance.now();
  const grass = createGrass(env);
  root.add(grass.group);
  const flora = createFlora(env);
  root.add(flora.group);
  lap('flora', t);
  await tick();

  // ── 粒子・生きもの ──
  const fx = createFx(env);
  root.add(fx.group);
  world.fx = fx.api;
  env.fx = fx; env.flora = flora;
  for (const l of flora.lamps) fx.glows.add({ x: l[0], y: l[1], z: l[2], size: 1.5, color: 0xffc46a, mode: 1, intensity: 0.85, flicker: 0.12 });
  const life = createLife(env);
  root.add(life.group);

  // ── 配置データ・しかけ・建造物 ──
  progress('遺跡を建てています', 0.7);
  t = performance.now();
  const sp = buildSpawnPoints(env);
  world.landmarks = sp.landmarks; world.landmarkList = sp.landmarkList; world.vistas = sp.vistas; world.spawnPoints = sp.spawnPoints;
  const props = createProps(env, sp);
  root.add(props.group);
  world.props = props.api;
  env.props = props;
  const landmarks = createLandmarks(env, sp);
  root.add(landmarks.group);
  lap('landmarks', t);
  await tick();

  const map = createMap(env, sp);
  world.drawMap = map.drawMap; world.worldToMap = map.worldToMap;

  // ── 時刻 ──
  const air = { tint: new THREE.Color(1, 1, 1), mul: 1 };
  const airW = { meadow: 1, forest: 0, canyon: 0, peaks: 0, lake: 0, coast: 0, sea: 0 };
  let auroraAmt = 0, lastPhase = null;
  const mirror = { on: false, x: 0, y: 24, z: -40, r: 205 };
  function applyTime() {
    const st = palette.apply(world.time, air);
    world.nightFactor = st.night;
    world.sunDirection.copy(st.lightDir);
    world.sunColor.copy(st.sun); world.skyColor.copy(st.sky); world.groundColor.copy(st.gnd); world.fogColor.copy(U.uFogCol.value);
    const ph = phaseOf(world.time);
    world.phase = ph;
    if (ph !== lastPhase) {
      const first = lastPhase === null;
      lastPhase = ph;
      if (!first) { try { ctx.events && ctx.events.emit('time:phase', { phase: ph, time: world.time }); } catch (e) { /* noop */ } }
    }
    return st;
  }
  world.setTimeOfDay = (h) => {
    world.time = ((+h % 24) + 24) % 24;
    applyTime();
  };

  const cam = new THREE.Vector3(), fwd = new THREE.Vector3();
  let lastX = 1e9, lastZ = 1e9, windT = 0, elapsed = 0;
  world.update = (dt, c2) => {
    const cx = c2 || ctx;
    dt = dt || 0;
    elapsed += dt;
    world.time = (world.time + dt * world.timeScale + 24) % 24;
    // 見る位置
    const camera = cx.camera;
    const e = camera.matrixWorld.elements;
    cam.set(e[12], e[13], e[14]);
    fwd.set(-e[8], -e[9], -e[10]);
    const pp = cx.player && cx.player.pos;
    const px = pp ? pp.x : cam.x, pz = pp ? pp.z : cam.z;
    const jump = Math.hypot(px - lastX, pz - lastZ) > 48;
    lastX = px; lastZ = pz;

    // 地域の空気（ゆっくり移る）
    const reg = hf.regionAt(px, pz);
    const k = jump ? 1 : Math.min(1, dt * 0.6);
    let tr = 0, tg = 0, tb = 0, tm = 0;
    for (const r in airW) {
      airW[r] += ((r === reg ? 1 : 0) - airW[r]) * k;
      const a = REGION_AIR[r];
      tr += a.tint.r * airW[r]; tg += a.tint.g * airW[r]; tb += a.tint.b * airW[r]; tm += a.mul * airW[r];
    }
    air.tint.setRGB(tr, tg, tb); air.mul = tm * (1 + 0.5 * env.quality * (env.quality > 1 ? 1 : 0));
    const st = applyTime();
    // オーロラ：夜、峰にいるほど強い
    const aT = st.night * (0.4 + 0.6 * airW.peaks);
    auroraAmt += (aT - auroraAmt) * (jump ? 1 : Math.min(1, dt * 0.5));
    U.uSkyP.value.z = auroraAmt;
    // 風
    windT += dt;
    const gust = 0.5 + 0.22 * Math.sin(windT * 0.13) + 0.14 * Math.sin(windT * 0.31 + 1.3);
    wind.strength = Math.min(1, Math.max(0.08, gust));
    const wa = 0.64 + Math.sin(windT * 0.021) * 0.5;
    wind.dir.set(Math.cos(wa), Math.sin(wa));
    U.uWind.value.set(wind.dir.x, wind.dir.y, wind.strength, U.uWind.value.w + dt * (0.6 + wind.strength));
    U.uTime.value = elapsed;
    U.uCloud.value.y += dt * wind.dir.x * 0.004; U.uCloud.value.z += dt * wind.dir.y * 0.004;

    // 映りこみの面（氷鏡の近くなら氷、そうでなければ湖）
    const dIce = Math.hypot(px - LM.ice_mirror.x, pz - LM.ice_mirror.z);
    if (dIce < 90) { mirror.x = LM.ice_mirror.x; mirror.z = LM.ice_mirror.z; mirror.y = ICE_LEVEL + 0.04; mirror.r = 34; mirror.on = true; }
    else { mirror.x = LAKE_C.x; mirror.z = LAKE_C.z; mirror.y = LAKE_LEVEL; mirror.r = 205; mirror.on = Math.hypot(px - LAKE_C.x, pz - LAKE_C.z) < 420; }

    terrain.update(px, pz, jump);
    sky.update(dt, st, mirror);
    const view = { cam, fwd, px, pz, dt, jump, st, reg, airW, elapsed, player: cx.player };
    grass.update(view);
    flora.update(view);
    fx.update(view);
    life.update(view);
    props.update(view);
    landmarks.update(view);
    if (elapsed > 0.5) env.ready = true;
  };
  world.setQuality = (level) => {
    env.quality = level | 0;
    grass.setQuality(env.quality); flora.setQuality(env.quality); life.setQuality(env.quality); fx.setQuality(env.quality);
  };
  try { ctx.events && ctx.events.on && ctx.events.on('perf:level', (p) => world.setQuality(p && p.level)); } catch (e) { /* noop */ }

  // 最初の状態
  const t0 = ctx.params && ctx.params.get && ctx.params.get('t');
  world.time = 7.0;
  if (t0 !== null && t0 !== undefined && t0 !== '' && Number.isFinite(+t0)) world.time = +t0;
  applyTime();
  terrain.update(sp.spawnPoints.player.x, sp.spawnPoints.player.z, true);
  timing.total = Math.round(performance.now() - T0);
  world.buildMs = timing.total;
  progress('できました', 1);
  return world;
}
