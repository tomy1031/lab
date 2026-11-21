// js/motion.js — moving a body on the court like a person: top speed, acceleration, braking, and aiming to
// stop on the target (or arrive still moving when late). Shared by your auto / stepping / stick movement and
// the CPU, so both obey the same limits.

/**
 * s: { x, z, vx, vz } (mutated). target: { x, z } or null (brake to a stop).
 * speedCap: the speed allowed right now (≤ vmax: e.g. from the stepping cadence). Returns the distance left.
 */
export function moveToward(s, target, dt, vmax, accel, decel, speedCap = vmax) {
  let dvx, dvz, dist = 0;
  if (target) {
    const dx = target.x - s.x, dz = target.z - s.z;
    dist = Math.hypot(dx, dz);
    if (dist < 0.015) { dvx = -s.vx; dvz = -s.vz; }
    else {
      // fastest speed from which we can still brake to a stop on the target
      const vStop = Math.sqrt(2 * decel * Math.max(0, dist - 0.01));
      const v = Math.min(vmax, speedCap, vStop);
      dvx = (dx / dist) * v - s.vx; dvz = (dz / dist) * v - s.vz;
    }
  } else { dvx = -s.vx; dvz = -s.vz; }
  applyDv(s, dvx, dvz, dt, accel, decel);
  s.x += s.vx * dt; s.z += s.vz * dt;
  return dist;
}

/** drive with a wanted velocity (stick); same limits */
export function moveVelocity(s, wvx, wvz, dt, vmax, accel, decel) {
  const w = Math.hypot(wvx, wvz);
  if (w > vmax) { wvx *= vmax / w; wvz *= vmax / w; }
  applyDv(s, wvx - s.vx, wvz - s.vz, dt, accel, decel);
  s.x += s.vx * dt; s.z += s.vz * dt;
}

function applyDv(s, dvx, dvz, dt, accel, decel) {
  const dv = Math.hypot(dvx, dvz);
  if (dv < 1e-9) return;
  // speeding up uses the acceleration limit, slowing down / turning the braking limit
  const v = Math.hypot(s.vx, s.vz);
  const along = v > 1e-6 ? (dvx * s.vx + dvz * s.vz) / v : dv;
  const lim = (along >= 0 ? accel : decel) * dt;
  const k = dv > lim ? lim / dv : 1;
  s.vx += dvx * k; s.vz += dvz * k;
}

/** keep a body inside the stadium (the playing area plus run-off), and on its own half */
export function clampToArea(s, side) {
  const X = 9.8, Zmax = 17.6, Zmin = 0.35;
  if (s.x < -X) { s.x = -X; s.vx = Math.max(0, s.vx); }
  if (s.x > X) { s.x = X; s.vx = Math.min(0, s.vx); }
  const z = s.z * side;
  if (z < Zmin) { s.z = Zmin * side; if (s.vz * side < 0) s.vz = 0; }
  if (z > Zmax) { s.z = Zmax * side; if (s.vz * side > 0) s.vz = 0; }
}
