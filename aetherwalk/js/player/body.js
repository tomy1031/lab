// js/player/body.js — the body against the world (§10.8 "体と地形の衝突"), OPUS-A.
// Horizontal: wanted velocity (+ knockback, + glide) → blocked by world edge / deep water / steep uphill /
// edge guard → world.resolveCircle(0.3). Physical head motion in the play space is applied as-is (the rig
// does not move for it) but still collides. Vertical: follow world.groundAt with τ=0.08 s; fall with
// gravity (terminal 12 m/s) or glide (1.5 m/s down, 6 m/s forward). Also: hitTest for enemy attacks (§5.3).
// Jump (DESIGN_V2 §3.1): A / Space, 4.3 m/s up (×1.1 with tailwind II) → apex 0.95 m, 0.88 s in the air; the
// run-up speed is kept and can be bent toward the head's direction at ≤ 1.5 m/s²; 0.12 s of coyote time after
// walking off an edge, a press up to 0.1 s before landing jumps on landing, repeats from 0.25 s after landing.
// Not on a lift or in the still field (speedMul < 0.01), not while climbing. jumpView 'soft' halves what the
// eyes see of the rise (movement and hits are unchanged).
import * as THREE from 'three';
import { clamp, ema, DEG } from '../core/util.js';

const _hw = new THREE.Vector3();
const _out = { x: 0, z: 0 };

export function createBody(ctx, P) {
  const input = ctx.input;
  const B = {
    vy: 0, fallStartY: 0,
    imp: new THREE.Vector3(),          // knockback velocity (decays, ≤ 0.5 m in total)
    lastSafe: new THREE.Vector3(),
    blocked: '',
    // jump
    jumped: false, coyoteT: 9, landT: 9, bufT: 0, takeoffY: 0, viewDrop: 0,
    air: new THREE.Vector3(),          // horizontal velocity in a jump
  };
  const _jumpEv = { vy: 0 };

  function jumpBlocked() {
    if (!P.enabled || P.climbing || P.noJump) return true;
    const v = ctx.game?.vitals;
    return !!(v && !ctx.game.isStub && Number.isFinite(v.speedMul) && v.speedMul < 0.01);   // lift / still field
  }
  function canJumpNow(fromBuffer = false) {
    if (jumpBlocked()) return false;
    if (P.grounded) return fromBuffer || B.landT >= 0.25;
    return !B.jumped && B.coyoteT <= 0.12;            // just walked off an edge
  }
  function doJump() {
    const tier = ctx.game?.vitals?.tier | 0;
    B.vy = 4.3 * (tier >= 2 ? 1.1 : 1);
    P.grounded = false;
    B.jumped = true; B.bufT = 0; B.coyoteT = 9;
    B.fallStartY = P.pos.y; B.takeoffY = P.pos.y;
    B.air.set(P.wantVel.x, 0, P.wantVel.z);          // the run-up speed carries on
    _jumpEv.vy = B.vy;
    ctx.events.emit('player:jump', _jumpEv);
  }
  /** A / Space: jump now (true) or remember the press for 0.1 s (false) */
  function jump() {
    if (canJumpNow()) { doJump(); return true; }
    if (!jumpBlocked()) B.bufT = 0.1;
    return false;
  }

  function allowed(x, z, dirx, dirz, y) {
    const w = ctx.world;
    if (Math.abs(x) > 780 || Math.abs(z) > 780) { B.blocked = 'edge-of-world'; return false; }
    try {
      if (w.waterDepthAt(x, z) >= 1.1) { B.blocked = 'deep-water'; return false; }
      const h0 = w.heightAt(P.pos.x, P.pos.z);
      if (P.grounded && P.pos.y < h0 + 0.3) {
        const h1 = w.heightAt(x + dirx * 0.3, z + dirz * 0.3);
        const ang = Math.atan2(h1 - h0, Math.hypot(x + dirx * 0.3 - P.pos.x, z + dirz * 0.3 - P.pos.z) || 0.3) / DEG;
        if (ang > 42) { B.blocked = 'steep'; return false; }
      }
      if (P.grounded && ctx.settings.get('edgeGuard') && !P.armsSpread) {
        const g = w.groundAt(x + dirx * 0.35, z + dirz * 0.35, y);
        if (g < y - 4) { B.blocked = 'edge'; return false; }
      }
    } catch { /* stub world */ }
    return true;
  }

  function update(dt) {
    const rig = ctx.rig;
    const w = ctx.world;
    rig.updateMatrixWorld();
    _hw.copy(input.head.localPos).applyMatrix4(rig.matrixWorld);
    const fx = _hw.x, fz = _hw.z;           // feet = under the head (includes physical head motion)
    if (dt <= 0) { P.pos.x = fx; P.pos.z = fz; P.vel.set(0, 0, 0); return; }

    // jump timers / a remembered press
    if (P.grounded) B.landT += dt; else if (!B.jumped) B.coyoteT += dt;
    if (B.bufT > 0) { B.bufT -= dt; if (canJumpNow()) doJump(); }

    // horizontal motion
    let vx = P.wantVel.x + B.imp.x, vz = P.wantVel.z + B.imp.z;
    if (B.jumped && !P.grounded) {
      // in a jump: the take-off velocity, bent toward where the head looks (≤ 1.5 m/s², speed kept)
      const s0 = Math.hypot(B.air.x, B.air.z);
      if (s0 > 0.05) {
        const hy = input.head.yaw;
        let dx = Math.sin(hy) * s0 - B.air.x, dz = -Math.cos(hy) * s0 - B.air.z;
        const L = Math.hypot(dx, dz), m = 1.5 * dt;
        if (L > m) { dx *= m / L; dz *= m / L; }
        B.air.x += dx; B.air.z += dz;
      }
      vx = B.air.x + B.imp.x; vz = B.air.z + B.imp.z;
    }
    if (P.gliding) {
      vx = Math.sin(P.yaw) * 6 + B.imp.x;
      vz = -Math.cos(P.yaw) * 6 + B.imp.z;
    }
    let mx = vx * dt, mz = vz * dt;
    B.blocked = '';
    const sp = Math.hypot(mx, mz);
    if (sp > 1e-6) {
      const dx = mx / sp, dz = mz / sp;
      if (!allowed(fx + mx, fz + mz, dx, dz, P.pos.y)) {
        // slide along an axis if possible
        if (Math.abs(mx) > 1e-6 && allowed(fx + mx, fz, Math.sign(mx), 0, P.pos.y)) mz = 0;
        else if (Math.abs(mz) > 1e-6 && allowed(fx, fz + mz, 0, Math.sign(mz), P.pos.y)) mx = 0;
        else { mx = 0; mz = 0; }
      }
    }
    let cx = fx + mx, cz = fz + mz;
    try {
      if (w.resolveCircle(cx, cz, 0.3, _out)) { cx = _out.x; cz = _out.z; }
    } catch { /* stub */ }
    rig.position.x += cx - fx;
    rig.position.z += cz - fz;
    P.vel.x = (cx - P.pos.x) / dt;
    P.vel.z = (cz - P.pos.z) / dt;
    // the physical part of that (head motion) is not locomotion: report only the commanded part
    P.vel.x = mx / dt; P.vel.z = mz / dt;
    P.pos.x = cx; P.pos.z = cz;
    B.imp.multiplyScalar(Math.exp(-dt / 0.12));

    // vertical
    let g;
    try { g = w.groundAt(cx, cz, P.pos.y); } catch { g = P.pos.y; }
    if (!Number.isFinite(g)) g = P.pos.y;
    if (P.grounded) {
      if (g < P.pos.y - 0.6) {
        P.grounded = false; B.vy = 0; B.fallStartY = P.pos.y; B.coyoteT = 0; B.jumped = false;
      } else {
        P.pos.y += (g - P.pos.y) * ema(0.08, dt);
        if (Math.abs(g - P.pos.y) < 0.003) P.pos.y = g;
        B.vy = 0;
      }
    }
    if (!P.grounded) {
      if (P.gliding) { B.vy += ((P.glideTired ? -3 : -1.5) - B.vy) * ema(0.25, dt); P.pos.y += B.vy * dt; }
      else {
        // exact parabola per step (apex 0.95 m whatever the frame rate), terminal speed 12 m/s
        const v1 = Math.max(B.vy - 9.8 * dt, -12);
        P.pos.y += (B.vy + v1) * 0.5 * dt;
        B.vy = v1;
      }
      try { g = w.groundAt(cx, cz, P.pos.y); } catch { /* keep */ }
      if (P.pos.y < g && B.vy > 0) P.pos.y = g;                // rising into a slope: ride over it
      if (P.pos.y <= g && B.vy <= 0) {
        P.pos.y = g;
        P.grounded = true;
        const fall = Math.max(0, B.fallStartY - g);
        B.vy = 0;
        B.jumped = false; B.landT = 0;
        ctx.events.emit('player:land', { fall });
        if (fall >= 2) {
          // a big drop: dust and a bump in both hands (no damage, v1)
          try { ctx.world?.fx?.emit?.('dust', _hw.set(cx, g + 0.05, cz), { count: 10 }); } catch { /* stub */ }
          input.haptic('left', 0.45, 40); input.haptic('right', 0.45, 40);
        }
        if (B.bufT > 0 && canJumpNow(true)) doJump();          // pressed just before landing
      }
    }
    P.vel.y = B.vy;
    // deep water / out of bounds after a fall: walk back to the last safe spot
    let safe = true;
    try { safe = w.waterDepthAt(cx, cz) < 1.1 && Math.abs(cx) <= 780 && Math.abs(cz) <= 780; } catch { /* stub */ }
    if (P.grounded && safe) B.lastSafe.set(cx, P.pos.y, cz);
    else if (P.grounded && !safe) {
      const k = Math.min(1, (3 * dt) / Math.max(0.01, Math.hypot(B.lastSafe.x - cx, B.lastSafe.z - cz)));
      rig.position.x += (B.lastSafe.x - cx) * k;
      rig.position.z += (B.lastSafe.z - cz) * k;
    }
    // jumpView 'soft': the eyes see half of the rise above the take-off (eased back on landing)
    const soft = ctx.settings.get('jumpView') === 'soft';
    const wantDrop = soft && B.jumped && !P.grounded ? 0.5 * Math.max(0, P.pos.y - B.takeoffY) : 0;
    B.viewDrop += (wantDrop - B.viewDrop) * (wantDrop > B.viewDrop ? 1 : ema(0.1, dt));
    rig.position.y = P.pos.y - B.viewDrop;
    rig.updateMatrixWorld();
  }

  // §5.3 attack shapes: true = the attack reaches the body (not dodged)
  function hitTest(shape) {
    if (!shape) return false;
    const head = P.body.headPos;
    switch (shape.kind) {
      case 'high':
        return head.y >= shape.y;
      case 'line': {
        const x = P.pos.x, z = P.pos.z;
        const ax = shape.x0, az = shape.z0, bx = shape.x1, bz = shape.z1;
        const dx = bx - ax, dz = bz - az;
        const L = dx * dx + dz * dz;
        const t = L > 1e-9 ? clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1) : 0;
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        return d <= (shape.halfWidth ?? 0.5);
      }
      case 'sphere': {
        const c = shape.center;
        if (!c) return false;
        // capsule from knees to head
        const ay = P.pos.y + 0.4, by = head.y;
        const t = by > ay ? clamp((c.y - ay) / (by - ay), 0, 1) : 0;
        const px = P.pos.x + (head.x - P.pos.x) * t, py = ay + (by - ay) * t, pz = P.pos.z + (head.z - P.pos.z) * t;
        const d = Math.hypot(c.x - px, c.y - py, c.z - pz);
        return d <= (shape.radius ?? 0.3) + P.body.radius;
      }
      default:
        return true;
    }
  }

  function addImpulse(vx, vz) {
    if (!ctx.settings.get('knockback')) return;
    B.imp.x += vx; B.imp.z += vz;
    // total displacement of a decaying impulse = |v|·τ → cap at 0.5 m
    const max = 0.5 / 0.12;
    const L = Math.hypot(B.imp.x, B.imp.z);
    if (L > max) { B.imp.x *= max / L; B.imp.z *= max / L; }
  }

  return { B, update, hitTest, addImpulse, jump, canJump: () => canJumpNow() };
}
