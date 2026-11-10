// js/game/seeds.js — 風の種: race rings, sleeping bells, pinwheel flowers (§8.4). 4 seeds = one tailwind tier. (OPUS-B)
import * as THREE from 'three';
import { heightAt, fx, flash, emit, toast, spawnList, findProp, propsOf, setPropState, anchorOf, playerPos } from './util.js';

const TOTAL = 24;

export function createSeeds(ctx, G) {
  const seeds = [];
  const root = new THREE.Group();
  root.name = 'game:seeds';
  ctx.scene && ctx.scene.add(root);
  const _p = new THREE.Vector3(), _a = new THREE.Vector3();
  let race = null, tickT = 0;
  // fallback race rings when the world has no racering props (5 torus meshes, shown only during a race)
  let ringKit = null;
  function rings() {
    if (ringKit) return ringKit;
    const art = ctx.art || (ctx.world && ctx.world.art);
    let mat = null;
    try { mat = art && art.basic ? art.basic({ color: 0x7fe9ff, transparent: true, additive: true }) : null; } catch (e) { mat = null; }
    if (!mat) mat = new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const geo = new THREE.TorusGeometry(1.6, 0.08, 6, 24);
    ringKit = [];
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; root.add(m); ringKit.push(m); }
    return ringKit;
  }

  const SD = {
    seeds, TOTAL,
    get race() { return race; },
    load() {
      seeds.length = 0;
      for (const sp of spawnList(ctx, 'seeds')) {
        const kind = sp.type === 'race' ? 'racering' : sp.type === 'bell' ? 'sleepbell' : 'pinwheel';
        const s = { id: sp.id, type: sp.type, x: sp.x, z: sp.z, y: sp.y ?? heightAt(ctx, sp.x, sp.z), region: sp.region,
          sp, prop: null, ringProps: [], target: null, center: new THREE.Vector3(), spinT: 0, found: false };
        if (sp.type === 'race') {
          s.prop = findProp(ctx, 'racering', sp.id, sp.x, sp.z, 4);
          s.rings = (sp.rings || []).map((r) => (Array.isArray(r) ? { x: r[0], z: r[1] } : r));
          for (const r of s.rings) s.ringProps.push(findProp(ctx, 'racering', null, r.x, r.z, 5));
        } else s.prop = findProp(ctx, kind, sp.id, sp.x, sp.z, 6);
        anchorOf(s.prop, 'center', s.center);
        if (!s.prop || !s.prop.anchors || !s.prop.anchors.center) {
          const gy = heightAt(ctx, sp.x, sp.z);
          if (sp.type === 'bell') s.center.set(sp.x, Number.isFinite(sp.y) && sp.y > gy + 1 ? sp.y : gy + (sp.dy || 3), sp.z);
          else s.center.set(sp.x, gy + 1, sp.z);
        }
        if (sp.type === 'bell') {
          const T = ctx.targets;
          if (T && typeof T.add === 'function') {
            try { s.target = T.add({ id: 'sleepbell:' + s.id, kind: 'prop', spheres: [{ c: s.center, r: 0.45, part: 'body' }], owner: s, onHit: () => { ringBell(s); return { applied: 0, killed: false }; } }); } catch (e) { s.target = null; }
          }
        }
        seeds.push(s);
      }
    },
    markFound(ids) {
      for (const s of seeds) if (ids.includes(s.id)) {
        s.found = true;
        if (s.type === 'bell') setPropState(s.prop, 'rung', true);
        if (s.type === 'pinwheel') setPropState(s.prop, 'bloomed', true);
      }
    },
    give(s) { found(s); },
    update,
  };

  function found(s) {
    if (!s || s.found || G.quest.seeds.includes(s.id)) return;
    s.found = true;
    G.quest.seeds.push(s.id);
    G.inventory.add('aetherseed', 1, { silent: true });
    const count = G.quest.seeds.length;
    fx(ctx, 'shard', s.center, { count: 30, color: 0x7fe9ff, speed: 3 });
    flash(ctx, s.center, { color: 0x7fe9ff, size: 4, life: 0.6 });
    emit(ctx, 'seed:found', { id: s.id, type: s.type, count, total: TOTAL });
    const tierUp = count % 4 === 0;
    toast(ctx, `風の種 ${count} / ${TOTAL}`, tierUp ? `AETHER SEED · 追い風の上限 +10・持てる数 +2` : 'AETHER SEED', 'item', tierUp ? 5000 : 3000);
    G.vitals.refreshCaps();
    G.requestSave && G.requestSave(true);
  }

  function ringBell(s) {
    if (s.found) { fx(ctx, 'spark', s.center, { count: 4, color: 0xffd76a }); return; }
    setPropState(s.prop, 'rung', true);
    emit(ctx, 'bell:ring', { id: s.id, strong: true, pos: s.center });
    found(s);
  }

  function startRace(s) {
    const list = s.rings || [];
    if (!list.length) return;
    race = { s, i: 0, t: 0, limit: s.sp.timeLimit || 40, pts: list.map((r) => new THREE.Vector3(r.x, heightAt(ctx, r.x, r.z), r.z)) };
    for (let i = 0; i < race.pts.length; i++) {
      const pr = s.ringProps[i];
      if (pr) { setPropState(pr, 'visible', true); setPropState(pr, 'passed', false); }
    }
    if (s.ringProps.every((p) => !p)) {
      const R = rings();
      for (let i = 0; i < 5; i++) {
        const m = R[i], p = race.pts[i];
        if (!p) { m.visible = false; continue; }
        m.visible = true;
        m.position.set(p.x, p.y + 1.7, p.z);
        const nx = race.pts[i + 1] || p, px = race.pts[i - 1] || p;
        m.rotation.set(0, Math.atan2(nx.x - px.x, nx.z - px.z), 0);
      }
    }
    emit(ctx, 'race:start', { id: s.id, rings: race.pts.length, limit: race.limit });
    toast(ctx, '走り輪！ 光の輪をすべて走り抜けよう', `RACE · ${Math.round(race.limit)} 秒`, 'quest', 3500);
  }
  function endRace(ok) {
    const r = race;
    race = null;
    if (!r) return;
    for (const pr of r.s.ringProps) if (pr) { setPropState(pr, 'visible', false); }
    if (ringKit) for (const m of ringKit) m.visible = false;
    if (ok) found(r.s);
    else toast(ctx, '時間切れ — 輪はまた現れる', 'TIME UP', 'info', 3000);
    r.s.cool = 3;
  }

  function update(dt) {
    if (dt <= 0) return;
    playerPos(ctx, _p);
    const pl = ctx.player;
    if (race) {
      race.t += dt;
      const p = race.pts[race.i];
      if (p && Math.hypot(_p.x - p.x, _p.z - p.z) < 2.6) {
        const pr = race.s.ringProps[race.i];
        if (pr) setPropState(pr, 'passed', true);
        if (ringKit && ringKit[race.i]) ringKit[race.i].visible = false;
        fx(ctx, 'gust', _a.copy(p).setY(p.y + 1.5), { count: 10, speed: 3 });
        emit(ctx, 'race:ring', { id: race.s.id, i: race.i, of: race.pts.length });
        race.i++;
        if (race.i >= race.pts.length) { endRace(true); return; }
      }
      emit(ctx, 'shrine:progress', { id: race.s.id, value: race.i, goal: race.pts.length, timeLeft: Math.max(0, race.limit - race.t) });
      if (race.t > race.limit) endRace(false);
      return;
    }
    tickT -= dt;
    if (tickT > 0) return;
    tickT = 0.1;
    const fast = pl && pl.speed >= 5;
    for (const s of seeds) {
      if (s.found) continue;
      const d = Math.hypot(_p.x - s.x, _p.z - s.z);
      if (d > 30) continue;
      if (s.cool > 0) { s.cool -= 0.1; continue; }
      if (s.type === 'race' && d < 2.0) startRace(s);
      else if (s.type === 'pinwheel') {
        // the fan's gust or running past at 5 m/s spins the flower
        let wind = false;
        const Z = ctx.zones;
        if (Z && typeof Z.any === 'function') { try { wind = !!Z.any('wind', s.center, 1.2); } catch (e) { wind = false; } }
        if (wind || (fast && d < 2.2)) {
          s.spinT += wind ? 0.5 : 0.35;
          setPropState(s.prop, 'spin', Math.min(1, s.spinT));
          if (s.spinT >= 1) { setPropState(s.prop, 'bloomed', true); found(s); }
        } else if (s.spinT > 0) {
          s.spinT = Math.max(0, s.spinT - 0.02);
          setPropState(s.prop, 'spin', s.spinT);
        }
      }
    }
  }

  ctx.events?.on?.('gust', (g) => {
    if (!g || !g.pos) return;
    for (const s of seeds) {
      if (s.found || s.type !== 'pinwheel') continue;
      if (s.center.distanceTo(g.pos) < (g.radius || 6)) {
        s.spinT += 0.6;
        setPropState(s.prop, 'spin', Math.min(1, s.spinT));
        if (s.spinT >= 1) { setPropState(s.prop, 'bloomed', true); found(s); }
      }
    }
  });
  ctx.events?.on?.('player:death', () => { if (race) endRace(false); });
  return SD;
}
