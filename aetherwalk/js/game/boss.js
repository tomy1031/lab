// js/game/boss.js — 凪の心臓 Stillheart (§5.5): guard stones → the still field (run in place 140 spm × 20 s) → exposed core 8 s (OPUS-B)
import * as THREE from 'three';
import { ENEMY_DEFS } from './enemies.data.js';
import { clamp, yawTo, angDiff, heightAt, fx, flash, emit, landmark, spawnList, DEG } from './util.js';

const STONE_HP = 10, GAUGE_GOAL = 20, EXPOSED_T = 8, RUN_SPM = 140;
const FX_GUST = { count: 1, speed: 2 };

export function createBoss(ctx, G) {
  const E = G.enemies;
  const def = ENEMY_DEFS.stillheart;
  const B = {
    active: false, phase: 0, gauge: 0, goal: GAUGE_GOAL, exposedT: 0, heart: null, defeated: false,
    stones: [], center: new THREE.Vector3(), hp: def.hp, maxHp: def.hp,
    update, despawn, reset: () => resetPhase(),
  };
  let model = null, beam = null, beamMat = null;
  let atkT = 4, summonT = 6, quakeT = 4, beamState = null, t = 0;
  const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const plateDirs = dodecaNormals();
  const plateOff = new Float32Array(12);        // how far each plate has flown off (0 = in place)
  const shapeHigh = { kind: 'high', y: 0 };
  const shapeLine = { kind: 'line', x0: 0, z0: 0, x1: 0, z1: 0, halfWidth: 0.32 };
  const ATK = def.attacks;

  function arenaPos() {
    const sp = spawnList(ctx, 'enemies').find((s) => s.type === 'stillheart');
    if (sp) return { x: sp.x, z: sp.z };
    const lm = landmark(ctx, 'isle');
    if (lm) return { x: lm.x, z: lm.z };
    return null;
  }

  function spawn() {
    const a = arenaPos();
    if (!a) return false;
    model = E.kit.build('stillheart');
    ctx.scene.add(model.root);
    if (!beam) {
      beamMat = new THREE.MeshBasicMaterial({ color: 0xe9d6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1).translate(0, 0, -0.5), beamMat);
      beam.visible = false;
      beam.frustumCulled = false;
      ctx.scene.add(beam);
    }
    const gy = heightAt(ctx, a.x, a.z);
    B.center.set(a.x, gy + def.center, a.z);
    const spheres = [{ c: B.center, r: 1.7, part: 'armor' }];
    B.heart = E.spawn('stillheart', a.x, a.z, { ctrl: CTRL, model, hp: B.hp, spheres, force: true, tag: 'boss', state: 'chase' });
    B.stones.length = 0;
    for (let i = 0; i < 3; i++) {
      const st = { i, hp: STONE_HP, alive: true, pos: new THREE.Vector3(), ang: (i / 3) * Math.PI * 2, target: null, sphere: null };
      st.sphere = { c: st.pos, r: 0.75, part: 'body' };
      B.stones.push(st);
    }
    B.active = true;
    setPhase(1, true);
    emit(ctx, 'ui:title', { text: '凪の心臓', sub: 'STILLHEART' });
    return true;
  }

  function addStoneTargets() {
    const T = ctx.targets;
    for (const st of B.stones) {
      if (!st.alive || st.target || !T || typeof T.add !== 'function') continue;
      try { st.target = T.add({ id: 'heartstone-' + st.i, kind: 'enemy', spheres: [st.sphere], owner: st, onHit: (h) => hitStone(st, h) }); } catch (e) { st.target = null; }
    }
  }
  function removeStoneTargets() {
    for (const st of B.stones) if (st.target) { try { ctx.targets.remove(st.target); } catch (e) { /* ignore */ } st.target = null; }
  }

  function hitStone(st, h) {
    if (!st.alive || B.phase !== 1) return { applied: 0, killed: false };
    const d = Math.max(0, +h.damage || 0);
    st.hp -= d;
    fx(ctx, 'spark', st.pos, { count: 10, color: 0xd9d4e6, speed: 3 });
    if (st.hp <= 0) {
      st.alive = false;
      if (st.target) { try { ctx.targets.remove(st.target); } catch (e) { /* ignore */ } st.target = null; }
      fx(ctx, 'poof', st.pos, { count: 30, color: 0xd9d4e6, speed: 2 });
      emit(ctx, 'boss:stone', { left: B.stones.filter((s) => s.alive).length });
      if (!B.stones.some((s) => s.alive)) setPhase(2);
      return { applied: d, killed: true };
    }
    return { applied: d, killed: false };
  }

  function setPhase(p, silent) {
    B.phase = p;
    t = 0;
    endBeam();
    if (p === 1) {
      for (const st of B.stones) { st.hp = STONE_HP; st.alive = true; }
      addStoneTargets();
      for (let i = 0; i < 12; i++) plateOff[i] = 0;
      atkT = 3; summonT = 5;
    } else if (p === 2) {
      removeStoneTargets();
      B.gauge = 0;
      quakeT = 3;
      for (let i = 0; i < 12; i++) plateOff[i] = 0;
      if (!silent) emit(ctx, 'ui:toast', { text: '凪の領域 — その場で駆け足！', sub: `STILL FIELD · ${RUN_SPM}+ spm で殻をはがす`, kind: 'quest', ms: 4500 });
    } else if (p === 3) {
      B.exposedT = EXPOSED_T;
      emit(ctx, 'ui:toast', { text: '芯が出た！ いまだ！', sub: 'CORE EXPOSED', kind: 'quest', ms: 3000 });
      flash(ctx, B.center, { color: 0xc23bff, size: 8, life: 0.6 });
    }
    emit(ctx, 'boss:phase', { phase: p, id: B.heart ? B.heart.id : 'stillheart' });
  }

  function resetPhase() {
    if (!B.active) return;
    setPhase(B.phase >= 2 ? 2 : 1, true);
    B.gauge = 0;
  }

  // ── the heart's own hit handling ──
  const CTRL = {
    onHit(e, h) {
      if (B.phase !== 3) {
        fx(ctx, 'spark', h.point || B.center, { count: 8, color: 0xd9d4e6, speed: 2 });
        return { applied: 0, killed: false, blocked: true };
      }
      const d = Math.max(0, +h.damage || 0);   // the core is not a weak point: normal multiplier (§5.5)
      B.hp = Math.max(0, B.hp - d);
      e.hp = B.hp;
      e.model.setHurt(true);
      hurtT = 0.12;
      fx(ctx, 'spark', h.point || B.center, { count: 12, color: 0xfffbe8, speed: 3 });
      if (B.hp <= 0) { defeat(h.itemId || 'player'); return { applied: d, killed: true }; }
      return { applied: d, killed: false };
    },
    update(e, dt) { /* driven from B.update */ },
    reset() { resetPhase(); },
  };
  let hurtT = 0;

  function defeat(by) {
    B.defeated = true;
    endBeam();
    removeStoneTargets();
    const pos = B.center.clone();
    fx(ctx, 'poof', pos, { count: 60, color: 0xfffbe8, speed: 4, life: 2.5 });
    fx(ctx, 'petal', pos, { count: 80, speed: 5, life: 4 });
    flash(ctx, pos, { color: 0xfffbe8, size: 30, life: 1.2 });
    const h = B.heart;
    if (h) {
      h.state = 'dead';
      emit(ctx, 'enemy:death', { id: h.id, type: 'stillheart', pos, by });
      if (h.target) { try { ctx.targets.remove(h.target); } catch (err) { /* ignore */ } h.target = null; }
      E.remove(h);
    }
    // the summoned wisps scatter
    for (const o of E.list.slice()) if (o.tag === 'boss') E.remove(o);
    despawnModel();
    B.active = false;
    emit(ctx, 'boss:defeated', {});
    G.quest && G.quest.onBossDefeated && G.quest.onBossDefeated();
  }

  function despawnModel() {
    if (model && model.root.parent) model.root.parent.remove(model.root);
    model = null;
    if (beam) beam.visible = false;
  }
  function despawn() {
    if (!B.active) return;
    endBeam();
    removeStoneTargets();
    for (const o of E.list.slice()) if (o.tag === 'boss') E.remove(o);
    if (B.heart) { E.remove(B.heart); B.heart = null; }
    despawnModel();
    B.active = false;
  }

  // ── attacks ──
  function startBeam(pl) {
    const a = ATK[0];
    const stand = pl.standHeight || 1.6;
    shapeHigh.y = pl.pos.y + stand * 0.8;
    const toP = yawTo(pl.pos.x - B.center.x, pl.pos.z - B.center.z);
    beamState = { t: 0, windup: a.windup, sweep: 2.4, yaw0: toP - 1.6, dir: 1, resolved: false, toP };
    E.telegraphShow(B, 'high', { x: B.center.x, y: shapeHigh.y, z: B.center.z, yaw: toP, reach: 22, dur: a.windup });
    model && model.setDanger(true);
    emit(ctx, 'enemy:telegraph', { id: B.heart.id, type: 'stillheart', attack: 'beam', kind: 'high', duration: a.windup, pos: B.center });
  }
  function endBeam() {
    beamState = null;
    if (beam) beam.visible = false;
    E.telegraphHide && E.telegraphHide(B);
    model && model.setDanger(false);
  }
  function beamTick(dt, pl) {
    const s = beamState;
    s.t += dt;
    if (s.t < s.windup) return;
    if (!s.started) { s.started = true; E.telegraphHide(B); emit(ctx, 'enemy:attack', { id: B.heart.id, type: 'stillheart', attack: 'beam' }); }
    const k = (s.t - s.windup) / s.sweep;
    const yaw = s.yaw0 + 3.2 * k;
    if (beam) {
      beam.visible = true;
      beam.position.set(B.center.x, shapeHigh.y, B.center.z);
      beam.rotation.set(0, -yaw, 0);
      beam.scale.set(1.4, 1.4, 24);
    }
    if (!s.resolved) {
      const toNow = yawTo(pl.pos.x - B.center.x, pl.pos.z - B.center.z);
      if (angDiff(yaw, toNow) <= 0) {
        s.resolved = true;
        E.resolveAttack(B.heart, shapeHigh, ATK[0], B.center, { inReach: Math.hypot(pl.pos.x - B.center.x, pl.pos.z - B.center.z) < 24 });
      }
    }
    if (k >= 1) { endBeam(); atkT = ATK[0].cooldown + 1.5; }
  }

  let quake = null;
  function startQuake(pl) {
    const a = ATK[1];
    const toP = yawTo(pl.pos.x - B.center.x, pl.pos.z - B.center.z);
    const ux = Math.sin(toP), uz = -Math.cos(toP);
    const x0 = B.center.x + ux * 2, z0 = B.center.z + uz * 2;
    Object.assign(shapeLine, { x0, z0, x1: x0 + ux * (a.length || 16), z1: z0 + uz * (a.length || 16) });
    quake = { t: 0, windup: a.windup };
    E.telegraphShow(quakeOwner, 'line', { ...shapeLine, dur: a.windup });
    emit(ctx, 'enemy:telegraph', { id: B.heart.id, type: 'stillheart', attack: 'quake', kind: 'line', duration: a.windup, pos: B.center });
  }
  const quakeOwner = { id: 'heart-quake' };
  function quakeTick(dt) {
    quake.t += dt;
    if (quake.t >= quake.windup) {
      E.telegraphHide(quakeOwner);
      emit(ctx, 'enemy:attack', { id: B.heart.id, type: 'stillheart', attack: 'quake' });
      E.resolveAttack(B.heart, shapeLine, ATK[1], B.center, {});
      _v.set((shapeLine.x0 + shapeLine.x1) / 2, 0, (shapeLine.z0 + shapeLine.z1) / 2);
      _v.y = heightAt(ctx, _v.x, _v.z);
      fx(ctx, 'ring', _v, { color: 0xd9d4e6, size: 4 });
      fx(ctx, 'dust', _v, { count: 24, speed: 3 });
      quake = null;
    }
  }

  // ── per frame ──
  function update(dt) {
    if (dt <= 0) return;
    const pl = ctx.player;
    if (!pl || !pl.pos) return;
    const stage = G.quest ? G.quest.stage : 0;
    const a = B.active ? null : arenaPos();
    if (!B.active) {
      if (B.defeated || stage < 4 || !a) return;
      const d = Math.hypot(pl.pos.x - a.x, pl.pos.z - a.z);
      if (d < 38) {
        if (stage === 4 && G.quest) G.quest.setStage(5);
        spawn();
      }
      return;
    }
    const d = Math.hypot(pl.pos.x - B.center.x, pl.pos.z - B.center.z);
    if (d > 120) { despawn(); return; }
    t += dt;
    if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0 && model) model.setHurt(false); }
    if (G.vitals && G.vitals.dead) { endBeam(); quake = null; E.telegraphHide(quakeOwner); animate(dt); return; }

    if (B.phase === 1) {
      if (beamState) beamTick(dt, pl);
      else if ((atkT -= dt) <= 0 && d < 30) startBeam(pl);
      if ((summonT -= dt) <= 0) {
        summonT = 12;
        let wisps = 0;
        for (const o of E.list) if (o.tag === 'boss' && o.type === 'wisp' && o.state !== 'dead') wisps++;
        if (wisps < 2) {
          const ang = Math.random() * Math.PI * 2;
          E.spawn('wisp', B.center.x + Math.cos(ang) * 6, B.center.z + Math.sin(ang) * 6, { tag: 'boss', state: 'chase', force: true });
          fx(ctx, 'poof', B.center, { count: 12, color: 0xc23bff, speed: 2 });
        }
      }
    } else if (B.phase === 2) {
      // run in place: cadence ≥ 140 spm fills the gauge
      if ((pl.cadence || 0) >= RUN_SPM && (pl.moving || pl.gait === 'sprint' || pl.gait === 'jog')) {
        B.gauge = Math.min(GAUGE_GOAL, B.gauge + dt);
        if ((Math.floor(t * 4) % 2) === 0) fx(ctx, 'gust', _v.copy(pl.pos).setY(pl.pos.y + 1), FX_GUST);
      }
      for (let i = 0; i < 12; i++) plateOff[i] = (B.gauge / GAUGE_GOAL) * 0.35 * (0.6 + ((i * 7) % 5) / 10);
      if (quake) quakeTick(dt);
      else if ((quakeT -= dt) <= 0) { quakeT = 4 - ATK[1].windup; startQuake(pl); }
      if (B.gauge >= GAUGE_GOAL) {
        if (quake) { E.telegraphHide(quakeOwner); quake = null; }
        setPhase(3);
      }
    } else if (B.phase === 3) {
      B.exposedT -= dt;
      for (let i = 0; i < 12; i++) plateOff[i] = Math.min(6, plateOff[i] + dt * 8);
      if (B.exposedT <= 0) setPhase(2);
    }
    animate(dt);
  }

  function animate(dt) {
    if (!model) return;
    const gy = heightAt(ctx, B.center.x, B.center.z);
    const bob = Math.sin(t * 1.3) * 0.25;
    // the exposed core sinks to sword height; otherwise it floats above the arena
    const want = B.phase === 3 ? 1.6 : def.center;
    B.lift = B.lift == null ? want : B.lift + (want - B.lift) * Math.min(1, dt * 3);
    B.center.y = gy + B.lift + bob * (B.phase === 3 ? 0.3 : 1);
    model.root.position.set(B.center.x, B.center.y, B.center.z);
    model.spin.rotation.y += dt * (B.phase === 3 ? 1.2 : 0.3);
    const still = B.phase === 2;
    const pulse = 1 + Math.sin(t * (still ? 3 : 1.6)) * (still ? 0.06 : 0.03);
    if (model.core) model.core.scale.setScalar(pulse * (B.phase === 3 ? 1.15 : 1));
    // shell plates on the 12 dodecahedron faces
    if (model.plates) {
      for (let i = 0; i < 12; i++) {
        const n = plateDirs[i];
        const r = 1.55 + plateOff[i];
        _v.copy(n).multiplyScalar(r);
        _q.setFromUnitVectors(Z_AXIS, n);
        const s = B.phase === 3 ? Math.max(0.01, 1 - plateOff[i] / 6) : 1;
        _s.setScalar(s);
        _m.compose(_v, _q, _s);
        model.plates.setMatrixAt(i, _m);
      }
      model.plates.instanceMatrix.needsUpdate = true;
    }
    // guard stones orbit (world space; the stones mesh sits on the root, so subtract)
    if (model.stones) {
      let n = 0;
      for (const st of B.stones) {
        st.ang += dt * 0.55;
        const R = 5.2;
        st.pos.set(B.center.x + Math.cos(st.ang) * R, B.center.y - 1.0 + Math.sin(t * 2 + st.i) * 0.3, B.center.z + Math.sin(st.ang) * R);
        if (!st.alive) continue;
        _v.subVectors(st.pos, B.center);
        _e.set(t * 0.7 + st.i, t * 0.9, 0);
        _q.setFromEuler(_e);
        _s.setScalar(st.hp < STONE_HP ? 0.85 + 0.15 * st.hp / STONE_HP : 1);
        _m.compose(_v, _q, _s);
        model.stones.setMatrixAt(n++, _m);
      }
      model.stones.count = n;
      model.stones.instanceMatrix.needsUpdate = true;
    }
    if (model.glow) model.glow.scale.setScalar(B.phase === 3 ? 1.4 : still ? 0.7 : 1);
  }

  ctx.events?.on?.('player:respawn', () => { if (B.active) { endBeam(); quake = null; E.telegraphHide(quakeOwner); resetPhase(); } });
  return B;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
function dodecaNormals() {
  // face centers of a dodecahedron = vertices of an icosahedron
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position, out = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    if (!out.some((o) => o.distanceTo(v) < 0.01)) out.push(v);
  }
  return out.slice(0, 12);
}
