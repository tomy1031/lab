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
export const TUT = [
  { id: 'tut_walk', text: 'その場で足踏みして歩こう', en: 'STEP IN PLACE TO WALK', goal: 16 },
  { id: 'tut_run', text: '腕も振って速く足踏み（走る）', en: 'SWING YOUR ARMS · STEP FASTER TO JOG', goal: 10 },
  { id: 'tut_branch', text: '枝の松明を拾おう（グリップ）', en: 'PICK UP THE BRANCH' },
  { id: 'tut_apple', text: '陽りんごを口へ運んで食べよう', en: 'EAT THE SUN APPLE' },
  { id: 'tut_dummy', text: '木人を枝で叩こう', en: 'STRIKE THE DUMMY' },
];
// stage 1, shown on the tutorial board as the start of the main quest
export const MAIN1 = [
  { id: 'm_light', text: '燭台の火を松明に移す', en: 'LIGHT THE BRANCH AT A BRAZIER' },
  { id: 'm_camp', text: '野営地の焚き火に火を灯す', en: 'LIGHT THE CAMPFIRE' },
  { id: 'm_sword', text: '台座の剣を握って手に取る', en: 'GRIP THE SWORD ON THE PEDESTAL' },
];
const REGIONS = ['meadow', 'forest', 'canyon', 'peaks'];
// stage 1, lighting the camp: what to do right now (board, objective line, toast and the gold markers)
export const CAMP_HINT = {
  torch: ['枝の松明を持とう', 'PICK UP THE BRANCH TORCH'],
  draw: ['枝の松明を手に持とう（ホルスターから取り出す）', 'TAKE THE BRANCH TORCH OUT OF ITS HOLSTER'],
  drawLit: ['燃えている松明をホルスターから取り出そう', 'DRAW THE BURNING TORCH FROM ITS HOLSTER'],
  light: ['燭台の火に松明の先を近づけて、火を移そう', 'HOLD THE TORCH TIP IN THE BRAZIER FLAME'],
  carry: ['火のついた松明を野営地の焚き火へ運ぼう', 'CARRY THE LIT TORCH TO THE CAMPFIRE'],
  touch: ['薪に松明を近づけて火をつけよう', 'TOUCH THE FIREWOOD WITH THE FLAME'],
  relight: ['松明の火が消えている — 燭台で付け直そう', 'YOUR TORCH IS OUT · RELIGHT IT AT A BRAZIER'],
  sword: ['台座の剣を握って手に取ろう', 'GRIP THE SWORD ON THE PEDESTAL'],
};
const OUT_WHY = { burnout: ['燃え尽きた', 'BURNED OUT'], water: ['水で消えた', 'DOUSED BY WATER'], wind: ['風で消えた', 'BLOWN OUT BY THE WIND'], stowed: ['バッグにしまうと消える（ホルスターなら燃えたまま）', 'THE BAG PUTS IT OUT · A HOLSTER KEEPS IT LIT'] };
const CAMP_NEAR = 4, CAMP_NEAR_OUT = 5, CAMP_AT = 10;   // m: the touch phase (with hysteresis), "at the campfire"

export function createQuest(ctx, G) {
  const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  let applying = false, objT = 0, lastObjKey = '', tutSpawned = false, tutClosed = false;
  const tutPrev = [false, false, false, false, false];
  const tutItems = { torch: null, apple: null };          // the lesson's branch and apple (world items)
  // reusable guide targets for the world markers (no per-frame allocation)
  const targets = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0, primary: false, kind: '' }));
  const _t = new THREE.Vector3();
  let startBrazier;
  // stage-1 phase: a torch / draw / light / carry / touch / relight / sword, or '' (not stage 1)
  const campHint = { phase: '', text: '', en: '', dist: 0, fire: null };
  let campNear = false, campPhasePrev = '', campLitT = -1;
  let torchBurning = false;   // the player's torch is lit somewhere (in a hand, a holster, or put down nearby)
  const Q = {
    stage: 0, objective: null,
    towers: { meadow: false, forest: false, canyon: false, peaks: false },
    shrines: {}, seeds: [], chests: [], props: {}, flags: {},
    tut: { walk: 0, run: 0, branch: false, apple: false, dummy: false },
    STAGES, TUT, MAIN1, tutItems,
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
    skipTutorial() { if (Q.stage === 0) { closeTutorial(true); Q.setStage(1); } },
    /** step i of the lesson done? */
    tutDone(i) {
      const t = Q.tut;
      return [t.walk >= 16, t.run >= 10, !!t.branch, !!t.apple, !!t.dummy][i] || false;
    },
    tutIndex: () => tutIndex(),
    /** stage-1 sub-steps for the board */
    mainDone(i) {
      const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
      const lit = !!(camp && camp.lit);
      if (i === 0) return lit || torchLit() || torchBurning;
      if (i === 1) return lit;
      return G.inventory.has('sword');
    },
    torchLit: () => torchLit(),
    guideTargets,
    /** stage-1 "what now" for the board: { phase, text, en, dist (m to the campfire), fire (brazier) } */
    get campHint() { return campHint; },
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
        const ph = updateCampHint();
        const ped = G.pickups && G.pickups.pedestalChest();
        if (ph === 'sword' && ped) setObjective('pedestal', campHint.text, ped.x, ped.z);
        else if ((ph === 'light' || ph === 'relight' || ph === 'draw') && campHint.fire) setObjective('camp_' + ph, campHint.text, campHint.fire.x, campHint.fire.z);
        else if (ph === 'torch' && tutItems.torch && onGround(tutItems.torch)) setObjective('camp_torch', campHint.text, tutItems.torch.pos.x, tutItems.torch.pos.z);
        else setObjective('camp_' + (ph || 'meadow'), campHint.text || '松明に火を灯し、野営地の焚き火へ運ぼう', c ? c.x : _p.x, c ? c.z : _p.z);
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
    tutCheck();
    if (Q.stage !== 0) return;
    const before = lastObjKey;
    refreshObjective();
    const i = tutIndex();
    if (i >= TUT.length) { closeTutorial(false); Q.setStage(1); return; }
    if (lastObjKey !== before) toast(ctx, TUT[i].text, TUT[i].en, 'quest', 4000, 'tut');
  }
  /** tick off every step that just became done (in any order) */
  function tutCheck() {
    if (Q.stage !== 0) return;
    for (let i = 0; i < TUT.length; i++) {
      if (tutPrev[i] || !Q.tutDone(i)) continue;
      tutPrev[i] = true;
      emit(ctx, 'tutorial:step', { index: i, id: TUT[i].id });
    }
  }
  function closeTutorial(skipped) {
    if (tutClosed) return;
    tutClosed = true;
    emit(ctx, 'tutorial:done', { skipped: !!skipped });
  }
  function heldTorch() {
    const h = ctx.items && ctx.items.held;
    if (!h) return null;
    for (const k of ['right', 'left']) { const i = h[k]; if (i && i.id === 'torch') return i; }
    return null;
  }
  /** a torch lying in the world to point at (the lesson's branch first, else the nearest within 60 m) */
  function torchOnGround() {
    if (onGround(tutItems.torch)) return tutItems.torch;
    const w = ctx.items && ctx.items.worldItems;
    if (!w) return null;
    let best = null, bd = 60;
    for (const i of w) { if (i.id !== 'torch') continue; const d = Math.hypot(i.pos.x - _p.x, i.pos.z - _p.z); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function campFire(camp, out) {
    anchorOf(camp.prop, 'fire', out);
    if (!camp.prop) out.set(camp.x, heightAt(ctx, camp.x, camp.z) + 0.5, camp.z);
    return out;
  }
  /** work out the stage-1 phase into campHint (and return it) — called from refreshObjective (≈2 Hz) */
  function updateCampHint() {
    const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
    let ph = '';
    campHint.fire = null; campHint.dist = 0;
    if (Q.stage === 1 && camp) {
      playerPos(ctx, _p);
      const d = Math.hypot(_p.x - camp.x, _p.z - camp.z);
      campHint.dist = d;
      if (camp.lit) { campNear = false; ph = G.inventory.has('sword') ? '' : 'sword'; }
      else {
        const t = heldTorch();
        if (t && t.state && t.state.lit) { campNear = d < (campNear ? CAMP_NEAR_OUT : CAMP_NEAR); ph = campNear ? 'touch' : 'carry'; }
        else {
          campNear = false;
          const g = torchOnGround();
          if (g && g.state && g.state.lit && Math.hypot(g.pos.x - _p.x, g.pos.z - _p.z) < 15) ph = 'torch';   // put down still burning: pick it up
          else if (!t && torchBurning && G.inventory.has('torch')) ph = 'drawLit';                       // burning in its holster
          else if (d < CAMP_AT) ph = 'relight';
          else if (t) ph = 'light';
          else ph = g || !G.inventory.has('torch') ? 'torch' : 'draw';
          if (ph === 'light' || ph === 'relight' || ph === 'draw') campHint.fire = G.checkpoints.nearestFire ? G.checkpoints.nearestFire(_p.x, _p.z) : null;
        }
      }
    }
    campHint.phase = ph;
    const h = CAMP_HINT[ph];
    campHint.text = h ? h[0] : ''; campHint.en = h ? h[1] : '';
    return ph;
  }
  function torchLit() {
    const h = ctx.items && ctx.items.held;
    if (!h) return false;
    for (const k of ['left', 'right']) { const i = h[k]; if (i && i.id === 'torch' && i.state && i.state.lit) return true; }
    return false;
  }
  function onGround(inst) { return !!inst && !inst.heldBy && (ctx.items && ctx.items.worldItems ? ctx.items.worldItems.includes(inst) : true); }
  function put(n, x, y, z, primary, kind) {
    const o = targets[n];
    o.x = x; o.y = y; o.z = z; o.primary = primary; o.kind = kind;
    return n + 1;
  }
  /** where the gold arrows point now: the lesson's next thing, then the brazier, the campfire and the pedestal */
  function guideTargets(out) {
    out.length = 0;
    let n = 0;
    if (Q.stage === 0) {
      const t = Q.tut;
      if (!t.branch && onGround(tutItems.torch)) n = put(n, tutItems.torch.pos.x, tutItems.torch.pos.y, tutItems.torch.pos.z, true, 'item');
      else if (!t.apple && onGround(tutItems.apple)) n = put(n, tutItems.apple.pos.x, tutItems.apple.pos.y, tutItems.apple.pos.z, true, 'item');
      else if (!t.dummy) {
        const d = G.props && G.props.dummies && G.props.dummies[0];
        if (d) n = put(n, d.c.x, d.c.y + 0.5, d.c.z, true, 'dummy');
      }
    } else if (Q.stage === 1) {
      // one marker per phase: the branch, the burning brazier, the campfire (a ring at the bowl up close), the pedestal
      const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
      const ph = campHint.phase;
      if (ph === 'torch') {
        playerPos(ctx, _p);
        const t = torchOnGround();
        if (t) n = put(n, t.pos.x, t.pos.y, t.pos.z, true, 'item');
      } else if ((ph === 'light' || ph === 'relight' || ph === 'draw') && campHint.fire) {
        const b = campHint.fire;
        n = put(n, b.firePos.x, b.firePos.y + 0.25, b.firePos.z, true, 'fire');
      } else if ((ph === 'carry' || ph === 'touch' || ph === 'drawLit') && camp) {
        campFire(camp, _t);
        n = ph === 'touch' ? put(n, _t.x, _t.y + 0.3, _t.z, true, 'bowl') : put(n, _t.x, _t.y + 0.4, _t.z, true, 'fire');
      } else if (ph === 'sword') {
        const ped = G.pickups && G.pickups.pedestalChest();
        if (ped && !Q.chests.includes(ped.id)) {
          anchorOf(ped.prop, 'item', _t);
          if (!ped.prop) _t.set(ped.x, heightAt(ctx, ped.x, ped.z) + 1.2, ped.z);
          n = put(n, ped.prop ? ped.prop.x : _t.x, _t.y + 0.3, ped.prop ? ped.prop.z : _t.z, true, 'pedestal');
        }
      }
    }
    for (let i = 0; i < n; i++) out.push(targets[i]);
    return out;
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
      tutItems.torch = items.spawn('torch', { pos: new THREE.Vector3(bx, heightAt(ctx, bx, bz) + 0.15, bz), owned: true });
      const ax = sp.x + fx_ * 1.4 + rx * 0.8, az = sp.z + fz * 1.4 + rz * 0.8;
      tutItems.apple = items.spawn('apple', { pos: new THREE.Vector3(ax, heightAt(ctx, ax, az) + 0.12, az) });
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
        if (st && Math.hypot(_p.x - st.x, _p.z - st.z) > 45) { closeTutorial(true); Q.setStage(1); }
      }
      if (Q.stage === 1) {
        const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
        const ped = G.pickups && G.pickups.pedestalChest();
        if (G.inventory.has('sword') && (!camp || camp.lit)) Q.setStage(2);
        else if ((camp && camp.lit && !ped) || (!camp && !ped)) { G.inventory.add('sword', 1); Q.setStage(2); }
      }
      refreshObjective();
      // stage 1: say the new step when it changes (the board and markers follow on their own)
      const ph = Q.stage === 1 ? campHint.phase : '';
      if (ph !== campPhasePrev) {
        if (campPhasePrev && ph && ph !== 'sword' && campLitT < 0) toast(ctx, campHint.text, campHint.en, 'quest', 4500, 'camp');
        campPhasePrev = ph;
      }
    }
    // after the campfire's title: the next step (the sword)
    if (campLitT >= 0) {
      campLitT -= dt;
      if (campLitT < 0 && Q.stage === 1 && !G.inventory.has('sword')) toast(ctx, CAMP_HINT.sword[0], CAMP_HINT.sword[1], 'quest', 5000, 'camp');
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
  ctx.events?.on?.('fire:lit', (e) => {
    if (!e || e.id !== 'camp_meadow' || Q.stage > 1) return;
    if (Q.stage === 0) { closeTutorial(true); Q.setStage(1); }
    emit(ctx, 'ui:title', { text: '焚き火が灯った', sub: 'CAMPFIRE LIT · 復活地点' });
    G.inventory.add('flask', 1);                // its own toast: 水筒 を手に入れた
    campLitT = 2.6;                             // then: the sword on the pedestal
    campPhasePrev = 'sword';
    refreshObjective();
  });
  /** is this torch event about the player's own torch? (in a hand, a holster (uid null), or put down within 8 m) */
  function playersTorch(e) {
    if (e.uid == null) return true;
    const it = ctx.items;
    let inst = null;
    if (it && it.held) for (const k of ['left', 'right']) if (it.held[k] && it.held[k].uid === e.uid) inst = it.held[k];
    if (!inst && it && it.worldItems) inst = it.worldItems.find((i) => i.uid === e.uid) || null;
    if (!inst) return false;
    if (inst.heldBy) return true;
    playerPos(ctx, _p);
    return Math.hypot(inst.pos.x - _p.x, inst.pos.z - _p.z) <= 8;
  }
  ctx.events?.on?.('item:ignite', (e) => { if (e && e.itemId === 'torch' && playersTorch(e)) { torchBurning = true; lastObjKey = ''; objT = 0; } });
  // a torch went out: say why (playtest: stowed it to swing the arms, arrived with a dead torch, no feedback)
  ctx.events?.on?.('item:extinguish', (e) => {
    if (!e || e.itemId !== 'torch') return;
    if (!playersTorch(e)) return;
    torchBurning = false;
    const w = OUT_WHY[e.why === 'stow' || !e.why ? 'stowed' : e.why] || ['火が消えた', 'WENT OUT'];
    const camp = G.checkpoints && G.checkpoints.byId('camp_meadow');
    const lesson = Q.stage === 1 && camp && !camp.lit;
    toast(ctx, `松明の火が消えた — ${w[0]}`, `TORCH OUT · ${w[1]}` + (lesson ? ' · RELIGHT AT A BRAZIER' : ''), 'warn', 4500, 'torchout');
    lastObjKey = ''; objT = 0;                  // re-plan the guidance now
  });
  // (the waybell item and the X button draw their own ribbon in items/waybell.js; guide() serves the wrist menu)

  return Q;
}
