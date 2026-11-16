// js/core/registry.js — the two cross-owner ledgers (§10.5, OPUS-A): zones (fire / wind / water / cook / heat)
// and targets (things weapons, arrows and blasts can hit). Spheres only; no allocation per query
// (result records come from an internal pool and are reused by the next call: copy what you keep).
import * as THREE from 'three';
import { sweepSphereT, segmentClosestT } from './util.js';

const ZONE_KINDS = new Set(['fire', 'wind', 'water', 'cook', 'heat']);

export function createZones() {
  const list = [];
  const zones = {
    list,
    add({ kind, pos, r = 0.3, owner = null, data = null } = {}) {
      if (!ZONE_KINDS.has(kind)) kind = String(kind || 'heat');
      const zone = { kind, pos: pos && pos.isVector3 ? pos : new THREE.Vector3().copy(pos || { x: 0, y: 0, z: 0 }), r, owner, data, active: true };
      list.push(zone);
      return zone;
    },
    remove(zone) {
      if (!zone) return;
      const i = list.indexOf(zone);
      if (i >= 0) list.splice(i, 1);
      zone.active = false;
    },
    query(kind, pos, r = 0, out = []) {
      out.length = 0;
      for (let i = 0; i < list.length; i++) {
        const z = list[i];
        if (kind && z.kind !== kind) continue;
        const R = z.r + r;
        if (z.pos.distanceToSquared(pos) <= R * R) out.push(z);
      }
      return out;
    },
    any(kind, pos, r = 0, exclude = null) {
      for (let i = 0; i < list.length; i++) {
        const z = list[i];
        if (z.kind !== kind || (exclude && (z === exclude || z.owner === exclude))) continue;
        const R = z.r + r;
        if (z.pos.distanceToSquared(pos) <= R * R) return z;
      }
      return null;
    },
  };
  return zones;
}

export function createTargets() {
  const list = [];
  let nextId = 1;
  // result pools
  const sweepPool = [], overlapPool = [];
  const getSweep = (i) => sweepPool[i] || (sweepPool[i] = { target: null, sphere: null, point: new THREE.Vector3(), t: 0 });
  const getOverlap = (i) => overlapPool[i] || (overlapPool[i] = { target: null, sphere: null, dist: 0 });
  const _p = new THREE.Vector3();

  const targets = {
    list,
    add({ id, kind = 'prop', spheres = [], onHit = null, owner = null, enabled = true } = {}) {
      const target = { id: id != null ? id : 'target' + nextId++, kind, spheres, onHit, owner, enabled };
      list.push(target);
      return target;
    },
    remove(target) {
      const i = list.indexOf(target);
      if (i >= 0) list.splice(i, 1);
      if (target) target.enabled = false;
    },
    /** swept sphere (radius) along p0→p1 against every target sphere; sorted by t (first contact) */
    sweep(p0, p1, radius = 0, out = []) {
      out.length = 0;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const tg = list[i];
        if (tg.enabled === false || !tg.spheres) continue;
        for (let j = 0; j < tg.spheres.length; j++) {
          const s = tg.spheres[j];
          if (!s || !s.c) continue;
          const t = sweepSphereT(p0, p1, s.c, s.r + radius);
          if (t < 0) continue;
          const rec = getSweep(n++);
          rec.target = tg; rec.sphere = s; rec.t = t;
          // contact point: on the sphere surface, toward the moving point at contact
          _p.copy(p1).sub(p0).multiplyScalar(t).add(p0);
          rec.point.copy(_p).sub(s.c);
          const L = rec.point.length();
          if (L > 1e-6) rec.point.multiplyScalar(Math.min(1, s.r / L)).add(s.c); else rec.point.copy(s.c);
          out.push(rec);
        }
      }
      if (out.length > 1) out.sort((a, b) => a.t - b.t);
      return out;
    },
    /** static capsule a→b (radius) vs every sphere, in order along a→b */
    capsule(a, b, radius = 0, out = []) {
      out.length = 0;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const tg = list[i];
        if (tg.enabled === false || !tg.spheres) continue;
        for (let j = 0; j < tg.spheres.length; j++) {
          const s = tg.spheres[j];
          if (!s || !s.c) continue;
          const t = segmentClosestT(a.x, a.y, a.z, b.x, b.y, b.z, s.c.x, s.c.y, s.c.z);
          _p.copy(b).sub(a).multiplyScalar(t).add(a);
          const R = s.r + radius;
          if (_p.distanceToSquared(s.c) > R * R) continue;
          const rec = getSweep(n++);
          rec.target = tg; rec.sphere = s; rec.t = t;
          rec.point.copy(_p).sub(s.c);
          const L = rec.point.length();
          if (L > 1e-6) rec.point.multiplyScalar(Math.min(1, s.r / L)).add(s.c); else rec.point.copy(s.c);
          out.push(rec);
        }
      }
      if (out.length > 1) out.sort((a, b) => a.t - b.t);
      return out;
    },
    /** every sphere within radius of center (dist = distance from center to the sphere surface, ≥ 0) */
    overlap(center, radius = 0, out = []) {
      out.length = 0;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const tg = list[i];
        if (tg.enabled === false || !tg.spheres) continue;
        for (let j = 0; j < tg.spheres.length; j++) {
          const s = tg.spheres[j];
          if (!s || !s.c) continue;
          const d = Math.max(0, s.c.distanceTo(center) - s.r);
          if (d > radius) continue;
          const rec = getOverlap(n++);
          rec.target = tg; rec.sphere = s; rec.dist = d;
          out.push(rec);
        }
      }
      if (out.length > 1) out.sort((a, b) => a.dist - b.dist);
      return out;
    },
  };
  return targets;
}
