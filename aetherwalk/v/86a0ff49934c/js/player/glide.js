// js/player/glide.js — arms-spread detection and gliding with the wind cloak (§2.5, §10.8), OPUS-A.
// Arms spread: both hands at shoulder height ±0.25 m and at least 1.6 × arm length apart.
// Gliding: in the air, with abilities.glide, arms spread, ≥ 1 m above ground → 1.5 m/s down, 6 m/s forward
// (body.js); game drains 4 tailwind/s (§10.19) — when the gauge is empty the descent is steeper, never a failure.
import * as THREE from 'three';
import { ema } from '../core/util.js';
const HANDS = ['left', 'right'];
const _gd = new THREE.Vector3();

export function createGlide(ctx, P) {
  const input = ctx.input;
  let spreadTime = 0, unspreadTime = 0, gustT = 0;

  function update(dt) {
    const l = input.hands.left, r = input.hands.right, head = input.head;
    const shoulderY = head.localPos.y - 0.25 * (P.headHeight / Math.max(1, P.standHeight)) - 0.02;
    let spread = false;
    if (l.tracked && r.tracked) {
      const sep = Math.hypot(l.localPos.x - r.localPos.x, l.localPos.z - r.localPos.z);
      spread = Math.abs(l.localPos.y - shoulderY) <= 0.25 && Math.abs(r.localPos.y - shoulderY) <= 0.25 && sep >= 0.8 * P.armSpan;
      // learn the arm span from the widest reach seen (grip points sit ~8 cm inside the fingertips)
      if (sep + 0.16 > P.armSpanSeen) P.armSpanSeen = sep + 0.16;
    }
    if (spread) { spreadTime += dt; unspreadTime = 0; } else { unspreadTime += dt; spreadTime = 0; }
    if (!P.armsSpread && spreadTime > 0.1) P.armsSpread = true;
    else if (P.armsSpread && unspreadTime > 0.2) P.armsSpread = false;

    let above = 0;
    try { above = P.pos.y - ctx.world.groundAt(P.pos.x, P.pos.z, P.pos.y - 0.7); } catch { above = 0; }
    const want = !P.grounded && P.abilities.glide && P.armsSpread && (P.gliding || above > 1.0) && P.enabled;
    if (want !== P.gliding) {
      P.gliding = want;
      if (!want) P.glideTired = false;
      ctx.events.emit('player:glide', { on: want });
    }
    // §10.19: game drains the −4/s itself (it watches player.gliding); an empty gauge just means a steeper glide
    if (P.gliding) {
      const v = ctx.game?.vitals;
      P.glideTired = !!v && !ctx.game.isStub && Number.isFinite(v.stamina) && v.stamina <= 0;
    }
    // A-P3-3: wind streams off both hands while gliding (one streak per hand every 0.1 s)
    if (P.gliding && dt > 0) {
      gustT -= dt;
      if (gustT <= 0) {
        gustT = 0.1;
        _gd.set(-Math.sin(P.yaw), 0.15, Math.cos(P.yaw));     // the air flows back past the hands
        for (const h of HANDS) if (input.hands[h].tracked) { try { ctx.world?.fx?.emit?.('gust', input.hands[h].pos, { count: 1, dir: _gd, speed: 4 }); } catch { /* stub */ } }
      }
    }
    P.glideBlend = (P.glideBlend || 0) + ((P.gliding ? 1 : 0) - (P.glideBlend || 0)) * ema(0.3, dt || 0.016);
  }
  return { update };
}
