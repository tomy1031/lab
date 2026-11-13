// js/player/comfort.js — comfort aids (§2.8), OPUS-A: speed/turn/fall vignette (setting 0 none, 1 weak,
// 2 strong) as one ring mesh in front of the eyes, and the play-space centre ring on the floor that appears
// when the head is ≥ 0.45 m from the centre. Two draw calls at most, no allocation per frame.
import * as THREE from 'three';
import { clamp, ema } from '../core/util.js';

function vignetteGeometry() {
  // three rings of vertices: inner (clear) → mid (dark) → outer (opaque), radius in units of the inner hole
  const seg = 40;
  const radii = [1.0, 1.6, 6.0], alpha = [0, 0.85, 1];
  const pos = [], col = [], idx = [];
  for (let r = 0; r < radii.length; r++) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * radii[r], Math.sin(a) * radii[r], 0);
      col.push(0.02, 0.03, 0.08, alpha[r]);
    }
  }
  for (let r = 0; r < radii.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      const a = r * seg + i, b = r * seg + ((i + 1) % seg), c = (r + 1) * seg + i, d = (r + 1) * seg + ((i + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

export function createComfort(ctx, P) {
  const input = ctx.input;
  const vMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, fog: false });
  const vig = new THREE.Mesh(vignetteGeometry(), vMat);
  vig.name = 'vignette';
  vig.renderOrder = 999;
  vig.frustumCulled = false;
  vig.position.z = -0.12;
  vig.visible = false;
  ctx.camera.add(vig);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.38, 32, 1), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.name = 'center-ring';
  ring.visible = false;
  ring.renderOrder = 3;
  ctx.rig.add(ring);
  let amount = 0, turnKick = 0, pulse = 0, lastTurn = 0;
  ctx.events.on('player:turn', () => { turnKick = 1; });

  function update(dt) {
    const setting = ctx.settings.get('vignette');
    const rdt = dt > 0 ? dt : (ctx.clock.dt || 0.016);
    turnKick = Math.max(0, turnKick - rdt * 4);
    // how much motion the eyes see that the body doesn't feel
    const moveK = clamp((P.speed - 0.4) / 5.0, 0, 1);
    const fallK = !P.grounded ? clamp(-P.vel.y / 8, 0, 1) : 0;
    const glideK = P.glideBlend || 0;
    let want = Math.max(moveK * 0.85, turnKick * 0.6, fallK, glideK * 0.9);
    if (setting === 0) want = 0;
    if (!ctx.flags.xr) want *= 0.5;          // flat screen: a lighter touch
    if (ctx.paused) want = 0;
    amount += (want - amount) * ema(want > amount ? 0.12 : 0.35, rdt);
    if (amount < 0.02) { vig.visible = false; }
    else {
      vig.visible = true;
      // inner hole radius at z=-0.12: weak keeps most of the view, strong narrows to a tunnel
      const strong = setting === 2;
      const minR = strong ? 0.055 : 0.085, maxR = 0.2;
      const r = maxR + (minR - maxR) * amount;
      vig.scale.set(r, r, 1);
    }

    // centre ring: the head drifted ≥ 0.45 m from the play-space centre
    const dx = input.head.localPos.x - P.center.x, dz = input.head.localPos.z - P.center.z;
    const off = Math.hypot(dx, dz);
    const show = off >= 0.45 && ctx.flags.xr;
    ring.visible = show;
    if (show) {
      pulse += rdt * 3;
      ring.position.set(P.center.x, 0.02, P.center.z);
      ringMat.opacity = 0.45 + 0.25 * Math.sin(pulse);
    }
  }
  return { update, vignette: vig, ring };
}
