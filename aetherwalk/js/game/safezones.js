// js/game/safezones.js — fire safe zones (OPUS-B). The Nagi fear fire: no group or encounter spawns, and no
// chase, inside ~35 m of a lit waylight (campfire), ~12 m of a lit brazier, or on the start stage. A chasing
// Nagi that reaches the edge recoils (enemies.js); the player gets a warm cue on entering (ui/zonecue.js).
import * as THREE from 'three';
import { landmark, playerPos, emit } from './util.js';

export const SAFE_R = { waylight: 35, brazier: 12, start: 30 };
const LEAVE_PAD = 1.5;          // hysteresis for the player's enter / leave cue

export function createSafeZones(ctx, G) {
  const zones = [];             // { x, z, r, kind, id }
  const _p = new THREE.Vector3();
  let rebuildT = 0, inside = null;

  const byId = new Map();        // stable zone objects (the player's "inside" survives a rebuild)
  function put(id, kind, x, z, r) {
    let o = byId.get(id);
    if (!o) { o = { id, kind, x, z, r }; byId.set(id, o); }
    o.x = x; o.z = z; o.r = r;
    zones.push(o);
  }
  function rebuild() {
    zones.length = 0;
    const C = G.checkpoints;
    if (C) {
      for (const l of C.lights) if (l.lit) put(l.id, 'waylight', l.x, l.z, SAFE_R.waylight);
      for (const b of C.braziers) if (b.lit) put(b.id, 'brazier', b.x, b.z, SAFE_R.brazier);
    }
    const st = landmark(ctx, 'start');
    if (st) put('start', 'start', st.x, st.z, SAFE_R.start);
  }

  const S = {
    zones,
    /** the safe zone containing (x, z), widened by margin (m; negative = deeper inside), or null */
    at(x, z, margin = 0) {
      for (const s of zones) {
        const dx = x - s.x, dz = z - s.z, r = s.r + margin;
        if (r > 0 && dx * dx + dz * dz < r * r) return s;
      }
      return null;
    },
    /** the zone the player stands in (with hysteresis), or null */
    get playerZone() { return inside; },
    /** armed: a melee weapon is owned (the zone cue and its first-time hint only matter from then on) */
    armed() { const inv = G.inventory; return !!(inv && (inv.has('sword') || inv.has('spear'))); },
    rebuild,
    update(dt) {
      rebuildT -= dt;
      if (rebuildT <= 0) { rebuildT = 1; rebuild(); }
      playerPos(ctx, _p);
      let z = null;
      if (inside) {
        // stay "inside" until a little past the edge (no flicker on the line)
        const dx = _p.x - inside.x, dz = _p.z - inside.z;
        if (zones.includes(inside) && dx * dx + dz * dz < (inside.r + LEAVE_PAD) ** 2) z = inside;
        else z = S.at(_p.x, _p.z);
      } else z = S.at(_p.x, _p.z);
      if (z === inside) return;
      const was = inside;
      inside = z;
      const quiet = !G.quest || G.quest.stage === 0 || !S.armed();
      if (was && !z) emit(ctx, 'safe:leave', { id: was.id, kind: was.kind, quiet });
      else if (z) emit(ctx, 'safe:enter', { id: z.id, kind: z.kind, quiet: quiet || !!was });
    },
  };
  // a fire lit (or put out) changes the map at once
  ctx.events?.on?.('fire:lit', () => { rebuildT = 0; });
  ctx.events?.on?.('fire:out', () => { rebuildT = 0; });
  return S;
}
