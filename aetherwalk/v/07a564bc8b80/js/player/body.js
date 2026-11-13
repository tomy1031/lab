// js/player/body.js — the body against the world (§10.8 "体と地形の衝突"), OPUS-A.
// Horizontal: wanted velocity (+ knockback, + glide) → blocked by world edge / deep water / steep uphill /
// edge guard → world.resolveCircle(0.3). Physical head motion in the play space is applied as-is (the rig
// does not move for it) but still collides. Vertical: follow world.groundAt with τ=0.08 s; fall with
// gravity (terminal 12 m/s) or glide (1.5 m/s down, 6 m/s forward). Also: hitTest for enemy attacks (§5.3).
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
  };

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

    // horizontal motion
    let vx = P.wantVel.x + B.imp.x, vz = P.wantVel.z + B.imp.z;
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
        P.grounded = false; B.vy = 0; B.fallStartY = P.pos.y;
      } else {
        P.pos.y += (g - P.pos.y) * ema(0.08, dt);
        if (Math.abs(g - P.pos.y) < 0.003) P.pos.y = g;
        B.vy = 0;
      }
    }
    if (!P.grounded) {
      if (P.gliding) B.vy += ((P.glideTired ? -3 : -1.5) - B.vy) * ema(0.25, dt);
      else B.vy = Math.max(B.vy - 9.8 * dt, -12);
      P.pos.y += B.vy * dt;
      try { g = w.groundAt(cx, cz, P.pos.y); } catch { /* keep */ }
      if (P.pos.y <= g) {
        P.pos.y = g;
        P.grounded = true;
        const fall = Math.max(0, B.fallStartY - g);
        B.vy = 0;
        ctx.events.emit('player:land', { fall });
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
    rig.position.y = P.pos.y;
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

  return { B, update, hitTest, addImpulse };
}
