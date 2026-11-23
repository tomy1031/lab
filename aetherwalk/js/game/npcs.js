// js/game/npcs.js — the people of the island (DESIGN_V2 §1, OPUS-B). Who is where (and when), how they move and
// look at you, and the talk itself: notice at 6 m (the head turns), a name tag at 3 m, talk by pointing and pulling
// the trigger / looking at them from close by for 0.8 s / waving (A4) / E on PC; lines advance every 2.8 s (trigger or
// an empty-hand grip skips); a yes / no is a nod (A4) or A / B (PC: Y / N). Drawn by world.folk (W1).
// game.npcs = { list, byId, talk(id), near(x, z, r) }; saved in quest.flags.npc.
import * as THREE from 'three';
import { NPC_DEFS, NPC_IDS } from './npcs.data.js';
import { emit, playerPos, headPos, heightAt, setting } from './util.js';

const NOTICE = 6, TAG = 3, LEAVE = 4, GAZE_R = 1.6, GAZE_T = 0.8, LINE_T = 2.8, ASK_T = 10, COOLDOWN = 2.5;

export function createNpcs(ctx, G) {
  const list = [];                 // { id, def, folk, home, x, z, yaw, visible, ... }
  const byId = {};
  const _p = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion();
  let loaded = false, nearId = null, gazeId = null, gazeT = 0, cool = 0;
  let talk = null;                 // { npc, entry, lines, i, t, asking, askT, inputLock }

  const flags = () => { const F = G.quest ? G.quest.flags : {}; return F.npc || (F.npc = {}); };
  const towersRung = () => { const T = G.quest ? G.quest.towers : null; return T ? Object.values(T).filter(Boolean).length : 0; };
  function stateFor(npc) {
    const f = flags()[npc.id] || {};
    const inv = G.inventory;
    return {
      n: towersRung(), stage: G.quest ? G.quest.stage : 0, met: !!f.met, drill: (G.quest && G.quest.flags.drill) | 0,
      has: (id) => !!(inv && inv.has(id)), said: (tid) => !!(f.said && f.said[tid]),
    };
  }

  // ── where each one stands ──
  function spot(id) {
    const sp = ctx.world && ctx.world.spawnPoints && ctx.world.spawnPoints.npcs;
    return sp && sp[id] ? sp[id] : null;
  }
  function towaSpot(npc, s) {
    if (s.n >= 4) {
      const pier = ctx.world && ctx.world.landmarks && ctx.world.landmarks.pier;
      if (pier) return { x: pier.x + 3, z: pier.z + 2, yaw: 180 };
    }
    if (s.n >= 1 && G.towers && G.towers.towers) {
      // the foot of the next tower to ring (the objective's, else the nearest not yet awake), by its door
      const o = G.quest && G.quest.objective;
      let tw = o && o.id ? G.towers.byId(o.id) : null;
      if (!tw || tw.awake) { playerPos(ctx, _p); let bd = Infinity; for (const t of G.towers.towers) { if (t.awake) continue; const d = Math.hypot(t.x - _p.x, t.z - _p.z); if (d < bd) { bd = d; tw = t; } } }
      if (tw && !tw.awake) {
        const dy = tw.doorYaw || 0;
        return { x: tw.x + Math.sin(dy) * 7.5, z: tw.z - Math.cos(dy) * 7.5, yaw: (dy * 180 / Math.PI + 180) % 360 };
      }
    }
    return npc.home;
  }

  function load() {
    const F = ctx.world && ctx.world.folk;
    if (!F || typeof F.spawn !== 'function') return false;
    for (const id of NPC_IDS) {
      const def = NPC_DEFS[id], sp = spot(id);
      if (!sp) continue;
      const folk = F.spawn({ id, kind: def.kind, x: sp.x, z: sp.z, yaw: sp.yaw || 0 });
      if (!folk) continue;
      const npc = { id, def, folk, home: { x: sp.x, z: sp.z, yaw: sp.yaw || 0 }, x: sp.x, z: sp.z, yaw: sp.yaw || 0, visible: true, phase: 0, looking: false };
      folk.setPose(def.idle || 'idle', 0.01);
      list.push(npc); byId[id] = npc;
    }
    return true;
  }

  // ── per frame ──
  function move(npc, tx, tz, dt, speed) {
    const dx = tx - npc.x, dz = tz - npc.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    const step = Math.min(d, speed * dt);
    npc.x += dx / d * step; npc.z += dz / d * step;
    npc.yaw = Math.atan2(dx, -dz) * 180 / Math.PI;
    return step / dt;
  }
  function place(npc) {
    const f = npc.folk;
    let y = 0;
    try { y = ctx.world.groundAt ? ctx.world.groundAt(npc.x, npc.z, heightAt(ctx, npc.x, npc.z) + 0.6) : heightAt(ctx, npc.x, npc.z); } catch (e) { y = heightAt(ctx, npc.x, npc.z); }
    f.pos.set(npc.x, (Number.isFinite(y) ? y : f.pos.y) + (npc.lift || 0), npc.z);
    f.yaw = npc.yaw;
    f.visible = npc.visible;
  }
  const looking = (npc, dist) => dist < NOTICE && npc.visible && !npc.lift;
  function behave(npc, dt, s, dist) {
    const def = npc.def, f = npc.folk;
    const talking = talk && talk.npc === npc;
    // Towa follows the story
    if (npc.id === 'towa') {
      npc.visible = !!(def.appear && def.appear(s));
      const t = towaSpot(npc, s);
      if (Math.hypot(t.x - npc.x, t.z - npc.z) > 25) { npc.x = t.x; npc.z = t.z; npc.yaw = t.yaw; }   // (she travels while you are away)
      else if (!talking) { const v = move(npc, t.x, t.z, dt, 1.4); if (!v && dist > NOTICE) npc.yaw = t.yaw; }
    }
    // the twins play tag around their spot while you are not close
    if (def.twin && !talking) {
      const other = byId[def.twin];
      const cx = other ? (npc.home.x + other.home.x) / 2 : npc.home.x, cz = other ? (npc.home.z + other.home.z) / 2 : npc.home.z;
      if (dist > 8) {
        npc.phase += dt * 0.8;
        const a = npc.phase + (npc.id === 'mio' ? 0 : 1.9);
        const v = move(npc, cx + Math.cos(a) * 1.9, cz + Math.sin(a) * 1.9, dt, 2.2);
        if (f.pose !== (v > 0.3 ? 'run' : 'idle')) f.setPose(v > 0.3 ? 'run' : 'idle', 0.3);
      } else if (f.pose === 'run') { f.setPose(npc.waved ? 'idle' : 'wave', 0.3); npc.waved = true; npc.waveT = 1.6; }
    }
    // Zaji shows how to climb while you are near: up the wall a little in the climb pose, then down again
    if (def.demo && !talking) {
      const near = dist < 14 && dist > 2.5;
      npc.demoT = (npc.demoT || 0) + (near ? dt : 0);
      const k = near ? (npc.demoT % 7) : 0;
      const on = k > 0.3 && k < 4.3;
      if (f.pose !== (on ? 'climb' : 'idle')) f.setPose(on ? 'climb' : 'idle', 0.35);
      npc.lift = on ? Math.min(1.1, (k - 0.3) * 0.5) : Math.max(0, (npc.lift || 0) - dt * 1.5);
      const yr = npc.home.yaw * Math.PI / 180;
      npc.x = npc.home.x + Math.sin(yr) * 0.35 * (npc.lift > 0 ? 1 : 0); npc.z = npc.home.z - Math.cos(yr) * 0.35 * (npc.lift > 0 ? 1 : 0);
      if (!looking(npc, dist)) npc.yaw = npc.home.yaw;
    }
    if (npc.waveT > 0) { npc.waveT -= dt; if (npc.waveT <= 0 && f.pose === 'wave') f.setPose('idle', 0.4); }
    if (dist > 12) npc.waved = false;
    // look at you from 6 m (the head turns); Gando stops hammering
    const look = looking(npc, dist);
    if (look !== npc.looking) {
      npc.looking = look;
      f.lookAt(look ? headPos(ctx, _h) : null);
      if (npc.id === 'gando' && !talking) f.setPose(look ? 'idle' : def.idle, 0.4);
    } else if (look) f.lookAt(headPos(ctx, _h));
    if (talking) { npc.yaw = Math.atan2(_p.x - npc.x, -(_p.z - npc.z)) * 180 / Math.PI; }
  }

  // ── talking ──
  function pickEntry(npc, s) {
    for (const e of npc.def.talks) if (e.when(s)) return e;
    return null;
  }
  function start(npc, how = 'api') {
    if (!npc || !npc.visible || talk) return false;
    if (G.enemies && G.enemies.inCombat && G.enemies.inCombat()) return false;       // no talking in a fight
    const s = stateFor(npc);
    const entry = pickEntry(npc, s);
    if (!entry) return false;
    const lines = typeof entry.lines === 'function' ? entry.lines(s) : entry.lines;
    talk = { npc, entry, lines, i: -1, t: 0, asking: false, askT: 0, inputLock: 0.35, how };
    npc.folk.setPose('talk', 0.3);
    next();
    return true;
  }
  function next() {
    const T = talk;
    if (!T) return;
    T.i++; T.t = 0; T.inputLock = Math.max(T.inputLock, 0.25);
    if (T.i < T.lines.length) {
      const line = T.lines[T.i];
      emit(ctx, 'npc:talk', { id: T.npc.id, name: T.npc.def.name, en: T.npc.def.en, line, i: T.i, of: T.lines.length, pitch: T.npc.def.pitch, pos: T.npc.folk.headPos.clone() });
      return;
    }
    if (T.entry.ask && !T.asking) {
      T.asking = true; T.askT = 0;
      if (ctx.player) ctx.player.noJump = true;          // A answers here (A1 lets anyone set this)
      emit(ctx, 'npc:ask', { id: T.npc.id, name: T.npc.def.name, text: T.entry.ask });
      emit(ctx, 'npc:talk', { id: T.npc.id, name: T.npc.def.name, en: T.npc.def.en, line: T.entry.ask, i: T.lines.length, of: T.lines.length + 1, pitch: T.npc.def.pitch, ask: true, pos: T.npc.folk.headPos.clone() });
      return;
    }
    end(true, null);
  }
  function end(finished, answer) {
    const T = talk;
    if (!T) return;
    talk = null; cool = COOLDOWN;
    if (ctx.player && T.asking) ctx.player.noJump = false;
    const npc = T.npc, F = flags();
    const f = F[npc.id] || (F[npc.id] = {});
    if (finished) {
      f.met = 1; f.last = T.entry.id;
      (f.said || (f.said = {}))[T.entry.id] = 1;
      G.requestSave && G.requestSave(true);
    }
    npc.folk.setPose(finished ? 'nod' : 'idle', 0.25);
    npc.nodT = finished ? 0.9 : 0;
    emit(ctx, 'npc:end', { id: npc.id, finished, answer });
    if (!finished) return;
    const action = T.entry.ask ? (answer ? T.entry.yes : T.entry.no) : T.entry.action;
    act(action, npc);
  }
  function act(action, npc) {
    if (action === 'drill') {
      if (G.drill && G.drill.ready()) G.drill.start(npc.folk.pos);
    } else if (action === 'smith') {
      // Gando's page (tempering and the shield drill) — only when there is something to do there
      const inv = G.inventory;
      const t = inv && inv.temper ? Math.min(inv.temper.sword | 0, 3) : 3;
      const canTemper = inv && inv.has('sword') && t < 3 && inv.count('shard') >= [60, 90, 120][t];
      if (canTemper || (G.drill && G.drill.ready())) emit(ctx, 'npc:menu', { page: 'smith', id: npc.id });
    }
  }
  /** a yes / no answer (nod / shake, A / B, Y / N) */
  function answer(yes) {
    if (!talk || !talk.asking || talk.inputLock > 0) return false;
    end(true, !!yes);
    return true;
  }

  // ── how a talk starts ──
  function nearest(px, pz, r, inView) {
    let best = null, bd = r;
    for (const n of list) {
      if (!n.visible) continue;
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d >= bd) continue;
      if (inView && !inViewOf(n, 40)) continue;
      bd = d; best = n;
    }
    return best;
  }
  function inViewOf(n, deg) {
    const head = ctx.input && ctx.input.head;
    if (!head || !head.quat) return true;
    _f.set(0, 0, -1).applyQuaternion(head.quat);
    _d.copy(n.folk.headPos).sub(head.pos).normalize();
    return _f.dot(_d) >= Math.cos(deg * Math.PI / 180);
  }
  function pointedAt(hand) {
    const H = ctx.input && ctx.input.hands && ctx.input.hands[hand];
    if (!H || !H.pos || !H.quat || H.tracked === false) return null;
    _f.set(0, 0, -1).applyQuaternion(H.quat);
    let best = null, bc = Math.cos(12 * Math.PI / 180);
    for (const n of list) {
      if (!n.visible) continue;
      _d.copy(n.folk.headPos); _d.y -= 0.35; _d.sub(H.pos);
      const L = _d.length();
      if (L > 7 || L < 0.2) continue;
      const c = _f.dot(_d.divideScalar(L));
      if (c > bc) { bc = c; best = n; }
    }
    return best;
  }
  function inputTick(dt) {
    const input = ctx.input;
    if (!input || !input.justPressed) return;
    if (talk) {
      talk.inputLock -= dt;
      if (talk.inputLock > 0) return;
      if (talk.asking) {
        if (input.justPressed('a')) answer(true);
        else if (input.justPressed('b')) answer(false);
        return;
      }
      const held = ctx.items && ctx.items.held;
      const skip = input.justPressed('triggerR') || input.justPressed('triggerL') ||
        (input.justPressed('gripR') && !(held && held.right)) || (input.justPressed('gripL') && !(held && held.left));
      if (skip) next();
      return;
    }
    if (cool > 0) return;
    // point and pull the trigger
    for (const [hand, b] of [['right', 'triggerR'], ['left', 'triggerL']]) {
      if (!input.justPressed(b)) continue;
      const n = pointedAt(hand);
      if (n) { start(n, 'point'); return; }
    }
    // look at someone from close by for 0.8 s ('wave+gaze', the default)
    if (setting(ctx, 'talkGesture', 'wave+gaze') !== 'button') {
      playerPos(ctx, _p);
      const n = nearest(_p.x, _p.z, GAZE_R, false);
      if (n && inViewOf(n, 12)) { if (gazeId === n.id) gazeT += dt; else { gazeId = n.id; gazeT = dt; } }
      else { gazeId = null; gazeT = 0; }
      if (gazeT >= GAZE_T) { gazeId = null; gazeT = 0; start(n, 'gaze'); }
    }
  }

  const N = {
    list, byId,
    get talking() { return talk ? { id: talk.npc.id, i: talk.i, of: talk.lines.length, asking: talk.asking } : null; },
    get nearId() { return nearId; },
    talk(id) { return start(byId[id], 'api'); },
    near(x, z, r = 3) { return list.filter((n) => n.visible && Math.hypot(n.x - x, n.z - z) <= r); },
    answer,
    skip() { if (talk && !talk.asking) next(); },
    /** PC: E near someone in view (ui/talk.js) */
    pressTalk() {
      if (talk) { if (talk.asking) return answer(true); next(); return true; }
      if (cool > 0) return false;
      playerPos(ctx, _p);
      const n = nearest(_p.x, _p.z, 2.8, true);
      return n ? start(n, 'key') : false;
    },
    update(dt) {
      if (!loaded) { loaded = load(); if (!loaded) return; }
      if (dt <= 0) return;
      if (cool > 0) cool -= dt;
      playerPos(ctx, _p);
      let near = null, nd = TAG;
      for (const npc of list) {
        const s = stateFor(npc);
        const dist = Math.hypot(npc.x - _p.x, npc.z - _p.z);
        behave(npc, dt, s, dist);
        if (npc.nodT > 0) { npc.nodT -= dt; if (npc.nodT <= 0 && !(talk && talk.npc === npc)) npc.folk.setPose(npc.id === 'gando' && !npc.looking ? 'work' : 'idle', 0.4); }
        place(npc);
        if (npc.visible && dist < nd) { nd = dist; near = npc; }
      }
      const nid = near ? near.id : null;
      if (nid !== nearId) { nearId = nid; emit(ctx, 'npc:near', { id: nid, name: near ? near.def.name : '', en: near ? near.def.en : '' }); }
      // the talk: lines advance; walking off or a fight ends it
      if (talk) {
        const T = talk, npc = T.npc;
        const dist = Math.hypot(npc.x - _p.x, npc.z - _p.z);
        if (dist > LEAVE || (G.enemies && G.enemies.inCombat && G.enemies.inCombat())) end(false, null);
        else {
          T.t += dt;
          // the head bobs while a line is being said
          npc.folk.setTalk(!T.asking && T.t < 1.2 ? 0.5 + 0.5 * Math.abs(Math.sin(T.t * 12)) : 0);
          if (T.asking) { T.askT += dt; if (T.askT > ASK_T) end(true, false); }
          else if (T.t >= LINE_T) next();
        }
      }
      inputTick(dt);
    },
  };
  // A4 gestures (when they arrive): a wave starts a talk with whoever is near and in view; nod / shake answer
  ctx.events?.on?.('gesture', (p) => {
    if (!p) return;
    if (p.kind === 'nod') { answer(true); return; }
    if (p.kind === 'shake') { answer(false); return; }
    if (p.kind === 'wave' && !talk && cool <= 0 && setting(ctx, 'talkGesture', 'wave+gaze') !== 'button') {
      playerPos(ctx, _p);
      const n = nearest(_p.x, _p.z, NOTICE, true);
      if (n) start(n, 'wave');
    }
  });
  return N;
}
