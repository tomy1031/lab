// js/player/glide.js — arms-spread detection and gliding with the wind cloak (§2.5, §10.8), OPUS-A.
// Arms spread: both hands at shoulder height ±0.25 m and at least 1.6 × arm length apart.
// Gliding: in the air, with abilities.glide, arms spread, ≥ 1 m above ground → 1.5 m/s down, 6 m/s forward
// (body.js), costs 4 tailwind/s (when the gauge is empty the descent is steeper — never a fall into failure).
import { ema } from '../core/util.js';

export function createGlide(ctx, P) {
  const input = ctx.input;
  let spreadTime = 0, unspreadTime = 0;

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
    if (P.gliding && dt > 0) {
      const v = ctx.game?.vitals;
      if (v && typeof v.spendStamina === 'function') {
        const ok = v.spendStamina(4 * dt);
        P.glideTired = ok === false;
      }
    }
    P.glideBlend = (P.glideBlend || 0) + ((P.gliding ? 1 : 0) - (P.glideBlend || 0)) * ema(0.3, dt || 0.016);
  }
  return { update };
}
