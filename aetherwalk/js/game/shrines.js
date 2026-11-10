// js/game/shrines.js — 祠: short exercise challenges (§8.3). Enter the ring to start; retry as often as you like. (OPUS-B)
import * as THREE from 'three';
import { heightAt, fx, flash, emit, toast, spawnList, findProp, setPropState, anchorOf, playerPos, headPos, clamp, yawTo, landmark } from './util.js';
import { COLORS } from './enemyModels.js';

export const SHRINE_INFO = {
  sprint:  { name: '疾走の祠', en: 'Shrine of the Dash', how: '150 spm 以上で走って燭台を灯そう（合計 40 秒）', goalText: '40 秒' },
  torch:   { name: '灯しの祠', en: 'Shrine of the Carried Flame', how: '祠の火を松明に移し、遠くの燭台まで運ぼう（45 秒）', goalText: '点火' },
  dodge:   { name: '身かわしの祠', en: 'Shrine of the Evading Step', how: '高い梁はしゃがむ、縦の梁は横へ1歩（16 本中 13 本）', goalText: '13/16' },
  blade:   { name: '剣舞の祠', en: 'Shrine of the Blade Dance', how: '矢印の向きに 3 m/s 以上で斬ろう（60 秒で 20 個）', goalText: '20 個' },
  archery: { name: '射手の祠', en: "Shrine of the Archer", how: '海の岩の上の的を射よう（矢 20 本で 6 つ）', goalText: '6 つ' },
};
const TYPE_BY_ID = { shrine_meadow: 'sprint', shrine_forest: 'torch', shrine_canyon: 'dodge', shrine_peaks: 'blade', shrine_coast: 'archery' };

export function createShrines(ctx, G) {
  const shrines = [];
  const root = new THREE.Group();
  root.name = 'game:shrines';
  ctx.scene && ctx.scene.add(root);
  const _p = new THREE.Vector3(), _h = new THREE.Vector3(), _a = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
  let active = null;
  const _zones = [];

  // ── visual kit (created on first use) ──
  let vis = null;
  function kit() {
    if (vis) return vis;
    const art = ctx.art || (ctx.world && ctx.world.art);
    const danger = new THREE.MeshBasicMaterial({ color: COLORS.danger, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
    const beamH = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.07, 0.07), danger);
    const beamV = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.6, 0.09).translate(0, 1.3, 0), danger);
    const tex = (draw) => {
      if (art && typeof art.canvasTexture === 'function') { try { return art.canvasTexture(256, 256, draw); } catch (e) { /* fall through */ } }
      const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const arrowTex = tex((g) => {
      g.clearRect(0, 0, 256, 256);
      g.strokeStyle = '#7fe9ff'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(27,36,64,0.55)'; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd76a';
      g.beginPath(); g.moveTo(222, 128); g.lineTo(150, 72); g.lineTo(150, 108); g.lineTo(40, 108); g.lineTo(40, 148); g.lineTo(150, 148); g.lineTo(150, 184); g.closePath(); g.fill();
    });
    const boardTex = tex((g) => {
      g.clearRect(0, 0, 256, 256);
      const rings = ['#fffbe8', '#7fe9ff', '#fffbe8', '#ffd76a'];
      for (let i = 0; i < 4; i++) { g.fillStyle = rings[i]; g.beginPath(); g.arc(128, 128, 124 - i * 30, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#1b2440'; g.beginPath(); g.arc(128, 128, 10, 0, Math.PI * 2); g.fill();
    });
    const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const blades = [0, 1].map(() => new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), arrowMat));
    const boards = new THREE.InstancedMesh(new THREE.CircleGeometry(0.8, 20), boardMat, 8);
    boards.frustumCulled = false; boards.count = 0;
    for (const m of [beamH, beamV, ...blades]) { m.visible = false; m.frustumCulled = false; root.add(m); }
    root.add(boards);
    vis = { beamH, beamV, blades, boards };
    return vis;
  }

  const S = {
    shrines,
    get active() { return active; },
    info: SHRINE_INFO,
    load() {
      shrines.length = 0;
      for (const sp of spawnList(ctx, 'shrines')) {
        const type = sp.type || TYPE_BY_ID[sp.id] || 'sprint';
        const prop = findProp(ctx, 'shrine', sp.id, sp.x, sp.z, 10);
        const center = new THREE.Vector3();
        anchorOf(prop, 'center', center);
        if (!prop || !prop.anchors || !prop.anchors.center) center.set(sp.x, heightAt(ctx, sp.x, sp.z), sp.z);
        const sh = { id: sp.id, type, x: center.x, z: center.z, center, region: sp.region, extra: sp.extra || {}, prop,
          info: SHRINE_INFO[type], needExit: false, fireZone: null, firePos: new THREE.Vector3(), braziers: [], goal: null, firstRun: true };
        if (type === 'torch') {
          if (prop && prop.anchors && prop.anchors.fire) sh.firePos.copy(prop.anchors.fire);
          else sh.firePos.copy(center).setY(center.y + 0.9);
          const Z = ctx.zones;
          if (Z && typeof Z.add === 'function') { try { sh.fireZone = Z.add({ kind: 'fire', pos: sh.firePos, r: 0.45, owner: 'shrine:' + sh.id }); } catch (e) { /* ignore */ } }
        }
        shrines.push(sh);
      }
      // reserve the braziers each shrine drives
      const B = G.checkpoints ? G.checkpoints.braziers : [];
      for (const sh of shrines) {
        if (sh.type === 'sprint') {
          sh.braziers = B.filter((b) => Math.hypot(b.x - sh.x, b.z - sh.z) < 30)
            .sort((a, b) => yawTo(a.x - sh.x, a.z - sh.z) - yawTo(b.x - sh.x, b.z - sh.z)).slice(0, 6);
          for (const b of sh.braziers) b.reserved = true;
        } else if (sh.type === 'torch') {
          const ex = sh.extra || {};
          let goal = null;
          if (ex.brazier) goal = B.find((b) => b.id === ex.brazier) || null;
          const tx = ex.target ? ex.target.x : ex.x, tz = ex.target ? ex.target.z : ex.z;
          if (!goal && Number.isFinite(tx)) {
            let bd = 15;
            for (const b of B) { const d = Math.hypot(b.x - tx, b.z - tz); if (d < bd) { bd = d; goal = b; } }
            if (!goal) sh.goalPoint = new THREE.Vector3(tx, heightAt(ctx, tx, tz) + 1.0, tz);
          }
          if (!goal && !sh.goalPoint) {   // the farthest brazier within 200 m
            let bd = 40;
            for (const b of B) { const d = Math.hypot(b.x - sh.x, b.z - sh.z); if (d > bd && d < 200) { bd = d; goal = b; } }
          }
          if (goal) { goal.reserved = true; sh.goal = goal; }
        }
      }
    },
    byId(id) { return shrines.find((s) => s.id === id) || null; },
    start(id) { const sh = S.byId(id); if (sh && !active) begin(sh); },
    cancel() { if (active) fail(active, true); },
    update,
  };

  function begin(sh) {
    playerPos(ctx, _p);
    const info = sh.info;
    if (sh.type === 'archery' && !G.inventory.has('bow')) {
      toast(ctx, '弓が要る', 'YOU NEED A BOW', 'warn', 3000); sh.needExit = true; return;
    }
    if (sh.type === 'blade' && !G.inventory.has('sword') && !G.inventory.has('spear')) {
      toast(ctx, '剣か槍が要る', 'YOU NEED A BLADE', 'warn', 3000); sh.needExit = true; return;
    }
    active = sh;
    sh.needExit = true;
    sh.run = { t: 0, sent: -1 };
    setPropState(sh.prop, 'mode', 'active');
    const R = sh.run;
    if (sh.type === 'sprint') { R.acc = 0; R.goal = 40; R.limit = 90; R.lit = 0; for (const b of sh.braziers) G.checkpoints.douseBrazier(b); }
    if (sh.type === 'torch') { R.limit = 45; if (sh.goal) G.checkpoints.douseBrazier(sh.goal); }
    if (sh.type === 'dodge') {
      R.total = 16; R.done = 0; R.dodged = 0; R.nextT = 2.0; R.beam = null;
      R.kinds = []; for (let i = 0; i < 16; i++) R.kinds.push(i % 2 ? 'high' : 'line');
      for (let i = R.kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [R.kinds[i], R.kinds[j]] = [R.kinds[j], R.kinds[i]]; }
      R.shapeHigh = { kind: 'high', y: 0 }; R.shapeLine = { kind: 'line', x0: 0, z0: 0, x1: 0, z1: 0, halfWidth: 0.32 };
    }
    if (sh.type === 'blade') { R.limit = 60; R.total = 24; R.spawned = 0; R.hits = 0; R.goal = 20; R.slots = [null, null]; R.gap = 0.6; }
    if (sh.type === 'archery') { setupArchery(sh); }
    emit(ctx, 'shrine:start', { id: sh.id, type: sh.type });
    emit(ctx, 'ui:title', { text: info.name, sub: info.en.toUpperCase() });
    toast(ctx, info.how, 'CHALLENGE', 'quest', 5000);
    flash(ctx, sh.center, { color: 0x7fe9ff, size: 5, life: 0.6 });
  }

  function complete(sh, record, better) {
    const first = !(G.quest.shrines[sh.id] && G.quest.shrines[sh.id].done);
    const prev = G.quest.shrines[sh.id] ? G.quest.shrines[sh.id].record : null;
    const improved = prev == null ? false : better(record, prev);
    G.quest.shrines[sh.id] = { done: true, record: prev == null || improved ? record : prev };
    setPropState(sh.prop, 'mode', 'done');
    if (first) {
      const got = G.inventory.add('pearl', 1);
      G.inventory.add('honeycomb', 1);
      toast(ctx, got ? '息吹の珠と風蜜を授かった — ハートが 1 つ増えた' : '風蜜を授かった', 'BREATH PEARL · +1 HEART', 'item', 5000);
    } else if (improved) {
      G.inventory.add('shard', 20);
      toast(ctx, '記録更新！ 光のかけら ×20', 'NEW RECORD', 'item', 4000);
    }
    emit(ctx, 'shrine:complete', { id: sh.id, type: sh.type, record, first });
    emit(ctx, 'ui:title', { text: '祠の試し — 合格', sub: 'TRIAL COMPLETE' });
    fx(ctx, 'shard', _a.copy(sh.center).setY(sh.center.y + 1.5), { count: 40, color: 0xffd76a, speed: 3 });
    G.vitals.heal(4);
    finish(sh);
    G.requestSave && G.requestSave(true);
  }
  function fail(sh, quiet) {
    emit(ctx, 'shrine:fail', { id: sh.id });
    if (!quiet) toast(ctx, 'もう一度挑めます — 輪に入りなおそう', 'TRY AGAIN ANYTIME', 'info', 3500);
    setPropState(sh.prop, 'mode', G.quest.shrines[sh.id] && G.quest.shrines[sh.id].done ? 'done' : 'idle');
    finish(sh);
  }
  function finish(sh) {
    const R = sh.run || {};
    if (vis) { vis.beamH.visible = vis.beamV.visible = false; for (const b of vis.blades) b.visible = false; vis.boards.count = 0; }
    if (R.beam) { G.enemies.telegraphHide(R.beam); R.beam = null; }
    if (R.slots) for (const s of R.slots) if (s) dropBladeTarget(s);
    if (R.boards) for (const b of R.boards) removeTarget(b);
    if (sh.type === 'archery' && R.lent > 0) {
      const back = Math.min(R.lent, G.inventory.count('arrow'));
      if (back > 0) G.inventory.remove('arrow', back);
    }
    if (sh.type === 'sprint') setTimeout(() => { if (active !== sh) for (const b of sh.braziers) G.checkpoints.douseBrazier(b); }, 8000);
    sh.run = null;
    if (active === sh) active = null;
  }
  function removeTarget(o) {
    if (o && o.target && ctx.targets) { try { ctx.targets.remove(o.target); } catch (e) { /* ignore */ } o.target = null; }
  }

  // ── per type ──
  function tickSprint(sh, dt) {
    const R = sh.run, pl = ctx.player;
    R.t += dt;
    const running = pl && (pl.cadence || 0) >= 150 && (pl.moving || pl.gait === 'sprint');
    if (running) R.acc += dt;
    const per = R.goal / 6;
    const want = Math.min(6, Math.floor(R.acc / per));
    while (R.lit < want) {
      const b = sh.braziers[R.lit];
      if (b) G.checkpoints.lightBrazier(b);
      else {
        const a = (R.lit / 6) * Math.PI * 2;
        _a.set(sh.x + Math.cos(a) * 5, sh.center.y + 1.2, sh.z + Math.sin(a) * 5);
        flash(ctx, _a, { color: 0xffb347, size: 2, life: 0.6 });
      }
      emit(ctx, 'shrine:beat', { id: sh.id, n: R.lit + 1 });
      R.lit++;
    }
    // unlit fallback braziers flicker while you run
    if (!sh.braziers.length && running && Math.random() < dt * 6) {
      const k = Math.floor(Math.random() * Math.max(1, R.lit));
      const a = (k / 6) * Math.PI * 2;
      fx(ctx, 'ember', _a.set(sh.x + Math.cos(a) * 5, sh.center.y + 1.2, sh.z + Math.sin(a) * 5), { count: 2 });
    }
    progress(sh, R.acc, R.goal, R.limit - R.t);
    if (R.acc >= R.goal) complete(sh, Math.round(R.t * 10) / 10, (a, b) => a < b);
    else if (R.t >= R.limit) fail(sh);
  }

  function tickTorch(sh, dt) {
    const R = sh.run;
    R.t += dt;
    progress(sh, Math.round(R.t), R.limit, R.limit - R.t);
    // the goal brazier catches the flame
    const gp = sh.goal ? anchorOf(sh.goal.prop, 'fire', _a) : sh.goalPoint;
    if (gp) {
      const Z = ctx.zones;
      let lit = false;
      if (Z && typeof Z.query === 'function') {
        _zones.length = 0;
        try { Z.query('fire', gp, 0.55, _zones); } catch (e) { /* ignore */ }
        for (const z of _zones) if (z.owner !== 'game' && z.owner !== 'shrine:' + sh.id) { lit = true; break; }
      }
      if (lit) {
        if (sh.goal) G.checkpoints.lightBrazier(sh.goal);
        complete(sh, Math.round(R.t * 10) / 10, (a, b) => a < b);
        return;
      }
    }
    if (R.t >= R.limit) {
      // the shrine's flame only lives 45 s here: put the carried torch out
      for (const hand of ['left', 'right']) {
        const inst = ctx.items && ctx.items.held && ctx.items.held[hand];
        if (inst && inst.id === 'torch' && inst.state && inst.state.lit) { inst.state.lit = false; inst.state.litTime = 0; }
      }
      toast(ctx, '火が消えてしまった', 'THE FLAME WENT OUT', 'warn', 3000);
      fail(sh);
    }
  }

  function tickDodge(sh, dt) {
    const R = sh.run, pl = ctx.player;
    const K = kit();
    R.t += dt;
    if (!R.beam && R.done < R.total) {
      R.nextT -= dt;
      if (R.nextT <= 0) {
        // a beam of light flows toward you from the shrine side you face
        const kind = R.kinds[R.done];
        const yaw = pl && Number.isFinite(pl.yaw) ? pl.yaw : 0;
        const fx_ = Math.sin(yaw), fz = -Math.cos(yaw);
        const D = 9;
        R.beam = { kind, t: 0, T: kind === 'high' ? 2.0 : 1.8, px: pl.pos.x, pz: pl.pos.z, ox: pl.pos.x + fx_ * D, oz: pl.pos.z + fz * D, dx: -fx_, dz: -fz, yaw, resolved: false, owner: {} };
        const stand = pl.standHeight || 1.6;
        if (kind === 'high') {
          R.shapeHigh.y = pl.pos.y + stand * 0.8;
        } else {
          // the vertical beam slides along a line through where you stand now
          Object.assign(R.shapeLine, { x0: R.beam.ox, z0: R.beam.oz, x1: pl.pos.x - fx_ * 2, z1: pl.pos.z - fz * 2 });
          G.enemies.telegraphShow(R.beam.owner, 'line', { ...R.shapeLine, dur: R.beam.T });
        }
        emit(ctx, 'enemy:telegraph', { id: sh.id, type: 'shrine', attack: kind === 'high' ? 'beamH' : 'beamV', kind, duration: R.beam.T, pos: _a.set(R.beam.ox, pl.pos.y, R.beam.oz) });
      }
    }
    const B = R.beam;
    if (B) {
      B.t += dt;
      const k = clamp(B.t / B.T, 0, 1.2);
      const D = 9 * k;
      const x = B.ox + B.dx * D, z = B.oz + B.dz * D;
      const stand = pl.standHeight || 1.6;
      if (B.kind === 'high') {
        K.beamH.visible = true;
        K.beamH.position.set(x, pl.pos.y + stand * 0.8, z);
        K.beamH.rotation.set(0, -B.yaw, 0);
      } else {
        K.beamV.visible = true;
        K.beamV.position.set(x, heightAt(ctx, x, z), z);
      }
      if (!B.resolved && k >= 1) {
        B.resolved = true;
        const shape = B.kind === 'high' ? R.shapeHigh : R.shapeLine;
        const hit = G.enemies.hitTestPlayer(shape);
        R.done++;
        if (!hit) { R.dodged++; emit(ctx, 'player:dodge', { kind: B.kind === 'high' ? 'duck' : 'side', enemyId: null, attack: 'shrine' }); }
        else emit(ctx, 'shrine:miss', { id: sh.id });
        G.enemies.telegraphHide(B.owner);
      }
      if (k >= 1.2) {
        K.beamH.visible = K.beamV.visible = false;
        R.beam = null;
        R.nextT = 0.6;
      }
    }
    progress(sh, R.dodged, 13, R.total - R.done);
    if (R.done >= R.total && !R.beam) {
      if (R.dodged >= 13) complete(sh, R.dodged, (a, b) => a > b);
      else { toast(ctx, `${R.dodged} / 16 — あと少し`, 'DODGED', 'info', 3000); fail(sh); }
    }
  }

  const DIRS = [0, 45, 90, 135, 180, 225, 270, 315];
  function spawnBladeTarget(sh, i) {
    const R = sh.run, K = kit();
    headPos(ctx, _h);
    const pl = ctx.player;
    const yaw = pl && Number.isFinite(pl.yaw) ? pl.yaw : 0;
    _f.set(Math.sin(yaw), 0, -Math.cos(yaw));
    _r.set(Math.cos(yaw), 0, Math.sin(yaw));
    const side = (i === 0 ? -1 : 1) * (0.12 + Math.random() * 0.18);
    const mesh = K.blades[i];
    const pos = mesh.position;
    pos.copy(_h).addScaledVector(_f, 0.78).addScaledVector(_r, side);
    pos.y -= 0.18 + Math.random() * 0.3;
    const ang = DIRS[Math.floor(Math.random() * DIRS.length)] * Math.PI / 180;
    // the arrow points along (right·cos + up·sin) on the target's face
    const dir = new THREE.Vector3().copy(_r).multiplyScalar(Math.cos(ang)).addScaledVector(_up, Math.sin(ang)).normalize();
    mesh.rotation.set(0, -yaw, ang);
    mesh.visible = true;
    const slot = { i, mesh, dir, life: 0, max: 3.6, done: false, target: null, sphere: { c: pos, r: 0.24, part: 'body' } };
    const T = ctx.targets;
    if (T && typeof T.add === 'function') {
      try { slot.target = T.add({ id: `blade-${sh.id}-${R.spawned}`, kind: 'prop', spheres: [slot.sphere], owner: slot, onHit: (h) => bladeHit(sh, slot, h) }); } catch (e) { slot.target = null; }
    }
    R.slots[i] = slot;
    R.spawned++;
  }
  function bladeHit(sh, slot, h) {
    if (slot.done || !sh.run) return { applied: 0, killed: false };
    const sp = h.speed == null ? 3 : h.speed;
    const ok = h.dir ? h.dir.dot(slot.dir) >= 0.5 : true;
    if (sp >= 3 && ok) {
      slot.done = true;
      sh.run.hits++;
      fx(ctx, 'spark', slot.mesh.position, { count: 14, color: 0xffd76a, speed: 3 });
      emit(ctx, 'shrine:beat', { id: sh.id, n: sh.run.hits });
      dropBladeTarget(slot);
      sh.run.slots[slot.i] = null;
      return { applied: 1, killed: true };
    }
    fx(ctx, 'spark', slot.mesh.position, { count: 4, color: 0xd9d4e6, speed: 1 });
    return { applied: 0, killed: false, blocked: true };
  }
  function dropBladeTarget(slot) {
    removeTarget(slot);
    slot.mesh.visible = false;
  }
  function tickBlade(sh, dt) {
    const R = sh.run;
    R.t += dt;
    R.gap -= dt;
    const two = R.t > 20;     // two at a time after a warm-up
    for (let i = 0; i < 2; i++) {
      const s = R.slots[i];
      if (s) {
        s.life += dt;
        if (s.life > s.max) { dropBladeTarget(s); R.slots[i] = null; R.gap = 0.3; }
      } else if (R.spawned < R.total && R.gap <= 0 && (i === 0 || two)) {
        spawnBladeTarget(sh, i); R.gap = 0.35;
      }
    }
    progress(sh, R.hits, R.goal, R.limit - R.t);
    if (R.hits >= R.goal) complete(sh, Math.round(R.t * 10) / 10, (a, b) => a < b);
    else if (R.t >= R.limit || (R.spawned >= R.total && !R.slots[0] && !R.slots[1])) fail(sh);
  }

  function setupArchery(sh) {
    const R = sh.run, K = kit();
    R.shots = 0; R.hits = 0; R.goal = 6; R.max = 20; R.boards = []; R.tail = 0;
    const want = 20, have = G.inventory.count('arrow');
    R.lent = G.inventory.add('arrow', Math.max(0, want - have), { silent: true });
    const ex = sh.extra && Array.isArray(sh.extra.targets) ? sh.extra.targets : null;
    // out to sea: away from the lake center
    const lake = landmark(ctx, 'isle') || { x: 0, z: -40 };
    let ux = sh.x - lake.x, uz = sh.z - lake.z;
    const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
    for (let i = 0; i < 8; i++) {
      const b = { i, base: new THREE.Vector3(), pos: new THREE.Vector3(), alive: true, moving: i === 3 || i === 6, phase: i, target: null };
      if (ex && ex[i]) b.base.set(ex[i].x, ex[i].y ?? (Math.max(0, heightAt(ctx, ex[i].x, ex[i].z)) + 1.6), ex[i].z);
      else {
        const dist = 15 + (i * 25) / 7, off = (i - 3.5) * 0.16;
        const c = Math.cos(off), s = Math.sin(off);
        const x = sh.x + (ux * c - uz * s) * dist, z = sh.z + (ux * s + uz * c) * dist;
        b.base.set(x, Math.max(0, heightAt(ctx, x, z)) + 1.7, z);
      }
      b.pos.copy(b.base);
      b.sphere = { c: b.pos, r: 0.85, part: 'body' };
      const T = ctx.targets;
      if (T && typeof T.add === 'function') {
        try { b.target = T.add({ id: `board-${sh.id}-${i}`, kind: 'prop', spheres: [b.sphere], owner: b, onHit: (h) => boardHit(sh, b, h) }); } catch (e) { b.target = null; }
      }
      R.boards.push(b);
    }
    K.boards.count = 8;
  }
  function boardHit(sh, b, h) {
    if (!b.alive || !sh.run) return { applied: 0, killed: false };
    if (h.type !== 'arrow' && h.type !== 'thrown' && h.type !== 'gust') return { applied: 0, killed: false };
    b.alive = false;
    sh.run.hits++;
    removeTarget(b);
    fx(ctx, 'shard', b.pos, { count: 18, color: 0xffd76a, speed: 2.5 });
    emit(ctx, 'shrine:beat', { id: sh.id, n: sh.run.hits });
    return { applied: 1, killed: true };
  }
  function tickArchery(sh, dt) {
    const R = sh.run, K = kit();
    R.t += dt;
    playerPos(ctx, _p);
    let n = 0;
    for (const b of R.boards) {
      if (b.moving) {
        const s = Math.sin(R.t * 1.4 + b.phase) * 3;
        b.pos.set(b.base.x + Math.cos(b.phase) * s, b.base.y, b.base.z + Math.sin(b.phase) * s);
      }
      if (!b.alive) continue;
      _q.setFromAxisAngle(_up, -yawTo(_p.x - b.pos.x, _p.z - b.pos.z) + Math.PI);
      _m.compose(b.pos, _q, _s);
      K.boards.setMatrixAt(n++, _m);
    }
    K.boards.count = n;
    K.boards.instanceMatrix.needsUpdate = true;
    progress(sh, R.hits, R.goal, R.max - R.shots);
    if (R.hits >= R.goal) { complete(sh, R.shots, (a, b) => a < b); return; }
    if (R.shots >= R.max) { R.tail += dt; if (R.tail > 3) fail(sh); }
    if (Math.hypot(_p.x - sh.x, _p.z - sh.z) > 40) fail(sh);
  }

  function progress(sh, value, goal, timeLeft) {
    const key = Math.round(value * 10) + ':' + Math.ceil(timeLeft);
    if (key === sh.run.sent) return;
    sh.run.sent = key;
    emit(ctx, 'shrine:progress', { id: sh.id, value, goal, timeLeft: Math.max(0, timeLeft) });
  }

  function update(dt) {
    if (dt <= 0) return;
    playerPos(ctx, _p);
    if (active) {
      const sh = active;
      try {
        if (sh.type === 'sprint') tickSprint(sh, dt);
        else if (sh.type === 'torch') tickTorch(sh, dt);
        else if (sh.type === 'dodge') tickDodge(sh, dt);
        else if (sh.type === 'blade') tickBlade(sh, dt);
        else if (sh.type === 'archery') tickArchery(sh, dt);
      } catch (e) { fail(sh, true); throw e; }
      // walked far away: the trial ends quietly (the torch run is a long carry)
      if (active === sh && sh.type !== 'sprint' && sh.type !== 'archery') {
        const lim = sh.type === 'torch' ? 220 : 40;
        if (Math.hypot(_p.x - sh.x, _p.z - sh.z) > lim) fail(sh);
      }
      return;
    }
    for (const sh of shrines) {
      const d = Math.hypot(_p.x - sh.x, _p.z - sh.z);
      if (d > 4.5) { sh.needExit = false; continue; }
      if (sh.needExit || sh.type === 'torch') continue;   // the torch trial starts when your torch takes the flame
      if (d < 2.3 && !(G.vitals && G.vitals.dead) && !(G.enemies && G.enemies.inCombat())) begin(sh);
    }
  }

  // torch trial: lighting the torch at the shrine flame starts the clock
  ctx.events?.on?.('item:ignite', (e) => {
    if (!e || e.itemId !== 'torch' || active) return;
    playerPos(ctx, _p);
    for (const sh of shrines) {
      if (sh.type !== 'torch') continue;
      if (Math.hypot(_p.x - sh.x, _p.z - sh.z) < 6) { begin(sh); break; }
    }
  });
  ctx.events?.on?.('projectile:fire', (e) => {
    if (!active || active.type !== 'archery' || !e || e.kind !== 'arrow' || (e.by && e.by !== 'player')) return;
    active.run.shots++;
  });
  ctx.events?.on?.('player:death', () => { if (active) fail(active, true); });
  return S;
}
