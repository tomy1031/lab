// js/player/climb.js — grab and climb (DESIGN_V2 §2.2–2.6), OPUS-A.
// Surfaces come from world.climb (world package W2: { list, byId, grabAt(handPos, out), near }) when the world has
// it, plus temporary ones made with AW.debug.addClimb({ x, z, yaw, width, y0, y1, kind }). A hand that grips within
// 0.25 m of a surface is LOCKED where it is; while locked, the rig moves opposite to that hand's motion (1:1), so
// pulling the arm down lifts the body. With two hands locked the one gripped last leads; climbing is hand over hand.
// The head is kept ≥ 0.25 m off the face. Over the top (head above the top edge − 0.3 m and a hand lets go, or
// pulled 0.2 m above it) the body is carried to the top exit in 0.25 s. Both hands open → fall (no damage), unless
// ground is within 0.6 m. Tailwind (§2.3): with ≥ 1, gripping costs 3/s and every pull of ≥ 0.25 m gives +2; at 0 a
// grip holds only 1.5 s and slides down at 0.8 m/s (climb:slip) — quick regrips still get you up. climbAssist (or
// seated) rises 0.8 m/s while gripping. A (Space) on the wall jumps away from it. PC: E at a wall grips with both
// hands, W climbs, S climbs down, E lets go.
import * as THREE from 'three';
import { ema } from '../core/util.js';
import { getSprites } from '../core/gems.js';
const HANDS = ['left', 'right'];
const DEG = Math.PI / 180;

const _hw = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const GLOW = new THREE.Color(0x7fe9ff).multiplyScalar(0.7);

/** a temporary surface (same shape as world.climb's): face plane through (x, z) facing out along yaw */
function makeSurface(o, id) {
  const yaw = (o.yaw || 0) * DEG;
  const s = {
    id, kind: o.kind || 'vine', x: +o.x, z: +o.z, yaw: o.yaw || 0, width: o.width || 4, y0: +o.y0, y1: +o.y1,
    pegs: [], ledges: (o.ledges || []).map((v) => ({ v, depth: 0.9 })),
    n: { x: Math.sin(yaw), z: -Math.cos(yaw) }, r: { x: -Math.cos(yaw), z: -Math.sin(yaw) },
    temp: true,
  };
  s.topExit = { x: s.x - s.n.x * 1.6, y: s.y1, z: s.z - s.n.z * 1.6 };
  return s;
}

export function createClimb(ctx, P, body) {
  const input = ctx.input;
  const sprites = getSprites(ctx);
  const temp = [];                                  // AW.debug.addClimb surfaces
  const tempById = {};
  const hold = {
    left: { on: false, at: new THREE.Vector3(), t: 0, s: null, since: 0, pullFrom: 0, glowAt: new THREE.Vector3() },
    right: { on: false, at: new THREE.Vector3(), t: 0, s: null, since: 0, pullFrom: 0, glowAt: new THREE.Vector3() },
  };
  let seq = 0, lead = null, surf = null, mantle = null, pcGrip = false;
  const C = { surfaceId: null, hands: { left: false, right: false } };
  const grabOut = { id: null, point: new THREE.Vector3(), normal: new THREE.Vector3(), u: 0, v: 0, surface: null };

  const worldClimb = () => { const c = ctx.world?.climb; return c && typeof c.grabAt === 'function' ? c : null; };
  function byId(id) { return tempById[id] || worldClimb()?.byId?.[id] || null; }
  function local(s, p, o) {
    const dx = p.x - s.x, dz = p.z - s.z;
    o.x = dx * s.r.x + dz * s.r.z;              // u (across)
    o.y = p.y - s.y0;                           // v (up)
    o.z = dx * s.n.x + dz * s.n.z;              // d (out of the face)
    return o;
  }
  /** can a hand at p grip something? → fills grabOut, true */
  function grabAt(p) {
    const w = worldClimb();
    if (w && w.grabAt(p, grabOut)) { grabOut.surface = grabOut.surface || w.byId?.[grabOut.id] || null; return !!grabOut.surface; }
    let best = null, bd = 1e9;
    for (const s of temp) {
      local(s, p, _d);
      const H = s.y1 - s.y0;
      if (_d.z > 0.37 || _d.z < -0.15 || Math.abs(_d.x) > s.width / 2 || _d.y < -0.3 || _d.y > H + 0.1) continue;
      const dd = Math.abs(_d.z - 0.12);
      if (dd < bd) { bd = dd; best = s; }
    }
    if (!best) return false;
    local(best, p, _d);
    grabOut.id = best.id; grabOut.surface = best; grabOut.u = _d.x; grabOut.v = Math.max(0, Math.min(best.y1 - best.y0, _d.y));
    grabOut.point.set(best.x + best.r.x * _d.x + best.n.x * 0.12, best.y0 + grabOut.v, best.z + best.r.z * _d.x + best.n.z * 0.12);
    grabOut.normal.set(best.n.x, 0, best.n.z);
    return true;
  }

  function handWorld(hand, out) { return out.copy(input.hands[hand].localPos).applyMatrix4(ctx.rig.matrixWorld); }
  const stamina = () => { const v = ctx.game?.vitals; return v && !ctx.game.isStub && Number.isFinite(v.stamina) ? v : null; };

  function setClimbing(on, s) {
    if (P.climbing === on) return;
    P.climbing = on;
    P.climb = on ? C : null;
    C.surfaceId = on && s ? s.id : null;
    if (on) {
      P.grounded = false;
      body.B.jumped = false; body.B.vy = 0;
    } else {
      // let go: fall from here (body.js takes over), or stand if the ground is right below
      body.B.vy = 0; body.B.fallStartY = P.pos.y; body.B.coyoteT = 9;
      let g = -1e9;
      try { g = ctx.world.groundAt(P.pos.x, P.pos.z, P.pos.y); } catch { /* stub */ }
      P.grounded = P.pos.y - g < 0.6 && P.pos.y >= g - 0.05;
    }
    ctx.events.emit('player:climb', { on, surfaceId: s ? s.id : null });
  }

  /** a hand closes: grip the wall if it can (called by grab.js before items) → true if it gripped */
  function tryGrip(hand) {
    if (!P.enabled || mantle || ctx.items?.held?.[hand]) return false;
    const p = handWorld(hand, _p);
    if (!grabAt(p)) return false;
    const s = grabOut.surface;
    if (surf && s !== surf && P.climbing) return false;           // one surface at a time
    const h = hold[hand];
    h.on = true; h.s = s; h.t = ctx.clock.time; h.since = 0; h.seq = ++seq;
    h.at.copy(p);                                                // locked where the hand is (no snap: 1:1)
    h.glowAt.copy(grabOut.point);
    h.pullFrom = ctx.rig.position.y;
    lead = hand; surf = s;
    C.hands[hand] = true;
    input.haptic(hand, 0.5, 30);
    ctx.events.emit('climb:grab', { hand, surfaceId: s.id, point: grabOut.point });
    setClimbing(true, s);
    return true;
  }
  /** a hand opens: true if it was holding the wall */
  function release(hand, why = 'open') {
    const h = hold[hand];
    if (!h.on) return false;
    h.on = false; C.hands[hand] = false;
    const other = hand === 'left' ? 'right' : 'left';
    lead = hold[other].on ? other : null;
    if (!lead) {
      // over the top edge → mantle; otherwise fall
      if (surf && headY() > surf.y1 - 0.3 && why !== 'slip') { startMantle(); return true; }
      const s = surf;
      surf = null;
      setClimbing(false, s);
    }
    return true;
  }
  const headY = () => input.head.pos.y;

  function startMantle() {
    const s = surf;
    if (!s) return;
    for (const hd of HANDS) { hold[hd].on = false; C.hands[hd] = false; }
    lead = null;
    const ex = s.topExit;
    handWorld('left', _p);                   // (refresh)
    ctx.rig.updateMatrixWorld();
    // feet (under the head) go to the exit: move the rig by (exit − feet)
    const hx = input.head.pos.x, hz = input.head.pos.z;
    mantle = { t: 0, from: ctx.rig.position.clone(), to: ctx.rig.position.clone().add(_d.set(ex.x - hx, ex.y - P.pos.y, ex.z - hz)), s };
    P.mantling = true;
  }
  function finishMantle() {
    const s = mantle.s;
    ctx.rig.position.copy(mantle.to);
    ctx.rig.updateMatrixWorld();
    mantle = null; P.mantling = false;
    surf = null;
    P.pos.y = ctx.rig.position.y;
    P.climbing = false; P.climb = null; C.surfaceId = null;
    P.grounded = true; body.B.vy = 0; body.B.landT = 0; body.B.lastSafe.set(P.pos.x, P.pos.y, P.pos.z);
    ctx.events.emit('climb:top', { surfaceId: s.id });
    ctx.events.emit('player:climb', { on: false, surfaceId: s.id });
  }

  /** keep the head ≥ 0.25 m off the face (push the rig out along the normal) */
  function keepOff(s) {
    ctx.rig.updateMatrixWorld();
    const h = input.head.pos.copy(input.head.localPos).applyMatrix4(ctx.rig.matrixWorld);
    const d = (h.x - s.x) * s.n.x + (h.z - s.z) * s.n.z;
    if (d < 0.25) { ctx.rig.position.x += s.n.x * (0.25 - d); ctx.rig.position.z += s.n.z * (0.25 - d); }
  }

  let lastRigY = 0, moveSpeed = 0, slipFrame = -1;
  function update(dt) {
    if (dt <= 0) return;
    const rig = ctx.rig;
    // the mantle: 0.25 s up and over (vignette strong)
    if (mantle) {
      mantle.t += dt;
      const k = Math.min(1, mantle.t / 0.25), e = k * k * (3 - 2 * k);
      rig.position.lerpVectors(mantle.from, mantle.to, e);
      rig.updateMatrixWorld();
      if (k >= 1) finishMantle();
      moveSpeed = 3; P.climbSpeed = 3;
      return;
    }
    if (!P.climbing) { moveSpeed = 0; P.climbSpeed = 0; return; }
    const s = surf;
    // A on the wall: jump away from it, along where the head looks (3.5 m/s out, 3 m/s up)
    if (input.justPressed('a') && P.enabled) {
      for (const hd of HANDS) { hold[hd].on = false; C.hands[hd] = false; }
      lead = null; surf = null;
      setClimbing(false, s);
      const hy = input.head.yaw;
      let fx = Math.sin(hy), fz = -Math.cos(hy);
      if (fx * s.n.x + fz * s.n.z < 0.2) { fx = s.n.x; fz = s.n.z; }     // never into the wall
      body.B.air.set(fx * 3.5, 0, fz * 3.5); body.B.vy = 3; body.B.jumped = true; P.grounded = false; body.B.landT = 0;
      ctx.events.emit('player:jump', { vy: 3 });
      return;
    }
    const v = stamina();
    const empty = v && v.stamina <= 0;
    const assist = ctx.settings.get('climbAssist') || ctx.settings.get('seated') || (!ctx.flags.xr && pcGrip);
    for (const hd of HANDS) {
      const h = hold[hd];
      if (!h.on) continue;
      h.since += dt;
      // an empty tailwind: a grip holds 1.5 s, sliding down 0.8 m/s, then slips
      if (empty) {
        h.at.y -= 0.8 * dt;
        if (h.since > 1.5 && !pcGrip) {
          if (ctx.clock.frame !== slipFrame) { slipFrame = ctx.clock.frame; ctx.events.emit('climb:slip', {}); }
          input.haptic(hd, 0.3, 60); release(hd, 'slip');
          if (!P.climbing) return;
          continue;
        }
      }
      sprites.push(h.glowAt, 0.12, GLOW);
    }
    if (!P.climbing) return;
    if (v && !empty) v.spendStamina(Math.min(v.stamina, 3 * dt));
    // the body follows the leading hand (1:1): move the rig so that hand stays where it gripped
    if (lead) {
      const h = hold[lead];
      // assisted: the grip slides up the wall at 0.8 m/s (the body rises); PC: W / S
      let rise = assist ? 0.8 : 0;
      if (!ctx.flags.xr) { const V = input.virtual.state; rise = V.cadence > 0 ? (input.virtual.state.stick.left.y < -0.5 ? -0.8 : 0.9) : 0; }
      if (rise) { for (const hd of HANDS) if (hold[hd].on) { hold[hd].at.y += rise * dt; hold[hd].glowAt.y += rise * dt; } }
      handWorld(lead, _hw);
      rig.position.x += h.at.x - _hw.x;
      rig.position.y += h.at.y - _hw.y;
      rig.position.z += h.at.z - _hw.z;
      // never below the foot of the wall's ground
      let g = -1e9;
      try { g = ctx.world.groundAt(P.pos.x, P.pos.z, rig.position.y - 0.6); } catch { /* stub */ }   // (not a ledge above)
      if (rig.position.y < g) { const dy = g - rig.position.y; rig.position.y = g; for (const hd of HANDS) if (hold[hd].on) hold[hd].at.y += dy; }
    }
    keepOff(s);
    rig.updateMatrixWorld();
    // pulls: each rise of ≥ 0.25 m since the grip is one pull (+2 tailwind)
    for (const hd of HANDS) {
      const h = hold[hd];
      if (h.on && rig.position.y - h.pullFrom >= 0.25) { h.pullFrom = rig.position.y; if (v) v.addStamina(2); }
    }
    moveSpeed = Math.abs(rig.position.y - lastRigY) / dt;
    lastRigY = rig.position.y;
    P.climbSpeed = moveSpeed;
    // over the top: pulled 0.2 m above the edge
    if (headY() > s.y1 + 0.2) startMantle();
  }

  // ── PC: E at a wall grips with both hands (and E again lets go) ──
  function pcGrab() {
    if (P.climbing) { pcGrip = false; for (const hd of HANDS) release(hd); return true; }
    // a wall in front of the eyes, within 1 m: put both virtual hands on it
    const f = _d.set(0, 0, -1).applyQuaternion(input.head.quat).setY(0).normalize();
    for (let k = 0; k < 24; k++) {
      const step = 0.35 + (k % 4) * 0.2, up = [-0.1, 0.15, -0.35, 0.35, -0.6, 0.55][(k / 4) | 0];
      _p.copy(input.head.pos).addScaledVector(f, step); _p.y += up;
      if (!grabAt(_p)) continue;
      pcGrip = true;
      const s = grabOut.surface;
      for (const hd of HANDS) {
        const h = hold[hd];
        h.on = true; h.s = s; h.t = ctx.clock.time; h.since = 0; h.seq = ++seq;
        handWorld(hd, h.at);
        h.glowAt.copy(grabOut.point).addScaledVector(_hw.set(s.r.x, 0, s.r.z), hd === 'left' ? 0.25 : -0.25);
        h.pullFrom = ctx.rig.position.y;
        C.hands[hd] = true;
      }
      lead = 'right'; surf = s;
      ctx.events.emit('climb:grab', { hand: 'right', surfaceId: s.id, point: grabOut.point });
      setClimbing(true, s);
      return true;
    }
    return false;
  }

  // ── tests (AW.debug) ──
  function addTemp(o) {
    const id = o.id || 'climb_tmp_' + (temp.length + 1);
    const s = makeSurface(o, id);
    temp.push(s); tempById[id] = s;
    // a stand at the top exit, and a plain panel so it can be seen
    try { ctx.world.addPlatform?.({ x: s.topExit.x, z: s.topExit.z, r: 1.6, y: s.y1, surface: 'rock' }); } catch { /* stub */ }
    try {
      const H = s.y1 - s.y0;
      const g = new THREE.PlaneGeometry(s.width, H, 1, 1);
      const m = new THREE.Mesh(g, ctx.art.material({ color: 0x6f5a3c, side: THREE.DoubleSide }));
      m.position.set(s.x - s.n.x * 0.02, s.y0 + H / 2, s.z - s.n.z * 0.02);
      m.rotation.y = -s.yaw * DEG;
      m.name = 'climb-tmp';
      ctx.scene.add(m);
    } catch { /* no art */ }
    return id;
  }
  /** hang on surface id at height ratio (0..1) with both hands gripped */
  function debugClimb(id, ratio = 0) {
    const s = byId(id);
    if (!s) return false;
    for (const hd of HANDS) release(hd);
    mantle = null;
    const H = s.y1 - s.y0;
    const v = Math.max(0.2, Math.min(H, ratio * H));
    // stand the head 0.35 m off the face with the grip at hand height
    const hx = s.x + s.n.x * 0.35, hz = s.z + s.n.z * 0.35;
    const yawDeg = ((Math.atan2(-s.n.x, s.n.z) / DEG) + 360) % 360;   // facing the wall (−n)
    let g = -1e9;
    try { g = ctx.world.groundAt(hx, hz, s.y0 + v); } catch { /* stub */ }
    P.teleport(hx, hz, yawDeg, Math.max(g, s.y0 + v - P.standHeight + 0.15));   // (feet never below the ground)
    ctx.rig.updateMatrixWorld();
    input.head.pos.copy(input.head.localPos).applyMatrix4(ctx.rig.matrixWorld);
    for (const hd of HANDS) {
      const h = hold[hd];
      h.on = true; h.s = s; h.t = ctx.clock.time; h.since = 0; h.seq = ++seq;
      handWorld(hd, h.at);
      h.glowAt.copy(h.at);
      h.pullFrom = ctx.rig.position.y;
      C.hands[hd] = true;
    }
    lead = 'right'; surf = s;
    pcGrip = false;                     // (as if both real hands gripped: tailwind rules apply)
    setClimbing(true, s);
    return true;
  }
  /** one pull of dy (m): the leading hand pulled down dy, the other hand regrips above (tests) */
  function debugPull(dy = 0.4) {
    if (!P.climbing || !surf) return false;
    const s = surf;
    ctx.rig.position.y += dy;
    for (const hd of HANDS) if (hold[hd].on) { hold[hd].at.y += dy; hold[hd].glowAt.y += dy; }
    ctx.rig.updateMatrixWorld();
    const v = stamina();
    if (v && dy >= 0.25) v.addStamina(2);
    for (const hd of HANDS) hold[hd].pullFrom = ctx.rig.position.y;
    input.head.pos.copy(input.head.localPos).applyMatrix4(ctx.rig.matrixWorld);
    P.pos.y = ctx.rig.position.y;
    if (headY() > s.y1 + 0.2) startMantle();
    return true;
  }

  /** tests / shots: re-anchor the gripping hands where they are now (after moving virtual hands onto the wall) */
  function regrip() {
    if (!P.climbing) return false;
    for (const hd of HANDS) { const h = hold[hd]; if (h.on) { handWorld(hd, h.at); h.glowAt.copy(h.at); } }
    return true;
  }

  return {
    update, tryGrip, release, pcGrab, regrip,
    isHolding: (hand) => hold[hand].on,
    get moveSpeed() { return moveSpeed; },
    addTemp, debugClimb, debugPull, grabAt: (p, out) => { const ok = grabAt(p); if (ok && out) Object.assign(out, { id: grabOut.id, point: grabOut.point.clone(), normal: grabOut.normal.clone() }); return ok; },
    surfaces: () => [...(worldClimb()?.list || []), ...temp],
  };
}
