// js/items/melee.js — weapon hits (§5.1), OPUS-A.
// Each frame a held weapon's blade is sampled base→tip (≤ 15 cm apart) in rig space; the surface the blade
// swept since the last frame (two triangles per blade segment, inflated by melee.radius) is tested against
// every ctx.targets sphere, so a fast swing can't tunnel through a target between frames. Only *entering*
// contact counts (resting the blade inside a target never re-hits), once per target per cooldown.
// Speed = tip velocity relative to the body (rig space, so walking or snap-turning is not a swing), EMA 60 ms.
// Also: 'swing' events, haptics, the swing trail (brighter with tailwind), sparks on rock, and the wind blade.
import * as THREE from 'three';
import { HAPTIC } from '../core/config.js';
import { ema, clamp } from '../core/util.js';
const HANDS = ['left', 'right'];

const MAXP = 12;
const TRAIL = 14;
const _tri = new THREE.Triangle();
const _cp = new THREE.Vector3(), _bp = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _ax = new THREE.Vector3();
const _rq = new THREE.Quaternion(), _hitDir = new THREE.Vector3(), _hitPt = new THREE.Vector3();
const _ray = {}, _rayDir = new THREE.Vector3();

function makeHandState() {
  const arr = () => Array.from({ length: MAXP }, () => new THREE.Vector3());
  return {
    inst: null, has: false, n: 0, spacing: 0.15,
    prevL: arr(), curL: arr(), prevW: arr(), curW: arr(),
    vel: new THREE.Vector3(), speed: 0, raw: 0,
    armed: true, swingStart: 0, swingHit: false,
    lastHit: new Map(),
    galeT: -10, sparkT: -10,
    hits: Array.from({ length: 8 }, () => ({ target: null, sphere: null, d: 0, point: new THREE.Vector3() })), nh: 0,
    trail: null, trailK: 0, _pt: new THREE.Vector3(),
  };
}

export function createMelee(ctx, I) {
  const input = ctx.input;
  const H = { left: makeHandState(), right: makeHandState() };

  // ── trails: one strip per hand, world space, alpha fades with age ──
  function makeTrail() {
    const pos = new Float32Array(TRAIL * 2 * 3), col = new Float32Array(TRAIL * 2 * 4);
    const idx = [];
    for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false;
    m.visible = false;
    m.renderOrder = 6;
    m.name = 'swing-trail';
    ctx.scene.add(m);
    return { mesh: m, pos, col, base: Array.from({ length: TRAIL }, () => new THREE.Vector3()), tip: Array.from({ length: TRAIL }, () => new THREE.Vector3()), head: 0, filled: 0, alpha: 0 };
  }

  /** grip-space sample points of a weapon (base → tip), returns count */
  function samples(inst, out) {
    const m = inst.def.melee;
    if (m.bash) {
      out[0].set(0.07, 0.02, 0).applyQuaternion(inst.holdQuat).add(inst.holdPos);
      return 1;
    }
    const from = m.from || 0.05, to = m.reach;
    const n = clamp(Math.ceil((to - from) / 0.15) + 1, 2, MAXP);
    for (let i = 0; i < n; i++) out[i].set(0, 0, -(from + ((to - from) * i) / (n - 1))).applyQuaternion(inst.holdQuat).add(inst.holdPos);
    return n;
  }

  function polylineDist(pts, n, c) {
    if (n === 1) return pts[0].distanceTo(c);
    let best = Infinity;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      _d.copy(b).sub(a);
      const L = _d.lengthSq();
      const t = L > 1e-12 ? clamp(_v.copy(c).sub(a).dot(_d) / L, 0, 1) : 0;
      _v.copy(a).addScaledVector(_d, t);
      const dd = _v.distanceTo(c);
      if (dd < best) best = dd;
    }
    return best;
  }

  /** targets entered by the swept blade this frame → st.hits[0..nh) */
  function sweptHits(st, rad) {
    st.nh = 0;
    const n = st.n;
    const list = ctx.targets.list;
    // bounds of the swept area
    _bp.set(0, 0, 0);
    for (let i = 0; i < n; i++) _bp.add(st.prevW[i]).add(st.curW[i]);
    _bp.multiplyScalar(1 / (2 * n));
    let br = 0;
    for (let i = 0; i < n; i++) br = Math.max(br, _bp.distanceTo(st.prevW[i]), _bp.distanceTo(st.curW[i]));
    for (let ti = 0; ti < list.length; ti++) {
      const tg = list[ti];
      if (tg.enabled === false || !tg.spheres || tg.owner === 'player') continue;
      let best = Infinity, bestS = null;
      for (let si = 0; si < tg.spheres.length; si++) {
        const s = tg.spheres[si];
        if (!s || !s.c) continue;
        const R = s.r + rad;
        if (s.c.distanceToSquared(_bp) > (br + R) * (br + R)) continue;
        let d = Infinity;
        if (n === 1) {
          // a moving sphere (shield bash): segment prev→cur
          const a = st.prevW[0], b = st.curW[0];
          _d.copy(b).sub(a);
          const L = _d.lengthSq();
          const t = L > 1e-12 ? clamp(_v.copy(s.c).sub(a).dot(_d) / L, 0, 1) : 0;
          _cp.copy(a).addScaledVector(_d, t);
          d = _cp.distanceTo(s.c);
          _hitPt.copy(_cp);
        } else {
          for (let i = 0; i < n - 1; i++) {
            _tri.set(st.prevW[i], st.curW[i], st.curW[i + 1]);
            _tri.closestPointToPoint(s.c, _cp);
            let dd = _cp.distanceTo(s.c);
            if (dd < d) { d = dd; _hitPt.copy(_cp); }
            _tri.set(st.prevW[i], st.curW[i + 1], st.prevW[i + 1]);
            _tri.closestPointToPoint(s.c, _cp);
            dd = _cp.distanceTo(s.c);
            if (dd < d) { d = dd; _hitPt.copy(_cp); }
          }
        }
        if (d > R) continue;
        // entering only: not already touching at the previous pose
        if (polylineDist(st.prevW, n, s.c) <= R) continue;
        if (d - s.r < best) { best = d - s.r; bestS = s; st._pt.copy(_hitPt); }
      }
      if (bestS && st.nh < st.hits.length) {
        const h = st.hits[st.nh++];
        h.target = tg; h.sphere = bestS; h.d = best;
        // contact point on the sphere surface toward the blade
        h.point.copy(st._pt).sub(bestS.c);
        const L = h.point.length();
        if (L > 1e-6) h.point.multiplyScalar(Math.min(1, bestS.r / L)).add(bestS.c); else h.point.copy(bestS.c);
      }
    }
    return st.nh;
  }

  function haptic(hand, k) { input.haptic(hand, HAPTIC[k][0], HAPTIC[k][1]); }

  function strike(hand, st, inst, h, now) {
    const m = inst.def.melee;
    const last = st.lastHit.get(h.target);
    if (last != null && now - last < m.cooldown) return;
    st.lastHit.set(h.target, now);
    // the EMA (§5.1) lags the first frames of a swing: never rate a hit below this frame's own tip speed
    const speed = Math.max(st.speed, st.raw * 0.9);
    // direction of the hit: the blade's motion (world), fallback the blade axis
    _hitDir.copy(st.vel);
    if (_hitDir.lengthSq() < 1e-6) _hitDir.copy(st.curW[st.n - 1]).sub(st.curW[0]);
    _hitDir.normalize();
    // thrust: motion within 30° of the blade axis
    let type = m.type, damage = 0;
    if (st.n > 1) {
      _ax.copy(st.curW[st.n - 1]).sub(st.curW[0]).normalize();
      const cos = _ax.dot(_hitDir);
      const along = st.vel.dot(_ax);
      if (cos >= Math.cos(Math.PI / 6) && along >= (m.thrustSpeed || m.minSpeed)) type = 'thrust';
      else if (m.type === 'thrust') type = 'slash';     // a spear's sweep (払い)
    }
    const strong = speed >= m.strongSpeed;
    if (speed >= m.minSpeed) {
      const temper = (ctx.game?.inventory?.temper?.[inst.id]) | 0;
      damage = (type === 'thrust' ? m.thrust : m.base) + temper;
      if (strong && type !== 'thrust') damage *= m.strongMul;
      else if (strong) damage *= Math.max(1, m.strongMul * 0.9);
      let element = inst.state.lit ? 'fire' : (inst.def.element === 'wind' ? 'wind' : 'none');
      if (inst.state.lit && m.fireBonus) damage += m.fireBonus;
      damage *= I.damageMul();
      const hit = { source: 'player', itemId: inst.id, type: type === 'slash' && m.type === 'blunt' ? 'blunt' : type, damage, element,
        point: h.point, dir: _hitDir, speed, hand, part: h.sphere.part || 'body' };
      const res = I.hitTarget(h.target, hit);
      st.swingHit = true;
      if (hit.part === 'armor' && !res.blocked) { haptic(hand, 'armor'); setTimeout(() => haptic(hand, 'armor'), 60); }
      else haptic(hand, strong ? 'strong' : 'weak');
      I.fx('spark', h.point, { count: strong ? 16 : 8, color: inst.state.lit ? 0xffb347 : hit.part === 'armor' ? 0xfff1d6 : 0xffd76a, dir: _hitDir, speed: 3 });
      if (strong) I.fx('ring', h.point, { color: 0xfffbe8, size: 0.6 });
    } else {
      // a touch: no damage, just "tok"
      const hit = { source: 'player', itemId: inst.id, type: m.type, damage: 0, element: 'none', point: h.point, dir: _hitDir, speed, hand, part: h.sphere.part || 'body' };
      I.hitTarget(h.target, hit);
      input.haptic(hand, 0.15, 12);
    }
  }

  function updateTrail(st, inst, show, tier) {
    if (!st.trail) { if (!show) return; st.trail = makeTrail(); }
    const T = st.trail;
    const n = st.n;
    // push the newest blade (world)
    T.head = (T.head + 1) % TRAIL;
    T.base[T.head].copy(st.curW[Math.max(0, n > 2 ? 1 : 0)]);
    T.tip[T.head].copy(st.curW[n - 1]);
    if (T.filled < TRAIL) T.filled++;
    const want = show ? 1 : 0;
    T.alpha += (want - T.alpha) * (show ? 0.5 : 0.18);
    if (T.alpha < 0.02) { T.mesh.visible = false; T.filled = Math.min(T.filled, 1); return; }
    T.mesh.visible = true;
    const c = tier >= 2 ? [0.5, 0.92, 1] : tier >= 1 ? [1, 0.85, 0.42] : [1, 0.98, 0.9];
    const a0 = (tier >= 1 ? 0.75 : 0.3) * T.alpha;
    for (let k = 0; k < TRAIL; k++) {
      const j = (T.head - k + TRAIL * 2) % TRAIL;
      const use = k < T.filled ? j : T.head;
      const b = T.base[use], t = T.tip[use];
      const o = k * 2;
      T.pos[o * 3] = b.x; T.pos[o * 3 + 1] = b.y; T.pos[o * 3 + 2] = b.z;
      T.pos[o * 3 + 3] = t.x; T.pos[o * 3 + 4] = t.y; T.pos[o * 3 + 5] = t.z;
      const a = a0 * (1 - k / (TRAIL - 1));
      T.col[o * 4] = c[0]; T.col[o * 4 + 1] = c[1]; T.col[o * 4 + 2] = c[2]; T.col[o * 4 + 3] = a * 0.35;
      T.col[o * 4 + 4] = c[0]; T.col[o * 4 + 5] = c[1]; T.col[o * 4 + 6] = c[2]; T.col[o * 4 + 7] = a;
    }
    T.mesh.geometry.attributes.position.needsUpdate = true;
    T.mesh.geometry.attributes.color.needsUpdate = true;
  }

  function update(dt) {
    const now = ctx.clock.time;
    const rdt = clamp(input.rawDt || dt, 1e-3, 0.1);
    const rig = ctx.rig;
    rig.updateMatrixWorld();
    _rq.copy(rig.quaternion);
    const tier = ctx.game?.vitals?.tier | 0;
    for (const hand of HANDS) {
      const st = H[hand];
      const inst = I.held[hand];
      if (!inst || !inst.def.melee) {
        st.inst = null; st.has = false; st.speed = 0; st.vel.set(0, 0, 0); st.armed = true;
        if (st.trail && st.trail.mesh.visible) updateTrail(st, inst || { def: {} }, false, tier);
        continue;
      }
      const hd = input.hands[hand];
      if (st.inst !== inst) { st.inst = inst; st.has = false; st.lastHit.clear(); }
      // current blade points: grip space → rig space
      const n = samples(inst, st.curL);
      st.n = n;
      for (let i = 0; i < n; i++) st.curL[i].applyQuaternion(hd.localQuat).add(hd.localPos);
      if (!st.has) {
        for (let i = 0; i < n; i++) st.prevL[i].copy(st.curL[i]);
        st.has = true;
      }
      // world positions of both poses with the *current* rig transform (no snap-turn / walking sweep)
      for (let i = 0; i < n; i++) {
        st.prevW[i].copy(st.prevL[i]).applyMatrix4(rig.matrixWorld);
        st.curW[i].copy(st.curL[i]).applyMatrix4(rig.matrixWorld);
      }
      // tip velocity relative to the body (world axes), EMA 60 ms
      _v.copy(st.curL[n - 1]).sub(st.prevL[n - 1]).divideScalar(rdt).applyQuaternion(_rq);
      st.raw = _v.length();
      st.vel.lerp(_v, ema(0.06, rdt));
      st.speed = st.vel.length();
      if (dt > 0) {
        const m = inst.def.melee;
        // swing start / end
        if (st.armed && st.speed > 3) {
          st.armed = false; st.swingStart = now; st.swingHit = false;
          ctx.events.emit('swing', { hand, itemId: inst.id, speed: st.speed, type: m.type });
          haptic(hand, 'whiff');
        } else if (!st.armed && st.speed < 2) st.armed = true;
        // hits
        const rad = m.radius;
        if (sweptHits(st, rad)) for (let k = 0; k < st.nh; k++) strike(hand, st, inst, st.hits[k], now);
        // sparks on rock / walls (blades pass through the world, §5.1)
        if (st.speed >= m.strongSpeed && now - st.sparkT > 0.25 && ctx.world?.raycastSolid) {
          _rayDir.copy(st.curW[n - 1]).sub(st.prevW[n - 1]);
          const len = _rayDir.length();
          if (len > 1e-3) {
            _rayDir.multiplyScalar(1 / len);
            const r = ctx.world.raycastSolid(st.prevW[n - 1], _rayDir, len, _ray);
            if (r && (r.kind === 'rock' || r.kind === 'structure' || r.kind === 'ground')) {
              st.sparkT = now;
              I.fx('spark', r.point, { count: 10, color: 0xfff1d6 });
              input.haptic(hand, 0.6, 20);
            }
          }
        }
        // wind blade: trigger held, ≥ 5 m/s, tailwind ≥ 50 (costs 30)
        if (inst.def.use === 'gale' && st.speed >= 5 && now - st.galeT > 0.6 && input.pressed(hand === 'left' ? 'triggerL' : 'triggerR')) {
          const v = ctx.game?.vitals;
          if (v && !ctx.game.isStub && (v.stamina ?? 0) >= 50 && v.spendStamina?.(30) !== false) {
            st.galeT = now;
            _d.copy(st.vel).normalize();
            I.proj.fireGale(st.curW[n - 1], _d, hand);
          }
        }
      }
      updateTrail(st, inst, st.speed > 3.2 && dt > 0, tier);
      for (let i = 0; i < n; i++) st.prevL[i].copy(st.curL[i]);
    }
  }

  return {
    update,
    tipSpeed: (hand) => H[hand]?.speed || 0,
    /** blade capsule (world) of a hand for blocking projectiles: { a, b, radius, speed } or null */
    blade(hand) {
      const st = H[hand];
      if (!st.inst || !st.has) return null;
      return { a: st.curW[0], b: st.curW[st.n - 1], radius: st.inst.def.melee.radius, speed: st.speed, inst: st.inst };
    },
    drawCalls() { let n = 0; for (const h of HANDS) if (H[h].trail?.mesh.visible) n++; return n; },
    H,
  };
}
