// js/items/waybell.js — the waybell (§4.1, §3.1), OPUS-A: shaking it (≥ 4 direction reversals within 0.9 s at
// ≥ 1 m/s) — or the X button — rings it: 'item:use' { action:'ring' } and a 6 s ribbon of light toward the
// tracked objective (game.quest.objective) through world.fx.ribbon.
import * as THREE from 'three';
const HANDS = ['left', 'right'];

const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _ax = new THREE.Vector3();

export function createWaybell(ctx, I) {
  const input = ctx.input;
  const st = { left: { revs: [], last: 0, sign: 0, t: -10 }, right: { revs: [], last: 0, sign: 0, t: -10 } };
  let lastRing = -10;

  function ring(hand) {
    const now = ctx.clock.time;
    const def = I.defs.waybell.bell;
    if (now - lastRing < def.cooldown) return false;
    lastRing = now;
    const h = hand ? input.hands[hand] : null;
    _from.copy(h ? h.pos : input.head.pos);
    if (!h) _from.y -= 0.3;
    ctx.events.emit('item:use', { itemId: 'waybell', action: 'ring', hand: hand || null });
    if (hand) input.haptic(hand, 0.4, 60);
    const obj = ctx.game?.quest?.objective;
    if (obj && Number.isFinite(obj.x) && Number.isFinite(obj.z)) {
      let y = 0;
      try { y = ctx.world.heightAt(obj.x, obj.z) + 1.5; } catch { y = _from.y; }
      _to.set(obj.x, y, obj.z);
      try { ctx.world?.fx?.ribbon?.(_from, _to, { color: 0xffd76a, life: def.ribbon }); } catch { /* stub */ }
    } else {
      ctx.events.emit('ui:toast', { text: 'いまは道しるべがない', sub: 'NO WAYPOINT', kind: 'info', ms: 1800 });
    }
    I.fx('shard', _from, { count: 8 });
    return true;
  }

  function update(dt) {
    const now = ctx.clock.time;
    for (const hand of HANDS) {
      const inst = I.held[hand];
      const s = st[hand];
      if (!inst || inst.id !== 'waybell') { s.revs.length = 0; s.sign = 0; continue; }
      const B = inst.def.bell;
      const v = input.hands[hand].vel;
      const sp = v.length();
      if (sp >= B.minSpeed) {
        // the shake axis follows the dominant direction of fast motion (re-seeded after a pause)
        _ax.copy(v).multiplyScalar(1 / sp);
        if (s.sign === 0 || now - s.last > 0.5) { s.ax = s.ax || new THREE.Vector3(); s.ax.copy(_ax); s.sign = 1; }
        const sg = _ax.dot(s.ax) >= 0 ? 1 : -1;
        if (sg !== s.sign) { s.sign = sg; s.revs.push(now); }
        s.ax.lerp(_ax.multiplyScalar(sg), 0.3).normalize();
        s.last = now;
      }
      while (s.revs.length && now - s.revs[0] > B.window) s.revs.shift();
      if (s.revs.length >= B.reversals) { s.revs.length = 0; ring(hand); }
    }
    // X button (left controller) also rings it
    if (input.justPressed('x')) {
      const owns = ctx.game && !ctx.game.isStub ? ctx.game.inventory?.has?.('waybell') : true;
      if (owns) ring(null);
    }
  }
  return { update, ring };
}
