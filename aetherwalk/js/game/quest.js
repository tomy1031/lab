// js/game/quest.js — main quest stages 0–6 (§8.1), objectives, the waybell guide ribbon (OPUS-B)
import * as THREE from 'three';
import { heightAt, fx, emit, toast, landmark, playerPos, propsOf, setPropState, anchorOf, headPos } from './util.js';

export const STAGES = [
  { text: '目覚めの石舞台で歩き方を覚える', en: 'Learn to walk on the stone stage' },
  { text: '野営地の焚き火に火を灯す', en: 'Light the campfire' },
  { text: '風見の鐘塔を鳴らす', en: 'Ring the Windwatch bell' },
  { text: '残りの鐘塔を鳴らす', en: 'Ring the other bell towers' },
  { text: '祈りの桟橋から光の橋を渡る', en: 'Cross the bridge of light' },
  { text: '凪の心臓を鎮める', en: 'Calm the Stillheart' },
  { text: '風の戻った島を旅する', en: 'Wander the windswept isle' },
];
const TUT = [
  { id: 'tut_walk', text: 'その場で足踏みして歩こう', en: 'STEP IN PLACE TO WALK' },
  { id: 'tut_run', text: '腕も振って、もっと速く足踏み（走る）', en: 'STEP FASTER TO JOG' },
  { id: 'tut_branch', text: '枝の松明を拾おう（グリップ）', en: 'PICK UP THE BRANCH' },
  { id: 'tut_apple', text: '陽りんごを口へ運んで食べよう', en: 'EAT THE SUN APPLE' },
  { id: 'tut_dummy', text: '木人を剣か枝で叩こう', en: 'STRIKE THE DUMMY' },
];
const REGIONS = ['meadow', 'forest', 'canyon', 'peaks'];

export function createQuest(ctx, G) {
  const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  let applying = false, objT = 0, lastObjKey = '', tutSpawned = false;
  const Q = {
    stage: 0, objective: null,
    towers: { meadow: false, forest: false, canyon: false, peaks: false },
    shrines: {}, seeds: [], chests: [], props: {}, flags: {},
    tut: { walk: 0, run: 0, branch: false, apple: false, dummy: false },
    STAGES,
    get stageText() { return STAGES[Q.stage] ? STAGES[Q.stage].text : ''; },
    setStage(n, opts = {}) {
      n = Math.max(0, Math.min(6, n | 0));
      if (applying) { Q.stage = Math.max(Q.stage, n); return; }
      applying = true;
      try {
        grantUpTo(n);
        const changed = n !== Q.stage;
        Q.stage = n;
        if (n >= 4) G.props && G.props.setBridge(true);
        if (changed && !opts.silent) {
          emit(ctx, 'quest:stage', { stage: n, text: STAGES[n].text });
          if (n > 0) toast(ctx, STAGES[n].text, `QUEST · ${STAGES[n].en.toUpperCase()}`, 'quest', 4500);
        }
        lastObjKey = '';
        refreshObjective();
        G.requestSave && G.requestSave(true);
      } finally { applying = false; }
    },
    afterTower(region, silent) {
      const pl = ctx.player;
      if (pl && pl.abilities && !pl.abilities.glide) {
        pl.abilities.glide = true;
        if (!silent) toast(ctx, '風衣を得た — 頂上から両腕を広げて滑空できる', 'WIND CLOAK · GLIDE', 'item', 5000);
      }
      Q.flags.glide = true;
      if (!silent) emit(ctx, 'map:reveal', { region });
      const n = REGIONS.filter((r) => Q.towers[r]).length;
      if (applying) return;
      if (n >= 4 && Q.stage < 4) Q.setStage(4, { silent });
      else if (Q.stage < 3) Q.setStage(3, { silent });
      else { lastObjKey = ''; refreshObjective(); }
    },
    onBossDefeated() {
      Q.flags.heart = true;
      Q.setStage(6);
      emit(ctx, 'ui:title', { text: '風が戻った', sub: 'THE WIND RETURNS TO YURA' });
      playerPos(ctx, _p);
      for (let i = 0; i < 6; i++) fx(ctx, 'petal', _a.set(_p.x + (Math.random() - 0.5) * 30, _p.y + 6, _p.z + (Math.random() - 0.5) * 30), { count: 40, speed: 3, life: 6 });
      const s = G.stats;
      toast(ctx, `歩数 ${s.steps.toLocaleString()}・距離 ${s.distance.toFixed(2)} km・${Object.keys(s.days).length} 日`, 'YOUR PILGRIMAGE', 'quest', 9000);
    },
    /** the waybell / X button: a ribbon of light toward the objective */
    guide() {
      const o = Q.objective;
      const f = ctx.world && ctx.world.fx;
      if (!o || !f || typeof f.ribbon !== 'function') return false;
      headPos(ctx, _a);
      _a.y -= 0.3;
      _b.set(o.x, heightAt(ctx, o.x, o.z) + 1.5, o.z);
      try { f.ribbon(_a, _b, { color: 0xffd76a, life: 6 }); } catch (e) { return false; }
      emit(ctx, 'quest:guide', { x: o.x, z: o.z });
      return true;
    },
    skipTutorial() { if (Q.stage === 0) Q.setStage(1); },
    serialize() {
      return { stage: Q.stage, towers: { ...Q.towers }, shrines: JSON.parse(JSON.stringify(Q.shrines)), seeds: Q.seeds.slice(),
        chests: Q.chests.slice(), props: JSON.parse(JSON.stringify(Q.props)), flags: { ...Q.flags, killed: { ...(G.enemies ? G.enemies.killedForever : {}) }, gather: G.pickups ? G.pickups.serializeGather() : {} } };
    },
    restore(d) {
      Q.stage = Math.max(0, Math.min(6, (d && d.stage) | 0));
      Q.towers = { meadow: false, forest: false, canyon: false, peaks: false, ...((d && d.towers) || {}) };
      Q.shrines = (d && d.shrines) || {};
      Q.seeds = Array.isArray(d && d.seeds) ? d.seeds.slice() : [];
      Q.chests = Array.isArray(d && d.chests) ? d.chests.slice() : [];
      Q.props = (d && d.props) || {};
      Q.flags = (d && d.flags) || {};
      if (G.enemies && Q.flags.killed) Object.assign(G.enemies.killedForever, Q.flags.killed);
    },
    update,
    refreshObjective,
  };

  // grant everything earlier stages would have given (debug setStage, skipping, loading)
  function grantUpTo(n) {
    const inv = G.inventory;
    if (n >= 1) { if (!inv.has('torch')) inv.add('torch', 1, { silent: true }); }
    if (n >= 2) {
      const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
      if (camp && !camp.lit) G.checkpoints.light(camp, true);
      if (!inv.has('sword')) inv.add('sword', 1, { silent: true });
      if (!inv.has('flask')) inv.add('flask', 1, { silent: true });
      const ped = G.pickups && G.pickups.pedestalChest();
      if (ped && !Q.chests.includes(ped.id)) G.pickups.openChest(ped, true);
      const pp = G.props && G.props.pedestal;
      if (pp) { setPropState(pp, 'taken', true); Q.props[pp.id] = { taken: true }; }
    }
    if (n >= 3) {
      if (!Q.towers.meadow && G.towers) G.towers.awaken('meadow', true);
      Q.towers.meadow = true;
      if (!inv.has('shield')) inv.add('shield', 1, { silent: true });
      const pl = ctx.player;
      if (pl && pl.abilities) pl.abilities.glide = true;
      Q.flags.glide = true;
    }
    if (n >= 4) {
      for (const r of REGIONS) { if (!Q.towers[r] && G.towers) G.towers.awaken(r, true); Q.towers[r] = true; }
    }
    if (n >= 6) Q.flags.heart = true;
  }

  function setObjective(id, text, x, z) {
    const key = `${id}|${Math.round(x)}|${Math.round(z)}|${text}`;
    if (key === lastObjKey) return;
    lastObjKey = key;
    Q.objective = id ? { id, text, x, z } : null;
    emit(ctx, 'quest:objective', Q.objective ? { ...Q.objective } : { id: null, text: '', x: 0, z: 0 });
  }

  function refreshObjective() {
    playerPos(ctx, _p);
    const L = (id) => landmark(ctx, id);
    switch (Q.stage) {
      case 0: {
        const st = L('start') || { x: _p.x, z: _p.z };
        const i = tutIndex();
        const t = TUT[Math.min(i, TUT.length - 1)];
        if (i >= TUT.length) { const c = L('camp_meadow'); setObjective('camp', '野営地へ下りよう', c ? c.x : st.x, c ? c.z : st.z); }
        else setObjective(t.id, t.text, st.x, st.z);
        break;
      }
      case 1: {
        const c = L('camp_meadow');
        const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
        const ped = G.pickups && G.pickups.pedestalChest();
        if (camp && camp.lit && ped) setObjective('pedestal', '台座の剣を手に取ろう', ped.x, ped.z);
        else setObjective('camp_meadow', camp && camp.lit ? '台座の剣を手に取ろう' : '焚き火に松明の火を移そう', c ? c.x : _p.x, c ? c.z : _p.z);
        break;
      }
      case 2: { const t = L('tower_meadow'); setObjective('tower_meadow', '風見の鐘塔の頂上で鐘を鳴らそう', t ? t.x : _p.x, t ? t.z : _p.z); break; }
      case 3: {
        let best = null, bd = Infinity;
        const towers = G.towers ? G.towers.towers : [];
        for (const t of towers) {
          if (t.awake) continue;
          const d = Math.hypot(t.x - _p.x, t.z - _p.z);
          if (d < bd) { bd = d; best = t; }
        }
        if (best) setObjective(best.id, `${best.name}を鳴らそう`, best.x, best.z);
        else {
          const ids = REGIONS.filter((r) => !Q.towers[r]).map((r) => 'tower_' + r);
          const lm = ids.map(L).filter(Boolean)[0];
          setObjective(lm ? lm.id : 'towers', '残りの鐘塔を鳴らそう', lm ? lm.x : _p.x, lm ? lm.z : _p.z);
        }
        break;
      }
      case 4: { const p = L('pier'); setObjective('pier', '祈りの桟橋から光の橋を渡ろう', p ? p.x : _p.x, p ? p.z : _p.z); break; }
      case 5: { const p = L('isle'); setObjective('isle', '凪の心臓を鎮めよう', p ? p.x : _p.x, p ? p.z : _p.z); break; }
      default: {
        // free travel: the nearest unfinished shrine
        let best = null, bd = Infinity;
        for (const s of (G.shrines ? G.shrines.shrines : [])) {
          if (Q.shrines[s.id] && Q.shrines[s.id].done) continue;
          const d = Math.hypot(s.x - _p.x, s.z - _p.z);
          if (d < bd) { bd = d; best = s; }
        }
        if (best) setObjective(best.id, `${best.info.name}に挑もう`, best.x, best.z);
        else setObjective(null, '', 0, 0);
      }
    }
  }

  function tutIndex() {
    const t = Q.tut;
    if (t.walk < 16) return 0;
    if (t.run < 10) return 1;
    if (!t.branch) return 2;
    if (!t.apple) return 3;
    if (!t.dummy) return 4;
    return 5;
  }
  function tutAdvance() {
    const before = lastObjKey;
    refreshObjective();
    if (lastObjKey !== before && Q.stage === 0) {
      const i = tutIndex();
      if (i < TUT.length) toast(ctx, TUT[i].text, TUT[i].en, 'quest', 4000, 'tut');
      else toast(ctx, 'よくできました — 野営地へ下りよう', 'TUTORIAL DONE', 'quest', 4000, 'tut');
    }
  }

  function spawnTutorialItems() {
    if (tutSpawned) return;
    tutSpawned = true;
    const sp = ctx.world && ctx.world.spawnPoints && ctx.world.spawnPoints.player;
    const items = ctx.items;
    if (!sp || !items || typeof items.spawn !== 'function') {
      // no world items: hand them over so the lesson can continue
      G.inventory.add('torch', 1, { silent: true }); G.inventory.add('apple', 1, { silent: true });
      return;
    }
    const yaw = (sp.yaw || 0) * Math.PI / 180;
    const fx_ = Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
    try {
      const bx = sp.x + fx_ * 1.6 - rx * 0.9, bz = sp.z + fz * 1.6 - rz * 0.9;
      items.spawn('torch', { pos: new THREE.Vector3(bx, heightAt(ctx, bx, bz) + 0.15, bz), owned: true });
      const ax = sp.x + fx_ * 1.4 + rx * 0.8, az = sp.z + fz * 1.4 + rz * 0.8;
      items.spawn('apple', { pos: new THREE.Vector3(ax, heightAt(ctx, ax, az) + 0.12, az) });
    } catch (e) { /* items stub */ }
  }

  /** extra loot for a world spawn group: the husk at the foot of the Windwatch tower carries the shield (§8.1) */
  Q.extraDropsFor = function (sp) {
    if (!sp || sp.type !== 'husk' || G.inventory.has('shield')) return null;
    const t = landmark(ctx, 'tower_meadow');
    if (!t || Math.hypot(sp.x - t.x, sp.z - t.z) > 25) return null;
    return [{ itemId: 'shield', min: 1, max: 1 }];
  };

  function update(dt) {
    if (dt <= 0) return;
    if (Q.stage === 0) spawnTutorialItems();
    objT -= dt;
    if (objT <= 0) {
      objT = 0.5;
      playerPos(ctx, _p);
      if (Q.stage === 0) {
        // leaving the stage area finishes the lesson (it can always be skipped)
        const st = landmark(ctx, 'start');
        if (st && Math.hypot(_p.x - st.x, _p.z - st.z) > 45) Q.setStage(1);
      }
      if (Q.stage === 1) {
        const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
        const ped = G.pickups && G.pickups.pedestalChest();
        if (G.inventory.has('sword') && (!camp || camp.lit)) Q.setStage(2);
        else if ((camp && camp.lit && !ped) || (!camp && !ped)) { G.inventory.add('sword', 1); Q.setStage(2); }
      }
      refreshObjective();
    }
  }

  // ── tutorial listeners ──
  ctx.events?.on?.('step', (e) => {
    if (Q.stage !== 0) return;
    Q.tut.walk++;
    const c = (e && e.cadence) || 0;
    if (Q.tut.walk >= 16 && c >= 110) Q.tut.run++;
    if (Q.tut.walk === 16 || Q.tut.run === 10) tutAdvance();
  });
  ctx.events?.on?.('item:grab', (e) => { if (Q.stage === 0 && e && e.itemId === 'torch') { Q.tut.branch = true; tutAdvance(); } });
  ctx.events?.on?.('item:consume', (e) => { if (Q.stage === 0 && e && e.itemId && e.itemId.startsWith('apple')) { Q.tut.apple = true; tutAdvance(); } });
  ctx.events?.on?.('dummy:hit', () => { if (Q.stage === 0) { Q.tut.dummy = true; tutAdvance(); } });
  ctx.events?.on?.('hit', (e) => { if (Q.stage === 0 && e && e.targetKind === 'dummy') { Q.tut.dummy = true; tutAdvance(); } });
  ctx.events?.on?.('fire:lit', (e) => { if (e && e.id === 'camp_meadow' && Q.stage <= 1) { if (Q.stage === 0) Q.setStage(1); G.inventory.add('flask', 1); refreshObjective(); } });
  // (the waybell item and the X button draw their own ribbon in items/waybell.js; guide() serves the wrist menu)

  return Q;
}
