// js/game/drill.js — ガンド爺の盾の稽古 (DESIGN_V2 §4.6-1, OPUS-B). The training dummy swings slowly at you
// (a 1.4 s warning, no damage); push the shield out as it lands. Too early / too late is said above the dummy.
// Three perfect parries break it — then one counter strike (≥ 3 m/s) ends the lesson: 10 light shards.
// Repeatable. Started by talking to Gando (npcs.js) once you carry a sword and a shield.
import * as THREE from 'three';
import { emit, toast, fx, flash, playerPos, headPos } from './util.js';

const WINDUP = 1.4, GAP = 1.6, NEED = 3, NEAR = 4.5, LEAVE = 14;
const ATK = { id: 'drill', kind: 'sphere', windup: WINDUP, damage: 0 };

export function createDrill(ctx, G) {
  const _p = new THREE.Vector3(), _h = new THREE.Vector3();
  const shape = { kind: 'sphere', center: new THREE.Vector3(), radius: 0.2 };
  const src = { id: 'drill-dummy', type: 'dummy', pos: new THREE.Vector3(), center: new THREE.Vector3() };
  const owner = {};                       // telegraph owner key
  let active = false, phase = 'idle', t = 0, good = 0, dummy = null, hitRT = -1, cued = false, lateWatch = 0, pushRT = -10;
  const _n = new THREE.Vector3();
  const rt = () => performance.now() / 1000;

  const D = {
    get active() { return active; },
    get progress() { return { phase, good, need: NEED }; },
    get dummy() { return dummy; },
    /** can it start now? (sword + shield carried) */
    ready() { const inv = G.inventory; return !!(inv && inv.has('sword') && inv.has('shield')); },
    start(near) {
      if (!D.ready()) return false;
      dummy = pickDummy(near);
      if (!dummy) return false;
      active = true; phase = 'walk'; good = 0; t = 0;
      src.pos.copy(dummy.c); src.center.copy(dummy.c);
      emit(ctx, 'drill:start', { dummy: dummy.prop ? dummy.prop.id : null });
      playerPos(ctx, _p);
      if (Math.hypot(_p.x - dummy.c.x, _p.z - dummy.c.z) > NEAR) toast(ctx, '木人の前に立とう — 盾を構えて', 'STAND BEFORE THE DUMMY · RAISE YOUR SHIELD', 'quest', 4000, 'drill');
      return true;
    },
    stop(done = false) {
      if (!active) return;
      active = false; phase = 'idle';
      G.enemies && G.enemies.telegraphHide && G.enemies.telegraphHide(owner);
      G.enemies && G.enemies.goldAt && G.enemies.goldAt(null);
      emit(ctx, 'drill:end', { done });
    },
    update(dt) {
      if (!active || dt <= 0) return;
      if (!dummy || !G.enemies) { D.stop(false); return; }
      playerPos(ctx, _p);
      const d = Math.hypot(_p.x - dummy.c.x, _p.z - dummy.c.z);
      if (phase !== 'walk' && (d > LEAVE || (G.enemies.inCombat && G.enemies.inCombat()))) { toast(ctx, '稽古はまた今度', 'DRILL STOPPED', 'info', 2500, 'drill'); D.stop(false); return; }
      t += dt;
      trackPush();
      if (lateWatch > 0) {
        lateWatch -= dt;
        if (pushRT > hitRT) { lateWatch = 0; say('おそい！', 'LATE'); }     // pushed just after the blow
      }
      switch (phase) {
        case 'walk':
          if (d <= NEAR) { phase = 'rest'; t = GAP - 0.4; emit(ctx, 'drill:ready', {}); }
          break;
        case 'rest':
          if (t >= GAP) {
            phase = 'windup'; t = 0; cued = false;
            headPos(ctx, _h);
            const chest = (ctx.player && ctx.player.body && ctx.player.body.chestPos) || _h;
            shape.center.copy(chest);
            G.enemies.telegraphShow(owner, 'sphere', { x: chest.x, z: chest.z, radius: 0.45, dur: WINDUP });
            emit(ctx, 'enemy:telegraph', { id: src.id, type: 'dummy', attack: 'drill', kind: 'sphere', duration: WINDUP, pos: dummy.c });
          }
          break;
        case 'windup':
          if (!cued && t >= WINDUP - 0.25) { cued = true; emit(ctx, 'enemy:cue', { id: src.id, type: 'dummy', attack: 'drill', pos: dummy.c, mercy: true }); }
          if (t >= WINDUP) {
            G.enemies.telegraphHide(owner);
            const chest = (ctx.player && ctx.player.body && ctx.player.body.chestPos) || shape.center;
            shape.center.copy(chest);
            hitRT = rt();
            G.enemies.resolveAttack(src, shape, ATK, dummy.c, { noDamage: true });
            judge(G.enemies.lastBlock);
            phase = good >= NEED ? 'broken' : 'rest'; t = 0;
            if (phase === 'broken') {
              G.enemies.goldAt(dummy.c);
              emit(ctx, 'enemy:break', { id: src.id, type: 'dummy', duration: 6 });
              toast(ctx, 'いまだ！ 返し斬り — 強く斬りつけよう', 'NOW · THE COUNTER STRIKE', 'quest', 4000, 'drill');
            }
          }
          break;
        case 'broken':
          if (t > 8) { G.enemies.goldAt(null); phase = 'rest'; good = NEED - 1; t = 0; say('もう一度', 'ONCE MORE'); }
          break;
      }
    },
  };

  function pickDummy(near) {
    const list = (G.props && G.props.dummies) || [];
    let best = null, bd = Infinity;
    const at = near || playerPos(ctx, _p);
    for (const o of list) { const d = Math.hypot(o.c.x - at.x, o.c.z - at.z); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  function shieldHand() {
    const h = ctx.items && ctx.items.held;
    if (!h) return null;
    if (h.left && h.left.def && h.left.def.block) return 'left';
    if (h.right && h.right.def && h.right.def.block) return 'right';
    return null;
  }
  /** feedback only (the perfect window is items' blockTest): when the shield face was last pushed out fast */
  function trackPush() {
    const hand = shieldHand(), inst = hand && ctx.items.held[hand];
    const v = hand && ctx.input && ctx.input.hands && ctx.input.hands[hand] && ctx.input.hands[hand].vel;
    if (!inst || !v || !inst.quat) return;
    _n.set(1, 0, 0).applyQuaternion(inst.quat);
    if (v.dot(_n) >= ((inst.def.block && inst.def.block.parrySpeed) || 1.5)) pushRT = rt();
  }
  function say(text, en) {
    const pos = _h.copy(dummy.c); pos.y += 1.0;
    emit(ctx, 'ui:float', { text, en, pos: pos.clone(), ms: 1300 });
  }
  function judge(b) {
    const r = b && b.result;
    if (r === 'perfect') {
      good++;
      say(good >= NEED ? 'ジャスト！ 崩れた！' : `ジャスト！ ${good} / ${NEED}`, 'PERFECT');
      emit(ctx, 'drill:progress', { good, need: NEED });
    } else if (r === 'parry' || ((r === 'block' || r === 'guardbreak') && rt() - pushRT < 0.6)) say('はやい！', 'EARLY');
    else if (r === 'block') { say('押し出して！', 'PUSH IT OUT'); lateWatch = 0.35; }
    else if (r === 'hit') { say('盾を構えて', 'RAISE THE SHIELD'); lateWatch = 0.35; }
    else if (r === 'dodge') say('よけた — 次は盾で', 'DODGED · NOW USE THE SHIELD');
  }

  // the counter on the broken dummy
  ctx.events?.on?.('hit', (p) => {
    if (!active || phase !== 'broken' || !p || p.targetKind !== 'dummy') return;
    if (dummy && dummy.prop && p.targetId && !String(p.targetId).includes(dummy.prop.id)) return;
    if (p.speed != null && p.speed < 3) { say('もっと強く！', 'HARDER'); return; }
    const pos = dummy.c.clone();
    fx(ctx, 'spark', pos, { count: 30, color: 0xffd76a, speed: 4.5 });
    fx(ctx, 'ring', pos, { color: 0xffd76a, size: 0.9 });
    flash(ctx, pos, { color: 0xffd76a, size: 2.4, life: 0.4 });
    emit(ctx, 'counter', { id: src.id, type: 'dummy', damage: (p.damage || 6) * 2.5, killed: false });
    emit(ctx, 'ui:title', { text: '返し斬り！', sub: 'COUNTER STRIKE · 稽古 完了' });
    if (G.pickups && G.pickups.dropShards) G.pickups.dropShards(pos, 10);
    const F = G.quest && G.quest.flags;
    if (F) { F.drill = (F.drill || 0) + 1; G.requestSave && G.requestSave(true); }
    D.stop(true);
  });
  return D;
}
